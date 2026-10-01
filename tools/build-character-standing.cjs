// Development-only conversion. Uses an existing local Sharp package.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.BALC_SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
const sourceDirectory = path.join(root, 'assets/battle-images/standing-src');
const targetDirectory = path.join(root, 'assets/battle-images/characters/standing');
const ids = ['chizuru', 'mai', 'takumi', 'akatsuki'];

async function build() {
    await fs.mkdir(targetDirectory, { recursive: true });
    const completed = [];
    for (const id of ids) {
        const source = path.join(sourceDirectory, `${id}-standing.png`);
        const target = path.join(targetDirectory, `${id}-standing.webp`);
        const originalBytes = (await fs.stat(source)).size;
        const result = await sharp(source).resize(512, 768, { fit: 'fill' })
            .webp({ quality: 80, effort: 6 }).toFile(target);
        const metadata = await sharp(target).metadata();
        if (metadata.format !== 'webp' || metadata.width !== 512 || metadata.height !== 768 || result.size >= originalBytes) {
            throw new Error(`Invalid standing WebP for ${id}`);
        }
        completed.push({ source, id, originalBytes, bytes: result.size });
    }
    // Delete only the four converted source files, after all outputs pass validation.
    for (const item of completed) await fs.unlink(item.source);
    await fs.rmdir(sourceDirectory);
    for (const item of completed) console.log(`${item.id}: ${item.originalBytes} -> ${item.bytes} bytes (512x768 WebP)`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
