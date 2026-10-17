import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {databaseReady as currentDatabaseReady,STAGE3_DATABASE_REQUIREMENT} from '../../packages/online/src/version';
// This suite validates the frozen stage-three readiness contract.
const databaseReady=(health:unknown)=>currentDatabaseReady(health,STAGE3_DATABASE_REQUIREMENT);
const migration=await readFile('database/migrations/016_stage3_release.sql','utf8');
const atomic=(sql:string)=>`DO $outer$ BEGIN EXECUTE $payload$${sql}$payload$; END $outer$;`;
it('016 promotes the full engine atomically, preserves old matches/profiles/receipts and can reapply during an outstanding draft',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;');
  // The previously delivered stage-two package omitted 013. 016 includes the
  // foundation, so it must not depend on an unreleased cloud migration.
  for(const f of (await readdir('database/migrations')).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<=15&&!f.startsWith('013_')).sort())await db.exec(await readFile('database/migrations/'+f,'utf8'));
  const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$select 1000::bigint$$;');
  const ps=Array.from({length:4},(_,i)=>({name:'正式迁移'+i,token:String(i+1).repeat(64),epoch:1}));
  const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...ps[a],op,...extra})]);
  const intake={requestId:'initial'},first=await call(0,'create',intake),roomId=first.snapshot.roomId;
  for(let a=1;a<4;a++)expect((await call(a,'join',{code:first.snapshot.code,requestId:'join'})).ok).toBe(true);
  for(let a=0;a<4;a++){const v=(await call(a,'view',{roomId})).snapshot;expect((await call(a,'ready',{roomId,requestId:'ready',roomRevision:v.roomRevision,ready:true})).ok).toBe(true);}
  const lobby=(await call(0,'view',{roomId})).snapshot;
  expect((await call(0,'start',{roomId,requestId:'old-start',roomRevision:lobby.roomRevision})).snapshot.game.version).toBe('web-v0.1.5');
  const before=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[roomId]);
  const profiles=await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' order by key");
  const states=['web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5'].map(ruleVersion=>createGame({mode:'ffa',ruleVersion:ruleVersion as any,seed:42,seats:[0,1,2,3],first:0},1000));
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);
  expect(await q("select exists(select 1 from information_schema.columns where table_schema='ml_private' and table_name='rooms' and column_name='draft') v")).toBe(false);
  expect((await q('select public.ml_health() v')).engineRevision).toBe(14);expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);
  await db.query(atomic(migration));await db.query(atomic(migration));
  expect(await q("select to_jsonb(r)-'draft' v from ml_private.rooms r where id=$1",[roomId])).toEqual(before);
  expect(await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' and key<>'ruleset:web-v0.1.6' order by key")).toEqual(profiles);
  expect((await call(0,'create',intake)).duplicate).toBe(true);expect(databaseReady(await q('select public.ml_health() v'))).toBe(true);
  for(const state of states){const cmd={id:'legacy-recovery',actor:state.active,revision:state.revision,type:'tick' as const};expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(state),JSON.stringify(cmd)])).toEqual(dispatch(state,cmd,61000));}
  // A second room starts with the new authoritative draft, not a placeholder game.
  ps.forEach((p,i)=>{p.name+='新';p.token=String(i+5).repeat(64);});
  const second=await call(0,'create',{requestId:'second'}),newId=second.snapshot.roomId;
  for(let a=1;a<4;a++)expect((await call(a,'join',{code:second.snapshot.code,requestId:'second'})).ok).toBe(true);
  for(let a=0;a<4;a++){const v=(await call(a,'view',{roomId:newId})).snapshot;expect((await call(a,'ready',{roomId:newId,requestId:'second-ready',roomRevision:v.roomRevision,ready:true})).ok).toBe(true);}
  const ready=(await call(0,'view',{roomId:newId})).snapshot,started=await call(0,'start',{roomId:newId,requestId:'second-start',roomRevision:ready.roomRevision});expect(started.ok,started.error).toBe(true);expect(started.snapshot.status).toBe('drafting');
  const draft=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[newId]);await db.query(atomic(migration));expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[newId])).toEqual(draft);
  await db.exec('begin');await db.exec("update ml_private.catalog set value=value-'characterTraits' where key='ruleset:web-v0.1.6'");expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);await db.exec('rollback');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);expect(databaseReady(await q('select public.ml_health() v'))).toBe(true);for(const sql of ["select ml_private.stage3_content()","select ml_private.stage3_play('{}','{}',0)","select draft from ml_private.rooms","select ml_private.stage3_create_draft('ffa','{}',0)"])await expect(db.query(sql)).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
},30000);
