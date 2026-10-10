const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const onlineFixture = require('./helpers/online-character-fixture.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function element() {
    const classes = new Set(['hidden']);
    const node = { children: [], dataset: {}, handlers: {}, textContent: '', disabled: false, scrollTop: 0,
        style: { setProperty(name, value) { this[name] = value; } }, focus() {} };
    node.classList = { add: (...ns) => ns.forEach(n => classes.add(n)), remove: (...ns) => ns.forEach(n => classes.delete(n)),
        contains: n => classes.has(n), toggle(n, on) { on ? classes.add(n) : classes.delete(n); } };
    node.appendChild = child => { node.children.push(child); return child; };
    node.append = (...children) => node.children.push(...children);
    node.setAttribute = () => {};
    node.addEventListener = (name, fn) => { (node.handlers[name] ||= []).push(fn); };
    node.fire = name => { const event = { preventDefault() {}, stopPropagation() {} };
        if (name === 'click') node.onclick?.(event);
        for (const fn of node.handlers[name] || []) fn(event); };
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { node.children = []; } });
    return node;
}

function runtime(mobile = false, reduced = false) {
    let now = 10000, next = 0;
    const jobs = new Map(), listeners = {}, storage = new Map();
    const ids = ['selection-panel', 'selection-title', 'selection-description', 'selection-options',
        'selection-confirm-button', 'selection-cancel-button', 'selection-field-view-button', 'selection-return-button',
        'game-container', 'spotlight-overlay', 'spotlight-badge', 'spotlight-card', 'spotlight-art', 'spotlight-name',
        'spotlight-sub', 'spotlight-close-button', 'event-confirm-panel', 'event-confirm-description', 'skill-confirm-panel'];
    const nodes = Object.fromEntries(ids.map(id => [id, element()]));
    const c = vm.createContext({ console,
        document: { getElementById: id => nodes[id] || null, createElement: element, querySelectorAll: () => [], addEventListener() {} },
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        matchMedia: () => ({ matches: reduced }),
        Date: class extends Date { static now() { return now; } },
        setTimeout(fn, ms = 0) { const id = ++next; jobs.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: id => jobs.delete(id),
        StageLayout: { getScale: () => 1 },
        addLog() {}, playSfx() {}, clearSavedMatch() {}
    });
    c.window = c;
    for (const name of ['cards', 'state', 'rules', 'player', 'cpu', 'main', 'render']) {
        const file = mobile ? `mobile/${name}-sp.js` : `${name}.js`;
        vm.runInContext(read(file), c, { filename: file });
    }
    vm.runInContext(read('dish-effects.js'), c);
    c.getEventImagePath = name => `/event/${name}`;
    c.getBattleViewModel = () => ({ me: c.GameState.players.player, opponent: c.GameState.players.cpu, turn: 'me' });
    c.BattleImages = { lightPath: name => name };
    c.addLog = () => {};
    c.updateUI = () => { c.renderSelectionPanel(); c.renderEventConfirmPanel(); c.suspendSelectionPanelsForPresentation(); };
    Object.assign(c.GameState, { players: { player: c.createPlayerState(), cpu: c.createPlayerState() },
        selectionMode: null, currentTurn: 'player', currentPhase: 'メインフェイズ', turnNumber: 2,
        matchStartedAt: 1000, gameEnded: false, deck: [], discard: [], candidateRecipes: [] });
    function tick(ms) {
        const end = now + ms;
        while (true) {
            const entry = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            const [id, job] = entry; jobs.delete(id); now = job.at; job.fn();
        }
        now = end;
    }
    const visible = id => !nodes[id].classList.contains('hidden');
    return { c, nodes, jobs, listeners, tick, visible };
}

function prepareEvent(r, name = '物々交換') {
    const { c } = r, s = c.GameState;
    s.players.player.hand = [{ id: 'mine', type: 'ingredient', name: 'ごはん' }];
    s.players.cpu.hand = [{ id: 'theirs', type: 'ingredient', name: '魚' }];
    s.players.player.events = [{ id: 'evt', type: 'event', name }];
    c.playerUseEvent('evt');
    c.confirmEventCard();
    assert.equal(s.selectionMode, 'event-target');
}

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    for (const mode of ['normal', 'short', 'skip', 'reduced']) {
        test(`${label}: ${mode} event selection waits for activation completion`, () => {
            const r = runtime(mobile, mode === 'reduced'), { c } = r;
            c.DishEffects.save({ dishMode: mode === 'reduced' ? 'normal' : mode });
            prepareEvent(r);
            const duration = mode === 'normal' ? 2000 : mode === 'short' ? 650 : mode === 'reduced' ? 450 : 0;
            if (duration) {
                assert.equal(r.visible('selection-panel'), false);
                assert.equal(r.visible('event-confirm-panel'), false);
                assert.equal(r.visible('spotlight-overlay'), true);
                assert.equal(r.nodes['spotlight-overlay'].classList.contains('spotlight-still'), mode === 'reduced');
                r.tick(duration - 1);
                c.updateUI(); // unrelated redraw must not reveal the modal early
                assert.equal(r.visible('selection-panel'), false);
                r.tick(1);
            }
            assert.equal(r.visible('selection-panel'), true);
            assert.equal(r.visible('spotlight-overlay'), false);
            assert.equal(c.GameState.players.player.events.length, 1); // still unconsumed
        });
    }

    test(`${label}: tap ends the wait, board peek keeps selections, cancel consumes nothing`, () => {
        const r = runtime(mobile), { c } = r;
        c.bindMainEvents();
        c.bindMainEvents();
        assert.equal(r.listeners.resize.length, 1);
        assert.equal(r.listeners.orientationchange.length, 1);
        prepareEvent(r);
        r.nodes['spotlight-overlay'].fire('click');
        assert.equal(r.visible('selection-panel'), true);
        c.toggleEventTargetSelection('theirs');
        c.hideSelectionForFieldView();
        assert.equal(r.visible('selection-panel'), false);
        assert.equal(r.visible('selection-return-button'), true);
        c.restoreSelectionFromFieldView();
        assert.deepEqual(Array.from(c.GameState.selectedTargetIds), ['theirs']);
        assert.equal(r.visible('selection-panel'), true);
        c.cancelEventSelection();
        r.tick(10000);
        assert.equal(r.visible('selection-panel'), false);
        assert.equal(c.GameState.selectionMode, null);
        assert.equal(c.GameState.players.player.events.length, 1);
        assert.equal(c.GameState.discard.length, 0);
        assert.equal(c.GameState.players.player.usedEventThisTurn, false);
    });

    test(`${label}: repeated tap/timer and confirmation resolve the exchange only once`, () => {
        const r = runtime(mobile), { c } = r;
        prepareEvent(r);
        c.hideSpotlightCard(); c.hideSpotlightCard();
        c.toggleEventTargetSelection('theirs'); c.confirmEventSelection();
        c.toggleEventTargetSelection('mine'); c.confirmEventSelection();
        c.confirmEventSelection(); r.tick(10000);
        assert.equal(c.GameState.selectionMode, null);
        assert.equal(c.GameState.players.player.events.length, 0);
        assert.equal(c.GameState.discard.filter(card => card.id === 'evt').length, 1);
        assert.deepEqual(Array.from(c.GameState.players.player.hand, card => card.id), ['theirs']);
        assert.deepEqual(Array.from(c.GameState.players.cpu.hand, card => card.id), ['mine']);
    });

    test(`${label}: skill targets follow one preview and cancelling allows a fresh attempt`, () => {
        const r = runtime(mobile), { c } = r, s = c.GameState;
        s.players.player.selectedSkillKey = 'foodTrap';
        s.players.player.hand = [{ id: 'trap', type: 'ingredient', name: '魚' }];
        s.players.player.events = [{ id: 'cost', type: 'event', name: '食材探索' }];
        c.playerUseSkill(); c.confirmSkillActivation();
        assert.equal(s.selectionMode, 'skill-target');
        assert.equal(r.visible('selection-panel'), false);
        assert.equal(r.visible('spotlight-overlay'), true);
        c.hideSpotlightCard(); c.cancelEventSelection();
        assert.equal(s.players.player.events.length, 1);
        assert.equal(c.getSkillUseCount(s.players.player, 'foodTrap'), 0);
        c.playerUseSkill(); c.confirmSkillActivation();
        assert.equal(r.visible('spotlight-overlay'), true);
        c.hideSpotlightCard();
        c.toggleEventTargetSelection('trap'); c.confirmEventSelection(); c.confirmEventSelection();
        assert.equal(r.visible('spotlight-overlay'), false); // no replay at resolution
        assert.equal(c.getSkillUseCount(s.players.player, 'foodTrap'), 1);
        assert.equal(s.discard.filter(card => card.id === 'cost').length, 0);
        assert.equal(s.players.cpu.set.filter(card => card.id === 'trap').length, 1);
    });

    test(`${label}: skill cost selection follows its preview and cancels or resolves once`, () => {
        const r = runtime(mobile), { c } = r, s = c.GameState;
        s.players.player.selectedSkillKey = 'tasteThief';
        s.players.cpu.score = 3;
        s.players.player.events = [{ id: 'cost', type: 'event', name: '食材探索' }];
        c.playerUseSkill(); c.confirmSkillActivation();
        assert.equal(s.pendingSkillContext.step, 0);
        assert.equal(r.visible('selection-panel'), false);
        c.hideSpotlightCard(); c.cancelEventSelection();
        assert.equal(s.players.player.events.length, 1);
        assert.equal(s.players.player.score, 0);
        c.playerUseSkill(); c.confirmSkillActivation(); c.hideSpotlightCard();
        c.toggleEventTargetSelection('cost'); c.confirmEventSelection(); c.confirmEventSelection();
        assert.equal(r.visible('spotlight-overlay'), false);
        assert.equal(s.discard.filter(card => card.id === 'cost').length, 1);
        assert.equal(s.players.player.score, 1);
        assert.equal(s.players.cpu.score, 2);
        assert.equal(c.getSkillUseCount(s.players.player, 'tasteThief'), 1);
    });

    test(`${label}: Roman reveal selection waits for the skill cut-in without restarting it`, () => {
        const r = runtime(mobile), { c } = r, s = c.GameState;
        s.players.player.selectedSkillKey = 'makanaiSupply';
        s.players.player.events = [{ id: 'cost', type: 'event', name: '食材探索' }];
        s.deck = Array.from({ length: 7 }, (_, i) => ({ id: `roman-${i}`, type: 'ingredient', name: '魚' }));
        c.playerUseSkill(); c.confirmSkillActivation();
        assert.equal(s.selectionMode, 'skill-target');
        assert.ok(Array.isArray(s.pendingSkillContext.openedCards));
        assert.equal(r.visible('selection-panel'), false);
        assert.equal(r.visible('spotlight-overlay'), true);
        c.hideSpotlightCard();
        assert.equal(r.visible('selection-panel'), true);
        assert.equal(r.visible('spotlight-overlay'), false);
        c.confirmEventSelection();
        assert.equal(c.getSkillUseCount(s.players.player, 'makanaiSupply'), 1);
    });

    test(`${label}: CPU/processing async effects finish on tap exactly once`, async () => {
        const r = runtime(mobile), { c } = r;
        let finished = 0;
        c.showSpotlightEventCardAsync({ name: '食材探索' }).then(() => finished++);
        c.hideSpotlightCard(); c.hideSpotlightCard();
        await flush();
        assert.equal(finished, 1);
        r.tick(10000); await flush(); assert.equal(finished, 1);
        c.GameState.players.player.score = 4;
        c.playerBuyPack('board');
        const buying = c.confirmPackPurchase();
        assert.equal(c.GameState.selectionMode, 'pack-resolving');
        c.confirmPackPurchase(); // repeated input cannot buy twice
        c.hideSpotlightCard(); await buying;
        assert.equal(c.GameState.players.player.packs.filter(pack => pack.key === 'board').length, 1);
        assert.equal(c.GameState.players.player.score, 1);
    });

    test(`${label}: Mode selection stays hidden across all cut-in steps and tap skips the sequence`, async () => {
        const r = runtime(mobile), { c } = r;
        prepareEvent(r); c.hideSpotlightCard();
        const sequence = c.showBattleALaCarteModeCutinAsync('player');
        c.updateUI(); assert.equal(r.visible('selection-panel'), false);
        r.tick(1000); await flush();
        assert.equal(r.visible('selection-panel'), false);
        c.hideSpotlightCard(); await sequence;
        assert.equal(r.visible('selection-panel'), true);
        r.tick(10000); await flush();
        assert.equal(r.visible('spotlight-overlay'), false);
    });

    test(`${label}: natural Mode completion opens selection after the last step, replacement cancels stale steps`, async () => {
        const r = runtime(mobile), { c } = r;
        prepareEvent(r); c.hideSpotlightCard();
        const sequence = c.showBattleALaCarteModeCutinAsync('player');
        for (const ms of [1000, 2000]) {
            r.tick(ms); await flush();
            assert.equal(r.visible('selection-panel'), false);
        }
        r.tick(2999); assert.equal(r.visible('selection-panel'), false);
        r.tick(1); await sequence;
        assert.equal(r.visible('selection-panel'), true);
        const old = c.showBattleALaCarteModeCutinAsync('player');
        c.showSpotlightEventCard({ name: '食材探索' });
        await old;
        assert.equal(r.nodes['spotlight-name'].textContent, '食材探索');
        assert.equal(r.visible('selection-panel'), false);
        r.tick(2000); await flush();
        assert.equal(r.visible('selection-panel'), true);
        assert.equal(r.visible('spotlight-overlay'), false);
    });

    test(`${label}: creative cooking with nine cards, search, emergency and discard pickup keep every target after tap`, () => {
        for (const name of ['創作料理', '食材探索', '緊急料理', 'ゴミ収集車']) {
            const r = runtime(mobile), { c } = r, s = c.GameState;
            s.players.player.hand = Array.from({ length: 9 }, (_, i) => ({ id: `ingredient-${i}`, type: 'ingredient', name: 'ごはん' }));
            s.deck = [{ id: 'deck', type: 'ingredient', name: '魚' }];
            s.discard = [{ id: 'pickup', type: 'ingredient', name: 'のり' }];
            s.players.player.events = [{ id: 'event', type: 'event', name }];
            c.playerUseEvent('event'); c.confirmEventCard();
            assert.equal(s.selectionMode, 'event-target', name);
            assert.equal(r.visible('selection-panel'), false, name);
            const count = s.pendingEventContext.options.length;
            c.hideSpotlightCard();
            assert.equal(r.visible('selection-panel'), true, name);
            assert.equal(r.nodes['selection-options'].children.length, count, name);
            if (name === '創作料理') assert.match(r.nodes['selection-title'].textContent, /全9枚/);
            c.cancelEventSelection();
            assert.equal(s.players.player.events.length, 1, name);
        }
    });

    test(`${label}: GUEST snapshot starts effects before rendering and repeated revision does not replay`, () => {
        const r = runtime(mobile), { c } = r;
        const source = read('network.js');
        Object.assign(c, { pending: null, revision: 0, stopped: false, started: true, metrics: null,
            quickConfirm: null, status() {}, $: id => c.document.getElementById(id) });
        onlineFixture.install(c);
        vm.runInContext(source.slice(source.indexOf('    function applyView('), source.indexOf('    async function sync(')), c);
        const row = { revision: 1, payload: { state: { characterIds: { ...c.GameState.characterIds }, selectionMode: 'event-target', pendingEventContext: {
            actor: 'player', source: 'event', eventCardId: 'evt', eventName: '創作料理',
            options: [{ id: 'a', label: 'ごはん' }], minSelect: 1, maxSelect: 1 }, selectedTargetIds: [] },
            effects: [{ name: 'showSpotlightEventCard', args: [{ name: '創作料理' }] }] } };
        const frames = [], render = c.updateUI;
        c.updateUI = () => { render(); frames.push(r.visible('selection-panel')); };
        c.applyView(row);
        assert.deepEqual(frames, [false]);
        c.hideSpotlightCard(); assert.equal(r.visible('selection-panel'), true);
        c.applyView(row); assert.equal(r.visible('spotlight-overlay'), false);
        c.cancelEventSelection();
        assert.equal(c.GameState.selectionMode, null);
    });

    test(`${label}: ending/replacing a match during the effect cannot restore stale selection`, () => {
        const r = runtime(mobile), { c } = r;
        prepareEvent(r);
        c.GameState.gameEnded = true; c.GameState.selectionMode = null; c.GameState.pendingEventContext = null;
        c.GameState.matchStartedAt = 2000;
        r.tick(10000);
        assert.equal(r.visible('selection-panel'), false);
        assert.equal(c.GameState.selectionMode, null);
    });
}

