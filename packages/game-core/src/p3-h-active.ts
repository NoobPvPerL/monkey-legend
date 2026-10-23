import {hasP3HRules,mapForVersion} from '../../game-data/src/index';
import {roleEffectAllowed} from './character-effects';

/** New role-active activations only. Committed effects and equipment survive. */
export interface HActiveBoard {
 version?:string;mode?:string;
 players:{seat:number;hp:number;cell:string;character:string;team:string}[];
 stage4?:{offMap:boolean[]};
}
export function hActiveBlocker(s:HActiveBoard,actor:number):number|null {
 if(!hasP3HRules(s.version))return null;
 const target=s.players[actor],map=mapForVersion(s.version!).map;
 if(!target||target.hp<=0||s.stage4?.offMap[actor]||!map[target.cell])return null;
 return s.players.find(q=>q.seat!==actor&&q.character==='character-011'&&q.hp>0&&!s.stage4?.offMap[q.seat]&&
  (s.mode!=='team'||q.team!==target.team)&&map[q.cell]?.region===map[target.cell].region&&
  roleEffectAllowed({origin:'role-locked',actor:q.seat,roleModifiers:[]},target))?.seat??null;
}
export const hActiveAllowed=(s:HActiveBoard,actor:number)=>hActiveBlocker(s,actor)===null;
/** Optional offers whose actor is the skill owner, never a forced recipient. */
export const hActiveChoice=(kind:string)=>['h-small','h-respect','h-ren-expel','east-start','qb-pursuit','xie-ledger','west-carry','lemon-support','runner-roll','runner-pay','encourage','egg-move','f-self-harm','f-sting','primitive-food','g-invisible'].includes(kind);
export const hActiveSkill=(kind:string)=>['ren','freeze','dog','execute','magma','gas','escape','clan','feather','mayi','jj','cooperate','circle'].includes(kind);
