const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sharedMarker = '/* ===== Start setup: header, scrolling content, persistent actions ===== */';

function tree(html) {
    const ids = new Map(), stack = [];
    const voids = new Set(['meta', 'link', 'input', 'img', 'br', 'hr', 'source']);
    for (const [, close, tag, attrs] of html.matchAll(/<(\/)?([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
        if (close) { assert.equal(stack.pop()?.tag, tag, `balanced ${tag}`); continue; }
        const node = { tag, attrs, parent: stack.at(-1), children: [] };
        node.parent?.children.push(node);
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
        if (id) { assert.ok(!ids.has(id), `unique #${id}`); ids.set(id, node); }
        if (!voids.has(tag)) stack.push(node);
    }
    assert.equal(stack.length, 0);
    return ids;
}
const hasClass = (node, name) => new RegExp(`class="[^"]*\\b${name}\\b`).test(node.attrs);
function ancestor(node, name) {
    for (let parent = node.parent; parent; parent = parent.parent) if (hasClass(parent, name)) return parent;
}
function declarations(css, selector) {
    const result = {};
    for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selectors.split(',').some(value => value.trim() === selector)) continue;
        for (const [, name, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) result[name] = value.trim();
    }
    return result;
}

for (const [htmlFile, cssFile] of [['web.html', 'style.css'], ['mobile/mobile.html', 'mobile/style-sp.css']]) {
    test(`${htmlFile}: all static setup actions are siblings of the scrolling body`, () => {
        const ids = tree(read(htmlFile));
        const buttons = ['menu-cpu-button', 'menu-resume-button', 'menu-story-button', 'menu-friend-button',
            'menu-coin-button', 'menu-rules-button', 'menu-gallery-button', 'menu-user-button', 'menu-home-button',
            'start-back-menu-button', 'start-setup-button', 'start-skill-favorite-button', 'story-primary-button',
            'story-secondary-button', 'start-story-back-button', 'start-rules-back-button',
            'start-gallery-back-button', 'start-coin-back-button', 'user-save-button', 'user-reset-button', 'start-user-back-button'];
        for (const id of buttons) {
            const button = ids.get(id);
            assert.ok(button, `preserved #${id}`);
            const footer = ancestor(button, 'start-stage-footer');
            assert.ok(footer, `#${id} in footer`);
            assert.ok(!ancestor(button, 'start-stage-body'), `#${id} outside scrolling content`);
            const classes = footer.parent.children.map(node => /\bclass="([^"]*)"/.exec(node.attrs)?.[1]);
            assert.ok(classes.includes('start-stage-header'));
            assert.ok(classes.includes('start-stage-body'));
            assert.ok(footer.parent.children.indexOf(footer) > footer.parent.children.findIndex(node => hasClass(node, 'start-stage-body')));
        }
        for (const id of ['start-character-step', 'start-skill-step', 'start-turn-stage', 'start-mission-opponent-wrap',
            'story-episode-list', 'mission-list', 'sleeve-picker']) assert.ok(ancestor(ids.get(id), 'start-stage-body'), `#${id} in content`);
    });

    test(`${cssFile}: only content scrolls and compact skills keep space for the footer`, () => {
        const css = read(cssFile);
        const panel = declarations(css, '#start-panel');
        assert.equal(panel.display, 'flex');
        assert.equal(panel['flex-direction'], 'column');
        assert.equal(panel.overflow, 'hidden');
        assert.ok(panel.height.includes('cqh'));
        const body = declarations(css, '#start-panel .start-stage-body');
        assert.equal(body.flex, '1 1 auto');
        assert.equal(body['min-height'], '0');
        assert.equal(body['overflow-y'], 'auto');
        const footer = declarations(css, '#start-panel .start-stage-footer');
        assert.equal(footer.flex, '0 0 auto');
        assert.equal(footer.position, 'static');
        assert.equal(declarations(css, '#start-panel .start-stage-footer button')['min-height'], '44px');
        const list = declarations(css, '#start-panel #start-skill-list');
        assert.equal(list['grid-template-columns'], 'repeat(2, minmax(0, 1fr))');
        assert.equal(list['overflow-y'], 'auto');
        assert.equal(list['min-height'], '0');
        assert.ok(parseInt(list['grid-auto-rows']) <= 90);
        assert.equal(declarations(css, '#start-panel #start-cpu-setup-stage > .start-stage-body').overflow, 'hidden');
    });
}

function element(selectors = '') {
    const node = { selectors, children: [], attrs: {}, parent: null, listeners: {},
        matches: selector => selector.split(',').some(value => selectors.split('|').includes(value.trim())),
        querySelector(selector) {
            for (const child of this.children) { if (child.matches(selector)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
            return null;
        },
        appendChild(child) {
            if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
            child.parent = this; this.children.push(child); return child;
        },
        append(...children) { children.forEach(child => this.appendChild(child)); },
        setAttribute(name, value) { this.attrs[name] = value; },
        addEventListener(name, action) { this.listeners[name] = action; }
    };
    Object.defineProperty(node, 'className', { set(value) { this.selectors = value.split(/\s+/).map(name => `.${name}`).join('|'); } });
    return node;
}

test('online actions move out of content after mount, retaining node identity and login form ownership', () => {
    const stage = element();
    stage.append(element('h2'), element('.start-subtitle'));
    const form = element('.start-user-form'), roomActions = element('.start-setup-actions');
    const create = element(), join = element(), search = element(), back = element(), resume = element();
    roomActions.append(create, join);
    const publicRooms = element(); publicRooms.append(search, element());
    const login = element('#online-login-form button[type="submit"]');
    const auth = element('.online-account-box'); auth.append(login, resume);
    stage.append(form, roomActions, publicRooms, element(), auth, back);
    const nodes = { 'start-friend-stage': stage, 'friend-search-public-button': search, 'start-friend-back-button': back, 'online-resume': resume };
    let clicks = 0; create.addEventListener('click', () => clicks++);
    const c = vm.createContext({ document: { getElementById: id => nodes[id], createElement: () => element() } });
    const source = read('main.js');
    vm.runInContext(source.slice(source.indexOf('function setupOnlineStartLayout()'), source.indexOf('function setupStartOverlay()')), c);
    c.setupOnlineStartLayout();
    assert.deepEqual(stage.children.map(node => node.selectors), ['.start-stage-header', '.start-stage-body', '.start-stage-footer']);
    const body = stage.children[1], footer = stage.children[2];
    for (const button of [create, join, search, back, resume, login]) {
        let parent = button.parent;
        while (parent && parent !== footer && parent !== body) parent = parent.parent;
        assert.equal(parent, footer);
    }
    assert.equal(login.attrs.form, 'online-login-form');
    assert.ok(body.children.includes(auth));
    create.listeners.click(); assert.equal(clicks, 1);
    c.setupOnlineStartLayout(); assert.equal(stage.children.length, 3, 'mounting is idempotent');
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const html = read(file);
        assert.ok(html.indexOf('network.js?v=') < html.indexOf(file === 'web.html' ? 'main.js?v=' : 'main-sp.js?v='), 'online mount precedes setup');
    }
});

test('skill list shows all six recommendations and descriptions with full details available on demand', () => {
    const c = vm.createContext({ console, document: { addEventListener() {} }, window: {}, setStartSkillMessage() {} });
    vm.runInContext(read('state.js'), c);
    c.escapeHtmlText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    c.getSkillDefinitionsSafe = c.getSkillDefinitions;
    c.startSkillList = { innerHTML: '' }; c.startSkillDetail = { innerHTML: '' };
    const source = read('main.js');
    vm.runInContext(source.slice(source.indexOf('    const renderStartSkillSelection ='), source.indexOf('    const renderStartSkillRules =')) + '\nthis.renderSkills = renderStartSkillSelection;', c);
    const defs = c.getSkillDefinitions();
    for (const skill of defs) {
        c.selectedStartSkillKey = skill.key;
        c.renderSkills();
        assert.equal((c.startSkillList.innerHTML.match(/data-pick-skill-key=/g) || []).length, 6);
        assert.equal((c.startSkillList.innerHTML.match(/start-skill-tile-summary/g) || []).length, 6);
        assert.ok(c.startSkillList.innerHTML.includes(c.skillRecommendationText(skill)));
        assert.ok(c.startSkillList.innerHTML.includes(`data-pick-skill-key="${skill.key}" aria-pressed="true"`));
        assert.match(c.startSkillDetail.innerHTML, /<details>\s*<summary[^>]*>[^<]*詳しく/);
        assert.ok(c.startSkillDetail.innerHTML.includes(skill.condition));
        assert.ok(c.startSkillDetail.innerHTML.includes(skill.effect));
    }
});

test('setup retains favourite preselection, registration, back/next navigation and mission setup', () => {
    const nodes = {};
    for (const id of ['start-overlay', 'start-cpu-setup-stage', 'start-character-step', 'start-skill-step',
        'start-turn-stage', 'start-skill-footer', 'start-skill-favorite-button', 'start-skill-list',
        'start-skill-detail', 'start-skill-message', 'start-setup-button', 'start-back-menu-button',
        'start-cpu-setup-subtitle', 'start-cpu-personality', 'start-mission-opponent',
        'start-mission-opponent-wrap', 'menu-cpu-button']) {
        const classes = new Set();
        nodes[id] = Object.assign(element(), { value: '', textContent: '', innerHTML: '',
            classList: { contains: key => classes.has(key), add: key => classes.add(key),
                remove: (...keys) => keys.forEach(key => classes.delete(key)),
                toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } }
        });
    }
    const storage = new Map();
    const c = vm.createContext({ console, setTimeout: () => 1, clearTimeout() {},
        location: { pathname: '/web.html' }, addEventListener() {},
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        document: { getElementById: id => nodes[id] || null, querySelector: () => ({ scrollTop: 0 }),
            querySelectorAll: () => [], addEventListener() {} }
    });
    c.window = c;
    for (const file of ['state.js', 'profile.js', 'main.js']) vm.runInContext(read(file), c);
    for (const name of ['setupMatchAutosaveOnce', 'setupMatchExitGuardOnce', 'renderUserStageProfile',
        'renderCoinStageProfile', 'renderStartGallery', 'updateResumeMatchButtonVisibility',
        'startMenuFloatingBackground', 'stopMenuFloatingBackground']) c[name] = () => {};
    c.updateUserBasicSettings({ favoriteCharacterId: 'mai', favoriteSkillKey: 'aceProcurement' });
    c.setupStartOverlay();
    nodes['menu-cpu-button'].listeners.click();
    assert.equal(vm.runInContext('selectedStartCharacter', c), 'mai');
    assert.ok(nodes['start-skill-list'].innerHTML.includes('data-pick-skill-key="aceProcurement" aria-pressed="true"'));
    nodes['start-setup-button'].listeners.click();
    assert.equal(nodes['start-skill-step'].classList.contains('hidden'), false);
    assert.equal(nodes['start-skill-footer'].classList.contains('hidden'), false);
    const choice = { getAttribute: () => 'foodTrap' };
    nodes['start-skill-list'].listeners.click({ target: { closest: () => choice } });
    nodes['start-skill-favorite-button'].listeners.click();
    assert.equal(c.getUserProfile().favoriteSkillKey, 'foodTrap');
    assert.equal(c.getUserProfile().favoriteCharacterId, 'mai');
    assert.match(nodes['start-skill-message'].textContent, /お気に入りに登録しました/);
    nodes['start-setup-button'].listeners.click();
    assert.equal(nodes['start-turn-stage'].classList.contains('hidden'), false);
    assert.equal(nodes['start-setup-button'].classList.contains('hidden'), true);
    nodes['start-back-menu-button'].listeners.click();
    assert.equal(nodes['start-skill-footer'].classList.contains('hidden'), false);
    assert.equal(nodes['start-setup-button'].classList.contains('hidden'), false);
    nodes['start-back-menu-button'].listeners.click();
    assert.equal(nodes['start-character-step'].classList.contains('hidden'), false);
    assert.equal(nodes['start-skill-footer'].classList.contains('hidden'), true);
    c.Missions = { isUnlocked: () => true, getDefinition: id => id === 'noItems' ? { id } : null };
    c.startMissionCpuSetup('noItems');
    assert.equal(vm.runInContext('pendingMissionId', c), 'noItems');
    assert.equal(nodes['start-character-step'].classList.contains('hidden'), false);
    assert.equal(nodes['start-mission-opponent-wrap'].classList.contains('hidden'), true);
    nodes['start-setup-button'].listeners.click();
    assert.equal(nodes['start-mission-opponent-wrap'].classList.contains('hidden'), false);
    assert.equal(nodes['start-character-step'].classList.contains('hidden'), true);
    nodes['start-back-menu-button'].listeners.click();
    assert.equal(nodes['start-character-step'].classList.contains('hidden'), false);
    nodes['start-setup-button'].listeners.click();
    nodes['start-setup-button'].listeners.click();
    assert.equal(nodes['start-skill-step'].classList.contains('hidden'), false);
    assert.ok(nodes['start-skill-list'].innerHTML.includes('data-pick-skill-key="foodTrap" aria-pressed="true"'));
});

test('PC/mobile share setup logic, overlay markup and CSS and load the updated files', () => {
    assert.equal(read('main.js'), read('mobile/main-sp.js').replaceAll('../assets/', 'assets/').replace("window.location.href = '../index.html'", "window.location.href = 'index.html'"));
    assert.equal(read('style.css').split(sharedMarker)[1], read('mobile/style-sp.css').split(sharedMarker)[1]);
    const overlay = html => html.slice(html.indexOf('    <div id="start-overlay"'), html.indexOf('\n</div>\n\n<script', html.indexOf('    <div id="start-overlay"')));
    assert.equal(overlay(read('web.html')), overlay(read('mobile/mobile.html')));
    for (const [html, style, main] of [['web.html', 'style.css', 'main.js'], ['mobile/mobile.html', 'style-sp.css', 'main-sp.js']]) {
        const version = '20261003-adv1';
        assert.ok(read(html).includes(`${style}?v=${version}`));
        assert.ok(read(html).includes(`${main}?v=20261004-character-notice1`));
    }
});
