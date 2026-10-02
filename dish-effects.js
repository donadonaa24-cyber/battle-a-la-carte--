(function (root) {
    'use strict';
    // Presentation preferences stay on this device, outside the online rule state.
    const key = 'battle-a-la-carte:presentation:v1';
    const modes = ['normal', 'short', 'skip'];
    const speeds = ['default', 'fast', 'relaxed'];
    let memory = {}, active = null, localOnly = false;
    const records = new Map();
    const state = () => typeof GameState === 'undefined' ? null : GameState;
    function preferences() {
        try {
            if (!localOnly && root.localStorage) memory = JSON.parse(root.localStorage.getItem(key) || '{}') || {};
        } catch (_) {}
        return { dishMode: modes.includes(memory.dishMode) ? memory.dishMode : 'normal',
            cpuSpeed: speeds.includes(memory.cpuSpeed) ? memory.cpuSpeed : 'default' };
    }
    function save(patch) {
        memory = { ...preferences(), ...patch };
        memory.dishMode = modes.includes(memory.dishMode) ? memory.dishMode : 'normal';
        memory.cpuSpeed = speeds.includes(memory.cpuSpeed) ? memory.cpuSpeed : 'default';
        try { root.localStorage?.setItem(key, JSON.stringify(memory)); } catch (_) { localOnly = true; }
        return { ...memory };
    }
    const reduced = () => !!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    function mode() {
        const value = preferences().dishMode;
        return reduced() && value === 'normal' ? 'short' : value;
    }
    function theme(dish) {
        const points = Number(dish?.points) || 0;
        const dark = ['創作料理', '緊急料理'].includes(dish?.name);
        const special = points >= 10;
        return { name: dark ? 'dark' : dish?.name === '爆弾おにぎり' ? 'bomb' : dish?.name === '満腹カレー' ? 'curry' : 'dish',
            glow: dark ? '#a16bdf' : special ? '#eff8ff' : points >= 7 ? '#ffdc67' : points >= 4 ? '#ffa44f' : '#fff2da',
            burst: dish?.name === '爆弾おにぎり' ? '#ff662d' : dark ? '#b280ff' : '#ffdc67',
            headline: dark ? '禁断の一皿' : special ? '至高の一皿' : '料理完成！', special };
    }
    function timing(dish, winning = false, effectMode = mode(), still = reduced()) {
        if (effectMode === 'skip') return { flight: 0, dissolve: 0, glow: 0, card: 0, whiteout: 0, slam: 0, burst: 0, settle: 0, reveal: 0, total: 0 };
        if (still) return { flight: 0, dissolve: 0, glow: 0, card: 450, whiteout: 0, slam: 0, burst: 0, settle: 0, reveal: 0, total: 450 };
        const big = winning || theme(dish).special;
        const short = effectMode === 'short';
        const points = Number(dish?.points) || 0;
        const t = short
            ? { flight: 120, dissolve: 100, glow: 80, card: big ? 300 : 650, whiteout: big ? 80 : 0, slam: big ? 220 : 0, burst: big ? 220 : 0, settle: big ? 180 : 0 }
            : { flight: 450, dissolve: 450, glow: 300, card: big ? 350 : 900, whiteout: big ? 180 : 0, slam: big ? 600 : 0,
                burst: big ? (points >= 10 ? 900 : points >= 7 ? 750 : points >= 4 ? 600 : 450) : 0,
                settle: big ? (points >= 10 ? 900 : points >= 7 ? 650 : points >= 4 ? 550 : 450) : 0 };
        return { ...t, reveal: t.flight + t.dissolve + t.glow, total: Object.values(t).reduce((a, b) => a + b, 0) };
    }
    function identify(dish, side) {
        const s = state();
        if (!s) return { dish, side: side || 'player', id: dish?.name || '' };
        const candidates = ['player', 'cpu'].flatMap(owner => {
            const entries = s.players?.[owner]?.cookedRecipes || [];
            return entries[0] ? [{ dish: entries[0], side: owner, count: entries.length }] : [];
        }).filter(item => (!side || item.side === side) && (!dish || item.dish.name === dish.name));
        candidates.sort((a, b) => Number(b.dish.cookedAt || 0) - Number(a.dish.cookedAt || 0) ||
            Number(b.side === s.lastCookedRecipe?.side) - Number(a.side === s.lastCookedRecipe?.side));
        const found = candidates[0];
        const resolved = found?.dish || dish;
        const owner = found?.side || side || s.lastCookedRecipe?.side || 'player';
        return { dish: resolved, side: owner,
            id: `${s.matchStartedAt}:${owner}:${resolved?.name}:${resolved?.cookedAt || 0}:${found?.count || 0}` };
    }
    function record(info) {
        let item = records.get(info.id);
        if (!item) {
            let resolve;
            item = { ...info, timers: new Set(), promise: new Promise(done => { resolve = done; }), resolve,
                started: false, revealed: false, done: false, soundPlayed: false, winning: false, skipped: false };
            records.set(info.id, item);
            // A match contains few dishes. Bound retained identities during long sessions.
            for (const [id, old] of records) {
                if (records.size <= 64) break;
                if (old.done) records.delete(id);
            }
        }
        return item;
    }
    function later(item, fn, ms) {
        const timer = root.setTimeout(() => { item.timers.delete(timer); fn(); }, ms);
        item.timers.add(timer);
        return timer;
    }
    function clearTimers(item) {
        item.timers.forEach(timer => root.clearTimeout(timer));
        item.timers.clear();
    }
    function sound(item) {
        if (!item.soundPlayed && item.soundCue) { item.soundPlayed = true; item.soundCue(); }
    }
    function queueCookSound(cue, fallbackDelay) {
        const info = identify();
        if (!info.dish) return false;
        const item = record(info);
        item.soundCue = cue;
        if (item.revealed) sound(item);
        else if (!item.started && item.timers.size === 0) {
            later(item, () => { item.revealed = true; sound(item); }, mode() === 'normal' ? fallbackDelay : timing(info.dish).reveal);
        }
        return true;
    }
    function node(tag, className, parent, text) {
        const element = root.document.createElement(tag);
        element.className = className;
        if (text != null) element.textContent = text;
        parent.appendChild(element);
        return element;
    }
    function setPhase(item, phase) {
        if (item.element) item.element.dataset.phase = phase;
    }
    function reveal(item) {
        item.revealed = true;
        setPhase(item, 'reveal');
        sound(item);
    }
    function finish(item, skipped = false) {
        if (item.done) return;
        item.skipped = skipped;
        reveal(item);
        item.done = true;
        clearTimers(item);
        item.element?.remove();
        item.element = null;
        item.stack = null;
        item.score = null;
        if (active === item) active = null;
        item.resolve({ cancelled: item.cancelled === true });
    }
    function materials(item, transfers) {
        if (!item.stack || item.revealed || item.done) return;
        item.stack.replaceChildren();
        const fallback = (item.dish.required || []).map(name => ({ card: { name, type: 'ingredient' } }));
        const costs = (transfers?.length ? transfers : fallback).slice(0, 8);
        costs.forEach((transfer, index) => {
            const card = node('div', 'dish-fx-material', item.stack);
            const image = root.getIngredientImagePath?.(transfer.card?.name);
            if (image) card.style.backgroundImage = `url("${image}")`;
            else card.textContent = transfer.card?.name || '食材';
            const rect = transfer.source?.rect;
            card.style.setProperty('--from-x', `${rect ? rect.left + rect.width / 2 - item.width / 2 : (item.side === 'cpu' ? -1 : 1) * (110 + index * 22)}px`);
            card.style.setProperty('--from-y', `${rect ? rect.top + rect.height / 2 - item.height / 2 : (item.side === 'cpu' ? -1 : 1) * (120 + index * 14)}px`);
            card.style.setProperty('--stack-angle', `${(index - costs.length / 2) * 6}deg`);
            card.style.setProperty('--fade-delay', `${index * item.times.dissolve / Math.max(1, costs.length)}ms`);
            card.style.setProperty('--fade-ms', `${Math.max(40, item.times.dissolve / Math.max(1, costs.length))}ms`);
        });
    }
    function mount(item, transfers) {
        const stage = root.StageLayout?.stage || root.document?.getElementById('app-stage');
        if (!stage) return false;
        item.width = root.StageLayout?.logical?.width || stage.clientWidth || 432;
        item.height = root.StageLayout?.logical?.height || stage.clientHeight || 768;
        const palette = theme(item.dish);
        item.element = node('div', `dish-fx dish-fx-${palette.name}${item.still ? ' dish-fx-still' : ''}`, stage);
        item.element.dataset.layout = item.width <= 500 ? 'mobile' : 'pc';
        item.element.dataset.mode = item.mode;
        item.element.dataset.winning = String(item.winning);
        item.element.setAttribute('role', 'dialog');
        item.element.setAttribute('aria-label', `${item.dish.name} ${item.dish.points}点。タップで演出をスキップ`);
        item.element.style.setProperty('--fx-glow', palette.glow);
        item.element.style.setProperty('--fx-burst', palette.burst);
        item.element.style.setProperty('--flight-ms', `${item.times.flight}ms`);
        item.element.style.setProperty('--burst-ms', `${item.times.burst}ms`);
        item.element.style.setProperty('--fx-power', String(Math.min(1.3, 0.7 + Number(item.dish.points || 0) / 20)));
        node('div', 'dish-fx-aura', item.element);
        node('div', 'dish-fx-lines', item.element);
        item.stack = node('div', 'dish-fx-stack', item.element);
        materials(item, transfers);
        const result = node('div', 'dish-fx-result', item.element);
        node('div', 'dish-fx-headline', result, palette.headline);
        const art = node('div', 'dish-fx-art', result);
        const image = root.getRecipeImagePath?.(item.dish.name) || root.getEventImagePath?.(item.dish.name);
        if (image) art.style.backgroundImage = `url("${image}")`;
        else art.textContent = item.dish.name;
        node('strong', 'dish-fx-name', result, item.dish.name);
        item.score = node('div', 'dish-fx-score', result, `${item.dish.points}点${item.winning ? '　勝負を決めた一皿' : ''}`);
        node('div', 'dish-fx-whiteout', item.element);
        const slam = node('div', 'dish-fx-slam', item.element);
        const words = item.dish.name === '爆弾おにぎり' ? ['爆弾', 'おにぎり', '！'] : item.dish.name === '満腹カレー' ? ['満腹', 'カレー', '！'] : [item.dish.name, '！'];
        words.forEach((word, i) => node('span', '', slam, word).style.setProperty('--word-delay', `${i * item.times.slam / words.length}ms`));
        const burst = node('div', 'dish-fx-burst', item.element);
        node('div', 'dish-fx-fireball', burst);
        node('div', 'dish-fx-ring', burst);
        node('div', 'dish-fx-smoke', burst);
        // At most 12 small elements; only transform and opacity are animated.
        const particleCount = item.mode === 'short' ? 6 : 12;
        for (let i = 0; i < particleCount; i++) {
            const particle = node('i', 'dish-fx-particle', burst);
            const angle = i * Math.PI * 2 / particleCount;
            particle.style.setProperty('--spark-x', `${Math.cos(angle) * (110 + i % 3 * 35)}px`);
            particle.style.setProperty('--spark-y', `${Math.sin(angle) * (110 + i % 3 * 35)}px`);
            particle.style.setProperty('--spark-angle', `${angle}rad`);
        }
        const skip = node('button', 'dish-fx-skip', item.element, 'タップでスキップ');
        skip.type = 'button';
        item.element.addEventListener('pointerdown', event => { event.stopPropagation(); });
        // Keep the shield until click/tap release so input cannot fall through to the board.
        item.element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); finish(item, true); });
        item.element.addEventListener('keydown', event => {
            if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); finish(item, true); }
        });
        skip.focus?.({ preventScroll: true });
        return true;
    }
    function schedule(item, fromReveal = false) {
        const t = item.times;
        let at = fromReveal ? 0 : t.reveal;
        if (!fromReveal) {
            if (t.reveal === 0) reveal(item);
            else {
                setPhase(item, 'flight');
                later(item, () => setPhase(item, 'dissolve'), t.flight);
                later(item, () => setPhase(item, 'glow'), t.flight + t.dissolve);
                later(item, () => reveal(item), at);
            }
        }
        at += t.card;
        if (t.whiteout) {
            later(item, () => setPhase(item, 'whiteout'), at); at += t.whiteout;
            later(item, () => setPhase(item, 'slam'), at); at += t.slam;
            later(item, () => setPhase(item, 'burst'), at); at += t.burst;
            later(item, () => setPhase(item, 'settle'), at); at += t.settle;
        }
        later(item, () => finish(item), at);
    }
    function show(dish, options = {}) {
        if (!dish) return Promise.resolve();
        const item = record(identify(dish, options.side === 'opponent' ? 'cpu' : options.side));
        if (options.winning && !item.winning) return finale(item);
        if (item.started) { materials(item, options.transfers); return item.promise; }
        if (active && active !== item) finish(active, true);
        // The event-card preview gives way to its completed dark dish, including skip mode.
        if (theme(item.dish).name === 'dark') root.hideSpotlightCard?.();
        clearTimers(item);
        item.started = true; item.mode = mode(); item.still = reduced();
        item.times = timing(item.dish, false, item.mode, item.still);
        active = item;
        if (item.mode === 'skip' || !mount(item, options.transfers)) finish(item, true);
        else schedule(item);
        return item.promise;
    }
    function finale(item) {
        item.winning = true;
        // A click skips this completion, including a finale requested later by cpuTurn.
        if (item.skipped) return item.promise;
        if (!item.started) {
            if (active && active !== item) finish(active, true);
            clearTimers(item);
            item.started = true; item.mode = mode(); item.still = reduced();
            item.times = timing(item.dish, true, item.mode, item.still); active = item;
            if (item.mode === 'skip' || !mount(item)) finish(item, true);
            else schedule(item);
        } else if (item.mode !== 'skip') {
            const revealed = item.revealed;
            clearTimers(item);
            item.times = timing(item.dish, true, item.mode, item.still);
            if (item.done) {
                item.done = false;
                item.promise = new Promise(resolve => { item.resolve = resolve; });
                active = item;
                if (!mount(item)) { finish(item); return item.promise; }
            }
            item.element.dataset.winning = 'true';
            item.score.textContent = `${item.dish.points}点　勝負を決めた一皿`;
            item.element.style.setProperty('--burst-ms', `${item.times.burst}ms`);
            if (revealed) { reveal(item); schedule(item, true); }
            else schedule(item);
        }
        return item.promise;
    }
    function cancel() {
        for (const item of records.values()) {
            item.cancelled = true;
            item.soundCue = null;
            if (!item.done) finish(item, true);
            clearTimers(item);
        }
        records.clear();
    }
    function settingsHtml(prefix, includeCpu = true) {
        const p = preferences();
        return `<div class="reference-item"><div class="reference-title">料理演出</div>
            <label class="settings-label" for="${prefix}-dish-mode">料理演出</label>
            <select id="${prefix}-dish-mode" class="settings-select">${[['normal', '通常'], ['short', '短縮'], ['skip', 'スキップ']].map(([value, label]) => `<option value="${value}"${p.dishMode === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
            <div class="settings-note">演出中はどこでもタップしてスキップできます。短縮でも料理カードを表示し、スキップは結果を即時反映します。動きを減らす端末設定では静かな短縮表示になります。</div></div>${includeCpu ? `<div class="reference-item"><div class="reference-title">CPUの速さ</div><label class="settings-label" for="${prefix}-cpu-speed">CPUの速さ</label><select id="${prefix}-cpu-speed" class="settings-select">${[['default', 'デフォルト'], ['fast', '処理最速'], ['relaxed', 'まったり']].map(([value, label]) => `<option value="${value}"${p.cpuSpeed === value ? ' selected' : ''}>${label}</option>`).join('')}</select><div class="settings-note">まったりMode：考え中…の間を取り、CPUの行動を一つずつゆっくり表示します。</div></div>` : ''}`;
    }
    function bindSettings(prefix) {
        const dish = root.document.getElementById(`${prefix}-dish-mode`);
        const speed = root.document.getElementById(`${prefix}-cpu-speed`);
        dish?.addEventListener('change', () => { save({ dishMode: dish.value }); if (dish.value === 'skip' && active) finish(active, true); });
        speed?.addEventListener('change', () => {
            const p = save({ cpuSpeed: speed.value });
            if (state()?.settings) state().settings.cpuSpeed = p.cpuSpeed;
        });
    }
    root.DishEffects = { key, preferences, save, mode, theme, timing, show, queueCookSound, cancel, settingsHtml, bindSettings,
        cpuSpeed: () => preferences().cpuSpeed,
        skip: () => { if (active) finish(active, true); },
        waitForActive: () => active?.promise || Promise.resolve(),
        isActive: () => !!active };
    root.addEventListener?.('pagehide', cancel);
})(typeof window === 'undefined' ? globalThis : window);
