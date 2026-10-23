import {beforeAll,afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {gFixture,gRun} from './p3-g-fixture';
import {equip} from './p3-fixture';
import {ports,die} from './p3-g-dice-fixture';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {gTurnStart} from '../../packages/game-core/src/p3-g-state';
import {gCubeFace,gCubeDrawBonus,gCubeDestinations,gCubeStartTasks,gCubeTask,gCubeInjury,gCubeBoost} from '../../packages/game-core/src/p3-g-cube';
import {gHaki,gHakiCrossed,gHakiTask,gHakiChoose} from '../../packages/game-core/src/p3-g-haki';
import {fDamage,fTask} from '../../packages/game-core/src/p3-f';
import {prepareStage4Hit} from '../../packages/game-core/src/stage4-combat';
import type {GameState,DamageHit} from '../../packages/game-core/src/types';
import type {Stage3Ports} from '../../packages/game-core/src/stage3-engine';
// @ts-expect-error ESM staging patches
import {patchGMovement} from '../../tools/p3-g-movement-patch.mjs';
// @ts-expect-error ESM staging patches
import {patchGDieOwners} from '../../tools/p3-g-dice-patch.mjs';
const db=await database(undefined,28);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[]) => (await db.query<{v:any}>(sql,args)).rows[0].v;
const extend=(s:string)=>s.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.17'(\s*\))/g,"$1'web-v0.1.17','web-v0.1.18'$2").replace(/<>\s*'web-v0\.1\.17'/g," not in ('web-v0.1.17','web-v0.1.18')").replace(/(?<![<>=!])=\s*'web-v0\.1\.17'/g," in ('web-v0.1.17','web-v0.1.18')");
beforeAll(async()=>{
 const profile=await q("select value v from ml_private.catalog where key='ruleset:web-v0.1.17'");profile.runtimeData=runtimeForVersion('web-v0.1.18');profile.manifest={...profile.manifest,version:'web-v0.1.18',status:'development'};await db.query("insert into ml_private.catalog(key,value) values('ruleset:web-v0.1.18',$1::jsonb)",[JSON.stringify(profile)]);
 const integer=await q("select pg_get_functiondef('ml_private.int(jsonb,integer)'::regprocedure) v");await db.exec(integer.replace(/FUNCTION ml_private\.(?:"int"|int)\(/i,'FUNCTION ml_private.int_before_p3g('));await db.exec(await readFile('database/engine/p3-g.sql','utf8'));await db.exec(await readFile('database/engine/p3-g-movement.sql','utf8'));
 const names=['stage3_gain_ap','p3f_enabled','p3f_can_move','p3f_preview_move','p3f_allowed','stage3_mount_blocked','stage3_equipped','stage4_combat_gear','stage4_board_empty','playtest_relocation_cell','playtest_water_native','stage4_board_entry','stage4_board_water','stage4_ignore_location','stage4_prepare_hit','exercise_discard','exercise_remember','p3f_damage_frame','stage3_handle_task','stage4_card_attack','game_data'];
 for(const row of (await db.query<{name:string;v:string}>('select p.proname name,pg_get_functiondef(p.oid) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=any($2::text[])',['ml_private',names])).rows)await db.exec(patchGMovement(row.name,extend(row.v)));
 for(const [name,signature] of [['playtest_role_choice','jsonb,text'],['select_choice','jsonb,text,integer,double precision,jsonb']]){const body=await q(`select pg_get_functiondef('ml_private.${name}(${signature})'::regprocedure) v`);await db.exec(patchGDieOwners(name,extend(body)));}
 const runtime=await q("select pg_get_functiondef('ml_private.runtime_data(text,text)'::regprocedure) v");await db.exec(runtime.replace("'web-v0.1.7'","'web-v0.1.7','web-v0.1.18'"));
 await db.exec(`create or replace function ml_private.name(s jsonb,a integer) returns text language sql stable set search_path=pg_catalog,ml_private as $$select 'S'||(a+1)||' '||(ml_private.version_catalog(s->>'version')#>>array['runtimeData','characters',s#>>array['players',a::text,'character'],'name'])$$;
 -- Deliberately isolate post-batch death/role reactions: the real TS command tests cover those.
 create or replace function ml_private.p3f_complete_damage(s jsonb,injured jsonb,environment boolean,skip_pursuit boolean) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$select s||jsonb_build_object('_triggers','[]'::jsonb)$$;`);
});
const p:Stage3Ports={...ports,die:(s,reason,a=null)=>die(s,a,reason),select:(s,k,a,at,extra={})=>{ports.select(s,k,a,at,extra);s.events.at(-1)!.text=`S${a+1} ${runtimeForVersion(s.version).characters[s.players[a].character].name} 等待选择：${k}`;},prepareDamage:(s,h,e)=>prepareStage4Hit(s,h,e,p),completeDamage:()=>[],damage:(s,h,e=false,skip=false)=>fDamage(s,h,e,skip)};
function face(n:number){const s=gFixture(['character-028','character-048','character-025','character-031']);s.stage3!.g!.face[0]=n;return s;}
const js=(s:unknown)=>JSON.stringify(s);
it('six faces, active-turn scope, first-round draw bonus and saved v17 agree across TS/SQL',async()=>{
 for(const n of [0,1,2,3,4,5,6])for(const active of [0,1]){const s=face(n);s.active=active;expect(await q('select ml_private.p3g_cube_face($1::jsonb,0) v',[js(s)])).toBe(gCubeFace(s,0));expect(await q('select ml_private.p3g_cube_draw($1::jsonb,0) v',[js(s)])).toBe(gCubeDrawBonus(s,0));expect(await q('select ml_private.p3g_cube_start_tasks($1::jsonb,0) v',[js(s)])).toEqual(gCubeStartTasks(s,0));}
 const s=face(3);s.stage4!.drawBlocked[0]=true;expect(await q('select ml_private.p3g_cube_draw($1::jsonb,0) v',[js(s)])).toBe(0);s.version='web-v0.1.17';expect(await q('select ml_private.p3g_cube_face($1::jsonb,0) v',[js(s)])).toBe(0);
});
it('all six genuine start task rolls store the face once with identical RNG/events/AP state',async()=>{
 for(let n=1;n<=6;n++){const s=face(0);s.random.dice=[n];const before=structuredClone(s),t={kind:'stage3' as const,action:'g-cube-start',actor:0};(s as any)._gReplay={index:0,steps:[],now:s.time+1,logicalAt:s.time+1,continued:false};(before as any)._gReplay=structuredClone((s as any)._gReplay);gCubeTask(s,t,s.time+1,p);const sql=await q('select ml_private.stage3_handle_task($1::jsonb,$2::jsonb,$3) v',[js(before),js(t),s.time+1]);delete sql._gCubeHandled;expect(sql).toEqual(JSON.parse(js(s)));}
});
it('teleport destination sets preserve occupancy, terrain blocks, water, mounts and farm closure',async()=>{
 for(const mode of ['normal','farm','mount','block','moved']){const s=face(6);if(mode==='farm')s.classic!.farmClosed=true;if(mode==='mount')equip(s,0,'basic-063#01');if(mode==='block')s.stage4!.blocks.push({region:'飞船',owner:1,until:2,exempt:[],effect:{origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[]}});if(mode==='moved')s.players[0].moved=true;expect(await q('select ml_private.p3g_cube_cells($1::jsonb,0) v',[js(s)])).toEqual(gCubeDestinations(s,0));}
});
it('per-hit mark creation and consumption preserve immunity, death, shield loss and active-turn scope',async()=>{
 for(const role of ['character-048','character-026','character-044'])for(const active of [0,1])for(const loss of [0,1]){const s=face(5);s.active=active;s.players[1].character=role as any;const before=structuredClone(s),h:DamageHit={source:0,target:1,amount:1,category:'response'};gCubeInjury(s,h,loss,p.emit);expect(await q('select ml_private.p3g_cube_injury($1::jsonb,$2::jsonb,$3) v',[js(before),js(h),loss])).toEqual(JSON.parse(js(s)));s.stage3!.g!.marks[1]=0;const marked=structuredClone(s),hit=gCubeBoost(s,h,p.emit),sql=await q('select ml_private.p3g_cube_boost($1::jsonb,$2::jsonb) v',[js(marked),js(h)]);expect(sql._hit).toEqual(hit);delete sql._hit;expect(sql).toEqual(JSON.parse(js(s)));}
});
it('real damage-frame hooks mark between same-batch hits, before caps/shield and after complete prevention',async()=>{
 for(const mode of ['batch','shield','guard','cap']){const s=face(5);if(mode==='shield')s.players[1].shield=2;if(mode==='guard')equip(s,1,'basic-070#01');if(mode==='cap')equip(s,1,'basic-059#01');s.stage3!.g!.marks[1]=mode==='batch'?null:0;const hits:DamageHit[]=[{target:1,amount:1,source:0,category:'attack'},...(mode==='batch'?[{target:1,amount:1,source:0,category:'attack'} as DamageHit]:[])],t=fDamage(s,hits)[0],before=structuredClone(s),frame=structuredClone(t.data);fTask(s,t,s.time+1,p);expect(await q('select ml_private.p3f_damage_frame($1::jsonb,$2::jsonb,$3) v',[js(before),js(frame),s.time+1])).toEqual(JSON.parse(js(s)));}
});
it('personal-start refresh clears faces/own marks with full TS/SQL state equality',async()=>{
 const s=face(5);s.stage3!.g!.marks=[0,0,2,null];s.stage3!.g!.invisible[0]=true;const before=structuredClone(s);gTurnStart(s as any,0);expect(await q('select ml_private.p3g_start($1::jsonb,0) v',[js(before)])).toEqual(s);
});
it('Haki water-leap crossings record each person once and generate the same ordered task list',async()=>{
 const s=gFixture(['character-049','character-048','character-025','character-031']);s.players[0].cell='r3c2';s.players[1].cell='r3c3';s.players[2].cell='r3c4';s.random.dice=[6];let state=gRun(s,{type:'move'});
 for(let n=0;n<2;n++){const before=structuredClone(state),jobs=gHakiCrossed(state,0,'r3c2','r3c4'),sql=await q('select ml_private.p3g_haki_crossed($1::jsonb,0,$2,$3) v',[js(before),'r3c2','r3c4']);expect(sql._gHakiTasks).toEqual(jobs);delete sql._gHakiTasks;expect(sql).toEqual(state);expect(await q('select ml_private.p3g_haki($1::jsonb,0) v',[js(state)])).toBe(gHaki(state));}
});
it('Haki opens the actual30s window and accepts/declines/timeouts queue identical authoritative damage frames',async()=>{
 for(const [accept,timeout] of [[true,false],[false,false],[true,true]]){const base=gFixture(['character-049','character-048','character-025','character-031']);base.random.dice=[6];const s=gRun(base,{type:'move'}),t={kind:'stage3' as const,action:'g-haki',actor:0,target:1},before=structuredClone(s);gHakiTask(s,t,s.time+1,p);const sql=await q('select ml_private.stage3_handle_task($1::jsonb,$2::jsonb,$3) v',[js(before),js(t),s.time+1]);expect(sql).toEqual(s);expect(s.choice!.deadline-s.time).toBe(30001);const pending=structuredClone(s),cmd={type:'choose' as const,id:'haki-sql',actor:0,revision:s.revision,choice:s.choice!.id,accept};gHakiChoose(s,cmd,s.time+2,p,timeout);const chosen=await q('select ml_private.p3g_haki_choose($1::jsonb,$2::jsonb,$3,$4) v',[js(pending),js(cmd),s.time+2,timeout]);delete chosen._gHakiHandled;expect(chosen).toEqual(s);}
});
