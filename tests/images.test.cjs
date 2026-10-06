const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
test('costume identifiers are generic; transparent icon/standing budgets and normal 40KiB/256px stay strict', () => {
    const actual = JSON.parse(fs.readFileSync(path.join(root,'assets/battle-images/manifest.json')));
    function check(battle, bytes, width, height, standing = false) {
        const original = actual.find(x => x.battle.endsWith(standing ? 'kanna-halloween-standing-alpha.webp' : 'kanna-halloween-normal-alpha.webp'));
        const entry = {...original, battle, bytes, width, height}, checks = new Map(), portable = Object.create(fs);
        portable.readFileSync = (file,...args) => file===path.join(root,'assets/battle-images/manifest.json') ? JSON.stringify([entry])
            : file===path.join(root,battle) ? fs.readFileSync(path.join(root,original.battle),...args) : fs.readFileSync(file,...args);
        portable.statSync = file => file===path.join(root,battle) ? {size:bytes} : fs.statSync(file);
        portable.readdirSync = (dir,...args) => dir===path.dirname(path.join(root,entry.original))
            ? fs.readdirSync(dir,...args).filter(x=>x.name===path.basename(entry.original)) : fs.readdirSync(dir,...args);
        vm.runInNewContext(fs.readFileSync(__filename,'utf8'),{__dirname,require(name){if(name==='node:test')return(name,fn)=>checks.set(name,fn);if(name==='node:fs')return portable;return require(name);}});
        checks.get('battle WebP assets are small and all original PNGs are retained')();
    }
    for (const costume of ['summer','halloween','winter-party-2']) {
        const icon=`assets/battle-images/story/icons/kanna-${costume}-normal-alpha.webp`;
        assert.doesNotThrow(()=>check(icon,256*1024,512,512));
        assert.throws(()=>check(icon,256*1024+1,512,512),/exceeds/);
        assert.throws(()=>check(icon,1000,256,256),/512/);
        const standing=`assets/battle-images/characters/standing/kanna-${costume}-standing-alpha.webp`;
        assert.doesNotThrow(()=>check(standing,768*1024,1024,1536,true));
        assert.throws(()=>check(standing,768*1024+1,1024,1536,true),/exceeds/);
    }
    for (const icon of ['kanna-normal.webp','kanna-halloween-normal.webp']) {
        const file='assets/battle-images/story/icons/'+icon;
        assert.doesNotThrow(()=>check(file,40*1024,256,256));
        assert.throws(()=>check(file,40*1024+1,256,256),/exceeds/);
        assert.throws(()=>check(file,1000,512,512),/256/);
    }
});
test('battle WebP assets are small and all original PNGs are retained', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/battle-images/manifest.json')));
    assert.ok(manifest.length > 0);
    assert.equal(new Set(manifest.map(x => x.battle)).size, manifest.length, 'No duplicate WebP entries');
    assert.equal(new Set(manifest.map(x => x.original)).size, manifest.length, 'Each entry retains its own original');
    const byOriginal = new Map(manifest.map(x => [x.original, x]));
    // These legacy sheets are intentionally not converted by build-battle-images.cjs.
    const legacy = ['character-icons-sheet.png', 'player-icons.png', 'cpu-icons.png',
        'characters/akatsuki-alpha.png', 'characters/takumi-alpha.png',
        'creator/chara-sheet-1.png', 'creator/chara-sheet-2.png', 'creator/chara-sheet-3.png'];
    for (const file of legacy) {
        assert.ok(fs.statSync(path.join(root, 'assets/images', file)).size > 0, `Retain legacy PNG: ${file}`);
    }
    // Only scan the battle folders represented by this manifest. Publish-only
    // homepage artwork and other unrelated folders are outside its scope.
    const coveredFolders = new Set(manifest.map(x => path.posix.dirname(x.original)).filter(dir => dir !== 'assets/images'));
    function checkOriginals(dir) {
        for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
            const file = `${dir}/${entry.name}`;
            if (entry.isFile() && entry.name.endsWith('.png') && !legacy.includes(file.slice('assets/images/'.length))) {
                assert.ok(byOriginal.has(file), `Missing PNG from manifest: ${file}`);
            }
        }
    }
    coveredFolders.forEach(checkOriginals);
    for (const x of manifest) {
        assert.equal(fs.statSync(path.join(root, x.original)).size, x.originalBytes);
        assert.equal(fs.statSync(path.join(root, x.battle)).size, x.bytes);
        const webp = fs.readFileSync(path.join(root, x.battle));
        assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
        assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
        const png = fs.readFileSync(path.join(root, x.original));
        // The existing onigiri original has always been JPEG data with a .png filename.
        if (x.original === 'assets/images/recipes/onigiri.png') assert.deepEqual([...png.subarray(0, 3)], [255,216,255]);
        else assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10], x.original);
        assert.ok(x.width > 0 && x.height > 0 && x.bytes > 0);
        const alphaIcon = /\/story\/icons\/[a-z]+-(?:[a-z0-9]+-)*[a-z]+-alpha\.webp$/.test(x.battle);
        const alphaStanding = /\/characters\/standing\/[a-z]+-(?:[a-z0-9]+-)*standing-alpha\.webp$/.test(x.battle);
        const budget = alphaIcon ? 256 * 1024 : alphaStanding ? 768 * 1024 : x.battle.includes('/story/icons/') ? 40 * 1024 : x.battle.includes('/story/backgrounds/') ? 450 * 1024
            : x.battle.includes('/story/portraits/') ? 250 * 1024
            : /\/(?:battle-mode-cutins|skill-cutins)\//.test(x.battle) ? 350 * 1024 : 150 * 1024;
        assert.ok(x.bytes <= budget, `${x.battle}: ${x.bytes} bytes exceeds ${budget}`);
        if (x.battle.includes('/story/backgrounds/')) { assert.equal(x.width, 1920); assert.equal(x.height, 1080); }
        if (x.battle.includes('/story/portraits/')) { assert.equal(x.width, 768); assert.equal(x.height, 1152); }
        if (x.battle.includes('/story/icons/')) { assert.equal(x.width, alphaIcon ? 512 : 256); assert.equal(x.height, alphaIcon ? 512 : 256); }
        if (alphaStanding) { assert.equal(x.width, 1024); assert.equal(x.height, 1536); }
        if (/\/(cards|events|recipes|packs)\//.test(x.battle) || x.battle.endsWith('card-back.webp')) {
            assert.equal(x.width, 256); assert.equal(x.height, 384); assert.ok(x.bytes < 102400);
        }
    }
    for (const file of ['main.js','mobile/main-sp.js']) assert.match(fs.readFileSync(path.join(root,file),'utf8'), /BattleImages.originalPath/);
    for (const file of ['render.js','mobile/render-sp.js']) {
        const code=fs.readFileSync(path.join(root,file),'utf8');
        assert.doesNotMatch(code,/GameState\.players|GameState\?\.players/);
        assert.doesNotMatch(code,/const ingredientPaths = Object.keys/);
        assert.match(code,/await img.decode\(\)/);
    }
});

