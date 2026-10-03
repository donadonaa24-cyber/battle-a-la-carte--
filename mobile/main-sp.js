let bgmStarted = false;
let resultOverlayTimer = null;
let matchFinaleTimer = null;
let matchFinaleSequence = 0;
let spotlightTimer = null;
let spotlightHideAt = 0;
let gameStartedOnce = false;

let selectedStartCharacter = 'chizuru';
let selectedTurnCard = null;
let turnCardRoleMap = null;
let selectedStartSkillKey = 'lastOrder';
let selectedCpuPersonality = 'default';
let startTitleTimer = null;
let startMenuFloatTimer = null;
let selectedGalleryType = 'characters';
let startCpuSetupStep = 1;
let pendingMissionId = null;
let storyPreviousCpuPersonality = null;
let choosingMissionOpponent = false;
let startOverlayAudioUnlockBound = false;
const START_MENU_CARD_VISIBLE_MS = 5000;
const START_MENU_CARD_FADE_MS = 600;
const START_MENU_CARD_CYCLE_MS = START_MENU_CARD_VISIBLE_MS + (START_MENU_CARD_FADE_MS * 2);
const SPOTLIGHT_DISPLAY_MS = 2000;
const BATTLE_MODE_TEXT_STEP1_MS = 1000;
const BATTLE_MODE_TEXT_STEP2_MS = 2000;
const BATTLE_MODE_CUTIN_IMAGE_MS = 3000;
const SKILL_CUTIN_IMAGE_PATHS = {
    chizuru: '../assets/images/skill-cutins/chizuru-skill-cutin.png',
    mai: '../assets/images/skill-cutins/mai-skill-cutin.png',
    takumi: '../assets/images/skill-cutins/takumi-skill-cutin.png',
    kanna: '../assets/images/skill-cutins/kanna-skill-cutin.png',
    akatsuki: '../assets/images/skill-cutins/akatsuki-skill-cutin.png'
};

const BATTLE_MODE_CUTIN_IMAGE_PATHS = {
    chizuru: '../assets/images/battle-mode-cutins/chizuru-battle-mode-cutin.png',
    mai: '../assets/images/battle-mode-cutins/mai-battle-mode-cutin.png',
    takumi: '../assets/images/battle-mode-cutins/takumi-battle-mode-cutin.png',
    kanna: '../assets/images/battle-mode-cutins/kanna-battle-mode-cutin.png',
    akatsuki: '../assets/images/battle-mode-cutins/akatsuki-battle-mode-cutin.png'
};
const STARTUP_IMAGE_CACHE_NOTICE = '\u521d\u56de\u8d77\u52d5\u6642\u306f\u753b\u50cf\u306e\u8aad\u307f\u8fbc\u307f\u306b\u6642\u9593\u304c\u304b\u304b\u308a\u3001\u8868\u793a\u304c\u9045\u308c\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002\u5c11\u3057\u5f85\u3064\u3068\u30ad\u30e3\u30c3\u30b7\u30e5\u304c\u52b9\u3044\u3066\u8868\u793a\u3055\u308c\u308b\u3088\u3046\u306b\u306a\u308a\u307e\u3059\u3002';

const START_CHARACTER_OPTIONS = [
    { id: 'chizuru', name: '千鶴' },
    { id: 'mai', name: '舞依' },
    { id: 'takumi', name: '拓海' },
    { id: 'akatsuki', name: '暁' }
];

const START_GALLERY_CHARACTER_OPTIONS = [
    { id: 'chizuru', name: '千鶴', className: 'char-chizuru' },
    { id: 'mai', name: '舞依', className: 'char-mai' },
    { id: 'takumi', name: '拓海', className: 'char-takumi' },
    { id: 'akatsuki', name: '暁', className: 'char-akatsuki' }
];

const START_STAGE_IDS = [
    'start-title-stage',
    'start-menu-stage',
    'start-settings-stage',
    'start-cpu-setup-stage',
    'start-story-stage',
    'start-rules-stage',
    'start-gallery-stage',
    'start-friend-stage',
    'start-coin-stage',
    'start-user-stage',
    'start-achievements-stage'
];
let matchExitGuardBound = false;
let matchExitBackArmedUntil = 0;
let matchExitBypassOnce = false;
let matchExitPromptOpen = false;
const MATCH_EXIT_DOUBLE_BACK_WINDOW_MS = 6000;
const MATCH_EXIT_CONFIRM_TEXT = '対戦を途中で放棄しますか？';
const MATCH_EXIT_SECOND_BACK_TEXT = 'もう一度「戻る」を押すと対戦を終了して前のページへ移動します。';
const MATCH_AUTOSAVE_KEY = 'battle-a-la-carte:match-autosave:v1';
const MATCH_AUTOSAVE_SCHEMA_VERSION = 1;
let matchAutosaveHookBound = false;
let matchAutosaveRestoring = false;

function isMatchInBattleScreen() {
    const overlay = document.getElementById('start-overlay');
    return !overlay || overlay.classList.contains('hidden');
}

function isFriendBattleActive() {
    return !!(window.FriendBattle && typeof window.FriendBattle.isActive === 'function' && window.FriendBattle.isActive());
}

function shouldGuardMatchExit() {
    return !!(gameStartedOnce && GameState && !GameState.gameEnded && isMatchInBattleScreen());
}

function shouldAutosaveCurrentMatch() {
    if (GameState?.storyEpisodeId) return false;
    return !!(gameStartedOnce && GameState && !GameState.gameEnded && isMatchInBattleScreen() && !isFriendBattleActive());
}

function cloneForAutosave(value) {
    return JSON.parse(JSON.stringify(value));
}

function readSavedMatch() {
    try {
        const raw = localStorage.getItem(MATCH_AUTOSAVE_KEY);
        if (!raw) return null;

        const payload = JSON.parse(raw);
        if (!payload || payload.schemaVersion !== MATCH_AUTOSAVE_SCHEMA_VERSION || !payload.snapshot) {
            localStorage.removeItem(MATCH_AUTOSAVE_KEY);
            return null;
        }
        if (payload.snapshot.gameEnded) {
            localStorage.removeItem(MATCH_AUTOSAVE_KEY);
            return null;
        }
        return payload;
    } catch (e) {
        console.warn('failed to read match autosave', e);
        return null;
    }
}

function updateResumeMatchButtonVisibility() {
    const button = document.getElementById('menu-resume-button');
    if (!button) return;
    const saved = readSavedMatch();
    button.classList.toggle('hidden', !saved);
}

function clearSavedMatch() {
    try {
        localStorage.removeItem(MATCH_AUTOSAVE_KEY);
    } catch (e) {
        console.warn('failed to clear match autosave', e);
    }
    updateResumeMatchButtonVisibility();
}

function saveMatchSnapshot(reason) {
    if (matchAutosaveRestoring) return;
    if (!shouldAutosaveCurrentMatch()) return;

    try {
        const payload = {
            schemaVersion: MATCH_AUTOSAVE_SCHEMA_VERSION,
            savedAt: Date.now(),
            reason: reason || 'update',
            snapshot: cloneForAutosave(GameState)
        };
        localStorage.setItem(MATCH_AUTOSAVE_KEY, JSON.stringify(payload));
        updateResumeMatchButtonVisibility();
    } catch (e) {
        console.warn('failed to save match autosave', e);
    }
}

function normalizeSavedPlayerState(input, fallback) {
    const base = fallback && typeof fallback === 'object' ? cloneForAutosave(fallback) : {};
    const source = input && typeof input === 'object' ? input : {};
    const merged = { ...base, ...source };
    ['hand', 'set', 'events', 'packs', 'cookedRecipes', 'cookedMeatTypes'].forEach(key => {
        merged[key] = Array.isArray(merged[key]) ? merged[key] : [];
    });
    if (!merged.skillUseCounts || typeof merged.skillUseCounts !== 'object' || Array.isArray(merged.skillUseCounts)) {
        merged.skillUseCounts = {};
    }
    merged.boardCycleUsed = Number.isSafeInteger(source.boardCycleUsed)
        ? Math.max(0, source.boardCycleUsed) : 0;
    merged.achievementTracking = source.achievementTracking && typeof source.achievementTracking === 'object'
        ? cloneForAutosave(source.achievementTracking) : null;
    for (const key of ['packsExchangedCount', 'skillsUsedCount', 'eventsUsedCount', 'maxDeficit']) {
        merged[key] = Number.isSafeInteger(source[key]) ? Math.max(0, source[key]) : 0;
    }
    return merged;
}

function applySavedMatchSnapshot(snapshot) {
    const source = cloneForAutosave(snapshot || {});
    const nextPlayers = source.players || {};
    GameState.deck = Array.isArray(source.deck) ? source.deck : [];
    GameState.discard = Array.isArray(source.discard) ? source.discard : [];
    GameState.players = {
        player: normalizeSavedPlayerState(nextPlayers.player, GameState.players?.player),
        cpu: normalizeSavedPlayerState(nextPlayers.cpu, GameState.players?.cpu)
    };
    GameState.currentTurn = source.currentTurn || 'player';
    GameState.turnNumber = Number.isSafeInteger(source.turnNumber) ? source.turnNumber : 2;
    GameState.currentPhase = source.currentPhase || 'メインフェイズ';
    GameState.selectionMode = source.selectionMode || null;
    GameState.discardNeedCount = Number(source.discardNeedCount || 0);
    GameState.selectedCardIds = Array.isArray(source.selectedCardIds) ? source.selectedCardIds : [];
    GameState.candidateRecipes = Array.isArray(source.candidateRecipes) ? source.candidateRecipes : [];
    GameState.gameEnded = false;
    GameState.matchStartedAt = Number.isFinite(Number(source.matchStartedAt))
        ? Number(source.matchStartedAt) : Date.now();
    GameState.matchEndedAt = null;
    GameState.achievementMatchId = source.achievementMatchId || `legacy-${source.matchStartedAt || 0}`;
    GameState.achievementStory = source.achievementStory === true;
    GameState.lastCookedRecipe = source.lastCookedRecipe && typeof source.lastCookedRecipe === 'object'
        ? source.lastCookedRecipe : null;
    GameState.winner = null;
    GameState.pendingEventContext = source.pendingEventContext || null;
    GameState.pendingSkillContext = source.pendingSkillContext || null;
    GameState.pendingSkillConfirm = source.pendingSkillConfirm || null;
    GameState.selectedTargetIds = Array.isArray(source.selectedTargetIds) ? source.selectedTargetIds : [];
    GameState.pendingSetCardId = source.pendingSetCardId || null;
    GameState.pendingEventCardId = source.pendingEventCardId || null;
    GameState.pendingViewSetCardId = source.pendingViewSetCardId || null;
    GameState.pendingPackKey = source.pendingPackKey || null;
    GameState.pendingIngredientAction = source.pendingIngredientAction || null;
    GameState.pendingKnifeOptions = Array.isArray(source.pendingKnifeOptions) ? source.pendingKnifeOptions : [];
    GameState.openDishHistoryFor = source.openDishHistoryFor || null;
    GameState.specialWinReason = source.specialWinReason || null;
    GameState.activeMissionId = window.Missions?.getDefinition(source.activeMissionId) ? source.activeMissionId : null;
    GameState.missionFailedLogged = source.missionFailedLogged === true;
    GameState.missionResultText = '';
    GameState.characterSides = source.characterSides || { player: 'player', cpu: 'cpu' };
    GameState.characterIds = source.characterIds || { player: 'chizuru', cpu: 'mai' };
    GameState.characterNames = source.characterNames || { player: '千鶴', cpu: '舞依' };
    GameState.settings = { ...(GameState.settings || {}), ...(source.settings || {}) };
    GameState.ui = source.ui || {
        pileViewType: null,
        infoOverlayType: null
    };

    if (typeof ensureDeckExists === 'function') ensureDeckExists();
    if (typeof ensurePlayerSkillState === 'function') {
        ensurePlayerSkillState(GameState.players.player);
        ensurePlayerSkillState(GameState.players.cpu);
    }
}

function resumeSavedMatch() {
    const saved = readSavedMatch();
    if (!saved) {
        setStartMenuMessage('保存された対戦はありません。');
        updateResumeMatchButtonVisibility();
        return;
    }

    matchAutosaveRestoring = true;
    try {
        safeStartGame();
        applySavedMatchSnapshot(saved.snapshot);
        if (typeof applyRuntimeSettings === 'function') applyRuntimeSettings();
        if (typeof startBgmOnce === 'function') startBgmOnce();
        stopMenuFloatingBackground();
        if (startTitleTimer) {
            clearTimeout(startTitleTimer);
            startTitleTimer = null;
        }

        const overlay = document.getElementById('start-overlay');
        if (overlay) overlay.classList.add('hidden');
        matchExitBackArmedUntil = 0;
        pushMatchExitGuardHistory();

        if (GameState.currentTurn === 'player') {
            enablePlayerControls();
        } else {
            disablePlayerControls();
        }
        updateUI(true);
        addLog('保存した対戦を再開しました。');
    } catch (e) {
        console.error('failed to resume saved match', e);
        setStartMenuMessage('保存された対戦の再開に失敗しました。新しく対戦を開始してください。');
        clearSavedMatch();
        return;
    } finally {
        matchAutosaveRestoring = false;
    }

    saveMatchSnapshot('resume');
    if (GameState.currentTurn === 'cpu' && !GameState.gameEnded && typeof cpuTurn === 'function' && !isFriendBattleActive()) {
        setTimeout(() => {
            if (!GameState.gameEnded && GameState.currentTurn === 'cpu') cpuTurn();
        }, 700);
    }
}

