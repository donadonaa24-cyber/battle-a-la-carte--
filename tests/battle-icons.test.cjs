'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ids = ['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna'];
const cells = ['normal', 'smile', 'troubled', 'surprised', 'gentle', 'laugh'];

function element() {
    const classes = new Set(), attributes = {};
    const node = { style: { setProperty(key, value) { this[key] = value; } }, children: [], dataset: {}, hidden: false,
        appendChild(child) { this.children.push(child); return child; }, replaceChildren() { this.children = []; },
        setAttribute(key, value) { attributes[key] = value; }, getAttribute: key => attributes[key] ?? null,
        addEventListener() {}, remove() {}, clientWidth: 1440, clientHeight: 810 };
    node.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } };
    Object.defineProperty(node, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); } });
    return node;
}
function runtime(mobile = false, online = false) {
    const player = element(), opponent = element(), nodes = new Map(), jobs = new Map();
    let now = 10000, next = 0;
    class ClockDate extends Date { static now() { return now; } }
    const c = vm.createContext({ console, Date: ClockDate, setTimeout(fn, ms = 0) { const id = ++next; jobs.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: id => jobs.delete(id), addEventListener() {}, matchMedia: () => ({ matches: false }),
        document: { createElement: element, addEventListener() {}, querySelectorAll: () => [],
            querySelector: selector => selector === '.player-icon' ? player : selector === '.cpu-icon' ? opponent : null,
            getElementById: id => nodes.get(id) || null }, FriendBattle: { isActive: () => online },
        localStorage: { getItem: () => null, setItem() {} } });
    c.window = c;
    for (const name of ['cards', 'state', 'main', 'render']) vm.runInContext(read(mobile ? `mobile/${name}-sp.js` : `${name}.js`), c);
    for (const file of ['story-data/icon-metrics.js', 'battle-images.js', 'battle-view-model.js', 'dish-effects.js']) vm.runInContext(read(file), c);
    c.GameState.matchStartedAt = now;
    nodes.set('app-stage', element());
    c.StageLayout = { stage: nodes.get('app-stage'), logical: { width: mobile ? 432 : 1440, height: 810 } };
    function tick(ms) {
        const end = now + ms;
        for (;;) {
            const entry = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            now = entry[1].at; jobs.delete(entry[0]); entry[1].fn();
        }
        now = end;
    }
    return { c, player, opponent, nodes, tick };
}
function imageCell(node, id, cell, mobile = false) {
    const image = node.children.find(child => child.getAttribute('src')?.includes('/story/icons/'));
    assert.ok(image, id + ': image is mounted');
    const file = image.getAttribute('src');
    assert.equal(file, `${mobile ? '../' : ''}assets/battle-images/story/icons/${id}-${cell}-alpha.webp?v=20261007-osananajimi105a`);
    assert.ok(fs.existsSync(path.resolve(root, mobile ? 'mobile' : '.', file.split('?')[0])));
    assert.equal(image.style.objectFit, 'contain'); assert.equal(image.style.height, 'auto');
    assert.ok(parseFloat(image.style.width) >= 100); assert.equal(node.style.backgroundColor, '#142441'); assert.equal(node.style.overflow, 'hidden');
    assert.equal(node.style.backgroundImage, 'none', 'old sheet cannot bleed through');
    assert.equal(image.hidden, false);
    return image;
}

for (const mobile of [false, true]) for (const id of ids) {
    const label = `${mobile ? 'phone' : 'PC'} ${id}`;
    test(`${label}: all six 99a cells and legacy expression aliases exist; frames are unchanged`, () => {
        const { c } = runtime(mobile);
        const manifest = JSON.parse(read('assets/battle-images/manifest.json'));
        for (const cell of cells) {
            const node = element(); Object.assign(node.style, { width: '72px', height: '72px' });
            c.BattleImages.applyExpression(node, id, cell, mobile ? '../assets/' : 'assets/');
            imageCell(node, id, cell, mobile);
            assert.equal(node.style.width, '72px'); assert.equal(node.style.height, '72px');
            const entry = manifest.find(item => item.battle === `assets/battle-images/story/icons/${id}-${cell}-alpha.webp`);
            assert.ok(entry); assert.deepEqual([entry.width, entry.height], [512, 512]);
            const png = fs.readFileSync(path.join(root, `assets/images/story/icons/${id}-${cell}.png`));
            assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [512, 512]);
        }
        assert.equal(c.BattleImages.expressionPath(id, 'happy'), c.BattleImages.expressionPath(id, 'smile'));
        assert.equal(c.BattleImages.expressionPath(id, 'worried'), c.BattleImages.expressionPath(id, 'troubled'));
    });
    for (const online of [false, true]) test(`${label}: ${online ? 'online public view' : 'CPU/story/tutorial'} preserves score triggers and resolves traps, cooking, win/lose and results`, () => {
        const { c, player, opponent, nodes } = runtime(mobile, online);
        c.GameState.characterIds = { player: id, cpu: id };
        c.GameState.characterNames = { player: id, cpu: id };
        for (const [ps, cs, pf, cf] of [[0, 0, 'normal', 'normal'], [5, 4, 'normal', 'normal'], [6, 4, 'smile', 'troubled'], [4, 6, 'troubled', 'smile'], [7, 7, 'normal', 'normal']]) {
            c.GameState.players.player.score = ps; c.GameState.players.cpu.score = cs;
            const before = JSON.stringify(c.GameState);
            c.applyCharacterSkins(); c.updateCharacterFaces();
            imageCell(player, id, pf, mobile); imageCell(opponent, id, cf, mobile);
            assert.equal(JSON.stringify(c.GameState), before, 'display never mutates rule state');
        }
        c.GameState.players.player.battleALaCarteModeActive = true;
        c.applyCharacterSkins(); c.updateCharacterFaces();
        assert.ok(player.classList.contains('battle-mode-chef')); imageCell(player, id, 'normal', mobile);
        c.GameState.players.cpu.set = [{ trapLocked: true }]; c.updateCharacterFaces();
        imageCell(opponent, id, 'surprised', mobile);
        c.GameState.players.cpu.set = []; c.updateCharacterFaces(); imageCell(opponent, id, 'normal', mobile);
        c.setBattleCookingFace('player', 'laugh', 'big'); c.updateCharacterFaces(); imageCell(player, id, 'laugh', mobile);
        c.clearBattleCookingFace('stale'); imageCell(player, id, 'laugh', mobile);
        c.clearBattleCookingFace('big'); imageCell(player, id, 'normal', mobile);
        c.setBattleCookingFace('cpu', 'smile', 'old-match'); c.GameState.matchStartedAt++; c.updateCharacterFaces();
        imageCell(opponent, id, 'normal', mobile);
        nodes.set('result-summary', element());
        for (const winner of ['player', 'cpu']) {
            c.GameState.gameEnded = true; c.GameState.winner = winner; c.updateCharacterFaces();
            imageCell(player, id, winner === 'player' ? 'laugh' : 'troubled', mobile);
            imageCell(opponent, id, winner === 'cpu' ? 'laugh' : 'troubled', mobile);
            c.renderMatchResultSummary();
            imageCell(nodes.get('result-summary').children[1].children[0], id, winner === 'player' ? 'gentle' : 'troubled', mobile);
        }
        assert.equal(c.getSkillCutinImagePathForSide('cpu'), c.BattleImages.expressionPath(id, 'smile', mobile ? '../assets/' : 'assets/'));
        assert.equal(c.getBattleModeCutinImagePathForSide('player'), c.BattleImages.expressionPath(id, 'laugh', mobile ? '../assets/' : 'assets/'));
    });
}

