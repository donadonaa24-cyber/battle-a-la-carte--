'use strict';
// Read-only suggestions for the owner-editable introAt table. No browser/network.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function storyEpisodes() {
    const context = vm.createContext({ console, window: {}, document: { currentScript: null }, URL });
    for (const file of ['story-data/portrait-metrics.js', 'story-data/characters.js', 'story-data/registry.js',
        ...[4,5,6,7,8,9,10].map(n => `story-data/episode${n}.js`),
        ...['summer','halloween','kyudo','osananajimi-1','osananajimi-2'].map(id => `story-data/episode-special-${id}.js`)]) vm.runInContext(read(file), context, { filename: file });
    const source = read('story-mode.js').match(/const EPISODES = (\[[\s\S]*?\n    \]);/);
    if (!source) throw Error('Tutorial episode data not found');
    const tutorials = vm.runInContext(source[1], context).map(episode => ({
        id: episode.id, number: Number(episode.id.slice(7)), scenes: [
            { id: 'pre', lines: episode.pre || [] },
            { id: 'win', lines: episode.postWin || [] },
            { id: 'lose', lines: episode.postLose || [] }
        ]
    }));
    return JSON.parse(JSON.stringify([...tutorials, ...context.window.BattleStoryData.all()]));
}
function firstAppearances(episodes, ids) {
    const locations = {}, eligible = new Set(ids);
    const specials = ['special-summer', 'special-halloween', 'special-kyudo', 'special-osananajimi-1', 'special-osananajimi-2'];
    const order = episode => episode.number ?? 11 + specials.indexOf(episode.id);
    for (const episode of [...episodes].sort((a,b) => order(a)-order(b))) {
        for (const scene of episode.scenes) {
            const shown = new Set();
            scene.lines.forEach((line, index) => {
                // Match the icon ADV's on-screen staging, including conditional show.
                if (line.offscreen || line.monologue) { shown.clear(); return; }
                if (line.hide === 'all') shown.clear();
                else if (Array.isArray(line.hide)) line.hide.forEach(id => shown.delete(id));
                const speaking = !['narration', 'announce'].includes(line.speaker);
                if (speaking && !Array.isArray(line.show)) {
                    for (const id of shown) if (id !== line.speaker) shown.delete(id);
                }
                for (const actor of line.show || []) {
                    if (!actor.onlyIfShown || shown.has(actor.id)) shown.add(actor.id);
                }
                if (speaking) shown.add(line.speaker);
                if (line.speaker === 'announce') shown.clear();
                for (const id of shown) if (eligible.has(id) && !locations[id]) {
                    locations[id] = { episode: episode.number ?? episode.id, scene: scene.id, line: index+1 };
                }
            });
        }
    }
    return locations;
}
function declaredIntros() {
    const context = { window: {} };
    vm.runInNewContext(read('story-data/character-intros.js'), context);
    return JSON.parse(JSON.stringify(context.window.BattleStoryCharacterIntros));
}
if (require.main === module) {
    const declared = declaredIntros(), computed = firstAppearances(storyEpisodes(), Object.keys(declared));
    if (process.argv.includes('--check')) {
        require('node:assert/strict').deepEqual(Object.fromEntries(Object.entries(declared).map(([id,data]) => [id,data.introAt])), computed);
        console.log(Object.keys(declared).length + ' story-wide intro locations checked');
    } else console.log(JSON.stringify(computed, null, 2));
}
module.exports = { storyEpisodes, firstAppearances, declaredIntros };
