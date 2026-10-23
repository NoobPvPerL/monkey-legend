import {gEnabled,gState} from './p3-g-state';
import {roleEffectAllowed} from './character-effects';
import {gainAp,mountMovementBlocked} from './stage3-resources';
import {boardEmptyEntry} from './stage4-board';
import {mapForVersion} from '../../game-data/src/index';
import type {GameState,Task,DamageHit} from './types';
import type {Stage3Ports} from './stage3-engine';
type CubeState={version?:string;active?:number;players:{character:string}[];stage3?:{g?:{face:number[]}}};
export function gCubeFace(s:CubeState,a:number):number{return gEnabled(s.version)&&s.active===a&&s.players[a]?.character==='character-028'?s.stage3?.g?.face[a]??0:0;}
export const gCubeCanMove=(s:CubeState,a:number)=>gCubeFace(s,a)!==2;
export const gCubeAttackBlocked=(s:CubeState,a:number,attack:boolean)=>attack&&gCubeFace(s,a)===1;
export function gCubeStartTasks(s:GameState,a:number):Task[]{return gEnabled(s.version)&&s.players[a].hp>0&&s.players[a].character==='character-028'?[{kind:'stage3',action:'g-cube-start',actor:a}]:[];}
export function gCubeTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!gEnabled(s.version)||t.action!=='g-cube-start')return false;const a=t.actor!;
 if(s.players[a].hp<=0||s.players[a].character!=='character-028')return true;
 const roll=p.die(s,'魔法有方',a);gState(s).face[a]=roll;p.emit(s,'skill',`S${a+1} 魔法有方：本个人回合采用${roll}`);
 if(roll===4){const gain=gainAp(s as GameState&import('./stage3-resources').ResourceState,a,2);p.emit(s,'ap',`S${a+1} 魔法有方额外获得${gain.gained}AP，晓虫收取${gain.taken}AP`);}return true;
}
export function gCubeDrawBonus(s:GameState,a:number):number{return gCubeFace(s,a)===3&&!s.stage4?.drawBlocked[a]?2:0;}
export function gCubeDestinations(s:GameState,a:number):string[]{
 if(gCubeFace(s,a)!==6||s.players[a].moved||mountMovementBlocked(s as GameState&import('./stage3-resources').ResourceState,a))return [];
 return mapForVersion(s.version).cells.filter(c=>c.id!==s.players[a].cell&&boardEmptyEntry(s,a,c.id,[a])).map(c=>c.id);
}
/** Called once a hit passed immunity/equipment, before the existing caps and shield. */
export function gCubeBoost(s:GameState,h:DamageHit,emit:Stage3Ports['emit']):DamageHit {
 if(!gEnabled(s.version)||h.amount<=0)return h;const owner=gState(s).marks[h.target];
 if(owner===null||!roleEffectAllowed({origin:'role-locked',actor:owner,roleModifiers:[]},s.players[h.target]))return h;
 gState(s).marks[h.target]=null;emit(s,'skill',`S${h.target+1} 消耗S${owner+1}魔方标记，本份伤害＋1`);return {...h,amount:h.amount+1};
}
/** Mark immediately after each survived HP loss, so a later hit in this batch can consume it. */
export function gCubeInjury(s:GameState,h:DamageHit,loss:number,emit:Stage3Ports['emit']):void {
 if(!gEnabled(s.version)||loss<=0||h.source===null||gCubeFace(s,h.source)!==5||s.players[h.target].hp<=0||s.stage4?.offMap[h.target])return;
 if(!roleEffectAllowed({origin:'role-locked',actor:h.source,roleModifiers:[]},s.players[h.target]))return;
 gState(s).marks[h.target]=h.source;emit(s,'skill',`S${h.target+1} 获得S${h.source+1}魔方标记`);
}
