const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
test('PC and mobile skill recommendations match the approved table', () => {
    const approved = {
        tasteThief: [3, '初心者向け'], aceProcurement: [3, '初心者向け'],
        foodTrap: [2, '妨害向け'], makanaiSupply: [2, 'ロマン向け'],
        kitchenInfiltration: [2, '逆転向け'], lastOrder: [1, '上級者向け']
    };
    const actual = [];
    for (const file of ['state.js', 'mobile/state-sp.js']) {
        const context = vm.createContext({});
        context.window = context;
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
        const definitions = JSON.parse(vm.runInContext('JSON.stringify(SKILL_DEFINITIONS.map(skill => ({key:skill.key, stars:skill.recommendStars, tag:skill.recommendTag, text:skillRecommendationText(skill)})))', context));
        assert.equal(definitions.length, 6, file);
        for (const skill of definitions) {
            assert.ok(skill.stars >= 1 && skill.stars <= 3 && skill.tag.trim(), `${file}: ${skill.key}`);
            assert.deepEqual([skill.stars, skill.tag], approved[skill.key], `${file}: ${skill.key}`);
            assert.equal(skill.text, '★'.repeat(skill.stars) + '☆'.repeat(3 - skill.stars) + '  ' + skill.tag);
        }
        actual.push(definitions);
    }
    assert.deepEqual(actual[0], actual[1]);
});
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
        deadline: null, resend() {}, message() {}, window: {}, quickConfirm: null});
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
        GameState: {}, room: {id: 'test-room',host_id:'host'}, user:{id:'host'}, recordedSurrenders: new Set(),
        assertCharacterRoom() {}, assertCharacterState() {},
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
        + (s.pendingEventContext?.openedCards?.length || 0) + (s.pendingSkillContext?.openedCards?.length || 0);
}
function fixture(c, state, ingredients = ['ごはん','のり'], event) {
    const s = clone(state);
    const deck = clone(c.buildDeck());
    s.players.player = clone(c.createPlayerState()); s.players.cpu = clone(c.createPlayerState());
    const take = name => deck.splice(deck.findIndex(card => card.name === name),1)[0];
    s.players.player.hand = ingredients.map(take);
    s.players.cpu.hand = ['魚','牛肉'].map(take);
    if(event) s.players.player.events=[take(event)];
    s.deck=deck; s.discard=[]; s.currentTurn='player'; s.currentPhase='メインフェイズ'; s.turnNumber=2;
    s.selectionMode=null; s.candidateRecipes=[]; s.gameEnded=false; s.winner=null;
    return s;
}
test('board cycle validates Unity conditions and consumes one event for one draw once', async () => {
    const c = runtime();
    const base = (await initial(c)).snapshot;
    assert.ok(c.BattleProtocol.actions.includes('playerUseBoardCycle'));
    let s = fixture(c, base, ['魚', '牛肉'], 'やり直し');
    const event = s.players.player.events[0];
    const before = clone(s);
    let r = await action(c, s, 'playerUseBoardCycle', [event.id]);
    assert.equal(r.views.host.logs[0], 'まな板を持っていません。');
    assert.deepEqual(clone(r.snapshot.players.player.events), before.players.player.events);
    s.players.player.packs.push({key: 'board', name: 'まな板'});
    r = await action(c, s, 'playerUseBoardCycle', [event.id]);
    assert.equal(r.views.host.logs[0], '相手より点数が低いときだけ使用できます。');
    assert.equal(r.snapshot.players.player.boardCycleUsed, 0);
    s.players.cpu.score = 3;
    r = await action(c, s, 'playerUseBoardCycle', [s.players.player.hand[0].id]);
    assert.equal(r.views.host.logs[0], '手札のイベントを選んでください。');
    assert.equal(r.snapshot.players.player.boardCycleUsed, 0);
    s.currentPhase = 'エンドフェイズ';
    r = await action(c, s, 'playerUseBoardCycle', [event.id]);
    assert.equal(r.views.host.logs[0], '今は使用できません。');
    s.currentPhase = 'メインフェイズ';
    delete s.players.player.boardCycleUsed; // older save
    event.romanReserved = true; event.trapLocked = true; event.blockedByTrap = true; event.trapOwner = 'cpu';
    const handCount = s.players.player.hand.length + s.players.player.events.length;
    r = await action(c, s, 'playerUseBoardCycle', [event.id]);
    assert.equal(r.views.host.logs[0], 'まな板：イベントを1枚捨てて1枚引いた');
    assert.equal(r.snapshot.players.player.boardCycleUsed, 1);
    assert.equal(r.snapshot.players.player.hand.length + r.snapshot.players.player.events.length, handCount);
    assert.equal(r.snapshot.discard.at(-1).id, event.id);
    for (const flag of ['romanReserved', 'trapLocked', 'blockedByTrap', 'trapOwner'])
        assert.equal(r.snapshot.discard.at(-1)[flag], undefined);
    assert.equal(r.snapshot.players.player.usedEventThisTurn, false);
    assert.equal(total(r.snapshot), 54);
    const again = await action(c, r.snapshot, 'playerUseBoardCycle', [r.snapshot.players.player.events[0]?.id || event.id]);
    assert.equal(again.views.host.logs[0], 'まな板の使用回数が残っていません。');
    assert.equal(again.snapshot.players.player.boardCycleUsed, 1);
});

