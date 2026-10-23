import {hBlocks,hSmall} from './p3-h-occupancy';
import {hasP3HRules} from '../../game-data/src/index';
import {gEnabled} from './p3-g-state';
import {hasP3FRules,hasP3ERules,hasP3DRules,hasP3CRules,hasPlaytestRules,characterTraitsForVersion,mapForVersion,distanceForVersion} from '../../game-data/src/index';
import {boardWater,boardEntryAllowed,onBoard} from './stage4-board';
import type {BoardState} from './stage4-board';
import type {ChoiceKind} from './types';
const roleChoices=new Set<string>(['draw-start','draw-end','lemon-reward','lemon-support','runner-roll','runner-pay','teleport','easy','qb-pursuit','east-start','xiao-overflow','xie-ledger','elbow-push','west-carry']);
export const roleChoice=(version:string,kind:string)=>hasP3HRules(version)&&['h-equip-draw','h-small','h-birth','h-respect','h-ren-retreat','h-ren-back','h-ren-expel','h-ren-gear','h-cooperate','h-circle-pay','h-attract','h-reroll','h-six'].includes(kind)||gEnabled(version)&&['g-haki','g-food','g-invisible','g-program','g-math','g-counter','g-white-eye'].includes(kind)||hasPlaytestRules(version)&&(roleChoices.has(kind)||hasP3FRules(version)&&kind.startsWith('f-')&&kind!=='f-discard'||hasP3ERules(version)&&['move-consent','egg-move','force-step'].includes(kind)||hasP3DRules(version)&&kind==='encourage'||hasP3CRules(version)&&kind==='primitive-food');
export const choiceWindowMs=(version:string,kind:ChoiceKind)=>roleChoice(version,kind)?30000:(kind==='g-discard'&&gEnabled(version)||kind==='f-discard'&&hasP3FRules(version)||kind==='encourage-discard'&&hasP3DRules(version)||kind==='discard')&&version!=='web-v0.1.1'?20000:10000;
export const waterNative=(s:BoardState,a:number)=>characterTraitsForVersion(s.version!,s.players[a].character).waterNative;
export function relocationCell(s:BoardState,a:number,from:string,to:string,ignore:readonly number[]=[]):string|null {
 if(!hasPlaytestRules(s.version))return to;
 const map=mapForVersion(s.version!).map,start=map[from];let cell=map[to];if(!start||!cell)return null;
 const legal=(id:string)=>boardEntryAllowed(s,a,id)&&!s.players.some(p=>p.seat!==a&&!ignore.includes(p.seat)&&onBoard(s,p.seat)&&p.cell===id&&hBlocks(s,a,p.seat));
 if(!legal(to))return null;
 if(!waterNative(s,a)||!boardWater(s,to,a))return to;
 const dr=Math.sign(cell.row-start.row),dc=Math.sign(cell.col-start.col);if(!dr&&!dc)return null;
 while(cell&&boardWater(s,cell.id,a)){
  if(!legal(cell.id))return null;
  cell=map[`r${cell.row+dr}c${cell.col+dc}`];
 }
 return cell&&legal(cell.id)?cell.id:null;
}
export function nearestShore(s:BoardState,a:number,reserved:readonly string[]=[]):string[]{
 const cells=mapForVersion(s.version!).cells.filter(c=>!boardWater(s,c.id,a)&&boardEntryAllowed(s,a,c.id)&&!reserved.includes(c.id)&&!s.players.some(p=>p.seat!==a&&onBoard(s,p.seat)&&p.cell===c.id&&hBlocks(s,a,p.seat)));
 const min=Math.min(...cells.map(c=>distanceForVersion(s.version!,s.players[a].cell,c.id)));
 return cells.filter(c=>distanceForVersion(s.version!,s.players[a].cell,c.id)===min).map(c=>c.id).sort();
}
export type NorthGroup='north'|'others';
export function northTargets(s:Pick<BoardState,'version'|'players'>,targets:number[],group?:NorthGroup,automatic=false):number[]{
 if(!hasPlaytestRules(s.version))return targets;
 const north=targets.find(a=>s.players[a].character==='character-006');
 if(north===undefined||!targets.some(a=>a!==north&&s.players[a].faction!=='机械猴子'))return targets;
 if(!automatic||!group)throw Error('北帝汶与其他非机械猴子不能同时指定；请选择目标分支');
 return targets.filter(a=>group==='north'?a===north||s.players[a].faction==='机械猴子':a!==north);
}
