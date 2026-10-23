# P3 H实现与历次验证

2026-10-23当前状态：普通H候选已接通，0.3.8-p3.9／v19／修订30／52角色，030已本地生成并隔离验证；N-01—N-13仍待验收，未打包／上传／生产写入。详见[完整候选验证](p3-h-activation-validation.md)。

## 历史私有检查点

2026-10-21，Asia/Hong_Kong。依据负责人“开始执行H”及[睡眠期间暂定推进授权](p3-overnight-assumptions.md)。**本页记录001／011／015／030／039私有实现，不代表H九条完成或正式入池。** 完整后续路线见[H暂定方案](p3-batch-h-provisional-plan.md)。

## 版本及证据边界

- 正常本地候选仍0.3.7-p3.8／web-v0.1.18／schema2／engineRevision29，43角色、76种191实体。普通新局／选角和健康端点仍G。
- 私有web-v0.1.19开发目录48角色，只新增001 6+6、011二幻神、015猴三、030南帝汶、039忘尘雪；`createHDevelopmentGame`及隔离SQL `ml_private.p3h_create_development`专供本地验证。普通新局和选角明确拒绝v19，客户端没有开发开关。
- H来源文件保存九条原文，运行模块只启用上述五条。034／035／041／050尚未实现；008另批，神牌／课程P4，人数／主题色另批。
- 没有030迁移；000—029及既有来源冻结。未执行WorkBuddy构建、交付打包、Git提交／推送、GitHub上传、生产SQL／RPC或云端部署。本地PostgreSQL证据来自PGlite，截图来自localhost组件审核页，不是云端／真人／手机实机验收。
- 本次main仍584e6a0f442c67264cc0f98f3562bab7361fc4fe，保留原有A—G未提交内容。`git fetch origin main`因github.com DNS解析失败，不能声称远端已核到最新。

## 首组行为及涉及文件

| 范围 | 当前实现 | 主要文件 |
|---|---|---|
| 来源／目录 | 原HP／出生；001与039中立，015机械猴子；只建私有v19，正常G入口不变 | `packages/game-data/src/p3-h-source.json`、`p3-h-characters.ts`、`versions.ts`、`legacy.ts`、`character-affiliation.ts` |
| 001组织部部长 | 自己个人开始，其他在图存活者依行动顺序正交靠近1格；本人选30秒方向，超时首个合法格；无路原地。占格、梅梅涛、单牌保护、装备、水域、猴十八同意及既有移动响应照常 | `packages/game-core/src/p3-h-movement.ts`、`index.ts`、`stage3-engine.ts` |
| 001“6” | 仅有角色归属的最终d6=6，可免费摸2／放弃30秒；人机→狂叫或数学天才→最终6，覆盖的原骰不重复触发。抽牌／洗牌无角色归属随机不触发 | `packages/game-core/src/p3-h-dice.ts`、`p3-g-dice.ts` |
| 015拖动进度条 | 从非最低HP进入并列最低，当前完整效果链和正常个人结束后插入个人回合，之后恢复原正常游标，不新增整轮；初始化／已最低／自己行动期间不跳转，待插入回合死亡则取消 | `packages/game-core/src/p3-h-state.ts`、`p3-h-turns.ts`、`p3-f.ts`、`index.ts` |
| 015狂叫 | 免费重掷自己的骰，每条原始行动根链一次，30秒可放弃；同段移动起步与后续步进共用次数。重掷本身不递归；最终6仍可给001摸牌选择 | `packages/game-core/src/p3-h-dice.ts`、`p3-g-dice.ts` |
| 039冰封之力 | 自由行动2AP，其他在图存活者含队友；主动免疫照常。下次个人回合开始资源／正常摸牌／强制结算与个人结束照常，只跳自由行动；跨自己两次个人开始后可再用，不叠加未消费标记 | `packages/game-core/src/p3-h-turns.ts`、`index.ts`、`stage3-engine.ts` |
| 数据库权威 | 私有安装器从冻结000—029提取后继函数，再接H助手；真dispatch／pump／choose／回合／伤害／公开视图／action投影均参与对照，不用预造客户端结果。私有函数不授予anon／authenticated调用 | `database/engine/p3-h.sql`、`tools/p3-h-runtime-patch.mjs`、`p3-h-runtime-patch.d.mts` |
| 协议／界面 | 只发目标／选择意图，拒绝费用、骰值、actor和state等伪造字段；技能、方向和免费响应直显，忙碌／时限正常禁用。公开视图只保留冰封标记／冷却，不泄露骰子回放／额外回合队列 | `packages/online/src/protocol.ts`、`Stage3Controls.tsx`、`OnlineBoard.tsx`、`SpectatorBoard.tsx`、`Stage3Rules.tsx`、`BatchHRules.tsx`、`Stage3Status.tsx` |

