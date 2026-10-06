const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
class Element {
    constructor(tag = 'div') {
        this.tagName = tag; this.children = []; this.dataset = {}; this.textContent = ''; this.className = '';
        this.attributes = {}; this.handlers = {};
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            toggle: (name, on) => {
                const names = new Set(this.className.split(' ').filter(Boolean));
                if (on ?? !names.has(name)) names.add(name); else names.delete(name);
                this.className = [...names].join(' ');
            },
            add: (...names) => names.forEach(n => this.classList.toggle(n, true)),
            remove: (...names) => names.forEach(n => this.classList.toggle(n, false))
        };
    }
    appendChild(el) { this.children.push(el); return el; }
    append(...els) { this.children.push(...els); }
    replaceChildren(...els) { this.children = els; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    querySelectorAll() { return []; }
    get text() { return this.textContent + this.children.map(c => c.text).join(''); }
}
function runtime(mobile = false, storage = new Map()) {
    const elements = new Map(), timers = new Map(), listeners = [], logs = [];
    for (const id of ['achievement-list', 'achievement-count', 'achievement-migration-summary', 'achievement-toast',
        'achievement-title-picker', 'achievement-frame-picker', 'achievement-profile-name', 'achievement-profile-icon',
        'menu-achievements-button', 'user-achievements-button', 'achievement-close-button', 'result-summary',
        'sleeve-picker', 'settings-sleeve-picker', 'board-picker', 'settings-board-picker',
        mobile ? 'mobile-player-field' : 'pc-player-field', 'opponent-test-field']) elements.set(id, new Element());
    elements.get('achievement-toast').className = 'hidden';
    const c = vm.createContext({ console, Date, Math, crypto: require('node:crypto').webcrypto,
        setTimeout: (fn, ms) => { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; },
        clearTimeout: id => timers.delete(id),
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        document: { readyState: 'loading', getElementById: id => elements.get(id) || null,
            createElement: tag => new Element(tag), addEventListener: (_name, fn) => listeners.push(fn),
            querySelectorAll: () => [], querySelector: () => null, documentElement: { style: { setProperty() {} } } },
        location: { pathname: mobile ? '/mobile/mobile.html' : '/web.html' }, addEventListener() {},
        updateUI() {}, addLog: text => logs.push(text), playSfx() {}, playCookBgm() {}, hideDiscardBanner() {}, setCPUStatus() {} });
    c.window = c; c.FriendBattle = { isActive: () => false };
    for (const name of ['cards', 'state', 'rules', 'player']) vm.runInContext(read(mobile ? `mobile/${name}-sp.js` : `${name}.js`), c);
    vm.runInContext(read('profile.js'), c);
    vm.runInContext(read('battle-view-model.js'), c);
    vm.runInContext(read('missions.js'), c);
    vm.runInContext(read('achievements.js'), c);
    const achievementInit = listeners.at(-1);
    vm.runInContext(read(mobile ? 'mobile/main-sp.js' : 'main.js'), c);
    Object.assign(c, { updateBattleMenu() {}, getOpponentLabelText: () => 'CPU', prepareMatchFinale() {}, showSpotlightSkillCutin() {} });
    c.Achievements.initialize(); c.initGame();
    return { c, elements, timers, storage, achievementInit, logs };
}
let cardId = 0;
function cook(c, name = 'おにぎり', side = 'player', viaPlayer = true) {
    const own = c.GameState.players[side], recipe = c.recipes.find(r => r.name === name);
    own.hand = recipe.required.map(name => ({ id: ++cardId, type: 'ingredient', name })); own.set = [];
    const plan = c.getRecipePlan(own, recipe);
    if (side === 'player' && viaPlayer) {
        c.GameState.currentTurn = 'player'; c.GameState.selectionMode = null; c.GameState.candidateRecipes = [plan];
        c.playerCookSelectedRecipe(name);
    } else assert.equal(c.applyRecipePlan(own, plan), true);
}
function eventDish(c, name, side = 'player') {
    const own = c.GameState.players[side];
    own.hand = ['牛肉', '豚肉'].map(name => ({ id: ++cardId, type: 'ingredient', name }));
    own.events = [{ id: ++cardId, type: 'event', name }]; own.lockedCookingThisTurn = false;
    c.GameState.currentTurn = side; c.GameState.turnNumber = 2; c.GameState.selectionMode = null; own.usedEventThisTurn = false;
    if (side === 'player') {
        c.playerUseEvent(own.events[0].id); c.confirmEventCard();
        c.GameState.selectedTargetIds = own.hand.slice(0, name === '創作料理' ? 2 : 1).map(card => card.id);
        c.confirmEventSelection();
    } else c.executeEventEffect(own, c.GameState.players.player, own.events[0], 'cpu', null);
}
const ids = c => Object.keys(c.Achievements.readLocal().unlocked);
const has = (c, ...expected) => expected.forEach(id => assert.ok(ids(c).includes(id), id));
for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    test(`${label}: firstDish/dish10/dish50/dish100/dish500 and firstWin/win10/win50/win100/matches100 through real match results`, () => {
        const { c } = runtime(mobile);
        for (let match = 0; match < 100; match++) {
            c.initGame();
            for (let dish = 0; dish < 10; dish++) cook(c);
            assert.equal(c.GameState.gameEnded, true);
        }
        has(c, 'firstDish', 'dish10', 'dish50', 'dish100', 'dish500', 'firstWin', 'win10', 'win50', 'win100', 'matches100');
        assert.equal(c.Achievements.readLocal().counters.dishes, 1000);
        assert.equal(c.Achievements.readLocal().counters.matches, 100);
        assert.equal(c.Achievements.readLocal().counters.wins, 100);
    });
    test(`${label}: stew7/bakudan/manpuku/recipeComplete count normal recipes only`, () => {
        const { c } = runtime(mobile);
        for (const recipe of c.recipes) { c.initGame(); cook(c, recipe.name); }
        has(c, 'stew7', 'bakudan', 'manpuku', 'recipeComplete');
        assert.equal(c.Achievements.readLocal().sets.recipes.length, 18);
        assert.equal(c.Achievements.readLocal().counters.dishes, 18);
    });
    test(`${label}: sousaku and emergency dishes count once, opponents and story do not count`, () => {
        const { c } = runtime(mobile);
        eventDish(c, '創作料理');
        has(c, 'sousaku', 'firstDish');
        assert.equal(c.Achievements.readLocal().sets.recipes.length, 0);
        c.initGame(); eventDish(c, '緊急料理');
        assert.equal(c.Achievements.readLocal().counters.dishes, 2);
        c.initGame(); cook(c, 'カレー', 'cpu'); eventDish(c, '創作料理', 'cpu');
        assert.equal(c.Achievements.readLocal().counters.dishes, 2);
        c.__storyActiveEpisodeId = 'episode3'; c.initGame(); cook(c, '爆弾おにぎり');
        assert.equal(c.Achievements.readLocal().counters.dishes, 2);
        assert.equal(c.Achievements.readLocal().counters.matches, 0);
        assert.ok(!ids(c).includes('bakudan'));
        assert.ok(!ids(c).includes('battleMode'));
    });
    test(`${label}: masterChefWin and fullBellyWin include special wins below ten points`, () => {
        const { c } = runtime(mobile);
        for (const name of ['豚バラ大根', 'ブリ大根', 'オムライス', 'キーマカレー']) {
            c.GameState.players.player.recipesCookedThisTurn = 0; cook(c, name);
        }
        assert.equal(c.GameState.specialWinReason, '料理の達人'); has(c, 'masterChefWin');
        c.initGame(); c.GameState.players.cpu.score = 5;
        c.markTurnStartStatus(c.GameState.players.player, c.GameState.players.cpu);
        for (let i = 0; i < 3; i++) cook(c);
        assert.equal(c.GameState.players.player.score, 3);
        assert.equal(c.GameState.specialWinReason, '満腹マスター'); has(c, 'fullBellyWin');
    });
    test(`${label}: skillMaster/allCharacters and fullCourse use winning selection and final owned packs`, () => {
        const { c } = runtime(mobile);
        const characterIds = ['chizuru', 'mai', 'takumi', 'akatsuki'];
        for (const [index, skill] of c.getSkillDefinitions().entries()) {
            c.initGame(); c.setPlayerSelectedSkill(c.GameState.players.player, skill.key);
            c.GameState.characterIds.player = characterIds[index % 4]; cook(c, '満腹カレー');
        }
        has(c, 'skillMaster', 'allCharacters');
        c.initGame(); c.GameState.players.player.score = 7;
        for (const key of ['board', 'ecoBag', 'freezer']) assert.equal(c.buyPack(c.GameState.players.player, key), true);
        assert.equal(c.GameState.players.player.score, 0); cook(c, '満腹カレー'); has(c, 'fullCourse');
        const loser = runtime(mobile).c; loser.setPlayerSelectedSkill(loser.GameState.players.player, 'tasteThief'); loser.endGame('cpu');
        assert.equal(loser.Achievements.readLocal().sets.skillsWon.length, 0);
    });
    test(`${label}: battleMode and feast8 unlock during the match and retain notice/result data`, () => {
        const { c, elements, timers } = runtime(mobile);
        for (let i = 0; i < 5; i++) cook(c);
        has(c, 'battleMode'); assert.equal(c.GameState.gameEnded, false);
        for (let i = 0; i < 3; i++) cook(c);
        has(c, 'feast8');
        assert.match(elements.get('achievement-toast').text, /アチーブメント解除！『はじめての一皿』/);
        assert.equal([...timers.values()][0].ms, 3000);
        assert.ok(c.Achievements.matchUnlocks().some(d => d.id === 'feast8'));
        c.endGame('cpu');
        c.renderMatchResultSummary();
        assert.match(elements.get('result-summary').text, /今回のアチーブメント.*食べ放題/);
    });
    test(`${label}: shutout requires zero throughout; comeback9 observes the state before the final dish; oneShot requires a ten point dish from zero`, () => {
        const good = runtime(mobile).c; cook(good, '爆弾おにぎり'); has(good, 'shutout', 'oneShot');
        const comeback = runtime(mobile).c; comeback.GameState.players.cpu.score = 9; cook(comeback, '満腹カレー'); has(comeback, 'comeback9');
        const returned = runtime(mobile).c;
        returned.GameState.players.cpu.score = 1;
        returned.GameState.players.player.events = [{ id: 90000, type: 'event', name: '爆買い' }];
        returned.setPlayerSelectedSkill(returned.GameState.players.player, 'tasteThief'); returned.GameState.turnNumber = 2;
        assert.equal(returned.activateSkillBySide('player', { costEventId: 90000 }).ok, true);
        assert.equal(returned.GameState.players.cpu.score, 0);
        cook(returned, '満腹カレー');
        assert.ok(!ids(returned).includes('shutout')); assert.ok(!ids(returned).includes('oneShot'));
        const near = runtime(mobile).c; near.GameState.players.cpu.score = 9; near.GameState.players.player.score = 4; cook(near, 'カレー');
        assert.ok(!ids(near).includes('comeback9'));
        const loss = runtime(mobile).c; loss.GameState.players.cpu.score = 9; loss.checkWinner(); loss.endGame('cpu');
        assert.ok(!ids(loss).includes('comeback9'));
    });
    test(`${label}: missionFirst/missionComplete and storyComplete through real clear hooks`, () => {
        const { c } = runtime(mobile);
        for (const def of c.Missions.definitions) {
            c.initGame(); c.GameState.activeMissionId = def.id;
            const p = c.GameState.players.player;
            if (def.id === 'comeback') { c.GameState.players.cpu.score = 5; c.checkWinner(); }
            if (def.id === 'bakudanOnigiri') cook(c, '爆弾おにぎり');
            else cook(c, '満腹カレー');
            has(c, 'missionFirst');
        }
        has(c, 'missionComplete');
        const source = read('story-mode.js').replace(/\}\)\(\);\s*$/, 'window.__achievementStoryTest = { S, saveProgress };\n})();');
        vm.runInContext(source, c);
        c.__achievementStoryTest.S.progress = { episode1: true, episode2: true, episode3: true };
        c.__achievementStoryTest.saveProgress(); has(c, 'storyComplete');
    });
    test(`${label}: autosave round-trip retains hidden score evidence and new-achievement result list without duplicate counts`, () => {
        const r = runtime(mobile), { c } = r;
        vm.runInContext('gameStartedOnce = true', c);
        c.GameState.players.cpu.score = 9; c.checkWinner(); cook(c);
        c.saveMatchSnapshot('achievement-test'); const saved = c.readSavedMatch(); assert.ok(saved);
        c.initGame(); c.applySavedMatchSnapshot(saved.snapshot);
        assert.equal(c.GameState.players.player.achievementTracking.comeback9Seen, true);
        c.Achievements.observeMatch(c.GameState);
        assert.equal(c.Achievements.readLocal().counters.dishes, 1);
        const restored = runtime(mobile, r.storage).c; restored.applySavedMatchSnapshot(saved.snapshot);
        restored.Achievements.observeMatch(restored.GameState);
        assert.equal(restored.Achievements.readLocal().counters.dishes, 1);
        cook(restored, '満腹カレー'); has(restored, 'comeback9');
        assert.ok(restored.Achievements.matchUnlocks().some(d => d.id === 'firstDish'));
        restored.Achievements.observeMatch(restored.GameState); restored.endGame('player');
        assert.equal(restored.Achievements.readLocal().counters.matches, 1);
        assert.equal(restored.Achievements.readLocal().counters.dishes, 2);
    });
}
test('migration uses stored old profile totals, retained recipe history, mission and story clears once and silently', () => {
    const storage = new Map([
        ['battle-a-la-carte:user-profile:v1', JSON.stringify({ name: 'Old', stats: { dishes: 500, wins: 100, matches: 100 },
            recentDishes: [{ name: '創作料理' }, { name: 'カレー' }, { name: '爆弾おにぎり' }, { name: '満腹カレー' }] })],
        ['balc_missions_v1', JSON.stringify({ cleared: Object.fromEntries(['noItems', 'bakudanOnigiri', 'manpukuCurry', 'noSkill', 'noEvent', 'comeback'].map(id => [id, '2026-09-30T00:00:00Z'])) })],
        ['battleAlaCarteStoryProgressV1', JSON.stringify({ episode1: true, episode2: true, episode3: true })]
    ]);
    const { c, elements, timers } = runtime(false, storage);
    has(c, 'dish500', 'win100', 'matches100', 'stew7', 'bakudan', 'manpuku', 'sousaku', 'missionFirst', 'missionComplete', 'storyComplete');
    const data = c.Achievements.readLocal();
    assert.equal(data.counters.retroactiveUnlocked, ids(c).length);
    assert.equal(data.sets.skillsWon.length, 0); assert.equal(data.sets.charactersWon.length, 0);
    assert.equal(data.counters.onlineWins, 0); assert.equal(timers.size, 0);
    c.Achievements.renderScreen();
    assert.equal(elements.get('achievement-migration-summary').text, `これまでの記録から ${ids(c).length} 個を達成済みにしました`);
    assert.deepEqual(plain(c.Achievements.initialize()), plain(data));
    assert.equal(runtime(false, storage).c.Achievements.readLocal().counters.dishes, 500);
});
for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile' : 'PC'}: migrated totals cap card progress and fill unlocked bars without changing counters`, () => {
        const storage = new Map([['battle-a-la-carte:user-profile:v1', JSON.stringify({
            stats: { dishes: 120, wins: 120, matches: 120 }
        })]]);
        const { c, elements } = runtime(mobile, storage);
        const before = plain(c.Achievements.readLocal());
        c.Achievements.renderScreen();
        for (const [id, value, target] of [
            ['firstDish', 1, 1], ['dish10', 10, 10], ['dish50', 50, 50], ['dish100', 100, 100], ['dish500', 120, 500],
            ['firstWin', 1, 1], ['win10', 10, 10], ['win50', 50, 50], ['win100', 100, 100], ['matches100', 100, 100]
        ]) {
            const card = elements.get('achievement-list').children.find(card => card.dataset.achievementId === id);
            assert.equal(card.children.find(el => el.className === 'achievement-progress').textContent, `${value} / ${target}`, id);
            const bar = card.children.find(el => el.tagName === 'progress');
            assert.equal(bar.max, target, id); assert.equal(bar.value, value, id);
            assert.equal(card.classList.contains('unlocked'), id !== 'dish500', id);
        }
        assert.deepEqual(plain(c.Achievements.readLocal()), before);
        assert.equal(c.Achievements.readLocal().counters.dishes, 120);
        assert.equal(c.Achievements.progressFor(c.Achievements.getDefinition('dish50')).value, 120);
    });
}

