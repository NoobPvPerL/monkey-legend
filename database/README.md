# P2 数据库 schema 2 交接

本地候选 0.2.1-p2.2，新局 web-v0.1.2，旧局保留 web-v0.1.1。此包未在 WorkBuddy 云端执行，不代表线上已升级。详细交接见仓库 docs/p2-interactions-workbuddy.md。

## 安装选择

- 已有 schema 1：只执行增量 005、006、007，同一事务；使用 --upgrade 生成的包，禁止重新执行旧初始迁移/数据装载。
- 全新隔离库：顺序安装 000—007。anon、authenticated 须由平台实际提供，脚本不创建或提升角色。
- install-one-statement.sql 为单条 DO/EXECUTE，适配云端单 prepared statement，失败整体回滚。标准 psql 可选等价 install.sql，二选一。
- 执行前保留数据库快照和旧应用包。增量不清库、不改原房间码、成员、matchId、游戏状态及回执；重跑保留身份和消息。

## 权限和验证

在独立测试应用/数据库执行并保存 verify.sql 结果：健康版本应为 schemaVersion 2 / ruleVersion web-v0.1.2；五个公开RPC权限正确，两角色不能直读私有表或执行引擎，SHA-256和UUID能力可用。只读验证不等于联机验收。

公开函数：ml_room(jsonb)、ml_watch(jsonb)、ml_chat(jsonb)、ml_health()、ml_maintenance(integer)。SECURITY DEFINER固定search_path，私有表启用RLS，无玩家直读策略。观战完整手牌通过鉴权视图返回，不含未来牌堆、随机源、队列、凭据。

聊天不改游戏revision、不暂停时钟；观战不占座、不清准备，数据库和网关均禁用观众游戏命令。玩家/观众共享不区分大小写名字空间；闭房拒绝旧凭据。最多32个观战保留身份，断线保留2分钟；无断线通知先以45秒心跳过期识别。

消息最多200字，每身份2秒一条；默认最近50条，增量每页最多50条，保留最新200条。回执24小时，关闭房间消息24小时后有界批次清理；无后台精确定时删除，无进程时下次访问追赶。

## 配套应用

旧网关就绪检查要求schema1，新网关要求schema2，需协调切换；过渡期/ready可暂时503。数据回滚使用快照并配套旧应用，不手工降级函数。

沿用 config/workbuddy-public.json 或 WORKBUDDY_PUBLIC_CONFIG，仅公开配置，不需管理员密钥/连接串。安装 npm ci && npm run build，启动 npm start，单PORT监听0.0.0.0，HTTPS同域与Socket.IO长轮询。支持Node22.12+（22.x）或24.x。

包内没有测试后门、Setup注入RPC、后台数据库进程或新扩展。确定性输入仅由本地隔离测试管理者调用内部函数。
