import {hSmall} from './p3-h-occupancy';
import {hState,hEnabled} from './p3-h-state';
import {hActiveAllowed} from './p3-h-active';
import {onBoard} from './stage4-board';
import {mapForVersion,distanceForVersion} from '../../game-data/src/index';
import {eRoot} from './p3-e';
import {integer} from './random';
import {roleEffectAllowed} from './character-effects';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
const allowed=(s:GameState,a:number,t:number)=>hSmall(s,a)&&onBoard(s,a)&&onBoard(s,t)&&a!==t&&hActiveAllowed(s,a)&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[t]);
/** Explicit walking segments cross every traversed cell; teleports only enter their endpoint. */
export function hSmallCrossed(s:GameState,a:number,from:string,to:string,walking=false,root?:string):Task[]{
 if(!hSmall(s,a)||from===to)return [];
 const cells=[to],map=mapForVersion(s.version).map,start=map[from],end=map[to];
 if(walking&&start&&end&&(start.row===end.row||start.col===end.col)){
  cells.length=0;const dr=Math.sign(end.row-start.row),dc=Math.sign(end.col-start.col);
  for(let i=1;i<=distanceForVersion(s.version,from,to);i++)cells.push(`r${start.row+dr*i}c${start.col+dc*i}`);
 }
 root??=eRoot(s);const h=hState(s);h.smallSeen??={};const tasks:Task[]=[];
 for(const cell of cells)for(const t of s.order){const key=`${root}:${a}:${t}`;
  if(t===a||!onBoard(s,t)||s.players[t].cell!==cell||h.smallSeen[key])continue;
  h.smallSeen[key]=true;tasks.push({kind:'stage3',action:'h-small',actor:a,target:t,data:{root}});
 }return tasks;
}
export function hSmallTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||t.action!=='h-small')return false;
 if(allowed(s,t.actor!,t.target!))p.select(s,'h-small',t.actor!,now,{source:t.target,data:t.data});return true;
}
export function hSmallChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean{
 if(!hEnabled(s.version)||s.choice?.kind!=='h-small')return false;
 const a=s.choice.actor,t=s.choice.source!;
 if(!timeout&&cmd.accept&&allowed(s,a,t)){
  const roll=p.die(s,'小',a);
  if(roll<=3)s.queue.unshift(...p.damage(s,[{source:a,target:t,amount:1,category:'response'}]));
  else{let count=0;for(let n=0;n<2&&s.players[t].hand.length;n++){const hand=s.players[t].hand;s.players[a].hand.push(hand.splice(integer(s.random,hand.length),1)[0]);count++;}p.emit(s,'transfer',`S${a+1} 小：从S${t+1}随机拿${count}张`);}
 }return true;
}
