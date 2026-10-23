import {afterAll,beforeAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {ports,setup,driver,command,unusedInitial,clean,die} from './p3-g-dice-fixture';
import {gDispatch,gInitial,gNow} from '../../packages/game-core/src/p3-g-dice';
import {gState} from '../../packages/game-core/src/p3-g-state';
import type {GameState,Command,DispatchResult} from '../../packages/game-core/src/types';

// Install helpers with controlled callbacks only in an isolated PostgreSQL.
// The real029 migration, roster and public-view integration are still pending.
const db=await database(undefined,28);afterAll(()=>db.close());let serial=0;
beforeAll(async()=>{
 const original=(await db.query<{sql:string}>("select pg_get_functiondef('ml_private.int(jsonb,integer)'::regprocedure) sql")).rows[0].sql;
 await db.exec(original.replace(/FUNCTION ml_private\.(?:"int"|int)\(/i,'FUNCTION ml_private.int_before_p3g('));
 await db.exec(await readFile('database/engine/p3-g.sql','utf8'));
 await db.exec(`
 create or replace function ml_private.select_choice(s jsonb,kind text,a integer,at double precision,extra jsonb default '{}') returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 s:=ml_private.pause(s,at);s:=s||jsonb_build_object('phase','choice','choiceSerial',(s->>'choiceSerial')::int+1,'choice',jsonb_build_object('id',(s->>'choiceSerial')::int+1,'kind',kind,'actor',a,'deadline',at+30000,'paused',true)||extra);return ml_private.emit(s,'choice','S'||(a+1)||' 等待选择：'||kind);end $$;
 create or replace function ml_private.p3g_dispatch_core(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare drawn jsonb;n integer;i integer;count integer:=coalesce((s->>'_gTestCount')::int,1);begin
 if cmd->'revision'<>s->'revision' then return jsonb_build_object('state',s,'ok',false,'error','stale driver');end if;
 if s ? '_gTestHistorical' then at:=(s->>'_gTestHistorical')::double precision;s:=ml_private.p3g_at(s,at);end if;
 s:=jsonb_set(s,'{players,0,ap}',to_jsonb((s#>>'{players,0,ap}')::int-2));s:=ml_private.p3g_int(s,jsonb_array_length(s->'deck'));i:=(s->>'_int')::int;s:=s-'_int';drawn:=s->'deck'->i;s:=jsonb_set(s,'{deck}',(s->'deck')-i);s:=jsonb_set(s,'{players,0,hand}',(s#>'{players,0,hand}')||jsonb_build_array(drawn));s:=ml_private.emit(s,'play','已支付2AP并拿牌');
 for i in 0..count-1 loop s:=ml_private.p3g_die(s,'目标骰'||i,0);n:=(s->>'_roll')::int;s:=s-'_roll';s:=jsonb_set(s,'{players,0,ap}',to_jsonb((s#>>'{players,0,ap}')::int-n));s:=ml_private.emit(s,'skill','最终'||i||'='||n);end loop;
 s:=ml_private.p3g_int(s,50);s:=jsonb_set(s,'{players,0,shield}',s->'_int');s:=s-'_int';s:=jsonb_set(s,'{clock,since}',to_jsonb(ml_private.p3g_now(s,at)));s:=s||jsonb_build_object('choice',null,'phase','action','seen',(s->'seen')||jsonb_build_array(cmd->'id'),'revision',(s->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);end $$;
 create or replace function ml_private.p3g_initial_core(s jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin s:=ml_private.p3g_die(s,'开始判定',0);s:=jsonb_set(s,'{players,0,shield}',s->'_roll');s:=s-'_roll';return jsonb_set(s,'{clock,since}',to_jsonb(ml_private.p3g_now(s,at)));end $$;
 `);
});
function setupCount(dice:number[]=[],count=1):GameState{return Object.assign(setup(dice),{_gTestCount:count});}
async function run(s:GameState,body:Record<string,unknown>,at=s.time+1,ok=true){
 const cmd=command(s,{actor:s.choice?.actor??0,...body} as any,`g-sql-${++serial}`),count=(s as any)._gTestCount??1;
 const ts=gDispatch(s,cmd,at,(state,command,now)=>{const logical=(state as any)._gTestHistorical??now;gNow(state,logical);return driver(count)(state,command,logical);},initial,ports),sql=(await db.query<{v:DispatchResult}>('select ml_private.p3g_dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql).toEqual(ts);if(!ok)expect(sql.state).toEqual(s);return ts.state;
}
function initial(s:GameState,at:number){s.players[0].shield=die(s,0,'开始判定');s.clock.since=gNow(s,at);return s;}
const pick=(s:GameState,extra:Record<string,unknown>,at?:number,ok=true)=>run(s,{type:'choose',choice:s.choice!.id,...extra},at,ok);

it('persisted programming then final math preserves one spend/draw and every private/event field in TS and SQL',async()=>{
 let s=setupCount([1,3,5,4]);s=await run(s,{type:'move'},1010);expect(s.choice).toMatchObject({kind:'g-program',actor:1});s=await pick(s,{accept:true},1110);expect(s.choice).toMatchObject({kind:'g-math',actor:0});s=JSON.parse(JSON.stringify(s));s=await pick(s,{option:'6'},1310);clean(s);expect(s.players[0].ap).toBe(12);expect(s.players[0].hand).toHaveLength(1);expect(s.random.dice).toEqual([5,4]);
});
it('generated entropy and multiple decisions retain random identity and programming once per turn in TS/SQL',async()=>{
 let s=setupCount([],2);s=await run(s,{type:'move'});s=await pick(s,{accept:false});s=await pick(s,{option:'6'});expect(s.choice?.kind).toBe('g-program');s=await pick(s,{accept:true});s=await pick(s,{option:'2'});clean(s);expect(s.players[0].ap).toBe(10);expect(s.events.filter(e=>e.type==='dice')).toHaveLength(3);
 s=setupCount([],2);s=await run(s,{type:'move'});s=await pick(s,{accept:true});s=await pick(s,{option:'3'});expect(s.choice?.kind).toBe('g-math');s=await pick(s,{option:'1'});clean(s);expect(s.players[0].ap).toBe(14);
});
it('both timeouts and early ticks preserve current dice and the paused action clock identically',async()=>{
 let s=setupCount([2,5]);s=await run(s,{type:'move'},1050);const previous=structuredClone(s);s=await run(s,{type:'tick'},s.choice!.deadline-1);expect(s).toEqual(previous);
 s=await run(s,{type:'tick'},s.choice!.deadline);s=await run(s,{type:'tick'},s.choice!.deadline);clean(s);expect(s.players[0].ap).toBe(16);expect(s.clock).toEqual({remaining:59950,since:61050});
});
it('one late tick catches up every expired die window with one request revision in TS/SQL',async()=>{
 let s=await run(setupCount([1,5,3,4],2),{type:'move'},1001);const revision=s.revision,seen=s.seen.length;s=await run(s,{type:'tick'},100000);expect(s.choice).toMatchObject({kind:'g-math',deadline:121001});expect(s.seen).toHaveLength(seen+1);expect(s.revision).toBe(revision+1);expect(s.events.filter(e=>e.text==='已支付2AP并拿牌')).toHaveLength(1);s=await run(s,{type:'tick'},121001);clean(s);expect(s.players[0].ap).toBe(12);expect(s.random.dice).toEqual([3,4]);expect(s.clock.since).toBe(121001);
});
it('a historical timeout die starts its windows at the logical trigger, not the late arrival time',async()=>{
 const base=Object.assign(setupCount([2,5]),{_gTestHistorical:1100});const s=await run(base,{type:'tick'},100000);clean(s);expect(s.choice).toBeNull();expect(s.clock).toEqual({remaining:59900,since:61100});expect(s.players[0].ap).toBe(16);expect(s.events.filter(e=>e.type==='timeout')).toHaveLength(2);expect(s.events.filter(e=>e.text==='已支付2AP并拿牌')).toHaveLength(1);
});
it('invalid actors, windows, revisions, acceptance types and final points roll back TS/SQL exactly',async()=>{
 let s=await run(setupCount([1,3]),{type:'move'});
 for(const fields of [{actor:0},{choice:s.choice!.id+1},{revision:s.revision-1},{accept:1},{accept:null},{type:'move'},{type:undefined},{type:null},{actor:1.5}])await run(s,{type:'choose',choice:s.choice!.id,...fields},s.time+1,false);
 s=await pick(s,{accept:false});for(const option of ['0','7','01','1.5',6,null])await pick(s,{option},s.time+1,false);await pick(s,{option:'6'},s.choice!.deadline,false);
});
it('initial own-turn judgement resumes after opening hands without dealing twice in either authority',async()=>{
 const base=setupCount([2,4]);base.players[0].hand=base.deck.splice(0,4);const hand=[...base.players[0].hand];let s=gInitial(base,1001,initial,ports);
 expect((await db.query<{v:GameState}>('select ml_private.p3g_initial($1::jsonb,$2) v',[JSON.stringify(base),1001])).rows[0].v).toEqual(s);
 s=await pick(s,{accept:true});s=await pick(s,{option:'6'});clean(s);expect(s.players[0].hand).toEqual(hand);expect(s.players[0].shield).toBe(6);
});
it('secure database entropy is sampled once per original draw, even when a suspended command is replayed',async()=>{
 const original=(await db.query<{sql:string}>("select pg_get_functiondef('ml_private.entropy(bigint)'::regprocedure) sql")).rows[0].sql;
 await db.exec(`create sequence ml_private.g_entropy_calls;create or replace function ml_private.entropy(n bigint) returns bigint language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin return nextval('ml_private.g_entropy_calls')%n;end $$;`);
 try{
  let s:any=setupCount([]);s.random.secure=true;
  const sql=async(body:Record<string,unknown>)=>{const cmd=command(s,{actor:s.choice?.actor??0,...body} as any,`secure-${++serial}`);const v=(await db.query<{v:DispatchResult}>('select ml_private.p3g_dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),s.time+1])).rows[0].v;expect(v.ok,v.error).toBe(true);s=v.state;};
  await sql({type:'move'});expect((await db.query<{n:number}>('select last_value::int n from ml_private.g_entropy_calls')).rows[0].n).toBe(2);
  const committed=[...gState(s).dice!.random];expect(committed.map(v=>v.bound)).toEqual([s.deck.length+1,6]);
  await sql({type:'choose',choice:s.choice.id,accept:true});expect((await db.query<{n:number}>('select last_value::int n from ml_private.g_entropy_calls')).rows[0].n).toBe(3);
  await sql({type:'choose',choice:s.choice.id,option:'6'});clean(s);expect((await db.query<{n:number}>('select last_value::int n from ml_private.g_entropy_calls')).rows[0].n).toBe(4);
  expect(s.players[0].ap).toBe(12);expect(s.players[0].hand).toHaveLength(1);expect(s.players[0].shield).toBe(4);expect(s.random.seed).toBe(12345);
 }finally{await db.exec(original);}
});
it('helpers do not activate G or modify the current35-role catalog or health revision',async()=>{
 const health=(await db.query<{v:any}>('select public.ml_health() v')).rows[0].v;expect(health.engineRevision).toBe(28);expect(health.characterDefinitions).toBe(35);expect((await db.query<{n:number}>("select count(*)::int n from ml_private.catalog where key='ruleset:web-v0.1.18'")).rows[0].n).toBe(0);
});
