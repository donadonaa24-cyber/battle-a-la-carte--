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

// Small offline DOM/timer harness, matching the VM tests used by the existing game.
function runtime({ mobile = false, reduced = true, save = {}, main = false, storageBlocked = false } = {}) {
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
        focus() {}
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
    class FakeImage { set src(value) { this._src = value; requests.push(value); this.onload?.(); } get src() { return this._src; } }
    const c = vm.createContext({ console: { log() {}, warn: text => warnings.push(text), error: text => warnings.push(text) },
        document, Image: FakeImage, URL, Math, Date: class extends Date { static now() { return 100000 + dateSequence++; } },
        setTimeout(callback, delay = 0) { const id = ++sequence; jobs.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => jobs.delete(id), setInterval: () => 0, clearInterval() {},
        localStorage: {
            getItem(key) { if (storageBlocked) throw Error('blocked'); return store.get(key) || null; },
            setItem(key, value) { if (storageBlocked) throw Error('blocked'); store.set(key, value); }
        }, addEventListener() {}, matchMedia: () => ({ matches: reduced })
    });
    c.window = c;
    const load = file => vm.runInContext(read(file), c, { filename: file });
    for (const file of ['story-data/characters.js', 'story-data/registry.js', 'story-data/episode4.js']) load(file);
    vm.runInContext(read('story-adv.js').replace(/\}\)\(window\);\s*$/, 'root.__advTest = { S, saved, advance, renderCurrent, renderActors, enterScene, stageLine, savePosition, chooseBattle, clearEpisode, openLog, toggleAuto };\n})(window);'), c);
    vm.runInContext(read('story-mode.js').replace(/\}\)\(\);\s*$/, 'window.__legacyTest = { S, loadProgress, saveProgress, startBattle, handleStoryBattleEnded };\n})();'), c);
    Object.assign(c, {
        playStoryBGM: () => calls.push('story-bgm'), playStoryCue: kind => calls.push(kind),
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
    return { c, elements, jobs, requests, warnings, calls, store, tick, load, Element };
}

test('episode4 dialogue and directions reproduce the scenario word for word in order', () => {
    const { c } = runtime(); const ep = c.BattleStoryData.get('episode4');
    const scenario = read('docs/story/episode4-scenario.md');
    const sections = [
        ['scene1', '## SCENE 1', '## SCENE 2'], ['scene2', '## SCENE 2', '## BATTLE START'],
        ['win', '## BATTLE CLEAR後', '## CLEAR演出'], ['lose', '## 敗北時', null]
    ];
    for (const [id, start, end] of sections) {
        const body = scenario.slice(scenario.indexOf(start), end ? scenario.indexOf(end) : undefined);
        const expected = body.split(/\r?\n/).filter(text => /(?:千鶴|栞那)「[^」]*」$/.test(text));
        const actual = ep.scenes.find(scene => scene.id === id).lines.filter(line => ['chizuru', 'kanna'].includes(line.speaker));
        assert.equal(actual.length, expected.length, id);
        expected.forEach((source, index) => {
            const [, name, text] = source.match(/(千鶴|栞那)「([^」]*)」$/);
            assert.equal(actual[index].text, text);
            assert.equal(actual[index].speaker, name === '千鶴' ? 'chizuru' : 'kanna');
            assert.equal(actual[index].direction, source.slice(0, source.lastIndexOf(name + '「')));
            assert.equal(actual[index].position, name === '千鶴' ? 'right' : 'left');
        });
    }
    const announcement = ep.scenes.find(s => s.id === 'win').lines.find(l => l.speaker === 'announce');
    assert.equal(announcement.text, scenario.match(/ここで校内放送。「([^」]*)」/)[1]);
    assert.equal(announcement.name, '校内放送');
    assert.equal(ep.scenes.find(s => s.id === 'lose').provisional, undefined);
    assert.equal(ep.unlockRequires, null);
    assert.equal(c.BattleStoryData.get('episode5'), null);
});

test('episode4 stage directions and mapped expressions are registered and ordered', () => {
    const { c, warnings } = runtime(); const ep = c.BattleStoryData.get('episode4');
    const assets = c.BattleStoryAssets;
    for (const scene of ep.scenes) {
        assert.ok(assets.backgrounds[scene.background]);
        for (const line of scene.lines) {
            if (['narration', 'announce'].includes(line.speaker)) continue;
            assert.ok(assets.characters[line.speaker].portraits[line.expression]);
            const direction = line.direction;
            let expected = 'normal';
            if (line.speaker === 'chizuru') {
                if (/悩む|困り顔|緊張/.test(direction)) expected = 'troubled';
                if (/笑顔|嬉しそう|得意げ/.test(direction)) expected = 'smile';
                if (/びくっと|驚き|焦り/.test(direction)) expected = line.text === '普通のにする。' ? 'embarrassed' : 'surprised';
                if (/不満|むっと/.test(direction)) expected = 'angry';
            } else {
                if (/笑顔/.test(direction)) expected = 'smile';
                if (/薄い笑顔|意地悪/.test(direction)) expected = 'smug';
                if (/悔しそう/.test(direction)) expected = 'troubled';
            }
            assert.equal(line.expression, expected, line.text);
            if (/^続けて/.test(direction)) assert.equal(line.continue, true);
        }
    }
    const directions = ep.scenes.flatMap(scene => scene.lines).filter(l => l.speaker === 'narration' && !l.battle).map(l => l.direction);
    const expected = read('docs/story/episode4-scenario.md').split(/\r?\n/).filter(text => /^(千鶴を消す。|栞那を消す。|少し間を空ける。|ここでBattle|（可能なら|チャイム。)/.test(text));
    assert.deepEqual(clone(directions), expected);
    assert.equal(warnings.length, 0);
});

test('every explicitly registered artwork path exists (art run dependency)', () => {
    const { c } = runtime();
    const missing = c.BattleStoryAssets.paths().filter(file => !fs.existsSync(path.join(root, file)));
    assert.deepEqual(clone(missing), [], 'Missing registered artwork:\n' + missing.join('\n'));
});

test('fallback never constructs an unlisted image filename', () => {
    const { c } = runtime(); const a = c.BattleStoryAssets;
    assert.equal(a.portraitPath('chizuru', 'unknown-expression'), a.characters.chizuru.portraits.normal);
    assert.deepEqual(clone(a.portraitCandidates('chizuru', 'smile')), [a.characters.chizuru.portraits.smile, a.characters.chizuru.portraits.normal, a.characters.chizuru.standing]);
    assert.equal(a.portraitPath('mai', 'smile'), a.characters.mai.standing);
    assert.equal(a.portraitPath('tsuyoshi', 'normal'), null);
    assert.equal(a.portraitPath('unlisted', 'normal'), null);
    assert.equal(a.portraitPath('toString', 'normal'), null);
    assert.equal(a.portraitPath('chizuru', 'toString'), a.characters.chizuru.portraits.normal);
});

test('a failed registered portrait tries normal, then standing, then name only', () => {
    const { c, elements, requests } = runtime();
    const ep = clone(c.BattleStoryData.get('episode4')); ep.id = 'fallback'; ep.scenes[0].lines[0].expression = 'smile';
    c.BattleStoryData.register(ep); c.StoryAdv.start('fallback');
    const image = elements.get('adv-portraits').children[0].children[0];
    assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.portraits.smile);
    image.onerror(); assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.portraits.normal);
    image.onerror(); assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.standing);
    image.onerror(); assert.equal(elements.get('adv-portraits').children[0].children.length, 0);
    assert.ok(requests.every(file => c.BattleStoryAssets.paths().includes(file)));
});

