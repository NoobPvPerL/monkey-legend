> 阶段状态更新（2026-10-19）：负责人已确认上线与真人验收，P2正式完成。当前结论见[P2结项记录](p2-closeout.md)，后续见[P3交接](p3-handoff.md)。以下正文保留该批次当时的版本、待部署及待验收状态；其中旧的未结项结论已由本次确认替代，未实施功能仍以[P3待办](p3-backlog.md)为准。

# P2 全栈部署交接给 WorkBuddy

当前状态：本交接已经执行。WorkBuddy已回报同域上线与公网客户端/重启恢复，负责人确认一轮真人游玩；[在线游戏](https://monkey-legend-p2.app.workbuddy.host/)及[反馈Issue #13](https://github.com/NoobPvPerL/monkey-legend/issues/13)已可使用。以下为后续复现或重新部署保留的操作约定；发布状态见[p2-release.md](p2-release.md)。

用户已批准数据库权威 P2；当前交付完整源码，规则 web-v0.1.1。目标是独立测试应用，部署后继续远程验收，不能提前填“上线验收通过”。

交付包见[v0.2.0-p2.1预发布](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.2.0-p2.1)，源码固定c787088，ZIP SHA-256为`d16a74d9ad21b2afcbd802648593b23a0464b0082c5fe5b1af60744b41903cb4`；完整记录见[p2-release.md](p2-release.md)。

## 固定目标

- 应用：应猴联机测试，applicationId：`wbapp_X1YyBYN4mhieMW91OYqaGj`。
- 保留域名：`https://monkey-legend-p2.app.workbuddy.host`。
- 沿用已经安装的 PostgreSQL 17.11 数据库。**本批没有修改000—004迁移内容，不需要重新安装SQL，不清空业务表、不重建云应用。**
- 使用源码包内 `config/workbuddy-public.json`（仅公开配置）；不要注入管理员密钥或数据库连接串。程序不提供外部配置读取接口。

## 构建、启动与流量

1. 核对 ZIP SHA-256 与 `source-manifest.json` 每项哈希，确认源码提交和目标 applicationId。
2. 解压后的目录为工程根目录，Node **22.13.1**（允许22.12+的22系列或24系列）。
3. installCmd：`npm ci && npm run build`；startCmd：`npm start`。需安装开发依赖完成构建；不要在构建前使用 `npm ci --omit=dev`。
4. 启动读取平台 `PORT`，默认3000，绑定 `0.0.0.0`。生产不要设置 `ML_LOOPBACK=1`。单端口同时提供前端、Socket.IO、`/health`、`/ready`。
5. 公共配置默认相对工程根路径 `config/workbuddy-public.json`；也可用 `WORKBUDDY_PUBLIC_CONFIG` 指向同一公开文件。
6. 静态资源用构建出的 `dist/`，网关入口为 `server-dist/index.mjs`；不要只发布静态目录。无需挂载持久化本地目录，规则和身份以云数据库为准。
7. `/.cloud/**` 必须继续由平台数据面处理，不能被应用静态回退覆盖。Node SDK使用配置的精确Origin，不改成探针域名或另一个新应用。
8. Socket.IO从HTTP长轮询开始，允许WebSocket升级。即使不能升级也必须能通过长轮询完成对局。`/socket.io/**` 需保留查询参数和GET/POST，轮询不能被缓存或改写为HTML。
9. 当前部署用单个Node副本验证；如平台会同时分配多个副本，必须为Socket.IO长轮询提供会话粘性并返回实测证据。数据库已锁行并校验版本，但不能替代Socket.IO会话路由。不要为绕过问题直接切成WebSocket-only。

本机复验可临时设置 `ML_LOOPBACK=1`、`PORT=3219`、`WORKBUDDY_PUBLIC_CONFIG=<配置路径>` 后 `npm start`。Vite单独运行不提供网关；正常联机复验用完整构建和npm start。本地测试桌仍可从联机入口打开。

## 部署后请返回

- 实际Node/npm/Linux版本、安装及构建日志、启动日志（不要输出整个环境变量或凭据）。
- 同一域名根页、JS/CSS与16张参考图可加载；`/health` 200 且版本0.2.0-p2.1；`/ready` 200 且ok=true。
- 实际网页：每次进入先确认名字；一人建房、另外三人用四位码加入，各自手牌隔离；四人准备后房主开始。成员/模式变化应重新准备。
- 长轮询的GET/POST成功证据；WebSocket能否升级均如实记录。不能将同一进程的一次实例探针当作永久单副本保证。
- 发布新进程或重启网关后，以原用户名和浏览器凭据恢复同房间/座位，时限不重置。不要清理浏览器存储后再要求同名抢回座位。
- 返回发布URL和原始结果文件路径，由Codex继续部署域名下的浏览器回归。异地四人真人测试、移动端和负责人验收仍待进行。

## 已有证据与边界

`artifacts/p2/database/cloud-results.json`：真实HTTPS RPC完成FFA和2v2两整局、私密视图、凭据与接管、建房/命令去重、原房间再开；首批合成测试座位已释放。

`artifacts/p2/online/cloud-gateway.json`：真实云数据库 + 本机Node网关 + 四个仅长轮询客户端；SIGKILL后等待原行动期限过去，再启动新进程，原房间/成员/对局保留且时钟追赶，旧版本操作被拒绝。强杀测试合成局及浏览器测试局按正常时限推进和清理；未改云时钟或删除业务表。

`artifacts/p2/online/`还记录本地174项回归、Node22兼容和四浏览器页面检查。它们证明开发及本机网关链路，**不证明WorkBuddy Linux反向代理或异地网络已通过**。数据库权限安装证据来自WorkBuddy回报，真实匿名数据面还检查了私表名称/内部RPC不能直接访问。

数据库单独包新增`install-one-statement.sql`，只适用于将来新建隔离环境时安装；它用单条DO/EXECUTE满足平台单语句限制，成功/缺角色整体回滚均已测试。不要把标准BEGIN/COMMIT多语句直接提交到平台SQL接口。
