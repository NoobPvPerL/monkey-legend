import {cardForVersion,definitionId,hasInteractionRules,unlimitedAttacks,hasStage3} from '../../../packages/game-data/src/index';
import type {DraftPickIntent} from '../../../packages/online/src/draft-protocol';
import type {Direction} from '../../../packages/game-core/src/stage3-roles';
import {locationCardAllowed} from '../../../packages/game-core/src/locations';
import type {Intent,OnlineCommand,OnlineGame,RoomReply,RoomSnapshot} from '../../../packages/online/src/protocol';

export function actionBlockReason(game:OnlineGame,seat:number,busy:boolean,now:number):string|null {
 if(game.result)return '本局已结束';
 if(game.players[seat].hp<=0)return '你已淘汰，可继续查看战场';
 if(busy)return '等待操作确认或连接恢复';
 if((game.choice?.actor??game.active)!==seat)return '等待其他玩家行动';
 const deadline=game.choice?.deadline??(game.clock.since===null?Infinity:game.clock.since+game.clock.remaining);
 if(now>=deadline)return game.choice?'选择时间已结束，正在同步':'行动时间已结束，正在同步';
 return null;
}
export function playBlockReason(game:OnlineGame,seat:number,card:string,targets:number[],busy:boolean,now:number,options:{as?:'elbow';replacement?:string;direction?:Direction}={}):string|null {
 const blocked=actionBlockReason(game,seat,busy,now);if(blocked)return blocked;
 if(game.choice)return '请先完成当前选择';
 if(game.phase!=='action')return '请先结束移动';
 const player=game.players[seat],def=cardForVersion(definitionId(card),game.version);
 if(!player.hand?.includes(card)||!def)return '这张牌已不在手中';
 if(hasStage3(game.version)){
  const info=game.actions.stage3?.cards[card];if(!info)return '正在同步卡牌可用条件';
  if(info.blocked)return '面包：本个人回合不能主动出牌';
  const elbow=options.as==='elbow'||def.id==='basic-002'&&player.character==='character-023',converted=options.as==='elbow';
  if(converted&&player.character!=='character-023')return '只有牢大可以转换肘击';
  if(def.type==='response'&&!elbow)return player.character==='character-023'?'请先选择“当作肘击”':'这张牌仅能在响应窗口使用';
  if(!converted&&!(player.character==='character-045'&&def.id==='basic-010')&&!locationCardAllowed(game.version,player.cell,def.id))return '当前位置禁止使用此牌';
  const cost=converted?2:info.cost;if(cost===null)return '先锁定本张紫檀木的费用';if(player.ap<cost)return `AP不足：需要${cost} AP，当前${player.ap} AP`;
  const targeted=elbow||def.type==='attack'||def.id==='basic-016'||def.id==='basic-037',legal=converted?info.convertTargets:info.targets;
  if(targeted){const max=!elbow&&def.group?3:1;if(!targets.length)return '请先选择目标';if(targets.length>max||new Set(targets).size!==targets.length||targets.some(t=>!legal.includes(t)))return '目标已不可选，请重新选择';}
  else if(targets.length)return '这张牌不需要外部目标';
  if(elbow){const directions=game.actions.stage3?.elbowPush[targets[0]]??{};if(Object.keys(directions).length&&(!options.direction||!directions[options.direction]))return '请先选择撞飞方向';}
  if(!converted&&info.equipment){if(!info.equipment.allowed)return '不能重复装备同名装备';if(info.equipment.required&&!options.replacement)return '请先选择要替换的装备';if(options.replacement&&!info.equipment.cards.includes(options.replacement))return '替换对象已更新，请重新选择';}
  return null;
 }
 if(def.type==='response')return '这张牌仅能在响应窗口使用';
 if(def.type==='attack'&&!unlimitedAttacks(game.version)&&player.attacks>=2)return '本回合攻击次数已用完（2/2，旧版规则）';
 if(!locationCardAllowed(game.version,player.cell,def.id))return '当前位置禁止使用此牌';
 if(player.ap<def.cost)return `AP不足：需要${def.cost} AP，当前${player.ap} AP`;
 if(def.type==='attack'){
  if(!targets.length)return '请先选择目标';
  const max=def.group?(hasInteractionRules(game.version)?3:2):1,legal=game.actions.targets[card]??[];
  if(targets.length>max||new Set(targets).size!==targets.length||targets.some(target=>!legal.includes(target)))return '目标已不可选，请重新选择';
 }else if(targets.length)return '补给牌仅对自己使用';
 return null;
}
// A stale UI intent must never be silently re-targeted or re-submitted.
export function prepareGameCommand(rendered:RoomSnapshot,latest:RoomSnapshot,intent:Intent,requestId:string,now:number):{command?:OnlineCommand;error?:string}{
 if(latest.role==='spectator'||!latest.game||!latest.matchId)return {error:'当前不能操作玩家座位'};
 if(rendered.roomId!==latest.roomId||rendered.memberId!==latest.memberId||rendered.epoch!==latest.epoch||rendered.matchId!==latest.matchId)return {error:'对局或身份已更新，请重新确认'};
 if(rendered.game?.revision!==latest.game.revision)return {error:'状态已更新，本次操作未发送，请重新确认'};
 const blocked=actionBlockReason(latest.game,latest.seat,false,now);if(blocked)return {error:blocked};
 if(intent.type==='choose'){
  if(latest.game.choice?.id!==intent.choice)return {error:'原选择窗口已结束，本次操作未发送'};
 }else if(latest.game.choice)return {error:'请先完成当前选择'};
 if(intent.type==='play'){
  const reason=playBlockReason(latest.game,latest.seat,intent.card,intent.targets,false,now,intent);if(reason)return {error:reason};
 }
 return {command:{op:'game',requestId,matchId:latest.matchId,revision:latest.game.revision,intent}};
}
export function prepareDraftCommand(rendered:RoomSnapshot,latest:RoomSnapshot,intent:DraftPickIntent,requestId:string,now:number):{command?:OnlineCommand;error?:string}{
 if(latest.role==='spectator'||latest.status!=='drafting'||!latest.draft?.offer||!latest.matchId)return {error:'当前不能选择角色'};
 if(rendered.roomId!==latest.roomId||rendered.memberId!==latest.memberId||rendered.epoch!==latest.epoch||rendered.matchId!==latest.matchId||rendered.draft?.revision!==latest.draft.revision)return {error:'选角状态已更新，请重新确认'};
 const offer=latest.draft.offer;if(offer.actor!==latest.seat||offer.id!==intent.offer||now>=offer.deadline||!offer.candidates?.includes(intent.character))return {error:'原选角窗口已结束或候选已更新'};
 return {command:{op:'draft-pick',requestId,matchId:latest.matchId,revision:latest.draft.revision,offer:offer.id,character:intent.character}};
}
export function commandError(command:OnlineCommand,reply:RoomReply):string {
 if(reply.ok)return '';
 if(command.op==='game'&&/命令版本过期|命令已超时/.test(reply.error??'')){
  const intent=command.intent,next=reply.snapshot;
  if(intent.type==='choose'&&next&&(next.matchId!==command.matchId||next.game?.choice?.id!==intent.choice))return '原选择窗口已结束，本次操作未执行；已同步最新状态。';
  return '对局状态已更新，本次操作未执行；请查看后重新确认。';
 }
 return reply.error??'操作未成功';
}
