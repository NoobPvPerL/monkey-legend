import {hEquipmentWatchStart} from './p3-h-equipment';
import {gHakiTask} from './p3-g-haki';
import {gCubeTask,gCubeAttackBlocked} from './p3-g-cube';
import {gFoodTask} from './p3-g-food';
import {gObserverTask,gCardTargetAllowed} from './p3-g-observer';
import {gEnabled} from './p3-g-state';
import {gCardTask} from './p3-g-card-rules';
import {gSkillTask} from './p3-g-skills';
import {discardCards} from './exercise';
import {gPrimeQuote,gSecondPending} from './p3-g-cards';
import type {PendingCard} from './stage3-card-stack';
import {fUncapped,fRock} from './p3-f';
import {dPay} from './p3-d';
import {cMarkFood} from './p3-c';
import {northTargets} from './playtest';
import {hasPlaytestRules} from '../../game-data/src/index';
import {terrainCard,terrainEffect} from './stage4-terrain';
import {stage4MovementTask} from './stage4-movement';
import {stage4CombatTask} from './stage4-combat';
import {stage4EquipmentTask,validateStage4Equipment,validateStage4Steal} from './stage4-equipment';
import {stage4InterruptTask} from './stage4-interrupt';
import {onBoard,boardSingleProtected,expireBoardStatuses} from './stage4-board';
import {MAP_CARD_IDS,stage4MapEffect,stage4MapTask} from './stage4-map-engine';
import {STAGE4_CARDS} from '../../game-data/src/stage4';
import type {Stage4CardId} from '../../game-data/src/stage4';
import {runtimeForVersion,mapForVersion,neighboringForVersion} from '../../game-data/src/index';
import type {GameState,Command,Task} from './types';
import type {Stage3Ports} from './stage3-engine';
import {stage3Play,stage3AttackTargets} from './stage3-engine';
import {integer} from './random';
import {stage4CounterTask} from './stage4-counter';
import {changeStage4Faction} from './stage4-factions';
import {STAGE4_CAPABILITIES} from '../../game-data/src/stage4-progress';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import * as stack from './stage3-card-stack';
import {locationCardAllowed,locationEffectAllowed} from './locations';
import {quoteStage4Cost,nextStage4CostTurn,stage4FeePlan} from './stage4-costs';
type State=GameState&resources.ResourceState&stack.CardStackState&{stage4:NonNullable<GameState['stage4']>};
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
const id=(card:string)=>card.split('#')[0] as Stage4CardId;
const state=(s:GameState)=>{need(s.stage4,'阶段四状态缺失');return s as State;};
const basic=new Set(Object.keys(STAGE4_CAPABILITIES).filter(id=>STAGE4_CAPABILITIES[id as Stage4CardId]==='active'));
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export function stage4TurnStart(s:GameState,a:number){
 const st=state(s);nextStage4CostTurn(st.stage4.costs,st.stage3.turn);
 for(const card of st.stage3.equipment[a])if((st.stage4.copies[card]??card.split('#')[0])==='basic-060'){const prior=st.stage4.watches[card];st.stage4.watches[card]={current:s.players[a].cell,previous:prior?.current??null,usedTurn:null};}
 hEquipmentWatchStart(s,a);st.stage4.gearMarks={};if(st.stage4.tongPending[a])st.stage4.tongBlocked[a]=st.stage4.tongPending[a];else delete st.stage4.tongBlocked[a];delete st.stage4.tongPending[a];
 st.stage4.drawBlocked[a]=st.stage4.downPending[a];st.stage4.downPending[a]=false;expireBoardStatuses(st,a);
}
export function stage4Quote(s:GameState,a:number,card:string,p:Stage3Ports){
 const st=state(s),def=STAGE4_CARDS[id(card)];need(def,'未知费用牌');
 const result=quoteStage4Cost(st.stage4.costs,a,card,st.players[a].hand,()=>gEnabled(s.version)?p.die(s,'随机费用',a):s.random.dice.length?s.random.dice.shift()!:integer(s.random,6)+1);
 if(result.die!==null)st.stage3.costLocks[card]={turn:st.stage3.turn,cost:result.cost};
 // Deliberately no public event with the private physical identity or price.
 return result;
}
export function stage4Targets(s:GameState,a:number,card:string):number[]{
 const user=s.players[a],def=STAGE4_CARDS[id(card)],map=mapForVersion(s.version).map;
 if(!def||!terrainCard(s,a,def.id))return [];
 if(def.type==='attack')return stage3AttackTargets(s,a,card);
 const faction=['basic-029','basic-030','basic-035','basic-036'].includes(def.id);
 return s.players.filter(q=>onBoard(s,q.seat)&&gCardTargetAllowed(s,a,q.seat,def.id)&&(faction||q.seat!==a)&&
  (def.id!=='basic-035'||s.stage4!.conversion[q.seat]==='monkey')&&(def.id!=='basic-036'||s.stage4!.conversion[q.seat]==='dimon')&&
  (def.id!=='basic-007'||s.mode==='ffa'||q.team!==user.team)&&
  (def.id!=='basic-018'||map[q.cell].region!=='云上学府')&&
  (def.id!=='basic-007'&&def.id!=='basic-019'||map[q.cell].region===map[user.cell].region||neighboringForVersion(s.version,map[q.cell].region,map[user.cell].region))).map(q=>q.seat);
}
export function stage4Play(s:GameState,cmd:Extract<Command,{type:'play'}>,now:number,p:Stage3Ports){
 const st=state(s),actor=cmd.actor,user=s.players[actor],def=STAGE4_CARDS[id(cmd.card)];
 need(def&&user.hand.includes(cmd.card),'手中没有该实体牌');
 need(!st.stage3.breadBlocked[actor],'本回合不能主动出牌');
 const tea=def.id==='basic-002'&&cmd.as===undefined&&st.stage4.tea[actor];
 need(!gCubeAttackBlocked(s,actor,tea||def.type==='attack'||cmd.as==='elbow'||cmd.as==='dodge'),'魔法有方1：本个人回合不能主动使用攻击牌');
 if(!cmd.as&&def.type==='equipment')validateStage4Equipment(s,cmd);
 if(def.inherited&&!tea||cmd.as==='elbow'||cmd.as==='dodge'){
  const free=!cmd.as&&st.stage4.exerciseFree[actor]&&['basic-003','basic-004','basic-005'].includes(def.id);
  // The existing helper applies role cost discounts; the card buff is a separate
  // approved card effect, so it must not acquire a foreign role lineage.
  if(free){
   stage3Play(s,cmd,now,p,{cost:0,effect:{origin:'card',actor,faction:user.faction,roleModifiers:st.stage4.buffSources[`${actor}:exerciseFree`]?.roleModifiers??[]}});st.stage4.exerciseFree[actor]=false;
  }else stage3Play(s,cmd,now,p);
  if((!cmd.as||cmd.as==='dodge')&&(def.id==='basic-009'||cmd.as==='dodge')&&st.stage4.dodge[actor]){const c=stack.currentCard(st);c.stage4={dodge:true};c.effect.roleModifiers=[...c.effect.roleModifiers,...(st.stage4.buffSources[`${actor}:dodge`]?.roleModifiers??[])];st.stage4.dodge[actor]=false;}
  const c=stack.currentCard(st);c.stage4={...(c.stage4??{}),officeExempt:s.players.filter(q=>!terrainEffect(s,q.seat,c.definition)).map(q=>q.seat)};
  return;
 }
 need(tea||basic.has(def.id)||def.type==='equipment','该牌的阶段四里程碑尚未接通');
 need(cmd.as===undefined,'转换请按牢大肘击流程');
 need(user.character!=='character-005'||!def.tags.includes('建民'),'QB不能使用建民牌');
 need(terrainCard(s,actor,def.id),'当前位置禁止使用此牌');
 need(new Set(cmd.targets).size===cmd.targets.length,'目标不能重复');
 let targets=[...cmd.targets];
 if(tea){need(targets.length===1&&s.players.some(q=>q.seat===targets[0]&&q.seat!==actor&&onBoard(s,q.seat)&&gCardTargetAllowed(s,actor,q.seat,'basic-002')&&!boardSingleProtected(s,actor,q.seat)&&mapForVersion(s.version).map[q.cell].region===mapForVersion(s.version).map[user.cell].region),'冰红茶肘击须指定同地区其他角色');
  const cells=roles.elbowPushCells({...st,farmClosed:s.classic!.farmClosed},actor,targets[0]);
  need(!cells.length||cmd.direction!==undefined&&cells.includes(roles.nextInDirection(s.players[targets[0]].cell,cmd.direction)??''),'请先指定合法撞飞方向');
 }else if(['basic-007','basic-018','basic-019','basic-022','basic-029','basic-030','basic-035','basic-036','basic-021','basic-024'].includes(def.id))need(targets.length===1&&stage4Targets(s,actor,cmd.card).includes(targets[0]),'目标不合法');
 else{need(targets.length===0,'此牌不接受外部目标');targets=['basic-011','basic-012','basic-014','basic-013','basic-031','basic-026'].includes(def.id)?s.players.filter(q=>onBoard(s,q.seat)&&(!['basic-013','basic-031','basic-026',...(hasPlaytestRules(s.version)?['basic-012','basic-014']:[])].includes(def.id)||q.seat!==actor)&&(def.id!=='basic-026'||s.mode==='ffa'||q.team!==user.team)&&!(q.character==='character-027'&&q.hand.length===1)).map(q=>q.seat):def.id==='basic-040'?s.players.filter(q=>q.hp>0&&q.faction==='帝汶家族').map(q=>q.seat):[actor];}
 targets=northTargets(st,targets,cmd.northGroup,!tea&&!['basic-007','basic-018','basic-019','basic-022','basic-029','basic-030','basic-035','basic-036','basic-021','basic-024'].includes(def.id));
 if(def.id==='basic-024')validateStage4Steal(s,cmd);
 if(['basic-023','basic-032','basic-033'].includes(def.id))need(typeof cmd.region==='string'&&Object.hasOwn(mapForVersion(s.version).regions,cmd.region),'请选择合法地区');
 const isX=def.cost.kind==='variable';
 const raw=tea?0:isX?quoteStage4Cost(st.stage4.costs,actor,cmd.card,user.hand,()=>{throw Error('X不掷骰');},cmd.x).cost:
  def.cost.kind==='fixed'?def.cost.value:st.stage4.costs.locks[cmd.card]?.cost;
 need(raw!==undefined,'请先锁定随机费用');
 const quoted=gPrimeQuote(st,actor,tea?{cost:0,effect:{origin:'card' as const,actor,faction:user.faction,roleModifiers:[...(st.stage4.buffSources[`${actor}:tea`]?.roleModifiers??[]),...(user.character==='character-023'?[{actor,kind:'other' as const}]:[])]}}:isX?
  {cost:raw!,effect:{origin:'card' as const,actor,faction:user.faction,roleModifiers:[]}}:resources.cardApCost(st,actor,cmd.card,raw));
 const fee=stage4FeePlan(user.ap,quoted.cost,false,isX),exposed=roles.withExposedJj(st,actor,cmd.card,targets,resources.attackEquipmentEffect(st,actor,cmd.card,quoted.effect));
 northTargets(st,exposed.targets);
 dPay(s,actor,fee.spend);if(fee.gain)resources.gainAp(st,actor,fee.gain);
 user.hand.splice(user.hand.indexOf(cmd.card),1);s.resolving.push(cmd.card);s.clock={remaining:60000,since:now};
 const pending=stack.beginCard(st,actor,cmd.card,def.id,exposed.targets,exposed.effect,now);
 pending.stage4={officeExempt:s.players.filter(q=>!terrainEffect(s,q.seat,def.id)).map(q=>q.seat),...(isX?{x:raw}:{}),...(cmd.region?{region:cmd.region}:{})};if(cmd.replacement)pending.replacement=cmd.replacement;
 if(pending.g&&def.type==='equipment')pending.g.replacements=[...(cmd.replacements??(cmd.replacement?[cmd.replacement]:[]))];
 if(def.id==='basic-024'){pending.stage4.take=cmd.take;pending.stage4.item=cmd.item;}
 if(def.id==='basic-073'){pending.stage4.copy=cmd.copy!.split('#')[0];pending.effect.roleModifiers=[...pending.effect.roleModifiers,...st.stage3.equipmentSources[cmd.copy!].roleModifiers];}
 if(tea){pending.pushDirection=cmd.direction;st.stage4.tea[actor]=false;}
 if(def.type==='attack'||tea)user.attacks++;
 p.emit(s,'play',`S${actor+1} 使用${def.name}，支付${fee.spend}AP${fee.gain?'，获得'+fee.gain+'AP':''}`,{actor,card:cmd.card,targets:exposed.targets});
 s.phase='resolving';s.queue.unshift(task('counter',{serial:pending.serial}),task('continue',{serial:pending.serial}));
}
export function stage4Task(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(gHakiTask(s,t,now,p)||gCubeTask(s,t,now,p)||gFoodTask(s,t,now,p)||gObserverTask(s,t,now,p)||gSkillTask(s,t,now,p)||gCardTask(s,t,now,p))return true;
 if(t.action==='g-repeat-card'){
  const first=t.data as PendingCard,st=state(s),a=first.actor;
  const parent=st.cardStack.stack.at(-1);
  if(!onBoard(s,a)||first.responseTo!==null&&(parent?.serial!==first.responseTo||!gCardTargetAllowed(s,a,first.definition==='basic-001'?a:parent.actor,first.definition))){s.resolving=s.resolving.filter(c=>c!==first.card);discardCards(s,[first.card]);p.emit(s,'play',`S${a+1} 质数第二份失效：使用者或父牌已失效`);if(!st.cardStack.stack.length&&!p.finish(s,false,now)){if(s.players[s.active].hp>0)s.phase='action';else s.queue.unshift({kind:'next'});}return true;}
  const def=runtimeForVersion(s.version).cards[first.definition as import('../../game-data/src/index').CardId];
  const legal=(target:number)=>{
   if(first.definition==='basic-037')return resources.revivalCells(st,target,s.classic!.farmClosed).length>0;
   if(!onBoard(s,target)||!gCardTargetAllowed(s,a,target,first.definition))return false;
   if(first.responseTo!==null)return false;
   if(first.definition==='basic-002')return s.players[target].cell&&mapForVersion(s.version).map[s.players[target].cell].region===mapForVersion(s.version).map[s.players[a].cell].region&&!boardSingleProtected(s,a,target);
   if(def.type==='attack')return stage3AttackTargets(s,a,first.definition).includes(target);
   if(first.definition==='basic-016')return target!==a&&roles.mayVoluntarilyRelocate(st,a)&&roles.emptyEntry({...st,farmClosed:s.classic!.farmClosed},a,s.players[target].cell,[a,target])&&roles.emptyEntry({...st,farmClosed:s.classic!.farmClosed},target,s.players[a].cell,[a,target]);
   if(first.definition==='basic-041')return roles.assamTargets({...st,farmClosed:s.classic!.farmClosed},a).includes(target);
   if(first.definition==='basic-040')return s.players[target].faction==='帝汶家族';
   if(['basic-007','basic-018','basic-019','basic-022','basic-029','basic-030','basic-035','basic-036','basic-021','basic-024'].includes(first.definition))return stage4Targets(s,a,first.definition).includes(target);
   if(first.definition==='basic-026')return target!==a&&(s.mode==='ffa'||s.players[target].team!==s.players[a].team);
   return !(def.group&&s.players[target].character==='character-027'&&s.players[target].hand.length===1);
  };
  const c=gSecondPending(s,first,(targets,copy)=>stack.beginCard(st,a,first.card,first.definition,targets,first.effect,now,first.responseTo,copy),target=>Boolean(legal(target)));
  c.stage4={...c.stage4,officeExempt:s.players.filter(q=>!terrainEffect(s,q.seat,c.definition)).map(q=>q.seat)};
  if(def.type==='attack'||c.definition==='basic-002'&&c.responseTo===null)s.players[a].attacks++;
  p.emit(s,'play',`S${a+1} 质数第二份${def.name}，不重复支付费用`);s.phase='resolving';s.queue.unshift(task('counter',{serial:c.serial}),task('continue',{serial:c.serial}));return true;
 }
 if(stage4MovementTask(s,t,now,p)||stage4CombatTask(s,t,now,p)||stage4EquipmentTask(s,t,now,p)||stage4CounterTask(s,t,now,p)||stage4InterruptTask(s,t,now,p)||stage4MapTask(s,t,now,p))return true;
 if(t.action==='effect'&&stage4MapEffect(s,now,p))return true;
 if(t.action!=='effect')return false;
 const st=state(s),c=stack.currentCard(st),def=STAGE4_CARDS[c.definition as Stage4CardId];
 const exercise=['basic-003','basic-004','basic-005'].includes(c.definition)&&c.targets.some(a=>st.stage4.exerciseGuard[a]);
 if(!basic.has(c.definition)&&!(c.definition==='basic-009'&&c.stage4?.dodge)&&!exercise)return false;
 resources.recordCombo(st,c.actor,c.definition);
 const targets=c.targets.filter(a=>st.players[a].hp>0&&!c.cancelled.includes(a)&&roles.cardEffectAllowed(st,a,c.definition,c.effect)&&!(c.stage4?.officeExempt??[]).includes(a));
 const after:Task[]=[];cMarkFood(s,c,targets);
 if(['basic-011','basic-012','basic-014'].includes(c.definition))after.push(...s.order.filter(a=>targets.includes(a)).map(actor=>task('stage4-deliver',{actor,serial:c.serial})));
 else if(c.definition==='basic-007')after.push(...p.damage(s,targets.map(target=>({target,amount:fRock(st,target)?3:2,source:c.actor,category:'attack' as const}))));
 else if(c.definition==='basic-009')after.push(...p.damage(s,targets.map(target=>({target,amount:2,source:c.actor,category:'attack' as const}))));
 else if(exercise){
  const hits:Parameters<Stage3Ports['damage']>[1]=[];
  for(const target of targets){if(st.stage4.exerciseGuard[target]){st.stage4.exerciseGuard[target]=false;p.emit(s,'buff',`S${target+1} 农夫三拳免本次搏击操AP扣减`);continue;}
   const power=runtimeForVersion(s.version).cards[id(c.card)].power!,paid=Math.min(st.players[target].ap,power);st.players[target].ap-=paid;
   if(paid<power)hits.push({target,amount:power-paid,source:c.actor,category:'attack'});
  }after.push(...p.damage(s,hits));
 }else if(c.definition==='basic-018')for(const target of targets){st.stage4.downPending[target]=true;st.stage3.coffeeRound[target]=true;st.stage3.coffeeUntilStart[target]=st.stage3.starts[target]+1;}
 else if(c.definition==='basic-019')for(const target of targets){const amount=Math.min(2,st.players[target].ap);st.players[target].ap-=amount;resources.gainAp(st,c.actor,amount);p.emit(s,'ap',`借我张纸拿取${amount}AP`);}
 else if(c.definition==='basic-022')for(const target of targets)st.stage3.breadPending[target]=true;
 else if(c.definition==='basic-025')for(const target of targets)p.draw(s,target,c.stage4?.x??0);
 else if(['basic-029','basic-030','basic-035','basic-036'].includes(c.definition))for(const target of targets){
  changeStage4Faction(s,target,c.definition==='basic-029'?'monkey':c.definition==='basic-030'?'dimon':null);
  p.emit(s,'faction',`S${target+1} 当前归属：${s.players[target].faction}${s.mode==='team'?'／'+s.players[target].team+'队':''}`);
 }
 else for(const target of targets){
  if(c.definition==='basic-048'){
   if(p.die(s,'油泼',c.actor)===6)after.push(...p.damage(s,[{target,amount:1,source:c.actor,category:'attack'}]));
   else p.heal(s,target,fUncapped(st,target)?2:st.players[target].maxHp-st.players[target].hp,true);
  }else{
   p.heal(s,target,c.definition==='basic-040'&&st.players[target].character==='character-040'?st.players[target].maxHp-st.players[target].hp:1,true);
   if(c.definition==='basic-042'){st.stage4.tea[target]=true;st.stage4.buffSources[`${target}:tea`]=structuredClone(c.effect);}
   if(c.definition==='basic-043'){st.stage4.dodge[target]=true;st.stage4.buffSources[`${target}:dodge`]=structuredClone(c.effect);}
   if(c.definition==='basic-044'){st.stage4.exerciseFree[target]=true;st.stage4.exerciseGuard[target]=true;st.stage4.buffSources[`${target}:exerciseFree`]=structuredClone(c.effect);}
  }
 }
 p.emit(s,'effect',def.name+'结算');s.queue.unshift(...after,task('cleanup',{serial:c.serial}));return true;
}