test('old autosave migration seeds its already recorded dishes; new dishes alone increase totals', () => {
    const first = runtime(); cook(first.c);
    const snapshot = plain(first.c.GameState); delete snapshot.achievementMatchId;
    const storage = new Map([
        ['battle-a-la-carte:user-profile:v1', JSON.stringify({ stats: { dishes: 1 }, recentDishes: [{ name: 'おにぎり' }] })],
        ['battle-a-la-carte:match-autosave:v1', JSON.stringify({ schemaVersion: 1, snapshot })]
    ]);
    const { c } = runtime(false, storage); c.applySavedMatchSnapshot(snapshot); c.Achievements.observeMatch(c.GameState);
    assert.equal(c.Achievements.readLocal().counters.dishes, 1); cook(c);
    assert.equal(c.Achievements.readLocal().counters.dishes, 2);
});
test('retroactive recipeComplete uses all 18 retained normal recipes, excludes event dishes, and does not invent missing wins', () => {
    const seed = runtime().c;
    const storage = new Map([['battle-a-la-carte:user-profile:v1', JSON.stringify({ stats: { dishes: 20 },
        recentDishes: [...Array.from(seed.recipes, r => ({ name: r.name })), { name: '緊急料理' }, { name: '創作料理' }] })]]);
    const { c } = runtime(false, storage); has(c, 'recipeComplete', 'sousaku');
    assert.equal(c.Achievements.readLocal().sets.recipes.length, 18); assert.equal(c.Achievements.readLocal().counters.wins, 0);
});
test('screen has 43 entries, hidden hints, progress, dates, tier markers and both navigation routes; selection validates unlocked titles and tiers', () => {
    const { c, elements, achievementInit } = runtime();
    achievementInit();
    assert.equal(elements.get('achievement-list').children.length, 43);
    const hidden = elements.get('achievement-list').children.find(card => card.dataset.achievementId === 'oneShot');
    assert.match(hidden.text, /？？？.*一皿ですべてを決める/); assert.doesNotMatch(hidden.text, /一撃必殺/);
    assert.equal(c.Achievements.selectTitle('dish500'), false); assert.equal(c.Achievements.selectFrame('gold'), false);
    cook(c, '爆弾おにぎり'); assert.equal(c.Achievements.selectTitle('bakudan'), true);
    assert.equal(c.Achievements.displayName('Player'), '「爆弾職人」Player');
    assert.equal(c.Achievements.selectTitle('unknown'), false); assert.equal(c.Achievements.selectTitle(''), true);
    let stage; c.showStartStage = id => { stage = id; };
    elements.get('user-achievements-button').handlers.click(); assert.equal(stage, 'start-achievements-stage');
    elements.get('achievement-close-button').handlers.click(); assert.equal(stage, 'start-user-stage');
    elements.get('menu-achievements-button').handlers.click(); elements.get('achievement-close-button').handlers.click(); assert.equal(stage, 'start-menu-stage');
    const unlocked = elements.get('achievement-list').children.find(card => card.dataset.achievementId === 'oneShot');
    assert.match(unlocked.text, /一撃必殺.*達成日/);
    const progress = elements.get('achievement-list').children.find(card => card.dataset.achievementId === 'dish100');
    assert.match(progress.text, /銀枠.*1 \/ 100/);
    assert.equal(c.Achievements.selectFrame('nonsense'), false);
});
test('account union preserves local progress/selections, validates IDs, uploads missing unlocks, and remains local if RPCs fail', async () => {
    const { c } = runtime(); cook(c);
    c.Achievements.selectTitle('firstDish');
    const calls = [];
    const client = { async rpc(name, args) {
        calls.push([name, args]);
        return name === 'balc_get_achievements' ? { data: [
            { achievement_id: 'win100', unlocked_at: '2026-09-30T00:00:00Z' },
            { achievement_id: 'dish100', unlocked_at: '2026-09-29T00:00:00Z' },
            { achievement_id: 'alien', unlocked_at: '2026-09-30T00:00:00Z' } ] } : { data: null };
    } };
    assert.equal(await c.Achievements.syncAccount(client), true); has(c, 'win100');
    assert.ok(!ids(c).includes('alien'));
    assert.equal(c.Achievements.readLocal().counters.wins, 0);
    assert.equal(c.Achievements.readLocal().selectedTitle, 'firstDish');
    assert.deepEqual(calls.map(([name]) => name), ['balc_get_achievements', 'balc_record_achievement']);
    assert.equal(calls[1][1].p_achievement_id, 'firstDish');
    assert.equal(c.Achievements.selectFrame('silver'), true); assert.equal(c.Achievements.selectFrame('gold'), true);
    const icon = new Element(); c.Achievements.applyFrame(icon); assert.ok(icon.classList.contains('achievement-frame-gold'));
    assert.equal(await c.Achievements.syncAccount({ rpc: async () => ({ error: { code: 'PGRST202' } }) }), false);
    assert.equal(await c.Achievements.syncAccount({ rpc: async () => { throw new Error('offline'); } }), false);
    assert.equal(c.Achievements.readLocal().selectedFrame, 'gold');
});
test('new unlocks during account synchronization are uploaded by the coalesced follow-up sync', { timeout: 2000 }, async () => {
    const { c } = runtime(); cook(c);
    await c.Achievements.syncCurrentAccount();
    const remote = new Set(), uploads = []; let release, paused = false;
    let onUpload; const enteredUpload = new Promise(resolve => { onUpload = resolve; });
    const client = { async rpc(name, args) {
        if (name === 'balc_get_achievements') return { data: [...remote].map(id => ({ achievement_id: id, unlocked_at: '2026-10-01T00:00:00Z' })) };
        if (!paused) { paused = true; await new Promise(resolve => { release = resolve; onUpload(); }); }
        remote.add(args.p_achievement_id); uploads.push(args.p_achievement_id); return {};
    } };
    c.FriendBattle.getMissionAccountClient = async () => client;
    const pending = c.Achievements.syncCurrentAccount();
    await enteredUpload;
    assert.ok(release); c.markTurnStartStatus(c.GameState.players.player, c.GameState.players.cpu);
    eventDish(c, '創作料理'); has(c, 'sousaku'); release();
    assert.equal(await pending, true);
    assert.ok(uploads.includes('firstDish')); assert.ok(uploads.includes('sousaku'));
});
function worker() {
    const c = vm.createContext({ console, crypto: require('node:crypto').webcrypto }); c.self = c;
    c.importScripts = (...files) => files.forEach(file => vm.runInContext(read(file.split('?')[0]), c));
    c.importScripts('battle-engine-worker.js'); return c;
}
test('online title/frame fields are additive, validated, projected per role and included in real p_info builder; old clients still initialize', async () => {
    const engine = worker();
    const result = await engine.execute({ kind: 'init', host: { name: 'Host', title: 'win100', frame: 'gold' }, guest: { name: 'Guest', title: 'alien', frame: 'neon' } });
    assert.equal(result.views.guest.state.players.cpu.title, 'win100'); assert.equal(result.views.guest.state.players.cpu.frame, 'gold');
    assert.equal(result.views.guest.state.players.player.title, ''); assert.equal(result.views.guest.state.players.player.frame, 'none');
    const old = await engine.execute({ kind: 'init', host: { character: 'takumi', skill: 'foodTrap' }, guest: { character: 'mai', skill: 'tasteThief' } });
    assert.equal(old.views.host.state.players.player.selectedSkillKey, 'foodTrap'); assert.equal(old.views.guest.state.players.player.characterId, undefined);
    assert.equal(old.views.guest.state.characterIds.player, 'mai');
    const { c } = runtime();
    cook(c); c.Achievements.selectTitle('firstDish'); c.$ = () => null;
    const source = read('network.js');
    vm.runInContext(source.slice(source.indexOf('    function profileInfo('), source.indexOf('    async function enter(')), c);
    assert.equal(c.profileInfo().title, 'firstDish'); assert.equal(c.profileInfo().frame, 'none');
    assert.equal(plain(engine.BattleProtocol.view(result.snapshot, 'guest')).players.cpu.name, 'Host');
    for (const key of ['p_info: info', 'balc_create_room', 'balc_join_room', 'balc_create_public_room', 'balc_join_public_room']) assert.ok(source.includes(key));
});
test('onlineFirstWin/onlineWin10, general wins and guest dishes consume own real worker projection exactly once including reconnect', async () => {
    const engine = worker(), guest = runtime(), host = runtime();
    for (let match = 0; match < 10; match++) {
        const initial = await engine.execute({ kind: 'init', firstRole: 'guest' });
        const snapshot = plain(initial.snapshot), p = snapshot.players.cpu;
        snapshot.turnNumber = 2; snapshot.players.player.score = 9;
        p.hand = Array.from(engine.recipes).find(r => r.name === '爆弾おにぎり').required.map((name, i) => ({ id: 'c' + i, type: 'ingredient', name }));
        p.set = [];
        let result = await engine.execute({ kind: 'action', role: 'guest', snapshot, action: { name: 'playerShowRecipeCandidates', args: [] } });
        result = await engine.execute({ kind: 'action', role: 'guest', snapshot: result.snapshot, action: { name: 'playerCookSelectedRecipe', args: ['爆弾おにぎり'] } });
        for (const [r, role] of [[guest, 'guest'], [host, 'host']]) {
            Object.assign(r.c.GameState, plain(result.views[role].state));
            r.c.Achievements.observeMatch(r.c.GameState, { online: true }); r.c.Achievements.observeMatch(r.c.GameState, { online: true });
        }
    }
    has(guest.c, 'onlineFirstWin', 'onlineWin10', 'firstWin', 'win10', 'comeback9', 'oneShot');
    assert.equal(guest.c.Achievements.readLocal().counters.dishes, 10); assert.equal(guest.c.Achievements.readLocal().counters.matches, 10);
    assert.equal(host.c.Achievements.readLocal().counters.dishes, 0); assert.equal(host.c.Achievements.readLocal().counters.onlineWins, 0);
    const reloaded = runtime(false, guest.storage).c; Object.assign(reloaded.GameState, plain(guest.c.GameState));
    reloaded.Achievements.observeMatch(reloaded.GameState, { online: true });
    assert.equal(reloaded.Achievements.readLocal().counters.onlineWins, 10);
});
test('failed/malformed storage never interrupts play or repeats unlocks during the same session', () => {
    const { c } = runtime();
    c.localStorage.getItem = () => { throw new Error('blocked'); }; c.localStorage.setItem = () => { throw new Error('quota'); };
    cook(c, '爆弾おにぎり'); const first = ids(c); c.Achievements.observeMatch(c.GameState);
    assert.deepEqual(ids(c), first); assert.equal(c.Achievements.readLocal().counters.dishes, 1);
    assert.equal(runtime(false, new Map([['balc_achievements_v1', '{broken']])).c.Achievements.readLocal().counters.dishes, 0);
});
test('guest applyView tracks real own projected wins/dishes, skips replayed revisions and preserves result unlocks on reconnect', async () => {
    const engine = worker(), r = runtime(), { c } = r;
    let result = await engine.execute({ kind: 'init', firstRole: 'guest' });
    result.snapshot.players.cpu.hand = Array.from(engine.recipes).find(r => r.name === '満腹カレー').required.map((name, i) => ({ id: 'p' + i, name, type: 'ingredient' }));
    result.snapshot.players.cpu.set = [];
    result = await engine.execute({ kind: 'action', role: 'guest', snapshot: result.snapshot, action: { name: 'playerShowRecipeCandidates', args: [] } });
    result = await engine.execute({ kind: 'action', role: 'guest', snapshot: result.snapshot, action: { name: 'playerCookSelectedRecipe', args: ['満腹カレー'] } });
    Object.assign(c, { $: () => null, controls() {}, status() {}, metrics: null,
        sessionStorage: { removeItem() {} }, __battleSafeStartGame() {}, __battleStartBgmOnce() {}, pushMatchExitGuardHistory() {} });
    vm.runInContext(`let pending = null, deadline = null, pendingKey = 'pending', revision = 0, stopped = false,
        started = true, quickConfirm = null, room = { id: 'mock-room' }; const recordedSurrenders = new Set();`, c);
    const source = read('network.js');
    vm.runInContext(source.slice(source.indexOf('    function applyView('), source.indexOf('    async function sync(')), c);
    const row = { revision: 5, payload: plain(result.views.guest) };
    c.applyView(row); c.applyView(row);
    has(c, 'onlineFirstWin', 'manpuku', 'oneShot');
    assert.equal(c.Achievements.readLocal().counters.onlineWins, 1);
    assert.equal(c.Achievements.readLocal().counters.dishes, 1);
    c.renderMatchResultSummary(); assert.match(r.elements.get('result-summary').text, /はじめての対戦相手/);
    const reconnected = runtime(false, r.storage).c;
    Object.assign(reconnected.GameState, plain(result.views.guest.state)); reconnected.Achievements.observeMatch(reconnected.GameState, { online: true });
    assert.equal(reconnected.Achievements.readLocal().counters.onlineWins, 1);
    assert.ok(reconnected.Achievements.matchUnlocks().some(d => d.id === 'onlineFirstWin'));
});
test('both online roles count a surrender victory once, no opponent dishes; anonymous accounts do not sync', async () => {
    const engine = worker();
    for (const role of ['host', 'guest']) {
        const initial = await engine.execute({ kind: 'init' });
        const result = await engine.execute({ kind: 'action', role, snapshot: initial.snapshot, action: { name: 'playerSurrender', args: [] } });
        for (const viewer of ['host', 'guest']) {
            const { c } = runtime();
            Object.assign(c.GameState, plain(result.views[viewer].state));
            c.Achievements.observeMatch(c.GameState, { online: true }); c.Achievements.observeMatch(c.GameState, { online: true });
            assert.equal(c.Achievements.readLocal().counters.matches, 1);
            assert.equal(c.Achievements.readLocal().counters.wins, role === viewer ? 0 : 1);
            assert.equal(c.Achievements.readLocal().counters.onlineWins, role === viewer ? 0 : 1);
            assert.ok(!ids(c).includes('oneShot'));
            c.FriendBattle.getMissionAccountClient = async () => null;
            assert.equal(await c.Achievements.syncCurrentAccount(), false);
        }
    }
});
test('incomplete old score history never retroactively implies shutout; tracking resets for the next match', () => {
    const { c } = runtime();
    const old = plain(c.GameState); delete old.players.player.achievementTracking; delete old.players.cpu.achievementTracking;
    c.applySavedMatchSnapshot(old); cook(c, '爆弾おにぎり');
    assert.ok(!ids(c).includes('shutout'));
    c.initGame(); assert.equal(c.GameState.players.player.achievementTracking.completeHistory, true);
    assert.equal(c.GameState.players.player.achievementTracking.comeback9Seen, false);
    cook(c, '爆弾おにぎり'); has(c, 'shutout');
});
test('shared mirrors, UI containment, cache versions and account hooks remain wired on both pages', () => {
    for (const name of ['state', 'rules', 'player', 'main']) assert.equal(read(name + '.js').replaceAll('../assets/', 'assets/'), read('mobile/' + name + '-sp.js').replaceAll('../assets/', 'assets/').replace("window.location.href = '../index.html'", "window.location.href = 'index.html'"));
    for (const [file, prefix, suffix] of [['web.html', '', ''], ['mobile/mobile.html', '../', '-sp']]) {
        const html = read(file);
        for (const module of ['achievements.js', 'network.js']) assert.ok(html.includes(`${prefix}${module}?v=${'20261007-osananajimi105a'}`), file + ': ' + module);
        for (const module of ['missions.js', 'battle-protocol.js', 'story-mode.js']) assert.ok(html.includes(`${prefix}${module}?v=${module === 'battle-protocol.js' ? '20261002-ach1' : module === 'story-mode.js' ? '20261006-icons99e' : '20261004-story-viewer1'}`), file + ': ' + module);
        for (const module of ['state', 'rules', 'player', 'main', 'render']) {
            const version = ['main', 'render'].includes(module) ? '20261007-osananajimi105a' : module === 'state' ? '20261003-rewards-bgm1' : '20261002-ach1';
            assert.ok(html.includes(`${module}${suffix}.js?v=${version}`));
        }
        const panel = html.slice(html.indexOf('<div id="start-achievements-stage"'), html.indexOf('<div id="start-user-stage"'));
        assert.match(panel, /start-stage-body[\s\S]*achievement-list[\s\S]*start-stage-footer[\s\S]*achievement-close-button/);
        assert.equal((html.match(/id="achievement-list"/g) || []).length, 1);
    }
    assert.match(read('achievements.css'), /achievement-toast[^}]*pointer-events: none/);
    assert.match(read('battle-engine-worker.js'), /achievements\.js\?v=20261003-rewards-bgm1/);
    assert.match(read('network.js'), /Achievements\?\.observeMatch\(GameState, \{ online: true \}\)/);
    assert.match(read('network.js'), /!next.is_anonymous[\s\S]*Achievements\?\.syncCurrentAccount/);
});

