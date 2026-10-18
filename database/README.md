**2026-10-19 本地候选：021_p2_card_feedback.sql／web-v0.1.10／修订21。** 完整20追加021，18／19须先补齐中间迁移；000—020冻结，原房间／旧局／旧选角保留。尚未执行生产迁移、未打新交付包，流程与验收见[本批WorkBuddy草稿](../docs/p2-card-feedback-workbuddy.md)。下文是历史记录。

新增020_p2_exercise_rules.sql：候选v0.1.9／修订20；保留000—019。仅新局启用搏击操新费用及实体归属；旧局、旧选角保持保存版本。本地验证通过，页面截图已通过，新交付包构建与独立验证见[交付记录](../docs/p2-exercise-delivery.md)，生产未执行。

# 当前补丁：P2真人反馈修订019

0.2.6-p2.7／web-v0.1.8／schema2／engineRevision19。完整018仅安装019；旧局／旧选角保留保存版本，原房间与身份不改。验证及回退见[新交接](../docs/p2-playtest-workbuddy.md)。旧0.2.5-p2.6已上线，新补丁仍待交付部署。以下为冻结的阶段历史。

# 当前数据库交接：阶段四

当前候选0.2.5-p2.6 / web-v0.1.7 / schema2 / engineRevision18，16角色、76种191实体。**完整016只需同一事务执行017、018**；017仅私有目录，018才同时启用引擎、新局与健康检查。已有完整014需015—018；已有完整012需014—018（013可跳过）。不能确认补丁状态时，使用本版SQL增量包005—018的install-one-statement.sql，不重装000—004、不清库。全新隔离库用000—018。

旧局、旧选角、房间码／身份／聊天／回执不重写；新开局使用v0.1.7。verify.sql要求stage4Ready、cardDefinitions=76、cardInstances=191及此前全部就绪标记。本地已验证原子失败回滚、重复安装、两角色权限及旧局保留；尚未据此宣称云端升级。完整步骤见[阶段四WorkBuddy交接](../docs/p2-stage4-workbuddy.md)。以下是此前各阶段的历史说明，不替代当前交接。

# P2 数据库 schema 2 交接

当前新增补丁为014 / web-v0.1.5 / engineRevision14，应用0.2.3-p2.4。完整012后可直接装014；013仅私有选角基础，不是014的前置要求。旧版进行中对局及目录不重建。就绪还要求classicPatchReady=true；本地验证见[补丁规则](../docs/web-rules-v0.1.5.md)。下方005—012说明是上一阶段冻结交接，不代表新应用只需012。现有已安装005—007的库使用005—014完整增量事务，不重装000—004、不清库。

本地候选 0.2.2-p2.3，新局 web-v0.1.4，schemaVersion 2，engineRevision 12，versionedDataReady／locationDataReady／locationRulesReady／waterRulesReady／environmentRulesReady／classicPlayable均为true。经典图当前沿用4角色、12种64实体牌，新增内容尚未入池。旧对局保留原规则。尚未在 WorkBuddy 云端执行，不代表线上已升级。详细交接见 [第三批部署说明](../docs/p2-third-batch-workbuddy.md)。

## 安装选择

- 已有 schema 1：执行增量 005—012，同一事务；使用 --upgrade 生成的包，禁止重新执行旧初始迁移/数据装载。
- 已完整安装005—007：执行008—012；已有完整008：执行009—012；已有完整009：执行010—012；已有完整010：执行011、012；已有完整011：只执行012。不能确认补丁完整性时使用005—012完整增量包。
- 全新隔离库：顺序安装 000—012。anon、authenticated 须由平台实际提供，脚本不创建或提升角色。
- install-one-statement.sql 为单条 DO/EXECUTE，适配云端单 prepared statement，失败整体回滚。标准 psql 可选等价 install.sql，二选一。
- 执行前保留数据库快照和旧应用包。增量不清库、不改原房间码、成员、matchId、游戏状态及回执；重跑保留身份和消息。

## 权限和验证

在独立测试应用/数据库执行并保存 verify.sql 结果：健康版本应为 schemaVersion 2 / ruleVersion web-v0.1.4 / engineRevision 12 / feedbackRulesReady=true / versionedDataReady=true / locationDataReady=true / locationRulesReady=true / waterRulesReady=true / environmentRulesReady=true / classicPlayable=true；五个公开RPC权限正确，两角色不能直读私有表或执行引擎，SHA-256和UUID能力可用。只读验证不等于联机验收。

