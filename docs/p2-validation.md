# P2 验证记录

## 当前线上状态（2026-10-16）

WorkBuddy已按源码c787088完成部署，并回报公网长轮询四客户端入房/开局、本人手牌隔离、离房凭据撤销、重新发布后保留房间/座位/身份/对局且时钟继续，WebSocket入口可用；部署源包316项哈希一致。此处为WorkBuddy证据，不冒充Codex重新执行。

本次Codex只读复核保留域名根页、/health、/ready均200，版本0.2.0-p2.1、规则web-v0.1.1且ok=true。负责人另行明确确认服务器已上线，已经过一轮真人游玩，并要求正式发布与开启反馈；真人游玩不等于下列自动客户端测试，也不推断未提供的模式、设备或局长。

P2正式发布记录见[p2-release.md](p2-release.md)，继续反馈见[Issue #13](https://github.com/NoobPvPerL/monkey-legend/issues/13)。原始开发阶段记录如下。

## 首批数据库验证（历史检查点）

日期2026-10-16；规则web-v0.1.1。范围为数据库SQL交接检查点，不代表P2完整交付或云端验收。

| 检查 | 方法与边界 |
|---|---|
| P1回归 | 保留原87项，不改原测试断言 |
| SQL逐步对照 | 用同一份C-001—C-046、T-FFA/T-TEAM和合法浏览器场景，运行真实PostgreSQL函数；每次开局/命令的全状态与TS引擎比较，含日志及随机状态；不是仅重放TS结果 |
| 房间 | 四身份、码/准备/模式/满员/退出/转房主/再开、同名、凭据错误/接管、真实RPC权限、私密快照、内部命令拒绝、重试/换载荷、旧局、清理/复用码 |
| 整包迁移 | 全事务安装；缺角色整体回滚；只读verify.sql实际执行；重新应用不清空已有房间/身份 |
| 持久化 | 三个独立Node进程顺次打开同一本地PostgreSQL目录；重新进程保留状态哈希、随机、身份和本局，时间推进后按原期限到终局 |
| 数据来源 | 187张原图与4份原始卡牌转录SHA-256检查；SQL白名单与game-data生成结果一致 |

以上SQL在本地PGlite执行，是PostgreSQL实现验证；PGlite单连接不等于云PostgreSQL的并发连接验证。测试用固定时钟只由数据库管理者安装，未进入迁移或公开RPC。

Windows普通沙箱下P1环回服务测试曾遇connect EACCES；相同源码在允许环回连接的工具执行环境重跑，不移除路径或监听边界检查。

本次最终结果：170/170项通过（原P1 87项 + SQL对照/房间/迁移/独立进程83项），10个测试文件；类型检查、现有本地页面生产构建、SQL数据一致性及187图/4份原文哈希均通过。实际输出保存在artifacts/p2/database/，含tests.txt、test-results.json、typecheck.txt、build.txt、sql-data.txt及source-hashes.txt。页面构建不是全栈构建，也没有据此标记P2整体完成。

## 后续全栈与真实云端检查（2026-10-16）

- WorkBuddy安装证据：源0a8074e SQL包8项哈希一致；PostgreSQL17.11；anon/authenticated私密schema、表及引擎函数权限false，三个公开RPC固定search_path/SECURITY DEFINER。原始报告在用户WorkBuddy目录，由其执行，不冒充Codex安装。
- 官方SDK真实匿名HTTPS RPC：四人房、四位码、建房丢失回执去重、凭据拒绝、恢复接管、FFA与2v2从合法开局完整执行至终局、只含本人手牌、命令去重/同ID换载荷拒绝、原码/原成员再开；最终全部合成座位释放。证据artifacts/p2/database/cloud-results.json。
- 新增网关协议与四客户端集成：拒绝tick/状态上传/伪造actor或token；静态路径和配置不可达；Origin校验；仅长轮询完成入房与命令、WebSocket升级；已提交ready但数据库回执丢失后重试同编号；旧连接接管失效；网关重开同房间/身份/对局。增加3项集成测试。
- 平台单语句适配：新增1项测试，以预处理单条DO/EXECUTE安装全部原SQL；缺平台角色整体回滚。原迁移文件未修改，现有云数据库不用重装。
- 完整回归**174/174**，11个文件；artifacts/p2/online/tests.txt和test-results.json。原87项P1断言保留。
- 真实云端强杀：构建出的Node网关、4个仅长轮询客户端；匿名私表名称/内部dispatch RPC不可达；SIGKILL网关后等待原行动期限过去，重开进程恢复相同room/match/member，数据库补时钟并拒绝停机前revision。artifacts/p2/online/cloud-gateway.json；未注入时钟或完整状态。此处是本机Node进程强杀，不是WorkBuddy容器重启。
- 官方Node22.13.1 Windows便携ZIP SHA-256已与官方SHASUMS比对（398a61e250a5584a62a5959e2f69f5d597fc83f1a5ebe3ed8fff29ba39d55f14），同版本构建和3项网关集成通过，node22-build.txt、node22-tests.json。不能据此代替Linux部署实测。
- 四个独立浏览器标签页使用不同合成名字，真实云数据库建房/加入/准备/开局，各看自己的手牌；刷新后重新确认名字并恢复原座位/房间；移动扣AP及随机步数、选择目标/确认攻击后公开日志与目标AP同步；真实到期日志持续推进。并发准备时旧roomRevision收到明确提示，刷新版本后重试成功。浏览器证据browser.json、browser-board.png。同浏览器不同标签页验证不等于四个真人或四台设备。

以上是源码交付时的开发检查。后续部署与真人试玩进展见本页顶部。

## 仍待执行

完整源码已独立解压复验并上传GitHub预发布，316项哈希、全新Node22安装/构建/启动和真实云ready通过，见[p2-release.md](p2-release.md)。

WorkBuddy已回报同域部署、长轮询及重新发布恢复；本应用进程内的Node/npm/Linux精确版本及构建原始日志仍未取得。WebSocket直连握手成功不替代所有浏览器的自动升级覆盖；一次实例采样不保证永久单副本。多副本会话路由、数据库故障注入、高并发压力、移动端/多设备覆盖、长期稳定性和平衡待继续验证。负责人已确认的一轮真人游玩不重复标记为未执行，也不扩大其覆盖范围。

本地独立进程持久化不证明云平台能按相同权限/网络条件恢复。SQL交接包是下一步测试输入，不是已经上线的游戏。
