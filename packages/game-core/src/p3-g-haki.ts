import {hBlocks,hSmall} from './p3-h-occupancy';
import {hActiveAllowed} from './p3-h-active';
import {gEnabled} from './p3-g-state';
import {onBoard} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import {mapForVersion,distanceForVersion} from '../../game-data/src/index';
import {stepCost} from './classic';
import {terrainThrough} from './stage4-terrain';
import type {ResourceState} from './stage3-resources';
import {canEnterWithMount} from './stage3-resources';
import {fPreviewMovement} from './p3-f';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
export const gHaki=(s:GameState,a=s.active)=>gEnabled(s.version)&&s.active===a&&s.players[a].character==='character-049'&&Boolean(s.movement?.haki);
/** A temporary occupied square is legal only if this movement can still reach an empty landing. */
export function gHakiEscape(s:GameState,a:number,cell:string,remaining:number):boolean {
 const occupied=(id:string)=>s.players.some(p=>p.seat!==a&&onBoard(s,p.seat)&&p.cell===id&&hBlocks(s,a,p.seat));
 if(!terrainThrough(s,a,cell,occupied(cell)))return false;if(!occupied(cell))return true;
 const probe=structuredClone(s),queue:[string,number][]=[[cell,remaining]],best=new Map<string,number>();
 while(queue.length){const [from,left]=queue.shift()!;if((best.get(from)??-1)>=left)continue;best.set(from,left);probe.players[a].cell=from;
  for(const next of mapForVersion(s.version).cells){const cost=stepCost(probe,a,next.id);if(cost===null||cost>left||!terrainThrough(probe,a,next.id,occupied(next.id))||!fPreviewMovement(probe,a,next.id)||!canEnterWithMount(probe as GameState&ResourceState,a,next.id))continue;
   if(!occupied(next.id))return true;queue.push([next.id,left-cost]);
  }
 }return false;
}
/** Straight water leaps include the characters actually crossed in the water. */
export function gHakiCrossed(s:GameState,a:number,from:string,to:string):Task[]{
 if(!gHaki(s,a))return [];const m=s.movement!,map=mapForVersion(s.version).map,start=map[from],end=map[to],dr=Math.sign(end.row-start.row),dc=Math.sign(end.col-start.col),cells:string[]=[];
 for(let i=1;i<=distanceForVersion(s.version,from,to);i++)cells.push(`r${start.row+dr*i}c${start.col+dc*i}`);
 const jobs:Task[]=[];for(const cell of cells)for(const q of s.players)if(q.seat!==a&&onBoard(s,q.seat)&&q.cell===cell&&!m.haki!.includes(q.seat)){m.haki!.push(q.seat);jobs.push({kind:'stage3',action:'g-haki',actor:a,target:q.seat});}return jobs;
}
const allowed=(s:GameState,a:number,t:number)=>hActiveAllowed(s,a)&&onBoard(s,a)&&onBoard(s,t)&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[t]);
export function gHakiTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!gEnabled(s.version)||t.action!=='g-haki')return false;const a=t.actor!,target=t.target!;
 if(gHaki(s,a)&&allowed(s,a,target))p.select(s,'g-haki',a,now,{source:target});return true;
}
export function gHakiChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean {
 if(!gEnabled(s.version)||s.choice?.kind!=='g-haki')return false;const a=s.choice.actor,target=s.choice.source!;
 if(!timeout&&cmd.accept&&gHaki(s,a)&&allowed(s,a,target))s.queue.unshift(...p.damage(s,[{source:a,target,amount:1,category:'response'}]));return true;
}
