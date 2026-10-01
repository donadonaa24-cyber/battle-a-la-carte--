const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function declarations(selector) {
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...css.matchAll(new RegExp(`${escaped}\\s*(?:,[^{]+)?\\{([^}]+)\\}`, 'g'))];
    assert.ok(matches.length, `explicit rule for ${selector}`);
    return Object.fromEntries(matches.flatMap(match => match[1].split(';').filter(part => part.includes(':'))
        .map(part => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim()])));
}

test('PC story HUD reserves its own slim strip with internally scrolling two-column objectives', () => {
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    const hud = declarations('.pc-field-ui #story-hud-panel');
    const objectives = declarations('.pc-field-ui #story-hud-objectives');
    assert.doesNotMatch(css, /#pc-shared-field/);
    assert.equal(hud.position, 'static');
    assert.equal(hud.flex, '0 0 74px');
    assert.equal(hud.height, '74px');
    assert.equal(hud['max-height'], hud.height);
    assert.equal(hud['box-sizing'], 'border-box');
    assert.equal(hud.overflow, 'hidden');
    assert.equal(hud['grid-template-rows'], '15px minmax(0, 1fr)');
    assert.equal(hud['grid-template-columns'], '300px minmax(0, 1fr)');
    assert.equal(objectives['grid-template-columns'], 'repeat(2, minmax(0, 1fr))');
    assert.equal(objectives['min-height'], '0');
    assert.equal(objectives['overflow-y'], 'auto');
    assert.equal(objectives['overflow-x'], 'hidden');
    assert.equal(declarations('.pc-field-ui .story-hud-note')['overflow-y'], 'auto');
});

test('PC aligned columns and separated halves fit normal, story and guest height budgets', () => {
    const stage = { width: 1440, height: 810 };
    const frame = declarations('#game-container.pc-field-ui');
    const grid = declarations('.pc-field-ui .battle-layout');
    const side = declarations('.pc-field-ui .pc-field-side');
    const zones = declarations('.pc-field-ui .player-zones');
    const card = declarations('.pc-field-ui .player-side .card');
    const row = declarations('.pc-field-ui .card-row');
    const panel = declarations('.pc-field-ui .pc-field-side .panel-box');
    const heading = declarations('.pc-field-ui .panel-box h3');
    const px = value => Number.parseFloat(value);
    assert.equal(grid['grid-template-rows'], 'minmax(138px, .85fr) 28px minmax(166px, 1fr) 240px');
    assert.equal(declarations('.pc-field-ui #pc-opponent-field')['grid-row'], '1');
    assert.equal(declarations('.pc-field-ui #pc-player-field')['grid-row'], '3');
    assert.equal(declarations('.pc-field-ui #pc-hand-actions')['grid-row'], '4');
    const separation = px(grid['grid-template-rows'].split(' ')[2]);
    assert.ok(separation >= 24 && separation <= 32);
    assert.equal(declarations('.pc-field-ui .battle-layout::before')['grid-row'], '2');
    assert.equal(declarations('.pc-field-ui .battle-layout::before').height, '1px');
    const columnWidths = zones['grid-template-columns'].split(' ').map(px);
    const sideWidths = side['grid-template-columns'].match(/\d+px/g).map(px);
    const gap = px(side.gap);
    const padding = px(frame.padding);
    const border = 2 * px(side.border);
    const panelPadding = px(panel.padding);
    const sideInset = 2 * px(side.padding) + border;
    const requiredSlots = 3 * px(card.width) + 2 * px(row.gap) + 2 * px(row.padding) + 2 * panelPadding;
    assert.equal(panel.border, '0');
    assert.equal(panel.background, 'transparent');
    assert.equal(columnWidths[0], requiredSlots, 'set zone fits exactly three cards plus padding and two gaps');
    assert.equal(columnWidths[2], requiredSlots, 'all three pack cards fit without squeezing');
    assert.equal(sideWidths[0] + sideWidths[1] + columnWidths.reduce((sum, width) => sum + width, 0) + 4 * gap,
        stage.width - 2 * padding - sideInset, 'HUD, sets, piles, packs and history fit the stage width');
    assert.equal(declarations('.pc-field-ui .opponent-zones')['grid-template-columns'], zones['grid-template-columns'],
        'set, hand/piles and packs align between the two halves');
    const pile = declarations('.pc-field-ui .pile');
    assert.equal(columnWidths[1], 2 * px(pile.width) + px(declarations('.pc-field-ui .deck-discard-row').gap));
    const handHeight = Number(grid['grid-template-rows'].match(/(\d+)px$/)[1]);
    const top = px(declarations('.pc-field-ui .top-bar').flex.split(' ').at(-1));
    const story = px(declarations('.pc-field-ui #story-hud-panel').height);
    const onlinePadding = px(declarations('.online-session #game-container.pc-field-ui')['padding-bottom']);
    const scrollbar = px(declarations('.pc-field-ui :is(#player-hand-mixed, #cpu-hand-mixed, #player-set, #cpu-set, #player-packs, #cpu-packs)::-webkit-scrollbar').height);
    const headingHeight = px(heading['font-size']) * px(heading['line-height']) + 2;
    const frameGap = px(frame.gap);
    const verticalPanelSpace = 2 * panelPadding + sideInset + headingHeight;
    const opponent = declarations('.pc-field-ui .cpu-side .card');
    for (const dimension of ['width', 'height']) {
        const ratio = px(opponent[dimension]) / px(card[dimension]);
        assert.ok(ratio >= .8 && ratio <= .85, `opponent ${dimension} is 80–85% of player's`);
    }
    for (const [mode, extraHeight] of [['normal / missions', 0],
        ['story episodes 1–3 / story plus mission', story + frameGap], ['online guest', onlinePadding - padding]]) {
        const fieldHeight = stage.height - 2 * padding - top - frameGap - extraHeight;
        const available = fieldHeight - separation - handHeight;
        const opponentHeight = available * .85 / 1.85;
        const rowHeight = available / 1.85 - px(declarations('.pc-field-ui #pc-player-field')['margin-bottom']);
        assert.ok(opponentHeight >= px(opponent.height) + 2 * px(row.padding) + verticalPanelSpace,
            `${mode}: opponent set/pack cards fit`);
        const cpuHeading = declarations('.pc-field-ui #cpu-hand-heading');
        assert.ok(opponentHeight >= px(opponent.height) + 2 * panelPadding + sideInset + px(cpuHeading['font-size']) * px(heading['line-height']) + 2,
            `${mode}: CPU fan and its count heading fit`);
        assert.ok(rowHeight >= px(card.height) + 2 * px(row.padding) + verticalPanelSpace,
            `${mode}: player set/pack cards fit`);
        const dish = declarations('.pc-field-ui .compact-dish-card');
        assert.ok(rowHeight >= px(dish.height) + 8 + scrollbar + verticalPanelSpace, `${mode}: dish history fits`);
        const pileZone = declarations('.pc-field-ui #pc-pile-zone');
        assert.equal(pileZone.border, '0', 'activation compatibility class adds no inherited border');
        const activation = declarations('.pc-field-ui .pc-activation-label');
        assert.ok(rowHeight >= px(pile.height) + 2 * px(pileZone.padding) + sideInset + headingHeight + px(activation['font-size']) * px(activation['line-height']),
            `${mode}: pile labels and activation label fit`);
    }
    assert.ok(handHeight >= px(declarations('.pc-field-ui #player-hand-mixed .card').height) + 4 + scrollbar + 32 + 12,
        'hand fits with first-turn hint, scrollbar, panel padding and borders');
    const actions = declarations('.pc-field-ui #pc-hand-actions');
    const handZone = declarations('.pc-field-ui #pc-hand-actions .player-hand-zone');
    const handWidth = stage.width - 2 * padding - px(actions.gap) - px(actions['grid-template-columns'].split(' ').at(-1))
        - 2 * px(handZone.border) - 2 * px(handZone.padding.split(' ')[1]) - 2 * px(row.padding);
    const handCard = declarations('.pc-field-ui #player-hand-mixed .card');
    assert.ok(8 * px(handCard.width) + 7 * px(declarations('.pc-field-ui #player-hand-mixed').gap) <= handWidth,
        'eight player cards are fully visible without horizontal scrolling');
    assert.ok(px(handCard.height) > px(card.height), 'hand remains the largest card zone');
});

function element() {
    const classes = new Set();
    const el = {
        children: [], style: { setProperty(key, value) { this[key] = value; } }, dataset: {}, attributes: {}, scrollTop: 0, textContent: '',
        classList: { add: key => classes.add(key), remove: key => classes.delete(key),
            contains: key => classes.has(key), toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } },
        appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
        setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(name, action) { this.actions ||= {}; this.actions[name] = action; }
    };
    Object.defineProperty(el, 'innerHTML', { get: () => '', set() { el.children = []; el.scrollTop = 0; } });
    return el;
}

