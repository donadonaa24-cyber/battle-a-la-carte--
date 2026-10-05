'use strict';
// Offline alpha-only extraction. No drawing, colour correction, or source writes.
// Native-size lossless WebP is intentional: visible RGB must equal the source.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { readPng } = require('./measure-story-portraits.cjs');
const root = path.resolve(__dirname, '..');
const ids = ['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna', 'tsuyoshi'];
const cells = ['normal', 'smile', 'troubled', 'surprised', 'gentle', 'laugh'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function standingSource(id) {
    return ['kanna', 'tsuyoshi'].includes(id) ? `assets/images/characters/standing/${id}-standing.png`
        : `../battle-a-la-carte - ギットハブ版 -ユニティ改/battle-a-la-carte/Assets/Battle/Resources/Art/generated/${id}-standing.png`;
}
function matte(image, standing = false) {
    const { width: w, height: h, rgba: data } = image, n = w * h;
    const bg = new Uint8Array(n), queue = new Int32Array(n); let end = 0;
    const seed = p => { if (!bg[p]) { bg[p] = 1; queue[end++] = p; } };
    // Avoid seeding cropped clothes/hair at the cell border.
    for (let x = 0; x < w; x++) {
        if (standing || x < w * .2 || x > w * .8) seed(x);
        if (standing) seed((h - 1) * w + x);
    }
    for (let y = 0; y < (standing ? h : h * .7); y++) { seed(y * w); seed(y * w + w - 1); }
    const neighbours = p => {
        const x = p % w, y = Math.floor(p / w);
        return [x ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y ? p - w : -1, y < h - 1 ? p + w : -1];
    };
    // The gradient is locally smooth. A conservative 3-level step stops at the
    // drawn silhouette, including dark hair, silver strands, and black outlines.
    for (let i = 0; i < end; i++) {
        const p = queue[i];
        for (const t of neighbours(p)) {
            if (t < 0 || bg[t]) continue;
            let delta = 0;
            for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(data[p * 4 + c] - data[t * 4 + c]));
            // The standing floor has paper grain, stronger than the smooth
            // upper backdrop. The shoes' ink boundary still stops this flood.
            const at = t * 4;
            const floor = standing && Math.floor(t / w) > h * .80 &&
                data[at] - data[at+1] > 24 && data[at+1] - data[at+2] > 18;
            if (delta < (floor ? 12 : 4)) seed(t);
        }
    }
    // Retain the connected character; discard disconnected background texture.
    const fg = new Uint8Array(n); end = 0;
    const start = Math.floor(h * .32) * w + Math.floor(w * .5);
    if (bg[start]) throw Error('Matte leaked into the character; review source');
    fg[start] = 1; queue[end++] = start;
    for (let i = 0; i < end; i++) for (const t of neighbours(queue[i])) {
        if (t >= 0 && !bg[t] && !fg[t]) { fg[t] = 1; queue[end++] = t; }
    }
    const result = Buffer.from(data);
    for (let p = 0; p < n; p++) {
        if (!fg[p]) { result[p * 4 + 3] = 0; continue; }
        // Subpixel inward coverage removes the matte-coloured fringe without
        // replacing any RGB. Never feather the original bust's bottom cut.
        const x = p % w, y = Math.floor(p / w);
        let outside = 0;
        for (const t of neighbours(p)) if (t >= 0 && !fg[t]) outside++;
        const cut = !standing && y === h - 1;
        result[p * 4 + 3] = cut || !outside ? 255 : outside >= 3 ? 64 : outside === 2 ? 128 : 200;
    }
    return result;
}
async function build(sharp) {
    const manifestFile = path.join(root, 'assets/battle-images/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')), records = [];
    for (const id of ids) for (const cell of [...cells, 'standing']) {
        const standing = cell === 'standing';
        const source = standing ? standingSource(id) : `assets/images/story/icons/${id}-${cell}.png`;
        const stem = standing ? `characters/standing/${id}-standing-alpha` : `story/icons/${id}-${cell}-alpha`;
        const original = `assets/images/${stem}.png`, battle = `assets/battle-images/${stem}.webp`;
        const image = readPng(path.join(root, source)), rgba = matte(image, standing);
        for (let p = 0; p < rgba.length; p += 4) {
            if (!rgba.subarray(p, p + 3).equals(image.rgba.subarray(p, p + 3))) throw Error('RGB changed');
        }
        const png = await sharp(rgba, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
        fs.writeFileSync(path.join(root, original), png);
        const info = await sharp(png).webp({ lossless: true, effort: 6 }).toFile(path.join(root, battle));
        const entry = { original, battle, originalBytes: png.length, bytes: info.size, width: image.width, height: image.height };
        const index = manifest.findIndex(item => item.battle === battle);
        if (index < 0) manifest.push(entry); else manifest[index] = entry;
        records.push({ id, cell, source, sourceSha256: hash(fs.readFileSync(path.join(root, source))), ...entry });
        console.log(id, cell, info.size);
    }
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'docs/story/art-review/icons-99c-alpha.json'), JSON.stringify({ version: '20261006-icons99c', method: 'connected-smooth-background-alpha-only; inward-subpixel-coverage', records }, null, 2) + '\n');
}
async function check(sharp) {
    const records = JSON.parse(fs.readFileSync(path.join(root, 'docs/story/art-review/icons-99c-alpha.json'), 'utf8')).records;
    if (records.length !== 42) throw Error('Expected 36 icons and 6 standing cut-outs');
    let visiblePixels = 0;
    for (const record of records) {
        const sourceBytes = fs.readFileSync(path.join(root, record.source));
        if (hash(sourceBytes) !== record.sourceSha256) throw Error('Source changed: ' + record.source);
        const source = readPng(path.join(root, record.source));
        let png;
        for (const file of [record.original, record.battle]) {
            const { data, info } = await sharp(path.join(root, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            if (info.width !== source.width || info.height !== source.height) throw Error('Cut-out size changed: ' + file);
            let transparent = 0, soft = 0;
            for (let p = 0; p < data.length; p += 4) {
                if (!data[p + 3]) { transparent++; continue; }
                if (data[p + 3] < 255) soft++;
                if (data[p] !== source.rgba[p] || data[p+1] !== source.rgba[p+1] || data[p+2] !== source.rgba[p+2]) throw Error('Visible RGB changed: ' + file + ' pixel ' + p/4);
                visiblePixels++;
            }
            if (!transparent || !soft) throw Error('Missing transparency/antialiasing: ' + file);
            if (png) for (let p = 3; p < data.length; p += 4) {
                if (png[p] !== data[p]) throw Error('WebP alpha differs: ' + file);
            }
            else png = data;
        }
    }
    return { files: 84, visiblePixels, rgbDifferences: 0, alphaDifferences: 0 };
}
module.exports = { ids, cells, standingSource, matte, build, check };
if (require.main === module) {
    const sharp = require(process.env.BALC_SHARP_PATH || 'sharp');
    (process.argv.includes('--check') ? check(sharp).then(result => console.log(JSON.stringify(result))) : build(sharp))
        .catch(error => { console.error(error); process.exitCode = 1; });
}
