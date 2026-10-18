import {discardCards} from './exercise';
import {reactiveArrival} from './stage4-movement';
import {hasPlaytestRules} from '../../game-data/src/index';
import {nearestShore} from './playtest';
import {mapForVersion,distanceForVersion} from '../../game-data/src/index';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {ResourceState} from './stage3-resources';
import * as resources from './stage3-resources';
import * as stack from './stage3-card-stack';
import * as roles from './stage3-roles';
import {integer} from './random';
import {native,water} from './classic';
import {onBoard,boardEmptyEntry,currentDesert,forcedRegionPaths,forcedRegionDistance,boardEffectAllowed} from './stage4-board';
type State=GameState&ResourceState&stack.CardStackState&{stage4:NonNullable<GameState['stage4']>};
const state=(s:GameState)=>s as State;
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export const MAP_CARD_IDS=['basic-013','basic-020','basic-021','basic-023','basic-026','basic-031','basic-032','basic-033','basic-034'];
export const isBoardChoice=(kind:string)=>['board-path','board-cell','board-guess','board-tax','board-return','native-shore'].includes(kind);
export function boardArrivalTasks(s:GameState,a:number,from:string,to:string,reactive=true):Task[]{
 const m=mapForVersion(s.version).map;
 return [...(m[from]?.region!==m[to]?.region&&currentDesert(s,a)?[task('board-desert',{actor:a})]:[]),...(reactive?reactiveArrival(s,a,from,to):[])];
}
export function boardReturn(s:GameState,a:number,now:number,p:Stage3Ports):boolean {
 const st=state(s);if(!st.stage4.offMap[a])return false;
 const cells=mapForVersion(s.version).cells.filter(c=>boardEmptyEntry(st,a,c.id,[a])).map(c=>c.id);
 if(cells.length){p.select(s,'board-return',a,now,{cells});return true;}
 s.queue=s.queue.filter(t=>!(t.kind==='turn-start'&&t.actor===a));s.queue.unshift({kind:'next'});return true;
}
function allowed(s:State,c:stack.PendingCard){return c.targets.filter(a=>onBoard(s,a)&&!c.cancelled.includes(a)&&roles.cardEffectAllowed(s,a,c.definition,c.effect)&&!c.stage4?.officeExempt?.includes(a));}
export function stage4MapEffect(s:GameState,now:number,p:Stage3Ports):boolean {
 const st=state(s),c=stack.currentCard(st),a=c.actor;
 if(!MAP_CARD_IDS.includes(c.definition))return false;
 resources.recordCombo(st,a,c.definition);const targets=allowed(st,c),jobs:Task[]=[];
 if(c.definition==='basic-020')for(const target of targets){st.stage4.toiletUntil[target]=st.stage3.starts[target]+1;st.stage4.toiletEffects[target]=structuredClone(c.effect);}
 if(c.definition==='basic-026'){
  st.stage4.lmmUntil[a]=st.stage3.starts[a]+1;st.stage4.lmmEffects[a]=structuredClone(c.effect);st.stage4.lmmSerial[a]=c.serial;
  jobs.push(...s.order.filter(t=>targets.includes(t)).map(actor=>task('board-pay',{actor,source:a,data:{mode:'lmm'}})));
 }
 if(c.definition==='basic-034')for(const target of targets){st.stage4.offMap[target]=true;s.classic!.exposure[target]={region:null,streak:0};s.classic!.caveEnds![target]=0;p.emit(s,'off-map',`S${target+1} 移出地图，等待下个个人开始返回`);}
 if(c.definition==='basic-023'){
  st.stage4.blocks=st.stage4.blocks.filter(b=>!(b.owner===a&&b.region===c.stage4!.region));
  st.stage4.blocks.push({region:c.stage4!.region!,owner:a,effect:structuredClone(c.effect),until:st.stage3.starts[a]+1,exempt:c.stage4!.officeExempt??[]});
 }
 if(c.definition==='basic-032')st.stage4.deserts[c.stage4!.region!]={owner:a,effect:structuredClone(c.effect)};
 if(c.definition==='basic-033'){
  const prior=st.stage4.water[c.stage4!.region!];
  st.stage4.water[c.stage4!.region!]={owner:a,effect:structuredClone(c.effect)};
  if(hasPlaytestRules(s.version)){
   const reserved:string[]=[],plans:{actor:number;cells:string[]}[]=[];
   for(const actor of s.order)if(onBoard(st,actor)&&water(s,s.players[actor].cell,actor)&&native(s,actor)){
    const cells=nearestShore(st,actor,reserved);if(!cells.length){if(prior)st.stage4.water[c.stage4!.region!]=prior;else delete st.stage4.water[c.stage4!.region!];p.emit(s,'effect','汶泽无合法岸边，地形变化未生效');s.queue.unshift(task('cleanup',{serial:c.serial}));return true;}
    plans.push({actor,cells});reserved.push(cells[0]);
   }
   for(const plan of plans)jobs.push(task('board-shore',{actor:plan.actor,data:{cells:plan.cells.filter(cell=>!reserved.some((r,i)=>r===cell&&plans[i].actor!==plan.actor))}}));
  }
  for(const actor of s.order)if(onBoard(st,actor)&&mapForVersion(s.version).map[s.players[actor].cell].region===c.stage4!.region&&boardEffectAllowed(st,actor,c.effect)&&!native(s,actor)&&s.players[actor].hand.length)jobs.push({kind:'water',actor,data:{entry:true}});
 }
 if(c.definition==='basic-013'||c.definition==='basic-031'){
  const region=c.definition==='basic-013'?'操场':'教学楼',steps=c.definition==='basic-013'?1:3;
  jobs.push(...s.order.filter(t=>targets.includes(t)).map(actor=>task('board-force',{actor,serial:c.serial,data:{region,steps}})),task('board-force-after',{serial:c.serial}));
 }
 if(c.definition==='basic-021'){
  const target=targets[0];if(target!==undefined){c.stage4={...c.stage4,guessDie:s.random.dice.length?s.random.dice.shift()!:integer(s.random,6)+1};p.select(s,'board-guess',target,now,{source:a,data:{serial:c.serial}});}
 }
 p.emit(s,'effect',c.definition+'地图效果结算');s.queue.unshift(...jobs,task('cleanup',{serial:c.serial}));return true;
}
function pay(s:State,a:number,owner:number,mode:'desert'|'lmm'|'tribute',card:string|null,ap:boolean,p:Stage3Ports):Task[]{
 const actor=s.players[a],to=s.players[owner];let missing=false;
 if(mode==='tribute'||mode==='desert'&&ap){
  const amount=Math.min(1,actor.ap);actor.ap-=amount;if(amount&&to.hp>0)resources.gainAp(s,owner,amount);missing=amount<1;
 }
 if(mode!=='desert'||!ap){
  if(card){need(actor.hand.includes(card),'手中没有所选上交牌');actor.hand=actor.hand.filter(c=>c!==card);if(to.hp>0)to.hand.push(card);else discardCards(s,[card]);}
  else missing=true;
 }
 p.emit(s,'tax',`S${a+1} ${mode==='desert'?'沙漠税':mode==='lmm'?'LMM交牌':'上课铃上交'}${missing?'，资源不足受1伤':''}`);
 return missing?p.damage(s,[{target:a,amount:1,source:owner,category:'attack',directHp:true}]):[];
}
export function stage4MapTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!t.action?.startsWith('board-'))return false;
 const st=state(s),a=t.actor??s.active,c=st.cardStack.stack.at(-1);
 if(t.action==='board-shore'){
  const cells=(t.data as {cells:string[]}).cells.filter(cell=>boardEmptyEntry(st,a,cell,[a]));
  need(cells.length>0,'上岸预留格失效');p.select(s,'native-shore',a,now,{cells});return true;
 }
 if(t.action==='board-desert'){
  const desert=currentDesert(st,a);if(!desert)return true;
  if(s.players[a].hand.length||s.players[a].ap>0)p.select(s,'board-tax',a,now,{cards:[...s.players[a].hand],source:desert.owner,data:{mode:'desert'}});
  else s.queue.unshift(...pay(st,a,desert.owner,'desert',null,false,p));return true;
 }
 if(t.action==='board-pay'){
  if(!onBoard(st,a))return true;const mode=(t.data as {mode:'lmm'|'tribute'}).mode;
  if(s.players[a].hand.length)p.select(s,'board-tax',a,now,{cards:[...s.players[a].hand],source:t.source,data:{mode}});
  else s.queue.unshift(...pay(st,a,t.source!,mode,null,false,p));return true;
 }
 if(!c||t.serial!==undefined&&c.serial!==t.serial)return true;
 if(t.action==='board-force'){
  const {region,steps}=t.data as {region:string;steps:number},paths=forcedRegionPaths(st,a,region,steps);
  if(paths.length>1)p.select(s,'board-path',a,now,{options:Object.fromEntries(paths.map((path,i)=>[String(i),path])),data:{serial:c.serial}});
  else if(paths[0]?.length)queuePath(st,a,paths[0],c.serial);return true;
 }
 if(t.action==='board-step'){
  const cell=(t.data as {cell:string}).cell;
  if(!onBoard(st,a)||distanceForVersion(s.version,s.players[a].cell,cell)!==1||!boardEmptyEntry(st,a,cell,[a])){
   s.queue=s.queue.filter(q=>!(q.action==='board-step'&&q.actor===a&&q.serial===c.serial));return true;
  }
  s.queue.unshift(...p.relocate(s,a,cell,false,false));
  if(mapForVersion(s.version).map[cell].region==='山洞')s.queue=s.queue.filter(q=>!(q.action==='board-step'&&q.actor===a&&q.serial===c.serial));return true;
 }
 if(t.action==='board-force-carry'){s.queue.unshift(task('carry',{actor:a,data:t.data}));return true;}
 if(t.action==='board-force-after'){
  const targets=allowed(st,c).filter(t=>t!==c.actor);
  if(c.definition==='basic-013'){
   const max=Math.max(-1,...targets.map(t=>forcedRegionDistance(st,t,'操场')));
   s.queue.unshift(...p.damage(s,targets.filter(t=>forcedRegionDistance(st,t,'操场')===max).map(target=>({target,amount:1,source:c.actor,category:'attack' as const,directHp:true}))));
  }else s.queue.unshift(...s.order.filter(t=>targets.includes(t)&&s.players[t].team!==s.players[c.actor].team&&mapForVersion(s.version).map[s.players[t].cell].region==='教学楼').map(actor=>task('board-pay',{actor,source:c.actor,data:{mode:'tribute'}})));
  return true;
 }
 if(t.action==='board-teleport'){
  if(!onBoard(st,t.target!)||!onBoard(st,c.actor))return true;
  const cells=mapForVersion(s.version).cells.filter(cell=>boardEmptyEntry(st,t.target!,cell.id,[t.target!])).map(cell=>cell.id);
  if(cells.length)p.select(s,'board-cell',c.actor,now,{cells,source:t.target,data:{serial:c.serial}});return true;
 }
 throw Error('未知阶段四地图任务');
}
function queuePath(s:State,a:number,path:string[],serial:number){
 const snapshots=roles.carryCandidates(s,a,s.players[a].cell);
 s.queue.unshift(...path.map(cell=>task('board-step',{actor:a,serial,data:{cell}})),...(snapshots.length?[task('board-force-carry',{actor:a,serial,data:snapshots})]:[]));
}
/** True means a replacement choice was opened and must not be closed by caller. */
export function stage4MapChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):void {
 const st=state(s),choice=s.choice!,a=choice.actor;
 if(choice.kind==='native-shore'){
  const cell=timeout?choice.cells?.[0]:cmd.cell;need(cell&&choice.cells?.includes(cell)&&boardEmptyEntry(st,a,cell,[a]),'请选择合法岸边');
  s.queue.unshift(...p.relocate(s,a,cell!,false,false,false));return;
 }
 if(choice.kind==='board-path'){
  const option=cmd.option??(timeout?Object.keys(choice.options!)[0]:undefined);need(option!==undefined&&Object.hasOwn(choice.options!,option),'请选择一条合法路径');
  queuePath(st,a,choice.options![option!],(choice.data as {serial:number}).serial);return;
 }
 if(choice.kind==='board-tax'){
  const mode=(choice.data as {mode:'desert'|'lmm'|'tribute'}).mode;
  const ap=mode==='desert'&&(cmd.action==='ap'||timeout&&s.players[a].ap>0),card=cmd.card??(timeout?[...s.players[a].hand].sort()[0]??null:null);
  if(mode==='desert'){need(ap?s.players[a].ap>0:Boolean(card&&choice.cards?.includes(card)),'请选择1AP或一张手牌');}
  else need(card!==null&&choice.cards?.includes(card),'请选择一张上交牌');
  s.queue.unshift(...pay(st,a,choice.source!,mode,card,ap,p));return;
 }
 if(choice.kind==='board-guess'){
  const c=stack.currentCard(st),die=c.stage4!.guessDie!;
  need(timeout||Number.isInteger(cmd.guess)&&cmd.guess!>=1&&cmd.guess!<=6,'请选择1—6');
  p.emit(s,'dice',`卫汶找你：d6 = ${die}`,die);
  if(timeout||cmd.guess!==die)s.queue.unshift(task('board-teleport',{target:a,serial:c.serial}));return;
 }
 if(choice.kind==='board-cell'){
  if(cmd.cell){need(choice.cells?.includes(cmd.cell)&&boardEmptyEntry(st,choice.source!,cmd.cell,[choice.source!]),'传送落点不合法');s.queue.unshift(...p.relocate(s,choice.source!,cmd.cell,false));}return;
 }
 if(choice.kind==='board-return'){
  const cells=(choice.cells??[]).filter(cell=>boardEmptyEntry(st,a,cell,[a]));need(cells.length>0,'当前无合法返回格');
  const cell=timeout?cells[integer(s.random,cells.length)]:cmd.cell;need(cell&&cells.includes(cell),'请选择合法返回格');
  st.stage4.offMap[a]=false;const from=s.players[a].cell;
  const jobs=p.relocate(s,a,cell!,false);if(from===cell&&water(s,cell!,a)&&!native(s,a)&&s.players[a].hand.length)jobs.unshift({kind:'water',actor:a,data:{entry:true}});
  if(from===cell&&currentDesert(st,a))jobs.push(task('board-desert',{actor:a}));s.queue.unshift(...jobs);p.emit(s,'return',`S${a+1} 返回地图${cell}`);return;
 }
 throw Error('未知阶段四地图选择');
}
