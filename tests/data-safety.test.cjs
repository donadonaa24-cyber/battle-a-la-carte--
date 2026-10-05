'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const PROFILE = 'battle-a-la-carte:user-profile:v1';
const MATCH = 'battle-a-la-carte:match-autosave:v1';
const ADV = 'battleAlaCarteStoryAdvV1';

function runtime(mobile = false) {
    let now = 5000, sequence = 0;
    const timers = new Map(), store = new Map(), writes = [], elements = new Map();
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {};
            this.dataset = {}; this.style = {}; this.inert = false; this.disabled = false;
        }
        set id(value) { this._id = value; elements.set(value, this); }
        get id() { return this._id; }
        setAttribute(key, value) { this.attributes[key] = value; }
        getAttribute(key) { return this.attributes[key]; }
        appendChild(node) { node.parent = this; this.children.push(node); return node; }
        append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
        remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        focus() { document.activeElement = this; }
        getBoundingClientRect() { return { left: 0, top: 0 }; }
        closest() { return this; }
    }
    const document = { activeElement: null, body: new Element(), listeners: {},
        createElement: tag => new Element(tag), getElementById: id => elements.get(id) || null,
        addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
        removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter(item => item !== callback); }
    };
    const stage = new Element(); stage.id = 'app-stage';
    stage.dataset = { stageWidth: mobile ? '432' : '1440', stageHeight: mobile ? '768' : '810' };
    const background = new Element(), alreadyInert = new Element(); alreadyInert.inert = true;
    stage.append(background, alreadyInert);
    const reset = new Element('button'); reset.id = 'user-reset-button'; reset.focus();
    const original = { userId: 'original-user', name: '保存済み', favoriteCharacterId: 'mai', favoriteSkillKey: 'foodTrap',
        coins: 123, unlockedBackgroundDesignKeys: ['default', 'bg-event-bakugai'], selectedBackgroundDesignKey: 'bg-event-bakugai',
        stats: { matches: 23, wins: 7, dishes: 55 }, recentDishes: [{ name: 'カレー', cookedAt: 123 }], updatedAt: 123 };
    store.set(PROFILE, JSON.stringify(original));
    for (const [key, value] of Object.entries({
        battleAlaCarteStoryProgressV1: { episode1: true, episode4: true },
        [ADV]: { version: 1, resume: { episodeId: 'episode4', sceneId: 'scene2', lineIndex: 4 }, auto: true },
        balc_achievements_v1: { unlocked: { firstDish: '2026-10-04' }, counters: { dishes: 55 }, selectedTitle: 'firstDish', selectedFrame: 'silver' },
        balc_missions_v1: { cleared: { noItems: '2026-10-04' }, selectedSleeve: 'noItems', selectedBoard: 'board-char-mai' },
        [MATCH]: { schemaVersion: 1, snapshot: { currentTurn: 'player', gameEnded: false } },
        'battle-a-la-carte:quick-confirm:v1': 'quick', 'battle-a-la-carte:bgm-track:v1': 'track2',
        'sb-account-auth-token': { access_token: 'offline-fixture' }
    })) store.set(key, JSON.stringify(value));
    const c = vm.createContext({ document, console: { ...console, warn() {} }, innerWidth: 1440, innerHeight: 810,
        Date: class extends Date { static now() { return now; } },
        getComputedStyle: () => ({ paddingTop: '0', paddingRight: '0', paddingBottom: '0', paddingLeft: '0' }),
        addEventListener() {}, setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
        localStorage: { getItem: key => store.get(key) ?? null, setItem(key, value) { writes.push(key); store.set(key, value); },
            removeItem(key) { writes.push(key); store.delete(key); } },
        GameState: { settings: { backgroundDesign: 'bg-event-bakugai', bgmTrack: 'track2', volume: .5 } },
        gameStartedOnce: false, selectedStartSkillKey: '', applyRuntimeSettings() {}, updateUI() {},
        renderUserStageProfile() {}, renderCoinStageProfile() {}, renderStartSkillSelection() {}, setCharacterChoice() {},
        getPreferredStartCharacterId: () => 'chizuru', getPreferredStartSkillKey: () => 'lastOrder',
        setUserStageMessage(text) { c.message = text; }
    });
    c.window = c;
    const load = file => vm.runInContext(read(file), c, { filename: file });
    load('stage-layout.js'); load('profile.js');
    c.userResetButton = reset;
    const main = read(mobile ? 'mobile/main-sp.js' : 'main.js');
    vm.runInContext(main.slice(main.indexOf('    if (userResetButton) {'), main.indexOf('    galleryFilterButtons.forEach')), c);
    const advance = ms => {
        now += ms;
        for (const [id, job] of [...timers]) if (job.at <= now) { timers.delete(id); job.fn(); }
    };
    const modal = () => {
        const overlay = stage.children.find(node => node.className?.includes('destructive-prompt-overlay'));
        assert.ok(overlay, 'confirmation opens');
        const panel = overlay.children[0], actions = panel.children.at(-1);
        return { overlay, panel, cancel: actions.children[0], accept: actions.children[1] };
    };
    const click = node => node.listeners.click?.({ target: node, stopPropagation() {} });
    const key = (key, shiftKey = false) => {
        const event = { key, shiftKey, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
        for (const handler of [...document.listeners.keydown || []]) { handler(event); if (event.stopped) break; }
        return event;
    };
    return { c, store, writes, original, reset, background, alreadyInert, document, timers, stage, load, main, advance, modal, click, key };
}

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    for (const how of ['cancel', 'Escape', 'outside']) test(`${label}: reset ${how} keeps every saved byte and runtime setting`, async () => {
        const h = runtime(mobile), before = [...h.store];
        const pending = h.click(h.reset), dialog = h.modal();
        assert.deepEqual([...h.store], before);
        assert.equal(h.writes.length, 0);
        assert.equal(h.document.activeElement, dialog.cancel);
        assert.equal(dialog.accept.disabled, true);
        assert.equal(h.background.inert, true);
        assert.equal(dialog.panel.children[0].textContent, 'ユーザー情報を初期化しますか？');
        assert.equal(dialog.overlay.attributes['aria-modal'], 'true');
        if (how === 'cancel') h.click(dialog.cancel);
        if (how === 'Escape') assert.equal(h.key('Escape').prevented, true);
        if (how === 'outside') h.click(dialog.overlay);
        await pending;
        h.advance(2000);
        assert.deepEqual([...h.store], before);
        assert.equal(h.writes.length, 0);
        assert.equal(h.c.GameState.settings.backgroundDesign, 'bg-event-bakugai');
        assert.equal(h.document.activeElement, h.reset);
        assert.equal(h.background.inert, false);
        assert.equal(h.alreadyInert.inert, true);
        assert.equal(h.timers.size, 0);
        assert.equal(h.stage.children.length, 2);
    });
    test(`${label}: only deliberate confirmation after one second resets the profile once`, async () => {
        const h = runtime(mobile), before = new Map(h.store);
        const pending = h.click(h.reset), dialog = h.modal();
        h.click(dialog.accept); // Even a synthetic click on a disabled button is rejected.
        h.advance(999); h.click(dialog.accept);
        assert.equal(h.writes.length, 0);
        dialog.accept.disabled = false; h.click(dialog.accept); // Time guard is independent of the DOM disabled flag.
        assert.equal(h.writes.length, 0);
        dialog.accept.disabled = true;
        await h.click(h.reset); // Repeated reset clicks must not queue another dialog/reset.
        assert.equal(h.stage.children.length, 3);
        h.advance(1); assert.equal(dialog.accept.disabled, false);
        assert.equal(h.document.activeElement, dialog.cancel);
        h.click(dialog.accept); h.click(dialog.accept); await pending;
        const result = h.c.getUserProfile();
        assert.equal(result.name, 'Player'); assert.equal(result.coins, 0);
        assert.equal(result.favoriteCharacterId, 'chizuru'); assert.equal(result.favoriteSkillKey, 'lastOrder');
        assert.equal(JSON.stringify(result.stats), JSON.stringify({ matches: 0, wins: 0, dishes: 0 }));
        assert.equal(result.recentDishes.length, 0);
        assert.equal(JSON.stringify(result.unlockedBackgroundDesignKeys), '["default"]');
        assert.equal(result.selectedBackgroundDesignKey, 'default'); assert.notEqual(result.userId, h.original.userId);
        assert.equal(h.c.GameState.settings.backgroundDesign, 'default');
        assert.equal(h.c.GameState.settings.bgmTrack, 'track2'); assert.equal(h.c.GameState.settings.volume, .5);
        assert.deepEqual(h.writes, [PROFILE]);
        for (const [key, value] of before) if (key !== PROFILE) assert.equal(h.store.get(key), value, key + ' preserved');
        assert.equal(h.c.message, 'ユーザー情報を初期化しました。');
    });
    test(`${label}: confirmation traps focus, inner click keeps it open, and reopening restarts delay`, async () => {
        const h = runtime(mobile);
        const first = h.click(h.reset), d = h.modal();
        assert.equal(h.key('Tab').prevented, true); assert.equal(h.document.activeElement, d.cancel);
        d.overlay.listeners.click({ target: d.panel, stopPropagation() {} });
        h.advance(1000); h.key('Tab'); assert.equal(h.document.activeElement, d.accept);
        h.key('Tab'); assert.equal(h.document.activeElement, d.cancel);
        h.key('Tab', true); assert.equal(h.document.activeElement, d.accept);
        h.key('Escape'); await first;
        const second = h.click(h.reset), reopened = h.modal();
        assert.equal(reopened.accept.disabled, true);
        h.click(reopened.accept); assert.equal(h.writes.length, 0);
        h.click(reopened.cancel); await second;
    });
    test(`${label}: missing confirmation service fails closed`, async () => {
        for (const service of [null, {}]) {
            const h = runtime(mobile); h.c.StageLayout = service;
            await h.click(h.reset); assert.equal(h.writes.length, 0);
        }
    });
}

