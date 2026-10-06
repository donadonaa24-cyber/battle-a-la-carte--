'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { buildMetrics, metricsScript } = require('../tools/measure-story-portraits.cjs');
const { geometry, bustGeometry, bustLayout, iconGeometry, iconLayout, intersects, declaration, assets } = require('./helpers/portrait-layout.cjs');
const metrics = JSON.parse(fs.readFileSync(path.join(root, 'story-data/portrait-metrics.json'), 'utf8'));
const viewports = [[1440, 900], [1366, 768], [390, 844], [360, 740], [844, 390]];
const heightOrder = ['tsuyoshi', 'takumi', 'akatsuki', 'kanna', 'chizuru', 'mai'];

test('owner heightRank runs from tallest 1 to shortest 6 and classmates share Chizuru height', () => {
    for (const [index, id] of heightOrder.entries()) assert.equal(metrics.characters[id].heightRank, index + 1 + (index > 0 ? 1 : 0), id);
    for (const id of ['classmate1', 'classmate2']) assert.equal(metrics.characters[id].heightRank, metrics.characters.chizuru.heightRank, id);
});

test('90b metrics enumerate every registered pose with measured source hashes and unchanged head/rank/offset',()=>{
    const crypto=require('node:crypto');
    for(const [id,c] of Object.entries(assets.characters)){
        const m=metrics.characters[id];assert.deepEqual(Object.keys(m.poses),Object.keys(c.poses));
        for(const [pose,value] of Object.entries(m.poses)){
            assert.equal(value.sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,value.source))).digest('hex'));
            assert.deepEqual(value.head,m.head,id+'/'+pose);
            assert.deepEqual(value.canvas,m.canvas);assert.deepEqual(value.renderCanvas,m.renderCanvas);
            assert.equal(value.heightRank,m.heightRank);assert.equal(value.headTopOffset,m.headTopOffset);
        }
    }
});

for(const viewport of viewports)for(const arc of [false,true])for(const [id,pose] of [['chizuru','behind'],['chizuru','cheer'],['kanna','pocket'],['mai','cheer'],['mai','behind']])
test(`90b ${viewport.join('x')} ${arc?'CLEAR':'ADV and viewer'} ${id}/${pose}: identical head size and approved height order`,()=>{
    const base=geometry(id,viewport,{arc}), posed=geometry(id,viewport,{arc,pose});
    assert.deepEqual(posed,base);
    const frames=heightOrder.map(character=>geometry(character,viewport,{arc,pose:character===id?pose:'default'}));
    for(let i=1;i<frames.length;i++){
        assert.ok(frames[i-1].hairTop<frames[i].hairTop);assert.ok(frames[i-1].eyeLine<frames[i].eyeLine);
    }
    assert.ok(posed.hairTop>=(arc?8:posed.toolbar+16)-1e-7);
    assert.ok(posed.chin<(arc?posed.frameHeight:posed.dialogueTop));
    assert.ok(posed.headLeft>=0&&posed.headRight<=posed.width);
});

test('all registered characters have source head measurements and the generated browser data matches JSON', () => {
    assert.deepEqual(Object.keys(metrics.characters).sort(), Object.keys(assets.characters).sort());
    const browser = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'story-data/portrait-metrics.js'), 'utf8'), { window: browser });
    assert.deepEqual(JSON.parse(JSON.stringify(browser.BattleStoryPortraitMetrics)), metrics);
    for (const [id, m] of Object.entries(metrics.characters)) {
        assert.ok(m.head.top < m.head.eyeLine && m.head.eyeLine < m.head.chin, id);
        assert.equal(m.head.height, m.head.chin - m.head.top);
        assert.equal(m.head.width, m.head.right - m.head.left + 1);
        assert.ok(m.head.height / m.canvas.height > .1 && m.head.height / m.canvas.height < .2, id + ': plausible measured head');
        assert.equal(Object.hasOwn(assets.characters[id], 'focusY'), false);
        assert.equal(Object.hasOwn(assets.characters[id], 'scale'), false);
    }
});

test('re-measuring original portraits twice is byte-deterministic and current', () => {
    const first = JSON.stringify(buildMetrics(), null, 2) + '\n', second = JSON.stringify(buildMetrics(), null, 2) + '\n';
    assert.equal(first, second);
    assert.equal(first, fs.readFileSync(path.join(root, 'story-data/portrait-metrics.json'), 'utf8'));
    assert.equal(metricsScript(JSON.parse(first)), fs.readFileSync(path.join(root, 'story-data/portrait-metrics.js'), 'utf8'));
});

