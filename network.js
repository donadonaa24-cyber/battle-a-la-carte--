(function () {
    'use strict';
    const base = new URL('.', document.currentScript.src);
    const protocol = window.BattleProtocol;
    let client, accountClient, guestClient, clientPromise, user, room, channel, worker, workerSequence = 0;
    let revision = 0, started = false, busy = false, connected = false, peerPresent = false;
    let syncing = false, syncAgain = false, stopped = false, pending = null, deadline, generation = 0;
    const workerRequests = new Map();
    const streams = new Map();
    let fastMode = false, snapshot = null, latestResult = null, processing = Promise.resolve();
    let saving = false, saveJob = null, savedRevision = 0, saveTimer;
    let retrySaveJob = null, inFlightSave = null, rematching = false;
    const saveWaiters = [];
    const accepted = new Set(), unsavedActions = new Map(), originals = new Map();
    const metrics = window.BattleMetrics;
    const recoveryKey = 'aniani:battle:checkpoint:v2';
    const previewActions = new Set(['playerSetCard', 'confirmSetCard', 'cancelSetCard', 'viewSetCard', 'closeSetCardView',
        'openIngredientAction', 'closeIngredientAction', 'showIngredientCombinations', 'backIngredientAction',
        'confirmIngredientSetFromAction', 'playerShowRecipeCandidates', 'playerCancelRecipeCandidates',
        'playerUseEvent', 'cancelEventCard', 'playerBuyPack', 'cancelPackPurchase', 'playerEndTurn',
        'cancelEndTurn', 'toggleDiscardSelection', 'toggleEventTargetSelection', 'playerUseSkill', 'cancelSkillActivation']);
    const rematchReady = new Set();
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
        if ($('online-rematch')) $('online-rematch').hidden = !fastMode || !started || !GameState.gameEnded;
        const available = !busy && !room;
        for (const id of ['friend-create-button', 'friend-join-button']) if ($(id)) $(id).disabled = !available;
        for (const id of ['online-character', 'online-skill']) if ($(id)) $(id).disabled = !available;
        if ($('online-account')) $('online-account').textContent = user && !user.is_anonymous ? `ログイン中: ${user.email || '共通アカウント'}` : 'ゲスト対戦OK（メールアドレス・パスワード不要）';
        if ($('online-login-form')) $('online-login-form').hidden = !!room || !!user && !user.is_anonymous;
        if ($('online-resume')) $('online-resume').disabled = !user || busy || !!room;
        if ($('online-bar')) $('online-bar').hidden = !room;
        document.body?.classList.toggle('online-session', !!room);
        if (document.body) document.body.classList.toggle('online-operation-locked', !!room &&
            (room.status === 'closed' || !connected || !peerPresent || !!pending || busy || getBattleViewModel().turn !== 'me' || GameState.gameEnded));
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
        message(`${room.host_id === user.id ? 'HOST' : 'GUEST'} / ${getBattleViewModel().turn === 'me' ? 'あなたのターン' : '相手のターン'}${retrySaveJob ? ' / 保存を再試行中' : ''}${fastMode ? '' : ' / 従来通信（高速化SQL未適用）'}`);
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
            character: options.favoriteCharacterId || $('online-character')?.value || profile.favoriteCharacterId || 'chizuru',
            skill: $('online-skill')?.value || profile.favoriteSkillKey || 'lastOrder'
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
            worker = new Worker(new URL('battle-engine-worker.js?v=20260915', base));
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
        const acknowledgement = row?.payload?.request && pending?.id === row.payload.request && row.revision >= pending.revision;
        if (acknowledgement) {
            pending = null; clearTimeout(deadline); sessionStorage.removeItem(pendingKey); controls();
        }
        if (!row || row.revision < revision || (row.revision === revision && !acknowledgement) || stopped) return;
        if (!started) {
            window.__battleSafeStartGame();
            started = true;
            window.pushMatchExitGuardHistory?.();
            window.__battleStartBgmOnce?.();
        }
        const wasEnded = GameState.gameEnded;
        if (row.payload.trace?.id) metrics?.mark(row.payload.trace.id, 'received', row.payload.trace);
        Object.assign(GameState, row.payload.state);
        if (wasEnded && !GameState.gameEnded) window.hideResultOverlay?.();
        if (row.payload.trace?.id) metrics?.mark(row.payload.trace.id, 'applied');
        revision = row.revision;
        $('start-overlay')?.classList.add('hidden');
        if (pending && revision > pending.revision) {
            pending = null; clearTimeout(deadline); sessionStorage.removeItem(pendingKey);
        }
        window.updateUI(true);
        if (row.payload.trace?.id) metrics?.mark(row.payload.trace.id, 'dom');
        for (const text of row.payload.logs || []) window.addLog(String(text).replace(/CPU/g, '相手'));
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
            if (fastMode) { await fastSync(); return; }
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
        } finally { syncing = false; if (fastMode && syncAgain && room && !stopped) { syncAgain = false; setTimeout(sync, 0); } }
    }
    async function ensureStreams() {
        const ids = room.host_id === user.id ? [user.id, room.guest_id] : [user.id];
        await Promise.all(ids.filter(Boolean).map(async id => {
            if (streams.has(id)) return streams.get(id).ready;
            const currentRoom = room.id, epoch = generation;
            const stream = client.channel(`balc:${currentRoom}:user:${id}`, { config: { private: true, broadcast: { ack: true } } });
            streams.set(id, stream);
            stream.on('broadcast', { event: 'action' }, ({ payload }) => {
                if (epoch === generation && room?.host_id === user.id && id !== user.id) enqueueRequest(id, payload);
            });
            stream.on('broadcast', { event: 'state' }, ({ payload }) => {
                if (epoch === generation && id === user.id && payload?.room === room?.id) {
                    applyView(payload); status();
                }
            });
            stream.on('broadcast', { event: 'request-state' }, () => {
                if (epoch === generation && room?.host_id === user.id && latestResult) sendLatest(id).catch(fail);
            });
            stream.on('broadcast', { event: 'rematch' }, () => {
                if (epoch === generation && room?.host_id === user.id && id !== user.id) requestRematch(id).catch(fail);
            });
            stream.ready = new Promise((resolve, reject) => {
                stream.subscribe(state => {
                    if (epoch !== generation || stopped) return;
                    if (state === 'SUBSCRIBED') resolve();
                    else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
                        connected = false; status(); reject(new Error('BROADCAST_CHANNEL_ERROR'));
                    }
                });
            });
            return stream.ready;
        }));
    }
    async function sendStream(id, event, payload) {
        const stream = streams.get(id);
        if (!stream) throw new Error('BROADCAST_CHANNEL_ERROR');
        await stream.ready;
        const result = await stream.send({ type: 'broadcast', event, payload });
        if (result !== 'ok') throw new Error('BROADCAST_SEND_ERROR');
    }
    async function sendLatest(id, request = null, trace = null, presentation = false) {
        if (!latestResult || !room) return;
        const role = id === room.host_id ? 'host' : 'guest';
        const row = { room: room.id, revision, payload: { ...latestResult.views[role],
            logs: presentation ? latestResult.views[role].logs : [], effects: presentation ? latestResult.views[role].effects : [], request, trace } };
        if (id === user.id) applyView(row);
        else await sendStream(id, 'state', row);
    }
    function enqueueRequest(id, request) {
        const hostReceived = metrics?.now();
        processing = processing.then(async () => {
            if (!room || stopped || room.status === 'closed' || room.host_id !== user.id || request?.room !== room.id || !snapshot) return;
            const currentRoom = room.id;
            if (typeof request.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(request.id) ||
                !Number.isSafeInteger(request.revision) || JSON.stringify(request).length > 8192) return;
            if (accepted.has(request.id)) { await sendLatest(id, request.id, request.trace); return; }
            if (id !== room.host_id && id !== room.guest_id) return;
            if (request.revision !== revision || !protocol.validAction(request.action)) {
                await sendLatest(id, request.id, request.trace); return;
            }
            const trace = { ...request.trace, hostReceived, hostStarted: metrics?.now() };
            let result;
            try {
                result = await engine({ kind: 'action', snapshot, role: id === room.host_id ? 'host' : 'guest', action: request.action });
            } catch (error) {
                if (!['INVALID_ACTION', 'NOT_YOUR_TURN', 'MATCH_ENDED'].includes(error.message)) throw error;
                await sendLatest(id, request.id, trace); return;
            }
            trace.hostApplied = metrics?.now();
            if (room?.id !== currentRoom || stopped) return;
            accepted.add(request.id);
            if (accepted.size > 512) accepted.delete(accepted.values().next().value);
            unsavedActions.set(request.id, { request_id: request.id, user_id: id, base_revision: revision, action: request.action });
            snapshot = result.snapshot; latestResult = result; revision++;
            room.status = snapshot.gameEnded ? 'finished' : 'playing';
            // Render first; database persistence is not on the critical UI path.
            const liveRevision = revision;
            revision--;
            applyView({ revision: liveRevision, payload: { ...result.views.host, request: request.id, trace } });
            queueSave();
            sendLatest(room.guest_id, request.id, trace, true).catch(error => { connected = false; status(); fail(error); });
            status();
        }).catch(error => { connected = false; status(); fail(error); });
    }
    function queueSave() {
        saveJob = { room: room.id, user: user.id, revision, result: latestResult, actions: [...unsavedActions.values()] };
        try { sessionStorage.setItem(recoveryKey, JSON.stringify({ ...saveJob, retry: retrySaveJob || inFlightSave })); }
        catch (_) { message('端末への復帰データを保存できませんでした。DB保存状況を確認してください。'); }
        flushSave();
    }
    async function flushSave() {
        if (saving) return new Promise(resolve => saveWaiters.push(resolve));
        saving = true;
        try {
            while ((retrySaveJob || saveJob) && room && !stopped) {
                const job = retrySaveJob || saveJob;
                if (retrySaveJob) retrySaveJob = null; else saveJob = null;
                inFlightSave = job;
                try {
                    await rpc('balc_save_checkpoint', { p_room: job.room, p_base: savedRevision, p_revision: job.revision,
                        p_snapshot: job.result.snapshot, p_host_view: job.result.views.host, p_guest_view: job.result.views.guest,
                        p_actions: job.actions });
                    savedRevision = job.revision;
                    for (const a of job.actions) unsavedActions.delete(a.request_id);
                    if (saveJob) saveJob.actions = [...unsavedActions.values()];
                    else sessionStorage.removeItem(recoveryKey);
                } catch (error) {
                    if (error.message === 'STALE_REVISION') {
                        // Another HOST context wrote first. Stop prediction and recover the DB authority.
                        saveJob = null; retrySaveJob = null; snapshot = null; latestResult = null; revision = 0; accepted.clear(); unsavedActions.clear();
                        sessionStorage.removeItem(recoveryKey); await sync();
                        message('別のHOST画面による更新を検出しました。最新の保存状態へ戻しました。'); break;
                    }
                    // Retry the exact failed checkpoint before any newer coalesced state.
                    retrySaveJob = job;
                    try { sessionStorage.setItem(recoveryKey, JSON.stringify({ ...(saveJob || job), retry: job })); } catch (_) {}
                    clearTimeout(saveTimer); saveTimer = setTimeout(() => flushSave(), 2000);
                    message('対戦状態の保存に失敗しました。再試行中です。画面を閉じずに接続を確認してください。');
                    break;
                }
            }
        } finally { saving = false; inFlightSave = null; for (const resolve of saveWaiters.splice(0)) resolve(); }
    }
    async function fastSync() {
        const id = room.id;
        const [fresh, ownView] = await Promise.all([select('battle_rooms', { id }, true), select('battle_views', { room_id: id, user_id: user.id }, true)]);
        if (!fresh || room?.id !== id || stopped) return;
        room = fresh;
        await ensureStreams();
        const peer = room.host_id === user.id ? room.guest_id : room.host_id;
        peerPresent = !!peer && !!channel?.presenceState()[peer]?.length;
        if (room.status === 'closed') { status(); return; }
        if (room.host_id === user.id) {
            if (!snapshot || fresh.revision > revision) {
                const checkpoint = await select('battle_checkpoints', { room_id: id }, true);
                savedRevision = fresh.revision;
                if (checkpoint) { snapshot = checkpoint.snapshot; latestResult = { snapshot, views: {} }; }
                const recovery = JSON.parse(sessionStorage.getItem(recoveryKey) || 'null');
                if (recovery?.room === id && recovery.user === user.id && recovery.revision > fresh.revision) {
                    snapshot = recovery.result.snapshot; latestResult = recovery.result; saveJob = recovery;
                    retrySaveJob = recovery.retry?.revision > fresh.revision ? recovery.retry : null;
                    for (const a of recovery.actions) { accepted.add(a.request_id); if (a.base_revision >= fresh.revision) unsavedActions.set(a.request_id, a); }
                    saveJob.actions = [...unsavedActions.values()];
                    if (revision < recovery.revision) applyView({ revision: recovery.revision, payload: latestResult.views.host });
                    flushSave();
                } else applyView(ownView);
                if (snapshot && !latestResult.views.host) {
                    latestResult.views = await engine({ kind: 'project', snapshot });
                }
            }
            if (!snapshot && peerPresent && connected && room.status === 'playing') {
                latestResult = await engine({ kind: 'init', host: room.host_info, guest: room.guest_info,
                    firstRole: room.first_user === room.guest_id ? 'guest' : 'host' });
                snapshot = latestResult.snapshot;
                applyView({ revision: fresh.revision + 1, payload: latestResult.views.host });
                await sendLatest(room.guest_id); queueSave();
            } else if (latestResult && peerPresent) await sendLatest(room.guest_id);
        } else {
            applyView(ownView);
            await sendStream(user.id, 'request-state', { room: id });
        }
        status();
    }
    async function requestRematch(id = user.id) {
        if (!fastMode || !GameState.gameEnded || !room || !peerPresent || rematching) return;
        if (room.host_id !== user.id) {
            await sendStream(user.id, 'rematch', { room: room.id });
            message('再戦を希望しました。相手の承認を待っています。'); return;
        }
        rematchReady.add(id);
        message('再戦を希望しました。相手の承認を待っています。');
        if (!rematchReady.has(room.host_id) || !rematchReady.has(room.guest_id)) return;
        rematching = true;
        try {
        await processing; await flushSave();
        if (saving || saveJob || retrySaveJob) { message('試合結果の保存を待ってから、もう一度再戦を押してください。'); return; }
        room = await rpc('balc_rematch', { p_room: room.id });
        latestResult = await engine({ kind: 'init', host: room.host_info, guest: room.guest_info,
            firstRole: room.first_user === room.guest_id ? 'guest' : 'host' });
        snapshot = latestResult.snapshot; rematchReady.clear(); accepted.clear();
        $('result-overlay')?.classList.add('hidden');
        applyView({ revision: revision + 1, payload: latestResult.views.host });
        await sendLatest(room.guest_id); queueSave();
        } finally { rematching = false; }
    }
    function peerSync() {
        if (!channel || !room || !user) return;
        const peerId = room.host_id === user.id ? room.guest_id : room.host_id;
        peerPresent = !!peerId && !!channel.presenceState()[peerId]?.length;
        status();
        if (peerPresent && (!fastMode || !started)) sync();
    }
    async function detach() {
        generation++;
        const oldChannels = [...streams.values(), ...(channel ? [channel] : [])];
        streams.clear();
        channel = null;
        connected = false; peerPresent = false;
        if (client) await Promise.all(oldChannels.map(old => client.removeChannel(old)));
    }
    async function attach(value) {
        const sameRoom = room?.id === value.id;
        await detach();
        // Private Realtime channels must receive the session created moments earlier.
        await client.realtime.setAuth();
        const epoch = generation;
        room = value; stopped = false;
        if (!sameRoom) { revision = 0; snapshot = null; latestResult = null; accepted.clear(); unsavedActions.clear(); saveJob = null; retrySaveJob = null; savedRevision = 0; rematchReady.clear(); }
        try { fastMode = (await rpc('balc_broadcast_capabilities', {}))?.version === 2; }
        catch (_) { fastMode = false; }
        sessionStorage.setItem(sessionRoomKey, JSON.stringify({ id: room.id, user: user.id }));
        const remembered = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
        pending = remembered?.room === room.id && remembered.user === user.id ? remembered : null;
        channel = client.channel(`balc:${room.id}`, { config: { private: true, presence: { key: user.id } } });
        channel.on('presence', { event: 'sync' }, peerSync);
        window.BattleChat?.attach({ client, room, user, channel });
        for (const table of fastMode ? ['battle_rooms'] : ['battle_rooms', 'battle_views', 'battle_match_actions']) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table,
                filter: `${table === 'battle_rooms' ? 'id' : 'room_id'}=eq.${room.id}` }, event => {
                    // Playing revisions already arrive by Broadcast. Only lifecycle changes need REST.
                    if (!fastMode || !started || event?.new?.status === 'closed' || !room.guest_id) sync();
                });
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
        if (fastMode) {
            if (room.host_id === user.id) enqueueRequest(user.id, pending);
            else sendStream(user.id, 'action', pending).catch(fail);
            return;
        }
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
        if (!room || room.status === 'closed' || stopped || busy || pending || !connected || !peerPresent || GameState.gameEnded || getBattleViewModel().turn !== 'me') return;
        const action = { name, args };
        if (!protocol.validAction(action)) return;
        pending = { id: crypto.randomUUID(), room: room.id, user: user.id, revision, action };
        if (fastMode) pending.trace = metrics?.mark(pending.id, 'input') || { id: pending.id };
        try { sessionStorage.setItem(pendingKey, JSON.stringify(pending)); }
        catch (error) { pending = null; fail(error); return; }
        if (fastMode) {
            pending.trace.id = pending.id;
            if (previewActions.has(name)) {
                const log = window.addLog;
                window.addLog = () => {};
                try { originals.get(name)?.(...args); } finally { window.addLog = log; }
            }
            window.updateUI(true);
            pending.trace = metrics?.mark(pending.id, 'local') || pending.trace;
            pending.trace.id = pending.id;
            pending.trace = metrics?.mark(pending.id, 'sent') || pending.trace;
            pending.trace.id = pending.id;
        }
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
        if (fastMode) await processing;
        if (fastMode && room?.host_id === user?.id) await flushSave();
        if (saveJob || retrySaveJob) throw new Error('SAVE_PENDING');
        if (room) await rpc('balc_leave_room', { p_room: room.id });
        stopped = true; await detach();
        room = null; pending = null; started = false; revision = 0;
        window.BattleChat?.detach();
        worker?.terminate(); worker = null; clearTimeout(deadline);
        clearTimeout(saveTimer); snapshot = null; latestResult = null; saveJob = null;
        sessionStorage.removeItem(recoveryKey);
        sessionStorage.removeItem(sessionRoomKey); sessionStorage.removeItem(pendingKey);
        controls();
    }
    function mount() {
        const lobby = $('start-friend-stage');
        const selection = document.createElement('div');
        selection.className = 'online-account-box';
        selection.innerHTML = '<label>対戦キャラクター<select id="online-character"><option value="chizuru">千鶴</option><option value="mai">舞依</option><option value="takumi">拓海</option><option value="akatsuki">暁</option></select></label><label>対戦スキル<select id="online-skill"></select></label>';
        lobby.appendChild(selection);
        for (const skill of window.getSkillDefinitions?.() || []) {
            const option = document.createElement('option'); option.value = skill.key; option.textContent = skill.name;
            selection.querySelector('#online-skill').appendChild(option);
        }
        const profile = window.getUserProfile?.() || {};
        $('online-character').value = profile.favoriteCharacterId || 'chizuru';
        $('online-skill').value = profile.favoriteSkillKey || 'lastOrder';
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
        const rematch = document.createElement('button');
        rematch.id = 'online-rematch'; rematch.textContent = '再戦'; rematch.hidden = true;
        rematch.onclick = () => requestRematch().catch(fail);
        bar.appendChild(rematch);
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
            originals.set(name, original);
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
        const originalLog = window.addLog;
        window.addLog = text => originalLog(active() ? String(text).replace(/CPU/g, '相手') : text);
        window.__onGameStateUpdated = () => { previous?.(); controls(); };
        controls();
    }
    window.FriendBattle = {
        isActive: active, isAvailable: () => !!window.SUPABASE_CONFIG,
        refreshLogin, createRoom: options => enter('host', options), joinRoom: options => enter('guest', options),
        leaveRoom, resume, schedulePublish: () => {}, isFastMode: () => fastMode
    };
    document.addEventListener('DOMContentLoaded', mount);
    window.addEventListener('online', () => { if (room) attach(room).catch(fail); });
    window.addEventListener('offline', () => { connected = false; status(); detach().catch(fail); });
})();
