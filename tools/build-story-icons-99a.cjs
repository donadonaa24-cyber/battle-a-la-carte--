'use strict';
// Offline copy/crop/resize only. The sibling owner folder is always read-only.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const cells = ['normal', 'smile', 'troubled', 'surprised', 'gentle', 'laugh'];
const sources = {
    chizuru: '新キャラ素材/初期4人_アイコン刷新/v3_オーナー原画/chizuru/chizuru-expressions-v3.png',
    mai: 'battle-a-la-carte/Assets/Battle/Resources/Art/generated/mai-expressions.png',
    takumi: 'battle-a-la-carte/Assets/Battle/Resources/Art/generated/takumi-expressions.png',
    akatsuki: 'battle-a-la-carte/Assets/Battle/Resources/Art/generated/akatsuki-expressions.png',
    kanna: '新キャラ素材/栞那_kanna/02_Unity用_完成/kanna-expressions-final.png',
    tsuyoshi: '新キャラ素材/剛_tsuyoshi/02_Unity用_完成/tsuyoshi-expressions-final.png'
};
const standingSource = '新キャラ素材/剛_tsuyoshi/02_Unity用_完成/tsuyoshi-standing.png';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function build(sharp, sourceRoot = path.resolve(root, '../battle-a-la-carte - ギットハブ版 -ユニティ改')) {
    const manifestFile = path.join(root, 'assets/battle-images/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')), records = [], proof = [];
    const append = async (original, battle, info) => {
        const entry = { original, battle, originalBytes: fs.statSync(path.join(root, original)).size,
            bytes: info.size, width: info.width, height: info.height };
        const index = manifest.findIndex(item => item.battle === battle);
        if (index < 0) manifest.push(entry); else manifest[index] = entry;
    };
    fs.mkdirSync(path.join(root, 'assets/images/story/icons'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets/battle-images/story/icons'), { recursive: true });
    for (const [row, [id, source]] of Object.entries(sources).entries()) {
        const input = fs.readFileSync(path.join(sourceRoot, source)), metadata = await sharp(input).metadata();
        if (metadata.width !== 1536 || metadata.height !== 1024) throw Error('Unexpected sheet size: ' + id);
        for (const [index, cell] of cells.entries()) {
            const box = { left: index % 3 * 512, top: Math.floor(index / 3) * 512, width: 512, height: 512 };
            const original = `assets/images/story/icons/${id}-${cell}.png`, battle = `assets/battle-images/story/icons/${id}-${cell}.webp`;
            const png = await sharp(input).extract(box).png().toBuffer();
            fs.writeFileSync(path.join(root, original), png);
            const info = await sharp(png).resize(256, 256).webp({ quality: 92, effort: 6, alphaQuality: 100 }).toFile(path.join(root, battle));
            if (info.size > 40 * 1024) throw Error('Icon budget exceeded: ' + battle);
            await append(original, battle, info);
            const raw = await sharp(png).ensureAlpha().raw().toBuffer();
            records.push({ id, cell, index, source, sourceSha256: hash(input), box, original, battle, rgbaSha256: hash(raw), bytes: info.size });
            proof.push({ input: await sharp(png).resize(224, 224).png().toBuffer(), left: 100 + index * 234, top: 64 + row * 254 });
        }
    }
    const original = 'assets/images/characters/standing/tsuyoshi-standing.png';
    const battle = 'assets/battle-images/characters/standing/tsuyoshi-standing.webp';
    const standing = fs.readFileSync(path.join(sourceRoot, standingSource));
    fs.writeFileSync(path.join(root, original), standing);
    const info = await sharp(standing).resize(512, 768, { fit: 'fill' }).webp({ quality: 80, effort: 6, alphaQuality: 100 }).toFile(path.join(root, battle));
    if (info.size > 150 * 1024) throw Error('Standing budget exceeded');
    await append(original, battle, info);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    const labels = `<svg width="1514" height="1590"><style>text{fill:#f5dfab;font-family:sans-serif;font-size:20px}</style>${cells.map((cell,i)=>`<text x="${100+i*234}" y="36">${i}: ${cell}</text>`).join('')}${Object.keys(sources).map((id,i)=>`<text x="8" y="${182+i*254}" font-size="16">${id}</text>`).join('')}</svg>`;
    proof.push({ input: Buffer.from(labels), left: 0, top: 0 });
    await sharp({ create: { width: 1514, height: 1590, channels: 3, background: '#18121d' } }).composite(proof).png().toFile(path.join(root, 'docs/story/art-review/icons-99a.png'));
    fs.writeFileSync(path.join(root, 'docs/story/art-review/icons-99a-provenance.json'), JSON.stringify({ version: '20261006-icons99a', cells: records,
        standing: { source: standingSource, sourceSha256: hash(standing), original, battle, bytes: info.size } }, null, 2) + '\n');
    return { icons: records.length, maxBytes: Math.max(...records.map(item => item.bytes)), standingBytes: info.size };
}
module.exports = { sources, cells, standingSource, build };
if (require.main === module) build(require(process.env.BALC_SHARP_PATH || 'sharp'), process.env.BALC_OWNER_ART_DIR).then(console.log).catch(error => { console.error(error); process.exitCode = 1; });
