2026-10-19交付回执：本批截图已获通过，默认提示音修订亦已完成；新包及独立验证结果见[p2-card-feedback-delivery.md](p2-card-feedback-delivery.md)。源码fd893dd，ZIP保持冻结，后补回执不重写包。下文未打包／待审核描述为当时状态；未生产部署。

2026-10-19负责人已通过PC／手机截图，并要求删除提示音开关、默认有声音。本次附加UI修改已验证，获准继续构建WorkBuddy交付包后上传GitHub；实际交付回执以本文件后补记录为准，未执行生产部署。

# 四项卡牌反馈修订：本地候选验证

2026-10-18开始，2026-10-19完成本批本地验证（Asia/Hong_Kong）。负责人“开始继续修复”授权处理最新四项反馈，并确认JJ暴露持续至自己下次开始行动，本次只修改攻击牌范围。基线提交54d95111f3c1d78eea615ede472d3fc0f18ceeee，工作区保留此前手牌交互、完整牌效及技能按钮直显修改。候选0.2.8-p2.9／web-v0.1.10／schema2／修订21，16角色、76种191实体。

## 排查结果与具体修改

1. **教学楼／秀松苑：规则问题已复现并更正。** 旧版两个地点均禁两张牌；新局教学楼仅禁躲避球，秀松苑仅禁猴子游戏。修改`packages/game-core/src/locations.ts`、`stage3-roles.ts`及版本化地点策略，客户端可用目标与TS／SQL出牌校验保持一致。唐车与应豪原地点例外保留。
2. **JJ非攻击牌错误附带效果已复现并更正。** 基线中别人奈雪回血会给暴露JJ回血；新版本只对攻击牌添加暴露目标，包括实际主动使用的肘击。修改`stage3-roles.ts`及021对应SQL函数；不改暴露持续期、固定费用免费或既有免疫／保护。版本目录中的JJ说明和规则面板同步。
3. **紫檀木：补齐独立选人入口，完整流程已通过。** 基线TS／SQL可返回合法阵亡目标，原现场“无法选择角色”未完整复现，不能声称引擎原先完全无复活能力。`Stage4Controls.tsx`现直接列出合法阵亡角色，选择后才可报价；无目标时解释复活期和出生地限制。保留既有费用／复活期／角色免疫。
4. **卫汶找你：补齐独立目标入口与过程反馈，完整流程已通过。** 基线基础猜错→出牌者选落点→传送链在TS／SQL可执行，原“没效果”现场仍未知。新增明确的猜中留原地、猜错／猜点超时转出牌者、无合法落点及放弃／落点超时日志；`OnlineBoard.tsx`／`Stage4Controls.tsx`提示具体由谁操作。没有改变猜点规则或超时策略。

基线诊断原始数据：[`before.json`](../artifacts/p2-card-feedback/before.json)。前两项规则修正与后两项操作改进／已验证路径分别记录，不把未复现现场写成根因已确认。

## 版本及兼容文件

- `packages/game-data/src/versions.ts`、`legacy.ts`：新增web-v0.1.10能力继承、独立地点策略和JJ运行说明；旧目录保持。
- `packages/game-core/src/draft.ts`：允许新目录，已保存旧选角继续使用原目录。
- `tools/generate-card-feedback-patch.mjs`生成`database/migrations/021_p2_card_feedback.sql`：从冻结000—020读取函数，追加v10分支、新目录、新局版本及修订21健康检查；地点策略缺失时就绪检查失败。
- `packages/online/src/version.ts`、包版本／锁文件、打包工具及数据库只读验证元数据同步21；新应用面对仅20的数据库应拒绝就绪。未执行`verify-cloud-database.mjs`，该脚本会创建房间，不得自行对生产使用。
- `Stage4Controls.tsx`、`OnlineBoard.tsx`、`Stage3Rules.tsx`、`SpectatorBoard.tsx`、`online.css`：目标按钮、过程提示与版本化规则说明。短屏将目标控件合并排列，防止多技能挤压地图。

没有重做阶段四。000—020共21份迁移已逐一对照HEAD内容，未变更；187张原图和4份原始卡牌文档哈希通过。记录见[`compatibility.json`](../artifacts/p2-card-feedback/compatibility.json)。

## 自动回归

完整回归：**73文件588项，全部通过**；随后补充主动肘击对暴露JJ的单体保护边界，并在最终定向回归中再次检验，最终6文件39项全部通过，见[`final-boundaries.json`](../artifacts/p2-card-feedback/final-boundaries.json)。类型检查、客户端和服务端构建通过，生成目录检查`npm run verify:catalog`、素材来源检查`npm run verify:data`、`git diff --check`通过。构建保留大于500kB分块提示。

