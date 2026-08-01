# Stage 5 确定性本地表现时间线

更新时间：2026-06-17

Stage 5 的目标是在 Stage 3 表现快照与 Stage 4 Spine 站位层之上，新增 **确定性本地表现时间线**。Cocos 使用 `serverSeed + battleNo + unitSnapshot` 派生本地事件序列，用于驱动画面上的接敌、攻击、伤害飘字、受击和 Buff 预览。本阶段不改变战斗胜负、结算、奖励或任何服务端状态。

## 阶段目标

- 新增 `LobbyBattlePresentationTimeline.ts`，从 `BattlePresentationSnapshot.unitSnapshotKey` 生成 45-60 秒本地事件列表。
- 事件类型覆盖 `battle_start`、`unit_spawn`、`round_start`、`action_start`、`idle`、`target_mark`、`damage_preview`、`hit_react`、`buff_preview`、`round_end`、`battle_end`。
- 同一 `serverSeed + battleNo + unitSnapshot` 必须得到同一 `timelineKey`、事件顺序、伤害预览数值和 Buff 预览。
- `LobbyBattlePreviewPanelRenderer` 新增 `LobbyBattleTimelineEventRail`，展示当前事件、事件标记和 `timelineKey`。
- 命中层 `LobbyBattleDamageText` 和 Buff 托盘改为读取时间线事件，不再依赖固定硬编码数字。

## 阶段边界

- 只用于表现。
- 不作为结算权威。
- 不新增后端接口。
- 不新增 SQL。
- 不新增表结构或字段。
- 不改 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle` 契约。
- 不提交本地伤害、治疗、Buff、胜负推导、奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力。
- 不新增经济写入口。
- 不自动播放 Stage 2 音频；时间线事件仅保留表现 cue，后续音频阶段再接。
- 不开放 EX V1、背包 `use/sell/batch-use`、英雄 `star-up/awaken/refine`、补发、重结算、重复刷关经验/掉落、扫荡、副本、Boss 或排行奖励。

## 实现说明

- `createTimelineSeed()` 对 `snapshot.unitSnapshotKey` 做稳定 hash，`nextDeterministicTimelineFloat()` 使用本地 LCG 生成可复算随机数。
- `resolveLobbyBattlePresentationTimeline()` 会生成固定 3 回合、总时长 45-60 秒的事件序列，并按 `timeMs` 与 `seq` 排序。
- 时间线事件只包含表现字段：时间、回合、事件类型、演员、目标、展示文案、展示数值、动画名和音效 cue。
- `timeline.currentEvent`、`timeline.damagePreviewEvent`、`timeline.buffPreviewEvent` 供当前静态预演 UI 消费；后续阶段可把这些事件映射到 Spine 移动、攻击、受击、回血和辅助技能动画。
- `BattlePresentationSnapshot` 仍是唯一输入来源；Cocos 不额外请求服务端，不写入任何经济或关卡状态。

## 多角色验收

产品验收：

- 战斗页从“固定几句演出文案”升级为可复算事件序列。
- 玩家能看到当前事件轨、事件时间点、伤害飘字和 Buff 预览，但不会被误导为客户端结算。

策划验收：

- 时间线事件符合 Stage 1 战斗 V1：开战、入场、回合、行动、目标、伤害预览、受击、Buff 预览和结束。
- 伤害/Buff 数值是演出预览，不进入结算、不影响胜负、不影响奖励。

UI 验收：

- `LobbyBattleTimelineEventRail` 放在战斗场景顶部时间条下方，尺寸收敛，不覆盖 Boss 血条、站位、战斗日志或底部按钮。
- 命中飘字增加事件说明，Buff 托盘显示当前 Buff 预览值。

DB 设计验收：

- 本阶段不新增表、不新增字段、不新增 SQL。
- 若未来要做服务端权威战报、敌方 Spine、技能配置或逐帧回放，应另开 DB/API 设计阶段。

开发验收：

- 确定性算法集中在 `LobbyBattlePresentationTimeline.ts`。
- 渲染器只消费时间线事件，不修改 battle start/settle 请求体。
- helper 中禁止出现接口调用、经济字段或结算提交结构。

测试验收：

- `npm.cmd run check:battle-stage5` 必须通过。
- `check:battle-stage1` 至 `check:battle-stage4`、`check:layout`、`check:preview` 必须继续通过。
- 定向 TypeScript no-emit 必须覆盖新增 helper 与战斗渲染器。

## 验收命令

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage1
npm.cmd run check:battle-stage2
npm.cmd run check:battle-stage3
npm.cmd run check:battle-stage4
npm.cmd run check:battle-stage5
npm.cmd run check:layout
npm.cmd run check:preview
git diff --check
```
