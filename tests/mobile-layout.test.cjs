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
        const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
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
        const page = await browser.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const [width,height] of [[390,670],[375,667],[320,568],[390,844]]) {
            await page.setViewportSize({width,height});
            await page.goto(`http://127.0.0.1:${server.address().port}/mobile/mobile.html`);
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
                GameState.players.cpu.hand = [{id:'back-1',hidden:true},{id:'back-2',hidden:true}];
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
            };
            await checkZones();
            assert.equal(await page.locator('#player-set .card').count(),3);
            await page.evaluate(() => { GameState.candidateRecipes = findPossibleRecipesForPlayer(GameState.players.player); updateUI(true); });
            await checkZones();
            await page.locator('.player-set-zone').scrollIntoViewIfNeeded();
            await page.locator('.player-pack-zone').scrollIntoViewIfNeeded();
            if(width===390 && height===670) await page.screenshot({path:path.join(os.tmpdir(),'balc-mobile-zones-fixed.png')});
            await page.evaluate(() => {openInfoOverlay('settings');});
            assert.equal(await page.locator('#info-overlay').isVisible(),true);
        }
        assert.deepEqual(errors,[]);
    } finally {
        if(browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
