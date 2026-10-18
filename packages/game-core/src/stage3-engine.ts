import {discardCards,higherExerciseResponse} from './exercise';
import {northTargets,relocationCell,nearestShore} from './playtest';
import {boardWater} from './stage4-board';
import {native} from './classic';
import {hasPlaytestRules} from '../../game-data/src/index';
import {ignoreLocation,terrainCard,terrainEffect,terrainMoveCost} from './stage4-terrain';
import {stage4CardRange} from './stage4-combat';
import {onBoard,boardSingleProtected,boardLmmTarget} from './stage4-board';
import type {GameState,Command,Task,ChoiceKind} from './types';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import * as stack from './stage3-card-stack';
import {STAGE3_CARDS} from '../../game-data/src/stage3';
import source from '../../game-data/src/source-catalog.json';
import {mapForVersion,neighboringForVersion,runtimeForVersion} from '../../game-data/src/index';
import {locationCardAllowed,locationEffectAllowed,locationDestinations,basicMoveCost} from './locations';
import {roleEffectAllowed,modifiedByRole} from './character-effects';
import {integer} from './random';
type State=GameState&ResourceState&stack.CardStackState;
type Play=Extract<Command,{type:'play'}>;
type Choose=Extract<Command,{type:'choose'}>;
export interface Stage3Ports {
 emit:(s:GameState,type:string,text:string,data?:unknown)=>void;
 die:(s:GameState,reason:string)=>number;
 select:(s:GameState,kind:ChoiceKind,actor:number,now:number,extra?:Partial<NonNullable<GameState['choice']>>)=>void;
 draw:(s:GameState,actor:number,count:number)=>void;
 heal:(s:GameState,actor:number,amount:number,food?:boolean)=>void;
 damage:(s:GameState,hits:{target:number;amount:number;source:number|null;category:'attack'|'response'|'environment';trueDamage?:boolean;reflected?:boolean;directHp?:boolean;extra?:boolean}[],environment?:boolean,suppressPursuit?:boolean)=>Task[];
 relocate:(s:GameState,actor:number,cell:string,voluntary:boolean,carry?:boolean,reactive?:boolean)=>Task[];
 finish:(s:GameState,forced:boolean,now:number)=>boolean;
 endTurn?:(s:GameState,now:number,timeout?:boolean)=>void;
}
const need=(value:unknown,message:string):void=>{if(!value)throw Error(message);};
const state=(s:GameState):State=>{need(s.stage3&&s.cardStack,'阶段三状态缺失');return s as State;};
const board=(s:State):roles.RoleBoard=>({...s,farmClosed:s.classic?.farmClosed??false});
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
const seatName=(a:number)=>`S${a+1}`;
const cardId=(card:string)=>card.split('#')[0];
const cards=(s:GameState)=>runtimeForVersion(s.version).cards as Record<string,import('../../game-data/src/legacy').CardDefinition>;
const alive=(s:GameState,a:number)=>s.players[a]?.hp>0;
const prepend=(s:GameState,...tasks:Task[])=>s.queue.unshift(...tasks);
export function stage3Overflow(s:GameState,now:number,p:Stage3Ports):boolean {
 const st=state(s),due=resources.overflowDonors(st,s.order)[0];if(!due)return false;
 p.select(s,'xiao-overflow',due.actor,now,{source:due.collector,count:due.count,cards:[...s.players[due.actor].hand]});return true;
}
export function stage3Play(s:GameState,cmd:Play,now:number,p:Stage3Ports,costOverride?:ReturnType<typeof resources.cardApCost>){
 const st=state(s),actor=cmd.actor,user=s.players[actor],def=cards(s)[cardId(cmd.card)],converted=cmd.as==='elbow';
 need(user.hand.includes(cmd.card)&&def,'手中没有该实体牌');need(!st.stage3.breadBlocked[actor],'面包：本个人回合不能主动出牌');
 const elbow=user.character==='character-023'&&(converted||def.id==='basic-002');need(!converted||user.character==='character-023','只有牢大可以转换肘击');
 need(def.type!=='response'||elbow,'响应牌只能在相应窗口使用');
 need(user.character!=='character-005'||converted||!(source.cards[def.id as keyof typeof source.cards].tags as readonly string[]).includes('建民'),'QB不能使用建民牌');
 const boosted=user.character==='character-045'&&def.id==='basic-010';need(boosted||converted||terrainCard(s,actor,def.id),'当前位置禁止使用此牌');
 let quoted=costOverride??(converted?{cost:resources.fixedApCost(st,actor,2),effect:{origin:'role-active' as const,actor,faction:user.faction,roleModifiers:[{actor,kind:'conversion' as const}]}}:resources.cardApCost(st,actor,cmd.card,def.randomCost?st.stage3.costLocks[cmd.card]?.turn===st.stage3.turn?st.stage3.costLocks[cmd.card].cost:undefined:undefined));
 if(elbow&&!converted)quoted.effect={...modifiedByRole(quoted.effect,{actor,kind:'other'}),faction:quoted.effect.faction};
 if(!converted)quoted.effect=resources.attackEquipmentEffect(st,actor,cmd.card,quoted.effect);
 if(boosted)quoted.effect={...modifiedByRole(quoted.effect,{actor,kind:'target'}),faction:quoted.effect.faction};
 need(user.ap>=quoted.cost,`需要${quoted.cost}AP`);need(new Set(cmd.targets).size===cmd.targets.length,'目标不能重复');
 let targets=[...cmd.targets];
 if(elbow)need(targets.length===1&&roles.elbowTargets(board(st),actor,converted).includes(targets[0]),'主动肘击目标不合法');
 else if(def.type==='attack'){
  const legal=def.id==='basic-010'?roles.monkeyTargets(board(st),actor):stage3AttackTargets(s,actor,cmd.card);
  need(targets.length>=1&&targets.length<=(def.group?3:1)&&targets.every(t=>legal.includes(t)),'攻击目标不合法');
 }else if(def.id==='basic-016')need(targets.length===1&&targets[0]!==actor&&alive(s,targets[0])&&roles.mayVoluntarilyRelocate(st,actor)&&roles.emptyEntry(board(st),actor,s.players[targets[0]].cell,[actor,targets[0]])&&roles.emptyEntry(board(st),targets[0],user.cell,[actor,targets[0]]),'交换目标或坐骑位移限制不合法');
 else if(def.id==='basic-037')need(targets.length===1&&resources.revivalCells(st,targets[0],s.classic!.farmClosed).length>0,'当前没有合法复活目标');
 else{need(targets.length===0,'此牌不接受外部目标');targets=def.id==='basic-041'?roles.assamTargets(board(st),actor):[actor];}
 targets=northTargets(st,targets,cmd.northGroup,def.type!=='attack'&&!elbow&&def.id!=='basic-016'&&def.id!=='basic-037');
 if(!converted&&def.type==='equipment'){const options=resources.equipmentReplacements(st,actor,cmd.card);need(options.allowed&&(!options.required||cmd.replacement!==undefined)&&(!cmd.replacement||options.cards.includes(cmd.replacement)),'请先选择合法装备替换对象');need(def.id!=='basic-063'||mapForVersion(s.version).map[user.cell].terrain!=='water','水中不能装备禁水的哈基米');}
 if(cmd.direction)need(roles.DIRECTIONS.includes(cmd.direction),'撞飞方向无效');
 if(elbow){const cells=roles.elbowPushCells(board(st),actor,targets[0]);need(!cells.length||cmd.direction!==undefined&&cells.includes(roles.nextInDirection(s.players[targets[0]].cell,cmd.direction)??''),'请先选择合法撞飞方向');}
 const exposed=roles.withExposedJj(st,actor,elbow?'basic-002':cmd.card,targets,quoted.effect);targets=northTargets(st,exposed.targets);
 user.ap-=quoted.cost;user.hand.splice(user.hand.indexOf(cmd.card),1);s.resolving.push(cmd.card);s.clock={remaining:60000,since:now};
 const pending=stack.beginCard(st,actor,cmd.card,elbow?'basic-002':def.id,targets,exposed.effect,now);if(elbow){pending.converted=converted;pending.pushDirection=cmd.direction;}if(cmd.replacement)pending.replacement=cmd.replacement;
 if(def.type==='attack'||elbow)user.attacks++;
 p.emit(s,'play',`${seatName(actor)} 使用${elbow?'肘击':def.name}，支付${quoted.cost}AP`,{actor,card:cmd.card,targets});
 s.phase='resolving';prepend(s,task('counter',{serial:pending.serial}),task('continue',{serial:pending.serial}));
}
export function stage3AttackTargets(s:GameState,actor:number,card:string):number[]{
 const st=state(s),def=cards(s)[cardId(card)];if(!def||def.type!=='attack')return [];
 if(def.id==='basic-010')return roles.monkeyTargets(board(st),actor);
 const user=s.players[actor],map=mapForVersion(s.version),ids=s.players.filter(q=>onBoard(s,q.seat)&&(!s.stage4||def.group||!boardSingleProtected(s,actor,q.seat))&&q.seat!==actor&&(!s.stage4||def.id!=='basic-006'||!resources.equipped(st,q.seat,'basic-057'))&&(s.mode==='ffa'||q.team!==user.team)&&!(def.group&&q.character==='character-027'&&q.hand.length===1)&&terrainCard(s,actor,def.id)&&(s.stage4?stage4CardRange(s,actor,def,q.cell):(def.range==='global'||map.map[q.cell].region===map.map[user.cell].region||(def.range==='adjacent'&&neighboringForVersion(s.version,map.map[user.cell].region,map.map[q.cell].region))))).map(q=>q.seat);
 const lmm=boardLmmTarget(st,actor,ids);if(!def.group&&lmm!==null)return [lmm];
 const lemon=ids.find(a=>s.players[a].character==='character-004');return !def.group&&lemon!==undefined?[lemon]:ids;
}
export function stage3Actions(s:GameState,actor:number){
 const st=state(s),p=s.players[actor],b=board(st),free=s.phase==='action'&&!s.choice&&s.active===actor&&alive(s,actor);
 const locationInput={...s,shipUsed:s.classic!.shipUsed,farmClosed:s.classic!.farmClosed};
 const destinations=(kind:'ship'|'commute')=>resources.mountMovementBlocked(st,actor)||ignoreLocation(s,actor)?[]:locationDestinations({...locationInput,players:kind==='ship'&&st.stage3.jjFree[actor]?s.players.map(q=>q.seat===actor?{...q,ap:Math.max(1,q.ap)}:q):s.players},actor,kind).filter(c=>resources.canEnterWithMount(st,actor,c)&&(!hasPlaytestRules(s.version)||relocationCell(s,actor,s.players[actor].cell,c)!==null));
 const revivalTargets=s.players.filter(q=>resources.revivalCells(st,q.seat,s.classic!.farmClosed).length>0).map(q=>q.seat);
 return {
  jj:free&&p.character==='character-003'&&!st.stage3.jjUsed[actor],
  breadTargets:free&&resources.breadUseAllowed(st,actor)?s.players.filter(q=>onBoard(s,q.seat)&&q.seat!==actor).map(q=>q.seat):[],
  revivalTargets,
  cards:Object.fromEntries(p.hand.map(card=>{
   const def=cards(s)[cardId(card)],quote=st.stage3.costLocks[card],quoted=quote?.turn===st.stage3.turn?quote.cost:undefined;
   const cost=s.choice?.kind==='response'&&s.choice.actor===actor&&s.choice.cards?.includes(card)&&higherExerciseResponse(s.version,s.cardStack?.stack.at(-1)?.definition??'',card)?0:def.randomCost&&quoted===undefined?null:resources.cardApCost(st,actor,card,quoted).cost;
   const targets=def.id==='basic-002'&&p.character==='character-023'?roles.elbowTargets(b,actor,false):def.type==='attack'?stage3AttackTargets(s,actor,card):def.id==='basic-037'?revivalTargets:def.id==='basic-016'?s.players.filter(q=>onBoard(s,q.seat)&&q.seat!==actor&&roles.mayVoluntarilyRelocate(st,actor)&&roles.emptyEntry(b,actor,q.cell,[actor,q.seat])&&roles.emptyEntry(b,q.seat,p.cell,[actor,q.seat])).map(q=>q.seat):[];
   return [card,{cost,needsQuote:def.randomCost===true&&quoted===undefined,targets,convertTargets:p.character==='character-023'?roles.elbowTargets(b,actor,true):[],equipment:def.type==='equipment'?resources.equipmentReplacements(st,actor,card):null,blocked:st.stage3.breadBlocked[actor]}];
  })),
  directionRequired:p.character==='character-040',basicMovesRemaining:Math.max(0,resources.basicMoveAllowance(st,actor)-st.stage3.basicUsed[actor]),
  moveCost:resources.equipped(st,actor,'basic-071')?0:resources.fixedApCost(st,actor,terrainMoveCost(s,actor)),movementBlocked:resources.mountMovementBlocked(st,actor),locations:{ship:destinations('ship'),commute:destinations('commute')},
  elbowPush:(p.character==='character-023'?Object.fromEntries(roles.elbowTargets(b,actor,false).map(target=>{const cells=roles.elbowPushCells(b,actor,target);return [target,Object.fromEntries(roles.DIRECTIONS.map(d=>[d,roles.nextInDirection(s.players[target].cell,d)]).filter(([,cell])=>cell!==null&&cells.includes(cell)))];})):{} ) as Record<number,Partial<Record<roles.Direction,string>>>,
 };
}
function responseOptions(s:State,a:number,card:stack.PendingCard):string[]{
 return s.players[a].hand.filter(c=>{const id=cardId(c);return higherExerciseResponse(s.version,card.definition,c)||((id==='basic-001'&&card.definition!=='basic-009')||(id==='basic-002'&&card.definition==='basic-008'))&&s.players[a].ap>=resources.cardApCost(s,a,c).cost;});
}
function availableTargets(s:State,c:stack.PendingCard):number[]{return c.targets.filter(a=>alive(s,a)&&!c.cancelled.includes(a)&&roles.cardEffectAllowed(s,a,c.definition,c.effect)&&(s.stage4?!c.stage4?.officeExempt?.includes(a):locationEffectAllowed('web-v0.1.5',s.players[a].cell,c.definition)));}
function queueDamage(s:State,p:Stage3Ports,hits:Parameters<Stage3Ports['damage']>[1]){return p.damage(s,hits);}
export function stage3Task(s:GameState,t:Task,now:number,p:Stage3Ports){
 const st=state(s),a=t.actor??s.active,user=s.players[a];
 if(t.action==='east'){const targets=roles.eastTargets(st,a,'draw');if(targets.length)p.select(s,'east-start',a,now,{targets});return;}
 if(t.action==='qb'){if(alive(s,a)&&t.target!==undefined&&alive(s,t.target)&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[t.target]))p.select(s,'qb-pursuit',a,now,{source:t.target});return;}
 if(t.action==='ledger'){const targets=(t.data as number[]).filter(t=>alive(s,t));if(alive(s,a)&&targets.length)p.select(s,'xie-ledger',a,now,{targets});return;}
 if(t.action==='elbow-hit'){
  const target=t.target!;if(!alive(s,a)||!alive(s,target))return;const origin=s.players[target].cell;
  prepend(s,...p.damage(s,[{target,amount:1,source:a,category:'attack'}]),task('elbow-push',{actor:a,target,data:{origin,direction:stack.currentCard(st).pushDirection}}));return;
 }
 if(t.action==='carry'){const snapshots=t.data as {actor:number;origin:string}[],valid=snapshots.filter(x=>roles.carryDestinations(board(st),a,x.actor,x.origin).length);if(alive(s,a)&&valid.length)p.select(s,'west-carry',a,now,{targets:valid.map(x=>x.actor),data:valid,options:Object.fromEntries(valid.map(x=>[x.actor,roles.carryDestinations(board(st),a,x.actor,x.origin)]))});return;}
 if(t.action==='elbow-push'){
  const target=t.target!,{origin,direction}=t.data as {origin:string;direction?:roles.Direction};if(!alive(s,a))return;
  if(!alive(s,target)){if(roles.emptyEntry(board(st),a,origin))prepend(s,...p.relocate(s,a,origin,true));return;}
  const cells=roles.elbowPushCells(board(st),a,target);if(!cells.length)return;
  const preferred=direction?roles.nextInDirection(s.players[target].cell,direction):null;
  if(preferred&&cells.includes(preferred)){const from=s.players[target].cell;prepend(s,...p.relocate(s,target,preferred,false),...p.relocate(s,a,from,true));return;}
  p.select(s,'elbow-push',a,now,{source:target,cells,data:{origin:s.players[target].cell}});return;
 }
 if(t.action==='equip-install'){
  const pending=stack.currentCard(st);if(alive(s,pending.actor)){st.stage3.equipment[pending.actor].push(pending.card);st.stage3.equipmentSources[pending.card]=structuredClone(pending.effect);s.resolving=s.resolving.filter(c=>c!==pending.card);pending.installed=true;st.stage3.doubleMove[pending.actor]=resources.equipped(st,pending.actor,'basic-066')&&st.stage3.previousBasic[pending.actor]===false;s.players[pending.actor].moved=st.stage3.basicUsed[pending.actor]>=resources.basicMoveAllowance(st,pending.actor);p.emit(s,'equip',`${seatName(pending.actor)} 装备${cards(s)[pending.definition].name}`);}return;
 }
 const c=stack.currentCard(st);need(t.serial===undefined||c.serial===t.serial,'卡牌结算编号过期');
 if(t.action==='counter'){if(c.counter)p.select(s,'easy',c.counter.actor,now,{deadline:c.counter.deadline,data:{serial:c.serial}});return;}
 if(t.action==='continue'){
  if(c.countered){prepend(s,task('cleanup',{serial:c.serial}));return;}
  if(c.responseTo!==null){prepend(s,task('cleanup',{serial:c.serial}));return;}
  const def=cards(s)[c.definition];
  if(def.type==='attack'||c.definition==='basic-002'){
   s.attack={actor:c.actor,card:c.card,targets:c.targets,cancelled:c.cancelled,elbows:c.elbows};prepend(s,...s.order.filter(a=>availableTargets(st,c).includes(a)).map(actor=>task('response',{actor,serial:c.serial})),task('effect',{serial:c.serial}));
  }else prepend(s,task('effect',{serial:c.serial}));return;
 }
 if(t.action==='response'){if(availableTargets(st,c).includes(a)){const cards=responseOptions(st,a,c);if(cards.length)p.select(s,'response',a,now,{cards,data:{serial:c.serial}});}return;}
 if(t.action==='cleanup'){
  const closed=stack.closePending(st);if(closed.installed)s.discard=s.discard.filter(c=>c!==closed.card);
  if(st.cardStack.stack.length){const parent=stack.currentCard(st);s.attack={actor:parent.actor,card:parent.card,targets:parent.targets,cancelled:parent.cancelled,elbows:parent.elbows};return;}
  s.attack=null;if(!p.finish(s,false,now)){if(alive(s,s.active)){s.phase='action';}else prepend(s,{kind:'next'});}return;
 }
 if(t.action!=='effect')throw Error('未知阶段三结算任务');
 resources.recordCombo(st,c.actor,c.definition);const targets=availableTargets(st,c),def=cards(s)[c.definition];const after:Task[]=[];
 if(c.definition==='basic-002'){
  after.push(...targets.map(target=>task('elbow-hit',{actor:c.actor,target})));
 }else if(def.type==='attack'){
  const hits:Parameters<Stage3Ports['damage']>[1]=[],before=s.players.map(p=>p.hp);let roll=0;
  const xie=s.players.find(q=>q.hp>0&&q.character==='character-044'),ledger=xie&&c.definition==='basic-010'?roles.monkeyLedgerCandidates(st,xie.seat,c.actor,targets):[];
  if(targets.length&&['basic-006','basic-009'].includes(c.definition))roll=p.die(s,def.name);
  for(const target of targets){const victim=s.players[target];
   if(def.power!==undefined){const paid=Math.min(victim.ap,def.power);victim.ap-=paid;p.emit(s,'ap',`${seatName(target)} 被扣${paid}AP → ${victim.ap}`);if(paid<def.power)hits.push({target,amount:def.power-paid,source:c.actor,category:'attack'});}
   else if(c.definition==='basic-008'){if(victim.ap===0)hits.push({target,amount:1,source:c.actor,category:'attack'});else{const amount=victim.ap;victim.ap=0;const gain=resources.gainAp(st,c.actor,amount);p.emit(s,'ap',`${seatName(c.actor)} 头锤吸收全部${amount}AP，晓虫收取${gain.taken}AP`);}}
   else if(c.definition==='basic-010'?p.die(s,`${seatName(target)} 猴子游戏`)%2===1:roll>=4)hits.push({target,amount:1,source:c.actor,category:'attack'});
  }
  for(const responder of c.elbows){if(!alive(s,responder))continue;const victim=s.players[c.actor];if(victim.ap===0)hits.push({target:c.actor,amount:1,source:responder,category:'response'});else{const amount=Math.min(2,victim.ap);victim.ap-=amount;resources.gainAp(st,responder,amount);}}
  after.push(...queueDamage(st,p,hits));if(c.definition==='basic-006'&&alive(s,c.actor))p.heal(s,c.actor,targets.reduce((n,a)=>n+before[a]-s.players[a].hp,0));
  if(ledger.length&&xie)after.push(task('ledger',{actor:xie.seat,data:ledger}));
 }else if(def.type==='food'){
  for(const target of targets){p.heal(s,target,c.definition==='basic-046'?2:1,true);if(c.definition==='basic-045'){const gained=Math.min(1,2-s.players[target].shield);s.players[target].shield+=gained;}if(c.definition==='basic-047')p.draw(s,target,2);}
 }else if(c.definition==='basic-015'){for(const target of targets){const gain=resources.coffeeTaken(st,target);p.emit(s,'ap',`${seatName(target)} 咖啡获得${gain.gained}AP，晓虫收取${gain.taken}AP`);}}
 else if(c.definition==='basic-016'){
  for(const target of targets){if(!roles.cardEffectAllowed(st,c.actor,c.definition,c.effect)||!resources.canEnterWithMount(st,c.actor,s.players[target].cell)||!resources.canEnterWithMount(st,target,s.players[c.actor].cell))continue;const from=s.players[c.actor].cell,to=s.players[target].cell;
   if(hasPlaytestRules(s.version)){
    const first=relocationCell(s,c.actor,from,to,[target]),second=relocationCell(s,target,to,from,[c.actor]);if(!first||!second||first===second)continue;
    s.stage4!.offMap[target]=true;after.push(...p.relocate(s,c.actor,first,true));s.stage4!.offMap[target]=false;after.push(...p.relocate(s,target,second,false));
   }else after.push(...p.relocate(s,c.actor,to,true),...p.relocate(s,target,from,false));}
 }else if(c.definition==='basic-037'){
  // Dead targets are deliberately absent from availableTargets: revive them
  // through their dedicated legal-death window rather than an alive-only path.
  for(const target of c.targets){if(!roles.cardEffectAllowed(st,target,c.definition,c.effect))continue;const cells=resources.revivalCells(st,target,s.classic!.farmClosed);if(!cells.length)continue;const cell=cells[integer(s.random,cells.length)];resources.reviveResourcePlayer(st,target,cell,s.classic!.farmClosed);if(hasPlaytestRules(s.version)&&native(s,target)&&boardWater(st,cell,target))after.push(task('board-shore',{actor:target,data:{cells:nearestShore(st,target)}}));s.classic!.exposure[target]={region:null,streak:0};s.classic!.caveEnds![target]=0;p.emit(s,'revive',`${seatName(target)} 紫檀木复活于${cell}：1HP、0AP、空手`);}
 }else if(def.type==='equipment'){
  if(c.replacement){const old=c.replacement,oldSource=st.stage3.equipmentSources[old];st.stage3.equipment[c.actor]=st.stage3.equipment[c.actor].filter(x=>x!==old);delete st.stage3.equipmentSources[old];discardCards(s,[old]);
   if(oldSource&&roles.cardEffectAllowed(st,c.actor,old,{...oldSource,origin:'equipment'})){
    const cells=cardId(old)==='basic-063'?mapForVersion(s.version).cells.filter(cell=>cell.region==='山洞'&&roles.emptyEntry(board(st),c.actor,cell.id)).map(cell=>cell.id):undefined;
    if(cardId(old)==='basic-054'||cells?.length)p.select(s,'equipment-loss',c.actor,now,{cells,data:{card:old}});
   }
  }after.push(task('equip-install',{serial:c.serial}));
 }
 prepend(s,...after,task('cleanup',{serial:c.serial}));
}
export function stage3Skill(s:GameState,cmd:Extract<Command,{type:'skill'}>,now:number,p:Stage3Ports){
 const st=state(s),a=cmd.actor,user=s.players[a];
 if(cmd.kind==='jj'){need(user.character==='character-003'&&!st.stage3.jjUsed[a],'懒得喷本回合已使用或角色不符');st.stage3.jjUsed[a]=true;st.stage3.jjFree[a]=true;st.stage3.jjExposed[a]=true;p.emit(s,'skill',`${seatName(a)} 懒得喷：固定费用免费，暴露至下次个人回合开始`);return;}
 if(cmd.kind==='bread'){
  const target=cmd.target!,gear=st.stage3.equipment[a].find(card=>cardId(card)==='basic-054'),source=gear?st.stage3.equipmentSources[gear]:null;
  need(resources.breadUseAllowed(st,a)&&source&&alive(s,target)&&target!==a,'面包技能或目标不可用');const cost=resources.fixedApCost(st,a,2);need(user.ap>=cost,'面包技能需要2AP');user.ap-=cost;
  const effect:EquipmentSource={...source!,origin:'equipment',roleModifiers:[...source!.roleModifiers,...(st.stage3.jjFree[a]?[{actor:a,kind:'cost' as const}]:[])]};
  const prior=st.stage3.breadPending[target];resources.useBread(st,a,target);if(!roles.cardEffectAllowed(st,target,'basic-054',effect))st.stage3.breadPending[target]=prior;p.emit(s,'skill',`${seatName(a)} 面包黏稠，支付${cost}AP`);return;
 }
 const card=cmd.card!,target=cmd.target!;need(cardId(card??'')==='basic-037'&&resources.revivalCells(st,target,s.classic!.farmClosed).length,'当前没有合法紫檀木复活目标');
 const cost=resources.lockRevivalCost(st,a,card,()=>p.die(s,'紫檀木费用'));p.select(s,'revival-confirm',a,now,{source:target,data:{card,cost}});
}
// Returns true only when the existing window remains open (easy failed roll).
export function stage3Choose(s:GameState,cmd:Choose,now:number,p:Stage3Ports,timeout:boolean):boolean {
 const st=state(s),c=s.choice!,a=c.actor;
 if(c.kind==='easy'){
  const result=stack.counterCard(st,a,cmd.accept===true&&!timeout,now,()=>p.die(s,'easy 太简单了'));p.emit(s,'skill',result.attempted?`${seatName(a)} 反制支付1AP，${result.cancelled?'整牌失效':'判定失败'}`:`${seatName(a)} 结束反制`);return !result.done;
 }
 if(c.kind==='response'){
  if(cmd.card){need(c.cards?.includes(cmd.card),'响应牌不可用');const parent=stack.currentCard(st);need(responseOptions(st,a,parent).includes(cmd.card),'响应牌已失效');const quoted=higherExerciseResponse(s.version,parent.definition,cmd.card)?{cost:0,effect:{origin:'card' as const,actor:a,faction:s.players[a].faction,roleModifiers:[]}}:resources.cardApCost(st,a,cmd.card);s.players[a].ap-=quoted.cost;s.players[a].hand=s.players[a].hand.filter(x=>x!==cmd.card);s.resolving.push(cmd.card);const child=stack.beginCard(st,a,cmd.card,cardId(cmd.card),[],quoted.effect,now,parent.serial);prepend(s,task('counter',{serial:child.serial}),task('continue',{serial:child.serial}));p.emit(s,'response',`${seatName(a)} 使用${cards(s)[child.definition].name}，支付${quoted.cost}AP`);}return false;
 }
 if(c.kind==='xiao-overflow'){const cards=timeout?[...s.players[a].hand].sort().slice(0,c.count):cmd.cards??[];resources.transferOverflow(st,a,c.source!,cards);p.emit(s,'transfer',`${seatName(a)} 超限${cards.length}张交给${seatName(c.source!)}`);return false;}
 if(c.kind==='qb-pursuit'){if(cmd.accept&&alive(s,c.source!)){const target=p.die(s,'QB 纯菜')>=3?c.source!:a;prepend(s,...p.damage(s,[{target,amount:1,source:a,category:'response'}],false,true));}return false;}
 if(c.kind==='east-start'){
  if(cmd.action==='ap')throw Error('领袖风范选项无效');if(cmd.action){const target=cmd.target!;need(roles.eastTargets(st,a,cmd.action).includes(target),'领袖风范目标不合法');if(cmd.action==='draw'){p.draw(s,a,1);p.draw(s,target,1);}else{const hand=s.players[target].hand,index=integer(s.random,hand.length);s.players[a].hand.push(hand.splice(index,1)[0]);p.emit(s,'transfer',`${seatName(a)} 从${seatName(target)} 随机拿1张`);}}return false;
 }
 if(c.kind==='xie-ledger'){if(cmd.target!==undefined){need(c.targets?.includes(cmd.target)&&alive(s,cmd.target),'阎王薄目标不合法');prepend(s,...p.damage(s,[{target:cmd.target,amount:1,source:a,category:'response'}]));}return false;}
 if(c.kind==='elbow-push'){
  const target=c.source!,cells=roles.elbowPushCells(board(st),a,target),cell=timeout?cells[0]:cmd.cell;if(!cell){need(cells.length===0,'请选择一个撞飞方向');return false;}need(cells.includes(cell),'撞飞落点已失效');const origin=(c.data as {origin:string}).origin;prepend(s,...p.relocate(s,target,cell,false),...p.relocate(s,a,origin,true));return false;
 }
 if(c.kind==='west-carry'){
  if(cmd.target!==undefined){const snapshot=(c.data as {actor:number;origin:string}[]).find(x=>x.actor===cmd.target);need(snapshot&&typeof cmd.cell==='string'&&roles.carryDestinations(board(st),a,cmd.target,snapshot.origin).includes(cmd.cell),'同行对象或落点不合法');prepend(s,...p.relocate(s,cmd.target,cmd.cell!,false,false));}return false;
 }
 if(c.kind==='equipment-loss'){
  const card=(c.data as {card:string}).card;if(cardId(card)==='basic-054'&&cmd.accept)p.heal(s,a,2);else if(cardId(card)==='basic-063'&&cmd.cell){need(c.cells?.includes(cmd.cell),'山洞落点不合法');prepend(s,...p.relocate(s,a,cmd.cell,true));}return false;
 }
 if(c.kind==='revival-confirm'){
  if(cmd.accept){const data=c.data as {card:string;cost:number};stage3Play(s,{type:'play',id:cmd.id,revision:cmd.revision,actor:a,card:data.card,targets:[c.source!]},now,p);}return false;
 }
 throw Error('未知阶段三选择');
}
