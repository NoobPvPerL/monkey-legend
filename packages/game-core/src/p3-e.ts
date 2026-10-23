import {hCircleGate} from './p3-h-circle';
import {gCubeCanMove} from './p3-g-cube';
import {fMovementGate} from './p3-f';
import {distanceForVersion,mapForVersion,hasP3ERules} from '../../game-data/src/index';
import {roleEffectAllowed} from './character-effects';
import {boardEmptyEntry,onBoard} from './stage4-board';
import {canEnterWithMount,mountMovementBlocked} from './stage3-resources';
import type {ResourceState,Stage3Resources} from './stage3-resources';
import {DIRECTIONS,nextInDirection,emptyEntry,cardEffectAllowed} from './stage3-roles';
import {relocationCell} from './playtest';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import {dPay} from './p3-d';
export const eEnabled=hasP3ERules;
export interface P3EState {current:string;permissions:Record<string,boolean>;eggUsed:Record<string,boolean>;moved:Record<string,boolean>;escapeUsed:boolean[]}
type EGame=GameState&ResourceState&{stage3:Stage3Resources&{e:P3EState}};
export interface ERelocationCause {actor:number|null;root?:string;placement?:boolean;preview?:boolean}
export type EPorts=Omit<Stage3Ports,'relocate'>&{relocate:(s:GameState,a:number,cell:string,voluntary:boolean,carry?:boolean,reactive?:boolean,cause?:ERelocationCause)=>Task[]};
const st=(s:GameState)=>s as EGame;
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export function eTurnStart(s:ResourceState,a:number){if(!eEnabled(s.version))return;const r=s.stage3 as Stage3Resources&{e?:P3EState};r.e??={current:'initial',permissions:{},eggUsed:{},moved:{},escapeUsed:[false,false,false,false]};r.e.current=`turn${r.turn+1}`;r.e.permissions={};r.e.eggUsed={};r.e.moved={};r.e.escapeUsed[a]=false;}
export function eBeginAction(s:GameState){if(eEnabled(s.version))st(s).stage3.e.current=`revision${s.revision}`;}
export function eRoot(s:GameState):string{return String(s.cardStack?.stack[0]?.serial??(s.movement?`move${s.movement.gearRoot}`:st(s).stage3.e.current));}
export function eSetRoot(s:GameState,root:string){if(eEnabled(s.version))st(s).stage3.e.current=root;}
const permissionKey=(s:GameState,target:number,source:number|null,root=eRoot(s))=>`${root}:${source??'environment'}:${target}`;
export function eDenied(s:GameState,target:number,source:number|null){return eEnabled(s.version)&&s.players[target].character==='character-016'&&source!==target&&st(s).stage3.e.permissions[permissionKey(s,target,source)]===false;}
/** null permits the operation; [] rejects; otherwise the caller queues consent. */
export function eGate(s:GameState,target:number,source:number|null,resume:Task[],root=eRoot(s),placement=false):Task[]|null {
 if(!placement&&!gCubeCanMove(s,target))return [];
 if(!eEnabled(s.version)||s.players[target].character!=='character-016'||source===target)return null;
 if(!onBoard(s,target))return [];
 const allowed=st(s).stage3.e.permissions[permissionKey(s,target,source,root)];
 return allowed===true?null:allowed===false?[]:[task('e-consent',{actor:target,data:{source,resume,root}})];
}
export function eMoved(s:GameState,from:string,to:string,root=eRoot(s)):Task[]{if(!eEnabled(s.version)||from===to)return [];st(s).stage3.e.moved[root]=true;return s.movement&&root===`move${s.movement.gearRoot}`?[]:[task('e-egg',{data:{root}})];}
export function eMovementEnd(s:GameState){if(eEnabled(s.version)&&s.movement){const root=eRoot(s);eSetRoot(s,root);if(st(s).stage3.e.moved[root])s.queue.push(task('e-egg',{data:{root}}));}}
const effect=(a:number,locked=false)=>({origin:locked?'role-locked' as const:'role-active' as const,actor:a,roleModifiers:[]});
function groupAllowed(s:GameState,a:number,t:number,locked=false){return onBoard(s,t)&&!(s.players[t].character==='character-027'&&s.players[t].hand.length===1)&&roleEffectAllowed(effect(a,locked),s.players[t]);}
export function eNeighbours(s:GameState,a:number,voluntary=false):string[]{
 if(!onBoard(s,a)||voluntary&&mountMovementBlocked(st(s),a))return [];
 return DIRECTIONS.map(d=>nextInDirection(s.players[a].cell,d)).filter((cell):cell is string=>Boolean(cell)&&boardEmptyEntry(st(s),a,cell!,[a])&&canEnterWithMount(st(s),a,cell!));
}
export function eRegionDistance(s:GameState,a:number,region:string){return Math.min(...mapForVersion(s.version).cells.filter(c=>c.region===region).map(c=>distanceForVersion(s.version,s.players[a].cell,c.id)));}
interface ForceData {root:string;mode:'away'|'toward';base:string;region?:string;locked?:boolean}
function forceCells(s:GameState,target:number,d:ForceData){const before=d.mode==='away'?distanceForVersion(s.version,s.players[target].cell,d.base):eRegionDistance(s,target,d.region!);return eNeighbours(s,target).filter(cell=>{const actual=relocationCell(s,target,s.players[target].cell,cell);return actual!==null&&(d.mode==='away'?distanceForVersion(s.version,actual,d.base)>before:Math.min(...mapForVersion(s.version).cells.filter(c=>c.region===d.region).map(c=>distanceForVersion(s.version,actual,c.id)))<before);});}
export function eSkill(s:GameState,a:number,kind:'gas'|'escape',region:string|undefined,p:EPorts){
 need(eEnabled(s.version)&&onBoard(s,a)&&s.players[a].character===(kind==='gas'?'character-014':'character-038'),'本角色不能发动此技能');
 if(kind==='escape')need(!st(s).stage3.e.escapeUsed[a]&&region&&Object.hasOwn(mapForVersion(s.version).regions,region),'逃生演习次数或地区无效');
 const cost=kind==='gas'?1:2;need(s.players[a].ap>=cost,`技能需要${cost}AP`);dPay(s,a,cost);if(kind==='escape')st(s).stage3.e.escapeUsed[a]=true;
 const data:ForceData={root:eRoot(s),mode:kind==='gas'?'away':'toward',base:s.players[a].cell,...(region?{region}:{})};
 s.queue.push(...s.order.filter(t=>t!==a&&groupAllowed(s,a,t)).map(target=>task('e-force',{actor:a,target,data})),...(kind==='escape'?[task('e-escape-hit',{actor:a,data})]:[]));
 p.emit(s,'skill',`S${a+1} ${kind==='gas'?'释放毒气':'逃生演习'}，支付${cost}AP`);
}
export function eEndTask(s:GameState):Task[]{return eEnabled(s.version)&&s.players[s.active].character==='character-038'?[task('e-highest',{actor:s.active,data:{root:`end${s.stage3!.turn}`}})]:[];}
export function eTask(s:GameState,t:Task,now:number,p:EPorts):boolean {
 if(!eEnabled(s.version)||!t.action?.startsWith('e-'))return false;
 const a=t.actor??s.active,target=t.target!,data=t.data as ForceData&{source:number|null;resume:Task[];cell:string;voluntary:boolean;carry:boolean;reactive:boolean;origin:string};
 if(data?.root)eSetRoot(s,data.root);
 if(t.action==='e-consent'){if(onBoard(s,a))p.select(s,'move-consent',a,now,{...(data.source!==null?{source:data.source}:{}),data});return true;}
 if(t.action==='e-relocate'){if(onBoard(s,a)&&boardEmptyEntry(st(s),a,data.cell,[a])&&canEnterWithMount(st(s),a,data.cell))s.queue.unshift(...p.relocate(s,a,data.cell,data.voluntary,data.carry,data.reactive,{actor:data.source,root:data.root}));return true;}
 if(t.action==='e-egg'){
  const root=data.root,r=st(s).stage3.e,egg=s.players.find(q=>q.character==='character-024'&&onBoard(s,q.seat));if(!egg||r.eggUsed[root]||!r.moved[root])return true;
  const cells=eNeighbours(s,egg.seat,true);if(cells.length){r.eggUsed[root]=true;p.select(s,'egg-move',egg.seat,now,{cells,data:{root}});}return true;
 }
 if(t.action==='e-highest'){
  if(!onBoard(s,a))return true;const max=Math.max(...s.players.filter(q=>onBoard(s,q.seat)).map(q=>q.hp));
  s.queue.unshift(...s.order.filter(t=>t!==a&&s.players[t].hp===max&&groupAllowed(s,a,t,true)).map(target=>task('e-force',{actor:a,target,data:{root:data.root,mode:'away',base:s.players[a].cell,locked:true}})));return true;
 }
 if(t.action==='e-force'){
  if(!onBoard(s,a)||!groupAllowed(s,a,target,data.locked))return true;
  const cells=forceCells(s,target,data);if(!cells.length)return true;const gate=eGate(s,target,a,[t],data.root);if(gate!==null){s.queue.unshift(...gate);return true;}
  p.select(s,'force-step',a,now,{source:target,cells,data});return true;
 }
 if(t.action==='e-escape-hit'){
  if(!onBoard(s,a))return true;const others=s.order.filter(t=>t!==a&&onBoard(s,t)),max=Math.max(-1,...others.map(t=>eRegionDistance(s,t,data.region!)));
  s.queue.unshift(...p.damage(s,others.filter(t=>eRegionDistance(s,t,data.region!)===max&&groupAllowed(s,a,t)).map(target=>({target,amount:1,source:a,category:'response' as const}))));return true;
 }
 if(t.action==='e-off-map'){
  if(!onBoard(s,target))return true;const gate=eGate(s,target,a,[t],data.root);if(gate!==null){s.queue.unshift(...gate);return true;}
  const circle=hCircleGate(s,target,null,[t],data.root);if(circle!==null){s.queue.unshift(...circle);return true;}
  s.stage4!.offMap[target]=true;s.classic!.exposure[target]={region:null,streak:0};s.classic!.caveEnds![target]=0;p.emit(s,'off-map',`S${target+1} 移出地图，等待下个个人开始返回`);return true;
 }
 if(t.action==='e-swap'){
  const c=s.cardStack?.stack.at(-1);if(!onBoard(s,a)||!onBoard(s,target)||!c||!cardEffectAllowed(st(s),a,c.definition,c.effect)||!cardEffectAllowed(st(s),target,c.definition,c.effect))return true;
  const gate=eGate(s,target,a,[t],data.root);if(gate!==null){s.queue.unshift(...gate);return true;}
  const from=s.players[a].cell,to=s.players[target].cell,b={...st(s),farmClosed:s.classic!.farmClosed},first=relocationCell(s,a,from,to,[target]),second=relocationCell(s,target,to,from,[a]);
  if(!first||!second||first===second||!emptyEntry(b,a,first,[a,target])||!emptyEntry(b,target,second,[a,target])||!canEnterWithMount(st(s),a,first)||!canEnterWithMount(st(s),target,second)||mountMovementBlocked(st(s),a))return true;
  if(!fMovementGate(s,a,first,()=>p.die(s,'干枯',a),false,data.root)||!fMovementGate(s,target,second,()=>p.die(s,'干枯',target),false,data.root))return true;
  for(const [who,to] of [[a,first],[target,second]] as const){const circle=hCircleGate(s,who,to,[t],data.root);if(circle!==null){s.queue.unshift(...circle);return true;}}
  s.stage4!.offMap[target]=true;const jobs=p.relocate(s,a,first,true,true,true,{actor:a,root:data.root});s.stage4!.offMap[target]=false;jobs.push(...p.relocate(s,target,second,false,true,true,{actor:a,root:data.root}));s.queue.unshift(...jobs);return true;
 }
 if(t.action==='e-elbow'){
  if(!onBoard(s,a)||!onBoard(s,target)||!boardEmptyEntry(st(s),target,data.cell,[target])||!canEnterWithMount(st(s),target,data.cell)||!canEnterWithMount(st(s),a,s.players[target].cell)||mountMovementBlocked(st(s),a))return true;
  const gate=eGate(s,target,a,[t],data.root);if(gate!==null){s.queue.unshift(...gate);return true;}
  const from=s.players[target].cell;if(!fMovementGate(s,target,data.cell,()=>p.die(s,'干枯',target),false,data.root)||!fMovementGate(s,a,from,()=>p.die(s,'干枯',a),false,data.root))return true;for(const [who,to] of [[target,data.cell],[a,from]] as const){const circle=hCircleGate(s,who,to,[t],data.root);if(circle!==null){s.queue.unshift(...circle);return true;}}s.queue.unshift(...p.relocate(s,target,data.cell,false,true,true,{actor:a,root:data.root}),...p.relocate(s,a,from,true,true,true,{actor:a,root:data.root}));return true;
 }
 throw Error('未知E批任务');
}
export function eChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:EPorts,timeout:boolean){
 const c=s.choice!,a=c.actor,data=c.data as ForceData&{source:number|null;resume:Task[]};eSetRoot(s,data.root);
 if((c.kind as string)==='move-consent'){
  const accepted=!timeout&&cmd.accept===true;st(s).stage3.e.permissions[permissionKey(s,a,data.source,data.root)]=accepted;p.emit(s,'skill',`S${a+1} 不动：${accepted?'同意':'拒绝'}本次位移链`);s.queue.unshift(...data.resume);return;
 }
 if((c.kind as string)==='egg-move'){
  if(!timeout&&cmd.cell){need(c.cells?.includes(cmd.cell)&&eNeighbours(s,a,true).includes(cmd.cell),'体育部部长落点不合法');s.queue.unshift(...p.relocate(s,a,cmd.cell,true,true,true,{actor:a,root:data.root}));}return;
 }
 const target=c.source!,cells=forceCells(s,target,data),cell=timeout?cells[0]:cmd.cell;
 if(!cell){need(!cells.length,'请选择强制位移方向');return;}need(c.cells?.includes(cell)&&cells.includes(cell),'强制位移落点已失效');s.queue.unshift(...p.relocate(s,target,cell,false,true,true,{actor:a,root:data.root}));
}
