const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function runtime(mobile, reduced = false) {
    let now = 0, nextId = 0;
    const jobs = new Map(), sounds = [], cards = [], listeners = {};
    const classes = new Set(['hidden']);
    const overlay = { classList: {
        contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)
    } };
    class FakeAudio {
        constructor(src) { this.src = src; this.volume = 1; this.paused = true; }
        pause() { this.paused = true; }
        play() { this.paused = false; return Promise.resolve(); }
        cloneNode() {
            const sound = new FakeAudio(this.src);
            sound.play = () => { sounds.push({ src: sound.src, at: now, sound }); return Promise.resolve(); };
            return sound;
        }
    }
    const c = vm.createContext({ console, Audio: FakeAudio,
        setTimeout(callback, delay = 0) { const id = ++nextId; jobs.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => jobs.delete(id),
        document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'start-overlay' ? overlay : null },
        addEventListener: (name, fn) => { listeners[name] = fn; },
        matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return { matches: reduced }; }
    });
    c.window = c;
    c.AudioPack = require('./helpers/audio-pack-stub.cjs')(FakeAudio, sound => {
        if (!sound.loop) sounds.push({ src: sound.src, at: now, sound });
    });
    for (const name of ['cards', 'state', 'rules', 'player', 'cpu', 'audio', 'main']) {
        const file = mobile ? `mobile/${name}-sp.js` : `${name}.js`;
        vm.runInContext(read(file), c, { filename: file });
    }
    c.setupAudio();
    vm.runInContext('AudioManager.isUnlocked = true;', c);
    Object.assign(c, { addLog() {}, updateUI() {}, setCPUStatus() {}, enablePlayerControls() {}, hideDiscardBanner() {},
        updateBattleMenu() {}, clearSavedMatch() {}, getOpponentLabelText: () => 'CPU',
        playTitleBGM() {},
        showSpotlightCard: data => cards.push({ name: data.name, at: now }),
        showSpotlightCardAsync: async data => { cards.push({ name: data.name, at: now }); },
        showSpotlightEventCard() {}, showSpotlightEventCardAsync: async () => {}, hideSpotlightCard() {} });
    Object.assign(c.GameState, { players: { player: c.createPlayerState(), cpu: c.createPlayerState() },
        currentTurn: 'player', currentPhase: 'メインフェイズ', turnNumber: 2, selectionMode: null,
        gameEnded: false, matchStartedAt: 1234, deck: [], discard: [], candidateRecipes: [] });
    function tick(ms) {
        const end = now + ms;
        while (true) {
            const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            const [id, job] = next;
            now = job.at;
            jobs.delete(id);
            job.callback();
        }
        now = end;
    }
    return { c, tick, cards, listeners, overlay, cooks: () => sounds.filter(sound => sound.src.endsWith('/cook')),
        sounds, jobs };
}

function prepareRecipe(c, side = 'player') {
    const recipe = c.recipes.find(item => item.name === '鮭おにぎり');
    const player = c.GameState.players[side];
    player.hand = recipe.required.map((name, i) => ({ id: `${side}-${player.cookedRecipes.length}-${i}`, type: 'ingredient', name }));
    player.set = []; player.events = [];
    c.GameState.candidateRecipes = [c.getRecipePlan(player, recipe)];
    return recipe;
}

function installGuest(c) {
    Object.assign(c, { pending: null, revision: 0, stopped: false, started: true, quickConfirm: null, metrics: null,
        status() {}, $: id => c.document.getElementById(id) });
    const source = read('network.js');
    vm.runInContext(source.slice(source.indexOf('    function applyView('), source.indexOf('    async function sync(')), c);
}

