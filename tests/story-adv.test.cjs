const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const ADV_KEY = 'battleAlaCarteStoryAdvV1', PROGRESS_KEY = 'battleAlaCarteStoryProgressV1';


// Only the owner's coordinate-specific review table may relax source equality.
function storyReview() {
    const changes = new Map(), effects = new Map();
    for (const row of read('docs/story/emphasis-changes-20261004.md').split(/\r?\n/)) {
        const c = row.split('|').map(x => x.trim());
        if (!/^[EV]\d+$/.test(c[1] || '')) continue;
        const key = c[2].match(/^第(\d+)話$/)[1] + '/' + c[3];
        const target = c[1][0] === 'E' ? changes : effects;
        assert.equal(target.has(key), false, 'duplicate review coordinate: ' + key);
        target.set(key, c[1][0] === 'E' ? { before: c[5], after: c[6] } :
            Object.fromEntries(['motion', 'mark', 'screen', 'se'].map((f, i) => [f, c[i + 6]]).filter(([, v]) => v !== '—')));
    }
    return { changes, effects };
}
function reviewedLines(number, scene, lines) {
    const review = storyReview();
    return clone(lines).map((line, i) => {
        const key = number + '/' + scene + ':' + (i + 1), edit = review.changes.get(key), fx = review.effects.get(key);
        if (edit) { assert.equal(line.text, edit.after, key); line.text = edit.before; }
        if (fx) for (const [field, value] of Object.entries(fx)) { assert.equal(line[field], value, key); delete line[field]; }
        return line;
    });
}

// Small offline DOM/timer harness, matching the VM tests used by the existing game.
function runtime({ mobile = false, reduced = true, save = {}, main = false, storageBlocked = false, imageBehavior = {} } = {}) {
    const elements = new Map(), jobs = new Map(), requests = [], warnings = [], calls = [], store = new Map(Object.entries(save));
    let now = 0, sequence = 0, dateSequence = 0;
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag; this.children = []; this.dataset = {};
            this.style = { setProperty(name, value) { this[name] = value; } }; this.hidden = false;
            this.className = ''; this.attributes = {}; this.listeners = {}; this.textContent = ''; this.scrollTop = 0;
            this.classList = {
                contains: cls => this.className.split(/\s+/).includes(cls),
                add: (...cls) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...cls])].join(' '); },
                remove: (...cls) => { this.className = this.className.split(/\s+/).filter(x => !cls.includes(x)).join(' '); },
                toggle: (cls, on) => { if (on) this.classList.add(cls); else this.classList.remove(cls); }
            };
        }
        set id(value) { this._id = value; elements.set(value, this); }
        get id() { return this._id; }
        set src(value) { this._src = value; requests.push(value); }
        get src() { return this._src; }
        set innerHTML(html) {
            this.html = html;
            this.children = [];
            for (const [, tag, attrs] of html.matchAll(/<([a-z]+)\b([^>]*)>/g)) {
                const id = attrs.match(/\bid="([^"]+)"/);
                if (!id && !/\bclass="/.test(attrs)) continue;
                const node = new Element(tag); if (id) node.id = id[1];
                node.className = attrs.match(/\bclass="([^"]+)"/)?.[1] || '';
                node.hidden = /\bhidden(?:\s|$)/.test(attrs); this.appendChild(node);
            }
        }
        appendChild(node) { node.parent = this; this.children.push(node); return node; }
        append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
        replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name] || ''; }
        addEventListener(name, fn) { this.listeners[name] = fn; }
        focus() { document.activeElement = this; }
        closest() { return null; }
        querySelector(selector) {
            const className = selector.slice(1);
            return this.children.find(node => node.classList?.contains(className)) || null;
        }
        getBoundingClientRect() { return { height: 62 }; }
    }
    const document = { currentScript: null, readyState: 'loading', visibilityState: 'visible', listeners: {},
        getElementById: id => elements.get(id) || null, querySelectorAll: () => [], querySelector: () => null,
        createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }), body: new Element('body'),
        addEventListener(name, fn) { this.listeners[name] = fn; }
    };
    const overlay = new Element(); overlay.id = 'start-overlay'; overlay.classList.add('hidden');
    const preloaded = [];
    class FakeImage {
        constructor() {
            this.complete = false; this.naturalWidth = 0; preloaded.push(this);
            if (imageBehavior.decode) this.decode = () => imageBehavior.decode(this);
        }
        set src(value) {
            this._src = value; requests.push(value);
            if (imageBehavior.load) imageBehavior.load(this);
            else { this.complete = true; this.naturalWidth = 1; this.onload?.(); }
        }
        get src() { return this._src; }
    }
    const c = vm.createContext({ console: { log() {}, warn: text => warnings.push(text), error: text => warnings.push(text) },
        document, Image: FakeImage, URL, Math, performance: { now: () => now }, Date: class extends Date { static now() { return 100000 + now + dateSequence++; } },
        setTimeout(callback, delay = 0) { const id = ++sequence; jobs.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => jobs.delete(id), setInterval: () => 0, clearInterval() {},
        localStorage: {
            getItem(key) { if (storageBlocked) throw Error('blocked'); return store.get(key) || null; },
            setItem(key, value) { if (storageBlocked) throw Error('blocked'); store.set(key, value); }
        }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, matchMedia: () => ({ matches: reduced })
    });
    c.window = c;
    const load = file => vm.runInContext(read(file), c, { filename: file });
    for (const file of ['story-data/characters.js', 'story-data/registry.js', ...[4, 5, 6, 7, 8, 9, 10].map(n => `story-data/episode${n}.js`)]) load(file);
    vm.runInContext(read('story-adv.js').replace(/\}\)\(window\);\s*$/, 'root.__advTest = { S, saved, advance, renderCurrent, renderActors, enterScene, stageLine, savePosition, chooseBattle, clearEpisode, openLog, toggleAuto, episodeImages, imageCache, pausePlayback, resumePlayback, askSkip, skipToStop, toggleFastForward };\n})(window);'), c);
    vm.runInContext(read('story-mode.js').replace(/\}\)\(\);\s*$/, 'window.__legacyTest = { S, EPISODES, init, startIntro, beginPost, openSelection, onBattleStateUpdated, installGuards, renderEpisodeList, loadProgress, saveProgress, startBattle, handleStoryBattleEnded };\n})();'), c);
    Object.assign(c, {
        playStoryBGM: character => { c.lastStoryThemeCharacter = character; calls.push('story-bgm'); }, playStoryCue: kind => calls.push(kind),
        playStoryDialogueSound: () => calls.push('dialogue'), stopStoryCues() {},
        openStorySkillChoice: (episode, onStart, onBack) => { c.choice = { episode, onStart, onBack }; calls.push('skill-choice'); },
        openStoryStage: () => { c.StoryAdv.abandonBattle(); c.StoryAdv.stop(); calls.push('story-select'); }
    });
    if (main) {
        for (const name of ['cards', 'state', 'rules', 'player', 'cpu', 'main']) load(mobile ? `mobile/${name}-sp.js` : `${name}.js`);
        c.__normalFinale = c.prepareMatchFinale;
        c.__normalHideResult = c.hideResultOverlay;
        load('battle-view-model.js'); load('battle-images.js');
        Object.assign(c, { safeStartGame: () => { calls.push('init-normal'); c.initGame(); vm.runInContext('gameStartedOnce = true', c); },
            startBgmOnce() {}, unlockAudio() {}, stopBGM() {}, addLog: text => calls.push(text), updateUI() {},
            stopMenuFloatingBackground() {}, hideResultOverlay() {}, hideSpotlightCard() {}, closePackShop() {},
            enablePlayerControls() {}, disablePlayerControls() {}, pushMatchExitGuardHistory() {}, saveMatchSnapshot() {},
            clearSavedMatch() {}, setCPUStatus() {}, hideDiscardBanner() {}, prepareMatchFinale() {}, cpuTurn() {},
            recordMatchResult() {}, setBattleModeBgmLocked() {}, applyRuntimeSettings() {} });
    }
    async function tick(ms) {
        const until = now + ms;
        for (;;) {
            const entry = [...jobs].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            const [id, job] = entry; now = job.at; jobs.delete(id); job.callback();
            for (let i = 0; i < 8; i++) await Promise.resolve();
        }
        now = until;
        for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    return { c, elements, jobs, requests, warnings, calls, store, tick, load, Element, preloaded };
}

function tutorialRuntime(options = {}) {
    const r = runtime({ main: true, ...options });
    for (const id of ['story-dialogue-panel', 'story-primary-button', 'story-secondary-button',
        'story-episode-list', 'story-stage-subtitle', 'story-stage-message', 'story-hud-panel',
        'story-hud-note', 'story-hud-title', 'story-hud-objectives', 'story-objective-list',
        'story-objective-note', 'story-battle-guide']) {
        const element = new r.Element(); element.id = id;
    }
    r.c.__legacyTest.init();
    return r;
}

for (const mobile of [false, true]) test(`${mobile ? 'phone' : 'PC'}: every direct ADV episode start/resume waits for the character notice`, async () => {
    for (const number of [4, 5, 6, 7, 8, 9, 10]) {
        for (const resume of [false, true]) {
            const r = runtime({ mobile }), { c, elements, Element } = r;
            const dialog = new Element(); dialog.id = 'character-notice-dialog'; dialog.open = false;
            dialog.showModal = () => { dialog.open = true; };
            dialog.close = () => { dialog.open = false; };
            const confirm = new Element('button'); confirm.id = 'character-notice-confirm';
            const link = new Element('button'); link.id = 'story-character-notice-link';
            c.__legacyTest.init();
            await c.StoryAdv.start('episode' + number, resume);
            assert.equal(dialog.open, true); assert.equal(c.__advTest.S.active, false);
            assert.equal(elements.has('story-adv'), false);
            confirm.listeners.click();
            assert.equal(dialog.open, false); assert.equal(c.__advTest.S.active, true);
            assert.equal(c.__advTest.S.episode.id, 'episode' + number);
            assert.equal(r.store.get('battleAlaCarteCharacterNotice20261004'), '1');
            c.StoryAdv.stop();
        }
    }
});

test('tutorial dialogue, expressions, backgrounds and summaries match every approved line in order', () => {
    const { c } = runtime();
    const nameIds = { 舞依: 'mai', 拓海: 'takumi', 千鶴: 'chizuru', 暁: 'akatsuki', 剛: 'tsuyoshi', 栞那: 'kanna' };
    const stages = { 開始前: 'pre', 勝利後: 'postWin', 敗北後: 'postLose' };
    let count = 0;
    for (const episode of c.__legacyTest.EPISODES) {
        const number = Number(episode.id.slice(-1));
        const section = read('docs/story/tutorial-rewrite.md').split(`## 第${number}話 `)[1].split(/\r?\n## /)[0];
        assert.equal(episode.summary, section.match(/^紹介文：(.*)$/m)[1].trim());
        assert.equal(episode.background, section.match(/^背景：`([^`]+)`/m)[1]);
        assert.equal(episode.arc, 'reunion');
        assert.equal(episode.protagonist, number === 3 ? 'chizuru' : 'takumi');
        for (const [heading, stage] of Object.entries(stages)) {
            const body = section.split(`### ${heading}`)[1]?.split(/\r?\n### /)[0];
            if (!body) { assert.equal(episode[stage], undefined); continue; }
            const expected = [...body.matchAll(/^(.+?)（([^）]+)）「(.*?)」([^\r\n]*)/gm)].map(([, speaker, expression, text, note]) =>
                note.includes('システム案内') ? { speaker: 'narration', name: 'ナレーション', text } :
                    { speaker: nameIds[speaker], expression, text });
            assert.deepEqual(reviewedLines(number, stage, episode[stage]), expected, `${episode.id}/${stage}`);
            for (const line of episode[stage]) {
                count++;
                assert.doesNotMatch(line.text, /。$/);
                if (line.speaker === 'narration') continue;
                assert.ok(c.BattleStoryAssets.characters[line.speaker].portraits[line.expression]);
            }
        }
    }
    assert.equal(count, 54);
});

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    for (const number of [1, 2, 3]) test(`${label}: tutorial${number} ADV hands over to the original fixed battle`, async () => {
        const resume = { episodeId: 'episode8', sceneId: 'scene2', lineIndex: 3, stage: 'pre' };
        const { c, elements, tick, store, warnings, calls, requests } = tutorialRuntime({ mobile, save: {
            [PROGRESS_KEY]: JSON.stringify({ episode1: true, episode2: true, future: 'keep' }),
            [ADV_KEY]: JSON.stringify({ version: 1, auto: false, resume })
        } });
        const episode = c.__legacyTest.EPISODES[number - 1];
        c.__legacyTest.startIntro(episode.id); await tick(0);
        assert.equal(elements.get('story-adv').hidden, false);
        assert.ok(elements.get('story-dialogue-panel').classList.contains('hidden'));
        assert.equal(elements.get('adv-text').textContent, episode.pre[0].text);
        assert.ok(elements.get('adv-episode-label').textContent.includes('再会編'));
        assert.ok(elements.get('adv-background').style.backgroundImage.includes(episode.background + '.webp'));
        assert.equal(c.__legacyTest.S.battleActive, false);
        for (const line of episode.pre) {
            const current = c.__advTest.S.episode.scenes[0].lines[c.__advTest.S.lineIndex];
            assert.equal(elements.get('adv-text').textContent, line.text);
            assert.equal(elements.get('adv-name').textContent, line.name || c.BattleStoryAssets.characters[line.speaker].name);
            if (line.speaker !== 'narration') {
                assert.equal(c.__advTest.S.actors.get(line.speaker).position, line.speaker === episode.protagonist ? 'right' : 'left');
                assert.equal(current.expression, line.expression);
                const portrait = elements.get('adv-portraits').children.find(p => p.dataset.actor === line.speaker && !p.classList.contains('leaving'));
                assert.equal(portrait.children[0].src, c.BattleStoryAssets.portraitPath(line.speaker, line.expression));
            }
            c.__advTest.advance(); await tick(0);
        }
        assert.equal(elements.get('adv-ending').hidden, false);
        assert.deepEqual(elements.get('adv-ending').children.map(b => b.textContent), ['チュートリアル対戦へ', 'エピソード選択へ']);
        assert.equal(c.__legacyTest.S.battleActive, false, 'the conversation cannot auto-start a battle');
        elements.get('adv-ending').children[0].onclick();
        assert.equal(elements.get('story-adv').hidden, true);
        assert.equal(c.__legacyTest.S.battleActive, true);
        assert.equal(c.__advTest.S.battleActive, false);
        assert.ok(!calls.includes('skill-choice'));
        assert.equal(c.__storyActiveEpisodeId, episode.id);
        assert.equal(c.GameState.achievementStory, true);
        assert.deepEqual(clone(JSON.parse(store.get(ADV_KEY)).resume), resume);
        assert.deepEqual(clone(c.GameState.characterIds), { player: episode.protagonist, cpu: number === 3 ? 'akatsuki' : 'mai' });
        const p = c.GameState.players.player, cpu = c.GameState.players.cpu;
        assert.equal(c.GameState.currentTurn, number === 1 ? 'cpu' : 'player');
        assert.deepEqual(Array.from(p.hand, card => card.name), number === 2 ? ['ごはん', 'のり'] :
            number === 3 ? ['ごはん', 'のり', 'キャベツ', 'たまねぎ'] : ['ごはん', 'のり', '卵', 'にんじん']);
        assert.deepEqual(Array.from(p.events, card => card.name), number === 1 ? ['爆買い', 'ゴミ収集車'] : number === 2 ? ['爆買い'] : ['やり直し']);
        assert.equal(p.score, number === 2 ? 9 : number === 3 ? 4 : 0);
        assert.equal(cpu.score, number === 2 ? 8 : number === 3 ? 5 : 0);
        if (number === 3) {
            assert.deepEqual(Array.from(p.cookedRecipes, recipe => recipe.name), ['おにぎり', '卵かけごはん', '豚バラ大根', 'バナナジュース']);
            assert.ok(calls.includes('チュートリアル: 中盤から再開。暁が1点リード、千鶴は通常料理あと1品でMode発動。'));
            p.battleALaCarteModeActive = true; c.__legacyTest.onBattleStateUpdated();
            assert.equal(calls.filter(text => text === 'チュートリアル: Battle à la carte Mode 発動！').length, 1);
            c.__legacyTest.onBattleStateUpdated();
            assert.equal(calls.filter(text => text === 'チュートリアル: Battle à la carte Mode 発動！').length, 1);
            assert.equal(c.__legacyTest.S.objectives.modeOn, true);
        }
        assert.deepEqual(warnings, []);
        assert.ok(requests.every(file => c.BattleStoryAssets.paths().includes(file)));
    });

    for (const number of [1, 2, 3]) for (const winner of ['player', 'cpu']) test(`${label}: tutorial${number} ${winner} returns automatically to ADV and keeps tutorial results`, async () => {
        const { c, elements, tick, store } = tutorialRuntime({ mobile, save: {
            [PROGRESS_KEY]: JSON.stringify({ episode1: number > 1, episode2: number > 2, future: 7 })
        } });
        const episode = c.__legacyTest.EPISODES[number - 1];
        c.__legacyTest.startIntro(episode.id); await tick(0);
        c.__advTest.askSkip(); await c.__advTest.skipToStop();
        assert.equal(c.__legacyTest.S.battleActive, false);
        elements.get('adv-ending').children[0].onclick();
        c.__legacyTest.handleStoryBattleEnded(winner);
        assert.equal(c.__storyResultPending, true);
        assert.equal(c.__storyActiveEpisodeId, null);
        await tick(2899); assert.equal(elements.get('story-adv').hidden, true);
        await tick(1); assert.equal(elements.get('story-adv').hidden, false);
        assert.equal(c.__storyResultPending, false);
        const expected = winner === 'player' || !episode.postLose ? episode.postWin : episode.postLose;
        assert.equal(elements.get('adv-text').textContent, expected[0].text);
        assert.equal(!!c.BattleStoryProgress.load()[episode.id], winner === 'player');
        assert.equal(c.BattleStoryProgress.load().future, 7);
        assert.equal(c.__advTest.S.pending, null);
        c.__advTest.askSkip(); await c.__advTest.skipToStop();
        assert.deepEqual(clone(c.__advTest.S.backlog.map(l => l.text)), [...episode.pre, ...expected].map(l => l.text));
        assert.deepEqual(elements.get('adv-ending').children.map(b => b.textContent), winner === 'player'
            ? ['エピソード選択へ'] : ['この話を再挑戦', 'エピソード選択へ']);
        assert.ok(!elements.get('story-adv').classList.contains('adv-cleared'));
        assert.equal(c.__advTest.S.conversation !== null, true);
        assert.equal(store.has(ADV_KEY), false, 'tutorial playback introduces no new resume/progress writes');
        if (winner === 'cpu') {
            elements.get('adv-ending').children[0].onclick(); await tick(0);
            assert.equal(c.__legacyTest.S.phase, 'pre');
            assert.equal(elements.get('adv-text').textContent, episode.pre[0].text);
            assert.equal(c.__legacyTest.S.battleActive, false);
        } else {
            elements.get('adv-ending').children[0].onclick();
            assert.equal(c.__legacyTest.S.phase, 'select');
            assert.equal(elements.get('story-adv').hidden, true);
        }
    });

    test(`${label}: tutorial2 cooking and turn end guards stay closed until ace procurement`, () => {
        const { c, elements } = tutorialRuntime({ mobile });
        const calls = [];
        c.__legacyTest.S.guardsInstalled = false;
        for (const name of ['playerShowRecipeCandidates', 'playerCookSelectedRecipe', 'playerEndTurn']) c[name] = () => calls.push(name);
        c.__legacyTest.installGuards(); c.__legacyTest.S.episodeId = 'episode2'; c.__legacyTest.S.objectives = {};
        c.__legacyTest.startBattle('episode2');
        for (const name of ['playerShowRecipeCandidates', 'playerCookSelectedRecipe', 'playerEndTurn']) c[name]();
        assert.deepEqual(calls, []);
        assert.equal(elements.get('story-hud-note').textContent, '先にスキル「切り札調達」を発動してください。');
        c.GameState.players.player.skillUseCounts.aceProcurement = 1;
        c.__legacyTest.onBattleStateUpdated();
        for (const name of ['playerShowRecipeCandidates', 'playerCookSelectedRecipe', 'playerEndTurn']) c[name]();
        assert.deepEqual(calls, ['playerShowRecipeCandidates', 'playerCookSelectedRecipe', 'playerEndTurn']);
    });

    test(`${label}: tutorial typewriter, pause, auto, fast-forward and skip stop before battle`, async () => {
        const { c, elements, tick } = tutorialRuntime({ mobile, reduced: false });
        c.__legacyTest.startIntro('episode1'); await tick(0);
        assert.equal(c.__advTest.S.typing, true);
        const partial = elements.get('adv-text').textContent;
        c.__advTest.pausePlayback(); await tick(5000);
        assert.equal(elements.get('adv-text').textContent, partial);
        c.__advTest.openLog(true); assert.equal(elements.get('adv-log-lines').children.length, 1);
        c.__advTest.openLog(false); assert.equal(c.__advTest.S.paused, true);
        c.__advTest.resumePlayback(); await tick(30);
        assert.ok(elements.get('adv-text').textContent.length > partial.length);
        c.__advTest.toggleAuto(); c.__advTest.advance(); await tick(6500);
        assert.ok(c.__advTest.S.lineIndex > 0);
        c.__advTest.toggleFastForward(); await tick(10000);
        assert.equal(elements.get('adv-ending').hidden, false);
        assert.equal(c.__advTest.S.fastForward, false);
        assert.equal(c.__legacyTest.S.battleActive, false);
        assert.equal(c.__advTest.S.backlog.length, 12);
    });
}

