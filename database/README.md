# P2 数据库交接：WorkBuddy 隔离测试环境

规则 web-v0.1.1。此包是数据库实现和验证交接，不代表 WorkBuddy 已执行或 P2 已通过云端验收。

## WorkBuddy 执行顺序

1. 创建一个 P2 专用测试应用并开启云数据库，不使用成员正在试玩的 P1 环境或生产数据。
2. 使用数据库管理者身份审阅并执行 install-one-statement.sql。它是单条 DO/EXECUTE，完整安装在一个事务中；失败整体回滚，不删除权限检查。标准 psql 可使用等价的 install.sql（BEGIN/COMMIT）。两者选一，勿重复执行。
3. 执行 verify.sql，保存实际结果（包括 PostgreSQL 版本、anon/authenticated 权限、SHA-256/随机UUID能力）。两种调用角色必须实际存在；脚本不会创建或提升平台角色。
4. 返回测试应用的 publicConfig（endpoint、publishableKey；均为公开配置）及结果文件路径。不要提供管理员密钥或数据库连接串。
5. 由 Codex/验证脚本经真实 SDK RPC 验证房间、权限、两模式与恢复。仅执行 verify.sql 不等于完成联机验收。

请同时确认 anon 可以执行受控 public RPC。玩家身份由数据库校验房间凭据，不要求增加邮箱、手机号或平台账号登录。

## 边界

- ml_private 下的表、规则函数、完整手牌、牌堆、随机记录和凭据哈希禁止 anon/authenticated 直接访问。RLS 不建立玩家直读策略。
- public.ml_room(p_request jsonb) 是玩家操作入口，public.ml_health() 是就绪探测；public.ml_maintenance(p_limit integer) 只能按数据库时间补超时及清理到期数据，不接受任意时间/状态。
- 使用 SECURITY DEFINER 并固定 search_path；不把角色提权、SQL执行或完整状态注入暴露成 RPC。
- 数据库产生随机、计时及结算。调用方即使绕过 Node 也只能提交同样受校验的意图。
- 000—004迁移按顺序安装，001数据由现有 TypeScript 白名单生成；不改规则或启用原作扩展。
- 不安装 plv8、pgcrypto 或后台数据库进程；随机源使用 PostgreSQL 内置 gen_random_uuid 的随机位，无偏拒绝采样，哈希使用内置 sha256(bytea)。需由平台实测确认这些能力。
- 维护调用有频率与批次上限。无进程运行期间不会推送消息，下次访问会按原期限追赶，不增加时间。

## 配置与部署

完整应用的部署约定为 installCmd="npm ci && npm run build"、startCmd="npm start"。数据库单独包只有SQL；完整源码包包含Node网关和联机页面。Node已知探针版本22.13.1，完整应用仍须在部署环境实测安装和构建。
运行环境公开配置放入 config/workbuddy-public.json，或通过 WORKBUDDY_PUBLIC_CONFIG 指向文件；不需要管理员密钥或数据库连接串。
服务端以 PORT 监听0.0.0.0，Socket.IO使用长轮询及可选WebSocket升级。

此首批SQL交接不包含测试后门、任意Setup接口或角色/队伍/骰子注入RPC。测试用可控输入只在本地管理者测试中调用内部函数。
