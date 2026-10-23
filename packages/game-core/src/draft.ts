import {CLASSIC_RULE_VERSION,sourceCatalogForVersion,runtimeForVersion,mapForVersion,hasP3DRules,hasP3HRules} from '../../game-data/src/index';
import {integer,shuffled} from './random';
import {STAGE3_RULE_VERSION} from '../../game-data/src/stage3';
import {factionDraftPools} from '../../game-data/src/character-affiliation';
import type {Mode,RandomState} from './types';

export const DRAFT_WINDOW_MS=30000;
export const DRAFT_CATALOG_VERSION=CLASSIC_RULE_VERSION;
export type DraftCatalogVersion=typeof DRAFT_CATALOG_VERSION|typeof STAGE3_RULE_VERSION|'web-v0.1.7'|'web-v0.1.8'|'web-v0.1.9'|'web-v0.1.10'|'web-v0.1.11'|'web-v0.1.12'|'web-v0.1.13'|'web-v0.1.14'|'web-v0.1.15'|'web-v0.1.16'|'web-v0.1.17'|'web-v0.1.18'|'web-v0.1.19';
export interface DraftSetup {mode:Mode;order:number[];teams:string[];pools:Record<string,string[]>;random:RandomState;catalogVersion?:DraftCatalogVersion}
export interface DraftOffer {id:number;actor:number;candidates:string[];deadline:number}
export interface DraftEvent {seq:number;kind:'offer'|'pick';actor:number;at:number;character?:string;timedOut?:boolean}
export interface DraftState extends DraftSetup {
 version:'draft-v1';catalogVersion:DraftCatalogVersion;revision:number;time:number;
 status:'choosing'|'complete';cursor:number;offerSerial:number;offer:DraftOffer|null;
 selected:(string|null)[];events:DraftEvent[];requests:{id:string;payload:DraftCommand}[];
}
export type DraftCommand={id:string;revision:number;actor:number}&({type:'pick';offer:number;character:string}|{type:'tick'});
export interface DraftDispatch {state:DraftState;ok:boolean;error?:string;duplicate?:boolean}
const need=(value:unknown,message:string):void=>{if(!value)throw Error(message);};
const ids=(version:DraftCatalogVersion)=>Object.keys(sourceCatalogForVersion(version).characters);
const customSpawn=(version:string,id:string)=>hasP3HRules(version)&&id==='character-035';
const same=(a:unknown[],b:unknown[])=>a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]);
function spawnPool(s:Pick<DraftState,'catalogVersion'|'selected'>,pool:string[]){
 if(!hasP3DRules(s.catalogVersion))return [...pool];
 const catalog=sourceCatalogForVersion(s.catalogVersion).characters,cells=mapForVersion(s.catalogVersion).cells;
 return pool.filter(id=>{if(customSpawn(s.catalogVersion,id))return true;const region=catalog[id].spawnRegion;return s.selected.filter(p=>p!==null&&catalog[p].spawnRegion===region).length<cells.filter(c=>c.region===region).length;});
}
// Four seats only. Broad production pools pass the bound immediately; narrow
// custom pools are checked over all possible prefixes before any RNG is used.
function spawnSafe(s:Pick<DraftState,'catalogVersion'|'selected'|'pools'|'teams'|'order'|'cursor'>):boolean{
 if(s.cursor===4||!hasP3DRules(s.catalogVersion))return true;
 const catalog=sourceCatalogForVersion(s.catalogVersion).characters,cells=mapForVersion(s.catalogVersion).cells;
 const future=s.order.slice(s.cursor).map(a=>spawnPool(s,s.pools[s.teams[a]]).filter(id=>!s.selected.includes(id)));
 if(future.some(p=>p.length<3))return false;
 const safe=future.every((pool,i)=>{let extra=0;for(const region of new Set(pool.filter(id=>!customSpawn(s.catalogVersion,id)).map(id=>catalog[id].spawnRegion))){const slots=cells.filter(c=>c.region===region).length-s.selected.filter(id=>id!==null&&catalog[id].spawnRegion===region).length;if(slots<=i)extra+=Math.max(0,pool.filter(id=>catalog[id].spawnRegion===region).length-slots);}return pool.length-i-extra>=3;});
 if(safe)return true;
 return future[0].every(id=>{const selected=[...s.selected];selected[s.order[s.cursor]]=id;return spawnSafe({...s,selected,cursor:s.cursor+1});});
}
function offerNext(s:DraftState,at:number){
 if(s.cursor===4){s.status='complete';s.offer=null;return;}
 const actor=s.order[s.cursor],pool=spawnPool(s,s.pools[s.teams[actor]]),candidates:string[]=[];
 need(pool.length>=3,'角色池不足三个候选，不能开始选择');
 for(let i=0;i<3;i++)candidates.push(pool.splice(integer(s.random,pool.length),1)[0]);
 s.offer={id:++s.offerSerial,actor,candidates,deadline:at+DRAFT_WINDOW_MS};
 s.events.push({seq:s.events.length+1,kind:'offer',actor,at});
}
export function createDraft(setup:DraftSetup,now:number):DraftState {
 need(setup&&typeof setup==='object'&&!Array.isArray(setup),'选角输入必须为对象');
 need(Number.isFinite(now)&&now>=0,'选角时钟无效');
 const catalogVersion=setup.catalogVersion??DRAFT_CATALOG_VERSION;need(catalogVersion===DRAFT_CATALOG_VERSION||(catalogVersion===STAGE3_RULE_VERSION||catalogVersion==='web-v0.1.7'||catalogVersion==='web-v0.1.8'||catalogVersion==='web-v0.1.9'||catalogVersion==='web-v0.1.10'||catalogVersion==='web-v0.1.11'||catalogVersion==='web-v0.1.12'||catalogVersion==='web-v0.1.13'||catalogVersion==='web-v0.1.14'||catalogVersion==='web-v0.1.15'||catalogVersion==='web-v0.1.16'||catalogVersion==='web-v0.1.17'||catalogVersion==='web-v0.1.18'||catalogVersion==='web-v0.1.19'),'选角目录版本无效');
 need(Array.isArray(setup.order)&&same(setup.order,[0,1,2,3]),'选角需要四个固定座位的行动顺序');
 need(setup.mode==='ffa'||setup.mode==='team','选角模式无效');
 need(Array.isArray(setup.teams)&&setup.teams.length===4,'选角阵营需要四个座位');
 if(setup.mode==='team')need(setup.teams.filter(t=>t==='机械猴子').length===2&&setup.teams.filter(t=>t==='帝汶家族').length===2,'选角须先分配两名机械猴子和两名帝汶家族');
 else need(setup.teams.every((t,i)=>t===`S${i+1}`),'各自为战的选角身份无效');
 need(setup.pools&&typeof setup.pools==='object'&&!Array.isArray(setup.pools)&&same(Object.keys(setup.pools),[...new Set(setup.teams)]),'角色阵营池尚未完整配置');
 for(const pool of Object.values(setup.pools))need(Array.isArray(pool)&&pool.length>=3&&new Set(pool).size===pool.length&&pool.every(id=>ids(catalogVersion).includes(id)),'角色池必须包含至少三个不同的已登记角色');
 // Check sufficient capacity before drawing, including overlap between team
 // pools. Never accept a setup that can trap a later player below three.
 for(let i=0;i<4;i++){
  const pool=setup.pools[setup.teams[setup.order[i]]];
  const overlaps=setup.order.slice(0,i).filter(a=>setup.pools[setup.teams[a]].some(id=>pool.includes(id))).length;
  need(pool.length>=3+overlaps,'角色池可能不足三个候选，请补齐阵营或中立分配');
 }
 need(setup.random&&Number.isInteger(setup.random.seed)&&setup.random.seed>=0&&setup.random.seed<=0xffffffff,'选角随机源无效');
 const state:DraftState={mode:setup.mode,order:[...setup.order],teams:[...setup.teams],pools:structuredClone(setup.pools),random:structuredClone(setup.random),version:'draft-v1',catalogVersion,revision:0,time:now,status:'choosing',cursor:0,offerSerial:0,offer:null,selected:[null,null,null,null],events:[],requests:[]};
 need(spawnSafe(state),'出生容量过滤后角色池可能不足三个候选，请补齐角色池');
 offerNext(state,now);validateDraft(state);return state;
}
function pick(s:DraftState,character:string,at:number,timedOut:boolean){
 const o=s.offer!;need(o.candidates.includes(character)&&s.selected.every(id=>id!==character),'角色不在本次候选或已经被选中');
 s.selected[o.actor]=character;
 for(const key of Object.keys(s.pools))s.pools[key]=s.pools[key].filter(id=>id!==character);
 s.events.push({seq:s.events.length+1,kind:'pick',actor:o.actor,character,at,timedOut});
 s.cursor++;offerNext(s,at);
}
export function validateDraft(s:DraftState){
 need((s.status==='choosing'||s.status==='complete')&&s.version==='draft-v1'&&(s.catalogVersion===DRAFT_CATALOG_VERSION||s.catalogVersion===STAGE3_RULE_VERSION||s.catalogVersion==='web-v0.1.7'||s.catalogVersion==='web-v0.1.8'||s.catalogVersion==='web-v0.1.9'||s.catalogVersion==='web-v0.1.10'||s.catalogVersion==='web-v0.1.11'||s.catalogVersion==='web-v0.1.12'||s.catalogVersion==='web-v0.1.13'||s.catalogVersion==='web-v0.1.14'||s.catalogVersion==='web-v0.1.15'||s.catalogVersion==='web-v0.1.16'||s.catalogVersion==='web-v0.1.17'||s.catalogVersion==='web-v0.1.18'||s.catalogVersion==='web-v0.1.19')&&same(s.order,[0,1,2,3])&&s.selected.length===4,'选角状态版本或座位无效');
 const chosen=s.selected.filter(id=>id!==null);need(chosen.length===s.cursor&&new Set(chosen).size===chosen.length&&chosen.every(id=>ids(s.catalogVersion).includes(id)),'已选角色无效或重复');
 if(hasP3DRules(s.catalogVersion)){const catalog=sourceCatalogForVersion(s.catalogVersion).characters,cells=mapForVersion(s.catalogVersion).cells;need(chosen.every(id=>customSpawn(s.catalogVersion,id)||chosen.filter(p=>catalog[p!].spawnRegion===catalog[id!].spawnRegion).length<=cells.filter(c=>c.region===catalog[id!].spawnRegion).length),'已选角色超过出生地区容量');}
 need(s.order.every((a,i)=>(s.selected[a]!==null)===(i<s.cursor)),'选角顺序不一致');
 need(Object.values(s.pools).every(pool=>pool.every(id=>!chosen.includes(id))),'已选角色没有移出牌池');
 if(s.status==='complete')need(s.cursor===4&&s.offer===null,'选角结束状态无效');
 else need(s.cursor>=0&&s.cursor<4&&s.offer&&s.offer.actor===s.order[s.cursor]&&s.offer.id===s.offerSerial&&s.offer.candidates.length===3&&new Set(s.offer.candidates).size===3&&s.offer.candidates.every(id=>spawnPool(s,s.pools[s.teams[s.offer!.actor]]).includes(id))&&Number.isFinite(s.offer.deadline),'当前候选或选择期限无效');
}
export function dispatchDraft(previous:DraftState,cmd:DraftCommand,now:number):DraftDispatch {
 try{
  need(cmd&&typeof cmd==='object'&&!Array.isArray(cmd),'选角命令必须为对象');
  need(cmd.type==='pick'||cmd.type==='tick','未知选角命令');
  const allowed=cmd.type==='pick'?['id','revision','actor','type','offer','character']:['id','revision','actor','type'];
  need(Object.keys(cmd).every(k=>allowed.includes(k)),'选角命令含不允许的字段');
  need(typeof cmd.id==='string'&&cmd.id.length>0&&cmd.id.length<=100&&!/[^A-Za-z0-9_-]/.test(cmd.id)&&Number.isSafeInteger(cmd.actor)&&cmd.actor>=0&&cmd.actor<4&&Number.isSafeInteger(cmd.revision)&&cmd.revision>=0,'选角命令身份或编号无效');
  if(cmd.type==='pick')need(Number.isSafeInteger(cmd.offer)&&cmd.offer>0&&typeof cmd.character==='string','选角选择输入无效');
  need(Number.isFinite(now)&&now>=previous.time,'选角时钟必须单调');
  const receipt=previous.requests.find(r=>r.id===cmd.id);
  if(receipt){need(same(Object.keys(receipt.payload),Object.keys(cmd))&&Object.entries(receipt.payload).every(([k,v])=>v===(cmd as unknown as Record<string,unknown>)[k]),'同一请求编号不能替换内容');return {state:previous,ok:true,duplicate:true};}
  need(previous.status==='choosing','选角已经结束');need(cmd.revision===previous.revision,'选角状态版本过期');
  const s=structuredClone(previous);
  if(cmd.type==='tick'){
   let changed=false;
   while(s.offer&&now>=s.offer.deadline){const o=s.offer;pick(s,o.candidates[integer(s.random,3)],o.deadline,true);changed=true;}
   if(!changed)return {state:previous,ok:true};
  }else{
   need(s.offer&&now<s.offer.deadline,'选角已经超时，请先同步时钟');
   need(cmd.actor===s.offer!.actor&&cmd.offer===s.offer!.id,'请由当前选角者操作有效窗口');pick(s,cmd.character,now,false);
  }
  s.revision++;s.time=now;s.requests.push({id:cmd.id,payload:structuredClone(cmd)});validateDraft(s);return {state:s,ok:true};
 }catch(error){return {state:previous,ok:false,error:error instanceof Error?error.message:String(error)};}
}
// Null viewer means an authenticated spectator, not an anonymous observer.
export function draftView(s:DraftState,viewer:number|null){
 need(viewer===null||Number.isInteger(viewer)&&viewer>=0&&viewer<4,'选角视图身份无效');
 return structuredClone({version:s.version,catalogVersion:s.catalogVersion,revision:s.revision,mode:s.mode,status:s.status,order:s.order,teams:s.teams,selected:s.selected,
  offer:s.offer?{id:s.offer.id,actor:s.offer.actor,deadline:s.offer.deadline,...(viewer===null||viewer===s.offer.actor?{candidates:s.offer.candidates}:{})}:null,events:s.events});
}
export type DraftView=ReturnType<typeof draftView>;
// Authoritative caller supplies the RNG. Client intents never supply a seed,
// team, pool, first seat, deadline or candidate list.
export function createStage3Draft(mode:Mode,random:RandomState,now:number,catalogVersion:DraftCatalogVersion=STAGE3_RULE_VERSION):DraftState {
 const rng=structuredClone(random),first=integer(rng,4),pair=shuffled(rng,[0,1,2,3]).slice(0,2);
 const teams=mode==='team'?[0,1,2,3].map(a=>pair.includes(a)?'机械猴子':'帝汶家族'):[0,1,2,3].map(a=>`S${a+1}`);
 const available=runtimeForVersion(catalogVersion).characterIds;
 const pools=mode==='team'?factionDraftPools(available):Object.fromEntries(teams.map(t=>[t,[...available]]));
 return createDraft({mode,order:[0,1,2,3].map(i=>(first+i)%4),teams,pools,random:rng,catalogVersion},now);
}
