let recipeBookRendered = false;
let eventBookRendered = false;
let packBookRendered = false;
let renderEventsBound = false;
const realtimeLogHistory = [];
const imageLoadCache = new Map();
let gameplayImagePreloadStarted = false;
let uiRenderInProgress = false;
let uiRenderQueued = false;
let uiRenderFrameRequested = false;
let lastUiRenderAt = 0;
const renderSectionSignatureCache = Object.create(null);
const PLAYER_DRAW_REVEAL_INTERVAL_MS = 500;
const OPPONENT_DRAW_REVEAL_INTERVAL_MS = 300;
let cardMotionState = {
    initialized: false,
    ownHandIds: new Set(),
    opponentHandIds: new Set(),
    discardIds: new Set(),
    discardCount: 0,
    ownDishKey: '',
    opponentDishKey: '',
    ownDishCount: 0,
    opponentDishCount: 0
};
let activeCardMotionFrame = null;
let packShopOpen = false;
const HORIZONTAL_SCROLL_ROW_IDS = [
    'player-hand-mixed',
    'cpu-hand-mixed',
    'player-set',
    'cpu-set',
    'player-packs',
    'cpu-packs'
];

const INGREDIENT_IMAGE_MAP = {
    'ごはん': 'rice.png',
    'のり': 'nori.png',
    'バナナ': 'banana.png',
    'カレー粉': 'curry.png',
    '鶏肉': 'chicken.png',
    '豚肉': 'pork.png',
    '牛肉': 'beef.png',
    '魚': 'fish.png',
    '牛乳': 'milk.png',
    '卵': 'egg.png',
    'キャベツ': 'cabbage.png',
    'にんじん': 'carrot.png',
    'じゃがいも': 'potato.png',
    'たまねぎ': 'onion.png',
    '大根': 'daikon.png'
};

const RECIPE_IMAGE_MAP = {
    'おにぎり': 'onigiri.png',
    '卵かけごはん': 'tamago-kake-gohan.png',
    '豚バラ大根': 'butabara-daikon.png',
    'ブリ大根': 'buri-daikon.png',
    'ロールキャベツ': 'roll-cabbage.png',
    'バナナジュース': 'banana-juice.png',
    '鮭おにぎり': 'sake-onigiri.png',
    '野菜炒め': 'yasai-itame.png',
    'チャーハン': 'chahan.png',
    '豪華チャーハン': 'gorgeous-chahan.png',
    'キーマカレー': 'keema-curry.png',
    '爆弾おにぎり': 'bakudan-onigiri.png',
    'オムライス': 'omurice.png',
    'ハンバーグ': 'hamburg-steak.png',
    '肉じゃが': 'nikujaga.png',
    'クリームシチュー': 'cream-stew.png',
    'カレー': 'curry-rice.png',
    '満腹カレー': 'manpuku-curry.png',
    '創作料理': 'sousaku-ryouri-special.png',
    '緊急料理': 'kinkyu-ryouri-special.png'
};

const EVENT_IMAGE_MAP = {
    '爆買い': 'bakugai.png',
    'ゴミ収集車': 'gomi-shushu-sha.png',
    '物々交換': 'monomono-kokan.png',
    'やっぱやめた': 'yappa-yameta.png',
    '大掃除': 'osouji.png',
    'やり直し': 'yarinaoshi.png',
    '緊急料理': 'kinkyu-chori.png',
    '食材探索': 'shokuzai-tansaku.png',
    '創作料理': 'sousaku-ryouri.png'
};

function byId(id) { return document.getElementById(id); }
function safeSetText(id, text) { const el = byId(id); if (el) el.textContent = text; }

function shouldSkipSectionRender(sectionKey, signature) {
    const key = String(sectionKey || '');
    const normalized = String(signature || '');
    if (renderSectionSignatureCache[key] === normalized) return true;
    renderSectionSignatureCache[key] = normalized;
    return false;
}

function getIngredientImagePath(cardName) {
    const fileName = INGREDIENT_IMAGE_MAP[cardName];
    return fileName ? BattleImages.lightPath(`assets/images/cards/${fileName}`) : null;
}

function getRecipeImagePath(recipeName) {
    const fileName = RECIPE_IMAGE_MAP[recipeName];
    return fileName ? BattleImages.lightPath(`assets/images/recipes/${fileName}`) : null;
}

function getEventImagePath(eventName) {
    const fileName = EVENT_IMAGE_MAP[eventName];
    return fileName ? BattleImages.lightPath(`assets/images/events/${fileName}`) : null;
}

function getPackImagePath(packKey) {
    const def = packDefinitions.find(item => item.key === packKey);
    const fileName = def?.imageFile;
    return fileName ? BattleImages.lightPath(`assets/images/packs/${fileName}`) : null;
}

function ensureImageCacheEntry(path) {
    if (!path || typeof path !== 'string') return null;

    const cached = imageLoadCache.get(path);
    if (cached) return cached;

    const entry = {
        status: 'loading',
        listeners: []
    };
    imageLoadCache.set(path, entry);

    const img = new Image();
    try { img.decoding = 'async'; } catch (_) {}

    entry.image = img;
    img.onload = async () => {
        try { await img.decode(); } catch (_) {}
        entry.decodedAt = performance.now();
        entry.status = 'loaded';
        const listeners = entry.listeners.splice(0);
        listeners.forEach(listener => {
            try { listener(true); } catch (_) {}
        });
    };

    img.onerror = () => {
        entry.status = 'error';
        const listeners = entry.listeners.splice(0);
        listeners.forEach(listener => {
            try { listener(false); } catch (_) {}
        });
    };

    img.src = path;
    return entry;
}

function getImageLoadStatus(path) {
    const entry = ensureImageCacheEntry(path);
    return entry ? entry.status : 'error';
}

function onImageLoadSettled(path, listener) {
    const entry = ensureImageCacheEntry(path);
    if (!entry) {
        listener(false);
        return;
    }
    if (entry.status === 'loaded') {
        listener(true);
        return;
    }
    if (entry.status === 'error') {
        listener(false);
        return;
    }
    entry.listeners.push(listener);
}

function scheduleGameplayImagePreload() {
    const model = getBattleViewModel();
    const cards = [...model.me.hand, ...model.me.events, ...model.me.set, ...model.opponent.set.filter(c => !c.hidden)];
    const paths = cards.map(c => c.type === 'ingredient' ? getIngredientImagePath(c.name) : getEventImagePath(c.name));
    for (const path of new Set(['assets/battle-images/card-back.webp', ...paths].filter(Boolean))) ensureImageCacheEntry(path);
}

function getBackgroundDesignCatalogSafe() {
    const fallback = [{
        key: 'default',
        label: 'デフォルト',
        description: '通常の背景',
        eventName: null,
        cost: 0,
        unlockedByDefault: true
    }];

    if (typeof getBackgroundDesignCatalog !== 'function') {
        return fallback;
    }

    const raw = getBackgroundDesignCatalog();
    if (!Array.isArray(raw) || raw.length === 0) {
        return fallback;
    }

    const normalized = raw
        .filter(item => item && typeof item === 'object' && typeof item.key === 'string')
        .map(item => ({
            key: item.key,
            label: String(item.label || item.eventName || item.key),
            description: String(item.description || ''),
            eventName: item.eventName ? String(item.eventName) : null,
            cost: Number.isFinite(Number(item.cost)) ? Math.max(0, Math.floor(Number(item.cost))) : 0,
            unlockedByDefault: item.unlockedByDefault === true || item.key === 'default'
        }));

    if (normalized.length === 0) return fallback;
    if (!normalized.some(item => item.key === 'default')) {
        normalized.unshift(fallback[0]);
    }
    return normalized;
}

function getBackgroundDesignByKeySafe(designKey, catalog = null) {
    const list = Array.isArray(catalog) ? catalog : getBackgroundDesignCatalogSafe();
    const key = String(designKey || '');
    return list.find(item => item.key === key) || list.find(item => item.key === 'default') || null;
}

function getUnlockedBackgroundDesignSet(profile, catalog) {
    const list = Array.isArray(catalog) ? catalog : getBackgroundDesignCatalogSafe();
    const unlockedSet = new Set();

    list.forEach(item => {
        if (item.unlockedByDefault || item.key === 'default') {
            unlockedSet.add(item.key);
        }
    });

    if (profile && Array.isArray(profile.unlockedBackgroundDesignKeys)) {
        profile.unlockedBackgroundDesignKeys.forEach(key => {
            if (list.some(item => item.key === key)) unlockedSet.add(key);
        });
    }

    if (!unlockedSet.has('default')) unlockedSet.add('default');
    return unlockedSet;
}

function getBackgroundDesignDisplayName(design) {
    if (!design || typeof design !== 'object') return '背景デザイン';
    return String(design.label || design.eventName || design.key || '背景デザイン');
}

function applyBackgroundDesign(designKey) {
    const container = byId('game-container');
    if (!container) return;

    const catalog = getBackgroundDesignCatalogSafe();
    const target = getBackgroundDesignByKeySafe(designKey, catalog);
    const imagePath = target && target.eventName ? getEventImagePath(target.eventName) : null;

    if (imagePath) {
        container.style.setProperty('--bg-design-image', `url("${imagePath}")`);
        container.classList.add('has-bg-design');
    } else {
        container.style.setProperty('--bg-design-image', 'none');
        container.classList.remove('has-bg-design');
    }
}

function getDetailedEventEffectText(eventName) {
    switch (eventName) {
        case 'ゴミ収集車': return '捨て札の材料カードを1枚選び、手札に加えます。';
        case '物々交換': return '相手の手札1枚を受け取り、自分の手札1枚を渡します。';
        case 'やっぱやめた': return '自分のセットカードをすべて手札に戻します。';
        case 'やり直し': return '自分の手札（材料）をすべて捨て、同枚数引き直します。';
        case '創作料理': return '点数6点以下で使用可能。材料2枚を捨てて3点獲得。このターンは通常料理できず、このターンで料理後は使用できません。';
        case '爆買い': return '山札から3枚引きます。';
        case '食材探索': return '山札の上3枚を見て、0〜2枚を手札に加えます。';
        case '大掃除': return '相手の手札とセットをすべて捨てさせます。';
        case '緊急料理': return '点数3点以下で使用可能。材料1枚を捨てて3点獲得。このターンは通常料理できず、このターンで料理後は使用できません。';
        default: return 'イベント効果説明なし';
    }
}

function getDetailedPackEffectText(packKey) {
    switch (packKey) {
        case 'ecoBag':
            return 'エンドフェイズの手札上限が2枚から3枚になります。';
        case 'freezer':
            return 'セットカード上限が2枚から3枚になります。';
        case 'board':
            return 'ドローフェイズの補充上限が手札合計6枚になります。';
        default:
            return '加工アイテム効果説明なし';
    }
}

function getPackConditionWarning(player, packKey) {
    const def = getPackDefinition(packKey);
    if (!def) return '加工アイテム情報が見つかりません。';
    if (hasPack(player, packKey)) return `「${def.name}」はすでに所持しています。`;
    if (player.score < def.cost) return `点数不足です（必要${def.cost}点）。`;
    return '';
}

function ensureUiState() {
    if (!GameState.ui) GameState.ui = {};
    if (typeof GameState.ui.pileViewType === 'undefined') GameState.ui.pileViewType = null;
    if (typeof GameState.ui.infoOverlayType === 'undefined') GameState.ui.infoOverlayType = null;
}

