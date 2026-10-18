import {discardCards} from './exercise';
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
export function combatGear(s:GameState,a:number,definition:string){return s.stage3!.equipment[a].find(card=>resources.equipmentDefinition(st(s),card)===definition&&roles.cardEffectAllowed(st(s),a,card,{...s.stage3!.equipmentSources[card],origin:'equipment'}));}
function source(s:GameState,a:number,card:string){return {...s.stage3!.equipmentSources[card],actor:a,faction:s.players[a].faction,origin:'equipment' as const};}
function permitted(s:GameState,a:number,target:number,card:string){return onBoard(s,target)&&roles.cardEffectAllowed(st(s),target,resources.equipmentDefinition(st(s),card),source(s,a,card));}
export function stage4CardRange(s:GameState,a:number,def:CardDefinition,cell:string):boolean {
 const map=mapForVersion(s.version),from=map.map[s.players[a].cell].region,to=map.map[cell].region;
 if(def.range==='global'||from===to)return true;
 const plus=Boolean(combatGear(s,a,'basic-058'));
 if((def.range==='adjacent'||plus)&&neighboringForVersion(s.version,from,to))return true;
 return plus&&def.range==='adjacent'&&Object.keys(map.regions).some(r=>neighboringForVersion(s.version,from,r)&&neighboringForVersion(s.version,r,to));
}
function cardAttack(s:GameState,h:CombatHit){const c=s.cardStack!.stack.at(-1);return c&&c.actor===h.source&&h.category==='attack'&&runtimeForVersion(s.version).cards[c.definition as import('../../game-data/src/index').CardId].type==='attack'?c:null;}
/** Returns null only when equipment fully prevents this hit. Caps are applied by
 * the shared damage function afterward; true damage only changes shield use. */
