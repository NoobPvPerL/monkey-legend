import {distanceForVersion} from '../../game-data/src/index';
import {hEnabled} from './p3-h-state';
import {boardEmptyEntry,onBoard} from './stage4-board';
import {canEnterWithMount} from './stage3-resources';
import {DIRECTIONS,nextInDirection} from './stage3-roles';
import {relocationCell} from './playtest';
import {eGate,eRoot,eSetRoot} from './p3-e';
import {roleEffectAllowed} from './character-effects';
import type {ResourceState} from './stage3-resources';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
const task=(action:string,extra:Partial<Task>):Task=>({kind:'stage3',action,...extra});
const allowed=(s:GameState,a:number,t:number)=>onBoard(s,a)&&onBoard(s,t)&&a!==t&&!(s.players[t].character==='character-027'&&s.players[t].hand.length===1)&&roleEffectAllowed({origin:'role-locked',actor:a,roleModifiers:[]},s.players[t]);
export function hAttractCells(s:GameState,a:number,t:number,base:string){
 if(!allowed(s,a,t))return [];const before=distanceForVersion(s.version,s.players[t].cell,base);
 return DIRECTIONS.map(d=>nextInDirection(s.players[t].cell,d)).filter((cell):cell is string=>{
  if(!cell||!boardEmptyEntry(s,t,cell,[t])||!canEnterWithMount(s as GameState&ResourceState,t,cell))return false;
  const actual=relocationCell(s,t,s.players[t].cell,cell);return actual!==null&&distanceForVersion(s.version,actual,base)<before;
 });
}
export function hStartTasks(s:GameState,a:number):Task[]{return hEnabled(s.version)&&onBoard(s,a)&&s.players[a].character==='character-001'?s.order.filter(t=>allowed(s,a,t)).map(target=>task('h-attract',{actor:a,target,data:{base:s.players[a].cell,root:`h-start${s.stage3!.turn}`}})):[];}
export function hMovementTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||t.action!=='h-attract')return false;const a=t.actor!,target=t.target!,data=t.data as {base:string;root:string};eSetRoot(s,data.root);
 const cells=hAttractCells(s,a,target,data.base);if(!cells.length)return true;const gate=eGate(s,target,a,[t],data.root);if(gate!==null){s.queue.unshift(...gate);return true;}
 p.select(s,'h-attract',a,now,{source:target,cells,data});return true;
}
export function hMovementChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean{
 if(!hEnabled(s.version)||s.choice?.kind!=='h-attract')return false;const c=s.choice,a=c.actor,target=c.source!,data=c.data as {base:string;root:string};eSetRoot(s,data.root);
 const cells=hAttractCells(s,a,target,data.base),cell=timeout?cells[0]:cmd.cell;if(!cell){if(cells.length)throw Error('请选择组织部部长合法方向');return true;}
 if(!c.cells?.includes(cell)||!cells.includes(cell))throw Error('组织部部长落点已失效');s.queue.unshift(...p.relocate(s,target,cell,false,true,true,{actor:a,root:eRoot(s)}));return true;
}
