const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const optionalSource = (t, sourceRoot, files) => require('./helpers/optional-source.cjs')(t, sourceRoot, files, fs);
const REVIEW_FILE = 'docs/story/emphasis-changes-20261004.md';
const FIXES_FILE = 'docs/story/story-fixes.md';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const ADV_KEY = 'battleAlaCarteStoryAdvV1', PROGRESS_KEY = 'battleAlaCarteStoryProgressV1';
const { storyEpisodes, firstAppearances, declaredIntros } = require('../tools/measure-story-intros.cjs');

// Retain the historical 81b fingerprint outside the owner's explicitly replaced scene.
function historicalEpisode(episode) {
    const value = clone(episode);
    if (value.id === 'episode7') value.scenes.find(scene => scene.id === 'scene3').lines = JSON.parse(read('tests/fixtures/episode7-scene3-before-summer.json'));
    return value;
}
function summerReplacementSpeech() {
    const names = { 剛: 'tsuyoshi', 暁: 'akatsuki', 千鶴: 'chizuru' }, positions = {}, result = [];
    let direction = '';
    for (const raw of read('docs/story/episode7-fix-summer.md').split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('【')) { direction = line; continue; }
        const speech = line.match(/^\*\*(剛|暁|千鶴)\*\*「(.*)」$/);
        if (!speech) continue;
        const speaker = names[speech[1]], position = direction.match(/^【(左|右)：/);
        if (position) positions[speaker] = position[1] === '左' ? 'left' : 'right';
        result.push({ speaker, text: speech[2].replace(/。$/, ''), direction, position: positions[speaker] || 'left' });
        direction = '';
    }
    return result;
}

test('99e declared story-wide introductions match the first on-screen appearances in episode order', () => {
    const data = declaredIntros(), episodes = storyEpisodes();
    const expected = firstAppearances(episodes, Object.keys(data));
    assert.equal(episodes.length, 15);
    assert.deepEqual(Object.fromEntries(Object.entries(data).map(([id, intro]) => [id, intro.introAt])), expected);
    assert.deepEqual(expected, {
        mai: { episode: 1, scene: 'pre', line: 1 }, takumi: { episode: 1, scene: 'pre', line: 2 },
        akatsuki: { episode: 3, scene: 'pre', line: 1 }, chizuru: { episode: 3, scene: 'pre', line: 2 },
        tsuyoshi: { episode: 3, scene: 'pre', line: 5 }, kanna: { episode: 3, scene: 'pre', line: 8 },
        yuzuki: { episode: 'special-kyudo', scene: 'scene1', line: 1 },
        ryuta: { episode: 'special-osananajimi-1', scene: 'scene1', line: 23 }
    });
});
test('99e intro computation sorts episodes and ignores offscreen, monologue, inactive onlyIfShown and classmates', () => {
    const episodes = [
        { number: 2, scenes: [{ id: 'later', lines: [{ speaker: 'mai' }, { speaker: 'takumi' }] }] },
        { number: 1, scenes: [{ id: 'pre', lines: [
            { speaker: 'mai', offscreen: true, show: [{ id: 'takumi' }] },
            { speaker: 'takumi', monologue: true },
            { speaker: 'narration', show: [{ id: 'mai', onlyIfShown: true }] },
            { speaker: 'narration', show: [{ id: 'takumi' }] },
            { speaker: 'mai', intro: false }, { speaker: 'classmate1' }
        ] }] }
    ];
    assert.deepEqual(firstAppearances(episodes, ['mai', 'takumi']), {
        takumi: { episode: 1, scene: 'pre', line: 4 }, mai: { episode: 1, scene: 'pre', line: 5 }
    });
});


// Only the owner's coordinate-specific review table may relax source equality.
function storyReview() {
    const changes = new Map(), effects = new Map();
    if (!fs.existsSync(path.join(root, REVIEW_FILE))) return { changes, effects };
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
    if (number === 7 && scene === 'scene3' && lines.length === 35) return clone(lines); // Owner's 100b replacement supersedes the old scene3 review.
    return clone(lines).map((line, i) => {
        const key = number + '/' + scene + ':' + (i + 1), edit = review.changes.get(key), fx = review.effects.get(key);
        if (line.pose !== undefined) {
            const file = 'docs/story/poses-assignments-90b.md';
            if (fs.existsSync(path.join(root, file))) assert.ok(read(file).includes(`| 第${number}話 | ${scene}:${i + 1} | ${{ chizuru: '千鶴', kanna: '栞那', mai: '舞依' }[line.speaker]} | ${line.pose} |`), key);
            delete line.pose; // The coordinate-specific owner table authorizes only this new field.
        }
        if (edit) { assert.equal(line.text, edit.after, key); line.text = edit.before; }
        if (fx) for (const [field, value] of Object.entries(fx)) { assert.equal(line[field], value, key); delete line[field]; }
        return line;
    });
}