function ensureGameSettings() {
    if (!GameState.settings) GameState.settings = {};
    if (typeof GameState.settings.cpuSpeed === 'undefined') GameState.settings.cpuSpeed = 'default';
    if (typeof GameState.settings.cpuPersonality === 'undefined') GameState.settings.cpuPersonality = 'default';
    if (typeof GameState.settings.backgroundTheme === 'undefined') GameState.settings.backgroundTheme = 'default';
    if (typeof GameState.settings.backgroundDesign === 'undefined') GameState.settings.backgroundDesign = 'default';
    if (typeof GameState.settings.bgmEnabled === 'undefined') GameState.settings.bgmEnabled = true;
    if (typeof GameState.settings.bgmTrack === 'undefined') GameState.settings.bgmTrack = 'default';
    if (typeof GameState.settings.bgmVolume === 'undefined') GameState.settings.bgmVolume = 0.8;
    GameState.settings.bgmVolume = clampBgmVolumeSetting(GameState.settings.bgmVolume);
    return GameState.settings;
}

function clampBgmVolumeSetting(value) {
    const volume = Number(value);
    if (!Number.isFinite(volume)) return 0.8;
    return Math.max(0, Math.min(1, volume));
}

function applyBackgroundTheme(themeKey) {
    const container = byId('game-container');
    if (!container) return;

    container.classList.remove(
        'theme-default',
        'theme-white',
        'theme-sky',
        'theme-forest',
        'theme-sunset'
    );
    container.classList.add(`theme-${themeKey || 'default'}`);
}

function applyRuntimeSettings() {
    const settings = ensureGameSettings();
    const profile = typeof getUserProfile === 'function' ? getUserProfile() : null;
    const catalog = getBackgroundDesignCatalogSafe();
    const unlockedSet = getUnlockedBackgroundDesignSet(profile, catalog);

    if (profile?.selectedBackgroundDesignKey && unlockedSet.has(profile.selectedBackgroundDesignKey)) {
        settings.backgroundDesign = profile.selectedBackgroundDesignKey;
    }
    if (!unlockedSet.has(settings.backgroundDesign)) {
        settings.backgroundDesign = 'default';
    }

    applyBackgroundTheme(settings.backgroundTheme);
    applyBackgroundDesign(settings.backgroundDesign);

    if (typeof setBgmVolume === 'function') {
        setBgmVolume(clampBgmVolumeSetting(settings.bgmVolume));
        if (typeof getBgmVolume === 'function') {
            settings.bgmVolume = clampBgmVolumeSetting(getBgmVolume());
        }
    }
    if (typeof setBgmTrack === 'function') {
        setBgmTrack(settings.bgmTrack || 'default');
        if (typeof getCurrentBgmTrack === 'function') {
            settings.bgmTrack = getCurrentBgmTrack() || 'default';
        }
    }
    if (typeof setBgmEnabled === 'function') {
        setBgmEnabled(settings.bgmEnabled !== false);
    }
}

function getBgmTrackOptionsSafe() {
    if (typeof getBgmTrackOptions === 'function') {
        const options = getBgmTrackOptions();
        if (Array.isArray(options) && options.length > 0) return options;
    }
    return [{ key: 'default', label: '通常' }];
}

function buildPackReferenceHtml(pack) {
    const imagePath = getPackImagePath(pack.key);
    const artHtml = imagePath
        ? `<div class="reference-pack-art" style="background-image:url('${escapeHtml(imagePath)}')"></div>`
        : '';

    return `<div class="reference-item reference-pack-item">${artHtml}<div class="reference-pack-text"><div class="reference-title">${escapeHtml(pack.name)} (${pack.cost}点)</div><div>${escapeHtml(pack.description || '')}</div></div></div>`;
}

function bindSettingsOverlayControls() {
    const settings = ensureGameSettings();

    const resetButton = byId('settings-reset-button');
    const personalitySelect = byId('settings-cpu-personality');
    const speedSelect = byId('settings-cpu-speed');
    const bgThemeSelect = byId('settings-bg-theme');
    const bgDesignSelect = byId('settings-bg-design');
    const bgmEnabledSelect = byId('settings-bgm-enabled');
    const bgmTrackSelect = byId('settings-bgm-track');
    const bgmVolumeRange = byId('settings-bgm-volume');
    const bgmVolumeValue = byId('settings-bgm-volume-value');

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (typeof stopBGM === 'function') stopBGM();
            location.reload();
        });
    }

    if (personalitySelect) {
        const options = typeof getCpuPersonalityOptions === 'function'
            ? getCpuPersonalityOptions()
            : [{ key: 'default', label: '標準' }];
        const current = typeof normalizeCpuPersonalityKey === 'function'
            ? normalizeCpuPersonalityKey(settings.cpuPersonality)
            : (settings.cpuPersonality || 'default');
        personalitySelect.innerHTML = options
            .map(item => `<option value="${escapeHtml(item.key)}"${item.key === current ? ' selected' : ''}>${escapeHtml(item.label)}</option>`)
            .join('');
        personalitySelect.value = current;
        settings.cpuPersonality = current;

        personalitySelect.addEventListener('change', () => {
            const next = typeof normalizeCpuPersonalityKey === 'function'
                ? normalizeCpuPersonalityKey(personalitySelect.value)
                : (personalitySelect.value || 'default');
            settings.cpuPersonality = next;
            addLog(`設定: CPU性格を「${personalitySelect.options[personalitySelect.selectedIndex]?.text || next}」に変更しました。`);
            updateUI();
        });
    }

    if (speedSelect) {
        speedSelect.value = settings.cpuSpeed;
        speedSelect.addEventListener('change', () => {
            settings.cpuSpeed = speedSelect.value === 'fast' ? 'fast' : 'default';
            addLog(`設定: CPU処理速度を「${settings.cpuSpeed === 'fast' ? '処理最速' : 'デフォルト'}」に変更しました。`);
            updateUI();
        });
    }

    if (bgThemeSelect) {
        bgThemeSelect.value = settings.backgroundTheme;
        bgThemeSelect.addEventListener('change', () => {
            settings.backgroundTheme = bgThemeSelect.value || 'default';
            applyBackgroundTheme(settings.backgroundTheme);
            addLog('設定: 背景色テーマを変更しました。');
            updateUI();
        });
    }

    if (bgDesignSelect) {
        bgDesignSelect.value = settings.backgroundDesign || 'default';
        bgDesignSelect.addEventListener('change', () => {
            const selected = bgDesignSelect.value || 'default';
            let changed = true;

            if (typeof setSelectedBackgroundDesign === 'function') {
                const result = setSelectedBackgroundDesign(selected);
                changed = !!(result && result.ok);
            }

            if (!changed) {
                bgDesignSelect.value = settings.backgroundDesign || 'default';
                addLog('設定: 未所持の背景デザインは選択できません。');
                return;
            }

            settings.backgroundDesign = selected;
            const design = getBackgroundDesignByKeySafe(selected);
            applyBackgroundDesign(settings.backgroundDesign);
            addLog(`設定: 背景デザインを「${getBackgroundDesignDisplayName(design)}」に変更しました。`);
            updateUI();
        });
    }

    document.querySelectorAll('.settings-bg-buy-button[data-design-key]').forEach(button => {
        button.addEventListener('click', () => {
            const designKey = button.getAttribute('data-design-key') || '';
            if (typeof purchaseBackgroundDesign !== 'function') {
                addLog('設定: コイン交換機能が利用できません。');
                return;
            }

            const result = purchaseBackgroundDesign(designKey);
            if (!result || !result.ok) {
                if (result?.reason === 'not-enough-coins') {
                    addLog('設定: コインが不足しています。');
                } else if (result?.reason === 'already-owned') {
                    addLog('設定: その背景デザインはすでに所持しています。');
                } else {
                    addLog('設定: 背景デザインの交換に失敗しました。');
                }
                updateUI();
                return;
            }

            settings.backgroundDesign = designKey;
            if (typeof setSelectedBackgroundDesign === 'function') {
                setSelectedBackgroundDesign(designKey);
            }
            applyBackgroundDesign(settings.backgroundDesign);

            const designName = getBackgroundDesignDisplayName(result.design || getBackgroundDesignByKeySafe(designKey));
            addLog(`設定: 背景デザイン「${designName}」を交換しました（-${result.spentCoins || 0}コイン）。`);
            updateUI();
        });
    });

    if (bgmEnabledSelect) {
        bgmEnabledSelect.value = settings.bgmEnabled === false ? 'off' : 'on';
        bgmEnabledSelect.addEventListener('change', () => {
            settings.bgmEnabled = bgmEnabledSelect.value !== 'off';
            if (typeof setBgmEnabled === 'function') {
                setBgmEnabled(settings.bgmEnabled);
            }
            addLog(`設定: BGMを${settings.bgmEnabled ? 'ON' : 'OFF'}にしました。`);
            updateUI();
        });
    }

    if (bgmTrackSelect) {
        bgmTrackSelect.value = settings.bgmTrack || 'default';
        bgmTrackSelect.addEventListener('change', () => {
            const selected = bgmTrackSelect.value || 'default';
            const changed = typeof setBgmTrack === 'function' ? setBgmTrack(selected) : true;
            if (!changed) {
                bgmTrackSelect.value = settings.bgmTrack || 'default';
                addLog('設定: 選択したBGMはまだ使用できません。');
                return;
            }
            settings.bgmTrack = selected;
            addLog('設定: BGMタイプを変更しました。');
            updateUI();
        });
    }

    if (bgmVolumeRange) {
        const syncVolumeDisplay = () => {
            const percent = Math.round(clampBgmVolumeSetting(settings.bgmVolume) * 100);
            bgmVolumeRange.value = String(percent);
            if (bgmVolumeValue) bgmVolumeValue.textContent = `${percent}%`;
        };

        syncVolumeDisplay();

        const applyVolume = (withLog) => {
            const percent = Math.max(0, Math.min(100, Number(bgmVolumeRange.value)));
            let nextVolume = clampBgmVolumeSetting(percent / 100);
            if (typeof setBgmVolume === 'function') {
                nextVolume = clampBgmVolumeSetting(setBgmVolume(nextVolume));
            }
            settings.bgmVolume = nextVolume;
            if (bgmVolumeValue) bgmVolumeValue.textContent = `${Math.round(nextVolume * 100)}%`;
            if (withLog) {
                addLog(`設定: BGM音量を${Math.round(nextVolume * 100)}%に変更しました。`);
            }
        };

        bgmVolumeRange.addEventListener('input', () => applyVolume(false));
        bgmVolumeRange.addEventListener('change', () => {
            applyVolume(true);
            updateUI();
        });
    }
}

