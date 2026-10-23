import {expect,it,afterAll} from 'vitest';
import {database} from './database';
import {run} from './p3-fixture';
const db=await database(undefined,28);afterAll(()=>db.close());
import {fixture,give,equip} from './p3-fixture';
import {dispatch,legalSteps,budget} from '../../packages/game-core/src/index';
import type {Command,GameState} from '../../packages/game-core/src/types';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {revivalCells,resourceHealing} from '../../packages/game-core/src/stage3-resources';
const go=(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1)=>run(db,s,body,ok,at);
const setup=(ids=['character-052','character-051','character-018','character-019'],mode:'ffa'|'team'='ffa')=>fixture('web-v0.1.17',ids,mode);
const together=(s:GameState)=>{s.players.forEach((p,a)=>p.cell=['r1c2','r1c3','r2c2','r2c3'][a]);return s;};
it('F has35 roles while saved E stays27, magma hits all others including allies without refreshing60s',async()=>{
 expect(runtimeForVersion('web-v0.1.17').characterIds).toHaveLength(35);expect(runtimeForVersion('web-v0.1.16').characterIds).toHaveLength(27);
 let s=together(setup(['character-052','character-048','character-025','character-047'],'team'));const hp=s.players.map(p=>p.hp);s=await go(s,{type:'skill',kind:'magma'});expect(s.players.map(p=>p.hp)).toEqual([hp[0],hp[1]-1,hp[2]-1,hp[3]-1]);expect(s.players[0].ap).toBe(18);expect(budget(s,s.time)).toBe(59999);
});
it('tenacity is chosen after shield, clamps HP without injury and expires to0',async()=>{
 let s=together(setup());s.players[1].shield=1;s=await go(s,{type:'skill',kind:'magma'});expect(s.choice).toBeNull();expect(s.players[1]).toMatchObject({hp:4,maxHp:4,shield:0});
 s=await go(s,{type:'skill',kind:'magma'});expect(s.choice).toMatchObject({kind:'f-tenacity',actor:1,count:1});expect(s.players[1].hp).toBe(4);expect(s.choice!.deadline-s.time).toBe(30000);await go(s,{type:'choose',choice:s.choice!.id,option:'2'},false);s=await go(s,{type:'choose',choice:s.choice!.id,option:'1'});expect(s.players[1]).toMatchObject({hp:3,maxHp:3});
 s=await go(s,{type:'skill',kind:'magma'});s=await go(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1]).toMatchObject({hp:2,maxHp:3});
});
it('monkey4 takes dimon +1, goes home once and blocks later same-turn damage until next personal start',async()=>{
 let s=setup(['character-048','character-018','character-025','character-047']);s.players[0].cell='r2c2';s.players[2].cell='r3c5';s.players[1].cell='r2c3';s.players[1].ap=0;give(s,0,'basic-006#01');s.random.dice=[6];s=await go(s,{type:'play',card:'basic-006#01',targets:[1]});expect(s.players[1].hp).toBe(3);expect(s.stage3!.f!.home[1]).toBe(true);expect(['r1c4','r1c5','r2c5','r2c6']).toContain(s.players[1].cell);
 s.players[1].cell='r2c3';give(s,0,'basic-003#02');s=await go(s,{type:'play',card:'basic-003#02',targets:[1]});expect(s.players[1].hp).toBe(3);s=await go(s,{type:'end'});expect(s.stage3!.f!.home[1]).toBe(false);
});
it('monkey5 heals on submitted paid exercise including a card later countered, and full healing means2',async()=>{
 let s=setup(['character-019','character-002','character-025','character-047']);s.players[1].cell='r2c3';give(s,0,'basic-003#01');s.random.dice=[6];s=await go(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.players[0].hp).toBe(3);expect(s.choice?.kind).toBe('easy');s=await go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);
 equip(s,0,'basic-072#01');expect(resourceHealing(s as any,0,1)).toBe(2);give(s,0,'basic-046#01');s=await go(s,{type:'play',card:'basic-046#01',targets:[]});s=await go(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0].hp).toBe(5);
});
it('shark cannot be moved without an effective Tangche; execute odd kills directly and prohibits ordinary revival',async()=>{
 let s=setup(['character-007','character-048','character-025','character-047']);await go(s,{type:'move'},false);give(s,0,'basic-016#01');await go(s,{type:'play',card:'basic-016#01',targets:[1]},false);
 s.players[0].cell='r3c5';s.players[1].cell='r3c6';s.players[1].hp=2;s.players[1].shield=2;give(s,0,'basic-001#01');s.random.dice=[1];s=await go(s,{type:'skill',kind:'execute',card:'basic-001#01',target:1});expect(s.players[1]).toMatchObject({hp:0,shield:0,hand:[]});expect(s.players[0]).toMatchObject({kills:1,damage:0});expect(revivalCells(s as any,1,false)).toEqual([]);await go(s,{type:'skill',kind:'execute',card:'basic-016#01',target:2},false);
 equip(s,0,'basic-069#01');s.random.dice=[6];s=await go(s,{type:'move'});expect(s.phase).toBe('moving');
});
it('jelly damage bypasses shield and simultaneously reduces HP/max, zero max cannot revive',async()=>{
 let s=setup(['character-036','character-051','character-025','character-047']);s.players[1].cell='r2c3';s.players[1].ap=0;s.players[1].shield=2;give(s,0,'basic-005#01');s=await go(s,{type:'play',card:'basic-005#01',targets:[1]});expect(s.choice).toMatchObject({kind:'f-tenacity',count:3});s=await go(s,{type:'choose',choice:s.choice!.id,option:'0'});expect(s.players[1]).toMatchObject({hp:1,maxHp:1,shield:2});
 give(s,0,'basic-004#01');s=await go(s,{type:'play',card:'basic-004#01',targets:[1]});expect(s.players[1]).toMatchObject({hp:0,maxHp:0,shield:0});expect(revivalCells(s as any,1,false)).toEqual([]);
});
it('basic jelly movement reuses its starting d6 to gate shore exits without rolling again',async()=>{
 for(const roll of [5,6]){let s=setup(['character-036','character-048','character-025','character-047']);s.players[0].cell='r3c3';s.players[1].cell='r1c1';s.players[2].cell='r1c2';s.players[3].cell='r1c3';s.random.dice=[roll];s=await go(s,{type:'move'});expect(legalSteps(s).includes('r2c3')).toBe(roll===6);expect(s.random.dice).toEqual([]);if(roll===6){s=await go(s,{type:'step',path:['r2c3']});expect(s.players[0].cell).toBe('r2c3');}}
});
it('harmony gains2AP and1max per survived actual HP loss, not per hit, fatal grants none',async()=>{
 let s=together(setup(['character-052','character-032','character-025','character-047']));s=await go(s,{type:'skill',kind:'magma'});expect(s.players[1]).toMatchObject({hp:2,maxHp:4,ap:22});s.players[1].hp=1;s=await go(s,{type:'skill',kind:'magma'});expect(s.players[1]).toMatchObject({hp:0,maxHp:4,ap:0});
});
