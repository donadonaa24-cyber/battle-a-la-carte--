'use strict';
// Offline, read-only artwork analysis. Only the two layout data outputs are written.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
// Owner addendum, 2026-10-04: rank 1 is tallest; classmates share Chizuru's rank.
const heightRanks = Object.freeze({ tsuyoshi: 1, ryuta: 2, takumi: 3, akatsuki: 4, kanna: 5, chizuru: 6, mai: 7, yuzuki: 8, classmate1: 6, classmate2: 6 });
// Owner-approved head-height fractions, 2026-10-04. Kanna -> Chizuru needs 4.1%
// to preserve the measured eye-line order without changing the artwork/head size.
// 105a: owner order 剛 > 龍太 > 拓海 > 暁 > 栞那 > 千鶴 > 舞依 > 結月.
// Insert 龍太 between 剛 and 拓海; retain every existing character head offset.
const headTopOffsets = Object.freeze([0, .0125, .025, .05, .075, .116, .141, .166]);

// The owner supplies non-interlaced 8-bit RGB/RGBA PNGs. No native/npm dependency.
function readPng(file) {
    const png = fs.readFileSync(file), chunks = [];
    if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Expected PNG: ' + file);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), type = png[25];
    if (png[24] !== 8 || ![2, 6].includes(type) || png[28] !== 0) throw Error('Use 8-bit non-interlaced RGB/RGBA PNG: ' + file);
    for (let offset = 8; offset < png.length;) {
        const size = png.readUInt32BE(offset), kind = png.toString('ascii', offset + 4, offset + 8);
        if (kind === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + size));
        offset += size + 12;
    }
    const channels = type === 6 ? 4 : 3, stride = width * channels;
    const input = zlib.inflateSync(Buffer.concat(chunks)), raw = Buffer.alloc(stride * height);
    const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
    for (let y = 0; y < height; y++) {
        const filter = input[y * (stride + 1)];
        if (filter > 4) throw Error('Invalid PNG filter');
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x, a = x >= channels ? raw[i - channels] : 0, b = y ? raw[i - stride] : 0, c = y && x >= channels ? raw[i - stride - channels] : 0;
            raw[i] = (input[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
        }
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let p = 0; p < width * height; p++) { raw.copy(rgba, p * 4, p * channels, p * channels + 3); rgba[p * 4 + 3] = channels === 4 ? raw[p * channels + 3] : 255; }
    return { width, height, rgba };
}

function measure(image, reviewed) {
    const { width: w, height: h, rgba } = image;
    const at = (x, y) => rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4);
    const opaque = (x, y) => at(x, y)[3] >= 32;
    let top = h, bottom = 0;
    for (let y = 0; y < h; y++) { let count = 0; for (let x = 0; x < w; x++) if (opaque(x, y)) count++; if (count >= 3) { top = Math.min(top, y); bottom = y; } }
    const body = bottom - top;
    // Paired sclera components distinguish eyes from skin, blond hair and clothes.
    const mask = new Uint8Array(w * h), components = [];
    const start = Math.floor(top + body * .055), end = Math.ceil(top + body * .145);
    for (let y = start; y <= end; y++) for (let x = Math.floor(w * .28); x < w * .72; x++) {
        const [r, g, b, a] = at(x, y);
        if (a >= 200 && r >= 210 && g >= 205 && b >= 190 && Math.max(r, g, b) - Math.min(r, g, b) < 45) mask[y * w + x] = 1;
    }
    for (let y = start; y <= end; y++) for (let x = Math.floor(w * .28); x < w * .72; x++) {
        const initial = y * w + x; if (!mask[initial]) continue;
        const queue = [initial]; mask[initial] = 0;
        let left = x, right = x, t = y, b = y, sx = 0, sy = 0;
        for (let i = 0; i < queue.length; i++) {
            const p = queue[i], px = p % w, py = Math.floor(p / w); left = Math.min(left, px); right = Math.max(right, px); t = Math.min(t, py); b = Math.max(b, py); sx += px; sy += py;
            for (const n of [p - 1, p + 1, p - w, p + w]) if (mask[n]) { mask[n] = 0; queue.push(n); }
        }
        if (queue.length >= 20 && queue.length < body * body * .0001 && right - left < w * .075 && b - t < body * .018) components.push({ left, right, top: t, bottom: b, x: sx / queue.length, y: sy / queue.length, area: queue.length });
    }
    const pairs = [];
    for (const a of components) for (const b of components) {
        const dx = b.x - a.x;
        if (dx < w * .05 || dx > w * .16 || Math.abs(a.y - b.y) > body * .018) continue;
        const score = Math.min(a.area, b.area) * 2 + Math.max(a.area, b.area) - Math.abs(a.y - b.y) * 5 - Math.abs((a.y + b.y) / 2 - (top + body * .103)) * 10;
        pairs.push({ a, b, score });
    }
    pairs.sort((a, b) => b.score - a.score);
    if (!pairs.length) throw Error('Eyes not detected; review replacement artwork');
    const eyes = pairs[0], eyeY = reviewed?.eyeLine ?? (eyes.a.y + eyes.b.y) / 2, centerX = reviewed?.centerX ?? (eyes.a.x + eyes.b.x) / 2;
    // Chin: the dark jaw outline across the central third of the eye separation.
    // Search below the mouth and stop before the shirt; use the lower edge of the V.
    const separation = eyes.b.x - eyes.a.x, candidates = [];
    for (let y = Math.floor(eyeY + separation * .55); y <= eyeY + separation * 1.65; y++) {
        let score = 0;
        for (let x = Math.floor(centerX - separation * .16); x <= centerX + separation * .16; x++) {
            const [r, g, b, a] = at(x, y);
            if (a >= 200 && r < 125 && g < 105 && b < 95) score++;
        }
        candidates.push({ y, score });
    }
    // The first continuous jaw crossing avoids a later collar/shirt outline.
    const jawStart = candidates.findIndex(c => c.score >= separation * .09);
    if (jawStart < 0 && !reviewed) throw Error('Chin not detected; review replacement artwork');
    let jawEnd = jawStart;
    while (true) {
        if (candidates[jawEnd + 1]?.score >= separation * .09) { jawEnd++; continue; }
        // Keep a single, mostly-dark anti-aliased row inside the same jaw
        // crossing. Slightly different owner eye spacing must not split a
        // retained V-shaped outline before its tip; never bridge a blank gap.
        if (candidates[jawEnd + 1]?.score >= separation * .09 * .75 && candidates[jawEnd + 2]?.score >= separation * .09) { jawEnd += 2; continue; }
        break;
    }
    // The bottom of the first crossing, including its thin anti-aliased tip.
    const chinY = reviewed?.chin ?? candidates[jawEnd].y + 1;
    let left = w, right = 0;
    // Include hair/accessories beside the cheeks, not just the crown. A hand held
    // against the face may be included in this conservative horizontal envelope.
    for (let y = top; y <= chinY; y++) for (let x = Math.max(0, Math.floor(centerX - body * .15)); x <= Math.min(w - 1, centerX + body * .15); x++) if (opaque(x, y)) { left = Math.min(left, x); right = Math.max(right, x); }
    const round = v => Math.round(v * 1000) / 1000;
    return { canvas: { width: w, height: h }, figure: { top, bottom }, head: { top, chin: chinY, eyeLine: round(eyeY), left, right, width: right - left + 1, height: chinY - top, centerX: round(centerX) } };
}

