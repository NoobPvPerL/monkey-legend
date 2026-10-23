import {hEquipmentCards,hEquipmentSource,hEquipmentOwner,hEquipmentForget} from './p3-h-equipment';
import {gCubeBoost} from './p3-g-cube';
import {fModifiers} from './p3-f';
import {gEnabled} from './p3-g-state';
import {hasP3DRules} from '../../game-data/src/index';
import {dBallAllowed} from './p3-d';
import {dPay} from './p3-d';
import {featherActive} from './p3-c';
import {discardCards} from './exercise';
import {prepareP3Hit} from './p3-characters';
import {hasP3Characters} from '../../game-data/src/index';
import {mapForVersion,neighboringForVersion,runtimeForVersion} from '../../game-data/src/index';
import type {CardDefinition} from '../../game-data/src/legacy';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import * as stack from './stage3-card-stack';
import {boardEmptyEntry,onBoard} from './stage4-board';
import {gearSnapshot} from './stage4-equipment';
type State=GameState&resources.ResourceState&stack.CardStackState&{stage4:NonNullable<GameState['stage4']>};
export type CombatHit=Parameters<Stage3Ports['damage']>[1][number];
const st=(s:GameState)=>s as State;
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const id=(card:string)=>card.split('#')[0];
export function combatGears(s:GameState,a:number,definition:string){const cards=hEquipmentCards(s,a).filter(card=>resources.equipmentDefinition(st(s),card)===definition&&roles.cardEffectAllowed(st(s),a,card,{...hEquipmentSource(st(s),a,card),origin:'equipment'}));return gEnabled(s.version)?cards:cards.slice(0,1);}
export function combatGear(s:GameState,a:number,definition:string){return combatGears(s,a,definition)[0];}
function source(s:GameState,a:number,card:string){return {...s.stage3!.equipmentSources[card],actor:a,faction:s.players[a].faction,origin:'equipment' as const};}
function permitted(s:GameState,a:number,target:number,card:string){return onBoard(s,target)&&roles.cardEffectAllowed(st(s),target,resources.equipmentDefinition(st(s),card),source(s,a,card));}
export function stage4CardRange(s:GameState,a:number,def:CardDefinition,cell:string):boolean {
 if(featherActive(st(s),a)&&def.type==='attack')return true;
 const map=mapForVersion(s.version),from=map.map[s.players[a].cell].region,to=map.map[cell].region;
 if(def.range==='global'||from===to)return true;
 const bonuses=combatGears(s,a,'basic-058').length,plus=Boolean(bonuses);
 if(gEnabled(s.version)&&bonuses){let reached=new Set([from]);for(let i=0;i<bonuses+(def.range==='adjacent'?1:0);i++){const next=new Set(reached);for(const r of Object.keys(map.regions))if([...reached].some(old=>neighboringForVersion(s.version,old,r)))next.add(r);reached=next;}return reached.has(to);}
 if((def.range==='adjacent'||plus)&&neighboringForVersion(s.version,from,to))return true;
 return plus&&def.range==='adjacent'&&Object.keys(map.regions).some(r=>neighboringForVersion(s.version,from,r)&&neighboringForVersion(s.version,r,to));
}
function cardAttack(s:GameState,h:CombatHit){const c=s.cardStack!.stack.at(-1);return c&&c.actor===h.source&&h.category==='attack'&&runtimeForVersion(s.version).cards[c.definition as import('../../game-data/src/index').CardId].type==='attack'?c:null;}
/** Returns null only when equipment fully prevents this hit. Caps are applied by
 * the shared damage function afterward; true damage only changes shield use. */
