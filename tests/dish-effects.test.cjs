const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = data => JSON.parse(JSON.stringify(data));
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

function element() {
    const classes = new Set();
    const el = { children: [], dataset: {}, handlers: {}, style: { setProperty(name, value) { this[name] = value; } },
        attributes: {}, textContent: '', clientWidth: 1440, clientHeight: 810 };
    Object.defineProperty(el, 'className', { get: () => [...classes].join(' '),
        set: value => { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); } });
    el.classList = { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) };
    el.setAttribute = (name, value) => { el.attributes[name] = value; };
    el.appendChild = child => { child.parent = el; el.children.push(child); return child; };
    el.remove = () => { if (el.parent) el.parent.children = el.parent.children.filter(child => child !== el); };
    el.replaceChildren = () => { el.children = []; };
    el.addEventListener = (type, fn) => { (el.handlers[type] ||= []).push(fn); };
    el.fire = (type, extra = {}) => { let prevented = false, stopped = false;
        for (const fn of el.handlers[type] || []) fn({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }, ...extra });
        return { prevented, stopped }; };
    return el;
}
function runtime(mobile = false, reduced = false, storage = new Map()) {
    let now = 10000, next = 0;
    const jobs = new Map(), sounds = [], logs = [], statuses = [], listeners = {};
    const nodes = Object.fromEntries(['app-stage', 'start-overlay', 'spotlight-overlay', 'spotlight-card', 'spotlight-badge',
        'spotlight-art', 'spotlight-name', 'spotlight-sub', 'result-overlay', 'final-field-actions'].map(id => [id, element()]));
    for (const id of ['start-overlay', 'spotlight-overlay', 'result-overlay', 'final-field-actions']) nodes[id].classList.add('hidden');
    class Audio {
        constructor(src) { this.src = src; this.volume = 1; this.paused = true; }
        pause() { this.paused = true; }
        play() { return Promise.resolve(); }
        cloneNode() { return { volume: this.volume, play: () => { sounds.push({ src: this.src, at: now }); return Promise.resolve(); } }; }
    }
    class ClockDate extends Date { static now() { return now; } }
    const c = vm.createContext({ console, Audio, Date: ClockDate,
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        matchMedia: () => ({ matches: reduced }),
        document: { addEventListener() {}, getElementById: id => nodes[id] || null, createElement: element, querySelectorAll: () => [] },
        addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
        setTimeout(fn, ms = 0) { const id = ++next; jobs.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: id => jobs.delete(id),
        StageLayout: { stage: nodes['app-stage'], logical: { width: mobile ? 432 : 1440, height: mobile ? 768 : 810 } }
    });
    c.window = c;
    for (const name of ['cards', 'state', 'rules', 'player', 'cpu', 'audio', 'main']) vm.runInContext(read(mobile ? `mobile/${name}-sp.js` : `${name}.js`), c);
    vm.runInContext(read('dish-effects.js'), c);
    const render = read(mobile ? 'mobile/render-sp.js' : 'render.js');
    vm.runInContext(render.slice(render.indexOf('function animateCookingFusion('), render.indexOf('function animateDiscardTransfers(')), c);
    let seen = { player: 0, cpu: 0 };
    Object.assign(c, { getIngredientImagePath: name => `/ingredient/${name}.webp`, getRecipeImagePath: name => `/recipe/${name}.webp`,
        addLog: text => logs.push(text), setCPUStatus: text => statuses.push(text), hideDiscardBanner() {}, updateBattleMenu() {}, clearSavedMatch() {},
        enablePlayerControls() {}, getOpponentLabelText: () => 'CPU', startMenuFloatingBackground() {}, stopMenuFloatingBackground() {}, playTitleBGM() {},
        updateUI() { for (const side of ['player', 'cpu']) {
            const entries = c.GameState.players[side].cookedRecipes;
            if (entries.length > seen[side]) c.animateCookingFusion({ dish: entries[0], side, transfers: entries[0].required.map(name => ({ card: { name } })) });
            seen[side] = entries.length;
        } }
    });
    Object.assign(c.GameState, { players: { player: c.createPlayerState(), cpu: c.createPlayerState() },
        currentTurn: 'player', currentPhase: 'メインフェイズ', turnNumber: 2, gameEnded: false, matchStartedAt: 1000,
        deck: [], discard: [], candidateRecipes: [] });
    c.setupAudio();
    vm.runInContext('AudioManager.isUnlocked = true;', c);
    function tick(ms) {
        const end = now + ms;
        while (true) {
            const found = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!found) break;
            const [id, job] = found; jobs.delete(id); now = job.at; job.fn();
        }
        now = end;
    }
    return { c, nodes, storage, jobs, logs, statuses, listeners, tick, sounds, now: () => now,
        fx: () => nodes['app-stage'].children[0], cooks: () => sounds.filter(s => s.src.endsWith('/cook.mp3')),
        ends: () => sounds.filter(s => s.src.endsWith('/game-end.mp3')) };
}
function prepare(r, name = '鮭おにぎり', side = 'player') {
    const recipe = r.c.recipes.find(dish => dish.name === name);
    const actor = r.c.GameState.players[side];
    actor.hand = recipe.required.map((name, i) => ({ id: `${side}-${actor.cookedRecipes.length}-${i}`, type: 'ingredient', name }));
    actor.events = []; actor.set = [];
    r.c.GameState.candidateRecipes = [r.c.getRecipePlan(actor, recipe)];
    return recipe;
}
function installGuest(c) {
    Object.assign(c, { pending: null, revision: 0, stopped: false, started: true, quickConfirm: null, metrics: null,
        status() {}, $: id => c.document.getElementById(id) });
    const source = read('network.js');
    vm.runInContext(source.slice(source.indexOf('    function applyView('), source.indexOf('    async function sync(')), c);
}

