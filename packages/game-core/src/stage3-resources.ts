import {boardEntryAllowed,boardWater,onBoard} from './stage4-board';
import type {Stage4State} from './stage4-state';
import {STAGE3_CARDS,STAGE3_CHARACTERS,ANIMAL_IDS} from '../../game-data/src/stage3';
import {mapForVersion,runtimeForVersion} from '../../game-data/src/index';
import {roleEffectAllowed} from './character-effects';
import source from '../../game-data/src/source-catalog.json';
import type {CharacterEffect} from './character-effects';

export interface ResourcePlayer {seat:number;character:string;team:string;faction:string;hp:number;maxHp:number;ap:number;shield:number;cell:string;hand:string[];eliminated:number|null}
export interface EquipmentSource extends CharacterEffect {faction:string}
export interface Stage3Resources {
 turn:number;completedTurn:number;starts:number[];ends:number[];deathTurns:(number|null)[];
 equipment:string[][];equipmentSources:Record<string,EquipmentSource>;
 costLocks:Record<string,{turn:number;cost:number}>;
 basicUsed:number[];voluntaryMoved:boolean[];previousBasic:(boolean|null)[];doubleMove:boolean[];
 horseLocks:number[];horseSources:Record<string,EquipmentSource>;breadReadyAt:number[];breadPending:boolean[];breadBlocked:boolean[];
 coffeeRound:boolean[];coffeeUntilStart:(number|null)[];
 jjFree:boolean[];jjExposed:boolean[];jjUsed:boolean[];
 combos:Record<string,string[]>;
}
export interface ResourceState {version?:string;stage4?:Stage4State;players:ResourcePlayer[];stage3:Stage3Resources;discard:string[]}
const four=<T>(f:()=>T)=>Array.from({length:4},f);
const id=(card:string)=>card.split('#')[0];
const resourceCatalog=(s:ResourceState)=>s.version?runtimeForVersion(s.version).cards:STAGE3_CARDS;
const need=(v:unknown,message:string):void=>{if(!v)throw Error(message);};
export function initialStage3Resources():Stage3Resources {
 return {turn:0,completedTurn:0,starts:four(()=>0),ends:four(()=>0),deathTurns:four(()=>null),equipment:four(()=>[]),equipmentSources:{},costLocks:{},basicUsed:four(()=>0),voluntaryMoved:four(()=>false),previousBasic:four(()=>null),doubleMove:four(()=>false),horseLocks:[],horseSources:{},breadReadyAt:four(()=>0),breadPending:four(()=>false),breadBlocked:four(()=>false),coffeeRound:four(()=>false),coffeeUntilStart:four(()=>null),jjFree:four(()=>false),jjExposed:four(()=>false),jjUsed:four(()=>false),combos:{}};
}
export const equipmentDefinition=(s:ResourceState,card:string)=>s.stage4?.copies[card]??id(card);
export const equipped=(s:ResourceState,a:number,definition:string)=>s.stage3.equipment[a].some(c=>equipmentDefinition(s,c)===definition&&(!s.stage4||roleEffectAllowed({...s.stage3.equipmentSources[c],origin:'equipment'},s.players[a])));
export function attackEquipmentEffect(s:ResourceState,a:number,card:string,effect:EquipmentSource):EquipmentSource {
 if(!s.stage4)return effect;const attack=resourceCatalog(s)[id(card) as keyof ReturnType<typeof resourceCatalog>]?.type==='attack';
 const modifiers=s.stage3.equipment[a].filter(c=>(attack&&['basic-053','basic-058',...(id(card)==='basic-009'?['basic-056']:[])].includes(equipmentDefinition(s,c)))||(s.stage4!.terrainIgnore[a]&&equipmentDefinition(s,c)==='basic-069')).flatMap(c=>s.stage3.equipmentSources[c]?.roleModifiers??[]);
 return {...effect,roleModifiers:[...effect.roleModifiers,...modifiers]};
}
export function startResourceTurn(s:ResourceState,a:number){
 const r=s.stage3;r.turn++;r.starts[a]++;r.basicUsed[a]=0;r.voluntaryMoved[a]=false;
 r.doubleMove[a]=equipped(s,a,'basic-066')&&r.previousBasic[a]===false;
 r.jjFree[a]=false;r.jjExposed[a]=false;r.jjUsed[a]=false;
 r.breadBlocked[a]=r.breadPending[a];r.breadPending[a]=false;
 r.horseLocks=r.horseLocks.filter(owner=>owner!==a);
 delete r.horseSources[a];
 // Entity/turn locks also expire for cards that changed hands, not only cards
 // still owned by the previous actor. A later owner must roll on its own turn.
 r.costLocks={};
}
export function endResourceTurn(s:ResourceState,a:number){
 const r=s.stage3;r.ends[a]++;r.completedTurn=r.turn;r.previousBasic[a]=r.basicUsed[a]>0;r.jjFree[a]=false;
 const horse=r.equipment[a].find(c=>equipmentDefinition(s,c)==='basic-067');
 if(s.players[a].hp>0&&horse&&!r.voluntaryMoved[a]&&!r.horseLocks.includes(a)){r.horseLocks.push(a);r.horseSources[a]={...structuredClone(r.equipmentSources[horse]),origin:'equipment'};}
}
export function mountMovementBlocked(s:ResourceState,a:number):boolean {
 const p=s.players[a];if(s.stage4?.tongBlocked[a]&&roleEffectAllowed(s.stage4.tongBlocked[a],p)&&(p.character!=='character-006'||s.stage4.tongBlocked[a].actor===a||s.stage4.tongBlocked[a].faction==='机械猴子'))return true;return s.stage3.equipment[a].some(c=>resourceCatalog(s)[id(c) as keyof ReturnType<typeof resourceCatalog>]?.slot==='mount')&&s.stage3.horseLocks.some(owner=>{
  const effect=s.stage3.horseSources[owner];return owner!==a&&s.players[owner].hp>0&&effect&&roleEffectAllowed(effect,p)&&(p.character!=='character-006'||effect.actor===a||effect.faction==='机械猴子');
 });
}
export function canEnterWithMount(s:ResourceState,a:number,cell:string):boolean {
 const c=mapForVersion('web-v0.1.5').map[cell];return Boolean(c)&&(!s.stage4||boardEntryAllowed(s,a,cell))&&!(boardWater(s,cell,a)&&(equipped(s,a,'basic-063')||Boolean(s.stage4&&equipped(s,a,'basic-064'))));
}
export function basicMoveAllowance(s:ResourceState,a:number):number{return s.stage3.doubleMove[a]?2:1;}
export function fullMovementDie(s:ResourceState,a:number):boolean{return s.stage3.doubleMove[a]&&equipped(s,a,'basic-066');}
export function fixedApCost(s:ResourceState,a:number,cost:number):number{return cost>0&&s.stage3.jjFree[a]?0:cost;}
export function cardApCost(s:ResourceState,a:number,card:string,randomCost?:number):{cost:number;effect:EquipmentSource}{
 const p=s.players[a],def=resourceCatalog(s)[id(card) as keyof ReturnType<typeof resourceCatalog>];need(def,'卡牌不在阶段三牌池');
 let cost=def.randomCost?randomCost:def.cost;need(Number.isInteger(cost)&&cost!==undefined&&(cost>=0||s.version==='web-v0.1.7'&&cost>=-1),'请先锁定该实体牌的随机费用');
 const effect:EquipmentSource={origin:'card',actor:a,faction:p.faction,roleModifiers:[]};
 if(cost!>0&&p.character==='character-006'&&(source.cards[def.id as keyof typeof source.cards].tags as readonly string[]).includes('帝汶')){cost=0;effect.roleModifiers=[...effect.roleModifiers,{actor:a,kind:'cost'}];}
 if(cost!>0&&p.character==='character-048'&&(def.id==='basic-054'||ANIMAL_IDS.some(x=>x===def.id))){cost=0;effect.roleModifiers=[...effect.roleModifiers,{actor:a,kind:'cost'}];}
 if(cost!>0&&s.stage3.jjFree[a]){cost=0;effect.roleModifiers=[...effect.roleModifiers,{actor:a,kind:'cost'}];}
 return {cost:cost!,effect};
}
export function gainAp(s:ResourceState,a:number,amount:number):{gained:number;collector:number|null;taken:number}{
 need(Number.isInteger(amount)&&amount>=0,'新增AP必须为非负整数');const p=s.players[a];if(p.hp<=0)return {gained:0,collector:null,taken:0};
 const collector=s.stage4&&equipped(s,a,'basic-065')?undefined:s.players.find(q=>onBoard(s,q.seat)&&q.character==='character-043'&&q.seat!==a&&roleEffectAllowed({origin:'role-active',actor:q.seat,roleModifiers:[]},p));
 const taken=collector?Math.min(amount,Math.max(0,p.ap+amount-7)):0;
 p.ap+=amount-taken;if(collector)collector.ap+=taken;return {gained:amount-taken,collector:taken?collector!.seat:null,taken};
}
export function resourceHealing(s:ResourceState,a:number,amount:number,food=false):number {
 const p=s.players[a];if(p.hp<=0||amount<=0||(food&&p.character==='character-027'))return 0;
 return equipped(s,a,'basic-072')?p.maxHp-p.hp:Math.min(amount,p.maxHp-p.hp);
}
export function overflowDonors(s:ResourceState,order:readonly number[]):{actor:number;count:number;collector:number}[]{
 const collector=s.players.find(p=>p.hp>0&&p.character==='character-043');if(!collector)return [];
 return order.filter(a=>a!==collector.seat&&s.players[a].hp>0&&roleEffectAllowed({origin:'role-active',actor:collector.seat,roleModifiers:[]},s.players[a]))
  .map(actor=>({actor,count:s.players[actor].hand.length-Math.floor(s.players[actor].hp),collector:collector.seat})).filter(x=>x.count>0);
}
export function transferOverflow(s:ResourceState,a:number,collector:number,cards:string[]){
 const due=overflowDonors(s,[a]).find(x=>x.actor===a&&x.collector===collector);need(due&&cards.length===due.count&&new Set(cards).size===cards.length&&cards.every(c=>s.players[a].hand.includes(c)),'超限转交牌不合法');
 s.players[a].hand=s.players[a].hand.filter(c=>!cards.includes(c));s.players[collector].hand.push(...cards);
}
export function coffeeTaken(s:ResourceState,a:number){const r=s.stage3;r.coffeeRound[a]=true;r.coffeeUntilStart[a]=r.starts[a]+1;return gainAp(s,a,8);}
export function canGainRoundAp(s:ResourceState,a:number):boolean {const r=s.stage3,skip=r.coffeeRound[a];r.coffeeRound[a]=false;return !skip;}
export function canGainStartAp(s:ResourceState,a:number):boolean {const r=s.stage3,at=r.coffeeUntilStart[a];if(at===null)return true;if(r.starts[a]<at)return true;r.coffeeUntilStart[a]=null;return false;}
export function recordDeathResources(s:ResourceState,a:number){
 const r=s.stage3;r.deathTurns[a]=r.turn;if(s.stage4)s.stage4.terrainIgnore[a]=false;r.jjFree[a]=false;r.jjExposed[a]=false;
 // Elimination is final before loss callbacks. A bread cannot resurrect its
 // owner and Hakimi cannot teleport a dead token out of the map.
 for(const card of r.equipment[a]){s.discard.push(card);delete r.equipmentSources[card];if(s.stage4){delete s.stage4.watches[card];delete s.stage4.copies[card];delete s.stage4.durability[card];}}r.equipment[a]=[];
 r.horseLocks=r.horseLocks.filter(owner=>owner!==a);
 delete r.horseSources[a];
}
export function revivalCells(s:ResourceState,target:number,farmClosed:boolean):string[]{
 const p=s.players[target],death=s.stage3.deathTurns[target];if(!p||p.hp>0||death===null||s.stage3.completedTurn>death)return [];
 const region=STAGE3_CHARACTERS[p.character]?.spawnRegion;
 return mapForVersion('web-v0.1.5').cells.filter(c=>c.region===region&&(!s.stage4||boardEntryAllowed(s,target,c.id))&&!(farmClosed&&c.region==='高唐农场')&&!s.players.some(q=>onBoard(s,q.seat)&&q.cell===c.id)).map(c=>c.id);
}
export function reviveResourcePlayer(s:ResourceState,target:number,cell:string,farmClosed:boolean){
 need(revivalCells(s,target,farmClosed).includes(cell),'复活已过期或出生地区没有合法空格');
 const p=s.players[target];Object.assign(p,{hp:1,ap:0,shield:0,hand:[],cell,eliminated:null});s.stage3.deathTurns[target]=null;
}
export function lockRevivalCost(s:ResourceState,a:number,card:string,die:()=>number):number {
 need(id(card)==='basic-037'&&s.players[a].hand.includes(card),'手中没有紫檀木');const r=s.stage3,prior=r.costLocks[card];if(prior?.turn===r.turn)return prior.cost;
 const cost=die();need(Number.isInteger(cost)&&cost>=1&&cost<=6,'复活费用骰子必须为1—6');r.costLocks[card]={turn:r.turn,cost};return cost;
}
export function equipmentReplacements(s:ResourceState,a:number,card:string):{allowed:boolean;required:boolean;cards:string[]}{
 const def=resourceCatalog(s)[id(card) as keyof ReturnType<typeof resourceCatalog>],gear=s.stage3.equipment[a];if(def?.type!=='equipment')return {allowed:false,required:false,cards:[]};
 if(gear.some(c=>id(c)===def.id))return {allowed:false,required:false,cards:[]};
 const cards=gear.filter(c=>resourceCatalog(s)[id(c) as keyof ReturnType<typeof resourceCatalog>].slot===def.slot);return {allowed:true,required:cards.length>=(def.slot==='hand'?2:1),cards};
}
export function installEquipment(s:ResourceState,a:number,card:string,source:EquipmentSource,replacement:string|null){
 const options=equipmentReplacements(s,a,card);need(options.allowed&&(!options.required||replacement!==null)&&(!replacement||options.cards.includes(replacement)),'装备同名或替换对象不合法');
 if(replacement){s.stage3.equipment[a]=s.stage3.equipment[a].filter(c=>c!==replacement);s.discard.push(replacement);delete s.stage3.equipmentSources[replacement];}
 s.stage3.equipment[a].push(card);s.stage3.equipmentSources[card]=structuredClone(source);return replacement;
}
export function breadUseAllowed(s:ResourceState,a:number):boolean {return equipped(s,a,'basic-054')&&s.stage3.starts[a]>=s.stage3.breadReadyAt[a];}
export function useBread(s:ResourceState,a:number,target:number){
 need(breadUseAllowed(s,a)&&a!==target&&s.players[target]?.hp>0,'面包技能暂不可用或目标不合法');s.stage3.breadReadyAt[a]=s.stage3.starts[a]+2;s.stage3.breadPending[target]=true;
}
export function recordCombo(s:ResourceState,a:number,card:string){const key=s.players[a].team,used=s.stage3.combos[key]??[];if(!used.includes(id(card)))s.stage3.combos[key]=[...used,id(card)];}
export function comboTeams(s:ResourceState):string[]{
 return [...new Set(s.players.filter(p=>p.hp>0&&((p.character==='character-010'&&['basic-015','basic-016','basic-037'].every(id=>s.stage3.combos[p.team]?.includes(id)))||(p.character==='character-045'&&['basic-046','basic-041','basic-047'].every(id=>s.stage3.combos[p.team]?.includes(id))))).map(p=>p.team))];
}
