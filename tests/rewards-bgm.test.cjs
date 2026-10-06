const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const TRACK_KEY = 'battle-a-la-carte:bgm-track:v1';
const tracks = { chizuru: 'theme-chizuru', mai: 'theme-mai', akatsuki: 'theme-akatsuki', takumi: 'theme-takumi', kanna: 'theme-kanna', tsuyoshi: 'theme-tsuyoshi', yuzuki: 'bgm-miracle', ryuta: 'bgm-sky-high-refrain' };
for(const mobile of [false,true]) test(`101b ${mobile?'phone':'PC'}: seasonal ADV respects saved battle BGM, volume/mute, normal battle/Mode/result and fallback`,()=>{
    const r=runtime(mobile),{c}=r;c.setBgmTrack('skyHigh',{save:true});c.setBgmVolume(.25);
    c.playStoryBGM('kanna','seasonal-halloween');assert.equal(r.active(),'story:seasonal-halloween');
    const player=r.player('story:seasonal-halloween');assert.equal(player.__audioPackName,'seasonal-halloween');assert.equal(player.volume,.4*.25);
    assert.equal(c.getCurrentBgmTrack(),'skyHigh');assert.equal(r.storage.get(TRACK_KEY),'skyHigh');
    c.unlockAudio();c.setBgmEnabled(false);const plays=player.plays;c.playStoryBGM('kanna','seasonal-halloween');assert.equal(player.plays,plays);assert.ok(r.audios.every(a=>a.paused));
    c.setBgmEnabled(true);assert.equal(r.active(),'story:seasonal-halloween');c.setBgmVolume(0);assert.equal(player.volume,0);c.setBgmVolume(.6);assert.equal(player.volume,.4*.6);
    c.playBGM();assert.equal(r.active(),'battle:skyHigh');c.setBgmTrack('characterTheme');c.GameState.characterIds.player='kanna';c.playBGM();assert.equal(r.active(),'battle:theme-kanna');
    c.playBattleModeBGM();assert.equal(r.active(),'battleMode');c.playResultBGM();assert.equal(r.active(),'result');c.playStoryBGM('kanna','seasonal-halloween');assert.equal(r.active(),'story:seasonal-halloween');
    c.playStoryBGM('kanna','future-unknown');assert.equal(r.active(),'theme:theme-kanna');c.playStoryBGM('kanna',false);assert.equal(r.active(),'theme:theme-kanna');
});

function runtime(mobile = false, storage = new Map()) {
    const elements = new Map(), audios = [], timers = new Map();
    class Element {
        constructor() {
            this.dataset = {}; this.innerHTML = ''; this.handlers = {}; this.classes = new Set();
            this.style = { setProperty() {} };
            this.classList = { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name), add() {}, remove() {}, contains: name => this.classes.has(name) };
        }
        addEventListener(name, fn) { this.handlers[name] = fn; }
        setAttribute() {}
    }
    class Audio {
        constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; this.volume = 1; this.plays = 0; audios.push(this); }
        play() { this.paused = false; this.plays++; return Promise.resolve(); }
        pause() { this.paused = true; }
        cloneNode() { return new Audio(this.src); }
    }
    const c = vm.createContext({ Audio, console, Date, Math, crypto: require('node:crypto').webcrypto,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        document: { readyState: 'loading', getElementById: id => elements.get(id) || null, querySelectorAll: () => [],
            querySelector: () => null, addEventListener() {}, documentElement: { style: { setProperty() {} } } },
        location: { pathname: mobile ? '/mobile/mobile.html' : '/web.html' }, addEventListener() {},
        setTimeout: (fn, ms) => { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; },
        clearTimeout: id => timers.delete(id), updateUI() {}, addLog() {}, setCPUStatus() {} });
    c.window = c; c.FriendBattle = { isActive: () => false };
    c.AudioPack = require('./helpers/audio-pack-stub.cjs')(Audio);
    const load = file => vm.runInContext(read(file), c, { filename: file });
    load('character-themes.js'); load(mobile ? 'mobile/cards-sp.js' : 'cards.js'); load(mobile ? 'mobile/state-sp.js' : 'state.js');
    load('profile.js'); load(mobile ? 'mobile/audio-sp.js' : 'audio.js'); load(mobile ? 'mobile/main-sp.js' : 'main.js');
    c.setupAudio();
    return { c, elements, audios, timers, storage, Element, load,
        active: () => vm.runInContext('AudioManager.activeBgmKey', c),
        player: key => vm.runInContext(`AudioManager.bgmPlayers[${JSON.stringify(key)}]`, c) };
}

