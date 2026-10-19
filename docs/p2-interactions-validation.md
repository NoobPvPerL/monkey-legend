> 阶段状态更新（2026-10-19）：负责人已确认上线与真人验收，P2正式完成。当前结论见[P2结项记录](p2-closeout.md)，后续见[P3交接](p3-handoff.md)。以下正文保留该批次当时的版本、待部署及待验收状态；其中旧的未结项结论已由本次确认替代，未实施功能仍以[P3待办](p3-backlog.md)为准。

# P2 第二批开发与验证记录

日期：2026-10-16（Asia/Hong_Kong）。本地候选 `0.2.1-p2.2`，数据库 schema 2，新局规则 `web-v0.1.2`。负责人先批准第二批开发，后批准一并解决 Issue #13 新增建议，并明确搏击操仅选敌人、成功主动出牌立即重置60秒。

**状态：本地实施及开发验证完成；尚未提交Git、推送、发布Release、执行云端迁移或更新线上应用。** 线上仍为已发布的 v0.2.0-p2.1；此次本地验证不替代新版云端和真人验收。

## 实施结果

| 项目 | 结果 |
|---|---|
| 移动防误触 | 掷骰不扣AP且消耗移动次数；未走取消/超时免费；走过后停止、耗尽、结束、超时只扣1AP |
| 聊天与弹幕 | 玩家/观众双向聊天、独立消息序号、同请求重试、200字/2秒、最多3条6秒弹幕、可关闭 |
| 观战 | 独立凭据，显式入场、只读、不占座；切换查看四人完整手牌，32个保留身份，共享名字空间 |
| 动画 | 数据库真实骰子结果800毫秒、开局角色/手牌数量展示1200毫秒；跳过/关闭/减少动态效果；恢复不重播 |
| 新增Issue意见 | 搏击操ⅠⅡⅢ均群体，可选1—3敌人；头锤吸完现有AP；弃牌20秒；成功主动出牌立即重置60秒；15地区不同色块 |
| 原有要求 | 全网页隐藏滚动条外观并保留滚动；牌面纵向完整、横向滑动；第一批提醒、规则/日志、结算再开保留 |

主要文件：`packages/game-core/src/{index,types}.ts`、`packages/game-data/src/index.ts`、`packages/online/src/protocol.ts`；`apps/server/src/gateway.ts`；客户端 `main.tsx`、`OnlineBoard.tsx`、`SpectatorBoard.tsx`、`RoomChat.tsx`、`MatchEffects.tsx`、`Dialog.tsx`、`online.css`；新增迁移005—007、对应 `tests/p2/` 与打包/交接文档。原始卡牌资料和图片未改写。

新旧规则按对局保存版本处理。旧局的头锤、目标数量、移动费用和计时不追溯改变。本地P1桌默认旧版。精确规则见 [web-v0.1.2](web-rules-v0.1.2.md)，原方案与批准补记见 [交互设计](p2-interaction-design.md)。

## 自动验证

- `npm test -- --maxWorkers=2 --reporter=json --outputFile=artifacts/p2-interactions/test-results.json`：**203/203通过**。含原有P1/P2、第一批回归、新移动、社交、网关、增量升级和新增反馈专项。见 [完整报告](../artifacts/p2-interactions/test-results.json)。
- TS/SQL完整状态逐步对照：未走取消、返回起点、停止/耗尽/结束/超时、占用格收尾；三种群体牌三目标、队友禁选、单手牌免疫、头锤全AP/0AP/防御/肘击；20秒弃牌；主动出牌重置、响应暂停、失败和移动不重置；旧版保留原行为。
- 社交：鉴权、跨房、共享名字、32人上限、过期、接管、闭房及同码新房隔离、幂等、丢失已提交回包、重启恢复；200字Unicode/控制字符、50条分页/200条保留、24小时后有界清理；匿名角色不能直读私有表/内部函数。
- 增量升级：从000—004安装且已有旧规则对局开始；故意失败整体回滚，成功升级保留原游戏/成员/matchId；重复升级保留观众身份。
- Node24.19.0：类型检查与生产构建通过。Node22.13.1：24项新移动/反馈/社交/升级专项、类型检查、Vite和网关构建通过，见 [Node22报告](../artifacts/p2-interactions/node22-tests.json)。
- `verify:data`：187图片与4份原始文档SHA-256一致。`verify:db-data`通过；检查器仅将Windows CRLF归一后比较，未重写旧数据库数据或原作资料。

