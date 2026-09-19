const CPU_THINK_DELAY = 3000;
const CPU_ACTION_DELAY = 900;
const CPU_BIG_ACTION_DELAY = 1200;

function isCpuFastMode() {
    return GameState?.settings?.cpuSpeed === 'fast';
}

function resolveCpuDelay(ms) {
    return isCpuFastMode() ? 0 : ms;
}

function getCpuTurnStartDelay() {
    return resolveCpuDelay(CPU_THINK_DELAY);
}

function cpuPause(ms) {
    const waitMs = resolveCpuDelay(ms);
    if (waitMs <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, waitMs));
}

function getCpuSelectableIngredientCards(cpu) {
    return [...cpu.hand, ...cpu.set].filter(card =>
        typeof isCardUsableForCooking === 'function'
            ? isCardUsableForCooking(card)
            : !(card?.trapLocked === true || card?.blockedByTrap === true)
    );
}

function getCpuPersonalityKey() {
    const raw = GameState?.settings?.cpuPersonality || 'default';
    if (typeof normalizeCpuPersonalityKey === 'function') {
        return normalizeCpuPersonalityKey(raw);
    }
    return ['default', 'balance', 'disrupt', 'comeback'].includes(raw) ? raw : 'default';
}

function pickCpuRecipePlan(possiblePlans) {
    if (!Array.isArray(possiblePlans) || possiblePlans.length === 0) return null;

    const personality = getCpuPersonalityKey();
    if (personality === 'comeback') {
        const bombPlan = possiblePlans.find(plan => plan?.recipe?.name === '爆弾おにぎり');
        if (bombPlan) return bombPlan;
    }

    return possiblePlans[0];
}

function getCpuEventPriorityNames() {
    const personality = getCpuPersonalityKey();
    if (personality === 'disrupt') {
        return ['大掃除', '物々交換', '食材探索', '爆買い', 'ゴミ収集車', 'やっぱやめた', 'やり直し', '創作料理', '緊急料理'];
    }
    if (personality === 'comeback') {
        return ['緊急料理', '創作料理', '爆買い', '食材探索', 'ゴミ収集車', 'やり直し', '物々交換', '大掃除', 'やっぱやめた'];
    }
    return ['緊急料理', '創作料理', '爆買い', '食材探索', '大掃除', 'ゴミ収集車', 'やっぱやめた', 'やり直し', '物々交換'];
}

