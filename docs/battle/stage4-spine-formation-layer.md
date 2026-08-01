# Stage 4 Spine 单位站位层

更新时间：2026-06-17

Stage 4 的目标是在 Stage 3 的表现快照与静态战斗场景骨架上，接入首版 **Spine 单位站位层**。本阶段只把我方英雄的已配置 Spine 资源放入战斗站位，提供基础待机表现和受击兜底，不实现本地战斗 AI、完整时间轴、技能释放、伤害结算或经济逻辑。

本文中的“不新增”均指 Stage 4 本轮增量；此前已批准并完成的年度主线真实首通、召唤真实 draw 和英雄 `level-up` 边界继续按各自阶段文档生效，本阶段不回滚也不扩大它们。

## 阶段目标

- 新增 `LobbyBattleUnitSpineRuntime.ts`，集中处理战斗单位 Spine 资源路径、UUID、动画名、缩放和镜像。
- `LobbyBattlePreviewPanelRenderer` 在每个战斗 actor 内尝试渲染 `LobbyBattleActorSpineNode`。
- 我方英雄优先使用只读英雄队列里的 `spineAsset/spineUuid`，资源路径为 `spine/hero/{asset}/{asset}`。
- 没有 Spine、加载失败或运行时解析失败时，保留 `LobbyBattleActorSpineFallbackSilhouette` 暗色剪影，保证站位不空白。
- 敌方当前没有专属 Spine 配置，继续使用 `LobbyBattleEnemyStandin` 通用 stand-in，不虚构敌方资源。
- Spine 动画名优先识别 `idle`，同时为后续阶段记录 `move/attack_01/skill_01/hit/death/victory` 兜底匹配。

## 阶段边界

- 不新增后端接口。
- 不新增 SQL。
- 不新增表结构或字段。
- 不改 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle` 契约。
- 不新增持久编队接口。
- 不提交本地伤害、治疗、Buff、胜负推导、奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力。
- 不新增经济写入口。
- 不自动播放 Stage 2 音频。
- 不开放 EX V1、背包 `use/sell/batch-use`、英雄 `star-up/awaken/refine`、补发、重结算、重复刷关经验/掉落、扫荡、副本、Boss 或排行奖励。

## 实现说明

- `resolveBattleUnitSpineResource(unit)` 只允许我方英雄读取 `spineAsset`，并限制资源名为 ASCII 字母、数字、下划线和短横线。
- `resolveBattleUnitSpineUuid(unit)` 只接受 36 位 UUID 字符串。
- `resolveBattleUnitSpineAnimationNames(data)` 从 Spine JSON/runtime 中匹配动画名；Stage 4 只循环待机，受击动画仅作为后续阶段可用兜底。
- `resolveBattleUnitSpineScale(...)` 按 actor 槽位大小自适应缩放，避免覆盖名称、职业徽章和血条。
- `resolveBattleUnitSpineMirrorScaleX(...)` 预留左右阵营镜像能力；当前敌方没有 Spine 时不会使用专属敌方资源。

## 多角色验收

产品验收：

- 战斗页从纯卡片/剪影推进到可展示英雄 Spine 的站位层。
- 缺资源时仍有可读站位，不会出现空白或误导性的敌方专属模型。

策划验收：

- 动画名识别符合 Stage 1 规范，后续可继续接入移动、普攻、技能、受击、死亡和胜利。
- 当前不生成战斗胜负和伤害结果，不影响主线推进和奖励。

UI 验收：

- Spine 只占 actor 左/右侧视觉位，名称、职业徽章、血条、目标框仍保持可读。
- 敌方使用通用 stand-in，与当前缺少敌方 Spine 配置的事实一致。

DB 设计验收：

- 本阶段不新增表、不新增字段、不新增 SQL。
- 后续如需服务端下发敌方 Spine、技能资源或权威事件，应另开 DB/API 设计阶段。

开发验收：

- Spine 资源解析逻辑集中在 helper 中，渲染器只负责加载、应用和兜底。
- 加载失败不会阻断战斗页，只回落到剪影。

测试验收：

- `npm.cmd run check:battle-stage4` 必须通过。
- `check:battle-stage1`、`check:battle-stage2`、`check:battle-stage3` 和 `check:layout` 必须继续通过。
- `check:preview` 需要 Cocos Creator Preview 正在 `localhost:7456` 运行；未启动时只能记录为环境缺口。

## 验收命令

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage1
npm.cmd run check:battle-stage2
npm.cmd run check:battle-stage3
npm.cmd run check:battle-stage4
npm.cmd run check:layout
npm.cmd run check:preview
git diff --check
```
