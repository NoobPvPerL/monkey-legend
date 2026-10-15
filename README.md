# monkey-legend

应猴传说：高唐之战。四人校园地图卡牌游戏。

**P0已完成；当前基线web-v0.1.1。P1已形成可运行的本地开发检查点（2026-10-16），正式验收待继续。**
负责人批准由Codex补全网页版规则，完成记录见 [P0验收](docs/p0-acceptance-cases.md)。

## 开发入口

- [网页版权威规则 v0.1.1](docs/web-rules-v0.1.md)：首版实现唯一规则来源。
- [规则规格索引](docs/rules-spec.md)、[32格地图与移动](docs/map-spec.md)、[首版范围及64张牌池](docs/mvp-scope.md)。
- [验收案例与文档推演](docs/p0-acceptance-cases.md)：46项规格案例、两种模式完整推演；不是游戏运行报告。
- [进度计划](docs/plan.md)、[开发方案](docs/网页游戏开发方案.md)：下一阶段P1本地规则引擎及完整测试桌。
- [原作/群聊历史规则](docs/rule.md)、[裁定与版本差异](docs/rule-decisions.md)：保留原文、来源与更正轨迹。
- [原始卡牌资料](docs/cards/README.md)：153种内容；[素材台账](docs/assets-manifest.json)：187张图片、稳定ID与SHA-256。

首版四角色、十二种基础牌，支持四人各自为战和2对2；角色原始阵营与本局队伍分开。保留AP5、整轮低于5加3、首轮不补牌、之后当前人抽2、自己结束按生命向下取整弃牌。采用本网格、响应/技能/环境/终局裁定；原始全部牌面不能直接作为首版运行数据。

[#7设计评审](https://github.com/NoobPvPerL/monkey-legend/issues/7)意见已整合并由负责人批准采用；旧#4/#5/#6已按要求关闭。卡牌格式与PR #3独立处理，本次未改卡牌存储格式。

P0完成与P1实现、平衡、发布分别验收。P1已执行引擎测试与部分浏览器验证；联机、真实四人试玩及20—30分钟局长仍待验证。按 [协作约束](docs/AGENTS.md)开展后续实施与验收。

## P1 本地开发检查点

见[安装与操作说明](docs/p1-implementation.md)、[实际验证记录](docs/p1-validation.md)及[睡醒后续接清单](docs/p1-handoff.md)。73项测试与生产构建通过，两模式规格对局已在引擎和浏览器中执行；直接手牌/响应/技能/弃牌及文件往返仍待补验。

Windows启动：进入本仓库后执行 npm ci，再执行 npm run dev；测试用 npm test，构建用 npm run build。
