const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'battleAlaCarteCharacterNotice20261004';
const SHORT = '本作のキャラクターは、フェニチルさんの創作作品『天涯比隣』のキャラクターデザインと名前をお借りした二次創作です。性格・関係性・ストーリー・設定はすべて本作独自のもので、原作とは関係ありません。';
const LONG = [
    'Battle à la carte に登場するキャラクター（千鶴・栞那・舞依・拓海・暁・剛）は、フェニチルさんが手がける創作作品『天涯比隣（てんがいひりん）』のキャラクターデザインと名前を、フェニチルさんの許可を得てお借りしています。',
    '本作のストーリー、キャラクターの性格・口調・関係性・学校などの設定は、すべて Battle à la carte 独自の二次創作です。原作『天涯比隣』の内容や設定とは関係がなく、原作のキャラクター像を表すものではありません。',
    '『天涯比隣』は現在フェニチルさんの手元にある作品で、まだ公開されていません。',
    '本作についてのお問い合わせは、制作者（あにあに）までお願いします。'
];
const CREDIT = 'キャラクターデザイン・キャラクター名：フェニチル（『天涯比隣』より）';

// Parse the actual page structure to check paragraph boundaries and scroll placement.
function parse(html) {
    const tree = { tag: 'root', children: [], text: '' }, stack = [tree], ids = new Map();
    for (const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
        const text = token[0];
        if (text.startsWith('<!--') || text.startsWith('<!')) continue;
        if (text.startsWith('</')) { stack.pop(); continue; }
        if (!text.startsWith('<')) { stack.at(-1).text += text; continue; }
        const tag = text.match(/^<(\w+)/)?.[1]; if (!tag) continue;
        const attrs = Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
        const node = { tag, attrs, text: '', children: [], parent: stack.at(-1) };
        stack.at(-1).children.push(node); if (attrs.id) ids.set(attrs.id, node);
        if (!['meta', 'link', 'input', 'img', 'br', 'hr', 'source'].includes(tag)) stack.push(node);
    }
    return ids;
}

