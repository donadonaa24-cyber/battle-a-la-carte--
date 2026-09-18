(function (root) {
    'use strict';
    const actions = Object.freeze([
        'playerSetCard', 'confirmSetCard', 'cancelSetCard', 'viewSetCard', 'closeSetCardView',
        'openIngredientAction', 'closeIngredientAction', 'showIngredientCombinations',
        'backIngredientAction', 'confirmIngredientSetFromAction', 'playerShowRecipeCandidates',
        'playerCancelRecipeCandidates', 'playerCookSelectedRecipe', 'playerUseEvent',
        'playerUseSkill', 'confirmSkillActivation', 'cancelSkillActivation', 'confirmEventCard',
        'cancelEventCard', 'playerBuyPack', 'confirmPackPurchase', 'cancelPackPurchase',
        'playerEndTurn', 'confirmEndTurn', 'cancelEndTurn', 'toggleDiscardSelection',
        'confirmDiscardSelection', 'toggleEventTargetSelection', 'confirmEventSelection', 'cancelEventSelection'
    ]);
    const localFields = ['selectionMode', 'discardNeedCount', 'selectedCardIds', 'candidateRecipes',
        'pendingEventContext', 'pendingSkillContext', 'pendingSkillConfirm', 'selectedTargetIds',
        'pendingSetCardId', 'pendingEventCardId', 'pendingViewSetCardId', 'pendingPackKey',
        'pendingIngredientAction', 'pendingKnifeOptions'];
    const clone = value => JSON.parse(JSON.stringify(value));
    function randomUUID() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
    const side = value => value === 'player' ? 'cpu' : value === 'cpu' ? 'player' : value;
    function swap(input) {
        const result = clone(input);
        for (const key of ['players', 'characterIds', 'characterNames', 'characterSides']) {
            if (result[key]) result[key] = { player: result[key].cpu, cpu: result[key].player };
        }
        for (const key of ['currentTurn', 'winner', 'openDishHistoryFor']) result[key] = side(result[key]);
        if (result.lastCookedRecipe?.side) result.lastCookedRecipe.side = side(result.lastCookedRecipe.side);
        for (const key of ['pendingEventContext', 'pendingSkillContext', 'pendingSkillConfirm']) {
            if (!result[key]) continue;
            for (const field of ['actor', 'ownerKey', 'selfPlayerKey', 'enemyPlayerKey']) {
                if (field in result[key]) result[key][field] = side(result[key][field]);
            }
        }
        for (const p of Object.values(result.players)) {
            for (const zone of ['hand', 'set', 'events']) {
                for (const card of p[zone]) if (card.trapOwner) card.trapOwner = side(card.trapOwner);
            }
        }
        return result;
    }
    function view(snapshot, role) {
        const result = role === 'host' ? clone(snapshot) : swap(snapshot);
        // Hidden cards carry neither their original IDs nor their type/name.
        const backs = (count, zone) => Array.from({ length: count }, (_, i) => ({ id: `${zone}-${i}`, hidden: true }));
        result.deck = backs(result.deck.length, 'deck');
        const foe = result.players.cpu;
        foe.hand = backs(foe.hand.length + foe.events.length, 'opponent');
        foe.events = [];
        foe.set = foe.set.map((card, i) => card.trapLocked || card.blockedByTrap
            ? card : { id: `set-${i}`, hidden: true });
        if (result.currentTurn !== 'player') {
            for (const key of localFields) {
                result[key] = Array.isArray(result[key]) ? [] : key === 'discardNeedCount' ? 0 : null;
            }
        }
        delete result.settings;
        delete result.ui;
        delete result.openDishHistoryFor;
        return result;
    }
    function validAction(action) {
        return action && actions.includes(action.name) && Array.isArray(action.args) && action.args.length <= 2 &&
            action.args.every(arg => (typeof arg === 'string' && arg.length <= 160) ||
                (typeof arg === 'number' && Number.isSafeInteger(arg)));
    }
    root.BattleProtocol = Object.freeze({ version: 1, actions, clone, swap, view, validAction, randomUUID });
})(typeof window === 'undefined' ? globalThis : window);