test('header and action-row structure, sizes and separate columns match in PC and phone HTML/CSS', () => {
    const viewports = [[1440, 900], [1366, 768], [390, 844], [360, 740], [844, 390]];
    const { computeStageScale } = require('../stage-layout.js');
    for (const mobile of [false, true]) {
        const html = read(mobile ? 'mobile/mobile.html' : 'web.html');
        const css = read(mobile ? 'mobile/style-sp.css' : 'style.css');
        const panel = html.slice(html.indexOf('<div id="selection-panel"'), html.indexOf('<div id="set-confirm-panel"'));
        assert.match(panel, /class="selection-header">\s*<h3 id="selection-title"[^]*?id="selection-field-view-button"[^]*?<\/div>\s*<div id="selection-description"/);
        assert.equal((panel.match(/id="selection-field-view-button"/g) || []).length, 1);
        const actions = panel.slice(panel.indexOf('<div class="selection-actions">'));
        assert.ok(!actions.includes('selection-field-view-button'));
        assert.match(actions, /selection-confirm-button[^]*?selection-cancel-button/);
        assert.match(css, /\.selection-header \{[^}]*grid-template-columns: minmax\(0, 1fr\) 104px/);
        assert.match(css, /#selection-panel \.selection-actions \{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)[^}]*gap: 14px/);
        assert.match(css, /#selection-panel \.selection-actions button \{[^}]*min-height: var\(--selection-touch-height, 56px\)/);
        assert.match(css, /\.spotlight-overlay\.spotlight-activation \{ pointer-events: auto/);
        for (const [width, height] of viewports) {
            const logical = mobile ? { width: 432, height: 768 } : { width: 1440, height: 810 };
            const scale = computeStageScale({ width, height }, logical);
            const r = runtime(mobile);
            r.c.StageLayout.getScale = () => scale;
            r.c.renderSelectionPanel();
            const actionHeight = parseFloat(r.nodes['selection-panel'].style['--selection-touch-height']);
            const headerHeight = parseFloat(r.nodes['selection-panel'].style['--selection-header-touch-height']);
            assert.ok(actionHeight * scale >= 48 - 1e-8, `${mobile}/${width}: action touch height`);
            assert.ok(headerHeight * scale >= 40 - 1e-8, `${mobile}/${width}: peek touch height`);
            const panelWidth = Math.min(.92 * logical.width, mobile ? 520 : 720);
            const contentWidth = panelWidth - (mobile ? 26 : 30);
            const titleWidth = contentWidth - 104 - 12;
            // Conservative all-Japanese wrapping budget, independent of actual font rendering.
            const titleLines = Math.ceil('イベント対象選択: 創作料理（全999枚）'.length * 18 / titleWidth);
            const header = Math.max(titleLines * 18 * 1.35, headerHeight);
            const fixed = 28 + header + 10 + 36 + 12 + 10 + actionHeight + 8;
            assert.ok(titleWidth > 0);
            assert.ok(contentWidth > 104 + 12);
            assert.ok(fixed < logical.height * .82, `${mobile}/${width}: header and actions fit with scroll space`);
            assert.ok((contentWidth - 14) / 3 > 70);
        }
    }
});
