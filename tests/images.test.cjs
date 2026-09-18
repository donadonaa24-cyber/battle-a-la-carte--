const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('battle WebP assets are small and all original PNGs are retained', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/battle-images/manifest.json')));
    assert.equal(manifest.length, 65);
    assert.ok(manifest.reduce((n, x) => n + x.bytes, 0) < 5 * 1024 * 1024);
    for (const x of manifest) {
        assert.equal(fs.statSync(path.join(root, x.original)).size, x.originalBytes);
        assert.equal(fs.statSync(path.join(root, x.battle)).size, x.bytes);
        if (/\/(cards|events|recipes|packs)\//.test(x.battle) || x.battle.endsWith('card-back.webp')) {
            assert.equal(x.width, 256); assert.equal(x.height, 384); assert.ok(x.bytes < 102400);
        }
    }
    for (const file of ['main.js','mobile/main-sp.js']) assert.match(fs.readFileSync(path.join(root,file),'utf8'), /BattleImages.originalPath/);
    for (const file of ['render.js','mobile/render-sp.js']) {
        const code=fs.readFileSync(path.join(root,file),'utf8');
        assert.doesNotMatch(code,/GameState\.players|GameState\?\.players/);
        assert.doesNotMatch(code,/const ingredientPaths = Object.keys/);
        assert.match(code,/await img.decode\(\)/);
    }
});

test('Battle a la carte Mode BGM exists at the path used by both game pages', () => {
    const audioPath = path.join(root, 'assets/audio/battle-mode.mp3');
    assert.ok(fs.existsSync(audioPath), 'assets/audio/battle-mode.mp3 is required');
    assert.ok(fs.statSync(audioPath).size > 1024 * 1024, 'Mode BGM must not be an empty placeholder');
    assert.match(fs.readFileSync(path.join(root, 'audio.js'), 'utf8'), /assets\/audio\/battle-mode\.mp3/);
    assert.match(fs.readFileSync(path.join(root, 'mobile/audio-sp.js'), 'utf8'), /\.\.\/assets\/audio\/battle-mode\.mp3/);
    for (const file of ['audio.js', 'mobile/audio-sp.js']) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        for (const [, relative] of code.matchAll(/new Audio\(['"](?:\.\.\/)?(assets\/audio\/[^?'"]+)/g)) {
            assert.ok(fs.existsSync(path.join(root, relative)), `${file} references missing ${relative}`);
        }
    }
});
