const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ids = ['chizuru', 'mai', 'takumi', 'akatsuki'];
const names = ['千鶴', '舞依', '拓海', '暁'];

function webpSize(buffer) {
    assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
    assert.equal(buffer.readUInt32LE(4) + 8, buffer.length);
    for (let offset = 12; offset + 8 <= buffer.length;) {
        const type = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const data = offset + 8;
        assert.ok(data + size <= buffer.length);
        if (type === 'VP8X') return [buffer.readUIntLE(data + 4, 3) + 1, buffer.readUIntLE(data + 7, 3) + 1];
        if (type === 'VP8 ') {
            assert.equal(buffer.toString('hex', data + 3, data + 6), '9d012a');
            return [buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff];
        }
        if (type === 'VP8L') {
            assert.equal(buffer[data], 0x2f);
            const bits = buffer.readUInt32LE(data + 1);
            return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
        }
        offset = data + size + (size % 2);
    }
    assert.fail('WebP image chunk required');
}

test('all four registered standing assets are compact 512×768 WebP with no source PNG folder', () => {
    const c = vm.createContext({ window: {} });
    vm.runInContext(read('battle-images.js'), c);
    for (const id of ids) {
        const file = c.window.BattleImages.standingPath(id);
        assert.equal(file, `assets/battle-images/characters/standing/${id}-standing.webp`);
        const buffer = fs.readFileSync(path.join(root, file));
        assert.ok(buffer.length > 1024 && buffer.length < 100 * 1024, `${id} is a compact image`);
        assert.deepEqual(webpSize(buffer), [512, 768]);
    }
    assert.ok(!fs.existsSync(path.join(root, 'assets/battle-images/standing-src')));
});

