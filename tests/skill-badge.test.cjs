const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const ingredient = id => ({ id, type: 'ingredient', name: 'ごはん' });

function element() {
    const classes = new Set();
    return {
        textContent: '', disabled: false, title: '',
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        }
    };
}

function runtime(mobile) {
    const button = element();
    const c = vm.createContext({ console, document: {
        getElementById: id => id === 'player-skill-button' ? button : null
    } });
    c.window = c;
    const file = name => mobile ? `mobile/${name}-sp.js` : `${name}.js`;
    for (const name of ['cards', 'state', 'rules', 'player']) {
        vm.runInContext(read(file(name)), c, { filename: file(name) });
    }
    vm.runInContext(read('battle-view-model.js'), c);
    vm.runInContext(read(file('render')), c, { filename: file('render') });
    c.updateUI = () => {};
    return { c, button };
}

function usableState(c, skillKey = 'makanaiSupply') {
    Object.assign(c.GameState, {
        players: { player: c.createPlayerState(), cpu: c.createPlayerState() },
        deck: [ingredient('deck')], currentTurn: 'player', selectionMode: null,
        gameEnded: false, ui: { infoOverlayType: null }
    });
    const me = c.GameState.players.player;
    const opponent = c.GameState.players.cpu;
    me.selectedSkillKey = skillKey;
    me.hand = [ingredient('hand')];
    me.events = [{ id: 'cost', type: 'event', name: 'やり直し' }];
    opponent.score = 8;
    opponent.set = [ingredient('set')];
    return { me, opponent };
}