本组角色选择均30秒，选择／技能不续60秒；骰子暂停后保存原预算并续接。首次实际对照修正了吸引选择路由漏接、v19旧交互开关遗漏、SQL逐击最低HP观察位置和跨选择者超时续接；PC／手机审核另修正吸引“可传送”误称、日志内部编号、继承G角色数及H不存在的完整规则链接。猴三技能沿原名“拖动进度条”。

## 自动验证

实现与测试文件：`tests/p2/p3-h-fixture.ts`、`p3-h-runtime.test.ts`、`p3-h-ui.test.ts`、`p3-h-full-game.test.ts`。

- 首组现有26条TS／SQL运行对照、6条UI／协议检查、4场完整对局。早期24条运行对照连同G界面继承检查共43项通过，见[专项报告](../artifacts/p3-batch-h/final-first-tranche.json)；后补两项“插队与猴三额外回合”组合后，26运行＋6UI共32项通过，见[组合报告](../artifacts/p3-batch-h/final-combinations-and-ui.json)。
- 首轮全量1097项中1090通过，7项因沙箱禁止127.0.0.1套接字失败；[原报告](../artifacts/p3-batch-h/full-regression-first-tranche.json)保留失败证据。移到允许回环连接的环境后，三个文件9项全部通过，见[回环复跑](../artifacts/p3-batch-h/loopback-regression.json)。这不是用超时证明成功。
- 前次全量1100项，1099通过、1失败，见[完整报告](../artifacts/p3-batch-h/full-regression-complete-first-tranche.json)。失败为旧P2-P01跨进程持久化用例的自然终局断言，单独[复跑通过](../artifacts/p3-batch-h/legacy-persistence-recheck.json)，原因尚未证明，不能称全量全绿。前一全量1098项中的旧D升级选角失败亦保留于[前报告](../artifacts/p3-batch-h/full-regression-final.json)，加错误诊断后连续六次隔离复跑通过，但未宣称已修复。H在上述全量均通过。类型、完整目录生成校验及冻结／原始资料审计见[审计](../artifacts/p3-batch-h/first-tranche-audit.json)。
- 覆盖18个旧保存版本、安装幂等、H普通工厂／选角关闭、权限、非法目标与重复请求原子性、猴十八拒绝、梅梅涛／占格、改骰优先级、JSON断点、最终6重洗191实体无复制、超时不续预算、冰封开始／结束摸牌和山洞／隐身、猴三最低边沿／自己行动不跳／冰封额外回合。

| 完整局 | 指令 | 整轮 | 证据 |
|---|---:|---:|---|
| FFA seed42 | 190 | 14 | [逐指令摘要](../artifacts/p3-batch-h/private-full-game-ffa-42.json) |
| FFA seed917 | 95 | 5 | [逐指令摘要](../artifacts/p3-batch-h/private-full-game-ffa-917.json) |
| 2v2 seed42 | 107 | 5 | [逐指令摘要](../artifacts/p3-batch-h/private-full-game-team-42.json) |
| 2v2 seed917 | 86 | 3 | [逐指令摘要](../artifacts/p3-batch-h/private-full-game-team-917.json) |

合计478条，每条命令比较完整TS／SQL状态，验证191实体守恒、队列／结算清空并自然结束。摘要记录实际选择／技能次数，不按最终保留日志中的内部编号估算；不据此推导真人局长。

## PC／手机组件截图

使用实际OnlineBoard、Stage3Controls、公开视图及意图dispatch。审核页只绑定127.0.0.1，未连接房间数据库；为确定性截图，意图时刻按固定单调时钟推进，浏览器倒计时仅展示，不冒称真实网络计时测试。真实超时由上列TS／SQL用例验证。

| 场景 | PC | 手机390 |
|---|---|---|
| 冰封目标及按钮 | [PC](../artifacts/p3-batch-h/freeze-desktop.png) | [选择前](../artifacts/p3-batch-h/freeze-mobile-before.png)、[扣费12→10及冷却](../artifacts/p3-batch-h/freeze-mobile-after.png)、[目标跳过自由行动](../artifacts/p3-batch-h/freeze-mobile-skipped.png) |
| 吸引方向 | [PC](../artifacts/p3-batch-h/attract-desktop.png) | [方向](../artifacts/p3-batch-h/attract-mobile.png)、[选格后目标位移](../artifacts/p3-batch-h/attract-mobile-chosen.png) |
| 狂叫及最终6 | [狂叫](../artifacts/p3-batch-h/reroll-desktop.png)、[最终6](../artifacts/p3-batch-h/six-desktop.png) | [狂叫](../artifacts/p3-batch-h/reroll-mobile.png)、[最终6](../artifacts/p3-batch-h/six-mobile.png)、[摸牌0→2、牌堆191→189](../artifacts/p3-batch-h/six-mobile-drawn.png) |
| 暂定规则说明 | [PC](../artifacts/p3-batch-h/rules-desktop.png) | [手机](../artifacts/p3-batch-h/rules-mobile.png) |