function runtime() {
    const ids = ['candidate-recipes', 'candidate-recipes-panel', 'candidate-recipes-actions',
        'player-latest-dish', 'cpu-latest-dish', 'confirm-discard-button', 'cook-button',
        'player-skill-button', 'end-turn-button', 'realtime-log-list', 'player-set', 'cpu-set',
        'cpu-hand-mixed', 'cpu-hand-heading', 'player-hand-mixed', 'event-first-turn-hint'];
    const nodes = Object.fromEntries(ids.map(id => [id, element()]));
    nodes['candidate-recipes-panel'].classList.add('hidden');
    nodes['candidate-recipes'].closest = () => nodes['candidate-recipes-panel'];
    for (const id of ['player-set', 'cpu-set']) nodes[id].dataset.setSlots = '3';
    nodes['cpu-hand-mixed'].dataset.handFan = 'true';
    const me = { cookedRecipes: [], set: [], packs: [], hand: [], events: [] };
    const opponent = { set: [], packs: [], hand: [], events: [] };
    const actions = [];
    const c = vm.createContext({ console,
        document: { getElementById: id => nodes[id], createElement: element },
        GameState: { candidateRecipes: [], selectionMode: null, gameEnded: false, selectedCardIds: [], discardNeedCount: 2 },
        getBattleViewModel: () => ({ me, opponent, opponentLabel: '相手', turn: 'me', forSide: () => me }),
        hasPack: (player, key) => player.packs.some(pack => pack.key === key),
        playerCookSelectedRecipe: name => actions.push(name), playerCancelRecipeCandidates: () => actions.push('cancel')
    });
    c.window = c;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../render.js'), 'utf8'), c);
    const state = fs.readFileSync(path.join(__dirname, '../state.js'), 'utf8');
    vm.runInContext(state.slice(state.indexOf('function getSetLimit('), state.indexOf('function getEndPhaseHandLimit(')), c);
    c.createFaceCard = (card, className) => Object.assign(element(), { textContent: card.name, className });
    c.createBackCard = (label, kind) => Object.assign(element(), { textContent: `${label} ${kind}`, className: 'card card-back' });
    c.getRecipeImagePath = name => `recipes/${name}.webp`;
    return { c, nodes, me, opponent, actions };
}

