import { ALL_CARDS,CARDS,CHARACTERS,CHARACTER_IDS,CELLS,MAP,RULE_VERSION,bombCandidates,definitionId,distance,neighboring,poisonDamage,safeCells,validateData } from '../../game-data/src/index';
import type {CardId} from '../../game-data/src/index';
import type {Attack,ChoiceKind,Command,DispatchResult,GameState,Player,RandomState,Ranking,Setup,Task} from './types';
export type * from './types';
const fail = (message:string):never => { throw Error(message); };
const requireRule = (condition:unknown,message:string):void => { if(!condition) fail(message); };
const alive = (p:Player) => p.hp>0;
const enemy = (s:GameState,a:number,b:number) => a!==b&&(s.mode==='ffa'||s.players[a].team!==s.players[b].team);
const emit = (s:GameState,type:string,text:string,data?:unknown) => { s.events.push({seq:++s.eventSerial,type,text,data}); };
const name = (s:GameState,id:number) => `S${id+1} ${CHARACTERS[s.players[id].character].name}`;
function uint(r:RandomState):number { r.seed=(r.seed+0x6D2B79F5)>>>0; let t=r.seed; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return (t^(t>>>14))>>>0; }
function integer(r:RandomState,n:number):number { const limit=Math.floor(4294967296/n)*n; let x=uint(r); while(x>=limit)x=uint(r); return x%n; }
function shuffled<T>(r:RandomState,items:T[]):T[] { const a=[...items]; for(let i=a.length-1;i>0;i--){ const j=integer(r,i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
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
 if(alive(p)&&!(food&&p.character==='character-027'))p.hp=Math.min(p.maxHp,p.hp+amount);
 emit(s,'heal',`${name(s,actor)} 回复${p.hp-previous}生命`);
}
export function teleportCells(s:GameState,actor:number):string[] {
 const p=s.players[actor]; return CELLS.filter(c=>c.terrain==='land'&&distance(p.cell,c.id)<=3&&!s.players.some(o=>alive(o)&&o.cell===c.id)).map(c=>c.id);
}
function select(s:GameState,kind:ChoiceKind,actor:number,now:number,extra:Partial<NonNullable<GameState['choice']>>={}):void {
 const paused=kind!=='draw-start'&&kind!=='draw-end';
 if(paused)pause(s,now);else resume(s,now);
 s.phase='choice'; s.choice={id:++s.choiceSerial,kind,actor,deadline:now+Math.min(10000,paused?10000:budget(s,now)),paused,...extra};
 emit(s,'choice',`${name(s,actor)} 等待选择：${kind}`);
}
interface Hit { target:number; amount:number; source:number|null; category:'attack'|'response'|'environment' }
function damage(s:GameState,hits:Hit[],environment=false):Task[] {
 s.batch++; const injured:{target:number;loss:number;source:number|null;category:Hit['category']}[]=[];
 for(const h of hits){
  const p=s.players[h.target];if(!alive(p)||h.amount<=0)continue;
  const blocked=environment?0:Math.min(p.shield,h.amount);p.shield-=blocked;
  const loss=Math.min(p.hp,h.amount-blocked);p.hp-=loss;
  if(h.source!==null&&enemy(s,h.source,h.target)){s.players[h.source].damage+=loss;if(p.hp===0&&loss>0)s.players[h.source].kills++;}
  emit(s,'damage',`${name(s,h.target)} ${environment?'环境':'普通'}伤害${h.amount}，护盾抵挡${blocked}，实际失血${loss}`,{...h,blocked,loss,batch:s.batch});
  if(loss>0)injured.push({...h,loss});
 }
 for(const p of s.players)if(p.hp===0&&p.eliminated===null){p.eliminated=s.batch;p.ap=0;p.shield=0;s.discard.push(...p.hand);p.hand=[];emit(s,'eliminate',`${name(s,p.seat)} 淘汰（批次${s.batch}）`);}
 const tasks:Task[]=[];
 for(const actor of s.order){
  const p=s.players[actor];const h=injured.find(x=>x.target===actor);if(!h||!alive(p))continue;
  if(p.character==='character-004'){
   if(h.source!==null&&h.category==='attack'&&enemy(s,h.source,actor)&&alive(s.players[h.source])&&!p.rewarded.includes(h.source))tasks.push({kind:'trigger',actor:h.source,trigger:'lemon-reward',source:actor});
   tasks.push({kind:'trigger',actor,trigger:'lemon-support'});
  }else if(p.character==='character-031')tasks.push({kind:'trigger',actor,trigger:'runner-roll'});
  else if(p.character==='character-037')tasks.push({kind:'trigger',actor,trigger:'teleport'});
 }
 return tasks;
}
function scores(s:GameState):Ranking[] {
 const groups=s.mode==='ffa'?s.players.map(p=>[p.seat]):[s.players.filter(p=>p.team==='A').map(p=>p.seat),s.players.filter(p=>p.team==='B').map(p=>p.seat)];
 return groups.map(ids=>({label:s.mode==='ffa'?name(s,ids[0]):`${s.players[ids[0]].team}队`,players:ids,rank:0,alive:ids.filter(i=>alive(s.players[i])).length,hp:ids.reduce((n,i)=>n+s.players[i].hp,0),maxHp:ids.reduce((n,i)=>n+s.players[i].maxHp,0),kills:ids.reduce((n,i)=>n+s.players[i].kills,0),damage:ids.reduce((n,i)=>n+s.players[i].damage,0)}));
}
export function compareScore(a:Pick<Ranking,'alive'|'hp'|'maxHp'|'kills'|'damage'>,b:Pick<Ranking,'alive'|'hp'|'maxHp'|'kills'|'damage'>):number { return b.alive-a.alive || b.hp*a.maxHp-a.hp*b.maxHp || b.kills-a.kills || b.damage-a.damage; }
function finish(s:GameState,forced:boolean,now:number):boolean {
 const rows=scores(s), surviving=rows.filter(r=>r.alive>0);
 if(!forced&&surviving.length>1)return false;
 const eliminatedAt=(r:Ranking)=>Math.max(...r.players.map(i=>s.players[i].eliminated??Infinity));
 const compare=(a:Ranking,b:Ranking):number => a.alive&&b.alive?compareScore(a,b):a.alive?-1:b.alive?1:eliminatedAt(b)-eliminatedAt(a);
 rows.sort(compare);rows.forEach((r,i)=>r.rank=i&&compare(rows[i-1],r)===0?rows[i-1].rank:i+1);
 const winners=surviving.length===0?[]:rows.filter(r=>r.rank===1).flatMap(r=>r.players);
 const tied=surviving.length===0||rows.filter(r=>r.rank===1).length>1;
 s.result={reason:tied?'draw':forced?'round-limit':'natural',winners:tied?[]:winners,ranking:rows};
 s.phase='over';s.choice=null;s.queue=[];s.movement=null;pause(s,now);
 emit(s,'result',tied?'对局结束：平局':`对局结束：${rows[0].label} 获胜`,s.result);return true;
}
function startRound(s:GameState,now:number):void {
 s.safe=safeCells(s.round);s.bomb=s.forecast?.round===s.round?s.forecast.bomb:null;s.forecast=null;
 emit(s,'round',`第${s.round}轮开始，安全格${s.safe.length}，轰炸：${s.bomb??'无'}`);
 for(const p of s.players)if(alive(p)){p.skillUsed=false;p.rewarded=[];if(p.ap<5){p.ap+=3;emit(s,'ap',`${name(s,p.seat)} 轮开始获得3AP → ${p.ap}`);}}
 const hits=s.players.filter(alive).map(p=>({target:p.seat,amount:(s.safe.includes(p.cell)?0:poisonDamage(s.round))+(MAP[p.cell].region===s.bomb?1:0),source:null,category:'environment' as const}));
 pause(s,now);s.phase='resolving';s.queue.push(...damage(s,hits,true),{kind:'after-env'});pump(s,now);
}
function next(s:GameState,now:number):void {
 pause(s,now);s.players[s.active].moved=false;s.players[s.active].attacks=0;s.cursor++;
 while(s.cursor<4&&!alive(s.players[s.order[s.cursor]]))s.cursor++;
 if(s.cursor<4){s.queue.unshift({kind:'turn-start',actor:s.order[s.cursor]});return;}
 if(s.round===12){finish(s,true,now);return;}
 let bomb:string|null=null;
 if(s.round>=2){const candidates=bombCandidates(s.round+1);const scripted=s.random.bombs.shift();bomb=scripted??candidates[integer(s.random,candidates.length)];requireRule(candidates.includes(bomb),'注入轰炸不在下轮候选区域');}
 s.forecast={round:s.round+1,safe:safeCells(s.round+1),bomb};emit(s,'forecast',`预告第${s.round+1}轮：安全格${s.forecast.safe.length}，轰炸${bomb??'无'}`,s.forecast);
 s.round++;s.cursor=0;startRound(s,now);
}
function responseCards(s:GameState,actor:number,attack:Attack):string[] { return s.players[actor].hand.filter(c=>{const id=definitionId(c);return (id==='basic-001'||(id==='basic-002'&&definitionId(attack.card)==='basic-008'))&&s.players[actor].ap>=CARDS[id].cost;}); }
function resolveAttack(s:GameState):void {
 const a=s.attack!;const def=CARDS[definitionId(a.card)];const hits:Hit[]=[];
 const targets=a.targets.filter(t=>!a.cancelled.includes(t));
 let roll=0;if(targets.length&&(def.id==='basic-006'||def.id==='basic-009'))roll=die(s,def.name);
 for(const target of targets){
  const p=s.players[target];
  if(def.power!==undefined){const amount=Math.max(0,def.power-p.ap),paid=Math.min(def.power,p.ap);p.ap-=paid;emit(s,'ap',`${name(s,target)} 被扣${paid}AP → ${p.ap}`);if(amount)hits.push({target,amount,source:a.actor,category:'attack'});}
  else if(def.id==='basic-008'){
   if(p.ap===0)hits.push({target,amount:1,source:a.actor,category:'attack'});
   else {const n=Math.min(2,p.ap);p.ap-=n;s.players[a.actor].ap+=n;emit(s,'ap',`${name(s,a.actor)} 从${name(s,target)}吸收${n}AP`);}
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
 while(!s.choice&&s.phase!=='over'&&s.queue.length){
  requireRule(++guard<200,'内部流程未收敛');const task=s.queue.shift()!;const actor=task.actor??s.active;const p=s.players[actor];
  switch(task.kind){
   case 'after-env':
    if(finish(s,false,now))break;
    s.cursor=0;while(!alive(s.players[s.order[s.cursor]]))s.cursor++;s.queue.unshift({kind:'turn-start',actor:s.order[s.cursor]});break;
   case 'turn-start':
    s.active=actor;s.phase='resolving';s.clock={remaining:60000,since:now};p.moved=false;p.attacks=0;
    if(p.character==='character-031'&&p.ap<6){p.ap=6;emit(s,'ap',`${name(s,actor)} 行动开始补至6AP`);}
    emit(s,'turn',`${name(s,actor)} 开始行动`);if(s.round>1)draw(s,actor,2);
    s.queue.unshift({kind:'action'});if(p.character==='character-027')select(s,'draw-start',actor,now);break;
   case 'action':s.phase='action';resume(s,now);break;
   case 'end-draw':
    s.queue.unshift({kind:'discard'});if(p.character==='character-027'&&alive(p)&&budget(s,now)>0)select(s,'draw-end',actor,now);break;
   case 'discard':{
    const count=p.hand.length-handLimit(p.hp);s.queue.unshift({kind:'next'});if(alive(p)&&count>0)select(s,'discard',actor,now,{count,cards:[...p.hand]});break;
   }
   case 'next':next(s,now);break;
   case 'response':if(s.attack&&alive(p)){const cards=responseCards(s,actor,s.attack);if(cards.length)select(s,'response',actor,now,{cards});}break;
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
function endTurn(s:GameState,now:number,timeout=false):void {
 if(s.movement){const p=s.players[s.active];p.cell=s.movement.lastEmpty;s.movement=null;emit(s,'move',`移动结束，落点${p.cell}，剩余额度作废`);}
 s.phase='resolving';s.queue.push({kind:timeout?'discard':'end-draw'});pump(s,now);
}
function rawTarget(s:GameState,actor:number,defId:CardId,target:number):boolean {
 const p=s.players[target];if(!p||!alive(p)||!enemy(s,actor,target))return false;
 const def=CARDS[defId];if(def.type!=='attack')return false;
 if(def.group&&p.character==='character-027'&&p.hand.length===1)return false;
 const a=MAP[s.players[actor].cell].region,b=MAP[p.cell].region;
 return def.range==='global'||a===b||(def.range==='adjacent'&&neighboring(a,b));
}
export function legalTargets(s:GameState,actor:number,card:string):number[] {
 const defId=definitionId(card),def=CARDS[defId];if(!def||def.type!=='attack')return [];
 const ids=s.players.filter(p=>rawTarget(s,actor,defId,p.seat)).map(p=>p.seat);
 const lemon=ids.find(i=>s.players[i].character==='character-004');return !def.group&&lemon!==undefined?[lemon]:ids;
}
function canEscape(s:GameState,actor:number,cell:string,remaining:number):boolean {
 if(!s.players.some(p=>p.seat!==actor&&alive(p)&&p.cell===cell))return true;
 const queue:[string,number][]=[[cell,remaining]];const best=new Map<string,number>();
 while(queue.length){const [from,left]=queue.shift()!;if((best.get(from)??-1)>=left)continue;best.set(from,left);
  for(const next of CELLS)if(distance(from,next.id)===1){const cost=next.terrain==='water'?2:1;if(cost>left)continue;if(!s.players.some(p=>p.seat!==actor&&alive(p)&&p.cell===next.id))return true;queue.push([next.id,left-cost]);}
 }return false;
}
export function legalSteps(s:GameState):string[] {
 if(s.phase!=='moving'||!s.movement)return [];
 const p=s.players[s.active];return CELLS.filter(c=>distance(p.cell,c.id)===1&&(c.terrain==='water'?2:1)<=s.movement!.remaining&&canEscape(s,p.seat,c.id,s.movement!.remaining-(c.terrain==='water'?2:1))).map(c=>c.id);
}
function choose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,timeout=false):void {
 const c=s.choice!;const p=s.players[c.actor];requireRule(cmd.choice===c.id,'选择窗口已过期');requireRule(cmd.actor===c.actor,'请交给待选择的座位操作');
 switch(c.kind){
  case 'draw-start':case 'draw-end':if(cmd.accept)draw(s,c.actor,1);break;
  case 'response':if(cmd.card){requireRule(c.cards?.includes(cmd.card),'此牌不能响应');const def=CARDS[definitionId(cmd.card)];p.ap-=def.cost;p.hand.splice(p.hand.indexOf(cmd.card),1);s.resolving.push(cmd.card);s.attack!.cancelled.push(c.actor);if(def.id==='basic-002')s.attack!.elbows.push(c.actor);emit(s,'response',`${name(s,c.actor)} 使用${def.name}，支付${def.cost}AP`);}else emit(s,'response',`${name(s,c.actor)} 放弃响应`);break;
  case 'lemon-reward':if(cmd.accept){s.players[c.source!].rewarded.push(c.actor);draw(s,c.actor,1);}break;
  case 'lemon-support':if(cmd.accept){requireRule(p.ap>=1&&!p.skillUsed,'支援不可用');p.ap--;p.skillUsed=true;for(const q of s.players)if(alive(q)&&(q.seat===c.actor||(s.mode==='team'&&q.team===p.team)))draw(s,q.seat,1);emit(s,'skill',`${name(s,c.actor)} 支援，支付1AP`);}break;
  case 'runner-roll':if(cmd.accept){requireRule(p.ap>=2&&!p.skillUsed,'恢复判定不可用');p.skillUsed=true;const roll=die(s,'跑者恢复');if(roll>=4){s.choice=null;select(s,'runner-pay',c.actor,now);return;}}break;
  case 'runner-pay':if(cmd.accept){requireRule(p.ap>=2,'恢复费用不足');p.ap-=2;heal(s,c.actor,1);emit(s,'skill',`${name(s,c.actor)} 恢复支付2AP`);}break;
  case 'teleport':if(cmd.cell){requireRule(c.cells?.includes(cmd.cell)&&teleportCells(s,c.actor).includes(cmd.cell),'传送须为距离≤3的空陆地');p.cell=cmd.cell;p.skillUsed=true;emit(s,'teleport',`${name(s,c.actor)} 传送至${cmd.cell}${s.safe.includes(cmd.cell)?'':'（毒圈外）'}`);}break;
  case 'discard':{
   const cards=cmd.cards??[];requireRule(cards.length===c.count&&new Set(cards).size===cards.length&&cards.every(card=>p.hand.includes(card)),'请选择准确数量的不同手牌弃置');
   p.hand=p.hand.filter(card=>!cards.includes(card));s.discard.push(...cards);emit(s,timeout?'timeout-discard':'discard',`${name(s,c.actor)} ${timeout?'超时代弃':'自选弃牌'}${cards.length}张`,cards);break;
  }
 }
 if(timeout)emit(s,'timeout',`${name(s,c.actor)} 选择超时：${c.kind}`);
 s.choice=null;s.phase='resolving';pump(s,now);
}
function expire(s:GameState,now:number):boolean {
 if(s.choice&&now>=s.choice.deadline){const c=s.choice;const cmd:Extract<Command,{type:'choose'}>={id:'timeout',revision:s.revision,actor:c.actor,type:'choose',choice:c.id,accept:false,card:null,cell:null,cards:c.kind==='discard'?[...s.players[c.actor].hand].sort().slice(0,c.count):undefined};
  // A personal-budget expiry skips the optional end draw; a separate discard window still gets 10 seconds.
  const personalExpired=!c.paused&&budget(s,now)===0;
  if(personalExpired){s.choice=null;s.queue=[];s.clock.remaining=0;s.clock.since=null;emit(s,'timeout','60秒行动预算用完');endTurn(s,now,true);}else choose(s,cmd,now,true);return true;
 }
 if(!s.choice&&s.clock.since!==null&&budget(s,now)===0){pause(s,now);emit(s,'timeout','60秒行动预算用完');endTurn(s,now,true);return true;}
 return false;
}
export function createGame(setup:Setup,now:number):GameState {
 requireRule(setup!==null&&typeof setup==='object'&&!Array.isArray(setup),'开局输入必须为对象');
 requireRule(Array.isArray(setup.seats)&&(setup.characters===undefined||Array.isArray(setup.characters))&&(setup.deck===undefined||Array.isArray(setup.deck)),'座位、角色和牌堆必须为数组');
 requireRule(setup.first===undefined||(Number.isInteger(setup.first)&&setup.first>=0&&setup.first<4),'首位无效');
 requireRule(setup.dice===undefined||(Array.isArray(setup.dice)&&setup.dice.every(v=>Number.isInteger(v)&&v>=1&&v<=6)),'测试骰子必须为1—6的数组');
 requireRule(setup.bombs===undefined||(Array.isArray(setup.bombs)&&setup.bombs.every(v=>typeof v==='string'&&CELLS.some(c=>c.region===v))),'测试轰炸必须为已知区域数组');
 requireRule(setup.reshuffles===undefined||(Array.isArray(setup.reshuffles)&&setup.reshuffles.every(cards=>Array.isArray(cards)&&new Set(cards).size===cards.length&&cards.every(c=>ALL_CARDS.includes(c)))),'测试重洗必须为不重复实体牌数组');
 requireRule(setup.sortedReshuffles===undefined||typeof setup.sortedReshuffles==='boolean','测试重洗开关必须为布尔值');
 requireRule(setup.teams===undefined||(Array.isArray(setup.teams)&&setup.teams.length===4&&setup.teams.filter(t=>t==='A').length===2&&setup.teams.filter(t=>t==='B').length===2),'测试队伍必须为两A两B');
 validateData();requireRule(Number.isFinite(now)&&now>=0,'时钟无效');requireRule(setup.mode==='ffa'||setup.mode==='team','模式无效');requireRule(sameSet(setup.seats,[0,1,2,3]),'必须有S1—S4四个固定座位');requireRule(Number.isInteger(setup.seed)&&setup.seed>=0&&setup.seed<=0xffffffff,'随机种子必须为uint32');
 const random:RandomState={seed:setup.seed>>>0,dice:[...(setup.dice??[])],bombs:[...(setup.bombs??[])],reshuffles:structuredClone(setup.reshuffles??[]),sortedReshuffles:setup.sortedReshuffles??false};
 const characters=setup.characters??shuffled(random,CHARACTER_IDS);requireRule(sameSet(characters,CHARACTER_IDS),'四角色必须完整且唯一');
 const teamPair=shuffled(random,[0,1,2,3]).slice(0,2);const teams=setup.teams??[0,1,2,3].map(i=>teamPair.includes(i)?'A':'B');if(setup.mode==='team')requireRule(teams.length===4&&teams.filter(t=>t==='A').length===2&&teams.filter(t=>t==='B').length===2,'团战必须2对2');
 const first=setup.first??integer(random,4);requireRule(Number.isInteger(first)&&first>=0&&first<4,'首位无效');const deck=setup.deck??shuffled(random,ALL_CARDS);requireRule(sameSet(deck,ALL_CARDS),'牌堆不是64实体的完整排列');
 const players=characters.map((character,seat)=>{const c=CHARACTERS[character];return {seat,character,team:setup.mode==='team'?teams[seat]:`S${seat+1}`,faction:c.faction,hp:c.hp,maxHp:c.hp,ap:5,shield:0,cell:c.spawn,hand:[] as string[],moved:false,attacks:0,skillUsed:false,rewarded:[],kills:0,damage:0,eliminated:null};});
 const s:GameState={version:RULE_VERSION,revision:0,time:now,mode:setup.mode,players,order:Array.from({length:4},(_,i)=>(first+i)%4),cursor:0,active:first,round:1,phase:'resolving',deck:[...deck],discard:[],resolving:[],random,queue:[],choice:null,choiceSerial:0,attack:null,movement:null,safe:safeCells(1),bomb:null,forecast:null,clock:{remaining:60000,since:null},events:[],eventSerial:0,batch:0,reshuffleCount:0,seen:[],result:null};
 emit(s,'setup',`四人${setup.mode==='ffa'?'各自为战':'2对2'} · ${RULE_VERSION}`);for(let i=0;i<4;i++)draw(s,i,4);startRound(s,now);validateState(s);return s;
}
export function validateState(s:GameState):void {
 requireRule(s.version===RULE_VERSION&&s.players.length===4&&s.round>=1&&s.round<=12,'状态版本/轮次/人数无效');requireRule(sameSet(s.players.map(p=>p.character),CHARACTER_IDS)&&sameSet(s.order,[0,1,2,3]),'角色/顺序无效');
 const zones=[...s.deck,...s.discard,...s.resolving,...s.players.flatMap(p=>p.hand)];requireRule(sameSet(zones,ALL_CARDS),'64张实体不守恒或实体重复');
 for(const p of s.players){requireRule(Number.isInteger(p.hp)&&p.hp>=0&&p.hp<=p.maxHp&&p.maxHp===CHARACTERS[p.character].hp,'生命状态无效');requireRule(Number.isInteger(p.ap)&&p.ap>=0&&Number.isInteger(p.shield)&&p.shield>=0&&p.shield<=2,'AP/护盾无效');requireRule(Boolean(MAP[p.cell]),'位置无效');if(!alive(p))requireRule(p.ap===0&&p.shield===0&&p.hand.length===0&&p.eliminated!==null,'淘汰清理无效');}
 const occupied=s.players.filter(alive);const overlap=occupied.some((p,i)=>occupied.slice(i+1).some(q=>q.cell===p.cell));if(overlap)requireRule(s.phase==='moving'&&s.movement!==null,'稳定落点不能重叠');
 requireRule(s.clock.remaining>=0&&Number.isFinite(s.clock.remaining),'计时预算无效');
}
export function dispatch(previous:GameState,cmd:Command,now:number):DispatchResult {
 try{
  requireRule(cmd!==null&&typeof cmd==='object'&&!Array.isArray(cmd),'命令必须为对象');
  requireRule(Number.isSafeInteger(cmd.actor)&&cmd.actor>=0&&cmd.actor<4&&Number.isSafeInteger(cmd.revision)&&cmd.revision>=0,'座位/命令版本必须为有效整数');
  requireRule(['play','move','step','stop','end','choose','tick'].includes(cmd.type),'未知命令');
  if(cmd.type==='play')requireRule(typeof cmd.card==='string'&&Array.isArray(cmd.targets)&&cmd.targets.every(t=>Number.isInteger(t)&&t>=0&&t<4),'出牌/目标输入无效');
  if(cmd.type==='step')requireRule(Array.isArray(cmd.path)&&cmd.path.every(c=>typeof c==='string'),'路径必须为格子数组');
  if(cmd.type==='choose'){
   requireRule(Number.isSafeInteger(cmd.choice)&&cmd.choice>0,'选择编号必须为正整数');
   requireRule(cmd.accept===undefined||typeof cmd.accept==='boolean','发动选项必须为布尔值');
   requireRule(cmd.card===undefined||cmd.card===null||typeof cmd.card==='string','响应牌输入无效');
   requireRule(cmd.cell===undefined||cmd.cell===null||typeof cmd.cell==='string','传送格输入无效');
   requireRule(cmd.cards===undefined||(Array.isArray(cmd.cards)&&cmd.cards.every(c=>typeof c==='string')),'弃牌必须为实体牌数组');
  }
  requireRule(Number.isFinite(now)&&now>=previous.time,'时钟必须单调');requireRule(cmd.revision===previous.revision,'命令版本过期');requireRule(typeof cmd.id==='string'&&cmd.id.length>0&&!previous.seen.includes(cmd.id),'重复命令');requireRule(previous.phase!=='over','对局已经结束');
  const s=structuredClone(previous);
  if(cmd.type==='tick'){
   let changed=false,count=0;
   while(s.phase!=='over'){
    const deadline=s.choice?.deadline??(s.clock.since===null?Infinity:s.clock.since+s.clock.remaining);
    if(deadline>now)break;
    requireRule(++count<1000,'超时流程未收敛');changed=expire(s,deadline)||changed;
   }
   if(!changed)return {state:previous,ok:true};
  }
  else{
   requireRule(!(s.choice?now>=s.choice.deadline:s.clock.since!==null&&budget(s,now)===0),'命令已超时，请先处理时钟事件');
   if(cmd.type==='choose'){requireRule(s.choice!==null,'当前没有选择窗口');choose(s,cmd,now);}
   else{
    requireRule(cmd.actor===s.active&&alive(s.players[cmd.actor]),'只有当前存活行动者可操作');requireRule(!s.choice,'请先完成当前选择');const p=s.players[cmd.actor];
    if(cmd.type==='step'){
     requireRule(s.phase==='moving'&&s.movement!==null,'尚未开始移动');requireRule(cmd.path.length>0,'移动路径不能为空');const m=s.movement!;
     for(const cell of cmd.path){requireRule(Boolean(MAP[cell])&&distance(p.cell,cell)===1,'只能正交移动到棋盘内相邻格');const cost=MAP[cell].terrain==='water'?2:1;requireRule(m.remaining>=cost,'移动步数不足');requireRule(canEscape(s,cmd.actor,cell,m.remaining-cost),'此路径会困在占用格');m.remaining-=cost;p.cell=cell;m.path.push(cell);if(!s.players.some(q=>q.seat!==p.seat&&alive(q)&&q.cell===cell))m.lastEmpty=cell;emit(s,'move',`${name(s,p.seat)} → ${cell}，消耗${cost}步，余${m.remaining}`);}
     if(m.remaining===0){s.movement=null;s.phase='action';}
    }else if(cmd.type==='stop'){
     requireRule(s.movement!==null,'尚未开始移动');requireRule(!s.players.some(q=>q.seat!==p.seat&&alive(q)&&q.cell===p.cell),'不能停在占用格');s.movement=null;s.phase='action';emit(s,'move','主动结束移动，未用额度作废');
    }else if(cmd.type==='end'){requireRule(!s.movement||!s.players.some(q=>q.seat!==p.seat&&alive(q)&&q.cell===p.cell),'不能在占用格结束行动，请先离开');endTurn(s,now);}
    else {
     requireRule(s.phase==='action','请先完成移动');
     if(cmd.type==='move'){requireRule(!p.moved,'本个人回合已使用基础移动');requireRule(p.ap>=1,'移动需要1AP');p.ap--;p.moved=true;const steps=Math.ceil(die(s,'基础移动')/2);s.movement={remaining:steps,lastEmpty:p.cell,origin:p.cell,path:[p.cell]};s.phase='moving';emit(s,'cost',`${name(s,p.seat)} 移动支付1AP，获得${steps}步`);}
     else if(cmd.type==='play'){
      requireRule(p.hand.includes(cmd.card),'手中没有该实体牌');const def=CARDS[definitionId(cmd.card)];requireRule(def&&def.type!=='response','响应牌只能在对应窗口使用');requireRule(p.ap>=def.cost,`需要${def.cost}AP`);
      if(def.type==='attack'){requireRule(p.attacks<2,'本回合最多两张攻击');requireRule(cmd.targets.length>=1&&cmd.targets.length<=(def.group?2:1)&&new Set(cmd.targets).size===cmd.targets.length,'目标数量无效');const legal=legalTargets(s,p.seat,cmd.card);requireRule(cmd.targets.every(t=>legal.includes(t)),'目标不合法：检查范围、队伍、lemon嘲讽或群体免疫');}
      else requireRule(cmd.targets.length===0,'补给只能对自己，不接受外部目标');
      p.ap-=def.cost;p.hand.splice(p.hand.indexOf(cmd.card),1);s.resolving.push(cmd.card);emit(s,'play',`${name(s,p.seat)} 使用${def.name}，支付${def.cost}AP${def.type==='attack'?`，目标${cmd.targets.map(t=>name(s,t)).join('、')}`:''}`,{actor:p.seat,card:cmd.card,targets:cmd.targets});
      if(def.type==='attack'){p.attacks++;s.attack={actor:p.seat,card:cmd.card,targets:[...cmd.targets],cancelled:[],elbows:[]};s.phase='resolving';s.queue.push(...s.order.filter(t=>cmd.targets.includes(t)).map(actor=>({kind:'response' as const,actor})),{kind:'resolve'});pump(s,now);}
      else {heal(s,p.seat,def.id==='basic-046'?2:1,true);if(def.id==='basic-045'){const gained=Math.min(1,2-p.shield);p.shield+=gained;emit(s,'shield',`${name(s,p.seat)} 获得${gained}护盾 → ${p.shield}`);}if(def.id==='basic-047')draw(s,p.seat,2);s.discard.push(...s.resolving);s.resolving=[];finish(s,false,now);}
     }else fail('未知命令');
    }
   }
  }
  s.seen.push(cmd.id);s.revision++;s.time=now;validateState(s);return {state:s,ok:true};
 }catch(error){return {state:previous,ok:false,error:error instanceof Error?error.message:String(error)};}
}
export function publicView(s:GameState,viewer:number) {
 return structuredClone({version:s.version,revision:s.revision,mode:s.mode,round:s.round,phase:s.phase,active:s.active,order:s.order,attack:s.attack,movement:s.movement,safe:s.safe,bomb:s.bomb,forecast:s.forecast,result:s.result,players:s.players.map(p=>({seat:p.seat,character:p.character,team:p.team,faction:p.faction,hp:p.hp,maxHp:p.maxHp,ap:p.ap,shield:p.shield,cell:p.cell,moved:p.moved,attacks:p.attacks,skillUsed:p.skillUsed,rewarded:p.rewarded,kills:p.kills,damage:p.damage,eliminated:p.eliminated,handCount:p.hand.length,...(p.seat===viewer?{hand:p.hand}:{})})),deckCount:s.deck.length,discard:s.discard,resolving:s.resolving,choice:s.choice?{id:s.choice.id,kind:s.choice.kind,actor:s.choice.actor,deadline:s.choice.deadline,source:s.choice.source,...(s.choice.actor===viewer?{cards:s.choice.cards,cells:s.choice.cells,count:s.choice.count}:{})}:null,clock:s.clock,events:s.events.map(e=>({seq:e.seq,type:e.type,text:e.text}))});
}
