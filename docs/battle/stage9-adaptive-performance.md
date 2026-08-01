# 可视化战斗 Stage 9：适配与性能

更新时间：2026-06-17

## 阶段目标

Stage 9 完成战斗页的视口适配与低性能降级，让同一套可视化战斗在 `390x340`、`1280x720`、`1920x1080` 三类验收尺寸下都保持不遮挡、不越界、可读、可点击。

本阶段只处理 Cocos 表现层，不改变战斗权威结果，不新增后端接口，不新增 SQL，不新增经济写入口。

## 产品设计

- `1920x1080`：保持完整电影化表现，显示时间轴、战斗日志、结算流程面板、恢复提示、技能框、光环、飞行物和飘字。
- `1280x720`：保持标准战斗 HUD，优先保证单位、按钮、时间轴、日志与关键飘字可见。
- `390x340`：进入低性能降级，关闭非关键层，只保留背景、左右单位、Boss/边界提示、结果与底部操作按钮。
- 小屏下禁止为了展示特效挤压按钮和战斗主体；按钮区、返回入口、结算状态必须可点击。

## 策划边界

- 适配档位只影响动画层级和视觉密度，不影响胜负、伤害、治疗、Buff、回合、战力、奖励或主线进度。
- 本地时间线仍只用于演出；真实结算仍以后端回执为准。
- 低性能降级不降低关卡难度，也不改变玩家可挑战条件。

## 开发实现

- 新增 `LobbyBattleAdaptivePerformance.ts`：
  - 输出 `BattleAdaptivePerformanceProfile`；
  - 根据视口、战场尺寸、单位数量和时间线事件数量计算 `cinematic / balanced / compact / minimal`；
  - 统一控制 `showTimelineRail / showBattleLog / showStage8Panel / showRecoveryBanner / showAssistAuras / showProjectiles / showFloatingText / showSkillBar`；
  - 输出 `motionScale / frameBudgetMs / nodeBudget / maxVisibleUnits / maxFloatingTexts`；
  - `assertBattleAdaptivePerformanceBounds()` 检查不遮挡、不越界风险。
- `LobbyBattlePreviewPanelRenderer` 消费 `resolveBattleAdaptivePerformanceProfile()`：
  - `minimal` 档禁用动态火焰 Tween、特效层、飘字层、日志、Stage 8 侧面板和技能框；
  - `balanced/cinematic` 档保持已有 Stage 1-8 表现；
  - 小屏只显示 `LobbyBattleStage9PerformanceBadge` 与 `LobbyBattleStage9ViewportGuard`，用于提示当前轻量表现状态。

## 接口与 DB

- 不新增后端接口。
- 不新增 SQL。
- 不新增表结构。
- 不新增经济写入口。
- 战斗写入仍只允许：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`

## 验收

可复跑守卫：

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage9
```

验收重点：

- `390x340`：低性能降级开启，时间轴/日志/Stage 8 侧面板/光环/飞行物/飘字/技能框关闭，按钮不遮挡、不越界。
- `1280x720`：标准战斗 HUD 可读，时间轴、日志、飞行物和飘字仍可见。
- `1920x1080`：完整电影化表现可见，Stage 8 结算面板与恢复提示不遮挡战斗主体。
- Preview freshness 必须包含 `LobbyBattleAdaptivePerformance.ts`、`resolveBattleAdaptivePerformanceProfile`、`LobbyBattleStage9PerformanceBadge`、`LobbyBattleStage9ViewportGuard`。

## 红线

- 不开放 EX V1。
- 不开放 gacha exchange/reissue。
- 不开放背包 use/sell/batch-use。
- 不开放升星、觉醒、精炼。
- 不开放后台补发、重结算或离线结算。
- 不把本地表现时间线作为奖励、体力、进度、掉落或战斗结论依据。
