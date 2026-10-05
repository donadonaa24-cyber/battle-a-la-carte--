'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const optionalSource = (t, sourceRoot, files) => require('./helpers/optional-source.cjs')(t, sourceRoot, files, fs);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const codec = require('../audio-pack-codec.js');
const { buildAudioPack } = require('../tools/build-audio-pack.cjs');
const manifest = JSON.parse(read('assets/audio-pack/manifest.json'));
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const sha256 = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');

test('all sources build deterministically, round-trip exactly and have non-audio headers and hashes', async t => {
    assert.equal(Object.keys(manifest.tracks).length, 16);
    for (const [name, track] of Object.entries(manifest.tracks)) {
        const encoded = fs.readFileSync(path.join(root, 'assets/audio-pack', track.file));
        const decoded = Buffer.from(codec.decode(encoded, name));
        assert.equal(decoded.length, track.originalByteSize, name);
        assert.equal(sha256(decoded), track.sha256, name);
        assert.deepEqual(Buffer.from(codec.encode(decoded, name)), encoded, name + ': deterministic pack');
        assert.equal(encoded.length, decoded.length + codec.HEADER_SIZE);
        assert.equal(encoded.subarray(0, 8).toString(), 'BALCAUD1');
        assert.notEqual(encoded.subarray(0, 3).toString(), 'ID3');
        assert.ok(!(encoded[0] === 255 && (encoded[1] & 224) === 224), name + ': no MPEG sync');
        await t.test(name + ': exact original comparison', t => {
            const file = 'assets/audio/' + name + '.mp3';
            if (!optionalSource(t, root, [file])) return;
            assert.deepEqual(decoded, fs.readFileSync(path.join(root, file)), name + ': exact round-trip');
        });
    }
    await t.test('complete source rebuild matches the shipped manifest and packs', t => {
    if (!optionalSource(t, root, Object.keys(manifest.tracks).map(name => 'assets/audio/' + name + '.mp3'))) return;
    const tmpRoot = path.join(root, 'tmp');
    fs.mkdirSync(tmpRoot, { recursive: true });
    const outputDir = fs.mkdtempSync(path.join(tmpRoot, 'audio-pack-test-'));
    try {
        const rebuilt = buildAudioPack({ outputDir });
        assert.deepEqual(rebuilt, manifest);
        assert.equal(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'), read('assets/audio-pack/manifest.json'));
        const sources = fs.readdirSync(path.join(root, 'assets/audio')).filter(file => file.endsWith('.mp3')).sort();
        assert.deepEqual(Object.keys(manifest.tracks), sources.map(file => file.slice(0, -4)));
        assert.equal(sources.length, 16);
        for (const [name, track] of Object.entries(manifest.tracks)) {
            const original = fs.readFileSync(path.join(root, 'assets/audio', name + '.mp3'));
            const encoded = fs.readFileSync(path.join(root, 'assets/audio-pack', track.file));
            assert.deepEqual(encoded, fs.readFileSync(path.join(outputDir, track.file)), name + ': deterministic');
            assert.deepEqual(Buffer.from(codec.decode(encoded, name)), original, name + ': exact round-trip');
            assert.equal(track.originalByteSize, original.length);
            assert.equal(track.sha256, sha256(original));
            assert.equal(encoded.length, original.length + codec.HEADER_SIZE);
            assert.equal(encoded.subarray(0, 8).toString(), 'BALCAUD1');
            assert.notEqual(encoded.subarray(0, 3).toString(), 'ID3');
            assert.ok(!(encoded[0] === 255 && (encoded[1] & 224) === 224), name + ': no MPEG sync');
        }
    } finally {
        // Only remove this test's resolved, freshly-created workspace temp directory.
        assert.ok(path.resolve(outputDir).startsWith(path.resolve(tmpRoot) + path.sep));
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
    });
});

test('codec rejects wrong name, bad header, length, checksum and invalid names', () => {
    const encoded = codec.encode(Uint8Array.from([1, 2, 3, 255]), 'cook');
    assert.throws(() => codec.decode(encoded, 'turn-start'), /checksum/);
    assert.throws(() => codec.decode(encoded.subarray(0, 10), 'cook'), /pack/);
    for (const [offset, error] of [[0, /pack/], [8, /size/], [12, /checksum/], [17, /checksum/]]) {
        const corrupt = encoded.slice(); corrupt[offset] ^= 1;
        assert.throws(() => codec.decode(corrupt, 'cook'), error);
    }
    assert.throws(() => codec.encode([1], '../cook'), /name/);
    assert.notDeepEqual(codec.encode([1, 2, 3], 'cook').slice(16), codec.encode([1, 2, 3], 'bgm').slice(16));
});

test('six owner tracks match copied sources; unassigned mansion is absent', async t => {
    const sourceDir = path.resolve(root, '../battle-a-la-carte - ギットハブ版 -ユニティ改/新bgm');
    for (const [id, source] of Object.entries({ chizuru: 'chiduru', mai: 'mai', takumi: 'takumi', akatsuki: 'akatsuki', kanna: 'kanna', tsuyoshi: 'tsuyoshi' })) {
        const track = manifest.tracks['theme-' + id];
        assert.ok(track);
        await t.test(id + ': owner source comparison', t => {
            if (!optionalSource(t, sourceDir, [source + '.mp3'])) return;
            assert.equal(track.sha256, sha256(fs.readFileSync(path.join(sourceDir, source + '.mp3'))));
        });
    }
    assert.ok(!fs.existsSync(path.join(root, 'assets/audio/不気味な洋館.mp3')));
    assert.ok(!Object.keys(manifest.tracks).some(name => name.includes('洋館')));
});

test('production HTML/JS have no raw audio references and load codec/loader before players', () => {
    // Production entry points; local backups, staging copies, tools, docs and test fixtures are not pages.
    const files = fs.readdirSync(root).filter(file => /\.(html|js)$/.test(file));
    for (const dir of ['mobile', 'story-data']) {
        files.push(...fs.readdirSync(path.join(root, dir)).filter(file => /\.(html|js)$/.test(file)).map(file => dir + '/' + file));
    }
    for (const file of files) assert.doesNotMatch(read(file), /\.mp3|assets\/audio\//i, file);
    for (const [file, prefix, audio] of [['web.html', '', 'audio.js'], ['mobile/mobile.html', '../', 'audio-sp.js']]) {
        const html = read(file), version = '?v=20261004-audio-pack1';
        const codecIndex = html.indexOf(prefix + 'audio-pack-codec.js' + version);
        const loaderIndex = html.indexOf(prefix + 'audio-pack.js' + version);
        const audioIndex = html.indexOf(audio + '?v=20261004-adv-menu1');
        assert.ok(codecIndex >= 0 && loaderIndex > codecIndex && audioIndex > loaderIndex);
        assert.ok(html.includes(prefix + 'character-themes.js' + version));
    }
});

function runtime({ mobile = false, gate = null, failed = new Set(), corrupt = false, badSize = false, manifestFailure = false } = {}) {
    const audios = [], requests = [], blobs = new Map(), revoked = [], listeners = {}, warnings = [];
    let nextUrl = 0;
    class Media {
        constructor() { this.src = ''; this.paused = true; this.volume = 1; this.currentTime = 0; this.handlers = {}; this.plays = 0; audios.push(this); }
        play() {
            this.plays++;
            if (this.failure) return Promise.reject(this.failure);
            assert.match(this.src, /^blob:/); this.paused = false; return Promise.resolve();
        }
        pause() { this.paused = true; }
        removeAttribute(name) { if (name === 'src') this.src = ''; }
        load() {}
        addEventListener(name, fn) { this.handlers[name] = fn; }
    }
    class BlobUrl extends URL {
        static createObjectURL(blob) { const url = 'blob:balc/' + ++nextUrl; blobs.set(url, blob); return url; }
        static revokeObjectURL(url) { revoked.push(url); blobs.delete(url); }
    }
    const fakeManifest = { format: 'BALCAUD1', tracks: {} };
    for (const name of Object.keys(manifest.tracks)) {
        fakeManifest.tracks[name] = { file: name + '.balc', originalByteSize: badSize ? 999 : 4, sha256: sha256([1, 2, 3, 4]) };
    }
    const c = vm.createContext({ Audio: Media, URL: BlobUrl, Blob, console: { warn: value => warnings.push(value) },
        document: { currentScript: { src: 'https://offline.invalid/game/audio-pack.js?v=20261004-audio-pack1' } },
        localStorage: { getItem: () => null },
        GameState: { characterIds: { player: 'chizuru', cpu: 'mai' }, matchStartedAt: 1 },
        setTimeout, clearTimeout, addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
        fetch: async url => {
            requests.push(url);
            const file = new URL(url).pathname.split('/').pop(), name = file.replace(/\.balc$/, '');
            if (gate && file !== 'manifest.json') await gate;
            if (failed.has(name)) throw new Error('Offline mock failure');
            const encoded = codec.encode([1, 2, 3, 4], name === 'manifest.json' ? 'cook' : name);
            if (corrupt) encoded[0] ^= 1;
            return { ok: !(manifestFailure && file === 'manifest.json'), json: async () => fakeManifest,
                arrayBuffer: async () => encoded.buffer };
        } });
    c.window = c;
    for (const file of ['audio-pack-codec.js', 'audio-pack.js', 'character-themes.js', mobile ? 'mobile/audio-sp.js' : 'audio.js']) {
        vm.runInContext(read(file), c, { filename: file });
    }
    return { c, audios, requests, blobs, revoked, listeners, warnings,
        player: key => vm.runInContext(`AudioManager.bgmPlayers[${JSON.stringify(key)}]`, c) };
}

test('pack loader shares fetch/blob URL by name, releases last owner and recreates URL from cached bytes', async () => {
    const r = runtime();
    const a = r.c.AudioPack.createAudio('cook'), b = r.c.AudioPack.createAudio('cook');
    await flush();
    assert.equal(a.src, b.src); const old = a.src;
    assert.equal(r.requests.length, 2);
    const blob = r.blobs.get(a.src);
    assert.equal(blob.type, 'audio/mpeg');
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from([1, 2, 3, 4]));
    r.c.AudioPack.dispose(a); assert.equal(r.revoked.length, 0);
    r.c.AudioPack.dispose(b); assert.deepEqual(r.revoked, [old]);
    const replacement = r.c.AudioPack.createAudio('cook');
    assert.notEqual(replacement.src, old);
    assert.equal(r.requests.length, 2);
    r.c.AudioPack.disposeAll(); assert.equal(r.blobs.size, 0);
    for (const url of r.requests) assert.equal(new URL(url).searchParams.get('v'), '20261004-audio-pack1');
});

for (const failure of ['fetch', 'corrupt', 'size', 'manifest']) {
    test(`pack ${failure} failure is silent, cached and warns only once`, async () => {
        const r = runtime({ failed: failure === 'fetch' ? new Set(['cook', 'turn-start']) : new Set(),
            corrupt: failure === 'corrupt', badSize: failure === 'size', manifestFailure: failure === 'manifest' });
        for (const name of ['cook', 'cook', 'turn-start']) assert.equal(await r.c.AudioPack.play(r.c.AudioPack.createAudio(name)), false);
        assert.equal(r.warnings.length, 1); assert.equal(r.blobs.size, 0);
        assert.ok(r.audios.every(audio => audio.plays === 0));
        assert.equal(r.requests.filter(url => url.includes('/cook.balc')).length, failure === 'manifest' ? 0 : 1);
    });
}

test('disposing and cancelling before fetch completes never plays or leaks a URL', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const r = runtime({ gate });
    const discarded = r.c.AudioPack.createAudio('cook');
    const play = r.c.AudioPack.play(discarded); r.c.AudioPack.dispose(discarded);
    const cancelled = r.c.AudioPack.createAudio('turn-start');
    const otherPlay = r.c.AudioPack.play(cancelled); r.c.AudioPack.cancelPlayback(cancelled);
    release(); assert.equal(await play, false); assert.equal(await otherPlay, false);
    assert.equal(discarded.plays + cancelled.plays, 0);
    r.c.AudioPack.disposeAll(); assert.equal(r.blobs.size, 0); assert.equal(r.warnings.length, 0);
});

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`${label}: all audio names exist, BGM 1–4 unchanged and all playback is blob HTMLAudio`, async () => {
        const r = runtime({ mobile }), c = r.c;
        c.setupAudio(); await flush();
        for (const audio of r.audios) assert.ok(manifest.tracks[audio.__audioPackName], audio.__audioPackName);
        const expected = { default: 'bgm', miracle: 'bgm-miracle', skyHigh: 'bgm-sky-high-refrain', code241: 'bgm-code241-2' };
        assert.deepEqual(JSON.parse(JSON.stringify(c.getBgmTrackOptions())), [
            { key: 'characterTheme', label: 'キャラのテーマ曲' }, ...Object.keys(expected).map((key, i) => ({ key, label: String(i + 1) }))]);
        c.unlockAudio();
        for (const [choice, name] of Object.entries(expected)) {
            c.setBgmTrack(choice); c.playBGM(); const audio = r.player('battle:' + choice);
            assert.equal(audio.__audioPackName, name); assert.match(audio.src, /^blob:/);
            assert.equal(audio.loop, true); assert.equal(audio.preload, 'auto'); assert.equal(audio.paused, false);
            assert.equal(audio.volume, .5 * .8);
        }
        for (const id of ['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna', 'tsuyoshi']) {
            assert.equal(c.CharacterThemes.trackFor(id), 'theme-' + id);
            c.GameState.characterIds.player = id; c.setBgmTrack('characterTheme'); c.playBGM();
            assert.equal(r.player('battle:theme-' + id).paused, false);
            c.playStoryBGM(id); assert.equal(r.player('theme:theme-' + id).paused, false);
            c.previewCharacterTheme(id); assert.equal(r.player('theme:theme-' + id).paused, false);
        }
        c.playTitleBGM(); assert.equal(r.player('title').__audioPackName, 'title-screen');
        c.playStoryBGM(); assert.equal(r.player('story').__audioPackName, 'story-dialogue');
        c.playBattleModeBGM(); assert.equal(r.player('battleMode').__audioPackName, 'battle-mode');
        c.playResultBGM(); assert.equal(r.player('result').__audioPackName, 'match-result');
        for (const name of ['gameStart', 'turnStart', 'gameEnd', 'cook']) {
            c.playSfxNow(name); const audio = r.audios.at(-1);
            assert.equal(audio.__audioPackName, name === 'cook' ? 'cook' : 'turn-start');
            assert.equal(audio.paused, false); audio.handlers.ended();
        }
        c.setBgmVolume(.25); assert.equal(r.player('result').volume, .46 * .25);
        c.setBgmEnabled(false); assert.ok(r.audios.every(audio => audio.paused));
        c.playBGM(); c.previewCharacterTheme('mai'); assert.ok(r.audios.every(audio => audio.paused));
        r.c.AudioPack.disposeAll(); assert.equal(r.blobs.size, 0);
    });
    test(`${label}: delayed decode honors latest track/mute, stop cancels warmup and setup revokes replaced URLs`, async () => {
        let release; const gate = new Promise(resolve => { release = resolve; });
        const r = runtime({ mobile, gate }), c = r.c;
        c.setupAudio(); c.unlockAudio(); c.playTitleBGM(); c.playStoryBGM('mai'); c.setBgmEnabled(false);
        release(); await flush(); assert.ok(r.audios.every(audio => audio.plays === 0));
        c.setBgmEnabled(true); assert.equal(r.player('theme:theme-mai').paused, false);
        const oldAudios = [...r.audios], oldUrls = new Set(r.blobs.keys());
        c.setupAudio(); await flush(); assert.ok(oldAudios.every(audio => audio.paused && audio.src === ''));
        for (const url of oldUrls) assert.ok(r.revoked.includes(url));
        r.c.AudioPack.disposeAll(); assert.equal(r.blobs.size, 0);

        let finish; const waiting = new Promise(resolve => { finish = resolve; });
        const stopped = runtime({ mobile, gate: waiting }); stopped.c.setupAudio(); stopped.c.unlockAudio(); stopped.c.stopBGM();
        finish(); await flush(); assert.ok(stopped.audios.every(audio => audio.plays === 0));
        stopped.c.AudioPack.disposeAll();
    });
    test(`${label}: slow first cook load cannot play in another match`, async () => {
        let release; const gate = new Promise(resolve => { release = resolve; });
        const r = runtime({ mobile, gate }); r.c.setupAudio(); r.c.playSfxNow('cook');
        const sound = r.audios.at(-1); r.c.GameState.matchStartedAt++;
        release(); await flush(); assert.equal(sound.plays, 0); assert.equal(sound.src, '');
        r.c.AudioPack.disposeAll();
    });
}

