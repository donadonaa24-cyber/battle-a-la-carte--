function createPlayerState() {
    return {
        hand: [],
        set: [],
        events: [],
        packs: [],
        score: 0,
        knifeSelectedName: null,
        knifeUsedThisTurn: false,
        usedEventThisTurn: false,
        extraEventUsesRemainingThisTurn: 0,
        lockedCookingThisTurn: false,
        cookedRecipes: [],
        cookedMeatTypes: [],
        recipesCookedThisTurn: 0,
        battleALaCarteModeActive: false,
        battleALaCarteModeBonusDrawUsedThisTurn: false,
        battleALaCarteModeDiscardPickupUsedThisTurn: false,
        startedTurnBehindThisTurn: false,
        selectedSkillKey: null,
        skillUseCounts: {}
    };
}

function createGameSettings() {
    return {
        cpuSpeed: 'default',
        cpuPersonality: 'default',
        backgroundTheme: 'default',
        backgroundDesign: 'default',
        bgmEnabled: true,
        bgmTrack: 'default',
        bgmVolume: 0.8
    };
}

const SKILL_DEFINITIONS = [
    {
        key: 'lastOrder',
        name: 'ラストオーダー',
        condition: '相手が8点以上で、自分より得点が高い',
        effect: 'イベント1枚を捨てる。このターン、イベントカードを追加で1回使える。',
        maxUses: 1,
        requiresEventDiscard: true
    },
    {
        key: 'kitchenInfiltration',
        name: '厨房潜入',
        condition: '自分の得点が相手より低く、かつ5点以下',
        effect: 'イベント1枚を捨てる。相手セット1枚と自分手札1枚を交換する。',
        maxUses: 1,
        requiresEventDiscard: true
    },
    {
        key: 'makanaiSupply',
        name: 'まかない補給',
        condition: '相手が5点以上で、自分の料理履歴が0件',
        effect: '山札から2枚引く。',
        maxUses: 1,
        requiresEventDiscard: false
    },
    {
        key: 'foodTrap',
        name: '食材トラップ',
        condition: '自分が3点以下で、相手セットに空きがある',
        effect: '自分の材料1枚を相手セットに公開配置（相手は料理に使えない）。',
        maxUses: 1,
        requiresEventDiscard: false
    },
    {
        key: 'aceProcurement',
        name: '切り札調達',
        condition: '相手が8点以上',
        effect: '山札から材料カード1枚を選んで手札に加える。',
        maxUses: 1,
        requiresEventDiscard: false
    },
    {
        key: 'tasteThief',
        name: '味見泥棒',
        condition: '自分の得点が0点で、相手が1点以上',
        effect: 'イベント1枚を捨てる。相手-1点、自分+1点。',
        maxUses: 2,
        requiresEventDiscard: true
    }
];

const CPU_PERSONALITY_OPTIONS = [
    { key: 'default', label: '標準' },
    { key: 'balance', label: 'バランス型' },
    { key: 'disrupt', label: '妨害型' },
    { key: 'comeback', label: '逆転型' }
];

const CPU_PERSONALITY_SKILL_PRIORITY = {
    default: ['makanaiSupply', 'aceProcurement', 'lastOrder', 'tasteThief', 'kitchenInfiltration', 'foodTrap'],
    balance: ['makanaiSupply', 'aceProcurement', 'lastOrder', 'tasteThief', 'kitchenInfiltration', 'foodTrap'],
    disrupt: ['kitchenInfiltration', 'foodTrap', 'tasteThief', 'lastOrder', 'makanaiSupply', 'aceProcurement'],
    comeback: ['lastOrder', 'tasteThief', 'aceProcurement', 'makanaiSupply', 'kitchenInfiltration', 'foodTrap']
};

function getSkillDefinitions() {
    return SKILL_DEFINITIONS;
}

function getSkillDefinitionByKey(skillKey) {
    return SKILL_DEFINITIONS.find(item => item.key === skillKey) || null;
}

function getCpuPersonalityOptions() {
    return CPU_PERSONALITY_OPTIONS;
}

