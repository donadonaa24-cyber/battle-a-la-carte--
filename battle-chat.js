(function () {
    'use strict';
    const phrases = { hello: 'こんにちは！', ready: 'よろしくお願いします！', wait: 'ちょっと待ってね',
        thanks: 'ありがとうございました！', good: 'お見事！', sorry: 'ごめんなさい' };
    let context, panel, toggle, history, notice, buttons = [], until = 0, sending = false, timer, epoch = 0;
    let rows = [], pending = null, loading = false, reload = false;
    const storageKey = 'aniani:battle:chat:pending:v1';
    function controls() {
        const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        for (const button of buttons) button.disabled = !context || sending || seconds > 0;
        if (seconds) notice.textContent = `次の送信まで ${seconds} 秒`;
        else if (notice.textContent.startsWith('次の送信まで')) notice.textContent = '定型文を選んで送信（5秒に1回）';
        clearTimeout(timer);
        if (seconds) timer = setTimeout(controls, 250);
    }
    function render() {
        history.replaceChildren();
        for (const row of rows) {
            if (!Object.hasOwn(phrases, row.phrase)) continue;
            const line = document.createElement('p');
            line.textContent = `${row.user_id === context.user.id ? 'あなた' : '相手'}：${phrases[row.phrase]}`;
            history.appendChild(line);
        }
        history.scrollTop = history.scrollHeight;
    }
    async function refresh() {
        if (!context) return;
        if (loading) { reload = true; return; }
        loading = true;
        const current = epoch;
        const source = context;
        try {
            const { data, error } = await source.client.from('battle_chat_messages').select('*')
                .eq('room_id', source.room.id).order('created_at', { ascending: false }).limit(30);
            if (current !== epoch) return;
            if (error) throw error;
            const old = new Set(rows.map(row => row.request_id));
            rows = data.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
            const received = rows.filter(row => !old.has(row.request_id) && row.user_id !== context.user.id);
            if (received.length) {
                const latest = received[received.length - 1];
                notice.textContent = `相手：${phrases[latest.phrase] || ''}`;
                toggle.textContent = '挨拶（新着）';
            }
            render();
        } catch (error) {
            if (current === epoch) notice.textContent = '挨拶を取得できません。「挨拶」を開き直してください。追加SQLの実行も必要です。';
        } finally {
            loading = false;
            if (reload) { reload = false; refresh(); }
        }
    }
    async function send(phrase) {
        if (!context || sending || until > Date.now()) return;
        const source = context, current = epoch;
        sending = true;
        // Reuse the request ID after uncertain delivery, rather than posting twice.
        if (!pending) pending = { room: source.room.id, user: source.user.id, id: crypto.randomUUID(), phrase };
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(pending));
            controls();
            const { error, data } = await source.client.rpc('balc_send_chat', {
                p_room: pending.room, p_request: pending.id, p_phrase: pending.phrase
            });
            if (current !== epoch) return;
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            pending = null; sessionStorage.removeItem(storageKey);
            until = Date.now() + 5000;
            notice.textContent = '送信しました';
            await refresh();
        } catch (error) {
            if (current !== epoch) return;
            if (error.message === 'CHAT_COOLDOWN') {
                until = Date.now() + 5000;
                pending = null; sessionStorage.removeItem(storageKey);
            } else {
                notice.textContent = '送信を確認できません。次に押すと前の挨拶を再確認します。初回は追加SQLの実行を確認してください。';
            }
        } finally { if (current === epoch) { sending = false; controls(); } }
    }
    function mount(bar) {
        toggle = document.createElement('button');
        toggle.id = 'online-chat-toggle'; toggle.textContent = '挨拶';
        toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'online-chat-panel');
        bar.insertBefore(toggle, bar.children[1]);
        panel = document.createElement('section'); panel.id = 'online-chat-panel'; panel.hidden = true;
        panel.setAttribute('aria-label', '定型チャット');
        history = document.createElement('div'); history.id = 'online-chat-history'; history.setAttribute('role', 'log');
        notice = document.createElement('p'); notice.setAttribute('role', 'status');
        notice.textContent = '定型文を選んで送信（5秒に1回）';
        const choices = document.createElement('div'); choices.className = 'online-chat-choices';
        for (const [id, text] of Object.entries(phrases)) {
            const button = document.createElement('button'); button.textContent = text; button.dataset.phrase = id;
            button.onclick = () => send(id); buttons.push(button); choices.appendChild(button);
        }
        panel.append(history, notice, choices); bar.appendChild(panel);
        toggle.onclick = () => {
            panel.hidden = !panel.hidden;
            toggle.setAttribute('aria-expanded', String(!panel.hidden)); toggle.textContent = panel.hidden ? '挨拶' : '閉じる';
            if (!panel.hidden) refresh();
        };
    }
    function attach(value) {
        epoch++; context = value; sending = false; rows = []; pending = null;
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
            if (saved?.room === value.room.id && saved.user === value.user.id) pending = saved;
        } catch (_) { /* A malformed local draft must not prevent a battle. */ }
        value.channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battle_chat_messages',
            filter: `room_id=eq.${value.room.id}` }, refresh);
        render(); controls();
    }
    function detach() {
        epoch++; context = null; pending = null; rows = []; until = 0; sending = false;
        sessionStorage.removeItem(storageKey); clearTimeout(timer); panel.hidden = true;
        toggle.textContent = '挨拶'; toggle.setAttribute('aria-expanded', 'false');
    }
    window.BattleChat = { mount, attach, detach, refresh };
})();
