'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { readPng } = require('../tools/measure-story-portraits.cjs');
const { buildMetrics, metricsScript } = require('../tools/measure-story-icons.cjs');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const metrics = JSON.parse(read('story-data/icon-metrics.json'));
const optionalSource = require('./helpers/optional-source.cjs');
const proofFile = 'docs/story/art-review/icons-99c-alpha.json';
const proof = fs.existsSync(path.join(root, proofFile)) ? JSON.parse(read(proofFile)) : null;
test('99c measurements regenerate exactly, including script and reviewed source hashes', () => {
    assert.deepEqual(buildMetrics(), metrics);
    assert.equal(metricsScript(metrics), read('story-data/icon-metrics.js'));
});
for (const [id, character] of Object.entries(metrics.characters)) {
    test(`99c ${id}: all 6 cells align eyes and cheek width within 1px in 5 viewports, ADV and battle`, () => {
        const c = { window: {} }; vm.runInNewContext(read('story-data/icon-metrics.js'), c);
        const apply = c.window.BattleStoryIconMetrics.apply;
        for (const [w, h] of [[1366,768],[1440,900],[390,844],[360,740],[844,390]]) {
            const advSize = h < 500 ? 84 : w < 600 ? Math.max(84, Math.min(96, w*.24)) : Math.max(128, Math.min(150, w*.10));
            for (const size of [advSize, 72, 96, 120, 180]) {
                for (const [cell, m] of Object.entries(character.cells)) {
                    const image = { style: {} }; assert.equal(apply(image, id, cell), true);
                    const scale = parseFloat(image.style.width)/100;
                    const x = (parseFloat(image.style.left)/100 + m.eyeCenter.x/512*scale)*size;
                    const y = (parseFloat(image.style.top)/100 + m.eyeCenter.y/512*scale)*size;
                    assert.ok(Math.abs(x-size/2) < 1, `${id}/${cell} x`);
                    assert.ok(Math.abs(y-character.targetEye.y*size) < 1, `${id}/${cell} y`);
                    assert.ok(Math.abs(m.faceWidth/512*scale*size-character.targetFaceWidth*size) < 1);
                    assert.ok(m.left <= 0 && m.top <= 0 && m.left+scale >= 1 && m.top+scale >= 1, 'canvas covers the frame');
                    assert.equal(image.style.height, 'auto', 'preserve proportions');
                }
            }
        }
    });
    test(`99c ${id}: transparent masters keep every source RGB and have soft connected edges`, t => {
        if (!optionalSource(t, root, [proofFile])) return;
        for (const record of proof.records.filter(r => r.id === id)) {
            const source = readPng(path.join(root, record.source)), cutout = readPng(path.join(root, record.original));
            assert.deepEqual([cutout.width,cutout.height], [source.width,source.height]);
            let soft = 0, clear = 0;
            for (let p = 0; p < source.rgba.length; p+=4) {
                assert.equal(cutout.rgba[p], source.rgba[p], 'red');
                assert.equal(cutout.rgba[p+1], source.rgba[p+1], 'green');
                assert.equal(cutout.rgba[p+2], source.rgba[p+2], 'blue');
                if (!cutout.rgba[p+3]) clear++;
                else if (cutout.rgba[p+3]<255) soft++;
            }
            assert.ok(clear > source.width*source.height*.1); assert.ok(soft > 30);
            if (record.cell !== 'standing') {
                const eye = character.cells[record.cell].eyeCenter;
                assert.equal(cutout.rgba[(eye.y*512+eye.x)*4+3],255,'no hole in the face');
                for (let x = 0; x < 512; x++) {
                    const a = cutout.rgba[((511*512+x)*4)+3];
                    assert.ok(a === 0 || a === 255, 'original bust cut stays sharp');
                }
            }
        }
    });
}
test('99c both pages load shared metrics before battle frames and owner-editable intro data before ADV', () => {
    for (const file of ['web.html','mobile/mobile.html']) {
        const html = read(file);
        for (const name of ['icon-metrics','character-intros']) assert.ok(html.includes(`story-data/${name}.js?v=20261007-osananajimi105a`));
        assert.ok(html.indexOf('story-data/icon-metrics.js') < html.indexOf('battle-images.js'));
        assert.ok(html.indexOf('story-data/character-intros.js') < html.indexOf('story-adv.js'));
    }
    const c = { window: {} }; vm.runInNewContext(read('story-data/character-intros.js'), c);
    assert.deepEqual(Object.values(c.window.BattleStoryCharacterIntros).map(x=>x.name), ['千鶴','舞依','拓海','暁','栞那','剛','結月','龍太']);
    for (const intro of Object.values(c.window.BattleStoryCharacterIntros)) for (const field of ['title','subtitle','text']) assert.equal(intro[field],'');
    const css = read('story-adv.css');
    assert.match(css, /\.adv-intro-copy\s*\{[^}]*left: 6%;[^}]*bottom: 17%/);
    assert.match(css, /adv-intro-in \.32s/); assert.match(css, /adv-intro-out \.18s/);
    assert.match(css, /adv-intro-fade-in \.1s/);
});

test('102b 結月 and all kyudo sets have native measurements; costume application uses their own eye/cheek geometry',()=>{
    const c={window:{}};vm.runInNewContext(read('story-data/icon-metrics.js'),c);const data=c.window.BattleStoryIconMetrics;
    for(const key of ['yuzuki','yuzuki-kyudo','takumi-kyudo','mai-kyudo']) {
        assert.ok(data.characters[key]);assert.equal(Object.keys(data.characters[key].cells).length,6);
        const [id,costume='default']=key.split('-');
        for(const [cell,m]of Object.entries(data.characters[key].cells)){const img={style:{}};assert.equal(data.apply(img,id,cell,costume),true);assert.equal(img.style.width,m.scale*100+'%');}
    }
    const ranks=JSON.parse(read('story-data/portrait-metrics.json')).characters;
    assert.equal(ranks.yuzuki.heightRank,8);assert.ok(ranks.yuzuki.heightRank>ranks.mai.heightRank);assert.ok(ranks.yuzuki.headTopOffset>ranks.mai.headTopOffset);
});
