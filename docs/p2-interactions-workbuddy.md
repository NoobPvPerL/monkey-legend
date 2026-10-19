> 阶段状态更新（2026-10-19）：负责人已确认上线与真人验收，P2正式完成。当前结论见[P2结项记录](p2-closeout.md)，后续见[P3交接](p3-handoff.md)。以下正文保留该批次当时的版本、待部署及待验收状态；其中旧的未结项结论已由本次确认替代，未实施功能仍以[P3待办](p3-backlog.md)为准。

# 第二批本地候选版与 WorkBuddy 升级交接

日期：2026-10-16。候选 `0.2.1-p2.2` / schema 2 / [web-v0.1.2](web-rules-v0.1.2.md)。此次没有操作线上实例、云数据库或 GitHub 发布。

本次含移动结束扣费、聊天/弹幕、完整手牌观战、骰子/发牌动画；以及 Issue #13 新增的群体搏击操、头锤全部吸收、弃牌20秒、成功主动出牌立即重置60秒、地区配色。第一批布局及隐藏滚动条要求一并保留。

## 数据库包

命令：`node tools/package-database.mjs interactions-upgrade-final --upgrade`。产物 `releases/monkey-legend-0.2.1-p2.2-database-interactions-upgrade-final/` 含 005、006、007 三个增量迁移、单语句事务安装、标准事务安装、只读验证、README 和 SHA-256 manifest。

`manifest.sourceDirty=true`：这是工作区 SQL 候选包，来源提交标识原基线，准确内容由文件 SHA-256 标识。完整应用工具要求干净、已提交源码；本轮没有生成正式源码包或 Release。正式部署须先确定并提交审阅后的源码，再生成完整应用包。

## 实际切换

1. 先在独立测试应用/数据库验证；管理者保存目标数据库快照及旧应用包。已有 schema 1 只执行增量包，不重新执行 000—004。
2. 选 `install-one-statement.sql` 或标准事务 `install.sql` 之一，以管理者运行；失败整体回滚。执行只读 `verify.sql`：健康版本为2，五个公开RPC可调用，私有schema/表/函数不可直读。
3. 配套新源码应用，原公开 publicConfig、单 PORT、`npm ci && npm run build`、`npm start`。旧网关要求schema1，新网关要求schema2，须协调切换；中间 `/ready` 503 属版本不配套，不能长期混用。数据回滚使用快照并配套旧应用，不手工降级函数。
4. 隔离环境复验四玩家+观众、双向聊天、三敌人群体牌、头锤、20秒弃牌、出牌重置、新旧移动、同码再开、接管和进程恢复。`verify:cloud-database` 覆盖基础云端双模式/隐私/恢复，不替代新增功能实测。
5. 返回公开配置路径及实际报告即可，不发送管理员密钥、连接串或真实玩家凭据。新增云SDK RPC、手机触控、跨网络和真人试玩待该阶段验收。

旧局继续旧规则；新开联机局使用新版，原房间成员、房间码及观众保留。闭房拒绝旧凭据，同码新房独立roomId，不继承旧聊天。

验证见 [第二批验证](p2-interactions-validation.md)，SQL权限/清理见 [数据库说明](../database/README.md)。本文件不代表已向WorkBuddy发消息或执行上线。


2026-10-16源码补交：负责人要求向WorkBuddy提供完整源码包，本次建立本地检查点并交付配套源码/SQL包。准确sourceCommit及包验证以产物manifest和独立报告为准，见 [源码交付说明](p2.2-source-handoff.md)。此前“尚未提交”等表述记录打包前状态；本次仍未推送GitHub或更新线上。