test('PC/phone reset is named, secondary danger styled, in its own bottom row away from save', () => {
    for (const [html, css] of [['web.html', 'style.css'], ['mobile/mobile.html', 'mobile/style-sp.css']]) {
        const s = read(html), save = s.indexOf('id="user-save-button"'), reset = s.indexOf('id="user-reset-button"');
        assert.match(s, /<div class="profile-danger-actions">\s*<button type="button" id="user-reset-button" class="start-sub-button danger-secondary-button">記録を初期化<\/button>\s*<\/div>/);
        assert.ok(save < s.indexOf('id="start-user-back-button"') && s.indexOf('id="start-user-back-button"') < reset);
        assert.match(s.slice(save, reset), /<\/div>\s*<button id="start-user-back-button"/);
        assert.match(read(css), /\.profile-danger-actions\s*\{[^}]*margin-top: 18px;[^}]*padding-top: 16px;/);
        assert.match(read(css), /\.danger-confirm-button\s*\{[^}]*background: #b9323a;/);
        assert.match(read(css), /\.destructive-prompt-details\s*\{[^}]*overflow-y: auto;/);
    }
});

test('reset notice covers every profile field and separates device/account rewards and settings', async () => {
    const h = runtime(), pending = h.click(h.reset), d = h.modal();
    const text = node => [node.textContent || '', ...node.children.map(text)].join('\n');
    for (const phrase of ['ユーザー名', '推しキャラ・推しスキル', 'ローカルコイン', '対戦回数・勝利数・料理作成回数',
        '料理の履歴', '背景の所持記録', 'プロフィールID・更新日時', 'ストーリー', '実績・称号・枠', 'ミッション',
        'スリーブ・盤面背景', '保存した対戦', '音量・BGM', 'サーバー上', 'この操作は元に戻せません。']) assert.ok(text(d.panel).includes(phrase), phrase);
    h.click(d.cancel); await pending;
});