[320窄屏](../artifacts/p3-batch-h/freeze-narrow-320.png)与[844横屏](../artifacts/p3-batch-h/freeze-landscape.png)补做布局检查，文档宽度等于视口宽度；控件直显，无横向整页溢出。已更换未及时捕获更新的旧截图帧，并核对保存图中AP10、跳过提示、r2c3落点及手牌2／牌堆189；部分静态截图中的选择已到期禁用，不把该帧当作有效点击证据。具体尺寸与截图哈希见[浏览器证据](../artifacts/p3-batch-h/browser-review.json)。C／D／E／F旧角色截图缺项仍保留。

## 011完整接入增量

011在私有v19实现“又开始叫了”及“画圆”；[接入矩阵](p3-h-011-integration-matrix.md)记录覆盖与限制。费用／响应／改骰和晓虫自动截流均受动态封禁；普通牌、锁定／被动及装备技能保留。已提交转换／双牌第二份、既有状态与黄虫合法槽位按[N-07](p3-overnight-assumptions.md)保留。画圆采用N-08，包含自己、队友和新进入者，固定区域，逐位移根链付费；30秒拒绝默认不续原60秒预算。

主要增量文件：`p3-h-active.ts`、`p3-h-circle.ts`、`p3-h-state.ts`、`index.ts`、`stage3-*`与G／F／E接入点；SQL为`p3-h-active.sql`、`p3-h-circle.sql`及`tools/p3-h-*-patch.mjs`。私有安装器按完整函数签名保留SQL重载，仍撤销公开执行权限；000—029冻结，无030迁移。客户端只发circle／choose意图，范围、费用和许可均由引擎计算。

- 011新增38项TS／SQL指令及组合检查：十种伪造主动指令原子拒绝、同盟／离区、两类转换、北帝汶费用、黄虫单份新装备与已提交第二份、三类反制／食物夺取、四类改骰、晓虫收益、睡觉、画圆公开视图／私有许可、JSON续接、拒绝／超时／无AP、交换、狗头军师、猴十八同意、水母干枯、冲撞、肘击和离场。见[接入报告](../artifacts/p3-batch-h/011-integration-final.json)：99项中98通过，剩余是新增装备UI用例缺少费用投影的测试设置，修正后[装备UI5项通过](../artifacts/p3-batch-h/011-equipment-ui-recheck.json)。最后界面改动后[13项通过](../artifacts/p3-batch-h/011-final-ui.json)，类型检查通过。
- 旧G黄虫装备UI原先仅认v18，H版现依据权威activeBlocker选择单份或双装备；手机旧样式隐藏了封禁说明，已保留该说明直显，并把JJ禁用文案改为“当前受封”。这两项由实际浏览器核对。
- 首轮完整回归129文件／133套件1159项，1158通过、1失败，见[原报告](../artifacts/p3-batch-h/full-regression-with-011.json)。唯一失败是旧P2-I02完整安装超过15秒，随后保持原期限[隔离3项通过](../artifacts/p3-batch-h/011-legacy-install-recheck.json)。随后保持原15秒期限、使用单测试进程完成[全量129文件／133套件1159项全部通过](../artifacts/p3-batch-h/full-regression-011-serial.json)；不据此宣称并发超时根因已修复。此前D升级／P2持久化偶发失败仍留档，原因未宣称修复。
- 六场191实体完整对局逐指令TS／SQL一致，共673条：前四场478条，新增[FFA seed1201／81条](../artifacts/p3-batch-h/private-full-game-ffa-1201.json)及[2v2 seed1201／114条](../artifacts/p3-batch-h/private-full-game-team-1201.json)，使用011／015／039／021；包含7次画圆及两次越界选择。类型检查、完整目录生成校验通过，未连接生产数据库。