export function prepareStage4Hit(s:GameState,hit:CombatHit,environment:boolean,p:Stage3Ports):CombatHit|null {
 let h={...hit};const card=cardAttack(s,h);
 if(card&&!h.extra&&h.source!==null&&combatGear(s,h.source,'basic-053'))h.trueDamage=true;
 const guard=combatGear(s,h.target,'basic-070');
 if(guard&&!environment&&h.category==='attack'&&!h.directHp&&h.amount>0){
  const left=(s.stage4!.durability[guard]??2)-1;s.stage4!.durability[guard]=left;
  p.emit(s,'block',`S${h.target+1} 无一骑抵挡本次普通攻击，剩余${left}次`);
  if(left===0){s.stage3!.equipment[h.target]=s.stage3!.equipment[h.target].filter(c=>c!==guard);delete s.stage3!.equipmentSources[guard];delete s.stage4!.copies[guard];delete s.stage4!.durability[guard];discardCards(s,[guard]);p.emit(s,'break',`S${h.target+1} 无一骑损坏`);}
  return null;
 }
 // While it remains equipped, vampire cannot draw HP even through a true-hit
 // weapon. It does not consume a charge unless a normal hit was blocked above.
 if(guard&&card?.definition==='basic-006')return null;
 return h;
}
function mark(s:GameState,key:string){const marks=s.stage4!.gearMarks;if(marks[key])return false;marks[key]=true;return true;}
export function stage4AfterDamage(s:GameState,hits:(CombatHit&{loss:number})[],environment:boolean,p:Stage3Ports):Task[]{
 const jobs:Task[]=[],root=s.cardStack!.stack[0]?.serial??`batch${s.batch}`;
 for(const h of hits){
  const a=h.source,target=h.target;
  if(a!==null&&a!==target){
   for(const [owner,victim] of [[a,target],[target,a]]){if(!onBoard(s,owner)||!onBoard(s,victim))continue;const sugar=combatGear(s,owner,'basic-055');if(sugar&&permitted(s,owner,victim,sugar)&&mark(s,`${root}:sugar:${owner}:${victim}`)){
    const paid=Math.min(1,s.players[victim].ap);s.players[victim].ap-=paid;p.emit(s,'ap',`S${owner+1} 冰糖雪梨扣S${victim+1} ${paid}AP`);
   }}
  }
  if(onBoard(s,target)&&!environment&&!h.reflected&&a!==null&&a!==target&&onBoard(s,a)){const gear=combatGear(s,target,'basic-051');if(gear&&permitted(s,target,a,gear))jobs.push(task('gear-reflect',{actor:target,target:a,card:gear}));}
  if(a===null||a===target||!onBoard(s,a)||!onBoard(s,target))continue;
  const attack=cardAttack(s,h);
  if(attack&&!h.extra){
   const chalk=combatGear(s,a,'basic-052');if(chalk&&s.players[a].ap>=1&&permitted(s,a,target,chalk)&&mark(s,`${root}:chalk:${a}`))jobs.push(task('gear-chalk',{actor:a,target,card:chalk}));
   const tong=combatGear(s,a,'basic-062');if(tong&&permitted(s,a,target,tong)){s.stage4!.tongPending[target]=source(s,a,tong);p.emit(s,'buff',`S${target+1} 下个个人回合不能主动位移`);}
  }
  const plant=combatGear(s,a,'basic-061');if(plant&&permitted(s,a,target,plant)&&!h.extra&&mark(s,`${root}:plant:${a}:${target}`))jobs.push(task('gear-plant',{actor:a,target,card:plant}));
 }
 return jobs;
}
export function stage4CombatTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 const a=t.actor??s.active,target=t.target!;
 if(['gear-reflect','gear-chalk','gear-plant'].includes(t.action??'')){
  if(!onBoard(s,a)||!onBoard(s,target)||!s.stage3!.equipment[a].includes(t.card!)||!permitted(s,a,target,t.card!))return true;
  if(t.action==='gear-chalk'&&s.players[a].ap<1)return true;
  const cells=t.action==='gear-plant'?mapForVersion(s.version).cells.filter(c=>['云上学府','高唐农场'].includes(c.region)&&boardEmptyEntry(st(s),target,c.id,[target])).map(c=>c.id):undefined;
  if(t.action!=='gear-plant'||cells!.length)p.select(s,t.action as 'gear-reflect'|'gear-chalk'|'gear-plant',a,now,{source:target,data:{card:t.card},...(cells?{cells}:{})});return true;
 }
 if(t.action==='gear-cloak'){
  const c=stack.currentCard(st(s));if(c.cancelled.includes(target)||!onBoard(s,target)||!combatGear(s,target,'basic-049'))return true;
  p.select(s,'gear-cloak',target,now,{source:c.actor,data:{serial:c.serial}});return true;
 }
 if(t.action==='ball-hit'){
  const c=stack.currentCard(st(s));if(!c.cancelled.includes(target)&&onBoard(s,target)&&roles.cardEffectAllowed(st(s),target,c.definition,c.effect))s.queue.unshift(...p.damage(s,[{target,amount:(t.data as {amount:number}).amount,source:c.actor,category:'attack'}]));return true;
 }
 if(t.action!=='effect')return false;
 const c=stack.currentCard(st(s));if(c.definition!=='basic-009')return false;
 resources.recordCombo(st(s),c.actor,c.definition);
 const targets=c.targets.filter(a=>onBoard(s,a)&&!c.cancelled.includes(a)&&roles.cardEffectAllowed(st(s),a,c.definition,c.effect));
 const boosted=Boolean(combatGear(s,c.actor,'basic-056')),roll=targets.length&&!c.stage4?.dodge?p.die(s,'躲避球'):0;
 const hit=c.stage4?.dodge||Boolean(targets.length&&(boosted?roll<=5:roll>=4));
 const jobs:Task[]=[];if(hit)for(const target of s.order.filter(a=>targets.includes(a))){if(!boosted&&combatGear(s,target,'basic-049'))jobs.push(task('gear-cloak',{target,serial:c.serial}));jobs.push(task('ball-hit',{target,serial:c.serial,data:{amount:c.stage4?.dodge?2:1}}));}
 s.queue.unshift(...jobs,task('cleanup',{serial:c.serial}));return true;
}
export function stage4CombatChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean){
 const c=s.choice!,a=c.actor,target=c.source!;if(timeout||!onBoard(s,a))return;
 if(c.kind==='gear-cloak'){
  if(cmd.accept&&combatGear(s,a,'basic-049')&&p.die(s,'帝汶斗篷')%2===1){const card=stack.currentCard(st(s));card.cancelled.push(a);if(s.attack&&!s.attack.cancelled.includes(a))s.attack.cancelled.push(a);p.emit(s,'block',`S${a+1} 帝汶斗篷取消躲避球全部效果`);}return;
 }
 const card=(c.data as {card:string}).card;
 if(!s.stage3!.equipment[a].includes(card)||!onBoard(s,target)||!permitted(s,a,target,card))return;
 if(c.kind==='gear-plant'){
  if(cmd.cell){need(c.cells?.includes(cmd.cell)&&boardEmptyEntry(st(s),target,cmd.cell,[target]),'植物落点不合法');s.queue.unshift(...p.relocate(s,target,cmd.cell,false));}return;
 }
 if(!cmd.accept)return;
 if(c.kind==='gear-reflect'){
  const g=gearSnapshot(s,a,card),left=(s.stage4!.durability[card]??3)-1;s.stage4!.durability[card]=left;
  if(left===0){s.stage3!.equipment[a]=s.stage3!.equipment[a].filter(c=>c!==card);delete s.stage3!.equipmentSources[card];delete s.stage4!.copies[card];delete s.stage4!.durability[card];discardCards(s,[card]);p.emit(s,'break',`S${a+1} 正装损坏`);}
  s.queue.unshift(...p.damage(s,[{target,amount:1,source:a,category:'response',reflected:true}]));
 }else{need(s.players[a].ap>=1,'粉笔需要1AP');s.players[a].ap--;s.queue.unshift(...p.damage(s,[{target,amount:1,source:a,category:'response',extra:true}]));}
}
