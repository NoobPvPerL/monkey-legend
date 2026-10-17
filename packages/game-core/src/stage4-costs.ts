import {STAGE4_CARDS,costForStage4Die} from '../../game-data/src/stage4';
import type {Stage4CardId} from '../../game-data/src/stage4';

export interface Stage4CostLock {turn:number;die:number;cost:number}
export interface Stage4Costs {turn:number;locks:Record<string,Stage4CostLock>}
export interface Stage4Quote {cost:number;die:number|null;cached:boolean}
const need=(value:unknown,message:string):void=>{if(!value)throw Error(message);};
export const initialStage4Costs=():Stage4Costs=>({turn:0,locks:{}});
function definition(card:string){
 need(typeof card==='string'&&/^basic-\d{3}#\d{2,}$/.test(card),'实体牌格式无效');
 const id=card.split('#')[0];need(Object.hasOwn(STAGE4_CARDS,id),'卡牌不在阶段四目录');
 return STAGE4_CARDS[id as Stage4CardId];
}
function validLedger(s:Stage4Costs){need(Number.isSafeInteger(s.turn)&&s.turn>=0&&s.locks&&typeof s.locks==='object'&&!Array.isArray(s.locks),'费用账本无效');}
/** Call only with server-owned hand and ledger. Never mutate AP or reset clocks here. */
export function quoteStage4Cost(s:Stage4Costs,actor:number,card:string,hand:readonly string[],roll:()=>number,x?:number):Stage4Quote {
 validLedger(s);need(Number.isInteger(actor)&&actor>=0&&actor<4,'费用玩家无效');
 const def=definition(card);need(hand.includes(card),'手中没有该实体牌');
 if(def.cost.kind==='variable'){need(Number.isSafeInteger(x)&&x!>=1,'X必须为正整数');return {cost:x!,die:null,cached:false};}
 need(x===undefined,'此牌不接受X');
 if(def.cost.kind==='fixed')return {cost:def.cost.value,die:null,cached:false};
 const old=s.locks[card];
 if(old?.turn===s.turn){
  need(Number.isInteger(old.die)&&old.die>=1&&old.die<=6&&old.cost===costForStage4Die(def.cost,old.die),'锁定费用无效');
  return {cost:old.cost,die:old.die,cached:true};
 }
 const die=roll(),cost=costForStage4Die(def.cost,die);
 s.locks[card]={turn:s.turn,die,cost};return {cost,die,cached:false};
}
export function nextStage4CostTurn(s:Stage4Costs,turn:number):void {
 validLedger(s);need(Number.isSafeInteger(turn)&&turn>s.turn,'个人回合编号必须递增');s.turn=turn;s.locks={};
}
/** Gain must pass through the ordinary AP-gain/siphon path at integration. */
export function stage4FeePlan(ap:number,quoted:number,positiveFree=false,variable=false):{cost:number;spend:number;gain:number} {
 need(Number.isSafeInteger(ap)&&ap>=0&&Number.isSafeInteger(quoted),'AP与费用必须为整数');
 need(typeof positiveFree==='boolean'&&typeof variable==='boolean','费用修饰无效');
 if(variable)need(quoted>=1,'X必须为正整数');
 const cost=positiveFree&&!variable&&quoted>0?0:quoted;
 need(cost<=ap,'AP不足');return {cost,spend:Math.max(0,cost),gain:Math.max(0,-cost)};
}