const rewardCharacters = [['Chizuru', 'chizuru', '千鶴'], ['Mai', 'mai', '舞依'], ['Takumi', 'takumi', '拓海'], ['Akatsuki', 'akatsuki', '暁']];
for (const mobile of [false, true]) {
    for (const [key, character, name] of rewardCharacters) test(`${mobile ? 'phone' : 'PC'}: ${character} rewards at 5/20/50 finished matches, selectable title/frame/sleeve/board, replay-safe`, () => {
        const r = runtime(mobile), { c, elements } = r;
        assert.equal(c.Missions.selectSleeve(`sleeve-char-${character}`), false);
        assert.equal(c.Missions.selectBoard(`board-char-${character}`), false);
        for (let n = 1; n <= 50; n++) {
            c.initGame(); c.GameState.characterIds = { player: character, cpu: character === 'mai' ? 'chizuru' : 'mai' };
            c.GameState.activeMissionId = n % 3 === 0 ? 'noSkill' : null;
            c.Achievements.observeMatch(c.GameState);
            assert.equal(c.Achievements.readLocal().counters.characterUses[character], n - 1);
            if (n % 2) c.playerSurrender(); else c.endGame('player');
            c.Achievements.observeMatch(c.GameState); c.endGame('player');
            const data = c.Achievements.readLocal();
            assert.equal(data.counters.characterUses[character], n);
            assert.equal(data.counters.matches, n);
            for (const target of [5, 20, 50]) assert.equal(!!data.unlocked[`char${key}${target}`], n >= target);
            if ([5, 20, 50].includes(n)) {
                // Other achievements unlocked by this result appear first in the same toast queue.
                if (!elements.get('achievement-toast').text.includes(name)) [...r.timers.values()].at(-1).fn();
                assert.match(elements.get('achievement-toast').text, new RegExp(name));
                assert.ok(c.Achievements.matchUnlocks().some(d => d.id === `char${key}${n}`));
                assert.equal(c.Achievements.selectTitle(`char${key}${n}`), true);
            }
            c.Achievements.clearToasts();
        }
        assert.equal(c.Missions.selectSleeve(`sleeve-char-${character}`), true);
        assert.equal(c.Missions.selectBoard(`board-char-${character}`), true);
        assert.equal(c.Achievements.selectFrame('silver'), true);
        const field = elements.get(mobile ? 'mobile-player-field' : 'pc-player-field');
        assert.match(field.style['--selected-board-background'], new RegExp(`assets/battle-images/boards/board-char-${character}\\.webp`));
        assert.equal(field.classList.contains('has-board-background'), true);
        assert.equal(elements.get('opponent-test-field').style['--selected-board-background'], undefined);
        c.GameState.storyEpisodeId = 'episode4'; c.Missions.applyBoard();
        c.FriendBattle.isActive = () => true; c.Missions.applyBoard();
        assert.equal(c.Missions.readLocal().selectedBoard, `board-char-${character}`);
        const result = new Element(); c.Achievements.renderResult(result);
        assert.match(result.text, new RegExp(`${name}マスター.*銀枠解放.*盤面背景`));
        const reloaded = runtime(mobile, r.storage).c;
        Object.assign(reloaded.GameState, plain(c.GameState), { storyEpisodeId: null });
        reloaded.Achievements.observeMatch(reloaded.GameState);
        assert.equal(reloaded.Achievements.readLocal().counters.characterUses[character], 50);
        assert.equal(reloaded.Missions.readLocal().selectedSleeve, `sleeve-char-${character}`);
        assert.equal(reloaded.Missions.readLocal().selectedBoard, `board-char-${character}`);
        assert.equal(reloaded.Missions.selectBoard('default'), true);
        assert.equal(reloaded.Missions.selectBoard('unknown'), false);
        assert.equal(reloaded.Missions.selectSleeve('sleeve-char-kanna'), false);
    });
    test(`${mobile ? 'phone' : 'PC'}: character usage excludes opponents, incomplete matches, tutorials, ADV and nonplayable IDs`, () => {
        const { c } = runtime(mobile);
        for (const guard of ['achievementStory', 'storyEpisodeId', 'activeEpisode']) {
            c.initGame(); c.GameState.characterIds = { player: 'takumi', cpu: 'akatsuki' };
            if (guard === 'achievementStory') c.GameState.achievementStory = true;
            if (guard === 'storyEpisodeId') c.GameState.storyEpisodeId = 'episode1';
            if (guard === 'activeEpisode') c.__storyActiveEpisodeId = 'episode4';
            c.GameState.gameEnded = true; c.Achievements.observeMatch(c.GameState);
            c.__storyActiveEpisodeId = null; c.GameState.storyEpisodeId = null;
        }
        c.initGame(); c.GameState.characterIds = { player: 'chizuru', cpu: 'takumi' };
        c.Achievements.observeMatch(c.GameState);
        assert.equal(c.Achievements.readLocal().counters.matches, 0);
        c.GameState.gameEnded = true; c.Achievements.observeMatch(c.GameState);
        assert.equal(c.Achievements.readLocal().counters.characterUses.chizuru, 1);
        assert.equal(c.Achievements.readLocal().counters.characterUses.takumi, 0);
        c.initGame(); c.GameState.characterIds.player = 'classmate1'; c.GameState.gameEnded = true;
        c.Achievements.observeMatch(c.GameState);
        assert.equal(c.Achievements.readLocal().counters.characterUses.classmate1, undefined);
    });
    test(`${mobile ? 'phone' : 'PC'}: festival requires all seven clears, migrates for existing users, unlocks both cosmetics and gold`, () => {
        const story = Object.fromEntries([4, 5, 6, 7, 8, 9].map(n => ['episode' + n, true]));
        const saved = new Map([['balc_achievements_v1', JSON.stringify({ migratedFromProfileAt: '2026-10-01T00:00:00Z' })],
            ['battleAlaCarteStoryProgressV1', JSON.stringify(story)]]);
        const { c, elements } = runtime(mobile, saved);
        assert.equal(c.Achievements.readLocal().counters.festivalClears, 6);
        assert.ok(!ids(c).includes('storyFestival'));
        assert.equal(c.Missions.selectSleeve('sleeve-festival-six'), false);
        assert.equal(elements.get('board-picker').children.length, 0);
        c.Missions.renderBoardPicker(); assert.equal(elements.get('board-picker').children.length, 1);
        story.episode10 = true; c.GameState.achievementStory = true;
        c.Achievements.refreshCompletions({ story }); has(c, 'storyFestival');
        assert.match(elements.get('achievement-toast').text, /文化祭の思い出/);
        assert.equal(c.Achievements.selectTitle('storyFestival'), true);
        assert.equal(c.Achievements.selectFrame('gold'), true);
        assert.equal(c.Missions.selectSleeve('sleeve-festival-six'), true);
        assert.equal(c.Missions.selectBoard('board-festival-classroom'), true);
        assert.equal(elements.get('board-picker').children.length, 2);
        assert.ok(!ids(c).includes('storyComplete'));
        c.Achievements.refreshCompletions({ story: { ...story, episode1: true, episode2: true, episode3: true } }); has(c, 'storyComplete');
        const old = new Map([['balc_achievements_v1', JSON.stringify({ migratedFromProfileAt: '2026-10-01T00:00:00Z' })],
            ['battleAlaCarteStoryProgressV1', JSON.stringify(story)]]);
        const migrated = runtime(mobile, old); has(migrated.c, 'storyFestival');
        assert.equal(migrated.timers.size, 0);
        assert.equal(migrated.c.Achievements.readLocal().counters.retroactiveUnlocked, 1);
    });
}

