(function (root) {
    'use strict';

    function detailsFor(player, recipe) {
        const hand = Array.isArray(player?.hand) ? player.hand : [];
        const set = Array.isArray(player?.set) ? player.set : [];
        const usable = getUsableIngredientCards(player, recipe);
        const handCards = new Set(hand);
        const remaining = [...usable];
        const owned = [];
        const missing = [];
        let usedSet = false;
        for (const name of recipe.required) {
            const index = remaining.findIndex(card => card.name === name);
            if (index < 0) {
                missing.push(name);
            } else {
                const card = remaining.splice(index, 1)[0];
                owned.push(name);
                if (!handCards.has(card) && set.includes(card)) usedSet = true;
            }
        }
        return { recipe, owned, missing, usedSet };
    }

    function rank(player, recipeList = recipes) {
        return recipeList.map(recipe => detailsFor(player, recipe))
            .sort((a, b) => a.missing.length - b.missing.length || b.recipe.points - a.recipe.points ||
                recipeList.indexOf(a.recipe) - recipeList.indexOf(b.recipe));
    }

    function closest(player, recipeList = recipes) {
        const pending = rank(player, recipeList).filter(item => item.missing.length > 0);
        const near = pending.filter(item => item.missing.length <= 2);
        return near.length ? near.slice(0, 6) : pending.slice(0, 3);
    }

    function formatNames(names) {
        const counts = new Map();
        for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
        return [...counts].map(([name, count]) => `${name}${count > 1 ? `×${count}` : ''}`).join('・') || 'なし';
    }

    let open = false;
    function canShow() {
        const model = root.getBattleViewModel();
        return model.turn === 'me' && root.GameState.currentPhase === 'メインフェイズ' &&
            !root.GameState.gameEnded && !root.GameState.selectionMode && !model.me.lockedCookingThisTurn;
    }

    function close() {
        open = false;
        root.document.getElementById('recipe-hints-overlay')?.classList.add('hidden');
    }

    function createRow(item) {
            const row = root.document.createElement('article');
            row.className = 'recipe-hint-row';
            const art = root.document.createElement('div');
            art.className = 'recipe-hint-art';
            art.setAttribute('aria-hidden', 'true');
            const path = root.getRecipeImagePath?.(item.recipe.name);
            if (path) art.style.backgroundImage = `url("${path}")`;
            const text = root.document.createElement('div');
            text.className = 'recipe-hint-meta';
            const title = root.document.createElement('strong');
            title.textContent = `${item.recipe.name}（${item.recipe.points}点）`;
            const owned = root.document.createElement('span');
            owned.textContent = `持っている：${formatNames(item.owned)}`;
            const missing = root.document.createElement('span');
            missing.textContent = `あと：${formatNames(item.missing)}${item.missing.length >= 3 ? '（あと3枚以上）' : ''}`;
            text.append(title, owned, missing);
            if (item.usedSet) {
                const setNote = root.document.createElement('small');
                setNote.textContent = 'セット済み（料理に使える）';
                text.appendChild(setNote);
            }
            row.append(art, text);
            return row;
    }

    function renderNear(container, player) {
        const near = rank(player).filter(item => item.missing.length === 1).slice(0, 6);
        if (!near.length) return;
        const details = root.document.createElement('details');
        details.className = 'recipe-hints-near';
        const summary = root.document.createElement('summary');
        summary.textContent = 'あと1枚で作れる料理';
        details.appendChild(summary);
        for (const item of near) details.appendChild(createRow(item));
        container.appendChild(details);
    }

    function render() {
        const overlay = root.document.getElementById('recipe-hints-overlay');
        const list = root.document.getElementById('recipe-hints-list');
        if (!overlay || !list) return;
        if (!open || !canShow()) { close(); return; }
        const player = root.getBattleViewModel().me;
        if (findPossibleRecipesForPlayer(player).length > 0) { close(); return; }
        list.replaceChildren();
        for (const item of closest(player)) {
            list.appendChild(createRow(item));
        }
        overlay.classList.remove('hidden');
    }

    function show() {
        if (!canShow()) return;
        if (findPossibleRecipesForPlayer(root.getBattleViewModel().me).length > 0) return;
        const closeButton = root.document.getElementById('recipe-hints-close-button');
        if (closeButton) closeButton.onclick = close;
        open = true;
        render();
        closeButton?.focus();
    }

    root.RecipeHints = Object.freeze({ detailsFor, rank, closest, formatNames, canShow, show, close, render, renderNear });
})(typeof window === 'undefined' ? globalThis : window);