test('tutorial selection keeps unlock/status cards, three-episode achievement and festival resume', async () => {
    const { c, elements, load, tick } = tutorialRuntime({ save: {
        [PROGRESS_KEY]: JSON.stringify({ episode4: true, future: { kept: true } }),
        [ADV_KEY]: JSON.stringify({ version: 1, auto: true, resume: { episodeId: 'episode8', sceneId: 'scene1', lineIndex: 0, stage: 'pre' } })
    } });
    load('achievements.js');
    assert.match(elements.get('story-episode-list').html, /第1話クリアで解放/);
    c.__legacyTest.startIntro('episode2'); assert.equal(c.__advTest.S.active, false);
    for (const id of ['episode1', 'episode2', 'episode3']) {
        c.__legacyTest.beginPost(id, 'player'); await tick(0);
        c.__legacyTest.renderEpisodeList();
        assert.ok(c.BattleStoryProgress.load()[id]);
        assert.ok(c.StoryAdv.hasResume('episode8'));
    }
    assert.equal(c.Achievements.readLocal().counters.storyClears, 3);
    assert.ok(c.Achievements.readLocal().unlocked.storyComplete);
    c.__legacyTest.openSelection('');
    assert.equal(elements.get('story-stage-subtitle').textContent, '再会編（チュートリアル）／出会い・文化祭編');
    assert.equal((elements.get('story-episode-list').html.match(/クリア済み/g) || []).length, 3);
    assert.deepEqual(clone(c.BattleStoryProgress.load().future), { kept: true });
});

test('preload selects episode backgrounds, inline changes, shown actors and registered fallbacks only', async () => {
    const { c, preloaded, requests } = runtime();
    c.BattleStoryData.register({ id: 'asset-scope', scenes: [{ id: 'first', background: 'classroom', lines: [
        { speaker: 'chizuru', expression: 'smile', text: '準備中', show: [
            { id: 'kanna', expression: 'surprised' }, { id: 'mai' }, { id: 'tsuyoshi' }, { id: 'unregistered' }
        ] },
        { speaker: 'narration', background: 'rooftop', text: '屋上' },
        { speaker: 'unregistered', background: 'unregistered', text: '名前だけ' }
    ] }] });
    const a = c.BattleStoryAssets;
    const expected = [a.backgrounds.classroom, a.backgrounds.rooftop,
        ...a.portraitCandidates('chizuru', 'smile'), ...a.portraitCandidates('kanna', 'surprised'),
        ...a.portraitCandidates('mai', 'normal'), ...a.portraitCandidates('tsuyoshi', 'normal')];
    await c.StoryAdv.start('asset-scope');
    assert.deepEqual(preloaded.map(img => img.src).sort(), expected.sort());
    assert.ok(requests.every(file => a.paths().includes(file)));
    assert.ok(!requests.includes(a.characters.chizuru.portraits.angry));
    assert.ok(!requests.includes(a.backgrounds['shopping-street']));
});

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    for (const reduced of [false, true]) test(`${label}: first line waits for every decode, including reduced motion=${reduced}`, async () => {
        const decodes = new Map();
        const r = runtime({ mobile, main: true, reduced, imageBehavior: {
            decode: img => new Promise(resolve => decodes.set(img.src, resolve))
        } });
        const { c, elements, tick, preloaded } = r;
        const started = c.StoryAdv.start('episode4');
        assert.equal(elements.get('story-adv').hidden, false);
        assert.equal(elements.get('story-adv').getAttribute('aria-busy'), 'true');
        assert.equal(elements.get('adv-loading').hidden, false);
        assert.equal(elements.get('adv-dialogue').hidden, true);
        assert.equal(elements.get('adv-text').textContent, '');
        assert.equal(c.__advTest.S.backlog.length, 0);
        assert.equal(elements.get('adv-portraits').children.length, 0);
        elements.get('adv-auto').onclick();
        c.__advTest.advance(); c.__advTest.openLog(true);
        assert.equal(elements.get('adv-log').hidden, true);
        await tick(4000);
        assert.equal(c.__advTest.S.lineIndex, 0);
        const callbacks = [...decodes.values()];
        assert.ok(callbacks.length > 1);
        callbacks.slice(0, -1).forEach(resolve => resolve()); await tick(0);
        assert.equal(elements.get('adv-dialogue').hidden, true, 'load events alone do not bypass decode');
        callbacks.at(-1)(); await started;
        assert.equal(elements.get('adv-loading').hidden, true);
        assert.equal(elements.get('story-adv').getAttribute('aria-busy'), 'false');
        assert.equal(elements.get('adv-dialogue').hidden, false);
        assert.equal(c.__advTest.S.typing, !reduced);
        assert.equal(elements.get('adv-text').textContent, reduced ? 'カレーよし。おにぎりもよし' : 'カ');
        assert.ok(elements.get('adv-background').style.backgroundImage.includes('festival-classroom.webp'));
        assert.equal(c.__advTest.S.backlog.length, 1);
        const count = preloaded.length;
        if (!reduced) c.__advTest.advance();
        c.__advTest.advance();
        assert.equal(preloaded.length, count, 'line changes reuse decoded background images');
        await c.StoryAdv.start('episode4');
        assert.equal(preloaded.length, count, 'episode restarts reuse the image cache');
        c.__advTest.S.battleActive = true; c.__storyActiveEpisodeId = 'episode4';
        assert.equal(c.StoryAdv.handleBattleEnded('player'), true);
        assert.equal(c.StoryAdv.finishBattleReturn(), true); await tick(0);
        assert.equal(preloaded.length, count, 'battle return reuses the image cache');
        assert.equal(c.__advTest.S.sceneId, 'win');
        assert.equal(elements.get('adv-loading').hidden, true);
    });

    test(`${label}: Continue waits for load/onerror before restoring the saved line`, async () => {
        const r = runtime({ mobile, main: true, imageBehavior: { load() {} }, save: {
            [ADV_KEY]: JSON.stringify({ version: 1, auto: true, resume: {
                episodeId: 'episode4', sceneId: 'scene1', lineIndex: 1, stage: 'pre'
            } })
        } });
        const { c, elements, preloaded, tick } = r;
        const started = c.StoryAdv.start('episode4', true);
        assert.equal(elements.get('adv-dialogue').hidden, true);
        assert.equal(c.__advTest.S.backlog.length, 1);
        preloaded.slice(0, -1).forEach(img => img.onload()); await tick(0);
        assert.equal(elements.get('adv-dialogue').hidden, true);
        preloaded.at(-1).onerror(); await started;
        assert.equal(elements.get('adv-dialogue').hidden, false);
        assert.equal(elements.get('adv-text').textContent, '……でも、ちゃんとおいしいか確認したほうがいいよね');
        assert.equal(c.__advTest.S.lineIndex, 1);
        assert.equal(c.__advTest.S.backlog.length, 2);
    });

    for (const winner of ['player', 'cpu']) test(`${label}: ${winner} battle return preloads before the outcome's first line`, async () => {
        const decodes = [];
        const r = runtime({ mobile, main: true, imageBehavior: {
            decode: () => new Promise(resolve => decodes.push(resolve))
        } });
        const { c, elements, tick } = r;
        c.__advTest.S.episode = c.BattleStoryData.get('episode4'); c.__advTest.S.battleActive = true;
        c.startStoryCpuBattle(c.__advTest.S.episode, 'lastOrder'); c.endGame(winner);
        assert.equal(c.StoryAdv.finishBattleReturn(), true);
        assert.equal(elements.get('adv-dialogue').hidden, true);
        assert.equal(elements.get('adv-text').textContent, '');
        assert.equal(c.__storyActiveEpisodeId, null);
        decodes.forEach(resolve => resolve()); await tick(0);
        const scene = winner === 'player' ? 'win' : 'lose';
        assert.equal(c.__advTest.S.sceneId, scene);
        assert.equal(elements.get('adv-dialogue').hidden, false);
        assert.equal(elements.get('adv-text').textContent, c.BattleStoryData.get('episode4').scenes.find(s => s.id === scene).lines[0].text);
    });
}

test('preload failures retain gradient / normal / standing / name-only fallbacks and are cached', async () => {
    for (const failureCount of [1, 2, 3]) {
        const { c, elements, preloaded } = runtime({ imageBehavior: { load() {} } });
        const ep = clone(c.BattleStoryData.get('episode4'));
        ep.id = 'failed-art'; ep.scenes[0].lines[0].expression = 'smile'; c.BattleStoryData.register(ep);
        const candidates = c.BattleStoryAssets.portraitCandidates('chizuru', 'smile');
        const failed = candidates.slice(0, failureCount);
        failed.push(c.BattleStoryAssets.backgrounds['festival-classroom']);
        const started = c.StoryAdv.start(ep.id);
        preloaded.forEach(img => failed.includes(img.src) ? img.onerror() : img.onload()); await started;
        const portraits = elements.get('adv-portraits').children[0].children;
        assert.equal(elements.get('adv-background').style.backgroundImage, '');
        if (failureCount < 3) assert.equal(portraits[0].src, candidates[failureCount]);
        else assert.equal(portraits.length, 0);
        const count = preloaded.length;
        await c.StoryAdv.start(ep.id);
        assert.equal(preloaded.length, count, 'failed preload requests are not repeated');
    }
});

test('missing, rejecting or throwing decode falls back to load/error events', async () => {
    for (const kind of ['missing', 'reject', 'throw']) {
        const imageBehavior = { load() {} };
        if (kind !== 'missing') imageBehavior.decode = () => {
            if (kind === 'throw') throw Error('decode unavailable');
            return Promise.reject(Error('decode unavailable'));
        };
        const { c, tick, preloaded, elements } = runtime({ imageBehavior });
        const started = c.StoryAdv.start('episode4'); await tick(0);
        assert.equal(elements.get('adv-dialogue').hidden, true);
        preloaded.forEach(img => img.onload()); await started;
        assert.equal(elements.get('adv-dialogue').hidden, false, kind);
        assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
    }
    const { c, elements } = runtime({ imageBehavior: { decode: () => Promise.reject(Error('already loaded')) } });
    await c.StoryAdv.start('episode4');
    assert.equal(elements.get('adv-dialogue').hidden, false, 'a decode rejection after onload also settles');
});

test('the six-second timeout starts playback with existing fallbacks and allows late images', async () => {
    const { c, tick, elements, preloaded } = runtime({ imageBehavior: { load() {} } });
    const started = c.StoryAdv.start('episode4');
    await tick(5999);
    assert.equal(elements.get('adv-loading').hidden, false);
    assert.equal(elements.get('adv-dialogue').hidden, true);
    assert.equal(elements.get('adv-text').textContent, '');
    await tick(1); await started;
    assert.equal(elements.get('adv-dialogue').hidden, false);
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
    assert.equal(elements.get('adv-background').style.backgroundImage, '');
    assert.equal(elements.get('adv-portraits').children[0].children[0].src, c.BattleStoryAssets.characters.chizuru.portraits.normal);
    preloaded.forEach(img => img.onload()); await tick(0);
    assert.ok(elements.get('adv-background').style.backgroundImage.includes('festival-classroom.webp'));
    const count = preloaded.length;
    await c.StoryAdv.start('episode4'); assert.equal(preloaded.length, count);
});

test('a pending decode times out even after onload', async () => {
    const { c, tick, elements } = runtime({ imageBehavior: { decode: () => new Promise(() => {}) } });
    const started = c.StoryAdv.start('episode4');
    await tick(5999); assert.equal(elements.get('adv-dialogue').hidden, true);
    await tick(1); await started;
    assert.equal(elements.get('adv-dialogue').hidden, false);
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
    assert.ok(elements.get('adv-background').style.backgroundImage.includes('festival-classroom.webp'), 'onload fallback keeps already loaded backgrounds');
});

test('leaving during preload cancels playback; restarting shares requests and rejects stale continuations', async () => {
    const decodes = [];
    const { c, elements, tick, preloaded, jobs, store } = runtime({ imageBehavior: {
        decode: () => new Promise(resolve => decodes.push(resolve))
    } });
    const old = c.StoryAdv.start('episode4');
    elements.get('adv-menu').onclick(); await old;
    assert.equal(elements.get('story-adv').hidden, true);
    assert.equal(c.__advTest.S.active, false);
    assert.equal(jobs.size, 0, 'cancelled preload leaves no timeout behind');
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume.lineIndex, 0);
    const count = preloaded.length;
    const restarted = c.StoryAdv.start('episode4', true);
    assert.equal(preloaded.length, count);
    decodes.forEach(resolve => resolve()); await restarted; await tick(0);
    assert.equal(c.__advTest.S.backlog.length, 1, 'only the current startup renders a line');
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
    assert.equal(c.__advTest.S.lineIndex, 0);
});

test('episode4 dialogue and directions reproduce the scenario word for word in order', async t => {
    const { c } = runtime(); const ep = c.BattleStoryData.get('episode4');
    const announcement = ep.scenes.find(s => s.id === 'win').lines.find(l => l.speaker === 'announce');
    assert.equal(announcement.name, '校内放送');
    assert.equal(ep.scenes.find(s => s.id === 'lose').provisional, undefined);
    assert.equal(ep.unlockRequires, null);
    assert.equal(c.BattleStoryData.get('episode5').unlockRequires, 'episode4');
    await t.test('word-for-word dialogue and directions match the optional source scenario', t => {
        if (!fs.existsSync(path.join(root, 'docs/story/episode4-scenario.md'))) {
            t.skip('Source scenario docs/story/episode4-scenario.md is absent in this publish copy; only the word-for-word comparison is skipped.');
            return;
        }
        const scenario = read('docs/story/episode4-scenario.md');
        const sections = [
            ['scene1', '## SCENE 1', '## SCENE 2'], ['scene2', '## SCENE 2', '## BATTLE START'],
            ['win', '## BATTLE CLEAR後', '## CLEAR演出'], ['lose', '## 敗北時', null]
        ];
        for (const [id, start, end] of sections) {
            const body = scenario.slice(scenario.indexOf(start), end ? scenario.indexOf(end) : undefined);
            const expected = body.split(/\r?\n/).filter(text => /(?:千鶴|栞那)「[^」]*」$/.test(text));
            const actual = reviewedLines(4, id, ep.scenes.find(scene => scene.id === id).lines).filter(line => ['chizuru', 'kanna'].includes(line.speaker));
            assert.equal(actual.length, expected.length, id);
            expected.forEach((source, index) => {
                const [, name, text] = source.match(/(千鶴|栞那)「([^」]*)」$/);
                assert.equal(actual[index].text, stripLineFinalPeriod(text));
                assert.equal(actual[index].speaker, name === '千鶴' ? 'chizuru' : 'kanna');
                assert.equal(actual[index].direction, source.slice(0, source.lastIndexOf(name + '「')));
                assert.equal(actual[index].position, name === '千鶴' ? 'right' : 'left');
            });
        }
        assert.equal(announcement.text, stripLineFinalPeriod(scenario.match(/ここで校内放送。「([^」]*)」/)[1]));
    });
});

test('episode4 stage directions and mapped expressions are registered and ordered', async t => {
    const { c, warnings } = runtime(); const ep = c.BattleStoryData.get('episode4');
    const assets = c.BattleStoryAssets;
    for (const scene of ep.scenes) {
        assert.ok(assets.backgrounds[scene.background]);
        for (const line of scene.lines) {
            if (['narration', 'announce'].includes(line.speaker)) continue;
            assert.ok(assets.characters[line.speaker].portraits[line.expression]);
            const direction = line.direction;
            if (/^続けて/.test(direction)) assert.equal(line.continue, true);
        }
    }
    const directions = ep.scenes.flatMap(scene => scene.lines).filter(l => l.speaker === 'narration' && !l.battle).map(l => l.direction);
    assert.ok(directions.length > 0);
    assert.equal(warnings.length, 0);
    await t.test('word-for-word stage directions match the optional source scenario', t => {
        if (!fs.existsSync(path.join(root, 'docs/story/episode4-scenario.md'))) {
            t.skip('Source scenario docs/story/episode4-scenario.md is absent in this publish copy; only the word-for-word comparison is skipped.');
            return;
        }
        const expected = read('docs/story/episode4-scenario.md').split(/\r?\n/).filter(text => /^(千鶴を消す。|栞那を消す。|少し間を空ける。|ここでBattle|（可能なら|チャイム。)/.test(text));
        assert.deepEqual(clone(directions), expected);
    });
});

test('a publish copy without docs skips only the two source comparisons', async () => {
    const cases = new Map(), skipped = []; let assertions = 0;
    const scenarioPath = path.join(root, 'docs/story/episode4-scenario.md');
    const portableFs = Object.create(fs);
    portableFs.existsSync = file => file === scenarioPath ? false : fs.existsSync(file);
    portableFs.readFileSync = (file, ...args) => {
        assert.notEqual(file, scenarioPath, 'an absent scenario must never be read');
        return fs.readFileSync(file, ...args);
    };
    const countedAssert = new Proxy(assert, { get(target, key) {
        return typeof target[key] === 'function' ? (...args) => { assertions++; return target[key](...args); } : target[key];
    } });
    vm.runInNewContext(read('tests/story-adv.test.cjs'), { __dirname, URL, require(name) {
        if (name === 'node:test') return (name, callback) => cases.set(name, callback);
        if (name === 'node:fs') return portableFs;
        if (name === 'node:assert/strict') return countedAssert;
        return require(name);
    } });
    for (const name of ['episode4 dialogue and directions reproduce the scenario word for word in order',
        'episode4 stage directions and mapped expressions are registered and ordered']) {
        await cases.get(name)({ test: async (name, callback) => callback({ skip: reason => skipped.push({ name, reason }) }) });
    }
    assert.equal(skipped.length, 2);
    assert.ok(skipped.every(item => item.reason.includes('only the word-for-word comparison is skipped')));
    assert.ok(assertions > 50, 'registry and episode checks still run without docs');
});

test('every explicitly registered artwork path exists (art run dependency)', async () => {
    const { c } = runtime();
    const missing = c.BattleStoryAssets.paths().filter(file => !fs.existsSync(path.join(root, file)));
    assert.deepEqual(clone(missing), [], 'Missing registered artwork:\n' + missing.join('\n'));
});

test('fallback never constructs an unlisted image filename', async () => {
    const { c } = runtime(); const a = c.BattleStoryAssets;
    assert.equal(a.portraitPath('chizuru', 'unknown-expression'), a.characters.chizuru.portraits.normal);
    assert.deepEqual(clone(a.portraitCandidates('chizuru', 'smile')), [a.characters.chizuru.portraits.smile, a.characters.chizuru.portraits.normal, a.characters.chizuru.standing]);
    assert.equal(a.portraitPath('mai', 'smile'), a.characters.mai.portraits.smile);
    assert.equal(a.portraitPath('tsuyoshi', 'normal'), a.characters.tsuyoshi.portraits.normal);
    assert.equal(a.portraitPath('unlisted', 'normal'), null);
    assert.equal(a.portraitPath('toString', 'normal'), null);
    assert.equal(a.portraitPath('chizuru', 'toString'), a.characters.chizuru.portraits.normal);
});

