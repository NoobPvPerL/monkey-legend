import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {CLASSIC_RULE_VERSION as v,mapForVersion,characterTraitsForVersion,ruleManifest} from '../../packages/game-data/src/index';
import {basicMoveCost,normalDrawCount,personalStartAp,foodHealing,locationCardAllowed,locationEffectAllowed,stopsWalking,canWalkThrough,locationDestinations,applyLocationTeleport} from '../../packages/game-core/src/locations';
const db=await database();afterAll(()=>db.close());
const scalar=async(sql:string,args:unknown[]=[])=>(await db.query<{v:any}>(sql,args)).rows[0].v;
const p=(patch:Record<string,unknown>={})=>({character:'character-031',cell:'r1c1',ap:2,hp:1,maxHp:3,...patch});
it('lemon is a Dimon-family retainer with playground birth/revival, without a fractional numeric rule',async()=>{
 const trait=characterTraitsForVersion(v,'character-004');expect(trait).toEqual({faction:'帝汶家族',familyRole:'随从',waterNative:true,spawnRegion:'操场',revivalRegion:'操场'});expect(ruleManifest(v).spawnConflicts).toEqual([]);
 const profile=await scalar('select ml_private.version_catalog($1) v',[v]);expect(profile.characterTraits['character-004']).toEqual(trait);expect(profile.manifest.spawnConflicts).toEqual([]);
 const result=await scalar('select ml_private.allocate_spawns($1,$2::jsonb,$3::jsonb) v',[v,JSON.stringify(['character-004','character-031','character-027','character-037']),JSON.stringify({random:{seed:9}})]);
 expect(mapForVersion(v).map[result._spawns[0]].region).toBe('操场');expect(new Set(result._spawns).size).toBe(4);
});
it('playground origin costs zero even at zero AP; entering it from outside remains a paid movement',async()=>{
 for(const [version,cell,cost] of [[v,'r2c4',0],[v,'r3c4',0],[v,'r1c1',1],['web-v0.1.3','r4c1',1]] as const){expect(basicMoveCost(version,cell)).toBe(cost);expect(await scalar('select ml_private.location_basic_cost($1,$2) v',[version,cell])).toBe(cost);}
});
it('farm affects only normal personal-start draw; campus AP follows runner refill and skips round one',async()=>{
 for(const round of [1,2,9])for(const cell of ['r1c1','r1c6','r2c4']){
  expect(await scalar('select ml_private.location_draw_count($1,$2,$3) v',[v,cell,round])).toBe(normalDrawCount(v,cell,round));
  for(const character of ['character-031','character-027'])for(const ap of [0,6,9]){
   const player=p({cell,character,ap});expect(await scalar('select ml_private.location_personal_ap($1,$2::jsonb,$3) v',[v,JSON.stringify(player),round])).toBe(personalStartAp(v,player,round));
  }
 }
 expect(normalDrawCount(v,'r1c1',1)).toBe(0);expect(normalDrawCount(v,'r1c1',2)).toBe(3);expect(personalStartAp(v,p({cell:'r1c6'}),2)).toBe(7);expect(personalStartAp(v,p({cell:'r1c6'}),1)).toBe(6);
});
it('XDF adds one total healing, respects max HP and never overrides student food immunity',async()=>{
 for(const character of ['character-031','character-027'])for(const hp of [0,1,2,3])for(const cell of ['r2c1','r1c1']){
  const player=p({character,hp,cell}),amount=foodHealing(v,player,1);expect(await scalar('select ml_private.location_food_heal($1,$2::jsonb,1) v',[v,JSON.stringify(player)])).toBe(amount);
 }
 expect(foodHealing(v,p({cell:'r2c1'}),1)).toBe(2);expect(foodHealing(v,p({cell:'r2c1',character:'character-027'}),1)).toBe(0);
});
it('classroom/dorm restrictions apply to the user; office immunity is a distinct effect-time predicate',async()=>{
 for(const cell of ['r1c2','r1c4','r4c4','r2c4'])for(const card of ['basic-009','basic-010','basic-018','basic-008']){
  expect(await scalar('select ml_private.location_card_allowed($1,$2,$3) v',[v,cell,card])).toBe(locationCardAllowed(v,cell,card));
  expect(await scalar('select ml_private.location_effect_allowed($1,$2,$3) v',[v,cell,card])).toBe(locationEffectAllowed(v,cell,card));
 }
 expect(locationCardAllowed(v,'r1c2','basic-009')).toBe(false);expect(locationCardAllowed(v,'r2c4','basic-009')).toBe(true);
 expect(locationEffectAllowed(v,'r1c2','basic-009')).toBe(true);expect(locationEffectAllowed(v,'r4c4','basic-018')).toBe(false);expect(locationEffectAllowed(v,'r4c4','basic-008')).toBe(true);
});
it('cave walking must stop and cannot pass through an occupant; teleport destination rules stay separate',async()=>{
 expect(stopsWalking(v,'r2c8')).toBe(true);expect(canWalkThrough(v,'r2c8',true)).toBe(false);expect(canWalkThrough(v,'r2c4',true)).toBe(true);
 expect(await scalar('select ml_private.location_stops($1,$2) v',[v,'r2c8'])).toBe(true);
});
it('ship and commute validate personal action phase, AP, once-per-turn, occupancy and closed farm',async()=>{
 const state={version:v,round:2,phase:'action',choice:null,active:0,players:[p({cell:'r1c8'}),p({cell:'r4c8'})],shipUsed:[] as number[],farmClosed:false};
 for(const patch of [{},{phase:'moving'},{active:1},{choice:{id:1}},{shipUsed:[0]},{farmClosed:true}])for(const kind of ['ship','commute'] as const){
  const next={...state,...patch};expect(await scalar('select ml_private.location_destinations($1::jsonb,0,$2) v',[JSON.stringify(next),kind])).toEqual(locationDestinations(next,0,kind));
 }
 expect(locationDestinations(state,0,'ship')).toContain('r3c3');expect(locationDestinations(state,0,'commute')).toEqual([]);
 state.players[1].cell='r4c7';expect(locationDestinations(state,0,'commute')).toEqual(['r4c8']);
 state.players[0].ap=0;expect(locationDestinations(state,0,'ship')).toEqual([]);
});
it('ship spends no AP, records its turn use and leaves movement untouched; commute spends exactly all AP',async()=>{
 const state={version:v,round:2,phase:'action',choice:null,active:0,players:[p({cell:'r1c8',ap:9})],shipUsed:[] as number[],farmClosed:false,moved:false};
 const before=structuredClone(state),ship=applyLocationTeleport(state,0,'ship','r3c3');
 expect(ship.state.players[0].ap).toBe(9);expect(ship.state.shipUsed).toEqual([0]);expect(ship.arrival.water).toBe(true);expect(state).toEqual(before);expect((ship.state as typeof state).moved).toBe(false);
 expect(await scalar('select ml_private.location_teleport($1::jsonb,0,$2,$3) v',[JSON.stringify(state),'ship','r3c3'])).toEqual(ship);
 // Return-to-ship does not refresh its usage; the engine resets this only on the actor's next turn.
 ship.state.players[0].cell='r1c8';expect(()=>applyLocationTeleport(ship.state,0,'ship','r2c4')).toThrow();
 const commute=applyLocationTeleport(state,0,'commute','r4c8');expect(commute.state.players[0].ap).toBe(0);expect(commute.state.shipUsed).toEqual([]);expect(commute.arrival.water).toBe(false);
 expect(await scalar('select ml_private.location_teleport($1::jsonb,0,$2,$3) v',[JSON.stringify(state),'commute','r4c8'])).toEqual(commute);
 const occupied={...state,players:[...state.players,p({cell:'r4c8'})]};expect(()=>applyLocationTeleport(occupied,0,'commute','r4c8')).toThrow();await expect(scalar('select ml_private.location_teleport($1::jsonb,0,$2,$3) v',[JSON.stringify(occupied),'commute','r4c8'])).rejects.toThrow();expect(state).toEqual(before);
});