async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    for (const reduced of [false, true]) {
        const delay = reduced ? 0 : 1200;
        test(`${label}: player completion sounds once at ${delay} ms, with no sound on a repeated selection`, () => {
            const r = runtime(mobile, reduced), { c } = r;
            const recipe = prepareRecipe(c);
            c.playerCookSelectedRecipe(recipe.name);
            c.playerCookSelectedRecipe(recipe.name);
            assert.equal(c.GameState.players.player.cookedRecipes.length, 1);
            assert.equal(r.cooks().length, reduced ? 1 : 0);
            if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
            assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
            r.tick(3000);
            assert.equal(r.cooks().length, 1);
            assert.deepEqual(r.cards, [{ name: recipe.name, at: reduced ? 0 : 1200 }], 'fallback card and sound share the reveal moment');
        });

        test(`${label}: actual CPU cooking sounds once at ${delay} ms`, async () => {
            const r = runtime(mobile, reduced), { c } = r;
            const recipe = prepareRecipe(c, 'cpu');
            c.GameState.currentTurn = 'cpu';
            Object.assign(c, { cpuPause: async () => {}, drawUntilTargetHand() {}, cpuTryBuyPack: () => false,
                activateSkillBySide: () => ({ used: false }), cpuTryBoardCycle: () => false });
            const turn = c.cpuTurn();
            await flush();
            assert.equal(c.GameState.players.cpu.cookedRecipes.length, 1);
            assert.equal(r.cooks().length, reduced ? 1 : 0);
            if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
            assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
            r.tick(0);
            await turn;
            r.tick(3000);
            assert.equal(r.cooks().length, 1);
            assert.deepEqual(r.cards, [{ name: recipe.name, at: reduced ? 0 : 1200 }]);
        });

        for (const side of ['player', 'cpu']) {
            for (const special of [false, true]) {
                test(`${label}: ${side} ${special ? 'special' : '10-point'} winning dish sounds once at ${delay} ms after gameEnded`, async () => {
                    const r = runtime(mobile, reduced), { c } = r;
                    const recipe = prepareRecipe(c, side);
                    const actor = c.GameState.players[side];
                    actor.score = special ? 6 : 9;
                    if (special) actor.cookedMeatTypes = ['鶏肉', '豚肉', '牛肉'];
                    if (side === 'cpu') {
                        c.GameState.currentTurn = 'cpu';
                        // Let the CPU reach endGame before the delayed sound, without waiting on presentation.
                        Object.assign(c, { cpuPause: async () => {}, drawUntilTargetHand() {}, cpuTryBuyPack: () => false,
                            activateSkillBySide: () => ({ used: false }), cpuTryBoardCycle: () => false,
                            showSpotlightRecipeCardAsync: async () => {} });
                        await c.cpuTurn();
                    } else {
                        c.playerCookSelectedRecipe(recipe.name);
                        c.playerCookSelectedRecipe(recipe.name);
                    }
                    assert.equal(actor.cookedRecipes.length, 1);
                    assert.equal(c.GameState.gameEnded, true);
                    assert.equal(c.GameState.winner, side);
                    assert.equal(c.GameState.specialWinReason, special ? '料理の達人' : null);
                    assert.equal(c.GameState.lastCookedRecipe.name, recipe.name);
                    assert.deepEqual(r.cards, [{ name: recipe.name, at: 0 }], 'the winning dish stays in the finale');
                    assert.equal(r.cooks().length, reduced ? 1 : 0);
                    if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
                    assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
                    r.tick(3500);
                    assert.equal(r.cooks().length, 1);
                });
            }
        }

        for (const effect of [{ name: 'playCookBgm', args: [] }, { name: 'playSfx', args: ['cook'] }]) {
            test(`${label}: guest ${effect.name} effect sounds once at ${delay} ms across duplicate delivery`, () => {
                const r = runtime(mobile, reduced), { c } = r;
                installGuest(c);
                const row = { revision: 1, payload: { state: clone(c.GameState), effects: [effect] } };
                c.applyView(row); c.applyView(row);
                assert.equal(r.cooks().length, reduced ? 1 : 0);
                if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
                assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
                r.tick(3000);
                assert.equal(r.cooks().length, 1);
            });

            for (const winner of ['player', 'cpu']) {
                test(`${label}: guest ${winner === 'player' ? 'win' : 'loss'} ${effect.name} sounds once at ${delay} ms from an ended state`, () => {
                    const r = runtime(mobile, reduced), { c } = r;
                    installGuest(c);
                    const recipe = prepareRecipe(c, winner);
                    const state = clone(c.GameState);
                    state.gameEnded = true;
                    state.winner = winner;
                    state.lastCookedRecipe = { side: winner, name: recipe.name, points: recipe.points };
                    const row = { revision: 1, payload: { state, effects: [effect] } };
                    c.applyView(row); c.applyView(row);
                    assert.equal(c.GameState.gameEnded, true);
                    assert.deepEqual(r.cards, [{ name: recipe.name, at: 0 }]);
                    assert.equal(r.cooks().length, reduced ? 1 : 0);
                    if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
                    assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
                    r.tick(3500);
                    assert.equal(r.cooks().length, 1);
                });
            }
        }

        test(`${label}: story cooking uses the same ${delay} ms sound through the story guard`, () => {
            const r = runtime(mobile, reduced), { c } = r;
            const source = read('story-mode.js').replace(/\}\)\(\);\s*$/, 'window.__storyTest = { S, startBattle, installGuards };\n})();');
            vm.runInContext(source, c);
            c.__battleSafeStartGame = () => {};
            c.__battleStartBgmOnce = () => {};
            c.__storyTest.startBattle('episode2');
            c.GameState.players.player.score = 0;
            c.__storyTest.S.objectives.skillAce = true;
            c.__storyTest.installGuards();
            const recipe = prepareRecipe(c);
            c.playerCookSelectedRecipe(recipe.name);
            assert.equal(c.GameState.players.player.cookedRecipes.length, 1);
            assert.equal(r.cooks().length, reduced ? 1 : 0);
            if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
            assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
            r.tick(3000);
            assert.equal(r.cooks().length, 1);
        });

        for (const dish of ['緊急料理', '創作料理']) {
            test(`${label}: ${dish} player/CPU completion sounds once at ${delay} ms`, async () => {
                for (const side of ['player', 'cpu']) {
                    const r = runtime(mobile, reduced), { c } = r;
                    const actor = c.GameState.players[side];
                    actor.hand = ['牛肉', '豚肉'].map((name, i) => ({ id: `ingredient-${i}`, name, type: 'ingredient' }));
                    actor.events = [{ id: 'event', name: dish, type: 'event' }];
                    c.GameState.currentTurn = side;
                    if (side === 'cpu') {
                        assert.equal(await c.cpuTryUseEvent(actor, c.GameState.players.player), true);
                    } else {
                        c.playerUseEvent('event'); c.confirmEventCard();
                        for (const option of c.GameState.pendingEventContext.options.slice(0, dish === '創作料理' ? 2 : 1))
                            c.toggleEventTargetSelection(option.id);
                        c.confirmEventSelection();
                    }
                    assert.equal(actor.cookedRecipes.length, 1);
                    assert.equal(r.cooks().length, reduced ? 1 : 0);
                    if (!reduced) { r.tick(1199); assert.equal(r.cooks().length, 0); r.tick(1); }
                    assert.deepEqual(r.cooks().map(sound => sound.at), [delay]);
                    r.tick(3000);
                    assert.equal(r.cooks().length, 1);
                }
            });
        }
    }

    test(`${label}: two rapid dishes keep separate sounds; fallback and non-cook sounds keep working`, () => {
        const r = runtime(mobile), { c } = r;
        c.playCookBgm = undefined;
        c.playerCookSelectedRecipe(prepareRecipe(c).name);
        r.tick(100);
        c.playerCookSelectedRecipe(prepareRecipe(c).name);
        c.playSfx('turnStart');
        assert.equal(r.sounds.length, 1, 'other sound effects remain immediate');
        r.tick(1099); assert.equal(r.cooks().length, 0);
        r.tick(1); assert.deepEqual(r.cooks().map(sound => sound.at), [1200]);
        r.tick(100); assert.deepEqual(r.cooks().map(sound => sound.at), [1200, 1300]);
        assert.notEqual(r.cooks()[0].sound, r.cooks()[1].sound, 'sounds can overlap');
        r.tick(3000); assert.equal(r.cooks().length, 2);
    });

    test(`${label}: pending cook sounds are suppressed on screen change, restart and page exit`, () => {
        for (const change of [
            r => { r.overlay.classList.remove('hidden'); },
            r => { r.c.GameState.matchStartedAt++; },
            r => { r.c.showStartStage('start-story-stage'); },
            r => { r.listeners.pagehide(); },
            r => { r.c.setupAudio(); }
        ]) {
            const r = runtime(mobile);
            r.c.playCookBgm(); r.tick(100); r.c.playSfx('cook');
            change(r);
            r.tick(3000);
            assert.equal(r.cooks().length, 0);
        }
    });

    test(`${label}: surrender cancels pending cook sounds and suppresses late cook cues`, () => {
        for (const side of ['player', 'cpu']) {
            const r = runtime(mobile), { c } = r;
            c.playCookBgm(); r.tick(100); c.playSfx('cook');
            if (side === 'player') c.playerSurrender();
            else { c.GameState.surrenderedBy = 'cpu'; c.endGame('player'); }
            assert.equal(c.GameState.gameEnded, true);
            assert.equal(r.jobs.size, 0, 'surrender clears both pending timers');
            c.playCookBgm(); c.playSfx('cook');
            assert.equal(r.jobs.size, 0, 'late cook cues cannot play after surrender');
            c.GameState.gameEnded = false; c.GameState.surrenderedBy = null;
            r.tick(3000);
            assert.equal(r.cooks().length, 0, 'cancelled sounds stay cancelled');
        }
    });

    test(`${label}: leaving to menu cancels cook sounds, including the winning dish`, () => {
        for (const winning of [false, true]) {
            const r = runtime(mobile), { c } = r;
            const recipe = prepareRecipe(c);
            if (winning) c.GameState.players.player.score = 9;
            c.playerCookSelectedRecipe(recipe.name);
            r.tick(100);
            c.showStartStage('start-menu-stage');
            r.overlay.classList.remove('hidden');
            r.tick(1099); assert.equal(r.cooks().length, 0);
            r.overlay.classList.add('hidden');
            r.tick(3001);
            assert.equal(r.cooks().length, 0, 'returning to battle cannot revive cancelled sounds');
        }
    });

    test(`${label}: guest state updates keep separate sounds through a final state`, () => {
        const r = runtime(mobile), { c } = r;
        installGuest(c);
        const row = revision => ({ revision, payload: { state: clone(c.GameState), effects: [{ name: 'playCookBgm', args: [] }] } });
        c.applyView(row(1));
        r.tick(100); c.applyView(row(2));
        r.tick(1100); assert.deepEqual(r.cooks().map(sound => sound.at), [1200]);
        r.tick(100); assert.deepEqual(r.cooks().map(sound => sound.at), [1200, 1300]);
        c.applyView(row(3));
        r.tick(100);
        const final = row(4); final.payload.state.gameEnded = true; final.payload.effects = [];
        c.applyView(final);
        r.tick(1099); assert.equal(r.cooks().length, 2);
        r.tick(1); assert.deepEqual(r.cooks().map(sound => sound.at), [1200, 1300, 2500]);
        r.tick(3000); assert.equal(r.cooks().length, 3);
    });
}

