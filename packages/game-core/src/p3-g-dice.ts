import {hActiveAllowed} from './p3-h-active';
import {hEnabled,hState} from './p3-h-state';
import {hCanReroll,hRerollKey,hSixActor} from './p3-h-dice';
import type {HDieStep} from './p3-h-dice';
import {gEnabled,gState} from './p3-g-state';
import {onBoard} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import {integer} from './random';
import type {GameState,Command,DispatchResult,Event as GameEvent,RandomTraceEntry} from './types';
import type {Stage3Ports} from './stage3-engine';

export interface GDieStep {
 index:number;owner:number|null;reason:string;raw:number;final:number;h?:HDieStep;
 programmer:number|null;programmed:boolean;reroll:number|null;
 events:GameEvent[];choiceSerial:number;remaining:number;at:number;
 intents?:{command:Command;at:number}[];
}
export interface GReplayDriver {kind:'command'|'initial';base:GameState;command?:Command;at:number}
export interface GDiePending {
 driver:GReplayDriver;steps:GDieStep[];random:RandomTraceEntry[];
 waiting:{index:number;owner:number|null;reason:string;raw:number;value:number;programmer:number|null;programmed:boolean;reroll:number|null;eventStart:number;h?:HDieStep;intents?:{command:Command;at:number}[]};
}
interface GReplayCursor {index:number;steps:GDieStep[];now:number;continued:boolean;logicalAt:number}
type State=GameState&{_gReplay?:GReplayCursor};
type Execute=(s:GameState,cmd:Command,at:number)=>DispatchResult;
type Initial=(s:GameState,at:number)=>GameState;
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
export class GDiePause extends Error {
 constructor(readonly state:GameState,readonly index:number,readonly owner:number|null,readonly reason:string,readonly raw:number,readonly programmer:number|null){super('G骰子等待权威选择');}
}
export function gNow(s:GameState,at:number){const r=(s as State)._gReplay,value=r?.continued?Math.max(r.now,at):at;if(r)r.logicalAt=value;return value;}
function programmer(s:GameState,owner:number|null):number|null {
 return s.order.find(a=>a!==owner&&hActiveAllowed(s,a)&&onBoard(s,a)&&String(s.players[a].character)==='character-033'&&!gState(s).programUsed[a]&&(owner===null||roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[owner])))??null;
}
function rawDie(s:GameState){const n=s.random.dice.length?s.random.dice.shift()!:integer(s.random,6)+1;need(Number.isInteger(n)&&n>=1&&n<=6,'测试骰子必须1—6');return n;}
/** Called after the original die is consumed and logged. Private transcripts
 * replay committed random draws, including secure PostgreSQL entropy, while the
 * command checkpoint resumes. No result or baseline is accepted from a client. */