for (const viewport of viewports) for (const arc of [false, true]) test(`${viewport.join('x')} ${arc ? 'six-portrait CLEAR' : 'ADV and viewer'}: same head size, visible hair/chin`, () => {
    // Legacy full/bust geometry and the six-character festival CLEAR use their portrait masters.
    const ids = Object.keys(metrics.characters).filter(id => assets.characters[id].portraits.normal && (!arc || !id.startsWith('classmate')));
    const frames = ids.map(id => [id, geometry(id, viewport, { arc })]);
    const sizes = frames.map(([, g]) => g.headHeight), target = sizes[0];
    assert.ok(Math.max(...sizes) / Math.min(...sizes) <= 1.03);
    for (const [id, g] of frames) {
        assert.ok(g.hairTop >= (arc ? 8 : g.toolbar + 16) - 1e-7, id + ': hair below toolbar/frame top');
        assert.ok(g.chin < (arc ? g.frameHeight : g.dialogueTop), id + ': chin above dialogue/frame bottom');
        assert.ok(g.headLeft >= 0 && g.headRight <= g.width, id + ': head fits horizontally');
        if (!arc) for (const position of ['left', 'right', 'farLeft', 'farRight']) {
            const placed = geometry(id, viewport, { position });
            assert.ok(placed.headLeft >= 28 - 1e-7 && placed.headRight <= viewport[0] - 28 + 1e-7, id + ': ' + position + ' no clipped hair, including retained slide/shake');
        }
    }
});

// Check positions produced by the shipped CSS, not just rank/offset metadata.
for (const viewport of viewports) for (const arc of [false, true]) test(`${viewport.join('x')} ${arc ? 'six-portrait CLEAR' : 'ADV and viewer'}: approved on-screen head-top steps and strict eye-line order`, () => {
    const frames = heightOrder.map(id => geometry(id, viewport, { arc }));
    const headHeight = frames[0].headHeight, base = arc ? 8 : frames[0].toolbar + 16;
    const offsets = [0, .025, .05, .075, .116, .141];
    for (const [index, frame] of frames.entries()) {
        assert.ok(Math.abs(frame.headHeight - headHeight) < 1e-7, heightOrder[index] + ': unified head size');
        assert.ok(Math.abs((frame.hairTop - base) / headHeight - offsets[index]) < 1e-9, heightOrder[index] + ': approved position');
        if (index) {
            const previous = frames[index - 1], step = index === 4 ? .041 : .025;
            assert.ok(Math.abs((frame.hairTop - previous.hairTop) / headHeight - step) < 1e-9, heightOrder[index] + ': head-top step');
            assert.ok(previous.eyeLine < frame.eyeLine, heightOrder[index] + ': measured eye-line order');
        }
    }
    assert.ok(Math.abs((frames.at(-1).hairTop - frames[0].hairTop) / headHeight - .141) < 1e-9, '14.1% total spread');
    if (!arc) for (const id of ['classmate1', 'classmate2']) {
        assert.ok(Math.abs(geometry(id, viewport).hairTop - frames[4].hairTop) < 1e-7, id + ': Chizuru head-top');
    }
});

test('wrapped controls, longer dialogue, viewport changes and source replacement still use measured framing', () => {
    for (const viewport of viewports) for (const toolbar of [66, 102, 150]) {
        const dialogue = viewport[1] < 500 ? 180 : 350;
        for (const id of Object.keys(assets.characters)) {
            const g = geometry(id, viewport, { toolbar, dialogue });
            assert.ok(g.hairTop >= toolbar + 16 - 1e-7 && g.chin < g.dialogueTop, id + ': measured layout bounds');
        }
    }
    // A newly supplied canvas/head changes the derived scale; no id-specific CSS edits.
    const changed = JSON.parse(JSON.stringify(metrics)); changed.characters.chizuru.head.height *= .8;
    const c = { document: { currentScript: null }, BattleStoryPortraitMetrics: changed }; c.window = c;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'story-data/characters.js'), 'utf8'), c);
    const style = {}; c.BattleStoryAssets.applyPortraitMetrics({ style: { setProperty: (k, v) => style[k] = v } }, 'chizuru');
    assert.equal(Number(style['--adv-canvas-scale']), metrics.characters.chizuru.canvas.height / changed.characters.chizuru.head.height);
});

