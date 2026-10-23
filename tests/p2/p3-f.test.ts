import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {fixture,give,equip,run} from './p3-fixture';
import {resourceHealing,revivalCells} from '../../packages/game-core/src/stage3-resources';
import {legalSteps,budget} from '../../packages/game-core/src/index';
import type {GameState} from '../../packages/game-core/src/types';
const db=await database(undefined,28);afterAll(()=>db.close());
const setup=(ids:string[],mode:'ffa'|'team'='ffa')=>fixture('web-v0.1.17',ids,mode);
const go=(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1)=>run(db,s,body,ok,at);
it.each([1,3,6])('self-harm roll%s resolves once per allied card; 3+ cancels only own part;6 opens a replacement target window',async roll=>{
 let s=setup(['character-048','character-025','character-017','character-047'],'team');give(s,0,'basic-016#01');give(s,1,'basic-001#01');give(s,3,'basic-001#02');const positions=s.players.map(p=>p.cell);s.random.dice=[roll];s=await go(s,{type:'play',card:'basic-016#01',targets:[2]});expect(s.choice).toMatchObject({kind:'f-self-harm',actor:2});expect(s.choice!.deadline-s.time).toBe(30000);
 s=await go(s,{type:'choose',choice:s.choice!.id,accept:true});
 if(roll===3){for(const a of [1,3]){expect(s.choice).toMatchObject({kind:'f-discard',actor:a,count:1});expect(s.choice!.deadline-s.time).toBe(20000);s=await go(s,{type:'choose',choice:s.choice!.id,cards:[s.players[a].hand[0]]});}}
 if(roll===6){expect(s.choice).toMatchObject({kind:'f-target',actor:2});const before=s.players[1].hp;s=await go(s,{type:'choose',choice:s.choice!.id,target:1});expect(s.players[1].hp).toBe(before-1);}
 expect(s.players[0].cell).toBe(roll<=2?positions[2]:positions[0]);expect(s.players[2].cell).toBe(roll<=2?positions[0]:positions[2]);expect(s.choice).toBeNull();
});
it('first kill locks finite and approved uncapped healing until the first global elimination, then releases forever',async()=>{
 let s=setup(['character-017','character-019','character-025','character-047']);s.players[1].cell='r2c3';s.players[1].ap=0;give(s,0,'basic-003#01');s=await go(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.players[1].hp).toBe(1);expect(s.stage3!.f!.unlimitedCeil[1]).toBe(1);expect(resourceHealing(s as any,1,5)).toBe(0);
 s.players[2].cell='r3c4';s.players[2].ap=0;s.players[2].hp=1;give(s,0,'basic-003#02');s=await go(s,{type:'play',card:'basic-003#02',targets:[2]});expect(s.stage3!.f!.firstDeath).toBe(true);expect(s.stage3!.f!.wounds).toEqual([0,0,0,0]);expect(s.stage3!.f!.unlimitedCeil).toEqual([null,null,null,null]);expect(resourceHealing(s as any,1,5)).toBe(5);expect(revivalCells(s as any,2,false).length).toBeGreaterThan(0);
});
it.each([5,6])('jelly forced swap roll%s decides before either participant moves',async roll=>{
 let s=setup(['character-048','character-036','character-025','character-047']);s.players[1].cell='r3c3';s.random.dice=[roll];give(s,0,'basic-016#01');const positions=s.players.map(p=>p.cell);s=await go(s,{type:'play',card:'basic-016#01',targets:[1]});expect(s.players[0].cell).toBe(roll===6?positions[1]:positions[0]);expect(s.players[1].cell).toBe(roll===6?positions[0]:positions[1]);expect(new Set(s.players.map(p=>p.cell)).size).toBe(4);expect(s.random.dice).toEqual([]);
});
it.each([5,6])('jelly collision roll%s preserves unused steps on a blocked shore and keeps atomic occupancy',async roll=>{
 let s=setup(['character-045','character-036','character-025','character-047']);s.players[0].cell='r3c2';s.players[1].cell='r3c3';s.players[2].cell='r1c1';s.players[3].cell='r1c2';s.random.dice=[6,roll];s=await go(s,{type:'move'});expect(legalSteps(s)).toContain('r3c3');s=await go(s,{type:'step',path:['r3c3']});expect(s.players[0].cell).toBe(roll===6?'r3c3':'r3c2');expect(s.players[1].cell).toBe(roll===6?'r3c8':'r3c3');expect(s.movement!.remaining).toBe(roll===6?1:3);expect(s.random.dice).toEqual([]);expect(new Set(s.players.map(p=>p.cell)).size).toBe(4);
});
it.each([1,5,6])('sting on entering roll%s has exact discard/true damage/no effect, then another stationary end trigger',async roll=>{
 let s=setup(['character-048','character-036','character-025','character-047']);s.players[0].cell='r2c1';s.players[1].cell='r1c2';s.players[2].cell='r3c5';give(s,0,'basic-001#01');give(s,0,'basic-001#02');s.random.dice=[6,roll,6];s=await go(s,{type:'move'});s=await go(s,{type:'step',path:['r2c2']});expect(s.choice).toMatchObject({kind:'f-sting',actor:1});const hp=s.players[0].hp;s=await go(s,{type:'choose',choice:s.choice!.id,accept:true});
 if(roll===1){expect(s.choice).toMatchObject({kind:'f-discard',actor:0,count:2});s=await go(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[0].hand).toEqual([]);}else expect(s.players[0]).toMatchObject({hp:hp-(roll===5?2:0),maxHp:5-(roll===5?2:0)});
 s=await go(s,{type:'stop'});s=await go(s,{type:'end'});expect(s.choice).toMatchObject({kind:'f-sting',actor:1});s=await go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toBeNull();
});
it.each([2,6])('bccb roll%s steals before self harm or batches both hits, and harmony follows actual loss',async roll=>{
 let s=setup(['character-048','character-032','character-025','character-047']);s.players[0].cell='r2c1';s.players[1].cell='r1c2';s.players[2].cell='r3c5';give(s,0,'basic-001#01');give(s,0,'basic-001#02');s.random.dice=[6,roll];s=await go(s,{type:'move'});s=await go(s,{type:'step',path:['r2c2']});expect(s.choice).toMatchObject({kind:'f-bccb',actor:1});s=await go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1]).toMatchObject({hp:2,maxHp:4,ap:22});expect(s.players[1].hand).toHaveLength(roll===2?2:0);expect(s.players[0].hp).toBe(roll===6?4:5);expect(s.choice).toBeNull();
});
it('drift happens once at personal start before action, no AP/basic movement consumption',async()=>{
 let s=setup(['character-048','character-051','character-025','character-047']);s.players[1].cell='r1c3';s=await go(s,{type:'end'});expect(s.active).toBe(1);expect(s.players[1]).toMatchObject({cell:'r1c4',ap:20});expect(s.stage3!.basicUsed[1]).toBe(0);expect(s.events.filter(e=>e.type==='move'&&e.text.includes('朱鹏岩'))).toHaveLength(1);
});
it('magma respects active/group immunity and a final lethal batch ends the game after all reactions',async()=>{
 let s=setup(['character-052','character-026','character-044','character-027']);s.players.forEach((p,a)=>p.cell=['r1c2','r1c3','r2c2','r2c3'][a]);give(s,3,'basic-001#01');const hp=s.players.map(p=>p.hp);s=await go(s,{type:'skill',kind:'magma'});expect(s.players.map(p=>p.hp)).toEqual(hp);
 s=setup(['character-052','character-048','character-025','character-047']);s.players.forEach((p,a)=>{p.cell=['r1c2','r1c3','r2c2','r2c3'][a];if(a)p.hp=1;});s=await go(s,{type:'skill',kind:'magma'});expect(s.result?.winners).toEqual([0]);expect(s.queue).toEqual([]);expect(s.players[0].kills).toBe(3);
});
it('execute even spends its hand/use, allows allies, and rejects active immunity before paying',async()=>{
 let s=setup(['character-007','character-026','character-025','character-047'],'team');s.players[0].cell='r1c2';s.players[1].cell='r1c3';s.players[2].cell='r2c2';s.players[1].hp=1;s.players[2].hp=2;give(s,0,'basic-001#01');s.random.dice=[2];await go(s,{type:'skill',kind:'execute',card:'basic-001#01',target:1},false);s=await go(s,{type:'skill',kind:'execute',card:'basic-001#01',target:2});expect(s.players[2].hp).toBe(2);expect(s.players[0].hand).toEqual([]);expect(s.stage3!.f!.executeUsed[0]).toBe(true);
});
it.each([true,false])('shark return placement works without Tangche including same-cell return=%s and leaves no private flags',async same=>{
 let s=setup(['character-048','character-007','character-025','character-047']);s.stage4!.offMap[1]=true;const cell=same?s.players[1].cell:'r1c2';s=await go(s,{type:'end'});expect(s.choice).toMatchObject({kind:'board-return',actor:1});expect(s.choice!.cells).toContain(cell);s=await go(s,{type:'choose',choice:s.choice!.id,cell});expect(s.players[1].cell).toBe(cell);expect(s.stage4!.offMap[1]).toBe(false);expect(s).not.toHaveProperty('_fPlacement');expect(s).not.toHaveProperty('_eCause');
});
it('monkey5 free higher exercise response heals once before resolution and ignores jelly max reduction',async()=>{
 let s=setup(['character-036','character-019','character-025','character-047']);s.players[1].cell='r2c3';s.players[1].ap=0;give(s,0,'basic-003#01');give(s,1,'basic-004#01');s=await go(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice).toMatchObject({kind:'response',actor:1});s=await go(s,{type:'choose',choice:s.choice!.id,card:'basic-004#01'});expect(s.players[1]).toMatchObject({hp:3,maxHp:2,ap:0});
 s.players[1].ap=1;give(s,0,'basic-003#02');s=await go(s,{type:'play',card:'basic-003#02',targets:[1]});expect(s.players[1]).toMatchObject({hp:3,maxHp:2});s.players[1].ap=0;give(s,0,'basic-003#03');s=await go(s,{type:'play',card:'basic-003#03',targets:[1]});expect(s.players[1]).toMatchObject({hp:2,maxHp:2});
});
it('jelly source first respects Mei, gear prevention and potato damage caps before bypassing shields',async()=>{
 let s=setup(['character-036','character-026','character-037','character-048']);s.players.forEach((p,a)=>p.cell=['r1c2','r1c3','r2c2','r2c3'][a]);s.players[1].ap=0;s.players[2].ap=0;s.players[3].ap=0;s.players[2].shield=2;equip(s,3,'basic-070#01');give(s,0,'basic-005#01');s=await go(s,{type:'play',card:'basic-005#01',targets:[1]});expect(s.players[1].hp).toBe(s.players[1].maxHp);
 give(s,0,'basic-005#02');s=await go(s,{type:'play',card:'basic-005#02',targets:[2]});expect(s.players[2]).toMatchObject({hp:4,maxHp:4,shield:2});expect(s.choice?.kind).toBe('teleport');s=await go(s,{type:'choose',choice:s.choice!.id,cell:null});give(s,0,'basic-004#01');s=await go(s,{type:'play',card:'basic-004#01',targets:[3]});expect(s.players[3]).toMatchObject({hp:5,maxHp:5});
});
