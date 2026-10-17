import type {GameState,Command,Task} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {ResourceState} from './stage3-resources';
import * as resources from './stage3-resources';
import * as stack from './stage3-card-stack';
import {onBoard} from './stage4-board';
import {terrainCard} from './stage4-terrain';
import {locationCardAllowed} from './locations';
type State=GameState&ResourceState&stack.CardStackState&{stage4:NonNullable<GameState['stage4']>};
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
const task=(action:string,serial:number):Task=>({kind:'stage3',action,serial});
/** Reserve one physical entity and fee atomically; never interrupt a child chain. */
export function reserveStage4Interrupt(s:GameState,cmd:Extract<Command,{type:'play'}>,p:Stage3Ports){
 const st=s as State,a=cmd.actor,user=s.players[a];
 need(cmd.card.split('#')[0]==='basic-017'&&user.hand.includes(cmd.card)&&onBoard(st,a),'当前不能提交插队意图');
 need(cmd.targets.length===0&&cmd.as===undefined,'插队不接受目标或转换');
 need(user.character!=='character-005','QB不能使用建民牌');
 need(s.active!==a||!st.stage3.breadBlocked[a],'本个人回合不能主动出牌');
 need(terrainCard(s,a,'basic-017'),'当前位置禁止使用插队');
 const quoted=resources.cardApCost(st,a,cmd.card),reserve=s.active===a&&s.movement?.costDue&&s.movement.path.length>1?1:0;
 need(user.ap>=quoted.cost+reserve,'插队费用不足或须保留移动结算AP');
 user.ap-=quoted.cost;user.hand=user.hand.filter(card=>card!==cmd.card);s.resolving.push(cmd.card);
 st.stage4.interrupts.push({actor:a,card:cmd.card,effect:quoted.effect,team:user.team});
 p.emit(s,'interrupt-intent',`S${a+1} 提交插队意图，支付${quoted.cost}AP，等待当前效果链结束`,{actor:a,card:cmd.card});
}
export function beginStage4Interrupt(s:GameState,now:number,p:Stage3Ports):boolean {
 const st=s as State,boundary=s.queue.length===1&&['next','round-next'].includes(s.queue[0].kind)?s.queue[0].kind as 'next'|'round-next':undefined;
 if(st.stage4.interruptTurn!==null||s.choice||s.queue.length&&!boundary||st.cardStack.stack.length||!st.stage4.interrupts.length)return false;
 const intent=st.stage4.interrupts.shift()!;
 if(!onBoard(st,intent.actor)){
  s.resolving=s.resolving.filter(c=>c!==intent.card);s.discard.push(intent.card);p.emit(s,'interrupt-expired',`S${intent.actor+1} 已离场或淘汰，插队意图失效`);return true;
 }
 const resumePhase=s.movement?'moving':'action',pending=stack.beginCard(st,intent.actor,intent.card,'basic-017',[],intent.effect,now);
 pending.stage4={interrupt:true,resumePhase,cardTeam:intent.team,...(boundary?{finishBoundary:boundary}:{})};if(boundary)s.queue=[];s.phase='resolving';
 p.emit(s,'interrupt-start',`S${intent.actor+1} 插队进入反制窗口`);
 s.queue.push(task('counter',pending.serial),task('continue',pending.serial));return true;
}
export function stage4InterruptTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 const st=s as State,c=st.cardStack.stack.at(-1);
 if(!c||c.definition!=='basic-017'||t.serial!==undefined&&t.serial!==c.serial)return false;
 if(t.action==='effect'){
  const team=c.stage4!.cardTeam!,history=st.stage3.combos[team]??[];
  if(!history.includes('basic-017'))st.stage3.combos[team]=[...history,'basic-017'];
  st.stage4.interruptTurn=c.actor;p.emit(s,'interrupt',`S${c.actor+1} 插队成功，结束当前个人回合后开启新整轮`);
  s.queue.unshift(task('cleanup',c.serial));return true;
 }
 if(t.action==='cleanup'){
  const closed=stack.closePending(st);s.attack=null;
  if(p.finish(s,false,now))return true;
  const boundary=closed.stage4!.finishBoundary;
  if(boundary){
   s.phase='resolving';if(!closed.countered&&boundary==='round-next')st.stage4.interruptSkipEnd=true;
   s.queue.unshift({kind:closed.countered?boundary:'next'});
  }else if(closed.countered){
   if(s.players[s.active].hp<=0){s.phase='resolving';s.queue.unshift({kind:'next'});}
   else{s.phase=closed.stage4!.resumePhase!;if(s.clock.since===null)s.clock.since=now;}
  }else{need(p.endTurn,'缺少插队结束回合端口');s.phase='resolving';p.endTurn!(s,now);}
  return true;
 }
 return false;
}
export function discardStage4Interrupts(s:GameState):void {
 const r=s.stage4!;
 for(const intent of r.interrupts){s.resolving=s.resolving.filter(c=>c!==intent.card);s.discard.push(intent.card);}
 r.interrupts=[];r.interruptTurn=null;
}
