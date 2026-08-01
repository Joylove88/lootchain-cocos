# Stage 3 战斗表现快照与场景骨架

更新时间：2026-06-17

Stage 3 的目标是把 Stage 1 冻结的可视化战斗规格、Stage 2 导入的 UI/音频资源，接入到现有 Cocos 战斗预演页中，形成可继续扩展的 **表现快照 + 静态战斗场景骨架**。本阶段仍不实现完整战斗 AI、技能时间轴、伤害结算或新经济逻辑。

## 阶段目标

- 新增 `LobbyBattlePresentationSnapshot` 数据适配层。
- 将 `battle start` 回执、只读英雄列表和敌方预览合并成表现快照。
- 战斗页消费表现快照渲染左右阵营、前后排标记、Boss 血条、目标框、命中装饰和 Buff 托盘。
- 复用 Stage 2 导入的 C1812 资源：
  - Boss 血条框/填充；
  - 技能目标框；
  - 命中/地面冲击装饰；
  - 攻击提升、防御降低、护盾、眩晕 Buff 图标；
  - 战斗 BGM/SFX 路径作为后续音频 cue，不在本阶段自动播放。
- 新增 `check:battle-stage3` 守卫，确保快照层、资源路径、渲染接入和文档边界没有漂移。

## 阶段边界

- 不新增后端接口。
- 不新增数据库表或 SQL。
- 不改 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle` 契约。
- 不新增持久编队接口。
- 不提交本地伤害、治疗、Buff、胜负推导、奖励、掉落、体力、主线进度、货币、背包或英雄属性。
- 不新增经济写入口。
- 不开放 EX V1、背包 `use/sell/batch-use`、英雄 `star-up/awaken/refine`、补发、重结算、重复刷关经验/掉落、扫荡、副本、Boss 或排行奖励。

## 表现快照

新增文件：

- `assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts`

输入：

- `LobbyBattlePanelState.start.lineup`
- `LobbyBattlePanelState.start.enemyPreview`
- `LobbyBattlePanelState.start.serverSeed`
- `LobbyBattlePanelState.start.battleNo`
- 只读英雄队列 `LobbyHeroItemVO[]`

输出：

- `BattlePresentationSnapshot.stageCode`
- `BattlePresentationSnapshot.battleNo`
- `BattlePresentationSnapshot.serverSeed`
- `BattlePresentationSnapshot.readonlyEconomy`
- `BattlePresentationSnapshot.guardrails`
- `BattlePresentationSnapshot.allies`
- `BattlePresentationSnapshot.enemies`
- `BattlePresentationSnapshot.leadAlly`
- `BattlePresentationSnapshot.leadEnemy`
- `BattlePresentationSnapshot.unitSnapshotKey`
- `BattlePresentationSnapshot.stage2UiAssets`
- `BattlePresentationSnapshot.stage2AudioCues`

`unitSnapshotKey` 使用 `serverSeed + battleNo + unitSnapshot` 形成后续确定性表现时间轴的输入锚点。本阶段只生成锚点，不用它推导真实胜负或奖励。

## 静态战斗场景骨架

本阶段在 `LobbyBattlePreviewPanelRenderer` 中接入：

- `renderStage3BattleSceneSkeleton`
- `renderBossGauge`
- `renderBattleBuffTray`
- `LobbyBattleSkillTargetFrame`
- `LobbyBattleHitBurstSprite`

UI 表现：

- 左侧展示我方队伍，右侧展示敌方/Boss。
- 单位显示前排/后排/首领定位。
- 当前敌方目标显示 C1812 目标框。
- 战斗进行中显示命中装饰与伤害飘字。
- Boss/主敌方显示独立 Boss 血条。
- 战斗进行中显示 Buff 图标托盘。

## 多角色验收

产品验收：

- 当前阶段从“弹框式战斗预演”推进为“全屏战斗场景骨架”。
- 玩家能看到左右阵营、目标、Boss 血条和战斗状态，但不会误以为客户端在发奖。

策划验收：

- 快照已包含前排/后排/首领分类，可支撑后续近战移动、远程攻击、辅助技能和 Boss 行为。
- `unitSnapshotKey` 可作为 Stage 5 本地确定性时间轴输入。

UI 验收：

- 使用 C1812 已导入资源，不再只依赖纯 Graphics。
- Boss 血条、目标框、Buff 图标和命中装饰都接到战斗页。
- 窄屏下允许隐藏 Boss 血条，优先保证单位与按钮不重叠。

DB 设计验收：

- 本阶段不新增表、不新增字段、不新增 SQL。
- 后续如需服务端权威战斗事件，应另开独立 DB/接口设计阶段。

开发验收：

- 渲染器不再直接拼 `lineup/enemyPreview`，而是消费表现快照。
- Stage 2 资源路径集中在通用资源常量和快照 cue 中，便于后续替换。

测试验收：

- `npm.cmd run check:battle-stage3` 必须通过。
- `npm.cmd run check:battle-stage1`、`check:battle-stage2` 和 `check:layout` 必须继续通过。
- `check:preview` 需要 Cocos Creator Preview 正在 `localhost:7456` 运行；未启动时只能记录为环境缺口。

## 验收命令

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage1
npm.cmd run check:battle-stage2
npm.cmd run check:battle-stage3
npm.cmd run check:layout
npm.cmd run check:preview
git diff --check
```

