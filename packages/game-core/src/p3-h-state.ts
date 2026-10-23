import {hasP3HRules} from '../../game-data/src/index';
import type {GameState,Task} from './types';
import type {HCooperation} from './p3-h-links';
import type {HRenState} from './p3-h-ren';
export const hEnabled=hasP3HRules;
export function hChoiceLabel(kind:string):string{return ({'h-equip-draw':'装备哥：成功安装后摸1','h-small':'小：跨过角色判定','h-birth':'世界是多元的：选择出生格','h-respect':'respect：选择驱逐落点','h-ren-retreat':'做自己喜欢的教育','h-ren-back':'教育：选择后退方向','h-ren-expel':'厌蠢：选择移出地区','h-ren-gear':'化学金牌教练：选择装备替换','h-cooperate':'南南合作：选择等量交换手牌','h-attract':'组织部部长','h-reroll':'狂叫','h-six':'6：免费摸牌','h-circle-pay':'画圆：支付1AP越界'} as Record<string,string>)[kind]??kind;}
export interface P3HState {
 frozenBy:(number|null)[];freezeReadyAt:number[];
 lowest:boolean[];pendingTurns:number[];extraReturn:{cursor:number;queue:Task[]}|null;
 rerollRoots:Record<string,boolean>;
 circles:{id:string;actor:number;regions:string[]}[];circleUsed:boolean[];circlePermissions:Record<string,boolean>;
 cooperation?:HCooperation;
 ren?:HRenState;
 birth?:(string|null)[];smallSeen?:Record<string,boolean>;
 sharedWatches?:Record<string,Record<number,{current:string|null;previous:string|null}>>;
}
export function initialHState():P3HState{return {frozenBy:[null,null,null,null],freezeReadyAt:[0,0,0,0],lowest:[false,false,false,false],pendingTurns:[],extraReturn:null,rerollRoots:{},circles:[],circleUsed:[false,false,false,false],circlePermissions:{}};}
export function hState(s:GameState):P3HState{if(!s.stage3?.h)throw Error('H批状态缺失');return s.stage3.h;}
/** Observe actual HP transitions, including healing and deaths of other roles. */
export function hObserveHp(s:GameState,initial=false){
 if(!hEnabled(s.version))return;const h=hState(s),living=s.players.filter(q=>q.hp>0),min=Math.min(...living.map(q=>q.hp));
 for(const q of s.players){const low=q.hp>0&&q.hp===min;if(!initial&&q.character==='character-015'&&low&&!h.lowest[q.seat]&&q.seat!==s.active&&!h.pendingTurns.includes(q.seat))h.pendingTurns.push(q.seat);h.lowest[q.seat]=low;}
}
