> 阶段状态更新（2026-10-19）：负责人已确认上线与真人验收，P2正式完成。当前结论见[P2结项记录](p2-closeout.md)，后续见[P3交接](p3-handoff.md)。以下正文保留该批次当时的版本、待部署及待验收状态；其中旧的未结项结论已由本次确认替代，未实施功能仍以[P3待办](p3-backlog.md)为准。

# P2 数据库权威实施记录

2026-10-16，Asia/Hong_Kong。负责人已批准P2按数据库权威方案实施；随后要求先交付SQL交接包，由WorkBuddy创建隔离测试应用和云数据库。

后续状态：WorkBuddy已将源码c787088部署至保留域名，负责人确认一轮真人游玩并要求GitHub正式发布及开启P2反馈。当前入口与发布见p2-release.md，反馈见p2-feedback.md；下面保留分阶段实现过程。

## 已冻结范围

规则保持web-v0.1.1。进入页面确认玩家名，创建自动生成0000—9999四位码或输入码加入；名字在房间内按去首尾空格、忽略大小写唯一，绑定随机恢复凭据，房间关闭后失效。房主选择模式，四人在线且全准备才开始。预开局主动退出释放座位，房主转交最早加入成员；断线保留2分钟，空房30分钟关闭。

原房间再开保留房间码、成员和座位，每局新UUID；不重新加入。旧局记录和处理结果保留24小时。普通断线不暂停或投降；进程停机继续计时，恢复先补到期事件。本地测试桌保留。

## 已实现的首批数据库部分

- database/migrations/000—004：私密表、生成的规则白名单、独立PL/pgSQL完整规则引擎、房间/凭据/计时RPC、权限。
- public.ml_room仅接受有限意图，凭据SHA-256校验绑定座位；玩家名或roomCode本身不是恢复凭据。
- 每房行锁；版本/每局/每座位/请求ID去重，重试返回原结果及当前本人快照；同ID换载荷拒绝。
- 状态、随机结果与命令结果同事务；超时由数据库时间推进。客户端无tick、Setup或状态覆盖接口。
- 私密表无玩家grant/policy；仅受限SECURITY DEFINER函数可访问，固定search_path，撤销私有函数默认PUBLIC执行权限。
- 生成的房间码由数据库随机选择并受唯一索引保护，关闭旧房后同码新房仍使用不同内部UUID。
- 长停机追赶到终局时先保留原座位，断线成员从首次观察终局开始保留2分钟，不在恢复请求中立即全清。
- 原TS引擎和P1页面保持；随机测试输入只对本地管理者测试可用，不是公开RPC。

生产无SQLite/PGlite；@electric-sql/pglite 0.5.10只作为本地PostgreSQL验证器。正式云SDK锁定0.1.3-dev.05a12d5.202610152129。WorkBuddy已在独立应用wbapp_X1YyBYN4mhieMW91OYqaGj安装原SQL；真实匿名HTTPS RPC验证已通过，不需要重建数据库。

## 当前阶段边界

SQL检查点之后，已新增packages/online严格协议、apps/server的官方云SDK适配/单端口HTTP与Socket.IO网关、apps/client联机入口和本人视图棋盘；原页面移至LocalTable.tsx保留本地复现能力。npm run build同时构建dist和server-dist，npm start启动完整应用。start-local.cmd仍是P1静态本地流程，联机复验按p2-workbuddy-deploy.md执行。

当前174项本地回归通过，含独立Node进程持久化重开、四个Socket.IO客户端、长轮询/升级、回执丢失重试与网关重开。真实云端完成FFA/2v2整局和SIGKILL后按真实行动期限恢复；具体证据见p2-validation.md。完整源码交接用于部署测试，尚不代表已在WorkBuddy域名完成联机验收。

后续按Node探针22.13.1/linux x64验证，installCmd为npm ci && npm run build，startCmd为npm start，单端口读取PORT绑定0.0.0.0，长轮询起步并尝试WebSocket升级。一个端口或一次实例采样不证明永久单实例；多副本连接路由尚未验收。

## SQL交接与下一步

已取得publicConfig及WorkBuddy安装/权限报告。当前未改迁移内容，不重新执行云SQL。打包工具新增单条DO/EXECUTE安装文件，适配平台prepared statement一次只接受一条语句；本地成功安装及缺角色整体回滚均通过。

真实RPC工具：npm run verify:cloud-database -- <publicConfig路径> --isolated-test --report=<输出路径>。网关强杀验证：node tools/verify-cloud-gateway.mjs <publicConfig路径> --isolated-test --report=<输出路径>。只用于已批准的隔离测试应用；不在build/start自动执行，不读取管理员配置，不记录凭据。

网关每连接串行化有限操作，以房间能力和连接epoch向数据库鉴权；每2秒查询本人视图/保持在线，不广播完整状态。新连接接管后旧epoch拒绝并主动断开；不同网关进程也依赖数据库围栏。数据库行锁负责最终并发，维护每30秒有限批次。短暂数据库错误不生成替代命令编号。

浏览器每次载入要求确认名字；localStorage保存房间/名字/随机能力，sessionStorage先保存未确认入房及操作，再发网络。恢复后用同一编号重试未确认操作；等待期间禁用新操作。进程恢复补超时，客户端只展示数据库下发的合法目标和移动格，不构造完整GameState。在线页面没有种子、tick、Setup或复现导入。

剩余交接：完整源码包部署到同一applicationId及保留域名，核对Node22/Linux构建、反向代理长轮询及会话路由；部署域名浏览器、异地设备/真人与负责人验收待进行。详见p2-workbuddy-deploy.md。

数据库能力不满足时报告具体SQL/权限/SDK失败，保留全部实现，不改为客户端裁判或关闭权限检查。
