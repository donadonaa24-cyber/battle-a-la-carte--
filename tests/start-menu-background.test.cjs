const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { computeStageScale } = require('../stage-layout.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const retired = /start-menu-floating-bg|menu-floating-card|start-menu-card-(?:fade|glow)|startMenuFloatTimer|START_MENU_CARD_|(?:getStartMenuFloatImagePool|spawnMenuFloatingCard|startMenuFloatingBackground|stopMenuFloatingBackground)/;
const viewports = [[1440, 900], [1366, 768], [390, 844], [360, 740], [844, 390]];

function declarations(css, selector) {
    const result = {};
    for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selectors.split(',').some(value => value.trim() === selector)) continue;
        for (const [, name, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) result[name] = value.trim();
    }
    return result;
}

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    const htmlFile = mobile ? 'mobile/mobile.html' : 'web.html';
    const cssFile = mobile ? 'mobile/style-sp.css' : 'style.css';
    const mainFile = mobile ? 'mobile/main-sp.js' : 'main.js';
    const html = read(htmlFile), css = read(cssFile);
    const menu = html.slice(html.indexOf('<div id="start-menu-stage"'), html.indexOf('<div id="start-settings-stage"'));

    test(`${label}: random-card DOM, generators, animation and timers are retired`, () => {
        for (const file of [htmlFile, cssFile, mainFile, 'story-adv.js']) assert.doesNotMatch(read(file), retired, file);
        assert.match(menu, /start-menu-content[\s\S]*start-menu-player-card[\s\S]*start-menu-buttons/);
        assert.doesNotMatch(menu, /<img\b|aria-hidden="true"/);
    });

    test(`${label}: a complete card back fills the menu background, with an existing selected-sleeve fallback`, () => {
        const art = declarations(css, '#start-menu-stage::before');
        const prefix = mobile ? '../' : '';
        assert.equal(art['background-image'], `var(--selected-card-back, url("${prefix}assets/battle-images/card-back.webp"))`);
        assert.ok(fs.existsSync(path.resolve(root, path.dirname(cssFile), prefix + 'assets/battle-images/card-back.webp')));
        assert.equal(art['background-size'], 'contain', 'show the entire card rather than a cropped card face');
        assert.equal(art['background-position'], 'center');
        assert.equal(art['background-repeat'], 'no-repeat');
        assert.ok(Number(art.opacity) >= .08 && Number(art.opacity) <= .15);
        assert.match(declarations(css, '#start-menu-stage::after').background, /radial-gradient\(ellipse at center, transparent/);
        const content = declarations(css, '.start-menu-content');
        assert.equal(content['z-index'], '1');
        assert.ok(!content.opacity && !content.filter, 'text and controls retain their full opacity');
        assert.equal(declarations(css, '#start-menu-stage').isolation, 'isolate');
        assert.equal(declarations(css, '#start-panel #start-menu-stage .start-stage-footer').background, 'rgba(11, 30, 78, 0.72)');
    });

    test(`${label}: default and reduced-motion backgrounds stay still and cannot intercept input`, () => {
        for (const selector of ['#start-menu-stage::before', '#start-menu-stage::after']) {
            const layer = declarations(css, selector);
            assert.equal(layer['pointer-events'], 'none');
            assert.equal(layer.animation, 'none');
            assert.equal(layer.transition, 'none');
        }
        const reduced = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*#start-menu-stage::before,\s*#start-menu-stage::after\s*\{([^}]+)\}/);
        assert.ok(reduced, 'an explicit reduced-motion rule covers both artwork and vignette');
        assert.match(reduced[1], /animation:\s*none;/);
        assert.match(reduced[1], /transition:\s*none;/);
    });

    test(`${label}: repeated menu entry and exit refreshes player information without creating cards or timers`, () => {
        const classes = new Map(['start-title-stage', 'start-menu-stage', 'start-settings-stage', 'start-cpu-setup-stage'].map(id => [id, new Set(['hidden'])]));
        let renders = 0, music = 0;
        const forbidden = () => { throw new Error('Background must not allocate DOM or schedule a timer'); };
        const c = vm.createContext({ console, addEventListener() {}, setTimeout: forbidden, setInterval: forbidden, clearTimeout: forbidden, clearInterval: forbidden,
            document: { addEventListener() {}, createElement: forbidden, getElementById(id) {
                const names = classes.get(id);
                return names ? { classList: { toggle(name, on) { if (on) names.add(name); else names.delete(name); } } } : null;
            } }, playTitleBGM() { music++; } });
        c.window = c;
        vm.runInContext(read(mainFile), c, { filename: mainFile });
        c.renderStartMenuPlayerCard = () => { renders++; };
        for (let i = 0; i < 3; i++) {
            c.showStartStage('start-menu-stage');
            assert.ok(!classes.get('start-menu-stage').has('hidden'));
            c.showStartStage('start-settings-stage');
            assert.ok(classes.get('start-menu-stage').has('hidden'));
            c.showStartStage('start-cpu-setup-stage');
        }
        assert.equal(renders, 3);
        assert.equal(music, 3);
    });

    test(`${label}: saved sleeve and default updates reach the background through the existing CSS variable`, () => {
        const values = new Map();
        const storage = new Map([['balc_missions_v1', JSON.stringify({ cleared: { noItems: '2026-10-04' }, selectedSleeve: 'noItems' })]]);
        const c = vm.createContext({ console, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null,
            documentElement: { style: { setProperty: (name, value) => values.set(name, value) } } },
            location: { pathname: mobile ? '/mobile/mobile.html' : '/web.html' },
            localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
        c.window = c;
        vm.runInContext(read('missions.js'), c);
        c.Missions.applySleeve();
        assert.equal(values.get('--selected-card-back'), `url("${mobile ? '../' : ''}assets/battle-images/sleeves/sleeve-no-items.webp")`);
        assert.equal(c.Missions.selectSleeve('default'), true);
        assert.equal(values.get('--selected-card-back'), `url("${mobile ? '../' : ''}assets/battle-images/card-back.webp")`);
        assert.equal(c.Missions.selectSleeve('nonexistent'), false);
        assert.equal(c.Missions.getCardBackPath(), `${mobile ? '../' : ''}assets/battle-images/card-back.webp`);
    });

    for (const [width, height] of viewports) test(`${label}: ${width}x${height} has no new background scroll footprint (offline constraints)`, () => {
        const logical = mobile ? { width: 432, height: 768 } : { width: 1440, height: 810 };
        assert.match(html, new RegExp(`data-stage-width="${logical.width}" data-stage-height="${logical.height}"`));
        const scale = computeStageScale({ width, height }, logical);
        assert.ok(logical.width * scale <= width + .0001);
        assert.ok(logical.height * scale <= height + .0001);
        for (const selector of ['#start-menu-stage::before', '#start-menu-stage::after']) {
            const layer = declarations(css, selector);
            assert.equal(layer.position, 'absolute');
            assert.equal(layer.inset, '0');
            for (const property of ['width', 'height', 'min-width', 'min-height', 'margin', 'padding', 'transform']) assert.ok(!layer[property], property);
        }
        assert.equal(declarations(css, '#start-menu-stage').overflow, 'hidden');
        const panel = declarations(css, '#start-panel');
        assert.equal(panel.height, 'min(86cqh, 760px)');
        assert.equal(panel.overflow, 'hidden');
        assert.equal(declarations(css, '#start-panel .start-menu-content')['min-height'], '0');
        assert.equal(declarations(css, '#start-panel .start-stage-footer').flex, '0 0 auto');
        // A conservative logical-stage budget includes the resume button and profile title.
        // Font wrapping and actual browser scroll measurements are deliberately not claimed.
        const innerHeight = logical.height * .86 - 2 - 24 - 8;
        const headerAndGaps = 64 + 20;
        const footerHeight = 6 * 44 + 5 * 8 + 9;
        const profileAndNotice = (22 + 52 + 2 * 6 + 16.5 + 32) + (44 + 10 + 4);
        assert.ok(profileAndNotice <= innerHeight - headerAndGaps - footerHeight);
    });
}

test('PC/mobile artwork matches apart from the relative image URL and only changed asset keys are bumped', () => {
    const block = css => css.slice(css.indexOf('#start-menu-stage {'), css.indexOf('.start-title {', css.indexOf('#start-menu-stage {')));
    assert.equal(block(read('style.css')), block(read('mobile/style-sp.css')).replaceAll('../assets/', 'assets/'));
    for (const [file, suffix] of [['web.html', ''], ['mobile/mobile.html', '-sp']]) {
        const html = read(file);
        for (const name of [`style${suffix}.css`, `main${suffix}.js`]) assert.ok(html.includes(`${name}?v=${name.startsWith('main') ? '20261007-osananajimi105a' : '20261007-osananajimi105a'}`));
        for (const name of [`render${suffix}.js`, 'network.js']) assert.ok(html.includes(`${name}?v=${name.startsWith('render') ? '20261007-osananajimi105a' : '20261007-osananajimi105a'}`));
        assert.ok(html.includes('profile.js?v=20261007-osananajimi105a'));
        assert.ok(html.includes('missions.js?v=20261004-story-viewer1'));
        assert.ok(html.includes('story-adv.js?v=20261007-osananajimi105a'));
    }
});
