const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
function quick(storage = new Map()) {
    const context = vm.createContext({localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
    }});
    context.window = context;
    vm.runInContext(source('quick-confirm.js'), context);
    return {api: context.QuickConfirm, storage};
}
function engine() {
    const c = vm.createContext({console, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout});
    c.self = c;
    c.importScripts = (...names) => names.forEach(name => vm.runInContext(source(name.split('?')[0]), c));
    c.importScripts('battle-engine-worker.js');
    return c;
}
const clone = value => JSON.parse(JSON.stringify(value));
async function action(c, snapshot, name, args = []) {
    return c.execute({kind: 'action', role: 'host', snapshot: clone(snapshot), action: {name, args}});
}
function fixture(c, initial, ingredients, event) {
    const state = clone(initial);
    const deck = clone(c.buildDeck());
    const take = name => deck.splice(deck.findIndex(card => card.name === name), 1)[0];
    state.players.player = clone(c.createPlayerState());
    state.players.cpu = clone(c.createPlayerState());
    state.players.player.hand = ingredients.map(take);
    state.players.cpu.hand = ['魚', '牛肉'].map(take);
    if (event) state.players.player.events = [take(event)];
    state.deck = deck; state.discard = [];
    state.currentTurn = 'player'; state.currentPhase = 'メインフェイズ'; state.turnNumber = 2;
    state.selectionMode = null; state.gameEnded = false; state.winner = null;
    return state;
}

test('operation confirmation defaults to standard and persists per device without touching other keys', () => {
    const storage = new Map([['other-setting', 'keep']]);
    const first = quick(storage).api;
    assert.equal(first.mode(), 'standard');
    assert.equal(first.autoAction('playerEndTurn'), null);
    assert.equal(first.setMode('quick'), 'quick');
    assert.equal(storage.get(first.key), 'quick');
    assert.equal(storage.get('other-setting'), 'keep');
    const second = quick(storage).api;
    assert.equal(second.mode(), 'quick');
    assert.equal(second.setMode('standard'), 'standard');
    assert.equal(quick(storage).api.mode(), 'standard');
});

test('quick mode follows the existing host confirm states for set, end turn and dragged event only', async () => {
    const q = quick().api; q.setMode('quick');
    const c = engine(); const initial = (await c.execute({kind: 'init', host: {character: 'takumi', skill: 'lastOrder'}, guest: {character: 'akatsuki', skill: 'foodTrap'}})).snapshot;
    let state = fixture(c, initial, ['ごはん', 'のり']);
    let result = await action(c, state, 'playerSetCard', [state.players.player.hand[0].id]);
    assert.equal(result.snapshot.selectionMode, 'set-confirm');
    result = await action(c, result.snapshot, q.autoAction('playerSetCard'));
    assert.equal(result.snapshot.players.player.set.length, 1);

    state = fixture(c, initial, ['ごはん', 'のり']);
    result = await action(c, state, 'playerEndTurn');
    assert.equal(result.snapshot.selectionMode, 'end-turn-confirm');
    result = await action(c, result.snapshot, q.autoAction('playerEndTurn'));
    assert.equal(result.snapshot.currentTurn, 'cpu');
    assert.equal(result.snapshot.selectionMode, null);

    state = fixture(c, initial, ['ごはん', 'のり', '卵']);
    result = await action(c, state, 'playerEndTurn');
    result = await action(c, result.snapshot, q.autoAction('playerEndTurn'));
    assert.equal(result.snapshot.selectionMode, 'discard');
    assert.equal(result.snapshot.discardNeedCount, 1);

    state = fixture(c, initial, ['ごはん', 'のり'], '食材探索');
    const id = state.players.player.events[0].id;
    result = await action(c, state, 'playerUseEvent', [id]);
    assert.equal(result.snapshot.selectionMode, 'event-confirm');
    assert.equal(q.autoAction('playerUseEvent'), null);
    assert.equal(q.withDraggedEvent(() => q.autoAction('playerUseEvent')), 'confirmEventCard');
    result = await action(c, result.snapshot, q.withDraggedEvent(() => q.autoAction('playerUseEvent')));
    assert.equal(result.snapshot.selectionMode, 'event-target');
    assert.equal(q.autoAction('playerUseEvent'), null);
});

