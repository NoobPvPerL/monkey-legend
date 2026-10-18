# 0.2.7-p2.8交付与上传记录

2026-10-18。负责人已通过PC／手机单屏布局截图，批准先构建WorkBuddy包、随后上传GitHub。源码／SQL交付包已完成独立复验，源码已正常推送GitHub main，远端提交核对一致。旧0.2.5-p2.6／v0.1.7／修订18已经上线；本候选尚未部署生产。

## 交付文件

目录：`releases/monkey-legend-0.2.7-p2.8-exercise-workbuddy/`。

入口为该目录`PROMPT-TO-WORKBUDDY.md`，另含两个ZIP、018→20与019→20专用单语句SQL、`SHA256SUMS.txt`、`PACKAGE-VALIDATION.json`。完整操作及验收见[p2-exercise-workbuddy.md](p2-exercise-workbuddy.md)。保留旧0.2.6交付，不覆盖旧包。

| 文件 | SHA256 |
| --- | --- |
| monkey-legend-0.2.7-p2.8-online-source-exercise-workbuddy.zip | `7ed3e24d36717d88c494aa1d2e4bfa41ebe3c2c660676ceef6e5d77d532bad59` |
| monkey-legend-0.2.7-p2.8-database-exercise-workbuddy.zip | `cbeab446f029977ff51759c3faec461fd36984a7d2d634d14d3eb0296496eb1b` |
| UPGRADE-FROM-018-ONE-STATEMENT.sql | `51c891e389741c2594521b6029ce2fa20057b6c6f604689abc13dd6301d8d2ab` |
| UPGRADE-FROM-019-ONE-STATEMENT.sql | `d7594b5869afbc9e358fb1271599795f27a77f55962df1d794545674efc44ff5` |

## 来源及独立验证

源码基础提交`c8e26f04dc4060d6e8bb6169e74a98592e22ace7`，`sourceDirty=true`：显式工作区快照，包含本轮批准的修改，不冒充该基础提交的干净归档。源码与SQL共同快照为`7bd48effd13f105362ac22b6afa4458fc030f07fdf56586106802286d683d826`，657个源码／公开配置文件逐一校验。

实际ZIP独立解压后，离线锁定`npm ci --offline`、类型检查与生产构建通过。全新schema1→20、完整18→20、完整19→20均通过单prepared事务安装、重复执行、就绪／76种191实体、私有表及函数权限、旧profile与房间身份保留检查。独立构建服务以`.invalid`替代云端地址，health版本正确，入口、JS／CSS、92份素材可读，源码／配置／迁移404；没有生产RPC。

最终67文件560项测试零失败；目录、冻结迁移000—019、187原图与4原文档、32格15区地图校验通过。报告见`artifacts/p2-exercise/final-release-regression.json`、`final-release-checks.json`、`package-validation.json`与`archive-hashes.json`。

ZIP为构建时快照；本记录及外层报告补充打包后的独立复验和上传证据，不修改已经校验的ZIP。GitHub后续文档提交不能替换已交付ZIP哈希。

## 尚待验收

WorkBuddy云端升级、真实手机边缘返回、四人FFA与2v2完整真人局、恢复／回退证据尚待回传；西帝汶原失败现场尚未复现，需复测。PC／移动截图已通过不替代这些验收。P2仍未正式结项，Issue保持开启。

## GitHub上传回执

实现与交付提交：[`c61d4c77a12d5d4e60605d2b664c7a659fa932f8`](https://github.com/NoobPvPerL/monkey-legend/commit/c61d4c77a12d5d4e60605d2b664c7a659fa932f8)。正常推送成功后，git ls-remote所示main与本地HEAD一致；工作区干净。再次核对包内apps／packages／tests／tools／冻结迁移及锁文件，与已提交实现逐字节一致。随后只补充本条上传证据及摘要，不改变已审核代码或已校验ZIP。生产部署与Issue关闭均未执行。
