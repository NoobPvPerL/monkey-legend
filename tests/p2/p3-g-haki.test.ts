import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {equip,give} from './p3-fixture';
import {dispatch,legalSteps,validateState} from '../../packages/game-core/src/index';
import {gHaki} from '../../packages/game-core/src/p3-g-haki';
import type {GameState} from '../../packages/game-core/src/types';
function setup(role='character-048'){const s=gFixture(['character-049',role,'character-025','character-031']);s.players[0].cell='r1c2';return s;}
function start(s=setup(),roll=6){s.random.dice=[roll];return gRun(s,{type:'move'});}
it('only final basic d6=6 enables occupied passage, with unchanged three steps and original payment',()=>{
 for(const n of [1,2,3,4,5]){const s=start(setup(),n);expect(gHaki(s)).toBe(false);expect(legalSteps(s)).not.toContain('r1c3');}
 let s=start();expect(gHaki(s)).toBe(true);expect(s.movement?.remaining).toBe(3);expect(legalSteps(s)).toContain('r1c3');const ap=s.players[0].ap;s=gRun(s,{type:'step',path:['r1c3','r1c4']});expect(s.choice).toMatchObject({kind:'g-haki',actor:0,source:1});expect(s.players[0].cell).toBe('r1c3');expect(s.choice!.deadline-s.time).toBe(30000);expect(s.players[0].ap).toBe(ap);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].cell).toBe('r1c4');expect(s.players[1].hp).toBe(4);expect(s.movement?.remaining).toBe(1);s=gRun(s,{type:'stop'});expect(s.players[0].ap).toBe(ap-1);expect(s.stage3!.basicUsed[0]).toBe(1);expect(s.movement).toBeNull();
});
it('the same person is offered at most once per movement, including repeated crossings and declines',()=>{
 let s=setup();equip(s,0,'basic-066#01');s.stage3!.doubleMove[0]=true;s=start(s);s=gRun(s,{type:'step',path:['r1c3','r1c4','r1c3','r1c2']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0].cell).toBe('r1c2');expect(s.movement?.haki).toEqual([1]);expect(s.players[1].hp).toBe(5);expect(s.events.filter(e=>e.text.includes('等待选择：g-haki'))).toHaveLength(1);
});
it('each crossed person gets a separate persisted window and friendly fire is allowed',()=>{
 let s=setup();s.mode='team';s.players.forEach((p,a)=>p.team=a<2?'A':'B');s.players[2].cell='r1c4';s=start(s);s=gRun(s,{type:'step',path:['r1c3','r1c4','r1c5']});const budget=s.clock.remaining;s=JSON.parse(JSON.stringify(s));s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true},true,s.time+5000);expect(s.choice).toMatchObject({kind:'g-haki',source:2});expect(s.clock.remaining).toBe(budget);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].hp).toBe(4);expect(s.players[2].hp).toBe(s.players[2].maxHp-1);expect(s.players[0].cell).toBe('r1c5');expect(s.movement).toBeNull();
});
it('skill immunity keeps passage legal but prevents the optional damage window',()=>{
 for(const role of ['character-026','character-044']){let s=start(setup(role));s=gRun(s,{type:'step',path:['r1c3','r1c4']});expect(s.choice).toBeNull();expect(s.players[0].cell).toBe('r1c4');expect(s.players[1].hp).toBe(s.players[1].maxHp);}
});
it('passing monkey18 never moves it and never requests consent',()=>{
 let s=start(setup('character-016'));s=gRun(s,{type:'step',path:['r1c3','r1c4']});expect(s.choice?.kind).toBe('g-haki');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[1].cell).toBe('r1c3');expect(s.events.some(e=>e.text.includes('move-consent'))).toBe(false);
});
it('an occupied square can be transient but cannot be stopped on or entered without a reachable empty landing',()=>{
 let s=start();s=gRun(s,{type:'step',path:['r1c3']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});validateState(s);expect(s.phase).toBe('moving');gRun(s,{type:'stop'},false);gRun(s,{type:'end'},false);s=gRun(s,{type:'step',path:['r1c4','r1c5']});expect(s.players[0].cell).toBe('r1c5');expect(s.movement).toBeNull();
 s=start();s.movement!.remaining=1;expect(legalSteps(s)).not.toContain('r1c3');gRun(s,{type:'step',path:['r1c3']},false);
});
it('occupied forced-stop cave, closed farm and mount restrictions remain impassable',()=>{
 let s=setup();s.players[0].cell='r2c7';s.players[1].cell='r2c8';s=start(s);expect(legalSteps(s)).not.toContain('r2c8');
 s=setup();s.classic!.farmClosed=true;s.players[1].cell='r1c1';s=start(s);expect(legalSteps(s)).not.toContain('r1c1');
 s=setup();equip(s,0,'basic-063#01');s.players[0].cell='r3c2';s.players[1].cell='r3c3';s=start(s);expect(legalSteps(s)).not.toContain('r3c4');
});
it('native water leaps keep one-step cost, cross water occupants, and never land in water',()=>{
 let s=setup();s.players[0].cell='r3c2';s.players[1].cell='r3c3';s=start(s);expect(legalSteps(s)).toContain('r3c4');expect(legalSteps(s)).not.toContain('r3c3');s=gRun(s,{type:'step',path:['r3c4']});expect(s.choice).toMatchObject({kind:'g-haki',source:1});expect(s.players[0].cell).toBe('r3c4');expect(s.movement!.remaining).toBe(2);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].hp).toBe(4);expect(s.players[0].cell).toBe('r3c4');
});
it('a native leap can cross a second occupied bank only if an empty exit remains',()=>{
 let s=setup();s.players[0].cell='r3c2';s.players[1].cell='r3c3';s.players[2].cell='r3c4';s=start(s);s=gRun(s,{type:'step',path:['r3c4','r3c5']});expect(s.choice?.source).toBe(1);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice?.source).toBe(2);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0].cell).toBe('r3c5');
});
it('programming changes whether final6 grants passage, and never rolls a second basic die on replay',()=>{
 let s=setup('character-033');s.random.dice=[6,2];s=gRun(s,{type:'move'});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(gHaki(s)).toBe(false);expect(s.movement!.remaining).toBe(1);expect(s.random.dice).toEqual([]);expect(s.events.filter(e=>e.text.startsWith('基础移动：'))).toHaveLength(1);
 s=setup('character-033');s.random.dice=[2,6];s=gRun(s,{type:'move'});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(gHaki(s)).toBe(true);expect(legalSteps(s)).toContain('r1c3');
});
it('timeout declines without fee or budget refresh, and subsequent timeout returns to the last empty square',()=>{
 let s=start();s=gRun(s,{type:'step',path:['r1c3']});const ap=s.players[0].ap,budget=s.clock.remaining;s=gRun(s,{type:'tick'},true,s.choice!.deadline);expect(s.choice).toBeNull();expect(s.players[1].hp).toBe(5);expect(s.clock.remaining).toBe(budget);s=gRun(s,{type:'tick'},true,s.time+budget);expect(s.players[0].cell).toBe('r1c2');expect(s.players[0].ap).toBe(ap-1);expect(s.active).toBe(1);expect(s.movement).toBeNull();
});
it('wrong actor, stale and repeated answers roll back the whole persisted crossing state',()=>{
 let s=start();s=gRun(s,{type:'step',path:['r1c3','r1c4']});const cmd={id:'haki-once',type:'choose' as const,actor:0,revision:s.revision,choice:s.choice!.id,accept:true};expect(dispatch(s,{...cmd,actor:1},s.time+1).ok).toBe(false);expect(dispatch(s,{...cmd,revision:s.revision-1},s.time+1).state).toEqual(s);const r=dispatch(s,cmd,s.time+1);expect(r.ok,r.error).toBe(true);expect(dispatch(r.state,cmd,s.time+2).state).toEqual(r.state);
});
it('one damage uses the normal shield/gear/mark chain and may kill the crossed target',()=>{
 let s=setup();s.players[1].shield=1;s=start(s);s=gRun(s,{type:'step',path:['r1c3','r1c4']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1]).toMatchObject({hp:5,shield:0});
 s=setup();s.stage3!.g!.marks[1]=2;s=start(s);s=gRun(s,{type:'step',path:['r1c3','r1c4']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].hp).toBe(3);expect(s.stage3!.g!.marks[1]).toBeNull();
 s=setup();s.players[1].hp=1;s=start(s);s=gRun(s,{type:'step',path:['r1c3','r1c4']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].hp).toBe(0);expect(s.players[1].eliminated).not.toBeNull();expect(s.players[0].cell).toBe('r1c4');
});
it('egg reacts only after the whole basic movement, while victim response movement resumes the saved path',()=>{
 let s=start(setup('character-024'));s=gRun(s,{type:'step',path:['r1c3','r1c4']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice).toBeNull();s=gRun(s,{type:'stop'});expect(s.choice?.kind).toBe('egg-move');s=gDrain(s);expect(s.events.filter(e=>e.text.includes('等待选择：egg-move'))).toHaveLength(1);
 s=start(setup('character-037'));s=gRun(s,{type:'step',path:['r1c3','r1c4']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('teleport');s=gRun(s,{type:'choose',choice:s.choice!.id,cell:'r4c8'});expect(s.players[1].cell).toBe('r4c8');expect(s.players[0].cell).toBe('r1c4');
});
it('lethal reflected damage ends the movers turn without continuing its stored path or leaving an overlap',()=>{
 let s=setup();s.players[0].hp=1;equip(s,1,'basic-051#01');s=start(s);s=gRun(s,{type:'step',path:['r1c3','r1c4']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'gear-reflect',actor:1});s=gDrain(gRun(s,{type:'choose',choice:s.choice!.id,accept:true}));expect(s.players[0].hp).toBe(0);expect(s.active).toBe(1);expect(s.movement).toBeNull();expect(s.players[1].cell).toBe('r1c3');expect(s.players[0].cell).toBe('r1c2');
});
it('invalid path tails reject before offering a skill, and nonbasic displacement never inherits Haki',()=>{
 let s=start();gRun(s,{type:'step',path:['r1c3','r4c8']},false);expect(s.movement!.haki).toEqual([]);expect(s.choice).toBeNull();
 s=gFixture(['character-022','character-049','character-025','character-031']);s=gRun(s,{type:'skill',kind:'dog',target:1,direction:'right'});expect(s.players[1].cell).toBe('r1c4');expect(s.events.some(e=>e.text.includes('g-haki'))).toBe(false);expect(s.stage3!.basicUsed[1]).toBe(0);
});