test('quick mode leaves skill, pack and surrender confirmations alone', async () => {
    const q = quick().api; q.setMode('quick');
    for (const name of ['playerUseSkill', 'playerBuyPack', 'playerSurrender', 'confirmDiscardSelection']) assert.equal(q.autoAction(name), null);
    const c = engine(); const initial = (await c.execute({kind: 'init', host: {character: 'takumi', skill: 'lastOrder'}, guest: {character: 'akatsuki', skill: 'foodTrap'}})).snapshot;
    const state = fixture(c, initial, ['ごはん', 'のり']);
    state.players.player.selectedSkillKey = 'makanaiSupply';
    state.players.player.score = 3;
    const skill = await action(c, state, 'playerUseSkill');
    assert.equal(skill.snapshot.selectionMode, 'skill-confirm');
    const pack = await action(c, state, 'playerBuyPack', ['freezer']);
    assert.equal(pack.snapshot.selectionMode, 'pack-confirm');
});

test('online client dispatches the matching follow-up only after the host confirms the initiating request', () => {
    const q = quick().api; q.setMode('quick');
    const network = source('network.js');
    const guards = network.slice(network.indexOf('    function assertCharacterRoom('), network.indexOf('    function profileInfo('));
    const apply = network.slice(network.indexOf('    function applyView('), network.indexOf('    async function sync('));
    const dispatch = network.slice(network.indexOf('    function dispatch('), network.indexOf('    async function resume('));
    const host = { character: 'takumi', characterRosterVersion: 2, skill: 'lastOrder' };
    const guest = { character: 'akatsuki', characterRosterVersion: 2, skill: 'foodTrap' };
    let serial = 0; const sent = [];
    const c = vm.createContext({room: {id: 'room', status: 'playing', host_id: 'player', guest_id: 'opponent', host_info: host, guest_info: guest}, stopped: false, busy: false,
        pending: null, connected: true, peerPresent: true, GameState: {gameEnded: false},
        getBattleViewModel: () => ({turn: 'me'}),
        crypto: require('node:crypto').webcrypto,
        user: {id: 'player'}, revision: 0, fastMode: false, pendingKey: 'pending', deadline: null,
        quickConfirm: null, started: true, metrics: null, recordedSurrenders: new Set(),
        sessionStorage: {setItem() {}, removeItem() {}},
        QuickConfirm: q, updateUI() {}, addLog() {},
        $: () => null, controls() {}, status() {}, clearTimeout() {}, setTimeout: () => 0,
        resend() { sent.push(c.pending.action.name); }, message() {}, fail(error) { throw error; }});
    c.window = c;
    vm.runInContext(source('battle-protocol.js'), c);
    c.protocol = { ...c.BattleProtocol, randomUUID: () => `request-${++serial}` };
    vm.runInContext(`${guards}\n${apply}\n${dispatch}`, c);
    const acknowledge = state => {
        const request = c.pending.id;
        c.applyView({revision: c.revision + 1, payload: {request, state: { ...state,
            characterIds: { player: host.character, cpu: guest.character } }}});
    };
    c.dispatch('playerSetCard', ['card-a']);
    assert.deepEqual(sent, ['playerSetCard']);
    acknowledge({selectionMode: 'set-confirm', pendingSetCardId: 'card-a'});
    assert.deepEqual(sent, ['playerSetCard', 'confirmSetCard']);
    c.pending = null;
    c.dispatch('playerUseEvent', ['event-a']);
    acknowledge({selectionMode: 'event-confirm', pendingEventCardId: 'event-a'});
    assert.equal(sent.at(-1), 'playerUseEvent');
    q.withDraggedEvent(() => c.dispatch('playerUseEvent', ['event-b']));
    acknowledge({selectionMode: 'event-confirm', pendingEventCardId: 'event-b'});
    assert.equal(sent.at(-1), 'confirmEventCard');
    c.pending = null;
    c.dispatch('playerEndTurn', []);
    acknowledge({selectionMode: 'end-turn-confirm'});
    assert.equal(sent.at(-1), 'confirmEndTurn');
});

