(function (root) {
    'use strict';
    // The only character-to-track mapping, shared by PC, phone, ADV and gallery.
    const tracks = Object.freeze({ chizuru: 'theme-chizuru', mai: 'theme-mai', akatsuki: 'theme-akatsuki', takumi: 'theme-takumi', kanna: 'theme-kanna', tsuyoshi: 'theme-tsuyoshi' });
    const STORAGE_KEY = 'battle-a-la-carte:bgm-track:v1';
    const normalize = key => key === 'variantA' ? 'miracle' :
        ['default', 'miracle', 'skyHigh', 'code241', 'characterTheme'].includes(key) ? key : 'default';
    let choice = null;
    function savedChoice(fallback) {
        if (choice !== null) return choice;
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null) return normalize(saved);
            // Earlier versions stored a BGM choice inside the CPU match autosave.
            const old = JSON.parse(localStorage.getItem('battle-a-la-carte:match-autosave:v1') || 'null')?.snapshot?.settings?.bgmTrack;
            if (old) return saveChoice(old);
        } catch (_) { /* Continue with the active choice when storage is unavailable. */ }
        return fallback ? normalize(fallback) : 'characterTheme';
    }
    function saveChoice(key) {
        choice = normalize(key);
        try { localStorage.setItem(STORAGE_KEY, choice); } catch (_) {}
        return choice;
    }
    root.CharacterThemes = Object.freeze({ tracks, trackFor: id => Object.prototype.hasOwnProperty.call(tracks, id) ? tracks[id] : 'default', savedChoice, saveChoice });
})(typeof window === 'undefined' ? globalThis : window);
