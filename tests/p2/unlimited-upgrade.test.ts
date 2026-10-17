import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
it('009 is atomic and repeatable; an existing v0.1.2 match stays unchanged and rematch uses v0.1.3',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated;');
  for(const name of (await readdir('database/migrations')).filter(f=>/^00[0-8]_.*\.sql$/.test(f)).sort())await db.exec(await readFile('database/migrations/'+name,'utf8'));
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$ select 1000000::bigint $$;');
  const call=async(p:Record<string,unknown>)=>(await db.query<any>('select public.ml_room($1::jsonb) v',[JSON.stringify(p)])).rows[0].v;
  const people=Array.from({length:4},(_,i)=>({name:'不限攻击'+i,token:String(i+1).repeat(64),epoch:1}));
  const first=(await call({...people[0],op:'create',requestId:'create'})).snapshot,roomId=first.roomId;
  for(const p of people.slice(1))expect((await call({...p,op:'join',code:first.code,requestId:'join'})).ok).toBe(true);
  const start=async(prefix:string)=>{for(const p of people){const s=(await call({...p,roomId,op:'view'})).snapshot;expect((await call({...p,roomId,op:'ready',requestId:prefix+'ready',ready:true,roomRevision:s.roomRevision})).ok).toBe(true);}const s=(await call({...people[0],roomId,op:'view'})).snapshot;return (await call({...people[0],roomId,op:'start',requestId:prefix+'start',roomRevision:s.roomRevision})).snapshot;};
  expect((await start('before-')).game.version).toBe('web-v0.1.2');
  const before=(await db.query<any>('select game,members,match_id from ml_private.rooms where id=$1',[roomId])).rows[0];
  const sql=await readFile('database/migrations/009_unlimited_attacks.sql','utf8'),one=(body:string)=>`DO $outer$ BEGIN EXECUTE $payload$${body}$payload$; END $outer$;`;
  await expect(db.query(one(sql+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await db.query<any>('select public.ml_health() v')).rows[0].v.engineRevision).toBe(8);
  await db.query(one(sql));await db.query(one(sql));expect((await db.query<any>('select game,members,match_id from ml_private.rooms where id=$1',[roomId])).rows[0]).toEqual(before);
  const health=(await db.query<any>('select public.ml_health() v')).rows[0].v;expect(health).toMatchObject({engineRevision:9,ruleVersion:'web-v0.1.3',feedbackRulesReady:true});
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$ select 4600000::bigint $$;');
  expect((await call({...people[0],roomId,op:'view'})).snapshot.status).toBe('finished');const next=await start('after-');expect(next.game.version).toBe('web-v0.1.3');expect(next.code).toBe(first.code);expect(next.matchId).not.toBe(before.match_id);
 }finally{await db.close();}
},30000);
