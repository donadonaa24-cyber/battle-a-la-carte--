const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function runtime(mobile, { online = false, story = false } = {}) {
    const calls = [];
    const buttons = [{ disabled: false }, { disabled: false }];
    const overlay = { classList: { remove(value) { calls.push(`overlay:${value}`); } } };
    const elements = {
        'result-exit-button': buttons[0],
        'final-field-exit-button': buttons[1],
        'start-overlay': overlay
    };
    const c = vm.createContext({ console, setTimeout, clearTimeout, Date });
    c.window = c;
    c.document = { addEventListener() {}, getElementById: id => elements[id] || null };
    c.addEventListener = () => {};
    c.GameState = { gameEnded: true, storyEpisodeId: story ? 'episode4' : null };
    c.FriendBattle = {
        isActive: () => online,
        async leaveRoom() { calls.push('leave-room'); online = false; }
    };
    const file = mobile ? 'mobile/main-sp.js' : 'main.js';
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    c.clearSavedMatch = () => calls.push('clear-autosave');
    c.hideResultOverlay = () => calls.push('hide-result');
    c.hideSpotlightCard = () => calls.push('hide-spotlight');
    c.closePackShop = () => calls.push('close-pack');
    c.stopBGM = () => calls.push('stop-bgm');
    c.initGame = () => calls.push('reset-game');
    c.updateUI = () => calls.push('update-ui');
    c.updateResumeMatchButtonVisibility = () => calls.push('update-resume');
    c.showStartStage = id => calls.push(`stage:${id}`);
    c.openStoryStage = () => calls.push('story-menu');
    c.__storyResultPending = story;
    return { c, calls, buttons };
}

for (const mobile of [false, true]) {
    test(`finished ${mobile ? 'mobile' : 'PC'} online match leaves before reset`, async () => {
        const { c, calls, buttons } = runtime(mobile, { online: true });
        await c.finishCompletedMatch();
        assert.ok(calls.indexOf('leave-room') < calls.indexOf('reset-game'));
        assert.ok(!calls.includes('clear-autosave'), 'online exit preserves the independent CPU resume slot');
        assert.ok(calls.includes('stage:start-menu-stage'));
        assert.deepEqual(buttons.map(button => button.disabled), [true, true]);
    });

    test(`finished ${mobile ? 'mobile' : 'PC'} story match returns to story menu`, async () => {
        const { c, calls } = runtime(mobile, { story: true });
        await c.finishCompletedMatch();
        assert.ok(calls.includes('story-menu'));
        assert.ok(!calls.includes('stage:start-menu-stage'));
        assert.ok(!calls.includes('clear-autosave'), 'story exit preserves the independent CPU resume slot');
    });

    test(`finished ${mobile ? 'mobile' : 'PC'} CPU match still clears its own completed autosave`, async () => {
        const { c, calls } = runtime(mobile);
        await c.finishCompletedMatch();
        assert.ok(calls.includes('clear-autosave'));
        assert.ok(calls.includes('stage:start-menu-stage'));
    });
}