for (const mobile of [false, true]) {
    const label = mobile ? 'phone' : 'PC';
    test(`${label}: single six-character mapping, theme default, own battle character, legacy explicit choices`, () => {
        const r = runtime(mobile), { c } = r;
        assert.deepEqual(plain(c.CharacterThemes.tracks), tracks);
        assert.equal(c.getCurrentBgmTrack(), 'characterTheme');
        assert.equal(c.GameState.settings.bgmTrack, 'characterTheme');
        assert.deepEqual(plain(c.getBgmTrackOptions()).map(o => o.key), ['characterTheme', 'default', 'miracle', 'skyHigh', 'code241']);
        assert.equal(c.getBgmTrackOptions()[0].label, 'キャラのテーマ曲');
        for (const [id, track] of Object.entries(tracks)) {
            c.GameState.characterIds = { player: id, cpu: id === 'mai' ? 'takumi' : 'mai' };
            c.playBGM(); assert.equal(r.active(), 'battle:' + track);
        }
        c.GameState.characterIds.player = 'alien'; c.playBGM(); assert.equal(r.active(), 'battle:default');
        for (const selected of ['default', 'miracle', 'skyHigh', 'code241', 'variantA']) {
            const saved = new Map([['battle-a-la-carte:match-autosave:v1', JSON.stringify({ snapshot: { settings: { bgmTrack: selected } } })]]);
            const old = runtime(mobile, saved);
            assert.equal(old.c.GameState.settings.bgmTrack, selected === 'variantA' ? 'miracle' : selected);
            assert.equal(old.c.getCurrentBgmTrack(), selected === 'variantA' ? 'miracle' : selected);
            saved.delete('battle-a-la-carte:match-autosave:v1');
            assert.equal(runtime(mobile, saved).c.getCurrentBgmTrack(), selected === 'variantA' ? 'miracle' : selected);
        }
    });
    test(`${label}: saved BGM changes survive reload, runtime defaults do not save, saved choices override old autosave`, () => {
        const r = runtime(mobile);
        r.c.setBgmTrack('miracle'); assert.equal(r.storage.has(TRACK_KEY), false);
        r.c.setBgmTrack('skyHigh', { save: true }); assert.equal(r.storage.get(TRACK_KEY), 'skyHigh');
        r.storage.set('battle-a-la-carte:match-autosave:v1', JSON.stringify({ snapshot: { settings: { bgmTrack: 'default' } } }));
        const next = runtime(mobile, r.storage);
        assert.equal(next.c.getCurrentBgmTrack(), 'skyHigh');
        next.c.setBgmTrack('characterTheme', { save: true });
        assert.equal(runtime(mobile, r.storage).c.getCurrentBgmTrack(), 'characterTheme');
        next.c.localStorage.getItem = () => { throw Error('blocked'); };
        next.c.localStorage.setItem = () => { throw Error('blocked'); };
        next.c.setBgmTrack('code241', { save: true });
        assert.equal(next.c.CharacterThemes.savedChoice(), 'code241');
    });
    test(`${label}: protagonist scenes and gallery previews ignore battle selection while respecting volume and mute`, async () => {
        const r = runtime(mobile), { c } = r;
        c.setBgmTrack('skyHigh', { save: true }); c.setBgmVolume(.25);
        for (const [id, track] of Object.entries(tracks)) {
            c.playStoryBGM(id); assert.equal(r.active(), 'theme:' + track);
            assert.equal(r.player('theme:' + track).volume, .4 * .25);
            c.previewCharacterTheme(id); await Promise.resolve();
            assert.equal(r.player('theme:' + track).paused, false);
            assert.equal(c.getCurrentBgmTrack(), 'skyHigh');
        }
        c.setBgmEnabled(false);
        const before = r.audios.reduce((n, a) => n + a.plays, 0);
        c.playStoryBGM('takumi'); c.previewCharacterTheme('mai');
        assert.equal(r.audios.reduce((n, a) => n + a.plays, 0), before);
        assert.ok(r.audios.every(a => a.paused));
        c.setBgmEnabled(true); assert.equal(r.active(), 'theme:theme-mai');
        c.setBgmVolume(0); c.previewCharacterTheme('takumi'); assert.equal(r.player('theme:theme-takumi').volume, 0);
        c.setBgmVolume(.6); assert.equal(r.player('theme:theme-takumi').volume, .4 * .6);
    });
    test(`${label}: first battle/preview keeps mute and audio unlock warmup never pauses active playback`, async () => {
        const r = runtime(mobile), { c } = r;
        c.setBgmEnabled(false); c.GameState.settings.bgmEnabled = false;
        c.unlockAudio(); c.startBgmOnce(); c.previewCharacterTheme('mai');
        assert.equal(c.getBgmEnabled(), false); assert.equal(c.GameState.settings.bgmEnabled, false);
        assert.ok(r.audios.every(a => a.plays === 0 || !a.loop));
        const fresh = runtime(mobile);
        fresh.c.previewCharacterTheme('takumi'); await Promise.resolve(); await Promise.resolve();
        assert.equal(fresh.player('theme:theme-takumi').paused, false);
        const freshBattle = runtime(mobile);
        freshBattle.c.unlockAudio(); freshBattle.c.playBGM(); await Promise.resolve();
        assert.equal(freshBattle.player(freshBattle.active()).paused, false);
    });
    test(`${label}: title, Mode, result tracks remain unchanged; theme follows projected own character after online startup`, () => {
        const r = runtime(mobile), { c } = r;
        c.playTitleBGM(); assert.equal(r.active(), 'title'); assert.equal(r.player('title').__audioPackName, 'title-screen');
        c.playStoryBGM('mai'); assert.equal(r.active(), 'theme:theme-mai');
        c.GameState.characterIds = { player: 'takumi', cpu: 'chizuru' };
        c.playBGM(); assert.equal(r.active(), 'battle:theme-takumi'); assert.equal(r.player('battle:theme-takumi').volume, .5 * .8);
        c.GameState.characterIds.player = 'akatsuki'; c.refreshCharacterBattleBGM(); assert.equal(r.active(), 'battle:theme-akatsuki');
        c.playBattleModeBGM(); c.GameState.characterIds.player = 'mai'; c.playBGM();
        assert.equal(r.active(), 'battleMode'); assert.equal(r.player('battleMode').__audioPackName, 'battle-mode');
        c.refreshCharacterBattleBGM(); assert.equal(r.active(), 'battleMode');
        c.playResultBGM(); c.refreshCharacterBattleBGM(); assert.equal(r.active(), 'result'); assert.equal(r.player('result').__audioPackName, 'match-result');
        c.playTitleBGM(); assert.equal(r.active(), 'title');
    });
    test(`${label}: each existing gallery character card has a working preview without changing character selection`, () => {
        const r = runtime(mobile), { c, elements, Element } = r;
        const list = new Element(); elements.set('start-gallery-list', list);
        c.renderStartGallery('characters');
        assert.equal((list.innerHTML.match(/data-theme-character=/g) || []).length, 4);
        const selectedBefore = vm.runInContext('selectedStartCharacter', c);
        for (const id of ['chizuru', 'mai', 'takumi', 'akatsuki']) {
            assert.ok(list.innerHTML.includes(`data-theme-character="${id}"`));
            list.onclick({ target: { closest: () => ({ dataset: { themeCharacter: id } }) } });
            assert.equal(r.active(), 'theme:' + tracks[id]);
        }
        assert.equal(vm.runInContext('selectedStartCharacter', c), selectedBefore);
        c.showStartStage('start-menu-stage'); assert.equal(r.active(), 'title');
        c.renderStartGallery('events'); assert.ok(!list.innerHTML.includes('data-theme-character'));
    });
    test(`${label}: actual settings picker saves the virtual BGM option, preserves legacy autosave and applies board separately`, () => {
        const r = runtime(mobile), { c, elements, Element, load } = r;
        load(mobile ? 'mobile/render-sp.js' : 'render.js'); c.updateUI = () => {};
        const select = new Element(); select.value = 'characterTheme'; elements.set('settings-bgm-track', select);
        c.bindSettingsOverlayControls(); select.value = 'code241'; select.handlers.change();
        assert.equal(r.storage.get(TRACK_KEY), 'code241');
        select.value = 'characterTheme'; select.handlers.change();
        assert.equal(r.storage.get(TRACK_KEY), 'characterTheme');
        c.GameState.characterIds.player = 'takumi'; c.applyRuntimeSettings(); c.playBGM(); assert.equal(r.active(), 'battle:theme-takumi');
    });
}