test('Battle a la carte Mode BGM pack exists for both game pages', () => {
    const audioPath = path.join(root, 'assets/audio-pack/battle-mode.balc');
    assert.ok(fs.existsSync(audioPath), 'assets/audio-pack/battle-mode.balc is required');
    assert.ok(fs.statSync(audioPath).size > 1024 * 1024, 'Mode BGM must not be an empty placeholder');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio-pack/manifest.json'), 'utf8'));
    for (const file of ['audio.js', 'mobile/audio-sp.js']) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(code, /battleMode: 'battle-mode'/);
        assert.ok(fs.existsSync(path.join(root, 'assets/audio-pack', manifest.tracks['battle-mode'].file)));
        assert.doesNotMatch(code, /\.mp3/);
    }
});

test('publish-only images are ignored while unlisted PNGs in battle folders still fail', () => {
    function check(extraBattlePng) {
        const visited = [], checks = new Map();
        const portableFs = Object.create(fs);
        const extra = (name, directory = false) => ({ name, isDirectory: () => directory, isFile: () => !directory });
        portableFs.readdirSync = (dir, options) => {
            visited.push(path.relative(root, dir).replaceAll('\\', '/'));
            if (dir === path.join(root, 'assets/images/home')) return [extra('menu-ornament.png')];
            const files = fs.readdirSync(dir, options);
            if (dir === path.join(root, 'assets/images')) files.push(extra('home', true), extra('unused-homepage.png'));
            if (extraBattlePng && dir === path.join(root, 'assets/images/cards')) files.push(extra('unlisted-game.png'));
            return files;
        };
        vm.runInNewContext(fs.readFileSync(__filename, 'utf8'), { __dirname, require(name) {
            if (name === 'node:test') return (name, callback) => checks.set(name, callback);
            if (name === 'node:fs') return portableFs;
            return require(name);
        } });
        checks.get('battle WebP assets are small and all original PNGs are retained')();
        assert.ok(!visited.includes('assets/images'));
        assert.ok(!visited.includes('assets/images/home'));
        assert.ok(visited.includes('assets/images/story/portraits'));
    }
    assert.doesNotThrow(() => check(false));
    assert.throws(() => check(true), /Missing PNG from manifest: assets\/images\/cards\/unlisted-game\.png/);
});
