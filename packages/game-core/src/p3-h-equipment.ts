import {hasP3HRules} from '../../game-data/src/index';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';

type GearSpace={version?:string;mode?:string;players:{seat:number;character:string;hp:number;team:string}[];stage3?:{equipment:string[][]}};
export function hSharesEquipment(s:GearSpace,a:number):boolean {
 return hasP3HRules(s.version)&&s.mode==='team'&&Boolean(s.players[a])&&s.players.some(q=>q.hp>0&&q.character==='character-050'&&q.team===s.players[a].team);
}
/** Read effects through a view; actual equipment zones and entity ownership stay physical. */
export function hEquipmentCards(s:GearSpace,a:number):string[]{
 const own=s.stage3?.equipment[a]??[];if(!hSharesEquipment(s,a))return own;
 return [...own,...s.players.filter(q=>q.seat!==a&&q.hp>0&&q.team===s.players[a].team).flatMap(q=>s.stage3!.equipment[q.seat])];
}
export function hEquipmentOwner(s:GearSpace,card:string):number|null {
 const owner=s.stage3?.equipment.findIndex(cards=>cards.includes(card));return owner===undefined||owner<0?null:owner;
}
export function hEquipmentSource(s:ResourceState,a:number,card:string):EquipmentSource {
 const source=s.stage3.equipmentSources[card];
 return hasP3HRules(s.version)&&hEquipmentOwner(s,card)!==a?{...source,actor:a,faction:s.players[a].faction}:source;
}
export function hEquipmentStarts(s:ResourceState,a:number,card:string):number {
 return s.stage3.starts[hasP3HRules(s.version)?hEquipmentOwner(s,card)??a:a];
}
type Watch={current:string|null;previous:string|null;usedTurn:number|null};
export function hEquipmentWatch(s:GameState,a:number,card:string):Watch|undefined {
 const base=s.stage4?.watches[card];if(!hasP3HRules(s.version)||hEquipmentOwner(s,card)===a)return base;
 const record=s.stage3?.h?.sharedWatches?.[card]?.[a];return record&&base?{...record,usedTurn:base.usedTurn}:undefined;
}
export function hEquipmentWatchStart(s:GameState,a:number){
 if(!hasP3HRules(s.version)||!s.stage3?.h||!hSharesEquipment(s,a))return;
 for(const card of hEquipmentCards(s,a))if(hEquipmentOwner(s,card)!==a&&(s.stage4?.copies[card]??card.split('#')[0])==='basic-060'){
  const h=s.stage3.h;h.sharedWatches??={};h.sharedWatches[card]??={};const old=h.sharedWatches[card][a];
  h.sharedWatches[card][a]={current:s.players[a].cell,previous:old?.current??null};
 }
}
export function hEquipmentForget(s:ResourceState,card:string){if(hasP3HRules(s.version)&&s.stage3.h?.sharedWatches)delete s.stage3.h.sharedWatches[card];}
/** Discontinuous sharing cannot reuse a start position from an older eligibility period. */
export function hEquipmentPruneWatches(s:ResourceState){
 const watches=s.stage3.h?.sharedWatches;if(!hasP3HRules(s.version)||!watches)return;
 for(const [card,users] of Object.entries(watches)){for(const key of Object.keys(users)){const a=Number(key);if(!hEquipmentCards(s,a).includes(card)||hEquipmentOwner(s,card)===a)delete users[a];}if(!Object.keys(users).length)delete watches[card];}
}
export function hEquipmentPublic(s:GameState){
 if(!hasP3HRules(s.version)||!s.players.some(q=>String(q.character)==='character-050'))return {};
 return {sharedEquipment:s.players.map(q=>hEquipmentCards(s,q.seat).filter(card=>hEquipmentOwner(s,card)!==q.seat).map(card=>({card,owner:hEquipmentOwner(s,card)!,definition:s.stage4?.copies[card]??card.split('#')[0],
  ...(s.stage4?.durability[card]!==undefined?{durability:s.stage4.durability[card]}:{}),
  ...((s.stage4?.copies[card]??card.split('#')[0])==='basic-054'?{breadRemaining:Math.max(0,(s.stage3!.g!.gearBreadReadyAt[card]??0)-hEquipmentStarts(s as ResourceState,q.seat,card))}:{})}))) };
}
export function hEquipmentInstallTasks(s:GameState,a:number):Task[]{
 return hasP3HRules(s.version)&&String(s.players[a].character)==='character-050'&&s.players[a].hp>0?[{kind:'stage3',action:'h-equip-draw',actor:a}]:[];
}
export function hEquipmentTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!hasP3HRules(s.version)||t.action!=='h-equip-draw')return false;
 const a=t.actor!;if(s.players[a].hp>0&&!s.stage4?.offMap[a]&&String(s.players[a].character)==='character-050')p.select(s,'h-equip-draw',a,now);return true;
}
export function hEquipmentChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean {
 if(!hasP3HRules(s.version)||s.choice?.kind!=='h-equip-draw')return false;
 const a=s.choice.actor;if(!timeout&&cmd.accept&&s.players[a].hp>0&&!s.stage4?.offMap[a]){p.draw(s,a,1);p.emit(s,'skill',`S${a+1} 装备哥：成功安装后摸1`);}return true;
}