- [`full-regression.json`](../artifacts/p2-card-feedback/full-regression.json)：全部回归，包含四组新版本FFA／2v2完整自动对局，逐命令TS／SQL状态一致。自动对局不能替代真人整局。
- [`engine-regression.json`](../artifacts/p2-card-feedback/engine-regression.json)：地点四组合、JJ治疗／摸牌／AP／锦囊与攻击／主动肘击、原截止点、猜点正确／错误／超时、非法落点原子拒绝、复活有效期／出生地占用／报价不重掷。
- [`authenticated-rpc.json`](../artifacts/p2-card-feedback/authenticated-rpc.json)：隔离PGlite中真实public.ml_room身份与座位路径，猜点换人／选落点、拒绝错误操作者、紫檀木报价及实际复活通过；021原子失败回滚、重跑、旧房间／身份／目录／选角保留，所有旧版本恢复对照、匿名与authenticated私有权限拒绝通过。
- [`ui-regression.json`](../artifacts/p2-card-feedback/ui-regression.json)：目标入口、无目标／未选目标禁用、猜点与落点、规则版本说明及之前交互回归通过。

最终前端主资源：`index-BxnUfD8A.js` SHA256 `215b943c761265d257c7d86cb467663418f89b1edaaa960107597af50025871b`；`index-DPMHgnu8.css` SHA256 `6bde2c1502c37b0a7b25c1dd613527dee2f66e91431c8b1938482d3d5eefcc07`。未打新交付ZIP，不能把这些资源当作已交付或线上资源。

## 浏览器证据与截图审核

本机合成对局，生产组件＋真实TS指令，不调用生产RPC。已在360×640浏览器点击：紫檀木直接选S2阵亡角色、报价4AP、确认后使用者AP20→16，目标HP0→1、AP0、空手，于r2c3复活；卫汶找你选择S2、固定骰3、受牌者猜1，切回出牌者选择r4c8后，S2从r1c3移动到r4c8，卡牌入弃。

多装备＋15个可见操作按钮（含新增目标及设置入口）压力布局：360×520、360×560、360×640、390×844均32格、文档尺寸等于视口、格内元素无溢出、操作区无内部溢出且按钮都在屏内。PC1920×1080复活目标场景全部操作在视口内，32格完整，文档尺寸等于视口，操作区708／708无内部溢出；[原始PC检查](../artifacts/p2-card-feedback/pc-validation.json)。PC1440×900保持地图与操作分栏；复杂装备场景沿用右侧操作区内部滚动。原始记录：[`browser-validation.json`](../artifacts/p2-card-feedback/browser-validation.json)。这是浏览器视口模拟，尚无本批实体手机真人验收。

- [PC复活目标（1920×1080）](../artifacts/p2-card-feedback/revival-pc-1920.jpg)
- [PC复活目标（1440×900，侧栏内部滚动）](../artifacts/p2-card-feedback/revival-pc-selected.jpg)
- [手机复活目标与报价](../artifacts/p2-card-feedback/revival-mobile-selected.jpg)
- [手机复活结果](../artifacts/p2-card-feedback/revival-mobile-result.jpg)
- [手机卫汶找你选落点](../artifacts/p2-card-feedback/weiwen-mobile-destination.jpg)
- [手机卫汶找你传送结果](../artifacts/p2-card-feedback/weiwen-mobile-result.jpg)
- [短屏多技能压力图](../artifacts/p2-card-feedback/controls-heavy-360x520.jpg)

截图为原始viewport截图，不拼接。本批截图待负责人审核，审核通过后再构建WorkBuddy新交付包，随后按既定流程上传GitHub。旧hand-feedback及exercise交付ZIP保持原快照。

## 尚未完成及P2结项判断

本批未执行生产写入、发布、GitHub上传或关闭Issue。云端实际安装、资产哈希核对、跨设备真人复测和两模式真人整局证据仍待收集；卫汶找你及紫檀木原现场未完整复现，需真人按新入口复验。

应豪冲撞反馈仍未复现，猴子游戏免疫缺失仍未实施；此前文档拟用v10／021的应豪方案已被本次实际v10／021占用，后续应豪批次须重新确定版本和迁移编号，不能覆盖021。本批不宣称应豪已修复。**P2目前不能正式结项。**

## 审核后附加：提示音默认开启

负责人明确要求删除“开启提示音”按钮。OnlineBoard已移除开关与手动开启错误提示，game-audio.ts默认启用；已有浏览器用户激活时立即准备音频，否则在普通点击／按键时自动解锁；被系统暂停或拒绝时下次交互重试，不阻断游戏、不更改时限。退出对局解除监听并关闭音频上下文。浏览器自动播放限制仍适用，首次交互前不能保证发声。

4文件18项音频／提示／控件相关测试通过（含5项音频生命周期测试），类型检查及客户端／服务端构建通过。[测试报告](../artifacts/p2-card-feedback/default-audio-regression.json)、[浏览器检查](../artifacts/p2-card-feedback/default-audio-browser.json)、[最新手机图](../artifacts/p2-card-feedback/default-audio-mobile.jpg)。360×640实测工具栏仅玩家／日志／规则，32格完整、文档等于视口；声音实际可听性仍取决于设备音量及浏览器权限，未当作实体手机听音验收。
