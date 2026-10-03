'use strict';
// Synchronous, already-decoded media for existing game/timer unit tests.
// The actual asynchronous pack loader is exercised in audio-pack.test.cjs.
module.exports = function audioPackStub(Audio, onPlay = () => {}) {
    const disposed = new WeakSet();
    return {
        createAudio(name) {
            const audio = new Audio('blob:balc/' + name);
            audio.__audioPackName = name;
            audio.addEventListener ||= () => {};
            return audio;
        },
        play(audio, guard = () => true) {
            if (disposed.has(audio) || !guard()) return Promise.resolve(false);
            onPlay(audio);
            return audio.play().then(() => true).catch(() => false);
        },
        dispose(audio) { disposed.add(audio); audio.pause(); },
        cancelPlayback() {}, disposeAll() {}
    };
};