function normalizeCpuPersonalityKey(key) {
    const value = String(key || 'default');
    return CPU_PERSONALITY_OPTIONS.some(item => item.key === value) ? value : 'default';
}

function getCpuPersonalitySkillPriority(personalityKey) {
    const key = normalizeCpuPersonalityKey(personalityKey);
    return CPU_PERSONALITY_SKILL_PRIORITY[key] || CPU_PERSONALITY_SKILL_PRIORITY.default;
}

function ensurePlayerSkillState(player) {
    if (!player || typeof player !== 'object') return;

    if (!player.selectedSkillKey || !getSkillDefinitionByKey(player.selectedSkillKey)) {
        player.selectedSkillKey = null;
    }

    if (!player.skillUseCounts || typeof player.skillUseCounts !== 'object' || Array.isArray(player.skillUseCounts)) {
        player.skillUseCounts = {};
    }

    if (!Number.isFinite(Number(player.extraEventUsesRemainingThisTurn))) {
        player.extraEventUsesRemainingThisTurn = 0;
    } else {
        player.extraEventUsesRemainingThisTurn = Math.max(0, Math.floor(Number(player.extraEventUsesRemainingThisTurn)));
    }

    if (typeof player.battleALaCarteModeActive !== 'boolean') {
        player.battleALaCarteModeActive = false;
    }
    if (typeof player.battleALaCarteModeBonusDrawUsedThisTurn !== 'boolean') {
        player.battleALaCarteModeBonusDrawUsedThisTurn = false;
    }
    if (typeof player.battleALaCarteModeDiscardPickupUsedThisTurn !== 'boolean') {
        player.battleALaCarteModeDiscardPickupUsedThisTurn = false;
    }
}

function getPlayerSkillUseCount(player, skillKey) {
    ensurePlayerSkillState(player);
    if (!skillKey) return 0;

    const raw = Number(player.skillUseCounts[skillKey] || 0);
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function setPlayerSelectedSkill(player, skillKey) {
    ensurePlayerSkillState(player);
    const def = getSkillDefinitionByKey(skillKey);
    player.selectedSkillKey = def ? def.key : null;
    player.skillUseCounts = {};
    player.extraEventUsesRemainingThisTurn = 0;
}

const GameState = {
    deck: [],
    discard: [],
    players: {
        player: createPlayerState(),
        cpu: createPlayerState()
    },
    currentTurn: 'player',
    currentPhase: 'メインフェイズ',
    selectionMode: null,
    discardNeedCount: 0,
    selectedCardIds: [],
    candidateRecipes: [],
    gameEnded: false,
    winner: null,
    matchStartedAt: null,
    matchEndedAt: null,
    lastCookedRecipe: null,
    pendingEventContext: null,
    pendingSkillContext: null,
    pendingSkillConfirm: null,
    selectedTargetIds: [],
    pendingSetCardId: null,
    pendingEventCardId: null,
    pendingViewSetCardId: null,
    pendingPackKey: null,
    pendingIngredientAction: null,
    pendingKnifeOptions: [],
    openDishHistoryFor: null,
    specialWinReason: null,
    characterSides: {
        player: 'player',
        cpu: 'cpu'
    },
    characterIds: {
        player: 'chizuru',
        cpu: 'mai'
    },
    characterNames: {
        player: '千鶴',
        cpu: '舞依'
    },
    settings: createGameSettings(),
    ui: {
        pileConfirmType: null,
        pileViewType: null,
        infoOverlayType: null
    }
};

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
    }
}

function resetPlayerState(player) {
    player.hand = [];
    player.set = [];
    player.events = [];
    player.packs = [];
    player.score = 0;
    player.knifeSelectedName = null;
    player.knifeUsedThisTurn = false;
    player.usedEventThisTurn = false;
    player.extraEventUsesRemainingThisTurn = 0;
    player.lockedCookingThisTurn = false;
    player.cookedRecipes = [];
    player.cookedMeatTypes = [];
    player.recipesCookedThisTurn = 0;
    player.battleALaCarteModeActive = false;
    player.battleALaCarteModeBonusDrawUsedThisTurn = false;
    player.battleALaCarteModeDiscardPickupUsedThisTurn = false;
    player.startedTurnBehindThisTurn = false;
    player.selectedSkillKey = null;
    player.skillUseCounts = {};
}