test('host special-dish completion emits exactly one cook cue for the guest', async () => {
    const c = vm.createContext({ console, crypto: require('node:crypto').webcrypto });
    c.self = c;
    c.importScripts = (...files) => files.forEach(file => vm.runInContext(read(file.split('?')[0]), c));
    c.importScripts('battle-engine-worker.js');
    for (const dish of ['緊急料理', '創作料理']) {
        let result = await c.execute({ kind: 'init' });
        const snapshot = clone(result.snapshot);
        snapshot.turnNumber = 2;
        snapshot.players.player.hand = ['牛肉', '豚肉'].map((name, i) => ({ id: `ingredient-${i}`, name, type: 'ingredient' }));
        snapshot.players.player.events = [{ id: 'event', name: dish, type: 'event' }];
        const action = async (name, args = []) => {
            result = await c.execute({ kind: 'action', role: 'host', snapshot: result.snapshot, action: { name, args } });
        };
        result.snapshot = snapshot;
        await action('playerUseEvent', ['event']); await action('confirmEventCard');
        for (const option of result.snapshot.pendingEventContext.options.slice(0, dish === '創作料理' ? 2 : 1))
            await action('toggleEventTargetSelection', [option.id]);
        await action('confirmEventSelection');
        assert.deepEqual(clone(result.views.guest.effects).filter(effect => effect.name === 'playCookBgm'), [{ name: 'playCookBgm', args: [] }]);
        for (const mobile of [false, true]) {
            const r = runtime(mobile); installGuest(r.c);
            const row = { revision: 1, payload: clone(result.views.guest) };
            r.c.applyView(row); r.c.applyView(row);
            assert.equal(r.cooks().length, 0);
            r.tick(1199); assert.equal(r.cooks().length, 0);
            r.tick(1); assert.equal(r.cooks().length, 1);
            r.tick(3000); assert.equal(r.cooks().length, 1);
        }
    }
});

test('cook sound modules and lifecycle mirrors match and updated assets are loaded', () => {
    assert.equal(read('audio.js'), read('mobile/audio-sp.js').replaceAll('../assets/', 'assets/'));
    for (const name of ['player', 'cpu', 'main']) assert.equal(read(`${name}.js`), read(`mobile/${name}-sp.js`).replaceAll('../assets/', 'assets/').replace("window.location.href = '../index.html'", "window.location.href = 'index.html'"));
    for (const [html, suffix] of [['web.html', ''], ['mobile/mobile.html', '-sp']]) {
        assert.ok(read(html).includes(`audio${suffix}.js?v=20261007-osananajimi105a`));
        assert.ok(read(html).includes(`main${suffix}.js?v=20261007-osananajimi105a`));
        assert.ok(read(html).includes(`player${suffix}.js?v=20261002-ach1`));
        assert.ok(read(html).includes('network.js?v=20261007-osananajimi105a'));
    }
    assert.ok(read('network.js').includes('battle-engine-worker.js?v=20261003-rewards-bgm1'));
    assert.ok(read('battle-engine-worker.js').includes('player.js?v=20261002-ach1'));
});