test('a failed registered portrait tries normal, then standing, then name only', async () => {
    const { c, elements, requests } = runtime();
    const ep = clone(c.BattleStoryData.get('episode4')); ep.id = 'fallback'; ep.scenes[0].lines[0].expression = 'smile';
    c.BattleStoryData.register(ep); await c.StoryAdv.start('fallback');
    const image = elements.get('adv-portraits').children[0].children[0];
    assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.portraits.smile);
    image.onerror(); assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.portraits.normal);
    image.onerror(); assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.standing);
    image.onerror(); assert.equal(elements.get('adv-portraits').children[0].children.length, 0);
    assert.ok(requests.every(file => c.BattleStoryAssets.paths().includes(file)));
});

test('unknown speakers, expressions and backgrounds warn once and fall back without throwing', async () => {
    const { c, warnings, requests } = runtime();
    const invalid = { id: 'unknown-episode', defaultPositions: {}, scenes: [{ id: 'unknown-scene', background: 'missing', lines: [
        { speaker: 'unlisted', text: '名前だけ', expression: 'missing' },
        { speaker: 'chizuru', text: '既存画像', expression: 'missing', background: 'missing' }
    ] }] };
    const normalized = c.BattleStoryData.register(invalid);
    assert.equal(normalized.scenes[0].background, null);
    assert.equal(normalized.scenes[0].lines[1].expression, 'normal');
    const count = warnings.length; c.BattleStoryData.register(invalid); assert.equal(warnings.length, count);
    await c.StoryAdv.start('unknown-episode');
    assert.ok(requests.every(file => c.BattleStoryAssets.paths().includes(file)));
    assert.equal(c.document.getElementById('adv-name').textContent, 'unlisted');
});

test('old progress and unknown future keys survive tutorial and episode4 saving', async () => {
    const old = { episode1: true, episode2: false, episode3: true, future: { value: 9 } };
    const { c, store } = runtime({ save: { [PROGRESS_KEY]: JSON.stringify(old) } });
    const loaded = c.BattleStoryProgress.load();
    assert.equal(loaded.episode4, false); assert.equal(loaded.episode1, true);
    c.__legacyTest.S.progress = loaded; c.__legacyTest.S.progress.episode2 = true; c.__legacyTest.saveProgress();
    c.BattleStoryProgress.complete('episode4');
    const saved = JSON.parse(store.get(PROGRESS_KEY));
    assert.equal(saved.episode4, true); assert.equal(saved.episode2, true); assert.deepEqual(saved.future, old.future);
});

test('line advances save position; reload restores the line, speaker and backlog', async () => {
    const r = runtime(); const { c, store } = r;
    await c.StoryAdv.start('episode4'); c.__advTest.advance();
    const saved = JSON.parse(store.get(ADV_KEY));
    assert.deepEqual({ ...saved.resume, savedAt: 0 }, { episodeId: 'episode4', sceneId: 'scene1', lineIndex: 1, stage: 'pre', savedAt: 0 });
    const reload = runtime({ save: Object.fromEntries(store) }); await reload.c.StoryAdv.start('episode4', true);
    assert.equal(reload.elements.get('adv-text').textContent, '……でも、ちゃんとおいしいか確認したほうがいいよね');
    assert.equal(reload.c.__advTest.S.backlog.length, 2);
    reload.elements.get('adv-menu').onclick();
    assert.ok(reload.calls.includes('story-select'));
    assert.equal(reload.c.StoryAdv.hasResume('episode4'), true);
});

test('reload during battle returns to skill selection at BATTLE START', async () => {
    const { c, store } = runtime({ save: { [ADV_KEY]: JSON.stringify({ version: 1, auto: true, resume: { episodeId: 'episode4', sceneId: 'scene2', lineIndex: 22, stage: 'battle' } }) } });
    await c.StoryAdv.start('episode4', true);
    assert.equal(c.choice.episode.id, 'episode4');
    assert.equal(c.__advTest.S.battleActive, false);
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume.stage, 'battle');
    assert.equal(c.__storyActiveEpisodeId, undefined);
});

test('blocked or invalid localStorage does not stop story playback', async () => {
    for (const options of [{ storageBlocked: true }, { save: { [ADV_KEY]: '{', [PROGRESS_KEY]: '{' } }]) {
        const { c } = runtime(options);
        await c.StoryAdv.start('episode4');
        assert.doesNotThrow(() => { c.__advTest.advance(); c.BattleStoryProgress.complete('episode4'); });
    }
});

test('AUTO delay clamps, waits for typing, supports taps, and is remembered', async () => {
    const r = runtime({ reduced: false }); const { c, elements, store } = r;
    assert.equal(c.StoryAdv.autoDelay(''), 2000);
    assert.equal(c.StoryAdv.autoDelay('あ'.repeat(30)), 3600);
    assert.equal(c.StoryAdv.autoDelay('あ'.repeat(300)), 6500);
    await c.StoryAdv.start('episode4'); elements.get('adv-auto').onclick();
    assert.equal(elements.get('adv-auto').textContent, 'オート ON');
    assert.equal(JSON.parse(store.get(ADV_KEY)).auto, true);
    await r.tick(30); assert.equal(c.__advTest.S.lineIndex, 0);
    c.__advTest.advance(); // complete typewriter
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
    await r.tick(c.StoryAdv.autoDelay(c.__advTest.S.text) - 1); assert.equal(c.__advTest.S.lineIndex, 0);
    await r.tick(1); assert.equal(c.__advTest.S.lineIndex, 1);
    elements.get('adv-auto').onclick(); assert.equal(JSON.parse(store.get(ADV_KEY)).auto, false);
    await r.tick(9000); assert.equal(c.__advTest.S.lineIndex, 1);
});

test('AUTO pauses for backlog and effects; the 800ms pause preserves dialogue', async () => {
    const r = runtime(); const { c, elements } = r;
    await c.StoryAdv.start('episode4'); elements.get('adv-auto').onclick();
    c.__advTest.openLog(true); await r.tick(10000); assert.equal(c.__advTest.S.lineIndex, 0);
    c.__advTest.openLog(false); elements.get('adv-auto').onclick();
    Object.assign(c.__advTest.S, { sceneId: 'scene2', lineIndex: 7 });
    elements.get('adv-text').textContent = '否定しないんだ'; c.__advTest.renderCurrent();
    await r.tick(799); assert.equal(elements.get('adv-text').textContent, '否定しないんだ');
    c.__advTest.advance(); assert.equal(c.__advTest.S.lineIndex, 7);
    await r.tick(1); assert.equal(elements.get('adv-text').textContent, '開場までまだ時間あるね');
});

test('multi-character staging keeps explicit actors, dims others, and hides all for announcements', async () => {
    const { c, elements } = runtime(); await c.StoryAdv.start('episode4');
    c.__advTest.stageLine({ speaker: 'chizuru', position: 'right', show: [{ id: 'mai', position: 'center' }, { id: 'kanna', position: 'left' }] });
    assert.equal(c.__advTest.S.actors.size, 3);
    c.__advTest.renderActors('chizuru');
    assert.equal(elements.get('adv-portraits').children.filter(p => p.classList.contains('dimmed')).length, 2);
    c.__advTest.stageLine({ speaker: 'chizuru', position: 'right', continue: true });
    assert.equal(c.__advTest.S.actors.size, 1);
    const portrait = elements.get('adv-portraits').children[0];
    c.__advTest.advance(); assert.equal(elements.get('adv-portraits').children[0], portrait, 'same speaker does not re-enter');
    c.__advTest.stageLine({ speaker: 'announce' }); assert.equal(c.__advTest.S.actors.size, 0);
});

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`${label}: story reuses the skill tiles, starts with the favourite, and restores normal preparation`, async () => {
        const { c, elements, Element } = runtime({ main: true, mobile });
        for (const id of ['start-cpu-setup-stage', 'start-character-step', 'start-character-cards', 'start-skill-step',
            'start-skill-footer', 'start-skill-list', 'start-skill-detail', 'start-skill-message', 'start-setup-button',
            'start-back-menu-button', 'start-cpu-setup-title', 'start-cpu-setup-subtitle', 'start-cpu-personality', 'start-turn-stage', 'menu-cpu-button']) {
            const node = new Element(); node.id = id;
        }
        Object.assign(c, { getUserProfile: () => ({ favoriteCharacterId: 'mai', favoriteSkillKey: 'tasteThief' }),
            setupMatchAutosaveOnce() {}, setupMatchExitGuardOnce() {}, renderUserStageProfile() {},
            renderCoinStageProfile() {}, updateResumeMatchButtonVisibility() {}, startMenuFloatingBackground() {} });
        c.setupStartOverlay();
        let chosen = null, returned = false;
        c.openStorySkillChoice(c.BattleStoryData.get('episode4'), key => { chosen = key; }, async () => { returned = true; });
        assert.equal(elements.get('start-cpu-setup-title').textContent, '第4話 対戦準備');
        assert.equal(elements.get('start-cpu-setup-subtitle').textContent, '千鶴のスキルを選択');
        assert.equal(elements.get('start-setup-button').textContent, 'BATTLE START');
        assert.match(elements.get('start-skill-list').html, /class="start-skill-tile active" data-pick-skill-key="tasteThief"/);
        elements.get('start-skill-list').listeners.click({ target: { closest: () => ({ getAttribute: () => 'foodTrap' }) } });
        elements.get('start-setup-button').listeners.click(); assert.equal(chosen, 'foodTrap');
        c.openStorySkillChoice(c.BattleStoryData.get('episode4'), async () => {}, async () => { returned = true; });
        elements.get('start-back-menu-button').listeners.click(); assert.equal(returned, true);
        elements.get('menu-cpu-button').listeners.click();
        assert.equal(elements.get('start-cpu-setup-title').textContent, 'CPU戦セットアップ');
        assert.equal(elements.get('start-cpu-setup-subtitle').textContent, '1/3 キャラを選択');
    });
    test(`${label}: normal opening deal, selected skill, default CPU and all story flags`, async () => {
        const { c, calls } = runtime({ main: true, mobile }); const ep = c.BattleStoryData.get('episode4');
        c.startStoryCpuBattle(ep, 'foodTrap'); const state = c.GameState;
        assert.equal(state.storyEpisodeId, 'episode4'); assert.equal(c.__storyActiveEpisodeId, 'episode4');
        assert.equal(state.achievementStory, true);
        assert.deepEqual(clone(state.characterIds), { player: 'chizuru', cpu: 'kanna' });
        assert.deepEqual(clone(state.characterNames), { player: '千鶴', cpu: '栞那' });
        assert.equal(state.players.player.selectedSkillKey, 'foodTrap');
        assert.ok(['makanaiSupply', 'aceProcurement'].includes(state.players.cpu.selectedSkillKey), 'existing default CPU pick');
        assert.equal(state.settings.cpuPersonality, 'default');
        assert.equal(state.turnNumber, 1); assert.equal(state.players.player.score, 0);
        assert.equal(state.players.player.set.length, 0); assert.equal(state.players.cpu.packs.length, 0);
        assert.equal(c.getCurrentTotalHandCount(state.players.player), c.getTargetTotalHandSize(state.players.player));
        assert.equal(c.shouldAutosaveCurrentMatch(), false);
        assert.equal(c.getBattleViewModel().opponentLabel, '栞那');
        assert.ok(calls.includes('init-normal'));
    });
    test(`${label}: win, loss and surrender wait for result exit, then clear flags before the next match`, async () => {
        for (const outcome of ['win', 'lose', 'surrender']) {
            const r = runtime({ main: true, mobile }); const { c, store, elements, Element } = r;
            for (const id of ['result-exit-button', 'final-field-exit-button']) { const button = new Element('button'); button.id = id; }
            c.GameState.settings.cpuPersonality = 'disrupt';
            c.__advTest.S.episode = c.BattleStoryData.get('episode4');
            c.__advTest.S.battleActive = true;
            c.startStoryCpuBattle(c.__advTest.S.episode, 'lastOrder');
            const finalCalls = [];
            c.prepareMatchFinale = winner => finalCalls.push(winner);
            if (outcome === 'surrender') c.playerSurrender(); else c.endGame(outcome === 'win' ? 'player' : 'cpu');
            assert.deepEqual(finalCalls, [outcome === 'win' ? 'player' : 'cpu'], 'normal finale still runs');
            assert.equal(c.GameState.gameEnded, true);
            assert.equal(c.__storyActiveEpisodeId, 'episode4'); assert.equal(c.GameState.storyEpisodeId, 'episode4');
            assert.equal(c.__storyResultPending, true);
            for (const id of ['result-exit-button', 'final-field-exit-button']) assert.equal(elements.get(id).textContent, 'ストーリーへ進む');
            await r.tick(10000);
            assert.equal(c.__advTest.S.active, false, 'no timed takeover, even after the longest finale');
            c.bindMainEvents();
            const exitId = outcome === 'lose' ? 'final-field-exit-button' : 'result-exit-button';
            await elements.get(exitId).onclick();
            assert.equal(c.__storyActiveEpisodeId, null); assert.equal(c.GameState.storyEpisodeId, null);
            assert.equal(c.GameState.achievementStory, false);
            assert.equal(c.GameState.settings.cpuPersonality, 'disrupt');
            assert.equal(JSON.parse(store.get(ADV_KEY)).resume.stage, outcome === 'win' ? 'post' : 'lose');
            assert.equal(c.__storyResultPending, false);
            for (const id of ['result-exit-button', 'final-field-exit-button']) assert.equal(elements.get(id).textContent, '対戦を終わらせる');
            assert.equal(c.__advTest.S.sceneId, outcome === 'win' ? 'win' : 'lose');
            assert.equal(c.__advTest.S.active, true);
            c.StoryAdv.stop(); c.beginMatchByRole('先攻');
            assert.equal(c.GameState.achievementStory, false); assert.equal(c.__storyActiveEpisodeId, null);
            assert.ok(['chizuru', 'mai', 'takumi', 'akatsuki'].includes(c.GameState.characterIds.cpu));
            assert.equal(c.shouldAutosaveCurrentMatch(), true);
        }
    });
    test(`${label}: abandoning mid-battle preserves the marker, removes flags, and stops pending actions`, async () => {
        const { c, store } = runtime({ main: true, mobile });
        await c.StoryAdv.start('episode4'); Object.assign(c.__advTest.S, { sceneId: 'scene2', lineIndex: 22 });
        c.__advTest.chooseBattle(); c.choice.onStart('lastOrder');
        c.showStartStage('start-menu-stage');
        assert.equal(c.__storyActiveEpisodeId, null); assert.equal(c.GameState.storyEpisodeId, null);
        assert.equal(c.GameState.achievementStory, false); assert.equal(c.__advTest.S.battleActive, false);
        assert.equal(JSON.parse(store.get(ADV_KEY)).resume.stage, 'battle');
    });
    test(`${label}: story results retain scores/dishes and surrender uses the normal result screen`, async () => {
        for (const outcome of ['win', 'lose', 'surrender']) {
            const r = runtime({ main: true, mobile }), { c, Element, elements } = r;
            for (const id of ['result-overlay', 'result-text', 'result-summary', 'final-field-actions', 'result-exit-button', 'final-field-exit-button', 'show-match-result-button', 'result-field-button']) {
                const node = new Element(); node.id = id; node.classList.add('hidden');
            }
            c.__advTest.S.episode = c.BattleStoryData.get('episode4'); c.__advTest.S.battleActive = true;
            c.startStoryCpuBattle(c.__advTest.S.episode, 'lastOrder');
            c.prepareMatchFinale = c.__normalFinale; c.hideResultOverlay = c.__normalHideResult;
            c.updateBattleMenu = () => {};
            const winner = outcome === 'win' ? 'player' : 'cpu';
            c.GameState.players.player.score = outcome === 'win' ? 10 : 4;
            c.GameState.players.cpu.score = outcome === 'win' ? 7 : 10;
            const dish = { name: '鮭おにぎり', points: 2, side: winner, cookedAt: 9999, required: ['ごはん', '鮭'] };
            c.GameState.players[winner].cookedRecipes = [dish]; c.GameState.lastCookedRecipe = dish;
            let completeFinale;
            c.DishEffects = { show: () => new Promise(resolve => { completeFinale = resolve; }) };
            if (outcome === 'surrender') {
                c.playerSurrender();
                assert.equal(completeFinale, undefined, 'surrender bypasses dish animation');
                assert.match(elements.get('result-text').textContent, /降参/);
            } else {
                c.endGame(winner);
                assert.equal(elements.get('final-field-actions').classList.contains('hidden'), true);
                completeFinale({ cancelled: false }); await r.tick(0);
                assert.equal(elements.get('final-field-actions').classList.contains('hidden'), false);
                assert.equal(elements.get('result-overlay').classList.contains('hidden'), true);
                c.bindMainEvents();
                elements.get('show-match-result-button').onclick();
            }
            assert.equal(elements.get('result-overlay').classList.contains('hidden'), false);
            const summary = elements.get('result-summary').children;
            assert.ok(summary[0].textContent.includes(outcome === 'win' ? '10 - 7' : '4 - 10'));
            assert.equal(summary[1].children[1].textContent, '千鶴');
            assert.ok(summary[2].children.some(section => section.children[0].textContent.startsWith('栞那の料理')));
            assert.ok(summary[2].children.some(section => section.children.some(node => node.children.some(item => item.textContent.includes('鮭おにぎり')))));
            assert.equal(c.__advTest.S.active, false);
            c.bindMainEvents(); elements.get('result-field-button').onclick();
            assert.equal(elements.get('result-overlay').classList.contains('hidden'), true);
            assert.equal(elements.get('final-field-actions').classList.contains('hidden'), false);
            assert.equal(elements.get('final-field-exit-button').textContent, 'ストーリーへ進む');
            await c.finishCompletedMatch();
            assert.equal(c.__advTest.S.active, true);
            assert.equal(c.__storyActiveEpisodeId, null);
        }
    });
}

test('registered asset URLs use the project root for file://, Pages and the mobile entry', async () => {
    for (const base of ['file:///C:/game/story-data/characters.js?v=1', 'https://example.invalid/game/story-data/characters.js?v=1']) {
        const c = vm.createContext({ window: {}, URL, document: { currentScript: { src: base } } });
        vm.runInContext(read('story-data/characters.js'), c);
        assert.equal(c.window.BattleStoryAssets.url('assets/battle-images/card-back.webp'), new URL('../assets/battle-images/card-back.webp', base).href);
    }
});

test('clear waits for the final chime and blackout', async () => {
    const { c, elements, tick, calls, store } = runtime(); await c.StoryAdv.start('episode4');
    Object.assign(c.__advTest.S, { sceneId: 'win', lineIndex: 22, stage: 'post' }); c.__advTest.renderCurrent();
    assert.ok(calls.includes('chime'));
    await tick(849); assert.equal(elements.get('adv-ending').hidden, true);
    await tick(1); assert.ok(elements.get('adv-effect').className.includes('fade-out'));
    await tick(699); assert.equal(elements.get('adv-ending').hidden, true);
    await tick(1); assert.equal(elements.get('adv-ending').hidden, false);
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume, null);
});

test('an abandoned CPU opening timer cannot start an unrelated later battle', async () => {
    const { c, tick } = runtime({ main: true }); let cpuTurns = 0;
    c.cpuTurn = () => { cpuTurns++; };
    c.__advTest.S.episode = c.BattleStoryData.get('episode4'); c.__advTest.S.battleActive = true;
    c.beginMatchByRole('後攻', { episode: c.__advTest.S.episode, skillKey: 'lastOrder' });
    c.StoryAdv.abandonBattle(); c.beginMatchByRole('後攻');
    await tick(1200); assert.equal(cpuTurns, 1);
});

test('returning to story selection cancels a pending post-battle transition', async () => {
    const { c, tick, store } = runtime({ main: true });
    c.__advTest.S.episode = c.BattleStoryData.get('episode4'); c.__advTest.S.battleActive = true;
    c.startStoryCpuBattle(c.__advTest.S.episode, 'lastOrder'); c.endGame('player');
    assert.equal(c.__storyResultPending, true);
    assert.equal(c.__advTest.S.active, false);
    c.openStoryStage(); await tick(1000);
    assert.equal(c.__advTest.S.active, false); assert.equal(c.__storyResultPending, false);
    assert.equal(c.StoryAdv.finishBattleReturn(), false);
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume.stage, 'post');
});

