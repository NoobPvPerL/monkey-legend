import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {fixture,give} from './p3-fixture';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {databaseReady} from '../../packages/online/src/version';
const databaseReadyE=(health:unknown)=>databaseReady(health,{ruleVersion:'web-v0.1.16',engineRevision:27,stage4:true});
const atomic=(sql:string)=>`DO $d_outer$ BEGIN EXECUTE $d_body$${sql}$d_body$;END $d_outer$;`;
it('026→027 rolls back, repeats safely, preserves saved v1-v15 and drafts, and public RPC owns E movement/retries',async()=>{
 const db=await database(undefined,26);try{
 const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const players=Array.from({length:4},(_,i)=>({name:'D隔离'+i,token:String(i+1).repeat(64),epoch:1}));
 const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...players[a],op,...extra})]);
 const first=await call(0,'create',{requestId:'d-create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:'d-join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const s=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:'d-ready',roomRevision:s.roomRevision,ready:true})).ok).toBe(true);}
 const v=(await call(0,'view',{roomId:id})).snapshot,started=await call(0,'start',{roomId:id,requestId:'d-start',roomRevision:v.roomRevision});expect(started.ok).toBe(true);
 const room=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id]),intakes=await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p'),profiles=await db.query('select key,value from ml_private.catalog order by key');expect(room.draft.catalogVersion).toBe('web-v0.1.15');
 const migration=await readFile('database/migrations/027_p3_batch_e.sql','utf8');expect(databaseReadyE(await q('select public.ml_health() v'))).toBe(false);
 await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(26);
 await db.query(atomic(migration));await db.query(atomic(migration));expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id])).toEqual(room);expect(await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p')).toEqual(intakes);expect(await db.query("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.16' order by key")).toEqual(profiles);
 const health=await q('select public.ml_health() v');expect(health).toMatchObject({engineRevision:27,ruleVersion:'web-v0.1.16',characterDefinitions:27,batchEReady:true,batchDReady:true,batchCReady:true,potatoRulesReady:true,p3CharactersReady:true,yinghaoRulesReady:true});expect(databaseReadyE(health)).toBe(true);for(const key of ['batchEReady','batchDReady','batchCReady','potatoRulesReady','p3CharactersReady','yinghaoRulesReady'])expect(databaseReadyE({...health,[key]:false})).toBe(false);
 for(let n=1;n<=15;n++){const version=('web-v0.1.'+n) as ReturnType<typeof createGame>['version'],s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0},1000),cmd={id:'d-resume',revision:s.revision,actor:s.active,type:'tick' as const};const actual=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(s),JSON.stringify(cmd)]),expected=dispatch(s,cmd,61000);expect(actual.ok).toBe(expected.ok);expect(actual.state).toEqual(expected.state);expect(actual.state.stage3?.e).toBeUndefined();}
 for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[id]);expect((await call(d.offer.actor,'draft-pick',{roomId:id,requestId:'d-old-pick-'+i,matchId:started.snapshot.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]})).ok).toBe(true);}
 expect((await call(0,'view',{roomId:id})).snapshot.game.version).toBe('web-v0.1.15');
 const install=async(s:ReturnType<typeof fixture>)=>db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(s)]);
 const packet=async(a:number,intent:unknown,requestId:string,revision?:number)=>{const v=(await call(a,'view',{roomId:id})).snapshot;return call(a,'game',{roomId:id,requestId,matchId:v.matchId,revision:revision??v.game.revision,intent});};
 let s=fixture('web-v0.1.16',['character-014','character-016','character-024','character-038']);await install(s);
 expect((await packet(1,{type:'skill',kind:'gas'},'e-wrong')).ok).toBe(false);
 const gasIntent={type:'skill',kind:'gas'},gas=await packet(0,gasIntent,'e-gas',s.revision);expect(gas.ok,gas.error).toBe(true);expect(gas.snapshot.game.players[0].ap).toBe(19);expect(gas.snapshot.game.choice.kind).toBe('move-consent');
 expect((await packet(0,gasIntent,'e-gas',s.revision)).duplicate).toBe(true);expect((await packet(0,gasIntent,'e-stale',s.revision)).ok).toBe(false);
 const c=gas.snapshot.game.choice,reply={type:'choose',choice:c.id,accept:false};expect((await packet(0,reply,'e-forged')).ok).toBe(false);
 const refused=await packet(1,reply,'e-refuse',gas.snapshot.game.revision);expect(refused.ok,refused.error).toBe(true);expect(refused.snapshot.game.players[1].cell).toBe(s.players[1].cell);expect((await packet(1,reply,'e-refuse',gas.snapshot.game.revision)).duplicate).toBe(true);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query("select ml_private.p3e_skill($1::jsonb,0,'gas',null)",[JSON.stringify(s)])).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 const verification=await db.exec(await readFile('tests/p2/fixtures/verify-revision27.sql','utf8'));for(const result of verification)for(const row of result.rows)for(const [key,value] of Object.entries(row))if(key.endsWith('_ready'))expect(value,key).toBe(true);
 }finally{await db.close();}
},30000);
