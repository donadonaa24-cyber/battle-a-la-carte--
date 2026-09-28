const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeElement() {
    const classes = new Set();
    const element = {
        children: [],
        dataset: {},
        scrollTop: 0,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: (name, force) => {
                if (force) classes.add(name);
                else classes.delete(name);
            }
        },
        appendChild(child) { this.children.push(child); },
        append(...children) { this.children.push(...children); },
        addEventListener(name, handler) { this.handlers ||= {}; this.handlers[name] = handler; }
    };
    Object.defineProperty(element, 'innerHTML', {
        get: () => '',
        set: () => { element.children = []; element.scrollTop = 0; }
    });
    return element;
}

function loadRenderer(file) {
    const ids = ['selection-panel', 'selection-title', 'selection-description', 'selection-options',
        'selection-confirm-button', 'selection-cancel-button', 'pile-view-panel', 'pile-view-title',
        'pile-view-description', 'pile-view-list'];
    const elements = Object.fromEntries(ids.map(id => [id, makeElement()]));
    const selected = [];
    const state = {
        selectionMode: 'event-target',
        pendingEventContext: {
            eventName: 'ゴミ収集車', description: '1枚選択', minSelect: 1, maxSelect: 1,
            options: Array.from({ length: 25 }, (_, index) => ({ id: `card-${index}`, label: `材料${index}` }))
        },
        selectedTargetIds: [],
        ui: { pileViewType: null },
        deck: [],
        discard: []
    };
    const context = vm.createContext({
        document: { getElementById: id => elements[id], createElement: makeElement },
        window: {},
        GameState: state,
        getBattleViewModel: () => ({ me: { hand: [], events: [] } }),
        toggleEventTargetSelection: id => selected.push(id),
        toggleDiscardSelection: id => selected.push(id)
    });
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    return { context, elements, selected, state };
}

for (const file of ['render.js', 'mobile/render-sp.js']) {
    test(`${file}: 25 selection cards remain available after scrolling and selecting`, () => {
        const { context, elements, selected, state } = loadRenderer(file);
        vm.runInContext('renderSelectionPanel()', context);
        const options = elements['selection-options'];
        assert.equal(options.children.length, 25);
        assert.match(elements['selection-title'].textContent, /全25枚/);
        options.scrollTop = 480;
        options.children[24].handlers.click();
        assert.deepEqual(selected, ['card-24']);
        state.selectedTargetIds = ['card-24'];
        vm.runInContext('renderSelectionPanel()', context);
        assert.equal(options.scrollTop, 480);
        assert.equal(options.children[24].classList.contains('active'), true);
        assert.equal(elements['selection-confirm-button'].disabled, false);
    });

    test(`${file}: discard adjustment and pile viewer include every card`, () => {
        const { context, elements, selected, state } = loadRenderer(file);
        const cards = Array.from({ length: 25 }, (_, index) => ({
            id: `discard-${index}`, name: `材料${index}`, type: 'ingredient'
        }));
        state.selectionMode = 'discard';
        state.discardNeedCount = 1;
        state.selectedCardIds = [];
        context.getBattleViewModel = () => ({ me: { hand: cards, events: [] } });
        vm.runInContext('renderSelectionPanel()', context);
        const options = elements['selection-options'];
        assert.equal(options.children.length, 25);
        assert.equal(elements['selection-cancel-button'].classList.contains('hidden'), true);
        options.children[24].handlers.click();
        assert.deepEqual(selected, ['discard-24']);

        state.discard = cards;
        state.ui.pileViewType = 'discard';
        vm.runInContext('renderPileViewPanel()', context);
        const list = elements['pile-view-list'];
        assert.equal(list.children.length, 25);
        assert.equal(list.children[24].children[0].textContent, '材料0');
        assert.match(elements['pile-view-title'].textContent, /全25枚/);
    });
}