公开函数：ml_room(jsonb)、ml_watch(jsonb)、ml_chat(jsonb)、ml_health()、ml_maintenance(integer)。SECURITY DEFINER固定search_path，私有表启用RLS，无玩家直读策略。观战完整手牌通过鉴权视图返回，不含未来牌堆、随机源、队列、凭据。

聊天不改游戏revision、不暂停时钟；观战不占座、不清准备，数据库和网关均禁用观众游戏命令。玩家/观众共享不区分大小写名字空间；闭房拒绝旧凭据。最多32个观战保留身份，断线保留2分钟；无断线通知先以45秒心跳过期识别。

消息最多200字，每身份2秒一条；默认最近50条，增量每页最多50条，保留最新200条。回执24小时，关闭房间消息24小时后有界批次清理；无后台精确定时删除，无进程时下次访问追赶。

## 配套应用

本版网关就绪检查要求schema2、engineRevision至少12、ruleVersion为web-v0.1.4及feedbackRulesReady、versionedDataReady、locationDataReady、locationRulesReady、waterRulesReady、environmentRulesReady、classicPlayable均为true，需协调切换；过渡期/ready可暂时503。数据回滚使用快照并配套旧应用，不手工降级函数。

沿用 config/workbuddy-public.json 或 WORKBUDDY_PUBLIC_CONFIG，仅公开配置，不需管理员密钥/连接串。安装 npm ci && npm run build，启动 npm start，单PORT监听0.0.0.0，HTTPS同域与Socket.IO长轮询。支持Node22.12+（22.x）或24.x。

包内没有测试后门、Setup注入RPC、后台数据库进程或新扩展。确定性输入仅由本地隔离测试管理者调用内部函数。

## 008阶段历史（当前要求见012）

008_feedback_diagnostics.sql要求先有007。该阶段健康修订号为8；008保留房间与对局，经典布局仅保存为数据，未启用地图／出生／地点等待裁定机制。本版配套应用还必须继续安装009。执行前保留快照，不能重装000—004或清库。

## 009阶段历史：不限攻击次数

0.2.2-p2.3最终候选改为web-v0.1.3／engineRevision9（schema仍2）。增量包包含005—009；已有完整008可只装009。新局无两张攻击牌上限，已开始的v0.1.1／v0.1.2局保留原规则。/ready要求9及规则v0.1.3；先装SQL再切换配套应用。详见[最新规则](../docs/web-rules-v0.1.3.md)及[交接](../docs/p2-third-batch-workbuddy.md)。上述008段落为本轮前一阶段记录，不能作为最终就绪要求。

## 010阶段历史：版本化数据基础

010在009后增量执行，建立三种可玩规则的独立数据快照和一份经典图foundation目录；游戏函数从对局保存版本取数据。新私有函数没有新增玩家权限，原房间不更新。当前应用必须安装010，修订号要求10；上方008／009段落保留阶段历史，不作为当前就绪标准。经典图地点、水域、环境与选角仍未激活。见[阶段1验证](../docs/p2-stage1-validation.md)。

## 011阶段历史：地点内部规则

完整010之后执行011；旧规则和房间不改，经典目录解除lemon冲突并记录帝汶随从／操场。已增加地点内部函数和接入钩子，但没有客户端新指令，水域及环境还待答复。当前应用就绪要求修订11及locationDataReady=true，classicPlayable仍false。见[阶段2记录](../docs/p2-stage2-locations-validation.md)。上方010段落保留历史标准。

## 当前候选：012经典地图完整阶段2

在完整011之后执行012；旧三个版本目录及现有房间行保持不变。新开联机局使用v0.1.4，当前4角色／64实体牌，飞船与通校沿用鉴权的ml_room游戏意图，不新增公开RPC或随机注入入口。水域选择10秒，超时代弃最小实体ID；手牌上限弃牌仍20秒。环境按地区、整轮末结算，可护盾挡，无12轮强制结束。012同事务失败回滚与重复执行已验证，详见[阶段2验证](../docs/p2-stage2-validation.md)。部署及真人验收尚未执行。

## 013选角基础（未开放房间选角）

013要求完整012，只添加私有DraftState函数，不改房间行、四个规则profile、公开RPC和新局默认版本，活动health仍修订12／v0.1.4。完整增量打包脚本已包含005—013，但尚未生成或部署新的完整包。候选、随机源及回执均属于私有状态；目前尚未接入房间持久化与玩家入口。实际阵营表／中立分配和新角色完整技能确认并接通后，再完成新的房间开局迁移与就绪标准，不能把装入013视为16角色可玩。见[阶段三进展](../docs/p2-stage3-validation.md)。
