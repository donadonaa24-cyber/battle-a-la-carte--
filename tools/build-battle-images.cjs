// Development-only generator. Original artwork is never overwritten.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.BALC_SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
async function build() {
    const source = path.join(root, 'assets/images'), target = path.join(root, 'assets/battle-images');
    const files = [];
    async function walk(dir) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (!['creator', 'characters'].includes(entry.name)) await walk(file); }
            else if (entry.name.endsWith('.png') && !['character-icons-sheet.png', 'player-icons.png', 'cpu-icons.png'].includes(entry.name)) files.push(file);
        }
    }
    await walk(source);
    const manifest = [];
    for (const file of files.sort()) {
        const relative = path.relative(source, file), out = path.join(target, relative.replace(/\.png$/, '.webp'));
        const sprite = relative.includes('character-icons') || relative.includes('battle-mode-icons');
        const cutin = relative.includes('cutins');
        const size = cutin ? [1024, 683] : sprite ? [768, 512] : [256, 384];
        await fs.mkdir(path.dirname(out), { recursive: true });
        const info = await sharp(file).resize(...size, { fit: cutin || sprite ? 'inside' : 'fill', withoutEnlargement: true })
            .webp({ quality: sprite ? 90 : 85, effort: 6, alphaQuality: 100 }).toFile(out);
        manifest.push({ original: `assets/images/${relative.replaceAll('\\', '/')}`,
            battle: `assets/battle-images/${path.relative(target, out).replaceAll('\\', '/')}`,
            originalBytes: (await fs.stat(file)).size, bytes: info.size, width: info.width, height: info.height });
    }
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ count: manifest.length, originalBytes: manifest.reduce((n, x) => n + x.originalBytes, 0),
        battleBytes: manifest.reduce((n, x) => n + x.bytes, 0) }));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
