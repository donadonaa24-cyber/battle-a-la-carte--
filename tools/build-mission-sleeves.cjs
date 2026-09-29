// Development-only conversion. Supply BALC_SHARP_PATH if Sharp is outside this project.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.BALC_SHARP_PATH || 'sharp');

const directory = path.resolve(__dirname, '../assets/battle-images/sleeves');
const ids = ['no-items', 'bakudan-onigiri', 'manpuku-curry', 'no-skill', 'no-event', 'comeback'];

async function build() {
    const completed = [];
    for (const id of ids) {
        const source = path.join(directory, `sleeve-${id}.png`);
        const target = path.join(directory, `sleeve-${id}.webp`);
        const originalBytes = (await fs.stat(source)).size;
        const result = await sharp(source).resize(512, 768, { fit: 'fill' })
            .webp({ quality: 80, effort: 6 }).toFile(target);
        const metadata = await sharp(target).metadata();
        if (metadata.format !== 'webp' || metadata.width !== 512 || metadata.height !== 768 || result.size >= originalBytes) {
            throw new Error(`Invalid WebP output for ${id}`);
        }
        completed.push({ source, target, originalBytes, bytes: result.size });
    }
    for (const item of completed) await fs.unlink(item.source);
    for (const item of completed) console.log(`${path.basename(item.target)}: ${item.originalBytes} -> ${item.bytes} bytes`);
}

build().catch(error => { console.error(error); process.exitCode = 1; });