// Small offline DOM/timer harness, matching the VM tests used by the existing game.
function runtime({ mobile = false, reduced = true, save = {}, main = false, storageBlocked = false, imageBehavior = {}, viewer = false, intros = false } = {}) {
    const elements = new Map(), jobs = new Map(), requests = [], warnings = [], calls = [], persistentWrites = [], store = new Map(Object.entries(save));
    let now = 0, sequence = 0, dateSequence = 0;
    const motionListeners = [], motionQuery = { matches: reduced, addEventListener: (_name, fn) => motionListeners.push(fn) };
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag; this.children = []; this.dataset = {};
            this.style = { setProperty(name, value) { this[name] = value; } }; this.hidden = false;
            this.className = ''; this.attributes = {}; this.listeners = {}; this.listenerOptions = {}; this.textContent = ''; this.scrollTop = 0;
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
            // This lightweight fixture normally flattens markup; retain the nested icon crop.
            if (this.id === 'story-adv') {
                const icon = elements.get('adv-face-icon'), crop = elements.get('adv-icon-crop');
                crop.remove(); icon.appendChild(crop);
                icon.remove(); elements.get('adv-dialogue').appendChild(icon);
            }
        }
        appendChild(node) { node.parent = this; this.children.push(node); return node; }
        append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
        replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name] || ''; }
        addEventListener(name, fn, options) { this.listeners[name] = fn; this.listenerOptions[name] = options; }
        focus() { document.activeElement = this; }
        showModal() { this.open = true; }
        close() { this.open = false; }
        closest() { return null; }
        querySelector(selector) {
            const className = selector.slice(1);
            return this.children.find(node => node.classList?.contains(className)) || null;
        }
        getBoundingClientRect() { return { height: 62 }; }
    }
    const document = { currentScript: null, readyState: 'loading', visibilityState: 'visible', listeners: {}, eventHandlers: new Map(),
        getElementById: id => elements.get(id) || null, querySelectorAll: () => [], querySelector: () => null,
        createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }), body: new Element('body'),
        addEventListener(name, fn) {
            this.listeners[name] = fn;
            if (!this.eventHandlers.has(name)) this.eventHandlers.set(name, []);
            this.eventHandlers.get(name).push(fn);
        }
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
        document, Image: FakeImage, URL, URLSearchParams, Math, location: { search: viewer ? '?viewer' : '', pathname: mobile ? '/mobile/mobile.html' : '/web.html' },
        performance: { now: () => now }, Date: class extends Date { static now() { return 100000 + now + dateSequence++; } },
        setTimeout(callback, delay = 0) { const id = ++sequence; jobs.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => jobs.delete(id), setInterval: () => 0, clearInterval() {},
        localStorage: {
            getItem(key) { if (storageBlocked) throw Error('blocked'); return store.get(key) || null; },
            setItem(key, value) { persistentWrites.push(['set', key]); if (storageBlocked) throw Error('blocked'); store.set(key, value); },
            removeItem(key) { persistentWrites.push(['remove', key]); store.delete(key); },
            clear() { persistentWrites.push(['clear']); store.clear(); }
        }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, matchMedia: () => motionQuery
    });
    c.window = c;
    // Playback/regression cases deliberately accept the new replacement prompt.
    // Cancellation and real modal input are exercised separately by the safety tests.
    c.StageLayout = { confirmDestructive: async () => { calls.push('data-loss-confirm'); return true; } };
    const load = file => vm.runInContext(read(file), c, { filename: file });
    if (viewer) load('story-viewer.js');
    for (const file of ['story-data/portrait-metrics.js', 'story-data/icon-metrics.js', 'story-data/characters.js', 'story-data/registry.js', ...[4, 5, 6, 7, 8, 9, 10].map(n => `story-data/episode${n}.js`)]) load(file);
    if (intros) load('story-data/character-intros.js');
    vm.runInContext(read('story-adv.js').replace(/\}\)\(window\);\s*$/, 'root.__advTest = { S, saved, advance, renderCurrent, renderActors, enterScene, stageLine, savePosition, chooseBattle, clearEpisode, openLog, toggleAuto, episodeImages, imageCache, pausePlayback, resumePlayback, askSkip, skipToStop, toggleFastForward, showIntro, closeIntro, discardIntro };\n})(window);'), c);
    vm.runInContext(read('story-mode.js').replace(/\}\)\(\);\s*$/, 'window.__legacyTest = { S, EPISODES, init, startIntro, beginPost, openSelection, onBattleStateUpdated, installGuards, renderEpisodeList, loadProgress, saveProgress, startBattle, handleStoryBattleEnded };\n})();'), c);
    Object.assign(c, {
        playStoryBGM: character => { c.lastStoryThemeCharacter = character; calls.push('story-bgm'); }, playStoryCue: kind => calls.push(kind),
        playStoryDialogueSound: () => calls.push('dialogue'), stopStoryCues() {},
        openStorySkillChoice: (episode, onStart, onBack) => { c.choice = { episode, onStart, onBack }; calls.push('skill-choice'); },
        openStoryStage: () => {
            if (viewer) { c.StoryViewer.open(); calls.push('viewer-list'); }
            else { c.StoryAdv.abandonBattle(); c.StoryAdv.stop(); calls.push('story-select'); }
        }
    });
    if (main) {
        for (const name of ['cards', 'state', 'rules', 'player', 'cpu', 'main']) load(mobile ? `mobile/${name}-sp.js` : `${name}.js`);
        c.__normalFinale = c.prepareMatchFinale;
        c.__normalHideResult = c.hideResultOverlay;
        load('battle-view-model.js'); load('battle-images.js');
        Object.assign(c, { safeStartGame: () => { calls.push('init-normal'); c.initGame(); vm.runInContext('gameStartedOnce = true', c); },
            startBgmOnce() {}, unlockAudio() {}, stopBGM() {}, addLog: text => calls.push(text), updateUI() {},
            hideResultOverlay() {}, hideSpotlightCard() {}, closePackShop() {},
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
    return { c, elements, jobs, requests, warnings, calls, store, tick, load, Element, preloaded, persistentWrites,
        setReduced(value) { motionQuery.matches = value; motionListeners.forEach(fn => fn({ matches: value })); } };
}

for (const mobile of [false, true]) test(`${mobile ? 'phone' : 'PC'}: ADV replacement cancels without a write and only starts after deliberate acceptance`, async () => {
    const r = runtime({ mobile });
    await r.c.StoryAdv.start('episode4'); r.c.StoryAdv.stop();
    const before = r.store.get(ADV_KEY), writes = r.persistentWrites.length;
    let decide, prompts = 0;
    r.c.StageLayout.confirmDestructive = options => {
        prompts++; assert.equal(options.title, 'ストーリーの再開位置を上書きしますか？');
        return new Promise(resolve => { decide = resolve; });
    };
    const canceled = r.c.StoryAdv.start('episode5');
    assert.equal(r.c.__advTest.S.episode.id, 'episode4');
    assert.equal(r.c.__advTest.S.active, false); assert.equal(r.store.get(ADV_KEY), before);
    decide(false); await canceled;
    assert.equal(r.store.get(ADV_KEY), before); assert.equal(r.persistentWrites.length, writes);
    const accepted = r.c.StoryAdv.start('episode5'); decide(true); await accepted;
    assert.equal(r.c.__advTest.S.episode.id, 'episode5');
    assert.equal(JSON.parse(r.store.get(ADV_KEY)).resume.episodeId, 'episode5');
    assert.equal(prompts, 2);
    r.c.StoryAdv.stop(); await r.c.StoryAdv.start('episode5', true);
    assert.equal(prompts, 2, 'resuming the same saved position keeps its data');
});

function fullRuntime(options = {}) {
    const r = runtime(options);
    for (const ep of [...r.c.BattleStoryData.all(), ...r.c.__legacyTest.EPISODES]) ep.portraitStyle = 'full';
    return r;
}

// Dispatch through the mounted element tree, including capture and bubbling.
// Calling advance() alone would miss swallowed input and touch click-through.
function introInput(target, type, properties = {}) {
    const route = [];
    for (let node = target; node; node = node.parent) route.push(node);
    const event = { target, type, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; }, ...properties };
    const capture = node => node.listenerOptions?.[type] === true || node.listenerOptions?.[type]?.capture === true;
    for (const node of route.slice().reverse()) {
        if (capture(node)) node.listeners[type]?.(event);
        if (event.stopped) return event;
    }
    for (const node of route) {
        if (!capture(node)) node.listeners[type]?.(event);
        if (event.stopped) break;
    }
    return event;
}
async function openIntroEpisode(r, episode, viewer) {
    // 99d input regression: ep6 is no longer a default introduction in 99e.
    // Force only its original first speaker so the same input paths stay covered.
    if (episode === 6) {
        const data = viewer ? r.c.StoryViewer.get('episode6') : r.c.BattleStoryData.get('episode6');
        data.scenes[0].lines.find(line => line.speaker === 'mai' && !line.offscreen).intro = true;
    }
    if (episode === 1 && !viewer) {
        const data = r.c.__legacyTest.EPISODES[0];
        await r.c.StoryAdv.playConversation(data, data.pre, { phase: 'pre', getActions: () => [] });
    } else await r.c.StoryAdv.start(`episode${episode}`);
    await r.tick(0);
    assert.equal(r.elements.get('adv-character-intro').hidden, false);
}
for (const mobile of [false, true]) for (const viewer of [false, true]) for (const episode of [1, 6]) {
    for (const moment of ['immediate', 'entrance', '5s', 'auto', 'pause', 'log']) {
        for (const input of ['click', 'touch', 'delayed-touch-click']) {
            test(`99d ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'} ep${episode} ${moment} ${input}: one gesture closes only the intro`, async () => {
                const r = viewer ? viewerRuntime({ mobile, intros: true, reduced: false }) : runtime({ mobile, intros: true, reduced: false });
                await openIntroEpisode(r, episode, viewer);
                const { c, tick, elements } = r, t = c.__advTest;
                const intro = elements.get('adv-character-intro'), dialogue = elements.get('adv-dialogue');
                const index = t.S.lineIndex, item = t.S.episode.scenes.find(s => s.id === t.S.sceneId).lines[index];
                const target = moment === 'immediate' ? intro : intro.querySelector('.adv-intro-art');
                if (moment === 'entrance') await tick(160);
                if (moment === '5s') await tick(5000);
                if (moment === 'auto') { t.toggleAuto(); await tick(1000); }
                if (moment === 'pause' || moment === 'log') {
                    t.toggleAuto(); await tick(500);
                    if (moment === 'pause') t.pausePlayback(); else t.openLog(true);
                    introInput(target, 'click');
                    introInput(target, 'pointerup', { pointerType: 'touch' });
                    await tick(5000);
                    assert.equal(intro.hidden, false, 'frozen playback keeps the intro');
                    assert.equal(t.S.intro.closing, false);
                    if (moment === 'pause') { t.openLog(true); t.openLog(false); t.resumePlayback(); }
                    else t.openLog(false);
                }
                assert.equal(t.S.busy, true); assert.equal(t.S.backlog.length, 0);
                introInput(target, 'pointerdown');
                if (input === 'click') introInput(target, 'click');
                else {
                    const up = introInput(target, 'pointerup', { pointerType: 'touch', isPrimary: true });
                    assert.equal(up.defaultPrevented, true);
                    if (input === 'touch') introInput(target, 'click');
                }
                assert.equal(t.S.intro.closing, true);
                await tick(180);
                assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
                if (input === 'delayed-touch-click') {
                    await tick(320);
                    // On phones the compatibility click may hit the revealed layer.
                    const beforeTyping = t.S.typing, beforeText = elements.get('adv-text').textContent;
                    introInput(dialogue, 'click');
                    assert.equal(t.S.typing, beforeTyping, 'late click must not complete or skip the text');
                    assert.equal(elements.get('adv-text').textContent, beforeText);
                }
                assert.equal(t.S.lineIndex, index);
                assert.equal(t.S.backlog.length, 1); assert.equal(t.S.backlog[0].text, item.text);
                if (t.saved.auto) t.toggleAuto();
                await tick(6500);
                assert.equal(elements.get('adv-text').textContent, item.text);
                introInput(dialogue, 'pointerdown'); introInput(dialogue, 'click'); await tick(0);
                assert.equal(t.S.lineIndex, index + 1, 'the next independent click advances normally');
                if (viewer) assert.equal(r.persistentWrites.length, 0);
            });
        }
    }
    for (const key of ['Enter', ' ']) test(`99d ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'} ep${episode} ${key}: keyboard closes only the intro`, async () => {
        const r = viewer ? viewerRuntime({ mobile, intros: true, reduced: false }) : runtime({ mobile, intros: true, reduced: false });
        await openIntroEpisode(r, episode, viewer); await r.tick(5000);
        const t = r.c.__advTest, intro = r.elements.get('adv-character-intro'), index = t.S.lineIndex;
        r.c.document.listeners.keydown({ key, target: intro, preventDefault() {} });
        await r.tick(180);
        assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
        assert.equal(t.S.lineIndex, index); assert.equal(t.S.backlog.length, 1);
    });
}
test('99d intro disables native image/text drag that can cancel the mouse click', async () => {
    const r = runtime({ intros: true }); await openIntroEpisode(r, 6, false);
    const intro = r.elements.get('adv-character-intro'), art = intro.querySelector('.adv-intro-art');
    assert.equal(art.draggable, false);
    for (const target of [art, intro.querySelector('.adv-intro-copy')]) {
        assert.equal(introInput(target, 'dragstart').defaultPrevented, true);
    }
    introInput(art, 'click'); await r.tick(100);
    assert.equal(intro.hidden, true); assert.equal(r.c.__advTest.S.lineIndex, 2);
});
test('99d intro state exists before visibility/focus and is cleared only after hiding, including reentrant focus input', async () => {
    const r = runtime({ intros: true, reduced: false }); await openIntroEpisode(r, 6, false);
    const t = r.c.__advTest, intro = r.elements.get('adv-character-intro');
    t.discardIntro(); await r.tick(0);
    let hidden = intro.hidden, state = t.S.intro;
    Object.defineProperty(intro, 'hidden', { get: () => hidden, set(value) {
        if (!value) assert.ok(t.S.intro, 'a visible intro must already have its state');
        hidden = value;
    } });
    Object.defineProperty(t.S, 'intro', { get: () => state, set(value) {
        if (value === null) assert.equal(intro.hidden, true, 'hide before clearing state');
        state = value;
    } });
    intro.focus = () => introInput(intro, 'click');
    const done = t.showIntro({ id: 'mai' });
    assert.equal(t.S.intro.closing, true);
    await r.tick(180); await done;
    assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
});
test('99d duplicate intro resolves its old waiter and cancels stale exit callbacks', async () => {
    const r = runtime({ intros: true, reduced: false }); await openIntroEpisode(r, 6, false);
    const t = r.c.__advTest, intro = r.elements.get('adv-character-intro');
    t.discardIntro(); await r.tick(0);
    let resolved = 0;
    const old = t.showIntro({ id: 'mai' }).then(() => { resolved++; });
    t.closeIntro(); const staleExit = t.S.intro.exitTimer.callback;
    const current = t.showIntro({ id: 'takumi' }); await r.tick(0); await old;
    assert.equal(resolved, 1); assert.equal(intro.hidden, false); assert.equal(intro.dataset.actor, 'takumi');
    staleExit(); await r.tick(180);
    assert.equal(intro.hidden, false); assert.equal(t.S.intro.closing, false);
    t.discardIntro(); await current;
    assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
});
test('99d delayed compatibility click cannot dismiss the next character on the same line', async () => {
    const r = runtime({ intros: true, reduced: false }), t = r.c.__advTest;
    r.c.BattleStoryData.register({ id: 'two-intros', scenes: [{ id: 's', lines: [
        { speaker: 'narration', show: [{ id: 'mai', intro: true }, { id: 'takumi', intro: true }], text: '二人が登場する同じ台詞' }
    ] }] });
    await r.c.StoryAdv.start('two-intros'); await r.tick(0);
    const intro = r.elements.get('adv-character-intro'); assert.equal(intro.dataset.actor, 'mai');
    introInput(intro, 'pointerdown'); introInput(intro, 'pointerup', { pointerType: 'touch' });
    await r.tick(500);
    assert.equal(intro.hidden, false); assert.equal(intro.dataset.actor, 'takumi');
    introInput(intro, 'click');
    assert.equal(t.S.intro.closing, false); assert.equal(t.S.backlog.length, 0);
    introInput(intro, 'pointerdown'); introInput(intro, 'click'); introInput(intro, 'click');
    await r.tick(180);
    assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
    assert.equal(t.S.lineIndex, 0); assert.equal(t.S.backlog.length, 1);
});
for (const input of ['click', 'touch']) test(`99d visible intro closes through its own ${input} handler even if active is false`, async () => {
    const r = runtime({ intros: true }); await openIntroEpisode(r, 6, false);
    const t = r.c.__advTest, intro = r.elements.get('adv-character-intro'); t.S.active = false;
    introInput(intro, input === 'touch' ? 'pointerup' : 'click', { pointerType: 'touch' });
    await r.tick(100);
    assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
    assert.equal(t.S.lineIndex, 2); assert.equal(t.S.backlog.length, 0);
});
for (const input of ['click', 'touch', 'advance', 'stop']) test(`99d orphan intro / inactive state recovers through ${input}`, async () => {
    const r = runtime({ intros: true }); await openIntroEpisode(r, 6, false);
    const t = r.c.__advTest, intro = r.elements.get('adv-character-intro'), index = t.S.lineIndex;
    t.discardIntro(); await r.tick(0);
    intro.hidden = false; r.elements.get('story-adv').classList.add('adv-introducing');
    t.S.active = false;
    if (input === 'advance') t.advance();
    else if (input === 'stop') r.c.StoryAdv.stop();
    else introInput(intro, input === 'touch' ? 'pointerup' : 'click', { pointerType: 'touch' });
    assert.equal(intro.hidden, true); assert.equal(t.S.intro, null);
    assert.equal(r.elements.get('story-adv').classList.contains('adv-introducing'), false);
    assert.equal(t.S.lineIndex, index);
});

// Intro cases use real data and the real SHORT constant; legacy dialogue
// regression cases above may omit the new optional presentation data.
for (const mobile of [false, true]) for (const viewer of [false, true]) {
    test(`99c ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: explicit introductions block before the same line, tap/key resume, no log entries`, async () => {
        const r = viewer ? viewerRuntime({ mobile, intros: true, reduced: false }) : runtime({ mobile, intros: true, reduced: false }), { c, elements, tick } = r, t = c.__advTest;
        c.BattleStoryData.register({ id: 'intro-test', scenes: [
            { id: 'first', next: 'second', lines: [{ speaker: 'takumi', text: 'この台詞から', intro: { text: '確認用紹介文' } }, { speaker: 'takumi', text: '二行目' }] },
            { id: 'second', lines: [{ speaker: 'takumi', text: '場面が変わっても一度' }, { speaker: 'mai', text: '次の人物', intro: true }] }
        ] });
        if (viewer) c.StoryViewer.init(c.__legacyTest.EPISODES);
        await c.StoryAdv.start('intro-test'); await tick(0);
        const intro = elements.get('adv-character-intro'), copy = intro.querySelector('.adv-intro-copy');
        assert.equal(intro.hidden, false); assert.equal(intro.dataset.actor,'takumi');
        assert.equal(t.S.busy,true); assert.equal(t.S.lineIndex,0); assert.equal(t.S.backlog.length,0);
        assert.ok(intro.querySelector('.adv-intro-art').src.includes('takumi-standing-alpha.webp?v=20261007-osananajimi105a'));
        assert.equal(copy.querySelector('.adv-intro-name').textContent,'拓海');
        assert.equal(copy.querySelector('.adv-intro-text').textContent,'確認用紹介文');
        assert.equal(copy.querySelector('.adv-intro-title'),null); assert.equal(copy.querySelector('.adv-intro-subtitle'),null);
        assert.equal(intro.querySelector('.adv-intro-notice').textContent,c.CharacterNotice.shortText);
        assert.equal(intro.querySelector('.adv-intro-hint').textContent,'タップで続ける');
        elements.get('story-adv').listeners.click({ target: intro }); await tick(180);
        assert.equal(intro.hidden,true); assert.equal(t.S.lineIndex,0); assert.equal(t.S.backlog.length,1);
        t.advance(); assert.equal(elements.get('adv-text').textContent,'この台詞から');
        t.advance(); await tick(0); assert.equal(t.S.lineIndex,1); assert.equal(intro.hidden,true);
        t.advance(); t.advance(); await tick(0); assert.equal(t.S.sceneId,'second'); assert.equal(intro.hidden,true);
        t.advance(); t.advance(); await tick(0); assert.equal(intro.hidden,false); assert.equal(intro.dataset.actor,'mai');
        assert.equal(intro.querySelector('.adv-intro-copy').children.length,1,'empty fields do not create nodes');
        c.document.listeners.keydown({ key:'Enter', target:intro, preventDefault() {} }); await tick(180);
        assert.equal(intro.hidden,true); assert.equal(t.S.lineIndex,1); assert.equal(t.S.backlog.length,4);
        if (viewer) assert.equal(r.persistentWrites.length,0);
    });
}
for (const mode of ['auto','fast','ctrl','skip','pause','log','stop','reduced']) test(`99c intro respects ${mode}`, async () => {
    const r = runtime({ intros:true, reduced:mode==='reduced' }), { c,tick,elements } = r, t = c.__advTest;
    c.BattleStoryData.register({ id:'intro-controls', scenes:[{id:'s',lines:[{speaker:'kanna',text:'続き',intro:true},{speaker:'mai',text:'飛ばす',intro:true}]}] });
    await c.StoryAdv.start('intro-controls'); await tick(0);
    const intro = elements.get('adv-character-intro'); assert.equal(intro.hidden,false);
    if (mode === 'auto') {
        t.toggleAuto(); await tick(2499); assert.equal(intro.hidden,false); await tick(181); assert.equal(intro.hidden,true);
        assert.equal(t.S.lineIndex,0); assert.equal(t.S.backlog.length,1);
    } else if (mode === 'fast' || mode === 'ctrl') {
        if (mode==='fast') t.toggleFastForward();
        else c.document.listeners.keydown({key:'Control',target:intro,preventDefault(){}});
        await tick(0); assert.equal(intro.hidden,true); assert.equal(t.S.backlog.length,1);
        await tick(300); assert.equal(t.S.entranceSeen.has('intro-controls/s/2/mai'),true);
        assert.equal(intro.hidden,true,'future first appearances are also skipped');
    } else if (mode === 'skip') {
        t.askSkip(); assert.equal(intro.hidden,true); await t.skipToStop(); await tick(0); assert.equal(t.S.intro,null);
    } else if (mode === 'pause' || mode === 'log') {
        t.toggleAuto(); await tick(1000);
        if (mode==='pause') t.pausePlayback(); else t.openLog(true);
        await tick(5000); assert.equal(intro.hidden,false); assert.equal(t.S.backlog.length,0);
        if (mode==='pause') t.resumePlayback(); else t.openLog(false);
        await tick(1680); assert.equal(intro.hidden,true); assert.equal(t.S.backlog.length,1);
    } else if (mode==='stop') {
        c.StoryAdv.stop(); await tick(3000); assert.equal(intro.hidden,true); assert.equal(t.S.active,false); assert.equal(t.S.backlog.length,0);
    } else {
        t.advance(); await tick(99); assert.equal(intro.hidden,false); await tick(1); assert.equal(intro.hidden,true);
        assert.equal(elements.get('adv-text').textContent,'続き');
    }
});
test('99c suppressed/offscreen/classmate introductions, show actors, resume and tutorial phase continuity', async () => {
    const r=runtime({intros:true}), {c,tick,elements}=r,t=c.__advTest;
    const ep=c.__legacyTest.EPISODES[0];
    await c.StoryAdv.playConversation(ep,[{speaker:'takumi',text:'前半',intro:false},{speaker:'classmate1',text:'同級生'},{speaker:'mai',offscreen:true,text:'声だけ'}],{phase:'pre',getActions:()=>[]});
    await tick(0); assert.equal(elements.get('adv-character-intro').hidden,true);
    await c.StoryAdv.playConversation(ep,[{speaker:'takumi',text:'後半'},{speaker:'narration',text:'登場',show:[{id:'mai',intro:true}]}],{phase:'post',getActions:()=>[]});
    await tick(0); assert.equal(elements.get('adv-character-intro').hidden,true,'suppressed first appearance is consumed across phases');
    t.advance(); await tick(0); assert.equal(elements.get('adv-character-intro').dataset.actor,'mai');
    t.advance(); await tick(100); assert.equal(t.S.backlog.at(-1).text,'登場');
    c.BattleStoryData.register({id:'intro-resume',scenes:[{id:'s',lines:[{speaker:'chizuru',text:'一',intro:true},{speaker:'chizuru',text:'二'}]}]});
    await c.StoryAdv.start('intro-resume'); await tick(0); t.advance(); await tick(100); t.advance(); await tick(0);
    c.StoryAdv.stop(); await c.StoryAdv.start('intro-resume',true); await tick(0);
    assert.equal(t.S.lineIndex,1); assert.equal(elements.get('adv-character-intro').hidden,true,'earlier first appearance reconstructed from saved position');
});
function fullViewerRuntime(options = {}) {
    const r = viewerRuntime(options);
    for (const ep of r.c.StoryViewer.all()) ep.portraitStyle = 'full';
    return r;
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

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`99e ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: every line in episodes1–10 uses icons and each character has one static intro, including replay`, async () => {
    const r = viewer ? viewerRuntime({ mobile, intros: true }) : runtime({ mobile, intros: true });
    const { c, elements, tick } = r, t = c.__advTest;
    await c.StoryAdv.start('episode4'); await tick(0); c.StoryAdv.stop();
    const introCounts = Object.fromEntries(Object.keys(c.BattleStoryCharacterIntros).filter(id => !['yuzuki', 'ryuta'].includes(id)).map(id => [id, 0]));
    const all = storyEpisodes().filter(ep => Number.isFinite(ep.number)).sort((a,b) => a.number-b.number);
    for (let replay = 0; replay < 2; replay++) {
        const counts = { ...introCounts };
        for (const source of all) {
            const ep = viewer ? c.StoryViewer.get(source.id) : source.number > 3 ? c.BattleStoryData.get(source.id) : null;
            for (const sceneData of source.scenes) {
                c.StoryAdv.stop();
                if (!viewer && source.number <= 3) {
                    const tutorial = c.__legacyTest.EPISODES[source.number - 1];
                    await c.StoryAdv.playConversation(tutorial, sceneData.lines, {
                        phase: sceneData.id === 'pre' ? 'pre' : 'post', introScene: sceneData.id, getActions: () => []
                    });
                    await tick(0); t.discardIntro(); await tick(0);
                } else {
                    // Inspect every branch, including scenes reached after/between battles.
                    t.S.episode = ep; t.S.sceneId = sceneData.id;
                }
                assert.equal(t.S.episode.portraitStyle, 'icon', source.id);
                t.S.active = true; t.S.actors.clear(); t.S.poses.clear(); t.S.poseSceneId = null;
                t.S.entranceSeen.clear();
                const sceneId = t.S.sceneId;
                for (const [index, item] of sceneData.lines.entries()) {
                    t.S.lineIndex = index; t.stageLine(item, sceneId, index); t.renderActors(item.speaker, false);
                    const where = `${source.id}/${sceneData.id}:${index+1}`;
                    assert.equal(elements.get('adv-portraits').children.length, 0, where + ' no stage portraits');
                    const icon = elements.get('adv-face-icon'), image = elements.get('adv-icon-crop').children[0];
                    const actor = c.BattleStoryAssets.characters[item.speaker] && t.S.actors.has(item.speaker);
                    assert.equal(icon.hidden, !actor, where + ' speaker visibility');
                    if (actor) {
                        const file = c.BattleStoryAssets.iconPath(item.speaker, item.expression);
                        assert.equal(image.src, c.BattleStoryAssets.url(file), where + ' registered icon');
                        if (c.BattleStoryAssets.characters[item.speaker].icons) {
                            assert.match(file, /\/story\/icons\/.*-alpha\.webp$/);
                            const expected = { style: {} }, cell = file.match(/-([a-z]+)-alpha\.webp$/)[1];
                            c.BattleStoryIconMetrics.apply(expected, item.speaker, cell);
                            assert.deepEqual(clone(image.style), clone(expected.style), where + ' existing per-character metrics');
                        } else assert.equal(elements.get('adv-icon-crop').classList.contains('adv-icon-sheet'), false, where + ' classmate crop');
                    }
                    for (const actor of t.S.entrances) {
                        counts[actor.id]++;
                        assert.deepEqual(clone(c.BattleStoryCharacterIntros[actor.id].introAt), {
                            episode: source.number, scene: sceneData.id, line: index+1
                        }, where + ' static location');
                    }
                    assert.ok(t.S.entrances.every(actor => !actor.id.startsWith('classmate')), where);
                    t.stageLine(item, sceneId, index);
                    assert.equal(t.S.entrances.length, 0, where + ' no duplicate on re-render');
                }
            }
        }
        assert.deepEqual(counts, Object.fromEntries(Object.keys(counts).map(id => [id, 1])), 'one per character in each replay');
    }
    if (viewer) assert.equal(r.persistentWrites.length, 0);
    c.StoryAdv.stop();
});

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`99e ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: scheduled intro, later episodes, editable location and line overrides`, async () => {
    const r = viewer ? viewerRuntime({ mobile, intros: true }) : runtime({ mobile, intros: true });
    const { c, tick, elements } = r, t = c.__advTest;
    await openIntroEpisode(r, 1, viewer);
    assert.equal(elements.get('adv-character-intro').dataset.actor, 'mai');
    t.advance(); await tick(100); t.advance(); await tick(0);
    assert.equal(elements.get('adv-character-intro').dataset.actor, 'takumi');
    t.advance(); await tick(100); t.advance(); await tick(0);
    assert.equal(elements.get('adv-character-intro').hidden, true, 'repeat speaker does not introduce again');
    c.StoryAdv.stop(); await c.StoryAdv.start('episode6'); await tick(0);
    assert.equal(elements.get('adv-character-intro').hidden, true, 'later episode does not introduce again even if opened first');
    const data = c.BattleStoryCharacterIntros.mai;
    data.introAt = { episode: 6, scene: t.S.sceneId, line: 4 };
    for (const line of t.S.episode.scenes[0].lines.slice(0,4)) {
        const index = t.S.episode.scenes[0].lines.indexOf(line);
        t.stageLine(line, t.S.sceneId, index);
        if (index === 3) assert.equal(t.S.entrances[0]?.id, 'mai', 'owner may move intro past earlier appearances');
    }
    t.S.entranceSeen.clear();
    t.stageLine({ speaker: 'mai', intro: false }, t.S.sceneId, 3);
    assert.equal(t.S.entrances.length, 0, 'false suppresses scheduled location');
    t.stageLine({ speaker: 'mai', intro: true }, t.S.sceneId, 4);
    assert.equal(t.S.entrances[0]?.id, 'mai', 'true explicitly introduces on another line');
    t.stageLine({ speaker: 'mai', offscreen: true, intro: true }, t.S.sceneId, 5);
    assert.equal(t.S.entrances.length, 0, 'offscreen override does not introduce');
    t.stageLine({ speaker: 'narration', show: [{ id: 'classmate1', intro: true }] }, t.S.sceneId, 6);
    assert.equal(t.S.entrances.length, 0, 'classmates never introduce');
    t.stageLine({ speaker: 'narration', show: [{ id: 'mai', intro: { text: '承認済み本文' } }] }, t.S.sceneId, 7);
    assert.equal(t.S.entrances[0]?.intro.text, '承認済み本文');
    t.stageLine({ speaker: 'narration', text: '次の行' }, t.S.sceneId, 8);
    assert.equal(t.S.entrances.length, 0, 'show override is not inherited by later lines');
    t.stageLine({ speaker: 'narration', intro: true, show: [{ id: 'mai' }, { id: 'takumi', intro: false }] }, t.S.sceneId, 9);
    assert.deepEqual(clone(t.S.entrances.map(actor => actor.id)), ['mai'], 'line override applies to show actors, actor false still suppresses');
    c.StoryAdv.stop();
});

for (const mobile of [false, true]) test(`99a ${mobile ? 'phone' : 'PC'}: all episodes use icons in normal pre/post/tutorial ADV and the viewer`, async () => {
    const r = runtime({ mobile }), { c, elements } = r;
    assert.deepEqual(clone(c.__legacyTest.EPISODES.filter(e => e.portraitStyle === 'icon').map(e => e.id)), ['episode1', 'episode2', 'episode3']);
    assert.equal(c.__legacyTest.EPISODES.some(e => e.portraitStyle === 'bust'), false);
    for (const ep of c.__legacyTest.EPISODES) for (const [phase, lines] of [['pre', ep.pre], ['post', ep.postWin], ['tutorial', ep.pre.slice(0, 1)]]) {
        await c.StoryAdv.playConversation(ep, lines, { phase, getActions: () => [] });
        assert.equal(elements.get('story-adv').dataset.portraitStyle, 'icon', ep.id + '/' + phase);
        assert.equal(elements.get('adv-name').dataset.speaker, lines[0].speaker);
        assert.equal(elements.get('story-adv').hidden, false);
    }
    for (const ep of c.BattleStoryData.all()) {
        assert.equal(ep.portraitStyle, 'icon', ep.id);
        await c.StoryAdv.start(ep.id);
        assert.equal(elements.get('story-adv').dataset.portraitStyle, 'icon', ep.id);
    }
    const v = viewerRuntime({ mobile });
    for (const ep of v.c.StoryViewer.all()) {
        assert.equal(ep.portraitStyle, 'icon');
        await v.c.StoryAdv.start(ep.id);
        assert.equal(v.elements.get('story-adv').dataset.portraitStyle, 'icon');
        if (ep.id === 'episode1') {
            v.c.__advTest.enterScene('win', 'post');
            assert.equal(v.elements.get('story-adv').dataset.portraitStyle, 'icon');
        }
    }
    assert.equal(v.persistentWrites.length, 0);
});

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`99a ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: ep1 icons show only the speaker, swap expressions instantly and ignore poses and preserve effects`, async () => {
    const r = viewer ? viewerRuntime({ mobile, reduced: false }) : runtime({ mobile, reduced: false });
    const { c, elements, tick } = r, t = c.__advTest;
    if (viewer) await c.StoryAdv.start('episode1');
    else await c.StoryAdv.playConversation(c.__legacyTest.EPISODES[0], c.__legacyTest.EPISODES[0].pre, { phase: 'pre', getActions: () => [] });
    const icon = elements.get('adv-face-icon'), crop = elements.get('adv-icon-crop'), stage = elements.get('adv-portraits');
    assert.equal(icon.parent, elements.get('adv-dialogue')); assert.equal(crop.parent, icon);
    assert.equal(stage.children.length, 0, 'standing entrance is replaced by the separate intro overlay');
    assert.equal(icon.dataset.actor, 'mai'); assert.equal(icon.dataset.pose, 'default');
    const show = item => { t.stageLine(item); t.renderActors(item.speaker); assert.ok(stage.children.every(node => node.classList.contains('adv-entrance'))); };
    show({ speaker: 'takumi', expression: 'smile' });
    assert.equal(icon.dataset.actor, 'takumi'); assert.ok(crop.classList.contains('adv-icon-entering'));
    await tick(99); assert.ok(crop.classList.contains('adv-icon-entering'));
    await tick(1); assert.equal(crop.classList.contains('adv-icon-entering'), false);
    show({ speaker: 'takumi', expression: 'exasperated' });
    assert.equal(crop.classList.contains('adv-icon-entering'), false);
    assert.equal(crop.children.length, 1); assert.ok(crop.children[0].src.includes('takumi-troubled-alpha.webp'));
    show({ speaker: 'mai', expression: 'smile' }); assert.equal(icon.dataset.pose, 'default');
    // Even a simultaneous pose/expression change cancels an unfinished speaker fade.
    show({ speaker: 'mai', expression: 'cold', pose: 'default' });
    assert.equal(icon.dataset.pose, 'default'); assert.equal(crop.classList.contains('adv-icon-entering'), false);
    for (const item of [{ speaker: 'narration', show: [{ id: 'mai' }, { id: 'takumi' }] }, { speaker: 'announce' },
        { speaker: 'mai', offscreen: true }, { speaker: 'mai', monologue: true }]) {
        show(item); assert.equal(icon.hidden, true); assert.equal(elements.get('story-adv').dataset.iconSpeaker, 'none');
        assert.equal(crop.children.length, 0);
    }
    t.S.lineIndex = 4; await t.renderCurrent();
    assert.ok(icon.classList.contains('adv-motion-tremble'));
    assert.equal(icon.querySelector('.adv-emotion-mark').dataset.mark, 'sweat');
    await tick(850); assert.equal(icon.querySelector('.adv-emotion-mark'), null);
    t.S.episode.scenes[0].lines[0] = { speaker: 'mai', expression: 'smug', pose: 'behind', text: '！', motion: 'shake', mark: '!', screen: 'screenShake' };
    t.S.lineIndex = 0; await t.renderCurrent();
    assert.ok(icon.classList.contains('adv-motion-shake')); assert.equal(icon.querySelector('.adv-emotion-mark').textContent, '!');
    assert.ok(elements.get('story-adv').classList.contains('adv-screen-shake'));
    if (viewer) assert.equal(r.persistentWrites.length, 0);
});

