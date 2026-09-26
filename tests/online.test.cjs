const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
function runtime() {
    const context = vm.createContext({ console, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
    context.self = context;
    context.importScripts = (...names) => names.forEach(name => vm.runInContext(fs.readFileSync(path.join(root, name.split('?')[0]), 'utf8'), context, { filename: name }));
    context.importScripts('battle-engine-worker.js');
    return context;
}
async function initial(c) { return c.execute({ kind: 'init', host: { character: 'takumi', skill: 'lastOrder' }, guest: { character: 'akatsuki', skill: 'foodTrap' } }); }

test('surrender contract, both roles on either turn, private views and ended guard', async () => {
    const c = runtime();
    assert.ok(c.BattleProtocol.actions.includes('playerSurrender'));
    assert.equal(c.BattleProtocol.validAction({name: 'playerSurrender', args: []}), true);
    assert.equal(c.BattleProtocol.validAction({name: 'playerSurrender', args: ['cpu']}), false);
    for (const role of ['host', 'guest']) for (const turn of ['player', 'cpu']) {
        const start = await initial(c);
        start.snapshot.currentTurn = turn;
        start.snapshot.selectionMode = 'event-select';
        const result = await action(c, start.snapshot, 'playerSurrender', [], role);
        const ownSide = role === 'host' ? 'player' : 'cpu';
        assert.equal(result.snapshot.surrenderedBy, ownSide);
        assert.equal(result.snapshot.winner, ownSide === 'player' ? 'cpu' : 'player');
        assert.equal(result.snapshot.gameEnded, true);
        assert.equal(result.snapshot.currentTurn, null);
        const projected = await c.execute({kind: 'project', snapshot: result.snapshot});
        for (const viewer of ['host', 'guest']) {
            const view = projected[viewer];
            assert.equal(view.state.surrenderedBy, viewer === role ? 'player' : 'cpu');
            assert.equal(view.state.winner, viewer === role ? 'cpu' : 'player');
            assert.equal(view.logs[0], viewer === role
                ? '降参しました。あなたの敗北です。' : '相手が降参しました。あなたの勝利です！');
            assert.ok(view.state.players.cpu.hand.every(card => !card.name && !card.type));
        }
        await assert.rejects(action(c, result.snapshot, 'playerSurrender', [], role), /MATCH_ENDED/);
        await assert.rejects(action(c, start.snapshot, 'playerSurrender', [1], role), /INVALID_ACTION/);
    }
    const next = await initial(c);
    assert.equal(next.snapshot.surrenderedBy, null);
});

for (const mobile of [false, true]) test(`local surrender preserves coins, records one loss and invokes story defeat (${mobile ? 'mobile' : 'PC'})`, () => {
    const storage = new Map();
    const logs = [];
    let storyWinner, cleared = 0;
    const c = vm.createContext({console, Date, setTimeout: () => 0, clearTimeout,
        localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
        document: {addEventListener() {}, getElementById() { return null; }},
        addEventListener() {}, addLog: text => logs.push(text)});
    c.window = c;
    const file = name => mobile ? `mobile/${name}-sp.js` : `${name}.js`;
    for (const name of ['cards', 'state', 'player']) vm.runInContext(fs.readFileSync(path.join(root, file(name)), 'utf8'), c);
    vm.runInContext(fs.readFileSync(path.join(root, 'profile.js'), 'utf8'), c);
    vm.runInContext(fs.readFileSync(path.join(root, file('main')), 'utf8'), c);
    Object.assign(c, {clearSavedMatch: () => cleared++, setCPUStatus() {}, hideDiscardBanner() {},
        updateUI() {}, prepareMatchFinale() {}, getOpponentLabelText: () => 'CPU',
        handleStoryBattleEnded: winner => { storyWinner = winner; }});
    const before = clone(c.getUserProfile());
    vm.runInContext("GameState.currentTurn = 'cpu'; playerSurrender(); playerSurrender();", c);
    const after = c.getUserProfile();
    assert.equal(after.coins, before.coins);
    assert.equal(after.stats.matches, before.stats.matches + 1);
    assert.equal(after.stats.wins, before.stats.wins);
    assert.equal(cleared, 1);
    assert.equal(storyWinner, 'cpu');
    assert.equal(logs[0], '降参しました。あなたの敗北です。');
    assert.equal(vm.runInContext('buildWinnerText(GameState.winner)', c), logs[0]);
    const normal = c.recordMatchResult(true);
    assert.equal(normal.coinsGained, c.getUserCoinRules().perMatch + c.getUserCoinRules().perWin);
});

test('online worker supports browsers without randomUUID or Object.hasOwn', async () => {
    const c = runtime();
    c.crypto = { getRandomValues: bytes => require('node:crypto').webcrypto.getRandomValues(bytes) };
    vm.runInContext('Object.hasOwn = undefined;', c);
    const result = await initial(c);
    assert.equal(result.views.guest.state.characterIds.player, 'akatsuki');
    const ids = result.snapshot.deck.map(c => c.id);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(new Set(ids).size, ids.length);
});

test('network dispatch permits only surrender off-turn and preserves other guards', () => {
    const source = fs.readFileSync(path.join(root, 'network.js'), 'utf8');
    const dispatch = source.slice(source.indexOf('    function dispatch('), source.indexOf('    async function resume('));
    const c = vm.createContext({ room: {id: 'test', status: 'playing'}, stopped: false, busy: false,
        pending: null, connected: true, peerPresent: true, GameState: {gameEnded: false},
        getBattleViewModel: () => ({turn: 'opponent'}), protocol: runtime().BattleProtocol,
        user: {id: 'participant'}, revision: 5, fastMode: false, pendingKey: 'test',
        sessionStorage: {setItem() {}}, status() {}, clearTimeout() {}, setTimeout: () => 0,
        deadline: null, resend() {}, message() {}});
    vm.runInContext(dispatch, c);
    c.dispatch('playerEndTurn', []);
    assert.equal(c.pending, null);
    c.dispatch('playerSurrender', []);
    assert.equal(c.pending.action.name, 'playerSurrender');
    assert.equal(c.pending.revision, 5);
    const pending = c.pending;
    c.dispatch('playerSurrender', []);
    assert.equal(c.pending, pending);
    for (const [key, value] of [['stopped', true], ['busy', true], ['connected', false], ['peerPresent', false]]) {
        c.pending = null;
        const original = c[key]; c[key] = value;
        c.dispatch('playerSurrender', []);
        assert.equal(c.pending, null, key);
        c[key] = original;
    }
    c.GameState.gameEnded = true;
    c.dispatch('playerSurrender', []);
    assert.equal(c.pending, null);
});

test('online surrender loss is recorded once across projections and reloads; winner receives no reward', () => {
    const source = fs.readFileSync(path.join(root, 'network.js'), 'utf8');
    const apply = source.slice(source.indexOf('    function applyView('), source.indexOf('    async function sync('));
    const storage = new Map();
    let losses = 0;
    const c = vm.createContext({pending: null, stopped: false, started: true, revision: 0, metrics: null,
        GameState: {}, room: {id: 'test-room'}, recordedSurrenders: new Set(),
        localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
        $: () => null, status() {}, window: {updateUI() {}, addLog() {}, prepareMatchFinale() {},
            recordMatchResult(win, options) { assert.equal(win, false); assert.equal(options.noCoins, true); losses++; }}});
    vm.runInContext(apply, c);
    const state = {gameEnded: true, surrenderedBy: 'player', winner: 'cpu', matchEndedAt: 12345};
    c.applyView({revision: 1, payload: {state}});
    c.applyView({revision: 2, payload: {state}});
    c.recordedSurrenders.clear();
    c.applyView({revision: 3, payload: {state}});
    assert.equal(losses, 1);
    c.applyView({revision: 4, payload: {state: {...state, surrenderedBy: 'cpu', winner: 'player'}}});
    assert.equal(losses, 1);
    c.applyView({revision: 5, payload: {state: {...state, matchEndedAt: 23456}}});
    assert.equal(losses, 2);
});

test('every online character/skill choice stays with its participant through projection', async () => {
    const c = runtime();
    const chars = ['chizuru','mai','takumi','akatsuki'];
    for (const [i, character] of chars.entries()) for (const [j, skill] of c.getSkillDefinitions().entries()) {
        const otherCharacter = chars[(i + 1) % chars.length];
        const otherSkill = c.getSkillDefinitions()[(j + 1) % 6].key;
        const result = await c.execute({ kind: 'init', host: {character, skill: skill.key}, guest: {character: otherCharacter, skill: otherSkill} });
        const restored = await c.execute({kind:'project', snapshot:result.snapshot});
        for (const [role, ownChar, ownSkill, opponentChar, opponentSkill] of [
            ['host',character,skill.key,otherCharacter,otherSkill], ['guest',otherCharacter,otherSkill,character,skill.key]]) {
            assert.equal(restored[role].state.characterIds.player, ownChar);
            assert.equal(restored[role].state.players.player.selectedSkillKey, ownSkill);
            assert.equal(restored[role].state.characterIds.cpu, opponentChar);
            assert.equal(restored[role].state.players.cpu.selectedSkillKey, opponentSkill);
        }
    }
});
async function action(c, state, name, args = [], role = 'host') {
    return c.execute({ kind: 'action', role, snapshot: clone(state), action: { name, args } });
}
function total(s) {
    return s.deck.length + s.discard.length + Object.values(s.players).reduce((n,p)=>n+p.hand.length+p.set.length+p.events.length,0)
        + (s.pendingEventContext?.openedCards?.length || 0);
}
function fixture(c, state, ingredients = ['ごはん','のり'], event) {
    const s = clone(state);
    const deck = clone(c.buildDeck());
    s.players.player = clone(c.createPlayerState()); s.players.cpu = clone(c.createPlayerState());
    const take = name => deck.splice(deck.findIndex(card => card.name === name),1)[0];
    s.players.player.hand = ingredients.map(take);
    s.players.cpu.hand = ['魚','牛肉'].map(take);
    if(event) s.players.player.events=[take(event)];
    s.deck=deck; s.discard=[]; s.currentTurn='player'; s.currentPhase='メインフェイズ';
    s.selectionMode=null; s.candidateRecipes=[]; s.gameEnded=false; s.winner=null;
    return s;
}
test('Web/mobile core rules are identical and CPU mode is still available', () => {
    for (const name of ['cards','state','rules','player','cpu']) {
        assert.equal(fs.readFileSync(path.join(root,`${name}.js`),'utf8'),fs.readFileSync(path.join(root,`mobile/${name}-sp.js`),'utf8'));
    }
    for(const file of ['web.html','mobile/mobile.html']) {
        const html=fs.readFileSync(path.join(root,file),'utf8');
        assert.match(html,/menu-cpu-button/); assert.match(html,/network.js/);
        assert.doesNotMatch(html,/firebase.*script|script.*firebase/);
    }
});
test('HOST first, opaque IDs, perspective and private projections', async () => {
    const c=runtime(), r=await initial(c);
    assert.equal(r.snapshot.currentTurn,'player');
    assert.equal(r.views.guest.state.currentTurn,'cpu');
    assert.equal(r.views.guest.state.characterIds.player,'akatsuki');
    assert.equal(total(r.snapshot),54);
    assert.match(r.snapshot.deck[0].id,/^[a-f0-9-]{36}$/);
    for(const role of ['host','guest']) {
        const v=r.views[role].state;
        assert.ok(v.deck.every(x=>!x.name&&!x.type));
        assert.ok(v.players.cpu.hand.every(x=>!x.name&&!x.type));
        assert.equal(v.players.cpu.events.length,0);
        assert.ok(!('settings' in v));
    }
    assert.deepEqual(clone(c.BattleProtocol.swap(c.BattleProtocol.swap(r.snapshot))),clone(r.snapshot));
});
test('card setting, turn enforcement and no secret-name opponent logs', async () => {
    const c=runtime(); let r=await initial(c);
    r.snapshot=fixture(c,r.snapshot);
    await assert.rejects(action(c,r.snapshot,'playerEndTurn',[],'guest'),/NOT_YOUR_TURN/);
    const card=r.snapshot.players.player.hand[0];
    r=await action(c,r.snapshot,'playerSetCard',[card.id]);
    assert.equal(r.views.guest.state.pendingSetCardId,null);
    assert.ok(!JSON.stringify(r.views.guest.logs).includes(card.name));
    r=await action(c,r.snapshot,'confirmSetCard');
    assert.equal(r.snapshot.players.player.set.length,1);
    assert.equal(r.views.guest.state.players.cpu.set[0].name,undefined);
    assert.equal(total(r.snapshot),54);
});
test('cooking reuses existing recipes and 10 point and special wins', async () => {
    const c=runtime(); let r=await initial(c);
    let s=fixture(c,r.snapshot,['ごはん','のり']); s.players.player.score=9;
    r=await action(c,s,'playerShowRecipeCandidates');
    r=await action(c,r.snapshot,'playerCookSelectedRecipe',['おにぎり']);
    assert.equal(r.snapshot.players.player.score,10);
    assert.equal(r.snapshot.winner,'player'); assert.equal(r.views.guest.state.winner,'cpu');
    assert.equal(total(r.snapshot),54);
    s=fixture(c,s,['魚','大根']); s.players.player.score=6;
    s.players.player.cookedMeatTypes=['鶏肉','豚肉','牛肉'];
    r=await action(c,s,'playerShowRecipeCandidates');
    r=await action(c,r.snapshot,'playerCookSelectedRecipe',['ブリ大根']);
    assert.equal(r.snapshot.specialWinReason,'料理の達人'); assert.equal(r.snapshot.gameEnded,true);
});
test('turn-end cleanup, guest draw, guest actions and no CPU auto-play', async () => {
    const c=runtime(); let r=await initial(c);
    r=await action(c,r.snapshot,'playerEndTurn'); r=await action(c,r.snapshot,'confirmEndTurn');
    const n=r.snapshot.discardNeedCount;
    const cards=[...r.snapshot.players.player.hand,...r.snapshot.players.player.events].slice(0,n);
    for (const card of cards) r=await action(c,r.snapshot,'toggleDiscardSelection',[card.id]);
    r=await action(c,r.snapshot,'confirmDiscardSelection');
    assert.equal(r.snapshot.currentTurn,'cpu'); assert.equal(r.views.guest.state.currentTurn,'player');
    assert.equal(r.snapshot.players.player.hand.length+r.snapshot.players.player.events.length,2);
    r=await action(c,r.snapshot,'playerEndTurn',[],'guest');
    assert.equal(r.views.guest.state.selectionMode,'end-turn-confirm');
    assert.equal(r.views.host.state.selectionMode,null); assert.equal(total(r.snapshot),54);
});
test('all nine events resolve through existing player.js without losing cards', async () => {
    const c=runtime(), base=(await initial(c)).snapshot;
    for (const event of c.eventDefinitions) {
        let s=fixture(c,base,['ごはん','のり','卵'],event.name);
        if(event.name==='ゴミ収集車') s.discard.push(s.deck.splice(s.deck.findIndex(x=>x.type==='ingredient'),1)[0]);
        if(event.name==='やっぱやめた') s.players.player.set.push(s.players.player.hand.pop());
        let r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
        r=await action(c,r.snapshot,'confirmEventCard');
        for(let steps=0; r.snapshot.selectionMode==='event-target' && steps<3; steps++) {
            const ctx=r.snapshot.pendingEventContext;
            for(const opt of ctx.options.slice(0,Math.max(1,ctx.minSelect))) r=await action(c,r.snapshot,'toggleEventTargetSelection',[opt.id]);
            r=await action(c,r.snapshot,'confirmEventSelection');
        }
        assert.equal(r.snapshot.selectionMode,null,event.name);
        assert.equal(r.snapshot.players.player.usedEventThisTurn,true,event.name);
        assert.equal(total(r.snapshot),54,event.name);
        assert.ok(r.snapshot.discard.some(card=>card.name===event.name),event.name);
    }
});
test('pack purchase stays in match points and skill trap remains public', async () => {
    const c=runtime(); let s=fixture(c,(await initial(c)).snapshot); s.players.player.score=3;
    let r=await action(c,s,'playerBuyPack',['board']);
    r=await action(c,r.snapshot,'confirmPackPurchase');
    assert.equal(r.snapshot.players.player.score,0); assert.equal(r.snapshot.players.player.packs[0].key,'board');
    s=fixture(c,s); s.players.player.selectedSkillKey='foodTrap';
    r=await action(c,s,'playerUseSkill'); r=await action(c,r.snapshot,'confirmSkillActivation');
    const option=r.snapshot.pendingSkillContext.options[0];
    r=await action(c,r.snapshot,'toggleEventTargetSelection',[option.id]);
    r=await action(c,r.snapshot,'confirmEventSelection');
    assert.ok(r.snapshot.players.cpu.set[0].trapLocked);
    assert.equal(r.views.guest.state.players.player.set[0].trapOwner,'cpu');
    assert.equal(total(r.snapshot),54);
});
test('CPU turn still runs with the real rules and returns to player', async () => {
    const c=runtime(); c.importScripts('cpu.js'); c.FriendBattle={isActive:()=>false};
    c.enablePlayerControls=()=>{};
    c.initGame(); c.GameState.settings.cpuSpeed='fast'; c.GameState.currentTurn='cpu';
    await c.cpuTurn();
    assert.ok(c.GameState.gameEnded||c.GameState.currentTurn==='player');
    assert.equal(total(c.GameState),54);
});
test('deck search skill remains usable while the deck itself is redacted', async () => {
    const c=runtime(); const s=fixture(c,(await initial(c)).snapshot);
    s.players.player.selectedSkillKey='aceProcurement'; s.players.cpu.score=8;
    let r=await action(c,s,'playerUseSkill');
    assert.equal(r.views.host.state.onlineSkillStatus.ok,true);
    assert.ok(r.views.host.state.deck.every(card=>!card.name));
    r=await action(c,r.snapshot,'confirmSkillActivation');
    const id=r.snapshot.pendingSkillContext.options[0].id;
    r=await action(c,r.snapshot,'toggleEventTargetSelection',[id]);
    r=await action(c,r.snapshot,'confirmEventSelection');
    assert.ok(r.snapshot.players.player.hand.some(card=>card.id===id));
    assert.equal(r.snapshot.players.player.skillUseCounts.aceProcurement,1);
    assert.equal(total(r.snapshot),54);
});
test('next human chooses Battle Mode discard pickup after turn handoff', async () => {
    const c=runtime();const s=fixture(c,(await initial(c)).snapshot);
    s.players.cpu.battleALaCarteModeActive=true;
    s.discard.push(s.deck.splice(s.deck.findIndex(card=>card.type==='ingredient'),1)[0]);
    let r=await action(c,s,'playerEndTurn');r=await action(c,r.snapshot,'confirmEndTurn');
    assert.equal(r.snapshot.currentTurn,'cpu');
    assert.equal(r.views.guest.state.pendingEventContext.actor,'player');
    assert.equal(r.views.guest.state.selectionMode,'event-target');
    assert.equal(r.views.host.state.pendingEventContext,null);
    const id=r.snapshot.pendingEventContext.options[0].id;
    r=await action(c,r.snapshot,'toggleEventTargetSelection',[id],'guest');
    r=await action(c,r.snapshot,'confirmEventSelection',[],'guest');
    assert.ok(r.snapshot.players.cpu.hand.some(card=>card.id===id));
    assert.equal(r.snapshot.selectionMode,null);assert.equal(total(r.snapshot),54);
});

test('server-selected GUEST first is projected correctly without changing CPU initialization', async () => {
    const c=runtime();
    const r=await c.execute({kind:'init', firstRole:'guest'});
    assert.equal(r.snapshot.currentTurn,'cpu');
    assert.equal(r.views.host.state.currentTurn,'cpu');
    assert.equal(r.views.guest.state.currentTurn,'player');
    assert.equal(total(r.snapshot),54);
    await assert.rejects(action(c,r.snapshot,'playerEndTurn'),/NOT_YOUR_TURN/);
    await action(c,r.snapshot,'playerEndTurn',[],'guest');
    c.initGame(); assert.equal(c.GameState.currentTurn,'player');
});

test('shared ViewModel uses me/opponent for either online role and preserves CPU labels', async () => {
    const c=runtime(), r=await initial(c);
    c.importScripts('battle-view-model.js');
    for(const role of ['host','guest']) {
        const v=c.BattleViewModel.fromState(r.views[role].state,true);
        assert.equal(v.me.characterId,role==='host'?'takumi':'akatsuki');
        assert.equal(v.opponentLabel,'相手');
        assert.equal(v.turn,role==='host'?'me':'opponent');
        assert.ok(v.opponent.hand.every(card=>card.hidden));
    }
    assert.equal(c.BattleViewModel.fromState(r.views.host.state,false).opponentLabel,'CPU');
    const projected=await c.execute({kind:'project',snapshot:r.snapshot});
    assert.equal(projected.guest.state.characterIds.player,'akatsuki');
});

test('GUEST cooking, pack and skill use the same rules and winner perspective', async () => {
    const c=runtime(); let s=fixture(c,(await initial(c)).snapshot,['ごはん','のり']);
    s=c.BattleProtocol.swap(s);
    s.players.cpu.score=3;
    let r=await action(c,s,'playerBuyPack',['board'],'guest');
    r=await action(c,r.snapshot,'confirmPackPurchase',[],'guest');
    assert.equal(r.views.guest.state.players.player.packs[0].key,'board');
    r.snapshot.players.cpu.selectedSkillKey='foodTrap';
    r=await action(c,r.snapshot,'playerUseSkill',[],'guest');
    r=await action(c,r.snapshot,'confirmSkillActivation',[],'guest');
    const id=r.views.guest.state.pendingSkillContext.options[0].id;
    r=await action(c,r.snapshot,'toggleEventTargetSelection',[id],'guest');
    r=await action(c,r.snapshot,'confirmEventSelection',[],'guest');
    assert.ok(r.views.host.state.players.player.set.some(card=>card.trapLocked));
    s=fixture(c,s,['ごはん','のり']); s=c.BattleProtocol.swap(s); s.players.cpu.score=9;
    r=await action(c,s,'playerShowRecipeCandidates',[],'guest');
    r=await action(c,r.snapshot,'playerCookSelectedRecipe',['おにぎり'],'guest');
    assert.equal(r.snapshot.winner,'cpu'); assert.equal(r.views.guest.state.winner,'player');
});
