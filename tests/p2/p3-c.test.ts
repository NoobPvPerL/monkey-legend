import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {fixture,give,equip,run,drain} from './p3-fixture';
import {createGame,legalTargets,publicView,validateState} from '../../packages/game-core/src/index';
import {createStage3Draft} from '../../packages/game-core/src/draft';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
const db=await database(undefined,25);afterAll(()=>db.close());
const feather=()=>fixture('web-v0.1.14',['character-046','character-048','character-047','character-026']);
const primitive=()=>fixture('web-v0.1.14',['character-047','character-048','character-025','character-046']);
async function lap(s:ReturnType<typeof primitive>){for(let i=0;i<4;i++)s=await drain(db,await run(db,s,{type:'end'}));expect(s.active).toBe(0);return s;}
it('v14 has20 complete roles and identical TS/SQL initialization, drafts and private views; v13 is unchanged',async()=>{
 expect(runtimeForVersion('web-v0.1.13').characterIds).toHaveLength(18);expect(runtimeForVersion('web-v0.1.14').characterIds).toHaveLength(20);
 const setup={mode:'ffa' as const,ruleVersion:'web-v0.1.14' as const,seed:42,seats:[0,1,2,3],first:0,characters:['character-046','character-047','character-013','character-025'] as any};const s=createGame(setup,1000);
 expect((await db.query<{v:unknown}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).rows[0].v).toEqual(s);
 const random={seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false};expect((await db.query<{v:unknown}>('select ml_private.stage4_create_draft($1,$2::jsonb,1000) v',['team',JSON.stringify(random)])).rows[0].v).toEqual(createStage3Draft('team',random,1000,'web-v0.1.14'));
 const view=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,0) v',[JSON.stringify(s)])).rows[0].v;const {actions,exercise,...sqlView}=view;expect(sqlView).toEqual(publicView(s,0));expect(actions.stage3).toEqual(stage3Actions(s,0));expect(view).not.toHaveProperty('random');
 expect(()=>createGame({...setup,ruleVersion:'web-v0.1.13'},1000)).toThrow();
});
it('feather is free, does not reset the clock, expands attack range and preserves location restrictions',async()=>{
 let s=feather();s.players[1].cell='r4c8';give(s,0,'basic-009#01');expect(legalTargets(s,0,'basic-009#01')).not.toContain(1);const clock=structuredClone(s.clock);s=await run(db,s,{type:'skill',kind:'feather'});expect(s.clock).toEqual(clock);expect(s.players[0].ap).toBe(20);expect(legalTargets(s,0,'basic-009#01')).toContain(1);
 await run(db,s,{type:'skill',kind:'feather'},false);s.random.dice=[6];s=await drain(db,await run(db,s,{type:'play',card:'basic-009#01',targets:[1]}));expect(s.players[1].hp).toBe(4);
 s=feather();s.players[0].cell='r1c2';give(s,0,'basic-009#01');s=await run(db,s,{type:'skill',kind:'feather'});expect(legalTargets(s,0,'basic-009#01')).toEqual([]);await run(db,s,{type:'play',card:'basic-009#01',targets:[1]},false);
});
it('active range lineage excludes Mei/Xie, including originally global attacks; invalid mixed requests are atomic',async()=>{
 let s=fixture('web-v0.1.14',['character-046','character-044','character-026','character-047']);give(s,0,'basic-003#01');expect(legalTargets(s,0,'basic-003#01')).toEqual([1,2,3]);s=await run(db,s,{type:'skill',kind:'feather'});expect(legalTargets(s,0,'basic-003#01')).toEqual([3]);await run(db,s,{type:'play',card:'basic-003#01',targets:[1,3]},false);
 s=await drain(db,await run(db,s,{type:'play',card:'basic-003#01',targets:[3]}));expect(s.players[3].ap).toBe(19);
});
for(const [cell,cost] of [['r2c4',0],['r2c3',1]] as const)it(`short legs failure pays${cost}, consumes one chance, blocks a second mount move and keeps teleports separate`,async()=>{
 let s=feather();s.players[0].cell=cell;equip(s,0,'basic-066#01');s.stage3!.doubleMove[0]=true;s.random.dice=[1,6];const clock=structuredClone(s.clock);s=await run(db,s,{type:'move'});expect(s.players[0]).toMatchObject({moved:true,ap:20-cost,cell});expect(s.stage3!.basicUsed[0]).toBe(1);expect(s.stage3!.c!.blocked[0]).toBe(true);expect(s.movement).toBeNull();expect(s.random.dice).toEqual([6]);expect(s.clock).toEqual(clock);await run(db,s,{type:'move'},false);
 const commute=stage3Actions(s,0).locations.commute[0];expect(commute).toBe('r4c8');s=await run(db,s,{type:'location',kind:'commute',cell:commute});expect(s.players[0].cell).toBe('r4c8');expect(s.random.dice).toEqual([6]);
});
it('short legs success uses a separate movement die; turn start clears range and the failure mark',async()=>{
 let s=feather();s.random.dice=[3,6];s=await run(db,s,{type:'skill',kind:'feather'});s=await run(db,s,{type:'move'});expect(s.movement?.remaining).toBe(3);expect(s.random.dice).toEqual([]);s=await run(db,s,{type:'stop'});s=await lap(s);expect(s.stage3!.c!.feather[0]).toBe(false);expect(s.stage3!.c!.blocked[0]).toBe(false);expect(s.players[0].moved).toBe(false);
});
it('sleep earns2 next personal start even with movement, and cannot stack across starts',async()=>{
 let s=primitive();s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'stop'});s=await lap(s);expect(s.players[0].ap).toBe(22);expect(s.stage3!.c!.sleep[0]).toBe(false);s=await lap(s);expect(s.players[0].ap).toBe(24);
});
it('using a card cancels sleep even when countered; skills do not count as cards',async()=>{
 let s=fixture('web-v0.1.14',['character-047','character-002','character-046','character-048']);give(s,0,'basic-039#01');s.random.dice=[3];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('easy');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.c!.used[0]).toBe(true);expect(s.choice).toBeNull();s.players[1].ap=0;s=await lap(s);expect(s.players[0].ap).toBe(19);
});
it('successful food opens one30 second optional skill window after healing; own food also counts and the skill is not food',async()=>{
 let s=primitive();s.players[0].hp=2;give(s,0,'basic-039#01');s.random.dice=[5];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.players[0].hp).toBe(3);expect(s.choice).toMatchObject({kind:'primitive-food',actor:0});expect(s.choice!.deadline-s.time).toBe(30000);expect(s.discard).toContain('basic-039#01');expect(s.cardStack!.stack).toEqual([]);s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(4);expect(s.choice).toBeNull();expect(s.players[0].ap).toBe(19);
 s=primitive();s.players[0].hp=1;s.players[0].cell='r2c1';give(s,1,'basic-039#01');s.active=1;s.cursor=1;s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});s.random.dice=[6];s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(2);
});
it('multi-target food produces one reaction, low rolls/cancel/timeouts never heal, porridge still heals to max',async()=>{
 let s=fixture('web-v0.1.14',['character-047','character-048','character-025','character-046'],'team');s.players[0].hp=2;s.players[2].hp=2;give(s,0,'basic-041#01');s.random.dice=[4];s=await run(db,s,{type:'play',card:'basic-041#01',targets:[]});expect(s.players[2].hp).toBe(3);s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);expect(s.choice).toBeNull();
 for(const timeout of [false,true]){s=primitive();give(s,0,'basic-039#01');s.random.dice=[6];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});s=timeout?await run(db,s,{type:'tick'},true,s.choice!.deadline):await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.random.dice).toEqual([6]);expect(s.choice).toBeNull();}
 s=primitive();s.players[0].hp=1;equip(s,0,'basic-072#01');give(s,1,'basic-039#01');s.active=1;s.cursor=1;s.random.dice=[5];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(4);
});
it('outside-turn responses do not cancel sleep; successful food counters react once before the cancelled parent finishes',async()=>{
 let s=primitive();s.active=1;s.cursor=1;s.players[1].cell='r3c4';give(s,1,'basic-006#01');give(s,0,'basic-001#01');s.random.dice=[6];s=await run(db,s,{type:'play',card:'basic-006#01',targets:[0]});expect(s.choice).toMatchObject({kind:'response',actor:0});s=await drain(db,await run(db,s,{type:'choose',choice:s.choice!.id,card:'basic-001#01'}));expect(s.stage3!.c!.used[0]).toBe(false);
 s=primitive();s.active=1;s.cursor=1;s.players[0].hp=1;give(s,1,'basic-039#01');give(s,0,'basic-038#01');s.random.dice=[6];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toMatchObject({kind:'card-counter',actor:0});s=await run(db,s,{type:'choose',choice:s.choice!.id,card:'basic-038#01'});expect(s.players[0].hp).toBe(2);expect(s.choice).toMatchObject({kind:'primitive-food',actor:0});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);expect(s.choice).toBeNull();expect(s.stage3!.c!.used[0]).toBe(false);
});
it('sleep uses ordinary AP gain/siphon rules, coffee blocks one start without banking the bonus',async()=>{
 let s=fixture('web-v0.1.14',['character-047','character-048','character-025','character-043']);s.players[0].ap=7;s=await lap(s);expect(s.players[0].ap).toBe(7);expect(s.players[3].ap).toBe(22);
 s=primitive();s.players[0].ap=7;s.stage3!.coffeeUntilStart[0]=s.stage3!.starts[0]+1;s=await lap(s);expect(s.players[0].ap).toBe(7);expect(s.stage3!.c!.sleep[0]).toBe(false);s=await lap(s);expect(s.players[0].ap).toBe(9);
});
it('off-map primitive cannot react, and role range never turns an invalid intent into a legal request',async()=>{
 let s=primitive();s.stage4!.offMap[0]=true;s.active=1;s.cursor=1;give(s,1,'basic-039#01');s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toBeNull();
 s=feather();await run(db,s,{type:'skill',kind:'feather',actor:1},false);s=await run(db,s,{type:'skill',kind:'feather'});give(s,0,'basic-009#01');await run(db,s,{type:'play',card:'basic-009#01',targets:[0]},false);
});
it('C state validation rejects each missing ledger instead of accepting SQL nulls',async()=>{
 for(const key of ['feather','blocked','used','sleep'] as const){const s=feather();delete (s.stage3!.c as any)[key];expect(()=>validateState(s)).toThrow('C批角色状态无效');await expect(db.query('select ml_private.validate($1::jsonb)',[JSON.stringify(s)])).rejects.toThrow('C批角色状态无效');}
});
