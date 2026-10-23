import {expect,it} from 'vitest';
import {ports,setup,die,driver,command,unusedInitial} from './p3-g-dice-fixture';
import {gDie,gDispatch,gInitial,gNow} from '../../packages/game-core/src/p3-g-dice';
import {initialGState,gState} from '../../packages/game-core/src/p3-g-state';
import {integer} from '../../packages/game-core/src/random';
import type {GameState,Command,DispatchResult} from '../../packages/game-core/src/types';
import type {Stage3Ports} from '../../packages/game-core/src/stage3-engine';

// Exercise the command checkpoint before wiring the approved G roster. The
// driver deliberately spends, draws and samples entropy on both sides of dice.
// This contract does not stand in for the forthcoming real TS/SQL integration.
function choose(s:GameState,body:Record<string,unknown>,core=driver(),at=s.time+1,id=`choice-${s.revision}`){const result=gDispatch(s,command(s,{type:'choose',choice:s.choice!.id,actor:s.choice!.actor,...body} as any,id),at,core,unusedInitial,ports);expect(result.ok,result.error).toBe(true);return result.state;}
function clean(s:GameState){expect(s).not.toHaveProperty('_gReplay');expect(s.random).not.toHaveProperty('_gTrace');expect(gState(s)).not.toHaveProperty('dice');}

