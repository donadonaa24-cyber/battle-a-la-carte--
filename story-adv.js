(function (root) {
    'use strict';
    const KEY = 'battleAlaCarteStoryAdvV1';
    const assets = root.BattleStoryAssets;
    const viewer = () => root.StoryViewer?.active === true;
    const S = { episode: null, sceneId: '', lineIndex: 0, stage: 'pre', active: false,
        battleActive: false, pending: null, actors: new Map(), backlog: [], token: 0,
        busy: false, loading: false, typing: false, text: '', chars: [], typed: 0, logOpen: false,
        fastForward: false, ctrlHeld: false, paused: false, skipOpen: false, continuedAsWin: false,
        conversation: null, poses: new Map(), poseSceneId: null, entranceSeen: new Set(), entrances: [], intro: null,
        skippedScenes: new Set() };
    let layer, typeTimer, autoTimer;
    let introTouchClick = false;
    const waits = new Map();
    const playbackTimers = new Set();
    const portraitFades = new WeakMap();
    const fast = () => S.fastForward || S.ctrlHeld;
    const frozen = () => S.paused || S.logOpen || S.skipOpen;
    const timerNow = () => root.performance?.now() ?? Date.now();
    const effectDelay = ms => fast() ? Math.min(ms, 100) : ms;
    const reducedMotion = () => root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const bustStyle = () => S.episode?.portraitStyle === 'bust';
    const iconStyle = () => (S.episode?.portraitStyle || 'icon') === 'icon';
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
    function bustScenePartner(episode, lines, item) {
        if (episode.portraitStyle !== 'bust' || !assets.characters[item.speaker] ||
            item.offscreen || item.monologue || item.hide || Array.isArray(item.show)) return;
        return lines.find(other => other.speaker !== item.speaker && assets.characters[other.speaker] &&
            !other.offscreen && !other.monologue)?.speaker;
    }
    function episodeImages(episode) {
        const files = new Set();
        const shown = new Set();
        const background = key => { if (assets.backgrounds[key]) files.add(assets.backgrounds[key]); };
        const icon = (episode.portraitStyle || 'icon') === 'icon';
        const portrait = (id, expression, pose, costume) => {
            (icon ? assets.iconCandidates(id, expression, costume || episode.costumes?.[id]) : assets.portraitCandidates(id, expression, pose)).forEach(file => files.add(file));
            const character = assets.characters[id];
            if (root.BattleStoryCharacterIntros?.[id] && character?.introStanding)
                files.add(character.costumes?.[costume || episode.costumes?.[id]]?.introStanding || character.introStanding);
        };
        episode.scenes.forEach(scene => {
            const poses = new Map();
            background(scene.background);
            scene.lines.forEach((item, index) => {
                const partner = index === 0 && bustScenePartner(episode, scene.lines, item);
                if (partner) { shown.add(partner); portrait(partner, 'normal', 'default'); }
                background(item.background);
                if (item.pose !== undefined) poses.set(item.speaker, item.pose);
                if (item.offscreen || item.monologue) { shown.clear(); return; }
                if (item.hide === 'all') shown.clear();
                else if (Array.isArray(item.hide)) item.hide.forEach(id => shown.delete(id));
                const speaking = !['narration', 'announce'].includes(item.speaker);
                if (speaking && !Array.isArray(item.show) && episode.portraitStyle !== 'bust') {
                    for (const id of shown) if (id !== item.speaker) shown.delete(id);
                }
                if (Array.isArray(item.show)) item.show.forEach(actor => {
                    if (!actor.onlyIfShown || shown.has(actor.id)) {
                        if (actor.pose !== undefined) poses.set(actor.id, actor.pose);
                        shown.add(actor.id);
                    }
                    portrait(actor.id, actor.expression, poses.get(actor.id), actor.costume);
                });
                if (speaking) {
                    if (item.pose !== undefined) poses.set(item.speaker, item.pose);
                    shown.add(item.speaker); portrait(item.speaker, item.expression, poses.get(item.speaker), item.costume);
                }
                if (item.speaker === 'announce') shown.clear();
            });
        });
        episode.clear?.arc?.characters.forEach(id => {
            const standing = assets.characters[id]?.standing;
            if (icon && standing) files.add(standing); else portrait(id, 'normal');
        });
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
        if (viewer()) return { version: 1, resume: null, auto: false };
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (raw?.version === 1) return { version: 1, resume: raw.resume || null, auto: raw.auto === true };
        } catch (_) { /* storage can be unavailable */ }
        return { version: 1, resume: null, auto: false };
    }
    let saved = loadSave();
    function writeSave() {
        if (viewer()) return;
        try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) { /* continue without storage */ }
    }
    const autoDelay = text => Math.max(2000, Math.min(6500, 1500 + 70 * Array.from(text || '').length));
    function savePosition() {
        if (viewer() || !S.episode || S.conversation) return;
        saved.resume = { episodeId: S.episode.id, sceneId: S.sceneId, lineIndex: S.lineIndex,
            stage: S.stage, savedAt: Date.now() };
        if (S.continuedAsWin) saved.resume.continuedAsWin = true;
        if (S.skippedScenes.size) saved.resume.skippedScenes = [...S.skippedScenes];
        writeSave();
    }
    function scene() { return S.episode?.scenes.find(item => item.id === S.sceneId); }
    function line() { return scene()?.lines[S.lineIndex]; }
    function wait(ms) { return new Promise(resolve => playbackTimer(resolve, effectDelay(ms), 'effect', resolve)); }
    function cancelTimers() {
        discardIntro();
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
        if (layer) {
            layer.hidden = true;
            if (iconStyle()) { byId('adv-portraits').replaceChildren(); S.entrances = []; }
        }
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
            <header class="adv-toolbar"><span id="adv-episode-label"></span>
                <span id="adv-viewer-badge" class="adv-viewer-badge" hidden>ビューア</span>
                <div>
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
                <div class="adv-face-icon" id="adv-face-icon" aria-hidden="true" hidden><div class="adv-icon-crop" id="adv-icon-crop"></div></div>
                <div class="adv-name" id="adv-name"></div>
                <div class="adv-text" id="adv-text" aria-live="polite"></div>
                <span class="adv-next" id="adv-next" aria-hidden="true" hidden><svg viewBox="0 0 42 24"><ellipse cx="21" cy="12" rx="12" ry="9" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="21" cy="12" rx="8" ry="5" fill="none" stroke="currentColor"/><path d="M3 2v7m3-7v7m3-7v7M3 7q3 6 6 0M6 10v12M37 2v20m0-20q-7 8 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
            </div>
            <div class="adv-line-effects" id="adv-line-effects" aria-hidden="true"></div>
            <section class="adv-character-intro" id="adv-character-intro" tabindex="0" role="button" aria-label="キャラクター紹介・タップで続ける" hidden></section>
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
        const measureDialogue = () => {
            const rect = byId('adv-dialogue').getBoundingClientRect();
            layer.style.setProperty('--adv-dialogue-height', `${rect.height}px`);
            layer.style.setProperty('--adv-dialogue-top', `${rect.top}px`);
        };
        if (root.ResizeObserver) new root.ResizeObserver(measureDialogue).observe(byId('adv-dialogue'));
        root.addEventListener?.('resize', measureToolbar);
        root.addEventListener?.('resize', measureDialogue);
        // A touch pointerup can close the intro before its compatibility click.
        // Reset only on a new gesture, so that click cannot advance the dialogue.
        layer.addEventListener('pointerdown', () => { introTouchClick = false; }, true);
        const introElement = byId('adv-character-intro');
        introElement.addEventListener('dragstart', event => event.preventDefault());
        introElement.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            if (introTouchClick) { introTouchClick = false; return; }
            if (!introElement.hidden && !frozen()) closeIntro();
        });
        introElement.addEventListener('pointerup', event => {
            if (event.pointerType !== 'touch' || event.isPrimary === false) return;
            event.preventDefault(); event.stopPropagation(); introTouchClick = true;
            if (!introElement.hidden && !frozen()) closeIntro();
        });
        layer.addEventListener('click', event => {
            if (introTouchClick) {
                introTouchClick = false; event.preventDefault(); event.stopPropagation(); return;
            }
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
        root.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', event => {
            if (event.matches) playbackTimers.forEach(job => { if (['pose', 'bust', 'icon', 'entrance'].includes(job.kind)) cancelTimer(job); });
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
        discardIntro();
        clearLinePresentation(); root.stopStoryCues?.();
        saved.auto = false; writeSave(); updateAutoButton(); updateFastButton();
        // Shorten an effect already in progress, while preserving its continuation.
        playbackTimers.forEach(job => {
            if (['pose', 'bust', 'icon', 'entrance'].includes(job.kind)) { cancelTimer(job); return; }
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
        discardIntro();
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
        if (S.intro) {
            if (saved.auto && !frozen() && document.visibilityState !== 'hidden' && !S.intro.closing)
                autoTimer = playbackTimer(() => closeIntro(), 2500, 'intro-auto');
            return;
        }
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
    function resetPoseScene(id) {
        if (S.poseSceneId === id) return;
        S.poseSceneId = id; S.poses.clear(); S.entrances = [];
        if (iconStyle()) S.actors.clear();
        if (bustStyle()) {
            S.actors.clear();
            const lines = S.episode.scenes.find(scene => scene.id === id)?.lines || [];
            const partner = lines[0] && bustScenePartner(S.episode, lines, lines[0]);
            if (partner) S.actors.set(partner, { id: partner, position: S.episode.defaultPositions?.[partner], expression: 'normal', pose: 'default' });
        }
        S.actors.forEach(actor => { actor.pose = 'default'; });
    }
    function actorPose(id, pose) {
        if (pose !== undefined) S.poses.set(id, assets.resolvePose(id, pose));
        return S.poses.get(id) || 'default';
    }
    function stageLine(item, sceneId = S.sceneId, lineIndex = S.lineIndex) {
        resetPoseScene(sceneId);
        S.entrances = [];
        if (item.pose !== undefined) actorPose(item.speaker, item.pose);
        if (item.offscreen || item.monologue) { S.actors.clear(); return; }
        if (item.hide === 'all') S.actors.clear();
        else if (Array.isArray(item.hide)) item.hide.forEach(id => S.actors.delete(id));
        const speaking = !['narration', 'announce'].includes(item.speaker);
        if (speaking && !Array.isArray(item.show) && !bustStyle()) {
            for (const id of S.actors.keys()) if (id !== item.speaker) S.actors.delete(id);
        }
        if (Array.isArray(item.show)) item.show.forEach(actor => {
            if (actor.onlyIfShown) {
                const current = S.actors.get(actor.id);
                if (current) S.actors.set(actor.id, { ...current, expression: actor.expression || current.expression,
                    pose: actorPose(actor.id, actor.pose), costume: actor.costume || current.costume });
            } else S.actors.set(actor.id, { ...actor, pose: actorPose(actor.id, actor.pose) });
        });
        if (speaking) S.actors.set(item.speaker, { id: item.speaker, position: item.position,
            expression: item.expression || 'normal', pose: actorPose(item.speaker, item.pose), costume: item.costume });
        if (item.speaker === 'announce') S.actors.clear();
        S.actors.forEach(actor => {
            const data = root.BattleStoryCharacterIntros?.[actor.id];
            if (!data || !assets.characters[actor.id]?.introStanding) return;
            // Use this line's override only; never inherit intro from an earlier show.
            const shown = item.show?.find(value => value.id === actor.id);
            const override = shown?.intro !== undefined ? shown.intro : actor.id === item.speaker || shown ? item.intro : undefined;
            const introScene = S.episode.scenes.find(value => value.id === sceneId)?.introScene || sceneId;
            const at = data.introAt;
            const scheduled = at?.episode === (S.episode.number ?? S.episode.id) && at.scene === introScene && at.line === lineIndex + 1;
            const forced = override === true || (override && typeof override === 'object');
            const key = `${S.episode.id}/${introScene}/${lineIndex + 1}/${actor.id}`;
            if (S.entranceSeen.has(key) || (!scheduled && !forced)) return;
            S.entranceSeen.add(key); // Re-render/resume/skip reconstruct this same position.
            if (item.intro !== false && override !== false) S.entrances.push({ ...actor, intro: override });
        });
    }
    const introAccent = { chizuru: '#ec8e45', mai: '#dc5e74', takumi: '#63bf9a', akatsuki: '#76a3dd', kanna: '#b49ad9', tsuyoshi: '#e3ac5d', yuzuki: '#f39b80', ryuta: '#e5be59' };
    const introVisible = () => byId('adv-character-intro')?.hidden === false;
    function discardIntro() {
        const intro = S.intro, element = byId('adv-character-intro');
        if (element) { element.hidden = true; element.classList.remove('adv-intro-closing'); }
        layer?.classList.remove('adv-introducing');
        S.intro = null;
        if (!intro) return;
        cancelTimer(autoTimer); cancelTimer(intro.exitTimer);
        intro.resolve();
    }
    function closeIntro() {
        if (frozen()) return;
        if (!S.intro) return discardIntro();
        if (S.intro.closing) return;
        const intro = S.intro; intro.closing = true; cancelTimer(autoTimer);
        intro.element.classList.add('adv-intro-closing');
        intro.exitTimer = playbackTimer(() => {
            if (S.intro !== intro) return;
            discardIntro(); byId('adv-dialogue').focus();
        }, reducedMotion() ? 100 : 180, 'intro-exit');
    }
    function showIntro(actor) {
        discardIntro();
        const element = byId('adv-character-intro'); element.replaceChildren();
        element.dataset.actor = actor.id; element.style.setProperty('--intro-accent', introAccent[actor.id]);
        element.classList.remove('adv-intro-closing');
        const data = { ...root.BattleStoryCharacterIntros[actor.id], ...(actor.intro && typeof actor.intro === 'object' ? actor.intro : {}) };
        const img = document.createElement('img'); img.className = 'adv-intro-art'; img.alt = ''; img.draggable = false;
        const character = assets.characters[actor.id];
        img.src = assets.url(character.costumes?.[actor.costume || S.episode.costumes?.[actor.id]]?.introStanding || character.introStanding); element.appendChild(img);
        const copy = document.createElement('div'); copy.className = 'adv-intro-copy';
        for (const field of ['title', 'name', 'subtitle', 'text']) {
            const text = typeof data[field] === 'string' ? data[field].trim() : '';
            if (!text) continue;
            const node = document.createElement(field === 'name' ? 'h2' : 'p');
            node.className = 'adv-intro-' + field; node.textContent = text; copy.appendChild(node);
        }
        element.appendChild(copy);
        const hint = document.createElement('p'); hint.className = 'adv-intro-hint'; hint.textContent = 'タップで続ける'; element.appendChild(hint);
        const notice = document.createElement('p'); notice.className = 'adv-intro-notice';
        notice.textContent = root.CharacterNotice.shortText; element.appendChild(notice);
        return new Promise(resolve => {
            S.intro = { element, resolve, closing: false };
            element.hidden = false; layer.classList.add('adv-introducing'); element.focus(); scheduleAuto();
        });
    }
    async function showIntroductions(token) {
        for (const actor of S.entrances.slice()) {
            if (token !== S.token || !S.active || fast() || S.skipOpen) return;
            await showIntro(actor);
        }
    }
    function renderActors(speaker, animateBust = true) {
        if (iconStyle()) {
            byId('adv-portraits').replaceChildren();
            renderIcon(speaker, animateBust);
            return;
        }
        const dialogueRect = byId('adv-dialogue').getBoundingClientRect();
        layer.style.setProperty('--adv-dialogue-top', `${dialogueRect.top}px`);
        if (bustStyle()) {
            layer.dataset.bustSpeaker = S.actors.has(speaker) ? speaker : 'none';
            layer.style.setProperty('--adv-dialogue-height', `${dialogueRect.height}px`);
        }
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
                element.className = 'adv-portrait'; container.appendChild(element);
                if (!bustStyle()) {
                    element.classList.add('entering');
                    const entered = () => element.classList.remove('entering');
                    playbackTimer(entered, effectDelay(240), 'portrait', entered);
                }
            }
            const wasSpeaking = element.classList.contains('speaking');
            element.dataset.position = actor.position || 'center';
            element.classList.toggle('speaking', actor.id === speaker);
            element.classList.toggle('dimmed', (bustStyle() || S.actors.size > 1) && actor.id !== speaker);
            if (bustStyle()) {
                // Keep the last scene partner; the speaking face always occupies the left slot.
                const hasSpeaker = S.actors.has(speaker);
                element.dataset.bustSide = hasSpeaker ? (actor.id === speaker ? 'left' : 'right') :
                    (element.dataset.bustSide || (actor.position === 'right' ? 'right' : 'left'));
                if ((actor.id === speaker) !== wasSpeaking && animateBust && !fast() && !reducedMotion()) {
                    element.classList.add('entering');
                    const entered = () => element.classList.remove('entering');
                    playbackTimer(entered, 150, 'bust', entered);
                }
            }
            const candidates = assets.portraitCandidates(actor.id, actor.expression, actor.pose);
            const request = candidates.join('|');
            if (element.dataset.request === request) return;
            cancelTimer(portraitFades.get(element));
            element.dataset.request = request;
            if (!candidates.length) { element.replaceChildren(); return; } // name only
            const img = document.createElement('img'); img.alt = ''; img.className = 'adv-current-image';
            let index = -1, painted = '';
            const current = () => S.active && element.dataset.request === request &&
                [...container.children].includes(element) && !element.classList.contains('leaving');
            const paint = file => {
                if (!current() || file !== candidates[index] || painted === file) return;
                painted = file; cancelTimer(portraitFades.get(element));
                const previous = element.querySelector('.adv-current-image');
                const pose = assets.portraitPose(actor.id, file);
                const crossFade = previous && previous !== img && element.dataset.pose !== pose && !fast() && !reducedMotion();
                element.dataset.pose = pose; assets.applyPortraitMetrics(element, actor.id, pose);
                img.classList.remove('adv-pose-pending');
                element.replaceChildren(img);
                if (crossFade) {
                    previous.className = 'adv-pose-out'; img.classList.add('adv-pose-in'); element.appendChild(previous);
                    const finish = () => { previous.remove(); img.classList.remove('adv-pose-in'); portraitFades.delete(element); };
                    portraitFades.set(element, playbackTimer(finish, 150, 'pose', finish));
                }
            };
            const nextCandidate = () => {
                do { index++; } while (index < candidates.length && imageCache.get(candidates[index])?.status === 'failed');
                if (!current()) return;
                if (index >= candidates.length) { cancelTimer(portraitFades.get(element)); element.replaceChildren(); return; }
                const file = candidates[index], entry = loadImage(file);
                img.onload = () => paint(file);
                img.src = assets.url(file);
                if (entry.status === 'ready') paint(file);
                else if (entry.status === 'failed') nextCandidate();
                else {
                    // Keep the decoded previous portrait until the new one is ready.
                    if (!element.querySelector('.adv-current-image')) {
                        img.classList.add('adv-pose-pending'); element.replaceChildren(img);
                    }
                    entry.ready.then(() => {
                        if (!current() || file !== candidates[index]) return;
                        if (entry.status === 'ready') paint(file); else nextCandidate();
                    });
                }
            };
            img.onerror = () => {
                if (!current()) return;
                nextCandidate();
            };
            nextCandidate();
        });
    }
    function applyIconMetrics(element, id, pose) {
        const { canvas, renderCanvas, head } = assets.portraitMetrics(id, pose);
        // A face-centred square, with equal hair/chin padding and room for wide hair.
        const side = Math.max(head.height * 1.3,
            2 * Math.max(head.centerX - head.left, head.right + 1 - head.centerX) + head.height * .16);
        const scale = canvas.height / side, aspect = renderCanvas.width / renderCanvas.height;
        element.style.setProperty('--adv-icon-crop-scale', String(scale));
        element.style.setProperty('--adv-icon-crop-top', String((head.top - (side - head.height) / 2) / side));
        element.style.setProperty('--adv-icon-crop-left', String((head.centerX - side / 2) / canvas.width * aspect * scale));
    }
    function renderIcon(speaker, animate = true) {
        const element = byId('adv-face-icon'), crop = byId('adv-icon-crop');
        const actor = assets.characters[speaker] && S.actors.get(speaker);
        const previousSpeaker = element.dataset.actor;
        cancelTimer(portraitFades.get(element));
        element.hidden = !actor;
        layer.dataset.iconSpeaker = actor ? speaker : 'none';
        if (!actor) { element.dataset.actor = ''; element.dataset.request = ''; crop.replaceChildren(); return; }
        element.dataset.actor = speaker;
        const candidates = assets.iconCandidates(actor.id, actor.expression, actor.costume || S.episode.costumes?.[actor.id]), request = candidates.join('|');
        if (element.dataset.request === request) return;
        element.dataset.request = request;
        let index = -1, painted = '';
        const img = document.createElement('img'); img.alt = ''; img.className = 'adv-current-image';
        const current = () => S.active && iconStyle() && !element.hidden && element.dataset.request === request;
        const paint = file => {
            if (!current() || file !== candidates[index] || painted === file) return;
            painted = file;
            const sheet = Boolean(assets.characters[actor.id].icons);
            element.dataset.pose = 'default'; crop.classList.toggle('adv-icon-sheet', sheet);
            if (!sheet) applyIconMetrics(crop, actor.id, 'default');
            else {
                const cell = file.match(/-([a-z]+)-alpha\.webp$/)?.[1] || 'normal';
                root.BattleStoryIconMetrics?.apply(img, actor.id, cell, actor.costume || S.episode.costumes?.[actor.id]);
            }
            crop.replaceChildren(img);
            // Expressions and poses swap immediately; only a different speaker fades in.
            if (previousSpeaker && previousSpeaker !== speaker && animate && !fast() && !reducedMotion()) {
                crop.classList.add('adv-icon-entering');
                const finish = () => { crop.classList.remove('adv-icon-entering'); portraitFades.delete(element); };
                portraitFades.set(element, playbackTimer(finish, 100, 'icon', finish));
            }
        };
        const nextCandidate = () => {
            do { index++; } while (index < candidates.length && imageCache.get(candidates[index])?.status === 'failed');
            if (!current()) return;
            if (index >= candidates.length) { crop.replaceChildren(); return; }
            const file = candidates[index], entry = loadImage(file);
            img.onload = () => paint(file); img.src = assets.url(file);
            if (entry.status === 'ready') paint(file);
            else if (entry.status === 'failed') nextCandidate();
            else entry.ready.then(() => {
                if (!current() || file !== candidates[index]) return;
                if (entry.status === 'ready') paint(file); else nextCandidate();
            });
        };
        img.onerror = () => { if (current()) nextCandidate(); };
        if (previousSpeaker !== speaker) crop.replaceChildren();
        nextCandidate();
    }
    function nameFor(item) {
        return item.name || assets.characters[item.speaker]?.name || (item.speaker === 'announce' ? '校内放送' : item.speaker === 'narration' ? '' : String(item.speaker || ''));
    }
    function clearLinePresentation() {
        if (!layer) return;
        const screen = byId('adv-line-effects');
        if (screen) screen.className = 'adv-line-effects';
        layer.classList.remove('adv-screen-shake');
        for (const portrait of [...byId('adv-portraits').children, byId('adv-face-icon')]) {
            for (const motion of root.BattleStoryData.presentation.motions) portrait.classList.remove(`adv-motion-${motion}`);
            portrait.querySelector('.adv-emotion-mark')?.remove();
        }
    }
    // Decorative line beats run alongside typing: never make input wait for a motion.
    function presentLine(item) {
        if (fast()) return;
        const portrait = iconStyle() ? (byId('adv-face-icon').hidden ? null : byId('adv-face-icon')) :
            [...byId('adv-portraits').children].find(el => el.dataset.actor === item.speaker && !el.classList.contains('leaving'));
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
    function renderStoryCard(item) {
        const element = byId('adv-effect');
        layer.classList.toggle('adv-story-card', item?.card === true);
        if (!item?.card) {
            if (element.classList.contains('story-card')) { element.className = 'adv-effect'; element.replaceChildren(); }
            return;
        }
        element.className = 'adv-effect story-card'; element.replaceChildren();
        const title = document.createElement('strong'); title.textContent = item.text; element.appendChild(title);
        if (item.caption) { const caption = document.createElement('p'); caption.textContent = item.caption; element.appendChild(caption); }
        const hint = document.createElement('small'); hint.textContent = 'タップ／Enterで続ける'; element.appendChild(hint);
    }
    async function renderCurrent() {
        cancelTimers(); const token = ++S.token;
        const item = line();
        if (S.stage === 'battle' && !item?.finalBattle) return chooseBattle();
        if (!item) return endScene();
        savePosition(); S.busy = true; S.typing = false; byId('adv-next').hidden = true;
        layer.classList.toggle('adv-battle-intro', scene()?.battleIntro === true);
        layer.classList.toggle('adv-monologue', scene()?.lines.slice(0, S.lineIndex + 1).findLast(item => item.text)?.monologue === true);
        stageLine(item); renderActors(item.speaker); renderStoryCard(item);
        setBackground(item.background !== undefined ? item.background : currentBackground());
        if (S.entrances.length && !fast() && !S.skipOpen) await showIntroductions(token);
        if (token !== S.token || !S.active) return;
        presentLine(item);
        if (root.BattleStoryData.presentation.cues.includes(item.se)) root.playStoryCue?.(item.se, fast() ? .12 : 1);
        else if (item.se) root.playSfx?.(item.se);
        if (item.effect) await effect(item.effect, token, item);
        else if (!item.wait && ['chime', 'crowd', 'notify'].includes(item.se)) await wait(item.se === 'chime' ? 850 : item.se === 'notify' ? 350 : 650);
        if (token !== S.token || !S.active) return;
        if (item.explanationChoice) { S.busy = false; return showExplanationChoices(item.explanationChoice); }
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
        if (S.intro || introVisible()) { if (!frozen()) closeIntro(); return; }
        if (!S.active || S.busy || frozen() || !byId('adv-ending').hidden) return;
        if (S.typing) return completeText();
        cancelTimer(autoTimer);
        if (S.stage === 'pre' && line()?.id && line().id === S.episode.battle?.after) return chooseBattle();
        S.lineIndex++; renderCurrent();
    }
    function playSceneBgm() {
        const bgm = scene()?.bgm ?? S.episode?.bgm ?? 'story';
        if (bgm !== false) root.playStoryBGM?.(S.episode.protagonist, bgm);
    }
    function enterScene(id, stage) {
        S.sceneId = id; S.lineIndex = 0; S.stage = stage;
        resetPoseScene(id);
        playSceneBgm();
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
        if (viewer()) return showViewerBattleChoices();
        S.stage = 'battle'; savePosition();
        stop();
        root.openStorySkillChoice?.(S.episode,
            skill => {
                S.battleActive = true; S.stage = 'battle'; savePosition();
                root.startStoryCpuBattle(S.episode, skill);
            }, () => root.openStoryStage?.());
    }
    function showViewerBattleChoices() {
        const fromLoss = S.stage === 'lose';
        S.stage = 'battle'; S.busy = false; S.typing = false;
        stopFastForward(); cancelTimer(autoTimer);
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = true; });
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        const readOutcome = outcome => {
            // Skipping the battle continues in story order, through its next (win) scene.
            const id = S.episode.afterBattle[outcome === 'lose' ? 'lose' : 'win'];
            S.continuedAsWin = fromLoss && outcome !== 'lose';
            ending.hidden = true; S.paused = false; S.logOpen = false;
            byId('adv-log').hidden = true;
            ['adv-fast', 'adv-skip', 'adv-pause'].forEach(control => { byId(control).disabled = false; });
            enterScene(id, outcome === 'lose' ? 'lose' : 'post');
            byId('adv-dialogue').focus();
        };
        endingButton('勝った場合の続きを読む', () => readOutcome('win'));
        endingButton('負けた場合の会話を読む', () => readOutcome('lose'));
        endingButton('スキップして次の場面へ', () => readOutcome('skip'));
        ending.children[0]?.focus();
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
        resetPoseScene(S.sceneId);
        activate();
        playSceneBgm();
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
        layer.dataset.portraitStyle = iconStyle() ? 'icon' : bustStyle() ? 'bust' : 'full';
        layer.dataset.iconSpeaker = 'none';
        byId('adv-face-icon').hidden = true; byId('adv-face-icon').dataset.actor = ''; byId('adv-face-icon').dataset.request = '';
        byId('adv-icon-crop').replaceChildren();
        byId('adv-pause-panel').hidden = true; byId('adv-skip-panel').hidden = true;
        layer.classList.remove('adv-cleared', 'adv-frozen', 'adv-shake', 'adv-panel-open', 'adv-monologue', 'adv-arc-cleared', 'adv-story-card');
        byId('adv-portraits').replaceChildren(); byId('adv-background').style.backgroundImage = '';
        byId('adv-text').textContent = ''; byId('adv-name').textContent = ''; byId('adv-next').hidden = true;
        byId('adv-effect').className = 'adv-effect'; byId('adv-effect').replaceChildren();
        byId('adv-episode-label').textContent = (S.episode.number == null ? '' : root.BattleStoryData.arcs[S.episode.arc] + '　') + root.BattleStoryData.episodeTitle(S.episode);
        byId('adv-viewer-badge').hidden = !viewer();
        byId('adv-pause-exit').textContent = viewer() ? 'ビューア一覧へ戻る' : 'ストーリー選択へ戻る';
        updateAutoButton(); updateFastButton();
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = false; });
        const toolbarHeight = layer.querySelector('.adv-toolbar').getBoundingClientRect().height;
        layer.style.setProperty('--adv-toolbar-height', `${toolbarHeight}px`);
        layer.style.setProperty('--adv-dialogue-top', `${byId('adv-dialogue').getBoundingClientRect().top}px`);
    }
    function playbackRoute() {
        if (S.conversation) return [scene()];
        const post = outcomeScenes(S.episode.afterBattle.win);
        const lose = outcomeScenes(S.episode.afterBattle.lose);
        const initial = S.episode.scenes.filter(item => ![...post, ...lose].includes(item) && !S.skippedScenes.has(item.id));
        return ['post', 'clear'].includes(S.stage) ? [...initial, ...(S.continuedAsWin ? lose : []), ...post] :
            S.stage === 'lose' ? [...initial, ...lose] : initial;
    }
    function rebuildBeforePosition() {
        S.actors.clear(); S.poses.clear(); S.poseSceneId = null; S.entranceSeen = new Set(S.conversation?.introSeen || []); S.entrances = [];
        S.backlog = S.conversation ? S.conversation.backlog.slice() : [];
        for (const current of playbackRoute()) {
            resetPoseScene(current.id);
            let count = current.id === S.sceneId ? S.lineIndex : current.lines.length;
            if (current.id === S.sceneId && S.stage === 'battle' && !line()?.battle && line()?.id === S.episode.battle?.after) count++;
            for (const [index, item] of current.lines.slice(0, count).entries()) {
                stageLine(item, current.id, index);
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
        renderActors(undefined, false); setBackground(currentBackground());
        if (S.conversation) return showConversationChoices();
        if (S.stage === 'pre') {
            const marker = line();
            if (marker) {
                stageLine(marker);
                if (marker.text && !marker.battle) S.backlog.push({ name: nameFor(marker), text: marker.text });
                renderActors(marker.speaker, false);
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
    function start(id, resume = false, replacementConfirmed = false) {
        const episode = viewer() ? root.StoryViewer.get(id) : root.BattleStoryData.get(id); if (!episode) return;
        if (!viewer() && episode.arc === 'special' && !root.BattleStoryData.isUnlocked(episode, root.BattleStoryProgress?.load())) return;
        if (root.CharacterNotice && !root.CharacterNotice.beforeStory(() => start(id, resume))) return;
        if (!viewer() && saved.resume && (!resume || saved.resume.episodeId !== id) && !replacementConfirmed) {
            return Promise.resolve(root.StageLayout?.confirmDestructive?.({
                title: 'ストーリーの再開位置を上書きしますか？',
                erasedLabel: '失われるもの',
                erased: ['保存したADVの途中位置（前の位置から再開できなくなります）'],
                kept: ['ストーリーのクリア進捗・プロフィール・コイン・実績・ミッション・スリーブ・盤面背景'],
                confirmText: '選んだ話を始める'
            })).then(confirmed => { if (confirmed) return start(id, resume, true); });
        }
        stop(); S.episode = episode; S.pending = null;
        const position = !viewer() && resume && saved.resume?.episodeId === id ? saved.resume : null;
        const optionalScenes = new Set(episode.scenes.flatMap(scene => scene.lines.map(line => line.explanationChoice?.read).filter(Boolean)));
        S.skippedScenes = new Set((Array.isArray(position?.skippedScenes) ? position.skippedScenes : []).filter(id => optionalScenes.has(id)));
        S.continuedAsWin = position?.continuedAsWin === true;
        S.sceneId = position?.sceneId || episode.scenes[0].id;
        S.stage = episode.conversationOnly ? 'post' : ['pre', 'battle', 'post', 'lose'].includes(position?.stage) ? position.stage : 'pre';
        if (!scene()) { S.sceneId = episode.scenes[0].id; S.stage = episode.conversationOnly ? 'post' : 'pre'; }
        S.lineIndex = Math.max(0, Math.min(Math.floor(Number(position?.lineIndex) || 0), scene().lines.length));
        if (S.stage === 'battle') Object.assign(S, battlePosition(episode));
        // A saved post/lose position is the receipt of a completed battle.
        if (episode.battle && S.stage === 'post' && !outcomeScenes(episode.afterBattle.win).some(item => item.id === S.sceneId)) { S.sceneId = episode.afterBattle.win; S.lineIndex = 0; }
        if (S.stage === 'lose' && S.sceneId !== episode.afterBattle.lose) { S.sceneId = episode.afterBattle.lose; S.lineIndex = 0; }
        rebuildBeforePosition(); activate();
        const previous = S.backlog[S.backlog.length - 1];
        S.text = previous?.text || '';
        byId('adv-text').textContent = S.text;
        byId('adv-name').textContent = previous?.name || '';
        playSceneBgm(); return beginPlayback();
    }
    function endingButton(text, action) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = action;
        byId('adv-ending').appendChild(button);
    }
    // Conversations only: the existing tutorial owns every battle and progress decision.
    function playConversation(episode, lines, options) {
        const introSeen = S.episode?.id === episode.id && options.phase !== 'pre' ? [...S.entranceSeen] : [];
        const backlog = options.phase === 'post' && S.episode?.tutorial && S.episode.id === episode.id
            ? S.backlog.slice() : [];
        stop();
        S.episode = root.BattleStoryData.validate({
            id: episode.id, number: Number(episode.id.replace('episode', '')), arc: episode.arc,
            title: episode.title.replace(/^第\d+話\s*/, ''), tutorial: true, protagonist: episode.protagonist,
            portraitStyle: episode.portraitStyle,
            defaultPositions: Object.fromEntries(Object.keys(assets.characters).map(id =>
                [id, id === episode.protagonist ? 'right' : 'left'])),
            scenes: [{ id: options.phase, introScene: options.introScene || (options.phase === 'post' ? 'win' : options.phase), background: episode.background, lines }]
        });
        S.conversation = { getActions: options.getActions, backlog, introSeen };
        S.sceneId = options.phase; S.stage = options.phase; S.lineIndex = 0;
        S.battleActive = false; S.pending = null; S.continuedAsWin = false;
        rebuildBeforePosition(); activate();
        playSceneBgm();
        return beginPlayback();
    }
    function showExplanationChoices(choice) {
        stopFastForward(); cancelTimer(autoTimer);
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = true; });
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        for (const [text, id] of [['ルール説明を読む', choice.read], ['ルール説明をとばす', choice.skip]]) {
            endingButton(text, () => {
                if (id === choice.skip) S.skippedScenes.add(choice.read);
                else S.skippedScenes.delete(choice.read);
                ending.hidden = true;
                ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = false; });
                enterScene(id, S.stage);
            });
        }
        ending.children[0]?.focus();
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
        if (viewer()) return showViewerBattleChoices();
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
            playSceneBgm();
            renderCurrent(); byId('adv-dialogue').focus();
        });
        endingButton('ストーリー選択へ戻る', returnToSelection);
        ending.children[0]?.focus();
    }
    function clearEpisode() {
        if (S.stage !== 'post') return;
        stopFastForward(); cancelTimer(autoTimer);
        if (!viewer()) {
            saved.resume = null; writeSave();
            root.BattleStoryProgress?.complete(S.episode.id);
        }
        S.stage = 'clear';
        S.busy = false;
        ['adv-fast', 'adv-skip', 'adv-pause'].forEach(id => { byId(id).disabled = true; });
        layer.classList.add('adv-cleared');
        layer.classList.remove('adv-monologue', 'adv-battle-intro', 'adv-story-card');
        byId('adv-effect').className = 'adv-effect';
        byId('adv-effect').replaceChildren();
        setBackground(currentBackground());
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        const heading = document.createElement('h2'); heading.textContent = S.episode.clear.heading || root.BattleStoryData.episodeLabel(S.episode) + ' CLEAR';
        const title = document.createElement('p'); title.className = 'adv-clear-title'; title.textContent = S.episode.clear.title;
        ending.appendChild(heading); if (S.episode.clear.title) ending.appendChild(title);
        const rewards = S.episode.clear.rewards;
        if (rewards?.unlockCharacter) {
            const name = assets.characters[rewards.unlockCharacter]?.name;
            const message = document.createElement('p'); message.className = 'adv-clear-title';
            message.textContent = `NEW CHARACTER ${name} — プレイアブルキャラクターとして${name}が使用可能になりました`;
            ending.appendChild(message);
        }
        if (rewards?.storyCharacter) {
            const name = assets.characters[rewards.storyCharacter]?.name;
            const message = document.createElement('p'); message.className = 'adv-clear-title';
            message.textContent = `STORY CHARACTER — ${name}がキャラクター一覧に追加されました`;
            ending.appendChild(message);
        }
        if (rewards?.costumes?.length) {
            const message = document.createElement('p'); message.className = 'adv-clear-title';
            message.textContent = 'COSTUME COLLECTION ' + (rewards.costumeLabel || rewards.costumes.map(key => {
                const [id, costume] = key.split(':');
                return `${assets.characters[id]?.name}『${assets.characters[id]?.costumes?.[costume]?.name}』`;
            }).join('／'));
            ending.appendChild(message);
        }
        if (S.episode.clear.storyClear) {
            const message = document.createElement('p'); message.className = 'adv-clear-title';
            message.textContent = S.episode.clear.storyClear; ending.appendChild(message);
        }
        if (S.episode.clear.next) {
            const next = document.createElement('p'); next.className = 'adv-teaser';
            next.textContent = `NEXT 第${S.episode.clear.next.number}話「${S.episode.clear.next.title}」`;
            ending.appendChild(next);
        }
        if (S.episode.clear.arc) endingButton('出会い・文化祭編 CLEARへ', showArcClear);
        else endingButton(viewer() ? 'ビューア一覧へ戻る' : 'ストーリー選択へ戻る', returnToSelection);
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
            const file = iconStyle() ? character.standing : assets.portraitPath(id, 'normal');
            if (file) {
                const frame = document.createElement('div'); frame.className = 'adv-arc-portrait-frame'; frame.dataset.actor = id;
                frame.dataset.pose = 'default';
                if (iconStyle()) frame.classList.add('adv-arc-standing');
                else assets.applyPortraitMetrics(frame, id, 'default');
                const img = document.createElement('img'); img.src = assets.url(file); img.alt = ''; frame.appendChild(img); figure.appendChild(frame);
            }
            const name = document.createElement('figcaption'); name.textContent = character.name;
            figure.appendChild(name); portraits.appendChild(figure);
        });
        const text = document.createElement('p'); text.className = 'adv-arc-message'; text.textContent = arc.text;
        ending.append(heading, portraits, text);
        const notice = document.createElement('p'); notice.className = 'character-notice adv-arc-notice';
        notice.textContent = root.CharacterNotice.shortText;
        ending.appendChild(notice);
        endingButton(viewer() ? 'ビューア一覧へ戻る' : 'ストーリー選択へ戻る', returnToSelection);
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
            const unlocked = root.BattleStoryData.isUnlocked(episode, progress);
            for (const [className, text] of [
                ['story-episode-title', root.BattleStoryData.episodeTitle(episode)],
                ['story-episode-summary', episode.summary || ''],
                ['story-episode-meta', progress[episode.id] ? 'クリア済み' : unlocked ? 'プレイ可能' : episode.arc === 'special' ? episode.unlockNotice || '文化祭編クリアで解放' : '未解放']
            ]) {
                const element = document.createElement('div'); element.className = className; element.textContent = text; card.appendChild(element);
            }
            if (episode.arcLabel) { const label = document.createElement('small'); label.className = 'story-special-label'; label.textContent = episode.arcLabel; card.appendChild(label); }
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
