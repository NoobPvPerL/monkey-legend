import {hBlocks,hSmall} from './p3-h-occupancy';
import {mapForVersion} from '../../game-data/src/index';
import {hEnabled,hState} from './p3-h-state';
import {hActiveAllowed} from './p3-h-active';
import {boardEntryAllowed,boardEmptyEntry,onBoard} from './stage4-board';
import {mountMovementBlocked,canEnterWithMount,basicMoveAllowance} from './stage3-resources';
import {roleEffectAllowed} from './character-effects';
import {relocationCell} from './playtest';
import {eGate,eRoot,eSetRoot} from './p3-e';
import {dPay} from './p3-d';
import type {GameState,Task,Command} from './types';
import type {ResourceState} from './stage3-resources';
import type {Stage3Ports} from './stage3-engine';
const task=(action:string,extra:Partial<Task>):Task=>({kind:'stage3',action,...extra});
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
export const hLeapRole=(s:{version?:string;players:{character:string}[]},a:number)=>hEnabled(s.version)&&s.players[a]?.character==='character-035';
export function hPendingBirth(s:Pick<GameState,'version'|'players'|'stage3'|'stage4'>,a:number){return hLeapRole(s,a)&&s.players[a].cell===''&&s.stage3?.h?.birth?.[a]===null&&s.stage4?.offMap[a]===true;}
export function hBirthCells(s:GameState,a:number):string[]{
 if(!hLeapRole(s,a))return [];return mapForVersion(s.version).cells.filter(c=>boardEntryAllowed(s,a,c.id)&&!s.players.some(q=>q.seat!==a&&onBoard(s,q.seat)&&q.cell===c.id&&hBlocks(s,a,q.seat))).map(c=>c.id);
}
/** No location or opening cards are assigned until this mandatory choice. */
export function hBirthBegin(s:GameState,now:number,p:Stage3Ports):boolean{
 const a=s.players.findIndex(q=>hLeapRole(s,q.seat));if(a<0)return false;
 hState(s).birth=[null,null,null,null];s.stage4!.offMap[a]=true;
 const cells=hBirthCells(s,a);need(cells.length,'自定义出生没有合法空格');p.select(s,'h-birth',a,now,{cells});return true;
}
export function hBirthFinish(s:GameState,cmd:Extract<Command,{type:'choose'}>,timeout:boolean,p:Stage3Ports){
 const c=s.choice!,a=c.actor,cells=hBirthCells(s,a),cell=timeout?cells[0]:cmd.cell;
 need(hPendingBirth(s,a)&&Boolean(cell)&&Boolean(c.cells?.includes(cell!))&&cells.includes(cell!),'请选择合法的自定义出生格');
 s.players[a].cell=cell!;s.stage4!.offMap[a]=false;hState(s).birth![a]=cell!;
 p.emit(s,'teleport',`S${a+1} 世界是多元的：出生于${cell}`);
}
export function hLeapCells(s:GameState,a:number):string[]{
 if(!hLeapRole(s,a)||!onBoard(s,a)||s.players[a].moved||s.stage3?.c?.blocked[a]||mountMovementBlocked(s as GameState&ResourceState,a))return [];
 return mapForVersion(s.version).cells.filter(c=>c.id!==s.players[a].cell&&boardEmptyEntry(s,a,c.id,[a])).map(c=>c.id);
}
interface Respect {from:string;to:string;region:string;root:string}
export function hRespectCells(s:GameState,a:number,target:number,region:string):string[]{
 const map=mapForVersion(s.version).map;
 if(!hLeapRole(s,a)||!onBoard(s,a)||!onBoard(s,target)||a===target||map[s.players[a].cell].region!==region||map[s.players[target].cell].region!==region||!hActiveAllowed(s,a)||!roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[target]))return [];
 return mapForVersion(s.version).cells.filter(c=>{
  if(c.region===region||!boardEmptyEntry(s,target,c.id,[target])||!canEnterWithMount(s as GameState&ResourceState,target,c.id))return false;
  const actual=relocationCell(s,target,s.players[target].cell,c.id);return actual!==null&&map[actual].region!==region;
 }).map(c=>c.id);
}
export function hLeapMove(s:GameState,a:number,cell:string|undefined,cost:number,p:Stage3Ports){
 need(typeof cell==='string'&&hLeapCells(s,a).includes(cell),'Leap请选择全图合法空格');
 const from=s.players[a].cell,region=mapForVersion(s.version).map[cell!].region,root=eRoot(s);
 const original=s.order.filter(t=>t!==a&&onBoard(s,t)&&mapForVersion(s.version).map[s.players[t].cell].region===region);
 dPay(s,a,cost);s.stage3!.basicUsed[a]++;s.players[a].moved=s.stage3!.basicUsed[a]>=basicMoveAllowance(s as GameState&ResourceState,a);
 s.queue.push(...p.relocate(s,a,cell!,true),...original.map(target=>task('h-respect',{actor:a,target,data:{from,to:cell!,region,root} satisfies Respect})));
 p.emit(s,'cost',`S${a+1} Leap基础传送支付${cost}AP，不掷移动骰`);
}
export function hLeapTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||t.action!=='h-respect')return false;
 const a=t.actor!,target=t.target!,d=t.data as Respect;
 if(s.players[a].cell===d.from)return true;eSetRoot(s,d.root);
 const cells=hRespectCells(s,a,target,d.region);if(!cells.length)return true;
 const gate=eGate(s,target,a,[t],d.root);if(gate!==null){s.queue.unshift(...gate);return true;}
 p.select(s,'h-respect',a,now,{source:target,cells,data:d});return true;
}
export function hLeapChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean{
 const c=s.choice;if(!hEnabled(s.version)||c?.kind!=='h-respect')return false;
 if(timeout||!cmd.cell)return true;const d=c.data as Respect,a=c.actor,target=c.source!;
 need(c.cells?.includes(cmd.cell)&&hRespectCells(s,a,target,d.region).includes(cmd.cell),'respect请选择地区之外的合法空格');eSetRoot(s,d.root);
 s.queue.unshift(...p.relocate(s,target,cmd.cell,false,false,true,{actor:a,root:eRoot(s)}));return true;
}
