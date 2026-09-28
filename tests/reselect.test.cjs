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
    const result = {
        children: [], dataset: {}, scrollTop: 0,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        },
        appendChild(child) { this.children.push(child); },
        addEventListener(name, handler) { this.handlers ||= {}; this.handlers[name] = handler; }
    };
    Object.defineProperty(result, 'innerHTML', { set() { this.children = []; this.scrollTop = 0; } });
    return result;
}

function local(mobile) {
    const prefix = mobile ? 'mobile/' : '';
    const suffix = mobile ? '-sp' : '';
    const ids = ['selection-panel', 'selection-title', 'selection-description', 'selection-options',
        'selection-confirm-button', 'selection-cancel-button'];
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    const state = { selectionMode: null, selectedTargetIds: [], selectedCardIds: [], discardNeedCount: 0 };
    const cards = ['A', 'B', 'C'].map(id => ({ id, name: id, type: 'ingredient' }));
    const c = vm.createContext({
        GameState: state, addLog() {}, updateUI() {},
        document: { getElementById: id => elements[id], createElement: element },
        getBattleViewModel: () => ({ me: { hand: cards, events: [] } })
    });
    c.window = c;
    vm.runInContext(read(`${prefix}player${suffix}.js`), c);
    vm.runInContext(read(`${prefix}render${suffix}.js`), c);
    c.updateUI = () => {};
    return { c, state, elements, cards };
}

for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile' : 'PC'} event, skill and discard choices reselect in click order`, () => {
        const { c, state, elements } = local(mobile);
        const options = ['A', 'B', 'C'].map(id => ({ id, label: id }));
        state.selectionMode = 'event-target';
        state.pendingEventContext = { eventName: '緊急料理', minSelect: 1, maxSelect: 1, options };
        c.toggleEventTargetSelection('A');
        c.renderSelectionPanel();
        assert.equal(elements['selection-options'].children[1].disabled, undefined);
        elements['selection-options'].children[1].handlers.click();
        assert.deepEqual(clone(state.selectedTargetIds), ['B']);
        c.toggleEventTargetSelection('B');
        assert.deepEqual(clone(state.selectedTargetIds), []);

        state.pendingEventContext = { eventName: '創作料理', minSelect: 2, maxSelect: 2, options };
        for (const id of ['A', 'B', 'C']) c.toggleEventTargetSelection(id);
        assert.deepEqual(clone(state.selectedTargetIds), ['B', 'C']);
        c.toggleEventTargetSelection('B');
        assert.deepEqual(clone(state.selectedTargetIds), ['C']);

        state.selectionMode = 'skill-target';
        state.selectedTargetIds = [];
        state.pendingSkillContext = { skillName: 'ロマン仕込み', minSelect: 0, maxSelect: 2,
            maxSelections: 2, options };
        for (const id of ['A', 'B', 'C']) c.toggleEventTargetSelection(id);
        assert.deepEqual(clone(state.selectedTargetIds), ['B', 'C']);

        state.selectionMode = 'discard';
        state.discardNeedCount = 1;
        state.selectedCardIds = [];
        c.toggleDiscardSelection('A');
        c.renderSelectionPanel();
        assert.equal(elements['selection-options'].children[1].disabled, undefined);
        elements['selection-options'].children[1].handlers.click();
        assert.deepEqual(clone(state.selectedCardIds), ['B']);
        c.toggleDiscardSelection('B');
        assert.deepEqual(clone(state.selectedCardIds), []);

        state.discardNeedCount = 2;
        for (const id of ['A', 'B', 'C']) c.toggleDiscardSelection(id);
        assert.deepEqual(clone(state.selectedCardIds), ['B', 'C']);
    });
}

function worker() {
    const c = vm.createContext({ console, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
    c.self = c;
    c.importScripts = (...names) => names.forEach(name =>
        vm.runInContext(read(name.split('?')[0]), c, { filename: name }));
    c.importScripts('battle-engine-worker.js');
    return c;
}

async function action(c, snapshot, role, id) {
    return c.execute({ kind: 'action', role, snapshot: clone(snapshot),
        action: { name: 'toggleEventTargetSelection', args: [id] } });
}

for (const role of ['host', 'guest']) {
    test(`worker ${role}: one full-selection toggle replaces, deselect-then-select also works`, async () => {
        const c = worker();
        let state = (await c.execute({ kind: 'init' })).snapshot;
        state.currentTurn = role === 'host' ? 'player' : 'cpu';
        state.selectionMode = 'event-target';
        state.pendingEventContext = {
            actor: state.currentTurn, eventName: '緊急料理', minSelect: 1, maxSelect: 1,
            options: ['A', 'B'].map(id => ({ id, label: id }))
        };
        state.selectedTargetIds = ['A'];
        let result = await action(c, state, role, 'B');
        assert.deepEqual(clone(result.snapshot.selectedTargetIds), ['B']);
        assert.deepEqual(clone(result.views[role].state.selectedTargetIds), ['B']);

        result = await action(c, state, role, 'A');
        assert.deepEqual(clone(result.snapshot.selectedTargetIds), []);
        result = await action(c, result.snapshot, role, 'B');
        assert.deepEqual(clone(result.snapshot.selectedTargetIds), ['B']);
    });
}
