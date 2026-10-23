# P3 新agent交接

2026-10-23审核更新：负责人已核对当前规则与截图，批准继续构建、独立验包及GitHub上传；[审核记录](p3-approval.md)。以下较早“待审核／等待审核阻塞”是当时检查点，已由本次授权替代。实际制包／上传结果另据真实回执更新，生产执行和P3阶段结项仍未授权。

更新：2026-10-23（Asia/Hong_Kong）。

当前P3本地候选：**0.3.8-p3.9／web-v0.1.19／schema2／修订30，52角色、76种191实体**。A—H普通新局／选角及数据库权威链路已接通本地候选，030已生成并在隔离库验证，000—029冻结。H九角色暂定N-03—N-13与G的N-01／N-02仍待规则验收；008大帝汶另批。C—F84张及H技能81张截图保留，新增正常H选角／出生／开局20张PC／手机视口截图。旧局和旧选角保持保存版本；旧v14初始化修复已含030后继工厂，不改冻结迁移或已有状态。

当前只完成本地候选及验证；尚未获得本次最终规则／截图／构建审核，未构建WorkBuddy交付包、提交／上传GitHub或写入生产。审核后按构建、独立包验证、上传顺序交付；云端执行与P3阶段验收另需授权及证据。

下一步先读[H完整候选验证](p3-h-activation-validation.md)、[v19规则](web-rules-v0.1.19.md)、[H验收入口](p3-batch-h-review.md)和[交付核对表](p3-release-readiness.md)。全部P3仍未提交，main为584e6a0；本次Git CLI遇Schannel凭据／OpenSSL证书链错误，未关闭TLS验证；随后已通过GitHub连接器只读读取远端main引用，确认仍为相同584e6a0（未执行fetch／push）。保留所有未提交改动，禁止reset覆盖。

负责人睡眠期间授权不提问、未知项先推断并记文档。该授权支持当前完整本地候选；逐条规则采纳与构建审核仍待负责人确认。[旧v14初始化修复](p3-h-compatibility.md)、[C—F84图](p3-cdef-browser-validation.md)和[H历次验证](p3-batch-h-validation.md)保留失败与修复证据。H九名均已完整实现，050换队共享缓存缺陷已双端修复，不能再按旧私有48／49／51检查点继续重复开发。

## 交付工具及当前审核门槛

P3专用制包／独立验证脚本现已准备，JS13／Python7专项和只读check通过；实际包未生成、未验证、未上传。见[交付预检](p3-delivery-preflight.md)与[WorkBuddy草稿](p3-workbuddy.md)。规则／截图及构建审核尚无新回执，目标等待负责人审核；不是生产故障或本地实现失败，不继续自动重复测试。恢复后先读取审核内容，必要时调整规则，再执行构建、独立验包、上传顺序。

## 任务起点

仓库：`D:\Users\20753\Desktop\应猴传说\monkey-legend`，远端 `https://github.com/NoobPvPerL/monkey-legend.git`，分支main。
收尾前文档基线 `b67a7521bda74bf91ab7096d51558eb1fb397fb8`，运行代码提交 `fd893dd4f9e2c82ded21e696dd66042724243b28`；结项文档提交在其后，接手时以实际git log与origin/main为准，不reset回旧提交。

应用 **0.2.8-p2.9**，规则 **web-v0.1.10**，schema2，engineRevision21；16角色、76种191张基础牌实体。版本从package.json、packages/online/src/version.ts和运行目录核对。既有线上地址 `https://monkey-legend-p2.app.workbuddy.host/`；负责人已确认上线和真人验收。收尾时工具DNS失败，未独立取得最终公网版本／SQL原始回执，不将此解释为未上线。

## 必须先完整阅读

1. docs/AGENTS.md、docs/plan.md、docs/p2-closeout.md、docs/p3-backlog.md，以及p3-batch-ab-decisions.md、p3-batch-ab-validation.md、p3-batch-c-decisions.md、p3-batch-c-validation.md、web-rules-v0.1.11—17.md、p3-batch-e-validation.md、p3-batch-d-decisions.md、p3-batch-d-validation.md、p3-batch-e-decisions.md、p3-batch-f-plan.md、p3-batch-f-decisions.md、p3-batch-f-validation.md。
2. docs/web-rules-v0.1.10.md及其引用链，特别是v0.1.7、v0.1.8、v0.1.9。
3. docs/p2-stage3-decisions.md、docs/p2-stage4-decisions.md、docs/p2-stage4-autonomous-decisions.md：已批准的16角色与全基础牌裁定。
4. docs/p2-card-feedback-validation.md、docs/p2-card-feedback-delivery.md、docs/p2-card-feedback-workbuddy.md。
5. docs/cards/README.md、docs/cards/角色牌.md及对应原始素材；核对其他牌时再读其分类。原始转录保留来源，不被最新网页裁定反写。
6. 针对应豪，读docs/p2-hand-feedback-validation.md与artifacts/p2-hand-feedback/yinghao-diagnostic.json。