test('PC and mobile load metrics before characters with bumped cache keys, and the viewer uses the shared ADV', () => {
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        const m = html.indexOf('portrait-metrics.js?v=20261007-osananajimi105a'), c = html.indexOf('characters.js?v=20261007-osananajimi105a');
        assert.ok(m >= 0 && m < c);
        assert.ok(html.includes('story-adv.js?v=20261007-osananajimi105a'));
        assert.ok(html.includes('story-adv.css?v=20261007-osananajimi105a'));
    }
    const adv = fs.readFileSync(path.join(root, 'story-adv.js'), 'utf8');
    assert.match(adv, /assets\.applyPortraitMetrics\(element, actor\.id, pose\)/);
    assert.match(adv, /assets\.applyPortraitMetrics\(frame, id, 'default'\)/);
    assert.match(adv, /ResizeObserver\(measureDialogue\)/);
    assert.doesNotMatch(adv, /adv-focus-y|adv-portrait-scale|adv-mark-y/);
});

const iconContext = { document: { readyState: 'loading', addEventListener() {} }, BattleStoryAssets: assets }; iconContext.window = iconContext;
vm.runInNewContext(fs.readFileSync(path.join(root, 'story-mode.js'), 'utf8').replace(/\}\)\(\);\s*$/,
    'window.__portraitEpisodes = EPISODES;\n})();'), iconContext);
for (const file of ['registry', ...[4,5,6,7,8,9,10].map(n => 'episode' + n)])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'story-data/' + file + '.js'), 'utf8'), iconContext);
const iconEpisodes = [...iconContext.__portraitEpisodes, ...iconContext.BattleStoryData.all()], iconCases = [];
for (const ep of iconEpisodes) {
    const phases = ep.scenes || ['pre','postWin','postLose'].map(id => ({ id, lines: ep[id] || [] }));
    for (const phase of phases) for (const line of phase.lines) {
        if (assets.characters[line.speaker] && !line.offscreen && !line.monologue)
            iconCases.push({ episode: ep.id, phase: phase.id, id: line.speaker, expression: line.expression || 'normal' });
        for (const actor of line.show || []) if (assets.characters[actor.id])
            iconCases.push({ episode: ep.id, phase: phase.id, id: actor.id, expression: actor.expression || 'normal' });
    }
}
const iconProof = [];
for (const viewport of viewports) test(`99a ${viewport.join('x')} all episodes normal/viewer: whole cells and text never intersect`, () => {
    assert.equal(iconEpisodes.length, 10);
    assert.ok(iconEpisodes.every(ep => ep.portraitStyle === 'icon'));
    const layout = iconLayout(viewport), size = layout.icon.width;
    assert.ok(Math.abs(size - layout.icon.height) < 1e-7);
    assert.ok(size >= (layout.phone ? 84 : layout.landscape ? 72 : 128));
    assert.ok(size <= (layout.phone ? 96 : layout.landscape ? 84 : 150));
    assert.ok(layout.text.height + 1e-7 >= layout.lineHeight * 3, 'at least three lines without growing the box');
    assert.equal(intersects(layout.text, layout.icon), false); assert.equal(intersects(layout.name, layout.icon), false);
    assert.ok(layout.icon.top > layout.dialogue.top && layout.icon.bottom < layout.dialogue.bottom, 'entire icon inside dialogue');
    for (const item of iconCases) {
        const file = assets.iconPath(item.id, item.expression);
        assert.ok(fs.existsSync(path.join(root, file)), file);
        if (assets.characters[item.id].icons) {
            assert.ok(assets.iconExpressions[item.expression], item.id + '/' + item.expression);
            assert.equal(file, assets.characters[item.id].icons[assets.iconExpressions[item.expression]]);
        } else {
            const g = iconGeometry(item.id, viewport), h = g.head, c = g.crop;
            assert.ok(h.left > c.left && h.right < c.right && h.top > c.top && h.bottom < c.bottom);
        }
        iconProof.push({ viewport, ...item, file, icon: layout.icon, text: layout.text, name: layout.name });
    }
    const narration = iconLayout(viewport, { narration: true });
    assert.equal(narration.icon, null); assert.ok(narration.text.width > layout.text.width, 'narration takes the full width');
});

