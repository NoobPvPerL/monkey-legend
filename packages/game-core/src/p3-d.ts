import {hSmall} from './p3-h-occupancy';
import {hasP3DRules} from '../../game-data/src/index';
import {roleEffectAllowed} from './character-effects';
import {gainAp,canEnterWithMount} from './stage3-resources';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import {onBoard,boardEmptyEntry} from './stage4-board';
import {nextInDirection} from './stage3-roles';
import {discardCards} from './exercise';
export interface P3DState {clanUsed:boolean[]}
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export function dTurnStart(s:ResourceState,a:number){if(hasP3DRules(s.version)){s.stage3.d??={clanUsed:[false,false,false,false]};s.stage3.d.clanUsed[a]=false;}}
const emit=(s:GameState,text:string)=>s.events.push({seq:++s.eventSerial,type:'skill',text});
export function clanTargets(s:GameState,a:number,active:boolean){return s.order.filter(t=>onBoard(s,t)&&!(s.players[t].character==='character-027'&&s.players[t].hand.length===1)&&(active&&t===a||s.mode==='team'&&t!==a&&s.players[t].team===s.players[a].team)&&roleEffectAllowed({origin:active?'role-active':'role-locked',actor:a,roleModifiers:[]},s.players[t]));}
/** Call only at an actual voluntary payment, never at AP loss/transfer sites. */
export function dPaid(s:GameState,a:number,before:number,amount:number){
 if(!hasP3DRules(s.version)||s.players[a].character!=='character-053'||amount<=0||before<=0||s.players[a].ap!==0||!onBoard(s,a))return;
 for(const t of clanTargets(s,a,false))gainAp(s as GameState&ResourceState,t,2);
 emit(s,`S${a+1} 乞讨：其他存活队友各获得2AP`);
}
export function dPay(s:GameState,a:number,amount:number){const before=s.players[a].ap;s.players[a].ap-=amount;dPaid(s,a,before,amount);}
export function dEffect(s:ResourceState,a:number,card:string,effect:EquipmentSource):EquipmentSource {
 return hasP3DRules(s.version)&&s.players[a].character==='character-029'&&card.split('#')[0]==='basic-009'?{...effect,roleModifiers:[...effect.roleModifiers,{actor:a,kind:'target'}]}:effect;
}
export function dBallAllowed(s:GameState,a:number,t:number,converted=false){return !hSmall(s,t)&&(!hasP3DRules(s.version)||s.players[t].character!=='character-029'&&roleEffectAllowed({origin:converted?'role-active':'card',actor:a,roleModifiers:s.players[a].character==='character-029'?[{actor:a,kind:'target'}]:[]},s.players[t]));}
export function dInjuryTasks(s:GameState,hits:{target:number;source:number|null;loss:number}[]):Task[]{
 if(!hasP3DRules(s.version))return [];const jobs:Task[]=[];
 for(const a of s.order){if(!onBoard(s,a))continue;
  for(const h of hits){if(h.loss<=0)continue;
   if(s.players[a].character==='character-020'&&s.mode==='team'&&a!==h.target&&s.players[a].team===s.players[h.target].team)jobs.push(task('encourage',{actor:a,data:{source:h.source}}));
   if(s.players[a].character==='character-029'&&a===h.target)jobs.push(task('nailong-shake',{actor:a}));
  }
 }return jobs;
}
export function dTask(s:GameState,t:Task,now:number,p:Stage3Ports){
 if(!hasP3DRules(s.version))return false;const a=t.actor??s.active;
 if(t.action==='encourage'){if(onBoard(s,a))p.select(s,'encourage',a,now,{data:t.data});return true;}
 if(t.action==='encourage-discard'){const source=(t.data as {source:number}).source;if(onBoard(s,source)&&s.players[source].hand.length&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[source]))p.select(s,'encourage-discard',source,now,{source:a,count:Math.min(2,s.players[source].hand.length),cards:[...s.players[source].hand]});return true;}
 if(t.action==='nailong-shake'){
  if(onBoard(s,a)){const roll=p.die(s,'摇',a),direction=({1:'left',2:'right',3:'up',4:'down'} as const)[roll as 1|2|3|4];if(direction){const to=nextInDirection(s.players[a].cell,direction);if(to&&boardEmptyEntry(s as GameState&ResourceState,a,to,[a])&&canEnterWithMount(s as GameState&ResourceState,a,to))s.queue.unshift(...p.relocate(s,a,to,false));}}return true;
 }return false;
}
export function dChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean){
 const c=s.choice!,a=c.actor;
 if(c.kind==='encourage'){
  if(!timeout&&cmd.accept&&onBoard(s,a)){if(p.die(s,'鼓励队友',a)%2)p.draw(s,a,2);else{const source=(c.data as {source:number|null}).source;if(source!==null)s.queue.unshift(task('encourage-discard',{actor:a,data:{source}}));}}return;
 }
 const cards=timeout?[...s.players[a].hand].sort().slice(0,c.count):cmd.cards??[];
 need(cards.length===c.count&&new Set(cards).size===cards.length&&cards.every(card=>c.cards?.includes(card)&&s.players[a].hand.includes(card)),'鼓励队友弃牌不合法');
 s.players[a].hand=s.players[a].hand.filter(card=>!cards.includes(card));discardCards(s,cards);p.emit(s,'discard',`S${a+1} 鼓励队友弃置${cards.length}张`);
}
export function dClan(s:GameState,a:number){
 need(hasP3DRules(s.version)&&s.players[a].character==='character-053'&&onBoard(s,a)&&!s.stage3!.d!.clanUsed[a]&&s.players[a].hand.length>0,'鸡犬升天当前不可发动');
 s.stage3!.d!.clanUsed[a]=true;const cards=[...s.players[a].hand];s.players[a].hand=[];discardCards(s,cards);
 for(const t of clanTargets(s,a,true))gainAp(s as GameState&ResourceState,t,2);emit(s,`S${a+1} 鸡犬升天：弃置全部${cards.length}张手牌，存活队友含自己各获得2AP`);
}
