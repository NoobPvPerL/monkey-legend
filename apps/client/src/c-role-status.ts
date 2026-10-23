import type {OnlineGame} from '../../../packages/online/src/protocol';
export function cRoleStatus(game:OnlineGame,seat:number):string|null {
 const c=game.stage3?.c,p=game.players[seat];if(!c||game.active!==seat)return null;
 if(game.stage3?.h&&p.character==='character-050')return '装备哥：实际安装可免费摸1；同盟共享实际装备效果，耐久／冷却共用原件，实体仍归持有人。';
 if(game.stage3?.h&&p.character==='character-041')return '小：持续不占格，可与其他角色同格；每条位移链跨过每人可免费判定一次。躲避球不能指定。';
 if(p.character==='character-028'&&game.stage3?.g){const face=game.stage3.g.face[seat];return [null,'魔法有方1：本个人回合不能主动使用攻击身份牌；响应及非攻击牌照常。','魔法有方2：本个人回合禁止移动、传送和离场；出生、复活和返回落格除外。','魔法有方3：正常开始摸牌额外2，禁摸牌时不补。','魔法有方4：本次个人开始已额外获得2AP，晓虫照常。','魔法有方5：自己造成存活失血后留标记，下一份有效伤害加1，自己下次开始清除。','魔法有方6：基础移动改为全图合法空格传送，保留费用与次数。'][face]??null;}
 if(game.stage3?.f){if(p.character==='character-007')return '没有手脚：有效唐车才可移动；斩杀须弃1手牌，奇数直接淘汰同地区1—2HP角色。';if(p.character==='character-019')return '无有限生命上限；搏击操提交后回复1HP，“回满”视为回复2HP。';if(p.character==='character-036')return '干枯：基础移动起步骰仅6可离水；全部来源伤害穿盾并同时扣生命和有限上限。';}
 if(p.character==='character-016')return '不动：他人位移由你决定是否同意，30秒超时拒绝；自己主动移动无需询问。';
 if(p.character==='character-024')return '体育部部长：每条原始位移链最多免费正交走1格，整段基础移动结束后触发。';
 if(p.character==='character-038'&&game.stage3?.e)return game.stage3.e.escapeUsed[seat]?'逃生演习：本个人回合已使用；结束时仍结算大班级先走。':'逃生演习：2AP选地区，逐人靠近，最后最远者并列受1伤。';
 if(p.character==='character-053'&&game.stage3?.d)return game.stage3.d.clanUsed[seat]?'鸡犬升天：本个人回合已使用；乞讨仍按主动支付至0触发。':'鸡犬升天：须有手牌，可弃全部令存活队友含自己各获2AP；每个人回合一次。';
 if(p.character==='character-029')return '准：躲避球不掷命中骰，防护照常；选择手牌可发动变（总价2AP）。';
 if(p.character==='character-047')return c.used[seat]?'已使用卡牌，本回合睡觉资格已取消。':'睡觉：本回合尚未使用卡牌，保持至结束则下次个人开始额外获得2AP。';
 if(p.character==='character-046')return c.blocked[seat]?'脚短：本回合不能再发动基础移动；地点传送限制照常。':c.feather[seat]?'手长已发动：本个人回合攻击牌不限距离，免疫和地点禁牌照常。':null;
 return null;
}
