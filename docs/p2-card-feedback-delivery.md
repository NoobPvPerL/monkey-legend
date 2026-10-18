# 0.2.8-p2.9 WorkBuddy交付记录

日期：2026-10-19（Asia/Hong_Kong）。负责人通过本批PC／手机截图，追加“删除开启提示音按钮、默认有声音”，授权继续构建交付包后上传GitHub。应用0.2.8-p2.9／规则web-v0.1.10／schema2／engineRevision21，16角色、76种191实体。

## 实际交付文件

- 总包：`releases/monkey-legend-0.2.8-p2.9-card-feedback-workbuddy-all.zip`，70.88MiB。
- 总包SHA256：`5d9431391a70dd59bfe744c1e48debb8adc609e6746985c213f63c579668d0a4`，同名`.zip.sha256`可核对。
- 外层目录：`releases/monkey-legend-0.2.8-p2.9-card-feedback-workbuddy/`，包含源码ZIP、SQL ZIP、18／19／20起点单语句增量SQL、独立交接词、说明、验证报告及SHA256SUMS。
- 源码提交：`fd893dd4f9e2c82ded21e696dd66042724243b28`，sourceDirty=false。代码和截图来源为该干净提交；交付回执另行提交，不倒改已验证ZIP。
- 源码／SQL共同快照：`359014c9bb89215a69f5e0f6620203d44587b7cadf21bfd0544d4023c26b68ca`，729个源码／公开配置文件，逐文件manifest一致。

旧hand-feedback总包SHA256仍为`1824f1f27ac4555abf13e369b40b7c29e1ad06d2ba24ade7b198a93beb21d46b`，未覆盖。新包包含技能直显、手牌拖动／滚轮及牌效修订、新卡牌反馈和默认提示音；不含应豪两项修复。

## 独立验证结果

源码／SQL逐文件哈希、共同快照及全部迁移字节一致；在独立解压副本中实际执行锁文件离线`npm ci`和生产构建通过（保留esbuild安装脚本未批准与大于500kB分块的非阻断提示，未全局放开脚本）。只含公开SDK配置白名单，私有输入未入包。

隔离PGlite验证新装及完整修订18／19／20→21的单语句增量；health／权限／verify.sql／重复安装／旧目录及房间身份保留均通过。独立服务器使用强制`.invalid`云地址启动，health为0.2.8-p2.9／v0.1.10／21，HTML、JS／CSS和92份素材可访问，源码／配置直读404，未调用生产RPC。

前端资源：

- `index-BxnUfD8A.js`：`215b943c761265d257c7d86cb467663418f89b1edaaa960107597af50025871b`
- `index-DPMHgnu8.css`：`6bde2c1502c37b0a7b25c1dd613527dee2f66e91431c8b1938482d3d5eefcc07`

规则修订前序完整回归73文件588项；最后角色／单体保护边界6文件39项；默认音频及相关控件4文件18项均通过，不把这三个报告相加当作不重复测试数。完整[开发验证](p2-card-feedback-validation.md)及[独立包报告](../artifacts/p2-card-feedback/package-validation.json)可复核。

## WorkBuddy与验收边界

完整20只追加021；18／19先补齐中间迁移，不能只看schemaVersion。旧局、旧选角继续原规则，测试新规则应新开局。新应用连接仅20的数据库应拒绝就绪。交接入口见[p2-card-feedback-workbuddy.md](p2-card-feedback-workbuddy.md)，可直接复制外层`PROMPT-TO-WORKBUDDY.md`。

提示音开关已移除，默认启用；浏览器已有用户激活时立即准备声音，否则首次普通点击／按键自动解锁。浏览器首次交互前的自动播放限制仍适用，声音不阻断游戏操作。

本次按授权上传GitHub源码，不创建新Release或覆盖历史附件。没有执行生产部署／SQL写入或关闭Issue。云端及实体手机真人验收仍待负责人／WorkBuddy回传；卫汶找你与紫檀木原现场未完整复现，应豪仍待后续批次。P2不能据本地交付正式结项。
