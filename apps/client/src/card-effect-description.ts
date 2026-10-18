import {cardForVersion,definitionId,hasExerciseRules} from '../../../packages/game-data/src/index';
import type {OnlineGame} from '../../../packages/online/src/protocol';

export const elbowEffect='对目标造成1点伤害；存在合法落点时，按所选方向将其撞飞一格，并移动到目标原位置。';
export function cardEffectDescription(game:OnlineGame,seat:number,card:string,asElbow=false,x=1){
 const def=cardForVersion(definitionId(card),game.version),info=game.actions.stage4?.cards[card]??game.actions.stage3?.cards[card];
 const freeExercise=hasExerciseRules(game.version)&&game.choice?.actor===seat&&game.choice.kind==='response'&&game.choice.cards?.includes(card)&&['basic-003','basic-004','basic-005'].includes(def.id);
 const special=game.actions.stage4?.cards[card],converted=game.choice?.kind!=='response'&&(asElbow||Boolean(special?.elbow)||def.id==='basic-002'&&game.players[seat].character==='character-023');
 const cost=asElbow?2:freeExercise?0:special?.costKind==='variable'?x:info?.cost??(!info?def.cost:null);
 return {name:converted?'肘击':def.name,originalName:converted?def.name:null,
  cost:cost===null?'费用尚未锁定':cost<0?`获得${-cost} AP`:`${cost} AP`,
  text:freeExercise?'免费高等级搏击操反制：只抵消本次攻击对自己的全部扣AP及AP不足转扣血，不反击、不影响其他目标。反制牌入弃时，仍按规则给存活的最初获得者回复1AP。':converted?elbowEffect+(hasExerciseRules(game.version)&&['basic-003','basic-004','basic-005'].includes(def.id)?' 原搏击操实体入弃时，仍按规则给存活的最初获得者回复1AP。':''):def.text};
}
