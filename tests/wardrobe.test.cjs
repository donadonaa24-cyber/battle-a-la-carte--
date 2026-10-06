'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const PROFILE = 'battle-a-la-carte:user-profile:v1', PROGRESS = 'battleAlaCarteStoryProgressV1';
const clone = value => JSON.parse(JSON.stringify(value));
for(const mobile of [false,true]) {
    const label=mobile?'phone':'PC';
    test(`101b ${label}: 栞那 remains locked until Halloween CLEAR; every skill and owned wardrobe work after reload/reset`,()=>{
        const {c,nodes,storage}=runtime(mobile);
        for(const id of ['start-character-cards','user-favorite-character','start-costume-wrap','start-costume-select'])nodes.set(id,element());
        for(const progress of [{},{'special-summer':true},{episode10:true},{'special-halloween':'true'},{'special-halloween':false}]) {
            storage.set(PROGRESS,JSON.stringify(progress));assert.equal(c.isPlayableCharacterUnlocked('kanna'),false);
            assert.equal(c.selectCharacterCostume('kanna','halloween'),false);assert.equal(c.getStartCharacterOptionById('kanna'),null);
            c.renderStartCharacterCards('start-character-cards','chizuru');assert.doesNotMatch(nodes.get('start-character-cards').innerHTML,/data-character-id="kanna"/);
            c.renderUserStageProfile();assert.match(nodes.get('user-favorite-character').innerHTML,/value="kanna" disabled>栞那：特別編『Trick or Treat？』クリアで解放/);
        }
        storage.set(PROGRESS,JSON.stringify({'special-halloween':true,unknown:{keep:1}}));const before=storage.get(PROGRESS);
        c.updateUserBasicSettings({favoriteCharacterId:'kanna'});assert.equal(c.getPreferredStartCharacterId(),'kanna');
        c.setCharacterChoice('kanna');
        for(const skill of c.getSkillDefinitions()) {vm.runInContext(`selectedStartSkillKey='${skill.key}'`,c);c.applyCharacterChoice();c.applyBattleSkillSetup();assert.equal(c.GameState.characterIds.player,'kanna');assert.equal(c.GameState.players.player.selectedSkillKey,skill.key);}
        assert.equal(c.selectCharacterCostume('kanna','summer'),false);assert.equal(c.selectCharacterCostume('kanna','bogus'),false);
        for(const id of ['kanna','chizuru']) {assert.equal(c.selectCharacterCostume(id,'halloween'),true);assert.equal(runtime(mobile,storage).c.getSelectedCharacterCostume(id),'halloween');}
        c.renderStartCostumePicker();assert.match(nodes.get('start-costume-select').innerHTML,/ハロウィン・ウィッチ/);
        c.renderStartCharacterCards('start-character-cards','kanna');assert.match(nodes.get('start-character-cards').innerHTML,/kanna-halloween-standing.webp/);
        assert.equal(c.getGalleryItemsByType('characters').filter(item=>item.costume).length,2);
        c.resetUserProfile();assert.equal(c.isPlayableCharacterUnlocked('kanna'),true);assert.equal(c.getSelectedCharacterCostume('kanna'),'default');assert.equal(c.getCharacterCostumeOptions('chizuru').length,2);assert.equal(storage.get(PROGRESS),before);
        c.console={warn(){}};c.localStorage.setItem=()=>{throw Error('quota');};assert.equal(c.selectCharacterCostume('kanna','halloween'),true);assert.equal(c.getSelectedCharacterCostume('kanna'),'halloween');
        const viewer=runtime(mobile,storage,true);assert.equal(viewer.c.isPlayableCharacterUnlocked('kanna'),false);assert.equal(viewer.c.selectCharacterCostume('kanna','halloween'),false);assert.equal(viewer.writes.length,0);
    });
    test(`101b ${label}: six Halloween frames align, own HUD/skill/Mode/result use wardrobe; CPU keeps default and story overrides`,()=>{
        const r=runtime(mobile),{c,nodes,storage,load}=r;storage.set(PROGRESS,JSON.stringify({'special-halloween':true}));load(mobile?'mobile/render-sp.js':'render.js');
        const prefix=mobile?'../assets/':'assets/',p=element(),cpu=element();c.document.querySelector=s=>s==='.player-icon'?p:s==='.cpu-icon'?cpu:null;nodes.set('result-summary',element());
        const metrics=[];c.BattleStoryIconMetrics={apply:(_img,id,cell)=>metrics.push([id,cell])};
        for(const id of ['kanna','chizuru']) {
            c.selectCharacterCostume(id,'halloween');c.GameState.characterIds={player:id,cpu:id};c.getBattleViewModel=()=>({me:{score:0,characterId:id,set:[]},opponent:{score:0,characterId:id,set:[]},winner:'me',online:!!c.FriendBattle?.isActive()});
            for(const online of [false,true]) {
                c.FriendBattle={isActive:()=>online};
                for(const cell of c.BattleImages.expressionCells) {const frame=element();c.BattleImages.applyExpression(frame,id,cell,prefix,'player');assert.match(frame.children[0].getAttribute('src'),new RegExp(`${id}-halloween-${cell}-alpha`));assert.deepEqual(metrics.at(-1),[id,cell]);assert.doesNotMatch(c.BattleImages.expressionPath(id,cell,prefix,'cpu'),/-halloween-/);}
                c.updateCharacterFaces();assert.match(p.children[0].getAttribute('src'),/-halloween-/);assert.doesNotMatch(cpu.children[0].getAttribute('src'),/-halloween-/);
                assert.match(c.getSkillCutinImagePathForSide('player'),/-halloween-smile-/);assert.match(c.getBattleModeCutinImagePathForSide('player'),/-halloween-laugh-/);
                c.renderMatchResultSummary();const files=n=>n.children.flatMap(child=>[child.getAttribute?.('src'),...files(child)]).filter(Boolean);assert.ok(files(nodes.get('result-summary')).some(file=>file.includes('-halloween-gentle-')));
            }
            c.GameState.storyEpisodeId='episode4';assert.doesNotMatch(c.BattleImages.expressionPath(id,'normal',prefix,'player'),/-halloween-/);
            c.selectCharacterCostume(id,'default');c.GameState.storyEpisodeId='special-halloween';for(const side of ['player','cpu'])assert.match(c.BattleImages.expressionPath(id,'normal',prefix,side),/-halloween-/);
            c.GameState.storyEpisodeId=null;
            for(const costume of ['default','halloween']) assert.ok(fs.existsSync(path.join(root,c.BattleImages.standingPath(id,costume).split('?')[0])));
        }
    });
    test(`101b ${label}: saved favourite 栞那 defaults to 千鶴 in online preparation without changing favourite`,()=>{
        const r=runtime(mobile);r.storage.set(PROGRESS,JSON.stringify({'special-halloween':true}));r.c.updateUserBasicSettings({favoriteCharacterId:'kanna'});
        const select=element();select.value='kanna';r.nodes.set('online-character',select);r.c.resetUnsupportedOnlineCharacter();assert.equal(select.value,'chizuru');assert.equal(r.c.getUserProfile().favoriteCharacterId,'kanna');
    });
}
test('101b online 栞那 is disabled and profile admission stays on existing four-character fields',()=>{
    const source=read('network.js');assert.match(source,/<option value="kanna" disabled>栞那：オンライン対戦は今後対応予定<\/option>/);
    const body=source.slice(source.indexOf('    function profileInfo('),source.indexOf('    async function enter('));
    const c=vm.createContext({$:()=>null,window:{getUserProfile:()=>({favoriteCharacterId:'kanna',favoriteSkillKey:'foodTrap'}),getSkillDefinitionByKey:()=>({})}});vm.runInContext(body,c);
    assert.equal(c.profileInfo().character,'chizuru');assert.equal(c.profileInfo({character:'kanna'}).character,'chizuru');assert.deepEqual(Object.keys(c.profileInfo()).sort(),['character','name','skill']);
});
function element() {
    const attrs = {}, classes = new Set();
    const node = { value: '', innerHTML: '', children: [], listeners: {}, style: {setProperty() {}},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        appendChild(child) { this.children.push(child); return child; },
        append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
        setAttribute(key, value) { attrs[key] = value; }, getAttribute: key => attrs[key],
        classList: { add: (...keys) => keys.forEach(key => classes.add(key)), remove: (...keys) => keys.forEach(key => classes.delete(key)),
            toggle(key, on) { if (on) classes.add(key); else classes.delete(key); }, contains: key => classes.has(key) }
    };
    return node;
}
function runtime(mobile = false, storage = new Map(), viewer = false) {
    const nodes = new Map(), writes = [];
    const c = vm.createContext({console, URL, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, addLog() {},
        location: {pathname: mobile ? '/mobile/mobile.html' : '/web.html', search: viewer ? '?viewer' : ''},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem(key, value) { storage.set(key, value); writes.push(key); }},
        document: {readyState: 'loading', createElement: element, addEventListener() {},
            querySelectorAll: () => [], querySelector: () => null, getElementById: id => nodes.get(id) || null}
    });
    c.window = c;
    const load = file => vm.runInContext(read(file), c, {filename: file});
    for (const file of ['state.js', 'profile.js', 'battle-images.js', 'story-data/characters.js', 'story-data/registry.js',
        'story-data/episode4.js', 'story-data/episode7.js', 'story-data/episode-special-summer.js', 'story-data/episode-special-halloween.js', mobile ? 'mobile/main-sp.js' : 'main.js']) load(file);
    return {c, nodes, storage, writes, load};
}

