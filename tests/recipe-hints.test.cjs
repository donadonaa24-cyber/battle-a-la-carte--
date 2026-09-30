const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ingredient = (name, extra = {}) => ({ type: 'ingredient', name, ...extra });

function element() {
    const classes = new Set(['hidden']);
    return {
        children: [], style: {}, textContent: '', disabled: false, title: '',
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        },
        append(...items) { this.children.push(...items); },
        appendChild(item) { this.children.push(item); },
        replaceChildren(...items) { this.children = items; },
        setAttribute() {}, focus() { this.focused = true; }
    };
}

function runtime(mobile = false) {
    const nodes = Object.fromEntries(['recipe-hints-overlay', 'recipe-hints-list', 'recipe-hints-close-button',
        'cook-button', 'end-turn-button', 'open-pack-shop-button'].map(id => [id, element()]));
    const c = vm.createContext({ console, document: {
        getElementById: id => nodes[id] || null,
        createElement: () => element()
    } });
    c.window = c;
    const prefix = mobile ? 'mobile/' : '';
    const suffix = mobile ? '-sp' : '';
    vm.runInContext(read(`${prefix}rules${suffix}.js`), c);
    vm.runInContext(read('recipe-hints.js'), c);
    c.GameState = { currentPhase: 'メインフェイズ', gameEnded: false, selectionMode: null };
    let me = { hand: [], set: [], lockedCookingThisTurn: false };
    c.getBattleViewModel = () => ({ me, turn: 'me', opponent: { hand: [ingredient('秘密')] } });
    c.getRecipeImagePath = name => `art/${name}.webp`;
    const setMe = value => { me = value; };
    return { c, nodes, setMe };
}

