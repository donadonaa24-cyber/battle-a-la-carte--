(function (root) {
    'use strict';
    const STORAGE_KEY = 'balc_achievements_v1';
    const DEFINITIONS = Object.freeze([
        ['firstDish', 'はじめての一皿', '料理を1回作る', '', 'dishes', 1],
        ['dish10', '見習いシェフ', '料理を10回作る', '', 'dishes', 10],
        ['dish50', '一人前の料理人', '料理を50回作る', '', 'dishes', 50],
        ['dish100', '百品の料理人', '料理を100回作る', 'silver', 'dishes', 100],
        ['dish500', '千皿の達人', '料理を500回作る', 'gold', 'dishes', 500],
        ['firstWin', '初勝利', '1回勝つ', '', 'wins', 1],
        ['win10', '腕利きシェフ', '10回勝つ', '', 'wins', 10],
        ['win50', '常連の名店', '50回勝つ', 'silver', 'wins', 50],
        ['win100', '百戦錬磨', '100回勝つ', 'gold', 'wins', 100],
        ['matches100', '厨房の住人', '100試合遊ぶ', '', 'matches', 100],
        ['stew7', '煮込みの名人', '7点料理（カレー・クリームシチュー）を作る'],
        ['bakudan', '爆弾職人', '爆弾おにぎりを作る'],
        ['manpuku', '満腹の料理長', '満腹カレーを作る'],
        ['recipeComplete', '料理図鑑コンプリート', '18種類すべての通常レシピを作る', 'gold', 'recipes', 18],
        ['sousaku', '禁断の一皿', '創作料理を作る'],
        ['masterChefWin', '料理の達人', '料理の達人で勝つ'],
        ['fullBellyWin', '満腹マスター', '満腹マスターで勝つ'],
        ['skillMaster', 'スキルマスター', '6つのスキルすべてで勝つ', 'gold', 'skillsWon', 6],
        ['allCharacters', '4人の師匠', '4人のキャラクターすべてで勝つ', 'silver', 'charactersWon', 4],
        ['fullCourse', 'フルコース設備', '加工アイテムを3つ全部持って勝つ'],
        ['storyComplete', '物語の結末', 'ストーリー全3話をクリア', 'silver', 'storyClears', 3],
        ['missionFirst', '挑戦者', 'ミッションを1つクリア', '', 'missionClears', 1],
        ['missionComplete', 'ミッションコンプリート', 'ミッションを全部クリア', 'gold', 'missionClears', 6],
        ['battleMode', 'Battle à la carte', 'Battle à la carte Mode に覚醒する'],
        ['onlineFirstWin', 'はじめての対戦相手', '通信対戦で初めて勝つ', '', 'onlineWins', 1],
        ['onlineWin10', '名店の看板', '通信対戦で10回勝つ', 'silver', 'onlineWins', 10],
        ['shutout', '完封勝利', '相手を0点のまま勝つ', '', '', 0, '相手に何もさせない…？'],
        ['comeback9', '一発逆転', '相手が9点・自分が3点以下の状態から勝つ', '', '', 0, '絶体絶命からの…'],
        ['oneShot', '一撃必殺', '0点から10点料理1皿で一気に勝つ', '', '', 0, '一皿ですべてを決める'],
        ['feast8', '食べ放題', '1試合で料理を8回作る', '', '', 0, 'とにかくたくさん作ってみよう'],
        ...[['Chizuru', 'chizuru', '千鶴'], ['Mai', 'mai', '舞依'], ['Takumi', 'takumi', '拓海'], ['Akatsuki', 'akatsuki', '暁']]
            .flatMap(([key, character, name]) => [5, 20, 50].map(count =>
                [`char${key}${count}`, `${name}${count === 5 ? '見習い' : count === 20 ? 'の相棒' : 'マスター'}`,
                    `${name}を自分のキャラとして${count}回使う`, count === 50 ? 'silver' : '', `character:${character}`, count])),
        ['storyFestival', '文化祭の思い出', '出会い・文化祭編（第4〜10話）をすべてクリア', 'gold', 'festivalClears', 7]
    ].map(([id, title, condition, frame = '', progress = '', target = 0, hint = '']) =>
        Object.freeze({ id, title, condition, frame, progress, target, hint, hidden: !!hint })));
    const getDefinition = id => DEFINITIONS.find(d => d.id === id) || null;
    const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    const unique = list => Array.from(new Set(Array.isArray(list) ? list : []));
    const characters = ['chizuru', 'mai', 'takumi', 'akatsuki'];
    const skills = ['lastOrder', 'kitchenInfiltration', 'makanaiSupply', 'foodTrap', 'aceProcurement', 'tasteThief'];
    const recipeNames = () => (root.recipes || []).map(r => r.name);
    let cached = null, syncPending = null, syncAgain = false, toastTimer = null;
    const toastQueue = [];
    function empty() {
        return { unlocked: {}, counters: { dishes: 0, wins: 0, matches: 0, onlineWins: 0, missionClears: 0,
            storyClears: 0, festivalClears: 0, characterUses: {}, retroactiveUnlocked: 0, matchRecords: {} },
        sets: { recipes: [], skillsWon: [], charactersWon: [] }, selectedTitle: '', selectedFrame: 'none',
        migratedFromProfileAt: null, rewardsMigratedAt: null };
    }
    function validateCosmetics(info = {}) {
        return { title: getDefinition(info?.title) ? info.title : '', frame: ['silver', 'gold'].includes(info?.frame) ? info.frame : 'none' };
    }
    function availableFrames(data = readLocal()) {
        return ['none', ...['silver', 'gold'].filter(tier => DEFINITIONS.some(d => d.frame === tier && data.unlocked[d.id]))];
    }
    function normalize(raw) {
        const value = empty();
        if (!raw || typeof raw !== 'object') return value;
        for (const d of DEFINITIONS) {
            const when = date(raw.unlocked?.[d.id]);
            if (when) value.unlocked[d.id] = when;
        }
        for (const key of Object.keys(value.counters)) if (!['matchRecords', 'characterUses'].includes(key)) value.counters[key] = number(raw.counters?.[key]);
        for (const id of characters) value.counters.characterUses[id] = number(raw.counters?.characterUses?.[id]);
        for (const def of DEFINITIONS) if (!def.progress) value.counters[def.id] = number(raw.counters?.[def.id]);
        for (const [key, entry] of Object.entries(raw.counters?.matchRecords || {})) {
            if (!entry || typeof entry !== 'object' || key === '__proto__' || key === 'constructor') continue;
            value.counters.matchRecords[key] = { dishes: number(entry.dishes), ended: entry.ended === true,
                newIds: unique(entry.newIds).filter(getDefinition),
                characterId: characters.includes(entry.characterId) ? entry.characterId : null,
                story: entry.story === true || entry.achievementStory === true || !!entry.storyEpisodeId,
                characterCounted: entry.characterCounted === true };
        }
        value.sets.recipes = unique(raw.sets?.recipes).filter(name => recipeNames().includes(name));
        value.sets.skillsWon = unique(raw.sets?.skillsWon).filter(key => skills.includes(key));
        value.sets.charactersWon = unique(raw.sets?.charactersWon).filter(key => characters.includes(key));
        value.selectedTitle = value.unlocked[raw.selectedTitle] && getDefinition(raw.selectedTitle) ? raw.selectedTitle : '';
        value.selectedFrame = availableFrames(value).includes(raw.selectedFrame) ? raw.selectedFrame : 'none';
        value.migratedFromProfileAt = date(raw.migratedFromProfileAt);
        value.rewardsMigratedAt = date(raw.rewardsMigratedAt);
        return value;
    }
    function readJson(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
    }
    function readLocal() {
        if (!cached) cached = normalize(readJson(STORAGE_KEY));
        return JSON.parse(JSON.stringify(cached));
    }
    function writeLocal(value) {
        cached = value;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (_) { /* Keep working in memory. */ }
        root.renderStartMenuPlayerCard?.();
    }
    function matchKey(state, options = {}) {
        return options.matchKey || state?.achievementMatchId || `legacy-${state?.matchStartedAt || 0}`;
    }
    function receipt(data, state, options) {
        const key = matchKey(state, options);
        if (!Object.prototype.hasOwnProperty.call(data.counters.matchRecords, key)) {
            Object.defineProperty(data.counters.matchRecords, key, { enumerable: true, writable: true,
                value: { dishes: 0, ended: false, newIds: [] } });
        }
        return data.counters.matchRecords[key];
    }
    function addRecipe(data, name) {
        if (recipeNames().includes(name) && !data.sets.recipes.includes(name)) data.sets.recipes.push(name);
        if (['カレー', 'クリームシチュー'].includes(name)) data.counters.stew7 = 1;
        if (name === '爆弾おにぎり') data.counters.bakudan = 1;
        if (name === '満腹カレー') data.counters.manpuku = 1;
        if (name === '創作料理') data.counters.sousaku = 1;
    }
    function progressFor(def, data = readLocal()) {
        if (def.progress.startsWith('character:')) return { value: number(data.counters.characterUses[def.progress.slice(10)]), target: def.target };
        return def.progress ? { value: data.sets[def.progress]?.length ?? number(data.counters[def.progress]), target: def.target } : null;
    }
    function check(data, { silent = false, state = null, options = {} } = {}) {
        const newIds = [];
        for (const def of DEFINITIONS) {
            const progress = progressFor(def, data);
            if (data.unlocked[def.id] || !(progress ? progress.value >= progress.target : data.counters[def.id] > 0)) continue;
            data.unlocked[def.id] = new Date().toISOString();
            newIds.push(def.id);
        }
        if (!silent && state && newIds.length) receipt(data, state, options).newIds.push(...newIds);
        writeLocal(data);
        if (newIds.length) root.Missions?.refreshCosmetics?.();
        if (!silent && newIds.length) {
            if (state && ((!state.gameEnded && !state.achievementStory && !root.__storyActiveEpisodeId) ||
                newIds.some(id => id.startsWith('char') || id === 'storyFestival'))) enqueueToasts(newIds);
            renderScreen(); renderPicker();
            void syncCurrentAccount();
        }
        return newIds;
    }
    function completionCounters(data, missions, story) {
        const missionIds = root.Missions?.definitions?.map(d => d.id) || ['noItems', 'bakudanOnigiri', 'manpukuCurry', 'noSkill', 'noEvent', 'comeback'];
        data.counters.missionClears = Math.max(data.counters.missionClears, missionIds.filter(id => missions?.cleared?.[id]).length);
        data.counters.storyClears = Math.max(data.counters.storyClears, ['episode1', 'episode2', 'episode3'].filter(id => story?.[id]).length);
        data.counters.festivalClears = Math.max(data.counters.festivalClears,
            ['episode4', 'episode5', 'episode6', 'episode7', 'episode8', 'episode9', 'episode10'].filter(id => story?.[id] === true).length);
    }
    function initialize() {
        const data = readLocal();
        if (data.migratedFromProfileAt && data.rewardsMigratedAt) return data;
        const profile = readJson('battle-a-la-carte:user-profile:v1') || {};
        if (!data.migratedFromProfileAt) {
            for (const key of ['dishes', 'wins', 'matches']) data.counters[key] = Math.max(data.counters[key], number(profile.stats?.[key]));
            for (const entry of Array.isArray(profile.recentDishes) ? profile.recentDishes : []) addRecipe(data, entry?.name);
            const missions = readJson('balc_missions_v1');
            completionCounters(data, missions, readJson('battleAlaCarteStoryProgressV1'));
            if (missions?.cleared?.bakudanOnigiri) addRecipe(data, '爆弾おにぎり');
            if (missions?.cleared?.manpukuCurry) addRecipe(data, '満腹カレー');
            data.migratedFromProfileAt = new Date().toISOString();
            data.counters.retroactiveUnlocked = check(data, { silent: true }).length;
            // An old autosave's existing dishes are already in the old profile totals.
            const saved = readJson('battle-a-la-carte:match-autosave:v1')?.snapshot;
            if (saved && !saved.gameEnded) receipt(data, saved).dishes = saved.players?.player?.cookedRecipes?.length || 0;
            writeLocal(data);
        }
        // Existing profile totals did not retain usage: never infer it from a favourite or a win.
        if (!data.rewardsMigratedAt) {
            const counts = Object.fromEntries(characters.map(id => [id, 0]));
            for (const record of Object.values(data.counters.matchRecords)) {
                if (!record.ended || record.story || !characters.includes(record.characterId)) continue;
                counts[record.characterId]++; record.characterCounted = true;
            }
            for (const id of characters) data.counters.characterUses[id] = Math.max(number(data.counters.characterUses[id]),
                counts[id], number(profile.stats?.characterUses?.[id]));
            completionCounters(data, readJson('balc_missions_v1'), readJson('battleAlaCarteStoryProgressV1'));
            data.rewardsMigratedAt = new Date().toISOString();
            const retroactive = check(data, { silent: true }).length;
            data.counters.retroactiveUnlocked += retroactive;
            writeLocal(data);
        }
        return readLocal();
    }
    function observeMatch(state, options = {}) {
        // Workers record only rule-state tracking. Each browser consumes its own private projection.
        if (typeof document === 'undefined' || !state?.players?.player) return [];
        initialize();
        if (root.__storyActiveEpisodeId) state.achievementStory = true;
        if (state.achievementStory || state.storyEpisodeId) return [];
        const data = readLocal(), record = receipt(data, state, options), own = state.players.player;
        const history = Array.isArray(own.cookedRecipes) ? own.cookedRecipes : [];
        const extra = Math.max(0, history.length - record.dishes);
        data.counters.dishes += extra;
        for (const dish of history.slice(0, extra)) addRecipe(data, dish.name);
        record.dishes = Math.max(record.dishes, history.length);
        if (history.length >= 8) data.counters.feast8 = 1;
        if (own.battleALaCarteModeActive) data.counters.battleMode = 1;
        if (state.gameEnded && !record.characterCounted && characters.includes(state.characterIds?.player)) {
            record.characterId = state.characterIds.player;
            record.characterCounted = true;
            data.counters.characterUses[record.characterId] = number(data.counters.characterUses[record.characterId]) + 1;
        }
        if (state.gameEnded && !record.ended) {
            record.ended = true;
            data.counters.matches++;
            if (state.winner === 'player') {
                data.counters.wins++;
                if (options.online || root.FriendBattle?.isActive?.()) data.counters.onlineWins++;
                if (skills.includes(own.selectedSkillKey) && !data.sets.skillsWon.includes(own.selectedSkillKey)) data.sets.skillsWon.push(own.selectedSkillKey);
                const character = state.characterIds?.player;
                if (characters.includes(character) && !data.sets.charactersWon.includes(character)) data.sets.charactersWon.push(character);
                if (state.specialWinReason === '料理の達人') data.counters.masterChefWin = 1;
                if (state.specialWinReason === '満腹マスター') data.counters.fullBellyWin = 1;
                if (['board', 'freezer', 'ecoBag'].every(key => own.packs?.some(p => p.key === key))) data.counters.fullCourse = 1;
                const tracking = own.achievementTracking;
                if (tracking?.completeHistory === true && tracking.opponentMaxScore === 0 && state.players.cpu?.score === 0) data.counters.shutout = 1;
                if (tracking?.comeback9Seen) data.counters.comeback9 = 1;
                if (!state.surrenderedBy && tracking?.lastDish?.beforeScore === 0 && tracking.lastDish.points === 10 &&
                    state.lastCookedRecipe?.side === 'player' && own.score >= 10) data.counters.oneShot = 1;
            }
        }
        return check(data, { state, options });
    }
    function refreshCompletions({ missions, story, silent = false } = {}) {
        initialize();
        const data = readLocal();
        completionCounters(data, missions || readJson('balc_missions_v1'), story || readJson('battleAlaCarteStoryProgressV1'));
        return check(data, { silent, state: silent ? null : root.GameState });
    }
    function matchUnlocks(state = root.GameState, options = {}) {
        const data = readLocal();
        return (data.counters.matchRecords[matchKey(state, options)]?.newIds || []).map(getDefinition).filter(Boolean);
    }
    function selectTitle(id) {
        const data = readLocal();
        if (id && (!getDefinition(id) || !data.unlocked[id])) return false;
        data.selectedTitle = id || ''; writeLocal(data); renderPicker(); root.updateUI?.(); return true;
    }
    function selectFrame(tier) {
        const data = readLocal();
        if (!availableFrames(data).includes(tier)) return false;
        data.selectedFrame = tier; writeLocal(data); renderPicker(); root.updateUI?.(); return true;
    }
    function selectedCosmetics() {
        const data = readLocal();
        return validateCosmetics({ title: data.selectedTitle, frame: data.selectedFrame });
    }
    function displayName(name, info = selectedCosmetics()) {
        const def = getDefinition(validateCosmetics(info).title);
        return `${def ? `「${def.title}」` : ''}${name || 'プレイヤー'}`;
    }
    function applyFrame(element, info = selectedCosmetics()) {
        if (!element) return;
        const { frame } = validateCosmetics(info);
        for (const tier of ['silver', 'gold']) element.classList.toggle(`achievement-frame-${tier}`, frame === tier);
    }
    async function syncAccount(client) {
        if (!client?.rpc) return false;
        try {
            initialize();
            const response = await client.rpc('balc_get_achievements');
            if (response.error) return false;
            const remote = new Set(), data = readLocal();
            for (const row of Array.isArray(response.data) ? response.data : []) {
                if (!getDefinition(row?.achievement_id)) continue;
                remote.add(row.achievement_id);
                const when = date(row.unlocked_at) || new Date().toISOString();
                if (!data.unlocked[row.achievement_id] || when < data.unlocked[row.achievement_id]) data.unlocked[row.achievement_id] = when;
            }
            writeLocal(data); renderScreen(); renderPicker(); root.Missions?.refreshCosmetics?.();
            let uploaded = true;
            for (const id of Object.keys(data.unlocked)) {
                if (remote.has(id)) continue;
                try {
                    const response = await client.rpc('balc_record_achievement', { p_achievement_id: id });
                    if (response.error) uploaded = false;
                } catch (_) { uploaded = false; }
            }
            return uploaded;
        } catch (_) { return false; }
    }
    async function syncCurrentAccount() {
        if (syncPending) { syncAgain = true; return syncPending; }
        syncPending = (async () => {
            try {
                let synced = false;
                do {
                    syncAgain = false;
                    const client = await root.FriendBattle?.getMissionAccountClient?.();
                    synced = client ? await syncAccount(client) : false;
                } while (syncAgain);
                return synced;
            } catch (_) { return false; }
        })();
        try { return await syncPending; } finally { syncPending = null; }
    }
    function append(parent, tag, text, className = '') {
        const el = document.createElement(tag); el.className = className; el.textContent = text; parent.appendChild(el); return el;
    }
    function renderScreen() {
        const list = document.getElementById('achievement-list');
        if (!list) return;
        const data = readLocal(); list.replaceChildren();
        const header = document.getElementById('achievement-count');
        if (header) header.textContent = `達成 ${Object.keys(data.unlocked).length} / ${DEFINITIONS.length}`;
        const summary = document.getElementById('achievement-migration-summary');
        if (summary) summary.textContent = `これまでの記録から ${data.counters.retroactiveUnlocked} 個を達成済みにしました`;
        for (const def of DEFINITIONS) {
            const unlocked = data.unlocked[def.id], concealed = def.hidden && !unlocked;
            const card = append(list, 'article', '', `achievement-card${unlocked ? ' unlocked' : ''}`);
            card.dataset.achievementId = def.id;
            append(card, 'strong', concealed ? '？？？' : def.title);
            append(card, 'p', concealed ? def.hint : def.condition);
            if (def.frame) append(card, 'span', def.frame === 'gold' ? '金枠' : '銀枠', `achievement-tier ${def.frame}`);
            const reward = root.Missions?.rewardForAchievement?.(def.id);
            if (reward) append(card, 'span', reward, 'achievement-reward');
            const progress = progressFor(def, data);
            if (progress && !concealed) {
                const value = Math.min(progress.value, progress.target);
                const bar = append(card, 'progress', ''); bar.max = progress.target; bar.value = value;
                bar.setAttribute('aria-label', def.condition);
                append(card, 'span', `${value} / ${progress.target}`, 'achievement-progress');
            }
            if (unlocked) {
                const when = append(card, 'time', `達成日 ${new Date(unlocked).toLocaleDateString('ja-JP')}`);
                when.dateTime = unlocked;
            } else append(card, 'span', '未達成', 'achievement-status');
        }
    }
    function renderPicker() {
        const title = document.getElementById('achievement-title-picker'), frame = document.getElementById('achievement-frame-picker');
        const data = readLocal();
        if (title) {
            title.replaceChildren(); append(title, 'option', '称号なし').value = '';
            for (const def of DEFINITIONS) if (data.unlocked[def.id]) append(title, 'option', def.title).value = def.id;
            title.value = data.selectedTitle;
        }
        if (frame) {
            frame.replaceChildren();
            for (const tier of availableFrames(data)) append(frame, 'option', { none: '枠なし', silver: '銀枠', gold: '金枠' }[tier]).value = tier;
            frame.value = data.selectedFrame;
        }
        const preview = document.getElementById('achievement-profile-name');
        if (preview) preview.textContent = displayName(root.getUserProfile?.().name);
        const icon = document.getElementById('achievement-profile-icon');
        if (icon) {
            for (const id of characters) icon.classList.toggle(`char-${id}`, id === (root.getUserProfile?.().favoriteCharacterId || 'chizuru'));
            applyFrame(icon);
        }
    }
    function renderResult(parent, state = root.GameState) {
        const ids = matchUnlocks(state);
        if (!parent || !ids.length) return;
        const block = append(parent, 'section', '', 'result-achievements');
        append(block, 'h3', '今回のアチーブメント');
        const list = append(block, 'ul', '');
        for (const def of ids) append(list, 'li', `『${def.title}』${def.frame ? (def.frame === 'gold' ? '・金枠解放' : '・銀枠解放') : ''}${root.Missions?.rewardForAchievement?.(def.id) ? `・${root.Missions.rewardForAchievement(def.id)}` : ''}`);
    }
    function enqueueToasts(ids) {
        toastQueue.push(...ids.map(getDefinition).filter(Boolean));
        if (!toastTimer) showNextToast();
    }
    function showNextToast() {
        const el = document.getElementById('achievement-toast'), def = toastQueue.shift();
        if (!el || !def) return;
        el.textContent = `アチーブメント解除！『${def.title}』`; el.classList.remove('hidden');
        toastTimer = setTimeout(() => { el.classList.add('hidden'); toastTimer = null; showNextToast(); }, 3000);
    }
    function clearToasts() {
        if (toastTimer !== null) root.clearTimeout?.(toastTimer);
        toastTimer = null; toastQueue.length = 0;
        if (typeof document !== 'undefined') document.getElementById('achievement-toast')?.classList.add('hidden');
    }
    function init() {
        initialize(); renderScreen(); renderPicker();
        let returnStage = 'start-menu-stage';
        for (const [id, stage] of [['menu-achievements-button', 'start-menu-stage'], ['menu-player-achievements-button', 'start-menu-stage'], ['user-achievements-button', 'start-user-stage']]) {
            document.getElementById(id)?.addEventListener('click', () => {
                returnStage = stage; renderScreen(); root.showStartStage?.('start-achievements-stage');
            });
        }
        document.getElementById('achievement-close-button')?.addEventListener('click', () => root.showStartStage?.(returnStage));
        document.getElementById('achievement-title-picker')?.addEventListener('change', e => selectTitle(e.target.value));
        document.getElementById('achievement-frame-picker')?.addEventListener('change', e => selectFrame(e.target.value));
        void syncCurrentAccount();
    }
    root.Achievements = Object.freeze({ definitions: DEFINITIONS, getDefinition, readLocal, initialize, observeMatch,
        refreshCompletions, matchUnlocks, progressFor, selectTitle, selectFrame, selectedCosmetics, availableFrames,
        validateCosmetics, displayName, applyFrame, syncAccount, syncCurrentAccount, renderScreen, renderPicker, renderResult, clearToasts });
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
})(typeof window === 'undefined' ? globalThis : window);
