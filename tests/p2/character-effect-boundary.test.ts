import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {roleEffectAllowed,modifiedByRole} from '../../packages/game-core/src/character-effects';
import type {CharacterEffect,EffectOrigin,RoleModifier} from '../../packages/game-core/src/character-effects';
import {familyForName,characterFamily,factionDraftPools} from '../../packages/game-data/src/character-affiliation';
import {sourceCatalogForVersion,runtimeForVersion} from '../../packages/game-data/src/index';
const mei={seat:2,character:'character-026'},xie={seat:3,character:'character-044'};
const effect=(origin:EffectOrigin,actor:number|null=0):CharacterEffect=>({origin,actor,roleModifiers:[]});
const db=await database();afterAll(()=>db.close());
it('Mei vetoes every foreign role skill before other permission rules, including beneficial, passive and locked effects',()=>{
 for(const kind of ['role-active','role-passive','role-locked'] as const)expect(roleEffectAllowed(effect(kind),mei)).toBe(false);
 for(const kind of ['card','equipment','location','environment'] as const)expect(roleEffectAllowed(effect(kind),mei)).toBe(true);
 expect(roleEffectAllowed(effect('role-locked',mei.seat),mei)).toBe(true);
});
it('Mei drops a whole currently modified card/equipment effect for any foreign skill involvement, including a zero-cost-only modifier',()=>{
 for(const kind of ['cost','target','damage','movement','conversion','other'] as RoleModifier['kind'][])for(const origin of ['card','equipment'] as const){
  const base=effect(origin);const tagged=modifiedByRole(base,{actor:0,kind});expect(roleEffectAllowed(tagged,mei)).toBe(false);expect(base.roleModifiers).toEqual([]);
 }
});
it('historical skill acquisition alone does not taint a later normal play; own modifiers do not count as another role',()=>{
 const laterPlay=effect('card');expect(roleEffectAllowed(laterPlay,mei)).toBe(true);
 expect(roleEffectAllowed(modifiedByRole(laterPlay,{actor:mei.seat,kind:'cost'}),mei)).toBe(true);
});
it('Xie rejects foreign active skills, but retains normal passive/locked/card interactions',()=>{
 expect(roleEffectAllowed(effect('role-active'),xie)).toBe(false);
 for(const kind of ['role-passive','role-locked','card','equipment','location','environment'] as const)expect(roleEffectAllowed(effect(kind),xie)).toBe(true);
});
it('owner Q1 maps all 16 metadata roles into exact 12/15 overlapping pools without enabling them in the live four-role runtime',()=>{
 const ids=Object.keys(sourceCatalogForVersion('web-v0.1.4').characters),pools=factionDraftPools(ids);
 expect(ids.filter(id=>characterFamily(id)==='机械猴子')).toEqual(['character-045']);
 expect(ids.filter(id=>characterFamily(id)==='帝汶家族')).toEqual(['character-004','character-006','character-010','character-040']);
 expect(pools['机械猴子']).toHaveLength(12);expect(pools['帝汶家族']).toHaveLength(15);
 expect(pools['机械猴子'].filter(id=>pools['帝汶家族'].includes(id))).toHaveLength(11);
 expect(runtimeForVersion('web-v0.1.5').characterIds).toHaveLength(4);
 expect(familyForName('猴十八')).toBe('机械猴子');expect(familyForName('中帝汶')).toBe('帝汶家族');expect(familyForName('猴子游戏')).toBe('中立');
 expect(()=>factionDraftPools(['character-002','character-002'])).toThrow();expect(()=>characterFamily('unknown')).toThrow();
});
it('SQL enforces the same highest-priority boundary for all modifier types and source kinds',async()=>{
 for(const target of [mei,xie])for(const origin of ['card','equipment','role-active','role-passive','role-locked','environment'] as const){
  for(const actor of [0,target.seat])for(const modifier of [null,'cost','target','damage','movement','conversion'] as const){
   const base=effect(origin,actor),input=modifier?modifiedByRole(base,{actor:0,kind:modifier}):base;
   const sql=(await db.query<{v:boolean}>('select ml_private.character_effect_allowed($1::jsonb,$2,$3) v',[JSON.stringify(input),target.seat,target.character])).rows[0].v;
   expect(sql).toBe(roleEffectAllowed(input,target));
  }
 }
});