test('ADV keeps BGM and explicit cues with mute/volume, without per-line SE', async () => {
    const story = runtime(); await story.c.StoryAdv.start('episode4'); story.c.__advTest.advance();
    assert.ok(story.calls.includes('story-bgm'));
    assert.ok(!story.calls.includes('dialogue'));
    assert.doesNotMatch(read('story-adv.js'), /playStoryDialogueSound/);
    for (const file of ['audio.js', 'mobile/audio-sp.js']) {
        const calls = []; let enabled = false, volume = .25;
        class AudioContext {
            constructor() { this.currentTime = 0; this.sampleRate = 1000; }
            resume() { return Promise.resolve(); }
            createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { calls.push(value); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
            createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() {}, stop() {} }; }
            createBuffer() { return { getChannelData: () => new Float32Array(650) }; }
            createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; }
        }
        const c = vm.createContext({ window: { AudioContext }, Math, Float32Array,
            getBgmEnabled: () => enabled, getBgmVolume: () => volume,
            playSfxNow: (name, scale) => calls.push({ name, scale }) });
        const source = read(file); vm.runInContext(source.slice(source.indexOf('// ADV cues use')), c);
        assert.equal(c.window.playStoryDialogueSound, undefined);
        c.window.playStoryCue('chime'); assert.equal(calls.length, 0);
        enabled = true; c.window.playStoryCue('chime');
        assert.deepEqual(calls, [.13 * .25, .13 * .25]);
        c.window.playStoryCue('crowd'); assert.equal(calls[2], .18 * .25);
        volume = 0; c.window.playStoryCue('crowd'); assert.equal(calls.length, 3);
        assert.doesNotThrow(c.window.stopStoryCues);
    }
});

test('episode4 clear never contributes to the three-tutorial achievement', async () => {
    const { c, load } = runtime(); load('achievements.js');
    c.BattleStoryProgress.complete('episode4');
    assert.equal(c.Achievements.readLocal().counters.storyClears, 0);
    for (const id of ['episode1', 'episode2', 'episode3']) c.BattleStoryProgress.complete(id);
    assert.equal(c.Achievements.readLocal().counters.storyClears, 3);
    assert.ok(c.Achievements.readLocal().unlocked.storyComplete);
});

test('winning ending clears resume and marks episode4; losing offers retry without clearing', async () => {
    const { c, store, elements } = runtime(); await c.StoryAdv.start('episode4');
    Object.assign(c.__advTest.S, { sceneId: 'lose', stage: 'lose', lineIndex: 3 });
    c.__advTest.advance();
    const labels = elements.get('adv-ending').children.map(n => n.textContent);
    assert.ok(labels.includes('もう一度挑戦')); assert.ok(labels.includes('ストーリー選択へ戻る'));
    assert.ok(!labels.some(text => /仮セリフ/.test(text)));
    assert.equal(c.BattleStoryProgress.load().episode4, false);
    elements.get('adv-ending').children.find(n => n.textContent === 'もう一度挑戦').onclick();
    assert.equal(c.choice.episode.id, 'episode4');
    assert.equal(c.__advTest.S.stage, 'battle');
    await c.StoryAdv.start('episode4');
    Object.assign(c.__advTest.S, { sceneId: 'win', stage: 'post' }); c.__advTest.clearEpisode();
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume, null);
    assert.equal(c.BattleStoryProgress.load().episode4, true);
    assert.ok(elements.get('adv-ending').children.some(n => n.textContent === 'NEXT 第5話「いい匂いのする方へ」'));
    assert.ok(elements.get('story-adv').classList.contains('adv-cleared'));
    assert.equal(elements.get('adv-effect').className, 'adv-effect', 'blackout removed behind CLEAR');
    assert.ok(elements.get('adv-background').style.backgroundImage.includes('festival-classroom.webp'));
    elements.get('adv-menu').onclick(); assert.equal(JSON.parse(store.get(ADV_KEY)).resume, null);
});