async function cpuTurn() {
    if (GameState.gameEnded) return;

    const cpu = GameState.players.cpu;
    const player = GameState.players.player;

    setCPUStatus('CPU思考中...');
    GameState.currentPhase = 'ドローフェイズ';
    updateUI();

    await cpuPause(CPU_THINK_DELAY);
    if (GameState.gameEnded) return;

    setCPUStatus('CPUドロー中...');
    GameState.currentPhase = 'ドローフェイズ';
    updateUI();

    const targetHandCount = getTargetTotalHandSize(cpu);

    while (getCurrentTotalHandCount(cpu) < targetHandCount) {
        const drawn = drawOneResolved(cpu);
        if (!drawn) break;

        updateUI();
        await cpuPause(CPU_ACTION_DELAY);
        if (GameState.gameEnded) return;
    }

    if (typeof triggerBattleModeDiscardPickupAfterDrawForCpu === 'function') {
        triggerBattleModeDiscardPickupAfterDrawForCpu('cpu');
    }

    GameState.currentPhase = 'メインフェイズ';
    setCPUStatus('CPU行動選択中...');
    updateUI();
    await cpuPause(CPU_ACTION_DELAY);

    const boughtPack = cpuTryBuyPack(cpu);
    if (boughtPack) {
        setCPUStatus('CPU加工アイテム購入中...');
        updateUI();
        await cpuPause(CPU_BIG_ACTION_DELAY);
        if (GameState.gameEnded) return;
    }

    if (typeof activateSkillBySide === 'function') {
        const skillResult = activateSkillBySide('cpu', {
            auto: true,
            silentFail: true
        });
        if (skillResult?.ok) {
            setCPUStatus('CPUスキル発動中...');
            updateUI();
            await cpuPause(CPU_BIG_ACTION_DELAY);
            if (GameState.gameEnded) return;
        }
    }

    for (let i = 0; i < 2; i++) {
        const usedEvent = await cpuTryUseEvent(cpu, player);
        if (!usedEvent) break;
        setCPUStatus('CPUイベントカード使用中...');
        updateUI();
        await cpuPause(CPU_BIG_ACTION_DELAY);
        if (GameState.gameEnded) return;
    }

    if (!cpu.lockedCookingThisTurn) {
        let possible = findPossibleRecipesForPlayer(cpu);

        while (possible.length > 0) {
            setCPUStatus('CPU料理中...');
            updateUI();

            const bestPlan = pickCpuRecipePlan(possible);
            if (!bestPlan) break;
            const success = applyRecipePlan(cpu, bestPlan);
            if (!success) break;

            addLog(`CPUは「${bestPlan.recipe.name}」を作りました（+${bestPlan.recipe.points}点）`);
            if (window.playCookBgm) { playCookBgm(); } else { playSfx('cook'); }

            updateUI();

            if (window.showSpotlightRecipeCardAsync) {
                await window.showSpotlightRecipeCardAsync(bestPlan.recipe);
            }

            await cpuPause(CPU_BIG_ACTION_DELAY);
            if (GameState.gameEnded) return;

            const winner = checkWinner();
            if (winner) {
                endGame(winner);
                return;
            }

            if (cpu.lockedCookingThisTurn) break;
            possible = findPossibleRecipesForPlayer(cpu);
        }
    }

    if (!cpu.lockedCookingThisTurn) {
        const setLimit = getSetLimit(cpu);

        while (cpu.set.length < setLimit && cpu.hand.length > 0) {
            const card = chooseBestSetCard(cpu);
            if (!card) break;

            const index = cpu.hand.findIndex(item => item.id === card.id);
            if (index === -1) break;

            setCPUStatus('CPUカードセット中...');
            const moved = cpu.hand.splice(index, 1)[0];
            cpu.set.push(moved);
            updateUI();

            await cpuPause(CPU_ACTION_DELAY);
            if (GameState.gameEnded) return;

            if (cpu.set.length >= setLimit) break;
            if (cpu.hand.length <= 1) break;
            if (cpu.set.length >= 2) break;
        }
    }

    GameState.currentPhase = 'エンドフェイズ';
    setCPUStatus('CPU終了処理中...');
    updateUI();
    await cpuPause(500);

    const handLimit = getEndPhaseHandLimit(cpu);
    while (getCurrentTotalHandCount(cpu) > handLimit) {
        if (cpu.hand.length > 0) {
            const discarded = cpu.hand.shift();
            moveCardToDiscard(discarded);
            addLog(`CPUは手札「${discarded.name}」を捨てました。`);
        } else if (cpu.events.length > 0) {
            const discardedEvent = cpu.events.shift();
            moveCardToDiscard(discardedEvent);
            addLog(`CPUはイベント「${discardedEvent.name}」を捨てました。`);
        } else {
            break;
        }

        updateUI();
        await cpuPause(CPU_ACTION_DELAY);
        if (GameState.gameEnded) return;
    }

    cpu.usedEventThisTurn = false;
    cpu.extraEventUsesRemainingThisTurn = 0;
    cpu.lockedCookingThisTurn = false;
    cpu.knifeUsedThisTurn = false;

    const winner = checkWinner();
    if (winner) {
        endGame(winner);
        return;
    }

    GameState.currentTurn = 'player';
    GameState.currentPhase = 'ドローフェイズ';
    player.usedEventThisTurn = false;
    player.extraEventUsesRemainingThisTurn = 0;
    player.lockedCookingThisTurn = false;
    player.knifeSelectedName = null;
    player.knifeUsedThisTurn = false;
    markTurnStartStatus(player, cpu);
    setCPUStatus('');
    updateUI();

    await cpuPause(400);

    drawUntilTargetHand(player);
    if (typeof triggerBattleModeDiscardPickupAfterDrawForPlayer === 'function') {
        triggerBattleModeDiscardPickupAfterDrawForPlayer('player');
    }
    addLog('あなたのドローフェイズです。手札を補充しました。');
    playSfx('turnStart');

    GameState.currentPhase = 'メインフェイズ';
    updateUI();
    enablePlayerControls();
}

function cpuTryBuyPack(cpu) {
    const priorities = ['board', 'freezer', 'ecoBag'];

    for (const packKey of priorities) {
        if (canBuyPack(cpu, packKey)) {
            buyPack(cpu, packKey);
            const def = getPackDefinition(packKey);
            addLog(`CPUは加工アイテム「${def.name}」を購入しました（-${def.cost}点）。`);
            return true;
        }
    }
    return false;
}

