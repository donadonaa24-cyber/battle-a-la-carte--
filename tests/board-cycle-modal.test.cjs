const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function ancestorsAtId(html, targetId) {
    const stack = [];
    for (const match of html.matchAll(/<\/?(section|div)\b[^>]*>/g)) {
        const tag = match[1];
        if (match[0].startsWith('</')) {
            assert.equal(stack.pop()?.tag, tag);
            continue;
        }
        const id = /\bid="([^"]+)"/.exec(match[0])?.[1];
        if (id === targetId) return stack.map(item => item.id);
        stack.push({tag, id});
    }
    assert.fail(`Missing #${targetId}`);
}

test('PC and mobile board details have their own visible modal path outside the pack shop', () => {
    for (const file of ['web.html', 'mobile/mobile.html']) {
        const html = read(file);
        const ancestors = ancestorsAtId(html, 'board-cycle-panel');
        assert.ok(ancestors.includes('board-cycle-overlay'), file);
        assert.ok(ancestors.includes('app-stage'), file);
        assert.ok(!ancestors.includes('pack-shop-overlay'), file);
        assert.match(html, /id="board-cycle-close-button"[^>]*>閉じる<\/button>/);
        const version = '20261002-ach1';
        assert.ok(html.includes(`render${file === 'web.html' ? '' : '-sp'}.js?v=${version}`));
    }
});

function extractFunction(source, name, nextName) {
    const start = source.indexOf(`function ${name}()`);
    const end = source.indexOf(`function ${nextName}()`, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}

function element() {
    const classes = new Set(['hidden']);
    return {
        classList: {
            contains: name => classes.has(name),
            add: name => classes.add(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        },
        textContent: '', disabled: false, innerHTML: ''
    };
}

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'PC'} board modal and local action flow`, () => {
    const prefix = mobile ? 'mobile/' : '';
    const suffix = mobile ? '-sp' : '';
    const logs = [];
    const c = vm.createContext({console, addLog: message => logs.push(message), updateUI() {}});
    c.window = c;
    for (const name of ['cards', 'state', 'player']) {
        vm.runInContext(read(`${prefix}${name}${suffix}.js`), c, {filename: name});
    }
    vm.runInContext(`
        GameState.players.player = createPlayerState();
        GameState.players.cpu = createPlayerState();
        GameState.players.player.packs.push({key: 'board', name: 'まな板'});
        GameState.players.player.score = 1;
        GameState.players.cpu.score = 5;
        GameState.players.player.events = [
            {id: 'event-1', type: 'event', name: 'やり直し'},
            {id: 'event-2', type: 'event', name: '山札調整'}
        ];
        GameState.deck = [{id: 'drawn-1', type: 'ingredient', name: '魚'}];
        GameState.discard = [];
        GameState.currentTurn = 'player';
        GameState.currentPhase = 'メインフェイズ';
        GameState.gameEnded = false;
        GameState.selectionMode = null;
    `, c);
    const state = () => JSON.parse(vm.runInContext('JSON.stringify(GameState)', c));
    const ids = ['board-cycle-overlay', 'board-cycle-panel', 'board-cycle-description',
        'board-cycle-reason', 'board-cycle-start-button', 'board-cycle-close-button', 'pack-shop-overlay',
        'pack-shop-score', 'pack-shop-list', 'pack-shop-close-button'];
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    c.byId = id => elements[id] || null;
    c.getBattleViewModel = () => ({me: vm.runInContext('GameState.players.player', c), turn: 'me'});
    c.getDetailedPackEffectText = () => 'まな板の効果';
    vm.runInContext('packDefinitions.length = 0', c);
    const renderSource = read(`${prefix}render${suffix}.js`);
    vm.runInContext(extractFunction(renderSource, 'renderBoardCycleDetailsPanel', 'renderSetConfirmPanel'), c);
    vm.runInContext('let packShopOpen = true; ' + extractFunction(renderSource, 'renderPackShopModal', 'renderDiscardButton'), c);
    const render = () => { c.renderPackShopModal(); c.renderBoardCycleDetailsPanel(); };

    c.openBoardCycleDetails();
    render();
    assert.equal(state().selectionMode, 'board-details');
    assert.equal(elements['board-cycle-overlay'].classList.contains('hidden'), false);
    assert.equal(elements['board-cycle-panel'].classList.contains('hidden'), false);
    assert.equal(elements['pack-shop-overlay'].classList.contains('hidden'), false);
    assert.equal(elements['board-cycle-start-button'].disabled, false);
    assert.match(elements['board-cycle-start-button'].textContent, /残り1回/);

    c.beginBoardCycleSelection();
    render();
    assert.equal(state().selectionMode, 'board-cycle-select');
    assert.equal(elements['pack-shop-overlay'].classList.contains('hidden'), true);
    c.toggleBoardCycleSelection('event-1');
    c.cancelBoardCycleSelection();
    render();
    assert.equal(state().selectionMode, 'board-details');
    assert.deepEqual(state().selectedTargetIds, []);
    assert.equal(elements['board-cycle-overlay'].classList.contains('hidden'), false);

    c.beginBoardCycleSelection();
    c.toggleBoardCycleSelection('event-1');
    c.confirmBoardCycleSelection();
    render();
    assert.equal(state().selectionMode, null);
    assert.equal(state().players.player.events.length, 1);
    assert.equal(state().players.player.hand.length, 1);
    assert.equal(state().discard.at(-1).id, 'event-1');
    assert.equal(state().players.player.boardCycleUsed, 1);
    assert.equal(elements['board-cycle-overlay'].classList.contains('hidden'), true);
    assert.equal(elements['pack-shop-overlay'].classList.contains('hidden'), false);

    c.openBoardCycleDetails();
    render();
    assert.equal(elements['board-cycle-start-button'].disabled, true);
    assert.match(elements['board-cycle-start-button'].textContent, /残り0回/);
    assert.equal(elements['board-cycle-reason'].textContent, '使用済み');
    c.beginBoardCycleSelection();
    assert.equal(state().selectionMode, 'board-details');
    c.closeBoardCycleDetails();
    render();
    assert.equal(state().selectionMode, null);
    assert.equal(elements['board-cycle-overlay'].classList.contains('hidden'), true);
    assert.ok(logs.includes('まな板：イベントを1枚捨てて1枚引いた'));

    c.openBoardCycleDetails();
    c.byId = id => id === 'board-cycle-close-button' ? null : elements[id] || null;
    c.renderBoardCycleDetailsPanel();
    assert.equal(state().selectionMode, null);
    assert.equal(elements['board-cycle-overlay'].classList.contains('hidden'), true);
});