it('programming precedes the owners final choice; spending/draw/random effects happen exactly once after a persisted reconnect',()=>{
 const s=setup(),base=structuredClone(s),core=driver();let r=gDispatch(s,command(s),1010,core,unusedInitial,ports);expect(r.ok,r.error).toBe(true);let pending=r.state;
 expect(s).toEqual(base);expect(pending.choice).toMatchObject({kind:'g-program',actor:1,deadline:31010});expect(pending.players[0].ap).toBe(18);expect(pending.players[0].hand).toHaveLength(1);const card=pending.players[0].hand[0];
 pending=choose(pending,{accept:true},core,1110);expect(pending.choice).toMatchObject({kind:'g-math',actor:0,deadline:31110});expect(gState(pending).programUsed[1]).toBe(true);expect((pending.choice!.data as any).value).toBe(3);
 pending=JSON.parse(JSON.stringify(pending));const complete=choose(pending,{option:'6'},core,1310);clean(complete);
 expect(complete.players[0].ap).toBe(12);expect(complete.players[0].hand).toEqual([card]);expect(complete.deck).toHaveLength(base.deck.length-1);expect(complete.random.dice).toEqual([5,4]);
 expect(complete.events.filter(e=>e.text==='已支付2AP并拿牌')).toHaveLength(1);expect(complete.events.filter(e=>e.type==='dice').slice(-2).map(e=>e.data)).toEqual([1,3]);expect(complete.events.at(-1)?.text).toBe('最终0=6');
 expect(complete.seen.slice(-3)).toEqual(['g-command','choice-1','choice-2']);expect(complete.revision).toBe(base.revision+3);expect(complete.time).toBe(1310);expect(complete.clock).toEqual({remaining:59990,since:1310});
 const direct=structuredClone(base);direct.players[0].ap-=2;direct.deck.splice(integer(direct.random,direct.deck.length),1);expect(complete.players[0].shield).toBe(integer(direct.random,50));expect(complete.random.seed).toBe(direct.random.seed);
});
it('successive dice in one command retain each final value and programming use; an unused choice is available on the later die',()=>{
 let s=setup([1,5,3,4]),core=driver(2);s=gDispatch(s,command(s),1001,core,unusedInitial,ports).state;
 s=choose(s,{accept:false},core);s=choose(s,{option:'6'},core);expect(s.choice?.kind).toBe('g-program');expect(gState(s).programUsed[1]).toBe(false);
 s=choose(s,{accept:true},core);expect((s.choice!.data as any).value).toBe(3);s=choose(s,{option:'2'},core);clean(s);
 expect(s.players[0].ap).toBe(10);expect(s.random.dice).toEqual([4]);expect(s.events.filter(e=>e.text==='已支付2AP并拿牌')).toHaveLength(1);expect(s.events.filter(e=>e.text.startsWith('最终')).map(e=>e.text)).toEqual(['最终0=6','最终1=2']);
});
it('an accepted programming choice is not reopened for a second die in the same personal turn',()=>{
 const core=driver(2);let s=setup([1,3,5]);s=gDispatch(s,command(s),1001,core,unusedInitial,ports).state;s=choose(s,{accept:true},core);s=choose(s,{option:'2'},core);
 expect(s.choice).toMatchObject({kind:'g-math',actor:0});expect((s.choice!.data as any).value).toBe(5);s=choose(s,{},core);clean(s);expect(s.players[0].ap).toBe(11);expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('g-program'))).toHaveLength(1);
});
it('timeouts retain the current value and never extend the action budget; non-expired tick is unchanged',()=>{
 const core=driver();let s=setup([2,5]);s=gDispatch(s,command(s),1050,core,unusedInitial,ports).state;
 const early=gDispatch(s,command(s,{type:'tick'},'early-tick'),s.choice!.deadline-1,core,unusedInitial,ports);expect(early).toEqual({state:s,ok:true});
 let r=gDispatch(s,command(s,{type:'tick'},'program-timeout'),s.choice!.deadline,core,unusedInitial,ports);expect(r.ok,r.error).toBe(true);s=r.state;expect(s.choice).toMatchObject({kind:'g-math',deadline:61050});
 r=gDispatch(s,command(s,{type:'tick'},'math-timeout'),s.choice!.deadline,core,unusedInitial,ports);expect(r.ok,r.error).toBe(true);clean(r.state);expect(r.state.players[0].ap).toBe(16);expect(r.state.random.dice).toEqual([5]);expect(r.state.clock).toEqual({remaining:59950,since:61050});
});
it('invalid actors, stale windows/revisions, repeated IDs and malformed points roll back every private field',()=>{
 const core=driver();let s=setup();s=gDispatch(s,command(s),1010,core,unusedInitial,ports).state;
 for(const body of [{actor:0},{revision:s.revision-1},{choice:s.choice!.id+1},{id:'g-command'},{accept:1},{type:'move'}]){
  const cmd=command(s,{type:'choose',choice:s.choice!.id,actor:s.choice!.actor,...body} as any,'bad');const r=gDispatch(s,cmd,s.time+1,core,unusedInitial,ports);expect(r.ok).toBe(false);expect(r.state).toEqual(s);
 }
 s=choose(s,{accept:false},core);for(const option of ['0','7','1.5','01',6]){const r=gDispatch(s,command(s,{type:'choose',choice:s.choice!.id,actor:0,option} as any,'invalid-point'),s.time+1,core,unusedInitial,ports);expect(r.ok).toBe(false);expect(r.state).toEqual(s);}
 const late=gDispatch(s,command(s,{type:'choose',choice:s.choice!.id,option:'6'},'late'),s.choice!.deadline,core,unusedInitial,ports);expect(late.ok).toBe(false);expect(late.state).toEqual(s);
});
it('a rejected driver never persists a checkpoint or random trace; a failed continuation preserves its pending window',()=>{
 const s=setup(),reject=(x:GameState):DispatchResult=>{integer(x.random,7);return {state:x,ok:false,error:'rejected'};};
 const r=gDispatch(s,command(s),1001,reject,unusedInitial,ports);expect(r).toEqual({state:s,ok:false,error:'rejected'});clean(r.state);
 let pending=gDispatch(s,command(s),1001,driver(),unusedInitial,ports).state;pending=choose(pending,{accept:false});const failed=gDispatch(pending,command(pending,{type:'choose',choice:pending.choice!.id,option:'6'},'reject-continuation'),1003,x=>({state:x,ok:false,error:'rejected'}),unusedInitial,ports);expect(failed).toEqual({state:pending,ok:false,error:'rejected'});
});
it('initial turn-start can suspend and resume without repeating previously dealt opening cards',()=>{
 const s=setup([2,4]);s.players[0].hand=s.deck.splice(0,4);const initial=(x:GameState,at:number)=>{x.players[0].shield=die(x,0,'开始判定');x.clock.since=gNow(x,at);return x;};
 let pending=gInitial(s,1001,initial,ports);expect(pending.choice?.kind).toBe('g-program');const hand=[...pending.players[0].hand];
 let r=gDispatch(pending,command(pending,{type:'choose',choice:pending.choice!.id,actor:1,accept:true},'initial-program'),1002,driver(),initial,ports);expect(r.ok,r.error).toBe(true);pending=r.state;
 r=gDispatch(pending,command(pending,{type:'choose',choice:pending.choice!.id,option:'6'},'initial-math'),1003,driver(),initial,ports);expect(r.ok,r.error).toBe(true);clean(r.state);expect(r.state.players[0].shield).toBe(6);expect(r.state.players[0].hand).toEqual(hand);expect(r.state.seen.slice(-2)).toEqual(['initial-program','initial-math']);
});
it('d6 ownership and existing immunity exclude inappropriate programming, while non-role integer draws never prompt',()=>{
 const run=(owner:number|null,character?:string)=>{const s=setup([2]);if(character)s.players[0].character=character as any;return gDispatch(s,command(s),1001,(x)=>{integer(x.random,6);x.players[0].shield=die(x,owner,'归属测试');return {state:x,ok:true};},unusedInitial,ports).state;};
 expect(run(1).choice).toBeNull();expect(run(0,'character-026').choice).toBeNull();expect(run(0,'character-044').choice).toBeNull();expect(run(null).choice).toMatchObject({kind:'g-program',actor:1});
});
it('generated dice retain the committed entropy sequence across programming and multiple suspended decisions',()=>{
 const base=setup([]),core=driver(2);let s=gDispatch(base,command(base),1001,core,unusedInitial,ports).state;
 const reference=structuredClone(base.random);integer(reference,base.deck.length);const raw=integer(reference,6)+1,reroll=integer(reference,6)+1,second=integer(reference,6)+1,shield=integer(reference,50);
 expect(gState(s).dice!.waiting.raw).toBe(raw);s=choose(s,{accept:true},core);expect((s.choice!.data as any).value).toBe(reroll);s=choose(s,{option:'6'},core);expect((s.choice!.data as any).value).toBe(second);s=choose(s,{option:'1'},core);clean(s);
 expect(s.players[0].ap).toBe(11);expect(s.players[0].shield).toBe(shield);expect(s.random.seed).toBe(reference.seed);expect(s.events.map(e=>e.seq)).toEqual(Array.from({length:s.events.length},(_,i)=>i+1));
});
it('replay rejects changed random bounds and preserves the authoritative pending state',()=>{
 const base=setup([]);let s=gDispatch(base,command(base),1001,driver(),unusedInitial,ports).state;s=choose(s,{accept:false});
 const r=gDispatch(s,command(s,{type:'choose',choice:s.choice!.id,option:'6'},'bound-mismatch'),1003,(x)=>{integer(x.random,7);return {state:x,ok:true};},unusedInitial,ports);
 expect(r.ok).toBe(false);expect(r.error).toBe('G随机续接范围不一致');expect(r.state).toEqual(s);
});
