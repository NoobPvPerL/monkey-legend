# P3交付输入预检

2026-10-23审核更新：负责人已核对当前规则与截图，批准继续构建、独立验包及GitHub上传；[审核记录](p3-approval.md)。以下较早“待审核／等待审核阻塞”是当时检查点，已由本次授权替代。实际制包／上传结果另据真实回执更新，生产执行和P3阶段结项仍未授权。

2026-10-23。本页是审核前的源码与安装流程预检，不是WorkBuddy交付记录。当前候选0.3.8-p3.9／web-v0.1.19／schema2／修订30／52角色／76种191实体；H暂定条款和截图仍待负责人核对，未执行交付构建或生产操作。

## 数据库安装流程

`tools/database-package-plan.mjs`抽出原package-database的纯SQL组装逻辑，供打包脚本和隔离验证共同调用。函数只返回内存中的安装文本和迁移列表，不创建目录、不连接数据库。它要求完整000—030，升级模式要求005—030；缺失或重复编号在打包创建目录前拒绝。冻结迁移内容不变。

`tests/p2/p3-h-install-plan.test.ts`使用同一函数生成的实际文本，经PGlite prepared query执行单语句DO包装。覆盖完整18—29各基线、schema1增量、空库标准事务与单语句两种形式、最低基线拒绝，以及迁移缺失／重复拒绝。升级矩阵核对实际公共RPC创建的旧房间、选角、身份和幂等回执，以及已有目录；故障注入后整体回滚，重复执行后仍就绪。schema1核对原有房间字段，允许新增列，但不改旧局内容。

首轮[16项全部通过](../artifacts/p3-batch-h/install-plan-tests.json)；增加schema1旧局保留和输入完整性门槛后[最终17／17通过](../artifacts/p3-batch-h/install-plan-tests-final.json)，详见[专项报告](../artifacts/p3-batch-h/install-plan-tests-final.json)和[逐基线记录](../artifacts/p3-batch-h/install-plan-matrix.json)。测试仅写报告，不运行package-database，也不产生SQL交付目录或ZIP。

## 远端与工具边界

- [GitHub连接器只读回执](../artifacts/p3-batch-h/remote-ref-preflight.json)确认main仍为584e6a0，与本地一致。Git CLI遇Schannel凭据／OpenSSL证书链错误，没有关闭TLS校验；未执行fetch、提交或推送。
- `package-online.mjs`与`package-database.mjs`输入已统一30／v19／52；前者只收公开配置白名单，后者支持18—29完整基线。它们尚未用于本次最终包。
- `package-card-feedback-delivery.py`及`verify-card-feedback-package.mjs`是P2历史工具，写死0.2.8／21／92参考素材，不能拿来制作或验证P3。其他旧批工具同样须按其版本使用。P3总包组装与独立验证应按审核后的快照执行，不能只替换这些工具的版本字符串便宣称验证通过。
- `verify-cloud-database.mjs`当前仍是P2专用探针，要求v10且会创建测试房间；不用于P3验收，不自动运行。未来如需P3云端探针，须另有隔离环境授权，并更新版本／角色／选择流程；本地包验证不依赖对生产执行探针。

## 批准后仍须实际完成

1. 落实H暂定条款与PC／手机审核结果；若规则调整，先修实现及对应回归，再确定最终版本和候选快照。
2. 重新核对远端与工作树，审查差异及敏感输入。记录源码提交或如实标记工作树快照；源码、数据库、应用必须绑定同一份逐文件manifest和快照哈希。
3. 执行锁文件依赖、生产构建与源码／数据库总包组装；带上18—29升级入口、对应交接说明、来源及验证报告、SHA256SUMS。素材应为128项，但以实际稳定ID清单逐一验证。
4. 独立解压后只用包内源码和依赖完成构建／启动；逐文件核对manifest、全量／增量SQL、重复／故障回滚、ACL与verify.sql、网关health／ready、HTML／JS／CSS和参考图、敏感源码直读拒绝。不能用仓库文件补齐缺项。隔离启动以无效云地址防止调用生产；云库就绪状态由隔离SQL和本地网关测试分别核对，不冒充云端部署。
5. 独立验证通过后再上传GitHub，重新读取远端提交和实际交付文件回执。旧P2包不覆盖，不用旧Release附件代替本次产物。生产迁移／部署与阶段验收各自需要授权及证据。

完整候选证据见[H验证](p3-h-activation-validation.md)，剩余交付门槛见[核对表](p3-release-readiness.md)。目前没有本次交付包，以上步骤不能写成已执行结果。


## P3专用制包工具已准备（尚未制包）

新增`p3-delivery-profile.json`统一52角色候选门槛，`package-p3-delivery.py`提供只读check、经批准后的组装和验包后封包；`verify-p3-package.mjs`专用于独立解压副本，旧P2工具未改。操作草稿见[P3 WorkBuddy说明](p3-workbuddy.md)。

[JS工具最终13项](../artifacts/p3-batch-h/delivery-tools-tests-final.json)通过，核对真实应用／目录数量、跨工具升级文件名、混合版本／提交／快照拒绝、路径和文件篡改检查。[Python工具7项](../artifacts/p3-batch-h/delivery-python-unit.txt)通过，只用合成内存ZIP和临时文本，覆盖解压路径、重复／符号链接、脏工作树未显式快照时拒绝，以及未验包或错误快照拒绝finalize；没有用真实游戏源码组装ZIP。首轮Windows ZIP反斜杠被库先规范化，现同时校验原始与规范化名称，失败记录保留。语法和类型检查通过。

[只读check回执](../artifacts/p3-batch-h/delivery-assembly-preflight.json)确认没有同版本输出目录、buildExecuted=false。独立验证器源码现覆盖预定的包内哈希／迁移／ACL／素材和离线网关检查，**尚未对真实P3包执行**；实际npm ci、构建、验包和上传仍待规则／截图／构建审核，不能把这些单元测试当作包验证通过。

审核门槛在连续目标轮次中未变化；现有可先完成的本地候选、证据和制包脚本已准备到可审核状态。目标等待负责人审核，不重跑无变化测试、不自动构建或上传。生产部署与阶段验收仍是另有授权的后续。
