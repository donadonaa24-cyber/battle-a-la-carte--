const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

test('Web and mobile card motion, direct pile view and pack shop stay usable', { timeout: 120000 }, async () => {
    const { chromium } = require(process.env.BALC_PLAYWRIGHT_PATH || 'playwright');
    const root = path.resolve(__dirname, '..');
    const server = http.createServer((req, res) => {
        const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (error, data) => {
            if (error) { res.writeHead(404); return res.end(); }
            res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
                '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
            res.end(data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        for (const [index, file] of ['web.html', 'mobile/mobile.html'].entries()) {
            const page = await browser.newPage({ viewport: index ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
            await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
            await page.evaluate(() => {
                window.__battleSafeStartGame();
                document.getElementById('start-overlay')?.classList.add('hidden');
                GameState.players.player.hand = [];
                GameState.players.player.events = [];
                GameState.players.cpu.hand = [];
                GameState.players.cpu.events = [];
                GameState.discard = [];
                updateUI(true);
            });

            await page.evaluate(() => {
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.cpu);
                drawOneResolved(GameState.players.cpu);
                drawOneResolved(GameState.players.cpu);
                updateUI(true);
            });
            const delays = await page.locator('#player-hand-mixed .card-draw-enter')
                .evaluateAll(cards => cards.map(card => card.style.getPropertyValue('--card-draw-delay')));
            assert.deepEqual(delays, ['0ms', '500ms', '1000ms']);
            const opponentDelays = await page.locator('#cpu-hand-mixed .card-draw-enter')
                .evaluateAll(cards => cards.map(card => card.style.getPropertyValue('--card-draw-delay')));
            assert.deepEqual(opponentDelays, ['0ms', '300ms', '600ms']);
            await page.waitForTimeout(600);
            await page.screenshot({ path: path.join(os.tmpdir(), index ? 'balc-card-draw-mobile.png' : 'balc-card-draw-web.png') });
            await page.waitForTimeout(900);
            assert.equal(await page.locator('#player-hand-mixed .card-draw-enter').count(), 0);

            await page.evaluate(() => {
                const card = GameState.players.player.hand.shift() || GameState.players.player.events.shift();
                moveCardToDiscard(card);
                updateUI(true);
            });
            assert.equal(await page.locator('.card-discard-ghost').count(), 1);
            const flight = await page.locator('.card-discard-ghost').evaluate(element => ({
                x: element.style.getPropertyValue('--discard-flight-x'),
                y: element.style.getPropertyValue('--discard-flight-y')
            }));
            assert.match(flight.x, /px$/);
            assert.match(flight.y, /px$/);
            await page.waitForTimeout(250);
            await page.screenshot({ path: path.join(os.tmpdir(), index ? 'balc-card-discard-mobile.png' : 'balc-card-discard-web.png') });
            await page.waitForTimeout(700);
            assert.equal(await page.locator('.card-discard-ghost').count(), 0);
            assert.match(await page.locator('#discard-pile-button').getAttribute('style'), /background-image/);
            assert.match(await page.locator('#discard-pile-button').getAttribute('aria-label'), /最後は/);

            await page.locator('#discard-pile-button').click();
            assert.equal(await page.locator('#pile-view-panel').isVisible(), true);
            assert.equal(await page.locator('#pile-confirm-panel').count(), 0);
            await page.locator('#pile-view-close-button').click();

            await page.evaluate(() => showFieldPackDetails(packDefinitions[0]));
            assert.equal(await page.locator('#spotlight-overlay').isVisible(), true);
            assert.equal(await page.locator('#spotlight-close-button').isVisible(), true);
            await page.locator('#spotlight-close-button').click();
            assert.equal(await page.locator('#spotlight-overlay').isVisible(), false);
            await page.evaluate(() => showSpotlightCard({
                badge: '自動終了確認',
                name: 'まな板',
                sub: '一定時間後に自動で閉じます。',
                durationMs: 80
            }));
            assert.equal(await page.locator('#spotlight-overlay').isVisible(), true);
            await page.waitForTimeout(140);
            assert.equal(await page.locator('#spotlight-overlay').isVisible(), false);

            await page.evaluate(() => {
                GameState.players.player.score = 6;
                GameState.players.player.packs = [];
                GameState.currentTurn = 'player';
                GameState.selectionMode = null;
                updateUI(true);
            });
            await page.locator('#open-pack-shop-button').click();
            assert.equal(await page.locator('#pack-shop-overlay').isVisible(), true);
            assert.equal(await page.locator('.pack-shop-item').count(), 3);
            assert.equal(await page.locator('.pack-shop-status.is-unowned').count(), 3);
            assert.match(await page.locator('#pack-shop-score').innerText(), /6点.*各3点/);
            await page.screenshot({ path: path.join(os.tmpdir(), index ? 'balc-pack-shop-mobile.png' : 'balc-pack-shop-web.png') });
            await page.evaluate(() => { window.showSpotlightPackCardAsync = async () => {}; });
            await page.locator('.pack-shop-exchange-button').first().click();
            assert.equal(await page.locator('#pack-confirm-panel').isVisible(), true);
            await page.locator('#pack-confirm-yes-button').click();
            await page.waitForFunction(() => GameState.players.player.packs.length === 1);
            assert.equal(await page.locator('.pack-shop-status.is-owned').count(), 1);
            assert.match(await page.locator('#open-pack-shop-button').innerText(), /1\/3/);
            await page.locator('#pack-shop-close-button').click();

            await page.evaluate(() => {
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.player);
                updateUI(true);
            });
            const effectDelays = await page.locator('#player-hand-mixed .card-draw-enter')
                .evaluateAll(cards => cards.map(card => card.style.getPropertyValue('--card-draw-delay')));
            assert.deepEqual(effectDelays, ['0ms', '500ms']);
            await page.waitForTimeout(900);

            await page.evaluate(() => {
                const player = GameState.players.player;
                const recipe = recipes.find(item => item.name === '鮭おにぎり');
                const pool = buildDeck();
                player.hand = recipe.required.map((name, index) => {
                    const card = pool.find(item => item.type === 'ingredient' && item.name === name);
                    return { ...card, id: `cook-${index}-${Date.now()}` };
                });
                player.events = [];
                player.set = [];
                player.cookedRecipes = [];
                GameState.discard = [];
                GameState.selectionMode = null;
                updateUI(true);
            });
            await page.waitForTimeout(1100);
            await page.evaluate(() => {
                const plan = findPossibleRecipesForPlayer(GameState.players.player)
                    .find(item => item.recipe.name === '鮭おにぎり');
                if (!applyRecipePlan(GameState.players.player, plan)) throw new Error('recipe plan failed');
                updateUI(true);
            });
            assert.ok(await page.locator('.cooking-fusion-material').count() >= 2);
            assert.equal(await page.locator('.card-discard-ghost').count(), 0);
            await page.waitForTimeout(680);
            assert.equal(await page.locator('.cooking-fusion-result').count(), 1);
            await page.screenshot({ path: path.join(os.tmpdir(), index ? 'balc-cooking-fusion-mobile.png' : 'balc-cooking-fusion-web.png') });
            await page.waitForTimeout(1000);
            assert.equal(await page.locator('.cooking-fusion-result').count(), 0);

            await page.evaluate(() => {
                const ingredient = buildDeck().find(card => card.type === 'ingredient');
                const event = buildDeck().find(card => card.type === 'event' && card.name === '緊急料理');
                GameState.players.player.hand = [{ ...ingredient, id: 'event-cook-material' }];
                GameState.players.player.events = [{ ...event, id: 'event-cook-card' }];
                GameState.players.player.cookedRecipes = [];
                GameState.discard = [];
                updateUI(true);
            });
            await page.waitForTimeout(650);
            await page.evaluate(() => {
                const event = GameState.players.player.events.pop();
                const ingredient = GameState.players.player.hand.pop();
                moveCardToDiscard(event);
                moveCardToDiscard(ingredient);
                GameState.players.player.cookedRecipes.unshift({
                    name: '緊急料理', points: 3, required: [], cookedAt: Date.now(), fromEvent: true
                });
                updateUI(true);
            });
            assert.equal(await page.locator('.cooking-fusion-material').count(), 1);
            assert.equal(await page.locator('.card-discard-ghost').count(), 1);
            await page.close();
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
