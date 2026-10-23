import {hActiveAllowed} from './p3-h-active';
import {hEnabled,hState} from './p3-h-state';
import {onBoard} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import {dPay} from './p3-d';
import type {GameState,Task} from './types';
import type {Stage3Ports} from './stage3-engine';
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
export function hFreezeTargets(s:GameState,a:number){return !hEnabled(s.version)||!hActiveAllowed(s,a)||!onBoard(s,a)||s.players[a].character!=='character-039'?[]:s.order.filter(t=>t!==a&&onBoard(s,t)&&hState(s).frozenBy[t]===null&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[t]));}
export function hFreezeAction(s:GameState,a:number){const targets=hFreezeTargets(s,a),remaining=hEnabled(s.version)?Math.max(0,hState(s).freezeReadyAt[a]-s.stage3!.starts[a]):0;return {available:s.phase==='action'&&!s.choice&&s.active===a&&s.players[a].ap>=2&&remaining===0&&targets.length>0,remaining,targets};}
export function hFreeze(s:GameState,a:number,target:number,p:Stage3Ports){
 need(hEnabled(s.version)&&hFreezeAction(s,a).available&&hFreezeTargets(s,a).includes(target),'冰封之力次数、角色或目标不合法');dPay(s,a,2);hState(s).freezeReadyAt[a]=s.stage3!.starts[a]+2;hState(s).frozenBy[target]=a;p.emit(s,'skill',`S${a+1} 冰封之力支付2AP，S${target+1}下次个人回合跳过自由行动`);
}
/** Consume at action entry, after normal mandatory start/draw and before free play. */
export function hSkipAction(s:GameState,a:number,p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||hState(s).frozenBy[a]===null)return false;hState(s).frozenBy[a]=null;p.emit(s,'skill',`S${a+1} 冰封之力：跳过本次自由行动，继续个人结束结算`);return true;
}
/** Insert an extra personal turn without changing the round or normal cursor. */
export function hTakeExtra(s:GameState,continuation:Task[],p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||hState(s).extraReturn)return false;const h=hState(s);let a:number|undefined;
 while(h.pendingTurns.length){const candidate=h.pendingTurns.shift()!;if(s.players[candidate].hp>0){a=candidate;break;}}
 if(a===undefined)return false;h.extraReturn={cursor:s.cursor,queue:structuredClone(continuation)};s.queue=[{kind:'turn-start',actor:a}];p.emit(s,'skill',`S${a+1} 拖动进度条：插入个人回合，整轮不变`);return true;
}
export function hReturnExtra(s:GameState,p:Stage3Ports):boolean{
 if(!hEnabled(s.version)||!hState(s).extraReturn)return false;const saved=hState(s).extraReturn!;hState(s).extraReturn=null;s.cursor=saved.cursor;s.queue=structuredClone(saved.queue);hTakeExtra(s,s.queue,p);return true;
}
export function hShouldYield(s:GameState):boolean{return hEnabled(s.version)&&!s.choice&&!s.queue.length&&!s.movement&&!s.cardStack?.stack.length&&s.stage4!.interruptTurn===null&&hState(s).pendingTurns.some(a=>s.players[a].hp>0&&a!==s.active)&&!hState(s).extraReturn;}
