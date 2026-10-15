# monkey-legend
应猴传说:高唐之战
初次上手请先阅读几个Markdown文件
此外优先解决Issues

## 开发资料

- [规则汇总](docs/rule.md)：已整合 Issue #1 最新澄清、众玩家讨论与作者更正，注明未决项。
- [规则裁定与来源](docs/rule-decisions.md)：逐项结论、旧信息替代轨迹与剩余问题。
- [开发方案](docs/网页游戏开发方案.md)与[进度计划](docs/plan.md)。
- [卡牌文字资料](docs/cards/README.md)：基础牌、角色牌、神牌、选修课共 153 种，含来源图片、完整能力、用户补充与待确认项。
- [P0 规则规格](docs/rules-spec.md)与[来源记录](docs/rule-decisions.md)。
- [地图与移动待标注表](docs/map-spec.md)：32 格编号完整，地形/区域/通行仍待确认。
- [首版候选与依赖](docs/mvp-scope.md)：4 个优先角色、2 个备选、12 种基础牌，均未正式启用。
- [图片素材台账](docs/assets-manifest.json)：187 张图片的固定 ID、SHA-256、原图及卡牌映射；独立于卡牌存储格式。
- [P0 核对与验收案例](docs/p0-acceptance-cases.md)：预期与待裁定场景，全部尚未运行游戏。

当前为 P0 资料与规则确认阶段，尚未开始游戏实现。[Issue #1](https://github.com/NoobPvPerL/monkey-legend/issues/1) 此批回答已登记，后续由 [#4 地图与移动](https://github.com/NoobPvPerL/monkey-legend/issues/4)、[#5 资源与天灾](https://github.com/NoobPvPerL/monkey-legend/issues/5)、[#6 结算与首版](https://github.com/NoobPvPerL/monkey-legend/issues/6) 跟进；资料文件齐全不等于 P0 通过。

最新普通通则：初始行动点5，整轮开始低于5才加3，否则不加，点数保留且无通用硬上限；首轮不补，之后仅当前人行动前抽2，自己行动结束后按 floor(当前血量) 自选弃牌。中立第4轮自由选方，插队计数、不要求人数均衡；细分结算顺序与首版方案仍待确认。
