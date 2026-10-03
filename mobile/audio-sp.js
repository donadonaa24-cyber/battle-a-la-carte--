const BGM_TRACKS = {
    characterTheme: { label: 'キャラのテーマ曲' },
    default: { label: '1', name: 'bgm' },
    miracle: { label: '2', name: 'bgm-miracle' },
    skyHigh: { label: '3', name: 'bgm-sky-high-refrain' },
    code241: { label: '4', name: 'bgm-code241-2' }
};

const CHARACTER_THEME_TRACKS = Object.freeze(Object.fromEntries(
    ['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna', 'tsuyoshi'].map(id => ['theme-' + id, { name: 'theme-' + id }])
));

const LEGACY_BGM_TRACK_ALIAS = {
    variantA: 'miracle'
};

const CONTEXT_BGM_TRACKS = {
    title: 'title-screen',
    story: 'story-dialogue',
    battleMode: 'battle-mode',
    result: 'match-result'
};

const BASE_BGM_VOLUME = {
    battle: 0.5,
    title: 0.42,
    story: 0.4,
    battleMode: 0.56,
    result: 0.46
};

const DEFAULT_BGM_VOLUME = 0.8;
const COOK_SFX_DELAY_MS = 1200;
const pendingCookSfxTimers = new Set();

const AudioManager = {
    isUnlocked: false,
    bgmEnabled: true,
    bgmVolume: DEFAULT_BGM_VOLUME,
    currentBgmTrack: window.CharacterThemes?.savedChoice() || 'characterTheme',
    activeBgmKey: null,
    lastRequestedBgmKey: 'battle:default',
    battleModeLocked: false,
    bgmPlayers: {},
    sounds: {}
};

function clampBgmVolume(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BGM_VOLUME;
    return Math.max(0, Math.min(1, num));
}

function normalizeTrackKey(trackKey) {
    const raw = String(trackKey || 'default').trim();
    const aliased = LEGACY_BGM_TRACK_ALIAS[raw] || raw;
    return BGM_TRACKS[aliased] ? aliased : 'default';
}

function getBattleBgmKey(trackKey) {
    const choice = normalizeTrackKey(trackKey);
    const character = typeof GameState !== 'undefined' ? GameState.characterIds?.player : null;
    const track = choice === 'characterTheme' ? window.CharacterThemes?.trackFor(character) || 'default' : choice;
    return `battle:${track}`;
}

function getBaseVolumeByKey(key) {
    if (String(key || '').startsWith('battle:')) return BASE_BGM_VOLUME.battle;
    return BASE_BGM_VOLUME[key] || BASE_BGM_VOLUME.battle;
}

function createLoopAudio(name, baseVolume) {
    const audio = window.AudioPack.createAudio(name);
    audio.loop = true;
    audio.preload = 'auto';
    audio.__baseVolume = Number.isFinite(Number(baseVolume)) ? Number(baseVolume) : BASE_BGM_VOLUME.battle;
    audio.volume = Math.max(0, Math.min(1, audio.__baseVolume * AudioManager.bgmVolume));
    return audio;
}

function createBgmPlayers() {
    const players = {};
    Object.entries({ ...BGM_TRACKS, ...CHARACTER_THEME_TRACKS }).forEach(([key, track]) => {
        if (!track.name) return;
        const playerKey = `battle:${key}`;
        players[playerKey] = createLoopAudio(track.name, getBaseVolumeByKey(playerKey));
    });
    Object.entries(CONTEXT_BGM_TRACKS).forEach(([contextKey, src]) => {
        players[contextKey] = createLoopAudio(src, getBaseVolumeByKey(contextKey));
    });
    Object.entries({ ...BGM_TRACKS, ...CHARACTER_THEME_TRACKS }).filter(([, track]) => track.name).forEach(([key, track]) => {
        players[`theme:${key}`] = createLoopAudio(track.name, BASE_BGM_VOLUME.story);
    });
    return players;
}