旧P2收尾提示词、历史计划和各批“未部署／待审核／未结项”是当时快照，不能用来推翻本次正式结项。当前阶段状态以plan和p2-closeout为准；详细技术结果仍以对应版本的证据为准。

## 已完成内容：不要重做

四人FFA／2v2、数据库权威好友房、身份恢复与私密视图、聊天观战、计时／幂等／断线恢复、经典图、固定地区随机空格出生、三选一及阵营池；完整76种基础牌、装备坐骑、反制链、普通复活、地形控制、插队与阵营机制。

PC手牌鼠标拖动和滚轮横向浏览、完整牌效弹窗、地图完整、手机主页面单屏、角色技能直显、提示音默认启用及普通交互解锁已交付。主界面不能为方便新增控件重新变成长页；弹窗、手牌横向浏览依原交互保留。

原plan中的P3部分已提前在P2落地。P3现在应以未启用角色／尚缺普通内容及遗留问题为入口；P2起点53条角色转录减16为37条候选差距，逐ID盘点后A／B及C各批准2条，当前本地候选52角色、剩余008未加入（H待正式验收、008单独设计），不能把算术差视为全量上线批准。神牌与课程保留P4；人数扩展和主题色另批。

## 负责人已确认的关键规则

- 角色技能选择30秒，包括easy、跑者、西帝汶；普通卡牌响应、水域弃牌、装备窗口不随之延长；选角30秒、超限弃牌20秒。
- 来玩和樱花舞对自己不生效；普通移动不能进入或穿过有人格。特殊位移须维护占格与角色免疫。
- 帝汶水生包括lemon；整段直线越水耗1移动步数，不额外扣AP、不弃牌，不停水中；延长线第一个陆地被占／封闭／越界即禁止。传送入水沿位移方向找岸；无方向地形变水的合法岸分配与失败规则见v0.1.8，不另猜。
- 北帝汶锁定技取代旧按出牌者阵营免疫：同牌选北帝汶就不能选其他当前非机械猴子；可同时选合法机械猴子。保留其余敌我、距离、梅梅涛及免疫限制。
- 搏击操Ⅰ／Ⅱ／Ⅲ基础费用3／4／5AP；物理牌入弃时给本局最初获得者回复1AP，转手／洗回／重抽不改归属，无最初获得者不回、阵亡不回。高等级免费响应只抵消父牌对自己的扣AP及不足转扣血，不反击／不影响其他目标；响应牌入弃仍触发原始获得者回复。
- 教学楼仅禁躲避球，秀松苑仅禁猴子游戏；原应豪主动使用及唐车地点例外保持。
- JJ懒得喷暴露仅额外包含攻击牌，从发动起到自己下次个人开始；其他人给自己回血／摸牌不附带JJ。主动肘击与既有转换攻击边界见v10。
- 旧局和已开始选角读取保存规则，不追改；不能因为更新代码把旧局现象误报为新修复失效。

## 已知边界与遗留项

先看p3-backlog。P2最终包应豪猴子游戏免疫未修，P3 v11起已本地实现、尚未发包；冲撞失败的原场景忘记，既有9场对照未复现，不声称修好或擅自取消免疫。卫汶找你／紫檀木原现场缺失，但当前入口及完整合法RPC流程已验证。3—6人／3v3及#812A32主题未实施。

P2 Issue #9、#10、#13、#14按本次授权结项，实际关闭回执见artifacts/p2-closeout/github-issues.json；未实施项保留本地backlog。独立#2／PR #3与P1 #8不因P2结项而关闭。

## 工程导航与兼容边界

| 路径 | 职责 |
|---|---|
| packages/game-data/src/ | 白名单、版本目录、角色阵营、地图、来源数据与冻结基线 |
| packages/game-core/src/ | TS确定性规则；stage3-roles、stage4-*、playtest、exercise等版本行为 |
| database/engine/、database/migrations/ | 数据库权威引擎及迁移；已发布P2最新021；P3候选追加022—026 |
| tools/generate-*.mjs | 引擎／目录／迁移生成；先理解输入、冻结函数与版本分支再修改 |
| packages/online/src/ | 严格协议与版本／就绪门槛 |
| apps/server/src/ | cloud、gateway、index；客户端只提交意图，不信任actor／费用／随机／完整state |
| apps/client/src/ | OnlineBoard、ActionPanel、Stage3/4Controls、地图、手牌、弹窗、声音与CSS |
| tests/p2/ | TS／SQL对照、房间／权限／迁移／整局／UI专项 |
| artifacts/p2-card-feedback/ | 最终回归、截图、公共RPC与独立包验证证据 |

