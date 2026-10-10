const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function section(source, start, end) {
    const first = source.indexOf(`function ${start}(`);
    const last = source.indexOf(`function ${end}(`, first);
    assert.ok(first >= 0 && last > first, `${start} / ${end}`);
    return source.slice(first, last);
}

function element(id = '') {
    const node = { id, children: [], dataset: {}, style: {}, attributes: {}, scrollTop: 0, textContent: '', handlers: {} };
    const classes = new Set();
    Object.defineProperty(node, 'className', {
        get: () => [...classes].join(' '),
        set: value => { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); }
    });
    node.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
    };
    node.appendChild = child => { node.children.push(child); return child; };
    node.append = (...children) => node.children.push(...children);
    node.setAttribute = (key, value) => { node.attributes[key] = value; };
    node.addEventListener = (type, action) => { node.handlers[type] = action; };
    node.focus = () => { node.focused = true; };
    node.querySelectorAll = () => [];
    Object.defineProperty(node, 'innerHTML', {
        get: () => '', set: () => { node.children = []; node.scrollTop = 0; }
    });
    return node;
}

function runtime(file) {
    const ids = ['game-container', 'selection-panel', 'selection-title', 'selection-description', 'selection-options',
        'selection-confirm-button', 'selection-cancel-button', 'selection-field-view-button', 'selection-return-button',
        'player-set', 'cpu-set', 'player-packs', 'cpu-packs', 'pack-shop-overlay', 'pack-shop-score', 'pack-shop-list'];
    const nodes = Object.fromEntries(ids.map(id => [id, element(id)]));
    nodes['selection-return-button'].classList.add('hidden');
    nodes['player-set'].dataset.setSlots = nodes['cpu-set'].dataset.setSlots = '3';
    const me = { hand: [], events: [], set: [], packs: [], score: 0 };
    const opponent = { hand: [], events: [], set: [], packs: [], score: 0 };
    const state = { currentTurn: 'player', currentPhase: 'メインフェイズ', matchStartedAt: 1,
        selectedTargetIds: [], selectedCardIds: [], selectionMode: null, gameEnded: false };
    const c = vm.createContext({ console, GameState: state,
        document: { getElementById: id => nodes[id] || null, createElement: () => element() },
        getBattleViewModel: () => ({ me, opponent, turn: state.currentTurn === 'player' ? 'me' : 'opponent', opponentLabel: '相手' }),
        hasPack: (player, key) => player.packs.some(pack => pack.key === key),
        toggleEventTargetSelection: id => { state.selectedTargetIds = [id]; },
        toggleDiscardSelection: id => { state.selectedCardIds = [id]; }
    });
    c.window = c;
    vm.runInContext(read(file), c);
    vm.runInContext(section(read('state.js'), 'getSetLimit', 'getEndPhaseHandLimit'), c);
    vm.runInContext(`const packDefinitions = [
        {key: 'ecoBag', name: 'エコバッグ', cost: 2}, {key: 'freezer', name: '冷蔵庫', cost: 2},
        {key: 'board', name: 'まな板', cost: 3}];
        function getPackDefinition(key) { return packDefinitions.find(def => def.key === key); }`, c);
    vm.runInContext(section(read('state.js'), 'canBuyPack', 'buyPack'), c);
    c.getPackImagePath = () => null;
    c.createFaceCard = card => Object.assign(element(), { textContent: card.name });
    c.createBackCard = () => Object.assign(element(), { textContent: '伏せカード' });
    c.setupHorizontalScrollRows = () => {};
    c.bindRenderEventsOnce();
    return { c, nodes, state, me, opponent };
}

test('mobile homepage navigation resolves to the site root, while PC stays index.html', () => {
    for (const [file, base] of [['mobile/main-sp.js', 'https://test.invalid/game/mobile/mobile.html'],
        ['main.js', 'https://test.invalid/game/web.html']]) {
        const statement = read(file).match(/window\.location\.href\s*=\s*['"][^'"]+['"];?/)[0];
        const window = { location: { href: base } };
        vm.runInNewContext(statement, { window });
        assert.equal(new URL(window.location.href, base).pathname, '/game/index.html');
        assert.equal(window.location.href, file.startsWith('mobile/') ? '../index.html' : 'index.html');
    }
});