function getBgmPlayerByKey(key) {
    return AudioManager.bgmPlayers[key] || null;
}

function ensureBgmPlayersReady() {
    if (Object.keys(AudioManager.bgmPlayers).length > 0) return;
    AudioManager.bgmPlayers = createBgmPlayers();
    applyBgmVolumeToAll();
}

function applyBgmVolumeToAll() {
    if (Object.keys(AudioManager.bgmPlayers).length === 0) return;
    const volume = clampBgmVolume(AudioManager.bgmVolume);
    AudioManager.bgmVolume = volume;
    Object.values(AudioManager.bgmPlayers).forEach(audio => {
        if (!audio) return;
        const base = Number.isFinite(Number(audio.__baseVolume))
            ? Number(audio.__baseVolume)
            : BASE_BGM_VOLUME.battle;
        audio.volume = Math.max(0, Math.min(1, base * volume));
    });
}

function stopAllBgm() {
    ensureBgmPlayersReady();
    Object.values(AudioManager.bgmPlayers).forEach(audio => {
        try {
            window.AudioPack.cancelPlayback(audio);
            audio.pause();
            audio.currentTime = 0;
        } catch (_) {}
    });
    AudioManager.activeBgmKey = null;
}

function resolvePlaybackKey(requestedKey) {
    if (!AudioManager.battleModeLocked) return requestedKey;
    if (requestedKey === 'battleMode') return requestedKey;
    if (requestedKey === 'title' || requestedKey === 'story' || requestedKey === 'result') return requestedKey;
    if (String(requestedKey || '').startsWith('battle:')) return 'battleMode';
    return requestedKey;
}

function playBgmByKey(key) {
    ensureBgmPlayersReady();
    AudioManager.lastRequestedBgmKey = key;
    if (!AudioManager.bgmEnabled) return;

    const targetKey = resolvePlaybackKey(key);
    const player = getBgmPlayerByKey(targetKey);
    if (!player) return;

    if (AudioManager.activeBgmKey !== targetKey) {
        Object.entries(AudioManager.bgmPlayers).forEach(([playerKey, audio]) => {
            if (!audio) return;
            try {
                if (playerKey === targetKey) return;
                window.AudioPack.cancelPlayback(audio);
                audio.pause();
                audio.currentTime = 0;
            } catch (_) {}
        });
        try {
            player.currentTime = 0;
        } catch (_) {}
    }

    AudioManager.activeBgmKey = targetKey;
    if (!player.paused) return;
    window.AudioPack.play(player, () => AudioManager.bgmEnabled && AudioManager.activeBgmKey === targetKey &&
        getBgmPlayerByKey(targetKey) === player);
}

function setupAudio() {
    cancelPendingCookSfx();
    if (Object.keys(AudioManager.bgmPlayers).length) stopAllBgm();
    [...Object.values(AudioManager.sounds), ...Object.values(AudioManager.bgmPlayers)].forEach(audio => window.AudioPack.dispose(audio));
    AudioManager.sounds = {
        gameStart: window.AudioPack.createAudio('turn-start'),
        turnStart: window.AudioPack.createAudio('turn-start'),
        gameEnd: window.AudioPack.createAudio('turn-start'),
        cook: window.AudioPack.createAudio('cook')
    };

    AudioManager.bgmPlayers = createBgmPlayers();
    AudioManager.currentBgmTrack = normalizeTrackKey(AudioManager.currentBgmTrack);
    AudioManager.lastRequestedBgmKey = getBattleBgmKey(AudioManager.currentBgmTrack);
    AudioManager.battleModeLocked = false;
    applyBgmVolumeToAll();

    Object.values(AudioManager.sounds).forEach(audio => {
        audio.preload = 'auto';
        audio.volume = 0.72;
    });
}

