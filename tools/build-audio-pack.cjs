'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const codec = require('../audio-pack-codec.js');

// Read seasonal owner originals directly; never copy their MP3 into the Web tree.
const externalSources = Object.freeze({
    'seasonal-halloween': path.resolve(__dirname, '../../battle-a-la-carte - ギットハブ版 -ユニティ改/新bgm/不気味な洋館.mp3')
});
function buildAudioPack({ sourceDir = path.resolve(__dirname, '../assets/audio'), outputDir = path.resolve(__dirname, '../assets/audio-pack'), additionalSources = externalSources } = {}) {
    const sources = Object.fromEntries(fs.readdirSync(sourceDir).filter(file => file.endsWith('.mp3')).map(file => [file.slice(0, -4), path.join(sourceDir, file)]));
    for (const [name, source] of Object.entries(additionalSources)) {
        if (!/^[a-z0-9-]+$/.test(name) || sources[name]) throw new Error(`Invalid or duplicate audio name: ${name}`);
        sources[name] = source;
    }
    const manifest = { format: 'BALCAUD1', tracks: {} };
    fs.mkdirSync(outputDir, { recursive: true });
    for (const name of Object.keys(sources).sort()) {
        const bytes = fs.readFileSync(sources[name]);
        if (!bytes.length) throw new Error(`Empty audio source: ${name}`);
        const file = name + '.balc';
        const encoded = codec.encode(bytes, name);
        fs.writeFileSync(path.join(outputDir, file), encoded);
        manifest.tracks[name] = { file, originalByteSize: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    }
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}
if (require.main === module) {
    const manifest = buildAudioPack();
    console.log(`Built ${Object.keys(manifest.tracks).length} audio packs in assets/audio-pack/`);
}
module.exports = { buildAudioPack, externalSources };
