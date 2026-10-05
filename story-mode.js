(function () {
    'use strict';

    const STORY_PROGRESS_KEY = 'battleAlaCarteStoryProgressV1';
    let storyResultTimer = null;

    const SPEAKERS = {
        mai: { name: '舞依', cls: 'char-mai' },
        takumi: { name: '拓海', cls: 'char-takumi' },
        chizuru: { name: '千鶴', cls: 'char-chizuru' },
        akatsuki: { name: '暁', cls: 'char-akatsuki' }
    };

    const EPISODES = [
        {
            id: 'episode1',
            portraitStyle: 'icon',
            arc: 'reunion',
            background: 'classroom',
            protagonist: 'takumi',
            title: '第1話 ルールレッスン',
            summary: '文化祭のあと。久しぶりでルールを忘れてしまった拓海に、舞依があらためて教える。',
            implemented: true,
            unlockRequires: null,
            note: 'セット / イベント / 料理 / 手札調整を順番に体験',
            objectives: [
                { key: 'setCard', text: '材料カードを1枚セットする' },
                { key: 'useEvent', text: 'イベントカードを1回発動する' },
                { key: 'cookDish', text: '料理を1回作成する' },
                { key: 'adjustHand', text: 'エンドフェイズの手札調整を完了する' }
            ],
            pre: [
                { speaker: 'mai', expression: 'normal', pose: 'behind', text: '拓海先輩、ちょっといいですか' },
                { speaker: 'takumi', expression: 'smile', text: 'どうしたの？' },
                { speaker: 'mai', expression: 'normal', text: '今度みんなで集まるとき、Battle à la carte をやると思うんです' },
                { speaker: 'mai', expression: 'normal', text: '拓海先輩、ルール覚えてますか？' },
                { speaker: 'takumi', expression: 'exasperated', text: '……久しぶりだから、ちょっと怪しいかも', motion: 'tremble', mark: 'sweat' },
                { speaker: 'mai', expression: 'cold', pose: 'default', text: 'やっぱり' },
                { speaker: 'mai', expression: 'serious', text: 'このままだと、千鶴ちゃんに一日中付き合わされますよ' },
                { speaker: 'takumi', expression: 'exasperated', text: 'それはそれで楽しそうだけどね' },
                { speaker: 'mai', expression: 'cold', text: '私が困るんです' },
                { speaker: 'takumi', expression: 'smile', text: '分かった。じゃあ一から教えてもらおうかな' },
                { speaker: 'mai', expression: 'normal', text: '材料をセット、イベント、料理、最後に手札調整。この順番でやってみてください' },
                { speaker: 'mai', expression: 'smug', text: '先攻は私です。よく見ててください' }
            ],
            postWin: [
                { speaker: 'mai', expression: 'smile', pose: 'behind', text: '完璧です。1ターンの流れはこれで大丈夫です' },
                { speaker: 'takumi', expression: 'happy', text: 'やってみたら思い出してきた', mark: 'sparkle', se: 'idea' },
                { speaker: 'takumi', expression: 'smile', text: '部活のときと立場が逆だね' },
                { speaker: 'mai', expression: 'smug', pose: 'default', text: '今は私が先輩です' },
                { speaker: 'mai', expression: 'normal', text: '次はスキルの使い方です' },
                { speaker: 'mai', expression: 'gentle', text: '慣れてきたら、設定で『クイック』にするとターン終了などの確認を省けます。いつでも戻せますよ' }
            ]
        },
        {
            id: 'episode2',
            portraitStyle: 'icon',
            arc: 'reunion',
            background: 'classroom',
            protagonist: 'takumi',
            title: '第2話 スキルレッスン',
            summary: 'スキル「切り札調達」を使って勝つ練習。舞依先生のレッスンは続く。',
            implemented: true,
            unlockRequires: 'episode1',
            note: '「切り札調達」を使ってから勝利する',
            objectives: [
                { key: 'skillAce', text: 'スキル「切り札調達」を発動する' },
                { key: 'winBattle', text: 'そのまま勝利する' }
            ],
            pre: [
                { speaker: 'mai', expression: 'normal', text: '今日はスキルの練習です' },
                { speaker: 'mai', expression: 'normal', text: '使うのは『切り札調達』。条件がそろったときに発動できます' },
                { speaker: 'takumi', expression: 'thinking', text: '今は使える？' },
                { speaker: 'mai', expression: 'smile', text: '使えます。先にスキルを使ってから、料理で決めてください' },
                { speaker: 'takumi', expression: 'normal', text: 'スキルを使うまで、料理もターン終了もできないんだよね' },
                { speaker: 'mai', expression: 'smug', text: 'ちゃんと聞いてて偉いです' },
                { speaker: 'takumi', expression: 'exasperated', text: 'なんで僕が褒められてるの', mark: '?' }
            ],
            postWin: [
                { speaker: 'takumi', expression: 'happy', text: '勝てた！ スキルを使うと一気に楽になるね', motion: 'hop', mark: 'sparkle', se: 'sparkle' },
                { speaker: 'mai', expression: 'smile', pose: 'behind', text: 'ナイスです。これでスキルの流れもばっちりです' },
                { speaker: 'mai', expression: 'gentle', text: '次に集まる日、千鶴ちゃんと暁さんの勝負があるらしいです' },
                { speaker: 'takumi', expression: 'smile', text: '約束してたもんね。見に行こうか' },
                { speaker: 'mai', expression: 'happy', pose: 'cheer', text: 'Battle à la carte Mode が見られるかもしれません', mark: 'sparkle' }
            ],
            postLose: [
                { speaker: 'mai', expression: 'gentle', pose: 'behind', text: '大丈夫です。練習なので何度でも挑戦できます' },
                { speaker: 'takumi', expression: 'smile', text: 'ありがとう。もう一回、『切り札調達』から丁寧にやってみる', mark: 'note' }
            ]
        },
        {
            id: 'episode3',
            portraitStyle: 'icon',
            arc: 'reunion',
            background: 'small-restaurant',
            protagonist: 'chizuru',
            title: '第3話 Battle à la carte Mode',
            summary: '約束どおり六人が集まった日。一勝一敗の千鶴と暁が、決着をかけて因縁の再戦。',
            implemented: true,
            unlockRequires: 'episode2',
            note: '通常料理5品でMode発動（緊急料理・創作料理はカウント外）',
            objectives: [
                { key: 'modeOn', text: '通常料理5品目を完成させて Battle à la carte Mode に入る' },
                { key: 'finishBattle', text: 'Battle à la carte Mode のまま対戦を最後まで完了する' }
            ],
            pre: [
                { speaker: 'akatsuki', expression: 'smug', text: '約束どおり来たで' },
                { speaker: 'chizuru', expression: 'smile', text: '今日こそ勝つ！', motion: 'zoom', mark: '!', screen: 'speedLines', se: 'thud' },
                { speaker: 'akatsuki', expression: 'smug', text: '文化祭のときは一勝一敗やからな。今日で決着や' },
                { speaker: 'chizuru', expression: 'pout', text: '勝ち越すのは私' },
                { speaker: 'tsuyoshi', expression: 'laugh', text: '始まる前から燃えてるやん！', motion: 'hop', mark: 'note', se: 'laugh' },
                { speaker: 'akatsuki', expression: 'smug', text: '今は俺が1点リードや。このまま押し切るで' },
                { speaker: 'chizuru', expression: 'pout', text: 'まだ。あと1品で私のModeが始まるから' },
                { speaker: 'kanna', expression: 'gentle', text: '千鶴、通常料理を5品作ると Battle à la carte Mode に入れるよ' },
                { speaker: 'kanna', expression: 'smug', pose: 'pocket', text: '緊急料理と創作料理は数に入らないから、つまみ食いみたいにカウントしないでね' },
                { speaker: 'chizuru', expression: 'pout', text: 'つまみ食いは関係ないでしょ！', motion: 'shake', mark: 'anger', se: 'thud' },
                { speaker: 'narration', text: '中盤から再開。千鶴を操作して、5品目を完成させよう', name: 'ナレーション' }
            ],
            postWin: [
                { speaker: 'chizuru', expression: 'happy', pose: 'cheer', text: '見た？ Mode に入ると流れをつかみやすいの' },
                { speaker: 'akatsuki', expression: 'sad', text: '……くっそ、ええとこまでいってたのに', motion: 'tremble', mark: '…', se: 'shock' },
                { speaker: 'tsuyoshi', expression: 'laugh', text: 'また負けとるやん！', motion: 'hop', mark: 'note', se: 'laugh' },
                { speaker: 'akatsuki', expression: 'cold', text: 'うるさい' },
                { speaker: 'chizuru', expression: 'smug', text: 'これで二勝一敗', mark: 'sparkle' },
                { speaker: 'akatsuki', expression: 'smug', text: '次は俺が取り返す' },
                { speaker: 'chizuru', expression: 'smile', text: '受けて立つよ' }
            ],
            postLose: [
                { speaker: 'akatsuki', expression: 'smug', text: '今回は俺の勝ちやな' },
                { speaker: 'chizuru', expression: 'pout', text: '……Mode の使い方は分かったもん' },
                { speaker: 'akatsuki', expression: 'laugh', text: 'ほな次はちゃんと勝ってみ' },
                { speaker: 'chizuru', expression: 'pout', text: 'もう一回。次は勝つ！', motion: 'zoom', mark: '!' }
            ]
        }
    ];

    const S = {
        inited: false,
        progress: null,
        phase: 'select',
        episodeId: null,
        lines: [],
        lineIndex: 0,
        objectives: {},
        battleActive: false,
        pendingWinner: null,
        initialCounts: null,
        discardPromptSeen: false,
        autoFinishRequested: false,
        nextCardId: null,
        primaryAction: null,
        secondaryAction: null,
        observerInstalled: false,
        guardsInstalled: false,
        modeLessonShown: false
    };

    const byId = (id) => document.getElementById(id);

    // Approved by the owner and フェニチルさん on 2026-10-04. Keep this text verbatim.
    const CHARACTER_NOTICE_SHORT = '本作のキャラクターは、フェニチルさんの創作作品『天涯比隣』のキャラクターデザインと名前をお借りした二次創作です。性格・関係性・ストーリー・設定はすべて本作独自のもので、原作とは関係ありません。';
    const CHARACTER_NOTICE_KEY = 'battleAlaCarteCharacterNotice20261004';
    let noticeShownThisPage = false;
    let noticePendingAction = null;

    function noticeAcknowledged() {
        if (noticeShownThisPage) return true;
        if (window.StoryViewer?.active) return false;
        try { return localStorage.getItem(CHARACTER_NOTICE_KEY) === '1'; }
        catch (e) { return false; }
    }

    function showCharacterNotice(force = false, action = null) {
        const dialog = byId('character-notice-dialog');
        if (!dialog) return false;
        if (dialog.open) {
            if (action) noticePendingAction = action;
            return true;
        }
        if (!force && noticeAcknowledged()) return false;
        noticePendingAction = action;
        dialog.showModal();
        noticeShownThisPage = true;
        return true;
    }

    function beforeStory(action) {
        return !showCharacterNotice(false, action);
    }

    function bindCharacterNotice() {
        const dialog = byId('character-notice-dialog');
        if (!dialog || dialog.dataset.noticeBound) return;
        dialog.dataset.noticeBound = '1';
        // Native dialog keeps focus and pointer input inside the single-button notice.
        dialog.addEventListener('cancel', event => event.preventDefault());
        byId('character-notice-confirm')?.addEventListener('click', () => {
            if (!window.StoryViewer?.active) {
                try { localStorage.setItem(CHARACTER_NOTICE_KEY, '1'); } catch (e) { /* once per page */ }
            }
            const action = noticePendingAction;
            noticePendingAction = null;
            dialog.close();
            action?.();
        });
        byId('story-character-notice-link')?.addEventListener('click', () => showCharacterNotice(true));
    }

    window.CharacterNotice = Object.freeze({ shortText: CHARACTER_NOTICE_SHORT, beforeStory,
        showOnce: () => showCharacterNotice(), reopen: () => showCharacterNotice(true) });

    function safeJsonParse(text, fallback) {
        try { return JSON.parse(text); } catch (e) { return fallback; }
    }

    function loadProgress() {
        const fallback = { episode1: false, episode2: false, episode3: false, episode4: false };
        if (window.StoryViewer?.active) return fallback;
        try {
            const raw = localStorage.getItem(STORY_PROGRESS_KEY);
            if (!raw) return fallback;
            const parsed = safeJsonParse(raw, null);
            if (!parsed || typeof parsed !== 'object') return fallback;
            return {
                ...parsed,
                episode4: !!parsed.episode4,
                episode1: !!parsed.episode1,
                episode2: !!parsed.episode2,
                episode3: !!parsed.episode3
            };
        } catch (e) {
            return fallback;
        }
    }

    function saveProgress() {
        if (window.StoryViewer?.active) return;
        try {
            S.progress = { ...loadProgress(), ...S.progress };
            localStorage.setItem(STORY_PROGRESS_KEY, JSON.stringify(S.progress));
        } catch (e) {
            // ignore
        }
        window.Achievements?.refreshCompletions({ story: S.progress });
    }

    function getEpisode(id) {
        return EPISODES.find(ep => ep.id === id) || null;
    }

    function isUnlocked(ep) {
        if (!ep) return false;
        if (!ep.unlockRequires) return true;
        if (ep.unlockRequires === 'episode1') return !!S.progress.episode1;
        if (ep.unlockRequires === 'episode2') return !!S.progress.episode2;
        return false;
    }

    function showStartStage(stageId) {
        if (typeof window.__showStartStage === 'function') {
            window.__showStartStage(stageId);
            return;
        }
        document.querySelectorAll('.start-stage').forEach(el => {
            el.classList.toggle('hidden', el.id !== stageId);
        });
    }

    function setStoryActiveEpisodeContext(episodeId) {
        if (!episodeId) {
            window.__storyActiveEpisodeId = null;
            return;
        }
        window.__storyActiveEpisodeId = String(episodeId);
    }

    function setStoryMessage(text) {
        const el = byId('story-stage-message');
        if (el) el.textContent = text || '';
    }

    function setStorySubtitle(text) {
        const el = byId('story-stage-subtitle');
        if (el) el.textContent = text || '';
    }

    function playStorySceneBgm(characterId) {
        if (typeof window.playStoryBGM === 'function') {
            window.playStoryBGM(characterId);
        }
    }

    function setHudVisible(visible) {
        const el = byId('story-hud-panel');
        if (el) el.classList.toggle('hidden', !visible);
    }

    function setHudText(title, note) {
        const t = byId('story-hud-title');
        const n = byId('story-hud-note');
        if (t) t.textContent = title || '';
        if (n) n.textContent = note || '';
    }

    function setActionButton(kind, visible, text, action) {
        const id = kind === 'primary' ? 'story-primary-button' : 'story-secondary-button';
        const el = byId(id);
        if (!el) return;
        el.classList.toggle('hidden', !visible);
        if (!visible) return;
        el.textContent = text || '';
        if (kind === 'primary') S.primaryAction = typeof action === 'function' ? action : null;
        if (kind === 'secondary') S.secondaryAction = typeof action === 'function' ? action : null;
    }

    function renderEpisodeList() {
        const list = byId('story-episode-list');
        if (!list) return;
        list.innerHTML = `<h2 class="story-arc-heading">${window.BattleStoryData?.arcs[EPISODES[0].arc] || '再会編'}</h2>` + EPISODES.map(ep => {
            const unlocked = isUnlocked(ep);
            const implemented = !!ep.implemented;
            const cleared = !!S.progress[ep.id];
            let meta = 'プレイ可能';
            let label = 'この話を開始';
            let disabled = '';
            if (!implemented) {
                meta = '後日実装予定';
                label = '準備中';
                disabled = ' disabled';
            } else if (!unlocked) {
                meta = ep.unlockRequires === 'episode1' ? '第1話クリアで解放' : '第2話クリアで解放';
                label = '未解放';
                disabled = ' disabled';
            } else if (cleared) {
                meta = 'クリア済み';
                label = 'もう一度プレイ';
            }
            const cardClass = `story-episode-card${(!implemented || !unlocked) ? ' locked' : ''}`;
            return `
                <article class="${cardClass}">
                    <div class="story-episode-title">${ep.title}</div>
                    <div class="story-episode-summary">${ep.summary}</div>
                    <div class="story-episode-meta">${meta}</div>
                    <button class="story-episode-start" data-story-episode-id="${ep.id}"${disabled}>${label}</button>
                </article>
            `;
        }).join('');
        window.StoryAdv?.appendEpisodeCards?.(list);
    }

    function renderObjectiveList(containerId, itemClass) {
        const container = byId(containerId);
        const ep = getEpisode(S.episodeId);
        if (!container || !ep) return;
        const objectives = Array.isArray(ep.objectives) ? ep.objectives : [];
        container.innerHTML = objectives.map((obj, idx) => {
            const done = !!S.objectives[obj.key];
            const cls = `${itemClass}${done ? ' done' : ''}`;
            const prefix = done ? '✓' : `${idx + 1}.`;
            return `<div class="${cls}">${prefix} ${obj.text}</div>`;
        }).join('');
    }

    function refreshObjectiveViews() {
        const ep = getEpisode(S.episodeId);
        if (!ep) return;
        renderObjectiveList('story-objective-list', 'story-objective-item');
        renderObjectiveList('story-hud-objectives', 'story-hud-item');
        updateHudHint();
    }

    function setSpeaker(speakerKey) {
        const icon = byId('story-speaker-icon');
        const name = byId('story-speaker-name');
        const speaker = SPEAKERS[speakerKey] || SPEAKERS.mai;
        if (icon) icon.className = `story-speaker-icon start-char-portrait ${speaker.cls}`;
        if (name) name.textContent = speaker.name;
    }

    function renderDialogue() {
        const panel = byId('story-dialogue-panel');
        if (panel) panel.classList.add('hidden');
        const ep = getEpisode(S.episodeId);
        if (!ep) return;
        window.StoryAdv.playConversation(ep, S.lines, {
            phase: S.phase,
            introScene: S.phase === 'post' ? (S.pendingWinner !== 'player' && ep.postLose?.length ? 'lose' : 'win') : S.phase,
            getActions() {
                // The tutorial still owns battle setup, results, retries and progress.
                S.lineIndex = Math.max(0, S.lines.length - 1);
                updateDialogueButtons();
                return ['primary', 'secondary'].map(kind => {
                    const button = byId(`story-${kind}-button`);
                    return button && !button.classList.contains('hidden')
                        ? { text: button.textContent, action: S[`${kind}Action`] } : null;
                }).filter(Boolean);
            }
        });
    }

    function showGuide() {
        const guide = byId('story-battle-guide');
        const note = byId('story-objective-note');
        const ep = getEpisode(S.episodeId);
        if (!guide || !note || !ep) return;
        guide.classList.remove('hidden');
        note.textContent = ep.note || '';
        refreshObjectiveViews();
    }

    function hideGuide() {
        const guide = byId('story-battle-guide');
        if (guide) guide.classList.add('hidden');
    }

    function openSelection(message) {
        window.StoryAdv?.abandonBattle();
        window.StoryAdv?.stop();
        if (storyResultTimer) { clearTimeout(storyResultTimer); storyResultTimer = null; }
        window.__storyResultPending = false;
        const overlay = byId('start-overlay');
        if (overlay) overlay.classList.remove('hidden');
        showStartStage('start-story-stage');
        playStorySceneBgm();

        S.phase = 'select';
        S.episodeId = null;
        S.lines = [];
        S.lineIndex = 0;
        S.battleActive = false;
        S.pendingWinner = null;
        S.objectives = {};
        S.initialCounts = null;
        S.discardPromptSeen = false;
        S.autoFinishRequested = false;
        S.modeLessonShown = false;
        setStoryActiveEpisodeContext(null);

        const list = byId('story-episode-list');
        if (list) list.classList.remove('hidden');

        const panel = byId('story-dialogue-panel');
        if (panel) panel.classList.add('hidden');
        hideGuide();
        setHudVisible(false);
        setStorySubtitle('再会編（チュートリアル）／出会い・文化祭編');
        renderEpisodeList();
        setStoryMessage(message || '');
        setActionButton('primary', false, '', null);
        setActionButton('secondary', false, '', null);
    }

    function getNextCardId(gs) {
        if (Number.isFinite(S.nextCardId) && S.nextCardId > 0) {
            const id = S.nextCardId;
            S.nextCardId += 1;
            return id;
        }
        let maxId = 0;
        const scan = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach(card => {
                const id = Number(card?.id);
                if (Number.isFinite(id) && id > maxId) maxId = id;
            });
        };
        scan(gs?.deck); scan(gs?.discard);
        scan(gs?.players?.player?.hand); scan(gs?.players?.player?.events); scan(gs?.players?.player?.set);
        scan(gs?.players?.cpu?.hand); scan(gs?.players?.cpu?.events); scan(gs?.players?.cpu?.set);
        S.nextCardId = maxId + 1;
        const id = S.nextCardId;
        S.nextCardId += 1;
        return id;
    }

    function removeCardFromZoneByName(zone, type, name) {
        if (!Array.isArray(zone)) return null;
        const idx = zone.findIndex(card => card && card.type === type && card.name === name);
        if (idx < 0) return null;
        return zone.splice(idx, 1)[0];
    }

    function takeCard(gs, type, name) {
        if (!Array.isArray(gs?.deck)) gs.deck = [];
        const fromDeck = removeCardFromZoneByName(gs.deck, type, name);
        if (fromDeck) return fromDeck;

        const zones = [
            gs?.discard,
            gs?.players?.player?.hand,
            gs?.players?.player?.events,
            gs?.players?.player?.set,
            gs?.players?.cpu?.hand,
            gs?.players?.cpu?.events,
            gs?.players?.cpu?.set
        ];

        for (const zone of zones) {
            const card = removeCardFromZoneByName(zone, type, name);
            if (card) return card;
        }

        console.warn(`[story-mode] card not found: ${type}:${name}`);
        return null;
    }

    function pushCardsSafe(targetZone, cards) {
        if (!Array.isArray(targetZone) || !Array.isArray(cards)) return;
        cards.forEach(card => {
            if (card) targetZone.push(card);
        });
    }

    function resetPlayerFlags(player) {
        if (!player) return;
        player.knifeSelectedName = null;
        player.knifeUsedThisTurn = false;
        player.usedEventThisTurn = false;
        player.extraEventUsesRemainingThisTurn = 0;
        player.lockedCookingThisTurn = false;
        player.recipesCookedThisTurn = 0;
        player.startedTurnBehindThisTurn = false;
        player.battleALaCarteModeBonusDrawUsedThisTurn = false;
        player.battleALaCarteModeDiscardPickupUsedThisTurn = false;
        player.battleALaCarteModeActive = false;
    }

    function getRecipeDefinitionByName(name) {
        const list = Array.isArray(window.recipes) ? window.recipes : [];
        return list.find(recipe => recipe && recipe.name === name) || null;
    }

    function makeStoryCookedRecipe(name, cookedAtOffset) {
        const recipe = getRecipeDefinitionByName(name);
        if (!recipe) {
            return {
                name,
                points: 1,
                required: [],
                doubledName: null,
                cookedAt: Date.now() - Math.max(0, Number(cookedAtOffset) || 0)
            };
        }
        return {
            name: recipe.name,
            points: recipe.points,
            required: Array.isArray(recipe.required) ? recipe.required.slice() : [],
            doubledName: null,
            cookedAt: Date.now() - Math.max(0, Number(cookedAtOffset) || 0)
        };
    }

    function setupStoryBattle(ep) {
        if (typeof window.__battleSafeStartGame === 'function') window.__battleSafeStartGame();
        if (typeof window.__battleStartBgmOnce === 'function') window.__battleStartBgmOnce();
        if (typeof window.initGame === 'function') window.initGame();
        if (window.GameState) window.GameState.achievementStory = true;

        const gs = window.GameState;
        if (!gs || !gs.players?.player || !gs.players?.cpu) return false;

        S.nextCardId = null;

        const p = gs.players.player;
        const c = gs.players.cpu;

        if (ep.id === 'episode3') {
            gs.characterIds.player = 'chizuru';
            gs.characterIds.cpu = 'akatsuki';
            gs.characterNames.player = '千鶴';
            gs.characterNames.cpu = '暁';
        } else {
            gs.characterIds.player = 'takumi';
            gs.characterIds.cpu = 'mai';
            gs.characterNames.player = '拓海';
            gs.characterNames.cpu = '舞依';
        }

        if (typeof window.setPlayerSelectedSkill === 'function') {
            const playerSkillKey = ep.id === 'episode2'
                ? 'aceProcurement'
                : (ep.id === 'episode3' ? 'tasteThief' : 'makanaiSupply');
            window.setPlayerSelectedSkill(p, playerSkillKey);
            window.setPlayerSelectedSkill(c, 'kitchenInfiltration');
        }

        // Return the opening deal before assigning fixed lesson cards.
        gs.deck.push(...p.hand, ...p.events, ...c.hand, ...c.events);
        p.hand = []; p.events = []; p.set = []; p.packs = [];
        p.score = 0; p.cookedRecipes = []; p.cookedMeatTypes = []; p.skillUseCounts = {};
        c.hand = []; c.events = []; c.set = []; c.packs = [];
        c.score = 0; c.cookedRecipes = []; c.cookedMeatTypes = []; c.skillUseCounts = {};
        resetPlayerFlags(p);
        resetPlayerFlags(c);

        gs.selectionMode = null;
        gs.discardNeedCount = 0;
        gs.selectedCardIds = [];
        gs.candidateRecipes = [];
        gs.pendingEventContext = null;
        gs.pendingSkillContext = null;
        gs.pendingSkillConfirm = null;
        gs.selectedTargetIds = [];
        gs.pendingSetCardId = null;
        gs.pendingEventCardId = null;
        gs.pendingViewSetCardId = null;
        gs.pendingPackKey = null;
        gs.pendingIngredientAction = null;
        gs.pendingKnifeOptions = [];
        gs.openDishHistoryFor = null;
        gs.gameEnded = false;
        gs.winner = null;
        gs.specialWinReason = null;
        gs.currentTurn = ep.id === 'episode1' ? 'cpu' : 'player';
        gs.currentPhase = 'メインフェイズ';

        if (ep.id === 'episode1') {
            pushCardsSafe(p.hand, [
                takeCard(gs, 'ingredient', 'ごはん'),
                takeCard(gs, 'ingredient', 'のり'),
                takeCard(gs, 'ingredient', '卵'),
                takeCard(gs, 'ingredient', 'にんじん')
            ]);
            pushCardsSafe(p.events, [
                takeCard(gs, 'event', '爆買い'),
                takeCard(gs, 'event', 'ゴミ収集車')
            ]);
            pushCardsSafe(c.hand, [
                takeCard(gs, 'ingredient', '豚肉'),
                takeCard(gs, 'ingredient', '大根')
            ]);
            pushCardsSafe(c.events, [takeCard(gs, 'event', 'やっぱやめた')]);
            p.score = 0;
            c.score = 0;
        } else if (ep.id === 'episode2') {
            pushCardsSafe(p.hand, [
                takeCard(gs, 'ingredient', 'ごはん'),
                takeCard(gs, 'ingredient', 'のり')
            ]);
            pushCardsSafe(p.events, [takeCard(gs, 'event', '爆買い')]);
            pushCardsSafe(c.hand, [takeCard(gs, 'ingredient', '牛肉')]);
            pushCardsSafe(c.events, [takeCard(gs, 'event', 'やっぱやめた')]);
            p.score = 9;
            c.score = 8;
        } else if (ep.id === 'episode3') {
            // 中盤から再開: CPUが1点リード、プレイヤーは通常料理4品済みであと1品でMode
            pushCardsSafe(p.hand, [
                takeCard(gs, 'ingredient', 'ごはん'),
                takeCard(gs, 'ingredient', 'のり'),
                takeCard(gs, 'ingredient', 'キャベツ'),
                takeCard(gs, 'ingredient', 'たまねぎ')
            ]);
            pushCardsSafe(p.events, [takeCard(gs, 'event', 'やり直し')]);
            pushCardsSafe(c.hand, [
                takeCard(gs, 'ingredient', '牛肉'),
                takeCard(gs, 'ingredient', 'たまねぎ'),
                takeCard(gs, 'ingredient', 'じゃがいも'),
                takeCard(gs, 'ingredient', 'にんじん')
            ]);
            pushCardsSafe(c.events, [takeCard(gs, 'event', '爆買い')]);

            p.score = 4;
            c.score = 5;
            p.cookedRecipes = [
                makeStoryCookedRecipe('おにぎり', 38000),
                makeStoryCookedRecipe('卵かけごはん', 30000),
                makeStoryCookedRecipe('豚バラ大根', 22000),
                makeStoryCookedRecipe('バナナジュース', 14000)
            ];
            c.cookedRecipes = [
                makeStoryCookedRecipe('チャーハン', 32000),
                makeStoryCookedRecipe('野菜炒め', 24000),
                makeStoryCookedRecipe('卵かけごはん', 16000)
            ];
        }

        S.initialCounts = {
            setCount: p.set.length,
            cookCount: p.cookedRecipes.length,
            eventCount: p.events.length
        };
        S.discardPromptSeen = false;
        S.autoFinishRequested = false;
        S.modeLessonShown = false;
        return true;
    }

    function allObjectivesDone(ep) {
        const list = Array.isArray(ep?.objectives) ? ep.objectives : [];
        return list.length > 0 && list.every(o => !!S.objectives[o.key]);
    }

    function getAceUseCount(player) {
        if (!player) return 0;
        if (typeof window.getPlayerSkillUseCount === 'function') {
            const n = Number(window.getPlayerSkillUseCount(player, 'aceProcurement'));
            return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
        }
        const raw = Number(player?.skillUseCounts?.aceProcurement || 0);
        return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    }

    function countNormalCookedRecipes(player) {
        if (!player || !Array.isArray(player.cookedRecipes)) return 0;
        const recipeNames = new Set((Array.isArray(window.recipes) ? window.recipes : []).map(item => item?.name));
        return player.cookedRecipes.filter(item => {
            if (!item || item.fromEvent === true) return false;
            const name = String(item.name || '');
            if (!name) return false;
            if (name === '緊急料理' || name === '創作料理') return false;
            return recipeNames.size === 0 || recipeNames.has(name);
        }).length;
    }

    function updateHudHint() {
        const ep = getEpisode(S.episodeId);
        if (!ep) return;

        if (ep.id === 'episode1') {
            if (window.GameState?.currentTurn === 'cpu' && window.GameState?.turnNumber === 1) {
                return setHudText(ep.title, '舞依の先攻です。相手のターンが終わるまで待とう。');
            }
            if (!S.objectives.setCard) return setHudText(ep.title, 'まずは材料カードを1枚セットしよう。');
            if (!S.objectives.useEvent) return setHudText(ep.title, '次はイベントカードを1回使ってみよう。');
            if (!S.objectives.cookDish) return setHudText(ep.title, '料理作成ボタンで1回料理を作ってみよう。');
            if (!S.objectives.adjustHand) return setHudText(ep.title, 'ターン終了後、手札調整を完了しよう。');
            return setHudText(ep.title, '目標達成！ 会話パートへ戻ります。');
        }

        if (ep.id === 'episode2') {
            if (!S.objectives.skillAce) return setHudText(ep.title, '先にスキル「切り札調達」を発動しよう。');
            if (!S.objectives.winBattle) return setHudText(ep.title, 'そのまま料理を作って勝利しよう。');
            return setHudText(ep.title, '目標達成！ 会話パートへ戻ります。');
        }

        if (ep.id === 'episode3') {
            const p = window.GameState?.players?.player;
            const cooked = countNormalCookedRecipes(p);
            if (!S.objectives.modeOn) {
                return setHudText(ep.title, `あと1品でMode発動（通常料理 ${Math.min(cooked, 5)}/5）`);
            }
            if (!S.objectives.finishBattle) {
        return setHudText(ep.title, 'Mode中: 1点料理の追加ドロー（毎ターン1回）＋ドローフェイズ後に捨て札から材料1枚回収（毎ターン1回）。');
            }
            return setHudText(ep.title, '目標達成！ 対戦の決着まで完了しました。');
        }

        setHudText(ep.title, ep.note || '');
    }

    function onBattleStateUpdated() {
        if (!S.battleActive) return;
        const ep = getEpisode(S.episodeId);
        const gs = window.GameState;
        const p = gs?.players?.player;
        if (!ep || !gs || !p) return;

        if (ep.id === 'episode1') {
            if (p.set.length > (S.initialCounts?.setCount ?? 0)) S.objectives.setCard = true;
            if (p.usedEventThisTurn || p.events.length < (S.initialCounts?.eventCount ?? 0)) S.objectives.useEvent = true;
            if (p.cookedRecipes.length > (S.initialCounts?.cookCount ?? 0)) S.objectives.cookDish = true;
            if (gs.currentTurn === 'player' && gs.selectionMode === 'discard' && gs.discardNeedCount > 0) S.discardPromptSeen = true;
            if (S.discardPromptSeen && gs.currentTurn !== 'player' && gs.selectionMode !== 'discard') S.objectives.adjustHand = true;

            refreshObjectiveViews();
            if (!S.autoFinishRequested && allObjectivesDone(ep) && !gs.gameEnded) {
                S.autoFinishRequested = true;
                if (typeof window.addLog === 'function') window.addLog('チュートリアル目標達成！ 第1話の対戦を終了します。');
                setTimeout(() => {
                    if (!window.GameState?.gameEnded && typeof window.endGame === 'function') window.endGame('player');
                }, 450);
            }
            return;
        }

        if (ep.id === 'episode2') {
            if (getAceUseCount(p) > 0) S.objectives.skillAce = true;
            if (gs.gameEnded && gs.winner === 'player') S.objectives.winBattle = true;
            refreshObjectiveViews();
            return;
        }

        if (ep.id === 'episode3') {
            if (p.battleALaCarteModeActive) {
                S.objectives.modeOn = true;
                if (!S.modeLessonShown) {
                    S.modeLessonShown = true;
                    if (typeof window.addLog === 'function') {
                        window.addLog('チュートリアル: Battle à la carte Mode 発動！');
                        window.addLog('条件: 通常料理を5品完成（緊急料理・創作料理はカウントしない）。');
                window.addLog('効果1: Mode中は自分のメインフェイズに1回、1点料理完成で追加1ドロー。');
                window.addLog('効果2: Mode中はドローフェイズ後、毎ターン1回だけ捨て札の材料を1枚回収。');
                    }
                }
            }
            if (gs.gameEnded) {
                S.objectives.finishBattle = true;
            }
            refreshObjectiveViews();
        }
    }

    function installObserver() {
        if (S.observerInstalled) return;
        const prev = window.__onGameStateUpdated;
        window.__onGameStateUpdated = function () {
            if (typeof prev === 'function') prev();
            onBattleStateUpdated();
        };
        S.observerInstalled = true;
    }

    function shouldBlockEpisode2() {
        return S.battleActive && S.episodeId === 'episode2' && !S.objectives.skillAce;
    }

    function blockEpisode2Action() {
        setHudText('第2話 スキルレッスン', '先にスキル「切り札調達」を発動してください。');
        if (typeof window.addLog === 'function') window.addLog('チュートリアル: 先にスキル「切り札調達」を使おう。');
    }

    function installGuards() {
        if (S.guardsInstalled) return;

        const wrap = (name) => {
            const orig = window[name];
            if (typeof orig !== 'function') return;
            window[name] = function () {
                if (shouldBlockEpisode2()) {
                    blockEpisode2Action();
                    return;
                }
                return orig.apply(this, arguments);
            };
        };

        wrap('playerShowRecipeCandidates');
        wrap('playerCookSelectedRecipe');
        wrap('playerEndTurn');

        S.guardsInstalled = true;
    }

    function updateDialogueButtons() {
        const ep = getEpisode(S.episodeId);
        const atLast = !Array.isArray(S.lines) || S.lines.length === 0 || S.lineIndex >= S.lines.length - 1;

        if (S.phase === 'pre') {
            if (atLast) {
                setActionButton('primary', true, 'チュートリアル対戦へ', () => startBattle(S.episodeId));
            } else {
                setActionButton('primary', true, '次へ', () => {
                    S.lineIndex += 1;
                    renderDialogue();
                    updateDialogueButtons();
                });
            }
            setActionButton('secondary', true, 'エピソード選択へ', () => openSelection(''));
            return;
        }

        if (S.phase === 'post') {
            if (!atLast) {
                setActionButton('primary', true, '次へ', () => {
                    S.lineIndex += 1;
                    renderDialogue();
                    updateDialogueButtons();
                });
                setActionButton('secondary', false, '', null);
                return;
            }

            if (ep?.id && S.pendingWinner !== 'player') {
                setActionButton('primary', true, 'この話を再挑戦', () => startIntro(ep.id));
                setActionButton('secondary', true, 'エピソード選択へ', () => openSelection(''));
            } else {
                setActionButton('primary', true, 'エピソード選択へ', () => openSelection(`${ep?.title || ''}をクリアしました。`));
                setActionButton('secondary', false, '', null);
            }
            return;
        }

        setActionButton('primary', false, '', null);
        setActionButton('secondary', false, '', null);
    }

    function startIntro(episodeId) {
        const ep = getEpisode(episodeId);
        if (!ep || !ep.implemented) return setStoryMessage('この話は後日実装予定です。');
        if (!isUnlocked(ep)) return setStoryMessage('前の話をクリアすると解放されます。');
        if (!beforeStory(() => startIntro(episodeId))) return;
        playStorySceneBgm(ep.protagonist);

        S.phase = 'pre';
        S.episodeId = ep.id;
        S.lines = Array.isArray(ep.pre) ? ep.pre.slice() : [];
        S.lineIndex = 0;
        S.objectives = {};
        (ep.objectives || []).forEach(o => { S.objectives[o.key] = false; });
        S.battleActive = false;
        S.pendingWinner = null;
        S.modeLessonShown = false;
        setStoryActiveEpisodeContext(null);

        const list = byId('story-episode-list');
        if (list) list.classList.add('hidden');

        setStorySubtitle(`${ep.title} - 導入会話`);
        renderDialogue();
        showGuide();
        setStoryMessage('');
        updateDialogueButtons();
    }

    function startBattle(episodeId) {
        const ep = getEpisode(episodeId);
        if (!ep) return;
        if (!setupStoryBattle(ep)) {
            setStoryMessage('ストーリー対戦の初期化に失敗しました。');
            return;
        }

        const overlay = byId('start-overlay');
        if (overlay) overlay.classList.add('hidden');

        S.phase = 'battle';
        S.battleActive = true;
        S.pendingWinner = null;
        setStoryActiveEpisodeContext(ep.id);
        setHudVisible(true);
        refreshObjectiveViews();

        if (typeof window.addLog === 'function') window.addLog(`ストーリーモード開始: ${ep.title}`);
        if (ep.id === 'episode3' && typeof window.addLog === 'function') {
            window.addLog('チュートリアル: 中盤から再開。暁が1点リード、千鶴は通常料理あと1品でMode発動。');
            window.addLog('まずは1点料理を1つ完成させて、Battle à la carte Mode に入ろう。');
        }
        if (typeof window.updateUI === 'function') window.updateUI();
        if (ep.id === 'episode1') {
            if (typeof window.markTurnStartStatus === 'function') window.markTurnStartStatus(window.GameState.players.cpu, window.GameState.players.player);
            if (typeof window.cpuTurn === 'function') window.cpuTurn();
        } else if (typeof window.enablePlayerControls === 'function') window.enablePlayerControls();
    }

    function beginPost(episodeId, winner) {
        const ep = getEpisode(episodeId);
        if (!ep) return openSelection('');
        playStorySceneBgm(ep.protagonist);

        S.phase = 'post';
        S.episodeId = ep.id;
        S.pendingWinner = winner;
        S.lineIndex = 0;

        if (winner === 'player') {
            if (ep.id === 'episode1' && !S.progress.episode1) { S.progress.episode1 = true; saveProgress(); }
            if (ep.id === 'episode2' && !S.progress.episode2) { S.progress.episode2 = true; saveProgress(); }
            if (ep.id === 'episode3' && !S.progress.episode3) { S.progress.episode3 = true; saveProgress(); }
        }

        if (winner !== 'player' && Array.isArray(ep.postLose) && ep.postLose.length > 0) {
            S.lines = Array.isArray(ep.postLose) ? ep.postLose.slice() : [];
        } else {
            S.lines = Array.isArray(ep.postWin) ? ep.postWin.slice() : [];
        }

        const list = byId('story-episode-list');
        if (list) list.classList.add('hidden');
        setStorySubtitle(`${ep.title} - 終了会話`);
        renderDialogue();
        showGuide();

        if (ep.id === 'episode2' && winner === 'player') {
            S.objectives.winBattle = true;
            refreshObjectiveViews();
        }

        setStoryMessage(winner === 'player' ? 'ストーリー会話へ戻りました。' : '今回は敗北でした。再挑戦できます。');
        updateDialogueButtons();
    }

    function handleStoryBattleEnded(winner) {
        if (window.StoryAdv?.handleBattleEnded(winner)) return;
        if (!S.battleActive) return;
        const episodeId = S.episodeId;
        S.battleActive = false;
        S.pendingWinner = winner;
        window.__storyResultPending = true;
        setStoryActiveEpisodeContext(null);
        setHudVisible(false);

        storyResultTimer = setTimeout(() => {
            storyResultTimer = null;
            window.__storyResultPending = false;
            window.hideResultOverlay?.();
            const overlay = byId('start-overlay');
            if (overlay) overlay.classList.remove('hidden');
            showStartStage('start-story-stage');
            beginPost(episodeId, winner);
        }, 2900);
    }

    function openStoryStage() {
        if (window.StoryViewer?.active) return window.StoryViewer.open();
        if (!S.inited) init();
        openSelection('第1話から進めると、操作を順番に覚えやすいです。');
        window.CharacterNotice.showOnce();
    }

    function bindUi() {
        const list = byId('story-episode-list');
        if (list && !list.dataset.storyBound) {
            list.dataset.storyBound = '1';
            list.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-story-episode-id]');
                if (!button) return;
                const id = button.getAttribute('data-story-episode-id') || '';
                if (window.BattleStoryData?.get(id)) {
                    window.StoryAdv.start(id, button.getAttribute('data-story-resume') === '1');
                    return;
                }
                startIntro(id);
            });
        }

        const primary = byId('story-primary-button');
        if (primary && !primary.dataset.storyBound) {
            primary.dataset.storyBound = '1';
            primary.addEventListener('click', () => {
                if (typeof S.primaryAction === 'function') S.primaryAction();
            });
        }

        const secondary = byId('story-secondary-button');
        if (secondary && !secondary.dataset.storyBound) {
            secondary.dataset.storyBound = '1';
            secondary.addEventListener('click', () => {
                if (typeof S.secondaryAction === 'function') S.secondaryAction();
            });
        }

        const menuStory = byId('menu-story-button');
        if (menuStory && !menuStory.dataset.storyBound) {
            menuStory.dataset.storyBound = '1';
            menuStory.addEventListener('click', () => {
                openStoryStage();
            });
        }

        const backButton = byId('start-story-back-button');
        if (backButton && !backButton.dataset.storyBound) {
            backButton.dataset.storyBound = '1';
            backButton.addEventListener('click', () => {
                S.phase = 'select';
                S.episodeId = null;
                S.battleActive = false;
                S.pendingWinner = null;
                setStoryActiveEpisodeContext(null);
                setHudVisible(false);
            });
        }
    }

    function init() {
        if (S.inited) return;
        bindCharacterNotice();
        if (window.StoryViewer?.active) {
            S.inited = true;
            window.StoryViewer.init(EPISODES);
            return;
        }
        S.progress = loadProgress();
        bindUi();
        installObserver();
        installGuards();
        renderEpisodeList();
        S.inited = true;
    }

    window.BattleStoryProgress = Object.freeze({
        load: loadProgress,
        complete(id) {
            if (window.StoryViewer?.active) return;
            S.progress = { ...loadProgress(), [id]: true }; saveProgress();
        }
    });
    window.openStoryStage = openStoryStage;
    window.handleStoryBattleEnded = handleStoryBattleEnded;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
