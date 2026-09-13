const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require(process.env.BALC_PLAYWRIGHT_PATH || 'C:/Users/donad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..');
function mockClient(user) {
    window.__channels=[]; window.__presence={};
    window.__createClient=()=>({
        auth:{ onAuthStateChange(cb){queueMicrotask(()=>cb('INITIAL_SESSION',{user}));}, getSession:async()=>({data:{session:{user}}}) },
        rpc: (name,args)=>window.__bridge({op:'rpc',name,args}),
        from(table){
            const filters={}; let single=false;
            const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(){return q;},order(){return q;},limit(){return q;},
                maybeSingle(){single=true;return q;}, then(ok,no){return window.__bridge({op:'select',table,filters,single}).then(ok,no);} };
            return q;
        },
        channel(){
            const callbacks=[];
            const ch={on(kind,config,cb){callbacks.push({kind,cb});return ch;},
                subscribe(cb){queueMicrotask(()=>cb('SUBSCRIBED'));return ch;},
                presenceState:()=>window.__presence,
                track:()=>window.__bridge({op:'track'}), callbacks};
            window.__channels.push(ch);return ch;
        },
        async removeChannel(ch){window.__channels=window.__channels.filter(x=>x!==ch);await window.__bridge({op:'untrack'});}
    });
}
test('real Web/mobile UIs and HOST worker: create/join, turns, hidden cards, disconnect/reload', {timeout:60000}, async()=>{
    const server=http.createServer((req,res)=>{
        const filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
        if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
        fs.readFile(filename,(error,data)=>{if(error){res.writeHead(404);res.end();return;}
            const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.mp3':'audio/mpeg'};
            res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.end(data);});
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try { browser=await chromium.launch({headless:true,channel:'msedge'}); }
    catch(error){ server.close(); throw error; }
    const pages=[], present=new Set(), db={room:null,checkpoint:null,views:[],actions:[]};
    const errors=[];
    const notify=()=>setTimeout(()=>{
        const presence=Object.fromEntries([...present].map(id=>[id,[{online:true}]]));
        for(const page of pages) if(!page.isClosed()) page.evaluate(p=>{
            window.__presence=p;
            for(const ch of window.__channels||[]) for(const {cb} of ch.callbacks) cb();
        },presence).catch(()=>{});
    },5);
    try {
        for(const [i,file] of ['web.html','mobile/mobile.html'].entries()){
            const context=await browser.newContext({viewport:i?{width:390,height:844}:{width:1365,height:900}});
            const page=await context.newPage();pages.push(page);
            const user={id:i?'guest':'host',email:`${i}@example.test`};
            page.on('pageerror',error=>errors.push(error.message));
            await page.exposeFunction('__bridge',async r=>{
                try{
                    if(r.op==='track'||r.op==='untrack'){r.op==='track'?present.add(user.id):present.delete(user.id);notify();return {};}
                    if(r.op==='select'){
                        let rows=r.table==='battle_rooms'?[db.room]:r.table==='battle_views'?db.views.filter(x=>x.user_id===user.id):
                            r.table==='battle_checkpoints'?(user.id==='host'?[db.checkpoint]:[]):db.actions.filter(x=>user.id==='host'||x.user_id===user.id);
                        rows=rows.filter(Boolean).filter(row=>Object.entries(r.filters).every(([k,v])=>row[k]===v));
                        return {data:r.single?(rows[0]||null):rows};
                    }
                    const a=r.args;
                    let data;
                    if(r.name==='balc_create_room') data=db.room={id:'room1',host_id:'host',guest_id:null,code:'482731',host_info:a.p_info,revision:0,status:'waiting'};
                    if(r.name==='balc_join_room') {db.room={...db.room,guest_id:'guest',guest_info:a.p_info,status:'playing',turn_user:'host'};data=db.room;}
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
                    notify();return {data};
                }catch(error){return {error:{message:error.message}};}
            });
            await page.addInitScript(mockClient,user);
            await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:'export const createClient = window.__createClient;'}));
            await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
            await page.locator('#menu-friend-button').click();
            await page.waitForFunction(()=>!document.getElementById('friend-create-button').disabled);
        }
        const [host,guest]=pages;
        await host.locator('#friend-create-button').click();
        await host.waitForFunction(()=>document.getElementById('online-status').textContent.includes('482731'));
        await guest.locator('#friend-passphrase-input').fill('482731');
        await guest.locator('#friend-join-button').click();
        for(const page of pages)await page.waitForFunction(()=>document.getElementById('start-overlay').classList.contains('hidden'));
        assert.equal(await guest.evaluate(()=>GameState.currentTurn),'cpu');
        assert.equal(await guest.evaluate(()=>GameState.players.cpu.hand.every(c=>!c.name&&!c.type)),true);
        await host.waitForFunction(()=>!document.body.classList.contains('online-operation-locked'));
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
        await host.waitForFunction(()=>document.getElementById('online-status').textContent.includes('相手のターン'));
        assert.deepEqual(errors,[]);
    }finally{
        await browser.close(); await new Promise(resolve=>server.close(resolve));
    }
});