export function gDie(s:GameState,reason:string,owner:number|null,raw:number,ports?:Stage3Ports):number {
 if(!gEnabled(s.version))return raw;const r=(s as State)._gReplay;need(r,'G骰子缺少续接上下文');
 const index=r!.index++,old=r!.steps.find(v=>v.index===index);
 if(old){
  need(old.owner===owner&&old.reason===reason&&old.raw===raw,'G骰子续接身份不一致');
  if(old.programmed){need(old.programmer!==null,'G编程来源缺失');const reroll=rawDie(s);need(reroll===old.reroll,'G编程续接随机不一致');gState(s).programUsed[old.programmer!]=true;}
  if(old.h){if(old.h.rolled){const rolled=rawDie(s);need(rolled===old.h.reroll,'H狂叫续接随机不一致');hState(s).rerollRoots[old.h.root]=true;}if(old.h.draw){const events=s.events.length,serial=s.eventSerial;ports!.draw(s,old.h.sixActor!,2);s.events.splice(events);s.eventSerial=serial;}}
  for(const intent of old.intents??[])need(ports?.sideIntent?.(s,intent.command,intent.at,true),'G等待期间意图续接失败');
  for(const event of old.events)s.events.push({...structuredClone(event),seq:++s.eventSerial});
  s.choiceSerial=old.choiceSerial;s.clock={remaining:old.remaining,since:null};r!.continued=true;r!.now=old.at;r!.logicalAt=old.at;return old.final;
 }
 const p=programmer(s,owner),math=owner!==null&&hActiveAllowed(s,owner)&&onBoard(s,owner)&&String(s.players[owner].character)==='character-042';
 if(p!==null||math||hCanReroll(s,owner)||hSixActor(s,owner,raw)!==null)throw new GDiePause(structuredClone(s),index,owner,reason,raw,p);return raw;
}
function attach(driver:GReplayDriver,steps:GDieStep[],random:RandomTraceEntry[],now:number){
 const s=structuredClone(driver.base) as State;s._gReplay={index:0,steps:structuredClone(steps),now,continued:false,logicalAt:driver.at};s.random._gTrace={index:0,entries:structuredClone(random)};return s;
}
function clear(s:GameState){delete(s as State)._gReplay;delete s.random._gTrace;delete gState(s).dice;return s;}
function capture(error:GDiePause,driver:GReplayDriver,steps:GDieStep[],now:number,p:Stage3Ports):GameState {
 const s=error.state,random=structuredClone(s.random._gTrace?.entries??[]);now=(s as State)._gReplay?.logicalAt??now;delete(s as State)._gReplay;delete s.random._gTrace;
 gState(s).dice={driver:structuredClone(driver),steps:structuredClone(steps),random,waiting:{index:error.index,owner:error.owner,reason:error.reason,raw:error.raw,value:error.raw,programmer:error.programmer,programmed:false,reroll:null,eventStart:s.events.length,...(hEnabled(s.version)?{h:{root:error.owner===null?'none':hRerollKey(s,error.owner),rolled:false,reroll:null,sixActor:null,draw:false}}:{})}};
 const kind=error.programmer!==null?'g-program':hCanReroll(s,error.owner)?'h-reroll':error.owner!==null&&hActiveAllowed(s,error.owner)&&s.players[error.owner].character==='character-042'?'g-math':'h-six',actor=kind==='h-six'?hSixActor(s,error.owner,error.raw)!:error.programmer??error.owner!;
 if(kind==='h-six')gState(s).dice!.waiting.h!.sixActor=actor;
 p.select(s,kind,actor,now,{data:{owner:error.owner,reason:error.reason,value:error.raw}});return s;
}
function execute(driver:GReplayDriver,steps:GDieStep[],random:RandomTraceEntry[],now:number,core:Execute,initial:Initial,p:Stage3Ports):DispatchResult {
 const s=attach(driver,steps,random,now);
 try{const result=driver.kind==='initial'?{state:initial(s,driver.at),ok:true}:core(s,driver.command!,driver.at);if(result.ok)clear(result.state);return result;}
 catch(error){if(error instanceof GDiePause)return {state:capture(error,driver,steps,now,p),ok:true};throw error;}
}
export function gInitial(s:GameState,at:number,initial:Initial,p:Stage3Ports):GameState {
 const driver:GReplayDriver={kind:'initial',base:structuredClone(s),at};return execute(driver,[],[],at,()=>{throw Error('无初始命令');},initial,p).state;
}
export function gDispatch(previous:GameState,cmd:Command,now:number,core:Execute,initial:Initial,p:Stage3Ports):DispatchResult {
 const first=gDispatchStep(previous,cmd,now,core,initial,p);if(!first.ok||cmd.type!=='tick'||first.state===previous)return first;
 if(first.state.revision===previous.revision&&!first.state.seen.includes(cmd.id))return {state:previous,ok:true};
 let s=first.state;for(let i=0;s.phase!=='over';i++){
  const deadline=s.choice?.deadline??(s.clock.since===null?Infinity:s.clock.since+s.clock.remaining);if(deadline>now)break;
  if(i>=999)return {state:previous,ok:false,error:'G超时流程未收敛'};
  // Internal catch-up steps consume no extra client request ID or revision.
  const base=structuredClone(s);base.seen=[...previous.seen];base.revision=previous.revision;base.time=previous.time;
  const next=gDispatchStep(base,cmd,now,core,initial,p);if(!next.ok)return {state:previous,ok:false,error:next.error};if(next.state===base)break;s=next.state;
 }
 s.seen=[...previous.seen,cmd.id];s.revision=previous.revision+1;s.time=now;return {state:s,ok:true};
}
function gDispatchStep(previous:GameState,cmd:Command,now:number,core:Execute,initial:Initial,p:Stage3Ports):DispatchResult {
 try{
  const flow=gState(previous).dice;
  if(!flow){const result=execute({kind:'command',base:structuredClone(previous),command:structuredClone(cmd),at:now},[],[],now,core,initial,p);if(!result.ok)return {state:previous,ok:false,error:result.error};if(gState(result.state).dice){result.state.seen=[...previous.seen,cmd.id];result.state.revision=previous.revision+1;result.state.time=now;}return result;}
  const c=previous.choice!;need(cmd&&typeof cmd==='object'&&typeof cmd.id==='string'&&cmd.id.length>0&&!previous.seen.includes(cmd.id),'重复命令');need(cmd.revision===previous.revision,'命令版本过期');need(Number.isSafeInteger(cmd.actor)&&cmd.actor>=0&&cmd.actor<4,'座位/命令版本必须为有效整数');need(Number.isFinite(now)&&now>=previous.time,'时钟必须单调');
  if(cmd.type!=='choose'&&cmd.type!=='tick'){
   need(now<c.deadline,'命令已超时，请先处理时钟事件');const s=structuredClone(previous);need(p.sideIntent?.(s,cmd,now,false),'请先完成改骰选择');
   const waiting=gState(s).dice!.waiting;(waiting.intents??=[]).push({command:structuredClone(cmd),at:now});s.seen.push(cmd.id);s.revision++;s.time=now;return {state:s,ok:true};
  }
  if(cmd.type==='tick'&&now<c.deadline)return {state:previous,ok:true};
  const timeout=cmd.type==='tick',at=timeout?c.deadline:now;
  if(!timeout){const chosen=cmd as Extract<Command,{type:'choose'}>;need(now<c.deadline,'命令已超时，请先处理时钟事件');need(chosen.choice===c.id,'选择窗口已过期');need(cmd.actor===c.actor,'请交给待选择的座位操作');need(chosen.accept===undefined||typeof chosen.accept==='boolean','发动选项必须为布尔值');}
  const s=structuredClone(previous),pending=gState(s).dice!,w=pending.waiting;
  if(c.kind==='g-program'){
   if(!timeout&&(cmd as Extract<Command,{type:'choose'}>).accept){
    need(w.programmer===c.actor&&hActiveAllowed(s,c.actor)&&onBoard(s,c.actor)&&!gState(s).programUsed[c.actor],'编程次数或来源无效');gState(s).programUsed[c.actor]=true;w.programmed=true;
    s.random._gTrace={index:pending.random.length,entries:structuredClone(pending.random)};w.value=rawDie(s);w.reroll=w.value;pending.random=structuredClone(s.random._gTrace.entries);delete s.random._gTrace;p.emit(s,'dice',`编程：d6 = ${w.value}`,w.value);
   }
   if(timeout)p.emit(s,'timeout',`S${c.actor+1} 编程选择超时`);
   if(hCanReroll(s,w.owner)){p.select(s,'h-reroll',w.owner!,at,{data:{owner:w.owner,reason:w.reason,value:w.value}});s.seen.push(cmd.id);s.revision++;s.time=now;return {state:s,ok:true};}
   if(w.owner!==null&&hActiveAllowed(s,w.owner)&&onBoard(s,w.owner)&&String(s.players[w.owner].character)==='character-042'){
    p.select(s,'g-math',w.owner,at,{data:{owner:w.owner,reason:w.reason,value:w.value}});s.seen.push(cmd.id);s.revision++;s.time=now;return {state:s,ok:true};
   }
  }else if(c.kind==='h-reroll'){
   need(hCanReroll(s,w.owner)&&w.owner===c.actor,'狂叫次数或来源无效');
   if(!timeout&&(cmd as Extract<Command,{type:'choose'}>).accept){hState(s).rerollRoots[w.h!.root]=true;w.h!.rolled=true;s.random._gTrace={index:pending.random.length,entries:structuredClone(pending.random)};w.value=rawDie(s);w.h!.reroll=w.value;pending.random=structuredClone(s.random._gTrace.entries);delete s.random._gTrace;p.emit(s,'dice',`狂叫：d6 = ${w.value}`,w.value);}
   if(timeout)p.emit(s,'timeout',`S${c.actor+1} 狂叫选择超时`);
  }else if(c.kind==='h-six'){
   need(w.h?.sixActor===c.actor&&hSixActor(s,w.owner,w.value)===c.actor,'6技能来源或最终点数无效');
   if(!timeout&&(cmd as Extract<Command,{type:'choose'}>).accept){w.h!.draw=true;s.random._gTrace={index:pending.random.length,entries:structuredClone(pending.random)};p.draw(s,c.actor,2);pending.random=structuredClone(s.random._gTrace.entries);delete s.random._gTrace;p.emit(s,'skill',`S${c.actor+1} 6：最终点数6，免费摸2`);}
   if(timeout)p.emit(s,'timeout',`S${c.actor+1} 6选择超时`);
  }else{
   need(c.kind==='g-math'&&w.owner===c.actor&&hActiveAllowed(s,c.actor),'不是当前数学天才窗口');const option=timeout?undefined:(cmd as Extract<Command,{type:'choose'}>).option;
   if(option!==undefined){need(typeof option==='string'&&/^[1-6]$/.test(option),'数学天才点数须1—6');w.value=Number(option);p.emit(s,'skill',`S${c.actor+1} 数学天才：最终点数${w.value}`);}
   if(timeout)p.emit(s,'timeout',`S${c.actor+1} 数学天才选择超时`);
  }
  if(c.kind!=='h-six'&&hSixActor(s,w.owner,w.value)!==null){const actor=hSixActor(s,w.owner,w.value)!;w.h!.sixActor=actor;p.select(s,'h-six',actor,at,{data:{owner:w.owner,reason:w.reason,value:w.value}});s.seen.push(cmd.id);s.revision++;s.time=now;return {state:s,ok:true};}
  const step:GDieStep={index:w.index,owner:w.owner,reason:w.reason,raw:w.raw,final:w.value,...(w.h?{h:structuredClone(w.h)}:{}),programmer:w.programmer,programmed:w.programmed,reroll:w.reroll,events:structuredClone(s.events.slice(w.eventStart)),choiceSerial:s.choiceSerial,remaining:s.clock.remaining,at,...(w.intents?{intents:structuredClone(w.intents)}:{})};
  const result=execute(pending.driver,[...pending.steps,step],pending.random,at,core,initial,p);if(!result.ok)return {state:previous,ok:false,error:result.error};
  result.state.seen=[...previous.seen,cmd.id];result.state.revision=previous.revision+1;result.state.time=now;return result;
 }catch(error){return {state:previous,ok:false,error:error instanceof Error?error.message:String(error)};}
}
