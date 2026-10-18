import {hasExerciseRules} from '../../game-data/src/index';
import {gainAp} from './stage3-resources';
import type {ResourceState} from './stage3-resources';

export interface ExerciseOwnership {owners:Record<string,number>}
export const exerciseRank=(card:string)=>['basic-003','basic-004','basic-005'].indexOf(card.split('#')[0])+1;
export function rememberExerciseOwner(s:{version?:string;exercise?:ExerciseOwnership},actor:number,card:string):void {
 if(!hasExerciseRules(s.version))return;
 s.exercise??={owners:{}};
 if(exerciseRank(card)&&!Object.hasOwn(s.exercise.owners,card))s.exercise.owners[card]=actor;
}
export function higherExerciseResponse(version:string|undefined,attack:string,response:string):boolean {
 return hasExerciseRules(version)&&exerciseRank(attack)>0&&exerciseRank(response)>exerciseRank(attack);
}
/** Called once per physical entry, including repeated entries after a reshuffle. */
export function discardCards(s:Omit<ResourceState,'stage3'>&{stage3?:ResourceState['stage3']},cards:readonly string[]):void {
 for(const card of cards){
  s.discard.push(card);
  if(!hasExerciseRules(s.version)||!exerciseRank(card))continue;
  const owner=s.exercise?.owners[card];
  if(owner!==undefined&&s.players[owner]?.hp>0)gainAp(s as ResourceState,owner,1);
 }
}
