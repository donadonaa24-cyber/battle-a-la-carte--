(function () {
    'use strict';
    const base = new URL('.', document.currentScript.src);
    const protocol = window.BattleProtocol;
    let client, accountClient, guestClient, clientPromise, user, room, channel, worker, workerSequence = 0;
    let revision = 0, started = false, busy = false, connected = false, peerPresent = false;
    let syncing = false, syncAgain = false, stopped = false, pending = null, deadline, generation = 0;
    const workerRequests = new Map();
    const sessionRoomKey = 'aniani:battle:room:v1';
    const pendingKey = 'aniani:battle:pending:v1';
    const errors = {
        LOGIN_REQUIRED: 'あにあに共通アカウントでログインしてください。',
        'Anonymous sign-ins are disabled': 'Supabaseでゲスト接続の許可が必要です。管理者向け手順書の「匿名ログイン」を確認してください。',
        ROOM_NOT_FOUND: '参加できる部屋が見つかりません。合言葉と有効期限を確認してください。',
        ROOM_ALREADY_ACTIVE: '参加中の部屋があります。「前の部屋を再開」を押してください。',
        RATE_LIMIT: '作成・参加の試行回数が多いため、10分ほど待ってください。',
        NOT_YOUR_TURN: '相手のターンです。', STALE_REVISION: '最新の状態を確認しています。',
        MATCH_NOT_READY: '対戦開始の準備中です。', MATCH_ENDED: '対戦は終了しています。',
        'Invalid login credentials': 'メールアドレスまたはパスワードを確認してください。',
        'Email not confirmed': '確認メールのリンクを開いてからログインしてください。'
    };
    const $ = id => document.getElementById(id);
    function message(text) {
        if ($('friend-room-message')) $('friend-room-message').textContent = text;
        if ($('online-status')) $('online-status').textContent = text;
    }
    function fail(error) {
        console.error('[Online battle]', error);
        message(errors[error.message] || '通信または設定を確認できませんでした。「接続を確認」を押してください。初回は設定手順書のSQL実行も必要です。');
    }
    const active = () => !!room;
    function controls() {
        const available = !busy && !room;
        for (const id of ['friend-create-button', 'friend-join-button']) if ($(id)) $(id).disabled = !available;
        if ($('online-account')) $('online-account').textContent = user && !user.is_anonymous ? `ログイン中: ${user.email || '共通アカウント'}` : 'ゲスト対戦OK（メールアドレス・パスワード不要）';
        if ($('online-login-form')) $('online-login-form').hidden = !!room || !!user && !user.is_anonymous;
        if ($('online-resume')) $('online-resume').disabled = !user || busy || !!room;
        if ($('online-bar')) $('online-bar').hidden = !room;
        document.body?.classList.toggle('online-session', !!room);
        if (document.body) document.body.classList.toggle('online-operation-locked', !!room &&
            (!connected || !peerPresent || !!pending || busy || GameState.currentTurn !== 'player' || GameState.gameEnded));
    }
    function status() {
        controls();
        if (!room) return;
        if (room.status === 'closed') { message('この部屋は終了しました。「退出」でメニューへ戻れます。'); return; }
        if (GameState.gameEnded && started) {
            message(GameState.winner === 'player' ? 'あなたの勝利です！' : '相手の勝利です。'); return;
        }
        if (!connected) { message('接続が切れました。再接続中です。「接続を確認」からも再開できます。'); return; }
        if (!room.guest_id) { message(`HOST / 合言葉 ${room.code} / 対戦相手を待っています（参加期限15分）`); return; }
        if (!peerPresent) { message('対戦相手との接続が切れました。相手の再接続を待っています。'); return; }
        if (!started) { message('対戦相手が参加しました。対戦を準備しています。'); return; }
        if (pending || busy) { message('操作を確認しています…'); return; }
        message(`${room.host_id === user.id ? 'HOST' : 'GUEST'} / ${GameState.currentTurn === 'player' ? 'あなたのターン' : '相手のターン'}`);
    }
    async function getClient() {
        if (client) return client;
        if (clientPromise) return clientPromise;
        clientPromise = (async () => {
            const config = window.SUPABASE_CONFIG;
            if (!config?.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Error('CONFIG_REQUIRED');
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
            const options = { global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(20000) }) } };
            accountClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
            guestClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY,
                { ...options, auth: { storageKey: 'aniani:battle:guest:auth:v1', detectSessionInUrl: false } });
            const account = await accountClient.auth.getSession();
            if (account.error) throw account.error;
            client = account.data.session?.user && !account.data.session.user.is_anonymous ? accountClient : guestClient;
            for (const source of [accountClient, guestClient]) source.auth.onAuthStateChange((_event, session) => {
                if (source !== client) return;
                const next = session?.user || null;
                if (room && next?.id !== user?.id) { stopped = true; connected = false; detach(); }
                user = next;
                controls();
                if (stopped) message('ログイン状態が変わりました。再読み込みしてログインし直してください。');
            });
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            user = data.session?.user || null;
            return client;
        })();
        try { return await clientPromise; } finally { clientPromise = null; }
    }
    async function refreshLogin() {
        try {
            await getClient();
            if (!room) {
                const account = await accountClient.auth.getSession();
                if (account.error) throw account.error;
                client = account.data.session?.user && !account.data.session.user.is_anonymous ? accountClient : guestClient;
            }
            const c = client;
            const { data, error } = await c.auth.getSession();
            if (error) throw error;
            user = data.session?.user || null;
            controls();
            if (!room) message('ログインせず、そのまま「部屋を作る」「部屋に参加」を押せます。先攻は参加時にランダムで決まります。');
        } catch (error) { fail(error); }
    }
    async function rpc(name, args) {
        const { data, error } = await client.rpc(name, args);
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return data;
    }
    async function select(table, filters, single = false) {
        let query = client.from(table).select('*');
        for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
        const { data, error } = await (single ? query.maybeSingle() : query);
        if (error) throw error;
        return data;
    }
    function profileInfo(options = {}) {
        const profile = window.getUserProfile?.() || {};
        return {
            name: String(options.userName || profile.name || 'プレイヤー').slice(0, 24),
            character: options.favoriteCharacterId || profile.favoriteCharacterId || 'chizuru',
            skill: profile.favoriteSkillKey || 'lastOrder'
        };
    }
    async function enter(kind, options = {}) {
        if (busy || room) return;
        busy = true; controls();
        try {
            await getClient();
            if (!user) {
                const { data, error } = await client.auth.signInAnonymously();
                if (error) throw error;
                user = data.user;
            }
            const info = profileInfo(options);
            const result = kind === 'host' ? await rpc('balc_create_room', { p_info: info }) :
                await rpc('balc_join_room', { p_code: String(options.passphrase || $('friend-passphrase-input').value).trim(), p_info: info });
            await attach(result);
        } catch (error) { fail(error); } finally { busy = false; controls(); }
    }
    function engine(request) {
        if (!worker) {
            worker = new Worker(new URL('battle-engine-worker.js?v=20260913', base));
            worker.onmessage = ({ data }) => {
                const job = workerRequests.get(data.id);
                if (!job) return;
                workerRequests.delete(data.id); clearTimeout(job.timer);
                data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
            };
            worker.onerror = () => {
                for (const job of workerRequests.values()) { clearTimeout(job.timer); job.reject(new Error('ENGINE_ERROR')); }
                workerRequests.clear(); worker.terminate(); worker = null;
            };
        }
        return new Promise((resolve, reject) => {
            const id = ++workerSequence;
            const timer = setTimeout(() => { workerRequests.delete(id); reject(new Error('ENGINE_TIMEOUT')); }, 15000);
            workerRequests.set(id, { resolve, reject, timer });
            worker.postMessage({ ...request, id });
        });
    }
    function applyView(row) {
        if (!row || row.revision <= revision || stopped) return;
        if (!started) {
            window.__battleSafeStartGame();
            started = true;
            window.pushMatchExitGuardHistory?.();
            window.__battleStartBgmOnce?.();
        }
        const wasEnded = GameState.gameEnded;
        Object.assign(GameState, row.payload.state);
        revision = row.revision;
        $('start-overlay')?.classList.add('hidden');
        if (pending && revision > pending.revision) {
            pending = null; clearTimeout(deadline); sessionStorage.removeItem(pendingKey);
        }
        window.updateUI();
        for (const text of row.payload.logs || []) window.addLog(text);
        for (const effect of row.payload.effects || []) {
            if (['playSfx', 'playCookBgm', 'showSpotlightRecipeCard', 'showSpotlightEventCard',
                'showSpotlightSkillCutin', 'showSpotlightPackCardAsync', 'setBattleModeBgmLocked', 'playBattleModeBGM', 'showBattleALaCarteModeCutin'].includes(effect.name)) {
                if (effect.name === 'showBattleALaCarteModeCutin') setTimeout(() => window[effect.name]?.(...effect.args), 2100);
                else window[effect.name]?.(...effect.args);
            }
        }
        if (GameState.gameEnded && !wasEnded) {
            window.playResultBGM?.();
            window.showResultOverlay?.(GameState.winner === 'player' ? 'あなたの勝利です！' : '相手の勝利です。', GameState.winner === 'player' ? 'win' : 'lose');
        }
        status();
    }
    async function sync() {
        if (!room || stopped) return;
        if (syncing) { syncAgain = true; return; }
        syncing = true;
        try {
            do {
                syncAgain = false;
                const currentId = room.id;
                const fresh = await select('battle_rooms', { id: currentId }, true);
                if (!fresh) throw new Error('ROOM_NOT_FOUND');
                if (!room || room.id !== currentId || stopped) return;
                room = fresh;
                const peerId = room.host_id === user.id ? room.guest_id : room.host_id;
                peerPresent = !!peerId && !!channel?.presenceState()[peerId]?.length;
                applyView(await select('battle_views', { room_id: currentId, user_id: user.id }, true));
                if (room.status === 'playing' && room.host_id === user.id && peerPresent && connected) {
                    let result, action = null;
                    if (room.revision === 0) {
                        result = await engine({ kind: 'init', host: room.host_info, guest: room.guest_info,
                            firstRole: room.first_user === room.guest_id ? 'guest' : 'host' });
                    } else {
                        const actions = await select('battle_match_actions', { room_id: currentId, processed: false, base_revision: room.revision });
                        action = actions[0];
                        if (action) {
                            const checkpoint = await select('battle_checkpoints', { room_id: currentId }, true);
                            try {
                                result = await engine({ kind: 'action', snapshot: checkpoint.snapshot,
                                    role: action.user_id === room.host_id ? 'host' : 'guest', action: action.action });
                            } catch (error) {
                                if (!['INVALID_ACTION', 'NOT_YOUR_TURN', 'MATCH_ENDED'].includes(error.message)) throw error;
                                // Reject an invalid action without leaving the room stuck at this revision.
                                result = { snapshot: checkpoint.snapshot, views: {} };
                                for (const role of ['host', 'guest']) result.views[role] = {
                                    state: protocol.view(checkpoint.snapshot, role), effects: [], logs: ['無効な操作を取り消しました。']
                                };
                                console.warn('Rejected online action', error.message);
                            }
                        }
                    }
                    if (result) {
                        await rpc('balc_commit', { p_room: currentId, p_revision: room.revision, p_request: action?.request_id || null,
                            p_snapshot: result.snapshot, p_host_view: result.views.host, p_guest_view: result.views.guest });
                        syncAgain = true;
                    }
                }
                status();
            } while (syncAgain && room && !stopped);
        } catch (error) {
            if (error.message === 'STALE_REVISION') {
                setTimeout(() => sync(), 100);
            } else { connected = false; controls(); fail(error); }
        } finally { syncing = false; }
    }
    function peerSync() {
        if (!channel || !room || !user) return;
        const peerId = room.host_id === user.id ? room.guest_id : room.host_id;
        peerPresent = !!peerId && !!channel.presenceState()[peerId]?.length;
        status();
        if (peerPresent) sync();
    }
    async function detach() {
        generation++;
        if (channel && client) { const old = channel; channel = null; await client.removeChannel(old); }
        connected = false; peerPresent = false;
    }
    async function attach(value) {
        const sameRoom = room?.id === value.id;
        await detach();
        // Private Realtime channels must receive the session created moments earlier.
        await client.realtime.setAuth();
        const epoch = generation;
        room = value; stopped = false;
        if (!sameRoom) revision = 0;
        sessionStorage.setItem(sessionRoomKey, JSON.stringify({ id: room.id, user: user.id }));
        const remembered = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
        pending = remembered?.room === room.id && remembered.user === user.id ? remembered : null;
        channel = client.channel(`balc:${room.id}`, { config: { private: true, presence: { key: user.id } } });
        channel.on('presence', { event: 'sync' }, peerSync);
        window.BattleChat?.attach({ client, room, user, channel });
        for (const table of ['battle_rooms', 'battle_views', 'battle_match_actions']) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table,
                filter: `${table === 'battle_rooms' ? 'id' : 'room_id'}=eq.${room.id}` }, () => sync());
        }
        channel.subscribe(async state => {
            if (!channel || stopped || epoch !== generation) return;
            connected = state === 'SUBSCRIBED';
            status();
            if (connected) {
                await channel.track({ online: true });
                window.BattleChat?.refresh();
                await sync();
                peerSync();
                if (pending) resend();
            }
        });
        status();
    }
    async function resend() {
        if (!pending || !room || !connected || stopped) return;
        try {
            await rpc('balc_submit_action', { p_room: pending.room, p_request: pending.id,
                p_revision: pending.revision, p_action: pending.action });
            await sync();
        } catch (error) {
            if (['STALE_REVISION', 'NOT_YOUR_TURN', 'MATCH_NOT_READY'].includes(error.message)) {
                pending = null; sessionStorage.removeItem(pendingKey); await sync();
            } else fail(error);
        } finally { controls(); }
    }
    function dispatch(name, args) {
        if (!room || stopped || busy || pending || !connected || !peerPresent || GameState.gameEnded || GameState.currentTurn !== 'player') return;
        const action = { name, args };
        if (!protocol.validAction(action)) return;
        pending = { id: crypto.randomUUID(), room: room.id, user: user.id, revision, action };
        try { sessionStorage.setItem(pendingKey, JSON.stringify(pending)); }
        catch (error) { pending = null; fail(error); return; }
        status();
        clearTimeout(deadline);
        deadline = setTimeout(() => { if (pending) message('操作の応答を確認できません。「接続を確認」で同じ操作を再確認できます。'); }, 22000);
        resend();
    }
    async function resume() {
        if (busy) return;
        busy = true; controls();
        try {
            await getClient();
            if (!user) throw new Error('LOGIN_REQUIRED');
            let saved = JSON.parse(sessionStorage.getItem(sessionRoomKey) || 'null');
            let found = saved?.user === user.id ? await select('battle_rooms', { id: saved.id }, true) : null;
            if (!found) {
                const { data, error } = await client.from('battle_rooms').select('*').in('status', ['waiting', 'playing']).order('created_at', { ascending: false }).limit(1);
                if (error) throw error;
                found = data[0];
            }
            if (!found || found.status === 'closed') throw new Error('ROOM_NOT_FOUND');
            await attach(found);
        } catch (error) { fail(error); } finally { busy = false; controls(); }
    }
    async function leaveRoom() {
        if (room) await rpc('balc_leave_room', { p_room: room.id });
        stopped = true; await detach();
        room = null; pending = null; started = false; revision = 0;
        window.BattleChat?.detach();
        worker?.terminate(); worker = null; clearTimeout(deadline);
        sessionStorage.removeItem(sessionRoomKey); sessionStorage.removeItem(pendingKey);
        controls();
    }
    function mount() {
        const lobby = $('start-friend-stage');
        const auth = document.createElement('div');
        auth.className = 'online-account-box';
        auth.innerHTML = `<p id="online-account">ログイン状態を確認してください</p>
          <p>登録なしで通信対戦を試せます。メダル・コレクションをアカウントで保存し、別の端末でも利用するにはメールアドレスとパスワードで登録してください。通信対戦のコイン報酬は現在ありません。ゲストデータのアカウントへの自動移行はありません。</p>
          <form id="online-login-form"><label>メールアドレス<input id="online-email" type="email" autocomplete="username" required></label>
          <label>パスワード<input id="online-password" type="password" autocomplete="current-password" required></label>
          <button type="submit" class="start-sub-button">共通アカウントでログイン</button></form>
          <p><a href="https://donadonaa24-cyber.github.io/aniani-asobiba/index.html" target="_blank" rel="noopener">あにあにの遊び場でアカウント登録・パスワード再設定</a></p>
          <button id="online-resume" class="start-sub-button">前の部屋を再開</button>`;
        lobby.insertBefore(auth, lobby.children[2]);
        const bar = document.createElement('aside');
        bar.id = 'online-bar'; bar.hidden = true;
        bar.innerHTML = '<span id="online-status" role="status" aria-live="polite"></span><button id="online-reconnect">接続を確認</button><button id="online-leave">退出</button>';
        document.body.appendChild(bar);
        window.BattleChat?.mount(bar);
        $('online-login-form').addEventListener('submit', async event => {
            event.preventDefault(); if (busy || room) return; busy = true; controls();
            try {
                await getClient();
                const c = accountClient;
                const { data, error } = await c.auth.signInWithPassword({ email: $('online-email').value.trim(), password: $('online-password').value });
                $('online-password').value = '';
                if (error) throw error;
                client = accountClient; user = data.user; message('ログインしました。部屋を作成または参加してください。');
            } catch (error) { fail(error); } finally { busy = false; controls(); }
        });
        $('online-resume').onclick = resume;
        $('online-reconnect').onclick = async () => { if (room) await attach(room); else await resume(); };
        $('online-leave').onclick = async () => {
            if (!confirm('部屋から退出しますか？ この対戦は終了します。')) return;
            try { await leaveRoom(); location.reload(); } catch (error) { fail(error); }
        };
        // Replace only public player entry points. CPU mode still calls the original functions.
        for (const name of protocol.actions) {
            const original = window[name];
            window[name] = (...args) => active() ? dispatch(name, args) : original(...args);
        }
        const requestPile = window.requestPileView;
        window.requestPileView = type => {
            if (active() && type === 'deck') { message(`山札は残り${GameState.deck.length}枚です。オンライン対戦中は内容を確認できません。`); return; }
            requestPile(type);
        };
        const skillStatus = window.getSkillActivationStatusForSide;
        window.getSkillActivationStatusForSide = side => {
            const result = skillStatus(side);
            return active() && side === 'player' && GameState.onlineSkillStatus ? { ...result, ...GameState.onlineSkillStatus } : result;
        };
        const previous = window.__onGameStateUpdated;
        window.__onGameStateUpdated = () => { previous?.(); controls(); };
        controls();
    }
    window.FriendBattle = {
        isActive: active, isAvailable: () => !!window.SUPABASE_CONFIG,
        refreshLogin, createRoom: options => enter('host', options), joinRoom: options => enter('guest', options),
        leaveRoom, resume, schedulePublish: () => {}
    };
    document.addEventListener('DOMContentLoaded', mount);
    window.addEventListener('online', () => { if (room) attach(room).catch(fail); });
    window.addEventListener('offline', () => { connected = false; status(); });
})();