function bindRenderEventsOnce() {
    if (renderEventsBound) return;
    renderEventsBound = true;

    const deckButton = byId('deck-pile-button');
    const discardButton = byId('discard-pile-button');
    const pileViewClose = byId('pile-view-close-button');
    const dishHistoryClose = byId('dish-history-close-button');
    const packShopButton = byId('open-pack-shop-button');
    const packShopClose = byId('pack-shop-close-button');
    const packShopOverlay = byId('pack-shop-overlay');

    const recipesTab = byId('open-recipes-tab');
    const eventsTab = byId('open-events-tab');
    const packsTab = byId('open-packs-tab');
    const rulesTab = byId('open-rules-tab');
    const settingsTab = byId('open-settings-tab');
    const logTab = byId('open-log-tab');
    const realtimeLogPanel = byId('realtime-log-panel');
    const infoOverlay = byId('info-overlay');
    const infoOverlayClose = byId('info-overlay-close-button');

    if (deckButton) deckButton.addEventListener('click', () => requestPileView('deck'));
    if (discardButton) discardButton.addEventListener('click', () => requestPileView('discard'));
    if (pileViewClose) pileViewClose.addEventListener('click', closePileView);
    if (dishHistoryClose) dishHistoryClose.addEventListener('click', closeDishHistory);
    if (packShopButton) packShopButton.addEventListener('click', openPackShop);
    if (packShopClose) packShopClose.addEventListener('click', closePackShop);
    if (packShopOverlay) packShopOverlay.addEventListener('click', e => { if (e.target === packShopOverlay) closePackShop(); });

    if (recipesTab) recipesTab.addEventListener('click', () => openInfoOverlay('recipes'));
    if (eventsTab) eventsTab.addEventListener('click', () => openInfoOverlay('events'));
    if (packsTab) packsTab.addEventListener('click', () => openInfoOverlay('packs'));
    if (rulesTab) rulesTab.addEventListener('click', () => openInfoOverlay('rules'));
    if (settingsTab) settingsTab.addEventListener('click', () => openInfoOverlay('settings'));
    if (logTab) logTab.addEventListener('click', () => openInfoOverlay('log'));
    if (realtimeLogPanel) {
        realtimeLogPanel.addEventListener('click', () => openInfoOverlay('log'));
        realtimeLogPanel.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openInfoOverlay('log');
            }
        });
    }
    if (infoOverlayClose) infoOverlayClose.addEventListener('click', closeInfoOverlay);
    if (infoOverlay) infoOverlay.addEventListener('click', e => { if (e.target === infoOverlay) closeInfoOverlay(); });

    setupHorizontalScrollRows();
}