function unlockAudio() {
    if (AudioManager.isUnlocked) return;
    ensureBgmPlayersReady();
    AudioManager.isUnlocked = true;

    const warmupRequested = AudioManager.lastRequestedBgmKey || getBattleBgmKey(AudioManager.currentBgmTrack);
    const warmupKey = resolvePlaybackKey(warmupRequested);
    const warmup = getBgmPlayerByKey(warmupKey);
    if (warmup && AudioManager.bgmEnabled && AudioManager.bgmVolume > 0) {
        window.AudioPack.play(warmup, () => AudioManager.bgmEnabled && AudioManager.bgmVolume > 0 &&
            getBgmPlayerByKey(warmupKey) === warmup && (!AudioManager.activeBgmKey || AudioManager.activeBgmKey === warmupKey)).then(played => {
            if (!played) return;
            if (AudioManager.activeBgmKey === warmupKey) return;
            warmup.pause();
            warmup.currentTime = 0;
        }).catch(() => {});
    }
}

function setBattleModeBgmLocked(locked) {
    AudioManager.battleModeLocked = !!locked;
    if (!AudioManager.bgmEnabled) return;
    if (AudioManager.battleModeLocked) {
        playBgmByKey('battleMode');
    }
}

function playBGM() {
    playBgmByKey(getBattleBgmKey(AudioManager.currentBgmTrack));
}

function playTitleBGM() {
    AudioManager.battleModeLocked = false;
    playBgmByKey('title');
}

function playStoryBGM(characterId) {
    AudioManager.battleModeLocked = false;
    playBgmByKey(characterId ? `theme:${window.CharacterThemes?.trackFor(characterId) || 'default'}` : 'story');
}

function previewCharacterTheme(characterId) {
    unlockAudio();
    AudioManager.battleModeLocked = false;
    playBgmByKey(`theme:${window.CharacterThemes?.trackFor(characterId) || 'default'}`);
}

function refreshCharacterBattleBGM() {
    if (AudioManager.currentBgmTrack !== 'characterTheme' || !String(AudioManager.activeBgmKey || '').startsWith('battle:')) return;
    playBGM();
}

function playBattleModeBGM() {
    setBattleModeBgmLocked(true);
    playBgmByKey('battleMode');
}

function playResultBGM() {
    AudioManager.battleModeLocked = false;
    playBgmByKey('result');
}

function stopBGM() {
    stopAllBgm();
}

function setBgmEnabled(enabled) {
    AudioManager.bgmEnabled = !!enabled;
    if (!AudioManager.bgmEnabled) {
        window.stopStoryCues?.();
        stopAllBgm();
        return;
    }
    if (!AudioManager.isUnlocked) return;
    playBgmByKey(AudioManager.lastRequestedBgmKey || getBattleBgmKey(AudioManager.currentBgmTrack));
}

function getBgmEnabled() {
    return AudioManager.bgmEnabled;
}

function setBgmTrack(trackKey, options = {}) {
    const normalized = normalizeTrackKey(trackKey);
    if (!BGM_TRACKS[normalized]) return false;

    AudioManager.currentBgmTrack = normalized;
    if (options.save) window.CharacterThemes?.saveChoice(normalized);
    const nextBattleKey = getBattleBgmKey(normalized);
    const isBattlePlaying = String(AudioManager.activeBgmKey || '').startsWith('battle:');

    if (AudioManager.battleModeLocked) {
        AudioManager.lastRequestedBgmKey = nextBattleKey;
        return true;
    }

    if (isBattlePlaying) {
        playBgmByKey(nextBattleKey);
    } else if (String(AudioManager.lastRequestedBgmKey || '').startsWith('battle:')) {
        AudioManager.lastRequestedBgmKey = nextBattleKey;
    }
    return true;
}

function getCurrentBgmTrack() {
    return AudioManager.currentBgmTrack;
}

function setBgmVolume(volume) {
    AudioManager.bgmVolume = clampBgmVolume(volume);
    window.stopStoryCues?.();
    applyBgmVolumeToAll();
    return AudioManager.bgmVolume;
}