test('mobile local HTML, CSS and menu/gallery/cutin asset paths resolve to existing files', () => {
    for (const match of read('mobile/mobile.html').matchAll(/(?:href|src)="([^"#]+)"/g)) {
        const target = match[1].split('?')[0];
        if (/^[a-z]+:/i.test(target)) continue;
        assert.ok(fs.existsSync(path.resolve(root, 'mobile', target)), target);
    }
    for (const match of read('mobile/style-sp.css').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        assert.ok(fs.existsSync(path.resolve(root, 'mobile', match[1].split('?')[0])), match[1]);
    }
    for (const match of read('mobile/main-sp.js').matchAll(/['"]((?:\.\.\/)?assets\/[^'"]+)['"]/g)) {
        assert.ok(match[1].startsWith('../'), `mobile asset prefix: ${match[1]}`);
        const target = match[1].replace('assets/images/', 'assets/battle-images/').replace(/\.png$/, '.webp');
        assert.ok(fs.existsSync(path.resolve(root, 'mobile', target)), target);
    }
    assert.doesNotMatch(read('mobile/main-sp.js'), /(?:location\.href|window\.open)\s*(?:=|\()\s*['"](?:rules|gallery|user|index)\.html/);
});

for (const file of ['render.js', 'mobile/render-sp.js']) {
    for (const [mode, name] of [['event-target', 'Battle à la carte 回収'], ['event-target', 'ゴミ収集車'],
        ['event-target', '食材探索'], ['skill-target', 'ロマン仕込み'], ['event-target', '物々交換'],
        ['event-target', '手札整理'], ['discard', '手札調整'], ['board-cycle-select', 'まな板']]) {
        test(`${file}: ${name} field view keeps context, selected card and scroll through updates`, () => {
            const { c, nodes, state, me } = runtime(file);
            state.selectionMode = mode;
            state.discardNeedCount = 1;
            me.hand = [{ id: 'a', name: '材料A' }, { id: 'b', name: '材料B' }];
            me.events = [{ id: 'a', name: 'イベントA' }, { id: 'b', name: 'イベントB' }];
            if (name === 'Battle à la carte 回収') {
                vm.runInContext(section(read('rules.js'), 'buildBattleModeDiscardPickupContext', 'resolveBattleModeDiscardPickupSelection'), c);
                state.pendingEventContext = c.buildBattleModeDiscardPickupContext('player', me.hand);
            } else if (mode === 'event-target' || mode === 'skill-target') {
                state[mode === 'skill-target' ? 'pendingSkillContext' : 'pendingEventContext'] = {
                    eventName: name, skillName: mode === 'skill-target' ? name : null, step: 0,
                    minSelect: 1, maxSelect: 2, options: [{ id: 'a', label: '材料A' }, { id: 'b', label: '材料B' }]
                };
            }
            state.selectedTargetIds = mode === 'skill-target' ? ['a', 'b'] : ['b'];
            state.selectedCardIds = ['b'];
            const eventContext = state.pendingEventContext;
            const skillContext = state.pendingSkillContext;
            const snapshot = JSON.stringify(state);
            c.renderSelectionPanel();
            nodes['selection-options'].scrollTop = 180;
            const originalOptions = nodes['selection-options'].children;
            nodes['selection-field-view-button'].handlers.click();
            assert.equal(nodes['selection-panel'].classList.contains('hidden'), true);
            assert.equal(nodes['selection-return-button'].classList.contains('hidden'), false);
            assert.equal(nodes['game-container'].classList.contains('selection-field-view'), true);
            assert.equal(nodes['selection-return-button'].focused, true);
            c.renderSelectionPanel();
            c.renderPlayerSet();
            c.renderOpponentSet();
            assert.equal(nodes['selection-options'].children, originalOptions, 'hidden modal is preserved');
            assert.equal(JSON.stringify(state), snapshot, 'field view does not mutate rule state');
            nodes['selection-return-button'].handlers.click();
            assert.equal(nodes['selection-panel'].classList.contains('hidden'), false);
            assert.equal(nodes['selection-return-button'].classList.contains('hidden'), true);
            assert.equal(nodes['game-container'].classList.contains('selection-field-view'), false);
            assert.equal(nodes['selection-options'].scrollTop, 180);
            assert.equal(nodes['selection-options'].children[1].classList.contains('active'), true);
            assert.equal(nodes['selection-confirm-button'].disabled, false);
            assert.equal(state.pendingEventContext, eventContext);
            assert.equal(state.pendingSkillContext, skillContext);
            assert.equal(JSON.stringify(state), snapshot);
        });
    }

    test(`${file}: a new selection step and game end clear field view`, () => {
        const { c, nodes, state } = runtime(file);
        state.selectionMode = 'event-target';
        state.pendingEventContext = { eventName: '物々交換', step: 0, minSelect: 1, maxSelect: 1, options: [{ id: 'a', label: 'A' }] };
        c.renderSelectionPanel();
        c.hideSelectionForFieldView();
        state.pendingEventContext.step++;
        c.renderSelectionPanel();
        assert.equal(nodes['selection-panel'].classList.contains('hidden'), false);
        assert.equal(nodes['selection-return-button'].classList.contains('hidden'), true);
        c.hideSelectionForFieldView();
        state.selectionMode = null;
        state.gameEnded = true;
        c.renderSelectionPanel();
        assert.equal(nodes['selection-return-button'].classList.contains('hidden'), true);
        assert.equal(nodes['game-container'].classList.contains('selection-field-view'), false);
    });

    test(`${file}: both set zones have three slots, with freezer-only unlock and cache refresh`, () => {
        const { c, nodes, me, opponent } = runtime(file);
        for (const [player, id, render] of [[me, 'player-set', c.renderPlayerSet], [opponent, 'cpu-set', c.renderOpponentSet]]) {
            for (const owned of [false, true, false]) {
                player.packs = owned ? [{ key: 'freezer' }] : [];
                render();
                assert.equal(nodes[id].children.length, 3);
                assert.equal(nodes[id].children[2].classList.contains('is-locked'), !owned);
                assert.equal(nodes[id].children[2].textContent, owned ? 'セット 3' : '冷蔵庫で解放');
            }
            player.set = [{ id: 'card-a', name: '材料A' }];
            render();
            assert.equal(nodes[id].children.length, 3);
            assert.equal(nodes[id].children.filter(node => node.classList.contains('set-slot-placeholder')).length, 2);
            player.packs = [{ key: 'freezer' }];
            player.set.push({ id: 'card-b', name: '材料B' }, { id: 'card-c', name: '材料C' });
            render();
            assert.equal(nodes[id].children.length, 3);
            assert.equal(nodes[id].children.filter(node => node.classList.contains('set-slot-placeholder')).length, 0);
        }
    });

    test(`${file}: pack hints and exchange buttons follow current score, phase, turn, selection and ownership`, () => {
        const { c, nodes, state, me, opponent } = runtime(file);
        vm.runInContext('packShopOpen = true', c);
        let cached;
        for (const [score, phase, turn, selection, ended, packs, expected] of [
            [0, 'メインフェイズ', 'player', null, false, [], [false, false, false]],
            [2, 'メインフェイズ', 'player', null, false, [], [true, true, false]],
            [3, 'メインフェイズ', 'player', null, false, [], [true, true, true]],
            [1, 'メインフェイズ', 'player', null, false, [], [false, false, false]],
            [3, '補充フェイズ', 'player', null, false, [], [false, false, false]],
            [3, 'メインフェイズ', 'cpu', null, false, [], [false, false, false]],
            [3, 'メインフェイズ', 'player', 'event-target', false, [], [false, false, false]],
            [3, 'メインフェイズ', 'player', null, true, [], [false, false, false]],
            [3, 'メインフェイズ', 'player', null, false, ['freezer'], [true, false, true]],
            [3, 'メインフェイズ', 'player', null, false, ['ecoBag', 'freezer', 'board'], [false, false, false]],
            [3, 'メインフェイズ', 'player', null, false, [], [true, true, true]]
        ]) {
            Object.assign(state, { currentPhase: phase, currentTurn: turn, selectionMode: selection, gameEnded: ended });
            me.score = score;
            me.packs = packs.map(key => ({ key }));
            c.renderPacks(me, nodes['player-packs']);
            c.renderPacks(opponent, nodes['cpu-packs']);
            c.renderPackShopModal();
            assert.deepEqual(nodes['player-packs'].children.map(node => node.classList.contains('exchangeable-pack')), expected);
            assert.ok(nodes['cpu-packs'].children.every(node => !node.classList.contains('exchangeable-pack')));
            assert.deepEqual(nodes['pack-shop-list'].children.map(node => !node.children[2].disabled), expected);
            if (cached && !packs.length) assert.equal(nodes['player-packs'].children[0], cached, 'score and phase hints update cached cards');
            cached = !packs.length ? nodes['player-packs'].children[0] : null;
        }
    });

    test(`${file}: an asynchronous pack-image failure keeps the exchange hint`, () => {
        const { c } = runtime(file);
        let settle;
        c.getImageLoadStatus = () => 'loading';
        c.onImageLoadSettled = (_path, callback) => { settle = callback; };
        const card = element();
        card.className = 'card pack-card unowned-pack exchangeable-pack';
        c.createImageCard({ name: '冷蔵庫' }, card, 'unused.webp', 'pack-card');
        assert.equal(card.classList.contains('has-image'), true);
        settle(false);
        assert.equal(card.classList.contains('has-image'), false);
        assert.equal(card.classList.contains('unowned-pack'), true);
        assert.equal(card.classList.contains('exchangeable-pack'), true);
        assert.equal(card.children[0].textContent, '冷蔵庫');
    });
}

test('mobile slots and return button fit the 432 x 768 stage without expanding field rows', () => {
    const css = read('mobile/style-sp.css');
    const rule = selector => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))];
        assert.ok(matches.length, selector);
        return Object.fromEntries(matches.flatMap(match => match[1].split(';').filter(value => value.includes(':'))
            .map(value => [value.slice(0, value.indexOf(':')).trim(), value.slice(value.indexOf(':') + 1).trim()])));
    };
    const px = value => parseFloat(value);
    const rowWidth = (432 - 16 - 5) / 2;
    for (const [side, rowHeight] of [['cpu', 47], ['player', 76]]) {
        const slot = rule(`.mobile-field-ui .${side}-set-zone .set-slot-placeholder`);
        assert.ok(3 * px(slot.width) + 2 * 4 < rowWidth - 16, `${side}: three slots plus insets fit`);
        assert.equal(px(slot.height), rowHeight);
        assert.equal(slot.width, side === 'cpu' ? '38px' : '53px');
    }
    const button = rule('.selection-return-button');
    assert.ok(px(button.top) + px(button['min-height']) <= px(rule('.duel-field').padding), 'return control stays above field, hand and battle actions');
    assert.match(css, /#game-container\.selection-field-view \.modal-input-backdrop\s*\{ display: none; \}/);
    assert.match(css, /\.unowned-pack\.exchangeable-pack \.card-art\s*\{ filter: grayscale\(1\)/);
    assert.match(css, /content: '交換可能'/);
    for (const id of ['player-set', 'cpu-set']) assert.match(read('mobile/mobile.html'), new RegExp(`id="${id}"[^>]+data-set-slots="3"`));
});

test('PC/mobile shared render code, added CSS and cache versions agree', () => {
    const pc = read('render.js');
    const mobile = read('mobile/render-sp.js');
    for (const [start, end] of [['renderPlayerSet', 'renderOpponentMixedHand'], ['renderOpponentSet', 'createDishCardElement'],
        ['getSelectionFieldViewKey', 'renderBoardCycleDetailsPanel'], ['renderPackShopModal', 'renderDiscardButton']]) {
        assert.equal(section(pc, start, end), section(mobile, start, end), start);
    }
    const marker = '/* Card selection can be paused';
    assert.equal(read('style.css').slice(read('style.css').indexOf(marker)).trim(),
        read('mobile/style-sp.css').slice(read('mobile/style-sp.css').indexOf(marker)).split('/* Fit the same three')[0].trim().replaceAll('../assets/', 'assets/'));
    for (const [html, names] of [['web.html', ['style.css', 'render.js']],
        ['mobile/mobile.html', ['style-sp.css', 'render-sp.js', 'main-sp.js']]]) {
        for (const name of names) assert.ok(read(html).includes(`${name}?v=${name.startsWith('main') ? '20261010-u6b' : '20261007-osananajimi105a'}`), name);
        assert.match(read(html), /id="selection-field-view-button"[^>]*aria-label="盤面と手札を見る"/);
        assert.match(read(html), /id="selection-return-button"[^>]*>カード選択へ戻る/);
    }
    assert.equal(read('main.js').replaceAll("'assets/", "'../assets/").replace("window.location.href = 'index.html'", "window.location.href = '../index.html'"), read('mobile/main-sp.js'));
});