for (const mobile of [false, true]) test(`104a ${mobile ? 'phone' : 'PC'}: every default/costume card and gallery standing has a background; introductions retain alpha`, () => {
    const {c, nodes, storage, load} = runtime(mobile);
    load('story-data/episode-special-kyudo.js');
    storage.set(PROGRESS, JSON.stringify({'special-summer': true, 'special-halloween': true, 'special-kyudo': true}));
    for (const id of ['start-character-cards', 'start-opponent-cards', 'user-favorite-character', 'start-gallery-list']) nodes.set(id, element());
    const costumes = {chizuru: 'halloween', mai: 'kyudo', takumi: 'kyudo', akatsuki: 'summer', tsuyoshi: 'summer', kanna: 'halloween', yuzuki: 'kyudo'};
    const prefix = mobile ? '../' : '';
    const sources = id => Array.from(nodes.get(id).innerHTML.matchAll(/<img\b[^>]*src="([^"]*)"/g), ([, src]) => src);
    const checkStanding = src => {
        assert.match(src, /-standing\.webp(?:\?|$)/);
        assert.doesNotMatch(src, /-alpha/);
        assert.ok(fs.existsSync(path.join(root, src.replace(/^\.\.\//, '').split('?')[0])), src);
    };
    for (const [id, costume] of Object.entries(costumes)) {
        c.updateUserBasicSettings({favoriteCharacterId: id});
        for (const selected of ['default', costume]) {
            assert.equal(c.selectCharacterCostume(id, selected), true);
            c.renderUserStageProfile();
            assert.equal(nodes.get('user-favorite-character').value, id);
            assert.equal(c.getPreferredStartCharacterId(), id);
            c.renderStartCharacterCards('start-character-cards', c.getPreferredStartCharacterId());
            const cards = sources('start-character-cards');
            assert.equal(cards.length, 7); cards.forEach(checkStanding);
            const expected = `${prefix}assets/battle-images/characters/standing/${id}${selected === 'default' ? '' : '-' + selected}-standing.webp`;
            assert.ok(cards.some(src => src.split('?')[0] === expected), `${id}/${selected}`);
            c.renderStartCharacterCards('start-opponent-cards', id, true);
            const opponents = sources('start-opponent-cards');
            assert.equal(opponents.length, 7); opponents.forEach(checkStanding);
            assert.ok(opponents.some(src => src.split('?')[0] === `${prefix}assets/battle-images/characters/standing/${id}-standing.webp`));
            const character = c.BattleStoryAssets.characters[id];
            const intro = character.costumes?.[selected]?.introStanding || character.introStanding;
            assert.match(c.BattleStoryAssets.url(intro), /-standing-alpha\.webp\?v=/);
            assert.ok(fs.existsSync(path.join(root, intro)));
        }
    }
    c.renderStartGallery('characters');
    const gallery = sources('start-gallery-list');
    assert.equal(gallery.length, 7); gallery.forEach(checkStanding);
    for (const [id, costume] of Object.entries(costumes)) assert.ok(gallery.includes(`${prefix}assets/battle-images/characters/standing/${id}-${costume}-standing.webp?v=20261007-osananajimi105a`));
});

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`100c ${label}: fresh save hides locked 剛; existing 100b clear unlocks selection/favourite/mission opponent with every skill`, () => {
        const {c, nodes, storage} = runtime(mobile);
        for (const id of ['start-character-cards', 'start-opponent-cards', 'start-mission-opponent', 'user-favorite-character']) nodes.set(id, element());
        assert.equal(c.isPlayableCharacterUnlocked('tsuyoshi'), false);
        assert.equal(c.getStartCharacterOptionById('tsuyoshi'), null);
        c.setCharacterChoice('tsuyoshi'); c.applyCharacterChoice();
        assert.equal(c.GameState.characterIds.player, 'chizuru');
        c.renderStartCharacterCards('start-character-cards', 'chizuru');
        assert.doesNotMatch(nodes.get('start-character-cards').innerHTML, /data-character-id="tsuyoshi"/);
        c.updateUserBasicSettings({favoriteCharacterId: 'tsuyoshi'});
        assert.equal(c.getUserProfile().favoriteCharacterId, 'chizuru');
        // No episode1/episode10 proxy or truthy non-boolean value can unlock him.
        for (const progress of [{episode10: true}, {'special-summer': 'true'}, {'special-summer': false}]) {
            storage.set(PROGRESS, JSON.stringify(progress)); assert.equal(c.isPlayableCharacterUnlocked('tsuyoshi'), false);
        }
        storage.set(PROGRESS, JSON.stringify({'special-summer': true}));
        assert.equal(c.getStartCharacterOptionById('tsuyoshi').name, '剛');
        c.updateUserBasicSettings({favoriteCharacterId: 'tsuyoshi'});
        assert.equal(c.getPreferredStartCharacterId(), 'tsuyoshi');
        c.renderUserStageProfile();
        assert.match(nodes.get('user-favorite-character').innerHTML, /value="tsuyoshi">剛/);
        c.setCharacterChoice('tsuyoshi');
        for (const skill of c.getSkillDefinitions()) {
            vm.runInContext(`selectedStartSkillKey = '${skill.key}'`, c); c.applyCharacterChoice(); c.applyBattleSkillSetup();
            assert.equal(c.GameState.characterIds.player, 'tsuyoshi');
            assert.equal(c.GameState.players.player.selectedSkillKey, skill.key);
        }
        c.GameState.activeMissionId = 'noItems'; nodes.get('start-mission-opponent').value = 'tsuyoshi';
        c.setCharacterChoice('akatsuki'); c.applyCharacterChoice(); assert.equal(c.GameState.characterIds.cpu, 'tsuyoshi');
        const loaded = runtime(mobile, storage).c;
        assert.equal(loaded.getPreferredStartCharacterId(), 'tsuyoshi');
    });
    test(`100c ${label}: wardrobe migration, sanitization, save/reload, reset ownership and storage failures`, () => {
        const storage = new Map([[PROFILE, JSON.stringify({name: 'Old', favoriteCharacterId: 'akatsuki', coins: 17})]]);
        const {c} = runtime(mobile, storage);
        assert.equal(c.getSelectedCharacterCostume('akatsuki'), 'default');
        assert.equal(c.getUserProfile().coins, 17);
        assert.equal(c.selectCharacterCostume('akatsuki', 'summer'), false);
        storage.set(PROGRESS, JSON.stringify({'special-summer': true, unknown: {keep: 1}}));
        const before = storage.get(PROGRESS);
        assert.equal(c.selectCharacterCostume('akatsuki', 'summer'), true);
        assert.equal(c.selectCharacterCostume('tsuyoshi', 'summer'), true);
        assert.equal(c.selectCharacterCostume('mai', 'summer'), false);
        assert.equal(c.selectCharacterCostume('__proto__', 'summer'), false);
        assert.equal(c.selectCharacterCostume('tsuyoshi', 'bogus'), false);
        assert.equal(storage.get(PROGRESS), before);
        assert.equal(runtime(mobile, storage).c.getSelectedCharacterCostume('tsuyoshi'), 'summer');
        assert.equal(runtime(mobile, storage).c.getSelectedCharacterCostume('akatsuki'), 'summer');
        assert.equal(c.normalizeUserProfile({costumes: {tsuyoshi: 'bogus', mai: 'summer'}}).costumes.tsuyoshi, 'default');
        c.resetUserProfile(); assert.equal(c.isPlayableCharacterUnlocked('tsuyoshi'), true);
        assert.equal(c.getCharacterCostumeOptions('tsuyoshi').length, 2);
        assert.equal(c.getSelectedCharacterCostume('tsuyoshi'), 'default');
        assert.equal(storage.get(PROGRESS), before);
        c.console = {warn() {}};
        c.localStorage.setItem = () => { throw Error('quota'); };
        assert.equal(c.selectCharacterCostume('tsuyoshi', 'summer'), true);
        assert.equal(c.getSelectedCharacterCostume('tsuyoshi'), 'summer');
        c.localStorage.getItem = () => { throw Error('blocked'); };
        assert.doesNotThrow(() => c.getCharacterCostumeOptions('tsuyoshi'));
    });
    test(`100c ${label}: costume picker/standing/gallery show owned costumes; the CPU standing stays default`, () => {
        const {c, nodes, storage} = runtime(mobile);
        for (const id of ['start-costume-wrap', 'start-costume-select', 'start-character-cards', 'start-opponent-cards']) nodes.set(id, element());
        c.setCharacterChoice('akatsuki'); c.renderStartCostumePicker();
        assert.equal(nodes.get('start-costume-wrap').classList.contains('hidden'), true);
        storage.set(PROGRESS, JSON.stringify({'special-summer': true}));
        c.setCharacterChoice('tsuyoshi'); c.renderStartCostumePicker();
        assert.equal(nodes.get('start-costume-wrap').classList.contains('hidden'), false);
        assert.match(nodes.get('start-costume-select').innerHTML, /value="summer">サマービーチ/);
        c.selectCharacterCostume('tsuyoshi', 'summer');
        c.renderStartCharacterCards('start-character-cards', 'tsuyoshi');
        assert.match(nodes.get('start-character-cards').innerHTML, /tsuyoshi-summer-standing.webp/);
        c.renderStartCharacterCards('start-opponent-cards', 'tsuyoshi', true);
        assert.doesNotMatch(nodes.get('start-opponent-cards').innerHTML, /-summer-/);
        const gallery = c.getGalleryItemsByType('characters');
        assert.equal(gallery.filter(item => item.costume).length, 2);
        assert.ok(gallery.some(item => item.characterId === 'tsuyoshi' && !item.costume));
        c.setCharacterChoice('mai'); assert.equal(nodes.get('start-costume-wrap').classList.contains('hidden'), true);
    });
    test(`100c ${label}: all six battle frames/cutins/result follow own costume; same-character CPU and online opponent keep default`, () => {
        const {c, nodes, storage, load} = runtime(mobile);
        storage.set(PROGRESS, JSON.stringify({'special-summer': true}));
        load(mobile ? 'mobile/render-sp.js' : 'render.js');
        const p = element(), cpu = element();
        c.document.querySelector = selector => selector === '.player-icon' ? p : selector === '.cpu-icon' ? cpu : null;
        nodes.set('result-summary', element());
        const prefix = mobile ? '../assets/' : 'assets/';
        for (const id of ['tsuyoshi', 'akatsuki']) {
            c.GameState.characterIds = {player: id, cpu: id};
            c.getBattleViewModel = () => ({me: {score: 0, characterId: id, set: []}, opponent: {score: 0, characterId: id, set: []}, winner: 'me', online: !!c.FriendBattle?.isActive()});
            for (const online of [false, true]) {
                c.FriendBattle = {isActive: () => online};
                c.selectCharacterCostume(id, 'summer');
                for (const cell of c.BattleImages.expressionCells) {
                    const frame = element(); c.BattleImages.applyExpression(frame, id, cell, prefix, 'player');
                    assert.ok(frame.children[0].getAttribute('src').includes(`${id}-summer-${cell}-alpha.webp`));
                    assert.ok(!c.BattleImages.expressionPath(id, cell, prefix, 'cpu').includes('-summer-'));
                }
                c.updateCharacterFaces();
                assert.match(p.children[0].getAttribute('src'), /-summer-/);
                assert.doesNotMatch(cpu.children[0].getAttribute('src'), /-summer-/);
                assert.match(c.getSkillCutinImagePathForSide('player'), /-summer-smile-/);
                assert.match(c.getBattleModeCutinImagePathForSide('player'), /-summer-laugh-/);
                assert.doesNotMatch(c.getSkillCutinImagePathForSide('cpu'), /-summer-/);
                const stateBefore = clone(c.GameState); c.renderMatchResultSummary();
                assert.deepEqual(clone(c.GameState), stateBefore);
                const files = node => node.children.flatMap(child => [child.getAttribute?.('src'), ...files(child)]).filter(Boolean);
                assert.ok(files(nodes.get('result-summary')).some(file => file.includes('-summer-gentle-')));
                c.selectCharacterCostume(id, 'default'); c.updateCharacterFaces();
                assert.doesNotMatch(p.children[0].getAttribute('src'), /-summer-/);
            }
        }
    });
    test(`100c ${label}: story outfits override wardrobe in both directions; viewer cannot unlock or write wardrobe`, () => {
        const {c, storage} = runtime(mobile);
        storage.set(PROGRESS, JSON.stringify({'special-summer': true}));
        for (const id of ['tsuyoshi', 'akatsuki']) {
            c.selectCharacterCostume(id, 'summer'); c.GameState.storyEpisodeId = 'episode7';
            assert.doesNotMatch(c.BattleImages.expressionPath(id, 'normal', 'assets/', 'player'), /-summer-/);
            c.selectCharacterCostume(id, 'default'); c.GameState.storyEpisodeId = 'special-summer';
            for (const side of ['player', 'cpu']) assert.match(c.BattleImages.expressionPath(id, 'normal', 'assets/', side), /-summer-/);
            assert.ok(c.BattleStoryAssets.iconPath(id, 'normal').endsWith(`${id}-normal-alpha.webp`));
        }
        const viewerStorage = new Map(), v = runtime(mobile, viewerStorage, true);
        assert.equal(v.c.selectCharacterCostume('tsuyoshi', 'summer'), false);
        assert.equal(v.c.isPlayableCharacterUnlocked('tsuyoshi'), false);
        assert.equal(v.c.getSelectedCharacterCostume('akatsuki'), 'default');
        assert.equal(v.writes.length, 0);
    });
}
test('100c online lobby disables 剛 and defaults a saved favourite to 千鶴 without extra protocol fields', () => {
    const source = read('network.js');
    assert.match(source, /<option value="tsuyoshi" disabled>剛：オンライン対戦は今後対応予定<\/option>/);
    const profileInfo = source.slice(source.indexOf('    function profileInfo('), source.indexOf('    async function enter('));
    const c = vm.createContext({$: () => null, window: {getUserProfile: () => ({favoriteCharacterId: 'tsuyoshi', favoriteSkillKey: 'foodTrap'}), getSkillDefinitionByKey: () => ({})}});
    vm.runInContext(profileInfo, c);
    assert.equal(c.profileInfo().character, 'chizuru');
    assert.equal(c.profileInfo({favoriteCharacterId: 'tsuyoshi'}).character, 'chizuru');
    assert.deepEqual(Object.keys(c.profileInfo()).sort(), ['character', 'name', 'skill']);
    for (const mobile of [false, true]) {
        const r = runtime(mobile); r.storage.set(PROGRESS, JSON.stringify({'special-summer': true}));
        r.c.updateUserBasicSettings({favoriteCharacterId: 'tsuyoshi'});
        const selection = element(); selection.value = 'akatsuki'; r.nodes.set('online-character', selection);
        r.c.resetUnsupportedOnlineCharacter(); assert.equal(selection.value, 'chizuru');
        assert.equal(r.c.getUserProfile().favoriteCharacterId, 'tsuyoshi');
    }
});
test('100c uses only existing standing/summer/face artwork plus the three copied completed assets', () => {
    const manifest = JSON.parse(read('assets/battle-images/manifest.json'));
    for (const folder of ['battle-mode-icons', 'skill-cutins', 'battle-mode-cutins']) {
        const entry = manifest.find(item => item.battle.startsWith(`assets/battle-images/${folder}/tsuyoshi-`));
        assert.ok(entry); assert.ok(fs.existsSync(path.join(root, entry.original)));
        const ownerName = folder === 'battle-mode-icons' ? 'tsuyoshi-chef-mode-icon-owner.png' : path.basename(entry.original);
        const source = path.resolve(root, '../battle-a-la-carte - ギットハブ版 -ユニティ改/新キャラ素材/剛_tsuyoshi/02_Unity用_完成', ownerName);
        if (fs.existsSync(source)) assert.deepEqual(fs.readFileSync(path.join(root, entry.original)), fs.readFileSync(source));
    }
    for (const file of ['style.css', 'mobile/style-sp.css']) assert.match(read(file), /char-tsuyoshi[\s\S]*#e3ac5d/);
    for (const id of ['akatsuki', 'tsuyoshi']) for (const costume of ['default', 'summer']) {
        const c = runtime().c; assert.ok(fs.existsSync(path.join(root, c.BattleImages.standingPath(id, costume).split('?')[0])));
    }
    assert.match(read('character-themes.js'), /tsuyoshi: 'theme-tsuyoshi'/);
});

for(const mobile of [false,true]) {
    const label=mobile?'phone':'PC';
    test(`102b ${label}: 結月 unlock, all six skills, default/kyudo wardrobe, gallery, reload/reset and viewer isolation`,()=>{
        const r=runtime(mobile),{c,nodes,storage}=r;r.load('story-data/episode-special-kyudo.js');
        for(const id of ['start-character-cards','user-favorite-character','start-costume-wrap','start-costume-select'])nodes.set(id,element());
        for(const progress of [{},{'special-halloween':true},{'special-kyudo':false},{'special-kyudo':'true'}]) {
            storage.set(PROGRESS,JSON.stringify(progress));assert.equal(c.isPlayableCharacterUnlocked('yuzuki'),false);assert.equal(c.getStartCharacterOptionById('yuzuki'),null);
            assert.equal(c.selectCharacterCostume('yuzuki','kyudo'),false);assert.ok(!c.getGalleryItemsByType('characters').some(x=>x.characterId==='yuzuki'));
            c.renderUserStageProfile();assert.match(nodes.get('user-favorite-character').innerHTML,/value="yuzuki" disabled>結月：特別編『恋の的はひとつ？』クリアで解放/);
        }
        storage.set(PROGRESS,JSON.stringify({'special-kyudo':true,unknown:'keep'}));const before=storage.get(PROGRESS);
        c.updateUserBasicSettings({favoriteCharacterId:'yuzuki'});assert.equal(c.getPreferredStartCharacterId(),'yuzuki');c.setCharacterChoice('yuzuki');
        for(const skill of c.getSkillDefinitions()){vm.runInContext(`selectedStartSkillKey='${skill.key}'`,c);c.applyCharacterChoice();c.applyBattleSkillSetup();assert.equal(c.GameState.characterIds.player,'yuzuki');assert.equal(c.GameState.players.player.selectedSkillKey,skill.key);}
        assert.deepEqual(clone(c.getCharacterCostumeOptions('yuzuki').map(x=>x.key)),['default','kyudo']);assert.equal(c.selectCharacterCostume('yuzuki','summer'),false);
        for(const id of ['yuzuki','takumi','mai']){assert.equal(c.selectCharacterCostume(id,'kyudo'),true);assert.equal(runtime(mobile,storage).c.getSelectedCharacterCostume(id),'kyudo');}
        c.renderStartCostumePicker();assert.match(nodes.get('start-costume-select').innerHTML,/弓道着/);c.renderStartCharacterCards('start-character-cards','yuzuki');assert.match(nodes.get('start-character-cards').innerHTML,/yuzuki-kyudo-standing.webp/);
        assert.equal(c.getGalleryItemsByType('characters').filter(x=>x.costume).length,3);assert.ok(c.getGalleryItemsByType('characters').some(x=>x.characterId==='yuzuki'&&!x.costume));
        c.resetUserProfile();assert.equal(c.isPlayableCharacterUnlocked('yuzuki'),true);assert.equal(c.getSelectedCharacterCostume('yuzuki'),'default');assert.equal(c.getCharacterCostumeOptions('yuzuki').length,2);assert.equal(storage.get(PROGRESS),before);
        c.console={warn(){}};c.localStorage.setItem=()=>{throw Error('quota')};assert.equal(c.selectCharacterCostume('yuzuki','kyudo'),true);assert.equal(c.getSelectedCharacterCostume('yuzuki'),'kyudo');
        const viewer=runtime(mobile,storage,true);assert.equal(viewer.c.isPlayableCharacterUnlocked('yuzuki'),false);assert.equal(viewer.c.selectCharacterCostume('yuzuki','kyudo'),false);assert.equal(viewer.writes.length,0);
    });
    test(`102b ${label}: kyudo HUD/skill/Mode/result uses measured costume frames; CPU default and story priority are retained`,()=>{
        const r=runtime(mobile),{c,nodes,storage}=r;r.load('story-data/episode-special-kyudo.js');r.load('story-data/icon-metrics.js');r.load(mobile?'mobile/render-sp.js':'render.js');
        storage.set(PROGRESS,JSON.stringify({'special-kyudo':true}));const p=element(),cpu=element();c.document.querySelector=s=>s==='.player-icon'?p:s==='.cpu-icon'?cpu:null;nodes.set('result-summary',element());
        for(const id of ['yuzuki','takumi','mai']) {
            c.selectCharacterCostume(id,'kyudo');c.GameState.characterIds={player:id,cpu:id};c.getBattleViewModel=()=>({me:{score:0,characterId:id,set:[]},opponent:{score:0,characterId:id,set:[]},winner:'me',online:false});
            for(const cell of c.BattleImages.expressionCells){const frame=element();c.BattleImages.applyExpression(frame,id,cell,'assets/','player');assert.match(frame.children[0].getAttribute('src'),new RegExp(id+'-kyudo-'+cell+'-alpha'));const expected={style:{}};c.BattleStoryIconMetrics.apply(expected,id,cell,'kyudo');for(const prop of ['width','left','top'])assert.equal(frame.children[0].style[prop],expected.style[prop]);}
            c.updateCharacterFaces();assert.match(p.children[0].getAttribute('src'),/-kyudo-/);assert.doesNotMatch(cpu.children[0].getAttribute('src'),/-kyudo-/);
            assert.match(c.getSkillCutinImagePathForSide('player'),/-kyudo-smile/);assert.match(c.getBattleModeCutinImagePathForSide('player'),/-kyudo-laugh/);
            c.renderMatchResultSummary();const files=n=>n.children.flatMap(child=>[child.getAttribute?.('src'),...files(child)]).filter(Boolean);assert.ok(files(nodes.get('result-summary')).some(f=>f.includes('-kyudo-gentle-')));
            c.GameState.storyEpisodeId='episode4';assert.doesNotMatch(c.BattleImages.expressionPath(id,'normal','assets/','player'),/-kyudo-/);
            c.selectCharacterCostume(id,'default');c.GameState.storyEpisodeId='special-kyudo';for(const side of ['player','cpu'])assert.match(c.BattleImages.expressionPath(id,'normal','assets/',side),/-kyudo-/);c.GameState.storyEpisodeId=null;
        }
    });
    test(`102b ${label}: saved favourite 結月 resets only online preparation to 千鶴`,()=>{
        const {c,storage,nodes}=runtime(mobile);storage.set(PROGRESS,JSON.stringify({'special-kyudo':true}));c.updateUserBasicSettings({favoriteCharacterId:'yuzuki'});
        const node=element();node.value='yuzuki';nodes.set('online-character',node);c.resetUnsupportedOnlineCharacter();assert.equal(node.value,'chizuru');assert.equal(c.getUserProfile().favoriteCharacterId,'yuzuki');
    });
}
test('102b online 結月 disabled without new protocol fields; every standing/chef/cutin asset is registered',()=>{
    const source=read('network.js');assert.match(source,/<option value="yuzuki" disabled>結月：オンライン対戦は今後対応予定<\/option>/);
    const c=vm.createContext({$:()=>null,window:{getUserProfile:()=>({favoriteCharacterId:'yuzuki',favoriteSkillKey:'foodTrap'}),getSkillDefinitionByKey:()=>({})}});
    vm.runInContext(source.slice(source.indexOf('    function profileInfo('),source.indexOf('    async function enter(')),c);assert.equal(c.profileInfo().character,'chizuru');assert.equal(c.profileInfo({character:'yuzuki'}).character,'chizuru');assert.deepEqual(Object.keys(c.profileInfo()).sort(),['character','name','skill']);
    const r=runtime().c,manifest=JSON.parse(read('assets/battle-images/manifest.json'));
    for(const id of ['yuzuki','takumi','mai'])for(const costume of ['default','kyudo'])assert.ok(fs.existsSync(path.join(root,r.BattleImages.standingPath(id,costume).split('?')[0])));
    for(const folder of ['battle-mode-icons','skill-cutins','battle-mode-cutins'])assert.ok(manifest.some(x=>x.battle.startsWith('assets/battle-images/'+folder+'/yuzuki-')));
});

for(const mobile of [false,true])test(`105a ${mobile?'phone':'PC'}: 龍太 locked until back CLEAR, six skills, default wardrobe, orange standing, gallery and reload/reset`,()=>{
    const r=runtime(mobile),{c,storage,nodes}=r;for(const id of ['start-character-cards','user-favorite-character','start-costume-wrap','start-costume-select'])nodes.set(id,element());
    for(const progress of [{},{'special-osananajimi-1':true},{'special-kyudo':true},{'special-osananajimi-2':'true'},{'special-osananajimi-2':false}]){
        storage.set(PROGRESS,JSON.stringify(progress));assert.equal(c.isPlayableCharacterUnlocked('ryuta'),false);assert.equal(c.getStartCharacterOptionById('ryuta'),null);assert.equal(c.selectCharacterCostume('ryuta','default'),false);c.renderStartCharacterCards('start-character-cards','chizuru');assert.doesNotMatch(nodes.get('start-character-cards').innerHTML,/data-character-id="ryuta"/);c.renderUserStageProfile();assert.match(nodes.get('user-favorite-character').innerHTML,/value="ryuta" disabled>龍太：幼馴染編 後編『負けられない男』クリアで解放/);
    }
    storage.set(PROGRESS,JSON.stringify({'special-osananajimi-2':true,keep:'owner'}));const before=storage.get(PROGRESS);c.updateUserBasicSettings({favoriteCharacterId:'ryuta'});assert.equal(c.getPreferredStartCharacterId(),'ryuta');c.setCharacterChoice('ryuta');
    for(const skill of c.getSkillDefinitions()){vm.runInContext(`selectedStartSkillKey='${skill.key}'`,c);c.applyCharacterChoice();c.applyBattleSkillSetup();assert.equal(c.GameState.characterIds.player,'ryuta');assert.equal(c.GameState.players.player.selectedSkillKey,skill.key);}
    assert.deepEqual(clone(c.getCharacterCostumeOptions('ryuta').map(x=>x.key)),['default']);assert.equal(c.selectCharacterCostume('ryuta','default'),true);assert.equal(c.selectCharacterCostume('ryuta','kyudo'),false);c.renderStartCharacterCards('start-character-cards','ryuta');assert.match(nodes.get('start-character-cards').innerHTML,/ryuta-standing.webp\?v=20261007-osananajimi105a/);assert.doesNotMatch(nodes.get('start-character-cards').innerHTML,/ryuta-standing-alpha/);c.renderStartCostumePicker();assert.equal(nodes.get('start-costume-wrap').classList.contains('hidden'),true);assert.equal(c.getGalleryItemsByType('characters').filter(x=>x.characterId==='ryuta').length,1);
    assert.equal(runtime(mobile,storage).c.getUserProfile().favoriteCharacterId,'ryuta');c.resetUserProfile();assert.equal(c.isPlayableCharacterUnlocked('ryuta'),true);assert.equal(c.getSelectedCharacterCostume('ryuta'),'default');assert.equal(storage.get(PROGRESS),before);
    const viewer=runtime(mobile,storage,true);assert.equal(viewer.c.isPlayableCharacterUnlocked('ryuta'),false);assert.equal(viewer.c.selectCharacterCostume('ryuta','default'),false);assert.equal(viewer.writes.length,0);
});
for(const mobile of [false,true])test(`105a ${mobile?'phone':'PC'}: 龍太 six aligned frames, own HUD/skill/Mode/result and online favourite fallback`,()=>{
    const r=runtime(mobile),{c,nodes,storage}=r;storage.set(PROGRESS,JSON.stringify({'special-osananajimi-2':true}));r.load('story-data/icon-metrics.js');r.load(mobile?'mobile/render-sp.js':'render.js');const p=element(),cpu=element();c.document.querySelector=s=>s==='.player-icon'?p:s==='.cpu-icon'?cpu:null;nodes.set('result-summary',element());c.GameState.characterIds={player:'ryuta',cpu:'akatsuki'};c.getBattleViewModel=()=>({me:{score:0,characterId:'ryuta',set:[]},opponent:{score:0,characterId:'akatsuki',set:[]},winner:'me',online:false});
    for(const cell of c.BattleImages.expressionCells){const frame=element();c.BattleImages.applyExpression(frame,'ryuta',cell,'assets/','player');assert.match(frame.children[0].getAttribute('src'),new RegExp('ryuta-'+cell+'-alpha'));const expected={style:{}};c.BattleStoryIconMetrics.apply(expected,'ryuta',cell);for(const prop of ['width','left','top'])assert.equal(frame.children[0].style[prop],expected.style[prop]);}
    c.updateCharacterFaces();assert.match(p.children[0].getAttribute('src'),/ryuta-normal-alpha/);assert.match(c.getSkillCutinImagePathForSide('player'),/ryuta-smile-alpha/);assert.match(c.getBattleModeCutinImagePathForSide('player'),/ryuta-laugh-alpha/);c.renderMatchResultSummary();const files=n=>n.children.flatMap(child=>[child.getAttribute?.('src'),...files(child)]).filter(Boolean);assert.ok(files(nodes.get('result-summary')).some(f=>f.includes('ryuta-gentle-alpha')));
    c.updateUserBasicSettings({favoriteCharacterId:'ryuta'});const selection=element();selection.value='ryuta';nodes.set('online-character',selection);c.resetUnsupportedOnlineCharacter();assert.equal(selection.value,'chizuru');assert.equal(c.getUserProfile().favoriteCharacterId,'ryuta');
});
test('105a 龍太 online disabled without new profile fields; standing/chef/battle/cutins reuse 103a assets',()=>{
    const source=read('network.js');assert.match(source,/<option value="ryuta" disabled>龍太：オンライン対戦は今後対応予定<\/option>/);const c=vm.createContext({$:()=>null,window:{getUserProfile:()=>({favoriteCharacterId:'ryuta',favoriteSkillKey:'foodTrap'}),getSkillDefinitionByKey:()=>({})}});vm.runInNewContext(source.slice(source.indexOf('    function profileInfo('),source.indexOf('    async function enter(')),c);assert.equal(c.profileInfo().character,'chizuru');assert.equal(c.profileInfo({character:'ryuta'}).character,'chizuru');assert.deepEqual(Object.keys(c.profileInfo()).sort(),['character','name','skill']);
    for(const suffix of ['battle-mode-icons/ryuta-chef-mode-icon','battle-mode-icons/ryuta-battle-mode-icon','skill-cutins/ryuta-skill-cutin','battle-mode-cutins/ryuta-battle-mode-cutin','characters/standing/ryuta-standing','characters/standing/ryuta-standing-alpha'])for(const [folder,ext]of [['images','png'],['battle-images','webp']])assert.ok(fs.existsSync(path.join(root,'assets/'+folder+'/'+suffix+'.'+ext)));
});

