import {hCooperateHeal,hCooperateHealth} from './p3-h-links';
import {hObserveHp} from './p3-h-state';
import {gCubeCanMove,gCubeInjury} from './p3-g-cube';
import {hasP3FRules,mapForVersion,runtimeForVersion,spawnCandidatesForVersion} from '../../game-data/src/index';
import {roleEffectAllowed} from './character-effects';
import {equipped,gainAp,resourceHealing} from './stage3-resources';
import type {ResourceState} from './stage3-resources';
import {boardWater,onBoard,boardEmptyEntry} from './stage4-board';
import type {BoardState} from './stage4-board';
import {nextInDirection,cardEffectAllowed} from './stage3-roles';
import {eRoot} from './p3-e';
import {discardCards} from './exercise';
import {integer} from './random';
import type {GameState,Task,Command,DamageHit} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {PendingCard} from './stage3-card-stack';
export const fEnabled=hasP3FRules;
type Injury=DamageHit&{loss:number};
export interface P3FState {firstDeath:boolean;wounds:number[];unlimitedCeil:(number|null)[];home:boolean[];executeUsed:boolean[];dry:Record<string,boolean>;entered:Record<string,boolean>;hitSerial:number;results:Record<string,Injury[]>}
export function fValid(s:GameState):boolean {
 if(!fEnabled(s.version))return true;const f=s.stage3?.f;if(!f||typeof f.firstDeath!=='boolean'||!Number.isSafeInteger(f.hitSerial)||f.hitSerial<0)return false;
 const four=(x:unknown,valid:(n:unknown)=>boolean)=>Array.isArray(x)&&x.length===4&&x.every(valid),number=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 return four(f.wounds,number)&&four(f.unlimitedCeil,n=>n===null||number(n))&&four(f.home,n=>typeof n==='boolean')&&four(f.executeUsed,n=>typeof n==='boolean')&&[f.dry,f.entered].every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.values(x).every(n=>typeof n==='boolean'))&&Boolean(f.results&&typeof f.results==='object'&&!Array.isArray(f.results));
}
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const state=(s:ResourceState)=>s.stage3.f!;
const rs=(s:GameState)=>s as GameState&ResourceState;
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
const effect=(a:number)=>({origin:'role-active' as const,actor:a,roleModifiers:[]});
const groupAllowed=(s:GameState,a:number,t:number)=>onBoard(s,t)&&!(s.players[t].character==='character-027'&&s.players[t].hand.length===1)&&roleEffectAllowed(effect(a),s.players[t]);
export const fUncapped=(s:Pick<ResourceState,'version'|'players'>,a:number)=>fEnabled(s.version)&&s.players[a].character==='character-019';
export const fRock=(s:Pick<ResourceState,'version'|'players'>,a:number)=>s.players[a].character==='character-037'||fEnabled(s.version)&&['character-051','character-052'].includes(s.players[a].character);
export function fTurnStart(s:ResourceState,a:number){if(!fEnabled(s.version))return;s.stage3.f??={firstDeath:false,wounds:[0,0,0,0],unlimitedCeil:[null,null,null,null],home:[false,false,false,false],executeUsed:[false,false,false,false],dry:{},entered:{},hitSerial:0,results:{}};const f=state(s);f.home.fill(false);f.executeUsed[a]=false;f.dry={};f.entered={};f.results={};}
export function fDeaths(s:GameState){if(fEnabled(s.version)&&s.players.some(p=>p.eliminated!==null)){const f=state(rs(s));f.firstDeath=true;f.wounds.fill(0);f.unlimitedCeil.fill(null);}}
export function fHealing(s:ResourceState,a:number,amount:number,food:boolean):number {
 const p=s.players[a];if(p.hp<=0||amount<=0||food&&p.character==='character-027')return 0;const f=state(s);
 const full=equipped(s,a,'basic-072');if(fUncapped(s,a)){const cap=f.unlimitedCeil[a]??Infinity;return Math.max(0,Math.min(full?2:amount,cap-p.hp));}
 const cap=Math.max(0,p.maxHp-f.wounds[a]);return Math.max(0,Math.min(full?cap-p.hp:amount,cap-p.hp));
}
export function fCastHeal(s:GameState,a:number,definition:string){if(!fUncapped(s,a)||!runtimeForVersion(s.version).cardTags[definition]?.includes('搏击操'))return;const amount=resourceHealing(rs(s),a,1);s.players[a].hp+=amount;hCooperateHeal(s,a,amount);s.events.push({seq:++s.eventSerial,type:'heal',text:`S${a+1} 搏击操爱好者回复${amount}生命`});}
export function fCanMove(s:ResourceState,a:number){if(!gCubeCanMove(s,a))return false;return !fEnabled(s.version)||s.players[a].character!=='character-007'||equipped(s,a,'basic-069');}
export function fPreviewMovement(s:BoardState,a:number,to:string):boolean {
 if(!fEnabled(s.version))return true;const full=s as ResourceState;if(!fCanMove(full,a))return false;
 return s.players[a].character!=='character-036'||!boardWater(s,s.players[a].cell,a)||boardWater(s,to,a)||state(full)?.dry[`${eRoot(s as GameState)}:${a}`]!==false;
}
export function fMovementGate(s:GameState,a:number,to:string,roll:()=>number,placement=false,root?:string):boolean {
 if(!fEnabled(s.version)||placement)return true;if(!fCanMove(rs(s),a))return false;
 if(s.players[a].character!=='character-036'||!boardWater(s,s.players[a].cell,a)||boardWater(s,to,a))return true;
 const key=`${root??eRoot(s)}:${a}`,f=state(rs(s));if(f.dry[key]===undefined)f.dry[key]=roll()===6;return f.dry[key];
}
export function fMoveDie(s:GameState,a:number,roll:number,root:string){if(fEnabled(s.version)&&s.players[a].character==='character-036')state(rs(s)).dry[`${root}:${a}`]=roll===6;}
export function fModifiers(s:GameState,hit:DamageHit):DamageHit|null {
 if(!fEnabled(s.version))return hit;const f=state(rs(s)),victim=s.players[hit.target];if(victim.character==='character-018'&&f.home[hit.target])return null;
 let h={...hit};if(h.source!==null&&s.players[h.source].character==='character-036'){
  if(!roleEffectAllowed({origin:'role-locked',actor:h.source,roleModifiers:[]},victim))return null;h={...h,trueDamage:true,jelly:true};
 }
 const c=s.cardStack?.stack.at(-1),origin=h.originCard??(c&&c.actor===h.source&&h.category==='attack'&&!h.extra&&!h.reflected?c.definition:undefined);
 if(victim.character==='character-018'&&origin&&runtimeForVersion(s.version).cardTags[origin]?.includes('帝汶'))h.amount++;
 return h;
}
interface DamageFrame {hits:DamageHit[];environment:boolean;suppressPursuit:boolean;token:number;index:number;injured:Injury[];batch?:number;prepared?:{hit:DamageHit;blocked:number;remaining:number}}
export function fDamage(s:GameState,hits:DamageHit[],environment=false,suppressPursuit=false):Task[]{return [task('f-damage',{data:{hits:structuredClone(hits),environment,suppressPursuit,token:++state(rs(s)).hitSerial,index:0,injured:[]} satisfies DamageFrame})];}
function applyHit(s:GameState,d:DamageFrame,h:DamageHit,blocked:number,amount:number,p:Stage3Ports){
 const victim=s.players[h.target],before=victim.hp,f=state(rs(s));let loss:number;
 if(h.jelly&&!fUncapped(s,h.target)){const result=resolveJellyTrueDamage(victim,amount);victim.hp=result.hp;victim.maxHp=result.maxHp;loss=result.hpLoss;}else{loss=Math.min(victim.hp,amount);victim.hp-=loss;}
 if(h.source!==null&&h.source!==h.target&&(s.mode==='ffa'||s.players[h.source].team!==victim.team)){s.players[h.source].damage+=loss;if(victim.hp===0&&loss>0)s.players[h.source].kills++;}
 p.emit(s,'damage',`S${h.target+1} ${d.environment?'环境':'普通'}伤害${h.amount}，护盾抵挡${blocked}，实际失血${loss}`,{...h,blocked,loss,batch:d.batch});
 hObserveHp(s);if(loss<=0)return;gCubeInjury(s,h,loss,p.emit);d.injured.push({...h,loss});
 if(!f.firstDeath&&h.source!==null&&s.players[h.source].character==='character-017'){f.wounds[h.target]+=loss;if(fUncapped(s,h.target))f.unlimitedCeil[h.target]=Math.min(f.unlimitedCeil[h.target]??before,before)-loss;}
 if(victim.hp>0&&victim.character==='character-018')f.home[h.target]=true;
 if(victim.hp>0&&victim.character==='character-032'){victim.maxHp+=loss;gainAp(rs(s),h.target,2*loss);p.emit(s,'skill',`S${h.target+1} 和气：上限+${loss}，获得${2*loss}AP`);}
}
function damageFrame(s:GameState,d:DamageFrame,now:number,p:Stage3Ports){
 if(d.batch===undefined)d.batch=++s.batch;
 for(;d.index<d.hits.length;d.index++){
  const original=d.hits[d.index];if(!onBoard(s,original.target)||original.amount<=0)continue;
  let h:DamageHit,blocked:number,remaining:number;
  if(d.prepared){({hit:h,blocked,remaining}=d.prepared);delete d.prepared;}
  else{
   const prepared=p.prepareDamage!(s,original,d.environment);if(!prepared)continue;
   h=!d.environment&&s.players[original.target].character==='character-037'||equipped(rs(s),original.target,'basic-059')?{...prepared,amount:Math.min(1,prepared.amount)}:prepared;
   if(h.amount<=0)continue;const victim=s.players[h.target];blocked=h.trueDamage?0:Math.min(victim.shield,h.amount);victim.shield-=blocked;remaining=h.amount-blocked;
   if(victim.character==='character-051'&&remaining>0&&victim.maxHp>1){d.prepared={hit:h,blocked,remaining};p.select(s,'f-tenacity',h.target,now,{count:Math.min(remaining,victim.hp,victim.maxHp-1),data:d});return;}
  }
  applyHit(s,d,h,blocked,remaining,p);
 }
 const c=s.cardStack?.stack.at(-1);if(c?.definition==='basic-006')state(rs(s)).results[d.token]=d.injured;
 const mirrors=d.injured.flatMap(h=>hCooperateHealth(s,h.target,h.loss,'damage'));s.queue.unshift(...mirrors,...p.completeDamage!(s,d.injured,d.environment,d.suppressPursuit));
}
export function fAfterDamage(s:GameState,hits:Injury[]):Task[]{return !fEnabled(s.version)?[]:hits.filter(h=>s.players[h.target].character==='character-018'&&onBoard(s,h.target)).map(h=>task('f-home',{actor:h.target,data:{root:`home${s.batch}`}}));}
export function fArrival(s:GameState,mover:number,from:string,to:string,root?:string):Task[]{
 if(!fEnabled(s.version)||from===to)return [];const map=mapForVersion(s.version).map,region=map[to].region,f=state(rs(s)),jobs:Task[]=[];
 root??=eRoot(s);for(const a of s.order){const owner=s.players[a];if(a===mover||!onBoard(s,a)||map[owner.cell].region!==region)continue;const action=owner.character==='character-032'&&map[from].region!==region?'f-bccb':owner.character==='character-036'?'f-sting':null;if(!action)continue;const key=`${root}:${a}:${mover}`;if(f.entered[key])continue;f.entered[key]=true;jobs.push(task(action,{actor:a,target:mover,data:{region,root}}));}return jobs;
}
export function fStartTasks(s:GameState,a:number):Task[]{return fEnabled(s.version)&&onBoard(s,a)&&s.players[a].character==='character-051'?[task('f-drift',{actor:a,data:{root:`turn${s.stage3!.turn}`}})]:[];}
export function fEndTasks(s:GameState):Task[]{
 if(!fEnabled(s.version))return [];const a=s.active,map=mapForVersion(s.version).map;
 return s.order.filter(t=>t!==a&&onBoard(s,t)&&s.players[t].character==='character-036'&&onBoard(s,a)&&map[s.players[t].cell].region===map[s.players[a].cell].region).map(actor=>task('f-sting',{actor,target:a,data:{root:`end${s.stage3!.turn}`,region:map[s.players[a].cell].region}}));
}
export function fTargetTasks(s:GameState,c:PendingCard):Task[]{
 if(!fEnabled(s.version)||c.fTargetsDone)return [];c.fTargetsDone=true;
 if(s.mode!=='team'||c.countered||c.responseTo!==null)return [];
 return s.order.filter(a=>a!==c.actor&&onBoard(s,a)&&s.players[a].character==='character-017'&&s.players[a].team===s.players[c.actor].team&&c.targets.includes(a)&&!c.cancelled.includes(a)&&cardEffectAllowed(rs(s),a,c.definition,c.effect)).map(actor=>task('f-self-harm',{actor,serial:c.serial}));
}
export function fExecuteTargets(s:GameState,a:number){const map=mapForVersion(s.version).map;return s.order.filter(t=>t!==a&&onBoard(s,t)&&s.players[t].hp<=2&&map[s.players[t].cell].region===map[s.players[a].cell].region&&roleEffectAllowed(effect(a),s.players[t]));}
export function fSkill(s:GameState,a:number,kind:'execute'|'magma',card:string|undefined,target:number|undefined,p:Stage3Ports){
 need(fEnabled(s.version)&&onBoard(s,a)&&s.players[a].character===(kind==='execute'?'character-007':'character-052'),'本角色不能发动此技能');
 if(kind==='magma'){need(s.players[a].ap>=2,'岩浆之力需要2AP');s.players[a].ap-=2;const region=mapForVersion(s.version).map[s.players[a].cell].region,targets=s.order.filter(t=>t!==a&&groupAllowed(s,a,t)&&mapForVersion(s.version).map[s.players[t].cell].region===region);s.queue.push(...p.damage(s,targets.map(target=>({target,amount:1,source:a,category:'response'}))),task('f-boundary'));p.emit(s,'skill',`S${a+1} 岩浆之力，支付2AP`);return;}
 const f=state(rs(s));need(!f.executeUsed[a]&&card&&s.players[a].hand.includes(card)&&target!==undefined&&fExecuteTargets(s,a).includes(target),'斩杀次数、手牌或目标不合法');f.executeUsed[a]=true;s.players[a].hand=s.players[a].hand.filter(c=>c!==card);discardCards(s,[card!]);
 if(p.die(s,'斩杀',a)%2){s.batch++;s.players[target!].hp=0;f.wounds[target!]=0;f.unlimitedCeil[target!]=null;s.stage3!.deathTurns[target!]=-1;if(s.mode==='ffa'||s.players[a].team!==s.players[target!].team)s.players[a].kills++;s.queue.push(...p.completeDamage!(s,[],false,false));s.stage3!.deathTurns[target!]=-1;p.emit(s,'skill',`S${a+1} 斩杀：S${target!+1} 直接淘汰，不能普通复活`);}else p.emit(s,'skill',`S${a+1} 斩杀偶数，无效果`);
 s.queue.push(task('f-boundary'));
}
export function fTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!fEnabled(s.version)||!t.action?.startsWith('f-'))return false;const a=t.actor??s.active,target=t.target!;
 if(t.action==='f-damage'){damageFrame(s,t.data as DamageFrame,now,p);return true;}
 if(t.action==='f-boundary'){if(!p.finish(s,false,now)&&!onBoard(s,s.active))s.queue.unshift({kind:'next'});return true;}
 if(t.action==='f-vampire'){const {token,targets}=t.data as {token:number;targets:number[]},results=state(rs(s)).results[token]??[];delete state(rs(s)).results[token];if(onBoard(s,a))p.heal(s,a,results.filter(h=>h.source===a&&targets.includes(h.target)).reduce((n,h)=>n+h.loss,0));return true;}
 if(t.action==='f-drift'){if(onBoard(s,a)){const cell=nextInDirection(s.players[a].cell,'right');if(cell&&boardEmptyEntry(rs(s),a,cell,[a]))s.queue.unshift(...p.relocate(s,a,cell,false,true,true,{actor:a,root:(t.data as {root:string}).root}));}return true;}
 if(t.action==='f-home'){if(onBoard(s,a)){const cells=spawnCandidatesForVersion(s.version,s.players[a].character).filter(cell=>boardEmptyEntry(rs(s),a,cell,[a]));if(cells.length)s.queue.unshift(...p.relocate(s,a,cells[integer(s.random,cells.length)],false,true,true,{actor:a,root:(t.data as {root:string}).root}));}return true;}
 if(t.action==='f-self-harm'){const c=s.cardStack?.stack.at(-1);if(onBoard(s,a)&&c&&c.serial===t.serial&&!c.countered&&!c.cancelled.includes(a))p.select(s,'f-self-harm',a,now,{data:{serial:t.serial}});return true;}
 if(t.action==='f-bccb'||t.action==='f-sting'){const region=(t.data as {region:string}).region;if(onBoard(s,a)&&onBoard(s,target)&&mapForVersion(s.version).map[s.players[a].cell].region===region&&mapForVersion(s.version).map[s.players[target].cell].region===region&&roleEffectAllowed(effect(a),s.players[target]))p.select(s,t.action,a,now,{source:target,data:t.data});return true;}
 if(t.action==='f-discard'){const count=(t.data as {count:number}).count;if(onBoard(s,target)&&roleEffectAllowed(effect(a),s.players[target])&&s.players[target].hand.length)p.select(s,'f-discard',target,now,{source:a,count:Math.min(count,s.players[target].hand.length),cards:[...s.players[target].hand]});return true;}
 throw Error('未知F批任务');
}
export function fChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean){
 const c=s.choice!,a=c.actor;
 if(c.kind==='f-tenacity'){const d=structuredClone(c.data) as DamageFrame,n=timeout?0:Number(cmd.option??'0');need(Number.isSafeInteger(n)&&n>=0&&n<=c.count!&&n<s.players[a].maxHp,'坚韧抵挡数量无效');s.players[a].maxHp-=n;s.players[a].hp=Math.min(s.players[a].hp,s.players[a].maxHp);d.prepared!.remaining-=n;p.emit(s,'skill',`S${a+1} 坚韧：消耗${n}上限抵挡${n}伤害`);s.queue.unshift(task('f-damage',{data:d}));return;}
 if(c.kind==='f-discard'){const cards=timeout?[...s.players[a].hand].sort().slice(0,c.count):cmd.cards??[];need(cards.length===c.count&&new Set(cards).size===cards.length&&cards.every(card=>c.cards?.includes(card)&&s.players[a].hand.includes(card)),'F技能弃牌不合法');s.players[a].hand=s.players[a].hand.filter(card=>!cards.includes(card));discardCards(s,cards);p.emit(s,'discard',`S${a+1} F技能弃置${cards.length}张`);return;}
 if(c.kind==='f-target'){const targets=s.order.filter(t=>t!==a&&onBoard(s,t)&&roleEffectAllowed(effect(a),s.players[t])),target=timeout?targets[0]:cmd.target;need(target!==undefined&&c.targets?.includes(target)&&targets.includes(target),'自虐伤害目标不合法');s.queue.unshift(...p.damage(s,[{target:target!,amount:1,source:a,category:'response'}]));return;}
 if(timeout||!cmd.accept||!onBoard(s,a))return;const roll=p.die(s,c.kind==='f-self-harm'?'自虐':c.kind==='f-bccb'?'bccb':'毒蜇',a);
 if(c.kind==='f-self-harm'){const pending=s.cardStack!.stack.at(-1)!;need(pending.serial===(c.data as {serial:number}).serial,'自虐卡牌已过期');if(roll<=2)return;if(!pending.cancelled.includes(a))pending.cancelled.push(a);if(roll<=5)s.queue.unshift(...s.order.filter(t=>t!==a&&s.players[t].team!==s.players[a].team&&groupAllowed(s,a,t)).map(target=>task('f-discard',{actor:a,target,data:{count:1}})));else{const targets=s.order.filter(t=>t!==a&&onBoard(s,t)&&roleEffectAllowed(effect(a),s.players[t]));if(targets.length)p.select(s,'f-target',a,now,{targets});}return;}
 const target=c.source!;if(!onBoard(s,target)||!roleEffectAllowed(effect(a),s.players[target]))return;
 if(c.kind==='f-sting'){if(roll<=3)s.queue.unshift(task('f-discard',{actor:a,target,data:{count:2}}));else if(roll<=5)s.queue.unshift(...p.damage(s,[{target,amount:2,source:a,category:'response'}]));return;}
 if(roll<=4){const hand=s.players[target].hand;for(let n=0;n<2&&hand.length;n++)s.players[a].hand.push(hand.splice(integer(s.random,hand.length),1)[0]);s.queue.unshift(...p.damage(s,[{target:a,amount:1,source:a,category:'response'}]));}else s.queue.unshift(...p.damage(s,[{target,amount:1,source:a,category:'response'},{target:a,amount:1,source:a,category:'response'}]));
}
export interface JellyHealth {hp:number;maxHp:number}
export interface JellyHealthResult extends JellyHealth {hpLoss:number;maxHpLoss:number;dead:boolean}
/** Receives the damage amount after existing immunity/equipment prevention.
 * The owner's ruling reduces HP and its finite maximum by the same amount;
 * A zero maximum is permanent elimination under the approved F rules. */
export function resolveJellyTrueDamage(before:JellyHealth,amount:number):JellyHealthResult {
 if(!before||![before.hp,before.maxHp,amount].every(n=>Number.isSafeInteger(n)&&n>=0)||before.hp>before.maxHp)throw Error('水母真伤生命输入无效');
 const maxHp=Math.max(0,before.maxHp-amount),hp=maxHp===0?0:Math.max(0,before.hp-amount);
 return {hp,maxHp,hpLoss:before.hp-hp,maxHpLoss:before.maxHp-maxHp,dead:hp===0||maxHp===0};
}
