# monkey-legend

应猴传说：高唐之战。四人校园地图卡牌游戏。

**当前阶段四候选：0.2.5-p2.6 / web-v0.1.7 / schema2 / engineRevision18。**

16角色三选一、76种191实体基础牌、完整装备和坐骑、反制链、区域地形与插队均已接通；旧局与已开始选角保留原版本。规则见[web-v0.1.7](docs/web-rules-v0.1.7.md)，验证见[阶段四记录](docs/p2-stage4-validation.md)，部署见[WorkBuddy交接](docs/p2-stage4-workbuddy.md)。本地开发／交付与云端部署／真人验收分别记录，[P2完成审计](docs/p2-stage4-p2-audit.md)持续追踪待验项。以下旧版本及上线记录保留为历史快照。

负责人批准由Codex补全网页版规则，完成记录见 [P0验收](docs/p0-acceptance-cases.md)。

**[进入在线游戏](https://monkey-legend-p2.app.workbuddy.host/) · [P2 游戏反馈 Issue #13](https://github.com/NoobPvPerL/monkey-legend/issues/13) · [版本下载](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)**

P2已实现WorkBuddy云数据库权威规则、Node/Socket.IO网关和独立联机页面，真实云端两模式整局与强杀恢复检查通过。WorkBuddy已回报同域部署、长轮询、私密视图和重启恢复实测；本次核对首页、health、ready均正常。真人试玩结果来自负责人确认；完整设备覆盖、长期稳定性和平衡继续收集反馈。见[发布记录](docs/p2-release.md)、[验证记录](docs/p2-validation.md)与[反馈模板](docs/p2-feedback.md)。

P2完整应用：准备公开配置`config/workbuddy-public.json`，执行`npm ci && npm run build`后`npm start`；读取`PORT`并监听0.0.0.0。开发者本机复验设置`ML_LOOPBACK=1`仅监听127.0.0.1。每次进入先确认玩家名，创建/加入四位码房间；本地测试桌和复现工具从入口单独打开。单独`npm run dev`只运行Vite，不包含联机网关。

[P2版本v0.2.0-p2.1](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)提供完整源码ZIP、SHA-256与包验证附件；直接游玩使用上方在线地址。

当前工作区候选 **0.2.2-p2.3 / web-v0.1.4 / schema2 / engineRevision12**：阶段2已在本地实现经典地图、固定地区随机空格出生、地点操作、10秒水域弃牌与轮末地区环境；新局继承攻击牌不限次数。lemon属于帝汶家族随从，出生／所述复活地点为操场。仍使用已实现的4角色、12种64实体牌，新增角色／全牌池／装备在后续阶段开发；原v0.1.1—v0.1.3进行中对局保持保存版本。候选尚未提交、推送或部署。见 [候选规则](docs/web-rules-v0.1.4.md)、[阶段2验证](docs/p2-stage2-validation.md)、[升级交接](docs/p2-third-batch-workbuddy.md)。

阶段三已启动：选角基础与界面组件完成本地验证，正式房间尚未启用；家族分池及Q2—Q4已获负责人批准，完整角色实现与阶段四依赖仍未完成。见[待补裁定](docs/p2-stage3-decisions.md)及[阶段三进展](docs/p2-stage3-validation.md)。

## 开发入口

- [网页版权威规则 v0.1.1](docs/web-rules-v0.1.md)：旧版规则基线；旧局继续叠加其保存的v0.1.2／v0.1.3差异；候选经典图见v0.1.4。
- [规则规格索引](docs/rules-spec.md)、[32格地图与移动](docs/map-spec.md)、[首版范围及64张牌池](docs/mvp-scope.md)。
- [验收案例与文档推演](docs/p0-acceptance-cases.md)：46项规格案例、两种模式完整推演；不是游戏运行报告。
- [进度计划](docs/plan.md)、[开发方案](docs/网页游戏开发方案.md)：阶段划分；P1本地规则引擎与测试桌已实现。
- [原作/群聊历史规则](docs/rule.md)、[裁定与版本差异](docs/rule-decisions.md)：保留原文、来源与更正轨迹。
- [原始卡牌资料](docs/cards/README.md)：153种内容；[素材台账](docs/assets-manifest.json)：187张图片、稳定ID与SHA-256。

首版四角色、十二种基础牌，支持四人各自为战和2对2；角色原始阵营与本局队伍分开。保留AP5、整轮低于5加3、首轮不补牌、之后当前人抽2、自己结束按生命向下取整弃牌。采用本网格、响应/技能/环境/终局裁定；原始全部牌面不能直接作为首版运行数据。

[#7设计评审](https://github.com/NoobPvPerL/monkey-legend/issues/7)意见已整合并由负责人批准采用；旧#4/#5/#6已按要求关闭。卡牌格式与PR #3独立处理，本次未改卡牌存储格式。

P0完成与P1实现、平衡、发布分别验收。P1已执行引擎测试与关键浏览器交互；联机、真实四人试玩及20—30分钟局长仍待验证。按 [协作约束](docs/AGENTS.md)开展后续实施与验收。

## P1 本地测试桌

见[安装与操作说明](docs/p1-implementation.md)、[实际验证记录](docs/p1-validation.md)及[试玩与后续验收](docs/p1-handoff.md)。87项测试（含4项分发服务回归）、类型检查、来源哈希与生产构建通过；两模式规格对局已执行，直接手牌/响应/四角色技能/弃牌及文件往返已补验。

Windows启动：进入本仓库后执行 npm ci，再执行 npm run dev；测试用 npm test，构建用 npm run build。

## 成员本地测试预发布

[下载v0.1.0-p1.1游戏包](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.1.0-p1.1)，完整解压后双击“启动游戏.cmd”；内置运行时，无需安装Node/npm。请下载windows-x64游戏ZIP，不是GitHub自动生成的源码归档。

该P1 Release仅支持本机四座轮换。P2联机需要完整应用部署。P1包不含开发文档和测试场景；详细操作与打包流程见[发布说明](docs/p1-release.md)，进展见[开发日志](docs/development-log.md)。成员测试预发布不代表负责人正式验收。

源码也可双击start-local.cmd（需Node 24，首次安装依赖并构建）；开发修改后使用start-local.cmd --rebuild。

意见集中在[P1开发意见征集 #8](https://github.com/NoobPvPerL/monkey-legend/issues/8)；请附版本、模式/种子、复现步骤与预期/实际。[发布结果与进度](docs/development-log.md)已记录。

## 第三批反馈开发（2026-10-17）

本地候选0.2.2-p2.3已完成经典CSV数据准备、头锤明确日志、战斗结果提示、骰子延长显示、结算说明及升级识别。经典地图和随机出生尚未启用，待[Issue #14](https://github.com/NoobPvPerL/monkey-legend/issues/14)补齐规则。详见[实施与验证](docs/p2-third-batch-validation.md)及[后续部署说明](docs/p2-third-batch-workbuddy.md)。本轮未推送或部署。
