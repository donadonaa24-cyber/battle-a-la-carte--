(function () {
    'use strict';

    const STORAGE_KEY = 'balc_missions_v1';
    const STORY_KEY = 'battleAlaCarteStoryProgressV1';
    const DEFINITIONS = Object.freeze([
        { id: 'noItems', name: '素材で勝負', condition: '対戦中に加工アイテムを一度も交換しない', sleeveName: 'まな板（木目）スリーブ', imageId: 'no-items', hint: '加工アイテム交換なし' },
        { id: 'bakudanOnigiri', name: '爆弾おにぎりで勝利', condition: '爆弾おにぎりを1回以上完成させる', sleeveName: '爆弾おにぎりスリーブ', imageId: 'bakudan-onigiri' },
        { id: 'manpukuCurry', name: '満腹カレーで勝利', condition: '満腹カレーを1回以上完成させる', sleeveName: '満腹カレースリーブ', imageId: 'manpuku-curry' },
        { id: 'noSkill', name: 'スキル封印', condition: 'スキル発動ボタンのスキルを一度も使わない', sleeveName: '料理人の帽子スリーブ', imageId: 'no-skill', hint: 'スキル使用なし' },
        { id: 'noEvent', name: 'イベント禁止', condition: 'イベントカードを1枚も使わない（緊急料理・創作料理を含む。手札整理・まな板の交換で捨てる場合は除く）', sleeveName: '真っ白なお皿スリーブ', imageId: 'no-event', hint: 'イベント使用なし' },
        { id: 'comeback', name: '大逆転', condition: '対戦中に相手の点数が自分より5点以上高くなったことがある', sleeveName: '炎のスリーブ', imageId: 'comeback' }
    ]);
    const isMobile = /\/mobile\//.test(window.location?.pathname || '');
    const imageRoot = `${isMobile ? '../' : ''}assets/battle-images/`;
    const REWARD_SLEEVES = Object.freeze([
        { id: 'sleeve-char-chizuru', sleeveName: '千鶴のスリーブ', achievement: 'charChizuru20' },
        { id: 'sleeve-char-mai', sleeveName: '舞依のスリーブ', achievement: 'charMai20' },
        { id: 'sleeve-char-takumi', sleeveName: '拓海のスリーブ', achievement: 'charTakumi20' },
        { id: 'sleeve-char-akatsuki', sleeveName: '暁のスリーブ', achievement: 'charAkatsuki20' },
        { id: 'sleeve-festival-six', sleeveName: '六人集合のスリーブ', achievement: 'storyFestival' }
    ].map(Object.freeze));
    const BOARDS = Object.freeze([
        { id: 'board-char-chizuru', name: '千鶴の盤面背景', achievement: 'charChizuru50' },
        { id: 'board-char-mai', name: '舞依の盤面背景', achievement: 'charMai50' },
        { id: 'board-char-takumi', name: '拓海の盤面背景', achievement: 'charTakumi50' },
        { id: 'board-char-akatsuki', name: '暁の盤面背景', achievement: 'charAkatsuki50' },
        { id: 'board-festival-classroom', name: '文化祭の教室', achievement: 'storyFestival' }
    ].map(Object.freeze));
    let accountNote = '';

    function getDefinition(id) { return DEFINITIONS.find(item => item.id === id) || null; }
    function emptyStorage() { return { cleared: {}, selectedSleeve: 'default', selectedBoard: 'default' }; }
    function rewardUnlocked(def) { return !!def && !!window.Achievements?.readLocal().unlocked[def.achievement]; }
    function sleeveUnlocked(id, cleared) {
        return id === 'default' || !!(getDefinition(id) && cleared[id]) || rewardUnlocked(REWARD_SLEEVES.find(def => def.id === id));
    }
    function readLocal() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const value = raw ? JSON.parse(raw) : null;
            if (!value || typeof value !== 'object') return emptyStorage();
            const cleared = {};
            for (const [id, date] of Object.entries(value.cleared || {})) {
                if (getDefinition(id) && typeof date === 'string') cleared[id] = date;
            }
            const selectedSleeve = sleeveUnlocked(value.selectedSleeve, cleared)
                ? value.selectedSleeve : 'default';
            const selectedBoard = rewardUnlocked(BOARDS.find(def => def.id === value.selectedBoard)) ? value.selectedBoard : 'default';
            return { cleared, selectedSleeve, selectedBoard };
        } catch (_) { return emptyStorage(); }
    }
    function writeLocal(value) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true; }
        catch (_) { return false; }
    }
    function isUnlocked() {
        try { return !!JSON.parse(localStorage.getItem(STORY_KEY) || '{}').episode1; }
        catch (_) { return false; }
    }
    function sleevePath(id) {
        if (REWARD_SLEEVES.some(def => def.id === id)) return `${imageRoot}sleeves/${id}.webp`;
        const def = getDefinition(id);
        return def ? `${imageRoot}sleeves/sleeve-${def.imageId}.webp` : `${imageRoot}card-back.webp`;
    }
    function getCardBackPath() { return sleevePath(readLocal().selectedSleeve); }
    function applySleeve() {
        document.documentElement?.style?.setProperty('--selected-card-back', `url("${getCardBackPath()}")`);
    }
    function selectSleeve(id) {
        const value = readLocal();
        if (!sleeveUnlocked(id, value.cleared)) return false;
        value.selectedSleeve = id;
        writeLocal(value);
        applySleeve();
        renderSleevePicker();
        return true;
    }
    function boardPath(id) { return BOARDS.some(def => def.id === id) ? `${imageRoot}boards/${id}.webp` : null; }
    function applyBoard() {
        const path = boardPath(readLocal().selectedBoard);
        // A device cosmetic only: never read it from match state or send it to the opponent.
        const field = document.getElementById('pc-player-field') || document.getElementById('mobile-player-field');
        if (!field) return;
        field.style.setProperty('--selected-board-background', path ? `url("${path}")` : 'none');
        field.classList.toggle('has-board-background', !!path);
    }
    function selectBoard(id) {
        if (id !== 'default' && !rewardUnlocked(BOARDS.find(def => def.id === id))) return false;
        const value = readLocal(); value.selectedBoard = id; writeLocal(value);
        applyBoard(); renderBoardPicker(); return true;
    }
    function rewardForAchievement(id) {
        return [...REWARD_SLEEVES.filter(def => def.achievement === id).map(def => def.sleeveName),
            ...BOARDS.filter(def => def.achievement === id).map(def => def.name)].join('・');
    }
    function renderBoardPicker() {
        const selected = readLocal().selectedBoard;
        for (const picker of [document.getElementById('board-picker'), document.getElementById('settings-board-picker')].filter(Boolean)) {
            picker.replaceChildren();
            for (const def of [{ id: 'default', name: 'デフォルト' }, ...BOARDS.filter(rewardUnlocked)]) {
                const button = appendText(picker, 'button', `board-choice${selected === def.id ? ' selected' : ''}`, '');
                button.type = 'button'; button.dataset.boardId = def.id;
                button.setAttribute('aria-pressed', String(selected === def.id));
                const path = boardPath(def.id);
                if (path) { const image = document.createElement('img'); image.src = path; image.alt = ''; button.appendChild(image); }
                appendText(button, 'span', '', def.name);
            }
        }
    }
    function refreshCosmetics() { applySleeve(); applyBoard(); renderSleevePicker(); renderBoardPicker(); }
    function observeScores(state) {
        if (!state?.players) return;
        for (const side of ['player', 'cpu']) {
            const own = state.players[side];
            const other = state.players[side === 'player' ? 'cpu' : 'player'];
            if (!own || !other) continue;
            own.maxDeficit = Math.max(Number(own.maxDeficit) || 0, (Number(other.score) || 0) - (Number(own.score) || 0));
        }
    }
    function hasCooked(player, name) {
        return Array.isArray(player?.cookedRecipes) && player.cookedRecipes.some(entry => entry?.name === name);
    }
    function conditionMet(id, player) {
        if (!player) return false;
        switch (id) {
            case 'noItems': return !(Number(player.packsExchangedCount) > 0);
            case 'bakudanOnigiri': return hasCooked(player, '爆弾おにぎり');
            case 'manpukuCurry': return hasCooked(player, '満腹カレー');
            case 'noSkill': return !(Number(player.skillsUsedCount) > 0);
            case 'noEvent': return !(Number(player.eventsUsedCount) > 0);
            case 'comeback': return Number(player.maxDeficit) >= 5;
            default: return false;
        }
    }
    function impossible(id, player) {
        return ['noItems', 'noSkill', 'noEvent'].includes(id) && !conditionMet(id, player);
    }
    function progressHint(id, player) {
        if (id === 'bakudanOnigiri') return `爆弾おにぎり：${conditionMet(id, player) ? '完成！' : '未完成'}`;
        if (id === 'manpukuCurry') return `満腹カレー：${conditionMet(id, player) ? '完成！' : '未完成'}`;
        if (id === 'comeback') return `最大差：${Number(player?.maxDeficit) || 0}点`;
        return getDefinition(id)?.hint || '';
    }
    function refreshBanner(state = window.GameState) {
        const banner = document.getElementById('mission-banner');
        if (!banner) return;
        const id = state?.activeMissionId;
        const def = getDefinition(id);
        const active = !!def && !window.FriendBattle?.isActive?.() && !state.gameEnded;
        banner.classList.toggle('hidden', !active);
        if (!active) return;
        observeScores(state);
        const failed = impossible(id, state.players?.player);
        if (failed && !state.missionFailedLogged) {
            state.missionFailedLogged = true;
            if (typeof window.addLog === 'function') window.addLog(`ミッション「${def.name}」失敗。対戦は続きます。`);
        }
        banner.textContent = failed ? 'ミッション失敗（対戦は続きます）'
            : `ミッション：${def.name}（${progressHint(id, state.players?.player)}）`;
    }
    async function getAccountClient() {
        try { return await window.FriendBattle?.getMissionAccountClient?.() || null; }
        catch (_) { return null; }
    }
    async function syncAccount(client) {
        if (!client || typeof client.rpc !== 'function') return false;
        try {
            const response = await client.rpc('balc_get_mission_clears');
            if (response.error) throw response.error;
            const rows = Array.isArray(response.data) ? response.data : [];
            const local = readLocal();
            const remote = new Set();
            for (const row of rows) {
                if (!getDefinition(row?.mission_id)) continue;
                remote.add(row.mission_id);
                if (!local.cleared[row.mission_id]) local.cleared[row.mission_id] = row.cleared_at || new Date().toISOString();
            }
            writeLocal(local);
            window.Achievements?.refreshCompletions({ missions: local, silent: true });
            applySleeve();
            renderMissionList();
            renderSleevePicker();
            for (const id of Object.keys(local.cleared)) {
                if (remote.has(id)) continue;
                const upload = await client.rpc('balc_record_mission_clear', { p_mission_id: id });
                if (upload.error) throw upload.error;
            }
            accountNote = '';
            renderMissionList();
            return true;
        } catch (_) {
            accountNote = 'アカウントへの保存は準備中です';
            renderMissionList();
            return false;
        }
    }
    async function syncCurrentAccount() {
        const client = await getAccountClient();
        if (client) return syncAccount(client);
        return false;
    }
    function recordClear(id) {
        if (!getDefinition(id)) return false;
        const local = readLocal();
        if (local.cleared[id]) { void syncCurrentAccount(); return false; }
        local.cleared[id] = new Date().toISOString();
        writeLocal(local);
        window.Achievements?.refreshCompletions({ missions: local });
        renderMissionList();
        renderSleevePicker();
        void (async () => {
            const client = await getAccountClient();
            if (client) {
                try {
                    const result = await client.rpc('balc_record_mission_clear', { p_mission_id: id });
                    if (result.error) throw result.error;
                } catch (_) { accountNote = 'アカウントへの保存は準備中です'; renderMissionList(); }
            }
        })();
        return true;
    }
    function complete(state, winner) {
        const id = state?.activeMissionId;
        if (!getDefinition(id) || window.FriendBattle?.isActive?.()) return '';
        observeScores(state);
        if (winner !== 'player' || !conditionMet(id, state.players?.player)) return 'ミッション未達成';
        const first = recordClear(id);
        return first ? `ミッションクリア！『${getDefinition(id).sleeveName}』を獲得しました` : 'ミッションクリア（獲得済み）';
    }
    function appendText(parent, tag, className, text) {
        const el = document.createElement(tag);
        el.className = className;
        el.textContent = text;
        parent.appendChild(el);
        return el;
    }
    function renderMissionList() {
        const list = document.getElementById('mission-list');
        if (!list) return;
        list.replaceChildren();
        const unlocked = isUnlocked();
        if (!unlocked) appendText(list, 'p', 'mission-locked-note', 'ストーリー第1話をクリアすると挑戦できます');
        const cleared = readLocal().cleared;
        for (const def of DEFINITIONS) {
            const card = document.createElement('article'); card.className = 'mission-card';
            const copy = document.createElement('div'); copy.className = 'mission-card-copy';
            appendText(copy, 'strong', 'mission-name', def.name);
            appendText(copy, 'span', 'mission-condition', def.condition);
            appendText(copy, 'span', 'mission-status', cleared[def.id] ? 'クリア済み ✓' : '未クリア');
            const reward = document.createElement('div'); reward.className = 'mission-reward';
            const image = document.createElement('img'); image.src = sleevePath(def.id); image.alt = '';
            reward.appendChild(image);
            appendText(reward, 'span', '', def.sleeveName);
            const button = appendText(card, 'button', 'start-sub-button mission-challenge', '挑戦する');
            button.type = 'button'; button.disabled = !unlocked; button.dataset.missionId = def.id;
            card.prepend(copy, reward);
            list.appendChild(card);
        }
        const note = document.getElementById('mission-account-note');
        if (note) note.textContent = accountNote;
    }
    function renderSleevePicker() {
        const data = readLocal();
        for (const picker of [document.getElementById('sleeve-picker'), document.getElementById('settings-sleeve-picker')].filter(Boolean)) {
        picker.replaceChildren();
        for (const option of [{ id: 'default', sleeveName: 'デフォルト', name: '' }, ...DEFINITIONS, ...REWARD_SLEEVES]) {
            const unlocked = sleeveUnlocked(option.id, data.cleared);
            const button = document.createElement('button');
            button.type = 'button'; button.className = `sleeve-choice${unlocked ? '' : ' locked'}${data.selectedSleeve === option.id ? ' selected' : ''}`;
            button.dataset.sleeveId = option.id; button.disabled = !unlocked;
            const image = document.createElement('img'); image.src = sleevePath(option.id); image.alt = '';
            button.appendChild(image);
            button.setAttribute('aria-pressed', String(data.selectedSleeve === option.id));
            const condition = option.achievement ? window.Achievements?.getDefinition(option.achievement)?.title : option.name;
            appendText(button, 'span', '', unlocked ? option.sleeveName : `🔒 ${condition}で解放`);
            picker.appendChild(button);
        }
        }
    }
    function openTab(tab) {
        const stage = document.getElementById('start-story-stage');
        if (!stage) return;
        const mission = tab === 'missions';
        const dialogue = document.getElementById('story-dialogue-panel');
        if (mission && (window.__storyActiveEpisodeId || window.__storyResultPending ||
            (dialogue && !dialogue.classList.contains('hidden')))) return;
        stage.classList.toggle('mission-view', mission);
        document.getElementById('mission-section')?.classList.toggle('hidden', !mission);
        for (const button of stage.querySelectorAll('[data-story-tab]')) {
            button.classList.toggle('active', button.dataset.storyTab === (mission ? 'missions' : 'story'));
        }
        if (mission) renderMissionList();
        else window.CharacterNotice?.showOnce();
    }
    function init() {
        refreshCosmetics();
        document.getElementById('mission-list')?.addEventListener('click', event => {
            const button = event.target.closest('button[data-mission-id]');
            if (button && isUnlocked()) window.startMissionCpuSetup?.(button.dataset.missionId);
        });
        document.getElementById('sleeve-picker')?.addEventListener('click', event => {
            const button = event.target.closest('button[data-sleeve-id]');
            if (button) selectSleeve(button.dataset.sleeveId);
        });
        document.getElementById('info-overlay-content')?.addEventListener('click', event => {
            const button = event.target.closest('#settings-sleeve-picker button[data-sleeve-id]');
            if (button) selectSleeve(button.dataset.sleeveId);
            const board = event.target.closest('#settings-board-picker button[data-board-id]');
            if (board) selectBoard(board.dataset.boardId);
        });
        document.getElementById('board-picker')?.addEventListener('click', event => {
            const button = event.target.closest('button[data-board-id]');
            if (button) selectBoard(button.dataset.boardId);
        });
        document.querySelectorAll('[data-story-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.storyTab)));
        document.getElementById('menu-story-button')?.addEventListener('click', () => openTab('story'));
        void syncCurrentAccount();
    }
    window.Missions = { definitions: DEFINITIONS, getDefinition, isUnlocked, readLocal, selectSleeve, sleevePath,
        rewardSleeves: REWARD_SLEEVES, boards: BOARDS, selectBoard, boardPath, applyBoard, renderBoardPicker, refreshCosmetics, rewardForAchievement,
        getCardBackPath, applySleeve, observeScores, conditionMet, impossible, progressHint, refreshBanner,
        complete, recordClear, syncAccount, syncCurrentAccount, renderMissionList, renderSleevePicker, openTab };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