test('unknown speakers, expressions and backgrounds warn once and fall back without throwing', () => {
    const { c, warnings, requests } = runtime();
    const invalid = { id: 'unknown-episode', defaultPositions: {}, scenes: [{ id: 'unknown-scene', background: 'missing', lines: [
        { speaker: 'unlisted', text: '名前だけ', expression: 'missing' },
        { speaker: 'chizuru', text: '既存画像', expression: 'missing', background: 'missing' }
    ] }] };
    const normalized = c.BattleStoryData.register(invalid);
    assert.equal(normalized.scenes[0].background, null);
    assert.equal(normalized.scenes[0].lines[1].expression, 'normal');
    const count = warnings.length; c.BattleStoryData.register(invalid); assert.equal(warnings.length, count);
    c.StoryAdv.start('unknown-episode');
    assert.equal(requests.length, 0);
    assert.equal(c.document.getElementById('adv-name').textContent, 'unlisted');
});

test('old progress and unknown future keys survive tutorial and episode4 saving', () => {
    const old = { episode1: true, episode2: false, episode3: true, future: { value: 9 } };
    const { c, store } = runtime({ save: { [PROGRESS_KEY]: JSON.stringify(old) } });
    const loaded = c.BattleStoryProgress.load();
    assert.equal(loaded.episode4, false); assert.equal(loaded.episode1, true);
    c.__legacyTest.S.progress = loaded; c.__legacyTest.S.progress.episode2 = true; c.__legacyTest.saveProgress();
    c.BattleStoryProgress.complete('episode4');
    const saved = JSON.parse(store.get(PROGRESS_KEY));
    assert.equal(saved.episode4, true); assert.equal(saved.episode2, true); assert.deepEqual(saved.future, old.future);
});

