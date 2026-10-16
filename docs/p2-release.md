# P2 开发预发布与部署交接

2026-10-16，Asia/Hong_Kong。此记录仅回填交付证据，不改变游戏源码、已发布ZIP或标签。

- [v0.2.0-p2.1预发布](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)已于17:35发布，draft=false、prerelease=true。
- 标签与源码包均固定到`c7870881063aa3967ba1a6c3485fbfde09f35c6c`；sourceDirty=false。后续本条交付记录提交不移动该标签。
- [草稿PR #12](https://github.com/NoobPvPerL/monkey-legend/pull/12)，P2分支已推送；等待部署与负责人验收，未合并main。
- 完整源码ZIP：`monkey-legend-0.2.0-p2.1-online-source-verified.zip`，64,110,285字节；SHA-256：`d16a74d9ad21b2afcbd802648593b23a0464b0082c5fe5b1af60744b41903cb4`。
- 附件共3个：源码ZIP、对应`.sha256`、`p2-online-source-validation.json`。GitHub返回state=uploaded，大小与digest逐项一致；[远程记录](../artifacts/p2/online/github-release.json)。
- 独立解压后316项manifest哈希一致；Node22.13.1下全新npm ci（0 vulnerabilities）、前后端构建、原资料哈希、独立服务启动、真实云ready、JS/CSS和16张参考图、配置静态读取拒绝均通过；[包验证](../artifacts/p2/online/package-validation.json)。包不含node_modules、构建目录、Git元数据或管理员秘密；公开配置随包提供。
- 数据库原000—004迁移未修改，已部署的云数据库不需要重装。新增单语句SQL安装交付方式仅用于后续新建隔离环境。
- 本次创建的本机网关和四个临时浏览器标签页已关闭。合成云端对局按正常期限和清理策略推进，未删除业务表或改动云时钟。

下一步由WorkBuddy按[部署交接](p2-workbuddy-deploy.md)把完整应用发布到现有测试应用和保留域名，再返回实际安装、启动及反向代理测试记录。WorkBuddy域名验收、容器重启、多副本会话路由、异地设备/真人和负责人验收仍待进行；预发布附件可下载不代表网页已上线。