| 011场景 | 截图 |
|---|---|
| 画圆已发动、固定范围、按钮次数 | [PC](../artifacts/p3-batch-h/circle-desktop.png)、[手机390](../artifacts/p3-batch-h/circle-mobile.png) |
| 30秒付费／拒绝；点击后AP12→11、r2c4→r1c4、余2步 | [选择](../artifacts/p3-batch-h/circle-pay-mobile.png)、[支付后](../artifacts/p3-batch-h/circle-paid-mobile.png) |
| 320窄屏与844横屏 | [窄屏](../artifacts/p3-batch-h/circle-pay-narrow-320.png)、[横屏](../artifacts/p3-batch-h/circle-pay-landscape.png) |
| 封禁原因和禁用按钮直显 | [PC](../artifacts/p3-batch-h/silence-desktop.png)、[手机](../artifacts/p3-batch-h/silence-mobile.png)、[320](../artifacts/p3-batch-h/silence-narrow-320.png) |

[011审计](../artifacts/p3-batch-h/011-audit.json)核对冻结来源、196份原始跟踪文件、191份素材／转录和文档链接；[浏览器尺寸与哈希](../artifacts/p3-batch-h/011-browser-review.json)保存9张新图及此前16张图哈希复核。9张均已打开核对。390／320／844的文档宽度等于视口；320的封禁文字换两行，操作区仍在740高视口内，付费与拒绝按钮无重叠。截图为本地实际组件，非手机实机或线上验收。审核页初次配置重复请求ID／step字段错误已纠正，只发生在忽略目录的截图布景，不修改引擎来绕过错误；已停止本地服务、关闭临时页并恢复视口。

## 待验收推断与后续

N-03—N-09均是负责人睡眠期间授权的暂定解释，醒后可修改。030已接入，下一角色034，随后035／041／050；008单独设计。H完整实现、组合矩阵及审核完成前，保持私有目录，不生成发布迁移、不加入正常选角，不构建／上传／生产执行。

## 030完整接入增量

030南帝汶采用[N-09](p3-overnight-assumptions.md)，已接入私有v19／48角色；原同步方向按用户确认，其余次数／等量／期限／镜像属性暂定。[接入矩阵](p3-h-030-integration-matrix.md)列具体文件和验证边界。双方选牌前不移出手牌，强制对方30秒等量选牌，超时按ID；公开视图不含发起者所选实体。镜像任务加哨兵包住完整响应链，JSON续接不递归、不吞原响应，死亡清理和结束胜负等待镜像结清。

- [基础19项](../artifacts/p3-batch-h/030-foundation-initial.json)；[真实接入15项](../artifacts/p3-batch-h/030-integration-recheck4.json)；扩展组合24项见[报告](../artifacts/p3-batch-h/030-combinations-initial.json)；最新[49项通过](../artifacts/p3-batch-h/030-integrated-games-initial.json)含29项实际指令／组合、10UI、10自然整局。类型检查和完整目录生成校验通过。
- 中间失败原报告保留：initial／wire／ui-runtime受SQL安装接入锚点阻挡，不能算实际运行通过；recheck1遗漏TS技能入口，recheck2遗漏TS受迫选择路由及非法-1玩家视图测试，recheck3三处布景误把水域当办公室／目标HP假定4，均逐项修正后通过。没有修改旧用例断言掩盖问题。
- [首轮完整回归](../artifacts/p3-batch-h/full-regression-030-serial.json)1206／1213，7项本机服务／网关遇沙箱EACCES；允许本机网络后[完整回归](../artifacts/p3-batch-h/full-regression-030-local-network.json)1212／1213，仅D旧升级用例失败。不能把生成报告当通过，也不声称全量全绿。
- 唯一剩余失败已在只安装000—026的隔离DB确定复现：[诊断](../artifacts/p3-batch-h/030-legacy-diagnostic.json)。保存v14含晓虫的选角结束后，开局摸牌抢牌／溢出选择先于个人开始，`stage3.c`缺失，报C状态无效。四种首位均可复现；观察中间态的validate绕过只在一次性诊断DB，未进代码／迁移。之前“偶发D失败原因未明”现在有具体复现，仍未修，冻结迁移不回写。

| 新整局 | 指令／整轮 | 技能证据 |
|---|---|---|
| [FFA1202](../artifacts/p3-batch-h/private-full-game-ffa-1202.json) | 172／15 | 南南合作5、马懿6、数学5 |
| [同盟1202](../artifacts/p3-batch-h/private-full-game-team-1202.json) | 136／9 | 南南合作9、数学6 |
| [FFA1203](../artifacts/p3-batch-h/private-full-game-ffa-1203.json) | 150／9 | 南南合作2、画圆8、冰封3、狂叫5 |
| [同盟1203](../artifacts/p3-batch-h/private-full-game-team-1203.json) | 82／4 | 南南合作2、画圆4、冰封2、狂叫1 |

新增540条，十场合计1213条；每条比较完整TS／SQL，191实体守恒，自然结束，不据此推导真人体验。

