const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const firstLog = '最初のターンはイベントを使用できません。';
const firstNotice = '先攻は最初のターンにイベントカードを使えません';
const ingredient = id => ({ id, type: 'ingredient', name: 'ごはん' });
const eventCard = (name = '爆買い') => ({ id: 'event', type: 'event', name });

function element() {
    const classes = new Set();
    const el = {
        children: [], dataset: {}, style: {}, handlers: {}, textContent: '', title: '',
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        },
        appendChild(child) { this.children.push(child); child.parent = this; },
        append(...children) { children.forEach(child => this.appendChild(child)); },
        addEventListener(name, handler) { this.handlers[name] = handler; },
        setAttribute() {}, removeAttribute() {},
        closest() { return this; },
        getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; },
        cloneNode() { const result = element(); result.classList.add(...classes); return result; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    };
    Object.defineProperty(el, 'innerHTML', { set() { this.children = []; } });
    return el;
}

function runtime(mobile) {
    const ids = ['field-notice', 'field-notice-message', 'field-notice-detail', 'event-first-turn-hint', 'player-hand-mixed'];
    const nodes = Object.fromEntries(ids.map(id => [id, element()]));
    nodes['field-notice'].classList.add('hidden');
    const zone = element(), stage = element(), body = element(), listeners = {}, logs = [], jobs = new Map();
    let now = 0, nextId = 0;
    const c = vm.createContext({ console,
        setTimeout(callback, delay) { const id = ++nextId; jobs.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => jobs.delete(id), performance: { now: () => now },
        document: { getElementById: id => nodes[id] || null, createElement: element, body,
            querySelector: () => zone, addEventListener: (name, handler) => { listeners[name] = handler; } },
        StageLayout: { stage, toStagePoint: p => p, toStageRect: r => r }
    });
    c.window = c;
    const file = name => mobile ? `mobile/${name}-sp.js` : `${name}.js`;
    for (const name of ['cards', 'state', 'rules', 'player']) vm.runInContext(read(file(name)), c, { filename: file(name) });
    vm.runInContext(read('battle-view-model.js'), c);
    vm.runInContext(read(file('render')), c, { filename: file('render') });
    vm.runInContext(read('card-drag.js'), c);
    c.createFaceCard = (card, className) => { const el = element(); el.classList.add('card', className); return el; };
    c.addLog = message => logs.push(message);
    c.updateUI = () => c.renderPlayerMixedHand();
    Object.assign(c.GameState, { players: { player: c.createPlayerState(), cpu: c.createPlayerState() },
        turnNumber: 1, currentTurn: 'player', currentPhase: 'メインフェイズ', selectionMode: null, gameEnded: false });
    c.GameState.players.player.hand = [ingredient('hand')];
    c.GameState.players.player.events = [eventCard()];
    function tick(ms) {
        now += ms;
        for (const [id, job] of [...jobs]) if (job.at <= now && jobs.delete(id)) job.callback();
    }
    function drag(pointerType) {
        const source = nodes['player-hand-mixed'].children[1];
        const pointer = (x, y) => ({ pointerId: 1, button: 0, pointerType, clientX: x, clientY: y,
            target: source, preventDefault() {}, stopPropagation() {} });
        listeners.pointerdown(pointer(5, 5));
        listeners.pointermove(pointer(20, 50));
        listeners.pointerup(pointer(20, 50));
        assert.equal(c.CardDragActions.getLastResult(), 'accepted:none');
        assert.equal(stage.children.length, 0, 'drag overlays cleaned up');
    }
    return { c, nodes, zone, logs, tick, drag };
}

function assertNotice(r, message) {
    assert.equal(r.nodes['field-notice'].classList.contains('hidden'), false);
    assert.equal(r.nodes['field-notice-message'].textContent, message);
}

for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'PC';
    test(`${label}: click/tap and mouse/touch event drops refuse the opening turn with an expiring notice`, () => {
        const r = runtime(mobile), { c, nodes, logs, tick, drag, zone } = r;
        c.renderPlayerMixedHand();
        const before = clone(c.GameState);
        nodes['player-hand-mixed'].children[1].handlers.click();
        assertNotice(r, firstNotice);
        assert.equal(nodes['field-notice-detail'].textContent, '次のターンから使えます');
        assert.equal(zone.classList.contains('event-refusal-flash'), true);
        tick(400);
        assert.equal(zone.classList.contains('event-refusal-flash'), false);
        tick(2099);
        assertNotice(r, firstNotice);
        tick(1);
        assert.equal(nodes['field-notice'].classList.contains('hidden'), true);
        drag('mouse');
        drag('touch');
        assertNotice(r, firstNotice);
        assert.deepEqual(logs, [firstLog, firstLog, firstLog]);
        assert.deepEqual(clone(c.GameState), before, 'refusal leaves game state and cards unchanged');
        tick(2500);
        c.GameState.turnNumber = 2;
        nodes['player-hand-mixed'].children[1].handlers.click();
        assert.equal(c.GameState.selectionMode, 'event-confirm', 'normal input still works afterwards');
    });

    test(`${label}: only own opening turn dims events; cached hand refreshes when turn number changes`, () => {
        const { c, nodes } = runtime(mobile);
        const assertHint = expected => {
            c.renderPlayerMixedHand();
            assert.equal(nodes['player-hand-mixed'].children[0].classList.contains('event-first-turn-locked'), false);
            assert.equal(nodes['player-hand-mixed'].children[1].classList.contains('event-first-turn-locked'), expected);
            assert.equal(nodes['event-first-turn-hint'].classList.contains('hidden'), !expected);
        };
        assertHint(true);
        c.GameState.turnNumber = 2;
        assertHint(false);
        c.GameState.turnNumber = 1;
        c.GameState.currentTurn = 'cpu';
        assertHint(false); // Episode 1: player moves second.
        c.GameState.currentTurn = 'player';
        assertHint(true);
        c.GameState.gameEnded = true;
        assertHint(false);
    });

    test(`${label}: other event refusals and rechecked confirmation keep the exact log message`, () => {
        const r = runtime(mobile), { c, logs, nodes, tick } = r;
        const me = c.GameState.players.player;
        c.GameState.turnNumber = 2;
        me.usedEventThisTurn = true;
        c.playerUseEvent('event');
        const usedMessage = 'このターンはすでにイベントカードを使用しています。';
        assertNotice(r, usedMessage);
        assert.equal(nodes['field-notice-detail'].classList.contains('hidden'), true);
        assert.equal(logs.at(-1), usedMessage);
        me.usedEventThisTurn = false;
        for (const name of ['緊急料理', '創作料理']) {
            me.events = [eventCard(name)];
            me.recipesCookedThisTurn = 1;
            c.playerUseEvent('event');
            const message = `このターンはすでに料理を作っているため「${name}」は発動できません。`;
            assertNotice(r, message);
            assert.equal(logs.at(-1), message);
            me.recipesCookedThisTurn = 0;
            me.score = 7;
            c.executeEventEffect(me, c.GameState.players.cpu, me.events[0], 'player', null);
            assertNotice(r, logs.at(-1));
            assert.match(logs.at(-1), name === '創作料理' ? /点数が7以上/ : /点数が4以上/);
        }
        me.events = [eventCard('やり直し')];
        me.hand = [];
        c.playerUseEvent('event');
        assertNotice(r, '引き直す手札がありません。');
        assert.equal(logs.at(-1), '引き直す手札がありません。');
        c.GameState.selectionMode = 'event-confirm';
        c.GameState.pendingEventCardId = 'event';
        c.GameState.turnNumber = 1;
        c.confirmEventCard();
        assertNotice(r, firstNotice);
        assert.equal(logs.at(-1), firstLog);
        assert.equal(c.GameState.selectionMode, null);
        tick(2000);
        c.showFieldNotice('別の拒否');
        tick(500);
        assertNotice(r, '別の拒否'); // Previous timeout cannot hide the new notice.
        tick(2000);
        assert.equal(nodes['field-notice'].classList.contains('hidden'), true);
    });

    test(`${label}: board refusals reuse the notice and CPU failures do not display a player notice`, () => {
        const r = runtime(mobile), { c, logs, nodes } = r;
        assert.equal(c.playerUseBoardCycle('event'), false);
        assertNotice(r, 'まな板を持っていません。');
        assert.equal(logs.at(-1), 'まな板を持っていません。');
        const me = c.GameState.players.player;
        me.packs.push({ key: 'board' });
        c.GameState.selectionMode = 'board-details';
        c.beginBoardCycleSelection();
        assertNotice(r, '相手より点数が低いときだけ使用できます。');
        me.boardCycleUsed = 1;
        c.GameState.selectionMode = 'board-cycle-select';
        c.confirmBoardCycleSelection();
        assertNotice(r, 'まな板の使用回数が残っていません。');
        nodes['field-notice'].classList.add('hidden');
        const cpu = c.GameState.players.cpu;
        cpu.score = 8;
        c.executeEventEffect(cpu, me, eventCard('緊急料理'), 'cpu', null);
        assert.equal(nodes['field-notice'].classList.contains('hidden'), true);
        assert.equal(logs.at(-1), 'CPUは「緊急料理」を使えませんでした（点数が4以上）。');
    });
}