test('line advances save position; reload restores the line, speaker and backlog', () => {
    const r = runtime(); const { c, store } = r;
    c.StoryAdv.start('episode4'); c.__advTest.advance();
    const saved = JSON.parse(store.get(ADV_KEY));
    assert.deepEqual({ ...saved.resume, savedAt: 0 }, { episodeId: 'episode4', sceneId: 'scene1', lineIndex: 1, stage: 'pre', savedAt: 0 });
    const reload = runtime({ save: Object.fromEntries(store) }); reload.c.StoryAdv.start('episode4', true);
    assert.equal(reload.elements.get('adv-text').textContent, '……でも、ちゃんとおいしいか確認したほうがいいよね。');
    assert.equal(reload.c.__advTest.S.backlog.length, 2);
    reload.elements.get('adv-menu').onclick();
    assert.ok(reload.calls.includes('story-select'));
    assert.equal(reload.c.StoryAdv.hasResume('episode4'), true);
});

test('reload during battle returns to skill selection at BATTLE START', () => {
    const { c, store } = runtime({ save: { [ADV_KEY]: JSON.stringify({ version: 1, auto: true, resume: { episodeId: 'episode4', sceneId: 'scene2', lineIndex: 22, stage: 'battle' } }) } });
    c.StoryAdv.start('episode4', true);
    assert.equal(c.choice.episode.id, 'episode4');
    assert.equal(c.__advTest.S.battleActive, false);
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume.stage, 'battle');
    assert.equal(c.__storyActiveEpisodeId, undefined);
});

test('blocked or invalid localStorage does not stop story playback', () => {
    for (const options of [{ storageBlocked: true }, { save: { [ADV_KEY]: '{', [PROGRESS_KEY]: '{' } }]) {
        const { c } = runtime(options);
        assert.doesNotThrow(() => { c.StoryAdv.start('episode4'); c.__advTest.advance(); c.BattleStoryProgress.complete('episode4'); });
    }
});