test('PC CPU hand fans every hidden card, counts ingredients plus events, and clears through zero', () => {
    const { c, nodes, opponent, me } = runtime();
    const row = nodes['cpu-hand-mixed'];
    const css = declarations('.pc-field-ui #cpu-hand-mixed');
    assert.equal(css.overflow, 'hidden');
    assert.equal(css['scrollbar-width'], 'none');
    assert.equal(declarations('.pc-field-ui #cpu-hand-mixed::-webkit-scrollbar').display, 'none');
    assert.equal(css['--hand-step'], 'min(24px, calc((100% - 88px) / var(--hand-intervals, 1)))');
    assert.equal(declarations('.pc-field-ui #cpu-hand-mixed .card').left, 'calc(4px + var(--hand-index) * var(--hand-step))');
    c.getBattleViewModel = () => ({ me, opponent, opponentLabel: 'CPU', turn: 'me' });
    for (const count of [0, 1, 5, 10, 16, 2, 0]) {
        opponent.hand = Array.from({ length: Math.max(0, count - 2) }, (_, i) => ({ id: `material-${i}`, name: '非公開材料' }));
        opponent.events = Array.from({ length: Math.min(2, count) }, (_, i) => ({ id: `event-${i}`, name: '非公開イベント' }));
        c.renderOpponentMixedHand();
        const cards = row.children.filter(el => el.className === 'card card-back');
        assert.equal(cards.length, count);
        assert.equal(row.style['--hand-intervals'], String(Math.max(1, count - 1)));
        assert.equal(row.children.find(el => el.className === 'opponent-hand-count').textContent, `${count}枚`);
        assert.equal(nodes['cpu-hand-heading'].textContent, `CPUの手札 ${count}枚`);
        assert.equal(row.attributes['aria-label'], `CPUの手札 ${count}枚（非公開）`);
        for (const [index, card] of cards.entries()) {
            assert.equal(card.style['--hand-index'], String(index));
            assert.equal(card.textContent, 'CPU 手札');
            assert.ok(!card.actions?.click, 'hidden stack cannot reveal cards');
        }
        // The actual 204px column has 4px panel padding on each side.
        const width = 196;
        const step = Math.min(24, (width - 88) / Math.max(1, count - 1));
        assert.ok(count === 0 || 4 + (count - 1) * step + 80 <= width - 4, 'last card fits without a scroll range');
        const before = row.children[0];
        c.renderOpponentMixedHand();
        assert.equal(row.children[0], before, 'unchanged hand keeps cached stack');
    }
    c.getBattleViewModel = () => ({ me, opponent, opponentLabel: '相手', turn: 'me' });
    c.renderOpponentMixedHand();
    assert.equal(nodes['cpu-hand-heading'].textContent, '相手の手札 0枚', 'label also refreshes with an unchanged count');
});