for (const mobile of [false, true]) {
    test(`${mobile ? 'phone' : 'PC'}: both background purchase entries wait for confirmation and preserve coins on cancel`, async () => {
        for (const settings of [false, true]) {
            const h = runtime(mobile), button = { getAttribute: name => name === 'data-bg-action' ? 'buy' : 'bg-event-gomi' };
            let handler;
            Object.assign(h.c, { getBackgroundDesignCatalogForUserStage: h.c.getBackgroundDesignCatalog,
                getBackgroundDesignNameForUserStage: design => design.label, setCoinStageMessage() {},
                settings: h.c.GameState.settings, addLog() {}, applyBackgroundDesign() {},
                getBackgroundDesignByKeySafe: key => h.c.getBackgroundDesignCatalog().find(item => item.key === key),
                getBackgroundDesignDisplayName: design => design.label });
            if (settings) {
                const file = read(mobile ? 'mobile/render-sp.js' : 'render.js');
                h.c.document.querySelectorAll = () => [{ ...button, addEventListener(name, fn) { handler = fn; } }];
                vm.runInContext(file.slice(file.indexOf("    document.querySelectorAll('.settings-bg-buy-button"), file.indexOf('    if (bgmEnabledSelect)')), h.c);
            } else {
                h.c.coinBackgroundShop = { addEventListener(name, fn) { handler = fn; } };
                vm.runInContext(h.main.slice(h.main.indexOf('    if (coinBackgroundShop) {'), h.main.indexOf('    if (userResetButton) {')), h.c);
            }
            const run = () => handler({ target: { closest: () => button } });
            const canceled = run(); assert.equal(h.c.getUserProfile().coins, 123);
            h.click(h.modal().cancel); await canceled; assert.equal(h.c.getUserProfile().coins, 123);
            const confirmed = run(), dialog = h.modal(); h.advance(1000); h.click(dialog.accept); await confirmed;
            assert.equal(h.c.getUserProfile().coins, 73);
            assert.equal(h.c.getUserProfile().selectedBackgroundDesignKey, 'bg-event-gomi');
            assert.deepEqual(h.writes, [PROFILE, PROFILE]); // purchase + existing select path
        }
    });
    test(`${mobile ? 'phone' : 'PC'}: new CPU/mission match does not overwrite a resume slot on cancel`, async () => {
        const h = runtime(mobile); let starts = 0, clears = 0;
        Object.assign(h.c, { turnCardRoleMap: { left: '先攻', right: '後攻' }, selectedTurnCard: null,
            MATCH_AUTOSAVE_KEY: MATCH, clearSavedMatch() { clears++; h.store.delete(MATCH); },
            revealTurnCards() {}, safeStartGame() { starts++; }, unlockAudio() {}, startBgmOnce() {}, beginMatchByRole() {} });
        vm.runInContext(h.main.slice(h.main.indexOf('async function onTurnCardSelected('), h.main.indexOf('// The online menu')), h.c);
        const original = h.store.get(MATCH), canceled = h.c.onTurnCardSelected('left');
        assert.equal(starts, 0); h.key('Escape'); await canceled;
        assert.equal(h.store.get(MATCH), original); assert.equal(clears, 0); assert.equal(h.c.selectedTurnCard, null);
        const confirmed = h.c.onTurnCardSelected('left'); h.advance(1000); h.click(h.modal().accept); await confirmed;
        assert.equal(clears, 1); assert.equal(starts, 1); assert.equal(h.c.selectedTurnCard, 'left');
    });
    test(`${mobile ? 'phone' : 'PC'}: dormant restart action clears and reloads only after acceptance`, async () => {
        const h = runtime(mobile); let handler, clears = 0, reloads = 0;
        Object.assign(h.c, { bindIfExists(id, fn) { handler = fn; }, clearSavedMatch() { clears++; },
            stopBGM() {}, location: { reload() { reloads++; } } });
        vm.runInContext(h.main.slice(h.main.indexOf("    bindIfExists('reset-game-button'"), h.main.indexOf('\n}\n\nfunction hardRepairGameState')), h.c);
        const canceled = handler(); h.click(h.modal().cancel); await canceled; assert.equal(clears, 0); assert.equal(reloads, 0);
        const confirmed = handler(); h.advance(1000); h.click(h.modal().accept); await confirmed; assert.equal(clears, 1); assert.equal(reloads, 1);
    });
    test(`${mobile ? 'phone' : 'PC'}: lobby back preserves active/remembered rooms until accepted and empty lobby needs no prompt`, async () => {
        for (const [active, remembered] of [[true, false], [false, true], [false, false]]) {
            const h = runtime(mobile), sessions = new Map(); let handler, leaves = 0, menus = 0;
            if (remembered) sessions.set('aniani:battle:room:v1', 'saved-room');
            Object.assign(h.c, { friendBackButton: { addEventListener(name, fn) { handler = fn; } },
                isFriendBattleActive: () => active, openMenuStage() { menus++; }, setFriendRoomMessage() {},
                sessionStorage: { getItem: key => sessions.get(key) || null },
                FriendBattle: { async leaveRoom() { leaves++; sessions.clear(); } } });
            vm.runInContext(h.main.slice(h.main.indexOf('    if (friendBackButton) {'), h.main.indexOf('    if (userBackButton) {')), h.c);
            const canceled = handler();
            if (!active && !remembered) { await canceled; assert.equal(leaves, 1); assert.equal(menus, 1); continue; }
            assert.equal(leaves, 0); h.key('Escape'); await canceled;
            assert.equal(leaves, 0); assert.equal(menus, 0);
            if (remembered) assert.equal(sessions.get('aniani:battle:room:v1'), 'saved-room');
            const accepted = handler(); h.advance(1000); h.click(h.modal().accept); await accepted;
            assert.equal(leaves, 1); assert.equal(menus, 1); assert.equal(sessions.size, 0);
        }
    });
    test(`${mobile ? 'phone' : 'PC'}: reading unsupported, completed or corrupt resume data never deletes it`, () => {
        const h = runtime(mobile);
        Object.assign(h.c, { MATCH_AUTOSAVE_KEY: MATCH, MATCH_AUTOSAVE_SCHEMA_VERSION: 1 });
        vm.runInContext(h.main.slice(h.main.indexOf('function readSavedMatch()'), h.main.indexOf('function updateResumeMatchButtonVisibility()')), h.c);
        for (const raw of ['{"schemaVersion":0,"snapshot":{}}', '{"schemaVersion":1,"snapshot":{"gameEnded":true}}', 'unreadable-json']) {
            h.store.set(MATCH, raw); assert.equal(h.c.readSavedMatch(), null); assert.equal(h.store.get(MATCH), raw);
            assert.equal(h.writes.length, 0);
        }
        const restoreFailure = h.main.slice(h.main.indexOf("console.error('failed to resume saved match'"), h.main.indexOf('    } finally {', h.main.indexOf("console.error('failed to resume saved match'")));
        assert.doesNotMatch(restoreFailure, /clearSavedMatch|removeItem/);
    });
    test(`${mobile ? 'phone' : 'PC'}: only the completed CPU match clears its own saved state`, () => {
        const h = runtime(mobile);
        Object.assign(h.c, { observeAchievementScores() {}, clearSavedMatch() { h.store.delete(MATCH); } });
        const start = h.main.indexOf('function endGame(winner)'), end = h.main.indexOf('    GameState.currentTurn = null;', start);
        vm.runInContext(h.main.slice(start, end) + '\n}', h.c);
        for (const [story, online, remains] of [[true, false, true], [false, true, true], [false, false, false]]) {
            h.store.set(MATCH, 'previous-save');
            h.c.GameState.gameEnded = false; h.c.GameState.storyEpisodeId = story ? 'episode4' : null;
            h.c.isFriendBattleActive = () => online;
            h.c.endGame('player'); assert.equal(h.store.has(MATCH), remains);
        }
    });
}

