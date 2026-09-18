const recipes = [
    { name: 'おにぎり', points: 1, required: ['ごはん', 'のり'] },
    { name: '卵かけごはん', points: 1, required: ['ごはん', '卵'] },
    { name: '豚バラ大根', points: 1, required: ['豚肉', '大根'] },
    { name: 'ブリ大根', points: 1, required: ['魚', '大根'] },
    { name: 'ロールキャベツ', points: 1, required: ['豚肉', 'キャベツ'] },
    { name: 'バナナジュース', points: 1, required: ['バナナ', '牛乳'] },

    { name: '鮭おにぎり', points: 2, required: ['ごはん', 'のり', '魚'] },
    { name: '野菜炒め', points: 2, required: ['キャベツ', 'にんじん', 'たまねぎ'] },
    { name: 'チャーハン', points: 2, required: ['ごはん', 'たまねぎ', '卵'] },

    { name: '豪華チャーハン', points: 4, required: ['ごはん', 'たまねぎ', '卵', '豚肉'] },
    { name: 'キーマカレー', points: 4, required: ['ごはん', 'たまねぎ', 'カレー粉', '牛肉'] },
    { name: 'オムライス', points: 4, required: ['ごはん', 'たまねぎ', '卵', '鶏肉'] },
    { name: 'ハンバーグ', points: 4, required: ['牛肉', '豚肉', 'たまねぎ', '牛乳'] },
    { name: '肉じゃが', points: 4, required: ['牛肉', 'じゃがいも', 'たまねぎ', 'にんじん'] },

    { name: 'クリームシチュー', points: 7, required: ['牛乳', '牛肉', 'たまねぎ', 'にんじん', 'じゃがいも'] },
    { name: 'カレー', points: 7, required: ['牛肉', 'たまねぎ', 'にんじん', 'じゃがいも', 'カレー粉'] },

    { name: '満腹カレー', points: 10, required: ['ごはん', '牛肉', 'たまねぎ', 'にんじん', 'じゃがいも', 'カレー粉'] },
    { name: '爆弾おにぎり', points: 10, required: ['ごはん', 'ごはん', 'ごはん', 'ごはん', 'のり', '魚'] }
];
const BATTLE_A_LA_CARTE_MODE_REQUIRED_DISHES = 5;

function countNamesFromCards(cards) {
    const counts = {};
    cards.forEach(card => {
        counts[card.name] = (counts[card.name] || 0) + 1;
    });
    return counts;
}

function cloneCounts(counts) {
    return JSON.parse(JSON.stringify(counts));
}

function canRecipeBeMadeWithCounts(recipe, counts) {
    const work = cloneCounts(counts);

    for (const req of recipe.required) {
        if (!work[req] || work[req] <= 0) {
            return false;
        }
        work[req]--;
    }
    return true;
}

function isCardUsableForCooking(card) {
    if (!card || card.type !== 'ingredient') return false;
    return !(card.trapLocked === true || card.blockedByTrap === true);
}

function getUsableIngredientCards(player) {
    const handCards = Array.isArray(player?.hand) ? player.hand.filter(isCardUsableForCooking) : [];
    const setCards = Array.isArray(player?.set) ? player.set.filter(isCardUsableForCooking) : [];
    return [...handCards, ...setCards];
}

function getRecipePlan(player, recipe) {
    const allCards = getUsableIngredientCards(player);
    const counts = countNamesFromCards(allCards);
    return canRecipeBeMadeWithCounts(recipe, counts)
        ? { recipe, doubledName: null, isValid: true }
        : { recipe, doubledName: null, isValid: false };
}

function findPossibleRecipesForPlayer(player) {
    return recipes
        .map(recipe => getRecipePlan(player, recipe))
        .filter(plan => plan.isValid)
        .sort((a, b) => b.recipe.points - a.recipe.points);
}

function buildRequiredCountsForConsumption(recipe, doubledName) {
    const requiredCounts = {};
    recipe.required.forEach(name => {
        requiredCounts[name] = (requiredCounts[name] || 0) + 1;
    });

    if (doubledName) {
        requiredCounts[doubledName]--;
    }

    return requiredCounts;
}

