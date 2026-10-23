# P3 WorkBuddy交付操作说明

2026-10-23审核更新：负责人已核对当前规则与截图，批准继续构建、独立验包及GitHub上传；[审核记录](p3-approval.md)。以下较早“待审核／等待审核阻塞”是当时检查点，已由本次授权替代。实际制包／上传结果另据真实回执更新，生产执行和P3阶段结项仍未授权。

2026-10-23。候选0.3.8-p3.9／web-v0.1.19／schema2／修订30，52角色、76种191实体。负责人已核对规则／截图并授权继续构建及上传。最终全量1507项和源码构建通过，实际包独立验证与上传结果以交付回执为准；不得把收到ZIP当作生产部署授权。

## 范围及来源

A—H本地实现、应豪猴子游戏免疫、土豆含水域全图传送及手机离开观战布局修复均在候选中。H九角色的N-03—N-13及G的N-01／N-02已随当前候选整体核对，见[H验收入口](p3-batch-h-review.md)。008大帝汶另批；神牌／课程P4，人数／主题色另批。P2已获负责人上线和真人验收确认；本候选不代表P3上线或结项。

旧局／已开始选角保留保存版本，000—029与原始来源不改。030包含完整H普通工厂／选角、新出生选择、共享装备换队刷新，以及旧v14初始选择前C状态的后继修复；不回填已有保存状态。客户端只发意图，权威判定仍在数据库。

## 经审核批准后的本地制包顺序

以下命令只能在取得本次审核后执行。当前已获本次审核，源码构建通过，以下为实际制包与独立验证流程。先固定最终规则、版本和源码快照，重新读取Git状态与远端，不覆盖已有改动或旧包。

```powershell
# 在最终审核后的仓库快照中；配置仅含公开SDK字段
python -B tools/package-p3-delivery.py --assemble --config <公开配置JSON路径>
# 工作树默认须干净；如另外批准工作树快照，才追加 --snapshot
```

组装器创建源码／SQL ZIP及独立解压副本，带上18—29各起点的升级入口。此时并未宣称独立验证通过，也未创建最终总ZIP。状态文件记录共同源码快照、提交、dirty标记和两个ZIP哈希。

```powershell
$p3StatePath = (Resolve-Path -LiteralPath '.release-cache/p3-package-current.json').Path
$p3PackageState = Get-Content -LiteralPath $p3StatePath -Raw | ConvertFrom-Json
Push-Location -LiteralPath $p3PackageState.source
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw '独立副本依赖安装失败' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw '独立副本构建失败' }
    node tools/verify-p3-package.mjs $p3StatePath
    if ($LASTEXITCODE -ne 0) { throw '独立包验证失败' }
} finally {
    Pop-Location
}
python -B tools/package-p3-delivery.py --finalize --state $p3StatePath
```

验证器必须从独立解压源码中运行，并要求依赖解析到该副本自己的node_modules。核对源码／SQL全部manifest文件、共同快照、迁移字节与ZIP绑定；检查191份原始图片／文档、128项稳定ID参考图；在内存PostgreSQL执行实际包内schema1及18—29升级、回滚／重复、权限／verify和旧身份／目录保留；启动独立构建的网关核对health、静态资源与敏感源码404。启动探针强制使用`.invalid`云地址，要求ready503；隔离SQL的就绪检查不冒充云端ready200。

只有`PACKAGE-VALIDATION.json`通过且与同一快照、提交、dirty标记、原ZIP哈希一致，finalize才生成SHA256SUMS、最终总ZIP和外部ZIP哈希文件。不能拿仓库文件补齐缺项，不能手改报告为passed。实际执行后仍须检查最终总ZIP和回执，才上传GitHub并重新读取远端结果；当前没有执行上传。

## 将来获独立生产授权后的交接

1. 核对实际包内manifest、PACKAGE-VALIDATION、SHA256SUMS与总ZIP外部哈希，保留旧应用包及数据库快照。
2. 完整21使用21→30入口，完整29只追加030；其他18—29完整基线使用对应入口。schema1增量为005—030。不能仅凭schemaVersion判断已安装，不能跳过中间前置或重装000—004清库。
3. 若库里存在内容不同的同名私有v19目录，030会拒绝，禁止覆盖保存规则；先在独立环境核对目录差异并取得处理授权。
4. 配套应用需要v19／修订≥30／52角色和全部前置就绪标志。旧库或缺H函数／目录时应拒绝就绪；旧局仍用旧规则，新H验收须新开选角／新局。035在全员初始摸牌前先选出生格。
5. 云端只读核对部署版本、资源哈希、health／ready和SQL权限原始输出。任何会创建房间的云端探针另需隔离环境授权；旧`verify-cloud-database.mjs`是P2专用，不能作为本次P3探针。

记录真实执行时间、环境、快照、哈希及输出。云端执行、实体手机／PC真人验收和P3阶段结项分别需要相应证据与明确确认。回退须遵循事先批准的应用／数据库备份方案，不擅自删除030或改回旧函数。
