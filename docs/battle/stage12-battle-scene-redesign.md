# Visual Battle Stage 12 Battle Scene Redesign

更新时间：2026-06-17

## 目标

Stage 12 处理用户验收反馈：当前战斗场景太潦草，且旧音频异步回调可能在 UI 重绘后访问已销毁节点并报 `Cannot read properties of null (reading 'isValid')`。本阶段重做 Cocos 战斗表现层，并为怪物/BOSS 骨骼目录预留配置字段。

## 产品 / 策划口径

- 战斗场景重做为横版自动战斗结构：左侧英雄队伍、右侧怪物/BOSS，底部英雄卡牌队列，结算时显示胜负覆盖层。
- 英雄战斗骨骼对英雄配置表 `portrait_asset=act_*` 采用 act 资源优先，确保 R/SR 的 `run/skill0/skill1` 等战斗动画可播放；`spine_asset/npc_*` 仅作为非 act 资源或 act 缺失时的兜底。
- 2026-06-21 返修后，表现时间线第一个我方行动优先选择前排 R/SR `act_*` 英雄，近战流程为开场 `run` 汇合、行动 `run` 接敌、`skill0` 普攻、命中后飘伤害和 `hurt` 受击；辅助/技能 cue 使用 `skill1` 或旧 `skill_01` 映射。
- `SSR/UR` 英文骨骼与 `R/SR` 旧 `act_*` 骨骼尺寸差异很大，必须按稀有度 profile 和资源原始宽高限制缩放，避免占据半屏。
- 动画兼容两套命名：英文资源优先 `idle/run/atk/skill1/ult/hit/dead/victory`；旧资源兼容 `stand/gongji/jineng/shouji/siwang/shengli` 和 `skill0/skill1/skill2/skill4`。
- 怪物/BOSS 当前没有正式骨骼资源，战斗页使用 `LobbyBattleStage12EnemyPlaceholder` 占位；后台配置表先预留怪物/BOSS 骨骼字段。

## Cocos 实现

- `LobbyBattleUnitSpineRuntime.ts`
  - 新增 `BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY`，按 R/SR/SSR/UR/BOSS/DEFAULT 控制 `fallbackRawHeight`、`maxScale` 和目标高度比例。
  - 新增 `resolveBattleUnitSpinePrimaryAsset()`，优先读取 `unit.portraitAsset` 中的 `act_*` 战斗骨骼，再读取 `unit.spineAsset`，最后从 `unit.portraitAsset` 派生 `npc_*` 兜底。
  - 敌方资源读取 `spineAsset`，支持未来配置完整 `spine/...` 路径或目录名。
- `BattleApi.ts`
  - `battle start` 阵容与敌方预览归一化保留 `portraitAsset/spineAsset/spineUuid/scaleProfile`，避免后端已返回的骨骼字段在前端丢失。
- `LobbyBattlePreviewPanelRenderer.ts`
  - 新增 `LobbyBattleStage12HeroCardDeck`、`LobbyBattleStage12EnemyPlaceholder`、`LobbyBattleStage12VictoryOverlay`、`LobbyBattleStage12RewardSlot`。
  - 主战场通过 `resolveRenderableBattleUnits()` 只渲染真实参战英雄和有效敌方预览，不再把 `fillUnits()` 补出的空位画成战斗单位。
  - 无英雄骨骼时使用主角立绘或角色剪影兜底；无怪物骨骼时使用暗红怪物剪影占位，不再显示纯胶囊占位。
  - 当前攻击/技能/受击 cue 会显示 `LobbyBattleStage12ActionCallout`，用于直观看到普攻、技能、受击、治疗和增益表现。
  - 删除战场中的开发调试标签，不再显示旧的“只读表现快照”。
  - 增加 `isBattleAudioSourceNodeValid()` 与渲染代次检查，避免旧音频加载回调访问已销毁节点。
- `LobbyBattlePresentationLayout.ts`
  - 桌面/横屏使用 `BATTLE_STAGE12_FORMATION_OFFSETS`，把左右队伍从旧竖排队列调整为前后排战场阵型。
  - 小屏仍走紧凑排布，优先保证按钮和文字不溢出。
- `LootChainGameRoot.ts`
  - 编队变更会调用 `invalidateLobbyBattleSessionForFormationChange()` 清理本地旧战斗快照。
  - 下一次进入战斗预演时重新用当前 `heroIds` 创建 battle start，避免画面复用旧阵容。

## 后端 / DB

- `PlayerBattleEnemyVO` 新增 `spineAsset`，只作为 Cocos 敌方骨骼显示目录。
- `battle_stage_config.enemy_spine_asset` 用于普通关卡敌方通用骨骼目录预留。
- `battle_boss_config.boss_spine_asset` 用于 Boss 骨骼目录预留。
- 新增 SQL：`D:\project\LootChain\sql\65_battle_visual_spine_fields.sql`。
- 同步 fresh-schema：`D:\project\LootChain\sql\43_battle_config_readonly_management.sql`。

