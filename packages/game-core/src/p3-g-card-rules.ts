import {hActiveAllowed} from './p3-h-active';
import {runtimeForVersion} from '../../game-data/src/index';
import {gEnabled,gState} from './p3-g-state';
import {onBoard} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import {discardCards} from './exercise';
import {dPay} from './p3-d';
import {integer} from './random';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {PendingCard} from './stage3-card-stack';
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
export function gWhiteEyeTargets(s:GameState,a:number):number[]{return s.order.filter(t=>t!==a&&onBoard(s,t)&&s.players[t].hand.length&&(s.mode==='ffa'||s.players[t].team!==s.players[a].team)&&roleEffectAllowed({origin:'role-locked',actor:a,roleModifiers:[]},s.players[t]));}
export function gSubmissionTasks(s:GameState,c:PendingCard):Task[]{
 if(!gEnabled(s.version))return [];const data=runtimeForVersion(s.version),tags=data.cardTags[c.definition]??[],food=data.cards[c.definition as keyof typeof data.cards].type==='food';
 return s.order.filter(a=>onBoard(s,a)).flatMap(a=>s.players[a].character==='character-022'&&tags.includes('建民')?[task('g-jianmin',{actor:a,serial:c.serial})]:s.players[a].character==='character-049'&&a!==c.actor&&food?[task('g-store-discard',{actor:a,serial:c.serial})]:[]);
}
export function gCounterActor(s:GameState,c:PendingCard):number|undefined {
 return s.order.find(a=>a!==c.actor&&hActiveAllowed(s,a)&&onBoard(s,a)&&s.players[a].character==='character-009'&&!gState(s).counterUsed[a]&&s.players[a].ap>=1&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[c.actor]));
}
/** Runs before the existing easy/task handlers. Submission triggers precede
 * easy; the optional DaHuanShen attempt follows easy and precedes card counters. */
export function gCardTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!gEnabled(s.version))return false;
 if(t.action==='g-white-eye'){const a=t.actor!,targets=gWhiteEyeTargets(s,a);if(onBoard(s,a)&&s.players[a].character==='character-009'&&targets.length)p.select(s,'g-white-eye',a,now,{targets,count:Math.min(2,targets.length)});return true;}
 const c=s.cardStack!.stack.at(-1);
 if(!c||t.serial!==undefined&&c.serial!==t.serial)return false;
 const a=t.actor??c.actor;
 if(t.action==='counter'&&!c.gSubmitted){c.gSubmitted=true;const jobs=gSubmissionTasks(s,c);if(jobs.length){s.queue.unshift(...jobs,task('g-submit-resume',{serial:c.serial}));return true;}return false;}
 if(t.action==='g-jianmin'){if(onBoard(s,a))p.draw(s,a,1);return true;}
 if(t.action==='g-store-discard'){if(onBoard(s,a)&&s.players[a].hand.length)p.select(s,'g-discard',a,now,{count:1,cards:[...s.players[a].hand],data:{serial:c.serial}});return true;}
 if(t.action==='g-submit-resume'){if(c.counter)c.counter.deadline=now+30000;s.queue.unshift(task('counter',{serial:c.serial}));return true;}
 if(t.action==='continue'&&!c.countered&&!c.gCounterOffered){
  c.gCounterOffered=true;const counter=gCounterActor(s,c);if(counter!==undefined){s.queue.unshift(task('continue',{serial:c.serial}));p.select(s,'g-counter',counter,now,{source:c.actor,data:{serial:c.serial}});return true;}
 }
 return false;
}
export function gCardChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean {
 if(!gEnabled(s.version))return false;const choice=s.choice!,a=choice.actor;
 if(choice.kind==='g-white-eye'){
  const legal=gWhiteEyeTargets(s,a),targets=timeout?legal.slice(0,2):cmd.targets??[];need(targets.length<=2&&new Set(targets).size===targets.length&&targets.every(t=>legal.includes(t)),'白眼最多选择两名不同合法对手');
  for(const target of targets){const hand=s.players[target].hand,card=hand.splice(integer(s.random,hand.length),1)[0];s.players[a].hand.push(card);p.emit(s,'transfer',`S${a+1} 白眼从S${target+1} 随机拿1张`);}return true;
 }
 if(choice.kind==='g-discard'){
  const cards=timeout?[...s.players[a].hand].sort().slice(0,choice.count):cmd.cards??[];need(cards.length===choice.count&&new Set(cards).size===cards.length&&cards.every(card=>s.players[a].hand.includes(card)),'店长请选择准确数量的不同手牌弃置');s.players[a].hand=s.players[a].hand.filter(card=>!cards.includes(card));discardCards(s,cards);p.emit(s,'discard',`S${a+1} 店长弃${cards.length}张牌`);return true;
 }
 if(choice.kind!=='g-counter')return false;
 if(!timeout&&cmd.accept){const c=s.cardStack!.stack.at(-1);need(c&&c.serial===(choice.data as {serial:number}).serial&&gCounterActor(s,c)===a,'好奇怪哦次数或目标已失效');dPay(s,a,1);gState(s).counterUsed[a]=true;const roll=p.die(s,'好奇怪哦',a);if(roll<=3)c!.countered=true;p.emit(s,'skill',`S${a+1} 好奇怪哦支付1AP，${roll<=3?'本份逻辑牌失效':'判定失败'}`);}
 return true;
}
