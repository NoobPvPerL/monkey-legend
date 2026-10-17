import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {STAGE3_CARDS,STAGE3_ALL_CARDS,STAGE3_CHARACTERS,STAGE3_CHARACTER_IDS,STAGE3_POLICY} from '../../packages/game-data/src/stage3';
import {ALL_CARDS,runtimeForVersion} from '../../packages/game-data/src/index';
import * as r from '../../packages/game-core/src/stage3-resources';
import {roleEffectAllowed} from '../../packages/game-core/src/character-effects';
const db=await database();afterAll(()=>db.close());
const q=async<T=any>(sql:string,args:unknown[]=[])=>((await db.query<{v:T}>(sql,args)).rows[0].v);
const sql=(name:string,s:r.ResourceState,args:unknown[]=[])=>q(`select ml_private.${name}($1::jsonb${args.map((_,i)=>',$'+(i+2)).join('')}) v`,[JSON.stringify(s),...args]);
function fixture(ids=['character-031','character-043','character-026','character-044']):r.ResourceState{
 return {players:ids.map((character,seat)=>({seat,character,team:seat<2?'A':'B',faction:STAGE3_CHARACTERS[character].faction,hp:STAGE3_CHARACTERS[character].hp,maxHp:STAGE3_CHARACTERS[character].hp,ap:5,shield:0,cell:['r1c1','r2c1','r3c1','r4c1'][seat],hand:[],eliminated:null})),stage3:r.initialStage3Resources(),discard:[]};
}
function equip(s:r.ResourceState,a:number,card:string){s.stage3.equipment[a].push(card);s.stage3.equipmentSources[card]={origin:'card',actor:a,faction:s.players[a].faction,roleModifiers:[]};}
async function mutate(s:r.ResourceState,name:string,args:unknown[],act:()=>unknown){const previous=structuredClone(s);act();expect(await sql(name,previous,args)).toEqual(s);}
it('stages exactly 23 definitions /85 conserved identities /16 source roles without changing old playable profiles',async()=>{
 expect(Object.keys(STAGE3_CARDS)).toHaveLength(23);expect(STAGE3_ALL_CARDS).toHaveLength(85);expect(new Set(STAGE3_ALL_CARDS).size).toBe(85);expect(STAGE3_CHARACTER_IDS).toHaveLength(16);
 expect(STAGE3_ALL_CARDS.filter(c=>c.startsWith('basic-037#'))).toEqual(['basic-037#01']);expect(ALL_CARDS.every(c=>STAGE3_ALL_CARDS.includes(c))).toBe(true);
 const content=await q('select ml_private.stage3_content() v');expect(content).toEqual({cards:STAGE3_CARDS,allCards:STAGE3_ALL_CARDS,characters:STAGE3_CHARACTERS,characterIds:STAGE3_CHARACTER_IDS,policy:STAGE3_POLICY});
 expect(await q('select ml_private.stage3_initial() v')).toEqual(r.initialStage3Resources());
 for(const v of ['web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5'])expect(runtimeForVersion(v).allCards).toHaveLength(64);
 expect((await q('select public.ml_health() v')).engineRevision).toBe(16);
});
it('siphons only the new AP crossing seven, never old overflow, and exempts Mei /Xie /collector itself',async()=>{
 for(const [before,amount,taken] of [[4,3,0],[5,8,6],[10,2,2]]){const s=fixture();s.players[0].ap=before;const previous=structuredClone(s),gain=r.gainAp(s,0,amount);expect(gain.taken).toBe(taken);expect(await sql('stage3_gain_ap',previous,[0,amount])).toEqual({...s,_gain:gain});}
 for(const a of [1,2,3]){const s=fixture(),previous=structuredClone(s),gain=r.gainAp(s,a,8);expect(gain.taken).toBe(0);expect(await sql('stage3_gain_ap',previous,[a,8])).toEqual({...s,_gain:gain});}
});
it('transfers HP-based excess immediately in action order; cannot expose hidden cards by requesting an invalid transfer',async()=>{
 const s=fixture();for(const p of s.players)p.hand=['a'+p.seat,'b'+p.seat,'c'+p.seat,'d'+p.seat];
 expect(r.overflowDonors(s,[3,2,1,0])).toEqual([{actor:0,count:1,collector:1}]);expect(await sql('stage3_overflow',s,[[3,2,1,0]])).toEqual(r.overflowDonors(s,[3,2,1,0]));
 const prior=structuredClone(s);expect(()=>r.transferOverflow(s,0,1,['missing'])).toThrow();expect(s).toEqual(prior);
 await mutate(s,'stage3_transfer_overflow',[0,1,['b0']],()=>r.transferOverflow(s,0,1,['b0']));expect(s.players[1].hand).toContain('b0');
 s.players[0].hp=1;expect(r.overflowDonors(s,[0])[0].count).toBe(2);
});
it('wait-sheep has no first-turn bonus; only a completed no-basic-move turn enables two full-die moves',async()=>{
 const s=fixture();equip(s,0,'basic-066#01');await mutate(s,'stage3_turn_start',[0],()=>r.startResourceTurn(s,0));expect(r.basicMoveAllowance(s,0)).toBe(1);expect(r.fullMovementDie(s,0)).toBe(false);
 await mutate(s,'stage3_turn_end',[0],()=>r.endResourceTurn(s,0));await mutate(s,'stage3_turn_start',[0],()=>r.startResourceTurn(s,0));expect(r.basicMoveAllowance(s,0)).toBe(2);expect(r.fullMovementDie(s,0)).toBe(true);
 s.stage3.basicUsed[0]=1;await mutate(s,'stage3_turn_end',[0],()=>r.endResourceTurn(s,0));await mutate(s,'stage3_turn_start',[0],()=>r.startResourceTurn(s,0));expect(r.basicMoveAllowance(s,0)).toBe(1);
});
it('white horse freezes other mounted owners only until its owner starts; any voluntary relocation suppresses it',async()=>{
 const s=fixture();equip(s,0,'basic-067#01');equip(s,1,'basic-071#01');r.startResourceTurn(s,0);
 await mutate(s,'stage3_turn_end',[0],()=>r.endResourceTurn(s,0));expect(r.mountMovementBlocked(s,1)).toBe(true);expect(r.mountMovementBlocked(s,0)).toBe(false);expect(r.mountMovementBlocked(s,2)).toBe(false);
 for(let a=0;a<4;a++)expect(await sql('stage3_mount_blocked',s,[a])).toBe(r.mountMovementBlocked(s,a));
 await mutate(s,'stage3_turn_start',[0],()=>r.startResourceTurn(s,0));expect(r.mountMovementBlocked(s,1)).toBe(false);s.stage3.voluntaryMoved[0]=true;await mutate(s,'stage3_turn_end',[0],()=>r.endResourceTurn(s,0));expect(s.stage3.horseLocks).toEqual([]);
});
it('Hakimi prohibits all water entry even for a native role; porridge maximises a positive heal without bypassing student food immunity',async()=>{
 const s=fixture(['character-004','character-027','character-026','character-044']);equip(s,0,'basic-063#01');
 for(const cell of ['r1c1','r4c8','missing'])expect(await sql('stage3_can_enter',s,[0,cell])).toBe(r.canEnterWithMount(s,0,cell));
 for(const a of [0,1]){equip(s,a,'basic-072#01');s.players[a].hp=1;for(const food of [true,false])for(const amount of [0,1,2])expect(await sql('stage3_healing',s,[a,amount,food])).toBe(r.resourceHealing(s,a,amount,food));}
 expect(r.resourceHealing(s,0,1,true)).toBe(4);expect(r.resourceHealing(s,1,1,true)).toBe(0);expect(r.resourceHealing(s,1,1,false)).toBe(3);
});
it('free equip fees retain their role lineage: Mei rejects a derived effect whose equip was skill discounted',async()=>{
 for(const [character,card] of [['character-006','basic-016#01'],['character-006','basic-006#01'],['character-048','basic-054#01'],['character-048','basic-066#01'],['character-003','basic-037#01']]){
  const s=fixture([character,'character-043','character-026','character-044']);s.stage3.jjFree[0]=character==='character-003';const cost=r.cardApCost(s,0,card,6);expect(cost.cost).toBe(0);expect(roleEffectAllowed(cost.effect,s.players[2])).toBe(false);expect(await sql('stage3_card_cost',s,[0,card,6])).toEqual(cost);
 }
});
it('coffee suppresses one common increment and the next personal-start gains, but card AP gains still work and repetition does not stack skips',async()=>{
 const s=fixture();r.startResourceTurn(s,0);
 for(let i=0;i<2;i++){const prior=structuredClone(s),gain=r.coffeeTaken(s,0);expect(await sql('stage3_coffee',prior,[0])).toEqual({...s,_gain:gain});}
 let prior=structuredClone(s),allowed=r.canGainRoundAp(s,0);expect(allowed).toBe(false);expect(await sql('stage3_round_gain_allowed',prior,[0])).toEqual({...s,_allowed:allowed});
 expect(r.canGainRoundAp(s,0)).toBe(true);r.startResourceTurn(s,0);prior=structuredClone(s);allowed=r.canGainStartAp(s,0);expect(allowed).toBe(false);expect(await sql('stage3_start_gain_allowed',prior,[0])).toEqual({...s,_allowed:false});expect(r.canGainStartAp(s,0)).toBe(true);
 expect(r.gainAp(s,0,2).gained).toBeGreaterThanOrEqual(0);
});
it('locks a revival quote per physical card /personal turn, cancellation and retries cannot reroll cheaper',async()=>{
 const s=fixture();r.startResourceTurn(s,0);s.players[0].hand=['basic-037#01'];let rolls=0;const prior=structuredClone(s),cost=r.lockRevivalCost(s,0,'basic-037#01',()=>{rolls++;return 6;});expect(await sql('stage3_lock_cost',prior,[0,'basic-037#01',6])).toEqual({...s,_cost:cost});
 const locked=structuredClone(s);expect(r.lockRevivalCost(s,0,'basic-037#01',()=>{rolls++;return 1;})).toBe(6);expect(rolls).toBe(1);expect(await sql('stage3_lock_cost',locked,[0,'basic-037#01',1])).toEqual({...s,_cost:6});
 r.startResourceTurn(s,0);expect(r.lockRevivalCost(s,0,'basic-037#01',()=>1)).toBe(1);
});
it('death discards all equipment once with no healing/teleport, clears exposure and permits a 1HP/0AP empty-hand revival in the fixed region',async()=>{
 const s=fixture(['character-004','character-043','character-026','character-044']);r.startResourceTurn(s,1);equip(s,0,'basic-054#01');equip(s,0,'basic-063#01');s.players[0].hp=0;s.players[0].ap=0;s.players[0].eliminated=2;s.stage3.jjExposed[0]=true;
 await mutate(s,'stage3_death',[0],()=>r.recordDeathResources(s,0));expect(s.stage3.equipment[0]).toEqual([]);expect(s.discard).toHaveLength(2);expect(s.players[0].cell).toBe('r1c1');expect(s.stage3.jjExposed[0]).toBe(false);
 const cells=r.revivalCells(s,0,false);expect(cells.length).toBeGreaterThan(0);expect(await sql('stage3_revival_cells',s,[0,false])).toEqual(cells);
 await mutate(s,'stage3_revive',[0,cells[0],false],()=>r.reviveResourcePlayer(s,0,cells[0],false));expect(s.players[0]).toMatchObject({hp:1,ap:0,shield:0,hand:[],eliminated:null});
});
it('revival expires after a full later personal turn; a closed or fully occupied spawn offers no legal revival',async()=>{
 const s=fixture();r.startResourceTurn(s,1);s.players[0].hp=0;s.players[0].eliminated=1;r.recordDeathResources(s,0);r.endResourceTurn(s,1);expect(r.revivalCells(s,0,false).length).toBeGreaterThan(0);
 r.startResourceTurn(s,2);r.endResourceTurn(s,2);expect(r.revivalCells(s,0,false)).toEqual([]);expect(await sql('stage3_revival_cells',s,[0,false])).toEqual([]);
 const farm=fixture();farm.players[0].hp=0;farm.players[0].eliminated=1;r.recordDeathResources(farm,0);expect(r.revivalCells(farm,0,true)).toEqual([]);expect(await sql('stage3_revival_cells',farm,[0,true])).toEqual([]);
});
it('equipment enforces slot capacities and no duplicate name, conserves replaced entities and carries original source modifiers',async()=>{
 const s=fixture();equip(s,0,'basic-071#01');const card='basic-066#01',source=r.cardApCost(s,0,card).effect;
 const options=r.equipmentReplacements(s,0,card);expect(options).toEqual({allowed:true,required:true,cards:['basic-071#01']});expect(await sql('stage3_equipment_options',s,[0,card])).toEqual(options);
 expect(()=>r.installEquipment(s,0,card,source,null)).toThrow();await mutate(s,'stage3_install',[0,card,source,'basic-071#01'],()=>r.installEquipment(s,0,card,source,'basic-071#01'));expect(s.discard).toContain('basic-071#01');expect(r.equipmentReplacements(s,0,'basic-066#02').allowed).toBe(false);
});
it('bread skip does not stack; two owner starts are required before reuse and the victim can still move /respond',async()=>{
 const s=fixture();equip(s,0,'basic-054#01');r.startResourceTurn(s,0);await mutate(s,'stage3_bread',[0,2],()=>r.useBread(s,0,2));expect(r.breadUseAllowed(s,0)).toBe(false);expect(s.stage3.breadPending[2]).toBe(true);
 r.startResourceTurn(s,2);expect(s.stage3.breadPending[2]).toBe(false);expect(s.stage3.breadBlocked[2]).toBe(true);expect(r.mountMovementBlocked(s,2)).toBe(false);
 r.startResourceTurn(s,0);expect(r.breadUseAllowed(s,0)).toBe(false);r.startResourceTurn(s,0);expect(r.breadUseAllowed(s,0)).toBe(true);
});
it('combos accumulate by the original team, pause while their owner is dead and resume on revival without copying history',async()=>{
 const s=fixture(['character-010','character-043','character-045','character-044']);for(const card of ['basic-015#01','basic-016#01','basic-037#01'])await mutate(s,'stage3_record_combo',[1,card],()=>r.recordCombo(s,1,card));
 expect(r.comboTeams(s)).toEqual(['A']);expect(await sql('stage3_combo_teams',s)).toEqual(['A']);s.players[0].hp=0;expect(r.comboTeams(s)).toEqual([]);s.players[0].hp=1;s.players[0].team='B';expect(r.comboTeams(s)).toEqual([]);
});
it('015 is repeatable and private without touching old profiles',async()=>{
 const migration=await readFile('database/migrations/015_stage3_resources.sql','utf8');const profiles=await q("select jsonb_agg(jsonb_build_object('key',key,'value',value) order by key) v from ml_private.catalog where key like 'ruleset:%'");await db.exec(migration);expect(await q("select jsonb_agg(jsonb_build_object('key',key,'value',value) order by key) v from ml_private.catalog where key like 'ruleset:%'")).toEqual(profiles);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.stage3_initial()')).rejects.toThrow(/permission denied/);await db.exec('reset role');}
});
it('a failed atomic 015 install leaves no catalog or functions behind',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readdir}=await import('node:fs/promises');const probe=new PGlite();try{
  await probe.exec('create role anon;create role authenticated;');for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<15).sort())await probe.exec(await readFile('database/migrations/'+file,'utf8'));
  const migration=await readFile('database/migrations/015_stage3_resources.sql','utf8');await expect(probe.query(`DO $outer$ BEGIN EXECUTE $payload$${migration}\nselect 1/0;$payload$;END $outer$;`)).rejects.toThrow(/division by zero/);
  expect((await probe.query<{v:any}>("select to_regprocedure('ml_private.stage3_initial()') v")).rows[0].v).toBeNull();expect((await probe.query<{v:any}>("select count(*)::int v from ml_private.catalog where key='stage3:content-v1'")).rows[0].v).toBe(0);
 }finally{await probe.close();}
});