| 030界面 | 实际组件截图 |
|---|---|
| 发起者选目标及2张牌 | [PC](../artifacts/p3-batch-h/cooperate-source-desktop.png)、[390手机](../artifacts/p3-batch-h/cooperate-source-mobile.png) |
| 受迫对象自己的选牌／确认 | [PC27秒、已选2/2](../artifacts/p3-batch-h/cooperate-recipient-desktop.png)、[手机30秒](../artifacts/p3-batch-h/cooperate-recipient-mobile.png) |
| 手机完成交换及联系提示／本回合已使用 | [完成](../artifacts/p3-batch-h/cooperate-complete-mobile.png) |
| 窄屏／横屏 | [320](../artifacts/p3-batch-h/cooperate-source-narrow-320.png)、[844棋盘左／操作右](../artifacts/p3-batch-h/cooperate-source-landscape.png) |

七图已实际打开检查，哈希／尺寸见[浏览器记录](../artifacts/p3-batch-h/030-browser-review.json)。手机实际完成选牌→提交→对方选择→确认，手牌等量交换且弃牌0；PC实际选2张且确认可用，未声称PC另完成提交。新审核页按真实单调时间推进，开始30秒选择不续原60秒预算；旧首组固定时钟截图证据保持其原边界。横屏初次地图被操作区挤压已修正；最终844地图与控件分栏无交叠，320／390无横向整页溢出。临时服务已停止、页关闭、视口恢复；不是实机／云端／真人验收。

[030审计](../artifacts/p3-batch-h/030-audit.json)复核冻结迁移和原始资料。H仍剩034／035／041／050，不构建、不上传、不生产执行。

## 034完整私有接入增量

壬人心已接入私有v19／49角色，细则沿夜间N-10暂定，见[034矩阵](p3-h-034-integration-matrix.md)。新增TS／SQL助手及运行补丁、服务端三骰任务、受击队列与逐件装备转移；客户端只提交目标、替换件和落点。000—029／正常G43入口保持。

- [针对性74项通过](../artifacts/p3-batch-h/034-integrated-games-final.json)：23基础＋25真实指令／组合＋12UI＋14场整局。随后补完整OnlineBoard高亮选择，[最终UI14项通过](../artifacts/p3-batch-h/034-board-ui-final.json)。类型检查、目录生成校验及diff检查通过。
- 原失败报告保留：034-integrated-initial的角色ID／地区布景错及锁定组织部部长被SQL错误封禁；recheck1误以封禁下可发动岩浆之力；games-initial的布景错和原卡牌位移链编号TS／SQL差异；修正私有SQL使用有效原根链后root-recheck三项通过，再完整74项通过。未改旧规则或放宽守恒断言。
- 新四场：FFA1204为92条／5轮，同盟1204为92条／5轮；FFA1205为97条／5轮，同盟1205为121条／5轮。新增402，十四场共1615条完整状态对照，191实体守恒并自然结束。
- 011封禁误挡001锁定组织部部长的问题只改H私有SQL，增加真实开始命令回归。完整H全量尚未重跑，前次H030全量1212／1213及独立旧v14C状态缺陷保留，不能据74项称全量全绿。

| 034场景 | 本地实际组件证据 |
|---|---|
| 拼点目标／成功转移AP和手牌 | [PC入口](../artifacts/p3-batch-h/ren-source-desktop.png)、[PC成功](../artifacts/p3-batch-h/ren-win-desktop.png)、[手机入口](../artifacts/p3-batch-h/ren-source-mobile.png)、[手机成功](../artifacts/p3-batch-h/ren-win-mobile.png) |
| 逐件装备明确替换／完成 | [PC](../artifacts/p3-batch-h/ren-gear-desktop.png)、[手机替换](../artifacts/p3-batch-h/ren-gear-mobile.png)、[手机完成](../artifacts/p3-batch-h/ren-gear-complete-mobile.png) |
| 双方后退／单人方向／厌蠢 | [PC后退](../artifacts/p3-batch-h/ren-retreat-desktop.png)、[手机后退](../artifacts/p3-batch-h/ren-retreat-mobile.png)、[手机方向](../artifacts/p3-batch-h/ren-back-mobile.png)、[PC厌蠢](../artifacts/p3-batch-h/ren-expel-desktop.png)、[手机厌蠢](../artifacts/p3-batch-h/ren-expel-mobile.png) |
| 响应布局 | [320窄屏](../artifacts/p3-batch-h/ren-source-narrow-320.png)、[844左右分栏](../artifacts/p3-batch-h/ren-source-landscape.png) |