function element(attrs = {}) {
    const classes = new Set((attrs.class || '').split(/\s+/));
    const node = { value: '', textContent: '', listeners: {}, buttons: [],
        classList: { contains: key => classes.has(key), add: key => classes.add(key),
            remove: (...keys) => keys.forEach(key => classes.delete(key)),
            toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value; }
    };
    let html = '';
    Object.defineProperty(node, 'innerHTML', {
        get: () => html,
        set(value) {
            html = value;
            node.buttons = Array.from(html.matchAll(/<button\b([^>]*)>/g), ([, attributes]) =>
                element(Object.fromEntries(Array.from(attributes.matchAll(/([\w-]+)="([^"]*)"/g), ([, key, text]) => [key, text]))));
        }
    });
    return node;
}

function setup(mobile, summerUnlocked = false) {
    const nodes = Object.fromEntries(['start-overlay', 'start-cpu-setup-stage', 'start-character-step',
        'start-character-cards', 'start-opponent-cards', 'start-mission-opponent', 'start-mission-opponent-wrap',
        'start-skill-step', 'start-skill-footer', 'start-skill-list', 'start-skill-detail', 'start-skill-message',
        'start-setup-button', 'start-back-menu-button', 'start-cpu-setup-subtitle', 'start-cpu-personality',
        'start-turn-stage', 'menu-cpu-button', 'start-costume-wrap', 'start-costume-select'].map(id => [id, element()]));
    const storage = new Map();
    if (summerUnlocked) storage.set('battleAlaCarteStoryProgressV1', JSON.stringify({'special-summer': true}));
    const c = vm.createContext({ console, location: { pathname: mobile ? '/mobile/mobile.html' : '/web.html' },
        addEventListener() {}, setTimeout: () => 1, clearTimeout() {},
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        document: { getElementById: id => nodes[id] || null, querySelector: () => ({ scrollTop: 0 }),
            querySelectorAll: selector => selector === '.start-char-button[data-character-id]' ? nodes['start-character-cards'].buttons : [],
            addEventListener() {} }
    });
    c.window = c;
    for (const file of ['state.js', 'profile.js', 'battle-images.js', mobile ? 'mobile/main-sp.js' : 'main.js']) vm.runInContext(read(file), c);
    for (const name of ['setupMatchAutosaveOnce', 'setupMatchExitGuardOnce', 'renderUserStageProfile',
        'renderCoinStageProfile', 'renderStartGallery', 'updateResumeMatchButtonVisibility']) c[name] = () => {};
    c.Missions = { isUnlocked: () => true, getDefinition: id => id === 'noItems' ? { id } : null };
    c.updateUserBasicSettings({ favoriteCharacterId: 'mai', favoriteSkillKey: 'aceProcurement' });
    c.setupStartOverlay();
    return { c, nodes, storage };
}

function checkCards(node, mobile, selected, opponent) {
    const attribute = opponent ? 'data-opponent-id' : 'data-character-id';
    assert.deepEqual(node.buttons.map(button => button.getAttribute(attribute)), ids);
    assert.deepEqual(node.buttons.filter(button => button.classList.contains('active')).map(button => button.getAttribute(attribute)), [selected]);
    assert.deepEqual(node.buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.getAttribute(attribute)), [selected]);
    const images = Array.from(node.innerHTML.matchAll(/<img\b[^>]*src="([^"]*)"/g), ([, src]) => src);
    assert.deepEqual(images, ids.map(id => `${mobile ? '../' : ''}assets/battle-images/characters/standing/${id}-standing.webp`));
    assert.equal((node.innerHTML.match(/class="start-standing-plate"/g) || []).length, 4);
    for (const name of names) assert.ok(node.innerHTML.includes(`>${name}</span>`));
    assert.ok(node.innerHTML.includes(opponent ? 'CPU性格：' : 'スキル：'));
    assert.doesNotMatch(node.innerHTML, /\.png|start-char-portrait|character-icon/);
}

for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile' : 'PC'}: CPU and mission standing choices retain highlights, favourites and selected opponent`, () => {
        const { c, nodes } = setup(mobile);
        nodes['menu-cpu-button'].listeners.click();
        checkCards(nodes['start-character-cards'], mobile, 'mai', false);
        const playerButton = nodes['start-character-cards'].buttons[2];
        nodes['start-character-cards'].listeners.click({ target: { closest: () => playerButton } });
        checkCards(nodes['start-character-cards'], mobile, 'takumi', false);
        c.applyCharacterChoice();
        assert.equal(c.GameState.characterIds.player, 'takumi');
        assert.notEqual(c.GameState.characterIds.cpu, 'takumi');
        nodes['start-setup-button'].listeners.click();
        nodes['start-back-menu-button'].listeners.click();
        checkCards(nodes['start-character-cards'], mobile, 'takumi', false);

        c.startMissionCpuSetup('noItems');
        checkCards(nodes['start-character-cards'], mobile, 'mai', false);
        assert.ok(nodes['start-mission-opponent-wrap'].classList.contains('hidden'));
        nodes['start-setup-button'].listeners.click();
        assert.ok(nodes['start-character-step'].classList.contains('hidden'));
        assert.ok(!nodes['start-mission-opponent-wrap'].classList.contains('hidden'));
        checkCards(nodes['start-opponent-cards'], mobile, 'chizuru', true);
        const opponentButton = nodes['start-opponent-cards'].buttons[3];
        nodes['start-opponent-cards'].listeners.click({ target: { closest: () => opponentButton } });
        checkCards(nodes['start-opponent-cards'], mobile, 'akatsuki', true);
        nodes['start-setup-button'].listeners.click();
        assert.ok(!nodes['start-skill-step'].classList.contains('hidden'));
        nodes['start-back-menu-button'].listeners.click();
        checkCards(nodes['start-opponent-cards'], mobile, 'akatsuki', true);
        c.GameState.activeMissionId = 'noItems';
        c.applyCharacterChoice();
        assert.equal(c.GameState.characterIds.cpu, 'akatsuki');
        assert.equal(c.GameState.characterNames.cpu, '暁');
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

for (const mobile of [false, true]) test(`100c ${mobile ? 'phone' : 'PC'}: picker changes both saved wardrobe and standing art through the real setup handlers`, () => {
    const {c, nodes, storage} = setup(mobile, true);
    nodes['menu-cpu-button'].listeners.click();
    const button = nodes['start-character-cards'].buttons.find(node => node.getAttribute('data-character-id') === 'tsuyoshi');
    assert.ok(button);
    nodes['start-character-cards'].listeners.click({target: {closest: () => button}});
    assert.equal(nodes['start-costume-wrap'].classList.contains('hidden'), false);
    nodes['start-costume-select'].listeners.change({target: {value: 'summer'}});
    assert.equal(JSON.parse(storage.get('battle-a-la-carte:user-profile:v1')).costumes.tsuyoshi, 'summer');
    assert.match(nodes['start-character-cards'].innerHTML, /tsuyoshi-summer-standing.webp/);
    nodes['start-costume-select'].listeners.change({target: {value: 'default'}});
    assert.doesNotMatch(nodes['start-character-cards'].innerHTML, /tsuyoshi-summer-standing/);
    nodes['start-setup-button'].listeners.click();
    nodes['start-back-menu-button'].listeners.click();
    assert.equal(nodes['start-costume-select'].value, 'default');
});

for (const [htmlFile, cssFile] of [['web.html', 'style.css'], ['mobile/mobile.html', 'mobile/style-sp.css']]) {
    test(`${htmlFile}: standing grid fills the setup body while back/next stay outside its scroll area`, () => {
        const html = read(htmlFile), css = read(cssFile);
        const setupHtml = html.slice(html.indexOf('<div id="start-cpu-setup-stage"'), html.indexOf('<div id="start-story-stage"'));
        for (const id of ['start-character-cards', 'start-opponent-cards']) {
            assert.match(setupHtml, new RegExp(`id="${id}" class="start-char-select start-standing-grid" aria-label="[^?]+"`));
        }
        assert.match(setupHtml, /<div class="start-stage-footer">[^]*id="start-back-menu-button"[^]*id="start-setup-button"/);
        assert.ok(setupHtml.indexOf('start-stage-footer') > setupHtml.indexOf('start-turn-stage'));
        const grid = declarations(css, '#start-panel .start-standing-grid');
        assert.equal(grid['grid-template-columns'], 'repeat(2, minmax(0, 1fr))');
        assert.equal(grid['grid-template-rows'], 'repeat(2, minmax(0, 1fr))');
        assert.equal(declarations(css, '#app-stage[data-stage-width="1440"] #start-panel .start-standing-grid')['grid-template-columns'], 'repeat(4, minmax(0, 1fr))');
        assert.equal(declarations(css, '#app-stage[data-stage-width="1440"] #start-panel .start-standing-card')['aspect-ratio'], '2 / 3');
        const art = declarations(css, '#start-panel .start-standing-art');
        assert.equal(art.width, '100%'); assert.equal(art.height, '100%');
        assert.equal(art['object-fit'], 'cover'); assert.equal(art['object-position'], 'center top');
        assert.equal(declarations(css, '#start-panel .start-standing-plate').position, 'absolute');
        assert.ok(declarations(css, '#start-panel .start-standing-card.active').border.includes('#ffe490'));
        const body = declarations(css, '#start-panel #start-cpu-setup-stage > .start-stage-body');
        assert.equal(body.overflow, 'hidden');
        assert.equal(declarations(css, '#start-panel #start-character-step')['min-height'], '0');
        assert.equal(declarations(css, '#start-panel #start-mission-opponent-wrap')['min-height'], '0');
        assert.equal(declarations(css, '#start-panel .start-stage-footer').flex, '0 0 auto');
        assert.ok(parseInt(declarations(css, '#start-panel .start-stage-footer button')['min-height']) >= 44);
    });
}

test('standing art stays in setup, field/profile icons and both entry-page cache versions are retained', () => {
    for (const file of ['render.js', 'mobile/render-sp.js', 'profile.js']) assert.doesNotMatch(read(file), /standingPath|characters\/standing/);
    const icon = 'mai-icons-v3.webp';
    for (const file of ['style.css', 'mobile/style-sp.css']) assert.ok(read(file).includes('assets/battle-images/character-icons/' + icon));
    for (const [file, suffix] of [['web.html', ''], ['mobile/mobile.html', '-sp']]) {
        for (const asset of [`style${suffix}.css`, `render${suffix}.js`, `main${suffix}.js`, 'battle-images.js']) {
            const version = asset.startsWith('main') ? '20261010-u6b' : '20261007-osananajimi105a';
            assert.ok(read(file).includes(`${asset}?v=${version}`), `${file}: ${asset}`);
        }
        assert.doesNotMatch(read(file), /standing-src|standing\.png/);
    }
});