test('local modes and CPU speed persist across runtimes; corrupt/blocked storage falls back safely', () => {
    const r = runtime();
    assert.deepEqual(clone(r.c.DishEffects.preferences()), { dishMode: 'normal', cpuSpeed: 'default' });
    for (const dishMode of ['normal', 'short', 'skip']) {
        r.c.DishEffects.save({ dishMode, cpuSpeed: 'relaxed' });
        const reload = runtime(true, false, r.storage);
        assert.equal(reload.c.DishEffects.mode(), dishMode);
        assert.equal(reload.c.getCpuSpeedMode(), 'relaxed');
    }
    r.storage.set(r.c.DishEffects.key, '{');
    assert.equal(runtime(false, false, r.storage).c.DishEffects.mode(), 'normal');
    r.c.localStorage.getItem = r.c.localStorage.setItem = () => { throw new Error('blocked'); };
    r.c.DishEffects.save({ dishMode: 'short' }); assert.equal(r.c.DishEffects.mode(), 'short');
    for (const storage of [undefined, { getItem: () => null, setItem: () => { throw new Error('quota'); } }]) {
        const unavailable = runtime(); unavailable.c.localStorage = storage;
        unavailable.c.DishEffects.save({ dishMode: 'skip', cpuSpeed: 'relaxed' });
        assert.equal(unavailable.c.DishEffects.mode(), 'skip'); assert.equal(unavailable.c.getCpuSpeedMode(), 'relaxed');
    }
});

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    for (const mode of ['normal', 'short', 'skip']) {
        const delay = mode === 'normal' ? 1200 : mode === 'short' ? 300 : 0;
        test(`${label} ${mode}: actual cooking reveals/sounds once, no score/log mutation from effects`, async () => {
            const r = runtime(mobile), { c } = r;
            c.DishEffects.save({ dishMode: mode });
            const recipe = prepare(r);
            c.playerCookSelectedRecipe(recipe.name);
            const score = c.GameState.players.player.score, logs = r.logs.length;
            assert.equal(c.DishEffects.isActive(), mode !== 'skip');
            assert.equal(r.cooks().length, delay === 0 ? 1 : 0);
            if (delay) { r.tick(delay - 1); assert.equal(r.cooks().length, 0); r.tick(1); assert.equal(r.fx().dataset.phase, 'reveal'); }
            assert.deepEqual(r.cooks().map(s => s.at), [10000 + delay]);
            c.playCookBgm(); c.showSpotlightRecipeCard(recipe); c.updateUI();
            r.tick(10000); await flush();
            assert.equal(r.cooks().length, 1);
            assert.equal(r.nodes['app-stage'].children.length, 0);
            assert.equal(r.jobs.size, 0);
            assert.equal(c.GameState.players.player.score, score); assert.equal(r.logs.length, logs);
        });
        test(`${label} ${mode}: winning dish completes before result controls, once even if clicked`, async () => {
            const r = runtime(mobile), { c } = r;
            c.DishEffects.save({ dishMode: mode });
            c.GameState.players.player.score = 9;
            c.playerCookSelectedRecipe(prepare(r).name);
            assert.equal(c.GameState.gameEnded, true);
            if (mode !== 'skip') {
                assert.equal(r.fx().dataset.winning, 'true');
                assert.equal(r.nodes['final-field-actions'].classList.contains('hidden'), true);
                const overlay = r.fx(); r.tick(200);
                assert.deepEqual(overlay.fire('click'), { prevented: true, stopped: true });
                overlay.fire('click');
            }
            await flush();
            assert.equal(r.nodes['final-field-actions'].classList.contains('hidden'), false);
            assert.equal(r.cooks().length, 1);
            r.tick(10000); await flush(); assert.equal(r.cooks().length, 1); assert.equal(r.jobs.size, 0);
        });
        test(`${label} ${mode}: guest effects stay local and repeated revision cannot replay`, async () => {
            const r = runtime(mobile), { c } = r;
            c.DishEffects.save({ dishMode: mode }); installGuest(c);
            const dish = { name: '満腹カレー', points: 10, required: ['牛肉', 'ごはん'], cookedAt: 10000 };
            const snapshot = clone(c.GameState);
            snapshot.players.cpu.cookedRecipes = [dish];
            snapshot.players.cpu.score = 10; snapshot.gameEnded = true; snapshot.winner = 'cpu';
            snapshot.lastCookedRecipe = { ...dish, side: 'cpu' };
            // Host settings differ: the guest's local presentation choice still applies.
            snapshot.settings.cpuSpeed = 'fast';
            const row = { revision: 1, payload: { state: snapshot, logs: ['相手料理'],
                effects: [{ name: 'playCookBgm', args: [] }, { name: 'showSpotlightRecipeCard', args: [dish] }] } };
            c.applyView(row); c.applyView(row);
            assert.equal(c.DishEffects.mode(), mode);
            if (mode !== 'skip') { assert.ok(r.fx().className.includes('dish-fx-curry')); assert.equal(r.fx().dataset.winning, 'true'); }
            r.tick(delay); assert.equal(r.cooks().length, 1);
            r.tick(10000); await flush(); assert.equal(r.cooks().length, 1); assert.equal(r.jobs.size, 0);
            assert.deepEqual(clone(c.GameState.players), snapshot.players);
        });
    }
    for (const name of ['爆弾おにぎり', '満腹カレー']) test(`${label}: ${name} non-winning ten-point reveal uses its own burst theme`, () => {
        const r = runtime(mobile), { c } = r;
        const dish = { name, points: 10, required: ['ごはん'], cookedAt: 10000 };
        c.GameState.players.player.cookedRecipes = [dish];
        c.playCookBgm(); c.showSpotlightRecipeCard(dish);
        assert.equal(r.fx().dataset.winning, 'false');
        assert.ok(r.fx().className.includes(name === '爆弾おにぎり' ? 'dish-fx-bomb' : 'dish-fx-curry'));
        assert.equal(c.DishEffects.theme(dish).glow, '#eff8ff');
        r.tick(1200); assert.equal(r.fx().dataset.phase, 'reveal'); assert.equal(r.cooks().length, 1);
        r.tick(350); assert.equal(r.fx().dataset.phase, 'whiteout');
        r.tick(180); assert.equal(r.fx().dataset.phase, 'slam');
        r.tick(600); assert.equal(r.fx().dataset.phase, 'burst');
        r.tick(1800); assert.equal(c.DishEffects.isActive(), false); assert.equal(r.cooks().length, 1);
    });
    test(`${label}: dark event dishes fuse discarded costs; short reduced-motion never flashes`, () => {
        for (const name of ['創作料理', '緊急料理']) {
            const r = runtime(mobile, true), { c } = r;
            const dish = { name, points: 3, required: [], fromEvent: true, cookedAt: 10000 };
            c.GameState.players.player.cookedRecipes = [dish];
            c.showSpotlightEventCard({ name, description: 'イベント料理' });
            assert.equal(r.nodes['spotlight-overlay'].classList.contains('hidden'), false);
            c.playCookBgm(); c.animateCookingFusion({ dish, side: 'player', transfers: [{ card: { name: '牛肉' } }] });
            assert.equal(r.nodes['spotlight-overlay'].classList.contains('hidden'), true, 'event preview cannot outlive the dish effect');
            assert.equal(c.DishEffects.mode(), 'short'); assert.equal(r.cooks().length, 1);
            assert.ok(r.fx().className.includes('dish-fx-dark')); assert.ok(r.fx().className.includes('dish-fx-still'));
            assert.equal(c.DishEffects.timing(dish, true).whiteout, 0);
            r.tick(450); assert.equal(r.nodes['app-stage'].children.length, 0); assert.equal(r.jobs.size, 0);
        }
    });
    test(`${label}: skipping before/after reveal settles the actual async wait only once`, async () => {
        for (const at of [200, 1300]) {
            const r = runtime(mobile), { c } = r;
            const dish = { name: '鮭おにぎり', points: 1, required: ['ごはん'], cookedAt: 10000 };
            c.GameState.players.cpu.cookedRecipes = [dish]; c.GameState.currentTurn = 'cpu';
            c.playCookBgm(); let completions = 0;
            const done = c.showSpotlightRecipeCardAsync(dish).then(() => { completions++; });
            r.tick(at); const overlay = r.fx(); overlay.fire('click'); overlay.fire('click'); await done;
            assert.equal(completions, 1); assert.equal(r.cooks().length, 1); assert.equal(r.jobs.size, 0);
            c.DishEffects.show(dish, { side: 'cpu', winning: true });
            assert.equal(c.DishEffects.isActive(), false, 'a later finale cannot revive a skipped dish');
            r.tick(10000); assert.equal(r.cooks().length, 1);
        }
    });
    test(`${label}: menu/page exit cancels effects and sound, including pending winning finale`, async () => {
        for (const leave of [r => r.c.showStartStage('start-menu-stage'), r => r.listeners.pagehide.forEach(fn => fn())]) {
            const r = runtime(mobile);
            r.c.GameState.players.player.score = 9; r.c.playerCookSelectedRecipe(prepare(r).name);
            leave(r); r.tick(10000); await flush(); assert.equal(r.cooks().length, 0);
            assert.equal(r.nodes['app-stage'].children.length, 0); assert.equal(r.jobs.size, 0);
            assert.equal(r.nodes['final-field-actions'].classList.contains('hidden'), true);
        }
    });
    test(`${label}: settings controls save locally; choosing skip ends the current effect`, async () => {
        const r = runtime(mobile), { c } = r;
        for (const prefix of ['start-settings', 'settings']) {
            r.nodes[`${prefix}-dish-mode`] = element(); r.nodes[`${prefix}-cpu-speed`] = element();
            c.DishEffects.bindSettings(prefix);
            r.nodes[`${prefix}-cpu-speed`].value = 'relaxed'; r.nodes[`${prefix}-cpu-speed`].fire('change');
            assert.equal(c.GameState.settings.cpuSpeed, 'relaxed');
            assert.equal(runtime(!mobile, false, r.storage).c.getCpuSpeedMode(), 'relaxed');
            r.nodes[`${prefix}-dish-mode`].value = 'short'; r.nodes[`${prefix}-dish-mode`].fire('change');
            assert.equal(c.DishEffects.mode(), 'short');
        }
        c.playerCookSelectedRecipe(prepare(r).name);
        r.nodes['settings-dish-mode'].value = 'skip'; r.nodes['settings-dish-mode'].fire('change');
        await flush(); assert.equal(c.DishEffects.isActive(), false); assert.equal(r.cooks().length, 1); assert.equal(r.jobs.size, 0);
    });
    test(`${label}: actual CPU cooking uses one reveal and a single winning finale`, async () => {
        for (const winning of [false, true]) {
            const r = runtime(mobile), { c } = r;
            c.DishEffects.save({ cpuSpeed: 'fast' }); c.GameState.currentTurn = 'cpu';
            const recipe = prepare(r, '鮭おにぎり', 'cpu');
            if (winning) c.GameState.players.cpu.score = 9;
            Object.assign(c, { cpuTryBuyPack: () => false, cpuTryBoardCycle: () => false, activateSkillBySide: () => ({ ok: false }) });
            const turn = c.cpuTurn(); await flush();
            assert.equal(c.GameState.players.cpu.cookedRecipes.length, 1);
            assert.equal(r.fx().dataset.winning, String(winning));
            r.tick(1200); assert.equal(r.cooks().length, 1);
            r.tick(c.DishEffects.timing(recipe, winning, 'normal', false).total - 1200);
            await turn; await flush();
            assert.equal(c.GameState.gameEnded, winning);
            assert.equal(c.GameState.currentTurn, winning ? null : 'player');
            assert.equal(r.cooks().length, 1); assert.equal(r.nodes['app-stage'].children.length, 0); assert.equal(r.jobs.size, 0);
        }
    });
    test(`${label}: relaxed CPU delays increase and no CPU wait/action starts in the player's turn`, async () => {
        const r = runtime(mobile), { c } = r;
        c.DishEffects.save({ cpuSpeed: 'relaxed' });
        assert.equal(c.getCpuTurnStartDelay(), 0, 'the visible thinking pause owns the full relaxed start delay');
        assert.equal(c.resolveCpuDelay(3000), 6000); assert.equal(c.resolveCpuDelay(900), 1800);
        assert.equal(c.resolveCpuDelay(1200), 2400); assert.equal(c.resolveCpuDelay(400), 1600);
        const before = clone(c.GameState);
        await c.cpuTurn(); assert.equal(await c.cpuPause(900), false);
        assert.equal(r.jobs.size, 0); assert.equal(r.statuses.length, 0); assert.deepEqual(clone(c.GameState), before);
        c.GameState.currentTurn = 'cpu';
        const turn = c.cpuTurn(); await flush(); assert.ok(r.statuses.includes('考え中…'));
        assert.equal([...r.jobs.values()][0].at - r.now(), 6000);
        c.GameState.currentTurn = 'player'; const hand = clone(c.GameState.players.cpu);
        r.tick(6000); await turn;
        assert.deepEqual(clone(c.GameState.players.cpu), hand); assert.equal(r.jobs.size, 0);
        c.DishEffects.save({ cpuSpeed: 'fast' }); assert.equal(c.resolveCpuDelay(900), 0); assert.equal(c.getCpuTurnStartDelay(), 0);
        c.DishEffects.save({ cpuSpeed: 'default' }); assert.equal(c.resolveCpuDelay(900), 900); assert.equal(c.getCpuTurnStartDelay(), 3000);
    });
    test(`${label}: CPU stops after a pause before main actions if ownership or match changes`, async () => {
        for (const change of [c => { c.GameState.currentTurn = 'player'; }, c => { c.GameState.matchStartedAt++; }]) {
            const r = runtime(mobile), { c } = r;
            c.GameState.currentTurn = 'cpu'; c.DishEffects.save({ cpuSpeed: 'relaxed' });
            c.getTargetTotalHandSize = () => 0;
            let buys = 0; c.cpuTryBuyPack = () => { buys++; return false; };
            const turn = c.cpuTurn(); await flush(); r.tick(6000); await flush();
            change(c); r.tick(1800); await turn; assert.equal(buys, 0);
        }
    });
}

