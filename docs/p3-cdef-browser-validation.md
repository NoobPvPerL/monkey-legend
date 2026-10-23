# C—F浏览器与截图补齐

2026-10-23。补齐此前因截图工具失败而保留的视觉缺项。本轮使用本地Vite加载实际OnlineBoard和规则核心，通过独立无头Edge／Playwright实际点击；390×844手机视口、1200×900桌面视口各16个场景，共32次流程、84张原始PNG。所有整页scrollWidth等于视口宽度；84图通过18张联系表逐项检查，没有使用绘图替代截图。

受控夹具明确安排手牌、生命、坐标、初始队列与测试骰子，用于复核具体操作，并保留部分原工厂历史日志；起始局面不是自然实战／完整开局证据。响应时按真实选择操作者切换本地视图。真实30秒技能选择、20秒弃牌和原60秒行动预算保持，不为截图延长时钟。没有生产RPC、管理员凭据或公开状态注入。

## 交互与权威对照

- [浏览器尺寸／哈希与结果](../artifacts/p3-batch-f/cdef-browser-review.json)、[完整实际指令轨迹](../artifacts/p3-batch-f/cdef-browser-flows.json)记录32次流程，共56条实际提交指令。
- [隔离SQL重放](../artifacts/p3-batch-f/cdef-browser-sql-replay.json)安装冻结000—029，使用捕获的实际命令与时间逐条dispatch，56／56条完整state一致；不是生产鉴权RPC证据，鉴权／幂等已有各批升级测试记录。
- [界面回归39／39通过](../artifacts/p3-batch-f/cdef-ui-regression-final.json)，覆盖C／D／E／F／G牌面及H界面；类型检查通过。斩杀修复后完整回归1426／1426通过，报告见本页末尾。

## 发现并修复的斩杀按钮缺陷

选中手牌后Stage4Controls为了避免重复牌面表单，向Stage3Controls传selected=null，误使波波鲨鱼斩杀按钮一直禁用。新增hideCardForm仅控制重复表单，保留真实selected给技能；只改客户端Stage3Controls.tsx、Stage4Controls.tsx，不改费用、判定、目标、数据库或旧局。

[修复前操作报告](../artifacts/p3-batch-f/cdef-browser-review-before-execute-fix.json)保留禁用失败。修复后PC／手机均能选手牌、选择2HP目标并发动，实体弃置一次、目标直接淘汰且deathTurns=-1，SQL完整状态重放一致。选牌后鸡犬升天／岩浆等按钮也仍可见。

早期尝试还包括验证脚本变量名、转换确认按钮定位、躲避球测试骰误用1（现行命中4—6）以及猴四初始5HP的期待值错误，相关initial／recheck报告保留；这些失败未当作成功操作，不通过更改已确认规则来迎合测试。旧截图API故障是历史记录，本次补齐不抹掉原记录。

## 84张原图索引

