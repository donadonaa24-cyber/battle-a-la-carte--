const BGM_TRACKS = {
    default: { label: '1', src: 'assets/audio/bgm.mp3' },
    miracle: { label: '2', src: 'assets/audio/bgm-miracle.mp3' },
    skyHigh: { label: '3', src: 'assets/audio/bgm-sky-high-refrain.mp3' },
    code241: { label: '4', src: 'assets/audio/bgm-code241-2.mp3' }
};

const LEGACY_BGM_TRACK_ALIAS = {
    variantA: 'miracle'
};

const CONTEXT_BGM_TRACKS = {
    title: 'assets/audio/title-screen.mp3',
    story: 'assets/audio/story-dialogue.mp3',
    battleMode: 'assets/audio/battle-mode.mp3?v=20260918',
    result: 'assets/audio/match-result.mp3'
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
    currentBgmTrack: 'default',
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
    return `battle:${normalizeTrackKey(trackKey)}`;
}

function getBaseVolumeByKey(key) {
    if (String(key || '').startsWith('battle:')) return BASE_BGM_VOLUME.battle;
    return BASE_BGM_VOLUME[key] || BASE_BGM_VOLUME.battle;
}

function createLoopAudio(src, baseVolume) {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = 'auto';
    audio.__baseVolume = Number.isFinite(Number(baseVolume)) ? Number(baseVolume) : BASE_BGM_VOLUME.battle;
    audio.volume = Math.max(0, Math.min(1, audio.__baseVolume * AudioManager.bgmVolume));
    return audio;
}

function createBgmPlayers() {
    const players = {};
    Object.entries(BGM_TRACKS).forEach(([key, track]) => {
        const playerKey = getBattleBgmKey(key);
        players[playerKey] = createLoopAudio(track.src, getBaseVolumeByKey(playerKey));
    });
    Object.entries(CONTEXT_BGM_TRACKS).forEach(([contextKey, src]) => {
        players[contextKey] = createLoopAudio(src, getBaseVolumeByKey(contextKey));
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
    player.play().catch(() => {});
}

function setupAudio() {
    cancelPendingCookSfx();
    AudioManager.sounds = {
        gameStart: new Audio('assets/audio/turn-start.mp3'),
        turnStart: new Audio('assets/audio/turn-start.mp3'),
        gameEnd: new Audio('assets/audio/turn-start.mp3'),
        cook: new Audio('assets/audio/cook.mp3')
    };

    stopAllBgm();
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
    if (warmup) {
        warmup.play().then(() => {
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

function playStoryBGM() {
    AudioManager.battleModeLocked = false;
    playBgmByKey('story');
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
        stopAllBgm();
        return;
    }
    if (!AudioManager.isUnlocked) return;
    playBgmByKey(AudioManager.lastRequestedBgmKey || getBattleBgmKey(AudioManager.currentBgmTrack));
}

function getBgmEnabled() {
    return AudioManager.bgmEnabled;
}

function setBgmTrack(trackKey) {
    const normalized = normalizeTrackKey(trackKey);
    if (!BGM_TRACKS[normalized]) return false;

    AudioManager.currentBgmTrack = normalized;
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
        const sound = base.cloneNode();
        sound.volume = base.volume * volumeScale;
        sound.play().catch(() => {});
    } catch (error) {
        console.log(`SE playback skipped: ${name}`);
    }
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
    function stopStoryCues() {
        nodes.forEach(node => { try { node.stop(); } catch (_) {} });
        nodes.clear();
    }
    function pauseStoryCues() { context?.suspend?.()?.catch(() => {}); }
    function resumeStoryCues() { if (nodes.size) context?.resume?.()?.catch(() => {}); }
    function playStoryCue(kind, durationScale = 1) {
        if (!getBgmEnabled() || getBgmVolume() <= 0) return;
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
            if (kind === 'chime') {
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
