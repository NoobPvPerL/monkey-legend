import {mapForVersion,distanceForVersion} from '../../game-data/src/index';
import {roleEffectAllowed} from './character-effects';
import type {Stage4State,RegionEffect} from './stage4-state';
import type {EquipmentSource} from './stage3-resources';
export interface BoardState {
 version?:string;mode?:string;players:{seat:number;cell:string;hp:number;character:string;faction?:string;team:string}[];
 stage4?:Stage4State;stage3?:{equipment:string[][];starts:number[]};classic?:{farmClosed:boolean};farmClosed?:boolean;
}
const map=(s:BoardState)=>mapForVersion(s.version??'web-v0.1.6');
export const onBoard=(s:Pick<BoardState,'players'|'stage4'>,a:number)=>s.players[a]?.hp>0&&!s.stage4?.offMap[a];
export function boardEffectAllowed(s:BoardState,a:number,source:EquipmentSource,tag?:string):boolean {
 const p=s.players[a];return Boolean(p)&&roleEffectAllowed(source,p)&&
  !(p.character==='character-006'&&source.actor!==a&&source.faction!=='机械猴子')&&!(p.character==='character-005'&&tag==='建民');
}
export function boardWater(s:Pick<BoardState,'version'|'stage4'>,cell:string,a?:number):boolean {
 const c=mapForVersion(s.version??'web-v0.1.6').map[cell];if(!c)return false;
 const effect=s.stage4?.water[c.region];
 return c.terrain==='water'||Boolean(effect&&(a===undefined||boardEffectAllowed(s as BoardState,a,effect.effect)));
}
export function boardEntryAllowed(s:BoardState,a:number,cell:string):boolean {
 const c=map(s).map[cell];if(!c)return false;
 if((s.classic?.farmClosed??s.farmClosed)&&c.region==='高唐农场')return false;
 if(boardWater(s,cell,a)&&s.stage3?.equipment[a].some(card=>['basic-063','basic-064'].includes(s.stage4?.copies[card]??card.split('#')[0])))return false;
 return !(s.stage4?.blocks??[]).some(b=>b.region===c.region&&s.players[b.owner].hp>0&&s.stage3!.starts[b.owner]<b.until&&
  a!==b.owner&&!(s.mode==='team'&&s.players[a].team===s.players[b.owner].team)&&!b.exempt.includes(a)&&boardEffectAllowed(s,a,b.effect,'建民'));
}
export function boardEmptyEntry(s:BoardState,a:number,cell:string,ignore:readonly number[]=[]):boolean {
 return boardEntryAllowed(s,a,cell)&&!s.players.some(p=>onBoard(s,p.seat)&&p.cell===cell&&!ignore.includes(p.seat));
}
export function boardSingleProtected(s:BoardState,source:number,target:number):boolean {
 const effect=s.stage4?.toiletEffects[target];
 return source!==target&&Boolean(s.stage4?.toiletUntil[target]!==null&&s.stage4?.toiletUntil[target]!==undefined)&&(!effect||boardEffectAllowed(s,source,effect));
}
export function boardLmmTarget(s:BoardState,actor:number,candidates:readonly number[]):number|null {
 return [...candidates].sort((a,b)=>(s.stage4?.lmmSerial[b]??0)-(s.stage4?.lmmSerial[a]??0)).find(a=>onBoard(s,a)&&a!==actor&&(s.mode!=='team'||s.players[a].team!==s.players[actor].team)&&s.stage4?.lmmUntil[a]!==null&&s.stage4?.lmmUntil[a]!==undefined&&(!s.stage4?.lmmEffects[a]||boardEffectAllowed(s,actor,s.stage4.lmmEffects[a])))??null;
}
export function expireBoardStatuses(s:BoardState,a:number){
 const r=s.stage4;if(!r||!s.stage3)return;
 if(r.toiletUntil[a]!==null&&s.stage3.starts[a]>=r.toiletUntil[a]!){r.toiletUntil[a]=null;delete r.toiletEffects[a];}
 if(r.lmmUntil[a]!==null&&s.stage3.starts[a]>=r.lmmUntil[a]!){r.lmmUntil[a]=null;delete r.lmmEffects[a];}
 r.blocks=r.blocks.filter(b=>s.players[b.owner].hp>0&&s.stage3!.starts[b.owner]<b.until);
}
export function currentDesert(s:BoardState,a:number):RegionEffect|null {
 const region=map(s).map[s.players[a].cell]?.region,source=region?s.stage4?.deserts[region]:undefined;
 return onBoard(s,a)&&source&&boardEffectAllowed(s,a,source.effect)?source:null;
}
export function forcedRegionDistance(s:BoardState,a:number,region:string):number {
 const cells=map(s).cells.filter(c=>c.region===region);return cells.length?Math.min(...cells.map(c=>distanceForVersion(s.version??'web-v0.1.6',s.players[a].cell,c.id))):Infinity;
}
/** All shortest legal path prefixes. No RNG, AP charge or player mutation. */
export function forcedRegionPaths(s:BoardState,a:number,region:string,limit:number):string[][] {
 if(!onBoard(s,a)||!Number.isInteger(limit)||limit<1)return [];
 const m=map(s),start=s.players[a].cell;
 if(m.map[start].region===region)return [[]];
 const distances=new Map<string,number>([[start,0]]),parents=new Map<string,string[]>(),queue=[start];let goal=Infinity;const goals:string[]=[];
 while(queue.length){
  const from=queue.shift()!,distance=distances.get(from)!;if(distance>=goal)continue;
  if(from!==start&&m.map[from].region==='山洞')continue;
  for(const c of m.cells){
   if(distanceForVersion(s.version??'web-v0.1.6',from,c.id)!==1||!boardEmptyEntry(s,a,c.id,[a]))continue;
   const next=distance+1;if(distances.has(c.id)&&distances.get(c.id)!<next)continue;
   if(!distances.has(c.id)){distances.set(c.id,next);queue.push(c.id);parents.set(c.id,[]);}
   parents.get(c.id)!.push(from);
   if(c.region===region){goal=next;if(!goals.includes(c.id))goals.push(c.id);}
  }
 }
 const paths=new Map<string,string[]>();
 function collect(cell:string,tail:string[]){
  if(cell===start){const path=tail.slice(0,limit);paths.set(path.join(','),path);return;}
  for(const parent of parents.get(cell)??[])collect(parent,[cell,...tail]);
 }
 for(const end of goals.filter(g=>distances.get(g)===goal))collect(end,[]);
 return [...paths].sort(([a],[b])=>a.localeCompare(b,'en')).map(([,path])=>path);
}