function consumeCardsFromZone(zone, requiredCounts, usedCards) {
    for (let i = zone.length - 1; i >= 0; i--) {
        const card = zone[i];
        if (!isCardUsableForCooking(card)) continue;
        if (requiredCounts[card.name] && requiredCounts[card.name] > 0) {
            requiredCounts[card.name]--;
            usedCards.push(zone.splice(i, 1)[0]);
        }
    }
}

function getOwnerKeyFromPlayerRef(player) {
    if (player === GameState.players.player) return 'player';
    if (player === GameState.players.cpu) return 'cpu';
    return null;
}

function getBattleModeOwnerLabel(ownerKey) {
    if (ownerKey === 'player') return 'あなた';
    const isFriendMode = !!(window.FriendBattle && typeof window.FriendBattle.isActive === 'function' && window.FriendBattle.isActive());
    return isFriendMode ? 'フレンド' : 'CPU';
}

function updateCookedMeatTypes(player, recipe) {
    const meatTypes = ['鶏肉', '豚肉', '牛肉', '魚'];

    recipe.required.forEach(name => {
        if (meatTypes.includes(name) && !player.cookedMeatTypes.includes(name)) {
            player.cookedMeatTypes.push(name);
        }
    });
}

function pushCookedRecipeHistory(player, recipe, doubledName) {
    if (!player || !recipe) return;

    player.cookedRecipes.unshift({
        name: recipe.name,
        points: recipe.points,
        required: [...recipe.required],
        doubledName: doubledName || null,
        cookedAt: Date.now()
    });

    player.recipesCookedThisTurn = (player.recipesCookedThisTurn || 0) + 1;
    GameState.lastCookedRecipe = {
        side: getOwnerKeyFromPlayerRef(player),
        name: recipe.name,
        points: recipe.points,
        cookedAt: Date.now()
    };
    updateCookedMeatTypes(player, recipe);
}