## 边界

- 不触发真实战斗结算。
- 当前 Cocos 战斗流程会通过既有 `POST /api/player/battles/start` 创建会话；验收不得点击或调用 `POST /api/player/battles/{battleNo}/settle`。
- 不新增经济写入口。
- 不改变奖励、体力、进度、战力、掉落、排行、USDT、资金池、EX V1、背包 use/sell/batch-use、升星、觉醒、精炼。

## 验收

- Cocos 守卫：`npm.cmd run check:battle-stage12`。
- Stage 12 后仍需复跑：
  - `npm.cmd run check:layout`
  - `npm.cmd run check:preview`
  - Cocos TypeScript no-emit
  - `assets/resources/spine` `.spine/.spine.meta` 源文件扫描
- 后端建议验证：
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=BattleConfigAdminServiceImplTest,PlayerBattleServiceImplTest" test`
  - `git diff --check`
- 浏览器验收：
  - 刷新 Preview 后进入登录 -> 冒险 -> 编队 -> 战斗预演。
  - 选择带 `portraitAsset/spineAsset` 的英雄后，确认 battle start 请求体里的 `heroIds` 与当前编队一致。
  - 战斗页应显示左侧英雄 Spine、右侧怪物占位、伤害浮字和底部技能/英雄卡，不应再显示旧结算策略表、BGM 状态条、战斗日志或性能徽章。

## 2026-06-19 接管返修

- 编队页重排为参考图方向：左侧 `LobbyFormationBattlefieldScene` 显示 5 个出战位，优先加载 `LobbyFormationActorSpinePreview` 真实英雄 Spine，资源缺失或不兼容时才回退占位/名牌；右侧 `LobbyFormationHeroPicker` 显示可出战英雄列表；阵容仍只用于本次 `battle start` 快照，不保存长期队伍。
- 冒险挑战弹框的“我方阵容”改为优先读取当前临时编队 `currentLobbyFormationHeroIds()`，没有手动选择时才回退默认战力前 5，避免弹框显示和实际 start 阵容不一致。
- 战斗页演出完成后即显示 `LobbyBattleStage12VictoryOverlay` 视觉胜利层；没有真实结算回执时，奖励区显示“奖励仅预览，本轮不发放”。
- 当前 UI 仍不触发 `POST /api/player/battles/{battleNo}/settle`；真实结算、发奖、体力扣除和主线进度推进必须另行授权后再开启。

## 2026-06-19 资源审计补充

- 22 个启用英雄均有 `portrait_asset/spine_asset/spine_uuid`，对应 Cocos `assets/resources/spine/hero/{spine_asset}` 目录存在。
- 当前资源并非全部具备用户要求的严格动画名：
  - 部分 SSR/UR 资源缺 `skill2/skill3`；
  - 多数 R/SR `.skel` 资源静态抽取不到完整 `run/skill0/skill1/skill2/skill4/die/hurt/win_1/win_2`。
- 因此当前运行时仍保留兼容映射与兜底动画，保证可播放；如果后续要硬性验收严格命名，需要重导出或重命名 Spine 资源。

## 2026-06-20 布阵 Spine 预览加固

- 布阵页真实英雄 Spine 预览补齐 runtime retry：`LobbyFormationActorSpinePreview` 在 `SkeletonData` 已加载但 `getRuntimeData(true)` 暂不可用时，不再立即退回剪影，而是按 `[180, 420, 900]ms` 短重试。
- 加载顺序与英雄详情页对齐：有 `spineUuid` 时优先 `assetManager.loadAny({ uuid })`，失败再走 `resources.load(spine/hero/{asset}/{asset})`。
- `check-layout` 额外检查 Cocos `library/.assets-data.json`，防止已归档的 `.spine` 源文件仍残留在 AssetDB 索引里，导致 Preview 继续使用旧资源元数据。
- 本地验收时已清理旧 `library/.assets-data.json` 和 Preview targets，重启 Cocos 后重建 AssetDB；`.spine` 源索引为 `0`，`check:preview` 已通过。

## 2026-06-20 默认阵容闭环修复

- 修复默认阵容只带主角的问题：`resolveLobbyFormationHeroIds()`、`reconcileLobbyFormationSelection()` 和 `fillLobbyFormationWithDefaultHeroes()` 统一使用 `resolveDefaultFilledLobbyFormationHeroIds()`，对空阵容或不足 5 人的阵容补齐当前可出战 top-5。
- 验收路径确认挑战弹框、布阵页、battle start 请求使用同一组阵容：`[5,11,9,10,63]`。
- 预览截图确认布阵页非主角英雄显示真实 Spine，战斗页左侧显示 5 名英雄、右侧保留怪物占位，并展示视觉胜利层。
- 网络验收：仅触发 `POST /api/player/battles/start`，没有触发 `/api/player/battles/{battleNo}/settle`。
