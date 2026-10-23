// Complete H candidate; owner reviewed the documented rules on2026-10-23.
export const P3_H_CHARACTERS={
 "character-050": {id:"character-050",name:"中饭",hp:4,spawn:"r2c4",spawnRegion:"操场",faction:"中立",waterNative:false,text:"装备哥：自己每成功安装一件装备，可免费摸1，30秒可放弃。同盟存在存活中饭时，全队共享队友实际装备效果，实体与槽位仍归原持有人；耐久、面包冷却和唐车设置共用原件，手表分别记录使用者个人开始格。"},
 "character-041": {id:"character-041",name:"小帝汶",hp:3,spawn:"r3c1",spawnRegion:"帝汶岛",faction:"帝汶家族",waterNative:true,text:"小：持续不占格，可稳定同格。自己实际移动跨过角色，每条位移链对每人可免费判定一次：1—3伤1普通，4—6随机拿最多2手牌，30秒可放弃；传送只看目的格。不能被躲避球指定，最高等级。"},
 "character-035": {id:"character-035",name:"三幻神",hp:3,spawn:"",spawnRegion:"自定义",faction:"中立",waterNative:false,text:"世界是多元的：开局选合法空格，保存地区作复活范围。Leap：基础移动按原费用／次数全图传送，不掷移动骰。respect：Leap完成后可将目的地区原有其他角色逐人传至该地区外合法格。"},
 "character-034": {id:"character-034",name:"壬人心",hp:3,spawn:"r4c4",spawnRegion:"办公室",faction:"中立",waterNative:false,text:"教育：受他人伤害且存活后可选让来源／自己正交后退1格。厌蠢：同／邻地区受伤存活者可移至这些地区之外。化学金牌教练：自由行动0AP、每个人回合一次，同／邻角色拼点，本人两骰取大，对方一骰；胜获其AP／手牌／逐件装备，同目标本局只胜一次，失败按尝试次数自伤1／2／3。整轮正常AP少1。"},
 "character-030": {id:"character-030",name:"南帝汶",hp:5,spawn:"r3c1",spawnRegion:"帝汶岛",faction:"帝汶家族",waterNative:true,text:"南南合作：自由行动0AP、每个人回合一次，与其他角色各选等量至少1张手牌交换；联系至自己下次个人结束。对方实际失血／回血同步给自己，自己回血同步给对方，自己失血不影响对方；镜像链不递归。"},
 "character-011": {id:"character-011",name:"二幻神",hp:3,spawn:"r4c4",spawnRegion:"办公室",faction:"中立",waterNative:false,text:"又开始叫了：同地区敌方不能新发动主动技能，已提交效果保留。画圆：自由行动0AP、每个人回合一次，固定本区及邻区至下次自己开始；受限者跨界可付1AP豁免本条位移链。H暂定解释N-07／N-08，待验收。"},
 "character-001": {
  "id": "character-001",
  "name": "6+6",
  "hp": 4,
  "spawn": "r1c2",
  "spawnRegion": "教学楼",
  "faction": "中立",
  "waterNative": false,
  "text": "组织部部长：自己个人开始，其他角色依行动顺序向自己正交1格，无合法落点原地。6：有归属角色的最终d6为6，可免费摸2，30秒可放弃。"
 },
 "character-015": {
  "id": "character-015",
  "name": "猴三",
  "hp": 4,
  "spawn": "r4c4",
  "spawnRegion": "办公室",
  "faction": "机械猴子",
  "waterNative": false,
  "text": "拖动进度条：HP从非最低变成并列最低，当前效果链及个人结束结算后插入自己的个人回合，不开启新整轮。狂叫：每条原始行动链可免费重掷自己的骰一次，在人机之后、数学天才之前。"
 },
 "character-039": {
  "id": "character-039",
  "name": "忘尘雪",
  "hp": 4,
  "spawn": "r1c2",
  "spawnRegion": "教学楼",
  "faction": "中立",
  "waterNative": false,
  "text": "冰封之力：自由行动2AP，使其他在图存活角色下次个人回合跳过自由行动；开始摸牌、资源、强制结算及个人结束照常。跨自己两次个人开始后可再用，不叠加未消费标记。"
 }
} as const;