for (const mobile of [false, true]) test(`${mobile ? 'phone' : 'PC'}: existing dish reveal/finish/skip/cancel control transient expressions`, async () => {
    const { c, player, opponent, tick } = runtime(mobile);
    c.GameState.characterIds = { player: 'chizuru', cpu: 'kanna' };
    c.updateCharacterFaces();
    for (const points of [2, 10]) {
        const dish = { name: `dish-${points}`, points, required: [] };
        const result = c.DishEffects.show(dish, { side: 'player' });
        const timing = c.DishEffects.timing(dish);
        tick(timing.reveal); imageCell(player, 'chizuru', points >= 10 ? 'laugh' : 'smile', mobile);
        c.updateCharacterFaces(); imageCell(player, 'chizuru', points >= 10 ? 'laugh' : 'smile', mobile);
        tick(timing.total); await result; imageCell(player, 'chizuru', 'normal', mobile);
    }
    const result = c.DishEffects.show({ name: 'cancelled-dish', points: 10 }, { side: 'cpu' });
    c.DishEffects.cancel(); await result; imageCell(opponent, 'kanna', 'normal', mobile);
    const skipped = c.DishEffects.show({ name: 'skipped-dish', points: 10 }, { side: 'cpu' });
    c.DishEffects.skip(); await skipped; imageCell(opponent, 'kanna', 'normal', mobile);
});

