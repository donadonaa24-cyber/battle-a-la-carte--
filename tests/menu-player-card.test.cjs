const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

class Element {
    constructor() {
        this.textContent = ''; this.innerHTML = ''; this.value = ''; this.className = '';
        this.children = []; this.handlers = {}; this.attributes = {}; this.dataset = {};
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            toggle: (name, on) => {
                const names = new Set(this.className.split(' ').filter(Boolean));
                if (on ?? !names.has(name)) names.add(name); else names.delete(name);
                this.className = [...names].join(' ');
            },
            add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
            remove: (...names) => names.forEach(name => this.classList.toggle(name, false))
        };
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, action) { this.handlers[key] = action; }
    appendChild(element) { this.children.push(element); return element; }
    replaceChildren(...children) { this.children = children; }
}

function runtime(mobile, dishes = 100) {
    const nodes = new Map(), listeners = [];
    for (const id of ['start-overlay', 'start-title-stage', 'start-menu-stage', 'start-user-stage',
        'start-achievements-stage', 'start-menu-message', 'user-stage-message', 'start-menu-player-card',
        'menu-player-icon', 'menu-player-title', 'menu-player-name', 'menu-player-status', 'menu-player-wins',
        'menu-player-matches', 'menu-player-achievement-count', 'menu-player-profile-button',
        'menu-player-achievements-button', 'menu-user-button', 'menu-achievements-button',
        'user-achievements-button', 'achievement-close-button', 'user-name-input', 'user-favorite-character']) {
        nodes.set(id, new Element());
    }
    nodes.get('menu-player-icon').className = 'character-icon char-chizuru face-normal';
    const storage = new Map([['battle-a-la-carte:user-profile:v1', JSON.stringify({
        name: 'あにあに', favoriteCharacterId: 'mai', stats: { wins: 7, matches: 9, dishes }
    })]]);
    const c = vm.createContext({ console, URL, setTimeout: () => 1, clearTimeout() {}, addEventListener() {},
        fetch() { throw new Error('Network forbidden in this offline test'); },
        location: { pathname: mobile ? '/mobile/mobile.html' : '/web.html', protocol: 'http:' },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        document: { readyState: 'loading', currentScript: { src: 'http://offline.invalid/network.js' },
            getElementById: id => nodes.get(id) || null, createElement: () => new Element(),
            addEventListener: (name, action) => { if (name === 'DOMContentLoaded') listeners.push(action); },
            querySelector: () => null, querySelectorAll: () => [] },
        updateUI() {}
    });
    c.window = c;
    c.FriendBattle = { isActive: () => false, isAccountSignedIn: () => false };
    for (const file of [mobile ? 'mobile/state-sp.js' : 'state.js', 'profile.js', 'achievements.js',
        mobile ? 'mobile/main-sp.js' : 'main.js']) vm.runInContext(read(file), c, { filename: file });
    const achievementInit = listeners[0];
    for (const name of ['setupMatchAutosaveOnce', 'setupMatchExitGuardOnce', 'renderCoinStageProfile',
        'renderStartGallery', 'updateResumeMatchButtonVisibility', 'startMenuFloatingBackground', 'stopMenuFloatingBackground']) c[name] = () => {};
    c.Achievements.initialize();
    return { c, nodes, storage, achievementInit, text: id => nodes.get(id).textContent };
}

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    test(`${label}: guests retain their local name, title, favourite icon, frame and stats`, () => {
        const { c, nodes, text } = runtime(mobile);
        assert.equal(c.Achievements.selectTitle('dish100'), true);
        assert.equal(c.Achievements.selectFrame('silver'), true);
        c.showStartStage('start-menu-stage');
        assert.equal(text('menu-player-status'), 'ゲスト');
        assert.equal(text('menu-player-name'), 'あにあに');
        assert.equal(text('menu-player-title'), '「百品の料理人」');
        assert.equal(text('menu-player-wins'), '7');
        assert.equal(text('menu-player-matches'), '9');
        assert.equal(text('menu-player-achievement-count'), '5/30');
        const icon = nodes.get('menu-player-icon');
        assert.ok(icon.classList.contains('char-mai'));
        assert.ok(!icon.classList.contains('char-chizuru'));
        assert.ok(icon.classList.contains('face-normal'));
        assert.ok(icon.classList.contains('achievement-frame-silver'));
        assert.equal(icon.attributes['aria-label'], '舞依');
        assert.ok(!nodes.get('menu-player-title').classList.contains('hidden'));
    });

    test(`${label}: saved profile, stats, achievements and all cosmetic transitions refresh the card`, () => {
        const { c, nodes, text } = runtime(mobile, 500);
        for (const frame of ['silver', 'gold', 'none']) {
            assert.equal(c.Achievements.selectFrame(frame), true);
            for (const tier of ['silver', 'gold']) assert.equal(nodes.get('menu-player-icon').classList.contains(`achievement-frame-${tier}`), frame === tier);
        }
        c.Achievements.selectTitle('dish100');
        c.Achievements.selectTitle('');
        assert.equal(text('menu-player-title'), '');
        assert.ok(nodes.get('menu-player-title').classList.contains('hidden'));
        c.updateUserBasicSettings({ name: '<b>guest</b>', favoriteCharacterId: 'takumi' });
        assert.equal(text('menu-player-name'), '<b>guest</b>');
        assert.equal(nodes.get('menu-player-name').innerHTML, '', 'name uses textContent');
        assert.ok(nodes.get('menu-player-icon').classList.contains('char-takumi'));
        c.recordMatchResult(false);
        assert.equal(text('menu-player-matches'), '10');
        assert.equal(text('menu-player-wins'), '7');
        c.Achievements.refreshCompletions({ missions: { cleared: { noItems: true } }, silent: true });
        assert.equal(text('menu-player-achievement-count'), '7/30');
        nodes.get('menu-player-name').textContent = 'stale';
        c.showStartStage('start-menu-stage');
        assert.equal(text('menu-player-name'), '<b>guest</b>', 'reopening renders current data');
        c.resetUserProfile();
        assert.equal(text('menu-player-name'), 'Player');
        assert.equal(text('menu-player-wins'), '0');
        assert.equal(text('menu-player-matches'), '0');
        assert.equal(text('menu-player-achievement-count'), '7/30', 'profile reset preserves existing achievements');
    });

    test(`${label}: card links open the existing profile and achievements and close back to the menu`, () => {
        const { c, nodes, achievementInit } = runtime(mobile);
        c.setupStartOverlay();
        achievementInit();
        nodes.get('menu-player-profile-button').handlers.click();
        assert.ok(!nodes.get('start-user-stage').classList.contains('hidden'));
        assert.ok(nodes.get('start-menu-stage').classList.contains('hidden'));
        assert.equal(nodes.get('user-name-input').value, 'あにあに');
        nodes.get('menu-player-achievements-button').handlers.click();
        assert.ok(!nodes.get('start-achievements-stage').classList.contains('hidden'));
        nodes.get('achievement-close-button').handlers.click();
        assert.ok(!nodes.get('start-menu-stage').classList.contains('hidden'));
        assert.ok(nodes.get('start-achievements-stage').classList.contains('hidden'));
    });

    test(`${label}: cached account state starts as guest, resolves asynchronously and reacts to account events without UI requests`, async () => {
        const { c, text } = runtime(mobile);
        let release, first = true, reads = 0;
        let session = null;
        const pendingSession = new Promise(resolve => { release = resolve; });
        const account = { auth: {
            getSession() {
                reads++;
                if (first) { first = false; return pendingSession; }
                return Promise.resolve({ data: { session } });
            },
            onAuthStateChange(action) { this.change = action; }
        } };
        const guest = { auth: {
            getSession: async () => ({ data: { session: { user: { id: 'guest', is_anonymous: true } } } }),
            onAuthStateChange(action) { this.change = action; }
        } };
        c.SUPABASE_CONFIG = { SUPABASE_URL: 'offline-fixture', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
        c.supabase = { createClient: (_url, _key, options) => options.auth ? guest : account };
        vm.runInContext(read('network.js'), c);
        c.renderStartMenuPlayerCard();
        assert.equal(text('menu-player-status'), 'ゲスト');
        assert.equal(reads, 0, 'rendering does not initialize the account client');
        const ready = c.FriendBattle.getMissionAccountClient();
        await new Promise(resolve => setImmediate(resolve));
        c.renderStartMenuPlayerCard();
        assert.equal(text('menu-player-status'), 'ゲスト', 'unresolved session stays guest');
        session = { user: { id: 'account', is_anonymous: false } };
        release({ data: { session } });
        assert.equal(await ready, account);
        assert.equal(text('menu-player-status'), 'あにあにアカウント：ログイン中');
        const checked = reads;
        for (let n = 0; n < 3; n++) c.renderStartMenuPlayerCard();
        assert.equal(reads, checked, 'UI uses the cached boolean only');
        account.auth.change('SIGNED_OUT', null);
        assert.equal(text('menu-player-status'), 'ゲスト');
        account.auth.change('SIGNED_IN', { user: { id: 'anonymous', is_anonymous: true } });
        assert.equal(text('menu-player-status'), 'ゲスト');
        account.auth.change('SIGNED_IN', session);
        assert.equal(text('menu-player-status'), 'あにあにアカウント：ログイン中');
        assert.equal(text('menu-player-name'), 'あにあに');
    });

    test(`${label}: account login updates the card while the existing online client is still a guest`, async () => {
        const { c, text } = runtime(mobile);
        let accountChanged;
        const account = { auth: { getSession: async () => ({ data: { session: null } }),
            onAuthStateChange(action) { accountChanged = action; } } };
        const guest = { auth: { getSession: async () => ({ data: { session: { user: { id: 'guest', is_anonymous: true } } } }),
            onAuthStateChange() {} } };
        c.SUPABASE_CONFIG = { SUPABASE_URL: 'offline-fixture', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
        c.supabase = { createClient: (_url, _key, options) => options.auth ? guest : account };
        vm.runInContext(read('network.js'), c);
        assert.equal(await c.FriendBattle.getMissionAccountClient(), null);
        assert.equal(c.FriendBattle.isAccountSignedIn(), false);
        accountChanged('SIGNED_IN', { user: { id: 'account', is_anonymous: false } });
        assert.equal(text('menu-player-status'), 'あにあにアカウント：ログイン中');
    });
}

function declarations(css, selector) {
    const result = {};
    for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selectors.split(',').some(value => value.trim() === selector)) continue;
        for (const [, name, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) result[name] = value.trim();
    }
    return result;
}