14张图、尺寸及操作边界见[浏览器记录](../artifacts/p3-batch-h/034-browser-review.json)。[审计](../artifacts/p3-batch-h/034-audit.json)保留冻结资料与旧截图哈希。H还剩035／041／050；最新负责人目标为P3完成后上传GitHub及构建WorkBuddy包，当前尚未交付或生产执行。


## 035完整私有接入增量（2026-10-22）

三幻神按[N-11](p3-h-035-integration-matrix.md)接入私有v19／50角色，正常G43与000—029保持。全局开局出生选择、无伪造出生格、普通复活记忆地区、Leap基础费用次数与respect逐人驱逐均由权威计算，客户端只提交落点。

- [87项通过](../artifacts/p3-batch-h/035-integrated-games-recheck1.json)：035真实指令／组合27、034真实指令25、UI17、18场整局；[运行基础及首批接入33项通过](../artifacts/p3-batch-h/035-integrated-recheck1.json)，[最终布局UI17项通过](../artifacts/p3-batch-h/035-ui-layout-final.json)。类型检查通过。
- 初轮报告保留：035-integrated-initial两项布景误把操场当秀松；035-combinations-initial错误排除死亡者原格的合法复活点；035-integrated-games-initial三项失败为SQL未清理内部_hHandled字段导致两场壬人心骰子续接差异，以及测试机器人在水中尝试禁水坐骑。修正私有SQL临时标志和机器人合法指令选择后87项通过，没有放宽状态对照或191实体断言。水中坐骑权威拒绝一直保持。
- 新四场：FFA1206／71条6轮，同盟1206／64条5轮；FFA1207／149条11轮，同盟1207／74条4轮。新增358条，18场共1973条逐指令完整TS／SQL对照，自然结束且191实体守恒。自然整局覆盖出生、画圆、狂叫／最终6和既有响应；respect具体多目标链由针对性测试及实际UI操作覆盖，不冒称自然整局已发动它。
- PC1200与手机390实际点击出生r2c8→Leap到r1c2→分别驱逐S2到r4c8、S3到r4c5；AP5→4、四人各4张开局牌、牌堆175，结束后Leap禁用。选择保持原30秒，回到59秒行动预算，没有为截图延长时钟。动作提示可遮挡网格，操作时先关闭；过期的截图尝试未算成功操作证据。

| 035界面 | 本地实际组件 |
|---|---|
| 出生30秒、未摸牌 | [PC](../artifacts/p3-batch-h/leap-birth-desktop.png)、[手机](../artifacts/p3-batch-h/leap-birth-mobile.png)、[320窄屏](../artifacts/p3-batch-h/leap-birth-narrow-320.png) |
| 出生完成、Leap全图选择 | [手机出生](../artifacts/p3-batch-h/leap-born-mobile.png)、[手机Leap](../artifacts/p3-batch-h/leap-select-mobile.png)、[PC Leap](../artifacts/p3-batch-h/leap-select-desktop.png) |
| respect逐人及完成 | [PC选择](../artifacts/p3-batch-h/respect-desktop.png)、[PC完成](../artifacts/p3-batch-h/respect-complete-desktop.png)、[手机选择](../artifacts/p3-batch-h/respect-mobile.png)、[手机完成](../artifacts/p3-batch-h/respect-complete-mobile.png) |
| 844横屏棋盘／控件左右分栏 | [横屏](../artifacts/p3-batch-h/respect-landscape.png) |

11张已实际打开检查；横屏初版棋盘被压缩，增加leap-control分栏后重新截图，无整页横向溢出。尺寸／哈希见[浏览器记录](../artifacts/p3-batch-h/035-browser-review.json)，冻结审计见[035审计](../artifacts/p3-batch-h/035-audit.json)。审核页已关闭、视口恢复、本地服务停止。均为本机浏览器，不能替代手机实机／云端／真人验收。H剩041、050；全量旧v14初始化失败仍未修，不宣称全量全绿。


## 041完整私有接入增量（2026-10-22）

小帝汶按[N-12矩阵](p3-h-041-integration-matrix.md)接入私有v19／51角色，普通入口仍G43／v18／修订29；000—029和原始来源不改。持续不占格与新主动判定分开，基础逐格／越水实路径、强制步进和传送目的格各自记录，出生／复活／返回不触发跨人响应。

