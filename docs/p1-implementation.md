# P1 本地实现说明

日期：2026-10-16。规则基线：web-v0.1.1。状态：本地开发检查点；P1尚未正式验收。

## 工程与运行

使用 Node.js 24、npm、TypeScript、React、Vite、Vitest。已验证环境 Node 24.19.0 / npm 11.17.0。项目依赖固定版本并提交 package-lock.json；后续安装用 npm ci。

```powershell
cd 'D:\Users\20753\Desktop\应猴传说\monkey-legend'
npm ci
npm run dev
```

浏览器打开终端显示的本机地址，默认 http://127.0.0.1:5173/。

```powershell
npm run typecheck
npm test
npm run verify:data
npm run build
npm run preview -- --port 5173 --strictPort
```

dev/build前自动根据素材台账生成16份当前白名单参考图，输出public/references/；这些是可再生成的原图副本，不提交，也不修改assets/cards/。启动前不要直接双击HTML文件。preview要求先完成build。

## 目录

| 路径 | 职责 |
|---|---|
| packages/game-data/src/index.ts | 显式v0.1.1卡牌、实体份号、角色、32格/区域/地形、环境集合 |
| packages/game-core/src/types.ts | 状态、命令、选择、事件、计时和结果类型 |
| packages/game-core/src/index.ts | 与React/网络/真实时钟分离的规则核心 |
| packages/game-core/src/replay.ts | T-FFA/T-TEAM输入、逐条命令和JSON复现校验 |
| apps/client/src/ | 本地四座轮换页面、棋盘、手牌、响应、技能、弃牌及日志 |
| tests/ | 46项C案例、2项T完整推演、全牌/技能及补充边界 |
| tools/ | 素材准备和来源SHA-256检查 |
| artifacts/p1/ | 开发检查点的测试与浏览器证据 |

## 引擎接口与行为

createGame(setup, now)接收固定四座、模式、种子，以及测试可注入的角色、队伍、首位、64实体排列、骰子、轰炸和重洗输入。普通开局均随机生成，使用可复现PRNG；正式联机的服务端随机与安全边界由P2实现。

dispatch(state, command, now)返回新状态或原状态及失败原因；非法、重复、过期、超时或倒退时钟命令不改变状态。tick将已到期事件按原期限逐项推进，长时间无事件后也不重新获得完整时限。规则核心不调用Date.now或performance.now。

引擎使用可序列化待办队列处理响应、整批伤害、同时淘汰、存活者触发、结算区清理和胜负。每个成功命令检查64实体牌区守恒及基础不变量。移动保留路径、剩余步数和最近空落点，合法预览与执行复用判定。

publicView提供每座专属数据模型；隐藏手牌、未来牌堆和随机输入。实际浏览器为本地同屏完整状态，遮罩仅供交接，不能宣称已经满足多客户端隐私。

## 页面使用

开局选择各自为战或双人同盟，输入uint32种子。每次轮换/他人响应时交接屏幕并按“我已接手”。交接不暂停计时。

先选择手牌，再选择棋盘或左栏高亮的敌方目标，最后确认出牌。基础移动先付1AP掷骰，再逐格选择高亮落点，可提前结束。响应窗口直接选择合法响应牌；受伤技能可选择发动/放弃，土豆直接点高亮空陆地。结束超限时选择准确数量的手牌再确认弃置。

“复现工具”可导出完整开局与已接受命令，或载入同格式JSON。此文件包含私有手牌及未来随机输入，只用于本地调试。“载入规格初态”经页面内确认替换当前局；“执行下一条推演输入”执行一条文档中既定输入。它不是正式对局机器人。

原始牌面保留来源，页面文字明确以web-v0.1.1为准。未加入神牌、课程、联机、暂停、投降或未定义扩展。

## 续接

见[p1-handoff.md](p1-handoff.md)与[p1-validation.md](p1-validation.md)。当前是用户要求的夜间间断点；不要把本检查点当作P1正式完结或发布。
