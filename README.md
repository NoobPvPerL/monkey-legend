# 应猴传说：高唐之战

2026-10-23审核更新：负责人已核对当前规则与截图，批准继续构建、独立验包及GitHub上传；[审核记录](docs/p3-approval.md)。以下较早“待审核／等待审核阻塞”是当时检查点，已由本次授权替代。实际制包／上传结果另据真实回执更新，生产执行和P3阶段结项仍未授权。

四人校园地图卡牌游戏，支持各自为战与2对2。2026-10-19负责人确认上线并通过真人游玩验收，P2正式完成；P3当前已完成本次52角色开发交付候选及独立验包。

[进入游戏](https://monkey-legend-p2.app.workbuddy.host/) · [当前计划](docs/plan.md) · [P2结项](docs/p2-closeout.md) · [P3交接](docs/p3-handoff.md)

当前P3本地候选：**0.3.8-p3.9／web-v0.1.19／schema2／修订30，52角色、76种191实体**。A—H普通新局／选角及数据库权威链路已接通本地候选，030已生成并在隔离库验证，000—029冻结。H的N-03—N-13与G的N-01／N-02已由负责人核对并批准按当前实现交付；008大帝汶另批。C—F84张及H技能81张截图保留，新增正常H选角／出生／开局20张PC／手机视口截图。旧局和旧选角保持保存版本；旧v14初始化修复已含030后继工厂，不改冻结迁移或已有状态。

本次源码已固定为8342fa0e30e829915ff12ebe9c3bde10662e6ead，完整回归1507／1507通过；实际WorkBuddy包已构建并独立解压、安装、构建及验证，总包112.55MiB。GitHub源码与[本次Release](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.3.8-p3.9)已上传并下载核对；没有执行生产写入。详见[P3交付记录](docs/p3-delivery.md)，云端执行与P3阶段验收另需授权及证据。

[H验收入口](docs/p3-batch-h-review.md) · [完整候选验证及20张截图](docs/p3-h-activation-validation.md) · [交付核对表](docs/p3-release-readiness.md)

P2已验收基线：0.2.8-p2.9／web-v0.1.10／schema2／修订21，16角色、76种191实体。上线及真人验收依据负责人确认；收尾工具未独立取得最终公网回执。当前本地候选不代表线上已升级。

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

- [当前H候选规则v0.1.19](docs/web-rules-v0.1.19.md)与[P2已验收v0.1.10](docs/web-rules-v0.1.10.md)及其引用链；[历史规格索引](docs/rules-spec.md)、[原作资料](docs/cards/README.md)、[裁定来源](docs/rule-decisions.md)。
- [最终开发验证与截图](docs/p2-card-feedback-validation.md)、[最终交付包及SHA-256](docs/p2-card-feedback-delivery.md)、[P2正式结项](docs/p2-closeout.md)。
- [P3交接](docs/p3-handoff.md)、[遗留待办](docs/p3-backlog.md)、[开发日志](docs/development-log.md)、[协作规则](docs/AGENTS.md)。

本地检查用`npm test -- --maxWorkers=2`、`npm run typecheck`、`npm run verify:data`、`npm run verify:db-data`、`npm run verify:catalog`；数据生成器修改前先了解历史快照与迁移冻结关系。

本次P3 WorkBuddy总包0.3.8-p3.9保存在本机releases目录（Git忽略），准确路径、SHA256及独立验包回执见[P3交付记录](docs/p3-delivery.md)。0.2.8-p2.9总包保留为P2历史交付。GitHub上的[v0.2.0-p2.1](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)为早期P2归档，不能当作最新部署包。P1的Windows一键本地包和操作说明仍见[历史P1发布](docs/p1-release.md)。

P2反馈Issue #9、#10、#13、#14已关闭并逐项复核远端completed状态，见结项回执；独立的卡牌格式Issue #2／PR #3和P1反馈#8保留。后续普通角色扩展需先确定批次，神牌与课程仍属P4，3—6人／3v3不自动纳入当前范围。
