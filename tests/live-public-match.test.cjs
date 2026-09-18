// Explicit opt-in: creates and closes one anonymous public room on the configured Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

test('live Supabase public free match: create, search, join and match notification',
    { skip: process.env.BALC_LIVE !== '1', timeout: 120000 }, async () => {
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
    const pages = [];
    const errors = [];
    const missingResources = [];
    try {
        for (const [i, file] of ['web.html', 'mobile/mobile.html'].entries()) {
            const context = await browser.newContext({ viewport: i ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
            const page = await context.newPage();
            pages.push(page);
            page.on('pageerror', error => errors.push(`${i ? 'GUEST' : 'HOST'}: ${error.message}`));
            page.on('response', response => {
                if (response.status() === 404) missingResources.push(response.url());
            });
            await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
            await page.locator('#menu-friend-button').click();
            await page.evaluate(() => {
                window.__matchSoundCount = 0;
                const original = window.playSfx;
                window.playSfx = name => {
                    if (name === 'turnStart') window.__matchSoundCount++;
                    return original?.(name);
                };
            });
        }
        const [host, guest] = pages;
        await host.locator('#friend-private-toggle').uncheck();
        assert.equal(await host.locator('#friend-create-button').innerText(), '公開部屋を作る');
        await host.locator('#friend-create-button').click();
        await host.waitForFunction(() => document.querySelector('#online-status').textContent.includes('公開フリーマッチ'), null, { timeout: 30000 });

        await guest.locator('#friend-search-public-button').click();
        await guest.locator('#friend-public-room-list .online-public-room').waitFor({ state: 'visible', timeout: 30000 });
        assert.match(await guest.locator('#friend-public-room-list').innerText(), /さんの部屋/);
        await guest.locator('#friend-public-room-list .online-public-room button').first().click();

        for (const page of pages) {
            try {
                await page.waitForFunction(() => document.querySelector('#start-overlay').classList.contains('hidden'), null, { timeout: 40000 });
            } catch (error) {
                console.log('Public match debug:', await Promise.all(pages.map(async current => ({
                    status: await current.locator('#online-status').innerText(),
                    roomMessage: await current.locator('#friend-room-message').innerText(),
                    startHidden: await current.locator('#start-overlay').evaluate(element => element.classList.contains('hidden'))
                }))));
                console.log('Public match page errors:', errors);
                throw error;
            }
            assert.equal(await page.evaluate(() => FriendBattle.isFastMode()), true);
            assert.ok(await page.evaluate(() => window.__matchSoundCount) >= 1);
        }
        assert.deepEqual(errors, []);
        if (missingResources.length) console.log('Public match missing resources:', [...new Set(missingResources)]);
        const statuses = await Promise.all(pages.map(page => page.locator('#online-status').innerText()));
        assert.ok(statuses.some(text => text.startsWith('HOST /')));
        assert.ok(statuses.some(text => text.startsWith('GUEST /')));
    } finally {
        for (const page of pages) {
            if (!page.isClosed()) await page.evaluate(() => FriendBattle.leaveRoom()).catch(() => {});
        }
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
