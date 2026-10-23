import {beforeAll,afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {gFixture} from './p3-g-fixture';
import {refreshClassicRound,classicEnvironmentHits,poisonRegions} from '../../packages/game-core/src/classic';
import {gPublicState,gEndTasks,gObserverTask,gObserverChoose,gCardTargetAllowed} from '../../packages/game-core/src/p3-g-observer';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {ports,die} from './p3-g-dice-fixture';
import type {GameState,Task} from '../../packages/game-core/src/types';
// @ts-expect-error generator staging helper is ESM JavaScript
import {patchGObserver} from '../../tools/p3-g-observer-patch.mjs';
const db=await database(undefined,28);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[]) => (await db.query<{v:any}>(sql,args)).rows[0].v;
beforeAll(async()=>{
 const profile=await q("select value v from ml_private.catalog where key='ruleset:web-v0.1.17'");profile.runtimeData=runtimeForVersion('web-v0.1.18');profile.manifest={...profile.manifest,version:'web-v0.1.18',status:'development'};await db.query("insert into ml_private.catalog(key,value) values('ruleset:web-v0.1.18',$1::jsonb)",[JSON.stringify(profile)]);
 await db.exec(await readFile('database/engine/p3-g.sql','utf8'));
 const runtime=await q("select pg_get_functiondef('ml_private.runtime_data(text,text)'::regprocedure) v");await db.exec(runtime.replace("'web-v0.1.7'","'web-v0.1.7','web-v0.1.18'"));
 for(const name of ['classic_refresh','classic_environment','public_view','public_view_before_stage4','public_view_before_stage3']){
  const body=await q(`select pg_get_functiondef('ml_private.${name}(${name.startsWith('public_view')?'jsonb,integer':'jsonb'})'::regprocedure) v`);await db.exec(patchGObserver(name,body.replaceAll("'web-v0.1.17'","'web-v0.1.17','web-v0.1.18'")));
 }
 const watch=await q("select pg_get_functiondef('ml_private.watch_view(ml_private.rooms,ml_private.spectators,bigint)'::regprocedure) v");await db.exec(patchGObserver('watch_view',watch));
 // The live playable pool remains v17. This private test name helper only reads the explicit dev catalog.
 await db.exec("create or replace function ml_private.name(s jsonb,a integer) returns text language sql stable set search_path=pg_catalog,ml_private as $$select 'S'||(a+1)||' '||(ml_private.version_catalog(s->>'version')#>>array['runtimeData','characters',s#>>array['players',a::text,'character'],'name'])$$;");
});
const observer=()=>gFixture(['character-012','character-048','character-025','character-031']);
it('real classic refresh/environment staging hooks match every TS state, RNG and hazard hit field',async()=>{
 for(const scripted of [false,true]){const s=observer();if(scripted){s.classic!.poison=poisonRegions(s.version);s.random.bombs=['教学楼','操场'];}const before=structuredClone(s);refreshClassicRound(s);expect(await q('select ml_private.classic_refresh($1::jsonb) v',[JSON.stringify(before)])).toEqual(s);const plan=structuredClone(s.stage3!.g!.forecast),env=structuredClone(s),hits=classicEnvironmentHits(s),sql=await q('select ml_private.classic_environment($1::jsonb) v',[JSON.stringify(env)]);expect(sql._hits).toEqual(hits);delete sql._hits;expect(sql).toEqual(s);expect(s.classic!.bombs).toEqual(plan!.regions);}
});
it('new-round forecast lifecycle matches TS for temporarily absent, dead and revived observers',async()=>{
 const s=observer();s.stage4!.offMap[0]=true;for(const hp of [3,0,1]){s.players[0].hp=hp;const before=structuredClone(s);refreshClassicRound(s);expect(await q('select ml_private.classic_refresh($1::jsonb) v',[JSON.stringify(before)])).toEqual(s);expect(Boolean(s.stage3!.g!.forecast)).toBe(hp>0);s.round++;}
});
it('a reserved forecast survives owner death and consumes no further bomb RNG at round end',async()=>{
 const s=observer();refreshClassicRound(s);s.players[0].hp=0;s.random.bombs=['教学楼','操场'];const before=structuredClone(s),hits=classicEnvironmentHits(s),sql=await q('select ml_private.classic_environment($1::jsonb) v',[JSON.stringify(before)]);expect(sql._hits).toEqual(hits);delete sql._hits;expect(sql).toEqual(s);expect(s.random.bombs).toEqual(['教学楼','操场']);
});
it('forecast and checkpoint privacy match for all four player projections and the spectator projection',async()=>{
 const s=observer();refreshClassicRound(s);(s.stage3!.g as any).dice={driver:{secret:'private'},waiting:{raw:6}};for(const a of [-1,0,1,2,3]){const sql=await q('select ml_private.p3g_public_state($1::jsonb,$2) v',[JSON.stringify(s),a]);expect(sql).toEqual(gPublicState(s,a));expect(sql).not.toHaveProperty('dice');expect(sql).not.toHaveProperty('invisEndTurn');if(a>0)expect(sql).not.toHaveProperty('forecast');}
});
it('no-observer and saved v17 keep the same refresh/environment behavior in TS and SQL',async()=>{
 for(const legacy of [false,true]){const s=gFixture();if(legacy)s.version='web-v0.1.17';const before=structuredClone(s);refreshClassicRound(s);expect(await q('select ml_private.classic_refresh($1::jsonb) v',[JSON.stringify(before)])).toEqual(s);const env=structuredClone(s),hits=classicEnvironmentHits(s),sql=await q('select ml_private.classic_environment($1::jsonb) v',[JSON.stringify(env)]);expect(sql._hits).toEqual(hits);delete sql._hits;expect(sql).toEqual(s);}
});
it('card identity targeting matches TS/SQL for all76 cards, self/other viewers and legacy versions',async()=>{
 const s=observer();s.stage3!.g!.invisible[0]=true;for(const card of Object.keys(runtimeForVersion(s.version).cards))for(const a of [0,1])expect(await q('select ml_private.p3g_card_target_allowed($1::jsonb,$2,0,$3) v',[JSON.stringify(s),a,card])).toBe(gCardTargetAllowed(s,a,0,card));s.version='web-v0.1.17';expect(await q("select ml_private.p3g_card_target_allowed($1::jsonb,1,0,'basic-006') v",[JSON.stringify(s)])).toBe(true);
});
const p={...ports,die:(s:GameState,reason:string,owner:number|null=null)=>die(s,owner,reason),select:(s:GameState,kind:any,a:number,at:number,extra:any={})=>{ports.select(s,kind,a,at,extra);s.events.at(-1)!.text=`S${a+1} ${runtimeForVersion(s.version).characters[s.players[a].character].name} 等待选择：${kind}`;}};
it('end task list, one30s invisibility window and duplicate-task suppression match TS/SQL',async()=>{
 const s=observer(),t:Task={kind:'stage3',action:'g-invisible',actor:0};expect(await q('select ml_private.p3g_end_tasks($1::jsonb) v',[JSON.stringify(s)])).toEqual(gEndTasks(s));for(let n=0;n<2;n++){const before=structuredClone(s);expect(gObserverTask(s,t,s.time+1,p)).toBe(true);const sql=await q('select ml_private.p3g_observer_task($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(before),JSON.stringify(t),s.time+1]);delete sql._gObserverHandled;expect(sql).toEqual(s);}expect(s.choice!.deadline-s.time).toBe(30001);
});
it('successful, failed, declined and timed-out invisibility choices preserve the whole TS/SQL state',async()=>{
 for(const [accept,timeout,roll] of [[true,false,6],[true,false,2],[false,false,6],[true,true,6]] as const){const s=observer();s.random.dice=[roll];gObserverTask(s,{kind:'stage3',action:'g-invisible',actor:0},s.time+1,p);(s as any)._gReplay={index:0,steps:[],now:s.time+2,logicalAt:s.time+2,continued:false};const before=structuredClone(s),cmd={type:'choose' as const,id:'g-invis-sql',revision:s.revision,actor:0,choice:s.choice!.id,accept};expect(gObserverChoose(s,cmd,s.time+2,p,timeout)).toBe(true);const sql=await q('select ml_private.p3g_observer_choose($1::jsonb,$2::jsonb,$3,$4) v',[JSON.stringify(before),JSON.stringify(cmd),s.time+2,timeout]);delete sql._gObserverHandled;expect(sql).toEqual(s);}
});

it('actual player and spectator projection hooks never borrow seat1 privacy permissions',async()=>{
 for(const seat of [0,1,2,3]){const s=observer();s.players[0].character='character-048';s.players[seat].character='character-012';refreshClassicRound(s);(s.stage3!.g as any).dice={driver:{secret:'must-never-leak'}};
  for(const viewer of [0,1,2,3]){const v=await q('select ml_private.public_view($1::jsonb,$2) v',[JSON.stringify(s),viewer]);expect(v.stage3.g).toEqual(gPublicState(s,viewer));expect(JSON.stringify(v)).not.toContain('must-never-leak');}
  const room={id:'00000000-0000-4000-8000-000000000001',code:'1234',status:'playing',mode:'ffa',members:[null,null,null,null],revision:0,game:s},watch={id:'00000000-0000-4000-8000-000000000002',epoch:1};
  const v=await q('select ml_private.watch_view(jsonb_populate_record(null::ml_private.rooms,$1::jsonb),jsonb_populate_record(null::ml_private.spectators,$2::jsonb),1000) v',[JSON.stringify(room),JSON.stringify(watch)]);expect(v.role).toBe('spectator');expect(v.game.stage3.g).toEqual(gPublicState(s,-1));expect(JSON.stringify(v)).not.toContain('must-never-leak');
 }
});
