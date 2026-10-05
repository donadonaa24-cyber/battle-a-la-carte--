'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { replacements, switchReferences } = require('../tools/switch-character-icons-v2.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const id of ['chizuru', 'mai', 'takumi', 'akatsuki']) test(`${id}: both pages use owner v3 sheets and retain v2 chef icons and legacy files`, () => {
    for (const [folder, stem] of [['character-icons', id + '-icons'], ['battle-mode-icons', id + '-battle-mode-icon']]) {
        const old = `assets/battle-images/${folder}/${stem}.webp`, target = `assets/battle-images/${folder}/${stem}-${folder === 'character-icons' ? 'v3' : 'v2'}.webp`;
        const present = fs.existsSync(path.join(root, target));
        assert.ok(fs.existsSync(path.join(root, old)), 'old artwork remains on disk');
        for (const file of ['style.css', 'mobile/style-sp.css']) {
            const css = read(file);
            assert.ok(css.includes(present ? target : old), file);
            assert.ok(!css.includes(present ? old : target), file);
            if (folder === 'character-icons') {
                assert.ok(css.includes(present ? target : `assets/images/${folder}/${stem}.png`), file + ': gallery');
                if (present) assert.ok(!css.includes(`assets/images/${folder}/${stem}.png`), file);
            }
        }
    }
    assert.ok(fs.existsSync(path.join(root, `assets/images/character-icons/${id}-icons-v2.png`)), 'v2 PNG remains');
    assert.ok(fs.existsSync(path.join(root, `assets/battle-images/character-icons/${id}-icons-v2.webp`)), 'v2 WebP remains');
});

test('all owner v3 PNG/WebP sheets are registered and PC/mobile use matching face and menu crops', () => {
    const manifest = JSON.parse(read('assets/battle-images/manifest.json'));
    for (const id of ['chizuru', 'mai', 'takumi', 'akatsuki']) {
        const original = `assets/images/character-icons/${id}-icons-v3.png`;
        const battle = `assets/battle-images/character-icons/${id}-icons-v3.webp`;
        const png = fs.readFileSync(path.join(root, original));
        assert.equal(png.readUInt32BE(16), 1536); assert.equal(png.readUInt32BE(20), 1024);
        const entries = manifest.filter(x => x.original === original);
        assert.equal(entries.length, 1); assert.equal(entries[0].battle, battle);
        assert.equal(entries[0].originalBytes, png.length);
        assert.equal(entries[0].bytes, fs.statSync(path.join(root, battle)).size);
        assert.equal(entries[0].width, 768); assert.equal(entries[0].height, 512);
        for (const file of ['style.css', 'mobile/style-sp.css']) {
            const css = read(file);
            assert.ok(!css.includes(`${id}-icons-v2.webp`));
            assert.match(css, new RegExp(`#start-gallery-list \\.char-${id} \\{ background-image: url\\("[^"\\n]*${id}-icons-v3\\.webp"\\);`));
            assert.match(css, new RegExp(`\\.character-icon\\.char-${id},\\s*\\.start-char-portrait\\.char-${id} \\{[^}]*background-size: 380% auto;`));
            for (const [face,position] of [['normal','4.761905'],['happy','50'],['worried','95.238095']]) {
                assert.match(css, new RegExp(`\\.character-icon\\.char-${id}\\.face-${face}[^{}]*\\{ background-position: ${position.replaceAll('.', '\\.')}% 38%; \\}`));
            }
        }
    }
    for (const [file,css] of [['web.html','style.css'],['mobile/mobile.html','style-sp.css']]) {
        assert.ok(read(file).includes(`${css}?v=20261004-menu-back1`));
    }
});
test('v2 switching is per-file, includes gallery and mobile URLs, and never changes crops or unrelated icons', () => {
    const input = 'url("../assets/battle-images/character-icons/mai-icons.webp"); background-position: calc(50% - 8px) 38%; ' +
        'url("assets/images/character-icons/mai-icons.png"); url("assets/battle-images/battle-mode-icons/mai-battle-mode-icon.webp"); ' +
        'url("assets/battle-images/character-icons/kanna-icons.webp");';
    const none = replacements(root, () => false); assert.equal(none.missing.length, 8);
    assert.equal(switchReferences(input, none.available), input);
    const partial = replacements(root, file => file.endsWith('mai-icons-v2.webp'));
    const output = switchReferences(input, partial.available);
    assert.equal(partial.missing.length, 7);
    assert.ok(output.includes('../assets/battle-images/character-icons/mai-icons-v2.webp'));
    assert.ok(!output.includes('assets/images/character-icons/mai-icons.png'));
    assert.ok(output.includes('mai-battle-mode-icon.webp'));
    assert.ok(output.includes('kanna-icons.webp'));
    assert.ok(output.includes('background-position: calc(50% - 8px) 38%'));
});
