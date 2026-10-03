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
    for (const file of ['story-data/characters.js', 'story-data/registry.js', ...[4, 5, 6, 7].map(n => `story-data/episode${n}.js`)]) load(file);
    vm.runInContext(read('story-adv.js').replace(/\}\)\(window\);\s*$/, 'root.__advTest = { S, saved, advance, renderCurrent, renderActors, enterScene, stageLine, savePosition, chooseBattle, clearEpisode, openLog, toggleAuto, episodeImages, imageCache, pausePlayback, resumePlayback, askSkip, skipToStop, toggleFastForward };\n})(window);'), c);
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
    return { c, elements, jobs, requests, warnings, calls, store, tick, load, Element, preloaded };
}

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
        assert.equal(elements.get('adv-text').textContent, reduced ? 'カレーよし。おにぎりもよし。' : 'カ');
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
        assert.equal(elements.get('adv-text').textContent, '……でも、ちゃんとおいしいか確認したほうがいいよね。');
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
        assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
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
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
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
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
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
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
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
        assert.equal(announcement.text, scenario.match(/ここで校内放送。「([^」]*)」/)[1]);
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
    assert.ok(assertions > 100, 'expression mapping, registry and episode checks still run without docs');
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
    assert.equal(reload.elements.get('adv-text').textContent, '……でも、ちゃんとおいしいか確認したほうがいいよね。');
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
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
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
    elements.get('adv-text').textContent = '否定しないんだ。'; c.__advTest.renderCurrent();
    await r.tick(799); assert.equal(elements.get('adv-text').textContent, '否定しないんだ。');
    c.__advTest.advance(); assert.equal(c.__advTest.S.lineIndex, 7);
    await r.tick(1); assert.equal(elements.get('adv-text').textContent, '開場までまだ時間あるね。');
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