test('usage migration counts only confirmed retained characters, once; never infers a favourite or totals without characters', () => {
    const records = Object.fromEntries(Array.from({ length: 5 }, (_, n) => ['old' + n, { ended: true, characterId: 'chizuru' }]));
    Object.assign(records, { story: { ended: true, characterId: 'chizuru', story: true }, unfinished: { characterId: 'chizuru' }, unknown: { ended: true, characterId: 'alien' } });
    const storage = new Map([['balc_achievements_v1', JSON.stringify({ migratedFromProfileAt: '2026-10-01T00:00:00Z', counters: { matchRecords: records } })],
        ['battle-a-la-carte:user-profile:v1', JSON.stringify({ favoriteCharacterId: 'takumi', stats: { matches: 500, characterUses: { chizuru: 5, mai: 20, takumi: -1 } } })]]);
    const { c } = runtime(false, storage); has(c, 'charChizuru5', 'charMai5', 'charMai20');
    assert.deepEqual(plain(c.Achievements.readLocal().counters.characterUses), { chizuru: 5, mai: 20, takumi: 0, akatsuki: 0, tsuyoshi: 0, kanna: 0, yuzuki: 0, ryuta: 0 });
    const again = runtime(false, storage).c;
    assert.deepEqual(plain(again.Achievements.readLocal().counters.characterUses), plain(c.Achievements.readLocal().counters.characterUses));
    const noCharacters = runtime(false, new Map([['battle-a-la-carte:user-profile:v1', JSON.stringify({ favoriteCharacterId: 'takumi', stats: { matches: 500 } })]])).c;
    assert.equal(noCharacters.Achievements.readLocal().counters.characterUses.takumi, 0);
});

