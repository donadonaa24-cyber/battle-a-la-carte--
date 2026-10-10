const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ids=['chizuru','mai','takumi','akatsuki','kanna','tsuyoshi','yuzuki','ryuta'];
function runtime(enabled){
    const c=vm.createContext({console,crypto:require('node:crypto').webcrypto});c.self=c;
    c.importScripts=(...files)=>files.forEach(f=>{let s=read(f.split('?')[0]);
        if(f.startsWith('battle-protocol.js') && enabled !== undefined)s=s.replace(/const newOnlineCharactersEnabled = (false|true);/,'const newOnlineCharactersEnabled = '+enabled+';');
        vm.runInContext(s,c,{filename:f});});c.importScripts('battle-engine-worker.js');return c;
}
const info=(character,cap=true)=>({character,skill:'lastOrder',name:'プロフィール',title:'storyFestival',frame:'gold',...(cap?{characterRosterVersion:2}:{})});
test('rollback OFF disables new selection while retaining eight-ID receipt and legacy boundary',async()=>{
    const c=runtime(false),p=c.BattleProtocol.characters;
    assert.equal(p.newOnlineCharactersEnabled,false);
    for(const id of ids){
        assert.equal(p.onlineAllowed(id),ids.indexOf(id)<4);
        assert.equal(p.roomError(info(id),info('mai')),null);
        if(ids.indexOf(id)>=4)await assert.rejects(c.execute({kind:'init',host:info(id),guest:info('mai')}),/INVALID_SELECTION/);
        else for(const h of [false,true])for(const g of [false,true])await c.execute({kind:'init',host:info(id,h),guest:info('mai',g)});
    }
    assert.equal(p.roomError(info('kanna'),info('mai',false)),'CHARACTER_UPDATE_REQUIRED');
});
test('U6b ON permits eight IDs while original rooms work with either generation',async()=>{
    const c=runtime(),p=c.BattleProtocol.characters;
    assert.equal(p.newOnlineCharactersEnabled,true);assert.equal(c.BattleProtocol.version,1);
    for(const id of ids){
        assert.equal(p.known(id),true);assert.equal(p.onlineAllowed(id),true);
        assert.equal(p.roomError(info(id),info('mai')),null);
        const allowed=ids.indexOf(id)<4?null:'CHARACTER_UPDATE_REQUIRED';
        assert.equal(p.roomError(info(id),info('mai',false)),allowed);
        assert.equal(p.roomError(info('mai',false),info(id)),allowed);
        if(ids.indexOf(id)>=4){await c.execute({kind:'init',host:info(id),guest:info('mai')});await assert.rejects(c.execute({kind:'init',host:info(id),guest:info('mai',false)}),/CHARACTER_UPDATE_REQUIRED/);await assert.rejects(c.execute({kind:'init',host:info('mai',false),guest:info(id)}),/CHARACTER_UPDATE_REQUIRED/);}
        else for(const hostNew of [false,true])for(const guestNew of [false,true])await c.execute({kind:'init',host:info(id,hostNew),guest:info('mai',guestNew)});
    }
    for(const value of [undefined,null,'2',true,{},[],1,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(p.supportsEight({characterRosterVersion:value}),false);
    for(const value of [2,3])assert.equal(p.supportsEight({characterRosterVersion:value}),true);
    for(const id of [undefined,null,'unknown','constructor','__proto__',{},[]]){
        assert.equal(p.known(id),false);assert.equal(p.roomError(info(id),info('mai')),'CHARACTER_UPDATE_REQUIRED');
        await assert.rejects(c.execute({kind:'init',host:info(id),guest:info('mai')}),/CHARACTER_UPDATE_REQUIRED/);
    }
});
test('U6b source ON: eight IDs and all six skills retain names, cosmetics, scoring, Mode, surrender and checkpoint projections',async()=>{
    // Run the actual candidate source without rewriting its switch.
    const c=runtime(),p=c.BattleProtocol.characters;
    assert.equal(c.getSkillDefinitions().length,6);
    for(const id of ids)for(const skill of c.getSkillDefinitions())for(const role of ['host','guest']){
        const host=info(role==='host'?id:'mai'),guest=info(role==='guest'?id:'mai');host.skill=skill.key;guest.skill=skill.key;
        const r=await c.execute({kind:'init',host,guest});
        const side=role==='host'?'player':'cpu';
        r.snapshot.players[side].score=7;r.snapshot.players[side].battleALaCarteModeActive=true;
        const restored=await c.execute({kind:'project',snapshot:JSON.parse(JSON.stringify(r.snapshot))});
        const v=restored[role].state;
        assert.equal(v.characterIds.player,id);assert.equal(v.characterNames.player,p.names[id]);
        assert.equal(v.players.player.selectedSkillKey,skill.key);assert.equal(v.players.player.score,7);
        assert.equal(v.players.player.battleALaCarteModeActive,true);assert.equal(v.players.player.title,'storyFestival');assert.equal(v.players.player.frame,'gold');
        assert.equal(v.players.player.name,'プロフィール');assert.equal(v.costume,undefined);assert.equal(v.players.player.costume,undefined);
        const result=await c.execute({kind:'action',snapshot:r.snapshot,role,action:{name:'playerSurrender',args:[]}});
        assert.equal(result.views[role].state.characterIds.player,id);assert.equal(result.views[role].state.winner,'cpu');
        assert.equal(result.views[role].state.players.cpu.hand.every(card=>card.hidden&&!card.name&&!card.type),true);
    }
    await assert.rejects(c.execute({kind:'init',host:info('kanna'),guest:info('mai',false)}),/CHARACTER_UPDATE_REQUIRED/);
    const r=await c.execute({kind:'init',host:info('mai'),guest:info('kanna')});r.snapshot.characterIds.cpu='unknown';
    await assert.rejects(c.execute({kind:'project',snapshot:r.snapshot}),/CHARACTER_UPDATE_REQUIRED/);
    await assert.rejects(c.execute({kind:'action',snapshot:r.snapshot,role:'host',action:{name:'playerSurrender',args:[]}}),/CHARACTER_UPDATE_REQUIRED/);
});
function networkRuntime(){
    const engine=runtime(),source=read('network.js');
    const helpers=source.slice(source.indexOf('    function assertCharacterRoom('),source.indexOf('    function profileInfo('));
    const apply=source.slice(source.indexOf('    function applyView('),source.indexOf('    async function sync('));
    const c=vm.createContext({protocol:engine.BattleProtocol,user:{id:'guest'},room:{id:'fixture',host_id:'host',host_info:info('kanna'),guest_info:info('mai')},
        GameState:{sentinel:1},pending:null,stopped:false,started:true,connected:true,revision:0,metrics:null,recordedSurrenders:new Set(),
        $:()=>null,controls(){},status(){},fail(e){c.error=e.message;},window:{updateUI(){},addLog(){},prepareMatchFinale(){}},
        localStorage:{getItem(){},setItem(){}},sessionStorage:{removeItem(){}}});
    vm.runInContext(helpers+apply,c);return c;
}
test('actual received-view boundary rejects unknown or mismatched IDs before rewards, effects or UI mutation',()=>{
    for(const state of [null,{}, {characterIds:{player:'mai',cpu:'unknown'}},{characterIds:{player:'mai',cpu:'tsuyoshi'}}]){
        const c=networkRuntime();c.applyView({revision:1,payload:{state}});
        assert.equal(c.error,'CHARACTER_UPDATE_REQUIRED');assert.equal(c.stopped,true);assert.equal(c.GameState.sentinel,1);assert.equal(c.GameState.characterIds,undefined);
    }
    const c=networkRuntime();c.applyView({revision:1,payload:{state:{characterIds:{player:'mai',cpu:'kanna'}}}});
    assert.equal(c.error,undefined);assert.equal(c.GameState.characterIds.cpu,'kanna');
    const old=networkRuntime();delete old.room.guest_info.characterRosterVersion;
    old.applyView({revision:1,payload:{state:{characterIds:{player:'mai',cpu:'kanna'}}}});assert.equal(old.error,'CHARACTER_UPDATE_REQUIRED');
});
test('profile selection, UI gates and cache URLs use one ON switch for PC/mobile without costume protocol fields',()=>{
    const c=runtime(),source=read('network.js');
    const profileFn=source.slice(source.indexOf('    function profileInfo('),source.indexOf('    async function enter('));
    c.protocol=c.BattleProtocol;c.$=()=>null;c.getUserProfile=()=>({});c.getSkillDefinitionByKey=()=>({});c.isPlayableCharacterUnlocked=()=>true;
    vm.runInContext(profileFn,c);
    for(const id of ids){const i=c.profileInfo({favoriteCharacterId:id});assert.equal(i.character,id);assert.equal(i.characterRosterVersion,2);assert.equal(i.costume,undefined);assert.equal(i.costumeId,undefined);c.isPlayableCharacterUnlocked=()=>false;assert.throws(()=>c.profileInfo({favoriteCharacterId:id}),/INVALID_SELECTION/);c.isPlayableCharacterUnlocked=()=>true;}
    c.isPlayableCharacterUnlocked=()=>false;assert.throws(()=>c.profileInfo({favoriteCharacterId:'mai'}),/INVALID_SELECTION/);
    for(const f of ['main.js','mobile/main-sp.js'])assert.match(read(f),/function resetUnsupportedOnlineCharacter[\s\S]*?characters\?\.onlineAllowed\(selection.value\)/);
    for(const f of ['web.html','mobile/mobile.html'])for(const script of ['battle-protocol','network',f==='web.html'?'main':'main-sp'])assert.match(read(f),new RegExp(script+'\\.js\\?v=20261010-u6b'));
    assert.match(source,/battle-engine-worker\.js\?v=20261010-u6b/);
    assert.match(source,/assertCharacterRoom\(fresh\);/);assert.match(source,/assertCharacterState\(latestResult.views\[role\]\?\.state, role\)/);
});
test('actual lobby options expose all eight IDs, owned labels, locked labels and valid favorites under ON',()=>{
    const c=runtime(),source=read('network.js');c.protocol=c.BattleProtocol;c.window=c;
    const options=ids.map(value=>({value,disabled:true,textContent:''}));const selection={options,value:''};
    c.$=()=>selection;
    vm.runInContext(source.slice(source.indexOf('    function refreshCharacterOptions('),source.indexOf('    function assertCharacterState(')),c);
    for(const owned of [false,true]){
        c.isPlayableCharacterUnlocked=id=>ids.indexOf(id)<4||owned;c.refreshCharacterOptions();
        for(const option of options){
            assert.equal(option.disabled,!(ids.indexOf(option.value)<4||owned));
            assert.doesNotMatch(option.textContent,/今後対応予定/);
            assert.equal(option.textContent,c.protocol.characters.names[option.value]+(option.disabled?'：ストーリーCLEARで解放':''));
        }
        const chooseStart=source.indexOf("        $('online-character').value = protocol.characters");
        const choose=source.slice(chooseStart,source.indexOf("        $('online-skill').value =",chooseStart));
        for(const id of [...ids,'unknown']){c.profile={favoriteCharacterId:id};vm.runInContext(choose,c);assert.equal(selection.value,c.isPlayableCharacterUnlocked(id)&&c.protocol.characters.onlineAllowed(id)?id:'chizuru');}
    }
    assert.match(read('battle-engine-worker.js'),/battle-protocol\.js\?v=20261010-u6b/);
});
test('default remote faces and existing skill/Mode art resolve for every ID without changing media',()=>{
    const c=runtime();c.importScripts('battle-images.js');
    c.GameState.storyEpisodeId=null;c.getSelectedCharacterCostume=()=> 'summer';
    for(const id of ids){const face=c.BattleImages.expressionPath(id,'normal','assets/','cpu').split('?')[0];
        assert.match(face,new RegExp('/'+id+'-normal-alpha\\.webp$'));assert.equal(fs.existsSync(path.join(root,face)),true);
        for(const suffix of ['skill-cutin','battle-mode-cutin'])assert.equal(fs.existsSync(path.join(root,'assets/images/'+(suffix==='skill-cutin'?'skill-cutins/':'battle-mode-cutins/')+id+'-'+suffix+'.png')),true,id+'/'+suffix);
    }
});
test('SQL guard is identical to Unity migration and blocks at room membership, including cached-client guidance',()=>{
    const sql=read('supabase/battle-character-compat.sql');
    const unity=path.resolve(root,'../battle-a-la-carte - ギットハブ版 -ユニティ改/battle-a-la-carte/supabase/migrations/006_balc_character_compat.sql');
    // The Unity copy is absent in the publish layout; only this byte comparison is then skipped.
    if(fs.existsSync(unity))assert.equal(sql,fs.readFileSync(unity,'utf8'));
    assert.match(sql,/before insert or update of host_info,guest_info,guest_id/);
    assert.match(sql,/not balc_private.has_eight_characters\(new.host_info\)/);
    assert.match(sql,/new.guest_id is not null and not balc_private.has_eight_characters\(new.guest_info\)/);
    assert.match(sql,/message='ENGINE_ERROR'/);assert.match(sql,/最新版に更新してください/);
    assert.match(read('network.js'),/ENGINE_ERROR: 'キャラクター表示に対応した最新版に更新してください/);
});
