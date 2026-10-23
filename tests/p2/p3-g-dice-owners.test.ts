import {afterAll,beforeAll,expect,it} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {database} from './database';
import {fixture,give,run as runLegacy} from './p3-fixture';
import {setup,ports,command,unusedInitial,clean} from './p3-g-dice-fixture';
import {gDie,gDispatch} from '../../packages/game-core/src/p3-g-dice';
import {gState} from '../../packages/game-core/src/p3-g-state';
import {stage4MapChoose} from '../../packages/game-core/src/stage4-map-engine';
import {stage4EquipmentSkill} from '../../packages/game-core/src/stage4-actions';
import {publicView} from '../../packages/game-core/src/index';
import type {GameState,Command,DispatchResult} from '../../packages/game-core/src/types';
const {patchGDieOwners}=await import(pathToFileURL(resolve('tools/p3-g-dice-patch.mjs')).href);
const db=await database(undefined,28);afterAll(()=>db.close());let changed=0,seq=0;const definitions=new Map<string,string>();
beforeAll(async()=>{
 for(const file of (await readdir('database/migrations')).filter(f=>Number(f.slice(0,3))<=28).sort())for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))definitions.set(m[1].split('.')[1],m[0]);
 await db.exec(definitions.get('int')!.replace('function ml_private.int(','function ml_private.int_before_p3g('));await db.exec(await readFile('database/engine/p3-g.sql','utf8'));
 for(const [name,body] of definitions){const result=patchGDieOwners(name,body);if(result!==body){changed++;await db.exec(result.replaceAll("'web-v0.1.17')","'web-v0.1.17','web-v0.1.18')"));}}
 const originalSelect=definitions.get('select_choice')!;await db.exec(originalSelect.replace('function ml_private.select_choice(','function ml_private.select_before_g_test('));
 await db.exec(`create or replace function ml_private.select_choice(s jsonb,kind text,a integer,at double precision,extra jsonb default '{}') returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 if not ml_private.p3g_enabled(s) then return ml_private.select_before_g_test(s,kind,a,at,extra);end if;
 s:=ml_private.pause(s,at);s:=s||jsonb_build_object('phase','choice','choiceSerial',(s->>'choiceSerial')::int+1,'choice',jsonb_build_object('id',(s->>'choiceSerial')::int+1,'kind',kind,'actor',a,'deadline',at+30000,'paused',true)||extra);return ml_private.emit(s,'choice','S'||(a+1)||' 等待选择：'||kind);end $$;
 `);
 // The callback returns a DispatchResult just as the real dispatch does.
 await db.exec(`create or replace function ml_private.p3g_dispatch_core(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 s:=ml_private.stage4_map_choose(s,cmd,at,false);s:=s||jsonb_build_object('choice',null,'phase','action','seen',(s->'seen')||jsonb_build_array(cmd->'id'),'revision',(s->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);end $$;`);
});
function hidden(){
 const s=setup([5,6]),card='basic-021#01';s.deck=s.deck.filter(c=>c!==card);s.resolving.push(card);s.cardStack!.serial=1;
 s.cardStack!.stack.push({serial:1,actor:0,card,definition:'basic-021',targets:[2],effect:{origin:'card',actor:0,faction:'中立',roleModifiers:[]},cancelled:[],elbows:[],countered:false,counter:null,responseTo:null,responseActor:null,stage4:{guessDie:2}});
 s.choice={id:++s.choiceSerial,kind:'board-guess',actor:2,deadline:11000,paused:true,source:0,data:{serial:1}};s.clock.since=null;s.phase='choice';return s;
}
const hiddenPorts={...ports,finalDie:(s:GameState,reason:string,owner:number|null,raw:number)=>gDie(s,reason,owner,raw,hiddenPorts),sideIntent:(s:GameState,cmd:Command,at:number,silent:boolean)=>cmd.type==='skill'&&cmd.kind==='terrain'?stage4EquipmentSkill(s,cmd,at,silent?{...ports,emit:()=>{}}:ports):false};
const core=(s:GameState,cmd:Command,at:number):DispatchResult=>{stage4MapChoose(s,cmd as Extract<Command,{type:'choose'}>,at,hiddenPorts,false);s.choice=null;s.phase='action';s.seen.push(cmd.id);s.revision++;s.time=at;return {state:s,ok:true};};
async function run(s:GameState,body:Record<string,unknown>,ok=true){const cmd=command(s,{actor:s.choice!.actor,type:'choose',choice:s.choice!.id,...body} as any,`hidden-${++seq}`),at=s.time+1,ts=gDispatch(s,cmd,at,core,unusedInitial,hiddenPorts),sql=(await db.query<{v:DispatchResult}>('select ml_private.p3g_dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql).toEqual(ts);return ts.state;}

it('every existing SQL public d6 site has a classified owner, random fee and hidden reveal hooks compile',()=>{
 expect(changed).toBe(23);expect(()=>patchGDieOwners('new_unclassified',"select ml_private.die(s,'新骰')")).toThrow('G骰子归属未分类');
 expect(patchGDieOwners('stage3_handle_task_before_stage4',definitions.get('stage3_handle_task_before_stage4'))).toContain("p3g_owned_die(s,'S'||(target+1)||' 猴子游戏',target)");
 expect(patchGDieOwners('stage4_combat_task',definitions.get('stage4_combat_task'))).toContain("p3g_owned_die(s,'躲避球',(c->>'actor')::int)");
});
it('the hidden die stays hidden until the target locks a guess, and its owner is the card caster',async()=>{
 let s=hidden();const view=publicView(s,2);expect(view.events.some(e=>e.type==='dice')).toBe(false);expect(JSON.stringify(view)).not.toContain('guessDie');
 s=await run(s,{guess:2});expect(s.choice).toMatchObject({kind:'g-program',actor:1});expect(gState(s).dice!.driver.command).toMatchObject({actor:2,guess:2});expect(gState(s).dice!.waiting).toMatchObject({owner:0,raw:2});expect(s.random.dice).toEqual([5,6]);
 s=await run(s,{accept:true});expect(s.choice).toMatchObject({kind:'g-math',actor:0});expect((s.choice!.data as any).value).toBe(5);s=await run(s,{option:'1'});clean(s);expect(s.queue).toEqual([{kind:'stage3',action:'board-teleport',target:2,serial:1}]);expect(s.random.dice).toEqual([6]);expect(s.events.filter(e=>e.text==='卫汶找你：d6 = 2')).toHaveLength(1);
});
it('later choices cannot replace the locked guess and final math has priority over the programming reroll',async()=>{
 let s=await run(hidden(),{guess:2});s=await run(s,{accept:true,guess:6});s=await run(s,{option:'2',guess:6});clean(s);expect(s.queue).toEqual([]);expect(s.cardStack!.stack[0].stage4!.guessDie).toBe(2);
});
it('declining both modifications retains the original hidden result without consuming another die',async()=>{
 let s=await run(hidden(),{guess:2});s=await run(s,{accept:false});s=await run(s,{});clean(s);expect(s.queue).toEqual([]);expect(s.random.dice).toEqual([5,6]);
});
it('classified SQL preserves actual v17 movement, private quote behaviour and public state',async()=>{
 let s=fixture('web-v0.1.17',['character-052','character-048','character-025','character-047']);s.random.dice=[6];s=await runLegacy(db,s,{type:'move'});expect(s.phase).toBe('moving');s=await runLegacy(db,s,{type:'stop'});give(s,0,'basic-032#01');s.random.dice=[4];const dice=s.events.filter(e=>e.type==='dice').length;s=await runLegacy(db,s,{type:'skill',kind:'quote-cost',card:'basic-032#01'});expect(s.events.filter(e=>e.type==='dice')).toHaveLength(dice);expect(s.random.dice).toEqual([]);
 const sql=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,0) v',[JSON.stringify(s)])).rows[0].v;expect(sql.stage3).toEqual(publicView(s,0).stage3);expect(sql.players).toEqual(publicView(s,0).players);
});
it('Tangche settings remain usable during both die windows and survive replay with one event per submitted intent',async()=>{
 let s=hidden();const gear='basic-069#01';s.deck=s.deck.filter(c=>c!==gear);s.stage3!.equipment[2].push(gear);s.stage3!.equipmentSources[gear]={origin:'equipment',actor:2,faction:'中立',roleModifiers:[]};
 s=await run(s,{guess:2});const deadline=s.choice!.deadline;s=await run(s,{type:'skill',kind:'terrain',actor:2,accept:true});expect(s.stage4!.terrainIgnore[2]).toBe(true);expect(s.choice!.deadline).toBe(deadline);expect(gState(s).dice!.waiting.intents).toHaveLength(1);
 s=await run(s,{accept:true});s=await run(s,{type:'skill',kind:'terrain',actor:2,accept:false});s=JSON.parse(JSON.stringify(s));s=await run(s,{option:'1'});clean(s);expect(s.stage4!.terrainIgnore[2]).toBe(false);expect(s.events.filter(e=>e.type==='terrain').map(e=>e.text)).toEqual(['S3 唐车忽略地点效果','S3 唐车恢复地点效果']);expect(s.queue).toEqual([{kind:'stage3',action:'board-teleport',target:2,serial:1}]);
});
it('invalid waiting-time equipment settings roll back the private intent ledger as well as visible state',async()=>{
 const s=await run(hidden(),{guess:2});await run(s,{type:'skill',kind:'terrain',actor:2,accept:true},false);expect(gState(s).dice!.waiting.intents).toBeUndefined();
});
