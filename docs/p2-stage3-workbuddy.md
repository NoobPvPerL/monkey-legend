# WorkBuddy：阶段三完整部署交接

交付版本 **0.2.4-p2.5／web-v0.1.6／schema2／engineRevision16**，16角色、23种85张、39份浏览器参考素材。配套源码ZIP与数据库增量ZIP位于 `releases/monkey-legend-0.2.4-p2.5-stage3-workbuddy/`。使用该目录的SHA256SUMS.txt和PACKAGE-VALIDATION.json；旧0.2.3-p2.4草稿仍暂停交付。

1. 核对两个ZIP的SHA256，以及解压后的manifest逐文件哈希和相同sourceSnapshotSha256。来源是未提交工作区快照：sourceDirty=true，sourceCommit仅基础提交，不能用该提交替代本包。
2. 沿用既有应用、域名和云库，保留数据库快照与旧应用包。先暂停旧网关写入，再执行迁移，切换新应用后恢复；玩家刷新页面。旧对局数据及规则保留，但旧客户端没有选角界面，不能继续拿旧页开新局。
3. **已完整012：同一事务安装014、015、016；013可跳过，016已包含选角基础。完整014只需015、016。** 不确定旧补丁状态或已有schema1时，配套增量ZIP的install-one-statement.sql含005—016，单DO语句、失败整体回滚。标准psql可选等价install.sql，二选一；不要重装000—004、不清库、不手改房间JSON。
4. 增量保留旧房间、成员、凭证、matchId、回执、聊天和旧规则profile；016仅加独立draft列并替换引擎／房间函数。正在进行的旧局按保存版本继续，新局才进入三选一。失败回滚及重复安装在本地隔离PostgreSQL中验证；回退使用配套快照与旧应用，不能只降级客户端。
5. 执行包内verify.sql，保存完整输出。健康值应为schemaVersion=2、engineRevision=16、ruleVersion=web-v0.1.6；feedbackRulesReady、versionedDataReady、locationDataReady、locationRulesReady、waterRulesReady、environmentRulesReady、classicPlayable、classicPatchReady、draftReady、characterSkillsReady、stage3Ready全部true。五个公开RPC可执行，anon／authenticated不得读私有表、draft或执行引擎函数。
6. 源码目录执行 `npm ci`、`npm run build`，再 `npm start`。使用Node22.12+的22.x或24.x，单PORT监听0.0.0.0，HTTPS同域，保留Socket.IO长轮询及WebSocket升级。只提供publicConfig或WORKBUDDY_PUBLIC_CONFIG，沿用包内已白名单筛选的公开配置；配置如轮换，以同一应用当前公开配置为准，运行时不需数据库管理员密钥。
7. 保存应用 `/health`（version=0.2.4-p2.5、ruleVersion=web-v0.1.6、requiredEngineRevision=16）和 `/ready`（200）；确认生产JS/CSS及references/index.json的39个牌面URL均可取。
8. 云端验收：四人输入名字建／加房、2v2先分队逐人三选一、30秒超时及选角断线恢复；玩家仅见自己候选与手牌、观众可见当前候选与全部手牌但不能操作；验证角色技能、装备替换先失去后装配、d6复活先报价再扣费、牢大方向预览、西帝汶带人、组合胜利；再测旧局恢复、聊天、网关重启和同房再来一局。移动端确认无可见滚动条，手牌竖向完整、横向可滑。
9. 返回部署时间、应用版本、公开健康／就绪结果、SQL权限输出、所用源码／SQL ZIP哈希和真人验收结果。不要把本地测试报告改称云端／真人验收。

源码内000—016只供全新隔离库按序安装；平台应提供anon／authenticated角色，脚本不创建或提升它们。`verify:cloud-database -- <publicConfig.json> --isolated-test`会写入合成房间，只能经明确授权在独立测试环境运行；它验证两种模式的选角和有限回合，可能留下未结束测试房间，并在报告列出供测试环境清理，不能代替真人完整游玩。

规则详见[web-v0.1.6](web-rules-v0.1.6.md)。本包只交付源码和SQL，Codex没有执行云端迁移、线上部署、GitHub推送或真人验收。