test('CLEAR keeps a dimmed episode background, prominent NEXT and reduced-motion support', async () => {
    const css = read('story-adv.css');
    assert.match(css, /\.adv-cleared \.adv-ending \{[^}]*background: radial-gradient/);
    assert.match(css, /\.adv-teaser \{[^}]*font-size: clamp\(23px/);
    assert.match(css, /\.adv-cleared \.adv-ending h2::before/);
    assert.match(css, /prefers-reduced-motion: reduce[^]*animation: none !important; transition: none !important/);
});

test('episodes1–3 data, tutorial setup, HUD, objectives and guards are unchanged', async () => {
    const source = read('story-mode.js'); const hash = text => crypto.createHash('sha256').update(text).digest('hex');
    assert.equal(hash(source.slice(source.indexOf('    const EPISODES = ['), source.indexOf('    const S = {'))), 'b0c9557048da2afe04fe36f6f2d12eebdbac4a5169876b9bc1662605ae765447');
    assert.equal(hash(source.slice(source.indexOf('    function getNextCardId'), source.indexOf('    function handleStoryBattleEnded'))), '37382307e675f6ab78d30c443d823665d166f9c4b3e19f66e757a6d1a9d07ca0');
    assert.match(read('achievements.js'), /\['episode1', 'episode2', 'episode3'\]/);
    assert.match(read('achievements.js'), /if \(state\.achievementStory\) return \[\]/);
});

test('kanna and tsuyoshi are absent from selectable, gallery, favourite, achievement and online lists', async () => {
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

test('both pages load ADV data locally in order with the current cache key', async () => {
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const source = read(file); let last = -1;
        for (const module of ['story-data/characters.js', 'story-data/registry.js', 'story-data/episode4.js', 'story-data/episode5.js', 'story-data/episode6.js', 'story-data/episode7.js', 'story-adv.js', 'story-mode.js']) {
            const version = module === 'story-adv.js' ? '20261003-playback1' : ['story-data/registry.js', 'story-mode.js'].includes(module) ? '20261003-adv1' : module === 'story-data/episode4.js' ? '20261003-adv2' : /episode[567]\.js$/.test(module) ? '20261003-story-approved1' : '20261003-ep5-7';
            const position = source.indexOf(module + '?v=' + version); assert.ok(position > last, file + ': ' + module); last = position;
        }
        assert.ok(source.includes('story-adv.css?v=20261003-story-approved1'));
    }
    assert.doesNotMatch(read('story-adv.js'), /\bfetch\s*\(/);
    assert.match(read('story-adv.css'), /\.adv-portraits \{ position: absolute; inset: 0; z-index: 1/);
    assert.match(read('story-adv.css'), /overflow-wrap: anywhere/);
    assert.match(read('story-adv.css'), /prefers-reduced-motion/);
});

const STORY_NAMES = { '千鶴': 'chizuru', '栞那': 'kanna', '舞依': 'mai', '拓海': 'takumi', '暁': 'akatsuki', '剛': 'tsuyoshi' };
const NEW_EPISODES = [
    [5, 'mai', 'chizuru', 94, 'いい匂いのする方へ', 'もう少し、ここにいたい', '文化祭に来た舞依と拓海。いい匂いに誘われて入った教室で、舞依は千鶴と出会う。'],
    [6, 'mai', 'kanna', 166, 'もう少し、ここにいたい', 'うるさい二人が来た', 'カレーを食べながら、舞依は栞那に千鶴のことを聞いてみる。もう少しだけ、ここにいたくて――。'],
    [7, 'chizuru', 'akatsuki', 185, 'うるさい二人が来た', 'もう少しだけ', '廊下から聞こえてくる、うるさい二人の声。注文を聞きに行った千鶴は、さっそくいじられて……。']
];
// Read source speech independently of the data. CLEAR/NEXT quotes are a teaser,
// and the BATTLE START metadata is not dialogue.
function scenarioSpeech(source, protagonist) {
    source = source.split(/^#+ 第\d話 CLEAR/m)[0].replace(/^# BATTLE START[^]*?^# BATTLE CLEAR/m, '# BATTLE CLEAR');
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
            result.push({ speaker: 'narration', text: value.slice(3, -3), direction: '' }); continue;
        }
        if (value.startsWith('「') && value.endsWith('」')) {
            result.push({ speaker, text: value.slice(1, -1), direction,
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
        assert.deepEqual(clone(ep.clear), { title, next: { number: number + 1, title: nextTitle } });
        const lines = ep.scenes.filter(s => s.id !== 'lose').flatMap(s => s.lines), spoken = lines.filter(l => l.text);
        assert.equal(spoken.length, speechCount);
        assert.equal(lines.filter(l => l.battle).length, 1);
        assert.equal(lines.find(l => l.battle).id, ep.battle.after);
        assert.equal(lines.at(-1).effect, 'fadeOut');
        assert.equal(Object.hasOwn(ep.scenes.find(s => s.id === 'lose'), 'provisional'), false);
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
            assert.ok(c.BattleStoryAssets.characters[line.speaker].portraits[line.expression], line.id);
            const explicit = line.direction.match(/^【(右|左)：/);
            if (explicit) positions[line.speaker] = explicit[1] === '右' ? 'right' : 'left';
            assert.equal(line.position, positions[line.speaker] || (line.speaker === player ? 'right' : 'left'), line.id);
        }
        assert.equal(warnings.length, 0);
        await t.test('word-for-word scenario speech, speaker, direction and inherited position', t => {
            const file = `docs/story/episode${number}-scenario.md`;
            if (!fs.existsSync(path.join(root, file))) { t.skip('Source scenario is absent; only the word-for-word comparison is skipped.'); return; }
            const source = read(file);
            const actual = clone(spoken.map(({ speaker, text, direction, position }) =>
                speaker === 'narration' ? { speaker, text, direction } : { speaker, text, direction, position }));
            assert.deepEqual(actual, scenarioSpeech(source, player));
        });
        await t.test('word-for-word approved loss speech and direction', t => {
            const file = 'docs/story/lose-lines-ep5-7.md';
            if (!fs.existsSync(path.join(root, file))) { t.skip('Source loss dialogue is absent; only the word-for-word comparison is skipped.'); return; }
            const section = read(file).split(new RegExp(`## 第${number}話[^\\n]*\\n`))[1].split(/\n## /)[0];
            const expected = [...section.matchAll(/(【(右|左)：([^／】]+)[^】]*】)([^「]+)「([^」]*)」/g)].map(([, direction, side, name, speaker, text]) => {
                assert.equal(name, speaker);
                return { direction, position: side === '右' ? 'right' : 'left', speaker: STORY_NAMES[name], text };
            });
            const actual = clone(ep.scenes.find(s => s.id === 'lose').lines.map(({ direction, position, speaker, text }) => ({ direction, position, speaker, text })));
            assert.deepEqual(actual, expected);
        });
    });
}

test('episode5–7 publish copies skip only missing original comparisons', async () => {
    const cases = new Map(), skipped = []; let assertions = 0;
    const portableFs = Object.create(fs);
    const missing = file => /(?:episode[567]-scenario|lose-lines-ep5-7)\.md$/.test(file);
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
    for (const number of [5, 6, 7]) await cases.get(`episode${number}: data, staging and optional source comparisons`)({
        test: async (name, callback) => callback({ skip: reason => skipped.push(reason) })
    });
    assert.equal(skipped.length, 6); assert.ok(skipped.every(reason => reason.includes('only the word-for-word comparison')));
    assert.ok(assertions > 1000, 'all data/staging checks still run');
});

test('portrait expressions are exactly the approved registrations, including kitchen', () => {
    const { c } = runtime(); const a = c.BattleStoryAssets;
    const expected = {
        chizuru: ['normal', 'smile', 'troubled', 'surprised', 'angry', 'embarrassed'],
        kanna: ['normal', 'smile', 'smug', 'troubled', 'surprised', 'angry'],
        mai: ['normal', 'smile', 'surprised', 'troubled', 'angry', 'embarrassed'],
        takumi: ['normal', 'smile', 'troubled', 'surprised', 'embarrassed'],
        akatsuki: ['normal', 'smile', 'smug', 'troubled', 'surprised'],
        tsuyoshi: ['normal', 'smile', 'troubled', 'surprised']
    };
    for (const [id, expressions] of Object.entries(expected)) {
        assert.deepEqual(clone(Object.keys(a.characters[id].portraits)).sort(), expressions.sort());
        for (const expression of expressions) assert.equal(a.characters[id].portraits[expression], `assets/battle-images/story/portraits/${id}-${expression}.webp`);
        assert.equal(a.portraitPath(id, 'unlisted'), a.characters[id].portraits.normal);
    }
    assert.equal(a.backgrounds['festival-kitchen'], 'assets/battle-images/story/backgrounds/festival-kitchen.webp');
});

test('unlock cards follow 4 → 5 → 6 → 7 and preserve unknown progress', async () => {
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
    assert.equal(locked(4), false); for (const n of [5, 6, 7]) assert.equal(locked(n), true);
    for (const n of [4, 5, 6]) {
        c.BattleStoryProgress.complete(`episode${n}`); assert.equal(locked(n + 1), false);
        if (n < 6) assert.equal(locked(n + 2), true);
    }
});

test('offscreen dialogue keeps names but never stages or preloads a portrait', async () => {
    for (const [number, expectedNames] of [[6, ['？？？', '？？？']], [7, ['剛', '暁', '剛', '暁']]]) {
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

test('episode backgrounds, notify, intro dimming and inherited positions match the staging brief', async () => {
    const { c, elements, tick, calls } = runtime();
    const ep5 = c.BattleStoryData.get('episode5'), ep6 = c.BattleStoryData.get('episode6'), ep7 = c.BattleStoryData.get('episode7');
    assert.deepEqual(clone(ep5.scenes.map(s => s.background)), ['festival-hallway', ...Array(4).fill('festival-classroom')]);
    assert.equal(ep6.scenes.find(s => s.id === 'scene6').background, 'festival-kitchen');
    assert.equal(ep7.scenes[0].background, 'festival-kitchen');
    assert.ok(ep7.scenes.slice(1).every(s => s.background === 'festival-classroom'));
    for (const [ep, speaker, direction, expression] of [
        [ep5, 'mai', '【舞依・少し冷たい】', 'angry'], [ep5, 'takumi', '【左：拓海／焦り】', 'embarrassed'],
        [ep6, 'kanna', '【左：栞那／興味あり】', 'smug'], [ep6, 'kanna', '【左：栞那／嫌そうな顔】', 'angry'],
        [ep6, 'chizuru', '【千鶴／少し嫌そう】', 'angry'], [ep6, 'mai', '【右：舞依／興味津々】', 'surprised'],
        [ep7, 'tsuyoshi', '【左：剛／元気】', 'smile'], [ep7, 'akatsuki', '【暁／薄く笑う】', 'smug'],
        [ep7, 'akatsuki', '【左：暁／少し悔しそう】', 'troubled']
    ]) {
        const matches = ep.scenes.flatMap(s => s.lines).filter(l => l.speaker === speaker && l.direction === direction);
        assert.ok(matches.length); matches.forEach(line => assert.equal(line.expression, expression));
    }
    const intro = ep7.scenes.find(s => s.id === 'scene4'); assert.equal(intro.battleIntro, true); assert.equal(intro.lines[0].effect, 'battleTease');
    await c.StoryAdv.start('episode7'); c.__advTest.enterScene('scene4', 'pre');
    assert.ok(elements.get('story-adv').classList.contains('adv-battle-intro'));
    assert.equal(elements.get('adv-effect').className, 'adv-effect battle-tease');
    await tick(950); assert.equal(elements.get('adv-text').textContent, 'じゃあやろ。');
    c.__advTest.enterScene('win', 'post'); assert.equal(elements.get('story-adv').classList.contains('adv-battle-intro'), false);
    const notify = ep6.scenes.find(s => s.id === 'scene3').lines.find(l => l.se === 'notify');
    assert.equal(notify.direction, '連絡先交換のSE。'); assert.equal(notify.text, '');
    await c.StoryAdv.start('episode6'); Object.assign(c.__advTest.S, { sceneId: 'scene3', lineIndex: ep6.scenes.find(s => s.id === 'scene3').lines.indexOf(notify) });
    c.__advTest.renderCurrent(); assert.ok(calls.includes('notify')); await tick(350);
    assert.equal(elements.get('adv-text').textContent, 'やった。');
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
                assert.ok(labels.some(text => text.startsWith(`NEXT 第${number + 1}話`)));
                const expectedSpeech = S.episode.scenes.filter(s => s.id !== 'lose' && (s.id === 'win' || (number === 6 && s.id === 'scene6') || (number === 7 && ['scene5', 'scene6'].includes(s.id)))).flatMap(s => s.lines).filter(l => l.text).map(l => l.text);
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
    for (const [number, sceneId] of [[6, 'scene6'], [7, 'scene5'], [7, 'scene6']]) {
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
    for (const number of [5, 6, 7]) {
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

test('episode4 source is unchanged and new clears never count toward tutorial achievements', () => {
    assert.equal(crypto.createHash('sha256').update(read('story-data/episode4.js').replace(/\r\n/g, '\n')).digest('hex'), '8d169030f55bc5b422896031e44364b93a3240eb50eecf86f95463f75b40eb31');
    const { c, load } = runtime(); load('achievements.js');
    for (const n of [4, 5, 6, 7]) c.BattleStoryProgress.complete(`episode${n}`);
    assert.equal(c.Achievements.readLocal().counters.storyClears, 0);
});

function pressKey(r, key, { up = false, repeat = false, target, shiftKey = false } = {}) {
    let prevented = false;
    r.c.document.listeners[up ? 'keyup' : 'keydown']({ key, repeat, shiftKey,
        target: target || r.elements.get('adv-dialogue'), preventDefault() { prevented = true; } });
    return prevented;
}
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

for (const mobile of [false, true]) for (const number of [4, 5, 6, 7]) {
    test(`${mobile ? 'phone' : 'PC'}: episode${number} loss → continue as win → resume → CLEAR unlocks next`, async () => {
        const r = runtime({ main: true, mobile }), { c, elements, tick, store } = r;
        await c.StoryAdv.start(`episode${number}`);
        elements.get('adv-skip').onclick(); await elements.get('adv-skip-yes').onclick();
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
        if (number === 7) reload.c.BattleStoryData.register({ id: 'episode8', number: 8,
            title: '次の話', unlockRequires: 'episode7', scenes: [] });
        const cards = new reload.Element(); reload.c.StoryAdv.appendEpisodeCards(cards);
        const next = cards.children.find(card => card.children.some(el => el.getAttribute?.('data-story-episode-id') === `episode${number + 1}`));
        assert.equal(next.children.find(el => el.tagName === 'button').disabled, false);
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
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし。');
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
