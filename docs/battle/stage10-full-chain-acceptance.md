# 可视化战斗 Stage 10：全链路验收

更新时间：2026-06-17

## 阶段目标

Stage 10 完成 Cocos 可视化自动战斗 V1 的全链路验收，验收路径为：

`冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读`

本阶段是聚合验收阶段，不新增后端接口，不新增 SQL，不新增经济写入口，不触发真实战斗写入。

## 产品验收

- 冒险页可以从推荐主线关卡进入本地一次性编队。
- 编队页展示目标关卡、当前阵容战力、推荐战力和差距。
- 战力达标时可以进入战斗表现页；战力不足时引导英雄升级。
- 战斗表现页覆盖 Stage 1-9 的场景、站位、Spine、时间线、动作、技能、结算提示和适配降级。
- 结算完成后返回大厅时，Cocos 通过回读大厅、冒险、英雄和背包展示后端权威结果。

## 策划验收

- 战斗仍是主线 PVE 自动战斗第一版。
- 本地表现时间线只用于视觉，不作为胜负、奖励、体力、进度或掉落依据。
- 不改变年度主线难度曲线，不增加每日次数控制，不增加体力卡点。
- 低性能降级只降低表现密度，不降低关卡难度。

## UI 验收

- 战斗页保持全屏逻辑场景，不退回小弹窗战斗。
- `390x340`、`1280x720`、`1920x1080` 下均不遮挡、不越界。
- 小屏可进入轻量表现，保留核心战场和按钮。
- 结算状态、异常恢复和返回大厅入口必须可读、可点击。

## 开发验收

- `LobbyAdventurePanelRenderer` 保留 `LobbyAdventureFormationButton` 到编队入口。
- `LobbyFormationPanelRenderer` 只确认本次 `battle start` 阵容，不保存长期队伍。
- `LobbyBattleFlow` 仍只调用：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- `LootChainGameRoot.returnToLobbyFromBattlePreview()` 后调用 `refreshLobbyReadonlyStateAfterBattle()`，回读冒险、背包和英雄。
- `LobbyBattlePreviewPanelRenderer` 消费 Stage 3-9 表现 helper，不提交任何奖励、体力、进度、货币、背包、英雄属性、伤害、治疗、护盾或 Buff 字段。

## 测试验收

可复跑聚合守卫：

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage10
```

该守卫会校验：

- Stage 1-9 守卫仍可运行；
- `check:layout` 仍通过；
- 冒险、编队、战斗、结算、回读关键代码 hook 未断；
- Stage 10 文档和后端交接记录齐全；
- `LobbyBattleFlow` 不合成奖励、货币、体力、进度或背包结果。

完整人工/自动验收还需要额外运行：

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:preview
```

浏览器只读验收：

- 加载 `http://localhost:7456/`；
- 检查页面不是 Cocos Error 页；
- 检查 canvas 正常挂载；
- 检查控制台无新增 error；
- 视口覆盖 `390x340`、`1280x720`、`1920x1080`。

## 红线

- 不触发真实战斗写入。
- 不点击开始战斗或提交结算做验收，除非用户明确批准一次真实写入。
- 不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 不开放 EX V1。
- 不开放 gacha exchange/reissue。
- 不开放背包 use/sell/batch-use。
- 不开放升星、觉醒、精炼。
- 不开放后台补发、重结算或离线结算。
