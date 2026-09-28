const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function storyRuntime(mobile) {
    const hud = { textContent: '' };
    const context = vm.createContext({ console, setTimeout, clearTimeout, Math, Date });
    context.window = context;
    context.document = {
        readyState: 'loading',
        addEventListener() {},
        getElementById(id) { return id === 'story-hud-note' ? hud : null; }
    };
    context.localStorage = { getItem() { return null; }, setItem() {} };
    context.updateUI = () => context.__onGameStateUpdated?.();
    context.addLog = () => {};
    context.setCPUStatus = () => {};
    context.enablePlayerControls = () => {};
    context.playSfx = () => {};
    context.__battleSafeStartGame = () => {};
    context.__battleStartBgmOnce = () => {};
    for (const name of ['cards', 'state', 'rules', 'player', 'cpu']) {
        const file = mobile ? `mobile/${name}-sp.js` : `${name}.js`;
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    context.cpuPause = async () => {};
    const story = fs.readFileSync(path.join(root, 'story-mode.js'), 'utf8');
    const exposed = story.replace(/\}\)\(\);\s*$/, 'window.__storyTest = { S, startBattle, updateHudHint, installObserver };\n})();');
    vm.runInContext(exposed, context, { filename: 'story-mode.js' });
    return { context, hud };
}

for (const mobile of [false, true]) test(`story episode 1 gives the CPU opening turn and preserves the lesson hand (${mobile ? 'mobile' : 'PC'})`, async () => {
    const { context: c, hud } = storyRuntime(mobile);
    const fixed = ['ごはん', 'のり', '卵', 'にんじん'];
    c.__storyTest.installObserver();
    c.__storyTest.S.episodeId = 'episode1';
    c.__storyTest.S.objectives = {};
    c.__storyTest.startBattle('episode1');
    assert.equal(c.GameState.currentTurn, 'cpu');
    assert.equal(c.GameState.turnNumber, 1);
    assert.match(hud.textContent, /舞依の先攻/);
    assert.deepEqual(Array.from(c.GameState.players.player.hand, card => card.name), fixed);
    assert.deepEqual(Array.from(c.GameState.players.player.events, card => card.name), ['爆買い', 'ゴミ収集車']);
    assert.equal(c.canUseEventThisTurn(c.GameState.players.cpu), false);
    for (let i = 0; i < 100 && c.GameState.currentTurn === 'cpu'; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(c.GameState.currentTurn, 'player');
    assert.equal(c.GameState.turnNumber, 2);
    assert.deepEqual(Array.from(c.GameState.players.player.hand, card => card.name), fixed);
    assert.deepEqual(Array.from(c.GameState.players.player.events, card => card.name), ['爆買い', 'ゴミ収集車']);
    assert.equal(c.canUseEventThisTurn(c.GameState.players.player), true);
    assert.match(hud.textContent, /材料カードを1枚セット/);

    c.__storyTest.S.episodeId = 'episode2';
    c.__storyTest.S.objectives = {};
    c.__storyTest.startBattle('episode2');
    assert.equal(c.GameState.currentTurn, 'player');
    assert.equal(c.GameState.turnNumber, 1);
    assert.equal(c.canUseEventThisTurn(c.GameState.players.player), false);
});
