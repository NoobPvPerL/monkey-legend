import {hActiveAllowed} from './p3-h-active';
import {gNow} from './p3-g-dice';
import {gLogical} from './p3-g-cards';
import {gBeginPair} from './p3-g-equipment';
import type {GLogicalCard} from './p3-g-cards';
import {fCastHeal} from './p3-f';
import type {GameState} from './types';
import {cMarkCard} from './p3-c';
import {discardCards} from './exercise';
import {hasPlaytestRules,runtimeForVersion} from '../../game-data/src/index';
import type {EquipmentSource,ResourceState} from './stage3-resources';
import type {Direction} from './stage3-roles';
export interface PendingCard {
 g?:GLogicalCard;
 gSubmitted?:boolean;gCounterOffered?:boolean;
 fTargetsDone?:boolean;
 cFood?:boolean;
 serial:number;actor:number;card:string;definition:string;targets:number[];effect:EquipmentSource;
 cancelled:number[];elbows:number[];countered:boolean;counter:{actor:number;deadline:number}|null;
 responseTo:number|null;responseActor:number|null;
 converted?:boolean;pushDirection?:Direction;replacement?:string;installed?:boolean;
 pursuits?:number[];
 stage4?:{x?:number;dodge?:boolean;counter?:'tactic'|'jianmin'|'food';counterEffective?:boolean;counterOffered?:boolean;
 region?:string;guessDie?:number;officeExempt?:number[];take?:'hand'|'equipment';item?:string;copy?:string;interrupt?:boolean;resumePhase?:'moving'|'action';finishBoundary?:'next'|'round-next';cardTeam?:string};
}
export interface CardStack {serial:number;stack:PendingCard[]}
export interface CardStackState extends ResourceState {cardStack:CardStack;resolving:string[]}
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
export const initialCardStack=():CardStack=>({serial:0,stack:[]});
export function currentCard(s:CardStackState):PendingCard {const card=s.cardStack.stack.at(-1);need(card,'没有待结算卡牌');return card!;}
export function beginCard(s:CardStackState,actor:number,card:string,definition:string,targets:number[],effect:EquipmentSource,at:number,responseTo:number|null=null,logicalCopy:1|2=1):PendingCard {
 at=gNow(s as unknown as GameState,at);
 need(Number.isFinite(at)&&at>=0,'卡牌窗口时钟无效');need(s.resolving.includes(card)&&!s.cardStack.stack.some(c=>c.card===card),'待结算实体牌无效');
 if(responseTo!==null)need(currentCard(s).serial===responseTo&&!currentCard(s).counter,'父牌尚不可响应');
 const easy=s.players.find(p=>p.hp>0&&p.character==='character-002'&&p.ap>=1&&hActiveAllowed(s,p.seat));
 cMarkCard(s,actor);
 const g=gLogical(s,actor,targets,logicalCopy);if(g&&runtimeForVersion(s.version!).cards[definition as keyof ReturnType<typeof runtimeForVersion>['cards']].type==='equipment')gBeginPair(s,card);const pending:PendingCard={...(g?{g}:{}),serial:++s.cardStack.serial,actor,card,definition,targets:[...targets],effect:structuredClone(effect),cancelled:[],elbows:[],countered:false,counter:easy?{actor:easy.seat,deadline:at+(hasPlaytestRules(s.version)?30000:10000)}:null,responseTo,responseActor:responseTo===null?null:actor};s.cardStack.stack.push(pending);fCastHeal(s as unknown as GameState,actor,definition);return pending;
}
export function counterCard(s:CardStackState,actor:number,accept:boolean,at:number,roll:()=>number):{attempted:boolean;roll:number|null;cancelled:boolean;done:boolean}{
 const pending=currentCard(s),window=pending.counter;need(window&&window.actor===actor,'不是当前反制者');
 need(at<=window!.deadline,'反制窗口已过期');
 if(!accept||at===window!.deadline||!hActiveAllowed(s,actor)){pending.counter=null;return {attempted:false,roll:null,cancelled:false,done:true};}
 const p=s.players[actor];need(p.hp>0&&p.character==='character-002'&&p.ap>=1,'反制费用不足');
 const die=roll();need(Number.isInteger(die)&&die>=1&&die<=6,'反制骰子无效');p.ap--;
 pending.countered=die>=3;if(pending.countered||p.ap===0)pending.counter=null;
 return {attempted:true,roll:die,cancelled:pending.countered,done:pending.counter===null};
}
export function closePending(s:CardStackState):PendingCard {
 const pending=currentCard(s);need(!pending.counter,'反制尚未结束');
 if(pending.responseTo!==null){
  const parent=s.cardStack.stack.at(-2);need(parent?.serial===pending.responseTo,'响应父牌已过期');
  if(!pending.countered){if(pending.stage4?.counter){if(pending.stage4.counterEffective)parent!.countered=true;}else{const a=pending.responseActor!;if(!parent!.cancelled.includes(a))parent!.cancelled.push(a);if(pending.definition==='basic-002')parent!.elbows.push(a);}}
 }
 s.cardStack.stack.pop();if(pending.g?.copy!==1){s.resolving=s.resolving.filter(c=>c!==pending.card);discardCards(s,[pending.card]);}return pending;
}
