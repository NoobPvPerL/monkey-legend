import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {fixture,give,equip,run,drain} from './p3-fixture';
import {teleportCells} from '../../packages/game-core/src/index';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {createStage3Draft} from '../../packages/game-core/src/draft';
import {databaseReady as currentReady} from '../../packages/online/src/version';
const databaseReady=(h:unknown)=>currentReady(h,{ruleVersion:'web-v0.1.13',engineRevision:24,stage4:true});
const db=await database(undefined,24);afterAll(()=>db.close());
const potato=(v:'web-v0.1.12'|'web-v0.1.13'='web-v0.1.13')=>fixture(v,['character-048','character-037','character-025','character-026']);
async function hit(s:ReturnType<typeof potato>){give(s,0,'basic-009#01');s.random.dice=[6];return run(db,s,{type:'play',card:'basic-009#01',targets:[1]});}
it('v13 offers the full board including water and far land, while v12 keeps its saved range/text',async()=>{
 for(const v of ['web-v0.1.12','web-v0.1.13'] as const){const s=potato(v),cells=teleportCells(s,1);expect((await db.query<{v:string[]}>('select ml_private.teleport_cells($1::jsonb,1) v',[JSON.stringify(s)])).rows[0].v).toEqual(cells);expect(cells.includes('r4c8')).toBe(v==='web-v0.1.13');expect(cells.includes('r4c7')).toBe(v==='web-v0.1.13');expect(cells).not.toContain(s.players[0].cell);}
 const random={seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false};expect((await db.query<{v:unknown}>('select ml_private.stage4_create_draft($1,$2::jsonb,1000) v',['team',JSON.stringify(random)])).rows[0].v).toEqual(createStage3Draft('team',random,1000,'web-v0.1.13'));
 expect(runtimeForVersion('web-v0.1.12').characters['character-037'].text).toContain('≤3');expect(runtimeForVersion('web-v0.1.13').characters['character-037'].text).toContain('可进入水域');
});
it('actual injury opens30 seconds, far-water entry spends one use and requests the ordinary water discard',async()=>{
 let s=potato();give(s,1,'basic-039#01');s=await hit(s);expect(s.players[1].hp).toBe(4);expect(s.choice).toMatchObject({kind:'teleport',actor:1});expect(s.choice!.deadline-s.time).toBe(30000);const c=s.choice!;
 await run(db,s,{type:'choose',choice:c.id,cell:s.players[0].cell},false);
 s=await run(db,s,{type:'choose',choice:c.id,cell:'r4c7'});expect(s.players[1]).toMatchObject({cell:'r4c7',skillUsed:true});expect(s.choice).toMatchObject({kind:'water-discard',actor:1,count:1});s=await drain(db,s);s.players[0].cell='r3c8';s=await hit(s);expect(s.choice?.kind).not.toBe('teleport');
});
it('cancel/timeout keep the use; no actual damage or death never opens teleport',async()=>{
 let s=await hit(potato());s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:null});expect(s.players[1].skillUsed).toBe(false);s=await hit(s);s=await run(db,s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].skillUsed).toBe(false);
 s=potato();s.players[1].shield=1;s=await hit(s);expect(s.players[1].hp).toBe(5);expect(s.choice).toBeNull();s=potato();s.players[1].hp=1;s=await drain(db,await hit(s));expect(s.players[1].hp).toBe(0);expect(s.choice).toBeNull();
});
it('closed farm, blocked regions and mount water restrictions remain authoritative',async()=>{
 const s=potato();s.round=5;s.classic!.farmClosed=true;s.stage4!.blocks.push({region:'云上学府',owner:0,until:10,exempt:[],effect:{actor:0,faction:'中立',card:'basic-023',origin:'card',roleModifiers:[]} as any});equip(s,1,'basic-063#01');const cells=teleportCells(s,1);expect(cells).not.toContain('r1c1');expect(cells).not.toContain('r4c8');expect(cells).not.toContain('r4c7');expect((await db.query<{v:string[]}>('select ml_private.teleport_cells($1::jsonb,1) v',[JSON.stringify(s)])).rows[0].v).toEqual(cells);
});
it('024 is atomic/repeatable, retains v12 catalog and current health requires24 plus potato readiness',async()=>{
 const old=await database(undefined,23);try{const migration=await readFile('database/migrations/024_p3_potato_teleport.sql','utf8'),q=async(sql:string)=>(await old.query<{v:any}>(sql)).rows[0].v,atomic=(s:string)=>`DO $outer$ BEGIN EXECUTE $body$${s}$body$;END $outer$;`;const profiles=await old.query('select key,value from ml_private.catalog order by key');expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);await expect(old.exec(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(23);await old.exec(atomic(migration));await old.exec(atomic(migration));expect(await old.query("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.13' order by key")).toEqual(profiles);const h=await q('select public.ml_health() v');expect(h).toMatchObject({engineRevision:24,ruleVersion:'web-v0.1.13',potatoRulesReady:true,characterDefinitions:18});expect(databaseReady(h)).toBe(true);expect(databaseReady({...h,potatoRulesReady:false})).toBe(false);const verification=await old.exec(await readFile('tests/p2/fixtures/verify-revision24.sql','utf8'));for(const result of verification)for(const row of result.rows)for(const [key,value] of Object.entries(row))if(key.endsWith('_ready'))expect(value,key).toBe(true);}finally{await old.close();}
});
