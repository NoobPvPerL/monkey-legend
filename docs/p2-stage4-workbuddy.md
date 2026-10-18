> 2026-10-18补充：后续真人反馈修订见[web-v0.1.8](web-rules-v0.1.8.md)、[补丁验证](p2-playtest-validation.md)及[WorkBuddy补丁交接](p2-playtest-workbuddy.md)。本文保留原阶段历史；0.2.5-p2.6已经上线，新的019补丁尚未部署。

# WorkBuddy：阶段四部署交接

版本 **0.2.5-p2.6 / web-v0.1.7 / schema2 / engineRevision18**，16角色、76种191实体、92份浏览器参考素材。配套ZIP及校验位于 `releases/monkey-legend-0.2.5-p2.6-stage4-workbuddy/`，该目录是交付入口，勿混用旧阶段三包。

## 执行步骤

1. 核对两个ZIP的SHA256SUMS.txt，以及解压后manifest逐文件哈希、相同sourceSnapshotSha256与sourceCommit。PACKAGE-VALIDATION.json记录独立解压构建／数据库验证；它不等于云端验收。
2. 沿用既有应用、域名和云库。保留数据库快照、旧应用包与公开配置；暂停旧网关写入后执行迁移，切换新应用再恢复，通知玩家刷新。
3. **已完整016：同一事务安装017、018。** 017仅私有目录，单独装它不会启用76牌；018统一更新引擎、新开局和health。完整014需015—018；完整012需014—018，013可跳过。补丁不明确／schema1用本包005—018完整增量事务；不要重装000—004、不清库、不改房间JSON。标准psql可用install.sql；单prepared-statement渠道用install-one-statement.sql，两者二选一。
4. 迁移保留旧房间码、成员、凭证、matchId、回执、聊天、旧profile及进行中游戏／选角。新局才用v0.1.7；旧v0.1.6选角完成仍产生85牌旧局。重跑不把既有游戏升级一半。
5. 执行verify.sql，保存完整结果：schemaVersion=2、engineRevision=18、ruleVersion=web-v0.1.7、cardDefinitions=76、cardInstances=191，stage4Ready及以前的feedbackRulesReady／versionedDataReady／locationDataReady／locationRulesReady／waterRulesReady／environmentRulesReady／classicPlayable／classicPatchReady／draftReady／characterSkillsReady／stage3Ready均true。anon和authenticated只能使用五个公开RPC，不得直读私有表或执行私有引擎／报价。
6. 源码解压后 `npm ci`、`npm run build`、`npm start`；Node22.12+的22.x或24.x，单PORT监听0.0.0.0，HTTPS同域，保留长轮询及WebSocket升级。包内config/workbuddy-public.json只含白名单公开配置，不含管理员密钥；如公开配置已轮换，按当前应用公开配置替换。不要把凭证／数据库密钥写入源码、日志或反馈。
7. 保存 `/health`（version=0.2.5-p2.6、ruleVersion=web-v0.1.7、requiredEngineRevision=18）与 `/ready`（200）。只见静态网页或/health=200不代表数据库已就绪；旧库配新应用的/ready应503。确认JS/CSS和references/index.json列出的92个素材URL可取。

## 云端验收

- 四名真实玩家两模式开局、30秒选角超时、断线续原候选／截止时间；观众见全手牌和当前候选、玩家仅见自己，观众无法执行游戏命令。
- 随机费用先报价后确认，取消、刷新、换手、重试不重掷；响应报价不续10秒。收集石头X实际扣费，判官−1AP收益正确，JJ不免X。
- 三层反制与超时、强制交牌、插队在移动／弃牌／回合收尾排队；没有重复扣费、个人结束或环境伤害，实体始终191张。
- 转学手册偷取／替换／失去、Bob复制与损坏、手表／子腾／快速车、关烁／临伟叶、唐车地点正负效果；梅梅涛最高优先级及持续强化来源。
- 王漠／汶泽叠图、厕所／LMM／占座、跑操／上课铃并列路径、移家返回、转换换队后自然胜负；选中可用目标、AP不足与到期提示清楚。
- 保留此前反馈修复：头锤吸完AP及日志、搏击操仅敌人群体、攻击不限次数、弃牌20秒、成功出牌重置60秒、移动结束计费、轰炸图标、野人和保护地点、跑者补点不削减已有>6AP。
- 360／390宽手机手牌竖向完整、横向滑动，无可见滚动条；聊天／弹幕、观战、同码再来一局、重连接管、网关重启和旧局恢复。真机触摸与公网弱网需要现场验收，本地截图不能替代。

返回部署时间、公开健康与就绪、SQL权限输出、所用ZIP及快照哈希、设备／模式／场景／结果，失败时附公开日志，不附凭证或随机源。

## 回退与边界

迁移事务失败应整体回滚，停止切流并保存错误。迁移成功后如需回退，先停写，使用事前数据库快照和对应旧应用一起恢复；不能仅降级客户端或手改函数。回退会丢失快照后产生的局／消息，须按实际恢复方案处理，勿声称无损。

全新隔离库用源码000—018，不在生产重做初始化。`verify:cloud-database -- <publicConfig.json> --isolated-test`会创建测试房间，只能明确授权后在独立测试环境运行，可能留下未结束房间；不自动在build/start执行。本次Codex只交付部署包，没有执行云端迁移或真人验收。

规范见[web-v0.1.7](web-rules-v0.1.7.md)、[批准裁定](p2-stage4-decisions.md)、[自主处理](p2-stage4-autonomous-decisions.md)。开发验证与P2状态见[验证记录](p2-stage4-validation.md)、[完成审计](p2-stage4-p2-audit.md)。
