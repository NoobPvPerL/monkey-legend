import {mapForVersion,neighboringForVersion,distanceForVersion} from '../../game-data/src/index';
import {hEnabled,hState} from './p3-h-state';
import {hActiveAllowed} from './p3-h-active';
import {onBoard} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import {eRoot,eSetRoot} from './p3-e';
import {dPay} from './p3-d';
import type {ResourceState} from './stage3-resources';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export function hCircleStart(s:ResourceState,a:number){
 if(!hEnabled(s.version))return;const h=s.stage3.h!;h.circleUsed[a]=false;h.circles=h.circles.filter(c=>c.actor!==a&&s.players[c.actor].hp>0);
 h.circlePermissions=Object.fromEntries(Object.entries(h.circlePermissions).filter(([key])=>h.circles.some(c=>key.startsWith(c.id+':'))));
}
export function hCircleAction(s:GameState,a:number){return {available:hEnabled(s.version)&&s.phase==='action'&&!s.choice&&s.active===a&&onBoard(s,a)&&s.players[a].character==='character-011'&&!hState(s).circleUsed[a]&&hActiveAllowed(s,a),used:hEnabled(s.version)?hState(s).circleUsed[a]:false};}
export function hCircle(s:GameState,a:number,p:Stage3Ports){
 need(hCircleAction(s,a).available,'画圆当前不可发动');const region=mapForVersion(s.version).map[s.players[a].cell].region,regions=Object.keys(mapForVersion(s.version).regions).filter(r=>r===region||neighboringForVersion(s.version,region,r));
 hState(s).circleUsed[a]=true;hState(s).circles.push({id:`circle${s.stage3!.turn}-${a}`,actor:a,regions});p.emit(s,'skill',`S${a+1} 画圆：${regions.join('、')}，跨界每条链可付1AP`);
}
/** Only real traversed straight segments; teleports supply just their destination. */
export function hCircleLine(s:GameState,from:string,to:string):string[]{
 const map=mapForVersion(s.version).map,a=map[from],b=map[to];if(!a||!b||a.row!==b.row&&a.col!==b.col)return [to];
 const dr=Math.sign(b.row-a.row),dc=Math.sign(b.col-a.col);return Array.from({length:distanceForVersion(s.version,from,to)},(_,i)=>`r${a.row+dr*(i+1)}c${a.col+dc*(i+1)}`);
}
interface CircleData {circle:string;source:number;root:string;resume:Task[]}
/** null allows, [] refuses, otherwise save a resumable boundary offer. */
export function hCircleGate(s:GameState,a:number,to:string|null,resume:Task[],root=eRoot(s),placement=false,route?:string[]):Task[]|null {
 if(!hEnabled(s.version)||placement||!onBoard(s,a))return null;const h=hState(s),map=mapForVersion(s.version).map,p=s.players[a];
 for(const c of h.circles){
  if(s.players[c.actor].hp<=0||p.character==='character-027'&&p.hand.length===1||!roleEffectAllowed({origin:'role-active',actor:c.actor,roleModifiers:[]},p))continue;
  let inside=c.regions.includes(map[p.cell].region),crossed=false;
  for(const cell of route??[to]){const next=Boolean(cell&&map[cell]&&c.regions.includes(map[cell].region));if(inside&&!next)crossed=true;inside=next;}
  if(!crossed)continue;const key=`${c.id}:${a}:${root}`,permitted=h.circlePermissions[key];if(permitted===true)continue;if(permitted===false)return [];
  if(p.ap<1){h.circlePermissions[key]=false;return [];}
  return [task('h-circle-boundary',{actor:a,data:{circle:c.id,source:c.actor,root,resume} satisfies CircleData})];
 }
 return null;
}
export function hCircleTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!hEnabled(s.version)||t.action!=='h-circle-boundary')return false;const d=t.data as CircleData;
 if(onBoard(s,t.actor!)&&hState(s).circles.some(c=>c.id===d.circle&&s.players[c.actor].hp>0))p.select(s,'h-circle-pay',t.actor!,now,{source:d.source,data:d});else s.queue.unshift(...d.resume);return true;
}
export function hCircleChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean {
 if(!hEnabled(s.version)||s.choice?.kind!=='h-circle-pay')return false;const a=s.choice.actor,d=s.choice.data as CircleData,key=`${d.circle}:${a}:${d.root}`,accept=!timeout&&cmd.accept===true;
 need(!accept||onBoard(s,a)&&s.players[a].ap>=1,'画圆越界需要1AP');if(accept)dPay(s,a,1);hState(s).circlePermissions[key]=accept;eSetRoot(s,d.root);s.queue.unshift(...d.resume);
 p.emit(s,'skill',`S${a+1} 画圆：${accept?'支付1AP，允许本条位移链越界':'拒绝本条位移链越界'}`);return true;
}
