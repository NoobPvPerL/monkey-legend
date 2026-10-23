import {beforeAll,afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {gFixture} from './p3-g-fixture';
import {give,equip} from './p3-fixture';
import {ports,die,command,unusedInitial} from './p3-g-dice-fixture';
import {gDispatch} from '../../packages/game-core/src/p3-g-dice';
import {gFoodTask,gFoodChoose,gFoodOriginalAllowed,gFoodThief,gFoodPortions} from '../../packages/game-core/src/p3-g-food';
import {gPrimeQuote} from '../../packages/game-core/src/p3-g-cards';
import {beginCard} from '../../packages/game-core/src/stage3-card-stack';
import {resourceHealing} from '../../packages/game-core/src/stage3-resources';
import {terrainHealing} from '../../packages/game-core/src/stage4-terrain';
import {rememberExerciseOwner} from '../../packages/game-core/src/exercise';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import type {GameState,Task,Command,DispatchResult} from '../../packages/game-core/src/types';
import type {Stage3Ports} from '../../packages/game-core/src/stage3-engine';
// @ts-expect-error ESM staging generator helper
import {patchGFood} from '../../tools/p3-g-food-patch.mjs';
// @ts-expect-error ESM staging generator helper
import {patchGDieOwners} from '../../tools/p3-g-dice-patch.mjs';
const db=await database(undefined,28);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[]) => (await db.query<{v:any}>(sql,args)).rows[0].v;
const extend=(s:string)=>s.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.17'(\s*\))/g,"$1'web-v0.1.17','web-v0.1.18'$2").replace(/<>\s*'web-v0\.1\.17'/g," not in ('web-v0.1.17','web-v0.1.18')").replace(/(?<![<>=!])=\s*'web-v0\.1\.17'/g," in ('web-v0.1.17','web-v0.1.18')");
beforeAll(async()=>{
 const profile=await q("select value v from ml_private.catalog where key='ruleset:web-v0.1.17'");profile.runtimeData=runtimeForVersion('web-v0.1.18');profile.manifest={...profile.manifest,version:'web-v0.1.18',status:'development'};await db.query("insert into ml_private.catalog(key,value) values('ruleset:web-v0.1.18',$1::jsonb)",[JSON.stringify(profile)]);
 const integer=await q("select pg_get_functiondef('ml_private.int(jsonb,integer)'::regprocedure) v");await db.exec(integer.replace(/FUNCTION ml_private\.(?:"int"|int)\(/i,'FUNCTION ml_private.int_before_p3g('));
 await db.exec(await readFile('database/engine/p3-g.sql','utf8'));await db.exec(await readFile('database/engine/p3-g-food.sql','utf8'));
 const names=['heal','draw','exercise_remember','stage3_card_allowed','p3c_enabled','p3f_enabled','location_food_heal','stage4_location_food'];
 for(const row of (await db.query<{v:string}>('select pg_get_functiondef(p.oid) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=any($2::text[])',['ml_private',names])).rows)await db.exec(extend(row.v));
 for(const [name,signature] of [['playtest_role_choice','jsonb,text'],['select_choice','jsonb,text,integer,double precision,jsonb']]){const body=await q(`select pg_get_functiondef('ml_private.${name}(${signature})'::regprocedure) v`);await db.exec(patchGDieOwners(name,extend(body)));}
 const runtime=await q("select pg_get_functiondef('ml_private.runtime_data(text,text)'::regprocedure) v");await db.exec(runtime.replace("'web-v0.1.7'","'web-v0.1.7','web-v0.1.18'"));
 for(const name of ['stage3_handle_task','stage4_counter_task']){const body=await q(`select pg_get_functiondef('ml_private.${name}(jsonb,jsonb,double precision)'::regprocedure) v`);await db.exec(patchGFood(name,body));}
 await db.exec(`create or replace function ml_private.name(s jsonb,a integer) returns text language sql stable set search_path=pg_catalog,ml_private as $$select 'S'||(a+1)||' '||(ml_private.version_catalog(s->>'version')#>>array['runtimeData','characters',s#>>array['players',a::text,'character'],'name'])$$;
 -- Controlled damage delegation: the real TS integration tests cover the complete hit/gear/role chain.
 create or replace function ml_private.damage(s jsonb,hits jsonb,environment boolean default false) returns jsonb language sql volatile set search_path=pg_catalog,ml_private as $$select s||jsonb_build_object('_triggers',jsonb_build_array(ml_private.stage3_task('g-food-test-damage',jsonb_build_object('data',hits))))$$;
 create or replace function ml_private.p3g_dispatch_core(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare t jsonb;begin perform ml_private.need(cmd->'actor'=s#>'{choice,actor}','wrong food actor');s:=ml_private.p3g_food_choose(s,cmd,at,false);s:=s-'_gFoodHandled';s:=jsonb_set(s,'{choice}','null');t:=s#>'{queue,0}';s:=jsonb_set(s,'{queue}',(s->'queue')-0);s:=ml_private.p3g_food_task(s,t,at);s:=s-'_gFoodHandled';s:=s||jsonb_build_object('phase','action','seen',(s->'seen')||jsonb_build_array(cmd->'id'),'revision',(s->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);end $$;`);
});
const name=(s:GameState,a:number)=>`S${a+1} ${runtimeForVersion(s.version).characters[s.players[a].character].name}`;
const p:Stage3Ports={...ports,die:(s,reason,owner=null)=>die(s,owner,reason),select:(s,kind,a,at,extra={})=>{ports.select(s,kind,a,at,extra);s.events.at(-1)!.text=`${name(s,a)} 等待选择：${kind}`;},heal:(s,a,amount,food=false)=>{const old=s.players[a].hp;s.players[a].hp+=resourceHealing(s as any,a,food?terrainHealing(s,a,amount):amount,food);ports.emit(s,'heal',`${name(s,a)} 回复${s.players[a].hp-old}生命`);},draw:(s,a,count)=>{let actual=0;for(let i=0;i<count&&s.deck.length;i++){const card=s.deck.shift()!;rememberExerciseOwner(s,a,card);s.players[a].hand.push(card);actual++;}ports.emit(s,'draw',`${name(s,a)} 摸${actual}张`,{actor:a,count:actual});},damage:(_s,hits)=>[{kind:'stage3',action:'g-food-test-damage',data:hits}]};
function pending(def='basic-039',source='character-048'){
 const s=gFixture(['character-021',source,'character-025','character-031']);s.active=1;s.players[0].hp=1;s.players[1].hp=1;const card=def+'#01';give(s,1,card);s.players[1].hand=[];s.resolving.push(card);const c=beginCard(s as any,1,card,def,[1],{origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[]},s.time);c.counter=null;c.stage4={officeExempt:[],...(def==='basic-038'?{counterEffective:true}:{})};s.queue=[];return JSON.parse(JSON.stringify(s)) as GameState;
}
async function task(s:GameState,t:Task){const before=structuredClone(s);const handled=gFoodTask(s,t,s.time+1,p),sql=await q('select ml_private.p3g_food_task($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(before),JSON.stringify(t),s.time+1]);expect(sql._gFoodHandled).toBe(handled);delete sql._gFoodHandled;expect(sql).toEqual(s);}
it('original food validity and theft filters preserve immunity, AP, absence and the actual source in TS/SQL',async()=>{
 for(const role of ['character-048','character-026','character-044'])for(const ap of [1,2]){const s=pending('basic-039',role);s.players[0].ap=ap;const c=s.cardStack!.stack[0];expect(await q('select ml_private.p3g_food_original_allowed($1::jsonb,$2::jsonb,1) v',[JSON.stringify(s),JSON.stringify(c)])).toBe(gFoodOriginalAllowed(s,c,1));expect(await q('select ml_private.p3g_food_thief($1::jsonb,$2::jsonb,1) v',[JSON.stringify(s),JSON.stringify(c)])).toEqual(gFoodThief(s,c,1)??null);}
});
it('group portion order,30s choice deadline and the actual stage3 handler hook match full TS state',async()=>{
 const s=pending(),c=s.cardStack!.stack[0];c.targets=[3,1,2];expect(await q('select ml_private.p3g_food_portions($1::jsonb,$2::jsonb) v',[JSON.stringify(c),'[1,2,3]'])).toEqual(gFoodPortions(c,[1,2,3]));await task(s,{kind:'stage3',action:'effect',serial:c.serial});const before=structuredClone(s),t:Task={kind:'stage3',action:'g-food-portion',serial:c.serial,target:1};gFoodTask(s,t,s.time+1,p);expect(await q('select ml_private.stage3_handle_task($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(before),JSON.stringify(t),s.time+1])).toEqual(s);expect(s.choice!.deadline-s.time).toBe(30001);
});
it('accept, decline and timeout queue exactly one recipient and charge exactly the matching theft fee',async()=>{
 for(const [accept,timeout] of [[true,false],[false,false],[true,true]]){const s=pending();gFoodTask(s,{kind:'stage3',action:'g-food-portion',serial:1,target:1},s.time+1,p);const before=structuredClone(s),cmd=command(s,{type:'choose',actor:0,choice:s.choice!.id,accept} as any);expect(gFoodChoose(s,cmd as any,s.time+2,p,timeout)).toBe(true);const sql=await q('select ml_private.p3g_food_choose($1::jsonb,$2::jsonb,$3,$4) v',[JSON.stringify(before),JSON.stringify(cmd),s.time+2,timeout]);delete sql._gFoodHandled;expect(sql).toEqual(s);expect(s.players[0].ap).toBe(accept&&!timeout?18:20);}
});
it('all11 food identities apply the exact HP, draw, shield, buff and skill provenance state in TS/SQL',async()=>{
 for(let n=38;n<=48;n++){const s=pending(`basic-${n.toString().padStart(3,'0')}`);s.random.dice=[3];(s as any)._gReplay={index:0,steps:[],now:s.time+1,logicalAt:s.time+1,continued:false};await task(s,{kind:'stage3',action:'g-food-apply',serial:1,target:1,data:{recipient:0,thief:0}});}
});
it('stolen oil delegates one damage hit with the original caster source and identical subsequent queue',async()=>{
 const s=pending('basic-048');s.random.dice=[6];(s as any)._gReplay={index:0,steps:[],now:s.time+1,logicalAt:s.time+1,continued:false};await task(s,{kind:'stage3',action:'g-food-apply',serial:1,target:1,data:{recipient:0,thief:0}});expect(s.queue[0]).toMatchObject({action:'g-food-test-damage',data:[{source:1,target:0,amount:1}]});
});
it('current XDF bonus, full-heal mount, original uncapped healing and first-kill ceiling match the real healing helpers',async()=>{
 for(const mode of ['xdf','mount','uncapped','ceiling']){const s=pending('basic-039',mode==='uncapped'||mode==='ceiling'?'character-019':'character-048');if(mode==='xdf')s.players[0].cell='r2c1';if(mode==='mount')equip(s,0,'basic-072#01');if(mode==='uncapped'||mode==='ceiling'){s.players[1].hp=8;if(mode==='ceiling')s.stage3!.f!.unlimitedCeil[1]=8;}
  await task(s,{kind:'stage3',action:'g-food-apply',serial:1,target:1,data:mode==='uncapped'||mode==='ceiling'?{recipient:1}:{recipient:0,thief:0}});
 }
});
it('Aloe actual counter hook queues only the transferable heal and keeps counter ownership',async()=>{
 const s=pending(),parent=s.cardStack!.stack[0];give(s,2,'basic-038#01');s.players[2].hand=[];s.resolving.push('basic-038#01');const c=beginCard(s as any,2,'basic-038#01','basic-038',[1],{origin:'card',actor:2,faction:s.players[2].faction,roleModifiers:[]},s.time,parent.serial);c.counter=null;c.stage4={counter:'food'};const sql=await q('select ml_private.stage4_counter_task($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify({kind:'stage3',action:'stage4-counter-effect',serial:c.serial}),s.time+1]);expect(sql.cardStack.stack[1].stage4.counterEffective).toBe(true);expect(sql.queue[0]).toEqual({kind:'stage3',action:'g-food-portion',serial:c.serial,target:2});expect(sql.players[2].hp).toBe(s.players[2].hp);
});
it('existing unrelated active lineage cannot bypass prime plus1, and the prime quote remains idempotent',async()=>{
 const s=pending(),effect={origin:'card' as const,actor:0,faction:s.players[0].faction,roleModifiers:[{actor:0,kind:'active' as const}]},expected=gPrimeQuote(s,0,{cost:0,effect}),sql=await q('select ml_private.p3g_prime_quote($1::jsonb,0,0,$2::jsonb) v',[JSON.stringify(s),JSON.stringify(effect)]);expect(sql).toEqual(expected);expect(sql.cost).toBe(1);expect(await q('select ml_private.p3g_prime_quote($1::jsonb,0,$2::jsonb) v',[JSON.stringify(s),JSON.stringify(sql)])).toEqual(expected);const next=gPrimeQuote(s,0,{cost:0,effect:sql.effect});expect(next.cost).toBe(1);expect(await q('select ml_private.p3g_prime_quote($1::jsonb,0,0,$2::jsonb) v',[JSON.stringify(s),JSON.stringify(sql.effect)])).toEqual(next);
});
it('persisted oil theft resumes final math with one fee and exactly matching private/event state in TS/SQL',async()=>{
 const core=(s:GameState,cmd:Command,at:number):DispatchResult=>{if(cmd.actor!==s.choice?.actor)return {state:s,ok:false,error:'wrong food actor'};gFoodChoose(s,cmd as any,at,p,false);s.choice=null;gFoodTask(s,s.queue.shift()!,at,p);s.phase='action';s.seen.push(cmd.id);s.revision++;s.time=at;return {state:s,ok:true};};
 let s=pending('basic-048','character-042');s.random.dice=[1];gFoodTask(s,{kind:'stage3',action:'g-food-portion',serial:1,target:1},s.time+1,p);
 for(const extra of [{accept:true},{option:'6'}]){const cmd=command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,...extra} as any,`g-food-sql-${s.revision}`),at=s.time+2,ts=gDispatch(s,cmd,at,core,unusedInitial,p),sql=await q('select ml_private.p3g_dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at]);expect(ts.ok,ts.error).toBe(true);expect(sql).toEqual(ts);s=JSON.parse(JSON.stringify(ts.state));}
 expect(s.players[0].ap).toBe(18);expect(s.queue[0]).toMatchObject({action:'g-food-test-damage',data:[{source:1,target:0}]});
});

it('real SQL choice helpers give all G role windows30s and skill discards20s without renewing the action clock',async()=>{
 for(const kind of ['g-food','g-invisible','g-program','g-math','g-counter','g-white-eye','g-discard']){const s=pending(),at=s.time+4500,result=await q('select ml_private.select_choice($1::jsonb,$2,0,$3) v',[JSON.stringify(s),kind,at]);expect(result.choice.deadline-at).toBe(kind==='g-discard'?20000:30000);expect(result.clock).toEqual({remaining:55500,since:null});}
 const s=pending();s.version='web-v0.1.17';for(const [kind,duration] of [['easy',30000],['discard',20000],['water-discard',10000]] as const){const result=await q('select ml_private.select_choice($1::jsonb,$2,0,$3) v',[JSON.stringify(s),kind,s.time+1]);expect(result.choice.deadline-s.time-1).toBe(duration);}
});
