// Approved G metadata. Local candidate v18 is enabled by migration029;
// old games and drafts retain their saved catalogs.
export const P3_G_CHARACTERS={
 'character-009':{id:'character-009',name:'大幻神',hp:4,spawn:'r4c4',spawnRegion:'办公室',faction:'中立',waterNative:false,text:'白眼：个人开始正常摸牌改为选最多两名不同对手，各随机拿1手牌，无牌不补；开局及其他摸牌照常。好奇怪哦：他人逻辑牌支付提交、easy之后可付1AP判定，1—3取消该份牌，每个人回合一次，含响应及队友，30秒可放弃。'},
 'character-012':{id:'character-012',name:'观察者',hp:3,spawn:'r1c2',spawnRegion:'教学楼',faction:'中立',waterNative:false,text:'观察：存活时（含暂离场）每整轮开始预定本轮末实际两处轰炸，仅自己与观众可见；淘汰停用，复活后恢复，已锁定结果不重抽。隐身：自己结束可免费判定，4—6至自己下次开始不能被他人的单体卡牌指定；群体、技能、装备及环境照常。'},
 'character-021':{id:'character-021',name:'黄虫',hp:3,spawn:'r1c1',spawnRegion:'高唐农场',faction:'中立',waterNative:false,text:'质数：所有卡牌支付一次原最终费用＋1，以两份逻辑牌分别结算，实体只入弃一次；双装备各占一槽、分别处理，头身腕坐骑各容量2，手仍2。过境：他人每份食物对每名受益者生效前，可付2AP转给自己，30秒可放弃，免疫照常。'},
 'character-022':{id:'character-022',name:'假原始人',hp:3,spawn:'r1c7',spawnRegion:'食堂',faction:'中立',waterNative:false,text:'建民首领：每份建民身份逻辑牌支付提交时摸1，含自己、响应及后续被反制的牌；自己建民牌正费用免费，保留负费与X。狗头军师：自由行动1AP，任选在图存活角色沿指定正交方向强制1格，阻挡原地；东帝汶及当前队友受克星保护。'},
 'character-028':{id:'character-028',name:'魔方小子',hp:4,spawn:'r1c2',spawnRegion:'教学楼',faction:'中立',waterNative:false,text:'魔法有方：自己开始判定，1禁主动攻击牌，2禁位移（出生／复活／返回除外），3正常开始摸牌额外2，4额外2AP，5造成实际失血且目标存活后标记其下一份正伤害在护盾前＋1，6基础移动改全图合法传送且不掷起步骰；均仅本个人回合，标记自己下次开始清除。'},
 'character-033':{id:'character-033',name:'人机',hp:3,spawn:'r1c2',spawnRegion:'教学楼',faction:'中立',waterNative:false,text:'高科技：外星身份牌正费用免费，保留负费与X。编程：他人d6原点数公开后，可免费重掷一次覆盖；每个人回合一次、30秒可放弃，不递归重掷编程骰；之后小原始人可最终指定自己的点数。'},
 'character-042':{id:'character-042',name:'小原始人',hp:3,spawn:'r2c8',spawnRegion:'山洞',faction:'中立',waterNative:false,text:'数学天才：自己的每个d6最终可免费指定1—6，不限次数，30秒超时保留当前值；优先级高于人机。卫汶找你先锁目标猜测、再公开并改出牌者的骰子，目标不能重新猜。'},
 'character-049':{id:'character-049',name:'中帝汶',hp:4,spawn:'r2c1',spawnRegion:'XDF',faction:'帝汶家族',waterNative:true,text:'店长：食物身份牌正费用免费，保留负费；别人每份逻辑食物支付提交后，自己选弃1手牌，20秒，不足全弃，无牌无额外惩罚。哈基米：基础移动最终骰6时，本段可经过占用格、不能停；每跨过其他角色每段至多可选造成1普通伤害，30秒可放弃。'},
} as const;