test('online portrait rendering never reads hidden hands/events and does not change rule state', () => {
    const { c } = runtime(false, true);
    const model = { me: { score: 2, characterId: 'takumi', set: [] }, opponent: { score: 6, characterId: 'mai', set: [{ blockedByTrap: true }] }, winner: null, online: true };
    for (const key of ['hand', 'events', 'faceDownCards']) Object.defineProperty(model.opponent, key, { get() { throw Error('hidden information read'); } });
    c.getBattleViewModel = () => model;
    assert.doesNotThrow(() => { c.applyCharacterSkins(); c.updateCharacterFaces(); });
});

test('cutin cover images are reused and hidden when an event/recipe replaces the portrait', () => {
    const { c } = runtime();
    const frame = element(); Object.assign(frame.style, { width: '300px', height: '480px' });
    c.BattleImages.applyExpressionPath(frame, c.BattleImages.expressionPath('mai', 'smile'));
    const image = imageCell(frame, 'mai', 'smile');
    c.BattleImages.applyExpressionPath(frame, c.BattleImages.expressionPath('mai', 'laugh'));
    assert.equal(frame.children.length, 1); assert.equal(image, imageCell(frame, 'mai', 'laugh'));
    assert.equal(frame.style.width, '300px'); assert.equal(frame.style.height, '480px');
    c.BattleImages.applyExpressionPath(frame, 'assets/battle-images/events/bakugai.webp'); assert.equal(image.hidden, true);
    c.BattleImages.applyExpressionPath(frame, null); assert.equal(image.hidden, true);
});

test('both HTML entry points bump only the four changed scripts and retain character select standing art', () => {
    for (const [file, prefix, suffix] of [['web.html', '', ''], ['mobile/mobile.html', '../', '-sp']]) {
        const html = read(file);
        for (const script of ['battle-images.js', 'dish-effects.js', `main${suffix}.js`, `render${suffix}.js`]) {
            const version = script === 'battle-images.js' ? '20261007-osananajimi105a' : script === 'dish-effects.js' ? '20261006-icons99c' : script.startsWith('main') ? '20261010-u6b' : '20261007-osananajimi105a';
            assert.ok(html.includes(`${['battle-images.js', 'dish-effects.js'].includes(script) ? prefix : ''}${script}?v=${version}`));
        }
        assert.ok(html.includes('network.js?v=20261010-u6b'));
    }
    for (const file of ['main.js', 'mobile/main-sp.js']) assert.match(read(file), /BattleImages\.standingPath/);
    for (const id of ids) assert.ok(fs.existsSync(path.join(root, `assets/battle-images/character-icons/${id}-icons.webp`)));
});
