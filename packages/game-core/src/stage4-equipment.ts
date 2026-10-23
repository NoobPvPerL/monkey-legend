import {hEquipmentCards,hEquipmentSource,hEquipmentForget,hEquipmentInstallTasks} from './p3-h-equipment';
import {discardCards} from './exercise';
import {gPrimeActive} from './p3-g-cards';
import {gPiece,gPiecePhysical} from './p3-g-equipment';
import {gEnabled,gState} from './p3-g-state';
import {mapForVersion,runtimeForVersion} from '../../game-data/src/index';
import type {GameState,Command,Task} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {EquipmentSource,ResourceState} from './stage3-resources';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import * as stack from './stage3-card-stack';
import {boardEmptyEntry,boardWater,onBoard} from './stage4-board';
import {integer} from './random';

type State=GameState&ResourceState&stack.CardStackState&{stage4:NonNullable<GameState['stage4']>};
const state=(s:GameState)=>s as State;
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const id=(c:string)=>c.split('#')[0] as import('../../game-data/src/index').CardId;
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export interface GearSnapshot {card:string;definition:string;effect:EquipmentSource;durability?:number;breadRemaining?:number}
export function gearSnapshot(s:GameState,a:number,card:string):GearSnapshot {
 const st=state(s);need(st.stage3.equipment[a].includes(card),'装备已不在该玩家装备区');
 return {card,definition:resources.equipmentDefinition(st,card),effect:structuredClone(st.stage3.equipmentSources[card]),
  ...(st.stage4.durability[card]!==undefined?{durability:st.stage4.durability[card]}:{}),
  ...(gEnabled(s.version)&&resources.equipmentDefinition(st,card)==='basic-054'?{breadRemaining:Math.max(0,(gState(s).gearBreadReadyAt[card]??0)-st.stage3.starts[a])}:{})};
}
export function validateStage4Equipment(s:GameState,cmd:Extract<Command,{type:'play'}>){
 const st=state(s),a=cmd.actor,def=runtimeForVersion(s.version).cards[id(cmd.card)],options=resources.equipmentReplacements(st,a,cmd.card);
 if(gPrimeActive(st,a)){
  const required=Math.max(0,options.cards.length+2-2),selected=cmd.replacements??(cmd.replacement?[cmd.replacement]:[]);
  need(options.allowed&&selected.length>=required&&selected.length<=2&&new Set(selected).size===selected.length&&selected.every(c=>options.cards.includes(c)),'请先选择双装备所需的合法替换对象');
 }else need(cmd.replacements===undefined&&options.allowed&&(!options.required||cmd.replacement)&&(!cmd.replacement||options.cards.includes(cmd.replacement)),'请先选择合法装备替换对象');
 const copied=id(cmd.card)==='basic-073';need(copied||cmd.copy===undefined,'只有Bob能复制坐骑');
 let effective=def.id;
 if(copied){const owner=s.players.find(q=>q.seat!==a&&onBoard(s,q.seat)&&st.stage3.equipment[q.seat].includes(cmd.copy??''));
  need(owner&&id(cmd.copy!)!=='basic-073'&&runtimeForVersion(s.version).cards[id(cmd.copy!)].slot==='mount','Bob须指定他人已装备的非Bob坐骑');effective=id(cmd.copy!) as typeof effective;
 }
 need(!['basic-063','basic-064'].includes(effective)||!boardWater(st,s.players[a].cell,a),'水中不能装备禁水坐骑');
}
export function validateStage4Steal(s:GameState,cmd:Extract<Command,{type:'play'}>){
 const st=state(s),a=cmd.actor,t=cmd.targets[0];need(cmd.take==='hand'||cmd.take==='equipment','请选择拿手牌或装备');
 if(cmd.take==='hand'){need(cmd.item===undefined&&cmd.replacement===undefined,'拿手牌不接受装备参数');return;}
 need(typeof cmd.item==='string'&&st.stage3.equipment[t]?.includes(cmd.item),'请选择目标的一件公开装备');
 const options=resources.equipmentReplacements(st,a,cmd.item!);
 if(gPiecePhysical(st,cmd.item!)){need(options.allowed&&(!options.required||cmd.replacement)&&(!cmd.replacement||options.cards.includes(cmd.replacement)),'成对装备件须合法安装或明确替换');return;}
 // A duplicate-name item may still be stolen into the hand. Full slots require
 // an explicit replacement at commit; changed conditions later use the hand.
 need(!options.allowed||(!options.required||cmd.replacement)&&(!cmd.replacement||options.cards.includes(cmd.replacement)),'请明确被偷装备的替换对象');
 if(!options.allowed)need(cmd.replacement===undefined,'同名装备只能拿入手牌');
}
function detach(s:State,a:number,snapshot:GearSnapshot,discard:boolean){
 hEquipmentForget(s,snapshot.card);
 if(snapshot.definition==='basic-069'&&!gEnabled(s.version))s.stage4.terrainIgnore[a]=false;
 s.stage3.equipment[a]=s.stage3.equipment[a].filter(c=>c!==snapshot.card);delete s.stage3.equipmentSources[snapshot.card];
 delete s.stage4.watches[snapshot.card];delete s.stage4.copies[snapshot.card];delete s.stage4.durability[snapshot.card];
 if(gEnabled(s.version)){delete gState(s).gearBreadReadyAt[snapshot.card];delete gState(s).gearTerrain[snapshot.card];s.stage4.terrainIgnore[a]=s.stage3.equipment[a].some(c=>resources.equipmentDefinition(s,c)==='basic-069'&&gState(s).gearTerrain[c]);}
 if(discard)discardCards(s,[snapshot.card]);else s.resolving.push(snapshot.card);
 s.stage3.doubleMove[a]=resources.equipped(s,a,'basic-066')&&s.stage3.previousBasic[a]===false;
 s.players[a].moved=s.stage3.basicUsed[a]>=resources.basicMoveAllowance(s,a);resources.refreshSharedEquipment(s);
}
function lossTask(a:number,snapshot:GearSnapshot):Task{return task('gear-loss',{actor:a,data:snapshot});}
function install(s:State,a:number,g:GearSnapshot,p:Stage3Ports){
 hEquipmentForget(s,g.card);
 s.resolving=s.resolving.filter(c=>c!==g.card);s.stage3.equipment[a].push(g.card);
 s.stage3.equipmentSources[g.card]={...structuredClone(g.effect),actor:a,faction:s.players[a].faction,origin:'equipment'};
 if(id(g.card)!==g.definition)s.stage4.copies[g.card]=g.definition;
 const durability=g.durability??(g.definition==='basic-051'?3:g.definition==='basic-070'?2:undefined);
 if(durability!==undefined)s.stage4.durability[g.card]=durability;
 if(gEnabled(s.version)&&g.definition==='basic-054')gState(s).gearBreadReadyAt[g.card]=s.stage3.starts[a]+(g.breadRemaining??0);
 if(g.definition==='basic-069'){if(gEnabled(s.version)){gState(s).gearTerrain[g.card]=false;s.stage4.terrainIgnore[a]=s.stage3.equipment[a].some(c=>resources.equipmentDefinition(s,c)==='basic-069'&&gState(s).gearTerrain[c]);}else s.stage4.terrainIgnore[a]=false;}
 if(g.definition==='basic-060')s.stage4.watches[g.card]={current:null,previous:null,usedTurn:null};
 s.stage3.doubleMove[a]=resources.equipped(s,a,'basic-066')&&s.stage3.previousBasic[a]===false;s.players[a].moved=s.stage3.basicUsed[a]>=resources.basicMoveAllowance(s,a);
 p.emit(s,'equip',`S${a+1} 装备${runtimeForVersion(s.version).cards[id(g.card)].name}`);resources.refreshSharedEquipment(s);s.queue.unshift(...hEquipmentInstallTasks(s,a));
}
function canInstall(s:State,a:number,g:GearSnapshot){
 const options=resources.equipmentReplacements(s,a,g.card);
 return onBoard(s,a)&&options.allowed&&!options.required&&(!['basic-063','basic-064'].includes(g.definition)||!boardWater(s,s.players[a].cell,a));
}
/** A committed role transfer reuses the physical equipment loss/install chain. */
export function transferEquipmentTasks(s:GameState,a:number,source:number,card:string,replacement?:string):Task[]{
 const st=state(s),g=gearSnapshot(s,source,card);
 if(gPiecePhysical(st,card))return [task('g-paired-transfer',{actor:a,data:{source,gear:g,...(replacement?{replacement}:{})}})];
 detach(st,source,g,false);return [lossTask(source,g),task('gear-transfer-install',{actor:a,data:{gear:g,...(replacement?{replacement}:{})}})];
}
export function stage4EquipmentTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 const st=state(s),a=t.actor??s.active;
 if(t.action==='g-paired-transfer'){
  const data=t.data as {source:number;gear:GearSnapshot;replacement?:string;replaced?:boolean},g=data.gear;
  if(!onBoard(s,a)||!st.stage3.equipment[data.source].includes(g.card))return true;
  const options=resources.equipmentReplacements(st,a,g.card),waterBlocked=['basic-063','basic-064'].includes(g.definition)&&boardWater(st,s.players[a].cell,a);
  if(!options.allowed||waterBlocked||options.required&&(!data.replacement||data.replaced||!options.cards.includes(data.replacement))){p.emit(s,'transfer','成对装备件无法合法安装，留在原装备区');return true;}
  if(options.required){const old=gearSnapshot(s,a,data.replacement!);detach(st,a,old,true);s.queue.unshift(lossTask(a,old),task('g-paired-transfer',{actor:a,data:{...data,replaced:true}}));return true;}
  detach(st,data.source,g,false);install(st,a,g,p);s.queue.unshift(lossTask(data.source,g));p.emit(s,'transfer',`S${a+1} 成对装备件只转入装备区`);return true;
 }
 if(t.action==='gear-end'){
  if(!onBoard(s,a))return true;const map=mapForVersion(s.version).map,user=s.players[a],here=map[user.cell];
  const hits:Parameters<Stage3Ports['damage']>[1]=[];
  for(const card of hEquipmentCards(s,a)){const definition=resources.equipmentDefinition(st,card),effect={...hEquipmentSource(st,a,card),origin:'equipment' as const};
   if(definition!=='basic-050'&&definition!=='basic-064'||definition==='basic-050'&&here.region==='教学楼')continue;
   for(const q of s.players){const there=map[q.cell];if(q.seat===a||!onBoard(s,q.seat)||s.mode==='team'&&q.team===user.team||!roles.cardEffectAllowed(st,q.seat,definition,effect))continue;
    if(definition==='basic-050'?here.region===there.region:(here.row===there.row||here.col===there.col)&&!resources.equipped(st,q.seat,'basic-063'))hits.push({target:q.seat,amount:1,source:a,category:'response'});
   }
  }s.queue.unshift(...p.damage(s,hits));return true;
 }
 if(t.action==='gear-loss'){
  const g=t.data as GearSnapshot,effect={...g.effect,origin:'equipment' as const};
  if(!onBoard(s,a)||!roles.cardEffectAllowed(st,a,g.card,effect))return true;
  const cells=g.definition==='basic-063'?mapForVersion(s.version).cells.filter(c=>c.region==='山洞'&&boardEmptyEntry(st,a,c.id,[a])).map(c=>c.id):undefined;
  const targets=g.definition==='basic-052'?s.players.filter(q=>q.seat!==a&&onBoard(s,q.seat)&&roles.cardEffectAllowed(st,q.seat,g.card,effect)).map(q=>q.seat):undefined;
  if(['basic-054','basic-059'].includes(g.definition)||cells?.length||targets?.length)p.select(s,'gear-loss',a,now,{...(cells?{cells}:{}),...(targets?{targets}:{}),data:g});
  return true;
 }
 if(t.action==='gear-transfer-install'){
  const data=t.data as {gear:GearSnapshot;replacement?:string;replaced?:boolean},g=data.gear;
  if(data.replacement&&!data.replaced){
   const options=resources.equipmentReplacements(st,a,g.card);
   if(onBoard(s,a)&&options.allowed&&options.cards.includes(data.replacement)){
    const old=gearSnapshot(s,a,data.replacement);detach(st,a,old,true);s.queue.unshift(lossTask(a,old),task('gear-transfer-install',{actor:a,data:{...data,replaced:true}}));return true;
   }
  }
  if(canInstall(st,a,g))install(st,a,g,p);
  else{s.resolving=s.resolving.filter(c=>c!==g.card);if(s.players[a].hp>0)s.players[a].hand.push(g.card);else discardCards(s,[g.card]);p.emit(s,'transfer',`S${a+1} 装配条件失效，装备转入${s.players[a].hp>0?'手牌':'弃牌堆'}`);}
  return true;
 }
 if(t.action==='equip-install'){
  const c=stack.currentCard(st);if(onBoard(s,c.actor)){
   const g:GearSnapshot={card:c.g?gPiece(c.card,c.g.copy):c.card,definition:id(c.card),effect:c.effect};
   // The definition and lineage were snapshotted at commit. Bob never creates
   // another physical entity and does not inherit the source's durability.
   if(c.stage4?.copy)g.definition=c.stage4.copy;
   if(canInstall(st,c.actor,g)){install(st,c.actor,g,p);c.installed=true;}
   else if(!c.g){st.resolving=st.resolving.filter(x=>x!==g.card);st.players[c.actor].hand.push(g.card);c.installed=true;}
  }return true;
 }
 if(t.action!=='effect')return false;
 const c=stack.currentCard(st),def=runtimeForVersion(s.version).cards[id(c.definition)];
 if(c.definition==='basic-024'){
  resources.recordCombo(st,c.actor,c.definition);const jobs:Task[]=[];const target=c.targets.find(t=>onBoard(s,t)&&!c.cancelled.includes(t)&&roles.cardEffectAllowed(st,t,c.definition,c.effect)&&!c.stage4?.officeExempt?.includes(t));
  if(target!==undefined){
   if(c.stage4!.take==='hand'){for(let i=0;i<2&&s.players[target].hand.length;i++){const hand=s.players[target].hand;s.players[c.actor].hand.push(hand.splice(integer(s.random,hand.length),1)[0]);}p.emit(s,'transfer',`S${c.actor+1} 转学手册随机拿取手牌`);}
   else if(st.stage3.equipment[target].includes(c.stage4!.item!)){
    const g=gearSnapshot(s,target,c.stage4!.item!);if(gPiecePhysical(st,g.card)){jobs.push(task('g-paired-transfer',{actor:c.actor,data:{source:target,gear:g,...(c.replacement?{replacement:c.replacement}:{})}}));}else{detach(st,target,g,false);
    jobs.push(lossTask(target,g),task('gear-transfer-install',{actor:c.actor,data:{gear:g,...(c.replacement?{replacement:c.replacement}:{})}}));
    p.emit(s,'transfer',`S${c.actor+1} 转学手册拿取公开装备`);}
   }
  }s.queue.unshift(...jobs,task('cleanup',{serial:c.serial}));return true;
 }
 if(def.type!=='equipment')return false;
 resources.recordCombo(st,c.actor,c.definition);
 const tasks:Task[]=[];
 if(onBoard(s,c.actor)&&roles.cardEffectAllowed(st,c.actor,c.definition,c.effect)){
  const options=resources.equipmentReplacements(st,c.actor,c.card),replacement=c.g?(options.required?c.g.replacements?.find(card=>st.stage3.equipment[c.actor].includes(card)&&options.cards.includes(card)):undefined):c.replacement;
  if(c.g&&(!options.allowed||options.required&&!replacement||['basic-063','basic-064'].includes(c.stage4?.copy??c.definition)&&boardWater(st,s.players[c.actor].cell,c.actor))){s.queue.unshift(task('cleanup',{serial:c.serial}));return true;}
  if(replacement&&st.stage3.equipment[c.actor].includes(replacement)){const g=gearSnapshot(s,c.actor,replacement);detach(st,c.actor,g,true);tasks.push(lossTask(c.actor,g));}
  tasks.push(task('equip-install',{serial:c.serial}));
 }
 s.queue.unshift(...tasks,task('cleanup',{serial:c.serial}));return true;
}
export function stage4GearLossChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean){
 const st=state(s),c=s.choice!,a=c.actor,g=c.data as GearSnapshot;if(timeout||!onBoard(s,a))return;
 if(cmd.accept&&g.definition==='basic-054')p.heal(s,a,2);
 else if(cmd.accept&&g.definition==='basic-059')p.heal(s,a,1);
 else if(cmd.cell&&g.definition==='basic-063'){need(c.cells?.includes(cmd.cell)&&boardEmptyEntry(st,a,cmd.cell,[a]),'山洞落点不合法');s.queue.unshift(...p.relocate(s,a,cmd.cell,true));}
 else if(cmd.target!==undefined&&g.definition==='basic-052'){need(c.targets?.includes(cmd.target)&&onBoard(s,cmd.target),'粉笔失去目标不合法');s.queue.unshift(...p.damage(s,[{target:cmd.target,amount:1,source:a,category:'response'}]));}
}
