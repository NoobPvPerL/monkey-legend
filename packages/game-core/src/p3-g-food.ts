import {hActiveAllowed} from './p3-h-active';
import {runtimeForVersion} from '../../game-data/src/index';
import {gEnabled} from './p3-g-state';
import {onBoard} from './stage4-board';
import {terrainEffect} from './stage4-terrain';
import {roleEffectAllowed} from './character-effects';
import {cardEffectAllowed} from './stage3-roles';
import {recordCombo} from './stage3-resources';
import {cMarkFood} from './p3-c';
import {dPay} from './p3-d';
import {fUncapped} from './p3-f';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import type {GameState,Task,Command} from './types';
import type {PendingCard} from './stage3-card-stack';
import type {Stage3Ports} from './stage3-engine';
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const st=(s:GameState)=>s as GameState&ResourceState;
export function gFoodOriginalAllowed(s:GameState,c:PendingCard,target:number):boolean {
 if(c.countered||!onBoard(s,target))return false;
 // Aloe's counter remains the caster's effect; its self-heal is the transferable portion.
 if(c.definition==='basic-038')return Boolean(c.stage4?.counterEffective);
 return !c.cancelled.includes(target)&&cardEffectAllowed(st(s),target,c.definition,c.effect)&&!c.stage4?.officeExempt?.includes(target);
}
export function gFoodThief(s:GameState,c:PendingCard,target:number):number|undefined {
 if(!gEnabled(s.version)||!gFoodOriginalAllowed(s,c,target))return;
 return s.order.find(a=>a!==c.actor&&hActiveAllowed(s,a)&&onBoard(s,a)&&s.players[a].character==='character-021'&&s.players[a].ap>=2&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[target]));
}
export function gFoodPortions(c:PendingCard,targets:number[]):Task[]{return targets.map(target=>task('g-food-portion',{serial:c.serial,target}));}
function applyFood(s:GameState,c:PendingCard,target:number,thief:number|undefined,p:Stage3Ports){
 const effect:EquipmentSource=thief===undefined?c.effect:{...c.effect,roleModifiers:[...c.effect.roleModifiers,{actor:thief,kind:'active'}]};
 if(!onBoard(s,target)||thief!==undefined&&(!cardEffectAllowed(st(s),target,c.definition,effect)||!terrainEffect(s,target,c.definition)))return;
 cMarkFood(s,c,[target]);
 if(c.definition==='basic-048'){
  if(p.die(s,'油泼',c.actor)===6)s.queue.unshift(...p.damage(s,[{target,amount:1,source:c.actor,category:'attack'}]));
  else p.heal(s,target,fUncapped(st(s),target)?2:s.players[target].maxHp-s.players[target].hp,true);
  return;
 }
 p.heal(s,target,c.definition==='basic-046'?2:c.definition==='basic-040'&&s.players[target].character==='character-040'?s.players[target].maxHp-s.players[target].hp:1,true);
 if(c.definition==='basic-045')s.players[target].shield+=Math.min(1,2-s.players[target].shield);
 if(c.definition==='basic-047')p.draw(s,target,2);
 for(const [definition,buff] of [['basic-042','tea'],['basic-043','dodge'],['basic-044','exerciseFree']] as const)if(c.definition===definition){s.stage4![buff][target]=true;s.stage4!.buffSources[`${target}:${buff}`]=structuredClone(effect);if(buff==='exerciseFree')s.stage4!.exerciseGuard[target]=true;}
}
export function gFoodTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!gEnabled(s.version))return false;const c=s.cardStack!.stack.at(-1);
 if(!c||t.serial!==undefined&&t.serial!==c.serial)return false;
 if(t.action==='effect'&&c.responseTo===null&&runtimeForVersion(s.version).cards[c.definition as keyof ReturnType<typeof runtimeForVersion>['cards']].type==='food'){
  recordCombo(st(s),c.actor,c.definition);const targets=s.order.filter(a=>c.targets.includes(a)&&gFoodOriginalAllowed(s,c,a));
  s.queue.unshift(...gFoodPortions(c,targets),task('g-food-finish',{serial:c.serial}),task('cleanup',{serial:c.serial}));return true;
 }
 if(t.action==='g-food-finish'){p.emit(s,'effect',runtimeForVersion(s.version).cards[c.definition as keyof ReturnType<typeof runtimeForVersion>['cards']].name+'结算');return true;}
 if(t.action==='g-food-portion'){
  const target=t.target!;if(!gFoodOriginalAllowed(s,c,target))return true;const thief=gFoodThief(s,c,target);
  if(thief!==undefined)p.select(s,'g-food',thief,now,{source:target,data:{serial:c.serial,original:target}});
  else s.queue.unshift(task('g-food-apply',{serial:c.serial,target,data:{recipient:target}}));return true;
 }
 if(t.action==='g-food-apply'){
  if(gFoodOriginalAllowed(s,c,t.target!)){const {recipient,thief}=t.data as {recipient:number;thief?:number};applyFood(s,c,recipient,thief,p);}return true;
 }
 return false;
}
export function gFoodChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean {
 if(!gEnabled(s.version)||s.choice?.kind!=='g-food')return false;
 const choice=s.choice,c=s.cardStack!.stack.at(-1),a=choice.actor,data=choice.data as {serial:number;original:number};
 need(c&&c.serial===data.serial,'过境食物已失效');let recipient=data.original,thief:number|undefined;
 if(!timeout&&cmd.accept){need(gFoodThief(s,c!,data.original)===a,'过境受益者、费用或资格已失效');dPay(s,a,2);recipient=a;thief=a;p.emit(s,'skill',`S${a+1} 过境支付2AP，取得S${data.original+1}的一份食物效果`);}
 s.queue.unshift(task('g-food-apply',{serial:c!.serial,target:data.original,data:{recipient,...(thief===undefined?{}:{thief})}}));return true;
}