for (const mode of ['reduced', 'fast', 'ctrl', 'reduce-during-entry', 'fast-during-entry', 'pause', 'log', 'skip', 'stop']) test(`99a icon speaker fade respects ${mode}`, async () => {
    const r = runtime({ reduced: mode === 'reduced' }), { c, tick, elements } = r, t = c.__advTest;
    await c.StoryAdv.playConversation(c.__legacyTest.EPISODES[0], c.__legacyTest.EPISODES[0].pre, { phase: 'pre', getActions: () => [] });
    if (mode === 'fast') t.toggleFastForward();
    if (mode === 'ctrl') t.S.ctrlHeld = true;
    t.stageLine({ speaker: 'takumi', expression: 'smile' }); t.renderActors('takumi');
    const crop = elements.get('adv-icon-crop');
    if (['reduced', 'fast', 'ctrl'].includes(mode)) { assert.equal(crop.classList.contains('adv-icon-entering'), false); return; }
    assert.ok(crop.classList.contains('adv-icon-entering'));
    if (mode === 'reduce-during-entry') r.setReduced(true);
    if (mode === 'fast-during-entry') t.toggleFastForward();
    if (mode === 'pause' || mode === 'log') {
        await tick(30);
        if (mode === 'pause') t.pausePlayback(); else t.openLog(true);
        await tick(2000); assert.ok(crop.classList.contains('adv-icon-entering'));
        if (mode === 'pause') t.resumePlayback(); else t.openLog(false);
        await tick(69); assert.ok(crop.classList.contains('adv-icon-entering')); await tick(1);
    }
    if (mode === 'skip') { t.askSkip(); await t.skipToStop(); }
    if (mode === 'stop') c.StoryAdv.stop();
    assert.equal(crop.classList.contains('adv-icon-entering'), false);
    assert.equal(elements.get('adv-portraits').children.length, 0);
});

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`98b ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: bust speaker swaps sides, retains the listener pose, dims narration and swaps expressions immediately`, async () => {
    const r = viewer ? viewerRuntime({ mobile, reduced: false }) : runtime({ mobile, reduced: false });
    const { c, elements, tick } = r, t = c.__advTest;
    // Bust remains supported, but no shipped episode selects it now.
    c.__legacyTest.EPISODES[0].portraitStyle = 'bust';
    if (viewer) c.StoryViewer.get('episode1').portraitStyle = 'bust';
    if (viewer) await c.StoryAdv.start('episode1');
    else await c.StoryAdv.playConversation(c.__legacyTest.EPISODES[0], c.__legacyTest.EPISODES[0].pre, { phase: 'pre', getActions: () => [] });
    const portrait = id => elements.get('adv-portraits').children.find(p => p.dataset.actor === id && !p.classList.contains('leaving'));
    const show = item => { t.stageLine(item); t.renderActors(item.speaker); };
    await tick(150);
    assert.equal(portrait('mai').dataset.pose, 'behind');
    assert.ok(portrait('takumi').classList.contains('dimmed'), 'scene partner is visible from the first line');
    assert.equal(elements.get('story-adv').dataset.bustSpeaker, 'mai');
    show({ speaker: 'takumi', expression: 'smile' });
    assert.equal(t.S.actors.size, 2);
    assert.equal(portrait('takumi').dataset.bustSide, 'left'); assert.ok(portrait('takumi').classList.contains('speaking'));
    assert.equal(portrait('mai').dataset.bustSide, 'right'); assert.ok(portrait('mai').classList.contains('dimmed'));
    assert.equal(elements.get('story-adv').dataset.bustSpeaker, 'takumi');
    assert.ok(portrait('mai').classList.contains('entering'), 'former speaker also has a short listener fade');
    assert.equal(portrait('mai').dataset.pose, 'behind');
    assert.ok(portrait('takumi').classList.contains('entering'));
    await tick(149); assert.ok(portrait('takumi').classList.contains('entering'));
    await tick(1); assert.equal(portrait('takumi').classList.contains('entering'), false);
    show({ speaker: 'takumi', expression: 'exasperated' });
    assert.equal(portrait('takumi').classList.contains('entering'), false);
    assert.equal(portrait('takumi').children.length, 1);
    assert.ok(portrait('takumi').children[0].src.includes('takumi-exasperated.webp'));
    show({ speaker: 'mai', expression: 'smile' });
    assert.equal(portrait('mai').dataset.bustSide, 'left'); assert.ok(portrait('mai').classList.contains('entering'));
    assert.equal(portrait('takumi').dataset.bustSide, 'right'); assert.ok(portrait('takumi').classList.contains('dimmed'));
    show({ speaker: 'narration' });
    assert.equal(elements.get('story-adv').dataset.bustSpeaker, 'none');
    for (const id of ['mai', 'takumi']) { assert.equal(portrait(id).classList.contains('speaking'), false); assert.ok(portrait(id).classList.contains('dimmed')); }
    show({ speaker: 'mai', pose: 'default', expression: 'cold' }); await tick(150);
    assert.equal(portrait('mai').dataset.pose, 'default');
    show({ speaker: 'narration', hide: ['takumi'] }); await tick(200);
    assert.equal(t.S.actors.has('takumi'), false);
    if (viewer) assert.equal(r.persistentWrites.length, 0);
});

for (const mode of ['reduced', 'fast', 'ctrl', 'reduce-during-entry', 'fast-during-entry', 'pause', 'log', 'skip', 'stop']) test(`98b bust speaker entry respects ${mode}`, async () => {
    const r = runtime({ reduced: mode === 'reduced' }), { c, tick, elements } = r, t = c.__advTest;
    c.__legacyTest.EPISODES[0].portraitStyle = 'bust';
    await c.StoryAdv.playConversation(c.__legacyTest.EPISODES[0], c.__legacyTest.EPISODES[0].pre, { phase: 'pre', getActions: () => [] });
    await tick(150);
    if (mode === 'fast') t.toggleFastForward();
    if (mode === 'ctrl') t.S.ctrlHeld = true;
    t.stageLine({ speaker: 'takumi', expression: 'smile' }); t.renderActors('takumi');
    const p = elements.get('adv-portraits').children.find(p => p.dataset.actor === 'takumi');
    if (['reduced', 'fast', 'ctrl'].includes(mode)) { assert.equal(p.classList.contains('entering'), false); return; }
    assert.ok(p.classList.contains('entering'));
    if (mode === 'reduce-during-entry') r.setReduced(true);
    if (mode === 'fast-during-entry') t.toggleFastForward();
    if (mode === 'pause' || mode === 'log') {
        await tick(50);
        if (mode === 'pause') t.pausePlayback(); else t.openLog(true);
        await tick(2000); assert.ok(p.classList.contains('entering'));
        if (mode === 'pause') t.resumePlayback(); else t.openLog(false);
        await tick(99); assert.ok(p.classList.contains('entering')); await tick(1);
    }
    if (mode === 'skip') { t.askSkip(); await t.skipToStop(); }
    if (mode === 'stop') c.StoryAdv.stop();
    assert.equal(p.classList.contains('entering'), false);
    if (mode === 'skip') assert.ok(elements.get('adv-portraits').children.every(p => !p.classList.contains('entering')));
});

test('98b episode1 keeps tremble/sweat and emphasis beats on the bust', async () => {
    const r = runtime({ reduced: false }), { c, elements, tick } = r;
    c.__legacyTest.EPISODES[0].portraitStyle = 'bust';
    await c.StoryAdv.playConversation(c.__legacyTest.EPISODES[0], c.__legacyTest.EPISODES[0].pre, { phase: 'pre', getActions: () => [] });
    c.__advTest.S.lineIndex = 4; await c.__advTest.renderCurrent();
    const portrait = elements.get('adv-portraits').children.find(p => p.dataset.actor === 'takumi');
    assert.equal(elements.get('story-adv').dataset.portraitStyle, 'bust');
    assert.ok(portrait.classList.contains('adv-motion-tremble'));
    assert.equal(portrait.querySelector('.adv-emotion-mark').dataset.mark, 'sweat');
    await tick(850); assert.equal(portrait.querySelector('.adv-emotion-mark'), null);
    c.StoryAdv.stop();
    const lines = [{ ...c.__legacyTest.EPISODES[0].pre[0], motion: 'zoom', mark: '!', screen: 'speedLines' }];
    await c.StoryAdv.playConversation(c.__legacyTest.EPISODES[0], lines, { phase: 'pre', getActions: () => [] });
    const emphasis = elements.get('adv-portraits').children.find(p => p.dataset.actor === 'mai');
    assert.ok(emphasis.classList.contains('adv-motion-zoom'));
    assert.equal(emphasis.querySelector('.adv-emotion-mark').textContent, '!');
    assert.ok(elements.get('adv-line-effects').classList.contains('adv-screen-speedLines'));
});

test('90b/92b registry exposes immutable default and exactly the 75 delivered extra portraits', () => {
    const { c } = runtime(), a = c.BattleStoryAssets;
    let extra = 0;
    for (const [id, character] of Object.entries(a.characters)) {
        assert.equal(character.poses.default, character.portraits);
        assert.ok(Object.isFrozen(character.poses));
        assert.equal(Object.getPrototypeOf(character.poses), null);
        for (const [pose, expressions] of Object.entries(character.poses)) {
            assert.ok(Object.isFrozen(expressions));
            assert.deepEqual(Object.keys(expressions), Object.keys(character.portraits));
            if (pose !== 'default') extra += Object.keys(expressions).length;
            for (const [expression, file] of Object.entries(expressions)) {
                assert.equal(a.portraitPath(id, expression, pose), file);
                assert.ok(fs.existsSync(path.join(root, file)), file);
                assert.ok(a.paths().includes(file));
            }
        }
    }
    assert.equal(extra, 75);
    assert.deepEqual(clone(a.portraitCandidates('chizuru', 'happy', 'cheer')), [
        a.characters.chizuru.poses.cheer.happy, a.characters.chizuru.portraits.happy,
        a.characters.chizuru.portraits.normal, a.characters.chizuru.standing]);
    assert.equal(a.portraitPath('chizuru', 'missing-expression', 'cheer'), a.characters.chizuru.portraits.normal);
    assert.equal(a.portraitPath('unknown', 'normal', 'cheer'), null);
});

test('90b validates unknown poses once per character/key on lines and show, while absence stays optional', () => {
    const { c, warnings } = runtime(), a = c.BattleStoryAssets;
    const ep = { id: 'pose-validation', scenes: [{id:'s', lines:[
        {speaker:'chizuru', pose:'invalid', text:'A', show:[{id:'kanna',pose:'invalid'}]},
        {speaker:'chizuru', pose:'invalid', text:'B'},
        {speaker:'chizuru',text:'C',show:[{id:'kanna',pose:'invalid'}]}
    ]}] };
    const lines = c.BattleStoryData.validate(ep).scenes[0].lines;
    c.BattleStoryData.validate(ep); a.portraitCandidates('chizuru','normal','invalid');
    assert.equal(lines[0].pose, 'default'); assert.equal(lines[0].show[0].pose, 'default');
    assert.equal(Object.hasOwn(lines[2], 'pose'), false);
    assert.equal(warnings.filter(w=>w.includes('unknown pose:')).length, 2);
    assert.equal(a.resolvePose('chizuru','toString'),'default');
    assert.equal(a.resolvePose('mai','pocket'),'default');
});

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`90b ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: poses survive expression/hide/offscreen/announce and reset per scene`, async () => {
    const r = runtime({mobile,viewer}), {c}=r, t=c.__advTest;
    c.BattleStoryData.register({id:'pose-persistence',scenes:[
        {id:'s',lines:[{speaker:'chizuru',pose:'behind',expression:'smile',text:'A'}]},
        {id:'next',lines:[{speaker:'chizuru',expression:'normal',text:'B'}]},
        {id:'explicit',lines:[{speaker:'chizuru',pose:'cheer',expression:'happy',text:'C'}]}
    ]});
    if(viewer)c.StoryViewer={active:true,get:id=>c.BattleStoryData.get(id)};
    await c.StoryAdv.start('pose-persistence');
    t.stageLine({speaker:'chizuru',expression:'embarrassed'});
    assert.equal(t.S.actors.get('chizuru').pose,'behind');
    t.stageLine({speaker:'narration',hide:'all'});
    t.stageLine({speaker:'mai'}); t.stageLine({speaker:'chizuru'});
    assert.equal(t.S.actors.get('chizuru').pose,'behind');
    t.stageLine({speaker:'announce'}); t.stageLine({speaker:'chizuru',offscreen:true});
    t.stageLine({speaker:'chizuru'}); assert.equal(t.S.actors.get('chizuru').pose,'behind');
    t.stageLine({speaker:'chizuru',monologue:true,pose:'cheer'});
    t.stageLine({speaker:'chizuru'}); assert.equal(t.S.actors.get('chizuru').pose,'cheer');
    t.stageLine({speaker:'narration',show:[{id:'kanna',position:'farLeft',expression:'smug',pose:'pocket'}]});
    t.stageLine({speaker:'narration',show:[{id:'kanna',onlyIfShown:true,expression:'gentle'}]});
    assert.equal(t.S.actors.get('kanna').position,'farLeft'); assert.equal(t.S.actors.get('kanna').pose,'pocket');
    t.stageLine({speaker:'narration',hide:['kanna'],show:[{id:'kanna',onlyIfShown:true,pose:'default'}]});
    t.stageLine({speaker:'kanna'}); assert.equal(t.S.actors.get('kanna').pose,'pocket');
    t.enterScene('next','pre'); assert.equal(t.S.actors.get('chizuru').pose,'default');
    t.enterScene('explicit','pre'); assert.equal(t.S.actors.get('chizuru').pose,'cheer');
    if(viewer)assert.equal(r.persistentWrites.length,0);
});

test('90b preload includes inherited pose expressions and scene resets plus default fallbacks', () => {
    const {c}=runtime(), a=c.BattleStoryAssets;
    const ep=c.BattleStoryData.validate({id:'pose-preload',portraitStyle:'full',scenes:[{id:'s',lines:[
        {speaker:'chizuru',pose:'behind',expression:'smile',text:'A'},
        {speaker:'kanna',pose:'pocket',expression:'smug',text:'B'},
        {speaker:'chizuru',expression:'embarrassed',text:'C'},
        {speaker:'narration',show:[{id:'kanna',expression:'gentle'}],text:'D'}
    ]},{id:'reset',lines:[{speaker:'chizuru',expression:'normal',text:'E'}]}]});
    const actual=c.__advTest.episodeImages(ep);
    const expected=[...a.portraitCandidates('chizuru','smile','behind'),...a.portraitCandidates('kanna','smug','pocket'),
        ...a.portraitCandidates('chizuru','embarrassed','behind'),...a.portraitCandidates('kanna','gentle','pocket'),
        ...a.portraitCandidates('chizuru','normal')];
    assert.deepEqual(clone(actual).sort(),[...new Set(expected)].sort());
});

test('90b preload does not let absent onlyIfShown or conflicting speaker/show overwrite a persistent pose',()=>{
    const {c}=runtime(), a=c.BattleStoryAssets;
    const ep=c.BattleStoryData.validate({id:'pose-preload-conditional',portraitStyle:'full',scenes:[{id:'s',lines:[
        {speaker:'kanna',pose:'pocket',expression:'smile',text:'A'},
        {speaker:'mai',text:'B'},
        {speaker:'narration',text:'',show:[{id:'kanna',onlyIfShown:true,pose:'default',expression:'normal'}]},
        {speaker:'kanna',expression:'gentle',text:'C'},
        {speaker:'chizuru',pose:'cheer',expression:'happy',text:'D',show:[{id:'chizuru',pose:'behind',expression:'smile'}]},
        {speaker:'chizuru',expression:'laugh',text:'E'}
    ]}]});
    const images=c.__advTest.episodeImages(ep);
    assert.ok(images.includes(a.characters.kanna.poses.pocket.gentle));
    assert.ok(images.includes(a.characters.chizuru.poses.cheer.happy));
    assert.ok(images.includes(a.characters.chizuru.poses.cheer.laugh));
    assert.equal(images.includes(a.characters.chizuru.poses.behind.laugh),false);
});

for(const mobile of [false,true])test(`90b/92b ${mobile?'phone':'PC'} normal/viewer shared DOM applies fixed metrics for all 75 pose expressions`,async()=>{
    const r=await poseFadeRuntime({mobile,reduced:true}), a=r.c.BattleStoryAssets;
    for(const [id,pose] of [['chizuru','behind'],['chizuru','cheer'],['kanna','pocket']]){
        let baseline;
        for(const [expression,file]of Object.entries(a.characters[id].poses[pose])){
            r.c.__advTest.stageLine({speaker:id,position:'center',pose,expression});r.c.__advTest.renderActors(id);
            const p=r.elements.get('adv-portraits').children.find(p=>p.dataset.actor===id&&!p.classList.contains('leaving'));
            assert.equal(p.children[0].src,a.url(file));assert.equal(p.dataset.pose,pose);
            const style=Object.fromEntries(Object.entries(p.style).filter(([,v])=>typeof v==='string'));
            if(!baseline)baseline=style;assert.deepEqual(style,baseline);
            assert.equal(Number(style['--adv-canvas-scale']),a.portraitMetrics(id,pose).canvas.height/a.portraitMetrics(id,pose).head.height);
        }
    }
});

test('90b resume reconstructs poses from the current scene and explicit defaults without serializing a second state', async () => {
    const r=runtime(); r.c.BattleStoryData.register({id:'pose-resume',scenes:[
        {id:'s',lines:[{speaker:'chizuru',pose:'behind',text:'A'},{speaker:'mai',text:'B'},{speaker:'chizuru',text:'C'}]},
        {id:'next',lines:[{speaker:'chizuru',text:'D'},{speaker:'chizuru',pose:'cheer',text:'E'},{speaker:'chizuru',text:'F'}]}
    ]});
    await r.c.StoryAdv.start('pose-resume'); r.c.__advTest.advance(); r.c.__advTest.advance();
    const save=Object.fromEntries(r.store), reload=runtime({save});
    reload.c.BattleStoryData.register(r.c.BattleStoryData.get('pose-resume'));
    await reload.c.StoryAdv.start('pose-resume',true);
    assert.equal(reload.c.__advTest.S.actors.get('chizuru').pose,'behind');
    reload.c.__advTest.enterScene('next','pre'); assert.equal(reload.c.__advTest.S.actors.get('chizuru').pose,'default');
    reload.c.__advTest.advance(); reload.c.__advTest.advance();
    const final=runtime({save:Object.fromEntries(reload.store)}); final.c.BattleStoryData.register(r.c.BattleStoryData.get('pose-resume'));
    await final.c.StoryAdv.start('pose-resume',true); assert.equal(final.c.__advTest.S.actors.get('chizuru').pose,'cheer');
    assert.equal(Object.hasOwn(JSON.parse(final.store.get(ADV_KEY)).resume,'poses'),false);
});

async function poseFadeRuntime(options = {}) {
    const character = options.character || 'chizuru';
    const r=runtime({reduced:false,...options});
    r.c.BattleStoryData.register({id:'pose-fade',portraitStyle:'full',scenes:[{id:'s',lines:[{speaker:character,expression:'normal',text:'A'}]}]});
    await r.c.StoryAdv.start('pose-fade');
    r.change=(pose,expression='happy')=>{r.c.__advTest.stageLine({speaker:character,position:'center',pose,expression});r.c.__advTest.renderActors(character);};
    r.portrait=()=>r.elements.get('adv-portraits').children.find(p=>p.dataset.actor===character&&!p.classList.contains('leaving'));
    return r;
}

for (const character of ['chizuru', 'mai']) test(`90b/92b ${character}: cross-fades exactly 150 ms only for a changed displayed pose; expression changes are instant`, async () => {
    const r=await poseFadeRuntime({character}), old=r.portrait().children[0];
    r.change('cheer'); const p=r.portrait();
    assert.equal(p.children.length,2); assert.equal(p.children[1],old);
    assert.ok(p.children[0].classList.contains('adv-pose-in')); assert.ok(old.classList.contains('adv-pose-out'));
    await r.tick(149); assert.equal(p.children.length,2);
    await r.tick(1); assert.equal(p.children.length,1); assert.equal(p.children[0].classList.contains('adv-pose-in'),false);
    r.change(undefined,'smile'); assert.equal(p.children.length,1); assert.equal(p.dataset.pose,'cheer');
    assert.ok(p.children[0].src.includes(character+'-cheer-smile.webp'));
    r.change('behind','embarrassed'); assert.equal(p.children.length,2);
    r.change(undefined,'smile'); assert.equal(p.children.length,1,'a new expression settles an in-progress fade');
});

