import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {fixture} from './p3-fixture';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {databaseReady} from '../../packages/online/src/version';
const ready=(health:unknown)=>databaseReady(health,{ruleVersion:'web-v0.1.17',engineRevision:28,stage4:true});
const atomic=(sql:string)=>`DO $f_outer$ BEGIN EXECUTE $f_body$${sql}$f_body$;END $f_outer$;`;
it('027→028 is atomic/repeatable, preserves every saved version/draft, and public RPC owns F damage choices and retry protection',async()=>{
 const db=await database(undefined,27);try{
 const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const players=Array.from({length:4},(_,i)=>({name:'F隔离'+i,token:String(i+1).repeat(64),epoch:1})),call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...players[a],op,...extra})]);
 const first=await call(0,'create',{requestId:'f-create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:'f-join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const s=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:'f-ready',roomRevision:s.roomRevision,ready:true})).ok).toBe(true);}
 const view=(await call(0,'view',{roomId:id})).snapshot,started=await call(0,'start',{roomId:id,requestId:'f-start',roomRevision:view.roomRevision});expect(started.ok).toBe(true);
 const room=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id]),profiles=await db.query('select key,value from ml_private.catalog order by key');expect(room.draft.catalogVersion).toBe('web-v0.1.16');
 const migration=await readFile('database/migrations/028_p3_batch_f.sql','utf8');expect(ready(await q('select public.ml_health() v'))).toBe(false);
 await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(27);
 await db.query(atomic(migration));await db.query(atomic(migration));expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id])).toEqual(room);expect(await db.query("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.17' order by key")).toEqual(profiles);
 const health=await q('select public.ml_health() v');expect(health).toMatchObject({engineRevision:28,ruleVersion:'web-v0.1.17',characterDefinitions:35,batchFReady:true,batchEReady:true});expect(ready(health)).toBe(true);for(const key of ['batchFReady','batchEReady','batchDReady','batchCReady','potatoRulesReady','p3CharactersReady','yinghaoRulesReady'])expect(ready({...health,[key]:false})).toBe(false);
 for(let n=1;n<=16;n++){const version=('web-v0.1.'+n) as ReturnType<typeof createGame>['version'],s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0},1000),cmd={id:'f-old',revision:s.revision,actor:s.active,type:'tick' as const};const actual=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(s),JSON.stringify(cmd)]),expected=dispatch(s,cmd,61000);expect(actual.ok).toBe(expected.ok);expect(actual.state).toEqual(expected.state);expect(actual.state.stage3?.f).toBeUndefined();}
 for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[id]);expect((await call(d.offer.actor,'draft-pick',{roomId:id,requestId:'f-old-pick-'+i,matchId:started.snapshot.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]})).ok).toBe(true);}expect((await call(0,'view',{roomId:id})).snapshot.game.version).toBe('web-v0.1.16');
 const s=fixture('web-v0.1.17',['character-052','character-051','character-019','character-007']);s.players[1].cell='r3c4';await db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(s)]);
 const packet=async(a:number,intent:unknown,requestId:string,revision?:number)=>{const v=(await call(a,'view',{roomId:id})).snapshot;return call(a,'game',{roomId:id,requestId,matchId:v.matchId,revision:revision??v.game.revision,intent});};
 expect((await packet(1,{type:'skill',kind:'magma'},'f-wrong')).ok).toBe(false);const magma=await packet(0,{type:'skill',kind:'magma'},'f-magma',s.revision);expect(magma.ok,magma.error).toBe(true);expect(magma.snapshot.game.choice.kind).toBe('f-tenacity');expect((await packet(0,{type:'skill',kind:'magma'},'f-magma',s.revision)).duplicate).toBe(true);expect((await packet(0,{type:'skill',kind:'magma'},'f-stale',s.revision)).ok).toBe(false);
 const c=magma.snapshot.game.choice,reply={type:'choose',choice:c.id,option:'1'};expect((await packet(0,reply,'f-forged')).ok).toBe(false);const absorbed=await packet(1,reply,'f-tenacity',magma.snapshot.game.revision);expect(absorbed.ok,absorbed.error).toBe(true);expect(absorbed.snapshot.game.players[1]).toMatchObject({hp:3,maxHp:3});expect((await packet(1,reply,'f-tenacity',magma.snapshot.game.revision)).duplicate).toBe(true);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query("select ml_private.p3f_skill($1::jsonb,'{}')",[JSON.stringify(s)])).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
},30000);
