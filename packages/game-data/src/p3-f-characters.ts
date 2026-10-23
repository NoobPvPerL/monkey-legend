// F A/B/C rulings approved2026-10-19. Only a complete v17 profile enables them.
export const P3_F_CHARACTERS={
 'character-007':{id:'character-007',name:'波波鲨鱼',hp:5,spawn:'r4c6',spawnRegion:'淘安泽',faction:'中立',waterNative:false,text:'没有手脚：无有效唐车时不能主动、强制移动或传送，开局／复活／返回落格除外。斩杀：自由行动0AP、每个人回合一次，弃1手牌，指定同地区其他1—2HP角色，奇数直接淘汰且不能普通复活，偶数无效果；主动免疫照常，费用次数不退。'},
 'character-017':{id:'character-017',name:'猴十六',hp:4,spawn:'r1c4',spawnRegion:'秀松苑',faction:'机械猴子',waterNative:false,text:'自虐：其他队友以卡牌指定自己时可免费判定，每牌一次；1—2原效果照常，3—6仅取消自己这份。3—5其他对手各弃1，6指定其他合法角色受1普通伤害；FFA无触发。首杀：全局首次淘汰前，自己造成的实际失血不能治疗；首次淘汰后解除。'},
 'character-018':{id:'character-018',name:'猴四',hp:5,spawn:'r1c4',spawnRegion:'秀松苑',faction:'机械猴子',waterNative:false,text:'易伤：按实际牌身份受到帝汶词条牌伤害+1。回家：实际失血且存活后随机回出生地区合法空格，无路原地；立即免疫之后全部伤害至下一名角色个人开始，含同批后续与环境。致命不回家。'},
 'character-019':{id:'character-019',name:'猴五',hp:2,spawn:'r1c4',spawnRegion:'秀松苑',faction:'机械猴子',waterNative:false,uncappedHp:true,text:'做手术：初始2HP，无有限上限，界面∞；普通回血可累积，回满视为回复2，上限增减无效，结算比例以初始2作比较基准。搏击操爱好者：每张按搏击操身份提交并支付的主动／响应牌回复1HP，免费响应也算，后续被反制不撤销；转换按实际身份，重试不重复。'},
 'character-032':{id:'character-032',name:'痞帅',hp:3,spawn:'r1c2',spawnRegion:'教学楼',faction:'中立',waterNative:false,text:'bccb：其他人从外地区进入本地区，每条位移链至多一次，可免费判定；1—4随机拿对方最多2手牌再自受1普通伤害，5—6双方同批各受1普通伤害。和气：每点实际失血且存活，获得2AP并加1上限，不直接回血；环境和自伤照常，致命无收益。'},
 'character-036':{id:'character-036',name:'水母',hp:3,spawn:'r3c3',spawnRegion:'红素洋',faction:'中立',waterNative:false,text:'干枯：每条位移链首次离水须判定6，基础移动沿用起步d6；失败只阻止离水，落格例外照规则。致命触须：全部来源伤害先处理免疫／装备／上限，再穿盾，同时扣HP与有限上限；上限归零死亡且不能普通复活。毒蜇：其他人经过／进入每链一次、个人结束停留另一次，可免费判定；1—3弃2，4—5受2真伤，6无效果。'},
 'character-051':{id:'character-051',name:'朱鹏岩',hp:4,spawn:'r1c2',spawnRegion:'教学楼',faction:'中立',waterNative:false,rock:true,text:'随风漂流：个人开始向右强制1合法格，阻挡原地，不扣AP／移动机会。坚韧：免疫／装备／护盾后，可用N点上限抵挡N预计失血，上限至少1；当前HP超新上限截断，此修正不作伤害，30秒超时0。岩石类：分尸基础3伤。'},
 'character-052':{id:'character-052',name:'朱伟岩',hp:5,spawn:'r1c2',spawnRegion:'教学楼',faction:'中立',waterNative:false,rock:true,text:'岩浆之力：自由行动2AP、不另限次数，同地区其他所有在图存活角色各受1普通伤害，含队友，不包含自己；主动／群体免疫、护盾装备照常，不续60秒。岩石类：分尸基础3伤。'},
} as const;
