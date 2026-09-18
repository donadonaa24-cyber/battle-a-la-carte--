const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

test('Web and mobile reveal drawn cards every 500ms and fly discarded cards to the pile', { timeout: 90000 }, async () => {
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
                GameState.discard = [];
                updateUI(true);
            });

            await page.evaluate(() => {
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.player);
                updateUI(true);
            });
            const delays = await page.locator('#player-hand-mixed .card-draw-enter')
                .evaluateAll(cards => cards.map(card => card.style.getPropertyValue('--card-draw-delay')));
            assert.deepEqual(delays, ['0ms', '500ms', '1000ms']);
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

            await page.evaluate(() => {
                drawOneResolved(GameState.players.player);
                drawOneResolved(GameState.players.player);
                updateUI(true);
            });
            const effectDelays = await page.locator('#player-hand-mixed .card-draw-enter')
                .evaluateAll(cards => cards.map(card => card.style.getPropertyValue('--card-draw-delay')));
            assert.deepEqual(effectDelays, ['0ms', '500ms']);
            await page.close();
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