test('both HTML pages load one shared mapping before state/audio; all reward assets exist; picker and readable own-field styles are scoped', () => {
    for (const [html, prefix, suffix, ownField] of [['web.html', '', '', 'pc-player-field'], ['mobile/mobile.html', '../', '-sp', 'mobile-player-field']]) {
        const s = read(html);
        const order = [prefix + 'character-themes.js', 'state' + suffix + '.js', 'audio' + suffix + '.js'].map(file => s.indexOf(file + '?v='));
        assert.ok(order[0] >= 0 && order[1] > order[0] && order[2] > order[1]);
        assert.equal((s.match(/id="board-picker"/g) || []).length, 1);
        assert.match(s, /profile-cosmetic-pickers[\s\S]*sleeve-picker[\s\S]*board-picker/);
        assert.ok(s.includes(`id="${ownField}"`));
        const render = read(suffix ? 'mobile/render-sp.js' : 'render.js');
        assert.ok(render.includes('id="settings-board-picker"')); assert.match(render, /Missions\?\.applyBoard/);
    }
    for (const id of ['chizuru', 'mai', 'takumi', 'akatsuki']) {
        assert.ok(fs.existsSync(path.join(root, `assets/battle-images/sleeves/sleeve-char-${id}.webp`)));
        assert.ok(fs.existsSync(path.join(root, `assets/battle-images/boards/board-char-${id}.webp`)));
    }
    assert.ok(fs.existsSync(path.join(root, 'assets/battle-images/sleeves/sleeve-festival-six.webp')));
    assert.ok(fs.existsSync(path.join(root, 'assets/battle-images/boards/board-festival-classroom.webp')));
    assert.match(read('achievements.css'), /\.player-side\.has-board-background[\s\S]*linear-gradient\(#101820cc, #101820cc\)/);
    assert.match(read('achievements.css'), /\.pc-field-ui[\s\S]*background-color: #fffcf3ed/);
    assert.match(read('achievements.css'), /\.mobile-field-ui[\s\S]*background-color: #04122ee8/);
    assert.doesNotMatch(read('battle-protocol.js'), /selectedBoard|board-char|selectedSleeve/);
    assert.equal(read('audio.js').replaceAll('../assets/', 'assets/'), read('mobile/audio-sp.js').replaceAll('../assets/', 'assets/'));
});

for(const mobile of [false,true])test(`102b ${mobile?'phone':'PC'}: provisional 結月 theme uses existing bgm-miracle pack in ADV, battle and gallery; saved battle choice stays intact`,()=>{
    const r=runtime(mobile),{c}=r;
    assert.equal(c.CharacterThemes.trackFor('yuzuki'),'bgm-miracle');assert.match(read('character-themes.js'),/仮：結月のイメージ曲は後で差し替え/);
    c.setBgmTrack('skyHigh',{save:true});c.playStoryBGM('yuzuki');assert.equal(r.active(),'theme:bgm-miracle');assert.equal(r.player(r.active()).__audioPackName,'bgm-miracle');assert.equal(c.getCurrentBgmTrack(),'skyHigh');
    c.previewCharacterTheme('yuzuki');assert.equal(r.active(),'theme:bgm-miracle');
    c.GameState.characterIds.player='yuzuki';c.setBgmTrack('characterTheme',{save:true});c.playBGM();assert.equal(r.active(),'battle:bgm-miracle');assert.equal(r.player(r.active()).__audioPackName,'bgm-miracle');
    c.playBattleModeBGM();assert.equal(r.active(),'battleMode');c.playResultBGM();assert.equal(r.active(),'result');
});