function enableHorizontalDragScroll(container) {
    if (!container || container.dataset.dragScrollReady === '1') return;
    container.dataset.dragScrollReady = '1';

    let activePointerId = null;
    let startX = 0;
    let startLeft = 0;
    let moved = false;
    let suppressClickUntil = 0;

    const clearDragState = () => {
        activePointerId = null;
        container.classList.remove('is-drag-scrolling');
    };

    container.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (container.scrollWidth <= container.clientWidth + 1) return;

        activePointerId = event.pointerId;
        startX = event.clientX;
        startLeft = container.scrollLeft;
        moved = false;
        container.classList.add('is-drag-scrolling');

        if (typeof container.setPointerCapture === 'function') {
            try {
                container.setPointerCapture(event.pointerId);
            } catch (_) {
                // noop
            }
        }
    }, { passive: true });

    container.addEventListener('pointermove', event => {
        if (activePointerId === null || event.pointerId !== activePointerId) return;

        const dx = event.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        if (!moved) return;

        container.scrollLeft = startLeft - dx;
        event.preventDefault();
    }, { passive: false });

    const finishPointer = event => {
        if (activePointerId === null || event.pointerId !== activePointerId) return;
        if (moved) suppressClickUntil = Date.now() + 120;
        clearDragState();
    };

    container.addEventListener('pointerup', finishPointer);
    container.addEventListener('pointercancel', finishPointer);
    container.addEventListener('lostpointercapture', clearDragState);

    container.addEventListener('click', event => {
        if (Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    container.addEventListener('wheel', event => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        if (container.scrollWidth <= container.clientWidth + 1) return;

        container.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive: false });
}

function setupHorizontalScrollRows() {
    HORIZONTAL_SCROLL_ROW_IDS.forEach(id => {
        enableHorizontalDragScroll(byId(id));
    });
}

function openInfoOverlay(type) { ensureUiState(); GameState.ui.infoOverlayType = type; updateUI(); }
function closeInfoOverlay() { ensureUiState(); GameState.ui.infoOverlayType = null; updateUI(); }

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderInfoOverlay() {
    ensureUiState();
    const overlay = byId('info-overlay');
    const title = byId('info-overlay-title');
    const content = byId('info-overlay-content');
    if (!overlay || !title || !content) return;

    const type = GameState.ui.infoOverlayType;
    if (!type) {
        overlay.classList.add('hidden');
        content.innerHTML = '';
        return;
    }

    overlay.classList.remove('hidden');

    if (type === 'recipes') {
        title.textContent = '料理一覧';
        content.innerHTML = recipes.map(r => `<div class="reference-item"><div class="reference-title">${escapeHtml(r.name)} (${r.points}点)</div><div>必要: ${escapeHtml(r.required.join(' + '))}</div></div>`).join('');
        return;
    }

    if (type === 'events') {
        title.textContent = 'イベント一覧';
        content.innerHTML = eventDefinitions.map(e => `<div class="reference-item"><div class="reference-title">${escapeHtml(e.name)}</div><div>${escapeHtml(e.description || '')}</div></div>`).join('');
        return;
    }

    if (type === 'packs') {
        title.textContent = '加工一覧';
        content.innerHTML = packDefinitions.map(buildPackReferenceHtml).join('');
        return;
    }

    if (type === 'rules') {
        title.textContent = 'ルール';
        const s = byId('mini-rule-simple')?.innerHTML || [
            '・先に10点獲得したら勝利',
            '・イベントカードは1ターンに1回まで使用可能',
            '・ターン終了時、手札は通常2枚まで。エコバッグ所持時は3枚まで残せます',
            '・セットカードも料理の材料に使えます',
            '・山札がなくなったら捨て札を混ぜて再利用します'
        ].join('<br>');
        const d = byId('mini-rule-detail')?.innerHTML || [
            '・手札は「材料カード」と「イベントカード」を合わせた合計枚数で管理します',
            '・ドローフェイズでは通常、合計5枚になるまで補充します',
            '・「まな板」を持っている場合、合計6枚まで補充します',
            '・材料カードはセットできますが、イベントカードはセットできません',
            '・セット上限は通常2枚、「冷蔵庫」があれば3枚です',
            '・「緊急料理」は3点以下、「創作料理」は6点以下でのみ使用できます'
        ].join('<br>');
        const sp = byId('mini-rule-special')?.innerHTML || [
            '・料理の達人: 鶏肉・豚肉・牛肉・魚を使う料理をそれぞれ1つ以上作り、合計7点以上で即勝利',
            '・満腹マスター: ターン開始時に点数で負けている状態から、その1ターン中に3つ以上料理を完成すると即勝利'
        ].join('<br>');
        const battleMode = [
            '・この試合で「通常料理」を5個完成すると「Battle à la carte Mode」に突入します',
            '・「緊急料理」「創作料理」は5個カウントに含まれません',
            '・Mode中は自分のメインフェイズに1回、1点料理完成時に追加で1ドローできます',
            '・Mode中はドローフェイズ後、毎ターン1回だけ捨て札から好きな材料カード1枚を手札に回収できます',
            '・Mode効果は試合終了まで継続します'
        ].join('<br>');
        const flow = 'ドローフェイズ → 料理＆セット＆イベント発動フェイズ → エンドフェイズ → 手札調整フェイズ';
        const skillDefs = typeof getSkillDefinitions === 'function' ? getSkillDefinitions() : [];
        const skillHtml = Array.isArray(skillDefs) && skillDefs.length > 0
            ? skillDefs.map(skill => {
                const maxUses = Number.isFinite(Number(skill.maxUses)) ? Math.max(1, Math.floor(Number(skill.maxUses))) : 1;
                return `<div class="reference-item"><div class="reference-title">${escapeHtml(skill.name || 'スキル')}</div><div>条件: ${escapeHtml(skill.condition || 'なし')}</div><div>効果: ${escapeHtml(skill.effect || 'なし')}</div><div>使用回数: ${maxUses}回</div></div>`;
            }).join('')
            : '<div>スキル情報はまだありません。</div>';
        content.innerHTML = `<div class="info-rule-block"><div class="info-rule-title">フェイズ進行</div><div>${flow}</div></div><div class="info-rule-block"><div class="info-rule-title">かんたんルール</div><div>${s}</div></div><div class="info-rule-block"><div class="info-rule-title">詳細ルール</div><div>${d}</div></div><div class="info-rule-block"><div class="info-rule-title">特殊勝利条件</div><div>${sp}</div></div><div class="info-rule-block"><div class="info-rule-title">Battle à la carte Mode</div><div>${battleMode}</div></div><div class="info-rule-block"><div class="info-rule-title">スキル一覧</div><div>${skillHtml}</div></div>`;
        return;
    }

    if (type === 'settings') {
        const settings = ensureGameSettings();
        const profile = typeof getUserProfile === 'function' ? getUserProfile() : null;
        const bgDesignCatalog = getBackgroundDesignCatalogSafe();
        const unlockedBgDesignSet = getUnlockedBackgroundDesignSet(profile, bgDesignCatalog);

        if (profile?.selectedBackgroundDesignKey && unlockedBgDesignSet.has(profile.selectedBackgroundDesignKey)) {
            settings.backgroundDesign = profile.selectedBackgroundDesignKey;
        }
        if (!unlockedBgDesignSet.has(settings.backgroundDesign)) {
            settings.backgroundDesign = 'default';
        }

        const bgDesignOptions = bgDesignCatalog
            .filter(item => unlockedBgDesignSet.has(item.key))
            .map(item => `<option value="${escapeHtml(item.key)}"${item.key === settings.backgroundDesign ? ' selected' : ''}>${escapeHtml(getBackgroundDesignDisplayName(item))}</option>`)
            .join('');

        const lockedBgDesigns = bgDesignCatalog.filter(item => item.key !== 'default' && !unlockedBgDesignSet.has(item.key));
        const coinCount = Number.isFinite(Number(profile?.coins)) ? Math.max(0, Math.floor(Number(profile.coins))) : 0;
        const lockedBgDesignHtml = lockedBgDesigns.length === 0
            ? '<div class="settings-note">背景デザインはすべて交換済みです。</div>'
            : lockedBgDesigns.map(item => {
                const thumbPath = item.eventName ? getEventImagePath(item.eventName) : null;
                const thumbHtml = thumbPath
                    ? `<div class="settings-bg-thumb" style="background-image:url('${escapeHtml(thumbPath)}')"></div>`
                    : '<div class="settings-bg-thumb"></div>';
                return `<div class="settings-bg-shop-item">${thumbHtml}<div class="settings-bg-shop-meta"><div class="settings-bg-shop-name">${escapeHtml(getBackgroundDesignDisplayName(item))}</div><div class="settings-bg-shop-desc">${escapeHtml(item.description || '')}</div></div><button class="settings-bg-buy-button" data-design-key="${escapeHtml(item.key)}">交換 (${item.cost}コイン)</button></div>`;
            }).join('');

        const bgmTrackOptions = getBgmTrackOptionsSafe()
            .map(item => `<option value="${escapeHtml(item.key)}"${item.key === settings.bgmTrack ? ' selected' : ''}>${escapeHtml(item.label)}</option>`)
            .join('');
        const bgmVolumePercent = Math.round(clampBgmVolumeSetting(settings.bgmVolume) * 100);
        const personalityOptions = (typeof getCpuPersonalityOptions === 'function' ? getCpuPersonalityOptions() : [{ key: 'default', label: '標準' }])
            .map(item => `<option value="${escapeHtml(item.key)}"${item.key === (typeof normalizeCpuPersonalityKey === 'function' ? normalizeCpuPersonalityKey(settings.cpuPersonality) : (settings.cpuPersonality || 'default')) ? ' selected' : ''}>${escapeHtml(item.label)}</option>`)
            .join('');

        title.textContent = '設定';
        content.innerHTML = `
            <div class="settings-group">
                <div class="reference-item" data-cpu-only>
                    <div class="reference-title">リセット</div>
                    <button id="settings-reset-button" class="settings-reset-button">ゲームをリセット</button>
                    <div class="settings-note">ゲーム状態を初期化して最初からやり直します。</div>
                </div>

                <div class="reference-item" data-cpu-only>
                    <div class="reference-title">CPU設定</div>
                    <label class="settings-label" for="settings-cpu-personality">CPUキャラの性格</label>
                    <select id="settings-cpu-personality" class="settings-select">${personalityOptions}</select>
                    <div class="settings-note">逆転型は爆弾おにぎり系の逆転ルートを優先します。</div>

                    <label class="settings-label" for="settings-cpu-speed">CPUキャラの処理速度</label>
                    <select id="settings-cpu-speed" class="settings-select">
                        <option value="default"${settings.cpuSpeed === 'default' ? ' selected' : ''}>デフォルト</option>
                        <option value="fast"${settings.cpuSpeed === 'fast' ? ' selected' : ''}>処理最速</option>
                    </select>
                    <div class="settings-note">「処理最速」はCPUの待機時間を0にして即時進行します。</div>
                </div>

                <div class="reference-item">
                    <div class="reference-title">背景設定</div>
                    <label class="settings-label" for="settings-bg-theme">背景の色</label>
                    <select id="settings-bg-theme" class="settings-select">
                        <option value="default"${settings.backgroundTheme === 'default' ? ' selected' : ''}>デフォルト</option>
                        <option value="white"${settings.backgroundTheme === 'white' ? ' selected' : ''}>ホワイト</option>
                        <option value="sky"${settings.backgroundTheme === 'sky' ? ' selected' : ''}>スカイ</option>
                        <option value="forest"${settings.backgroundTheme === 'forest' ? ' selected' : ''}>フォレスト</option>
                        <option value="sunset"${settings.backgroundTheme === 'sunset' ? ' selected' : ''}>サンセット</option>
                    </select>

                    <label class="settings-label" for="settings-bg-design">背景デザイン</label>
                    <select id="settings-bg-design" class="settings-select">${bgDesignOptions}</select>
                    <div class="settings-note">所持コイン: ${coinCount}</div>

                    <div class="settings-bg-shop">
                        <div class="settings-bg-shop-title">背景デザイン交換（イベントアート）</div>
                        ${lockedBgDesignHtml}
                    </div>
                </div>

                <div class="reference-item">
                    <div class="reference-title">サウンド設定</div>
                    <label class="settings-label" for="settings-bgm-enabled">BGMオン/オフ</label>
                    <select id="settings-bgm-enabled" class="settings-select">
                        <option value="on"${settings.bgmEnabled !== false ? ' selected' : ''}>ON</option>
                        <option value="off"${settings.bgmEnabled === false ? ' selected' : ''}>OFF</option>
                    </select>

                    <label class="settings-label" for="settings-bgm-track">BGM切り替え</label>
                    <select id="settings-bgm-track" class="settings-select">${bgmTrackOptions}</select>
                    <label class="settings-label" for="settings-bgm-volume">BGM音量</label>
                    <div class="settings-range-row">
                        <input id="settings-bgm-volume" class="settings-range" type="range" min="0" max="100" step="1" value="${bgmVolumePercent}">
                        <div id="settings-bgm-volume-value" class="settings-range-value">${bgmVolumePercent}%</div>
                    </div>
                    <div class="settings-note">0%で無音、100%で最大です。</div>
                </div>
            </div>
        `;
        bindSettingsOverlayControls();
        return;
    }

    title.textContent = 'ログ';
    content.innerHTML = realtimeLogHistory.map(l => `<div class="info-log-entry">${escapeHtml(l)}</div>`).join('') || '<div class="info-log-entry">ログはまだありません。</div>';
}

function updateCharacterFaces() {
    const p = document.querySelector('.player-icon');
    const c = document.querySelector('.cpu-icon');
    if (!p || !c) return;

    p.classList.remove('face-normal', 'face-happy', 'face-worried');
    c.classList.remove('face-normal', 'face-happy', 'face-worried');

    const ps = getBattleViewModel().me.score;
    const cs = getBattleViewModel().opponent.score;
    const diff = ps - cs;

    let pf = 'face-normal';
    let cf = 'face-normal';

    // 表情変化は「5点を超えてから」（= 6点以上）開始
    if (ps > 5 || cs > 5) {
        if (diff > 0) {
            pf = 'face-happy';
            cf = 'face-worried';
        } else if (diff < 0) {
            pf = 'face-worried';
            cf = 'face-happy';
        }
    }

    p.classList.add(pf);
    c.classList.add(cf);
}

function applyCharacterSkins() {
    const playerIcon = document.querySelector('.player-icon');
    const cpuIcon = document.querySelector('.cpu-icon');
    if (!playerIcon || !cpuIcon) return;

    const model = getBattleViewModel();
    const classes = ['char-chizuru', 'char-mai', 'char-takumi', 'char-akatsuki'];

    playerIcon.classList.remove(...classes);
    cpuIcon.classList.remove(...classes);

    playerIcon.classList.add(`char-${model.me.characterId || 'chizuru'}`);
    cpuIcon.classList.add(`char-${model.opponent.characterId || 'mai'}`);

    const playerModeOn = !!model.me.battleALaCarteModeActive;
    const cpuModeOn = !!model.opponent.battleALaCarteModeActive;
    playerIcon.classList.toggle('battle-mode-chef', playerModeOn);
    cpuIcon.classList.toggle('battle-mode-chef', cpuModeOn);
}

function createCardTextBlock(card, cardEl) {
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = card.name;

    const desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.textContent = card.description || (card.type === 'ingredient' ? '材料カード' : '');

    cardEl.appendChild(title);
    cardEl.appendChild(desc);
}

function createImageCard(card, cardEl, imagePath, fallbackClassName = '') {
    const art = document.createElement('div');
    art.className = 'card-art';
    art.style.backgroundImage = `url("${imagePath}")`;

    const namePlate = document.createElement('div');
    namePlate.className = 'card-name-plate';
    namePlate.textContent = card.name;

    cardEl.appendChild(art);
    cardEl.appendChild(namePlate);

    const applyFallback = () => {
        if (cardEl.dataset.imageFallbackApplied === '1') return;
        cardEl.dataset.imageFallbackApplied = '1';
        cardEl.innerHTML = '';
        cardEl.classList.remove('has-image');
        if (fallbackClassName) cardEl.className = `card ${fallbackClassName}`;
        createCardTextBlock(card, cardEl);
    };

    const status = getImageLoadStatus(imagePath);
    if (status === 'error') {
        applyFallback();
        return;
    }

    cardEl.classList.add('has-image');
    if (status === 'loading') {
        onImageLoadSettled(imagePath, ok => {
            if (!ok) applyFallback();
        });
    }
}

function createFaceCard(card, extraClass) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${extraClass || ''}`;
    if (card?.id != null) cardEl.dataset.cardId = String(card.id);

    if (card.type === 'ingredient') {
        const path = getIngredientImagePath(card.name);
        if (path) { createImageCard(card, cardEl, path, extraClass); return cardEl; }
    }

    if (card.type === 'event') {
        const path = getEventImagePath(card.name);
        if (path) { createImageCard(card, cardEl, path, extraClass); return cardEl; }
    }

    createCardTextBlock(card, cardEl);
    return cardEl;
}

function createBackCard(titleText, descText, cardId = null) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card card-back';
    if (cardId != null) cardEl.dataset.cardId = String(cardId);

    const title = document.createElement('div');
    title.className = 'card-title card-back-label';
    title.textContent = titleText;

    const desc = document.createElement('div');
    desc.className = 'card-desc card-back-label';
    desc.innerHTML = descText;

    cardEl.appendChild(title);
    cardEl.appendChild(desc);
    return cardEl;
}

function getMotionCardIds(cards) {
    return new Set((Array.isArray(cards) ? cards : [])
        .map(card => card?.id == null ? null : String(card.id))
        .filter(Boolean));
}

function getLatestDishMotionState(player) {
    const dishes = Array.isArray(player?.cookedRecipes) ? player.cookedRecipes : [];
    const dish = dishes[0] || null;
    const key = dish ? `${dish.name || ''}:${dish.cookedAt || ''}:${dishes.length}` : '';
    return { dish, key, count: dishes.length };
}

function beginCardMotionFrame() {
    const model = getBattleViewModel();
    const ownCards = [...(model.me.hand || []), ...(model.me.events || [])];
    const opponentCards = [...(model.opponent.hand || []), ...(model.opponent.events || [])];
    const discardCards = Array.isArray(GameState.discard) ? GameState.discard : [];
    const ownHandIds = getMotionCardIds(ownCards);
    const opponentHandIds = getMotionCardIds(opponentCards);
    const discardIds = getMotionCardIds(discardCards);
    const ownDish = getLatestDishMotionState(model.me);
    const opponentDish = getLatestDishMotionState(model.opponent);
    const previousNodes = new Map();
    for (const element of document.querySelectorAll('[data-card-id]')) {
        const id = element.dataset.cardId;
        if (!id || previousNodes.has(id)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) previousNodes.set(id, { rect, clone: element.cloneNode(true) });
    }

    const newOwnIds = new Set([...ownHandIds].filter(id => !cardMotionState.initialized || !cardMotionState.ownHandIds.has(id)));
    const newOpponentIds = new Set([...opponentHandIds].filter(id => !cardMotionState.initialized || !cardMotionState.opponentHandIds.has(id)));
    const newDiscardCards = cardMotionState.initialized
        ? discardCards.filter(card => card?.id != null && !cardMotionState.discardIds.has(String(card.id)))
        : [];
    const unidentifiedIncrease = cardMotionState.initialized
        ? Math.max(0, discardCards.length - cardMotionState.discardCount - newDiscardCards.length)
        : 0;
    const ownDishChanged = cardMotionState.initialized && ownDish.dish &&
        (ownDish.count > cardMotionState.ownDishCount || ownDish.key !== cardMotionState.ownDishKey);
    const opponentDishChanged = cardMotionState.initialized && opponentDish.dish &&
        (opponentDish.count > cardMotionState.opponentDishCount || opponentDish.key !== cardMotionState.opponentDishKey);
    const cookedDish = ownDishChanged
        ? { side: 'player', dish: ownDish.dish }
        : (opponentDishChanged ? { side: 'opponent', dish: opponentDish.dish } : null);
    let fusionTransfers = [];
    if (cookedDish) {
        fusionTransfers = newDiscardCards
            .filter(card => card?.type === 'ingredient')
            .map(card => ({ card, source: previousNodes.get(String(card.id)) || null }));
        if (fusionTransfers.length === 0 && Array.isArray(cookedDish.dish?.required)) {
            fusionTransfers = cookedDish.dish.required.map((name, index) => ({
                card: { id: `fusion-${index}`, type: 'ingredient', name },
                source: null
            }));
        }
    }
    const fusionIds = new Set(fusionTransfers.map(item => item.card?.id).filter(Boolean).map(String));

    activeCardMotionFrame = {
        newOwnIds,
        newOpponentIds,
        next: {
            ownHandIds,
            opponentHandIds,
            discardIds,
            discardCount: discardCards.length,
            ownDishKey: ownDish.key,
            opponentDishKey: opponentDish.key,
            ownDishCount: ownDish.count,
            opponentDishCount: opponentDish.count
        },
        cookingFusion: cookedDish && fusionTransfers.length > 0
            ? { ...cookedDish, transfers: fusionTransfers }
            : null,
        discardTransfers: [
            ...newDiscardCards
                .filter(card => !fusionIds.has(String(card?.id)))
                .map(card => ({ card, source: previousNodes.get(String(card.id)) || null })),
            ...Array.from({ length: unidentifiedIncrease }, () => ({ card: null, source: null }))
        ]
    };
}

function markCardDrawArrival(element, order, intervalMs) {
    if (!element) return;
    element.classList.add('card-draw-enter');
    element.style.setProperty('--card-draw-delay', `${Math.max(0, order) * intervalMs}ms`);
    element.addEventListener('animationend', () => {
        element.classList.remove('card-draw-enter');
        element.style.removeProperty('--card-draw-delay');
    }, { once: true });
}

function animateCookingFusion(fusion) {
    if (!fusion?.dish || !Array.isArray(fusion.transfers) || fusion.transfers.length === 0) return;
    const discardTarget = byId('discard-pile-button')?.getBoundingClientRect();
    if (!discardTarget || discardTarget.width <= 0 || discardTarget.height <= 0) return;
    const fallbackElement = byId(fusion.side === 'opponent' ? 'cpu-hand-mixed' : 'player-hand-mixed');
    const fallbackRect = fallbackElement?.getBoundingClientRect() || byId('deck-pile-button')?.getBoundingClientRect() || discardTarget;
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    fusion.transfers.forEach((transfer, index) => {
        const sourceRect = transfer.source?.rect || fallbackRect;
        const material = transfer.source?.clone || createFaceCard(transfer.card, 'ingredient-card');
        material.classList.remove('selected-card', 'card-draw-enter');
        material.classList.add('cooking-fusion-material');
        material.removeAttribute('id');
        material.style.left = `${sourceRect.left}px`;
        material.style.top = `${sourceRect.top}px`;
        material.style.width = `${sourceRect.width}px`;
        material.style.height = `${sourceRect.height}px`;
        material.style.setProperty('--fusion-x', `${center.x - (sourceRect.left + sourceRect.width / 2)}px`);
        material.style.setProperty('--fusion-y', `${center.y - (sourceRect.top + sourceRect.height / 2)}px`);
        material.style.setProperty('--fusion-delay', `${index * 70}ms`);
        document.body.appendChild(material);
        setTimeout(() => material.remove(), 720 + index * 70);
    });

    setTimeout(() => {
        const width = Math.max(70, Math.min(118, fallbackRect.width || 92));
        const height = width * 1.42;
        const result = document.createElement('div');
        result.className = 'card recipe-card cooking-fusion-result';
        const imagePath = getRecipeImagePath(fusion.dish.name);
        if (imagePath) createImageCard({ name: fusion.dish.name }, result, imagePath, 'recipe-card');
        else createCardTextBlock({ name: fusion.dish.name, description: `${fusion.dish.points || 0}点` }, result);
        const left = center.x - width / 2;
        const top = center.y - height / 2;
        result.style.left = `${left}px`;
        result.style.top = `${top}px`;
        result.style.width = `${width}px`;
        result.style.height = `${height}px`;
        result.style.setProperty('--fusion-discard-x', `${discardTarget.left + discardTarget.width / 2 - center.x}px`);
        result.style.setProperty('--fusion-discard-y', `${discardTarget.top + discardTarget.height / 2 - center.y}px`);
        document.body.appendChild(result);
        setTimeout(() => result.remove(), 1050);
    }, 520 + Math.max(0, fusion.transfers.length - 1) * 70);
}

function animateDiscardTransfers(transfers) {
    if (!Array.isArray(transfers) || transfers.length === 0) return;
    const target = byId('discard-pile-button')?.getBoundingClientRect();
    if (!target || target.width <= 0 || target.height <= 0) return;
    const fallback = byId('deck-pile-button')?.getBoundingClientRect() || target;

    transfers.forEach((transfer, index) => {
        const sourceRect = transfer.source?.rect || fallback;
        const ghost = transfer.source?.clone || createBackCard('捨て札', '移動中');
        ghost.classList.remove('selected-card', 'card-draw-enter');
        ghost.classList.add('card-discard-ghost');
        ghost.removeAttribute('id');
        ghost.style.left = `${sourceRect.left}px`;
        ghost.style.top = `${sourceRect.top}px`;
        ghost.style.width = `${sourceRect.width}px`;
        ghost.style.height = `${sourceRect.height}px`;
        ghost.style.setProperty('--discard-flight-x', `${target.left + target.width / 2 - (sourceRect.left + sourceRect.width / 2)}px`);
        ghost.style.setProperty('--discard-flight-y', `${target.top + target.height / 2 - (sourceRect.top + sourceRect.height / 2)}px`);
        ghost.style.setProperty('--discard-flight-delay', `${index * 90}ms`);
        document.body.appendChild(ghost);
        setTimeout(() => ghost.remove(), 900 + index * 90);
    });
}

function finishCardMotionFrame() {
    const frame = activeCardMotionFrame;
    activeCardMotionFrame = null;
    if (!frame) return;
    animateCookingFusion(frame.cookingFusion);
    animateDiscardTransfers(frame.discardTransfers);
    cardMotionState = { initialized: true, ...frame.next };
}

function renderPlayerMixedHand() {
    const container = byId('player-hand-mixed');
    if (!container) return;

    const player = getBattleViewModel().me;
    const cards = [
        ...player.hand.map(card => ({ ...card, zoneType: 'ingredient' })),
        ...player.events.map(card => ({ ...card, zoneType: 'event' }))
    ];
    const signature = [
        cards.map(card => `${card.id}:${card.type}:${card.name}`).join('|'),
        GameState.selectionMode || '',
        (GameState.selectedCardIds || []).join(','),
        getBattleViewModel().turn || '',
        GameState.gameEnded ? '1' : '0'
    ].join('::');
    if (shouldSkipSectionRender('player-hand-mixed', signature)) return;

    container.innerHTML = '';

    if (cards.length === 0) { container.textContent = '手札なし'; return; }

    let drawOrder = 0;
    cards.forEach(card => {
        const className = card.type === 'event' ? 'event-card' : 'ingredient-card';
        const el = createFaceCard(card, className);
        if (activeCardMotionFrame?.newOwnIds.has(String(card.id))) markCardDrawArrival(el, drawOrder++, PLAYER_DRAW_REVEAL_INTERVAL_MS);
        window.CardDragActions?.mark(el, card);

        if (GameState.selectionMode === 'discard' && GameState.selectedCardIds.includes(card.id)) el.classList.add('selected-card');

        if (getBattleViewModel().turn === 'me' && !GameState.gameEnded) {
            el.addEventListener('click', () => {
                if (GameState.selectionMode === 'discard') toggleDiscardSelection(card.id);
                else if (!GameState.selectionMode && card.type === 'ingredient') openIngredientAction(card.id, 'hand');
                else if (!GameState.selectionMode && card.type === 'event') playerUseEvent(card.id);
            });
        }

        container.appendChild(el);
    });
}

function renderPlayerSet() {
    const container = byId('player-set');
    if (!container) return;

    const player = getBattleViewModel().me;
    const signature = [
        player.set.map(card => `${card.id}:${card.name}:${card.trapLocked === true ? 1 : 0}:${card.blockedByTrap === true ? 1 : 0}`).join('|'),
        GameState.selectionMode || '',
        GameState.gameEnded ? '1' : '0'
    ].join('::');
    if (shouldSkipSectionRender('player-set', signature)) return;

    container.innerHTML = '';

    if (player.set.length === 0) { container.textContent = 'セットなし'; return; }

    player.set.forEach(card => {
        const isTrap = card.trapLocked === true || card.blockedByTrap === true;
        const description = isTrap
            ? 'トラップ状態のため料理に使えません。'
            : 'セット中の材料カード';
        const className = isTrap ? 'ingredient-card trap-locked-card' : 'ingredient-card';
        const el = createFaceCard({ ...card, description }, className);
        if (!GameState.selectionMode && !GameState.gameEnded && !isTrap) {
            el.addEventListener('click', () => openIngredientAction(card.id, 'set'));
        }
        container.appendChild(el);
    });
}

function renderOpponentMixedHand() {
    const container = byId('cpu-hand-mixed');
    if (!container) return;

    const cpu = getBattleViewModel().opponent;
    const total = cpu.hand.length + cpu.events.length;
    const signature = `${cpu.hand.length}:${cpu.events.length}`;
    if (shouldSkipSectionRender('cpu-hand-mixed', signature)) return;

    container.innerHTML = '';

    if (total === 0) { container.textContent = 'なし'; return; }
    let drawOrder = 0;
    const cards = [...cpu.hand, ...cpu.events];
    cards.forEach(card => {
        const el = createBackCard(getBattleViewModel().opponentLabel, '手札', card.id);
        if (activeCardMotionFrame?.newOpponentIds.has(String(card.id))) markCardDrawArrival(el, drawOrder++, OPPONENT_DRAW_REVEAL_INTERVAL_MS);
        container.appendChild(el);
    });
}

function renderOpponentSet() {
    const container = byId('cpu-set');
    if (!container) return;

    const cpu = getBattleViewModel().opponent;
    const signature = cpu.set
        .map(card => `${card.id}:${card.name}:${card.trapLocked === true ? 1 : 0}:${card.blockedByTrap === true ? 1 : 0}`)
        .join('|');
    if (shouldSkipSectionRender('cpu-set', signature)) return;

    container.innerHTML = '';

    if (cpu.set.length === 0) { container.textContent = 'セットなし'; return; }
    cpu.set.forEach(card => {
        const isTrap = card.trapLocked === true || card.blockedByTrap === true;
        if (isTrap) {
            const trapCard = createFaceCard({
                ...card,
                description: 'トラップ配置中（料理不可）'
            }, 'ingredient-card trap-locked-card');
            container.appendChild(trapCard);
            return;
        }
        container.appendChild(createBackCard(getBattleViewModel().opponentLabel, 'セット'));
    });
}

function renderPacks(player, container) {
    if (!container) return;
    const sectionKey = `packs:${container.id || 'unknown'}`;
    const signature = player.packs.map(pack => `${pack.key}:${pack.name}`).join('|');
    if (shouldSkipSectionRender(sectionKey, signature)) return;

    container.innerHTML = '';
    if (player.packs.length === 0) { container.textContent = 'なし'; return; }

    player.packs.forEach(pack => {
        const card = {
            name: pack.name,
            description: pack.description || '加工アイテム'
        };
        const el = document.createElement('div');
        el.className = 'card pack-card';
        const imagePath = getPackImagePath(pack.key);
        if (imagePath) {
            createImageCard(card, el, imagePath, 'pack-card');
        } else {
            createCardTextBlock(card, el);
        }
        el.classList.add('inspectable-card');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', `${pack.name}の効果を確認`);
        const inspect = () => window.showFieldPackDetails?.(pack);
        el.addEventListener('click', inspect);
        el.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            inspect();
        });
        container.appendChild(el);
    });
}

function createDishCardElement(dish, ownerKey, compact = false) {
    const el = document.createElement('div');
    el.className = compact ? 'dish-card compact-dish-card' : 'dish-card';

    const path = getRecipeImagePath(dish.name);
    if (path) {
        el.classList.add('has-dish-image');
        const art = document.createElement('div');
        art.className = 'dish-art';
        art.style.backgroundImage = `url("${path}")`;

        const overlay = document.createElement('div');
        overlay.className = 'dish-overlay';

        const title = document.createElement('div');
        title.className = 'dish-title';
        title.textContent = dish.name;

        const points = document.createElement('div');
        points.className = 'dish-points';
        points.textContent = `${dish.points}点`;

        overlay.appendChild(title);
        overlay.appendChild(points);
        el.appendChild(art);
        el.appendChild(overlay);
    } else {
        const title = document.createElement('div');
        title.className = 'dish-title text-only';
        title.textContent = dish.name;
        const points = document.createElement('div');
        points.className = 'dish-points text-only';
        points.textContent = `${dish.points}点`;
        const req = document.createElement('div');
        req.className = 'dish-required';
        req.textContent = `必要: ${dish.required.join(' + ')}`;
        el.appendChild(title); el.appendChild(points); el.appendChild(req);
    }

    if (compact) el.addEventListener('click', () => openDishHistory(ownerKey));
    return el;
}

function renderDishSummaries() { renderLatestDishFor('player'); renderLatestDishFor('cpu'); }

function renderLatestDishFor(ownerKey) {
    const container = byId(ownerKey === 'player' ? 'player-latest-dish' : 'cpu-latest-dish');
    if (!container) return;

    const p = getBattleViewModel().forSide(ownerKey);
    const latest = Array.isArray(p.cookedRecipes) && p.cookedRecipes.length > 0 ? p.cookedRecipes[0] : null;
    const signature = latest
        ? `${latest.name}:${latest.points}:${latest.id || ''}`
        : 'empty';
    if (shouldSkipSectionRender(`latest-dish:${ownerKey}`, signature)) return;

    container.innerHTML = '';

    if (!p.cookedRecipes || p.cookedRecipes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'latest-dish-empty';
        empty.textContent = 'まだ料理はありません';
        container.appendChild(empty);
        return;
    }

    container.appendChild(createDishCardElement(p.cookedRecipes[0], ownerKey, true));
}

function openDishHistory(ownerKey) { GameState.openDishHistoryFor = ownerKey; updateUI(); }
function closeDishHistory() { GameState.openDishHistoryFor = null; updateUI(); }

function renderDishHistoryPanel() {
    const panel = byId('dish-history-panel');
    const title = byId('dish-history-title');
    const desc = byId('dish-history-description');
    const list = byId('dish-history-list');
    if (!panel || !title || !desc || !list) return;

    if (!GameState.openDishHistoryFor) { panel.classList.add('hidden'); list.innerHTML = ''; return; }

    const ownerKey = GameState.openDishHistoryFor;
    const p = getBattleViewModel().forSide(ownerKey);
    const label = ownerKey === 'player' ? (getBattleViewModel().online ? 'あなた' : 'プレイヤー') : getBattleViewModel().opponentLabel;

    panel.classList.remove('hidden');
    title.textContent = `${label}の料理履歴`;
    desc.textContent = '新しい料理が上に表示されます。';
    list.innerHTML = '';

    if (!p.cookedRecipes || p.cookedRecipes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'latest-dish-empty';
        empty.textContent = 'まだ料理はありません';
        list.appendChild(empty);
        return;
    }

    p.cookedRecipes.forEach(dish => list.appendChild(createDishCardElement(dish, ownerKey, false)));
}

function requestPileView(type) {
    if (GameState.selectionMode) return;
    ensureUiState();
    GameState.ui.pileViewType = type === 'deck' ? 'deck' : 'discard';
    updateUI();
}
function closePileView() { ensureUiState(); GameState.ui.pileViewType = null; updateUI(); }

function renderPileViewPanel() {
    const panel = byId('pile-view-panel');
    const title = byId('pile-view-title');
    const desc = byId('pile-view-description');
    const list = byId('pile-view-list');
    if (!panel || !title || !desc || !list) return;

    ensureUiState();
    if (!GameState.ui.pileViewType) { panel.classList.add('hidden'); list.innerHTML = ''; return; }

    const isDeck = GameState.ui.pileViewType === 'deck';
    const cards = isDeck ? [...GameState.deck] : [...GameState.discard];

    panel.classList.remove('hidden');
    title.textContent = isDeck ? '山札一覧' : '捨て札一覧';
    desc.textContent = `${cards.length}枚あります。`;
    list.innerHTML = '';

    if (cards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'latest-dish-empty';
        empty.textContent = 'カードはありません';
        list.appendChild(empty);
        return;
    }

    const counts = {};
    cards.forEach(card => {
        const key = `${card.type}:${card.name}`;
        if (!counts[key]) counts[key] = { name: card.name, type: card.type, count: 0 };
        counts[key].count++;
    });

    Object.values(counts).forEach(d => {
        const item = document.createElement('div');
        item.className = `pile-card-item ${d.type === 'event' ? 'event-item' : 'ingredient-item'}`;

        const name = document.createElement('div');
        name.className = 'pile-card-name';
        name.textContent = d.name;

        const type = document.createElement('div');
        type.className = 'pile-card-type';
        type.textContent = `${d.type === 'event' ? 'イベント' : '材料'} × ${d.count}`;

        item.appendChild(name);
        item.appendChild(type);
        list.appendChild(item);
    });
}

function renderDiscardPileTop() {
    const pile = byId('discard-pile-button');
    if (!pile) return;
    const latest = Array.isArray(GameState.discard) && GameState.discard.length > 0
        ? GameState.discard[GameState.discard.length - 1]
        : null;
    const imagePath = latest?.type === 'ingredient'
        ? getIngredientImagePath(latest.name)
        : (latest?.type === 'event' ? getEventImagePath(latest.name) : null);
    pile.classList.toggle('has-top-card', !!imagePath);
    pile.style.backgroundImage = imagePath ? `url("${imagePath}")` : '';
    pile.setAttribute('aria-label', latest ? `捨て札${GameState.discard.length}枚。最後は${latest.name}` : '捨て札0枚');
}

function renderSelectionPanel() {
    const panel = byId('selection-panel');
    const title = byId('selection-title');
    const desc = byId('selection-description');
    const options = byId('selection-options');
    const confirmButton = byId('selection-confirm-button');
    if (!panel || !title || !desc || !options || !confirmButton) return;

    if (GameState.selectionMode === 'knife-select') {
        panel.classList.add('hidden');
        options.innerHTML = '';
        return;
    }

    const isEventTargetMode = GameState.selectionMode === 'event-target' && !!GameState.pendingEventContext;
    const isSkillTargetMode = GameState.selectionMode === 'skill-target' && !!GameState.pendingSkillContext;
    if (!isEventTargetMode && !isSkillTargetMode) {
        panel.classList.add('hidden');
        options.innerHTML = '';
        return;
    }

    panel.classList.remove('hidden');

    const ctx = isSkillTargetMode ? GameState.pendingSkillContext : GameState.pendingEventContext;
    title.textContent = isSkillTargetMode
        ? `スキル対象選択: ${ctx.skillName}`
        : `イベント対象選択: ${ctx.eventName}`;
    desc.textContent = ctx.description || '';
    options.innerHTML = '';

    ctx.options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'selection-choice';
        item.textContent = option.label;
        if (GameState.selectedTargetIds.includes(option.id)) item.classList.add('active');
        item.addEventListener('click', () => toggleEventTargetSelection(option.id));
        options.appendChild(item);
    });

    const selectedCount = GameState.selectedTargetIds.length;
    confirmButton.disabled = selectedCount < ctx.minSelect || selectedCount > ctx.maxSelect;
}

function renderSetConfirmPanel() {
    const panel = byId('set-confirm-panel');
    const desc = byId('set-confirm-description');
    if (!panel || !desc) return;

    if (GameState.selectionMode !== 'set-confirm' || !GameState.pendingSetCardId) { panel.classList.add('hidden'); desc.textContent = ''; return; }

    const card = getBattleViewModel().me.hand.find(item => item.id === GameState.pendingSetCardId);
    if (!card) { panel.classList.add('hidden'); desc.textContent = ''; return; }

    panel.classList.remove('hidden');
    desc.textContent = `「${card.name}」をセットしますか？`;
}

function renderPackConfirmPanel() {
    const panel = byId('pack-confirm-panel');
    const desc = byId('pack-confirm-description');
    if (!panel || !desc) return;

    if (GameState.selectionMode !== 'pack-confirm' || !GameState.pendingPackKey) {
        panel.classList.add('hidden');
        desc.innerHTML = '';
        return;
    }

    const player = getBattleViewModel().me;
    const def = getPackDefinition(GameState.pendingPackKey);
    if (!def) {
        panel.classList.add('hidden');
        desc.innerHTML = '';
        return;
    }

    const effectText = getDetailedPackEffectText(def.key);
    const conditionWarning = getPackConditionWarning(player, def.key);
    const warningHtml = conditionWarning
        ? `<br><span class="condition-warning">交換条件が満たせません（${escapeHtml(conditionWarning)}）</span>`
        : '';

    panel.classList.remove('hidden');
    desc.innerHTML = `<strong>加工アイテム「${escapeHtml(def.name)}」を交換しますか？</strong><br>効果: ${escapeHtml(effectText)}<br>コスト: ${def.cost}点${warningHtml}`;
}

function getPlayerEventConditionWarning(eventCard) {
    if (!eventCard) return '';

    const player = getBattleViewModel().me;
    const cpu = getBattleViewModel().opponent;
    const selectableIngredientCount = player.hand.length + player.set.length;

    switch (eventCard.name) {
        case 'ゴミ収集車':
            return GameState.discard.some(card => card.type === 'ingredient')
                ? ''
                : '捨て札に回収できる材料カードがありません。';

        case '物々交換':
            return (player.hand.length > 0 && cpu.hand.length > 0)
                ? ''
                : `あなたまたは${getBattleViewModel().opponentLabel}の手札材料が不足しています。`;

        case 'やっぱやめた':
            return player.set.length > 0
                ? ''
                : '戻すセットカードがありません。';

        case 'やり直し':
            return player.hand.length > 0
                ? ''
                : '捨てる手札材料がありません。';

        case '大掃除':
            return (cpu.hand.length + cpu.events.length + cpu.set.length) > 0
                ? ''
                : `${getBattleViewModel().opponentLabel}に捨てさせるカードがありません。`;

        case '緊急料理':
            if (player.score > 3) return '点数が4以上です。';
            if (selectableIngredientCount < 1) return '捨てる材料がありません。';
            if ((player.recipesCookedThisTurn || 0) > 0) return 'このターンはすでに料理を作成済みです。';
            return '';

        case '創作料理':
            if (player.score > 6) return '点数が7以上です。';
            if (selectableIngredientCount < 2) return '捨てる材料が2枚ありません。';
            if ((player.recipesCookedThisTurn || 0) > 0) return 'このターンはすでに料理を作成済みです。';
            return '';

        default:
            return '';
    }
}

function renderEventConfirmPanel() {
    const panel = byId('event-confirm-panel');
    const desc = byId('event-confirm-description');
    if (!panel || !desc) return;

    if (GameState.selectionMode !== 'event-confirm' || !GameState.pendingEventCardId) { panel.classList.add('hidden'); desc.innerHTML = ''; return; }

    const card = getBattleViewModel().me.events.find(item => item.id === GameState.pendingEventCardId);
    if (!card) { panel.classList.add('hidden'); desc.innerHTML = ''; return; }

    const effectText = getDetailedEventEffectText(card.name);
    const conditionWarning = getPlayerEventConditionWarning(card);
    const warningHtml = conditionWarning
        ? `<br><span class="condition-warning">発動条件が満たしていないですが使用しますか？（${escapeHtml(conditionWarning)}）</span>`
        : '';
    panel.classList.remove('hidden');
    desc.innerHTML = `<strong>「${escapeHtml(card.name)}」を使用しますか？</strong><br>効果: ${escapeHtml(effectText)}${warningHtml}<br>※イベントカードは1ターンに1回までです。`;
}

function renderSetViewPanel() {
    const panel = byId('set-view-panel');
    const desc = byId('set-view-description');
    if (!panel || !desc) return;

    if (GameState.selectionMode !== 'set-view' || !GameState.pendingViewSetCardId) { panel.classList.add('hidden'); desc.textContent = ''; return; }

    const card = getBattleViewModel().me.set.find(item => item.id === GameState.pendingViewSetCardId);
    if (!card) { panel.classList.add('hidden'); desc.textContent = ''; return; }

    panel.classList.remove('hidden');
    desc.textContent = `このセットカードは「${card.name}」です。料理の材料に使えます。`;
}

function getPendingIngredientCard() {
    const context = GameState.pendingIngredientAction;
    if (!context) return null;

    const player = getBattleViewModel().me;
    const source = context.sourceZone === 'set' ? player.set : player.hand;
    const card = source.find(item => item.id === context.cardId && item.type === 'ingredient');
    if (!card) return null;

    return { card, context };
}

function formatIngredientCounts(names) {
    if (!Array.isArray(names) || names.length === 0) return '';
    const counts = {};
    names.forEach(name => {
        counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([name, count]) => count > 1 ? `${name}×${count}` : name)
        .join('、');
}

function buildMissingIngredientsForSelectedCard(recipe, selectedCard) {
    const player = getBattleViewModel().me;
    const allCards = [...player.hand, ...player.set];
    const restCards = [];
    let removed = false;

    allCards.forEach(item => {
        if (!removed && item.id === selectedCard.id) {
            removed = true;
            return;
        }
        restCards.push(item);
    });

    const counts = typeof countNamesFromCards === 'function' ? countNamesFromCards(restCards) : {};
    const requirements = [...recipe.required];
    const selectedIndex = requirements.indexOf(selectedCard.name);
    if (selectedIndex >= 0) requirements.splice(selectedIndex, 1);

    const missing = [];
    requirements.forEach(reqName => {
        if (counts[reqName] && counts[reqName] > 0) {
            counts[reqName]--;
        } else {
            missing.push(reqName);
        }
    });
    return missing;
}

function renderIngredientActionPanel() {
    const panel = byId('ingredient-action-panel');
    const title = byId('ingredient-action-title');
    const desc = byId('ingredient-action-description');
    const comboList = byId('ingredient-combo-list');
    const setButton = byId('ingredient-action-set-button');
    const comboButton = byId('ingredient-action-combo-button');
    const backButton = byId('ingredient-action-back-button');
    const closeButton = byId('ingredient-action-close-button');
    if (!panel || !title || !desc || !comboList || !setButton || !comboButton || !backButton || !closeButton) return;

    if (GameState.selectionMode !== 'ingredient-action' || !GameState.pendingIngredientAction) {
        panel.classList.add('hidden');
        comboList.innerHTML = '';
        comboList.classList.add('hidden');
        return;
    }

    const pending = getPendingIngredientCard();
    if (!pending) {
        panel.classList.add('hidden');
        comboList.innerHTML = '';
        comboList.classList.add('hidden');
        return;
    }

    const { card, context } = pending;
    const isComboView = context.view === 'combo';
    panel.classList.remove('hidden');
    title.textContent = `材料「${card.name}」`;

    if (!isComboView) {
        desc.textContent = context.sourceZone === 'hand'
            ? 'この材料カードで行う操作を選んでください。'
            : 'セット中の材料カードです。組み合わせを確認できます。';

        comboList.innerHTML = '';
        comboList.classList.add('hidden');

        if (context.sourceZone === 'hand') {
            setButton.classList.remove('hidden');
            comboButton.textContent = '組み合わせ';
        } else {
            setButton.classList.add('hidden');
            comboButton.textContent = '組み合わせ';
        }
        comboButton.classList.remove('hidden');
        backButton.classList.add('hidden');
        closeButton.textContent = '閉じる';
        return;
    }

    desc.textContent = `「${card.name}」を使う料理と、あと必要な材料です。`;
    setButton.classList.add('hidden');
    comboButton.classList.add('hidden');
    backButton.classList.remove('hidden');
    closeButton.textContent = '閉じる';
    comboList.classList.remove('hidden');
    comboList.innerHTML = '';

    const combos = recipes
        .filter(recipe => recipe.required.includes(card.name))
        .map(recipe => {
            const missing = buildMissingIngredientsForSelectedCard(recipe, card);
            return { recipe, missing };
        })
        .sort((a, b) => {
            if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
            return b.recipe.points - a.recipe.points;
        });

    if (combos.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ingredient-combo-item';
        empty.textContent = 'この材料を使う料理はありません。';
        comboList.appendChild(empty);
        return;
    }

    combos.forEach(item => {
        const row = document.createElement('div');
        row.className = 'ingredient-combo-item';

        const recipeTitle = document.createElement('div');
        recipeTitle.className = 'ingredient-combo-title';
        recipeTitle.textContent = `${item.recipe.name}（${item.recipe.points}点）`;

        const status = document.createElement('div');
        status.className = 'ingredient-combo-status';
        status.textContent = item.missing.length === 0
            ? '作成可能'
            : `あと: ${formatIngredientCounts(item.missing)}`;

        row.appendChild(recipeTitle);
        row.appendChild(status);
        comboList.appendChild(row);
    });
}

function renderEndTurnConfirmPanel() {
    const panel = byId('end-turn-confirm-panel');
    if (!panel) return;
    if (GameState.selectionMode !== 'end-turn-confirm') { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
}

function renderReferenceBooks() {
    if (!recipeBookRendered) {
        const container = byId('recipe-book');
        if (container) {
            recipeBookRendered = true;
            container.innerHTML = recipes.map(recipe => `<div class="reference-item"><div class="reference-title">${escapeHtml(recipe.name)} (${recipe.points}点)</div><div>必要: ${escapeHtml(recipe.required.join(' + '))}</div></div>`).join('');
        }
    }

    if (!eventBookRendered) {
        const container = byId('event-book');
        if (container) {
            eventBookRendered = true;
            container.innerHTML = eventDefinitions.map(event => `<div class="reference-item"><div class="reference-title">${escapeHtml(event.name)}</div><div>${escapeHtml(event.description)}</div></div>`).join('');
        }
    }

    if (!packBookRendered) {
        const container = byId('pack-book');
        if (container) {
            packBookRendered = true;
            container.innerHTML = packDefinitions.map(buildPackReferenceHtml).join('');
        }
    }
}

function renderCandidateRecipes() {
    const container = byId('candidate-recipes');
    if (!container) return;
    const panel = container.closest('.candidate-recipes-panel');
    const candidateCount = Array.isArray(GameState.candidateRecipes) ? GameState.candidateRecipes.length : 0;
    if (panel) panel.classList.toggle('expanded', candidateCount >= 4);
    container.innerHTML = '';
    if (GameState.candidateRecipes.length === 0) {
        if (panel) panel.classList.remove('hidden');
        container.textContent = '料理を作るボタンを押すと候補が出ます。';
        return;
    }
    if (panel) panel.classList.remove('hidden');

    GameState.candidateRecipes.forEach(plan => {
        const row = document.createElement('div');
        row.className = 'recipe-option';

        const meta = document.createElement('div');
        meta.className = 'recipe-meta';
        meta.innerHTML = `<strong>${escapeHtml(plan.recipe.name)}</strong> (${plan.recipe.points}点)<br>必要: ${escapeHtml(plan.recipe.required.join(' + '))}`;

        const button = document.createElement('button');
        button.textContent = '作る';
        button.disabled = getBattleViewModel().turn !== 'me' || !!GameState.selectionMode || GameState.gameEnded;
        button.addEventListener('click', () => playerCookSelectedRecipe(plan.recipe.name));

        row.appendChild(meta);
        row.appendChild(button);
        container.appendChild(row);
    });

    const cancelRow = document.createElement('div');
    cancelRow.className = 'recipe-cancel-row';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'recipe-cancel-button';
    cancelButton.textContent = '今はやめとく';
    cancelButton.disabled = getBattleViewModel().turn !== 'me' || !!GameState.selectionMode || GameState.gameEnded;
    cancelButton.addEventListener('click', () => {
        if (typeof playerCancelRecipeCandidates === 'function') {
            playerCancelRecipeCandidates();
        }
    });

    cancelRow.appendChild(cancelButton);
    container.appendChild(cancelRow);
}

function formatSkillUsageText(player, skill) {
    if (!player || !skill) return '未設定';
    const used = typeof getPlayerSkillUseCount === 'function'
        ? getPlayerSkillUseCount(player, skill.key)
        : Math.max(0, Number(player.skillUseCounts?.[skill.key] || 0));
    const maxUses = Number.isFinite(Number(skill.maxUses)) ? Math.max(1, Math.floor(Number(skill.maxUses))) : 1;
    if (maxUses <= 1) {
        return used > 0 ? '使用済み' : '未使用';
    }
    return `使用 ${used}/${maxUses}（残り${Math.max(0, maxUses - used)}）`;
}

function renderSkillHud() {
    const playerSkill = typeof getSelectedSkillDefinitionForSide === 'function'
        ? getSelectedSkillDefinitionForSide('player')
        : null;
    const playerState = getBattleViewModel().me;

    safeSetText('player-skill-name', playerSkill ? `スキル: ${playerSkill.name}` : 'スキル: 未選択');
    safeSetText('cpu-skill-name', 'スキル: ？？？');
    safeSetText('player-skill-state', formatSkillUsageText(playerState, playerSkill));
    safeSetText('cpu-skill-state', '状態: 不明');

    const button = byId('player-skill-button');
    if (!button) return;

    const status = typeof getSkillActivationStatusForSide === 'function'
        ? getSkillActivationStatusForSide('player')
        : { ok: false, reason: 'スキル未対応' };
    const isSkillConfirmMode = GameState.selectionMode === 'skill-confirm';
    const blockedBySelection = !!GameState.selectionMode && !isSkillConfirmMode;
    const canOpenDetail = !!playerSkill && !blockedBySelection;
    const canUseNow = !!playerSkill &&
        !GameState.gameEnded &&
        getBattleViewModel().turn === 'me' &&
        !blockedBySelection &&
        status.ok;

    button.disabled = !canOpenDetail;
    button.classList.toggle('ready', canUseNow);
    button.textContent = playerSkill ? (canUseNow ? 'スキル発動' : 'スキル詳細') : 'スキル未選択';

    if (!playerSkill) {
        button.title = 'スキルが未設定です。';
    } else if (canUseNow) {
        button.title = `${playerSkill.name}を発動できます。`;
    } else if (getBattleViewModel().turn !== 'me') {
        button.title = `${playerSkill.name}の詳細を確認できます（発動は自分のターン中のみ）。`;
    } else {
        button.title = status.reason || `${playerSkill.name}の詳細を確認できます。`;
    }
}

function renderSkillConfirmPanel() {
    const panel = byId('skill-confirm-panel');
    const nameEl = byId('skill-confirm-name');
    const conditionEl = byId('skill-confirm-condition');
    const effectEl = byId('skill-confirm-effect');
    const usageEl = byId('skill-confirm-usage');
    const statusEl = byId('skill-confirm-status');
    const yesButton = byId('skill-confirm-yes-button');
    if (!panel || !nameEl || !conditionEl || !effectEl || !usageEl || !statusEl || !yesButton) return;

    if (GameState.selectionMode !== 'skill-confirm') {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    const skill = typeof getSelectedSkillDefinitionForSide === 'function'
        ? getSelectedSkillDefinitionForSide('player')
        : null;
    const status = typeof getSkillActivationStatusForSide === 'function'
        ? getSkillActivationStatusForSide('player')
        : { ok: false, reason: 'スキル未対応' };
    const player = getBattleViewModel().me;

    if (!skill) {
        nameEl.textContent = 'スキル未選択';
        conditionEl.textContent = '条件: -';
        effectEl.textContent = '効果: -';
        usageEl.textContent = '使用回数: -';
        statusEl.textContent = 'スキルが設定されていません。';
        yesButton.disabled = true;
        return;
    }

    const maxUses = Number.isFinite(Number(skill.maxUses)) ? Math.max(1, Math.floor(Number(skill.maxUses))) : 1;
    const used = typeof getPlayerSkillUseCount === 'function'
        ? getPlayerSkillUseCount(player, skill.key)
        : Math.max(0, Number(player?.skillUseCounts?.[skill.key] || 0));

    const turnBlocked = getBattleViewModel().turn !== 'me';
    const gameEnded = !!GameState.gameEnded;
    const canActivate = !turnBlocked && !gameEnded && status.ok;

    nameEl.textContent = `スキル: ${skill.name}`;
    conditionEl.textContent = `条件: ${skill.condition || 'なし'}`;
    effectEl.textContent = `効果: ${skill.effect || 'なし'}`;
    usageEl.textContent = `使用回数: ${used}/${maxUses}`;

    if (gameEnded) {
        statusEl.textContent = 'ゲーム終了後は発動できません。';
    } else if (turnBlocked) {
        statusEl.textContent = '自分のターン中のみ発動できます。';
    } else if (canActivate) {
        statusEl.textContent = '発動可能です。';
    } else {
        statusEl.textContent = status.reason || '現在は発動できません。';
    }

    yesButton.disabled = !canActivate;
    yesButton.classList.toggle('ready', canActivate);
    yesButton.textContent = 'このスキルを発動';
}

function renderShopButtons() {
    const player = getBattleViewModel().me;
    const disabled = getBattleViewModel().turn !== 'me' || !!GameState.selectionMode || GameState.gameEnded;
    const shopButton = byId('open-pack-shop-button');
    const cookBtn = byId('cook-button');
    const endBtn = byId('end-turn-button');

    if (shopButton) {
        const ownedCount = packDefinitions.filter(def => hasPack(player, def.key)).length;
        shopButton.textContent = `加工アイテム交換 ${ownedCount}/${packDefinitions.length}`;
        shopButton.disabled = !!GameState.selectionMode || GameState.gameEnded;
        shopButton.classList.toggle('all-exchanged', ownedCount === packDefinitions.length);
    }
    if (cookBtn) {
        cookBtn.disabled = disabled;
        const canCookNow = !disabled && !player.lockedCookingThisTurn && findPossibleRecipesForPlayer(player).length > 0;
        cookBtn.classList.toggle('has-recipe-alert', canCookNow);
    }
    if (endBtn) endBtn.disabled = getBattleViewModel().turn !== 'me' || GameState.gameEnded;
}

function openPackShop() {
    if (GameState.selectionMode || GameState.gameEnded) return;
    packShopOpen = true;
    updateUI();
}

function closePackShop() {
    if (GameState.selectionMode === 'pack-resolving') return;
    if (GameState.selectionMode === 'pack-confirm' && typeof window.cancelPackPurchase === 'function') {
        window.cancelPackPurchase();
    }
    packShopOpen = false;
    updateUI();
}

function renderPackShopModal() {
    const overlay = byId('pack-shop-overlay');
    const score = byId('pack-shop-score');
    const list = byId('pack-shop-list');
    const closeButton = byId('pack-shop-close-button');
    if (!overlay || !score || !list) return;
    overlay.classList.toggle('hidden', !packShopOpen);
    if (!packShopOpen) return;

    const player = getBattleViewModel().me;
    const canOperate = getBattleViewModel().turn === 'me' && !GameState.gameEnded &&
        (!GameState.selectionMode || GameState.selectionMode === 'pack-confirm');
    score.textContent = `現在の点数: ${player.score}点 / 交換には各3点必要です`;
    if (closeButton) closeButton.disabled = GameState.selectionMode === 'pack-resolving';
    list.innerHTML = '';

    packDefinitions.forEach(def => {
        const owned = hasPack(player, def.key);
        const available = canOperate && !GameState.selectionMode && canBuyPack(player, def.key);
        const item = document.createElement('article');
        item.className = `pack-shop-item${owned ? ' is-owned' : ''}`;

        const art = document.createElement('div');
        art.className = 'pack-shop-art';
        const imagePath = getPackImagePath(def.key);
        if (imagePath) art.style.backgroundImage = `url("${imagePath}")`;

        const body = document.createElement('div');
        body.className = 'pack-shop-body';
        const title = document.createElement('strong');
        title.textContent = def.name;
        const effect = document.createElement('span');
        effect.textContent = getDetailedPackEffectText(def.key);
        const cost = document.createElement('span');
        cost.className = 'pack-shop-cost';
        cost.textContent = `必要点数: ${def.cost}点`;
        const status = document.createElement('span');
        status.className = `pack-shop-status ${owned ? 'is-owned' : 'is-unowned'}`;
        status.textContent = owned
            ? '交換済み'
            : (player.score < def.cost ? `未交換・あと${def.cost - player.score}点必要` :
                (getBattleViewModel().turn !== 'me' ? '未交換・相手のターン' : '未交換・交換できます'));
        body.append(title, effect, cost, status);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pack-shop-exchange-button';
        button.textContent = owned ? '交換済み' : `${def.cost}点で交換`;
        button.disabled = !available;
        button.addEventListener('click', () => window.playerBuyPack?.(def.key));
        item.append(art, body, button);
        list.appendChild(item);
    });
}

function renderDiscardButton() {
    const button = byId('confirm-discard-button');
    if (!button) return;
    button.disabled = GameState.selectionMode !== 'discard';
}

function renderRealtimeLog() {
    const container = byId('realtime-log-list');
    if (!container) return;

    const lines = realtimeLogHistory.slice(0, 5);
    const signature = lines.join('\n');
    if (shouldSkipSectionRender('realtime-log-list', signature)) return;

    container.innerHTML = '';

    if (lines.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'realtime-log-entry';
        empty.textContent = 'ログ待機中';
        container.appendChild(empty);
        return;
    }

    lines.forEach(line => {
        const item = document.createElement('div');
        item.className = 'realtime-log-entry';
        item.textContent = line;
        container.appendChild(item);
    });
}

function showDiscardBanner(count) {
    const banner = byId('discard-banner');
    if (!banner) return;
    banner.textContent = `エンドフェイズ: あと ${count} 枚捨ててください`;
    banner.classList.remove('hidden');
}

function hideDiscardBanner() {
    const banner = byId('discard-banner');
    if (!banner) return;
    banner.textContent = '';
    banner.classList.add('hidden');
}

function addLog(message) {
    let text = String(message ?? '');
    if (/[繧縺螟譛蝗ｺ]/.test(text)) {
        text = '進行ログを更新しました。';
    }
    realtimeLogHistory.unshift(text);

    const logArea = byId('log-area');
    if (logArea) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = text;
        logArea.appendChild(entry);
        logArea.scrollTop = logArea.scrollHeight;
    }

    renderRealtimeLog();
    if (GameState?.ui?.infoOverlayType === 'log') renderInfoOverlay();
}

function setCPUStatus(text) { const el = byId('cpu-status'); if (el) el.textContent = text; }
function enablePlayerControls() { updateUI(); }
function disablePlayerControls() { updateUI(); }

function requestDeferredUIRender() {
    if (uiRenderFrameRequested) return;
    uiRenderFrameRequested = true;

    const run = () => {
        uiRenderFrameRequested = false;
        if (!uiRenderQueued) return;
        uiRenderQueued = false;
        performUIRender();
    };

    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run);
    } else {
        setTimeout(run, 16);
    }
}

function performUIRender() {
    if (uiRenderInProgress) {
        uiRenderQueued = true;
        requestDeferredUIRender();
        return;
    }
    uiRenderInProgress = true;

    try {
        beginCardMotionFrame();
        for (const label of document.querySelectorAll('[data-online-label]')) {
            label.dataset.cpuLabel ??= label.textContent;
            label.textContent = getBattleViewModel().online ? label.dataset.onlineLabel : label.dataset.cpuLabel;
        }
        scheduleGameplayImagePreload();
        ensureUiState();
        ensureGameSettings();
        applyBackgroundTheme(GameState.settings.backgroundTheme);
        applyBackgroundDesign(GameState.settings.backgroundDesign);
        bindRenderEventsOnce();

        const model = getBattleViewModel();
        safeSetText('player-hud-name', model.me.characterName || '千鶴');
        safeSetText('cpu-hud-name', model.opponent.characterName || '舞依');

        safeSetText('player-side-score', String(getBattleViewModel().me.score));
        safeSetText('cpu-side-score', String(getBattleViewModel().opponent.score));
        safeSetText('deck-count', String(GameState.deck.length));
        safeSetText('discard-count', String(GameState.discard.length));
        renderDiscardPileTop();

        const opponentLabel = getBattleViewModel().opponentLabel;
        safeSetText('turn-indicator', 'ターン: ' + (
            getBattleViewModel().turn === 'me' ? 'プレイヤー' :
            getBattleViewModel().turn === 'opponent' ? opponentLabel :
            'ゲーム終了'
        ));

        safeSetText('phase-indicator', 'フェイズ: ' + GameState.currentPhase);

        applyCharacterSkins();
        updateCharacterFaces();
        renderPlayerMixedHand();
        renderPlayerSet();
        renderOpponentMixedHand();
        renderOpponentSet();
        renderPacks(getBattleViewModel().me, byId('player-packs'));
        renderPacks(getBattleViewModel().opponent, byId('cpu-packs'));
        renderCandidateRecipes();
        renderSkillHud();
        renderShopButtons();
        renderPackShopModal();
        renderDiscardButton();
        renderDishSummaries();
        renderDishHistoryPanel();
        renderRealtimeLog();
        renderSelectionPanel();
        renderSetConfirmPanel();
        renderPackConfirmPanel();
        renderEventConfirmPanel();
        renderSetViewPanel();
        renderIngredientActionPanel();
        renderSkillConfirmPanel();
        renderPileViewPanel();
        renderEndTurnConfirmPanel();
        renderReferenceBooks();
        renderInfoOverlay();
        finishCardMotionFrame();

        if (GameState.selectionMode !== 'discard') hideDiscardBanner();
        if (typeof window.__onGameStateUpdated === 'function') {
            window.__onGameStateUpdated();
        }
    } finally {
        uiRenderInProgress = false;
        lastUiRenderAt = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
        if (uiRenderQueued) requestDeferredUIRender();
    }
}

function updateUI(forceImmediate = false) {
    if (typeof updateBattleMenu === 'function') updateBattleMenu();
    if (forceImmediate === true) {
        uiRenderQueued = false;
        uiRenderFrameRequested = false;
        performUIRender();
        return;
    }

    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
    const renderTooSoon = (now - lastUiRenderAt) < 14;

    if (uiRenderInProgress || renderTooSoon) {
        uiRenderQueued = true;
        requestDeferredUIRender();
        return;
    }

    performUIRender();
}

window.updateUI = updateUI;
window.updateUIImmediate = () => updateUI(true);
window.addLog = addLog;
window.setCPUStatus = setCPUStatus;
window.enablePlayerControls = enablePlayerControls;
window.disablePlayerControls = disablePlayerControls;
window.showDiscardBanner = showDiscardBanner;
window.hideDiscardBanner = hideDiscardBanner;
window.openDishHistory = openDishHistory;
window.closeDishHistory = closeDishHistory;
window.requestPileView = requestPileView;
window.closePileView = closePileView;
window.getIngredientImagePath = getIngredientImagePath;
window.getRecipeImagePath = getRecipeImagePath;
window.getEventImagePath = getEventImagePath;
window.getPackImagePath = getPackImagePath;
window.applyRuntimeSettings = applyRuntimeSettings;
