import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {fixture,give} from './p3-fixture';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {databaseReady as currentReady} from '../../packages/online/src/version';
const databaseReady=(health:unknown)=>currentReady(health,{ruleVersion:'web-v0.1.12',engineRevision:23,stage4:true});
const atomic=(s:string)=>`DO $p3_outer$ BEGIN EXECUTE $p3_body$${s}$p3_body$;END $p3_outer$;`;
it('21→22→23 is atomic, repeatable, private, preserves every historical profile/game and completes old drafts unchanged',async()=>{
 const db=await database(undefined,21);try{
 const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const players=Array.from({length:4},(_,i)=>({name:'P3isolated'+i,token:String(i+1).repeat(64),epoch:1}));
 const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...players[a],op,...extra})]);
 const first=await call(0,'create',{requestId:'p3-create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:'p3-join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const s=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:'p3-ready',roomRevision:s.roomRevision,ready:true})).ok).toBe(true);}
 const snap=(await call(0,'view',{roomId:id})).snapshot,started=await call(0,'start',{roomId:id,requestId:'p3-start',roomRevision:snap.roomRevision});expect(started.ok).toBe(true);
 const roomBefore=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id]),identities=await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p');
 expect(roomBefore.draft.catalogVersion).toBe('web-v0.1.10');const catalogs=await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' order by key");
 expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);
 for(const [file,revision] of [['022_p3_yinghao_rules.sql',22],['023_p3_characters.sql',23]] as const){const migration=await readFile('database/migrations/'+file,'utf8');
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(revision-1);
  await db.query(atomic(migration));await db.query(atomic(migration));expect((await q('select public.ml_health() v')).engineRevision).toBe(revision);expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id])).toEqual(roomBefore);expect(await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p')).toEqual(identities);
  expect(databaseReady(await q('select public.ml_health() v'))).toBe(revision===23);
 }
 expect(await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' and key not in ('ruleset:web-v0.1.11','ruleset:web-v0.1.12') order by key")).toEqual(catalogs);
 for(const version of ['web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5','web-v0.1.6','web-v0.1.7','web-v0.1.8','web-v0.1.9','web-v0.1.10'] as const){const s=createGame({mode:'ffa',seed:42,seats:[0,1,2,3],ruleVersion:version,first:0},1000),cmd={id:'resume-p3',revision:s.revision,actor:s.active,type:'tick' as const};const actual=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(s),JSON.stringify(cmd)]),expected=dispatch(s,cmd,61000);expect(actual.ok).toBe(expected.ok);expect(actual.state).toEqual(expected.state);}
 for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[id]);expect((await call(d.offer.actor,'draft-pick',{roomId:id,requestId:'old-pick-'+i,matchId:started.snapshot.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]})).ok).toBe(true);}
 expect((await call(0,'view',{roomId:id})).snapshot.game.version).toBe('web-v0.1.10');
 // Owner-only synthetic fixture in isolated memory; no injection API is exposed.
 const install=async(s:ReturnType<typeof fixture>)=>db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(s)]);
 const packet=async(a:number,intent:unknown,requestId:string,revision?:number)=>{const v=(await call(a,'view',{roomId:id})).snapshot;return call(a,'game',{roomId:id,requestId,matchId:v.matchId,revision:revision??v.game.revision,intent});};
 let s=fixture('web-v0.1.12',['character-025','character-048','character-027','character-026'],'team');s.players[0].hp=2;s.players[2].hp=2;await install(s);
 const beforeView=(await call(0,'view',{roomId:id})).snapshot;expect(beforeView.game.actions.stage3.mayi.targets).toEqual([0,2]);expect((await packet(1,{type:'skill',kind:'mayi'},'wrong-actor')).ok).toBe(false);
 const requestId='mayi-once',healed=await packet(0,{type:'skill',kind:'mayi'},requestId,s.revision);expect(healed.ok,healed.error).toBe(true);expect(healed.snapshot.game.players[0]).toMatchObject({hp:3,ap:17});
 expect((await packet(0,{type:'skill',kind:'mayi'},requestId,s.revision)).duplicate).toBe(true);expect((await packet(0,{type:'skill',kind:'mayi'},'stale',s.revision)).ok).toBe(false);expect((await call(0,'view',{roomId:id})).snapshot.game.players[0].ap).toBe(17);
 s=fixture('web-v0.1.12',['character-048','character-045','character-027','character-026']);give(s,0,'basic-010#01');s.random.dice=[1];await install(s);expect((await packet(0,{type:'play',card:'basic-010#01',targets:[1]},'immune-target')).ok).toBe(false);expect((await call(0,'view',{roomId:id})).snapshot.game.players[0].ap).toBe(20);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3_mayi_targets($1::jsonb,0)',[JSON.stringify(s)])).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 const roomBefore24=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id]),intakesBefore24=await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p');
 await db.exec(await readFile('database/migrations/024_p3_potato_teleport.sql','utf8'));expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id])).toEqual(roomBefore24);expect(await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p')).toEqual(intakesBefore24);
 await db.exec(await readFile('tests/p2/fixtures/verify-revision24.sql','utf8'));
 }finally{await db.close();}
});
