# H完整本地候选验证

2026-10-23审核更新：负责人已核对当前规则与截图，批准继续构建、独立验包及GitHub上传；[审核记录](p3-approval.md)。以下较早“待审核／等待审核阻塞”是当时检查点，已由本次授权替代。实际制包／上传结果另据真实回执更新，生产执行和P3阶段结项仍未授权。

2026-10-23。当前应用0.3.8-p3.9／web-v0.1.19／schema2／修订30／52角色／76种191实体。依据[候选接线方案](p3-h-activation-candidate.md)继续完成可审核实现；本页取代此前“普通入口仍G43、无030”的当前状态描述，原检查点和失败报告保留。

## 普通入口、迁移与权限

- 普通TS createGame、createStage3Draft与数据库create_game、stage4_create_draft接入同一H目录。035在所有开局摸牌前选择出生；自定义出生不挤占固定地区容量，041继续原出生容量过滤。旧选角完成后仍使用保存规则版本。
- 新增[030候选迁移](../database/migrations/030_p3_batch_h.sql)，000—029不变。生成器只写本地SQL，不连接数据库。存在内容不同的同名v19目录时拒绝安装，不能覆盖私有目录或既有保存规则；完全相同的候选可重复安装。
- 029→030同事务故障回滚、重复安装、旧目录／房间／身份／回执不变，v1—v18保存局、正常H选角与公共ml_room开局均有自动覆盖。health与verify要求v19／30／52以及H和所有前置就绪标志；缺函数或畸形目录拒绝就绪。
- 公共RPC错人、过期／重复、伪造可信字段、私有视图及收费一次有覆盖。特定039冰封／035出生RPC安全测试由隔离库owner先安排有效状态，再通过真实认证RPC操作；它们属于安排场景的权限测试，不能冒充自然房间开局证据。正常ml_room选角／开局另有独立测试。
- 旧v14开局晓虫选择前C状态缺失修复包含在030后继工厂；已保存有效状态不回填，冻结迁移原缺陷及原失败报告保留，见[兼容记录](p3-h-compatibility.md)。

## 共享装备的阵营转换回归

复核N-13时发现：换队后共享装备查询已经改变，但缓存的双移动次数、唐车忽略地形与共享手表历史未刷新。新增两项真实化汶／樟脑丸指令回归，逐条完整比较TS／SQL。测试使用正常同盟工厂、安排合法装备和上一回合未移动条件。

初次报告[41通过／2失败](../artifacts/p3-batch-h/shared-conversion-before-fix.json)中一项布置遗漏上一回合条件；补齐后[两项行为缺陷均复现](../artifacts/p3-batch-h/shared-conversion-reproduced.json)。TS stage4-factions及H SQL后继补丁在阵营改变后刷新全队派生装备状态。中间报告[42通过／1失败](../artifacts/p3-batch-h/shared-conversion-fixed.json)的剩余项误用了去除化猴的约谈；改为去除化汶的樟脑丸后，[最终43／43通过](../artifacts/p3-batch-h/shared-conversion-final.json)。保留全部失败，没有放宽目标限制。

换队立即失去原队共享、获得新队共享；消耗过的基础移动不退；恢复同队后手表重新记录开始格，不能继承中断前坐标。这落实既有N-13，不新增裁定。冻结stage4-engine.sql未改，仅030组合后继函数。

## 自动与整局验证

- 接线初次[20／20](../artifacts/p3-batch-h/activation-initial.json)。其后两份复验各有两项失败，分别是测试选错同创建时刻房间，以及网关／界面仍期待G元数据；[77／77针对性复验](../artifacts/p3-batch-h/activation-targeted-final.json)通过，原失败报告保留。
- [52／52整局](../artifacts/p3-batch-h/activation-integrated-games-final.json)：私有安装器26场与普通030工厂26场，完整191实体、每条指令完整状态比较并自然结束。阵营转换修复前的逐场报告已复制到`artifacts/p3-batch-h/pre-conversion-fix-games/`，避免后续全量重跑混用快照。
- 阵营转换修复前[完整1475／1475](../artifacts/p3-batch-h/full-regression-activation-final.json)通过。新增两项后最终全量结果见本页末尾更新，不把旧1475报告当成新修复证据。
- typecheck、verify:catalog、verify:data、verify:db-data、git diff --check均通过；原图／转录、冻结前驱、旧截图及当前快照审计另记`activation-audit.json`。

## 正常选角与出生的PC／手机证据

生产DraftBoard／OnlineBoard组件使用正常TS选角与新局工厂，52完整池中确定性种子找到035，不注入目录或预造游戏状态。FFA／同盟各在390×844与1200×900运行，逐项实际点击选角、确认出生、打开规则与原始牌面。