test('points scale aura and winning timings; both pages load the common effect and menu/in-match settings', () => {
    const r = runtime(), fx = r.c.DishEffects;
    assert.deepEqual([1, 2, 4, 7, 10].map(points => fx.theme({ points }).glow), ['#fff2da', '#fff2da', '#ffa44f', '#ffdc67', '#eff8ff']);
    assert.deepEqual([1, 4, 7, 10].map(points => fx.timing({ points }, true, 'normal', false).total), [3230, 3480, 3730, 4130]);
    assert.equal(fx.timing({ points: 1 }, false, 'normal', false).total, 2100);
    assert.equal(fx.timing({ points: 1 }, false, 'short', false).total, 950);
    assert.equal(fx.timing({ points: 10 }, false, 'short', false).total, 1300);
    for (const [file, prefix, suffix] of [['web.html', '', ''], ['mobile/mobile.html', '../', '-sp']]) {
        const html = read(file);
        assert.ok(html.includes(`${prefix}dish-effects.js?v=20261002-fx1`));
        assert.ok(html.includes(`${prefix}dish-effects.css?v=20261002-fx1`));
        for (const name of ['main', 'render', 'cpu', 'audio']) assert.ok(html.includes(`${name}${suffix}.js?v=20261002-fx1`));
        assert.ok(html.includes('id="menu-settings-button"')); assert.ok(html.includes('id="start-settings-stage"'));
        assert.ok(read(`main${suffix ? '-sp' : ''}.js`.replace('main-sp.js', 'mobile/main-sp.js')).includes("settingsHtml('start-settings')"));
        const render = read(suffix ? 'mobile/render-sp.js' : 'render.js');
        assert.ok(render.includes("settingsHtml('settings', false)")); assert.ok(render.includes('value="relaxed"'));
    }
    assert.equal(read('cpu.js'), read('mobile/cpu-sp.js'));
    assert.equal(read('audio.js'), read('mobile/audio-sp.js').replaceAll('../assets/', 'assets/'));
    assert.equal(read('main.js'), read('mobile/main-sp.js').replaceAll('../assets/', 'assets/').replace("window.location.href = '../index.html'", "window.location.href = 'index.html'"));
    const source = read('dish-effects.js');
    assert.doesNotMatch(source, /fetch\(|WebSocket|supabase|https:\/\//);
    assert.match(read('dish-effects.css'), /prefers-reduced-motion/);
});