test('99a whole cells keep gold frames and scrollable text; stage holds entrance standing art', () => {
    assert.equal(declaration('.story-adv[data-portrait-style="icon"] .adv-portraits', 'display'), 'block');
    assert.equal(declaration('.story-adv[data-portrait-style="icon"] .adv-text', 'overflow-y'), 'auto');
    assert.equal(declaration('.story-adv[data-portrait-style="icon"] .adv-face-icon', 'border'), '4px double #efbf62');
    assert.ok(declaration('.story-adv[data-portrait-style="icon"] .adv-face-icon', 'border-radius'));
    assert.equal(declaration('.adv-icon-crop.adv-icon-sheet img', 'width'), '100%');
    assert.equal(declaration('.adv-icon-crop.adv-icon-sheet img', 'height'), 'auto');
    assert.equal(declaration('.adv-icon-crop.adv-icon-sheet img', 'object-fit'), 'contain');
    assert.equal(declaration('.adv-intro-art', 'object-fit'), 'contain');
    assert.match(fs.readFileSync(path.join(root, 'story-adv.js'), 'utf8'), /if \(iconStyle\(\)\) \{\s*byId\('adv-portraits'\)\.replaceChildren\(\);/);
});

test('99a export five-viewport icon/text proof when requested', () => {
    assert.equal(iconProof.length, viewports.length * iconCases.length);
    if (process.env.BALC_ICON_PROOF) {
        const target = path.resolve(root, process.env.BALC_ICON_PROOF);
        assert.ok(target.startsWith(root + path.sep)); fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify({ version: '20261006-icons99e', source: 'shipped CSS + six-cell mapping; metrics only for classmates', viewports, cases: iconProof }, null, 2) + '\n');
    }
});

const bustProof = [];
for (const viewport of viewports) test(`98b ${viewport.join('x')} bust: large front speaker, readable text, listener face above the shorter box`, () => {
    const layout = bustLayout(viewport), phone = layout.phone;
    assert.ok(layout.dialogue.height / viewport[1] >= (phone ? .28 : .26));
    assert.ok(layout.dialogue.height / viewport[1] <= (phone ? .32 : .30) + 1e-7);
    assert.equal(layout.dialogue.left, 0); assert.equal(layout.dialogue.right, viewport[0]);
    assert.equal(layout.dialogue.bottom, viewport[1]);
    assert.ok(layout.text.height + 1e-7 >= layout.lineHeight * 3, 'room for three lines at the existing font size');
    assert.equal(layout.z.parent, 'auto', 'portrait parent must not trap the speaker behind the dialogue');
    assert.ok(layout.z.speaker > layout.z.dialogue && layout.z.listener < layout.z.dialogue);
    let speakerHead, listenerHead;
    for (const [id, character] of Object.entries(assets.characters).filter(([,c]) => c.portraits.normal)) for (const pose of Object.keys(character.poses)) {
        const speaker = bustGeometry(id, viewport, { pose });
        const listener = bustGeometry(id, viewport, { pose, side: 'right', dimmed: true });
        speakerHead ??= speaker.headHeight; listenerHead ??= listener.headHeight;
        assert.ok(Math.abs(speaker.headHeight - speakerHead) < 1e-7, id + '/' + pose + ': same speaking head size');
        assert.ok(Math.abs(listener.headHeight - listenerHead) < 1e-7, id + '/' + pose + ': same listener head size');
        assert.ok(Math.abs(listener.headHeight / speaker.headHeight - .75) < 1e-7);
        assert.ok(speaker.headHeight / viewport[1] >= (phone ? .15 : .22));
        assert.ok(speaker.headHeight / viewport[1] <= (phone ? .17 : .25));
        if (!phone) {
            assert.ok(speaker.eyeLine / viewport[1] >= .35 && speaker.eyeLine / viewport[1] <= .42, id + ': eye line in reference band');
            assert.ok(speaker.headLeft / viewport[0] >= .02 && speaker.headLeft / viewport[0] <= .04, id + ': hair close to left edge');
            assert.equal(speaker.cropBottom, viewport[1], 'speaker torso runs off the stage bottom');
            assert.ok((speaker.cropBottom - speaker.hairTop) / speaker.headHeight >= 3, 'visible through roughly waist depth');
            assert.ok(speaker.textLeft >= speaker.cropRight + 12, 'text and name to the right of the entire visible crop');
        } else {
            assert.ok(speaker.cropBottom > speaker.dialogueTop && speaker.cropBottom <= speaker.dialogueTop + layout.dialogue.height * .25,
                'speaker only overlaps the top quarter of the phone box');
            assert.ok(speaker.textTop >= speaker.cropBottom + 12, 'full-width text starts below the overlap');
        }
        assert.ok(speaker.nameLeft >= speaker.cropRight + 12, 'name plate clear of the entire crop');
        assert.ok(intersects(speaker.visible, layout.dialogue), 'speaker actually overlaps the box');
        assert.equal(intersects(speaker.visible, layout.text), false, id + ': text content rect never intersects the front crop');
        for (const frame of [speaker, listener]) {
            assert.ok(frame.cropTop >= frame.toolbar + 8 - frame.headHeight * .08 - 1e-7);
            assert.ok(frame.hairTop > frame.cropTop && frame.chin < frame.visibleBottom, id + ': full face visible');
            assert.ok(frame.headLeft >= frame.cropLeft + 8 && frame.headRight <= frame.cropRight - 8, id + ': hair has slide/motion reserve');
        }
        assert.ok(listener.chin < layout.dialogue.top, id + ': entire listener face above box');
        assert.equal(listener.visibleBottom, layout.dialogue.top, 'box hides listener chest');
        assert.ok(listener.cropBottom > layout.dialogue.top);
        bustProof.push({ viewport, id, pose, speaker, listener });
    }
});