| 模式／视口 | 选角 | 出生选择 | 摸牌后 | 规则 | 原图加载 |
|---|---|---|---|---|---|
| FFA手机 | [图](../artifacts/p3-batch-h/activation-ffa-draft-mobile.png) | [图](../artifacts/p3-batch-h/activation-ffa-birth-mobile.png) | [图](../artifacts/p3-batch-h/activation-ffa-started-mobile.png) | [图](../artifacts/p3-batch-h/activation-ffa-rules-mobile.png) | [图](../artifacts/p3-batch-h/activation-ffa-reference-mobile.png) |
| FFA桌面 | [图](../artifacts/p3-batch-h/activation-ffa-draft-desktop.png) | [图](../artifacts/p3-batch-h/activation-ffa-birth-desktop.png) | [图](../artifacts/p3-batch-h/activation-ffa-started-desktop.png) | [图](../artifacts/p3-batch-h/activation-ffa-rules-desktop.png) | [图](../artifacts/p3-batch-h/activation-ffa-reference-desktop.png) |
| 同盟手机 | [图](../artifacts/p3-batch-h/activation-team-draft-mobile.png) | [图](../artifacts/p3-batch-h/activation-team-birth-mobile.png) | [图](../artifacts/p3-batch-h/activation-team-started-mobile.png) | [图](../artifacts/p3-batch-h/activation-team-rules-mobile.png) | [图](../artifacts/p3-batch-h/activation-team-reference-mobile.png) |
| 同盟桌面 | [图](../artifacts/p3-batch-h/activation-team-draft-desktop.png) | [图](../artifacts/p3-batch-h/activation-team-birth-desktop.png) | [图](../artifacts/p3-batch-h/activation-team-started-desktop.png) | [图](../artifacts/p3-batch-h/activation-team-rules-desktop.png) | [图](../artifacts/p3-batch-h/activation-team-reference-desktop.png) |

20张原图通过四张联系表逐画面检查，无整页横向溢出或控件遮挡；规则52角色／暂定说明、035原图加载及出生前零手牌／出生后16手牌有实际断言。[布局和哈希](../artifacts/p3-batch-h/activation-browser-review.json)、[完整操作状态](../artifacts/p3-batch-h/activation-browser-flows.json)、[SQL重放](../artifacts/p3-batch-h/activation-browser-sql-replay.json)保存四个正常初始选角与24次操作的完整状态对照（20个选角／出生意图、4次服务端新局工厂），不是24条客户端意图。

这是本机无头Edge视口模拟与隔离PGlite，未覆盖真实手机、生产网关或真人验收。此前H各技能81图和C—F84图继续保留。复现入口：

```powershell
node tools/review-p3-h-activation.mjs
# 另一终端，在已有Playwright及浏览器路径配置后
node tools/verify-p3-h-activation-browser.mjs
node tools/verify-p3-h-activation-browser-sql.mjs
```

## 待审核与交付

九角色的[N-03—N-13](p3-batch-h-review.md)及N-01／N-02仍待负责人验收。应用／数据库／素材／交付脚本输入已统一30／v19／52，但未执行WorkBuddy构建、独立包验证、Git提交／推送、GitHub上传或生产写入。下一步须按[交付核对表](p3-release-readiness.md)取得规则／截图及构建审核，再构建和独立验证后上传；生产执行与阶段验收另需授权及证据。


## 最终检查点（2026-10-23）

阵营转换修复后[全量1477／1477通过](../artifacts/p3-batch-h/full-regression-activation-share-final.json)，140个测试文件／144套件，无失败或跳过。全量同时重跑私有及普通030工厂各26场，每组2666条指令、191实体完整状态比较并自然结束；此前逐场报告保留于pre-conversion-fix-games目录。

[当前快照审计](../artifacts/p3-batch-h/activation-audit.json)核对37份冻结前驱／来源快照、196份原始跟踪文件、191份来源图片／文档，以及原H81张、C—F84张、新入口20张共185张截图哈希。PC／手机四张联系表已逐画面检查；自己的5189审核服务已停止，浏览器驱动已关闭其无头实例。未终止其他服务。

本轮只读git ls-remote重读失败，报Windows Schannel SEC_E_NO_CREDENTIALS；此前观察到的远端HEAD不冒充本次最新证据。main本地仍584e6a0，既有未提交成果保留，无提交或推送。类型、目录、原始资料、数据库静态数据、脚本语法与差异格式检查均通过。

审计脚本复现：`node tools/verify-p3-h-activation-audit.mjs`。该脚本只核对本地文件、报告和Git元数据，不连接生产、不打交付包。最初审计脚本两次失败分别是素材台账字段名和漏纳入六张050点击截图，均已按现有真实字段／报告修正；没有替换图片或放宽哈希要求。


### 远端只读补核

此前Git CLI的Schannel凭据错误仍真实保留；使用单命令OpenSSL后又遇本机证书链不完整，没有关闭TLS校验。随后通过GitHub连接器GET远端main引用，确认仍为584e6a0，与本地HEAD一致。原始回执见[只读远端记录](../artifacts/p3-batch-h/remote-ref-preflight.json)，这不是本地fetch、提交、推送或上传。


### 审核前的安装输入补验

[交付预检](p3-delivery-preflight.md)新增17项全部通过，使用package-database共享的纯SQL组装函数，经隔离PostgreSQL执行实际单语句文本，覆盖18—29及schema1升级、两种新装、回滚／重复／旧数据保留和输入完整性拒绝。当前未生成交付目录或ZIP。1477完整引擎回归发生在本次仅交付工具抽取之前，新17项为独立专项，不把两份报告相加冒称一次1494项全量运行。类型及脚本语法检查通过。