test('ADV start leaves resume and playback untouched until confirmed, and resuming/viewer need no destructive prompt', async () => {
    const s = read('story-adv.js'), gate = s.slice(s.indexOf('    function start(id,'), s.indexOf('        stop(); S.episode = episode; S.pending = null;', s.indexOf('    function start(id,')));
    for (const [resume, id, viewer, needsPrompt] of [[false, 'episode4', false, true], [true, 'episode5', false, true], [true, 'episode4', false, false], [false, 'episode4', true, false]]) {
        const h = runtime(); let starts = 0;
        const saved = { resume: { episodeId: 'episode4', sceneId: 'scene2', lineIndex: 9 } };
        h.c.root = h.c;
        Object.assign(h.c, { saved, viewer: () => viewer, BattleStoryData: { get: () => ({}) }, StoryViewer: { get: () => ({}) },
            startPlayback() { starts++; } });
        vm.runInContext(gate + ' startPlayback();\n}', h.c);
        const before = JSON.stringify(saved), pending = h.c.start(id, resume);
        if (!needsPrompt) { assert.equal(starts, 1); continue; }
        assert.equal(starts, 0); assert.equal(JSON.stringify(saved), before);
        h.key('Escape'); await pending; assert.equal(starts, 0); assert.equal(JSON.stringify(saved), before);
        const accepted = h.c.start(id, resume); h.advance(1000); h.click(h.modal().accept); await accepted; assert.equal(starts, 1);
    }
});

