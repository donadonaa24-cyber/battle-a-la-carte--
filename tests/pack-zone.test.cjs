const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function between(source, start, end) {
    const first = source.indexOf(`function ${start}(`);
    let last = source.indexOf(`function ${end}(`, first);
    if (source.slice(last - 6, last) === 'async ') last -= 6;
    assert.ok(first >= 0 && last > first, `${start} / ${end}`);
    return source.slice(first, last);
}

function element(id = '') {
    const classes = new Set(['hidden']);
    const listeners = new Map();
    const node = {
        id, children: [], attributes: {}, textContent: '', disabled: false,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name) || String(node.className || '').split(/\s+/).includes(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        },
        set innerHTML(value) { this._html = value; this.children = []; },
        get innerHTML() { return this._html || ''; },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, listener) { listeners.set(name, listener); },
        appendChild(child) { this.children.push(child); },
        click() { listeners.get('click')?.(); }
    };
    return node;
}

function setup(mobile, online) {
    const prefix = mobile ? 'mobile/' : '';
    const suffix = mobile ? '-sp' : '';
    const source = read(`${prefix}render${suffix}.js`);
    const main = read(`${prefix}main${suffix}.js`);
    const player = read(`${prefix}player${suffix}.js`);
    const nodes = Object.fromEntries(['player-packs', 'cpu-packs', 'pack-confirm-panel',
        'pack-confirm-description', 'pack-confirm-yes-button'].map(id => [id, element(id)]));
    const actions = [];
    const spotlights = [];
    const c = vm.createContext({
        console,
        GameState: {
            players: {player: {score: 0, packs: []}, cpu: {score: 0, packs: []}},
            currentTurn: 'player', selectionMode: null, gameEnded: false, pendingPackKey: null
        },
        FriendBattle: {isActive: () => online},
        document: {createElement: () => element()},
        byId: id => nodes[id] || null,
        getPackImagePath: () => null,
        createCardTextBlock: (card, node) => { node.textContent = card.name; },
        getDetailedPackEffectText: () => '効果説明',
        escapeHtml: value => String(value),
        addLog() {},
        showSpotlightCard: options => spotlights.push(options)
    });
    c.window = c;
    vm.runInContext(`
        let renderSectionSignatureCache = {};
        let packShopOpen = false;
        let packPreviewKey = null;
        const packDefinitions = [
            {key: 'ecoBag', name: 'エコバッグ', cost: 2},
            {key: 'freezer', name: '冷蔵庫', cost: 2},
            {key: 'board', name: 'まな板', cost: 3}
        ];
        function getPackDefinition(key) { return packDefinitions.find(item => item.key === key); }
        function hasPack(p, key) { return p.packs.some(item => item.key === key); }
        function canBuyPack(p, key) { const def = getPackDefinition(key); return !!def && p.score >= def.cost && !hasPack(p, key); }
    `, c);
    vm.runInContext(read('battle-view-model.js'), c);
    for (const [text, start, end] of [
        [source, 'shouldSkipSectionRender', 'getIngredientImagePath'],
        [source, 'getPackConditionWarning', 'ensureUiState'],
        [source, 'renderPacks', 'createDishCardElement'],
        [source, 'renderPackConfirmPanel', 'getPlayerEventConditionWarning'],
        [source, 'openPackShop', 'closePackShop'],
        [main, 'showFieldPackDetails', 'prepareMatchFinale'],
        [player, 'playerBuyPack', 'confirmPackPurchase']
    ]) vm.runInContext(between(text, start, end), c);
    c.updateUI = () => {
        c.renderPacks(c.getBattleViewModel().me, nodes['player-packs']);
        c.renderPacks(c.getBattleViewModel().opponent, nodes['cpu-packs']);
        c.renderPackConfirmPanel();
    };
    const originalBuy = c.playerBuyPack;
    c.window.playerBuyPack = key => { actions.push(key); originalBuy(key); };
    return {c, nodes, actions, spotlights};
}

for (const mobile of [false, true]) {
    for (const online of [false, true]) {
        const label = `${mobile ? 'mobile' : 'PC'} ${online ? 'online guest' : 'CPU match'}`;
        test(`${label}: cached pack click uses current score and normal buy action`, () => {
            const {c, nodes, actions} = setup(mobile, online);
            c.updateUI();
            const board = nodes['player-packs'].children[2];
            assert.equal(board.classList.contains('unowned-pack'), true);
            c.GameState.players.player.score = 3;
            c.updateUI();
            assert.equal(nodes['player-packs'].children[2], board, 'pack section was skipped');
            board.click();
            assert.deepEqual(actions, ['board']);
            assert.equal(c.GameState.selectionMode, 'pack-confirm');
            assert.equal(c.GameState.pendingPackKey, 'board');
            assert.equal(nodes['pack-confirm-panel'].classList.contains('hidden'), false);
            assert.equal(nodes['pack-confirm-yes-button'].disabled, false);
            assert.doesNotMatch(nodes['pack-confirm-description'].innerHTML, /交換条件が満たせません/);
        });

        test(`${label}: opponent has three view-only packs with current ownership`, () => {
            const {c, nodes, actions, spotlights} = setup(mobile, online);
            c.updateUI();
            const packs = nodes['cpu-packs'].children;
            assert.equal(packs.length, 3);
            assert.ok(packs.every(pack => pack.classList.contains('unowned-pack')));
            packs[0].click();
            assert.match(spotlights.at(-1).sub, /所持状況: 未所持/);
            assert.match(spotlights.at(-1).sub, /効果: 効果説明/);
            assert.deepEqual(actions, []);
            assert.equal(c.GameState.selectionMode, null);
            c.GameState.players.cpu.packs.push({key: 'ecoBag', name: 'エコバッグ'});
            c.updateUI();
            assert.equal(nodes['cpu-packs'].children[0].classList.contains('unowned-pack'), false);
            nodes['cpu-packs'].children[0].click();
            assert.match(spotlights.at(-1).sub, /所持状況: 所持/);
            assert.deepEqual(actions, []);
        });
    }
}
