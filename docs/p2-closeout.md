# P2 正式结项记录

结项日期：2026-10-19，Asia/Hong_Kong。**P2 已完成，P3 尚未实施。**

## 验收依据与版本

负责人在当前会话明确确认：“游戏已经上线并经过真人游玩验收，目前可认为p2完结”，并授权完善文档、关闭 GitHub 上 P2 Issue、编写 P3 交接。此确认替代此前“待部署／待真人验收／P2暂不结项”的阶段状态，足以完成本次阶段结项。

仓库收尾起点为 main `b67a7521bda74bf91ab7096d51558eb1fb397fb8`；实际运行代码及交付源码提交为 `fd893dd4f9e2c82ded21e696dd66042724243b28`。应用 **0.2.8-p2.9**、规则 **web-v0.1.10**、schema **2**、engineRevision **21**，16角色、76种191张基础牌实体。版本从 package.json 与 packages/online/src/version.ts 核对。

上线及真人验收的来源为负责人确认。本次工具环境对既有域名的 GET /、/health、/ready 均因 DNS 解析失败而未取得 HTTP 响应，不能独立核对当前公网资产或实际云数据库修订；不由此撤销负责人的结项决定，也不宣称本次重新完成云端测试。没有补造设备清单、两模式局数、局长、迁移时刻或 SQL 权限原始回执。查询与确认原文见[收尾证据](../artifacts/p2-closeout/evidence.json)。

## 完成范围

| 范围 | P2交付结果 |
|---|---|
| 好友联机 | 数据库权威状态、Node/Socket.IO网关、四位房间码、身份恢复、私密玩家视图、幂等及计时恢复 |
| 四人两模式 | FFA及2v2；16角色逐人三选一、唯一角色、阵营分池、固定出生地区内随机空格 |
| 普通内容 | 76种191实体基础牌；装备坐骑、反制链、普通复活、地形控制、插队及阵营机制 |
| 地图与交互 | 经典4×8地图、地点、水域、毒圈轰炸；地图完整、手机主界面单屏、技能按钮直显、PC手牌拖动和滚轮、完整牌效提示 |
| 社交与展示 | 聊天弹幕、观战、动作提示、骰子及发牌动画、结算再开；提示音默认启用，浏览器首次交互解锁 |
| 最终规则修订 | 角色选择30秒；占格及帝汶越水；北帝汶互斥目标；搏击操3/4/5AP、原始获得者入弃回复与高等级免费反制；地点分别禁牌、JJ仅攻击暴露 |
| 最后反馈操作 | 卫汶找你目标／猜点／落点入口及结果提示；紫檀木合法阵亡角色入口和费用锁定 |

规则以[最新v0.1.10](web-rules-v0.1.10.md)及其引用链为准，不把原始牌面资料当作当前网页全部裁定。旧局与已开始选角始终沿用保存版本。

## 证据索引

| 证据层次 | 可复核资料 | 解释边界 |
|---|---|---|
| 早期真实云端 | [P2验证](p2-validation.md)、artifacts/p2/online/、artifacts/p2/database/ | 当时版本的云RPC、恢复和部署报告，不能冒充最终版重测 |
| 最终代码回归 | [最终反馈验证](p2-card-feedback-validation.md)、artifacts/p2-card-feedback/full-regression.json | 73文件588项；最后边界6文件39项、默认音频4文件18项另存，不相加充作独立总数 |
| 界面审核 | 上述验证文档及同目录PC／手机截图、[手机单屏验证](p2-mobile-single-screen-validation.md) | 负责人已批准截图；模拟视口与实体设备验收来源分别保留 |
| 房间真实接口 | artifacts/p2-card-feedback/authenticated-rpc.json | 隔离PGlite公共RPC与合法身份实测，非生产写入 |
| WorkBuddy交付 | [交付记录](p2-card-feedback-delivery.md)、artifacts/p2-card-feedback/package-validation.json | 独立解压构建、启动、权限及18/19/20→21升级验证 |
| 上线和真人验收 | 本次负责人直接确认及[收尾证据](../artifacts/p2-closeout/evidence.json) | 完成阶段验收；未另取得最终云端原始回执与逐设备录像 |

最终总包为 `releases/monkey-legend-0.2.8-p2.9-card-feedback-workbuddy-all.zip`，SHA-256：
`5d9431391a70dd59bfe744c1e48debb8adc609e6746985c213f63c579668d0a4`。
源码／SQL共同快照：`359014c9bb89215a69f5e0f6620203d44587b7cadf21bfd0544d4023c26b68ca`。
包保留本机 releases（Git忽略），本次不重写、不重新发布旧Release；GitHub早期v0.2.0-p2.1附件不是这个最终包。

## GitHub收尾

已完整读取所有开放Issue，并复核 #9、#10、#13、#14 正文及全部评论（分别1、1、16、6条）。P2范围如下：

| Issue | 结项归属与处置 |
|---|---|
| [#9 简化界面](https://github.com/NoobPvPerL/monkey-legend/issues/9) | P2已提前完成紧凑布局、规则独立窗口、手机主界面单屏；按负责人验收关闭 |
| [#10 发牌动画](https://github.com/NoobPvPerL/monkey-legend/issues/10) | P2已实现开局展示、发牌动画及恢复不重播；按负责人验收关闭 |
| [#13 P2游戏反馈](https://github.com/NoobPvPerL/monkey-legend/issues/13) | P2反馈主线结项；未实施建议和未修问题逐项移交后续，不声称每条评论均已技术解决 |
| [#14 第三批规则补充](https://github.com/NoobPvPerL/monkey-legend/issues/14) | 经典图、选角、全基础牌及装备已经完成；后续会话裁定覆盖早期建议，按阶段完成关闭 |

执行结果及关联提交写入[Issue回执](../artifacts/p2-closeout/github-issues.json)；表中处置须以该回执的实际远程状态为准。GitHub连接器的评论／更新接口返回403，未写入独立评论；使用已授权的main结项提交及GitHub关闭关键字关联四项，说明由提交与本文承载，并在推送后逐项读取远端状态。独立的 #2 卡牌数据格式、#8 P1反馈不在本次关闭范围，PR不作为Issue误关。

## 后续保留项

阶段结项不等于抹去历史问题。应豪猴子游戏免疫仍未实施、冲撞原现场未复现；3—6人／3v3与主题色建议尚未实施。全部列入[后续待办](p3-backlog.md)，由P3接手先核对、列方案，不能反向标为P2已修。长期平衡、局长、多设备与高并发覆盖继续按P5计划安排。

本次仅文档、只读查询及已授权的Issue收尾；没有修改运行代码、原始资料、SQL迁移、线上数据或部署包。进入P3以[当前计划](plan.md)和[P3交接](p3-handoff.md)为准；旧P2文档正文保留为历史证据。