function ensureBattleModeState(player) {
    if (!player || typeof player !== 'object') return;
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

function isBattleModeCountedDishEntry(entry) {
    if (!entry || entry.fromEvent === true) return false;
    const name = String(entry.name || '');
    if (!name) return false;
    if (name === '緊急料理' || name === '創作料理') return false;
    const recipeNames = new Set(recipes.map(item => item.name));
    return recipeNames.has(name);
}

function getBattleModeCookedDishCount(player) {
    if (!player || !Array.isArray(player.cookedRecipes)) return 0;
    return player.cookedRecipes.filter(isBattleModeCountedDishEntry).length;
}

function canActivateBattleModeForOwner(ownerKey) {
    const storyEpisode = String(window.__storyActiveEpisodeId || '');
    if (storyEpisode === 'episode3' && ownerKey !== 'player') return false;
    return true;
}

function getBattleModeDiscardIngredientChoices() {
    if (!Array.isArray(GameState?.discard)) return [];
    return GameState.discard
        .filter(card => card && card.type === 'ingredient')
        .slice()
        .reverse();
}

function removeBattleModeDiscardCardById(cardId) {
    if (!cardId || !Array.isArray(GameState?.discard)) return null;
    const index = GameState.discard.findIndex(card => card && card.id === cardId);
    if (index === -1) return null;
    return GameState.discard.splice(index, 1)[0];
}

function buildBattleModeDiscardPickupContext(ownerKey, choices) {
    return {
        actor: ownerKey === 'cpu' ? 'cpu' : 'player',
        ownerKey: ownerKey === 'cpu' ? 'cpu' : 'player',
        source: 'battle-mode-discard',
        eventName: 'Battle à la carte 回収',
        minSelect: 1,
        maxSelect: 1,
        battleModeDiscardPickup: true,
        options: choices.map(card => ({
            id: card.id,
            label: card.name
        })),
        description: 'Battle à la carte Mode: 捨て札から手札に加える材料カードを1枚選んでください。'
    };
}

function resolveBattleModeDiscardPickupSelection(context, selectedIds) {
    const safeOwnerKey = context?.ownerKey === 'cpu' ? 'cpu' : 'player';
    const actor = GameState?.players?.[safeOwnerKey];
    if (!actor) return false;

    const ownerLabel = getBattleModeOwnerLabel(safeOwnerKey);
    const selectedId = Array.isArray(selectedIds) ? selectedIds[0] : null;
    if (!selectedId) return false;

    const card = removeBattleModeDiscardCardById(selectedId);
    if (!card || card.type !== 'ingredient') {
        addLog(`Battle à la carte Mode: ${ownerLabel}は回収対象を取得できませんでした。`);
        return false;
    }

    actor.hand.push(card);
    addLog(`Battle à la carte Mode: ${ownerLabel}はドローフェイズ後効果で「${card.name}」を回収しました。`);
    return true;
}

function cancelBattleModeDiscardPickupSelection(context) {
    const safeOwnerKey = context?.ownerKey === 'cpu' ? 'cpu' : 'player';
    const ownerLabel = getBattleModeOwnerLabel(safeOwnerKey);
    addLog(`Battle à la carte Mode: ${ownerLabel}は捨て札回収を見送りました。`);
}

function triggerBattleModeDiscardPickupAfterDrawForPlayer(ownerKey) {
    const safeOwnerKey = ownerKey === 'cpu' ? 'cpu' : 'player';
    const actor = GameState?.players?.[safeOwnerKey];
    if (!actor) return false;

    ensureBattleModeState(actor);
    if (!actor.battleALaCarteModeActive) return false;
    if (actor.battleALaCarteModeDiscardPickupUsedThisTurn) return false;
    actor.battleALaCarteModeDiscardPickupUsedThisTurn = true;

    const ownerLabel = getBattleModeOwnerLabel(safeOwnerKey);
    const choices = getBattleModeDiscardIngredientChoices();
    if (choices.length === 0) {
        addLog(`Battle à la carte Mode: ${ownerLabel}のドローフェイズ後効果は回収対象がありません。`);
        return false;
    }

    if (GameState.selectionMode) {
        const fallbackCard = removeBattleModeDiscardCardById(choices[0].id);
        if (fallbackCard) {
            actor.hand.push(fallbackCard);
            addLog(`Battle à la carte Mode: ${ownerLabel}は「${fallbackCard.name}」を自動回収しました。`);
            return true;
        }
        addLog(`Battle à la carte Mode: ${ownerLabel}の回収対象が見つかりませんでした。`);
        return false;
    }

    GameState.selectionMode = 'event-target';
    GameState.pendingEventContext = buildBattleModeDiscardPickupContext(safeOwnerKey, choices);
    GameState.selectedTargetIds = [];
    addLog(`Battle à la carte Mode: ${ownerLabel}は捨て札から回収する材料を選択中です。`);
    if (typeof updateUI === 'function') updateUI();
    return true;
}

function triggerBattleModeDiscardPickupAfterDrawForCpu(ownerKey) {
    const safeOwnerKey = ownerKey === 'player' ? 'player' : 'cpu';
    const actor = GameState?.players?.[safeOwnerKey];
    if (!actor) return false;

    ensureBattleModeState(actor);
    if (!actor.battleALaCarteModeActive) return false;
    if (actor.battleALaCarteModeDiscardPickupUsedThisTurn) return false;
    actor.battleALaCarteModeDiscardPickupUsedThisTurn = true;

    const ownerLabel = getBattleModeOwnerLabel(safeOwnerKey);
    const choices = getBattleModeDiscardIngredientChoices();
    if (choices.length === 0) {
        addLog(`Battle à la carte Mode: ${ownerLabel}のドローフェイズ後効果は回収対象がありません。`);
        return false;
    }

    const picked = removeBattleModeDiscardCardById(choices[0].id);
    if (!picked) {
        addLog(`Battle à la carte Mode: ${ownerLabel}の回収対象が見つかりませんでした。`);
        return false;
    }

    actor.hand.push(picked);
    addLog(`Battle à la carte Mode: ${ownerLabel}はドローフェイズ後効果で「${picked.name}」を回収しました。`);
    return true;
}

function processBattleALaCarteModeAfterDish(player, dishPoints, dishName, ownerKey) {
    if (!player) return;
    ensureBattleModeState(player);

    const safeOwnerKey = ownerKey || getOwnerKeyFromPlayerRef(player) || 'player';
    const ownerLabel = getBattleModeOwnerLabel(safeOwnerKey);
    const totalCooked = getBattleModeCookedDishCount(player);
    const canActivate = canActivateBattleModeForOwner(safeOwnerKey);

    if (!player.battleALaCarteModeActive && canActivate && totalCooked >= BATTLE_A_LA_CARTE_MODE_REQUIRED_DISHES) {
        player.battleALaCarteModeActive = true;
        player.battleALaCarteModeBonusDrawUsedThisTurn = false;
        player.battleALaCarteModeDiscardPickupUsedThisTurn = false;
        addLog(`${ownerLabel}は Battle à la carte Mode に突入した！`);
        addLog('Mode効果: 1点料理で追加ドロー（メインフェイズで毎ターン1回）＋ドローフェイズ後に捨て札の材料1枚を回収（毎ターン1回）。');
        if (typeof window.setBattleModeBgmLocked === 'function') {
            window.setBattleModeBgmLocked(true);
        }
        if (typeof window.playBattleModeBGM === 'function') {
            window.playBattleModeBGM();
        }
        if (typeof window.showBattleALaCarteModeCutin === 'function') {
            setTimeout(() => {
                window.showBattleALaCarteModeCutin(safeOwnerKey);
            }, 2100);
        }
    }

    const isMainPhase = String(GameState?.currentPhase || '') === 'メインフェイズ';
    if (!player.battleALaCarteModeActive) return;
    if (!isMainPhase) return;
    if (Number(dishPoints) !== 1) return;
    if (player.battleALaCarteModeBonusDrawUsedThisTurn) return;

    const drawn = drawOneResolved(player);
    player.battleALaCarteModeBonusDrawUsedThisTurn = true;

    if (drawn) {
        addLog(`Battle à la carte Mode: ${ownerLabel}は1点料理「${dishName || '料理'}」で追加ドロー「${drawn.name}」。`);
    } else {
        addLog(`Battle à la carte Mode: ${ownerLabel}は1点料理「${dishName || '料理'}」で追加ドローを試みたが、山札がありません。`);
    }
}

function applyRecipePlan(player, plan) {
    if (!plan || !plan.isValid) return false;

    const usedCards = [];
    const requiredCounts = buildRequiredCountsForConsumption(plan.recipe, plan.doubledName);

    consumeCardsFromZone(player.set, requiredCounts, usedCards);
    consumeCardsFromZone(player.hand, requiredCounts, usedCards);

    const remain = Object.values(requiredCounts).some(value => value > 0);
    if (remain) {
        player.hand.push(...usedCards);
        return false;
    }

    usedCards.forEach(card => moveCardToDiscard(card));
    player.score += plan.recipe.points;
    pushCookedRecipeHistory(player, plan.recipe, plan.doubledName);
    processBattleALaCarteModeAfterDish(player, plan.recipe.points, plan.recipe.name, getOwnerKeyFromPlayerRef(player));

    return true;
}

window.recipes = recipes;
window.countNamesFromCards = countNamesFromCards;
window.findPossibleRecipesForPlayer = findPossibleRecipesForPlayer;
window.getRecipePlan = getRecipePlan;
window.applyRecipePlan = applyRecipePlan;
window.getUsableIngredientCards = getUsableIngredientCards;
window.isCardUsableForCooking = isCardUsableForCooking;
window.processBattleALaCarteModeAfterDish = processBattleALaCarteModeAfterDish;
window.triggerBattleModeDiscardPickupAfterDrawForPlayer = triggerBattleModeDiscardPickupAfterDrawForPlayer;
window.triggerBattleModeDiscardPickupAfterDrawForCpu = triggerBattleModeDiscardPickupAfterDrawForCpu;
window.resolveBattleModeDiscardPickupSelection = resolveBattleModeDiscardPickupSelection;
window.cancelBattleModeDiscardPickupSelection = cancelBattleModeDiscardPickupSelection;
