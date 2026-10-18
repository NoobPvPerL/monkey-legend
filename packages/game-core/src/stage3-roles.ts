import {relocationCell} from './playtest';
import {hasPlaytestRules,hasCardFeedbackRules} from '../../game-data/src/index';
import {locationCardAllowed} from './locations';
import {onBoard,boardSingleProtected,boardLmmTarget} from './stage4-board';
import {distanceForVersion,mapForVersion,neighboringForVersion} from '../../game-data/src/index';
import {STAGE3_CARDS} from '../../game-data/src/stage3';
import {runtimeForVersion} from '../../game-data/src/versions';
import source from '../../game-data/src/source-catalog.json';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import {canEnterWithMount,mountMovementBlocked,equipped} from './stage3-resources';
import {roleEffectAllowed,modifiedByRole} from './character-effects';
import type {CharacterEffect} from './character-effects';

export type Direction='up'|'right'|'down'|'left';
export const DIRECTIONS:readonly Direction[]=['up','right','down','left'];
const vector:Record<Direction,[number,number]>={up:[-1,0],right:[0,1],down:[1,0],left:[0,-1]};
const opposite:Record<Direction,Direction>={up:'down',right:'left',down:'up',left:'right'};
const version='web-v0.1.5';
const map=mapForVersion(version);
export interface RoleBoard extends ResourceState {mode:'ffa'|'team';farmClosed:boolean}
const alive=(s:ResourceState,a:number)=>s.players[a]?.hp>0;
const sameOrNear=(a:string,b:string)=>map.map[a].region===map.map[b].region||neighboringForVersion(version,map.map[a].region,map.map[b].region);
const enemy=(s:RoleBoard,a:number,b:number)=>a!==b&&(s.mode==='ffa'||s.players[a].team!==s.players[b].team);
export function cardEffectAllowed(s:ResourceState,target:number,card:string,effect:EquipmentSource):boolean {
 const p=s.players[target],id=card.split('#')[0];if(!p||s.stage4?.offMap[target]||!roleEffectAllowed(effect,p))return false;
 if(!hasPlaytestRules(s.version)&&p.character==='character-006'&&effect.actor!==target&&effect.faction!=='机械猴子')return false;
 // A conversion supplies basic-002 here, not the material's printed identity.
 if(p.character==='character-005'&&(source.cards[id as keyof typeof source.cards]?.tags as readonly string[]|undefined)?.includes('建民'))return false;
 return true;
}
export function roleTargets(s:ResourceState,actor:number,origin:'role-active'|'role-locked'):number[]{
 const effect:CharacterEffect={origin,actor,roleModifiers:[]};return s.players.filter(p=>p.seat!==actor&&onBoard(s,p.seat)&&roleEffectAllowed(effect,p)).map(p=>p.seat);
}
export function withExposedJj(s:ResourceState,actor:number,card:string,targets:number[],effect:EquipmentSource):{targets:number[];effect:EquipmentSource}{
 const def=((s.version?runtimeForVersion(s.version).cards:STAGE3_CARDS) as Record<string,import('../../game-data/src/stage3').Stage3Card>)[card.split('#')[0]],proactiveElbow=def?.id==='basic-002'&&(s.players[actor].character==='character-023'||hasCardFeedbackRules(s.version)&&s.stage4?.tea[actor]);if(!def||def.type==='equipment'||def.type==='response'&&!proactiveElbow||def.id==='basic-037')return {targets:[...targets],effect};
 if(hasCardFeedbackRules(s.version)&&def.type!=='attack'&&!(def.id==='basic-002'&&(proactiveElbow||s.stage4?.tea[actor])))return {targets:[...targets],effect};
 const jj=s.players.find(p=>p.hp>0&&p.character==='character-003'&&p.seat!==actor&&s.stage3.jjExposed[p.seat]);
 if(!jj||!onBoard(s,jj.seat)||targets.includes(jj.seat)||s.stage4&&(def.type==='attack'||hasCardFeedbackRules(s.version)&&proactiveElbow)&&!def.group&&(boardSingleProtected(s,actor,jj.seat)||boardLmmTarget(s,actor,targets)!==null))return {targets:[...targets],effect};
 const changed={...modifiedByRole(effect,{actor:jj.seat,kind:'target'}),faction:effect.faction};
 return {targets:[...targets,jj.seat],effect:changed};
}
export function monkeyTargets(s:RoleBoard,a:number):number[]{
 const p=s.players[a],boost=p.character==='character-045',ignore=hasCardFeedbackRules(s.version)&&s.stage4?.terrainIgnore[a]&&equipped(s,a,'basic-069');if(!boost&&!ignore&&(hasCardFeedbackRules(s.version)?!locationCardAllowed(s.version!,p.cell,'basic-010'):['教学楼','秀松苑'].includes(map.map[p.cell].region)))return [];
 return s.players.filter(q=>onBoard(s,q.seat)&&enemy(s,a,q.seat)&&!(q.character==='character-027'&&q.hand.length===1)&&(boost||sameOrNear(p.cell,q.cell))).map(q=>q.seat);
}
export function monkeyLedgerCandidates(s:ResourceState,xie:number,user:number,actualParticipants:readonly number[]):number[]{
 const p=s.players[xie];if(!alive(s,xie)||p.character!=='character-044')return [];
 return [...new Set([user,...actualParticipants])].filter(a=>a!==xie&&alive(s,a)&&roleEffectAllowed({origin:'role-active',actor:xie,roleModifiers:[]},s.players[a])&&(map.map[s.players[a].cell].region===map.map[p.cell].region||distanceForVersion(version,p.cell,s.players[a].cell)===1));
}
export function eastTargets(s:ResourceState,a:number,kind:'draw'|'steal'):number[]{return roleTargets(s,a,'role-active').filter(t=>kind==='draw'||s.players[t].hand.length>0);}
export function assamTargets(s:RoleBoard,a:number):number[]{return s.players.filter(p=>p.hp>0&&(p.seat===a||(s.mode==='team'&&p.team===s.players[a].team&&sameOrNear(s.players[a].cell,p.cell)))).map(p=>p.seat);}
export function nextInDirection(cell:string,direction:Direction):string|null {
 const c=map.map[cell];if(!c)return null;const [dr,dc]=vector[direction],id=`r${c.row+dr}c${c.col+dc}`;return map.map[id]?id:null;
}
export function westDirection(declared:Direction,die:number):Direction {
 if(!DIRECTIONS.includes(declared)||!Number.isInteger(die)||die<1||die>6)throw Error('西帝汶方向或判定无效');return die%2?opposite[declared]:declared;
}
export function westStepAllowed(from:string,to:string,direction:Direction):boolean {
 const a=map.map[from],b=map.map[to];if(!a||!b)return false;const [dr,dc]=vector[direction];return dr===0?a.row===b.row&&Math.sign(b.col-a.col)===dc:a.col===b.col&&Math.sign(b.row-a.row)===dr;
}
export function emptyEntry(s:RoleBoard,a:number,cell:string,ignore:readonly number[]=[]):boolean {
 return (!hasPlaytestRules(s.version)||relocationCell(s,a,s.players[a].cell,cell,ignore)!==null)&&Boolean(map.map[cell])&&!(s.farmClosed&&map.map[cell].region==='高唐农场')&&canEnterWithMount(s,a,cell)&&!s.players.some(p=>onBoard(s,p.seat)&&p.cell===cell&&!ignore.includes(p.seat));
}
export function elbowPushCells(s:RoleBoard,user:number,target:number):string[]{
 if(!alive(s,target))return [];return DIRECTIONS.map(d=>nextInDirection(s.players[target].cell,d)).filter((c):c is string=>c!==null&&emptyEntry(s,target,c,[target]));
}
export function elbowTargets(s:RoleBoard,a:number,converted:boolean):number[]{
 if(s.players[a].character!=='character-023')return [];
 return roleTargets(s,a,converted?'role-active':'role-locked').filter(t=>!boardSingleProtected(s,a,t)&&map.map[s.players[a].cell].region===map.map[s.players[t].cell].region);
}
export function collisionPath(s:RoleBoard,user:number,target:number,direction:Direction):string[]{
 if(s.players[user].character!=='character-045'||!roleEffectAllowed({origin:'role-locked',actor:user,roleModifiers:[]},s.players[target]))return [];
 const path:string[]=[];let from=s.players[target].cell;
 while(true){const next=nextInDirection(from,direction);if(!next||!emptyEntry(s,target,next,[target]))break;path.push(next);from=next;if(map.map[next].region==='山洞')break;}
 return path;
}
export function carryCandidates(s:ResourceState,west:number,origin:string):{actor:number;origin:string}[]{
 if(s.players[west].character!=='character-040')return [];
 return roleTargets(s,west,'role-active').filter(a=>distanceForVersion(version,origin,s.players[a].cell)===1).map(actor=>({actor,origin:s.players[actor].cell}));
}
export function carryDestinations(s:RoleBoard,west:number,passenger:number,initial:string):string[]{
 if(!alive(s,west)||!alive(s,passenger)||s.players[passenger].cell!==initial||!roleTargets(s,west,'role-active').includes(passenger))return [];
 return map.cells.filter(c=>distanceForVersion(version,s.players[west].cell,c.id)===1&&emptyEntry(s,passenger,c.id)).map(c=>c.id);
}
export function mayVoluntarilyRelocate(s:ResourceState,a:number):boolean{return alive(s,a)&&!mountMovementBlocked(s,a);}
