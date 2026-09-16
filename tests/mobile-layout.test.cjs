// Populated rendering fixture only: never connects to Supabase or changes match rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
test('populated online mobile zones do not overlap at phone viewport sizes', {timeout:60000}, async () => {
    const {chromium} = require(process.env.BALC_PLAYWRIGHT_PATH || 'playwright');
    const root = path.resolve(__dirname, '..');
    const server = http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/network.js') {
            res.setHeader('Content-Type','text/javascript');
            return res.end("window.FriendBattle={isActive:()=>false,refreshLogin:()=>Promise.resolve(),leaveRoom:()=>Promise.resolve(),createRoom:()=>Promise.resolve(),joinRoom:()=>Promise.resolve(),dispatch:()=>{}};");
        }
        const file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (error, data) => {
            if (error) { res.writeHead(404); return res.end(); }
            res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
            res.end(data);
        });
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    let browser;
    try {
        browser = await chromium.launch({headless:true,channel:'msedge'});
        const errors = [];
        for (const [width,height] of [[390,670],[375,667],[320,568],[390,844]]) {
            const page = await browser.newPage({viewport:{width,height}});
            page.on('dialog', dialog => dialog.accept());
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`http://127.0.0.1:${server.address().port}/mobile/mobile.html`, {waitUntil:'domcontentloaded',timeout:15000});
            await page.waitForFunction(() => typeof initGame === 'function' && typeof updateUI === 'function');
            await page.evaluate(() => {
                FriendBattle.isActive = () => true;
                window.__onGameStateUpdated = () => {};
                initGame(); document.body.classList.add('online-session');
                document.getElementById('start-overlay').classList.add('hidden');
                const ingredients = buildDeck().filter(c => c.type === 'ingredient');
                const events = buildDeck().filter(c => c.type === 'event');
                GameState.players.player.hand = ingredients.slice(0,3);
                GameState.players.player.events = events.slice(0,2);
                GameState.players.player.set = ingredients.slice(3,6);
                GameState.players.cpu.hand = Array.from({length:6},(_,index)=>({id:`back-${index+1}`,hidden:true}));
                GameState.players.cpu.events = [];
                GameState.players.cpu.set = ingredients.slice(6,9);
                for (const player of Object.values(GameState.players)) {
                    player.packs = packDefinitions.filter(p => ['board','ecoBag','freezer'].includes(p.key));
                    player.cookedRecipes = [{name:'創作料理',points:3,required:['ごはん']}];
                }
                GameState.candidateRecipes = [];
                updateUI(true);
            });
            const checkZones = async () => {
                const boxes = await page.evaluate(() => {
                    const selectors = ['.cpu-top-row','.cpu-hand-zone','.cpu-set-zone','.cpu-pack-zone',
                        '.deck-discard-cluster','.field-center-actions','.center-dish-panels',
                        '.player-pack-zone','.player-set-zone','.player-hand-zone','.player-bottom-row'];
                    return selectors.map(selector => {const r=document.querySelector(selector).getBoundingClientRect();return {selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
                });
                for (const [i,a] of boxes.entries()) for (const b of boxes.slice(i+1)) {
                    const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
                    const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
                    assert.ok(overlapX<=1 || overlapY<=1, `${width}x${height}: ${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`);
                }
                assert.ok(boxes.every(b => b.left>=-1 && b.right<=width+1));
                assert.ok(boxes.every(b => b.top>=-1 && b.bottom<=height+1), 'all battle zones must fit the fixed screen');
                const verticalOverflow = await page.evaluate(() => [
                    '.cpu-top-row','.cpu-hand-zone','.cpu-set-zone','.cpu-pack-zone',
                    '.deck-discard-cluster','.field-center-actions','.center-dish-panels',
                    '.player-pack-zone','.player-set-zone','.player-hand-zone','.player-bottom-row'
                ].flatMap(selector => {
                    const element = document.querySelector(selector);
                    return element.scrollHeight > element.clientHeight + 1
                        ? [{selector,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,
                            children:[...element.children].map(child=>({className:child.className,clientHeight:child.clientHeight,scrollHeight:child.scrollHeight,top:child.getBoundingClientRect().top,bottom:child.getBoundingClientRect().bottom}))}]
                        : [];
                }));
                assert.deepEqual(verticalOverflow,[],`${width}x${height}: content must not be clipped vertically`);
                assert.equal(await page.evaluate(() => {
                    const field = document.getElementById('game-container');
                    return getComputedStyle(field).overflowY === 'hidden' && field.scrollTop === 0;
                }), true, 'the battle screen must not scroll vertically');
            };
            await checkZones();
            assert.equal(await page.locator('#player-set .card').count(),3);
            await page.evaluate(() => { GameState.candidateRecipes = findPossibleRecipesForPlayer(GameState.players.player); updateUI(true); });
            await checkZones();
            const candidatePanel = page.locator('.candidate-recipes-panel');
            if (await candidatePanel.isVisible()) {
                const candidateBox = await candidatePanel.boundingBox();
                assert.ok(candidateBox && candidateBox.y >= 0 && candidateBox.y + candidateBox.height <= height + 1);
                assert.equal(await candidatePanel.evaluate(element => getComputedStyle(element).position),'fixed');
            }
            await page.evaluate(() => { GameState.candidateRecipes = []; updateUI(true); });
            if(width===390 && height===670) await page.screenshot({path:path.join(os.tmpdir(),'balc-mobile-zones-fixed.png')});
            if(width===320 && height===568) await page.screenshot({path:path.join(os.tmpdir(),'balc-mobile-zones-small.png')});
            await page.locator('#open-settings-tab').click();
            await page.locator('#info-overlay').waitFor({state:'visible'});
            assert.equal(await page.locator('#info-overlay').isVisible(),true);
            await page.close({runBeforeUnload:false});
        }
        assert.deepEqual(errors,[]);
    } finally {
        if(browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
