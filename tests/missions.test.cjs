const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function runtime(mobile = false) {
    const storage = new Map();
    const styles = new Map();
    const logs = [];
    const banner = { textContent: '', hidden: true, classList: { toggle(_name, hidden) { banner.hidden = hidden; } } };
    const c = vm.createContext({ console, Date, Math, setTimeout, clearTimeout });
    c.window = c;
    c.addEventListener = () => {};
    c.location = { pathname: mobile ? '/mobile/mobile.html' : '/web.html' };
    c.document = {
        readyState: 'loading', addEventListener() {}, getElementById(id) { return id === 'mission-banner' ? banner : null; },
        documentElement: { style: { setProperty(key, value) { styles.set(key, value); } } }
    };
    c.localStorage = {
        getItem(key) { return storage.get(key) || null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    };
    c.addLog = text => logs.push(String(text));
    c.updateUI = () => {};
    c.setCPUStatus = () => {};
    c.recordDishCooked = () => {};
    c.FriendBattle = { isActive: () => false };
    for (const name of ['cards', 'state', 'rules', 'player']) {
        const file = mobile ? `mobile/${name}-sp.js` : `${name}.js`;
        vm.runInContext(read(file), c, { filename: file });
    }
    vm.runInContext(read('missions.js'), c, { filename: 'missions.js' });
    c.initGame();
    return { c, storage, styles, logs, banner };
}

function win(c, id) {
    c.GameState.activeMissionId = id;
    c.GameState.players.player.score = 10;
    assert.equal(c.checkWinner(), 'player');
    return c.Missions.complete(c.GameState, 'player');
}

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    test(`${label}: noItems tracks actual pack exchanges and player victory`, () => {
        const good = runtime(mobile).c;
        assert.match(win(good, 'noItems'), /ミッションクリア！/);
        assert.match(good.Missions.complete(good.GameState, 'player'), /獲得済み/);
        const bad = runtime(mobile).c;
        bad.GameState.players.player.score = 3;
        assert.equal(bad.buyPack(bad.GameState.players.player, 'board'), true);
        assert.equal(bad.GameState.players.player.packsExchangedCount, 1);
        assert.equal(win(bad, 'noItems'), 'ミッション未達成');
    });

    test(`${label}: both special victory types can clear a mission`, () => {
        const chef = runtime(mobile).c;
        chef.GameState.activeMissionId = 'noItems';
        chef.GameState.players.player.score = 7;
        chef.GameState.players.player.cookedMeatTypes = ['鶏肉', '豚肉', '牛肉', '魚'];
        assert.equal(chef.checkWinner(), 'player');
        assert.equal(chef.GameState.specialWinReason, '料理の達人');
        assert.match(chef.Missions.complete(chef.GameState, 'player'), /ミッションクリア！/);
        const master = runtime(mobile).c;
        master.GameState.activeMissionId = 'noSkill';
        master.GameState.players.player.startedTurnBehindThisTurn = true;
        master.GameState.players.player.recipesCookedThisTurn = 3;
        assert.equal(master.checkWinner(), 'player');
        assert.equal(master.GameState.specialWinReason, '満腹マスター');
        assert.match(master.Missions.complete(master.GameState, 'player'), /ミッションクリア！/);
    });

    test(`${label}: skill use and event use fail their missions, while board discard does not`, () => {
        const skill = runtime(mobile).c;
        assert.match(win(skill, 'noSkill'), /ミッションクリア！/);
        const used = runtime(mobile).c;
        used.setPlayerSelectedSkill(used.GameState.players.player, 'tasteThief');
        used.GameState.players.player.events = [{ id: 899, type: 'event', name: '爆買い' }];
        used.GameState.players.cpu.score = 1;
        assert.equal(used.activateSkillBySide('player', { costEventId: 899 }).ok, true);
        assert.equal(used.GameState.players.player.skillsUsedCount, 1);
        assert.equal(used.GameState.players.player.eventsUsedCount, 0, 'skill cost discard is not event use');
        assert.equal(win(used, 'noSkill'), 'ミッション未達成');

        const board = runtime(mobile).c;
        board.GameState.turnNumber = 2;
        board.GameState.players.cpu.score = 1;
        board.GameState.players.player.packs.push({ key: 'board' });
        board.GameState.players.player.events.push({ id: 900, type: 'event', name: '爆買い' });
        assert.equal(board.playerUseBoardCycle(900), true);
        assert.equal(board.GameState.players.player.eventsUsedCount, 0);
        assert.match(win(board, 'noEvent'), /ミッションクリア！/);

        const event = runtime(mobile).c;
        event.GameState.turnNumber = 2;
        event.GameState.players.player.events.push({ id: 901, type: 'event', name: '爆買い' });
        event.playerUseEvent(901);
        event.confirmEventCard();
        assert.equal(event.GameState.players.player.eventsUsedCount, 1);
        assert.equal(win(event, 'noEvent'), 'ミッション未達成');

        const emergency = runtime(mobile).c;
        emergency.GameState.turnNumber = 2;
        emergency.GameState.players.player.hand = [{ id: 902, type: 'ingredient', name: 'ごはん' }];
        emergency.GameState.players.player.events = [{ id: 903, type: 'event', name: '緊急料理' }];
        emergency.playerUseEvent(903);
        emergency.confirmEventCard();
        assert.equal(emergency.GameState.selectionMode, 'event-target');
        emergency.GameState.selectedTargetIds = [902];
        emergency.confirmEventSelection();
        assert.equal(emergency.GameState.players.player.eventsUsedCount, 1);
        assert.equal(emergency.GameState.players.player.cookedRecipes[0].name, '緊急料理');
        assert.equal(win(emergency, 'noEvent'), 'ミッション未達成');
    });

    for (const [id, recipeName] of [['bakudanOnigiri', '爆弾おにぎり'], ['manpukuCurry', '満腹カレー']]) {
        test(`${label}: ${id} requires the real recipe completion`, () => {
            const good = runtime(mobile).c;
            const recipe = Array.from(good.recipes).find(item => item.name === recipeName);
            good.GameState.players.player.hand = recipe.required.map((name, index) => ({ id: 1000 + index, type: 'ingredient', name }));
            assert.equal(good.applyRecipePlan(good.GameState.players.player, good.getRecipePlan(good.GameState.players.player, recipe)), true);
            assert.equal(good.checkWinner(), 'player');
            good.GameState.activeMissionId = id;
            assert.match(good.Missions.complete(good.GameState, 'player'), /ミッションクリア！/);
            assert.equal(win(runtime(mobile).c, id), 'ミッション未達成');
        });
    }

    test(`${label}: comeback records a five point deficit and requires victory`, () => {
        const good = runtime(mobile).c;
        good.GameState.players.cpu.score = 5;
        assert.equal(good.checkWinner(), null);
        assert.equal(good.GameState.players.player.maxDeficit, 5);
        assert.match(win(good, 'comeback'), /ミッションクリア！/);
        const bad = runtime(mobile).c;
        bad.GameState.players.cpu.score = 4;
        bad.checkWinner();
        assert.equal(win(bad, 'comeback'), 'ミッション未達成');
        const loss = runtime(mobile).c;
        loss.GameState.activeMissionId = 'noItems';
        loss.GameState.players.cpu.score = 10;
        assert.equal(loss.Missions.complete(loss.GameState, loss.checkWinner()), 'ミッション未達成');
    });

    test(`${label}: impossible mission displays one failure log and online play cannot clear it`, () => {
        const { c, logs, banner } = runtime(mobile);
        c.GameState.activeMissionId = 'noItems';
        c.Missions.refreshBanner(c.GameState);
        assert.match(banner.textContent, /加工アイテム交換なし/);
        c.GameState.players.player.score = 3;
        c.buyPack(c.GameState.players.player, 'board');
        c.Missions.refreshBanner(c.GameState);
        c.Missions.refreshBanner(c.GameState);
        assert.equal(banner.textContent, 'ミッション失敗（対戦は続きます）');
        assert.equal(logs.filter(line => line.includes('ミッション「素材で勝負」失敗')).length, 1);
        c.FriendBattle.isActive = () => true;
        assert.equal(c.Missions.complete(c.GameState, 'player'), '');
        c.Missions.refreshBanner(c.GameState);
        assert.equal(banner.hidden, true);
    });

    test(`${label}: story unlock, local sleeve path, and account union with missing RPC fallback`, async () => {
        const { c, storage, styles } = runtime(mobile);
        assert.equal(c.Missions.isUnlocked(), false);
        storage.set('battleAlaCarteStoryProgressV1', JSON.stringify({ episode1: true }));
        assert.equal(c.Missions.isUnlocked(), true);
        assert.equal(c.Missions.selectSleeve('noItems'), false);
        c.Missions.recordClear('noItems');
        assert.equal(c.Missions.selectSleeve('noItems'), true);
        assert.match(c.Missions.getCardBackPath(), /sleeve-no-items\.webp$/);
        assert.equal(c.Missions.getCardBackPath().startsWith(mobile ? '../assets/' : 'assets/'), true);
        assert.match(styles.get('--selected-card-back'), /sleeve-no-items\.webp/);
        const calls = [];
        const account = { async rpc(name, args) {
            calls.push([name, args]);
            if (name === 'balc_get_mission_clears') return { data: [{ mission_id: 'comeback', cleared_at: '2026-09-29T00:00:00Z' }], error: null };
            return { data: null, error: null };
        } };
        assert.equal(await c.Missions.syncAccount(account), true);
        assert.ok(c.Missions.readLocal().cleared.comeback);
        assert.ok(c.Missions.readLocal().cleared.noItems);
        assert.deepEqual(calls.map(call => call[0]), ['balc_get_mission_clears', 'balc_record_mission_clear']);
        assert.equal(calls[1][1].p_mission_id, 'noItems');
        assert.equal(c.Missions.readLocal().selectedSleeve, 'noItems');
        const missing = { async rpc() { return { data: null, error: { code: 'PGRST202' } }; } };
        assert.equal(await c.Missions.syncAccount(missing), false);
        assert.equal(c.Missions.readLocal().selectedSleeve, 'noItems');
    });

    test(`${label}: autosave restores mission and counters, old saves default safely`, () => {
        const { c, storage } = runtime(mobile);
        const file = mobile ? 'mobile/main-sp.js' : 'main.js';
        vm.runInContext(read(file), c, { filename: file });
        vm.runInContext('gameStartedOnce = true', c);
        c.GameState.activeMissionId = 'noSkill';
        c.GameState.players.player.skillsUsedCount = 1;
        c.GameState.players.player.maxDeficit = 6;
        c.saveMatchSnapshot('test');
        const saved = c.readSavedMatch();
        assert.ok(saved);
        c.initGame();
        c.applySavedMatchSnapshot(saved.snapshot);
        assert.equal(c.GameState.activeMissionId, 'noSkill');
        assert.equal(c.GameState.players.player.skillsUsedCount, 1);
        assert.equal(c.GameState.players.player.maxDeficit, 6);
        delete saved.snapshot.players.player.skillsUsedCount;
        delete saved.snapshot.activeMissionId;
        c.applySavedMatchSnapshot(saved.snapshot);
        assert.equal(c.GameState.players.player.skillsUsedCount, 0);
        assert.equal(c.GameState.activeMissionId, null);
        assert.ok(storage.has('battle-a-la-carte:match-autosave:v1'));
    });

    test(`${label}: mission setup respects the chosen opponent`, () => {
        const { c } = runtime(mobile);
        vm.runInContext(read(mobile ? 'mobile/main-sp.js' : 'main.js'), c);
        c.document.getElementById = id => id === 'start-mission-opponent' ? { value: 'akatsuki' } : null;
        c.GameState.activeMissionId = 'noItems';
        c.applyCharacterChoice();
        assert.equal(c.GameState.characterIds.cpu, 'akatsuki');
        c.GameState.activeMissionId = null;
        c.applyCharacterChoice();
        assert.notEqual(c.GameState.characterIds.cpu, c.GameState.characterIds.player);
    });
}