- [最终72项通过](../artifacts/p3-batch-h/041-integrated-games-final.json)：041真实指令／组合32、UI18、22场完整191实体对局；[基础与035回归97项通过](../artifacts/p3-batch-h/041-targeted-final.json)，[运行基础与035首批53项](../artifacts/p3-batch-h/041-runtime-recheck2.json)。新增普通复活／返回双方共享格、画圆拒绝／付费、051反伤死亡停止旧路径、四座位全局占格以及033改骰／晓虫溢出验证。类型检查及verify:catalog通过。
- 初轮失败保留在041-runtime-initial／recheck1、041-integrated-initial／recheck1／recheck2：依次定位SQL结束符、助手加载顺序、选择分派漏项／legalSteps导入、重复私有局部变量、水生落点占格判断。全部修正后保持完整状态对照和原状态校验；SQL负下标误认最后座位为041的问题另加四座位回归，没有放松普通角色互不重叠规则。
- 新四场：FFA1208为111条7轮，同盟1208为68条4轮；FFA1209为92条7轮，同盟1209为40条2轮。新增311，22场累计2284条逐指令完整状态对照并自然结束、191实体守恒。FFA1209自然出现一次小判定；其余三场未自然触发，具体骰值／强制／传送组合由针对性用例覆盖。
- 手机390实际点击移动→r1c3共享格→免费判定，S2两手牌转到S1，AP在结束移动时12→11、同格稳定；另一条已提交路径判定后继续r2c3。桌面1200也实际点击判定并续行。30秒选择、暂停的原行动预算保持，截图未延长时钟。320窄屏和844横屏无整页横向溢出，横屏新增small-control左右分栏后重新检查。选择过期／提示层定位失败的尝试不算成功操作证据。

| 041界面 | 本机实际组件证据 |
|---|---|
| 手机合法占用落点／免费选择 | [移动](../artifacts/p3-batch-h/small-select-mobile.png)、[选择](../artifacts/p3-batch-h/small-choice-mobile.png) |
| 拿牌续行／同格停留 | [续行](../artifacts/p3-batch-h/small-result-mobile.png)、[稳定同格](../artifacts/p3-batch-h/small-shared-mobile.png) |
| 桌面选择与续行 | [选择](../artifacts/p3-batch-h/small-choice-desktop.png)、[结果](../artifacts/p3-batch-h/small-result-desktop.png) |
| 响应布局 | [320窄屏](../artifacts/p3-batch-h/small-choice-narrow-320.png)、[844横屏](../artifacts/p3-batch-h/small-choice-landscape.png) |

8张PNG已逐张打开检查；[浏览器记录](../artifacts/p3-batch-h/041-browser-review.json)和[冻结审计](../artifacts/p3-batch-h/041-audit.json)保存尺寸／哈希／范围。测试标签已关闭、视口恢复、本地服务停止；前次无法连接留下的错误页未作为验证页。不能替代实机手机／云端／真人验收。H剩050；全量旧v14初始化缺陷仍未修，没有把针对性全绿写成全量全绿。

## 050完整私有接入增量（2026-10-22）

中饭按[N-13矩阵](p3-h-050-integration-matrix.md)接入私有v19／52角色。正常入口仍G43／v18／29。安装实际实体后的可选摸1与同盟装备效果共享分开：槽位／实体／偷取仍检查持有人，耐久／冷却／设置全队用同一原件；来源按实际使用者，原角色修饰谱系保持。共享手表分别记录使用者开始格，共享资格中断清理对应历史。000—029、原始牌面、转录与基础实体不改。

- [专项最终71项通过](../artifacts/p3-batch-h/050-equipment-matrix-final.json)：050真实指令／装备组合41、基础助手10、UI20。覆盖装备049—076的持续／响应／主动效果、同盟与FFA、011、050死亡／普通复活、虚拟装备不可偷、黄虫双件分散持有与最后实体弃牌、耐久破损、面包被偷冷却／持有人时钟、手表资格中断、装备来源免疫／角色修饰及真实使用者费用。
- [整合103项通过](../artifacts/p3-batch-h/050-integrated-games-recheck1.json)：当时050指令23、基础10、运行26、UI18、26场整局。[早期76项](../artifacts/p3-batch-h/050-combinations-recheck1.json)及[装备矩阵38项复验](../artifacts/p3-batch-h/050-equipment-matrix-recheck1.json)均保留。早期失败先后为SQL选择标签漏接、测试非法重叠／不存在的实体、攻击基础伤害期待值、躲避球地点、同一坐骑槽布置、射程与未结束移动段；修正权威标签及测试布置后通过，没有删减完整状态对照或191实体断言。
- 新四场：FFA1210为120条7轮，同盟1210为77条4轮；FFA1211为91条6轮，同盟1211为94条5轮。新增382条，26场共2666条逐指令完整TS／SQL对照并自然结束、191实体守恒。同盟自然触发安装摸牌分别2次／3次；全装备交互由专项覆盖，不冒称自然整局全部发生。
- 全量首轮[1384／1394](../artifacts/p3-batch-h/full-regression-050.json)：8项在启动后已修正的050测试布置，以及2项旧角色数量断言失败；两项更新为实际52，保留首轮报告。最终全量另行记录，不把专项通过写成全量通过。此前仅冻结000—026即可复现的旧v14初始化缺陷仍保留，旧升级测试一次随机抽选通过不能消除固定组合诊断。
- PC1200与手机390实际点击安装摸牌、共享唐车设置、选手牌后仍可发动面包、选择真实来源及S2目标；使用者AP12→10，原面包冷却显示2。最后可用面包进入冷却后自动退出面包选择，避免空来源下拉框。30秒选择与原60秒行动预算未人为延长。