test('PC eight-card hand preserves the first-turn event tag and individual card targets', () => {
    const { c, nodes, me } = runtime();
    c.GameState.turnNumber = 1;
    me.hand = Array.from({ length: 6 }, (_, i) => ({ id: `own-${i}`, type: 'ingredient', name: 'ごはん' }));
    me.events = Array.from({ length: 2 }, (_, i) => ({ id: `event-${i}`, type: 'event', name: '爆買い' }));
    const marked = [];
    c.CardDragActions = { mark: (el, card) => marked.push(card.id) };
    c.renderPlayerMixedHand();
    assert.equal(nodes['player-hand-mixed'].children.length, 8);
    assert.equal(new Set(marked).size, 8);
    assert.equal(nodes['event-first-turn-hint'].classList.contains('hidden'), false);
    assert.ok(nodes['player-hand-mixed'].children.slice(-2).every(el => el.classList.contains('event-first-turn-locked')));
});

for (const side of ['player', 'opponent']) test(`PC ${side} set keeps exactly three positions and refreshes the freezer lock without card changes`, () => {
    const { c, nodes, me, opponent } = runtime();
    const player = side === 'player' ? me : opponent;
    const node = nodes[side === 'player' ? 'player-set' : 'cpu-set'];
    const render = side === 'player' ? c.renderPlayerSet : c.renderOpponentSet;
    for (const count of [0, 1, 2]) {
        player.set = Array.from({ length: count }, (_, index) => ({ id: `${index}`, name: 'ごはん' }));
        render();
        assert.equal(node.children.length, 3);
        assert.equal(node.children.filter(child => child.className.includes('set-slot-placeholder')).length, 3 - count);
        assert.equal(node.children[2].textContent, '冷蔵庫で解放');
        assert.match(node.children[2].className, /is-locked/);
    }
    const before = node.children[0];
    render();
    assert.equal(node.children[0], before, 'unchanged state keeps cached cards');
    player.packs.push({ key: 'freezer' });
    render();
    assert.equal(node.children.length, 3);
    assert.equal(node.children[2].textContent, 'セット 3');
    assert.doesNotMatch(node.children[2].className, /is-locked/);
    assert.match(node.attributes['aria-label'], /上限3枚/);
    player.set.push({ id: 'third', name: '卵' });
    render();
    assert.equal(node.children.length, 3);
    assert.ok(node.children.every(child => !child.className.includes('set-slot-placeholder')));
    player.set.pop();
    player.packs = [];
    render();
    assert.match(node.children[2].className, /is-locked/);
    assert.match(node.attributes['aria-label'], /上限2枚/);
});

