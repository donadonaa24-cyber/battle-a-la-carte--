(function (root) {
    'use strict';
    const KEY = 'battleAlaCarteStoryAdvV1';
    const assets = root.BattleStoryAssets;
    const S = { episode: null, sceneId: '', lineIndex: 0, stage: 'pre', active: false,
        battleActive: false, pending: null, actors: new Map(), backlog: [], token: 0,
        busy: false, typing: false, text: '', chars: [], typed: 0, logOpen: false };
    let layer, typeTimer, autoTimer, effectTimer;
    const waits = new Map();
    const byId = id => document.getElementById(id);
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
        if (!S.episode) return;
        saved.resume = { episodeId: S.episode.id, sceneId: S.sceneId, lineIndex: S.lineIndex,
            stage: S.stage, savedAt: Date.now() };
        writeSave();
    }
    function scene() { return S.episode?.scenes.find(item => item.id === S.sceneId); }
    function line() { return scene()?.lines[S.lineIndex]; }
    function wait(ms) { return new Promise(resolve => {
        const timer = setTimeout(() => { waits.delete(timer); resolve(); }, ms);
        waits.set(timer, resolve);
    }); }
    function cancelTimers() {
        clearTimeout(typeTimer); clearTimeout(autoTimer); clearTimeout(effectTimer);
        waits.forEach((resolve, timer) => { clearTimeout(timer); resolve(); });
        waits.clear();
        root.stopStoryCues?.();
    }
    function stop() {
        S.token++;
        cancelTimers();
        if (S.pending) { abandonBattle(); return; }
        S.active = false; S.typing = false; S.busy = false; S.logOpen = false;
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
                <button type="button" id="adv-auto" aria-pressed="false">オート OFF</button>
                <button type="button" id="adv-log-button">ログ</button>
                <button type="button" id="adv-menu">メニュー</button>
            </div></header>
            <div class="adv-portraits" id="adv-portraits" aria-hidden="true"></div>
            <div class="adv-dialogue" id="adv-dialogue" tabindex="0" role="button" aria-label="会話を進める">
                <div class="adv-name" id="adv-name"></div>
                <div class="adv-text" id="adv-text" aria-live="polite"></div>
                <span class="adv-next" id="adv-next" hidden>▼</span>
            </div>
            <div class="adv-effect" id="adv-effect" aria-hidden="true"></div>
            <section class="adv-log" id="adv-log" hidden aria-label="会話ログ">
                <h2>会話ログ</h2><div id="adv-log-lines"></div><button type="button" id="adv-log-close">閉じる</button>
            </section>
            <section class="adv-ending" id="adv-ending" hidden></section>`;
        document.body.appendChild(layer);
        // Keep the portrait's head below the toolbar, including wrapped phone controls.
        const toolbar = layer.querySelector('.adv-toolbar');
        const measureToolbar = () => layer.style.setProperty('--adv-toolbar-height', `${toolbar.getBoundingClientRect().height}px`);
        if (root.ResizeObserver) new root.ResizeObserver(measureToolbar).observe(toolbar);
        root.addEventListener?.('resize', measureToolbar);
        layer.addEventListener('click', event => {
            if (event.target.closest('button, .adv-log, .adv-ending, .adv-toolbar')) return;
            advance();
        });
        document.addEventListener('keydown', event => {
            if (!S.active || S.logOpen || !['Enter', ' '].includes(event.key) || event.repeat ||
                event.target.closest?.('button, input, select, textarea')) return;
            event.preventDefault(); advance();
        });
        byId('adv-auto').onclick = toggleAuto;
        byId('adv-menu').onclick = returnToSelection;
        byId('adv-log-button').onclick = () => openLog(true);
        byId('adv-log-close').onclick = () => openLog(false);
        document.addEventListener('visibilitychange', () => {
            clearTimeout(autoTimer);
            if (document.visibilityState !== 'hidden') scheduleAuto();
        });
    }
    function openLog(open) {
        S.logOpen = open;
        clearTimeout(autoTimer);
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
        } else { scheduleAuto(); byId('adv-dialogue').focus(); }
    }
    function toggleAuto() {
        saved.auto = !saved.auto; writeSave();
        updateAutoButton(); clearTimeout(autoTimer); scheduleAuto();
    }
    function updateAutoButton() {
        if (!layer) return;
        byId('adv-auto').textContent = `オート ${saved.auto ? 'ON' : 'OFF'}`;
        byId('adv-auto').setAttribute('aria-pressed', String(saved.auto));
    }
    function scheduleAuto() {
        clearTimeout(autoTimer);
        if (!saved.auto || !S.active || S.typing || S.busy || S.logOpen ||
            document.visibilityState === 'hidden' || !byId('adv-ending').hidden) return;
        autoTimer = setTimeout(advance, autoDelay(S.text));
    }
    function setBackground(key) {
        const element = byId('adv-background');
        element.style.backgroundImage = '';
        const file = assets.backgrounds[key];
        if (!file) return;
        const img = new Image(), token = S.token;
        img.onload = () => { if (token === S.token && S.active) element.style.backgroundImage = `url("${assets.url(file)}")`; };
        img.onerror = () => {}; // keep the CSS gradient
        img.src = assets.url(file);
    }
    function stageLine(item) {
        if (item.hide === 'all') S.actors.clear();
        else if (Array.isArray(item.hide)) item.hide.forEach(id => S.actors.delete(id));
        const speaking = !['narration', 'announce'].includes(item.speaker);
        if (speaking && !Array.isArray(item.show)) {
            for (const id of S.actors.keys()) if (id !== item.speaker) S.actors.delete(id);
        }
        if (Array.isArray(item.show)) item.show.forEach(actor => S.actors.set(actor.id, { ...actor }));
        if (speaking) S.actors.set(item.speaker, { id: item.speaker, position: item.position,
            expression: item.expression || 'normal' });
        if (item.speaker === 'announce') S.actors.clear();
    }
    function renderActors(speaker) {
        const container = byId('adv-portraits');
        for (const element of container.children) {
            if (S.actors.has(element.dataset.actor)) continue;
            element.classList.add('leaving');
            setTimeout(() => element.remove(), 200);
        }
        S.actors.forEach(actor => {
            let element = [...container.children].find(el => el.dataset.actor === actor.id && !el.classList.contains('leaving'));
            if (!element) {
                element = document.createElement('div'); element.dataset.actor = actor.id;
                element.className = 'adv-portrait entering'; container.appendChild(element);
                setTimeout(() => element.classList.remove('entering'), 240);
            }
            element.dataset.position = actor.position || 'center';
            const framing = assets.characters[actor.id];
            element.style.setProperty('--adv-focus-y', String(framing?.focusY ?? .055));
            element.style.setProperty('--adv-portrait-scale', String(framing?.scale ?? 1.35));
            element.classList.toggle('speaking', actor.id === speaker);
            element.classList.toggle('dimmed', S.actors.size > 1 && actor.id !== speaker);
            const candidates = assets.portraitCandidates(actor.id, actor.expression);
            const request = candidates.join('|');
            if (element.dataset.request === request) return;
            element.dataset.request = request; element.replaceChildren();
            if (!candidates.length) return; // unknown / artwork not registered: name only
            const img = document.createElement('img'); img.alt = ''; element.appendChild(img);
            let index = 0;
            img.onerror = () => {
                if (element.dataset.request !== request) return;
                index++;
                if (index < candidates.length) img.src = assets.url(candidates[index]);
                else img.remove();
            };
            img.src = assets.url(candidates[0]);
        });
    }
    function nameFor(item) {
        return item.name || assets.characters[item.speaker]?.name || (item.speaker === 'announce' ? '校内放送' : item.speaker === 'narration' ? '' : String(item.speaker || ''));
    }
    function completeText() {
        clearTimeout(typeTimer); S.typing = false; S.typed = S.chars.length;
        byId('adv-text').textContent = S.text; byId('adv-next').hidden = false; scheduleAuto();
    }
    function typeText() {
        byId('adv-text').textContent = S.chars.slice(0, ++S.typed).join('');
        if (S.typed >= S.chars.length) return completeText();
        typeTimer = setTimeout(typeText, 30);
    }
    async function effect(name, token) {
        const element = byId('adv-effect');
        if (name === 'chime' || name === 'crowd') { root.playStoryCue?.(name); await wait(name === 'chime' ? 850 : 650); return; }
        if (name === 'battleTease') {
            element.replaceChildren();
            const img = document.createElement('img'); img.src = assets.url('assets/battle-images/card-back.webp'); img.alt = '';
            const title = document.createElement('strong'); title.textContent = 'Battle à la carte';
            element.append(img, title); element.className = 'adv-effect battle-tease';
            await wait(950);
            if (token === S.token) { element.className = 'adv-effect'; element.replaceChildren(); }
        } else if (name === 'fadeOut') {
            await wait(850); // chime completes before the blackout
            if (token !== S.token) return;
            element.className = 'adv-effect fade-out'; await wait(700);
        } else if (name === 'shake') {
            layer.classList.add('adv-shake'); await wait(250); layer.classList.remove('adv-shake');
        }
    }
    async function renderCurrent() {
        cancelTimers(); const token = ++S.token;
        const item = line();
        if (S.stage === 'battle') return chooseBattle();
        if (!item) return endScene();
        savePosition(); S.busy = true; S.typing = false; byId('adv-next').hidden = true;
        stageLine(item); renderActors(item.speaker);
        setBackground(item.background !== undefined ? item.background : currentBackground());
        if (item.battle) { S.busy = false; return chooseBattle(); }
        if (item.se === 'chime' || item.se === 'crowd') root.playStoryCue?.(item.se);
        else if (item.se) root.playSfx?.(item.se);
        if (item.effect) await effect(item.effect, token);
        if (item.wait) await wait(Math.max(0, Number(item.wait) || 0));
        if (token !== S.token || !S.active) return;
        S.busy = false;
        if (!item.text) { S.lineIndex++; return renderCurrent(); }
        S.text = item.text; S.chars = Array.from(S.text); S.typed = 0;
        byId('adv-name').textContent = nameFor(item);
        byId('adv-text').textContent = '';
        S.backlog.push({ name: nameFor(item), text: item.text });
        if (root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) completeText();
        else { S.typing = true; typeText(); }
    }
    function currentBackground() {
        const current = scene(); let key = current?.background;
        current?.lines.slice(0, S.lineIndex + 1).forEach(item => { if (item.background !== undefined) key = item.background; });
        return key;
    }
    function advance() {
        if (!S.active || S.busy || S.logOpen || !byId('adv-ending').hidden) return;
        if (S.typing) return completeText();
        clearTimeout(autoTimer);
        if (S.stage === 'pre' && line()?.id && line().id === S.episode.battle?.after) return chooseBattle();
        S.lineIndex++; renderCurrent();
    }
    function enterScene(id, stage) {
        S.sceneId = id; S.lineIndex = 0; S.stage = stage;
        if (scene()?.bgm !== false) root.playStoryBGM?.();
        renderCurrent();
    }
    function endScene() {
        if (S.stage === 'lose') return showLoseChoices();
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
        clearTimeout(effectTimer); const pending = S.pending; S.pending = null;
        root.__storyResultPending = false;
        setResultExitLabels(false);
        root.resetStoryBattleContext?.();
        activate(); enterScene(pending.sceneId, pending.stage); return true;
    }
    function abandonBattle() {
        if (!S.battleActive && !S.pending) return;
        savePosition(); S.battleActive = false; S.pending = null;
        root.__storyResultPending = false; setResultExitLabels(false); root.resetStoryBattleContext?.(); stop();
    }
    function activate() {
        ensureLayer(); S.active = true; S.busy = false; S.logOpen = false;
        layer.hidden = false; byId('adv-log').hidden = true; byId('adv-ending').hidden = true;
        layer.classList.remove('adv-cleared');
        byId('adv-effect').className = 'adv-effect'; byId('adv-effect').replaceChildren();
        byId('adv-episode-label').textContent = `第${S.episode.number}話「${S.episode.title}」`;
        updateAutoButton();
        const toolbarHeight = layer.querySelector('.adv-toolbar').getBoundingClientRect().height;
        layer.style.setProperty('--adv-toolbar-height', `${toolbarHeight}px`);
        root.stopMenuFloatingBackground?.();
        byId('adv-dialogue').focus();
    }
    function rebuildBeforePosition() {
        S.actors.clear(); S.backlog = [];
        const initial = S.episode.scenes.filter(item => ![S.episode.afterBattle.win, S.episode.afterBattle.lose].includes(item.id));
        const route = S.stage === 'post' || S.stage === 'lose' ? [...initial, scene()] : initial;
        for (const current of route) {
            const count = current.id === S.sceneId ? S.lineIndex : current.lines.length;
            for (const item of current.lines.slice(0, count)) {
                stageLine(item);
                if (item.text) S.backlog.push({ name: nameFor(item), text: item.text });
            }
            if (current.id === S.sceneId) break;
        }
    }
    function start(id, resume = false) {
        const episode = root.BattleStoryData.get(id); if (!episode) return;
        stop(); S.episode = episode; S.pending = null;
        const position = resume && saved.resume?.episodeId === id ? saved.resume : null;
        S.sceneId = position?.sceneId || episode.scenes[0].id;
        S.stage = ['pre', 'battle', 'post', 'lose'].includes(position?.stage) ? position.stage : 'pre';
        if (!scene()) { S.sceneId = episode.scenes[0].id; S.stage = 'pre'; }
        S.lineIndex = Math.max(0, Math.min(Math.floor(Number(position?.lineIndex) || 0), scene().lines.length - 1));
        if (S.stage === 'battle') Object.assign(S, battlePosition(episode));
        // A saved post/lose position is the receipt of a completed battle.
        if (S.stage === 'post' && S.sceneId !== episode.afterBattle.win) { S.sceneId = episode.afterBattle.win; S.lineIndex = 0; }
        if (S.stage === 'lose' && S.sceneId !== episode.afterBattle.lose) { S.sceneId = episode.afterBattle.lose; S.lineIndex = 0; }
        rebuildBeforePosition(); activate();
        const previous = S.backlog[S.backlog.length - 1];
        S.text = previous?.text || '';
        byId('adv-text').textContent = S.text;
        byId('adv-name').textContent = previous?.name || '';
        root.playStoryBGM?.(); renderCurrent();
    }
    function endingButton(text, action) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = action;
        byId('adv-ending').appendChild(button);
    }
    function showLoseChoices() {
        S.busy = false; clearTimeout(autoTimer);
        const ending = byId('adv-ending'); ending.replaceChildren(); ending.hidden = false;
        if (scene()?.provisional) {
            const note = document.createElement('p'); note.textContent = '敗北時の会話は仮セリフです。'; ending.appendChild(note);
        }
        endingButton('もう一度挑戦', () => {
            Object.assign(S, battlePosition(S.episode)); S.stage = 'battle'; chooseBattle();
        });
        endingButton('ストーリー選択へ戻る', returnToSelection);
    }
    function clearEpisode() {
        if (S.stage !== 'post') return;
        clearTimeout(autoTimer); saved.resume = null; writeSave();
        root.BattleStoryProgress?.complete(S.episode.id);
        S.stage = 'clear';
        layer.classList.add('adv-cleared');
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
        endingButton('ストーリー選択へ戻る', () => { stop(); root.openStoryStage?.(); });
    }
    root.addEventListener?.('pagehide', () => { if (S.battleActive || S.pending) abandonBattle();
        if (S.active && S.stage !== 'clear') savePosition(); stop(); });
    function appendEpisodeCards(list) {
        const progress = root.BattleStoryProgress?.load() || {};
        root.BattleStoryData.all().forEach(episode => {
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
    root.StoryAdv = Object.freeze({ start, stop, abandonBattle, handleBattleEnded, finishBattleReturn, appendEpisodeCards,
        hasResume: id => saved.resume?.episodeId === id, autoDelay });
})(window);