function setupMatchAutosaveOnce() {
    if (matchAutosaveHookBound) return;
    matchAutosaveHookBound = true;

    const previousUpdateHook = window.__onGameStateUpdated || null;
    window.__onGameStateUpdated = function matchAutosaveUpdateHook() {
        if (typeof previousUpdateHook === 'function') previousUpdateHook();
        window.Missions?.refreshBanner(GameState);
        saveMatchSnapshot('state-update');
    };

    window.addEventListener('pagehide', () => saveMatchSnapshot('pagehide'));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveMatchSnapshot('visibility-hidden');
    });
}

function pushMatchExitGuardHistory() {
    try {
        history.pushState({ __matchExitGuard: true }, '', window.location.href);
    } catch (e) {
        console.warn('failed to push match exit guard history', e);
    }
}

function setupMatchExitGuardOnce() {
    if (matchExitGuardBound) return;
    matchExitGuardBound = true;

    window.addEventListener('beforeunload', (event) => {
        if (!shouldGuardMatchExit() || matchExitBypassOnce) return;
        saveMatchSnapshot('beforeunload');
        event.preventDefault();
        event.returnValue = '';
    });

    window.addEventListener('popstate', async () => {
        if (matchExitBypassOnce) {
            matchExitBypassOnce = false;
            return;
        }

        if (!shouldGuardMatchExit()) {
            matchExitBackArmedUntil = 0;
            return;
        }

        if (matchExitPromptOpen) {
            pushMatchExitGuardHistory();
            return;
        }

        const now = Date.now();
        if (matchExitBackArmedUntil > now) {
            matchExitBackArmedUntil = 0;
            saveMatchSnapshot('confirmed-back');
            matchExitBypassOnce = true;
            history.back();
            return;
        }

        pushMatchExitGuardHistory();
        matchExitPromptOpen = true;
        const confirmed = await StageLayout.confirm(MATCH_EXIT_CONFIRM_TEXT);
        if (confirmed) {
            matchExitBackArmedUntil = Date.now() + MATCH_EXIT_DOUBLE_BACK_WINDOW_MS;
            await StageLayout.alert(MATCH_EXIT_SECOND_BACK_TEXT);
        } else {
            matchExitBackArmedUntil = 0;
        }
        matchExitPromptOpen = false;
    });
}

function getStartCharacterOptionById(id) {
    return START_CHARACTER_OPTIONS.find(option => option.id === id) || null;
}

function getPreferredStartCharacterId() {
    if (typeof getUserProfile !== 'function') return 'chizuru';
    const profile = getUserProfile();
    return getStartCharacterOptionById(profile.favoriteCharacterId)
        ? profile.favoriteCharacterId
        : 'chizuru';
}

function getPreferredStartSkillKey() {
    const defs = getSkillDefinitionsSafe();
    const fallback = defs[0]?.key || 'lastOrder';
    if (typeof getUserProfile !== 'function') return fallback;
    const profile = getUserProfile();
    const preferred = String(profile?.favoriteSkillKey || '').trim();
    return defs.some(skill => skill.key === preferred) ? preferred : fallback;
}

function getSkillDefinitionsSafe() {
    const defs = typeof getSkillDefinitions === 'function' ? getSkillDefinitions() : [];
    if (Array.isArray(defs) && defs.length > 0) return defs;
    return [{
        key: 'lastOrder',
        name: 'ラストオーダー',
        recommendStars: 1,
        recommendTag: '上級者向け',
        condition: '相手が8点以上で自分より高得点',
        effect: 'イベントを1枚捨て、このターンにイベントを追加で1回使用可能',
        maxUses: 1
    }];
}

function getSkillDefinitionByKeySafe(skillKey) {
    if (typeof getSkillDefinitionByKey === 'function') {
        return getSkillDefinitionByKey(skillKey);
    }
    return getSkillDefinitionsSafe().find(item => item.key === skillKey) || null;
}

function getCpuPersonalityOptionsSafe() {
    const options = typeof getCpuPersonalityOptions === 'function' ? getCpuPersonalityOptions() : [];
    if (Array.isArray(options) && options.length > 0) return options;
    return [{ key: 'default', label: '標準' }];
}

function normalizeStartCpuPersonality(value) {
    if (typeof normalizeCpuPersonalityKey === 'function') {
        return normalizeCpuPersonalityKey(value);
    }
    const safe = String(value || 'default');
    return getCpuPersonalityOptionsSafe().some(item => item.key === safe) ? safe : 'default';
}

function pickCpuSkillByPersonality(personalityKey) {
    const defs = getSkillDefinitionsSafe();
    const allSkillKeys = defs.map(item => item.key);
    if (allSkillKeys.length === 0) return null;

    const priority = typeof getCpuPersonalitySkillPriority === 'function'
        ? getCpuPersonalitySkillPriority(personalityKey)
        : allSkillKeys;
    const validPriority = (Array.isArray(priority) ? priority : [])
        .filter(key => allSkillKeys.includes(key));

    if (validPriority.length === 0) {
        return allSkillKeys[Math.floor(Math.random() * allSkillKeys.length)];
    }

    const topPool = validPriority.slice(0, Math.min(2, validPriority.length));
    return topPool[Math.floor(Math.random() * topPool.length)] || validPriority[0];
}

function applyBattleSkillSetup() {
    const player = GameState.players.player;
    const cpu = GameState.players.cpu;
    if (!player || !cpu) return;

    const personality = normalizeStartCpuPersonality(selectedCpuPersonality);
    if (GameState.settings) {
        GameState.settings.cpuPersonality = personality;
    }

    const playerSkill = getSkillDefinitionByKeySafe(selectedStartSkillKey) || getSkillDefinitionsSafe()[0] || null;
    const cpuSkillKey = pickCpuSkillByPersonality(personality);
    const cpuSkill = getSkillDefinitionByKeySafe(cpuSkillKey);

    if (typeof setPlayerSelectedSkill === 'function') {
        setPlayerSelectedSkill(player, playerSkill?.key || null);
        setPlayerSelectedSkill(cpu, cpuSkill?.key || null);
    } else {
        player.selectedSkillKey = playerSkill?.key || null;
        player.skillUseCounts = {};
        player.extraEventUsesRemainingThisTurn = 0;
        cpu.selectedSkillKey = cpuSkill?.key || null;
        cpu.skillUseCounts = {};
        cpu.extraEventUsesRemainingThisTurn = 0;
    }

    addLog(`スキル選択: あなた「${playerSkill?.name || 'なし'}」 / 相手「？？？」`);
}

function getOpponentLabelText() {
    if (GameState?.storyEpisodeId) return GameState.characterNames?.cpu || 'CPU';
    const isFriendMode = !!(window.FriendBattle && typeof window.FriendBattle.isActive === 'function' && window.FriendBattle.isActive());
    return isFriendMode ? 'フレンド' : 'CPU';
}

function setFriendRoomMessage(text) {
    const messageEl = document.getElementById('friend-room-message');
    if (!messageEl) return;
    messageEl.textContent = text || '';
}

function getFriendSetupHintMessage() {
    return 'あにあに共通アカウントでログインし、部屋を作成または参加してください。';
}

function setUserStageMessage(text) {
    const messageEl = document.getElementById('user-stage-message');
    if (!messageEl) return;
    messageEl.textContent = text || '';
}

function setCoinStageMessage(text) {
    const messageEl = document.getElementById('coin-stage-message');
    if (!messageEl) return;
    messageEl.textContent = text || '';
}

function renderStartMenuPlayerCard() {
    if (!document.getElementById('start-menu-player-card')) return;
    const profile = typeof getUserProfile === 'function' ? getUserProfile() : {};
    const achievements = window.Achievements;
    const cosmetics = achievements?.selectedCosmetics();
    const title = achievements?.getDefinition(cosmetics?.title)?.title || '';
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setText('menu-player-title', title ? `「${title}」` : '');
    document.getElementById('menu-player-title')?.classList.toggle('hidden', !title);
    setText('menu-player-name', profile.name || 'プレイヤー');
    setText('menu-player-status', window.FriendBattle?.isAccountSignedIn?.()
        ? 'あにあにアカウント：ログイン中' : 'ゲスト');
    setText('menu-player-wins', String(profile.stats?.wins || 0));
    setText('menu-player-matches', String(profile.stats?.matches || 0));
    const data = achievements?.readLocal();
    const definitions = achievements?.definitions || [];
    setText('menu-player-achievement-count', `${definitions.filter(def => data?.unlocked?.[def.id]).length}/${definitions.length || 30}`);
    const icon = document.getElementById('menu-player-icon');
    const character = getStartCharacterOptionById(profile.favoriteCharacterId) || START_CHARACTER_OPTIONS[0];
    if (icon) {
        for (const option of START_CHARACTER_OPTIONS) icon.classList.toggle(`char-${option.id}`, option.id === character.id);
        icon.setAttribute('aria-label', character.name);
        achievements?.applyFrame(icon, cosmetics);
    }
}

function renderUserStageProfile() {
    if (typeof getUserProfile !== 'function') return;
    const profile = getUserProfile();

    const nameInput = document.getElementById('user-name-input');
    const favoriteCharacterSelect = document.getElementById('user-favorite-character');
    const favoriteSkillSelect = document.getElementById('user-favorite-skill');
    const matchesEl = document.getElementById('user-matches-value');
    const winsEl = document.getElementById('user-wins-value');
    const dishesEl = document.getElementById('user-dishes-value');

    if (nameInput) nameInput.value = profile.name || 'プレイヤー';
    if (favoriteCharacterSelect) favoriteCharacterSelect.value = profile.favoriteCharacterId || 'chizuru';
    if (favoriteSkillSelect) {
        const defs = getSkillDefinitionsSafe();
        favoriteSkillSelect.innerHTML = defs
            .map(skill => `<option value="${escapeHtmlText(skill.key)}">${escapeHtmlText(skill.name)}  ${escapeHtmlText(skillRecommendationText(skill))}</option>`)
            .join('');
        favoriteSkillSelect.value = defs.some(skill => skill.key === profile.favoriteSkillKey)
            ? profile.favoriteSkillKey
            : (defs[0]?.key || 'lastOrder');
        const recommendation = document.getElementById('user-favorite-skill-recommendation');
        const showRecommendation = () => {
            const selected = defs.find(skill => skill.key === favoriteSkillSelect.value);
            if (recommendation) recommendation.textContent = selected ? skillRecommendationText(selected) : '';
        };
        favoriteSkillSelect.onchange = showRecommendation;
        showRecommendation();
    }
    if (matchesEl) matchesEl.textContent = String(profile.stats?.matches || 0);
    if (winsEl) winsEl.textContent = String(profile.stats?.wins || 0);
    if (dishesEl) dishesEl.textContent = String(profile.stats?.dishes || 0);
    renderUserRecentDishes(profile);
    window.Achievements?.renderPicker();
}

