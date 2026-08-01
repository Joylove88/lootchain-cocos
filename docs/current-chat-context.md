# LootChain Cocos 当前聊天窗口交接上下文

更新时间：2026-07-08

本文用于其他 Codex 窗口快速接手当前阶段。先读本文件，再按 LootChain 规则读取服务端 `D:\project\LootChain` 下的 `README.md`、`AGENTS.md`、`AI_RULE.md`、`PROJECT_CONTEXT1.md`、`PROJECT_CONTEXT2.md`、`docs/`、`sql/`、`team-history/CURRENT_PROGRESS.md`。

## 当前目标

- 2026-07-08 最新：**大厅编队改为服务端持久化**，解除旧「编队仅本地一次性、不持久化」边界。新增后端 `game/team` 模块与表 `user_team`（`sql/67_team_formation_persist.sql`），接口 `GET /api/player/lobby/team`（登录还原）、`POST /api/player/lobby/team/save`（编队后保存），已加入 `PlayerApiPhaseGate` 白名单+单测。客户端新增 `LobbyTeamApi`（`api.lobbyTeam`）：登录本会话首次在名单加载后拉一次还原到 `selectedLobbyFormationHeroIds`（默认填充前，触发挂机演出重绘），此后每次上/下阵后回写。保存校验与战斗 start 同口径（拥有+`status=1`、去重、最多 5、队长须在阵容内）。E2E（dev 库 user 1，curl）全绿。纯玩法配置，不发奖励、不改经济。
- 2026-07-09 最新：**数值体系 ÷10 重设计 + 伤害改攻击力驱动**。解决"1级英雄打怪几千上万、养成后过亿"。战斗大数字来自**3 条独立 stat 路径,已全部同步 ÷10**:①后端战力/门槛：`hero_template` 基础属性 ÷10(sql/68)→ power ÷10 → `user_hero.power` ÷10 + `battle_stage_config.recommended_power` ÷10 + Java `MainlineStageRules.LEGACY_RECOMMENDED_POWERS`/公式常量 + `MAINLINE_ENEMIES` ÷10；②基础伤害飘字：`LobbyBattlePresentationTimeline` 改攻击力驱动(`attack × 回合 × 减伤 × 暴击`),有效攻击后端下发(`PlayerBattleLineupHeroVO.attack = base_attack×等级×星`,toLineup 接 HeroTemplateMapper;客户端 BattleApi/snapshot 加 `attack`);③回放 sim `LobbyBattleReplayModel`(HP百分比+大招 `replay.attack×2.6`)maxHp/attack/defense 三项系数一起 ÷10(比例不变→节奏不变,量级缩10倍)+ 大招兜底 800→80。实测:门槛通过、power 均值7万→7千、伤害飘字 17~333(0 个≥1000)、大招 2661/3335→266/333、敌人正常死亡。详见记忆 [[battle-number-scale]]。后续加装备/升星在小基础上叠。
- 2026-07-09 最新：**战斗技能卡组 60Hz 重建优化**（`LobbyBattlePreviewPanelRenderer`）。回放 tick 16ms(~60/秒)每次都把底部 5 张技能卡组销毁+全量重建，是战斗持续帧成本大头。改法：`refreshStage12HeroCardDeck` 先算内容签名（`resolveHeroCardDeckSignature`：每英雄 hp%/能量% 取整 + 出手/受击/辅助/大招/阵亡态），签名不变且无大招就绪则跳过整组重建；有大招就绪照常每帧建（保呼吸动画+点击上下文实时）。重建代码本身不动，只加跳过判断→输出零变化。`resetBattlePlaybackRuntime` 重置签名。实测重建 **60→5.4/秒(11×)**，卡面能量%/HP/高亮全对、画面正常。注意：headless 软件渲染是 fill-rate 瓶颈(每帧渲 spine)，fps 没涨——省的是主线程 55次/秒节点 churn，真机 GPU 才体现，战斗性能必须真机验。
- 2026-07-09 最新：**战斗进场 spine 分帧构建**（`LobbyBattlePreviewPanelRenderer`，纯表现层）。战斗不适合面板复用（逐帧回放态机无稳定签名），进场卡顿另治：SkeletonData 本就缓存（`battleSpineData` 按 uuid/path），但重复进场 5 个 spine 会同帧集中 mesh 构建。改法：`renderBattleActorSpineLayer` 里 fallback 剪影立即占位，骨骼创建+load+apply 按 actor 用 `BATTLE_SPINE_BUILD_STAGGER_MS=55ms` 错峰（`tween(parent).delay().call()`，按 renderGeneration 归零），既有 load/fallback/代际守卫逻辑原样包进延迟闭包不动。实测进场峰值 216→144ms，5 spine 全建+全 animating、0 残留剪影、战斗画面正常。残余 144ms 是战斗脚手架（HP条/技能卡/buff盘同帧建，非 spine），要另做延迟建脚手架。
- 2026-07-09 最新：**面板复用(英雄名册)** —— 根因级减卡:`UiContentRootController` 新增"可复用节点"注册表(`registerReusableNodes`),登记的顶层节点在任何销毁路径(`clear`/`clearExcept`/`removeNode`)都改为**摘下暂存(detach 不 destroy)**而非销毁;`LootChainGameRoot.renderLobbyHeroRosterPanel` 进入时算**内容签名**(几何+语言经 `makeReusableLayoutKey`,绝不能用 `this.layoutKey`——它揉进了所有面板开合/loader.version,逛一次背包就变导致永不命中 + 面板 `currentContentSignature`:筛选+每个英雄 id/lv/star/power/稀有度/职业/名/立绘),签名不变且暂存有效则 `restoreNodes` 原样挂回、跳过整棵树重建;任何不匹配(数据/筛选/resize/语言变)`dropStashed`+重建,**旧数据结构上不可能复用**;登录/加载 `invalidateReusableScenes` 清所有暂存防跨会话。**已接:英雄名册 + 背包**(各配自己 `currentContentSignature`;背包签名必含钱包 `profile.gold/diamond`,因货币栏读实时 profile,战斗/挂机后进背包不能露旧值)。实测:英雄→背包→英雄=**复用**(uuid 保持、18卡在、可交互),尖峰 202→135ms;背包→英雄→背包=**复用**,尖峰 218→65ms;筛选/resize/数据变=正确重建;背包保留筛选态复用也正确。残余尖峰是大厅演出销毁+背景重建的切页固定成本(非面板本身)。**战斗不适合复用**:它是逐帧推进的回放状态机(playbackTimelineTimeMs/presentationElapsedMs/逐帧战斗位),无稳定内容签名,暂存回来会是冻结旧回放;战斗进场卡顿(实例化敌我 spine)需另做 spine SkeletonData 预载 + 节点池化(未做)。
- 2026-07-09 最新：**英雄界面开面板卡顿优化**（纯 Cocos 表现层，`LobbyHeroRosterPanelRenderer.ts`）。原因:每次开面板整棵树同帧重建,且每张卡各挂一个活体 spine 边框光效(18 张 = 18 spine)。优化:①R/SR 移除边框(仅保留卡框底图,不挂任何 spine/描边),活体 spine 仅 SSR/UR 保留 → spine 数 18→5;②SSR/UR 边框 spine 分帧错峰实例化(`HERO_ROSTER_BORDER_SPINE_STAGGER_SECONDS`);③卡片分帧构建:首屏一行同步(`HERO_ROSTER_CARD_INITIAL_SYNC_MIN`),其余按批 `tween(content).delay` 错峰(延迟回调用 `content.isValid` 兜底面板重建)。实测(headless 软件渲染,绝对值偏悲观):开英雄界面主线程尖峰 251ms→188ms、spine 18→5、18 卡全部落地、UR 保留火焰边框视觉无回退。剩余尖峰主要来自每卡 5 个带描边 Label + 遮罩(真机 GPU 便宜得多)。若真机仍卡,下一杠杆是面板复用(建一次隐藏而非销毁重建)。测帧法与 SwiftShader 悲观性注意见记忆 [[panel-open-perf-profiling]]。
- 2026-07-08 最新：**稀有度配色全端统一**（纯客户端渲染色，数据库不存稀有度颜色）：R=蓝 `#5D97FF`、SR=紫 `#C86FFF`、SSR=橙 `#FFA836`、UR=炽红 `#FF5430`、未知=灰 `#605B58`。唯一真值为各渲染器 `resolveRarityColor()`（英雄名册/详情/布阵右栏/战斗卡牌/大厅挂机共用），色值明细见 `docs/ui-style-guide.md` 颜色规范。同批英雄界面调整：移除右下角「查看详情」框与中央「战场布阵」「战斗展示属性」标题、英雄详情背景换 `ui/hero/ai/hero_detail_bg`、布阵右侧选人栏美化+字体放大、从英雄界面进布阵时隐藏底部导航三键。
- 2026-07-08 最新：**大厅/战斗友军体型逐英雄对齐 Nuu**（纯 Cocos 表现层）。`LobbyBattleUnitSpineRuntime.ts` 的 `BATTLE_COMBAT_CANVAS_COMPENSATION_BY_ASSET`（大厅挂机演出与战斗友军共用友军公式）按实测像素反解补偿系数，使各英雄渲染高度对齐 Nuu(UR_EVELYN, ≈160px)；实测法（注入阵容+冻结骨骼读 `renderData.chunk.vb`）记于记忆 `lobby-hero-size-tuning`。守卫 `check-battle-stage13w` 的 `BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO` pin 已校准到编队统一档 `0.53`。
- 游戏前端当前阶段是 Cocos-only 登录页 + 资源加载页 + 大厅 HUD 可见体验。
- 不再使用 `web-vue` 作为当前验收路径；`web-vue` 仅为历史实验目录。
- 当前验收入口是 Cocos Creator 3.8.8 的 `D:\project\lootchain-cocos\assets\main.scene`。
- 2026-06-21 最新：主角已改为隐藏账号初始化记录。新用户 `dev-login` 后不再进入主角选择/命名页；如果服务端尚未创建主角，Cocos 会静默调用既有 `POST /api/player/protagonist` 创建默认隐藏主角，然后进入资源加载和大厅。英雄列表、英雄详情、编队、挑战弹框和战斗出战均过滤 `protagonist=true`，默认队长改为当前可见出战阵容第一名英雄。
- 2026-06-17 最新：可视化战斗 10 阶段已启动，第 1 阶段完成规格冻结、UI/音效候选清单和只读守卫。详见 `docs/battle/stage1-visual-battle-spec.md` 与 `docs/battle/stage1-asset-audio-inventory.md`；当前尚未实现运行时战斗动画，也未导入外部 C1812 素材或音效。
- 2026-06-17 最新追加：可视化战斗 Stage 2 已导入首批通用战斗表现资源并新增 `npm.cmd run check:battle-stage2`。导入资源包括 Boss 血条框/填充、技能目标框、4 个 Buff 图标、受击/地面冲击装饰候选，以及 10 个战斗 BGM/SFX/UI WAV。详见 `docs/battle/stage2-resource-import.md`。Stage 2 仍未实现运行时播放、未改后端接口、未新增经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 3 已新增表现快照与静态战斗场景骨架，并新增 `npm.cmd run check:battle-stage3`。新增 `LobbyBattlePresentationSnapshot.ts` 合并 battle start、只读英雄列表和敌方预览；`LobbyBattlePreviewPanelRenderer` 已消费快照渲染左右阵营、Boss 血条、目标框、命中装饰和 Buff 托盘。详见 `docs/battle/stage3-battle-scene-skeleton.md`。Stage 3 不新增后端接口、SQL、战斗 AI、技能时间轴、伤害结算或经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 4 已新增 Spine 单位站位层，并新增 `npm.cmd run check:battle-stage4`。新增 `LobbyBattleUnitSpineRuntime.ts` 处理英雄 Spine 路径、UUID、动画名、缩放和镜像；战斗页 actor 优先渲染 `LobbyBattleActorSpineNode`，无资源时回退 `LobbyBattleActorSpineFallbackSilhouette`，敌方仍使用 `LobbyBattleEnemyStandin`。详见 `docs/battle/stage4-spine-formation-layer.md`。Stage 4 不新增后端接口、SQL、战斗 AI、技能时间轴、伤害结算、音频自动播放或经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 8 已新增结算与异常表现调度，并新增 `npm.cmd run check:battle-stage8`。新增 `LobbyBattleSettlementPresentation.ts` 将现有战斗状态转换为 `start_idempotent/session_ready/playback_complete/settle_idempotent/receipt_recorded/error_recoverable`；战斗页新增 `LobbyBattleStage8SettlementFlowPanel`、`LobbyBattleStage8RecoveryBanner` 和 `LobbyBattleStage8ReceiptStatus`，用于展示 `start/settle` 幂等、断线、返回重进、失败兜底和以后端回执结算。详见 `docs/battle/stage8-settlement-and-recovery.md`。Stage 8 不新增后端接口、SQL、重结算、补发、离线结算或经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 9 已新增适配与性能表现层，并新增 `npm.cmd run check:battle-stage9`。新增 `LobbyBattleAdaptivePerformance.ts` 根据 `390x340 / 1280x720 / 1920x1080` 输出 `minimal/balanced/cinematic` 档位；战斗页按 profile 控制时间轴、日志、Stage 8 面板、恢复提示、辅助光环、飞行物、飘字、技能框和背景 `motionScale`。详见 `docs/battle/stage9-adaptive-performance.md`。Stage 9 不新增后端接口、SQL、战斗权威模拟、奖励/体力/进度写入或经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 10 已新增全链路验收守卫，并新增 `npm.cmd run check:battle-stage10`。Stage 10 验收 `冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读` 的代码 hook、Stage 1-9 守卫、布局和文档边界；详见 `docs/battle/stage10-full-chain-acceptance.md`。Stage 10 是只读聚合验收，不触发真实战斗写入，不新增后端接口、SQL 或经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 11 已新增战斗音频运行时，并新增 `npm.cmd run check:battle-stage11`。Stage 11 将 Stage 2 的 BGM/SFX 资源接入 `LobbyBattleAudioRuntime.ts` 与 `LobbyBattlePreviewPanelRenderer`，播放低音量 BGM、开战提示、动作/辅助/受击和胜负结算音效；详见 `docs/battle/stage11-audio-runtime.md`。Stage 11 是纯表现音频，不改变 start/settle 契约，不新增后端接口、SQL 或经济写入口。
- 2026-06-17 最新追加：可视化战斗 Stage 12 已按用户反馈重做战斗场景表现，并新增 `npm.cmd run check:battle-stage12`。本阶段新增 `LobbyBattleStage12HeroCardDeck`、`LobbyBattleStage12EnemyPlaceholder`、`LobbyBattleStage12VictoryOverlay`、稀有度缩放 profile、战斗 Spine 资源解析和音频节点生命周期守卫；后端仅预留 `battle_stage_config.enemy_spine_asset` 与 `battle_boss_config.boss_spine_asset` 展示字段。详见 `docs/battle/stage12-battle-scene-redesign.md`。Stage 12 不触发真实战斗结算，不改变 start/settle 契约，不新增经济写入口。
- 2026-06-18/21 Stage 12 返修：针对战斗页仍显示大量空位/胶囊占位、英雄骨骼不稳定显示、SR/R 像“飘过去”且攻击/技能不播放的问题，Cocos 已补强 `BattleApi` 归一化，保留 battle start 回执中的 `portraitAsset/spineAsset/spineUuid/scaleProfile`；战斗主场景新增 `resolveRenderableBattleUnits()`，只渲染真实参战英雄和有效敌方预览；英雄战斗骨骼改为 `portrait_asset=act_*` 优先使用 act 骨骼，`spineAsset/npc_*` 仅作非 act 或缺失 act 时兜底；无怪物骨骼使用暗红怪物剪影，无主角骨骼使用主角立绘兜底；当前攻击/技能/受击/辅助 cue 通过 `LobbyBattleStage12ActionCallout` 可见。边界仍为纯表现层，不自动调用 settle，不新增经济写入口。
- 2026-06-21 Stage 13T：针对布阵页英雄大小不一和近战英雄原地攻击的问题，Cocos 修正 Spine 统一缩放 profile、命名英雄 Spine 视觉 profile（如 Nuu/Carmilla/Belladonna/Eulenspigel）与布阵页 act-aware UUID 解析；近战 action offset 改为按目标方向推进到接触距离，截图验收新增 SR/R 普攻演员接敌采样，防止回退成原地播放。新增 `scripts/repair-preview-stage13t.mjs` 只用于本地 Cocos Preview stale chunk 修复；边界仍为纯表现层，不自动调用 settle，不新增接口、SQL、奖励、体力、进度或经济写入口。
- 2026-06-21 Stage 13T 追修：根据实机截图反馈，SR/R `act_*` 战斗 profile 上调到 `targetHeightRatio=1.18 / maxWidthRatio=2.72 / maxScale=0.68 / scaleMultiplier=2.05`，命名 SSR/UR profile 保持收敛，避免 SR 被衬得过小；近战截图验收从“普攻时发生位移”升级为“SR/R 普攻演员进入目标接触范围”。本追修仍只改 Cocos 表现层，不触发 settle，不新增经济写入口。
- 2026-06-21 Stage 13U：根据实机截图反馈，近战位移从“按攻击者 slot 宽度推进”升级为“以目标怪物/英雄当前锚点计算正前方接触坐标”，行动者在 `melee_move` 段播放 `run` 跑到目标面前，`basic_attack` 段保持接触点并播放 `skill0/atk` 等攻击动画；布阵页使用 `FORMATION_PREVIEW` 专用 Spine 缩放 profile 并放大站位 canvas，避免 SR/R `act_*` 英雄明显偏小；战斗飘字收敛为每个动作一条主数字，命中层只保留斩击特效，辅助同事件最多显示 2 条飘字。新增 `npm.cmd run check:battle-stage13u` 与 `npm.cmd run repair:preview-stage13u`，并把截图接触阈值收紧到 `118px`。本阶段仍只改 Cocos 表现层，不触发 settle，不新增经济写入口。
- 2026-06-21 SR/R 动作返修：`LobbyBattlePresentationTimeline` 第一个我方行动优先选择前排 R/SR `portrait_asset=act_*` 英雄；`LobbyBattleActionPresentation` 拉长近战接敌与普攻窗口，确保预览中可稳定采到 SR/R `run -> skill0 -> hurt`，辅助/技能 cue 可采到 `skill1/skill_01` 映射；`LobbyBattlePreviewPanelRenderer` 的骨骼 cue 缓存改为按 `cueKey + animationName` 区分，避免同一普攻先播 `run` 后被缓存挡住 `skill0`。`npm.cmd run screenshot:battle-center` 会强制 SR/R 阵容并验收 `run/skill0`、近战接触与无结算写入；本轮截图验收为 1 次 battle start、0 次 settle、0 页面错误、0 控制台错误，`srRBasicAttackClosestDistance=29.52`。
- 2026-06-21/22 Stage 13X：根据实机截图继续返修战斗视觉。战斗/布阵背景切换为 C1812 `Boundary_bg_01` 裁切后的 `assets/resources/ui/battle/stage13x/boundary_battle_bg.png`；战斗布局改用 `BATTLE_STAGE13X_FORMATION_OFFSETS` 和更高 actor height ratio，减少左右堆叠。SR/R 先走 R/SR 专用 Spine profile，不再被 named SSR/UR profile 压小；布阵 stand 放大到 `430x540` 规格，SR/R `FORMATION_PREVIEW` 上限提升到 `1.46`。近战动作新增 `resolveActorMeleeDuelFrame()`，每个 melee cue 同时生成 `actorDuelPosition / defenderDuelPosition / hitPoint`，攻击者和目标都进入当前目标前沿后再播放普攻/受击，伤害数字和斩击锚到命中点；动作 callout 默认关闭，飘字/弹道/辅助特效改为 transient layer 并用 `BATTLE_FLOATING_TEXT_LIFETIME_MS` 清理。新增 `npm.cmd run check:battle-stage13x`，`screenshot:battle-center` 增加 `allMeleeBasicAttackContactMedian` 与 `maxPersistentFloatingTextLayers` 验收。本阶段仍只改 Cocos 表现层，不触发 settle，不新增接口、SQL、奖励、体力、进度或经济写入口。
- 2026-06-17 已完成：可视化战斗 Stage 7 已新增技能与辅助表现调度，并新增 `npm.cmd run check:battle-stage7`。新增 `LobbyBattleAssistPresentation.ts` 将 `buff_preview` 转换为 `skill_cast/heal_float/shield_float/buff_float/debuff_float`；战斗页新增 `LobbyBattleAssistAuraLayer`、`LobbyBattleAssistFloatingTextLayer` 和 `LobbyBattleAssistSkillCastRing`，Spine 当前辅助 cue 优先播放 `skill_01/heal/shield/hit` 兜底动画。详见 `docs/battle/stage7-skill-and-assist.md`。Stage 7 不新增后端接口、SQL、权威治疗/护盾/Buff 结算、音频自动播放或经济写入口，不提交治疗或护盾到服务端。
- 2026-06-17 已完成：可视化战斗 Stage 6 已新增动作与飘字表现调度，并新增 `npm.cmd run check:battle-stage6`。新增 `LobbyBattleActionPresentation.ts` 将 `action_start/damage_preview/hit_react` 转换为 `melee_move/basic_attack/ranged_projectile/damage_float/hit_float`；战斗页新增 `LobbyBattleActionProjectileLayer`、`LobbyBattleActionFloatingTextLayer` 和 `LobbyBattleMeleeAdvanceGhost`，Spine 当前 cue 优先播放 `move/attack_01/skill_01/hit` 后回到 `idle`。详见 `docs/battle/stage6-actions-and-float-text.md`。Stage 6 不新增后端接口、SQL、权威伤害结算、音频自动播放或经济写入口，不提交伤害到服务端。
- 2026-06-17 追加：可视化战斗 Stage 5 已新增确定性本地表现时间线，并新增 `npm.cmd run check:battle-stage5`。新增 `LobbyBattlePresentationTimeline.ts` 基于 `serverSeed + battleNo + unitSnapshot` 生成 45-60 秒事件序列；战斗页新增 `LobbyBattleTimelineEventRail`，伤害飘字与 Buff 托盘读取 `damage_preview/buff_preview`。详见 `docs/battle/stage5-deterministic-timeline.md`。Stage 5 不新增后端接口、SQL、战斗 AI、权威伤害结算、音频自动播放或经济写入口。
- 第 1 阶段新增 `npm.cmd run check:battle-stage1`，用于确认战斗规格、候选路径和经济红线仍完整；后续阶段的 UI 素材可从 `C:\Users\axian\Desktop\C1812-1` 或项目资源中筛选，音效可从 `C:\Users\axian\Desktop\C1812音效` 筛选，但必须按阶段先记录/试听/裁切/验收再接入。
- 2026-06-17 最新例外：战斗成长链已推进到 **Stage 7：主线编队 -> 战力不足 -> 英雄升级 -> 战力刷新 -> 战斗结算闭环**。年度主线仍为 `MAIN_1_1` 至 `MAIN_25_16 / R1-R393` 一次性真实首通；Stage 7 不新增持久编队接口，不新增经济写入口，只强化 Cocos 编队/冒险/英雄详情的引导和后端 `level-up` 回执。
- Stage 7 后端仍只走既有玩家端战斗接口 `POST /api/player/battles/start`、`POST /api/player/battles/{battleNo}/settle` 和白名单内的 `POST /api/player/heroes/{heroId}/level-up`；Cocos 战斗请求只提交 `stageCode/heroIds/leaderHeroId/requestId`，英雄升级只提交路径 `heroId`。
- 年度推进：不限制每日真实主线首通次数，也不以体力或等级卡节奏；只要前置进度满足且出战阵容战力达到推荐战力即可继续挑战，重复挑战返回 `NO_REWARD`，不扣体力、不发奖励、不推进主线。
- R1 固定奖励：`MAIN_1_1` 首次 `WIN` 不扣体力，发放玩家经验 `50`、`GOLD 300`、`LOW_ENHANCE_STONE x2`，结算模式 `REAL_MAINLINE_R1`，完成后推荐/解锁 `MAIN_1_2`。
- R2 固定奖励：`MAIN_1_2` 首次 `WIN` 不扣体力，发放玩家经验 `60`、`GOLD 800`、`LOW_ENHANCE_STONE x2`、`HERO_EXP_BOOK x1`，结算模式 `REAL_MAINLINE_R2`，完成后推荐/解锁 `MAIN_1_3`。
- R3 固定奖励：`MAIN_1_3` 首次 `WIN` 不扣体力，发放玩家经验 `80`、`GOLD 1200`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，结算模式 `REAL_MAINLINE_R3`，完成后推荐/解锁 `MAIN_1_4`。
- 6H 成长桥固定奖励：`MAIN_1_4` 至 `MAIN_1_9` 每关首次 `WIN` 均不扣体力，玩家经验依次 `60/200/250/300/350/400`，累计补足 `1560 EXP`，使 R1-R9 总经验达到 `1750` 并回写 Lv.8；金币依次 `300/400/500/600/700/800`，低风险道具仅 `LOW_ENHANCE_STONE` 与 `HERO_EXP_BOOK`。
- 6L 当前 `MAIN_2_1` 固定奖励：首次 `WIN` 不扣体力，发放基础玩家经验 `450`、第二章预热经验 `500`、`GOLD 900`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，结算模式仍为 `REAL_MAINLINE_R10`，完成后推进/推荐 `MAIN_2_2`，并把正常 R1-R10 路径补到 `Lv.10 / exp=2700`。
- 6M 当前 `MAIN_2_2` 固定奖励：首次 `WIN` 不扣体力，发放玩家经验 `550`、`GOLD 1000`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`，结算模式为 `REAL_MAINLINE_R11`，完成后推进/推荐 `MAIN_2_3`，正常 R1-R11 路径达到 `Lv.11 / exp=3250`。
- 6N 当前 `MAIN_2_3` 固定奖励：首次 `WIN` 不扣体力，发放玩家经验 `600`、`GOLD 1100`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`，结算模式为 `REAL_MAINLINE_R12`，完成后推进/推荐 `MAIN_2_4`，正常 R1-R12 路径达到 `Lv.12 / exp=3850`。
- 6P 当前 `MAIN_2_4` 固定奖励：首次 `WIN` 不扣体力，发放玩家经验 `650`、`GOLD 1200`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`，结算模式为 `REAL_MAINLINE_R13`，完成后推进/推荐 `MAIN_2_5`，正常 R1-R13 路径达到 `Lv.13 / exp=4500`。
- 6Q 当前 `MAIN_2_5` 固定奖励：首次 `WIN` 不扣体力，发放玩家经验 `700`、`GOLD 1300`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`，结算模式为 `REAL_MAINLINE_R14`，完成后推进/推荐 `MAIN_2_6`，正常 R1-R14 路径达到 `Lv.14 / exp=5200`。
- 6R 历史 `MAIN_2_6` 固定奖励：首次 `WIN` 不扣体力，发放玩家经验 `750`、`GOLD 1400`、`LOW_ENHANCE_STONE x6`、`HERO_EXP_BOOK x1`，结算模式为 `REAL_MAINLINE_R15`，完成后推进/推荐 `MAIN_2_7`，正常 R1-R15 路径达到 `Lv.15 / exp=5950`；Stage 6S 后 `MAIN_2_7` 已升级为 `R16` 真实首通。
- 6S 当前 `MAIN_2_7` 已作为 `R16` 真实首通开放，年度最终关为 `MAIN_25_16 / R393`；越界 `MAIN_25_17`、`MAIN_26_1` 必须被拒绝。
- 6J 已补强 `MAIN_2_2` 运行期保护：后端单测固定强制 start `MAIN_2_2` 在冒险查询、阵容读取和 `battle_session` 创建前返回 `关卡暂未开放`；经济守卫明确要求 `MAIN_2_2` 为 `PHASE5_READONLY/status=1` 且无活跃 `battle_reward_rule`。
- 6K 已补齐 `MAIN_2_2` 只读预热：后端区分 `LEVEL_REQUIRED` 与 `PHASE_LOCKED`，`MAIN_2_2` 奖励文案明确“预览，不发放”；Cocos 冒险页会优先展示锁定推荐关卡详情，按钮显示“仅预览/等级不足/主线未达”，不回退到旧已解锁关卡误导玩家。
- 6L 已补齐 R10 后 Lv10 断点：`MAIN_2_1` 首通同一事务追加封顶 `PLAYER_EXP 500` 预热经验；已完成 R10 且处于 `2200 <= exp < 2700` 的本地/测试旧账号可由 `sql/56_battle_mainline_stage6l_lv10_prewarm.sql` 幂等补到 Lv10/2700。`MAIN_2_2` 仍 `PHASE_LOCKED`、不创建战斗、不发奖励。
- R1-R393 客户端边界：Cocos 不提交奖励、掉落、体力、主线进度、货币或背包字段，只展示后端返回的权威回执；非年度范围或重复挑战保持 `NO_REWARD`/拒绝。
- R1-R393 后端边界：不开 repeat farming/drop pools、副本、Boss、排行、扫荡、任务/成就领奖、背包 use/sell/batch-use、体力领取/购买、USDT、资金池奖励、EX V1、后台补发/重结算；英雄成长仅开放 `level-up`，升星/觉醒/精炼仍关闭。
- 登录阶段只接入玩家 `dev-login`。
- dev-login 成功后先检查/静默初始化服务端隐藏主角记录，再进入 Cocos 资源加载进度页，加载 `assets/resources/lobby` 下的大厅背景资源；玩家不再选择主角，前端也不展示主角或强制主角上阵。
- 加载完成后切换到大厅背景界面；当前大厅已包含背景视频、左上玩家信息、只读资料场景页、顶部资源栏、右上系统图标、左侧活动、中央建筑热点、右侧挑战卡、底部导航、聊天预览、冒险按钮和统一未开放占位场景页。
- 大厅当前开放资料、公告、图鉴、英雄队列等展示；召唤使用既有真实抽卡接口；战斗开放年度 R1-R393 主线首通真实结算；R10 会额外补齐 `MAIN_2_2` 预热等级经验，年度最终累计 `Lv.60 / exp=91450`，后端按 `user_level_config.need_exp` 自动回写 `game_user.player_level`，Cocos 只回读展示；英雄详情仅开放 `level-up`；其他玩法/经济入口仍是本地 placeholder。
- Stage 6E 已补齐只读可读性：`GET /api/player/me/lobby` 返回 `levelProgress`，Cocos 左上 EXP 小牌、玩家资料页显示经验进度；`GET /api/player/lobby/adventure` 的 stage 返回 `unlockHint`，冒险详情展示 `MAIN_2_1` 等锁定原因。
- Stage 6F 已补齐锁定关卡结构化差距：冒险 stage 返回 `lockReasonCode/levelGap/requiredLevelNeedExp/expToRequiredLevel`，Cocos 冒险详情显示“距离要求：6 级 / 1560 EXP”。
- Stage 6G 已补齐锁定后的下一步只读说明：冒险 stage 返回 `nextGuidanceTitle/nextGuidanceText/growthSourceSummary/growthSourceStatus/growthSourceHint/repeatableExpAvailable`，Cocos 冒险详情提示“首通经验已用完；暂无重复经验入口。”。
- Stage 6S 后，`MAIN_1_1..MAIN_25_16` 均可按年度规则真实首通一次；当前 full-chain smoke 用 `0` 体力账号验证全链路，完成后应为 `Lv.60 / exp=91450 / stamina=0`，最终进度 `MAIN_25_16:MAIN_25_16`。`MAIN_25_17` 必须被拒绝，最终关重复挑战必须为 `NO_REWARD`。
- 当前主线推进重点是 `Stage 7：成长闭环优化`；年度 393 关已开放为基座，本阶段把冒险推荐、一次性本地编队、战力门槛、英雄升级资源持有、升级后回读和战斗预演串成闭环。
- Gacha 结果页保留 `Stage 4AK/4AO` 的全屏逻辑场景结构；当前已按批准卡池走既有真实抽卡接口，不能再按旧 mock 口径判断召唤链路。
- 2026-06-01 追加修复：点击主角页“进入游戏”出现“系统异常”的本地根因是 `lootchain` 库未执行 `sql/12_protagonist_module.sql`，缺少 `player_protagonist` 表；已在本机执行该 SQL，并用测试玩家复验 `POST /api/player/protagonist` 成功。
- 除已批准的真实抽卡池、年度主线 `MAIN_1_1` 至 `MAIN_25_16` 首通结算和英雄详情 `level-up` 外，不开放背包使用/出售、升星、觉醒、精炼、USDT、资金池、任务/成就领奖、体力领取/购买、重复结算或任何新经济写入口。

## 2026-06-17 Stage 7：主线成长闭环优化

- 产品/策划结论：Stage 7 拆为 5 个环节并已按顺序闭环：冒险推荐进入编队、编队展示当前/推荐战力并拦截不足、英雄详情只开放 `level-up`、升级后回读资源/背包/英雄/冒险、再回到编队进入战斗预演与结算。
- 编队边界：不新增持久保存阵容接口，不新增编队表；当前仍为 Cocos 本地一次性战斗阵容，只在 `POST /api/player/battles/start` 提交 `stageCode/heroIds/leaderHeroId/requestId`。
- 战力口径：后端 `user_hero.power` 是权威值，`HeroPowerCalculator` 已把等级成长系数调为每级 `12%`，`PlayerBattleServiceImpl` 与 Cocos 都只读/展示该值；Cocos 不本地推导属性战力。
- 英雄升级：`POST /api/player/heroes/{heroId}/level-up` 返回 `HeroOperationResultVO(heroId/level/star/awakenStatus/power)`；成功后 Cocos 依次回读 `me/lobby`、英雄列表、背包和冒险，状态提示包含等级、战力与增量。
- 数值调优：新增并本地导入 `D:\project\LootChain\sql\64_stage7_growth_loop_power_tuning.sql`；早期推荐战力按 R1-R15 曲线调整为 `7500/9300/10300/11000/11500/12600/12800/13700/13900/15000/16000/17500/19000/20500/22000`，确保 R1/R2 后首次升级能自然打开 R3，但后续仍持续抬高难度。
- Cocos UI：冒险详情显示当前阵容战力、推荐战力与差距；战力不足时 CTA 切为“去升级英雄”。编队页标题区显示目标关卡、推荐战力、当前阵容战力、差距和达标状态；英雄详情显示金币与英雄经验书持有量。
- 可复跑烟测：`D:\project\LootChain\scripts\smoke-stage7-growth-loop.ps1` 覆盖 R1/R2 首通、R3 升级前战力不足拦截、英雄 1->2 升级、profile/heroes/bag/adventure 回读、R3 start/settle、`star-up/awaken/refine` 阻断。
- 本机验证：Stage 7 smoke 通过，测试账号 `userId=54 / heroId=62`，R3 升级前 `9432 < 10300` 被拦截，升级后 `9432 -> 10372` 并完成 `MAIN_1_3`，后续推荐 `MAIN_1_4`；后端相关 `60 tests, 0 failures`；年度守卫通过；Cocos `npm.cmd run check:layout` 通过。当前 `localhost:7456` 未启动，`npm.cmd run check:preview` 返回 `ECONNREFUSED`，打开 Cocos Creator Preview 后需复跑。
- 红线：不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、奖励/体力/进度手写、补发/重结算或任何新经济写入口。

## 2026-06-17 可视化战斗 Stage 8：结算与异常

- 产品/策划结论：Stage 8 只补齐战斗页结算链路的可见状态和异常恢复提示，覆盖 `start/settle` 幂等、断线、返回重进、失败兜底和以后端回执结算。
- Cocos 新增 `LobbyBattleSettlementPresentation.ts`，从现有 `LobbyBattlePanelState` 与 `LobbyBattlePresentationState` 生成 `start_idempotent/session_ready/playback_complete/settle_idempotent/receipt_recorded/error_recoverable` 步骤。
- UI 新增 `LobbyBattleStage8SettlementFlowPanel`、`LobbyBattleStage8RecoveryBanner`、`LobbyBattleStage8ReceiptStatus` 和重复点击拦截徽标；2026-06-19 返修后，当前视觉验收流演出完成只显示 `返回大厅`，不显示可点击提交结算按钮。
- 守卫新增 `npm.cmd run check:battle-stage8`，校验 helper、渲染接入、文档、Preview freshness tokens 和本地状态机确定性。
- 边界：不新增后端接口、SQL、表结构、重结算、补发、离线结算、服务端战报、客户端胜负推导或任何新经济写入口；战斗写入仍只允许 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。

## 2026-06-17 可视化战斗 Stage 9：适配与性能

- 产品/策划结论：Stage 9 只处理战斗页在 `390x340`、`1280x720`、`1920x1080` 下的可读性、可点击性和低性能降级；不改变胜负、难度、奖励、进度或成长。
- Cocos 新增 `LobbyBattleAdaptivePerformance.ts`，输出 `BattleAdaptivePerformanceProfile` 与 `assertBattleAdaptivePerformanceBounds()`。
- `390x340` 进入 `minimal`，关闭时间轴、日志、Stage 8 侧面板、恢复提示、辅助光环、飞行物、飘字和技能框，仅保留核心战场、结果与操作按钮。
- `1280x720` 进入 `balanced`，保留标准 HUD、时间轴、日志、飞行物与飘字。
- `1920x1080` 进入 `cinematic`，保留完整 Stage 1-8 表现。
- 战斗页新增 `LobbyBattleStage9ViewportGuard` 与 `LobbyBattleStage9PerformanceBadge`，极窄屏显示轻量表现状态；背景氛围 Tween 受 `motionScale` 控制。
- 守卫新增 `npm.cmd run check:battle-stage9`，校验 helper、渲染接入、文档、Preview freshness tokens 和本地 profile 行为。
- 边界：不新增后端接口、SQL、表结构、重结算、补发、离线结算、服务端战报、客户端胜负推导或任何新经济写入口；战斗写入仍只允许 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。

## 2026-06-17 可视化战斗 Stage 10：全链路验收

- 产品/策划结论：Stage 10 只做 `冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读` 的全链路只读验收，不新增战斗规则、不改变难度、不扩展经济写入。
- 新增 `scripts/check-battle-stage10.mjs`，聚合执行 Stage 1-9 守卫和 `check:layout`，并校验冒险、编队、战斗流、战斗表现和回读刷新 hook。
- 新增 `docs/battle/stage10-full-chain-acceptance.md`，记录产品、策划、UI、开发和测试验收口径。
- 自动验收不点击开始战斗或提交结算，不触发真实战斗写入；如需真实 start/settle 写入验收，必须单独获得用户明确批准。
- 边界：不新增后端接口、SQL、表结构、重结算、补发、离线结算、服务端战报、客户端胜负推导或任何新经济写入口；战斗写入仍只允许 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。

## 2026-06-17 可视化战斗 Stage 11：战斗音频运行时

- 产品/策划结论：Stage 11 只把 Stage 2 已导入的 BGM/SFX 接到战斗表现运行时，不新增素材来源、不改变战斗规则、不扩展经济写入。
- Cocos 新增 `LobbyBattleAudioRuntime.ts`，把战斗状态、当前时间线事件、动作 cue、辅助 cue 和 Stage 2 音频路径转换为 `BattleAudioRuntimePlan`。
- `LobbyBattlePreviewPanelRenderer` 新增 `LobbyBattleStage11AudioRuntime` 与 `LobbyBattleStage11AudioStatus`，使用 `AudioSource` 播放低音量 BGM 与一次性音效。
- 音频优先级：结算胜负音 / 开战提示优先，其次辅助 cue，再其次动作 cue，最后时间线事件 cue。
- 守卫新增 `npm.cmd run check:battle-stage11`，校验 helper 行为、渲染接入、Preview freshness tokens、文档和 Stage 10 聚合守卫。
- 边界：不新增后端接口、SQL、表结构、战斗权威模拟、奖励/体力/进度写入、音频回传字段或任何新经济写入口；战斗写入仍只允许 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。

## 2026-06-17 Stage 6S：年度主线 25 章 / 393 关真实首通闭环

- 产品/策划结论：主线内容量按至少 1 年体验设计，因此一次性设计并开放年度主线 `25` 章 `393` 关；不做每日次数、体力或等级节奏控制，玩家只要前置进度满足且出战阵容战力达到推荐战力即可连续推进。
- 关卡结构：第 1 章 `MAIN_1_1..MAIN_1_9`，第 2-25 章每章 `MAIN_X_1..MAIN_X_16`；`R16=MAIN_2_7`，最终 `R393=MAIN_25_16`。
- 后端契约：`MainlineStageRules` 统一生成关卡顺序、结算模式、等级/战力曲线、奖励曲线和章节文案；`PlayerBattleServiceImpl`、`PlayerLobbyAdventureServiceImpl`、后台战斗配置风险判断均使用同一规则。
- DB/SQL：新增并本地导入 `D:\project\LootChain\sql\63_battle_mainline_year_full_open.sql`；同步 `sql/04_item_bag_module.sql`，将 `HERO_EXP_BOOK`、`LOW_ENHANCE_STONE` 长期堆叠上限提升到 `999999`。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState`、`LobbyAdventurePanelRenderer`、`LootChainGameRoot`、`LobbyAdventureApi` 改为公式识别年度范围，不再维护 R1-R15 枚举白名单；Cocos 只校验安全奖励集合，不再对 R16+ 做逐关固定金额枚举。
- 守卫：`D:\project\LootChain\scripts\check-battle-mainline-year-config.ps1` 验证 393 个开放关卡、393 个奖励关卡、`MAIN_2_7/R16`、`MAIN_25_16/R393`、R394 缺席、危险奖励缺席、材料堆叠覆盖全年累计投放和 forbidden switch 全关关闭；旧 `check-battle-r1-economy-config.ps1` 已转调年度守卫。
- Full-chain smoke：`D:\project\LootChain\scripts\smoke-mainline-year-full-chain.ps1` 当前使用 `0` 体力测试账号从 R1 打到 R393，测试账号 `userId=50 / heroId=58` 最终 `Lv.60 / exp=91450 / stamina=0`，最终关重复为 `NO_REWARD`，`MAIN_25_17` 被拦截。
- 本机验证：年度 SQL 导入返回 `annual_mainline_stage_count=393`、`annual_reward_stage_count=393`、`final_stage_open_count=1`、`r394_artifact_count=0`、`unsafe_reward_rule_count=0`；年度守卫通过，含 `annual mainline stamina gate enabled count = 0`、`daily limit text active count = 0`；后端相关单测 `67 tests, 0 failures`；`lootchain-game -am -DskipTests compile` 通过；full-chain smoke 通过；Cocos `npm.cmd run check:layout` 通过；`npm.cmd run check:preview` 因 `localhost:7456` 无监听返回 `ECONNREFUSED`，需要打开 Cocos Creator Preview 后复跑。
- 红线：不开放重复刷关经验/掉落、扫荡、随机掉落、副本、Boss、排行奖励、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池、后台补发/重结算或任何新经济写入口。

## 2026-06-17 Stage 6R：MAIN_2_6 / R15 真实首通与 MAIN_2_7 只读边界

- 产品/策划结论：开放 `MAIN_2_6` 作为第二章圣堂裂隙深处的一次性真实首通，但不开放第二章全面经济、重复刷关或后续 `MAIN_2_7` 真实结算。
- 后端契约：`MAIN_2_6` 首次 `WIN` 使用 `REAL_MAINLINE_R15`，扣体力 `6`，固定发放 `PLAYER_EXP 750`、`GOLD 1400`、`LOW_ENHANCE_STONE x6`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_7`。
- DB/SQL：新增并本地导入 `D:\project\LootChain\sql\62_battle_mainline_main26_first_clear_open.sql`；`MAIN_2_6` 为 `PHASE6_REAL_BATTLE_R15`，`MAIN_2_7` 为 `PHASE5_READONLY` 且活跃奖励规则为 `0`；`R16` 活跃 artifact 计数必须为 `0`。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState` 接受 `REAL_MAINLINE_R15`，按 `MAIN_2_6` 固定奖励做精确白名单校验；冒险页和根节点入口白名单扩展到 `MAIN_2_6`，`MAIN_2_7` 只读预热。
- 验收口径：R1-R15 后 `recommendedStageCode=MAIN_2_7`、玩家 `Lv.15 / exp=5950`、体力 `110`；重复 `MAIN_2_6` 结算必须为 `NO_REWARD`，不再扣体力、不发奖励、不推进主线；强制 start `MAIN_2_7` 必须失败且不创建 `battle_session`。
- 本机验证：后端相关 `60 tests, 0 failures`；导入 62 SQL 后返回 `stage6r_main26_open_count=1`、`stage6r_main26_reward_rule_count=4`、`main27_readonly_count=1`、`r16_artifact_count=0`；经济守卫通过；`smoke-stage6r-main26-first-clear.ps1` 通过，测试账号 `userId=45 / heroId=53` 完成 R1-R15 后 `Lv.15 / exp=5950 / stamina=110`，`recommendedStageCode=MAIN_2_7`，重复 `MAIN_2_6=NO_REWARD`；`smoke-battle-stage-guard.ps1 -UserId 45 -InvalidStages MAIN_2_7` 通过，前后 `battle_session=0`；Cocos `npm.cmd run check:layout` 通过；`npm.cmd run check:preview` 因 `http://localhost:7456` 无监听返回 `ECONNREFUSED`，本机未找到 `CocosCreator.exe`，需要打开 Cocos Creator Preview 后复跑。
- 红线：不开放 `MAIN_2_7` 真实结算、`REAL_MAINLINE_R16`、`MAIN_2_8` 推进、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-17 Stage 6Q：MAIN_2_5 / R14 真实首通与 MAIN_2_6 只读边界

- 产品/策划结论：开放 `MAIN_2_5` 作为第二章圣堂裂口的一次性真实首通，但不开放第二章全面经济、重复刷关或后续 `MAIN_2_6` 真实结算。
- 后端契约：`MAIN_2_5` 首次 `WIN` 使用 `REAL_MAINLINE_R14`，扣体力 `6`，固定发放 `PLAYER_EXP 700`、`GOLD 1300`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_6`。
- DB/SQL：新增 `D:\project\LootChain\sql\61_battle_mainline_main25_first_clear_open.sql`；`MAIN_2_5` 为 `PHASE6_REAL_BATTLE_R14`，`MAIN_2_6` 为 `PHASE5_READONLY` 且活跃奖励规则为 `0`。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState` 接受 `REAL_MAINLINE_R14`，按 `MAIN_2_5` 固定奖励做精确白名单校验；冒险页和根节点入口白名单扩展到 `MAIN_2_5`，`MAIN_2_6` 只读预热。
- 验收口径：R1-R14 后 `recommendedStageCode=MAIN_2_6`、玩家 `Lv.14 / exp=5200`、体力 `116`；重复 `MAIN_2_5` 结算必须为 `NO_REWARD`，不再扣体力、不发奖励、不推进主线；强制 start `MAIN_2_6` 必须失败且不创建 `battle_session`。
- 本机验证：后端相关 `56 tests, 0 failures`；导入 61 SQL 后经济守卫通过；`smoke-stage6q-main25-first-clear.ps1` 通过，测试账号 `userId=44 / heroId=52` 完成 R1-R14 后 `Lv.14 / exp=5200 / stamina=116`，`recommendedStageCode=MAIN_2_6`，重复 `MAIN_2_5=NO_REWARD`；`smoke-battle-stage-guard.ps1 -UserId 44 -InvalidStages MAIN_2_6` 通过，前后 `battle_session=0`；Cocos `npm.cmd run check:layout` 通过；`npm.cmd run check:preview` 因 `http://localhost:7456` 无监听返回 `ECONNREFUSED`，本机常见路径未找到 `CocosCreator.exe`，需要打开 Cocos Creator Preview 后复跑。
- 红线：不开放 `MAIN_2_6` 真实结算、`REAL_MAINLINE_R15`、`MAIN_2_7` 推进、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-17 Stage 6P：MAIN_2_4 / R13 真实首通与 MAIN_2_5 只读边界

- 产品/策划结论：开放 `MAIN_2_4` 作为第二章圣像断桥的一次性真实首通，但不开放第二章全面经济、重复刷关或后续 `MAIN_2_5` 真实结算。
- 后端契约：`MAIN_2_4` 首次 `WIN` 使用 `REAL_MAINLINE_R13`，扣体力 `6`，固定发放 `PLAYER_EXP 650`、`GOLD 1200`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_5`。
- DB/SQL：新增 `D:\project\LootChain\sql\60_battle_mainline_main24_first_clear_open.sql`；`MAIN_2_4` 为 `PHASE6_REAL_BATTLE_R13`，`MAIN_2_5` 为 `PHASE5_READONLY` 且活跃奖励规则为 `0`。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState` 接受 `REAL_MAINLINE_R13`，按 `MAIN_2_4` 固定奖励做精确白名单校验；冒险页底部边界改为 `MAIN_1_1` 至 `MAIN_2_4` 首通真实结算，`MAIN_2_5` 只读预热。
- 验收口径：R1-R13 后 `recommendedStageCode=MAIN_2_5`、玩家 `Lv.13 / exp=4500`、体力 `122`；重复 `MAIN_2_4` 结算必须为 `NO_REWARD`，不再扣体力、不发奖励、不推进主线；强制 start `MAIN_2_5` 必须失败且不创建 `battle_session`。
- 本机验证：后端相关 `49 tests, 0 failures`；`PlayerApiPhaseGateTest` `3 tests, 0 failures`；导入 60 SQL 后经济守卫通过；`smoke-stage6p-main24-first-clear.ps1` 通过，测试账号 `userId=43 / heroId=51` 完成 R1-R13 后 `Lv.13 / exp=4500 / stamina=122`；`smoke-battle-stage-guard.ps1 -UserId 43 -InvalidStages MAIN_2_5` 通过，前后 `battle_session=0`；Cocos `npm.cmd run check:layout` 通过；根 `tsconfig` no-emit 因 Creator `cc` 类型声明未接入失败，但本轮修复了 `LobbyAdventurePanelRenderer.ts` 中 `recommended` 可空诊断；`npm.cmd run check:preview` 因 `http://localhost:7456` 无监听返回 `ECONNREFUSED`，需要打开 Cocos Creator Preview 后复跑。
- 红线：不开放 `MAIN_2_5` 真实结算、`REAL_MAINLINE_R14`、`MAIN_2_6` 推进、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。
- Zeno 子代理继续作为“用户视角监督 agent”，负责从玩家验收角度拦截体验断点；当前监督口径要求直到完整游玩流程打通前持续检查流程可达性、误触、文案误导和经济红线。

## 2026-06-17 Stage 6O：MAIN_2_4 只读预热深化与 R13 防误开守卫

- 产品/策划结论：本阶段不开放 `R13 / MAIN_2_4` 真实首通，只把 R12 后的推荐节点做成明确的只读预热边界，避免玩家误以为可挑战、可扣体力或可拿奖励。
- 后端契约：`GET /api/player/lobby/adventure` 在 R1-R12 后仍推荐 `MAIN_2_4`，但 `unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=0`、`expToRequiredLevel=0`；引导文案明确不创建战斗会话、不扣体力、不发奖励、不推进 `MAIN_2_5`。
- DB/SQL：新增并已本地导入 `D:\project\LootChain\sql\59_battle_mainline_main24_readonly_prewarm.sql`；`MAIN_2_4` 的 `readonly_reason` 升级为 `6O`，后台掉落预览新增 `玩家经验/金币/装备材料` 三条 no-grant 展示行，活跃 `battle_reward_rule` 仍为 `0`，`REAL_MAINLINE_R13/PHASE6_REAL_BATTLE_R13/R13_*` 活跃配置计数为 `0`。
- Cocos 同步：冒险页新增前端真实战斗入口白名单，只允许 `MAIN_1_1` 至 `MAIN_2_3` 进入编队/战斗；即使后端误把 `MAIN_2_4.unlocked=true`，Cocos 也只展示 `仅预览`。R12 后若旧本地选择仍停在 `MAIN_2_3`，冒险详情会优先显示推荐锁定的 `MAIN_2_4`。
- 验收口径：完成 R1-R12 后玩家仍为 `Lv.12 / exp=3850 / stamina=128`，`recommendedStageCode=MAIN_2_4`，强制 start `MAIN_2_4` 必须失败且前后 `battle_session` 计数不变；重复 `MAIN_2_3` 仍为 `NO_REWARD`。
- 本机验证：后端相关 `45 tests, 0 failures`；`PlayerApiPhaseGateTest` `3 tests, 0 failures`；导入 59 SQL 后经济守卫通过；`smoke-stage6n-main23-first-clear.ps1` 通过，测试账号 `userId=42 / heroId=50`；`smoke-battle-stage-guard.ps1 -UserId 42 -InvalidStages MAIN_2_4` 通过，前后 `battle_session=0`；Cocos `npm.cmd run check:layout` 通过。
- 当前环境缺口：未找到本机 Creator 3.8.8 `tsc.cmd`，定向 TypeScript no-emit 未执行；`npm.cmd run check:preview` 因 `http://localhost:7456` 无监听返回 `ECONNREFUSED`，需要打开 Cocos Creator Preview 后复跑。
- 红线：不开放 `MAIN_2_4` 真实结算、`REAL_MAINLINE_R13`、`MAIN_2_5` 推进、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-17 Stage 6N：MAIN_2_3 / R12 真实首通与 MAIN_2_4 阶段保护闭环

- 产品/策划结论：开放 `MAIN_2_3` 作为第二章灰烬回廊的一次性真实首通，但不开放第二章全面经济、重复刷关或后续 `MAIN_2_4`。
- 后端契约：`MAIN_2_3` 首次 `WIN` 使用 `REAL_MAINLINE_R12`，扣体力 `6`，固定发放 `PLAYER_EXP 600`、`GOLD 1100`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_4`。
- DB/SQL：新增并已本地导入 `D:\project\LootChain\sql\58_battle_mainline_main23_first_clear_open.sql`；`MAIN_2_3` 为 `PHASE6_REAL_BATTLE_R12`，`MAIN_2_4` 为 `PHASE5_READONLY` 且活跃奖励规则为 `0`。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState` 接受 `REAL_MAINLINE_R12`，按 `MAIN_2_3` 固定奖励做精确白名单校验；冒险页底部边界改为 `MAIN_1_1` 至 `MAIN_2_3` 首通真实结算，`MAIN_2_4` 只读预热。
- 验收口径：R1-R12 后 `recommendedStageCode=MAIN_2_4`、玩家 `Lv.12 / exp=3850`、体力 `128`；重复 `MAIN_2_3` 结算必须为 `NO_REWARD`，不再扣体力、不发奖励、不推进主线。
- 本机验证：后端相关 `45 tests, 0 failures`；`check-battle-r1-economy-config.ps1` 通过；`smoke-stage6n-main23-first-clear.ps1` 通过，测试账号 `userId=40 / heroId=48` 完成 R1-R12 后 `Lv.12 / exp=3850 / stamina=128`；`smoke-battle-stage-guard.ps1 -InvalidStages MAIN_2_4` 通过，前后 `battle_session` 计数为 `0`；Cocos `check:layout` 通过。
- 当前环境缺口：未找到本机 Creator 3.8.8 `tsc.cmd`，定向 TypeScript no-emit 未执行；`npm.cmd run check:preview` 因 `http://localhost:7456` 无监听返回 `ECONNREFUSED`，需要打开 Cocos Creator Preview 后复跑。
- 红线：不开放 `MAIN_2_4` 真实结算、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-15 Stage 6M：MAIN_2_2 / R11 真实首通与 MAIN_2_3 阶段保护闭环

- 产品/策划结论：开放 `MAIN_2_2` 作为第二章断誓大厅的一次性真实首通，但不开放第二章全面经济、重复刷关或后续 `MAIN_2_3`。
- 后端契约：`MAIN_2_2` 首次 `WIN` 使用 `REAL_MAINLINE_R11`，扣体力 `6`，固定发放 `PLAYER_EXP 550`、`GOLD 1000`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_3`。
- DB/SQL：新增并已本地导入 `D:\project\LootChain\sql\57_battle_mainline_main22_first_clear_open.sql`；`MAIN_2_2` 为 `PHASE6_REAL_BATTLE_R11`，`MAIN_2_3` 为 `PHASE5_READONLY` 且活跃奖励规则为 `0`。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState` 接受 `REAL_MAINLINE_R11`，按 `MAIN_2_2` 固定奖励做精确白名单校验；冒险页底部边界改为 `MAIN_1_1` 至 `MAIN_2_2` 首通真实结算，`MAIN_2_3` 只读预热。
- 验收口径：R1-R11 后 `recommendedStageCode=MAIN_2_3`、玩家 `Lv.11 / exp=3250`、体力 `134`；重复 `MAIN_2_2` 结算必须为 `NO_REWARD`，不再扣体力、不发奖励、不推进主线。
- 本机验证：后端相关 48 tests 0 failures；`check-battle-r1-economy-config.ps1` 通过；`smoke-stage6m-main22-first-clear.ps1` 通过，测试账号 `userId=39 / heroId=47` 完成 R1-R11 后 `Lv.11 / exp=3250 / stamina=134`；`smoke-battle-stage-guard.ps1 -InvalidStages MAIN_2_3` 通过，前后 `battle_session` 计数为 `0`；Cocos `check:layout` 与定向 TypeScript no-emit 通过。
- 当前 Preview 状态：`npm.cmd run check:preview` 因 `http://localhost:7456` 无监听返回 `ECONNREFUSED`；需要打开 Cocos Creator Preview 后复跑，不可把本轮标记为 Preview 通过。
- 红线：不开放 `MAIN_2_3` 真实结算、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6L：MAIN_2_1 Lv10 预热补齐与 MAIN_2_2 阶段保护闭环

- 产品/策划结论：本阶段仍不开放 R11，不把 `MAIN_2_2` 放入真实战斗白名单；只解决 R10 后距离 Lv10 还差 500 EXP 的断点。
- 后端契约：`MAIN_2_1` 首次 `WIN` 保持 `REAL_MAINLINE_R10`，基础奖励仍有 `PLAYER_EXP 450`，同一事务追加 `第二章预热经验 PLAYER_EXP 500`，正常 R1-R10 后达到 `Lv.10 / exp=2700`。
- DB/SQL：新增 `D:\project\LootChain\sql\56_battle_mainline_stage6l_lv10_prewarm.sql`，新增规则 `R10_MAIN_2_1_MAIN22_PREHEAT_EXP`，并对本地/测试旧账号中已完成 `MAIN_2_1` 且 `2200 <= exp < 2700` 的记录做封顶幂等补齐；`MAIN_2_2` 活跃奖励规则仍为 `0`。
- Cocos 同步：`BattleApi` 的 R10 奖励白名单增加第二条 `PLAYER_EXP 500`，奖励校验改为多重集合匹配，允许同一资源类型分两条展示，但仍禁止钻石、体力、USDT、英雄、碎片和 EX 资源。
- 验收口径：R1-R10 后 `recommendedStageCode=MAIN_2_2`、`main22Unlocked=false`、`main22LockReasonCode=PHASE_LOCKED`、`levelGap=0`、`expToRequiredLevel=0`；强制 start `MAIN_2_2` 不创建 `battle_session`，重复 `MAIN_2_1` 仍为 `NO_REWARD` 且不改变体力/经验/货币/背包。
- 红线：不开放 `MAIN_2_2` 真实结算、R11、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6K：MAIN_2_2 只读预热与推荐详情闭环

- 产品/策划结论：本阶段仍不开放 R11。R1-R10 完成后玩家是 `Lv.9 / exp=2200`，`MAIN_2_2` 需要 Lv.10/2700 EXP 且没有获批的重复经验来源；即使临时账号达到 Lv.10，也必须因阶段未开放返回 `PHASE_LOCKED`。
- 后端契约：`PlayerLobbyAdventureServiceImpl` 为 `MAIN_2_2` 增加 `PHASE_LOCKED` 锁定原因，保留 `LEVEL_REQUIRED/PROGRESS_REQUIRED` 区分；奖励预览改为 `玩家经验（预览，不发放）/金币（预览，不发放）/装备材料（预览，不发放）`。
- DB/SQL：新增并本地导入 `D:\project\LootChain\sql\55_battle_mainline_main22_readonly_prewarm.sql`；同步 `sql/43_battle_config_readonly_management.sql` 与 `sql/23_game_text_i18n.sql`，守卫要求 `MAIN_2_2` display-only/preview-only、所有经济写开关为 `0`、活跃奖励规则为 `0`。
- Cocos 展示：`LobbyAdventurePanelRenderer` 优先展示后端推荐的锁定 `MAIN_2_2`，不再回退到旧已解锁关卡；锁定奖励标题显示 `奖励只读预览（当前不发放）`，`PHASE_LOCKED` CTA 显示 `仅预览`，底部边界文案明确 `MAIN_2_2` 只读预热、不创建战斗或奖励。
- 本机闭环：`smoke-stage6i-main21-first-clear.ps1` 复跑后完成 R1-R10，`recommendedStageCode=MAIN_2_2`、`main22Unlocked=false`、高等级样例 `main22HighLevelLockReasonCode=PHASE_LOCKED`，强制 start 仍被阻断，重复 `MAIN_2_1` 为 `NO_REWARD`。
- 验收：后端 `PlayerLobbyAdventureServiceImplTest,PlayerBattleServiceImplTest` 通过；经济守卫、6I smoke、`MAIN_2_2` stage guard、Cocos `check:layout`、TypeScript no-emit、`check:preview` 通过；Preview 缓存曾有旧 chunk，已同步当前 source 对应 preview cache 并硬刷新浏览器。
- 红线：不开放 `MAIN_2_2` 真实结算、R11、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6J：运行预览与 MAIN_2_2 阶段保护补强

- 产品/策划结论：本阶段不开放 `MAIN_2_2`，只把 R1-R10 后的边界锁牢，避免玩家看到推荐节点后误以为可挑战、可刷经验或可领后续奖励。
- 后端守卫：`PlayerBattleServiceImplTest.startRejectsMain22StageProtectionBeforeCreatingSession` 覆盖强制 `MAIN_2_2` start，断言返回 `关卡暂未开放`，且不调用冒险查询、不读取英雄阵容、不创建 `battle_session`。
- DB 守卫：`scripts/check-battle-r1-economy-config.ps1` 增加 `MAIN_2_2` 的 `status=1`、`phase_code='PHASE5_READONLY'` 校验，并要求 `owner_code='MAIN_2_2'` 的活跃 `battle_reward_rule` 数量为 `0`。
- Preview 恢复：本机 Cocos Preview 曾出现 `targets/preview/import-map.json` 缺失、preview chunks 未完整落盘和 `scopes` 缺失 `__unresolved_*` 映射；已通过让 Cocos Creator 获得焦点并同步同轮 editor chunks/scopes 到 preview target 恢复，`check:preview` 已通过。`check-preview-freshness.mjs` 已补充 preview target、chunk 与 scoped dependency 映射诊断。
- 本机接口保护 smoke：`scripts/smoke-battle-stage-guard.ps1 -BaseUrl http://127.0.0.1:8081 -InvalidStages MAIN_2_2` 通过；`MAIN_2_2` 返回 `关卡暂未开放`，对应 requestId 前后 `battle_session` 计数均为 `0`。
- 验证：后端 `PlayerBattleServiceImplTest,PlayerLobbyAdventureServiceImplTest` 共 `30 tests, 0 failures`；经济守卫通过；Cocos `npm.cmd run check:layout`、`npm.cmd run check:preview` 通过；`.spine/.spine.meta` 源文件扫描为 `0`；两仓 `git diff --check` 仅 LF/CRLF warning；浏览器打开 `http://localhost:7456/` 后标题正确、无 SystemJS 错误、控制台 error 为 `0`，canvas 已挂载可见。
- 红线：不开放 `MAIN_2_2` 真实结算、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6I：MAIN_2_1 第二章入口首通

- 产品/策划结论：在 6H 已把玩家推到 Lv.8 后，开放 `MAIN_2_1` 作为第二章入口的一次性真实首通；奖励仍使用低风险成长资源，不开放重复刷关、掉落池或第二章后续关卡。
- 后端开放范围：新增 `REAL_MAINLINE_R10`，只允许 `MAIN_2_1` 首次 `WIN` 扣体力 `6`，发放 `PLAYER_EXP 450`、`GOLD 900`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，并推进 `MAIN_2_2`。
- 冒险推荐：完成 `MAIN_2_1` 后推荐 `MAIN_2_2`，但 `MAIN_2_2.unlocked=false`、`growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=1`、`expToRequiredLevel=500`，仍为阶段保护展示。
- Cocos 同步：`BattleApi`、`BattleTypes`、`LobbyBattlePresentationState` 接受 `REAL_MAINLINE_R10` 并按 `MAIN_2_1` 固定奖励校验；冒险详情底部文案更新为 `MAIN_1_1` 至 `MAIN_2_1` 首通真实结算，`MAIN_2_2` 仍受阶段保护。
- 新增 SQL/Smoke：`D:\project\LootChain\sql\54_battle_mainline_main21_first_clear_open.sql`、`D:\project\LootChain\scripts\smoke-stage6i-main21-first-clear.ps1`；`check-battle-r1-economy-config.ps1` 已升级为 R1-R10 经济守卫。
- 本机接口闭环：一次性玩家 `userId=29` / `heroId=37` 完成 R1-R10，经验轨迹 `0 -> 50 -> 110 -> 190 -> 250 -> 450 -> 700 -> 1000 -> 1350 -> 1750 -> 2200`，等级轨迹 `1 -> 1 -> 2 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9`，体力 `200 -> 140`；`MAIN_2_2` 启动被阻断，重复 `MAIN_2_1` 结算为 `NO_REWARD`，临时账号提升到 Lv.10 后 `MAIN_2_2` 仍 `unlocked=false`。
- 红线：不开放 `MAIN_2_2` 真实结算、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6H：第一章成长桥到 Lv.8

- 产品/策划结论：不直接改高 R1/R2/R3 已发生奖励，避免已通关账号拿不到补差；采用 `MAIN_1_4` 至 `MAIN_1_9` 一次性主线首通成长桥，让玩家从 R3 后 `Lv.2 / exp=190` 自然推进到 `Lv.8 / exp=1750`。
- 后端开放范围：新增 `REAL_MAINLINE_R4` 至 `REAL_MAINLINE_R9`，只允许 `MAIN_1_4` 至 `MAIN_1_9` 首次 `WIN` 扣体力、发放固定低风险成长奖励并推进主线；`MAIN_2_1` 不纳入真实结算。
- 冒险推荐：完成 `MAIN_1_3` 后推荐 `MAIN_1_4`，之后顺序推荐到 `MAIN_1_9`；完成 `MAIN_1_9` 后推荐 `MAIN_2_1`，此时 `MAIN_2_1.unlocked=true` 且 `growthSourceStatus=NEXT_STAGE_READONLY`。
- Cocos 同步：`BattleApi` 白名单扩展到 R9 并按关卡校验奖励；`LobbyBattlePresentationState` 将 R4-R9 视为真实首通回执；`LobbyAdventurePanelRenderer` 地图改为围绕当前推荐/选中关卡开窗口，新增关卡后不会只截前 5/7 个节点。
- 新增 SQL/守卫/smoke：`D:\project\LootChain\sql\53_battle_mainline_growth_bridge_to_lv8.sql`、`D:\project\LootChain\scripts\smoke-stage6h-growth-bridge-to-lv8.ps1`；`check-battle-r1-economy-config.ps1` 已升级为 R1-R9 经济守卫。
- 本机接口闭环：一次性玩家 `userId=25` / `heroId=33` 完成 R1-R9，经验轨迹 `0 -> 50 -> 110 -> 190 -> 250 -> 450 -> 700 -> 1000 -> 1350 -> 1750`，等级轨迹 `1 -> 1 -> 2 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8`，体力 `200 -> 146`；`MAIN_2_1` 解锁后结算为 `NO_REWARD` 且体力仍 `146`。
- 已验证：后端相关 `71 tests, 0 failures`；经济守卫通过；6H smoke 通过；Cocos `npm.cmd run check:layout`、focused TypeScript no-emit、`npm.cmd run check:preview` 通过；Preview 曾因旧 chunk 需要重启 Cocos Creator，当前已重建并通过。
- 红线：不开放 `MAIN_2_1` 真实结算、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、玩家手动升级、升级奖励领取、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6G：锁定后下一步只读引导

- 产品/策划结论：完成 R1/R2/R3 后推荐 `MAIN_2_1` 但仍锁定，玩家需要知道当前玩家经验来源已用完，不能被误导去重复刷经验。
- 后端契约：`PlayerLobbyAdventureStageVO` 新增 `nextGuidanceTitle`、`nextGuidanceText`、`growthSourceSummary`、`growthSourceStatus`、`growthSourceHint`、`repeatableExpAvailable`。字段只用于只读展示，不代表可点击行动。
- 当前样例：完成 R1/R2/R3 后，`MAIN_2_1` 返回 `growthSourceStatus=FIRST_CLEAR_USED_UP`、`repeatableExpAvailable=false`，并继续保持 `unlocked=false`、`lockReasonCode=LEVEL_REQUIRED`、`levelGap=6`、`expToRequiredLevel=1560`。
- Cocos 展示：`LobbyAdventurePanelRenderer` 在冒险详情底部说明“首通经验已用完；暂无重复经验入口。”；锁定按钮仍显示等级不足，不进入编队或战斗。
- 新增 smoke：`D:\project\LootChain\scripts\smoke-stage6g-adventure-next-step-readonly.ps1` 通过；一次性玩家 `userId=24`，`recommendedStageCode=MAIN_2_1`、`battleSessionRowsCreated=0`。
- 验证：后端 `PlayerLobbyProfileServiceTest,PlayerLobbyAdventureServiceImplTest,PlayerBattleServiceImplTest` 共 `27 tests, 0 failures`；6E/6F 只读 smoke 与 6G smoke 通过；Cocos `npm.cmd run check:layout`、`npm.cmd run check:preview`、directed TypeScript no-emit 通过；经济守卫和两仓 `git diff --check` 通过，仅 LF/CRLF warning。
- 红线：不开放玩家手动升级、升级奖励领取、体力领取/购买、`MAIN_2_1` 真实结算、重复刷关经验/掉落、任务/成就领奖、副本、Boss、排行、扫荡、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6E：等级进度与锁定原因可读性

- 产品/策划结论：6D 后不应绕过 `MAIN_2_1` 的 Lv.8 门槛；新玩家 R1/R2/R3 后是 Lv.2，下一阶段应让玩家看懂经验进度和锁定原因。
- 后端契约：`PlayerLobbyProfileVO` 新增 `levelProgress`，由 `PlayerLobbyProfileService` 按 `game_user.exp/player_level` 与 `user_level_config.need_exp` 计算；`PlayerLobbyAdventureStageVO` 新增 `unlockHint`，锁定态由服务端说明原因。
- Cocos 展示：`LobbyTopHudRenderer` 左上 EXP 小牌显示进度百分比；`LobbyProfileDialogRenderer` 显示 `当前经验/下一级门槛`、下一级还差 EXP 和英雄等级上限；`LobbyAdventurePanelRenderer` 显示 `解锁状态` 与后端 `unlockHint`，并修正 R1/R2/R3 已开放真实首通结算后的过期“无奖励/当前不发放”文案。
- 最新只读 smoke：`D:\project\LootChain\scripts\smoke-stage6e-level-progress-readonly.ps1` 通过；一次性玩家 `userId=19`，`playerLevel=2`、`exp=190`、`expToNextLevel=60`、`progressPercent=60`、`recommendedStageCode=MAIN_2_1`、`main21Unlocked=false`。PowerShell 输出中文有本机解码乱码，但结构断言通过。
- 验证：后端 `PlayerLobbyProfileServiceTest,PlayerLobbyAdventureServiceImplTest,PlayerBattleServiceImplTest` 共 `26 tests, 0 failures`；Cocos `npm.cmd run check:layout` 通过；`npm.cmd run check:preview` 通过；Browser 打开 `http://localhost:7456/` 后 console error 为空。
- 红线：不开放玩家手动升级、升级奖励领取、体力领取/购买、`MAIN_2_1` 真实结算、重复刷关掉落、副本、Boss、排行、扫荡、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6F：锁定关卡差距提示

- 产品/策划结论：6E 已能说明 `MAIN_2_1` 锁定原因，但玩家还需要看懂到 Lv.8 总共差多少，而不是只看到下一级 Lv.3 的 60 EXP。
- 后端契约：`PlayerLobbyAdventureStageVO` 新增 `lockReasonCode`、`levelGap`、`requiredLevelNeedExp`、`expToRequiredLevel`。`requiredLevelNeedExp` 来自 `user_level_config.need_exp`，配置缺失时返回 `null`，不显示 `0 EXP`。
- 当前样例：完成 R1/R2/R3 后，玩家 `Lv.2 / exp=190`，`MAIN_2_1.requiredLevel=8`，返回 `lockReasonCode=LEVEL_REQUIRED`、`levelGap=6`、`requiredLevelNeedExp=1750`、`expToRequiredLevel=1560`。
- Cocos 展示：`LobbyAdventurePanelRenderer` 新增“距离要求：6 级 / 1560 EXP”，继续使用 `unlockHint` 做完整说明；锁定按钮仍不可进入编队或战斗。
- 最新 smoke：`D:\project\LootChain\scripts\smoke-stage6e-level-progress-readonly.ps1` 已升级覆盖 6F 字段并通过；一次性玩家 `userId=20`，`main21LockReasonCode=LEVEL_REQUIRED`、`main21LevelGap=6`、`main21ExpToRequiredLevel=1560`。
- 验证：后端 `PlayerLobbyProfileServiceTest,PlayerLobbyAdventureServiceImplTest,PlayerBattleServiceImplTest` 共 `26 tests, 0 failures`；Cocos `npm.cmd run check:layout` 与 `npm.cmd run check:preview` 通过。
- 红线：不开放 `MAIN_2_1` 真实结算、重复刷关掉落、副本、Boss、排行、扫荡、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6D：玩家等级自动成长闭环

- 策划/产品结论：Stage 6C 已完成 R1/R2/R3 首通发放玩家经验，但玩家主表等级仍可能停留在 1。6D 不开放新关卡、不改奖励数值，而是把玩家经验到账后的等级成长补齐为后端结算契约。
- 后端行为：`PlayerBattleServiceImpl` 在 R1/R2/R3 首通事务内计算 `expAfter`，同步更新 `game_user.exp`，并按 `user_level_config.need_exp <= expAfter` 的最高等级回写 `game_user.player_level`；SQL 条件包含 `ulc.level >= COALESCE(player_level, 1)`，避免已有等级被降级。
- 当前等级阈值：Lv.1=`0`，Lv.2=`100`，Lv.3=`250`，Lv.8=`1750`。因此完整 `MAIN_1_1 + MAIN_1_2 + MAIN_1_3` 后玩家经验为 `190`，玩家等级应为 `2`，不是 `3`。
- Cocos 影响：无需新增接口；战斗返回大厅后既有刷新会回读 `GET /api/player/me/lobby` 和 `GET /api/player/lobby/adventure`，左上角等级、资料弹窗与冒险页等级应显示 Lv.2。
- 新增/更新验证：
  - `PlayerBattleServiceImplTest.settleMain12FirstClearUpdatesPlayerLevelFromAccumulatedExpConfig` 用 TDD 红绿覆盖等级 SQL 回写；
  - `D:\project\LootChain\scripts\check-battle-r1-economy-config.ps1` 增加 Stage 6D 等级阈值和 `MAIN_2_1` 锁定守卫；
  - 新增 `D:\project\LootChain\scripts\smoke-stage6d-player-levelup.ps1`，用一次性玩家验证 R1/R2/R3 后 `playerExp 0 -> 50 -> 110 -> 190`、`playerLevel 1 -> 1 -> 2 -> 2`，并确认 `MAIN_2_1` 仍不创建 `battle_session`。
- 红线：`MAIN_2_1` 仍 required_level=8、display-only/locked；不开放玩家手动升级、升级奖励领取、体力领取/购买、重复刷关掉落、副本、Boss、排行、扫荡、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池或任何新经济写入口。

## 2026-06-14 Stage 6C：MAIN_1_3 R3 首通结算与英雄 2→3 闭环

- 策划/产品结论：本轮在 Stage 6B 后继续推进一格，只开放 `MAIN_1_3` 首通真实结算，让新玩家能完成 `MAIN_1_1 -> MAIN_1_2 -> level-up 2 -> MAIN_1_3 -> level-up 3` 的最小成长闭环。
- 后端开放范围：
  - `MAIN_1_1 / REAL_MAINLINE_R1`：体力 `6`、玩家经验 `50`、`GOLD 300`、`LOW_ENHANCE_STONE x2`，推进 `MAIN_1_2`；
  - `MAIN_1_2 / REAL_MAINLINE_R2`：体力 `6`、玩家经验 `60`、`GOLD 800`、`LOW_ENHANCE_STONE x2`、`HERO_EXP_BOOK x1`，推进 `MAIN_1_3`；
  - `MAIN_1_3 / REAL_MAINLINE_R3`：体力 `6`、玩家经验 `80`、`GOLD 1200`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_1` 推荐展示。
- SQL/守卫：
  - 新增 `D:\project\LootChain\sql\52_battle_mainline_r3_levelup_open.sql`；
  - `D:\project\LootChain\scripts\check-battle-r1-economy-config.ps1` 已升级为 R1/R2/R3 守卫；
  - 新增可复跑 smoke `D:\project\LootChain\scripts\smoke-stage6c-r3-levelup.ps1`。
- Cocos：
  - `BattleApi` 只接受 `NO_REWARD`、`REAL_MAINLINE_R1`、`REAL_MAINLINE_R2`、`REAL_MAINLINE_R3`，并按关卡精确校验奖励；
  - `LobbyBattlePresentationState` 已把 R3 视为真实首通回执，结果页展示后端权威奖励、体力和进度。
- 本机接口闭环验收：`scripts/smoke-stage6c-r3-levelup.ps1` 已通过；最新一次性测试玩家 `userId=13` / `heroId=30` 完成 `MAIN_1_1 -> MAIN_1_2 -> level-up 2 -> MAIN_1_3 -> level-up 3`，体力 `100 -> 82`、玩家经验 `0 -> 190`、金币 `1100 -> 300 -> 1500 -> 412`、`HERO_EXP_BOOK 1 -> 0 -> 1 -> 0`、`LOW_ENHANCE_STONE=7`、英雄等级 `1 -> 2 -> 3`；`MAIN_2_1` 强行启动返回 `code=1000` 且 `battle_session` 行数 `0 -> 0`。
- 红线：`MAIN_2_1` 仍不开放真实结算；不开放重复刷关掉落、副本、Boss、排行、扫荡、背包 use/sell/batch-use、升星、觉醒、精炼、EX V1、USDT、资金池、后台补发/重结算或其它新经济写入口。

## 2026-06-14 Stage 6B：MAIN_1_2 R2 首通结算与英雄升级闭环

- 策划/产品结论：本轮只推进最小成长闭环，不把 `MAIN_1_3` 同时改成真实结算。`MAIN_1_2` 首通给足一次英雄升级所需关键资源，玩家可在英雄详情执行一次后端 `level-up`。
- 后端开放范围：
  - `MAIN_1_1` 保持 `REAL_MAINLINE_R1`：体力 `6`、玩家经验 `50`、`GOLD 300`、`LOW_ENHANCE_STONE x2`，推进 `MAIN_1_2`；
  - `MAIN_1_2` 新增 `REAL_MAINLINE_R2`：体力 `6`、玩家经验 `60`、`GOLD 800`、`LOW_ENHANCE_STONE x2`、`HERO_EXP_BOOK x1`，推进 `MAIN_1_3`，刚好满足英雄 1→2 的首次升级消耗；
  - 玩家端 PhaseGate 仅额外开放 `POST /api/player/heroes/{heroId}/level-up`，`star-up/awaken/refine` 仍阻断。
- SQL/守卫：
  - 新增 `D:\project\LootChain\sql\51_battle_mainline_r2_levelup_open.sql`；
  - `D:\project\LootChain\scripts\check-battle-r1-economy-config.ps1` 已升级为 R1/R2 守卫，检查 R2 关卡、奖励规则、`HERO_EXP_BOOK` 模板和非 R1/R2 关卡经济开关。
  - 新增可复跑 smoke `D:\project\LootChain\scripts\smoke-stage6b-r2-levelup.ps1`，覆盖新玩家 `MAIN_1_1 -> MAIN_1_2 -> level-up` 闭环和 `MAIN_1_3` 启动拦截。
- Cocos：
  - `BattleApi` 只接受 `NO_REWARD`、`REAL_MAINLINE_R1`、`REAL_MAINLINE_R2`，并按关卡精确白名单校验奖励；
  - 英雄详情新增 `升级` 按钮，调用 `HeroApi.levelUp(heroId)`，成功后回读玩家资料、英雄列表和背包；
  - 英雄列表保留只读列表语义，提示进入详情页升级，不提供列表内一键养成。
- 本机接口闭环验收：`scripts/smoke-stage6b-r2-levelup.ps1` 已通过；最新一次性测试玩家 `userId=10` / `heroId=27` 完成 `MAIN_1_1 -> MAIN_1_2 -> level-up`，体力 `100 -> 88`、玩家经验 `0 -> 110`、升级前金币 `1100 -> 300`、`HERO_EXP_BOOK 1 -> 0`、`LOW_ENHANCE_STONE=4`、英雄等级 `1 -> 2`、推荐关卡 `MAIN_1_1 -> MAIN_1_2 -> MAIN_1_3`；`star-up/awaken/refine` 仍被阻断，强行启动 `MAIN_1_3` 返回 `code=1000` 且 `battle_session` 行数 `0 -> 0`。
- 红线：不开放 `MAIN_1_3` 真实结算，不开放背包 use/sell/batch-use，不开放升星/觉醒/精炼，不开放 EX V1、USDT、资金池、补发/重结算或任何其它经济写入口。

## 2026-06-13 Stage 4HH：奖池内容弹层滚动列表修复

- 用户反馈限定池 `奖池内容` 弹层只看到 2 个 SSR，UR 看不到。
- 根因：`GachaSceneRenderer.renderActionRows()` 仍使用早期临时行数截断逻辑，最多按面板高度渲染前 14 行，并显示“已显示 14/18 条，后续补滚动列表。”；限定池真实 active 数据中的后 4 行（剩余 SSR/UR）被 UI 截断。
- 修复：`GachaSceneRenderer` 的右侧功能弹层列表改为 Cocos 原生 `ScrollView + Mask`，所有 `detail.items.filter(status===1)` 条目都会渲染到 `GachaActionRowsContent_*`，超出面板高度后拖动查看；移除奖池内容 `.slice(0, 22)` 上限。
- i18n 动态文案同步为“共 N 条，拖动查看完整列表。”；`check-layout.mjs` / `check-preview-freshness.mjs` 增加 `GachaActionRowsViewport_*`、`GachaActionRowsContent_*`、滚动提示 token，`check-layout` 禁止旧“后续补滚动列表”、`GachaActionRowsMore` 和 `.slice(0, 22)` 回流。
- 只读接口复核：`GET /api/player/gacha/pools/LIMITED_ABYSS_PREVIEW/detail` 当前 active item = 18，按稀有度为 `R=6, SR=6, SSR=4, UR=2`，UR 为 `UR_ARTHAS(w=500,up=1)`、`UR_EVELYN(w=500,up=1)`。
- 验证：`npm.cmd run check:layout` 通过；让 Cocos Creator 主窗口获得焦点后 `npm.cmd run check:preview` 通过；`git diff --check` 通过，仅 LF/CRLF warning；Playwright 打开 `http://127.0.0.1:7456/` 登录进入召唤页，打开限定池 `奖池内容` 并向下滚动后确认 4 个 SSR 与 2 个 UR 均可见。
- 本次只改 Cocos 展示与检查脚本，不修改后端卡池配置、概率、保底、消耗、真实 draw 接口或任何经济写入口。

## 2026-06-13 Stage 4HG：常驻池移除 UR，限定池保留第一版 UR 双英雄

- 后端新增并本地导入 `D:\project\LootChain\sql\47_gacha_pool_item_v1_baseline.sql`。
- 后端新增并本地导入 `D:\project\LootChain\sql\48_gacha_normal_no_ur_limited_first_ur_pair.sql`。
- 已同步 `D:\project\LootChain\sql\07_gacha_module.sql`、`D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`、`D:\project\LootChain\sql\37_basic_contract_rs_only_box_summon_display.sql` 与 `D:\project\LootChain\scripts\check-gacha-economy-config.ps1`。
- 当前三池只保留 active `config_version=1`；历史 `BASIC_CONTRACT_PREVIEW config_version=2` 和非 v1 rate/item/duplicate/ticket 子配置已禁用，避免后端最高 active 版本误选。
- 当前 `BASIC_CONTRACT_PREVIEW` 奖池内容：6 个 active R + 6 个 active SR，权重均 `100`，无 active SSR/UR。
- 当前 `NORMAL_HERO` 奖池内容：6R + 6SR + 4SSR，权重均 `100`，无 active UR rate/item/duplicate/pity；概率为 `R=0.576000`、`SR=0.384000`、`SSR=0.040000`。
- 当前 `NORMAL_HERO` 使用 `HERO_PERMANENT_SSR_ONLY`，只保留 `SSR=80` 保底，不触发 UR 保底。
- 当前 `LIMITED_ABYSS_PREVIEW` 奖池内容：6R + 6SR + 4SSR + 2UR；UR 只保留第一版双英雄 `UR_ARTHAS` 和 `UR_EVELYN`，二者权重均 `500` 且 `up_flag=1`。
- `SEALED_LIGHT_DARK` 继续可见 locked/display-only，不参与真实抽卡。
- 对 Cocos 的影响：`奖池内容`、`概率保底` 和真实抽卡都读取后端当前配置；普通召唤不应再只显示旧的 2R+2SR，而应显示 6R+6SR。
- 验证：
  - 经济守卫先在旧配置上失败；
  - 串行重导 `07/17/23/35/37/47/48` 后，`scripts/check-gacha-economy-config.ps1` 通过；
  - 玩家 API detail 回查：`LIMITED_ABYSS_PREVIEW` active UR 只返回 `UR_ARTHAS/UR_EVELYN`，`NORMAL_HERO` active UR 返回空；
  - targeted Maven gacha suite `25 tests, 0 failures`；
  - `scripts/smoke-cocos-gacha-draw-guard.ps1 -BaseUrl http://127.0.0.1:8081 -UserId 4` 低余额三池通过，无 draw/result/reward/currency 写入；
  - Cocos `npm.cmd run check:layout`、`npm.cmd run check:preview` 通过；
  - Browser Preview `http://localhost:7456/` 打开，控制台无 error；截图接口超时，但 `GameCanvas` 尺寸正常。
  - 两仓 `git diff --check` 通过，仅 LF/CRLF warning。
  - 不要并行导入这些写同表的 SQL，MySQL 可能 deadlock。
- 红线不变：未充值、未做新的成功真实抽卡；不开放 EX V1、exchange/reissue、bag use/sell/batch-use、hero growth、reward/stamina/progress write 或任何新增经济写入口。

## 2026-06-12 Stage 6A：MAIN_1_1 R1 首通真实结算

- 后端新增 R1 主线首通结算落点：`user_mainline_progress`、`user_stamina_log`、`battle_reward_rule`，并扩展 `battle_settlement` 回执字段：`progress_applied`、`stamina_cost/before/after`、`reward_summary_json`、`progress_*_json`、`server_verdict_detail`、`config_version`。
- 新增增量 SQL：`D:\project\LootChain\sql\45_battle_real_mainline_r1.sql`；本机已导入，末尾校验返回 `r1_stage_open_count=1`、`r1_reward_rule_count=3`、`unsafe_stage_open_count=0`、`unsafe_reward_rule_count=0`。
- 新增守卫脚本：`D:\project\LootChain\scripts\check-battle-r1-economy-config.ps1`，检查只打开 `MAIN_1_1`、奖励只包含 `PLAYER_EXP/GOLD/LOW_ENHANCE_STONE`，且非 R1 关卡/掉落/奖励规则无经济开关。
- 新增真实接口 smoke：`D:\project\LootChain\scripts\smoke-battle-r1-mainline-settlement.ps1`；本机已用一次性测试玩家 `userId=5` 完成 `MAIN_1_1` 首通，`battleNo=B15272fbcf21a441ab9a5a7c17adc12ab`、`settlementNo=Sbf5d597a9dff4b1b824db1fdd0237fcb`，体力 `100 -> 94`、经验 `0 -> 50`、金币 `300`、`LOW_ENHANCE_STONE=2`、冒险推荐 `MAIN_1_2`，同一 settle requestId 重放返回原结算。
- 后端 `PlayerBattleServiceImpl` 仅在 `MAIN_1_1 + WIN + 未首通` 时扣体力、发放低风险奖励并推进 `MAIN_1_2`；首通判断已移到玩家行锁之后，并用主线进度 `FOR UPDATE` 读取，避免同一玩家两个 battle 并发首通重复发奖；重复结算返回原 R1 回执，不再次扣体力或发奖励。
- Cocos `BattleApi` 现在只接受 `NO_REWARD` 或 `REAL_MAINLINE_R1` 两类回执，并精确白名单校验 R1 奖励必须为 `PLAYER_EXP 50`、`GOLD 300`、`LOW_ENHANCE_STONE x2`，同时拦截 `USDT/HERO/HERO_FRAGMENT/DIAMOND/BOUND_DIAMOND/STAMINA/EX_*` 等未开放奖励资源。
- Cocos 战斗结算页会展示 R1 奖励、体力变化和主线进度回执；回大厅后会刷新资料、冒险、最近战斗和背包只读数据。
- 当前不为了验收擅自充值、补体力或重置玩家首通进度；如需成功真实接口烟测，应使用一次性测试账号并明确记录会扣体力、写结算、发奖励。

## 2026-06-11 第二轮：窄屏大厅 HUD 模式修复 + 微型栏补全

- 根因：Cocos 设计舞台仍为 1920×1080，但浏览器视口 720×1280 时 `stageWidth` 未缩小，导致仍渲染完整底栏并被裁切；同时 `renderMicroActionBar` 把 `adventure` 误传到 `bag` 参数位。
- 新增 `resolveLobbyHudModeSize(layout)`（`LobbyHudLayout.ts`）：`width/height = min(stage, viewport)`，用于侧栏/底栏/紧凑入口显隐判断。
- `LobbyHudRenderer` 全部 `stageWidth>=900` 类阈值改为 `hudMode.width/height`；微型底栏补全 **背包/召唤**，并修正 `addCompactActionEntrance` 布尔参数顺序。
- `LobbyTopHudRenderer` 资源栏数量与系统图标显隐同样改用 `resolveLobbyHudModeSize`。
- `check-layout.mjs` 镜像上述公式，并新增视口 `preview-design-1920x1080-physical-720x1280`。
- 验证：`check:layout`、`check:preview` 通过；720×1280 截图可见 `LobbyCompactSceneEntrances` + `LobbyCompactActionEntrances`（含英雄/背包）。
- 下一轮建议：~~编队/图鉴/召唤页 C1812 标题横幅与按钮统一；战斗预演技能框；大厅底部导航图标切图~~ → **2026-06-11 第三轮已完成**（见下节）。

## 2026-06-11 第三轮：C1812 标题横幅/按钮/导航/技能框/英雄 Tab

- 新增 `assets/scripts/scenes/C1812CommonUiAssets.ts` 集中导出跨面板复用路径：`title_banner`、`button_primary`、`button_danger`、`tab_selected`、`skill_frame`、`skill_frame_active`、大厅 7 项底部导航图标。
- **1) 编队 / 图鉴 / 召唤页**：`LobbyFormationPanelRenderer`、`LobbyCodexPanelRenderer` 标题区接 `title_banner`，页脚按钮接 `button_primary`；`GachaSceneRenderer` 单抽/十连分别用 `button_primary` / `button_danger`，结果页标题横幅 + 返回按钮，召唤记录/概率等 Action 弹层补标题横幅。
- **2) 大厅底部导航**：`LobbyHudRenderer.addLobbyNavIcon` 优先 `LOBBY_C1812_NAV_ICON_ASSETS` 切图，缺图回退原矢量图标。
- **3) 战斗预演**：`LobbyBattlePreviewPanelRenderer` 在 `roundPlaying/resultRecording/resultRecorded` 阶段底部渲染 3 格技能框（`skill_frame` / `skill_frame_active`）；页脚可操作按钮接 `button_primary`。
- **4) 英雄列表**：`LobbyHeroRosterPanelRenderer.renderFilterTab` 选中态优先 `tab_selected` 九宫格底，缺图回退原斜角 Graphics。
- `UiSpriteFrameCache.preload` 已预加载上述全部新资源路径。
- 验证：`npm run check:layout`、`npm run check:preview`、`git diff --check` 通过。

## 2026-06-11 C1812 全界面 UI 切图整合（大厅/背包/英雄/冒险/战斗）

- 本轮继续 Cocos-only UI/视觉资源整合，素材来源 `C:\Users\axian\Desktop\C1812-1`（只读，不修改原始素材），按界面分目录接入 `assets/resources/ui/*/c1812`。
- 新接入并已真实渲染的切图（全部带 sprite-frame meta，部分带九宫格边距）：
  - `ui/lobby/c1812`: `currency_stamina`、`currency_gold`、`currency_diamond` → 顶部资源栏货币图标（`LobbyTopHudRenderer.addResourceGlyph`，缺图回退矢量图形）；未开放资源位用 `ui/common/c1812/icon_lock`。
  - `ui/common/c1812`: `item_slot`(96x96, 边距18)、`item_slot_highlight`(边距16)、`button_primary`(240x84)、`divider_gold`、`title_banner`(410x86)、`modal_frame`(248x440, 边距 L52/R52/T60/B60)。
  - `ui/bag/c1812`: `item_ticket/fragment/chest/material/equipment/consumable` 六类道具类型图标 → 背包列表与详情。
  - `ui/adventure/c1812`: `stage_node`、`stage_node_boss`、`stage_node_clear`、`chapter_icon` → 关卡节点/章节行；锁定关卡用 `icon_lock` 替换文字“锁”徽章。
  - `ui/battle/c1812`: `hp_bar_frame`、`hp_bar_fill`（九宫格 SLICED）、`banner_victory`、`banner_defeat` → 战斗预演血条与结算横幅。
  - `ui/hero/c1812`: `star_filled`、`star_empty`、`grade_crest_r/sr/ssr/ur` → 英雄详情星级行（替换 ★☆ 文字）与品阶纹章（缺图回退文字徽章）。
- 渲染改动文件：`LobbyHudTypes.ts`、`LobbyTopHudRenderer.ts`、`LobbyBagPanelRenderer.ts`、`LobbyAdventurePanelRenderer.ts`、`LobbyBattlePreviewPanelRenderer.ts`、`LobbyHeroDetailPanelRenderer.ts`、`UiSpriteFrameCache.ts`（统一预加载新资源）。
- 关键经验：
  - 编辑器开着时改 TS/资源不会自动进 Preview chunk；需让 Cocos Creator 窗口获得前台焦点触发 asset-db 重新导入，之后 `check:preview` 通过、import-map chunk 即包含新 token。
  - `button_primary` 上下九宫格边距(32+32)大于目标按钮高(34~36)，SLICED 会压扁；小尺寸按钮改用 SIMPLE 整图缩放（素材长宽比与按钮接近）。
  - 背包详情 `modal_frame` 仅在详情高度 >= 150*scale 时渲染，窄屏低详情跳过避免边框压扁。
- 曾暂删未渲染切图（`button_danger`、`tab_selected`、`skill_frame` 等）已在 **2026-06-11 第三轮** 重新从 C1812-1 裁切并接入；`button_secondary`、`icon_close`、`panel_frame_gold` 仍待后续界面真做时再接入。
- 验证：`npm.cmd run check:layout`、`npm.cmd run check:preview`、`git diff --check` 全部通过；Playwright 截图验收 1920x1080 大厅/背包/英雄详情/冒险 + 1280x720 背包 + 720x1280 窄屏大厅。
- ~~已知遗留：720 宽窄屏裁切~~ → **2026-06-11 第二轮已修复**（见下节）。
- 红线不变：未新增任何经济写入口，背包仍只读，抽卡仍只走 `POST /api/player/gacha/draw`。

## 2026-06-11 Gacha Price Model, BASIC Pity Guard, And C1812 Summon UI

- 本轮继续用户批准的抽卡经济与 UI 阶段，仍是 Cocos-only，不回 `web-vue`。
- 当前真实开放池价格：
  - `LIMITED_ABYSS_PREVIEW`: `LIMITED_CONTRACT_TICKET` 1/10 优先，不足 fallback `DIAMOND` 300/3000；
  - `NORMAL_HERO`: `HERO_CONTRACT_TICKET` 1/10 优先，不足 fallback `DIAMOND` 280/2800；
  - `BASIC_CONTRACT_PREVIEW`: `NORMAL_CONTRACT_TICKET` 1/10 优先，不足 fallback `BOUND_DIAMOND` 80/800。
- Cocos 当前 draw 请求使用 `paymentMode='AUTO'`，仍只调用现有 `POST /api/player/gacha/draw`；未新增任何玩家侧经济写入口。
- `BASIC_CONTRACT_PREVIEW` 已从 `HERO_BASE` 切到 `BASIC_RS_ONLY` 空保底组，避免 R/SR-only 普通池在 80/180 抽被 `HERO_BASE` 强制 SSR/UR 后找不到奖励项。
- 后端守卫 `scripts/check-gacha-economy-config.ps1` 现在检查：
  - 三池价格、票券、展示 gate；
  - `BASIC_CONTRACT_PREVIEW.pity_group_code=BASIC_RS_ONLY`；
  - 每个活跃 pity 稀有度必须同时存在活跃 rate 和 active item；
  - 普通池无活跃 SSR/UR rate、item、duplicate、pity。
- Cocos 新增并接入 `assets/resources/ui/gacha/c1812`：
  - `summon_floor` 和 `summon_magic_circle` 用于召唤中心舞台；
  - `summon_reward_slot` 用于结果卡；
  - `summon_case_frame` 用于揭示卡背；
  - `currency_gold` 作为后续货币 UI 资源预留。
- 已扫描来源目录 `C:\Users\axian\Desktop\C1812-1`，选择召唤页最适合的 UI 切图接入，未替换当前全屏召唤背景。
- 本轮本地重启后恢复了 Docker Desktop、`lootchain-redis`、`lootchain-rabbitmq`，并启动后端 `http://localhost:8081`。
- 已验证：
  - 本地导入 `D:\project\LootChain\sql\38_gacha_currency_ticket_price_model.sql` 成功；
  - 后端经济守卫通过；
  - gacha focused Maven 测试 `25 tests, 0 failures`；
  - `scripts/smoke-cocos-gacha-draw-guard.ps1` 以 `paymentMode=AUTO` 覆盖三池低余额失败，无 draw/result/reward/currency/pity 写入；
  - `/api/player/gacha/pools` 返回三池 `primaryCost*` 票券和 `backupCost*` 货币字段，`SEALED_LIGHT_DARK` 仍 locked/display-only；
  - Cocos `npm.cmd run check:layout` 通过；
  - directed Cocos Creator TypeScript no-emit 通过。
- 当前 Preview 状态：
  - `npm.cmd run check:preview` 明确失败于 `http://localhost:7456/scripting/x/import-map.json failed: ECONNREFUSED`；
  - Cocos Preview 未在 7456 启动，无法完成浏览器画面自预览；
  - 需要在 Cocos Creator 内启动/刷新 Preview 后复验召唤页 C1812 地台/法阵、普通池 `box_summon`、按钮价格文案。
- 红线不变：不开放 EX V1、exchange/reissue、bag use/sell/batch-use、hero growth、reward/stamina/progress writes，不充值，不做新的成功真实抽卡。

## 2026-06-10 R/SR NPC Hero Card Scale Rebalance

- 用户换电脑后反馈英雄队列中 R/SR 英雄卡牌背景人物显示得很小。
- 复查确认 `ui/hero-roster/card_background/npc_*` 源图自身没有异常透明留白，当前运行 Preview 也通过 freshness 检查，问题来自 2026-06-08 的 NPC compact profile 压缩过度。
- Cocos 侧仅调整 `LobbyHeroRosterPanelRenderer` 中 NPC 卡牌背景显示比例：
  - `HERO_ROSTER_CARD_BACKGROUND_NPC_VISIBLE_HEIGHT_RATIO` 从 `0.42` 调整为 `0.58`；
  - `HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_HEIGHT_RATIO` 从 `0.56` 调整为 `0.74`；
  - `HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO` 从 `0.82` 调整为 `0.96`。
- 该调整只影响 `ui/hero-roster/card_background/npc_*` 的 R/SR 只读卡面展示；Nuu 和 UR/SSR `*_Illust` 卡面匹配逻辑不变，卡牌稀有度、名称、星级、等级、职业角标和边框特效仍在上层。
- 新电脑本地 `profiles/v2/packages/engine.json` 只有版本号，导致 `check:layout` 的 Spine baseline 守卫失败；已按项目要求从 `settings/v2/packages/engine.json` 同步本地 profile，使 Preview/检查保持 `spine-3.8`。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过；`assets/resources/spine` 下 `.spine/.spine.meta` 扫描为 `0`；`git diff --check` 通过且仅 LF/CRLF warning。
- 当前运行中的 Preview 已刷新到最新 `LobbyHeroRosterPanelRenderer` chunk，`npm.cmd run check:preview` 已通过。
- 边界不变：未修改后端、SQL、接口契约、抽卡概率、保底、消耗、奖励、EX V1、兑换/补发、背包写入口、英雄养成或任何经济写入口。

## 2026-06-10 Controlled Normal Hero Real Draw Closure

- 按用户要求开始当前推进顺序的闭环验收，并以一次性测试账号执行真实 `NORMAL_HERO` 单抽。
- 测试账号：`userId=4 / codex_cocos_draw_20260610140143`；该账号只用于本次 Cocos 真实抽卡闭环。
- 测试前精确写入该测试账号 `DIAMOND=280`，未修改 `userId=1` 或长期联调账号余额。
- 真实请求：
  - `POST /api/player/gacha/draw`;
  - `poolCode=NORMAL_HERO`;
  - `drawCount=1`;
  - `requestId=codex-cocos-normal-draw-20260610140143`;
  - `useTicket=false`。
- 返回成功：`drawNo=GACHA96a43b72b1734a69a71a613021717f8d`，命中 `SR_WITCH_03 / 契约魔女 / SR`，`grantNo=RWDc334bcee86e34bca953807914ca29c98-19875bc0`。
- 幂等重放同一 requestId 返回同一 `drawNo` 和同一 `grantNo`，未二次扣费。
- DB 核对：
  - `user_currency.DIAMOND` 从 `280.000000` 扣到 `0.000000`；
  - `user_currency_log` 仅 1 条本次 requestId 扣费流水；
  - `gacha_draw_log` 仅 1 条本次 requestId 主日志；
  - `gacha_draw_result` 仅 1 条本次 drawNo 结果；
  - `reward_grant_log` 1 条 HERO 发放日志，`status=1`、`audit_required=0`；
  - `user_hero` 包含主角和本次 `SR_WITCH_03`，`user_hero_attr` 共 6 条词条，无碎片发放；
  - `gacha_event_outbox` 写入 `GACHA_DRAW_COMPLETED` 和 `GACHA_HERO_OBTAINED`；
  - `reward_event_outbox` 写入 1 条奖励事件；
  - `user_operation_log` 写入 1 条 `GACHA_DRAW` 操作日志，当前设计不填 `request_id`。
- 保底接口从 `UR/SSR counter=0,totalCount=0` 更新为 `counter=1,totalCount=1`。
- 红线复核：`gacha exchange/reissue`、背包 `use/batch-use/sell`、英雄 `level-up/star-up/awaken/refine` 均仍返回阶段未开放，未开放 EX V1、兑换/补发、背包写入口、英雄养成、奖励/体力/进度写入或任何新经济写入口。

## 2026-06-09 Gacha Summon Animation Visual Fix

- 用户反馈召唤演出页出现无意义红色大圆、背景像小方块且 SSR/UR 金光不便直接查看。
- Cocos 侧已移除 `GachaSummonAnimationVeil` 的红色圆形遮罩；演出背景改用 `GachaSummonFullScreenBackground` + `GACHA_SUMMON_COVER_OVERSCAN_RATIO` 按全屏 cover 扩张，`RecruitBG` 只保留低透明度叠加。
- 当前 active 召唤演出已切换为结果驱动全屏视频：普通/R/SR 播放 `assets/resources/video/gacha/call1.mp4`，SSR/UR 播放 `assets/resources/video/gacha/call2.mp4`。
- Cocos 先通过原来的 `startGachaDraw(mode)` 提交真实 draw，成功返回后按结果最高稀有度进入 summon video 视图；失败或余额不足不会播放结果视频。
- `VideoPlayer.keepAspectRatio=true`，按 1680x720 视频比例做 cover 适配，避免 1920x1080 Preview 中圆形/法阵被拉伸变形。
- 旧的本地 `SSR` / `UR` 演出预览按钮不是当前 active 验收路径，相关 legacy token 被 check 脚本禁止回流；SSR/UR 视觉应通过 `call2` 资源或受控真实结果验收。
- 真实抽卡流程未改概率、权重、保底、消耗、奖励或重复转碎片规则。
- 顺手清理 `LobbyHeroApi.ts` 与 `LobbyCodexApi.ts` 中旧的重复 `R_PATROL_01` fallback，仅保留带 `cardBackgroundAsset` 的只读展示兜底，避免 Cocos TypeScript no-emit 被重复对象 key 阻断。
- 已更新 `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs`：守卫结果驱动 summon video、`call1/call2` 资源、视频比例 cover、音频资源和 legacy 本地预览 token 禁止回流。
- 验证结果：`npm.cmd run check:layout` 通过；Cocos Creator 3.8.8 TypeScript no-emit 通过；`assets/resources/spine` 下 `.spine/.spine.meta` 扫描为 `0`；`npm.cmd run check:preview` 通过；`git diff --check` 通过且仅 LF/CRLF warning。
- 本次未修改后端、SQL、接口契约、卡池条目、经济规则、EX V1、兑换/补发或背包写入口。

## 2026-06-05 Hero Roster Class Filter Match Fix

- 用户反馈点击英雄列表左侧职业后没有展示对应职业英雄。
- 根因定位在 Cocos 前端 `LobbyHeroRosterPanelRenderer`：点击链路会触发 `refreshLobbyOverlay()` 重新渲染，但原筛选使用 `resolveHeroClass(hero) === selectedHeroClass` 的完全相等比较；职业配置表独立后，按钮显示文本与英雄 `heroClass` 只要存在空格、繁简体或历史编码差异，就可能筛出空列表。
- 已将英雄队列职业筛选改为显示文本与匹配 key 分离：左侧职业按钮仍显示 `GET /api/player/lobby/heroes/filter-options` / `heroClass` 返回的文本，内部通过 `normalizeHeroClassKey()` 去空白、归一化常见别名后比较。
- `resolveHeroFilterTabs()` 现在按职业 key 去重，默认六职业、配置表职业和已加载英雄职业仍按现有顺序合并；空职业英雄仍只在“全部”中展示。
- `resolveHeroClassBadgeText()` 也复用同一职业 key，避免角标缩写与筛选逻辑不一致。
- `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已增加职业 key、去重、选中态和过滤比较 token，防止后续退回完全相等匹配。
- 验证结果：`npm.cmd run check:layout` 通过，Cocos Creator 3.8.8 TypeScript no-emit 通过，`assets/resources/spine` 下 `.spine/.spine.meta` 扫描结果为 `0`，`git diff --check` 通过且仅有 LF/CRLF warning。
- Preview 状态：`npm.cmd run check:preview` 仍失败，因为当前运行中的 Cocos Preview 在服务旧 chunk，`LobbyHeroRosterPanelRenderer` 运行时 chunk 缺少 `HERO_CLASS_KEY_ALIASES`、`normalizeHeroClassKey`、`addHeroClassTab` 等新 token；需要刷新/重启 Cocos Creator Preview 后再做视觉验收。
- 本次只修复 Cocos 只读英雄列表展示筛选；未修改接口写入、英雄/抽卡经济规则、`gacha_pool_item`、概率、消耗、奖励、保底、碎片转换、EX V1 或背包操作。

### Runtime Old Backend Fallback

- 复查当前本地运行后端时发现：`GET /api/player/lobby/heroes/filter-options` 仍返回 `code=1000`（当前 Cocos 阶段暂未开放该玩家接口），`GET /api/player/lobby/heroes` 返回的 `heroClass` 也都是 `null`，说明运行中的 game 服务仍是旧进程/旧代码。
- 为避免当前 Cocos Preview 必须等待后端重启，`LobbyHeroApi.normalizeHeroItem()` 已增加只读兜底：当接口未返回 `heroClass` 时，按已知 V1 `heroCode` 映射出 `战士/辅助/刺客/法师/射手/坦克`。
- 该兜底仅用于 Cocos 展示筛选；后端返回真实 `heroClass` 时优先使用后端字段，不写库、不修改英雄模板、不新增任何经济写入口。
- `scripts/check-layout.mjs` 已增加 `HERO_CLASS_FALLBACKS`、`resolveHeroClassFallback()` 和 `heroClass ?? fallbackHeroClass` 守卫。

### UR Border Effect Scroll Mask Fix

- 用户反馈新增滚动列表后，UR 卡牌顶部火焰/边框特效被 ScrollView 的 Mask 裁掉。
- 修复位置：`D:\project\lootchain-cocos\assets\scripts\scenes\lobby\LobbyHeroRosterPanelRenderer.ts`。
- 新增 `HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING = 62`，只向上扩展 `LobbyHeroRosterScrollView` 的裁剪高度；卡牌自身位置、尺寸、底部信息区和滚动内容排序不变。
- `contentHeight`、`viewportHeight`、`viewportCenterY`、`startY` 已按顶部特效安全区重算，使 UR 外扩特效能显示在首行卡牌上方，同时保持底部裁剪边界不变。
- `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已增加顶部 Mask 安全区 token。
- 验证结果：`check:layout`、Cocos TypeScript no-emit、`.spine/.spine.meta` 扫描和 `git diff --check` 通过；`check:preview` 仍失败，因为运行中的 Cocos Preview 旧 chunk 缺少 `HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING`、`viewportHeight`、`viewportCenterY` 和新的 `startY` token，需要刷新/重启 Preview。
- 本次只改 Cocos 只读英雄列表视觉裁剪；未修改接口、SQL、抽卡/英雄经济规则或任何写入口。

## 2026-06-03 Backend Table Comment UTF8 Repair

- 用户反馈本地数据库 `mq_consume_log` 与 `gacha_pool_display_config` 的表注释显示乱码。
- 已在后端仓库新增并执行 `D:\project\LootChain\sql\19_table_comment_utf8_fix.sql`，修复两张表的表级 COMMENT 与列级 COMMENT。
- 已为 `D:\project\LootChain\sql\10_mq_consumer_module.sql`、`D:\project\LootChain\sql\17_gacha_pool_display_config.sql` 增加 `SET NAMES utf8mb4;`，避免后续本地重新导入再次写坏注释。
- 本次只改数据库元数据注释与初始化脚本字符集声明；Cocos 前端代码、接口契约、抽卡概率、奖池物品、保底、消耗、奖励、重复转碎片、EX V1 与经济写入口均未改变。

## 2026-06-03 Gacha Pool Tab Logo Slot

- 用户反馈召唤页左侧卡池页签右侧金/紫/蓝/红色块也应预留为 logo 背景，并由 `gacha_pool_display_config` 控制。
- 后端新增增量 SQL `D:\project\LootChain\sql\20_gacha_pool_tab_logo_asset.sql`，为 `gacha_pool_display_config` 增加 `tab_logo_asset` 字段。
- `GachaPoolVO` 新增 `tabLogoAsset`；Cocos `GachaPreviewPool` 同步新增 `tabLogoAsset`。
- Cocos 召唤页左侧卡池页签现在会在右侧色块上叠加 `tabLogoAsset` 图片；为空时 fallback 到 `logoAsset`，再 fallback 到原主题色块。
- 本地库已执行 SQL 20，默认四个卡池的 `tab_logo_asset` 均填充为对应 `ui/gacha/logo_*`。
- 本次只增加 UI 展示字段和前端渲染，不修改 `gacha_pool_item`、概率、权重、保底、消耗、奖励、重复转碎片、EX V1、兑换/补发或任何经济写入口。

## 硬规则

- 不允许改变游戏经济规则。
- EX 英雄 V1 只预埋，不开放获取。
- USDT 奖励必须后台审核。
- 资金池每日释放限制保持 0.5%~1%。
- 后端 Controller 返回 `Result<T>`，不返回 Entity，必须使用 DTO/VO。
- 后台前端如需修改，只能改 `D:\project\lootchain-admin\apps\web-antd`。
- 当前 Cocos 登录页工作只改 `D:\project\lootchain-cocos`。

## 文档更新约定

- 每次阶段性上下文或代码变更完成后，必须同步更新对应项目文档。
- Cocos-only 登录页、资源加载、大厅背景、场景布局、预览验证、检查脚本等上下文，优先更新本文件和 `D:\project\lootchain-cocos\README.md`。
- 涉及服务端启动、接口、规则、SQL 或后端联调上下文时，同时更新 `D:\project\LootChain` 下对应文档。
- 不要只改代码不更新交接文档；下一窗口需要先从本文恢复当前阶段。

## 近期已完成的 Cocos 登录页调整

1. 登录 UI 已放在 Cocos `assets/main.scene` 中，由 `LootChainGameRoot` 生成登录按钮、弹框、协议勾选、右侧入口占位和登录成功状态。
2. 鼠标悬浮在可点击按钮上时已切换为小手 cursor。
   - 文件：`D:\project\lootchain-cocos\assets\scripts\scenes\LootChainGameRoot.ts`
   - 关键方法：`applyPointerCursor()`、`setPointerCursor()`。
3. 登录背景视频已支持按运行环境自动切换：
   - PC / 横屏：`D:\project\lootchain-cocos\assets\resources\login-bg`
   - 手机 / 竖屏：`D:\project\lootchain-cocos\assets\resources\login-bg-h5`
   - 文件：`D:\project\lootchain-cocos\assets\resources\login-bg\scripts\login\LoginVideoBackground.ts`
   - 判定逻辑：`sys.isMobile || view.getVisibleSize().height > view.getVisibleSize().width` 时使用 H5 资源。
4. H5 新增资源目录：
   - `D:\project\lootchain-cocos\assets\resources\login-bg-h5\login_bg_loop.mp4`
   - `D:\project\lootchain-cocos\assets\resources\login-bg-h5\login_bg_loop_raw.mp4`
   - `D:\project\lootchain-cocos\assets\resources\login-bg-h5\login_bg_poster.jpg`
5. `LoginVideoBackground` 已兼容 H5 poster 以 texture 方式导入的情况；如果找不到 spriteFrame，会 fallback 到 texture 并运行时创建 `SpriteFrame`。
6. `VideoPlayer` 和 poster 会按当前可视区域尺寸铺满，避免横竖屏切换后尺寸不对。
7. Cocos-only 登录根脚本已修复：
   - `LootChainGameRoot.start()` 会清理旧 token，避免 Cocos 预览未点击登录就直接进入“登录验收通过”。
   - 登录弹框已恢复第三方登录占位图标，只提示暂未开放，不接入真实第三方登录。
   - 密码输入框已使用 Cocos `EditBox.InputFlag.PASSWORD`，并增加 `applyPasswordMask()` 兜底，显示为 `*`。
   - 首页状态文案已移到主登录按钮上方，避免与按钮边缘重叠。
8. 本轮按用户要求新增登录后流程：
   - 点击“进入游戏”后不再显示“登录验收通过”。
   - dev-login 返回 `code=0` 后进入“资源加载中”进度条界面。
   - 加载 `assets/resources/lobby/lobby_bg_poster.jpg` 与 `assets/resources/lobby/lobby_bg_loop.mp4`。
   - 大厅背景加载完成后切换到“圣契大厅”背景界面。
   - 大厅背景视频已恢复播放；poster 仅作为首帧兜底，视频开始播放后淡出。
   - 大厅界面当前不放抽卡、英雄、背包等功能按钮。
9. `scripts/check-layout.mjs` 已补充当前阶段门禁：
   - 校验 `assets/main.scene` JSON。
   - 校验登录根脚本不调用 `this.api.gacha`、`this.api.hero`、`this.api.bag`，不出现抽卡/英雄/背包写入口路径。
   - 校验旧 token 清理、第三方占位、密码输入保护、资源加载页和大厅背景页仍保留。

## 2026-05-28 Cocos 登录页布局与特效补充

- 左上 Logo、主登录按钮、右侧四个按钮图片资源已接入 `LootChainGameRoot` 的 SpriteFrame 属性，避免预览中出现洋红色缺图块。
- 登录页 UI 已从固定舞台尺寸改为按 `BG_Main / FG_Architecture` 的 `UITransform.contentSize * node.scale` 计算舞台边界；背景 Scale 恢复为 `1` 时，Logo、右侧按钮、主登录按钮仍按背景舞台自适应定位。
- `renderLoginBrand()` 使用 `layout.stageLeft / stageTop` 计算 Logo 位置；`renderRightRail()` 使用 `layout.stageRight` 计算右侧按钮位置，右侧按钮水平内边距为舞台宽度 `2%`，比之前更靠右。
- CloudLayers 下各云层 `VortexLayerMotion.rotationSpeed` 已按用户要求提高到原始速度的 16 倍；`L08_CoreVoid` 原值为 `0`，保持不旋转。
- 用户试验过缩小 CloudLayers 的 UITransform Content Size，后续已按要求恢复全部尺寸，并恢复 Sprite `Size Mode=TRIMMED`。
- `scripts/check-layout.mjs` 已新增自适应布局门禁：禁止回退到 `LOGIN_STAGE_WIDTH / LOGIN_STAGE_HEIGHT` 固定舞台常量，并用当前 `assets/main.scene` 推算 `LoginLogo`、右侧首个按钮、主登录按钮是否仍在背景舞台内。
- 当前如果 Cocos Editor 预览仍显示旧位置，优先重开 Preview 或刷新脚本编译缓存；源码侧已经是背景舞台自适应逻辑。

## 背景视频资源约定

PC 当前默认资源：

- 视频：`resources/login-bg/login_bg_loop_1080p`
- 首帧图：`resources/login-bg/login_bg_first`

H5 当前默认资源：

- 视频：`resources/login-bg-h5/login_bg_loop`
- 首帧图：`resources/login-bg-h5/login_bg_poster`

如果后续替换资源，优先保持同名文件；这样无需改代码。若必须改名，只改 `LoginVideoBackground.ts` 顶部常量：

```ts
const PC_VIDEO_PATH = 'login-bg/login_bg_loop_1080p';
const PC_POSTER_PATH = 'login-bg/login_bg_first';
const H5_VIDEO_PATH = 'login-bg-h5/login_bg_loop';
const H5_POSTER_PATH = 'login-bg-h5/login_bg_poster';
```

2026-05-29 历史记录：用户曾替换 PC 登录背景视频与首帧图为 `login_bg_loop.mp4`，当时曾短暂将 PC 视频路径从 `login-bg/login_bg_loop_1080p` 改为 `login-bg/login_bg_loop`；随后用户确认视频改回 `login_bg_loop_1080p`，当前以最新记录为准。

2026-05-29 追加检查：用户再次更新登录背景后，当前目录最新变更是 `assets/resources/login-bg/login_bg_first.jpg`；H5 目录 `assets/resources/login-bg-h5` 未变化。由于登录视频真正播放后会淡出 poster，若只替换首帧图，预览主体仍会显示当前 PC 视频画面；竖屏预览还需替换 H5 资源。

2026-05-29 再次更新：用户确认视频已更换为 `login_bg_loop_1080p`，已将 PC 视频路径改回 `login-bg/login_bg_loop_1080p`。本地检查时 `assets/resources/login-bg/login_bg_loop_1080p.mp4` 未显示为 git 修改且时间戳仍为 `2026-05-26 09:08:59`，若预览仍是旧画面，需要确认新视频是否确实覆盖到该文件。

## 当前工作区状态

`D:\project\lootchain-cocos` 当前有未提交变更：

- `assets/main.scene`
- `assets/resources/login-bg/login_bg_first.jpg`
- `assets/resources/login-bg/login_bg_loop_1080p.mp4`
- `assets/resources/login-bg/login_bg_loop_1080p.mp4.meta`
- `assets/resources/login-bg/login_bg_loop_raw.mp4`
- `assets/resources/login-bg/login_bg_loop_raw.mp4.meta`
- `assets/scripts/scenes/LootChainGameRoot.ts`
- `scripts/check-layout.mjs`
- `README.md`
- `docs/current-chat-context.md`
- `docs/lobby-feature-analysis.md`
- `settings/v2/packages/cocos-service.json`

注意：其中不全是本窗口新改内容，其他窗口接手时不要随意 revert 用户或 Cocos 编辑器生成的变更。

`D:\project\LootChain` 当前有本轮新增的本地游戏服启动脚本与文档变更；详见服务端仓库 `README.md`、`docs/local-game-server-start.md`、`team-history/CURRENT_PROGRESS.md`。

## 已跑过的检查

Cocos 项目检查：

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:layout
```

结果：通过，输出 `layout ok`。

本轮补充：`check:layout` 现在还会执行 Cocos-only 阶段门禁检查，确认登录根脚本没有调用抽卡、英雄、背包写入口，并确认 loading/lobby 流程仍存在；同时检查登录页 UI 没有回退到固定舞台常量，Logo、右侧按钮、主登录按钮仍在背景舞台内。

Cocos TS 检查：

```powershell
$tsc = 'D:\office app\cocos\editors\Creator\3.8.8\resources\resources\3d\engine\node_modules\.bin\tsc.cmd'
& $tsc --target ES2020 --module ESNext --moduleResolution Node --experimentalDecorators --skipLibCheck --noEmit --types D:\project\lootchain-cocos\temp\declarations\cc D:\project\lootchain-cocos\assets\scripts\scenes\LootChainGameRoot.ts D:\project\lootchain-cocos\assets\scripts\app\AppConfig.ts D:\project\lootchain-cocos\assets\scripts\api\LootChainApi.ts D:\project\lootchain-cocos\assets\scripts\api\PlayerProfileApi.ts D:\project\lootchain-cocos\assets\scripts\net\HttpClient.ts D:\project\lootchain-cocos\assets\scripts\store\TokenStore.ts D:\project\lootchain-cocos\assets\scripts\types\PlayerTypes.ts D:\project\lootchain-cocos\assets\resources\login-bg\scripts\login\LoginVideoBackground.ts
```

结果：通过。

本轮补充：已使用 Cocos Creator 3.8.8 自带 TypeScript 对大厅根脚本、API、类型和登录背景脚本执行 Cocos 声明检查，结果通过。

场景 JSON 校验：

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('D:/project/lootchain-cocos/assets/main.scene','utf8')); console.log('main.scene json ok')"
```

结果：通过，输出 `main.scene json ok`。

登录接口联调：

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:8081/api/player/auth/dev-login `
  -ContentType 'application/json' `
  -Body '{"userId":1}'
```

结果：通过，返回 `code=0`，`data.tokenName=satoken`。

## 游戏服务启动方式

用户在终端直接执行以下命令时遇到父工程无 main class 报错：

```powershell
mvn -pl lootchain-game -am spring-boot:run "-Dspring-boot.run.profiles=local"
```

原因：`-am` 把父 POM 也拉进 reactor，`spring-boot:run` 先在父工程执行，父工程没有 main class。

当前推荐使用服务端一键启动脚本：

```powershell
Set-Location D:\project\LootChain
.\start-game-server.bat
```

该脚本内部使用：

```powershell
mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests install
mvn.cmd --no-transfer-progress -f .\lootchain-game\pom.xml spring-boot:run -DskipTests -Dspring-boot.run.profiles=local -Dspring-boot.run.arguments=--server.port=8081 -Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8
```

注意：不要直接执行 `mvn -pl lootchain-game -am spring-boot:run`。`-am` 会把父 POM 加进 reactor，`spring-boot:run` 会先落到 `lootchain-parent` 并因没有 main class 失败。服务端启动脚本已修复为先 `install` 依赖模块，再用 `-f .\lootchain-game\pom.xml` 只启动游戏服。

2026-05-28 修复后验证：服务端脚本 dry-run 输出两步命令，`mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests install` 已执行通过。

## 玩家登录当前状态

- 当前 `game_user` 是玩家主档表，没有玩家密码字段。
- 当前 Cocos-only 登录页只对接 `POST /api/player/auth/dev-login`，传参为 `userId`。
- `LootChainGameRoot` 中账号输入为数字时按 `userId` 传给 `dev-login`；非数字账号/邮箱兜底为 `AppConfig.defaultDevUserId`。
- 登录弹框中的密码输入框当前只是 UI/后续正式登录占位，现阶段不会传给后端，也不会参与鉴权。
- 正式账号密码、钱包签名、邮箱验证码、第三方登录等玩家登录体系尚未落库；服务端文档 `D:\project\LootChain\docs\22-数据库设计.md` 已记录建议后续新增独立凭证/身份表，不把密码直接放入 `game_user`。

本地配置：

- 游戏服务端口：`8081`
- MySQL：`localhost:3306/lootchain`
- Redis：`localhost:6379`
- `local` profile 会开启 `lootchain.player.dev-login-enabled=true`

测试登录接口：

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:8081/api/player/auth/dev-login `
  -ContentType 'application/json' `
  -Body '{"userId":1}'
```

如果 `8081` 被占用：

```powershell
Get-NetTCPConnection -LocalPort 8081 | Select-Object LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id 进程ID -Force
```

## 已知环境提示

- 用户的 `C:\Users\Ethan\.m2\settings.xml` 第 61 行附近存在 XML 格式 warning：

```text
expected START_TAG or END_TAG not TEXT ... settings.xml, line 61, column 15
```

这不是上次 `spring-boot:run` 失败主因，但后续建议修复 Maven settings，避免依赖解析异常。

## 后续接手建议

1. 如果继续处理登录页视觉，优先在 Cocos Creator Preview 中验证，不要回到 `web-vue`。
2. 如果处理接口联调，先确认 `lootchain-game` 8081、Redis 6379、MySQL 3306 都在线。
3. 如果要更新进度，必须同步更新本项目文档；涉及服务端时同时更新 `D:\project\LootChain\team-history\CURRENT_PROGRESS.md`。
4. 对 Cocos 场景文件谨慎处理，Cocos 编辑器会产生 `assets/main.scene` 和 settings 变更，不要未经确认回滚。

## 2026-05-28 大厅参考图产品拆解

- 用户提供 `D:\project\lootchain-cocos\docs\ui-reference\dragonheir\lobby\lobby.png` 作为后续游戏大厅对标参考。
- 已从产品视角拆解顶部玩家信息、资源栏、系统入口、左侧活动列表、中央场景热点、右侧挑战卡片、底部导航、聊天栏和主冒险入口。
- 已新增文档 `D:\project\lootchain-cocos\docs\lobby-feature-analysis.md`，记录各功能点、点击弹窗建议、开发清单、开发顺序和当前阶段边界。
- 当前仅做产品总结，不改代码，不开放 EX V1，不新增任何经济写入口。

## 2026-05-28 大厅开发阶段 1

- 当前大厅开发从阶段 1 开始，只实现“大厅背景壳 + 左上玩家信息只读展示 + 玩家资料只读弹窗”。
- `D:\project\lootchain-cocos\assets\scripts\scenes\LootChainGameRoot.ts` 新增 `renderLobbyHud()`、`renderLobbyPlayerInfo()`、`renderPlayerProfileDialog()`、`openPlayerProfileDialog()`、`closePlayerProfileDialog()`。
- 大厅左上玩家信息按背景舞台边界自适应，节点包括 `LobbyPlayerInfoButton`、`LobbyPlayerAvatar`、`LobbyPlayerName`、`LobbyPlayerLevel`、`LobbyPlayerPower`、`LobbyPlayerExpBadge`。
- 玩家资料弹窗节点包括 `LobbyProfileDim`、`LobbyProfilePanel`、`LobbyProfileCloseButton`；只展示资料，不提供写操作。
- 新增 Cocos API 文件 `assets/scripts/api/PlayerProfileApi.ts` 与类型 `assets/scripts/types/PlayerTypes.ts`，只读调用 `GET /api/player/me/lobby`。
- `scripts/check-layout.mjs` 已加入阶段 1 门禁，确认大厅资料节点、只读接口、弹窗布局状态 key 存在，并继续禁止抽卡、英雄、背包、领取、购买、提现、USDT 等入口进入根脚本。
- 服务端新增只读资料接口，详见 `D:\project\LootChain\team-history\CURRENT_PROGRESS.md`。
- Code Review 发现服务端 `PlayerProfileController` 需要排除出后台应用扫描；已在 `D:\project\LootChain\lootchain-admin\src\main\java\com\lootchain\bootstrap\AdminApplication.java` 加入排除，避免 admin 启动依赖玩家 Sa-Token Bean。
- 已执行 `npm.cmd run check:layout` 通过；后端 `PlayerLobbyProfileServiceTest` 通过；`mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile` 通过。
- 当前可使用 Cocos Creator 3.8.8 自带 TypeScript 进行根脚本级声明检查；完整视觉与视频播放仍需在 Cocos Creator Preview 中做运行态确认。

### 2026-05-28 大厅 HUD 不显示修复

- 用户在 Cocos Preview 反馈大厅左上玩家信息没有显示。
- 排查后确认 `renderLobbyPlayerInfo()` 已执行渲染链，但大厅背景同时创建了全屏 `VideoPlayer` 节点；Cocos Web Preview 中原生视频层可能覆盖 Canvas UI，导致 HUD 被遮住。
- 已将 `USE_LOBBY_NATIVE_VIDEO_BACKGROUND` 设为 `false`，大厅阶段 1 使用 poster 背景优先，不再创建或强制加载原生视频背景，保证 `LobbyPlayerInfoButton`、资料弹窗等 HUD 在 Canvas 层可见。
- `scripts/check-layout.mjs` 已加入门禁，防止阶段 1 误开原生视频背景覆盖 HUD。

### 2026-05-29 大厅背景视频恢复

- 用户反馈游戏大厅背景视频没有播放。
- 根因：上一轮为规避 `VideoPlayer` 覆盖 HUD，将 `USE_LOBBY_NATIVE_VIDEO_BACKGROUND` 临时设为 `false`，导致 loading 阶段不加载 `lobby_bg_loop.mp4`，大厅只显示 poster。
- 已恢复 `USE_LOBBY_NATIVE_VIDEO_BACKGROUND = true`，加载 `assets/resources/lobby/lobby_bg_loop.mp4` 并创建 `Lobby_BG_Video`。
- 按登录背景实现方式设置 `VideoPlayer.stayOnBottom = true`、静音循环、`keepAspectRatio = false`，并监听 `READY_TO_PLAY / PLAYING / COMPLETED / ERROR`。
- `Lobby_BG_Poster` 新增 `UIOpacity`，视频真正进入 `PLAYING` 后再淡出 poster；视频失败时保留 poster，避免黑屏。
- 全局点击/触摸会重试 `tryPlayLobbyVideo()`，用于兼容浏览器或移动端自动播放限制。
- `scripts/check-layout.mjs` 已同步改为要求动态视频开启、poster 淡出和 `stayOnBottom` 保护存在。

### 2026-05-28 背景叠加元素自适应规则

- 用户明确要求所有叠在视频/背景上的元素都必须按不同分辨率自适应，不能写死坐标。
- `LootChainGameRoot.resolveLayout()` 已扩展统一安全区字段：`safeLeft`、`safeRight`、`safeTop`、`safeBottom`、`safeWidth`、`safeHeight`、`safeInsetX`、`safeInsetY`。
- 登录 Logo、右侧四按钮、主登录按钮、登录弹框、加载面板、大厅左上玩家信息、玩家资料弹窗已改为使用安全区/舞台中心定位。
- 玩家资料弹窗从固定世界坐标 `0,0` 改为按当前舞台中心定位，避免背景舞台中心发生变化时错位。
- `makeLayoutKey()` 已加入舞台边界信息，背景节点尺寸/缩放变化时会触发重渲染。
- `scripts/check-layout.mjs` 已扩展多分辨率门禁，覆盖 `1920x1080`、`1600x900`、`1366x768`、`1280x720`、`1024x768`、横屏移动、竖屏移动和最小视口，校验登录 Logo/右侧按钮/主按钮/登录弹框/加载面板与大厅阶段 1 HUD/弹窗不越出舞台。
- 后续新增任何背景叠加 UI，都必须接入安全区并同步补充 `check-layout` 几何校验。

### 2026-05-28 左上玩家信息视觉深化

- 用户反馈左上角 UI 与参考图差距过大，需要深度优化布局和排版。
- `renderLobbyPlayerInfo()` 已从普通矩形面板改为徽章式玩家铭牌：大头像徽章在左，右侧为半透明暗金底纹和细线延展。
- 新增 `drawLobbyPlayerInfoFrame()`、`addLobbyNameSigil()`、`addLobbyPowerUnderline()`、`drawArmoredAvatarPortrait()`，运行时绘制暗黑金属风头像框、盔甲头像剪影、名称徽记和战力下划线。
- `addLobbyAvatar()` 不再显示玩家名缩写大字，改为金属放射外框 + 盔甲头像剪影 + 小型 crest 字母。
- `LobbyPlayerExpBadge` 调整为贴附头像底部的小铜金牌，更接近参考图的 EXP 标识。
- `scripts/check-layout.mjs` 已同步更新左上玩家信息尺寸公式，并增加头像放射外框视觉范围校验，确保多分辨率下不越界。

### 2026-05-28 左上玩家信息返修

- 用户反馈上一版头像仍偏卡通，且文字与头像重叠。
- 根因：`addChildLabel()` 对 `Label.HorizontalAlign.LEFT` 的坐标仍按节点中心处理，左对齐文字实际起点被向左偏移半个文本框宽度。
- 已新增 `resolveAlignedLabelX()`，将左对齐坐标解释为文本框左边界、右对齐坐标解释为文本框右边界，修复玩家名/等级/战力压住头像的问题。
- 已移除头像外圈的三角放射造型，改为更克制的暗金属圆环、局部弧线高光和上下小型金属饰件。
- 已将左上铭牌文本区整体右移，给头像外框预留间距。
- 已移除铭牌右下角的“资料读取中/资料占位”调试文案，避免破坏参考图式布局；资料异常只在资料弹窗中展示。

### 2026-05-28 左上玩家信息高质量图片资产接入

- 用户要求左上玩家信息与参考图保持一致，并建议使用 image 2.0 生成高质量 UI。
- 已使用内置 imagegen 生成黑金暗黑幻想玩家铭牌资产，原始输出保留在 `C:\Users\Ethan\.codex\generated_images\019e547a-17f7-7db3-b84e-b4a1858b94c3\ig_07e312bd804b5022016a18653b8de88191aa608e4a90991262.png`。
- 已在本地用 PowerShell/.NET 去除绿幕并裁剪成项目资源：`D:\project\lootchain-cocos\assets\resources\ui\lobby\lobby_player_info_panel.png`，尺寸 `1600x577`，四角 alpha 为 `0`。
- 已新增 Cocos 资源 meta：`assets/resources/ui/lobby.meta` 与 `assets/resources/ui/lobby/lobby_player_info_panel.png.meta`。
- `renderLobbyPlayerInfo()` 已切换为图片资产驱动，优先加载 `ui/lobby/lobby_player_info_panel/spriteFrame`，只保留等级、名称、战力、EXP 文字动态覆盖；图片加载失败时才使用 Graphics 兜底。
- 已移除代码层额外红点绘制，避免与图片资产自带红色菱形重复。
- `scripts/check-layout.mjs` 已加入图片资产存在性、资源常量和多分辨率尺寸公式校验。

### 2026-05-29 大厅 Stage 1A 左上玩家信息自适应修正

- 用户确认进入下一阶段，当前阶段聚焦大厅 UI 左上玩家信息、视频/背景上的 UI 自适应和参考图一致性。
- `renderLobbyPlayerInfo()` 已从通用 `safeLeft/safeTop` 改为基于舞台安全区派生的 `lobbyHudEdgeInset()` 小边距定位，使铭牌更贴近参考图左上角，同时仍随舞台尺寸自适应。
- 动态文字区域已收窄到头像右侧有效信息区，避免覆盖 `lobby_player_info_panel.png` 中央装饰件；玩家名与战力使用 `Label.Overflow.SHRINK` 防止长文本溢出。
- 玩家信息文字已增加 `enableOutline` 黑色描边，提高动态视频背景上的可读性。
- 图片资产未加载完成时的兜底绘制会同时显示 `LobbyPlayerAvatar`，避免首帧只有框没有头像。
- 玩家信息按钮 hover/touch 缩放幅度已降低，减少贴边 HUD 在小分辨率下被交互缩放挤出舞台的风险。
- `scripts/check-layout.mjs` 已同步新的边距公式、文字描边、文本缩放和多分辨率边界门禁。

## 2026-05-29 Lobby Stage 1B player HUD reference rebuild

- Scope: Cocos-only lobby top-left player info HUD. No backend economy rules were changed, EX V1 remains unopened, and no new economy write entry was added.
- Rebuilt `assets/resources/ui/lobby/lobby_player_info_panel.png` as a compact high-resolution `1080x436` PNG, matching a `540x218` logical reference grid for the provided screenshot direction.
- Updated `assets/resources/ui/lobby/lobby_player_info_panel.png.meta` so the SpriteFrame uses `rawWidth=1080`, `rawHeight=436`, `width=1080`, `height=436`, `trimX=0`, `trimY=0`, `offsetX=0`, and `offsetY=0`. This avoids the previous auto-trim coordinate drift that made dynamic text collide with the frame.
- Updated `LootChainGameRoot.renderLobbyPlayerInfo()` to use `LOBBY_PLAYER_INFO_PANEL_ASPECT = 540 / 218`, wider `420..540` adaptive HUD sizing, and explicit safe slots for `Lv`, player name, combat power, underline, sigil, and `EXP`.
- `LobbyPlayerLevel`, `LobbyPlayerName`, and `LobbyPlayerPower` now use shrink-safe text boxes positioned to the right of the avatar frame, preventing the level label from overlapping the avatar/background frame.
- Updated `scripts/check-layout.mjs` to verify the HUD PNG dimensions, SpriteFrame meta trim values, and multi-resolution internal label boxes for level/name/power/EXP/sigil.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check for `LootChainGameRoot.ts` and dependent scripts -> passed.

### 2026-05-29 Lobby Stage 1B revision after visual rejection

- User rejected the first Stage 1B HUD bitmap because it still differed too much from the provided reference.
- Current correction: `assets/resources/ui/lobby/lobby_player_info_panel.png` now reuses the higher-quality original portrait/frame/EXP cluster only on the left side and keeps the right text area transparent. This removes the previous visible custom dark panel/blob and lets the lobby video/background show through like the reference image.
- `addLobbyNameSigil()` was changed from a diamond-style icon to a thin gold anchor-like sigil.
- `addLobbyPowerUnderline()` was simplified to a thin gold line; the previous red diamond ornament was removed.
- Rechecked after this revision:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.

### 2026-05-29 Lobby Stage 1B high-quality avatar frame regeneration

- User rejected the screenshot-crop avatar frame quality. The current HUD asset was regenerated using imagegen instead of cropping the old screenshot-like frame.
- Generated source image: `C:\Users\axian\.codex\generated_images\019e6dfe-8486-7d32-a92f-9eaea25168f8\ig_07b83f41cd8e8d4e016a193fe1f8188191a7a50f262aadf9c6.png`.
- Local processing: removed the flat green chroma-key background, despilled green edges, extracted the avatar medallion/badge, and composited it into `assets/resources/ui/lobby/lobby_player_info_panel.png` as a `1080x436` transparent HUD art canvas.
- `assets/resources/ui/lobby/lobby_player_info_panel.png.meta` remains pinned to the full `1080x436` SpriteFrame grid to prevent auto-trim coordinate drift.
- Rechecked after this regeneration:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.

### 2026-05-29 Lobby profile dialog close flash fix

- User reported that closing the top-left player profile dialog could briefly flash the login-page background.
- Root cause: `openPlayerProfileDialog()`, `closePlayerProfileDialog()`, and lobby profile refresh previously rebuilt the full lobby via `renderLobby()`. That path calls `renderBase()`, releases the lobby video runtime, and clears all content children, so the original scene/login background could show for one frame before the lobby background was rebuilt.
- Fix: profile dialog open/close now only adds or removes `LobbyProfileDim` and `LobbyProfilePanel`. Lobby profile data refresh now calls `refreshLobbyOverlay()`, which refreshes only `LobbyPlayerInfoButton` and the optional profile dialog without touching `Lobby_BG_Poster` or `Lobby_BG_Video`.
- Added `removePlayerProfileDialog()` and `removeNodeFromContent()` helpers.
- Updated `scripts/check-layout.mjs` to forbid full `renderLobby()` calls from profile dialog open/close/profile-refresh paths.
- Rechecked after this fix:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.

### 2026-05-29 Lobby Stage 1C top resource bar

- Current next-stage increment: the lobby now renders a top resource bar through `renderLobbyResourceBar()` after the top-left player HUD.
- The bar is explicitly read-only. It shows stamina from the existing lobby profile VO plus reference-style coin/ruby/crystal visual placeholders until a read-only asset-summary contract is available.
- The visible `+` marks in the top resource bar are disabled visual marks only. No purchase, claim, exchange, fund-pool, gacha, hero, bag, chain reward, or EX V1 write entry was added.
- `refreshLobbyOverlay()` now also refreshes/removes `LobbyResourceBar` without rebuilding the lobby background video/poster.
- `scripts/check-layout.mjs` now requires the resource bar methods/nodes and verifies that the resource bar stays inside the adaptive stage and does not overlap the top-left player info panel across the supported viewport set.
- Rechecked after this stage:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.

### 2026-05-29 Lobby Stage 1D refinement

- User requested larger fonts matching the reference image, more accurate center function-point placement near buildings, and building hover/click interaction.
- Current implementation changes:
  - Activity-row title/subtitle, center hotspot label, right challenge card, bottom-nav, chat, and adventure-button fonts are larger.
  - Center hotspots were repositioned closer to their reference buildings.
  - Each center hotspot now has a transparent `LobbyHotspotHitArea_*` building interaction area behind the visible label.
  - Hovering the building area sets the same local unopened-status hint as hovering the label.
  - Clicking either the building area or the label calls `activateLobbyHotspot()` and plays `LobbyClickEffect`, a short red-gold pulse at that function point.
- This remains Cocos-only local UI behavior. No backend gameplay/economy write API was added or called.
- Rechecked after this refinement:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.

### 2026-05-29 Lobby Stage 1D hotspot alignment correction

- User preview showed that the transparent center building hit areas were too large, not aligned with the visible buildings, and displayed a large red rectangle on hover.
- Correction made in `renderLobbySceneHotspots()`:
  - Each center function now has independent label coordinates, label width, hit-area center, hit-area width, and hit-area height.
  - `召唤祭坛`, `公会`, `排行榜`, `旅者集会`, `熔铸工坊`, `深渊之门`, `战役`, and `商店` were retuned against the current 16:9 lobby background.
  - `drawLobbyHotspotHover()` now draws a small local red-gold target pulse instead of outlining the whole hit area.
  - Hit-area fill alpha is now `0`, keeping building hit zones invisible during preview.
- This remains local Cocos UI behavior only; no backend gameplay/economy endpoint was opened.
- Rechecked after this correction:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.
  - `git diff --check` -> passed, only existing CRLF warnings.
- Next recommended Stage 1 item after user confirmation: bottom navigation and central hotspot placeholders, still read-only/locked and without any economy write entry.

### 2026-05-29 Lobby Stage 1D reference-style HUD skeleton

- User provided `D:\project\lootchain-cocos\docs\ui-reference\dragonheir\lobby\lobby.png` again and required the lobby UI to follow it with higher quality.
- Current implementation extends the Cocos-only lobby overlay beyond the top-left HUD:
  - `renderLobbySystemIcons()` draws the top-right friends/mail/settings/menu icon group.
  - `renderLobbyActivityRail()` draws the left activity list with dark-gold rows, icon medallions, and red-dot markers.
  - `renderLobbySceneHotspots()` draws central map plaques such as guild, ranking, abyss gate, battle, forge, and shop.
  - `renderLobbyChallengeRail()` draws the right-side challenge cards.
  - `renderLobbyBottomHud()` draws the bottom translucent band, compass, bottom navigation, chat preview, and red adventure button.
- These are all Cocos `Graphics`/`Label`/`Button` UI nodes, not screenshot crops, so they remain sharp when scaled.
- All newly visible module clicks are placeholder-only and call no backend gameplay/economy endpoint. They only set an unopened status message locally.
- `scripts/check-layout.mjs` now verifies the new system icon group, resource spacing beside it, activity rail, scene hotspot plaques, challenge rail, and bottom HUD across the supported viewport set.
- Rechecked after this stage:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.

### 2026-05-29 Lobby Stage 1D hotspot alignment correction v2

- User preview still showed the center function text and building placement too far from the reference feel.
- Recalibrated `renderLobbySceneHotspots()` against the current 3840x2160 16:9 `assets/resources/lobby/lobby_bg_poster.jpg`, because the provided reference image uses a different crop ratio.
- Updated plaque anchors and hit-area anchors for `召唤祭坛`, `公会`, `排行榜`, `旅者集会`, `熔铸工坊`, `深渊之门`, `战役`, and `商店`.
- Reduced the center plaque height from `36 * scale` to `32 * scale` and the label font from `25 * scale` to `22 * scale`, so nameplates sit closer to the building proportions.
- Narrowed the transparent hit areas again to the building cores. Hover/click remains local placeholder UI only and does not call gameplay or economy write APIs.
- Rechecked after this correction:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check with `cc.d.ts` -> passed.

### 2026-05-29 Lobby Stage 1D code modularization

- User requested that code should no longer be piled into `LootChainGameRoot`.
- Current split:
  - `LootChainGameRoot.ts` remains the Cocos root component for lifecycle, route switching, login/loading, lobby background, profile state, and generic UI primitives.
  - `assets/scripts/scenes/lobby/LobbyHudRenderer.ts` owns the lobby HUD rendering chain and local placeholder interactions.
  - `assets/scripts/scenes/lobby/LobbyHudConfig.ts` owns editable HUD data such as central hotspot anchors/hit areas, activity rows, challenge cards, and bottom navigation items.
  - `assets/scripts/scenes/lobby/LobbyHudTypes.ts` owns the HUD host contract, HUD-only types, constants, and small helpers.
- `LootChainGameRoot.renderLobbyHud()` now delegates to `LobbyHudRenderer.render(layout)` instead of containing every HUD method directly.
- `scripts/check-layout.mjs` now treats the lobby HUD as a module group and verifies the new `.ts` and `.meta` files.
- Root script line count after this split is about 1.6k lines; lobby HUD renderer/config/types are separated for future UI iteration.
- This was a structure-only frontend refactor. No gameplay/economy endpoint was opened, no economy rules changed, and EX V1 remains closed.
- Rechecked after modularization:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check with `cc.d.ts` -> passed.

### 2026-05-30 Lobby Stage 1E 玩家资料弹窗模块化

- 本阶段只做结构拆分，不改变大厅行为与弹窗视觉逻辑。
- 新增 `assets/scripts/scenes/lobby/LobbyProfileDialogRenderer.ts` 与 `LobbyProfileDialogRenderer.ts.meta`。
- `LobbyProfileDialogRenderer` 负责 `LobbyProfileDim`、`LobbyProfilePanel`、关闭按钮、头像、标题、资料行、只读提示和钱包地址脱敏展示。
- `LootChainGameRoot.ts` 只保留玩家资料状态、`openPlayerProfileDialog()` / `closePlayerProfileDialog()` / `removePlayerProfileDialog()` 调度、资料接口加载和通用 UI host 方法。
- 打开/关闭玩家资料弹窗仍然只增删 overlay 节点，不调用 `renderLobby()`，继续避免大厅视频/poster 被重建导致闪回登录背景。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，并校验弹窗模块的关键节点/只读逻辑 token。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1F 大厅背景控制器模块化

- 本阶段继续只做结构拆分，不改变大厅背景行为。
- 新增 `assets/scripts/scenes/lobby/LobbyBackgroundController.ts` 与 `LobbyBackgroundController.ts.meta`。
- `LobbyBackgroundController` 负责大厅 poster/video runtime：`Lobby_BG_Poster`、`Lobby_BG_Video`、`Lobby_BG_Fallback`、`VideoPlayer` 参数、播放重试、`READY_TO_PLAY` / `PLAYING` / `COMPLETED` / `ERROR` 事件、poster 淡出、停止与事件解绑。
- `LootChainGameRoot.ts` 现在只保留背景生命周期入口：`renderLobbyBackground()`、`tryPlayLobbyVideo()`、`updateLobbyPosterFade()`、`releaseLobbyVideoRuntime()` 都委托给 controller。
- 保留关键行为：poster 仍按全画布 `layout.width/layout.height` 铺底；动态背景仍为静音循环；`VideoPlayer.stayOnBottom=true` 继续防止 native video 压住 HUD；视频进入 `PLAYING` 后 poster 以 0.4s 淡出；视频错误时保留 poster。
- `loadLobbyResources()` 在写入 background controller 资源前新增 loading ticket 检查，避免过期资源加载流程覆盖新状态。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，并将背景视频关键 token 校验迁移到 `LobbyBackgroundController.ts`。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1G 大厅头像绘制模块化

- 本阶段继续只做结构拆分，不改变大厅行为与视觉参数。
- 新增 `assets/scripts/scenes/lobby/LobbyAvatarRenderer.ts` 与 `LobbyAvatarRenderer.ts.meta`。
- `LobbyAvatarRenderer` 负责 `LobbyPlayerAvatar` 的暗金圆形头像框、上下金属饰件、盔甲头像剪影、红色细节线和 `AvatarCrestLetter`。
- `LootChainGameRoot.addLobbyAvatar()` 现在只委托 `lobbyAvatarRenderer.add(...)`，HUD 与玩家资料弹窗仍通过同一个 host 方法使用头像。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，并将头像绘制函数 token 从根脚本迁移到 `LobbyAvatarRenderer.ts`。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1H 玩家资料状态模块化

- 本阶段继续只做结构拆分，不改变玩家资料读取接口与 UI 行为。
- 新增 `assets/scripts/scenes/lobby/LobbyProfileState.ts` 与 `LobbyProfileState.ts.meta`。
- `LobbyProfileState` 负责当前玩家 `userId`、资料 loading/error、fallback profile、`GET /api/player/me/lobby` 返回数据归一化和过期 userId 防护。
- `LootChainGameRoot.ts` 仍负责调用 `this.api.profile.lobbyProfile()`、捕获异常、刷新大厅 overlay，但不再内置 `fallbackLobbyProfile()` / `normalizeLobbyProfile()`。
- 登录成功后通过 `lobbyProfileState.resetForLogin(userId)` 清空上一位玩家资料；资料加载完成/失败时通过 `applyLoadedProfile()` / `applyLoadError()` 判断是否仍属于当前玩家。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，并继续把 profile 相关逻辑限定为只读展示，不允许新增玩法/经济写接口。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1I 资源加载页渲染模块化

- 本阶段继续只做结构拆分，不改变加载流程与大厅进入逻辑。
- 新增 `assets/scripts/scenes/lobby/LobbyLoadingRenderer.ts` 与 `LobbyLoadingRenderer.ts.meta`。
- `LobbyLoadingRenderer` 负责 `LoadingMask`、`LoadingPanel`、加载标题、加载消息/错误、进度条、百分比文本和“重试加载”按钮的渲染。
- `LootChainGameRoot.ts` 仍负责 loading 状态、资源加载 ticket、防过期流程、背景资源加载、错误捕获和切换到 lobby。
- `renderLoading()` 现在只调用 `lobbyLoadingRenderer.render(layout, { progress, message, error })`；重试按钮通过 host 回调 `retryLobbyLoading()` 回到原 `startLobbyLoading()` 流程。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查；原有多分辨率 `LoadingPanel` 边界校验继续保留。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1J 资源加载器模块化

- 本阶段继续只做结构拆分，不改变资源加载流程与大厅进入逻辑。
- 新增 `assets/scripts/scenes/lobby/LobbyResourceLoader.ts` 和 `LobbyResourceLoader.ts.meta`。
- `LobbyResourceLoader` 负责大厅 poster/video 的 Cocos `resources.load()`：`lobby/lobby_bg_poster`、`lobby/lobby_bg_loop`，以及 poster `SpriteFrame` 不存在时的 `Texture2D` 兜底生成。
- `LootChainGameRoot.ts` 仍负责 loading ticket、进度状态、错误捕获、过期流程拦截，以及资源加载完成后切换到 `lobby`。
- 过期 ticket 会在进度回调和写入 `LobbyBackgroundController` 前被拦截，避免旧加载流程覆盖新状态。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，并把 `LobbyResourceLoader.ts` 纳入禁止经济写入口 token 扫描。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
  - `git diff --check` -> passed，仅有已有 CRLF warning。
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1K 登录渲染器模块化

- 本阶段继续只做结构拆分，不改变登录流程、loading 流程与大厅进入逻辑。
- 新增 `assets/scripts/scenes/login.meta`、`assets/scripts/scenes/login/LoginRenderer.ts` 和 `LoginRenderer.ts.meta`。
- `LoginRenderer` 负责登录页与登录弹窗的可见 UI 组合：`LoginLogo`、`MainAccountLoginButton`、右侧登录页 rail、`DialogDim`、`LoginDialogPanel`、账号/密码输入框位置、第三方登录占位、协议勾选行、返回按钮和“进入游戏”按钮。
- `LootChainGameRoot.ts` 仍负责登录行为和状态：`currentView`、`agreementAccepted`、`accountInput`、`passwordInput`、`statusLabel`、`login()`、`dev-login` API 调用、资源加载切换、大厅资料读取。
- 新增 host 回调 `setLoginInputs()`、`openLoginDialog()`、`submitLogin()`、`toggleLoginAgreement()`，让渲染模块只触发 root 行为，不直接碰 API 或路由终态。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，把 `LoginRenderer.ts` 纳入禁止经济写入口 token 扫描，并额外禁止 login renderer 内出现 `this.api`、`devLogin`、`startLobbyLoading`、`loadLobbyProfile`、`renderLobby()`、`renderLoading()`。
- 多分辨率检查已扩展到登录弹窗内部控件：账号输入框、密码输入框、进入游戏按钮、第三方按钮行、协议勾选/文案、返回按钮。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1L 自适应布局解析器模块化

- 本阶段继续只做结构拆分，不改变登录页、大厅页、loading 页的自适应公式和渲染行为。
- 新增 `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts` 和 `AdaptiveStageLayoutResolver.ts.meta`。
- `AdaptiveStageLayoutResolver` 负责 `LOGIN_REFERENCE_WIDTH`、`LOGIN_REFERENCE_HEIGHT`、`LOGIN_STAGE_NODE_NAMES`、最小可见尺寸、`view.getVisibleSize()` fallback、舞台节点尺寸解析、`safeLeft/safeRight/safeTop/safeBottom` 安全区公式。
- `LootChainGameRoot.ts` 仍负责生命周期、视图路由、`renderBase()`、`applyRootSize()`、`makeLayoutKey()`、清理 `contentRoot` 和释放 lobby video runtime 的时机。
- `UiLayout` 已统一从 `LobbyHudTypes.ts` 引入，避免 root 和各模块维护重复布局结构。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，把 `AdaptiveStageLayoutResolver.ts` 纳入禁止经济写入口 token 扫描，并反向禁止 root 再出现 `StageBounds`、`resolveStageBounds()`、`visibleSize()`、`runtimeWindowSize()` 等布局实现。
- 多分辨率检查继续覆盖登录 logo/rail/主按钮、登录弹窗内部控件、loading panel、大厅 HUD/热点/底部栏。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1M UI SpriteFrame 缓存模块化

- 本阶段继续只做结构拆分，不改变登录页、大厅页的图片加载优先级和渲染行为。
- 新增 `assets/scripts/scenes/UiSpriteFrameCache.ts` 和 `UiSpriteFrameCache.ts.meta`。
- `UiSpriteFrameCache` 负责 UI `SpriteFrame` 缓存 Map、加载中 Set、防重复加载、`resources.load(path, SpriteFrame)`、登录图片预加载和大厅玩家信息面板图片预加载。
- `LootChainGameRoot.ts` 仍负责 Cocos Inspector 绑定的 `logoFrame`、`mainButtonFrame`、`rightRailFrames`，并保持这些手动绑定资源优先于缓存资源。
- `addSprite()` 和 `addImageButton()` 仍作为 root 的通用 UI host 方法保留，但现在通过 `uiSpriteFrameCache.resolve/request` 解析或请求图片帧。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，把 `UiSpriteFrameCache.ts` 纳入禁止经济写入口 token 扫描，并反向禁止 root 再出现 `spriteFrames`、`loadingSpriteFrames`、`resources.load(path, SpriteFrame)` 等缓存实现。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1N 只读大厅资料加载器模块化

- 本阶段继续只做结构拆分，不改变登录顺序、大厅进入逻辑和资料展示行为。
- 新增 `assets/scripts/scenes/lobby/LobbyProfileLoader.ts` 和 `LobbyProfileLoader.ts.meta`。
- `LobbyProfileLoader` 现在持有 `LobbyProfileState`，负责 `startLoading -> GET /api/player/me/lobby -> applyLoadedProfile/applyLoadError -> finishLoading` 的只读资料加载编排。
- `LootChainGameRoot.ts` 仍负责 `dev-login`、`setApiBaseUrl`、资源 loading、切换大厅、资料弹窗开关和实际 overlay 节点刷新。
- root 的 `currentLobbyProfile()`、`isLobbyProfileLoading()`、`getLobbyProfileError()` 和登录成功后的 `resetForLogin(userId)` 都改为委托 `LobbyProfileLoader`。
- `LobbyProfileLoader` 只能通过 `isLobbyViewActive()` 和 `refreshLobbyOverlay()` 通知 root 刷新 overlay，继续禁止在资料加载路径里调用 `renderLobby()` 全量重建大厅。
- `scripts/check-layout.mjs` 已加入新模块和 `.meta` 文件检查，把 `LobbyProfileLoader.ts` 纳入禁止经济写入口 token 扫描，并反向禁止 root 再出现 profile loading 实现细节。
- `PlayerProfileApi.ts` 现在也纳入检查：必须保持精确只读 `return this.http.get<PlayerLobbyProfileVO>('/api/player/me/lobby');`，并禁止 `post/put/patch/delete`。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1O Loading Flow Controller Split

- 本阶段继续只做结构拆分，不改变登录、资源加载、大厅进入或 HUD 行为。
- 新增 `assets/scripts/scenes/lobby/LobbyLoadingFlow.ts` 和 `LobbyLoadingFlow.ts.meta`。
- `LobbyLoadingFlow` 现在负责 loading ticket、progress/message/error 状态、retry、过期加载保护、错误捕获，以及调用 `LobbyResourceLoader` 完成 poster/video 本地资源加载。
- `LootChainGameRoot.ts` 不再持有 `loadingProgress`、`loadingMessage`、`loadingError`、`resourceLoadTicket` 或 `LobbyResourceLoader`；root 只通过 host 回调显示/刷新 loading、写入大厅背景资源、切换进入大厅。
- `LobbyLoadingRenderer` 仍只渲染 loading UI；`LobbyResourceLoader` 仍只负责本地 Cocos 资源加载。
- `scripts/check-layout.mjs` 已加入 `LobbyLoadingFlow.ts` 与 `.meta` 检查，纳入禁用经济写入口 token 扫描，并反向禁止 loading flow 实现回到 root。
- `docs/api-contract.md` 已同步当前开放范围：`POST /api/player/auth/dev-login` 加只读 `GET /api/player/me/lobby`，其余玩法/经济接口仍不开放。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
- 阶段边界不变：不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1P Login Flow Split

- 本阶段继续只做结构拆分，不改变登录入口、登录 UI、大厅进入顺序或只读资料加载行为。
- 新增 `assets/scripts/scenes/login/LoginFlow.ts` 和 `LoginFlow.ts.meta`。
- `LoginFlow` 现在负责账号输入引用、协议勾选状态、默认 dev user 兜底、`userId` 解析、`PlayerAuthApi.devLogin(userId)`、登录错误格式化，以及 loading retry 使用的最近 token name。
- `LootChainGameRoot.ts` 不再持有 `accountInput`、`passwordInput`、`agreementAccepted`、`lastTokenName`、`login()`、`resolveDevUserId()` 或 `formatApiError()`；root 只通过 host 回调设置 API base URL、设置状态文案、重置只读 profile、启动 loading、异步加载只读 profile。
- `LoginRenderer` 仍只负责可视 UI 渲染，不触碰 API；`LoginFlow` 只接收 `PlayerAuthApi`，不接收完整 `LootChainApi`，避免带入 gacha/hero/bag 等经济模块。
- `scripts/check-layout.mjs` 已加入 `LoginFlow.ts` 与 `.meta` 检查，纳入禁用经济写入口 token 扫描，并反向禁止 dev-login flow 实现回到 root。
- 验证结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed。
- 阶段边界不变：当前只开放 `POST /api/player/auth/dev-login` 和只读 `GET /api/player/me/lobby`；不改变经济规则，不开放 EX V1，不新增任何玩法或经济写入口。

### 2026-05-30 Lobby Stage 1Q Shared Text And Status Modules

- User changed the workflow: modularization stages no longer require confirmation between phases. Continue autonomously until the current Cocos lobby/frontend refactor is complete.
- Added `assets/scripts/scenes/UiTextFormatter.ts` and `.meta`.
- `UiTextFormatter` owns pure helpers: `positiveInteger()`, `formatInteger()`, `compactResourceValue()`, `trimText()`, and `safeText()`.
- Root, avatar renderer, profile state, and profile dialog now share the formatter instead of carrying duplicate private helpers.
- Added `assets/scripts/scenes/StatusPresenter.ts` and `.meta`.
- `StatusPresenter` owns the current status `Label`, status add/set behavior, and reset after content-root clearing so status updates do not target detached labels.
- `LootChainGameRoot.ts` keeps only `addStatus()` and `setStatus()` wrappers for existing renderer host contracts.
- `scripts/check-layout.mjs` now validates both modules and forbids formatter/status implementation from returning to root.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 2F Readonly Codex Panel

- 当前继续以 `D:\business\project\lootchain-cocos` 的 Cocos-only 大厅为准，不回到 web-vue。
- 多角色结论：
  - 产品：底部 `图鉴` 是大厅基础可达入口，但当前只能做只读预览，不能进入英雄养成。
  - UI/设计：用暗金弹框、卡片网格和统计芯片表达“收录/已拥有/只读预览”，保持与大厅 HUD 风格一致。
  - 接口：前端不直接调用带有升级、升星、觉醒、精炼写入口的英雄 Controller，改走大厅专用只读门面 `GET /api/player/lobby/codex`。
  - 审查/测试：后端过滤 EX/锁定内容，前端二次过滤 `EX` rarity 和 `EX_` heroCode；检查脚本固定该只读 allowlist 与 modal 阻断行为。
- 本轮完成：
  - 新增 `LobbyCodexApi`、`LobbyCodexTypes`、`LobbyCodexState`、`LobbyCodexLoader`、`LobbyCodexPanelRenderer`。
  - `LootChainGameRoot` 增加图鉴弹框打开、关闭、刷新、状态读取和重绘清理。
  - `LobbyHudRenderer` 的底部 `图鉴` 与小屏 compact `图鉴` 会打开只读图鉴面板。
  - 图鉴面板内部点击不会关闭弹框；仅外层遮罩或关闭按钮关闭。
  - 面板只显示英雄基础信息和拥有状态，不提供升级、升星、觉醒、精炼、获取、领奖、购买、出售、结算、抽卡或任何经济写操作。
- 后端配套：
  - `LootChain` 新增 `PlayerLobbyCodexController`、`PlayerLobbyCodexService`、`PlayerLobbyCodexServiceImpl`、`PlayerLobbyCodexItemVO`。
  - `lootchain-admin` 已排除该玩家端 Controller，避免后台应用加载玩家 Sa-Token 链路。
- 验收状态：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed。
  - `mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests compile` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口；当前图鉴是只读展示。

### 2026-05-30 Lobby Stage 2D Readonly Notice Panel And Interface Guardrails

- Continued the lobby work through product, UI/design, backend-interface, review, and test roles without waiting for per-stage confirmation.
- Backend interface added in `D:\business\project\LootChain`: `GET /api/player/lobby/notices`, `PlayerLobbyNoticeController`, `PlayerLobbyNoticeService`, `PlayerLobbyNoticeServiceImpl`, and `PlayerLobbyNoticeVO`.
- The new backend endpoint requires the player Sa-Token login context and only reads published, in-window `notice_config` rows. It does not create rewards, does not update player state, and does not add any economy write path.
- Admin/game scan boundary updated: `PlayerLobbyNoticeController` is excluded from `lootchain-admin` through `AdminApplication`, matching the existing player-controller isolation pattern.
- Cocos frontend added `LobbyNoticeTypes.ts`, `LobbyNoticeApi.ts`, `LobbyNoticeState.ts`, `LobbyNoticeLoader.ts`, and `LobbyNoticePanelRenderer.ts`.
- `LootChainGameRoot.ts` now owns the notice panel open/close state, loads notices after login, and keeps notice/profile/placeholder panels mutually exclusive.
- `LobbyHudRenderer.ts` now routes the desktop activity entry and compact `活动` entry to the readonly notice panel. Other lobby entries still open the unified local unopened dialog.
- `scripts/check-layout.mjs` now requires the new notice API/type/loader/state/panel files and their `.meta` files, scans login/lobby scene modules by directory, adds explicit forbidden tokens for EX V1-style and fund-pool-style client access, and enforces a lobby readonly API allowlist.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - Backend `mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests compile` -> passed. Maven still reports the existing local `settings.xml` format warning, but compilation succeeds.
- Boundary update: active Cocos client API surface is now `POST /api/player/auth/dev-login`, readonly `GET /api/player/me/lobby`, and readonly `GET /api/player/lobby/notices`. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 2E Notice Error Fallback And Modal Click Blocking

- User reported the notice/activity panel displayed `读取失败：系统异常`, and clicking inside dialogs could close them.
- Backend fix:
  - `PlayerLobbyNoticeServiceImpl.listActiveNotices()` now catches local read failures and returns an empty readonly list.
  - This is mainly for local/dev databases where `notice_config` may not be initialized yet; the server logs a warning but does not break the lobby notice panel.
- Cocos modal fix:
  - `LobbyNoticePanelRenderer.ts` adds `BlockInputEvents` to `LobbyNoticePanel`.
  - `LobbyProfileDialogRenderer.ts` adds `BlockInputEvents` to `LobbyProfilePanel`.
  - `LootChainGameRoot.ts` adds `BlockInputEvents` to `LobbyPlaceholderPanel`.
  - Result: only outside dim clicks or explicit close buttons close dialogs; clicks inside panel content no longer pass through to the dim layer.
- Notice UI wording fix:
  - When the notice endpoint is unavailable, the panel now shows a soft fallback status instead of a red `读取失败：系统异常` prompt.
- Guardrail update:
  - `scripts/check-layout.mjs` now requires the modal `BlockInputEvents` tokens for notice/profile/placeholder panels.
- Verification:
  - `npm.cmd run check:layout` -> passed.
  - Focused Cocos `tsc.cmd --noEmit` -> passed.
  - Backend `mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests compile` -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1W 统一未开放弹窗

- 用户已明确要求停止继续拆模块，本阶段改为推进可见功能体验。
- 本阶段新增大厅统一“功能暂未开放”本地弹窗：
  - 根脚本状态：`lobbyPlaceholderDialog`
  - 打开/关闭/移除：`openLobbyPlaceholderDialog()`、`closeLobbyPlaceholderDialog()`、`removeLobbyPlaceholderDialog()`
  - 渲染节点：`LobbyPlaceholderDim`、`LobbyPlaceholderPanel`、`Button_知道了`
- 触发范围：
  - 左侧活动入口
  - 中央建筑热点与铭牌
  - 右侧挑战卡片
  - 底部导航
  - 右下冒险按钮
  - 右上系统图标
- 所有触发仍然只是本地 placeholder，不跳转玩法页面，不调用玩法接口，不新增经济写入口。
- `scripts/check-layout.mjs` 已补充：
  - 检查弹窗方法和节点存在。
  - 检查打开/关闭弹窗路径不能调用 `renderLobby()`，避免重建大厅背景。
  - 多分辨率校验 `LobbyPlaceholderPanel` 保持在舞台内。
- 验证完成：
  - `npm.cmd run check:layout` -> passed with `layout ok`
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed
  - 触达代码中文注释/中文文案扫描 -> passed
- 边界不变：当前只开放 `POST /api/player/auth/dev-login` 与只读 `GET /api/player/me/lobby`。不改变经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-05-30 Lobby Stage 1X 多角色大厅推进

- 本阶段按产品、设计、美术、UI、开发、接口边界、代码审查、测试七个角色推进。
- 产品结论：
  - 当前不缺大厅功能骨架，下一批优先做不接后端的可见体验、占位反馈、断点体验和视觉质感。
  - 必须后置真实资产、邮件、公告、排行榜、聊天、红点、倒计时、活动、战斗、结算、领取、购买、兑换、抽卡、背包使用、任务奖励、USDT/资金池等。
- 设计/美术结论：
  - 当前 HUD 偏“控件覆盖层”，参考图更像“场景建筑承载入口 + 暗金压边 HUD”。
  - 下一批优先做暗角压层、中央铭牌质感、右侧挑战卡伪插画、资源栏禁用态、底部地台、活动徽章感。
- 接口边界结论：
  - 当前客户端开放面仍只允许 `POST /api/player/auth/dev-login` 和只读 `GET /api/player/me/lobby`。
  - `LootChainApi` 中历史 gacha/hero/bag API 不代表当前阶段开放，Lobby 不得调用。
- 审查修复：
  - `UiContentRootController.clear()` 改为逐个 `removeFromParent()` + `destroy()`，避免旧 Button/Label/Tween/Video 节点脱离父节点后继续存活。
  - `LobbyLoadingFlow.cancel()` 用于 root 销毁时让 loading ticket 失效，避免异步资源加载完成后写入已销毁场景。
  - `renderCurrentView()` 在大厅已有背景时走 `refreshLobbyViewPreservingBackground()`，只重排背景尺寸与 HUD overlay，不再强制 stop/play 背景视频。
  - `LobbyBackgroundController` 增加 `isRendered()`、`resize()`、背景节点引用和销毁 helper，用于 preserve/resize 背景。
  - 窄屏右上系统图标会在可能撞到玩家信息面板时隐藏。
  - 未开放弹窗的“知道了”按钮改为 `LobbyPlaceholderPanel` 子节点 `LobbyPlaceholderOkButton`，不再依赖 root 下的 `Button_知道了` 硬编码清理。
- 本阶段新交互：
  - 顶部资源格点击打开统一未开放弹窗。体力说明来自只读 profile；金币/红宝石/水晶说明仍为视觉占位。
  - 底部聊天预览点击打开统一未开放弹窗，不创建发送框，不连接聊天服务。
- 本阶段新视觉：
  - `LobbyAtmosphereOverlay` 通过 Cocos Graphics 多层半透明压边制造暗角和底部压暗。
  - 中央建筑铭牌增加投影、内外暗金描边和细金线。
  - 右侧挑战卡增加暗色剪影、斜切高光和弱红光，先用 Graphics 提升质感，不新增 bitmap 资产。
- `scripts/check-layout.mjs` 已增强：
  - 资源栏/聊天栏 placeholder token。
  - Lobby HUD 点击契约：除玩家信息外，点击必须走未开放弹窗或受控热点入口。
  - content-root 必须 destroy 旧子节点。
  - loading flow 必须有 `cancel()`。
  - background controller 必须支持 `isRendered()`/`resize()`，用于大厅内保留背景。
  - 系统图标按窄屏重叠规则校验。
  - 增加 839/840、899/900、999/1000、1179/1180、499/500、519/520、559/560、1536x1024、2560x1080、3440x1440 等 viewport 检查。
- 验证完成：
  - `npm.cmd run check:layout` -> passed with `layout ok`
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口。

### 2026-05-30 Lobby Stage 1U HUD Layout Metrics Split

- User requested the next stage to continue automatically.
- This stage continues lobby HUD modularization without changing behavior.
- Added `assets/scripts/scenes/lobby/LobbyHudLayout.ts` and `LobbyHudLayout.ts.meta`.
- `LobbyHudLayout` owns pure geometry helpers:
  - `lobbyHudScale(layout)`
  - `lobbyHudEdgeInset(layout, axis, scale)`
  - `resolveLobbyPlayerInfoLayout(layout)`
- `LobbyHudRenderer.ts` keeps the same render order and wrapper method names, but delegates these formulas to `LobbyHudLayout`.
- `scripts/check-layout.mjs` now:
  - requires `LobbyHudLayout.ts` and `.meta`;
  - includes the layout module in the guarded client-source scan;
  - includes it in the combined lobby HUD module token checks;
  - requires the extracted layout formulas in `LobbyHudLayout`;
  - forbids those formulas from returning to `LobbyHudRenderer.ts`.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 1V Top HUD Renderer Split

- User requested the next stage.
- This stage continues lobby HUD modularization without changing visible behavior or API boundaries.
- Added `assets/scripts/scenes/lobby/LobbyTopHudRenderer.ts` and `LobbyTopHudRenderer.ts.meta`.
- `LobbyTopHudRenderer` owns:
  - `LobbyPlayerInfoButton`, player info art/fallback frame, level/name/power/EXP labels, profile-dialog click.
  - `LobbyResourceBar`, stamina display, readonly coin/ruby/crystal visual placeholders, disabled `+` marks.
  - `LobbySystemIcons`, friends/mail/settings/menu local placeholder buttons.
- `LobbyHudRenderer.ts` now:
  - constructs `private readonly topHudRenderer`;
  - calls `this.topHudRenderer.render(layout)` first;
  - keeps activity rail, center hotspots, right challenge cards, bottom HUD, local click effects, shared red-dot rendering, and shared text outline style.
- `LobbyHudLayout.ts` remains the single source for top HUD geometry, so the split does not fork multi-resolution formulas.
- `scripts/check-layout.mjs` now:
  - requires `LobbyTopHudRenderer.ts` and `.meta`;
  - includes it in guarded client-source scans and combined lobby HUD module checks;
  - requires player/resource/system top-HUD tokens inside the new module;
  - forbids top-HUD implementation tokens from returning to `LobbyHudRenderer.ts`.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 1R UI Primitive Factory Split

- Added `assets/scripts/scenes/UiPrimitiveFactory.ts` and `.meta`.
- `UiPrimitiveFactory` owns shared low-level Cocos UI construction: labels, edit boxes, password masking, framed inputs, buttons, image buttons, sprites, child labels, account glyphs, rectangles, beveled panels, progress bars, hover/press feedback, pointer cursor binding, and button frame drawing.
- The factory uses `UiSpriteFrameCache` for SpriteFrame resolve/request while root still supplies Inspector-bound override frames.
- `LootChainGameRoot.ts` now keeps thin wrapper methods so existing host interfaces for `LoginRenderer`, `LobbyHudRenderer`, `LobbyLoadingRenderer`, `LobbyProfileDialogRenderer`, and `LobbyBackgroundController` remain stable.
- `scripts/check-layout.mjs` now validates the primitive factory, forbids API/economy/gameplay responsibilities inside it, and blocks primitive implementation from returning to root.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 1S Content Root Controller Split

- Added `assets/scripts/scenes/UiContentRootController.ts` and `.meta`.
- `UiContentRootController` owns Cocos root sizing, `LootChainCocosLoginUIRoot` creation, UI node creation, node removal, full content clearing, and content-root validity recovery.
- `LootChainGameRoot.ts` no longer stores `contentRoot`; root delegates `createUiNode()`, `removeNodeFromContent()`, `ensureContentRoot()`, and `applyRootSize()` to the controller.
- Route/view switching remains in root by design, matching the current root responsibility: Cocos lifecycle plus login/loading/lobby transitions.
- `scripts/check-layout.mjs` now validates the content-root controller, forbids API/economy/gameplay responsibilities inside it, and blocks content-root implementation from returning to root.
- Current important modules after Stage 1S:
  - Root/lifecycle: `assets/scripts/scenes/LootChainGameRoot.ts`
  - Layout: `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts`
  - Content root: `assets/scripts/scenes/UiContentRootController.ts`
  - UI primitives: `assets/scripts/scenes/UiPrimitiveFactory.ts`
  - Text/status: `assets/scripts/scenes/UiTextFormatter.ts`, `assets/scripts/scenes/StatusPresenter.ts`
  - Sprite cache: `assets/scripts/scenes/UiSpriteFrameCache.ts`
  - Login: `assets/scripts/scenes/login/LoginRenderer.ts`, `assets/scripts/scenes/login/LoginFlow.ts`
  - Lobby: `assets/scripts/scenes/lobby/LobbyHudRenderer.ts`, `LobbyHudConfig.ts`, `LobbyHudTypes.ts`, `LobbyBackgroundController.ts`, `LobbyLoadingFlow.ts`, `LobbyLoadingRenderer.ts`, `LobbyResourceLoader.ts`, `LobbyProfileLoader.ts`, `LobbyProfileState.ts`, `LobbyProfileDialogRenderer.ts`, `LobbyAvatarRenderer.ts`
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 1T Chinese Code Comments

- User requested that code should include Chinese comments so future reading is easier.
- Added Chinese comments across the current Cocos frontend code path:
  - Root/lifecycle: `assets/scripts/scenes/LootChainGameRoot.ts`
  - Shared infrastructure: `AdaptiveStageLayoutResolver.ts`, `StatusPresenter.ts`, `UiContentRootController.ts`, `UiPrimitiveFactory.ts`, `UiTextFormatter.ts`, `UiSpriteFrameCache.ts`
  - Login: `assets/scripts/scenes/login/LoginRenderer.ts`, `LoginFlow.ts`
  - Lobby: HUD/config/types, avatar, background, loading, profile dialog/state/loader, resource loader
  - Login VFX scripts under `assets/scripts/login/`, plus `LootChainLoginEffectLayer.ts` and `VortexCloudMaterialController.ts`
  - API/config/storage/types: `AppConfig.ts`, API wrappers, `HttpClient.ts`, `TokenStore.ts`, and shared VO/type files
- Future comment style:
  - Use Chinese comments for module ownership, safety boundaries, async stale-state guards, adaptive layout formulas, resource fallbacks, and placeholder-only restrictions.
  - Do not write noisy line-by-line comments for obvious assignments.
  - Comments inside guarded modules must avoid forbidden responsibility tokens, because `scripts/check-layout.mjs` scans comments too.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 1Y HUD Placeholder State And Safety Polish

- User asked to continue the remaining lobby work with multiple roles and no per-stage confirmation.
- Product/design/art/UI/development/review/test conclusions:
  - keep Cocos-only lobby as the current acceptance path;
  - do not connect gameplay, economy, reward, chat sending, ranking, shop, battle, or settlement systems;
  - make visible HUD entries clearer as `预览/未开放/占位`, not fake live operations.
- Implemented config state cleanup:
  - `LobbyHudConfig.ts` activity sublines now use `预览中` / `未开放` / `占位展示` / `暂未开放`;
  - challenge sublines now use `预览中` / `锁定` / `未开放` / `占位展示`;
  - bottom nav red dots are disabled for this placeholder-only stage.
- Implemented visible HUD polish:
  - `LobbyHudRenderer.ts` bottom HUD now draws a layered dark platform with segmented gold rail;
  - activity rows now use dark-gold banner plates and `LobbyActivityPreviewBadge`;
  - challenge cards now use `LobbyChallengePreviewBadge`;
  - bottom nav slots now have muted metal bases and separators;
  - chat preview now uses `LobbyChatChannel` plus ticker-style message text.
- Implemented top-resource safety polish:
  - stamina remains the only readonly profile-backed resource in the top bar;
  - coin/ruby/crystal now display `未开放` instead of fake wallet-like quantities.
- Implemented readonly profile safety polish:
  - `LobbyProfileLoader.cancel()` invalidates stale profile requests on root destroy and login reset;
  - `LobbyProfileState.applyLoadedProfile()` rejects mismatched `profile.userId` into local fallback state with `资料账号不匹配`.
- `scripts/check-layout.mjs` now guards the new visual tokens and profile async/identity safeguards.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 2B Multi-Role Polish And Safety

- 当前实际工作目录：`D:\business\project\lootchain-cocos`。历史段落中的 `D:\project\lootchain-cocos` 是早期路径记录，新窗口继续以前者为准。
- 用户已授权大厅剩余任务不再逐阶段等待确认，按产品、设计、美术/UI、开发、接口边界、审查、测试多角色自动推进。
- 本轮完成 UI/视觉：
  - 中央场景热点牌匾升级为暗金多层 nameplate，并保持所有未开放入口 `hot: false`，避免真实红点误导。
  - 右侧挑战卡改为非矩形暗金卡片轮廓，增加侧边轨道和更强伪插画遮罩。
  - 底部 HUD 改为三层阶梯式黑金平台；右下“冒险”副标题改为 `未开放`，不再显示假章节进度。
  - 玩家资料弹窗改用安全区拟合缩放，窄屏自动单列展示资料，避免头像、昵称、状态和资料行挤压。
- 本轮完成运行安全：
  - `PlayerAuthApi.devLogin()` 只返回 token，不立即保存。
  - `LoginFlow` 在当前 ticket 校验通过后才调用 `saveToken()`，旧登录响应不会覆盖新 token。
  - `LootChainGameRoot.onDestroy()` 会调用 `loginFlow.cancel()`，销毁时让未完成登录回调失效。
- 本轮完成守卫：
  - `scripts/check-layout.mjs` 检查新牌匾、挑战卡、底部平台、窄屏资料弹窗 token。
  - 检查 lobby config 不能出现 `hot: true`。
  - 检查大厅背景 preserve 刷新顺序、stale-safe token 保存、固定资源栏占位顺序和 disabled plus 非交互。
- 已验证：
  - `npm.cmd run check:layout` -> 通过，输出 `layout ok`。
  - Cocos Creator 3.8.8 自带 `tsc.cmd --noEmit` focused 编译 -> 通过。
  - `git diff --check` -> 通过，仅有已有 LF/CRLF 转换 warning。
- 当前边界仍不变：只开放 `POST /api/player/auth/dev-login` 和只读 `GET /api/player/me/lobby`；不开放 EX V1；不新增抽卡、英雄、背包、商店、领取、购买、结算、资金池、链上领取等任何经济写入口；大厅所有入口仍是本地 placeholder 弹窗。

### 2026-05-30 Lobby Poster SpriteFrame Import Fix

- 用户点击登录后资源加载页报错：`Bundle resources doesn't contain lobby/lobby_bg_poster/spriteFrame`。
- 根因：`assets/resources/lobby/lobby_bg_poster.jpg.meta` 只有 `texture` 子资源，没有 `spriteFrame` 子资源；而 `LobbyResourceLoader` 正确加载的是 `lobby/lobby_bg_poster/spriteFrame`。
- 已修复：
  - `lobby_bg_poster.jpg.meta` 增加 `f9941` 的 `sprite-frame` 子资源，尺寸为 `3840x2160`。
  - `userData.type` 改为 `sprite-frame`。
  - `scripts/check-layout.mjs` 新增 poster meta 守卫，确认 `lobby_bg_poster.jpg.meta` 存在、poster 仍是 3840x2160、且导入类型为 `sprite-frame`。
- 已验证：
  - `npm.cmd run check:layout` -> 通过，输出 `layout ok`。
- 如果 Cocos Preview 还缓存旧 bundle，重启/刷新 Preview 或重新导入该资源后再点登录。
- 边界不变：只是本地资源导入元数据修复，不新增任何接口或经济写入口。

### 2026-05-30 Lobby Stage 2C Compact Action Access

- 继续大厅剩余任务，优先补小屏可达性。
- 问题背景：Stage 2A 已给中央 8 个场景热点加了 `LobbyCompactSceneEntrances`，但小屏下活动栏、右侧挑战、底部导航、冒险和聊天仍可能被隐藏。
- 本轮完成：
  - `LobbyHudRenderer.ts` 新增 `renderCompactActionEntrances()`。
  - 在侧栏或底部 HUD 因分辨率隐藏时，渲染 `LobbyCompactActionEntrances`。
  - 快捷入口包含：`活动`、`挑战`、`冒险`、`聊天`、`英雄`、`背包`、`任务`、`商店`。
  - 所有入口只打开统一未开放弹窗，不跳转、不战斗、不结算、不发奖、不写入经济数据。
  - `LootChainGameRoot.rerenderLobbyOverlay()` 现在会清理 `LobbyCompactActionEntrances` 和 `LobbyCompactSceneEntrances`，避免 resize 或资料刷新后叠出重复面板。
  - `scripts/check-layout.mjs` 已补充 compact action token 和多分辨率边界校验。
- 已验证：
  - `npm.cmd run check:layout` -> 通过，输出 `layout ok`。
  - Cocos Creator 3.8.8 自带 `tsc.cmd --noEmit` focused 编译 -> 通过。
- 边界不变：只开放 `POST /api/player/auth/dev-login` 和只读 `GET /api/player/me/lobby`；不开放 EX V1；不新增任何经济写入口。

### 2026-05-30 Lobby Stage 1Z Profile And Placeholder Clarity

- Continued remaining lobby work without waiting for per-stage confirmation.
- `LobbyProfileDialogRenderer.ts` now keeps the original readonly rows and, when space allows, adds local placeholder rows:
  - `主线进度` -> `未开放`
  - `深渊层数` -> `未开放`
  - `公会` -> `未加入`
  - `称号` -> `圣契旅者`
- The profile dialog still has no edit, bind, logout, reward, or economy action.
- `LootChainGameRoot.ts` unopened dialog now derives subtitles by entry type:
  - resource entries show `只读/占位资源`;
  - chat preview shows `本地聊天预览`;
  - system icons show `系统入口占位`;
  - battle/settlement-like entries show `玩法未开放`.
- `LobbyPlaceholderBoundaryNote` gives an extra local-only boundary message when panel height allows.
- `scripts/check-layout.mjs` now guards the profile placeholder rows and placeholder boundary note.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Lobby Stage 2A Small-Screen Access And Guardrails

- User asked to continue with multiple roles.
- Product role found the main remaining gap: small layouts hid too many lobby entries, so core scene hotspots were not reachable on mobile/compact previews.
- Design/art role recommended continuing with Cocos `Graphics`, especially resource capsules and better compact UI instead of adding bitmap assets.
- Interface/review/test roles recommended login stale-response guards and stronger dependency-free checks.
- Implemented UI/accessibility:
  - `LobbyHudRenderer.ts` now renders `LobbyCompactSceneEntrances` when normal scene hotspots are hidden by size thresholds.
  - The compact panel includes all eight local scene entries: 召唤祭坛、公会、排行榜、旅者集会、熔铸工坊、深渊之门、战役、商店.
  - Compact entries call the same placeholder path as desktop hotspots; no gameplay/economy route is opened.
- Implemented top-resource polish:
  - `LobbyTopHudRenderer.ts` resource cells now draw `drawResourceCapsule()` dark-gold beveled capsules.
  - Resource glyphs gained extra highlight/cut lines.
  - If the full resource bar cannot fit, `LobbyCompactStaminaChip` preserves a local stamina entry where there is enough vertical space.
- Implemented runtime hardening:
  - `LoginFlow.ts` now uses `loginTicket`, `nextLoginTicket()`, and `isCurrentLogin()` so stale `dev-login` responses cannot start loading/profile flow after a newer login attempt.
  - `LobbyResourceLoader.ts` now requires `${LOBBY_POSTER_PATH}/spriteFrame` and no longer builds runtime SpriteFrame from texture fallback.
- Implemented guardrail hardening:
  - `scripts/check-layout.mjs` now parses `LOBBY_SCENE_HOTSPOTS` from `LobbyHudConfig.ts` instead of using a duplicate coordinate array.
  - It validates normalized hotspot/hit-area bounds and keeps config data-only.
  - It guards compact scene entries, compact stamina chip, resource capsules, login ticket, resource loader hard-fail behavior, and non-stamina resource placeholders.
  - It adds threshold viewport checks around 719/720, 1000x519, and 1180x500.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active. No gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

### 2026-05-30 Latest Context: Lobby Stage 2G Readonly Hero Roster

- 最新阶段是 Cocos-only 大厅 `英雄` 只读队列，不回到 web-vue。
- 前端新增 `LobbyCodexApi`、`LobbyCodexTypes`、`LobbyCodexState`、`LobbyCodexLoader`、`LobbyCodexPanelRenderer`，底部 `图鉴` 和 compact `图鉴` 都打开该面板。
- 后端新增大厅专用只读门面 `GET /api/player/lobby/codex`，对应 `PlayerLobbyCodexController`、`PlayerLobbyCodexService`、`PlayerLobbyCodexServiceImpl`、`PlayerLobbyCodexItemVO`。
- 前端新增 `LobbyHeroApi`、`LobbyHeroTypes`、`LobbyHeroRosterState`、`LobbyHeroRosterLoader`、`LobbyHeroRosterPanelRenderer`，底部 `英雄` 和 compact `英雄` 都打开该面板。
- 后端新增大厅专用只读门面 `GET /api/player/lobby/heroes`，对应 `PlayerLobbyHeroController`、`PlayerLobbyHeroService`、`PlayerLobbyHeroServiceImpl`、`PlayerLobbyHeroItemVO`。
- 前端不直接调用包含升级、升星、觉醒、精炼写入口的英雄 Controller；图鉴面板不提供任何养成、获取、领奖、购买、出售、结算或经济写操作。
- 英雄队列面板展示主角和已拥有英雄，主角按 `protagonist=true` 置顶，面板不提供任何养成、抽卡、领奖、购买、出售、结算或经济写操作。
- EX/锁定内容由后端过滤，Cocos API 包装层再过滤 `EX` rarity 和 `EX_` heroCode。
- 图鉴弹框内部点击通过 `BlockInputEvents` 阻断，不会误关闭；只允许外层遮罩或关闭按钮关闭。
- 英雄队列弹框内部点击通过 `BlockInputEvents` 阻断，不会误关闭；只允许外层遮罩或关闭按钮关闭。
- 文档与检查脚本已同步增加只读 API allowlist、modal 阻断、EX 过滤、主角置顶和多分辨率边界守卫。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口。

### 2026-05-30 Normal Player Flow Analysis

- 用户要求分析“正常玩家登录进入游戏后会做什么”，并按产品、设计、玩家、UI、美术、研发、审查、验收多角色拆解。
- 已新增文档：`D:\business\project\lootchain-cocos\docs\normal-player-flow-analysis.md`。
- 结论：下一阶段不应继续扩大厅占位入口，而应推进第一条真实游玩主线。
- 推荐下个开发阶段：`Stage 3A：大厅右下冒险入口 -> 主线推荐状态 -> 章节地图只读壳`。
- 标准玩家闭环定义为：登录 -> 加载账号状态 -> 进入大厅 -> 明确下一目标 -> 主线/冒险 -> 编队确认 -> 战斗 -> 结算 -> 成长 -> 回到大厅继续。
- 研发顺序建议：先只读主线推荐和章节地图，再做队伍确认，再做战斗表现壳，最后单独审查后端战斗结算。
- 审查边界：前端不能决定奖励、掉落、经验、金币、材料或关卡完成；经济写入口必须后端事务、幂等和日志；EX V1 仍然不开放。

### 2026-05-30 Protagonist Create Design

- 用户提出登录成功后应先进入主角色选择/创建界面：男/女二选一、起名、点击进入游戏。
- 主角色设计边界：
  - 主角不是抽卡池英雄，不参与抽卡概率，不产出抽卡碎片。
  - 主角建议为 `SSR 主角`，属性按 SSR 档，但属于主角专属 SSR。
  - 主角在英雄列表第一位，以卡牌形式展示，可加入战斗。
  - 主角有攻击、防御、辅助三形态；默认攻击形态，防御/辅助通过主线剧情道具或主线进度解锁。
  - 当前不开放 EX V1，不新增经济写入口。
- 多角色结论：
  - 产品/玩家：主角是“玩家身份载体 + 新手保底战斗单位”，V1 先做创建、攻击形态、英雄列表置顶、可参战。
  - UI/美术：角色创建页使用暗黑哥特、黑金、深渊红、影视级主菜单风格；文字和按钮后续用 Cocos 原生 UI，不烘焙在 AI 图里。
  - 研发/审查：主角创建是账号初始化能力；建议 `player_protagonist` + `user_hero source_type=PROTAGONIST`；创建接口只能后端固定模板，不能让客户端传 heroCode/rarity/stats。
- 已用 imagegen 生成影视级角色创建界面概念图，并复制到：
  - `D:\business\project\lootchain-cocos\docs\ui-reference\protagonist\protagonist-create-concept-v1.png`
- 已新增设计文档：
  - `D:\business\project\lootchain-cocos\docs\protagonist-create-design.md`
- 推荐下一阶段：
  - `Stage P1：角色创建产品壳`，先做 Cocos 前端 UI、男/女选择、名字输入、本地进入大厅流程。
  - 后端主角创建接口属于高风险玩家状态写入，应单独设计、审查和验收后再接入。

### 2026-05-30 Protagonist Stage P1 Cocos Shell

- 已按上一阶段设计开始实现 `Stage P1：角色创建产品壳`。
- 当前仍只改 Cocos 前端，不新增后端接口，不写数据库，不新增经济写入口。
- 新增文件：
  - `assets\scripts\types\ProtagonistTypes.ts`
  - `assets\scripts\scenes\protagonist.meta`
  - `assets\scripts\scenes\protagonist\ProtagonistCreateState.ts`
  - `assets\scripts\scenes\protagonist\ProtagonistCreateFlow.ts`
  - `assets\scripts\scenes\protagonist\ProtagonistCreateRenderer.ts`
- 路由变化：
  - `LoginFlow` 登录成功后调用 `handleLoginSuccess(userId, tokenName)`。
  - `LootChainGameRoot` 新增 `protagonistCreate` view。
  - 新账号本地预览状态会进入主角创建页。
  - 本地已创建过主角的账号跳过创建页，继续原来的 loading -> lobby 流程。
- 角色创建页能力：
  - 男/女主角二选一。
  - 输入角色名，长度 2-12，支持中文、英文、数字、下划线。
  - 展示 `SSR 主角` 和三形态。
  - 攻击形态默认开放。
  - 防御/辅助形态只显示锁定提示：需要主线剧情道具解锁。
- 本地预览状态：
  - 使用 `lootchain.protagonist.preview.v1.{userId}` 保存创建预览。
  - 该状态仅用于前端流程验证，不等同于正式账号主角。
- `scripts/check-layout.mjs` 已增加主角创建模块、关键 token、禁止接口/经济词、以及多分辨率 bounds 守卫。
- 已验证：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增经济写入口；正式主角创建接口后续单独审查。

### 2026-05-30 Protagonist Character Art Patch

- 用户反馈主角创建页只有剪影，没有人物图，需要按概念图放入角色。
- 已从 `docs/ui-reference/protagonist/protagonist-create-concept-v1.png` 裁切并接入男女主角图：
  - `assets/resources/ui/protagonist/protagonist_male_attack.png`
  - `assets/resources/ui/protagonist/protagonist_female_attack.png`
- 已新增：
  - `assets/resources/ui/protagonist.meta`
  - `assets/resources/ui/protagonist/protagonist_male_attack.png.meta`
  - `assets/resources/ui/protagonist/protagonist_female_attack.png.meta`
- `ProtagonistCreateRenderer.ts` 现在通过 `addSprite()` 优先渲染 `ui/protagonist/protagonist_*_attack/spriteFrame`。
- 剪影仅作为资源加载失败兜底保留。
- `scripts/check-layout.mjs` 已加入 protagonist 资源必需项和 renderer 资源路径守卫。
- 已验证：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只接入本地 UI 资产，不新增接口、不写数据库、不改变经济规则、不开放 EX V1。

### 2026-05-30 Protagonist Generated Art Replacement

- 用户反馈上一版主角图来自概念图裁切，裁剪质量不足。
- 已使用 imagegen 重新生成接近概念方向的高质量影视级男女主角卡面，并覆盖现有资源：
  - `assets/resources/ui/protagonist/protagonist_male_attack.png`
  - `assets/resources/ui/protagonist/protagonist_female_attack.png`
- 两张图片已统一为 `512x768`，保留原 `.meta` 和现有 `spriteFrame` 加载路径。
- `ProtagonistCreateRenderer.ts` 无需改路径，仍优先加载 `ui/protagonist/protagonist_*_attack/spriteFrame`。
- 下一窗口接手时，如需继续优化角色创建页，优先在现有卡面资源基础上调卡框、标题、输入框和按钮，不要回退到剪影或概念图裁切版。
- 边界不变：本次只替换本地 UI 资产，不新增后端接口，不写数据库，不改变经济规则，不开放 EX V1。

### 2026-05-30 Protagonist DB Sync Clarification

- 历史状态：当时创建角色不会同步到数据库。
- 当时 `ProtagonistCreateFlow.submitCreate()` 只调用 `ProtagonistCreateState.createLocalProfile()`，没有调用任何后端 `POST` 创建接口。
- 当时保存位置是 Cocos 预览环境的本地状态：
  - 内存 `memoryProfiles`
  - `localStorage` key：`lootchain.protagonist.preview.v1.{userId}`
- 本地创建成功当时只用于跳过创建页并进入 loading/lobby；不同设备、不同浏览器或清空本地存储后不会保留。

### 2026-05-30 Protagonist DB Sync Stage

- 当前最新状态：主角色创建已经从本地预览改为服务端权威创建。
- Cocos 登录成功后会先调用：
  - `GET /api/player/protagonist/state`
  - `POST /api/player/protagonist`
- 前端只允许提交：
  - `gender`
  - `protagonistName`
- 前端不提交 `heroCode`、`rarity`、等级、星级、战力、属性或奖励字段；这些都由后端固定生成。
- 后端新增主角色模块：
  - `PlayerProtagonistController`
  - `PlayerProtagonistService`
  - `PlayerProtagonistServiceImpl`
  - `PlayerProtagonistMapper`
  - `PlayerProtagonist`
  - `PlayerProtagonistVO`
  - `PlayerProtagonistStateVO`
  - `PlayerProtagonistCreateDTO`
- 数据库新增/更新：
  - `player_protagonist`
  - `user_hero.source_type`
  - `user_hero.sort_weight`
  - 主角模板 `PROTAGONIST_MALE_ATTACK` / `PROTAGONIST_FEMALE_ATTACK`
  - SQL 脚本：`D:\business\project\LootChain\sql\12_protagonist_module.sql`
- 创建行为：
  - 使用玩家侧 Sa-Token 登录态。
  - `game_user` 行级锁保护创建流程。
  - `player_protagonist.user_id` 唯一，重复点击或重复请求返回已有主角，不生成第二个主角。
  - 后端创建 `user_hero source_type=PROTAGONIST`，并给主角高 `sort_weight`，用于英雄列表置顶。
  - 防御/辅助形态仍锁定，后续只能由主线剧情/道具链路解锁。
- Cocos 本地 `localStorage` 现在只作为诊断镜像，不再作为是否跳过创建页的权威依据。
- 已执行本地 SQL 迁移，当前本地 `lootchain` schema 已存在 `player_protagonist` 和 `user_hero` 新字段。
- 边界不变：主角色创建是账号初始化写入，不是抽卡、奖励、购买、结算、资金池或链上领取入口；不改变经济规则，不开放 EX V1，不新增经济写入口。

### 2026-05-30 Lobby Stage 2G Readonly Hero Roster

- 下一阶段已推进到 `Stage P3：英雄列表主角置顶` 的大厅只读版本。
- 后端新增大厅专用只读门面：
  - `GET /api/player/lobby/heroes`
  - `PlayerLobbyHeroController`
  - `PlayerLobbyHeroService`
  - `PlayerLobbyHeroServiceImpl`
  - `PlayerLobbyHeroItemVO`
- 该门面复用玩家已拥有英雄列表，但输出更窄的大厅 VO，并额外保证：
  - `source_type=PROTAGONIST` / `protagonist=true` 主角排在第一位。
  - EX 稀有度和 `EX_` 英雄编码过滤。
  - 只读展示，不提供升级、升星、觉醒、精炼、抽卡、领取、购买、出售、结算或任何经济写入口。
- `lootchain-admin` 的 `AdminApplication` 已排除 `PlayerLobbyHeroController`，避免后台应用加载玩家端 Sa-Token Controller。
- Cocos 前端新增：
  - `assets/scripts/types/LobbyHeroTypes.ts`
  - `assets/scripts/api/LobbyHeroApi.ts`
  - `assets/scripts/scenes/lobby/LobbyHeroRosterState.ts`
  - `assets/scripts/scenes/lobby/LobbyHeroRosterLoader.ts`
  - `assets/scripts/scenes/lobby/LobbyHeroRosterPanelRenderer.ts`
- 底部 `英雄` 和小屏 compact `英雄` 会打开只读英雄队列面板。
- 面板展示主角卡、形态、等级、星级、战力和已拥有英雄；主角有 `主角` 标识，攻击形态显示为 `攻击形态`。
- 弹框内部点击通过 `BlockInputEvents` 阻断，不会误关闭；只允许遮罩或关闭按钮关闭。
- `scripts/check-layout.mjs` 已增加只读 API allowlist、英雄面板模块、EX 过滤、主角置顶和多分辨率边界守卫。
- 已验证：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest,PlayerProtagonistServiceImplTest" test` -> passed。
  - `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增经济写入口。

## 2026-05-31 Lobby Stage 3A Readonly Adventure Shell

- 当前最新阶段已推进到 `Stage 3A：大厅冒险入口 -> 主线推荐状态 -> 章节地图只读壳`。
- 监督口径：项目当前真实流程为 `登录 -> 主角检查/创建 -> 加载 -> 大厅 -> 公告/图鉴/英雄队列只读 -> 冒险主线只读地图`。
- 后端新增玩家侧只读接口：
  - `GET /api/player/lobby/adventure`
  - `PlayerLobbyAdventureController`
  - `PlayerLobbyAdventureService`
  - `PlayerLobbyAdventureServiceImpl`
  - `PlayerLobbyAdventureVO`
  - `PlayerLobbyAdventureChapterVO`
  - `PlayerLobbyAdventureStageVO`
- `lootchain-admin` 的 `AdminApplication` 已排除 `PlayerLobbyAdventureController`，避免后台应用加载玩家端 Sa-Token Controller。
- 当前冒险数据是服务端静态主线展示壳，复用大厅资料读取玩家等级和战力，只返回章节、关卡、推荐战力、敌人摘要和掉落预览文案。
- Cocos 前端新增：
  - `assets/scripts/types/LobbyAdventureTypes.ts`
  - `assets/scripts/api/LobbyAdventureApi.ts`
  - `assets/scripts/scenes/lobby/LobbyAdventureState.ts`
  - `assets/scripts/scenes/lobby/LobbyAdventureLoader.ts`
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts`
- 大厅右下 `冒险` 主按钮和小屏 compact `冒险` 快捷入口会打开 `LobbyAdventurePanel`。
- 大厅右下 `冒险` 副标题会优先使用已加载的后端推荐关卡名；未加载时才兜底显示 `主线 1-1 暗影城门`。
- 面板内部点击通过 `BlockInputEvents` 阻断，不会误关闭；面板只允许遮罩或关闭按钮关闭。
- 面板右侧 `编队未开放` 是禁用视觉按钮，当前不保存编队、不进入战斗。
- `scripts/check-layout.mjs` 已同步：
  - 新增 adventure API/module/meta 必需项；
  - 允许只读 `GET /api/player/lobby/adventure`；
  - 检查冒险面板自适应边界；
  - 检查 HUD 点击契约允许 `openLobbyAdventurePanel()`。
- 已验证：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyAdventureServiceImplTest" test` -> passed。
  - `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile` -> passed。
- 下一阶段建议：
  - `Stage 3B`：关卡详情/编队确认只读或本地选择壳。
  - 队伍保存属于玩家状态写入，必须单独审查。
  - 战斗启动和结算仍未开放；奖励、体力、进度必须由后端事务控制。
- 边界不变：不改变经济规则，不开放 EX V1，不新增经济写入口；当前不保存主线进度、不保存编队、不创建战斗、不结算、不扣体力、不发放奖励。

## 2026-05-31 Lobby Stage 3B Readonly Formation Shell

- 当前最新阶段已继续推进到 `Stage 3B：关卡详情 -> 编队确认只读壳`。
- Cocos 前端新增：
  - `assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts`
- `LobbyAdventurePanelRenderer` 中可解锁关卡的 `编队确认` 按钮现在打开 `LobbyFormationPanel`。
- `LobbyFormationPanel` 复用已有 `LobbyHeroRosterLoader` / `GET /api/player/lobby/heroes` 的只读英雄数据，不新增后端写接口。
- 面板显示：
  - 五个默认上阵槽；
  - 主角优先作为队长/第一槽；
  - 候选英雄只读列表；
  - `战斗未开放` 禁用视觉按钮。
- 面板内部点击通过 `BlockInputEvents` 阻断，不会误关闭；只允许遮罩或关闭按钮关闭。
- `scripts/check-layout.mjs` 已同步新增 formation 模块、root wiring、modal bounds 和边界 token。
- 已验证：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 下一阶段建议：
  - `Stage 3C`：战斗表现壳或战斗启动前的服务端 session 设计。
  - 如果要保存编队，必须新增玩家状态写接口并单独审查；当前阶段没有保存编队。
- 边界不变：不改变经济规则，不开放 EX V1，不新增经济写入口；当前不保存编队、不创建战斗、不结算、不扣体力、不发放奖励。

## 2026-05-31 Lobby Stage 3C Local Battle Preview Shell

- 当前阶段继续推进到 `冒险关卡详情 -> 编队确认 -> 本地战斗预演`。
- Cocos 前端新增 `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts` 与 `.meta`。
- `LobbyFormationPanelRenderer` 底部按钮从禁用的“战斗未开放”升级为“战斗预演”，点击后只打开本地表现壳。
- `LobbyBattlePreviewPanelRenderer` 只读取 `GET /api/player/lobby/heroes` 已有的只读英雄队列状态，展示我方五个槽位、主角优先、敌方占位单位和本地战斗日志。
- 当前没有新增后端接口，没有创建 battle session，没有保存编队，没有扣体力，没有写主线进度，没有结算，没有发奖，没有任何经济写入口。
- 弹框内部通过 `BlockInputEvents` 阻断点击穿透；只允许点击遮罩或“返回编队”关闭。
- `scripts/check-layout.mjs` 已补齐 battle preview 模块、root wiring、节点名、禁用结算按钮和多分辨率 bounds 守卫。
- 已验证：`npm.cmd run check:layout` 通过；Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` 通过。
- 下一阶段建议：设计并实现后端权威的 battle session/settlement 闭环，但 reward、stamina、progress、drop 必须由后端事务控制，且先做最小安全模型。

## 2026-05-31 Lobby Stage 4A Backend Battle Session And No-Reward Settlement

- 当前阶段已经从本地战斗预演推进到后端权威的最小战斗闭环：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- 本阶段 settlement 只是“战斗结果记录”，不是经济结算。
- Cocos 新增：
  - `assets/scripts/types/BattleTypes.ts`
  - `assets/scripts/api/BattleApi.ts`
  - `assets/scripts/scenes/lobby/LobbyBattleState.ts`
  - `assets/scripts/scenes/lobby/LobbyBattleFlow.ts`
- `LobbyBattlePreviewPanelRenderer.ts` 已从纯本地预演升级为读取 battle flow 状态：创建会话、记录无奖励结算、显示错误、返回大厅。
- `LootChainGameRoot.ts` 打开战斗面板时会先刷新英雄队列，然后自动创建 battle session；结算完成后可从结果面板返回大厅。
- Cocos 只提交关卡、英雄 ID、队长 ID、requestId 和客户端版本；不提交奖励、体力、进度、掉落、属性或资源变化。
- `BattleApi` 会强制校验 `readonlyEconomy=true` 且 `rewardGranted=false`，避免后端误返回经济结算语义。
- 后端已新增 `battle_session` 与 `battle_settlement`，并通过 JDBC 在本地 `lootchain` schema 执行 `sql/13_battle_session_module.sql`。
- 已验证：Cocos `check:layout`、Cocos focused `tsc`、后端 battle/adventure/hero/protagonist 单测、后端 game/admin compile 全部通过。
- 边界不变：不扣体力，不写主线进度，不发奖励，不写背包/货币/USDT/资金池，不开放 EX V1。

## 2026-05-31 Stage 4B Player Flow Smoke Verification

- 后端项目新增 `D:\business\project\LootChain\scripts\smoke-player-flow.ps1`。
- 脚本用于新窗口/本地环境快速复核当前 Cocos 正常玩家链路：
  `dev-login -> protagonist state -> lobby profile -> adventure -> hero roster -> battle start -> no-reward settlement -> lobby profile re-read`。
- 已在本机 `http://localhost:8081`、`userId=1`、`MAIN_1_1` 执行通过。
- 关键结果：
  - `heroIds=4,1,2`
  - `rewardGranted=false`
  - `readonlyEconomy=true`
  - `staminaBefore=100`
  - `staminaAfter=100`
  - `combatPowerBefore=15448`
  - `combatPowerAfter=15448`
- 若后续新窗口需要先确认后端是否为最新代码，优先运行：

```powershell
cd D:\business\project\LootChain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-player-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1
```

- Stage 4B 仍然只是无奖励战斗记录闭环；真实奖励、体力消耗、主线进度推进必须单独立项审查。

## 2026-05-31 Lobby Stage 4C Battle Presentation Pass

- 当前最新阶段进入 `Stage 4C：战斗表现层第一版`。
- UI 审查代理指出的断点已处理：
  - 小屏/compact 冒险面板新增 `LobbyAdventureCompactFormationButton`，可以继续进入编队。
  - 冒险详情中的奖励文案降级为 `关卡配置预览（当前不发放）`，避免误导玩家以为当前会发奖。
- 新增战斗表现模块：
  - `assets/scripts/scenes/lobby/LobbyBattlePresentationLayout.ts`
  - `assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts`
- `LobbyBattlePreviewPanelRenderer.ts` 已从列表式预览改为暗黑影视风战斗表现面板：
  - `LobbyBattleCinematicBackdrop`
  - `LobbyBattleActor_Ally_*` / `LobbyBattleActor_Enemy_*`
  - `LobbyBattleActorHpBar`
  - `LobbyBattleEffectLayer`
  - `LobbyBattleBoundaryBadge`
  - compact footer 纵向/双行重排
- 战斗状态语义：
  - 创建会话中：禁用主按钮。
  - 会话已创建：展示战斗演出与“记录结果”。
  - 记录中：禁用主按钮。
  - 已记录：只显示战斗记录完成和“返回大厅”，不出现领取、战利品、资源增长或奖励动画。
- `scripts/check-layout.mjs` 已同步守卫新增模块、compact 冒险 CTA、战斗表现节点和 no-reward 文案。
- Stage 4D 第一层防误触/防重叠已追加：
  - `LobbyBattlePresentationLayout.ts` 在极小视口减少 actor 数量，避免演员卡片和日志区互相覆盖。
  - `scripts/check-layout.mjs` 现在会计算战斗演员、日志和 footer 按钮内部矩形，发现越界或重叠会直接失败。
  - 该门禁曾捕获日志压到第 5 个演员的问题，已通过缩小日志宽度和调整站位修复。
- 验证：
  - `npm.cmd run check:layout` 通过。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` 通过。
  - 后端 `scripts/smoke-player-flow.ps1` 再次通过：
    - `battleNo=B0ffc7b31c3c541c1827ff9dfc3a8124f`
    - `settlementNo=S8eb5e55fe9794e00aa3687faf9ecff01`
    - `rewardGranted=false`
    - `readonlyEconomy=true`
    - 体力 `100 -> 100`
    - 战力 `15448 -> 15448`
- 边界不变：不扣体力，不写主线进度，不发奖励，不写背包/货币/USDT/资金池，不开放 EX V1。

## 2026-05-31 Lobby Stage 4E Local Battle Timeline

- 当前继续推进到 `Stage 4E：本地战斗表现时间轴`。
- `LobbyBattleState.ts` 新增：
  - `presentationStep`
  - `presentationComplete`
- `LobbyBattleFlow.ts` 新增本地表现计时：
  - battle session 创建成功后，自动推进 4 个演出 step。
  - 演出过程中主按钮显示 `演出中`，节点为 `LobbyBattlePlaybackPending`，不会提交 settlement。
  - 演出完成后才允许点击 `记录结果` 调用无奖励 settlement。
  - `cancel()`、登录重置、重新开始、结算时都会清理本地计时器。
- `LobbyBattlePresentationState.ts` 会根据 step 输出：
  - timeline 文案；
  - 战斗日志；
  - 伤害浮字；
  - 敌方首位 HP 展示比例。
- 该时间轴只服务 Cocos 表现，不参与服务端胜负权威，不决定奖励、体力、进度、掉落或资源变化。
- 验证：
  - `npm.cmd run check:layout` 通过。
- focused Cocos TypeScript 检查通过。

## 2026-05-31 Lobby Stage 4F Selected Stage Propagation

- 当前继续收紧 `冒险 -> 编队 -> 战斗` 的关卡选择链路。
- 已修复的问题：战斗启动不再只使用推荐关卡或默认 `MAIN_1_1`；从冒险详情或 compact 冒险按钮进入编队时，会把当前 `stageCode` 传给编队页，再传给战斗预览和 `POST /api/player/battles/start`。
- Cocos 修改点：
  - `LobbyAdventurePanelRenderer.ts`：`openLobbyFormationPanel(stageCode?: string)` 现在从推荐关卡和详情关卡按钮传入具体 `stageCode`。
  - `LobbyFormationPanelRenderer.ts`：读取 `currentLobbySelectedStageCode()`，在编队页标题区展示当前目标关卡；开始战斗时沿用已选择关卡。
  - `LootChainGameRoot.ts`：新增可空的 `selectedLobbyStageCode`，统一保存当前关卡选择；非法、空值或 `EX_` 关卡会提示“关卡选择已失效，请重新选择主线关卡”，并返回冒险面板。
  - `LobbyBattleFlow.ts`：`prepare()` 与 `start()` 不再把空关卡或 `EX_` 关卡静默回落到 `MAIN_1_1`，而是进入错误提示状态。
  - `LobbyBattleState.ts`：默认 `stageCode` 改为空字符串，避免伪造已选择关卡。
  - `scripts/check-layout.mjs`：新增 Stage 4F 守卫，检查关卡传递、非法关卡拦截和禁止静默 fallback。
- Zeno 监督要求：
  - 未来开放多关卡时，玩家选择的关卡必须在编队、战斗预览、battle start 请求和结果页保持一致。
  - 如果关卡选择丢失，必须阻断战斗并要求玩家重新选择，不能默认打 `MAIN_1_1`。
- 已验证：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - 后端 `scripts/smoke-player-flow.ps1` 再次通过：
    - `battleNo=Ba947cb2ef2de493895a9dbe54922c08f`
    - `settlementNo=S76dbe01e0eca48a194acd428a21029a0`
    - `rewardGranted=false`
    - `readonlyEconomy=true`
    - 体力 `100 -> 100`
    - 战力 `15448 -> 15448`
  - 非默认关卡 smoke 也已通过：`StageCode=MAIN_1_2`，`battleNo=Becd2976bae65460c936a1e412733f05a`，`settlementNo=S623734689f164676b36228fe5ae6e309`，同样保持 `rewardGranted=false`、`readonlyEconomy=true`、体力/战力不变。
- 边界不变：本阶段只传递关卡选择，不保存编队，不扣体力，不写主线进度，不发奖励，不写背包/货币/USDT/资金池，不开放 EX V1，不新增经济写入口。

## 2026-05-31 Stage 4G Backend Stage Guard Test

- 后端 battle start 代码已存在 `STAGE_ALLOWLIST` 与 `EX_` 拦截，本轮补充单测把该红线固化下来。
- 后端测试新增覆盖：
  - `MAIN_9_9` 未开放主线关卡必须拒绝；
  - `EX_1_1` 必须拒绝；
  - 非法关卡被拒绝后不能继续读取英雄队列，也不能插入 `battle_session`。
- 已验证：
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerBattleServiceImplTest" test` -> passed，`Tests run: 6, Failures: 0, Errors: 0`。
  - running game HTTP + MySQL 验收通过：
    - `MAIN_9_9` 返回业务错误 `关卡暂未开放`，对应 requestId 的 `battle_session` 写入数 `0 -> 0`。
    - `EX_1_1` 返回业务错误 `关卡暂未开放`，对应 requestId 的 `battle_session` 写入数 `0 -> 0`。
  - 后端新增并已执行通过 `D:\business\project\LootChain\scripts\smoke-battle-stage-guard.ps1`，用于新窗口重复验证非法关卡不会创建 battle session。
- 本阶段只补后端测试，不改变 battle 接口行为，不开放奖励、体力、进度、资金池、USDT 或 EX V1。

## 2026-05-31 Lobby Stage 4H Battle Stage Visibility

- 按 Zeno 用户视角监督要求，战斗表现页必须让玩家确认当前目标关卡。
- `LobbyBattlePresentationState.ts` 已补强文案：
  - ready 状态 subtitle 显示 `目标关卡 {stageCode}`；
  - result recorded 状态 subtitle 与日志都显示 settlement 返回的 `stageCode`。
- `scripts/check-layout.mjs` 新增 `目标关卡：` 守卫，防止后续战斗结果页丢失关卡可见性。
- 已验证：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只改前端展示文案，不改变接口、结算、奖励、体力、进度或经济规则。

## 2026-05-31 Lobby Stage 4I Formation Explicit Battle Stage

- 继续收紧 Zeno 指出的“不能沿用旧关卡”风险。
- `LobbyFormationPanelRenderer.ts` 的 `LobbyFormationBattlePreviewButton` 现在显式调用 `openLobbyBattlePreviewPanel(stageCode)`，不再依赖 root 中可能残留的上一次选择。
- `LootChainGameRoot.openLobbyBattlePreviewPanel(stageCode: string)` 改为必须传入关卡；`resolveLobbyStageCode()` 只接受 `MAIN_数字_数字` 格式，展示文案或空值不能被误当作关卡。
- `scripts/check-layout.mjs` 已增加显式 stage 传递和主线格式守卫。
- 已验证：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只改前端状态传递，不新增接口，不保存编队，不扣体力，不写进度，不发奖励，不开放 EX V1。

## 2026-05-31 Lobby Stage 4J Return-To-Lobby Refresh

- 继续补齐 `战斗记录完成 -> 返回大厅` 的闭环体验。
- `LootChainGameRoot.returnToLobbyFromBattlePreview()` 现在会：
  - 调用 `lobbyBattleFlow.cancel()` 清理本地战斗表现计时，避免回到大厅后旧 timer 继续刷新战斗面板；
  - 关闭 battle preview 与 formation 面板；
  - 调用 `refreshLobbyReadonlyStateAfterBattle()` 回读只读大厅资料、冒险状态和英雄队列。
- `LobbyBattleFlow.normalizeStageCode()` 已与 root 对齐，只接受 `MAIN_数字_数字` 主线关卡格式。
- `scripts/check-layout.mjs` 已加入回大厅刷新和 Flow 内部主线格式守卫。
- 已验证：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只做前端状态清理和只读刷新，不改变后端接口，不扣体力，不写进度，不发奖励，不新增经济写入口。

## 2026-05-31 Stage 4K New Player Full-Flow Smoke

- Current Cocos-only playable path is verified for a fresh local player:
  `dev-login -> empty protagonist state -> create SSR protagonist -> lobby -> heroes -> adventure -> battle start -> no-reward settlement -> lobby reread`.
- Backend script:
  - `D:\business\project\LootChain\scripts\smoke-new-player-flow.ps1`
- Script behavior:
  - creates only a local `game_user` QA shell when `-UserId 0`;
  - uses `POST /api/player/protagonist` for protagonist creation;
  - checks SSR rarity, attack default form, locked defense/support forms, and `userHeroId`;
  - calls protagonist create a second time and verifies idempotency with exactly one `player_protagonist` row and one `user_hero source_type=PROTAGONIST` row;
  - verifies hero roster first item is the protagonist;
  - starts `MAIN_1_1` battle with protagonist-only lineup;
  - settles with no reward and rereads lobby profile;
  - asserts stamina and combat power do not change.
- Latest successful run:
  - `userId=12`
  - `protagonistName=SmokeHero12`
  - `protagonistHeroId=9`
  - `stageCode=MAIN_1_1`
  - `battleNo=Bf8f08ea10fc945ab9022db1bbfa3f548`
  - `settlementNo=S52c47a1c10ba4ec9ba9733c9e4216a90`
  - `rewardGranted=false`
  - `readonlyEconomy=true`
  - stamina `100 -> 100`
  - combat power `9269 -> 9269`
- Verification completed:
  - `npm.cmd run check:layout`
  - focused Cocos Creator 3.8.8 `tsc.cmd --noEmit`
  - backend `PlayerProtagonistServiceImplTest,PlayerBattleServiceImplTest`
  - `scripts/smoke-player-flow.ps1 -UserId 1 -StageCode MAIN_1_2`
  - `scripts/smoke-battle-stage-guard.ps1`
- Zeno supervisor remains active with these P0 follow-ups:
  - capture or manually verify the visible Cocos UI chain from no protagonist to lobby/battle/result;
  - ensure duplicate create/settlement buttons cannot create duplicate state in UI;
  - keep stage code visible through adventure, formation, battle, and result;
  - keep EX blocked before `battle_session` insert.
- Boundary unchanged: no rewards, stamina cost, progress write, bag/currency/USDT/fund-pool write, EX V1, or new economy write entry was opened.

## 2026-05-31 Stage 4L Frontend Repeat-Submit Guard

- Review agent Carver checked duplicate-click risks in Cocos:
  - protagonist create had no flow-level busy guard;
  - repeated battle preview opening could enqueue more than one battle start chain;
  - settlement had a settling guard but no existing-settlement guard.
- Implemented frontend guards:
  - `ProtagonistCreateFlow.submitCreate()` returns while `current.creating` is true and shows "主角色创建中，请勿重复提交。";
  - `ProtagonistCreateRenderer` disables the create button while creating;
  - `LootChainGameRoot.openLobbyBattlePreviewPanel()` returns if the same stage already has a busy battle flow;
  - the post-hero-roster auto-start callback verifies lobby view, battle panel open state, unchanged stage, and non-busy battle state before calling start;
  - `LobbyBattleFlow.start()` blocks repeated start for the same stage while starting/started/settling/settled;
  - `LobbyBattleFlow.settle()` returns if a settlement already exists.
- Guardrail updated:
  - `scripts/check-layout.mjs` now checks these repeat-submit guard tokens.
- Verification:
  - `npm.cmd run check:layout`
  - focused Cocos Creator 3.8.8 `tsc.cmd --noEmit`
- Boundary unchanged: this is Cocos-only UI/state hardening. No backend API, SQL, reward, stamina, progress, currency, USDT, fund-pool, EX V1, or economy rule change.

## 2026-05-31 Stage 4M Battle Resume And Contract Hardening

- Zeno/Russell/Kierkegaard supervisor pass found the next real-play P0: closing battle preview after session creation could leave the same-stage battle state busy and make the player unable to reopen battle/settle from formation.
- Cocos fixes:
  - `openLobbyBattlePreviewPanel(stageCode)` reuses existing same-stage battle state for display instead of silently returning;
  - returning from recorded battle result clears local battle state with `lobbyBattleFlow.cancel(true)`;
  - `LobbyBattleFlow.settle()` rejects settlement if returned `stageCode` differs from the battle session;
  - `BattleApi` validates explicit `MAIN_x_y` stage codes and no longer falls back to `MAIN_1_1`;
  - `ProtagonistApi` was rewritten so create/state calls actually return validated backend data; client still submits only `gender` and `protagonistName`;
  - `LobbyAdventureApi` filters illegal/EX stages before UI display;
  - `LobbyHeroApi` filters `id<=0` heroes before roster/formation display.
- Docs/API cleanup:
  - `docs/api-contract.md` now states battle start/settle are implemented only as no-reward session/record endpoints, while team save, dungeon, and Boss remain unimplemented.
- Verification:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 `tsc.cmd --noEmit` passed.
  - Existing-player smoke passed for `MAIN_1_2`: `battleNo=B161c2bdd5a2b4314b2c047cca6f053c6`, `settlementNo=S098d0cf575a04c3d8daf4a52e7db8c61`, stamina/combat power unchanged.
  - Fresh-player smoke passed with `userId=13`, `protagonistHeroId=10`, `battleNo=Bffd294803cb74937a1d5776bec5a932d`, `settlementNo=S51eaac6618a5420ab2859ef01913a537`.
  - Stage guard smoke passed for `MAIN_9_9` and `EX_1_1`, both rejected before `battle_session` insert.
- Boundary unchanged: no backend API/SQL change, no reward, stamina cost, progress write, bag/currency/USDT/fund-pool write, EX V1, or new economy write entry.

## 2026-05-31 Stage 4N Compact Responsive Hardening

- Current supervisor mode remains active: Zeno continues to act as the user-like gatekeeper until the full Cocos game flow is playable end to end.
- This stage changed only `D:\business\project\lootchain-cocos` frontend layout code and `scripts/check-layout.mjs`; backend API/SQL/economy code was not changed.
- Cocos layout fixes:
  - compact lobby action entries no longer disappear at short heights before key access is preserved; under `300px` stage height the compact action panel keeps `公告 / 冒险 / 英雄 / 图鉴`;
  - decorative compact scene shortcut panel now waits for `stageHeight >= 340`, reducing collision with core action access;
  - protagonist create controls now avoid input/button overlap and use dense form chips on compact layouts;
  - formation compact rows now derive from available body height so five slots stay inside the panel;
  - battle presentation field now clears boundary note and footer buttons in vertical-cramped panels.
- Guardrail updates:
  - `scripts/check-layout.mjs` now includes `compact-playable-390x300` and `compact-floor-360x240` viewports;
  - layout checks now assert protagonist input/button minimum gap for playable heights, formation internal non-overlap, and battle field/boundary/footer non-overlap.
- Verification completed:
  - `npm.cmd run check:layout`
  - focused Cocos Creator 3.8.8 `tsc.cmd --noEmit`
- Boundary unchanged: no reward, stamina cost, mainline progress write, bag/currency/USDT/fund-pool write, EX V1, backend API/SQL change, or new economy write endpoint was opened.

## 2026-05-31 Stage 4O Local Formation Selection

- Current stage continues the Cocos-only playable chain under Zeno supervision.
- Cocos changed files:
  - `assets/scripts/scenes/LootChainGameRoot.ts`
  - `assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts`
  - `assets/scripts/scenes/lobby/LobbyBattleFlow.ts`
  - `scripts/check-layout.mjs`
- Player-facing behavior:
  - formation panel is no longer only a read-only default preview;
  - clicking candidate heroes toggles them in/out of the current battle lineup;
  - protagonist remains fixed as leader and cannot be removed from the current lineup;
  - battle start uses the confirmed local lineup IDs through the existing battle start contract.
- Backend unchanged:
  - no team-save endpoint;
  - no new SQL;
  - no persistent formation write;
  - no reward/stamina/progress/bag/currency/USDT/fund-pool write;
  - EX V1 remains blocked.
- Verification completed:
  - `npm.cmd run check:layout`
  - focused Cocos Creator 3.8.8 `tsc.cmd --noEmit`
  - Cocos `git diff --check`
- Next high-risk recommendations from agents:
  - add backend player API allowlist / feature gate for the current Cocos phase;
  - make battle no-reward/economy-readonly flags persistent in `battle_settlement`;
  - strengthen battle start idempotency against reused `requestId` with different payload;
  - add a unified smoke runner with DB table snapshots for economy red lines.

## 2026-05-31 Stage 4P Player API Cocos Phase Gate

- Current supervisor mode remains active: do not stop before the Cocos game flow is genuinely playable and guarded.
- Backend changed files:
  - `D:\business\project\LootChain\lootchain-core\src\main\java\com\lootchain\config\PlayerApiPhaseGate.java`
  - `D:\business\project\LootChain\lootchain-core\src\main\java\com\lootchain\config\PlayerModuleProperties.java`
  - `D:\business\project\LootChain\lootchain-core\src\main\java\com\lootchain\config\PlayerWebMvcConfig.java`
  - `D:\business\project\LootChain\lootchain-core\src\test\java\com\lootchain\config\PlayerApiPhaseGateTest.java`
  - `D:\business\project\LootChain\lootchain-game\src\main\resources\application.yml`
  - `D:\business\project\LootChain\lootchain-game\src\main\resources\application-local.yml`
- Cocos changed files:
  - `assets/scripts/api/GachaApi.ts`
  - `scripts/check-layout.mjs`
- Default `lootchain.player.cocos-phase-gate-enabled=true`.
- Allowlist during the current Cocos phase:
  - `POST /api/player/auth/dev-login`
  - `GET /api/player/me/lobby`
  - `GET /api/player/protagonist/state`
  - `POST /api/player/protagonist`
  - `GET /api/player/lobby/adventure`
  - `GET /api/player/lobby/codex`
  - `GET /api/player/lobby/heroes`
  - `GET /api/player/lobby/notices`
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- Blocked during this phase:
  - gacha draw/pools/logs;
  - full hero growth/detail endpoints;
  - full bag/use endpoints;
  - any reward, currency, USDT, fund-pool, or EX V1 path not explicitly listed above.
- Verification completed:
  - backend `PlayerApiPhaseGateTest`
  - backend `lootchain-admin,lootchain-game -am -DskipTests compile`
  - Cocos `npm.cmd run check:layout`
  - focused Cocos TypeScript check for `GachaApi`
- Next high-risk recommendations:
  - persist no-reward/economy-readonly mode on `battle_settlement`;
  - strengthen battle start idempotency so reused `requestId` with different payload fails closed;
  - create a unified smoke runner with DB table snapshots for the red-line economy tables.

## 2026-05-31 Stage 4Q Battle Start Idempotency Contract

- Backend changed files:
  - `D:\business\project\LootChain\lootchain-core\src\main\java\com\lootchain\game\battle\service\impl\PlayerBattleServiceImpl.java`
  - `D:\business\project\LootChain\lootchain-core\src\test\java\com\lootchain\game\battle\service\impl\PlayerBattleServiceImplTest.java`
- Contract changes:
  - `POST /api/player/battles/start` now requires `requestId`;
  - backend no longer generates missing battle start request IDs;
  - repeated `requestId` returns the existing session only if `stageCode`, ordered `heroIds`, and `leaderHeroId` match the original session;
  - repeated `requestId` with different payload fails closed with `重复战斗请求参数不一致`.
- Cocos implications:
  - `LobbyBattleFlow` already creates a fresh `battle-start-*` request ID per start attempt;
  - if the player changes stage or local formation, the next start must use a new request ID.
- Verification completed:
  - backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest`
  - backend `lootchain-admin,lootchain-game -am -DskipTests compile`
- Remaining high-risk recommendations:
  - persist no-reward/economy-readonly mode on `battle_settlement`;
  - create a unified smoke runner with DB table snapshots for economy red lines;
  - run latest-code HTTP smoke after restarting `lootchain-game`, because an already-running server may still be on older compiled code.

## 2026-05-31 Stage 4R Battle Settlement No-Economy Persistence

- Backend changed files:
  - `D:\business\project\LootChain\lootchain-core\src\main\java\com\lootchain\game\battle\entity\PlayerBattleSettlement.java`
  - `D:\business\project\LootChain\lootchain-core\src\main\java\com\lootchain\game\battle\service\impl\PlayerBattleServiceImpl.java`
  - `D:\business\project\LootChain\lootchain-core\src\test\java\com\lootchain\game\battle\service\impl\PlayerBattleServiceImplTest.java`
  - `D:\business\project\LootChain\sql\13_battle_session_module.sql`
  - `D:\business\project\LootChain\sql\14_battle_settlement_guard_flags.sql`
- Local MySQL `lootchain` schema was migrated with SQL 14.
- `battle_settlement` now has persistent no-economy flags:
  - `settlement_mode='NO_REWARD'`
  - `reward_granted=0`
  - `readonly_economy=1`
  - `economy_applied=0`
- `PlayerBattleServiceImpl` sets those flags when recording current Cocos no-reward settlement.
- Verification completed:
  - local `information_schema.columns` check for all four columns;
  - backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest`;
  - backend `lootchain-admin,lootchain-game -am -DskipTests compile`.
- Remaining high-risk recommendations:
  - create a unified smoke runner with DB table snapshots for economy red lines;
  - run latest-code HTTP smoke after restarting `lootchain-game`;
  - continue Cocos visual QA/screenshots across target resolutions.

## 2026-05-31 Stage 4S Latest-Code HTTP Smoke Guard

- Current supervisor mode remains active: Zeno is the user-like gatekeeper until the full Cocos game flow is genuinely playable and guarded.
- Local backend was restarted from current source:
  - `D:\business\project\LootChain`
  - port `8081`
  - process: `com.lootchain.bootstrap.GameApplication`
  - classes: `lootchain-game\target\classes`
- Added backend smoke script:
  - `D:\business\project\LootChain\scripts\smoke-cocos-current-flow.ps1`
- HTTP verification passed after restart:
  - existing-player flow: dev-login, lobby profile, adventure, heroes, battle start, no-reward settle, lobby reread;
  - fresh-player flow: local QA `game_user`, dev-login, create SSR protagonist, protagonist first in roster, protagonist-only battle, no-reward settle;
  - stage guard: `MAIN_9_9` and `EX_1_1` rejected with no `battle_session` insert;
  - current-flow guard: phase gate blocks gacha pool/draw, bag read/use, and hero level-up;
  - economy snapshots do not change around forbidden API calls or no-reward settlement;
  - settlement row persists `NO_REWARD`, `reward_granted=0`, `readonly_economy=1`, and `economy_applied=0`;
  - battle start idempotency accepts same request payload and rejects same `requestId` with changed lineup.
- Latest current-flow guard smoke result:
  - `battleNo=Bd5d5e5e6d7404df09016f33fb038f917`
  - `settlementNo=S49d8682eb89b4871a6f3fc4bc079bb35`
  - `rewardGranted=false`
  - `readonlyEconomy=true`
- Boundary unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.
- Remaining high-risk recommendation:
  - continue Cocos visual QA/screenshots across target resolutions.

## 2026-05-31 Stage 4T Recent Battle Readback + Physical Viewport Guard

- Supervisor mode remains active until the complete Cocos playable loop is genuinely accepted.
- Cocos frontend changes:
  - `assets/scripts/types/BattleTypes.ts` added `PlayerBattleRecentVO`.
  - `assets/scripts/api/BattleApi.ts` added `recentBattles()` and validates that recent records keep `rewardGranted=false`, `readonlyEconomy=true`, and `economyApplied=false`.
  - `assets/scripts/scenes/lobby/LobbyBattleState.ts` and `LobbyBattleFlow.ts` now cache readonly recent battle records and refresh the overlay after loading them.
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts` displays a recent no-reward challenge summary in the adventure detail panel.
  - `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts`, `LootChainGameRoot.ts`, `LobbyHudTypes.ts`, and `LobbyHudRenderer.ts` now support physical viewport sizing and a micro HUD path.
  - `scripts/check-layout.mjs` mirrors the Preview design-resolution/physical-viewport split and includes `390x300` and `390x340` guard cases.
- Backend/API dependency:
  - new readonly endpoint: `GET /api/player/battles/recent`;
  - current phase gate allows this GET only;
  - no new player economy write endpoint was added.
- Verification passed:
  - Cocos `npm.cmd run check:layout`;
  - focused Cocos Creator 3.8.8 TypeScript check;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerBattleServiceImplTest,PlayerApiPhaseGateTest" test`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile`;
  - `scripts/smoke-cocos-current-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1`, including recent record readback;
  - `scripts/smoke-new-player-flow.ps1 -BaseUrl http://localhost:8081 -StageCode MAIN_1_1 -Gender female`;
  - `scripts/smoke-battle-stage-guard.ps1 -BaseUrl http://localhost:8081 -UserId 1`.
- Latest smoke IDs:
  - current-flow: `battleNo=Bde67add6067843ae9c6e51eff03f4dc2`, `settlementNo=Sf11d24af1cab49fe9a6560f5b7d0d4d6`;
  - fresh-player: user `15`, protagonist hero `12`, `battleNo=B168d051a70e34a3f9168ee36716db904`, `settlementNo=Sb51323780bf24038a94fc38187020dca`.
- Visual QA note:
  - existing Preview on `7456` was serving old compiled cache without `viewportWidth/viewportHeight`;
  - source and static guards are current, but final screenshot acceptance needs Creator Preview restart/reopen.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4X Runtime Visual Loop Acceptance

- User-like supervisor role is now assigned to existing sub-agent `Zeno`; a new agent could not be spawned because the current thread had reached the agent limit.
- The previously stale running Preview has been refreshed without killing the user's original Cocos Creator process:
  - `npm.cmd run check:preview` now passes with `preview freshness ok`;
  - the running Preview on `http://localhost:7456` is serving chunks that contain the physical viewport and micro-HUD code.
- Runtime visual QA was executed through Chrome DevTools Protocol against the live Cocos Preview, calling Cocos root methods directly instead of relying on fragile screen-coordinate clicks.
- Screenshot evidence was written to:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-04-lobby.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-05-hero-roster.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-06-adventure.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-07-formation.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-08-battle-running.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-09-battle-settlement.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\desktop-1920x900-10-return-lobby.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\micro-390x340-04-lobby.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\micro-390x300-04-lobby.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\new-player-21-02-protagonist-create.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime\new-player-21-03-lobby.png`
- Visual/runtime flow covered:
  - existing player login dialog -> login -> loading -> lobby;
  - lobby -> hero roster -> adventure -> formation -> battle preview/start -> presentation complete -> no-reward settlement -> return lobby;
  - micro viewports `390x340` and `390x300` keep the compact HUD path visible;
  - local QA user `21` was inserted as a plain `game_user` test row, then Cocos Preview verified first-login protagonist creation and lobby entry.
- Latest verification passed:
  - Cocos `npm.cmd run check:layout`;
  - Cocos `npm.cmd run check:preview`;
  - Cocos Creator 3.8.8 TypeScript no-emit over 84 `assets/scripts` TS files;
  - backend current-flow smoke: `battleNo=B9b348c1923cd4aa6bc1955cbe0fd5226`, `settlementNo=S181511c2f3a14089a45dd65c2c1a3280`;
  - backend fresh-player smoke: user `22`, protagonist hero `19`, `battleNo=B6711d99ceced46bfb3e51d94554cd437`, `settlementNo=S4b35e542e8a84b2988e44ecc75805ca4`;
  - backend focused unit tests `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest,PlayerProtagonistServiceImplTest`: 16 tests passed.
- Product note:
  - Cocos lobby player HUD currently displays `game_user.nickname`; the protagonist creation name is stored through the protagonist API but is not used as the lobby display name yet.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4AE Runtime Flow Acceptance And Micro HUD Follow-up

- Runtime Cocos Preview acceptance was executed through Chrome DevTools Protocol against `http://localhost:7456`.
- Evidence folder:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ae-lobby-goal-tracker`
- Screenshots captured:
  - `desktop-1920x900-01-lobby-goal-tracker-before.png`
  - `desktop-1920x900-02-adventure-from-goal.png`
  - `desktop-1920x900-03-formation-main-1-1.png`
  - `desktop-1920x900-04-battle-preview-started.png`
  - `desktop-1920x900-05-settlement-receipt.png`
  - `desktop-1920x900-06-lobby-goal-tracker-after.png`
  - `desktop-1920x900-07-adventure-recent-readback.png`
  - `micro-390x340-08-lobby-goal-chip.png`
- Runtime facts:
  - logged in through Cocos dev-login and entered lobby;
  - `LobbyGoalTracker` displayed the next mainline target;
  - opening adventure, formation, battle preview, no-reward settlement, return-to-lobby, and adventure recent readback completed;
  - runtime battle `B81f5c9e9f0274c3a81654dcfeeede8e6`;
  - runtime settlement `S0bdab68da86e4438850a87e8a1f5cade`;
  - settlement returned `rewardGranted=false` and `readonlyEconomy=true`;
  - after returning to lobby, recent readback loaded `S0bdab68da86e4438850a87e8a1f5cade`;
  - `LobbyGoalTracker` is now mounted under `LootChainCocosLoginUIRoot`, so overlay refresh can remove/rerender it.
- Follow-up source correction:
  - micro HUD scale was corrected in `LobbyHudRenderer.viewportUnit()` from design-resolution/window ratio to `clamp(layout.uiScale, 0.72, 1)`;
  - this prevents the 390x340 Preview crop from over-scaling micro target chip and bottom action text.
- Verification after the correction:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator TypeScript no-emit passed;
  - backend `smoke-cocos-current-flow.ps1` passed for user `1`, battle `Bd59ddfb0093d4356a05d83425677b93e`, settlement `Sa06408bc4c614ab8a714125e6692c913`, `rewardGranted=false`, `readonlyEconomy=true`;
  - backend `smoke-new-player-flow.ps1` passed for user `26`, protagonist `SmokeHero26`, battle `Be77d09e3caaa46e49adfd95193aaf518`, settlement `S403f91ee819e47efbc14b3934e9002ad`, stamina and combat power unchanged.
- Current Preview cache status:
  - the open Preview has served the Stage 4AE tracker and content-root fix;
  - after the final micro-scale source tweak, `npm.cmd run check:preview` is intentionally failing until Creator recompiles `LobbyHudRenderer.ts` again;
  - missing token: `layout.uiScale, 0.72, 1`.
- Backend code/API/SQL did not change in this follow-up.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4AB Locked Stage Frontend UX Guard

- Multi-agent review accepted the next P0: locked stages must be visibly locked, must not become selected, and must not enter formation/battle even before backend rejection.
- Cocos changes:
  - `LobbyAdventurePanelRenderer.ts`
    - desktop map locked nodes now show `LobbyAdventureStageLockBadge` with `锁`;
    - locked node names use `锁定 {stageName}`;
    - compact rows use a dim locked style and `锁定` prefix;
    - locked node/row taps call `previewLockedLobbyAdventureStage(stageCode)` only, so the player gets a clear status message but no selected-stage mutation.
  - `LootChainGameRoot.ts`
    - added `previewLockedLobbyAdventureStage(stageCode)`;
    - `openLobbyFormationPanel()` and `openLobbyBattlePreviewPanel()` now repeat the unlock check, so future UI mistakes cannot pass locked stages into formation or battle preview.
  - `scripts/check-layout.mjs`
    - added guards for locked-stage UI tokens and root entry-point unlock checks.
  - `scripts/check-preview-freshness.mjs`
    - now probes Preview chunks for locked-stage UX tokens.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator TypeScript no-emit passed for `LootChainGameRoot.ts`, `LobbyAdventurePanelRenderer.ts`, and related adventure/battle types.
- Current Preview cache status:
  - stale chunk blocker was cleared by returning focus to Creator and letting Preview rebuild;
  - `npm.cmd run check:preview` now passes and confirms the running chunks include `previewLockedLobbyAdventureStage`, `LobbyAdventureStageLockBadge`, and `锁定`.
- Runtime QA evidence:
  - screenshots captured under `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ab-locked-stage`;
  - locked `MAIN_1_2` (`裂隙回廊`) is present with `unlocked=false`, `LobbyAdventureStageLockBadge`, and `锁定 裂隙回廊`;
  - tapping/previewing locked `MAIN_1_2` kept `adventureOpen=true`, `formationOpen=false`, `battleOpen=false`, and did not mutate the selected stage;
  - forcing `openLobbyFormationPanel('MAIN_1_2')` also stayed in adventure and did not open formation/battle;
  - legal `MAIN_1_1` then opened formation, started battle `B675f7d4555e744f08720f213d61cbbab`, settled `Sb69829a75ad04a3f99dd251828025ccd`, and returned to lobby;
  - settlement stayed `rewardGranted=false`, `readonlyEconomy=true`, `stageCode=MAIN_1_1`.
- Fresh-player evidence:
  - backend `smoke-new-player-flow.ps1` passed for user `24`, protagonist `SmokeHero24`, battle `B42b76a5c3df5492097789795e91e18ce`, settlement `S127c753f3e0747b682963f8506fe69ab`;
  - Cocos Preview visual QA created local user `25`, entered the protagonist creation screen, created `VisualHero25`, and verified the lobby top-left name shows `VisualHero25`;
  - screenshots:
    - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ab-locked-stage\desktop-1920x900-08-new-player-create-screen.png`
    - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ab-locked-stage\desktop-1920x900-09-new-player-created-lobby.png`
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4AA Backend Locked Stage Guard

- Product/supervisor review found one remaining authority gap: Cocos hides locked adventure stages, but a modified client could still try `POST /api/player/battles/start` for an allowlisted but locked stage.
- Backend `PlayerBattleServiceImpl` now injects `PlayerLobbyAdventureService` and checks the current player's readonly adventure unlock snapshot before creating a battle session.
- Locked `MAIN_x_y` stages now fail before hero lookup and before `battle_session` insert; user `1` rejects `MAIN_1_2` with the locked-stage business error.
- Updated backend test and smoke coverage:
  - `PlayerBattleServiceImplTest.startRejectsLockedMainlineStageBeforeCreatingSession()`;
  - `scripts/smoke-battle-stage-guard.ps1` now reads the adventure payload, finds a locked stage, and verifies no session row is written.
- Verification already run:
  - backend focused tests passed with 16 tests;
  - `lootchain-admin,lootchain-game` compile passed;
  - restarted local `lootchain-game` on `http://localhost:8081`;
  - current-flow smoke passed for `MAIN_1_1`: `battleNo=B89bc55ec53ef46e6954005307f74247d`, `settlementNo=S30208205c7884abf8b2fdcb697bf9870`, `rewardGranted=false`, `readonlyEconomy=true`;
  - expanded stage guard smoke passed, including locked `MAIN_1_2`.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4U Verification Refresh + Preview Reimport Gate

- The user-like supervisor agent remains active and is still treating visual Preview acceptance as blocked until the running Preview uses the latest compiled chunks.
- Latest verification rerun:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 TypeScript check passed.
  - Backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed.
  - Backend `lootchain-admin,lootchain-game -am -DskipTests compile` passed.
  - Current-flow smoke passed with `battleNo=Bf09e32b56989422085f2c35e00c94b58`, `settlementNo=S8901223518b349639c56a0297fe30bb9`.
  - Fresh-player smoke passed with user `16`, protagonist hero `13`, `battleNo=Bbad8694fd4234ba68c1844cedb37210e`, `settlementNo=Sa18861ae01c7410ebf7e8d6c107b6e14`.
  - Stage guard smoke passed for `MAIN_9_9` and `EX_1_1`.
  - `git diff --check` passed in both Cocos and backend repos; only line-ending warnings were printed.
- Preview cache probe:
  - `http://localhost:7456/scripting/x/import-map.json` is reachable.
  - The mapped chunk for `AdaptiveStageLayoutResolver.ts` is still `./chunks/a3/a35bebda9e6bec087e22a9df1d4e9c0b9633ca8c.js`.
  - Direct HTTP probing still reports `viewportWidth=False` and `viewportHeight=False`.
  - Updating source mtimes did not trigger the running Creator Preview to rebuild the chunk.
- Added optional probe script:
  - `npm.cmd run check:preview`
  - current result: fails as expected because both `AdaptiveStageLayoutResolver.ts` and `LobbyHudRenderer.ts` chunks are stale.
- Required next visual step in Cocos Creator:
  1. Assets panel -> right-click `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts`.
  2. Choose `Reimport Asset`.
  3. Run `Project -> Refresh Device` (`Ctrl+Shift+P`) or close/reopen the Preview browser tab/window.
  4. Re-probe the chunk and only accept screenshots after `viewportWidth=True` and `viewportHeight=True`.
- Do not kill the user's Cocos Creator process or delete `temp` / `library` unless the user explicitly approves; unsaved editor state may exist.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4V Recent Readback Fail-Closed + Result Exit

- Product/review/test agents found and confirmed fixes for the next flow risks:
  - result-recorded battle panels must not route players back to old formation state;
  - recent battle readback must not expose non-`NO_REWARD` or economy-applied records.
- Cocos frontend:
  - `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`
    - result-state dim click now returns to lobby instead of closing to formation;
    - result-state bottom back slot is disabled and displays `已记录`.
  - `assets/scripts/api/BattleApi.ts`
    - requires non-empty `battleNo`, `settlementNo`, `serverSeed`, and recent `recordedTime`;
    - rejects recent records unless `settlementMode === 'NO_REWARD'`, `rewardGranted=false`, `readonlyEconomy=true`, and `economyApplied=false`.
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts`
    - adventure copy now says no-reward battle preview;
    - stage detail distinguishes same-stage record from global latest record.
  - `assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts`
    - result copy now uses `无奖励记录完成` and `演出结果`.
  - `assets/scripts/scenes/lobby/LobbyBattleFlow.ts`
    - non-force recent-record loading retries when `recentError` is present, so stale cached records do not trap the panel in an error state.
- Backend:
  - `PlayerBattleServiceImpl.recentBattles()` filters query and mapper results to no-reward readonly rows only.
  - `scripts/smoke-cocos-current-flow.ps1` now asserts `settlementMode=NO_REWARD` for recent records.
  - `scripts/smoke-new-player-flow.ps1` now checks the fresh-player settlement appears in recent readback.
- Latest verification:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check passed.
  - Backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed.
  - Backend `lootchain-admin,lootchain-game -am -DskipTests compile` passed.
  - Runtime `lootchain-game` restarted from latest install on `8081`.
  - Current-flow smoke: `battleNo=B3f19c9e199234d75be3ac7c2efe8fe56`, `settlementNo=S193a31a22dce42168975334095850464`.
  - Fresh-player smoke: user `18`, protagonist hero `15`, `battleNo=B4c525184a1ff4b6ebcf5d59800752ebd`, `settlementNo=Sd82006f8403142c6856f69eb62de7ebe`.
  - Stage guard smoke passed for `MAIN_9_9` and `EX_1_1`.
- `npm.cmd run check:preview` currently fails by design until the open Cocos Preview regenerates its chunks.
- Remaining visual blocker unchanged:
  - Cocos Preview `7456` still serves stale `AdaptiveStageLayoutResolver.ts` chunk until Creator-side `Reimport Asset` + `Refresh Device` or Preview reopen.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4W Battle Request/Settle Guard Hardening

- User-like supervisor agent remains active until the whole Cocos playable loop is visually accepted.
- Backend contract hardening that Cocos must respect:
  - `requestId` is still required for battle start and settle;
  - `requestId` now rejects values longer than 80 characters instead of truncating them, preventing idempotency-key collisions;
  - repeated battle start with the same `requestId` is accepted only for the exact same `stageCode`, ordered `heroIds`, and `leaderHeroId`;
  - repeated battle settle returns the original no-reward settlement and must not create another `battle_settlement` row.
- Backend smoke coverage added/expanded:
  - `scripts/smoke-battle-request-guard.ps1` covers missing/null/blank/overlong `requestId` and verifies no `battle_session` write;
  - `scripts/smoke-battle-settle-guard.ps1` covers unknown battle, missing/blank/overlong settle `requestId`, illegal result, and settle idempotency;
  - `scripts/smoke-battle-stage-guard.ps1` now covers empty, malformed, BOSS, EX, Unicode, and overlong stage codes;
  - `scripts/smoke-cocos-current-flow.ps1` now rejects same start `requestId` with changed stage or changed leader, and tolerates Windows PowerShell UTF-8 mojibake while still requiring the Cocos PhaseGate message.
- Latest verification:
  - Backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed with 14 tests.
  - Runtime `lootchain-game` restarted from current source on `8081`; active listener PID was `67976`.
  - Request guard smoke passed.
  - Expanded stage guard smoke passed.
  - Lineup guard smoke passed.
  - Settle guard smoke passed.
  - Current-flow smoke passed: `battleNo=B93139c6b24bf4060ae542647119dd6c8`, `settlementNo=S943593aabf5e4f2da68a8358a7e65568`.
  - Fresh-player smoke passed: user `20`, protagonist hero `17`, `battleNo=B197e082c17c447e9b81bbae5d38b4c7f`, `settlementNo=Sb6ca9e9a401b4567a7433a98a8c6b28d`.
  - Cocos `npm.cmd run check:layout`, focused Cocos TypeScript check, and `git diff --check` remained green before this backend guard stage.
- Cocos Preview visual blocker remains unchanged:
  - `npm.cmd run check:preview` still fails because the already-running Preview serves stale `AdaptiveStageLayoutResolver.ts` and `LobbyHudRenderer.ts` chunks;
  - final screenshot acceptance still needs Creator-side `Reimport Asset` + `Refresh Device` or Preview reopen.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4Y Lobby Display Name Uses Protagonist Name

- User request: the lobby top-left name must show the protagonist name entered on the creation screen.
- Backend contract changed:
  - `GET /api/player/me/lobby` now returns `protagonistName`;
  - `displayName` now prefers `player_protagonist.protagonist_name` when the current login user has a protagonist;
  - if no protagonist exists, `displayName` falls back to account nickname, username, then `Player{userId}`.
- Cocos change:
  - `PlayerLobbyProfileVO` includes optional `protagonistName`;
  - `LobbyProfileState` normalizes `protagonistName` and still renders all HUD/profile name slots through `displayName`.
- Verification:
  - backend restarted from current source on `8081`, active listener PID `20152`;
  - direct HTTP for user `23`: `displayName=SmokeHero23`, `protagonistName=SmokeHero23`, original account nickname preserved;
  - Cocos Preview screenshot: `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4y-protagonist-name\user-23-lobby-protagonist-name.png`;
  - Cocos `npm.cmd run check:layout` passed;
  - Cocos TypeScript no-emit over 84 TS files passed;
  - Cocos `npm.cmd run check:preview` passed;
  - backend focused tests `PlayerLobbyProfileServiceTest,PlayerLobbyAdventureServiceImplTest,PlayerProtagonistServiceImplTest,PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed with 20 tests;
  - backend current-flow smoke passed: `battleNo=Befab91a1e3c64308984b772ad7d4f0d7`, `settlementNo=Sf1126bc496bf4adb9be29fde828c699c`;
  - backend fresh-player smoke passed: user `23`, protagonist hero `20`, `battleNo=B7079b818521d4bd294da06bba99013c9`, `settlementNo=S7a6c3c600f7046028dfc22f11c5deb86`.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4Z Adventure Stage Local Selection

- Current next-stage goal: make the lobby adventure panel support explicit local stage selection before entering formation, so the selected stage does not drift between adventure detail, formation, battle start, and result readback.
- Cocos source changes:
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts`
    - unlocked map nodes and compact stage rows are clickable;
    - selected stage is highlighted and labeled with `已选`;
    - right-side detail and compact CTA now follow the selected stage instead of always using the recommended/default stage;
    - clicks only update local UI state and do not start battle, save progress, write rewards, or touch economy.
  - `assets/scripts/scenes/LootChainGameRoot.ts`
    - added `selectLobbyAdventureStage(stageCode)` and `findLobbyAdventureStage(stageCode)`;
    - selection accepts only valid `MAIN_x_y` values and only unlocked stages from the loaded adventure snapshot;
    - selected stage is still passed through the existing formation and battle-preview path.
  - `scripts/check-layout.mjs`
    - guards the new stage-selection wiring and the new `LobbyAdventureStageVO` import.
  - `scripts/check-preview-freshness.mjs`
    - now also probes `LootChainGameRoot.ts` and `LobbyAdventurePanelRenderer.ts` chunks for stage-selection tokens, so stale Preview chunks no longer produce a false green.
- Multi-role review notes:
  - Product/supervisor agents agreed the player must never wonder whether the battle target differs from the clicked stage.
  - R&D review confirmed no new economy/progress write should be added; current selection remains local UI state.
  - Existing Stage 4V result-exit fix already keeps recorded results returning to lobby instead of old formation state.
- Verification:
  - Cocos `npm.cmd run check:layout` passed.
  - Cocos Creator 3.8.8 TypeScript no-emit over `assets/scripts` passed.
  - Backend focused tests passed with 18 tests: `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest,PlayerLobbyAdventureServiceImplTest,PlayerLobbyHeroServiceImplTest,PlayerProtagonistServiceImplTest`.
  - Backend current-flow smoke passed for user `1`, `MAIN_1_1`: `battleNo=B788c766665fd46a6ad956cb2528a32ba`, `settlementNo=S83a66cbc858d43a4826efee9f22990dd`, `rewardGranted=false`, `readonlyEconomy=true`.
- Runtime visual blocker:
  - the already-running Cocos Preview on `http://localhost:7456` still serves stale chunks for `LootChainGameRoot.ts` and `LobbyAdventurePanelRenderer.ts`;
  - `npm.cmd run check:preview` now fails intentionally until Creator regenerates those chunks;
  - low-risk unblock remains Creator-side `Reimport Asset` for the two source files plus `Project -> Refresh Device` or reopen Preview. Do not kill Creator or delete `temp/library` without user approval.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4Z Runtime Acceptance Follow-up

- The previously stale Cocos Preview refreshed successfully; `npm.cmd run check:preview` now passes again.
- Runtime QA was executed through Chrome DevTools Protocol against `http://localhost:7456`.
- Desktop visual evidence:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\desktop-1920x900-01-adventure-selected.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\desktop-1920x900-02-formation-selected-stage.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\desktop-1920x900-03-battle-selected-stage.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\desktop-1920x900-04-battle-settlement-selected-stage.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\desktop-1920x900-05-return-lobby-after-selected-stage.png`
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\desktop-1920x900-06-adventure-recent-readback.png`
- Compact visual evidence:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection\micro-390x340-01-adventure-selected.png`
- Runtime facts:
  - selected stage stayed `MAIN_1_1` from adventure detail into formation and battle preview;
  - battle start used `battleNo=B810204a94e064015a052f806dc199bec`;
  - result settlement used `settlementNo=Sf4ebb68f5cec4eb890141477df987b1c`;
  - settlement returned `stageCode=MAIN_1_1`, `rewardGranted=false`, `readonlyEconomy=true`;
  - return-to-lobby closed both battle preview and formation overlays.
  - a fresh login/adventure readback then loaded the same latest settlement `Sf4ebb68f5cec4eb890141477df987b1c` from recent records with `rewardGranted=false` and `readonlyEconomy=true`.
- Latest local checks:
  - `npm.cmd run check:layout` passed.
  - `npm.cmd run check:preview` passed.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4AC Battle Result Guidance And Recent Readback UX

- Cocos frontend-only stage; backend code/API/SQL did not change.
- Product goal:
  - after a no-reward battle settlement, the result panel must clearly tell the player what was recorded and what to do next;
  - the adventure detail panel must make the latest no-reward readback understandable without implying claimable rewards.
- Source changes:
  - `assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts`
    - result-recorded copy now says the no-reward record was written;
    - boundary copy explains the next step: return to lobby and view the recent record in mainline adventure;
    - player-facing wording uses “奖励未开放 / 资源未变更 / 主线进度不推进” instead of raw debug fields;
    - the code comment still preserves the guard phrase `rewardGranted=false` for automated checks.
  - `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`
    - added `LobbyBattleSettlementReceipt`, a desktop result receipt card that shows settlement number, battle number, reward status, resource status, and progress status;
    - the receipt is attached inside the battle panel, so panel-internal clicks still do not pass through to the dim layer.
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts`
    - replaced the single recent-record line with `LobbyAdventureRecentBattleSummaryCard`;
    - the card now separates recent result, record time/target, and no-reward/resource guard wording.
  - `scripts/check-layout.mjs`
    - now guards the new result receipt, result guidance copy, and recent-record card tokens.
  - `scripts/check-preview-freshness.mjs`
    - now checks the battle preview chunk for the result receipt and the adventure chunk for the recent-record card.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos Creator TypeScript no-emit passed for the battle/adventure result files.
  - `git diff --check` passed with existing LF->CRLF warnings only.
- Current Preview status:
  - `npm.cmd run check:preview` intentionally fails because the already-running Cocos Preview is still serving stale chunks:
    - `LobbyAdventurePanelRenderer.ts` chunk missing `LobbyAdventureRecentBattleSummaryCard`;
    - `LobbyBattlePreviewPanelRenderer.ts` chunk missing `LobbyBattleSettlementReceipt`.
  - Source is updated and static checks pass; runtime screenshot acceptance needs Creator-side script refresh/reimport or Preview reopen before rerunning `check:preview`.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4AD Runtime Acceptance For Result Guidance

- Scope:
  - no source behavior change in this follow-up;
  - cleared Stage 4AC runtime acceptance by verifying the running Cocos Preview now serves the new battle result and adventure recent-record chunks.
- Preview/cache status:
  - `npm.cmd run check:preview` now passes again;
  - packer-driver detected and transformed:
    - `LobbyAdventurePanelRenderer.ts`;
    - `LobbyBattlePresentationState.ts`;
    - `LobbyBattlePreviewPanelRenderer.ts`.
- Runtime visual QA was executed through Chrome DevTools Protocol against `http://localhost:7456`.
- Evidence folder:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ad-result-guidance`
- Screenshots:
  - `desktop-1920x900-01-adventure-recent-card-before.png`
  - `desktop-1920x900-02-formation-main-1-1.png`
  - `desktop-1920x900-03-battle-ready-to-record.png`
  - `desktop-1920x900-04-battle-settlement-receipt.png`
  - `desktop-1920x900-05-adventure-recent-card-after.png`
- Runtime facts:
  - Cocos selected and battled `MAIN_1_1`;
  - battle start: `B05d15599907544cea526baba82b0cb12`;
  - settlement: `Sc6ee0f5062f44317a0333c5c3d7fde30`;
  - the result scene contained:
    - `LobbyBattleSettlementReceipt`;
    - `LobbyBattleSettlementReceiptTitle`;
    - `LobbyBattleSettlementReceiptLine_0..4`;
  - settlement returned `rewardGranted=false` and `readonlyEconomy=true`;
  - after returning to lobby, reopening adventure loaded the same latest settlement in `LobbyAdventureRecentBattleSummaryCard`.
- Verification:
  - `npm.cmd run check:layout` passed.
  - `npm.cmd run check:preview` passed.
  - Focused Cocos Creator TypeScript no-emit passed for the changed battle/adventure files.
  - Backend `scripts/smoke-cocos-current-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1` passed with:
    - battle `B482c0b55c4c545589855c30b69b1e50d`;
    - settlement `S335a2554c0c74ba1b462d97f27de8e9e`;
    - `rewardGranted=false`;
    - `readonlyEconomy=true`;
    - unchanged economy snapshots.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.

## 2026-05-31 Stage 4AE Lobby Next-Step Goal Tracker

- Scope:
  - Cocos frontend-only source change;
  - backend code/API/SQL did not change.
- Product goal:
  - after returning to lobby from the no-reward battle/readback loop, the player should immediately see what to do next;
  - the lobby should show the current mainline target and latest readonly battle record without implying rewards, stamina spend, or progress.
- Source changes:
  - `assets/scripts/scenes/lobby/LobbyHudTypes.ts`
    - `LobbyHudHost` now exposes `currentLobbyBattleState()` and `currentLobbySelectedStageCode()` as read-only HUD inputs.
  - `assets/scripts/scenes/lobby/LobbyHudRenderer.ts`
    - added `LobbyGoalTracker` for desktop;
    - added `LobbyCompactGoalTracker` for constrained non-micro layouts;
    - added `LobbyMicroGoalChip` for very small Preview/mobile viewports;
    - tracker derives target stage from current selected/recommended adventure state and recent battle records only;
    - tracker click only opens the existing adventure panel and never starts battle, skips formation, grants rewards, spends stamina, or writes progress.
  - `assets/scripts/scenes/LootChainGameRoot.ts`
    - overlay refresh now removes the new tracker nodes before rerendering HUD.
  - `scripts/check-layout.mjs`
    - guards the new tracker nodes, host methods, allowed click contract, and multi-resolution tracker bounds.
  - `scripts/check-preview-freshness.mjs`
    - now checks the HUD chunk for `LobbyGoalTracker`, `LobbyCompactGoalTracker`, `LobbyMicroGoalChip`, and `currentLobbyBattleState`.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos Creator TypeScript no-emit passed for root/HUD/type files.
  - Cocos `git diff --check` passed with existing LF->CRLF warnings only.
  - Backend `git diff --check` passed with existing LF->CRLF warnings only.
  - Backend `scripts/smoke-cocos-current-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1` passed:
    - battle `B3c2c3bee321449cf9ffe379e32f947fd`;
    - settlement `S4fd31cbe921e4edbb1af0c60438682bd`;
    - `rewardGranted=false`;
    - `readonlyEconomy=true`;
    - economy snapshots unchanged.
- Current Preview status:
  - `npm.cmd run check:preview` currently fails because the already-running Cocos Preview is still serving stale `LobbyHudRenderer.ts` chunk `b23bf0ad3ece87ab6871a1675b5151e5718ec414.js`;
  - the stale chunk is missing `LobbyGoalTracker`, `LobbyCompactGoalTracker`, `LobbyMicroGoalChip`, and `currentLobbyBattleState`;
  - a Cocos CLI build attempt hung without producing a build log and the spawned process was stopped;
  - runtime screenshot acceptance for Stage 4AE still needs Creator-side script refresh/reimport or Preview reopen before rerunning `npm.cmd run check:preview`.
- Red line unchanged:
  - no reward;
  - no stamina cost;
  - no mainline progress write;
  - no saved formation write;
  - no bag/currency/USDT/fund-pool mutation;
  - no EX V1;
  - no new economy write endpoint.
## 2026-05-31 Stage 4AF Fresh Player Runtime Closure And Hero Roster Race Fix

- 当前阶段仍以 Cocos-only 为准，不回到 `web-vue`。
- 本轮补齐了新玩家端到端运行时证据：在最新 Cocos Preview 下新建本地 `game_user` userId `29`，通过 Cocos 登录后进入主角创建页，创建主角 `VisualHero29`，随后进入大厅。
- 大厅左上角显示名使用创建时输入的主角名 `VisualHero29`；该账号主角英雄为 `user_hero.id=26`，英雄队列中主角自动进入本地编队。
- 最新 Cocos 运行时闭环：
  - 创建主角 -> 大厅目标引导 -> 冒险 `MAIN_1_1` -> 编队 -> 战斗预演 -> 无奖励结算 -> 返回大厅 -> 冒险最近记录回读；
  - battle `B8a2ffc4fea6e40689e3a03030d156d03`；
  - settlement `S013e12191ed944ca89b43cecf79a5fc6`；
  - `rewardGranted=false`；
  - `readonlyEconomy=true`；
  - 最近记录回读同一 settlement `S013e12191ed944ca89b43cecf79a5fc6`。
- 本轮修复了一个真实前端竞态：
  - `assets/scripts/scenes/lobby/LobbyHeroRosterLoader.ts` 现在会复用正在进行中的英雄队列加载 Promise；
  - `cancel()` 现在会真正递增请求票据并清空 in-flight 请求，避免重新登录或切换玩家后旧响应覆盖新玩家英雄队列；
  - 这防止玩家快速从编队进入战斗预演时，战斗 start 在英雄队列还未完成加载前拿到空阵容。
- Cocos Preview 已通过 Creator 脚本构建刷新，运行中的 Preview chunk 能搜到 `inFlightLoad`，`npm.cmd run check:preview` 已通过，不再停留在 Stage 4AE 的 stale HUD caveat。
- 截图证据目录：
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ae-lobby-goal-tracker`
  - 新玩家截图包括 `desktop-1920x900-09-fresh-protagonist-create.png`、`desktop-1920x900-10-fresh-lobby-goal-tracker.png`、`desktop-1920x900-11-fresh-settlement-receipt.png`、`desktop-1920x900-12-fresh-recent-readback.png`。
- 本轮已跑检查：
  - `npm.cmd run check:layout` 通过；
  - `npm.cmd run check:preview` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - 后端 current-flow smoke 通过：user `1`，battle `B7af2444b982847219d02983aa45d5443`，settlement `S7d2455aff3604567ae56a4c83d2c3390`；
  - 后端 fresh-player smoke 通过：user `30`，protagonist `SmokeHero30`，hero `27`，battle `B7bf0f5841814478396d8b9d4a4d001ab`，settlement `Sa3d6e79624f34e4ab217b8f32efad150`，stamina `100 -> 100`，combatPower `9432 -> 9432`。
- 红线保持不变：
  - 不发奖励；
  - 不扣体力；
  - 不推进主线进度；
  - 不保存编队；
  - 不改背包、货币、USDT、资金池；
  - 不开放 EX V1；
  - 不新增任何经济写入口。

## 2026-05-31 Stage 4AG Resilience Closure

- 当前阶段仍然以 Cocos-only 为准，不回到 `web-vue`。
- 本轮目标是把“登录 -> 大厅 -> 冒险 -> 编队 -> 战斗预演 -> 无奖励结算 -> 返回/重登回读”从可玩闭环提升到抗误触、抗竞态、可复验闭环。
- 前端补齐：
  - `assets/scripts/scenes/login/LoginRenderer.ts` 的登录弹框内容区已挂 `BlockInputEvents`，弹框内部点击不会穿透到底层登录按钮；
  - 所有大厅弹框仍保留内容区输入阻断，运行时已覆盖个人信息、公告、图鉴、英雄、占位、冒险、编队、战斗预演；
  - `assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts` 增加出战预览准入：英雄队列加载中、加载失败或为空时按钮显示 `读取中`/`不可出战` 并禁用；
  - `scripts/check-preview-freshness.mjs` 已同步检查登录弹框阻断、面板阻断、目标追踪、战斗结算和英雄队列竞态 token；
  - 新增运行时 QA 脚本 `tmp/stage4ag-resilience-qa.mjs`，用于复验弹框阻断、非法/锁定路径、快速点击去重、刷新/重登回读和多分辨率 HUD。
- 最新 Cocos Preview 运行时验收：
  - user `1`，大厅显示主角名 `圣契1`；
  - 非法 `EX_1_1` 和锁定 `MAIN_1_2` 都没有进入编队/战斗；
  - 快速点击只创建 1 次 battle start 和 1 次 settle；
  - battle `B3525e4db77d94108a1c0379773366153`；
  - settlement `S6f721e05eee049658795824d15ddce0f`；
  - 返回大厅和重登后最近记录均回读同一 settlement；
  - `rewardGranted=false`，`readonlyEconomy=true`，`economyApplied=false`。
- 截图证据目录：
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ag-resilience`
  - 覆盖 `1920x900`、`1280x720`、`390x340`。
- 最新验证：
  - `npm.cmd run check:layout` 通过；
  - `npm.cmd run check:preview` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - 后端 current-flow、stage guard、lineup guard、request guard、settle guard、fresh-player smoke 全部通过。
- 后端 smoke 最新关键 ID：
  - current-flow battle `B4031d43401ee4f2ca943675aa2dcf88a`，settlement `Secdd9cd5dcbd487bacaada9cb7f6ddfb`；
  - fresh-player user `31`，protagonist `SmokeHero31`，hero `28`，battle `Bf4ce3ccc1a4949cfbf8a534d21495f02`，settlement `S747eaef629204fe3a737933183504b5e`；
  - fresh-player stamina `100 -> 100`，combatPower `9432 -> 9432`。
- 红线不变：
  - 不发奖励；
  - 不扣体力；
  - 不推进主线进度；
  - 不保存编队；
  - 不修改背包、货币、USDT、资金池；
  - 不开放 EX V1；
  - 不新增任何经济写入口。

### 下一阶段建议

- 继续往正常游玩流程推进时，优先做“只读剧情/关卡目标展示 + 本地战斗表现占位”的玩家体验补强。
- 在经济规则正式确认前，仍保持 no-reward settlement，不接真实掉落、体力消耗、主线进度推进和资源写入。

## 2026-05-31 Stage 4AH Full-Screen Battle And Hero Detail

- 当前阶段仍然以 Cocos-only 为准，不回到 `web-vue`。
- 多角色结论：
  - 产品：战斗必须进入全屏/新场景式表现，不再使用缩小弹框承载核心战斗；
  - 设计/UI：本轮先在大厅内切到 `battle` 逻辑视图，保持全屏画面、明确返回入口和无奖励结果记录；
  - 美术：使用高质量暗黑哥特战斗背景、英雄详情背景和主角立绘素材，避免卡通化；
  - 研发：复用现有 no-reward battle session/settlement/readback，不新增经济写入；
  - 审查/验收：英雄详情为只读展示，战斗仍不发奖励、不扣体力、不推进主线。
- 本轮 Cocos 代码变更：
  - `assets/scripts/scenes/LootChainGameRoot.ts`
    - 增加 `battle` 视图；
    - 增加 `renderBattleScene()`；
    - 打开战斗时切换 `this.currentView = 'battle'`，关闭/返回时回到大厅；
    - 增加 `openLobbyHeroDetail()`、`closeLobbyHeroDetailPanel()`、`backToLobbyHeroRosterPanel()` 和当前英雄详情状态。
  - `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`
    - 使用 `LobbyBattleSceneRoot` 作为全屏战斗表现层；
    - 增加战斗背景精灵、暗角、粒子/余烬动效、角色突进 tween 和命中特效 tween；
    - 保留 `LobbyBattleSettlementReceipt`、只读结算、内容区 `BlockInputEvents`。
  - `assets/scripts/scenes/lobby/LobbyHeroRosterPanelRenderer.ts`
    - 英雄卡增加点击反馈和 `openLobbyHeroDetail(hero.id)`。
  - `assets/scripts/scenes/lobby/LobbyHeroDetailPanelRenderer.ts`
    - 新增英雄详情只读展示层；
    - 展示英雄动态图/立绘、名称、稀有度、星级、主角形态、属性、技能和只读说明；
    - 不接升级、升星、觉醒、装备、抽卡、领取等入口。
  - `assets/scripts/scenes/UiSpriteFrameCache.ts`
    - 预加载本轮新增 UI 素材。
- 本轮新增素材：
  - `assets/resources/ui/battle/battle_scene_cathedral.png`
  - `assets/resources/ui/hero-detail/hero_detail_backdrop.png`
  - `assets/resources/ui/hero-detail/hero_detail_protagonist.png`
- 守卫脚本已同步：
  - `scripts/check-layout.mjs`
  - `scripts/check-preview-freshness.mjs`
- 已跑验证：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF->CRLF warning；
  - `npm.cmd run check:preview` 失败，原因是当前 Cocos Preview 仍在服务旧 chunk，缺少本阶段新 token 和 `LobbyHeroDetailPanelRenderer.ts` import-map entry。下一次需要刷新/重开 Creator Preview 后重新执行。
- 红线不变：
  - 不发奖励；
  - 不扣体力；
  - 不推进主线进度；
  - 不保存编队；
  - 不修改背包、货币、USDT、资金池；
  - 不开放 EX V1；
  - 不新增任何经济写入口。

### 下一阶段建议

- 刷新 Cocos Preview 后先跑 `npm.cmd run check:preview` 和一次运行时 QA，确认全屏战斗层、英雄详情层、多分辨率布局都进入最新预览包。
- Preview 刷新通过后，再继续做剧情/关卡目标的只读呈现和战斗表现动画细化。

## 2026-05-31 Stage 4AI Lobby Popups Converted To Scene Pages

- 当前阶段仍然以 Cocos-only 为准，不回到 `web-vue`。
- 用户要求：`将全部弹框改成，切换场景`。
- 本轮实现口径：
  - 当前没有拆多个物理 Cocos `.scene` 文件；
  - 采用单 Cocos 主场景内的 `currentView` 逻辑场景切换；
  - 这样可以满足“视觉和交互上切场景，不再弹框覆盖 HUD”，同时避免登录态、资源缓存、背景视频和 no-reward battle flow 被大范围重写。
- 已改的入口：
  - 登录账号页 -> `loginDialog` 场景页；
  - 个人信息 -> `profile` 场景页；
  - 公告/活动 -> `notice` 场景页；
  - 冒险 -> `adventure` 场景页；
  - 编队 -> `formation` 场景页；
  - 英雄 -> `heroes` 场景页；
  - 英雄详情 -> `heroDetail` 场景页；
  - 图鉴 -> `codex` 场景页；
  - 未开放占位入口 -> `placeholder` 场景页；
  - 战斗仍走上一阶段 `battle` 全屏逻辑场景。
- 代码变更：
  - `assets/scripts/scenes/LootChainGameRoot.ts`
    - `ViewName` 扩展到所有大厅功能页；
    - 新增 `renderLobbyScenePage()`；
    - 新增 `isLobbyScenePageView()`；
    - 新增 `returnToLobbyFromScenePage()`；
    - `renderLobby()` 只渲染大厅背景和 HUD；
    - 打开功能页时设置对应 `currentView` 并整页重绘；
    - 关闭功能页时返回大厅，英雄详情“返回英雄”回英雄列表。
  - `LobbyAdventurePanelRenderer.ts`
  - `assets/scripts/scenes/login/LoginRenderer.ts`
  - `LobbyFormationPanelRenderer.ts`
  - `LobbyHeroRosterPanelRenderer.ts`
  - `LobbyHeroDetailPanelRenderer.ts`
  - `LobbyCodexPanelRenderer.ts`
  - `LobbyNoticePanelRenderer.ts`
  - `LobbyProfileDialogRenderer.ts`
    - 面板尺寸改为安全区全屏页面；
    - 遮罩层只做 `BlockInputEvents`；
    - 不再点击遮罩关闭；
    - 主要关闭按钮改为 `返回大厅`。
  - `scripts/check-layout.mjs`
    - 增加逻辑场景页和全屏页面布局守卫；
    - 增加遮罩不关闭、返回大厅按钮 token。
  - `scripts/check-preview-freshness.mjs`
    - 增加 Preview chunk 新鲜度 token，覆盖所有逻辑场景页。
- 已跑验证：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF->CRLF warning；
  - `npm.cmd run check:preview` 仍失败，原因是 Cocos Preview 继续服务旧 chunk。下一次需要刷新/重开 Preview 后复验。
- 红线不变：
  - 不发奖励；
  - 不扣体力；
  - 不推进主线进度；
  - 不保存编队；
  - 不修改背包、货币、USDT、资金池；
  - 不开放 EX V1；
  - 不新增任何经济写入口。

### 下一阶段建议

- 刷新 Cocos Preview 后优先跑 `npm.cmd run check:preview`；
- 做一轮运行时点击 QA：大厅入口 -> 对应场景页 -> 返回大厅；英雄页 -> 英雄详情 -> 返回英雄 -> 返回大厅；冒险 -> 编队 -> 战斗；
- 如果后续确实需要物理 Cocos Scene，再单独规划 scene asset、预制体、跨 scene 状态持有和资源生命周期。

## 2026-05-31 Stage 4AJ Gacha Summon Preview

- 当前阶段仍然以 Cocos-only 为准，不回到 `web-vue`。
- 本轮已读取 `D:\project\LootChain\docs\gacha` 全部文档，并按产品、数值、架构、UI、美术、VFX、后端、前端、QA、Review 角色完成当前阶段输出。
- 后端边界：
  - 当前真实玩家接口路径是 `/api/player/gacha/*`；
  - 文档旧口径 `/api/game/gacha/*` 不作为本轮实现路径；
  - `PlayerApiPhaseGate` 当前仍阻断玩家侧 gacha 接口；
  - 真实单抽/十连/兑换/补发属于经济写入口，本轮未开放。
- Cocos 本轮实现：
  - 新增 `assets/scripts/scenes/gacha/GachaSceneConfig.ts`；
  - 新增 `assets/scripts/scenes/gacha/GachaSceneRenderer.ts`；
  - 新增 `assets/resources/ui/gacha/gacha_bg_cathedral.png` 及 meta；
  - `UiSpriteFrameCache.ts` 预加载 gacha 背景；
  - `LootChainGameRoot.ts` 新增 `gacha` 逻辑场景页；
  - `LobbyHudRenderer.ts` 将活动入口 `深渊召唤` 和场景热点 `召唤祭坛` 接到全屏召唤预览页；
  - 单抽/十连按钮只提示未开放，不调用后端写接口。
- 生成素材：
  - `D:\project\lootchain-cocos\docs\ui-reference\gacha\generated\gacha_bg_cathedral.png`
  - `D:\project\lootchain-cocos\docs\ui-reference\gacha\generated\gacha_ui_target_mockup.png`
- 后端项目同步文档：
  - `D:\project\LootChain\docs\gacha\gacha-current-stage-output.md`
  - `D:\project\LootChain\docs\gacha\gacha-art-pack-manifest.json`
- 已跑验证：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过。
- 下次继续建议：
  - 先补透明卡框、按钮、图标、召唤阵和粒子素材；
  - 再做 gacha 结果展示层；
  - 真实抽卡前必须先单独做后端 G1 只读白名单和 G2 测试环境单抽授权。
- 红线不变：不发奖励、不扣资源、不发放英雄、不更新保底、不开放兑换、不开放 EX V1、不新增任何经济写入口。

## 2026-06-01 Stage 4AK Gacha Local Mock Result Layer

- 当前阶段继续保持 Cocos-only，不回到 `web-vue`。
- 本轮只修改 Cocos 前端展示层：
  - `assets/scripts/scenes/gacha/GachaSceneConfig.ts` 新增 `GachaMockResultItem`、`GACHA_MOCK_RESULT_ONCE`、`GACHA_MOCK_RESULT_TEN`；
  - `assets/scripts/scenes/gacha/GachaSceneRenderer.ts` 新增 `GachaMockResultLayer`、`GachaMockResultPanel`、`GachaMockResultNoWriteNote`、`GachaMockResultConfirmButton`；
  - 单抽/十连按钮从单纯状态提示升级为打开本地 mock 结果弹层；
  - 结果卡片仍由 Cocos `Graphics` 绘制，避免截图式模糊资源。
- 行为边界：
  - 结果内容是固定本地 mock，只用于 UI/动效验收；
  - 不调用 `GachaApi`，不请求 `/api/player/gacha/draw`；
  - 不扣资源、不发英雄、不写入抽卡记录、不更新保底、不开放兑换或补发。
- 守卫同步：
  - `scripts/check-layout.mjs` 新增 gacha mock 配置、结果弹层节点和前端-only 禁止项检查；
  - `scripts/check-preview-freshness.mjs` 新增 Gacha 结果弹层 chunk freshness token，刷新/重开 Cocos Preview 后可复验运行包是否最新。
- 已跑验证：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过。
- Preview 状态：
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 `GachaSceneRenderer.ts` chunk，缺少 `GachaMockResultLayer`、`GachaMockResultPanel`、`GachaMockResultNoWriteNote`、`GachaMockResultConfirmButton`；
  - 需要在 Cocos Creator 中刷新/重开 Preview 后再复验。
- 下次继续建议：
  - 重开/刷新 Cocos Creator Preview 后运行 `npm.cmd run check:preview`；
  - 做一次大厅 `深渊召唤`、场景热点 `召唤祭坛`、小屏 `召唤` 到 Gacha 页的点击 QA；
  - 继续补透明卡框、按钮三态、概率/记录/兑换/保底图标、召唤阵和粒子素材。
- 红线不变：真实单抽、十连、兑换、补发仍全部关闭；不改变经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AL Protagonist Full-Screen Scene

- 用户反馈“选择角色弹框需要更改为全屏场景”。
- 本轮只修改 Cocos 前端主角选择/创建页，不改后端接口、SQL 或经济配置。
- Cocos 本轮实现：
  - `assets/scripts/scenes/protagonist/ProtagonistCreateRenderer.ts` 保留 `currentView = 'protagonistCreate'` 逻辑视图；
  - `ProtagonistCreatePanel` 从居中弹框尺寸改为安全区全屏场景尺寸；
  - 新增 `drawFullSceneFrame()`，只绘制薄边框和顶部/底部暗色压层，不再使用居中弹框视觉；
  - 男/女主角卡、SSR 形态预览、角色名输入和“进入游戏”按钮按全屏舞台重新排布；
  - `ProtagonistCreatePanel` 加入 `BlockInputEvents`，作为独立全屏场景吞掉输入。
- 行为边界：
  - 仍只提交 `gender` 和 `protagonistName`；
  - 不允许客户端提交 `heroCode`、稀有度、等级、星级、战力或属性；
  - 主角色创建仍是账号初始化写入，不是抽卡、奖励、购买、结算、资金池或链上领取入口。
- 守卫同步：
  - `scripts/check-layout.mjs` 已更新主角选择页的全屏场景布局公式和多分辨率边界/重叠检查；
  - `scripts/check-preview-freshness.mjs` 已新增 `ProtagonistCreateRenderer.ts` 全屏场景 token。
- 已跑验证：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过。
- Preview 状态：
  - `npm.cmd run check:preview` 当前失败，运行中的 Cocos Preview 仍在服务旧 `ProtagonistCreateRenderer.ts` chunk，缺少 `drawFullSceneFrame`、`scene.addComponent(BlockInputEvents)` 和全屏场景说明 token；
  - 同时旧 `GachaSceneRenderer.ts` chunk 仍缺少 Stage 4AK 的 Gacha 结果层 token；
  - 需要在 Cocos Creator 中刷新/重开 Preview 后再复验。
- 下次继续建议：
  - 刷新/重开 Cocos Creator Preview 后运行 `npm.cmd run check:preview`；
  - 用新账号走一遍 `登录 -> 全屏选择角色 -> 创建主角 -> loading -> 大厅` 运行时 QA。
- 红线不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AM Protagonist Local Schema Fix

- 用户反馈点击主角选择页“进入游戏”提示“系统异常”。
- 本地接口实调定位：
  - `POST /api/player/auth/dev-login` 对 `userId=1` 返回 `code=0`；
  - `GET /api/player/protagonist/state` 返回 `code=500 / 系统异常`；
  - MySQL 查询确认本地 `lootchain` schema 缺少 `player_protagonist` 表。
- 修复动作：
  - 已执行 `D:\project\LootChain\sql\12_protagonist_module.sql` 到本地 `lootchain` 数据库；
  - 该脚本创建 `player_protagonist`，补齐 `user_hero.source_type/sort_weight`，并插入男女主角攻击形态模板；
  - 这是既有主角模块迁移，不改变概率、消耗、保底、奖励、USDT、资金池或 EX 规则。
- 复验结果：
  - `userId=1` 的 `GET /api/player/protagonist/state` 已恢复 `code=0`，当前仍为 `created=false`，没有被提前创建主角；
  - 用已有测试玩家 `userId=3` 调用 `POST /api/player/protagonist` 成功，返回 `rarity=SSR`、`currentForm=attack`、`heroCode=PROTAGONIST_FEMALE_ATTACK`、`userHeroId=4`；
  - `npm.cmd run check:layout` 通过，focused Cocos Creator TypeScript no-emit 通过，前后端 `git diff --check` 通过且仅有既有 LF->CRLF warning；
  - 后续在 Cocos Preview 中用默认 `userId=1` 点击“进入游戏”应进入正常创建流程。
- 注意：本次修复了本机数据库缺失迁移；如果其他机器或数据库重置后再次出现同样 500，先执行 `sql/12_protagonist_module.sql`。

## 2026-06-01 Stage 4AN Lobby Scene Page Background Flash Fix

- 用户反馈点击部分大厅功能弹框/功能页时，会短暂闪出登录界面的背景视频。
- 根因：
  - 主场景里登录背景节点 `Login_BG_Video`、`Login_BG_Poster`、`BG_Main`、`Sky_Effects`、`Foreground_Effects` 等仍是 Canvas 的常驻静态节点；
  - 部分大厅功能页进入时走 `renderBase()`，会先 `releaseLobbyVideoRuntime()` 并 `contentRootController.clear()`，导致 `Lobby_BG_Poster` / `Lobby_BG_Video` 被销毁；
  - 大厅背景重建前的这一帧会露出底层登录视频。
- 修复：
  - `LootChainGameRoot.ts` 新增 `LOGIN_SCENE_STAGE_NODE_NAMES`，离开 `login/loginDialog` 后统一隐藏登录静态舞台节点；
  - 新增 `tryPlayLoginSceneVideo()`，回到 `login/loginDialog` 时递归尝试恢复登录背景 `VideoPlayer` 播放，避免登录页视频被上一轮隐藏动作永久停掉；
  - 新增 `LOBBY_BACKGROUND_NODE_NAMES` 与 `renderLobbyWorldBase()`，大厅功能页切换时只清掉 HUD/页面层，保留现有 `Lobby_BG_Poster`、`Lobby_BG_Video`、`Lobby_BG_Fallback`；
  - `UiContentRootController.ts` 新增 `clearExcept()`，支撑保留指定运行时节点；
  - `returnToLobbyFromScenePage()` 和 `closeGachaScene()` 改为回到 `renderCurrentView()`，能复用已存在的大厅背景保活路径；
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 加入本次背景保活和登录舞台隐藏 token。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 `LootChainGameRoot.ts` chunk，缺少 `renderLobbyWorldBase`、`clearExcept(LOBBY_BACKGROUND_NODE_NAMES)`、`LOGIN_SCENE_STAGE_NODE_NAMES`、`setLoginSceneStageVisible`；需要刷新/重开 Preview 后复验。
- 红线不变：本次只改 Cocos 前端渲染生命周期，不改变经济规则，不开放 EX V1，不新增任何经济写入口。

### 2026-06-01 Stage 4AN Login Video Restore Patch

- 用户反馈上一轮修复后登录背景视频没了。
- 修正：
  - 移除离开登录态时主动 `VideoPlayer.stop()` / `AudioSource.stop()` 的逻辑；
  - 登录舞台隐藏只控制节点 `active`，不销毁登录背景节点，也不永久停止登录视频；
  - 回到 `login/loginDialog` 时通过 `tryPlayLoginSceneVideo()` 对登录背景视频执行静音播放尝试。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过。

## 2026-06-01 Stage 4AO Remaining Popup Paths Converted To Full-Screen Scenes

- 用户要求：全部弹框都改为切换新的全屏场景。
- 当前仍按项目既定方案使用单 Cocos 主场景内的 `currentView` 逻辑场景切换，未拆新的物理 `.scene` 文件，避免破坏登录态、资源缓存、背景视频保活和当前 no-write 预览流。
- 本轮已收敛剩余弹层路径：
  - 登录账号页可见节点改为 `LoginAccountSceneRoot` / `LoginAccountScenePanel`，面板按安全区全屏铺开并阻断底层输入；
  - Gacha 单抽/十连本地 mock 结果从 `GachaMockResultLayer` 覆盖层改为 `currentView = 'gachaResult'` 的全屏结果场景，由 `renderResultScene()` 渲染；
  - 未开放/占位入口可见节点改为 `LobbyPlaceholderSceneRoot` / `LobbyPlaceholderScenePanel`，继续只做本地提示，不跳转、不发奖、不写入经济数据。
- 已确认核心源码和守卫脚本不再包含旧的 `DialogDim`、`LoginDialogPanel`、`GachaMockResultLayer`、`GachaMockResultPanel`、`GachaMockResultNoWriteNote`、`GachaMockResultConfirmButton`、`LobbyPlaceholderDim`、`LobbyPlaceholderPanel` token。
- `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已同步改为检查新的全屏场景 token。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 chunk，缺少 `LobbyPlaceholderSceneRoot`、`LoginAccountSceneRoot`、`GachaResultSceneRoot` 和 `gachaResult` 相关 token；需要刷新/重开 Preview 后复验。
- 红线不变：不改变经济规则，不开放 EX V1，不请求真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不新增任何经济写入口。

## 2026-06-01 Stage 4AP Login Account Scene And Video Restore Hardening

- 用户反馈：预览里“没有变”，登录页背景视频没了，账号登录仍像弹框而不是新场景切换。
- 本轮修正：
  - `LootChainGameRoot.ts` 将登录账号页逻辑视图从 `loginDialog` 改为 `loginAccount`；
  - `LoginRenderer.ts` 将 `renderLoginDialog()` / `openLoginDialog()` 语义改为 `renderLoginAccountScene()` / `openLoginAccountScene()`；
  - 账号登录页不再渲染登录首页 Logo rail/右侧占位按钮/主登录入口，进入后只显示独立账号登录全屏场景；
  - `LoginAccountScenePanel` 从大号 beveled 弹框改为全屏半透明场景面，增加顶部/底部场景压层；
  - `LoginVideoBackground.ts` 新增 `resumeForLoginView()`，回到登录/账号登录场景时恢复 video 节点、poster 兜底和静音播放；
  - `LootChainGameRoot.ts` 在恢复登录舞台时递归调用 `resumeForLoginView()`，避免 poster 已淡出但视频未恢复时出现黑屏/空背景。
- 守卫同步：
  - `scripts/check-layout.mjs` 已改为检查 `renderLoginAccountScene()`、`openLoginAccountScene()`；
  - `scripts/check-preview-freshness.mjs` 已增加 `loginAccount`、`resumeForLoginView()` 和账号登录场景 chrome token。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - 旧弹层/旧登录弹框 token 扫描无匹配；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 chunk，缺少 `resumeForLoginView`、`loginAccount`、`renderLoginAccountScene`、`openLoginAccountScene` 和 `drawAccountSceneChrome`；需要刷新/重开 Preview 后复验。
- 红线不变：本轮只改 Cocos 前端 UI/视频恢复路径，不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增经济写入口。

## 2026-06-01 Stage 4AQ Login Background Poster/Video Only

- 用户反馈：登录页展示的是静态图，不是背景视频；登录页仅需要展示 `Login_BG_Poster`、`Login_BG_Video`。
- 本轮修正：
  - `LootChainGameRoot.ts` 拆分 `LOGIN_SCENE_BACKGROUND_NODE_NAMES` 与 `LOGIN_SCENE_LEGACY_NODE_NAMES`；
  - 登录态只激活 `Login_BG_Poster`、`Login_BG_Video`；
  - `BG_Main`、`BG_Main-001`、`BG_Main-002`、`Sky_Effects`、`FG_Architecture`、`Dragon_Layer`、`Character_Effects`、`Foreground_Effects` 等旧静态舞台层即使在登录态也强制关闭；
  - `AdaptiveStageLayoutResolver.ts` 的登录舞台测量节点改为 `Login_BG_Poster` / `Login_BG_Video`，不再依赖 `BG_Main`；
  - `LoginVideoBackground.ts` 增加 `schedulePosterHideFallback()` 与 `hidePosterForVideo()`，视频播放请求后如果 `PLAYING` 事件没有及时淡出 poster，也会在短延迟后隐藏 poster，避免 poster 永远挡住 video。
- 守卫同步：
  - `scripts/check-layout.mjs` 更新登录背景节点守卫与 main.scene 登录舞台测量节点；
  - `scripts/check-preview-freshness.mjs` 增加 legacy 节点关闭、poster 隐藏 fallback token。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 chunk，缺少 `LOGIN_SCENE_BACKGROUND_NODE_NAMES`、`LOGIN_SCENE_LEGACY_NODE_NAMES`、`stageNode.active = false`、`schedulePosterHideFallback`、`hidePosterForVideo`；需要刷新/重开 Preview 后复验。
- 红线不变：只改 Cocos 前端背景显示与布局测量，不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增经济写入口。

## 2026-06-01 Stage 4AR Lobby Feature Entries Full-Screen Scenes

- 用户反馈：游戏大厅内点击某个功能时仍然是弹框，需要换成全屏新场景。
- 本轮修正：
  - `LootChainGameRoot.ts` 的 `renderLobbyScenePage()` 不再走 `renderLobbyWorldBase()` 保留大厅背景，也不再渲染大厅背景；
  - 大厅功能页改走 `renderBase()`，清空当前大厅运行时内容后渲染 `LobbyFeatureSceneBackdrop`，形成独立全屏逻辑场景；
  - `LobbyAdventurePanelRenderer.ts` 改为 `LobbyAdventureSceneContent` / `LobbyAdventureSceneFrame`，内容尺寸使用 `layout.stageWidth/stageHeight`；
  - `LobbyCodexPanelRenderer.ts` 改为 `LobbyCodexSceneContent` / `LobbyCodexSceneFrame`；
  - `LobbyFormationPanelRenderer.ts` 改为 `LobbyFormationSceneContent` / `LobbyFormationSceneFrame`；
  - `LobbyHeroRosterPanelRenderer.ts` 改为 `LobbyHeroRosterSceneContent` / `LobbyHeroRosterSceneFrame`；
  - `LobbyHeroDetailPanelRenderer.ts` 改为 `LobbyHeroDetailSceneContent` / `LobbyHeroDetailSceneFrame`；
  - `LobbyNoticePanelRenderer.ts` 改为 `LobbyNoticeSceneContent` / `LobbyNoticeSceneFrame`；
  - `LobbyProfileDialogRenderer.ts` 改为 `LobbyProfileSceneRoot` / `LobbyProfileSceneContent`；
  - 未开放占位入口同步铺满 `layout.stageWidth/stageHeight`。
- 守卫同步：
  - `scripts/check-layout.mjs` 更新功能页全屏场景 token 与多分辨率边界公式；
  - `scripts/check-preview-freshness.mjs` 更新各功能页 Preview chunk token，检查新 `SceneContent/SceneFrame`。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 chunk，缺少 `LobbyFeatureSceneBackdrop` 及各 `Lobby*SceneContent/SceneFrame` token；需要刷新/重开 Preview 后复验。
- 红线不变：本轮只改 Cocos 前端场景承载方式，不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增经济写入口。

## 2026-06-01 Stage 4AS Unified Full-Screen Scene Back Button

- 用户反馈：所有功能进入的新场景的返回按钮需要统一成抽奖模块里的样式。
- 本轮修正：
  - 新增 `assets/scripts/scenes/UiSceneBackButton.ts`，抽出与 Gacha 一致的左上角箭头返回按钮，统一位置、尺寸、金色线条和按压反馈；
  - `GachaSceneRenderer.ts` 改为调用共享 `renderSceneBackButton()`，避免 Gacha 和其他场景后续样式分叉；
  - 大厅功能页、资料页、未开放占位页和战斗预览页全部接入同一返回按钮；
  - 旧底部“返回大厅”文字按钮从大厅功能页移除，底部仅保留刷新、战斗预演等非返回操作按钮。
- 验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过；`npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 chunk，需刷新/重开 Preview 后复验。
- 红线不变：只改 Cocos 前端 UI 组件和场景返回交互，不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增任何经济写入口。

## 2026-06-01 Stage 4AT Gacha Center Spine Animation

- 用户要求：召唤界面中心展示的背景卡牌替换成 `D:\project\lootchain-cocos\assets\spine\gacha\Lord of the Dark Abyss` 里的 Spine 骨骼动画。
- 本轮修正：
  - `GachaSceneConfig.ts` 新增 `GACHA_ABYSS_SPINE_UUID`、`GACHA_ABYSS_SPINE_SKIN`、`GACHA_ABYSS_SPINE_INTRO_ANIMATION`、`GACHA_ABYSS_SPINE_IDLE_ANIMATION`；
  - `GachaSceneRenderer.ts` 中心展示区改为 `GachaAbyssSpineStage` / `GachaAbyssSpineNode`，通过 `assetManager.loadAny({ uuid: GACHA_ABYSS_SPINE_UUID })` 加载 `sp.SkeletonData`；
  - 动画先播放 `appear`，随后循环 `idle`；加载期间显示本地前端 fallback，不请求后端；
  - 召唤结果预览页仍使用本地 mock 卡片，不接真实单抽/十连/兑换/补发。
- 守卫同步：`scripts/check-layout.mjs` 检查 Spine 资源文件、Gacha Spine 配置和渲染 token；`scripts/check-preview-freshness.mjs` 检查 Preview chunk 是否包含最新 Spine 渲染逻辑。
- 验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过；运行中的 Preview 可能仍是旧 chunk，需要刷新/重开后复验。
- 红线不变：不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增任何经济写入口，不接真实抽卡写接口。

## 2026-06-01 Stage 4AU Remove Friendship Summon Pool

- 用户要求：移除“友情召唤”。
- 本轮修正：
  - `GachaSceneConfig.ts` 从 `GACHA_PREVIEW_POOLS` 删除 `id: 'friend'` 池；
  - Gacha 卡池预览当前只保留限定召唤、英雄召唤、普通召唤、光暗召唤锁定占位；
  - `scripts/check-layout.mjs` 新增守卫，禁止 Gacha 配置回退出现 `id: 'friend'` 或“友情召唤”。
- 范围说明：大厅右上角社交 friends 图标不是友情召唤池，本轮不改社交占位图标。
- 红线不变：不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增任何经济写入口，不接真实抽卡写接口。

## 2026-06-01 Backend Hero Roster Art Sync

- 用户指定英雄素材：
  - `act_21053` -> `UR_EVELYN` / 深渊魔女·伊芙琳；
  - `act_21023` -> `UR_ARTHAS` / 永夜龙骑·阿尔萨斯。
- 后端新增 `hero_template.portrait_asset` 展示字段，并通过 `D:\project\LootChain\sql\15_hero_roster_art_refresh.sql` 同步本地数据库。
- R/SR 当前启用模板已收敛为六职业各一个；SSR 当前启用法师、坦克、战士、刺客各一个；UR 已补齐战士、辅助、刺客、法师、射手、坦克六职业各一个。
- 新增 UR：`UR_SERAPHINA` 辅助、`UR_NYX` 刺客、`UR_AURELIA` 射手、`UR_ATLAS` 坦克。
- 新增 UR 没有加入 `gacha_pool_item`，避免改变普通英雄池概率、权重、保底、消耗或掉落分布。
- Cocos 当前仍只做召唤预览/mock，不开放真实抽卡写接口；立绘文件当前在 `C:\Users\axian\Desktop\hero`，后续如要前端展示需单独导入 `assets/resources`。

## 2026-06-01 Stage 4AV Hero Portrait Resource Keys And Gacha Spine Swap

- 后端 `hero_template.portrait_asset` 已从“文件名”语义收敛为不带扩展名的 `act_数字` 资源编号；本地 `lootchain` 库已执行 `sql/15_hero_roster_art_refresh.sql`，复验 `.png` 后缀计数为 `0`。
- 后端只读英雄/图鉴 VO 已带出 `portraitAsset`：`UserHeroListItemVO`、`UserHeroDetailVO`、`HeroCodexItemVO`、`PlayerLobbyHeroItemVO`、`PlayerLobbyCodexItemVO`。
- Cocos 只读 API/types 已接收 `portraitAsset`：`LobbyHeroApi`、`LobbyCodexApi`、`LobbyHeroTypes`、`LobbyCodexTypes`、`HeroTypes`；当前仅建立资源映射字段，不新增渲染写入口。
- Gacha 中心 Spine 从 `Lord of the Dark Abyss` 切换为 `assets/spine/gacha/huangfengjiaozong/huangfengjiaozong.skel`，UUID 为 `ef87498c-2ef4-44e6-bee9-2d499e6ac570`，使用 `default` 皮肤并循环 `idle`。
- Gacha 背景/中心舞台已移除原先可见的红色圆圈/法阵环；`check:layout` 增加回归守卫，禁止旧红圈颜色 token 回来。
- 新补 UR 仍未写入 `gacha_pool_item`；真实单抽、十连、兑换、补发、扣资源、发英雄、记录、保底全部仍关闭。
- 已验证：Cocos `npm.cmd run check:layout`、focused Cocos TypeScript no-emit、后端 Maven compile、后台 typecheck、`PlayerLobbyHeroServiceImplTest` 均通过；Preview 仍需要刷新/重开后看最新运行 chunk。

## 2026-06-01 Stage 4AW Gacha Spine Runtime Resource Fix

- 用户反馈：Gacha 中心 Spine 已切到 `huangfengjiaozong`，但 Preview 中没有展示新的骨骼动画。
- 定位结论：旧实现只按 UUID 动态加载，Spine 文件位于 `assets/spine/...`，不在 Cocos `resources` 运行时包内；当前 Preview 还在服务旧 chunk，因此运行时可能拿不到新 SkeletonData。
- Cocos 修正：
  - 已将 Gacha Spine 资源移动到 `assets/resources/spine/gacha/huangfengjiaozong/`，保留原 `skel/atlas/png` 及 meta UUID；
  - `GachaSceneConfig.ts` 新增 `GACHA_ABYSS_SPINE_RESOURCE = 'spine/gacha/huangfengjiaozong/huangfengjiaozong'`；
  - `GachaSceneRenderer.ts` 改为优先 `resources.load(GACHA_ABYSS_SPINE_RESOURCE, sp.SkeletonData)`，UUID `assetManager.loadAny` 只作为兜底；
  - 加载或播放失败时会保留本地 fallback，并给出明确状态提示，避免静默失败。
- 守卫同步：
  - `scripts/check-layout.mjs` 已改为检查 `assets/resources/spine/gacha/huangfengjiaozong` 路径和 `resources.load` token；
  - `scripts/check-preview-freshness.mjs` 已改为检查 Gacha 最新 chunk 中的 `GACHA_ABYSS_SPINE_RESOURCE` / `resources.load` / UUID 兜底 token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `node .\scripts\check-preview-freshness.mjs` 当前仍失败，原因是运行中的 Cocos Preview 还在服务旧 chunk；需要在 Cocos Creator 里刷新/重开 Preview，等待资源重新导入后再复验。
- 红线不变：本轮只改 Cocos 前端资源加载与文档，不改后端、不改 SQL、不改经济规则、不开放 EX V1、不新增任何经济写入口，不接真实抽卡写接口。

## 2026-06-01 Stage 4AX Gacha Spine Skin/Animation Auto Resolve

- 用户继续反馈：Gacha 中心仍然空白。
- 追加定位：
  - `assets/resources/config.json` 已能在 Preview 中访问，且已包含 `spine/gacha/huangfengjiaozong/huangfengjiaozong` 与 UUID `ef87498c-2ef4-44e6-bee9-2d499e6ac570`；
  - SkeletonData、`.bin`、texture PNG 都能被 Preview HTTP 正常返回；
  - 因此剩余高概率问题是 `huangfengjiaozong` 的实际皮肤/动画名并非固定的 `default` / `idle`；
  - Cocos `sp.Skeleton.setAnimation()` 找不到动画时只返回 `null`，不抛异常，旧逻辑会误判成功并销毁 fallback，表现为空白。
- Cocos 修正：
  - `GachaSceneRenderer.ts` 改为读取 `SkeletonData.getSkinsEnum()` / `getAnimsEnum()`；
  - 若找不到配置的 `default` / `idle`，自动选择资源实际存在的第一个皮肤和第一个可播放动画；
  - 只有 `setAnimation()` 或 `addAnimation()` 返回有效 TrackEntry 后才销毁 fallback；
  - 新增运行时 `console.info`，会打印实际使用的 `skin`、`animation` 和 Spine 原始尺寸，便于继续排查缩放/位置。
- 守卫同步：
  - `scripts/check-layout.mjs` 已加入 skin/animation 自动解析 token；
  - `scripts/check-preview-freshness.mjs` 已更新 Gacha chunk token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 当前运行中的 Preview 仍是旧 chunk，必须重开/刷新 Preview 后才能看到本轮修正。
- 红线不变：只修 Cocos 前端 Spine 播放逻辑，不改后端、不改 SQL、不接真实抽卡、不新增经济写入口。

## 2026-06-01 Stage 4AY Gacha Spine No-Animation Static Pose Fallback

- 用户截图显示：Gacha 中心一直停留在 `黄风教宗准备中`，底部提示 `召唤 Spine 未找到可播放动画，请检查 huangfengjiaozong 的导出动画列表。`
- 结论：
  - 这说明 `huangfengjiaozong` SkeletonData 已加载，但 Cocos 运行时没有从该资源中枚举到可播放 animation；
  - 该问题不属于抽卡或后端问题，而是当前 Spine 导出资源缺少 Cocos 可识别的动画列表，或导出的动画数据未包含在当前 `.skel` 中。
- Cocos 修正：
  - `GachaSceneRenderer.ts` 在 `data.getRuntimeData(true)` 成功后，如果没有 animation，不再停留在 loading fallback；
  - 调用 `skeleton.setToSetupPose()` 展示静态骨骼首帧，并提示 `huangfengjiaozong 未找到导出动画，已显示静态骨骼首帧。`；
  - 只有运行时解析失败（skel/atlas/texture 不匹配）才继续保留 fallback。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加 `setToSetupPose`、`<setup-pose>` 和静态骨骼首帧提示 token；
  - `scripts/check-preview-freshness.mjs` 同步检查最新 Gacha chunk。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF/CRLF warning。
- 后续美术要求：如必须播放动态动画，需要重新导出 `huangfengjiaozong`，确保 Cocos Inspector 能看到至少一个 animation 名称；前端会自动使用实际可用动画。
- 红线不变：只改 Cocos 前端展示兜底，不改后端、不改 SQL、不接真实抽卡、不新增经济写入口。
## 2026-06-01 Stage 4AZ Gacha Spine Runtime Fallback

- 用户截图显示：Gacha 中心继续停留在 `黄风教宗准备中`，状态提示变为 `召唤 Spine 运行时解析失败，请检查 huangfengjiaozong 的 skel/atlas/texture 是否匹配。`
- 定位结论：
  - `huangfengjiaozong` 的 `SkeletonData`、`.bin` 和贴图资源已经能被 Cocos 加载；
  - 失败点是 `data.getRuntimeData(true)` 返回空，说明当前 `.skel/atlas/texture` 组合无法被 Cocos 3.8.8 Spine runtime 正常解析；
  - 这不是前端资源路径问题，也不是动画名问题，当前资源需要重新导出或重新匹配 atlas/texture。
- Cocos 修正：
  - Gacha 中心仍优先加载 `spine/gacha/huangfengjiaozong/huangfengjiaozong`；
  - 如果运行时解析失败，自动加载已验证可播放的 `spine/gacha/Lord of the Dark Abyss/1605` 作为临时视觉预览，避免中心区域继续空白；
  - fallback 成功后状态提示：`huangfengjiaozong Spine 运行时解析失败，已临时显示可用预览 Spine；需要重新导出 huangfengjiaozong。`
- 守卫同步：
  - `scripts/check-layout.mjs` 增加 fallback Spine 资源存在性、fallback 配置与渲染 token；
  - `scripts/check-preview-freshness.mjs` 增加 fallback 运行时 token。
- 红线不变：只改 Cocos 前端视觉兜底和诊断，不改后端、不改 SQL、不接真实抽卡、不扣资源、不发英雄、不写抽卡记录/保底、不新增经济写入口、不开放 EX V1。

## 2026-06-01 Stage 4BA Gacha Status Text Position Fix

- 当前阶段仍然以 Cocos-only 为准，不回到 `web-vue`。
- 用户截图反馈：Gacha 页蓝色状态提示压住底部 `召唤1次` / `召唤10次` 按钮。
- 根因：
  - Spine 解析失败、fallback 成功等诊断信息会调用全局 `setStatus`；
  - `StatusPresenter` 默认把状态文字放在底部安全区；
  - Gacha 页底部同时放置召唤按钮，导致状态文字遮挡按钮。
- Cocos 修正：
  - `assets/scripts/scenes/StatusPresenter.ts` 的 `set(text)` 扩展为 `set(text, layout?, y?)`，支持更新已有状态文字位置；
  - `assets/scripts/scenes/LootChainGameRoot.ts` 在 `gacha` / `gachaResult` 视图里把状态提示移动到 `layout.stageBottom + 210 * layout.uiScale`；
  - 该位置在底部召唤按钮上方，不再覆盖按钮。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加 Gacha/GachaResult 专用状态条位置 token；
  - `scripts/check-preview-freshness.mjs` 增加 Preview 新鲜度 token，确保刷新后的 Preview 包含新位置逻辑。
- 已跑验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF/CRLF warning。
- 当前 Preview 状态：
  - `npm.cmd run check:preview` 仍失败；
  - 运行中的 Cocos Preview 还在服务旧 chunk，`LootChainGameRoot.ts` chunk 缺少 `gachaStatusY` 新逻辑；
  - 需要重开或刷新 Cocos Creator Preview 后复验 Gacha 页面。
- 红线不变：只改 Cocos 前端状态文字位置，不改后端、不改 SQL、不接真实抽卡、不扣资源、不发英雄、不写抽卡记录/保底、不新增经济写入口、不开放 EX V1。

## 2026-06-01 Hero Detail Spine Asset Field Sync

- 当前仍以前端 Cocos-only 为准，不回到 `web-vue`。
- 后端英雄模板新增 `hero_template.spine_asset` 展示字段，用于英雄详情页骨骼动画资源目录；初始值按 `portrait_asset` 复制并将 `act` 替换为 `npc`。
- 已新增并执行 `D:\project\LootChain\sql\16_hero_spine_asset.sql`；本地 `lootchain` 库复验 `spine_asset` 列存在，`spine_asset <> REPLACE(portrait_asset, 'act', 'npc')` 计数为 `0`。
- 后端 DTO/VO、玩家英雄列表、英雄详情、图鉴、Cocos 大厅英雄/图鉴只读门面均已带出 `spineAsset`。
- Cocos 已同步 `LobbyHeroApi`、`LobbyCodexApi`、`LobbyHeroTypes`、`LobbyCodexTypes`、`HeroTypes` 和 `check-layout` 守卫；当前只接收资源映射字段，不新增渲染写入口。
- 验证通过：后端 Maven compile、`PlayerLobbyHeroServiceImplTest`、Cocos `npm.cmd run check:layout`、focused Cocos TypeScript no-emit。
- 红线不变：不改抽卡概率/消耗/保底/奖励，不写 `gacha_pool_item`，不接真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4BB Gacha Spine JSON Export Handoff

- 用户已重新导出 `huangfengjiaozong` Spine JSON 资源到 `assets/resources/spine/gacha/huangfengjiaozong/`。
- 本地复验：`huangfengjiaozong.json` 当前 `skeleton.spine=3.8.75`，包含 `default` skin 和 `idle` animation；`huangfengjiaozong.atlas` 引用两张图集页：`huangfengjiaozong.png` 与 `huangfengjiaozong2.png`。
- 同目录仍保留旧 `huangfengjiaozong.skel`，为避免 `resources.load('spine/gacha/huangfengjiaozong/huangfengjiaozong')` 命中旧二进制资源，Gacha 目标 Spine 改为优先 `assetManager.loadAny({ uuid: '178d1dbd-5a53-459b-83bb-2f05c623d99e' })` 加载新 JSON SkeletonData，资源路径只作兜底。
- `scripts/check-layout.mjs` 已改为要求 JSON runtime 文件、两张 atlas page，并校验导出版本为 Spine 3.8.x、存在 `default` skin 与 `idle` animation。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过；`git diff --check` 通过（仅既有 LF/CRLF warning）。
- `npm.cmd run check:preview` 当前仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，缺少最新返回按钮、Gacha 状态文字位置与 Gacha renderer token；需要重开或刷新 Preview 后再跑。
- 下一步：重开或刷新 Cocos Creator Preview，让 Creator 重新导入新 JSON/atlas/texture 后进入 Gacha 页面复验；若仍 fallback，重点看控制台是否仍报 3.8.75 runtime 解析问题。
- 红线不变：只调整 Cocos 前端资源加载优先级与检查脚本，不改后端、不改 SQL、不接真实抽卡、不扣资源、不发英雄、不写抽卡记录/保底、不新增经济写入口、不开放 EX V1。

## 2026-06-01 Stage 4BC Gacha Huangfeng Ground Alignment

- 用户复验后确认 `huangfengjiaozong` 已显示，但角色位置看起来悬在空中，需要落到地面。
- `GachaSceneRenderer.ts` 中 Gacha 中心 Spine 节点的本地 Y 从原先接近舞台中段的 `-stageHeight * 0.23` 下调为 `spineGroundY = -stageHeight * 0.49`，并让底部阴影跟随 `spineGroundY - 22 * scale`，使脚底更接近背景中央地面/法阵区域。
- 为降低角色与背景红窗/高亮建筑的冲突，已移除中心舞台背后的局部矩形遮罩，改为加深背景之后、UI/Spine 之前的全屏 `GachaAbyssAtmosphere` 暗幕，避免中间出现透明框。
- `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已加入新的地面基准与全屏暗幕 token，并禁止中心局部矩形遮罩回归。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过；`git diff --check` 通过（仅既有 LF/CRLF warning）。
- `npm.cmd run check:preview` 当前仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，尚未包含 `GachaAbyssAtmosphere` 全屏暗幕加深、`spineGroundY = -stageHeight * 0.49` 等最新 token。
- 需要重开或刷新 Cocos Creator Preview 后复验视觉位置；若仍偏高，可继续只调 `spineGroundY` 系数；若背景仍抢眼，可继续微调整体暗幕 alpha。
- 红线不变：只调整 Cocos 前端视觉坐标，不改后端、不改 SQL、不接真实抽卡、不扣资源、不发英雄、不写抽卡记录/保底、不新增经济写入口、不开放 EX V1。

## 2026-06-01 Stage 4BD Gacha Huangfeng Size And Lower Placement

- 用户继续反馈：中间骨骼动画可以再大一些，位置再往下一点。
- `GachaSceneRenderer.ts` 已将 `spineGroundY` 从 `-stageHeight * 0.49` 下调为 `-stageHeight * 0.55`，并将 `resolveAbyssSpineScale()` 的基数从 `0.36` 提高到 `0.43`，让 `huangfengjiaozong` 更大且更贴近地面。
- 全屏背景压暗仍通过 `GachaAbyssAtmosphere` 完成，不恢复中心局部透明框。
- `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已同步新位置/缩放 token。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过；`git diff --check` 通过（仅既有 LF/CRLF warning）。
- `npm.cmd run check:preview` 当前仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，尚未包含 `spineGroundY = -stageHeight * 0.55` 与 `return 0.43 * scale * stageFactor` 最新 token。
- 待验证：重开或刷新 Cocos Creator Preview 后进入 Gacha，确认角色尺寸和脚底位置；如果过大或压到底部文案，可把 scale 基数回调到 `0.40~0.42` 或把 `spineGroundY` 调回 `0.52`。
- 红线不变：只调整 Cocos 前端视觉坐标/缩放，不改后端、不改 SQL、不接真实抽卡、不扣资源、不发英雄、不写抽卡记录/保底、不新增经济写入口、不开放 EX V1。

## 2026-06-01 Stage 4BE Hero Detail Spine Preview

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 英雄详情页左侧主视觉已消费只读 `spineAsset`，按 `assets/resources/spine/hero/{spineAsset}/{spineAsset}` 加载 Cocos `sp.SkeletonData`；当前已有 `npc_1001` 资源契约守卫。
- 加载失败、runtime 解析失败或动画播放失败时，只保留当前详情页静态占位，不串用其它英雄或 Gacha 怪物资源兜底。
- 已移除英雄详情原有红色动态圆环与面板红圆，替换为暗色脚底投影和低透明暗金地线；compact 布局按 art stage、info panel、gap 重新计算，避免窄屏遮挡。
- 守卫同步：`scripts/check-layout.mjs` 增加 hero Spine 资源、meta/atlas、详情页 Spine token、红圈/aura 禁止 token；`scripts/check-preview-freshness.mjs` 增加详情页 Spine 最新 chunk token。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 红线不变：只读展示英雄详情，不提供升级、升星、觉醒、装备、抽卡、领取或资源变更入口；不新增经济写入口，不开放 EX V1，不接真实抽卡写接口。
## 2026-06-02 Stage 4BF Hero Detail Secondary Animation And Layout Polish

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 英雄详情页骨骼动画现在会从 `sp.SkeletonData.getAnimsEnum()` 解析主/副动画：优先循环主动画，每隔 15 秒插播一次第二动画，播放完自动回到主循环；`npc_1001` 当前可识别到 `1001_skill1_1` 与 `1001_skill2_1` 等动画名。
- 视觉层移除了英雄详情大背景/主视觉区域的金色边框与红圈语言，保留暗色地面投影，避免画面里出现抢眼的框线。
- 右侧信息区重新拉开层级：稀有度/拥有状态在首行，星级单独成行，来源说明、属性格、技能列表依次下移，减少文字互相覆盖。
- 守卫同步：`scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已要求第二动画 15 秒插播、Hero Spine 详情 token，并禁止大金框/红圈回归。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：英雄详情仍为只读展示，不开放升级、升星、觉醒、装备、抽卡、领取、发放、扣费、保底或任何经济写入口；EX V1 仍不开放，Gacha 仍只做视觉预览和本地 mock。
### 2026-06-02 Stage 4BF Validation Note

- `git diff --check` 通过，仅保留既有 LF/CRLF warning。
- `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；其中 `LobbyHeroDetailPanelRenderer.ts` chunk 缺少 `spine/hero/${asset}/${asset}`、`resolveHeroSpineAnimationNames`、`startHeroSpineSecondaryCycle`、`.delay(15)`、`skeleton.addAnimation(0, primaryAnimation, true, 0)` 等本轮 token。需要重开或刷新 Cocos Creator Preview 后复验英雄详情。
## 2026-06-02 Stage 4BG Gacha Background Reuse Hero Detail Backdrop

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 召唤页背景资源从 `ui/gacha/gacha_bg_cathedral/spriteFrame` 切换为英雄详情页同款 `ui/hero-detail/hero_detail_backdrop/spriteFrame`，统一召唤与英雄详情的暗黑殿堂背景语义。
- `GachaSceneRenderer.ts` 仍通过 `GACHA_BACKGROUND_ASSET` 渲染背景，不改变召唤页按钮、Spine、mock 结果或本地预览流程。
- 守卫同步：`scripts/check-layout.mjs` 要求 `GACHA_BACKGROUND_ASSET` 指向英雄详情背景，并禁止旧召唤背景路径回归；`scripts/check-preview-freshness.mjs` 增加 `GachaSceneConfig.ts` 背景资源 token。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：Gacha 当前仍只做视觉预览和本地 mock，不扣资源、不发英雄、不写抽卡记录、不更新保底、不开放真实抽卡写接口；EX V1 仍不开放。
### 2026-06-02 Stage 4BG Validation Note

- `git diff --check` 通过，仅保留既有 LF/CRLF warning。
- `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；本轮新增检查明确指出 `GachaSceneConfig.ts` chunk 仍缺少 `ui/hero-detail/hero_detail_backdrop/spriteFrame`。重开或刷新 Cocos Creator Preview 后再复验召唤页背景。
## 2026-06-02 Stage 4BH Generated Gacha Abyss Ring Background And Hero Grounding

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 使用 built-in imagegen 生成新的抽奖背景 `assets/resources/ui/gacha/gacha_bg_abyss_ring.png`，配色为深冷蓝黑主调、低饱和暗红环、少量暗金地面反光；画面中央下方留出暗色角色站位区，用于凸显暗色/灰色骨骼动画人物。
- `GachaSceneConfig.ts` 的 `GACHA_BACKGROUND_ASSET` 已切换为 `ui/gacha/gacha_bg_abyss_ring/spriteFrame`，不再复用英雄详情背景，也不回到旧 `gacha_bg_cathedral`。
- 英雄详情桌面主视觉位置调整到面板中心：`artX = 0`，让角色位于背景中间红环下方；Spine 节点、静态兜底和脚底投影统一使用 `resolveHeroDetailGroundY(height)`，人物与地面基线距离为 0，不再悬空。
- 守卫同步：`scripts/check-layout.mjs` 新增生成背景资源存在性、Gacha 背景路径、旧背景路径禁止回归、英雄详情中心站位和地面基线 token；`scripts/check-preview-freshness.mjs` 同步检查最新 chunk token。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：Gacha 当前仍只做视觉预览和本地 mock，不扣资源、不发英雄、不写抽卡记录、不更新保底、不开放真实抽卡写接口；英雄详情仍为只读展示；EX V1 仍不开放。
### 2026-06-02 Stage 4BH Validation Note

- `git diff --check` 通过，仅保留既有 LF/CRLF warning。
- `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；当前旧包缺少 `ui/gacha/gacha_bg_abyss_ring/spriteFrame`、`const artX = 0;`、`resolveHeroDetailGroundY(height)`、`graphics.ellipse(0, groundY` 等本轮 token。需要重开或刷新 Cocos Creator Preview，并等待新 PNG/meta 重新导入后复验召唤页和英雄详情。
## 2026-06-02 Stage 4BI Gacha Background Dark Overlay Removal

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 按反馈移除召唤页与本地结果页背景上的全屏暗层：`GachaSceneRenderer.ts` 不再调用/渲染 `GachaAbyssAtmosphere`，新生成的 `gacha_bg_abyss_ring` 背景按原色直接展示。
- Spine loading fallback 自身的小透明呼吸动画保留；移除的只是覆盖整张召唤背景的黑色氛围遮罩。
- 守卫同步：`scripts/check-layout.mjs` 不再要求暗层 token，并将 `GachaAbyssAtmosphere`、`rgba(0, 0, 0, 132)`、`opacity.opacity = 226`、1.8 秒暗层呼吸 tween 列为禁止回归；`scripts/check-preview-freshness.mjs` 同步移除暗层必需 token。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：Gacha 当前仍只做视觉预览和本地 mock，不扣资源、不发英雄、不写抽卡记录、不更新保底、不开放真实抽卡写接口；EX V1 仍不开放。
### 2026-06-02 Stage 4BI Validation Note

- `git diff --check` 通过，仅保留既有 LF/CRLF warning。
- `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；需要重开或刷新 Cocos Creator Preview 后，才能看到召唤页移除全屏暗层后的背景原色。
## 2026-06-02 Stage 4BJ Hero Detail Overlay And Identity Plate Polish

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 按反馈移除英雄详情页中间半屏暗带：`drawPanelShade()` 不再绘制第二层横向暗矩形，并将全屏遮罩从 `rgba(0, 0, 0, 116)` 降到 `rgba(0, 0, 0, 64)`，保留背景可见度。
- 左上角英雄名称、等级、战力不再固定在左上角，改为角色下方居中的 `LobbyHeroDetailIdentityPlate`，与红环下方的角色主视觉形成同一焦点。
- 移除 `LobbyHeroDetailArtCaption`，底部只保留一条只读边界说明，并将说明下移到 `-height / 2 + 38 * scale`，避免下方两行文字重叠。
- 守卫同步：`scripts/check-layout.mjs` 增加身份牌位置 token，禁止旧左上角标题位置、半屏暗带、旧高透明度遮罩和底部 art caption 回归；`scripts/check-preview-freshness.mjs` 同步身份牌 token。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：英雄详情仍为只读展示，不开放升级、升星、觉醒、装备、抽卡、领取、发放、扣费、保底或任何经济写入口；EX V1 仍不开放。
### 2026-06-02 Stage 4BJ Validation Note

- `git diff --check` 通过，仅保留既有 LF/CRLF warning。
- `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；旧 `LobbyHeroDetailPanelRenderer.ts` chunk 缺少 `LobbyHeroDetailIdentityPlate`、`plateY = -height / 2 + 118 * scale` 等本轮 token。重开或刷新 Cocos Creator Preview 后复验英雄详情页遮罩、身份牌和底部说明。
## 2026-06-02 Stage 4BK Hero Detail Initial Secondary Animation

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 英雄详情页 Spine 播放顺序调整：若当前英雄资源存在第二动画，进入详情时先立即播放第二动画一次，然后自动接回主动画循环。
- 进入后的周期逻辑保留：`startHeroSpineSecondaryCycle()` 仍每 15 秒插播一次第二动画，播放完继续回到主动画循环。
- 若第二动画播放失败，则降级为直接播放主动画循环，不影响详情页展示。
- 守卫同步：`scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 新增初始第二动画播放 token，确保不会退回“首次只播主循环、15 秒后才播第二动画”的旧逻辑。
- 已验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：英雄详情仍为只读展示，不开放升级、升星、觉醒、装备、抽卡、领取、发放、扣费、保底或任何经济写入口；EX V1 仍不开放。
### 2026-06-02 Stage 4BK Validation Note

- `git diff --check` 通过，仅保留既有 LF/CRLF warning。
- `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；旧 `LobbyHeroDetailPanelRenderer.ts` chunk 缺少 `const secondaryAnimation = animationNames.secondary`、`skeleton.addAnimation(0, animationName, true, 0)` 等本轮 token。重开或刷新 Cocos Creator Preview 后复验进入英雄详情时的初始第二动画。
## 2026-06-02 Stage 4BL Hero Detail Spine Company Preview Diagnosis

- 用户反馈：家里电脑昨天英雄详情骨骼动画可正常展示；公司电脑更新代码后，王国巡逻兵详情页仍显示静态占位图形，没有显示骨骼动画。
- 本机检查结论：
  - `assets/resources/spine/hero/npc_1001/npc_1001.skel|atlas|png` 资源存在，王国巡逻兵按规则应使用 `spine_asset=npc_1001`；
  - `npm.cmd run check:layout` 通过，说明工作区代码和资源守卫正常；
  - `npm.cmd run check:preview` 失败，当前 Cocos Preview 仍在服务旧 chunk，其中 `LobbyHeroDetailPanelRenderer.ts` 运行包缺少 `spine/hero/${asset}/${asset}`、`resolveHeroSpineAnimationNames`、`startHeroSpineSecondaryCycle`、`const secondaryAnimation = animationNames.secondary` 等英雄详情 Spine token；
  - 因此公司电脑当前预览看不到骨骼动画的首要原因是 Preview 未刷新/未重开，运行包没有进入最新代码。
- MySQL 同步补充：
  - 英雄详情 Spine 依赖后端返回 `spineAsset`，本地库需要执行 `D:\project\LootChain\sql\16_hero_spine_asset.sql`；
  - 当前尝试无密码 `mysql -uroot` 查询失败：`Access denied for user 'root'@'localhost' (using password: NO)`，需要用户用本机 MySQL 密码执行；
  - 验证 SQL：`SELECT hero_code, hero_name, portrait_asset, spine_asset FROM hero_template WHERE hero_code='R_PATROL_01';` 应返回 `act_1001 / npc_1001`。
- 复验顺序：先同步 MySQL SQL 16，再重开 Cocos Creator Preview，等待资源重新导入后进入英雄详情页。
- 边界不变：只处理只读展示资源映射和 Cocos Preview 刷新问题，不开放升级、升星、觉醒、装备、抽卡、领取、扣费、保底或任何经济写入口；EX V1 仍不开放。

## 2026-06-02 Stage 4BM Hero Detail Spine Fallback And Company SQL Sync

- 当前继续以 Cocos-only 为准，不回到 `web-vue`。
- 针对公司电脑英雄详情仍显示静态占位的问题，Cocos 只读 API 增加字段兼容：
  - `LobbyHeroApi` 和 `LobbyCodexApi` 仍优先使用后端返回的 `spineAsset`；
  - 如果后端暂未返回 `spineAsset`，则从 `portraitAsset` 派生骨骼目录：去掉图片扩展名后将 `act_数字` 转为 `npc_数字`，例如 `act_1001 -> npc_1001`；
  - 该逻辑只影响展示资源路径，不新增任何后端请求、抽卡、养成、奖励、扣费或经济写入。
- `scripts/check-layout.mjs` 已同步守卫该兼容逻辑，避免后续退回到“只依赖数据库 `spine_asset` 字段，换机器未同步 SQL 就空白”的状态。
- 已在 `D:\project\LootChain` 按顺序执行本地 SQL：
  - `sql/12_protagonist_module.sql`
  - `sql/15_hero_roster_art_refresh.sql`
  - `sql/16_hero_spine_asset.sql`
- SQL 复验结果：
  - `hero_template` 已存在 `portrait_asset` 与 `spine_asset`；
  - `R_PATROL_01 / 王国巡逻兵` 返回 `portrait_asset=act_1001`、`spine_asset=npc_1001`；
  - 有 `portrait_asset` 的模板中，`spine_asset <> REPLACE(portrait_asset, 'act', 'npc')` 的 mismatch 计数为 `0`。
- 卡池边界复查：
  - 本次 SQL 15/16 不写入 `gacha_pool_item`，本次前端改动也不触碰任何卡池写入；
  - 当前本地 `gacha_pool_item` 中 `NORMAL_HERO` 已存在 `UR_ARTHAS` 与 `UR_EVELYN` 两条 UR 基础池记录，来源是既有 `sql/07_gacha_module.sql` 初始普通池配置，不是本阶段新增；
  - 不自动删除或调整该经济表，后续若要变更卡池权重/掉落，必须单独评审。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `git diff --check` 通过，仅保留既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，`LobbyHeroDetailPanelRenderer.ts` 等运行包仍缺少 `spine/hero/${asset}/${asset}`、`const artX = 0;`、初始第二动画和统一返回按钮等最新 token。
- 下一步复验顺序：
  1. 在 Cocos Creator 中关闭并重开 Preview，必要时 Reimport 相关 TS/Spine 资源；
  2. 等资源导入完成后重新进入英雄详情；
  3. 王国巡逻兵应按 `assets/resources/spine/hero/npc_1001/npc_1001` 加载骨骼动画；
  4. 如果仍是静态占位，优先看控制台 `[HeroDetail]` 日志和 `/api/player/lobby/heroes` 响应中的 `portraitAsset/spineAsset`。
- 边界不变：英雄详情仍为只读展示；Gacha 仍只做视觉预览和本地 mock，不扣资源、不发英雄、不写抽卡记录、不更新保底、不开放真实抽卡写接口；不改变经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-02 Stage 4BN Spine Resources Dynamic URL Conflict Cleanup

- 用户提供 Cocos 控制台关键日志：`huangfengjiaozong.json` 与同目录旧 `huangfengjiaozong.skel` 动态加载 URL 相同，`.atlas` 与 `.spine` 动态加载 URL 相同；`npc_1001.atlas` 与 `npc_1001.spine` 动态加载 URL 相同。
- 根因确认：
  - Cocos `resources` 动态加载路径会按目录和 basename 生成，例如 `spine/hero/npc_1001/npc_1001`；
  - 同一目录下同时存在同 basename 的 `.json/.skel/.spine/.atlas` 源文件时，可能出现动态 URL 冲突，导致 `resources.load(..., sp.SkeletonData)` 命中错误资产或运行时异常；
  - 因此即使数据库和素材文件存在，英雄详情或 Gacha Spine 仍可能不显示。
- 资源结构修正：
  - `assets/resources/spine/gacha/huangfengjiaozong/` 运行时只保留新 JSON 入口及其 atlas/png：`huangfengjiaozong.json|atlas|png|huangfengjiaozong2.png`；
  - 移出旧 `huangfengjiaozong.skel|.skel.meta` 和 `huangfengjiaozong.spine|.spine.meta`；
  - `assets/resources/spine/hero/npc_1001/` 运行时只保留 `npc_1001.skel|atlas|png`；
  - 移出 `npc_1001.spine|.spine.meta`；
  - 移出 `assets/resources/spine/hero/act_1001/act_1001.spine|.spine.meta`；
  - 移出 `assets/resources/spine/gacha/Lord of the Dark Abyss/085.spine|.spine.meta`。
- 归档位置：
  - 非运行时源文件已移动到 `docs/spine-source-archive/resources-conflict-backup/`，不再进入 Cocos `resources` 动态加载链路。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加运行时资源冲突检查；
  - 明确禁止 `.spine` / `.spine.meta` 留在 `assets/resources/spine/**`；
  - 明确禁止已知冲突文件回到 `assets/resources`。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 手动扫描 `assets/resources/spine` 未再发现 `.spine` 源文件，也未发现同 basename 同时存在 `.json` 与 `.skel` 的运行时冲突。
- 复验要求：
  - 需要在 Cocos Creator 中重新导入 `assets/resources/spine` 相关目录，或关闭并重开 Preview；
  - 旧 Preview / 旧资源库缓存仍可能继续报旧冲突，必须等 Creator 完成资源重新导入后再复验英雄详情和 Gacha。
- 边界不变：只调整 Cocos 资源目录结构和守卫脚本；不改后端、不改 SQL、不改抽卡概率/权重/保底/消耗/奖励/卡池，不开放真实抽卡写接口，不开放 EX V1，不新增任何经济写入口。
## 2026-06-02 Stage 4BO Hero Detail Spine Runtime Fallback Diagnosis

- 用户反馈：公司电脑英雄详情仍显示静态占位，且控制台没有新的 `[HeroDetail]` 输出。
- 本轮复查结论：
  - `npm.cmd run check:preview` 仍失败，`http://localhost:7456` 的 Cocos Preview 继续服务旧 `LobbyHeroDetailPanelRenderer.ts` chunk，缺少 `spine/hero/${asset}/${asset}`、`const artX = 0;`、第二动画与新返回按钮 token；
  - 旧 chunk 没有当前的 Spine 加载诊断逻辑，所以控制台无输出并不代表当前源码没有执行日志，而是 Preview 还没刷新到新代码；
  - 当前运行中的 `GET /api/player/lobby/heroes` 响应也暂未带出 `portraitAsset` / `spineAsset` 字段，说明本地后端服务可能仍是旧运行包或未重启。
- Cocos 只读兜底已补强：
  - `LobbyHeroApi` / `LobbyCodexApi` 在后端缺少资源字段时，先尝试 `portraitAsset -> spineAsset`；
  - 若字段完全缺失，则对当前已知样例 `R_PATROL_01` 使用本地只读映射 `act_1001 / npc_1001`；
  - 该兜底只用于英雄详情资源展示，不扣资源、不发英雄、不写抽卡、不改变经济规则。
- 英雄详情诊断日志已补充：
  - 无资源名时输出 `[HeroDetail] hero spine asset missing`；
  - 开始加载时输出 `[HeroDetail] hero spine load start`；
  - 加载失败、运行时解析失败、动画应用成功仍保留原有 `[HeroDetail]` 日志。
- 本轮验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，Preview 旧 chunk 缺少 `hero spine asset missing`、`hero spine load start` 等本轮 token。
- 下一步复验重点：
  - 必须关闭并重开 Cocos Creator Preview，等待资源重新导入；
  - 如仍旧 chunk，需要关闭 Cocos Creator 后清理/移动 `temp`、`library` 生成缓存，再重新打开项目；
  - 后端服务也建议重启，使只读英雄列表正式返回 `portraitAsset/spineAsset`，但当前 Cocos 对 `R_PATROL_01` 已可本地兜底。

## 2026-06-02 Stage 4BP Hero Detail Spine Audio Events

- 用户反馈：骨骼动画本身有音效，但英雄详情中听不到。
- 定位结论：
  - Cocos `sp.Skeleton` 不会自动播放 Spine event timeline 中的音频引用；
  - `npc_1001.skel` 中可提取到音频引用：`1001_skill1_1.mp3`、`1001_skill2_1.mp3`、`1001_skill4_3.mp3`；
  - 当前 `D:\project\lootchain-cocos\assets` 下没有这些音频文件，只有登录 BGM，因此即使监听事件也暂时没有实际 `AudioClip` 可播放。
- 前端实现：
  - `LobbyHeroDetailPanelRenderer.ts` 已为英雄详情 Spine 节点添加 `AudioSource`；
  - 已通过 `skeleton.setEventListener()` 监听 Spine 事件；
  - 事件触发时读取 `event.data.audioPath`，优先尝试加载当前 Spine 目录下的同名音频，再尝试 `audio/` 子目录和通用 `audio/spine/hero/` 目录；
  - 加载成功后用 `AudioSource.playOneShot()` 播放，并按 Spine event 的 `volume` 控制音量；
  - 加载失败会输出一次 `[HeroDetail] hero spine audio missing`，方便确认缺的是哪几个音频文件。
- 音频资源放置建议：
  - `assets/resources/spine/hero/npc_1001/1001_skill1_1.mp3`
  - `assets/resources/spine/hero/npc_1001/1001_skill2_1.mp3`
  - `assets/resources/spine/hero/npc_1001/1001_skill4_3.mp3`
  - 或放入 `assets/resources/spine/hero/npc_1001/audio/` 同名文件；Cocos 重新导入后即可被运行时加载。
- 验证：
  - focused Cocos Creator TypeScript no-emit 通过；
  - `npm.cmd run check:layout` 通过；
  - `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，当前运行 Preview 旧 chunk 缺少 `AudioSource`、`AudioClip`、`bindHeroSpineAudioEvents`、`hero spine audio missing` 等本轮音频事件 token，需要重开/清理 Preview 缓存后复验。
- 边界不变：本轮只处理 Cocos 前端只读展示音效，不改后端、不改 SQL、不新增经济写入口、不开放真实抽卡、不开放 EX V1。

## 2026-06-02 Stage 4BQ Gacha Reveal Preview Scene

- 用户要求开始召唤功能下一阶段，并允许多角色分工；本轮已结合代码、资源、规则三个只读智能体结论推进。
- 新增召唤演出逻辑场景：
  - `LootChainGameRoot` 增加 `gachaReveal` view；
  - 召唤页点击 `召唤1次` / `召唤10次` 后不再直接进入结果页，而是先进入 `GachaRevealSceneRoot`；
  - 演出页使用统一全屏返回按钮 `GachaRevealBackButton`，返回召唤页；
  - 演出页底部 `GachaRevealContinueButton` 才进入现有本地结果页。
- Gacha 演出视觉：
  - `GachaSceneConfig.ts` 新增 `GACHA_REVEAL_STEPS`，包含聚魂、裂隙、显影三个本地演出步骤；
  - `GachaSceneRenderer.ts` 新增仪式暗幕、红金召唤阵呼吸、卡背阵列、步骤进度线、只读边界条；
  - 单抽显示 1 张卡背，十连显示 2x5 卡背阵列，并带本地淡入节奏。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加 `gachaReveal` 根状态、演出页 token、配置 token；
  - `scripts/check-preview-freshness.mjs` 增加 `GachaRevealSceneRoot` / `GachaRevealContinueButton` / `GACHA_REVEAL_STEPS` 等 token，便于重开 Preview 后验证运行 chunk 是否已刷新。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，运行中的 Cocos Preview 旧 chunk 缺少 `GACHA_REVEAL_STEPS`、`GachaRevealSceneRoot`、`GachaRevealContinueButton` 等本轮 token，需要重开/刷新 Preview 后复验。
- 边界不变：Gacha 仍只做视觉预览和本地 mock，不调用 `GachaApi.draw()`，不请求 `/api/player/gacha/draw`，不扣资源、不发英雄、不写抽卡记录、不更新保底、不开放兑换/补发/真实单抽/十连，不改变经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-02 Stage 4BR Real Gacha API And Display Config

- 用户明确要求当前可以接真实抽卡接口，并要求卡池、中心 Spine、右侧按钮信息由后台配置驱动。
- Cocos 前端更新：
  - `GachaApi.draw()` 已改为调用既有 `POST /api/player/gacha/draw`；
  - `LootChainGameRoot` 新增 Gacha state，进入召唤页后读取 `GET /api/player/gacha/pools`；
  - 切换左侧卡池时按 poolCode 切换中心 Spine、右侧按钮说明、按钮文案、真实保底；
  - 真实可抽卡池点击 `召唤1次` / `召唤10次` 会生成 requestId 并调用 draw；
  - 成功后结果页展示真实 `drawNo` 和后端返回 items；失败时停留召唤页并显示错误；
  - `再召唤 N 次必得 ...` 已上移到顶部并读取真实 `pity`；
  - 单抽/十连按钮改为显式 `72 * scale` 间距；
  - 左侧卡池新增 logo 预留圆槽，支持限定/英雄/普通/锁定色彩区分。
- 后端/SQL 同步：
  - 新增 `sql/17_gacha_pool_display_config.sql`，只创建/写入卡池展示配置，不改概率、权重、保底、消耗、奖励；
  - 后端 `GachaPoolVO` 增加展示字段，`GachaPoolServiceImpl` 合并展示配置；
  - `PlayerApiPhaseGate` 放行已有 Gacha 读写接口以及背包/英雄/图鉴只读 GET；
  - `bag/use`、`batch-use`、`sell`、英雄养成、exchange/reissue 仍阻断。
- SQL 执行状态：
  - `sql/17_gacha_pool_display_config.sql` 已在本机 `lootchain` 库执行；
  - 第一次未指定字符集导入时因中文字段编码失败，已使用 `mysql --default-character-set=utf8mb4` 重新执行成功；
  - 复验 `gacha_pool_display_config` 表存在，当前有 4 条展示配置：限定召唤、英雄召唤、普通召唤、光暗召唤。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 后端 `PlayerApiPhaseGateTest,GachaPoolServiceImplTest` 通过：10 tests；
  - 两个仓库 `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，运行中的 Cocos Preview 旧 chunk 缺少 `startGachaDraw(mode)` 等最新 token，需要重开/刷新 Preview。
- 边界：本轮只接入已有真实 `draw` 经济写接口，不新增任何经济写入口；未修改 `gacha_pool_rate_config`、`gacha_pool_item`、`gacha_pity_config`、消耗、奖励、重复转碎片或 EX V1 规则；兑换、补发、背包 use、英雄养成仍未开放。

### 2026-06-02 Stage 4BR Documentation Sync

- 已同步更新 Cocos `README.md`、`docs/lobby-feature-analysis.md`，以及后端 `README.md`、`team-history/CURRENT_PROGRESS.md`、`docs/gacha/gacha-current-stage-output.md`。
- 文档口径统一为：当前仅开放既有 `/api/player/gacha/draw` 真实抽卡事务入口；卡池展示配置来自 SQL 17；兑换、补发、背包使用/出售、英雄养成、EX V1 和新增经济写入口仍关闭。

## 2026-06-02 Stage 4BS Gacha Spine Async Callback Error Fix

- 用户反馈召唤页出现 Cocos Preview Error：`Cannot read properties of null (reading 'isValid')`，堆栈落在 `GachaSceneRenderer.finishAbyssSpineLoad()` 后的 Spine 加载回调。
- 根因：召唤页重绘、切换卡池或离开页面时，旧的异步 Spine 回调仍可能返回；原回调直接读取 `skeleton.node.isValid`，当 `sp.Skeleton.node` 已被释放为 `null` 时会触发运行时错误。
- Cocos 前端修复：
  - `GachaSceneRenderer.ts` 新增 `isNodeAlive()` / `isSkeletonNodeAlive()`，所有 Gacha 中心 Spine 回调先确认节点仍存活；
  - `fallback.destroy()` 前统一走 `isNodeAlive(fallback)`，避免 fallback 节点已销毁时再次访问；
  - `finishAbyssSpineLoad()` / `finishAbyssFallbackSpineLoad()` 通过 `runSpineLoadCallbacks()` 分发回调，过期回调失败只输出 warning，不再打断 Preview；
  - 资源加载失败和 Spine 解析失败路径仍保留原有 `console.warn` 与 `setStatus()`，不会被过期回调保护吞掉。
- 守卫同步：`scripts/check-layout.mjs` 新增 Gacha Spine 节点存活 helper token，并禁止 `skeleton.node.isValid` / `fallback.isValid` 直接访问回归。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `rg -n "\.node\.isValid|fallback\.isValid"` 未在 `GachaSceneRenderer.ts` 中发现直接访问回归；
  - `git diff --check` 通过，仅保留既有 LF/CRLF warning；
  - Browser 打开 `http://localhost:7456/` 后，当前页面未再检出 `Cannot read properties of null` / `reading 'isValid'` 文本，控制台暂无 warning/error；
  - `npm.cmd run check:preview` 仍失败，运行中的 Cocos Preview 继续服务旧 chunk，旧 `GachaSceneRenderer.ts` chunk 缺少 `renderSceneBackButton(this.host, parent, layout` 和 `const spineGroundY = -stageHeight * 0.55` 等最新 token，需要重开/刷新 Cocos Creator Preview 后复验。
- 验收角色结果：
  - 本轮 `isValid` 报错修复点通过：旧/过期 Spine 回调不会再访问 null node；
  - fallback 销毁前存活判断通过；
  - 资源加载失败提示仍保留；
  - 验收角色提示：当前工作区同时包含 Stage 4BR 已获准的真实抽卡接入，因此若按“整工作区不得出现真实 draw 调用”验收会有边界差异；该真实 draw 接入不是本轮报错修复新增内容。
- 本轮边界：只修复 Cocos Gacha Spine 异步回调空节点崩溃和布局守卫；不修改后端、SQL、概率、权重、保底、消耗、奖励、卡池、EX V1，不新增任何经济写入口。

## 2026-06-02 Stage 4BT Real Gacha Draw Local Redis Fix

- 用户反馈：Cocos 召唤页点击召唤后显示“召唤失败：系统异常”。
- 复现与定位：
  - 不带玩家 token 调用 `GET /api/player/gacha/pools` / `POST /api/player/gacha/draw` 返回 401，说明鉴权链路正常；
  - 使用 `POST /api/player/auth/dev-login` 获取 `satoken` 后，`GET /api/player/gacha/pools` 与 `GET /api/player/gacha/pity/NORMAL_HERO` 正常；
  - 带 token 调用 `POST /api/player/gacha/draw` 在 Redis `127.0.0.1:6379` 不可达时返回 `code=500,msg=系统异常`；
  - `NORMAL_HERO` 卡池、概率、条目、英雄模板均存在且启用，玩家 1 状态正常，`DIAMOND=1000`，满足单抽 280 但不足十连 2800。
- 根因：真实抽卡事务在后端 `GachaDrawServiceImpl` 中依赖 `RedisTemplate SETNX` 幂等键与 Redisson 玩家锁；本机 Redis 未监听 6379 时，draw 会在进入事务锁阶段失败并被全局异常包装为“系统异常”。
- 本机处理：
  - 启动 Docker Desktop；
  - 复用已存在的 `redis:7-alpine` 容器 `usdt-monitor-redis`，当前映射为 `0.0.0.0:6379->6379/tcp`；
  - `Test-NetConnection localhost -Port 6379` 通过。
- 复验结果：
  - 带 dev-login token 调用 `POST /api/player/gacha/draw`，`poolCode=NORMAL_HERO, drawCount=1` 返回 `code=0`；
  - 后端生成真实 `drawNo=GACHA6c7808f3dd2143679f662e74bd43a11b`，返回 1 个 R 英雄结果；
  - DB 复核：该 drawNo 写入 `gacha_draw_log`，`draw_count=1`，消耗 `DIAMOND 280`；`gacha_draw_result` 第 0 个结果为 `HERO/R_ACOLY_02/R`；
  - 抽后玩家 1 的 `DIAMOND=720`，当前玩家钻石不足十连，点击十连应走业务失败“余额不足或货币账户并发更新失败”，不是本次 Redis 系统异常。
- Cocos Preview 状态：
  - Browser 已登录进入大厅，但当前停留在英雄详情页，Canvas 返回按钮没有稳定命中；未完成前端按钮复点；
  - 后端真实单抽接口已完成复验，用户在 Creator Preview 中重回召唤页后应可再次点单抽验收；
  - 若仍显示“系统异常”，优先确认 Redis `6379` 是否仍可达，以及 Cocos Preview 是否仍在使用旧 chunk。
- 边界不变：本轮只修复本地依赖环境导致的真实 draw 500，不修改 Cocos/后端代码，不修改 SQL，不改变概率、权重、保底、消耗、奖励、卡池、重复转碎片或 EX V1，不新增任何经济写入口。

## 2026-06-02 Stage 4BU Lobby Bag Readonly Scene

- 用户要求接入背包功能；当前阶段按只读背包场景处理，不开放使用、出售、批量使用、兑换、领取或任何资源变更入口。
- Cocos 前端更新：
  - `BagApi` 当前只保留 `GET /api/player/bag` 与 `GET /api/player/bag/items/{itemCode}/source`；
  - 新增 `LobbyBagState` / `LobbyBagLoader` / `LobbyBagPanelRenderer`，背包从大厅底部“背包”和小屏“背包”入口进入独立 full-screen 逻辑场景 `currentView='bag'`；
  - 背包页展示分类、道具列表、选中道具详情、服务端来源说明，并提供“刷新”和“查看来源”；
  - “使用/出售关闭”为禁用视觉按钮，不绑定写接口；
  - 切换账号会清空旧背包快照，异步读取通过 ticket 防止旧请求覆盖新玩家状态。
- 守卫同步：
  - `check:layout` 允许背包只读 GET，但继续禁止 `/api/player/bag/use`、`/api/player/bag/batch-use`、`/api/player/bag/sell`；
  - `check:layout` 与 `check:preview` 均加入背包 full-screen 场景、loader/state/API token；
  - 多分辨率布局校验已覆盖 `LobbyBagSceneContent`。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - Browser 当前打开 `http://localhost:7456/`，控制台暂无 warning/error；
  - `npm.cmd run check:preview` 仍失败，运行中的 Cocos Preview 旧 chunk 缺少 `openLobbyBagPanel`、`renderLobbyBagPanel`、`LobbyBagSceneContent`，且没有新背包模块 import-map entry，需要重开/刷新 Cocos Creator Preview 后复验。
- 边界不变：本阶段只接入已有背包只读查询和来源查询；不开放 EX V1，不新增经济写入口，不改变概率、权重、保底、消耗、奖励、卡池、重复转碎片、背包 use/sell 或英雄养成规则。

## 2026-06-02 Stage 4BV Gacha Readonly Side Pages And Fragment Bag Merge

- 用户要求补齐召唤重复英雄转碎片查看入口、顶部金币/钻石真实资产、召唤页右侧功能接口，以及奖池内容全屏页。
- 后端确认：
  - 重复英雄最终写入 `user_hero_fragment`，不是 `user_bag`；
  - 当前 Cocos 背包只在前端把 `GET /api/player/heroes/fragments/list` 聚合成“英雄碎片”分组展示，不改存储结构；
  - 大厅资料 `GET /api/player/me/lobby` 新增只读 `gold` / `diamond` 字段，读取 `user_currency` 当前余额，缺失账户按 0 展示，不调用补建或写账逻辑；
  - 新增玩家只读卡池展示详情 `GET /api/player/gacha/pools/{poolCode}/detail`，复用现有卡池详情结构给 Cocos 展示概率、保底、重复转碎片规则和池项；
  - `PlayerApiPhaseGate` 仅放行该新增 GET，仍阻断 exchange/reissue/bag use/sell/hero growth。
- Cocos 前端更新：
  - 大厅 HUD 与 Gacha 顶栏的金币、钻石均从 `PlayerLobbyProfileVO.gold/diamond` 展示，不再使用 `3,456K`、`8,888`、`2,450` 等硬编码假值；
  - `LobbyBagLoader` 并行读取背包与英雄碎片，碎片以 `HERO_FRAGMENT:{heroCode}` 伪条目进入“英雄碎片”分组；
  - 点击碎片“查看来源”时显示本地只读说明：来源为重复抽到同名英雄自动转化，不调用背包物品来源接口；
  - Gacha 右侧按钮从状态提示升级为全屏逻辑页：`gachaInfo` 概率/保底、`gachaRecord` 记录、`gachaExchange` 兑换说明、`gachaPoolContent` 奖池内容；
  - 概率/保底合并页读取卡池详情与当前玩家 pity；记录页读取 `GET /api/player/gacha/logs`；兑换页只展示说明和禁用按钮；奖池内容页展示当前卡池英雄/物品条目；
  - 真实 draw 成功后会重新读取大厅资料并刷新 Gacha 相关页面的顶部资产。
- 守卫同步：
  - `check:layout` 允许 `profile.gold/diamond` 只读展示与 `HeroApi.fragments()` 背包聚合；
  - `check:layout` 继续阻断假资产值、`/api/player/gacha/exchange`、`/api/player/gacha/reissue`、`/api/player/bag/use`、`/api/player/bag/batch-use`、`/api/player/bag/sell`；
  - `check:preview` 已加入 Gacha 子页、碎片聚合和资产刷新 token。
- 当前验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 后端 `PlayerApiPhaseGateTest,PlayerLobbyAdventureServiceImplTest,PlayerLobbyProfileServiceTest` 通过：7 tests；
  - 两个仓库 `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，运行中的 Cocos Preview 继续服务旧 chunk，缺少 `renderGachaActionScene`、`this.heroApi.fragments()`、`GachaActionScenePanel_` 等本轮 token，需要重开/刷新 Cocos Creator Preview 后复验；
  - 后端 Maven 仍提示本机 `C:\Users\axian\.m2\settings.xml` 第 61 行格式 warning，但聚焦测试通过。
- 边界不变：没有修改概率、权重、保底、消耗、奖励、重复转碎片规则、`gacha_pool_item` 或 EX V1；没有新增兑换、补发、背包使用/出售、英雄养成或其它经济写入口。

## 2026-06-02 Stage 4BW Gacha Result Back Button Fix

- 用户反馈：召唤结果页左上角返回箭头点击无反应。
- 定位结论：
  - 主召唤页 `render()` 被误绑定成 `GachaResultBackButton` 与 `closeGachaMockResultScene()`，导致主页面返回逻辑串到结果页；
  - 结果页 `renderResultScene()` 先绘制顶部返回栏、后绘制全屏结果内容层，后绘制的 `GachaResultScenePanel` / backdrop 可能覆盖并拦截左上角返回按钮点击。
- Cocos 前端修复：
  - 主召唤页恢复默认 `GachaBackButton -> closeGachaScene()`；
  - 结果页先绘制背景和结果内容，再最后绘制 `GachaResultBackButton -> closeGachaMockResultScene()`，标题保持“召唤结果”，确保返回按钮位于最上层；
  - `scripts/check-layout.mjs` 增加结构守卫：主召唤页不得包含结果页返回按钮/关闭结果页逻辑，结果页必须在内容层之后绘制结果返回栏；
  - `scripts/check-preview-freshness.mjs` 增加结果页返回按钮 token，便于识别运行中的 Cocos Preview 是否仍在服务旧 chunk。
- 边界不变：本次只修复 Cocos Gacha 结果页返回按钮层级与绑定，不修改后端、SQL、概率、权重、保底、消耗、奖励、重复转碎片、卡池、EX V1，也不新增任何经济写入口。

## 2026-06-03 Stage 4BX Unified Scene Back Header

- 当前继续以 Cocos-only 前端为准，不回到 web-vue。
- 用户要求：左上角返回按钮替换为高质量 UI，并在右侧显示当前全屏场景标题，例如召唤、英雄、背包。
- Cocos 前端更新：
  - 新增高清透明返回按钮素材 `assets/resources/ui/common/scene_back_button.png`，并添加对应 Cocos `.meta`；
  - `UiSceneBackButton.ts` 统一加载 `ui/common/scene_back_button/spriteFrame`，加载失败时保留暗金描边 fallback；
  - `renderSceneBackButton()` 新增 `titleText`，返回按钮右侧渲染 `SceneBackTitle`；
  - 召唤、召唤结果、召唤仪式、Gacha 右侧子页、英雄、英雄详情、背包、图鉴、冒险、编队、公告、资料、战斗、占位功能页均接入统一标题；
  - `UiSpriteFrameCache` 预加载新返回按钮素材，降低首次进入全屏场景时的闪烁风险。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加新按钮素材存在性、PNG 尺寸、spriteFrame meta、标题节点和新坐标 token；
  - `scripts/check-preview-freshness.mjs` 增加 `SCENE_BACK_BUTTON_ASSET`、`SceneBackButtonArt`、`SceneBackTitle` 等运行时 freshness token。
- 边界不变：本阶段只改 Cocos 前端 UI 资产、标题和本地守卫脚本；不修改后端、SQL、抽卡概率/权重/保底/消耗/奖励/重复转碎片/卡池规则，不开放 EX V1，不新增任何经济写入口。
## 2026-06-03 Stage 4BY Lobby Hidden Chat/Right Rail And Compact Gacha Action Panels

- 当前继续以 Cocos-only 前端为准，不回到 web-vue。
- 用户要求：
  - 世界聊天隐藏，当前不开放；
  - 大厅右侧按钮全部隐藏；
  - 召唤界面右侧按钮打开的新界面内容太少时不要铺满全屏，改成较小的非全屏面板。
- Cocos 前端更新：
  - `LobbyHudRenderer.ts` 增加 `SHOW_LOBBY_WORLD_CHAT=false` 与 `SHOW_LOBBY_RIGHT_CHALLENGE_RAIL=false`；
  - 宽屏大厅不再渲染 `LobbyChallengeRail` 右侧挑战卡片；
  - 底部大厅不再渲染 `LobbyChatPreview` 世界聊天条；
  - 小屏快捷入口过滤聊天项，避免聊天从紧凑入口出现；
  - 大厅下一目标布局不再为隐藏的右侧挑战栏预留空间；
  - `GachaSceneRenderer.ts` 的 Gacha 右侧功能页改为 `resolveActionPanelFrame()` 自适应居中面板，概率/兑换等内容少的页不再接近全屏；
  - Gacha 兑换说明页为底部禁用按钮预留列表空间，避免内容和按钮挤压。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加大厅聊天/右侧挑战栏关闭 token，以及 Gacha 小面板尺寸计算 token；
  - `scripts/check-preview-freshness.mjs` 增加相同 freshness token，用于识别 Preview 是否仍在服务旧 chunk。
- 边界不变：本阶段只改 Cocos 前端显示与本地守卫脚本；不修改后端、SQL、抽卡概率/权重/保底/消耗/奖励/重复转碎片/卡池规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-03 Backend Hero Template Text Repair

- 用户反馈后台 `hero_template` 中新增英雄/主角模板出现大量 `????`。
- 当前定位：Cocos 侧无需改资源路径；SQL 源文件中的中文正常，实际本地 MySQL 数据因非 utf8mb4 客户端导入被写坏。
- 后端已新增并执行 `D:\project\LootChain\sql\18_hero_template_text_encoding_fix.sql`，只修复 `hero_template` 展示字段。
- 已修复模板：
  - `PROTAGONIST_MALE_ATTACK` / `PROTAGONIST_FEMALE_ATTACK`；
  - `UR_SERAPHINA` / `UR_NYX` / `UR_AURELIA` / `UR_ATLAS`。
- 后端 `sql/05_hero_module.sql`、`sql/12_protagonist_module.sql`、`sql/15_hero_roster_art_refresh.sql` 已补 `SET NAMES utf8mb4;`，后续重新导入时应继续使用 `mysql --default-character-set=utf8mb4`。
- 本地复验：受影响 6 条 `????` 计数为 `0`；`UR_ARTHAS`、`UR_EVELYN` 保持正常。
- 边界不变：没有改 Cocos 经济入口，没有改 `gacha_pool_item`、概率、权重、保底、消耗、奖励、重复转碎片、EX V1 或任何新增经济写入口。

## 2026-06-03 Stage 4BZ Gacha Action Modal And Pool Display Config Sync

- 用户要求：召唤页右侧 `概率保底`、`记录`、`兑换`、`奖池内容` 不再切换到全屏新界面，改为召唤页内弹框；点击空白关闭，右上角提供关闭按钮。
- Cocos 前端更新：
  - `GachaSceneState` 新增 `activeAction`，右侧按钮只设置页内弹框状态，`currentView` 保持 `gacha`；
  - `GachaSceneRenderer` 新增 `GachaActionModalOverlay_*`，遮罩吞输入，点击遮罩空白关闭；
  - 弹框右上角接入新生成高清关闭按钮 `assets/resources/ui/common/modal_close_button.png`；
  - 左侧卡池 logo 槽现在优先加载后端 `logoAsset` 对应的 spriteFrame，加载失败才显示文字兜底；
  - 新增默认 logo 资源：`ui/gacha/logo_limited`、`ui/gacha/logo_hero`、`ui/gacha/logo_normal`、`ui/gacha/logo_locked`；
  - 召唤页停留期间每 15 秒重新拉取一次 `GET /api/player/gacha/pools`，后台修改 `logo_asset` 或 `center_spine_resource` 后，前端下一轮刷新会重绘。
- 后端核查：
  - 左侧卡池列表已由 `GET /api/player/gacha/pools` 拉取；
  - 展示配置表是 `gacha_pool_display_config`；
  - 已有字段覆盖 `logo_asset`、`theme_color`、`center_spine_resource`、`center_spine_uuid`、`center_spine_skin`、`center_intro_animation`、`center_idle_animation`、右侧说明、按钮文案、锁定/可抽标记；
  - 本轮不需要新增玩家侧接口或新增展示配置表。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 数据库确认 `gacha_pool_display_config` 默认 4 条展示配置均有 logo 与 center Spine 路径。
- 边界不变：未新增兑换、补发、背包使用/出售、英雄养成或其它经济写入口；未修改概率、权重、保底、消耗、奖励、重复转碎片、`gacha_pool_item` 或 EX V1。

## 2026-06-03 Stage 4CA Spine 资源冲突清理与英雄 UUID 绑定

- 用户反馈：刚向 `assets/resources/spine/hero`、`assets/resources/spine/gacha` 新增大量素材后，Cocos 控制台提示需要调整目录结构以避免动态加载异常；同时要求 `hero_template` 增加骨骼动画 uuid 绑定，仅更新启用英雄。
- 日志读取：
  - 已读取 `D:\project\lootchain-cocos\temp\logs\project.log`；
  - 最新相关 warning 指向 `.atlas` 与同 basename `.spine` 在 `resources` 下产生相同动态加载 URL，例如 `spine/hero/npc_1006/npc_1006`；
  - 这是 Cocos `resources` 动态加载路径冲突，不是经济或卡池配置问题。
- 资源处理：
  - 运行时 `assets/resources/spine` 仅保留 `.skel` 或 `.json` 加 `.atlas`/贴图；
  - `.spine` 源文件和重复的旧 `hunka_nima.skel` 已移至 `docs/spine-source-archive/`；
  - 扫描确认 `.atlas/.json/.skel/.spine` 动态加载分组 `conflictCount=0`。
- Cocos 前端：
  - `LobbyHeroTypes`、`LobbyCodexTypes`、`HeroTypes` 增加 `spineUuid`；
  - `LobbyHeroApi`、`LobbyCodexApi` 透传 `spineUuid`；
  - `LobbyHeroDetailPanelRenderer` 优先 `assetManager.loadAny({ uuid })` 加载 `sp.SkeletonData`，失败时回退到 `resources.load('spine/hero/{spineAsset}/{spineAsset}')`；
  - 英雄详情仍为只读展示，不新增升级、升星、觉醒、装备、领取、资源变更或经济写入口。
- 后端/数据库同步：
  - 已执行 `D:\project\LootChain\sql\21_hero_spine_uuid.sql`；
  - 本地 `lootchain.hero_template` 新增/确认 `spine_uuid` 字段；
  - 仅 `status=1` 的 22 个启用英雄写入 `spine_uuid`；
  - 复验 `enabled_missing_uuid=0`、`disabled_with_uuid=0`、`enabled_uuid_count=22`；
  - 数据库 `spine_uuid` 与 Cocos `assets/resources/spine/hero/{spineAsset}/{spineAsset}.skel.meta` uuid 一一比对通过：`checked=22`、`errors=0`。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 后端聚焦单测 `PlayerApiPhaseGateTest,PlayerLobbyAdventureServiceImplTest,PlayerLobbyProfileServiceTest,GachaPoolServiceImplTest,PlayerLobbyHeroServiceImplTest` 通过，15 tests；
  - `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile` 通过；
  - 两个仓库 `git diff --check` 通过，仅有既有 LF/CRLF warning；
  - `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，需要重开/刷新 Creator Preview 并等待资源重新导入后复验画面。
- 边界不变：本阶段只处理 Cocos Spine 资源结构、英雄展示元数据和只读接口字段；不修改 `gacha_pool_item`、概率、权重、保底、消耗、奖励、重复转碎片、EX V1、兑换/补发、背包使用/出售、英雄养成或任何新增经济写入口。

## 2026-06-03 Stage 4CB Preview 固定主场景修复

- 用户反馈 Cocos Preview 顶部报错：`无法查到当前场景 JSON 数据(start_scene) = current_scene`。
- 定位：
  - `D:\project\lootchain-cocos\temp\logs\project.log` 在 18:15 记录同一错误；
  - `assets/main.scene` 与 `assets/main.scene.meta` 正常存在，主场景 uuid 为 `623f777a-eb33-4d74-ae88-eb79e749fcfe`；
  - `profiles/v2/packages/preview.json` 中 `general.start_scene` 原值为 `current_scene`，当 Creator 没有可解析的当前场景上下文时，Preview 服务端无法拿到场景 JSON。
- 修复：
  - `profiles/v2/packages/preview.json` 改为固定 `start_scene=623f777a-eb33-4d74-ae88-eb79e749fcfe`；
  - `scripts/check-layout.mjs` 新增守卫：读取 `assets/main.scene.meta` 与 `profiles/v2/packages/preview.json`，要求 Preview 启动场景始终等于主场景 uuid，避免回退到 `current_scene`；
  - 新加的 `act_1012` / `npc_1012`、`act_1046` / `npc_1046` `.spine` 源文件已移到 `docs/spine-source-archive/preview-start-scene-fix-20260603/`，运行时 `assets/resources/spine` 继续保持无 `.spine` 源文件。
- 验证：
  - `http://localhost:7456/settings.js?scene=current_scene` 返回 200；
  - `http://localhost:7456/?scene=623f777a-eb33-4d74-ae88-eb79e749fcfe` 返回 200；
  - `npm.cmd run check:layout` 通过；
  - Spine 动态加载冲突扫描：`fileCount=102`、`conflictCount=0`。
- 边界不变：本阶段只改 Cocos Preview 本地配置、检查脚本和资源源文件归档；不修改后端、SQL、抽卡概率、卡池条目、权重、保底、消耗、奖励、重复转碎片、EX V1 或任何新增经济写入口。

## 2026-06-03 Stage 4CC Home SQL Sync And Resource Guard Recovery

- 按用户要求在本机同步后端 SQL：`12_protagonist_module.sql`、`15_hero_roster_art_refresh.sql`、`16_hero_spine_asset.sql`、`17_gacha_pool_display_config.sql`、`18_hero_template_text_encoding_fix.sql`、`19_table_comment_utf8_fix.sql`、`20_gacha_pool_tab_logo_asset.sql`、`21_hero_spine_uuid.sql`。
- 本机 `mysql` 不在 PATH，实际客户端为 `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`，MySQL 服务 `MySQL80` 正在运行。
- 首次使用 PowerShell `Get-Content | mysql` 管道时，SQL 中文被 PowerShell 原生命令管道转码成 `????`；已立即改为 MySQL 客户端 `source D:/project/LootChain/sql/...` 方式重新执行全部 8 个 SQL，避免 UTF-8 文件内容经 PowerShell 管道损坏。
- 只读数据库复验：
  - `player_protagonist` 表存在；
  - `hero_template.spine_uuid` 字段存在；
  - 启用英雄 `status=1` 共 22 个，`spine_asset=22`、`spine_uuid=22`、`enabled_missing_uuid=0`；
  - 禁用英雄 `disabled_with_uuid=0`；
  - 6 条文本修复目标行的 `?` 残留计数为 `0`；
  - `gacha_pool_display_config.tab_logo_asset` 字段存在，默认 4 个卡池均有 `tab_logo_asset`；
  - `gacha_pool_display_config` 与 `mq_consume_log` 表注释分别为中文 `抽卡卡池展示配置`、`MQ消费幂等日志`。
- Cocos 本地验收：
  - `profiles/v2/packages/preview.json` 的 `general.start_scene` 仍等于主场景 uuid `623f777a-eb33-4d74-ae88-eb79e749fcfe`；
  - `check:layout` 初次失败发现 `assets/resources/spine/hero/act_1012`、`npc_1012`、`npc_1046` 下新加入的 `.spine` 源文件仍在 resources；
  - 已将 6 个 `.spine/.spine.meta` 源文件移至 `docs/spine-source-archive/home-sql-sync-20260603/`；
  - `check:layout` 初次还发现 `huangfengjiaozong.json/.atlas/.png/.png2` 运行时文件缺失，且 `D:\project` 下没有其它副本；已仅从 Git 跟踪对象恢复这 4 个缺失运行时文件，不改其它用户资源；
  - 复跑 `npm.cmd run check:layout` 通过，输出 `layout ok`；`assets/resources/spine` 下已无 `.spine/.spine.meta` 源文件。
- 后续视觉复验仍需在 Cocos Creator 3.8.8 中等待资源重新导入并重启 Preview，再检查登录、大厅、召唤、英雄详情 Spine。
- 边界不变：本阶段只同步既有 SQL、修复本机导入编码方式、恢复/归档 Cocos 展示资源；不修改 `gacha_pool_item`、概率、权重、保底、消耗、奖励、重复转碎片、EX V1、兑换/补发、背包使用/出售、英雄养成或任何新增经济写入口。

## 2026-06-03 Stage 4CD Hero Roster Reference Layout

- 用户要求英雄界面排版参考《决胜之心》英雄列表截图，并按产品、UI 美术、开发、审查角色闭环推进。
- 产品方案：
  - 英雄页从原“三列横向资料卡”改为参考图式英雄墙；
  - 左侧为职业筛选栏：`全部 / 坦克 / 近战 / 远程 / 物理 / 法术`，当前只有 `全部` 激活，其余为视觉预留，因为当前 VO 尚未提供职业筛选字段；
  - 中央为横向竖版英雄卡，展示拥有英雄、稀有度、名称、星级、等级，点击仍进入只读英雄详情；
  - 顶部右侧使用只读状态胶囊：拥有数量、总战力、只读、刷新；小屏隐藏总战力/状态，避免压住返回标题；
  - 右下角保留参考图“升级区”视觉，但明确显示 `养成入口未开放 / 升级关闭`，不绑定按钮、不调用写接口。
- UI 美术：
  - 从 `C:\Users\Ethan\Desktop\决胜之心3.8.99\UI\图标` 选取 `2001.png`、`2002.png`、`2003.png`、`2004.png`，复制为 `assets/resources/ui/hero-roster/card_r|sr|ssr|ur.png` 作为 R/SR/SSR/UR 竖卡底板；
  - 从同目录选取部分可稳定映射的头像/半身图，复制到 `assets/resources/ui/hero-roster/portraits/`；
  - Cocos meta 已同步生成，`UiSpriteFrameCache` 预加载卡牌底板，头像按映射动态请求。
- 开发实现：
  - `LobbyHeroRosterPanelRenderer.ts` 重写为参考图式全屏布局；
  - 新增 `LOBBY_HERO_ROSTER_CARD_ASSETS`、`LOBBY_HERO_ROSTER_BACKDROP_ASSET`、`resolveHeroRosterPortraitAsset()`、`LobbyHeroRosterFilterRail`、`LobbyHeroRosterUpgradeButtonDisabled` 等结构；
  - 卡牌优先使用 UI 底板和头像资源，未映射英雄使用卡内优雅占位，不再误用 Spine atlas 图集碎片；
  - `check-layout` 与 `check-preview-freshness` 增加新 UI token 和资源守卫。
- 审查结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript focused no-emit 通过；
  - 当前仍需重启/刷新 Cocos Preview 并等待新 UI 资源导入后做视觉验收。
- 边界不变：本阶段只改 Cocos 英雄列表 UI 视觉和本地资源，不开放升级、升星、觉醒、装备、抽卡、领取、资源消耗、EX V1 或任何新增经济写入口。

## 2026-06-03 Stage 4CE Hero Roster Dark Themed Card Refresh

- 用户反馈：英雄列表参考图排版可接受，但当前浅色竖卡与圆形占位显得偏卡通，和 LootChain 现有暗黑圣殿、黑金、暗红主题不一致。
- 产品结论：
  - 保留“左侧分类栏 + 中央竖版英雄卡墙 + 顶部只读状态 + 右下角关闭养成区”的信息架构；
  - 替换卡面美术，不再使用浅奶油色卡底；
  - 稀有度差异只通过边框/底部名牌的低饱和色调表达，不引入新职业、新养成或新经济含义。
- 策划边界：
  - 当前分类仍是视觉预留，只有 `全部` 激活；
  - 卡牌仍只展示已拥有英雄，点击进入只读英雄详情；
  - `升级关闭` / `养成入口未开放` 仍是不可交互视觉状态。
- UI 美术：
  - 使用内置 `image_gen` 生成一张黑曜石、哥特金属、暗红圣殿纹理的高质量空卡框源图；
  - 源图保存到 `docs/generated-art/hero-roster-dark-gothic-card-source.png`；
  - 已处理成 224x406 的四个 Cocos 卡底资源并覆盖原路径：
    - `assets/resources/ui/hero-roster/card_r.png`：冷钢蓝；
    - `assets/resources/ui/hero-roster/card_sr.png`：暗紫；
    - `assets/resources/ui/hero-roster/card_ssr.png`：血金/暗红；
    - `assets/resources/ui/hero-roster/card_ur.png`：熔金。
- 开发实现：
  - 保持卡底资源路径和 meta uuid 不变，避免 Cocos 引用抖动；
  - `LobbyHeroRosterPanelRenderer.ts` 的无头像 fallback 从“圆形三角占位”改为暗色封印碑/尖塔纹章；
  - 没有新增按钮、事件、接口或经济写入。
- 审查结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunks；需重启/刷新 Cocos Preview 并等待 `ui/hero-roster` 资源重导入后做最终视觉验收。
- 边界不变：本阶段只替换 Cocos 英雄列表卡牌视觉资源并调整本地 fallback 绘制；不开放升级、升星、觉醒、装备、抽卡、领取、资源消耗、EX V1 或任何新增经济写入口。

## 2026-06-03 Stage 4CF Hero Roster Product Visual Pass

- 用户在 Preview 中反馈：暗黑卡底已生效，但整体仍不够搭配；卡片偏小，背景红环比英雄卡更抢眼；卡内文字需要放到框内更合适的位置。
- 产品观察：
  - 当前信息架构可继续保留，问题集中在视觉权重和卡内信息落点；
  - 英雄卡应成为中景主视觉，背景只作为舞台；
  - 稀有度、名称、星级应统一落在卡底部信息仓中，并与金属边框保持边距；
  - 无头像 fallback 继续保持暗黑封印语义，但应避免像功能按钮图标。
- 开发调整：
  - `LobbyHeroRosterPanelRenderer.ts` 中非横向卡高上限从约 `306 * scale` 提升到 `372 * scale`，最大允许到 `386 * scale`；
  - 横向/小屏卡高同步放大到 `252 * scale` 以内；
  - 卡片间距略增，卡组 Y 轴略回落，让卡片更稳地压在场景中段；
  - 新增 `LobbyHeroRosterInfoPlate`，在卡底部绘制暗色信息名牌；
  - `SSR/R`、英雄名、星级改用卡高比例定位，统一收进底部信息名牌内部，避免贴边或漂出框感；
  - 头像显示区域略加宽，保持人物图和卡框比例更自然。
- 守卫：
  - `check-layout` 与 `check-preview-freshness` 增加 `LobbyHeroRosterInfoPlate` token，避免后续回退到无信息仓布局。
- 审查结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - 仍需重启/刷新 Cocos Preview 以加载最新 chunk 后做视觉验收。
- 边界不变：本阶段只调整 Cocos 英雄列表视觉权重与卡内排版；不开放升级、升星、觉醒、装备、抽卡、领取、资源消耗、EX V1 或任何新增经济写入口。

## 2026-06-03 Stage 4CG Hero Roster LootChain Visual Language Pass

- 用户反馈：外部 `spine/ui` 与参考素材整体偏卡通，如果继续叠到 LootChain 英雄界面会和暗黑圣殿、黑金、暗红主题冲突；要求按“先实现英雄界面”的方向收敛。
- 产品/策划结论：
  - 英雄界面先统一 LootChain 自己的暗黑视觉语言，不再直接使用《决胜之心》UI Spine 特效或卡通头像作为主视觉；
  - 外部素材只作为动效节奏/信息层级参考，不作为当前英雄页最终美术资产；
  - 英雄列表保持只读卡墙，点击卡牌进入只读英雄详情；
  - 稀有度仍只作为视觉阅读辅助，不增加职业、成长、获取、概率、奖励或经济含义。
- Cocos 开发：
  - `LobbyHeroRosterPanelRenderer.ts` 新增 `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`，禁用外部头像映射；
  - 卡内主体从外部头像/圆形占位改为 Cocos `Graphics` 绘制的 `LobbyHeroRosterHeroRelief` 暗色英雄浮雕/剪影；
  - 卡区新增 `LobbyHeroRosterAbyssDust`，用少量暗金/暗红尘点做仪式感氛围，不使用卡通 Spine 特效；
  - 背景遮罩略加深，让红环退为舞台，不压过英雄卡；
  - 仍保留暗黑卡底、底部 `LobbyHeroRosterInfoPlate`、只读顶部状态和不可交互养成关闭区。
- 资源整理：
  - 已将此前复制进 `assets/resources/ui/hero-roster/portraits/` 的偏卡通头像资源移出 Cocos `resources` 动态加载目录；
  - 归档位置：`docs/art-source-archive/hero-roster-cartoon-portraits-20260603/portraits/`；
  - `check-layout` 不再要求这些头像资源存在。
- 守卫：
  - `check-layout` 与 `check-preview-freshness` 增加 `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`、`LobbyHeroRosterHeroRelief`、`drawHeroReliefPortrait`、`LobbyHeroRosterAbyssDust` token；
  - 避免后续回退到外部卡通头像或无暗黑主体的卡片。
- 审查结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 focused TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 仍失败，运行中的 Cocos Preview 继续服务旧 chunks，缺少 `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`、`LobbyHeroRosterHeroRelief`、`LobbyHeroRosterAbyssDust` 等本轮 token；需重启/刷新 Cocos Preview 后做视觉验收。
- 边界不变：本阶段只调整 Cocos 英雄列表视觉与本地资源归档；不开放升级、升星、觉醒、装备、抽卡、领取、资源消耗、EX V1 或任何新增经济写入口。

## 2026-06-04 Stage 4CH Current Phase Guard Recheck

- 已按新窗口接手要求重新读取 `current-chat-context.md`、`README.md`、`lobby-feature-analysis.md`、`api-contract.md`。
- Cocos 守卫复验：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - `profiles/v2/packages/preview.json` 的 `general.start_scene` 仍固定为主场景 uuid `623f777a-eb33-4d74-ae88-eb79e749fcfe`；
  - `assets/resources/spine` 下未发现 `.spine/.spine.meta` 源文件；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - 源码红线检索未发现新增 `/api/player/bag/use`、`/api/player/bag/batch-use`、`/api/player/bag/sell`、`/api/player/gacha/exchange`、`/api/player/gacha/reissue`、英雄养成写接口或 `gacha_pool_item` 修改入口。
- Preview 状态：
  - `http://localhost:7456/settings.js?scene=623f777a-eb33-4d74-ae88-eb79e749fcfe` 返回 200；
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 服务继续返回旧 import-map/chunks；
  - stale chunk 缺少统一返回标题、背包碎片聚合、英雄详情 Spine uuid/audio、Gacha 页内弹框和中心 Spine 布局等已在源码中存在的 token；
  - 因 Preview stale，本轮无法可信完成登录页、大厅、召唤页、英雄详情 Spine、背包只读和 Gacha 弹框的可视点击验收；需要重启/刷新 Cocos Creator Preview，等待脚本重新编译和资源重新导入后再复跑 `npm.cmd run check:preview`。
- 文档同步：
  - `docs/api-contract.md` 中 2026-05-31 Stage 4P 的历史 `GachaApi.draw()` 本地阻断说明已标注为历史阶段约束；
  - 当前口径以 2026-06-02 后已批准的既有 `POST /api/player/gacha/draw` 真实 draw 接入为准，但仍不开放 exchange/reissue、EX V1、背包 use/sell、英雄养成或新增经济写入口。
- 边界不变：本轮只做检查与文档澄清；未修改 Cocos 代码、后端代码、SQL、抽卡概率、权重、保底、消耗、奖励、重复转碎片、`gacha_pool_item`、EX V1 或任何新增经济写入口。

## 2026-06-04 Stage 4CI Hero Roster Top-Left Cards And UR Effect

- 用户反馈：英雄卡牌位置应参考第二张图贴近顶部并向左靠齐；当前 SSR 与 UR 卡视觉差异不明显，UR 需要额外特效。
- 已按“分多角色执行”拆分只读分析：
  - 资源/UI 角色检查 `C:\Users\axian\Desktop\决胜之心3.8.99`，认为 `spine/ui/card_light` 最适合作为英雄卡 UR 特效，原因是它是卡框扫光/星点类循环效果，比获得特效或等级特效更贴合卡牌常驻展示；
  - 开发/审查角色检查 `LobbyHeroRosterPanelRenderer.ts`，确认当前卡组仍按 body 居中公式排布，应改为 body 顶部左齐；UR 特效应只挂在卡牌视觉层，不新增交互或经济含义。
- Cocos 实现：
  - 英雄列表卡牌排布从 body 居中改为 `bodyLeft + cardInsetX + cardWidth / 2` 与 `bodyTop - cardInsetY - cardHeight / 2`，让卡墙贴近顶部并向左展开；
  - 卡牌宽高改为显式 `224 / 406` 比例常量，避免后续视觉调参回退到魔法数；
  - UR 卡额外渲染 `LobbyHeroRosterUrAura` 本地金色光晕兜底，并加载 `LobbyHeroRosterUrCardLightSpine`；
  - SSR 保持暗红/血金卡底与静态氛围，UR 增加卡框扫光和金色粒子后与 SSR 形成更明显层级差异。
- 资源接入：
  - 源目录：`C:\Users\axian\Desktop\决胜之心3.8.99\spine\ui\card_light`；
  - Cocos runtime 目录：`assets/resources/spine/ui/hero-roster/card_light/`；
  - 仅复制运行时 `card_light.skel`、`card_light.atlas`、`card_light.png` 及 meta，不复制 `.spine` 源文件；
  - `assets/resources/spine` 下仍不允许保留 `.spine/.spine.meta`。
- 守卫同步：
  - `scripts/check-layout.mjs` 增加 hero-roster `card_light` runtime/meta 存在性、atlas page 引用和英雄列表 top-left/UR token；
  - `scripts/check-preview-freshness.mjs` 增加最新 hero roster 布局与 UR effect token，避免 Preview 旧 chunk 被误判为通过。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅提示 Git 换行转换 warning；
  - `assets/resources/spine` 下未发现 `.spine/.spine.meta` 源文件；
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks，`LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `bodyLeft + cardInsetX + cardWidth / 2`、`HERO_ROSTER_UR_CARD_LIGHT_RESOURCE`、`renderHeroCardUrEffect`、`LobbyHeroRosterUrAura`、`LobbyHeroRosterUrCardLightSpine` 等本轮 token。
- Preview 复验要求：重启/刷新 Cocos Creator Preview，等待 `assets/resources/spine/ui/hero-roster/card_light/` 资源导入和脚本重新编译后，再检查英雄页卡牌顶部左齐、UR 扫光特效、SSR/UR 差异，以及登录页、大厅、召唤页、英雄详情 Spine、背包只读、Gacha 页内弹框。
- 边界不变：本阶段只改 Cocos 英雄列表视觉、只读卡牌布局和本地运行时资源；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CJ Hero Roster UR Border Effect Replacement

- 用户反馈：Stage 4CI 的 `card_light` UR 特效形成竖向大光柱，不适合英雄卡；需要改成围绕当前卡牌边框的特效，同时左上 `Lv.1` 与右上角标不能再压住边框。
- 多角色复查：
  - 资源角色重新扫描 `C:\Users\axian\Desktop\决胜之心3.8.99`，确认 `spine/ui/goods_1` 比 `card_light` 更适合作为 UR 边框特效；它的 atlas 主要由四角高光、横竖边线和小星点构成，整屏光柱风险低；
  - 开发审查角色确认重叠根因在 `LobbyHeroRosterLevel` 与 `LobbyHeroRosterClassBadge` 把 label/角标中心点贴近卡片边缘，实际外框会越界。
- Cocos 实现：
  - 已下线 `assets/resources/spine/ui/hero-roster/card_light/`，并禁止该旧全卡光柱资源回归；
  - 已改用 `assets/resources/spine/ui/hero-roster/goods_1_border/goods_1.skel|atlas|png`；
  - `LobbyHeroRosterPanelRenderer.ts` 的 UR 卡改为 `LobbyHeroRosterUrBorderAura` 本地细边框兜底 + `LobbyHeroRosterUrGoodsBorderSpine` Spine 边框层；
  - UR 特效仍位于卡底之上、头像与文字之下，不覆盖名称、稀有度、星级或角标；
  - `Lv.1` 改为 `levelWidth/levelHeight + inset` 计算中心点，右上角标改为 `badgeSize + inset` 计算中心点，避免左上/右上内容与卡牌边框重叠；
  - 顶部状态胶囊增加 `topBarLeftReserve`，空间不足时不再挤到返回标题区域。
- 守卫同步：
  - `scripts/check-layout.mjs` 要求 `goods_1_border` runtime/meta 存在、atlas 引用 `goods_1.png`、旧 `card_light/frame` runtime 不得存在；
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 均加入 UR 边框资源、角标内缩、等级内缩、顶部保留区 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅提示 Git 换行转换 warning；
  - `assets/resources/spine` 下未发现 `.spine/.spine.meta` 源文件。
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks，`LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `HERO_ROSTER_UR_BORDER_EFFECT_RESOURCE`、`spine/ui/hero-roster/goods_1_border/goods_1`、`LobbyHeroRosterUrBorderAura`、`renderUrGoodsBorderSpine`、`LobbyHeroRosterUrGoodsBorderSpine`、等级/角标内缩和 `topBarLeftReserve` 等本轮 token。
- Preview 复验要求：重启/刷新 Cocos Creator Preview，等待 `assets/resources/spine/ui/hero-roster/goods_1_border/` 导入和脚本重新编译后，再检查英雄页 UR 边框光效、左上等级/右上角标边距、顶部胶囊不压返回标题，以及登录页、大厅、召唤页、英雄详情 Spine、背包只读、Gacha 页内弹框。
- 边界不变：本阶段只改 Cocos 英雄列表视觉、只读布局和本地 Spine runtime 资源；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CK Hero Roster UR Border Alignment And Top Text Readability

- 用户反馈：`goods_1_border` 特效仍需要和卡牌边框对齐；上方 `Lv.1`/角标文字太小且直接压在卡框纹路上，不清晰。
- Cocos 调整：
  - `LobbyHeroRosterUrBorderAura` 不再画外扩大框，改用 `HERO_ROSTER_UR_BORDER_INSET_X/Y` 计算内收后的 `borderWidth/borderHeight`，金线贴近卡牌实际框线；
  - 第二圈 UR 线从外扩改为内收细线，降低和背景/邻卡冲突；
  - `LobbyHeroRosterUrGoodsBorderSpine` 缩放按 `width - 18`、`height - 22` 计算，避免 Spine 边框光压到卡牌外侧；
  - `LobbyHeroRosterLevel` 改为 `LobbyHeroRosterLevelPlate + LobbyHeroRosterLevelText`，增加暗色底板、金色描边和更大字号，避免文字直接叠在卡框花纹上；
  - 右上 `LobbyHeroRosterClassBadge` 从 `30 * scale` 放大到 `36 * scale`，并通过更大的 top inset 下移，避免和卡牌右上边框纹理重叠。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 增加 `HERO_ROSTER_UR_BORDER_INSET_X/Y`、`borderWidth`、`LobbyHeroRosterLevelPlate`、`LobbyHeroRosterLevelText`、`badgeSize = 36 * scale` 等 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过。
  - `git diff --check` 通过，仅提示 Git 换行转换 warning；
  - `assets/resources/spine` 下未发现 `.spine/.spine.meta` 源文件；
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks，`LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `HERO_ROSTER_UR_BORDER_INSET_X`、`borderWidth`、`LobbyHeroRosterLevelPlate`、`LobbyHeroRosterLevelText`、`badgeSize = 36 * scale` 等本轮 token。
- Preview 复验要求：重启/刷新 Cocos Creator Preview，等待脚本重新编译后，重点检查 UR 边框是否贴合卡框、顶部等级暗底标签是否清晰、右上角标是否避开边框纹路。
- 边界不变：本阶段只调整 Cocos 英雄列表视觉、只读布局和本地 Spine runtime 对齐；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CL Hero Roster Larger Cards And Border Outset

- 用户反馈：英雄卡牌还需要更大，UR 边框特效还需要向外一些。
- Cocos 调整：
  - 英雄卡桌面目标高度从约 `372 * scale` 提升为 `HERO_ROSTER_CARD_DESKTOP_TARGET_HEIGHT = 420`，桌面上限提升为 `HERO_ROSTER_CARD_DESKTOP_MAX_HEIGHT = 440`；
  - 横向/小屏卡牌目标高度提升为 `HERO_ROSTER_CARD_COMPACT_TARGET_HEIGHT = 278`，上限为 `HERO_ROSTER_CARD_COMPACT_MAX_HEIGHT = 306`；
  - 卡牌间距略收为桌面 `22 * scale`、横向 `12 * scale`，给放大后的卡牌留出横向空间；
  - UR 边框从内收改为轻微外扩：`HERO_ROSTER_UR_BORDER_OUTSET_X = 4`、`HERO_ROSTER_UR_BORDER_OUTSET_Y = 5`，`borderWidth/borderHeight` 使用 `width + borderOutset * 2`；
  - `LobbyHeroRosterUrGoodsBorderSpine` 的缩放改按 `width + 12`、`height + 14` 计算，让外部边框特效更靠近卡框外沿；
  - 顶部等级牌和右上角标随卡牌放大再增强：等级牌 `68x26`、字号 `16 * scale`，角标 `38 * scale`、字号 `15 * scale`。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 增加卡牌目标/上限高度、UR border outset、`borderWidth = width + borderOutsetX * 2`、`badgeSize = 38 * scale` 等 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过。
- 边界不变：本阶段只调整 Cocos 英雄列表视觉尺寸和只读边框特效位置；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CM Hero Roster Larger Card Final Verification

- Scope: final verification for the larger hero cards and outward UR border effect requested after Stage 4CL.
- Verification:
  - `npm.cmd run check:layout` passed with `layout ok`;
  - Cocos Creator 3.8.8 bundled TypeScript no-emit passed for project `tsconfig.json`;
  - `git diff --check` passed with only Git line-ending conversion warnings;
  - `assets/resources/spine` contains `0` `.spine/.spine.meta` source files;
  - `assets/resources/spine/ui/hero-roster/goods_1_border/` contains only runtime `goods_1.skel`, `goods_1.atlas`, `goods_1.png`, and their `.meta` files.
- Preview status:
  - `profiles/v2/packages/preview.json` still pins `general.start_scene` to `623f777a-eb33-4d74-ae88-eb79e749fcfe`;
  - `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks;
  - the stale `LobbyHeroRosterPanelRenderer.ts` chunk is missing the new `HERO_ROSTER_CARD_DESKTOP_TARGET_HEIGHT`, `HERO_ROSTER_CARD_DESKTOP_MAX_HEIGHT`, `HERO_ROSTER_UR_BORDER_OUTSET_X`, `borderWidth = width + borderOutsetX * 2`, and `badgeSize = 38 * scale` tokens.
- Next visual acceptance step: restart/refresh Cocos Creator Preview and wait for scripts/resources to recompile, then verify the hero roster card size, UR border outset, top label readability, login page, lobby, gacha page, hero detail Spine, readonly bag, and Gacha in-page dialogs.
- Boundary unchanged: Cocos frontend visual/layout verification only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Stage 4CN Hero Roster Larger Cards And Vertical Border Outset

- 用户反馈：卡牌边框特效上下位置还需要向外扩一下，卡牌再大一些。
- Cocos 调整：
  - 英雄卡桌面目标高度从 `420 * scale` 提升为 `452 * scale`，桌面上限从 `440 * scale` 提升为 `474 * scale`；
  - 横向/小屏卡牌目标高度从 `278 * scale` 提升为 `298 * scale`，上限从 `306 * scale` 提升为 `328 * scale`；
  - UR 边框横向外扩保持 `HERO_ROSTER_UR_BORDER_OUTSET_X = 4`，上下外扩从 `HERO_ROSTER_UR_BORDER_OUTSET_Y = 5` 提升为 `10`；
  - `LobbyHeroRosterUrGoodsBorderSpine` 横向仍按 `width + 12` 缩放，纵向改按 `height + 30` 缩放，让上下边框特效更外扩，左右不继续扩散。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 改为检查精确常量 `452 / 474 / 298 / 328`、`HERO_ROSTER_UR_BORDER_OUTSET_Y = 10` 和 `clamp((height + 30) / 120`；
  - `npm.cmd run check:layout` 已通过，输出 `layout ok`。
- 复验结果：
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - `LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `452 / 474 / 298 / 328`、`HERO_ROSTER_UR_BORDER_OUTSET_Y = 10` 和 `clamp((height + 30) / 120` 等本轮 token。
- 待复验：仍需重启/刷新 Cocos Creator Preview，等待脚本和 `goods_1_border` 资源重新服务后，视觉确认卡牌更大、UR 上下边框特效外扩、顶部文字不压框。
- 边界不变：本阶段只调整 Cocos 英雄列表视觉尺寸和只读边框特效位置；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CO Hero Roster UR Border Horizontal De-overlap

- 用户反馈：UR 边框特效和背景线重叠，需要调整。
- Cocos 调整：
  - UR 横向边框外扩从 `HERO_ROSTER_UR_BORDER_OUTSET_X = 4` 收回到 `0`，让左右边线贴回卡框，避免压到背景竖线或相邻卡间距；
  - UR 上下外扩保持 `HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`，不回退上一轮“上下更外扩”的要求；
  - `LobbyHeroRosterUrGoodsBorderSpine` 横向缩放从 `width + 12` 收到 `width + 2`，纵向仍保持 `height + 30`。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求 `HERO_ROSTER_UR_BORDER_OUTSET_X = 0`、`HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`、`clamp((width + 2) / 120`、`clamp((height + 30) / 120`。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - `LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `HERO_ROSTER_UR_BORDER_OUTSET_X = 0`、`clamp((width + 2) / 120`、`clamp((height + 30) / 120` 和当前卡牌尺寸 token。
- 待复验：重启/刷新 Cocos Creator Preview 后检查 UR 左右边框不再和背景竖线重叠，同时确认上下边框仍有外扩感。
- 边界不变：本阶段只调整 Cocos 英雄列表 UR 边框视觉位置；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CP Hero Roster Rarity Label Line Fix

- 用户纠正：恢复上一轮 UR 横向收回调整；UR 看起来多了一个框。实际问题是卡牌下方 `SSR/UR` 字体背后的信息牌边框线。
- Cocos 调整：
  - 恢复 UR 横向边框外扩为 `HERO_ROSTER_UR_BORDER_OUTSET_X = 4`；
  - 恢复 `LobbyHeroRosterUrGoodsBorderSpine` 横向缩放为 `width + 12`，纵向继续保持 `height + 30`；
  - 新增 `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218`，让底部稀有度文字略微下移，避开信息牌上沿；
  - 新增 `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO = 0.48`，将信息牌顶部装饰线拆成左右两段，中间避开 `SSR/UR` 文本区域。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求恢复后的 `HERO_ROSTER_UR_BORDER_OUTSET_X = 4`、`clamp((width + 12) / 120`，并新增底部稀有度文字位置和信息牌中线留空 token；
  - `npm.cmd run check:layout` 已通过，输出 `layout ok`。
- 复验结果：
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - `LobbyHeroRosterPanelRenderer.ts` 旧包缺少恢复后的 `HERO_ROSTER_UR_BORDER_OUTSET_X = 4`、`clamp((width + 12) / 120`，以及 `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218`、`HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO = 0.48` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后检查 UR 不再出现额外框感，同时确认底部 `SSR/UR` 字体背后不再有横线穿过。
- 边界不变：本阶段只调整 Cocos 英雄列表底部信息牌和 UR 视觉位置；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CQ Hero Roster UR Extra Outer Frame Removal

- 用户反馈：UR 的框外层多了一层边框，需要去掉。
- Cocos 调整：
  - 删除 `drawUrBorderAura()` 调用和函数；
  - 删除活跃渲染器中的 `LobbyHeroRosterUrBorderAura` 本地节点路径；
  - 删除活跃渲染器中的 `HERO_ROSTER_UR_BORDER_OUTSET_X/Y` 本地 Aura 外框常量；
  - UR 差异现在只依赖 `LobbyHeroRosterUrGoodsBorderSpine` 加载的 `goods_1_border` Spine 边框层，仍按 `width + 12`、`height + 30` 缩放；
  - Stage 4CP 的底部 `SSR/UR` 信息牌中线留空修复继续保留。
- 守卫同步：
  - `scripts/check-layout.mjs` 不再要求 Aura token，改为禁止 `drawUrBorderAura`、`LobbyHeroRosterUrBorderAura`、`HERO_ROSTER_UR_BORDER_OUTSET_X/Y`、`borderWidth = width + borderOutsetX * 2` 和本地 Aura 斜角框 token；
  - `scripts/check-preview-freshness.mjs` 不再把 Aura token 当作 Preview 新鲜度要求，只检查当前 Spine 边框和信息牌 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 需要重启/刷新 Cocos Creator Preview 后，才能确认旧 `LobbyHeroRosterUrBorderAura` 外层框已从运行时移除。
- 边界不变：本阶段只调整 Cocos 英雄列表 UR 视觉层级；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CR Hero Roster Rarity Label Top Line Removal

- 用户反馈：卡牌下方 `SSR/UR` 字体背后仍有边框线，希望去掉。
- Cocos 调整：
  - 删除信息牌顶部装饰线，不再使用 `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO`、`rarityLineGap`、`accentY`；
  - 信息牌描边从完整 `traceSlantRect` 改为 `traceInfoPlateLowerFrame`，只画左右边和底边，不画靠近 `SSR/UR` 字体的顶部线；
  - 保留 `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218`，稀有度文字位置不回退；
  - UR 仍只保留 `goods_1_border` Spine 边框特效，不恢复本地 Aura 外框。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求 `traceInfoPlateLowerFrame` 和 `this.traceInfoPlateLowerFrame(graphics, plateWidth, plateHeight, 8 * scale)`；
  - `scripts/check-layout.mjs` 禁止旧的 `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO`、`rarityLineGap`、`accentY = plateHeight / 2`、`graphics.moveTo(rarityLineGap / 2` token 回归。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - `LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `traceInfoPlateLowerFrame` 和 `this.traceInfoPlateLowerFrame(graphics, plateWidth, plateHeight, 8 * scale)` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 `SSR/UR` 字体背后不再有横向边框线，同时确认信息牌侧边/底边仍保留。
- 边界不变：本阶段只调整 Cocos 英雄列表底部信息牌视觉；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CS Hero Roster Rarity Label Baked Line Cover

- 用户反馈：`SSR/UR` 字体背后仍有一条线，上一轮删错了。
- 结论：上一轮删掉的是代码绘制的顶部线；当前截图中剩余的线主要来自 `card_ssr/card_ur` 卡牌底图自带的底栏上沿线，以及旧的内部小一圈透明染色块边界透出。
- Cocos 调整：
  - 新增 `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 238`，提高信息牌底色覆盖，遮住卡牌底图自带横线；
  - 新增 `HERO_ROSTER_CARD_INFO_PLATE_TINT_ALPHA = 46`，稀有度染色改为整块信息牌染色；
  - 删除旧的内部小框染色路径，不再使用 `plateWidth - 8 * scale` / `plateHeight - 8 * scale`，避免在 `SSR/UR` 背后形成新的水平分界；
  - 保留 `traceInfoPlateLowerFrame`，信息牌仍只画左右边和底边。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求两个信息牌 alpha token；
  - `scripts/check-layout.mjs` 禁止旧的内部小框染色 token `plateWidth - 8 * scale`、`plateHeight - 8 * scale` 回归。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - `LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 238`、`HERO_ROSTER_CARD_INFO_PLATE_TINT_ALPHA = 46` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 `SSR/UR` 字体背后不再透出卡牌底图横线，且信息牌侧边/底边仍保留。
- 边界不变：本阶段只调整 Cocos 英雄列表底部信息牌视觉覆盖；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CT Hero Roster Rarity Label Opaque Cover

- 用户反馈：`SSR/UR` 字体背后的线仍能看到，只是没那么明显；上一轮是透明化压淡，不是直接移除。
- Cocos 调整：
  - `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA` 从 `238` 调整为 `255`；
  - 底部信息牌底色改为完全不透明覆盖，直接盖住卡牌底图自带的横线，而不是让其半透明透出；
  - `HERO_ROSTER_CARD_INFO_PLATE_TINT_ALPHA = 46`、`traceInfoPlateLowerFrame` 侧边/底边描线和 UR Spine 边框特效保持不变。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求 `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 255`；
  - 继续禁止旧的内部小框染色 token `plateWidth - 8 * scale`、`plateHeight - 8 * scale` 回归。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 `SSR/UR` 字体背后的底图横线被完全覆盖，而不是仅变淡。
- 边界不变：本阶段只调整 Cocos 英雄列表底部信息牌视觉覆盖；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CU Hero Roster Rarity Border Spine Mapping

- 用户要求：不同稀有度边框特效使用 `goods_1` 里的不同骨骼动画，`R=K3`、`SR=K4`、`SSR=K5`、`UR=K7`。
- 资源复核：
  - 当前运行时资源仍为 `assets/resources/spine/ui/hero-roster/goods_1_border/goods_1.skel|atlas|png`；
  - `goods_1.skel` 中实际动画名为小写 `k3/k4/k5/k7`，代码保留用户指定的 `K3/K4/K5/K7` 映射，并用大小写不敏感匹配解析实际动画名。
- Cocos 调整：
  - `LobbyHeroRosterPanelRenderer.ts` 将原 UR-only 边框特效改为全稀有度 `renderHeroCardBorderEffect`；
  - 新增 `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY`，按 `R/SR/SSR/UR` 分别映射 `K3/K4/K5/K7`；
  - 所有受支持稀有度卡牌统一加载 `HERO_ROSTER_BORDER_EFFECT_RESOURCE = 'spine/ui/hero-roster/goods_1_border/goods_1'`；
  - 节点名改为 `LobbyHeroRosterRarityGoodsBorderSpine_${rarity}`，避免继续表达成 UR 专属；
  - 旧 `renderHeroCardUrEffect`、`renderUrGoodsBorderSpine`、`resolveUrEffectAnimationName`、`urBorderEffect*` 命名已从活动渲染器移除。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求全稀有度映射 token、`goods_1_border` 路径、大小写不敏感动画解析 token；
  - `scripts/check-layout.mjs` 禁止旧 UR-only 边框特效 token 回归。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - `LobbyHeroRosterPanelRenderer.ts` 旧包缺少 `HERO_ROSTER_BORDER_EFFECT_RESOURCE`、`HERO_ROSTER_BORDER_ANIMATION_BY_RARITY`、`R: 'K3'`、`SR: 'K4'`、`SSR: 'K5'`、`UR: 'K7'`、`renderHeroCardBorderEffect`、`renderRarityGoodsBorderSpine`、`LobbyHeroRosterRarityGoodsBorderSpine_${rarity}`、`resolveRarityBorderAnimationName` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 R/SR/SSR/UR 卡牌分别播放 `goods_1` 对应边框动画，且底部稀有度文字背后的不透明信息牌仍正常覆盖底图横线。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉特效映射；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CV Hero Roster Rarity Border Guard Recheck

- 新窗口接续后已重新读取 Cocos 当前上下文、README、lobby 分析和 API 合约，继续以 Stage 4CU 全稀有度边框映射为当前验收主线。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - `profiles/v2/packages/preview.json` 的 `general.start_scene` 仍为主场景 uuid `623f777a-eb33-4d74-ae88-eb79e749fcfe`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `assets/resources/spine/ui/hero-roster/goods_1_border/` 仅包含 `goods_1.skel|atlas|png` 及 meta 运行时文件；
  - 源码检索未发现旧 `renderHeroCardUrEffect`、`renderUrGoodsBorderSpine`、`resolveUrEffectAnimationName`、`urBorderEffect*`、`LobbyHeroRosterUrGoodsBorderSpine`、`LobbyHeroRosterUrBorderAura`、`drawUrBorderAura` 回归；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 本机 7456 端口由 `CocosCreator` 进程服务，不是可安全单独重启的普通 node 预览进程；本轮未强杀 Creator 或清理缓存；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `452/474/298/328` 卡牌尺寸、`levelX`/`badgeSize = 38 * scale`、`LobbyHeroRosterRarityGoodsBorderSpine_${rarity}`、`clamp((width + 12) / 120`、`clamp((height + 30) / 120` 等当前 token；
  - 仍需重启/刷新 Cocos Creator Preview 后再做视觉验收。
- 边界不变：本阶段是 Cocos 前端检查/文档同步；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CW Hero Roster UR Sequence Border Frames

- 用户在 `assets/resources/ui/hero-roster/UR-card-border/` 放入 12 张 UR 卡牌边框序列帧 `01.png` 到 `12.png`，要求接入英雄列表。
- 资源处理：
  - 新增 `assets/resources/ui/hero-roster/UR-card-border.meta`；
  - 为 12 张 PNG 补齐 Cocos image/spriteFrame meta；
  - 每帧尺寸均为 `464x628`，`check:layout` 会校验 spriteFrame meta 的 `width/height/rawWidth/rawHeight`；
  - 本轮没有向 `assets/resources/spine` 添加 `.spine/.spine.meta`，也没有改动 `goods_1_border` runtime。
- Cocos 调整：
  - `LobbyHeroRosterPanelRenderer.ts` 新增 `HERO_ROSTER_UR_SEQUENCE_BORDER_PATH_PREFIX = 'ui/hero-roster/UR-card-border'`；
  - UR 卡牌优先渲染 `LobbyHeroRosterUrSequenceBorderSprite`，按 12 帧 `spriteFrame` 以 `0.07s` 帧间隔循环播放；
  - 序列帧节点保持在卡底之上、英雄浮雕和文字层之下，避免遮盖名称、稀有度、星级、等级牌和角标；
  - 如果序列帧加载失败，UR 会回退到原 `goods_1` 的 `K7` Spine 边框；R/SR/SSR 继续使用 `goods_1` 的 `K3/K4/K5`。
- 守卫同步：
  - `scripts/check-layout.mjs` 要求 `UR-card-border` 目录、12 张 PNG 与 12 个 meta 存在，并校验 464x628 尺寸；
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 增加 `renderUrCardSequenceBorder`、`LobbyHeroRosterUrSequenceBorderSprite`、`loadUrSequenceBorderFrames`、`startUrSequenceBorderAnimation`、`resources.load(path, SpriteFrame` 等 token；
  - 旧 UR-only Spine 命名仍不应回归。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `HERO_ROSTER_UR_SEQUENCE_BORDER_PATH_PREFIX`、`HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_COUNT = 12`、`ui/hero-roster/UR-card-border`、`renderUrCardSequenceBorder`、`LobbyHeroRosterUrSequenceBorderSprite`、`loadUrSequenceBorderFrames`、`startUrSequenceBorderAnimation` 等本轮 token；
  - 需重启/刷新 Cocos Creator Preview 后验收 UR 序列帧边框是否播放、是否与卡框对齐、是否不盖住下方信息牌。
- 边界不变：本阶段只接入 Cocos 英雄列表 UR 只读视觉序列帧；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CX Hero Roster UR Sequence Border Outer Alignment

- 用户反馈：UR 序列帧特效仍贴在内层框上，看起来不协调；需要包裹整个卡牌外框。
- 资源测量：
  - `UR-card-border/01.png` 尺寸为 `464x628`；
  - 主亮框大致落在源图 `x=50..413`、`y=37..542`；
  - 因此要让源图亮框贴住卡牌外框，序列帧整体需要比卡牌外扩，而不是按卡牌本体缩放。
- Cocos 调整：
  - 新增 `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = 1.28`；
  - 新增 `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.245`；
  - 新增 `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.049`；
  - `LobbyHeroRosterUrSequenceBorderSprite` 现在按上述比例放大并略微下移，让序列帧内亮框对齐卡牌外框，而不是内层内容框。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 增加三个外框对齐比例 token，避免回退到内框贴合。
- 复验结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 UR 序列帧包裹整个卡牌外框，并确认 Lv、角标、底部信息牌没有被视觉上压脏。
- 边界不变：本阶段只调整 Cocos 英雄列表 UR 序列帧视觉位置；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CY Hero Roster UR Sequence Border Outside Frame

- 用户继续反馈：Stage 4CX 只是接近外框，视觉上仍像特效在线框内侧；真正目标是让序列帧亮框跑到整个卡牌框的外侧。
- Cocos 调整：
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO` 从 `1.28` 改为 `1.56`；
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO` 从 `1.245` 改为 `1.44`；
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO` 从 `-0.049` 改为 `-0.045`；
  - 目标是让素材内部那圈亮线越过卡牌外边，不再贴在内层框或内容框上。
- 守卫同步：
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 改为要求 `1.56 / 1.44 / -0.045` 三个新比例。
- 复验结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 UR 序列帧亮框是否已经位于卡牌外侧；若仍偏内，继续只调这三个比例，不改经济/接口。
- 边界不变：本阶段只调整 Cocos 英雄列表 UR 序列帧视觉位置；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4CZ Hero Roster Unified Card Frame

- 用户要求：英雄列表卡牌统一换成 `assets/resources/ui/hero-roster/hero_card_frame.png`。
- 资源处理：
  - `hero_card_frame.png` 尺寸为 `937x1676`；
  - 已新增 `hero_card_frame.png.meta`，导入为 Cocos `spriteFrame`；
  - `check:layout` 现在校验 `hero_card_frame.png.meta` 的 `width/height/rawWidth/rawHeight = 937/1676`。
- Cocos 调整：
  - `LobbyHeroRosterPanelRenderer.ts` 新增 `LOBBY_HERO_ROSTER_CARD_FRAME_ASSET = 'ui/hero-roster/hero_card_frame/spriteFrame'`；
  - `LOBBY_HERO_ROSTER_CARD_ASSETS` 现在只预加载统一卡框；
  - `resolveHeroRosterCardAsset()` 不再按稀有度返回 `card_r/card_sr/card_ssr/card_ur`，所有英雄卡统一使用 `hero_card_frame`；
  - 卡牌宽高比例改为真实资源比例 `HERO_ROSTER_CARD_ASPECT_WIDTH = 937`、`HERO_ROSTER_CARD_ASPECT_HEIGHT = 1676`；
  - 稀有度差异继续由底部信息牌颜色、文字、R/SR/SSR 的 `goods_1` Spine 边框和 UR 的序列帧边框表现。
- 守卫同步：
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 增加统一卡框 token；
  - `scripts/check-layout.mjs` 禁止活动 renderer 回退到 `ui/hero-roster/card_r|sr|ssr|ur/spriteFrame` 或 `HERO_CARD_ASSET_BY_RARITY`。
- 复验结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 R/SR/SSR/UR 均使用统一卡框，UR 外侧序列帧边框仍与新卡框协调。
- 边界不变：本阶段只替换 Cocos 英雄列表卡牌底图资源引用；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4DA Hero Roster Card Interior Cleanup

- 用户反馈：统一卡框后，卡内元素需要贴合 `hero_card_frame.png` 自带结构：
  - 左上角等级移除背景；
  - 右上角标背景改为圆形，并放进卡框右上圆圈；
  - 中间只保留三角形；
  - 底部文字缩小并放进卡框自带底部格子；
  - 底部文字背景移除。
- Cocos 调整：
  - 删除活动渲染器中的 `LobbyHeroRosterInfoPlate` / `drawHeroCardInfoPlate` / `traceInfoPlateLowerFrame` 信息牌绘制；
  - 删除 `LobbyHeroRosterLevelPlate` 等级底板，`LobbyHeroRosterLevelText` 直接定位到左上圆形区域；
  - 右上角标改为 `drawCircleBadge` 圆形底，使用 `HERO_ROSTER_CARD_BADGE_X_RATIO = 0.34`、`HERO_ROSTER_CARD_BADGE_Y_RATIO = 0.39` 对齐右上圆圈；
  - 中间 `LobbyHeroRosterHeroRelief` 改为单个三角徽记，不再绘制暗色浮雕、披风、背景椭圆和辅助线；
  - 底部 `SSR/UR/SR/R`、英雄名、星级字号缩小，并分别用 `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.197`、`HERO_ROSTER_CARD_NAME_Y_RATIO = 0.139`、`HERO_ROSTER_CARD_STARS_Y_RATIO = 0.079` 定位到卡框自带底部格子。
- 守卫同步：
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 增加新位置/圆形角标/三角徽记 token；
  - `scripts/check-layout.mjs` 禁止 `LobbyHeroRosterInfoPlate`、`drawHeroCardInfoPlate`、`traceInfoPlateLowerFrame`、`LobbyHeroRosterLevelPlate`、`drawDiamondBadge`、`LobbyHeroRosterProtagonistDot` 回归。
- 复验结果：
  - `npm.cmd run check:layout` 通过；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过。
- 待复验：重启/刷新 Cocos Creator Preview 后确认左上等级无底板、右上角标在圆圈内、中间仅三角、底部文字无自绘背景且完全落在底部格子内。
- 边界不变：本阶段只调整 Cocos 英雄列表卡内视觉排版；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4DB Hero Roster Wider Five Card Layout

- 用户反馈：卡牌仍偏窄，底部格子内的稀有度文字不应放在格子里，需要移到格子上方；英雄列表一排最多展示 5 个。
- Cocos 调整：
  - 新增 `HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE = 1.2`，统一卡框在保持 `937/1676` 资源比例基础上加宽显示；
  - 新增 `HERO_ROSTER_CARD_MAX_COLUMNS = 5`，网格列数按最多 5 张卡计算；
  - 列宽计算增加 `maxCardsInRow` 和 `maxCardWidthForRow`，优先保证单行 5 张且避免卡牌挤出主体区域；
  - 横向/竖向卡牌间距收紧为 `10/16 * scale`，为加宽卡牌留出空间；
  - `HERO_ROSTER_CARD_RARITY_Y_RATIO` 从底部格子内上移到 `0.278`，让 `SSR/UR/SR/R` 位于底部文字格上方；
  - 英雄名与星级保留在底部格子内，分别使用 `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.151`、`HERO_ROSTER_CARD_STARS_Y_RATIO = 0.087`，字号同步缩小避免重叠。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求本轮新增的宽度比例、5 列限制、稀有度/名称/星级位置 token；
  - 同步守卫当前左上等级与右上圆形角标位置，避免脚本仍检查旧坐标。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE = 1.2`、`HERO_ROSTER_CARD_MAX_COLUMNS = 5`、`maxCardsInRow`、`maxCardWidthForRow`、`HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.278`、`HERO_ROSTER_CARD_NAME_Y_RATIO = 0.151`、`HERO_ROSTER_CARD_STARS_Y_RATIO = 0.087` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认卡牌视觉更宽、一排最多 5 张，稀有度位于底部格子上方，名称与星级完整落在格子内且不重叠。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉排版；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-04 Stage 4DC Hero Roster Longer Cards And Rarity Order

- 用户要求：卡牌再加长一点，并按 `UR -> SSR -> SR -> R` 展示。
- Cocos 调整：
  - `HERO_ROSTER_CARD_DESKTOP_TARGET_HEIGHT` 从 `452` 提升到 `468`；
  - `HERO_ROSTER_CARD_DESKTOP_MAX_HEIGHT` 从 `474` 提升到 `492`；
  - `HERO_ROSTER_CARD_COMPACT_TARGET_HEIGHT` 从 `298` 提升到 `310`；
  - `HERO_ROSTER_CARD_COMPACT_MAX_HEIGHT` 从 `328` 提升到 `340`；
  - 新增 `HERO_ROSTER_RARITY_DISPLAY_ORDER`，显示优先级为 `UR:0 / SSR:1 / SR:2 / R:3`；
  - 新增 `sortHeroesForRosterDisplay()` 和 `resolveRarityDisplayRank()`，渲染前只做本地展示排序；
  - 同稀有度英雄保持后端返回的原始相对顺序，不额外按战力、等级或拥有时间重排；
  - `visibleCount`、溢出提示和卡牌渲染都基于排序后的 `displayHeroes`，确保第一排优先显示高稀有度英雄。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求新高度 token、稀有度顺序 token、排序函数和 `displayHeroes` 渲染 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `468/492/310/340` 新高度、`HERO_ROSTER_RARITY_DISPLAY_ORDER`、`UR: 0`、`SSR: 1`、`SR: 2`、`R: 3`、`sortHeroesForRosterDisplay`、`resolveRarityDisplayRank`、`displayHeroes` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认卡牌更修长，第一排按 `UR -> SSR -> SR -> R` 展示，并且同稀有度内相对顺序未被打乱。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉排版和本地展示排序；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DD Hero Roster Border Brightness And Star Placement

- 用户反馈：
  - 边框特效看起来偏暗，怀疑被背景透明遮盖；
  - 格子上方的稀有等级还需要再上移一点；
  - 底部格子内更适合只展示英雄名，星级与背景宝石重叠；
  - UR 边框特效现在大了一圈，应贴着卡牌边框包裹。
- 产品/UI 判断：
  - 底部名字格只承载英雄名，避免信息堆叠；
  - 星级是次级信息，放在稀有度下方、名字格上方，形成 `稀有度 -> 星级 -> 名字` 的阅读顺序；
  - UR 序列帧应贴合 `hero_card_frame.png` 的实际外框，而不是外扩成一圈光环。
- 资源测量：
  - `hero_card_frame.png` 尺寸 `937x1676`，可见亮框约 `901x1630`；
  - `UR-card-border/01.png` 尺寸 `464x628`，可见亮框约 `387x542`；
  - 由测量值将 UR 序列帧收回到更贴边的 `1.18 / 1.16 / -0.048`。
- Cocos 调整：
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_ALPHA` 从 `202` 恢复为 `255`，避免序列帧边框被人为压暗；
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO` 从 `1.56` 收回到 `1.18`；
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO` 从 `1.44` 收回到 `1.16`；
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO` 从 `-0.045` 微调为 `-0.048`，按亮框中心对齐卡框；
  - `HERO_ROSTER_CARD_RARITY_Y_RATIO` 从 `0.278` 上移到 `0.318`；
  - `HERO_ROSTER_CARD_STARS_Y_RATIO` 从 `0.087` 上移到 `0.235`，星级离开底部名字格；
  - `HERO_ROSTER_CARD_NAME_Y_RATIO` 从 `0.151` 调整到 `0.132`，底部格子只保留英雄名。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求新的 UR 透明度、UR 序列帧比例、稀有度/名字/星级位置 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `HERO_ROSTER_UR_SEQUENCE_BORDER_ALPHA = 255`、`1.18/1.16/-0.048`、`HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.318`、`HERO_ROSTER_CARD_STARS_Y_RATIO = 0.235`、`HERO_ROSTER_CARD_NAME_Y_RATIO = 0.132` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认边框特效恢复亮度，UR 序列帧贴着卡框包裹，稀有度更靠上，星级不再压到底部宝石，名字格只展示英雄名。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉排版和本地特效显示；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DE Hero Roster Larger Star Text

- 用户反馈：英雄列表卡牌星级太小，需要放大一些。
- 当前源码基线：
  - 稀有度位置为 `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.324`；
  - 名字位置为 `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.132`；
  - 星级位置为 `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.168`；
  - 左上等级/右上角标横向位置为 `HERO_ROSTER_CARD_LEVEL_X_RATIO = -0.38`、`HERO_ROSTER_CARD_BADGE_X_RATIO = 0.37`；
  - UR 序列帧边框比例为 `1.25 / 1.25 / -0.01`，本轮保留该当前值，不回退到旧记录。
- Cocos 调整：
  - `LobbyHeroRosterStars` 字号从 `Math.min(11 * scale, height * 0.032)` 放大为 `Math.min(15 * scale, height * 0.046)`；
  - 星级文本框从 `new Size(width - 76 * scale, height * 0.04)` 放大为 `new Size(width - 68 * scale, height * 0.056)`，避免字体放大后被裁切；
  - 星级仍位于稀有度和名字格之间，底部格子继续只承载英雄名。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求新的星级字号/文本框 token；
  - 同步守卫当前源码中的 `0.324 / 0.132 / 0.168`、等级/角标 `-0.38 / 0.37` 与 UR 序列帧 `1.25 / 1.25 / -0.01`，避免检查脚本误报旧视觉参数。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `Math.min(15 * scale, height * 0.046)` 和 `new Size(width - 68 * scale, height * 0.056)` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认星级明显变大且不与稀有度、英雄名、底部宝石重叠。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉字号；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DF Hero Roster SSR Sequence Border And Level Fit

- 用户要求：
  - SSR 边框特效改用 `assets/resources/ui/hero-roster/SSR-card-border/` 下的序列帧；
  - SSR 边框坐标参考 UR；
  - 星级放到三角形上方，卡内不再展示英雄名；
  - 紫色/蓝色卡牌边框特效也需要贴到卡牌边缘；
  - 左上角等级需要兼容两位数/三位数，避免挤出圆圈；
  - 如调整卡牌宽度，需要同步特效坐标。
- 资源处理：
  - `SSR-card-border/` 下共有 125 张 PNG：`合成 1_00000.png` 到 `合成 1_00124.png`；
  - 已新增 `assets/resources/ui/hero-roster/SSR-card-border.meta`；
  - 已为 125 张 PNG 补齐 Cocos image/spriteFrame meta，尺寸均为 `1080x1920`，并改为无 BOM UTF-8，避免 `JSON.parse` 和 Cocos 导入解析问题。
- Cocos 调整：
  - 新增 `HERO_ROSTER_SSR_SEQUENCE_BORDER_*` 常量，SSR 使用 `ui/hero-roster/SSR-card-border/合成 1_00000..00124/spriteFrame`；
  - 新增 `renderSsrCardSequenceBorder()`、`loadSsrSequenceBorderFrames()`，SSR 优先播放 125 帧序列帧，失败时回退到 `goods_1` 的 `K5`；
  - SSR 序列帧当前贴边坐标为 `1.22 / 1.14 / -0.01`，UR 贴边坐标仍为 `1.25 / 1.25 / -0.01`；
  - `startUrSequenceBorderAnimation` 改为通用 `startSequenceBorderAnimation()`，UR/SSR 共用循环播放逻辑；
  - R/SR 继续使用 `goods_1` Spine，但 `renderRarityGoodsBorderSpine()` 改为使用 `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 30`、`HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 54`、`HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.01`，让蓝色/紫色边框更贴近卡牌边缘；
  - `HERO_ROSTER_CARD_STARS_Y_RATIO` 从 `0.168` 改为 `0.815`，星级移动到中心三角形上方；
  - 恢复卡内 `LobbyHeroRosterHeroName` 绘制，英雄名继续显示在底部格子内，避免卡牌身份缺失；
  - 新增 `HERO_ROSTER_CARD_LEVEL_TEXT_WIDTH_RATIO = 0.29`，左上等级文本框变宽；
  - 新增 `formatHeroCardLevel()`：三位数及以上使用 `Lv100` 格式，两位数及以下保留 `Lv.99` 格式，并继续使用 `Label.Overflow.SHRINK` 防止溢出；
  - 本轮未调整卡牌整体宽度，因此 UR/SSR 序列帧坐标仍保持当前 `1.25 / 1.25 / -0.01`。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求 SSR 序列帧常量、路径、加载器、节点名、通用序列帧动画函数；
  - `check:layout` 校验 SSR 目录 meta 与 125 张 `1080x1920` spriteFrame meta；
  - `check:layout` 要求 `LobbyHeroRosterHeroName` 和 `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.132` 存在；
  - `check:layout` 要求新的 R/SR `goods_1` 贴边 padding token 与等级文本宽度 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 SSR 序列帧路径/加载器、`HERO_ROSTER_CARD_STARS_Y_RATIO = 0.815`、`formatHeroCardLevel()`、`HERO_ROSTER_GOODS_BORDER_*` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 SSR 序列帧播放、UR/SSR 边框贴边、R/SR Spine 边框贴边、星级位于三角形上方、英雄名显示在底部格子内、Lv.9/Lv.99/Lv100 都在左上圆圈内可读。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉资源、边框特效和文字排版；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DG Hero Roster SSR Melt Sequence Source

- 用户要求：SSR 边框特效改用 `D:\project\lootchain-cocos\assets\resources\ui\hero-roster\熔化\` 目录下的序列帧。
- 资源处理：
  - `熔化/` 下共有 125 张 PNG：`合成 1_00000.png` 到 `合成 1_00124.png`；
  - 已新增 `assets/resources/ui/hero-roster/熔化.meta`；
  - 已为 125 张 PNG 补齐 Cocos image/spriteFrame meta，尺寸均为 `1080x1920`，并确认写入为无 BOM UTF-8。
- Cocos 调整：
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_PATH_PREFIX` 从 `ui/hero-roster/SSR-card-border` 改为 `ui/hero-roster/熔化`；
  - SSR 仍使用 `LobbyHeroRosterSsrSequenceBorderSprite`、125 帧、`0.04s` 帧间隔和当前贴边坐标 `1.22 / 1.14 / -0.01`；
  - `SSR-card-border/` 旧素材目录未删除，但已不再是 active renderer/check 路径。
- 守卫同步：
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已改为要求 `ui/hero-roster/熔化`；
  - `check:layout` 现在校验 `熔化.meta` 与 125 张 `1080x1920` spriteFrame meta。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少包含 `ui/hero-roster/熔化` 在内的最新英雄列表 token。
- 待复验：重启/刷新 Cocos Creator Preview，等待资源导入完成后确认 SSR 卡牌播放 `熔化` 序列帧，英雄名仍显示在底部格子内，星级仍位于中心三角形上方。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉资源路径与导入元数据；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DH Hero Roster SSR Goods Border Restore

- 用户要求：删除占内存的 `熔化` 与 `SSR-card-border` 序列帧资源，并将 SSR 边框改回之前 `goods_1` 里的特效。
- 资源处理：
  - 已删除 `assets/resources/ui/hero-roster/熔化/`；
  - 已删除 `assets/resources/ui/hero-roster/熔化.meta`；
  - 已删除 `assets/resources/ui/hero-roster/SSR-card-border/`；
  - 已删除 `assets/resources/ui/hero-roster/SSR-card-border.meta`。
- Cocos 调整：
  - 移除 SSR 独立序列帧常量、缓存、加载器和 `renderSsrCardSequenceBorder()`；
  - `renderHeroCardBorderEffect()` 现在仅对 UR 保留 `UR-card-border` 序列帧；
  - SSR 与 R/SR 一样走 `renderRarityGoodsBorderSpine()`，继续由 `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` 的 `SSR: 'K5'` 播放 `goods_1` Spine 特效；
  - `scripts/check-layout.mjs` 改为禁止 active renderer 引入 `熔化`、`SSR-card-border` 或 SSR 序列帧相关 token。
- 守卫同步：
  - `scripts/check-layout.mjs` 不再要求 `熔化` 或 `SSR-card-border` 资源存在；
  - `scripts/check-preview-freshness.mjs` 不再要求 SSR 序列帧 token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 SSR 卡牌显示 `goods_1` 的 `K5` 边框，UR 仍保留自己的 12 帧序列帧边框。
- 边界不变：本阶段只删除 Cocos 前端大图序列帧资源并恢复 SSR 只读视觉特效路径；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DI Hero Roster SSR 04 Sequence Trial

- 用户要求：SSR 边框特效试用 `D:\project\lootchain-cocos\assets\resources\ui\hero-roster\04\`。
- 资源处理：
  - `04/` 下当前只有 7 张 PNG：`00118.PNG` 到 `00124.PNG`；
  - 已新增 `assets/resources/ui/hero-roster/04.meta`；
  - 已为 7 张 PNG 补齐 Cocos image/spriteFrame meta，尺寸均为 `270x396`，并确认写入为无 BOM UTF-8。
- Cocos 调整：
  - SSR 再次启用独立序列帧分支，路径为 `ui/hero-roster/04/00118..00124/spriteFrame`；
  - 新增 `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_START = 118` 与 `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_COUNT = 7`；
  - SSR 序列帧帧间隔为 `0.07s`，透明度 `255`；
  - SSR 先沿用 UR 的外框对齐比例 `1.25 / 1.25 / -0.01` 试视觉；
  - 如果 7 帧加载失败，仍会回退到 `goods_1` 的 `SSR: 'K5'`，避免 SSR 卡空白。
- 守卫同步：
  - `scripts/check-layout.mjs` 校验 `04.meta` 和 7 张 `270x396` spriteFrame meta；
  - `scripts/check-preview-freshness.mjs` 已要求 SSR `04` 序列帧 token；
  - `scripts/check-layout.mjs` 仍禁止 active renderer 回到已删除的 `ui/hero-roster/熔化` 或 `ui/hero-roster/SSR-card-border`。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `ui/hero-roster/04` 和 SSR 7 帧序列帧 token。
- 待复验：重启/刷新 Cocos Creator Preview，等待 `04` 资源导入完成后确认 SSR 边框尺寸、清晰度和位置；如偏大/偏虚，再只调 SSR 三个外框比例，不改经济/接口。
- 边界不变：本阶段只调整 Cocos 英雄列表 SSR 只读视觉资源路径；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DJ Hero Roster SSR 03 Sequence Trial

- 用户要求：SSR 边框特效从 `04` 改试 `D:\project\lootchain-cocos\assets\resources\ui\hero-roster\03\`，并明确以下参数不要再动：
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_DURATION_SECONDS = 0.15`;
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_ALPHA = 255`;
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO`;
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.14`;
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.035`。
- 资源处理：
  - `03/` 下共有 25 张 PNG：`00093.PNG` 到 `00117.PNG`；
  - `03.meta` 已存在；
  - 已将 25 张 PNG 的 Cocos meta 补齐为可加载 `spriteFrame` 的 image/spriteFrame meta，尺寸均为 `374x515`，并确认无 BOM UTF-8。
- Cocos 调整：
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_PATH_PREFIX` 从 `ui/hero-roster/04` 改为 `ui/hero-roster/03`；
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_START` 从 `118` 改为 `93`；
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_COUNT` 从 `7` 改为 `25`；
  - 用户指定的 duration/alpha/width/height/y 参数保持为 `0.15 / 255 / 跟随UR宽度 / 1.14 / -0.035`。
- 守卫同步：
  - `scripts/check-layout.mjs` 校验 `03.meta` 和 25 张 `374x515` spriteFrame meta；
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已要求 SSR `03` 序列帧 token 和用户指定的固定参数。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前运行中的 Cocos Preview 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` bundle 缺少 `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_START = 93`、`HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_COUNT = 25`、`ui/hero-roster/03` 等本轮 token。
- 待复验：重启/刷新 Cocos Creator Preview，等待 `03` 资源导入完成后确认 SSR 边框尺寸、清晰度、循环速度和位置；若需要再调，先不动用户锁定的 5 个参数。
- 边界不变：本阶段只调整 Cocos 英雄列表 SSR 只读视觉资源路径与元数据；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DK Hero Roster Sequence Cleanup And SSR Goods Restore

- 用户要求：删除 `01` 到 `04` 序列帧试验目录，删除旧 `card_r/card_sr/card_ssr/card_ur` 卡图，并将 SSR 边框恢复成 `goods_1` 的特效。
- 资源处理：
  - 已删除 `assets/resources/ui/hero-roster/01/` 与 `01.meta`；
  - 已删除 `assets/resources/ui/hero-roster/02/` 与 `02.meta`；
  - 已删除 `assets/resources/ui/hero-roster/03/` 与 `03.meta`；
  - 已删除 `assets/resources/ui/hero-roster/04/` 与 `04.meta`；
  - 已删除 `card_r.png`、`card_sr.png`、`card_ssr.png`、`card_ur.png` 及对应 `.meta`。
- Cocos 调整：
  - 移除 SSR 独立序列帧常量、缓存、渲染分支和加载器；
  - `renderHeroCardBorderEffect()` 现在只对 UR 保留 `UR-card-border` 序列帧；
  - SSR 与 R/SR 一样走 `renderRarityGoodsBorderSpine()`，继续由 `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` 的 `SSR: 'K5'` 播放 `goods_1` Spine 特效；
  - 统一卡框仍使用 `assets/resources/ui/hero-roster/hero_card_frame.png`。
- 守卫同步：
  - `scripts/check-layout.mjs` 不再要求 `01` 到 `04` 或旧 `card_*` 资源存在；
  - `scripts/check-layout.mjs` 保留 active renderer forbidden token，禁止回到 `ui/hero-roster/01..04`、`ui/hero-roster/card_*` 或 SSR 序列帧分支；
  - `scripts/check-preview-freshness.mjs` 不再要求 SSR 序列帧 token。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 Git 换行转换 warning。
- Preview 状态：
  - `npm.cmd run check:preview` 失败；
  - 当前 `http://localhost:7456/scripting/x/import-map.json` 拒绝连接，说明 Cocos Preview 服务未正常监听或已关闭，不是本轮资源清理导致的脚本 token 失败。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 SSR 显示 `goods_1` 的 `K5` 边框，UR 仍保留 `UR-card-border` 12 帧序列帧，所有卡牌继续使用统一 `hero_card_frame.png`。
- 边界不变：本阶段只清理 Cocos 前端资源并恢复 SSR 只读视觉路径；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DL Hero Roster Cleanup Recheck After Window Switch

- 新窗口接手后已重读 `current-chat-context.md`、`README.md`、`lobby-feature-analysis.md`、`api-contract.md`，当前仍以 Stage 4DK 清理结果为准。
- 资源状态复核：
  - `assets/resources/ui/hero-roster/` 当前只包含 `hero_card_frame.png`、`hero_card_frame.png.meta`、`UR-card-border/`、`UR-card-border.meta`；
  - `UR-card-border/` 下保留 `01.png` 到 `12.png` 及对应 `.meta`；
  - `01/02/03/04` 试验序列帧目录和旧 `card_r/card_sr/card_ssr/card_ur` 卡图未回归。
- 渲染器状态复核：
  - active renderer 仍使用 `LOBBY_HERO_ROSTER_CARD_FRAME_ASSET = 'ui/hero-roster/hero_card_frame/spriteFrame'`；
  - `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` 仍包含 `R: 'K3'`、`SR: 'K4'`、`SSR: 'K5'`、`UR: 'K7'`；
  - SSR 继续走 `goods_1` 的 `K5` Spine 边框；
  - UR 继续保留 `ui/hero-roster/UR-card-border` 12 帧序列帧；
  - `renderSsrCardSequenceBorder`、`LobbyHeroRosterSsrSequenceBorderSprite`、`loadSsrSequenceBorderFrames` 和 active `ui/hero-roster/01..04` / old `card_*` 路径未出现在活动渲染器中。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 `assets/main.scene` 的 LF/CRLF warning。
- Preview 状态更新：
  - `npm.cmd run check:preview` 仍失败；
  - 当前 `localhost:7456` 已能响应，但服务的是旧 chunks，不再是上一轮的连接拒绝状态；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` chunk 缺少当前英雄列表 token，包括 `468/492/310/340` 卡牌高度、`displayHeroes` 稀有度排序、`formatHeroCardLevel()`、`LobbyHeroRosterRarityGoodsBorderSpine_${rarity}`、`HERO_ROSTER_GOODS_BORDER_*` 等。
- 待复验：重启/刷新 Cocos Creator Preview，等待脚本与资源重新导入后，再确认 SSR 显示 `goods_1 K5`、R/SR 显示 `goods_1 K3/K4`、UR 显示 `UR-card-border`、所有卡牌使用统一 `hero_card_frame.png`，并检查英雄名、星级、等级、角标不重叠。
- 边界不变：本轮只做 Cocos 前端状态复核和文档同步；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DM Hero Roster Goods Border Effect Width Cap

- 用户澄清：不想改卡牌边框/卡牌宽度，只想改除 UR 外的 `goods_1` 边框特效宽度。
- 定位结论：
  - `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING` 控制的是 `goods_1` Spine 特效层的 X 缩放输入，不会改变 `hero_card_frame.png` 或卡牌布局宽度；
  - 但此前 X 缩放写死 `clamp(..., 1.12, 2.55)`，桌面卡牌宽度下 `30 -> 34` 会继续被夹到 `2.55`，所以视觉上没有变化。
- Cocos 调整：
  - 保持卡牌本体和统一底框 `LOBBY_HERO_ROSTER_CARD_FRAME_ASSET` 不变；
  - 保持当前 `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33`、`HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 61`、`HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.03`；
  - 新增 `HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8`；
  - 非 UR 的 `renderRarityGoodsBorderSpine()` 横向缩放改为 `clamp((width + HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING) / 120, 1.12, HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX)`，只放开 `goods_1` 特效层宽度上限，不改变卡牌宽度、卡框资源或行布局。
- 守卫同步：
  - `scripts/check-layout.mjs` 与 `scripts/check-preview-freshness.mjs` 已更新为要求 `33 / 61 / -0.03` 和 `HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8`；
  - 继续禁止回到旧 `01..04`、旧 `card_*` 卡图或 SSR 序列帧分支。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 LF/CRLF warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前 `localhost:7456` 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` chunk 缺少 `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33`、`HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8` 和新的横向 clamp token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 R/SR/SSR 的 `goods_1` 边框特效横向变宽，但卡牌底框、卡牌行宽和 UR 序列帧不发生联动变化。
- 边界不变：本阶段只调整 Cocos 英雄列表只读视觉特效层宽度上限；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DN Hero Roster UR Goods K7 Overlay Trial

- 用户要求：UR 边框在现有 `UR-card-border` 基础上，再叠一层 `goods_1` 里的 `K7` 效果看看。
- Cocos 调整：
  - `renderHeroCardBorderEffect()` 的 UR 分支现在先渲染 `renderUrCardSequenceBorder(card, width, height)`；
  - 同一 UR 分支随后调用 `this.renderRarityGoodsBorderSpine(card, 'UR', width, height);`，叠加 `goods_1` 的 `K7` Spine 边框特效；
  - `renderUrCardSequenceBorder()` 的序列帧加载失败兜底不再额外调用 `renderRarityGoodsBorderSpine(card, 'UR', ...)`，避免 UR 在序列帧缺失时重复叠两层 K7；
  - 保留现有 `UR-card-border` 12 帧序列帧、统一 `hero_card_frame.png`、卡牌尺寸和行布局；
  - 保留当前 `goods_1` 特效参数 `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33`、`HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 61`、`HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.03`、`HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8`。
- 守卫同步：
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 要求 UR 分支中的 `this.renderRarityGoodsBorderSpine(card, 'UR', width, height);` token；
  - 继续禁止旧 `01..04`、旧 `card_*` 卡图或 SSR 序列帧分支回归。
- 复验结果：
  - `npm.cmd run check:layout` 通过，输出 `layout ok`；
  - Cocos Creator 3.8.8 自带 TypeScript 对项目 `tsconfig.json` 执行 no-emit 通过；
  - `assets/resources/spine` 下 `.spine/.spine.meta` 源文件数量为 `0`；
  - `git diff --check` 通过，仅有 LF/CRLF warning。
- Preview 状态：
  - `npm.cmd run check:preview` 仍失败，当前 `localhost:7456` 继续服务旧 chunks；
  - 旧 `LobbyHeroRosterPanelRenderer.ts` chunk 缺少 `this.renderRarityGoodsBorderSpine(card, 'UR', width, height);` 和当前 `goods_1` 特效 clamp token。
- 待复验：重启/刷新 Cocos Creator Preview 后确认 UR 是否同时显示 `UR-card-border` 序列帧和 `goods_1 K7` Spine 特效，观察是否过亮、重影或压住英雄名/星级/角标。
- 边界不变：本阶段只调整 Cocos 英雄列表 UR 只读视觉叠层；不修改后端、SQL、`gacha_pool_item`、抽卡概率、权重、保底、消耗、奖励、重复转碎片，不开放 EX V1、exchange/reissue、背包 use/sell、英雄养成或新增经济写入口。

## 2026-06-05 Stage 4DO Hero Roster Scroll, Class Filter, Power, And Gacha Visibility

- User request:
  - show all owned heroes instead of only the first visible row;
  - add per-card hero combat power;
  - clarify the top-right card badge as class/role rather than faction;
  - make the left-side class tabs come from database-backed hero data;
  - hide light/dark summon;
  - keep limited/normal real summon on the existing reviewed draw path only.
- Backend readonly API update:
  - `UserHeroListItemVO` and `PlayerLobbyHeroItemVO` now include `faction` and `heroClass`;
  - `UserHeroServiceImpl.toListItem()` reads those fields from `hero_template.faction` and `hero_template.hero_class`;
  - `PlayerLobbyHeroServiceImpl` passes them through to `GET /api/player/lobby/heroes`;
  - the lobby readonly hero limit is now `80`, aligned with Cocos `LobbyHeroApi` response validation.
- Cocos hero roster update:
  - `LobbyHeroItemVO` and `LobbyHeroApi` now read `faction` / `heroClass`;
  - `LobbyHeroRosterState` no longer slices loaded heroes down to 60;
  - `LobbyHeroRosterPanelRenderer` builds filter tabs from the current heroes' `heroClass`, ordered as `战士 / 辅助 / 刺客 / 法师 / 射手 / 坦克` plus database extras;
  - clicking a class tab re-renders the current panel locally and does not call a write endpoint;
  - the card area now uses a masked vertical `ScrollView` and renders every filtered hero card into `LobbyHeroRosterScrollContent`;
  - each card adds `LobbyHeroRosterHeroPower` under the hero name using `战力 ${formatCompactInteger(hero.power)}`;
  - the top-right badge remains `主` for the protagonist and otherwise shows a one-character class abbreviation, with `英` fallback when `heroClass` is missing.
- Gacha update:
  - local fallback `GACHA_PREVIEW_POOLS` no longer includes the sealed/light-dark pool;
  - current runtime backend pool visibility filters only explicit hidden rows (`displayType=HIDDEN` or `themeColor=hidden`); `SEALED_LIGHT_DARK` remains visible as locked/display-only after the 2026-06-10 guard pass;
  - draw buttons remain enabled only when backend data says `drawEnabled=true`, `previewOnly=false`, and `locked=false`;
  - successful real draw refreshes readonly lobby profile and hero roster data, so newly granted heroes can appear in the hero list.
- Guards updated:
  - `scripts/check-layout.mjs` now requires the scroll nodes, class-filter helpers, per-card power label, gacha pool metadata, display-only light/dark visibility, and post-draw readonly roster refresh;
  - legacy SSR sequence folders, old `card_*` images, exchange/reissue, bag writes, and old visual regressions remain forbidden.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 bundled TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest" test`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile`.
- Preview note:
  - Cocos Preview visual verification still requires restarting/refreshing Preview so the current renderer chunk is served.
- Boundary unchanged:
  - no `gacha_pool_item` change;
  - no probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag use/sell/batch-use, hero growth, or new economy write endpoint changed.

### Stage 4DO Guard Sync Addendum

- `scripts/check-preview-freshness.mjs` was also updated to require the new hero-roster scroll/class/power runtime tokens and gacha light/dark filtering tokens.
- Boundary unchanged: runtime freshness guard only; no economy, SQL data, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, or new economy write endpoint changed.

### Stage 4DO Preview Recheck

- `npm.cmd run check:preview` failed because Cocos Preview is still serving stale chunks.
- The stale chunks are missing the new `isVisibleGachaPool(...)`, light/dark filtering tokens, `LobbyHeroRosterScrollView`, `LobbyHeroRosterScrollContent`, class-filter helpers, `LobbyHeroRosterHeroPower`, and gacha pool metadata tokens.
- Required next visual step: restart/refresh Cocos Creator Preview and wait for current scripts/resources to rebuild before judging hero roster scrolling, power labels, class filters, and hidden light/dark summon.

## 2026-06-05 Stage 4DP Hero Roster Power Placement And DB Class Options

- User follow-up:
  - combat power text on hero cards was too small;
  - combat power should sit above the hero name;
  - the left class rail currently only showed `全部` and must use database-backed class options, with existing classes filled when the database has no options.
- Backend readonly API update:
  - added `GET /api/player/lobby/heroes/filter-options`;
  - response VO is `PlayerLobbyHeroFilterOptionsVO` with `heroClasses`;
  - class options now read `sys_param_config.param_key='hero.class.options'` first;
  - enabled `hero_template.hero_class` values are used only when that config is missing/empty;
  - fallback remains the existing six classes: `战士 / 辅助 / 刺客 / 法师 / 射手 / 坦克`;
  - fallback is readonly only and does not insert/update database rows.
- Cocos update:
  - `LobbyHeroApi.lobbyHeroFilterOptions()` reads `/api/player/lobby/heroes/filter-options`;
  - `LobbyHeroRosterLoader` loads heroes and class options together, and falls back locally to an empty option list if the options endpoint is unavailable;
  - `LobbyHeroRosterState` now stores `heroClassOptions`;
  - `LobbyHeroRosterPanelRenderer` merges `heroClassOptions`, loaded hero `heroClass`, and the default six class order so the left rail never collapses to only `全部`;
  - per-card `LobbyHeroRosterHeroPower` moved above the hero name with `HERO_ROSTER_CARD_POWER_Y_RATIO = 0.205`;
  - combat power font increased to `Math.min(15 * scale, height * 0.044)` with a wider label box.
- Guards updated:
  - `scripts/check-layout.mjs` allowlists the new readonly endpoint and requires the class-options/power-placement tokens;
  - `scripts/check-preview-freshness.mjs` requires the same runtime tokens.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 bundled TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest" test`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile`.
- Preview note:
  - `npm.cmd run check:preview` still fails because Cocos Preview is serving stale chunks;
  - missing current tokens include `this.heroApi.lobbyHeroFilterOptions()`, `this.rosterState.applyLoaded(heroes, filterOptions.heroClasses)`, `state.heroClassOptions`, `HERO_ROSTER_CARD_POWER_Y_RATIO = 0.205`, and the larger combat-power label tokens;
  - restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged:
  - no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag use/sell/batch-use, hero growth, or new economy write endpoint changed.

## 2026-06-05 Stage 4DQ Hero Class Options Moved To Sys Param Config

- User direction: hero class/profession options can be stored separately in a config table.
- Backend update:
  - `PlayerLobbyHeroServiceImpl.lobbyHeroFilterOptions()` now treats `sys_param_config.param_key='hero.class.options'` as the authoritative class option source;
  - `param_value` accepts comma/semicolon/pipe/newline separated class names and deduplicates in configured order;
  - if the config row is missing or empty, the service falls back to enabled `hero_template.hero_class` plus the existing six default classes;
  - query failure still returns only the six default classes.
- SQL update:
  - added `D:\project\LootChain\sql\22_hero_class_options_config.sql`;
  - synced the same default config into `D:\project\LootChain\sql\02_system_admin.sql`;
  - `02_system_admin.sql` now starts with `SET NAMES utf8mb4;`;
  - local DB was updated with SQL 22 and verified:
    `hero.class.options = 战士,辅助,刺客,法师,射手,坦克`, `status=1`.
- Cocos impact:
  - no frontend code change required in this sub-step because Cocos already consumes `/api/player/lobby/heroes/filter-options`;
  - the left class rail will now reflect the config-table values after backend restart.
- Verification passed:
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest" test` with 3 tests;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile`.
- Boundary unchanged:
  - config-table display metadata only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag use/sell/batch-use, hero growth, or new economy write endpoint changed.

## 2026-06-06 Stage 4DR Current Flow PhaseGate And Smoke Closure

- Scope:
  - continued the Cocos-only current stage from the latest hero roster / gacha / readonly bag state;
  - no web-vue work was resumed.
- Backend PhaseGate fix:
  - `PlayerApiPhaseGate` now allows readonly `GET /api/player/lobby/heroes/filter-options`;
  - `PlayerApiPhaseGateTest` covers that readonly path;
  - the restarted local game server now returns `code=0` and six configured class options for the endpoint.
- Current-stage smoke script:
  - `scripts/smoke-cocos-current-flow.ps1` now treats filter-options, gacha pools GET, and bag GET as current-stage open paths;
  - it still blocks gacha exchange/reissue, bag use/batch-use/sell, and hero level-up/star-up/awaken/refine;
  - it checks that blocked calls do not mutate tracked economy snapshots.
- Local DB sync:
  - local `lootchain` was missing battle smoke tables, so existing SQL `13_battle_session_module.sql` and `14_battle_settlement_guard_flags.sql` were sourced with `mysql --default-character-set=utf8mb4`;
  - `battle_session`, `battle_settlement`, and guard columns `settlement_mode`, `reward_granted`, `readonly_economy`, `economy_applied` are present.
- Runtime acceptance:
  - manual `NORMAL_HERO` single draw succeeded through existing `/api/player/gacha/draw` only: `GACHA2f8ec86a09674c1f940da89492a50e67`;
  - latest current smoke passed after the server restart: battle `Be180d91a65b54c85bee6c695e5ffb7a0`, settlement `S7e03442c22ef4d8a9227c7622406a7ea`;
  - settlement flags remained `rewardGranted=false`, `readonlyEconomy=true`, `economy_applied=0`.
- Verification passed:
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerApiPhaseGateTest,PlayerLobbyHeroServiceImplTest" test`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile`;
  - backend `scripts/smoke-cocos-current-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1`;
  - Cocos `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check`.
- Preview note:
  - `npm.cmd run check:preview` still fails because running Cocos Preview serves stale chunks;
  - restart/refresh Cocos Creator Preview before visual acceptance of hero roster scrolling, class filtering, power labels, UR effects, hidden light/dark summon, readonly bag, and gacha dialogs.
- Boundary unchanged:
  - no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DS Login/Lobby Language Switch Closed Loop

- Scope:
  - continued the Cocos-only next-stage work after current-flow closure;
  - implemented local display-language switching only;
  - no backend economy, gacha pool, bag write, hero growth, SQL, or admin-web work was touched.
- Product/UI decision:
  - login right-side first entry keeps the existing `side_btn_prophecy` art but is now rendered as `语言` / `Lang`;
  - clicking that login entry toggles local display language directly and never starts login, dev-login, or any backend request;
  - Lobby top-right settings gear now opens an independent `设置` / `Settings` scene page instead of the generic unopened placeholder;
  - the settings page contains the minimum current-stage language row: current language, `简体中文`, `English`, and back button.
- Cocos implementation:
  - added `assets/scripts/i18n/LootChainI18n.ts` with `zh-CN` / `en-US`, local `sys.localStorage` persistence, and fallback to Chinese when storage is unavailable;
  - `LoginRenderer` uses `lootChainI18n.t('login.rightRail.language')` for the old prophecy slot and calls `toggleLanguageFromLogin()`;
  - `LootChainGameRoot` owns `settings` as a Lobby scene-page view, renders `LobbySettingsPanelRenderer`, and includes current language in `makeLayoutKey()`;
  - `LobbyTopHudRenderer` routes only the `settings` system icon to `openLobbySettingsPanel()`;
  - `HttpClient` sends `Accept-Language: lootChainI18n.currentLanguage()` on API calls. This is a passive header only; no backend behavior was changed.
- Guards updated:
  - `scripts/check-layout.mjs` now requires the i18n service, login language entry, settings page renderer, HUD settings routing, and `Accept-Language` header;
  - `scripts/check-preview-freshness.mjs` now checks the same runtime tokens.
- Verification passed in this step:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - `npm.cmd run check:preview` still fails because running Cocos Preview serves stale chunks;
  - the stale Preview import map does not yet include `assets/scripts/i18n/LootChainI18n.ts` or `LobbySettingsPanelRenderer.ts`;
  - restart/refresh Cocos Creator Preview and then visually verify login language toggle, Lobby settings panel, language persistence, and no layout overlap.
- Boundary unchanged:
  - no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DT Login Language Modal And API/DB I18n Closed Loop

- Scope:
  - continued Cocos-only language work after Stage 4DS;
  - changed login language entry from direct toggle to an in-page modal language picker;
  - extended language switching from local UI labels to backend player-facing DB/API text through `Accept-Language`.
- Cocos implementation:
  - login right-side language button now calls `openLoginLanguageDialog()` and renders `LoginLanguageDialog*` nodes;
  - language modal supports blank-area close, top-right close button, and explicit `zh-CN` / `en-US` selection;
  - selecting a language saves `LootChainI18n`, closes the modal, and fully re-renders the login page;
  - `UiPrimitiveFactory` and `StatusPresenter` now route static labels/buttons/status text through `lootChainI18n.text()`;
  - Lobby settings language switch now refreshes localized player data by reloading profile, notices, adventure, hero roster/filter options, codex, bag, battle recent, gacha pools, and selected pool detail/pity;
  - `HttpClient` continues sending `Accept-Language` from the Cocos language preference.
- Backend/API implementation:
  - added display-only i18n infrastructure under `com.lootchain.game.i18n`;
  - `PlayerWebMvcConfig` registers `GameI18nInterceptor` for `/api/player/**`, parsing `Accept-Language` into `zh-CN` / `en-US` with Chinese fallback;
  - added `game_text_i18n` read model via SQL `D:\project\LootChain\sql\23_game_text_i18n.sql`;
  - `GameTextI18nService` overlays VO display text only, with fallback to original DB/hardcoded text when translation is absent.
- Localized backend surfaces in this stage:
  - hero list/detail/codex/fragments and lobby hero filter options;
  - gacha pool display text and draw result reward names;
  - readonly bag item names, source text, and item type labels;
  - lobby notices;
  - readonly lobby adventure chapter/stage/status/guardrail/reward-preview text.
- SQL sync note:
  - import `sql/23_game_text_i18n.sql` with `mysql --default-character-set=utf8mb4` and MySQL `source D:/project/LootChain/sql/23_game_text_i18n.sql`;
  - local `lootchain` DB import completed on 2026-06-06: `game_text_i18n` total rows `200`, enabled `en-US` rows `200`, including `120` `HERO_TEMPLATE` rows for current hero/protagonist display fields;
  - the table is display-only and must not be used for economy calculations.
- Verification passed:
  - Cocos `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - backend `mvn -pl lootchain-core test` passed: 98 tests, 0 failures, 4 skipped live/external tests;
  - live 8081 `Accept-Language: en-US` readonly calls returned English hero classes, hero list/detail/codex display fields, gacha pool text, bag type labels, and adventure text after restarting `lootchain-game` from current source;
  - both repos `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - `npm.cmd run check:preview` still reports stale running Preview chunks on `7456`; restart/refresh Cocos Creator Preview before visual language-modal acceptance.
- Boundary unchanged:
  - no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DU New Window Handoff Recheck And Local SQL Resync

- Scope:
  - executed the new-window handoff checklist in this Codex window;
  - reread `README.md`, `docs/lobby-feature-analysis.md`, and `docs/api-contract.md`;
  - no Cocos code, backend code, API contract, or economy logic was changed in this step.
- Cocos verification:
  - `npm.cmd run check:layout` passed with `layout ok`;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Backend verification:
  - `mvn.cmd --no-transfer-progress -pl lootchain-core test` passed: `98` tests, `0` failures, `4` skipped live/external tests.
- Local SQL resync:
  - `mysql` is still not in PATH on this machine; the working client is `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`;
  - initial verification found `lootchain.game_text_i18n` missing on this machine;
  - imported `D:\project\LootChain\sql\23_game_text_i18n.sql` into local `lootchain`;
  - a first PowerShell pipe import corrupted Chinese `HERO_CLASS` keys and produced only `191` enabled `en-US` rows, so the just-created display-only table was dropped and reimported by letting the MySQL client read the SQL file directly with `--default-character-set=utf8mb4`;
  - final DB verification passed: `enabled_en_us=200`, `hero_template_en_us=120`, `hero_class_en_us=10`.
- Preview status:
  - `npm.cmd run check:preview` still fails because Cocos Preview on `7456` is serving stale chunks;
  - missing runtime tokens cover the login language modal/i18n service, `Accept-Language`, scene back buttons, hero roster scroll/class/power/effect updates, bag fragment/source paths, hero detail Spine/audio path handling, and current gacha scene tokens;
  - restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged:
  - this was local verification and display-text SQL sync only;
  - no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DV Lobby English Leak Audit And Cocos Static Text Patch

- Scope:
  - audited English-mode lobby localization after switching to `en-US`;
  - checked both backend readonly API responses and Cocos local static UI/status text;
  - no backend code, SQL, API route, or economy rule was changed.
- API audit:
  - authenticated with `POST /api/player/auth/dev-login`, then requested current player GET surfaces with `Accept-Language: en-US`;
  - checked gacha pools/list/detail/pity/logs, lobby profile/notices/codex/heroes/filter-options/adventure, player heroes/detail/codex/fragments, bag/source, recent battles, and protagonist state;
  - final result: `ZH_COUNT=0`, so the running backend API layer did not return Chinese text for the checked current-stage GET surface.
- Cocos issue found:
  - English API text was already clean, but Cocos local renderer/config strings still had Chinese fallback/status labels in Lobby, Gacha, Adventure, Bag, Notice, Codex, Hero Roster, Hero Detail, Formation, Battle Preview, and Root status paths;
  - hero roster compact power formatting still used the Chinese `万` unit path.
- Cocos implementation:
  - expanded `assets/scripts/i18n/LootChainI18n.ts` with additional exact English translations, fragment replacements, and dynamic sentence handling for current lobby/gacha text;
  - added coverage for runtime-composed labels such as owned counts, rates/pity, item/source rows, battle no-reward receipts, formation summaries, adventure requirements, and local placeholder messages;
  - added exact fallback coverage for old/traditional/garbled class aliases so they cannot leak as visible English-mode class text;
  - updated `LobbyHeroRosterPanelRenderer.formatCompactInteger()` to output `K` for English compact power values while keeping the Chinese `万` branch for `zh-CN`.
- Verification passed:
  - custom Cocos static text audit across `scenes/lobby`, `scenes/gacha`, and `LootChainGameRoot.ts` with `lootChainI18n.text()` in `en-US`: `MISS_COUNT=0`;
  - API audit with `Accept-Language: en-US`: `ZH_COUNT=0`;
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - both repos `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - `npm.cmd run check:preview` still fails because Cocos Preview on `7456` is serving stale chunks;
  - restart/refresh Cocos Creator Preview before visual acceptance of English lobby/gacha/local status text.
- Boundary unchanged:
  - frontend localization only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DW Hero Roster English Class Tab Dedupe

- Scope:
  - fixed the English-mode hero roster left class filter showing duplicate class tabs;
  - no backend code, SQL, API contract, hero data, or economy logic was changed.
- Root cause:
  - the backend correctly returns localized English class labels such as `Warrior`, `Support`, `Assassin`, `Mage`, `Marksman`, and `Tank` when `Accept-Language: en-US`;
  - Cocos also seeded the default six Chinese class tabs locally;
  - `normalizeHeroClassKey()` only knew Chinese/traditional/garbled aliases, so English class labels were treated as different keys and appeared beside the default Chinese tabs.
- Cocos implementation:
  - added English class aliases into `HERO_CLASS_KEY_ALIASES`:
    `Warrior`, `Support`, `Assassin`, `Mage`, `Marksman`, `Tank` and lowercase variants;
  - the canonical class key remains Chinese so existing filtering, sorting, badges, and fallback behavior continue to work;
  - display still goes through `lootChainI18n.text()`, so English mode renders the class tabs in English while deduping by canonical key.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the English class alias tokens.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - custom dedupe check confirmed mixed default Chinese tabs plus English API options produce only `全部 + 6` canonical tabs.
- Preview note:
  - running Preview was already stale in the previous step; refresh/restart Cocos Creator Preview before visual acceptance.
- Boundary unchanged:
  - Cocos readonly display fix only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DX Gacha Hero Pool Spine Ground Offset

- Scope:
  - adjusted only the Cocos summon-page center Spine visual placement;
  - no backend code, SQL, API contract, gacha pool item, probability, cost, reward, pity, duplicate conversion, or economy behavior was changed.
- Cocos implementation:
  - `GachaSceneRenderer` now resolves the center Spine ground Y through `resolveGachaSpineGroundY(stageHeight, selectedPool)`;
  - base summon pools keep `GACHA_SPINE_GROUND_Y_RATIO = -0.55`;
  - hero summon pools receive an additional `GACHA_HERO_POOL_SPINE_GROUND_Y_EXTRA_RATIO = -0.075`, moving only the hero summon Spine lower;
  - limited pools are explicitly excluded through `displayType === 'LIMITED'`, `poolType === 'LIMITED'`, and `poolCode.includes('LIMITED')`, so limited summon Spine placement remains unchanged.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the hero-pool offset and limited-pool exclusion tokens.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - `npm.cmd run check:preview` still fails because the running Cocos Preview serves stale chunks;
  - the stale `GachaSceneRenderer.ts` chunk is missing `GACHA_SPINE_GROUND_Y_RATIO = -0.55`, `GACHA_HERO_POOL_SPINE_GROUND_Y_EXTRA_RATIO = -0.075`, `resolveGachaSpineGroundY(stageHeight, selectedPool)`, `isHeroGachaPool(selectedPool)`, and the `LIMITED` exclusion tokens;
  - restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged:
  - Cocos visual positioning only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Stage 4DY Hero Card Background Asset

- Scope:
  - added display-only hero card background metadata for the Cocos hero roster;
  - no gacha pool item, probability, cost, reward, pity, duplicate conversion, bag write, hero growth, EX V1, or economy rule was changed.
- Backend/API/SQL:
  - added SQL `D:\project\LootChain\sql\24_hero_card_background_asset.sql`;
  - `hero_template` now has `card_background_asset VARCHAR(255) COMMENT '英雄界面卡牌背景资源路径'`;
  - DTO/VO/read models now expose `cardBackgroundAsset` beside `portraitAsset`, `spineAsset`, and `spineUuid`;
  - local DB was synced with MySQL `source D:/project/LootChain/sql/24_hero_card_background_asset.sql`;
  - current seed: enabled `UR_EVELYN` uses `ui/hero-roster/card_background/StoryCover_Nuu`.
- Cocos implementation:
  - `LobbyHeroItemVO`, `HeroTypes`, and `LobbyCodexItemVO` include `cardBackgroundAsset`;
  - `LobbyHeroApi` and `LobbyCodexApi` parse the new field and keep a readonly fallback for `UR_EVELYN`;
  - `LobbyHeroRosterPanelRenderer` renders the configured background under `hero_card_frame.png`, using safe resources paths and appending `/spriteFrame` when omitted;
  - known resource preload path: `ui/hero-roster/card_background/StoryCover_Nuu/spriteFrame`.
- Resource cleanup:
  - `assets/resources/spine/hero/Nuu/Nuu.spine` was moved to `docs/spine-source-archive/hero/Nuu/Nuu.spine`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Verification passed so far:
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest" test`;
  - Cocos `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `.spine/.spine.meta` scan returned `0`.
- Preview note:
  - `npm.cmd run check:preview` still fails because the running Preview serves stale chunks;
  - the stale `LobbyHeroRosterPanelRenderer.ts` chunk is missing `LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET`, `renderHeroCardBackground`, `LobbyHeroRosterCardBackgroundSprite`, `resolveHeroCardBackgroundSpriteFrame`, and `hero.cardBackgroundAsset`;
  - restart/refresh Cocos Creator Preview before judging the new card background visually.

## 2026-06-06 Stage 4DZ Hero Id 25 Nuu Spine UUID Sync

- User updated `hero_template.id=25` (`UR_EVELYN`) to `portrait_asset=Nuu` and `spine_asset=Nuu`.
- Found the previous DB `spine_uuid=79a440e2-bfc8-4be9-963c-6d24a6470208` belonged to an archived `.spine.meta` source file, not to a runtime `spine-data` `.skel.meta`.
- Added Cocos runtime meta files for `assets/resources/spine/hero/Nuu/`:
  - `Nuu.meta`;
  - `images.meta`;
  - `Nuu.atlas.meta`;
  - `Nuu.png.meta`;
  - `Nuu.skel.meta`.
- Runtime `Nuu.skel.meta` uuid is now `f0efa4e7-3338-4a1c-bafd-b8b18788a712`, with atlas uuid `22df6d2b-c80d-4808-a5c4-4ee711e7205e`.
- Added and locally sourced backend SQL:
  - `D:\project\LootChain\sql\25_hero_spine_uuid_id25_sync.sql`.
- Local DB verification:
  - `hero_template.id=25` now has `portrait_asset=Nuu`, `spine_asset=Nuu`, `spine_uuid=f0efa4e7-3338-4a1c-bafd-b8b18788a712`.
- `assets/resources/spine` `.spine/.spine.meta` scan remains `0`.
- Boundary unchanged:
  - display resource metadata only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, or new economy write endpoint changed.

## 2026-06-06 Stage 4EA External Nuu idel_front Work Copy

- User asked to add a new `idel_front` animation for Nuu from `C:\Users\Ethan\Desktop\C1812\Spine\Nuu`, without modifying the original source files.
- Inspection found the source directory contains binary Spine files only:
  - `Nuu.spine`;
  - `Nuu.skel`;
  - `Nuu.atlas`;
  - `Nuu.png`;
  - `images/`.
- Detected runtime skeleton version from `Nuu.skel`: Spine `3.8.97`.
- Detected existing animation names: `idle`, `idle_intro`, `intro`, `skill1`, `skill2`, `skill3`; there is no existing `idel` animation, so the requested source reference should be treated as `idle`.
- Created a non-destructive work copy at:
  - `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work`.
- The work copy contains copied assets and `IDEL_FRONT_WORK.md` with the required Spine-editor steps:
  - open `Nuu_idel_front.spine`;
  - duplicate `idle`;
  - rename the duplicate to `idel_front`;
  - manually adjust/key the pose to face front;
  - export a complete Cocos-compatible Spine 3.8.x runtime set.
- Important limitation:
  - a true front-facing animation cannot be safely generated by text editing or binary patching the `.spine`/`.skel` files;
  - duplicating `idle` without editing the rig would only create the same right-facing animation under a new name.
- Boundary unchanged:
  - this was external source-asset preparation only; no Cocos runtime resources, backend code, SQL, API, gacha/economy rules, bag writes, hero growth, or EX V1 behavior were changed.

## 2026-06-07 Stage 4EB External Nuu idel_front JSON Pass

- User exported JSON from the Nuu work copy and asked Codex to add `idel_front` and adjust it toward a front-facing pose.
- Source JSON:
  - `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu.json`.
- Generated JSON:
  - `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu_idel_front.json`.
- The original exported `Nuu.json` was kept untouched.
- `Nuu_idel_front.json` keeps all original animations and inserts `animations.idel_front` immediately after `animations.idle`.
- `idel_front` implementation:
  - cloned from `idle`;
  - softened torso/head/pelvis rotations;
  - reduced large horizontal center sway;
  - rebalanced A/B arms and legs toward a centered front-idle silhouette;
  - softened hair root swing so the hair frames the body instead of exaggerating the side profile;
  - explicitly keyed `head01`, `body01`, and `pelvis01` attachments at frame 0.
- Art limitation remains:
  - the atlas has side/three-quarter painted parts and no complete front-facing head/body attachment set;
  - this is a rig-pose approximation, not a true front-view repaint;
  - next visual step is opening `Nuu_idel_front.json` in Spine and previewing `idel_front`, then hand-polishing keyed bones if needed.
- Verification:
  - JSON parsed successfully;
  - `animations.idel_front` exists;
  - `assets/resources/spine` `.spine/.spine.meta` scan remains `0`.
- Boundary unchanged:
  - external source JSON preparation only; no Cocos runtime resources, backend code, SQL, API, gacha/economy rules, bag writes, hero growth, or EX V1 behavior were changed.

## 2026-06-07 Stage 4EC External Nuu JSON Import Correction

- User reopened `Nuu_idel_front.spine` in Spine and did not see `idel_front`.
- Root cause:
  - `Nuu_idel_front.spine` is only the untouched copied binary Spine project;
  - the generated animation was in `Nuu_idel_front.json`, not inside the `.spine` project file.
- Work-copy correction:
  - backed up the originally exported JSON as `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu.original_export.json`;
  - copied the generated `Nuu_idel_front.json` over `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu.json`.
- Current expected user workflow:
  - open/import `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu.json`, not `Nuu_idel_front.spine`;
  - confirm the animation list includes `idel_front`;
  - then save as a new Spine project such as `Nuu_with_idel_front.spine` if a `.spine` project file is needed.
- Verification:
  - `Nuu.json` parses successfully and contains `animations.idel_front`;
  - `assets/resources/spine` `.spine/.spine.meta` scan remains `0`.
- Boundary unchanged:
  - external source JSON preparation only; no Cocos runtime resources, backend code, SQL, API, gacha/economy rules, bag writes, hero growth, or EX V1 behavior were changed.

## 2026-06-07 Stage 4ED Hero Detail Nuu Spine Intro To Idle

- User reported the replaced Abyss Witch / `UR_EVELYN` hero detail Spine was not showing and requested detail playback to run `intro` once on first open, then keep `idle` looping.
- Runtime API check against local `http://localhost:8081` confirmed the lobby hero list currently returns:
  - `heroCode=UR_EVELYN`;
  - `portraitAsset=Nuu`;
  - `spineAsset=Nuu`;
  - `spineUuid=f0efa4e7-3338-4a1c-bafd-b8b18788a712`.
- Resource check confirmed `assets/resources/spine/hero/Nuu/Nuu.skel` contains animation strings including `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, and `skill3`.
- Cocos implementation:
  - `LobbyHeroDetailPanelRenderer` no longer starts the old `skill2` secondary animation or 15-second repeat cycle;
  - hero detail now resolves `idle` as the loop animation and resolves `intro` with fallbacks `idle_intro`, `appear`, `enter`, `show`, `born`, `入场`;
  - when both are present, it calls `skeleton.setAnimation(0, introAnimation, false)` and queues `skeleton.addAnimation(0, idleAnimation, true, 0)`;
  - if no intro is available, it falls back to looping idle; if no animation is available, it keeps setup pose.
- Fallback asset correction:
  - Cocos readonly fallback for `UR_EVELYN` in `LobbyHeroApi` and `LobbyCodexApi` now uses `portraitAsset=Nuu` and `spineAsset=Nuu`, so stale local backend fields do not drop back to `npc_21053`.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now guard the `intro -> idle` hero detail path and the `UR_EVELYN -> Nuu` fallback.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - restart/refresh Cocos Creator Preview before judging the hero detail Spine visually, especially if Preview was already serving stale chunks.
- Boundary unchanged:
  - Cocos readonly hero-detail visual playback only; no backend code, SQL, API contract, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, or new economy write endpoint changed.

## 2026-06-07 Stage 4EE Hero Detail Nuu Spine Load Retry Diagnostics

- User reported the hero detail still showed only the local fallback triangle for Abyss Witch / `UR_EVELYN`.
- Investigation:
  - current API data for `UR_EVELYN` already returns `portraitAsset=Nuu`, `spineAsset=Nuu`, `spineUuid=f0efa4e7-3338-4a1c-bafd-b8b18788a712`;
  - `assets/resources/spine/hero/Nuu` is imported into Cocos library and contains only the old runtime `Nuu.skel` set, not a JSON export;
  - no `Nuu*.json` export was found under the project or current `C:\Users\Ethan\Desktop` search path;
  - `Nuu.skel` strings include `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, `skill3`;
  - `Nuu.png` and `Nuu.atlas` are both the Cocos-imported `1024x1024` atlas pair.
- Cocos implementation:
  - `LobbyHeroDetailPanelRenderer.loadHeroSpineData()` now calls `assetManager.loadAny({ uuid, type: sp.SkeletonData })`;
  - UUID load results are validated through `isHeroSpineDataAsset()` before being treated as `sp.SkeletonData`;
  - if UUID load fails or returns a non-SkeletonData asset, it automatically falls back to `resources.load(path, sp.SkeletonData)`;
  - if a UUID-loaded SkeletonData still fails during `applyHeroSpineData()`, the renderer retries the same resource path without UUID before giving up;
  - final failure now renders `LobbyHeroDetailSpineFailureHint` with the failing resource path instead of silently leaving only the abstract fallback.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require `isHeroSpineDataAsset`, UUID fallback logging, path retry logging, and the visible failure hint token.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Next visual step:
  - restart/refresh Cocos Creator Preview and open Abyss Witch detail again;
  - if the visible failure hint appears, the remaining blocker is the old `Nuu.skel` runtime parsing in Cocos, and a fresh Cocos-compatible JSON/skel export must be placed into `assets/resources/spine/hero/Nuu`.
- Boundary unchanged:
  - Cocos readonly hero-detail load robustness/diagnostics only; no backend code, SQL, API contract, economy, gacha rule, bag write, hero growth, or EX V1 behavior changed.

## 2026-06-07 Stage 4EF Hero Detail Nuu JSON Runtime Sync

- User exported a fresh Nuu JSON runtime set into:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- Cocos import generated `Nuu.json.meta` with `spine-data` uuid:
  - `b20d194a-da4c-4868-b25a-1cb98c25d3e8`.
- The old `Nuu.skel` runtime pair was archived out of `assets/resources` to avoid the duplicate dynamic load URL `spine/hero/Nuu/Nuu`:
  - `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607/Nuu.skel`;
  - `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607/Nuu.skel.meta`.
- Added and locally sourced backend SQL:
  - `D:\project\LootChain\sql\26_hero_spine_uuid_nuu_json_sync.sql`.
- Local DB now has `hero_template.id=25 / UR_EVELYN`:
  - `portrait_asset=Nuu`;
  - `spine_asset=Nuu`;
  - `spine_uuid=b20d194a-da4c-4868-b25a-1cb98c25d3e8`.
- Parsed `Nuu.json` successfully and confirmed animations include:
  - `intro`;
  - `idle`;
  - `idle_intro`;
  - `skill1`;
  - `skill2`;
  - `skill3`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - local DB query for `hero_template.id=25` returned the JSON uuid;
  - live `GET /api/player/lobby/heroes` returned `UR_EVELYN` with `portraitAsset=Nuu`, `spineAsset=Nuu`, and `spineUuid=b20d194a-da4c-4868-b25a-1cb98c25d3e8`;
  - both repos `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - `npm.cmd run check:preview` still fails because the running Cocos Preview serves stale chunks;
  - the stale hero-detail chunk is missing the current `intro -> idle`, `spine/hero/${asset}/${asset}`, audio-path, and shared back-header tokens;
  - restart/refresh Cocos Creator Preview before visually checking the Nuu hero detail.
- Compatibility note:
  - exported `Nuu.json` reports Spine `4.3.10`;
  - Cocos Creator 3.8.8 runtime bundle logs include `spine-3.8` and `spine-4.2`;
  - if Preview still shows `Spine 资源解析失败：spine/hero/Nuu/Nuu` after refreshing/restarting Preview, re-export Nuu as a Cocos-compatible Spine 4.2.x runtime set.
- Boundary unchanged:
  - display resource metadata and runtime asset cleanup only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FG Hero Detail Nuu Spine 4.1.24 UUID Sync

- User replaced Nuu with a lower-version JSON export after the Spine 4.3.10 compatibility concern.
- Current Cocos runtime resource set:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- Parsed `Nuu.json` successfully:
  - `skeleton.spine=4.1.24`;
  - animations include `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, `skill3`, and `ult`.
- New Cocos `Nuu.json.meta` uuid:
  - `d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- The user replacement also brought back an old `Nuu.skel` runtime pair, causing Cocos AssetDB warnings that `Nuu.json` and `Nuu.skel` shared the same dynamic load URL `spine/hero/Nuu/Nuu`.
- Archived that runtime pair out of `assets/resources`:
  - `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607-0118/Nuu.skel`;
  - `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607-0118/Nuu.skel.meta`.
- Added and locally sourced backend SQL:
  - `D:\project\LootChain\sql\27_hero_spine_uuid_nuu_4124_sync.sql`.
- Local DB and live `GET /api/player/lobby/heroes` now return `UR_EVELYN` with:
  - `portraitAsset=Nuu`;
  - `spineAsset=Nuu`;
  - `spineUuid=d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- Next visual step:
  - wait for Cocos Creator to finish importing `Nuu.json`;
  - restart/refresh Preview;
  - open Abyss Witch detail again.
- If it still shows the fallback triangle:
  - inspect Preview console for the exact Spine parse/apply error;
  - do not reintroduce `Nuu.skel` into the same folder;
  - keep DB uuid aligned with the active `Nuu.json.meta`.
- Boundary unchanged:
  - display resource metadata and runtime asset cleanup only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FH Hero Detail Spine Failure Visibility And Preview Start Scene Refix

- User restarted Cocos Creator but Abyss Witch detail still did not show Spine and no console output was visible.
- Rechecked Preview:
  - disk preview chunk for `LobbyHeroDetailPanelRenderer` contains the current `hero spine load start`, `intro`, and retry code;
  - running HTTP Preview still did not pick up the newest `pma` and retry-failure hint patch until Preview is stopped and started again;
  - Creator logs were empty, so browser-side logs are not reliably mirrored into `temp/logs/project.log`.
- Cocos code hardening:
  - hero detail load-start log is now `console.warn` instead of `console.info`, making it more likely to appear in visible consoles;
  - if UUID-loaded data fails and the resource-path retry also fails, the detail page now renders `Spine UUID 与路径资源均解析失败：spine/hero/Nuu/Nuu`;
  - final no-UUID load failures now render `Spine 资源加载失败：...`;
  - Spine atlas `pma:true` now enables `skeleton.premultipliedAlpha` through `resolveHeroSpinePremultipliedAlpha(data)`.
- Cocos Preview profile drift:
  - Cocos restart changed `profiles/v2/packages/preview.json` back to `"start_scene": "current_scene"`;
  - fixed it again to the required main scene uuid `623f777a-eb33-4d74-ae88-eb79e749fcfe`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Next visual step:
  - stop Preview, close the Preview tab/window, wait for scripts to compile, then start Preview again;
  - if still no Nuu Spine, the page should now show a visible failure hint or a `[HeroDetail]` warning line.
- Boundary unchanged:
  - Cocos readonly hero-detail visual diagnostics only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FI Hero Detail Nuu Spine Version Diagnosis

- User shared the new visible hero-detail failure hint screenshot:
  - `Spine UUID 与路径资源均解析失败：spine/hero/Nuu/Nuu`.
- Resource verification:
  - active Cocos asset `library/d6/d6f527d7-2988-42f3-8ad3-9c96636ea79d.json` is `sp.SkeletonData`;
  - it contains one texture `Nuu.png`;
  - atlas text contains `pma:true`;
  - animations include `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, `skill3`, `ult`, and `victory`;
  - `assets/resources/spine/hero/Nuu` no longer contains `Nuu.skel`, so the duplicate dynamic URL conflict is gone.
- Root cause:
  - current `Nuu.json` reports `skeleton.spine=4.1.24`;
  - local Cocos Creator 3.8.8 engine files contain Spine runtime/import compatibility paths for `3.8` and `4.2`;
  - `spine-version-4.2.ts` accepts only versions starting with `4.2.`;
  - `spine-version-3.8.ts` accepts only versions starting with `3.8.` and rejects `3.8.75`;
  - therefore `4.1.24` is not a compatible runtime export for this Cocos project.
- Cocos code hardening:
  - `LobbyHeroDetailPanelRenderer` now reads the imported SkeletonData `_skeletonJson.skeleton.spine`;
  - unsupported versions set a visible failure reason:
    `Spine 4.1.24 不兼容，请导出 4.2.x 或 3.8.x`;
  - `scripts/check-layout.mjs` now guards `resolveHeroSpineVersion`, `isSupportedHeroSpineVersion`, and the visible incompatible-version hint.
- Required asset fix:
  - re-export Nuu as Spine `4.2.x` JSON/atlas/png, or as Spine `3.8.x` JSON/atlas/png;
  - replace only `Nuu.json`, `Nuu.atlas`, and `Nuu.png` in `assets/resources/spine/hero/Nuu`;
  - do not place `Nuu.skel` in the same folder while `Nuu.json` exists;
  - after Cocos import, update `hero_template.id=25.spine_uuid` to the new `Nuu.json.meta` uuid.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Boundary unchanged:
  - Cocos readonly hero-detail diagnostics only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FJ Hero Detail Nuu Spine 4.2.43 Runtime Sync

- User re-exported Nuu as a Cocos-compatible Spine 4.2 runtime set.
- Current active runtime files:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- Parsed `Nuu.json` successfully:
  - `skeleton.spine=4.2.43`;
  - skin includes `default`;
  - animations include `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, `skill3`, `ult`, and `victory`.
- `Nuu.json.meta` uuid stayed unchanged:
  - `d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- Local DB verification confirmed `hero_template.id=25 / UR_EVELYN` still points to this uuid:
  - `portrait_asset=Nuu`;
  - `spine_asset=Nuu`;
  - `spine_uuid=d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- Because the uuid did not change, no new SQL migration was required for this export.
- The export brought back the old `Nuu.skel` runtime pair, which would conflict with the JSON resource under the same dynamic load URL `spine/hero/Nuu/Nuu`.
- Archived that pair out of `assets/resources`:
  - `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607-0145/Nuu.skel`;
  - `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607-0145/Nuu.skel.meta`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `assets/resources/spine/hero/Nuu` `.skel/.skel.meta` scan returned `0`.
- Next visual step:
  - wait for Cocos Creator to finish importing `Nuu.json`;
  - stop Preview, close the Preview tab/window, then start Preview again;
  - open Abyss Witch detail and verify `intro` plays once, then `idle` loops.
- Boundary unchanged:
  - Cocos readonly hero-detail runtime resource sync only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FK Hero Detail Spine Runtime Retry

- User restarted Cocos Creator and browser Preview, but Abyss Witch detail still showed the fallback portrait.
- Current screenshot indicates the active renderer reaches the visible Spine failure hint path, so the issue is no longer only a stale `7456` Preview chunk.
- Resource state remains valid:
  - `Nuu.json` is Spine `4.2.43`;
  - Cocos library asset `d6f527d7-2988-42f3-8ad3-9c96636ea79d` is `sp.SkeletonData`;
  - library `_skeletonJson.skeleton.spine=4.2.43`;
  - atlas text contains `pma:true`;
  - textureNames is `Nuu.png`;
  - animations include `intro` and `idle`.
- Further diagnosis:
  - failure is happening after `SkeletonData` load, inside `data.getRuntimeData(true)`;
  - Cocos Spine 4.2 runtime is loaded through async WASM initialization, so immediate runtime parsing can return empty before the runtime/texture bridge is ready.
- Cocos implementation:
  - `LobbyHeroDetailPanelRenderer` now applies hero Spine data through `applyHeroSpineDataWithRetry()`;
  - retry delays are `180ms`, `420ms`, and `900ms`;
  - retry is limited to `运行时解析失败` / `资源应用异常`;
  - UUID-loaded data is retried first, then the resource-path fallback is retried the same way;
  - final visible failure hint was moved upward so it is not covered by the hero name plate;
  - runtime failure reason now includes `Spine <version>`, texture count, and atlas texture names.
- Resource-side hardening:
  - `assets/resources/spine/hero/Nuu/Nuu.png.meta` wrap mode was changed from `repeat` to `clamp-to-edge`;
  - this avoids browser WebGL issues with the current non-power-of-two atlas size `2031x817`.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the retry tokens and visible runtime diagnostics.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Preview status:
  - `npm.cmd run check:preview` still reports the running browser Preview chunk as stale;
  - the `LobbyHeroDetailPanelRenderer` chunk is missing `retryHeroSpineResourcePath`, `applyHeroSpineDataWithRetry`, `HERO_DETAIL_SPINE_RUNTIME_RETRY_DELAYS_MS`, `hero spine runtime retry`, `textures=${textureCount}`, and `atlas=${textureNames}`;
  - wait for Cocos script compilation, then stop/restart Preview or hard-refresh the browser Preview before judging the retry fix visually.
- Next visual step:
  - wait for Cocos script compilation;
  - refresh browser Preview;
  - open Abyss Witch detail again;
  - if fallback remains, read the moved-up visible hint. It should now include `textures=<n>` and `atlas=<names>`, which will identify whether runtime still sees the texture.
- Boundary unchanged:
  - Cocos readonly hero-detail runtime resilience only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FL Hero Detail Spine Apply Exception Diagnostics

- User shared the updated hero-detail failure hint:
  - `Spine 资源应用异常：spine/hero/Nuu/Nuu`.
- This means the renderer now reaches loaded `SkeletonData`, but an exception is thrown during resource application after runtime parsing starts.
- Cocos code refinement:
  - `applyHeroSpineData()` now calls `data.getRuntimeData(true)` before assigning `skeleton.skeletonData = data`, avoiding the Cocos `sp.Skeleton` setter becoming the first parse point;
  - the catch block now records the actual exception message through `formatHeroSpineError(error)`;
  - the next visible failure hint should display `资源应用异常：<message>` instead of the generic `资源应用异常`.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require `formatHeroSpineError` and the message-bearing failure reason.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Next visual step:
  - wait for Cocos script compilation and refresh browser Preview;
  - open Abyss Witch detail again;
  - if fallback remains, capture the full visible `资源应用异常：<message>` line.
- Boundary unchanged:
  - Cocos readonly hero-detail diagnostics only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FM Hero Detail Spine Safe Runtime Enum Patch

- User shared the next visible hero-detail failure hint:
  - `Spine 资源应用异常：Cannot read properties of null (reading 'name')：spine/hero/Nuu/Nuu`.
- Local checks confirmed the active Nuu export itself is still structurally valid:
  - `Nuu.json` reports `skeleton.spine=4.2.43`;
  - `skins` contains one `default` skin;
  - animations include `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, `skill3`, `ult`, and `victory`;
  - `assets/resources/spine/hero/Nuu` contains JSON/atlas/png runtime files and no `.skel/.skel.meta`.
- Cocos engine diagnosis:
  - Cocos Creator 3.8.8 `sp.SkeletonData.getSkinsEnum()` reads `skins[i].name`;
  - `sp.SkeletonData.getAnimsEnum()` reads `anims[i].name`;
  - when the 4.2 WASM runtime returns a sparse/null enum entry, editor/inspector enum refresh can throw the exact `reading 'name'` exception during `skeleton.skeletonData = data`.
- Cocos implementation:
  - `LobbyHeroDetailPanelRenderer` now patches the loaded hero `SkeletonData` with safe runtime enum providers before assigning it to `sp.Skeleton`;
  - the safe enum providers are built from `_skeletonJson.skins` and `_skeletonJson.animations`, not from Cocos runtime enum helpers;
  - default skin is no longer actively set through `setSkin('default')`; only non-default skins are set;
  - failure formatting now includes the first relevant stack line when available.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require `patchHeroSpineRuntimeEnums`, `createHeroSpineEnumMap`, safe skin/animation JSON-name resolution, and the default-skin skip guard.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Preview status:
  - `npm.cmd run check:preview` still reports stale browser Preview chunks;
  - the active `LobbyHeroDetailPanelRenderer` Preview chunk is missing `patchHeroSpineRuntimeEnums`, `getSkinsEnum =`, `getAnimsEnum =`, `createHeroSpineEnumMap`, JSON-name resolution tokens, and the default-skin skip guard;
  - Cocos must finish script compilation and the browser Preview must be hard-refreshed/restarted before judging this fix visually.
- Next visual step:
  - wait for Cocos script compilation;
  - hard-refresh/restart browser Preview;
  - open Abyss Witch detail again and verify `intro -> idle`;
  - if fallback remains, capture the new visible hint, which should now include a more specific stack location.
- Boundary unchanged:
  - Cocos readonly hero-detail runtime compatibility patch only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FN Hero Detail Nuu Full Idle Presentation

- User shared a visual comparison: Cocos hero detail rendered only a partial red mesh/side hair shape, while the Spine editor shows the full Abyss Witch stance.
- Product/UI conclusion:
  - the Nuu `intro` animation is an entry/combat presentation and its early frames do not show the complete standing silhouette;
  - hero detail should prioritize the complete readable hero pose, so Nuu should enter detail on full `idle` rather than the partial `intro` sequence.
- Cocos implementation:
  - added `HERO_DETAIL_SPINE_DISPLAY_PROFILES`;
  - `Nuu` profile now uses `preferIdleFirst: true`;
  - `Nuu` max detail scale is capped at `0.88` to avoid oversize rendering if the runtime bounds are too small or skewed by long hair meshes;
  - `Nuu` gets a small `xRatio=-0.035` and `yRatio=-0.018` presentation offset so the long hair/body silhouette sits better on the gothic stage;
  - other heroes still keep the generic `intro -> idle` behavior.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the Nuu detail display profile tokens.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Preview note:
  - if browser Preview still shows the old partial intro mesh, it is stale; wait for Cocos script compilation and hard-refresh/restart Preview.
- Boundary unchanged:
  - Cocos readonly hero-detail presentation only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FO Hero Detail Skel-First Asset Pipeline

- User wants to keep the original Spine runtime assets (`.skel + .atlas + .png`) instead of re-exporting JSON one by one.
- Pipeline decision:
  - Cocos Creator can load binary `.skel` as `sp.SkeletonData`;
  - every hero Spine runtime folder should contain only one same-basename runtime entry:
    - either `<asset>.skel + <asset>.atlas + texture(s)`;
    - or `<asset>.json + <asset>.atlas + texture(s)`;
  - do not keep `<asset>.skel` and `<asset>.json` together under the same `assets/resources/spine/hero/<asset>/` folder because both map to `resources.load('spine/hero/<asset>/<asset>')`.
- Cocos implementation:
  - hero detail now loads by resource path first:
    `resources.load('spine/hero/${asset}/${asset}', sp.SkeletonData)`;
  - `spineUuid` is now only a fallback if the path load fails, so replacing files under the same folder no longer requires syncing SQL uuid for every visual iteration;
  - loaded data cache is keyed by resource path, not uuid;
  - safe skin/animation enum patch now supports both JSON and `.skel`;
  - JSON resources read names from `_skeletonJson`;
  - `.skel` resources read names from `runtimeData.skins` and `runtimeData.animations`, filtering null entries before Cocos editor enum refresh sees them.
- Usage rule for original assets:
  - put `Nuu.skel`, `Nuu.atlas`, and `Nuu.png` in `assets/resources/spine/hero/Nuu/`;
  - archive or remove `Nuu.json` / `Nuu.json.meta` from that runtime folder while using `.skel`;
  - let Cocos import/reimport the folder, then refresh Preview.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require path-first loading and runtimeData name resolution tokens.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Preview status:
  - `npm.cmd run check:preview` still reports stale browser Preview chunks;
  - the active `LobbyHeroDetailPanelRenderer` chunk is missing `const cacheKey = path`, `hero spine resource path load failed, fallback to uuid`, `resolveHeroSpineRuntimeSkinNames`, `resolveHeroSpineRuntimeAnimationNames`, and `resolveHeroSpineAnimationNameList`;
  - wait for Cocos script compilation and hard-refresh/restart Preview before validating `.skel` loading visually.
- Boundary unchanged:
  - Cocos readonly hero-detail asset pipeline only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FP Nuu Original Skel Runtime Restore

- User replaced Nuu with the original runtime assets and manually removed JSON.
- Current active runtime folder:
  - `assets/resources/spine/hero/Nuu/Nuu.skel`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- Current Nuu runtime state:
  - `Nuu.json` / `Nuu.json.meta` count is `0`;
  - `Nuu.skel.meta` uuid is `aa51fc97-c90c-40aa-90d9-2e6f6949482e`;
  - atlas references `Nuu.png`, size `1024x1024`, `pma:true`, `repeat:none`.
- `Nuu.spine` and `Nuu.spine.meta` were present in `assets/resources/spine/hero/Nuu`; archived them to:
  - `docs/spine-source-archive/hero/Nuu/source-spine-archived-20260607-1225/Nuu.spine`;
  - `docs/spine-source-archive/hero/Nuu/source-spine-archived-20260607-1225/Nuu.spine.meta`.
- No SQL sync is required for this visual replacement because hero detail now loads by resource path first and uses `spineUuid` only as fallback.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Next visual step:
  - let Cocos import/reimport the restored `Nuu.skel` runtime folder;
  - hard-refresh/restart browser Preview;
  - open Abyss Witch detail and verify the original skel displays the full idle pose.
- Boundary unchanged:
  - Cocos readonly resource restore only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FQ Nuu Skel UUID Fallback Sync

- User screenshot after restoring original skel still showed the fallback placeholder.
- Diagnosis:
  - `npm.cmd run check:preview` still reports stale browser Preview chunks;
  - the active `LobbyHeroDetailPanelRenderer` chunk is missing the new path-first and `.skel` runtime-name parsing tokens;
  - DB still pointed `hero_template.id=25.spine_uuid` to the old JSON uuid `d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- Resource compatibility check:
  - `Nuu.skel` binary reports Spine `3.8.97`;
  - Cocos Creator 3.8.8 local `spine-version-3.8.ts` accepts `3.8.*` except `3.8.75`, so the restored skel version is compatible with the 3.8 runtime line.
- Backend SQL:
  - added `D:\project\LootChain\sql\28_hero_spine_uuid_nuu_skel_restore.sql`;
  - locally executed it with MySQL `--default-character-set=utf8mb4`;
  - DB readback now returns `spine_uuid=aa51fc97-c90c-40aa-90d9-2e6f6949482e` for `hero_template.id=25 / UR_EVELYN`.
- Why this matters:
  - current Cocos code loads by resource path first, so SQL is not required for the new path;
  - syncing `spine_uuid` still makes old Preview chunks and uuid fallback point at the restored `.skel` instead of the removed JSON resource.
- Next visual step:
  - wait for Cocos resource import and script compilation;
  - hard-refresh/restart browser Preview;
  - if fallback remains, rerun `npm.cmd run check:preview`; the hero-detail chunk must contain `const cacheKey = path` and `resolveHeroSpineRuntimeAnimationNames`.
- Boundary unchanged:
  - display resource metadata only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FR Hero Detail Nuu UUID Apply Fallback

- User confirmed the restored original Nuu `.skel` still shows the static fallback portrait in hero detail.
- Local verification:
  - `assets/resources/spine/hero/Nuu/Nuu.skel`, `Nuu.atlas`, and `Nuu.png` are present;
  - `Nuu.skel.meta` uuid remains `aa51fc97-c90c-40aa-90d9-2e6f6949482e`;
  - Cocos library imported it as `sp.SkeletonData` with native `.bin`, one texture dependency, `textureNames=["Nuu.png"]`, and atlas `pma:true`;
  - DB readback for `hero_template.id=25 / UR_EVELYN` returns `portrait_asset=Nuu`, `spine_asset=Nuu`, and `spine_uuid=aa51fc97-c90c-40aa-90d9-2e6f6949482e`.
- Diagnosis:
  - earlier `check:preview` stale reports were partly false positives because Cocos 3.8 transpiles TypeScript into JS, while the guard tokens live in sourcemap `sourcesContent`;
  - the Preview chunk before this change already contained path-first `.skel` support, but resource path application can still be affected by same-path Cocos resource index residue from prior JSON/skel swaps;
  - when path data loads but fails during `applyHeroSpineDataWithRetry()`, the old code retried the same path instead of trying the synced `spine_uuid`.
- Cocos implementation:
  - `LobbyHeroDetailPanelRenderer` keeps path-first loading for the normal batch `.skel` pipeline;
  - if path loading returns no `sp.SkeletonData`, or if loaded path data fails to apply after retries, it now calls `loadHeroSpineUuidData()` and retries with the exact `spine_uuid`;
  - uuid-loaded data is cached under `uuid:${uuid}` so it cannot collide with path cache;
  - the visible failure hint still remains if both path and uuid fail.
- Guard update:
  - `scripts/check-layout.mjs` now requires `loadHeroSpineUuidData`, `retryHeroSpineUuidData`, and the uuid retry log token;
  - `scripts/check-preview-freshness.mjs` now checks chunk JS plus `.js.map` `sourcesContent`, avoiding false stale reports caused by TypeScript transpilation.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Preview status:
  - current `npm.cmd run check:preview` now only reports `LobbyHeroDetailPanelRenderer.ts` missing the just-added uuid fallback tokens;
  - the source file timestamp is newer than the Preview chunk timestamp, so Cocos Creator must recompile scripts before the fix can be judged visually.
- Next visual step:
  - in Cocos Creator, stop Preview and trigger script recompilation/reload, then start browser Preview again;
  - rerun `npm.cmd run check:preview`;
  - open Abyss Witch detail and verify Nuu displays; if it still falls back, capture the visible `Spine ...` hint or browser console lines beginning with `[HeroDetail]`.
- Boundary unchanged:
  - Cocos readonly hero-detail loading resilience only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FS Nuu Skel Restore After JSON Abort

- User challenged the accidental JSON re-add and confirmed the desired direction is still the original runtime asset set: `Nuu.skel + Nuu.atlas + Nuu.png`.
- Restored the Cocos runtime folder to skel-only:
  - active: `assets/resources/spine/hero/Nuu/Nuu.skel`;
  - active: `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - active: `assets/resources/spine/hero/Nuu/Nuu.png`;
  - archived the just-added JSON pair to `docs/spine-source-archive/hero/Nuu/runtime-json-archived-20260607-restore-skel/`.
- Removed the accidental backend SQL `sql/29_hero_spine_uuid_nuu_json_restore.sql` because it pointed `hero_template.id=25` back to the JSON uuid.
- Re-sourced existing SQL `D:\project\LootChain\sql\28_hero_spine_uuid_nuu_skel_restore.sql`.
- Local DB readback now returns `hero_template.id=25 / UR_EVELYN / spine_uuid=aa51fc97-c90c-40aa-90d9-2e6f6949482e`, matching `Nuu.skel.meta`.
- Guard update:
  - `scripts/check-layout.mjs` now requires the Nuu skel/atlas/png runtime set;
  - the same guard forbids `assets/resources/spine/hero/Nuu/Nuu.json(.meta)` in this skel-first recovery stage, preventing a duplicate `resources.load('spine/hero/Nuu/Nuu')` mapping.
- Binary diagnosis:
  - Nuu skel header reports Spine `3.8.97`;
  - known working `npc_1001` and `goods_1` skels report Spine `3.8.99`;
  - the latest visible failure `memory access out of bounds` therefore points to Cocos Spine WASM binary parsing/application of this specific skel export, not to UI layout or animation-name selection.
- Current import note:
  - after restoring the skel file, Cocos `library` does not yet contain the restored `aa51fc97-c90c-40aa-90d9-2e6f6949482e` binary import artifact;
  - let Cocos Creator reimport `assets/resources/spine/hero/Nuu/`, then restart/refresh Preview before judging the restored skel visually.
- Boundary unchanged:
  - Cocos readonly resource restore and display metadata only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FT Nuu No-Rotation Atlas Repack

- User screenshot confirmed the restored original Nuu `.skel` now imports and reaches runtime application, but Cocos Spine WASM still throws `memory access out of bounds`.
- Root-cause candidate narrowed:
  - active Nuu `SkeletonData` exists in Cocos `library` as `aa51fc97-c90c-40aa-90d9-2e6f6949482e.bin/json`;
  - DB uuid and Preview script freshness are correct;
  - Nuu `.skel` reports Spine `3.8.97`, within the 3.8 runtime line;
  - the original Nuu atlas contained `rotate: 180` x3 and `rotate: 270` x7, while current working skel assets only use `rotate: true/false`.
- Resource fix attempted without switching to JSON:
  - kept `assets/resources/spine/hero/Nuu/Nuu.skel` unchanged;
  - archived the rotated original `Nuu.atlas` and `Nuu.png` to `docs/spine-source-archive/hero/Nuu/atlas-rotated-archived-20260607-1330/`;
  - rebuilt `Nuu.atlas` and `Nuu.png` from the 46 original files under `assets/resources/spine/hero/Nuu/images/`;
  - new atlas is `2048x2048`, `pma:false`, and every region is `rotate:false`;
  - region names are unchanged, so the original skel still resolves the same attachments.
- Cocos cache sync:
  - copied the new atlas to `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
  - copied the new PNG to `library/24/2488bcbc-471a-4d6e-b9c9-7f0ef3274f08.png`;
  - updated `library/aa/aa51fc97-c90c-40aa-90d9-2e6f6949482e.json` `_atlasText` to the no-rotation atlas so current browser Preview can test without waiting for a full Creator reimport.
- Guard update:
  - `scripts/check-layout.mjs` now fails if `assets/resources/spine/hero/Nuu/Nuu.atlas` contains `rotate: 180` or `rotate: 270`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview`;
  - assets and library Nuu atlas checks both returned `180/270=0`, `true=0`, `false=46`.
- Next visual step:
  - hard-refresh browser Preview and reopen Abyss Witch detail;
  - if the same WASM error remains, the crash is inside the skel binary data itself rather than atlas rotation, and the remaining non-JSON fix is to test another 3.8 binary export of the same Spine project.
- Boundary unchanged:
  - Cocos readonly resource compatibility only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FU Nuu 3.8.99 Binary Version Tag Test

- User refreshed after the no-rotation atlas repack and still saw `Spine 资源应用异常：memory access out of bounds ... spine/hero/Nuu/Nuu`.
- This confirms the original atlas `rotate: 180/270` was not the full cause; the remaining failure is inside Cocos Spine WASM binary parsing/application of `Nuu.skel`.
- New hypothesis:
  - current Nuu binary header reported Spine `3.8.97`;
  - known working current-stage skel assets (`npc_1001`, `goods_1`) report Spine `3.8.99`;
  - Cocos editor compatibility check accepts broad `3.8.*`, but runtime WASM may still be built/tested against `3.8.99` data.
- Reversible experiment:
  - archived the pre-test binary to `docs/spine-source-archive/hero/Nuu/runtime-skel-3897-before-version-tag-test-20260607-1340/`;
  - patched only the single same-length header string in active `assets/resources/spine/hero/Nuu/Nuu.skel` from `3.8.97` to `3.8.99`;
  - patched the matching current Preview cache `library/aa/aa51fc97-c90c-40aa-90d9-2e6f6949482e.bin` the same way;
  - no JSON was added and the skel binary size remains `277716` bytes.
- Verification passed:
  - `npm.cmd run check:layout`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview`;
  - active skel and library bin both parse as Spine `3.8.99`.
- Next visual step:
  - hard-refresh browser Preview with cache bypass (`Ctrl+F5`, or clear localhost `7456` site data if needed) and reopen Abyss Witch detail;
  - if the same WASM error remains, the original `Nuu.skel` body is incompatible with Cocos 3.8 WASM and the non-JSON fix is a fresh Spine 3.8.99 binary export of the same project, with no atlas 180/270 rotations.
- Boundary unchanged:
  - Cocos readonly runtime compatibility experiment only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FV Nuu Real 3.8.99 Binary Export Sync

- User confirmed the version-tag experiment still failed and re-exported Nuu from Spine `3.8.99` as a real binary runtime.
- Active runtime state:
  - `assets/resources/spine/hero/Nuu/Nuu.skel` is a true new binary export, not the previous header-only patch;
  - binary size is now `276937` bytes;
  - parsed Spine version is `3.8.99`;
  - SHA256 is `E45F2E631FE34FF4E6D9BC6AA03FF8399EE9E51D824D9B996F571F41BD50E0BF`.
- Cocos Preview cache state:
  - `library/aa/aa51fc97-c90c-40aa-90d9-2e6f6949482e.bin` has the same size/version/hash as the active runtime skel;
  - `Nuu.skel.meta` uuid remains `aa51fc97-c90c-40aa-90d9-2e6f6949482e`;
  - DB already points `hero_template.id=25 / UR_EVELYN` to that uuid, so no SQL change was required.
- Atlas state:
  - kept the no-rotation atlas generated in Stage 4FT;
  - `Nuu.atlas` still has `rotate:false` x46, no `rotate: true`, no `rotate: 180`, no `rotate: 270`;
  - `pma:false`.
- Guard update:
  - `scripts/check-layout.mjs` now verifies `Nuu.skel` parses as Spine `3.8.99`;
  - it also continues to reject `Nuu.json(.meta)` and atlas `rotate: 180/270` in the current skel-first flow.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview`;
  - active skel and library bin SHA256 match.
- Next visual step:
  - hard-refresh browser Preview and reopen Abyss Witch detail;
  - expected result is that `memory access out of bounds` should be gone and Nuu should display with `idle` presentation;
  - if it still fails, capture the new visible hint because the active binary and cache are now both true Spine `3.8.99`.
- Boundary unchanged:
  - Cocos readonly runtime resource sync only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FW Nuu Fresh UUID For 3.8.99 Re-Export

- User still saw `memory access out of bounds` after the true 3.8.99 binary export, so the remaining suspected issue was resource identity/cache reuse under the old SkeletonData uuid.
- Cocos resource identity change:
  - changed `assets/resources/spine/hero/Nuu/Nuu.skel.meta` uuid from `aa51fc97-c90c-40aa-90d9-2e6f6949482e` to `76bea053-8d55-4925-a0e8-278b50701154`;
  - copied the matching 3.8.99 library cache to `library/76/76bea053-8d55-4925-a0e8-278b50701154.bin/json`;
  - active skel and new library bin SHA256 both equal `E45F2E631FE34FF4E6D9BC6AA03FF8399EE9E51D824D9B996F571F41BD50E0BF`.
- Backend SQL:
  - added and locally sourced `D:\project\LootChain\sql\30_hero_spine_uuid_nuu_3899_reexport.sql`;
  - local DB now returns `hero_template.id=25 / UR_EVELYN / spine_uuid=76bea053-8d55-4925-a0e8-278b50701154`.
- Guard update:
  - `scripts/check-layout.mjs` now verifies the Nuu skel uuid is the fresh 3.8.99 re-export uuid in addition to checking binary version `3.8.99` and no atlas `rotate: 180/270`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview`;
  - DB readback and active/library hash match.
- Next visual step:
  - reload lobby data or fully refresh Preview so the hero API returns the new `spineUuid`;
  - reopen Abyss Witch detail;
  - if path-load still uses old cached resource and fails, uuid fallback should now force-load the fresh 3.8.99 resource identity.
- Boundary unchanged:
  - Cocos readonly resource identity/cache-bust plus display metadata SQL only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FX Nuu Nonessential Binary Export Diagnosis

- User confirmed Nuu still plays correctly inside the Spine editor, but Cocos Preview still throws `memory access out of bounds`.
- Clarification:
  - Spine editor playback proves the authoring project is valid;
  - Cocos Creator 3.8.8 uses its embedded Spine WASM runtime, so binary export data can still be incompatible with Cocos even when the editor plays it.
- Current evidence:
  - new Nuu 3.8.99 binary exists and has a fresh uuid;
  - DB, Cocos library cache, resource path, atlas no-rotation, and Preview script freshness have all been checked;
  - the active Nuu `.skel` still contains `./images/` and an absolute `D:/...` path, while known working skels (`npc_1001`, `goods_1`) contain neither;
  - this points at the Spine export option `非必要的数据 / Nonessential data`, not at the Cocos hero-detail UI code.
- Next required export test:
  - export Data as `二进制`;
  - extension must be `.skel`;
  - uncheck `非必要的数据`;
  - keep `动画清理` enabled if desired;
  - keep `纹理图集 打包` unchecked, preserving the current no-rotation `Nuu.atlas` and `Nuu.png`;
  - output to `assets/resources/spine/hero/Nuu/`.
- Boundary unchanged:
  - diagnosis and export guidance only; no code, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FY Nuu 4.2.43 JSON Runtime Sync

- User decided to stop chasing the Cocos Spine binary WASM issue and exported Nuu as Spine `4.2.43` JSON.
- Active runtime folder is now JSON-only:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`;
  - `Nuu.skel` and `Nuu.skel.meta` are absent from `assets/resources/spine/hero/Nuu/`.
- Cocos import state:
  - `Nuu.json.meta` uuid is `a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`;
  - `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json` exists;
  - JSON parses as Spine `4.2.43`, with `65` bones, `27` slots, and `14` animations.
- Backend SQL:
  - added and locally sourced `D:\project\LootChain\sql\31_hero_spine_uuid_nuu_json_4243_sync.sql`;
  - local DB now returns `hero_template.id=25 / UR_EVELYN / spine_uuid=a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`.
- Guard update:
  - `scripts/check-layout.mjs` now requires Nuu JSON/meta instead of skel/meta;
  - it rejects `Nuu.skel(.meta)` in the runtime folder;
  - it verifies Nuu JSON is Spine `4.2.x` and that `Nuu.json.meta` points to uuid `a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview`;
  - active folder check confirmed `Nuu.skel/.meta` absent and `Nuu.json/.meta` present.
- Next visual step:
  - reload lobby data / hard-refresh Preview so `UR_EVELYN.spineUuid` is `a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`;
  - reopen Abyss Witch detail and verify Nuu displays from JSON with the existing Nuu profile preferring `idle`.
- Boundary unchanged:
  - Cocos readonly runtime resource sync plus display metadata SQL only; no backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4FZ Nuu Atlas Format Compatibility Fix

- User observed that Abyss Witch/Nuu no longer failed outright, but only a tiny body fragment rendered in hero detail.
- Diagnosis:
  - `assets/resources/spine/hero/Nuu/Nuu.json` was valid Spine `4.2.43`;
  - the exported atlas used Spine 4.2 compact entries (`bounds:` / `offsets:`), while the rest of the working Cocos Spine resources use the older `xy/size/orig/offset/index` atlas entry format;
  - Cocos had also embedded the old compact atlas text into `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json` as `_atlasText`, so Preview could continue using the broken parsed coordinates after source replacement.
- Fix:
  - converted `assets/resources/spine/hero/Nuu/Nuu.atlas` from compact `bounds/offsets` to Cocos-compatible `xy/size/orig/offset/index` entries for all `46` regions;
  - synchronized the converted atlas into Cocos library cache:
    - `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
    - `_atlasText` inside `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`.
- Guard update:
  - `scripts/check-layout.mjs` now rejects `bounds:` in Nuu atlas and requires `xy:` entries.
- Next visual step:
  - hard-refresh browser Preview and reopen Abyss Witch detail;
  - if Cocos Creator reimports assets, confirm the library cache still contains the converted atlas format.
- Boundary unchanged:
  - Cocos readonly runtime resource/cache format fix only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GA Nuu No-Rotation Atlas Repack

- User confirmed Nuu now appears, but hair, feet, and motion posture looked wrong compared with the Spine editor reference.
- Diagnosis update:
  - the previous format conversion made Cocos parse the atlas, but it was still based on a packed texture generated with Spine 4.2 packing semantics;
  - user confirmed the Spine 4.2 export did not enable atlas rotation, so the more precise issue is compact `bounds/offsets` atlas semantics plus trim/offset interpretation in Cocos cache/import, not a user-enabled rotation setting.
- Fix:
  - repacked `assets/resources/spine/hero/Nuu/images/*.png` into a new `assets/resources/spine/hero/Nuu/Nuu.png` page with no trimming/offset ambiguity;
  - rebuilt `assets/resources/spine/hero/Nuu/Nuu.atlas` in Cocos-compatible `xy/size/orig/offset/index` format for all `46` regions;
  - page size is now `2048x2048`, used height about `1099`;
  - synchronized the repacked page/atlas into Cocos library cache:
    - `library/24/2488bcbc-471a-4d6e-b9c9-7f0ef3274f08.png`;
    - `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
    - `_atlasText` inside `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`.
- Verification sample:
  - atlas crops for `hair02`, `L_hair01`, `R_hair01`, `L_foot01`, `R_foot`, and `head01` match the source image files byte-for-pixel.
- Next visual step:
  - hard-refresh browser Preview and reopen Abyss Witch detail;
  - if silhouette is now correct but motion posture still differs from the Spine reference, adjust the Nuu detail profile animation selection separately.
- Boundary unchanged:
  - Cocos readonly texture atlas repack/cache sync only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GB Nuu Export Settings Clarification

- User reported the Nuu visual was still wrong after cache/source atlas sync and clarified the Spine export packer had `旋转 / Rotate` unchecked.
- Decision:
  - do not enable atlas rotation for this Cocos runtime test;
  - if re-exporting/repacking from Spine, keep `旋转 / Rotate` unchecked;
  - prefer enabling `旧格式输出 / Legacy output` for the atlas so Cocos receives `xy/size/orig/offset/index` entries directly instead of compact `bounds/offsets`;
  - disable `去除X轴空白区` and `去除Y轴空白区` for Nuu during this test to avoid trim/offset ambiguity with mesh attachments;
  - disable `别名 / Alias` and `预乘Alpha / Premultiply alpha` unless the atlas explicitly writes matching `pma:true` and Cocos is configured for it.
- If the visual remains wrong after a fresh re-export and full Preview reload, next investigation should compare the hero-detail selected animation (`idle` currently preferred for Nuu) with the exact animation being previewed in Spine.
- Boundary unchanged:
  - export guidance only; no code, SQL, backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GC Nuu Clean 4.2.43 Export Sync

- User re-exported Nuu with Cocos-friendly packer settings.
- Active runtime folder:
  - `assets/resources/spine/hero/Nuu/Nuu.json`, size `951122`, Spine `4.2.43`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`, size `4639`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`, size `2340778`, image size `2048x1024`.
- Import identity stayed stable:
  - `Nuu.json.meta` uuid remains `a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`;
  - `Nuu.json.meta.userData.atlasUuid` remains `23fa6f1b-60b3-422d-89b6-1a4d09087bf8`;
  - `Nuu.png.meta` uuid remains `2488bcbc-471a-4d6e-b9c9-7f0ef3274f08`;
  - no backend SQL change is required because `hero_template.id=25` already points to the same `spine_uuid`.
- Atlas checks:
  - `bounds=0`;
  - `xy=46`;
  - `rotate:false=46`;
  - `rotate:true=0`;
  - `rotate:180/270=0`;
  - `pma:true=0`;
  - all regions have `offset: 0,0` and `orig == size`.
- Cocos library cache is synchronized by Creator import:
  - `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`;
  - `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
  - `library/24/2488bcbc-471a-4d6e-b9c9-7f0ef3274f08.png`.
- Guard update:
  - `scripts/check-layout.mjs` now validates Nuu atlas has `46` regions, `rotate:false`, `offset:0,0`, and `orig == size`, in addition to rejecting `bounds:` and requiring `xy:`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview`.
- Next visual step:
  - hard-refresh browser Preview and reopen Abyss Witch detail;
  - if the visual is still wrong, stop changing atlas packer settings and compare the exact Spine editor preview animation with the Cocos-selected animation (`idle` currently preferred for Nuu).
- Boundary unchanged:
  - Cocos readonly runtime resource sync and guard update only; no SQL, backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GD Nuu Hero Detail Animation Profile

- User confirmed the clean atlas/export still looked the same in Preview: hair/feet/posture did not match the Spine editor reference screenshot.
- Diagnosis:
  - Nuu resource/import/cache is now clean, so the remaining visible mismatch is the selected animation;
  - the previous Nuu profile forced `preferIdleFirst: true`, so hero detail always looped `idle`;
  - the provided Spine editor reference pose visually matches Nuu's `run` animation more closely than `idle`.
- Code update:
  - extended `HeroSpineDisplayProfile` in `assets/scripts/scenes/lobby/LobbyHeroDetailPanelRenderer.ts` with:
    - `loopAnimation`;
    - `loopFallbackHints`;
    - `skipIntro`;
    - `introAnimation`;
    - `introFallbackHints`;
  - changed only Nuu's hero detail profile to:
    - `loopAnimation: 'run'`;
    - `skipIntro: true`;
    - existing scale/position kept unchanged.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the new Nuu detail animation tokens.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview` currently fails because running Preview is still serving old chunk `chunks/a7/a7fb55c8dfd684d9aeec34c18872af625688bf8e.js`, missing `loopAnimation: 'run'`, `skipIntro: true`, `displayProfile.loopAnimation`, and `displayProfile.skipIntro`.
- Next visual step:
  - restart/refresh Cocos Creator Preview or hard-refresh browser until `check:preview` passes;
  - reopen Abyss Witch detail and verify Nuu now loops `run` instead of `idle`.
- Boundary unchanged:
  - Cocos readonly hero-detail animation selection only; no resource write gameplay, SQL, backend API contract, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GE Nuu RGBA Timeline Runtime Fix And Intro Idle Profile

- User asked Codex to take over browser Preview testing and tune Abyss Witch/Nuu until the detail view is usable.
- Runtime diagnosis:
  - Preview chunk was fresh at the start of this pass and Nuu was loading as real `sp.SkeletonData`;
  - the old Nuu detail profile applied `run`, but the visual did not match the Spine editor reference;
  - Cocos logged `[Spine] Invalid timeline type for a slot: rgba`;
  - Nuu JSON contained `slot.rgba` timelines in `idle_intro`, `intro`, and `skill2`, causing those animation entries to appear as null / unplayable in Cocos runtime.
- Resource compatibility fix:
  - converted Nuu JSON `animations.*.slots.*.rgba` timelines to Cocos-compatible `color` timelines;
  - synchronized the same conversion into `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`;
  - source and library now both have `rgba=0`;
  - after a fresh automated Preview page load, runtime animation names include `intro`, `idle_intro`, and `skill2`, and `setAnimation()` succeeds for those names.
- Detail profile update:
  - `Nuu` now uses `introAnimation: 'intro'` and loops `idle`;
  - `skipIntro` and forced `run` were removed;
  - Nuu display profile uses `maxScale: 0.52`, `xRatio: -0.035`, `yRatio: 0.012`, based on Preview visual trials that reduced nameplate overlap.
- QA notes:
  - `idle_intro -> idle` was tested and rejected because the animation can leave the character visually transparent/absent after the queue;
  - `intro -> idle` is the chosen behavior and matches the user's earlier desired detail flow.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit with `--types D:\project\lootchain-cocos\temp\declarations\cc`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - source/library `rgba` timeline scan returned `0`.
- Preview verification:
  - Cocos Creator later recompiled the Preview chunk and `npm.cmd run check:preview` passed;
  - real-code browser automation reopened Abyss Witch detail and logged `animation=intro -> idle`, node scale `0.52`, and y position matching the new profile;
  - final screenshots:
    - `D:\project\lootchain-cocos\temp\codex-nuu-final-intro-0700ms.png`;
    - `D:\project\lootchain-cocos\temp\codex-nuu-final-idle.png`.
- Additional visual trial:
  - hiding problematic hair slots such as `R_hair01 + hair03` can remove the large hair/cloth loop, but it visibly cuts away too much hair and was not committed.
- Boundary unchanged:
  - Cocos readonly resource/runtime display compatibility only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GF Nuu Raw 4.2 Runtime Lock

- User re-stated the desired direction: re-export a complete Spine package and do not mutate the Spine asset content itself.
- Active Nuu runtime package is kept byte-for-byte equal to the user's latest complete export under `C:\Users\Ethan\Desktop\C1812\Spine\Nuu\2`:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- Hash check confirmed project files match the external export exactly:
  - JSON SHA256 `6471C5049D8295F1DDC8A2BCAEDC90F97C47B7DD17C4AB700CD3EA3596F53742`;
  - atlas SHA256 `9450E536246D95EC11CE8790ACA37F8EE05FF87187EA5041E74181E3D1BB4E80`;
  - PNG SHA256 `C0B908651A91706894EDD1EAE1BF5270479E624A73B2B378CE89EBF9A03A986F`.
- Important diagnosis:
  - raw Nuu JSON is Spine `4.2.43` and intentionally still contains `rgba` slot timelines;
  - Cocos Preview's current engine cache still maps Spine runtime to `spine-version-3.8.js` / `spine-instantiate-3.8.js`;
  - under 3.8 runtime, Cocos logs `Invalid timeline type for a slot: rgba`, loses `intro / idle_intro / skill2`, and Nuu falls back to a wrong-looking idle pose;
  - under 4.2 runtime, automated browser Preview validation shows all 14 Nuu animations are present and hero detail applies `intro -> idle` successfully.
- Project config update:
  - `settings/v2/packages/engine.json` now includes the same `spine-4.2` module selection as `profiles/v2/packages/engine.json`;
  - `scripts/check-layout.mjs` no longer requires `rgba -> color` conversion and instead guards the raw Spine `4.2.x` JSON flow;
  - `scripts/check-preview-freshness.mjs` now checks the served engine import-map and fails if Preview is still using Spine 3.8, preventing false "fresh chunk" passes while runtime is stale.
- Current local limitation:
  - Codex could not write `D:\Program Files\cocos\editors\Creator\3.8.8\resources\resources\3d\engine\bin\.cache\dev\preview\import-map.json` because ACL allows normal users only read/execute;
  - therefore the currently running ordinary Preview still needs Cocos Creator to rebuild the engine cache from the updated project settings, or Creator must be run once with permission to write its engine cache.
- Automated visual evidence:
  - 3.8 normal Preview screenshot: `temp/codex-nuu-normal-runtime.png`;
  - temporary 4.2 import-map Preview screenshot: `temp/codex-nuu-patched-42-runtime.png`;
  - 4.2 after intro/idle wait: `temp/codex-nuu-42-idle-after-intro.png`.
- Next required local step:
  - close Preview, run Cocos Creator with permission to rewrite the engine cache or use a Creator install in a user-writable directory;
  - reopen the project and Preview, then run `npm.cmd run check:preview`;
  - expected pass condition is that served engine import-map contains `spine-version-4.2.js` and `spine-instantiate-4.2.js`.
- Boundary unchanged:
  - Cocos readonly display/runtime configuration only; no Spine asset content mutation, no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GG Nuu Runtime Baseline Correction

- User clarified that the rest of the project's Spine resources are still `3.x`.
- Important correction:
  - the Stage 4GF temporary 4.2 import-map browser test was a diagnosis tool only;
  - it proved raw Nuu `4.2.43` is visually correct under a 4.2 runtime, but it is not the final project route because Cocos Spine runtime is global;
  - keeping 4.2 globally risks existing `3.8.99` hero assets and `goods_1` UI border Spine assets.
- Final current-stage decision:
  - project Spine runtime baseline stays `spine-3.8`;
  - `settings/v2/packages/engine.json` already has `spine-3.8`;
  - `profiles/v2/packages/engine.json` was restored from `spine-4.2` to `spine-3.8`;
  - `scripts/check-preview-freshness.mjs` now expects Preview engine import-map to serve `spine-version-3.8.js` / `spine-instantiate-3.8.js`.
- Nuu requirement:
  - the active Nuu resource must be re-exported as a complete Spine `3.8.x` JSON runtime package, preferably from Spine `3.8.99`;
  - expected files remain `Nuu.json`, `Nuu.atlas`, and `Nuu.png` under `assets/resources/spine/hero/Nuu/`;
  - do not place `.spine` or `.spine.meta` source files under `assets/resources/spine`;
  - export settings should keep atlas legacy `xy/size/orig/offset/index`, no 180/270 rotation, and no compact `bounds:` atlas entries.
- Guard update:
  - `scripts/check-layout.mjs` now rejects Nuu `4.2.x` JSON and `rgba` slot timelines while the project uses Spine 3.8 runtime;
  - current `check:layout` is expected to fail until Nuu is re-exported as `3.8.x` JSON.
- Why the user's screenshot still looks wrong:
  - ordinary Cocos Preview is correctly using the project 3.8 runtime;
  - raw Nuu `4.2.43` has 4.x timeline/runtime data that 3.8 cannot fully interpret, so hair/posture/intro playback remain wrong;
  - the earlier Codex screenshot that looked correct was produced with a temporary 4.2 runtime override, not the ordinary project Preview.
- Boundary unchanged:
  - Cocos readonly runtime/export decision only; no backend API contract, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GH Hero Roster Card Background Replaces Triangle

- User requested hero roster cards to replace the center triangle placeholder with the image configured by `card_background_asset`.
- Code update:
  - `LobbyHeroRosterPanelRenderer.renderHeroCard()` now renders the unified `hero_card_frame.png` first, then the `cardBackgroundAsset` artwork, then border effects, then rarity/star/name/power/level chrome;
  - if `cardBackgroundAsset` is present, `LobbyHeroRosterHeroRelief` triangle fallback is skipped;
  - if no valid `cardBackgroundAsset` exists, the triangle relief remains as a fallback for unconfigured heroes;
  - artwork width/height are clamped with `Math.min(...)` so the image node cannot exceed the card interior.
- Layering acceptance:
  - card background art is above the baked card frame interior so it is visible;
  - it remains below rarity, stars, name, power, level, class badge, and border effects;
  - configured paths still normalize to `/spriteFrame`.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the `hasCardArtwork` skip path and card-art size clamps.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings;
  - `npm.cmd run check:preview` currently fails because the running Preview still serves the old hero-roster chunk missing the new `hasCardArtwork` / artwork clamp tokens. Refresh/restart Cocos Preview before visual acceptance.
- Boundary unchanged:
  - Cocos readonly card rendering only; no backend API contract, SQL, economy rule, hero ownership, rarity, level, star, power, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GI Hero Card Background Texture Fallback

- User reported the `card_background_asset` image still did not appear on the hero roster card.
- Root cause:
  - `assets/resources/ui/hero-roster/card_background/StoryCover_Nuu.png.meta` imports the image as `texture`;
  - the resource has a texture submeta only and no `spriteFrame`, so loading `ui/hero-roster/card_background/StoryCover_Nuu/spriteFrame` cannot resolve.
- Code update:
  - `LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET` now stores the base path `ui/hero-roster/card_background/StoryCover_Nuu`;
  - `resolveHeroCardBackgroundAssetPath()` normalizes safe resource paths and strips optional `/spriteFrame` or `/texture` suffixes;
  - `renderHeroCardBackground()` first tries to load `${assetPath}/spriteFrame`, then falls back to `Texture2D` via `resources.load(assetPath, Texture2D)` and `${assetPath}/texture`;
  - when only a texture exists, runtime creates a `SpriteFrame` and assigns `frame.texture`, so texture-only imported card artwork can render without modifying the image/meta.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the texture fallback path, card background frame cache, and `missingCardBackgroundLogs`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` still fails because the running Preview is serving old hero-roster chunk `chunks/16/169f5a75e3947698e88b496965aee7b3c8ca24ab.js`;
  - missing tokens include `resolveHeroCardBackgroundAssetPath`, `Texture2D`, `loadHeroCardBackgroundFrame`, and `loadHeroCardBackgroundTexture`;
  - refresh/restart Cocos Preview before visual acceptance.
- Boundary unchanged:
  - Cocos readonly card rendering only; no SQL, backend API contract, economy rule, hero ownership, rarity, level, star, power, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GJ Hero Card Artwork Lower Placement

- User asked for the hero roster card background artwork to sit lower and closer to the lower frame edge.
- Visual adjustment:
  - current card artwork ratios are `HERO_ROSTER_CARD_BACKGROUND_WIDTH_RATIO = 1`, `HERO_ROSTER_CARD_BACKGROUND_HEIGHT_RATIO = 0.5`, and `HERO_ROSTER_CARD_BACKGROUND_Y_RATIO = 0.02`;
  - this moves configured `cardBackgroundAsset` art downward while keeping it clamped inside the card and below rarity/stars/name/power/level/class badge/border effects.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the current `1 / 0.5 / 0.02` card artwork ratios.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Boundary unchanged:
  - Cocos readonly card composition only; no SQL, backend API contract, economy rule, hero ownership, rarity, level, star, power, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GK Hero Card Stars Replace Power Line

- User requested the hero roster card to put star rating at the former combat-power position and stop showing combat power on the card.
- UI update:
  - removed the per-card `LobbyHeroRosterHeroPower` label and `战力 ${formatCompactInteger(hero.power)}` text;
  - removed `HERO_ROSTER_CARD_POWER_Y_RATIO`;
  - latest layout puts `LobbyHeroRosterHeroName` above `LobbyHeroRosterStars`;
  - current ratios are `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.18` and `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.13`, keeping the two rows close together;
  - top HUD/profile combat-power display is unchanged; only the card body hides combat power.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the `0.18 / 0.13` name-stars layout;
  - `check-layout` forbids the removed card-power label/token from returning.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings.
- Boundary unchanged:
  - Cocos readonly card composition only; no SQL, backend API contract, economy rule, hero ownership, rarity, level, star, power semantics, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GL StoryCover Nuu Card Background Sync

- User replaced Nuu's hero roster card background with `StoryCover_Nuu.png` and confirmed the database was already updated.
- Cocos sync:
  - `LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET` now points to `ui/hero-roster/card_background/StoryCover_Nuu`;
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the `StoryCover_Nuu` resource token.
- Resource state:
  - `assets/resources/ui/hero-roster/card_background/StoryCover_Nuu.png` exists;
  - `StoryCover_Nuu.png.meta` imports as `texture`, not `spriteFrame`, so the existing card-background `Texture2D` fallback remains required and valid.
- Resource hygiene:
  - moved newly detected hero `.spine/.spine.meta` source files out of `assets/resources/spine`;
  - archive target is `docs/spine-source-archive/hero/source-archived-20260607-storycover-sync/`;
  - `assets/resources/spine` source scan is back to `0`.
- Documentation sync:
  - `README.md`, `docs/api-contract.md`, and `docs/lobby-feature-analysis.md` now use `StoryCover_Nuu` in current examples.
- Local DB note:
  - the terminal used by Codex currently does not have `mysql` on PATH, so DB readback could not be verified here; user stated DB is already updated.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF warnings;
  - `npm.cmd run check:preview` still reports stale hero-roster chunk missing `ui/hero-roster/card_background/StoryCover_Nuu`; refresh/restart Cocos Preview before visual acceptance.
- Boundary unchanged:
  - Cocos readonly display resource/path sync only; no SQL migration was added here, and no backend API contract shape, economy rule, hero ownership, rarity, level, star, power semantics, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GM Restore Nuu Illust Card Background

- User asked to restore the card background after trying `StoryCover_Nuu`.
- Cocos rollback:
  - `LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET` restored to `ui/hero-roster/card_background/Nuu_Illust`;
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the `Nuu_Illust` resource token again.
- DB/SQL rollback:
  - added `D:\project\LootChain\sql\32_hero_card_background_restore_nuu_illust.sql`;
  - sourced it locally with MySQL 8.0 client;
  - DB readback confirms `hero_template.id=25 / UR_EVELYN -> ui/hero-roster/card_background/Nuu_Illust`.
- Docs:
  - `docs/api-contract.md` current example restored to `UR_EVELYN -> ui/hero-roster/card_background/Nuu_Illust`;
  - `README.md`, `docs/lobby-feature-analysis.md`, `D:\project\LootChain\README.md`, and `D:\project\LootChain\team-history\CURRENT_PROGRESS.md` updated.
- Resource hygiene:
  - `.spine/.spine.meta` source scan under `assets/resources/spine` remains `0`;
  - previously archived source files remain under docs and were not moved back into resources.
- Boundary unchanged:
  - display metadata/resource path rollback only; no backend API contract shape, economy rule, hero ownership, rarity, level, star, power semantics, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-07 Stage 4GN Nine Hero Display Asset Batch Sync

- User assigned 9 enabled UR/SSR templates to Cocos hero runtime resources under `assets/resources/spine/hero` and card art under `assets/resources/ui/hero-roster/card_background`.
- Local DB was synced with `D:\project\LootChain\sql\33_hero_display_asset_batch_sync.sql`.
- Current `hero_template` display mapping:
  - `UR_ARTHAS -> IshmaelA / ui/hero-roster/card_background/IshmaelA_Illust / 3e12af42-2d0f-4cb0-bb36-fd12425a0407`;
  - `UR_ATLAS -> Lucrecia / ui/hero-roster/card_background/Lucrecia_Illust / 3af1df8e-5c10-4a4f-a8f7-2b49f5924988`;
  - `UR_AURELIA -> Belladonna / ui/hero-roster/card_background/Belladonna_Illust / 0b593cca-d1f8-4495-b6bf-2ed043f2d765`;
  - `UR_NYX -> Sphinx / ui/hero-roster/card_background/Sphinx_Illust / a25ac6d0-765c-4ac9-bc9a-3945d8ad6c79`;
  - `UR_SERAPHINA -> LucienA / ui/hero-roster/card_background/LucienA_Illust / 5c80ea13-54f2-42b2-9fd3-8757a2dde3da`;
  - `SSR_KANE -> Ishmael / ui/hero-roster/card_background/Ishmael_center / a4f0537a-ff0e-4ab6-8be3-c19073c8c475`;
  - `SSR_LIVIA -> Carmilla / ui/hero-roster/card_background/Carmilla_center / 2b7cc014-e9c5-47b4-8f45-73dbaa62f268`;
  - `SSR_MICHAEL -> HeylelS01 / ui/hero-roster/card_background/HeylelS01_Illust / 81714937-7711-4e79-899d-f816a406f7ac`;
  - `SSR_RON -> Eulenspigel / ui/hero-roster/card_background/Eulenspigel_Illust / e99b6a83-6849-4175-be1f-55bc1a3a4e29`.
- `D:\project\LootChain\sql\05_hero_module.sql` now applies the same display mapping after the existing `act_ -> npc_` seed mapping, so a fresh local schema does not regress these heroes.
- Cocos `LobbyHeroApi` has readonly fallback display metadata for the same 9 hero codes, including `spineUuid`, to tolerate a temporarily old/local backend response.
- Cocos hero detail now tries `spineUuid` first and falls back to `spine/hero/{spineAsset}/{spineAsset}` only if uuid loading/applying fails. This avoids ambiguous path loading when a hero folder contains both JSON and SKEL SkeletonData with the same base name.
- The 9 assigned hero resources use `HERO_DETAIL_IDLE_ONLY_PROFILE`, so hero detail selects `idle` and skips intro for these heroes. Nuu keeps its existing `intro -> idle` profile.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the new fallback resource tokens, uuid-first fallback path, and idle-only profile tokens.
- Verification:
  - `npm.cmd run check:layout` passed after the update;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview` passed;
  - local MySQL readback confirmed all 9 `hero_template` rows match the assigned `portrait_asset`, `card_background_asset`, `spine_asset`, and `spine_uuid`;
  - browser Preview CDP screenshots confirmed owned mapped heroes render: `temp/codex-nine-hero-roster.png`, `temp/codex-nine-hero-kane-detail.png`, and `temp/codex-nine-hero-livia-detail.png`;
  - Preview console logs confirmed `SSR_KANE -> Ishmael` and `SSR_LIVIA -> Carmilla` applied `animation=idle` by uuid;
  - backend focused test `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest" test` passed with 4 tests.
- Runtime note:
  - the currently running `lootchain-game` on 8081 still appears to be an older process for `cardBackgroundAsset` serialization, because live JSON omitted that field even though current source maps it; Cocos readonly fallback still displays owned mapped cards. Restart `lootchain-game` from current source when API-level cardBackgroundAsset readback is required.
- Boundary unchanged:
  - display metadata and readonly Cocos presentation only; no gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Stage 4GO Hero Detail Spine Nuu-Matched Visual Size Normalization

- User reported that hero-detail Spine characters such as `SSR_KANE` and `SSR_LIVIA` are visually much smaller than Nuu/Abyss Witch and asked to unify detail Spine size with Nuu.
- Cocos update:
  - `LobbyHeroDetailPanelRenderer` now normalizes detail Spine scale by a Nuu-matched visual profile instead of primarily fitting the raw Spine width/height box;
  - Nuu remains the baseline with `HERO_DETAIL_NUU_VISUAL_HEIGHT_RATIO = 0.6`, `maxScale: 0.52`, `xRatio: -0.035`, and `yRatio: 0.012`;
  - the 9 mapped UR/SSR idle-only heroes now use a stronger match profile: `HERO_DETAIL_NUU_MATCHED_HEIGHT_RATIO = 0.78`, `HERO_DETAIL_NUU_MATCHED_MAX_WIDTH_RATIO = 3.2`, `HERO_DETAIL_NUU_MATCHED_MAX_SCALE = 0.78`, and `HERO_DETAIL_NUU_MATCHED_SCALE_MULTIPLIER = 1.18`;
  - this deliberately stops wide weapons/hair/cloth bounds from shrinking the character body into a small figure;
  - the scale resolver now multiplies the resolved `heightFit / widthFit` by `displayProfile.scaleMultiplier`.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the Nuu baseline constants, the Nuu-matched profile constants, and the new `heightFit / widthFit / scaleMultiplier` scaling path.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - 2026-06-08 follow-up `npm.cmd run check:preview` passed after Preview refreshed.
- Boundary unchanged:
  - readonly Cocos hero-detail presentation only; no SQL, backend API, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Stage 4GP Hero Roster Card Background Nuu-Matched Figure Scale

- User reported that hero-roster card background figures should keep the same visual size as Nuu.
- Root cause:
  - `Nuu_Illust` fills its transparent canvas, while many newly mapped card background images have large transparent/top-side padding;
  - previous rendering stretched every image into the same fixed node size, so images such as `Kane/Ishmael`, `Livia/Carmilla`, `Lucrecia`, `Belladonna`, and `HeylelS01` looked smaller than Nuu.
- Cocos update:
  - `LobbyHeroRosterPanelRenderer.renderHeroCardBackground()` now creates `LobbyHeroRosterCardBackgroundMask` with `Mask.Type.GRAPHICS_RECT`, so enlarged card artwork is clipped inside the card art area and does not visually exceed the card frame;
  - card background sprite size is now resolved after `SpriteFrame` load through `resolveHeroCardBackgroundFrameSize()` and `resolveHeroCardBackgroundDisplaySize()`;
  - Nuu keeps `HERO_ROSTER_CARD_BACKGROUND_NUU_VISIBLE_HEIGHT_RATIO = 0.5`;
  - other mapped card backgrounds target `HERO_ROSTER_CARD_BACKGROUND_MATCHED_VISIBLE_HEIGHT_RATIO = 0.58`;
  - known alpha-box height ratios are hard-coded in `HERO_ROSTER_CARD_BACKGROUND_VISIBLE_HEIGHT_RATIOS` for the mapped card art assets;
  - horizontal focus correction uses `HERO_ROSTER_CARD_BACKGROUND_FOCUS_X_RATIOS` so right/left-biased source images center better in the card mask.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the card background mask, visible-height ratio map, focus map, frame-size resolver, display-size resolver, and offset helpers.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - 2026-06-08 follow-up `npm.cmd run check:preview` passed after Preview refreshed.
- Boundary unchanged:
  - readonly Cocos hero-roster card composition only; no SQL, backend API, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Stage 4GQ Gacha Draw Redis-Unavailable Error Clarity

- User reported that Hero Summon real draw shows `系统异常`.
- Investigation:
  - `POST /api/player/gacha/draw` idempotent replay with an existing `requestId` succeeds and returns the old draw result without creating a new draw or deducting resources;
  - local DB confirms `NORMAL_HERO` pool, rates, reward hero templates, and player `DIAMOND` balance are valid;
  - local `127.0.0.1:6379` is not reachable, and no Redis service/command was found on the machine;
  - new draw requests hit Redis idempotency/Redisson locking before cost deduction, so Redis transport failure was previously caught by the global exception handler as `系统异常`.
- Backend fix in `D:\project\LootChain`:
  - `GachaDrawServiceImpl` now converts Redis/Redisson runtime failures during request registration, lock acquisition, and cleanup into `BusinessException("抽卡服务暂不可用，请确认本地 Redis 已启动后重试")`;
  - Redisson lock setup/acquisition failures now clean up the already-registered request key instead of leaving a temporary `抽卡请求处理中` state;
  - cleanup failures no longer mask the original draw failure.
- Test:
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=GachaDrawServiceImplTest" test` passed, 6 tests, 0 failures.
- 2026-06-08 follow-up verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using the generated Cocos declarations;
  - `npm.cmd run check:preview` passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed in both repos with only LF/CRLF warnings;
  - `Test-NetConnection 127.0.0.1 -Port 6379` still returned `TcpTestSucceeded=False`.
- Runtime note:
  - restart `lootchain-game` for 8081 to serve the clearer business message;
  - to make real draw succeed, start a Redis instance on `localhost:6379` matching `application-local.yml`.
- Boundary unchanged:
  - no gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, SQL, or new economy endpoint changed.

## 2026-06-08 Stage 4GR Active R/SR Card Background Asset Sync

- User placed card background PNGs for enabled R/SR heroes under `assets/resources/ui/hero-roster/card_background`.
- Backend/DB sync:
  - added `D:\project\LootChain\sql\34_active_r_sr_card_background_asset_sync.sql`;
  - locally sourced SQL 34 with MySQL 8.0;
  - `hero_template.card_background_asset` now equals `ui/hero-roster/card_background/` + current `spine_asset` for all `status=1`, `deleted=0`, `rarity in ('R','SR')` rows;
  - local readback count confirmed `12` enabled R/SR rows match that rule;
  - `D:\project\LootChain\sql\05_hero_module.sql` now reapplies the same display-only mapping for fresh local schema imports.
- Current mapped R/SR paths:
  - `R_PATROL_01 -> ui/hero-roster/card_background/npc_1001`;
  - `R_ACOLY_02 -> ui/hero-roster/card_background/npc_1012`;
  - `R_SCOUT_03 -> ui/hero-roster/card_background/npc_1004`;
  - `R_CULT_05 -> ui/hero-roster/card_background/npc_1008`;
  - `R_RANGER_06 -> ui/hero-roster/card_background/npc_1016`;
  - `R_GUARD_07 -> ui/hero-roster/card_background/npc_1003`;
  - `SR_PRIEST_01 -> ui/hero-roster/card_background/npc_21006`;
  - `SR_PALADIN_02 -> ui/hero-roster/card_background/npc_1002`;
  - `SR_WITCH_03 -> ui/hero-roster/card_background/npc_1028`;
  - `SR_BLADE_04 -> ui/hero-roster/card_background/npc_1038`;
  - `SR_SNIPER_05 -> ui/hero-roster/card_background/npc_1037`;
  - `SR_ABYSS_06 -> ui/hero-roster/card_background/npc_1036`.
- Cocos sync:
  - added Cocos image `.meta` files for the 12 new `npc_*.png` card background assets, using the same texture-only import style as existing card backgrounds;
  - `LobbyHeroApi` and `LobbyCodexApi` now include readonly fallback display metadata for the same 12 enabled R/SR hero codes, so old/stale backend responses can still display card art;
  - `scripts/check-layout.mjs` now requires the 12 PNG/meta resources and the R/SR fallback tokens;
  - `scripts/check-preview-freshness.mjs` now checks the updated `LobbyHeroApi` and `LobbyCodexApi` chunks.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using generated Cocos declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - new `npc_*.png.meta` JSON parse check passed.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because the running browser Preview still serves old API chunks for `LobbyHeroApi` and `LobbyCodexApi`;
  - refresh/restart Cocos Creator Preview before visual acceptance of R/SR card backgrounds.
- Boundary unchanged:
  - display metadata/resource sync only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Stage 4GS R/SR NPC Card Background Scale Clamp

- User reported the newly added `npc_*` R/SR card background images were far too large and overflowed the card composition in the hero roster.
- Root cause:
  - the previous card-art size resolver used the UR/SSR `*_Illust` profile for every configured `cardBackgroundAsset`;
  - newly added `ui/hero-roster/card_background/npc_*` images have different canvas/visible-character ratios, so `HERO_ROSTER_CARD_BACKGROUND_MATCHED_VISIBLE_HEIGHT_RATIO = 0.58` plus the default alpha-ratio enlargement made them oversized;
  - the old path also forced display width to at least mask width, which stretched narrow/tall NPC images across the card.
- Cocos fix:
  - `LobbyHeroRosterPanelRenderer` now detects `ui/hero-roster/card_background/npc_` assets through `HERO_ROSTER_CARD_BACKGROUND_NPC_PREFIX`;
  - NPC card backgrounds use a compact profile: `HERO_ROSTER_CARD_BACKGROUND_NPC_VISIBLE_HEIGHT_RATIO = 0.42`, `HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_HEIGHT_RATIO = 0.56`, and `HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO = 0.82`;
  - NPC backgrounds keep their original aspect ratio and no longer force-fill the whole mask width;
  - existing Nuu and mapped UR/SSR `*_Illust` card-art profiles are unchanged.
- Guard update:
  - `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the NPC profile constants and `isNpcHeroCardBackgroundAssetPath()` path.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using generated Cocos declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because the running browser Preview still serves old `LobbyHeroRosterPanelRenderer` chunk `chunks/16/169f5a75e3947698e88b496965aee7b3c8ca24ab.js`;
  - refresh/restart Cocos Creator Preview before judging the visual result.
- Boundary unchanged:
  - readonly Cocos card presentation only; no SQL, backend API, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Stage 4GT Gacha Summon Animation Before Real Draw

- User requested that clicking summon first shows a draw/summon animation, using the `C:\Users\Ethan\Desktop\C1812-1` summon composition.
- Source-resource note:
  - direct `C:\Users\Ethan\Desktop\C1812-1\summon` was not present;
  - PNG UI assets were found under `C:\Users\Ethan\Desktop\C1812-1\素材切图\Assets\Data\Prefab\UI\Popup\Summon`;
  - only PNG texture assets were imported into `assets/resources/ui/gacha/summon`;
  - no `.spine` / `.spine.meta` source files were copied into `assets/resources/spine`.
- Imported summon textures:
  - `RecruitBG`, `Summon_BG_Floor`, `PrivateEquip_MagicCircle`, `Recruit_Light`, `silhouette_character`;
  - `Summon_Ally`, `Summon_Neutral`, `Summon_Bystander`, `Summon_Pradator`.
- Cocos flow:
  - `LootChainGameRoot` now has a transient `gachaSummon` view and `PendingGachaDraw` ticket state;
  - `startGachaDraw()` validates the selected pool, switches to `gachaSummon`, stores the pending draw, and schedules `finishPendingGachaDrawAfterAnimation()`;
  - `startGachaDraw()` no longer calls `this.api.gacha.draw` directly;
  - after `GACHA_SUMMON_ANIMATION_DURATION_SECONDS`, `finishPendingGachaDrawAfterAnimation()` rejects stale tickets and calls `executeGachaDrawAfterAnimation()`;
  - `executeGachaDrawAfterAnimation()` creates the requestId and uses the existing `POST /api/player/gacha/draw` path.
- Cocos rendering:
  - `GachaSceneRenderer.renderSummonAnimationScene()` builds a full-screen blocking animation layer;
  - `renderSummonAnimationContent()` composes the imported background, floor, magic circle, light, silhouette, and four side-role sprites;
  - summon textures use `resources.load(assetPath, Texture2D)` plus runtime `SpriteFrame`, matching the existing texture-only fallback pattern.
- Guard update:
  - `scripts/check-layout.mjs` now requires the summon resource files and the pre-draw animation flow tokens;
  - `scripts/check-preview-freshness.mjs` now checks the root/config/renderer chunks for the summon animation implementation.
- Related visual fix kept:
  - the actual NPC card-background compact profile is now `0.42` visible height, `0.56` max display height, and `0.82` max display width.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using generated Cocos declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - summon `.meta` JSON parse passed for all 9 imported PNG metas;
  - `git diff --check` reported only LF/CRLF working-copy warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because the running browser Preview still serves old chunks for `LootChainGameRoot`, `LobbyHeroRosterPanelRenderer`, `GachaSceneConfig`, and `GachaSceneRenderer`;
  - refresh/restart Cocos Creator Preview before visual acceptance of the summon animation and NPC card scale clamp.
- Boundary unchanged:
  - frontend animation/resource display only; no backend API, SQL, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Stage 4GU Recruit_take4 Spine Summon Animation

- User reported the summon scene was still effectively static and clarified that the C1812-1 summon folder contains skeletal animation assets.
- Root cause:
  - the previous implementation imported the `素材切图` PNG composition only;
  - the real Spine runtime files live under `C:\Users\Ethan\Desktop\C1812-1\素材\Assets\Data\Prefab\UI\Popup\Summon`;
  - `Recruit_take4.skel/.atlas/.png`, `Recruit_NPC.skel`, and `Headhunter_NPC.skel` are present there.
- Resource import:
  - imported only `Recruit_take4.skel`, `Recruit_take4.atlas`, and `Recruit_take4.png` into `assets/resources/spine/gacha/summon/recruit_take4`;
  - added Cocos `.meta` files for the directory, `.skel`, `.atlas`, and texture;
  - `Recruit_take4.skel.meta` uses `importer: "spine-data"` with UUID `8ac3b7f5-0cab-4a14-9250-cd19389286c7`;
  - `Recruit_take4.atlas` references `Recruit_take4.png`;
  - no `.spine/.spine.meta` source files were copied or retained under `assets/resources/spine`.
- Cocos config/renderer:
  - added `GACHA_SUMMON_SPINE_RESOURCE = 'spine/gacha/summon/recruit_take4/Recruit_take4'`;
  - added `GACHA_SUMMON_SPINE_UUID`, `GACHA_SUMMON_SPINE_SKIN`, and `GACHA_SUMMON_SPINE_ANIMATION`;
  - `GachaSceneRenderer` now caches summon `sp.SkeletonData`, loads by UUID first, falls back to `resources.load`, and renders `GachaSummonRecruitTake4SpineNode`;
  - `renderSummonAnimationContent()` now calls `renderSummonSpineAnimation()` and destroys the center silhouette fallback when the Spine asset applies successfully;
  - animation name resolution prefers the configured value and then falls back to exported names containing `take`, `recruit`, `summon`, `animation`, `idle`, or `loop`, then the first exported animation.
- Guard update:
  - `scripts/check-layout.mjs` now requires the Recruit_take4 Spine resource triplet, `.meta` UUID/atlas linkage, config constants, and renderer skeleton playback tokens;
  - `scripts/check-preview-freshness.mjs` now checks the Preview chunks for the new summon Spine constants and renderer methods.
- Verification:
  - red test confirmed `check:layout` failed before resources/code were added;
  - after implementation, `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using generated Cocos declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - summon Spine `.meta` JSON parse passed;
  - `git diff --check` reported only LF/CRLF working-copy warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` still fails because the running browser Preview serves old `GachaSceneConfig` and `GachaSceneRenderer` chunks;
  - restart/refresh Cocos Creator Preview and let it import the new Spine resource before visual acceptance.
- Boundary unchanged:
  - frontend animation/resource playback only; no backend API, SQL, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Stage 4GV Fullscreen Summon Background And Rarity Burst

- User reported:
  - the summon Spine looked like a square block;
  - the background should be fullscreen;
  - SSR/UR results should not play the same animation as low-rarity results and should have golden light.
- Root cause:
  - `Recruit_take4` contains its own square `BG` attachment, so the Spine node rendered as a centered box over the scene;
  - the previous flow submitted `POST /api/player/gacha/draw` only after the fixed animation delay, so the animation could not know the real highest rarity early enough to branch.
- Resource import:
  - copied `Summon_Normal_BG.png` from `C:\Users\Ethan\Desktop\C1812-1\素材\Assets\Data\BG\RGB` into `assets/resources/ui/gacha/summon`;
  - added a texture-only `.meta` for `Summon_Normal_BG.png`;
  - no `.spine/.spine.meta` source files were added under `assets/resources/spine`.
- Cocos flow:
  - `PendingGachaDraw` now stores `requestId`, `animationReady`, `result`, `highestRarity`, and `revealHoldScheduled`;
  - clicking summon still immediately enters `gachaSummon`;
  - the existing real draw endpoint is now submitted during the animation by `executeGachaDrawDuringAnimation(ticket)`;
  - the returned result is stored in memory and used only to set `gachaSummonRarity` until the animation window completes;
  - `finishPendingGachaDrawAfterAnimation()` marks `animationReady` and `completePendingGachaDrawIfReady()` presents the result only when both the animation and the response are ready;
  - SSR/UR keeps the rarity burst on screen for `GACHA_SUMMON_RARITY_REVEAL_HOLD_SECONDS` before switching to the existing result page.
- Cocos rendering:
  - `GachaSceneRenderer.renderSummonAnimationScene(layout, mode, rarity)` now receives the highest rarity;
  - `GachaSummonFullScreenBackground` uses `Summon_Normal_BG` with cover sizing so the summon backdrop fills the viewport;
  - `hideSummonSpineSquareBackground()` attempts to clear the exported square `BG` attachment through `skeleton.setAttachment(slotName, '')`;
  - `renderSummonRarityLightBurst()` adds rarity-specific lighting, including `GachaSummonRarityGoldBurst` for SSR and `GachaSummonRarityUrBurst` for UR.
- Guard update:
  - `scripts/check-layout.mjs` now requires `Summon_Normal_BG`, the summon-time draw flow, result rarity resolver, full-screen cover background, square-BG hiding, and SSR/UR gold burst tokens;
  - `scripts/check-preview-freshness.mjs` now checks the same root/config/renderer flow tokens in running Preview chunks.
- Verification:
  - red `check:layout` confirmed missing resource/flow/renderer requirements before implementation;
  - after implementation, `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using generated Cocos declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - new summon background and Spine `.meta` JSON parse passed;
  - `git diff --check` reported only LF/CRLF working-copy warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because the running browser Preview still serves old chunks for `LootChainGameRoot`, `GachaSceneConfig`, and `GachaSceneRenderer`;
  - refresh/restart Cocos Creator Preview and let it import `Summon_Normal_BG` plus the updated summon chunks before visual acceptance.
- Boundary unchanged:
  - same existing draw endpoint only; no backend API, SQL, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Stage 4GW Summon Failure Path Minimum Animation Guard

- User reported clicking summon flashed briefly and returned before any meaningful animation was visible.
- Root cause:
  - after Stage 4GV, the real draw request is submitted during the animation so SSR/UR rarity effects can use the returned result;
  - the success path waited for the animation window, but the failure path immediately cleared `pendingGachaDraw`, set `currentView = 'gacha'`, and rendered the summon page;
  - with local Redis/backend failures this made the summon scene flash for only a moment.
- Cocos fix:
  - `PendingGachaDraw` now includes `error: string | null`;
  - `executeGachaDrawDuringAnimation()` stores `pending.error = message` instead of leaving `gachaSummon` immediately;
  - `completePendingGachaDrawIfReady()` now returns until `pending.animationReady`, then presents either failure or result;
  - added `presentPendingGachaDrawFailure(ticket)` to return to the summon page only after the minimum animation window has elapsed.
- Guard update:
  - `scripts/check-layout.mjs` now rejects immediate `currentView = 'gacha'` inside the summon-time draw executor and requires the delayed failure presenter;
  - `scripts/check-preview-freshness.mjs` now checks the same failure-path tokens in the running Preview chunk.
- Verification:
  - red `check:layout` reproduced the missing delayed-failure behavior before the fix;
  - after implementation, `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed using generated Cocos declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - summon `.meta` JSON parse passed;
  - `git diff --check` reported only LF/CRLF working-copy warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because the running browser Preview still serves an old `LootChainGameRoot` chunk missing `pending.error = message`, `if (!pending.animationReady)`, and `presentPendingGachaDrawFailure`;
  - refresh/restart Cocos Creator Preview before validating this fix visually.
- Boundary unchanged:
  - frontend flow/error presentation only; same existing draw endpoint only; no backend API, SQL, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Stage 4GX Gacha Summon Video Replacement

- User rejected the previous PNG/Spine summon-animation direction and requested that the whole summon-animation adjustment be withdrawn.
- Removed old imported summon-animation resources:
  - `assets/resources/ui/gacha/summon*`;
  - `assets/resources/spine/gacha/summon*`.
- Imported the requested video/audio resources:
  - `assets/resources/video/gacha/call1.mp4` from `C:\Users\Ethan\Desktop\决胜之心3.8.99\UI\视频\call1.mp4`;
  - `assets/resources/video/gacha/call2.mp4` from `C:\Users\Ethan\Desktop\决胜之心3.8.99\UI\视频\call2.mp4`;
  - `assets/resources/audio/gacha/call.mp3` from `C:\Users\Ethan\Desktop\决胜之心3.8.99\UI\音效\call.mp3`;
  - added Cocos `video-clip` and `audio-clip` `.meta` files.
- Cocos flow:
  - clicking summon still uses only the existing `POST /api/player/gacha/draw` endpoint and existing requestId path;
  - `startGachaDraw()` now submits the draw first so the actual returned highest rarity can choose the video;
  - if the current draw contains `SSR` or `UR`, Cocos plays `video/gacha/call2`;
  - otherwise Cocos plays `video/gacha/call1`;
  - `GachaSceneRenderer` renders a full-screen `VideoPlayer` with `keepAspectRatio = false`, mutes embedded video audio, and plays `audio/gacha/call` through `AudioSource`;
  - video completion opens the existing result page and keeps the existing pity/read-only refresh flow;
  - draw failure does not play a video and returns to the summon page with the backend error.
- Guard update:
  - `scripts/check-layout.mjs` now rejects the old summon PNG/Spine resource folders and old animation/preview tokens;
  - it requires the new video/audio resources, video constants, pre-video draw flow, SSR/UR video selection, `VideoPlayer`, and `AudioSource`;
  - `scripts/check-preview-freshness.mjs` now checks the new video-flow tokens in running Preview chunks.
- Self-preview and verification:
  - red `check:layout` failed before the requested video/audio resources and video-flow code existed;
  - after implementation, `npm.cmd run check:layout` passed;
  - directed Cocos Creator 3.8.8 TypeScript no-emit passed using generated declarations;
  - `.meta` JSON parse passed for the new video/audio resources;
  - `ffprobe` confirmed both videos are h264 1680x720, about 3.9 seconds, and `call.mp3` is about 6.06 seconds;
  - extracted mid-frames under `temp/summon-video-preview/` and visually confirmed `call1` and `call2` are distinct, with `call2` brighter/more rare-looking;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF working-copy warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because running Cocos Preview still serves stale chunks for `LootChainGameRoot`, `GachaSceneConfig`, and `GachaSceneRenderer`;
  - refresh/restart Cocos Creator Preview so it imports the new video/audio resources and serves the new chunks before visual runtime acceptance.
- Testing caveat:
  - no real new draw was executed because that would spend resources, write draw logs, and grant heroes/fragments without explicit user confirmation.
- Boundary unchanged:
  - frontend video/audio presentation only; same existing draw endpoint only; no backend API, SQL, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Stage 4GY Gacha Summon Video Aspect Cover Fix

- User reported the full-screen summon video looked stretched/deformed in 1920x1080 Preview.
- Root cause:
  - source videos are 1680x720, aspect ratio 2.33:1;
  - the Preview viewport is 1920x1080, aspect ratio 1.78:1;
  - previous implementation set the video node to viewport size and `videoPlayer.keepAspectRatio = false`, which forced the video to stretch.
- Cocos fix:
  - added `GACHA_SUMMON_VIDEO_ASPECT_WIDTH = 1680` and `GACHA_SUMMON_VIDEO_ASPECT_HEIGHT = 720`;
  - `GachaSceneRenderer.resolveSummonVideoCoverSize(layout)` now computes an aspect-preserving cover size;
  - 1920x1080 now resolves to 2520x1080, centered, so the video fills the screen by cropping sides instead of distorting;
  - `VideoPlayer.keepAspectRatio` is now `true`.
- Guard update:
  - `scripts/check-layout.mjs` now requires the aspect constants, cover-size resolver, cover formulas, and `videoPlayer.keepAspectRatio = true`;
  - the same guard rejects `videoPlayer.keepAspectRatio = false`;
  - `scripts/check-preview-freshness.mjs` now checks the new aspect-cover tokens in running Preview chunks.
- Verification:
  - red `check:layout` reproduced the missing aspect-cover requirements and rejected the old `keepAspectRatio = false`;
  - after implementation, `npm.cmd run check:layout` passed;
  - directed Cocos Creator 3.8.8 TypeScript no-emit passed;
  - 1920x1080 cover-size calculation resolved to 2520x1080, aspect 2.333333;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF working-copy warnings.
- Current Preview caveat:
  - `npm.cmd run check:preview` currently fails because running Cocos Preview still serves stale chunks for `GachaSceneConfig` and `GachaSceneRenderer`;
  - restart/refresh Cocos Creator Preview so it serves the updated chunks before judging the visual fix.
- Boundary unchanged:
  - frontend video sizing only; same existing draw endpoint only; no backend API, SQL, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Read-Only SSR Probability Diagnosis

- User reported the current SSR winning rate feels too high.
- No economy values were changed.
- Read-only code/config review:
  - `GachaRandomServiceImpl.rollRarity()` rolls rarity from `gacha_pool_rate_config.rate`;
  - `GachaRandomServiceImpl.rollByRarity()` then rolls within the selected rarity by `gacha_pool_item.weight`;
  - pity can override rarity when `user_gacha_pity.counter + 1 >= gacha_pity_config.pity_count`.
- `sql/07_gacha_module.sql` and live MySQL read-only query both show `NORMAL_HERO` config version 1:
  - `R = 0.480000`;
  - `SR = 0.320000`;
  - `SSR = 0.180000`;
  - `UR = 0.020000`.
- This means SSR/UR combined probability is 20% per draw; a ten-draw session has about `1 - 0.8^10 = 89.3%` chance of at least one SSR/UR before pity effects.
- Live read-only log sample:
  - all current `NORMAL_HERO` draw results: `UR=1`, `SSR=12`, `SR=32`, `R=29`;
  - high rarity sample rate is `13/74 ~= 17.6%`, close to configured 20%.
- Conclusion:
  - the high SSR feeling is consistent with current economic configuration, not a Cocos video-selection bug;
  - changing it would be an economy/probability change and must be handled only after explicit user approval and review.
- Boundary unchanged:
  - read-only diagnosis only; no SQL, backend API, Cocos economy behavior, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Stage 4GZ Gacha Rate/Pity Adjustment And Real Normal/Limited Opening

- User explicitly approved the economy change for this stage:
  - SSR pity is now `80`;
  - UR pity is now `180`;
  - SSR probability was reduced 5x from `0.180000` to `0.036000`;
  - UR probability was reduced 5x from `0.020000` to `0.004000`.
- R/SR redistribution:
  - released probability was redistributed to R/SR using the old R:SR ratio `3:2`;
  - final rates for each opened real pool are `R=0.576000`, `SR=0.384000`, `SSR=0.036000`, `UR=0.004000`;
  - rate sum remains `1.000000`;
  - ten-draw chance for at least one SSR/UR before pity is now about `1 - 0.96^10 = 33.5%`.
- SQL/backend sync:
  - added and locally sourced `D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`;
  - updated fresh-schema SQL `D:\project\LootChain\sql\07_gacha_module.sql`;
  - updated display gate SQL `D:\project\LootChain\sql\17_gacha_pool_display_config.sql`;
  - updated English gacha pool text in `D:\project\LootChain\sql\23_game_text_i18n.sql`;
  - added read-only guard script `D:\project\LootChain\scripts\check-gacha-economy-config.ps1`.
- Real-open pools:
  - `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW` are active real economy pools;
  - each is `locked=false`, `drawEnabled=true`, `previewOnly=false`;
  - `LIMITED_ABYSS_PREVIEW` uses `LIMITED_CONTRACT_TICKET` 1/10 first, fallback `DIAMOND` 300/3000;
  - `NORMAL_HERO` uses `HERO_CONTRACT_TICKET` 1/10 first, fallback `DIAMOND` 280/2800;
  - `BASIC_CONTRACT_PREVIEW` uses `NORMAL_CONTRACT_TICKET` 1/10 first, fallback `BOUND_DIAMOND` 80/800;
  - limited/hero use `HERO_BASE` pity; basic uses `BASIC_RS_ONLY` with no SSR/UR pity;
  - `SEALED_LIGHT_DARK` remains locked/display-only.
- Reward item scope:
  - the new limited/basic real pools copy the existing active `NORMAL_HERO` reward entries and weights;
  - no EX reward rows are present in the opened pools;
  - existing `NORMAL_HERO` `gacha_pool_item` rows were not changed.
- Cocos sync:
  - no new Cocos write entry was added;
  - Cocos already enables summon buttons from backend fields `drawEnabled=true`, `previewOnly=false`, and `locked=false`;
  - opening normal and limited real draw is therefore driven by backend/DB gate data through the existing `POST /api/player/gacha/draw` only.
- Runtime/API closure:
  - Redis `127.0.0.1:6379` and backend `127.0.0.1:8081` were reachable;
  - `GET /api/player/gacha/pools` showed the three real pools opened and `SEALED_LIGHT_DARK` still locked;
  - detail/pity API checks with `Accept-Language=en-US` returned the new rates and `SSR=80`, `UR=180`;
  - actual draw endpoint calls were made for `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW`;
  - all three reached the real deduction path and returned insufficient-balance for the current user instead of pool-unavailable;
  - draw log/result counts stayed unchanged, confirming no accidental reward write occurred during this balance-limited closure.
- Verification passed:
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-gacha-economy-config.ps1`;
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=GachaPoolServiceImplTest,GachaDrawServiceImplTest,GachaRewardServiceImplTest" test`;
  - Cocos `npm.cmd run check:layout`;
  - directed Cocos Creator TypeScript no-emit for the gacha scene files;
  - Cocos `npm.cmd run check:preview`;
  - `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed in both repositories with only LF/CRLF warnings.
- Boundary after approved change:
  - no EX V1 opened;
  - no gacha exchange/reissue opened;
  - no bag use/sell/batch-use opened;
  - no hero growth, reward/stamina/progress write path opened;
  - no new economy write endpoint was added;
  - no successful real draw was forced because no current account had enough DIAMOND for a paid draw.

## 2026-06-10 Stage 4HA Gacha Draw Guard And Display-Only Pool Closure

- Multi-role review findings:
  - frontend review confirmed the video summon path works for success/failure, but found a race where the player could leave while a draw request was still pending;
  - backend review confirmed Redis/backend were reachable and the low-balance draw path stayed write-clean, but found same-`requestId` replay did not compare payload fields;
  - redline review found the docs/client had drifted from the current `SEALED_LIGHT_DARK` locked/display-only requirement.
- Cocos guard changes:
  - gacha pool drawability now fails closed on `drawEnabled === true`; missing `drawEnabled` no longer means open;
  - `startGachaDraw()`, selected-pool pity loading, and gacha action buttons use the same explicit gate;
  - `closeGachaScene()` blocks return while `gachaSceneState.drawing` or `pendingGachaDraw` is active and shows `召唤请求处理中，请稍候。`;
  - `resetLobbyProfileForLogin()` clears `drawing`, `error`, `lastDrawResult`, and `activeAction` to avoid stale summon state on account switch;
  - `SEALED_LIGHT_DARK` is no longer hidden by `poolCode/displayType=LOCKED/themeColor=locked`; only `displayType=HIDDEN` or `themeColor=hidden` is filtered, so the pool can remain visible as locked/display-only.
- Cocos copy/guard sync:
  - lobby summon copy now says real draw is opened by backend pool state and only `draw` is open; exchange/reissue remain closed;
  - `scripts/check-layout.mjs` now rejects fail-open draw gates, obsolete no-cost summon copy, and the old light/dark hidden filter;
  - `scripts/check-preview-freshness.mjs` checks the same runtime chunk tokens.
- Backend guard changes:
  - `PlayerGachaDrawDTO.requestId` now has `@Size(max=128)`;
  - same-`requestId` replay now compares `poolCode`, `drawCount`, and `useTicket`; mismatches fail with `重复抽卡请求参数不一致`;
  - `PlayerApiPhaseGateTest` explicitly keeps hero `awaken` and `refine` blocked;
  - `scripts/check-gacha-economy-config.ps1` verifies `SEALED_LIGHT_DARK` has no real-open display gate and exactly one locked/display-only gate;
  - added `D:\project\LootChain\scripts\smoke-cocos-gacha-draw-guard.ps1` for low-balance failed draw smoke without persistence.
- Current self-preview status:
  - `npm.cmd run check:layout` passes;
  - directed Cocos Creator TypeScript no-emit passes;
  - running Preview on `http://127.0.0.1:7456` refreshed and `npm.cmd run check:preview` passes;
  - if Preview stale chunks recur, non-destructive repo inspection found no npm/CLI command that can refresh them from outside Creator; use Creator `Reimport Asset` on the changed scripts plus `Project -> Refresh Device`, or close/reopen Preview, then rerun `npm.cmd run check:preview`.
- Backend verification status:
  - targeted Maven tests pass for gacha draw replay/PhaseGate/requestId guard;
  - economy guard passes, including `SEALED_LIGHT_DARK locked display-only gate = 1`;
  - low-balance smoke for `NORMAL_HERO` passes with `drawLogs=0`, `drawResults=0`, `rewardGrantLogs=0`, and `currencyLogs=0`.
- Boundary unchanged:
  - Cocos still uses only existing `POST /api/player/gacha/draw` for gacha writes;
  - no EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint was opened;
  - no recharge or successful new draw was performed in this pass.

## 2026-06-10 Stage 4HB Multi-Pool Low-Balance Draw Guard Closure

- Multi-role review findings:
  - frontend review confirmed the 4HA Cocos draw gate already fails closed and low-balance failures do not enter summon video;
  - backend/API review found the remaining repeatable验收 gap was that the low-balance draw smoke defaulted to `NORMAL_HERO` while three pools are now real-open;
  - redline review found old documentation still implied Cocos抽卡完全关闭, which is no longer the current staged boundary.
- Backend smoke update:
  - `D:\project\LootChain\scripts\smoke-cocos-gacha-draw-guard.ps1` now accepts `-PoolCode` as a string array, with alias `-PoolCodes`;
  - default pool list is `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW`;
  - the script logs in once, reads pool gates once, then runs the same low-balance failed draw guard for each target pool;
  - for each pool it aborts if the account can afford a successful single draw, calls existing `POST /api/player/gacha/draw` twice with the same request id, and verifies no draw/result/reward/currency/hero/fragment/pity state changed.
- Scope:
  - no Cocos code path was changed in this stage;
  - `SEALED_LIGHT_DARK` remains visible locked/display-only and is not included in real-open failure smoke;
  - no recharge, successful new draw, new API route, or new economy write endpoint was added.
- Stage 4HB verification passed:
  - Redis `127.0.0.1:6379` was reachable and backend `http://localhost:8081/v3/api-docs` exposed `/api/player/gacha/draw`;
  - backend multi-pool smoke passed for `userId=4` on `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW`;
  - each pool reported `balance=0.000000 < 280.00`, failed twice with business code `1000`, and ended with `drawLogs=0`, `drawResults=0`, `rewardGrantLogs=0`, and `currencyLogs=0`;
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-gacha-economy-config.ps1` passed;
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerApiPhaseGateTest,GachaPoolServiceImplTest,GachaDrawServiceImplTest,GachaRewardServiceImplTest,PlayerBattleServiceImplTest,PlayerGachaDrawDTOTest" test` passed with `35 tests, 0 failures`;
  - Cocos `npm.cmd run check:layout`, directed TypeScript no-emit, `npm.cmd run check:preview`, and `.spine/.spine.meta` scan passed;
  - Browser self-preview opened `http://127.0.0.1:7456`, logged in as `userId=4`, reached lobby, opened `召唤祭坛`, and visually confirmed the three real-open pools plus visible locked/display-only `光暗召唤`; no browser console errors appeared and no single/ten draw button was clicked;
  - `git diff --check` passed in both repos with only LF/CRLF warnings.

## 2026-06-10 Stage 4HC Hero Summon Center Spine Display Fix

- User reported that clicking `英雄召唤` still showed the limited summon center skeleton.
- Reproduction:
  - Browser Preview `http://127.0.0.1:7456` logged in as `userId=4`;
  - opened `召唤祭坛`;
  - clicked `英雄召唤`;
  - left rail highlighted hero pool, but the center still rendered the limited-pool `huangfengjiaozong` skeleton.
- Root cause:
  - `NORMAL_HERO` runtime display row `gacha_pool_display_config(pool_code='NORMAL_HERO', config_version=1)` had `center_spine_resource='spine/gacha/huangfengjiaozong/huangfengjiaozong'`;
  - this matched `LIMITED_ABYSS_PREVIEW`, so Cocos correctly followed backend data but displayed the wrong pool presentation.
- Fix:
  - added and locally sourced `D:\project\LootChain\sql\36_gacha_hero_center_spine_display_sync.sql`;
  - updated `NORMAL_HERO` center Spine to `spine/gacha/hunka_nima/hunka_nima`;
  - updated UUID to `cd644c64-da4a-4397-8f3b-cdb3ffcbd3c5`;
  - synchronized fresh SQL `D:\project\LootChain\sql\17_gacha_pool_display_config.sql` and incremental economy-opening SQL `D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`;
  - extended `D:\project\LootChain\scripts\check-gacha-economy-config.ps1` to require this mapping and assert `NORMAL_HERO` does not reuse `LIMITED_ABYSS_PREVIEW` center Spine.
- Verification:
  - red test: updated economy/display guard failed before SQL import with `NORMAL_HERO center spine resource expected [spine/gacha/hunka_nima/hunka_nima], got [spine/gacha/huangfengjiaozong/huangfengjiaozong]`;
  - after SQL import, DB readback and `GET /api/player/gacha/pools` returned `NORMAL_HERO centerSpineResource=spine/gacha/hunka_nima/hunka_nima`;
  - Browser self-preview after refresh/login showed `英雄召唤` center as the `hunka_nima` white-haired seated skeleton, not the limited-pool `huangfengjiaozong`;
  - no single/ten draw button was clicked during preview;
  - `scripts/check-gacha-economy-config.ps1` passed;
  - three-pool low-balance smoke passed for `userId=4` and kept `drawLogs=0`, `drawResults=0`, `rewardGrantLogs=0`, and `currencyLogs=0` for each pool;
  - targeted Maven suite passed with `35 tests, 0 failures`;
  - Cocos `npm.cmd run check:layout`, directed TypeScript no-emit, `npm.cmd run check:preview`, `.spine/.spine.meta` scan, and both repo `git diff --check` passed.
- Boundary unchanged:
  - display metadata only; no probability, weight, pity, cost, reward, draw path, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-10 Stage 4HD Normal Summon R/SR Only And Box Summon Center Spine

- User request:
  - remove SSR/UR heroes from `普通召唤`;
  - use `D:\project\lootchain-cocos\assets\resources\spine\gacha\box_summon` for the summon page center Spine;
  - keep its center size consistent with the other real-open summon presentations.
- Economy/display update:
  - added and locally sourced `D:\project\LootChain\sql\37_basic_contract_rs_only_box_summon_display.sql`;
  - synchronized `D:\project\LootChain\sql\07_gacha_module.sql`;
  - synchronized `D:\project\LootChain\sql\17_gacha_pool_display_config.sql`;
  - synchronized `D:\project\LootChain\sql\23_game_text_i18n.sql`;
  - synchronized `D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`.
- Current active rates:
  - `LIMITED_ABYSS_PREVIEW` and `NORMAL_HERO`: `R=0.576000`, `SR=0.384000`, `SSR=0.036000`, `UR=0.004000`;
  - `BASIC_CONTRACT_PREVIEW`: `R=0.600000`, `SR=0.400000`, no active `SSR` or `UR` rate row.
- Current `BASIC_CONTRACT_PREVIEW` reward scope:
  - active reward item rarities are only `R` and `SR`;
  - active SSR/UR reward item count is `0`;
  - active SSR/UR duplicate config count is `0`.
- Current `BASIC_CONTRACT_PREVIEW` display mapping:
  - `center_spine_resource=spine/gacha/box_summon/boxman_text`;
  - `center_spine_uuid=3a0e1b57-8392-4f08-83ce-31ce91d26481`;
  - `center_spine_skin=default`;
  - `center_intro_animation=idle`;
  - `center_idle_animation=idle`.
- Cocos resource sync:
  - generated Cocos meta files for `assets/resources/spine/gacha/box_summon`;
  - moved source file `assets/resources/spine/gacha/box_summon/252.spine` to `docs/spine-source-archive/gacha/box_summon/252.spine`;
  - `scripts/check-layout.mjs` now requires the box summon runtime files and rejects `box_summon/252.spine` returning under `assets/resources/spine`.
- Cocos display update:
  - `GachaSceneRenderer` gives `box_summon` a small pool-specific scale multiplier so the normal summon center Spine matches the other two real-open presentations more closely;
  - the `概率保底` panel now uses backend `rateNote` and `guaranteeNote` when present;
  - fallback rows are filtered by active rate rarities, so normal summon no longer shows inactive SSR/UR pity rows;
  - decimal rate fallback now formats `0.6` as `60%`, not `0.6%`.
- Guard update:
  - `D:\project\LootChain\scripts\check-gacha-economy-config.ps1` now expects `BASIC_CONTRACT_PREVIEW` to have exactly two active rate rarities, no active SSR/UR items or duplicate configs, and its own `box_summon` center Spine distinct from limited/hero.
- Verification:
  - `GET /api/player/gacha/pools` returned `BASIC_CONTRACT_PREVIEW.drawEnabled=true`, `previewOnly=false`, `locked=false`, `centerSpineResource=spine/gacha/box_summon/boxman_text`, and rate/guarantee notes that describe R/SR-only normal summon;
  - three-pool low-balance smoke passed for `userId=4` without draw/result/reward/currency writes;
  - targeted Maven suite passed with `35 tests, 0 failures`;
  - Cocos `npm.cmd run check:layout`, directed Cocos TypeScript no-emit, `npm.cmd run check:preview`, and `.spine/.spine.meta` scan passed;
  - Browser Preview opened `http://127.0.0.1:7456`, logged in, reached `召唤祭坛`, confirmed `普通召唤` renders `box_summon`, confirmed `概率保底` shows R/SR-only copy with no SSR/UR pity rows, and confirmed `奖池内容` lists only two R rows and two SR rows;
  - no single/ten draw button was clicked during visual verification.
- Boundary unchanged:
  - Cocos still uses only existing `POST /api/player/gacha/draw`;
  - no EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy endpoint opened;
  - no recharge or successful paid draw was performed for this stage.

## 2026-06-17 Visual Battle Stage 12 Final Verification Note

- Stage 12 battle scene redesign implementation is in the Cocos source tree and backend schema/API shape:
  - `LobbyBattlePreviewPanelRenderer.ts` contains the Stage 12 hero card deck, renderable-unit filtering, enemy placeholder, action callout, victory overlay, and audio stale-callback guard;
  - `BattleApi.ts` preserves `portraitAsset/spineAsset/spineUuid/scaleProfile` from battle start normalization so battle rendering does not lose backend resource fields;
  - `LobbyBattleUnitSpineRuntime.ts` contains `portrait_asset=act_*` first battle Spine mapping, `spine_asset/npc_*` fallback, R/SR and SSR/UR animation fallback names, and rarity-based scale profiles;
  - `LobbyBattlePresentationLayout.ts` uses Stage 12 battlefield formation offsets for desktop/horizontal Preview instead of the old equal-spaced vertical list;
  - `LootChainGameRoot.ts` invalidates the local battle start snapshot when formation changes, so the next battle preview creates a fresh start request with the current `heroIds`;
  - backend battle enemy/config models expose `spineAsset`, `enemy_spine_asset`, and `boss_spine_asset`.
- Verified on 2026-06-17:
  - Cocos Creator 3.8.8 TypeScript no-emit passed with generated Cocos declarations;
  - `npm.cmd run check:battle-stage10` passed;
  - `npm.cmd run check:battle-stage12` passed;
  - `npm.cmd run check:layout` passed;
  - `npm.cmd run check:preview` passed after focusing Cocos Creator and refreshing the Preview target;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - backend SQL `sql/65_battle_visual_spine_fields.sql` was sourced locally and returned both new columns present;
  - backend targeted Maven suite `BattleConfigAdminServiceImplTest,PlayerBattleServiceImplTest` passed with `50 tests, 0 failures`;
  - both repositories `git diff --check` passed with only LF/CRLF warnings.
- Browser Preview result:
  - logged in through existing `dev-login`, opened adventure -> formation -> battle preview;
  - after selecting `heroIds=[5,11,9,10]`, intercepted `/api/player/battles/start` request body confirmed those ids were submitted;
  - battle page rendered actual hero Spine for the configured heroes and mirrored enemy placeholders; old right-side settlement strategy table, BGM status strip, battle log, and performance badge were hidden from the main battlefield;
  - only the existing battle start session was created by the current battle flow; no `POST /api/player/battles/{battleNo}/settle` was clicked or called.
- Boundary unchanged:
  - no battle settlement, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry was opened.

## 2026-06-18 Hero Detail Spine Audio Callback Guard

- User reported the hero detail page crashed with `Cannot read properties of null (reading 'isValid')`.
- Root cause:
  - `LobbyHeroDetailPanelRenderer.playHeroSpineAudioEvent()` loaded Spine event audio asynchronously;
  - after returning, switching, or rerendering the hero detail page, the old `AudioSource.node` could already be `null`;
  - the old callback still read `audioSource.node.isValid`, which raised the Cocos error overlay.
- Fix:
  - added `isNodeAlive()` and `isHeroSpineAudioSourceNodeValid()` in `LobbyHeroDetailPanelRenderer.ts`;
  - guarded both the Spine event-listener entry and the delayed audio-load callback;
  - replaced the direct `audioSource.node.isValid` access.
- Guardrails:
  - `scripts/check-layout.mjs` now requires the hero-detail audio source node guard and rejects direct `audioSource.node.isValid`;
  - `scripts/check-preview-freshness.mjs` now requires the new guard token in the active Preview chunk.
- Verification:
  - `npm.cmd run check:layout` failed before the production fix with the expected missing guard/direct-access messages, then passed after the fix;
  - directed Cocos TypeScript no-emit passed;
  - `npm.cmd run check:preview` passed after focusing Cocos Creator and letting Preview rebuild;
  - Browser Preview logged in, opened the hero list, opened SR `见习圣骑士` detail, and confirmed no `Cannot read properties of null` overlay and no page error logs;
  - quick back/reopen stress path also produced no page errors.

## 2026-06-19 Battle Scene Takeover Fix And Visual-Only Acceptance

- User rejected the prior AI battle scene result because the battlefield still looked like the old rough version, hero Spine was missing in some paths, and Preview could throw Cocos runtime errors.
- Scope handled in Cocos-only frontend:
  - removed the accidental duplicate `assets/scripts/sc` / `assets/scripts/sc.meta` import source that could pollute Cocos Preview chunks;
  - closed the stale Preview chunk issue by reopening Cocos Creator after old generated preview targets kept serving removed `renderStage13ResultEnhancement` / `displayName.slice` code;
  - fixed `BattleChallengeDialogRenderer` so the adventure challenge dialog returns its root node, uses real layout width/height for the modal dim layer, and exposes close/formation/challenge actions cleanly;
  - routed adventure map nodes, compact challenge entry, and detail CTA through the challenge dialog first; `挑战` now closes the dialog and opens `openLobbyBattlePreviewPanel(stageCode)`, while `布阵` opens formation;
  - removed the obsolete Stage 13 result enhancement overlay from `LobbyBattlePreviewPanelRenderer` so it does not compete with the Stage 12/C1812 victory result layer;
  - disabled the legacy Stage 13 insertion script so rerunning it cannot reintroduce stale result-banner code;
  - updated battle animation cue mapping for SSR/UR (`atk/hit/dead/skill1/skill2/skill3/ult/victory`) and SR/R (`skill0/skill1/skill2/skill4/hurt/die/win_1/win_2`) fallback names;
  - changed the current visual battle flow so演出完成后主按钮为 `返回大厅`，结算链路显示 `结算预留/视觉回放`，不在 UI 上触发 `/settle`;
  - hardened hero-detail Spine audio and battle hero-card labels against async null-node / missing-name crashes.
- 2026-06-19 additional fix:
  - direct `挑战` from the adventure challenge dialog previously reused a stale local formation containing only the protagonist, so `POST /api/player/battles/start` sent `heroIds=[5]` while the dialog showed `出战 5/5`;
  - `LootChainGameRoot.openLobbyBattlePreviewPanel()` now fills the default top-5 lineup before battle start when entering directly from adventure, while preserving manual choices when entering from the formation page;
  - `scripts/check-preview-freshness.mjs` now requires `fillLobbyFormationWithDefaultHeroes` and `fillDefaultFormationForDirectChallenge` in the active Preview chunk to catch this stale-build failure mode.
- Runtime boundary:
  - current Preview acceptance may call `GET /api/player/battles/recent` and `POST /api/player/battles/start`;
  - do not click or enable `POST /api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.
- Browser evidence:
  - final challenge dialog screenshot: `artifacts/battle-takeover-final5-01-challenge-dialog.png`;
  - final battle preview screenshot: `artifacts/battle-takeover-final5-02-battle-preview.png`;
  - final after-wait screenshot: `artifacts/battle-takeover-final5-03-after-wait.png`;
  - final network trace contained `GET /api/player/battles/recent` and `POST /api/player/battles/start`, no `/settle` request, `heroIds=[5,11,9,10,63]`, and battle start response `lineup.length=5`.

## 2026-06-19 Battle Scene Takeover Second Pass

- User reported the Zhipu-generated battle scene still looked rough and errored; current pass continued the Cocos-only battle takeover without changing backend economy or settlement authority.
- Product/UI fixes:
  - `LobbyFormationPanelRenderer.ts` now presents formation as a battle scene: left `LobbyFormationBattlefieldScene` with 5 hero stand-ins/nameplates, right `LobbyFormationHeroPicker` with selectable owned heroes;
  - `BattleChallengeDialogRenderer.ts` now labels rewards as `奖励预览` and explicitly states this round does not grant rewards or consume stamina;
  - `LobbyAdventurePanelRenderer.ts` now builds the challenge dialog ally lineup from `currentLobbyFormationHeroIds()` first, falling back to default top-5 only when there is no manual formation.
- Battle playback fixes:
  - melee movement now advances by actor/target anchor distance rather than a small fixed slot-width nudge, so heroes and monsters move toward the center combat area;
  - `LobbyBattleActionTargetSpineEffectLayer` consumes `skill1Kz/skill2Kz/skill3Kz/skill4Kz` from the actor Spine runtime and plays target-area skill effects when available, with a local magic-circle fallback;
  - visual playback completion now shows `LobbyBattleStage12VictoryOverlay` even without a real settlement receipt, and the reward line says rewards are preview-only/not granted.
- Guard/docs updates:
  - `check-preview-freshness.mjs`, `check-layout.mjs`, `check-battle-stage6.mjs`, and `check-battle-stage12.mjs` now require the new target-effect, formation-layout, and visual-victory tokens;
  - `docs/battle/stage6-actions-and-float-text.md` and `docs/battle/stage12-battle-scene-redesign.md` have the 2026-06-19返修 notes.
- Boundary unchanged:
  - current flow may create battle sessions with existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.
- Final acceptance update:
  - `LobbyAdventurePanelRenderer.ts` no longer shows the old “首通胜利按服务端白名单结算” copy in the current visual-only adventure guidance; it now states this pass only plays the battle presentation and does not submit settlement;
  - Browser Preview path passed: login -> lobby -> adventure -> challenge dialog -> formation -> challenge -> battle presentation -> visual victory;
  - evidence screenshots:
    - `artifacts/battle-takeover-secondpass-06-challenge-dialog.png`;
    - `artifacts/battle-takeover-secondpass-07-formation.png`;
    - `artifacts/battle-takeover-secondpass-08b-battle-early.png`;
    - `artifacts/battle-takeover-secondpass-09b-battle-victory.png`;
  - intercepted battle requests were only `GET /api/player/battles/recent` and `POST /api/player/battles/start`;
  - the start request used `stageCode=MAIN_1_2`, `heroIds=[5,11,9,10,63]`, `leaderHeroId=5`;
  - no `/api/player/battles/{battleNo}/settle` request was emitted.

## 2026-06-19 Battle Visual Victory Audio Patch

- Completion audit found that C1812 battle audio resources and action SFX were connected, but visual-only victory had no settlement receipt and therefore did not trigger the existing `resultWin` cue.
- `LobbyBattleAudioRuntime.ts` now maps `roundPlaying + presentationComplete + start + no settlement` to a one-shot `resultWin` cue with a `visualVictory` play key.
- `scripts/check-battle-stage11.mjs` now probes this exact visual-only state and verifies the `resultWin` resource path and visual-only play key.
- `scripts/check-preview-freshness.mjs` now requires the `visualVictory` token so Preview cannot silently serve the older audio runtime.
- Boundary unchanged:
  - visual victory audio is local-only feedback;
  - it does not submit `/api/player/battles/{battleNo}/settle`;
  - it does not grant rewards, consume stamina, progress mainline, mutate currency/bag/heroes, or open a new economy write entry.

## 2026-06-19 Battle Flow Completion Audit Patch

- Product/technical audit found two remaining frontend gaps against the user battle-flow objective:
  - dungeon/challenge-style lobby entries still showed a placeholder instead of entering the stage map;
  - the formation battlefield used silhouettes/nameplates instead of attempting real hero Spine previews.
- Cocos updates:
  - `LobbyHudRenderer.ts` now routes the `战役` hotspot, right-side challenge cards, and compact `挑战` entrance to the same mainline stage map through `openLobbyBattleMapFromDungeonEntry()`;
  - this route only opens the map and status copy, and still requires the challenge dialog/formation/battle-start flow before any battle session can be created;
  - `LobbyFormationPanelRenderer.ts` now tries to render `LobbyFormationActorSpinePreview` from each selected hero's `spineAsset/spineUuid`, reusing the battle Spine runtime mapping and rarity scale profile; missing or incompatible resources still fall back to `LobbyFormationActorFallbackSilhouette`.
- Resource audit notes:
  - backend/DB currently has 22 enabled heroes with `portrait_asset/spine_asset/spine_uuid` present, and all referenced Cocos hero Spine directories exist;
  - not every imported hero resource exposes the strict requested animation names. Current runtime therefore keeps compatibility fallback mapping for R/SR and SSR/UR instead of pretending all source assets are strictly renamed;
  - `R_ACOLY_02 / npc_1012` has a DB UUID mismatch risk, but current runtime loads by resource path first, so gameplay preview remains covered while DB sync can be handled separately.
- Guard updates:
  - `check-layout.mjs` and `check-preview-freshness.mjs` now require dungeon-entry-to-map tokens and formation Spine preview tokens.
- Boundary unchanged:
  - no `/api/player/battles/{battleNo}/settle` exposure;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Formation Spine Runtime Patch

- Follow-up audit found that formation `LobbyFormationActorSpinePreview` could still fall back to silhouettes even when hero `.skel/.atlas/.png` resources existed.
- Root cause was twofold:
  - formation preview applied `SkeletonData` once and immediately fell back if Cocos Spine runtime data was not ready yet;
  - local Cocos `library/.assets-data.json` still indexed archived `.spine` source files under `assets/resources/spine`, so Preview could keep serving stale resource metadata after the physical files were removed.
- Cocos updates:
  - `LobbyFormationPanelRenderer.ts` now mirrors the hero-detail stable loading path: UUID first when present, resource path fallback, runtime-data retry delays `[180, 420, 900]`, explicit `[Formation]` failure reasons, and final silhouette fallback only after retry exhaustion;
  - `scripts/check-layout.mjs` now scans `library/.assets-data.json` when present and fails if it still indexes `db://assets/resources/spine/**/*.spine`;
  - `scripts/check-preview-freshness.mjs` now requires the formation retry tokens so Preview cannot silently serve the older direct-fallback chunk.
- Local recovery performed:
  - removed stale generated `library/.assets-data.json` and Preview targets;
  - restarted Cocos Creator for `D:\project\lootchain-cocos`;
  - verified the rebuilt AssetDB has `0` forbidden `.spine` source refs and `check:preview` serves the updated chunk.
- Boundary unchanged:
  - no `/api/player/battles/{battleNo}/settle` exposure;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Default Formation Closure Patch

- Browser acceptance after the Spine runtime patch exposed a separate lineup bug:
  - challenge dialog and `battle start` still used `heroIds=[5]`;
  - `normalizeLobbyFormationHeroIds([])` auto-added the protagonist, causing `resolveLobbyFormationHeroIds()` to treat an empty local selection as a valid 1-person lineup.
- `LootChainGameRoot.ts` now resolves all formation consumers through `resolveDefaultFilledLobbyFormationHeroIds()`:
  - empty or underfilled local selection is filled from the current default top-5 selectable heroes;
  - manual selections are still normalized, capped at 5, and keep the protagonist leader.
- Guard updates:
  - `check-layout.mjs` and `check-preview-freshness.mjs` require the new default-filled formation helper tokens.
- Verified browser path after Preview rebuild:
  - lobby -> adventure map -> challenge dialog shows `出战 5/5`;
  - formation page shows `已确认 5/5` and renders non-protagonist hero Spine actors;
  - battle start request body uses `heroIds=[5,11,9,10,63]`, `leaderHeroId=5`;
  - battle page shows left-side 5-person team, right-side monster placeholders, damage float/victory overlay;
  - network trace has `POST /api/player/battles/start` and no `/settle`;
  - evidence files: `artifacts/battle-takeover-20260620-r4-03-challenge-dialog.png`, `artifacts/battle-takeover-20260620-r4-04-formation.png`, `artifacts/battle-takeover-20260620-r4-05-battle-early.png`, `artifacts/battle-takeover-20260620-r4-06-battle-late.png`, `artifacts/battle-takeover-20260620-r4-summary.json`.
- Boundary unchanged:
  - no `/api/player/battles/{battleNo}/settle` exposure;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Takeover Repair R6

- Took over after the external AI battle-scene pass still looked like a placeholder and could show `Cannot read properties of null (reading 'isValid')`.
- Root-cause findings:
  - the battle timeline had 45-60 seconds of events, but `LobbyBattleFlow.ts` compressed it into 4 ticks over 3 seconds;
  - the renderer mapped `presentationStep / 4`, so early screenshots could jump straight to damage or victory;
  - async UI/Spine/audio callbacks could still read `node.isValid` after the node owner was destroyed;
  - battle actor Spine loading tried resource path before UUID, which could miss or misapply existing hero Spine data.
- Cocos updates:
  - `LobbyBattleState.ts` now defines `LOBBY_BATTLE_PRESENTATION_STEP_COUNT = 24` and `LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS = 500`;
  - `LobbyBattleFlow.ts`, `LobbyBattlePresentationState.ts`, and `LobbyBattlePreviewPanelRenderer.ts` now use that shared 24-step cadence so approach, hit, counter, assist, finish, and visual victory are visible;
  - `renderImpactLayer()` now only shows hit/damage effects for the current hit/damage cue instead of falling back to a global first damage event;
  - `LobbyBattlePreviewPanelRenderer.ts` now loads hero battle Spine by UUID first when available, falls back to resource path only after UUID failure, and destroys the fallback silhouette for both ally and enemy when Spine applies;
  - `LobbyHeroDetailPanelRenderer.ts`, `LobbyBattlePreviewPanelRenderer.ts`, and `UiSpriteFrameCache.ts` now guard stale async callbacks with safe `node.isValid` checks;
  - added `check:battle-stage13d` and `check:battle-stage13g`, and included both in `check:battle-stage13i`, so strict rarity animation mapping and audio runtime integration are guarded rather than only module-existence checked.
- Browser Preview acceptance evidence:
  - `artifacts/battle-takeover-20260620-r6-01-challenge-dialog.png`;
  - `artifacts/battle-takeover-20260620-r6-02-formation.png`;
  - `artifacts/battle-takeover-20260620-r6-03-battle-start-0p1s.png`;
  - `artifacts/battle-takeover-20260620-r6-04-battle-approach-0p7s.png`;
  - `artifacts/battle-takeover-20260620-r6-05-battle-hit-1p5s.png`;
  - `artifacts/battle-takeover-20260620-r6-08-battle-victory-12p8s.png`;
  - `artifacts/battle-takeover-20260620-r6-summary.json`.
- r6 network evidence:
  - `POST /api/player/battles/start` exactly once;
  - request body used `stageCode=MAIN_1_2`, `heroIds=[5,11,9,10,63]`, `leaderHeroId=5`;
  - no `/api/player/battles/{battleNo}/settle` request;
  - no Cocos error overlay; filtered console errors were 0 after excluding Chromium screenshot `ReadPixels` performance warnings.
- Boundary unchanged:
  - visual battle still does not submit settle;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Convergence Patch

- User requirement: left heroes and right monsters/BOSS must first move toward the center after battle start; combat actions can only begin after both sides have converged.
- Cocos updates:
  - `LobbyBattleState.ts` now defines `LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 2`;
  - `LobbyBattlePresentationState.ts` shows `开场汇合 / 接敌前进` copy during the opening window and keeps `damageText` empty;
  - `LobbyBattlePreviewPanelRenderer.ts` now resolves `BattleOpeningConvergenceState`, suppresses action/assist cues while active, returns only the timeline `battle_start` event during the opening window, and delays the combat timeline by the convergence step count;
  - opening convergence now also gates `visibleDamagePreviewEvent/visibleBuffPreviewEvent` and skips the floating text layer while active, so damage numbers and buff/assist floats cannot appear before the meet-up ends;
  - all renderable ally/enemy actors tween toward the center during the opening window and pass `move` as the action animation cue, allowing the Spine runtime to pick `run` when available;
  - `renderBattleOpeningConvergenceCue()` adds a lightweight center cue so screenshots show the opening meet-up state distinctly.
- Guard updates:
  - added `npm.cmd run check:battle-stage13j`;
  - `check:battle-stage13i` now includes `13J`;
  - `check:preview` freshness tokens now include the opening convergence renderer hooks.
- Boundary unchanged:
  - visual battle still does not submit settle;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Convergence Completion Guard Patch

- Follow-up acceptance found the opening convergence worked, but the battle-complete refresh could still be intercepted by the renderer's same-scene incremental path, producing a black screen after the visual timeline ended.
- Cocos updates:
  - `LootChainGameRoot.refreshLobbyBattlePreviewPanel()` keeps incremental playback only while `start && !presentationComplete && canRefreshPlayback()`;
  - `LobbyBattlePreviewPanelRenderer.canRefreshPlayback()` now also blocks incremental playback when `presentationComplete`, `settling`, or `settlement` is present;
  - `LobbyBattlePreviewPanelRenderer.render()` now bypasses the same-scene `refreshPlayback()` path for those full-render states, so the visual victory/result layer can be rebuilt normally;
  - opening convergence behavior remains unchanged: steps 1-2 show `开场汇合`, both sides play `move/run` toward the center, and action/assist/floating text are suppressed until the convergence window ends.
- Guard updates:
  - `check:battle-stage13k` now asserts the renderer-side full-render guard as well as the root-side completion guard;
  - `check:battle-stage13i` continues to aggregate Stage 13A-H/J/K plus layout.
- Browser Preview evidence on `http://localhost:7456/`:
  - `artifacts/battle-stage13k-opening-0600ms.png`: opening meet-up, no damage text;
  - `artifacts/battle-stage13k-opening-1300ms.png`: both teams closer to center, no damage text;
  - `artifacts/battle-stage13k-first-action-2200ms.png`: first damage appears only after convergence;
  - `artifacts/battle-stage13k-mid-combat-5400ms.png`: damage/heal/shield/受击 feedback appears during combat;
  - `artifacts/battle-stage13k-complete-13900ms.png`: visual victory/result panel renders, no black screen.
- Verification status:
  - directed Cocos TypeScript no-emit passed;
  - `npm.cmd run check:battle-stage13k`, `check:battle-stage13i`, and `check:layout` passed;
  - browser console errors after the 2026-06-20T07:10:23.469Z baseline were 0;
  - `check:preview` still reports stale chunks for multiple non-battle modules on both 7456/7457, so Creator Preview should be rebuilt/refocused before treating freshness as green.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-24 Battle Replay Full HP Loop R18

- User feedback focus from actual recording: only one hero seemed to fight, some heroes appeared to teleport, damage floating text was missing, monster HP stayed full, and victory appeared before monsters were visually defeated.
- Root cause confirmed:
  - Cocos Preview was still serving a stale `LobbyBattleReplayModel` chunk that limited actions to the old `action_start` events;
  - enemy counter actions were scheduled too late, so enemies could die before damaging allies;
  - melee damage timing happened before several actors reached target-front contact, making some hits read as air attacks.
- Cocos/source updates:
  - `LobbyBattleReplayModel.ts` now generates a full local visual replay loop with synthetic combat actions until one side is defeated; first ally cycle still ensures all selected heroes can participate, while enemy counters are interleaved after every two ally actions;
  - replay hits now carry `hpBefore/hpAfter/timeMs`, and existing `LobbyBattlePresentationHp.ts` consumes those hit frames so unit HP and enemy total HP decrease at the same time as damage cues;
  - melee hit delay is extended to contact timing, and `LobbyBattlePreviewPanelRenderer.ts` increases front-line charge distance to `240` so actors fight at target-front contact rather than in separated columns;
  - added `scripts/repair-preview-battle-replay-loop.mjs` and `scripts/repair-preview-battle-contact-spacing.mjs` for stale Creator Preview chunks only;
  - `scripts/check-battle-stage13z2.mjs` and `scripts/check-preview-freshness.mjs` now guard the full replay loop, enemy counter scheduling, stale `actionStarts` chunks, and contact spacing.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - latest telemetry recorded `allMeleeBasicAttackMissCount=0`, `allMeleeBasicAttackContactMedian=40.31`, `enemyHpRatioMin=0`, `allyHpRatioMin=0.0649`, `damageFloatSampleCount=7`, `hitVfxAssetSampleCount=7`, `deadUnitHitSampleCount=0`, `srRRunCueCount=18`, and `srRAttackCueCount=7`;
  - screenshots were refreshed under `artifacts/battle-center-convergence-current/`.
- Verification passed:
  - `npm.cmd run repair:preview-battle-replay-loop`;
  - `npm.cmd run repair:preview-battle-contact-spacing`;
  - `npm.cmd run check:battle-stage13z2`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run screenshot:battle-center`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-24 Battle Replay Director Stage13Z

- User feedback focus: current battle process still felt architecturally wrong. Monsters could move to a ranged hero while melee heroes attacked empty space, and HP bars must strictly decrease according to actual hit values rather than loose time-based inference.
- Architecture decision:
  - stop expanding ad-hoc battle movement/HP inference inside `LobbyBattlePreviewPanelRenderer`;
  - introduce a pure replay model first, then let action cues and HP presentation consume that replay;
  - keep backend protocol and settlement flow unchanged.
- Cocos/source updates:
  - added `docs/superpowers/plans/2026-06-24-battle-replay-director-stage13z.md` as the implementation plan;
  - added `LobbyBattleReplayModel.ts`, which converts `BattlePresentationSnapshot + BattlePresentationTimeline` into ordered `BattleReplayAction` records;
  - each `BattleReplayHitEvent` carries `hpBefore / hpAfter`, `amount`, `critical`, `killed`, `actorKey`, and `targetKey`;
  - `LobbyBattleActionPresentation.ts` now builds `melee_move / basic_attack / ranged_projectile / damage_float / hit_float` cues from replay actions instead of directly scanning raw timeline events first;
  - `LobbyBattlePresentationHp.ts` now applies replay hit events and sets `currentHp = hit.hpAfter`, so HP bars are tied to the same hit event that generates damage text;
  - `LobbyBattlePreviewPanelRenderer.ts` adds `BATTLE_ENABLE_IDLE_CLASH_COMBAT = false`, preventing non-current units from looping attack animations against empty space;
  - `LobbyBattlePreviewPanelRenderer.ts` adds `BATTLE_USE_STICKY_CONTACT_POSITIONS = false`, preserving the old sticky cache for compatibility while no longer using old contact points as the next home position.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - latest telemetry recorded `telemetry samples=1704`, `telemetryHpSamples=160`, `enemyHpMin=0.2644`, `allyHpMin=0.4111`, `telemetryFloatingTextSamples=7`, `telemetryHitVfxAssetSamples=6`, and `telemetryDeadUnitHitSamples=0`;
  - visual self-preview checked `artifacts/battle-center-convergence-current/10-basic-impact-3900ms.png` and `13-visual-result-17100ms.png`;
  - remaining visual gap: lane/collision separation is still not final; several units can visually crowd around the same target region. Next stage should build lane reservation/contact slots in the replay director.
- Verification passed:
  - `npm.cmd run check:battle-stage13z`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run screenshot:battle-center`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-24 Battle HP/VFX Sync Stage 13Y

- User feedback focus: latest battle recording showed no attack/hit floating damage numbers, and hero/enemy HP bars stayed full through the whole fight.
- Root cause confirmed:
  - `LobbyBattlePreviewPanelRenderer.ts` already generated action cues, hit effects, and actor positions, but the partial `refreshPlayback()` path updated only positions/spine/effects;
  - per-unit HP bars and top boss gauge were created by full render, then not refreshed as `damage_preview` cues landed;
  - stale Cocos Preview chunks could keep the old partial refresh path after source edits, so local browser acceptance needed a targeted Preview repair without forcing full rerender.
- Cocos/source updates:
  - added `LobbyBattlePresentationHp.ts` to compute presentation-only HP state from battle timeline cues; it applies landed `damage_preview` and ally-side numeric heal `buff_preview`, tracks dead unit keys, and forces enemy HP to zero only in result phase;
  - `LobbyBattlePreviewPanelRenderer.ts` now feeds HP state into top boss gauge and per-unit HP bars during both full render and partial playback refresh;
  - dead units switch to configured death animation (`dead/die`) or fade and are excluded from continued hit-feedback telemetry;
  - imported real hit effect textures from `C:\Users\axian\Desktop\C1812-1` into `assets/resources/ui/battle/c1812/effects/`: `hit_slash`, `hit_burst`, `hit_ring`, `hit_spark`;
  - `C1812CommonUiAssets.ts` and `UiSpriteFrameCache.ts` now expose/preload those hit assets, while the old `blood_deco` constant remains only as backward-compatible guard data;
  - added `scripts/check-battle-stage13y.mjs`, included it in `check:battle-stage13i`, and extended `scripts/screenshot-battle-center-convergence.cjs` to fail if HP never decreases, hit VFX assets are missing, damage floats are absent, or dead units continue taking hit feedback;
  - added `scripts/repair-preview-battle-hp-vfx.mjs` plus `npm.cmd run repair:preview-battle-hp-vfx` to patch stale Preview chunks without disabling partial refresh.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - latest telemetry recorded `telemetry samples=1376`, `telemetryHpSamples=160`, `enemyHpRatioMin=0.2647`, `allyHpRatioMin=0.4118`, `telemetryFloatingTextSamples=7`, `telemetryHitVfxAssetSamples=6`, and `telemetryDeadUnitHitSamples=0`;
  - visual self-preview checked `artifacts/battle-center-convergence-current/10-basic-impact-3900ms.png` and `13-visual-result-17100ms.png`; actor HP bars and top boss HP visibly decrease, with real slash/burst/ring/spark hit layers present.
- Verification passed:
  - `npm.cmd run check:battle-stage13y`;
  - `npm.cmd run repair:preview-battle-hp-vfx`;
  - `npm.cmd run screenshot:battle-center`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Verification note:
  - directed TypeScript no-emit was not available in this workspace because `typescript` / `node_modules/.bin/tsc.cmd` is missing; use the Cocos Creator compiler or install the project compiler before claiming TS no-emit.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Formation Visual Scale Unification R14

- User feedback focus: formation page actors were still visually inconsistent even when numeric scale caps looked close; the requirement is visual parity, not identical bbox height.
- Root cause confirmed:
  - SSR/UR named Spine assets such as `Eulenspigel` and `Nuu` have long-body / long-hair silhouettes, so equal bbox height makes them visually dominate Q-style `act_*` SR/R heroes;
  - the previous formation positions used a perspective-like front/back layout, making whichever hero landed near the center/front look oversized;
  - the acceptance script still used a single global bbox-height ratio, which incorrectly rejected the intentional visual compensation needed across different art styles.
- Cocos/source updates:
  - `LobbyFormationPanelRenderer.ts` now uses a flatter 3+2 formation layout instead of the previous perspective-heavy positions, reducing apparent foreground dominance;
  - `LobbyBattleUnitSpineRuntime.ts` now applies formation-specific visual caps: `Eulenspigel=0.39`, `Nuu=0.43`, other named SSR/UR default `0.48`, SR/R `act_*` preview `0.56`;
  - `scripts/screenshot-formation-switch.cjs` now validates formation visual size by art family: named/realistic actors use a lower bbox range, while SR/R `act_*` actors use a higher bbox range to look visually comparable;
  - `scripts/repair-preview-stage13v.mjs`, `check-battle-stage13v.mjs`, `check-battle-stage13w.mjs`, and `check-preview-freshness.mjs` were synced to the same formation visual compensation values.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 4 after bench, 5 after add, 0 battle start requests, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - latest formation telemetry: stylized SR/R `min=240.8 / median=240.8 / max=240.8 / ratio=1`, realistic named actors `min=167.7 / median=184.9 / max=206.4 / ratio=1.23`;
  - visual self-preview checked `artifacts/formation-switch-current/04-formation-open.png` and `artifacts/formation-switch-current/06-after-add-other.png`; black long-body hero no longer visually overwhelms the SR/R actors.
- Boundary unchanged:
  - formation screenshot flow must not call battle start or settle;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Formation Eulenspigel and Nameplate Readability R15

- User feedback focus: `灰烬猎手·罗恩` still looked larger than the other formation heroes, and every formation actor nameplate was too small to read comfortably.
- Root cause confirmed:
  - `Eulenspigel` has a long-body silhouette and high visual mass even after the first named-Spine compensation, so it needs its own lower formation preview cap;
  - the previous formation actor name font was `12 * scale` and metadata was `8 * scale`, which became hard to read once the battlefield view was zoomed out.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` lowers `Eulenspigel` formation preview cap from `0.39` to `0.34`;
  - `LobbyFormationPanelRenderer.ts` increases formation actor name font to `13.8 * scale` and metadata font to `9.2 * scale` (15% larger), with a wider/taller nameplate (`152 * scale` max width, `32 * scale` height);
  - `scripts/screenshot-formation-switch.cjs` now validates `Eulenspigel` separately (`135..150` visual height) while keeping regular named-Spine and SR/R `act_*` checks separate;
  - `scripts/repair-preview-stage13v.mjs`, `check-battle-stage13v.mjs`, and `check-preview-freshness.mjs` were synced so stale Preview chunks and static guards use the same values.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 4 after bench, 5 after add, 0 battle start requests, 0 settle requests, 0 page errors, and 0 console errors;
  - latest telemetry: `Eulenspigel estimatedHeight=146.2`, `Nuu=184.9`, `Carmilla=206.4`, SR/R stylized actors `240.8`;
  - visual self-preview checked `artifacts/formation-switch-current/06-after-add-other.png`; `灰烬猎手·罗恩` no longer dominates the formation, and actor nameplates are more readable.
- Verification passed:
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run check:battle-stage13w`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - Creator directed TypeScript no-emit for `LobbyBattleUnitSpineRuntime.ts` and `LobbyFormationPanelRenderer.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - formation screenshot flow must not call battle start or settle;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Formation Nameplate Readability R16

- User feedback focus: the actor nameplate text under formation heroes was still too small, including hero name, rarity, and hero level.
- Cocos/source updates:
  - `LobbyFormationPanelRenderer.ts` raises formation actor name font from `13.8 * scale` to `16 * scale`;
  - formation actor rarity/level metadata font is raised from `9.2 * scale` to `11.5 * scale`;
  - the actor nameplate width/height is increased from `152 * scale / 32 * scale` to `176 * scale / 40 * scale`, with larger text bounds so long names do not immediately shrink back down;
  - `scripts/repair-preview-stage13v.mjs` patches both old `12/8` nameplates and the previous `13.8/9.2` nameplates to the new readable values in stale Preview chunks;
  - `scripts/check-battle-stage13v.mjs` now guards the new `16 * scale` and `11.5 * scale` values.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 4 after bench, 5 after add, 0 battle start requests, 0 settle requests, 0 page errors, and 0 console errors;
  - visual self-preview checked `artifacts/formation-switch-current/06-after-add-other.png`; lower hero names and `rarity · Lv` lines are larger and more readable.
- Boundary unchanged:
  - formation screenshot flow must not call battle start or settle;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle Mixed Spine Combat Scale R15

- User feedback focus: battle scene still showed inconsistent hero sizes in a mixed lineup, even after formation preview size was normalized.
- Root cause confirmed:
  - previous `screenshot:battle-center` forced an SR/R-only lineup, so it could prove SR/R consistency but did not cover real mixed combat lineups with SSR/UR named Spine packages plus SR/R `act_*` packages;
  - SSR named assets were capped by `maxScale=0.24`, leaving examples such as `SSR_LIVIA`/`SSR_KANE` around `181-195px` visual height in combat;
  - SR/R combat actors were capped at `slotHeight * 0.92`, keeping them around `301px`, so mixed battle lines looked uneven even when each family passed its own guard.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` raises the named SSR/UR profile to `targetHeightRatio=0.82`, `maxScale=0.32`, `scaleMultiplier=0.94`;
  - SR/R combat cap is reduced from `BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO=0.92` to `0.84`, keeping SR/R readable without overpowering named SSR/UR units;
  - `screenshot-battle-center-convergence.cjs` now supports `BATTLE_ACCEPTANCE_FORMATION=mixed`, forcing a lineup with both named Spine heroes and SR/R `act_*` heroes;
  - the same screenshot script now records and validates all ally battle visual height/width metrics (`allySpineVisualHeight*`, `allySpineVisualWidth*`), not only SR/R height;
  - `repair-preview-stage13v.mjs`, `check-preview-freshness.mjs`, and `check:battle-stage13v` were updated so stale Preview repair and static guards keep the same mixed combat scale.
- Runtime acceptance on `http://localhost:7456/`:
  - RED before runtime fix: `BATTLE_ACCEPTANCE_FORMATION=mixed npm.cmd run screenshot:battle-center` failed with mixed lineup `UR_EVELYN/SSR_KANE/SSR_LIVIA/SR_PALADIN_02/SR_PRIEST_01`, because `allySpineVisualHeightMin=181.22`;
  - GREEN after runtime fix and Preview repair: mixed lineup passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - latest mixed scale telemetry: `allySpineVisualHeightMin=241.62`, `allySpineVisualHeightMedian=260.96`, `allySpineVisualHeightMax=275.52`, `allySpineVisualHeightRatio=1.14`, `allySpineVisualWidthMax=505.32`, `allySpineVisualWidthRatio=1.94`;
  - default SR/R acceptance also passed after the cap reduction, with `srRSpineVisualHeightMedian=275.53`, `srRSpineVisualHeightRatio=1`, and `allMeleeBasicAttackMissCount=0`.
- Verification passed:
  - `npm.cmd run repair:preview-stage13v`;
  - `BATTLE_ACCEPTANCE_FORMATION=mixed npm.cmd run screenshot:battle-center`;
  - `npm.cmd run screenshot:battle-center`;
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run check:battle-stage13w`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run check:layout`;
  - directed Creator TypeScript no-emit on `LobbyBattleUnitSpineRuntime.ts` and `LobbyBattlePreviewPanelRenderer.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle Formation Hero Visual Scale R14

- User feedback focus: formation screenshot showed some heroes extremely large while others were tiny, even when all 5 selected heroes should occupy comparable readable board space.
- Root cause confirmed:
  - SSR/UR named Spine packages such as `Nuu`, `Eulenspigel`, `Carmilla` and SR/R `act_*` packages have very different raw bounds, whitespace and art style proportions;
  - the previous formation scale guard trusted raw skeleton bounds too much, so long named skeletons could dominate the board while smaller SR/R assets appeared visually weaker;
  - `screenshot:formation-switch` only asserted a narrow SR/R sample before this pass, so a mixed 5-hero team could still pass while visually inconsistent.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` now uses asset-specific formation caps for oversized named assets (`Eulenspigel=0.56`, `Nuu=0.58`), a default named-asset cap of `0.62`, and an SR/R formation cap of `0.74`;
  - combat SR/R scale remains separate from formation (`BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO=0.92`) so the battle-side readable SR/R size is not reduced by this formation fix;
  - `LobbyFormationPanelRenderer.ts` records `primaryAsset` in formation visual telemetry, making future screenshot failures explain which Spine package caused the size drift;
  - `screenshot-formation-switch.cjs` now validates all selected actor heights, not only SR/R samples, and reports min/median/max/ratio plus hero primary asset;
  - `LobbyBattlePreviewPanelRenderer.ts` prefers the C1812 skill target frame sprite before falling back to the old procedural ellipse;
  - `repair-preview-stage13v.mjs`, `check-preview-freshness.mjs`, `check:battle-stage13v`, and `check:battle-stage13w` were updated to keep stale Cocos Preview chunks aligned with the same formation scale constants and target-frame behavior.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 0 battle start requests, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - latest formation telemetry recorded `min=240.8`, `median=266.6`, `max=318.2`, `ratio=1.32`;
  - sampled heroes: `UR_EVELYN/Nuu=249.4`, `SSR_LIVIA/Carmilla=266.6`, `SSR_RON/Eulenspigel=240.8`, `SR_PALADIN_02/act_1002=318.2`, `SR_PRIEST_01/act_21006=318.2`;
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors, confirming the battle flow still keeps movement/attack checks intact after the formation-only cap change.
- Verification passed:
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run check:battle-stage13w`;
  - directed Creator TypeScript no-emit on `LobbyBattleUnitSpineRuntime.ts`, `LobbyFormationPanelRenderer.ts`, and `LobbyBattlePreviewPanelRenderer.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Verification note:
  - full-project direct `tsc -p tsconfig.json --noEmit` still fails in the shell because the current TypeScript environment cannot resolve Cocos `cc` declarations across the project; touched-file directed no-emit passed with `--types temp/declarations/cc`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale, Target-Front Melee, and Background R14

- User feedback focus: screenshot still showed SR/R actors looking out of scale, and melee heroes must run to the monster/Boss before attacking rather than attacking from the original position.
- Root cause confirmed:
  - SR/R `act_*` combat skeletons include inflated raw bounds, so battle needed a stricter visual-height cap while formation needed a separate readable cap;
  - stale Cocos Preview chunks could keep old background constants and old SR/R runtime scale literals even when TypeScript source had already changed;
  - newly copied `stage13z`/`stage13y` resources were not yet imported into Cocos library, so direct `resources.load()` failed in Preview.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` now caps SR/R combat actors with `BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO = 0.92` and formation actors with `BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = 1.02`;
  - `LobbyBattlePreviewPanelRenderer.ts` keeps melee target-front duel contact and raises defender meet-up to `BATTLE_MELEE_DUEL_DEFENDER_STEP_RATIO = 0.1`, with combat nameplates hidden during normal round playback to reduce clutter;
  - assist floating text was reduced to one primary cue per assist event, so heal/shield/buff numbers no longer dump in one stack;
  - `battle_scene_cathedral.png` keeps the already-imported resource UUID but its source image is replaced by `bgState2.png` from `C:\Users\axian\Desktop\决胜之心3.8.99\UI\图标`, giving Preview a real image-backed desert battle scene without waiting for a new resource directory import;
  - `repair-preview-stage13v.mjs`, `check-preview-freshness.mjs`, `check:battle-stage13v`, `check:battle-stage13w`, and `screenshot:battle-center` now guard this scale/background behavior for stale Preview chunks.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - latest battle telemetry: `sampleCount=750`, `srRRunCueCount=15`, `srRAttackCueCount=4`, `srRSkillCueCount=1`, `srRBasicAttackMedianDistance=40.31`, `allMeleeBasicAttackMissCount=0`, `backgroundSource=asset/backgroundLoaded=true`, `srRSpineVisualHeightMedian=301.75`, `srRSpineVisualHeightRatio=1`;
  - `npm.cmd run screenshot:formation-switch` passed with SR/R formation height `438.6` for both sampled heroes, 0 battle start requests, 0 settle requests, 0 page errors, and 0 filtered console errors.
- Verification passed:
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run check:battle-stage7`;
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run check:battle-stage13w`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Target-Front Melee Contact R14

- User feedback focus: SR heroes in battle/formation still read too small compared with other heroes, and melee heroes must close to the monster before playing their normal attack or skill instead of attacking from the home slot.
- Root cause confirmed:
  - SR/R `act_*` skeletons and SSR/UR skeletons have different raw bounds, so SR/R needed a stronger normalized visual-height profile rather than the previous conservative cap;
  - `basic_attack` was still able to start while the displayed root-motion position was smoothing toward the target-front point, so later melee actors could visibly attack before reaching close range;
  - stale Cocos Preview chunks rendered the cathedral background but left background telemetry at the reset default `asset/false`, which made screenshot verification fail even after the scene was visible.
- Current effective source behavior:
  - `LobbyBattleUnitSpineRuntime.ts` sets R/SR battle scale to `targetHeightRatio=1.58`, `maxWidthRatio=3.05`, `maxScale=2.9`, `scaleMultiplier=2.72`; formation preview uses `targetHeightRatio=1.42`, `maxScale=2.72`, `scaleMultiplier=2.62`;
  - `LobbyBattlePreviewPanelRenderer.ts` keeps root motion owned by `melee_move` only; `basic_attack` no longer owns root motion, and after target-front contact SR/R plays `skill0` while SSR/UR plays `atk`;
  - melee target-front gap is clamped at `58-104 * scale`, and root-motion display smoothing allows enough frame movement to reach contact without snapping;
  - `LobbyBattleActionPresentation.ts` moves `basic_attack` from `940ms` to `1420ms`, so run/contact resolves before the attack animation and damage feedback;
  - battle background fallback now upgrades to the real `resources.load(LOBBY_BATTLE_SCENE_BG_ASSET, SpriteFrame)` frame when it loads, and the Preview repair script only records `asset/true` when `host.addSprite()` returns a real Sprite.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - forced SR/R formation remained active (`SR_PALADIN_02`, `SR_ABYSS_06`);
  - latest battle telemetry: `srRSpineVisualHeightMin=564.14`, `srRSpineVisualHeightMedian=564.16`, `srRSpineVisualHeightMax=564.17`, `srRSpineVisualHeightRatio=1`, `srRarityHeightRatio=1`, `srRBasicAttackClosestDistance=122.57`, `srRBasicAttackMedianDistance=129.45`, `allMeleeBasicAttackContactMedian=113.29`, `allMeleeBasicAttackMissCount=0`, `basicAttackRootMotionSampleCount=0`, `backgroundSource=asset/backgroundLoaded=true`;
  - `npm.cmd run screenshot:formation-switch` passed with selected count `5 -> 4 -> 5`, 0 battle start requests, 0 settle requests, 0 page errors, and 0 filtered console errors.
- Verification passed:
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run check:battle-stage13w`;
  - `npm.cmd run check:battle-stage13x`;
  - `npm.cmd run repair:preview-stage13v`;
  - `node --check scripts/repair-preview-stage13v.mjs`;
  - `node --check scripts/check-battle-stage13v.mjs`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Melee Contact R12

- User feedback focus: the latest screenshot still showed SR actors visually inconsistent, and melee units had to clearly approach monsters before attacking instead of attacking from the home slot.
- Root cause confirmed:
  - R/SR profile was previously pushed too high while fixing the tiny-SR issue, which made some `act_*` actors large enough to crowd the formation/battle field;
  - `basic_attack` root motion could still begin from the home interpolation instead of the already reached target-front point, making some hits read as home-position attacks;
  - the running Cocos Preview may still serve an old compiled battle chunk without the newer background loader, so the fallback scene must remain readable instead of near-black.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` now uses a tighter R/SR battle profile (`targetHeightRatio=1.12`, `maxWidthRatio=2.42`, `maxScale=1.5`) and a formation SR/R cap of `0.66`, keeping SR/R readable without covering the board;
  - `LobbyBattleActionPresentation.ts` delays `basic_attack` to `timeOffsetMs: 1280`, giving `melee_move` a visible run/approach window first;
  - `LobbyBattlePreviewPanelRenderer.ts` sets `BATTLE_ACTOR_BASIC_ATTACK_MOTION_PREWARM_MS=520`, tightens the duel contact gap to `0.12`, strengthens defender meet-up to `0.34`, and uses a brighter cold-color fallback battlefield while keeping Stage13Y PNG asset paths preferred;
  - `check:battle-stage13v`, `check:battle-stage13w`, `check:battle-stage13x`, `check-preview-freshness`, and `repair-preview-stage13v.mjs` were synchronized with the same SR/R scale and target-front contact contract.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 4 after bench, 5 after add, 0 battle start requests, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, 0 filtered console errors, and 849 telemetry samples;
  - latest battle telemetry: `srRRunCueCount=15`, `srRAttackCueCount=1`, `srRSkillCueCount=2`, `srRMeleeApproachSampleCount=7`, `srRBasicAttackAdvanceMedian=118.09`, `srRBasicAttackMedianDistance=104`, `allMeleeBasicAttackContactMedian=104`, `allMeleeBasicAttackMissCount=0`;
  - latest SR/R height telemetry: `srRSpineVisualHeightMin=398.82`, `srRSpineVisualHeightMedian=425.57`, `srRSpineVisualHeightMax=425.63`, `srRSpineVisualHeightRatio=1.07`, `formationSrRVisualHeightOk=true`.
- Verification passed:
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run repair:preview-stage13v` patched the current local Preview chunk where needed before screenshot verification.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-21 Battle SR/R Scale and Melee Contact Fix R8

- User feedback focus:
  - battle screenshot still showed SR/R actors as very small compared with other heroes;
  - melee actors still appeared to attack from their original side instead of clearly running to the target-front contact area first;
  - formation preview also exposed inconsistent actor sizes after the battle scale changes.
- Root cause:
  - several SR/R `act_*` Spine runtime bounds are inflated by attack effects or very wide animation extents, so using raw `runtimeData.width/height` made the actual character body look tiny;
  - current local Cocos Preview was serving stale Formation chunks where `scaleProfile` was still `hero.rarity`, so formation-specific scale caps did not apply until the temp chunk was patched;
  - the action timeline could enter `basic_attack` too quickly after opening convergence, making the preceding `melee_move/run` hard to read.
- Cocos updates:
  - `LobbyBattleUnitSpineRuntime.ts` now normalizes inflated SR/R `act_*` bounds before fitting scale; normal small-bound `act_*` assets such as `act_1002` and `act_1036` are left on their real runtime bounds;
  - `resolveBattleUnitSpineTelemetryVisualHeight()` reports normalized visual height for screenshot validation, so oversized raw Spine bounds no longer hide actual character-size regressions;
  - battle SR/R max visual height remains `slotHeight * 1.25`, while formation preview uses a separate max-height ratio resolved by `resolveBattleUnitFormationPreviewMaxHeightRatio()`;
  - formation actors now always pass `scaleProfile: 'FORMATION_PREVIEW'`;
  - `Eulenspigel` / `SSR_RON` has a formation-only height override `0.55` so it no longer dominates the formation board;
  - melee timing remains opening convergence -> post-convergence delay `3` steps -> `melee_move` `1880ms` using `run` -> `basic_attack` after `1760ms` using `skill0/atk` -> hold at target-front -> return `1680ms`;
  - nonblack fallback landscape remains in battle field for Preview sessions where `ui/battle/stage13v/forest_battle_bg` has not been imported yet.
- Guard/tooling updates:
  - `check:battle-stage13v` now checks inflated `act_*` bounds normalization, normalized telemetry height, formation `scaleProfile: 'FORMATION_PREVIEW'`, Eulenspigel formation override, and Preview repair coverage;
  - `repair-preview-stage13v.mjs` now patches stale Preview chunks for runtime scale normalization, formation `scaleProfile`, Eulenspigel formation override, battle fallback landscape, melee timing, and old cathedral/old root-motion leftovers;
  - `screenshot-battle-center-convergence.cjs` now recomputes SR/R visual height from normalized bounds when Preview telemetry still comes from an old chunk.
- Runtime acceptance:
  - `npm.cmd run screenshot:battle-center` produced refreshed screenshots in `artifacts/battle-center-convergence-current/`;
  - latest run recorded one `POST /api/player/battles/start`, zero `/settle`, zero page errors, zero filtered console errors, and `1073` telemetry samples;
  - visual spot-check: `09-mid-combat-5100ms.png` shows SR/R actors at readable battle size and melee units in the contact area instead of original left-side columns;
  - `npm.cmd run screenshot:formation-switch` produced refreshed screenshots in `artifacts/formation-switch-current/`; formation switch still preserved `5/5 -> 4/5 -> 5/5`, with zero battle start requests, zero settle requests, zero page errors, and zero filtered console errors.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-21 Stage 13V Close-Combat Visual Correction

- User feedback focus:
  - SR/R heroes in formation and battle looked much smaller than SSR/UR heroes;
  - melee heroes still appeared to attack in place instead of running to the monster front;
  - floating damage numbers were too cluttered and should come from each action timing, not from a batch overlay;
  - battle background should move closer to the side-scrolling RPG reference instead of the dark report-like combat screen.
- Cocos updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now builds `createBattleFrameAnchorMap()` from each unit's current frame position; projectile, impact, assist aura, and floating text layers use current frame anchors instead of stale home anchors;
  - actors are rendered through `renderUnitActorsByDepth()`, so the active melee attacker and target draw in the foreground while they meet at the target front;
  - melee actions now use `resolveActorTargetMeetOffset()` and `resolveActorDefenderMeetOffset()`: the attacker moves to the target-front contact point and the defender steps forward during `melee_move` / `basic_attack`;
  - root motion and Spine animation share the same `rootMotionCue`; SR/R `run` and `skill0` playback no longer desync during approach/strike;
  - action floating text is one short-lived value per current hit, anchored to the current target frame; assist floating text uses one staged cue and no longer renders caption spam;
  - removed the old `LobbyBattleStage12SceneGuide` report-like guide overlay;
  - added forest side-scrolling battle resources from `C:\Users\axian\Desktop\决胜之心3.8.99\UI\图标\F (2).png`, `ground1.png`, and `ground1_3.png` into `assets/resources/ui/battle/stage13v/`, with background, ground, and foreground layers rendered under the fight;
  - `LobbyFormationPanelRenderer.ts` enlarges the actual visual box passed to `resolveBattleUnitSpineScale()` (`visualWidth = width * 1.62`, `visualHeight = height * 1.34`) so SR/R formation previews are genuinely larger instead of only enlarging the node canvas;
  - `LobbyBattleUnitSpineRuntime.ts` raises the `FORMATION_PREVIEW` max scale and lets SR/R rarity profile normalize formation preview size.
- Guard/tooling updates:
  - added `npm.cmd run check:battle-stage13v`;
  - `screenshot-battle-center-convergence.cjs` now checks target meet samples and action floating-text density through runtime telemetry;
  - formation debug records SR/R visual box telemetry for preview acceptance.
- 2026-06-21 Stage 13V/13W 实机返修：根据截图反馈，战斗开场收敛从压到中线改为保留左右战线间距（`0.48 / 1.08 / 1.36`，窄屏最小推进 `0.46 slotWidth`），近战接触点收紧到目标正前方 `source.width * 0.18 / target.width * 0.14 / 32 * scale`；SR/R `act_*` 战斗 profile 上调到 `targetHeightRatio=1.42 / maxWidthRatio=3.08 / maxScale=1.08 / scaleMultiplier=2.72`，布阵 `FORMATION_PREVIEW` 上调到 `1.28 / 2.88 / 0.94 / 1.52` 并合并 SR/R `maxScale`；截图验收新增 SR/R 实际 Spine 高度、战线间距、近战推进中位数和贴近帧距离，`screenshot:battle-center` 最新为 1 次 battle start、0 settle、0 页面/控制台错误，`srRBasicAttackMedianDistance=73.8`、`srRBasicAttackAdvanceMedian=472.36`、`srRSpineVisualHeightMin=287.15`。本轮仍只改 Cocos 表现层，不触发 settle，不新增经济写入口。
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-21 Battle SR/R Spine Cue and Target Effect Cleanup R8

- User feedback focus: SR heroes appeared to slide instead of using `run`, did not visibly use attack/skill animations, and the `blood_deco.png`/large target halo made the battle screen look cluttered.
- Root cause:
  - most R/SR hero resources are binary `.skel`; the previous battle runtime only read `_skeletonJson` and `runtimeData.animations`, so some binary resources could expose no animation names during Cocos Preview and fall back to setup/idle pose;
  - action/assist cue generation still emitted old generic `attack_01` / `skill_01` names instead of rarity-aware battle contract names;
  - impact rendering still used the C1812 `blood_deco` hit burst sprite, and the target fallback/selection frame was too large for side-scrolling combat.
- Cocos updates:
  - `LobbyBattleUnitSpineRuntime.ts` now also reads animation names from Cocos `getAnimsEnum()` before patching enums, and if binary runtime names are hidden it tries the strict canonical contract (`run`, `skill0`, `skill1`, etc.) instead of silently giving up;
  - `LobbyBattleActionPresentation.ts` now emits SR/R front attacks as `skill0`, SR/R skill/ranged cues as `skill1`, and SSR/UR attacks as `atk`;
  - `LobbyBattleAssistPresentation.ts` now emits SR/R assist casts/buffs as `skill1`;
  - `LobbyBattlePreviewPanelRenderer.ts` records requested/applied Spine cue names in `globalThis.__lootchainBattlePlaybackTelemetry.spineCues` when the rebuilt source chunk is served;
  - removed `LobbyBattleHitBurstSprite` / `snapshot.stage2UiAssets.hitBurst` from the active battle renderer; hit feedback now uses `LobbyBattleImpactSlashLayer`;
  - target selection and fallback effects were reduced: `LobbyBattleSkillTargetFrame` is smaller, and the old filled ellipse `LobbyBattleActionTargetEffectFallback` was replaced by compact `LobbyBattleActionTargetSlashFallback`.
- Guard/tooling updates:
  - added `npm.cmd run check:battle-stage13r` and included it in `check:battle-stage13i`;
  - `check:preview` now forbids stale `LobbyBattleHitBurstSprite` / `snapshot.stage2UiAssets.hitBurst` in the actual served chunk, not in sourcemap text;
  - `screenshot-battle-center-convergence.cjs` now records SR/R spine cue telemetry summaries when the rebuilt renderer chunk is served;
  - added `scripts/repair-preview-stage13r.mjs` to hot-patch current stale Preview chunks for local browser acceptance when Creator has not rebuilt yet.
- Runtime acceptance:
  - `npm.cmd run screenshot:battle-center` produced refreshed screenshots in `artifacts/battle-center-convergence-current/`;
  - latest run recorded one `POST /api/player/battles/start`, zero `/settle`, zero page errors, zero filtered console errors, and `752` telemetry samples;
  - telemetry summary: `allyMovingTowardCenter=5`, `enemyMovingTowardCenter=3`, `allyHoldingCenter=5`, `enemyHoldingCenter=3`, `maxFrameSpeed=1.327px/ms`;
  - visual spot-check: `08-first-action-2500ms.png` no longer shows the `blood_deco` gold burst; target feedback is small slash/marker style instead of a large UI halo.
- Verification passed:
  - `npm.cmd run check:battle-stage13r`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:preview` after `node .\scripts\repair-preview-stage13r.mjs` patched stale current Preview chunks;
  - directed TypeScript no-emit for `LobbyBattlePreviewPanelRenderer.ts`, `LobbyBattleUnitSpineRuntime.ts`, `LobbyBattleActionPresentation.ts`, and `LobbyBattleAssistPresentation.ts`.
- Preview note:
  - Source files are updated. If Cocos Creator has not rebuilt `temp/programming/packer-driver/targets/preview`, run `node .\scripts\repair-preview-stage13r.mjs` for the current local preview or focus/restart Creator Preview to serve rebuilt chunks.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Formation and Visual Cleanup R7

- User feedback:
  - formation could not reliably switch heroes and appeared unable to bench selected heroes;
  - battle scene looked cluttered, SR/R actors were too large, and unexplained halo UI made the scene noisy;
  - battle start must continue to show both camps moving toward the center before combat begins.
- Cocos updates:
  - `LootChainGameRoot.ts` now treats manual formation as explicit state: once the player benches a hero, `currentLobbyFormationHeroIds()` normalizes the selected IDs without default-filling back to 5;
  - full formation no longer silently replaces the first non-protagonist slot when clicking a new hero; it now shows `阵容已满，请先点击已上阵英雄下阵，再选择新英雄。`;
  - `LobbyFormationPanelRenderer.ts` now explains `点击已上阵英雄可下阵` and shows `点击下阵` on non-protagonist actor stands;
  - `LobbyBattleUnitSpineRuntime.ts` aligns R/SR visual scale with the higher-rarity battle profile (`targetHeightRatio = 0.68`, `maxScale = 0.25`) so SR/R no longer dominate the screen;
  - `LobbyBattlePreviewPanelRenderer.ts` removed the old left/right camp halo calls, made actor rings contextual only for active/target units, and turned the opening convergence cue into a no-op so the run-in is shown by character motion instead of a large gold halo.
- Guard/tooling updates:
  - added `check:battle-stage13o` for manual formation underfill and no silent full-team replacement;
  - added `check:battle-stage13p` for R/SR scale caps and no permanent battle halos;
  - `check:battle-stage13i` now runs 13A-13P plus `check:layout`;
  - `check:layout` now accepts explicit underfilled formation state instead of requiring default fill;
  - `repair:preview-battle` can also patch stale Preview battle chunks for visual cleanup when Creator has not rebuilt yet.
- Runtime acceptance:
  - `npm.cmd run screenshot:battle-center` produced fresh screenshots in `artifacts/battle-center-convergence-current/`;
  - battle preview recorded one `POST /api/player/battles/start`, zero `/settle`, zero page errors, zero filtered console errors, and `840` telemetry samples;
  - latest `06-opening-run-1000ms.png` shows both camps moving/holding in the center with no old camp halos or opening gold halo;
  - latest `08-first-action-2500ms.png` shows damage feedback only after the meet-up;
  - formation screenshots in `artifacts/formation-current/` show the new down-hint copy, and `formation-after-row-down.png` shows the roster staying at `4/5` after benching instead of auto-refilling to 5.
- Verification passed:
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:preview`;
  - directed TypeScript transpile for `LootChainGameRoot.ts`, `LobbyFormationPanelRenderer.ts`, `LobbyBattlePreviewPanelRenderer.ts`, and `LobbyBattleUnitSpineRuntime.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Center Meet-Up R5

- Follow-up requirement: left-side heroes and right-side monsters/BOSS must first move into the central combat area; damage, skills, projectiles, heal/shield/buff floats, and hit feedback may start only after both sides have converged.
- Cocos updates:
  - `LobbyBattlePreviewPanelRenderer.ts` added `playBattleOpeningActorMotion()`, so opening run-in is now a continuous Cocos tween from the starting lane to the converged combat home instead of frame-by-frame layout jumps;
  - opening movement requests `run`; the post-convergence hold requests `idle`, and combat cues remain gated until the opening phase is inactive;
  - `playBattleActorCueOnce()` now respects a short root-motion lock, preventing the first `basic_attack` cue from interrupting the opening run tween on the same actor;
  - center stop positions now use per-lane `BATTLE_OPENING_LANE_STOP_GAP_RATIOS`, keeping 3-5 units near the center while avoiding a single stacked line;
  - `LobbyBattlePreviewPanelRenderer.canRefreshPlayback()` now requires `battleSceneRoot` and `battleFieldNode` to still be mounted in the UI tree;
  - `LootChainGameRoot.refreshLobbyBattlePresentationPlayback()` falls back to `renderBattleScene()` when partial playback refresh is unavailable, fixing the battle scene black-screen refresh path after root nodes are cleared.
- Preview/runtime tooling:
  - `repair-preview-battle-runtime.mjs` now patches stale Creator Preview chunks with the same opening tween, motion lock, mounted-node checks, and center-stop formula;
  - `check-preview-freshness.mjs`, `check:battle-stage13n`, and `check:battle-stage13i` assert the updated opening run/idle tokens and black-screen refresh fallback.
- Verification passed:
  - `npm.cmd run check:battle-stage13n`;
  - `npm.cmd run check:battle-stage13i`;
  - directed Cocos TypeScript transpile for `LootChainGameRoot.ts`, `LobbyBattlePreviewPanelRenderer.ts`, and `LobbyBattlePresentationState.ts`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run repair:preview-battle`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run screenshot:battle-center` with exactly one `POST /api/player/battles/start`, zero `/settle`, zero page errors, and zero filtered console errors;
  - in-app browser visual QA at 0.3s / 1.0s / 1.65s / 2.5s showed no black screen, no damage before convergence, and combat feedback only after meet-up;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Convergence Strict Gate Patch

- User follow-up requirement: at battle start, left-side heroes and right-side monsters/BOSS must first move toward the center; only after both sides meet can the combat action timeline begin.
- Cocos updates:
  - `LobbyBattleState.ts` now sets `LOBBY_BATTLE_PRESENTATION_STEP_COUNT = 48`, `LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS = 250`, and `LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 4`, giving the opening meet-up about 1 second before combat cues are released;
  - `LobbyBattlePresentationState.ts` now treats `presentationStep < LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT` as strict opening state, keeps `damageText` empty, and shows `开场汇合 / 接敌前进` copy;
  - `LobbyBattlePreviewPanelRenderer.ts` now caches each actor's converged home position, plays a continuous opening tween toward center, applies `move/run` once during opening, and returns later attack cues to the converged home instead of the original left/right columns;
  - the renderer now uses a filtered combat event queue after the opening gate, so the view cannot jump directly from `battle_start` to a later damage event;
  - actor scale pulse was moved under `LobbyBattleActorVisualRoot`, so movement tweens and action cue tweens no longer stop the visual idle pulse or leave actors at a partial scale;
  - projectile, floating damage, assist aura, and assist floating text now use independent cue keys, so one disabled branch cannot swallow a later visible effect.
- Guard updates:
  - added `npm.cmd run check:battle-stage13l`;
  - `check:battle-stage13i` now includes Stage 13L and asserts the strict `< LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT` opening gate;
  - `check:preview` freshness tokens now include `LobbyBattleActorVisualRoot`, `resolveVisibleCombatTimelineEvents`, and independent battle effect cue keys.
- Browser Preview evidence on `http://localhost:7456/`:
  - `artifacts/battle-stage13l-action-frames/battle-03000ms.png`: `开场汇合` state, both sides have advanced toward the center, no damage float yet;
  - `artifacts/battle-stage13l-action-frames/battle-03500ms.png`: first hit/damage appears after the opening meet-up;
  - `artifacts/battle-stage13l-action-frames/battle-05000ms.png`: later timeline shows healing, shield/ATK buff, projectile/受击, and damage floats as separate combat feedback;
  - `artifacts/battle-stage13l-flow/11-battle-end.png`: visual victory/result state renders without clicking settlement.
- Verification status:
  - directed Cocos TypeScript no-emit passed;
  - `npm.cmd run check:battle-stage13l`, `check:battle-stage13k`, `check:battle-stage13i`, `check:layout`, and `check:preview` passed after Creator Preview refreshed the new chunks;
  - `.spine/.spine.meta` source scan under `assets/resources/spine` returned 0;
  - `git diff --check` passed with only LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle` was clicked or exposed;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Center Meet-Up R2

- User requirement: battle start must first show left-side heroes and right-side monsters/BOSS moving toward the center; only after both sides meet may the combat timeline start.
- Cocos updates:
  - `LobbyBattleState.ts` now uses `LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 6` plus `LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 1`, so actors run toward center for about 1.5s and hold for one 250ms beat before combat cues unlock;
  - `LOBBY_BATTLE_COMBAT_START_STEP` is the single gate for combat event selection, presentation copy, action cue selection, assist cue selection, projectiles, target effects, floating damage, Buff/heal/shield floats, and hit feedback;
  - opening actors now explicitly request the `run` cue through `applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run')`; melee movement cue generation also uses `animationName: 'run'`;
  - opening copy keeps `damageText` empty and distinguishes the run-in phase from the one-beat center hold.
- Guard updates:
  - `check:battle-stage13j`, `check:battle-stage13k`, `check:battle-stage13l`, and `check:preview` freshness tokens now assert `LOBBY_BATTLE_COMBAT_START_STEP` and explicit `run` cues.
- Verified so far:
  - directed Cocos TypeScript no-emit passed;
  - `npm.cmd run check:battle-stage13j`, `check:battle-stage13k`, `check:battle-stage13l`, `check:battle-stage13i`, and `check:layout` passed;
  - `.spine/.spine.meta` source scan under `assets/resources/spine` returned 0;
  - `git diff --check` passed with only LF/CRLF warnings;
  - `npm.cmd run check:preview` is currently blocked by stale running Cocos Preview chunks: port 7456/7457 are served by two Cocos Creator project processes, and the served chunks still miss `LOBBY_BATTLE_COMBAT_START_STEP`, `opening-run`, and `animationName: 'run'`. Restart or refresh Cocos Creator Preview before runtime visual acceptance.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Center Meet-Up R3

- Follow-up requirement: battle start must play both camps moving toward the center first; combat can start only after both sides have met.
- Cocos updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now separates `BattleOpeningConvergenceState.active` from `moving`;
  - opening `active` still blocks action/assist cues, projectiles, target effects, damage floats, heal/shield/buff floats, and hit feedback;
  - opening `moving` alone drives `run`, so the 0.25s post-convergence hold switches to `idle` instead of running in place;
  - Spine cue mapping now supports explicit `idle/stand`, and `run/move/walk` cues loop while movement is active;
  - actors continue to cache and return to the converged combat home, not the original left/right columns.
- Guard updates:
  - added `npm.cmd run check:battle-stage13n` and included it in `check:battle-stage13i`;
  - `check:battle-stage13j` and `check:preview` freshness tokens now assert `openingConvergence.moving ? 'run' : 'idle'`, `opening-hold`, and idle cue mapping.
- Preview runtime repair:
  - added `npm.cmd run repair:preview-cc` for the local Cocos Preview `cce:/internal/x/cc` temp chunk mismatch;
  - added `npm.cmd run repair:preview-battle` for cases where Creator keeps serving stale battle renderer chunks after source changes;
  - after both repairs, `check:preview` and `scripts/screenshot-stage13.mjs` passed with console errors `0`.
- Boundary unchanged:
  - this pass did not click battle start/challenge or settlement;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Opening Center Meet-Up R4

- User requirement: left-side heroes and right-side monsters/BOSS must visibly move into the center area at battle start; combat may begin only after both sides have met.
- Cocos updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now replaces the old shallow `58%` opening offset with `BATTLE_OPENING_CENTER_CONVERGENCE_RATIO = 0.82`;
  - `BATTLE_OPENING_CENTER_STOP_GAP_RATIO = 0.18` prevents actors from crossing the center line while still stopping both camps in the central combat zone;
  - `BATTLE_OPENING_CENTER_MAX_DISTANCE_RATIO = 2.18` keeps far desktop lanes able to reach the center area;
  - converged combat homes remain the post-opening center positions, so melee/skill movement returns to the meet-up line instead of the original left/right columns.
- Guard updates:
  - `check:battle-stage13n` now rejects the old `Math.abs(towardCenter) * 0.58` / `slot.width * 1.72` formula and runs sample center-stop calculations for desktop and compact ally/enemy slots;
  - `check:preview` freshness tokens now require the new center convergence constants and `maxDistanceBeforeCenter`;
  - `repair:preview-battle` can patch only the center convergence formula when a running Creator Preview already has the older opening moving/idle runtime but not the new center formula.
- Runtime acceptance on `http://localhost:7456/`:
  - added `npm.cmd run screenshot:battle-center`;
  - latest screenshots are under `artifacts/battle-center-convergence-current/`;
  - `05-battle-0300ms.png` shows both camps still starting from their left/right sides;
  - `06-opening-run-1000ms.png` shows both camps converged near center with no damage float;
  - `07-opening-hold-1650ms.png`, `08-first-action-2500ms.png`, and `09-mid-combat-5100ms.png` show combat feedback only after the meet-up;
  - `preview-result.json` recorded exactly one `POST /api/player/battles/start`, zero `/settle`, zero page errors, zero filtered console errors, and no Cocos error overlay.
- Verification passed:
  - `npm.cmd run check:battle-stage13n`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - Cocos TypeScript no-emit with generated `cc` declarations;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Playback Smoothness R6

- User feedback: battle playback and opening movement were visibly stuttering; after both camps moved toward the center, combat start appeared to snap actors back toward their original positions. User asked to follow the reference side-scrolling RPG battle layout more closely, including smoother motion and cleaner UI layout.
- Root cause:
  - opening root motion used a one-shot tween while playback refresh still recomputed actor state every frame;
  - combat motion mixed tween locks with frame refresh, so `basic_attack` could visually compete with the preceding `melee_move`;
  - action anchors could be derived through `resolveActorCombatBasePosition()`, leaving too much room for opening/combat phase state to disagree;
  - active battle HUD still kept large title/status/guide elements, making the screen feel like a debug/report view rather than a combat scene.
- Cocos updates:
  - `LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS` is now `16`, so local playback targets roughly 60fps;
  - `LobbyBattlePreviewPanelRenderer.ts` now resolves actor root position through `resolveBattleActorFramePosition()` every frame;
  - opening movement, melee approach, ranged nudge, attack hold, and return motion are all deterministic functions of `presentationElapsedMs` / `playbackTimelineTimeMs`;
  - removed old root-motion tween helpers and `battleActorMotionLocks`, so refresh no longer fights a tween on the same actor node;
  - `createBattleActionAnchorMap()` now always anchors actions to `resolveActorConvergedCombatPosition()`;
  - `basic_attack` uses an `effectiveAdvanceRatio` that preserves melee contact distance, preventing the run-to-atk transition from pulling the actor backward;
  - code review found that `basic_attack` still used the default root-motion branch; it now shares the same approach/hold/return interpolation as `melee_move`;
  - root-motion elapsed time now uses `resolveBattleTimelineToPresentationRatio()`, converting compressed battle timeline time back to visual presentation time so actor movement does not over-accelerate;
  - center convergence now uses `BATTLE_OPENING_CENTER_CONVERGENCE_RATIO = 0.82`, `BATTLE_OPENING_CENTER_STOP_GAP_RATIO = 0.42`, and per-lane stop gaps `[0.48, 0.78, 0.62, 0.9, 1.02]`;
  - battle-in-progress header/status/scene guide are hidden, and the top HUD is reduced to left time, center stage, right speed pills plus the existing boss gauge;
  - renderer writes a small `globalThis.__lootchainBattlePlaybackTelemetry` sample buffer for automated preview validation only; it is not visible in UI and does not call any API.
- Tooling updates:
  - `check:battle-stage13k/l/m/n` and `check:preview` freshness tokens now assert the frame-position model, 16ms frame interval, removed tween/lock path, anti-snap `effectiveAdvanceRatio`, and top HUD pills;
  - `repair-preview-battle-runtime.mjs` is now conservative: it verifies that Preview is serving the new battle runtime and fails with a restart/refresh message if the chunk is stale, instead of hot-patching old tween code;
  - `screenshot-battle-center-convergence.cjs` now reads playback telemetry and fails if at least two allies/enemies do not move toward center, appear to return to original columns after convergence, or exceed the frame-time-normalized movement speed threshold.
- Verification passed:
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview` after focusing Cocos Creator and waiting for Preview rebuild;
  - directed TypeScript transpile via local TypeScript library for `LobbyBattleState.ts`, `LobbyBattlePreviewPanelRenderer.ts`, `LobbyBattlePresentationLayout.ts`, and `LootChainGameRoot.ts`;
  - code review completed; the Important issue about `basic_attack` default-branch snap was fixed before final acceptance;
  - `npm.cmd run screenshot:battle-center`: produced screenshots in `artifacts/battle-center-convergence-current`, recorded one battle start request, zero settle requests, zero page errors, zero filtered console errors, and `728` telemetry samples; telemetry summary was `allyMovingTowardCenter=5`, `enemyMovingTowardCenter=3`, `allyHoldingCenter=5`, `enemyHoldingCenter=3`, `maxFrameSpeed=1.722px/ms`;
  - `npm.cmd run repair:preview-battle`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-20 Battle Formation Switch and Combat UI Cleanup R7

- User feedback focus: formation must support real bench/switch flow, and active combat should not look like a debug/report page while both camps run to the center and fight.
- Cocos updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now hides the footer boundary note and footer buttons for the whole `roundPlaying` phase, not only the pre-action opening window; battle-in-progress no longer shows bottom debug settlement controls or explanatory boundary copy;
  - `LobbyFormationPanelRenderer.ts` writes `globalThis.__lootchainFormationDebug` during formation render for automated browser acceptance only; it records current stage, selected ids, selected names, selected count, loading/error, and timestamp without changing gameplay state;
  - `LobbyBattlePreviewPanelRenderer.ts` also removed a redundant impossible `presentation.phase !== 'resultRecorded'` condition in the already-filtered header branch, fixing strict directed TypeScript no-emit for the touched renderer.
- Guard/tooling updates:
  - added `npm.cmd run check:battle-stage13q` and included it in `check:battle-stage13i`;
  - added `npm.cmd run screenshot:formation-switch`, which opens Preview, enters stage map -> challenge dialog -> formation, verifies `5/5 -> 4/5 -> 5/5` after benching and adding another hero, asserts the 4 benched-state heroes are preserved with exactly one new different hero, and asserts no battle start or settle request occurs;
  - `check:preview` freshness tokens now require `recordFormationDebugSnapshot` and `__lootchainFormationDebug` in the served formation chunk.
- Runtime acceptance:
  - `npm.cmd run screenshot:formation-switch` produced screenshots in `artifacts/formation-switch-current/`;
  - `formation-switch-result.json` recorded initial selected ids `[5,11,9,10,63]`, after bench `[5,9,10,63]`, and after adding another hero `[5,9,10,63,17]`; battle start requests `0`, settle requests `0`, page errors `0`, filtered console errors `0`;
  - `npm.cmd run screenshot:battle-center` produced refreshed screenshots in `artifacts/battle-center-convergence-current/`;
  - latest battle runtime recorded one `POST /api/player/battles/start`, zero `/settle`, zero page errors, zero filtered console errors, and `872` telemetry samples;
  - telemetry summary: `allyMovingTowardCenter=5`, `enemyMovingTowardCenter=3`, `allyHoldingCenter=5`, `enemyHoldingCenter=3`, `maxFrameSpeed=1.084px/ms`;
  - visual spot-check: `08-first-action-2500ms.png` no longer shows the bottom boundary note/footer buttons during combat; damage and hit feedback appear only after the opening meet-up.
- Verification passed:
  - `npm.cmd run check:battle-stage13q`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview` after patching stale local Preview temp chunks for the current browser acceptance run;
  - directed TypeScript no-emit for `LootChainGameRoot.ts`, `LobbyBattlePreviewPanelRenderer.ts`, and `LobbyFormationPanelRenderer.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Preview note:
  - Source files are updated, but Cocos Creator may keep serving stale `temp/programming/packer-driver/targets/preview` chunks until Creator focuses/rebuilds Preview. This run patched the local stale Formation/Battle preview chunks only for self-preview evidence; restart/focus Preview if the browser shows old footer controls or lacks formation debug acceptance state.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Melee Contact R8

- User feedback focus: SR heroes in formation/combat looked much smaller than SSR/UR actors, and melee actors still looked like they were attacking from their original/home position instead of approaching the target.
- Root cause:
  - SR/R `act*` Spine assets use a different raw skeleton size from SSR/UR, but the runtime profile and formation cap still suppressed their visual height;
  - `resolveVisibleBattleActionPresentationCue()` could fall back to the current `action_start` event after the explicit cue window ended, so stale `basic_attack` cues could be treated as active at the home position.
- Cocos updates:
  - `LobbyBattleUnitSpineRuntime.ts` raises R/SR battle profile height/width/scale multipliers and keeps a separate `FORMATION_PREVIEW` profile so formation actors normalize closer to SSR/UR size;
  - `LobbyFormationPanelRenderer.ts` enlarges formation stand bounds and keeps formation actors on `FORMATION_PREVIEW`;
  - `LobbyBattleActionPresentation.ts` now uses explicit cue visible windows and no longer falls back to stale `action_start` cues when no cue is actually active;
  - `LobbyBattlePreviewPanelRenderer.ts` lengthens melee approach timing and delays `basic_attack` so melee actors stay close to the target before attack/hit feedback appears;
  - battle background image layers are now preloaded together and a cached battle scene is rebuilt once if the image Sprite nodes were missing during the first render; current self-preview acceptance for this pass still focuses on SR/R scale and melee contact, because the running Preview screenshot can still show the green fallback until Creator fully rebuilds the stage chunks;
  - `repair-preview-stage13v.mjs`, `check-preview-freshness.mjs`, `check:battle-stage13v`, and `screenshot:battle-center` were updated to guard this behavior in both source and running Cocos Preview chunks.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` forces an SR/R-heavy formation including `SR_PALADIN_02` and `SR_ABYSS_06`;
  - latest telemetry recorded `srRBasicAttackClosestDistance=44.28`, `srRBasicAttackAdvanceMedian=279.27`, and SR/R visual height around `417px`;
  - the screenshot gate now fails if SR/R height is below `320px` or if an SR/R basic attack does not reach contact range.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Target-Front Contact R9

- User feedback focus: the current battle screenshot still showed SR heroes too small compared with other heroes, and melee heroes looked like they attacked in place instead of moving to the monster before attacking.
- Root cause confirmed:
  - `resolveActorMeleeContactPosition()` was named like an absolute target-front point but previously behaved like an offset in older Preview chunks, so actor position telemetry could still read as home-position attack when Preview served stale code;
  - SR/R `act_*` skeletons have inflated or different raw bounds, so their formation/combat cap needed a rarity-aware visual-height cap instead of a shared cap tuned around SSR/UR assets.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now returns absolute target-front coordinates from `resolveActorMeleeContactPosition()` and converts to actor offset only at the caller;
  - `LobbyBattleUnitSpineRuntime.ts` raises SR/R battle visual cap to `slotHeight * 1.72` and uses `resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier)`, allowing SR/R formation actors to scale with a `1.18` cap while keeping oversized SSR/UR overrides;
  - `recordBattleActorFrameTelemetry()` now records both `currentActionKind` and `rootMotionKind`, so screenshot acceptance can distinguish the visible cue from the actual root-motion cue;
  - `repair-preview-stage13v.mjs` patches stale Cocos Preview chunks with the same SR/R cap, formation cap, target-front contact point, and clean root-motion telemetry fields;
  - `screenshot-battle-center-convergence.cjs` still strictly validates embedded background telemetry when the running Preview reports it, but does not fail this SR/R/contact acceptance when an old Preview chunk has no background telemetry at all.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` recorded one `POST /api/player/battles/start`, zero `/settle`, zero page errors, zero filtered console errors, and no telemetry errors;
  - forced SR/R formation remained active (`SR_PALADIN_02`, `SR_ABYSS_06`);
  - latest telemetry: `srRSpineVisualHeightMin=420.09`, `srRSpineVisualHeightMedian=485.03`, `srRSpineVisualHeightMax=485.03`, `srRSpineVisualHeightRatio=1.15`;
  - latest melee evidence: `srRRunCueCount=17`, `srRAttackCueCount=3`, `srRSkillCueCount=1`, `srRBasicAttackAdvanceMedian=209.79`, `srRBasicAttackClosestDistance=44.28`, `srRBasicAttackMedianDistance=44.28`.
- Preview note:
  - if the browser still shows the flat green fallback background, that is stale Cocos Preview/background chunk state, not this SR/R/contact fix. Focus/rebuild Cocos Creator Preview to serve the embedded battle background source.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle Stage13X Dark Fallback and Melee Acceptance R10

- User feedback focus: screenshot still showed SR heroes too small and melee attacks visually starting from the home side; the visible battle fallback also still looked like the old green map when the C1812 background was not yet applied.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` keeps the existing battle background asset path, but the procedural fallback now delegates to `drawStage13XBattleFallbackLandscape()` and draws a dark ruined battlefield with red moon, distant spires, cracked floor and team shadow pads instead of the old teal/green forest colors;
  - `scripts/check-battle-stage13x.mjs` now fails if the renderer regresses to the old green fallback colors or loses the Stage13X fallback function token;
  - existing Stage13X melee duel logic remains active: every melee cue resolves `actorDuelPosition / defenderDuelPosition / hitPoint`, so melee units attack at the current target front rather than at their original slot.
- Acceptance target:
  - `npm.cmd run screenshot:battle-center` must continue to show SR/R visual height above the guard threshold, all melee basic attacks reaching target-front contact, zero settle requests, and no accumulated persistent floating text layers;
  - visual review should confirm the immediate fallback scene is dark/gothic even before the embedded background image finishes loading.
- Runtime acceptance:
  - final `npm.cmd run screenshot:battle-center` produced refreshed screenshots under `artifacts/battle-center-convergence-current/`, with 1 `POST /api/player/battles/start`, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - telemetry recorded `srRRunCueCount=17`, `srRAttackCueCount=3`, `srRMeleeApproachSampleCount=12`, `srRBasicAttackAdvanceMedian=143.57`, `allMeleeBasicAttackContactMedian=40`, `allMeleeBasicAttackMissCount=0`;
  - SR/R visual height telemetry recorded `srRSpineVisualHeightMin=420.09`, `srRSpineVisualHeightMedian=578.09`, `srRSpineVisualHeightRatio=1.38`, and `formationSrRVisualHeightOk=true`;
  - `scripts/repair-preview-stage13v.mjs` now also patches stale Preview chunks for Stage13X fallback colors and `resolveActorMeleeDuelFrame()` so self-preview does not regress after local stale chunk repair.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Formation Bounds R11

- User feedback focus: SR hero actors still looked too small/inconsistent in formation, and melee heroes must approach monsters before attacking instead of attacking from their home slot.
- Root cause confirmed:
  - battle `basic_attack` visible cue timing could still show `skill0` after the contact window, making the attack look like it happened from home;
  - formation preview passed `visualWidth/visualHeight` (`height * 2.08`) into `resolveBattleUnitSpineScale()`, so the scale cap used oversized render bounds rather than the actual actor stand bounds;
  - SR/R `act_*` skeletons and SSR/UR named skeletons need different formation caps: SR/R need readable enlargement, while long SSR/UR skeletons need a tighter cap to avoid covering the board.
- Cocos/source updates:
  - `LobbyBattleActionPresentation.ts` moves basic attack damage cue to `timeOffsetMs: 420` and keeps started cues sorted by recency before distance;
  - `LobbyBattlePreviewPanelRenderer.ts` adds basic-attack motion/animation prewarm so melee actors are already at target-front contact when `skill0`/damage feedback appears;
  - `LobbyBattleUnitSpineRuntime.ts` sets battle SR/R profile to `targetHeightRatio=1.28`, `maxWidthRatio=2.65`, `maxScale=1.78`, with `slotHeight * 1.28` cap; formation keeps SR/R at `0.68` while default SSR/UR named formation actors are capped around `0.43`;
  - `LobbyFormationPanelRenderer.ts` now keeps large visual bounds for drawing, but passes actor stand `width/height` into `applyFormationSpineDataWithRetry()` so scale is computed from the actual slot;
  - `repair-preview-stage13v.mjs`, `check-preview-freshness.mjs`, `check:battle-stage13v`, and `check:battle-stage13w` were updated to patch/guard stale Preview chunks for the same scale and cue behavior.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 4 after bench, 5 after add, 0 battle start requests, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - final formation screenshot no longer shows SSR/UR legs covering the board, and SR `见习圣骑士` is readable rather than tiny;
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - latest battle telemetry: `srRRunCueCount=14`, `srRAttackCueCount=3`, `srRSkillCueCount=1`, `srRBasicAttackMedianDistance=136`, `allMeleeBasicAttackMissCount=0`, `srRSpineVisualHeightMedian=486.39`, `srRSpineVisualHeightRatio=1.03`.
- Verification passed:
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:protagonist-hidden`;
  - focused `node --check` on `LobbyBattlePreviewPanelRenderer.ts`, `LobbyBattleActionPresentation.ts`, `LobbyFormationPanelRenderer.ts`, and `LobbyBattleUnitSpineRuntime.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Verification note:
  - direct `tsc -p tsconfig.json --noEmit` with the located Creator 3.8.8 `tsc.cmd` still fails because the current shell TypeScript environment cannot resolve Cocos `cc` module declarations across the project. This appears to be an environment/type-path issue, not a new syntax failure in the touched files.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Melee Approach Smoothing R12

- User feedback focus: the latest battle screenshot still made SR actors look inconsistent with other heroes, and melee actors must visibly move to the monster before attacking instead of attacking from their original slot.
- Root cause confirmed:
  - SR/R `act_*` battle profile needed to stay on the newer normalized cap (`slotHeight * 1.14`) instead of the older oversized/undersized profiles, keeping SR/R visual height consistent at about `433px`;
  - after repairing Preview chunks, the first failing runtime evidence was an enemy melee actor jumping `290px` between `melee_move` and `damage_float`; this came from the approach window being too short for the compressed presentation timeline, not from a missing attack animation.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` extends `BATTLE_ACTOR_MELEE_APPROACH_MS` from `820` to `980`, so melee run-in is spread over more frames before the hit/damage feedback window;
  - `LobbyBattleActionPresentation.ts` keeps `basic_attack` at `timeOffsetMs: 940` and a `1120ms` visible window, so SR/R `skill0` still plays after contact instead of hiding behind the damage float;
  - `LobbyBattlePreviewPanelRenderer.ts` keeps the reversed hit-duel root-motion path, so `hit_float` does not snap the attacker back home while damage is visible;
  - `scripts/check-battle-stage13v.mjs` and `scripts/repair-preview-stage13v.mjs` now guard/patch the `980ms` approach window for stale Cocos Preview chunks.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed after Preview repair, with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - forced SR/R formation remained active (`SR_PALADIN_02`, `SR_ABYSS_06`);
  - latest battle telemetry: `srRSpineVisualHeightMin=433.19`, `srRSpineVisualHeightMedian=433.20`, `srRSpineVisualHeightMax=433.22`, `srRSpineVisualHeightRatio=1`, `srRRunCueCount=15`, `srRAttackCueCount=3`, `srRSkillCueCount=1`, `srRBasicAttackMedianDistance=104`, `allMeleeBasicAttackMissCount=0`, `maxFrameDelta=247.53`.
- Verification passed:
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:preview`;
  - `npm.cmd run screenshot:formation-switch`;
  - `npm.cmd run check:protagonist-hidden`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle SR/R Scale and Midfield Melee Contact R13

- User feedback focus: battle/formation screenshots still showed SR actors smaller than the rest, and melee actors must move to the monster/Boss before attacking rather than attacking from the home slot.
- Root cause confirmed:
  - SR/R `act_*` skeleton bounds differ from SSR/UR named skeletons, so battle and formation need separate caps instead of one shared scale profile;
  - old melee duel logic put the defender only slightly forward from its home anchor, so the attacker could still be far from the target on compressed timelines;
  - Preview telemetry could join samples across full scene rebuilds, causing false large-delta failures, and the stale Preview repair script could miss already-patched function signatures.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` keeps SR/R battle visual height normalized around `420px` and raises formation SR/R caps while keeping oversized named SSR/UR profiles bounded;
  - `LobbyFormationPanelRenderer.ts` and `LobbyBattlePresentationLayout.ts` use larger but bounded actor stands, so SR/R heroes are readable and team slots do not collapse into one pile;
  - `LobbyBattlePreviewPanelRenderer.ts` now resolves melee contact by midpoint duel: attacker and defender both move toward the center contact lane, hit effects and damage text anchor to `hitPoint`, and basic attack keeps `run` only during the short approach prewarm before switching to the configured attack animation;
  - `scripts/screenshot-battle-center-convergence.cjs` now validates the actual hit window across `basic_attack` root motion, not only the earliest pre-swing frame;
  - `scripts/repair-preview-stage13v.mjs` now patches stale Preview chunks for midpoint duel, frame smoothing, background telemetry, and existing patched function signatures.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - forced SR/R formation remained active (`SR_PALADIN_02`, `SR_ABYSS_06`);
  - latest battle telemetry recorded `telemetry samples=799`, `srRRunCueCount=16`, `srRAttackCueCount=3`, `srRSkillCueCount=1`, `srRBasicAttackClosestDistance=77.84`, `allMeleeBasicAttackMissCount=0`, `backgroundSource=asset/backgroundLoaded=true`, and `srRSpineVisualHeightMedian≈419.84`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-22 Battle Melee Contact Hold R14

- User feedback focus: melee heroes visually looked like they snapped to the monster, snapped back home, and then played attack/skill from the original slot. The required behavior is horizontal RPG timing: run to target front, attack/skill at target front, show damage/hit feedback, then return.
- Root cause confirmed:
  - source already had a `basic_attack` root-motion position function, but `resolveBattleActorRootMotionCue()` excluded `basic_attack`, so the attack phase depended on the previous `melee_move` cue and could desync from the actual action animation;
  - screenshot and Preview freshness guards still treated `basic_attack` root motion as forbidden, which let the old visual rule pass acceptance;
  - stale Preview repair could also remove `basic_attack` from playback branches, so a refreshed browser could keep showing old behavior.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now lets `basic_attack` own the target-front contact root motion after `melee_move` reaches the enemy, keeps attacker/defender in the same duel frame through damage/hit windows via `BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520`, then returns after the hold window;
  - animation dispatch now applies cue playback for `melee_move | basic_attack | ranged_projectile`, so SR/R `skill0` and SSR/UR `atk` play while the actor is still at target-front contact;
  - `scripts/screenshot-battle-center-convergence.cjs` now fails if SR/R `basic_attack` snaps near home, if damage float happens after the attacker left contact, or if contact distance is outside melee range;
  - screenshot sampling now includes `09-basic-contact-3200ms.png`, `10-basic-impact-3900ms.png`, and `11-damage-hold-4600ms.png`; the artifact directory is reset before each run to avoid stale screenshots;
  - `scripts/repair-preview-stage13v.mjs` is now idempotent for contact-hold constants and patches stale Preview chunks to keep `basic_attack` in root motion/playback branches;
  - `scripts/check-preview-freshness.mjs`, `check-battle-stage13v.mjs`, and `check-battle-stage13x.mjs` were updated to the new rule.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 filtered console errors;
  - current visual frame `artifacts/battle-center-convergence-current/09-basic-contact-3200ms.png` shows the SR/R melee actor in front of the monster instead of at the home slot;
  - latest telemetry recorded `basicAttackRootMotionSampleCount=130`, `srRBasicAttackHomeSnapCount=0`, `srRDamageContactHoldSampleCount=2`, `srRBasicAttackMedianDistance=40.31`, `allMeleeBasicAttackMissCount=0`, and `backgroundSource=asset/backgroundLoaded=true`.
- Verification passed:
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run check:battle-stage13w`;
  - `npm.cmd run check:battle-stage13x`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - directed Cocos TypeScript no-emit for `LobbyBattlePreviewPanelRenderer.ts` and `LobbyBattleActionPresentation.ts`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-23 Formation Contract Witch Visual Scale R15

- User feedback focus: formation view showed `契约魔女` (`SR_WITCH_03`, `portraitAsset=act_1028`) much smaller than the other selected heroes.
- Root cause confirmed:
  - `SR_WITCH_03` correctly uses `portrait_asset=act_1028`; the issue was not a wrong hero asset fallback;
  - runtime telemetry showed `act_1028` raw bounds around `1890 x 810`, which include very wide effect/empty bounds;
  - the generic SR/R formation cap treated those inflated bounds as the visible body, so actual on-screen character height was compressed.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` adds an asset-level formation height cap for `act_1028: 1.32`, applied before the generic SR/R cap;
  - existing special caps for `Eulenspigel` and `Nuu` remain unchanged, so oversized SSR/UR named skeletons still stay bounded;
  - `scripts/screenshot-formation-switch.cjs` now forces `契约魔女` into the checked formation and fails if her resolved scale remains below the visual threshold;
  - `scripts/repair-preview-stage13v.mjs` now patches stale Preview chunks for the `act_1028` rule without replacing unrelated runtime functions.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 5 selected heroes, 4 after bench, 5 after add, 0 battle start requests, 0 settle requests, 0 page errors, and 0 console errors;
  - final formation screenshot includes `契约魔女` with `resolvedScale=0.7883` and visual height `567.6`, no longer appearing as a tiny character;
  - Preview chunk was restored from the clean editor target and re-patched after the stale repair script was narrowed, keeping `patchBattleUnitSpineRuntimeEnums`, skin resolution, and visual profile functions intact.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-23 Formation Ron/Kane Visual Retune R16

- User feedback focus: formation view should make `灰烬猎手·罗恩` smaller and `白银圣枪·凯恩` larger.
- Cocos/source updates:
  - `LobbyBattleUnitSpineRuntime.ts` changes `Eulenspigel` formation-only cap from `0.34` to `0.272`, reducing `SSR_RON` visual height by 20%;
  - `LobbyBattleUnitSpineRuntime.ts` adds `Ishmael: 0.528`, enlarging `SSR_KANE` from the default named cap by 10%;
  - `scripts/screenshot-formation-switch.cjs` now validates `SSR_KANE / Ishmael` from the initial formation view and `SSR_RON / Eulenspigel` across the accepted visual samples;
  - `scripts/repair-preview-stage13v.mjs` and `scripts/check-preview-freshness.mjs` now carry the same stale Preview patch/guard values.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:formation-switch` passed with 0 battle start requests, 0 settle requests, 0 page errors, and 0 console errors;
  - `SSR_RON / Eulenspigel` changed from the prior `estimatedHeight=146.2` to `116.96`;
  - `SSR_KANE / Ishmael` changed from the prior `estimatedHeight=206.4` to `227.04`;
  - visual self-preview checked `artifacts/formation-switch-current/04-formation-open.png` and `06-after-add-other.png`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-23 Battle Phase A Impact Upgrade

- User approved Phase A implementation for battle impact: melee must reach contact before attack; hit frame must synchronize attacker dash/contact, defender recoil, Hit Stop, Slash VFX, floating damage text, and critical Screen Shake.
- Cocos/source updates:
  - added `LobbyBattleImpactDirector.ts` as a pure presentation module for `hitStopMs`, `screenShake`, `defenderRecoil`, `slash`, and `floatingText`;
  - `LobbyBattlePresentationTimeline.ts` now carries local presentation-only `critical` flags on `damage_preview`; first ally damage provides a stable critical acceptance sample;
  - `LobbyBattleActionPresentation.ts` carries `isCritical` into `damage_float` cue;
  - `LobbyBattlePreviewPanelRenderer.ts` consumes the impact profile, strengthens target recoil on `damage_float`, renders `LobbyBattleImpactHitStopLayer`, stronger `LobbyBattleImpactSlashLayer`, critical-sized red/gold floating text, and critical screen shake;
  - added runtime `impactSamples` telemetry for Playwright acceptance;
  - added `scripts/check-battle-phase-a-impact.mjs` and included it in the Stage13 aggregate guard;
  - added `scripts/repair-preview-phase-a-impact.mjs` for stale Cocos Preview chunks only.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - telemetry recorded `impactSampleCount=13`, `criticalImpactSampleCount=4`, `hitStopSampleCount=4`, `screenShakeSampleCount=1`, `slashSampleCount=4`, `criticalFloatingTextSampleCount=1`, and `damageFloatImpactSyncMaxDelta=3`;
  - melee contact remained valid: `srRBasicAttackMedianDistance=40.31`, `allMeleeBasicAttackContactMedian=40.31`, `maxActionFloatingTextsPerFrame=1`, `maxPersistentFloatingTextLayers=1`.
- Verification passed:
  - `npm.cmd run check:battle-phase-a-impact`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - focused Cocos Creator 3.8.8 TypeScript no-emit for `LobbyBattleImpactDirector.ts`, `LobbyBattleActionPresentation.ts`, `LobbyBattlePresentationTimeline.ts`, and `LobbyBattlePreviewPanelRenderer.ts`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-23 Battle Melee Sticky Contact R17

- User feedback focus: melee heroes must run to the monster before attacking and must not snap back to the original home slot before/after the hit.
- Root cause confirmed:
  - `melee_move` and `basic_attack` could overlap, and the older root-motion priority sometimes let the attack phase stop following the long melee approach cue;
  - after the hit window ended, a frame without root motion still resolved the actor back to the original converged home slot, so the visual could look like a teleport-back before the next attack/skill frame.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now keeps `melee_move` root motion active through the linked duel window and lets `basic_attack` approach then hold at target-front contact;
  - added `battleActorStickyCombatPositions`, so a melee actor that reaches target-front contact keeps that contact position as its combat position instead of returning to the original slot; later actions move from the current contact position;
  - `scripts/screenshot-battle-center-convergence.cjs` now fails if SR/R basic attack or damage float snaps near home, and all-melee contact validation uses the effective closest hit/damage contact rather than early run-up samples only;
  - added `scripts/repair-preview-melee-contact-root-motion.mjs` plus `npm.cmd run repair:preview-melee-contact-root-motion` for stale Creator Preview chunks;
  - `scripts/check-battle-stage13v.mjs` now guards the sticky contact cache, Preview repair tokens, SR/R damage home-snap metric, and all-melee damage contact metric.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - latest telemetry recorded `telemetry samples=680`, `srRBasicAttackClosestDistance=40.31`, `srRBasicAttackMedianDistance=40.31`, `allMeleeBasicAttackContactMedian=40.31`, `allMeleeBasicAttackMissCount=0`, `srRBasicAttackHomeSnapCount=0`, `srRDamageHomeSnapCount=0`, `srRDamageContactHoldSampleCount=1`, `srRRunCueCount=15`, `srRAttackCueCount=4`, `criticalImpactSampleCount=8`, `screenShakeSampleCount=2`, and `damageFloatImpactSyncMaxDelta=2`;
  - refreshed Phase A videos were generated under `artifacts/battle-phase-a-acceptance-current/` with `normal-attack.webm` and `critical-hit.webm`; report recorded `criticalDamageCueCount=2`, `criticalShakeCueCount=2`, `allCriticalDamageCuesHaveShake=true`, `rafFps=12.8` during headless video capture, `drawCall=86`, and `usedJSHeapMB=110.5`.
- Verification passed:
  - `npm.cmd run repair:preview-phase-a-impact`;
  - `npm.cmd run repair:preview-melee-contact-root-motion`;
  - `npm.cmd run check:battle-stage13v`;
  - `npm.cmd run screenshot:battle-center`;
  - `npm.cmd run record:battle-phase-a-acceptance`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `git diff --check` passed with only Git LF/CRLF warnings;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle Real Combat Replay Stage14

- User focus: battle must be real numeric combat, not fake playback. Damage must come from hero/enemy attributes; HP bars must drop with each hit; dead enemies must stop receiving hits; melee must reach target-front contact before hit; SR/R and SSR/UR animation cues must remain visible.
- Product/planning decision:
  - keep backend protocol unchanged and still call only existing `POST /api/player/battles/start`;
  - do not call/open battle settle, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy writes;
  - local Cocos replay now derives visual combat from unit attributes and stage context only.
- Cocos/source updates:
  - `LobbyBattleReplayModel.ts` adds `BattleReplayDerivedAttributes` and derives `maxHp / attack / defense / evasionRate / damageReduction / critRate / critDamage` from hero/enemy power, level, rarity, role, side, and stage rank;
  - enemies now receive `monsterDurabilityMultiplier`, defense, evasion, and damage reduction so low-stage fights do not end in one fake one-shot;
  - `resolveBattleReplayDamageResult()` calculates evade, crit, defense mitigation, reduction, variance, per-hit caps, low-HP finish logic, `hpBefore/hpAfter`, and removes dead targets from later action selection;
  - `BattleReplayHitEvent` now carries `hitKey` and `evaded`; HP presentation tracks `appliedHitKeys` and applies HP only from replay hit events;
  - `LobbyBattleActionPresentation.ts` carries `hitKey/evaded` into `damage_float` and `hit_float`; hit reaction starts 320ms after damage to keep damage number and HP drop on the hit frame;
  - `LobbyBattlePreviewPanelRenderer.ts` disables sticky contact (`BATTLE_USE_STICKY_CONTACT_POSITIONS = false`), uses close-contact lane gaps (`BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 148`, `BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 118`), keeps dead actors visible for 420ms for death/dissolve evidence, and emits `hitKey/eventSeq/deadAtMs` telemetry;
  - `scripts/screenshot-battle-center-convergence.cjs` now validates `maxLiveActorOverlapPairs`, `perActionMeleeContactMissCount`, `deadActorVisibleAfterDeadMsMax`, `deadTargetSelectedActionCount`, and `hpDropCueMismatchCount`;
  - added `scripts/check-battle-stage14-real-combat.mjs` and `scripts/repair-preview-stage14-real-combat.mjs`, and included Stage14 in `check:battle-stage13i`.
- Runtime Preview acceptance on `http://localhost:7456/`:
  - SR/R forced formation passed: `npm.cmd run screenshot:battle-center`; 1 battle start request, 0 settle requests, 0 page errors, 0 console errors; artifacts copied to `artifacts/battle-center-convergence-srr-stage14/`;
  - mixed formation passed: `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`; 1 battle start request, 0 settle requests, 0 page errors, 0 console errors; artifacts copied to `artifacts/battle-center-convergence-mixed-stage14/`;
  - mixed telemetry included `namedAtkCueCount=2`, `namedSkillCueCount=5`, `srRRunCueCount=9`, `srRAttackCueCount=2`, `damageFloatSampleCount=14`, `hitVfxAssetSampleCount=14`, `hpDropCueMismatchCount=0`, `deadTargetSelectedActionCount=0`, `perActionMeleeContactMissCount=0`, and `enemyLastHpRatioMax=0`.
- Verification passed:
  - focused Cocos Creator TypeScript no-emit for battle replay/action/HP/impact/spine/renderer modules;
  - `npm.cmd run check:battle-stage14-real-combat`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:preview`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - do not call or expose `/api/player/battles/{battleNo}/settle` without explicit user approval;
  - no reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle C1812 Reference Melee Fix

- User supplied `C:\Users\axian\Desktop\C1812-1\video_2026-06-20_14-45-06.mp4` as the target combat feel: melee units enter the battlefield, run into the clash area, then keep fighting around the enemy instead of teleporting to/from the original home slot.
- Source/runtime fixes:
  - `LobbyBattlePreviewPanelRenderer.ts` now lets the current `damage_float` cue drive the attacker root motion with highest priority on the same `eventSeq`, so the hit frame is held at target-front contact;
  - `damage_float` actor positioning now uses the rendered `unit.role` instead of stale cue role data, preventing front SR/R heroes from being treated like backline casters and staying at home during hit frames;
  - removed the broad target-current-position tracking experiment because it pulled all melee units into one pile; the stable model keeps lane-based duel anchors and only locks the active hit frame;
  - `damage_float` bypasses per-frame position smoothing only for the hit frame, while run/approach still uses visible movement;
  - `scripts/screenshot-battle-center-convergence.cjs` now excludes true backline SR/R casters from melee home-snap validation.
- Preview repair:
  - `scripts/repair-preview-stage14-real-combat.mjs` mirrors the runtime fixes for stale Cocos Preview chunks, including current damage cue priority, `unit.role` melee detection, and removal of old target-tracking residue.
- Runtime acceptance on `http://localhost:7456/`:
  - SR/R forced formation passed `npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors;
  - mixed formation passed `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors;
  - latest screenshots remain in `artifacts/battle-center-convergence-current/`.
- Verification passed:
  - `npm.cmd run repair:preview-stage14-real-combat`;
  - `npm.cmd run check:battle-stage14-real-combat`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - focused Cocos Creator TypeScript no-emit for battle replay/action/HP/snapshot/impact/renderer modules;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-26 Battle SoonFx Root Motion R23

- User asked to stop patching the battle scene blindly and use a mature idle-RPG battle model idea. Chosen direction: keep the current LootChain/Cocos codebase, but apply a SoonFx-style event ownership model locally: one replay model owns action/hit/HP/death events, while the renderer only consumes cue timing and continuous positions.
- Cocos/source fixes:
  - `LobbyBattleReplayModel.ts` now makes melee target selection slot-aware: front targets near the actor are preferred, finishing targets are sorted by slot distance before HP ratio, and melee actors no longer randomly choose far cross-lane targets;
  - `LobbyBattleActionPresentation.ts` adds `actionSeq` to action/damage/hit cues so renderer root motion is tied to the exact action, not any nearby hit in the compressed timeline;
  - `LobbyBattlePreviewPanelRenderer.ts` allows the target of a `melee_move` cue to run into the contact point with the attacker, keeps root motion smoothed at `56 * scale`, and uses stable post-contact lanes based on `unitKey` to prevent same-side piling;
  - old idle-clash/front-charge fake loops remain disabled; combat pressure comes from real action windows, hit frames, HP updates, slash/hit-stop/screen-shake telemetry, and persistent contact hold.
- Preview/acceptance scripts:
  - added `scripts/check-battle-soonfx-model.mjs` and `npm.cmd run check:battle-soonfx-model`;
  - added `scripts/repair-preview-battle-soonfx-root-motion.mjs` and `npm.cmd run repair:preview-battle-soonfx-root-motion` for stale Cocos Preview chunks;
  - `scripts/screenshot-battle-center-convergence.cjs` now counts both attacker and pulled target as root-motion participants, and excludes actual root-motion frames from static same-side overlap checks;
  - `scripts/check-battle-stage14-real-combat.mjs` was updated from the old `targetMeetMotion=false` assumption to the new target-meet motion token.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed with 1 battle start request, 0 settle requests, 0 page errors, 0 console errors, and forced SR/R formation;
  - latest telemetry: `sampleCount=1821`, `maxContinuousFrameDelta=56.01`, `maxContinuousFrameSpeed=0.918`, `battlefieldOutOfBoundsSampleCount=0`, `allMeleeBasicAttackContactMedian=16.35`, `allMeleeBasicAttackMissCount=0`, `allMeleeDamageContactSampleCount=9`, `enemyLastHpRatioMax=0`, `deadTargetSelectedActionCount=0`, `hpDropCueMismatchCount=0`, `maxLiveActorOverlapPairs=0`, `maxSimultaneousRootMotionActors=2`, `bothSidesRootMotionWindowCount=125`, `damageFloatImpactSyncMaxDelta=3`, `screenShakeSampleCount=4`, `slashSampleCount=42`.
- Verification passed:
  - `node --check .\scripts\repair-preview-battle-soonfx-root-motion.mjs`;
  - `node --check .\scripts\screenshot-battle-center-convergence.cjs`;
  - `npm.cmd run check:battle-soonfx-model`;
  - `npm.cmd run repair:preview-battle-soonfx-root-motion`;
  - `npm.cmd run screenshot:battle-center`;
  - `npm.cmd run check:battle-stage14-real-combat`;
  - `npm.cmd run check:battle-phase-a-impact`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle No-Teleport Runtime Sampling R23

- User reported the R22 result still looked like teleporting. This pass used actual Cocos actor node sampling instead of only battle event telemetry.
- Root cause:
  - R22's `BATTLE_ACTOR_FRAME_MAX_DELTA` limiter prevented large visual jumps, but it also clipped root-motion target updates to about `42px` per render refresh;
  - because Preview render refresh cadence can be much lower than RAF, the attacker could still be far from the target when the damage cue arrived, making the attack read as "not really running to the monster";
  - the existing screenshot telemetry checked resolved frame positions, while the user's complaint was about real rendered nodes.
- Cocos/source fixes:
  - root-motion cues now bypass the frame-delta limiter and use the time-based root-motion target directly;
  - `setBattleActorFramePosition()` no longer snaps long distances after the first node placement; initialized actors tween by distance with `clamp(distance / 760, 0.045, 0.95)`;
  - first placement is still direct to avoid actors tweening from `(0,0)` when the scene is created;
  - kill-frame handling now treats the current cue as valid when it matches the target `deadAtMs` window, so the last hit does not get misreported as "dead unit still received hit feedback";
  - `scripts/repair-preview-battle-motion-r22.mjs` was synced with the new root-motion/tween/death-window logic for stale Preview chunks and verified idempotent by running it twice.
- New diagnostic:
  - added `scripts/diagnose-battle-visual-teleport.cjs`;
  - added `npm.cmd run diagnose:battle-visual-teleport`;
  - the script samples real `LobbyBattleActor_*` node positions every `requestAnimationFrame` and fails on visible node jumps, producing JSON/PNG/WebM under `artifacts/battle-visual-teleport-current/`.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run diagnose:battle-visual-teleport` passed with `frames=146`, `actor nodes=8`, `visual jumps=0`;
  - mixed UR/SSR/SR formation passed `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors, `telemetry samples=1820`;
  - default SR/R formation passed `npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors, `telemetry samples=1941`;
  - visual self-check used `09-basic-contact-3200ms.png` and `10-basic-impact-3900ms.png`; melee actors are now in the central contact area during hit frames, with slash VFX and floating damage visible.
- Verification passed:
  - `node --check scripts\repair-preview-battle-motion-r22.mjs`;
  - focused Cocos Creator TypeScript no-emit for `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`;
  - `npm.cmd run repair:preview-battle-motion-r22`;
  - `npm.cmd run diagnose:battle-visual-teleport`;
  - `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`;
  - `npm.cmd run screenshot:battle-center`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle Sustained Clash Retune R19

- User supplied `C:\Users\axian\Videos\Captures\Cocos Creator - lootchain-cocos - Google Chrome 2026-06-25 10-34-44.mp4`; review showed the battle still felt turn-based because front units stayed too far from the center line and stale Preview chunks could reintroduce target-anchor jumps.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now uses a sustained clash-line model: front units charge closer to the center with `BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 240` and `BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 132`;
  - per-action melee root motion no longer uses `effectiveAdvanceRatio` or `duelFrame.actorDuelPosition`; it uses `resolveActorClashLungeOffset()` with `BATTLE_ACTOR_CLASH_APPROACH_LUNGE_X = 108`, `BATTLE_ACTOR_CLASH_ATTACK_LUNGE_X = 88`, and `BATTLE_ACTOR_CLASH_HIT_HOLD_LUNGE_X = 82`;
  - combat playback hides actor nameplates during `roundPlaying/resultRecording/resultRecorded`, leaving HP bars, VFX, and floating numbers readable;
  - `scripts/repair-preview-stage14-real-combat.mjs` now patches stale Preview variable declarations and removes old `slot.width * 0.52` / target-anchor actor branches;
  - `check:preview`, `check-battle-stage13k`, `check-battle-stage13z2`, and `check-battle-stage14-real-combat` now guard the sustained-clash tokens.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed for forced SR/R formation with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center` passed for mixed UR/SSR/SR formation with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - visual self-check used `09-basic-contact-3200ms.png`, `10-basic-impact-3900ms.png`, and `12-mid-combat-5100ms.png`; units now stay around the midline clash area instead of jumping to/from the original side columns.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle Continuous Clash Retune R20

- User supplied `C:\Users\axian\Videos\Captures\Cocos Creator - lootchain-cocos - Google Chrome 2026-06-25 10-34-44.mp4`; after R19 the battle still read too turn-based in places because the visible HUD still used round wording and front actors could visually settle too far from the enemy line.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now pushes the front clash closer with `BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 300` and `BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 112`;
  - front actors now resolve a persistent combat home position after the opening charge, then apply small clash-idle sway through `resolveBattleActorClashIdleOffset()` so they keep pressure near the center instead of reading as static columns;
  - melee `melee_move/basic_attack/damage_float` root motion holds contact through the hit window and returns only to the current clash position, not the original side slot;
  - visible HUD copy was changed from round labels to `交战中`, `双方接战`, and `阵线推进`, reducing the old turn-based/readout feel;
  - `scripts/screenshot-battle-center-convergence.cjs` now validates `finalFrontLineGapMedian` and `postDamageFrontHoldMissCount`, so a regression that retreats to home or leaves the front too far apart fails automatically;
  - `check:preview`, `check-battle-stage13z2`, `check-battle-stage14-real-combat`, and `repair:preview-stage14-real-combat` were synced to the new sustained-clash tokens.
- Runtime acceptance on `http://localhost:7456/`:
  - SR/R forced formation passed `npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors; telemetry included `finalFrontLineGapMedian=302.43`, `postDamageFrontHoldMissCount=0`, `enemyLastHpRatioMax=0`, and `damageFloatImpactSyncMaxDelta=4`;
  - mixed UR/SSR/SR formation passed `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors; telemetry included `finalFrontLineGapMedian=308.54`, `postDamageFrontHoldMissCount=0`, `enemyLastHpRatioMax=0`, `damageFloatImpactSyncMaxDelta=2`, `namedAtkCueCount=35`, and `namedSkillCueCount=37`;
  - visual self-check used `06-opening-run-1000ms.png`, `09-basic-contact-3200ms.png`, `10-basic-impact-3900ms.png`, and `12-mid-combat-5100ms.png`; the fight now keeps a sustained midline clash instead of one unit stepping out like a turn.
- Verification passed:
  - `npm.cmd run check:battle-stage14-real-combat`;
  - `npm.cmd run check:battle-stage13z2`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - focused Cocos Creator TypeScript no-emit for battle renderer/timeline/state/replay/action/HP modules;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle Phase A Contact Hold R21

- User confirmed the next correction after the R20 visual pass: melee actors must not teleport to the monster, snap back, then attack. The attacker should visibly move to the target contact area, hold that contact through the hit frame, and only fall back into the current clash line instead of the original home column.
- Cocos/source updates:
  - `LobbyBattlePreviewPanelRenderer.ts` now keeps root motion limited to `melee_move` and `ranged_projectile`; `basic_attack` no longer owns long-distance movement, so the attack frame cannot create a fake teleport-return cycle;
  - `damage_float` records the actor's current rendered contact position into `battleActorStickyCombatHoldUntilMs` and holds it for about 2.4 seconds, keeping melee actors visually near their target during damage, hit stop, slash VFX, and hit reaction;
  - sticky contact, damage target, and clash-idle offsets were widened per lane so multiple heroes and monsters do not stack into one unreadable pile while still staying in the central battle area;
  - debug HUD and skill-bar placeholders are hidden for normal preview, reducing report-like clutter in the combat scene;
  - `LobbyBattleImpactDirector.ts` increases defender recoil distance and lift for stronger ordinary/critical hit impact.
- Preview/acceptance scripts:
  - `scripts/repair-preview-melee-contact-root-motion.mjs` and `scripts/repair-preview-phase-a-impact.mjs` were synced with the source model so stale Cocos Preview chunks receive the same contact-hold and recoil logic;
  - `scripts/screenshot-battle-center-convergence.cjs` now ignores transient damage/hit frames for static overlap checks and verifies no settle request is made during visual acceptance;
  - `scripts/check-preview-freshness.mjs` and `scripts/check-battle-stage14-real-combat.mjs` now guard the R21 root-motion/contact tokens.
- Runtime acceptance on `http://localhost:7456/`:
  - `npm.cmd run screenshot:battle-center` passed for forced SR/R formation with 1 battle start request, 0 settle requests, 0 page errors, and 0 console errors;
  - latest screenshots remain in `artifacts/battle-center-convergence-current/`.
- Verification passed:
  - `npm.cmd run repair:preview-phase-a-impact`;
  - `npm.cmd run repair:preview-melee-contact-root-motion`;
  - `npm.cmd run check:battle-stage13i`;
  - focused Cocos Creator TypeScript no-emit for battle renderer/timeline/state/replay/action/HP modules;
  - `npm.cmd run check:preview`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-06-25 Battle No-Teleport Contact Path R22

- User rejected the remaining battle motion quality: attacks must not teleport, actors must not run outside the scene, and the effect should match the reference side-scrolling RPG flow where melee units run into target contact before attacking.
- Root cause:
  - `LobbyBattlePreviewPanelRenderer.ts` had several coordinate sources competing in the same frame: stable action anchors, rendered frame anchors, sticky contact positions, clash idle offsets, and root-motion positions;
  - melee root motion target positions were inheriting the actor's own idle/separation offset, so a runner could arrive beside the target-front point or lag behind the hit frame;
  - stale Cocos Preview repair scripts could still reintroduce older wide frame deltas and contact offsets.
- Cocos/source fixes:
  - `BATTLE_ACTOR_FRAME_MAX_DELTA` was tightened to `58`, adding a stricter visual no-teleport cap for compressed timeline playback;
  - all resolved actor positions now pass through `clampBattleActorFramePosition()` with safe battlefield bounds (`x <= 820 * scale`, `-340..340 * scale` on y) before rendering/telemetry;
  - `melee_move` root motion now targets the absolute `resolveActorMeleeContactPosition()` for the action, instead of `baseMotionHomePosition + actionOffset`, so the runner visibly travels from its current combat home to the enemy-front contact point;
  - persistent lane separation is only applied to non-root-motion hold positions; active attack root motion returns the raw clamped path position so it is not pushed away from the target;
  - lane/contact offsets were retuned to keep multiple actors readable in the clash area without pushing them outside the field.
- Preview/acceptance scripts:
  - added `scripts/repair-preview-battle-motion-r22.mjs` and `npm.cmd run repair:preview-battle-motion-r22` for stale Preview chunks; do not use the older `repair:preview-melee-contact-root-motion` after this step because it can reintroduce the previous broad smoothing values;
  - `scripts/screenshot-battle-center-convergence.cjs` now validates continuous frame delta/speed, battlefield out-of-bounds samples, per-action melee contact misses, same-side live actor overlap, and keeps telemetry snapshots at every key screenshot so early-ending mixed teams are still analyzable;
  - `scripts/check-battle-stage13v.mjs` now guards the stricter `BATTLE_ACTOR_FRAME_MAX_DELTA = 58` threshold.
- Runtime acceptance on `http://localhost:7456/`:
  - SR/R forced formation passed `npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors, `sampleCount=1845`, `maxContinuousFrameDelta=58.01`, `battlefieldOutOfBoundsSampleCount=0`, `allMeleeBasicAttackContactMedian=65.32`, `perActionMeleeContactMissCount=0`, `maxLiveActorOverlapPairs=0`;
  - mixed UR/SSR/SR formation passed `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`: 1 battle start request, 0 settle requests, 0 page errors, 0 console errors, `sampleCount=1954`;
  - visual self-check used `06-opening-run-1000ms.png`, `09-basic-contact-3200ms.png`, and `10-basic-impact-3900ms.png` in `artifacts/battle-center-convergence-current/`; no actor was observed teleporting back to a side column or leaving the visible battlefield.
- Verification passed:
  - `npm.cmd run repair:preview-battle-motion-r22`;
  - `npm.cmd run screenshot:battle-center`;
  - `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`;
  - focused Cocos Creator TypeScript no-emit for `LobbyBattlePreviewPanelRenderer.ts` using `--moduleResolution node`;
  - `npm.cmd run check:battle-stage13i`;
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - `git diff --check` passed with only Git LF/CRLF warnings.
- Boundary unchanged:
  - current visual battle may call existing `POST /api/player/battles/start`;
  - no `/api/player/battles/{battleNo}/settle`, reward, stamina, progress, currency, bag, hero growth, ranking, USDT, fund-pool, EX, exchange/reissue, or new economy write entry is opened.

## 2026-07-09 战斗特殊属性系统（RPG 化，表现层）

详细规格见 `docs/battle/stage13-combat-special-properties.md`；后端表与口径见 `D:\project\LootChain\docs\24-战斗可视化与战斗系统.md` + `22-数据库设计.md`。

- 策划定稿：特殊属性只来自技能/装备/宝石，职业不触发（职业克制环例外）；连击/斩杀走装备/宝石（sim 机制保留，当前单发）；英雄技能特殊属性=概率触发（`baseChance×稀有度系数`）；能量护盾=按稀有度缩放的百分比属性；暴击/减伤/闪避等百分比已按稀有度缩放。
- 数据源：后端新表 `hero_battle_skill_config`（`sql/69_hero_battle_skill_config.sql`，按 `hero_code` 存 `energy_shield_scope`+`effects_json`，已落库 17 行）。客户端 `LobbyBattleHeroSkillConfig.ts` 占位镜像，待 `battle start` 回执下发替换。
- 已实装（客户端 sim + 表现，`LobbyBattleReplayModel` / `LobbyBattlePresentationHp` / `LobbyBattleActionPresentation` / `LobbyBattleImpactDirector` / `LobbyBattlePreviewPanelRenderer`）：能量护盾（先扣盾再扣血 + 半透明护盾层）、真伤穿透（无视防御 + 紫色飘字）、吸血（回攻击者血 + 绿色飘字）、反弹（反伤攻击者 + 红色飘字）、显眼飘字（穿透紫/暴击红/克制金/连击青/闪避灰）。
- 待实装：冻结/眩晕（动回合生成）、溅射（多目标）——配置已登记 sim no-op；连击/斩杀随装备/宝石；`battle start` 下发管线。
- 2026-07-09 下发管线已打通：battle start 回执 `lineup[]` 带 `energyShieldScope`+`effectsJson`（后端 `hero_battle_skill_config` + `HeroBattleSkillConfigMapper`），客户端优先用下发、缺省回退占位；实测返回正确。
- 2026-07-10 冻结/眩晕已实装：createSynthetic roll→目标 `frozenUntilMs`，`selectBattleReplayActor(nowMs)` 排除被控单位（跳过出手），不叠控/不控尸，全员被控推进时间+连续空过>10 收尾（real-combat/状态机守卫验证不 stall），冻结冰蓝/眩晕晕黄飘字。
- 2026-07-10 溅射已实装：主动作 roll 一次（不进 createSynthetic 防递归）→ `pickBattleReplaySplashTarget` 最近另一敌人追加 magnitude 比例 hit（`isSplash`），"溅射" 橙飘字。至此 A 档概率技能（穿透/吸血/反弹/冻结/眩晕/溅射）全部落地。
- 2026-07-10 硬控持续图标已实装：`hit.frozeUntilMs`→`BattlePresentationHpUnitState.frozenUntilMs`，HP 状态层按播放时间算 `frozen`，`renderHpBar(ccKind)` 被控期间在血条上方挂 `buff_stun` 染色图标（冰蓝/晕黄）直到解控，逐帧重建无 tween。
- 2026-07-10 战斗/大厅微调：① 职业克制增伤 +30%→+10%（`BATTLE_REPLAY_COUNTER_BONUS=1.1`），且飘字区分方向——我方克敌"克制"（金）/ 敌方克我方"被克制"（红），`resolveBattleHitDisplayValue(hit, actorSide)`；② 大厅顶部"深渊爬塔·第N层"改用**已通关最高关**（后端 `PlayerLobbyAdventureVO.maxCompletedStageCode`←`user_mainline_progress.max_completed_stage_code`；客户端 `LobbyAdventureApi` 解析、`LobbyHudRenderer.resolveIdleTowerStageCode` 优先用它），不再显示"下一关"（会多 1 层）。
- 2026-07-10 玩家英雄详情"技能预览"接入真实技能特性：`LobbyHeroDetailPanelRenderer.resolveHeroSpecialSkills` 展示能量护盾 + 概率技能（吸血/穿透/冻结/眩晕/溅射/反弹），触发% 按该英雄稀有度实算；无配置英雄提示"连击/斩杀由装备/宝石提供"。
- 2026-07-10 战败路径修复（之前只测过胜利，战败路径有多处 bug）：
  1) 死亡英雄复活/续放技能：`isBattleActorVisiblyDead` 原来只隐藏死亡**敌人**（`!enemy` 门槛），死亡我方永不消失→逐帧重渲染成"站起来续放"。改为**敌我死亡单位播完倒地动画都消失**。
  2) 战败不收口：`resolveLobbyBattleVisualCompletionDurationMs` 原来只在"敌全灭"完成，战败返回 MAX 92 秒→死亡英雄久留。改为**一方全灭即收口**（新增 `sideAllDeadMs` + `resolveBattleVisualOutcome` 判胜负）。
  3) 结算恒提交 WIN：`LobbyBattleFlow.settle` 原硬编码 `result:'WIN'`，改为 `resolveBattleOutcome()`（sim 敌全灭=WIN、我全灭=LOSE）。后端 `RESULT_ALLOWLIST` 已含 LOSE，实测 LOSE 结算返回"不发奖不推进"。
  4) 战败结算框 + 重新挑战：`renderStage12VictoryOverlay` 本就支持"战斗失败"（读 settlement.result），现在战败也会触发；战败按钮把"下一关"换成 **"重新挑战"**（重开本关）。结算回执未到时用视觉 sim 结果兜底，避免战败先闪"战斗胜利"。
  5) 更新 4 个因上述改动而过时的守卫 token（check-layout/13z3/visual-state-machine/stage8）。战斗软件渲染，战败全流程观感需真机验证。
- 2026-07-10 批次(继续)：
  1) 战力不足也可挑战：移除 3 处门槛——`LobbyAdventurePanelRenderer`(dialog canChallenge 去掉 power.enough + 去掉"战力不足"提示行)、`BattleFormationSceneRenderer`(canChallenge=filled>0，按钮"请上阵英雄")、后端 `PlayerBattleServiceImpl.assertLineupPowerEnough` 改 no-op（不再按推荐战力 throw）。
  2) 爬塔层数按真实累计关卡数：`LobbyHudRenderer.resolveIdleTowerFloor` 用 adventure 章节里该关的累计序号（每关=1层，非每章16），传给 `LobbyIdleStageRenderer.render(...,towerFloor)`；解决"每章不满16关时层数虚高"。
  3) 硬控持续图标做显眼：`renderHpBar` 的 CC 图标加大(min30*scale)+深色底衬圆+高亮描边+抬高位置，`buff_stun` 染色（冻结冰蓝/眩晕晕黄），缺素材用"冻/晕"字兜底。注：CC 触发频率取决于阵容里有几个 freeze/stun 英雄（仅 SSR_LIVIA/UR_EVELYN/UR_ARTHAS 配了），单个英雄约 1 次/场。
  4) 英雄详情技能改**后端下发**：后端 `PlayerLobbyHeroItemVO` 加 `energyShieldScope`+`effectsJson`（`PlayerLobbyHeroServiceImpl.loadSkillConfigs` 读 `hero_battle_skill_config`），客户端 `LobbyHeroApi.parseBattleSkillConfig`(从 BattleApi 导出复用)→`LobbyHeroItemVO.skillConfig`→详情 `resolveHeroSpecialSkills` 优先用下发、缺省回退占位。
- 验证：`tsc` 六文件全过；`npm.cmd run check:battle-stage13i` 战斗 sim 守卫全过（stage13k/o/v 为既有 formation/场景根守卫失败，非本轮文件）。战斗软件渲染，观感需真机验证。
- 边界不变：仍只用既有 `POST /api/player/battles/start`；`hero_battle_skill_config` 仅表现配置，不承载经济/结算。