test('AUTO delay clamps, waits for typing, supports taps, and is remembered', async () => {
    const r = runtime({ reduced: false }); const { c, elements, store } = r;
    assert.equal(c.StoryAdv.autoDelay(''), 2000);
    assert.equal(c.StoryAdv.autoDelay('あ'.repeat(30)), 3600);
    assert.equal(c.StoryAdv.autoDelay('あ'.repeat(300)), 6500);
    c.StoryAdv.start('episode4'); elements.get('adv-auto').onclick();
    assert.equal(elements.get('adv-auto').textContent, 'オート ON');
    assert.equal(JSON.parse(store.get(ADV_KEY)).auto, true);
    await r.tick(30); assert.equal(c.__advTest.S.lineIndex, 0);
    c.__advTest.advance(); // complete typewriter
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
    await r.tick(c.StoryAdv.autoDelay(c.__advTest.S.text) - 1); assert.equal(c.__advTest.S.lineIndex, 0);
    await r.tick(1); assert.equal(c.__advTest.S.lineIndex, 1);
    elements.get('adv-auto').onclick(); assert.equal(JSON.parse(store.get(ADV_KEY)).auto, false);
    await r.tick(9000); assert.equal(c.__advTest.S.lineIndex, 1);
});

test('AUTO pauses for backlog and effects; the 800ms pause preserves dialogue', async () => {
    const r = runtime(); const { c, elements } = r;
    c.StoryAdv.start('episode4'); elements.get('adv-auto').onclick();
    c.__advTest.openLog(true); await r.tick(10000); assert.equal(c.__advTest.S.lineIndex, 0);
    c.__advTest.openLog(false); elements.get('adv-auto').onclick();
    Object.assign(c.__advTest.S, { sceneId: 'scene2', lineIndex: 7 });
    elements.get('adv-text').textContent = '否定しないんだ。'; c.__advTest.renderCurrent();
    await r.tick(799); assert.equal(elements.get('adv-text').textContent, '否定しないんだ。');
    c.__advTest.advance(); assert.equal(c.__advTest.S.lineIndex, 7);
    await r.tick(1); assert.equal(elements.get('adv-text').textContent, '開場までまだ時間あるね。');
});