function workerRuntime() {
    const c = vm.createContext({ console, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
    c.self = c;
    c.importScripts = (...names) => names.forEach(name => vm.runInContext(read(name.split('?')[0]), c));
    c.importScripts('battle-engine-worker.js');
    return c;
}

test('host rejects either opening player with a private notice; PC/mobile guests render the host response', async () => {
    const worker = workerRuntime();
    for (const role of ['host', 'guest']) {
        const initial = await worker.execute({ kind: 'init', firstRole: role });
        const snapshot = clone(initial.snapshot);
        snapshot.players[role === 'host' ? 'player' : 'cpu'].events = [eventCard()];
        const result = await worker.execute({ kind: 'action', role, snapshot,
            action: { name: 'playerUseEvent', args: ['event'] } });
        assert.deepEqual(clone(result.snapshot), snapshot);
        assert.deepEqual(clone(result.views[role].logs), [firstLog]);
        assert.deepEqual(clone(result.views[role].effects), [{ name: 'showFieldNotice', args: [firstLog] }]);
        assert.equal(result.views[role === 'guest' ? 'host' : 'guest'].effects.length, 0);
        for (const mobile of [false, true]) {
            const r = runtime(mobile), { c, nodes, logs } = r;
            Object.assign(c, { pending: { id: 'request', revision: 0 }, deadline: null,
                pendingKey: 'pending', sessionStorage: { removeItem() {} }, controls() {},
                revision: 0, stopped: false, started: true, status() {}, quickConfirm: null, metrics: null,
                $: id => nodes[id] || null });
            const network = read('network.js');
            vm.runInContext(network.slice(network.indexOf('    function applyView('), network.indexOf('    async function sync(')), c);
            c.applyView({ revision: 1, payload: { ...clone(result.views[role]), request: 'request' } });
            assertNotice(r, firstNotice);
            assert.deepEqual(logs, [firstLog]);
            assert.equal(c.pending, null);
            assert.equal(nodes['player-hand-mixed'].children.find(el => el.classList.contains('event-card')).classList.contains('event-first-turn-locked'), true);
            const later = clone(result.snapshot);
            later.turnNumber = 2;
            later.currentTurn = role === 'guest' ? 'player' : 'cpu';
            const views = await worker.execute({ kind: 'project', snapshot: later });
            c.applyView({ revision: 2, payload: clone(views[role]) });
            assert.equal(nodes['event-first-turn-hint'].classList.contains('hidden'), true);
        }
    }
});

test('PC/mobile notice helpers, hints, styles and current asset references stay in sync', () => {
    assert.equal(read('player.js'), read('mobile/player-sp.js'));
    const functionBlock = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    for (const [start, end] of [['let fieldNoticeTimer', 'function shouldSkipSectionRender'], ['function renderPlayerMixedHand()', 'function renderPlayerSet()']]) {
        assert.equal(functionBlock(read('render.js'), start, end), functionBlock(read('mobile/render-sp.js'), start, end));
    }
    const marker = '/* Event refusals and first-turn hints shared by PC/mobile. */';
    const css = read('style.css').split(marker)[1];
    assert.equal(css, read('mobile/style-sp.css').split(marker)[1]);
    assert.match(css, /\.field-notice\s*\{[^}]*left: 50%;[^}]*top: 50%;[^}]*pointer-events: none;/);
    assert.match(css, /event-first-turn-locked\s*\{ opacity: \.65;/);
    for (const [file, suffix] of [['web.html', ''], ['mobile/mobile.html', '-sp']]) {
        const html = read(file);
        assert.match(html, /id="field-notice"[^>]*role="status"[^>]*aria-live="polite"/);
        assert.match(html, /id="event-first-turn-hint"[^>]*>1ターン目は使用不可</);
        for (const asset of [`style${suffix}.css`, `player${suffix}.js`, `render${suffix}.js`, 'network.js']) {
            const version = asset.startsWith('player') ? '20261002-ach1' : asset.startsWith('style') ? '20261003-adv1' : '20261003-rewards-bgm1';
            assert.ok(html.includes(`${asset}?v=${version}`), asset);
        }
    }
    assert.match(read('network.js'), /battle-engine-worker\.js\?v=20261003-rewards-bgm1/);
    assert.match(read('battle-engine-worker.js'), /player\.js\?v=20261002-ach1/);
});
