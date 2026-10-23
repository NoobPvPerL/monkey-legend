# 0.3.8-p3.9 P3交付记录

2026-10-23，Asia/Hong_Kong。负责人已核对当前规则／截图并授权继续构建、独立验包与GitHub上传；见[审核记录](p3-approval.md)。当前完成本地交付包构建及独立验证，GitHub上传回执后补。未执行生产迁移／部署，也未将本次构建当作P3真人验收或阶段结项。

## 实际产物

- 总包：`releases/monkey-legend-0.3.8-p3.9-p3-workbuddy-all.zip`，112.55MiB（118012571字节）。
- SHA256：`5d380b2490d9d4156589984be77e850c63bbbab6518caa678f27113d6611e8d1`，同名`.zip.sha256`可复核。
- 源码提交：`8342fa0e30e829915ff12ebe9c3bde10662e6ead`，sourceDirty=false。
- 源码／SQL共同快照：`5b1e95d66eccb6b97687d9d966d3c7509d1897326370fcb3387cd21681ddef3c`；1654个源码／公开配置文件。
- 应用0.3.8-p3.9／web-v0.1.19／schema2／修订30；52角色、76种191实体，128项稳定ID参考图。
- 内层源码ZIP、SQL升级ZIP，18—29各起点单语句升级入口，WorkBuddy说明、规则说明、PACKAGE-VALIDATION和SHA256SUMS。

本次不覆盖旧P2包。源码与SQL绑定上述提交及快照；后续交付／上传回执文档提交不倒改已验证ZIP。

## 开发及实际包验证

- 最终完整回归1507／1507通过（142文件），Python7项单独通过；普通沙箱首轮7项回环网络失败的原报告保留，获准环境重跑通过，未改断言／时限。
- 审核后的20张PC／手机入口截图及24次SQL重放通过；此前C—F84图、H技能81图与旧20图哈希保持。本地视口证据不是实体手机或云端真人验收。
- 独立解压后，实际离线`npm ci`安装72个依赖包并完成生产build；依赖解析在该副本内，未借工作仓库补文件。esbuild未批准postinstall与Vite大分块提示保留，构建通过，未修改全局脚本许可。
- 实际包内manifest全部文件、源码／SQL迁移字节、共同快照、两个ZIP哈希、191份来源图片／文档及128项参考图均核对。
- 包内schema1及完整18—29→30的实际单语句SQL：故障整体回滚、重复、就绪、anon／authenticated权限、旧房间身份与目录保留通过；verify.sql全部就绪检查通过。
- 独立构建网关使用强制`.invalid`配置启动：health为0.3.8／v19／30，ready503；HTML、JS／CSS和128参考图可访问，源码／配置直读404。没有连接生产RPC，不能把此503当成云端故障或宣称云端ready200。
- 最终总ZIP复验CRC、全部18个外层文件／SHA256SUMS、两个嵌入ZIP及内嵌验证报告一致。

证据：[独立构建](../artifacts/p3-batch-h/independent-source-build.json)、[实际包验证](../artifacts/p3-batch-h/package-validation.json)、[总ZIP复验](../artifacts/p3-batch-h/outer-package-validation.json)、[最终回归](../artifacts/p3-batch-h/full-regression-release-final.json)。

## GitHub与生产边界

源码及本次总包待上传并独立读取远端回执；不拿旧P2 Release代替本次包。008大帝汶、神牌／课程、人数及主题色保持原另批范围。生产迁移／部署与新阶段真人验收另需对应授权及真实证据；操作说明见[P3 WorkBuddy交接](p3-workbuddy.md)。
