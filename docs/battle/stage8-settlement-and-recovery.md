# Visual Battle Stage 8：结算与异常

## 目标

Stage 8 在 Stage 1-7 的可视化战斗表现基础上，补齐结算链路的可见状态与异常恢复提示：`start/settle` 幂等、断线、返回重进、失败兜底，以及以后端回执结算。
阶段验收口径使用纯文本描述为：start/settle 幂等、断线、返回重进、失败兜底、以后端回执结算。

本阶段不改变战斗结果规则。Cocos 只把现有 `LobbyBattlePanelState` 翻译成结算链路 UI，帮助玩家理解当前处于创建会话、演出、结算预留、提交中、已回执或异常恢复哪个阶段。

2026-06-19 接手战斗场景返修后，当前 Cocos 视觉验收流不再把“演出完成”解析成可点击的 `settle` 提交状态。`POST /api/player/battles/{battleNo}/settle` 契约保留给后续真实结算阶段，但本轮 Preview 验收只允许创建 battle session、播放战斗表现、返回大厅；不主动提交结算、奖励、体力或主线进度写入。

## 实现

- 新增 `LobbyBattleSettlementPresentation.ts`，把战斗状态解析为 `start_idempotent/session_ready/playback_complete/settle_idempotent/receipt_recorded/error_recoverable` 步骤。
- 战斗页新增 `LobbyBattleStage8SettlementFlowPanel`，展示创建会话、会话有效、演出完成、结算预留、回执记录等状态。
- 重复创建或重复提交时，链路面板显示 `LobbyBattleStage8IdempotencyBadge`，说明本地已拦截重复点击。
- 战斗页新增 `LobbyBattleStage8RecoveryBanner`，展示断线、返回重进、失败兜底的下一步提示。
- 回执状态通过 `LobbyBattleStage8ReceiptStatus` 展示，结果仍只来自后端 settle 回执。

## 边界

- 只用于表现和恢复提示，不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 不新增战斗 AI、服务端战报、重结算、补发、离线结算或客户端胜负推导。
- 不改变 `durationSeconds/roundCount/clientChecksum` 的结算语义。
- 战斗写入仍只允许：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- 客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff、Debuff 或任何结算明细字段。

## 验收

- `npm.cmd run check:battle-stage8` 校验 helper、渲染层、文档、Preview freshness token 和本地结算状态机确定性。
- `npm.cmd run check:battle-stage1` 至 `npm.cmd run check:battle-stage8` 应连续通过。
- `npm.cmd run check:layout` 应继续通过。
- `npm.cmd run check:preview` 应能确认 Preview 不是旧脚本。
- Cocos Preview 中战斗预览应能看到结算链路面板、重复点击拦截提示、异常恢复提示和后端回执状态；不能出现新增后端写入。
