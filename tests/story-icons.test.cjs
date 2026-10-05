'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { readPng } = require('../tools/measure-story-portraits.cjs');
const { sources, cells, standingSource } = require('../tools/build-story-icons-99a.cjs');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(root, '../battle-a-la-carte - ギットハブ版 -ユニティ改');
const optionalSource = require('./helpers/optional-source.cjs');
const proofFile = 'docs/story/art-review/icons-99a-provenance.json';
const proof = fs.existsSync(path.join(root, proofFile)) ? JSON.parse(fs.readFileSync(path.join(root, proofFile), 'utf8')) : null;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/battle-images/manifest.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function cellPixels(image, index) {
    const raw = Buffer.alloc(512 * 512 * 4), left = index % 3 * 512, top = Math.floor(index / 3) * 512;
    for (let y = 0; y < 512; y++) {
        const offset = ((top + y) * image.width + left) * 4;
        image.rgba.copy(raw, y * 512 * 4, offset, offset + 512 * 4);
    }
    return raw;
}
for (const [id, source] of Object.entries(sources)) test(`99a ${id}: all six PNGs are exact source cells and WebPs fit their budget`, t => {
    if (!optionalSource(t, root, [proofFile])) return;
    const sourceFile = path.join(sourceRoot, source), image = fs.existsSync(sourceFile) ? readPng(sourceFile) : null;
    if (image) assert.deepEqual([image.width, image.height], [1536, 1024]);
    for (const [index, cell] of cells.entries()) {
        const record = proof.cells.find(item => item.id === id && item.cell === cell);
        assert.equal(record.source, source); assert.equal(record.index, index);
        assert.deepEqual(record.box, { left: index % 3 * 512, top: Math.floor(index / 3) * 512, width: 512, height: 512 });
        const png = readPng(path.join(root, record.original));
        assert.deepEqual([png.width, png.height], [512, 512]); assert.equal(hash(png.rgba), record.rgbaSha256);
        if (image) {
            assert.equal(hash(fs.readFileSync(sourceFile)), record.sourceSha256);
            assert.deepEqual(png.rgba, cellPixels(image, index), id + '/' + cell + ': every RGBA pixel');
        }
        const entry = manifest.find(item => item.original === record.original);
        assert.equal(entry.battle, record.battle); assert.deepEqual([entry.width, entry.height], [256, 256]);
        assert.equal(entry.bytes, fs.statSync(path.join(root, entry.battle)).size); assert.ok(entry.bytes <= 40 * 1024);
        const webp = fs.readFileSync(path.join(root, entry.battle));
        assert.equal(webp.toString('ascii', 0, 4), 'RIFF'); assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    }
    t.assert.equal(proof.cells.filter(item => item.id === id).length, 6);
});
test('99a Tsuyoshi standing PNG is an unchanged source copy and WebP matches the existing standing format', t => {
    if (!optionalSource(t, root, [proofFile])) return;
    const record = proof.standing, original = fs.readFileSync(path.join(root, record.original));
    assert.equal(hash(original), record.sourceSha256); assert.equal(record.source, standingSource);
    const sourceFile = path.join(sourceRoot, standingSource);
    if (fs.existsSync(sourceFile)) assert.deepEqual(original, fs.readFileSync(sourceFile));
    const entry = manifest.find(item => item.original === record.original);
    assert.deepEqual([entry.width, entry.height], [512, 768]); assert.ok(entry.bytes < 100 * 1024);
});