test('guest board cycle executes on host worker and projects counter to both sides', async () => {
    const c = runtime();
    const s = fixture(c, (await initial(c)).snapshot, ['魚', '牛肉']);
    const event = s.deck.splice(s.deck.findIndex(card => card.name === 'やり直し'), 1)[0];
    s.players.cpu.events = [event];
    s.players.cpu.packs.push({key: 'board', name: 'まな板'});
    s.players.player.score = 3;
    s.currentTurn = 'cpu';
    const r = await action(c, s, 'playerUseBoardCycle', [event.id], 'guest');
    assert.equal(r.snapshot.players.cpu.boardCycleUsed, 1);
    assert.equal(r.snapshot.players.cpu.events.some(card => card.id === event.id), false);
    assert.equal(r.views.guest.state.players.player.boardCycleUsed, 1);
    assert.equal(r.views.host.state.players.cpu.boardCycleUsed, 1);
    assert.equal(r.views.host.state.players.cpu.events.length, 0);
    assert.ok(r.views.host.state.players.cpu.hand.every(card => !card.name && !card.type));
    assert.equal(total(r.snapshot), 54);
    const legacy = clone(s);
    delete legacy.players.player.boardCycleUsed;
    delete legacy.players.cpu.boardCycleUsed;
    const legacyViews = await c.execute({kind: 'project', snapshot: legacy});
    assert.equal(legacyViews.guest.state.players.player.boardCycleUsed, 0);
    assert.equal(legacyViews.host.state.players.cpu.boardCycleUsed, 0);
});

test('CPU board cycle saves emergency cooking when another event qualifies', async () => {
    const c = runtime();
    c.importScripts('cpu.js');
    const s = fixture(c, (await initial(c)).snapshot, ['魚', '牛肉']);
    const deck = s.deck;
    const take = name => deck.splice(deck.findIndex(card => card.name === name), 1)[0];
    const emergency = take('緊急料理');
    const low = take('やり直し');
    s.players.cpu.events = [emergency, low];
    s.players.cpu.packs.push({key: 'board', name: 'まな板'});
    s.players.player.score = 3;
    s.currentTurn = 'cpu';
    c.loadSnapshot(s);
    assert.equal(c.cpuTryBoardCycle(c.GameState.players.cpu, c.GameState.players.player), true);
    assert.equal(c.GameState.players.cpu.boardCycleUsed, 1);
    assert.ok(c.GameState.players.cpu.events.some(card => card.id === emergency.id));
    assert.equal(c.GameState.discard.at(-1).id, low.id);
    const protectedOnly = clone(s);
    protectedOnly.players.cpu.events = [emergency];
    protectedOnly.deck.push(low);
    c.loadSnapshot(protectedOnly);
    assert.equal(c.cpuTryBoardCycle(c.GameState.players.cpu, c.GameState.players.player), false);
});