| 场景 | 手机390 | PC1200 |
|---|---|---|
| 羽毛人手长／远程躲避球 | [入口／响应](../artifacts/p3-batch-c/feather-start-mobile.png)、[选牌／目标](../artifacts/p3-batch-c/feather-target-mobile.png)、[结果](../artifacts/p3-batch-c/feather-result-mobile.png) | [入口／响应](../artifacts/p3-batch-c/feather-start-desktop.png)、[选牌／目标](../artifacts/p3-batch-c/feather-target-desktop.png)、[结果](../artifacts/p3-batch-c/feather-result-desktop.png) |
| 羽毛人脚短失败 | [入口／响应](../artifacts/p3-batch-c/feather-fail-start-mobile.png)、[结果](../artifacts/p3-batch-c/feather-fail-result-mobile.png) | [入口／响应](../artifacts/p3-batch-c/feather-fail-start-desktop.png)、[结果](../artifacts/p3-batch-c/feather-fail-result-desktop.png) |
| 原始人食物判定 | [入口／响应](../artifacts/p3-batch-c/primitive-start-mobile.png)、[结果](../artifacts/p3-batch-c/primitive-result-mobile.png) | [入口／响应](../artifacts/p3-batch-c/primitive-start-desktop.png)、[结果](../artifacts/p3-batch-c/primitive-result-desktop.png) |
| 奶龙大帝转换／准 | [入口／响应](../artifacts/p3-batch-d/dragon-start-mobile.png)、[选牌／目标](../artifacts/p3-batch-d/dragon-target-mobile.png)、[结果](../artifacts/p3-batch-d/dragon-result-mobile.png) | [入口／响应](../artifacts/p3-batch-d/dragon-start-desktop.png)、[选牌／目标](../artifacts/p3-batch-d/dragon-target-desktop.png)、[结果](../artifacts/p3-batch-d/dragon-result-desktop.png) |
| 朱重四鸡犬升天 | [入口／响应](../artifacts/p3-batch-d/clan-start-mobile.png)、[结果](../artifacts/p3-batch-d/clan-result-mobile.png) | [入口／响应](../artifacts/p3-batch-d/clan-start-desktop.png)、[结果](../artifacts/p3-batch-d/clan-result-desktop.png) |
| 猴一鼓励／来源弃牌 | [入口／响应](../artifacts/p3-batch-d/encourage-start-mobile.png)、[弃牌窗口](../artifacts/p3-batch-d/encourage-discard-mobile.png)、[结果](../artifacts/p3-batch-d/encourage-result-mobile.png) | [入口／响应](../artifacts/p3-batch-d/encourage-start-desktop.png)、[弃牌窗口](../artifacts/p3-batch-d/encourage-discard-desktop.png)、[结果](../artifacts/p3-batch-d/encourage-result-desktop.png) |
| 猴六毒气／猴十八拒绝／卤蛋格选 | [入口／响应](../artifacts/p3-batch-e/gas-start-mobile.png)、[位移同意](../artifacts/p3-batch-e/gas-consent-mobile.png)、[卤蛋选格](../artifacts/p3-batch-e/gas-egg-mobile.png)、[结果](../artifacts/p3-batch-e/gas-result-mobile.png) | [入口／响应](../artifacts/p3-batch-e/gas-start-desktop.png)、[位移同意](../artifacts/p3-batch-e/gas-consent-desktop.png)、[卤蛋选格](../artifacts/p3-batch-e/gas-egg-desktop.png)、[结果](../artifacts/p3-batch-e/gas-result-desktop.png) |
| 汪羊逃生演习 | [入口／响应](../artifacts/p3-batch-e/escape-start-mobile.png)、[强制方向](../artifacts/p3-batch-e/escape-direction-mobile.png)、[结果](../artifacts/p3-batch-e/escape-result-mobile.png) | [入口／响应](../artifacts/p3-batch-e/escape-start-desktop.png)、[强制方向](../artifacts/p3-batch-e/escape-direction-desktop.png)、[结果](../artifacts/p3-batch-e/escape-result-desktop.png) |
| 汪羊个人结束最高HP者 | [入口／响应](../artifacts/p3-batch-e/highest-start-mobile.png)、[强制方向](../artifacts/p3-batch-e/highest-direction-mobile.png)、[结果](../artifacts/p3-batch-e/highest-result-mobile.png) | [入口／响应](../artifacts/p3-batch-e/highest-start-desktop.png)、[强制方向](../artifacts/p3-batch-e/highest-direction-desktop.png)、[结果](../artifacts/p3-batch-e/highest-result-desktop.png) |
| 波波鲨鱼斩杀 | [入口／响应](../artifacts/p3-batch-f/execute-start-mobile.png)、[选牌／目标](../artifacts/p3-batch-f/execute-target-mobile.png)、[结果](../artifacts/p3-batch-f/execute-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/execute-start-desktop.png)、[选牌／目标](../artifacts/p3-batch-f/execute-target-desktop.png)、[结果](../artifacts/p3-batch-f/execute-result-desktop.png) |
| 朱伟岩岩浆／朱鹏岩坚韧 | [入口／响应](../artifacts/p3-batch-f/tenacity-start-mobile.png)、[坚韧窗口](../artifacts/p3-batch-f/tenacity-tenacity-mobile.png)、[结果](../artifacts/p3-batch-f/tenacity-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/tenacity-start-desktop.png)、[坚韧窗口](../artifacts/p3-batch-f/tenacity-tenacity-desktop.png)、[结果](../artifacts/p3-batch-f/tenacity-result-desktop.png) |
| 猴五无限生命／出牌回血 | [入口／响应](../artifacts/p3-batch-f/monkey5-start-mobile.png)、[结果](../artifacts/p3-batch-f/monkey5-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/monkey5-start-desktop.png)、[结果](../artifacts/p3-batch-f/monkey5-result-desktop.png) |
| 猴四回家／免伤 | [入口／响应](../artifacts/p3-batch-f/home-start-mobile.png)、[结果](../artifacts/p3-batch-f/home-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/home-start-desktop.png)、[结果](../artifacts/p3-batch-f/home-result-desktop.png) |
| 猴十六自虐／逐人弃牌 | [入口／响应](../artifacts/p3-batch-f/self-start-mobile.png)、[弃牌窗口](../artifacts/p3-batch-f/self-discard-mobile.png)、[结果](../artifacts/p3-batch-f/self-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/self-start-desktop.png)、[弃牌窗口](../artifacts/p3-batch-f/self-discard-desktop.png)、[结果](../artifacts/p3-batch-f/self-result-desktop.png) |
| 水母毒蜇／真伤 | [入口／响应](../artifacts/p3-batch-f/sting-start-mobile.png)、[结果](../artifacts/p3-batch-f/sting-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/sting-start-desktop.png)、[结果](../artifacts/p3-batch-f/sting-result-desktop.png) |
| 痞帅bccb／和气 | [入口／响应](../artifacts/p3-batch-f/bccb-start-mobile.png)、[结果](../artifacts/p3-batch-f/bccb-result-mobile.png) | [入口／响应](../artifacts/p3-batch-f/bccb-start-desktop.png)、[结果](../artifacts/p3-batch-f/bccb-result-desktop.png) |

