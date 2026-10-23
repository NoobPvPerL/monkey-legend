// Approved E batch; enabled only when the complete v16 engine is installed.
export const P3_E_CHARACTERS={
 'character-014':{id:'character-014',name:'猴六',hp:4,spawn:'r1c4',faction:'机械猴子',waterNative:false,spawnRegion:'秀松苑',text:'释放毒气：自己自由行动1AP，不另限次数。自己不移动；其他在图存活角色按行动顺序，由自己逐一选择合法正交方向远离本次基准位置1格，无路原地。主动免疫、占格、水域及装备照常。'},
 'character-016':{id:'character-016',name:'猴十八',hp:5,spawn:'r1c2',faction:'机械猴子',waterNative:false,spawnRegion:'教学楼',text:'不动：他人造成的位移、冲撞、传送和移出地图须先经自己同意，每个连续位移效果一次30秒，超时拒绝；自身主动移动或自选返回格视为同意。同意仍须合法，拒绝仅阻止位移部分。'},
 'character-024':{id:'character-024',name:'卤蛋',hp:4,spawn:'r2c4',faction:'中立',waterNative:false,spawnRegion:'操场',text:'体育部部长：场上自己或他人实际移动后，可免费正交移动1合法格，30秒可放弃；每条原始位移链最多一次，整段基础移动结束后触发，不按格重复，自己的反应移动不递归触发，不耗基础移动机会。'},
 'character-038':{id:'character-038',name:'汪羊',hp:4,spawn:'r2c4',faction:'中立',waterNative:false,spawnRegion:'操场',text:'大班级先走：自己个人结束时，最高当前HP角色并列全处理，含自己比较但自己不移动；其他最高者由自己选合法正交格远离自己1格，无路原地。逃生演习：自由行动2AP，每个人回合一次，指定地区，其他角色依序由自己选择一个缩短到该地区几何距离的合法正交格；已到达或无路原地，全部位移和响应后除自己外最远者并列各受1普通伤害，免疫照常。'},
} as const;