test('PC slot placeholders preserve own ingredient actions and opponent face-down/trap rendering', () => {
    const { c, nodes, me, opponent } = runtime();
    const actions = [];
    c.openIngredientAction = (...args) => actions.push(args);
    me.set = [{ id: 'own', name: '卵', romanReserved: true }];
    opponent.set = [{ id: 'secret', name: '非公開食材' }, { id: 'trap', name: 'ごはん', trapLocked: true }];
    c.renderPlayerSet();
    nodes['player-set'].children[0].actions.click();
    assert.deepEqual(actions, [['own', 'set']]);
    c.renderOpponentSet();
    assert.equal(nodes['cpu-set'].children[0].textContent, '相手 セット');
    assert.equal(nodes['cpu-set'].children[1].textContent, 'ごはん');
    assert.match(nodes['cpu-set'].children[1].className, /trap-locked-card/);
    assert.ok(!nodes['cpu-set'].children[0].actions?.click);
    assert.ok(!nodes['player-set'].children[1].actions?.click, 'empty slots do not impersonate cards');
    c.GameState.selectionMode = 'discard';
    c.renderPlayerSet();
    assert.ok(!nodes['player-set'].children[0].actions?.click);
});

test('PC guest slot capacity follows its projected freezer and keeps host ingredients hidden', async () => {
    const root = path.resolve(__dirname, '..');
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    const clone = value => JSON.parse(JSON.stringify(value));
    const worker = vm.createContext({ console, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
    worker.self = worker;
    worker.importScripts = (...names) => names.forEach(name => vm.runInContext(read(name.split('?')[0]), worker));
    worker.importScripts('battle-engine-worker.js');
    const initial = await worker.execute({ kind: 'init', host: { character: 'takumi', skill: 'lastOrder' },
        guest: { character: 'akatsuki', skill: 'foodTrap' } });
    const snapshot = clone(initial.snapshot);
    snapshot.currentTurn = 'cpu';
    snapshot.selectionMode = null;
    snapshot.players.player.set = [{ id: 'host-secret', type: 'ingredient', name: '牛肉' }];
    snapshot.players.player.packs = [];
    snapshot.players.player.hand = Array.from({ length: 8 }, (_, i) => ({ id: `host-hand-${i}`, type: 'ingredient', name: '牛肉' }));
    snapshot.players.player.events = Array.from({ length: 2 }, (_, i) => ({ id: `host-event-${i}`, type: 'event', name: '爆買い' }));
    snapshot.players.cpu.set = [{ id: 'guest-own', type: 'ingredient', name: '卵' }];
    snapshot.players.cpu.packs = [];
    const { c, nodes } = runtime();
    c.FriendBattle = { isActive: () => true };
    vm.runInContext(read('battle-view-model.js'), c);
    const project = async () => {
        const views = await worker.execute({ kind: 'project', snapshot: clone(snapshot) });
        Object.assign(c.GameState, clone(views.guest.state));
        c.renderPlayerSet();
        c.renderOpponentSet();
        c.renderOpponentMixedHand();
    };
    await project();
    assert.equal(c.getBattleViewModel().online, true);
    assert.equal(nodes['player-set'].children[0].textContent, '卵');
    assert.match(nodes['player-set'].children[2].className, /is-locked/);
    assert.equal(nodes['cpu-set'].children[0].textContent, '相手 セット');
    assert.ok(!c.GameState.players.cpu.set[0].name);
    assert.equal(nodes['cpu-hand-heading'].textContent, '相手の手札 10枚');
    assert.equal(nodes['cpu-hand-mixed'].children.filter(el => el.className === 'card card-back').length, 10);
    assert.equal(nodes['cpu-hand-mixed'].children[0].textContent, '10枚');
    assert.ok(c.GameState.players.cpu.hand.every(card => !card.name));
    assert.ok(c.GameState.players.cpu.events.every(card => !card.name));
    snapshot.players.cpu.packs.push({ key: 'freezer', name: '冷蔵庫' });
    await project();
    assert.equal(nodes['player-set'].children[2].textContent, 'セット 3');
    assert.match(nodes['cpu-set'].children[2].className, /is-locked/, 'host capacity is independent');
});

test('PC recipe modal shows all candidates and keeps its footer and scroll position', () => {
    const { c, nodes, actions } = runtime();
    c.GameState.candidateRecipes = Array.from({ length: 25 }, (_, index) => ({ recipe: {
        name: `料理${index}`, points: 3, required: ['卵', 'ごはん']
    } }));
    c.renderCandidateRecipes();
    assert.equal(nodes['candidate-recipes-panel'].classList.contains('hidden'), false);
    assert.equal(nodes['candidate-recipes'].children.length, 25);
    assert.equal(nodes['candidate-recipes-actions'].children.length, 1);
    nodes['candidate-recipes'].children[24].children[2].actions.click();
    nodes['candidate-recipes-actions'].children[0].actions.click();
    assert.deepEqual(actions, ['料理24', 'cancel']);
    nodes['candidate-recipes'].scrollTop = 560;
    c.renderCandidateRecipes();
    assert.equal(nodes['candidate-recipes'].scrollTop, 560);
    c.GameState.candidateRecipes = [];
    c.renderCandidateRecipes();
    assert.equal(nodes['candidate-recipes-panel'].classList.contains('hidden'), true);
});

test('PC history strip includes older dishes and updates when only an older entry changes', () => {
    const { c, me, nodes } = runtime();
    me.cookedRecipes = [
        { name: 'おにぎり', points: 1, required: ['ごはん', 'のり'] },
        { name: 'チャーハン', points: 3, required: ['ごはん', '卵'] }
    ];
    c.renderLatestDishFor('player');
    assert.equal(nodes['player-latest-dish'].children.length, 2);
    const first = nodes['player-latest-dish'].children[0];
    me.cookedRecipes.pop();
    c.renderLatestDishFor('player');
    assert.equal(nodes['player-latest-dish'].children.length, 1);
    assert.notEqual(nodes['player-latest-dish'].children[0], first);
    me.cookedRecipes = [];
    c.renderLatestDishFor('player');
    assert.equal(nodes['player-latest-dish'].children[0].textContent, 'まだ料理はありません');
});

test('PC discard action appears only in discard mode and restores the three normal actions', () => {
    const { c, nodes } = runtime();
    c.renderDiscardButton();
    assert.equal(nodes['confirm-discard-button'].classList.contains('hidden'), true);
    c.GameState.selectionMode = 'discard';
    c.GameState.selectedCardIds = ['one'];
    c.renderDiscardButton();
    assert.equal(nodes['confirm-discard-button'].disabled, true);
    assert.equal(nodes['confirm-discard-button'].textContent, '選んだ1枚を捨てる');
    for (const id of ['cook-button', 'player-skill-button', 'end-turn-button']) assert.ok(nodes[id].classList.contains('hidden'));
    c.GameState.selectedCardIds.push('two');
    c.renderDiscardButton();
    assert.equal(nodes['confirm-discard-button'].disabled, false);
    assert.equal(nodes['confirm-discard-button'].textContent, '選んだ2枚を捨てる');
    c.GameState.selectionMode = null;
    c.renderDiscardButton();
    for (const id of ['cook-button', 'player-skill-button', 'end-turn-button']) assert.ok(!nodes[id].classList.contains('hidden'));
});

test('PC field shows one latest log while full history remains available', () => {
    const { c, nodes } = runtime();
    c.addLog('前のログ');
    c.addLog('最新ログ');
    assert.equal(nodes['realtime-log-list'].children.length, 1);
    assert.equal(nodes['realtime-log-list'].children[0].textContent, '最新ログ');
    assert.deepEqual(Array.from(vm.runInContext('realtimeLogHistory', c)), ['最新ログ', '前のログ']);
});

test('PC skill action glows only when usable and skill name still displays its detail entry', () => {
    const { c, nodes } = runtime();
    nodes['player-skill-name'] = element();
    c.getSelectedSkillDefinitionForSide = () => ({ key: 'test', name: 'テストスキル', maxUses: 1 });
    c.getSkillActivationStatusForSide = () => ({ ok: true });
    c.renderSkillHud();
    assert.equal(nodes['player-skill-button'].disabled, false);
    assert.equal(nodes['player-skill-button'].classList.contains('ready'), true);
    assert.equal(nodes['player-skill-button'].textContent, 'スキル発動');
    assert.equal(nodes['player-skill-name'].textContent, 'スキル: テストスキル');
    c.getSkillActivationStatusForSide = () => ({ ok: false, reason: '使用済み' });
    c.renderSkillHud();
    assert.equal(nodes['player-skill-button'].disabled, true);
    assert.equal(nodes['player-skill-button'].classList.contains('ready'), false);
    c.getSkillActivationStatusForSide = () => ({ ok: true });
    c.GameState.selectionMode = 'discard';
    c.renderSkillHud();
    assert.equal(nodes['player-skill-button'].disabled, true);
});