function getBgmVolume() {
    return clampBgmVolume(AudioManager.bgmVolume);
}

function getBgmTrackOptions() {
    return Object.entries(BGM_TRACKS).map(([key, item]) => ({ key, label: item.label }));
}

function playSfx(name) {
    if (name === 'cook') {
        scheduleCookSfx();
        return;
    }
    playSfxNow(name);
}

function cancelPendingCookSfx() {
    window.stopStoryCues?.();
    window.DishEffects?.cancel();
    pendingCookSfxTimers.forEach(timer => clearTimeout(timer));
    pendingCookSfxTimers.clear();
}

function canPlayCookSfx(matchStartedAt) {
    // Cooking may end the match before this cue plays, including an already-ended guest view.
    if (typeof GameState !== 'undefined' &&
        (GameState.surrenderedBy || GameState.matchStartedAt !== matchStartedAt)) return false;
    return typeof window.isMatchInBattleScreen !== 'function' || window.isMatchInBattleScreen();
}

function scheduleCookSfx() {
    const matchStartedAt = typeof GameState !== 'undefined' ? GameState.matchStartedAt : null;
    if (!canPlayCookSfx(matchStartedAt)) return;
    if (window.DishEffects?.queueCookSound(() => {
        if (canPlayCookSfx(matchStartedAt)) playSfxNow('cook');
    }, COOK_SFX_DELAY_MS)) return;
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : COOK_SFX_DELAY_MS;
    if (delay === 0) {
        playSfxNow('cook');
        return;
    }
    // Keep one timer per completion so a second dish does not replace the first sound.
    const timer = setTimeout(() => {
        pendingCookSfxTimers.delete(timer);
        if (canPlayCookSfx(matchStartedAt)) playSfxNow('cook');
    }, delay);
    pendingCookSfxTimers.add(timer);
}

function playSfxNow(name, volumeScale = 1) {
    const base = AudioManager.sounds[name];
    if (!base) return;

    try {
        const sound = window.AudioPack.createAudio(base.__audioPackName);
        sound.volume = base.volume * volumeScale;
        const matchStartedAt = typeof GameState !== 'undefined' ? GameState.matchStartedAt : null;
        const cleanup = () => window.AudioPack.dispose(sound);
        sound.addEventListener('ended', cleanup, { once: true });
        sound.addEventListener('error', cleanup, { once: true });
        window.AudioPack.play(sound, () => AudioManager.sounds[name] === base &&
            (name !== 'cook' || canPlayCookSfx(matchStartedAt))).then(played => { if (!played) cleanup(); });
    } catch (_) {}
}

function playCookBgm() {
    if (!AudioManager.isUnlocked) return;
    playSfx('cook');
}

window.setupAudio = setupAudio;
window.unlockAudio = unlockAudio;
window.playBGM = playBGM;
window.playTitleBGM = playTitleBGM;
window.playStoryBGM = playStoryBGM;
window.previewCharacterTheme = previewCharacterTheme;
window.refreshCharacterBattleBGM = refreshCharacterBattleBGM;
window.playBattleModeBGM = playBattleModeBGM;
window.playResultBGM = playResultBGM;
window.stopBGM = stopBGM;
window.playSfx = playSfx;
window.playCookBgm = playCookBgm;
window.cancelPendingCookSfx = cancelPendingCookSfx;
window.addEventListener?.('pagehide', cancelPendingCookSfx);
window.setBgmEnabled = setBgmEnabled;
window.getBgmEnabled = getBgmEnabled;
window.setBgmTrack = setBgmTrack;
window.getCurrentBgmTrack = getCurrentBgmTrack;
window.setBgmVolume = setBgmVolume;
window.getBgmVolume = getBgmVolume;
window.setBattleModeBgmLocked = setBattleModeBgmLocked;
window.getBgmTrackOptions = getBgmTrackOptions;

