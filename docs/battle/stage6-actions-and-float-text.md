# Stage 6 动作与飘字

更新时间：2026-06-17

Stage 6 的目标是在 Stage 5 确定性本地表现时间线之上，新增 **动作与飘字表现调度**。Cocos 根据同一份时间线事件生成近战移动、普攻、远程弹道、伤害飘字和受击飘字 cue；这些 cue 只用于画面表现，不改变战斗胜负、结算、奖励或任何服务端状态。

## 阶段目标

- 新增 `LobbyBattleActionPresentation.ts`，把 `action_start/damage_preview/hit_react` 转换为本地表现 cue。
- 支持 `melee_move`：前排/首领单位向目标方向短距离推进。
- 支持 `basic_attack`：近战单位在推进后播放普攻动画。
- 支持 `ranged_projectile`：后排单位在出手时生成远程弹道层。
- 支持 `damage_float`：伤害数值按目标锚点浮出。
- 支持 `hit_float`：受击提示按受击单位锚点浮出。
- `LobbyBattlePreviewPanelRenderer` 新增 `LobbyBattleActionProjectileLayer`、`LobbyBattleActionFloatingTextLayer` 和 `LobbyBattleMeleeAdvanceGhost`。
- 战斗单位 Spine 在当前 cue 对应时优先播放 `move/attack_01/skill_01/hit`，非循环动作结束后回到 `idle`。

## 阶段边界

- 只用于表现。
- 不提交伤害到服务端。
- 不作为结算权威。
- 不新增后端接口。
- 不新增 SQL。
- 不新增表结构或字段。
- 不新增经济写入口。
- 不改 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle` 契约。
- 不提交本地伤害、治疗、Buff、胜负推导、奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力。
- 不自动播放 Stage 2 音频；本阶段只保留 cue 上的音频标识。
- 不开放 EX V1、背包 `use/sell/batch-use`、英雄 `star-up/awaken/refine`、补发、重结算、重复刷关经验/掉落、扫荡、副本、Boss 或排行奖励。

## 实现说明

- `resolveBattleActionPresentationCues()` 只消费 `BattlePresentationTimeline` 与 `BattlePresentationSnapshot`。
- 前排和首领 `action_start` 生成 `melee_move` 与 `basic_attack`。
- 后排 `action_start` 生成 `ranged_projectile`。
- `damage_preview` 生成 `damage_float`。
- `hit_react` 生成 `hit_float`。
- `resolveVisibleBattleActionPresentationCue()` 根据当前时间线事件挑选当前应展示的 cue。
- 渲染器用 cue 驱动单位短位移、目标高亮、弹道线、飞行光点、伤害飘字和受击飘字。
- 敌方仍使用通用 stand-in；有英雄 Spine 的我方单位会优先播放当前 cue 对应动画，没有对应动画时回到 `idle`。

## 多角色验收

产品验收：

- 战斗页从“静态站位 + 时间线提示”升级为能看到接敌、远程弹道和飘字的可视化战斗场景。
- 玩家能理解当前单位正在出手、命中或受击，但不会看到任何客户端伪造奖励。

策划验收：

- 近战、后排远程、伤害和受击的第一版表现节奏符合 Stage 1 自动战斗规则。
- 伤害飘字来自 `damage_preview` 的演出值，仅供观感使用，不参与胜负或结算。

UI 验收：

- `LobbyBattleMeleeAdvanceGhost` 只作为短接敌残影，不遮挡血条和名称。
- `LobbyBattleActionProjectileLayer` 位于单位层之后、飘字层之前，能清楚表达后排出手。
- `LobbyBattleActionFloatingTextLayer` 按单位锚点显示，不覆盖底部按钮或结算回执。

DB 设计验收：

- 本阶段不新增表、不新增字段、不新增 SQL。
- 若后续要保存战报、逐帧回放或服务端权威战斗事件，需要另开 DB/API 设计阶段。

开发验收：

- 动作 cue 集中在 `LobbyBattleActionPresentation.ts`，渲染器只做消费。
- helper 中没有接口调用，也没有经济字段或结算提交结构。
- Cocos 仍只使用既有 start/settle 战斗写入。

测试验收：

- `npm.cmd run check:battle-stage6` 必须通过。
- `check:battle-stage1` 至 `check:battle-stage5`、`check:layout`、`check:preview` 必须继续通过。
- 定向 TypeScript no-emit 必须覆盖新增 helper 与战斗渲染器。

## 验收命令

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage1
npm.cmd run check:battle-stage2
npm.cmd run check:battle-stage3
npm.cmd run check:battle-stage4
npm.cmd run check:battle-stage5
npm.cmd run check:battle-stage6
npm.cmd run check:layout
npm.cmd run check:preview
git diff --check
```

## 2026-06-19 返修补充

- 近战位移不再按自身槽位做短距离挪动，而是按攻击者与目标锚点计算接敌距离，英雄向右、怪物/BOSS 向左移动到中场附近再返回。
- 新增 `LobbyBattleActionTargetSpineEffectLayer`：当当前 cue 是技能/远程表现时，会从施法者骨骼解析 `skill1_kz/skill2_kz/skill3_kz/skill4_kz`，并在目标区域播放；没有对应动画时显示本地法阵兜底。
- 伤害、受击、治疗、Buff/Debuff 飘字仍按时间线事件逐步出现，不一次性堆叠。
- 本补充仍只做前端视觉表现，不提交伤害、奖励、体力、进度或任何经济写入。