function renderUserRecentDishes(profile) {
    const listEl = document.getElementById('user-recent-dishes');
    if (!listEl) return;

    const history = Array.isArray(profile?.recentDishes) ? profile.recentDishes : [];
    if (history.length === 0) {
        listEl.innerHTML = '<div class="start-user-recent-empty">まだ料理履歴がありません。</div>';
        return;
    }

    const counter = new Map();
    history.forEach(item => {
        const key = String(item?.name || '').trim();
        if (!key) return;
        counter.set(key, (counter.get(key) || 0) + 1);
    });

    const top = Array.from(counter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    listEl.innerHTML = top.map(([name, count]) => `
        <div class="start-user-recent-item">
            <span>${escapeHtmlText(name)}</span>
            <strong>x${count}</strong>
        </div>
    `).join('');
}

function renderCoinStageProfile() {
    if (typeof getUserProfile !== 'function') return;
    const profile = getUserProfile();
    const coinsEl = document.getElementById('coin-coins-value');
    const rulesEl = document.getElementById('coin-rules-value');
    const rules = typeof getUserCoinRules === 'function'
        ? getUserCoinRules()
        : { perMatch: 2, perWin: 4, perDishCook: 1 };

    if (coinsEl) coinsEl.textContent = String(profile.coins || 0);
    if (rulesEl) rulesEl.textContent = `対戦+${rules.perMatch} / 勝利+${rules.perWin} / 料理+${rules.perDishCook}`;
    renderCoinStageBackgroundShop(profile);
}

function getBackgroundDesignCatalogForUserStage() {
    const fallback = [{
        key: 'default',
        label: 'デフォルト',
        description: '通常の背景',
        eventName: null,
        cost: 0,
        unlockedByDefault: true
    }];
    if (typeof getBackgroundDesignCatalog !== 'function') return fallback;

    const raw = getBackgroundDesignCatalog();
    if (!Array.isArray(raw) || raw.length === 0) return fallback;

    const catalog = raw
        .filter(item => item && typeof item === 'object' && typeof item.key === 'string')
        .map(item => ({
            key: item.key,
            label: String(item.label || item.eventName || item.key),
            description: String(item.description || ''),
            eventName: item.eventName ? String(item.eventName) : null,
            cost: Number.isFinite(Number(item.cost)) ? Math.max(0, Math.floor(Number(item.cost))) : 0,
            unlockedByDefault: item.unlockedByDefault === true || item.key === 'default'
        }));

    if (catalog.length === 0) return fallback;
    if (!catalog.some(item => item.key === 'default')) catalog.unshift(fallback[0]);
    return catalog;
}

function getUnlockedBackgroundDesignSetForUserStage(profile, catalog) {
    const list = Array.isArray(catalog) ? catalog : getBackgroundDesignCatalogForUserStage();
    const unlockedSet = new Set();

    list.forEach(item => {
        if (item.unlockedByDefault || item.key === 'default') unlockedSet.add(item.key);
    });

    if (profile && Array.isArray(profile.unlockedBackgroundDesignKeys)) {
        profile.unlockedBackgroundDesignKeys.forEach(key => {
            if (list.some(item => item.key === key)) unlockedSet.add(key);
        });
    }
    if (!unlockedSet.has('default')) unlockedSet.add('default');
    return unlockedSet;
}

function getBackgroundDesignNameForUserStage(design) {
    if (!design || typeof design !== 'object') return '背景デザイン';
    return String(design.label || design.eventName || design.key || '背景デザイン');
}

function renderCoinStageBackgroundShop(profile) {
    const shop = document.getElementById('coin-background-shop');
    if (!shop) return;

    const currentProfile = profile && typeof profile === 'object'
        ? profile
        : (typeof getUserProfile === 'function' ? getUserProfile() : null);
    const catalog = getBackgroundDesignCatalogForUserStage();
    const unlockedSet = getUnlockedBackgroundDesignSetForUserStage(currentProfile, catalog);
    const selectedKey = String(currentProfile?.selectedBackgroundDesignKey || 'default');
    const coins = Number.isFinite(Number(currentProfile?.coins)) ? Math.max(0, Math.floor(Number(currentProfile.coins))) : 0;

    shop.innerHTML = catalog.map(item => {
        const unlocked = unlockedSet.has(item.key);
        const selected = unlocked && item.key === selectedKey;
        const displayName = getBackgroundDesignNameForUserStage(item);
        const imagePath = item.eventName && typeof getEventImagePath === 'function'
            ? getEventImagePath(item.eventName)
            : null;
        const artHtml = imagePath
            ? `<div class="start-bg-shop-art" style="background-image:url('${escapeHtmlText(imagePath)}')"></div>`
            : '<div class="start-bg-shop-art default-art"></div>';

        const statusText = unlocked ? '交換済み' : `${item.cost}コイン`;
        let action = 'select';
        let actionLabel = selected ? '使用中' : '使う';
        let actionDisabled = selected ? ' disabled' : '';
        let buttonClass = 'start-bg-shop-button';

        if (!unlocked) {
            action = 'buy';
            actionLabel = `交換 ${item.cost}C`;
            if (coins < item.cost) {
                actionDisabled = ' disabled';
                buttonClass += ' locked';
            }
        } else if (selected) {
            buttonClass += ' active';
        }

        return `
            <div class="start-bg-shop-item">
                ${artHtml}
                <div class="start-bg-shop-meta">
                    <div class="start-bg-shop-name">${escapeHtmlText(displayName)}</div>
                    <div class="start-bg-shop-desc">${escapeHtmlText(item.description || '')}</div>
                    <div class="start-bg-shop-cost">${escapeHtmlText(statusText)}</div>
                </div>
                <button class="${buttonClass}" data-bg-action="${escapeHtmlText(action)}" data-bg-key="${escapeHtmlText(item.key)}"${actionDisabled}>${escapeHtmlText(actionLabel)}</button>
            </div>
        `;
    }).join('');
}

function normalizeFriendPassphrase(raw) {
    return String(raw || '').trim().toLowerCase().slice(0, 40);
}

function getFriendRoomStorageKey(passphrase) {
    return `battle-a-la-carte:friend-room:${passphrase}`;
}

function createFriendRoom(passphrase) {
    if (!passphrase) return null;
    const profile = typeof getUserProfile === 'function' ? getUserProfile() : null;
    const room = {
        passphrase,
        hostName: profile?.name || 'プレイヤー',
        createdAt: Date.now()
    };
    try {
        localStorage.setItem(getFriendRoomStorageKey(passphrase), JSON.stringify(room));
    } catch (e) {
        console.warn('failed to create friend room', e);
        return null;
    }
    return room;
}

function findFriendRoom(passphrase) {
    if (!passphrase) return null;
    try {
        const raw = localStorage.getItem(getFriendRoomStorageKey(passphrase));
        if (!raw) return null;
        const room = JSON.parse(raw);
        if (!room || typeof room !== 'object') return null;
        return room;
    } catch (e) {
        console.warn('failed to read friend room', e);
        return null;
    }
}

function showStartStage(activeId) {
    if (window.__storyActiveEpisodeId && window.StoryAdv) window.StoryAdv.abandonBattle();
    window.Achievements?.clearToasts();
    window.cancelPendingCookSfx?.();
    window.DishEffects?.cancel();
    START_STAGE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', id !== activeId);
    });

    if (activeId === 'start-menu-stage') {
        renderStartMenuPlayerCard();
        startMenuFloatingBackground();
    } else {
        stopMenuFloatingBackground();
    }
    if ((activeId === 'start-title-stage' || activeId === 'start-menu-stage') && typeof playTitleBGM === 'function') {
        playTitleBGM();
    }
}

function setStartMenuMessage(text) {
    const messageEl = document.getElementById('start-menu-message');
    if (!messageEl) return;
    messageEl.textContent = text || '';
}