test('real online host and guest projections count their own characters after surrender, including reconnect', async () => {
    const e = worker(), host = runtime(), guest = runtime(true);
    for (let n = 0; n < 5; n++) {
        const initial = await e.execute({ kind: 'init', host: { character: 'takumi' }, guest: { character: 'akatsuki' } });
        const result = await e.execute({ kind: 'action', role: n % 2 ? 'guest' : 'host', snapshot: initial.snapshot, action: { name: 'playerSurrender', args: [] } });
        for (const [r, role, character] of [[host, 'host', 'takumi'], [guest, 'guest', 'akatsuki']]) {
            Object.assign(r.c.GameState, plain(result.views[role].state));
            r.c.Achievements.observeMatch(r.c.GameState, { online: true }); r.c.Achievements.observeMatch(r.c.GameState, { online: true });
            assert.equal(r.c.Achievements.readLocal().counters.characterUses[character], n + 1);
            assert.doesNotMatch(JSON.stringify(result.views[role]), /selectedBoard|selectedSleeve/);
        }
    }
    has(host.c, 'charTakumi5'); has(guest.c, 'charAkatsuki5');
    assert.equal(host.c.Achievements.readLocal().counters.characterUses.akatsuki, 0);
    assert.equal(guest.c.Achievements.readLocal().counters.characterUses.takumi, 0);
    const reloaded = runtime(true, guest.storage).c;
    Object.assign(reloaded.GameState, plain(guest.c.GameState)); reloaded.Achievements.observeMatch(reloaded.GameState, { online: true });
    assert.equal(reloaded.Achievements.readLocal().counters.characterUses.akatsuki, 5);
});