test('six light WebP sleeves are present and the original Web PNGs were removed', () => {
    const ids = ['no-items', 'bakudan-onigiri', 'manpuku-curry', 'no-skill', 'no-event', 'comeback'];
    for (const id of ids) {
        const base = path.join(root, 'assets/battle-images/sleeves', `sleeve-${id}`);
        assert.equal(fs.existsSync(`${base}.png`), false);
        const bytes = fs.readFileSync(`${base}.webp`);
        assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
        assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
        assert.ok(bytes.length < 150000);
    }
});

test('both pages load the mission UI and use selected sleeve for card backs', () => {
    for (const [htmlPath, cssPath] of [['web.html', 'style.css'], ['mobile/mobile.html', 'mobile/style-sp.css']]) {
        const html = read(htmlPath);
        const css = read(cssPath);
        for (const id of ['mission-list', 'mission-banner', 'sleeve-picker', 'result-retry-button', 'start-mission-opponent', 'settings-sleeve-picker']) {
            if (id === 'settings-sleeve-picker') assert.match(read(htmlPath.startsWith('mobile/') ? 'mobile/render-sp.js' : 'render.js'), new RegExp(id));
            else assert.match(html, new RegExp(`id="${id}"`));
        }
        assert.match(html, /missions\.js\?v=20260929-mission1/);
        assert.match(css, /\.card-back\s*\{[^}]*--selected-card-back/s);
        assert.match(css, /\.deck-pile\s*\{[^}]*--selected-card-back/s);
    }
});

