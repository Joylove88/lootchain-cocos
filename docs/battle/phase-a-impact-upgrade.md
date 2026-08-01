# 战斗 Phase A 打击反馈升级

更新时间：2026-06-23

## 目标

本阶段只升级 Cocos 战斗表现层，不修改现有战斗结算逻辑、不修改后端协议、不开放 `/api/player/battles/{battleNo}/settle`，也不新增任何奖励、体力、进度、货币、背包或英雄成长写入口。

Phase A 目标：

- 近战单位先通过 `melee_move/run` 到达目标接触点，再播放 `basic_attack`。
- 命中帧同步触发目标受击后仰、Hit Stop、Slash VFX 和伤害飘字。
- 暴击命中触发更大的暴击飘字、红金色样式和 Screen Shake。
- 伤害飘字与 Slash/Hit Stop 使用同一个 `damage_float` cue，不允许提前批量显示。
- 所有新增表现受现有 transient layer 清理和性能档位约束。

## 代码改动清单

- `assets/scripts/scenes/lobby/LobbyBattleImpactDirector.ts`
  - 新增纯表现计算模块，输出 `hitStopMs`、`screenShake`、`defenderRecoil`、`slash`、`floatingText`。
- `assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts`
  - `BattleActionPresentationCue` 增加 `isCritical`，从 timeline event 透传到渲染层。
- `assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts`
  - 本地表现时间线增加 `critical` 字段；第一轮我方伤害固定提供暴击验收样本，后续反击按确定性随机补充。
- `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`
  - 消费 `resolveBattleImpactProfile()`。
  - `damage_float` 时增强目标后仰。
  - `renderActionFloatingTextLayer()` 支持暴击字号、颜色和 pop scale。
  - `renderImpactLayer()` 支持命中点 Slash VFX、Hit Stop overlay 和暴击 Screen Shake。
  - 新增 `recordBattleImpactTelemetry()`，供 Playwright 验收命中同步和暴击反馈。
- `scripts/check-battle-phase-a-impact.mjs`
  - 新增 Phase A 静态守卫，检查 Impact Director、renderer 接入、暴击/震屏/Hit Stop/Slash/Playwright 遥测 token。
- `scripts/screenshot-battle-center-convergence.cjs`
  - Playwright 验收新增 `impactSamples`、`criticalImpactSamples`、`hitStopSampleCount`、`screenShakeSampleCount`、`slashSampleCount`、`criticalFloatingTextSampleCount`、`damageFloatImpactSyncMaxDelta`。
- `scripts/repair-preview-phase-a-impact.mjs`
  - 本地 Cocos Preview 旧 chunk 专用修复脚本。只修 `temp/programming/.../targets` 临时预览产物，源代码仍以 TypeScript 文件为准。
- `scripts/check-battle-stage13r.mjs`
  - 同步当前辅助技能 resolver 与 preview freshness 禁用旧 `blood_deco` token 的检查方式。
- `scripts/check-battle-stage13i.mjs`
  - 聚合守卫纳入 `check-battle-phase-a-impact`。
- `package.json`
  - 新增 `check:battle-phase-a-impact`、`repair:preview-phase-a-impact`。

## 新增模块结构

```text
LobbyBattleImpactDirector
  resolveBattleImpactProfile(cue, scale)
    -> hitStopMs
    -> screenShake
    -> defenderRecoil
    -> slash
    -> floatingText
  isBattleImpactCritical(cue)
```

该模块是纯前端表现模块，不读取或写入后端战斗结果。

## Timeline / Cue 调整

- `LobbyBattlePresentationTimeline` 的 `damage_preview` 增加 `critical?: boolean`。
- `LobbyBattleActionPresentation` 的 `damage_float` cue 增加 `isCritical`。
- `melee_move` 继续负责接敌跑动。
- `basic_attack` 继续负责目标前接触攻击窗口。
- `damage_float` 成为唯一命中帧表现锚点：
  - 目标后仰；
  - Hit Stop；
  - Slash VFX；
  - 伤害飘字；
  - 暴击时 Screen Shake。

## 新增 VFX 素材列表

本阶段未新增外部 PNG/Spine/音效素材，先使用 Cocos `Graphics` 绘制轻量 VFX：

- `LobbyBattleImpactSlashLayer`：命中斩击线。
- `LobbyBattleImpactHitStopLayer`：短白/金色命中停顿闪层。
- 暴击 Screen Shake：对战场根节点做短位移并回正。
- 暴击飘字：沿用 Label，放大字号、红金色、pop scale。

后续如进入 Phase C/D，可再从 `C:\Users\axian\Desktop\C1812-1` 和 `C:\Users\axian\Desktop\C1812音效` 筛选真实大招和环境粒子素材。

## 验收标准

- `POST /api/player/battles/start` 可以出现；`/api/player/battles/{battleNo}/settle` 必须为 `0`。
- 近战 `basic_attack` 必须有目标前 root motion，伤害出现时仍保持接触。
- `damage_float` 与 Slash VFX 的运行时同步差必须小于 `90ms`。
- 至少存在 Hit Stop、Slash、暴击飘字和暴击 Screen Shake 遥测。
- 同一视觉窗口 action 飘字最多 1 条，全局飘字窗口最多 2 条。
- transient floating/effect layer 不可长期堆积。

## Playwright 自动验收脚本

```bash
npm.cmd run screenshot:battle-center
```

当前验收输出：

- `battle start requests = 1`
- `settle requests = 0`
- `page errors = 0`
- `console errors = 0`
- `impactSampleCount = 13`
- `criticalImpactSampleCount = 4`
- `hitStopSampleCount = 4`
- `screenShakeSampleCount = 1`
- `slashSampleCount = 4`
- `criticalFloatingTextSampleCount = 1`
- `damageFloatImpactSyncMaxDelta = 3ms`
- `srRBasicAttackMedianDistance = 40.31`
- `maxActionFloatingTextsPerFrame = 1`
- `maxPersistentFloatingTextLayers = 1`

