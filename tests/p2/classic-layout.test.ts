import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {CLASSIC_CELLS,parseRegionCsv} from '../../packages/game-data/src/classic-map';
import {CELLS,CHARACTERS} from '../../packages/game-data/src/index';
import {databaseReady} from '../../packages/online/src/version';
import {eliminationCauses} from '../../apps/client/src/SettlementStats';
const csv=await readFile('docs/maps/classic-regions.csv','utf8');
it('classic CSV maps every row and column without changing old matches or inventing terrain',()=>{
 expect(parseRegionCsv(csv)).toEqual(CLASSIC_CELLS);expect(parseRegionCsv('\uFEFF'+csv.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'))).toEqual(CLASSIC_CELLS);
 expect(CLASSIC_CELLS).toHaveLength(32);expect(new Set(CLASSIC_CELLS.map(c=>c.region)).size).toBe(15);
 expect(CLASSIC_CELLS.find(c=>c.id==='r4c1')?.region).toBe('帝汶岛');expect(CELLS.find(c=>c.id==='r4c1')?.region).toBe('操场');
 expect(CHARACTERS['character-004'].spawn).toBe('r4c1');expect(CLASSIC_CELLS.every(c=>!('terrain' in c))).toBe(true);
 expect(()=>parseRegionCsv('region\n'+csv)).toThrow();expect(()=>parseRegionCsv(csv.replace('高唐农场','未知区域'))).toThrow();
 expect(()=>parseRegionCsv(csv.replace('高唐农场,教学楼','高唐农场'))).toThrow();
});
it('schema 2 alone cannot falsely report the headbutt/group patch ready',()=>{
 const full={ok:true,schemaVersion:2,ruleVersion:'web-v0.1.6',engineRevision:16,draftReady:true,characterSkillsReady:true,stage3Ready:true,classicPatchReady:true,feedbackRulesReady:true,versionedDataReady:true,locationDataReady:true,locationRulesReady:true,waterRulesReady:true,environmentRulesReady:true,classicPlayable:true};
 expect(databaseReady(full)).toBe(true);
 for(const value of [null,{ok:true,schemaVersion:2},{...full,engineRevision:15},{...full,draftReady:false},{...full,characterSkillsReady:false},{...full,stage3Ready:false},{...full,classicPatchReady:false},{...full,waterRulesReady:false},{...full,environmentRulesReady:false},{...full,classicPlayable:false},{...full,feedbackRulesReady:false},{...full,versionedDataReady:false},{...full,locationDataReady:false},{...full,ruleVersion:'web-v0.1.1'}])expect(databaseReady(value)).toBe(false);
});
it('settlement explains environmental elimination without attributing it to a player',()=>{
 expect([...eliminationCauses([{seq:1,type:'damage',text:'S2 美丽学子 普通伤害1，护盾抵挡0，实际失血1'},{seq:2,type:'damage',text:'S2 美丽学子 环境伤害2，护盾抵挡0，实际失血2'},{seq:3,type:'eliminate',text:'S2 美丽学子 淘汰（批次3）'}])]).toEqual([[1,'环境伤害']]);
});