test('new ID rejection remains silent, keeps local rewards, and does not block subsequent uploads; unknown remote IDs are ignored', async () => {
    const { c, elements } = runtime();
    const calls = [];
    const client = { async rpc(name, args) {
        if (name === 'balc_get_achievements') return { data: [
            { achievement_id: 'charMai20', unlocked_at: '2026-10-03T00:00:00Z' },
            { achievement_id: 'alien', unlocked_at: '2026-10-03T00:00:00Z' } ] };
        calls.push(args.p_achievement_id);
        return args.p_achievement_id.startsWith('char') ? { error: { code: '22023', message: 'INVALID_ACHIEVEMENT' } } : {};
    } };
    assert.equal(await c.Achievements.syncAccount(client), true); has(c, 'charMai20');
    assert.equal(c.Missions.selectSleeve('sleeve-char-mai'), true);
    c.Achievements.refreshCompletions({ story: Object.fromEntries([4, 5, 6, 7, 8, 9, 10].map(n => ['episode' + n, true])), silent: true });
    const reject = { async rpc(name, args) {
        if (name === 'balc_get_achievements') return { data: [] };
        calls.push(args.p_achievement_id);
        if (args.p_achievement_id.startsWith('char')) throw Error('INVALID_ACHIEVEMENT');
        return {};
    } };
    assert.equal(await c.Achievements.syncAccount(reject), false);
    assert.deepEqual(calls, ['charMai20', 'storyFestival']);
    assert.doesNotMatch(elements.get('achievement-list').text, /INVALID|エラー|alien/);
    assert.ok(!ids(c).includes('alien')); has(c, 'charMai20', 'storyFestival');
    assert.equal(c.Missions.selectBoard('board-festival-classroom'), true);
});