000—021迁移、历史规则目录与原始素材冻结。新增行为需新版本及追加迁移，不覆盖021，不沿用旧应豪草案“v10／021”（已被最终卡牌反馈使用）。生成器输出不能手工修一份造成TS／SQL或生成检查不一致。

身份、roomId／matchId、凭据、回执、旧局／旧选角、隐私、重试与原窗口截止必须保留。新应用与旧库不匹配时应拒绝就绪，不能只看schemaVersion=2。

## 接手第一轮应提交什么

先只读核实git status／log／remote、最新Issue与当前版本；不要覆盖用户改动，不回滚旧提交。随后输出：

1. 按优先级的P3收尾／扩展清单，区分缺陷、规则变更、体验和新内容。
2. 53角色与16白名单的逐ID差距、来源与未决参数；建议首批角色及完整技能设计，不上占位角色。
3. 应豪优先核对结果与第一批方案，列文件、TS／SQL及UI路线、版本／迁移编号、兼容影响。
4. 验收矩阵：新旧局、FFA／2v2、目标／免疫／水域／装备／超时链、PC与手机截图、独立包与云端验收边界。

**先给上述方案，等负责人批准当批范围再编码。** 当前“给P3交接”不批准新agent直接修改规则、全量补37角色、部署或生产写入。有不清楚的规则按AGENTS向负责人明确，不能用常见玩法填默认。

## 开发与验证

在仓库使用Node22.12+的22.x或24.x：

```powershell
git status --short --branch
git log -5 --oneline
git remote -v
npm ci
npm test -- --maxWorkers=2
npm run typecheck
npm run verify:data
npm run verify:db-data
npm run verify:catalog
npm run build
```

不要为只读接手自动重装依赖／重跑所有检查；上面是实施后的可复用验证入口。保留现有断言，按修改添加必要的行为及组合测试。本地PGlite不等于生产并发验证。verify-cloud-*可能创建真实房间，未获授权禁止用于生产。

`npm run dev`只有Vite，完整联机需网关及公开SDK配置。独立测试使用隔离PGlite／隔离云，不能将管理员状态注入工具放进公开RPC。

## 交付顺序与最终包

先实现及回归、更新docs并保留PC／手机审核证据；历史曾暂停WorkBuddy构建与GitHub上传；最新负责人目标为P3完成后上传GitHub并构建WorkBuddy包，仍按完整验证、截图审核、构建、独立解压／迁移／启动验证顺序推进。云端部署与SQL写入只在对应授权后交WorkBuddy执行；不要改变已确认规则或自动关闭新Issue。

最终P2总包：
`D:\Users\20753\Desktop\应猴传说\monkey-legend\releases\monkey-legend-0.2.8-p2.9-card-feedback-workbuddy-all.zip`

SHA-256：`5d9431391a70dd59bfe744c1e48debb8adc609e6746985c213f63c579668d0a4`。
源码快照：`359014c9bb89215a69f5e0f6620203d44587b7cadf21bfd0544d4023c26b68ca`。
本机releases受Git忽略，新agent异机未必有包；不要谎称GitHub旧Release附件就是此包。不要因纯文档结项重新打包或修改既有ZIP哈希。

P3完成标准：当批批准的完整技能与连锁行为一致、迁移兼容与旧局保留、PC／手机可操作、包独立验证通过、相应云端／真人证据记录并经负责人验收。阶段结项必须有新的明确确认。

## 历史检查点（以下不替代页首当前状态）

2026-10-22 H041检查点：私有51角色，041组合与整局72项通过，22场2284条对照，PC／手机证据已补；正常仍G43，H剩050，旧v14初始化缺陷未修，详见[H验证](p3-batch-h-validation.md)。

2026-10-22 H050检查点：H九条候选均已私有接入，v19共52角色，正常仍G43／v18／修订29。中饭专项71项通过；26场191实体对局共2666条完整TS／SQL对照，新增16张PC／手机视口截图及实际点击记录。暂定N-03—N-13待负责人验收；旧v14初始化缺陷仍保留，不因专项通过宣称已修。未生成030、未打包／上传／生产写入，详见[H验证](p3-batch-h-validation.md)。

最新兼容补充：旧v14开局初始化缺陷已有TS／私有后继SQL修复，确定性29项通过；冻结版本与生产未变。H050全量1397项通过，修复后全量1426项通过。规则和截图集中见[H验收入口](p3-batch-h-review.md)。

2026-10-23：C—F截图缺项已补84张，32次实际浏览器流程／56条SQL完整状态重放通过；发现并修复选牌后斩杀始终禁用的客户端传参缺陷。详见[浏览器记录](p3-cdef-browser-validation.md)及[交付前核对表](p3-release-readiness.md)。旧冻结迁移、正常G43和私有H52边界保持，未打包／上传／生产写入。
