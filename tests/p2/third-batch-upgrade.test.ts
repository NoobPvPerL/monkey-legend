import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {CLASSIC_CELLS} from '../../packages/game-data/src/classic-map';
const databaseReady=(health:any)=>health.ok===true&&health.schemaVersion===2&&health.engineRevision===8&&health.feedbackRulesReady===true;
it('detects an omitted rule patch, upgrades atomically, and preserves the running match on repeat',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated;');
  const files=(await readdir('database/migrations')).filter(f=>/^00[0-6]_.*\.sql$/.test(f)).sort();
  for(const file of files)await db.exec(await readFile('database/migrations/'+file,'utf8'));
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$ select 1000000::bigint $$;');
  const call=async(p:Record<string,unknown>)=>(await db.query<any>('select public.ml_room($1::jsonb) v',[JSON.stringify(p)])).rows[0].v;
  const players=Array.from({length:4},(_,i)=>({name:'第三批'+i,token:String(i+1).repeat(64),epoch:1}));
  const created=await call({...players[0],op:'create',requestId:'create'}),roomId=created.snapshot.roomId,code=created.snapshot.code;
  for(const p of players.slice(1))expect((await call({...p,op:'join',code,requestId:'join'})).ok).toBe(true);
  for(const p of players){const v=await call({...p,roomId,op:'view'});expect((await call({...p,roomId,op:'ready',requestId:'ready',ready:true,roomRevision:v.snapshot.roomRevision})).ok).toBe(true);}
  const v=await call({...players[0],roomId,op:'view'});expect((await call({...players[0],roomId,op:'start',requestId:'start',roomRevision:v.snapshot.roomRevision})).ok).toBe(true);
  const before=(await db.query<any>('select game,members,match_id from ml_private.rooms where id=$1',[roomId])).rows[0];
  const health=async()=>(await db.query<any>('select public.ml_health() v')).rows[0].v;
  expect(databaseReady(await health())).toBe(false);
  const patch=await readFile('database/migrations/007_feedback_rules.sql','utf8'),upgrade=await readFile('database/migrations/008_feedback_diagnostics.sql','utf8');
  const one=(sql:string)=>`DO $outer$ BEGIN EXECUTE $payload$${sql}$payload$; END $outer$;`;
  await expect(db.query(one(upgrade))).rejects.toThrow(/Apply 007/);
  expect((await db.query<any>("select value from ml_private.catalog where key='classicLayout'")).rows).toHaveLength(0);
  await expect(db.query(one(patch+'\n'+upgrade+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect(databaseReady(await health())).toBe(false);
  await db.query(one(patch+'\n'+upgrade));expect(databaseReady(await health())).toBe(true);
  expect((await db.query<any>("select value from ml_private.catalog where key='classicLayout'")).rows[0].value).toEqual(CLASSIC_CELLS);
  await db.query(one(upgrade));expect((await db.query<any>('select game,members,match_id from ml_private.rooms where id=$1',[roomId])).rows[0]).toEqual(before);
  await db.exec('set role anon');expect(databaseReady(await health())).toBe(true);await expect(db.query('select ml_private.resolve_attack($1::jsonb)',['{}'])).rejects.toThrow(/permission denied/);
 }finally{await db.close();}
},30000);