C14张／D16张／E20张／F34张。[联系表索引](../artifacts/p3-batch-f/cdef-contact-sheets.json)仅用于内部逐图检查，原始PNG保持不变。

E最高HP流程截图在强制移动之后进入卤蛋响应，不冒称已完成后续整个个人回合；毒蜇／bccb结果恢复原基础移动剩余步数，也不是整局结束。其完整连锁与自然结束另有各批整局测试。

本轮证明本地视口中的真实组件可操作及对应SQL状态，不替代手机实机、跨设备云端或真人验收。当前正式候选仍G43／v18／29，H私有52；未生成030、未构建／上传／生产写入。[交付前核对表](p3-release-readiness.md)列出完整目标的剩余工作。

## 仓库内复验入口

夹具位于`tests/browser/p3-cdef-review.tsx`，没有新增生产页面入口；`tools/review-p3-cdef.mjs`仅监听127.0.0.1，默认5188。浏览器验证器只允许本机HTTP地址，使用调用方已有Playwright和浏览器，不自动下载依赖。复验会刷新原始PNG及浏览器报告，随后必须重新重放SQL、核对哈希。

本机在仓库根目录的第一个PowerShell终端：

```powershell
node tools/review-p3-cdef.mjs
```

第二个终端使用本机已验证的捆绑运行时：

```powershell
$env:PLAYWRIGHT_MODULE='file:///C:/Users/20753/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:P3_REVIEW_BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node tools/verify-p3-cdef-browser.mjs
node tools/verify-p3-cdef-browser-sql.mjs
```

异机需替换为该机已有模块／浏览器路径；若Playwright可由项目解析且已有其Chromium，可不设这两个变量。可用P3_REVIEW_PORT与P3_REVIEW_URL选择其他本机端口。完成后在第一个终端Ctrl+C停止服务。正式环境不启动此审核服务，不把它当网关或生产鉴权。

斩杀修复后[全量1426／1426通过](../artifacts/p3-batch-f/full-regression-cdef-ui-final.json)，包含旧版本、H私有与初始化修复回归；typecheck、verify:catalog、verify:data、verify:db-data及git diff --check通过。该全量不能替代上述实际浏览器操作，因此两类证据分别保存。

最终[冻结／素材／截图及文档审计](../artifacts/p3-batch-f/cdef-final-audit.json)核对35份前置冻结参考、029哈希、196个原始已跟踪文件、191份来源和此前H81张截图；本轮84原图哈希及18张最终联系表像素对应保持。审核服务已停止，独立浏览器已关闭。
