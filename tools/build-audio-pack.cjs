'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const codec = require('../audio-pack-codec.js');

function buildAudioPack({ sourceDir = path.resolve(__dirname, '../assets/audio'), outputDir = path.resolve(__dirname, '../assets/audio-pack') } = {}) {
    const names = fs.readdirSync(sourceDir).filter(file => file.endsWith('.mp3')).sort();
    const manifest = { format: 'BALCAUD1', tracks: {} };
    fs.mkdirSync(outputDir, { recursive: true });
    for (const source of names) {
        const name = source.slice(0, -4);
        const bytes = fs.readFileSync(path.join(sourceDir, source));
        if (!bytes.length) throw new Error(`Empty audio source: ${source}`);
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
module.exports = { buildAudioPack };
