import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {equip} from './p3-fixture';
import {gDogTargets} from '../../packages/game-core/src/p3-g-skills';
import {budget} from '../../packages/game-core/src/index';

it('dog moves a global target orthogonally for1AP without using basic movement or refreshing60s',()=>{
 let s=gFixture(['character-022','character-048','character-025','character-031']);const before=budget(s,s.time);s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'down'});expect(s.players[1].cell).toBe('r2c3');expect(s.players[0].ap).toBe(19);expect(s.stage3!.basicUsed).toEqual([0,0,0,0]);expect(budget(s,s.time)).toBe(before-1);s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'right'});expect(s.players[1].cell).toBe('r2c3');expect(s.players[0].ap).toBe(18);expect(budget(s,s.time)).toBe(before-2);s=gRun(s,{type:'skill',kind:'dog',target:0,direction:'up'});expect(s.players[0].cell).toBe('r1c4');expect(s.players[0].ap).toBe(17);expect(s.players[0].moved).toBe(false);
});
it('dog refuses wrong roles, immune targets, the East Dimon and its current team',()=>{
 let s=gFixture(['character-022','character-010','character-026','character-044']);expect(gDogTargets(s,0)).toEqual([0]);for(const target of [1,2,3])gRun(s,{type:'skill',kind:'dog',target,direction:'down'},false);
 s=gFixture(['character-022','character-010','character-048','character-031']);s.mode='team';s.players.forEach((q,a)=>q.team=a===1||a===2?'B':'A');expect(gDogTargets(s,0)).toEqual([0,3]);gRun(s,{type:'skill',kind:'dog',target:2,direction:'down'},false);s.mode='ffa';expect(gDogTargets(s,0)).toEqual([0,2,3]);
 s=gFixture();gRun(s,{type:'skill',kind:'dog',target:1,direction:'down'},false);
});
it('blocked, off-board or farm-closed directions leave the target still and consume the fee',()=>{
 for(const closed of [false,true]){let s=gFixture(['character-022','character-048','character-025','character-031']);s.players[1].cell=closed?'r2c1':'r1c2';s.classic!.farmClosed=closed;s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'up'});expect(s.players[1].cell).toBe(closed?'r2c1':'r1c2');expect(s.players[0].ap).toBe(19);}
});
it('monkey18 chooses consent for dog displacement and timeout/refusal keeps the token in place',()=>{
 for(const accepted of [false,true]){let s=gFixture(['character-022','character-016','character-025','character-031']);s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'right'});expect(s.choice).toMatchObject({kind:'move-consent',actor:1});s=gDrain(gRun(s,{type:'choose',choice:s.choice!.id,accept:accepted}));expect(s.players[1].cell).toBe(accepted?'r1c4':'r1c3');expect(s.players[0].ap).toBe(19);}
 let s=gFixture(['character-022','character-016','character-025','character-031']);s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'right'});s=gRun(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].cell).toBe('r1c3');
});
it('dog obeys jelly exit dice and shark mount locks without spending targets movement allowance',()=>{
 for(const roll of [5,6]){let s=gFixture(['character-022','character-036','character-025','character-031']);s.players[1].cell='r3c3';s.random.dice=[roll];s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'up'});expect(s.players[1].cell).toBe(roll===6?'r2c3':'r3c3');expect(s.players[0].ap).toBe(19);expect(s.stage3!.basicUsed[1]).toBe(0);expect(s.random.dice).toEqual([]);}
 let s=gFixture(['character-022','character-007','character-025','character-031']);s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'down'});expect(s.players[1].cell).toBe('r1c3');equip(s,1,'basic-069#01');s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'down'});expect(s.players[1].cell).toBe('r2c3');
});