for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile' : 'PC'} hint counts, sorting, roman and set labels`, () => {
        const { c, setMe } = runtime(mobile);
        const player = { hand: [ingredient('ごはん'), ingredient('魚')], set: [ingredient('ごはん')] };
        setMe(player);
        const bomb = vm.runInContext("recipes.find(r => r.name === '爆弾おにぎり')", c);
        const item = c.RecipeHints.detailsFor(player, bomb);
        assert.deepEqual(Array.from(item.missing), ['ごはん', 'ごはん', 'のり']);
        assert.equal(c.RecipeHints.formatNames(item.missing), 'ごはん×2・のり');
        assert.equal(item.usedSet, true);
        assert.equal(c.RecipeHints.formatNames(item.owned), 'ごはん×2・魚');
        assert.equal(c.RecipeHints.rank(player, [bomb])[0].usedSet, true);
        const roman = { hand: [ingredient('ごはん', { romanReserved: true })], set: [] };
        const eggRice = vm.runInContext("recipes.find(r => r.name === '卵かけごはん')", c);
        assert.deepEqual(Array.from(c.RecipeHints.detailsFor(roman, eggRice).missing), ['ごはん', '卵']);
        assert.equal(c.RecipeHints.detailsFor(roman, bomb).owned[0], 'ごはん');
        const ranked = c.RecipeHints.rank({ hand: [ingredient('ごはん')], set: [] }, [
            { name: 'low', points: 1, required: ['ごはん', '卵'] },
            { name: 'high', points: 4, required: ['ごはん', '牛肉'] },
            { name: 'far', points: 10, required: ['ごはん', '卵', '魚'] }
        ]);
        assert.deepEqual(Array.from(ranked, item => item.recipe.name), ['high', 'low', 'far']);
        assert.equal(c.RecipeHints.closest({ hand: [], set: [] }).length, 6);
        const farOnly = c.RecipeHints.closest({ hand: [], set: [] }, [bomb]);
        assert.equal(farOnly.length, 1);
        assert.equal(farOnly[0].missing.length >= 3, true);
        assert.deepEqual(Array.from(c.RecipeHints.detailsFor({ hand: [ingredient('魚', { trapLocked: true })], set: [] }, bomb).owned), []);
        const nearContainer = element();
        c.RecipeHints.renderNear(nearContainer, { hand: [ingredient('ごはん')], set: [ingredient('魚')] });
        const setRow = nearContainer.children[0].children.find(row =>
            row.children?.[1]?.children?.[0]?.textContent?.includes('鮭おにぎり'));
        assert.equal(setRow.children[1].children.at(-1).textContent, 'セット済み（料理に使える）');
    });

    test(`${mobile ? 'mobile' : 'PC'} cook button availability and hint modal`, () => {
        const { c, nodes, setMe } = runtime(mobile);
        const player = { hand: [ingredient('ごはん')], set: [ingredient('卵')], lockedCookingThisTurn: false };
        setMe(player);
        const source = read(mobile ? 'mobile/render-sp.js' : 'render.js');
        const start = source.indexOf('function renderShopButtons()');
        const end = source.indexOf('function openPackShop()', start);
        assert.ok(start >= 0 && end > start);
        c.byId = id => nodes[id] || null;
        c.packDefinitions = [];
        vm.runInContext(source.slice(start, end), c);
        const render = () => c.renderShopButtons();
        render();
        assert.equal(nodes['cook-button'].disabled, false);
        assert.equal(nodes['cook-button'].classList.contains('has-recipe-alert'), true);
        player.set = [];
        render();
        assert.equal(nodes['cook-button'].disabled, false);
        assert.equal(nodes['cook-button'].classList.contains('has-recipe-alert'), false);
        c.RecipeHints.show();
        assert.equal(nodes['recipe-hints-overlay'].classList.contains('hidden'), false);
        assert.ok(nodes['recipe-hints-list'].children.length > 0);
        assert.match(nodes['recipe-hints-list'].children[0].children[1].children[2].textContent, /^あと：/);
        player.set = [ingredient('卵')];
        c.RecipeHints.render();
        assert.equal(nodes['recipe-hints-overlay'].classList.contains('hidden'), true);
        player.set = [];
        c.RecipeHints.show();
        nodes['recipe-hints-close-button'].onclick();
        assert.equal(nodes['recipe-hints-overlay'].classList.contains('hidden'), true);
        for (const change of [
            () => { c.GameState.selectionMode = 'event-target'; },
            () => { c.GameState.selectionMode = null; c.GameState.currentPhase = 'エンドフェイズ'; },
            () => { c.GameState.currentPhase = 'メインフェイズ'; player.lockedCookingThisTurn = true; },
            () => { player.lockedCookingThisTurn = false; c.GameState.gameEnded = true; }
        ]) {
            change(); render();
            assert.equal(nodes['cook-button'].disabled, true);
        }
        c.GameState.gameEnded = false;
        c.getBattleViewModel = () => ({ me: player, turn: 'opponent' });
        render();
        assert.equal(nodes['cook-button'].disabled, true);
    });

    test(`${mobile ? 'mobile' : 'PC'} guest hints use projected own cards`, () => {
        const { c, nodes, setMe } = runtime(mobile);
        setMe({ hand: [ingredient('卵')], set: [] });
        c.getBattleViewModel = () => ({
            me: { hand: [ingredient('卵')], set: [] }, turn: 'me', online: true,
            get opponent() { throw new Error('opponent state accessed'); }
        });
        c.RecipeHints.show();
        const text = nodes['recipe-hints-list'].children.map(row =>
            row.children[1].children.map(child => child.textContent).join(' ')).join(' ');
        assert.match(text, /持っている：卵/);
        assert.doesNotMatch(text, /秘密/);
    });
}

test('both stages include a scrollable blocking hint dialog and current cache version', () => {
    for (const html of ['web.html', 'mobile/mobile.html']) {
        const source = read(html);
        assert.match(source, /id="recipe-hints-overlay"[^>]*aria-modal="true"/);
        assert.match(source, /id="recipe-hints-list"/);
        assert.match(source, /recipe-hints\.js\?v=20260930-hint1/);
    }
    for (const css of ['style.css', 'mobile/style-sp.css']) {
        assert.match(read(css), /\.recipe-hints-list \{[^}]*overflow-y: auto/);
    }
    assert.match(read('network.js'), /name === 'playerShowRecipeCandidates' &&\s*findPossibleRecipesForPlayer\(getBattleViewModel\(\)\.me\)\.length === 0/);
});