for (const [file, cssFile, stageHeight] of [['web.html', 'style.css', 810], ['mobile/mobile.html', 'mobile/style-sp.css', 768]]) {
    test(`${file}: notice, card and fixed mode footer use separate stack regions with a height budget`, () => {
        const html = read(file), css = read(cssFile);
        const menu = html.slice(html.indexOf('<div id="start-menu-stage"'), html.indexOf('<div id="start-cpu-setup-stage"'));
        assert.match(menu, /start-stage-body[\s\S]*start-menu-message[\s\S]*start-menu-player-card[\s\S]*<\/section>\s*<\/div>\s*<div class="start-menu-buttons start-stage-footer">/);
        assert.match(menu, /start-menu-floating-bg/);
        const card = declarations(css, '#start-panel .menu-player-card');
        assert.equal(card.position, 'static');
        assert.equal(card.flex, '0 0 auto');
        assert.equal(card['min-width'], '0');
        assert.equal(card['box-sizing'], 'border-box');
        assert.ok(!card.height && !card['max-height'], 'long content can grow inside body scroll');
        const body = declarations(css, '#start-panel .start-stage-body');
        assert.equal(body['min-height'], '0');
        assert.equal(body['overflow-y'], 'auto');
        assert.equal(body['overflow-x'], 'hidden');
        const footer = declarations(css, '#start-panel .start-stage-footer');
        assert.equal(footer.position, 'static');
        assert.equal(footer.flex, '0 0 auto');
        assert.equal(declarations(css, '#start-panel .start-menu-buttons')['grid-template-columns'], 'repeat(2, minmax(0, 1fr))');
        assert.equal(declarations(css, '.start-menu-floating-bg')['pointer-events'], 'none');
        assert.equal(declarations(css, '.start-menu-content')['z-index'], '1');
        // Conservative logical-stage budget, including the optional resume button.
        // This checks the design constraints, not browser font/layout measurements.
        const innerHeight = stageHeight * .86 - 2 - 24 - 8;
        const headerAndGaps = 64 + 20;
        const footerHeight = 6 * 44 + 5 * 8 + 9;
        const normalCardHeight = 22 + 52 + 2 * 6 + 16.5 + 32;
        const noticeAndBodyPadding = 44 + 10 + 4;
        assert.ok(normalCardHeight + noticeAndBodyPadding <= innerHeight - headerAndGaps - footerHeight, `${file}: card and notice fit with resume visible`);
    });
}

test('PC/mobile share menu card logic, markup, styles and cache versions', () => {
    assert.equal(read('main.js'), read('mobile/main-sp.js'));
    const menu = html => html.slice(html.indexOf('<div id="start-menu-stage"'), html.indexOf('<div id="start-cpu-setup-stage"'));
    assert.equal(menu(read('web.html')), menu(read('mobile/mobile.html')));
    const marker = '/* Menu player card stays';
    const cardCss = css => css.slice(css.indexOf(marker), css.indexOf('#start-panel #start-cpu-setup-stage > .start-stage-body'));
    assert.equal(cardCss(read('style.css')), cardCss(read('mobile/style-sp.css')));
    for (const [file, suffix] of [['web.html', ''], ['mobile/mobile.html', '-sp']]) {
        for (const asset of [`style${suffix}.css`, `main${suffix}.js`, 'profile.js', 'achievements.js', 'network.js']) assert.ok(read(file).includes(`${asset}?v=20261002-menucard1`), `${file}: ${asset}`);
    }
    assert.match(read('battle-engine-worker.js'), /achievements\.js\?v=20261002-menucard1/);
    assert.match(read('network.js'), /battle-engine-worker\.js\?v=20261002-menucard1/);
});
