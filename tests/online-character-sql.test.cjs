const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let PGlite;try{({PGlite}=require(process.env.BALC_PGLITE_PATH||path.join(os.tmpdir(),'balc-sql-test/node_modules/@electric-sql/pglite')));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('room trigger enforces capability before old clients receive room info; legacy rooms and aborted joins survive', {skip:!PGlite?'offline PGlite is unavailable; Claude must execute before U6b':false},async()=>{
    const db=new PGlite();try{
        await db.exec("create role anon;create role authenticated;create schema balc_private;create table public.battle_rooms(id serial primary key,host_info jsonb,guest_info jsonb,guest_id uuid,status text default 'waiting');");
        const sql=fs.readFileSync(path.join(__dirname,'../supabase/battle-character-compat.sql'),'utf8');await db.exec(sql);await db.exec(sql);
        const info=(character,cap)=>({character,...(cap?{characterRosterVersion:2}:{})});
        for(const id of ['chizuru','mai','takumi','akatsuki','kanna','tsuyoshi','yuzuki','ryuta'])for(const hostCap of [false,true])for(const guestCap of [false,true]){
            const newId=['kanna','tsuyoshi','yuzuki','ryuta'].includes(id);
            const insert=()=>db.query('insert into public.battle_rooms(host_info) values($1) returning id',[info(id,hostCap)]);
            if(newId&&!hostCap){await assert.rejects(insert(),/ENGINE_ERROR/);continue;}
            const room=(await insert()).rows[0];
            const join=()=>db.query("update public.battle_rooms set guest_info=$1,guest_id='11111111-1111-4111-8111-111111111111',status='playing' where id=$2 returning *",[info('mai',guestCap),room.id]);
            if(newId&&!guestCap){await assert.rejects(join(),e=>e.message.includes('ENGINE_ERROR')&&e.detail.includes('最新版に更新してください'));const unchanged=(await db.query('select guest_id,status from public.battle_rooms where id=$1',[room.id])).rows[0];assert.equal(unchanged.guest_id,null);assert.equal(unchanged.status,'waiting');}
            else assert.equal((await join()).rows[0].status,'playing');
            // Reverse host/guest boundary (old host + new guest).
            const r=(await db.query('insert into public.battle_rooms(host_info) values($1) returning id',[info('mai',hostCap)])).rows[0];
            const reverse=()=>db.query("update public.battle_rooms set guest_info=$1,guest_id='11111111-1111-4111-8111-111111111111' where id=$2",[info(id,guestCap),r.id]);
            if(newId&&(!hostCap||!guestCap))await assert.rejects(reverse(),/ENGINE_ERROR/);else await reverse();
        }
        for(const cap of ['2',true,null,{},[],1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(db.query('insert into public.battle_rooms(host_info) values($1)',[{character:'kanna',characterRosterVersion:cap}]),/ENGINE_ERROR/);
        await assert.rejects(db.query('insert into public.battle_rooms(host_info) values($1)',[info('unknown',true)]),/INVALID_SELECTION/);
        await db.query("insert into public.battle_rooms(host_info) values('{}')");
    }finally{await db.close();}
});