function runtime(mobile, { store = new Map(), getBlocked = false, setBlocked = false } = {}) {
    const elements = new Map(), inits = [], calls = [];
    class Element {
        constructor(id, className = '') {
            this.id = id; this.dataset = {}; this.textContent = ''; this.innerHTML = ''; this.handlers = {};
            this.classes = new Set(className.split(/\s+/)); this.open = false; this.shows = 0;
            this.classList = { contains: name => this.classes.has(name),
                add: (...names) => names.forEach(name => this.classes.add(name)),
                remove: (...names) => names.forEach(name => this.classes.delete(name)),
                toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
            this.style = { setProperty() {} }; this.children = [];
        }
        addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
        fire(name, event = {}) { for (const fn of this.handlers[name] || []) fn(event); }
        setAttribute(name, value) { this[name] = value; }
        getAttribute(name) { return this[name]; }
        querySelectorAll() { return []; }
        showModal() { assert.equal(this.open, false); this.open = true; this.shows++; }
        close() { this.open = false; }
    }
    const parsed = parse(read(mobile ? 'mobile/mobile.html' : 'web.html'));
    for (const [id, node] of parsed) elements.set(id, new Element(id, node.attrs.class || ''));
    const c = vm.createContext({ console, Math, Date, setTimeout, clearTimeout,
        document: { readyState: 'loading', addEventListener: (name, fn) => inits.push(fn),
            getElementById: id => elements.get(id) || null, querySelectorAll: () => [], querySelector: () => null },
        localStorage: { getItem(key) { if (getBlocked) throw Error('read blocked'); return store.get(key) || null; },
            setItem(key, value) { if (setBlocked) throw Error('write blocked'); store.set(key, value); } },
        addEventListener() {}, updateUI() {}, addLog() {}, setCPUStatus() {} });
    c.window = c;
    const load = file => vm.runInContext(read(file), c, { filename: file });
    for (const name of ['cards', 'state', 'main']) load(mobile ? `mobile/${name}-sp.js` : `${name}.js`);
    load('missions.js');
    const source = read('story-mode.js').replace(/\}\)\(\);\s*$/, 'window.__noticeTest = { init, startIntro };\n})();');
    vm.runInContext(source, c, { filename: 'story-mode.js' });
    c.StoryAdv = { stop() {}, abandonBattle() {}, appendEpisodeCards() {},
        playConversation(ep) { calls.push(ep.id); } };
    c.__showStartStage = () => {};
    c.__noticeTest.init();
    return { c, elements, calls, store, dialog: elements.get('character-notice-dialog'),
        confirm: () => elements.get('character-notice-confirm').fire('click') };
}

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC', file = mobile ? 'mobile/mobile.html' : 'web.html';
    test(`${label}: exact four LONG paragraphs, one confirmation button, and three permanent SHORT placements`, () => {
        const nodes = parse(read(file));
        assert.deepEqual(nodes.get('character-notice-body').children.map(p => [p.tag, p.text.trim()]), LONG.map(text => ['p', text]));
        assert.equal(nodes.get('character-notice-title').text.trim(), 'ストーリーをお楽しみいただく前に');
        const modal = nodes.get('character-notice-dialog');
        assert.equal(modal.children.filter(n => n.tag === 'button').length, 1);
        assert.equal(nodes.get('character-notice-confirm').text, '確認しました');
        assert.equal(modal.attrs['aria-labelledby'], 'character-notice-title');
        assert.equal(nodes.get('story-character-notice').text, SHORT);
        assert.equal(nodes.get('story-character-notice').parent.parent.attrs.class, 'start-stage-header');
        assert.equal(nodes.get('story-character-notice-link').text, 'キャラクターについて');
        assert.equal(nodes.get('gallery-character-notice').text, SHORT);
        assert.equal(nodes.get('gallery-character-notice').parent.attrs.class, 'start-stage-header');
        const credit = nodes.get('start-credits');
        assert.deepEqual(credit.children.filter(n => n.tag === 'p').map(n => n.text), [CREDIT, SHORT]);
        assert.notEqual(credit.parent, nodes.get('start-settings-content')); // settings regeneration preserves it
    });
    test(`${label}: first story screen shows once, acknowledgment survives reload and is shared across PC/phone, link reopens`, () => {
        const r = runtime(mobile); assert.equal(r.dialog.shows, 0);
        r.c.openStoryStage(); assert.equal(r.dialog.open, true); assert.equal(r.dialog.shows, 1);
        r.c.openStoryStage(); assert.equal(r.dialog.shows, 1);
        let prevented = false;
        r.dialog.fire('cancel', { preventDefault() { prevented = true; } });
        assert.equal(prevented, true); assert.equal(r.dialog.open, true);
        r.confirm(); assert.equal(r.dialog.open, false); assert.equal(r.store.get(KEY), '1');
        r.c.openStoryStage(); assert.equal(r.dialog.shows, 1);
        for (const otherMobile of [mobile, !mobile]) {
            const reload = runtime(otherMobile, { store: r.store }); reload.c.openStoryStage();
            assert.equal(reload.dialog.shows, 0);
            reload.elements.get('story-character-notice-link').fire('click');
            assert.equal(reload.dialog.open, true); assert.equal(reload.dialog.shows, 1);
            reload.confirm(); reload.c.openStoryStage(); assert.equal(reload.dialog.shows, 1);
        }
    });
    for (const [getBlocked, setBlocked] of [[true, false], [false, true], [true, true]]) {
        test(`${label}: blocked storage (${getBlocked}/${setBlocked}) falls back to once per page and link still reopens`, () => {
            const r = runtime(mobile, { getBlocked, setBlocked }); r.c.openStoryStage(); r.confirm();
            r.c.openStoryStage(); r.c.Missions.openTab('story'); assert.equal(r.dialog.shows, 1);
            r.elements.get('story-character-notice-link').fire('click'); assert.equal(r.dialog.shows, 2); r.confirm();
            r.c.openStoryStage(); assert.equal(r.dialog.shows, 2);
            const reload = runtime(mobile, { getBlocked, setBlocked }); reload.c.openStoryStage();
            assert.equal(reload.dialog.shows, 1);
        });
    }
    test(`${label}: missions does not trigger notice; switching to story does`, () => {
        const r = runtime(mobile); r.elements.delete('mission-list');
        r.c.Missions.openTab('missions'); assert.equal(r.dialog.shows, 0);
        r.c.Missions.openTab('story'); assert.equal(r.dialog.shows, 1);
    });
    test(`${label}: direct tutorial start waits for confirmation, then runs once`, () => {
        const r = runtime(mobile); r.c.__noticeTest.startIntro('episode1');
        assert.equal(r.dialog.open, true); assert.deepEqual(r.calls, []);
        r.confirm(); assert.deepEqual(r.calls, ['episode1']);
        r.c.__noticeTest.startIntro('episode1'); assert.equal(r.dialog.shows, 1);
        assert.deepEqual(r.calls, ['episode1', 'episode1']);
    });
    test(`${label}: gallery SHORT is visible only for characters, including return from other categories`, () => {
        const r = runtime(mobile), notice = r.elements.get('gallery-character-notice');
        for (const type of ['characters', 'ingredients', 'events', 'recipes', 'characters']) {
            r.c.renderStartGallery(type);
            assert.equal(notice.classList.contains('hidden'), type !== 'characters');
        }
    });
    test(`${label}: changed asset keys are bumped while 81a audio and 82a data keys are preserved`, () => {
        const html = read(file);
        for (const asset of ['story-adv.css', 'missions.js', mobile ? 'main-sp.js' : 'main.js', 'story-adv.js', 'story-mode.js']) {
            assert.ok(html.includes(asset + '?v=20261004-character-notice1'), asset);
        }
        assert.ok(html.includes('audio-pack.js?v=20261004-audio-pack1'));
        assert.ok(html.includes('episode10.js?v=20261004-adv-menu1'));
    });
}
