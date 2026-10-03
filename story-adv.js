(function (root) {
    'use strict';
    const KEY = 'battleAlaCarteStoryAdvV1';
    const assets = root.BattleStoryAssets;
    const S = { episode: null, sceneId: '', lineIndex: 0, stage: 'pre', active: false,
        battleActive: false, pending: null, actors: new Map(), backlog: [], token: 0,
        busy: false, loading: false, typing: false, text: '', chars: [], typed: 0, logOpen: false,
        fastForward: false, ctrlHeld: false, paused: false, skipOpen: false, continuedAsWin: false,
        conversation: null };
    let layer, typeTimer, autoTimer;
    const waits = new Map();
    const playbackTimers = new Set();
    const fast = () => S.fastForward || S.ctrlHeld;
    const frozen = () => S.paused || S.logOpen || S.skipOpen;
    const timerNow = () => root.performance?.now() ?? Date.now();
    const effectDelay = ms => fast() ? Math.min(ms, 100) : ms;
    const reducedMotion = () => root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const markArt = Object.freeze({
        '!': '!', '?': '?', '!?': '!?', note: '♪', sparkle: '✦', '…': '…',
        sweat: '<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M16 3C12 12 4 21 4 27a12 12 0 0 0 24 0C28 21 20 12 16 3Z" fill="#83def8" stroke="#102654" stroke-width="3"/><path d="M10 25q-2 7 4 8" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>',
        anger: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 16h9V5M26 5v11h9M35 26h-9v9M14 35v-9H5" fill="none" stroke="#fff1c5" stroke-width="8" stroke-linejoin="round"/><path d="M5 16h9V5M26 5v11h9M35 26h-9v9M14 35v-9H5" fill="none" stroke="#d45340" stroke-width="4" stroke-linejoin="round"/></svg>'
    });
    function armTimer(job) {
        if (frozen() || job.started !== null) return;
        job.started = timerNow();
        job.id = setTimeout(() => { playbackTimers.delete(job); job.callback(); }, job.remaining);
    }
    function playbackTimer(callback, ms, kind = 'effect', onCancel) {
        const job = { callback, remaining: ms, kind, onCancel, id: null, started: null };
        playbackTimers.add(job); armTimer(job); return job;
    }
    function cancelTimer(job) {
        if (!job || !playbackTimers.delete(job)) return;
        clearTimeout(job.id); job.onCancel?.();
    }
    function freezeTimers() {
        playbackTimers.forEach(job => {
            if (job.started === null) return;
            clearTimeout(job.id);
            job.remaining = Math.max(0, job.remaining - (timerNow() - job.started));
            job.started = null;
        });
        layer.classList.add('adv-frozen'); root.pauseStoryCues?.();
    }
    function resumeTimers() {
        if (frozen()) return;
        layer.classList.remove('adv-frozen'); root.resumeStoryCues?.();
        playbackTimers.forEach(armTimer);
        if (!playbackTimers.has(autoTimer)) scheduleAuto();
    }
    // Retain both decoded images and failed requests for the lifetime of this page.
    const imageCache = new Map();
    const byId = id => document.getElementById(id);
    function episodeImages(episode) {
        const files = new Set();
        const background = key => { if (assets.backgrounds[key]) files.add(assets.backgrounds[key]); };
        const portrait = (id, expression) => assets.portraitCandidates(id, expression).forEach(file => files.add(file));
        episode.scenes.forEach(scene => {
            background(scene.background);
            scene.lines.forEach(item => {
                background(item.background);
                if (!item.offscreen && !item.monologue) {
                    if (!['narration', 'announce'].includes(item.speaker)) portrait(item.speaker, item.expression);
                    if (Array.isArray(item.show)) item.show.forEach(actor => portrait(actor.id, actor.expression));
                }
            });
        });
        episode.clear?.arc?.characters.forEach(id => portrait(id, 'normal'));
        return [...files];
    }
    function loadImage(file) {
        if (imageCache.has(file)) return imageCache.get(file);
        const img = new Image();
        let resolve, loaded = false, decoding = typeof img.decode === 'function';
        const entry = { img, status: 'pending', ready: new Promise(done => { resolve = done; }) };
        imageCache.set(file, entry);
        const finish = status => {
            if (entry.status !== 'pending') return;
            entry.status = status; img.onload = null; img.onerror = null; resolve(entry);
        };
        const fallback = () => {
            decoding = false;
            if (loaded || img.complete) finish(loaded || img.naturalWidth > 0 ? 'ready' : 'failed');
        };
        entry.useLoadFallback = fallback;
        img.onload = () => { loaded = true; if (!decoding) finish('ready'); };
        img.onerror = () => finish('failed');
        img.src = assets.url(file);
        if (decoding && entry.status === 'pending') {
            try { Promise.resolve(img.decode()).then(() => finish('ready'), fallback); }
            catch (_) { fallback(); }
        }
        return entry;
    }
    function preloadEpisode(episode) {
        const entries = episodeImages(episode).map(loadImage);
        return new Promise(resolve => {
            const done = () => { clearTimeout(timer); waits.delete(timer); resolve(); };
            const timer = setTimeout(() => {
                // After the deadline, keep the old load/error behavior for late images.
                entries.filter(entry => entry.status === 'pending').forEach(entry => entry.useLoadFallback());
                done();
            }, 6000);
            waits.set(timer, done);
            Promise.all(entries.map(entry => entry.ready)).then(done);
        });
    }
    function setLoading(loading) {
        S.loading = loading;
        if (!layer) return;
        layer.setAttribute('aria-busy', String(loading));
        byId('adv-loading').hidden = !loading;
        byId('adv-dialogue').hidden = loading;
        byId('adv-log-button').disabled = loading;
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = loading; });
    }
    async function beginPlayback() {
        cancelTimers(); const token = ++S.token;
        S.busy = true; S.typing = false; setLoading(true); savePosition();
        await preloadEpisode(S.episode);
        if (token !== S.token || !S.active) return;
        setLoading(false); S.busy = false;
        byId('adv-dialogue').focus(); renderCurrent();
    }
    function loadSave() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (raw?.version === 1) return { version: 1, resume: raw.resume || null, auto: raw.auto === true };
        } catch (_) { /* storage can be unavailable */ }
        return { version: 1, resume: null, auto: false };
    }
    let saved = loadSave();
    function writeSave() {
        try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) { /* continue without storage */ }
    }
    const autoDelay = text => Math.max(2000, Math.min(6500, 1500 + 70 * Array.from(text || '').length));
    function savePosition() {
        if (!S.episode || S.conversation) return;
        saved.resume = { episodeId: S.episode.id, sceneId: S.sceneId, lineIndex: S.lineIndex,
            stage: S.stage, savedAt: Date.now() };
        if (S.continuedAsWin) saved.resume.continuedAsWin = true;
        writeSave();
    }
    function scene() { return S.episode?.scenes.find(item => item.id === S.sceneId); }
    function line() { return scene()?.lines[S.lineIndex]; }
    function wait(ms) { return new Promise(resolve => playbackTimer(resolve, effectDelay(ms), 'effect', resolve)); }
    function cancelTimers() {
        [...playbackTimers].forEach(cancelTimer);
        clearLinePresentation();
        waits.forEach((resolve, timer) => { clearTimeout(timer); resolve(); });
        waits.clear();
        root.stopStoryCues?.();
    }
    function stop() {
        S.token++;
        stopFastForward();
        cancelTimers();
        if (S.pending) { abandonBattle(); return; }
        S.active = false; S.typing = false; S.busy = false; S.logOpen = false; S.paused = false; S.skipOpen = false;
        S.conversation = null;
        setLoading(false);
        if (layer) layer.hidden = true;
    }
    function returnToSelection() {
        if (S.active && S.stage !== 'clear') savePosition();
        stop();
        root.openStoryStage?.();
    }
    function ensureLayer() {
        if (layer) return;
        layer = document.createElement('section');
        layer.id = 'story-adv'; layer.className = 'story-adv'; layer.hidden = true;
        layer.setAttribute('aria-label', 'ストーリー');
        layer.innerHTML = `
            <div class="adv-background" id="adv-background"></div>
            <header class="adv-toolbar"><span id="adv-episode-label"></span><div>
                <button type="button" class="adv-control" id="adv-auto" aria-label="オート" aria-pressed="false">オート OFF</button>
                <button type="button" class="adv-control" id="adv-fast" aria-label="早送り" aria-pressed="false"><span aria-hidden="true">⏩</span>早送り</button>
                <button type="button" class="adv-control" id="adv-skip" aria-label="スキップ"><span aria-hidden="true">⏭</span>スキップ</button>
                <button type="button" class="adv-control" id="adv-pause" aria-label="一時停止"><span aria-hidden="true">⏸</span>一時停止</button>
                <button type="button" class="adv-control" id="adv-log-button" aria-label="ログ">ログ</button>
                <button type="button" class="adv-control" id="adv-menu" aria-label="メニュー">メニュー</button>
            </div></header>
            <div class="adv-portraits" id="adv-portraits" aria-hidden="true"></div>
            <div class="adv-loading" id="adv-loading" role="status" aria-live="polite" hidden>
                <span aria-hidden="true">✦</span><strong>読み込み中…</strong>
            </div>
            <div class="adv-dialogue" id="adv-dialogue" tabindex="0" role="button" aria-label="会話を進める">
                <div class="adv-name" id="adv-name"></div>
                <div class="adv-text" id="adv-text" aria-live="polite"></div>
                <span class="adv-next" id="adv-next" aria-hidden="true" hidden><svg viewBox="0 0 42 24"><ellipse cx="21" cy="12" rx="12" ry="9" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="21" cy="12" rx="8" ry="5" fill="none" stroke="currentColor"/><path d="M3 2v7m3-7v7m3-7v7M3 7q3 6 6 0M6 10v12M37 2v20m0-20q-7 8 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
            </div>
            <div class="adv-line-effects" id="adv-line-effects" aria-hidden="true"></div>
            <div class="adv-effect" id="adv-effect" aria-hidden="true"></div>
            <section class="adv-log" id="adv-log" hidden aria-label="会話ログ">
                <h2>会話ログ</h2><div id="adv-log-lines"></div><button type="button" id="adv-log-close">閉じる</button>
            </section>
            <section class="adv-panel" id="adv-pause-panel" role="dialog" aria-modal="true" aria-labelledby="adv-pause-title" hidden>
                <h2 id="adv-pause-title">一時停止中</h2><div>
                <button type="button" id="adv-resume">再開</button><button type="button" id="adv-pause-log">ログ</button>
                <button type="button" id="adv-pause-skip">スキップ</button><button type="button" id="adv-pause-exit">ストーリー選択へ戻る</button>
                </div>
            </section>
            <section class="adv-panel" id="adv-skip-panel" role="dialog" aria-modal="true" aria-labelledby="adv-skip-title" hidden>
                <h2 id="adv-skip-title">次の区切りまでスキップしますか？</h2><div>
                <button type="button" id="adv-skip-yes">はい</button><button type="button" id="adv-skip-no">いいえ</button>
                </div>
            </section>
            <section class="adv-ending" id="adv-ending" hidden></section>`;
        document.body.appendChild(layer);
        // Keep the portrait's head below the toolbar, including wrapped phone controls.
        const toolbar = layer.querySelector('.adv-toolbar');
        const measureToolbar = () => layer.style.setProperty('--adv-toolbar-height', `${toolbar.getBoundingClientRect().height}px`);
        if (root.ResizeObserver) new root.ResizeObserver(measureToolbar).observe(toolbar);
        const measureDialogue = () => layer.style.setProperty('--adv-dialogue-height', `${byId('adv-dialogue').getBoundingClientRect().height}px`);
        if (root.ResizeObserver) new root.ResizeObserver(measureDialogue).observe(byId('adv-dialogue'));
        root.addEventListener?.('resize', measureToolbar);
        root.addEventListener?.('resize', measureDialogue);
        layer.addEventListener('click', event => {
            if (event.target.closest('button, .adv-log, .adv-panel, .adv-ending, .adv-toolbar')) return;
            advance();
        });
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', event => {
            if (event.key !== 'Control' || !S.ctrlHeld) return;
            S.ctrlHeld = false; updateFastButton(); cancelTimer(autoTimer); scheduleAuto();
        });
        root.addEventListener?.('blur', () => {
            if (!S.ctrlHeld) return;
            S.ctrlHeld = false; updateFastButton(); cancelTimer(autoTimer); scheduleAuto();
        });
        byId('adv-auto').onclick = toggleAuto;
        byId('adv-fast').onclick = toggleFastForward;
        byId('adv-skip').onclick = () => askSkip();
        byId('adv-pause').onclick = () => pausePlayback();
        byId('adv-resume').onclick = resumePlayback;
        byId('adv-pause-log').onclick = () => openLog(true);
        byId('adv-pause-skip').onclick = () => askSkip();
        byId('adv-pause-exit').onclick = returnToSelection;
        byId('adv-skip-no').onclick = dismissSkip;
        byId('adv-skip-yes').onclick = skipToStop;
        byId('adv-menu').onclick = returnToSelection;
        byId('adv-log-button').onclick = () => openLog(true);
        byId('adv-log-close').onclick = () => openLog(false);
        document.addEventListener('visibilitychange', () => {
            cancelTimer(autoTimer);
            if (document.visibilityState === 'hidden') stopFastForward();
            if (document.visibilityState !== 'hidden') scheduleAuto();
        });
    }
    function openLog(open) {
        if (S.loading) return;
        if (open) { stopFastForward(); freezeTimers(); }
        S.logOpen = open;
        byId('adv-log').hidden = !open;
        if (open) {
            const list = byId('adv-log-lines'); list.replaceChildren();
            S.backlog.forEach(item => {
                const p = document.createElement('p'), name = document.createElement('strong');
                name.textContent = item.name; p.appendChild(name);
                p.appendChild(document.createTextNode(item.text)); list.appendChild(p);
            });
            list.scrollTop = list.scrollHeight;
            byId('adv-log-close').focus();
        } else { resumeTimers(); byId(S.paused ? 'adv-resume' : 'adv-dialogue').focus(); }
    }
    function toggleAuto() {
        saved.auto = !saved.auto;
        if (saved.auto) stopFastForward();
        writeSave(); updateAutoButton(); cancelTimer(autoTimer); scheduleAuto();
    }
    function updateAutoButton() {
        if (!layer) return;
        byId('adv-auto').textContent = `オート ${saved.auto ? 'ON' : 'OFF'}`;
        byId('adv-auto').setAttribute('aria-pressed', String(saved.auto));
    }
    function updateFastButton() {
        if (!layer) return;
        byId('adv-fast').setAttribute('aria-pressed', String(fast()));
        layer.classList.toggle('adv-fast', fast());
    }
    function stopFastForward() {
        const wasFast = fast(); S.fastForward = false; S.ctrlHeld = false;
        if (wasFast) cancelTimer(autoTimer);
        updateFastButton();
    }
    function enableFastForward(held = false) {
        if (!S.active || S.loading || frozen() || !byId('adv-ending').hidden) return;
        if (held) S.ctrlHeld = true; else S.fastForward = true;
        clearLinePresentation(); root.stopStoryCues?.();
        saved.auto = false; writeSave(); updateAutoButton(); updateFastButton();
        // Shorten an effect already in progress, while preserving its continuation.
        playbackTimers.forEach(job => {
            if (!['effect', 'portrait'].includes(job.kind)) return;
            clearTimeout(job.id);
            job.remaining = Math.min(100, Math.max(0, job.remaining - (timerNow() - job.started)));
            job.started = null;
            armTimer(job);
        });
        if (S.typing) completeText(); else scheduleAuto();
    }
    function toggleFastForward() {
        if (fast()) { stopFastForward(); scheduleAuto(); }
        else enableFastForward();
    }
    function pausePlayback() {
        if (!S.active || S.loading || S.paused || !byId('adv-ending').hidden) return;
        stopFastForward(); freezeTimers(); S.paused = true;
        layer.classList.add('adv-panel-open');
        byId('adv-pause-panel').hidden = false; byId('adv-resume').focus();
    }
    function resumePlayback() {
        if (!S.paused || S.logOpen || S.skipOpen) return;
        S.paused = false; byId('adv-pause-panel').hidden = true;
        layer.classList.remove('adv-panel-open');
        resumeTimers(); byId('adv-dialogue').focus();
    }
    function askSkip() {
        if (!S.active || S.loading || S.logOpen || S.skipOpen || !byId('adv-ending').hidden) return;
        stopFastForward(); freezeTimers(); S.skipOpen = true;
        layer.classList.add('adv-panel-open'); byId('adv-pause-panel').hidden = true;
        byId('adv-skip-panel').hidden = false; byId('adv-skip-no').focus();
    }
    function dismissSkip() {
        S.skipOpen = false; byId('adv-skip-panel').hidden = true;
        byId('adv-pause-panel').hidden = !S.paused;
        layer.classList.toggle('adv-panel-open', S.paused);
        resumeTimers(); byId(S.paused ? 'adv-resume' : 'adv-dialogue').focus();
    }
    function handleKeyDown(event) {
        if (!S.active || event.isComposing) return;
        const panelButtons = S.logOpen ? ['adv-log-close'] : S.skipOpen ? ['adv-skip-yes', 'adv-skip-no'] :
            S.paused ? ['adv-resume', 'adv-pause-log', 'adv-pause-skip', 'adv-pause-exit'] : [];
        if (event.key === 'Tab' && panelButtons.length) {
            const buttons = panelButtons.map(byId), index = buttons.indexOf(document.activeElement);
            event.preventDefault();
            buttons[index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) :
                (index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); return;
        }
        if (event.repeat || S.loading) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (S.logOpen) openLog(false);
            else if (S.skipOpen) dismissSkip();
            else if (S.paused) resumePlayback();
            else pausePlayback();
            return;
        }
        if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
        if (event.key === 'Control' && !frozen()) { event.preventDefault(); enableFastForward(true); return; }
        if (frozen() || event.target.closest?.('button') || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); advance();
    }
    function scheduleAuto() {
        cancelTimer(autoTimer);
        if ((!saved.auto && !fast()) || !S.active || S.typing || S.busy || frozen() ||
            document.visibilityState === 'hidden' || !byId('adv-ending').hidden) return;
        autoTimer = playbackTimer(advance, fast() ? 300 : autoDelay(S.text), 'advance');
    }
    function setBackground(key) {
        const element = byId('adv-background');
        element.style.backgroundImage = '';
        const file = assets.backgrounds[key];
        if (!file) return;
        const entry = loadImage(file), token = S.token;
        const show = () => {
            if (entry.status === 'ready' && token === S.token && S.active) element.style.backgroundImage = `url("${assets.url(file)}")`;
        };
        if (entry.status === 'pending') entry.ready.then(show);
        else show(); // failed images keep the CSS gradient
    }
    function stageLine(item) {
        if (item.offscreen || item.monologue) { S.actors.clear(); return; }
        if (item.hide === 'all') S.actors.clear();
        else if (Array.isArray(item.hide)) item.hide.forEach(id => S.actors.delete(id));
        const speaking = !['narration', 'announce'].includes(item.speaker);
        if (speaking && !Array.isArray(item.show)) {
            for (const id of S.actors.keys()) if (id !== item.speaker) S.actors.delete(id);
        }
        if (Array.isArray(item.show)) item.show.forEach(actor => {
            if (actor.onlyIfShown) {
                const current = S.actors.get(actor.id);
                if (current) S.actors.set(actor.id, { ...current, expression: actor.expression || current.expression });
            } else S.actors.set(actor.id, { ...actor });
        });
        if (speaking) S.actors.set(item.speaker, { id: item.speaker, position: item.position,
            expression: item.expression || 'normal' });
        if (item.speaker === 'announce') S.actors.clear();
    }
    function renderActors(speaker) {
        const container = byId('adv-portraits');
        for (const element of container.children) {
            if (S.actors.has(element.dataset.actor)) continue;
            element.classList.add('leaving');
            const remove = () => element.remove();
            playbackTimer(remove, effectDelay(200), 'portrait', remove);
        }
        S.actors.forEach(actor => {
            let element = [...container.children].find(el => el.dataset.actor === actor.id && !el.classList.contains('leaving'));
            if (!element) {
                element = document.createElement('div'); element.dataset.actor = actor.id;
                element.className = 'adv-portrait entering'; container.appendChild(element);
                const entered = () => element.classList.remove('entering');
                playbackTimer(entered, effectDelay(240), 'portrait', entered);
            }
            element.dataset.position = actor.position || 'center';
            const framing = assets.characters[actor.id];
            element.style.setProperty('--adv-focus-y', String(framing?.focusY ?? .055));
            element.style.setProperty('--adv-portrait-scale', String(framing?.scale ?? 1.35));
            element.style.setProperty('--adv-mark-y', String({ mai: .08, takumi: .08, akatsuki: .07 }[actor.id] ?? .13));
            element.classList.toggle('speaking', actor.id === speaker);
            element.classList.toggle('dimmed', S.actors.size > 1 && actor.id !== speaker);
            const candidates = assets.portraitCandidates(actor.id, actor.expression);
            const request = candidates.join('|');
            if (element.dataset.request === request) return;
            element.dataset.request = request; element.replaceChildren();
            if (!candidates.length) return; // unknown / artwork not registered: name only
            const img = document.createElement('img'); img.alt = ''; element.appendChild(img);
            let index = candidates.findIndex(file => imageCache.get(file)?.status !== 'failed');
            if (index < 0) { img.remove(); return; }
            img.onerror = () => {
                if (element.dataset.request !== request) return;
                index++;
                if (index < candidates.length) img.src = assets.url(candidates[index]);
                else img.remove();
            };
            img.src = assets.url(candidates[index]);
        });
    }
    function nameFor(item) {
        return item.name || assets.characters[item.speaker]?.name || (item.speaker === 'announce' ? '校内放送' : item.speaker === 'narration' ? '' : String(item.speaker || ''));
    }
    function clearLinePresentation() {
        if (!layer) return;
        const screen = byId('adv-line-effects');
        if (screen) screen.className = 'adv-line-effects';
        layer.classList.remove('adv-screen-shake');
        for (const portrait of byId('adv-portraits').children) {
            for (const motion of root.BattleStoryData.presentation.motions) portrait.classList.remove(`adv-motion-${motion}`);
            portrait.querySelector('.adv-emotion-mark')?.remove();
        }
    }
    // Decorative line beats run alongside typing: never make input wait for a motion.
    function presentLine(item) {
        if (fast()) return;
        const portrait = [...byId('adv-portraits').children].find(el => el.dataset.actor === item.speaker && !el.classList.contains('leaving'));
        const cleanup = () => clearLinePresentation();
        if (portrait && item.mark && portrait.children.length) {
            const mark = document.createElement('span');
            mark.className = 'adv-emotion-mark'; mark.dataset.mark = item.mark;
            if (markArt[item.mark].startsWith('<svg')) mark.innerHTML = markArt[item.mark];
            else mark.textContent = markArt[item.mark];
            portrait.appendChild(mark);
        }
        if (!reducedMotion()) {
            if (portrait && item.motion) portrait.classList.add(`adv-motion-${item.motion}`);
            if (item.screen === 'screenShake') layer.classList.add('adv-screen-shake');
            else if (item.screen) byId('adv-line-effects').classList.add(`adv-screen-${item.screen}`);
        }
        if (item.motion || item.mark || item.screen) playbackTimer(cleanup, 850, 'portrait', cleanup);
    }
    function completeText() {
        cancelTimer(typeTimer); S.typing = false; S.typed = S.chars.length;
        byId('adv-text').textContent = S.text; byId('adv-next').hidden = false; scheduleAuto();
    }
    function typeText() {
        byId('adv-text').textContent = S.chars.slice(0, ++S.typed).join('');
        if (S.typed >= S.chars.length) return completeText();
        typeTimer = playbackTimer(typeText, 30, 'type');
    }
    async function effect(name, token, item = {}) {
        const element = byId('adv-effect');
        if (['chime', 'crowd', 'notify'].includes(name)) { root.playStoryCue?.(name, fast() ? .12 : 1); await wait(name === 'chime' ? 850 : name === 'notify' ? 350 : 650); return; }
        if (name === 'battleTease') {
            element.replaceChildren();
            const img = document.createElement('img'); img.src = assets.url('assets/battle-images/card-back.webp'); img.alt = '';
            const title = document.createElement('strong'); title.textContent = item.finalBattle ? 'FINAL BATTLE' : 'Battle à la carte';
            element.append(img, title); element.className = 'adv-effect battle-tease' + (item.finalBattle ? ' final-battle' : '');
            await wait(item.finalBattle ? 1600 : 950);
            if (token === S.token) { element.className = 'adv-effect'; element.replaceChildren(); }
        } else if (name === 'fadeOut') {
            await wait(850); // chime completes before the blackout
            if (token !== S.token) return;
            element.className = 'adv-effect fade-out'; await wait(700);
        } else if (name === 'shake') {
            if (!reducedMotion()) layer.classList.add('adv-shake'); await wait(250);
            if (token === S.token) layer.classList.remove('adv-shake');
        }
    }
    async function renderCurrent() {
        cancelTimers(); const token = ++S.token;
        const item = line();
        if (S.stage === 'battle' && !item?.finalBattle) return chooseBattle();
        if (!item) return endScene();
        savePosition(); S.busy = true; S.typing = false; byId('adv-next').hidden = true;
        layer.classList.toggle('adv-battle-intro', scene()?.battleIntro === true);
        layer.classList.toggle('adv-monologue', scene()?.lines.slice(0, S.lineIndex + 1).findLast(item => item.text)?.monologue === true);
        stageLine(item); renderActors(item.speaker);
        setBackground(item.background !== undefined ? item.background : currentBackground());
        presentLine(item);
        if (root.BattleStoryData.presentation.cues.includes(item.se)) root.playStoryCue?.(item.se, fast() ? .12 : 1);
        else if (item.se) root.playSfx?.(item.se);
        if (item.effect) await effect(item.effect, token, item);
        else if (!item.wait && ['chime', 'crowd', 'notify'].includes(item.se)) await wait(item.se === 'chime' ? 850 : item.se === 'notify' ? 350 : 650);
        if (token !== S.token || !S.active) return;
        if (item.battle) { S.busy = false; return chooseBattle(); }
        if (item.wait) await wait(Math.max(0, Number(item.wait) || 0));
        if (token !== S.token || !S.active) return;
        S.busy = false;
        if (!item.text) { S.lineIndex++; return renderCurrent(); }
        S.text = item.text; S.chars = Array.from(S.text); S.typed = 0;
        byId('adv-name').textContent = nameFor(item);
        byId('adv-name').dataset.speaker = item.speaker;
        byId('adv-text').textContent = '';
        S.backlog.push({ name: nameFor(item), text: item.text });
        if (fast() || reducedMotion()) completeText();
        else { S.typing = true; typeText(); }
    }
    function currentBackground() {
        let key;
        for (const current of playbackRoute()) {
            if (current.background !== undefined) key = current.background;
            const count = current.id === S.sceneId ? S.lineIndex + 1 : current.lines.length;
            current.lines.slice(0, count).forEach(item => { if (item.background !== undefined) key = item.background; });
            if (current.id === S.sceneId) break;
        }
        return key;
    }
    function advance() {
        if (!S.active || S.busy || frozen() || !byId('adv-ending').hidden) return;
        if (S.typing) return completeText();
        cancelTimer(autoTimer);
        if (S.stage === 'pre' && line()?.id && line().id === S.episode.battle?.after) return chooseBattle();
        S.lineIndex++; renderCurrent();
    }
    function enterScene(id, stage) {
        S.sceneId = id; S.lineIndex = 0; S.stage = stage;
        if (scene()?.bgm !== false) root.playStoryBGM?.(S.episode.protagonist);
        renderCurrent();
    }
    function endScene() {
        if (S.conversation) return showConversationChoices();
        if (S.stage === 'lose') return showLoseChoices();
        if (scene()?.next) return enterScene(scene().next, S.stage);
        if (S.stage === 'post') return clearEpisode();
        if (S.stage === 'pre' && S.sceneId === S.episode.battle?.after) return chooseBattle();
        const index = S.episode.scenes.findIndex(item => item.id === S.sceneId);
        const next = S.episode.scenes[index + 1];
        if (next) enterScene(next.id, S.stage);
    }
    function battlePosition(episode) {
        for (const item of episode.scenes) {
            const index = item.lines.findIndex(l => l.battle || l.id === episode.battle?.after);
            if (index >= 0) return { sceneId: item.id, lineIndex: index };
            if (item.id === episode.battle?.after) return { sceneId: item.id, lineIndex: item.lines.length };
        }
        return null;
    }
    function chooseBattle() {
        S.stage = 'battle'; savePosition();
        stop();
        root.openStorySkillChoice?.(S.episode,
            skill => {
                S.battleActive = true; S.stage = 'battle'; savePosition();
                root.startStoryCpuBattle(S.episode, skill);
            }, () => root.openStoryStage?.());
    }
    function handleBattleEnded(winner) {
        if (!S.battleActive || root.__storyActiveEpisodeId !== S.episode?.id) return false;
        S.battleActive = false;
        S.pending = { sceneId: winner === 'player' ? S.episode.afterBattle.win : S.episode.afterBattle.lose,
            stage: winner === 'player' ? 'post' : 'lose' };
        S.sceneId = S.pending.sceneId; S.lineIndex = 0; S.stage = S.pending.stage; savePosition();
        root.__storyResultPending = true;
        // Preserve the normal CPU finale/result until the player chooses to continue.
        setResultExitLabels(true);
        return true;
    }
    function setResultExitLabels(story) {
        ['result-exit-button', 'final-field-exit-button'].forEach(id => {
            const button = byId(id);
            if (button) button.textContent = story ? 'ストーリーへ進む' : '対戦を終わらせる';
        });
    }
    function finishBattleReturn() {
        if (!S.pending) return false;
        const pending = S.pending; S.pending = null;
        root.__storyResultPending = false;
        setResultExitLabels(false);
        root.resetStoryBattleContext?.();
        S.sceneId = pending.sceneId; S.lineIndex = 0; S.stage = pending.stage;
        activate();
        if (scene()?.bgm !== false) root.playStoryBGM?.(S.episode.protagonist);
        beginPlayback(); return true;
    }
    function abandonBattle() {
        if (!S.battleActive && !S.pending) return;
        savePosition(); S.battleActive = false; S.pending = null;
        root.__storyResultPending = false; setResultExitLabels(false); root.resetStoryBattleContext?.(); stop();
    }
    function activate() {
        ensureLayer(); S.active = true; S.busy = false; S.logOpen = false; S.paused = false; S.skipOpen = false;
        layer.hidden = false; byId('adv-log').hidden = true; byId('adv-ending').hidden = true;
        byId('adv-pause-panel').hidden = true; byId('adv-skip-panel').hidden = true;
        layer.classList.remove('adv-cleared', 'adv-frozen', 'adv-shake', 'adv-panel-open', 'adv-monologue', 'adv-arc-cleared');
        byId('adv-portraits').replaceChildren(); byId('adv-background').style.backgroundImage = '';
        byId('adv-text').textContent = ''; byId('adv-name').textContent = ''; byId('adv-next').hidden = true;
        byId('adv-effect').className = 'adv-effect'; byId('adv-effect').replaceChildren();
        byId('adv-episode-label').textContent = `${root.BattleStoryData.arcs[S.episode.arc]}　第${S.episode.number}話「${S.episode.title}」`;
        updateAutoButton(); updateFastButton();
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = false; });
        const toolbarHeight = layer.querySelector('.adv-toolbar').getBoundingClientRect().height;
        layer.style.setProperty('--adv-toolbar-height', `${toolbarHeight}px`);
        root.stopMenuFloatingBackground?.();
    }
    function playbackRoute() {
        if (S.conversation) return [scene()];
        const post = outcomeScenes(S.episode.afterBattle.win);
        const lose = outcomeScenes(S.episode.afterBattle.lose);
        const initial = S.episode.scenes.filter(item => ![...post, ...lose].includes(item));
        return ['post', 'clear'].includes(S.stage) ? [...initial, ...(S.continuedAsWin ? lose : []), ...post] :
            S.stage === 'lose' ? [...initial, ...lose] : initial;
    }
    function rebuildBeforePosition() {
        S.actors.clear(); S.backlog = S.conversation ? S.conversation.backlog.slice() : [];
        for (const current of playbackRoute()) {
            let count = current.id === S.sceneId ? S.lineIndex : current.lines.length;
            if (current.id === S.sceneId && S.stage === 'battle' && !line()?.battle && line()?.id === S.episode.battle?.after) count++;
            for (const item of current.lines.slice(0, count)) {
                stageLine(item);
                if (item.text) S.backlog.push({ name: nameFor(item), text: item.text });
            }
            if (current.id === S.sceneId) break;
        }
    }
    async function skipToStop() {
        if (!S.skipOpen) return;
        const route = playbackRoute();
        let position;
        if (S.conversation) position = { sceneId: S.sceneId, lineIndex: scene().lines.length };
        else if (S.stage === 'pre') position = battlePosition(S.episode);
        else {
            const last = route[route.length - 1];
            if (last) {
                const fadeIndex = last.lines.findLastIndex(item => item.effect === 'fadeOut');
                position = { sceneId: last.id, lineIndex: S.stage === 'post' && fadeIndex >= 0 ? fadeIndex : last.lines.length };
            }
        }
        if (!position) { dismissSkip(); return; }
        ++S.token; cancelTimers(); stopFastForward();
        S.paused = false; S.skipOpen = false; S.busy = false; S.typing = false;
        byId('adv-pause-panel').hidden = true; byId('adv-skip-panel').hidden = true;
        layer.classList.remove('adv-frozen', 'adv-shake', 'adv-panel-open');
        byId('adv-effect').className = 'adv-effect'; byId('adv-effect').replaceChildren();
        Object.assign(S, position); rebuildBeforePosition(); savePosition();
        layer.classList.toggle('adv-battle-intro', scene()?.battleIntro === true);
        // Rebuild also includes the current line once, even if its typewriter was incomplete.
        const previous = S.backlog[S.backlog.length - 1];
        S.text = previous?.text || ''; byId('adv-text').textContent = S.text;
        byId('adv-name').textContent = previous?.name || '';
        renderActors(); setBackground(currentBackground());
        if (S.conversation) return showConversationChoices();
        if (S.stage === 'pre') {
            const marker = line();
            if (marker) {
                stageLine(marker);
                if (marker.text && !marker.battle) S.backlog.push({ name: nameFor(marker), text: marker.text });
                renderActors(marker.speaker);
            }
            if (marker?.finalBattle) return renderCurrent();
            return chooseBattle();
        }
        if (S.stage === 'lose') return showLoseChoices();
        if (!line()) {
            // Future episodes without an explicit final fade still end through a blackout.
            const token = S.token; S.busy = true;
            await effect('fadeOut', token);
            if (token === S.token && S.active) clearEpisode();
        } else renderCurrent();
    }
    function outcomeScenes(firstId) {
        const route = [], seen = new Set();
        let current = S.episode.scenes.find(item => item.id === firstId);
        while (current && !seen.has(current.id)) {
            route.push(current); seen.add(current.id);
            current = S.episode.scenes.find(item => item.id === current.next);
        }
        return route;
    }
    function start(id, resume = false) {
        const episode = root.BattleStoryData.get(id); if (!episode) return;
        if (root.CharacterNotice && !root.CharacterNotice.beforeStory(() => start(id, resume))) return;
        stop(); S.episode = episode; S.pending = null;
        const position = resume && saved.resume?.episodeId === id ? saved.resume : null;
        S.continuedAsWin = position?.continuedAsWin === true;
        S.sceneId = position?.sceneId || episode.scenes[0].id;
        S.stage = ['pre', 'battle', 'post', 'lose'].includes(position?.stage) ? position.stage : 'pre';
        if (!scene()) { S.sceneId = episode.scenes[0].id; S.stage = 'pre'; }
        S.lineIndex = Math.max(0, Math.min(Math.floor(Number(position?.lineIndex) || 0), scene().lines.length));
        if (S.stage === 'battle') Object.assign(S, battlePosition(episode));
        // A saved post/lose position is the receipt of a completed battle.
        if (S.stage === 'post' && !outcomeScenes(episode.afterBattle.win).some(item => item.id === S.sceneId)) { S.sceneId = episode.afterBattle.win; S.lineIndex = 0; }
        if (S.stage === 'lose' && S.sceneId !== episode.afterBattle.lose) { S.sceneId = episode.afterBattle.lose; S.lineIndex = 0; }
        rebuildBeforePosition(); activate();
        const previous = S.backlog[S.backlog.length - 1];
        S.text = previous?.text || '';
        byId('adv-text').textContent = S.text;
        byId('adv-name').textContent = previous?.name || '';
        root.playStoryBGM?.(S.episode.protagonist); return beginPlayback();
    }
    function endingButton(text, action) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = action;
        byId('adv-ending').appendChild(button);
    }
    // Conversations only: the existing tutorial owns every battle and progress decision.
    function playConversation(episode, lines, options) {
        const backlog = options.phase === 'post' && S.episode?.tutorial && S.episode.id === episode.id
            ? S.backlog.slice() : [];
        stop();
        S.episode = root.BattleStoryData.validate({
            id: episode.id, number: Number(episode.id.replace('episode', '')), arc: episode.arc,
            title: episode.title.replace(/^第\d+話\s*/, ''), tutorial: true, protagonist: episode.protagonist,
            defaultPositions: Object.fromEntries(Object.keys(assets.characters).map(id =>
                [id, id === episode.protagonist ? 'right' : 'left'])),
            scenes: [{ id: options.phase, background: episode.background, lines }]
        });
        S.conversation = { getActions: options.getActions, backlog };
        S.sceneId = options.phase; S.stage = options.phase; S.lineIndex = 0;
        S.battleActive = false; S.pending = null; S.continuedAsWin = false;
        rebuildBeforePosition(); activate();
        root.playStoryBGM?.(S.episode.protagonist);
        return beginPlayback();
    }
    function showConversationChoices() {
        S.busy = false; stopFastForward(); cancelTimer(autoTimer);
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = true; });
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        S.conversation.getActions().forEach(({ text, action }) => {
            endingButton(text, () => { stop(); action?.(); });
        });
        ending.children[0]?.focus();
    }
    function showLoseChoices() {
        S.busy = false; stopFastForward(); cancelTimer(autoTimer); savePosition();
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = true; });
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        endingButton('もう一度挑戦', () => {
            S.continuedAsWin = false;
            Object.assign(S, battlePosition(S.episode)); S.stage = 'battle'; chooseBattle();
        });
        endingButton('勝ったことにして進める', () => {
            S.continuedAsWin = true; S.sceneId = S.episode.afterBattle.win; S.lineIndex = 0; S.stage = 'post';
            savePosition(); rebuildBeforePosition(); activate();
            if (scene()?.bgm !== false) root.playStoryBGM?.(S.episode.protagonist);
            renderCurrent(); byId('adv-dialogue').focus();
        });
        endingButton('ストーリー選択へ戻る', returnToSelection);
        ending.children[0]?.focus();
    }
    function clearEpisode() {
        if (S.stage !== 'post') return;
        stopFastForward(); cancelTimer(autoTimer); saved.resume = null; writeSave();
        root.BattleStoryProgress?.complete(S.episode.id);
        S.stage = 'clear';
        S.busy = false;
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = true; });
        layer.classList.add('adv-cleared');
        layer.classList.remove('adv-monologue', 'adv-battle-intro');
        byId('adv-effect').className = 'adv-effect';
        byId('adv-effect').replaceChildren();
        setBackground(currentBackground());
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        const heading = document.createElement('h2'); heading.textContent = `第${S.episode.number}話 CLEAR`;
        const title = document.createElement('p'); title.className = 'adv-clear-title'; title.textContent = S.episode.clear.title;
        ending.append(heading, title);
        if (S.episode.clear.next) {
            const next = document.createElement('p'); next.className = 'adv-teaser';
            next.textContent = `NEXT 第${S.episode.clear.next.number}話「${S.episode.clear.next.title}」`;
            ending.appendChild(next);
        }
        if (S.episode.clear.arc) endingButton('出会い・文化祭編 CLEARへ', showArcClear);
        else endingButton('ストーリー選択へ戻る', () => { stop(); root.openStoryStage?.(); });
        ending.children[ending.children.length - 1]?.focus();
    }
    function showArcClear() {
        const arc = S.episode.clear.arc;
        if (S.stage !== 'clear' || !arc) return;
        const ending = byId('adv-ending'); ending.replaceChildren();
        layer.classList.add('adv-arc-cleared');
        const heading = document.createElement('h2'); heading.textContent = arc.title;
        const portraits = document.createElement('div'); portraits.className = 'adv-arc-portraits';
        arc.characters.forEach(id => {
            const character = assets.characters[id];
            if (!character) return;
            const figure = document.createElement('figure');
            const file = assets.portraitPath(id, 'normal');
            if (file) { const img = document.createElement('img'); img.src = assets.url(file); img.alt = ''; figure.appendChild(img); }
            const name = document.createElement('figcaption'); name.textContent = character.name;
            figure.appendChild(name); portraits.appendChild(figure);
        });
        const text = document.createElement('p'); text.className = 'adv-arc-message'; text.textContent = arc.text;
        ending.append(heading, portraits, text);
        const notice = document.createElement('p'); notice.className = 'character-notice adv-arc-notice';
        notice.textContent = root.CharacterNotice.shortText;
        ending.appendChild(notice);
        endingButton('ストーリー選択へ戻る', () => { stop(); root.openStoryStage?.(); });
        ending.children[ending.children.length - 1]?.focus();
    }
    root.addEventListener?.('pagehide', () => { if (S.battleActive || S.pending) abandonBattle();
        if (S.active && S.stage !== 'clear') savePosition(); stop(); });
    function appendEpisodeCards(list) {
        const progress = root.BattleStoryProgress?.load() || {};
        let currentArc;
        root.BattleStoryData.all().forEach(episode => {
            if (currentArc !== episode.arc) {
                currentArc = episode.arc;
                const heading = document.createElement('h2'); heading.className = 'story-arc-heading';
                heading.textContent = root.BattleStoryData.arcs[currentArc]; list.appendChild(heading);
            }
            const card = document.createElement('article'); card.className = 'story-episode-card';
            const unlocked = !episode.unlockRequires || !!progress[episode.unlockRequires];
            for (const [className, text] of [
                ['story-episode-title', '第' + episode.number + '話「' + episode.title + '」'],
                ['story-episode-summary', episode.summary || ''],
                ['story-episode-meta', progress[episode.id] ? 'クリア済み' : unlocked ? 'プレイ可能' : '未解放']
            ]) {
                const element = document.createElement('div'); element.className = className; element.textContent = text; card.appendChild(element);
            }
            const addButton = (text, resume) => {
                const button = document.createElement('button'); button.className = 'story-episode-start';
                button.textContent = text; button.disabled = !unlocked;
                button.setAttribute('data-story-episode-id', episode.id);
                if (resume) button.setAttribute('data-story-resume', '1');
                card.appendChild(button);
            };
            addButton('最初から', false);
            if (saved.resume?.episodeId === episode.id) addButton('続きから', true);
            list.appendChild(card);
        });
    }
    root.StoryAdv = Object.freeze({ start, playConversation, stop, abandonBattle, handleBattleEnded, finishBattleReturn, appendEpisodeCards,
        hasResume: id => saved.resume?.episodeId === id, autoDelay });
})(window);