export function prepareStage4Hit(s:GameState,hit:CombatHit,environment:boolean,p:Stage3Ports):CombatHit|null {
 const prepared=prepareP3Hit(s,hit,environment,p.emit);if(!prepared)return null;const f=fModifiers(s,prepared);if(!f)return null;let h={...f};const card=cardAttack(s,h);
 if(hasP3DRules(s.version)&&s.players[h.target].character==='character-029'&&card?.definition==='basic-009')return null;
 if(card&&!h.extra&&h.source!==null&&combatGear(s,h.source,'basic-053'))h.trueDamage=true;
 const guard=combatGear(s,h.target,'basic-070');
 if(guard&&!environment&&h.category==='attack'&&!h.directHp&&h.amount>0){
  const left=(s.stage4!.durability[guard]??2)-1;s.stage4!.durability[guard]=left;
  p.emit(s,'block',`S${h.target+1} 无一骑抵挡本次普通攻击，剩余${left}次`);
  if(left===0){const owner=hEquipmentOwner(s,guard)!;s.stage3!.equipment[owner]=s.stage3!.equipment[owner].filter(c=>c!==guard);hEquipmentForget(st(s),guard);delete s.stage3!.equipmentSources[guard];delete s.stage4!.copies[guard];delete s.stage4!.durability[guard];discardCards(s,[guard]);p.emit(s,'break',`S${h.target+1} 无一骑损坏`);}
  return null;
 }
 // While it remains equipped, vampire cannot draw HP even through a true-hit
 // weapon. It does not consume a charge unless a normal hit was blocked above.
 if(guard&&card?.definition==='basic-006')return null;
 return gCubeBoost(s,h,p.emit);
}
function mark(s:GameState,key:string){const marks=s.stage4!.gearMarks;if(marks[key])return false;marks[key]=true;return true;}
function itemMark(s:GameState,key:string,card:string){return mark(s,gEnabled(s.version)?`${key}:${card}`:key);}
export function stage4AfterDamage(s:GameState,hits:(CombatHit&{loss:number})[],environment:boolean,p:Stage3Ports):Task[]{
 const jobs:Task[]=[],root=s.cardStack!.stack[0]?.serial??`batch${s.batch}`;
 for(const h of hits){
  const a=h.source,target=h.target;
  if(a!==null&&a!==target){
   for(const [owner,victim] of [[a,target],[target,a]]){if(!onBoard(s,owner)||!onBoard(s,victim))continue;for(const sugar of combatGears(s,owner,'basic-055'))if(permitted(s,owner,victim,sugar)&&itemMark(s,`${root}:sugar:${owner}:${victim}`,sugar)){
    const paid=Math.min(1,s.players[victim].ap);s.players[victim].ap-=paid;p.emit(s,'ap',`S${owner+1} 冰糖雪梨扣S${victim+1} ${paid}AP`);
   }}
  }
  if(onBoard(s,target)&&!environment&&!h.reflected&&a!==null&&a!==target&&onBoard(s,a))for(const gear of combatGears(s,target,'basic-051'))if(permitted(s,target,a,gear))jobs.push(task('gear-reflect',{actor:target,target:a,card:gear}));
  if(a===null||a===target||!onBoard(s,a)||!onBoard(s,target))continue;
  const attack=cardAttack(s,h);
  if(attack&&!h.extra){
   for(const chalk of combatGears(s,a,'basic-052'))if(s.players[a].ap>=1&&permitted(s,a,target,chalk)&&itemMark(s,`${root}:chalk:${a}`,chalk))jobs.push(task('gear-chalk',{actor:a,target,card:chalk}));
   for(const tong of combatGears(s,a,'basic-062'))if(permitted(s,a,target,tong)){s.stage4!.tongPending[target]=source(s,a,tong);p.emit(s,'buff',`S${target+1} 下个个人回合不能主动位移`);}
  }
  for(const plant of combatGears(s,a,'basic-061'))if(permitted(s,a,target,plant)&&!h.extra&&itemMark(s,`${root}:plant:${a}:${target}`,plant))jobs.push(task('gear-plant',{actor:a,target,card:plant}));
 }
 return jobs;
}
export function stage4CombatTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 const a=t.actor??s.active,target=t.target!;
 if(['gear-reflect','gear-chalk','gear-plant'].includes(t.action??'')){
  if(!onBoard(s,a)||!onBoard(s,target)||!hEquipmentCards(s,a).includes(t.card!)||!permitted(s,a,target,t.card!))return true;
  if(t.action==='gear-chalk'&&s.players[a].ap<1)return true;
  const cells=t.action==='gear-plant'?mapForVersion(s.version).cells.filter(c=>['云上学府','高唐农场'].includes(c.region)&&boardEmptyEntry(st(s),target,c.id,[target])).map(c=>c.id):undefined;
  if(t.action!=='gear-plant'||cells!.length)p.select(s,t.action as 'gear-reflect'|'gear-chalk'|'gear-plant',a,now,{source:target,data:{card:t.card},...(cells?{cells}:{})});return true;
 }
 if(t.action==='gear-cloak'){
  const c=stack.currentCard(st(s));if(c.cancelled.includes(target)||!onBoard(s,target)||!(t.card?combatGears(s,target,'basic-049').includes(t.card):combatGear(s,target,'basic-049')))return true;
  p.select(s,'gear-cloak',target,now,{source:c.actor,data:{serial:c.serial,...(t.card?{card:t.card}:{})}});return true;
 }
 if(t.action==='ball-hit'){
  const c=stack.currentCard(st(s));if(!c.cancelled.includes(target)&&onBoard(s,target)&&roles.cardEffectAllowed(st(s),target,c.definition,c.effect))s.queue.unshift(...p.damage(s,[{target,amount:(t.data as {amount:number}).amount,source:c.actor,category:'attack'}]));return true;
 }
 if(t.action!=='effect')return false;
 const c=stack.currentCard(st(s));if(c.definition!=='basic-009')return false;
 resources.recordCombo(st(s),c.actor,c.definition);
 const targets=c.targets.filter(a=>onBoard(s,a)&&!c.cancelled.includes(a)&&roles.cardEffectAllowed(st(s),a,c.definition,c.effect)&&dBallAllowed(s,c.actor,a,c.effect.origin==='role-active'));
 const direct=hasP3DRules(s.version)&&s.players[c.actor].character==='character-029',boosted=Boolean(combatGear(s,c.actor,'basic-056')),roll=targets.length&&!c.stage4?.dodge&&!direct?p.die(s,'躲避球',c.actor):0;
 const hit=c.stage4?.dodge||direct||Boolean(targets.length&&(boosted?roll<=5:roll>=4));
 const jobs:Task[]=[];if(hit)for(const target of s.order.filter(a=>targets.includes(a))){if(!boosted)for(const card of combatGears(s,target,'basic-049'))jobs.push(task('gear-cloak',{target,serial:c.serial,...(gEnabled(s.version)?{card}:{})}));jobs.push(task('ball-hit',{target,serial:c.serial,data:{amount:c.stage4?.dodge?2:1}}));}
 s.queue.unshift(...jobs,task('cleanup',{serial:c.serial}));return true;
}
export function stage4CombatChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean){
 const c=s.choice!,a=c.actor,target=c.source!;if(timeout||!onBoard(s,a))return;
 if(c.kind==='gear-cloak'){
  const piece=(c.data as {card?:string}).card;if(cmd.accept&&(piece?combatGears(s,a,'basic-049').includes(piece):combatGear(s,a,'basic-049'))&&p.die(s,'帝汶斗篷',a)%2===1){const card=stack.currentCard(st(s));card.cancelled.push(a);if(s.attack&&!s.attack.cancelled.includes(a))s.attack.cancelled.push(a);p.emit(s,'block',`S${a+1} 帝汶斗篷取消躲避球全部效果`);}return;
 }
 const card=(c.data as {card:string}).card;
 if(!hEquipmentCards(s,a).includes(card)||!onBoard(s,target)||!permitted(s,a,target,card))return;
 if(c.kind==='gear-plant'){
  if(cmd.cell){need(c.cells?.includes(cmd.cell)&&boardEmptyEntry(st(s),target,cmd.cell,[target]),'植物落点不合法');s.queue.unshift(...p.relocate(s,target,cmd.cell,false));}return;
 }
 if(!cmd.accept)return;
 if(c.kind==='gear-reflect'){
  const owner=hEquipmentOwner(s,card)!,g=gearSnapshot(s,owner,card),left=(s.stage4!.durability[card]??3)-1;s.stage4!.durability[card]=left;
  if(left===0){s.stage3!.equipment[owner]=s.stage3!.equipment[owner].filter(c=>c!==card);hEquipmentForget(st(s),card);delete s.stage3!.equipmentSources[card];delete s.stage4!.copies[card];delete s.stage4!.durability[card];discardCards(s,[card]);p.emit(s,'break',`S${a+1} 正装损坏`);}
  s.queue.unshift(...p.damage(s,[{target,amount:1,source:a,category:'response',reflected:true,...(hasP3Characters(s.version)?{originCard:card}:{} )}]));
 }else{need(s.players[a].ap>=1,'粉笔需要1AP');dPay(s,a,1);s.queue.unshift(...p.damage(s,[{target,amount:1,source:a,category:'response',extra:true,...(hasP3Characters(s.version)?{originCard:card}:{} )}]));}
}
