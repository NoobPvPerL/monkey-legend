import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGame,dispatch} from '../../packages/game-core/src/index';
const databaseReady=(h:any)=>h.ok===true&&h.engineRevision===14&&h.classicPatchReady===true&&h.versionedDataReady===true;
const migration=await readFile('database/migrations/014_classic_feedback_patch.sql','utf8');
const atomic=(sql:string)=>`DO $outer$ BEGIN EXECUTE $payload$${sql}$payload$; END $outer$;`;
it('014 atomically upgrades, reapplies without changing prior profiles/rooms/receipts, and authenticates the new game flow',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;');
  for(const f of (await readdir('database/migrations')).filter(f=>Number(f.slice(0,3))<=13).sort())await db.exec(await readFile('database/migrations/'+f,'utf8'));
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$select 1000::bigint$$;');
  const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
  const people=Array.from({length:4},(_,i)=>({name:'补丁联机'+i,token:String(i+1).repeat(64),epoch:1}));
  const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...people[a],op,...extra})]);
  const intake={op:'create',name:people[0].name,token:people[0].token,requestId:'initial'};
  const first=await q('select public.ml_room($1::jsonb) v',[JSON.stringify(intake)]);const roomId=first.snapshot.roomId;
  for(let i=1;i<4;i++)expect((await call(i,'join',{code:first.snapshot.code,requestId:'join'})).ok).toBe(true);
  const rows=await db.query('select * from ml_private.rooms'),profiles=await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' order by key");
  const oldStates=['web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4'].map(ruleVersion=>createGame({mode:'ffa',ruleVersion:ruleVersion as any,seed:42,seats:[0,1,2,3],first:0},1000));
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);
  expect(await q("select to_regprocedure('ml_private.cave_ending(jsonb,integer)') v")).toBeNull();expect((await q('select public.ml_health() v')).engineRevision).toBe(12);
  expect(await db.query('select * from ml_private.rooms')).toEqual(rows);
  await db.query(atomic(migration));await db.query(atomic(migration));expect(await db.query('select * from ml_private.rooms')).toEqual(rows);
  expect(await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' and key<>'ruleset:web-v0.1.5' order by key")).toEqual(profiles);
  expect((await q('select public.ml_room($1::jsonb) v',[JSON.stringify(intake)])).duplicate).toBe(true);
  expect(databaseReady(await q('select public.ml_health() v'))).toBe(true);
  for(const old of oldStates){const cmd={id:'old-tick',actor:old.active,revision:old.revision,type:'tick' as const};expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(old),JSON.stringify(cmd)])).toEqual(dispatch(old,cmd,61000));}
  for(let i=0;i<4;i++){const v=(await call(i,'view',{roomId})).snapshot;expect((await call(i,'ready',{roomId,requestId:'ready',roomRevision:v.roomRevision,ready:true})).ok).toBe(true);}
  const lobby=(await call(0,'view',{roomId})).snapshot,started=await call(0,'start',{roomId,requestId:'start',roomRevision:lobby.roomRevision});expect(started.ok,started.error).toBe(true);expect(started.snapshot.game.version).toBe('web-v0.1.5');
  expect(started.snapshot.code).toBe(first.snapshot.code);expect(started.snapshot.members.map((p:any)=>p.name)).toEqual(people.map(p=>p.name));
  const actor=started.snapshot.game.choice?.actor??started.snapshot.game.active,p=people[actor],intent=started.snapshot.game.choice?{type:'choose',choice:started.snapshot.game.choice.id,accept:false}:{type:'end'};
  const request={...p,roomId,op:'game',requestId:'one-action',matchId:started.snapshot.matchId,revision:0,intent};
  const applied=await q('select public.ml_room($1::jsonb) v',[JSON.stringify(request)]);expect(applied.ok,applied.error).toBe(true);expect((await q('select public.ml_room($1::jsonb) v',[JSON.stringify(request)])).duplicate).toBe(true);
  const injected=await call(actor,'game',{roomId,requestId:'forged-first',matchId:started.snapshot.matchId,revision:applied.snapshot.game.revision,intent:{type:'end',first:0}});expect(injected.ok).toBe(false);
  await db.exec('begin');await db.exec("update ml_private.catalog set value=jsonb_set(value,'{environment,poisonRegionCount}','10') where key='ruleset:web-v0.1.5'");expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);await db.exec('rollback');
  await db.exec('begin');await db.exec("update ml_private.catalog set value=value-'characterTraits' where key='ruleset:web-v0.1.5'");expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);await db.exec('rollback');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const sql of ["select ml_private.cave_ending('{}',0)","select ml_private.character_effect_allowed('{}',0,'character-026')","select * from ml_private.catalog"])await expect(db.query(sql)).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
},30000);
it('keeps previously delivered 012 and 013 byte-identical',async()=>{
 for(const [file,sha] of Object.entries({'012_classic_rules.sql':'70f9968f124342340d88f03ccde9b7aab71ff853716b4594f856469a038dbea0','013_draft_foundation.sql':'27fe642f255159e4e0548c194d47e08b1a1e15d9ac438b5e16f8970c3a0e82f0'}))expect(createHash('sha256').update(await readFile('database/migrations/'+file)).digest('hex')).toBe(sha);
});