for (const mobile of [false, true]) test(`local ${mobile ? 'mobile' : 'PC'} quick actions use the real player state paths`, () => {
    const storage = new Map();
    const c = vm.createContext({console, setTimeout: () => 0, clearTimeout() {},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
        addLog() {}, updateUI() {}, showDiscardBanner() {}, hideDiscardBanner() {}, disablePlayerControls() {}, setCPUStatus() {}, cpuTurn() {}});
    c.window = c;
    vm.runInContext(source('quick-confirm.js'), c);
    for (const name of ['cards', 'state', 'rules', 'player']) {
        const file = mobile ? `mobile/${name}-sp.js` : `${name}.js`;
        vm.runInContext(source(file), c, {filename: file});
    }
    vm.runInContext(`
        function resetQuickFixture(names = ['ごはん', 'のり', '卵'], eventName = null) {
            const deck = buildDeck();
            const take = name => deck.splice(deck.findIndex(card => card.name === name), 1)[0];
            GameState.players.player = createPlayerState();
            GameState.players.cpu = createPlayerState();
            GameState.players.player.hand = names.map(take);
            GameState.players.cpu.hand = [take('魚'), take('牛肉')];
            GameState.players.player.events = eventName ? [take(eventName)] : [];
            GameState.deck = deck; GameState.discard = [];
            GameState.currentTurn = 'player'; GameState.currentPhase = 'メインフェイズ';
            GameState.selectionMode = null; GameState.turnNumber = 2; GameState.gameEnded = false;
        }
    `, c);
    c.QuickConfirm.setMode('quick');
    vm.runInContext("resetQuickFixture(); playerSetCard(GameState.players.player.hand[0].id);", c);
    assert.equal(vm.runInContext('GameState.players.player.set.length', c), 1);
    assert.equal(vm.runInContext('GameState.selectionMode', c), null);
    vm.runInContext("resetQuickFixture(['ごはん', 'のり'], '食材探索'); playerUseEvent(GameState.players.player.events[0].id);", c);
    assert.equal(vm.runInContext('GameState.selectionMode', c), 'event-confirm');
    vm.runInContext("resetQuickFixture(['ごはん', 'のり'], '食材探索'); QuickConfirm.withDraggedEvent(() => playerUseEvent(GameState.players.player.events[0].id));", c);
    assert.equal(vm.runInContext('GameState.selectionMode', c), 'event-target');
    vm.runInContext("resetQuickFixture(); GameState.players.player.selectedSkillKey = 'makanaiSupply'; playerUseSkill();", c);
    assert.equal(vm.runInContext('GameState.selectionMode', c), 'skill-confirm');
    vm.runInContext("resetQuickFixture(); GameState.players.player.score = 3; playerBuyPack('freezer');", c);
    assert.equal(vm.runInContext('GameState.selectionMode', c), 'pack-confirm');
    vm.runInContext("resetQuickFixture(); playerEndTurn();", c);
    assert.equal(vm.runInContext('GameState.selectionMode', c), 'discard');
    vm.runInContext("resetQuickFixture(['ごはん', 'のり']); playerEndTurn();", c);
    assert.equal(vm.runInContext('GameState.currentTurn', c), 'cpu');
    assert.equal(vm.runInContext('GameState.selectionMode', c), null);
    c.QuickConfirm.setMode('standard');
    vm.runInContext("resetQuickFixture(['ごはん', 'のり']); playerEndTurn();", c);
    assert.equal(vm.runInContext('GameState.selectionMode', c), 'end-turn-confirm');
});

test('PC and mobile quick player/render mirrors remain identical', () => {
    assert.equal(source('player.js'), source('mobile/player-sp.js'));
    const section = text => text.match(/<div class="reference-item">\s*<div class="reference-title">操作確認<\/div>[\s\S]*?<\/select>[\s\S]*?<\/div>/)?.[0];
    assert.equal(section(source('render.js')), section(source('mobile/render-sp.js')));
    const binding = text => text.match(/const operationConfirmSelect = byId\('settings-operation-confirm'\);[\s\S]*?if \(resetButton\)/)?.[0];
    assert.equal(binding(source('render.js')), binding(source('mobile/render-sp.js')));
});
