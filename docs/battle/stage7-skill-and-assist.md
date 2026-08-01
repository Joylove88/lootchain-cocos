# Visual Battle Stage 7：技能与辅助

## 目标

Stage 7 在 Stage 5 本地时间线和 Stage 6 动作 cue 基础上，补齐技能与辅助表现：技能动画、治疗、护盾、Buff、Debuff。

本阶段继续以表现优先，规则简化。Cocos 只从 `buff_preview` 事件派生本地辅助 cue，不改变后端权威战斗结果。

## 实现

- 新增 `LobbyBattleAssistPresentation.ts`，把 `buff_preview` 转换为 `skill_cast/heal_float/shield_float/buff_float/debuff_float`。
- 战斗页新增 `LobbyBattleAssistAuraLayer`，显示施法连线、技能光环、护盾/Buff/Debuff 图标。
- 战斗页新增 `LobbyBattleAssistFloatingTextLayer`，显示治疗、护盾、Buff、Debuff 飘字。
- 当前辅助 cue 会让施法者优先播放 `skill_01`，治疗和护盾目标优先使用技能动画兜底，Debuff 目标使用 `hit` 兜底。
- C1812 资源复用 Stage 2 的 `buffAttackUp/buffShield/buffDefenseDown`；治疗使用绿色飘字和本地图形光效，不新增素材依赖。
- 当当前事件是 `buff_preview` 时，压制旧伤害闪烁层，避免治疗/护盾表现和掉血表现同时出现。

## 边界

- 只用于表现，不提交治疗或护盾到服务端。
- 不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 不新增战斗 AI、技能公式、服务端战报或本地胜负推导。
- 不改变 `durationSeconds/roundCount/clientChecksum` 的结算语义。
- 战斗写入仍只允许：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- 客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff 或 Debuff 字段。

## 验收

- `npm.cmd run check:battle-stage7` 校验 helper、渲染层、文档、Preview freshness token 和本地 cue 确定性。
- `npm.cmd run check:battle-stage1` 至 `npm.cmd run check:battle-stage7` 应连续通过。
- `npm.cmd run check:layout` 应继续通过。
- `npm.cmd run check:preview` 应能确认 Preview 不是旧脚本。
- Cocos Preview 中战斗预览应能看到施法光环、治疗飘字、护盾飘字、Buff 飘字和敌方 Debuff 飘字；不能出现新增后端写入。
