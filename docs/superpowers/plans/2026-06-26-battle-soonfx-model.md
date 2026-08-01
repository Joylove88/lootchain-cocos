# Battle SoonFx Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 SoonFx 风格的数值模型边界替换旧战斗表现中的临时位移补丁，消除近战瞬移、回原位和死亡目标继续受击问题。

**Architecture:** 战斗仍不改后端协议，不新增经济写入口。前端以本地战斗事件模型生成行动、命中、血量和死亡事件；Cocos 渲染器只消费事件和连续时间位置，不再在攻击态临时重算起点或回家点。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript、本地 Playwright 验收、SoonFx 外部模型作为数值/事件分层参考。

---

### Task 1: 固定战斗模型边界

**Files:**
- Modify: `D:\project\lootchain-cocos\assets\scripts\scenes\lobby\LobbyBattleReplayModel.ts`
- Create: `D:\project\lootchain-cocos\scripts\check-battle-soonfx-model.mjs`
- Modify: `D:\project\lootchain-cocos\package.json`

- [ ] 保留现有 `resolveBattleReplay()` 作为唯一前端数值事件入口。
- [ ] 守卫要求模型继续输出 `hitEvents/hpBefore/hpAfter/killed/deadAtMs`。
- [ ] 守卫要求死亡单位不再被 `selectBattleReplayTarget()` 选中。

### Task 2: 攻击运动连续化

**Files:**
- Modify: `D:\project\lootchain-cocos\assets\scripts\scenes\lobby\LobbyBattlePreviewPanelRenderer.ts`

- [ ] 为每个 `unitKey + cueKey` 缓存 root motion 起始坐标。
- [ ] 新行动开始时从上一帧实际坐标插值，不从 slot home 重新开始。
- [ ] 近战命中后保持在接触点，直到下一个行动事件驱动移动。
- [ ] 禁用旧的全员 idle-clash 混战循环，避免视觉假打。
- [ ] 禁用第二套 front charge 固定冲锋线，只保留开场汇合和行动级接敌。

### Task 3: 验收守卫

**Files:**
- Modify: `D:\project\lootchain-cocos\scripts\screenshot-battle-center-convergence.cjs`
- Create: `D:\project\lootchain-cocos\scripts\check-battle-soonfx-model.mjs`

- [ ] 静态守卫检查运动起点缓存、接触点保持、禁用旧混战、死亡过滤和血量事件。
- [ ] 视觉脚本继续采集 `maxContinuousFrameDelta/maxFrameSpeed/deadTargetSelectedActionCount/hpDropCueMismatchCount`。

### Task 4: 验证

**Commands:**
- `npm.cmd run check:battle-soonfx-model`
- `npm.cmd run check:battle-stage14-real-combat`
- `npm.cmd run check:battle-phase-a-impact`
- `npm.cmd run check:layout`
- `npm.cmd run screenshot:battle-center`（需要 Cocos Preview 与后端可用）

**Acceptance:**
- 近战单位从当前位置跑到目标面前再攻击。
- 攻击后不回原始站位。
- 死亡目标不再被后续行动选中。
- 血条只在命中帧后按 `hpBefore -> hpAfter` 扣减。
- 静态守卫全部通过；Preview 可用时视觉脚本无瞬移失败项。