for (const mobile of [false, true]) test(`105a ${mobile ? 'phone' : 'PC'}: 剛/栞那/結月/龍太 usage is local and counted once without replacing an original character or adding rewards`, () => {
    const {c, storage} = runtime(mobile);
    const definitions = plain(c.Achievements.definitions), missions = plain(c.Missions.definitions);
    for (const character of ['chizuru', 'mai', 'takumi', 'tsuyoshi', 'kanna', 'yuzuki', 'ryuta']) {
        c.initGame(); c.GameState.characterIds.player = character;
        c.GameState.gameEnded = true; c.GameState.winner = 'player';
        c.Achievements.observeMatch(c.GameState); c.Achievements.observeMatch(c.GameState);
    }
    assert.equal(c.Achievements.readLocal().counters.characterUses.tsuyoshi, 1);
    assert.equal(c.Achievements.readLocal().counters.characterUses.kanna, 1);
    assert.equal(c.Achievements.readLocal().counters.characterUses.yuzuki, 1);
    assert.equal(c.Achievements.readLocal().counters.characterUses.ryuta, 1);
    assert.deepEqual(plain(c.Achievements.readLocal().sets.charactersWon).sort(), ['chizuru', 'mai', 'takumi']);
    assert.ok(!ids(c).includes('allCharacters'));
    c.initGame(); c.GameState.characterIds.player = 'akatsuki'; c.GameState.gameEnded = true; c.GameState.winner = 'player';
    c.Achievements.observeMatch(c.GameState); has(c, 'allCharacters');
    const reloaded = runtime(mobile, storage).c;
    assert.equal(reloaded.Achievements.readLocal().counters.characterUses.tsuyoshi, 1);
    assert.equal(reloaded.Achievements.readLocal().counters.characterUses.kanna, 1);
    assert.equal(reloaded.Achievements.readLocal().counters.characterUses.yuzuki, 1);
    assert.equal(reloaded.Achievements.readLocal().counters.characterUses.ryuta, 1);
    assert.deepEqual(plain(c.Achievements.definitions), definitions);
    assert.deepEqual(plain(c.Missions.definitions), missions);
    assert.ok(!c.Achievements.definitions.some(def => /tsuyoshi|kanna|yuzuki|ryuta/i.test(def.id)));
});
