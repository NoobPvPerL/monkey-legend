import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {fixture,give} from './p3-fixture';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {databaseReady} from '../../packages/online/src/version';
const databaseReadyC=(health:unknown)=>databaseReady(health,{ruleVersion:'web-v0.1.14',engineRevision:25,stage4:true});
const atomic=(sql:string)=>`DO $c_outer$ BEGIN EXECUTE $c_body$${sql}$c_body$;END $c_outer$;`;
it('024→025 is atomic/idempotent, keeps identities, rooms, all old profiles and v13 drafts; public RPC owns C decisions',async()=>{
 const db=await database(undefined,24);try{
 const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const players=Array.from({length:4},(_,i)=>({name:'C隔离'+i,token:String(i+1).repeat(64),epoch:1}));
 const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...players[a],op,...extra})]);
 const first=await call(0,'create',{requestId:'c-create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:'c-join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const s=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:'c-ready',roomRevision:s.roomRevision,ready:true})).ok).toBe(true);}
 const v=(await call(0,'view',{roomId:id})).snapshot,started=await call(0,'start',{roomId:id,requestId:'c-start',roomRevision:v.roomRevision});expect(started.ok).toBe(true);
 const room=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id]),intakes=await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p'),profiles=await db.query('select key,value from ml_private.catalog order by key');expect(room.draft.catalogVersion).toBe('web-v0.1.13');
 const migration=await readFile('database/migrations/025_p3_batch_c.sql','utf8');expect(databaseReadyC(await q('select public.ml_health() v'))).toBe(false);
 await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(24);
 await db.query(atomic(migration));await db.query(atomic(migration));expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id])).toEqual(room);expect(await q('select jsonb_agg(to_jsonb(p) order by token_hash,request_id) v from ml_private.intakes p')).toEqual(intakes);expect(await db.query("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.14' order by key")).toEqual(profiles);
 const health=await q('select public.ml_health() v');expect(health).toMatchObject({engineRevision:25,ruleVersion:'web-v0.1.14',characterDefinitions:20,batchCReady:true,potatoRulesReady:true,p3CharactersReady:true,yinghaoRulesReady:true});expect(databaseReadyC(health)).toBe(true);for(const key of ['batchCReady','potatoRulesReady','p3CharactersReady','yinghaoRulesReady'])expect(databaseReadyC({...health,[key]:false})).toBe(false);
 for(let n=1;n<=13;n++){const version=('web-v0.1.'+n) as ReturnType<typeof createGame>['version'],s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0},1000),cmd={id:'c-resume',revision:s.revision,actor:s.active,type:'tick' as const};const actual=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(s),JSON.stringify(cmd)]),expected=dispatch(s,cmd,61000);expect(actual.ok).toBe(expected.ok);expect(actual.state).toEqual(expected.state);expect(actual.state.stage3?.c).toBeUndefined();}
 for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[id]);expect((await call(d.offer.actor,'draft-pick',{roomId:id,requestId:'c-old-pick-'+i,matchId:started.snapshot.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]})).ok).toBe(true);}
 expect((await call(0,'view',{roomId:id})).snapshot.game.version).toBe('web-v0.1.13');
 const install=async(s:ReturnType<typeof fixture>)=>db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(s)]);
 const packet=async(a:number,intent:unknown,requestId:string,revision?:number)=>{const v=(await call(a,'view',{roomId:id})).snapshot;return call(a,'game',{roomId:id,requestId,matchId:v.matchId,revision:revision??v.game.revision,intent});};
 let s=fixture('web-v0.1.14',['character-046','character-047','character-026','character-044']);await install(s);expect((await packet(1,{type:'skill',kind:'feather'},'c-wrong')).ok).toBe(false);const ranged=await packet(0,{type:'skill',kind:'feather'},'c-feather',s.revision);expect(ranged.ok,ranged.error).toBe(true);expect(ranged.snapshot.game.stage3.c.feather[0]).toBe(true);expect(ranged.snapshot.game.players[0].ap).toBe(20);expect((await packet(0,{type:'skill',kind:'feather'},'c-feather',s.revision)).duplicate).toBe(true);expect((await packet(0,{type:'skill',kind:'feather'},'c-stale',s.revision)).ok).toBe(false);
 s=fixture('web-v0.1.14',['character-047','character-048','character-025','character-046']);s.players[0].hp=1;give(s,0,'basic-039#01');s.random.dice=[6];await install(s);const food=await packet(0,{type:'play',card:'basic-039#01',targets:[]},'c-food');expect(food.ok).toBe(true);expect(food.snapshot.game.choice.kind).toBe('primitive-food');const chosen={type:'choose',choice:food.snapshot.game.choice.id,accept:true},healed=await packet(0,chosen,'c-heal',food.snapshot.game.revision);expect(healed.ok).toBe(true);expect(healed.snapshot.game.players[0].hp).toBe(3);expect((await packet(0,chosen,'c-heal',food.snapshot.game.revision)).duplicate).toBe(true);expect((await call(0,'view',{roomId:id})).snapshot.game.players[0].hp).toBe(3);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3c_skill($1::jsonb,0)',[JSON.stringify(s)])).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 const verification=await db.exec(await readFile('tests/p2/fixtures/verify-revision25.sql','utf8'));for(const result of verification)for(const row of result.rows)for(const [key,value] of Object.entries(row))if(key.endsWith('_ready'))expect(value,key).toBe(true);
 }finally{await db.close();}
},30000);
