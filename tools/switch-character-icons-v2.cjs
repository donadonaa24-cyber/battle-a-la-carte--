'use strict';
const fs = require('node:fs');
const path = require('node:path');
const IDS = ['chizuru', 'mai', 'takumi', 'akatsuki'];

function replacements(root, exists = fs.existsSync) {
    const available = [], missing = [];
    for (const id of IDS) for (const [folder, stem] of [['character-icons', id + '-icons'], ['battle-mode-icons', id + '-battle-mode-icon']]) {
        const target = `assets/battle-images/${folder}/${stem}-v2.webp`;
        if (exists(path.join(root, target))) {
            available.push([`assets/battle-images/${folder}/${stem}.webp`, target]);
            available.push([`assets/images/${folder}/${stem}.png`, target]);
        } else missing.push(target);
    }
    return { available, missing };
}
function switchReferences(text, pairs) {
    for (const [old, target] of pairs) text = text.replaceAll(old, target);
    return text;
}
function apply(root = path.resolve(__dirname, '..')) {
    const selected = replacements(root), changed = [];
    const files = ['style.css', 'mobile/style-sp.css',
        ...fs.readdirSync(root).filter(file => file.endsWith('.js')),
        ...['mobile', 'story-data'].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(file => file.endsWith('.js')).map(file => dir + '/' + file))];
    for (const file of files) {
        const location = path.join(root, file), before = fs.readFileSync(location, 'utf8');
        const after = switchReferences(before, selected.available);
        if (after !== before) { fs.writeFileSync(location, after); changed.push(file); }
    }
    return { changed, missing: selected.missing };
}
if (require.main === module) console.log(JSON.stringify(apply(), null, 2));
module.exports = { replacements, switchReferences, apply };
