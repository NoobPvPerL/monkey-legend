import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {initialStage3Resources,cardApCost} from '../../packages/game-core/src/stage3-resources';
import * as r from '../../packages/game-core/src/stage3-roles';
import type {RoleBoard} from '../../packages/game-core/src/stage3-roles';
import {STAGE3_CHARACTERS} from '../../packages/game-data/src/stage3';
const db=await database();afterAll(()=>db.close());
const sql=async(name:string,s:RoleBoard,args:unknown[]=[])=>((await db.query<{v:any}>(`select ml_private.${name}($1::jsonb${args.map((_,i)=>',$'+(i+2)).join('')}) v`,[JSON.stringify(s),...args])).rows[0].v);
function fixture(ids=['character-045','character-006','character-026','character-044']):RoleBoard{return {mode:'ffa',farmClosed:false,discard:[],stage3:initialStage3Resources(),players:ids.map((character,seat)=>({seat,character,team:seat<2?'A':'B',faction:STAGE3_CHARACTERS[character].faction,hp:STAGE3_CHARACTERS[character].hp,maxHp:STAGE3_CHARACTERS[character].hp,ap:5,shield:0,cell:['r1c2','r1c3','r2c2','r2c3'][seat],hand:[],eliminated:null}))};}
it('faction snapshot protects North only from other non-mechanical cards, including beneficial effects; Mei takes priority over all added role modifiers',async()=>{
 const s=fixture();for(const actor of [0,1,2])for(const faction of ['机械猴子','帝汶家族','中立'])for(const modified of [false,true]){
  const effect={origin:'card' as const,actor,faction,roleModifiers:modified?[{actor:0,kind:'cost' as const}]:[]};for(const t of [1,2])expect(await sql('stage3_card_allowed',s,[t,'basic-046#01',effect])).toBe(r.cardEffectAllowed(s,t,'basic-046#01',effect));
 }
 expect(r.cardEffectAllowed(s,1,'basic-046#01',{origin:'card',actor:2,faction:'中立',roleModifiers:[]})).toBe(false);
 expect(r.cardEffectAllowed(s,1,'basic-046#01',{origin:'card',actor:1,faction:'帝汶家族',roleModifiers:[]})).toBe(true);
});
it('QB uses printed 建民 tags rather than guessing all damaging cards are 建民; converted material identity is discarded',async()=>{
 const s=fixture(['character-023','character-005','character-026','character-044']),effect=cardApCost(s,0,'basic-002#01').effect;
 expect(r.cardEffectAllowed(s,1,'basic-006#01',effect)).toBe(true);
 for(const id of ['basic-002','basic-006','basic-017'])expect(await sql('stage3_card_allowed',s,[1,id+'#01',effect])).toBe(r.cardEffectAllowed(s,1,id+'#01',effect));
});
it('JJ exposure adds one target to food/attack, preserves equipment/response, and marks the whole current card for Mei veto',async()=>{
 const s=fixture(['character-045','character-003','character-026','character-044']);s.stage3.jjExposed[1]=true;
 for(const card of ['basic-046#01','basic-010#01','basic-054#01','basic-001#01']){const effect=cardApCost(s,0,card).effect,res=r.withExposedJj(s,0,card,[2],effect);expect(await sql('stage3_jj_targets',s,[0,card,[2],effect])).toEqual(res);if(['basic-046#01','basic-010#01'].includes(card)){expect(res.targets).toEqual([2,1]);expect(r.cardEffectAllowed(s,2,card,res.effect)).toBe(false);}}
 const effect=cardApCost(s,0,'basic-010#01').effect;expect(r.withExposedJj(s,0,'basic-010#01',[1],effect).targets).toEqual([1]);
});
it('Yinghao removes monkey geography restrictions but still excludes allies and one-card student',async()=>{
 const s=fixture(['character-045','character-027','character-004','character-044']);s.players[1].hand=['x'];s.players[2].cell='r4c1';s.players[3].cell='r4c8';
 expect(r.monkeyTargets(s,0)).toEqual([2,3]);expect(await sql('stage3_monkey_targets',s,[0])).toEqual([2,3]);s.mode='team';expect(r.monkeyTargets(s,0)).toEqual([2,3]);s.players[0].character='character-031';expect(r.monkeyTargets(s,0)).toEqual([]);
});
it('Xie takes a participation-time snapshot of same region or adjacent cell, not every cell in neighbouring regions',async()=>{
 const s=fixture(['character-044','character-045','character-031','character-026']);s.players[0].cell='r1c2';s.players[1].cell='r2c3';s.players[2].cell='r2c5';s.players[3].cell='r1c3';
 expect(r.monkeyLedgerCandidates(s,0,1,[2,3])).toEqual([1]);expect(await sql('stage3_ledger_candidates',s,[0,1,[2,3]])).toEqual([1]);
});
it('East may draw jointly with enemies or steal a random card, but cannot target Mei /Xie or empty hands for steal',async()=>{
 const s=fixture(['character-010','character-031','character-026','character-044']);for(const kind of ['draw','steal'] as const){expect(await sql('stage3_east_targets',s,[0,kind])).toEqual(r.eastTargets(s,0,kind));}expect(r.eastTargets(s,0,'draw')).toEqual([1]);expect(r.eastTargets(s,0,'steal')).toEqual([]);s.players[1].hand=['x'];expect(r.eastTargets(s,0,'steal')).toEqual([1]);
});
it('Assam heals nearby living teammates and self; same family opponents in FFA remain enemies',async()=>{
 const s=fixture();s.mode='team';expect(await sql('stage3_assam_targets',s,[0])).toEqual([0,1]);expect(r.assamTargets(s,0)).toEqual([0,1]);s.mode='ffa';expect(r.assamTargets(s,0)).toEqual([0]);
});
it('West declares one straight direction, odd d6 reverses it, and cannot turn during native leaps',async()=>{
 for(const d of r.DIRECTIONS)for(let die=1;die<=6;die++)expect((await db.query<{v:string}>('select ml_private.stage3_west_direction($1,$2) v',[d,die])).rows[0].v).toBe(r.westDirection(d,die));
 for(const [from,to,direction] of [['r3c2','r3c4','right'],['r3c2','r2c4','right'],['r3c2','r3c1','right']] as const)expect((await db.query<{v:boolean}>('select ml_private.stage3_west_step($1,$2,$3) v',[from,to,direction])).rows[0].v).toBe(r.westStepAllowed(from,to,direction));
});
it('locked elbow affects Xie, converted active elbow does not, and Mei rejects both; a blocked victim has no push direction',async()=>{
 const s=fixture(['character-023','character-031','character-026','character-044']);for(const converted of [true,false])expect(await sql('stage3_elbow_targets',s,[0,converted])).toEqual(r.elbowTargets(s,0,converted));expect(r.elbowTargets(s,0,false)).toEqual([1,3]);expect(r.elbowTargets(s,0,true)).toEqual([1]);
 expect(await sql('stage3_elbow_cells',s,[0,1])).toEqual(r.elbowPushCells(s,0,1));
});
it('Yinghao pushes a single token along a legal ray, stops before a third token, cannot push Mei and may push Xie',async()=>{
 const s=fixture();s.players[0].cell='r1c1';s.players[1].cell='r1c2';s.players[2].cell='r1c6';s.players[3].cell='r3c2';
 expect(r.collisionPath(s,0,1,'right')).toEqual(['r1c3','r1c4','r1c5']);expect(await sql('stage3_collision_path',s,[0,1,'right'])).toEqual(['r1c3','r1c4','r1c5']);expect(r.collisionPath(s,0,2,'right')).toEqual([]);expect(r.collisionPath(s,0,3,'down')).toEqual(['r4c2']);
 s.farmClosed=true;expect(r.collisionPath(s,0,1,'left')).toEqual([]);
});
it('West carries only an initially adjacent susceptible living token to an empty endpoint neighbour, and cancels if that token moved in between',async()=>{
 const s=fixture(['character-040','character-031','character-026','character-044']);s.players[0].cell='r2c2';s.players[1].cell='r2c3';s.players[2].cell='r2c1';s.players[3].cell='r1c2';const candidates=r.carryCandidates(s,0,'r2c2');expect(candidates).toEqual([{actor:1,origin:'r2c3'}]);expect(await sql('stage3_carry_candidates',s,[0,'r2c2'])).toEqual(candidates);
 s.players[0].cell='r3c4';expect(await sql('stage3_carry_destinations',s,[0,1,'r2c3'])).toEqual(r.carryDestinations(s,0,1,'r2c3'));s.players[1].cell='r2c4';expect(r.carryDestinations(s,0,1,'r2c3')).toEqual([]);
});
