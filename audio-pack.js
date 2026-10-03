(function (root) {
    'use strict';
    const VERSION = '20261004-audio-pack1';
    const baseUrl = new URL('assets/audio-pack/', document.currentScript.src);
    const cache = new Map(), records = new Map(), blocked = new Map();
    let manifestPromise = null, warned = false;
    function warnOnce() {
        if (warned) return;
        warned = true;
        console.warn('音声パックを読み込めませんでした。音声を停止します。');
    }
    async function fetchFile(file) {
        const url = new URL(file, baseUrl);
        url.searchParams.set('v', VERSION);
        const response = await fetch(url.href);
        if (!response.ok) throw new Error('Audio pack unavailable');
        return response;
    }
    function resource(name) {
        if (cache.has(name)) return cache.get(name);
        const entry = { url: null, refs: 0, blob: null, ready: null };
        cache.set(name, entry);
        entry.ready = (async () => {
            manifestPromise ||= fetchFile('manifest.json').then(response => response.json());
            const manifest = await manifestPromise;
            const track = Object.prototype.hasOwnProperty.call(manifest.tracks, name) ? manifest.tracks[name] : null;
            if (manifest.format !== 'BALCAUD1' || !track || track.file !== name + '.balc') throw new Error('Unknown audio pack');
            const response = await fetchFile(track.file);
            const bytes = root.AudioPackCodec.decode(await response.arrayBuffer(), name);
            if (bytes.length !== track.originalByteSize) throw new Error('Invalid audio pack size');
            entry.blob = new Blob([bytes], { type: 'audio/mpeg' });
            return entry;
        })().catch(() => { warnOnce(); return null; });
        return entry;
    }
    function createAudio(name) {
        const audio = new Audio();
        audio.__audioPackName = name;
        const entry = resource(name);
        const record = { entry, released: false, attached: false, ready: null, revision: 0 };
        records.set(audio, record);
        function attach(loaded) {
            if (!loaded || record.released) return false;
            entry.url ||= URL.createObjectURL(entry.blob);
            entry.refs++;
            record.attached = true;
            audio.src = entry.url;
            return true;
        }
        record.ready = (entry.blob ? Promise.resolve(attach(entry)) : entry.ready.then(attach))
            .catch(() => { dispose(audio); warnOnce(); return false; });
        return audio;
    }
    function dispose(audio) {
        const record = records.get(audio);
        if (!record) return;
        record.released = true;
        blocked.delete(audio);
        records.delete(audio);
        try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) {}
        if (record.attached && --record.entry.refs === 0) {
            URL.revokeObjectURL(record.entry.url);
            record.entry.url = null;
        }
    }
    function attempt(audio, guard) {
        if (!records.has(audio) || !guard()) return Promise.resolve(false);
        blocked.delete(audio);
        try {
            return Promise.resolve(audio.play()).then(() => records.has(audio) && guard()).catch(error => {
                if (error?.name === 'NotAllowedError') {
                    if (records.has(audio) && guard()) blocked.set(audio, guard);
                }
                else if (error?.name !== 'AbortError') warnOnce();
                return false;
            });
        } catch (_) { warnOnce(); return Promise.resolve(false); }
    }
    function play(audio, guard = () => true) {
        const record = records.get(audio);
        if (!record || !guard()) return Promise.resolve(false);
        const revision = record.revision;
        const wanted = () => !record.released && record.revision === revision && guard();
        // Ready players call native play synchronously, retaining user activation.
        if (record.attached) return attempt(audio, wanted);
        return record.ready.then(ready => ready && wanted() ? attempt(audio, wanted) : false);
    }
    function cancelPlayback(audio) {
        blocked.delete(audio);
        const record = records.get(audio);
        if (record) record.revision++;
    }
    function disposeAll() { for (const audio of records.keys()) dispose(audio); }
    // If decoding finished after a gesture, retry a browser-blocked BGM on the next gesture.
    function retryBlocked() {
        for (const [audio, guard] of blocked) { blocked.delete(audio); if (guard()) void attempt(audio, guard); }
    }
    root.addEventListener?.('pointerdown', retryBlocked);
    root.addEventListener?.('touchend', retryBlocked);
    root.addEventListener?.('keydown', retryBlocked);
    root.addEventListener?.('pagehide', event => { if (!event.persisted) disposeAll(); });
    root.AudioPack = Object.freeze({ createAudio, play, dispose, disposeAll, cancelPlayback });
})(window);
