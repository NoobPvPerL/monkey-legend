import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
it('incremental owner upgrade is atomic, preserves an existing old-rule match, and reapplies without replacing identities',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated;');
  const files=(await readdir('database/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>/^00[0-4]_/.test(f)))await db.exec(await readFile('database/migrations/'+file,'utf8'));
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$ select 1000000::bigint $$;');
  const call=async(p:any)=>(await db.query<{v:any}>('select public.ml_room($1::jsonb) v',[JSON.stringify(p)])).rows[0].v;
  const people=Array.from({length:4},(_,i)=>({name:'升级'+i,token:String(i+1).repeat(64),epoch:1}));
  const created=await call({...people[0],op:'create',requestId:'create'}),roomId=created.snapshot.roomId;
  for(let i=1;i<4;i++)expect((await call({...people[i],op:'join',code:created.snapshot.code,requestId:'join'})).ok).toBe(true);
  for(const p of people){const v=await call({...p,roomId,op:'view'});expect((await call({...p,roomId,op:'ready',requestId:'ready',roomRevision:v.snapshot.roomRevision,ready:true})).ok).toBe(true);}
  const v=await call({...people[0],roomId,op:'view'}),started=await call({...people[0],roomId,op:'start',requestId:'start',roomRevision:v.snapshot.roomRevision});expect(started.snapshot.game.version).toBe('web-v0.1.1');
  const before=(await db.query<any>('select game,members,match_id from ml_private.rooms where id=$1',[roomId])).rows[0];
  const upgrade=(await Promise.all(files.filter(f=>/^00[567]_/.test(f)).map(f=>readFile('database/migrations/'+f,'utf8')))).join('\n');
  await expect(db.query(`DO $outer$ BEGIN EXECUTE $payload$${upgrade}\nselect 1/0;$payload$; END $outer$;`)).rejects.toThrow(/division by zero/);
  expect((await db.query<any>('select public.ml_health() v')).rows[0].v.schemaVersion).toBe(1);expect((await db.query<any>("select to_regclass('ml_private.spectators') v")).rows[0].v).toBeNull();
  const one=`DO $outer$ BEGIN EXECUTE $payload$${upgrade}$payload$; END $outer$;`;await db.query(one);
  expect((await db.query<any>('select game,members,match_id from ml_private.rooms where id=$1',[roomId])).rows[0]).toEqual(before);
  expect((await db.query<any>('select public.ml_health() v')).rows[0].v.schemaVersion).toBe(2);
  const request={op:'join',code:created.snapshot.code,name:'升级观众',token:'c'.repeat(64),requestId:'watch'};
  const viewer=(await db.query<any>('select public.ml_watch($1::jsonb) v',[JSON.stringify(request)])).rows[0].v;expect(viewer.ok,viewer.error).toBe(true);
  await db.query(one);const retry=(await db.query<any>('select public.ml_watch($1::jsonb) v',[JSON.stringify(request)])).rows[0].v;expect(retry.snapshot.memberId).toBe(viewer.snapshot.memberId);
 }finally{await db.close();}
},30000);