| 050界面 | 本地真实组件／指令 |
|---|---|
| 安装摸牌与完成 | [手机选择](../artifacts/p3-batch-h/equipment-install-mobile.png)、[手机完成](../artifacts/p3-batch-h/equipment-drawn-mobile.png)、[PC选择](../artifacts/p3-batch-h/equipment-install-desktop.png)、[PC完成](../artifacts/p3-batch-h/equipment-drawn-desktop.png) |
| 共享来源／耐久／冷却 | [手机](../artifacts/p3-batch-h/equipment-shared-mobile.png)、[PC](../artifacts/p3-batch-h/equipment-shared-desktop.png) |
| 选牌仍保留装备技能 | [手机](../artifacts/p3-batch-h/equipment-selected-mobile.png)、[PC](../artifacts/p3-batch-h/equipment-selected-desktop.png) |
| 面包来源／目标与结算 | [手机目标](../artifacts/p3-batch-h/equipment-bread-target-mobile.png)、[手机冷却](../artifacts/p3-batch-h/equipment-bread-cooldown-mobile.png)、[PC目标](../artifacts/p3-batch-h/equipment-bread-target-desktop.png)、[PC冷却](../artifacts/p3-batch-h/equipment-bread-cooldown-desktop.png) |
| 320窄屏／844横屏 | [安装窄屏](../artifacts/p3-batch-h/equipment-install-narrow-320.png)、[安装横屏](../artifacts/p3-batch-h/equipment-install-landscape.png)、[共享窄屏](../artifacts/p3-batch-h/equipment-shared-narrow-320.png)、[共享横屏](../artifacts/p3-batch-h/equipment-shared-landscape.png) |

16张PNG已逐张打开检查。[布局报告](../artifacts/p3-batch-h/050-browser-review-final.json)及[点击报告](../artifacts/p3-batch-h/050-browser-actions.json)保存尺寸／哈希。共享列表最初将横屏棋盘压至108px，加入左右分栏后为268px，重新截图；320／390／844／1200均无整页横向溢出。此轮使用本地Playwright启动独立无头Edge，执行实际组件点击并模拟视口，不是手机实机、云端、真人验收。初始CLI截图及过时尝试不算最终证据。H九条已私有实现，N-03—N-13仍待验收，008仍另批；整体兼容收口、030正式激活和交付尚未完成。

## 050之后的整体兼容收口（2026-10-22）

H050检查点[最终全量1397／1397通过](../artifacts/p3-batch-h/full-regression-050-final.json)，包括全部现有测试，类型与冻结目录检查通过。该全量尚未包含随后新增的确定性兼容用例，不因此消除原固定组合诊断。

随后按[兼容方案](p3-h-compatibility.md)在TS开局工厂和私有SQL安装器中提前初始化C状态；冻结000—029不改，已有保存状态不回填。新增29项的[修复前20通过／9失败](../artifacts/p3-batch-h/compatibility-before-fix.json)明确重现，修复后[29／29通过](../artifacts/p3-batch-h/compatibility-recheck1.json)：四种首位×两种模式、JSON续接、真实完成v14旧选角、v1—v18有效旧保存状态及畸形状态拒绝。不能把这写成已修冻结版本或已部署。

规则与证据集中入口见[H批验收入口](p3-batch-h-review.md)，冻结原件、旧截图与新增16图哈希见[050审计](../artifacts/p3-batch-h/050-audit.json)。修复后[最终全量1426／1426通过](../artifacts/p3-batch-h/full-regression-compatibility-final.json)，包含新增29项确定性兼容回归。类型检查、verify:catalog、verify:data、verify:db-data、git diff --check通过。本地审核服务已停止，独立无头浏览器已关闭；远端main只读核对仍为584e6a0f，与本地HEAD一致，未覆盖已有未提交改动。当前达到H私有实现与本地验证检查点，正式激活及阶段验收未完成。
