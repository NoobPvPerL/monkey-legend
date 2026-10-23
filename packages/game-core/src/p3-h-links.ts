import {hEnabled,hState} from './p3-h-state';
import {hActiveAllowed} from './p3-h-active';
import {onBoard} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import type {GameState,Task,Command} from './types';
import type {ResourceState} from './stage3-resources';
import type {Stage3Ports} from './stage3-engine';
export interface HCooperation {
 used:boolean[];serial:number;muted:boolean;
 pending:{id:number;actor:number;target:number;cards:string[]}|null;
 links:{actor:number;target:number;untilEnd:number}[];
}
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
const task=(action:string,extra:Partial<Task>={}):Task=>({kind:'stage3',action,...extra});
export const initialHCooperation=():HCooperation=>({used:[false,false,false,false],serial:0,muted:false,pending:null,links:[]});
export function hCooperation(s:GameState):HCooperation {return hState(s).cooperation??=initialHCooperation();}
export function hCooperateAction(s:GameState,a:number){const targets=hCooperateTargets(s,a),used=s.stage3?.h?.cooperation?.used[a]??false;return {available:s.phase==='action'&&!s.choice&&s.active===a&&!used&&targets.length>0,used,targets};}
export function hCooperatePublic(s:GameState){const h=s.stage3!.h?.cooperation;return h?{used:h.used,links:h.links}:null;}
export function hCooperateSkill(s:GameState,a:number,target:number,cards:string[],now:number,p:Stage3Ports){const offer=hCooperateBegin(s,a,target,cards);p.emit(s,'skill',`S${a+1} 南南合作：与S${target+1}交换${offer.count}张手牌，等待对方选牌`);p.select(s,'h-cooperate',target,now,offer);}
export function hCooperateChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,p:Stage3Ports,timeout:boolean){if(!hEnabled(s.version)||s.choice?.kind!=='h-cooperate')return false;const result=hCooperateCommit(s,s.choice.actor,(s.choice.data as {id:number}).id,cmd.cards??[],timeout);p.emit(s,'transfer',`S${result.actor+1} 南南合作：与S${result.target+1}交换${result.count}张手牌，建立联系`);return true;}
export function hCooperateTargets(s:GameState,a:number):number[]{
 if(!hEnabled(s.version)||String(s.players[a].character)!=='character-030'||!onBoard(s,a)||!s.players[a].hand.length||!hActiveAllowed(s,a))return [];
 return s.order.filter(t=>t!==a&&onBoard(s,t)&&s.players[t].hand.length>0&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[t]));
}
/** Returns only the recipient's own selectable cards; sender selection stays private. */
export function hCooperateBegin(s:GameState,a:number,target:number,cards:readonly string[]){
 need(hEnabled(s.version),'南南合作仅限H版本');const h=hCooperation(s);
 need(s.phase==='action'&&!s.choice&&s.active===a&&!h.used[a]&&!h.pending&&hCooperateTargets(s,a).includes(target),'南南合作次数、角色或目标不合法');
 need(cards.length>0&&cards.length<=s.players[target].hand.length&&new Set(cards).size===cards.length&&cards.every(c=>s.players[a].hand.includes(c)),'请选择双方可等量交换的自己手牌');
 const id=++h.serial;h.used[a]=true;h.pending={id,actor:a,target,cards:[...cards]};
 return {source:a,count:cards.length,cards:[...s.players[target].hand],data:{id}};
}
/** Only the forced recipient commits; no sender card IDs are in their offer. */
export function hCooperateCommit(s:GameState,a:number,id:number,cards:readonly string[],timeout=false){
 const h=hCooperation(s),d=h.pending;need(d&&d.id===id&&d.target===a,'南南合作交换已失效');const pending=d!,n=pending.cards.length;
 const chosen=timeout?[...s.players[a].hand].sort().slice(0,n):[...cards];
 need(onBoard(s,pending.actor)&&onBoard(s,a)&&chosen.length===n&&new Set(chosen).size===n&&chosen.every(c=>s.players[a].hand.includes(c))&&pending.cards.every(c=>s.players[pending.actor].hand.includes(c)),'南南合作交换手牌已变化');
 const sender=s.players[pending.actor],recipient=s.players[a];sender.hand=sender.hand.filter(c=>!pending.cards.includes(c)).concat(chosen);recipient.hand=recipient.hand.filter(c=>!chosen.includes(c)).concat(pending.cards);
 h.links=h.links.filter(l=>l.actor!==pending.actor);h.links.push({actor:pending.actor,target:a,untilEnd:s.stage3!.ends[pending.actor]+2});h.pending=null;
 return {actor:pending.actor,target:a,count:n};
}
/** Capture actual per-hit loss/per-heal gain, excluding mirror descendants. */
export function hCooperateHealth(s:GameState,a:number,amount:number,kind:'heal'|'damage'):Task[]{
 if(!hEnabled(s.version)||amount<=0||!s.stage3!.h?.cooperation)return [];const h=hCooperation(s);if(h.muted)return [];
 const jobs:Task[]=[];
 for(const l of h.links){
  if(!onBoard(s,l.actor)||s.stage4?.offMap[l.target]||s.stage3!.ends[l.actor]>=l.untilEnd)continue;
  const target=l.target===a?l.actor:kind==='heal'&&l.actor===a?l.target:null;
  if(target===null||!onBoard(s,target))continue;
  jobs.push(task('h-link-mirror',{actor:l.actor,target,data:{amount,kind}}));
 }
 return jobs;
}
/** Preserve event order when one logical effect heals several recipients. */
export function hCooperateHeal(s:GameState,a:number,amount:number){const jobs=hCooperateHealth(s,a,amount,'heal');if(jobs.length){let i=0;while(s.queue[i]?.action==='h-link-mirror')i++;s.queue.splice(i,0,...jobs);}}
export function hCooperatePending(s:GameState){return hEnabled(s.version)&&Boolean(s.stage3?.h?.cooperation?.muted||s.queue.some(t=>t.action==='h-link-mirror'));}
/** A sentinel encloses the whole queued damage/reaction chain across choices. */
export function hCooperateTask(s:GameState,t:Task,p:Stage3Ports):boolean {
 if(!hEnabled(s.version)||!['h-link-mirror','h-link-done'].includes(t.action??''))return false;const h=hCooperation(s);
 if(t.action==='h-link-done'){h.muted=false;return true;}
 const a=t.actor!,target=t.target!,d=t.data as {amount:number;kind:'heal'|'damage'};
 if(!onBoard(s,a)||!onBoard(s,target)||!roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},s.players[target]))return true;
 need(!h.muted,'南南合作镜像不可递归');h.muted=true;s.queue.unshift(task('h-link-done'));
 p.emit(s,'skill',`S${a+1} 南南合作：向S${target+1}同步${d.kind==='heal'?'治疗':'失血'}${d.amount}`);
 if(d.kind==='heal')p.heal(s,target,d.amount);else s.queue.unshift(...p.damage(s,[{target,amount:d.amount,source:a,category:'response'}]));
 return true;
}
export function hCooperateStart(s:ResourceState|GameState,a:number){if(hEnabled(s.version)&&s.stage3?.h?.cooperation)s.stage3.h.cooperation.used[a]=false;}
export function hCooperateEnd(s:ResourceState|GameState){if(hEnabled(s.version)&&s.stage3?.h?.cooperation)s.stage3.h.cooperation.links=s.stage3.h.cooperation.links.filter(l=>s.stage3!.ends[l.actor]<l.untilEnd);}
export function hCooperateDeaths(s:GameState){if(hEnabled(s.version)&&s.stage3!.h?.cooperation)hCooperation(s).links=hCooperation(s).links.filter(l=>s.players[l.actor].hp>0&&s.players[l.target].hp>0);}
