import {hasExerciseRules,hasStage4} from '../../../packages/game-data/src/index';
import {STAGE4_CARDS} from '../../../packages/game-data/src/stage4';
import type {CardId} from '../../../packages/game-data/src/index';
/** Public printed cost only. Never accepts a private action/quote object. */
export function publicCardCost(version:string,id:CardId,legacy:{cost:number;randomCost?:boolean}):string {
 if(hasExerciseRules(version)&&['basic-003','basic-004','basic-005'].includes(id))return `${legacy.cost} AP`;
 if(!hasStage4(version))return legacy.randomCost?'d6费用':`${legacy.cost} AP`;
 const card=STAGE4_CARDS[id];return card.cost.kind==='variable'?'X AP':card.cost.kind==='fixed'?`${card.cost.value} AP`:`${card.printedCost} AP（随机）`;
}