function assertBadge(c, button, expected, label) {
    c.renderSkillHud();
    assert.equal(button.classList.contains('has-recipe-alert'), expected, label);
    assert.equal(button.textContent, 'スキル発動');
}

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    test(`${label}: badge reuses actual activation checks for all six skills and remaining uses`, () => {
        const { c, button } = runtime(mobile);
        for (const key of ['lastOrder', 'kitchenInfiltration', 'makanaiSupply', 'foodTrap', 'aceProcurement', 'tasteThief']) {
            const { me, opponent } = usableState(c, key);
            const skill = c.getSelectedSkillDefinitionForSide('player');
            assert.equal(c.getSkillActivationStatusForSide('player').ok, true, key);
            assertBadge(c, button, true, key);
            assert.equal(button.classList.contains('ready'), true);
            assert.equal(button.disabled, false);

            me.skillUseCounts[key] = skill.maxUses - 1;
            assertBadge(c, button, true, `${key}: last use remains`);
            me.skillUseCounts[key] = skill.maxUses;
            assertBadge(c, button, false, `${key}: used up`);
            assert.equal(button.classList.contains('ready'), false);
            assert.equal(button.disabled, true);

            me.skillUseCounts[key] = 0;
            me.score = 9;
            opponent.score = 0;
            assertBadge(c, button, false, `${key}: unmet condition`);
        }
        const { me } = usableState(c, 'lastOrder');
        me.events = [];
        assertBadge(c, button, false, 'missing event cost');
        me.selectedSkillKey = null;
        assertBadge(c, button, false, 'no selected skill');
    });

    test(`${label}: badge clears on opponent turn, game end, selection and modal, then returns`, () => {
        const { c, button } = runtime(mobile);
        usableState(c);
        assertBadge(c, button, true);
        c.GameState.currentTurn = 'cpu';
        assertBadge(c, button, false, 'opponent turn');
        c.GameState.currentTurn = 'player';
        assertBadge(c, button, true);
        c.GameState.gameEnded = true;
        assertBadge(c, button, false, 'game ended');
        c.GameState.gameEnded = false;
        for (const mode of ['discard', 'event-target', 'set-confirm', 'recipe', 'board-details', 'skill-confirm']) {
            c.GameState.selectionMode = mode;
            assertBadge(c, button, false, mode);
            if (mode === 'skill-confirm') {
                assert.equal(button.classList.contains('ready'), true, 'existing confirm behavior stays enabled');
                assert.equal(button.disabled, false);
            }
            c.GameState.selectionMode = null;
            assertBadge(c, button, true, `after ${mode}`);
        }
        c.openPackShop();
        assertBadge(c, button, false, 'pack shop');
        c.closePackShop();
        assertBadge(c, button, true);
        c.openInfoOverlay('recipes');
        assertBadge(c, button, false, 'info modal');
        c.closeInfoOverlay();
        assertBadge(c, button, true);
    });

    test(`${label}: guest badge uses the guest's projected turn and own skill usage`, async () => {
        const worker = vm.createContext({ console, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
        worker.self = worker;
        worker.importScripts = (...names) => names.forEach(name => vm.runInContext(read(name.split('?')[0]), worker));
        worker.importScripts('battle-engine-worker.js');
        const initial = await worker.execute({ kind: 'init',
            host: { character: 'takumi', skill: 'lastOrder' },
            guest: { character: 'akatsuki', skill: 'makanaiSupply' }
        });
        const snapshot = clone(initial.snapshot);
        snapshot.currentTurn = 'cpu';
        snapshot.selectionMode = null;
        snapshot.players.cpu.score = 0;
        snapshot.players.cpu.skillUseCounts.makanaiSupply = 0;
        const { c, button } = runtime(mobile);
        c.FriendBattle = { isActive: () => true };
        const project = async () => {
            const views = await worker.execute({ kind: 'project', snapshot: clone(snapshot) });
            Object.assign(c.GameState, clone(views.guest.state));
        };
        await project();
        assert.equal(c.getBattleViewModel().online, true);
        assert.equal(c.GameState.players.player.selectedSkillKey, 'makanaiSupply');
        assertBadge(c, button, true, 'guest turn');
        snapshot.currentTurn = 'player';
        await project();
        assertBadge(c, button, false, 'host turn');
        snapshot.currentTurn = 'cpu';
        snapshot.players.cpu.skillUseCounts.makanaiSupply = 2;
        await project();
        assertBadge(c, button, false, 'guest skill used up');
        snapshot.players.cpu.skillUseCounts.makanaiSupply = 0;
        snapshot.players.cpu.score = 8;
        await project();
        assertBadge(c, button, false, 'guest condition unmet');
    });
}

test('both layouts reuse the cooking badge styles, preserve buttons and load the new versions', () => {
    const pc = read('style.css');
    const mobile = read('mobile/style-sp.css');
    assert.match(pc, /#cook-button\.has-recipe-alert,\s*#player-skill-button\.has-recipe-alert\s*\{\s*position: relative;/);
    assert.match(pc, /#cook-button\.has-recipe-alert::after,\s*#player-skill-button\.has-recipe-alert::after\s*\{\s*content: '!';/);
    assert.match(pc, /\.pc-field-ui #cook-button\.has-recipe-alert::after,\s*\.pc-field-ui #player-skill-button\.has-recipe-alert::after\s*\{[^}]*top: -5px; right: 6px; width: 25px; height: 25px; font-size: 18px;/);
    assert.match(mobile, /\.main-action\.has-recipe-alert::after\s*\{\s*content: '!';/);
    for (const css of [pc, mobile]) {
        assert.match(css, /body:has\(\.recipe-hints-overlay:not\(\.hidden\), \.spotlight-overlay:not\(\.hidden\), #surrender-dialog\[open\]\) #player-skill-button\.has-recipe-alert::after\s*\{\s*display: none;/,
            'directly opened overlays hide the badge without waiting for a UI render');
    }
    for (const [html, style, render] of [['web.html', 'style.css', 'render.js'],
        ['mobile/mobile.html', 'style-sp.css', 'render-sp.js']]) {
        const source = read(html);
        assert.match(source, /id="player-skill-button" class="main-action skill-action">スキル発動<\/button>/);
        const version = '20261003-adv1';
        assert.ok(source.includes(`${style}?v=${version}`));
        assert.ok(source.includes(`${render}?v=20261003-adv1`));
    }
});