function webpCanvas(file) {
    const data = fs.readFileSync(file);
    if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') throw Error('Expected WebP: ' + file);
    const type = data.toString('ascii', 12, 16);
    if (type === 'VP8X') return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
    if (type === 'VP8L' && data[20] === 47) { const bits = data.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (type === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    throw Error('Unsupported WebP header: ' + file);
}

function buildMetrics() {
    const context = { document: { currentScript: null }, BattleStoryPortraitMetrics: { characters: {} } }; context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'story-data/characters.js'), 'utf8'), context);
    const characters = {};
    for (const id of Object.keys(context.BattleStoryAssets.characters).sort()) {
        if (!Object.hasOwn(heightRanks, id)) throw Error('Owner height rank required: ' + id);
        // 102a supplies 結月 as a standing master; she has no legacy portrait sheet.
        const source = ['yuzuki', 'ryuta'].includes(id) ? `assets/images/characters/standing/${id}-standing-alpha.png`
            : `assets/images/story/portraits/${id}-normal.png`, file = path.join(root, source);
        // 103a 龍太 has a tilted face; a central V-jaw detector cannot measure it.
        // Reviewed source coordinates (eyes / jaw), never changes the artwork.
        const reviewed = id === 'ryuta' ? { eyeLine: 197, centerX: 538.5, chin: 266 } : undefined;
        characters[id] = { source, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), ...measure(readPng(file), reviewed), renderCanvas: webpCanvas(path.join(root, context.BattleStoryAssets.characters[id].defaultPortrait)), heightRank: heightRanks[id], headTopOffset: headTopOffsets[heightRanks[id] - 1], ...(reviewed ? { reviewedLandmarks: reviewed } : {}) };
        const poses = {};
        for (const [pose, expressions] of Object.entries(context.BattleStoryAssets.characters[id].poses)) {
            if (pose === 'default') { poses.default = { ...characters[id] }; continue; }
            const source = `assets/images/story/portraits/${id}-${pose}-normal.png`, file = path.join(root, source);
            poses[pose] = { source, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
                ...measure(readPng(file)), renderCanvas: webpCanvas(path.join(root, expressions.normal)),
                heightRank: heightRanks[id], headTopOffset: headTopOffsets[heightRanks[id] - 1] };
        }
        characters[id].poses = poses;
    }
    return { version: 2, method: 'alpha32-paired-sclera-central-jaw-v2', characters };
}

function metricsScript(metrics) { return '// Generated by node tools/measure-story-portraits.cjs; do not edit.\nwindow.BattleStoryPortraitMetrics = ' + JSON.stringify(metrics, null, 2) + ';\n'; }
if (require.main === module) {
    const metrics = buildMetrics(), json = JSON.stringify(metrics, null, 2) + '\n';
    if (process.argv.includes('--check')) {
        for (const [file, content] of [['story-data/portrait-metrics.json', json], ['story-data/portrait-metrics.js', metricsScript(metrics)]]) if (fs.readFileSync(path.join(root, file), 'utf8') !== content) throw Error('Stale portrait metrics: ' + file);
    } else {
        fs.writeFileSync(path.join(root, 'story-data/portrait-metrics.json'), json);
        fs.writeFileSync(path.join(root, 'story-data/portrait-metrics.js'), metricsScript(metrics));
    }
    for (const [id, value] of Object.entries(metrics.characters)) console.log(id, JSON.stringify(value.head));
}
module.exports = { readPng, measure, buildMetrics, metricsScript };