首轮无并发限制时，持久化测试子进程曾因本机内存耗尽退出；降低至2个worker后全量通过。三目标页面复测发现协议仍限制2目标，已改为3并补协议测试；引擎继续按各对局版本校验目标是否合法。真实升级包独立执行还发现打包前置检查的SQL引号错误，已修正并重新生成、执行验证。

## 浏览器实际验证

同域生产构建 + Node网关 + 隔离内存PGlite。为稳定复现，测试管理者固定首位、四角色、前四张牌与骰子；该输入仅在忽略目录 `.release-cache` 的本地辅助程序内，不作为公开RPC或部署文件交付。不是自然随机真人整局验收。

- 两个浏览器标签验证玩家与观众：明确观战入口、四人各自完整手牌、无玩家操作控件、双向聊天及字面量HTML文本。
- 移动掷骰AP5，走一步仍AP5，结束变AP4；未走取消仍AP5。费用与骰子均来自真实SQL结果。
- 页面实际三选敌人并提交搏击操Ⅰ；三目标均从AP5变AP4，费用只收一次；响应结束后继续剩余的新60秒预算。原房间再开保留四位码及观众。
- 开局发牌、真实骰子6、弹幕已截图。观众刷新恢复后骰子/发牌/历史弹幕均为0，聊天历史保留。
- 玩家与观众各测360×640、390×844、768×1024、1280×720：无页面横向溢出；手牌内容高度等于可用高度，完整显示；手牌横向overflow为auto，可滚区域scrollbar-width均为none；15个地区基础色各异。视口已恢复默认。
- 规则弹窗Escape关闭并回到“规则”按钮焦点；最终标签warn/error为空。

证据：[浏览器记录](../artifacts/p2-interactions/browser.json)、[尺寸测量](../artifacts/p2-interactions/viewport-checks.json)、[玩家手机页面](../artifacts/p2-interactions/player-mobile-final.png)、[观战手机页面](../artifacts/p2-interactions/spectator-mobile.png)、[三目标出牌](../artifacts/p2-interactions/group-attack-desktop.png)、[移动扣费](../artifacts/p2-interactions/movement-fee-desktop.png)、[聊天](../artifacts/p2-interactions/chat-final.png)、[弹幕](../artifacts/p2-interactions/danmaku-final.png)、[发牌](../artifacts/p2-interactions/deal-animation.png)、[骰子](../artifacts/p2-interactions/dice-animation.png)。部分机制截图来自本批早期构建，最终构建另有尺寸、协议及聊天复测。

## SQL候选包

最终目录 `releases/monkey-legend-0.2.1-p2.2-database-interactions-upgrade-final/`，只含005—007与配套文档。旧的interactions-upgrade及interactions-upgrade-verified均为开发中间产物，不能部署。

独立读取实际产物逐项核验manifest SHA-256；使用prepared单语句安装至旧schema1，重复执行成功；只读verify结果为schema2、5个固定search_path的SECURITY DEFINER函数，匿名/认证私有权限均拒绝。见 [包验证](../artifacts/p2-interactions/package-verification.json)。单语句安装SHA-256：`20677e177a002af80a063cdac541f7d02c44107bd48b9ffe1a0793a3520a352a`。

包标记sourceDirty=true，属于可审阅SQL候选，不冒充已提交正式源码。完整应用打包仍要求干净源码。升级/切换步骤见 [WorkBuddy交接](p2-interactions-workbuddy.md)。

## 待实际验收

新版WorkBuddy增量迁移和新增RPC、云端联机/重启、真实手机触控/虚拟键盘、跨浏览器/网络、32观众性能、真实提示音听感及多人平衡尚待验证。减少动态效果样式已实现，本批未在真实系统切换该偏好。经典地图、地点能力、水域新规则、环境翻倍、选角和装备未实施。

SQL ZIP 已独立解压，7个manifest文件SHA-256全部一致。ZIP SHA-256：`69d8e37a97249821bc12df9e19262b0ac917071299feabe2a3cbde01da01f80a`；交付文件为 `releases/monkey-legend-0.2.1-p2.2-database-interactions-upgrade-final.zip`，另附 `.sha256.txt`。

后续源码交付见 [P2.2源码交付](p2.2-source-handoff.md)：本地提交及完整包独立验证另行记录，本节以上为打包前验证时点，不代表线上已更新。
