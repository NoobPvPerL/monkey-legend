> 后续状态：负责人要求暂不构建WorkBuddy包、不上传GitHub，已批准并完成C批本地开发验证，当前v14／修订25／20角色。C截图待补，见[C批验证](p3-batch-c-validation.md)。以下为A／B及土豆当时的记录。

# P3首批本地开发验证与截图

2026-10-19，应用候选0.3.2-p3.3／web-v0.1.13／schema2／engineRevision24；18角色、76种191实体。基线main584e6a0，工作区修改尚未提交。负责人批准范围及完整裁定见[p3-batch-ab-decisions.md](p3-batch-ab-decisions.md)，53条逐ID盘点见[p3-character-gap.md](p3-character-gap.md)。

本记录仅证明本地实现与开发验证。P2依负责人确认已经上线并真人验收结项；本批没有生产写入、正式build、WorkBuddy新包、独立包验证、GitHub上传或新阶段验收，不补造公网证据。

## 自动验证

| 验证 | 实际结果及证据 |
|---|---|
| 全量回归 | 84个文件，630／630通过；含历史规则、私密RPC、网关、幂等与整局。[最终完整报告](../artifacts/p3-batch-ab/full-regression-verified.json) |
| 最后兼容补充 | 6／6通过；新v13选角TS／SQL相等，024前后现存房间及回执原样保留，verify.sql所有_ready列均为true。[报告](../artifacts/p3-batch-ab/final-compatibility.json) |
| 类型／来源／SQL目录 | npm run typecheck、verify:data、verify:db-data、verify:catalog通过；187图与4份原始转录SHA-256一致；全部000—021和历史来源目录无改动 |
| 只读数据库核对 | verify.sql当前版本更新为v13、修订≥24，新增应豪／18角色／土豆就绪列；匿名／authenticated不能直接执行私有引擎，公共RPC权限保留 |
| 静态与交付准备 | git diff --check、打包脚本node --check通过；source／database元数据为v13／24／18，升级包将覆盖至024，增加21／22／23增量入口；尚未运行打包或独立包验证 |

测试在隔离PGlite中逐条比较TS与SQL完整state，不只比较伤害数值。新增专项：

- 应豪v10保留旧行为，v11起不参加猴子游戏；恶意混合目标整体原子拒绝、不扣费／耗牌／耗随机；结算兜底免疫、其他攻击及本人猴子游戏例外保持。冲撞合法陆地、水生上岸、谢bro、第三人占格及梅梅涛／边界拒绝覆盖；负责人要求暂按无已确认bug，不记作已修。
- 猴八外星攻击、多目标、油泼自伤、普通伤害、梅梅涛／谢bro、土豆／眼镜上限、护盾／无一骑等组合；实际身份及修正来源保留。
- 马懿队伍／FFA、同／邻地区、3AP、多次使用、生命上限／粥盛羊、美丽学子与XDF非食物边界、梅梅涛／谢bro免疫、非本人／低AP／过期／错阶段、计时不刷新。隔离真实public.ml_room调用验证错人、重试幂等、旧修订不重复扣费；公开协议拒绝客户端actor／state／费用／随机等可信字段。
- 021→022→023→024逐级事务失败回滚／重复执行、旧目录不变、旧身份／房间／回执保留；旧v1—v10继续TS／SQL一致，v10已开始选角完成后仍开v10。v12土豆范围保留；v13全图陆地／水域、普通入水弃牌、占格拒绝、封闭农场／地区封锁／坐骑禁水、实际失血存活、每整轮一次、放弃／超时不耗次数均对照。
- 4场完整191实体对局：当前v13、FFA／2v2各seed42／917，猴八／马懿与既有角色组合，逐指令对照至正常结算。

首轮完整回归617／625，7项因沙箱本地端口不可访问，1项历史修订21测试引用当前要求；保留该历史断言，改为显式修订21要求。随后沙箱外本机回归629／630，剩余为当前网关健康回执固定旧版本；更新为v13／24后630全过。原报告留存，不把初轮失败隐藏或解释为生产问题。所有本机网络验证仅127.0.0.1，无生产RPC。

## PC／手机截图

使用computer-use浏览器检查生产OnlineBoard组件，临时本地Vite审核夹具注入可控局面，仅向TS dispatch提交意图。权威SQL／公共RPC另由上述隔离测试证明；这些截图不是线上真人测试、手机硬件实测或生产连接证据。夹具位于Git忽略的.release-cache，无公开注入接口。

PC1280×720、手机视口390×844及360×640；两种手机尺寸均scrollWidth等于viewport、scrollHeight等于viewport，地图32格与手牌／操作区可见。手机治疗预览原被既有ordinary-actions>span规则隐藏，已改独立预览容器并限制高度，截图确认不产生长页。确认后马懿AP12→9，HP3→4，队友猴八HP2→3，技能不续时；土豆点r4c7后落位并打开10秒弃1张窗口。

| 场景 | 截图 |
|---|---|
| PC马懿确认前／后 | [预览](../artifacts/p3-batch-ab/pc-mayi-preview.jpg) · [结果](../artifacts/p3-batch-ab/pc-mayi-result.jpg) |
| 手机马懿 | [390×844](../artifacts/p3-batch-ab/mobile-mayi-preview.jpg) · [360×640](../artifacts/p3-batch-ab/mobile-small-mayi-preview.jpg) |
| PC土豆全图合法空格含水域 | [传送选择](../artifacts/p3-batch-ab/pc-potato-teleport.jpg) · [入水弃牌](../artifacts/p3-batch-ab/pc-potato-water-discard.jpg) |
| 手机土豆全图传送 | [390×844](../artifacts/p3-batch-ab/mobile-potato-teleport.jpg) |
| 猴子游戏目标界面 | [PC界面](../artifacts/p3-batch-ab/pc-monkey-targets.jpg)；应豪排除及非法意图以专项TS／SQL断言为准 |

静态冻结及文档链接审计见[最终审计](../artifacts/p3-batch-ab/final-audit.json)。下一步依负责人既定流程：先审核本页截图，通过后再正式构建并独立验证WorkBuddy包，之后上传GitHub。云端执行和新阶段验收另据明确授权与证据。