for(const mode of ['reduced','fast','ctrl','reduce-during-fade','fast-during-fade','pause','stop']) test(`90b pose fade respects ${mode}`,async()=>{
    const r=await poseFadeRuntime({reduced:mode==='reduced'}), t=r.c.__advTest;
    if(mode==='fast')t.toggleFastForward(); if(mode==='ctrl')t.S.ctrlHeld=true;
    r.change('cheer'); const p=r.portrait();
    if(['reduced','fast','ctrl'].includes(mode)){assert.equal(p.children.length,1);return;}
    assert.equal(p.children.length,2);
    if(mode==='reduce-during-fade')r.setReduced(true);
    if(mode==='fast-during-fade')t.toggleFastForward();
    if(mode==='stop')r.c.StoryAdv.stop();
    if(mode==='pause'){
        t.pausePlayback(); await r.tick(1000); assert.equal(p.children.length,2);
        t.resumePlayback(); await r.tick(150);
    }
    assert.equal(p.children.length,1); assert.equal(p.children[0].classList.contains('adv-pose-in'),false);
});

test('90b missing pose image falls through default expression/normal/standing without a false pose fade',async()=>{
    const r=await poseFadeRuntime({imageBehavior:{load(img){
        if(img.src.includes('-cheer-'))img.onerror?.();else{img.complete=true;img.naturalWidth=1;img.onload?.();}
    }}});
    r.change('cheer'); const p=r.portrait(), a=r.c.BattleStoryAssets;
    assert.equal(p.dataset.pose,'default'); assert.equal(p.children.length,1);
    assert.equal(p.children[0].src,a.url(a.characters.chizuru.portraits.happy));
    p.children[0].onerror(); assert.equal(p.children[0].src,a.url(a.characters.chizuru.portraits.normal));
    p.children[0].onerror(); assert.equal(p.children[0].src,a.url(a.characters.chizuru.standing));
    p.children[0].onerror(); assert.equal(p.children.length,0);
});

test('90b late images retain the old decoded portrait and stale completions cannot replace the current expression',async()=>{
    const r=await poseFadeRuntime({imageBehavior:{load(img){
        if(!img.src.includes('-cheer-')){img.complete=true;img.naturalWidth=1;img.onload?.();}
    }}}), old=r.portrait().children[0];
    r.change('cheer','happy'); assert.equal(r.portrait().children[0],old);
    r.change(undefined,'smile'); assert.equal(r.portrait().children[0],old);
    const images=r.preloaded.filter(img=>img.src.includes('-cheer-'));
    images[0].onload(); await r.tick(0); assert.equal(r.portrait().children[0],old);
    images[1].onload(); await r.tick(0);
    assert.ok(r.portrait().children[0].src.includes('cheer-smile.webp')); assert.equal(r.portrait().children.length,2);
    await r.tick(150); assert.equal(r.portrait().children.length,1);
});

test('90b/92b historical assignments retain their exact images and records; scene3 is superseded by summer100b',async t=>{
    const {c}=runtime(), a=c.BattleStoryAssets;
    const episodes=[...c.__legacyTest.EPISODES.map((e,i)=>({number:i+1,scenes:['pre','postWin','postLose'].map(id=>({id,lines:e[id]||[]}))})),...c.BattleStoryData.all().map(historicalEpisode)];
    let assigned=0, covered=0, restores=0; const rows=[];
    for(const e of episodes)for(const s of e.scenes){
        const poses=new Map();
        s.lines.forEach((line,i)=>{
            if(line.pose!==undefined){
                poses.set(line.speaker,line.pose);assigned++; if(line.pose==='default')restores++;
                rows.push(`| 第${e.number}話 | ${s.id}:${i+1} | ${a.characters[line.speaker].name} | ${line.pose} | ${line.expression} | ${line.text} |`);
            }
            if(!a.characters[line.speaker]||!line.text)return;
            const pose=poses.get(line.speaker)||'default'; if(pose!=='default')covered++;
            assert.ok(fs.existsSync(path.join(root,a.characters[line.speaker].poses[pose][line.expression])),`${e.number}/${s.id}:${i+1} ${pose}/${line.expression}`);
        });
    }
    assert.equal(assigned,125);assert.equal(restores,27);assert.equal(covered,313);
    await t.test('owner assignment table comparison',t=>{
        if(!optionalSource(t,root,['docs/story/poses-assignments-90b.md']))return;
        const doc=read('docs/story/poses-assignments-90b.md');for(const row of rows)assert.ok(doc.includes(row),row);
        assert.equal(doc.split(/\r?\n/).filter(l=>/^\| 第\d+話 \| [a-zA-Z0-9]+:\d+ \|/.test(l)).length,assigned);
    });
});

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

