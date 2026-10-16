// Dedicated test process; never packaged with the database migrations.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
const [stage,path]=process.argv.slice(2);const db=new PGlite(path);await db.waitReady;
const name=i=>'持久测试'+i,token=i=>String(i+1).repeat(64);
const call=async request=>(await db.query('select public.ml_room($1::jsonb) v',[JSON.stringify(request)])).rows[0].v;
if(stage==='init'){
 await db.exec('create role anon; create role authenticated;');for(const f of (await readdir('database/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile('database/migrations/'+f,'utf8'));
 await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$ select 1000000::bigint $$;');
 let first=await call({op:'create',name:name(0),token:token(0),requestId:'create'});if(!first.ok)throw Error(first.error);const roomId=first.snapshot.roomId;
 for(let i=1;i<4;i++){const r=await call({op:'join',name:name(i),token:token(i),requestId:'join',code:first.snapshot.code});if(!r.ok)throw Error(r.error);}
 const base=i=>({name:name(i),token:token(i),roomId,epoch:1});
 for(let i=0;i<4;i++){const s=(await call({...base(i),op:'view'})).snapshot;const r=await call({...base(i),op:'ready',requestId:'ready',roomRevision:s.roomRevision,ready:true});if(!r.ok)throw Error(r.error);}
 const s=(await call({...base(0),op:'view'})).snapshot;first=await call({...base(0),op:'start',requestId:'start',roomRevision:s.roomRevision});if(!first.ok)throw Error(first.error);
 const digest=(await db.query("select encode(sha256(convert_to(game::text,'UTF8')),'hex') digest from ml_private.rooms where id=$1",[roomId])).rows[0].digest;
 console.log(JSON.stringify({snapshot:first.snapshot,digest}));
}else{
 const at=stage==='late'?4600000:1005000;
 await db.exec(`create or replace function ml_private.now_ms() returns bigint language sql as $$ select ${at}::bigint $$;`);
 const roomId=(await db.query("select id from ml_private.rooms where status<>'closed' limit 1")).rows[0].id;
 const r=await call({op:'resume',name:name(0),token:token(0),roomId});if(!r.ok)throw Error(r.error);
 const digest=(await db.query("select encode(sha256(convert_to(game::text,'UTF8')),'hex') digest from ml_private.rooms where id=$1",[roomId])).rows[0].digest;
 console.log(JSON.stringify({snapshot:r.snapshot,digest}));
}
await db.close();
