import {onBoard} from './stage4-board';
import type {GameState,Command,Task} from './types';
import type {Stage3Ports} from './stage3-engine';
import {stage3Task} from './stage3-engine';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import * as stack from './stage3-card-stack';
import {STAGE4_CARDS} from '../../game-data/src/stage4';
import type {Stage4CardId} from '../../game-data/src/stage4';
import {stage4FeePlan} from './stage4-costs';
import {terrainCard} from './stage4-terrain';
import {locationCardAllowed} from './locations';
type State=GameState&resources.ResourceState&stack.CardStackState&{stage4:NonNullable<GameState['stage4']>};
const state=(s:GameState)=>s as State;
const id=(card:string)=>card.split('#')[0] as Stage4CardId;
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export function stage4CounterCards(s:GameState,a:number,c:stack.PendingCard):string[]{
 const st=state(s),target=STAGE4_CARDS[c.definition as Stage4CardId];
 if(!target||!onBoard(st,a))return [];
 return st.players[a].hand.filter(card=>{
  const d=STAGE4_CARDS[id(card)];
  if(!(d.id==='basic-027'&&target.type==='tactic'||d.id==='basic-028'&&target.tags.includes('建民')||d.id==='basic-038'&&target.type==='food'))return false;
  if(!terrainCard(s,a,d.id))return false;
  const quote=st.stage4.costs.locks[card];
  if(['die','tiers'].includes(d.cost.kind)&&quote?.turn!==st.stage3.turn)return true;
  const cost=resources.cardApCost(st,a,card,quote?.cost).cost;return cost<=st.players[a].ap;
 });
}
export function stage4CounterTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 const st=state(s),c=st.cardStack.stack.at(-1);
 if(!c||t.serial!==undefined&&t.serial!==c.serial)return false;
 if(t.action==='continue'){
  if(c.countered||c.responseTo!==null&&!c.stage4?.counter)return false;
  const eligible=s.order.filter(a=>stage4CounterCards(s,a,c).length);
  if(eligible.length){c.stage4={...c.stage4,counterOffered:true};s.queue.unshift(...eligible.map(actor=>task('stage4-counter-window',{actor,serial:c.serial})),task('stage4-counter-resume',{serial:c.serial}));return true;}
  if(c.stage4?.counter){s.queue.unshift(task('stage4-counter-effect',{serial:c.serial}),task('cleanup',{serial:c.serial}));return true;}
  return false;
 }
 if(t.action==='stage4-counter-window'){
  if(!c.countered){const a=t.actor!,cards=stage4CounterCards(s,a,c);if(cards.length)p.select(s,'card-counter',a,now,{cards,data:{serial:c.serial}});}return true;
 }
 if(t.action==='stage4-counter-resume'){
  if(c.stage4?.counter&&!c.countered)s.queue.unshift(task('stage4-counter-effect',{serial:c.serial}),task('cleanup',{serial:c.serial}));
  else stage3Task(s,task('continue',{serial:c.serial}),now,p);return true;
 }
 if(t.action==='stage4-counter-effect'){
  const parent=st.cardStack.stack.at(-2);need(parent&&parent.serial===c.responseTo,'反制父牌已过期');
  if(!c.countered&&roles.cardEffectAllowed(st,parent!.actor,c.definition,c.effect)){
   c.stage4={...c.stage4,counterEffective:true};
   if(c.definition==='basic-028')s.queue.unshift(...p.damage(s,[{target:parent!.actor,amount:1,source:c.actor,category:'response'}]));
   if(c.definition==='basic-038')p.heal(s,c.actor,1,true);
   p.emit(s,'counter',`S${c.actor+1} ${STAGE4_CARDS[c.definition as Stage4CardId].name}抵消${STAGE4_CARDS[parent!.definition as Stage4CardId].name}`);
  }return true;
 }
 if(t.action==='stage4-deliver'){
  const a=t.actor!;if(!onBoard(st,a))return true;
  const def=c.definition,cards=st.players[a].hand.filter(card=>def==='basic-011'?STAGE4_CARDS[id(card)].type==='attack':STAGE4_CARDS[id(card)].tags.includes(def==='basic-012'?'外星':'普通'));
  if(cards.length)p.select(s,'forced-card',a,now,{cards,source:c.actor,data:{serial:c.serial}});
  else s.queue.unshift(...p.damage(s,[{target:a,amount:1,source:c.actor,category:'attack',directHp:true}]));return true;
 }
 return false;
}
export function stage4CounterChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):void {
 const st=state(s),choice=s.choice!,a=choice.actor;
 if(choice.kind==='forced-card'){
  if(cmd.card){need(choice.cards?.includes(cmd.card)&&st.players[a].hand.includes(cmd.card),'必须交出符合要求的手牌');st.players[a].hand=st.players[a].hand.filter(c=>c!==cmd.card);s.discard.push(cmd.card);p.emit(s,'deliver',`S${a+1} 交出1张牌（不发动牌效）`);}
  else s.queue.unshift(...p.damage(s,[{target:a,amount:1,source:choice.source!,category:'attack',directHp:true}]));return;
 }
 need(choice.kind==='card-counter','不是卡牌反制窗口');
 if(!cmd.card||timeout)return;
 const parent=stack.currentCard(st);need(stage4CounterCards(s,a,parent).includes(cmd.card),'此牌不能反制当前效果');
 const def=STAGE4_CARDS[id(cmd.card)],quote=st.stage4.costs.locks[cmd.card];
 if(['die','tiers'].includes(def.cost.kind))need(quote?.turn===st.stage3.turn,'请先锁定响应牌费用');
 const quoted=resources.cardApCost(st,a,cmd.card,quote?.cost),fee=stage4FeePlan(st.players[a].ap,quoted.cost);
 st.players[a].ap-=fee.spend;if(fee.gain)resources.gainAp(st,a,fee.gain);
 st.players[a].hand=st.players[a].hand.filter(c=>c!==cmd.card);s.resolving.push(cmd.card);
 const child=stack.beginCard(st,a,cmd.card,def.id,[parent.actor],quoted.effect,now,parent.serial);
 child.stage4={counter:def.id==='basic-027'?'tactic':def.id==='basic-028'?'jianmin':'food'};
 s.queue.unshift(task('counter',{serial:child.serial}),task('continue',{serial:child.serial}));
 p.emit(s,'response',`S${a+1} 使用${def.name}，支付${fee.spend}AP${fee.gain?'，获得'+fee.gain+'AP':''}`);
}