function escapeHtmlText(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getStartMenuFloatImagePool() {
    const pool = ['../assets/battle-images/card-back.webp'];

    if (Array.isArray(window.ingredientDefinitions) && typeof window.getIngredientImagePath === 'function') {
        window.ingredientDefinitions.forEach(def => {
            const path = window.getIngredientImagePath(def.name);
            if (path) pool.push(path);
        });
    }

    if (Array.isArray(window.eventDefinitions) && typeof window.getEventImagePath === 'function') {
        window.eventDefinitions.forEach(def => {
            const path = window.getEventImagePath(def.name);
            if (path) pool.push(path);
        });
    }

    if (Array.isArray(window.recipes) && typeof window.getRecipeImagePath === 'function') {
        window.recipes.forEach(recipe => {
            const path = window.getRecipeImagePath(recipe.name);
            if (path) pool.push(path);
        });
    }

    return [...new Set(pool)];
}

function spawnMenuFloatingCard() {
    const layer = document.getElementById('start-menu-floating-bg');
    if (!layer) return;

    const pool = getStartMenuFloatImagePool();
    if (pool.length === 0) return;

    const card = document.createElement('span');
    card.className = 'menu-floating-card';

    const durationSec = START_MENU_CARD_CYCLE_MS / 1000;
    const xPercent = 12 + Math.random() * 76;
    const yPercent = 16 + Math.random() * 64;
    const rotDeg = Math.round(-8 + Math.random() * 16);
    const scaleValue = (1.00 + Math.random() * 0.08).toFixed(2);
    const isRareGlow = Math.random() < 0.10;

    card.style.left = `${xPercent.toFixed(2)}%`;
    card.style.top = `${yPercent.toFixed(2)}%`;
    card.style.setProperty('--duration', `${durationSec.toFixed(2)}s`);
    card.style.setProperty('--delay', '0s');
    card.style.setProperty('--rot', `${rotDeg}deg`);
    card.style.setProperty('--scale', scaleValue);
    card.style.backgroundImage = `url("${pool[Math.floor(Math.random() * pool.length)]}")`;
    if (isRareGlow) card.classList.add('rare-glow');

    layer.appendChild(card);
}

function startMenuFloatingBackground() {
    const layer = document.getElementById('start-menu-floating-bg');
    if (!layer) return;
    if (startMenuFloatTimer) return;

    layer.innerHTML = '';
    spawnMenuFloatingCard();

    startMenuFloatTimer = setInterval(() => {
        layer.innerHTML = '';
        spawnMenuFloatingCard();
    }, START_MENU_CARD_CYCLE_MS);
}

function stopMenuFloatingBackground() {
    if (startMenuFloatTimer) {
        clearInterval(startMenuFloatTimer);
        startMenuFloatTimer = null;
    }

    const layer = document.getElementById('start-menu-floating-bg');
    if (layer) layer.innerHTML = '';
}

function getGalleryItemsByType(type) {
    if (type === 'characters') {
        return START_GALLERY_CHARACTER_OPTIONS.map(item => ({
            title: item.name,
            meta: 'キャラクター',
            characterClass: item.className
        }));
    }

    if (type === 'ingredients') {
        const defs = Array.isArray(window.ingredientDefinitions) ? window.ingredientDefinitions : [];
        return defs.map(def => ({
            title: def.name,
            meta: '材料カード',
            imagePath: typeof window.getIngredientImagePath === 'function' ? BattleImages.originalPath(window.getIngredientImagePath(def.name)) : null
        }));
    }

    if (type === 'events') {
        const defs = Array.isArray(window.eventDefinitions) ? window.eventDefinitions : [];
        return defs.map(def => ({
            title: def.name,
            meta: def.description || 'イベントカード',
            imagePath: typeof window.getEventImagePath === 'function' ? BattleImages.originalPath(window.getEventImagePath(def.name)) : null
        }));
    }

    if (type === 'recipes') {
        const defs = Array.isArray(window.recipes) ? window.recipes : [];
        return defs.map(def => ({
            title: def.name,
            meta: `${def.points}点 / ${def.required.join(' + ')}`,
            imagePath: typeof window.getRecipeImagePath === 'function' ? BattleImages.originalPath(window.getRecipeImagePath(def.name)) : null
        }));
    }

    return [];
}

function renderStartGallery(type) {
    const safeType = ['characters', 'ingredients', 'events', 'recipes'].includes(type) ? type : 'characters';
    selectedGalleryType = safeType;

    const filterButtons = document.querySelectorAll('.start-gallery-filter[data-gallery-type]');
    filterButtons.forEach(button => {
        const buttonType = button.getAttribute('data-gallery-type');
        button.classList.toggle('active', buttonType === safeType);
    });

    const list = document.getElementById('start-gallery-list');
    if (!list) return;
    list.classList.toggle('character-grid', safeType === 'characters');
    list.classList.toggle('card-grid', safeType !== 'characters');

    const items = getGalleryItemsByType(safeType);
    if (items.length === 0) {
        list.innerHTML = '<div class="start-gallery-empty">表示できるデータがありません。</div>';
        return;
    }

    list.innerHTML = items.map(item => {
        const staticArtClass = safeType === 'characters'
            ? 'start-gallery-art'
            : 'start-gallery-art start-gallery-card-art';
        const artHtml = item.characterClass
            ? `<div class="start-gallery-art character-art"><span class="start-char-portrait ${escapeHtmlText(item.characterClass)}"></span></div>`
            : `<div class="${staticArtClass}" style="background-image:url('${escapeHtmlText(item.imagePath || '../assets/battle-images/card-back.webp')}')"></div>`;

        return `
            <article class="start-gallery-card">
                ${artHtml}
                <div class="start-gallery-title">${escapeHtmlText(item.title)}</div>
                <div class="start-gallery-meta">${escapeHtmlText(item.meta)}</div>
            </article>
        `;
    }).join('');
}

function bindIfExists(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = handler;
}

function bindMainEvents() {
    bindIfExists('cook-button', () => {
        unlockAudio();
        startBgmOnce();
        playerShowRecipeCandidates();
    });

    bindIfExists('confirm-discard-button', () => {
        unlockAudio();
        startBgmOnce();
        confirmDiscardSelection();
    });

    bindIfExists('end-turn-button', () => {
        unlockAudio();
        startBgmOnce();
        playerEndTurn();
    });

    bindIfExists('player-skill-button', () => {
        unlockAudio();
        startBgmOnce();
        if (getBattleViewModel().turn !== 'me' || GameState.gameEnded) {
            if (typeof showPlayerSkillDetails === 'function') showPlayerSkillDetails();
        } else if (typeof playerUseSkill === 'function') {
            playerUseSkill();
        }
    });

    bindIfExists('show-match-result-button', () => {
        showResultOverlay(buildWinnerText(GameState.winner), GameState.winner === 'player' ? 'win' : 'lose');
    });

    bindIfExists('result-field-button', returnToFinalField);
    bindIfExists('result-exit-button', finishCompletedMatch);
    bindIfExists('result-retry-button', retryMissionMatch);
    bindIfExists('final-field-exit-button', finishCompletedMatch);

    bindIfExists('spotlight-close-button', hideSpotlightCard);

    bindIfExists('selection-confirm-button', () => {
        unlockAudio();
        startBgmOnce();
        if (GameState.selectionMode === 'board-cycle-select') confirmBoardCycleSelection();
        else if (GameState.selectionMode === 'discard') confirmDiscardSelection();
        else confirmEventSelection();
    });

    bindIfExists('selection-cancel-button', () => {
        unlockAudio();
        startBgmOnce();
        if (GameState.selectionMode === 'board-cycle-select') cancelBoardCycleSelection();
        else cancelEventSelection();
    });

    bindIfExists('board-cycle-start-button', beginBoardCycleSelection);
    bindIfExists('board-cycle-close-button', closeBoardCycleDetails);

    bindIfExists('set-confirm-yes-button', () => {
        unlockAudio();
        startBgmOnce();
        confirmSetCard();
    });

    bindIfExists('set-confirm-no-button', () => {
        unlockAudio();
        startBgmOnce();
        cancelSetCard();
    });

    bindIfExists('pack-confirm-yes-button', () => {
        unlockAudio();
        startBgmOnce();
        confirmPackPurchase();
    });

    bindIfExists('pack-confirm-no-button', () => {
        unlockAudio();
        startBgmOnce();
        cancelPackPurchase();
    });

    bindIfExists('event-confirm-yes-button', () => {
        unlockAudio();
        startBgmOnce();
        confirmEventCard();
    });

    bindIfExists('event-confirm-no-button', () => {
        unlockAudio();
        startBgmOnce();
        cancelEventCard();
    });

    bindIfExists('skill-confirm-yes-button', () => {
        unlockAudio();
        startBgmOnce();
        if (typeof confirmSkillActivation === 'function') {
            confirmSkillActivation();
        }
    });

    bindIfExists('skill-confirm-no-button', () => {
        unlockAudio();
        startBgmOnce();
        if (typeof cancelSkillActivation === 'function') {
            cancelSkillActivation();
        }
    });

    bindIfExists('set-view-close-button', () => {
        unlockAudio();
        startBgmOnce();
        closeSetCardView();
    });

    bindIfExists('ingredient-action-set-button', () => {
        unlockAudio();
        startBgmOnce();
        confirmIngredientSetFromAction();
    });

    bindIfExists('ingredient-action-combo-button', () => {
        unlockAudio();
        startBgmOnce();
        showIngredientCombinations();
    });

    bindIfExists('ingredient-action-back-button', () => {
        unlockAudio();
        startBgmOnce();
        backIngredientAction();
    });

    bindIfExists('ingredient-action-close-button', () => {
        unlockAudio();
        startBgmOnce();
        closeIngredientAction();
    });

    bindIfExists('end-turn-confirm-yes-button', () => {
        unlockAudio();
        startBgmOnce();
        confirmEndTurn();
    });

    bindIfExists('end-turn-confirm-no-button', () => {
        unlockAudio();
        startBgmOnce();
        cancelEndTurn();
    });

    bindIfExists('reset-game-button', () => {
        clearSavedMatch();
        stopBGM();
        location.reload();
    });
}

function hardRepairGameState() {
    if (typeof initGame === 'function' && (!GameState.deck || GameState.deck.length === 0)) {
        initGame();
    }

    if (typeof ensureDeckExists === 'function') {
        ensureDeckExists();
    }

    if (GameState.players.player.hand.length === 0 && GameState.players.player.events.length === 0) {
        drawUntilTargetHand(GameState.players.player);
    }

    if (GameState.players.cpu.hand.length === 0 && GameState.players.cpu.events.length === 0) {
        drawUntilTargetHand(GameState.players.cpu);
    }

    if (!GameState.currentTurn) {
        GameState.currentTurn = 'player';
    }

    if (!GameState.currentPhase || GameState.currentPhase === 'ゲーム終了') {
        GameState.currentPhase = 'メインフェイズ';
    }

    GameState.gameEnded = false;
    if (!Number.isFinite(Number(GameState.matchStartedAt))) GameState.matchStartedAt = Date.now();
    GameState.matchEndedAt = null;
}

function safeStartGame() {
    if (gameStartedOnce) return;
    gameStartedOnce = true;

    try {
        if (typeof setupAudio === 'function') setupAudio();
        if (typeof setBattleModeBgmLocked === 'function') setBattleModeBgmLocked(false);
    } catch (e) {
        console.warn('audio setup failed', e);
    }

    try {
        if (typeof initGame === 'function') initGame();
    } catch (e) {
        console.error('initGame failed', e);
    }

    try {
        hardRepairGameState();
    } catch (e) {
        console.error('hardRepairGameState failed', e);
    }

    try {
        if (typeof applyRuntimeSettings === 'function') applyRuntimeSettings();
    } catch (e) {
        console.warn('applyRuntimeSettings failed', e);
    }

    hideResultOverlay();
    hideSpotlightCard();
    bindMainEvents();

    try {
        addLog('ゲーム開始準備完了。');
    } catch (e) {
        console.warn('log init skipped', e);
    }

    setCPUStatus('');
    updateUI();
}

function startBgmOnce() {
    if (bgmStarted) {
        if (typeof playBGM === 'function') playBGM();
        return;
    }

    if (!bgmStarted) {
        if (GameState && GameState.settings) {
            GameState.settings.bgmEnabled = true;
        }
        if (typeof setBgmEnabled === 'function') setBgmEnabled(true);
        bgmStarted = true;
    }
    if (typeof playBGM === 'function') playBGM();
    if (typeof playSfx === 'function') {
        playSfx('gameStart');
        playSfx('turnStart');
    }
}

function setCharacterChoice(choice) {
    selectedStartCharacter = getStartCharacterOptionById(choice) ? choice : 'chizuru';

    const buttons = document.querySelectorAll('.start-char-button[data-character-id]');
    buttons.forEach(button => {
        const charId = button.getAttribute('data-character-id');
        button.classList.toggle('active', charId === selectedStartCharacter);
        button.setAttribute('aria-pressed', String(charId === selectedStartCharacter));
    });
}

function renderStartCharacterCards(containerId, selectedId, opponent = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const skill = getSkillDefinitionByKeySafe(selectedStartSkillKey);
    const personality = getCpuPersonalityOptionsSafe().find(item => item.key === selectedCpuPersonality);
    const strategy = opponent ? `CPU性格：${personality?.label || '標準'}` : `スキル：${skill?.name || '次へで選択'}`;
    const prefix = window.location?.pathname?.includes('/mobile/') ? '../' : '';
    container.innerHTML = START_CHARACTER_OPTIONS.map(option => {
        const selected = option.id === selectedId;
        const attribute = opponent ? 'data-opponent-id' : 'data-character-id';
        return `<button type="button" class="start-char-button start-standing-card${selected ? ' active' : ''}" ${attribute}="${option.id}" aria-pressed="${selected}">
            <img class="start-standing-art" src="${prefix}${BattleImages.standingPath(option.id)}" width="512" height="768" alt="" draggable="false">
            <span class="start-standing-plate"><span class="start-char-name">${option.name}</span><span class="start-char-strategy">${escapeHtmlText(strategy)}</span></span>
        </button>`;
    }).join('');
}

function applyCharacterChoice() {
    if (!GameState.characterIds) {
        GameState.characterIds = { player: 'chizuru', cpu: 'mai' };
    }
    if (!GameState.characterNames) {
        GameState.characterNames = { player: '千鶴', cpu: '舞依' };
    }

    const playerOption = getStartCharacterOptionById(selectedStartCharacter) || START_CHARACTER_OPTIONS[0];
    const cpuCandidates = START_CHARACTER_OPTIONS.filter(option => option.id !== playerOption.id);
    const missionOpponentId = GameState.activeMissionId ? document.getElementById('start-mission-opponent')?.value : null;
    const cpuOption = getStartCharacterOptionById(missionOpponentId)
        || cpuCandidates[Math.floor(Math.random() * cpuCandidates.length)] || START_CHARACTER_OPTIONS[1];

    GameState.characterIds.player = playerOption.id;
    GameState.characterIds.cpu = cpuOption.id;
    GameState.characterNames.player = playerOption.name;
    GameState.characterNames.cpu = cpuOption.name;
}

function revealTurnCards(chosenSide) {
    const left = document.getElementById('start-turn-card-left');
    const right = document.getElementById('start-turn-card-right');
    if (!left || !right || !turnCardRoleMap) return;

    left.textContent = `カードA: ${turnCardRoleMap.left}`;
    right.textContent = `カードB: ${turnCardRoleMap.right}`;
    left.classList.add('revealed');
    right.classList.add('revealed');
    left.classList.toggle('chosen', chosenSide === 'left');
    right.classList.toggle('chosen', chosenSide === 'right');
}

function beginMatchByRole(role, storySetup = null) {
    window.__storyActiveEpisodeId = storySetup?.episode.id || null;
    GameState.storyEpisodeId = storySetup?.episode.id || null;
    GameState.achievementStory = !!storySetup;
    safeStartGame();
    GameState.activeMissionId = window.Missions?.getDefinition(pendingMissionId) ? pendingMissionId : null;
    GameState.missionFailedLogged = false;
    pendingMissionId = null;
    if (typeof unlockAudio === 'function') unlockAudio();
    startBgmOnce();
    if (storySetup) {
        const { episode, skillKey } = storySetup;
        GameState.storyEpisodeId = episode.id;
        GameState.achievementStory = true;
        GameState.characterIds = { player: episode.battle.player, cpu: episode.battle.cpu };
        GameState.characterNames = {
            player: window.BattleStoryAssets.characters[episode.battle.player].name,
            cpu: window.BattleStoryAssets.characters[episode.battle.cpu].name
        };
        GameState.settings.cpuPersonality = episode.battle.cpuPersonality;
        setPlayerSelectedSkill(GameState.players.player, skillKey);
        setPlayerSelectedSkill(GameState.players.cpu, pickCpuSkillByPersonality(episode.battle.cpuPersonality));
        addLog('ストーリーモード開始: 第' + episode.number + '話「' + episode.title + '」');
    } else {
        applyCharacterChoice();
        applyBattleSkillSetup();
    }
    stopMenuFloatingBackground();
    if (startTitleTimer) {
        clearTimeout(startTitleTimer);
        startTitleTimer = null;
    }
    matchExitBackArmedUntil = 0;
    pushMatchExitGuardHistory();

    const overlay = document.getElementById('start-overlay');
    if (overlay) overlay.classList.add('hidden');

    if (role === '先攻') {
        GameState.currentTurn = 'player';
        GameState.currentPhase = 'メインフェイズ';
        addLog('あなたが先攻です。');
        enablePlayerControls();
        updateUI();
        saveMatchSnapshot('match-start-player-first');
        return;
    }

    GameState.currentTurn = 'cpu';
    GameState.currentPhase = 'メインフェイズ';
    addLog(`${getOpponentLabelText()}が先攻です。`);
    disablePlayerControls();
    updateUI();
    saveMatchSnapshot('match-start-cpu-first');

    const isFriendMode = !!(window.FriendBattle && typeof window.FriendBattle.isActive === 'function' && window.FriendBattle.isActive());
    if (isFriendMode) {
        if (typeof setCPUStatus === 'function') setCPUStatus('フレンドのターンです');
        return;
    }

    const cpuStartDelay = typeof getCpuTurnStartDelay === 'function'
        ? Math.min(1200, getCpuTurnStartDelay())
        : 1200;

    const cpuStartMatchId = GameState.achievementMatchId;
    setTimeout(() => {
        if (GameState.achievementMatchId !== cpuStartMatchId) return;
        if (GameState.gameEnded) return;
        if (GameState.currentTurn !== 'cpu') return;
        cpuTurn();
    }, cpuStartDelay);
}

function onTurnCardSelected(side) {
    if (!turnCardRoleMap || selectedTurnCard) return;
    selectedTurnCard = side;

    revealTurnCards(side);
    safeStartGame();
    if (typeof unlockAudio === 'function') unlockAudio();
    startBgmOnce();

    const role = turnCardRoleMap[side];
    const msg = document.getElementById('start-turn-message');
    const battleMsg = document.getElementById('start-battle-message');
    if (msg) msg.textContent = `あなたは${role}です`;
    if (battleMsg) battleMsg.textContent = '対戦開始';

    setTimeout(() => {
        beginMatchByRole(role);
    }, 900);
}

// The online menu mounts its controls first. Move the existing nodes so their
// listeners and form submission stay intact, without changing network code.
function setupOnlineStartLayout() {
    const stage = document.getElementById('start-friend-stage');
    if (!stage || stage.querySelector('.start-stage-body')) return;
    const header = document.createElement('div');
    header.className = 'start-stage-header';
    const body = document.createElement('div');
    body.className = 'start-stage-body';
    const footer = document.createElement('div');
    footer.className = 'start-stage-footer';
    const roomActions = stage.querySelector('.start-setup-actions');
    const search = document.getElementById('friend-search-public-button');
    const back = document.getElementById('start-friend-back-button');
    const resume = document.getElementById('online-resume');
    const login = stage.querySelector('#online-login-form button[type="submit"]');
    if (login) login.setAttribute('form', 'online-login-form');
    for (const child of Array.from(stage.children)) {
        if (child.matches('h2, .start-subtitle')) header.appendChild(child);
        else if (child !== roomActions && child !== back) body.appendChild(child);
    }
    if (roomActions) footer.appendChild(roomActions);
    for (const buttons of [[login, resume], [search, back]]) {
        const row = document.createElement('div');
        row.className = 'start-setup-actions';
        buttons.filter(Boolean).forEach(button => row.appendChild(button));
        if (row.children.length) footer.appendChild(row);
    }
    stage.append(header, body, footer);
}

function setupStartOverlay() {
    setupOnlineStartLayout();
    setupMatchAutosaveOnce();
    setupMatchExitGuardOnce();
    const overlay = document.getElementById('start-overlay');
    if (!overlay) {
        safeStartGame();
        return;
    }

    if (!startOverlayAudioUnlockBound) {
        startOverlayAudioUnlockBound = true;
        document.addEventListener('pointerdown', () => {
            if (typeof unlockAudio === 'function') unlockAudio();
            if (typeof playTitleBGM === 'function') playTitleBGM();
        }, { once: true, passive: true });
    }

    const characterCards = document.getElementById('start-character-cards');
    const opponentCards = document.getElementById('start-opponent-cards');
    const startButton = document.getElementById('start-setup-button');
    const turnStage = document.getElementById('start-turn-stage');
    const left = document.getElementById('start-turn-card-left');
    const right = document.getElementById('start-turn-card-right');
    const msg = document.getElementById('start-turn-message');
    const battleMsg = document.getElementById('start-battle-message');
    const menuCpuButton = document.getElementById('menu-cpu-button');
    const menuResumeButton = document.getElementById('menu-resume-button');
    const menuStoryButton = document.getElementById('menu-story-button');
    const menuFriendButton = document.getElementById('menu-friend-button');
    const menuOnlineButton = document.getElementById('menu-online-button');
    const menuCoinButton = document.getElementById('menu-coin-button');
    const menuRulesButton = document.getElementById('menu-rules-button');
    const menuGalleryButton = document.getElementById('menu-gallery-button');
    const menuUserButton = document.getElementById('menu-user-button');
    const menuHomeButton = document.getElementById('menu-home-button');
    const backMenuButton = document.getElementById('start-back-menu-button');
    const rulesBackButton = document.getElementById('start-rules-back-button');
    const storyBackButton = document.getElementById('start-story-back-button');
    const galleryBackButton = document.getElementById('start-gallery-back-button');
    const friendBackButton = document.getElementById('start-friend-back-button');
    const coinBackButton = document.getElementById('start-coin-back-button');
    const userBackButton = document.getElementById('start-user-back-button');
    const friendCreateButton = document.getElementById('friend-create-button');
    const friendJoinButton = document.getElementById('friend-join-button');
    const friendPassphraseInput = document.getElementById('friend-passphrase-input');
    const userSaveButton = document.getElementById('user-save-button');
    const userResetButton = document.getElementById('user-reset-button');
    const userNameInput = document.getElementById('user-name-input');
    const userFavoriteCharacterSelect = document.getElementById('user-favorite-character');
    const userFavoriteSkillSelect = document.getElementById('user-favorite-skill');
    const coinBackgroundShop = document.getElementById('coin-background-shop');
    const startCpuPersonalitySelect = document.getElementById('start-cpu-personality');
    const startSkillList = document.getElementById('start-skill-list');
    const startSkillDetail = document.getElementById('start-skill-detail');
    const startSkillMessage = document.getElementById('start-skill-message');
    const startSkillFooter = document.getElementById('start-skill-footer');
    const startSkillFavoriteButton = document.getElementById('start-skill-favorite-button');
    const startSkillRulesList = document.getElementById('start-skill-rules-list');
    const startCharacterStep = document.getElementById('start-character-step');
    const missionOpponentWrap = document.getElementById('start-mission-opponent-wrap');
    const missionOpponentSelect = document.getElementById('start-mission-opponent');
    const startSkillStep = document.getElementById('start-skill-step');
    const startCpuSetupSubtitle = document.getElementById('start-cpu-setup-subtitle');
    const galleryFilterButtons = document.querySelectorAll('.start-gallery-filter[data-gallery-type]');

    const resetTurnStage = () => {
        selectedTurnCard = null;
        turnCardRoleMap = null;
        if (battleMsg) battleMsg.textContent = '';
        if (msg) msg.textContent = 'カードを1枚選んでください';
        if (left) {
            left.textContent = 'カードA';
            left.classList.remove('revealed', 'chosen');
        }
        if (right) {
            right.textContent = 'カードB';
            right.classList.remove('revealed', 'chosen');
        }
    };

    let storySkillChoice = null;
    const renderCpuSetupStep = () => {
        const title = document.getElementById('start-cpu-setup-title');
        if (title) title.textContent = storySkillChoice ? `第${storySkillChoice.episode.number}話 対戦準備` : 'CPU戦セットアップ';
        startCpuPersonalitySelect?.closest?.('.start-cpu-personality-row')?.classList.toggle('hidden', !!storySkillChoice);
        if (startCharacterStep) startCharacterStep.classList.toggle('hidden', startCpuSetupStep !== 1 || choosingMissionOpponent);
        if (missionOpponentWrap) missionOpponentWrap.classList.toggle('hidden', startCpuSetupStep !== 1 || !pendingMissionId || !choosingMissionOpponent);
        if (startSkillStep) startSkillStep.classList.toggle('hidden', startCpuSetupStep !== 2);
        if (startSkillFooter) startSkillFooter.classList.toggle('hidden', startCpuSetupStep !== 2);
        if (turnStage) turnStage.classList.toggle('hidden', startCpuSetupStep !== 3);

        if (startCpuSetupSubtitle) {
            if (startCpuSetupStep === 1) {
                startCpuSetupSubtitle.textContent = choosingMissionOpponent ? '1/3 対戦相手を選択' : '1/3 キャラを選択';
            } else if (startCpuSetupStep === 2) {
                startCpuSetupSubtitle.textContent = storySkillChoice ? `${window.BattleStoryAssets.characters[storySkillChoice.episode.battle.player].name}のスキルを選択` : '2/3 スキルを選択';
            } else {
                startCpuSetupSubtitle.textContent = '3/3 先攻・後攻を決定';
            }
        }

        if (startButton) {
            if (startCpuSetupStep === 1) {
                startButton.classList.remove('hidden');
                startButton.textContent = pendingMissionId && !choosingMissionOpponent ? '次へ（対戦相手を選択）' : '次へ（スキル選択）';
            } else if (startCpuSetupStep === 2) {
                startButton.classList.remove('hidden');
                startButton.textContent = storySkillChoice ? 'BATTLE START' : '次へ（先攻・後攻決め）';
            } else {
                startButton.classList.add('hidden');
            }
        }

        if (backMenuButton) {
            if (startCpuSetupStep === 1) {
                backMenuButton.textContent = choosingMissionOpponent ? 'キャラ選択へ戻る' : 'メニューへ戻る';
            } else if (startCpuSetupStep === 2) {
                backMenuButton.textContent = storySkillChoice ? 'ストーリー選択へ戻る' : (pendingMissionId ? '対戦相手へ戻る' : 'キャラ選択へ戻る');
            } else {
                backMenuButton.textContent = 'スキル選択へ戻る';
            }
        }
        if (startCpuSetupStep === 1) {
            renderStartCharacterCards('start-character-cards', selectedStartCharacter);
            if (pendingMissionId) renderStartCharacterCards('start-opponent-cards', missionOpponentSelect?.value, true);
        }
    };

    const setCpuSetupStep = (nextStep) => {
        startCpuSetupStep = Math.max(1, Math.min(3, Number(nextStep) || 1));
        renderCpuSetupStep();
        const body = document.querySelector('#start-cpu-setup-stage > .start-stage-body');
        if (body) body.scrollTop = 0;
    };

    const openTurnDecisionStep = () => {
        resetTurnStage();

        const isLeftFirst = Math.random() < 0.5;
        turnCardRoleMap = isLeftFirst
            ? { left: '先攻', right: '後攻' }
            : { left: '後攻', right: '先攻' };

        setCpuSetupStep(3);
    };

    const openMenuStage = () => {
        pendingMissionId = null;
        choosingMissionOpponent = false;
        resetTurnStage();
        setCpuSetupStep(1);
        setStartMenuMessage(STARTUP_IMAGE_CACHE_NOTICE);
        setFriendRoomMessage('');
        setCoinStageMessage('');
        setUserStageMessage('');
        setStartSkillMessage('');
        updateResumeMatchButtonVisibility();
        showStartStage('start-menu-stage');
    };

    const notifyPlannedFeature = (label) => {
        setStartMenuMessage(`${label}は今後実装予定です。`);
    };

    const openUserStage = () => {
        setStartMenuMessage('');
        setCoinStageMessage('');
        setUserStageMessage('推しキャラ・推しスキルを保存すると、次回から初期選択に反映されます。');
        renderUserStageProfile();
        showStartStage('start-user-stage');
    };

    const openCoinStage = () => {
        setStartMenuMessage('');
        setUserStageMessage('');
        setCoinStageMessage('交換した背景は「設定」からいつでも使用できます。');
        renderCoinStageProfile();
        showStartStage('start-coin-stage');
    };

    const setStartSkillMessage = (text) => {
        if (!startSkillMessage) return;
        startSkillMessage.textContent = text || '';
    };

    const renderStartSkillSelection = () => {
        if (!startSkillList) return;

        const defs = getSkillDefinitionsSafe();
        if (defs.length === 0) {
            startSkillList.innerHTML = '<div class="start-gallery-empty">スキル情報を読み込めませんでした。</div>';
            if (startSkillDetail) startSkillDetail.innerHTML = '';
            return;
        }

        if (!defs.some(item => item.key === selectedStartSkillKey)) {
            selectedStartSkillKey = defs[0].key;
        }

        startSkillList.innerHTML = defs.map(skill => {
            const selected = skill.key === selectedStartSkillKey;
            const maxUses = Number.isFinite(Number(skill.maxUses)) ? Math.max(1, Math.floor(Number(skill.maxUses))) : 1;
            return `
                <button type="button" class="start-skill-tile${selected ? ' active' : ''}" data-pick-skill-key="${escapeHtmlText(skill.key)}" aria-pressed="${selected ? 'true' : 'false'}">
                    <span class="start-skill-tile-name">${escapeHtmlText(skill.name)}</span>
                    <span class="skill-recommendation">${escapeHtmlText(skillRecommendationText(skill))}</span>
                    <span class="start-skill-tile-summary">${escapeHtmlText(skill.effect || 'なし')}</span>
                    <span class="start-skill-tile-uses">${maxUses}回</span>
                </button>
            `;
        }).join('');

        const picked = defs.find(item => item.key === selectedStartSkillKey);
        if (startSkillDetail) {
            if (!picked) {
                startSkillDetail.innerHTML = '';
            } else {
                const maxUses = Number.isFinite(Number(picked.maxUses)) ? Math.max(1, Math.floor(Number(picked.maxUses))) : 1;
                startSkillDetail.innerHTML = `
                    <details>
                    <summary class="start-skill-detail-name">${escapeHtmlText(picked.name)} · 詳しく</summary>
                    <div class="start-skill-detail-body">
                    <div class="skill-recommendation">${escapeHtmlText(skillRecommendationText(picked))}</div>
                    <div class="start-skill-detail-row"><span>条件</span><strong>${escapeHtmlText(picked.condition || 'なし')}</strong></div>
                    <div class="start-skill-detail-row"><span>効果</span><strong>${escapeHtmlText(picked.effect || 'なし')}</strong></div>
                    <div class="start-skill-detail-row"><span>使用回数</span><strong>${maxUses}回</strong></div>
                    </div>
                    </details>
                `;
            }
        }
        setStartSkillMessage(picked ? '' : 'スキルを1つ選択してください。');
    };

    const renderStartSkillRules = () => {
        if (!startSkillRulesList) return;
        const defs = getSkillDefinitionsSafe();
        if (!Array.isArray(defs) || defs.length === 0) {
            startSkillRulesList.innerHTML = '<div class="start-gallery-empty">スキル情報を読み込めませんでした。</div>';
            return;
        }
        startSkillRulesList.innerHTML = defs.map(skill => {
            const maxUses = Number.isFinite(Number(skill.maxUses)) ? Math.max(1, Math.floor(Number(skill.maxUses))) : 1;
            return `
                <div class="start-skill-rule-item">
                    <div class="start-skill-rule-name">${escapeHtmlText(skill.name || 'スキル')}</div>
                    <div class="skill-recommendation">${escapeHtmlText(skillRecommendationText(skill))}</div>
                    <div>条件: ${escapeHtmlText(skill.condition || 'なし')}</div>
                    <div>効果: ${escapeHtmlText(skill.effect || 'なし')}</div>
                    <div>使用回数: ${maxUses}回</div>
                </div>
            `;
        }).join('');
    };

    const syncStartCpuPersonalitySelect = () => {
        if (!startCpuPersonalitySelect) return;
        const options = getCpuPersonalityOptionsSafe();
        const current = normalizeStartCpuPersonality(selectedCpuPersonality || GameState?.settings?.cpuPersonality || 'default');
        selectedCpuPersonality = current;
        startCpuPersonalitySelect.innerHTML = options
            .map(item => `<option value="${escapeHtmlText(item.key)}"${item.key === current ? ' selected' : ''}>${escapeHtmlText(item.label)}</option>`)
            .join('');
        startCpuPersonalitySelect.value = current;
    };

    characterCards?.addEventListener('click', event => {
            const button = event.target.closest('button[data-character-id]');
            if (!button) return;
            const charId = button.getAttribute('data-character-id');
            setCharacterChoice(charId || 'chizuru');
    });
    opponentCards?.addEventListener('click', event => {
        const button = event.target.closest('button[data-opponent-id]');
        const id = button?.getAttribute('data-opponent-id');
        if (!getStartCharacterOptionById(id) || !missionOpponentSelect) return;
        missionOpponentSelect.value = id;
        renderStartCharacterCards('start-opponent-cards', id, true);
    });

    if (startCpuPersonalitySelect) {
        startCpuPersonalitySelect.addEventListener('change', () => {
            selectedCpuPersonality = normalizeStartCpuPersonality(startCpuPersonalitySelect.value);
            if (GameState.settings) {
                GameState.settings.cpuPersonality = selectedCpuPersonality;
            }
        });
    }

    if (startSkillList) {
        startSkillList.addEventListener('click', event => {
            const button = event.target.closest('button[data-pick-skill-key]');
            if (!button) return;
            const skillKey = button.getAttribute('data-pick-skill-key') || '';
            const skill = getSkillDefinitionByKeySafe(skillKey);
            if (!skill) return;
            selectedStartSkillKey = skill.key;
            renderStartSkillSelection();
        });
    }

    if (startSkillFavoriteButton) {
        startSkillFavoriteButton.addEventListener('click', () => {
            const skill = getSkillDefinitionByKeySafe(selectedStartSkillKey);
            if (!skill || typeof updateUserBasicSettings !== 'function') return;
            updateUserBasicSettings({ favoriteSkillKey: skill.key });
            setStartSkillMessage(`「${skill.name}」をお気に入りに登録しました。`);
        });
    }

    if (left) left.addEventListener('click', () => onTurnCardSelected('left'));
    if (right) right.addEventListener('click', () => onTurnCardSelected('right'));

    if (startButton) {
        startButton.addEventListener('click', () => {
            if (storySkillChoice) {
                const picked = getSkillDefinitionByKeySafe(selectedStartSkillKey);
                if (!picked) return;
                const choice = storySkillChoice; storySkillChoice = null;
                renderCpuSetupStep(); choice.onStart(picked.key); return;
            }
            if (startCpuSetupStep === 1) {
                if (pendingMissionId && !choosingMissionOpponent) {
                    choosingMissionOpponent = true;
                    setCpuSetupStep(1);
                    return;
                }
                setCpuSetupStep(2);
                return;
            }

            if (startCpuSetupStep === 2) {
                const pickedSkill = getSkillDefinitionByKeySafe(selectedStartSkillKey);
                if (!pickedSkill) {
                    setStartSkillMessage('スキルを1つ選択してください。');
                    return;
                }

                selectedCpuPersonality = normalizeStartCpuPersonality(startCpuPersonalitySelect?.value || selectedCpuPersonality);
                if (GameState.settings) {
                    GameState.settings.cpuPersonality = selectedCpuPersonality;
                }

                openTurnDecisionStep();
            }
        });
    }

    window.openStorySkillChoice = (episode, onStart, onBack) => {
        pendingMissionId = null; choosingMissionOpponent = false;
        storySkillChoice = { episode, onStart, onBack };
        selectedStartSkillKey = getPreferredStartSkillKey();
        resetTurnStage(); renderStartSkillSelection(); setCpuSetupStep(2);
        document.getElementById('start-overlay')?.classList.remove('hidden');
        showStartStage('start-cpu-setup-stage');
    };

    const openCpuSetup = (missionId = null) => {
            storySkillChoice = null;
            pendingMissionId = window.Missions?.getDefinition(missionId) ? missionId : null;
            choosingMissionOpponent = false;
            if (typeof unlockAudio === 'function') unlockAudio();
            setStartMenuMessage('');
            resetTurnStage();
            setCharacterChoice(getPreferredStartCharacterId());
            if (missionOpponentSelect && pendingMissionId) {
                missionOpponentSelect.value = START_CHARACTER_OPTIONS.find(item => item.id !== selectedStartCharacter)?.id || 'mai';
            }
            selectedStartSkillKey = getPreferredStartSkillKey();
            selectedCpuPersonality = normalizeStartCpuPersonality(GameState?.settings?.cpuPersonality || selectedCpuPersonality);
            syncStartCpuPersonalitySelect();
            renderStartSkillSelection();
            setCpuSetupStep(1);
            showStartStage('start-cpu-setup-stage');
    };
    window.startMissionCpuSetup = missionId => {
        if (window.Missions?.isUnlocked() && window.Missions.getDefinition(missionId)) openCpuSetup(missionId);
    };
    if (menuCpuButton) menuCpuButton.addEventListener('click', () => openCpuSetup());

    if (menuResumeButton) {
        menuResumeButton.addEventListener('click', () => {
            if (typeof unlockAudio === 'function') unlockAudio();
            resumeSavedMatch();
        });
    }

    if (menuStoryButton) {
        menuStoryButton.addEventListener('click', () => {
            if (typeof unlockAudio === 'function') unlockAudio();
            setStartMenuMessage('');
            showStartStage('start-story-stage');
            if (typeof window.openStoryStage === 'function') {
                window.openStoryStage();
            }
        });
    }

    if (menuFriendButton) {
        menuFriendButton.addEventListener('click', () => {
            if (typeof unlockAudio === 'function') unlockAudio();
            setStartMenuMessage('');
            window.FriendBattle.refreshLogin();
            showStartStage('start-friend-stage');
        });
    }

    if (menuOnlineButton) {
        menuOnlineButton.addEventListener('click', () => {
            showStartStage('start-friend-stage');
            window.FriendBattle.refreshLogin();
        });
    }

    if (menuCoinButton) {
        menuCoinButton.addEventListener('click', () => {
            openCoinStage();
        });
    }

    if (menuRulesButton) {
        menuRulesButton.addEventListener('click', () => {
            setStartMenuMessage('');
            renderStartSkillRules();
            showStartStage('start-rules-stage');
        });
    }

    if (menuGalleryButton) {
        menuGalleryButton.addEventListener('click', () => {
            setStartMenuMessage('');
            renderStartGallery(selectedGalleryType);
            showStartStage('start-gallery-stage');
        });
    }

    for (const button of [menuUserButton, document.getElementById('menu-player-profile-button')]) {
        button?.addEventListener('click', openUserStage);
    }

    document.getElementById('menu-settings-button')?.addEventListener('click', () => {
        showStartStage('start-settings-stage');
        const content = document.getElementById('start-settings-content');
        if (content && window.DishEffects) {
            content.innerHTML = window.DishEffects.settingsHtml('start-settings');
            window.DishEffects.bindSettings('start-settings');
        }
    });
    document.getElementById('start-settings-back-button')?.addEventListener('click', openMenuStage);

    if (menuHomeButton) {
        menuHomeButton.addEventListener('click', () => {
            stopMenuFloatingBackground();
            window.location.href = '../index.html';
        });
    }

    if (backMenuButton) {
        backMenuButton.addEventListener('click', () => {
            if (storySkillChoice) {
                const choice = storySkillChoice; storySkillChoice = null;
                renderCpuSetupStep(); choice.onBack(); return;
            }
            if (startCpuSetupStep <= 1) {
                if (choosingMissionOpponent) {
                    choosingMissionOpponent = false;
                    setCpuSetupStep(1);
                    return;
                }
                openMenuStage();
                return;
            }
            if (startCpuSetupStep === 3) {
                resetTurnStage();
            }
            setCpuSetupStep(startCpuSetupStep - 1);
        });
    }

    if (rulesBackButton) {
        rulesBackButton.addEventListener('click', () => {
            openMenuStage();
        });
    }

    if (storyBackButton) {
        storyBackButton.addEventListener('click', () => {
            openMenuStage();
        });
    }

    if (galleryBackButton) {
        galleryBackButton.addEventListener('click', () => {
            openMenuStage();
        });
    }

    if (friendBackButton) {
        friendBackButton.addEventListener('click', async () => {
            try { await window.FriendBattle.leaveRoom(); } catch { setFriendRoomMessage('退出を確認できませんでした。通信を確認して再度お試しください。'); return; }
            openMenuStage();
        });
    }

    if (userBackButton) {
        userBackButton.addEventListener('click', () => {
            openMenuStage();
        });
    }

    if (coinBackButton) {
        coinBackButton.addEventListener('click', () => {
            openMenuStage();
        });
    }

    if (friendCreateButton) friendCreateButton.addEventListener('click', () => window.FriendBattle.createRoom());
    if (friendJoinButton) friendJoinButton.addEventListener('click', () => window.FriendBattle.joinRoom({ passphrase: friendPassphraseInput?.value || '' }));

    if (userSaveButton) {
        userSaveButton.addEventListener('click', () => {
            if (typeof updateUserBasicSettings !== 'function') return;
            const nextName = userNameInput?.value || '';
            const nextFavoriteCharacter = userFavoriteCharacterSelect?.value || 'chizuru';
            const nextFavoriteSkill = userFavoriteSkillSelect?.value || getPreferredStartSkillKey();
            updateUserBasicSettings({
                name: nextName,
                favoriteCharacterId: nextFavoriteCharacter,
                favoriteSkillKey: nextFavoriteSkill
            });
            selectedStartSkillKey = getPreferredStartSkillKey();
            renderStartSkillSelection();
            renderUserStageProfile();
            setCharacterChoice(getPreferredStartCharacterId());
            setUserStageMessage('ユーザー情報を保存しました。');
        });
    }

    if (coinBackgroundShop) {
        coinBackgroundShop.addEventListener('click', event => {
            const button = event.target.closest('button[data-bg-action][data-bg-key]');
            if (!button) return;

            const action = button.getAttribute('data-bg-action') || '';
            const designKey = button.getAttribute('data-bg-key') || 'default';
            const catalog = getBackgroundDesignCatalogForUserStage();
            const design = catalog.find(item => item.key === designKey) || null;
            const designName = getBackgroundDesignNameForUserStage(design);

            if (action === 'buy') {
                if (typeof purchaseBackgroundDesign !== 'function') {
                    setCoinStageMessage('コイン交換機能を利用できません。');
                    return;
                }

                const result = purchaseBackgroundDesign(designKey);
                if (!result || !result.ok) {
                    if (result?.reason === 'not-enough-coins') {
                        setCoinStageMessage(`コイン不足: 「${designName}」の交換には${design?.cost ?? 0}コイン必要です。`);
                    } else if (result?.reason === 'already-owned') {
                        setCoinStageMessage(`「${designName}」はすでに交換済みです。`);
                    } else {
                        setCoinStageMessage('背景デザインの交換に失敗しました。');
                    }
                    renderCoinStageProfile();
                    return;
                }

                if (typeof setSelectedBackgroundDesign === 'function') {
                    setSelectedBackgroundDesign(designKey);
                }
                if (GameState?.settings) {
                    GameState.settings.backgroundDesign = designKey;
                }
                if (typeof applyRuntimeSettings === 'function') applyRuntimeSettings();
                if (typeof updateUI === 'function' && gameStartedOnce) updateUI();

                renderCoinStageProfile();
                setCoinStageMessage(`背景デザイン「${designName}」を交換しました。残りコイン: ${result.profile?.coins ?? 0}`);
                return;
            }

            if (action === 'select') {
                if (typeof setSelectedBackgroundDesign !== 'function') {
                    setCoinStageMessage('背景デザイン設定を利用できません。');
                    return;
                }

                const result = setSelectedBackgroundDesign(designKey);
                if (!result || !result.ok) {
                    setCoinStageMessage('未所持の背景デザインは選択できません。');
                    renderCoinStageProfile();
                    return;
                }

                if (GameState?.settings) {
                    GameState.settings.backgroundDesign = designKey;
                }
                if (typeof applyRuntimeSettings === 'function') applyRuntimeSettings();
                if (typeof updateUI === 'function' && gameStartedOnce) updateUI();

                renderCoinStageProfile();
                setCoinStageMessage(`背景デザイン「${designName}」を使用中にしました。`);
            }
        });
    }

    if (userResetButton) {
        userResetButton.addEventListener('click', () => {
            if (typeof resetUserProfile !== 'function') return;
            resetUserProfile();
            if (GameState?.settings) {
                GameState.settings.backgroundDesign = 'default';
            }
            if (typeof applyRuntimeSettings === 'function') applyRuntimeSettings();
            if (typeof updateUI === 'function' && gameStartedOnce) updateUI();
            renderUserStageProfile();
            renderCoinStageProfile();
            setCharacterChoice(getPreferredStartCharacterId());
            selectedStartSkillKey = getPreferredStartSkillKey();
            renderStartSkillSelection();
            setUserStageMessage('ユーザー情報を初期化しました。');
        });
    }

    galleryFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const type = button.getAttribute('data-gallery-type') || 'characters';
            renderStartGallery(type);
        });
    });

    setCharacterChoice(getPreferredStartCharacterId());
    selectedStartSkillKey = getPreferredStartSkillKey();
    selectedCpuPersonality = normalizeStartCpuPersonality(GameState?.settings?.cpuPersonality || selectedCpuPersonality);
    syncStartCpuPersonalitySelect();
    renderStartSkillSelection();
    renderStartSkillRules();
    setStartMenuMessage(STARTUP_IMAGE_CACHE_NOTICE);
    setFriendRoomMessage('');
    setCoinStageMessage('');
    setUserStageMessage('');
    setStartSkillMessage('');
    renderUserStageProfile();
    renderCoinStageProfile();
    renderStartGallery('characters');
    resetTurnStage();
    setCpuSetupStep(1);
    updateResumeMatchButtonVisibility();
    showStartStage('start-title-stage');

    if (startTitleTimer) {
        clearTimeout(startTitleTimer);
        startTitleTimer = null;
    }

    startTitleTimer = setTimeout(() => {
        if (overlay.classList.contains('hidden')) return;
        showStartStage('start-menu-stage');
    }, 900);
}