test('mobile mission banner fits the second HUD row above the CPU field', () => {
    const html = read('mobile/mobile.html');
    const css = read('mobile/style-sp.css');
    assert.match(html, /<header class="top-hud">[\s\S]*?<\/div>\s*<div id="mission-banner" class="mission-banner hidden" role="status"><\/div>\s*<\/header>/);
    assert.match(css, /\.mission-banner\s*\{[^}]*top:\s*34px;[^}]*left:\s*136px;[^}]*right:\s*8px;[^}]*padding:\s*1px 6px;[^}]*font-size:\s*10px;[^}]*white-space:\s*nowrap;/);
    assert.match(css, /\.duel-field\s*\{\s*padding:\s*52px 8px 8px;/);
    for (const definition of runtime(true).c.Missions.definitions) {
        const { c, banner } = runtime(true);
        c.GameState.activeMissionId = definition.id;
        c.GameState.players.player.maxDeficit = 9999;
        c.Missions.refreshBanner(c.GameState);
        assert.ok(banner.textContent.length <= 27, `${definition.id}: ${banner.textContent}`);
        c.GameState.players.player.cookedRecipes = [{ name: '爆弾おにぎり' }, { name: '満腹カレー' }];
        c.Missions.refreshBanner(c.GameState);
        assert.ok(banner.textContent.length <= 27, `${definition.id} complete: ${banner.textContent}`);
    }
    assert.ok('ミッション失敗（対戦は続きます）'.length <= 27);
    assert.ok(27 * 10 + 12 <= 432 - 136 - 8, 'longest label fits the 288px HUD row');
    assert.ok(6 + 2 * 6 + 9 * 1.35 + 2 < 34, 'banner starts after the tabs');
    assert.ok(34 + 2 * 1 + 10 * 1.25 < 52, 'banner ends before the CPU field');
});

