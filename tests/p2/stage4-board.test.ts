import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame} from '../../packages/game-core/src/index';
import * as b from '../../packages/game-core/src/stage4-board';
import {nativeLandings,stepCost,classicEnvironmentHits} from '../../packages/game-core/src/classic';
import type {GameState} from '../../packages/game-core/src/types';
import type {EquipmentSource} from '../../packages/game-core/src/stage3-resources';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture():GameState{
 return createGame({mode:'team',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters:['character-048','character-040','character-026','character-005'],teams:['A','A','B','B'],first:0},1000);
}
const effect=(s:GameState,actor=0):EquipmentSource=>({origin:'card',actor,faction:s.players[actor].faction,roleModifiers:[]});
async function sql(name:string,s:GameState,...args:unknown[]){return (await db.query<{v:any}>(`select ml_private.${name}($1::jsonb${args.map((_,i)=>',$'+(i+2)).join('')}) v`,[JSON.stringify(s),...args])).rows[0].v;}
it('dynamic water preserves base water, supports role immunity and does not change the map or native family traits',async()=>{
 const s=fixture(),source=effect(s);s.stage4!.water['教学楼']={owner:0,effect:source};
 for(const a of [0,1,2,3])for(const cell of ['r1c2','r3c3'])expect(await sql('stage4_board_water',s,cell,a)).toBe(b.boardWater(s,cell,a));
 expect(b.boardWater(s,'r1c2',2)).toBe(true);source.roleModifiers=[{actor:0,kind:'cost'}];
 expect(b.boardWater(s,'r1c2',2)).toBe(false);expect(await sql('stage4_board_water',s,'r1c2',2)).toBe(false);
});
it('region blocks follow current teammates, exempt QB and role-modified effects against Mei, then expire on the owner start',async()=>{
 const s=fixture();s.stage4!.blocks=[{owner:0,region:'教学楼',until:2,effect:effect(s),exempt:[]}];
 expect(b.boardEntryAllowed(s,1,'r1c2')).toBe(true);expect(b.boardEntryAllowed(s,2,'r1c2')).toBe(false);expect(b.boardEntryAllowed(s,3,'r1c2')).toBe(true);
 for(const a of [0,1,2,3])expect(await sql('stage4_board_entry',s,a,'r1c2')).toBe(b.boardEntryAllowed(s,a,'r1c2'));
 s.stage4!.blocks[0].effect.roleModifiers=[{actor:0,kind:'cost'}];expect(b.boardEntryAllowed(s,2,'r1c2')).toBe(true);
 s.stage3!.starts[0]=2;const old=structuredClone(s);b.expireBoardStatuses(s,0);expect(await sql('stage4_expire_board',old,0)).toEqual(s);expect(s.stage4!.blocks).toEqual([]);
});
it('off-map players are alive but do not occupy their saved cell, including ordinary occupied() callers',async()=>{
 const s=fixture();s.players[2].cell='r1c2';s.stage4!.offMap[2]=true;
 expect(b.onBoard(s,2)).toBe(false);expect(s.players[2].hp).toBe(4);expect(b.boardEmptyEntry(s,0,'r1c2')).toBe(true);
 expect(await sql('stage4_board_empty',s,0,'r1c2')).toBe(true);expect(await sql('occupied',s,'r1c2',-1)).toBe(false);
});
it('water-forbidden mounts reject newly flooded land for native characters, while a blocked/farm cell remains blocked',async()=>{
 const s=fixture();s.stage4!.water['教学楼']={owner:0,effect:effect(s)};s.stage3!.equipment[1]=['basic-063#01'];
 expect(b.boardEntryAllowed(s,1,'r1c2')).toBe(false);expect(await sql('stage3_can_enter',s,1,'r1c2')).toBe(false);
 s.classic!.farmClosed=true;expect(b.boardEntryAllowed(s,1,'r1c1')).toBe(false);expect(await sql('stage4_board_entry',s,1,'r1c1')).toBe(false);
});
it('shortest forced path prefixes agree for multiple regions, obstacles, both movement limits and cave stopping',async()=>{
 for(const from of ['r1c8','r2c1','r3c1','r4c8'])for(const region of ['教学楼','操场','秀松苑'])for(const limit of [1,3]){
  const s=fixture();s.players[0].cell=from;const expected=b.forcedRegionPaths(s,0,region,limit);
  expect(await sql('stage4_forced_paths',s,0,region,limit),from+'/'+region+'/'+limit).toEqual(expected);
  for(const path of expected)expect(path.length).toBeLessThanOrEqual(limit);
 }
});
it('native leaps use dynamic contiguous water and only legal unoccupied landings',async()=>{
 const s=fixture();s.players[1].cell='r1c1';s.stage4!.water['教学楼']={owner:0,effect:effect(s)};
 expect(await sql('classic_landings',s,1)).toEqual(nativeLandings(s,1));
 for(const cell of ['r1c2','r1c4','r2c1'])expect(await sql('classic_step_cost',s,1,cell)).toBe(stepCost(s,1,cell));
});
it('environment excludes the living off-map token without removing it from victory groups',async()=>{
 const s=fixture();s.stage4!.offMap[2]=true;s.classic!.poison=['教学楼'];s.players[2].cell='r1c2';
 const old=structuredClone(s),hits=classicEnvironmentHits(s);const actual=await sql('classic_environment',old);expect(actual._hits).toEqual(hits);delete actual._hits;expect(actual).toEqual(s);expect(hits.some(h=>h.target===2)).toBe(false);
});
it('single-target protection and LMM operate only while their owner remains on the map',async()=>{
 const s=fixture();s.stage4!.toiletUntil[2]=1;s.stage4!.lmmUntil[3]=1;
 expect(await sql('stage4_single_protected',s,0,2)).toBe(b.boardSingleProtected(s,0,2));
 expect(await sql('stage4_lmm_target',s,0,JSON.stringify([2,3]))).toBe(b.boardLmmTarget(s,0,[2,3]));
 s.stage4!.offMap[3]=true;expect(await sql('stage4_lmm_target',s,0,JSON.stringify([2,3]))).toBeNull();
});