test('autoplay retry stays inside a later gesture and never resumes muted/stopped music', async () => {
    const r = runtime(); r.c.setupAudio(); await flush();
    const audio = r.player('title'); audio.failure = { name: 'NotAllowedError' };
    r.c.playTitleBGM(); await flush(); assert.equal(r.warnings.length, 0);
    delete audio.failure;
    r.listeners.pointerdown.forEach(fn => fn()); assert.equal(audio.paused, false);
    audio.pause(); audio.failure = { name: 'NotAllowedError' }; r.c.playTitleBGM(); await flush();
    r.c.setBgmEnabled(false); delete audio.failure;
    r.listeners.pointerdown.forEach(fn => fn()); assert.equal(audio.paused, true);
    let rejectLatePlay;
    audio.play = () => new Promise((resolve, reject) => { rejectLatePlay = reject; });
    r.c.setBgmEnabled(true); r.c.playTitleBGM();
    r.c.AudioPack.disposeAll(); assert.equal(r.blobs.size, 0);
    rejectLatePlay({ name: 'NotAllowedError' }); await flush();
    assert.equal(r.warnings.length, 0);
});

test('pagehide releases URLs unless the page enters the back-forward cache', async () => {
    const r = runtime(); r.c.setupAudio(); await flush();
    const count = r.blobs.size; assert.ok(count > 0);
    r.listeners.pagehide.forEach(fn => fn({ persisted: true })); assert.equal(r.blobs.size, count);
    r.listeners.pagehide.forEach(fn => fn({ persisted: false })); assert.equal(r.blobs.size, 0);
});
