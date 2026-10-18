import {hasPlaytestRules} from '../../../packages/game-data/src/index';
import {northTargets} from '../../../packages/game-core/src/playtest';
import {cardForVersion,definitionId} from '../../../packages/game-data/src/index';
import type {Intent,OnlineGame} from '../../../packages/online/src/protocol';
export type PlayOptions=Partial<Omit<Extract<Intent,{type:'play'}>,'type'|'card'|'targets'>>;
export function anytimeReason(game:OnlineGame,seat:number,busy:boolean,now:number){
 if(game.result)return '本局已结束';if(game.players[seat].hp<=0)return '你已淘汰';if(busy)return '等待操作确认或连接恢复';
 const until=game.choice?.deadline??(game.clock.since===null?Infinity:game.clock.since+game.clock.remaining);return now>=until?'操作时间已结束，正在同步':null;
}
export function stage4PlayReason(game:OnlineGame,seat:number,card:string,targets:number[],options:PlayOptions={}):string|null {
 const player=game.players[seat],a=game.actions.stage4,info=a?.cards[card],def=cardForVersion(definitionId(card),game.version),converted=options.as==='elbow';
 if(!player.hand?.includes(card)||!info)return '这张牌已不在手中或正在同步';
 if(game.stage4?.offMap[seat])return '离场期间只能结束行动';
 if(def.id==='basic-017'&&!converted)return targets.length?'插队不需要目标':a!.canInterrupt?null:'当前不能提交插队：检查AP、建民限制或移动结算费';
 if(info.blocked)return '本个人回合不能主动出牌';
 if(converted&&player.character!=='character-023')return '只有牢大可以转换肘击';
 if(!converted&&!info.playable)return info.counter?'这张牌只在对应反制窗口使用':'这张牌仅能响应或转换肘击';
 if(!converted&&!info.allowed&&!(player.character==='character-045'&&def.id==='basic-010'))return '当前位置禁止使用此牌';
 if(!converted&&info.needsQuote)return '请先锁定该实体牌的随机费用';
 const cost=converted?2:info.costKind==='variable'?options.x:info.cost;
 if(!converted&&info.costKind==='variable'&&(!Number.isInteger(options.x)||options.x!<1||options.x!>player.ap))return 'X必须为1至当前可付AP';
 if(cost===null||cost===undefined)return '正在同步费用';if(player.ap<Math.max(0,cost))return `AP不足：需要${cost} AP，当前${player.ap} AP`;
 if(hasPlaytestRules(game.version)&&!converted&&['basic-011','basic-012','basic-014','basic-013','basic-031','basic-026','basic-040','basic-041'].includes(def.id)&&game.players.some(q=>q.hp>0&&q.character==='character-006')&&!options.northGroup)return '请选择北帝汶群体目标分支';
 const targeted=converted||info.targeted,legal=converted?info.convertTargets:info.targets;
 if(targeted){const max=!converted&&!info.elbow&&def.group?3:1;if(!targets.length)return '请先选择目标';if(targets.length>max||new Set(targets).size!==targets.length||targets.some(t=>!legal.includes(t)))return '目标已不可选，请重新选择';}
 else if(targets.length)return '这张牌不需要外部目标';
 if(converted||info.elbow){const directions=converted?game.actions.stage3?.elbowPush[targets[0]]:info.pushes[targets[0]];if(directions&&Object.keys(directions).length&&(!options.direction||!directions[options.direction]))return '请先选择撞飞方向';}
 if(!converted&&info.equipment){if(!info.equipment.allowed)return '不能重复装备同名装备';if(info.equipment.required&&!options.replacement)return '请先选择要替换的装备';if(options.replacement&&!info.equipment.cards.includes(options.replacement))return '替换对象已更新';}
 try{northTargets(game,targets);}catch{return '北帝汶与其他非机械猴子不能同时指定';}
 if(!converted&&info.region&&(!options.region||!a!.regions.includes(options.region)))return '请选择作用地区';
 if(!converted&&def.id==='basic-073'&&!a!.copyMounts.some(g=>g.card===options.copy))return '请选择场上他人的非Bob坐骑';
 if(!converted&&def.id==='basic-024'){
  if(options.take!=='hand'&&options.take!=='equipment')return '请选择拿手牌或装备';
  if(options.take==='equipment'){const gear=options.item?a!.stealEquipment[targets[0]]?.[options.item]:null;if(!gear)return '请选择目标的一件公开装备';if(gear.allowed&&gear.required&&!options.replacement)return '请明确要替换的装备';if(options.replacement&&!gear.cards.includes(options.replacement))return '替换装备已更新';}
 }
 return null;
}
