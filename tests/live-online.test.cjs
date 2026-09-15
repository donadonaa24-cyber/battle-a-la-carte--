// Explicit opt-in: creates an anonymous test room on the configured Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
test('live Supabase Broadcast: two views, latency, legal match and reconnect',
    { skip: process.env.BALC_LIVE !== '1', timeout: 240000 }, async () => {
    const { chromium } = require(process.env.BALC_PLAYWRIGHT_PATH || 'playwright');
    const root = path.resolve(__dirname, '..');
    const server = http.createServer((req, res) => {
        const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (error, data) => {
            if (error) { res.writeHead(404); return res.end(); }
            res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
                '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
            res.setHeader('Content-Length', data.length); res.end(data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const pages = [], contexts = [], errors = [], report = { timing: [], checks: [] };
    try {
        for (const [i, file] of ['web.html', 'mobile/mobile.html'].entries()) {
            const context = await browser.newContext({ viewport: i ? { width: 390, height: 844 } : { width: 1365, height: 900 } });
            contexts.push(context); const page = await context.newPage(); pages.push(page);
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
            await page.locator('#menu-friend-button').click();
            await page.locator('#online-character').selectOption(i ? 'akatsuki' : 'takumi');
            await page.locator('#online-skill').selectOption(i ? 'tasteThief' : 'foodTrap');
            await page.locator('#online-selection').screenshot({path: path.join(os.tmpdir(), i ? 'balc-selection-mobile.png' : 'balc-selection-web.png')});
        }
        const [host, guest] = pages;
        await host.locator('#friend-create-button').click();
        await host.waitForFunction(() => /合言葉 \d{6}/.test(document.querySelector('#online-status').textContent), { timeout: 30000 });
        const code = await host.evaluate(() => document.querySelector('#online-status').textContent.match(/合言葉 (\d{6})/)[1]);
        await guest.locator('#friend-passphrase-input').fill(code); await guest.locator('#friend-join-button').click();
        for (const page of pages) await page.waitForFunction(() => document.querySelector('#start-overlay').classList.contains('hidden'), null, { timeout: 40000 });
        for (const page of pages) assert.equal(await page.evaluate(() => FriendBattle.isFastMode()), true);
        assert.equal(await host.evaluate(() => getBattleViewModel().me.characterId), 'takumi');
        assert.equal(await guest.evaluate(() => getBattleViewModel().me.characterId), 'akatsuki');
        const verifySelections = async () => {
            for (const [i, page] of pages.entries()) assert.deepEqual(await page.evaluate(() => [getBattleViewModel().me.characterId,
                getBattleViewModel().opponent.characterId, getBattleViewModel().me.selectedSkillKey, getBattleViewModel().opponent.selectedSkillKey]),
                i ? ['akatsuki','takumi','tasteThief','foodTrap'] : ['takumi','akatsuki','foodTrap','tasteThief']);
        };
        await verifySelections();
        report.checks.push('create/join/character/skill/private views');
        const ready = page => page.waitForFunction(() => !document.body.classList.contains('online-operation-locked'), null, { timeout: 15000 });
        const call = async (page, name, args = []) => {
            await ready(page); await page.evaluate(({ name, args }) => window[name](...args), { name, args });
            await page.waitForFunction(() => !document.querySelector('#online-status').textContent.includes('操作を確認'), null, { timeout: 15000 });
        };
        let actor = (await host.evaluate(() => getBattleViewModel().turn)) === 'me' ? host : guest;
        let opponent = actor === host ? guest : host;
        report.firstActor=actor===host?'HOST':'GUEST';
        report.startImages = await Promise.all(pages.map(page => page.evaluate(() => {
            const assets = performance.getEntriesByType('resource').filter(r => /assets\/(battle-)?images\//.test(r.name));
            return { count: assets.length, bytes: assets.reduce((n, r) => n + r.decodedBodySize, 0),
                originalPngCount: assets.filter(r => r.name.endsWith('.png')).length };
        })));
        for (const page of pages) await page.evaluate(() => BattleMetrics.clear());
        for (let n = 0; n < 20; n++) {
            await call(actor, 'playerEndTurn'); await call(actor, 'cancelEndTurn');
        }
        await opponent.waitForFunction(() => BattleMetrics.records().filter(r => Number.isFinite(r.dom)).length >= 40);
        const rows = await opponent.evaluate(() => BattleMetrics.records());
        const summarize = (values) => {
            values.sort((a, b) => a - b); const n = values.length;
            return { count: n, average: values.reduce((a, b) => a + b, 0) / n,
                median: (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2, min: values[0], max: values[n - 1] };
        };
        for (const [label, a, b] of [['input-local', 'input', 'local'], ['local-send', 'local', 'sent'],
            ['send-host', 'sent', 'hostReceived'], ['host-queue','hostReceived','hostStarted'], ['host-worker', 'hostStarted', 'hostApplied'],
            ['host-peer', 'hostApplied', 'received'], ['receive-state', 'received', 'applied'],
            ['state-dom', 'applied', 'dom'], ['input-peer-dom', 'input', 'dom']]) {
            report.timing.push({ label, ...summarize(rows.filter(r => Number.isFinite(r[a]) && Number.isFinite(r[b])).map(r => r[b] - r[a])) });
        }
        assert.ok(rows.length >= 40);
        // Repeat in the other direction to include the GUEST -> HOST -> GUEST round trip.
        await call(actor,'playerEndTurn'); await call(actor,'confirmEndTurn');
        if(await actor.evaluate(()=>GameState.selectionMode==='discard')) {
            const ids=await actor.evaluate(()=>[...GameState.players.player.hand,...GameState.players.player.events].slice(0,GameState.discardNeedCount).map(c=>c.id));
            for(const id of ids) await call(actor,'toggleDiscardSelection',[id]);
            await call(actor,'confirmDiscardSelection');
        }
        await ready(opponent);
        for(const page of pages) await page.evaluate(()=>BattleMetrics.clear());
        for(let n=0;n<10;n++){await call(opponent,'playerEndTurn');await call(opponent,'cancelEndTurn');}
        await actor.waitForFunction(()=>BattleMetrics.records().filter(r=>Number.isFinite(r.dom)).length>=20);
        report.secondActor=actor===host?'GUEST':'HOST';
        report.secondTiming=await actor.evaluate(()=>BattleMetrics.records());
        report.secondSummary=summarize(report.secondTiming.filter(r=>Number.isFinite(r.dom)).map(r=>r.dom-r.input));
        // Keep only aggregate timing, never room/user identifiers or card data in exported reports.
        delete report.secondTiming;
        const resolveSelection = async page => {
            for (let step = 0; step < 8; step++) {
                const choice = await page.evaluate(() => {
                    const ctx = GameState.pendingEventContext || GameState.pendingSkillContext;
                    return ['event-target','skill-target','knife-select'].includes(GameState.selectionMode) && ctx ? { ids: ctx.options.slice(0, Math.max(1, ctx.minSelect || 1)).map(c => c.id) } : null;
                });
                if (!choice) return;
                for (const id of choice.ids) await call(page, 'toggleEventTargetSelection', [id]);
                await call(page, 'confirmEventSelection');
            }
        };
        let packed = false, cooked = false, set = false, skilled = false;
        const skilledRoles = new Set();
        for (let turn = 0; turn < 100 && !await host.evaluate(() => GameState.gameEnded); turn++) {
            actor = await host.evaluate(() => getBattleViewModel().turn === 'me') ? host : guest;
            await ready(actor); await resolveSelection(actor);
            const role = actor === host ? 'HOST' : 'GUEST';
            if (!skilledRoles.has(role) && await actor.evaluate(() => getSkillActivationStatusForSide('player').ok)) {
                await call(actor, 'playerUseSkill'); await call(actor, 'confirmSkillActivation');
                await resolveSelection(actor); skilled = true; skilledRoles.add(role);
                const selected = actor === host ? 'foodTrap' : 'tasteThief';
                await actor.waitForFunction(key => getBattleViewModel().me.skillUseCounts[key] > 0, selected);
                await (actor === host ? guest : host).waitForFunction(key => getBattleViewModel().opponent.skillUseCounts[key] > 0, selected);
                assert.equal(await actor.evaluate(key => getBattleViewModel().me.skillUseCounts[key] || 0,
                    actor === host ? 'tasteThief' : 'foodTrap'), 0);
            }
            const id = await actor.evaluate(() => GameState.players.player.set.length < getSetLimit(GameState.players.player) ? GameState.players.player.hand.find(c => !c.trapLocked)?.id : null);
            if (id) { await call(actor, 'playerSetCard', [id]); await call(actor, 'confirmSetCard'); set = true; }
            for (let dishes = 0; dishes < 6; dishes++) {
                // Keep GUEST at zero until its selected Taste Thief can legally be tested.
                if (actor === guest && !skilledRoles.has('GUEST')) break;
                if (await actor.evaluate(() => GameState.gameEnded)) break;
                const recipe = await actor.evaluate(() => findPossibleRecipesForPlayer(GameState.players.player).sort((a,b) => b.recipe.points - a.recipe.points)[0]?.recipe.name);
                if (!recipe) break;
                await call(actor, 'playerShowRecipeCandidates'); await call(actor, 'playerCookSelectedRecipe', [recipe]); cooked = true;
            }
            if (await actor.evaluate(() => GameState.gameEnded)) break;
            if (!packed && await actor.evaluate(() => GameState.players.player.score >= 3)) {
                await call(actor, 'playerBuyPack', ['board']); await call(actor, 'confirmPackPurchase'); packed = true;
            }
            await call(actor, 'playerEndTurn'); await call(actor, 'confirmEndTurn');
            if (await actor.evaluate(() => GameState.selectionMode === 'discard')) {
                const ids = await actor.evaluate(() => [...GameState.players.player.events, ...GameState.players.player.hand].slice(0, GameState.discardNeedCount).map(c => c.id));
                for (const id of ids) await call(actor, 'toggleDiscardSelection', [id]);
                await call(actor, 'confirmDiscardSelection');
            }
        }
        report.match = { set, cooked, packed, skilled, ended: await host.evaluate(() => GameState.gameEnded) };
        assert.equal(report.match.ended, true);
        assert.deepEqual([...skilledRoles].sort(), ['GUEST','HOST']);
        report.checks.push('distinct HOST/GUEST skills used legally');
        await verifySelections();
        await guest.waitForFunction(() => GameState.gameEnded);
        await host.screenshot({ path: path.join(os.tmpdir(), 'balc-fast-web.png'), fullPage: true });
        await guest.screenshot({ path: path.join(os.tmpdir(), 'balc-fast-mobile.png'), fullPage: true });
        await new Promise(resolve => setTimeout(resolve, 500));
        await host.locator('#online-rematch').click(); await guest.locator('#online-rematch').click();
        await host.waitForFunction(() => !GameState.gameEnded, null, { timeout: 20000 });
        await guest.waitForFunction(() => !GameState.gameEnded);
        await verifySelections();
        for (const page of pages) assert.deepEqual(await page.evaluate(() => getBattleViewModel().me.skillUseCounts), {});
        report.checks.push('win/rematch');
        // Closing the tab terminates the actual WebSocket; CDP offline emulation may keep it alive.
        await guest.close();
        await host.waitForFunction(() => document.querySelector('#online-status').textContent.includes('接続が切れました'), null, { timeout: 45000 });
        const restored=await contexts[1].newPage(); pages[1]=restored;
        restored.on('pageerror',error=>errors.push(error.message));
        await restored.goto(`http://127.0.0.1:${server.address().port}/mobile/mobile.html`);
        await restored.locator('#menu-friend-button').click(); await restored.locator('#online-resume').click();
        await restored.waitForFunction(() => document.querySelector('#start-overlay').classList.contains('hidden'), null, { timeout: 30000 });
        await verifySelections();
        assert.equal(await restored.locator('#online-character').inputValue(), 'akatsuki');
        assert.equal(await restored.locator('#online-skill').inputValue(), 'tasteThief');
        report.checks.push('WebSocket disconnect/new tab/resume');
        await host.waitForFunction(() => !sessionStorage.getItem('aniani:battle:checkpoint:v2'));
        await host.reload();
        await host.locator('#menu-friend-button').click();
        await host.locator('#online-resume').click();
        await host.waitForFunction(() => document.querySelector('#start-overlay').classList.contains('hidden'), null, { timeout: 30000 });
        await verifySelections();
        assert.equal(await host.locator('#online-character').inputValue(), 'takumi');
        assert.equal(await host.locator('#online-skill').inputValue(), 'foodTrap');
        await restored.waitForFunction(() => !document.querySelector('#online-status').textContent.includes('接続が切れました'));
        report.checks.push('HOST reload/resume preserves both selections');
        assert.deepEqual(errors, []);
    } finally {
        console.log('Live performance report:', JSON.stringify(report));
        fs.writeFileSync(path.join(os.tmpdir(), 'balc-live-performance.json'), JSON.stringify(report, null, 2));
        for (const page of pages) if (!page.isClosed()) await page.evaluate(() => FriendBattle.leaveRoom()).catch(() => {});
        await browser.close(); await new Promise(resolve => server.close(resolve));
    }
});