test('multi-character staging keeps explicit actors, dims others, and hides all for announcements', () => {
    const { c, elements } = runtime(); c.StoryAdv.start('episode4');
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
    test(`${label}: story reuses the skill tiles, starts with the favourite, and restores normal preparation`, () => {
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
        c.openStorySkillChoice(c.BattleStoryData.get('episode4'), key => { chosen = key; }, () => { returned = true; });
        assert.equal(elements.get('start-cpu-setup-title').textContent, '第4話 対戦準備');
        assert.equal(elements.get('start-cpu-setup-subtitle').textContent, '千鶴のスキルを選択');
        assert.equal(elements.get('start-setup-button').textContent, 'BATTLE START');
        assert.match(elements.get('start-skill-list').html, /class="start-skill-tile active" data-pick-skill-key="tasteThief"/);
        elements.get('start-skill-list').listeners.click({ target: { closest: () => ({ getAttribute: () => 'foodTrap' }) } });
        elements.get('start-setup-button').listeners.click(); assert.equal(chosen, 'foodTrap');
        c.openStorySkillChoice(c.BattleStoryData.get('episode4'), () => {}, () => { returned = true; });
        elements.get('start-back-menu-button').listeners.click(); assert.equal(returned, true);
        elements.get('menu-cpu-button').listeners.click();
        assert.equal(elements.get('start-cpu-setup-title').textContent, 'CPU戦セットアップ');
        assert.equal(elements.get('start-cpu-setup-subtitle').textContent, '1/3 キャラを選択');
    });
    test(`${label}: normal opening deal, selected skill, default CPU and all story flags`, () => {
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
    test(`${label}: abandoning mid-battle preserves the marker, removes flags, and stops pending actions`, () => {
        const { c, store } = runtime({ main: true, mobile });
        c.StoryAdv.start('episode4'); Object.assign(c.__advTest.S, { sceneId: 'scene2', lineIndex: 22 });
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

test('registered asset URLs use the project root for file://, Pages and the mobile entry', () => {
    for (const base of ['file:///C:/game/story-data/characters.js?v=1', 'https://example.invalid/game/story-data/characters.js?v=1']) {
        const c = vm.createContext({ window: {}, URL, document: { currentScript: { src: base } } });
        vm.runInContext(read('story-data/characters.js'), c);
        assert.equal(c.window.BattleStoryAssets.url('assets/battle-images/card-back.webp'), new URL('../assets/battle-images/card-back.webp', base).href);
    }
});

test('clear waits for the final chime and blackout', async () => {
    const { c, elements, tick, calls, store } = runtime(); c.StoryAdv.start('episode4');
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

test('ADV keeps BGM and explicit cues with mute/volume, without per-line SE', () => {
    const story = runtime(); story.c.StoryAdv.start('episode4'); story.c.__advTest.advance();
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

test('episode4 clear never contributes to the three-tutorial achievement', () => {
    const { c, load } = runtime(); load('achievements.js');
    c.BattleStoryProgress.complete('episode4');
    assert.equal(c.Achievements.readLocal().counters.storyClears, 0);
    for (const id of ['episode1', 'episode2', 'episode3']) c.BattleStoryProgress.complete(id);
    assert.equal(c.Achievements.readLocal().counters.storyClears, 3);
    assert.ok(c.Achievements.readLocal().unlocked.storyComplete);
});

test('winning ending clears resume and marks episode4; losing offers retry without clearing', () => {
    const { c, store, elements } = runtime(); c.StoryAdv.start('episode4');
    Object.assign(c.__advTest.S, { sceneId: 'lose', stage: 'lose', lineIndex: 3 });
    c.__advTest.advance();
    const labels = elements.get('adv-ending').children.map(n => n.textContent);
    assert.ok(labels.includes('もう一度挑戦')); assert.ok(labels.includes('ストーリー選択へ戻る'));
    assert.ok(!labels.some(text => /仮セリフ/.test(text)));
    assert.equal(c.BattleStoryProgress.load().episode4, false);
    elements.get('adv-ending').children.find(n => n.textContent === 'もう一度挑戦').onclick();
    assert.equal(c.choice.episode.id, 'episode4');
    assert.equal(c.__advTest.S.stage, 'battle');
    c.StoryAdv.start('episode4');
    Object.assign(c.__advTest.S, { sceneId: 'win', stage: 'post' }); c.__advTest.clearEpisode();
    assert.equal(JSON.parse(store.get(ADV_KEY)).resume, null);
    assert.equal(c.BattleStoryProgress.load().episode4, true);
    assert.ok(elements.get('adv-ending').children.some(n => n.textContent === 'NEXT 第5話「いい匂いのする方へ」'));
    assert.ok(elements.get('story-adv').classList.contains('adv-cleared'));
    assert.equal(elements.get('adv-effect').className, 'adv-effect', 'blackout removed behind CLEAR');
    assert.ok(elements.get('adv-background').style.backgroundImage.includes('festival-classroom.webp'));
    elements.get('adv-menu').onclick(); assert.equal(JSON.parse(store.get(ADV_KEY)).resume, null);
});

test('portrait layer fills the scene behind controls, with character framing at the requested viewports', () => {
    const { c, elements } = runtime(); c.StoryAdv.start('episode4');
    c.__advTest.stageLine({ speaker: 'chizuru', position: 'right', show: [{ id: 'kanna', position: 'left' }] });
    c.__advTest.renderActors('chizuru');
    for (const actor of elements.get('adv-portraits').children) {
        const framing = c.BattleStoryAssets.characters[actor.dataset.actor];
        assert.equal(Number(actor.style['--adv-focus-y']), framing.focusY);
        assert.equal(Number(actor.style['--adv-portrait-scale']), framing.scale);
    }
    const css = read('story-adv.css');
    assert.match(css, /\.adv-portraits \{ position: absolute; inset: 0; z-index: 1/);
    for (const cls of ['toolbar', 'dialogue']) assert.match(css, new RegExp('\\.adv-' + cls + ' \\{[^}]*z-index: 3'));
    assert.match(css, /100dvh - var\(--adv-toolbar-height/);
    assert.doesNotMatch(css, /\.adv-portrait[^}]*max-height/);
    // Conservative face bounds measured from the retained full-body source artwork.
    // These are layout budgets; actual browser rendering still requires visual review.
    const bounds = { chizuru: [.13, .235], kanna: [.13, .235], mai: [.08, .18], takumi: [.08, .19], akatsuki: [.07, .18] };
    for (const [width, height] of [[1440, 900], [1366, 768], [390, 844], [360, 740], [844, 390]]) {
        const toolbar = width <= 600 ? 102 : 62;
        const dialogue = height < 500 ? Math.max(105, height * .43) : width <= 600 ? Math.max(210, height * .44) : Math.max(180, height * .43);
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

test('CLEAR keeps a dimmed episode background, prominent NEXT and reduced-motion support', () => {
    const css = read('story-adv.css');
    assert.match(css, /\.adv-cleared \.adv-ending \{[^}]*background: radial-gradient/);
    assert.match(css, /\.adv-teaser \{[^}]*font-size: clamp\(23px/);
    assert.match(css, /\.adv-cleared \.adv-ending h2::before/);
    assert.match(css, /prefers-reduced-motion: reduce[^]*animation: none !important; transition: none !important/);
});

test('episodes1–3 data, tutorial setup, HUD, objectives and guards are unchanged', () => {
    const source = read('story-mode.js'); const hash = text => crypto.createHash('sha256').update(text).digest('hex');
    assert.equal(hash(source.slice(source.indexOf('    const EPISODES = ['), source.indexOf('    const S = {'))), 'b0c9557048da2afe04fe36f6f2d12eebdbac4a5169876b9bc1662605ae765447');
    assert.equal(hash(source.slice(source.indexOf('    function getNextCardId'), source.indexOf('    function handleStoryBattleEnded'))), '37382307e675f6ab78d30c443d823665d166f9c4b3e19f66e757a6d1a9d07ca0');
    assert.match(read('achievements.js'), /\['episode1', 'episode2', 'episode3'\]/);
    assert.match(read('achievements.js'), /if \(state\.achievementStory\) return \[\]/);
});

test('kanna and tsuyoshi are absent from selectable, gallery, favourite, achievement and online lists', () => {
    for (const file of ['main.js', 'mobile/main-sp.js']) {
        const source = read(file);
        for (const name of ['START_CHARACTER_OPTIONS', 'START_GALLERY_CHARACTER_OPTIONS']) {
            const value = source.match(new RegExp('const ' + name + ' = \\[([^]*?)\\];'))[1];
            assert.doesNotMatch(value, /kanna|tsuyoshi/);
        }
    }
    for (const file of ['profile.js', 'achievements.js', 'network.js', 'battle-engine-worker.js', 'battle-images.js']) assert.doesNotMatch(read(file), /kanna|tsuyoshi/, file);
    for (const file of ['web.html', 'mobile/mobile.html']) assert.doesNotMatch(read(file), /value="(?:kanna|tsuyoshi)"/);
});

test('both pages load ADV data locally in order with the current cache key', () => {
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const source = read(file); let last = -1;
        for (const module of ['story-data/characters.js', 'story-data/registry.js', 'story-data/episode4.js', 'story-adv.js', 'story-mode.js']) {
            const version = ['story-data/registry.js', 'story-mode.js'].includes(module) ? '20261003-adv1' : '20261003-adv2';
            const position = source.indexOf(module + '?v=' + version); assert.ok(position > last, file + ': ' + module); last = position;
        }
        assert.ok(source.includes('story-adv.css?v=20261003-adv2'));
    }
    assert.doesNotMatch(read('story-adv.js'), /\bfetch\s*\(/);
    assert.match(read('story-adv.css'), /\.adv-portraits \{ position: absolute; inset: 0; z-index: 1/);
    assert.match(read('story-adv.css'), /overflow-wrap: anywhere/);
    assert.match(read('story-adv.css'), /prefers-reduced-motion/);
});
