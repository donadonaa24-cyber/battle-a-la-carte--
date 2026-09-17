const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require(process.env.BALC_PLAYWRIGHT_PATH || 'C:/Users/donad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..');
async function pointerDrag(page, sourceSelector, targetSelector, options = {}) {
    const source = await page.locator(sourceSelector).boundingBox();
    const target = await page.locator(targetSelector).boundingBox();
    assert.ok(source && target, `drag elements must be visible: ${sourceSelector} -> ${targetSelector}`);
    const start = {x:source.x + source.width / 2,y:source.y + source.height / 2};
    const end = {x:target.x + target.width / 2,y:target.y + target.height / 2};
    if (options.touch) {
        await page.locator(sourceSelector).dispatchEvent('pointerdown',{pointerId:17,pointerType:'touch',button:0,clientX:start.x,clientY:start.y,bubbles:true});
        await page.evaluate(({start,end})=>{
            document.dispatchEvent(new PointerEvent('pointermove',{pointerId:17,pointerType:'touch',clientX:start.x,clientY:start.y-14,bubbles:true,cancelable:true}));
            document.dispatchEvent(new PointerEvent('pointermove',{pointerId:17,pointerType:'touch',clientX:end.x,clientY:end.y,bubbles:true,cancelable:true}));
        },{start,end});
        if(options.screenshot) await page.screenshot({path:options.screenshot});
        await page.evaluate(end=>document.dispatchEvent(new PointerEvent('pointerup',{pointerId:17,pointerType:'touch',clientX:end.x,clientY:end.y,bubbles:true,cancelable:true})),end);
    } else {
        await page.mouse.move(start.x,start.y); await page.mouse.down();
        await page.mouse.move(start.x,start.y-14,{steps:3});
        await page.mouse.move(end.x,end.y,{steps:8});
        if(options.screenshot) await page.screenshot({path:options.screenshot});
        await page.mouse.up();
    }
}
function mockClient(user) {
    window.__channels=[]; window.__presence={};
    window.__createClient=(_url,_key,options)=>{
      const isGuest=!!options?.auth?.storageKey;
      let current=isGuest&&localStorage.getItem('__mock_guest')?{...user,is_anonymous:true}:null; const listeners=[];
      return {
        realtime:{setAuth:async()=>{}},
        auth:{ onAuthStateChange(cb){listeners.push(cb);queueMicrotask(()=>cb('INITIAL_SESSION',null));},
          getSession:async()=>{await options.global.fetch(location.origin + '/battle-images.js');return {data:{session:current?{user:current}:null}};},
          signInAnonymously:async()=>{current={...user,is_anonymous:true};localStorage.setItem('__mock_guest','1');for(const cb of listeners)cb('SIGNED_IN',{user:current});return {data:{user:current}};} },
        rpc: (name,args)=> {
            if (window.__simulateRpcError && name === 'balc_create_room') {
                const error = window.__simulateRpcError; window.__simulateRpcError = null;
                return Promise.resolve({error});
            }
            return window.__bridge({op:'rpc',name,args});
        },
        from(table){
            const filters={}; let single=false;
            const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(){return q;},order(){return q;},limit(){return q;},
                maybeSingle(){single=true;return q;}, then(ok,no){return window.__bridge({op:'select',table,filters,single}).then(ok,no);} };
            return q;
        },
        channel(topic){
            const callbacks=[];
            const ch={topic,on(kind,config,cb){callbacks.push({kind,config,cb});return ch;},
                subscribe(cb){queueMicrotask(()=>cb('SUBSCRIBED'));return ch;},
                presenceState:()=>window.__presence,
                track:()=>window.__bridge({op:'track'}), send:m=>window.__bridge({op:'broadcast',topic,message:m}), callbacks};
            window.__channels.push(ch);return ch;
        },
        async removeChannel(ch){window.__channels=window.__channels.filter(x=>x!==ch);await window.__bridge({op:'untrack'});}
      };
    };
}
test('Web HOST/GUEST UIs and worker: create/join, distinct selections, turns, disconnect/reload', {timeout:60000}, async()=>{
    const server=http.createServer((req,res)=>{
        const filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
        if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
        fs.readFile(filename,(error,data)=>{if(error){res.writeHead(404);res.end();return;}
            const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
            res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.end(data);});
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try { browser=await chromium.launch({headless:true,channel:'msedge'}); }
    catch(error){ server.close(); throw error; }
    const pages=[], present=new Set(), db={room:null,checkpoint:null,views:[],actions:[],chat:[]};
    const errors=[];
    let failFirstCheckpoint=true;
    const notify=()=>setTimeout(()=>{
        const presence=Object.fromEntries([...present].map(id=>[id,[{online:true}]]));
        for(const page of pages) if(!page.isClosed()) page.evaluate(p=>{
            window.__presence=p;
            for(const ch of window.__channels||[]) for(const {kind,cb} of ch.callbacks) {
                if(kind==='presence') cb();
                if(kind==='postgres_changes') cb({new:window.__roomEvent});
            }
        },presence).catch(()=>{});
    },5);
    try {
        for(const [i,file] of ['web.html', process.env.BALC_BROWSER_GUEST_MOBILE === '1' ? 'mobile/mobile.html' : 'web.html'].entries()){
            const context=await browser.newContext({viewport:i?{width:390,height:844}:{width:1365,height:900}});
            const page=await context.newPage();pages.push(page);
            const user={id:i?'guest':'host',email:`${i}@example.test`};
            page.on('pageerror',error=>errors.push(error.message));
            await page.exposeFunction('__bridge',async r=>{
                try{
                    if(r.op==='track'||r.op==='untrack'){r.op==='track'?present.add(user.id):present.delete(user.id);notify();return {};}
                    if(r.op==='broadcast') {
                        for(const target of pages) if(target!==page&&!target.isClosed()) await target.evaluate(r=>{
                            for(const ch of window.__channels||[]) if(ch.topic===r.topic)
                                for(const {kind,config,cb} of ch.callbacks) if(kind==='broadcast'&&config.event===r.message.event) cb({payload:r.message.payload});
                        },r);
                        return 'ok';
                    }
                    if(r.op==='select'){
                        let rows=r.table==='battle_rooms'?[db.room]:r.table==='battle_views'?db.views.filter(x=>x.user_id===user.id):
                            r.table==='battle_chat_messages'?db.chat:r.table==='battle_checkpoints'?(user.id==='host'?[db.checkpoint]:[]):db.actions.filter(x=>user.id==='host'||x.user_id===user.id);
                        rows=rows.filter(Boolean).filter(row=>Object.entries(r.filters).every(([k,v])=>row[k]===v));
                        return {data:r.single?(rows[0]||null):rows};
                    }
                    const a=r.args;
                    let data;
                    if(r.name==='balc_broadcast_capabilities') data={version:2};
                    if(r.name==='balc_create_room') data=db.room={id:'room1',host_id:'host',guest_id:null,code:'482731',host_info:a.p_info,revision:0,status:'waiting'};
                    if(r.name==='balc_join_room') {db.room={...db.room,guest_id:'guest',guest_info:a.p_info,status:'playing',turn_user:'host',first_user:'host'};data=db.room;}
                    if(r.name==='balc_save_checkpoint') {
                        if(failFirstCheckpoint){failFirstCheckpoint=false;throw Error('SIMULATED_SAVE_FAILURE');}
                        await new Promise(resolve=>setTimeout(resolve,150));
                        if(db.room.revision!==a.p_base)throw Error('STALE_REVISION');
                        db.checkpoint={room_id:a.p_room,snapshot:a.p_snapshot};
                        db.room={...db.room,revision:a.p_revision,turn_user:a.p_snapshot.currentTurn==='player'?'host':'guest',status:a.p_snapshot.gameEnded?'finished':'playing'};
                        db.views=[{room_id:a.p_room,user_id:'host',revision:db.room.revision,payload:a.p_host_view},{room_id:a.p_room,user_id:'guest',revision:db.room.revision,payload:a.p_guest_view}];
                        for(const act of a.p_actions) if(!db.actions.some(x=>x.request_id===act.request_id)) db.actions.push({...act,room_id:a.p_room,processed:true});
                        data=a.p_revision;
                    }
                    if(r.name==='balc_submit_action'){
                        let existing=db.actions.find(x=>x.request_id===a.p_request);
                        if(!existing){
                            if(db.room.revision!==a.p_revision)throw Error('STALE_REVISION');
                            if(db.room.turn_user!==user.id)throw Error('NOT_YOUR_TURN');
                            db.actions.push({room_id:a.p_room,request_id:a.p_request,user_id:user.id,base_revision:a.p_revision,action:a.p_action,processed:false});
                        }
                        data={ok:true};
                    }
                    if(r.name==='balc_commit'){
                        if(db.room.revision!==a.p_revision)throw Error('STALE_REVISION');
                        db.checkpoint={room_id:a.p_room,snapshot:a.p_snapshot};
                        db.room={...db.room,revision:a.p_revision+1,turn_user:a.p_snapshot.currentTurn==='player'?'host':'guest',status:a.p_snapshot.gameEnded?'finished':'playing'};
                        db.views=[{room_id:a.p_room,user_id:'host',revision:db.room.revision,payload:a.p_host_view},{room_id:a.p_room,user_id:'guest',revision:db.room.revision,payload:a.p_guest_view}];
                        const act=db.actions.find(x=>x.request_id===a.p_request);if(act)act.processed=true;
                        data=db.room.revision;
                    }
                    if(r.name==='balc_leave_room'){db.room.status='closed';data=null;}
                    if(r.name==='balc_send_chat'){
                        let item=db.chat.find(x=>x.request_id===a.p_request);
                        if(!item){item={room_id:a.p_room,request_id:a.p_request,user_id:user.id,phrase:a.p_phrase,created_at:new Date().toISOString()};db.chat.push(item);}
                        data=item;
                    }
                    for(const target of pages) if(!target.isClosed()) await target.evaluate(r=>window.__roomEvent=r,db.room);
                    notify();return {data};
                }catch(error){return {error:{message:error.message}};}
            });
            await page.addInitScript(mockClient,user);
            await page.addInitScript(() => { AbortSignal.timeout = undefined; crypto.randomUUID = undefined; });
            await page.route('https://esm.sh/**',route=>i ? route.fulfill({contentType:'text/javascript',body:'export const createClient = window.__createClient;'}) : route.abort());
            await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'window.supabase = {createClient:window.__createClient};'}));
            await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
            await page.evaluate(()=>{
                initGame();
                const ingredient=buildDeck().find(card=>card.type==='ingredient');
                const event=buildDeck().find(card=>card.type==='event');
                GameState.players.player.hand=[ingredient];
                GameState.players.player.events=[event];
                GameState.currentTurn='player'; GameState.selectionMode=null; GameState.gameEnded=false;
                document.getElementById('start-overlay').classList.add('hidden');
                updateUI(true);
            });
            assert.equal(await page.evaluate(()=>getBattleViewModel().online),false);
            assert.ok((await page.locator('[data-online-label]').first().innerText()).includes('CPU'));
            assert.equal(await page.locator('#player-hand-mixed [data-drag-card-type="ingredient"]').count(),1);
            await page.locator('#player-hand-mixed [data-drag-card-type="ingredient"]').click();
            await page.waitForFunction(()=>GameState.selectionMode==='ingredient-action');
            await page.evaluate(()=>closeIngredientAction());
            await pointerDrag(page,'#player-hand-mixed [data-drag-card-type="ingredient"]','#player-set',{
                touch:i===1,screenshot:path.join(os.tmpdir(),i?'balc-card-drag-mobile.png':'balc-card-drag-web.png')});
            await page.waitForTimeout(100);
            const dragResult=await page.evaluate(()=>({mode:GameState.selectionMode,drag:CardDragActions.getLastResult(),
                dragged:CardDragActions.getLastCardId(),hand:GameState.players.player.hand.map(card=>card.id),
                turn:GameState.currentTurn,ended:GameState.gameEnded}));
            assert.deepEqual(dragResult,{mode:'set-confirm',drag:'accepted:set-confirm',dragged:dragResult.dragged,
                hand:dragResult.hand,turn:'player',ended:false});
            await page.evaluate(()=>cancelSetCard());
            await pointerDrag(page,'#player-hand-mixed [data-drag-card-type="event"]',i ? '.center-field' : '.center-panel');
            await page.waitForFunction(()=>GameState.selectionMode==='event-confirm');
            await page.evaluate(()=>{cancelEventCard();document.getElementById('start-overlay').classList.remove('hidden');});
            await page.locator('#menu-friend-button').click();
            await page.waitForFunction(()=>!document.getElementById('friend-create-button').disabled);
        }
        const [host,guest]=pages;
        for (const page of pages) {
            assert.equal(await page.evaluate(() => !!(document.querySelector('#online-selection').compareDocumentPosition(document.querySelector('#friend-create-button')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
            assert.equal(await page.locator('#online-skill option').count(), 6);
        }
        await host.locator('#online-character').selectOption('takumi');
        await host.locator('#online-skill').selectOption('foodTrap');
        await guest.locator('#online-character').selectOption('akatsuki');
        await guest.locator('#online-skill').selectOption('tasteThief');
        assert.match(await host.locator('#online-skill-details').innerText(),/発動条件.*自分が3点以下/s);
        assert.match(await host.locator('#online-skill-details').innerText(),/効果.*相手セット/s);
        assert.match(await guest.locator('#online-skill-details').innerText(),/使用回数.*2回/s);
        await guest.screenshot({path:path.join(os.tmpdir(),'balc-online-lobby-improved.png')});
        for (const page of pages) {
            for (const id of ['#friend-create-button','#friend-join-button']) {
                assert.match(await page.locator(id).evaluate(el=>getComputedStyle(el).backgroundImage),/gradient/);
            }
        }
        await guest.locator('#friend-join-button').click();
        await guest.waitForFunction(()=>document.getElementById('friend-room-message').textContent.includes('6桁'));
        await host.evaluate(() => window.__simulateRpcError = {code:'PGRST202',message:'missing test function'});
        await host.locator('#friend-create-button').click();
        await host.waitForFunction(() => FriendBattle.getConnectionError()?.code === 'SQL_REQUIRED');
        assert.match(await host.locator('#friend-room-message').innerText(), /データベース設定/);
        assert.equal(db.room, null);
        await host.locator('#friend-create-button').click();
        await host.waitForFunction(()=>document.getElementById('online-status').textContent.includes('482731'));
        assert.equal(db.room.host_info.character, 'takumi');
        assert.equal(db.room.host_info.skill, 'foodTrap');
        assert.equal(await host.locator('#online-character').isDisabled(), true);
        assert.match(await host.locator('#online-selection-hint').innerText(), /確定済み/);
        assert.match(await host.locator('#online-account').innerText(),/ゲスト/);
        await host.locator('#online-chat-toggle').click();
        await host.getByRole('button',{name:'こんにちは！'}).click();
        await host.waitForFunction(()=>document.querySelector('#online-chat-history')?.textContent.includes('こんにちは'));
        await guest.locator('#friend-passphrase-input').fill('482731');
        await guest.locator('#friend-join-button').click();
        await guest.waitForFunction(()=>document.getElementById('start-overlay').classList.contains('hidden'));
        await guest.locator('#online-panel-toggle').click();
        await guest.locator('#online-chat-toggle').click();
        await guest.waitForFunction(()=>document.querySelector('#online-chat-history')?.textContent.includes('相手：こんにちは'));
        for(const page of pages)await page.waitForFunction(()=>document.getElementById('start-overlay').classList.contains('hidden'));
        assert.equal(db.room.guest_info.character, 'akatsuki');
        assert.equal(db.room.guest_info.skill, 'tasteThief');
        for (const [i, page] of pages.entries()) {
            assert.deepEqual(await page.evaluate(() => [getBattleViewModel().me.characterId, getBattleViewModel().opponent.characterId,
                getBattleViewModel().me.selectedSkillKey, getBattleViewModel().opponent.selectedSkillKey]),
                i ? ['akatsuki','takumi','tasteThief','foodTrap'] : ['takumi','akatsuki','foodTrap','tasteThief']);
        }
        assert.equal(await guest.evaluate(()=>GameState.currentTurn),'cpu');
        assert.equal(await guest.evaluate(()=>GameState.players.cpu.hand.every(c=>!c.name&&!c.type)),true);
        await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked'));
        assert.equal(await host.evaluate(()=>FriendBattle.isFastMode()),true);
        assert.equal(await host.locator('#friend-create-button').isDisabled(),true);
        assert.match(await host.locator('#friend-create-button').evaluate(el=>getComputedStyle(el).backgroundImage),/rgb\(110, 120, 139\)/);
        assert.equal(await host.locator('#online-bar').isVisible(), false);
        assert.equal(await host.evaluate(()=>FriendBattle.getConnectionError()), null);
        if (process.env.BALC_BROWSER_GUEST_MOBILE === '1') {
            await guest.locator('#online-panel-close').click();
            assert.equal(await guest.locator('#online-bar').isVisible(), false);
            const boxes = await guest.evaluate(() => ({settings:document.querySelector('#open-settings-tab').getBoundingClientRect().left,
                tabs:document.querySelector('.info-tabs').getBoundingClientRect().right,
                height:document.querySelector('#game-container').getBoundingClientRect().height}));
            assert.ok(boxes.settings >= boxes.tabs, 'mobile settings must not overlap existing tabs');
            assert.equal(Math.round(boxes.height), 844);
            await guest.screenshot({path:path.join(os.tmpdir(),'balc-restored-mobile.png')});
        }
        for(const page of pages) {
            assert.equal(await page.evaluate(()=>getBattleViewModel().online),true);
            assert.ok((await page.evaluate(()=>getGalleryItemsByType('ingredients'))).every(x=>x.imagePath.endsWith('.png')));
            await page.evaluate(()=>openInfoOverlay('settings'));
            assert.equal(await page.locator('[data-cpu-only]').first().isVisible(),false);
            await page.evaluate(()=>{closeInfoOverlay();GameState.openDishHistoryFor='cpu';updateUI(true);GameState.openDishHistoryFor=null;updateUI(true);});
            assert.equal(await page.locator('[data-online-label]').first().innerText().then(t=>t.includes('CPU')),false);
            await page.evaluate(()=>BattleMetrics.clear());
        }
        const onlineDragId=await host.evaluate(()=>GameState.players.player.hand.find(card=>card.type==='ingredient')?.id);
        if(onlineDragId){
            await pointerDrag(host,`#player-hand-mixed [data-drag-card-id="${onlineDragId}"]`,'#player-set');
            await host.waitForFunction(()=>GameState.selectionMode==='set-confirm');
            await host.evaluate(()=>cancelSetCard());
            await host.waitForFunction(()=>!GameState.selectionMode&&!document.body.classList.contains('online-operation-locked'));
        }
        const cardId=await host.evaluate(()=>GameState.players.player.hand[0].id);
        for(let n=0;n<20;n++) {
            await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked'));
            await host.evaluate(id=>openIngredientAction(id,'hand'),cardId);
            await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked')&&GameState.selectionMode==='ingredient-action');
            await host.evaluate(()=>closeIngredientAction());
            await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked')&&!GameState.selectionMode);
        }
        console.log('Mock Broadcast benchmark (not internet latency):',await guest.evaluate(()=>BattleMetrics.summary()));
        assert.ok((await guest.evaluate(()=>BattleMetrics.summary())).count>=40);
        await host.waitForFunction(()=>!sessionStorage.getItem('aniani:battle:checkpoint:v2'),null,{timeout:10000});
        assert.ok(db.room.revision>1,'initial failed checkpoint and newer buffered states were saved');
        const old=JSON.stringify(db.checkpoint);
        await guest.evaluate(()=>playerEndTurn());
        assert.equal(JSON.stringify(db.checkpoint),old);
        await host.locator('#end-turn-button').click();
        await host.waitForFunction(()=>GameState.selectionMode==='end-turn-confirm');
        await host.locator('#end-turn-confirm-yes-button').click();
        await host.waitForFunction(()=>GameState.selectionMode==='discard');
        const discardIds=await host.evaluate(()=>[...GameState.players.player.hand,...GameState.players.player.events].slice(0,GameState.discardNeedCount).map(c=>c.id));
        for(const id of discardIds){
            await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked'));
            await host.evaluate(id=>toggleDiscardSelection(id),id);
            await host.waitForFunction(id=>GameState.selectedCardIds.includes(id),id);
        }
        await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked'));
        await host.locator('#confirm-discard-button').click();
        await guest.waitForFunction(()=>GameState.currentTurn==='player'&&!document.body.classList.contains('online-operation-locked'));
        await guest.locator('#end-turn-button').click();
        await guest.waitForFunction(()=>GameState.selectionMode==='end-turn-confirm');
        await guest.screenshot({path:path.join(os.tmpdir(),'balc-online-mobile.png'),fullPage:true});
        present.delete('guest');notify();
        await host.waitForFunction(()=>document.getElementById('online-status').textContent.includes('接続が切れました'));
        await guest.reload();
        await guest.locator('#menu-friend-button').click();
        await guest.waitForFunction(()=>!document.getElementById('online-resume').disabled);
        await guest.locator('#online-resume').click();
        await guest.waitForFunction(()=>document.getElementById('start-overlay').classList.contains('hidden')&&GameState.selectionMode==='end-turn-confirm');
        assert.equal(await guest.locator('#online-character').inputValue(), 'akatsuki');
        assert.equal(await guest.locator('#online-skill').inputValue(), 'tasteThief');
        assert.equal(await guest.evaluate(() => getBattleViewModel().me.selectedSkillKey), 'tasteThief');
        await host.waitForFunction(()=>document.getElementById('online-status').textContent.includes('相手のターン'));
        assert.deepEqual(errors,[]);
    }finally{
        await browser.close(); await new Promise(resolve=>server.close(resolve));
    }
});
