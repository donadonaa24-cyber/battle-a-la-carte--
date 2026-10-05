const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function element() {
    const classes = new Set();
    const node = { children: [], dataset: {}, scrollTop: 0, style: {}, handlers: {},
        classList: { add: key => classes.add(key), remove: key => classes.delete(key),
            contains: key => classes.has(key), toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } },
        appendChild(child) { this.children.push(child); },
        addEventListener(name, handler) { this.handlers[name] = handler; }, setAttribute() {} };
    Object.defineProperty(node, 'innerHTML', { set() { this.children = []; this.scrollTop = 0; } });
    return node;
}
function runtime(mobile, quick) {
    const ids = ['game-container', 'selection-panel', 'selection-title', 'selection-description',
        'selection-options', 'selection-confirm-button', 'selection-cancel-button',
        'confirm-discard-button', 'player-hand-mixed', 'cook-button', 'player-skill-button', 'end-turn-button'];
    const nodes = Object.fromEntries(ids.map(id => [id, element()]));
    const hand = Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, name: `材料${i}`, type: 'ingredient' }));
    const events = Array.from({ length: 2 }, (_, i) => ({ id: `event-${i}`, name: `イベント${i}`, type: 'event' }));
    const state = { selectionMode: 'discard', selectedCardIds: [], discardNeedCount: 4,
        turnNumber: 2, gameEnded: false, discard: [], players: { player: { hand, events } } };
    const model = { turn: 'me', me: state.players.player };
    let finishes = 0;
    const c = vm.createContext({ console, GameState: state, localStorage: { getItem: () => null, setItem() {} },
        document: { getElementById: id => nodes[id] || null, createElement: element, addEventListener() {} },
        getBattleViewModel: () => model, addLog() {}, unlockAudio() {}, addEventListener() {}, setTimeout, clearTimeout });
    c.window = c;
    const prefix = mobile ? 'mobile/' : '', suffix = mobile ? '-sp' : '';
    for (const file of [`${prefix}player${suffix}.js`, `${prefix}render${suffix}.js`, `${prefix}main${suffix}.js`, 'quick-confirm.js']) {
        vm.runInContext(read(file), c, { filename: file });
    }
    c.QuickConfirm.setMode(quick ? 'quick' : 'standard');
    c.createFaceCard = card => Object.assign(element(), { cardId: card.id });
    c.shouldSkipSectionRender = () => false;
    c.startBgmOnce = () => {};
    c.hideDiscardBanner = () => {};
    c.removeCardByIdFromArray = (cards, id) => {
        const i = cards.findIndex(card => card.id === id);
        return i < 0 ? null : cards.splice(i, 1)[0];
    };
    c.moveCardToDiscard = card => state.discard.push(card);
    c.updateUI = () => { c.renderPlayerMixedHand(); c.renderSelectionPanel(); c.renderDiscardButton(); };
    c.finishPlayerTurn = () => { finishes++; c.updateUI(); };
    c.bindMainEvents();
    c.updateUI();
    return { c, state, model, nodes, finishes: () => finishes };
}

for (const mobile of [false, true]) for (const quick of [false, true]) {
    const label = `${mobile ? 'mobile' : 'PC'} ${quick ? 'quick' : 'standard'}`;
    test(`${label}: modal and field taps share live discard counts, highlights and oldest replacement`, () => {
        const { c, state, nodes, finishes } = runtime(mobile, quick);
        const check = count => {
            for (const id of ['selection-confirm-button', 'confirm-discard-button']) {
                assert.equal(nodes[id].textContent, `選んだ${count}枚を捨てる`);
                assert.equal(nodes[id].disabled, count !== 4);
            }
            const active = nodes['selection-options'].children.filter(node => node.classList.contains('active'));
            const field = nodes['player-hand-mixed'].children.filter(node => node.classList.contains('selected-card'));
            assert.equal(active.length, count); assert.equal(field.length, count);
            assert.deepEqual(field.map(node => node.cardId).sort(), clone(state.selectedCardIds).sort());
            assert.equal(finishes(), 0, 'selection never auto-confirms, including quick mode');
        };
        check(0);
        assert.ok(nodes['game-container'].classList.contains('discard-selection-active'));
        nodes['selection-options'].children[0].handlers.click(); check(1);
        nodes['player-hand-mixed'].children[4].handlers.click(); check(2);
        nodes['player-hand-mixed'].children[1].handlers.click(); check(3);
        nodes['selection-options'].children[5].handlers.click(); check(4);
        nodes['player-hand-mixed'].children[2].handlers.click(); check(4);
        assert.deepEqual(clone(state.selectedCardIds), ['event-0', 'card-1', 'event-1', 'card-2']);
        nodes['selection-options'].children[4].handlers.click(); check(3);
        nodes['player-hand-mixed'].children[4].handlers.click(); check(4);
        assert.equal(c.QuickConfirm.autoAction('confirmDiscardSelection'), null);
    });
    test(`${label}: both confirm buttons discard the same cards and finish the turn once`, () => {
        const results = [];
        for (const id of ['selection-confirm-button', 'confirm-discard-button']) {
            const { state, nodes, finishes } = runtime(mobile, quick);
            // The real confirm function also refuses an incomplete selection.
            nodes[id].onclick(); assert.equal(finishes(), 0); assert.equal(state.discard.length, 0);
            for (const i of [0, 1, 4, 5]) nodes['player-hand-mixed'].children[i].handlers.click();
            assert.equal(nodes[id].disabled, false);
            nodes[id].onclick();
            assert.equal(finishes(), 1);
            assert.equal(state.selectionMode, null);
            assert.ok(!nodes['game-container'].classList.contains('discard-selection-active'));
            assert.ok(nodes['confirm-discard-button'].classList.contains('hidden'));
            assert.ok(!nodes['cook-button'].classList.contains('hidden'));
            results.push(clone({ discard: state.discard, player: state.players.player }));
        }
        assert.deepEqual(results[0], results[1]);
        assert.deepEqual(results[0].discard.map(card => card.id), ['card-0', 'card-1', 'event-0', 'event-1']);
    });
}

