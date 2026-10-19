# 应猴传说：高唐之战

四人校园地图卡牌游戏，支持各自为战与2对2。**2026-10-19，负责人确认已上线并通过真人游玩验收，P2正式完成。** 当前进入P3规划交接。

[进入游戏](https://monkey-legend-p2.app.workbuddy.host/) · [当前计划](docs/plan.md) · [P2结项与证据](docs/p2-closeout.md) · [P3新agent交接](docs/p3-handoff.md)

当前代码版本：**0.2.8-p2.9／web-v0.1.10／schema2／engineRevision21**。16角色、76种191实体基础牌，经典4×8地图；装备坐骑、反制、地形控制、普通复活和插队已实现。旧局及已开始选角保留其保存版本。上线／真人验收来自负责人确认，本次收尾环境DNS查询失败，未独立复测公网资产。

P2还包括好友房、数据库权威状态、身份恢复、聊天观战、结算再开、完整地图和手机主界面单屏、技能按钮直显、PC手牌拖动与滚轮、完整牌效提示及默认提示音。应豪两项历史反馈及未来建议继续登记在[P3待办](docs/p3-backlog.md)。

## 开发与运行

使用Node22.12+的22.x或24.x，依赖按锁文件安装。在仓库目录执行：

```powershell
npm ci
npm run dev
```

`npm run dev`仅启动Vite。完整好友联机应用需要公开配置`config/workbuddy-public.json`，生产构建与启动：

```powershell
npm run build
npm start
```

网关读取PORT并监听0.0.0.0；本机验证可设置ML_LOOPBACK=1。配置模板与数据库步骤见[数据库说明](database/README.md)、[最终WorkBuddy交接](docs/p2-card-feedback-workbuddy.md)。不要对已上线数据库重装或自动运行会创建房间的verify-cloud-*脚本。

## 规则、验证与交付

- [最新网页规则v0.1.10](docs/web-rules-v0.1.10.md)及其引用链；[历史规格索引](docs/rules-spec.md)、[原作资料](docs/cards/README.md)、[裁定来源](docs/rule-decisions.md)。
- [最终开发验证与截图](docs/p2-card-feedback-validation.md)、[最终交付包及SHA-256](docs/p2-card-feedback-delivery.md)、[P2正式结项](docs/p2-closeout.md)。
- [P3交接](docs/p3-handoff.md)、[遗留待办](docs/p3-backlog.md)、[开发日志](docs/development-log.md)、[协作规则](docs/AGENTS.md)。

本地检查用`npm test -- --maxWorkers=2`、`npm run typecheck`、`npm run verify:data`、`npm run verify:db-data`、`npm run verify:catalog`；数据生成器修改前先了解历史快照与迁移冻结关系。

最终WorkBuddy总包保存在本机releases目录（Git忽略），版本0.2.8-p2.9，准确路径和哈希见交付记录。GitHub上的[v0.2.0-p2.1](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)为早期P2归档，不能当作最新部署包。P1的Windows一键本地包和操作说明仍见[历史P1发布](docs/p1-release.md)。

P2反馈Issue #9、#10、#13、#14按负责人结项授权收尾，实际状态见结项回执；独立的卡牌格式Issue #2／PR #3和P1反馈#8保留。后续普通角色扩展需先确定批次，神牌与课程仍属P4，3—6人／3v3不自动纳入当前范围。
