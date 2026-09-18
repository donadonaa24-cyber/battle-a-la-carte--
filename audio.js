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
    const base = AudioManager.sounds[name];
    if (!base) return;

    try {
        const sound = base.cloneNode();
        sound.volume = base.volume;
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
window.setBgmEnabled = setBgmEnabled;
window.getBgmEnabled = getBgmEnabled;
window.setBgmTrack = setBgmTrack;
window.getCurrentBgmTrack = getCurrentBgmTrack;
window.setBgmVolume = setBgmVolume;
window.getBgmVolume = getBgmVolume;
window.setBattleModeBgmLocked = setBattleModeBgmLocked;
window.getBgmTrackOptions = getBgmTrackOptions;