test('portrait layer fills the scene behind controls, with character framing at the requested viewports', async () => {
    const { c, elements } = runtime(); await c.StoryAdv.start('episode4');
    c.__advTest.stageLine({ speaker: 'chizuru', position: 'right', show: [{ id: 'kanna', position: 'left' }] });
    c.__advTest.renderActors('chizuru');
    for (const actor of elements.get('adv-portraits').children) {
        const framing = c.BattleStoryAssets.characters[actor.dataset.actor];
        assert.equal(Number(actor.style['--adv-focus-y']), framing.focusY);
        assert.equal(Number(actor.style['--adv-portrait-scale']), framing.scale);
    }
    const css = read('story-adv.css');
    assert.match(css, /\.adv-portraits \{ position: absolute; inset: 0; z-index: 1/);
    for (const [cls, z] of [['toolbar', 6], ['dialogue', 3]]) assert.match(css, new RegExp('\\.adv-' + cls + ' \\{[^}]*z-index: ' + z));
    assert.match(css, /100dvh - var\(--adv-toolbar-height/);
    assert.doesNotMatch(css, /\.adv-portrait[^}]*max-height/);
    // Conservative face bounds measured from the retained full-body source artwork.
    // These are layout budgets; actual browser rendering still requires visual review.
    const bounds = { chizuru: [.13, .235], kanna: [.13, .235], mai: [.08, .18], takumi: [.08, .19], akatsuki: [.07, .18] };
    for (const [width, height] of [[1440, 900], [1366, 768], [390, 844], [360, 740], [844, 390]]) {
        const toolbar = width <= 600 ? 102 : 62;
        const dialogue = height < 500 ? 158 : width <= 600 ? 226 : 272;
        for (const [id, [faceTop, faceBottom]] of Object.entries(bounds)) {
            const { focusY, scale } = c.BattleStoryAssets.characters[id];
            const portrait = (height - toolbar - 12) * scale;
            const top = toolbar + 12 - portrait * focusY;
            assert.ok(top + portrait * faceTop > toolbar, `${width}x${height}: ${id} above toolbar`);
            assert.ok(top + portrait * faceBottom < height - dialogue - 14, `${width}x${height}: ${id} above dialogue`);
            assert.ok(portrait >= height, `${width}x${height}: full-height large portrait`);
        }
    }
});

test('CLEAR keeps a dimmed episode background, prominent NEXT and reduced-motion support', async () => {
    const css = read('story-adv.css');
    assert.match(css, /\.adv-cleared \.adv-ending \{[^}]*background: radial-gradient/);
    assert.match(css, /\.adv-teaser \{[^}]*font-size: clamp\(23px/);
    assert.match(css, /\.adv-cleared \.adv-ending h2::before/);
    assert.match(css, /prefers-reduced-motion: reduce[^]*animation: none !important; transition: none !important/);
});

test('episodes1–3 mechanics, tutorial setup, HUD, objectives and guards are unchanged', async () => {
    const source = read('story-mode.js'); const hash = text => crypto.createHash('sha256').update(text).digest('hex');
    // Only the approved presentation fields may change; all remaining metadata is frozen.
    const { c } = runtime();
    const mechanics = c.__legacyTest.EPISODES.map(({ arc, background, protagonist, summary, pre, postWin, postLose, ...rest }) => rest);
    assert.equal(hash(JSON.stringify(mechanics)), '1ea3c457ec4ad956f35cef45508c44e6ed5d60334982d498573e097a17be80c5');
    // Exclude only the approved BGM argument and the notice gate before the introduction.
    assert.equal(hash(source.slice(source.indexOf('    function getNextCardId'), source.indexOf('    function handleStoryBattleEnded'))
        .replaceAll('playStorySceneBgm(ep.protagonist);', 'playStorySceneBgm();')
        .replace('        if (!beforeStory(() => startIntro(episodeId))) return;\n', '')), '37382307e675f6ab78d30c443d823665d166f9c4b3e19f66e757a6d1a9d07ca0');
    assert.match(read('achievements.js'), /\['episode1', 'episode2', 'episode3'\]/);
    assert.match(read('achievements.js'), /if \(state\.achievementStory \|\| state\.storyEpisodeId\) return \[\]/);
});

test('kanna, tsuyoshi and classmates are absent from selectable, gallery, favourite, achievement and online lists', async () => {
    for (const file of ['main.js', 'mobile/main-sp.js']) {
        const source = read(file);
        for (const name of ['START_CHARACTER_OPTIONS', 'START_GALLERY_CHARACTER_OPTIONS']) {
            const value = source.match(new RegExp('const ' + name + ' = \\[([^]*?)\\];'))[1];
            assert.doesNotMatch(value, /kanna|tsuyoshi|classmate/);
        }
    }
    for (const file of ['profile.js', 'achievements.js', 'network.js', 'battle-engine-worker.js', 'battle-images.js']) assert.doesNotMatch(read(file), /kanna|tsuyoshi|classmate/, file);
    for (const file of ['web.html', 'mobile/mobile.html']) assert.doesNotMatch(read(file), /value="(?:kanna|tsuyoshi|classmate1|classmate2)"/);
});

test('both pages load ADV data locally in order with the current cache key', async () => {
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const source = read(file); let last = -1;
        for (const module of ['story-data/characters.js', 'story-data/registry.js', 'story-data/episode4.js', 'story-data/episode5.js', 'story-data/episode6.js', 'story-data/episode7.js', 'story-data/episode8.js', 'story-data/episode9.js', 'story-data/episode10.js', 'story-adv.js', 'story-mode.js']) {
            const version = module === 'story-data/characters.js' ? '20261003-expressions-80d1' : module.startsWith('story-data/') ? '20261004-adv-menu1' : '20261004-character-notice1';
            const position = source.indexOf(module + '?v=' + version); assert.ok(position > last, file + ': ' + module); last = position;
        }
        assert.ok(source.includes('story-adv.css?v=20261004-character-notice1'));
    }
    assert.doesNotMatch(read('story-adv.js'), /\bfetch\s*\(/);
    assert.match(read('story-adv.css'), /\.adv-portraits \{ position: absolute; inset: 0; z-index: 1/);
    assert.match(read('story-adv.css'), /overflow-wrap: anywhere/);
    assert.match(read('story-adv.css'), /prefers-reduced-motion/);
});

for (const mobile of [false, true]) {
    test(`${mobile ? 'phone' : 'PC'}: every ADV episode and tutorial requests its protagonist theme on intro, outcome and resume`, async () => {
        const { c } = runtime({ mobile });
        for (const number of [4, 5, 6, 7, 8, 9, 10]) {
            await c.StoryAdv.start(`episode${number}`);
            const episode = c.BattleStoryData.get(`episode${number}`);
            assert.equal(c.lastStoryThemeCharacter, episode.protagonist);
            c.__advTest.enterScene(episode.afterBattle.lose, 'lose');
            assert.equal(c.lastStoryThemeCharacter, episode.protagonist);
            c.__advTest.enterScene(episode.afterBattle.win, 'post');
            c.__advTest.savePosition(); c.StoryAdv.stop();
            await c.StoryAdv.start(`episode${number}`, true);
            assert.equal(c.lastStoryThemeCharacter, episode.protagonist);
        }
        for (const episode of c.__legacyTest.EPISODES) {
            await c.StoryAdv.playConversation(episode, episode.pre, { phase: 'pre', getActions: () => [] });
            assert.equal(c.lastStoryThemeCharacter, episode.protagonist);
            await c.StoryAdv.playConversation(episode, episode.postWin, { phase: 'post', getActions: () => [] });
            assert.equal(c.lastStoryThemeCharacter, episode.protagonist);
        }
    });
    test(`${mobile ? 'phone' : 'PC'}: continued-as-win episode10 CLEAR awards storyFestival through the existing progress hook`, async () => {
        const save = { [PROGRESS_KEY]: JSON.stringify(Object.fromEntries([4, 5, 6, 7, 8, 9].map(n => ['episode' + n, true]))) };
        const r = runtime({ main: true, mobile, save }), { c, elements, tick } = r;
        r.load('achievements.js'); c.Achievements.initialize();
        await c.StoryAdv.start('episode10');
        elements.get('adv-skip').onclick(); const skip = elements.get('adv-skip-yes').onclick(); await tick(1600); await skip;
        c.choice.onStart('foodTrap'); c.endGame('cpu'); c.StoryAdv.finishBattleReturn(); await tick(0);
        while (elements.get('adv-ending').hidden) { c.__advTest.advance(); await tick(1600); }
        elements.get('adv-ending').children[1].onclick(); await tick(0);
        elements.get('adv-skip').onclick(); await elements.get('adv-skip-yes').onclick(); await tick(1550);
        assert.equal(c.__advTest.S.stage, 'clear');
        assert.ok(c.Achievements.readLocal().unlocked.storyFestival);
        assert.equal(c.Achievements.readLocal().counters.festivalClears, 7);
        assert.equal(c.Achievements.readLocal().counters.matches, 0);
        assert.equal(c.Achievements.readLocal().counters.characterUses.akatsuki, 0);
        assert.equal(c.Achievements.readLocal().counters.storyClears, 0);
    });
}

function applyStoryFixes(source, number) {
    for (const row of read('docs/story/story-fixes.md').split(/\r?\n/)) {
        const cells = row.split('|').map(cell => cell.trim());
        if (/^F[1-5]$/.test(cells[1] || '') && cells[2] === `第${number}話`) source = source.replaceAll(cells[4], cells[5]);
    }
    return source;
}
const stripLineFinalPeriod = text => text.replace(/。$/, '');
const STORY_NAMES = { '千鶴': 'chizuru', '栞那': 'kanna', '舞依': 'mai', '拓海': 'takumi', '暁': 'akatsuki', '剛': 'tsuyoshi', 'クラスメート': 'classmate1', 'クラスメート2': 'classmate2' };
const NEW_EPISODES = [
    [5, 'mai', 'chizuru', 94, 'いい匂いのする方へ', 'もう少し、ここにいたい', '文化祭に来た舞依と拓海。いい匂いに誘われて入った教室で、舞依は千鶴と出会う。'],
    [6, 'mai', 'kanna', 166, 'もう少し、ここにいたい', 'うるさい二人が来た', 'カレーを食べながら、舞依は栞那に千鶴のことを聞いてみる。もう少しだけ、ここにいたくて――。'],
    [7, 'chizuru', 'akatsuki', 185, 'うるさい二人が来た', 'なんか気になる', '廊下から聞こえてくる、うるさい二人の声。注文を聞きに行った千鶴は、さっそくいじられて……。'],
    [8, 'akatsuki', 'kanna', 144, 'なんか気になる', '六人でやれば', '食事を終えても、なぜか席を立たない暁。千鶴をいじる理由は「おもろいから」――本当にそれだけ？'],
    [9, 'chizuru', 'mai', 178, '六人でやれば', 'また会おう', '昼を過ぎて大忙しの教室。人手が足りなくなった千鶴を、六人みんなで支えることに――。'],
    [10, 'akatsuki', 'chizuru', 156, 'また会おう', null, '文化祭もいよいよおしまい。片付けの合間に、千鶴は暁にもう一度勝負を申し込む。']
];
// Read source speech independently of the data. CLEAR/NEXT quotes are a teaser,
// and the BATTLE START metadata is not dialogue.
function scenarioSpeech(source, protagonist) {
    source = source.split(/^#+ 第\d話 CLEAR/m)[0].replace(/^# (?:BATTLE START|FINAL BATTLE)[^]*?^# BATTLE CLEAR/m, '# BATTLE CLEAR');
    let speaker, direction = ''; const positions = {}, result = [];
    for (const raw of source.split(/\r?\n/)) {
        const value = raw.trim();
        if (value.startsWith('【')) {
            const explicit = value.match(/^【(右|左)：([^／・】]+)/);
            if (explicit) positions[STORY_NAMES[explicit[2]]] = explicit[1] === '右' ? 'right' : 'left';
            direction = value.includes('消える') ? '' : value; continue;
        }
        const name = value.match(/^\*\*([^*]+)\*\*$/);
        if (name && STORY_NAMES[name[1]]) { speaker = STORY_NAMES[name[1]]; continue; }
        if (value.startsWith('**「')) {
            result.push({ speaker: 'narration', text: stripLineFinalPeriod(value.slice(3, -3)), direction: '' }); continue;
        }
        if (value.startsWith('「') && value.endsWith('」')) {
            result.push({ speaker, text: stripLineFinalPeriod(value.slice(1, -1)), direction,
                position: positions[speaker] || (speaker === protagonist ? 'right' : 'left') });
            direction = '';
        }
    }
    return result;
}

for (const [number, player, cpu, speechCount, title, nextTitle, summary] of NEW_EPISODES) {
    test(`episode${number}: data, staging and optional source comparisons`, async t => {
        const { c, warnings } = runtime(); const ep = c.BattleStoryData.get(`episode${number}`);
        assert.equal(ep.number, number); assert.equal(ep.title, title); assert.equal(ep.protagonist, player);
        assert.equal(ep.unlockRequires, `episode${number - 1}`);
        assert.deepEqual(clone(ep.battle), { after: 'battle-start', player, cpu, playerSkill: 'choose', cpuSkill: 'random', cpuPersonality: 'default' });
        assert.deepEqual(clone(ep.afterBattle), { win: 'win', lose: 'lose' });
        if (number < 10) assert.deepEqual(clone(ep.clear), { title, next: { number: number + 1, title: nextTitle } });
        else { assert.equal(ep.clear.title, title); assert.equal(ep.clear.next, undefined); assert.equal(ep.clear.arc.title, '出会い・文化祭編 CLEAR'); }
        const lines = ep.scenes.filter(s => s.id !== 'lose').flatMap(s => reviewedLines(number, s.id, s.lines)), spoken = lines.filter(l => l.text);
        assert.equal(spoken.length, speechCount);
        assert.equal(lines.filter(l => l.battle).length, 1);
        assert.equal(lines.find(l => l.battle).id, ep.battle.after);
        assert.equal(lines.at(-1).effect, 'fadeOut');
        assert.equal(ep.scenes.find(s => s.id === 'lose').provisional, number === 10 ? true : undefined);
        assert.equal(ep.scenes.find(s => s.id === 'lose').lines.length, 4);
        assert.equal(new Set(ep.scenes.map(s => s.id)).size, ep.scenes.length);
        assert.equal(new Set(ep.scenes.flatMap(s => s.lines.map(l => l.id))).size, ep.scenes.flatMap(s => s.lines).length);
        assert.equal(ep.summary, summary);
        const positions = {};
        for (const line of ep.scenes.flatMap(s => s.lines)) {
            assert.equal(typeof line.direction, 'string');
            if (!line.text) {
                if (/少し間/.test(line.direction)) assert.equal(line.wait, 800);
                if (line.direction.includes('消える')) assert.ok(line.hide.length);
                continue;
            }
            assert.doesNotMatch(line.text, /^(タップ。|少し歩く。|千鶴が振り返る。|画面暗転。)$/);
            if (line.speaker === 'narration') { assert.equal(line.name, '？？？'); assert.equal(line.offscreen, true); continue; }
            const character = c.BattleStoryAssets.characters[line.speaker];
            assert.ok(character.portraits[line.expression], line.id);
            const explicit = line.direction.match(/^【(右|左)：/);
            if (explicit) positions[line.speaker] = explicit[1] === '右' ? 'right' : 'left';
            assert.equal(line.position, positions[line.speaker] || (line.speaker === player ? 'right' : 'left'), line.id);
        }
        assert.equal(warnings.length, 0);
        await t.test('word-for-word scenario speech, speaker, direction and inherited position', t => {
            const file = `docs/story/episode${number}-scenario.md`;
            if (!fs.existsSync(path.join(root, file))) { t.skip('Source scenario is absent; only the word-for-word comparison is skipped.'); return; }
            const source = applyStoryFixes(read(file), number);
            const actual = clone(spoken.map(({ speaker, text, direction, position }) =>
                speaker === 'narration' ? { speaker, text, direction } : { speaker, text, direction, position }));
            assert.deepEqual(actual, scenarioSpeech(source, player));
            if (number >= 8) {
                const body = source.split(/^# 第\d+話 CLEAR/m)[0]
                    .replace(/^# (BATTLE START|FINAL BATTLE)[^]*?^# BATTLE CLEAR/m, '$1\n# BATTLE CLEAR');
                const timeline = []; let direction = '';
                for (const raw of body.split(/\r?\n/)) {
                    const value = raw.trim();
                    if (!value || value === '---' || /^タップ。?$/.test(value)) continue;
                    if (value.startsWith('**「')) { timeline.push({ text: stripLineFinalPeriod(value.slice(3, -3)), direction: '' }); continue; }
                    if (/^(?:#|\*\*)/.test(value)) continue;
                    if (value.startsWith('【') && !value.includes('消える')) { direction = value; continue; }
                    if (value.startsWith('「') && value.endsWith('」')) {
                        timeline.push({ text: stripLineFinalPeriod(value.slice(1, -1)), direction }); direction = '';
                    } else timeline.push({ text: '', direction: value });
                }
                assert.deepEqual(clone(lines.map(({ text, direction }) => ({ text, direction }))), timeline,
                    'every spoken and no-text line stays in source order');
            }
        });
        await t.test('word-for-word loss speech and direction', t => {
            const file = number >= 8 ? `docs/story/lose-lines-ep${number}.md` : 'docs/story/lose-lines-ep5-7.md';
            if (!fs.existsSync(path.join(root, file))) { t.skip('Source loss dialogue is absent; only the word-for-word comparison is skipped.'); return; }
            const section = read(file).split(new RegExp(`## 第${number}話[^\\n]*\\n`))[1].split(/\n## /)[0];
            const expected = [...section.matchAll(/(【(右|左)：([^／】]+)[^】]*】)([^「]+)「([^」]*)」/g)].map(([, direction, side, name, speaker, text]) => {
                assert.equal(name, speaker);
                return { direction, position: side === '右' ? 'right' : 'left', speaker: STORY_NAMES[name], text: stripLineFinalPeriod(text) };
            });
            const actual = clone(reviewedLines(number, 'lose', ep.scenes.find(s => s.id === 'lose').lines).map(({ direction, position, speaker, text }) => ({ direction, position, speaker, text })));
            assert.deepEqual(actual, expected);
        });
    });
}

test('episode5–10 publish copies skip only missing original comparisons', async () => {
    const cases = new Map(), skipped = []; let assertions = 0;
    const portableFs = Object.create(fs);
    const missing = file => /(?:episode(?:[56789]|10)-scenario|lose-lines-ep5-7|lose-lines-ep(?:[89]|10))\.md$/.test(file);
    portableFs.existsSync = file => missing(file) ? false : fs.existsSync(file);
    portableFs.readFileSync = (file, ...args) => { assert.equal(missing(file), false); return fs.readFileSync(file, ...args); };
    const countedAssert = new Proxy(assert, { get(target, key) {
        return typeof target[key] === 'function' ? (...args) => { assertions++; return target[key](...args); } : target[key];
    } });
    vm.runInNewContext(read('tests/story-adv.test.cjs'), { __dirname, URL, require(name) {
        if (name === 'node:test') return (name, callback) => cases.set(name, callback);
        if (name === 'node:fs') return portableFs;
        if (name === 'node:assert/strict') return countedAssert;
        return require(name);
    } });
    for (const number of [5, 6, 7, 8, 9, 10]) await cases.get(`episode${number}: data, staging and optional source comparisons`)({
        test: async (name, callback) => callback({ skip: reason => skipped.push(reason) })
    });
    assert.equal(skipped.length, 12); assert.ok(skipped.every(reason => reason.includes('only the word-for-word comparison')));
    assert.ok(assertions > 1000, 'all data/staging checks still run');
});

test('portrait expressions are exactly the approved registrations, including kitchen', () => {
    const { c } = runtime(); const a = c.BattleStoryAssets;
    for (const [id, character] of Object.entries(a.characters)) {
        const expressions = fs.readdirSync(path.join(root, 'assets/battle-images/story/portraits'))
            .filter(f => f.startsWith(id + '-') && f.endsWith('.webp')).map(f => f.slice(id.length + 1, -5));
        assert.deepEqual(clone(Object.keys(character.portraits)).sort(), expressions.sort());
        for (const expression of expressions) {
            assert.equal(character.portraits[expression], `assets/battle-images/story/portraits/${id}-${expression}.webp`);
        }
        assert.equal(a.portraitPath(id, 'unlisted'), character.portraits.normal);
    }
    assert.equal(a.backgrounds['festival-kitchen'], 'assets/battle-images/story/backgrounds/festival-kitchen.webp');
});

test('episodes4–10 omit only a single displayed line-final Japanese full stop', () => {
    const { c } = runtime();
    for (const number of [4, 5, 6, 7, 8, 9, 10]) {
        const ep = c.BattleStoryData.get(`episode${number}`);
        for (const scene of ep.scenes) for (const line of scene.lines) {
            assert.doesNotMatch(line.text, /。$/, `${ep.id}/${scene.id}/${line.id || line.direction}`);
        }
    }
    const ep4 = c.BattleStoryData.get('episode4');
    assert.equal(ep4.scenes[0].lines[0].text, 'カレーよし。おにぎりもよし');
    assert.equal(ep4.scenes.find(s => s.id === 'win').lines.find(l => l.speaker === 'announce').text.endsWith('。'), false);
    assert.equal(c.BattleStoryData.get('episode7').scenes.find(s => s.id === 'lose').lines.at(-1).text, 'もう一回。次は勝つ！');
    assert.equal(c.BattleStoryData.get('episode8').scenes[0].lines.find(l => l.speaker === 'akatsuki' && l.text === '……').text, '……');
    assert.equal(stripLineFinalPeriod('二文。次の文。'), '二文。次の文');
    assert.equal(stripLineFinalPeriod('。。'), '。', 'normalization strips exactly one full stop');
    for (const text of ['……', 'なに？', '気付いてた！', '！？', '、']) assert.equal(stripLineFinalPeriod(text), text);
});

test('episode8 backgrounds, scene chain, pause and expression guide follow the owner directions', () => {
    const { c } = runtime(); const ep = c.BattleStoryData.get('episode8');
    assert.deepEqual(clone(ep.scenes.map(s => s.id)), ['scene1', 'scene2', 'scene3', 'win', 'scene4', 'scene5', 'lose']);
    assert.ok(ep.scenes.every(s => s.background === 'festival-classroom'));
    assert.ok(ep.scenes.flatMap(s => s.lines).every(l => l.background === undefined || l.background === 'festival-classroom'));
    assert.equal(ep.scenes.find(s => s.id === 'win').next, 'scene4');
    assert.equal(ep.scenes.find(s => s.id === 'scene4').next, 'scene5');
    assert.equal(ep.scenes.find(s => s.id === 'scene5').next, undefined);
    const lines = ep.scenes.flatMap(s => s.lines);
    const pause = lines.find(l => l.direction === '一瞬の間。');
    assert.equal(pause.speaker, 'narration'); assert.equal(pause.text, ''); assert.equal(pause.wait, 800);
    for (const [direction, expression] of [
        ['満足', 'happy'], ['少し睨む', 'cold'], ['少し柔らかく', 'gentle'], ['小さく笑う', 'laugh'],
        ['反応', 'pout'], ['びくっ', 'frozen'], ['手を引っ込める', 'frozen'],
        ['薄い笑顔', 'smug'], ['少し挑発', 'smug'], ['少し得意げ', 'smug'], ['少し悔しそう', 'sad'],
        ['少し意地悪', 'smug'], ['少し笑う', 'laugh'], ['少し考える', 'thinking'], ['不満', 'pout']
    ]) {
        const matches = lines.filter(l => l.direction.endsWith(`／${direction}】`));
        assert.ok(matches.length, direction);
        matches.forEach(line => assert.equal(line.expression, expression, line.direction));
    }
    assert.equal(ep.scenes.find(s => s.id === 'lose').provisional, undefined);
    assert.equal(ep.clear.next.title, '六人でやれば');
});

test('episode8 silent angry direction updates only a shown Chizuru and preserves her position', async () => {
    for (const mobile of [false, true]) {
        const r = runtime({ mobile }); const { c, elements, tick } = r;
        await c.StoryAdv.start('episode8');
        const S = c.__advTest.S, scene = S.episode.scenes.find(s => s.id === 'scene5');
        const lineIndex = scene.lines.findIndex(l => l.direction === '千鶴がむっとする。');
        const direction = scene.lines[lineIndex];
        assert.equal(direction.speaker, 'narration'); assert.equal(direction.text, '');
        assert.equal(direction.show[0].onlyIfShown, true);
        const akatsuki = { id: 'akatsuki', position: 'right', expression: 'smile' };
        S.actors.clear(); S.actors.set('akatsuki', akatsuki);
        c.__advTest.stageLine(direction);
        assert.deepEqual(clone([...S.actors.values()]), [akatsuki], 'absent Chizuru is never introduced');
        S.actors.set('chizuru', { id: 'chizuru', position: 'farLeft', expression: 'normal' });
        c.__advTest.stageLine(direction);
        assert.deepEqual(clone(S.actors.get('chizuru')), { id: 'chizuru', position: 'farLeft', expression: 'pout' });
        assert.deepEqual(clone(S.actors.get('akatsuki')), akatsuki);
        assert.ok(c.__advTest.episodeImages(S.episode).includes(c.BattleStoryAssets.characters.chizuru.portraits.pout));
        Object.assign(S, { sceneId: scene.id, lineIndex: lineIndex - 1, stage: 'post' });
        c.__advTest.renderCurrent();
        c.__advTest.advance(); await tick(0);
        assert.equal(S.actors.has('chizuru'), false, 'actual preceding Akatsuki line keeps Chizuru offscreen');
        assert.ok(!S.backlog.some(line => line.text === direction.direction));
        c.__advTest.savePosition();
        const reload = runtime({ mobile, save: Object.fromEntries(r.store) });
        await reload.c.StoryAdv.start('episode8', true);
        assert.equal(reload.c.__advTest.S.actors.has('chizuru'), false);
        c.__advTest.openLog(true);
        assert.doesNotMatch(elements.get('adv-log').html || '', /provisional|確認待ち/);
    }
});

test('unlock cards follow 4 → 5 → 6 → 7 → 8 → 9 and preserve unknown progress', async () => {
    const { c, Element } = runtime();
    const cards = new Element(); c.StoryAdv.appendEpisodeCards(cards);
    for (const [number, , , , , , summary] of NEW_EPISODES) {
        const card = cards.children.find(card => card.children.some(el => el.getAttribute?.('data-story-episode-id') === `episode${number}`));
        assert.equal(card.children.find(el => el.className === 'story-episode-summary').textContent, summary);
    }
    function locked(number) {
        const list = new Element(); c.StoryAdv.appendEpisodeCards(list);
        return list.children.find(card => card.children.some(el => el.getAttribute?.('data-story-episode-id') === `episode${number}`)).children.find(el => el.tagName === 'button').disabled;
    }
    assert.equal(locked(4), false); for (const n of [5, 6, 7, 8, 9, 10]) assert.equal(locked(n), true);
    for (const n of [4, 5, 6, 7, 8, 9]) {
        c.BattleStoryProgress.complete(`episode${n}`); assert.equal(locked(n + 1), false);
        if (n < 8) assert.equal(locked(n + 2), true);
    }
});

test('offscreen dialogue keeps names but never stages or preloads a portrait', async () => {
    for (const [number, expectedNames] of [[6, ['？？？', '？？？']], [7, ['剛', '暁', '剛', '暁']], [9, ['？？？', '？？？']]]) {
        const r = runtime(), { c, elements, requests, preloaded } = r;
        const ep = c.BattleStoryData.get(`episode${number}`);
        const lines = ep.scenes.flatMap(s => s.lines).filter(l => l.offscreen);
        assert.equal(lines.length, expectedNames.length);
        const files = c.__advTest.episodeImages({ scenes: [{ lines }] }); assert.equal(files.length, 0);
        c.BattleStoryData.register({ id: 'voices', number, scenes: [{ id: 'voices', lines }] });
        await c.StoryAdv.start('voices'); await r.tick(650);
        for (let i = 0; i < lines.length; i++) {
            Object.assign(c.__advTest.S, { lineIndex: i }); c.__advTest.renderCurrent(); await r.tick(650);
            assert.equal(elements.get('adv-name').textContent, expectedNames[i]);
            assert.equal(elements.get('adv-text').textContent, lines[i].text);
            assert.equal(c.__advTest.S.actors.size, 0); assert.equal(elements.get('adv-portraits').children.length, 0);
        }
        assert.equal(requests.length, 0); assert.equal(preloaded.length, 0);
    }
});

test('episode9 classmates use their registered portraits in preload and playback', async () => {
    const r = runtime(), { c, elements, requests } = r;
    const lines = c.BattleStoryData.get('episode9').scenes.flatMap(s => s.lines).filter(l => ['classmate1', 'classmate2'].includes(l.speaker));
    assert.equal(lines.length, 4);
    assert.deepEqual(clone(lines.map(l => l.expression)), ['sick', 'sick', 'worried', 'smile']);
    c.BattleStoryData.register({ id: 'classmates', scenes: [{ id: 'classmates', lines }] });
    await c.StoryAdv.start('classmates');
    for (let i = 0; i < lines.length; i++) {
        Object.assign(c.__advTest.S, { lineIndex: i }); c.__advTest.renderCurrent(); await r.tick(650);
        assert.equal(elements.get('adv-name').textContent, c.BattleStoryAssets.characters[lines[i].speaker].name);
        const actor = elements.get('adv-portraits').children.find(n => n.dataset.actor === lines[i].speaker && !n.classList.contains('leaving'));
        assert.equal(actor.children[0].src, c.BattleStoryAssets.portraitPath(lines[i].speaker, lines[i].expression));
    }
    assert.ok(requests.length); assert.ok(requests.every(file => c.BattleStoryAssets.paths().includes(file)));
    assert.deepEqual(r.warnings, []);
});

test('episode9 backgrounds, left-side Mai, expressions and in-room Tsuyoshi follow the script', async () => {
    const { c, elements, requests } = runtime(); const ep = c.BattleStoryData.get('episode9');
    assert.deepEqual(clone(ep.scenes.map(s => [s.id, s.background])), [
        ['scene1', 'festival-kitchen'], ['scene2', 'festival-classroom'],
        ['scene3', 'festival-kitchen'], ['scene4', 'festival-kitchen'], ['scene5', 'festival-kitchen'],
        ['scene6', 'festival-classroom'], ['scene7', 'festival-classroom'],
        ['win', 'festival-classroom'], ['lose', 'festival-classroom']
    ]);
    assert.equal(ep.defaultPositions.mai, 'left');
    ep.scenes.flatMap(s => s.lines).filter(l => l.speaker === 'mai').forEach(l => assert.equal(l.position, 'left'));
    for (const [speaker, cue, expression] of [
        ['chizuru', '忙しそう', 'flustered'], ['chizuru', '心配', 'worried'],
        ['kanna', '少し強め', 'serious'], ['akatsuki', '少し強め', 'serious'],
        ['akatsuki', '少し照れ隠し', 'embarrassed'], ['chizuru', '少し迷う', 'thinking'],
        ['akatsuki', 'すぐ返す', 'normal'], ['akatsuki', '小さく', 'normal'],
        ['mai', '少し冷たい', 'cold'], ['mai', '少し悔しそう', 'sad'],
        ['chizuru', 'むっとする', 'pout'], ['akatsuki', '一瞬止まる', 'frozen']
    ]) {
        const matches = ep.scenes.flatMap(s => s.lines).filter(l => l.speaker === speaker && l.direction.endsWith(`／${cue}】`));
        assert.ok(matches.length, cue); matches.forEach(l => assert.equal(l.expression, expression, l.id));
    }
    assert.equal(ep.scenes.find(s => s.id === 'lose').provisional, undefined);
    await c.StoryAdv.start('episode9');
    const scene = ep.scenes.find(s => s.id === 'scene3');
    const index = scene.lines.findIndex(l => l.text === 'カレー二つ入りまーす！');
    assert.equal(scene.lines[index - 1].direction, '剛の大きな声が聞こえる');
    const line = scene.lines[index]; assert.equal(line.speaker, 'tsuyoshi'); assert.equal(line.position, 'left');
    assert.notEqual(line.offscreen, true);
    Object.assign(c.__advTest.S, { sceneId: scene.id, lineIndex: index }); c.__advTest.renderCurrent();
    assert.equal(elements.get('adv-name').textContent, '剛'); assert.equal(elements.get('adv-text').textContent, line.text);
    assert.equal(c.__advTest.S.actors.has('tsuyoshi'), true);
    assert.ok(requests.includes(c.BattleStoryAssets.characters.tsuyoshi.portraits.normal));
});

test('episode backgrounds, notify, intro dimming and inherited positions match the staging brief', async () => {
    const { c, elements, tick, calls } = runtime();
    const ep5 = c.BattleStoryData.get('episode5'), ep6 = c.BattleStoryData.get('episode6'), ep7 = c.BattleStoryData.get('episode7');
    assert.deepEqual(clone(ep5.scenes.map(s => s.background)), ['festival-hallway', ...Array(4).fill('festival-classroom')]);
    assert.equal(ep6.scenes.find(s => s.id === 'scene6').background, 'festival-kitchen');
    assert.equal(ep7.scenes[0].background, 'festival-kitchen');
    assert.ok(ep7.scenes.slice(1).every(s => s.background === 'festival-classroom'));
    for (const [ep, speaker, direction, expression] of [
        [ep5, 'mai', '【舞依・少し冷たい】', 'cold'], [ep5, 'takumi', '【左：拓海／焦り】', 'flustered'],
        [ep6, 'kanna', '【左：栞那／興味あり】', 'thinking'], [ep6, 'kanna', '【左：栞那／嫌そうな顔】', 'pout'],
        [ep6, 'chizuru', '【千鶴／少し嫌そう】', 'pout'], [ep6, 'mai', '【右：舞依／興味津々】', 'thinking'],
        [ep7, 'tsuyoshi', '【左：剛／元気】', 'happy'], [ep7, 'akatsuki', '【暁／薄く笑う】', 'smug'],
        [ep7, 'akatsuki', '【左：暁／少し悔しそう】', 'sad']
    ]) {
        const matches = ep.scenes.flatMap(s => s.lines).filter(l => l.speaker === speaker && l.direction === direction);
        assert.ok(matches.length); matches.forEach(line => assert.equal(line.expression, expression));
    }
    const intro = ep7.scenes.find(s => s.id === 'scene4'); assert.equal(intro.battleIntro, true); assert.equal(intro.lines[0].effect, 'battleTease');
    await c.StoryAdv.start('episode7'); c.__advTest.enterScene('scene4', 'pre');
    assert.ok(elements.get('story-adv').classList.contains('adv-battle-intro'));
    assert.equal(elements.get('adv-effect').className, 'adv-effect battle-tease');
    await tick(950); assert.equal(elements.get('adv-text').textContent, 'じゃあやろ！');
    c.__advTest.enterScene('win', 'post'); assert.equal(elements.get('story-adv').classList.contains('adv-battle-intro'), false);
    const notify = ep6.scenes.find(s => s.id === 'scene3').lines.find(l => l.se === 'notify');
    assert.equal(notify.direction, '連絡先交換のSE。'); assert.equal(notify.text, '');
    await c.StoryAdv.start('episode6'); Object.assign(c.__advTest.S, { sceneId: 'scene3', lineIndex: ep6.scenes.find(s => s.id === 'scene3').lines.indexOf(notify) });
    c.__advTest.renderCurrent(); assert.ok(calls.includes('notify')); await tick(350);
    assert.equal(elements.get('adv-text').textContent, 'やった！');
    assert.match(read('story-adv.css'), /\.adv-battle-intro \.adv-background \{ filter: brightness\(\.55\)/);
    assert.match(read('story-adv.css'), /\.adv-shake \.adv-background/);
});

test('notify is a short two-note WebAudio cue respecting both mute and volume on both pages', () => {
    for (const file of ['audio.js', 'mobile/audio-sp.js']) {
        const tones = [], levels = []; let enabled = false, volume = .4;
        class AudioContext {
            constructor() { this.currentTime = 10; }
            resume() { return Promise.resolve(); }
            createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { levels.push(value); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
            createOscillator() {
                const tone = { frequency: {}, connect() {}, disconnect() {}, start(time) { this.startAt = time; }, stop(time) { this.stopAt = time; } };
                tones.push(tone); return tone;
            }
        }
        const c = vm.createContext({ window: { AudioContext }, getBgmEnabled: () => enabled, getBgmVolume: () => volume });
        const source = read(file); vm.runInContext(source.slice(source.indexOf('// ADV cues use')), c);
        c.window.playStoryCue('notify'); assert.equal(tones.length, 0);
        enabled = true; c.window.playStoryCue('notify');
        assert.deepEqual(tones.map(t => t.frequency.value), [783.99, 1046.5]);
        assert.deepEqual(levels, [.1 * .4, .1 * .4]);
        assert.ok(tones[1].startAt > tones[0].startAt); assert.ok(tones.at(-1).stopAt - 10 < .4);
        volume = 0; c.window.playStoryCue('notify'); assert.equal(tones.length, 2);
    }
});

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    for (const [number, player, cpu] of NEW_EPISODES) {
        test(`${label}: episode${number} preparation and battle use the correct player/opponent artwork`, async () => {
            const r = runtime({ main: true, mobile }), { c, elements, Element, load } = r;
            for (const id of ['start-cpu-setup-stage', 'start-character-step', 'start-character-cards', 'start-skill-step', 'start-skill-footer', 'start-skill-list', 'start-skill-detail', 'start-skill-message', 'start-setup-button', 'start-back-menu-button', 'start-cpu-setup-title', 'start-cpu-setup-subtitle', 'start-cpu-personality', 'start-turn-stage', 'menu-cpu-button']) { const node = new Element(); node.id = id; }
            Object.assign(c, { getUserProfile: () => ({ favoriteCharacterId: 'akatsuki', favoriteSkillKey: 'tasteThief' }), setupMatchAutosaveOnce() {}, setupMatchExitGuardOnce() {}, renderUserStageProfile() {}, renderCoinStageProfile() {}, updateResumeMatchButtonVisibility() {}, startMenuFloatingBackground() {} });
            c.setupStartOverlay(); const ep = c.BattleStoryData.get(`episode${number}`);
            c.openStorySkillChoice(ep, skill => c.startStoryCpuBattle(ep, skill), () => {});
            assert.equal(elements.get('start-cpu-setup-title').textContent, `第${number}話 対戦準備`);
            assert.equal(elements.get('start-cpu-setup-subtitle').textContent, `${c.BattleStoryAssets.characters[player].name}のスキルを選択`);
            assert.match(elements.get('start-skill-list').html, /class="start-skill-tile active" data-pick-skill-key="tasteThief"/);
            elements.get('start-setup-button').listeners.click();
            assert.deepEqual(clone(c.GameState.characterIds), { player, cpu });
            assert.equal(c.GameState.characterNames.player, c.BattleStoryAssets.characters[player].name);
            assert.equal(c.GameState.characterNames.cpu, c.BattleStoryAssets.characters[cpu].name);
            assert.equal(c.GameState.players.player.selectedSkillKey, 'tasteThief');
            assert.ok(['makanaiSupply', 'aceProcurement'].includes(c.GameState.players.cpu.selectedSkillKey));
            assert.equal(c.GameState.settings.cpuPersonality, 'default'); assert.equal(c.shouldAutosaveCurrentMatch(), false);
            for (const [side, id] of [['player', player], ['cpu', cpu]]) {
                assert.ok(c.getSkillCutinImagePathForSide(side).endsWith(`/skill-cutins/${id}-skill-cutin.webp`));
                assert.ok(c.getBattleModeCutinImagePathForSide(side).endsWith(`/battle-mode-cutins/${id}-battle-mode-cutin.webp`));
            }
            load(mobile ? 'mobile/render-sp.js' : 'render.js');
            const playerIcon = new Element(), cpuIcon = new Element(); playerIcon.className = 'char-chizuru'; cpuIcon.className = 'char-mai';
            c.document.querySelector = selector => selector === '.player-icon' ? playerIcon : selector === '.cpu-icon' ? cpuIcon : null;
            c.GameState.players.player.battleALaCarteModeActive = true; c.applyCharacterSkins();
            assert.ok(playerIcon.classList.contains(`char-${player}`)); assert.ok(cpuIcon.classList.contains(`char-${cpu}`));
            assert.ok(playerIcon.classList.contains('battle-mode-chef')); assert.equal(cpuIcon.classList.contains('battle-mode-chef'), false);
            for (const id of [player, cpu]) {
                const css = read(mobile ? 'mobile/style-sp.css' : 'style.css');
                assert.ok(css.includes(`char-${id}`)); assert.ok(css.includes(`${id}-battle-mode-icon`));
                assert.ok(fs.existsSync(path.join(root, `assets/battle-images/character-icons/${id}-icons.webp`)));
            }
        });
        for (const winner of ['player', 'cpu']) test(`${label}: episode${number} ${winner} result → dialogue → clear/retry`, async () => {
            const r = runtime({ main: true, mobile }), { c, elements, tick, store, Element } = r;
            for (const id of ['result-exit-button', 'final-field-exit-button']) { const el = new Element('button'); el.id = id; }
            await c.StoryAdv.start(`episode${number}`); const S = c.__advTest.S;
            let beforeSteps = 0;
            while (!c.choice && beforeSteps++ < 300) { c.__advTest.advance(); await tick(1600); }
            assert.ok(beforeSteps < 300); assert.equal(S.stage, 'battle');
            c.choice.onStart('foodTrap'); c.endGame(winner);
            assert.equal(S.active, false); assert.equal(c.__storyResultPending, true);
            assert.equal(elements.get('result-exit-button').textContent, 'ストーリーへ進む');
            c.StoryAdv.finishBattleReturn(); await tick(0); assert.equal(S.sceneId, winner === 'player' ? 'win' : 'lose');
            assert.equal(c.__storyActiveEpisodeId, null); assert.equal(c.GameState.storyEpisodeId, null);
            let steps = 0;
            while (S.active && elements.get('adv-ending').hidden && steps++ < 300) { c.__advTest.advance(); await tick(1600); }
            assert.ok(steps < 300);
            const labels = elements.get('adv-ending').children.map(el => el.textContent);
            assert.ok(!labels.some(text => /仮|provisional/.test(text)));
            if (winner === 'player') {
                assert.equal(S.stage, 'clear'); assert.equal(c.BattleStoryProgress.load()[`episode${number}`], true);
                assert.equal(JSON.parse(store.get(ADV_KEY)).resume, null);
                if (number < 10) assert.ok(labels.some(text => text.startsWith(`NEXT 第${number + 1}話`)));
                else assert.ok(!labels.some(text => text.startsWith('NEXT')));
                const expectedSpeech = S.episode.scenes.filter(s => s.id !== 'lose' && (s.id === 'win' || (number === 6 && s.id === 'scene6') || (number === 7 && ['scene5', 'scene6'].includes(s.id)) || ([8, 10].includes(number) && ['scene4', 'scene5'].includes(s.id)))).flatMap(s => s.lines).filter(l => l.text).map(l => l.text);
                assert.deepEqual(clone(S.backlog.slice(-expectedSpeech.length).map(l => l.text)), clone(expectedSpeech));
            } else {
                assert.deepEqual(labels, ['もう一度挑戦', '勝ったことにして進める', 'ストーリー選択へ戻る']);
                assert.equal(!!c.BattleStoryProgress.load()[`episode${number}`], false);
                elements.get('adv-ending').children[0].onclick(); assert.equal(S.stage, 'battle'); assert.equal(c.choice.episode.id, `episode${number}`);
            }
            c.StoryAdv.stop(); c.beginMatchByRole('先攻');
            assert.equal(c.GameState.storyEpisodeId, null); assert.equal(c.GameState.achievementStory, false); assert.equal(c.shouldAutosaveCurrentMatch(), true);
            assert.ok(['chizuru', 'mai', 'takumi', 'akatsuki'].includes(c.GameState.characterIds.cpu));
        });
    }
}

test('post-battle scene chains resume at their saved line with only the travelled dialogue in the backlog', async () => {
    for (const [number, sceneId] of [[6, 'scene6'], [7, 'scene5'], [7, 'scene6'], [8, 'scene4'], [8, 'scene5']]) {
        const r = runtime(); await r.c.StoryAdv.start(`episode${number}`);
        const ep = r.c.BattleStoryData.get(`episode${number}`), scene = ep.scenes.find(s => s.id === sceneId);
        const lineIndex = scene.lines.findIndex(l => l.text) + 1;
        Object.assign(r.c.__advTest.S, { sceneId, lineIndex, stage: 'post' }); r.c.__advTest.savePosition();
        const reload = runtime({ save: Object.fromEntries(r.store) }); await reload.c.StoryAdv.start(`episode${number}`, true);
        assert.equal(reload.c.__advTest.S.sceneId, sceneId); assert.equal(reload.c.__advTest.S.lineIndex, lineIndex);
        assert.equal(reload.elements.get('adv-text').textContent, scene.lines[lineIndex].text);
        const travelled = ep.scenes.slice(0, ep.scenes.indexOf(scene)).flatMap(s => s.lines).filter(l => l.text);
        assert.equal(reload.c.__advTest.S.backlog.length, travelled.length + scene.lines.slice(0, lineIndex + 1).filter(l => l.text).length);
    }
    for (const number of [5, 6, 7, 8, 9]) {
        const r = runtime(); await r.c.StoryAdv.start(`episode${number}`);
        const ep = r.c.__advTest.S.episode, scene = ep.scenes.find(s => s.lines.some(l => l.battle));
        Object.assign(r.c.__advTest.S, { sceneId: scene.id, lineIndex: scene.lines.findIndex(l => l.battle), stage: 'battle' });
        r.c.__advTest.chooseBattle();
        const reload = runtime({ save: Object.fromEntries(r.store) }); await reload.c.StoryAdv.start(`episode${number}`, true);
        assert.equal(reload.c.choice.episode.id, `episode${number}`);
        assert.equal(reload.c.__advTest.S.battleActive, false);
        assert.equal(reload.c.__advTest.S.sceneId, scene.id);
        assert.equal(reload.c.__advTest.S.stage, 'battle');
    }
});

test('new clears never count toward tutorial achievements', () => {
    const { c, load } = runtime(); load('achievements.js');
    for (const n of [4, 5, 6, 7, 8, 9, 10]) c.BattleStoryProgress.complete(`episode${n}`);
    assert.equal(c.Achievements.readLocal().counters.storyClears, 0);
});

function pressKey(r, key, { up = false, repeat = false, target, shiftKey = false } = {}) {
    let prevented = false;
    r.c.document.listeners[up ? 'keyup' : 'keydown']({ key, repeat, shiftKey,
        target: target || r.elements.get('adv-dialogue'), preventDefault() { prevented = true; } });
    return prevented;
}

test('every raw expression in episodes1–10 and each silent show resolves to its own registered file', () => {
    const { c } = runtime();
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        let raw = c.__legacyTest.EPISODES.find(ep => ep.id === `episode${n}`);
        // Check the source before registry validation can replace an unknown key with normal.
        if (n >= 4) vm.runInNewContext(read(`story-data/episode${n}.js`), { window: { BattleStoryData: { register: ep => raw = ep } } });
        assert.equal(raw.arc, n <= 3 ? 'reunion' : 'festival');
        const scenes = n <= 3 ? ['pre', 'postWin', 'postLose'].map(id => ({ id, lines: raw[id] || [] })) : raw.scenes;
        for (const scene of scenes) for (const [index, line] of scene.lines.entries()) {
            const actors = [...(!['narration', 'announce'].includes(line.speaker) ? [{ id: line.speaker, expression: line.expression }] : []), ...(line.show || [])];
            for (const actor of actors) {
                const expression = actor.expression || 'normal';
                const expected = `assets/battle-images/story/portraits/${actor.id}-${expression}.webp`;
                const location = `${raw.id}/${scene.id}/${line.id || index}/${actor.id}/${expression}`;
                assert.equal(c.BattleStoryAssets.characters[actor.id]?.portraits[expression], expected, location);
                assert.equal(c.BattleStoryAssets.portraitPath(actor.id, expression), expected, location);
                assert.ok(fs.statSync(path.join(root, expected)).size > 0, location);
            }
            assert.doesNotMatch(line.text, /。$/);
        }
        if (n >= 4) assert.equal(raw.scenes.find(s => s.id === 'lose').provisional, n === 10 ? true : undefined);
    }
});

test('all explicit facial directions agree with the expression catalog while Japanese directions stay intact', t => {
    const file = 'docs/story/expression-catalog.md';
    if (!fs.existsSync(path.join(root, file))) { t.skip('optional expression catalog is absent'); return; }
    const { c } = runtime(); const mappings = {}; let id;
    for (const row of read(file).split(/\r?\n/)) {
        const heading = row.match(/^## .*（([^）]+)）/);
        if (heading) { id = heading[1]; mappings[id] = {}; }
        const key = row.match(/^\| `([^`]+)`/);
        if (key && id) for (const [, cue] of row.split('|')[3].matchAll(/「([^」]+)」/g)) mappings[id][cue] = key[1];
    }
    for (const ep of c.BattleStoryData.all()) for (const line of ep.scenes.flatMap(s => s.lines)) {
        const cue = line.direction?.match(/[／・]([^】]+)】$/)?.[1];
        const expected = mappings[line.speaker]?.[cue];
        if (expected) assert.equal(line.expression, expected, `${ep.id}: ${line.direction}`);
    }
});

test('fixes F1–F5 are applied only in data and approval flags follow the owner decisions', () => {
    const { c } = runtime(), ep7 = c.BattleStoryData.get('episode7');
    assert.equal(ep7.clear.next.title, 'なんか気になる');
    for (const [n, original, fixed] of [
        [7, '俺が見つけたみたいに言うな', 'せやろ、俺が見つけてんで'],
        [7, 'お前が言うたんやろが', '店の前で騒いでただけやろが'],
        [8, '昨日会ったばっかりなのにね', 'さっき会ったばっかりなのにね'],
        [10, 'そのくだり昨日もやったやろ', 'そのくだりさっきもやったやろ']
    ]) {
        const ep = c.BattleStoryData.get(`episode${n}`), texts = ep.scenes.flatMap(s => reviewedLines(n, s.id, s.lines)).map(l => l.text);
        assert.ok(texts.includes(fixed)); assert.ok(!texts.includes(original));
        const file = `docs/story/episode${n}-scenario.md`;
        if (fs.existsSync(path.join(root, file))) { assert.ok(read(file).includes(original)); assert.ok(applyStoryFixes(read(file), n).includes(fixed)); }
    }
});

test('arc headings group tutorials and festival; ADV toolbar carries the arc and episode title', async () => {
    const r = runtime(), { c, elements, Element } = r;
    const list = new Element(); list.id = 'story-episode-list'; c.__legacyTest.S.progress = c.BattleStoryProgress.load(); c.__legacyTest.renderEpisodeList();
    assert.match(list.html, /story-arc-heading">再会編/);
    assert.ok(list.children.some(n => n.className === 'story-arc-heading' && n.textContent === '出会い・文化祭編'));
    assert.deepEqual(clone(c.__legacyTest.EPISODES.map(ep => ep.arc)), ['reunion', 'reunion', 'reunion']);
    await c.StoryAdv.start('episode10');
    assert.equal(elements.get('adv-episode-label').textContent, '出会い・文化祭編　第10話「また会おう」');
});

for (const mobile of [false, true]) {
    for (const route of ['normal', 'skip', 'resume', 'fast']) test(`${mobile ? 'phone' : 'PC'}: FINAL BATTLE precedes skill selection via ${route}`, async () => {
        const r = runtime({ mobile }), { c, elements, tick } = r;
        await c.StoryAdv.start('episode10');
        const ep = c.BattleStoryData.get('episode10'), sc = ep.scenes.find(s => s.lines.some(l => l.finalBattle));
        const marker = sc.lines.findIndex(l => l.finalBattle);
        Object.assign(c.__advTest.S, { sceneId: sc.id, lineIndex: marker, stage: route === 'resume' ? 'battle' : 'pre' });
        let playing;
        if (route === 'skip') { elements.get('adv-skip').onclick(); playing = elements.get('adv-skip-yes').onclick(); }
        else if (route === 'resume') { c.__advTest.savePosition(); c.StoryAdv.stop(); playing = c.StoryAdv.start('episode10', true); await tick(0); }
        else { if (route === 'fast') c.__advTest.toggleFastForward(); playing = c.__advTest.renderCurrent(); }
        assert.equal(c.choice, undefined);
        assert.equal(elements.get('adv-effect').children.at(-1).textContent, 'FINAL BATTLE');
        assert.ok(elements.get('adv-effect').classList.contains('final-battle'));
        const duration = route === 'fast' ? 100 : 1600;
        await tick(duration - 1); assert.equal(c.choice, undefined);
        await tick(1); await playing;
        assert.equal(c.choice.episode.id, 'episode10'); assert.equal(c.__advTest.S.stage, 'battle');
    });

    test(`${mobile ? 'phone' : 'PC'}: Akatsuki monologue has no portrait, retains name/style and pauses`, async () => {
        const r = runtime({ mobile }), { c, elements, tick } = r;
        await c.StoryAdv.start('episode10'); const ep = c.BattleStoryData.get('episode10'), sc = ep.scenes.find(s => s.id === 'scene5');
        const first = sc.lines.findIndex(l => l.monologue), spoken = sc.lines.filter(l => l.monologue);
        assert.equal(spoken.length, 6); assert.ok(spoken.every(l => l.speaker === 'akatsuki'));
        Object.assign(c.__advTest.S, { sceneId: sc.id, lineIndex: first, stage: 'post' }); c.__advTest.renderCurrent();
        assert.equal(elements.get('adv-name').textContent, '暁'); assert.equal(c.__advTest.S.actors.size, 0);
        assert.ok(elements.get('story-adv').classList.contains('adv-monologue'));
        const pause = sc.lines.findIndex(l => l.direction === '少し間'); assert.equal(sc.lines[pause].wait, 800);
        Object.assign(c.__advTest.S, { lineIndex: pause - 1 }); c.__advTest.renderCurrent(); c.__advTest.advance();
        await tick(799); assert.equal(elements.get('adv-text').textContent, 'まあ、いつものことや');
        await tick(1); assert.equal(elements.get('adv-text').textContent, 'せやけど');
        assert.ok(elements.get('story-adv').classList.contains('adv-monologue'));
        assert.match(read('story-adv.css'), /\.adv-monologue \.adv-text \{ font-style: italic/);
    });

    test(`${mobile ? 'phone' : 'PC'}: episode10 CLEAR then festival CLEAR uses exactly six registered portraits`, async () => {
        const r = runtime({ mobile }), { c, elements, requests } = r;
        await c.StoryAdv.start('episode10'); c.__advTest.enterScene('scene5', 'post'); c.__advTest.clearEpisode();
        const ending = elements.get('adv-ending');
        assert.equal(ending.children[0].textContent, '第10話 CLEAR'); assert.equal(ending.children[1].textContent, 'また会おう');
        assert.equal(c.BattleStoryProgress.load().episode10, true); assert.ok(!ending.children.some(n => n.textContent.startsWith('NEXT')));
        ending.children.at(-1).onclick();
        assert.equal(ending.children[0].textContent, '出会い・文化祭編 CLEAR');
        const messageIndex = ending.children.findIndex(n => n.textContent === '六人の物語は、ここから始まる');
        assert.ok(messageIndex >= 0);
        assert.equal(ending.children[messageIndex + 1].className, 'character-notice adv-arc-notice');
        assert.equal(ending.children[messageIndex + 1].textContent, '本作のキャラクターは、フェニチルさんの創作作品『天涯比隣』のキャラクターデザインと名前をお借りした二次創作です。性格・関係性・ストーリー・設定はすべて本作独自のもので、原作とは関係ありません。');
        const portraits = ending.children.find(n => n.className === 'adv-arc-portraits'); assert.equal(portraits.children.length, 6);
        assert.deepEqual(portraits.children.map(f => f.children[1].textContent), ['千鶴', '栞那', '舞依', '拓海', '暁', '剛']);
        const ids = ['chizuru', 'kanna', 'mai', 'takumi', 'akatsuki', 'tsuyoshi'];
        assert.deepEqual(portraits.children.map(f => f.children[0].src), ids.map(id => c.BattleStoryAssets.characters[id].portraits.normal));
        assert.ok(requests.every(file => c.BattleStoryAssets.paths().includes(file) || file === 'assets/battle-images/card-back.webp'));
        assert.equal(ending.children[2].textContent, '六人の物語は、ここから始まる');
        assert.match(read('story-adv.css'), /\.adv-arc-portraits \{ display: grid; grid-template-columns: repeat\(6,/);
        assert.match(read('story-adv.css'), /\.adv-arc-portraits \{ grid-template-columns: repeat\(3,/);
        assert.match(read('story-adv.css'), /prefers-reduced-motion: reduce/);
        assert.equal(JSON.parse(r.store.get(ADV_KEY)).resume, null);
    });
}

test('episode10 evening backgrounds, notify, left-side Chizuru/Mai and post-battle route follow the script', async () => {
    const r = runtime(), { c, calls, tick } = r, ep = c.BattleStoryData.get('episode10');
    assert.deepEqual(clone(ep.scenes.map(s => [s.id, s.background])), [
        ['scene1', 'festival-classroom-evening'], ['scene2', 'festival-classroom-evening'], ['scene3', 'festival-classroom-evening'],
        ['win', 'festival-classroom-evening'], ['scene4', 'classroom-after-festival'], ['scene5', 'school-gate-evening'], ['lose', 'festival-classroom-evening']
    ]);
    const lines = ep.scenes.flatMap(s => s.lines); lines.filter(l => ['chizuru', 'mai'].includes(l.speaker)).forEach(l => assert.equal(l.position, 'left'));
    assert.equal(ep.scenes.find(s => s.id === 'win').next, 'scene4'); assert.equal(ep.scenes.find(s => s.id === 'scene4').next, 'scene5');
    assert.ok(lines.some(l => l.text === '第7話で私が勝ったから')); assert.ok(lines.some(l => l.text === '知らん知らん、話数で数えんな'));
    await c.StoryAdv.start('episode10'); const sc = ep.scenes.find(s => s.id === 'scene4');
    Object.assign(c.__advTest.S, { sceneId: sc.id, lineIndex: sc.lines.findIndex(l => l.se === 'notify'), stage: 'post' }); c.__advTest.renderCurrent();
    assert.equal(calls.filter(s => s === 'notify').length, 1); await tick(350); assert.equal(c.__advTest.S.text, '俺も？');
});

test('FINAL BATTLE freezes its remaining time on pause and rejects an abandoned intro', async () => {
    const r = runtime({ reduced: false }), { c, elements, tick } = r;
    await c.StoryAdv.start('episode10');
    const sc = c.BattleStoryData.get('episode10').scenes.find(s => s.lines.some(l => l.finalBattle));
    Object.assign(c.__advTest.S, { sceneId: sc.id, lineIndex: sc.lines.findIndex(l => l.finalBattle) });
    const playing = c.__advTest.renderCurrent(); await tick(600); c.__advTest.pausePlayback();
    await tick(5000); assert.equal(c.choice, undefined); c.__advTest.resumePlayback();
    await tick(999); assert.equal(c.choice, undefined); await tick(1); await playing;
    assert.equal(c.choice.episode.id, 'episode10');
    c.choice = undefined; await c.StoryAdv.start('episode10');
    Object.assign(c.__advTest.S, { sceneId: sc.id, lineIndex: sc.lines.findIndex(l => l.finalBattle) });
    const abandoned = c.__advTest.renderCurrent(); c.StoryAdv.stop(); await tick(2000); await abandoned;
    assert.equal(c.choice, undefined);
});

test('resuming inside the monologue pause restores its darker italic style and previous dialogue', async () => {
    const r = runtime(); await r.c.StoryAdv.start('episode10');
    const sc = r.c.BattleStoryData.get('episode10').scenes.find(s => s.id === 'scene5');
    Object.assign(r.c.__advTest.S, { sceneId: sc.id, lineIndex: sc.lines.findIndex(l => l.direction === '少し間'), stage: 'post' });
    r.c.__advTest.savePosition();
    const reload = runtime({ save: Object.fromEntries(r.store) }); const playing = reload.c.StoryAdv.start('episode10', true); await reload.tick(0);
    assert.equal(reload.elements.get('adv-name').textContent, '暁');
    assert.equal(reload.elements.get('adv-text').textContent, 'まあ、いつものことや');
    assert.ok(reload.elements.get('story-adv').classList.contains('adv-monologue'));
    assert.equal(reload.c.__advTest.S.actors.size, 0);
    await reload.tick(800); await playing; assert.equal(reload.elements.get('adv-text').textContent, 'せやけど');
});
function playbackFixture(r) {
    r.c.BattleStoryData.register({ id: 'playback-fixture', number: 8, title: '操作検証',
        battle: { after: 'marker' }, afterBattle: { win: 'win', lose: 'lose' },
        scenes: [
            { id: 'intro', background: 'classroom', lines: [
                { speaker: 'chizuru', position: 'right', text: '最初の会話です。' },
                { speaker: 'mai', position: 'left', text: '読み飛ばす会話', background: 'rooftop',
                    show: [{ id: 'chizuru', position: 'right', expression: 'smile' }] },
                { speaker: 'narration', text: '', hide: ['chizuru'], wait: 800 },
                { id: 'marker', speaker: 'narration', text: '', battle: true }
            ] },
            { id: 'win', background: 'festival-classroom', next: 'final', lines: [
                { speaker: 'chizuru', position: 'right', text: '勝利の会話です。' },
                { speaker: 'kanna', position: 'left', text: '後でログを読む会話', background: 'rooftop',
                    show: [{ id: 'chizuru', position: 'right', expression: 'smile' }] }
            ] },
            { id: 'final', lines: [
                { speaker: 'narration', text: '', hide: ['chizuru'] },
                { speaker: 'mai', position: 'center', expression: 'smile', text: '最後の会話',
                    show: [{ id: 'kanna', position: 'left', expression: 'troubled' }] },
                { speaker: 'narration', text: '', effect: 'fadeOut' }
            ] },
            { id: 'lose', background: 'classroom', lines: [
                { speaker: 'chizuru', position: 'right', text: '敗北の会話' },
                { speaker: 'kanna', position: 'left', text: '次の選択を待つ会話' }
            ] }
        ] });
}

for (const mobile of [false, true]) for (const number of [4, 5, 6, 7, 8, 9, 10]) {
    test(`${mobile ? 'phone' : 'PC'}: episode${number} loss → continue as win → resume → CLEAR unlocks next`, async () => {
        const r = runtime({ main: true, mobile }), { c, elements, tick, store } = r;
        await c.StoryAdv.start(`episode${number}`);
        elements.get('adv-skip').onclick(); const skipping = elements.get('adv-skip-yes').onclick(); await tick(1600); await skipping;
        c.choice.onStart('foodTrap'); c.endGame('cpu'); c.StoryAdv.finishBattleReturn(); await tick(0);
        while (elements.get('adv-ending').hidden) { c.__advTest.advance(); await tick(1600); }
        assert.equal(!!c.BattleStoryProgress.load()[`episode${number}`], false);
        assert.deepEqual(elements.get('adv-ending').children.map(el => el.textContent),
            ['もう一度挑戦', '勝ったことにして進める', 'ストーリー選択へ戻る']);
        const starts = r.calls.filter(call => call === 'init-normal').length;
        elements.get('adv-ending').children[1].onclick(); await tick(0);
        assert.equal(r.calls.filter(call => call === 'init-normal').length, starts, 'no rematch');
        assert.equal(c.__advTest.S.stage, 'post'); assert.equal(c.__advTest.S.sceneId, 'win');
        const receipt = JSON.parse(store.get(ADV_KEY));
        assert.equal(receipt.resume.stage, 'post'); assert.equal(receipt.resume.continuedAsWin, true);
        const loss = c.BattleStoryData.get(`episode${number}`).scenes.find(s => s.id === 'lose').lines.filter(l => l.text).map(l => l.text);
        assert.ok(loss.every(text => c.__advTest.S.backlog.some(l => l.text === text)));
        const reload = runtime({ main: true, mobile, save: Object.fromEntries(store) });
        await reload.c.StoryAdv.start(`episode${number}`, true);
        assert.equal(reload.c.__advTest.S.stage, 'post'); assert.equal(reload.c.__advTest.S.sceneId, 'win');
        assert.ok(loss.every(text => reload.c.__advTest.S.backlog.some(l => l.text === text)));
        assert.equal(reload.c.choice, undefined, 'resume opens the win scene, not skill selection');
        reload.load('achievements.js');
        reload.elements.get('adv-skip').onclick(); await reload.elements.get('adv-skip-yes').onclick();
        assert.equal(reload.c.__advTest.S.stage, 'post', 'end skip preserves the fade before CLEAR');
        await reload.tick(1550);
        assert.equal(reload.c.__advTest.S.stage, 'clear');
        assert.equal(JSON.parse(reload.store.get(ADV_KEY)).resume, null);
        assert.equal(reload.c.BattleStoryProgress.load()[`episode${number}`], true);
        assert.equal(reload.c.Achievements.readLocal().counters.storyClears, 0);
        const cards = new reload.Element(); reload.c.StoryAdv.appendEpisodeCards(cards);
        const next = cards.children.find(card => card.children.some(el => el.getAttribute?.('data-story-episode-id') === `episode${number + 1}`));
        if (number < 10) assert.equal(next.children.find(el => el.tagName === 'button').disabled, false);
        else assert.equal(next, undefined);
        assert.equal(reload.c.GameState.storyEpisodeId, undefined);
    });
}

test('skip confirms, rebuilds skipped speech / actors / inline background, and stops at skill choice', async () => {
    const r = runtime({ reduced: false }); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
    const { c, elements, tick } = r;
    elements.get('adv-skip').onclick();
    assert.ok(elements.get('story-adv').html.includes('次の区切りまでスキップしますか？'));
    const typed = c.__advTest.S.typed; await tick(3000); assert.equal(c.__advTest.S.typed, typed);
    elements.get('adv-skip-no').onclick(); await tick(30); assert.equal(c.__advTest.S.typed, typed + 1);
    elements.get('adv-skip').onclick(); await elements.get('adv-skip-yes').onclick();
    assert.equal(c.choice.episode.id, 'playback-fixture'); assert.equal(c.__advTest.S.stage, 'battle');
    assert.deepEqual(clone(c.__advTest.S.backlog.map(l => l.text)), ['最初の会話です。', '読み飛ばす会話']);
    assert.deepEqual(clone([...c.__advTest.S.actors.values()]), [{ id: 'mai', position: 'left', expression: 'normal' }]);
    assert.ok(elements.get('adv-background').style.backgroundImage.includes('rooftop.webp'));
    assert.equal(c.__advTest.S.lineIndex, 3); assert.equal(c.__advTest.S.battleActive, false);
    assert.equal(JSON.parse(r.store.get(ADV_KEY)).resume.stage, 'battle');
    assert.equal(c.__advTest.S.fastForward, false);
});

test('end skip across win scenes retains every skipped log line and final actors/background through fade and resume', async () => {
    const r = runtime(); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
    r.c.__advTest.enterScene('win', 'post'); r.elements.get('adv-skip').onclick();
    await r.elements.get('adv-skip-yes').onclick();
    assert.equal(r.c.__advTest.S.sceneId, 'final'); assert.equal(r.c.__advTest.S.lineIndex, 2);
    assert.deepEqual(clone(r.c.__advTest.S.backlog.map(l => l.text)),
        ['最初の会話です。', '読み飛ばす会話', '勝利の会話です。', '後でログを読む会話', '最後の会話']);
    assert.deepEqual(clone([...r.c.__advTest.S.actors.values()]), [
        { id: 'kanna', position: 'left', expression: 'troubled' }, { id: 'mai', position: 'center', expression: 'smile' }
    ]);
    assert.ok(r.elements.get('adv-background').style.backgroundImage.includes('rooftop.webp'));
    const saved = Object.fromEntries(r.store);
    await r.tick(849); assert.equal(r.c.__advTest.S.stage, 'post');
    await r.tick(1); assert.equal(r.elements.get('adv-effect').className, 'adv-effect fade-out');
    await r.tick(700); assert.equal(r.c.__advTest.S.stage, 'clear');
    assert.ok(r.elements.get('adv-background').style.backgroundImage.includes('rooftop.webp'));
    const reload = runtime({ save: saved }); playbackFixture(reload); await reload.c.StoryAdv.start('playback-fixture', true);
    assert.deepEqual(clone(reload.c.__advTest.S.backlog), clone(r.c.__advTest.S.backlog));
    assert.deepEqual(clone([...reload.c.__advTest.S.actors.values()]), clone([...r.c.__advTest.S.actors.values()]));
    await reload.tick(1550); assert.equal(reload.c.__advTest.S.stage, 'clear');
});

for (const after of ['marker', 'intro']) test(`skip and resume support the ${after === 'marker' ? 'dialogue ID' : 'scene ID'} battle boundary`, async () => {
    const r = runtime(); playbackFixture(r);
    const episode = clone(r.c.BattleStoryData.get('playback-fixture'));
    episode.battle.after = after;
    episode.scenes[0].lines[3] = { id: 'marker', speaker: 'mai', position: 'left', text: '対戦直前の会話' };
    r.c.BattleStoryData.register(episode); await r.c.StoryAdv.start('playback-fixture');
    r.elements.get('adv-skip').onclick(); await r.elements.get('adv-skip-yes').onclick();
    assert.equal(r.c.__advTest.S.stage, 'battle');
    assert.equal(r.c.__advTest.S.backlog.at(-1).text, '対戦直前の会話');
    const reload = runtime({ save: Object.fromEntries(r.store) }); reload.c.BattleStoryData.register(episode);
    await reload.c.StoryAdv.start('playback-fixture', true);
    assert.equal(reload.c.__advTest.S.stage, 'battle');
    assert.deepEqual(clone(reload.c.__advTest.S.backlog), clone(r.c.__advTest.S.backlog));
});

test('skipping loss dialogue stops at all three choices, and saving the choices resumes them', async () => {
    const r = runtime(); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
    r.c.__advTest.enterScene('lose', 'lose'); r.elements.get('adv-skip').onclick(); await r.elements.get('adv-skip-yes').onclick();
    assert.equal(r.c.__advTest.S.stage, 'lose');
    assert.equal(r.elements.get('adv-ending').children.length, 3);
    assert.equal(!!r.c.BattleStoryProgress.load()['playback-fixture'], false);
    assert.deepEqual(clone(r.c.__advTest.S.backlog.slice(-2).map(l => l.text)), ['敗北の会話', '次の選択を待つ会話']);
    const reload = runtime({ save: Object.fromEntries(r.store) }); playbackFixture(reload);
    await reload.c.StoryAdv.start('playback-fixture', true);
    assert.equal(reload.elements.get('adv-ending').hidden, false);
    assert.equal(reload.c.__advTest.S.lineIndex, 2);
});

test('fast-forward instantly finishes text, advances at 300ms, shortens an active wait, then stops at battle', async () => {
    const r = runtime({ reduced: false }); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
    const { c, elements, tick } = r; elements.get('adv-fast').onclick();
    assert.equal(c.__advTest.S.typing, false); assert.equal(elements.get('adv-text').textContent, '最初の会話です。');
    assert.equal(elements.get('adv-fast').getAttribute('aria-pressed'), 'true');
    await tick(299); assert.equal(c.__advTest.S.lineIndex, 0);
    await tick(1); assert.equal(c.__advTest.S.lineIndex, 1);
    await tick(399); assert.equal(c.choice, undefined);
    await tick(1); assert.equal(c.__advTest.S.stage, 'battle');
    assert.equal(c.__advTest.S.fastForward, false); assert.equal(c.__advTest.S.ctrlHeld, false);
    assert.equal(elements.get('adv-fast').getAttribute('aria-pressed'), 'false');
    await c.StoryAdv.start('playback-fixture');
    Object.assign(c.__advTest.S, { lineIndex: 2 }); c.__advTest.renderCurrent();
    await tick(200); elements.get('adv-fast').onclick();
    await tick(99); assert.equal(c.choice.episode.id, 'playback-fixture'); assert.equal(c.__advTest.S.stage, 'pre');
    await tick(1); assert.equal(c.__advTest.S.stage, 'battle');
});

test('fast-forward stops at lose choices and CLEAR and stays off on every session start', async () => {
    for (const stage of ['lose', 'post']) {
        const r = runtime({ reduced: false }); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
        r.c.__advTest.enterScene(stage === 'lose' ? 'lose' : 'win', stage); r.elements.get('adv-fast').onclick();
        await r.tick(3000);
        assert.equal(r.elements.get('adv-ending').hidden, false);
        assert.equal(r.c.__advTest.S.fastForward, false);
        assert.equal(r.c.__advTest.S.stage, stage === 'lose' ? 'lose' : 'clear');
        const index = r.c.__advTest.S.lineIndex; await r.tick(3000); assert.equal(r.c.__advTest.S.lineIndex, index);
    }
    const r = runtime(); await r.c.StoryAdv.start('episode4'); r.elements.get('adv-fast').onclick();
    assert.equal(Object.hasOwn(JSON.parse(r.store.get(ADV_KEY)), 'fastForward'), false);
    const reload = runtime({ save: Object.fromEntries(r.store) }); await reload.c.StoryAdv.start('episode4', true);
    assert.equal(reload.c.__advTest.S.fastForward, false);
    assert.equal(reload.elements.get('adv-fast').getAttribute('aria-pressed'), 'false');
});

test('AUTO and fast-forward are mutually exclusive, remembered AUTO stays unchanged by log/pause', async () => {
    const r = runtime(); await r.c.StoryAdv.start('episode4'); const { c, elements } = r;
    elements.get('adv-auto').onclick(); assert.equal(c.__advTest.saved.auto, true);
    elements.get('adv-fast').onclick(); assert.equal(c.__advTest.saved.auto, false); assert.equal(c.__advTest.S.fastForward, true);
    elements.get('adv-auto').onclick(); assert.equal(c.__advTest.saved.auto, true); assert.equal(c.__advTest.S.fastForward, false);
    c.__advTest.openLog(true); c.__advTest.openLog(false);
    assert.equal(JSON.parse(r.store.get(ADV_KEY)).auto, true);
    elements.get('adv-pause').onclick(); elements.get('adv-resume').onclick(); assert.equal(c.__advTest.saved.auto, true);
    elements.get('adv-fast').onclick(); c.__advTest.openLog(true);
    assert.equal(c.__advTest.S.fastForward, false); c.__advTest.openLog(false); await r.tick(3000);
    assert.equal(c.__advTest.S.lineIndex, 0);
    elements.get('adv-fast').onclick(); elements.get('adv-pause').onclick();
    assert.equal(c.__advTest.S.fastForward, false); elements.get('adv-resume').onclick();
    await r.tick(3000); assert.equal(c.__advTest.S.lineIndex, 0);
});

test('pause preserves the remaining typewriter timer; nested log and declined skip do not resume it', async () => {
    const r = runtime({ reduced: false }); await r.c.StoryAdv.start('episode4'); const { c, elements, tick } = r;
    await tick(10); const typed = c.__advTest.S.typed;
    elements.get('adv-pause').onclick(); assert.equal(elements.get('adv-pause-panel').hidden, false);
    c.__advTest.advance(); await tick(4000); assert.equal(c.__advTest.S.typed, typed);
    elements.get('adv-pause-log').onclick(); await tick(4000); elements.get('adv-log-close').onclick();
    assert.equal(c.__advTest.S.paused, true); assert.equal(elements.get('adv-pause-panel').hidden, false);
    elements.get('adv-pause-skip').onclick(); await tick(4000); elements.get('adv-skip-no').onclick();
    assert.equal(c.__advTest.S.paused, true); assert.equal(c.__advTest.S.typed, typed);
    elements.get('adv-resume').onclick(); await tick(19); assert.equal(c.__advTest.S.typed, typed);
    await tick(1); assert.equal(c.__advTest.S.typed, typed + 1);
    await tick(1000); assert.equal(c.__advTest.S.typing, false);
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
});

test('pause preserves the remaining AUTO delay instead of restarting or advancing during suspension', async () => {
    const r = runtime(); await r.c.StoryAdv.start('episode4'); r.elements.get('adv-auto').onclick();
    const remaining = r.c.StoryAdv.autoDelay(r.c.__advTest.S.text) - 500;
    await r.tick(500); r.elements.get('adv-pause').onclick(); await r.tick(10000);
    assert.equal(r.c.__advTest.S.lineIndex, 0);
    r.elements.get('adv-resume').onclick(); await r.tick(remaining - 1); assert.equal(r.c.__advTest.S.lineIndex, 0);
    await r.tick(1); assert.equal(r.c.__advTest.S.lineIndex, 1);
});

for (const [effect, ms] of [['chime', 850], ['notify', 350], ['crowd', 650], ['battleTease', 950], ['shake', 250], ['fadeOut', 1550]]) {
    test(`pause freezes ${effect} and resumes the pending continuation once`, async () => {
        const r = runtime(); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
        r.c.BattleStoryData.register({ id: 'effect-fixture', afterBattle: {}, scenes: [{ id: 'effect', lines: [
            { speaker: 'chizuru', text: '演出後の会話', effect }, { speaker: 'mai', text: '次の会話' }
        ] }] });
        await r.c.StoryAdv.start('effect-fixture'); await r.tick(100);
        const cues = []; r.c.pauseStoryCues = () => cues.push('pause'); r.c.resumeStoryCues = () => cues.push('resume');
        r.elements.get('adv-pause').onclick(); await r.tick(10000);
        assert.equal(r.c.__advTest.S.busy, true); assert.equal(r.c.__advTest.S.backlog.length, 0);
        assert.ok(r.elements.get('story-adv').classList.contains('adv-frozen'));
        r.elements.get('adv-resume').onclick(); await r.tick(ms - 101);
        assert.equal(r.c.__advTest.S.busy, true);
        await r.tick(1); assert.equal(r.c.__advTest.S.busy, false);
        assert.equal(r.elements.get('adv-text').textContent, '演出後の会話');
        assert.equal(r.c.__advTest.S.backlog.length, 1); assert.deepEqual(cues, ['pause', 'resume']);
    });
}

test('pause during final blackout prevents clear/unlock, resumed blackout completes at the saved remainder', async () => {
    const r = runtime(); await r.c.StoryAdv.start('episode4');
    Object.assign(r.c.__advTest.S, { sceneId: 'win', lineIndex: 22, stage: 'post' }); r.c.__advTest.renderCurrent();
    await r.tick(1000); r.elements.get('adv-pause').onclick(); await r.tick(10000);
    assert.equal(r.c.BattleStoryProgress.load().episode4, false);
    assert.equal(r.elements.get('adv-effect').className, 'adv-effect fade-out');
    r.elements.get('adv-resume').onclick(); await r.tick(549); assert.equal(r.c.__advTest.S.stage, 'post');
    await r.tick(1); assert.equal(r.c.__advTest.S.stage, 'clear');
});

test('pause menu can confirm a skip or save position and return to story selection', async () => {
    const r = runtime(); playbackFixture(r); await r.c.StoryAdv.start('playback-fixture');
    r.elements.get('adv-pause').onclick(); r.elements.get('adv-pause-skip').onclick();
    await r.elements.get('adv-skip-yes').onclick(); assert.equal(r.c.__advTest.S.stage, 'battle');
    assert.equal(r.c.__advTest.S.paused, false); assert.equal(r.elements.get('adv-pause-panel').hidden, true);
    await r.c.StoryAdv.start('playback-fixture'); r.elements.get('adv-pause').onclick(); r.elements.get('adv-pause-exit').onclick();
    assert.ok(r.calls.includes('story-select')); assert.equal(r.c.__advTest.S.active, false);
    assert.equal(JSON.parse(r.store.get(ADV_KEY)).resume.lineIndex, 0);
    await r.tick(10000); assert.equal(r.c.__advTest.S.active, false);
});

test('keyboard Enter/Space advance, held Ctrl fast-forwards, Esc pauses, and modal keyboard focus is contained', async () => {
    const r = runtime({ reduced: false }); await r.c.StoryAdv.start('episode4');
    assert.equal(pressKey(r, 'Enter'), true); assert.equal(r.c.__advTest.S.typing, false);
    pressKey(r, ' ', { repeat: true }); assert.equal(r.c.__advTest.S.lineIndex, 0);
    pressKey(r, ' '); assert.equal(r.c.__advTest.S.lineIndex, 1);
    pressKey(r, 'Control'); assert.equal(r.c.__advTest.S.ctrlHeld, true);
    assert.equal(r.c.__advTest.S.typing, false); await r.tick(299); assert.equal(r.c.__advTest.S.lineIndex, 1);
    pressKey(r, 'Control', { up: true }); await r.tick(1000); assert.equal(r.c.__advTest.S.lineIndex, 1);
    pressKey(r, 'Control'); r.c.listeners.blur(); assert.equal(r.c.__advTest.S.ctrlHeld, false);
    pressKey(r, 'Escape'); assert.equal(r.c.__advTest.S.paused, true);
    assert.equal(r.c.document.activeElement.id, 'adv-resume');
    pressKey(r, 'Tab', { shiftKey: true }); assert.equal(r.c.document.activeElement.id, 'adv-pause-exit');
    pressKey(r, 'Tab'); assert.equal(r.c.document.activeElement.id, 'adv-resume');
    pressKey(r, 'Control'); assert.equal(r.c.__advTest.S.ctrlHeld, false);
    r.elements.get('adv-pause-log').onclick(); pressKey(r, 'Escape'); assert.equal(r.c.__advTest.S.paused, true);
    r.elements.get('adv-pause-skip').onclick(); pressKey(r, 'Escape'); assert.equal(r.c.__advTest.S.paused, true);
    pressKey(r, 'Enter'); assert.equal(r.c.__advTest.S.lineIndex, 1);
    pressKey(r, 'Escape'); assert.equal(r.c.__advTest.S.paused, false);
    assert.equal(pressKey(r, 'Enter', { target: { closest: () => ({}) } }), false, 'button/form controls keep native keyboard behavior');
});

for (const mobile of [false, true]) test(`${mobile ? 'phone' : 'PC'}: ADV shortcuts leave normal battles unchanged`, async () => {
    const r = runtime({ main: true, mobile }); await r.c.StoryAdv.start('episode4'); r.c.StoryAdv.stop();
    r.c.beginMatchByRole('先攻'); const state = clone(r.c.GameState);
    for (const key of ['Enter', ' ', 'Control', 'Escape']) assert.equal(pressKey(r, key), false);
    assert.deepEqual(clone(r.c.GameState), state); assert.equal(r.c.__advTest.S.paused, false);
    assert.equal(r.c.__advTest.S.ctrlHeld, false); assert.equal(r.c.shouldAutosaveCurrentMatch(), true);
});

test('toolbar controls have labels, touch targets and a six-column phone budget at the requested sizes', async () => {
    const r = runtime(); await r.c.StoryAdv.start('episode4'); const html = r.elements.get('story-adv').html;
    for (const [id, name] of [['auto', 'オート'], ['fast', '早送り'], ['skip', 'スキップ'], ['pause', '一時停止'], ['log-button', 'ログ']]) {
        assert.match(html, new RegExp(`id="adv-${id}"[^>]*aria-label="${name}"`));
    }
    const css = read('story-adv.css');
    assert.match(css, /\.story-adv \.adv-control \{[^}]*min-height: 44px/);
    assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.adv-frozen [^]*animation-play-state: paused/);
    for (const width of [390, 360]) assert.ok((width - 24 - 20) / 6 >= 44, `${width}: each phone control fits a touch target`);
    // Layout budget only: the face framing test above covers 390×844 / 360×740 / 844×390.
});

test('ADV WebAudio can freeze/resume cues and fast-forward shortens both notes without changing normal timing', () => {
    for (const file of ['audio.js', 'mobile/audio-sp.js']) {
        const tones = [], calls = [];
        class AudioContext {
            constructor() { this.currentTime = 10; }
            resume() { calls.push('resume'); return Promise.resolve(); }
            suspend() { calls.push('suspend'); return Promise.resolve(); }
            createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
            createOscillator() { const t = { frequency: {}, connect() {}, disconnect() {}, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } }; tones.push(t); return t; }
        }
        const c = vm.createContext({ window: { AudioContext }, getBgmEnabled: () => true, getBgmVolume: () => .4 });
        const source = read(file); vm.runInContext(source.slice(source.indexOf('// ADV cues use')), c);
        c.window.playStoryCue('chime'); const normal = tones.at(-1).stopAt - 10;
        c.window.pauseStoryCues(); c.window.resumeStoryCues(); assert.deepEqual(calls, ['resume', 'suspend', 'resume']);
        c.window.stopStoryCues(); c.window.playStoryCue('chime', .12);
        assert.deepEqual(tones.slice(-2).map(t => t.frequency.value), [659.25, 523.25]);
        assert.ok(Math.abs((tones.at(-1).stopAt - 10) - normal * .12) < .00001);
        assert.ok(tones.at(-1).stopAt - 10 < .1);
        assert.equal(read('audio.js').slice(read('audio.js').indexOf('// ADV cues use')),
            read('mobile/audio-sp.js').slice(read('mobile/audio-sp.js').indexOf('// ADV cues use')));
    }
});

test('review table permits exactly the documented punctuation and presentation additions across all ten episodes', () => {
    const { c } = runtime(), review = storyReview();
    const episodes = [...c.__legacyTest.EPISODES.map((e, i) => ({ number: i + 1, scenes: ['pre', 'postWin', 'postLose'].filter(k => e[k]).map(k => ({ id: k, lines: e[k] })) })), ...c.BattleStoryData.all()];
    let changes = 0, effects = 0, spoken = 0; const used = { motions: new Set(), marks: new Set(), screens: new Set(), cues: new Set() };
    for (const ep of episodes) for (const scene of ep.scenes) scene.lines.forEach((line, index) => {
        const key = ep.number + '/' + scene.id + ':' + (index + 1), edit = review.changes.get(key), fx = review.effects.get(key);
        if (line.text) { spoken++; assert.doesNotMatch(line.text, /。$/); }
        if (edit) {
            changes++; assert.equal(line.text, edit.after, key);
            assert.ok(edit.after === edit.before + '！' || edit.after === edit.before + '！？', key);
            assert.doesNotMatch(edit.before, /[！？。]$/);
        }
        if (fx) { effects++; for (const [field, value] of Object.entries(fx)) assert.equal(line[field], value, key); }
        for (const [field, catalog] of [['motion', 'motions'], ['mark', 'marks'], ['screen', 'screens'], ['se', 'cues']]) {
            if (!line[field]) continue;
            assert.ok(c.BattleStoryData.presentation[catalog].includes(line[field]), key);
            used[catalog].add(line[field]);
            if (field !== 'se' || !['chime', 'crowd', 'notify'].includes(line[field])) assert.equal(fx?.[field], line[field], 'undocumented addition: ' + key);
        }
    });
    assert.equal(spoken, 1062); assert.equal(changes, review.changes.size); assert.equal(effects, review.effects.size);
    assert.ok(changes / spoken <= .2);
    for (const row of read('docs/story/emphasis-changes-20261004.md').split(/\r?\n/)) {
        const cells = row.split('|').map(x => x.trim());
        const number = cells[1]?.match(/^第(\d+)話$/)?.[1];
        if (!number) continue;
        const ep = episodes.find(e => e.number === Number(number));
        assert.equal(Number(cells[2]), ep.scenes.flatMap(s => s.lines).filter(l => l.text).length);
        assert.equal(Number(cells[3]), [...review.changes.keys()].filter(k => k.startsWith(number + '/')).length);
        assert.equal(Number(cells[4]), [...review.effects.keys()].filter(k => k.startsWith(number + '/')).length);
    }
    for (const name of ['hop', 'shake', 'zoom', 'tremble', 'slideIn']) assert.ok(used.motions.has(name));
    for (const name of ['flash', 'screenShake', 'speedLines']) assert.ok(used.screens.has(name));
    for (const name of ['pop', 'shock', 'laugh', 'idea', 'thud', 'sparkle', 'swish']) assert.ok(used.cues.has(name));
    for (const name of ['!', '?', '!?', 'sweat', 'anger', 'note', 'sparkle', '…']) assert.ok(used.marks.has(name));
});

test('the entire original episode data stays unchanged after reversing only the reviewed additions', () => {
    const { c } = runtime();
    const original = [
        ...c.__legacyTest.EPISODES.map((e, i) => ({ number: i + 1, scenes: ['pre', 'postWin', 'postLose'].filter(k => e[k]).map(k => ({ id: k, lines: reviewedLines(i + 1, k, e[k]) })) })),
        ...c.BattleStoryData.all().map(e => ({ ...clone(e), scenes: e.scenes.map(s => ({ ...clone(s), lines: reviewedLines(e.number, s.id, s.lines) })) }))
    ];
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'), '056654abad608b7475a9cb75f09bdbab21dd5bddf639754b0b0ce4906471350e');
});

test('unknown cue, motion, mark and screen names are removed with one warning and never dispatched', async () => {
    const r = runtime(), { c, warnings } = r;
    const bad = { speaker: 'chizuru', text: '検証', se: 'invalidCue', motion: 'invalidMotion', mark: 'invalidMark', screen: 'invalidScreen', effect: 'invalidEffect' };
    const ep = { id: 'invalid-effects', scenes: [{ id: 's', lines: [bad, bad] }] };
    const result = c.BattleStoryData.register(ep);
    for (const field of ['se', 'motion', 'mark', 'screen', 'effect']) assert.equal(result.scenes[0].lines[0][field], undefined);
    assert.equal(warnings.length, 5); await c.StoryAdv.start(ep.id); assert.equal(r.elements.get('adv-text').textContent, '検証');
    assert.ok(!r.calls.some(x => /invalid/.test(x)));
});

for (const motion of ['hop', 'shake', 'zoom', 'tremble', 'slideIn']) for (const reduced of [false, true]) {
    test(`line motion ${motion}: reduced=${reduced}, text/input stay available and the beat cleans up`, async () => {
        const r = runtime({ reduced }), { c, elements, tick } = r;
        c.BattleStoryData.register({ id: 'line-beat', scenes: [{ id: 's', lines: [
            { speaker: 'chizuru', position: 'right', text: 'びっくり！', motion, mark: '!?', screen: 'flash', se: 'pop' },
            { speaker: 'mai', position: 'left', text: '次の会話' }
        ] }] });
        await c.StoryAdv.start('line-beat');
        const portrait = elements.get('adv-portraits').children.find(p => p.dataset.actor === 'chizuru');
        assert.equal(c.__advTest.S.busy, false); assert.equal(portrait.classList.contains('adv-motion-' + motion), !reduced);
        assert.equal(portrait.querySelector('.adv-emotion-mark').textContent, '!?');
        assert.equal(elements.get('adv-line-effects').classList.contains('adv-screen-flash'), !reduced);
        assert.ok(r.calls.includes('pop')); assert.equal(elements.get('adv-name').dataset.speaker, 'chizuru');
        if (!reduced) c.__advTest.advance(); // finish typing immediately
        assert.equal(elements.get('adv-text').textContent, 'びっくり！');
        c.__advTest.advance(); await tick(0);
        assert.equal(c.__advTest.S.lineIndex, 1); assert.equal(portrait.querySelector('.adv-emotion-mark'), null);
        assert.equal(elements.get('adv-line-effects').className, 'adv-line-effects');
        await tick(850); assert.equal(c.__advTest.S.lineIndex, 1, 'effects never advance a spoken line');
    });
}

test('line beats freeze during log/pause, are cancelled by stop/skip, and fast-forward removes current and future beats', async () => {
    const r = runtime({ reduced: false }), { c, elements, tick } = r;
    c.BattleStoryData.register({ id: 'beat-controls', scenes: [{ id: 's', lines: [
        { speaker: 'tsuyoshi', text: 'ドン！', motion: 'zoom', mark: '!', screen: 'screenShake', se: 'thud' },
        { speaker: 'chizuru', text: 'やった！', motion: 'hop', mark: 'sparkle', screen: 'speedLines', se: 'sparkle' }
    ] }] });
    await c.StoryAdv.start('beat-controls'); await tick(200);
    c.__advTest.pausePlayback(); await tick(2000);
    assert.ok(elements.get('story-adv').classList.contains('adv-screen-shake'));
    c.__advTest.resumePlayback(); await tick(649);
    assert.ok(elements.get('story-adv').classList.contains('adv-screen-shake')); await tick(1);
    assert.equal(elements.get('story-adv').classList.contains('adv-screen-shake'), false);
    await c.StoryAdv.start('beat-controls'); await tick(200); c.__advTest.openLog(true); await tick(2000);
    assert.ok(elements.get('story-adv').classList.contains('adv-screen-shake'));
    c.__advTest.openLog(false); await tick(650);
    assert.equal(elements.get('story-adv').classList.contains('adv-screen-shake'), false);
    await c.StoryAdv.start('beat-controls'); c.__advTest.toggleFastForward();
    assert.equal(elements.get('adv-portraits').children[0].querySelector('.adv-emotion-mark'), null);
    await tick(300); assert.equal(elements.get('adv-line-effects').className, 'adv-line-effects');
    assert.ok(!elements.get('adv-portraits').children.some(p => p.querySelector('.adv-emotion-mark')));
    c.StoryAdv.stop(); await tick(2000); assert.equal(elements.get('adv-line-effects').className, 'adv-line-effects');
    await c.StoryAdv.start('beat-controls'); c.__advTest.askSkip(); await c.__advTest.skipToStop();
    assert.equal(elements.get('adv-line-effects').className, 'adv-line-effects');
    assert.ok(!elements.get('adv-portraits').children.some(p => p.querySelector('.adv-emotion-mark')));
});

for (const file of ['audio.js', 'mobile/audio-sp.js']) test(`${file}: all seven synth cues obey mute/volume, are soft/short and fast-forward stops the old voice`, () => {
    const tones = [], levels = [], controls = []; let enabled = false, volume = .4;
    class Context {
        constructor() { this.currentTime = 10; }
        resume() { controls.push('resume'); return Promise.resolve(); }
        suspend() { controls.push('pause'); return Promise.resolve(); }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(v, at) { levels.push({ v, at }); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
        createOscillator() { const tone = { frequency: { setValueAtTime(v) { this.from = v; }, exponentialRampToValueAtTime(v) { this.to = v; } }, connect() {}, disconnect() {}, start(at) { this.startAt = at; }, stop(at) { if (at === undefined) this.cancelled = true; else this.stopAt = at; } }; tones.push(tone); return tone; }
    }
    const c = vm.createContext({ window: { AudioContext: Context }, Math, getBgmEnabled: () => enabled, getBgmVolume: () => volume });
    vm.runInContext(read(file).slice(read(file).indexOf('// ADV cues use')), c);
    for (const name of ['pop', 'shock', 'laugh', 'idea', 'thud', 'sparkle', 'swish']) {
        c.window.playStoryCue(name); assert.equal(tones.length, 0); // muted
    }
    enabled = true;
    for (const name of ['pop', 'shock', 'laugh', 'idea', 'thud', 'sparkle', 'swish']) {
        const begin = tones.length; c.window.playStoryCue(name); const current = tones.slice(begin);
        assert.ok(current.length > 0, name); assert.ok(current.every(t => t.stopAt - 10 < .5));
        assert.ok(levels.every(l => l.v <= .085 * volume));
        const normal = current.at(-1).stopAt - 10; c.window.pauseStoryCues(); c.window.resumeStoryCues();
        c.window.playStoryCue(name, .12); assert.ok(current.every(t => t.cancelled));
        assert.ok(Math.abs((tones.at(-1).stopAt - 10) - normal * .12) < .00001);
    }
    const count = tones.length; volume = 0; c.window.playStoryCue('pop'); assert.equal(tones.length, count);
    c.window.playStoryCue('unknown'); assert.equal(tones.length, count);
    c.window.stopStoryCues(); assert.ok(tones.every(t => t.cancelled)); assert.ok(controls.includes('pause'));
    assert.match(read(file), /if \(!AudioManager.bgmEnabled\) \{\s*window.stopStoryCues\?\.\(\)/);
    assert.match(read(file), /AudioManager.bgmVolume = clampBgmVolume\(volume\);\s*window.stopStoryCues\?\.\(\)/);
});

test('dialogue/log/CLEAR share readable size targets and decorations cannot intercept input or animate under reduced motion', () => {
    const css = read('story-adv.css');
    assert.match(css, /--adv-text-size: clamp\(28px, 2\.22vw, 32px\)/);
    assert.match(css, /--adv-text-size: 21px/); assert.match(css, /--adv-text-size: 18px/);
    assert.match(css, /\.adv-dialogue \{[^}]*min-height: 272px[^}]*overflow: visible/);
    assert.match(css, /min-height: 226px/); assert.match(css, /min-height: 158px/);
    assert.doesNotMatch(css, /\.adv-dialogue \{[^}]*max-height/);
    assert.match(css, /#adv-log-lines p \{ font-size: var\(--adv-text-size\)/);
    assert.match(css, /\.adv-ending button \{ font-size: var\(--adv-text-size\)/);
    assert.match(css, /\.adv-line-effects \{[^}]*z-index: 2; pointer-events: none/);
    assert.match(css, /\.adv-emotion-mark \{[^}]*pointer-events: none/);
    assert.match(css, /prefers-reduced-motion: reduce[^]*\.adv-line-effects \{ display: none/);
    assert.match(css, /animation: none !important; transition: none !important/);
    for (const id of ['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna', 'tsuyoshi']) assert.ok(css.includes(`data-speaker="${id}"`));
    assert.match(read('story-adv.js'), /class="adv-next"[^]*?<svg viewBox="0 0 42 24"/);
});