function showResultOverlay(text, type) {
    const overlay = document.getElementById('result-overlay');
    const resultText = document.getElementById('result-text');
    if (!overlay || !resultText) return;

    overlay.classList.remove('hidden', 'win', 'lose');
    overlay.classList.add(type);
    const missionText = GameState.missionResultText || '';
    const missionBlock = document.getElementById('result-mission');
    const missionImage = document.getElementById('result-mission-image');
    const missionLabel = document.getElementById('result-mission-label');
    const missionDetail = document.getElementById('result-mission-detail');
    const cleared = missionText.startsWith('ミッションクリア');
    const mission = window.Missions?.getDefinition(GameState.activeMissionId);
    resultText.textContent = missionText ? (type === 'win' ? '勝利！' : '敗北…') : text;
    missionBlock?.classList.toggle('hidden', !missionText);
    missionBlock?.classList.toggle('is-clear', cleared);
    if (missionLabel) missionLabel.textContent = cleared ? 'ミッションクリア！' : missionText;
    if (missionDetail) missionDetail.textContent = cleared
        ? (missionText.includes('獲得済み') ? '（獲得済み）' : `『${mission?.sleeveName || ''}』を獲得しました`) : '';
    if (missionImage) {
        missionImage.hidden = !cleared || !mission;
        if (cleared && mission) {
            missionImage.src = window.Missions.sleevePath(mission.id);
            missionImage.alt = mission.sleeveName;
        }
    }
    document.getElementById('result-retry-button')?.classList.toggle('hidden', !GameState.activeMissionId);
    document.querySelector('.result-actions')?.classList.toggle('mission-result', !!GameState.activeMissionId);
    renderMatchResultSummary();
    document.getElementById('final-field-actions')?.classList.add('hidden');
    if (typeof playResultBGM === 'function') playResultBGM();
}

function formatMatchDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
}

function appendDishSummary(parent, title, player) {
    const section = document.createElement('section');
    section.className = 'result-dish-section';
    const heading = document.createElement('h3');
    const history = Array.isArray(player?.cookedRecipes) ? player.cookedRecipes : [];
    heading.textContent = `${title}（${history.length}品）`;
    section.appendChild(heading);
    if (history.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = '料理なし';
        section.appendChild(empty);
    } else {
        const list = document.createElement('ol');
        for (const dish of [...history].reverse()) {
            const item = document.createElement('li');
            item.textContent = `${dish.name || '料理'}　${Number(dish.points) || 0}点`;
            list.appendChild(item);
        }
        section.appendChild(list);
    }
    parent.appendChild(section);
}

function renderMatchResultSummary() {
    const container = document.getElementById('result-summary');
    if (!container) return;
    container.replaceChildren();
    const model = getBattleViewModel();
    const endedAt = Number(GameState.matchEndedAt) || Date.now();
    const startedAt = Number(GameState.matchStartedAt) || endedAt;
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = `対戦時間 ${formatMatchDuration(endedAt - startedAt)}　最終得点 ${model.me.score} - ${model.opponent.score}`;
    container.appendChild(meta);
    const playerIdentity = document.createElement('div');
    playerIdentity.className = 'result-player-identity';
    const playerIcon = document.createElement('div');
    playerIcon.className = `character-icon char-${model.me.characterId || 'chizuru'} face-normal`;
    window.Achievements?.applyFrame(playerIcon, model.online ? model.me : undefined);
    playerIdentity.appendChild(playerIcon);
    const playerName = document.createElement('span');
    playerName.textContent = GameState.storyEpisodeId ? model.me.characterName : window.Achievements?.displayName(model.me.name || window.getUserProfile?.().name, model.online ? model.me : undefined) || model.me.characterName;
    playerIdentity.appendChild(playerName);
    container.appendChild(playerIdentity);
    if (GameState.specialWinReason) {
        const reason = document.createElement('div');
        reason.className = 'result-reason';
        reason.textContent = `決着: ${GameState.specialWinReason}`;
        container.appendChild(reason);
    }
    const dishes = document.createElement('div');
    dishes.className = 'result-dish-grid';
    appendDishSummary(dishes, GameState.storyEpisodeId ? model.me.characterName + 'の料理' : 'あなたの料理', model.me);
    appendDishSummary(dishes, `${model.opponentLabel}の料理`, model.opponent);
    container.appendChild(dishes);
    window.Achievements?.renderResult(container, GameState);
}

