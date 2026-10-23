import {mapForVersion,neighboringForVersion,distanceForVersion} from '../../game-data/src/index';
import {hEnabled,hState} from './p3-h-state';
import {hActiveAllowed} from './p3-h-active';
import {roleEffectAllowed} from './character-effects';
import {boardEmptyEntry,boardWater,onBoard} from './stage4-board';
import {canEnterWithMount,gainAp,equipmentReplacements,equipmentDefinition} from './stage3-resources';
import {gPiecePhysical} from './p3-g-equipment';
import {transferEquipmentTasks} from './stage4-equipment';
import {eGate,eRoot,eSetRoot} from './p3-e';
import {relocationCell} from './playtest';
import {DIRECTIONS,nextInDirection} from './stage3-roles';
import type {ResourceState} from './stage3-resources';
import type {GameState,Task,DamageHit,Command} from './types';
import type {Stage3Ports} from './stage3-engine';

/** N-10 provisional private runtime; dice are resolved by server-owned tasks. */
export interface HRenState {
 used:boolean[];attempts:number[][];won:boolean[][];
 pending:{actor:number;target:number;attempt:number}|null;
}
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const task=(action:string,extra:Partial<Task>):Task=>({kind:'stage3',action,...extra});
export const initialHRen=():HRenState=>({used:[false,false,false,false],attempts:Array.from({length:4},()=>[0,0,0,0]),won:Array.from({length:4},()=>[false,false,false,false]),pending:null});
export function hRen(s:GameState):HRenState{return hState(s).ren??=initialHRen();}
const near=(s:GameState,a:number,t:number)=>{const m=mapForVersion(s.version).map,x=m[s.players[a].cell].region,y=m[s.players[t].cell].region;return x===y||neighboringForVersion(s.version,x,y);};
const permits=(s:GameState,a:number,t:number,locked=false)=>roleEffectAllowed({origin:locked?'role-locked':'role-active',actor:a,roleModifiers:[]},s.players[t]);
export function hRenDuelTargets(s:GameState,a:number):number[]{
 if(!hEnabled(s.version)||String(s.players[a].character)!=='character-034'||!onBoard(s,a)||!hActiveAllowed(s,a))return [];
 return s.order.filter(t=>t!==a&&onBoard(s,t)&&near(s,a,t)&&permits(s,a,t)&&!s.stage3?.h?.ren?.won[a][t]);
}
export function hRenDuelBegin(s:GameState,a:number,target:number){
 need(hEnabled(s.version),'化学金牌教练仅限H版本');const r=hRen(s);
 need(s.phase==='action'&&!s.choice&&s.active===a&&!r.used[a]&&!r.pending&&hRenDuelTargets(s,a).includes(target),'化学金牌教练角色、次数或目标不合法');
 r.used[a]=true;const attempt=++r.attempts[a][target];r.pending={actor:a,target,attempt};return {...r.pending};
}
/** Rolls must come from the three server-owned final dice, never a command. */
export function hRenDuelSettle(s:GameState,rolls:readonly number[]){
 const r=hRen(s),d=r.pending;need(hEnabled(s.version)&&d,'拼点记录已失效');
 need(rolls.length===3&&rolls.every(v=>Number.isInteger(v)&&v>=1&&v<=6),'拼点必须三个最终d6');
 const pending=d!,{actor:a,target:t,attempt}=pending;
 need(onBoard(s,a)&&onBoard(s,t),'拼点参与者已离场');
 const own=Math.max(rolls[0],rolls[1]),other=rolls[2],win=own>other;
 r.pending=null;
 if(!win)return {actor:a,target:t,attempt,own,other,win,failure:Math.min(3,attempt),ap:0,cards:0,equipment:[] as string[]};
 r.won[a][t]=true;const source=s.players[t],recipient=s.players[a],ap=source.ap,cards=source.hand.length;
 source.ap=0;gainAp(s as GameState&ResourceState,a,ap);recipient.hand.push(...source.hand);source.hand=[];
 return {actor:a,target:t,attempt,own,other,win,failure:0,ap,cards,equipment:[...s.stage3!.equipment[t]]};
}
export function hRenStart(s:ResourceState,a:number){if(hEnabled(s.version)&&s.stage3.h?.ren)s.stage3.h.ren.used[a]=false;}
/** Apply only at the normal round-grant call site, not all AP gains. */
export function hRenRoundAp(s:ResourceState,a:number,amount:number){return hEnabled(s.version)&&String(s.players[a].character)==='character-034'?Math.max(0,amount-1):amount;}
export function hRenBackCells(s:GameState,a:number,mover:number,anchor:string):string[]{
 if(!hEnabled(s.version)||!onBoard(s,a)||!onBoard(s,mover)||!permits(s,a,mover,true))return [];
 const origin=s.players[mover].cell,before=distanceForVersion(s.version,origin,anchor);
 return DIRECTIONS.map(d=>nextInDirection(origin,d)).filter((cell):cell is string=>{
  if(!cell||!boardEmptyEntry(s,mover,cell,[mover])||!canEnterWithMount(s as GameState&ResourceState,mover,cell))return false;
  const actual=relocationCell(s,mover,origin,cell);return actual!==null&&distanceForVersion(s.version,actual,anchor)>before;
 });
}
export function hRenExpelCells(s:GameState,a:number,t:number):string[]{
 if(!hEnabled(s.version)||!onBoard(s,a)||String(s.players[a].character)!=='character-034'||!onBoard(s,t)||!near(s,a,t)||!hActiveAllowed(s,a)||!permits(s,a,t))return [];
 const map=mapForVersion(s.version),origin=map.map[s.players[a].cell].region,outside=(cell:string)=>{const r=map.map[cell].region;return r!==origin&&!neighboringForVersion(s.version,origin,r);};
 return map.cells.filter(c=>outside(c.id)&&boardEmptyEntry(s,t,c.id,[t])&&canEnterWithMount(s as GameState&ResourceState,t,c.id)&&(()=>{const actual=relocationCell(s,t,s.players[t].cell,c.id);return actual!==null&&outside(actual);})()).map(c=>c.id);
}
/** One offer per actual injury event, in stable injury then action order. */
export function hRenInjuries(s:GameState,hits:(DamageHit&{loss:number})[]):Task[]{
 if(!hEnabled(s.version))return [];const jobs:Task[]=[];
 for(const h of hits){
  if(h.loss<=0||!onBoard(s,h.target))continue;
  if(String(s.players[h.target].character)==='character-034'&&h.source!==null&&h.source!==h.target&&onBoard(s,h.source))jobs.push(task('h-ren-retreat',{actor:h.target,target:h.source}));
  for(const a of s.order)if(hRenExpelCells(s,a,h.target).length)jobs.push(task('h-ren-expel',{actor:a,target:h.target}));
 }
 return jobs;
}
export function hRenAction(s:GameState,a:number){const targets=hRenDuelTargets(s,a),used=s.stage3?.h?.ren?.used[a]??false;return {available:s.phase==='action'&&!s.choice&&s.active===a&&!used&&targets.length>0,used,targets,attempts:s.stage3?.h?.ren?.attempts[a]??[0,0,0,0]};}
export function hRenPublic(s:GameState){const r=s.stage3?.h?.ren;return r?{used:r.used,attempts:r.attempts,won:r.won}:null;}
export function hRenSkill(s:GameState,a:number,target:number,p:Stage3Ports){const d=hRenDuelBegin(s,a,target);p.emit(s,'skill',`S${a+1} 化学金牌教练：与S${target+1}第${d.attempt}次拼点`);s.queue.push(task('h-ren-duel',{actor:a,target}));}
function gearOffer(s:GameState,a:number,source:number,card:string){
 const st=s as GameState&ResourceState;if(!onBoard(s,a)||!onBoard(s,source)||!st.stage3.equipment[source].includes(card))return null;
 const options=equipmentReplacements(st,a,card),waterBlocked=['basic-063','basic-064'].includes(equipmentDefinition(st,card))&&boardWater(st,s.players[a].cell,a);
 return {options,paired:Boolean(gPiecePhysical(st,card)),waterBlocked};
}
export function hRenTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||!['h-ren-duel','h-ren-gear','h-ren-retreat','h-ren-back','h-ren-expel'].includes(t.action??''))return false;
 const a=t.actor!,target=t.target!;
 if(t.action==='h-ren-duel'){
  const rolls=[p.die(s,'化学金牌教练本人一',a),p.die(s,'化学金牌教练本人二',a),p.die(s,'化学金牌教练对方',target)],r=hRenDuelSettle(s,rolls);
  p.emit(s,'skill',`S${a+1} 化学金牌教练：${r.own}对${r.other}，${r.win?`获胜，转移${r.ap}AP／${r.cards}张手牌`:`失败，自受${r.failure}伤`}`);
  s.queue.unshift(...(r.win?r.equipment.map(card=>task('h-ren-gear',{actor:a,target,data:{card}})):p.damage(s,[{target:a,amount:r.failure,source:a,category:'response'}])));return true;
 }
 if(!onBoard(s,a))return true;
 if(t.action==='h-ren-gear'){
  const {card}=t.data as {card:string},offer=gearOffer(s,a,target,card);if(!offer)return true;
  if(offer.paired&&(!offer.options.allowed||offer.waterBlocked)){p.emit(s,'transfer','化学金牌教练：成对装备件无法合法安装，留在原装备区');return true;}
  if(offer.options.allowed&&offer.options.required&&!offer.waterBlocked){p.select(s,'h-ren-gear',a,now,{source:target,cards:offer.options.cards,data:{card}});return true;}
  s.queue.unshift(...transferEquipmentTasks(s,a,target,card));return true;
 }
 if(!onBoard(s,target))return true;
 if(t.action==='h-ren-retreat'){
  const options=['pass'];if(hRenBackCells(s,a,target,s.players[a].cell).length)options.push('source');if(hRenBackCells(s,a,a,s.players[target].cell).length)options.push('self');if(options.length===3)options.push('both');
  if(options.length>1)p.select(s,'h-ren-retreat',a,now,{source:target,data:{options}});return true;
 }
 const d=t.data as {anchor?:number;root?:string}|undefined,root=d?.root??`ren${s.batch}-${a}-${target}-${s.eventSerial}`;eSetRoot(s,root);
 const cells=t.action==='h-ren-back'?hRenBackCells(s,a,target,s.players[d!.anchor!].cell):hRenExpelCells(s,a,target);if(!cells.length)return true;
 const gate=eGate(s,target,a,[{...t,data:{...d,root}}],root);if(gate!==null){s.queue.unshift(...gate);return true;}
 p.select(s,t.action==='h-ren-back'?'h-ren-back':'h-ren-expel',a,now,{source:target,cells,data:{...d,root}});return true;
}
export function hRenChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean{
 const c=s.choice;if(!hEnabled(s.version)||!c||!['h-ren-gear','h-ren-retreat','h-ren-back','h-ren-expel'].includes(c.kind))return false;
 const a=c.actor,target=c.source!;
 if(c.kind==='h-ren-gear'){
  if(timeout||cmd.accept===false)return true;const {card}=c.data as {card:string},offer=gearOffer(s,a,target,card);if(!offer)return true;
  need(offer.options.allowed&&!offer.waterBlocked&&Boolean(cmd.card)&&Boolean(c.cards?.includes(cmd.card!))&&offer.options.cards.includes(cmd.card!),'请选择仍合法的替换装备，或放弃该件');s.queue.unshift(...transferEquipmentTasks(s,a,target,card,cmd.card!));return true;
 }
 if(c.kind==='h-ren-retreat'){
  const option=timeout?'pass':cmd.option??'pass';need((c.data as {options:string[]}).options.includes(option),'请选择合法后退方式');const root=`ren${s.batch}-${a}-${target}-${s.eventSerial}`;
  if(option==='self'||option==='both')s.queue.unshift(task('h-ren-back',{actor:a,target:a,data:{anchor:target,root}}));
  if(option==='source'||option==='both')s.queue.unshift(task('h-ren-back',{actor:a,target,data:{anchor:a,root}}));return true;
 }
 if(timeout||!cmd.cell)return true;const d=c.data as {anchor?:number;root:string},cells=c.kind==='h-ren-back'?hRenBackCells(s,a,target,s.players[d.anchor!].cell):hRenExpelCells(s,a,target);
 need(c.cells?.includes(cmd.cell)&&cells.includes(cmd.cell),'后退或厌蠢落点已失效');eSetRoot(s,d.root);s.queue.unshift(...p.relocate(s,target,cmd.cell,false,false,true,{actor:a,root:eRoot(s)}));return true;
}
