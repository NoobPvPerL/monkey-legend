import {stage4PublicState} from './stage4-view';
import {ignoreLocation,terrainMoveCost,terrainDraw,terrainAp,terrainHealing,terrainCard,terrainEffect,terrainStops,terrainThrough} from './stage4-terrain';
import {landingPush,reactiveInjury,stage4MovementChoose} from './stage4-movement';
import {combatGear} from './stage4-combat';
import {stage4EquipmentSkill} from './stage4-actions';
import {prepareStage4Hit,stage4AfterDamage,stage4CombatChoose} from './stage4-combat';
import {stage4GearLossChoose} from './stage4-equipment';
import {reserveStage4Interrupt,beginStage4Interrupt,discardStage4Interrupts} from './stage4-interrupt';
import {onBoard,boardSingleProtected,currentDesert} from './stage4-board';
import {boardArrivalTasks,boardReturn,isBoardChoice,stage4MapChoose} from './stage4-map-engine';
import {cardForVersion,RULE_VERSION,definitionId,validateData,hasInteractionRules,unlimitedAttacks,runtimeForVersion,mapForVersion,isActiveRuleVersion,distanceForVersion,neighboringForVersion,safeCellsForVersion,bombCandidatesForVersion,poisonDamageForVersion,hasClassicPatch,hasStage3,hasStage4} from '../../game-data/src/index';
import type {CardId} from '../../game-data/src/index';
import type {Attack,ChoiceKind,Command,DispatchResult,GameState,Player,RandomState,Ranking,Setup,Task} from './types';
export type * from './types';
import {isClassic,initialClassic,refreshClassicRound,classicEnvironmentHits,relocated,owesWater,water,stepCost,enterAllowed,caveEnding} from './classic';
import {fixedSpawnLayout} from './spawn';
import {locationDestinations} from './locations';
import {integer,shuffled} from './random';
import {basicMoveCost,normalDrawCount,personalStartAp,foodHealing,locationCardAllowed,locationEffectAllowed,stopsWalking,canWalkThrough} from './locations';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import {initialCardStack} from './stage3-card-stack';
import {roleEffectAllowed} from './character-effects';
import {stage4CounterChoose} from './stage4-counter';
import {initialStage4State} from './stage4-state';
import {stage4TurnStart,stage4Quote,stage4Play,stage4Task} from './stage4-engine';
import {stage3Play,stage3Skill,stage3Task,stage3Choose,stage3Overflow,stage3AttackTargets} from './stage3-engine';
import type {Stage3Ports} from './stage3-engine';
const resourceState=(s:GameState)=>s as GameState&resources.ResourceState;
const fail = (message:string):never => { throw Error(message); };
const requireRule = (condition:unknown,message:string):void => { if(!condition) fail(message); };
const alive = (p:Player) => p.hp>0;
const enemy = (s:GameState,a:number,b:number) => a!==b&&(s.mode==='ffa'||s.players[a].team!==s.players[b].team);
const emit = (s:GameState,type:string,text:string,data?:unknown) => { s.events.push({seq:++s.eventSerial,type,text,data}); };
const name = (s:GameState,id:number) => `S${id+1} ${runtimeForVersion(s.version).characters[s.players[id].character].name}`;
const sameSet = (a:unknown[],b:unknown[]) => a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]);
function die(s:GameState,reason:string):number { const v=s.random.dice.length?s.random.dice.shift()!:integer(s.random,6)+1; requireRule(Number.isInteger(v)&&v>=1&&v<=6,'测试骰子必须1—6'); emit(s,'dice',`${reason}：d6 = ${v}`,v); return v; }
export const handLimit = (hp:number) => Math.max(0,Math.floor(hp));
export function budget(s:GameState,now:number):number { return Math.max(0,s.clock.remaining-(s.clock.since===null?0:Math.max(0,now-s.clock.since))); }
function pause(s:GameState,now:number):void { s.clock.remaining=budget(s,now); s.clock.since=null; }
function resume(s:GameState,now:number):void { if(s.clock.since===null) s.clock.since=now; }
function draw(s:GameState,actor:number,count:number):void {
 const p=s.players[actor]; if(!alive(p))return;
 let actual=0;
 for(let i=0;i<count;i++){
  if(!s.deck.length&&s.discard.length){
   const supplied=s.random.reshuffles.shift();
   if(supplied){requireRule(sameSet(supplied,s.discard),'注入重洗不是弃牌的完整排列');s.deck=[...supplied];}
   else s.deck=s.random.sortedReshuffles?[...s.discard].sort():shuffled(s.random,s.discard);
   s.discard=[];s.reshuffleCount++;emit(s,'shuffle','抽牌堆空：将弃牌重洗（结算区保留）');
  }
  if(!s.deck.length)break;
  p.hand.push(s.deck.shift()!); actual++;
 }
 emit(s,'draw',`${name(s,actor)} 摸${actual}张`,{actor,count:actual});
}
function heal(s:GameState,actor:number,amount:number,food=false):void {
 const p=s.players[actor]; const previous=p.hp;
 if(alive(p)&&(!hasStage4(s.version)||onBoard(s,actor))){const actual=food?terrainHealing(s,actor,amount):Math.min(p.maxHp-p.hp,amount);p.hp+=hasStage3(s.version)?resources.resourceHealing(resourceState(s),actor,actual,food):actual;}
 emit(s,'heal',`${name(s,actor)} 回复${p.hp-previous}生命`);
}
export function teleportCells(s:GameState,actor:number):string[] {
 const p=s.players[actor]; if(hasStage3(s.version)&&resources.mountMovementBlocked(resourceState(s),actor))return [];return mapForVersion(s.version).cells.filter(c=>(hasStage4(s.version)?!water(s,c.id,actor)&&resources.canEnterWithMount(resourceState(s),actor,c.id):c.terrain==='land')&&enterAllowed(s,c.id)&&distanceForVersion(s.version,p.cell,c.id)<=3&&!s.players.some(o=>onBoard(s,o.seat)&&o.cell===c.id)).map(c=>c.id);
}
function stage3Relocate(s:GameState,actor:number,cell:string,voluntary:boolean,carry=true,reactive=true):Task[]{
 const p=s.players[actor],from=p.cell;if(from===cell||voluntary&&resources.mountMovementBlocked(resourceState(s),actor))return [];
 const snapshots=carry?roles.carryCandidates(resourceState(s),actor,from):[];
 relocated(s,actor,from,cell);p.cell=cell;if(voluntary)s.stage3!.voluntaryMoved[actor]=true;
 emit(s,'move',`${name(s,actor)} → ${cell}`);
 const tasks:Task[]=[];if(owesWater(s,actor,from))tasks.push({kind:'water',actor,data:{entry:true}});
 if(hasStage4(s.version))tasks.push(...boardArrivalTasks(s,actor,from,cell,reactive),...(voluntary&&reactive?landingPush(s,actor):[]));
 if(snapshots.length)tasks.push({kind:'stage3',action:'carry',actor,data:snapshots});return tasks;
}
function stepDirection(s:GameState,from:string,to:string):roles.Direction {
 const map=mapForVersion(s.version).map,a=map[from],b=map[to];return a.row===b.row?b.col>a.col?'right':'left':b.row>a.row?'down':'up';
}
function applyCollision(s:GameState,cell:string):Task[]{
 const p=s.players[s.active],target=s.players.find(q=>q.hp>0&&q.seat!==p.seat&&q.cell===cell);if(!target||p.character!=='character-045')return [];
 const path=roles.collisionPath({...resourceState(s),farmClosed:s.classic!.farmClosed},p.seat,target.seat,stepDirection(s,p.cell,cell));requireRule(path.length>0,'角色或地形阻挡冲撞');
 const carry=roles.carryCandidates(resourceState(s),target.seat,target.cell),tasks:Task[]=[];
 for(const to of path)tasks.push(...stage3Relocate(s,target.seat,to,false,false));if(carry.length)tasks.push({kind:'stage3',action:'carry',actor:target.seat,data:carry});return tasks;
}
function select(s:GameState,kind:ChoiceKind,actor:number,now:number,extra:Partial<NonNullable<GameState['choice']>>={}):void {
 const paused=kind!=='draw-start'&&kind!=='draw-end';
 if(paused)pause(s,now);else resume(s,now);
 const window=kind==='discard'&&hasInteractionRules(s.version)?20000:10000;
 s.phase='choice'; s.choice={id:++s.choiceSerial,kind,actor,deadline:now+Math.min(window,paused?window:budget(s,now)),paused,...extra};
 emit(s,'choice',`${name(s,actor)} 等待选择：${kind}`);
}
interface Hit { target:number; amount:number; source:number|null; category:'attack'|'response'|'environment';trueDamage?:boolean;reflected?:boolean;directHp?:boolean;extra?:boolean }
function damage(s:GameState,hits:Hit[],environment=false,suppressPursuit=false):Task[] {
 s.batch++; const injured:(Hit&{loss:number})[]=[];
 for(const original of hits){
  if(hasStage4(s.version)&&(!onBoard(s,original.target)||original.amount<=0))continue;
  const prepared=hasStage4(s.version)?prepareStage4Hit(s,original,environment,stage3Ports):original;if(!prepared)continue;
  const h=hasStage4(s.version)&&(!environment&&s.players[original.target].character==='character-037'||resources.equipped(resourceState(s),original.target,'basic-059'))?{...prepared,amount:Math.min(1,prepared.amount)}:prepared;
  const p=s.players[h.target];if(!alive(p)||hasStage4(s.version)&&!onBoard(s,h.target)||h.amount<=0)continue;
  const amount=h.amount;
  const blocked=h.trueDamage||environment&&!isClassic(s)?0:Math.min(p.shield,amount);p.shield-=blocked;
  const loss=Math.min(p.hp,amount-blocked);p.hp-=loss;
  if(h.source!==null&&enemy(s,h.source,h.target)){s.players[h.source].damage+=loss;if(p.hp===0&&loss>0)s.players[h.source].kills++;}
  emit(s,'damage',`${name(s,h.target)} ${environment?'环境':'普通'}伤害${h.amount}，护盾抵挡${blocked}，实际失血${loss}`,{...h,blocked,loss,batch:s.batch});
  if(loss>0)injured.push({...h,loss});
 }
 for(const p of s.players)if(p.hp===0&&p.eliminated===null){p.eliminated=s.batch;p.ap=0;p.shield=0;s.discard.push(...p.hand);p.hand=[];if(hasStage3(s.version))resources.recordDeathResources(resourceState(s),p.seat);emit(s,'eliminate',`${name(s,p.seat)} 淘汰（批次${s.batch}）`);}
 const tasks:Task[]=hasStage4(s.version)?[...stage4AfterDamage(s,injured,environment,stage3Ports),...reactiveInjury(s,injured)]:[];
 for(const actor of s.order){
  const p=s.players[actor];const h=injured.find(x=>x.target===actor);if(!h||!alive(p))continue;
  if(p.character==='character-004'){
   if(h.source!==null&&h.category==='attack'&&enemy(s,h.source,actor)&&alive(s.players[h.source])&&!p.rewarded.includes(h.source)&&(!hasStage3(s.version)||roleEffectAllowed({origin:'role-locked',actor,roleModifiers:[]},s.players[h.source])))tasks.push({kind:'trigger',actor:h.source,trigger:'lemon-reward',source:actor});
   tasks.push({kind:'trigger',actor,trigger:'lemon-support'});
  }else if(p.character==='character-031')tasks.push({kind:'trigger',actor,trigger:'runner-roll'});
  else if(p.character==='character-037')tasks.push({kind:'trigger',actor,trigger:'teleport'});
 }
 if(hasStage3(s.version)&&!suppressPursuit)for(const h of injured){if(h.source===null||h.source===h.target||!alive(s.players[h.source])||!alive(s.players[h.target])||s.players[h.source].character!=='character-005'||!roleEffectAllowed({origin:'role-active',actor:h.source,roleModifiers:[]},s.players[h.target]))continue;const root=s.cardStack?.stack[0];if(root?.pursuits?.includes(h.target))continue;if(root)root.pursuits=[...(root.pursuits??[]),h.target];tasks.push({kind:'stage3',action:'qb',actor:h.source,target:h.target});}
 return tasks;
}
function scores(s:GameState):Ranking[] {
 const groups=s.mode==='ffa'?s.players.map(p=>[p.seat]):[s.players.filter(p=>p.team==='A').map(p=>p.seat),s.players.filter(p=>p.team==='B').map(p=>p.seat)].filter(ids=>!hasStage4(s.version)||ids.length>0);
 return groups.map(ids=>({label:s.mode==='ffa'?name(s,ids[0]):`${s.players[ids[0]].team}队`,players:ids,rank:0,alive:ids.filter(i=>alive(s.players[i])).length,hp:ids.reduce((n,i)=>n+s.players[i].hp,0),maxHp:ids.reduce((n,i)=>n+s.players[i].maxHp,0),kills:ids.reduce((n,i)=>n+s.players[i].kills,0),damage:ids.reduce((n,i)=>n+s.players[i].damage,0)}));
}
export function compareScore(a:Pick<Ranking,'alive'|'hp'|'maxHp'|'kills'|'damage'>,b:Pick<Ranking,'alive'|'hp'|'maxHp'|'kills'|'damage'>):number { return b.alive-a.alive || b.hp*a.maxHp-a.hp*b.maxHp || b.kills-a.kills || b.damage-a.damage; }
function finish(s:GameState,forced:boolean,now:number):boolean {
 const rows=scores(s), surviving=rows.filter(r=>r.alive>0);
 const combos=hasStage3(s.version)?resources.comboTeams(resourceState(s)):[];
 if(!forced&&surviving.length>1&&!combos.length)return false;
 const eliminatedAt=(r:Ranking)=>Math.max(...r.players.map(i=>s.players[i].eliminated??Infinity));
 const compare=(a:Ranking,b:Ranking):number => a.alive&&b.alive?compareScore(a,b):a.alive?-1:b.alive?1:eliminatedAt(b)-eliminatedAt(a);
 rows.sort(compare);rows.forEach((r,i)=>r.rank=i&&compare(rows[i-1],r)===0?rows[i-1].rank:i+1);
 const combo=surviving.length>1&&combos.length>0;
 if(combo&&combos.length===1){rows.sort((a,b)=>Number(combos.includes(s.players[b.players[0]].team))-Number(combos.includes(s.players[a.players[0]].team)));rows.forEach((r,i)=>r.rank=i+1);}
 const winners=surviving.length===0?[]:combo?s.players.filter(p=>combos.includes(p.team)).map(p=>p.seat):rows.filter(r=>r.rank===1).flatMap(r=>r.players);
 const tied=surviving.length===0||(combo?combos.length>1:rows.filter(r=>r.rank===1).length>1);
 s.result={reason:tied?'draw':combo?'combo':forced?'round-limit':'natural',winners:tied?[]:winners,ranking:rows};
 if(hasStage4(s.version))discardStage4Interrupts(s);
 s.phase='over';s.choice=null;s.queue=[];s.movement=null;pause(s,now);
 emit(s,'result',tied?'对局结束：平局':`对局结束：${rows[0].label} 获胜`,s.result);return true;
}
function startRound(s:GameState,now:number):void {
 if(isClassic(s)){pause(s,now);s.phase='resolving';s.queue.push(...s.order.map(actor=>({kind:'water' as const,actor})),{kind:'classic-start'});pump(s,now);return;}
 s.safe=safeCellsForVersion(s.version,s.round);s.bomb=s.forecast?.round===s.round?s.forecast.bomb:null;s.forecast=null;
 emit(s,'round',`第${s.round}轮开始，安全格${s.safe.length}，轰炸：${s.bomb??'无'}`);
 for(const p of s.players)if(alive(p)){p.skillUsed=false;p.rewarded=[];if(p.ap<5){p.ap+=3;emit(s,'ap',`${name(s,p.seat)} 轮开始获得3AP → ${p.ap}`);}}
 const hits=s.players.filter(alive).map(p=>({target:p.seat,amount:(s.safe.includes(p.cell)?0:poisonDamageForVersion(s.version,s.round))+(mapForVersion(s.version).map[p.cell].region===s.bomb?1:0),source:null,category:'environment' as const}));
 pause(s,now);s.phase='resolving';s.queue.push(...damage(s,hits,true),{kind:'after-env'});pump(s,now);
}
function next(s:GameState,now:number):void {
 if(hasStage3(s.version)&&!s.stage4?.interruptSkipEnd)resources.endResourceTurn(resourceState(s),s.active);if(s.stage4)s.stage4.interruptSkipEnd=false;
 pause(s,now);s.players[s.active].moved=false;s.players[s.active].attacks=0;
 if(hasStage4(s.version)&&s.stage4!.interruptTurn!==null){const first=s.stage4!.interruptTurn!;s.stage4!.interruptTurn=null;s.order=Array.from({length:4},(_,i)=>(first+i)%4);s.round++;s.cursor=0;startRound(s,now);return;}
 s.cursor++;
 while(s.cursor<4&&!alive(s.players[s.order[s.cursor]]))s.cursor++;
 if(s.cursor<4){s.queue.unshift({kind:'turn-start',actor:s.order[s.cursor]});return;}
 if(isClassic(s)){pause(s,now);s.phase='resolving';const hits=classicEnvironmentHits(s);emit(s,'environment',`第${s.round}轮末，轰炸：${s.classic!.bombs.join('、')}`);s.queue.push(...damage(s,hits,true),{kind:'round-next'});return;}
 if(s.round===12){finish(s,true,now);return;}
 let bomb:string|null=null;
 if(s.round>=2){const candidates=bombCandidatesForVersion(s.version,s.round+1);const scripted=s.random.bombs.shift();bomb=scripted??candidates[integer(s.random,candidates.length)];requireRule(candidates.includes(bomb),'注入轰炸不在下轮候选区域');}
 s.forecast={round:s.round+1,safe:safeCellsForVersion(s.version,s.round+1),bomb};emit(s,'forecast',`预告第${s.round+1}轮：安全格${s.forecast.safe.length}，轰炸${bomb??'无'}`,s.forecast);
 s.round++;s.cursor=0;startRound(s,now);
}
function responseCards(s:GameState,actor:number,attack:Attack):string[] { return s.players[actor].hand.filter(c=>{const id=definitionId(c);return ((id==='basic-001'&&(!hasClassicPatch(s.version)||definitionId(attack.card)!=='basic-009'))||(id==='basic-002'&&definitionId(attack.card)==='basic-008'))&&s.players[actor].ap>=runtimeForVersion(s.version).cards[id].cost;}); }
function resolveAttack(s:GameState):void {
 const a=s.attack!;const def=runtimeForVersion(s.version).cards[definitionId(a.card)];const hits:Hit[]=[];
 const targets=a.targets.filter(t=>!a.cancelled.includes(t));
 let roll=0;if(targets.length&&(def.id==='basic-006'||def.id==='basic-009'))roll=die(s,def.name);
 for(const target of targets){
  const p=s.players[target];
  if(def.power!==undefined){const amount=Math.max(0,def.power-p.ap),paid=Math.min(def.power,p.ap);p.ap-=paid;emit(s,'ap',`${name(s,target)} 被扣${paid}AP → ${p.ap}`);if(amount)hits.push({target,amount,source:a.actor,category:'attack'});}
  else if(def.id==='basic-008'){
   if(p.ap===0)hits.push({target,amount:1,source:a.actor,category:'attack'});
   else {const n=hasInteractionRules(s.version)?p.ap:Math.min(2,p.ap);p.ap-=n;s.players[a.actor].ap+=n;emit(s,'ap',hasInteractionRules(s.version)?`${name(s,a.actor)} 头锤：从${name(s,target)}吸收全部${n}AP（目标AP ${n}→0）`:`${name(s,a.actor)} 从${name(s,target)}吸收${n}AP`);}
  }else if(roll>=4)hits.push({target,amount:1,source:a.actor,category:'attack'});
 }
 for(const actor of a.elbows){const target=a.actor;const p=s.players[target];if(p.ap===0)hits.push({target,amount:1,source:actor,category:'response'});else{const n=Math.min(2,p.ap);p.ap-=n;s.players[actor].ap+=n;emit(s,'ap',`${name(s,actor)} 肘击反吸${n}AP`);}}
 const before=s.players.map(p=>p.hp);const triggers=damage(s,hits);
 if(def.id==='basic-006'&&alive(s.players[a.actor]))heal(s,a.actor,targets.reduce((n,t)=>n+before[t]-s.players[t].hp,0));
 if(roll&&roll<4)emit(s,'miss',`${def.name} 未命中`);
 s.queue.unshift(...triggers,{kind:'cleanup'});
}
function pump(s:GameState,now:number):void {
 let guard=0;
 while(!s.choice&&s.phase!=='over'){
  if(hasStage3(s.version)&&stage3Overflow(s,now,stage3Ports))break;if(hasStage4(s.version)&&beginStage4Interrupt(s,now,stage3Ports))continue;if(!s.queue.length)break;
  requireRule(++guard<200,'内部流程未收敛');const task=s.queue.shift()!;const actor=task.actor??s.active;const p=s.players[actor];
  switch(task.kind){
   case 'stage3':if(!hasStage4(s.version)||!stage4Task(s,task,now,stage3Ports))stage3Task(s,task,now,stage3Ports);if(s.phase==='action'&&!s.choice)resume(s,now);break;
   case 'water':if(ignoreLocation(s,actor))break;if(owesWater(s,actor)||(task.data as {entry?:boolean}|undefined)?.entry&&alive(p)&&p.hand.length){if(hasStage4(s.version)&&combatGear(s,actor,'basic-069')&&!(task.data as {noTang?:boolean}|undefined)?.noTang)select(s,'gear-terrain',actor,now,{data:{task}});else select(s,'water-discard',actor,now,{count:1,cards:[...p.hand]});}break;
   case 'classic-start':
    for(const q of s.players)if(alive(q)&&(!hasStage4(s.version)||onBoard(s,q.seat))){q.skillUsed=false;q.rewarded=[];const allowed=!hasStage3(s.version)||resources.canGainRoundAp(resourceState(s),q.seat);if(allowed&&q.ap<5&&(!hasClassicPatch(s.version)||q.character!=='character-031')){if(hasStage3(s.version))resources.gainAp(resourceState(s),q.seat,3);else q.ap+=3;emit(s,'ap',`${name(s,q.seat)} 轮开始获得3AP → ${q.ap}`);}}
    refreshClassicRound(s);emit(s,'round',`第${s.round}轮开始，毒区：${s.classic!.poison.join('、')}${s.classic!.farmClosed?'；高唐农场已封闭':''}`);s.queue.unshift({kind:'after-env'});break;
   case 'round-next':if(!finish(s,false,now)){s.round++;s.cursor=0;startRound(s,now);}break;
   case 'walk':walkClassic(s,task.path??[],now,true);break;
   case 'after-env':
    if(finish(s,false,now))break;
    s.cursor=0;while(!alive(s.players[s.order[s.cursor]]))s.cursor++;s.queue.unshift({kind:'turn-start',actor:s.order[s.cursor]});break;
   case 'turn-start':
    if(!(task.data as {resuming?:boolean}|undefined)?.resuming){s.active=actor;if(s.classic)s.classic.shipUsed=s.classic.shipUsed.filter(a=>a!==actor);s.phase='resolving';s.clock={remaining:60000,since:now};p.moved=false;p.attacks=0;
    if(hasStage3(s.version))resources.startResourceTurn(resourceState(s),actor);
    if(hasStage4(s.version))stage4TurnStart(s,actor);
    if(hasStage4(s.version)&&s.stage4!.offMap[actor]){s.queue.unshift({kind:'turn-start',actor,data:{resuming:true}});boardReturn(s,actor,now,stage3Ports);break;}
    }
    const startGain=!hasStage3(s.version)||resources.canGainStartAp(resourceState(s),actor);
    if(startGain&&p.character==='character-031'&&p.ap<6){p.ap=6;emit(s,'ap',`${name(s,actor)} 行动开始补至6AP`);}
    const locationAp=startGain?terrainAp(s,actor):p.ap;if(locationAp>p.ap){if(hasStage3(s.version))resources.gainAp(resourceState(s),actor,locationAp-p.ap);else p.ap=locationAp;emit(s,'ap',`${name(s,actor)} 尚德荟获得1AP → ${p.ap}`);}
    emit(s,'turn',`${name(s,actor)} 开始行动`);if(s.round>1&&(!hasStage4(s.version)||!s.stage4!.drawBlocked[actor]))draw(s,actor,terrainDraw(s,actor));
    s.queue.unshift(...(hasStage3(s.version)&&p.character==='character-010'?[{kind:'stage3' as const,action:'east',actor}]:[]),{kind:'action'});if(p.character==='character-027'&&(!hasStage4(s.version)||!s.stage4!.drawBlocked[actor]))select(s,'draw-start',actor,now);break;
   case 'action':s.phase='action';resume(s,now);break;
   case 'end-draw':
    s.queue.unshift({kind:hasClassicPatch(s.version)?'cave-end':'discard'});if(p.character==='character-027'&&alive(p)&&(!hasStage4(s.version)||onBoard(s,actor))&&budget(s,now)>0)select(s,'draw-end',actor,now);break;
   case 'cave-end':{const hits=caveEnding(s,actor);s.queue.unshift(...(hits.length?damage(s,hits,true):[]),{kind:'cave-after',actor});break;}
   case 'cave-after':if(!finish(s,false,now))s.queue.unshift({kind:'discard',actor});break;
   case 'discard':{
    const count=p.hand.length-handLimit(p.hp);s.queue.unshift({kind:'next'});if(alive(p)&&count>0)select(s,'discard',actor,now,{count,cards:[...p.hand]});break;
   }
   case 'next':next(s,now);break;
   case 'response':if(s.attack&&!s.attack.cancelled.includes(actor)&&alive(p)){const cards=responseCards(s,actor,s.attack);if(cards.length)select(s,'response',actor,now,{cards});}break;
   case 'resolve':resolveAttack(s);break;
   case 'cleanup':
    s.discard.push(...s.resolving);s.resolving=[];s.attack=null;
    if(!finish(s,false,now)){if(alive(s.players[s.active])){s.phase='action';resume(s,now);}else s.queue.unshift({kind:'next'});}break;
   case 'trigger':{
    if(!alive(p))break;
    const kind=task.trigger!;
    if(kind==='lemon-reward'){if(task.source!==undefined&&!s.players[task.source].rewarded.includes(actor))select(s,kind,actor,now,{source:task.source});}
    else if(!p.skillUsed){
     if(kind==='lemon-support'&&p.ap>=1)select(s,kind,actor,now);
     if(kind==='runner-roll'&&p.ap>=2)select(s,kind,actor,now);
     if(kind==='teleport'){const cells=teleportCells(s,actor);if(cells.length)select(s,kind,actor,now,{cells});}
    }break;
   }
  }
 }
}
function settleMovement(s:GameState):void {
 const m=s.movement;
 if(hasStage4(s.version)&&m&&m.path.length>1&&!m.gearQueued){m.gearQueued=true;s.queue.push(...landingPush(s,s.active,stepDirection(s,m.path.at(-2)!,m.path.at(-1)!)));}
 if(hasStage3(s.version)&&m&&m.path.length>1&&m.carry?.length){s.queue.unshift({kind:'stage3',action:'carry',actor:s.active,data:m.carry});m.carry=[];}
 if(!hasInteractionRules(s.version)||!m?.costDue)return;
 if(m.path.length>1){const p=s.players[s.active];requireRule(hasStage4(s.version)||p.ap>=1,'移动结算需要1AP');const paid=Math.min(1,p.ap);p.ap-=paid;emit(s,'cost',`${name(s,p.seat)} 移动结束支付${paid}AP`);}
 m.costDue=false;
}
function endTurn(s:GameState,now:number,timeout=false):void {
 if(s.movement){settleMovement(s);const p=s.players[s.active];relocated(s,p.seat,p.cell,s.movement.lastEmpty);p.cell=s.movement.lastEmpty;s.movement=null;emit(s,'move',`移动结束，落点${p.cell}，剩余额度作废`);}
 s.phase='resolving';if(hasStage4(s.version))s.queue.push({kind:'stage3',action:'gear-end',actor:s.active});if(hasStage4(s.version)&&currentDesert(s,s.active))s.queue.push({kind:'stage3',action:'board-desert',actor:s.active});
 s.queue.push({kind:timeout?(hasClassicPatch(s.version)?'cave-end':'discard'):'end-draw'});pump(s,now);
}
function rawTarget(s:GameState,actor:number,defId:CardId,target:number):boolean {
 const p=s.players[target];if(!p||!alive(p)||!enemy(s,actor,target))return false;
 const def=cardForVersion(defId,s.version);if(def.type!=='attack')return false;
 if(!terrainCard(s,actor,defId))return false;
 if(def.group&&p.character==='character-027'&&p.hand.length===1)return false;
 const a=mapForVersion(s.version).map[s.players[actor].cell].region,b=mapForVersion(s.version).map[p.cell].region;
 return def.range==='global'||a===b||(def.range==='adjacent'&&neighboringForVersion(s.version,a,b));
}
export function legalTargets(s:GameState,actor:number,card:string):number[] {
 if(hasStage3(s.version))return stage3AttackTargets(s,actor,card);
 const defId=definitionId(card),def=cardForVersion(defId,s.version);if(!def||def.type!=='attack')return [];
 const ids=s.players.filter(p=>rawTarget(s,actor,defId,p.seat)).map(p=>p.seat);
 const lemon=ids.find(i=>s.players[i].character==='character-004');return !def.group&&lemon!==undefined?[lemon]:ids;
}
function canEscape(s:GameState,actor:number,cell:string,remaining:number):boolean {
 const occupied=s.players.some(p=>p.seat!==actor&&onBoard(s,p.seat)&&p.cell===cell);
 if(!terrainThrough(s,actor,cell,occupied))return false;
 if(!occupied)return true;
 const queue:[string,number][]=[[cell,remaining]];const best=new Map<string,number>();
 while(queue.length){const [from,left]=queue.shift()!;if((best.get(from)??-1)>=left)continue;best.set(from,left);
  for(const next of mapForVersion(s.version).cells)if(distanceForVersion(s.version,from,next.id)===1){if(isClassic(s)&&(!enterAllowed(s,next.id)||!terrainThrough(s,actor,next.id,s.players.some(q=>q.seat!==actor&&onBoard(s,q.seat)&&q.cell===next.id))))continue;const cost=water(s,next.id,actor)&&!ignoreLocation(s,actor)?2:1;if(cost>left)continue;if(!s.players.some(p=>p.seat!==actor&&onBoard(s,p.seat)&&p.cell===next.id))return true;queue.push([next.id,left-cost]);}
 }return false;
}
export function legalSteps(s:GameState):string[] {
 if(s.phase!=='moving'||!s.movement)return [];
 const p=s.players[s.active];return mapForVersion(s.version).cells.filter(c=>{
  const cost=isClassic(s)?stepCost(s,p.seat,c.id):distanceForVersion(s.version,p.cell,c.id)===1?(c.terrain==='water'?2:1):null;
  if(hasStage3(s.version)){
   if(!resources.canEnterWithMount(resourceState(s),p.seat,c.id)||s.movement!.direction&&!roles.westStepAllowed(p.cell,c.id,s.movement!.direction))return false;
   const target=s.players.find(q=>q.hp>0&&q.seat!==p.seat&&q.cell===c.id);
   if(target&&p.character==='character-040')return false;
   if(target&&p.character==='character-045')return cost!==null&&cost<=s.movement!.remaining&&terrainThrough(s,p.seat,c.id,true)&&roles.collisionPath({...resourceState(s),farmClosed:s.classic!.farmClosed},p.seat,target.seat,stepDirection(s,p.cell,c.id)).length>0;
  }
  return cost!==null&&cost<=s.movement!.remaining&&canEscape(s,p.seat,c.id,s.movement!.remaining-cost);
 }).map(c=>c.id);
}
function walkClassic(s:GameState,path:string[],now:number,resuming=false):void {
 const p=s.players[s.active],m=s.movement!;s.phase='moving';
 if(hasStage4(s.version)&&resuming){const probe=structuredClone(s),prefix:string[]=[];for(const cell of path){if(!legalSteps(probe).includes(cell))break;applyCollision(probe,cell);probe.movement!.remaining-=stepCost(probe,probe.active,cell)!;probe.players[probe.active].cell=cell;prefix.push(cell);if(terrainStops(probe,probe.active,cell))probe.movement!.remaining=0;}if(prefix.length!==path.length){path=prefix;emit(s,'move','后续路径已变化，保留剩余步数');}}
 // Validate the whole submitted path before opening a persistent choice. An
 // invalid tail must not leave a saved water window that can never resume.
 const check=structuredClone(s);
 for(const cell of path){
  requireRule(legalSteps(check).includes(cell),'移动路径不合法：检查步数、占用、封闭地区或越水落点');
  if(hasStage3(check.version))applyCollision(check,cell);
  check.movement!.remaining-=stepCost(check,check.active,cell)!;check.players[check.active].cell=cell;
  if(terrainStops(check,check.active,cell))check.movement!.remaining=0;
 }
 for(let i=0;i<path.length;i++){
  const cell=path[i];requireRule(legalSteps(s).includes(cell),'移动路径不合法：检查步数、占用、封闭地区或越水落点');
  const pushed=hasStage3(s.version)?applyCollision(s,cell):[];
  const from=p.cell,cost=stepCost(s,p.seat,cell)!;m.remaining-=cost;p.cell=cell;m.path.push(cell);relocated(s,p.seat,from,cell);
  if(hasStage3(s.version))s.stage3!.voluntaryMoved[p.seat]=true;
  if(!s.players.some(q=>q.seat!==p.seat&&onBoard(s,q.seat)&&q.cell===cell))m.lastEmpty=cell;
  if(terrainStops(s,s.active,cell))m.remaining=0;
  emit(s,'move',`${name(s,p.seat)} → ${cell}，消耗${cost}步，余${m.remaining}`);
  if(hasStage4(s.version)){const arrival=boardArrivalTasks(s,p.seat,from,cell),waterDue=owesWater(s,p.seat,from);if(pushed.length||waterDue||arrival.length){s.queue.unshift(...pushed,...(waterDue?[{kind:'water' as const,actor:p.seat,data:{entry:true}}]:[]),...arrival,{kind:'walk',path:path.slice(i+1)});s.phase='resolving';return;}}
  if(pushed.length){s.queue.unshift(...pushed,{kind:'walk',path:path.slice(i+1)});s.phase='resolving';return;}
  if(owesWater(s,p.seat,from)){s.queue.unshift({kind:'walk',path:path.slice(i+1)});select(s,'water-discard',p.seat,now,{count:1,cards:[...p.hand]});return;}
 }
 if(m.remaining===0){settleMovement(s);s.movement=null;s.phase='action';}
 resume(s,now);
}
export function legalLocations(s:GameState,actor:number){
 if(ignoreLocation(s,actor))return {ship:[],commute:[]};
 const input={...s,shipUsed:s.classic?.shipUsed??[],farmClosed:s.classic?.farmClosed??false};
 if(hasStage3(s.version)&&s.stage3!.jjFree[actor])input.players=s.players.map(p=>p.seat===actor?{...p,ap:Math.max(1,p.ap)}:p);
 const allowed=(cells:string[])=>hasStage3(s.version)?resources.mountMovementBlocked(resourceState(s),actor)?[]:cells.filter(c=>resources.canEnterWithMount(resourceState(s),actor,c)):cells;
 return {ship:allowed(locationDestinations(input,actor,'ship')),commute:allowed(locationDestinations({...input,players:s.players},actor,'commute'))};
}
function choose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,timeout=false):void {
 const c=s.choice!;const p=s.players[c.actor];requireRule(cmd.choice===c.id,'选择窗口已过期');requireRule(cmd.actor===c.actor,'请交给待选择的座位操作');
 if(hasStage4(s.version)&&['gear-react','gear-push','gear-terrain'].includes(c.kind)){stage4MovementChoose(s,cmd,now,stage3Ports,timeout);}
 else if(hasStage4(s.version)&&['gear-cloak','gear-reflect','gear-chalk','gear-plant'].includes(c.kind)){stage4CombatChoose(s,cmd,now,stage3Ports,timeout);}
 else if(hasStage4(s.version)&&c.kind==='gear-loss'){stage4GearLossChoose(s,cmd,now,stage3Ports,timeout);}
 else if(hasStage4(s.version)&&isBoardChoice(c.kind)){stage4MapChoose(s,cmd,now,stage3Ports,timeout);}
 else if(hasStage4(s.version)&&['card-counter','forced-card'].includes(c.kind)){stage4CounterChoose(s,cmd,now,stage3Ports,timeout);}
 else if(hasStage3(s.version)&&(['easy','qb-pursuit','east-start','xiao-overflow','xie-ledger','elbow-push','west-carry','equipment-loss','revival-confirm'].includes(c.kind)||c.kind==='response'&&s.cardStack!.stack.length)){
  if(stage3Choose(s,cmd,now,stage3Ports,timeout))return;
 }else switch(c.kind){
  case 'draw-start':case 'draw-end':if(cmd.accept)draw(s,c.actor,1);break;
  case 'response':if(cmd.card){requireRule(c.cards?.includes(cmd.card),'此牌不能响应');const def=runtimeForVersion(s.version).cards[definitionId(cmd.card)];p.ap-=def.cost;p.hand.splice(p.hand.indexOf(cmd.card),1);s.resolving.push(cmd.card);s.attack!.cancelled.push(c.actor);if(def.id==='basic-002')s.attack!.elbows.push(c.actor);emit(s,'response',`${name(s,c.actor)} 使用${def.name}，支付${def.cost}AP`);}else emit(s,'response',`${name(s,c.actor)} 放弃响应`);break;
  case 'lemon-reward':if(cmd.accept){s.players[c.source!].rewarded.push(c.actor);draw(s,c.actor,1);}break;
  case 'lemon-support':if(cmd.accept){requireRule(p.ap>=1&&!p.skillUsed,'支援不可用');p.ap--;p.skillUsed=true;for(const q of s.players)if(alive(q)&&(q.seat===c.actor||(s.mode==='team'&&q.team===p.team))&&(!hasStage3(s.version)||roleEffectAllowed({origin:'role-active',actor:c.actor,roleModifiers:[]},q)))draw(s,q.seat,1);emit(s,'skill',`${name(s,c.actor)} 支援，支付1AP`);}break;
  case 'runner-roll':if(cmd.accept){requireRule(p.ap>=2&&!p.skillUsed,'恢复判定不可用');p.skillUsed=true;const roll=die(s,'跑者恢复');if(roll>=4){s.choice=null;select(s,'runner-pay',c.actor,now);return;}}break;
  case 'runner-pay':if(cmd.accept){requireRule(p.ap>=2,'恢复费用不足');p.ap-=2;heal(s,c.actor,1);emit(s,'skill',`${name(s,c.actor)} 恢复支付2AP`);}break;
  case 'teleport':if(cmd.cell){requireRule(c.cells?.includes(cmd.cell)&&teleportCells(s,c.actor).includes(cmd.cell),'传送须为距离≤3的空陆地');if(hasStage3(s.version))s.queue.unshift(...stage3Relocate(s,c.actor,cmd.cell,true));else{const from=p.cell;p.cell=cmd.cell;relocated(s,c.actor,from,cmd.cell);}p.skillUsed=true;emit(s,'teleport',`${name(s,c.actor)} 传送至${cmd.cell}${s.safe.includes(cmd.cell)?'':'（毒圈外）'}`);}break;
  case 'water-discard':case 'discard':{
   const cards=cmd.cards??[];requireRule(cards.length===c.count&&new Set(cards).size===cards.length&&cards.every(card=>p.hand.includes(card)),'请选择准确数量的不同手牌弃置');
   p.hand=p.hand.filter(card=>!cards.includes(card));s.discard.push(...cards);emit(s,timeout?'timeout-discard':'discard',`${name(s,c.actor)} ${timeout?'超时代弃':'自选弃牌'}${cards.length}张`,cards);break;
  }
 }
 if(timeout)emit(s,'timeout',`${name(s,c.actor)} 选择超时：${c.kind}`);
 s.choice=null;s.phase='resolving';pump(s,now);
 if(hasStage3(s.version)&&!s.choice&&!s.queue.length&&s.phase==='resolving'&&!s.movement&&alive(s.players[s.active])){s.phase='action';resume(s,now);}
}
function expire(s:GameState,now:number):boolean {
 if(s.choice&&now>=s.choice.deadline){const c=s.choice;const cmd:Extract<Command,{type:'choose'}>={id:'timeout',revision:s.revision,actor:c.actor,type:'choose',choice:c.id,accept:false,card:null,cell:null,cards:(c.kind==='discard'||c.kind==='water-discard')?[...s.players[c.actor].hand].sort().slice(0,c.count):undefined};
  // A personal-budget expiry skips the optional end draw; discard uses its own versioned window.
  const personalExpired=!c.paused&&budget(s,now)===0;
  if(personalExpired){s.choice=null;s.queue=[];s.clock.remaining=0;s.clock.since=null;emit(s,'timeout','60秒行动预算用完');endTurn(s,now,true);}else choose(s,cmd,now,true);return true;
 }
 if(!s.choice&&s.clock.since!==null&&budget(s,now)===0){pause(s,now);emit(s,'timeout','60秒行动预算用完');endTurn(s,now,true);return true;}
 return false;
}
export function createGame(setup:Setup,now:number):GameState {
 requireRule(setup!==null&&typeof setup==='object'&&!Array.isArray(setup),'开局输入必须为对象');
 requireRule(Array.isArray(setup.seats)&&(setup.characters===undefined||Array.isArray(setup.characters))&&(setup.deck===undefined||Array.isArray(setup.deck)),'座位、角色和牌堆必须为数组');
 requireRule(setup.ruleVersion===undefined||isActiveRuleVersion(setup.ruleVersion)||hasStage3(setup.ruleVersion),'规则版本无效');
 const version=setup.ruleVersion??RULE_VERSION,data=runtimeForVersion(version);
 requireRule(setup.first===undefined||(Number.isInteger(setup.first)&&setup.first>=0&&setup.first<4),'首位无效');
 requireRule(setup.dice===undefined||(Array.isArray(setup.dice)&&setup.dice.every(v=>Number.isInteger(v)&&v>=1&&v<=6)),'测试骰子必须为1—6的数组');
 requireRule(setup.bombs===undefined||(Array.isArray(setup.bombs)&&setup.bombs.every(v=>typeof v==='string'&&data.cells.some(c=>c.region===v))),'测试轰炸必须为已知区域数组');
 requireRule(setup.reshuffles===undefined||(Array.isArray(setup.reshuffles)&&setup.reshuffles.every(cards=>Array.isArray(cards)&&new Set(cards).size===cards.length&&cards.every(c=>data.allCards.includes(c)))),'测试重洗必须为不重复实体牌数组');
 requireRule(setup.sortedReshuffles===undefined||typeof setup.sortedReshuffles==='boolean','测试重洗开关必须为布尔值');
 requireRule(setup.teams===undefined||(Array.isArray(setup.teams)&&setup.teams.length===4&&setup.teams.filter(t=>t==='A').length===2&&setup.teams.filter(t=>t==='B').length===2),'测试队伍必须为两A两B');
 validateData();requireRule(Number.isFinite(now)&&now>=0,'时钟无效');requireRule(setup.mode==='ffa'||setup.mode==='team','模式无效');requireRule(sameSet(setup.seats,[0,1,2,3]),'必须有S1—S4四个固定座位');requireRule(Number.isInteger(setup.seed)&&setup.seed>=0&&setup.seed<=0xffffffff,'随机种子必须为uint32');
 const random:RandomState={seed:setup.seed>>>0,dice:[...(setup.dice??[])],bombs:[...(setup.bombs??[])],reshuffles:structuredClone(setup.reshuffles??[]),sortedReshuffles:setup.sortedReshuffles??false};
 const characters=setup.characters??shuffled(random,data.characterIds).slice(0,4);requireRule(hasStage3(version)?characters.length===4&&new Set(characters).size===4&&characters.every(id=>data.characterIds.includes(id)):sameSet(characters,data.characterIds),'四角色必须完整且唯一');
 const teamPair=shuffled(random,[0,1,2,3]).slice(0,2);const teams=setup.teams??[0,1,2,3].map(i=>teamPair.includes(i)?'A':'B');if(setup.mode==='team')requireRule(teams.length===4&&teams.filter(t=>t==='A').length===2&&teams.filter(t=>t==='B').length===2,'团战必须2对2');
 const first=setup.first??integer(random,4);requireRule(Number.isInteger(first)&&first>=0&&first<4,'首位无效');const deck=setup.deck??shuffled(random,data.allCards);requireRule(sameSet(deck,data.allCards),hasStage3(version)?'牌堆不是当前版本实体的完整排列':'牌堆不是64实体的完整排列');
 const spawn=isClassic({version})?fixedSpawnLayout(version,characters,random):null;if(spawn)Object.assign(random,spawn.random);
 const players=characters.map((character,seat)=>{const c=data.characters[character];return {seat,character,team:setup.mode==='team'?teams[seat]:`S${seat+1}`,faction:hasStage3(version)&&setup.mode==='team'?teams[seat]==='A'?'机械猴子':'帝汶家族':c.faction,hp:c.hp,maxHp:c.hp,ap:5,shield:0,cell:spawn?.cells[seat]??c.spawn,hand:[] as string[],moved:false,attacks:0,skillUsed:false,rewarded:[],kills:0,damage:0,eliminated:null};});
 const s:GameState={version,revision:0,time:now,mode:setup.mode,players,order:Array.from({length:4},(_,i)=>(first+i)%4),cursor:0,active:first,round:1,phase:'resolving',deck:[...deck],discard:[],resolving:[],random,queue:[],choice:null,choiceSerial:0,attack:null,movement:null,safe:safeCellsForVersion(version,1),bomb:null,forecast:null,clock:{remaining:60000,since:null},events:[],eventSerial:0,batch:0,reshuffleCount:0,seen:[],result:null,...(isClassic({version})?{classic:initialClassic(setup.ruleVersion??RULE_VERSION)}:{})};
 if(hasStage3(version)){s.stage3=resources.initialStage3Resources();s.cardStack=initialCardStack();}
 if(hasStage4(version))s.stage4=initialStage4State(players);
 emit(s,'setup',`四人${setup.mode==='ffa'?'各自为战':'2对2'} · ${s.version}`);for(let i=0;i<4;i++)draw(s,i,4);startRound(s,now);validateState(s);return s;
}
export function validateState(s:GameState):void {
 if(hasClassicPatch(s.version))requireRule(s.classic?.caveEnds?.length===4&&s.classic.caveEnds.every(n=>Number.isInteger(n)&&n>=0&&n<3),'山洞计数无效');
 requireRule((isActiveRuleVersion(s.version)||hasStage3(s.version))&&s.players.length===4&&Number.isSafeInteger(s.round)&&s.round>=1&&(isClassic(s)||s.round<=12),'状态版本/轮次/人数无效');requireRule((hasStage3(s.version)?new Set(s.players.map(p=>p.character)).size===4&&s.players.every(p=>runtimeForVersion(s.version).characterIds.includes(p.character)):sameSet(s.players.map(p=>p.character),runtimeForVersion(s.version).characterIds))&&sameSet(s.order,[0,1,2,3]),'角色/顺序无效');
 const zones=[...s.deck,...s.discard,...s.resolving,...s.players.flatMap(p=>p.hand),...(hasStage3(s.version)?s.stage3!.equipment.flat():[])];requireRule(sameSet(zones,runtimeForVersion(s.version).allCards),hasStage3(s.version)?'实体不守恒或实体重复':'64张实体不守恒或实体重复');
 for(const p of s.players){requireRule(Number.isInteger(p.hp)&&p.hp>=0&&p.hp<=p.maxHp&&p.maxHp===runtimeForVersion(s.version).characters[p.character].hp,'生命状态无效');requireRule(Number.isInteger(p.ap)&&p.ap>=0&&Number.isInteger(p.shield)&&p.shield>=0&&p.shield<=2,'AP/护盾无效');requireRule(Boolean(mapForVersion(s.version).map[p.cell]),'位置无效');if(!alive(p))requireRule(p.ap===0&&p.shield===0&&p.hand.length===0&&p.eliminated!==null,'淘汰清理无效');}
 const occupied=s.players.filter(p=>onBoard(s,p.seat));const overlap=occupied.some((p,i)=>occupied.slice(i+1).some(q=>q.cell===p.cell));if(overlap)requireRule((s.phase==='moving'||s.choice?.kind==='water-discard')&&s.movement!==null,'稳定落点不能重叠');
 requireRule(s.clock.remaining>=0&&Number.isFinite(s.clock.remaining),'计时预算无效');
}
export function dispatch(previous:GameState,cmd:Command,now:number):DispatchResult {
 try{
  requireRule(cmd!==null&&typeof cmd==='object'&&!Array.isArray(cmd),'命令必须为对象');
  requireRule(Number.isSafeInteger(cmd.actor)&&cmd.actor>=0&&cmd.actor<4&&Number.isSafeInteger(cmd.revision)&&cmd.revision>=0,'座位/命令版本必须为有效整数');
  requireRule(['play','move','step','stop','end','choose','tick','location',...(hasStage3(previous.version)?['skill']:[])].includes(cmd.type),'未知命令');
  if(cmd.type==='play')requireRule(typeof cmd.card==='string'&&Array.isArray(cmd.targets)&&cmd.targets.every(t=>Number.isInteger(t)&&t>=0&&t<4),'出牌/目标输入无效');
  if(cmd.type==='location')requireRule((cmd.kind==='ship'||cmd.kind==='commute')&&typeof cmd.cell==='string','地点动作输入无效');
  if(cmd.type==='step')requireRule(Array.isArray(cmd.path)&&cmd.path.every(c=>typeof c==='string'),'路径必须为格子数组');
  if(cmd.type==='skill')requireRule(['jj','bread','revival-quote',...(hasStage4(previous.version)?['quote-cost','watch','flight','gift','terrain']:[])].includes(cmd.kind)&&(cmd.target===undefined||Number.isInteger(cmd.target)&&cmd.target>=0&&cmd.target<4)&&(cmd.card===undefined||typeof cmd.card==='string')&&(cmd.cell===undefined||typeof cmd.cell==='string')&&(cmd.cards===undefined||Array.isArray(cmd.cards)&&cmd.cards.every(c=>typeof c==='string'))&&(cmd.accept===undefined||typeof cmd.accept==='boolean'),'技能输入无效');
  if((cmd.type==='move'||cmd.type==='play')&&cmd.direction!==undefined)requireRule(roles.DIRECTIONS.includes(cmd.direction),'方向输入无效');
  if(cmd.type==='play'&&cmd.x!==undefined)requireRule(hasStage4(previous.version)&&Number.isSafeInteger(cmd.x)&&cmd.x>=1,'X必须为阶段四正整数');
  if(cmd.type==='play')requireRule((cmd.as===undefined||cmd.as==='elbow')&&(cmd.replacement===undefined||typeof cmd.replacement==='string'),'转换或替换输入无效');
  if(cmd.type==='play'&&cmd.region!==undefined)requireRule(hasStage4(previous.version)&&typeof cmd.region==='string','地区输入无效');
  if(cmd.type==='choose'){
   requireRule((cmd.option===undefined||typeof cmd.option==='string')&&(cmd.guess===undefined||Number.isInteger(cmd.guess)&&cmd.guess>=1&&cmd.guess<=6),'地图选择输入无效');
   requireRule(Number.isSafeInteger(cmd.choice)&&cmd.choice>0,'选择编号必须为正整数');
   requireRule(cmd.accept===undefined||typeof cmd.accept==='boolean','发动选项必须为布尔值');
   requireRule(cmd.card===undefined||cmd.card===null||typeof cmd.card==='string','响应牌输入无效');
   requireRule(cmd.cell===undefined||cmd.cell===null||typeof cmd.cell==='string','传送格输入无效');
   requireRule(cmd.cards===undefined||(Array.isArray(cmd.cards)&&cmd.cards.every(c=>typeof c==='string')),'弃牌必须为实体牌数组');
   requireRule((cmd.target===undefined||Number.isInteger(cmd.target)&&cmd.target>=0&&cmd.target<4)&&(cmd.action===undefined||cmd.action==='draw'||cmd.action==='steal'||hasStage4(previous.version)&&cmd.action==='ap'),'技能选择输入无效');
  }
  requireRule(Number.isFinite(now)&&now>=previous.time,'时钟必须单调');requireRule(cmd.revision===previous.revision,'命令版本过期');requireRule(typeof cmd.id==='string'&&cmd.id.length>0&&!previous.seen.includes(cmd.id),'重复命令');requireRule(previous.phase!=='over','对局已经结束');
  const s=structuredClone(previous);
  if(cmd.type==='tick'){
   let changed=false,count=0;
   while(s.phase!=='over'){
    const deadline=s.choice?.deadline??(s.clock.since===null?Infinity:s.clock.since+s.clock.remaining);
    if(deadline>now)break;
    if(isClassic(s)&&count>=999)break;requireRule(++count<1000,'超时流程未收敛');changed=expire(s,deadline)||changed;
   }
   if(!changed)return {state:previous,ok:true};
  }
  else{
   requireRule(!(s.choice?now>=s.choice.deadline:s.clock.since!==null&&budget(s,now)===0),'命令已超时，请先处理时钟事件');
   if(cmd.type==='choose'){requireRule(s.choice!==null,'当前没有选择窗口');choose(s,cmd,now);}
   else if(hasStage4(s.version)&&cmd.type==='play'&&cmd.card.split('#')[0]==='basic-017'){reserveStage4Interrupt(s,cmd,stage3Ports);}
   else if(hasStage4(s.version)&&cmd.type==='skill'&&cmd.kind==='terrain'){stage4EquipmentSkill(s,cmd,now,stage3Ports);}
   else if(hasStage4(s.version)&&cmd.type==='skill'&&cmd.kind==='quote-cost'&&s.choice?.kind==='card-counter'&&s.choice.actor===cmd.actor){stage4Quote(s,cmd.actor,cmd.card!,stage3Ports);}
   else{
    requireRule(cmd.actor===s.active&&alive(s.players[cmd.actor]),'只有当前存活行动者可操作');requireRule(!s.choice,'请先完成当前选择');const p=s.players[cmd.actor];requireRule(!hasStage4(s.version)||onBoard(s,cmd.actor)||cmd.type==='end','离场期间只能结束行动');
    if(cmd.type==='step'){
     requireRule(s.phase==='moving'&&s.movement!==null,'尚未开始移动');requireRule(cmd.path.length>0,'移动路径不能为空');const m=s.movement!;
     if(isClassic(s))walkClassic(s,cmd.path,now);else {for(const cell of cmd.path){requireRule(Boolean(mapForVersion(s.version).map[cell])&&distanceForVersion(s.version,p.cell,cell)===1,'只能正交移动到棋盘内相邻格');const cost=mapForVersion(s.version).map[cell].terrain==='water'?2:1;requireRule(m.remaining>=cost,'移动步数不足');requireRule(canEscape(s,cmd.actor,cell,m.remaining-cost),'此路径会困在占用格');m.remaining-=cost;p.cell=cell;m.path.push(cell);if(!s.players.some(q=>q.seat!==p.seat&&onBoard(s,q.seat)&&q.cell===cell))m.lastEmpty=cell;if(terrainStops(s,s.active,cell))m.remaining=0;emit(s,'move',`${name(s,p.seat)} → ${cell}，消耗${cost}步，余${m.remaining}`);}
     if(m.remaining===0){settleMovement(s);s.movement=null;s.phase='action';}}
    }else if(cmd.type==='stop'){
     requireRule(s.movement!==null,'尚未开始移动');requireRule(!s.players.some(q=>q.seat!==p.seat&&onBoard(s,q.seat)&&q.cell===p.cell),'不能停在占用格');settleMovement(s);s.movement=null;s.phase='action';emit(s,'move','主动结束移动，未用额度作废');
    }else if(cmd.type==='end'){requireRule(!s.movement||!s.players.some(q=>q.seat!==p.seat&&onBoard(s,q.seat)&&q.cell===p.cell),'不能在占用格结束行动，请先离开');endTurn(s,now);}
    else {
     requireRule(s.phase==='action','请先完成移动');
     if(cmd.type==='location'){
      requireRule(legalLocations(s,p.seat)[cmd.kind].includes(cmd.cell),'地点传送当前不可用或落点不合法');
      const from=p.cell;if(cmd.kind==='ship')s.classic!.shipUsed.push(p.seat);else p.ap=0;if(hasStage3(s.version))s.queue.push(...stage3Relocate(s,p.seat,cmd.cell,true));else{p.cell=cmd.cell;relocated(s,p.seat,from,cmd.cell);}
      emit(s,'teleport',`${name(s,p.seat)} ${cmd.kind==='ship'?'飞船':'通校'}至${cmd.cell}`);
      if(!hasStage3(s.version)&&owesWater(s,p.seat,from)){s.queue.push({kind:'action'});select(s,'water-discard',p.seat,now,{count:1,cards:[...p.hand]});}
     }else if(cmd.type==='move'){
      requireRule(!p.moved,'本个人回合已使用基础移动');let moveCost=terrainMoveCost(s,p.seat);
      if(hasStage3(s.version)){requireRule(!resources.mountMovementBlocked(resourceState(s),p.seat),'小白马：有坐骑者暂时不能主动位移');moveCost=resources.equipped(resourceState(s),p.seat,'basic-071')?0:resources.fixedApCost(resourceState(s),p.seat,moveCost);}
      requireRule(p.ap>=moveCost,'移动需要1AP');if(s.version==='web-v0.1.1')p.ap--;p.moved=true;
      let direction:roles.Direction|undefined;
      if(hasStage3(s.version)&&p.character==='character-040'){requireRule(cmd.direction!==undefined,'请先声明移动方向');direction=roles.westDirection(cmd.direction!,die(s,'西帝汶方向'));}
      const roll=die(s,'基础移动'),steps=hasStage3(s.version)&&resources.fullMovementDie(resourceState(s),p.seat)?roll:Math.ceil(roll/2);
      if(hasStage3(s.version)){s.stage3!.basicUsed[p.seat]++;p.moved=s.stage3!.basicUsed[p.seat]>=resources.basicMoveAllowance(resourceState(s),p.seat);}
      s.movement={...(hasStage4(s.version)?{gearRoot:s.revision}:{}),remaining:steps,lastEmpty:p.cell,origin:p.cell,path:[p.cell],...(hasInteractionRules(s.version)?{costDue:moveCost>0}:{}),...(hasStage3(s.version)?{direction,carry:roles.carryCandidates(resourceState(s),p.seat,p.cell)}:{})};s.phase='moving';emit(s,'cost',`${name(s,p.seat)} ${moveCost===0?(hasStage3(s.version)?'免费移动':'操场免费移动'):hasInteractionRules(s.version)?'移动结束扣费':'移动支付1AP'}，获得${steps}步`);
     }
     else if(cmd.type==='skill'){if(hasStage4(s.version)&&cmd.kind==='quote-cost'){stage4Quote(s,cmd.actor,cmd.card!,stage3Ports);}else if(!hasStage4(s.version)||!stage4EquipmentSkill(s,cmd,now,stage3Ports))stage3Skill(s,cmd,now,stage3Ports);}
     else if(cmd.type==='play'){
      if(hasStage3(s.version)){if(hasStage4(s.version))stage4Play(s,cmd,now,stage3Ports);else stage3Play(s,cmd,now,stage3Ports);}else{
      requireRule(p.hand.includes(cmd.card),'手中没有该实体牌');const def=cardForVersion(definitionId(cmd.card),s.version);requireRule(def&&def.type!=='response','响应牌只能在对应窗口使用');requireRule(locationCardAllowed(s.version,p.cell,def.id),'当前位置禁止使用此牌');requireRule(p.ap>=def.cost,`需要${def.cost}AP`);
      if(def.type==='attack'){requireRule(unlimitedAttacks(s.version)||p.attacks<2,'本回合最多两张攻击');requireRule(cmd.targets.length>=1&&cmd.targets.length<=(def.group?(hasInteractionRules(s.version)?3:2):1)&&new Set(cmd.targets).size===cmd.targets.length,'目标数量无效');const legal=legalTargets(s,p.seat,cmd.card);requireRule(cmd.targets.every(t=>legal.includes(t)),'目标不合法：检查范围、队伍、lemon嘲讽或群体免疫');}
      else requireRule(cmd.targets.length===0,'补给只能对自己，不接受外部目标');
      if(hasInteractionRules(s.version))s.clock={remaining:60000,since:now};
      p.ap-=def.cost;p.hand.splice(p.hand.indexOf(cmd.card),1);s.resolving.push(cmd.card);emit(s,'play',`${name(s,p.seat)} 使用${def.name}，支付${def.cost}AP${def.type==='attack'?`，目标${cmd.targets.map(t=>name(s,t)).join('、')}`:''}`,{actor:p.seat,card:cmd.card,targets:cmd.targets});
      if(def.type==='attack'){p.attacks++;s.attack={actor:p.seat,card:cmd.card,targets:[...cmd.targets],cancelled:cmd.targets.filter(t=>!locationEffectAllowed(s.version,s.players[t].cell,def.id)),elbows:[]};s.phase='resolving';s.queue.push(...s.order.filter(t=>cmd.targets.includes(t)).map(actor=>({kind:'response' as const,actor})),{kind:'resolve'});pump(s,now);}
      else {heal(s,p.seat,def.id==='basic-046'?2:1,true);if(def.id==='basic-045'){const gained=Math.min(1,2-p.shield);p.shield+=gained;emit(s,'shield',`${name(s,p.seat)} 获得${gained}护盾 → ${p.shield}`);}if(def.id==='basic-047')draw(s,p.seat,2);s.discard.push(...s.resolving);s.resolving=[];finish(s,false,now);}
     }}else fail('未知命令');
    }
   }
  }
  if(hasStage3(s.version))pump(s,now);
  s.seen.push(cmd.id);s.revision++;s.time=now;validateState(s);return {state:s,ok:true};
 }catch(error){return {state:previous,ok:false,error:error instanceof Error?error.message:String(error)};}
}
const stage3Ports:Stage3Ports={emit,die,select,draw,heal,damage,relocate:stage3Relocate,finish,endTurn};
export function publicView(s:GameState,viewer:number) {
 return structuredClone({version:s.version,revision:s.revision,mode:s.mode,round:s.round,phase:s.phase,active:s.active,order:s.order,attack:s.attack,movement:s.movement,safe:s.safe,bomb:s.bomb,forecast:s.forecast,...(s.classic?{classic:s.classic}:{}),...(s.stage3?{stage3:{turn:s.stage3.turn,equipment:s.stage3.equipment,basicUsed:s.stage3.basicUsed,breadBlocked:s.stage3.breadBlocked,breadReadyAt:s.stage3.breadReadyAt,jjFree:s.stage3.jjFree,jjExposed:s.stage3.jjExposed,horseLocks:s.stage3.horseLocks,combos:s.stage3.combos}}:{}),...(s.stage4?{stage4:stage4PublicState(s)}:{}),result:s.result,players:s.players.map(p=>({seat:p.seat,character:p.character,team:p.team,faction:p.faction,hp:p.hp,maxHp:p.maxHp,ap:p.ap,shield:p.shield,cell:p.cell,moved:p.moved,attacks:p.attacks,skillUsed:p.skillUsed,rewarded:p.rewarded,kills:p.kills,damage:p.damage,eliminated:p.eliminated,handCount:p.hand.length,...(p.seat===viewer?{hand:p.hand}:{})})),deckCount:s.deck.length,discard:s.discard,resolving:s.resolving,choice:s.choice?{id:s.choice.id,kind:s.choice.kind,actor:s.choice.actor,deadline:s.choice.deadline,source:s.choice.source,...(s.choice.actor===viewer?{cards:s.choice.cards,cells:s.choice.cells,count:s.choice.count,...(hasStage3(s.version)?{targets:s.choice.targets,data:s.choice.data,options:s.choice.options}:{})}:{})}:null,clock:s.clock,events:s.events.map(e=>({seq:e.seq,type:e.type,text:e.text,...(e.type==='dice'&&typeof e.data==='number'?{roll:e.data}:{})}))});
}
