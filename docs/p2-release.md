# P2 发布与部署记录

2026-10-16，Asia/Hong_Kong。此记录仅回填交付证据，不改变游戏源码、已发布ZIP或标签。

## 当前发布

- [在线游戏](https://monkey-legend-p2.app.workbuddy.host/)已上线；负责人明确确认已完成一轮真人游玩，并要求将P2正式发布到GitHub、开启反馈。
- [正式Release v0.2.0-p2.1](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)沿用下面已核验的源码提交、标签与3个附件，更新发布名称、正文及正式发布状态。
- P2通过[PR #12](https://github.com/NoobPvPerL/monkey-legend/pull/12)合入main；[P2 游戏反馈 Issue #13](https://github.com/NoobPvPerL/monkey-legend/issues/13)已开启，模板见[p2-feedback.md](p2-feedback.md)。
- WorkBuddy部署报告对应源码c787088，回报316项清单核对、保留域名部署、GET/POST长轮询、私密手牌、进程重新发布后恢复原房间/座位/对局且时钟继续。本次Codex只读确认首页/health/ready均200，版本0.2.0-p2.1、规则web-v0.1.1、云数据库就绪。
- 部署报告、负责人确认与Codex只读检查分别记入[上线来源记录](../artifacts/p2/online/deployment-confirmation.json)，不上传包含恢复凭据的原始客户端回执。
- 一轮真人游玩为负责人确认；不填充未提供的模式、人数、设备、局长、胜负或问题清单，不把它扩大为全部设备与边界场景验收。多副本会话路由、移动端覆盖、长期稳定性及平衡继续反馈。

## 首次开发预发布记录（历史）

- [v0.2.0-p2.1预发布](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)已于17:35发布，draft=false、prerelease=true。
- 标签与源码包均固定到`c7870881063aa3967ba1a6c3485fbfde09f35c6c`；sourceDirty=false。后续本条交付记录提交不移动该标签。
- [草稿PR #12](https://github.com/NoobPvPerL/monkey-legend/pull/12)，P2分支已推送；等待部署与负责人验收，未合并main。
- 完整源码ZIP：`monkey-legend-0.2.0-p2.1-online-source-verified.zip`，64,110,285字节；SHA-256：`d16a74d9ad21b2afcbd802648593b23a0464b0082c5fe5b1af60744b41903cb4`。
- 附件共3个：源码ZIP、对应`.sha256`、`p2-online-source-validation.json`。GitHub返回state=uploaded，大小与digest逐项一致；[远程记录](../artifacts/p2/online/github-release.json)。
- 独立解压后316项manifest哈希一致；Node22.13.1下全新npm ci（0 vulnerabilities）、前后端构建、原资料哈希、独立服务启动、真实云ready、JS/CSS和16张参考图、配置静态读取拒绝均通过；[包验证](../artifacts/p2/online/package-validation.json)。包不含node_modules、构建目录、Git元数据或管理员秘密；公开配置随包提供。
- 数据库原000—004迁移未修改，已部署的云数据库不需要重装。新增单语句SQL安装交付方式仅用于后续新建隔离环境。
- 本次创建的本机网关和四个临时浏览器标签页已关闭。合成云端对局按正常期限和清理策略推进，未删除业务表或改动云时钟。

上列17:35的开发交接状态保留为历史；随后WorkBuddy已完成同域部署并返回回报，负责人确认一轮真人游玩。当前发布及反馈状态以上方“当前发布”为准。
