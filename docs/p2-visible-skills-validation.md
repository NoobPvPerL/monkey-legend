2026-10-19后续状态：下文最新四项反馈已进入本地v0.1.10／修订21候选，见[p2-card-feedback-validation.md](p2-card-feedback-validation.md)。技能直显并入候选，尚未打新包或部署；下文为本批当时的验证与待修记录。

# 角色技能按钮直显：本地验收记录

日期：2026-10-18。负责人要求“把这些角色技能的按钮都拿出来，不要藏着”。本批仅修订操作区显示；应用0.2.7-p2.8、规则web-v0.1.9、数据库修订20保持不变。当前工作区包含此前手牌拖动／滚轮与完整牌效修订；已交付的hand-feedback ZIP是此前冻结快照，不包含本次按钮直显，不能据旧包声称本次已上线。

## 具体改动与兼容

- `apps/client/src/online.css`：取消手机普通操作按钮、选牌后的普通操作组及装备主动按钮的隐藏规则；角色方向选择直接显示，操作区随按钮行数分配高度。短屏同步压缩间距和地图格内布局，保留完整32格与手牌，无主页面纵向滚动。
- `apps/client/src/Stage3Controls.tsx`：JJ的“懒得喷”在本人可行动时直接展示，0AP及已选卡牌时保留；发动后原位禁用并显示本回合已发动。面包黏稠使用直显技能按钮样式。
- `apps/client/src/Stage4Controls.tsx`：转换肘击的撞飞方向使用独立技能控件样式，不被高级卡牌参数隐藏规则遮掉。
- `tests/p2/mobile-skill-controls.test.ts`：覆盖JJ零AP／已发动／选牌、方向控件、面包确认／取消及其他玩家回合／响应阶段的原有权限限制。

只改变现有合法操作的可见性，不提前开放未触发的被动技能，不修改费用、目标、伤害或窗口截止时间。原服务端、协议、存档和000—020迁移不变。

## 已完成验证

相关6文件30项测试全部通过，报告：[`ui-regression.json`](../artifacts/p2-visible-skills/ui-regression.json)。`npm run build`包含类型检查，构建通过。最终客户端产物为`index-DxvXWYeT.js`、`index-BrCGyrZd.css`；构建保留大于500kB分块提示。

浏览器使用本地合成对局、真实OnlineBoard及真实TS指令结算，不连接生产RPC；浏览器视口模拟不能代替真人手机验收。原始结果：[`browser-validation.json`](../artifacts/p2-visible-skills/browser-validation.json)。

| 检查 | 结果 |
|---|---|
| JJ，360×640，0AP且已选搏击操 | 懒得喷直接可见且可点击；发动成功后按钮禁用并保留 |
| PC，1440×900，0AP且已选搏击操 | JJ按钮直接可见且可用，32格完整，文档尺寸等于视口；[截图](../artifacts/p2-visible-skills/jj-pc-1440-selected.jpg)／[原始检查](../artifacts/p2-visible-skills/pc-validation.json) |
| 西帝汶，360×640，已选卡牌 | 声明移动方向直接可见、可选择 |
| 面包黏稠，360×640 | 发动、选择目标后的确认和取消均在操作区 |
| 牢大转换肘击 | 撞飞方向可见；实际提交成功：出牌者AP20→18、r1c2→r1c3，目标HP4→3、r1c3→r1c4 |
| 同时11个按钮，360×520／560／640、390×844 | 全部按钮在视口内，32格完整、格内元素无溢出；文档尺寸等于视口，无主页面纵向滚动 |

截图：[JJ选牌同屏](../artifacts/p2-visible-skills/jj-360-selected.jpg)、[西帝汶方向](../artifacts/p2-visible-skills/west-360-direction.jpg)、[面包操作](../artifacts/p2-visible-skills/bread-360-controls.jpg)、[牢大方向](../artifacts/p2-visible-skills/laoda-360-direction.jpg)、[多装备压力布局](../artifacts/p2-visible-skills/gear-heavy-390.jpg)。多装备截图用于布局核验，截图时本地时钟已结束，不作为技能成功结算证据。

## 最新反馈：下一批处理，尚未修复

负责人在本批期间追加“还有新的bug等会继续修复”，逐条登记，未混入本次UI修订：

1. 卫汶找你没有效果。
2. 紫檀木无法选择角色。
3. 教学楼只禁止躲避球，秀松苑只禁止猴子游戏；不能在两个地点同时禁止两者。这是负责人明确更正的预期，当前引擎尚未按此修改。
4. JJ主动技后，负责人表述的“下一回合”仅让攻击牌针对JJ，不影响所有卡牌；例如别人给自己回血不能给JJ回血。范围已明确；实施前应核对并明确持续期的回合边界，不擅自扩展。

此前应豪冲撞故障与猴子游戏免疫反馈仍待后续批次，诊断见[p2-hand-feedback-validation.md](p2-hand-feedback-validation.md)。下批先复现并提交具体文件、规则兼容方案和验收用例，再按负责人确认范围实施。未执行生产写入、上传GitHub或关闭Issue；P2仍未正式结项。