function returnToFinalField() {
    const overlay = document.getElementById('result-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.getElementById('final-field-actions')?.classList.remove('hidden');
    if (typeof stopBGM === 'function') stopBGM();
}

async function finishCompletedMatch() {
    if (window.StoryAdv?.finishBattleReturn()) return;
    if (!GameState.gameEnded) return;
    const exitButtons = [document.getElementById('result-exit-button'), document.getElementById('final-field-exit-button')];
    exitButtons.forEach(button => { if (button) button.disabled = true; });
    try {
        if (isFriendBattleActive()) await window.FriendBattle.leaveRoom();
    } catch (error) {
        exitButtons.forEach(button => { if (button) button.disabled = false; });
        const text = document.getElementById('result-text');
        if (text) text.textContent = '退出できませんでした。もう一度お試しください。';
        await window.StageLayout?.alert?.('部屋を退出できませんでした。通信を確認してもう一度お試しください。');
        return;
    }
    clearSavedMatch();
    hideResultOverlay();
    hideSpotlightCard();
    if (typeof closePackShop === 'function') closePackShop();
    if (typeof stopBGM === 'function') stopBGM();
    gameStartedOnce = false;
    if (typeof initGame === 'function') initGame();
    updateUI();
    const overlay = document.getElementById('start-overlay');
    overlay?.classList.remove('hidden');
    updateResumeMatchButtonVisibility();
    if (typeof window.openStoryStage === 'function' && window.__storyResultPending) {
        window.openStoryStage();
    } else {
        showStartStage('start-menu-stage');
    }
}

async function retryMissionMatch() {
    const id = GameState.activeMissionId;
    if (!id) return;
    await finishCompletedMatch();
    window.startMissionCpuSetup?.(id);
}

function showPlayerSkillDetails() {
    const skill = typeof getSelectedSkillDefinitionForSide === 'function'
        ? getSelectedSkillDefinitionForSide('player') : null;
    if (!skill) return;
    const player = getBattleViewModel().me;
    const used = Number(player?.skillUseCounts?.[skill.key] || 0);
    const maxUses = Math.max(1, Number(skill.maxUses) || 1);
    showSpotlightCard({
        badge: 'スキル詳細',
        name: skill.name,
        sub: `条件: ${skill.condition || 'なし'}\n効果: ${skill.effect || 'なし'}\n使用回数: ${used}/${maxUses}`,
        imagePath: getSkillCutinImagePathForSide('player'),
        kind: 'skill',
        durationMs: 6000
    });
}

function showFieldPackDetails(packDef, owned) {
    if (!packDef) return;
    const imagePath = window.getPackImagePath ? window.getPackImagePath(packDef.key) : null;
    showSpotlightCard({
        badge: '加工アイテム効果',
        name: packDef.name,
        sub: `所持状況: ${owned ? '所持' : '未所持'}\n効果: ${typeof getDetailedPackEffectText === 'function' ? getDetailedPackEffectText(packDef.key) : (packDef.description || '加工アイテム')}`,
        imagePath,
        kind: 'pack',
        durationMs: 6000
    });
}

function prepareMatchFinale(winner) {
    const sequence = ++matchFinaleSequence;
    updateBattleMenu();
    if (GameState.surrenderedBy) {
        window.cancelPendingCookSfx?.();
        if (matchFinaleTimer) clearTimeout(matchFinaleTimer);
        hideSpotlightCard();
        showResultOverlay(buildWinnerText(winner), winner === 'player' ? 'win' : 'lose');
        return;
    }
    if (matchFinaleTimer) clearTimeout(matchFinaleTimer);
    const overlay = document.getElementById('result-overlay');
    const button = document.getElementById('final-field-actions');
    overlay?.classList.add('hidden');
    button?.classList.add('hidden');
    const latest = GameState.players?.[winner]?.cookedRecipes?.[0];
    const finalDish = latest?.fromEvent && Number(latest.cookedAt) >= Number(GameState.lastCookedRecipe?.cookedAt || 0)
        ? latest
        : (GameState.lastCookedRecipe?.side === winner ? GameState.lastCookedRecipe : null);
    const match = GameState.matchStartedAt;
    const complete = status => {
        if (status?.cancelled || sequence !== matchFinaleSequence || GameState.matchStartedAt !== match || !GameState.gameEnded || !isMatchInBattleScreen()) return;
        button?.classList.remove('hidden');
        if (typeof playSfx === 'function') playSfx('gameEnd');
    };
    if (finalDish && window.DishEffects) {
        hideSpotlightCard();
        window.DishEffects.show(finalDish, { side: winner, winning: true }).then(complete);
        return;
    }
    const waitMs = finalDish ? 3000 : 1200;
    if (finalDish) showSpotlightCard({ badge: '決着の一皿！', name: finalDish.name,
        sub: `${finalDish.points}点　この料理が勝負を決めた！`,
        imagePath: window.getRecipeImagePath?.(finalDish.name), kind: 'final-recipe', durationMs: waitMs });
    matchFinaleTimer = setTimeout(() => { hideSpotlightCard(); complete(); }, waitMs);
}

function hideResultOverlay() {
    matchFinaleSequence++;
    const overlay = document.getElementById('result-overlay');
    if (!overlay) return;

    overlay.classList.add('hidden');
    overlay.classList.remove('win', 'lose');
    document.getElementById('final-field-actions')?.classList.add('hidden');

    if (matchFinaleTimer) {
        clearTimeout(matchFinaleTimer);
        matchFinaleTimer = null;
    }

    if (resultOverlayTimer) {
        clearTimeout(resultOverlayTimer);
        resultOverlayTimer = null;
    }
}

function getCharacterIdForSide(side) {
    const safeSide = side === 'cpu' ? 'cpu' : 'player';
    const ids = GameState?.characterIds || {};
    return ids[safeSide] || (safeSide === 'player' ? 'chizuru' : 'mai');
}

function getCharacterNameForSide(side) {
    const safeSide = side === 'cpu' ? 'cpu' : 'player';
    const names = GameState?.characterNames || {};
    return names[safeSide] || (safeSide === 'player' ? 'あなた' : 'CPU');
}

function getSkillCutinImagePathForSide(side) {
    const characterId = getCharacterIdForSide(side);
    return BattleImages.lightPath(SKILL_CUTIN_IMAGE_PATHS[characterId] || SKILL_CUTIN_IMAGE_PATHS.chizuru);
}

function getBattleModeCutinImagePathForSide(side) {
    const characterId = getCharacterIdForSide(side);
    return BattleImages.lightPath(BATTLE_MODE_CUTIN_IMAGE_PATHS[characterId] || BATTLE_MODE_CUTIN_IMAGE_PATHS.chizuru);
}

function resolveSpotlightDisplayMs(durationMs) {
    const parsed = Number(durationMs);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    return SPOTLIGHT_DISPLAY_MS;
}

function showSpotlightCard({ badge, name, sub, imagePath, kind, durationMs }) {
    const overlay = document.getElementById('spotlight-overlay');
    const badgeEl = document.getElementById('spotlight-badge');
    const cardEl = document.getElementById('spotlight-card');
    const artEl = document.getElementById('spotlight-art');
    const nameEl = document.getElementById('spotlight-name');
    const subEl = document.getElementById('spotlight-sub');

    if (!overlay || !badgeEl || !cardEl || !artEl || !nameEl || !subEl) return;

    if (spotlightTimer) {
        clearTimeout(spotlightTimer);
        spotlightTimer = null;
    }

    const cardKind = kind || 'recipe';
    const isBattleModeLike = cardKind === 'battle-mode' || cardKind === 'battle-mode-text';
    const isSkillLike = cardKind === 'skill' || isBattleModeLike;
    const isFinale = cardKind.includes('final-recipe');
    const isLegendary = cardKind.includes('legendary');
    const waitMs = resolveSpotlightDisplayMs(durationMs);
    overlay.classList.remove('spotlight-skill', 'spotlight-battle-mode', 'spotlight-finale', 'spotlight-legendary');
    overlay.classList.toggle('spotlight-skill', isSkillLike);
    overlay.classList.toggle('spotlight-battle-mode', isBattleModeLike);
    overlay.classList.toggle('spotlight-finale', isFinale);
    overlay.classList.toggle('spotlight-legendary', isLegendary);
    overlay.classList.remove('hidden');
    cardEl.classList.remove('event', 'recipe', 'pack', 'skill', 'battle-mode', 'battle-mode-text', 'final-recipe', 'legendary');
    cardEl.classList.add(...cardKind.split(/\s+/).filter(Boolean));

    badgeEl.textContent = badge || '';
    nameEl.textContent = name || '';
    subEl.textContent = sub || '';
    artEl.style.backgroundImage = imagePath ? `url("${imagePath}")` : 'none';

    spotlightHideAt = Date.now() + waitMs;
    spotlightTimer = setTimeout(() => {
        hideSpotlightCard();
    }, waitMs);
}

function hideSpotlightCard() {
    const overlay = document.getElementById('spotlight-overlay');
    if (!overlay) return;

    overlay.classList.add('hidden');
    overlay.classList.remove('spotlight-skill', 'spotlight-battle-mode', 'spotlight-finale', 'spotlight-legendary');
    spotlightHideAt = 0;

    if (spotlightTimer) {
        clearTimeout(spotlightTimer);
        spotlightTimer = null;
    }
}

function showSpotlightCardAsync(config) {
    const waitMs = resolveSpotlightDisplayMs(config?.durationMs);
    showSpotlightCard(config);
    return new Promise(resolve => {
        setTimeout(() => resolve(), waitMs);
    });
}

function showSpotlightEventCard(eventCard) {
    const imagePath = window.getEventImagePath ? window.getEventImagePath(eventCard.name) : null;
    showSpotlightCard({
        badge: 'イベントカード発動',
        name: eventCard.name,
        sub: eventCard.description || '',
        imagePath,
        kind: 'event'
    });
}

function showSpotlightEventCardAsync(eventCard) {
    const imagePath = window.getEventImagePath ? window.getEventImagePath(eventCard.name) : null;
    return showSpotlightCardAsync({
        badge: 'イベントカード発動',
        name: eventCard.name,
        sub: eventCard.description || '',
        imagePath,
        kind: 'event'
    });
}

function showSpotlightSkillCutin(side, skill) {
    const safeSide = side === 'cpu' ? 'cpu' : 'player';
    const actorName = getCharacterNameForSide(safeSide);
    const imagePath = getSkillCutinImagePathForSide(safeSide);
    showSpotlightCard({
        badge: `${actorName} スキル発動！`,
        name: skill?.name || 'スキル',
        sub: skill?.effect || 'スキル効果が発動しました。',
        imagePath,
        kind: 'skill'
    });
}

function showSpotlightSkillCutinAsync(side, skill) {
    const safeSide = side === 'cpu' ? 'cpu' : 'player';
    const actorName = getCharacterNameForSide(safeSide);
    const imagePath = getSkillCutinImagePathForSide(safeSide);
    return showSpotlightCardAsync({
        badge: `${actorName} スキル発動！`,
        name: skill?.name || 'スキル',
        sub: skill?.effect || 'スキル効果が発動しました。',
        imagePath,
        kind: 'skill'
    });
}

async function playBattleALaCarteModeCutinSequence(side) {
    const safeSide = side === 'cpu' ? 'cpu' : 'player';
    const imagePath = getBattleModeCutinImagePathForSide(safeSide);
    const badge = 'BATTLE A LA CARTE MODE';

    await showSpotlightCardAsync({
        badge,
        name: '潜在覚醒！',
        sub: '',
        imagePath: null,
        kind: 'battle-mode-text',
        durationMs: BATTLE_MODE_TEXT_STEP1_MS
    });

    await showSpotlightCardAsync({
        badge,
        name: 'すべての食材に感謝！',
        sub: '',
        imagePath: null,
        kind: 'battle-mode-text',
        durationMs: BATTLE_MODE_TEXT_STEP2_MS
    });

    await showSpotlightCardAsync({
        badge,
        name: 'バトルアラカルトモード！！',
        sub: '',
        imagePath,
        kind: 'battle-mode',
        durationMs: BATTLE_MODE_CUTIN_IMAGE_MS
    });
}

function showBattleALaCarteModeCutin(side) {
    playBattleALaCarteModeCutinSequence(side).catch(() => {});
}

function showBattleALaCarteModeCutinAsync(side) {
    return playBattleALaCarteModeCutinSequence(side);
}

function showSpotlightRecipeCard(recipe) {
    if (window.DishEffects) return window.DishEffects.show(recipe);
    const imagePath = window.getRecipeImagePath ? window.getRecipeImagePath(recipe.name) : null;
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1200;
    setTimeout(() => {
        if (GameState.gameEnded) return;
        showSpotlightCard({
            badge: '料理完成！',
            name: recipe.name,
            sub: `${recipe.points}点`,
            imagePath,
            kind: 'recipe'
        });
    }, delay);
}

function showSpotlightRecipeCardAsync(recipe) {
    if (window.DishEffects) return window.DishEffects.show(recipe);
    const imagePath = window.getRecipeImagePath ? window.getRecipeImagePath(recipe.name) : null;
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1200;
    return new Promise(resolve => {
        setTimeout(() => {
            if (GameState.gameEnded) { resolve(); return; }
            showSpotlightCardAsync({
                badge: '料理完成！',
                name: recipe.name,
                sub: `${recipe.points}点`,
                imagePath,
                kind: 'recipe'
            }).then(resolve);
        }, delay);
    });
}

function showSpotlightPackCard(packDef) {
    const imagePath = window.getPackImagePath ? window.getPackImagePath(packDef.key) : null;
    showSpotlightCard({
        badge: '加工アイテム交換！',
        name: packDef.name,
        sub: packDef.description || `${packDef.cost}点で交換`,
        imagePath,
        kind: 'pack'
    });
}

function showSpotlightPackCardAsync(packDef) {
    const imagePath = window.getPackImagePath ? window.getPackImagePath(packDef.key) : null;
    return showSpotlightCardAsync({
        badge: '加工アイテム交換！',
        name: packDef.name,
        sub: packDef.description || `${packDef.cost}点で交換`,
        imagePath,
        kind: 'pack'
    });
}

function buildWinnerText(winner) {
    if (GameState.surrenderedBy) return GameState.surrenderedBy === 'player'
        ? '降参しました。あなたの敗北です。' : '相手が降参しました。あなたの勝利です！';
    const reason = GameState.specialWinReason;
    if (winner === 'player') {
        return reason ? `勝利！\n${reason}` : '勝利！';
    }
    return reason ? `敗北\n${reason}` : '敗北';
}

function isSpotlightVisible() {
    const overlay = document.getElementById('spotlight-overlay');
    return !!overlay && !overlay.classList.contains('hidden');
}

function getSpotlightRemainingMs() {
    return Math.max(0, spotlightHideAt - Date.now());
}

function endGame(winner) {
    if (GameState.gameEnded) return;
    GameState.gameEnded = true;
    GameState.winner = winner || null;
    GameState.matchEndedAt = Date.now();
    GameState.missionResultText = window.Missions?.complete(GameState, winner) || '';
    observeAchievementScores();
    window.Achievements?.observeMatch(GameState);
    clearSavedMatch();
    GameState.currentTurn = null;
    GameState.currentPhase = 'ゲーム終了';
    GameState.selectionMode = null;
    GameState.pendingEventContext = null;
    GameState.pendingSkillContext = null;
    GameState.selectedTargetIds = [];
    GameState.pendingSetCardId = null;
    GameState.pendingEventCardId = null;
    GameState.pendingViewSetCardId = null;
    GameState.pendingPackKey = null;
    GameState.pendingIngredientAction = null;

    if (GameState.ui) {
        GameState.ui.pileViewType = null;
    }

    setCPUStatus('');
    hideDiscardBanner();

    const opponentLabel = getOpponentLabelText();
    if (GameState.surrenderedBy) {
        addLog(buildWinnerText(winner));
    } else if (winner === 'player') {
        addLog(GameState.specialWinReason ? `あなたの特殊勝利: ${GameState.specialWinReason}` : 'あなたの勝利です！');
    } else {
        addLog(GameState.specialWinReason ? `${opponentLabel}の特殊勝利: ${GameState.specialWinReason}` : `${opponentLabel}の勝利です。`);
    }

    if (typeof recordMatchResult === 'function') {
        const reward = recordMatchResult(winner === 'player', { noCoins: GameState.surrenderedBy === 'player' });
        if (reward && reward.coinsGained > 0) {
            addLog(`コイン +${reward.coinsGained}（所持: ${reward.profile.coins}）`);
        }
    }

    if (typeof setBattleModeBgmLocked === 'function') {
        setBattleModeBgmLocked(false);
    }
    if (typeof stopBGM === 'function') {
        stopBGM();
    }
    updateUI();
    prepareMatchFinale(winner);

    if (typeof window.handleStoryBattleEnded === 'function') {
        window.handleStoryBattleEnded(winner);
    }
}

document.addEventListener('DOMContentLoaded', setupStartOverlay);
window.addEventListener('load', () => {
    try {
        if (gameStartedOnce) {
            hardRepairGameState();
            updateUI();
        }
    } catch (e) {
        console.error('window load repair failed', e);
    }
});

window.endGame = endGame;
window.showSpotlightEventCard = showSpotlightEventCard;
window.showSpotlightEventCardAsync = showSpotlightEventCardAsync;
window.showSpotlightSkillCutin = showSpotlightSkillCutin;
window.showSpotlightSkillCutinAsync = showSpotlightSkillCutinAsync;
window.showBattleALaCarteModeCutin = showBattleALaCarteModeCutin;
window.showBattleALaCarteModeCutinAsync = showBattleALaCarteModeCutinAsync;
window.showSpotlightRecipeCard = showSpotlightRecipeCard;
window.showSpotlightRecipeCardAsync = showSpotlightRecipeCardAsync;
window.showFieldPackDetails = showFieldPackDetails;
window.showPlayerSkillDetails = showPlayerSkillDetails;
window.prepareMatchFinale = prepareMatchFinale;
window.hideResultOverlay = hideResultOverlay;
window.showSpotlightPackCard = showSpotlightPackCard;
window.showSpotlightPackCardAsync = showSpotlightPackCardAsync;
window.__battleSafeStartGame = safeStartGame;
window.__battleStartBgmOnce = () => {
    if (typeof unlockAudio === 'function') unlockAudio();
    startBgmOnce();
};
window.__showStartStage = showStartStage;
window.startStoryCpuBattle = (episode, skillKey) => {
    storyPreviousCpuPersonality = GameState.settings?.cpuPersonality || 'default';
    gameStartedOnce = false; pendingMissionId = null;
    window.__storyResultPending = false;
    beginMatchByRole(Math.random() < 0.5 ? '先攻' : '後攻', { episode, skillKey });
};
window.resetStoryBattleContext = () => {
    window.__storyActiveEpisodeId = null;
    GameState.storyEpisodeId = null; GameState.achievementStory = false;
    window.cancelPendingCookSfx?.(); hideResultOverlay(); hideSpotlightCard();
    if (typeof closePackShop === 'function') closePackShop();
    if (typeof stopBGM === 'function') stopBGM();
    gameStartedOnce = false;
    // Fresh match identity prevents delayed CPU actions from reaching the next battle.
    if (typeof initGame === 'function') initGame();
    if (storyPreviousCpuPersonality != null && GameState.settings) GameState.settings.cpuPersonality = storyPreviousCpuPersonality;
    storyPreviousCpuPersonality = null;
};
window.getOpponentLabelText = getOpponentLabelText;

function updateBattleMenu() {
    const button = document.getElementById('battle-menu-button');
    if (!button) return;
    button.disabled = !shouldGuardMatchExit();
    if (button.disabled) {
        document.getElementById('battle-menu-panel').hidden = true;
        button.setAttribute('aria-expanded', 'false');
        const dialog = document.getElementById('surrender-dialog');
        if (dialog.open) dialog.close();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('battle-menu-button');
    const panel = document.getElementById('battle-menu-panel');
    const dialog = document.getElementById('surrender-dialog');
    dialog.addEventListener('close', () => {
        document.getElementById('game-container').inert = false;
        const onlineBar = document.getElementById('online-bar');
        if (onlineBar) onlineBar.inert = false;
    });
    button.addEventListener('click', () => {
        updateBattleMenu();
        if (button.disabled) return;
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.getElementById('open-surrender-button').addEventListener('click', () => {
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (shouldGuardMatchExit()) {
            dialog.show();
            document.getElementById('game-container').inert = true;
            const onlineBar = document.getElementById('online-bar');
            if (onlineBar) onlineBar.inert = true;
        }
    });
    document.getElementById('cancel-surrender-button').addEventListener('click', () => dialog.close());
    document.getElementById('confirm-surrender-button').addEventListener('click', () => {
        dialog.close();
        if (shouldGuardMatchExit()) window.playerSurrender();
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.battle-menu')) {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && dialog.open) {
            dialog.close();
            return;
        }
        if (event.key === 'Escape' && !panel.hidden) {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            button.focus();
        }
    });
    updateBattleMenu();
});