for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile' : 'PC'} result keeps the title separate from the mission reward`, () => {
        const html = read(mobile ? 'mobile/mobile.html' : 'web.html');
        assert.match(html, /id="result-text"[^>]*>勝利<\/div>\s*<div id="result-mission"/);
        for (const id of ['result-mission-image', 'result-mission-label', 'result-mission-detail']) {
            assert.match(html, new RegExp(`id="${id}"`));
        }
        const { c } = runtime(mobile);
        vm.runInContext(read(mobile ? 'mobile/main-sp.js' : 'main.js'), c);
        const classes = () => {
            const values = new Set();
            return { values, add(...names) { names.forEach(name => values.add(name)); },
                remove(...names) { names.forEach(name => values.delete(name)); },
                toggle(name, force) { if (force) values.add(name); else values.delete(name); } };
        };
        const elements = Object.fromEntries(['result-overlay', 'result-text', 'result-mission',
            'result-mission-image', 'result-mission-label', 'result-mission-detail',
            'result-retry-button', 'final-field-actions'].map(id => [id, { classList: classes(), textContent: '' }]));
        c.document.getElementById = id => elements[id] || null;
        c.document.querySelector = () => ({ classList: classes() });
        c.renderMatchResultSummary = () => {};
        c.playResultBGM = () => {};
        c.GameState.activeMissionId = 'noSkill';
        c.GameState.missionResultText = 'ミッションクリア！『料理人の帽子スリーブ』を獲得しました';
        vm.runInContext("showResultOverlay('勝利！', 'win')", c);
        assert.equal(elements['result-text'].textContent, '勝利！');
        assert.equal(elements['result-mission-label'].textContent, 'ミッションクリア！');
        assert.match(elements['result-mission-detail'].textContent, /料理人の帽子スリーブ.*獲得しました/);
        assert.match(elements['result-mission-image'].src, /sleeve-no-skill\.webp$/);
        assert.equal(elements['result-mission'].classList.values.has('hidden'), false);
        c.GameState.missionResultText = 'ミッションクリア（獲得済み）';
        vm.runInContext("showResultOverlay('勝利！', 'win')", c);
        assert.equal(elements['result-mission-detail'].textContent, '（獲得済み）');
        c.GameState.missionResultText = 'ミッション未達成';
        vm.runInContext("showResultOverlay('敗北', 'lose')", c);
        assert.equal(elements['result-text'].textContent, '敗北…');
        assert.equal(elements['result-mission-label'].textContent, 'ミッション未達成');
        assert.equal(elements['result-mission-image'].hidden, true);
        c.GameState.missionResultText = '';
        c.GameState.activeMissionId = null;
        vm.runInContext("showResultOverlay('勝利！', 'win')", c);
        assert.equal(elements['result-mission'].classList.values.has('hidden'), true);
    });
}