function resetUiState() {
    GameState.selectionMode = null;
    GameState.discardNeedCount = 0;
    GameState.selectedCardIds = [];
    GameState.candidateRecipes = [];
    GameState.gameEnded = false;
    GameState.winner = null;
    GameState.matchStartedAt = Date.now();
    GameState.matchEndedAt = null;
    GameState.lastCookedRecipe = null;
    GameState.pendingEventContext = null;
    GameState.pendingSkillContext = null;
    GameState.pendingSkillConfirm = null;
    GameState.selectedTargetIds = [];
    GameState.pendingSetCardId = null;
    GameState.pendingEventCardId = null;
    GameState.pendingViewSetCardId = null;
    GameState.pendingPackKey = null;
    GameState.pendingIngredientAction = null;
    GameState.pendingKnifeOptions = [];
    GameState.openDishHistoryFor = null;
    GameState.specialWinReason = null;
    GameState.ui = {
        pileConfirmType: null,
        pileViewType: null,
        infoOverlayType: null
    };
}

function markTurnStartStatus(currentPlayer, opponentPlayer) {
    ensurePlayerSkillState(currentPlayer);
    currentPlayer.recipesCookedThisTurn = 0;
    currentPlayer.battleALaCarteModeBonusDrawUsedThisTurn = false;
    currentPlayer.battleALaCarteModeDiscardPickupUsedThisTurn = false;
    currentPlayer.startedTurnBehindThisTurn = currentPlayer.score < opponentPlayer.score;
    currentPlayer.extraEventUsesRemainingThisTurn = 0;
}

function ensureDeckExists() {
    if (!Array.isArray(GameState.deck)) {
        GameState.deck = [];
    }
    if (!Array.isArray(GameState.discard)) {
        GameState.discard = [];
    }
}

function reshuffleDiscardIntoDeckIfNeeded() {
    if (GameState.deck.length > 0) return true;
    if (GameState.discard.length === 0) return false;

    GameState.deck = GameState.discard.splice(0);
    shuffle(GameState.deck);
    return true;
}

function drawOneResolved(player) {
    ensureDeckExists();
    if (!reshuffleDiscardIntoDeckIfNeeded()) return null;

    const card = GameState.deck.pop();
    if (!card) return null;

    if (card.type === 'ingredient') {
        player.hand.push(card);
    } else if (card.type === 'event') {
        player.events.push(card);
    }

    return card;
}

function getTargetTotalHandSize(player) {
    return hasPack(player, 'board') ? 6 : 5;
}

function getCurrentTotalHandCount(player) {
    return player.hand.length + player.events.length;
}

function getSetLimit(player) {
    return hasPack(player, 'freezer') ? 3 : 2;
}

function getEndPhaseHandLimit(player) {
    return hasPack(player, 'ecoBag') ? 3 : 2;
}

function drawUntilTargetHand(player) {
    const target = getTargetTotalHandSize(player);
    let safety = 0;

    while (getCurrentTotalHandCount(player) < target && safety < 300) {
        const card = drawOneResolved(player);
        if (!card) break;
        safety++;
    }
}

function moveCardToDiscard(card) {
    if (!card) return;
    GameState.discard.push(card);
}

function hasPack(player, packKey) {
    return player.packs.some(pack => pack.key === packKey);
}

function getPackDefinition(packKey) {
    return packDefinitions.find(pack => pack.key === packKey) || null;
}

function canBuyPack(player, packKey) {
    const def = getPackDefinition(packKey);
    if (!def) return false;
    if (player.score < def.cost) return false;
    if (hasPack(player, packKey)) return false;
    return true;
}

function buyPack(player, packKey) {
    const def = getPackDefinition(packKey);
    if (!def) return false;
    if (!canBuyPack(player, packKey)) return false;

    player.score -= def.cost;
    player.packs.push({
        key: def.key,
        name: def.name,
        description: def.description
    });
    return true;
}