// ADV cues use the existing sound and volume/mute controls; no new audio files.
(function (root) {
    let context = null;
    const nodes = new Set();
    // A single soft voice per beat; peak <= 8.5% of the selected BGM volume.
    const synthCues = Object.freeze({
        pop: [[520, 980, 0, .13, .065]],
        shock: [[210, 75, 0, .27, .08], [155, 65, .14, .22, .055]],
        laugh: [[610, 740, 0, .10, .06], [740, 880, .11, .10, .055], [610, 740, .22, .10, .05]],
        idea: [[880, 1320, 0, .12, .055], [1320, 1320, .13, .17, .05]],
        thud: [[115, 48, 0, .19, .085]],
        sparkle: [[1047, 1397, 0, .13, .05], [1568, 1760, .14, .17, .04]],
        swish: [[720, 180, 0, .15, .04]]
    });
    function stopStoryCues() {
        nodes.forEach(node => { try { node.stop(); } catch (_) {} });
        nodes.clear();
    }
    function pauseStoryCues() { context?.suspend?.()?.catch(() => {}); }
    function resumeStoryCues() { if (nodes.size) context?.resume?.()?.catch(() => {}); }
    function playStoryCue(kind, durationScale = 1) {
        if (!['chime', 'notify', 'crowd'].includes(kind) && !synthCues[kind]) return;
        if (!getBgmEnabled() || getBgmVolume() <= 0) return;
        durationScale = Math.max(.05, Math.min(1, Number(durationScale) || 1));
        stopStoryCues();
        const AudioContextClass = root.AudioContext || root.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            context ||= new AudioContextClass();
            context.resume().catch(() => {});
            const time = context.currentTime, volume = getBgmVolume();
            const voice = (node, offset, duration, level) => {
                offset *= durationScale; duration *= durationScale;
                const gain = context.createGain();
                gain.gain.setValueAtTime(0, time + offset);
                gain.gain.linearRampToValueAtTime(level * volume, time + offset + .025 * durationScale);
                gain.gain.exponentialRampToValueAtTime(.0001, time + offset + duration);
                node.connect(gain); gain.connect(context.destination); nodes.add(node);
                node.onended = () => { nodes.delete(node); node.disconnect(); gain.disconnect(); };
                node.start(time + offset); node.stop(time + offset + duration);
            };
            if (synthCues[kind]) {
                synthCues[kind].forEach(([from, to, offset, duration, level]) => {
                    const node = context.createOscillator(); node.type = 'sine';
                    node.frequency.setValueAtTime(from, time + offset * durationScale);
                    node.frequency.exponentialRampToValueAtTime(to, time + (offset + duration) * durationScale);
                    voice(node, offset, duration, level);
                });
            } else if (kind === 'chime') {
                [659.25, 523.25].forEach((frequency, index) => {
                    const node = context.createOscillator(); node.type = 'sine'; node.frequency.value = frequency;
                    voice(node, index * .34, .48, .13);
                });
            } else if (kind === 'notify') {
                [783.99, 1046.5].forEach((frequency, index) => {
                    const node = context.createOscillator(); node.type = 'sine'; node.frequency.value = frequency;
                    voice(node, index * .12, .2, .1);
                });
            } else if (kind === 'crowd') {
                const buffer = context.createBuffer(1, Math.floor(context.sampleRate * .65), context.sampleRate);
                const samples = buffer.getChannelData(0);
                let last = 0;
                for (let i = 0; i < samples.length; i++) {
                    last = last * .96 + (Math.random() * 2 - 1) * .04;
                    samples[i] = last;
                }
                const node = context.createBufferSource(); node.buffer = buffer;
                voice(node, 0, .65, .18);
            }
        } catch (_) { /* browsers may defer audio until a user gesture */ }
    }
    root.playStoryCue = playStoryCue;
    root.stopStoryCues = stopStoryCues;
    root.pauseStoryCues = pauseStoryCues;
    root.resumeStoryCues = resumeStoryCues;
})(window);
