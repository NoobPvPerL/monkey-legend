import {distanceForVersion,mapForVersion} from '../../game-data/src/index';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {CombatHit} from './stage4-combat';
import {combatGear} from './stage4-combat';
import {ignoreLocation} from './stage4-terrain';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import {boardEmptyEntry,onBoard,currentDesert} from './stage4-board';
type State=GameState&resources.ResourceState&{stage4:NonNullable<GameState['stage4']>};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const root=(s:GameState)=>s.cardStack!.stack[0]?.serial??(s.movement?`move${s.movement.gearRoot}`:`revision${s.revision}`);
function allowed(s:GameState,a:number,t:number,card:string){return onBoard(s,t)&&roles.cardEffectAllowed(s as State,t,resources.equipmentDefinition(s as State,card),{...s.stage3!.equipmentSources[card],actor:a,faction:s.players[a].faction,origin:'equipment'});}
export function reactiveArrival(s:GameState,mover:number,from:string,to:string):Task[]{
 const map=mapForVersion(s.version).map;if(s.movement?.gearQuiet||map[from].region===map[to].region)return [];
 return s.order.filter(a=>a!==mover&&onBoard(s,a)&&map[s.players[a].cell].region===map[to].region&&combatGear(s,a,'basic-068')).map(actor=>task('gear-react',{actor,data:{root:root(s)}}));
}
export function reactiveInjury(s:GameState,hits:(CombatHit&{loss:number})[]):Task[]{
 return hits.filter(h=>onBoard(s,h.target)&&combatGear(s,h.target,'basic-068')).map(h=>task('gear-react',{actor:h.target,data:{root:s.cardStack!.stack[0]?.serial??`batch${s.batch}`}}));
}
export function landingPush(s:GameState,a:number,direction?:roles.Direction):Task[]{return onBoard(s,a)&&combatGear(s,a,'basic-076')?[task('gear-push',{actor:a,...(direction?{data:{direction}}:{})})]:[];}
export function stage4MovementTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 const st=s as State,a=t.actor??s.active;
 if(t.action==='gear-react'){
  const key=`${(t.data as {root:string|number}).root}:guan:${a}`,map=mapForVersion(s.version);
  if(!onBoard(s,a)||!combatGear(s,a,'basic-068')||st.stage4.gearMarks[key]||resources.mountMovementBlocked(st,a))return true;
  const cells=map.cells.filter(c=>distanceForVersion(s.version,s.players[a].cell,c.id)===1&&boardEmptyEntry(st,a,c.id,[a])).map(c=>c.id);
  if(cells.length){st.stage4.gearMarks[key]=true;p.select(s,'gear-react',a,now,{cells});}return true;
 }
 if(t.action==='gear-push'){
  const card=combatGear(s,a,'basic-076');if(!onBoard(s,a)||!card)return true;
  const direction=(t.data as {direction?:roles.Direction}|undefined)?.direction,region=mapForVersion(s.version).map[s.players[a].cell].region,options:Record<string,string[]>={};
  for(const q of s.players)if(q.seat!==a&&onBoard(s,q.seat)&&mapForVersion(s.version).map[q.cell].region===region&&allowed(s,a,q.seat,card))for(const d of direction?[direction]:roles.DIRECTIONS){const cell=roles.nextInDirection(q.cell,d);if(cell&&boardEmptyEntry(st,q.seat,cell,[q.seat]))options[`${q.seat}:${d}`]=[cell];}
  if(Object.keys(options).length)p.select(s,'gear-push',a,now,{options});return true;
 }
 if(t.action==='board-desert'&&!(t.data as {noTang?:boolean}|undefined)?.noTang&&currentDesert(st,a)&&onBoard(s,a)&&combatGear(s,a,'basic-069')){
  if(ignoreLocation(s,a)){p.emit(s,'terrain',`S${a+1} 唐车忽略本次地形效果`);return true;}
  p.select(s,'gear-terrain',a,now,{data:{task:t}});return true;
 }
 return false;
}
export function stage4MovementChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean){
 const st=s as State,c=s.choice!,a=c.actor;
 if(c.kind==='gear-terrain'){
  if(cmd.accept&&!timeout&&combatGear(s,a,'basic-069')){p.emit(s,'terrain',`S${a+1} 唐车忽略本次地形效果`);return;}
  const original=(c.data as {task:Task}).task;s.queue.unshift({...original,data:{...(original.data as object??{}),noTang:true}});return;
 }
 if(timeout||!onBoard(s,a))return;
 if(c.kind==='gear-react'){
  if(cmd.cell){need(c.cells?.includes(cmd.cell)&&boardEmptyEntry(st,a,cmd.cell,[a])&&!resources.mountMovementBlocked(st,a),'关烁落点不合法');
   const m=s.movement;if(m)m.gearQuiet=true;s.queue.unshift(...p.relocate(s,a,cmd.cell,true,true,false));if(m)delete m.gearQuiet;
  }return;
 }
 if(cmd.option){need(c.options&&Object.hasOwn(c.options,cmd.option),'临伟叶方向或目标不合法');const target=Number(cmd.option.split(':')[0]),cell=c.options![cmd.option][0],card=combatGear(s,a,'basic-076');
  need(card&&allowed(s,a,target,card)&&boardEmptyEntry(st,target,cell,[target]),'临伟叶落点已失效');s.queue.unshift(...p.relocate(s,target,cell,false,true,false));
 }
}