test('board cycle draw reshuffles the discard when the deck is empty', async () => {
    const c = runtime();
    const s = fixture(c, (await initial(c)).snapshot, ['魚', '牛肉'], 'やり直し');
    s.players.player.packs.push({key: 'board', name: 'まな板'});
    s.players.cpu.score = 3;
    s.discard = s.deck.splice(0);
    const eventId = s.players.player.events[0].id;
    const r = await action(c, s, 'playerUseBoardCycle', [eventId]);
    assert.equal(r.snapshot.players.player.boardCycleUsed, 1);
    assert.equal(r.snapshot.players.player.hand.length + r.snapshot.players.player.events.length, 3);
    assert.equal(r.snapshot.deck.length, s.discard.length);
    assert.equal(total(r.snapshot), 54);
});

test('older PC and mobile autosaves normalize a missing board counter to zero', () => {
    for (const file of ['main.js', 'mobile/main-sp.js']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const fn = source.slice(source.indexOf('function normalizeSavedPlayerState('), source.indexOf('function applySavedMatchSnapshot('));
        const c = vm.createContext({cloneForAutosave: clone});
        vm.runInContext(fn, c);
        assert.equal(c.normalizeSavedPlayerState({score: 2}, {boardCycleUsed: 1}).boardCycleUsed, 0);
        assert.equal(c.normalizeSavedPlayerState({boardCycleUsed: 1}, {}).boardCycleUsed, 1);
    }
});
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
test('food trap unlocks when the victim returns its set to hand or cleaning discards it', async () => {
    for (const eventName of ['やっぱやめた', '大掃除']) {
        const c=runtime(); let s=fixture(c,(await initial(c)).snapshot,['ごはん','のり']);
        s.players.player.selectedSkillKey='foodTrap';
        let r=await action(c,s,'playerUseSkill');
        r=await action(c,r.snapshot,'confirmSkillActivation');
        const trapId=r.snapshot.pendingSkillContext.options[0].id;
        r=await action(c,r.snapshot,'toggleEventTargetSelection',[trapId]);
        r=await action(c,r.snapshot,'confirmEventSelection');
        const trap=r.snapshot.players.cpu.set.find(card=>card.id===trapId);
        assert.equal(trap.trapLocked,true);
        s=r.snapshot;
        const actor=eventName==='やっぱやめた' ? 'cpu' : 'player';
        const role=actor==='cpu' ? 'guest' : 'host';
        s.currentTurn=actor;
        if (eventName==='やっぱやめた') {
            s.players.cpu.hand.push(s.deck.splice(s.deck.findIndex(card=>card.name==='のり'),1)[0]);
        }
        const eventIndex=s.deck.findIndex(card=>card.name===eventName);
        const eventCard=s.deck.splice(eventIndex,1)[0];
        s.players[actor].events.push(eventCard);
        r=await action(c,s,'playerUseEvent',[eventCard.id],role);
        r=await action(c,r.snapshot,'confirmEventCard',[],role);
        const zone=eventName==='やっぱやめた' ? r.snapshot.players.cpu.hand : r.snapshot.discard;
        const moved=zone.find(card=>card.id===trapId);
        assert.ok(moved,`${eventName}: ${JSON.stringify({logs:r.views[role].logs,mode:r.snapshot.selectionMode,turn:r.snapshot.turnNumber,hand:r.snapshot.players.cpu.hand.map(card=>card.name),set:r.snapshot.players.cpu.set.map(card=>card.name)})}`);
        for (const key of ['trapLocked','blockedByTrap','trapOwner']) assert.equal(Object.hasOwn(moved,key),false,`${eventName}: ${key}`);
        if (eventName==='やっぱやめた') {
            assert.equal(c.isCardUsableForCooking(moved),true);
            assert.ok(c.findPossibleRecipesForPlayer(r.snapshot.players.cpu).some(plan=>plan.recipe.name==='おにぎり'));
        }
        assert.equal(total(r.snapshot),54);
    }
});
test('redo discards remaining ingredients and events, draws that count, and needs another card', async () => {
    const c=runtime(), base=(await initial(c)).snapshot;
    let s=fixture(c,base,['ごはん','のり'],'やり直し');
    const otherEvent=s.deck.splice(s.deck.findIndex(card=>card.name==='緊急料理'),1)[0];
    s.players.player.events.push(otherEvent);
    const discardedIds=[...s.players.player.hand,otherEvent].map(card=>card.id);
    const redoId=s.players.player.events[0].id, deckBefore=s.deck.length;
    let r=await action(c,s,'playerUseEvent',[redoId]);
    r=await action(c,r.snapshot,'confirmEventCard');
    assert.equal(r.snapshot.deck.length,deckBefore-discardedIds.length);
    assert.equal(r.snapshot.players.player.hand.length+r.snapshot.players.player.events.length,discardedIds.length);
    for (const id of discardedIds) assert.ok(r.snapshot.discard.some(card=>card.id===id),id);
    assert.ok(r.views.host.logs.some(line=>line.includes('手札3枚を引き直しました')));
    assert.equal(total(r.snapshot),54);

    s=fixture(c,base,[],'やり直し');
    r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
    assert.equal(r.snapshot.selectionMode,null);
    assert.equal(r.snapshot.players.player.events.length,1);
    assert.equal(r.snapshot.players.player.usedEventThisTurn,false);
    assert.ok(r.views.host.logs.some(line=>line.includes('引き直す手札がありません')));

    s=fixture(c,base,[],'やり直し');
    s.players.player.events.push(s.deck.splice(s.deck.findIndex(card=>card.name==='緊急料理'),1)[0]);
    r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
    r=await action(c,r.snapshot,'confirmEventCard');
    assert.equal(r.snapshot.players.player.hand.length+r.snapshot.players.player.events.length,1);
    assert.ok(r.snapshot.discard.some(card=>card.name==='緊急料理'));
});
test('CPU preserves usable emergency cooking instead of redrawing it', () => {
    const c=runtime(); c.importScripts('cpu.js');
    const cpu=c.createPlayerState(), player=c.createPlayerState();
    cpu.hand=[{id:'rice',name:'ごはん',type:'ingredient'},{id:'beef',name:'牛肉',type:'ingredient'}];
    const redo={id:'redo',name:'やり直し',type:'event'};
    const emergency={id:'emergency',name:'緊急料理',type:'event'};
    cpu.events=[redo,emergency];
    assert.equal(c.isCpuEventUseful(cpu,player,emergency,'緊急料理'),true);
    assert.equal(c.isCpuEventUseful(cpu,player,redo,'やり直し'),false);
    cpu.events=[redo];
    assert.equal(c.isCpuEventUseful(cpu,player,redo,'やり直し'),true);
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
    const r=await c.execute({kind:'init', firstRole:'guest',host:{character:'chizuru',skill:'lastOrder'},guest:{character:'mai',skill:'foodTrap'}});
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

test('Roman skill reveals seven, enforces eligibility and two picks, and allows zero', async () => {
    const c=runtime(); let s=fixture(c,(await initial(c)).snapshot,['ごはん']);
    s.players.player.selectedSkillKey='makanaiSupply';
    s.players.player.score=8;
    let r=await action(c,s,'playerUseSkill');
    r=await action(c,r.snapshot,'confirmSkillActivation');
    assert.equal(r.snapshot.players.player.skillUseCounts.makanaiSupply || 0,0);
    assert.equal(r.snapshot.selectionMode,'skill-confirm');
    assert.match(r.views.host.state.onlineSkillStatus.reason,/7点以下/);
    s.players.player.score=7;
    const names=['緊急料理','牛乳','ごはん','魚','カレー粉','のり','バナナ'];
    const placed=names.map(name=>s.deck.splice(s.deck.findIndex(card=>card.name===name),1)[0]);
    s.deck.push(...placed.reverse());
    r=await action(c,s,'playerUseSkill');
    r=await action(c,r.snapshot,'confirmSkillActivation');
    assert.equal(r.snapshot.selectionMode,'skill-target');
    assert.equal(r.snapshot.players.player.skillUseCounts.makanaiSupply,1);
    const ctx=r.snapshot.pendingSkillContext;
    assert.equal(ctx.openedCards.length,7);
    assert.equal(ctx.minSelect,0); assert.equal(ctx.maxSelect,2); assert.equal(ctx.maxSelections,2);
    assert.ok(ctx.description.includes('緊急料理（選択不可）'));
    assert.equal(ctx.options.length,4);
    assert.equal(total(r.snapshot),54);
    r=await action(c,r.snapshot,'toggleEventTargetSelection',[ctx.openedCards[0].id]);
    assert.equal(r.snapshot.selectedTargetIds.length,0);
    for(const option of ctx.options.slice(0,3)) r=await action(c,r.snapshot,'toggleEventTargetSelection',[option.id]);
    assert.equal(r.snapshot.selectedTargetIds.length,2);
    const invalid=clone(r.snapshot); invalid.selectedTargetIds=[...ctx.options.slice(0,3).map(option=>option.id)];
    const refused=await action(c,invalid,'confirmEventSelection');
    assert.equal(refused.snapshot.selectionMode,'skill-target');
    assert.equal(refused.snapshot.players.player.hand.filter(card=>card.romanReserved).length,0);
    const chosen=[...r.snapshot.selectedTargetIds];
    r=await action(c,r.snapshot,'confirmEventSelection');
    assert.equal(r.snapshot.selectionMode,null);
    for(const card of ctx.openedCards) {
        if(chosen.includes(card.id)) assert.equal(r.snapshot.players.player.hand.find(x=>x.id===card.id)?.romanReserved,true);
        else assert.ok(r.snapshot.discard.some(x=>x.id===card.id && !x.romanReserved));
    }
    assert.equal(total(r.snapshot),54);
    r=await action(c,r.snapshot,'playerUseSkill');
    r=await action(c,r.snapshot,'confirmSkillActivation');
    assert.equal(r.snapshot.players.player.skillUseCounts.makanaiSupply,2);
    const second=r.snapshot.pendingSkillContext.openedCards;
    r=await action(c,r.snapshot,'confirmEventSelection');
    assert.equal(r.snapshot.selectionMode,null);
    for(const card of second) assert.ok(r.snapshot.discard.some(x=>x.id===card.id));
    assert.equal(total(r.snapshot),54);
});

test('Roman seven-card reveal reshuffles discarded cards when the deck runs out', async () => {
    const c=runtime(); const s=fixture(c,(await initial(c)).snapshot,['ごはん']);
    s.players.player.selectedSkillKey='makanaiSupply';
    s.discard.push(...s.deck.splice(0,s.deck.length-2));
    let r=await action(c,s,'playerUseSkill');
    r=await action(c,r.snapshot,'confirmSkillActivation');
    assert.equal(r.snapshot.pendingSkillContext.openedCards.length,7);
    assert.equal(new Set(r.snapshot.pendingSkillContext.openedCards.map(card=>card.id)).size,7);
    assert.equal(total(r.snapshot),54);
    r=await action(c,r.snapshot,'confirmEventSelection');
    assert.equal(total(r.snapshot),54);
});

test('Roman reserved ingredients obey recipe and special-event limits and clear on discard and trade', async () => {
    const c=runtime(), base=(await initial(c)).snapshot;
    let s=fixture(c,base,['ごはん','のり'],'緊急料理'); s.players.player.hand[0].romanReserved=true;
    assert.equal(c.getRecipePlan(s.players.player,c.recipes.find(x=>x.name==='おにぎり')).isValid,false);
    const stale={recipe:c.recipes.find(x=>x.name==='おにぎり'),doubledName:null,isValid:true};
    assert.equal(c.applyRecipePlan(s.players.player,stale),false);
    assert.equal(s.players.player.hand.length,2);
    s=fixture(c,base,['ごはん'],'緊急料理'); s.players.player.hand[0].romanReserved=true;
    let r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
    assert.equal(r.snapshot.selectionMode,null);
    assert.ok(r.views.host.logs.some(line=>line.includes('10点料理にしか使えません')));
    s=fixture(c,base,['ごはん','のり'],'緊急料理'); s.players.player.hand[0].romanReserved=true;
    r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
    r=await action(c,r.snapshot,'confirmEventCard');
    assert.equal(r.snapshot.selectionMode,'event-target');
    assert.equal(r.snapshot.pendingEventContext.options.length,1);
    assert.equal(r.snapshot.pendingEventContext.options[0].label,'のり（手札）');
    s=fixture(c,base,['ごはん','のり'],'創作料理'); s.players.player.hand[0].romanReserved=true;
    r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
    assert.equal(r.snapshot.selectionMode,null);
    assert.ok(r.views.host.logs.some(line=>line.includes('10点料理にしか使えません')));
    for(const [name,ingredients] of [
        ['満腹カレー',['ごはん','牛肉','たまねぎ','にんじん','じゃがいも','カレー粉']],
        ['爆弾おにぎり',['ごはん','ごはん','ごはん','ごはん','のり','魚']]
    ]) {
        s=fixture(c,base,ingredients); s.players.player.hand[0].romanReserved=true;
        s.players.player.score=0;
        assert.equal(c.getRecipePlan(s.players.player,c.recipes.find(x=>x.name===name)).isValid,true);
        r=await action(c,s,'playerShowRecipeCandidates');
        r=await action(c,r.snapshot,'playerCookSelectedRecipe',[name]);
        assert.equal(r.snapshot.players.player.score,10);
        assert.equal(r.snapshot.discard.find(card=>card.id===s.players.player.hand[0].id)?.romanReserved,undefined);
    }
    s=fixture(c,base,['ごはん'],'物々交換'); s.players.player.hand[0].romanReserved=true;
    s.players.cpu.hand[0].romanReserved=true;
    r=await action(c,s,'playerUseEvent',[s.players.player.events[0].id]);
    r=await action(c,r.snapshot,'confirmEventCard');
    for(let step=0;step<2;step++) {
        const id=r.snapshot.pendingEventContext.options[0].id;
        r=await action(c,r.snapshot,'toggleEventTargetSelection',[id]);
        r=await action(c,r.snapshot,'confirmEventSelection');
    }
    assert.equal(r.snapshot.players.player.hand[0].romanReserved,undefined);
    assert.equal(r.snapshot.players.cpu.hand.find(card=>card.name==='ごはん')?.romanReserved,undefined);
    s=fixture(c,base,['ごはん']); s.players.player.hand[0].romanReserved=true;
    c.GameState.players.player.hand=[s.players.player.hand[0]]; c.GameState.discard=[];
    c.moveCardToDiscard(c.GameState.players.player.hand.pop());
    assert.equal(c.GameState.discard[0].romanReserved,undefined);
});

test('GUEST Roman selection uses skill-target actions and private projection', async () => {
    const c=runtime(); let s=fixture(c,(await initial(c)).snapshot,['ごはん']);
    s=c.BattleProtocol.swap(s); s.players.cpu.selectedSkillKey='makanaiSupply';
    let r=await action(c,s,'playerUseSkill',[],'guest');
    r=await action(c,r.snapshot,'confirmSkillActivation',[],'guest');
    assert.equal(r.views.guest.state.selectionMode,'skill-target');
    assert.equal(r.views.host.state.pendingSkillContext,null);
    const context=r.views.guest.state.pendingSkillContext;
    assert.equal(context.maxSelections,2);
    if(context.options.length) {
        r=await action(c,r.snapshot,'toggleEventTargetSelection',[context.options[0].id],'guest');
    }
    const selected=[...r.snapshot.selectedTargetIds];
    r=await action(c,r.snapshot,'confirmEventSelection',[],'guest');
    assert.equal(r.snapshot.selectionMode,null);
    assert.equal(r.snapshot.players.cpu.skillUseCounts.makanaiSupply,1);
    for(const id of selected) assert.equal(r.snapshot.players.cpu.hand.find(card=>card.id===id)?.romanReserved,true);
    assert.equal(total(r.snapshot),54);
});

test('Kitchen infiltration costs no event, first-turn events are blocked for either first player', async () => {
    const c=runtime(), base=(await initial(c)).snapshot;
    let s=fixture(c,base,['ごはん']);
    s.players.player.selectedSkillKey='kitchenInfiltration'; s.players.cpu.score=1;
    s.players.cpu.set.push(s.players.cpu.hand.pop());
    let r=await action(c,s,'playerUseSkill'); r=await action(c,r.snapshot,'confirmSkillActivation');
    for(let step=0;step<2;step++) {
        const id=r.snapshot.pendingSkillContext.options[0].id;
        r=await action(c,r.snapshot,'toggleEventTargetSelection',[id]);
        r=await action(c,r.snapshot,'confirmEventSelection');
    }
    assert.equal(r.snapshot.players.player.skillUseCounts.kitchenInfiltration,1);
    assert.equal(r.snapshot.players.player.events.length,0);
    for(const firstRole of ['host','guest']) {
        s=fixture(c,base,['ごはん'],'爆買い');
        const guestEvent=s.deck.splice(s.deck.findIndex(card=>card.name==='爆買い'),1)[0];
        s.players.cpu.events.push(guestEvent);
        s.turnNumber=1; s.currentTurn=firstRole==='host'?'player':'cpu';
        const firstEvent=firstRole==='host'?s.players.player.events[0]:guestEvent;
        r=await action(c,s,'playerUseEvent',[firstEvent.id],firstRole);
        assert.equal(r.snapshot.selectionMode,null);
        assert.equal(r.views[firstRole].state.onlineEventStatus.reason,'最初のターンはイベントを使用できません。');
        assert.ok(r.views[firstRole].logs.includes('最初のターンはイベントを使用できません。'));
        r=await action(c,r.snapshot,'playerEndTurn',[],firstRole);
        r=await action(c,r.snapshot,'confirmEndTurn',[],firstRole);
        if(r.snapshot.selectionMode==='discard') {
            const actor=firstRole==='host'?'player':'cpu';
            const id=r.snapshot.players[actor].hand[0].id;
            r=await action(c,r.snapshot,'toggleDiscardSelection',[id],firstRole);
            r=await action(c,r.snapshot,'confirmDiscardSelection',[],firstRole);
        }
        assert.equal(r.snapshot.turnNumber,2);
        const secondRole=firstRole==='host'?'guest':'host';
        const secondEvent=secondRole==='host'?r.snapshot.players.player.events[0]:r.snapshot.players.cpu.events[0];
        r=await action(c,r.snapshot,'playerUseEvent',[secondEvent.id],secondRole);
        assert.equal(r.views[secondRole].state.selectionMode,'event-confirm');
    }
});

test('Eco Bag and Freezer cost two, board three; Eco Bag raises hand limit and refill', () => {
    const c=runtime();
    assert.deepEqual(clone(c.packDefinitions.map(pack=>pack.cost)),[2,2,3]);
    const p=c.createPlayerState(); p.score=2;
    assert.equal(c.canBuyPack(p,'ecoBag'),true);
    assert.equal(c.canBuyPack(p,'freezer'),true);
    assert.equal(c.canBuyPack(p,'board'),false);
    c.buyPack(p,'ecoBag');
    assert.equal(c.getEndPhaseHandLimit(p),3);
    assert.equal(c.getTargetTotalHandSize(p),6);
    p.packs.push({key:'board'});
    assert.equal(c.getTargetTotalHandSize(p),7);
});

test('CPU uses Roman only with three owned recipe ingredients and pays expendable event first', () => {
    const c=runtime(); c.importScripts('cpu.js');
    const base=c.initGame();
    const cpu=c.GameState.players.cpu, player=c.GameState.players.player;
    cpu.selectedSkillKey='makanaiSupply'; cpu.score=0;
    cpu.hand=[{id:'r1',name:'ごはん',type:'ingredient'},{id:'r2',name:'ごはん',type:'ingredient'}];
    cpu.set=[];
    assert.equal(c.cpuShouldUseRoman(cpu),false);
    cpu.hand.push({id:'r3',name:'ごはん',type:'ingredient'});
    assert.equal(c.cpuShouldUseRoman(cpu),true);
    assert.deepEqual(clone(c.chooseCpuRomanCards(cpu,[
        {id:'milk',name:'牛乳',type:'ingredient'},{id:'rice',name:'ごはん',type:'ingredient'},
        {id:'nori',name:'のり',type:'ingredient'}])),['rice','nori']);
    const emergency={id:'emergency',name:'緊急料理',type:'event'};
    const cleaning={id:'cleaning',name:'大掃除',type:'event'};
    cpu.events=[emergency,cleaning];
    assert.equal(c.cpuPreferredSkillCost(cpu).id,'cleaning');
    cpu.selectedSkillKey='lastOrder'; cpu.score=0; player.score=8;
    c.GameState.currentTurn='cpu'; c.GameState.turnNumber=2;
    const result=c.activateSkillBySide('cpu',{auto:true});
    assert.equal(result.ok,true);
    assert.ok(cpu.events.some(card=>card.id==='emergency'));
    assert.ok(c.GameState.discard.some(card=>card.id==='cleaning'));
    c.GameState.turnNumber=1;
    assert.equal(c.canUseEventThisTurn(cpu),false);
});