test('tutorial dialogue, expressions, backgrounds and summaries match every approved line in order', async t => {
    const { c } = runtime();
    const nameIds = { 舞依: 'mai', 拓海: 'takumi', 千鶴: 'chizuru', 暁: 'akatsuki', 剛: 'tsuyoshi', 栞那: 'kanna' };
    const stages = { 開始前: 'pre', 勝利後: 'postWin', 敗北後: 'postLose' };
    let count = 0;
    for (const episode of c.__legacyTest.EPISODES) {
        const number = Number(episode.id.slice(-1));
        assert.equal(episode.arc, 'reunion');
        assert.equal(episode.protagonist, number === 3 ? 'chizuru' : 'takumi');
        assert.ok(c.BattleStoryAssets.backgrounds[episode.background]);
        for (const stage of Object.values(stages)) for (const line of episode[stage] || []) {
            count++;
            assert.doesNotMatch(line.text, /。$/);
            if (line.speaker !== 'narration') assert.ok(c.BattleStoryAssets.characters[line.speaker].portraits[line.expression]);
        }
        await t.test(episode.id + ': approved tutorial source comparison', t => {
        if (!optionalSource(t, root, ['docs/story/tutorial-rewrite.md', REVIEW_FILE])) return;
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
                assert.doesNotMatch(line.text, /。$/);
                if (line.speaker === 'narration') continue;
                assert.ok(c.BattleStoryAssets.characters[line.speaker].portraits[line.expression]);
            }
        }
        });
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
                const portrait = elements.get('adv-icon-crop');
                assert.equal(portrait.children[0].src, c.BattleStoryAssets.url(c.BattleStoryAssets.iconPath(line.speaker, line.expression)));
                assert.ok(portrait.classList.contains('adv-icon-sheet'));
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
        assert.ok(requests.every(file => c.BattleStoryAssets.paths().map(c.BattleStoryAssets.url).includes(file)));
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
    const { c, preloaded, requests } = fullRuntime();
    c.BattleStoryData.register({ id: 'asset-scope', portraitStyle: 'full', scenes: [{ id: 'first', background: 'classroom', lines: [
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
    assert.deepEqual(preloaded.map(img => img.src).sort(), expected.map(a.url).sort());
    assert.ok(requests.every(file => a.paths().map(a.url).includes(file)));
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
        const { c, elements, preloaded } = fullRuntime({ imageBehavior: { load() {} } });
        const ep = clone(c.BattleStoryData.get('episode4'));
        ep.id = 'failed-art'; ep.scenes[0].lines[0].expression = 'smile'; c.BattleStoryData.register(ep);
        const candidates = c.BattleStoryAssets.portraitCandidates('chizuru', 'smile');
        const failed = candidates.slice(0, failureCount).map(c.BattleStoryAssets.url);
        failed.push(c.BattleStoryAssets.backgrounds['festival-classroom']);
        const started = c.StoryAdv.start(ep.id);
        preloaded.forEach(img => failed.includes(img.src) ? img.onerror() : img.onload()); await started;
        const portraits = elements.get('adv-portraits').children[0].children;
        assert.equal(elements.get('adv-background').style.backgroundImage, '');
        if (failureCount < 3) assert.equal(portraits[0].src, c.BattleStoryAssets.url(candidates[failureCount]));
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
    const { c, tick, elements, preloaded } = fullRuntime({ imageBehavior: { load() {} } });
    const started = c.StoryAdv.start('episode4');
    await tick(5999);
    assert.equal(elements.get('adv-loading').hidden, false);
    assert.equal(elements.get('adv-dialogue').hidden, true);
    assert.equal(elements.get('adv-text').textContent, '');
    await tick(1); await started;
    assert.equal(elements.get('adv-dialogue').hidden, false);
    assert.equal(elements.get('adv-text').textContent, 'カレーよし。おにぎりもよし');
    assert.equal(elements.get('adv-background').style.backgroundImage, '');
    assert.equal(elements.get('adv-portraits').children[0].children[0].src, c.BattleStoryAssets.url(c.BattleStoryAssets.characters.chizuru.portraits.normal));
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
        if (!optionalSource(t, root, ['docs/story/episode4-scenario.md', REVIEW_FILE])) return;
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
        if (!optionalSource(t, root, ['docs/story/episode4-scenario.md'])) return;
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
    vm.runInNewContext(read('tests/story-adv.test.cjs'), { __dirname, URL, URLSearchParams, require(name) {
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
    assert.ok(skipped.every(item => item.reason.includes('comparison is skipped')));
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
    const { c, elements, requests } = fullRuntime();
    const ep = clone(c.BattleStoryData.get('episode4')); ep.id = 'fallback'; ep.scenes[0].lines[0].expression = 'smile';
    c.BattleStoryData.register(ep); await c.StoryAdv.start('fallback');
    const image = elements.get('adv-portraits').children[0].children[0];
    assert.equal(image.src, c.BattleStoryAssets.url(c.BattleStoryAssets.characters.chizuru.portraits.smile));
    image.onerror(); assert.equal(image.src, c.BattleStoryAssets.url(c.BattleStoryAssets.characters.chizuru.portraits.normal));
    image.onerror(); assert.equal(image.src, c.BattleStoryAssets.characters.chizuru.standing);
    image.onerror(); assert.equal(elements.get('adv-portraits').children[0].children.length, 0);
    assert.ok(requests.every(file => c.BattleStoryAssets.paths().map(c.BattleStoryAssets.url).includes(file)));
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
    assert.ok(requests.every(file => c.BattleStoryAssets.paths().map(c.BattleStoryAssets.url).includes(file)));
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
    const { c, elements } = fullRuntime(); await c.StoryAdv.start('episode4');
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
            renderCoinStageProfile() {}, updateResumeMatchButtonVisibility() {} });
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
    const { c, elements } = fullRuntime(); await c.StoryAdv.start('episode4');
    c.__advTest.stageLine({ speaker: 'chizuru', position: 'right', show: [{ id: 'kanna', position: 'left' }] });
    c.__advTest.renderActors('chizuru');
    for (const actor of elements.get('adv-portraits').children) {
        const { canvas, head, headTopOffset } = c.BattleStoryAssets.characters[actor.dataset.actor].portraitMetrics;
        assert.equal(Number(actor.style['--adv-canvas-scale']), canvas.height / head.height);
        assert.equal(Number(actor.style['--adv-head-from-top']), head.top / head.height);
        assert.equal(Number(actor.style['--adv-head-top-offset']), headTopOffset);
    }
    const css = read('story-adv.css');
    assert.match(css, /\.adv-portraits \{ position: absolute; inset: 0; z-index: 1/);
    for (const [cls, z] of [['toolbar', 6], ['dialogue', 3]]) assert.match(css, new RegExp('\\.adv-' + cls + ' \\{[^}]*z-index: ' + z));
    assert.match(css, /100dvh - var\(--adv-toolbar-height/);
    assert.doesNotMatch(css, /\.adv-portrait[^}]*max-height/);
    assert.doesNotMatch(css, /adv-focus-y|adv-portrait-scale/);
    // All eight measured heads, positions and viewport budgets are checked in
    // story-portraits.test.cjs using the actual CSS expressions.
});

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: every expression renders with its character's base head/eye metrics`, async () => {
    const { c, elements } = viewer ? fullViewerRuntime({ mobile }) : fullRuntime({ mobile }); await c.StoryAdv.start('episode4');
    const container = elements.get('adv-portraits');
    for (const [id, character] of Object.entries(c.BattleStoryAssets.characters)) {
        c.__advTest.S.actors.clear(); container.replaceChildren(); let baseStyle;
        for (const expression of Object.keys(character.portraits)) {
            c.__advTest.stageLine({ speaker: id, position: 'center', expression }); c.__advTest.renderActors(id);
            const actor = container.children.find(el => el.dataset.actor === id);
            const numericStyle = Object.fromEntries(Object.entries(actor.style).filter(([key]) => key.startsWith('--adv-')));
            if (!baseStyle) baseStyle = numericStyle;
            assert.deepEqual(numericStyle, baseStyle, id + '/' + expression + ': no framing jump');
            assert.equal(actor.children[0].src, c.BattleStoryAssets.url(character.portraits[expression]), id + '/' + expression);
            assert.equal(Number(actor.style['--adv-canvas-scale']), character.portraitMetrics.canvas.height / character.portraitMetrics.head.height);
            assert.equal(Number(actor.style['--adv-head-top-offset']), character.portraitMetrics.headTopOffset);
            for (const viewport of [[1440, 900], [1366, 768], [390, 844], [360, 740], [844, 390]]) {
                const g = require('./helpers/portrait-layout.cjs').geometry(id, viewport, { style: numericStyle });
                assert.ok(g.hairTop >= g.toolbar + 16 - 1e-7 && g.chin < g.dialogueTop, id + '/' + expression + ': visible face at ' + viewport.join('x'));
            }
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
    const mechanics = c.__legacyTest.EPISODES.map(({ arc, background, protagonist, portraitStyle, summary, pre, postWin, postLose, ...rest }) => rest);
    assert.equal(hash(JSON.stringify(mechanics)), '1ea3c457ec4ad956f35cef45508c44e6ed5d60334982d498573e097a17be80c5');
    // Exclude only the approved BGM argument and the notice gate before the introduction.
    assert.equal(hash(source.slice(source.indexOf('    function getNextCardId'), source.indexOf('    function handleStoryBattleEnded'))
        .replace("            introScene: S.phase === 'post' ? (S.pendingWinner !== 'player' && ep.postLose?.length ? 'lose' : 'win') : S.phase,\n", '')
        .replaceAll('playStorySceneBgm(ep.protagonist);', 'playStorySceneBgm();')
        .replace('        if (!beforeStory(() => startIntro(episodeId))) return;\n', '')), '37382307e675f6ab78d30c443d823665d166f9c4b3e19f66e757a6d1a9d07ca0');
    assert.match(read('achievements.js'), /\['episode1', 'episode2', 'episode3'\]/);
    assert.match(read('achievements.js'), /if \(state\.achievementStory \|\| state\.storyEpisodeId\) return \[\]/);
});

test('101b adds unlockable 剛 and 栞那 while classmates stay outside selection and all stay outside online protocol', async () => {
    for (const file of ['main.js', 'mobile/main-sp.js']) {
        const source = read(file);
        for (const name of ['START_CHARACTER_OPTIONS', 'START_GALLERY_CHARACTER_OPTIONS']) {
            const value = source.match(new RegExp('const ' + name + ' = \\[([^]*?)\\];'))[1];
            assert.doesNotMatch(value, /classmate/);
            assert.match(value, /kanna/);
            assert.match(value, /tsuyoshi/);
        }
    }
    for (const file of ['profile.js', 'achievements.js', 'network.js']) assert.doesNotMatch(read(file), /classmate/, file);
    assert.doesNotMatch(read('battle-engine-worker.js'), /kanna|tsuyoshi|classmate/);
    assert.match(read('network.js'), /value="tsuyoshi" disabled/);
    const imageContext = { window: {} }; vm.runInNewContext(read('battle-images.js'), imageContext);
    assert.deepEqual(Object.keys(imageContext.window.BattleImages.standingPaths), ['chizuru', 'mai', 'takumi', 'akatsuki', 'tsuyoshi', 'kanna', 'yuzuki', 'ryuta']);
    for (const file of ['web.html', 'mobile/mobile.html']) assert.doesNotMatch(read(file), /value="(?:kanna|tsuyoshi|classmate1|classmate2)"/);
});

test('both pages load ADV data locally in order with the current cache key', async () => {
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const source = read(file); let last = -1;
        for (const module of ['story-data/portrait-metrics.js', 'story-data/characters.js', 'story-data/registry.js', 'story-data/episode4.js', 'story-data/episode5.js', 'story-data/episode6.js', 'story-data/episode7.js', 'story-data/episode8.js', 'story-data/episode9.js', 'story-data/episode10.js', 'story-adv.js', 'story-mode.js']) {
            const version = ['story-adv.js', 'story-data/characters.js', 'story-data/registry.js', 'story-data/icon-metrics.js', 'story-data/character-intros.js', 'story-data/portrait-metrics.js'].includes(module) ? '20261007-osananajimi105a' : ['story-data/registry.js', 'story-data/episode7.js'].includes(module) ? '20261006-summer100b' : module === 'story-adv.js' ? '20261006-icons99e' : ['story-mode.js', 'story-data/characters.js', 'story-data/registry.js', 'story-data/icon-metrics.js', 'story-data/character-intros.js'].includes(module) ? '20261006-icons99e' : module === 'story-data/characters.js' ? '20261005-face95b' : module === 'story-data/portrait-metrics.js' ? '20261005-outline94b' : ['story-data/episode5.js', 'story-data/episode6.js', 'story-data/episode7.js', 'story-data/episode9.js', 'story-data/episode10.js'].includes(module) ? '20261005-story-poses92b' : '20261004-story-poses90b';
            const position = source.indexOf(module + '?v=' + version); assert.ok(position > last, file + ': ' + module); last = position;
        }
        assert.ok(source.includes('story-adv.css?v=20261007-osananajimi105a'));
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
    [7, 'chizuru', 'akatsuki', 191, 'うるさい二人が来た', 'なんか気になる', '廊下から聞こえてくる、うるさい二人の声。注文を聞きに行った千鶴は、さっそくいじられて……。'],
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
            if (!optionalSource(t, root, [file, REVIEW_FILE, FIXES_FILE])) return;
            if (!fs.existsSync(path.join(root, file))) { t.skip('Source scenario is absent; only the word-for-word comparison is skipped.'); return; }
            const source = applyStoryFixes(read(file), number);
            const actual = clone(spoken.map(({ speaker, text, direction, position }) =>
                speaker === 'narration' ? { speaker, text, direction } : { speaker, text, direction, position }));
            const expected = scenarioSpeech(source, player);
            if (number === 7) {
                const start = expected.findIndex(line => line.text === 'なんやこれ？');
                const end = expected.findIndex((line, index) => index >= start && line.text === 'お前が決めんな');
                expected.splice(start, end - start + 1, ...summerReplacementSpeech());
            }
            assert.deepEqual(actual, expected);
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
            if (!optionalSource(t, root, [file, REVIEW_FILE])) return;
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
    vm.runInNewContext(read('tests/story-adv.test.cjs'), { __dirname, URL, URLSearchParams, require(name) {
        if (name === 'node:test') return (name, callback) => cases.set(name, callback);
        if (name === 'node:fs') return portableFs;
        if (name === 'node:assert/strict') return countedAssert;
        return require(name);
    } });
    for (const number of [5, 6, 7, 8, 9, 10]) await cases.get(`episode${number}: data, staging and optional source comparisons`)({
        test: async (name, callback) => callback({ skip: reason => skipped.push(reason) })
    });
    assert.equal(skipped.length, 12); assert.ok(skipped.every(reason => reason.includes('comparison is skipped')));
    assert.ok(assertions > 1000, 'all data/staging checks still run');
});

test('portrait expressions are exactly the approved registrations, including kitchen', () => {
    const { c } = runtime(); const a = c.BattleStoryAssets;
    for (const [id, character] of Object.entries(a.characters)) {
        const registered = Object.values(character.poses).flatMap(Object.values).sort();
        const files = fs.readdirSync(path.join(root, 'assets/battle-images/story/portraits'))
            .filter(f => f.startsWith(id + '-') && f.endsWith('.webp')).map(f => 'assets/battle-images/story/portraits/' + f).sort();
        assert.deepEqual(clone(registered), files);
        for (const expression of Object.keys(character.portraits)) {
            assert.equal(character.poses.default[expression], `assets/battle-images/story/portraits/${id}-${expression}.webp`);
        }
        assert.equal(a.portraitPath(id, 'unlisted'), character.portraits.normal || character.standing);
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
        assert.deepEqual(clone(S.actors.get('chizuru')), { id: 'chizuru', position: 'farLeft', expression: 'pout', pose: 'default' });
        assert.deepEqual(clone(S.actors.get('akatsuki')), akatsuki);
        assert.ok(c.__advTest.episodeImages(S.episode).includes(c.BattleStoryAssets.iconPath('chizuru', 'pout')));
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
        const actor = elements.get('adv-icon-crop');
        assert.equal(actor.classList.contains('adv-icon-sheet'), false);
        assert.ok(actor.style['--adv-icon-crop-scale']);
        assert.equal(elements.get('adv-portraits').children.length, 0);
        assert.equal(actor.children[0].src, c.BattleStoryAssets.url(c.BattleStoryAssets.portraitPath(lines[i].speaker, lines[i].expression)));
    }
    assert.ok(requests.length); assert.ok(requests.every(file => c.BattleStoryAssets.paths().map(c.BattleStoryAssets.url).includes(file)));
    assert.deepEqual(r.warnings, []);
});

test('episode9 backgrounds, left-side Mai, expressions and in-room Tsuyoshi follow the script', async () => {
    const { c, elements, requests } = fullRuntime(); const ep = c.BattleStoryData.get('episode9');
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
    assert.ok(requests.includes(c.BattleStoryAssets.url(c.BattleStoryAssets.characters.tsuyoshi.portraits.normal)));
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
            Object.assign(c, { getUserProfile: () => ({ favoriteCharacterId: 'akatsuki', favoriteSkillKey: 'tasteThief' }), setupMatchAutosaveOnce() {}, setupMatchExitGuardOnce() {}, renderUserStageProfile() {}, renderCoinStageProfile() {}, updateResumeMatchButtonVisibility() {} });
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
                assert.ok(c.getSkillCutinImagePathForSide(side).endsWith(`/story/icons/${id}-smile-alpha.webp?v=20261007-osananajimi105a`));
                assert.ok(c.getBattleModeCutinImagePathForSide(side).endsWith(`/story/icons/${id}-laugh-alpha.webp?v=20261007-osananajimi105a`));
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
    if (!optionalSource(t, root, [file])) return;
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

test('fixes F1–F5 are applied only in data and approval flags follow the owner decisions', async t => {
    const { c } = runtime(), ep7 = c.BattleStoryData.get('episode7');
    assert.equal(ep7.clear.next.title, 'なんか気になる');
    for (const [n, original, fixed] of [
        [7, '俺が見つけたみたいに言うな', 'せやろ、俺が見つけてんで'],
        [7, 'お前が言うたんやろが', '店の前で騒いでただけやろが'],
        [8, '昨日会ったばっかりなのにね', 'さっき会ったばっかりなのにね'],
        [10, 'そのくだり昨日もやったやろ', 'そのくだりさっきもやったやろ']
    ]) {
        const ep = c.BattleStoryData.get(`episode${n}`), texts = ep.scenes.flatMap(s => s.lines).map(l => l.text);
        assert.ok(texts.some(text => text === fixed || text === fixed + '！' || text === fixed + '！？'));
        assert.ok(!texts.some(text => text === original || text === original + '！' || text === original + '！？'));
        const file = `docs/story/episode${n}-scenario.md`;
        await t.test(`episode${n}: original fix source comparison`, t => {
            if (!optionalSource(t, root, [file, FIXES_FILE])) return;
            assert.ok(read(file).includes(original)); assert.ok(applyStoryFixes(read(file), n).includes(fixed));
        });
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
        assert.deepEqual(portraits.children.map(f => f.children[0].children[0].src), ids.map(id => c.BattleStoryAssets.url(c.BattleStoryAssets.characters[id].standing)));
        for (const figure of portraits.children) {
            const frame = figure.children[0], m = c.BattleStoryAssets.characters[frame.dataset.actor].portraitMetrics;
            assert.ok(frame.classList.contains('adv-arc-standing'));
            assert.equal(frame.style['--adv-canvas-scale'], undefined);
        }
        assert.ok(requests.every(file => c.BattleStoryAssets.paths().map(c.BattleStoryAssets.url).includes(file) || file === 'assets/battle-images/card-back.webp'));
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
    assert.deepEqual(clone([...c.__advTest.S.actors.values()]), [{ id: 'mai', position: 'left', expression: 'normal', pose: 'default' }]);
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
        { id: 'kanna', position: 'left', expression: 'troubled', pose: 'default' }, { id: 'mai', position: 'center', expression: 'smile', pose: 'default' }
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

test('review table permits exactly the documented punctuation and presentation additions across all ten episodes', async t => {
    const { c } = runtime(), review = storyReview();
    const episodes = [...c.__legacyTest.EPISODES.map((e, i) => ({ number: i + 1, scenes: ['pre', 'postWin', 'postLose'].filter(k => e[k]).map(k => ({ id: k, lines: e[k] })) })), ...c.BattleStoryData.all().map(historicalEpisode)];
    let changes = 0, effects = 0, spoken = 0; const used = { motions: new Set(), marks: new Set(), screens: new Set(), cues: new Set() };
    for (const ep of episodes) for (const scene of ep.scenes) scene.lines.forEach((line, index) => {
        const key = ep.number + '/' + scene.id + ':' + (index + 1), edit = review.changes.get(key), fx = review.effects.get(key);
        if (line.text) { spoken++; assert.doesNotMatch(line.text, /。$/); }
        for (const [field, catalog] of [['motion', 'motions'], ['mark', 'marks'], ['screen', 'screens'], ['se', 'cues']]) {
            if (!line[field]) continue;
            assert.ok(c.BattleStoryData.presentation[catalog].includes(line[field]), key);
            used[catalog].add(line[field]);
        }
    });
    assert.equal(spoken, 1062);
    for (const name of ['hop', 'shake', 'zoom', 'tremble', 'slideIn']) assert.ok(used.motions.has(name));
    for (const name of ['flash', 'screenShake', 'speedLines']) assert.ok(used.screens.has(name));
    for (const name of ['pop', 'shock', 'laugh', 'idea', 'thud', 'sparkle', 'swish']) assert.ok(used.cues.has(name));
    for (const name of ['!', '?', '!?', 'sweat', 'anger', 'note', 'sparkle', '…']) assert.ok(used.marks.has(name));
    await t.test('coordinate-specific authoring review comparison', t => {
    if (!optionalSource(t, root, [REVIEW_FILE])) return;
    for (const ep of episodes) for (const scene of ep.scenes) scene.lines.forEach((line, index) => {
        const key = ep.number + '/' + scene.id + ':' + (index + 1), edit = review.changes.get(key), fx = review.effects.get(key);
        if (edit) {
            changes++; assert.equal(line.text, edit.after, key);
            assert.ok(edit.after === edit.before + '！' || edit.after === edit.before + '！？', key);
            assert.doesNotMatch(edit.before, /[！？。]$/);
        }
        if (fx) { effects++; for (const [field, value] of Object.entries(fx)) assert.equal(line[field], value, key); }
        for (const field of ['motion', 'mark', 'screen', 'se']) {
            if (line[field] && (field !== 'se' || !['chime', 'crowd', 'notify'].includes(line[field]))) {
                assert.equal(fx?.[field], line[field], 'undocumented addition: ' + key);
            }
        }
    });
    assert.equal(changes, review.changes.size); assert.equal(effects, review.effects.size);
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
    });
});

test('the entire original episode data stays unchanged after reversing only the reviewed additions', async t => {
    const { c } = runtime();
    // This shipped-data fingerprint remains enforceable when authoring docs are absent.
    const shipped = [
        ...c.__legacyTest.EPISODES.map((e, i) => ({ number: i + 1, scenes: ['pre', 'postWin', 'postLose'].filter(k => e[k]).map(k => ({ id: k, lines: clone(e[k]) })) })),
        ...c.BattleStoryData.all().map(historicalEpisode)
    ];
    for (const ep of shipped) delete ep.portraitStyle; // Owner's 99a presentation change; scenario fingerprint stays intact.
    for (const ep of shipped) for (const s of ep.scenes) for (const line of s.lines) delete line.pose;
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(shipped)).digest('hex'), 'f353dbb61438abd2c4cd9572aea8c051805954e5c8128ea0e9b264a70dd2ff64');
    await t.test('original data fingerprint after documented review reversal', t => {
    if (!optionalSource(t, root, [REVIEW_FILE])) return;
    const original = [
        ...c.__legacyTest.EPISODES.map((e, i) => ({ number: i + 1, scenes: ['pre', 'postWin', 'postLose'].filter(k => e[k]).map(k => ({ id: k, lines: reviewedLines(i + 1, k, e[k]) })) })),
        ...c.BattleStoryData.all().map(historicalEpisode).map(e => ({ ...clone(e), scenes: e.scenes.map(s => ({ ...clone(s), lines: reviewedLines(e.number, s.id, s.lines) })) }))
    ];
    for (const ep of original) delete ep.portraitStyle;
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'), '056654abad608b7475a9cb75f09bdbab21dd5bddf639754b0b0ce4906471350e');
    });
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
        const portrait = elements.get('adv-face-icon');
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
    assert.equal(elements.get('adv-face-icon').querySelector('.adv-emotion-mark'), null);
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

function viewerRuntime(options = {}) {
    const fixtures = {
        [PROGRESS_KEY]: JSON.stringify({ episode1: true, episode10: true, future: 'keep' }),
        [ADV_KEY]: JSON.stringify({ version: 1, auto: true, resume: { episodeId: 'episode10', sceneId: 'win', stage: 'post', lineIndex: 4 } }),
        battleAlaCarteCharacterNotice20261004: '1',
        balc_achievements_v1: '{"coins":123}', balc_missions_v1: '{"cleared":["keep"]}',
        'battle-a-la-carte:match-autosave:v1': '{"keep":true}', profile: '{"coins":321}'
    };
    const r = runtime({ ...options, viewer: true, save: fixtures });
    // Mount the actual entry-page markup before firing any startup hooks.
    r.c.document.body.innerHTML = read(options.mobile ? 'mobile/mobile.html' : 'web.html');
    r.c.__legacyTest.init();
    r.elements.get('character-notice-confirm').listeners.click();
    return r;
}
const viewerChoices = ['勝った場合の続きを読む', '負けた場合の会話を読む', 'スキップして次の場面へ'];
async function viewerSkip(r) {
    r.elements.get('adv-skip').onclick();
    const pending = r.elements.get('adv-skip-yes').onclick();
    await r.tick(2000); await pending;
}
function assertViewerUnchanged(r, before) {
    assert.deepEqual([...r.store], before);
    assert.deepEqual(r.persistentWrites, []);
    assert.equal(r.c.StoryViewer.blockedWrites, 0, 'no attempted storage mutation, even on the read-only facade');
    assert.equal(r.c.__advTest.saved.resume, null);
    assert.equal(r.c.__advTest.S.battleActive, false);
    assert.equal(r.c.__legacyTest.S.battleActive, false);
    assert.ok(!r.calls.includes('skill-choice') && !r.calls.includes('init-normal'));
}
for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`${label}: viewer lists all ten episodes in two arcs without progress or a normal-menu link`, () => {
        const r = viewerRuntime({ mobile }), before = [...r.store];
        const list = r.elements.get('story-episode-list');
        assert.deepEqual(list.children.filter(n => n.className === 'story-arc-heading').map(n => n.textContent), ['再会編', '出会い・文化祭編']);
        const cards = list.children.filter(n => n.className === 'story-episode-card'); assert.equal(cards.length, 10);
        assert.deepEqual(cards.map(n => n.children.at(-1).getAttribute('data-story-episode-id')), Array.from({ length: 10 }, (_, i) => 'episode' + (i + 1)));
        assert.ok(cards.every(n => !n.children.at(-1).disabled));
        assert.equal(r.c.BattleStoryProgress.load().episode10, undefined);
        r.c.BattleStoryProgress.complete('episode10');
        for (let n = 1; n <= 3; n++) {
            const adapted = r.c.StoryViewer.get('episode' + n), source = r.c.__legacyTest.EPISODES[n - 1];
            assert.deepEqual(clone(adapted.scenes[0].lines.slice(0, -1).map(l => l.text)), clone(source.pre.map(l => l.text)));
            assert.deepEqual(clone(adapted.scenes[1].lines.map(l => l.text)), clone(source.postWin.map(l => l.text)));
            assert.deepEqual(clone(adapted.scenes[2].lines.map(l => l.text)), clone((source.postLose || []).map(l => l.text)));
        }
        const html = read(mobile ? 'mobile/mobile.html' : 'web.html');
        assert.ok(html.indexOf('story-viewer.js?v=') < html.indexOf('missions.js?v='));
        assert.ok(html.includes(r.c.CharacterNotice.shortText));
        assert.doesNotMatch(html, /(?:href|onclick)=["'][^"']*\?viewer/);
        assert.equal(r.elements.get('start-story-back-button').classList.contains('hidden'), true);
        assertViewerUnchanged(r, before);
    });
    for (const outcome of ['win', 'lose', 'skip']) test(`${label}: viewer all episodes ${outcome} route reaches CLEAR and list with zero persistent writes`, async () => {
        const r = viewerRuntime({ mobile }), { c, elements } = r, before = [...r.store];
        for (let n = 1; n <= 10; n++) {
            await c.StoryAdv.start('episode' + n, true);
            assert.equal(c.__advTest.S.stage, 'pre', 'viewer always starts afresh');
            assert.equal(elements.get('adv-viewer-badge').hidden, false);
            await viewerSkip(r);
            const ending = elements.get('adv-ending');
            assert.deepEqual(ending.children.map(button => button.textContent), viewerChoices);
            const button = ending.children[['win', 'lose', 'skip'].indexOf(outcome)]; button.onclick();
            await r.tick(2000);
            if (outcome === 'lose') {
                if (ending.hidden) await viewerSkip(r);
                assert.deepEqual(ending.children.map(button => button.textContent), viewerChoices);
                // Empty tutorial1 loss is a boundary, with no invented dialogue.
                ending.children[0].onclick(); await r.tick(2000);
            }
            assert.equal(c.__advTest.S.stage, 'post');
            if (ending.hidden) await viewerSkip(r);
            assert.equal(c.__advTest.S.stage, 'clear');
            assert.equal(ending.children[0].textContent, `第${n}話 CLEAR`);
            if (n === 10) {
                ending.children.at(-1).onclick();
                assert.equal(ending.children[0].textContent, '出会い・文化祭編 CLEAR');
                assert.equal(ending.children.find(el => el.className === 'adv-arc-notice character-notice' || el.className === 'character-notice adv-arc-notice').textContent, c.CharacterNotice.shortText);
                assert.equal(ending.children.find(el => el.className === 'adv-arc-portraits').children.length, 6);
            }
            ending.children.at(-1).onclick();
            assert.equal(elements.get('story-adv').hidden, true);
            assert.equal(elements.get('story-episode-list').children.filter(el => el.className === 'story-episode-card').length, 10);
            assertViewerUnchanged(r, before);
        }
        c.listeners.pagehide(); assertViewerUnchanged(r, before);
    });
    test(`${label}: viewer manual reading, AUTO, fast-forward, pause, nested log and exit use the existing ADV`, async () => {
        const r = viewerRuntime({ mobile, reduced: false }), { c, elements } = r, before = [...r.store];
        await c.StoryAdv.start('episode2');
        const state = c.__advTest.S;
        elements.get('adv-pause').onclick(); const typed = state.typed;
        await r.tick(4000); assert.equal(state.typed, typed);
        elements.get('adv-pause-log').onclick(); assert.equal(state.logOpen, true);
        elements.get('adv-log-close').onclick(); assert.equal(state.paused, true);
        elements.get('adv-resume').onclick(); await r.tick(2000); assert.equal(state.typing, false);
        elements.get('adv-auto').onclick(); assert.equal(c.__advTest.saved.auto, true);
        await r.tick(7000); assert.ok(state.lineIndex > 0);
        elements.get('adv-auto').onclick();
        elements.get('adv-fast').onclick(); await r.tick(15000);
        assert.deepEqual(elements.get('adv-ending').children.map(b => b.textContent), viewerChoices);
        assert.equal(state.fastForward, false);
        elements.get('adv-ending').children[0].onclick(); await r.tick(2000);
        elements.get('adv-log-button').onclick();
        assert.ok(elements.get('adv-log-lines').children.length >= c.StoryViewer.get('episode2').scenes[0].lines.filter(l => l.text).length);
        elements.get('adv-log-close').onclick();
        elements.get('adv-pause').onclick(); elements.get('adv-pause-exit').onclick();
        assert.equal(elements.get('story-adv').hidden, true);
        assertViewerUnchanged(r, before);
        await c.StoryAdv.start('episode1');
        for (let i = 0; elements.get('adv-ending').hidden && i < 40; i++) {
            await r.tick(2000); c.__advTest.advance();
        }
        assert.deepEqual(elements.get('adv-ending').children.map(b => b.textContent), viewerChoices);
        assertViewerUnchanged(r, before);
    });
    test(`${label}: viewer startup suppresses autosave, profile migration, missions, achievements and account mount`, () => {
        const r = viewerRuntime({ mobile, main: true }), { c, load } = r, before = [...r.store];
        load('missions.js'); load('achievements.js');
        c.document.currentScript = { src: 'https://offline.invalid/network.js' }; load('network.js');
        c.fetch = () => { throw Error('viewer must not start account networking'); };
        for (const callback of c.document.eventHandlers.get('DOMContentLoaded')) callback();
        assert.equal(vm.runInContext('gameStartedOnce', c), false);
        assert.equal(c.__legacyTest.S.observerInstalled, false);
        assert.equal(c.__legacyTest.S.guardsInstalled, false);
        assertViewerUnchanged(r, before);
    });
}
test('viewer storage membrane blocks set/remove/clear and property writes while ordinary pages retain real storage', () => {
    const r = viewerRuntime(), before = [...r.store];
    for (const method of ['setItem', 'removeItem', 'clear']) assert.throws(() => r.c.localStorage[method]('keep', 'value'), /storage is disabled/);
    assert.throws(() => vm.runInContext("localStorage.profile = 'changed'", r.c), /storage is disabled/);
    assert.throws(() => vm.runInContext('delete localStorage.profile', r.c), /storage is disabled/);
    assert.deepEqual([...r.store], before); assert.deepEqual(r.persistentWrites, []);
    for (const search of ['', '?viewers', '?x=viewer']) {
        const normal = runtime(); normal.c.location.search = search; normal.load('story-viewer.js');
        assert.equal(normal.c.StoryViewer.active, false);
        normal.c.localStorage.setItem('normal', 'works'); assert.equal(normal.store.get('normal'), 'works');
    }
});

// 100b special episodes are explicitly loaded here so historical ten-episode contracts stay independently enforceable.
const SUMMER_FILE = 'story-data/episode-special-summer.js';
const HALLOWEEN_FILE = 'story-data/episode-special-halloween.js';
test('101b Halloween: owner speech/directions/narration stay verbatim; five scenes, battle and rewards use 101a assets', async t => {
    const r = halloweenRuntime(), {c} = r, ep = c.BattleStoryData.get('special-halloween');
    const lines = ep.scenes.flatMap(s=>s.lines);
    await t.test('owner source comparison', t => {
    if (!optionalSource(t, root, ['docs/story/special-halloween-scenario.md'])) return;
    const expected = [], directions = [], narration = [];
    let monologue = false;
    const source = read('docs/story/special-halloween-scenario.md').split('## SCENE 1')[1].split('## 特別編 CLEAR')[0];
    for (const raw of source.split(/\r?\n/)) {
        const line = raw.trim(), speech = line.match(/^(【[^】]+】)?(栞那|千鶴)「(.*)」$/);
        if (line === '栞那モノローグ：') monologue = true;
        if (speech) {
            expected.push({speaker: speech[2] === '栞那' ? 'kanna' : 'chizuru', text: speech[3]});
            if (speech[1]) directions.push(speech[1]);
        } else if (monologue && /^「.*」$/.test(line)) expected.push({speaker: 'kanna', text: line.slice(1,-1)});
        if (/^（.*）$/.test(line) && !/少し間/.test(line)) narration.push(line.slice(1,-1));
    }
    assert.deepEqual(clone(lines.filter(l=>!['narration','announce'].includes(l.speaker) && !l.authoredBy).map(({speaker,text})=>({speaker,text}))), expected);
    assert.deepEqual(clone(lines.filter(l=>l.direction?.startsWith('【')).map(l=>l.direction)), directions);
    assert.deepEqual(clone(lines.filter(l=>l.speaker==='narration' && l.text).map(l=>l.text)), narration);
    });
    assert.equal(lines.filter(l=>l.monologue && l.offscreen).length, 5);
    assert.equal(new Set(lines.map(l=>l.id)).size, lines.length);
    assert.equal(lines.filter(l=>l.battle).length, 1);
    assert.deepEqual(clone(ep.scenes.filter(s=>/^scene/.test(s.id)).map(s=>s.background)), ['halloween-cooking-room','halloween-cooking-room','halloween-cooking-room','halloween-cooking-room','halloween-hallway-evening']);
    assert.ok(ep.scenes.every(s=>s.bgm==='seasonal-halloween')); assert.equal(ep.bgm,'seasonal-halloween');
    assert.equal(ep.battle.background,'halloween-cooking-room');
    assert.deepEqual(clone(ep.clear.rewards), {unlockCharacter:'kanna',costumes:['kanna:halloween','chizuru:halloween']});
    assert.equal(lines.find(l=>l.direction==='SE：カシャ').se,'pop');
    assert.equal(lines.find(l=>l.direction==='画面暗転').effect,'fadeOut');
    for (const line of lines.filter(l=>l.direction?.startsWith('【'))) {
        if (/笑いをこらえる|薄い笑顔|満足そう|意地悪|笑顔|嬉しそう|目を輝かせる|期待|得意げ|表情が変わる/.test(line.direction)) assert.equal(line.expression,'smile');
        if (/笑う/.test(line.direction)) assert.equal(line.expression,'laugh');
        if (/疑う|不満|嫌そう|渋々|警戒|恥ずかしそう|折れる/.test(line.direction)) assert.equal(line.expression,'troubled');
        if (/固まる|驚く|一瞬止まる|意外そう/.test(line.direction)) assert.equal(line.expression,'surprised');
        if (/じっと見る|少し考える/.test(line.direction)) assert.equal(line.expression,'normal');
    }
    assert.deepEqual(clone(ep.scenes.find(s=>s.id==='lose').lines.map(l=>[l.speaker,l.text])), [['chizuru','勝った'],['chizuru','プリン、もらうね'],['kanna','……もう一回'],['chizuru','栞那、負けず嫌い']]);
    assert.ok(ep.scenes.find(s=>s.id==='lose').lines.every(l=>l.provisional && l.authoredBy==='Claude'));
    assert.deepEqual(r.warnings, []);
});
for (const mobile of [false,true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`101b ${label}: each festival clear is required; selection is summer then Halloween; locked starts/resumes do not write`, async () => {
        for (const missing of Object.keys(festivalProgress)) {
            const progress = {...festivalProgress}; delete progress[missing];
            const r=halloweenRuntime({mobile,save:{[PROGRESS_KEY]:JSON.stringify(progress)}});
            const list=new r.Element(); r.c.StoryAdv.appendEpisodeCards(list);
            assert.deepEqual(list.children.filter(n=>n.className==='story-episode-card').slice(-2).map(n=>n.children[0].textContent), ['特別編「夏だ！海だ！ポロリだー！」','特別編「Trick or Treat？」']);
            assert.equal(list.children.at(-1).children.at(-1).disabled,true);
            await r.c.StoryAdv.start('special-halloween'); await r.c.StoryAdv.start('special-halloween',true);
            assert.equal(r.c.__advTest.S.active,false); assert.deepEqual(r.persistentWrites,[]);
        }
    });
    test(`101b ${label}: every ADV line uses Halloween faces, no intro, seasonal BGM on all scenes and resumed positions`, async () => {
        const r=halloweenRuntime({mobile,intros:true}), {c,elements,tick}=r;
        await c.StoryAdv.start('special-halloween'); const ep=c.__advTest.S.episode,S=c.__advTest.S;
        for (const scene of ep.scenes) {
            c.__advTest.enterScene(scene.id,scene.id==='lose'?'lose':scene.id==='win'||['scene4','scene5'].includes(scene.id)?'post':'pre');
            assert.deepEqual(c.lastStoryBgm,{character:'kanna',bgm:'seasonal-halloween'});
            for (const [index,line] of scene.lines.entries()) {
                if(!line.text) continue;
                S.lineIndex=index; await c.__advTest.renderCurrent(); await tick(0);
                assert.equal(elements.get('adv-character-intro').hidden,true);
                if(line.speaker==='narration'||line.monologue) assert.equal(elements.get('adv-face-icon').hidden,true);
                else assert.ok(elements.get('adv-icon-crop').children[0].src.includes(`${line.speaker}-halloween-${line.expression}-alpha.webp`));
            }
        }
        for (const position of [{sceneId:'scene2',stage:'pre',lineIndex:6},{sceneId:'scene5',stage:'post',lineIndex:2},{sceneId:'lose',stage:'lose',lineIndex:1},{sceneId:'scene3',stage:'battle',lineIndex:0}]) {
            const resumed=halloweenRuntime({mobile,save:{[ADV_KEY]:JSON.stringify({resume:{episodeId:'special-halloween',...position}})}});
            await resumed.c.StoryAdv.start('special-halloween',true);
            assert.deepEqual(resumed.c.lastStoryBgm,{character:'kanna',bgm:'seasonal-halloween'});
        }
        assert.ok(c.__advTest.episodeImages(ep).filter(f=>f.includes('/story/icons/')).every(f=>f.includes('-halloween-')));
    });
    for (const winner of ['player','cpu']) test(`101b ${label}: real 栞那 vs 千鶴 battle, background/faces, ${winner}, retry/continue, CLEAR unlock and reload`, async () => {
        const r=halloweenRuntime({mobile,main:true}),{c,elements,tick,Element}=r; r.load('profile.js');
        assert.equal(c.isPlayableCharacterUnlocked('kanna'),false);
        await c.StoryAdv.start('special-halloween'); await viewerSkip(r); c.choice.onStart('foodTrap');
        assert.deepEqual(clone(c.GameState.characterIds),{player:'kanna',cpu:'chizuru'});
        assert.equal(c.GameState.players.player.selectedSkillKey,'foodTrap'); assert.equal(c.GameState.achievementStory,true);
        r.load(mobile?'mobile/render-sp.js':'render.js'); c.updateUI=()=>{};
        const playerIcon=new Element(),cpuIcon=new Element(),board=new Element();elements.set('game-container',board);
        c.document.querySelector=selector=>selector==='.player-icon'?playerIcon:selector==='.cpu-icon'?cpuIcon:null;
        c.applyBackgroundDesign('default'); assert.ok(board.style['--bg-design-image'].includes('halloween-cooking-room.webp'));
        for(const [side,id,icon] of [['player','kanna',playerIcon],['cpu','chizuru',cpuIcon]]) {
            c.applyCharacterSkins(); c.updateCharacterFaces();
            assert.match(icon.children[0].getAttribute('src'), /-halloween-normal-alpha.webp/);
            assert.ok(c.getSkillCutinImagePathForSide(side).includes(`${id}-halloween-smile-`));
            assert.ok(c.getBattleModeCutinImagePathForSide(side).includes(`${id}-halloween-laugh-`));
        }
        c.endGame(winner); assert.equal(c.StoryAdv.finishBattleReturn(),true);await tick(0);
        assert.deepEqual(c.lastStoryBgm,{character:'kanna',bgm:'seasonal-halloween'});
        if(winner==='cpu') {
            await viewerSkip(r); assert.deepEqual(elements.get('adv-ending').children.map(b=>b.textContent),['もう一度挑戦','勝ったことにして進める','ストーリー選択へ戻る']);
            elements.get('adv-ending').children[0].onclick();await tick(0);c.choice.onStart('foodTrap');c.endGame('cpu');c.StoryAdv.finishBattleReturn();await tick(0);
            await viewerSkip(r);elements.get('adv-ending').children[1].onclick();await tick(0);assert.equal(c.__advTest.S.continuedAsWin,true);
        }
        await viewerSkip(r);assert.equal(c.__advTest.S.stage,'clear');
        assert.equal(c.isPlayableCharacterUnlocked('kanna'),true);assert.equal(c.BattleStoryProgress.load()['special-halloween'],true);
        assert.deepEqual(elements.get('adv-ending').children.slice(0,4).map(n=>n.textContent), ['特別編 CLEAR','Trick or Treat？','NEW CHARACTER 栞那 — プレイアブルキャラクターとして栞那が使用可能になりました','COSTUME COLLECTION 栞那『ハロウィン・ウィッチ』／千鶴『ハロウィン・ブラックキャット』']);
        c.applyBackgroundDesign('default');assert.equal(board.style['--bg-design-image'],'none');
        for(const id of ['kanna','chizuru']) assert.equal(c.selectCharacterCostume(id,'halloween'),true);
        c.updateUserBasicSettings({favoriteCharacterId:'kanna'});
        const again=halloweenRuntime({mobile,main:true,save:Object.fromEntries(r.store)});again.load('profile.js');
        assert.equal(again.c.getPreferredStartCharacterId(),'kanna');assert.equal(again.c.getSelectedCharacterCostume('kanna'),'halloween');
        again.c.setCharacterChoice('kanna');again.c.beginMatchByRole('先攻');assert.equal(again.c.GameState.characterIds.player,'kanna');
        assert.equal(again.c.GameState.storyEpisodeId,null);assert.match(again.c.getSkillCutinImagePathForSide('player'),/kanna-halloween-smile/);
    });
    for(const route of ['win','lose','skip']) test(`101b ${label}: viewer ${route} lists both specials and reads Halloween with no unlock/storage/battle`,async()=>{
        const r=halloweenRuntime({mobile,viewer:true,main:true}),{c,elements}=r;r.load('profile.js');const before=[...r.store];
        const cards=elements.get('story-episode-list').children.filter(n=>n.className==='story-episode-card');assert.equal(cards.length,12);
        assert.deepEqual(cards.slice(-2).map(n=>n.children[0].textContent),['特別編「夏だ！海だ！ポロリだー！」','特別編「Trick or Treat？」']);
        await c.StoryAdv.start('special-halloween');await viewerSkip(r);
        elements.get('adv-ending').children[['win','lose','skip'].indexOf(route)].onclick();await r.tick(0);
        if(route==='lose'){await viewerSkip(r);elements.get('adv-ending').children[0].onclick();await r.tick(0);}
        await viewerSkip(r);assert.equal(c.__advTest.S.stage,'clear');assert.equal(c.isPlayableCharacterUnlocked('kanna'),false);
        assert.equal(c.selectCharacterCostume('chizuru','halloween'),false);assertViewerUnchanged(r,before);
    });
}
test('101b entry pages register Halloween after summer with protected audio loader and current keys',()=>{
    for(const [file,prefix,audio] of [['web.html','','audio.js'],['mobile/mobile.html','../','audio-sp.js']]){
        const html=read(file), index=html.indexOf(prefix+HALLOWEEN_FILE+'?v=20261007-osananajimi105a');
        assert.ok(index>html.indexOf(prefix+SUMMER_FILE+'?v='));assert.ok(index<html.indexOf(prefix+'story-adv.js?v='));
        for(const script of ['audio-pack.js',audio,'profile.js','story-data/characters.js','story-adv.js','battle-images.js']) assert.ok(html.includes(script+'?v='+(script==='battle-images.js'?'20261007-osananajimi105a':script==='audio-pack.js'?'20261006-halloween101b':'20261007-osananajimi105a')));
    }
});
test('101b generic episode BGM falls back to episode key, permits a scene override and respects false',async()=>{
    const r=halloweenRuntime(),{c}=r;
    c.BattleStoryData.register({id:'future-seasonal',protagonist:'kanna',bgm:'seasonal-halloween',scenes:[
        {id:'first',lines:[{speaker:'kanna',text:'季節曲'}]},
        {id:'theme',bgm:'story',lines:[{speaker:'kanna',text:'テーマ曲'}]},
        {id:'silent',bgm:false,lines:[{speaker:'kanna',text:'切替なし'}]}
    ]});
    await c.StoryAdv.start('future-seasonal');assert.deepEqual(c.lastStoryBgm,{character:'kanna',bgm:'seasonal-halloween'});
    c.__advTest.enterScene('theme','pre');assert.deepEqual(c.lastStoryBgm,{character:'kanna',bgm:'story'});
    const count=r.calls.length;c.__advTest.enterScene('silent','pre');assert.equal(r.calls.length,count);
});
const festivalProgress = Object.fromEntries(Array.from({ length: 7 }, (_, i) => ['episode' + (i + 4), true]));
function summerRuntime(options = {}) {
    const r = runtime({ ...options, save: { [PROGRESS_KEY]: JSON.stringify(festivalProgress), ...options.save } });
    r.load(SUMMER_FILE);
    if (options.viewer) {
        r.c.document.body.innerHTML = read(options.mobile ? 'mobile/mobile.html' : 'web.html');
        r.c.__legacyTest.init(); r.elements.get('character-notice-confirm').listeners.click();
    }
    return r;
}
function halloweenRuntime(options = {}) {
    const r = runtime({ ...options, save: { [PROGRESS_KEY]: JSON.stringify(festivalProgress), ...options.save } });
    r.load(SUMMER_FILE); r.load(HALLOWEEN_FILE);
    r.c.playStoryBGM = (character, bgm) => { r.c.lastStoryBgm = {character, bgm}; r.calls.push(['story-bgm', character, bgm]); };
    if (options.viewer) {
        r.c.document.body.innerHTML = read(options.mobile ? 'mobile/mobile.html' : 'web.html');
        r.c.__legacyTest.init(); r.elements.get('character-notice-confirm').listeners.click();
    }
    return r;
}
test('100b special summer: owner dialogue and parenthetical narration verbatim, unique hooks, expressions, backgrounds and rewards', async t => {
    const { c, warnings } = summerRuntime(), ep = c.BattleStoryData.get('special-summer');
    const lines = ep.scenes.flatMap(s => s.lines), owner = lines.filter(l => l.speaker !== 'narration' && l.text && !l.authoredBy);
    await t.test('owner source comparison', t => {
    if (!optionalSource(t, root, ['docs/story/special-summer-scenario.md'])) return;
    const source = read('docs/story/special-summer-scenario.md').split('## 特別編 CLEAR')[0].split('## SCENE 1')[1];
    const names = { 剛: 'tsuyoshi', 暁: 'akatsuki' }, expected = [], directions = [], narration = [];
    let monologue = false;
    for (const raw of source.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '剛モノローグ：') monologue = true;
        const speech = line.match(/^(【[^】]+】)?(剛|暁)「(.*)」$/);
        if (speech) { expected.push({ speaker: names[speech[2]], text: speech[3].replace(/。$/, '') }); if (speech[1]) directions.push(speech[1]); }
        else if (monologue && /^「.*」$/.test(line)) expected.push({ speaker: 'tsuyoshi', text: line.slice(1, -1).replace(/。$/, '') });
        if (/^（.*）$/.test(line) && !/簡易チュートリアル|間/.test(line)) narration.push(line.slice(1, -1).replace(/。$/, ''));
    }
    assert.deepEqual(clone(owner.map(({ speaker, text }) => ({ speaker, text }))), expected);
    assert.deepEqual(clone(lines.filter(l => l.direction?.startsWith('【')).map(l => l.direction)), directions);
    assert.deepEqual(clone(lines.filter(l => l.speaker === 'narration' && l.text).map(l => l.text)), narration);
    });
    assert.equal(owner.filter(l => l.monologue).length, 11); assert.ok(owner.filter(l => l.monologue).every(l => l.offscreen));
    assert.equal(new Set(lines.map(l => l.id)).size, lines.length);
    assert.equal(lines.filter(l => l.battle).length, 1); assert.equal(ep.battle.after, 'battle-start');
    assert.deepEqual(clone(ep.battle), { after: 'battle-start', player: 'tsuyoshi', cpu: 'akatsuki', playerSkill: 'choose', cpuSkill: 'random', cpuPersonality: 'default' });
    assert.deepEqual(clone(ep.clear.rewards), { unlockCharacter: 'tsuyoshi', costumes: ['tsuyoshi:summer', 'akatsuki:summer'] });
    assert.equal(ep.arc, 'special'); assert.equal(c.BattleStoryData.arcs.special, '特別編'); assert.doesNotMatch(ep.summary, /財布/);
    for (const s of ep.scenes) assert.ok(fs.existsSync(path.join(root, c.BattleStoryAssets.backgrounds[s.background])));
    assert.deepEqual(clone(ep.scenes.filter(s => /^scene/.test(s.id)).map(s => s.background)), ['summer-station-morning', 'summer-beach-day', 'summer-beach-day', 'summer-beach-sheet', 'summer-beach-sheet', 'summer-beach-house-evening', 'summer-station-gate-evening']);
    for (const line of owner) {
        if (/真剣|真顔/.test(line.direction)) assert.equal(line.expression, 'normal');
        if (/驚く|目を丸く/.test(line.direction)) assert.equal(line.expression, 'surprised');
        if (/困惑|少し引く|青ざめる|泣きそう|少しムッと/.test(line.direction)) assert.equal(line.expression, 'troubled');
        if (/大喜び|テンションMAX/.test(line.direction)) assert.equal(line.expression, 'laugh');
        if (/得意げ/.test(line.direction)) assert.equal(line.expression, 'smile');
        if (/少し感動/.test(line.direction)) assert.equal(line.expression, 'gentle');
    }
    assert.equal(lines.find(l => l.direction === 'SE：ころん').se, 'pop');
    assert.equal(lines.filter(l => l.direction === '画面暗転' && l.effect === 'fadeOut').length, 2);
    assert.equal(lines.at(-5).effect, 'fadeOut');
    assert.deepEqual(clone(lines.filter(l => l.authoredBy === 'Codex').map(l => l.text)), [
        'まずは手札の材料をセットするんや。料理に要る材料をそろえてな',
        'そろった材料で料理を作ったら、その料理の点数が入るで',
        'イベントも使える。自分を助けたり、相手の邪魔したりするカードや',
        'ターンの終わりには、残った手札を上限まで減らして調整するんや',
        '先に目標の１０点を取った方が勝ち。ほな、やって覚えよか'
    ]);
    assert.deepEqual(clone(ep.scenes.find(s => s.id === 'lose').lines.map(l => l.text)), ['俺の勝ちやな', '今のは練習や！もう一回！', '荷物持つ話はどうなってん', '次勝ったらチャラや！']);
    assert.equal(warnings.length, 0);
});
test('100b episode7: replacement order, preceding staging and subsequent battle hook preserved', async t => {
    const { c } = summerRuntime(), ep = c.BattleStoryData.get('episode7');
    const scene = ep.scenes.find(s => s.id === 'scene3');
    await t.test('owner replacement source comparison', t => {
        if (!optionalSource(t, root, ['docs/story/episode7-fix-summer.md'])) return;
        assert.deepEqual(clone(scene.lines.slice(2).map(({ speaker, text, direction, position }) => ({ speaker, text, direction, position }))), summerReplacementSpeech());
    });
    assert.deepEqual(clone(scene.lines.slice(0, 2)), JSON.parse(read('tests/fixtures/episode7-scene3-before-summer.json')).slice(0, 2));
    assert.deepEqual(clone(ep.battle), { after: 'battle-start', player: 'chizuru', cpu: 'akatsuki', playerSkill: 'choose', cpuSkill: 'random', cpuPersonality: 'default' });
    assert.equal(ep.scenes.find(s => s.id === 'scene4').lines.at(-1).id, 'battle-start');
    assert.equal(ep.scenes.find(s => s.id === 'win').lines.at(-1).text, 'ルール知らんやつが何言うてんねん');
});
for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`100b ${label}: special gating requires every festival episode; locked direct starts have no writes`, async () => {
        for (const missing of [null, ...Object.keys(festivalProgress)]) {
            const progress = { ...festivalProgress }; if (missing) delete progress[missing];
            const r = summerRuntime({ mobile, save: { [PROGRESS_KEY]: JSON.stringify(progress) } }), { c } = r;
            const list = new r.Element(); c.StoryAdv.appendEpisodeCards(list);
            assert.deepEqual(list.children.filter(n => n.className === 'story-arc-heading').map(n => n.textContent), ['出会い・文化祭編', '特別編']);
            const card = list.children.at(-1); assert.equal(card.children.at(-1).disabled, !!missing);
            assert.equal(card.children[0].textContent, '特別編「夏だ！海だ！ポロリだー！」');
            await c.StoryAdv.start('special-summer');
            assert.equal(c.__advTest.S.active, !missing);
            if (missing) assert.deepEqual(r.persistentWrites, []);
            else assert.equal(c.lastStoryThemeCharacter, 'tsuyoshi');
        }
        const r = summerRuntime({ mobile, save: { [PROGRESS_KEY]: '{"episode10":true}' } });
        await r.c.StoryAdv.start('special-summer'); assert.equal(r.c.__advTest.S.active, false);
    });
    test(`100b ${label}: all special dialogue uses summer cells without an intro; normal episodes and per-line overrides retain normal`, async () => {
        const r = summerRuntime({ mobile, intros: true }), { c, elements, tick } = r;
        await c.StoryAdv.start('special-summer');
        const ep = c.BattleStoryData.get('special-summer'), S = c.__advTest.S;
        for (const scene of ep.scenes) for (const [index, line] of scene.lines.entries()) {
            if (!line.text) continue;
            Object.assign(S, { sceneId: scene.id, lineIndex: index, stage: scene.id === 'lose' ? 'lose' : 'post' });
            await c.__advTest.renderCurrent(); await tick(0);
            assert.equal(elements.get('adv-character-intro').hidden, true);
            if (line.speaker === 'narration' || line.monologue) assert.equal(elements.get('adv-face-icon').hidden, true);
            else assert.ok(elements.get('adv-icon-crop').children[0].src.includes(`${line.speaker}-summer-${line.expression}-alpha.webp?v=20261007-osananajimi105a`));
        }
        const files = c.__advTest.episodeImages(ep);
        assert.ok(files.filter(f => f.includes('/story/icons/')).every(f => f.includes('-summer-')));
        for (const id of ['tsuyoshi', 'akatsuki']) {
            assert.ok(c.BattleStoryAssets.iconPath(id, 'normal').endsWith(`${id}-normal-alpha.webp`));
            assert.ok(c.BattleStoryAssets.iconPath(id, 'smile', 'summer').endsWith(`${id}-summer-smile-alpha.webp`));
        }
        await c.StoryAdv.start('episode7'); c.__advTest.enterScene('scene3', 'pre');
        Object.assign(S, { lineIndex: 2 }); await c.__advTest.renderCurrent();
        assert.ok(elements.get('adv-icon-crop').children[0].src.includes('tsuyoshi-normal-alpha.webp'));
        c.BattleStoryData.register({ id: 'costume-override', costumes: { akatsuki: 'summer' }, scenes: [{ id: 's', lines: [{ speaker: 'akatsuki', costume: 'normal', text: '通常衣装' }] }] });
        await c.StoryAdv.start('costume-override');
        assert.ok(elements.get('adv-icon-crop').children[0].src.includes('akatsuki-normal-alpha.webp'));
        assert.ok(c.__advTest.episodeImages(c.BattleStoryData.get('costume-override')).includes('assets/battle-images/story/icons/akatsuki-normal-alpha.webp'));
    });
    for (const winner of ['player', 'cpu']) test(`100b ${label}: actual 剛 vs 暁 battle, summer HUD / skill / mode, ${winner} outcome, retry and rewards`, async () => {
        const r = summerRuntime({ mobile, main: true }), { c, elements, tick, Element } = r;
        await c.StoryAdv.start('special-summer'); await viewerSkip(r);
        assert.equal(c.choice.episode.id, 'special-summer'); c.choice.onStart('foodTrap');
        assert.deepEqual(clone(c.GameState.characterIds), { player: 'tsuyoshi', cpu: 'akatsuki' });
        assert.equal(c.GameState.players.player.selectedSkillKey, 'foodTrap'); assert.equal(c.GameState.achievementStory, true);
        r.load(mobile ? 'mobile/render-sp.js' : 'render.js');
        const playerIcon = new Element(), cpuIcon = new Element();
        c.document.querySelector = selector => selector === '.player-icon' ? playerIcon : selector === '.cpu-icon' ? cpuIcon : null;
        c.applyCharacterSkins(); c.updateCharacterFaces();
        for (const [side, id, icon] of [['player', 'tsuyoshi', playerIcon], ['cpu', 'akatsuki', cpuIcon]]) {
            assert.ok(c.getSkillCutinImagePathForSide(side).includes(`${id}-summer-smile-alpha.webp`));
            assert.ok(c.getBattleModeCutinImagePathForSide(side).includes(`${id}-summer-laugh-alpha.webp`));
            assert.ok(icon.children[0].getAttribute('src').includes(`${id}-summer-normal-alpha.webp`));
        }
        c.endGame(winner); assert.equal(c.__advTest.S.pending.stage, winner === 'player' ? 'post' : 'lose');
        assert.equal(c.StoryAdv.finishBattleReturn(), true); await tick(0);
        if (winner === 'cpu') {
            await viewerSkip(r);
            assert.deepEqual(elements.get('adv-ending').children.map(b => b.textContent), ['もう一度挑戦', '勝ったことにして進める', 'ストーリー選択へ戻る']);
            elements.get('adv-ending').children[0].onclick(); await tick(0);
            assert.equal(c.__advTest.S.stage, 'battle'); c.choice.onStart('foodTrap'); c.endGame('cpu'); c.StoryAdv.finishBattleReturn(); await tick(0);
            await viewerSkip(r); elements.get('adv-ending').children[1].onclick(); await tick(0);
            assert.equal(c.__advTest.S.continuedAsWin, true);
        }
        await viewerSkip(r);
        assert.equal(c.__advTest.S.stage, 'clear');
        assert.equal(c.BattleStoryProgress.load()['special-summer'], true);
        assert.equal(c.GameState.storyEpisodeId, null);
        assert.ok(!c.BattleImages.expressionPath('akatsuki', 'normal').includes('-summer-'));
        assert.deepEqual(elements.get('adv-ending').children.slice(0, 4).map(n => n.textContent), [
            '特別編 CLEAR', '夏だ！海だ！ポロリだー！',
            'NEW CHARACTER 剛 — プレイアブルキャラクターとして剛が使用可能になりました',
            'COSTUME COLLECTION 剛『サマービーチ』／暁『サマービーチ』'
        ]);
    });
    for (const route of ['win', 'lose', 'skip']) test(`100b ${label}: viewer special ${route} route reads all outcomes and rewards with zero storage writes`, async () => {
        const r = summerRuntime({ mobile, viewer: true }), { c, elements } = r, before = [...r.store];
        const list = elements.get('story-episode-list');
        assert.deepEqual(list.children.filter(n => n.className === 'story-arc-heading').map(n => n.textContent), ['再会編', '出会い・文化祭編', '特別編']);
        assert.equal(list.children.filter(n => n.className === 'story-episode-card').length, 11);
        await c.StoryAdv.start('special-summer'); await viewerSkip(r);
        assert.deepEqual(elements.get('adv-ending').children.map(b => b.textContent), viewerChoices);
        elements.get('adv-ending').children[['win', 'lose', 'skip'].indexOf(route)].onclick(); await r.tick(0);
        if (route === 'lose') { await viewerSkip(r); elements.get('adv-ending').children[0].onclick(); await r.tick(0); }
        await viewerSkip(r); assert.equal(c.__advTest.S.stage, 'clear');
        assert.equal(elements.get('adv-ending').children[0].textContent, '特別編 CLEAR');
        assertViewerUnchanged(r, before);
    });
}
test('100b entry pages load special after episode10 and bump changed script keys only', () => {
    for (const [page, prefix, main] of [['web.html', '', 'main.js'], ['mobile/mobile.html', '../', 'main-sp.js']]) {
        const html = read(page), special = html.indexOf(prefix + SUMMER_FILE + '?v=20261007-osananajimi105a');
        assert.ok(special > html.indexOf('story-data/episode10.js?v=')); assert.ok(special < html.indexOf('story-adv.js?v='));
        for (const script of ['story-data/characters.js', 'story-data/registry.js', 'story-data/episode7.js', 'story-viewer.js', 'story-adv.js', 'battle-images.js']) assert.ok(html.includes(prefix + script + '?v=' + (script === 'battle-images.js' ? '20261007-osananajimi105a' : ['story-data/characters.js', 'story-adv.js', 'story-data/registry.js'].includes(script) ? '20261007-osananajimi105a' : script === 'story-data/episode7.js' ? '20261006-summer100b' : '20261007-osananajimi105a')));
        assert.ok(html.includes(main + '?v=20261007-osananajimi105a'));
    }
    const manifest = JSON.parse(read('assets/audio-pack/manifest.json'));
    assert.ok(manifest.tracks['theme-tsuyoshi']);
    assert.ok(fs.existsSync(path.join(root, 'assets/audio-pack', manifest.tracks['theme-tsuyoshi'].file)));
});

for (const mobile of [false, true]) for (const viewer of [false, true]) test(`100c ${mobile ? 'phone' : 'PC'} ${viewer ? 'viewer' : 'normal'}: real special CLEAR unlocks 剛/wardrobe only in normal save`, async () => {
    const r = summerRuntime({mobile, viewer, main: true}), {c, load} = r;
    load('profile.js');
    assert.equal(c.isPlayableCharacterUnlocked('tsuyoshi'), false);
    assert.equal(c.getCharacterCostumeOptions('akatsuki').length, 1);
    const before = [...r.store];
    await c.StoryAdv.start('special-summer');
    c.__advTest.enterScene('win', 'post'); c.__advTest.clearEpisode();
    assert.equal(c.__advTest.S.stage, 'clear');
    assert.equal(c.isPlayableCharacterUnlocked('tsuyoshi'), !viewer);
    assert.equal(c.getCharacterCostumeOptions('tsuyoshi').length, viewer ? 1 : 2);
    if (viewer) { assert.equal(c.selectCharacterCostume('tsuyoshi', 'summer'), false); assertViewerUnchanged(r, before); }
    else {
        assert.equal(c.BattleStoryProgress.load()['special-summer'], true);
        assert.equal(c.selectCharacterCostume('tsuyoshi', 'summer'), true);
        c.updateUserBasicSettings({favoriteCharacterId: 'tsuyoshi'});
        const again = summerRuntime({mobile, main: true, save: Object.fromEntries(r.store)}); again.load('profile.js');
        assert.equal(again.c.getPreferredStartCharacterId(), 'tsuyoshi');
        assert.equal(again.c.getSelectedCharacterCostume('tsuyoshi'), 'summer');
        again.c.setCharacterChoice('tsuyoshi'); again.c.beginMatchByRole('先攻');
        assert.equal(again.c.GameState.characterIds.player, 'tsuyoshi');
        assert.equal(again.c.GameState.storyEpisodeId, null);
        for (const side of ['player', 'cpu']) {
            const participant = again.c.GameState.players[side];
            assert.equal(again.c.getCurrentTotalHandCount(participant), again.c.getTargetTotalHandSize(participant));
        }
        assert.match(again.c.getSkillCutinImagePathForSide('player'), /tsuyoshi-summer-smile/);
        assert.doesNotMatch(again.c.getSkillCutinImagePathForSide('cpu'), /-summer-/);
    }
});

const KYUDO_FILE = 'story-data/episode-special-kyudo.js';
function kyudoRuntime(options = {}) {
    const r = runtime({...options, save:{[PROGRESS_KEY]:JSON.stringify(festivalProgress),...options.save}});
    for (const f of [SUMMER_FILE,HALLOWEEN_FILE,KYUDO_FILE]) r.load(f);
    r.c.playStoryBGM = (character,bgm) => { r.c.lastStoryBgm={character,bgm}; };
    if (options.viewer) {
        r.c.document.body.innerHTML=read(options.mobile?'mobile/mobile.html':'web.html');
        r.c.__legacyTest.init(); r.elements.get('character-notice-confirm').listeners.click();
    }
    return r;
}
test('102b owner speech, monologue, two provisional addresses and staging stay verbatim; kyudo assets, hit and blackout exist', async t => {
    const r=kyudoRuntime(),{c,warnings}=r,ep=c.BattleStoryData.get('special-kyudo'),lines=ep.scenes.flatMap(s=>s.lines);
    await t.test('owner source comparison', t => {
        if(!optionalSource(t,root,['docs/story/special-kyudo-scenario.md']))return;
        const expected=[],directions=[];let monologue=false;
        for(const raw of read('docs/story/special-kyudo-scenario.md').split('## SCENE 1')[1].split('## 特別編 CLEAR')[0].split(/\r?\n/)) {
            const line=raw.trim(),speech=line.match(/^(（[^）]+）)?(【[^】]+】)?(結月|拓海|舞依)「(.*?)」/);
            if(line==='結月モノローグ：')monologue=true;
            if(speech){monologue=false;expected.push({speaker:{結月:'yuzuki',拓海:'takumi',舞依:'mai'}[speech[3]],text:speech[4].replace('結月先輩','結月さん')});if(speech[2])directions.push(speech[2]);}
            else if(monologue&&/^「.*」$/.test(line))expected.push({speaker:'yuzuki',text:line.slice(1,-1)});
        }
        assert.deepEqual(clone(lines.filter(l=>l.speaker!=='narration'&&!l.authoredBy).map(({speaker,text})=>({speaker,text}))),expected);
        assert.deepEqual(clone(lines.filter(l=>l.direction?.startsWith('【')).map(l=>l.direction)),directions);
    });
    assert.equal(ep.title,'恋の的はひとつ？');assert.deepEqual(clone(ep.costumes),{yuzuki:'kyudo',takumi:'kyudo',mai:'kyudo'});
    assert.equal(lines.filter(l=>l.addressProvisional&&l.text.includes('結月さん')).length,2);
    assert.equal(lines.filter(l=>l.monologue&&l.speaker==='yuzuki').length,7);
    assert.equal(lines.find(l=>l.text==='やっぱりはっきりしない！').offscreen,true);
    assert.equal(lines.filter(l=>l.se==='thud').length,2);assert.ok(lines.some(l=>l.effect==='fadeOut'&&l.hide==='all'));
    for(const id of ['yuzuki','takumi','mai'])for(const cell of Object.keys(c.BattleStoryAssets.characters[id].icons)){
        const file=c.BattleStoryAssets.iconPath(id,cell,'kyudo');assert.ok(file.includes('-kyudo-'));assert.ok(fs.existsSync(path.join(root,file)));
    }
    assert.deepEqual(warnings,[]);
    const regular=c.BattleStoryData.register({id:'yuzuki-icon-contract',scenes:[{id:'default',lines:[{speaker:'yuzuki',expression:'smile',text:'icon contract'}]}]});
    assert.equal(regular.scenes[0].lines[0].expression,'smile');assert.deepEqual(warnings,[]);
});
for(const mobile of [false,true]) {
    const label=mobile?'phone':'PC';
    test(`102b ${label}: normal unlock requires every festival clear; direct start/resume remain locked, specials order is preserved`,async()=>{
        for(const missing of Array.from({length:7},(_,i)=>'episode'+(i+4))) {
            const progress={...festivalProgress};delete progress[missing];const r=kyudoRuntime({mobile,save:{[PROGRESS_KEY]:JSON.stringify(progress)}});
            const list=new r.Element();r.c.StoryAdv.appendEpisodeCards(list);
            assert.deepEqual(list.children.filter(n=>n.className==='story-episode-card').slice(-3).map(n=>n.children[0].textContent),['特別編「夏だ！海だ！ポロリだー！」','特別編「Trick or Treat？」','特別編「恋の的はひとつ？」']);
            assert.equal(list.children.at(-1).children.at(-1).disabled,true);
            await r.c.StoryAdv.start('special-kyudo');await r.c.StoryAdv.start('special-kyudo',true);assert.equal(r.c.__advTest.S.active,false);assert.deepEqual(r.persistentWrites,[]);
        }
    });
    for(const viewer of [false,true])test(`102b ${label} ${viewer?'viewer':'normal'}: first on-screen 結月 gets one name-only introduction with exact SHORT, including replay`,async()=>{
        const r=kyudoRuntime({mobile,viewer,intros:true}),{c,elements,tick}=r,t=c.__advTest;
        for(let replay=0;replay<2;replay++){
            const pending=c.StoryAdv.start('special-kyudo');await tick(0);
            const intro=elements.get('adv-character-intro');assert.equal(intro.hidden,false);assert.equal(intro.dataset.actor,'yuzuki');
            assert.equal(intro.querySelector('.adv-intro-copy').querySelector('.adv-intro-name').textContent,'結月');assert.equal(intro.querySelector('.adv-intro-notice').textContent,c.CharacterNotice.shortText);
            assert.ok(intro.querySelector('.adv-intro-art').src.includes('yuzuki-kyudo-standing-alpha.webp?v=20261007-osananajimi105a'));
            t.closeIntro();await tick(100);await pending;
            t.stageLine(t.S.episode.scenes[0].lines[0],'scene1',0);assert.equal(t.S.entrances.length,0);
            for(const scene of t.S.episode.scenes)for(const [index,line]of scene.lines.entries()) {t.stageLine(line,scene.id,index);assert.equal(t.S.entrances.length,0);}
            c.StoryAdv.stop();
        }
    });
    for(const skip of [false,true])test(`102b ${label}: explicit ${skip?'skip':'read'} rule explanation reaches scene6; resume reconstructs the chosen log route`,async()=>{
        const r=kyudoRuntime({mobile}),{c,elements,tick}=r,t=c.__advTest;await c.StoryAdv.start('special-kyudo');
        t.S.sceneId='scene5';t.S.lineIndex=t.S.episode.scenes.find(s=>s.id==='scene5').lines.length-1;await t.renderCurrent();
        assert.deepEqual(elements.get('adv-ending').children.map(n=>n.textContent),['ルール説明を読む','ルール説明をとばす']);
        elements.get('adv-ending').children[skip?1:0].onclick();await tick(0);
        assert.equal(elements.get('adv-ending').hidden,true);assert.equal(t.S.sceneId,skip?'scene6':'rule-explanation');
        if(!skip){for(let i=0;i<5;i++){t.advance();await tick(0);}assert.equal(t.S.sceneId,'scene6');}
        const again=kyudoRuntime({mobile,save:Object.fromEntries(r.store)});await again.c.StoryAdv.start('special-kyudo',true);
        const explanation=t.S.episode.scenes.find(s=>s.id==='rule-explanation').lines;
        assert.deepEqual(clone(explanation.map(l=>l.text)),[
            'まずは手札の材料をセットして、料理に必要な材料をそろえてください',
            '材料がそろったら料理を作れます。完成した料理の点数が入ります',
            'イベントは自分を助けたり、相手の邪魔をしたりするカードです。使いどころを考えてください',
            'ターンの終わりには、残った手札を上限まで減らして調整します',
            '先に目標の１０点を取った方が勝ちです。では、実際にやってみましょう'
        ]);assert.ok(explanation.every(l=>l.speaker==='mai'));
        assert.equal(again.c.__advTest.S.backlog.some(l=>l.text===explanation[0].text),!skip);
    });
    for(const winner of ['player','cpu'])test(`102b ${label}: actual 結月 vs 舞依 CPU initialization, costume faces/cutins, ${winner}, retry and win bypass, CLEAR unlock/save`,async()=>{
        const r=kyudoRuntime({mobile,main:true}),{c,elements,tick,Element}=r;r.load('profile.js');
        assert.equal(c.isPlayableCharacterUnlocked('yuzuki'),false);await c.StoryAdv.start('special-kyudo');await viewerSkip(r);c.choice.onStart('foodTrap');
        assert.deepEqual(clone(c.GameState.characterIds),{player:'yuzuki',cpu:'mai'});assert.equal(c.GameState.players.player.selectedSkillKey,'foodTrap');
        r.load(mobile?'mobile/render-sp.js':'render.js');c.updateUI=()=>{};
        const p=new Element(),cpu=new Element(),board=new Element();elements.set('game-container',board);
        c.document.querySelector=s=>s==='.player-icon'?p:s==='.cpu-icon'?cpu:null;c.applyBackgroundDesign('default');assert.match(board.style['--bg-design-image'],/kyudo-rest-area/);
        c.applyCharacterSkins();c.updateCharacterFaces();
        for(const [side,id,icon]of [['player','yuzuki',p],['cpu','mai',cpu]]){assert.match(icon.children[0].getAttribute('src'),new RegExp(id+'-kyudo-normal-alpha'));assert.match(c.getSkillCutinImagePathForSide(side),new RegExp(id+'-kyudo-smile'));assert.match(c.getBattleModeCutinImagePathForSide(side),new RegExp(id+'-kyudo-laugh'));}
        c.endGame(winner);assert.equal(c.StoryAdv.finishBattleReturn(),true);await tick(0);assert.deepEqual(c.lastStoryBgm,{character:'yuzuki',bgm:'story'});
        if(winner==='cpu'){
            await viewerSkip(r);assert.deepEqual(elements.get('adv-ending').children.map(n=>n.textContent),['もう一度挑戦','勝ったことにして進める','ストーリー選択へ戻る']);
            elements.get('adv-ending').children[0].onclick();await tick(0);c.choice.onStart('foodTrap');c.endGame('cpu');c.StoryAdv.finishBattleReturn();await tick(0);await viewerSkip(r);elements.get('adv-ending').children[1].onclick();await tick(0);assert.equal(c.__advTest.S.continuedAsWin,true);
        }
        await viewerSkip(r);assert.equal(c.__advTest.S.stage,'clear');assert.equal(c.isPlayableCharacterUnlocked('yuzuki'),true);
        assert.deepEqual(elements.get('adv-ending').children.slice(0,5).map(n=>n.textContent),['特別編 CLEAR','恋の的はひとつ？','NEW CHARACTER 結月 — プレイアブルキャラクターとして結月が使用可能になりました','STORY CHARACTER — 結月がキャラクター一覧に追加されました','COSTUME COLLECTION 結月・拓海・舞依『弓道着』']);
        for(const id of ['yuzuki','takumi','mai'])assert.equal(c.selectCharacterCostume(id,'kyudo'),true);
        c.updateUserBasicSettings({favoriteCharacterId:'yuzuki'});const again=kyudoRuntime({mobile,main:true,save:Object.fromEntries(r.store)});again.load('profile.js');
        assert.equal(again.c.getPreferredStartCharacterId(),'yuzuki');assert.equal(again.c.getSelectedCharacterCostume('yuzuki'),'kyudo');
        again.c.setCharacterChoice('yuzuki');again.c.beginMatchByRole('先攻');assert.equal(again.c.GameState.characterIds.player,'yuzuki');assert.equal(again.c.GameState.storyEpisodeId,null);
        assert.match(again.c.getSkillCutinImagePathForSide('player'),/yuzuki-kyudo-smile/);assert.doesNotMatch(again.c.getSkillCutinImagePathForSide('cpu'),/-kyudo-/);
    });
    for(const route of ['win','lose','skip'])test(`102b ${label}: viewer ${route} includes three specials; reads kyudo without unlock, storage or a battle`,async()=>{
        const r=kyudoRuntime({mobile,viewer:true,main:true}),{c,elements}=r;r.load('profile.js');const before=[...r.store];
        const cards=elements.get('story-episode-list').children.filter(n=>n.className==='story-episode-card');assert.equal(cards.length,13);assert.equal(cards.at(-1).children[0].textContent,'特別編「恋の的はひとつ？」');
        await c.StoryAdv.start('special-kyudo');await viewerSkip(r);elements.get('adv-ending').children[['win','lose','skip'].indexOf(route)].onclick();await r.tick(0);
        if(route==='lose'){await viewerSkip(r);elements.get('adv-ending').children[0].onclick();await r.tick(0);}
        await viewerSkip(r);assert.equal(c.__advTest.S.stage,'clear');assert.equal(c.isPlayableCharacterUnlocked('yuzuki'),false);assert.equal(c.selectCharacterCostume('mai','kyudo'),false);assertViewerUnchanged(r,before);
    });
}
test('102b both pages load kyudo after summer/Halloween; changed modules use the requested cache key',()=>{
    for(const [file,prefix]of [['web.html',''],['mobile/mobile.html','../']]){
        const html=read(file),index=html.indexOf(prefix+KYUDO_FILE+'?v=20261007-text105b');assert.ok(index>html.indexOf(prefix+HALLOWEEN_FILE+'?v='));assert.ok(index<html.indexOf(prefix+'story-adv.js?v='));
        for(const script of ['character-themes.js','story-data/characters.js','story-data/character-intros.js','story-data/icon-metrics.js','story-data/portrait-metrics.js','profile.js','story-adv.js'])assert.ok(html.includes(script+'?v=20261007-osananajimi105a'));
    }
});


const OSANANA_FILES = [1,2].map(n => `story-data/episode-special-osananajimi-${n}.js`);
const osananaProgress = {...festivalProgress,episode1:true,episode2:true,episode3:true,'special-summer':true,'special-halloween':true,'special-kyudo':true};
function osananaRuntime(options={}) {
    const r=runtime({...options,save:{[PROGRESS_KEY]:JSON.stringify(osananaProgress),...options.save}});
    for(const f of [SUMMER_FILE,HALLOWEEN_FILE,KYUDO_FILE,...OSANANA_FILES])r.load(f);
    r.c.playStoryBGM=(character,bgm)=>{r.c.lastStoryBgm={character,bgm};};
    if(options.viewer){r.c.document.body.innerHTML=read(options.mobile?'mobile/mobile.html':'web.html');r.c.__legacyTest.init();r.elements.get('character-notice-confirm').listeners.click();}
    return r;
}
test('105a owner dialogue, directions, narration and monologue remain VERBATIM; no front battle and exact routes/rewards',async t=>{
    const r=osananaRuntime(),{c,warnings}=r;
    await t.test('owner original plus agreed continuity comparison',t=>{
        if(!optionalSource(t,root,['docs/story/special-osananajimi-scenario.md']))return;
        const source=read('docs/story/special-osananajimi-scenario.md'),names={千鶴:'chizuru',栞那:'kanna',舞依:'mai',拓海:'takumi',暁:'akatsuki',剛:'tsuyoshi',龍太:'ryuta',結月:'yuzuki'};
        for(const part of [1,2]){
            const ep=c.BattleStoryData.get('special-osananajimi-'+part),lines=ep.scenes.flatMap(s=>s.lines),body=source.split(part===1?'# 前編「':'# 後編「')[1].split(part===1?'\n---':'## 特別編 CLEAR')[0];
            const speech=[],directions=[],narration=[];let monologue=false;
            for(const raw of body.split(/\r?\n/)){
                const line=raw.trim(),m=line.match(/^(【[^】]+】)?(千鶴|栞那|舞依|拓海|暁|剛|龍太|結月)「(.*?)」$/);
                if(line==='龍太モノローグ：')monologue=true;
                if(m){monologue=false;speech.push({speaker:names[m[2]],text:m[3]});if(m[1])directions.push(m[1]);}
                else if(monologue&&/^「.*」$/.test(line))speech.push({speaker:'ryuta',text:line.slice(1,-1)});
                if(/^（.*）$/.test(line)&&!line.startsWith('（簡易チュートリアル：')&&!/少し間/.test(line))narration.push(line.slice(1,-1));
            }
            assert.deepEqual(clone(lines.filter(l=>l.speaker!=='narration'&&!l.authoredBy).map(({speaker,text})=>({speaker,text}))),speech);
            assert.deepEqual(clone(lines.filter(l=>l.direction?.startsWith('【')).map(l=>l.direction)),directions);
            for(const text of narration)assert.ok(lines.some(l=>l.speaker==='narration'&&l.text===text),text);
        }
    });
    const front=c.BattleStoryData.get('special-osananajimi-1'),back=c.BattleStoryData.get('special-osananajimi-2');
    assert.equal(front.conversationOnly,true);assert.equal(front.battle,undefined);assert.ok(front.scenes.every(s=>s.lines.every(l=>!l.battle)));assert.equal(front.clear.rewards,undefined);
    assert.deepEqual(clone(front.scenes.map(s=>s.background)),['big-park-evening','big-park-evening','big-park-evening','big-park-bench-evening','big-park-evening','big-park-evening','big-park-evening','big-park-evening']);
    const ending=front.scenes.at(-1).lines;assert.equal(ending.at(-2).effect,'fadeOut');assert.equal(ending.at(-1).text,'TO BE CONTINUED');assert.equal(ending.at(-1).card,true);
    const impact=ending.find(l=>l.text==='ドンッ！！');assert.equal(impact.se,'impact');assert.equal(impact.screen,'screenShake');
    assert.deepEqual(clone(back.battle),{after:'battle-start',background:'big-park-bench-evening',player:'ryuta',cpu:'akatsuki',playerSkill:'choose',cpuSkill:'random',cpuPersonality:'default'});
    assert.equal(back.scenes.find(s=>s.id==='win').lines[0].caption,'WINNER 龍太');
    assert.deepEqual(clone(back.scenes.find(s=>s.id==='lose').lines.map(l=>l.text)),['得意分野や言うたやろ','……もう一回だ','何回でもええで','龍太、熱くなってるやん！']);
    assert.equal(back.scenes.flatMap(s=>s.lines).filter(l=>l.monologue&&l.speaker==='ryuta').length,12);
    assert.deepEqual(clone(back.clear.rewards),{unlockCharacter:'ryuta'});assert.equal(back.clear.storyClear,'STORY CLEAR 幼馴染編『気に食わねぇ奴』『負けられない男』');assert.deepEqual(warnings,[]);
});
for(const mobile of [false,true]){
    const label=mobile?'phone':'PC';
    test(`105a ${label}: front needs all 13 clears; back only needs front, direct start/resume and labels stay gated`,async()=>{
        for(const missing of Object.keys(osananaProgress)){
            const progress={...osananaProgress};delete progress[missing];const r=osananaRuntime({mobile,save:{[PROGRESS_KEY]:JSON.stringify(progress)}});
            await r.c.StoryAdv.start('special-osananajimi-1');await r.c.StoryAdv.start('special-osananajimi-1',true);assert.equal(r.c.__advTest.S.active,false);assert.deepEqual(r.persistentWrites,[]);
            assert.equal(r.c.BattleStoryData.isUnlocked(r.c.BattleStoryData.get('special-osananajimi-1'),progress),false,missing);
        }
        const r=osananaRuntime({mobile});await r.c.StoryAdv.start('special-osananajimi-2');assert.equal(r.c.__advTest.S.active,false);
        const list=new r.Element();r.c.StoryAdv.appendEpisodeCards(list);assert.deepEqual(list.children.filter(n=>n.className==='story-episode-card').slice(-5).map(n=>n.children.find(x=>x.className==='story-special-label').textContent),['夏休み編','ハロウィン編','弓道編','幼馴染編 前編','幼馴染編 後編']);
        assert.equal(r.c.BattleStoryData.isUnlocked(r.c.BattleStoryData.get('special-osananajimi-2'),{'special-osananajimi-1':true}),true);
    });
    for(const viewer of [false,true])test(`105a ${label} ${viewer?'viewer':'normal'}: front reads all lines, black card then front CLEAR, resume and no battle/reward`,async()=>{
        const r=osananaRuntime({mobile,viewer}),{c,elements,tick,calls}=r,t=c.__advTest;r.load('profile.js');const before=[...r.store];
        await c.StoryAdv.start('special-osananajimi-1');assert.equal(t.S.stage,'post');
        let sawCard=false;
        for(let i=0;i<300&&t.S.stage!=='clear';i++){
            if(t.S.text==='TO BE CONTINUED'&&!t.S.busy){sawCard=true;assert.equal(elements.get('adv-effect').className,'adv-effect story-card');assert.equal(elements.get('adv-effect').children[0].textContent,'TO BE CONTINUED');
                if(!viewer){const again=osananaRuntime({mobile,save:Object.fromEntries(r.store)});await again.c.StoryAdv.start('special-osananajimi-1',true);assert.equal(again.c.__advTest.S.text,'TO BE CONTINUED');assert.equal(again.c.__advTest.S.sceneId,'scene8');}
            }
            t.advance();await tick(1800);
        }
        assert.equal(sawCard,true);assert.equal(t.S.stage,'clear');assert.deepEqual(elements.get('adv-ending').children.map(n=>n.textContent),['前編 CLEAR『気に食わねぇ奴』',viewer?'ビューア一覧へ戻る':'ストーリー選択へ戻る']);
        assert.equal(c.isPlayableCharacterUnlocked('ryuta'),false);assert.equal(calls.includes('skill-choice'),false);assert.equal(calls.includes('init-normal'),false);
        if(viewer)assertViewerUnchanged(r,before);else{assert.equal(c.BattleStoryProgress.load()['special-osananajimi-1'],true);assert.equal(c.BattleStoryData.isUnlocked(c.BattleStoryData.get('special-osananajimi-2'),c.BattleStoryProgress.load()),true);}
    });
    test(`105a ${label}: front skip ends through blackout and TO BE CONTINUED before clear`,async()=>{
        const r=osananaRuntime({mobile}),t=r.c.__advTest;await r.c.StoryAdv.start('special-osananajimi-1');await viewerSkip(r);assert.equal(t.S.text,'TO BE CONTINUED');assert.equal(t.S.stage,'post');t.advance();await r.tick(0);assert.equal(t.S.stage,'clear');assert.equal(r.calls.includes('skill-choice'),false);
    });
    test(`105a ${label}: stale battle/lose/pre resume cannot send the conversation-only front into a battle`,async()=>{
        for(const stage of ['pre','battle','lose']){
            const save={[ADV_KEY]:JSON.stringify({version:1,auto:false,resume:{episodeId:'special-osananajimi-1',sceneId:'scene8',lineIndex:0,stage}})};
            const r=osananaRuntime({mobile,save}),t=r.c.__advTest;
            await r.c.StoryAdv.start('special-osananajimi-1',true);assert.equal(t.S.stage,'post');assert.equal(t.S.sceneId,'scene8');
            await viewerSkip(r);assert.equal(t.S.text,'TO BE CONTINUED');t.advance();await r.tick(0);
            assert.equal(t.S.stage,'clear');assert.equal(r.calls.includes('skill-choice'),false);assert.equal(r.calls.includes('init-normal'),false);
        }
    });
    for(const viewer of [false,true])test(`105a ${label} ${viewer?'viewer':'normal'}: 龍太 introduction only on first 千鶴 line, name and SHORT, replay and no later introductions`,async()=>{
        const r=osananaRuntime({mobile,viewer,intros:true}),{c,elements,tick}=r,t=c.__advTest;
        for(let replay=0;replay<2;replay++){
            await c.StoryAdv.start('special-osananajimi-1');t.S.lineIndex=22;const pending=t.renderCurrent();await tick(0);
            const intro=elements.get('adv-character-intro');assert.equal(intro.hidden,false);assert.equal(intro.dataset.actor,'ryuta');assert.equal(intro.querySelector('.adv-intro-copy').querySelector('.adv-intro-name').textContent,'龍太');assert.equal(intro.querySelector('.adv-intro-notice').textContent,c.CharacterNotice.shortText);assert.match(intro.querySelector('.adv-intro-art').src,/ryuta-standing-alpha.webp\?v=20261007-osananajimi105a/);
            assert.equal(intro.querySelector('.adv-intro-title'),null);t.closeIntro();await tick(100);await pending;assert.equal(t.S.text,'千鶴');
            for(const ep of [t.S.episode,c.BattleStoryData.get('special-osananajimi-2')])for(const scene of ep.scenes)for(const [index,line]of scene.lines.entries()){t.stageLine(line,scene.id,index);assert.equal(t.S.entrances.length,0);}
            c.StoryAdv.stop();
        }
    });
    for(const skip of [false,true])test(`105a ${label}: casual 千鶴 and polite 舞依 explanation ${skip?'skip':'read'} keeps route after reload`,async()=>{
        const r=osananaRuntime({mobile,save:{[PROGRESS_KEY]:JSON.stringify({'special-osananajimi-1':true})}}),{c,elements,tick}=r,t=c.__advTest;await c.StoryAdv.start('special-osananajimi-2');
        t.S.sceneId='scene4';t.S.lineIndex=t.S.episode.scenes.find(s=>s.id==='scene4').lines.length-1;await t.renderCurrent();assert.deepEqual(elements.get('adv-ending').children.map(n=>n.textContent),['ルール説明を読む','ルール説明をとばす']);elements.get('adv-ending').children[skip?1:0].onclick();await tick(0);
        if(!skip)for(let i=0;i<5;i++){t.advance();await tick(0);}
        assert.equal(t.S.sceneId,'scene4-after');const explanation=t.S.episode.scenes.find(s=>s.id==='rule-explanation').lines;assert.deepEqual(clone(explanation.map(l=>l.speaker)),['chizuru','mai','chizuru','mai','chizuru']);
        assert.deepEqual(clone(explanation.map(l=>l.text)),[
            '手札の材料をセットして、料理に必要な材料をそろえるんだよ',
            '材料がそろったら料理を作れます。完成した料理の点数が入ります',
            'イベントは自分を助けたり、相手の邪魔をしたりできるよ。使うタイミングを考えてね',
            'ターンの終わりには、残った手札を上限まで減らして調整してください',
            '先に１０点を取った方が勝ち。じゃあ、やってみよう！'
        ]);
        const again=osananaRuntime({mobile,save:Object.fromEntries(r.store)});await again.c.StoryAdv.start('special-osananajimi-2',true);assert.equal(again.c.__advTest.S.backlog.some(l=>l.text===explanation[0].text),!skip);
    });
    for(const winner of ['player','cpu'])test(`105a ${label}: real 龍太 vs 暁 CPU, bench background, ${winner}, retry/bypass, WINNER and playable CLEAR`,async()=>{
        const r=osananaRuntime({mobile,main:true,save:{[PROGRESS_KEY]:JSON.stringify({'special-osananajimi-1':true})}}),{c,elements,tick,Element}=r,t=c.__advTest;r.load('profile.js');await c.StoryAdv.start('special-osananajimi-2');await viewerSkip(r);c.choice.onStart('foodTrap');
        assert.deepEqual(clone(c.GameState.characterIds),{player:'ryuta',cpu:'akatsuki'});assert.equal(c.GameState.players.player.selectedSkillKey,'foodTrap');r.load(mobile?'mobile/render-sp.js':'render.js');c.updateUI=()=>{};
        const p=new Element(),cpu=new Element(),board=new Element();elements.set('game-container',board);c.document.querySelector=s=>s==='.player-icon'?p:s==='.cpu-icon'?cpu:null;c.applyBackgroundDesign('default');assert.match(board.style['--bg-design-image'],/big-park-bench-evening/);c.applyCharacterSkins();c.updateCharacterFaces();assert.match(p.children[0].getAttribute('src'),/ryuta-normal-alpha/);assert.match(c.getSkillCutinImagePathForSide('player'),/ryuta-smile-alpha/);assert.match(c.getBattleModeCutinImagePathForSide('player'),/ryuta-laugh-alpha/);
        c.endGame(winner);assert.equal(c.StoryAdv.finishBattleReturn(),true);await tick(0);
        if(winner==='cpu'){await viewerSkip(r);assert.deepEqual(elements.get('adv-ending').children.map(n=>n.textContent),['もう一度挑戦','勝ったことにして進める','ストーリー選択へ戻る']);elements.get('adv-ending').children[0].onclick();await tick(0);c.choice.onStart('foodTrap');c.endGame('cpu');c.StoryAdv.finishBattleReturn();await tick(0);await viewerSkip(r);elements.get('adv-ending').children[1].onclick();await tick(0);assert.equal(t.S.continuedAsWin,true);}
        assert.equal(t.S.sceneId,'win');assert.equal(elements.get('adv-effect').children[1].textContent,'WINNER 龍太');t.advance();await tick(0);assert.equal(elements.get('adv-effect').className,'adv-effect');await viewerSkip(r);assert.equal(t.S.stage,'clear');assert.equal(c.isPlayableCharacterUnlocked('ryuta'),true);
        assert.deepEqual(elements.get('adv-ending').children.slice(0,4).map(n=>n.textContent),['特別編 CLEAR','負けられない男','NEW CHARACTER 龍太 — プレイアブルキャラクターとして龍太が使用可能になりました','STORY CLEAR 幼馴染編『気に食わねぇ奴』『負けられない男』']);assert.equal(c.BattleStoryProgress.load()['special-osananajimi-2'],true);
    });
    for(const route of ['win','lose','skip'])test(`105a ${label}: viewer back ${route}, all 15 stories, no progress or character unlock`,async()=>{
        const r=osananaRuntime({mobile,viewer:true,main:true}),{c,elements,tick}=r;r.load('profile.js');const before=[...r.store];const cards=elements.get('story-episode-list').children.filter(n=>n.className==='story-episode-card');assert.equal(cards.length,15);assert.equal(cards.at(-1).children[0].textContent,'特別編「負けられない男」');
        await c.StoryAdv.start('special-osananajimi-2');await viewerSkip(r);elements.get('adv-ending').children[['win','lose','skip'].indexOf(route)].onclick();await tick(0);if(route==='lose'){await viewerSkip(r);elements.get('adv-ending').children[0].onclick();await tick(0);}await viewerSkip(r);assert.equal(c.__advTest.S.stage,'clear');assert.equal(c.isPlayableCharacterUnlocked('ryuta'),false);assert.equal(c.selectCharacterCostume('ryuta','default'),false);assertViewerUnchanged(r,before);
    });
}
test('105a both pages register front/back after kyudo; all changed assets use the requested cache key',()=>{
    for(const [page,prefix]of [['web.html',''],['mobile/mobile.html','../']]){const html=read(page);assert.ok(html.indexOf(OSANANA_FILES[0])>html.indexOf(KYUDO_FILE));assert.ok(html.indexOf(OSANANA_FILES[1])>html.indexOf(OSANANA_FILES[0]));assert.ok(html.indexOf(OSANANA_FILES[1])<html.indexOf(prefix+'story-adv.js'));
        for(const script of [...OSANANA_FILES,'story-data/characters.js','story-data/icon-metrics.js','story-data/character-intros.js','story-data/portrait-metrics.js','character-themes.js','profile.js','story-adv.js','story-adv.css','story-viewer.js']){
            const version=script===OSANANA_FILES[1]?'20261007-text105b':'20261007-osananajimi105a';
            assert.ok(html.includes(script+'?v='+version),page+': '+script);
        }
    }
    const metrics=JSON.parse(read('story-data/portrait-metrics.json'));for(const [i,id]of ['tsuyoshi','ryuta','takumi','akatsuki','kanna','chizuru','mai','yuzuki'].entries())assert.equal(metrics.characters[id].heightRank,i+1);
    assert.match(read('character-themes.js'),/ryuta: 'bgm-sky-high-refrain', \/\/ 仮：龍太のイメージ曲は後で差し替え/);
});

