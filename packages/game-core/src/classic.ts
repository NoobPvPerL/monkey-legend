import {hasPlaytestRules} from '../../game-data/src/index';
import {ignoreLocation} from './stage4-terrain';
import {onBoard,boardWater,boardEmptyEntry} from './stage4-board';
import {CLASSIC_RULE_VERSION,isClassicVersion,hasClassicPatch,PROTECTED_REGIONS,mapForVersion,characterTraitsForVersion,distanceForVersion} from '../../game-data/src/index';
import type {GameState} from './types';
import {integer} from './random';
export const isClassic=(s:Pick<GameState,'version'>)=>isClassicVersion(s.version);
export const water=(s:Pick<GameState,'version'|'stage4'>,cell:string,a?:number)=>boardWater(s,cell,a);
export const native=(s:GameState,a:number)=>characterTraitsForVersion(s.version,s.players[a].character).waterNative;
export function initialClassic(version:string=CLASSIC_RULE_VERSION):NonNullable<GameState['classic']>{return {poison:[],bombs:[],exposure:Array.from({length:4},()=>({region:null,streak:0})),shipUsed:[],farmClosed:false,...(hasClassicPatch(version)?{bombRound:0,caveEnds:[0,0,0,0]}:{})};}
export function enterAllowed(s:GameState,cell:string){return Boolean(mapForVersion(s.version).map[cell])&&!(s.classic?.farmClosed&&mapForVersion(s.version).map[cell].region==='高唐农场');}
export function relocated(s:GameState,a:number,from:string,to:string){
 if(!s.classic)return;
 if(mapForVersion(s.version).map[from].region!==mapForVersion(s.version).map[to].region)s.classic.exposure[a]={region:null,streak:0};
 if(hasClassicPatch(s.version)&&mapForVersion(s.version).map[from].region==='山洞'&&mapForVersion(s.version).map[to].region!=='山洞')s.classic.caveEnds![a]=0;
}
export function poisonRegions(version:string):string[]{return Object.entries(mapForVersion(version).regions).filter(([r,v])=>hasClassicPatch(version)?r!=='山洞'&&!PROTECTED_REGIONS.some(x=>x===r):v.exposure==='indoor').map(([r])=>r);}
export function bombingRegions(s:GameState):string[]{
 const protectedReady=hasClassicPatch(s.version)&&poisonRegions(s.version).every(r=>s.classic!.poison.includes(r));
 return Object.entries(mapForVersion(s.version).regions).filter(([r,v])=>!hasClassicPatch(s.version)?v.exposure==='outdoor':r!=='山洞'&&(PROTECTED_REGIONS.some(x=>x===r)?protectedReady:v.exposure==='outdoor')).map(([r])=>r);
}
export function caveEnding(s:GameState,a:number){
 if(!hasClassicPatch(s.version)||!s.classic||!onBoard(s,a))return [];
 const p=s.players[a],counts=s.classic.caveEnds!;
 counts[a]=mapForVersion(s.version).map[p.cell].region==='山洞'?counts[a]+1:0;
 if(counts[a]<3)return [];
 counts[a]=0;if(ignoreLocation(s,a))return [];const paid=Math.min(2,p.ap);p.ap-=paid;
 s.events.push({seq:++s.eventSerial,type:'cave',text:`S${a+1} 山洞连续停留3个个人回合，野人扣${paid}AP并造成1伤害`,data:{actor:a,ap:paid,amount:1}});
 return [{target:a,amount:1,source:null,category:'environment' as const}];
}
export const owesWater=(s:GameState,a:number,from?:string)=>isClassic(s)&&!ignoreLocation(s,a)&&!native(s,a)&&water(s,s.players[a].cell,a)&&(from===undefined||!water(s,from,a))&&onBoard(s,a)&&s.players[a].hand.length>0;
function pick(s:GameState,candidates:string[],count:number,scripted=false){
 const pool=[...candidates],chosen:string[]=[];
 while(pool.length&&chosen.length<count){
  const supplied=scripted?s.random.bombs.shift():undefined;
  const at=supplied===undefined?integer(s.random,pool.length):pool.indexOf(supplied);
  if(at<0)throw Error('注入轰炸地区无效或重复');chosen.push(pool.splice(at,1)[0]);
 }return chosen;
}
export function refreshClassicRound(s:GameState){
 const c=s.classic!,map=mapForVersion(s.version);
 c.poison.push(...pick(s,poisonRegions(s.version).filter(r=>!c.poison.includes(r)),2));
 c.farmClosed=s.round>=5;if(!hasClassicPatch(s.version))c.bombs=[];
 s.safe=map.cells.filter(cell=>!c.poison.includes(cell.region)).map(cell=>cell.id);s.bomb=null;s.forecast=null;
}
export function classicEnvironmentHits(s:GameState){
 const c=s.classic!,map=mapForVersion(s.version);
 c.bombs=pick(s,bombingRegions(s),2,true);if(hasClassicPatch(s.version))c.bombRound=s.round;
 return s.players.filter(p=>onBoard(s,p.seat)).map(p=>{
  const region=map.map[p.cell].region,old=c.exposure[p.seat],danger=c.poison.includes(region)||c.bombs.includes(region);
  const streak=danger?(old.region===region?old.streak+1:1):0;
  const amount=danger?2**Math.min(30,streak-1):0;
  const loss=Math.min(p.hp,Math.max(0,amount-p.shield));
  c.exposure[p.seat]=loss>0?{region,streak}:{region:null,streak:0};
  return {target:p.seat,amount,source:null,category:'environment' as const};
 });
}
// The native leap follows one straight water segment. A blocked far bank offers
// its orthogonal empty land neighbours; it never turns inside the water.
export function nativeLandings(s:GameState,a:number):string[]{
 if(!isClassic(s)||!native(s,a))return [];
 const map=mapForVersion(s.version),origin=map.map[s.players[a].cell];if(water(s,origin.id,a))return [];
 const empty=(cell:string)=>boardEmptyEntry(s,a,cell,[a]);
 const found=new Set<string>();
 for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
  let r=origin.row+dr,c=origin.col+dc,cell=map.map[`r${r}c${c}`];if(!cell||!water(s,cell.id,a))continue;
  while(cell&&water(s,cell.id,a)){if(hasPlaytestRules(s.version)&&s.players.some(p=>p.seat!==a&&onBoard(s,p.seat)&&p.cell===cell.id)){cell=undefined!;break;}r+=dr;c+=dc;cell=map.map[`r${r}c${c}`];}
  if(!cell)continue;
  if(empty(cell.id))found.add(cell.id);
  else if(!hasPlaytestRules(s.version)&&s.players.some(p=>onBoard(s,p.seat)&&p.cell===cell.id))for(const near of map.cells)if(!water(s,near.id,a)&&distanceForVersion(s.version,cell.id,near.id)===1&&empty(near.id))found.add(near.id);
 }return map.cells.filter(c=>found.has(c.id)).map(c=>c.id);
}
export function stepCost(s:GameState,a:number,cell:string):number|null{
 if(!enterAllowed(s,cell))return null;
 if(hasPlaytestRules(s.version)&&native(s,a)&&water(s,cell,a))return null;
 if(nativeLandings(s,a).includes(cell))return 1;
 return distanceForVersion(s.version,s.players[a].cell,cell)===1?(water(s,cell,a)&&!ignoreLocation(s,a)?2:1):null;
}