function getIronChefReason(player) {
    if (player.score < 7) return null;

    const requiredMeats = ['鶏肉', '豚肉', '牛肉', '魚'];
    const hasAll = requiredMeats.every(meat => player.cookedMeatTypes.includes(meat));

    return hasAll ? '料理の達人' : null;
}

function getManpukuMasterReason(player) {
    if (!player.startedTurnBehindThisTurn) return null;
    if (player.recipesCookedThisTurn < 3) return null;
    return '満腹マスター';
}

function getSpecialWinReason(player) {
    return getIronChefReason(player) || getManpukuMasterReason(player);
}

function checkWinner() {
    const playerSpecial = getSpecialWinReason(GameState.players.player);
    if (playerSpecial) {
        GameState.specialWinReason = playerSpecial;
        return 'player';
    }

    const cpuSpecial = getSpecialWinReason(GameState.players.cpu);
    if (cpuSpecial) {
        GameState.specialWinReason = cpuSpecial;
        return 'cpu';
    }

    if (GameState.players.player.score >= 10) {
        GameState.specialWinReason = null;
        return 'player';
    }

    if (GameState.players.cpu.score >= 10) {
        GameState.specialWinReason = null;
        return 'cpu';
    }

    GameState.specialWinReason = null;
    return null;
}

function initGame() {
    GameState.deck = typeof buildDeck === 'function' ? buildDeck() : [];
    shuffle(GameState.deck);
    GameState.discard = [];

    resetPlayerState(GameState.players.player);
    resetPlayerState(GameState.players.cpu);
    resetUiState();

    GameState.currentTurn = 'player';
    GameState.currentPhase = 'メインフェイズ';

    ensureDeckExists();
    drawUntilTargetHand(GameState.players.player);
    drawUntilTargetHand(GameState.players.cpu);
    ensurePlayerSkillState(GameState.players.player);
    ensurePlayerSkillState(GameState.players.cpu);

    markTurnStartStatus(GameState.players.player, GameState.players.cpu);
    markTurnStartStatus(GameState.players.cpu, GameState.players.player);
}

function getCardZoneSummary() {
    const player = GameState.players.player;
    const cpu = GameState.players.cpu;

    const playerHandTotal = player.hand.length + player.events.length;
    const cpuHandTotal = cpu.hand.length + cpu.events.length;

    return {
        deck: GameState.deck.length,
        discard: GameState.discard.length,
        playerHandTotal,
        playerSet: player.set.length,
        cpuHandTotal,
        cpuSet: cpu.set.length,
        total: GameState.deck.length +
            GameState.discard.length +
            playerHandTotal +
            player.set.length +
            cpuHandTotal +
            cpu.set.length
    };
}

window.GameState = GameState;
window.shuffle = shuffle;
window.initGame = initGame;
window.drawOneResolved = drawOneResolved;
window.drawUntilTargetHand = drawUntilTargetHand;
window.moveCardToDiscard = moveCardToDiscard;
window.hasPack = hasPack;
window.getPackDefinition = getPackDefinition;
window.canBuyPack = canBuyPack;
window.buyPack = buyPack;
window.getTargetTotalHandSize = getTargetTotalHandSize;
window.getCurrentTotalHandCount = getCurrentTotalHandCount;
window.getSetLimit = getSetLimit;
window.getEndPhaseHandLimit = getEndPhaseHandLimit;
window.checkWinner = checkWinner;
window.reshuffleDiscardIntoDeckIfNeeded = reshuffleDiscardIntoDeckIfNeeded;
window.markTurnStartStatus = markTurnStartStatus;
window.ensureDeckExists = ensureDeckExists;
window.getCardZoneSummary = getCardZoneSummary;
window.getSkillDefinitions = getSkillDefinitions;
window.getSkillDefinitionByKey = getSkillDefinitionByKey;
window.getCpuPersonalityOptions = getCpuPersonalityOptions;
window.normalizeCpuPersonalityKey = normalizeCpuPersonalityKey;
window.getCpuPersonalitySkillPriority = getCpuPersonalitySkillPriority;
window.ensurePlayerSkillState = ensurePlayerSkillState;
window.getPlayerSkillUseCount = getPlayerSkillUseCount;
window.setPlayerSelectedSkill = setPlayerSelectedSkill;