for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile' : 'PC'}: field exceptions and both buttons remain disabled on the other turn or after game end`, () => {
        const { c, state, model, nodes } = runtime(mobile, false);
        state.selectedCardIds = ['card-0', 'card-1', 'event-0', 'event-1'];
        for (const [turn, ended] of [['opponent', false], ['me', true]]) {
            model.turn = turn; state.gameEnded = ended; c.updateUI();
            assert.equal(nodes['selection-confirm-button'].disabled, true);
            assert.equal(nodes['confirm-discard-button'].disabled, true);
            assert.ok(!nodes['game-container'].classList.contains('discard-selection-active'));
            assert.equal(nodes['player-hand-mixed'].children[0].handlers.click, undefined);
        }
    });
}

function declarations(css, selector) {
    const result = {};
    for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selectors.split(',').some(s => s.trim() === selector)) continue;
        for (const [, key, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) result[key] = value.trim();
    }
    return result;
}

for (const file of ['style.css', 'mobile/style-sp.css']) {
    test(`${file}: large full-width discard confirm and narrow shield exceptions leave other actions blocked`, () => {
        const css = read(file);
        const base = '#selection-panel[data-selection-key="discard"]';
        const button = declarations(css, `${base} #selection-confirm-button`);
        assert.equal(button.width, '100%'); assert.ok(parseInt(button['min-height']) >= 56);
        const mobile = declarations(css, `#app-stage[data-stage-width="432"] ${base} #selection-confirm-button`);
        assert.equal(mobile['min-height'], 'var(--selection-touch-height, 56px)');
        const backdrop = declarations(css, '.modal-input-backdrop');
        assert.equal(backdrop['pointer-events'], 'auto');
        const layer = parseInt(declarations(css, '#game-container.discard-selection-active')['--discard-input-layer']);
        const mobileLayer = parseInt(declarations(css, '#game-container.mobile-field-ui.discard-selection-active')['--discard-input-layer']);
        assert.ok((file === 'style.css' ? layer : mobileLayer) > parseInt(backdrop['z-index']));
        for (const selector of ['.player-hand-zone', '#confirm-discard-button']) {
            assert.equal(declarations(css, `#game-container.discard-selection-active ${selector}`)['z-index'], 'var(--discard-input-layer)');
        }
        assert.equal(declarations(css, '#game-container.discard-selection-active .player-hand-zone')['pointer-events'], 'none');
        assert.equal(declarations(css, '#game-container.discard-selection-active #player-hand-mixed')['pointer-events'], 'auto');
        for (const ancestor of ['.duel-field', '.player-side']) {
            assert.equal(declarations(css, `#game-container.mobile-field-ui.discard-selection-active ${ancestor}`)['z-index'], 'auto');
        }
        assert.equal(declarations(css, base).outline, 'none');
        assert.equal(declarations(css, base)['max-height'], 'calc(100cqh - 286px)');
        assert.equal(declarations(css, `#app-stage[data-stage-width="432"] ${base}`)['max-height'], '54cqh');
    });
}

test('PC and mobile keep the same shared discard rendering and toggle/confirm logic', () => {
    for (const name of ['renderSelectionPanel', 'renderDiscardButton', 'renderPlayerMixedHand']) {
        const re = new RegExp(`function ${name}\\([^]*?(?=\\nfunction |$)`);
        assert.equal(read('render.js').match(re)[0], read('mobile/render-sp.js').match(re)[0]);
    }
    assert.equal(read('player.js'), read('mobile/player-sp.js'));
});