test('audit: surrender/room leave remain confirmed; rewards have no destructive entry; other matches preserve CPU resume', () => {
    for (const file of ['main.js', 'mobile/main-sp.js']) {
        const main = read(file);
        assert.match(main, /open-surrender-button[\s\S]*dialog\.show\(\)/);
        assert.match(main, /confirm-surrender-button[\s\S]*window\.playerSurrender\(\)/);
        assert.match(main, /const preserveSavedMatch = !!GameState\.storyEpisodeId \|\| isFriendBattleActive\(\)/);
        assert.match(main, /if \(!preserveSavedMatch\) clearSavedMatch\(\)/);
        assert.match(main, /observeMatch\(GameState\);\s*if \(!GameState\.storyEpisodeId && !isFriendBattleActive\(\)\) clearSavedMatch\(\)/);
        assert.match(main, /await StageLayout\.confirm\(MATCH_EXIT_CONFIRM_TEXT\)/);
    }
    assert.match(read('network.js'), /online-leave[\s\S]*await StageLayout\.confirm\('部屋から退出しますか？/);
    for (const key of ['aniani:battle:room:v1', 'aniani:battle:checkpoint:v2', 'aniani:battle:pending:v1']) {
        assert.ok(read('network.js').includes(key)); assert.ok(read('main.js').includes(key)); assert.ok(read('mobile/main-sp.js').includes(key));
    }
    for (const file of ['missions.js', 'achievements.js', 'story-mode.js', 'network.js']) assert.doesNotMatch(read(file), /localStorage\.(?:removeItem|clear)\(|signOut\(|logout\(/);
    assert.match(read('story-adv.js'), /function clearEpisode\(\)[\s\S]*if \(!viewer\(\)\) \{\s*saved\.resume = null; writeSave\(\);\s*root\.BattleStoryProgress\?\.complete/);
});
