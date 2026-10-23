import {expect,it} from 'vitest';
import {fixture,give} from './p3-fixture';
import {dispatch,legalSteps} from '../../packages/game-core/src/index';
import type {Command,GameState} from '../../packages/game-core/src/types';
import {runtimeForVersion} from '../../packages/game-data/src/index';
let seq=0;
const go=(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1)=>{const r=dispatch(s,{id:'e-core-'+(++seq),revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command,at);expect(r.ok,r.error).toBe(ok);if(!ok)expect(r.state).toEqual(s);return r.state;};
const setup=(ids=['character-014','character-016','character-024','character-038'])=>fixture('web-v0.1.16',ids);
it('v16 exposes27 roles while D remains23, gas pays1 and resolves targets sequentially without resetting60s',()=>{
 expect(runtimeForVersion('web-v0.1.16').characterIds).toHaveLength(27);expect(runtimeForVersion('web-v0.1.15').characterIds).toHaveLength(23);
 let s=setup();const before=structuredClone(s.clock);s=go(s,{type:'skill',kind:'gas'});expect(s.players[0].ap).toBe(19);expect(s.choice).toMatchObject({kind:'move-consent',actor:1});expect(s.choice!.deadline-s.time).toBe(30000);expect(s.clock.remaining).toBe(before.remaining-1);
 s=go(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice).toMatchObject({kind:'force-step',actor:0,source:2});const cell=s.choice!.cells![0];s=go(s,{type:'choose',choice:s.choice!.id,cell});expect(s.players[2].cell).toBe(cell);expect(s.choice?.kind).toBe('egg-move');
});
it('swap asks before either participant moves, refusal leaves both positions, acceptance swaps atomically',()=>{
 for(const accept of [false,true]){let s=setup(['character-048','character-016','character-025','character-047']);give(s,0,'basic-016#01');const positions=s.players.map(p=>p.cell);s=go(s,{type:'play',card:'basic-016#01',targets:[1]});expect(s.choice?.kind).toBe('move-consent');expect(s.players.map(p=>p.cell)).toEqual(positions);s=go(s,{type:'choose',choice:s.choice!.id,accept});expect(s.players[0].cell).toBe(accept?positions[1]:positions[0]);expect(s.players[1].cell).toBe(accept?positions[0]:positions[1]);expect(new Set(s.players.map(p=>p.cell)).size).toBe(4);}
});
it('collision refuses before moving either body and preserves unused basic steps; approval only once for the whole push',()=>{
 for(const accept of [false,true]){let s=setup(['character-045','character-016','character-025','character-047']);s.players[0].cell='r3c4';s.players[1].cell='r3c5';s.random.dice=[6];s=go(s,{type:'move'});expect(legalSteps(s)).toContain('r3c5');s=go(s,{type:'step',path:['r3c5']});expect(s.choice?.kind).toBe('move-consent');expect(s.players[0].cell).toBe('r3c4');expect(s.players[1].cell).toBe('r3c5');s=go(s,{type:'choose',choice:s.choice!.id,accept});expect(s.choice).toBeNull();expect(s.players[0].cell).toBe(accept?'r3c5':'r3c4');expect(s.players[1].cell).toBe(accept?'r3c8':'r3c5');expect(s.movement!.remaining).toBe(accept?2:3);if(!accept)expect(legalSteps(s)).not.toContain('r3c5');}
});
it('egg waits until a complete basic movement segment and cannot recursively react to its own response',()=>{
 let s=setup(['character-048','character-016','character-024','character-038']);s.players[0].cell='r3c5';s.players[2].cell='r2c2';s.random.dice=[6];s=go(s,{type:'move'});s=go(s,{type:'step',path:['r3c6']});expect(s.choice).toBeNull();s=go(s,{type:'step',path:['r3c7']});expect(s.choice).toBeNull();s=go(s,{type:'stop'});expect(s.choice?.kind).toBe('egg-move');const ap=s.players[2].ap;s=go(s,{type:'choose',choice:s.choice!.id,cell:'r2c3'});expect(s.players[2].cell).toBe('r2c3');expect(s.players[2].ap).toBe(ap);expect(s.stage3!.basicUsed[2]).toBe(0);expect(s.choice).toBeNull();
});
it('consent expires to refusal; source cannot choose for the target and no skill refreshes the clock',()=>{
 let s=setup(['character-048','character-016','character-025','character-047']);give(s,0,'basic-016#01');s=go(s,{type:'play',card:'basic-016#01',targets:[1]});go(s,{type:'choose',actor:0,choice:s.choice!.id,accept:true},false);const remaining=s.clock.remaining;s=go(s,{type:'tick'},true,s.choice!.deadline);expect(s.choice).toBeNull();expect(s.players[0].cell).toBe('r2c4');expect(s.players[1].cell).toBe('r1c3');expect(s.clock.remaining).toBe(remaining);
});
it('escape pays2 only once per personal turn, compares geometric distance after all responses and preserves immunities',()=>{
 let s=setup(['character-038','character-016','character-026','character-044']);const hp=s.players.map(p=>p.hp);s=go(s,{type:'skill',kind:'escape',region:'操场'});expect(s.players[0].ap).toBe(18);expect(s.choice?.kind).toBe('move-consent');s=go(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players.map(p=>p.hp)).toEqual([hp[0],hp[1]-1,hp[2],hp[3]]);expect(s.choice).toBeNull();go(s,{type:'skill',kind:'escape',region:'操场'},false);
});