async function cpuTryUseEvent(cpu, player) {
    if (typeof canUseEventThisTurn === 'function') {
        if (!canUseEventThisTurn(cpu)) return false;
    } else if (cpu.usedEventThisTurn) {
        return false;
    }
    if (cpu.events.length === 0) return false;

    const priorityNames = getCpuEventPriorityNames();

    let selected = null;

    for (const name of priorityNames) {
        const found = cpu.events.find(card => isCpuEventUseful(cpu, player, card, name));
        if (found) {
            selected = found;
            break;
        }
    }

    if (!selected) return false;

    const index = cpu.events.findIndex(card => card.id === selected.id);
    if (index === -1) return false;

    const eventCard = cpu.events.splice(index, 1)[0];

    if (window.showSpotlightEventCardAsync) {
        await window.showSpotlightEventCardAsync(eventCard);
    }

    moveCardToDiscard(eventCard);
    if (typeof consumeEventUse === 'function') {
        consumeEventUse(cpu);
    } else {
        cpu.usedEventThisTurn = true;
    }

    const extra = buildCpuEventExtra(cpu, player, eventCard);
    addLog(`CPUはイベント「${eventCard.name}」を発動しました。`);
    executeEventEffect(cpu, player, eventCard, 'cpu', extra);
    return true;
}

function buildCpuEventExtra(cpu, player, eventCard) {
    switch (eventCard.name) {
        case 'ゴミ収集車': {
            const choices = GameState.discard.filter(card => card.type === 'ingredient');
            const target = choices.length ? choices[choices.length - 1] : null;
            return { selectedIds: target ? [target.id] : [] };
        }

        case '物々交換': {
            const receiveTarget = player.hand.length ? player.hand[0] : null;
            const giveTarget = cpu.hand.length ? cpu.hand[0] : null;
            return { selectedIds: [receiveTarget?.id, giveTarget?.id].filter(Boolean) };
        }

        case '創作料理': {
            return { selectedIds: getCpuSelectableIngredientCards(cpu).slice(0, 2).map(card => card.id) };
        }

        case '食材探索': {
            const opened = [];
            for (let i = 0; i < 3; i++) {
                const raw = drawFromDeckRaw();
                if (raw) opened.push(raw);
            }

            const selectedIds = opened.slice(0, 2).map(card => card.id);
            return {
                selectedIds,
                context: { openedCards: opened }
            };
        }

        case '緊急料理': {
            const target = getCpuSelectableIngredientCards(cpu)[0];
            return { selectedIds: target ? [target.id] : [] };
        }

        default:
            return null;
    }
}

function isCpuEventUseful(cpu, player, card, targetName) {
    if (card.name !== targetName) return false;

    switch (card.name) {
        case '緊急料理':
            return cpu.score <= 3 &&
                getCpuSelectableIngredientCards(cpu).length >= 1 &&
                (cpu.recipesCookedThisTurn || 0) === 0;
        case '創作料理':
            return cpu.score <= 6 &&
                getCpuSelectableIngredientCards(cpu).length >= 2 &&
                findPossibleRecipesForPlayer(cpu).length === 0 &&
                (cpu.recipesCookedThisTurn || 0) === 0;
        case '爆買い':
            return true;
        case '食材探索':
            return true;
        case '大掃除':
            return getCurrentTotalHandCount(player) >= 2 || player.set.length > 0;
        case 'ゴミ収集車':
            return GameState.discard.some(card => card.type === 'ingredient');
        case 'やっぱやめた':
            return cpu.set.length > 0;
        case 'やり直し':
            return getCurrentTotalHandCount(cpu) >= 3 && findPossibleRecipesForPlayer(cpu).length === 0;
        case '物々交換':
            return cpu.hand.length > 0 && player.hand.length > 0;
        default:
            return false;
    }
}

function chooseBestSetCard(cpu) {
    if (cpu.hand.length === 0) return null;

    let bestCard = cpu.hand[0];
    let bestValue = -1;
    const personality = getCpuPersonalityKey();
    const comebackFocus = new Set(['ごはん', 'のり', '魚']);

    cpu.hand.forEach(card => {
        let value = 0;
        recipes.forEach(recipe => {
            if (recipe.required.includes(card.name)) {
                value += recipe.points;
            }
        });

        if (personality === 'comeback' && comebackFocus.has(card.name)) {
            value += 60;
        }

        if (value > bestValue) {
            bestValue = value;
            bestCard = card;
        }
    });

    return bestCard;
}

window.cpuTurn = cpuTurn;
window.getCpuTurnStartDelay = getCpuTurnStartDelay;