test('98b narration puts both dimmed actors behind the box; long dialogue and wrapped controls preserve framing', () => {
    for (const viewport of viewports) for (const toolbar of [66, 102, 150]) {
        const layout = bustLayout(viewport, { toolbar, narration: true });
        for (const id of Object.keys(assets.characters)) for (const side of ['left', 'right']) {
            const g = bustGeometry(id, viewport, { toolbar, dimmed: true, side, narration: true });
            assert.ok(g.chin < layout.dialogue.top, id + ': narration face remains above box');
            assert.ok(g.z < layout.z.dialogue);
            assert.equal(intersects(g.visible, layout.text), false);
        }
        for (const id of Object.keys(assets.characters)) {
            const g = bustGeometry(id, viewport, { toolbar });
            assert.ok(g.hairTop >= toolbar + 8 - 1e-7, id + ': wrapped toolbar does not crop speaker');
            assert.equal(intersects(g.visible, g.text), false);
        }
    }
    const css = fs.readFileSync(path.join(root, 'story-adv.css'), 'utf8'), optIn = css.slice(css.indexOf('/* Episode opt-in:'));
    assert.equal(declaration('.story-adv[data-portrait-style="bust"] .adv-portrait.dimmed', 'filter'), 'brightness(.6)');
    assert.equal(declaration('.story-adv[data-portrait-style="bust"] .adv-text', 'overflow-y'), 'auto', 'long text scrolls instead of growing the box');
    assert.match(optIn, /\.adv-screen-shake\[data-portrait-style="bust"\] \.adv-portraits \{ animation: none; \}/);
    assert.match(optIn, /\.adv-screen-shake\[data-portrait-style="bust"\] \.adv-portrait \{ animation: adv-small-shake \.26s ease-out; \}/);
    assert.equal(declaration('.story-adv[data-portrait-style="bust"] .adv-portrait', 'transform'), 'none');
});

// Optional artifact written by these same offline assertions, without a browser or server.
test('98b export the verified five-viewport layout rectangles when requested', () => {
    assert.equal(bustProof.length, 65);
    if (process.env.BALC_BUST_PROOF) {
        const target = path.resolve(root, process.env.BALC_BUST_PROOF);
        assert.ok(target.startsWith(root + path.sep), 'proof stays inside the working folder');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify({ version: '20261006-bust98b', source: 'shipped CSS arithmetic + portrait-metrics.json',
            viewports, cases: bustProof }, null, 2) + '\n');
    }
});

test('94b portrait cache keys cover all 160 replaced expressions and poses in PC and mobile URLs', () => {
    for (const base of ['https://offline.invalid/web/story-data/characters.js?v=1', 'https://offline.invalid/mobile/../story-data/characters.js?v=1']) {
        const context = {document:{currentScript:{src:base}},URL}; context.window=context;
        vm.runInNewContext(fs.readFileSync(path.join(root,'story-data/characters.js'),'utf8'),context);
        const a=context.BattleStoryAssets;
        let changed=0;
        for(const [id,c] of Object.entries(a.characters)) for(const file of Object.values(c.poses).flatMap(Object.values)) {
            const expected=new URL('../'+file,base).href+'?v=20261005-face95b';
            assert.equal(a.url(file),expected,file);
            changed++;
        }
        assert.equal(changed,160);
        for (const file of [...Object.values(a.backgrounds), ...Object.values(a.characters).map(c=>c.standing).filter(Boolean)])
            assert.equal(a.url(file),new URL('../'+file,base).href + (/(?:tsuyoshi|yuzuki|ryuta)-standing|\/backgrounds\/(?:summer|halloween|kyudo)-|school-gate-evening-sakuraba|big-park-/.test(file) ? '?v=20261007-osananajimi105a' : ''),file);
    }
});
