# LootChain Cocos Client

LootChain 玩家游戏前端。当前阶段的登录页、UI、按钮、全屏逻辑场景页、输入框、状态提示、背景和动态特效全部在 Cocos Creator 内实现，不再使用 HTML、Vue、CSS 或 H5 作为登录验收路径。

## 当前路线

- Cocos Creator 负责登录页完整内容：背景、粒子、UI、全屏逻辑场景页和 `dev-login` 联调。
- `web-vue` 仅作为历史实验目录保留，不作为当前阶段验收入口；除非用户明确要求，不再修改或运行它。
- 当前流程为 Cocos 登录页 -> 隐藏主角档案检查/静默初始化 -> 资源加载进度页 -> 大厅背景页 + 大厅 HUD。
- 登录成功后先检查服务端隐藏主角档案；新用户未创建时静默调用既有 `POST /api/player/protagonist` 初始化默认档案，不再让玩家选择主角。随后加载 `assets/resources/lobby` 下的大厅资源，资源准备完成后进入大厅背景界面，并展示玩家资料、公告活动、图鉴、英雄、召唤和主线等当前阶段入口。
- 大厅阶段 1 已恢复播放 `assets/resources/lobby/lobby_bg_loop.mp4`；poster 作为首帧兜底，`VideoPlayer.stayOnBottom=true`，视频开始播放后淡出 poster，避免视频层覆盖 HUD。
- 所有叠在背景上的 UI 元素必须使用 `LootChainGameRoot.resolveLayout()` 计算出的舞台安全区定位，不能写死屏幕坐标；`check:layout` 会按多种分辨率校验关键 HUD 不越界。
- 左上玩家信息已按参考图方向深化为徽章式铭牌：头像徽章、EXP 小牌、等级/名称/战力三层排版、名称徽记和暗金细线底纹。
- 左上铭牌返修后，左对齐文字按文本框左边界布局，头像框改为低饱和暗金属风格，不再使用卡通化放射三角。
- 左上铭牌主体已切换为高质量图片资产 `assets/resources/ui/lobby/lobby_player_info_panel.png`，Cocos 只动态覆盖等级、名称、战力和 EXP 文本。
- 大厅 Stage 1A 已将左上铭牌改为参考图式贴近左上角的小边距定位，动态文字限制在头像右侧有效区域内，并增加描边与缩放，提升视频背景上的可读性。
- 英雄列表左侧职业筛选来自只读 `GET /api/player/lobby/heroes/filter-options` 与已加载英雄 `heroClass`；Cocos 现在用规范化职业 key 做选中态和过滤匹配，按钮仍显示配置/接口返回的职业文本，避免文本格式差异导致点击后空列表。

## 2026-06-23 Battle Phase A Impact Upgrade

- 战斗表现层已接入 Phase A 打击反馈：近战保持目标前接触攻击，`damage_float` 命中帧同步触发目标后仰、Hit Stop、Slash VFX、飘字；暴击额外触发红金大号飘字和 Screen Shake。
- 新增纯表现模块 `assets/scripts/scenes/lobby/LobbyBattleImpactDirector.ts`，只计算前端视觉强度，不修改后端协议或战斗结算。
- 新增守卫与验收：`npm.cmd run check:battle-phase-a-impact`、`npm.cmd run screenshot:battle-center`；运行时验收要求 `/settle=0`、命中/飘字同步差小于 `90ms`、暴击存在震屏和大号飘字。
- 详细说明见 `docs/battle/phase-a-impact-upgrade.md`。

## 2026-06-17 Visual Battle Stage 1 Spec Freeze

- 可视化战斗 10 阶段已启动，当前完成第 1 阶段：规格冻结、UI/音效候选清单和只读守卫。
- 新增文档：`docs/battle/stage1-visual-battle-spec.md`、`docs/battle/stage1-asset-audio-inventory.md`。
- 新增守卫：`npm.cmd run check:battle-stage1`，校验规格必备章节、Cocos 当前可复用战斗 UI、外部 C1812 候选路径和经济红线。
- 本阶段不实现运行时战斗动画，不复制或导入 `C:\Users\axian\Desktop\C1812-1` / `C:\Users\axian\Desktop\C1812音效` 外部素材。
- 后续战斗仍只使用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`；本地表现时间轴只用于动画、飘字和音效，不作为奖励、体力、进度或掉落依据。
- 边界不变：不新增持久编队接口，不新增经济写入口，不开放 EX V1、背包 use/sell/batch-use、升星、觉醒、精炼、补发或重结算。

## 2026-06-17 Visual Battle Stage 2 Resource Import

- Stage 2 已导入首批通用战斗表现资源，并新增 `npm.cmd run check:battle-stage2`。
- 新增文档：`docs/battle/stage2-resource-import.md`。
- 新增脚本：`scripts/import-battle-stage2-assets.mjs`、`scripts/check-battle-stage2.mjs`。
- 导入 UI：Boss 血条框/填充、技能目标框、4 个 Buff 图标、受击/地面冲击装饰候选。
- 导入音频：`battle_loop_01.wav`、近战/远程普攻、轻受击候选、技能、治疗、Buff、胜利/失败结算和战斗开始提示。
- 当前只是资源基座；未接入运行时播放、未实现战斗动画、未改后端接口、未新增经济写入口。

## 2026-06-17 Visual Battle Stage 3 Scene Skeleton

- Stage 3 已新增表现快照适配层 `LobbyBattlePresentationSnapshot.ts`，把 `battle start` 回执、只读英雄列表和敌方预览合并为 Cocos 表现快照。
- 新增文档：`docs/battle/stage3-battle-scene-skeleton.md`。
- 新增守卫：`npm.cmd run check:battle-stage3`，校验快照层、Stage 2 资源接入、渲染器骨架和文档边界。
- 战斗页现在消费表现快照渲染左右阵营、前排/后排/首领定位、Boss 血条、目标框、命中装饰和 Buff 托盘。
- Stage 2 音频路径已作为 `stage2AudioCues` 暴露给后续阶段，但本阶段不自动播放 BGM/SFX。
- 本阶段仍不新增后端接口、SQL、持久编队、战斗 AI、技能时间轴、伤害结算或经济写入口；战斗写入仍只走既有 start/settle。

## 2026-06-17 Visual Battle Stage 4 Spine Formation Layer

- Stage 4 已新增 `LobbyBattleUnitSpineRuntime.ts`，集中处理战斗单位 Spine 资源路径、UUID、动画名、缩放和镜像。
- 战斗页 actor 现在会优先用只读英雄队列的 `spineAsset/spineUuid` 渲染 `LobbyBattleActorSpineNode`，播放基础待机动画。
- 无 Spine、加载失败或运行时解析失败时回退 `LobbyBattleActorSpineFallbackSilhouette`；敌方当前仍使用 `LobbyBattleEnemyStandin` 通用 stand-in。
- 新增文档：`docs/battle/stage4-spine-formation-layer.md`。
- 新增守卫：`npm.cmd run check:battle-stage4`，校验 Spine 站位层、兜底剪影、Preview freshness tokens 和阶段边界。
- 本阶段仍不新增后端接口、SQL、持久编队、战斗 AI、技能时间轴、伤害结算、音频自动播放或经济写入口；战斗写入仍只走既有 start/settle。

## 2026-06-17 Visual Battle Stage 5 Deterministic Timeline

- Stage 5 已新增 `LobbyBattlePresentationTimeline.ts`，基于 `serverSeed + battleNo + unitSnapshot` 生成确定性本地表现时间线。
- 时间线事件覆盖开战、入场、回合开始、出手、锁定目标、`damage_preview`、受击、`buff_preview`、回合结束和战斗结束。
- 战斗页新增 `LobbyBattleTimelineEventRail`，并让伤害飘字与 Buff 托盘读取时间线事件，而不是继续使用固定硬编码伤害数字。
- 新增文档：`docs/battle/stage5-deterministic-timeline.md`。
- 新增守卫：`npm.cmd run check:battle-stage5`，校验时间线 helper、渲染器接入、文档和 Preview freshness tokens。
- 本阶段仍不新增后端接口、SQL、持久编队、战斗 AI、权威伤害结算、音频自动播放或经济写入口；本地时间线只用于表现，战斗写入仍只走既有 start/settle。

## 2026-06-17 Visual Battle Stage 6 Actions And Float Text

- Stage 6 已新增 `LobbyBattleActionPresentation.ts`，把 Stage 5 的 `action_start/damage_preview/hit_react` 转换为本地动作 cue。
- 战斗页新增近战短推进、普攻动作、后排远程弹道、伤害飘字和受击飘字表现。
- 渲染器新增 `LobbyBattleActionProjectileLayer`、`LobbyBattleActionFloatingTextLayer` 和 `LobbyBattleMeleeAdvanceGhost`，并让英雄 Spine 在当前 cue 对应时优先播放 `move/attack_01/skill_01/hit` 后回到 `idle`。
- 新增文档：`docs/battle/stage6-actions-and-float-text.md`。
- 新增守卫：`npm.cmd run check:battle-stage6`，校验动作 cue helper、渲染器接入、文档和 Preview freshness tokens。
- 本阶段仍不新增后端接口、SQL、权威伤害结算、音频自动播放或经济写入口；动作与飘字只用于表现，不提交伤害到服务端，战斗写入仍只走既有 start/settle。

## 2026-06-17 Visual Battle Stage 7 Skills And Assist

- Stage 7 已新增 `LobbyBattleAssistPresentation.ts`，把 Stage 5 的 `buff_preview` 转换为本地技能与辅助 cue。
- 战斗页新增施法光环、辅助连线、治疗飘字、护盾飘字、Buff 飘字和敌方 Debuff 飘字表现。
- 渲染器新增 `LobbyBattleAssistAuraLayer`、`LobbyBattleAssistFloatingTextLayer` 和 `LobbyBattleAssistSkillCastRing`，并在辅助 cue 生效时让 Spine 优先播放 `skill_01/heal/shield/hit` 对应兜底动画。
- 新增文档：`docs/battle/stage7-skill-and-assist.md`。
- 新增守卫：`npm.cmd run check:battle-stage7`，校验辅助 cue helper、渲染器接入、文档和 Preview freshness tokens。
- 本阶段仍不新增后端接口、SQL、权威治疗/护盾/Buff 结算、音频自动播放或经济写入口；技能与辅助只用于表现，不提交治疗或护盾到服务端，战斗写入仍只走既有 start/settle。

## 2026-06-17 Visual Battle Stage 8 Settlement And Recovery

- Stage 8 已新增 `LobbyBattleSettlementPresentation.ts`，把现有战斗状态翻译为本地结算链路步骤。
- 战斗页新增 `LobbyBattleStage8SettlementFlowPanel`、`LobbyBattleStage8RecoveryBanner`、`LobbyBattleStage8ReceiptStatus` 和重复点击拦截徽标。
- 本阶段覆盖 `start/settle` 幂等、断线、返回重进、失败兜底和以后端回执结算的前端可见提示。
- 新增文档：`docs/battle/stage8-settlement-and-recovery.md`。
- 新增守卫：`npm.cmd run check:battle-stage8`，校验结算链路 helper、渲染器接入、文档、Preview freshness tokens 和状态机确定性。
- 本阶段仍不新增后端接口、SQL、重结算、补发、客户端胜负推导或经济写入口；战斗写入仍只走既有 start/settle。

## 2026-06-17 Stage 7 Growth Loop Closure

- 本阶段在年度主线 R1-R393 基座上完成 5 环节成长闭环：冒险推荐 -> 本地一次性编队 -> 战力不足拦截 -> 英雄详情升级 -> 回读资源/英雄/背包/冒险 -> 重新进入战斗。
- Cocos 不新增保存阵容接口；编队只在战斗 start 时提交 `stageCode/heroIds/leaderHeroId/requestId`，继续复用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。
- 冒险详情与编队页新增当前阵容战力、推荐战力、差距和达标状态；战力不足时按钮引导到英雄升级，不再让玩家点进必失败的战斗预演。
- 英雄详情只开放 `level-up`，展示金币与英雄经验书持有量；升级成功后按后端 `HeroOperationResultVO` 显示等级、战力和增量，并回读 `me/lobby`、英雄列表、背包和冒险。
- 后端权威战力仍来自 `user_hero.power`；Stage 7 将英雄等级战力系数调为每级 `12%`，并通过 `sql/64_stage7_growth_loop_power_tuning.sql` 调整 R1-R15 推荐战力曲线，让 R1/R2 后首次升级可以打开 R3，后续关卡继续递增难度。
- 已验证：`scripts/smoke-stage7-growth-loop.ps1` 通过，测试账号 `userId=54 / heroId=62` 从 R1/R2 到 R3 升级前拦截、升级后 `9432 -> 10372`、R3 结算并推荐 `MAIN_1_4`；后端相关 `60 tests, 0 failures`；年度守卫通过；Cocos `npm.cmd run check:layout` 通过。
- 当前环境缺口：本机未启动 Cocos Preview，`npm.cmd run check:preview` 返回 `ECONNREFUSED`；打开 Cocos Creator Preview 后需复跑并做视觉验收。
- 边界不变：不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、奖励/体力/进度手写、补发/重结算或其它新经济写入口。

## 2026-06-17 Stage 6S Annual Mainline / 393 Real First Clears

- 当前主线按产品/策划/DB/开发/测试口径升级为年度推进：共 `25` 章 `393` 关，`MAIN_1_1` 至 `MAIN_25_16` 均为一次性真实首通节点。
- 年度顺序：第 1 章 `9` 关；第 2-25 章每章 `16` 关；`R16=MAIN_2_7`，最终 `R393=MAIN_25_16`。
- Cocos 不再维护 R1-R15 枚举白名单，改用同一公式识别 `MAIN_1_1..MAIN_25_16` 与 `REAL_MAINLINE_R1..REAL_MAINLINE_R393`；越界如 `MAIN_25_17` 会被拒绝。
- 客户端仍只调用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，不提交奖励、体力、进度、货币、背包或英雄字段。
- 后端不限制每日真实主线首通次数，也不以体力或等级卡节奏；只要前置进度满足且出战阵容战力达到推荐战力即可继续挑战，重复挑战返回 `NO_REWARD`，不扣体力、不发奖励、不推进主线。
- 新增 SQL/守卫/Smoke：`D:\project\LootChain\sql\63_battle_mainline_year_full_open.sql`、`D:\project\LootChain\scripts\check-battle-mainline-year-config.ps1`、`D:\project\LootChain\scripts\smoke-mainline-year-full-chain.ps1`。
- DB 已提升长期材料堆叠上限：`HERO_EXP_BOOK` 与 `LOW_ENHANCE_STONE` 均为 `999999`，覆盖全年累计首通投放，避免年度链路中后段因背包堆叠上限中断。
- 当前 full-chain smoke 使用 `0` 体力测试账号验证 R1-R393 可连续推进，测试账号 `userId=50 / heroId=58` 最终 `Lv.60 / exp=91450 / stamina=0`，最终关重复挑战为 `NO_REWARD`，`MAIN_25_17` 被拦截。
- 已验证：年度 SQL 导入通过；年度经济守卫通过，含 `annual mainline stamina gate enabled count = 0`、`daily limit text active count = 0`；后端主线/冒险/后台战斗配置/PhaseGate 单测 `67 tests, 0 failures`；`lootchain-game -am -DskipTests compile` 通过；`smoke-mainline-year-full-chain.ps1` 通过；Cocos `npm.cmd run check:layout` 通过；当前 `localhost:7456` 未启动，`npm.cmd run check:preview` 返回 `ECONNREFUSED`，打开 Cocos Creator Preview 后需要复跑。
- 边界不变：不开放重复刷关经验/掉落、扫荡、随机掉落、副本/Boss、排行奖励、USDT、资金池、EX V1、后台补发/重结算、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼或其它新经济写入口。

## 2026-06-17 Stage 6R MAIN_2_6 / R15 Real First Clear

- 本阶段开放 `MAIN_2_6` 一次性真实首通，Cocos 仍只调用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，不提交奖励、体力、进度、货币或背包字段。
- `BattleApi` 白名单扩展到 `REAL_MAINLINE_R15`，并按 `MAIN_2_6` 精确校验：`PLAYER_EXP 750`、`GOLD 1400`、`LOW_ENHANCE_STONE x6`、`HERO_EXP_BOOK x1`。
- 冒险/战斗入口白名单扩展到 `MAIN_1_1` 至 `MAIN_2_6`；`MAIN_2_7` 是新的只读预热边界，锁定节点只可预览，不能进入编队或创建战斗。
- 正常 R1-R15 后后端应回读 `Lv.15 / exp=5950 / stamina=110`，推荐 `MAIN_2_7`，但 `MAIN_2_7` 必须显示阶段保护，不发奖励、不推进 `MAIN_2_8`。
- 新增 SQL/Smoke：`D:\project\LootChain\sql\62_battle_mainline_main26_first_clear_open.sql`，`D:\project\LootChain\scripts\smoke-stage6r-main26-first-clear.ps1`。
- 验证：后端 Stage 6R smoke 通过，测试账号 `userId=45 / heroId=53`；`MAIN_2_7` stage guard 通过；Cocos `check:layout` 通过；当前 `localhost:7456` 未启动，`check:preview` 返回 `ECONNREFUSED`，需要打开 Creator Preview 后复跑。
- 边界不变：不开放 `MAIN_2_7` 真实结算、`REAL_MAINLINE_R16`、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-17 Stage 6Q MAIN_2_5 / R14 Real First Clear

- 本阶段开放 `MAIN_2_5` 一次性真实首通，Cocos 仍只调用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，不提交奖励、体力、进度、货币或背包字段。
- `BattleApi` 白名单扩展到 `REAL_MAINLINE_R14`，并按 `MAIN_2_5` 精确校验：`PLAYER_EXP 700`、`GOLD 1300`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`。
- 冒险/战斗入口白名单扩展到 `MAIN_1_1` 至 `MAIN_2_5`；`MAIN_2_6` 是新的只读预热边界，锁定节点只可预览，不能进入编队或创建战斗。
- 正常 R1-R14 后后端应回读 `Lv.14 / exp=5200 / stamina=116`，推荐 `MAIN_2_6`，但 `MAIN_2_6` 必须显示阶段保护，不发奖励、不推进 `MAIN_2_7`。
- 新增 SQL/Smoke：`D:\project\LootChain\sql\61_battle_mainline_main25_first_clear_open.sql`，`D:\project\LootChain\scripts\smoke-stage6q-main25-first-clear.ps1`。
- 验证：后端 Stage 6Q smoke 通过，测试账号 `userId=44 / heroId=52`；`MAIN_2_6` stage guard 通过；Cocos `check:layout` 通过；当前 `localhost:7456` 未启动，`check:preview` 返回 `ECONNREFUSED`，需要打开 Creator Preview 后复跑。
- 边界不变：不开放 `MAIN_2_6` 真实结算、`REAL_MAINLINE_R15`、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-17 Stage 6P MAIN_2_4 / R13 Real First Clear

- 本阶段开放 `MAIN_2_4` 一次性真实首通，Cocos 仍只调用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，不提交奖励、体力、进度、货币或背包字段。
- `BattleApi` 白名单扩展到 `REAL_MAINLINE_R13`，并按 `MAIN_2_4` 精确校验：`PLAYER_EXP 650`、`GOLD 1200`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`。
- 冒险/战斗入口白名单扩展到 `MAIN_1_1` 至 `MAIN_2_4`；`MAIN_2_5` 仍为只读预热，锁定节点只可预览，不能进入编队或创建战斗。
- 正常 R1-R13 后后端应回读 `Lv.13 / exp=4500 / stamina=122`，推荐 `MAIN_2_5`，但 `MAIN_2_5` 必须显示阶段保护，不发奖励、不推进 `MAIN_2_6`。
- 验证：后端 Stage 6P smoke 通过，测试账号 `userId=43 / heroId=51`；`MAIN_2_5` stage guard 通过；Cocos `check:layout` 通过；当前 `localhost:7456` 未启动，`check:preview` 返回 `ECONNREFUSED`，需要打开 Creator Preview 后复跑。
- 边界不变：不开放 `MAIN_2_5` 真实结算、`REAL_MAINLINE_R14`、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-17 Stage 6O MAIN_2_4 Readonly Prewarm

- 本阶段不开放 `R13 / MAIN_2_4` 真实首通，真实结算仍停在 `MAIN_2_3 / REAL_MAINLINE_R12`。
- `MAIN_2_4` 只作为 R12 后的推荐预览：不创建战斗、不扣体力、不发奖励、不推进 `MAIN_2_5`，活跃 `battle_reward_rule=0`，`REAL_MAINLINE_R13/PHASE6_REAL_BATTLE_R13/R13_*` 活跃配置计数为 `0`。
- 新增并本地导入 `D:\project\LootChain\sql\59_battle_mainline_main24_readonly_prewarm.sql`；后台掉落预览新增三条 no-grant 展示行：玩家经验、金币、装备材料。
- Cocos 冒险页新增前端真实战斗入口白名单，只允许 `MAIN_1_1` 至 `MAIN_2_3` 进入编队/战斗；锁定或未进入白名单的节点只可预览。R12 后旧本地选择停在 `MAIN_2_3` 时，详情优先切到推荐锁定的 `MAIN_2_4`。
- 验证：后端相关 `45 tests, 0 failures`；`PlayerApiPhaseGateTest` `3 tests, 0 failures`；经济守卫通过；Stage 6N/6O smoke 通过，测试账号 `userId=42 / heroId=50`；`MAIN_2_4` stage guard 通过，前后 `battle_session=0`；Cocos `check:layout` 通过。
- 当前环境缺口：未找到本机 Creator 3.8.8 `tsc.cmd`；`check:preview` 因 `http://localhost:7456` 未启动返回 `ECONNREFUSED`，打开 Cocos Creator Preview 后需要复跑。
- 边界不变：不开放 `MAIN_2_4` 真实结算、`REAL_MAINLINE_R13`、`MAIN_2_5` 推进、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-17 Stage 6N MAIN_2_3 R12 First Clear

- 本阶段开放 `MAIN_2_3` 一次性真实首通，仍不新增玩家经济接口、不开放重复刷关或 `MAIN_2_4`。
- `MAIN_2_3` 首通走 `REAL_MAINLINE_R12`，固定扣体力 `6`，发放 `PLAYER_EXP 600`、`GOLD 1100`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`，正常 R1-R12 后达到 `Lv.12 / exp=3850 / stamina=128`。
- 后端 `GET /api/player/lobby/adventure` 在 R12 后推荐 `MAIN_2_4`，但必须返回 `unlocked=false`、`lockReasonCode=PHASE_LOCKED`、活跃奖励规则为 `0`。
- Cocos `BattleApi` 白名单扩展到 `REAL_MAINLINE_R12`，并按 `MAIN_2_3` 精确校验奖励；冒险页底部说明为 `MAIN_1_1` 至 `MAIN_2_3` 首通真实结算，`MAIN_2_4` 只读预热。
- 新增 SQL/Smoke：`D:\project\LootChain\sql\58_battle_mainline_main23_first_clear_open.sql`，`D:\project\LootChain\scripts\smoke-stage6n-main23-first-clear.ps1`。
- 验证：后端相关 `45 tests, 0 failures`；经济守卫通过；Stage 6N smoke 通过，测试账号 `userId=40` 完成 R1-R12 后 `Lv.12 / exp=3850 / stamina=128`；`MAIN_2_4` stage guard 通过；Cocos `check:layout` 通过。
- 当前环境缺口：未找到本机 Creator 3.8.8 `tsc.cmd`，定向 TypeScript no-emit 未执行；`http://localhost:7456` 未启动，`check:preview` 返回 `ECONNREFUSED`；打开 Cocos Creator Preview 后需要复跑。
- 边界不变：不开放 `MAIN_2_4` 真实结算、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-15 Stage 6M MAIN_2_2 R11 First Clear

- 本阶段开放 `MAIN_2_2` 一次性真实首通，仍不新增玩家经济接口、不开放重复刷关或 `MAIN_2_3`。
- `MAIN_2_2` 首通走 `REAL_MAINLINE_R11`，固定扣体力 `6`，发放 `PLAYER_EXP 550`、`GOLD 1000`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`，正常 R1-R11 后达到 `Lv.11 / exp=3250`。
- 后端 `GET /api/player/lobby/adventure` 在 R11 后推荐 `MAIN_2_3`，但必须返回 `unlocked=false`、`lockReasonCode=PHASE_LOCKED`、活跃奖励规则为 `0`。
- Cocos `BattleApi` 白名单扩展到 `REAL_MAINLINE_R11`，并按 `MAIN_2_2` 精确校验奖励；冒险页底部说明为 `MAIN_1_1` 至 `MAIN_2_2` 首通真实结算，`MAIN_2_3` 只读预热。
- 新增 SQL/Smoke：`D:\project\LootChain\sql\57_battle_mainline_main22_first_clear_open.sql`，`D:\project\LootChain\scripts\smoke-stage6m-main22-first-clear.ps1`。
- 验证：后端相关 48 tests 0 failures；经济守卫通过；Stage 6M smoke 通过，测试账号 `userId=39` 完成 R1-R11 后 `Lv.11 / exp=3250 / stamina=134`；`MAIN_2_3` stage guard 通过；Cocos `check:layout` 与定向 TypeScript no-emit 通过。
- Preview 注意：本轮 `http://localhost:7456` 未启动，`check:preview` 返回 `ECONNREFUSED`；打开 Cocos Creator Preview 后需要复跑。
- 边界不变：不开放 `MAIN_2_3` 真实结算、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-14 Stage 6L MAIN_2_1 Lv10 Preheat

- 本阶段不开放 R11；`MAIN_2_2` 只作为 R1-R10 后的推荐详情与后续章节预热展示。
- `MAIN_2_1` 首通仍走 `REAL_MAINLINE_R10`，基础奖励保留 `PLAYER_EXP 450`，同一首通事务追加 `第二章预热经验 PLAYER_EXP 500`，正常 R1-R10 后达到 `Lv.10 / exp=2700`。
- 后端 `GET /api/player/lobby/adventure` 在 R10 后应推荐 `MAIN_2_2`，但仍返回 `unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`levelGap=0`、`expToRequiredLevel=0`。
- `MAIN_2_2` 奖励项全部是 no-grant 文案：`玩家经验（预览，不发放）`、`金币（预览，不发放）`、`装备材料（预览，不发放）`；不配置活跃 `battle_reward_rule`。
- Cocos 冒险详情优先展示推荐的锁定 `MAIN_2_2`，不再回退到旧已解锁关卡；奖励标题为 `奖励只读预览（当前不发放）`，阶段保护按钮为 `仅预览`，底部说明强调不创建战斗或奖励。
- 新增 SQL/守卫：`D:\project\LootChain\sql\56_battle_mainline_stage6l_lv10_prewarm.sql`，`check-battle-r1-economy-config.ps1` 增加 Stage 6L 预热经验规则和 `MAIN_2_2` display-only/preview-only/经济写开关关闭校验。
- 验收口径：后端冒险/战斗测试、经济守卫、6L smoke、`MAIN_2_2` stage guard、Cocos `check:layout`、TypeScript no-emit 与 `check:preview` 均需通过；Preview 若出现旧 chunk，先让 Cocos Creator 前台刷新再硬刷新浏览器。
- 边界不变：不开放 `MAIN_2_2` 真实结算、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-14 Stage 6J Runtime Preview And MAIN_2_2 Guard

- 本阶段不开放新玩法；目标是补强 R1-R10 后 `MAIN_2_2` 的阶段保护与 Preview 验收可靠性。
- 后端新增 `MAIN_2_2` 强制启动回归测试：请求在冒险查询、阵容读取和会话创建前被 `关卡暂未开放` 阻断。
- DB 经济守卫新增 `MAIN_2_2` 校验：必须为 `PHASE5_READONLY/status=1/display-only/preview-only`，且活跃 `battle_reward_rule` 数量为 `0`。
- `check-preview-freshness.mjs` 补充 Preview target 缺失、chunk 缺失和 scoped dependency 映射缺失诊断；本机通过让 Creator 前台刷新并同步同轮 preview chunks/scopes 恢复 `http://localhost:7456/`。
- 验收：`npm.cmd run check:layout` 通过，`npm.cmd run check:preview` 通过；浏览器打开 Preview 后无 SystemJS 错误、控制台 error 为 `0`、canvas 已挂载可见；后端保护 smoke 确认强制 `MAIN_2_2` 不写 `battle_session`。
- 边界不变：不开放 `MAIN_2_2` 真实结算、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-14 Stage 6I MAIN_2_1 Second-Chapter Entry

- 本阶段开放 `MAIN_2_1` 一次性主线首通，继续复用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，不新增玩家侧经济写接口。
- R10 首通固定消耗/奖励：扣体力 `6`，发放 `PLAYER_EXP 450`、`GOLD 900`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，结算模式 `REAL_MAINLINE_R10`，推进/推荐 `MAIN_2_2`。
- Cocos `BattleApi` 白名单扩展为 `REAL_MAINLINE_R1` 至 `REAL_MAINLINE_R10`，并按 `MAIN_2_1` 精确校验奖励；客户端仍不提交奖励、体力、进度、货币或背包字段。
- `MAIN_2_2` 仍为阶段保护：冒险页可推荐展示，但 `unlocked=false`，启动被后端阻断，重复 `MAIN_2_1` 结算为 `NO_REWARD`。
- 新增 SQL/Smoke：`D:\project\LootChain\sql\54_battle_mainline_main21_first_clear_open.sql`、`D:\project\LootChain\scripts\smoke-stage6i-main21-first-clear.ps1`；经济守卫已升级为 R1-R10。
- 最新接口闭环结果：测试玩家 `userId=29` / `heroId=37` 完成 R1-R10，经验 `0 -> 2200`，等级 `1 -> 9`，体力 `200 -> 140`，金币 `6500`，`LOW_ENHANCE_STONE=18`，`HERO_EXP_BOOK=6`；`MAIN_2_2` 启动阻断，重复 `MAIN_2_1` 为 `NO_REWARD`，临时账号提升到 Lv.10 后 `MAIN_2_2` 仍锁定。
- 边界：不开放 `MAIN_2_2` 真实结算、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-14 Stage 6H Growth Bridge To Lv.8

- 本阶段开放 `MAIN_1_4` 至 `MAIN_1_9` 一次性主线首通成长桥，继续复用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。
- R1-R9 首通总经验达到 `1750`，后端自动回写玩家 Lv.8；`MAIN_2_1` 因等级/进度达成而解锁，但第二章真实结算仍关闭。
- Cocos `BattleApi` 白名单扩展为 `REAL_MAINLINE_R1` 至 `REAL_MAINLINE_R9`，并按关卡精确校验奖励；客户端仍不提交奖励、体力、进度、货币或背包字段。
- 冒险地图改为围绕当前推荐/选中关卡显示窗口，新增到 `MAIN_1_9` 后窄屏和桌面都不会只显示早期关卡。
- 新增 smoke：`D:\project\LootChain\scripts\smoke-stage6h-growth-bridge-to-lv8.ps1`；最新结果 `userId=25`，经验 `0 -> 1750`，等级 `1 -> 8`，`MAIN_2_1.unlocked=true`，`MAIN_2_1` 结算为 `NO_REWARD`。
- 验证：后端相关 71 tests 0 failures；经济守卫、6H smoke、Cocos `check:layout`、focused TypeScript no-emit、`check:preview` 均通过。
- 边界：不开放 `MAIN_2_1` 真实结算、重复刷关经验/掉落、任务/成就领奖、体力领取/购买、背包 use/sell/batch-use、升星、觉醒、精炼、USDT、资金池或 EX V1。

## 2026-06-14 Stage 6G Adventure Next-Step Readonly Guidance

- 本阶段继续保持只读，不开放 `MAIN_2_1` 战斗或结算，不新增玩家经验、体力、奖励、背包、任务或进度写入口。
- `GET /api/player/lobby/adventure` stage 新增 `nextGuidanceTitle`、`nextGuidanceText`、`growthSourceSummary`、`growthSourceStatus`、`growthSourceHint`、`repeatableExpAvailable`，用于说明锁定后下一步和当前经验来源状态。
- 当前 `MAIN_2_1` 在 Lv.2 / 190 EXP 下返回 `growthSourceStatus=FIRST_CLEAR_USED_UP`、`repeatableExpAvailable=false`；Cocos 冒险详情底部显示“首通经验已用完；暂无重复经验入口。”。
- 新增 smoke：`D:\project\LootChain\scripts\smoke-stage6g-adventure-next-step-readonly.ps1`；最新结果 `userId=24`，`recommendedStageCode=MAIN_2_1`、`main21Unlocked=false`、`main21GrowthSourceStatus=FIRST_CLEAR_USED_UP`、`battleSessionRowsCreated=0`。
- 验证：后端相关 27 tests 0 failures；6E/6F 只读 smoke 与 6G smoke 均通过；Cocos `check:layout`、`check:preview` 和 directed TypeScript no-emit 通过。

## 2026-06-14 Stage 6E Level Progress Readability

- 本阶段不开放新关卡、不新增经济写入口；只补齐玩家等级/经验进度和 `MAIN_2_1` 锁定原因的可读性。
- `GET /api/player/me/lobby` 新增只读 `levelProgress`，由后端按 `game_user.exp/player_level` 与 `user_level_config.need_exp` 计算，包含当前等级门槛、下一等级、距离下一级经验、百分比、当前英雄等级上限和下一等级解锁说明。
- `GET /api/player/lobby/adventure` 的每个 stage 新增 `unlockHint`；完成 R1/R2/R3 后推荐 `MAIN_2_1`，但返回 `unlocked=false`，提示需要 Lv.8、当前 Lv.2。
- Cocos 左上铭牌 EXP 小牌显示百分比，玩家资料页显示 `当前经验/下一级门槛`、下一级差距和英雄等级上限，冒险详情显示后端 `unlockHint`；冒险页过期“无奖励/当前不发放”文案已更新为 R1/R2/R3 首通白名单结算口径。
- 新增 smoke：`D:\project\LootChain\scripts\smoke-stage6e-level-progress-readonly.ps1`；最新本机结果 `userId=19`，`playerLevel=2`、`exp=190`、`expToNextLevel=60`、`progressPercent=60`、`recommendedStageCode=MAIN_2_1`、`main21Unlocked=false`。
- 验证：后端 `PlayerLobbyProfileServiceTest,PlayerLobbyAdventureServiceImplTest,PlayerBattleServiceImplTest` 共 26 tests 0 failures；Cocos `npm.cmd run check:layout` 与 `npm.cmd run check:preview` 通过；Preview 加载 `http://localhost:7456/` 后控制台 error 为空。

## 2026-06-14 Stage 6F Locked Stage Gap Readability

- 本阶段继续保持只读，不开放 `MAIN_2_1` 战斗或结算；在 Stage 6E 的 `unlockHint` 基础上补结构化锁定差距字段。
- `GET /api/player/lobby/adventure` stage 新增 `lockReasonCode`、`levelGap`、`requiredLevelNeedExp`、`expToRequiredLevel`。当前 `MAIN_2_1` 在 Lv.2 / 190 EXP 下返回 `LEVEL_REQUIRED`、还差 `6` 级、距 Lv.8 阈值还差 `1560` EXP。
- Cocos 冒险详情新增“距离要求：6 级 / 1560 EXP”，避免玩家把 Lv.2 到 Lv.3 的 `60 EXP` 误认为 `MAIN_2_1` 解锁差距。
- 同一 smoke 已升级验证 6F 字段；最新结果 `userId=20`，`main21LockReasonCode=LEVEL_REQUIRED`、`main21LevelGap=6`、`main21ExpToRequiredLevel=1560`。
- 验证：后端相关 26 tests 0 failures；`npm.cmd run check:layout` 与 `npm.cmd run check:preview` 通过。

## 2026-06-14 Stage 6D Player Level Auto-Growth

- 本阶段不扩大 R1/R2/R3 战斗开放范围，不开放 `MAIN_2_1` 真实结算；只补齐主线首通玩家经验到账后的玩家等级成长。
- 后端 `PlayerBattleServiceImpl` 在 R1/R2/R3 首通事务内按累计经验回写 `game_user.player_level`，等级来自 `user_level_config.need_exp`；完整 R1+R2+R3 后玩家经验 `190`，等级应为 `2`。
- Cocos 不新增接口、不提交等级/经验字段；战斗后沿用既有刷新，回读 `GET /api/player/me/lobby` 与 `GET /api/player/lobby/adventure` 展示 `Lv.2`。
- 新增可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6d-player-levelup.ps1`，覆盖 `playerExp 0 -> 50 -> 110 -> 190`、`playerLevel 1 -> 1 -> 2 -> 2` 和 `MAIN_2_1` 启动不写 `battle_session`。
- 边界不变：不开放玩家手动升级、升级奖励领取、体力领取/购买、重复刷关掉落、副本、Boss、排行、扫荡、USDT、资金池、EX V1、背包 use/sell/batch-use、升星、觉醒、精炼或其它新经济写入口。

## 2026-06-14 Stage 6C MAIN_1_3 R3 Settlement And Hero Level-Up

- 当前战斗开放范围为 `MAIN_1_1` R1、`MAIN_1_2` R2 和 `MAIN_1_3` R3 首通真实结算；Cocos 仍只调用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，客户端不提交奖励、掉落、体力、主线进度、货币或背包字段。
- R3：`MAIN_1_3` 首次 `WIN`，扣体力 `6`，发放 `PLAYER_EXP 80`、`GOLD 1200`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，结算模式 `REAL_MAINLINE_R3`，推进 `MAIN_2_1` 推荐展示。
- 英雄成长仍仅开放 `POST /api/player/heroes/{heroId}/level-up`。R3 奖励用于支撑英雄 2→3；`star-up/awaken/refine` 仍关闭。
- 新增后端 SQL：`D:\project\LootChain\sql\52_battle_mainline_r3_levelup_open.sql`；`check-battle-r1-economy-config.ps1` 已升级为 R1/R2/R3 经济守卫；新增可复跑 smoke `D:\project\LootChain\scripts\smoke-stage6c-r3-levelup.ps1`。
- Cocos `BattleApi` 已扩展为 `NO_REWARD`/`REAL_MAINLINE_R1`/`REAL_MAINLINE_R2`/`REAL_MAINLINE_R3`，按关卡精确校验奖励白名单；结果页把 R3 视为真实首通回执展示。
- 本机接口闭环 smoke 已通过：测试玩家 `userId=13` / `heroId=30` 完成 R1、R2、英雄 1→2、R3 和英雄 2→3，体力 `100 -> 82`、玩家经验 `0 -> 190`、金币 `1100 -> 300 -> 1500 -> 412`、`HERO_EXP_BOOK 1 -> 0 -> 1 -> 0`、英雄等级 `1 -> 2 -> 3`；`MAIN_2_1` 强制启动返回 `code=1000` 且未写入 `battle_session`。
- 边界不变：不开放 `MAIN_2_1` 真实结算、重复刷关掉落、副本、Boss、排行、扫荡、USDT、资金池奖励、EX V1、后台补发/重结算、背包 use/sell/batch-use、升星、觉醒、精炼或其它新经济写入口。

## 2026-06-14 Stage 6B MAIN_1_2 R2 Settlement And Hero Level-Up

- 当前战斗开放范围为 `MAIN_1_1` R1 与 `MAIN_1_2` R2 首通真实结算；Cocos 仍只调用既有 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`，客户端不提交奖励、掉落、体力、主线进度、货币或背包字段。
- R1：`MAIN_1_1` 首次 `WIN`，扣体力 `6`，发放 `PLAYER_EXP 50`、`GOLD 300`、`LOW_ENHANCE_STONE x2`，结算模式 `REAL_MAINLINE_R1`，推进 `MAIN_1_2`。
- R2：`MAIN_1_2` 首次 `WIN`，扣体力 `6`，发放 `PLAYER_EXP 60`、`GOLD 800`、`LOW_ENHANCE_STONE x2`、`HERO_EXP_BOOK x1`，结算模式 `REAL_MAINLINE_R2`，推进 `MAIN_1_3`，刚好支撑英雄 1→2 首次升级。
- 英雄成长仅开放 `POST /api/player/heroes/{heroId}/level-up`。Cocos 只在英雄详情页提供 `升级` 按钮，成功后回读玩家资料、英雄列表和背包；`star-up/awaken/refine` 仍关闭。
- 新增后端 SQL：`D:\project\LootChain\sql\51_battle_mainline_r2_levelup_open.sql`；`check-battle-r1-economy-config.ps1` 已升级为 R1/R2 经济守卫；新增可复跑 smoke `D:\project\LootChain\scripts\smoke-stage6b-r2-levelup.ps1`。
- 本机接口闭环 smoke 已通过：测试玩家 `userId=10` / `heroId=27` 完成 R1、R2 和一次 `level-up`，体力 `100 -> 88`、玩家经验 `0 -> 110`、金币 `1100 -> 300`、`HERO_EXP_BOOK 1 -> 0`、英雄等级 `1 -> 2`；`star-up/awaken/refine` 被阻断，`MAIN_1_3` 强制启动返回 `code=1000` 且未写入 `battle_session`。
- 边界不变：不开放 `MAIN_1_3` 真实结算、重复刷关掉落、副本、Boss、排行、扫荡、USDT、资金池奖励、EX V1、后台补发/重结算、背包 use/sell/batch-use、升星、觉醒、精炼或其它新经济写入口。

## 2026-06-12 Stage 6A MAIN_1_1 R1 First-Clear Settlement

- 当前战斗从历史 no-reward 预演推进到 R1 主线首通真实结算，但只开放 `MAIN_1_1` 首次 `WIN`。
- Cocos 仍只调用既有玩家端接口：`POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`；客户端不提交奖励、掉落、体力、主线进度、货币或背包字段。
- 后端 R1 固定消耗/奖励：`staminaCost=6`、`PLAYER_EXP=50`、`GOLD=300`、`LOW_ENHANCE_STONE=2`，结算模式为 `REAL_MAINLINE_R1`，首通后推荐/解锁 `MAIN_1_2`。
- Cocos `BattleApi` 只接受 `NO_REWARD` 与 `REAL_MAINLINE_R1`，并拦截 `USDT/HERO/HERO_FRAGMENT/DIAMOND/BOUND_DIAMOND/STAMINA/EX_*` 等未开放奖励资源。
- 战斗结算页展示后端权威回执：奖励摘要、体力变化、主线进度；返回大厅后刷新资料、冒险、最近战斗和背包只读数据。
- 新增后端 SQL/守卫：`D:\project\LootChain\sql\45_battle_real_mainline_r1.sql` 与 `D:\project\LootChain\scripts\check-battle-r1-economy-config.ps1`。
- 新增并跑通 R1 接口 smoke：`D:\project\LootChain\scripts\smoke-battle-r1-mainline-settlement.ps1`；本机一次性测试玩家 `userId=5` 首通后体力 `100 -> 94`、经验 `0 -> 50`、金币 `300`、`LOW_ENHANCE_STONE=2`、冒险推荐 `MAIN_1_2`，同一 settle requestId 重放未二次写入。
- 边界不变：不开重复刷关掉落、副本、Boss、排行、扫荡、USDT、资金池奖励、EX V1、后台补发/重结算、背包 use/sell/batch-use、英雄养成或其他新经济写入口。

## 2026-06-11 Stage 4HE Gacha Price Model And C1812 Summon UI

- 当前抽卡价格模型：
  - `限定召唤`: 限定契约券 1/10 优先，不足时钻石 300/3000；
  - `英雄召唤`: 英雄契约券 1/10 优先，不足时钻石 280/2800；
  - `普通召唤`: 普通契约券 1/10 优先，不足时绑定钻石 80/800。
- Cocos 真实抽卡请求现在发送 `paymentMode='AUTO'`，仍只走现有 `POST /api/player/gacha/draw`。
- 普通召唤保持 R/SR-only，并使用 `BASIC_RS_ONLY` 空保底组；`HERO_BASE` 的 `SSR=80`、`UR=180` 只适用于限定/英雄召唤。
- 召唤页已接入从 `C:\Users\axian\Desktop\C1812-1` 筛选的 UI 切图到 `assets/resources/ui/gacha/c1812`，用于中心地台、法阵、揭示卡框和结果奖励槽。
- Verification: economy guard passed, targeted gacha Maven tests `25 tests, 0 failures`, AUTO low-balance smoke passed for all three real pools with no persistence, `npm.cmd run check:layout` passed, and directed Cocos TypeScript no-emit passed.
- Preview note: after reboot, `http://localhost:7456` is not serving Cocos Preview, so `npm.cmd run check:preview` currently fails with `ECONNREFUSED`; start/refresh Creator Preview before visual acceptance.

## 2026-06-13 Stage 4HG Permanent Pool No-UR And Limited First UR Pair

- 后端卡池条目已在 V1 基线上按用户要求继续调整：
  - `BASIC_CONTRACT_PREVIEW`：6R + 6SR，权重均 `100`，不含 SSR/UR；
  - `NORMAL_HERO`：6R + 6SR + 4SSR，权重均 `100`，不含 UR；
  - `LIMITED_ABYSS_PREVIEW`：6R + 6SR + 4SSR + 2UR，UR 只保留第一版 `UR_ARTHAS` 与 `UR_EVELYN`，权重各 `500`。
- 当前有效概率：
  - `LIMITED_ABYSS_PREVIEW`：`R=0.576000`、`SR=0.384000`、`SSR=0.036000`、`UR=0.004000`；
  - `NORMAL_HERO`：`R=0.576000`、`SR=0.384000`、`SSR=0.040000`，无 active UR rate；
  - `BASIC_CONTRACT_PREVIEW`：`R=0.600000`、`SR=0.400000`，SSR/UR rate、reward item 和 duplicate config 均为非活跃。
- `NORMAL_HERO` 已切到 `HERO_PERMANENT_SSR_ONLY`，只保留 `SSR=80` 保底；`HERO_BASE` 的 `SSR=80`、`UR=180` 只适用于限定召唤。
- 历史 `BASIC_CONTRACT_PREVIEW config_version=2` 及三池非 v1 子配置已禁用，避免后端优先选择旧 SSR 占位池。
- Cocos 召唤页的 `奖池内容`、`概率保底` 和真实抽卡均以后端返回为准；普通召唤现在应显示完整 6R+6SR，而不是旧的 2R+2SR。
- 新增/同步后端 SQL 与守卫：
  - `D:\project\LootChain\sql\47_gacha_pool_item_v1_baseline.sql`;
  - `D:\project\LootChain\sql\48_gacha_normal_no_ur_limited_first_ur_pair.sql`;
  - `D:\project\LootChain\sql\07_gacha_module.sql`;
  - `D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`;
  - `D:\project\LootChain\sql\37_basic_contract_rs_only_box_summon_display.sql`;
  - `D:\project\LootChain\scripts\check-gacha-economy-config.ps1`.
- 边界不变：Cocos 仍只走现有 `POST /api/player/gacha/draw`；不开放 EX V1、exchange/reissue、bag use/sell/batch-use、hero growth、reward/stamina/progress write 或新增经济写入口。

## 2026-06-13 Stage 4HH Gacha Pool Content Scroll Fix

- 限定池 `奖池内容` 弹层此前只渲染面板可见的前 14 行，并提示“后续补滚动列表”，导致当前 18 条 active 奖池内容中的后 4 条（剩余 SSR/UR）看不到。
- `GachaSceneRenderer` 已将右侧功能弹层列表改为 `ScrollView + Mask`，奖池内容不再 `.slice(0, 22)` 截断；后端返回的全部 active item 都会渲染到滚动内容里，超出面板高度时拖动查看。
- 只读接口复核 `LIMITED_ABYSS_PREVIEW` 当前 active item = 18：`R=6, SR=6, SSR=4, UR=2`，UR 为 `UR_ARTHAS` 与 `UR_EVELYN`。
- Verification: `npm.cmd run check:layout` passed, `npm.cmd run check:preview` passed after focusing Cocos Creator, and `git diff --check` passed with LF/CRLF warnings only. Playwright visual pass: opened `http://127.0.0.1:7456/`, logged in, opened limited pool `奖池内容`, scrolled the modal, and confirmed all 4 SSR plus 2 UR rows are visible.
- No backend gacha config, rates, pity, costs, draw API, or economy writes changed.

## 2026-06-10 Stage 4HD Normal Summon R/SR Only And Box Summon Spine

- 用户要求：普通召唤移除 SSR/UR 级别英雄，并使用 `assets/resources/spine/gacha/box_summon` 作为召唤界面中心骨骼，尺寸与其他两个真实开放池保持一致。
- 已新增并本地导入 `D:\project\LootChain\sql\37_basic_contract_rs_only_box_summon_display.sql`。
- 当前有效概率：
  - `LIMITED_ABYSS_PREVIEW`：`R=0.576000`、`SR=0.384000`、`SSR=0.036000`、`UR=0.004000`；
  - `NORMAL_HERO`：`R=0.576000`、`SR=0.384000`、`SSR=0.040000`，无 active UR rate；
  - `BASIC_CONTRACT_PREVIEW`：`R=0.600000`、`SR=0.400000`，SSR/UR rate、reward item 和 duplicate config 均为非活跃。
- `BASIC_CONTRACT_PREVIEW.centerSpineResource=spine/gacha/box_summon/boxman_text`，`centerSpineUuid=3a0e1b57-8392-4f08-83ce-31ce91d26481`；Cocos 已为 `box_summon` 生成 meta，并将 `252.spine` 源文件移至 `docs/spine-source-archive/gacha/box_summon/252.spine`。
- `GachaSceneRenderer` 对普通召唤继续使用和限定池相同的中心舞台缩放逻辑；仅英雄召唤保留额外落点偏移，因此普通召唤尺寸与其他非英雄中心骨骼一致。
- 后端守卫 `check-gacha-economy-config.ps1` 现在要求普通召唤只有 R/SR 两个活跃概率、无活跃 SSR/UR 奖励项、中心 Spine 为 `box_summon`，且不复用限定/英雄中心 Spine。
- 边界不变：Cocos 仍只通过现有 `POST /api/player/gacha/draw` 抽卡；不开放 EX V1、exchange/reissue、bag use/sell/batch-use、hero growth、reward/stamina/progress write 或新增经济写入口；本阶段未充值、未做成功真实抽卡。

## 2026-06-10 R/SR NPC Hero Card Scale

- R/SR 英雄卡牌背景 `ui/hero-roster/card_background/npc_*` 在新电脑 Preview 中显示过小，源图透明边界正常，问题来自之前 NPC compact profile 压缩过度。
- `LobbyHeroRosterPanelRenderer` 已将 NPC 卡面目标高度从 `0.42` 调整到 `0.58`，最大高度从 `0.56` 调整到 `0.74`，最大宽度从 `0.82` 调整到 `0.96`。
- 该调整仅影响 R/SR `npc_*` 卡牌背景展示；UR/SSR、Nuu、英雄数据、抽卡经济和任何写入口均未变化。
- 新电脑本地 `profiles/v2/packages/engine.json` 已按项目 spine-3.8 baseline 从 `settings/v2/packages/engine.json` 同步，避免本地 Preview 配置缺模块导致 layout 检查失败。
- Verification: `check:layout`, focused Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, `check:preview`, and `git diff --check` passed.

## 2026-06-10 Stage 4HB Multi-Pool Failure Guard Closure

- 后端低余额失败 smoke `D:\project\LootChain\scripts\smoke-cocos-gacha-draw-guard.ps1` 默认覆盖三个真实开放池：`LIMITED_ABYSS_PREVIEW`、`NORMAL_HERO`、`BASIC_CONTRACT_PREVIEW`。
- 脚本仍会在测试账号余额足够单抽时立即中止，避免误做成功付费抽卡；本阶段不充值、不做新的成功真实抽卡。
- 每个池都会调用现有 `POST /api/player/gacha/draw` 两次，验证低余额失败不会写入 draw/result/reward/currency/hero/fragment/pity 状态，且重试不会停留在“处理中”。
- `SEALED_LIGHT_DARK` 仍保持可见的 locked/display-only 池，不参与该真实抽卡 smoke。
- Verification: three-pool low-balance smoke passed for `userId=4` with `drawLogs=0`, `drawResults=0`, `rewardGrantLogs=0`, and `currencyLogs=0` per pool; economy guard, targeted Maven tests, `check:layout`, focused TypeScript no-emit, `check:preview`, `.spine/.spine.meta` scan, and both repo `git diff --check` passed.
- 边界不变：Cocos 不新增经济写入口；EX V1、exchange/reissue、bag use/sell/batch-use、hero growth、reward/stamina/progress writes 仍关闭。

## 2026-06-10 Stage 4HC Hero Summon Center Spine Fix

- 用户反馈：点击 `英雄召唤` 后，召唤页中心骨骼仍显示限定池的黄风教宗。
- 根因：`NORMAL_HERO` 的后端展示配置 `center_spine_resource` 仍 seed 为 `spine/gacha/huangfengjiaozong/huangfengjiaozong`，与 `LIMITED_ABYSS_PREVIEW` 相同。
- 修复：新增并本地导入 `D:\project\LootChain\sql\36_gacha_hero_center_spine_display_sync.sql`，将 `NORMAL_HERO` 中心 Spine 改为 `spine/gacha/hunka_nima/hunka_nima`，UUID `cd644c64-da4a-4397-8f3b-cdb3ffcbd3c5`。
- 已同步 fresh SQL：`D:\project\LootChain\sql\17_gacha_pool_display_config.sql` 与 `D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`。
- `check-gacha-economy-config.ps1` 已新增守卫，要求 `NORMAL_HERO` 中心 Spine 与限定池不同，防止后续回退。
- Browser self-preview: 刷新 `http://127.0.0.1:7456` 后登录 `userId=4`，进入 `召唤祭坛` 并切到 `英雄召唤`，中心已显示 `hunka_nima` 白发坐姿骨骼；未点击单抽/十连。
- Verification: economy/display guard, three-pool low-balance smoke, targeted Maven suite `35 tests, 0 failures`, `check:layout`, focused TypeScript no-emit, `check:preview`, `.spine/.spine.meta` scan, and both repo `git diff --check` passed.
- 边界不变：仅显示配置调整，不改概率、权重、保底、消耗、奖励、抽卡写路径、EX V1、exchange/reissue、背包写入、英雄养成或任何新增经济写入口。

## 2026-06-10 Controlled Normal Hero Real Draw Closure

- 一次性测试账号 `userId=4 / codex_cocos_draw_20260610140143` 完成 `NORMAL_HERO` 真实单抽闭环。
- 本次只给该测试账号写入 `DIAMOND=280`，未修改 `userId=1` 或长期联调账号余额。
- 请求 `POST /api/player/gacha/draw`：`requestId=codex-cocos-normal-draw-20260610140143`、`drawCount=1`、`useTicket=false`。
- 返回成功：`drawNo=GACHA96a43b72b1734a69a71a613021717f8d`，命中 `SR_WITCH_03 / 契约魔女 / SR`，`grantNo=RWDc334bcee86e34bca953807914ca29c98-19875bc0`。
- 幂等重放同一 requestId 返回同一 `drawNo` / `grantNo`，未二次扣费。
- DB 核对：测试账号钻石 `280 -> 0`；本次 requestId 只有 1 条扣费流水和 1 条 draw log；本次 drawNo 只有 1 条 draw result；奖励日志成功发放 HERO，测试账号新增 `SR_WITCH_03`；`gacha_event_outbox` / `reward_event_outbox` / `user_operation_log` 均有对应记录。
- 红线仍关闭：EX V1、exchange/reissue、bag use/sell/batch-use、hero growth、reward/stamina/progress writes，以及任何新经济写入口。

## 2026-06-09 Gacha Summon Animation

- 召唤演出当前 active 路径已切换为结果驱动全屏视频：普通/R/SR 播放 `assets/resources/video/gacha/call1.mp4`，SSR/UR 播放 `assets/resources/video/gacha/call2.mp4`。
- Cocos 先提交真实 draw，拿到结果最高稀有度后再进入 summon video 视图；失败或余额不足不会播放结果视频。
- `VideoPlayer.keepAspectRatio=true`，按 1680x720 视频比例做 cover 适配，避免 1920x1080 Preview 中圆形/法阵被拉伸变形。
- 旧的本地 `SSR` / `UR` 演出预览按钮不是当前 active 验收路径，相关 legacy token 被 check 脚本禁止回流；SSR/UR 视觉应通过 `call2` 资源或受控真实结果验收。
- 真实抽卡按钮和后端结果流程不变；SSR/UR 视频选择由真实 draw 返回最高稀有度驱动，未修改概率、权重、保底、消耗、奖励、重复转碎片规则或 `gacha_pool_item`。
- 清理了英雄/图鉴只读 fallback 中重复的 `R_PATROL_01` 资源兜底，只保留带 `cardBackgroundAsset` 的记录，保证 Cocos TypeScript no-emit 能通过。

## 登录背景资源

- PC 横屏预览加载 `assets/resources/login-bg/login_bg_loop_1080p.mp4` 与 `assets/resources/login-bg/login_bg_first.jpg`。
- H5/竖屏预览加载 `assets/resources/login-bg-h5/login_bg_loop.mp4` 与 `assets/resources/login-bg-h5/login_bg_poster.jpg`。
- 替换登录背景时优先保持上述同名文件；如果只替换 PC 资源，竖屏或移动端预览仍会显示 H5 资源。

## 本阶段范围

- 当前只交付 Cocos 登录页和 Cocos 大厅，不以 web-vue 作为验收入口。
- 登录只对接现有 `/api/player/auth/dev-login`。
- 登录成功后对接主角色初始化接口：`GET /api/player/protagonist/state` 与 `POST /api/player/protagonist`。该写入只创建账号主角色和对应 `user_hero source_type=PROTAGONIST` 实例，不涉及抽卡、奖励、扣费、资金池或 EX。
- 大厅只对接只读接口：`GET /api/player/me/lobby`、`GET /api/player/lobby/notices`、`GET /api/player/lobby/codex`、`GET /api/player/lobby/heroes`、`GET /api/player/lobby/heroes/filter-options`。
- 召唤只允许使用现有 `POST /api/player/gacha/draw`，且仅当后端返回 `locked=false`、`drawEnabled=true`、`previewOnly=false` 时可抽。
- 当前真实开放池为 `LIMITED_ABYSS_PREVIEW`、`NORMAL_HERO`、`BASIC_CONTRACT_PREVIEW`；`SEALED_LIGHT_DARK` 仅可见展示，仍为 locked/display-only。
- 战斗只允许通过既有 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle` 完成 R1-R11 主线首通结算；只有 `MAIN_1_1` 至 `MAIN_2_2` 首次 `WIN` 会真实扣体力、发固定低风险奖励并推进下一关；`MAIN_2_3` 仍保持锁定/display-only，不开放真实结算。
- 英雄成长只允许通过英雄详情页调用 `POST /api/player/heroes/{heroId}/level-up`；升星、觉醒、精炼仍关闭。
- 除真实抽卡、R1-R11 首通结算和英雄 level-up 外，本阶段不再修改游戏经济规则，也不新增任何经济写入口。
- 不开放 EX 获取。
- 不做 USDT 直接领取。
- 不直连 MySQL、Redis、RabbitMQ。
- 大厅当前可展示背景、HUD、玩家资料只读场景页、公告活动只读场景页、图鉴只读场景页和本地未开放占位场景页。
- 不开放 gacha exchange/reissue、升星、觉醒、精炼、背包使用/出售、装备、商店交易、重复刷关掉落、副本结算、Boss 奖励、资金池、链上领取入口。

## Cocos 打开方式

1. 安装 Cocos Creator 3.8.x。
2. 用 Cocos Dashboard 打开本目录：

```text
D:\project\lootchain-cocos
```

3. 打开 `assets/main.scene`。
4. 确认 Canvas 下挂载 `LootChainGameRoot`，背景和粒子节点保留在场景中。
5. 点击编辑器预览运行。

## 后端联调

本地联调要求后端 `lootchain-game` 运行在 `http://localhost:8081`，并打开本地模拟登录：

```powershell
cd D:\project\LootChain
.\start-game-server.bat
```

Cocos 登录弹框中账号输入为数字时，会作为本地 `userId` 调用：

```text
POST http://localhost:8081/api/player/auth/dev-login
```

当前默认 `userId=1`。非数字账号/邮箱暂按本地验收兜底为 `userId=1`，正式账号体系后续由后端登录接口补齐。

登录成功后会先检查/创建主角色：

```text
GET http://localhost:8081/api/player/protagonist/state
POST http://localhost:8081/api/player/protagonist
```

主角色创建请求只允许提交：

```json
{ "gender": "male", "protagonistName": "圣契1" }
```

客户端不能提交 `heroCode`、稀有度、等级、星级、战力或属性。后端会固定创建 SSR 主角色模板和 `user_hero source_type=PROTAGONIST` 实例，并保证重复点击不生成第二个主角色。

主角色准备完成后，大厅会读取玩家只读资料、公告活动和图鉴预览：

```text
GET http://localhost:8081/api/player/me/lobby
GET http://localhost:8081/api/player/lobby/notices
GET http://localhost:8081/api/player/lobby/codex
GET http://localhost:8081/api/player/lobby/heroes
```

这些接口只返回大厅展示所需的 VO，不执行写入，不返回 Entity，不开放 EX V1 或任何经济写入口。

## 文档同步约定

每次阶段性上下文或代码变更完成后，必须同步更新对应项目文档。本项目的 Cocos-only 登录页、资源加载、大厅背景、预览验证、脚本检查等上下文优先更新：

- `D:\project\lootchain-cocos\README.md`
- `D:\project\lootchain-cocos\docs\current-chat-context.md`

涉及服务端启动、接口、规则或 SQL 的上下文，同时更新 `D:\project\LootChain` 下对应文档。

## 2026-06-03 Backend Table Comment UTF8 Repair

- 后端本地库 `mq_consume_log` 与 `gacha_pool_display_config` 的表注释/列注释曾因导入字符集错误显示乱码。
- 已由后端 SQL `D:\project\LootChain\sql\19_table_comment_utf8_fix.sql` 修复，并在相关初始化脚本增加 `SET NAMES utf8mb4;`。
- 本次为数据库元数据注释修复，不影响 Cocos 页面逻辑、接口调用、抽卡概率、奖池物品、保底、消耗、奖励、EX V1 或任何经济写入口。

## 2026-06-03 Gacha Pool Tab Logo Slot

- 召唤页左侧卡池页签右侧色块新增可配置 logo 背景槽。
- 后端 `gacha_pool_display_config.tab_logo_asset` 控制该图；Cocos 接口字段为 `tabLogoAsset`。
- `tabLogoAsset` 为空时 Cocos fallback 到 `logoAsset`，再 fallback 到原金/紫/蓝/红主题色块。
- 该字段只服务 UI 展示，不影响抽卡概率、奖池物品、保底、消耗、奖励、EX V1 或任何经济写入口。

## 当前可用入口

- 主界面：左上 Logo、右侧“谕言 / 客服 / 公告 / 修复”占位按钮、一个“账号登录”按钮。
- 登录弹框：账号/邮箱、密码、进入游戏、第三方登录占位图标、协议勾选。
- 登录成功：进入资源加载进度页，加载完成后切换到大厅背景界面。
- 大厅：左上玩家信息入口打开资料只读弹窗；公告/活动打开只读公告面板；底部 `图鉴` 打开只读图鉴面板；其他玩法入口仍是本地未开放占位弹窗。

客户端只展示和发送请求，所有扣费、保底、发奖和道具消耗都以后端事务为准。

## 2026-05-29 Lobby Stage 1B HUD update

- The lobby top-left player info HUD now follows a `540x218` logical reference layout and uses a `1080x436` high-resolution PNG asset at `assets/resources/ui/lobby/lobby_player_info_panel.png`.
- Dynamic Cocos labels for level, player name, combat power, and EXP are positioned in explicit safe slots to avoid overlap with the avatar frame/background.
- `scripts/check-layout.mjs` now checks the HUD PNG dimensions, SpriteFrame trim metadata, and internal label boxes across the supported viewport set.
- Verification: `npm.cmd run check:layout` passed; Cocos Creator 3.8.8 bundled TypeScript no-emit check passed.
- Boundary unchanged: no economy rule changes, no EX V1 opening, and no new economy write entry.

### Revision

- The first Stage 1B bitmap pass was rejected because it still looked like a heavy custom panel. The current asset reuses the higher-quality original portrait/frame crop only on the left side and leaves the right text area transparent, matching the reference direction more closely.
- The name sigil and combat-power underline are now drawn as thin gold Cocos graphics; the previous red diamond ornament has been removed.

### High Quality Avatar Frame Regeneration

- The screenshot-crop avatar frame pass was rejected. The current `lobby_player_info_panel.png` now uses a newly generated high-resolution avatar medallion from imagegen, with chroma-key removal and local transparent compositing into the existing `1080x436` HUD canvas.
- The generated source is retained at `C:\Users\axian\.codex\generated_images\019e6dfe-8486-7d32-a92f-9eaea25168f8\ig_07b83f41cd8e8d4e016a193fe1f8188191a7a50f262aadf9c6.png`; the project consumes only `assets/resources/ui/lobby/lobby_player_info_panel.png`.
- `lobby_player_info_panel.png.meta` is fixed to the full `1080x436` SpriteFrame grid so the dynamic Cocos labels stay aligned with the generated frame.

### Profile Dialog Close Flash Fix

- Opening/closing the lobby player profile dialog no longer rebuilds the full lobby scene. It now only adds/removes `LobbyProfileDim` and `LobbyProfilePanel`, keeping `Lobby_BG_Poster` and `Lobby_BG_Video` alive.
- Profile data refresh now updates the lobby HUD/profile overlay only, preventing the login background from appearing for a frame while the lobby background is recreated.
- `check:layout` includes a guard that blocks `renderLobby()` from the profile dialog open/close/profile-refresh paths.

## 2026-05-29 Lobby Stage 1C Top Resource Bar

- Added a Cocos-only top resource bar on the lobby HUD through `LootChainGameRoot.renderLobbyResourceBar()`.
- The bar is read-only: it displays stamina plus reference-style coin/ruby/crystal visual placeholders, with no purchase flow, no claim flow, and no backend write call.
- Stamina reuses the existing read-only `GET /api/player/me/lobby` profile VO. Coin/ruby/crystal values are visual placeholders until a read-only asset summary contract is explicitly available.
- The resource bar uses adaptive item counts and collision checks so it does not overlap the top-left player HUD on desktop, tablet, landscape mobile, portrait mobile, or minimum viewport checks.
- `scripts/check-layout.mjs` now verifies the resource bar node, resource item/value rendering path, and multi-resolution bounds next to the player info panel.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.
- `git diff --check` -> passed, with only existing CRLF warnings.
- Boundary unchanged: no economy rule changes, no EX V1 opening, and no new economy write entry.

## 2026-05-29 Lobby Stage 1D Reference-Style HUD Skeleton

- Reworked the lobby overlay toward `docs/ui-reference/dragonheir/lobby/lobby.png`: dark-gold thin HUD pieces, icon-first resource cells, red-dot markers, top-right system icons, left activity rail, center scene plaques, right challenge cards, bottom navigation, chat preview, and the red adventure button.
- All new lobby surfaces are Cocos UI/Graphics nodes, so they stay sharp under Cocos scaling instead of relying on blurred screenshots.
- The `+` marks in the top resource bar are disabled visual marks only. Resource cells do not register purchase or claim actions.
- Activity, hotspot, challenge, bottom-nav, and adventure clicks only show a temporary unopened status message; no gameplay/economy API is called.
- `scripts/check-layout.mjs` now checks the new top system icons, resource bar spacing, activity rail, scene hotspots, challenge rail, and bottom HUD against the supported viewport set.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` no-emit check -> passed.
- Boundary unchanged: no economy rule changes, no EX V1 opening, and no new economy write entry.

### Stage 1D refinement: building hotspots and larger text

- Increased lobby HUD text sizes to better match the visual proportions in `docs/ui-reference/dragonheir/lobby/lobby.png`, especially activity rows, center scene labels, right challenge cards, bottom navigation, chat preview, and the adventure button.
- Repositioned center scene labels so they sit closer to their corresponding buildings instead of floating away from the background architecture.
- Added transparent building hit areas behind every center function point. Hovering a building area now triggers the same local unopened-status hint as hovering the label.
- Clicking a building hit area or its label now plays a red-gold click pulse at the building/function location, then shows the local unopened-status hint.
- These interactions remain local placeholder behavior only; no gameplay, economy, purchase, claim, gacha, hero, bag, shop, fund-pool, or chain write API is called.

### Stage 1D hotspot alignment correction

- Corrected the first hotspot pass after preview showed the building hit boxes were too large and not aligned with the buildings.
- Center function labels now use per-building plaque widths and per-building anchor coordinates instead of one shared center/size formula.
- Transparent building hit areas are now individually sized to the visible building mass and no longer show a full red debug-like rectangle on hover.
- Hover feedback is now a small local red-gold target pulse near the building center, while click feedback remains the red-gold pulse effect.

### Stage 1D hotspot alignment correction v2

- Recalibrated the center function labels against the current 3840x2160 16:9 lobby poster instead of the earlier reference-image crop.
- Moved the visible plaques closer to the actual architecture anchors for summon altar, guild, ranking, traveler gathering, forge, abyss gate, campaign, and shop.
- Reduced hotspot plaque height/font size slightly so labels read more like attached building nameplates and less like oversized floating buttons.
- Further narrowed transparent building hit areas to the visible building cores while keeping hover/click placeholder behavior local only.

### Stage 1D code modularization

- Split the lobby HUD out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- `LootChainGameRoot` now keeps lifecycle, route switching, login/loading flow, lobby background, profile data state, and shared UI primitives.
- Lobby HUD code now lives under `assets/scripts/scenes/lobby/`:
  - `LobbyHudRenderer.ts`: renders player info, top resources, system icons, activity rail, scene hotspots, challenge rail, bottom HUD, and local placeholder interactions.
  - `LobbyHudConfig.ts`: holds editable HUD configuration such as activity rows, central hotspot coordinates, challenge cards, and bottom navigation items.
  - `LobbyHudTypes.ts`: holds HUD host/type contracts, constants, and small shared helpers.
- `scripts/check-layout.mjs` now validates the split lobby module files and their Cocos `.meta` files.
- Boundary unchanged: no economy rule changes, no EX V1 opening, and no new economy write entry.

## 2026-05-30 Lobby Stage 1E Profile Dialog Module Split

- Split the readonly lobby player profile dialog out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyProfileDialogRenderer.ts`, with Cocos meta `LobbyProfileDialogRenderer.ts.meta`.
- `LootChainGameRoot` now keeps only profile state, open/close/remove orchestration, profile loading, and the small host methods required by the dialog renderer.
- Dialog behavior is unchanged: `LobbyProfileDim` and `LobbyProfilePanel` are still added/removed as overlay nodes only, so opening/closing the profile dialog does not rebuild the lobby background video/poster.
- `scripts/check-layout.mjs` now validates the profile dialog module and meta file.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1F Background Controller Split

- Split the lobby poster/video runtime control out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyBackgroundController.ts`, with Cocos meta `LobbyBackgroundController.ts.meta`.
- `LootChainGameRoot` now delegates lobby background render/play/update/release to the controller and keeps only lifecycle/resource-loading orchestration.
- Behavior is unchanged: poster still fills the full visible canvas, video still uses `VideoPlayer.stayOnBottom=true`, muted looping playback, autoplay retry, poster fade after `PLAYING`, replay on `COMPLETED`, and poster fallback on `ERROR`.
- Resource loading now guards against stale loading tickets before writing poster/video resources into the background controller.
- `scripts/check-layout.mjs` now validates the background module and keeps the lobby video safety tokens out of the root script.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1G Avatar Renderer Split

- Split the shared lobby avatar drawing out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyAvatarRenderer.ts`, with Cocos meta `LobbyAvatarRenderer.ts.meta`.
- `LootChainGameRoot.addLobbyAvatar()` now delegates to the avatar renderer; HUD and profile dialog behavior stays unchanged.
- The renderer owns the dark-gold circular frame, ornament strokes, armored portrait silhouette, and `AvatarCrestLetter` label.
- `scripts/check-layout.mjs` now validates the avatar module and no longer requires the avatar drawing functions to live in the root scene script.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1H Profile State Split

- Split readonly lobby profile state normalization out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyProfileState.ts`, with Cocos meta `LobbyProfileState.ts.meta`.
- The state module owns current player id, loading/error flags, fallback profile, and normalization for `GET /api/player/me/lobby` responses.
- `LootChainGameRoot` still owns the API call and overlay refresh timing, but no longer contains profile fallback/normalization data code.
- `scripts/check-layout.mjs` now validates the profile state module and keeps the readonly endpoint/economy guardrails active across the split.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1I Loading Renderer Split

- Split the lobby resource-loading screen renderer out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyLoadingRenderer.ts`, with Cocos meta `LobbyLoadingRenderer.ts.meta`.
- The renderer owns `LoadingMask`, `LoadingPanel`, progress label/bar, loading message/error text, and the retry button layout.
- `LootChainGameRoot` still owns resource loading state, retry flow, ticket checks, and transition into the lobby.
- `scripts/check-layout.mjs` now validates the loading renderer module while keeping the existing multi-resolution loading panel bounds check.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1J Resource Loader Split

- Split lobby poster/video resource loading out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyResourceLoader.ts`, with Cocos meta `LobbyResourceLoader.ts.meta`.
- `LobbyResourceLoader` now owns the Cocos `resources.load()` calls for `lobby/lobby_bg_poster` and `lobby/lobby_bg_loop`, including the poster `SpriteFrame` fallback path through `Texture2D`.
- `LootChainGameRoot` still owns loading tickets, progress state, error handling, and the final transition into the lobby. Stale loading flows return before writing resources into `LobbyBackgroundController`.
- `scripts/check-layout.mjs` now validates the resource loader module and includes it in the forbidden economy token scan.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `git diff --check` -> passed, with only existing CRLF warnings.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1K Login Renderer Split

- Split the login page and login dialog UI composition out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/login/LoginRenderer.ts`, with Cocos meta files for the new `login` folder and renderer script.
- `LoginRenderer` owns `LoginLogo`, `MainAccountLoginButton`, right-side login rail, `DialogDim`, `LoginDialogPanel`, account/password input placement, third-party placeholder buttons, agreement row, back button, and enter-game button layout.
- `LootChainGameRoot` still owns login flow and state: `currentView`, `agreementAccepted`, `accountInput`, `passwordInput`, `statusLabel`, `login()`, dev-login API call, loading transition, and lobby/profile loading.
- `scripts/check-layout.mjs` now validates the login renderer module, forbids API/gameplay routing inside it, and checks login-dialog inner controls across the supported viewport set.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1L Adaptive Layout Resolver Split

- Split viewport/stage/safe-area layout calculation out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts`, with Cocos meta `AdaptiveStageLayoutResolver.ts.meta`.
- `AdaptiveStageLayoutResolver` owns `LOGIN_REFERENCE_WIDTH`, `LOGIN_REFERENCE_HEIGHT`, `LOGIN_STAGE_NODE_NAMES`, minimum viewport dimensions, Cocos `view.getVisibleSize()` fallback, active stage-node detection, and the `safeLeft/safeRight/safeTop/safeBottom` formula.
- `LootChainGameRoot` still owns route state, `renderBase()`, `applyRootSize()`, `makeLayoutKey()`, content-root clearing, and lobby video release timing.
- `UiLayout` is now imported from `LobbyHudTypes.ts` instead of being duplicated inside the root scene script.
- `scripts/check-layout.mjs` now validates the adaptive layout module, forbids layout implementation from drifting back into the root script, and keeps the multi-resolution formula mirror aligned.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1M UI SpriteFrame Cache Split

- Split UI SpriteFrame cache/preload logic out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/UiSpriteFrameCache.ts`, with Cocos meta `UiSpriteFrameCache.ts.meta`.
- `UiSpriteFrameCache` owns cached `SpriteFrame` map/set state, duplicate-load prevention, Cocos `resources.load(path, SpriteFrame)`, login image preloading, and lobby player-panel preloading.
- `LootChainGameRoot` still owns Cocos Inspector-bound frame overrides: `logoFrame`, `mainButtonFrame`, and `rightRailFrames`, plus UI node creation and render timing.
- `addSprite()` and `addImageButton()` still live in the root as shared UI primitives, but now resolve/request frames through `uiSpriteFrameCache`.
- `scripts/check-layout.mjs` now validates the sprite cache module, forbids business/API/UI-node responsibilities inside it, and prevents SpriteFrame cache maps/loaders from drifting back into the root script.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1N Readonly Profile Loader Split

- Split readonly lobby profile loading orchestration out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyProfileLoader.ts`, with Cocos meta `LobbyProfileLoader.ts.meta`.
- `LobbyProfileLoader` now owns `LobbyProfileState`, loading/error state transitions, the readonly `PlayerProfileApi.lobbyProfile()` call, stale user protection, and profile overlay refresh callbacks.
- `LootChainGameRoot` still owns login order, `dev-login`, loading-resource transition, profile dialog open/close state, and Cocos overlay node refresh implementation.
- Root now delegates `currentLobbyProfile()`, `isLobbyProfileLoading()`, `getLobbyProfileError()`, `resetForLogin()`, and profile loading to `LobbyProfileLoader`.
- `scripts/check-layout.mjs` now validates the loader module, forbids profile loading implementation in the root script, and enforces `PlayerProfileApi` as exact read-only `GET /api/player/me/lobby` with no write methods.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1O Loading Flow Controller Split

- Split lobby resource-loading flow orchestration out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyLoadingFlow.ts`, with Cocos meta `LobbyLoadingFlow.ts.meta`.
- `LobbyLoadingFlow` now owns loading ticket state, progress/message/error state, retry startup, stale-load protection, error capture, and the `LobbyResourceLoader` orchestration.
- `LootChainGameRoot` now only exposes narrow host callbacks for loading: show/refresh loading view, write poster/video resources into `LobbyBackgroundController`, and enter the lobby view.
- `LobbyLoadingRenderer` remains pure UI rendering, and `LobbyResourceLoader` remains pure local poster/video loading.
- `scripts/check-layout.mjs` now validates the loading-flow module, scans it for forbidden gameplay/economy tokens, and prevents loading ticket/progress implementation from drifting back into the root script.
- `docs/api-contract.md` was synchronized so the current Cocos open scope is explicit: `POST /api/player/auth/dev-login` plus readonly `GET /api/player/me/lobby`.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1P Login Flow Split

- Split the Cocos-only `dev-login` flow out of `assets/scripts/scenes/LootChainGameRoot.ts`.
- New module: `assets/scripts/scenes/login/LoginFlow.ts`, with Cocos meta `LoginFlow.ts.meta`.
- `LoginFlow` now owns account input references, agreement state, default dev user fallback, `userId` parsing, `PlayerAuthApi.devLogin(userId)`, login error formatting, and the last token name used by loading retry.
- `LootChainGameRoot` keeps only narrow login host callbacks: set API base URL, set status text, reset readonly lobby profile state, start lobby loading, and trigger readonly profile loading after login.
- `LoginRenderer` remains presentation-only and does not call API or route to gameplay/economy modules.
- `scripts/check-layout.mjs` now validates the login-flow module, scans it for forbidden gameplay/economy responsibilities, and prevents `dev-login` implementation details from drifting back into the root scene script.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` remain active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1Q Shared Text And Status Modules

- Split shared text/number helpers out of `assets/scripts/scenes/LootChainGameRoot.ts` into `assets/scripts/scenes/UiTextFormatter.ts`, with Cocos meta `UiTextFormatter.ts.meta`.
- `UiTextFormatter` now owns `positiveInteger()`, `formatInteger()`, `compactResourceValue()`, `trimText()`, and `safeText()` for root, avatar, profile state, and profile dialog use.
- Split status-label ownership out of the root into `assets/scripts/scenes/StatusPresenter.ts`, with Cocos meta `StatusPresenter.ts.meta`.
- `StatusPresenter` now owns the live `Label` reference, `add()`/`set()` status behavior, and stale-label reset after view cleanup. This prevents status updates from targeting a label removed during route rerender.
- `LootChainGameRoot` keeps only host wrappers for `addStatus()` and `setStatus()`.
- `scripts/check-layout.mjs` now requires both modules, scans them for forbidden API/economy/gameplay tokens, and prevents formatter/status implementations from drifting back into the root scene script.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` remain active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1R UI Primitive Factory Split

- Split shared Cocos UI primitive creation out of `assets/scripts/scenes/LootChainGameRoot.ts` into `assets/scripts/scenes/UiPrimitiveFactory.ts`, with Cocos meta `UiPrimitiveFactory.ts.meta`.
- `UiPrimitiveFactory` now owns low-level node composition for labels, edit boxes, password masking, framed inputs, buttons, image buttons, sprites, child labels, account glyphs, rectangles, beveled panels, progress bars, button feedback, pointer hover wiring, and button-frame drawing.
- SpriteFrame resolution/request inside image primitives now goes through the existing `UiSpriteFrameCache`, while Cocos Inspector overrides still come from `LootChainGameRoot`.
- `LootChainGameRoot` keeps thin wrapper methods only, preserving existing renderer host contracts for login, loading, HUD, avatar, background, and profile dialog modules.
- `scripts/check-layout.mjs` now requires `UiPrimitiveFactory.ts`, scans it for forbidden API/economy/gameplay responsibilities, and prevents UI primitive implementation details from returning to the root scene script.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` remain active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1S Content Root Controller Split

- Split Cocos content-root management out of `assets/scripts/scenes/LootChainGameRoot.ts` into `assets/scripts/scenes/UiContentRootController.ts`, with Cocos meta `UiContentRootController.ts.meta`.
- `UiContentRootController` now owns root-size application, `LootChainCocosLoginUIRoot` creation, UI node creation, node removal, content clearing, and content-root validity recovery.
- `LootChainGameRoot` no longer stores `contentRoot`; it delegates `createUiNode()`, `removeNodeFromContent()`, `ensureContentRoot()`, and `applyRootSize()` to the controller.
- Route switching remains in `LootChainGameRoot`, because current root responsibility is still lifecycle plus login/loading/lobby view transitions.
- `scripts/check-layout.mjs` now requires the content-root controller, scans it for forbidden API/economy/gameplay responsibilities, and prevents content-root implementation from returning to the root scene script.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` remain active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1T Chinese Code Comments

- Added Chinese maintainability comments across the current Cocos frontend code path.
- Commented module/class responsibilities and non-obvious logic in the scene root, adaptive layout, status presenter, content-root controller, UI primitive factory, text formatter, SpriteFrame cache, login renderer/flow, lobby HUD modules, loading/profile/background/resource modules, login VFX scripts, API wrappers, token storage, HTTP client, and shared type models.
- Comment style rule for future work: use Chinese comments for module ownership, safety boundaries, async stale-state guards, adaptive layout formulas, resource fallbacks, and placeholder-only restrictions. Avoid line-by-line narration for obvious assignments.
- Existing product boundary remains unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.

## 2026-05-30 Lobby Stage 1U HUD Layout Metrics Split

- Split pure lobby HUD geometry formulas out of `assets/scripts/scenes/lobby/LobbyHudRenderer.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyHudLayout.ts`, with Cocos meta `LobbyHudLayout.ts.meta`.
- `LobbyHudLayout` now owns HUD scale, HUD edge inset, and top-left player-info panel size/position calculation.
- `LobbyHudRenderer` keeps thin wrapper methods for the existing renderer flow, but no longer carries the multi-resolution formulas directly.
- `scripts/check-layout.mjs` now requires the layout module, scans it in the client guard set, and forbids the extracted geometry formulas from drifting back into `LobbyHudRenderer.ts`.
- Chinese comment rule remains active: the new module includes Chinese ownership comments.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 2D Readonly Notice Panel

- Added a readonly lobby notice/activity path for the current Cocos-only lobby stage.
- New Cocos files:
  - `assets/scripts/types/LobbyNoticeTypes.ts`
  - `assets/scripts/api/LobbyNoticeApi.ts`
  - `assets/scripts/scenes/lobby/LobbyNoticeState.ts`
  - `assets/scripts/scenes/lobby/LobbyNoticeLoader.ts`
  - `assets/scripts/scenes/lobby/LobbyNoticePanelRenderer.ts`
- The activity entry now opens an API-backed readonly notice panel. Compact small-screen `活动` uses the same panel.
- All non-notice lobby entries remain local unopened placeholders.
- `scripts/check-layout.mjs` now has a readonly lobby API allowlist and verifies `GET /api/player/lobby/notices` plus panel bounds.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` passed.
  - Backend `mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests compile` passed.
- Active Cocos APIs are now `POST /api/player/auth/dev-login`, readonly `GET /api/player/me/lobby`, and readonly `GET /api/player/lobby/notices`. No gameplay/economy write path was opened.

## 2026-05-30 Lobby Stage 2E Modal Blocking And Notice Fallback

- Notice API local failure fallback:
  - backend now returns an empty readonly notice list if the local notice query fails, instead of letting the lobby show `系统异常`.
- Dialog click behavior:
  - `LobbyNoticePanel`, `LobbyProfilePanel`, and `LobbyPlaceholderPanel` now block input events inside the panel.
  - Clicking inside dialog content no longer closes the dialog; only the outer dim layer or explicit close/confirm buttons close it.
- `scripts/check-layout.mjs` now guards these modal input-blocking tokens.

## 2026-05-30 Lobby Stage 1Y HUD Placeholder State And Safety Polish

- Continued the lobby with product, design, art, UI, development, interface-boundary, review, and test roles.
- Updated lobby config so activity and challenge entries no longer look like live operations:
  - activity sublines now use `预览中` / `未开放` / `占位展示` / `暂未开放`;
  - challenge cards now use `预览中` / `锁定` / `未开放` / `占位展示`;
  - bottom navigation red dots are disabled for this local placeholder stage.
- Improved visible HUD quality using Cocos `Graphics` only:
  - bottom HUD now has a darker layered platform and segmented gold top rail;
  - activity rows now use dark-gold banner plates with small preview badges;
  - challenge cards now show local preview/locked badges;
  - bottom navigation slots now have muted metal bases and separators;
  - chat preview now uses a glass ticker style with a separate `[世界]` channel label.
- Top resource bar now keeps stamina as readonly profile data, while coin/ruby/crystal display `未开放` instead of fake wallet-like balances.
- Hardened readonly profile loading:
  - `LobbyProfileLoader.cancel()` invalidates stale profile requests on root destroy and user reset;
  - profile responses whose `profile.userId` does not match the current login user are rejected into local fallback state.
- `scripts/check-layout.mjs` now guards the new HUD polish tokens, profile-loader cancel path, and profile identity mismatch guard.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` remain active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1Z Profile And Placeholder Clarity

- Expanded the readonly player profile dialog without adding any write operation:
  - core rows remain level, exp, combat power, stamina, account status, login method, wallet binding, and masked wallet address;
  - when panel space is available, additional local placeholder rows show main progress, abyss depth, guild, and title.
- Improved unopened-feature dialog copy:
  - subtitle now differentiates readonly/placeholder resources, local chat preview, system placeholder, and gameplay-unopened entries;
  - dialog can show `LobbyPlaceholderBoundaryNote` to state that the entry is local display only and does not write economy data.
- `scripts/check-layout.mjs` now guards the new profile placeholder rows and placeholder-dialog boundary note.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 2A Small-Screen Access And Guardrails

- Continued the remaining lobby work with product, design, art, interface-boundary, review, and test roles.
- Added small-screen scene-entry fallback:
  - desktop and large tablet still use the positioned building plaques and transparent hit areas;
  - smaller layouts render `LobbyCompactSceneEntrances`, a local two/four-column entry panel for all eight scene hotspots;
  - every compact entry still opens the unified unopened dialog and never navigates or calls gameplay/economy APIs.
- Improved top resource UI:
  - resource cells now use dark-gold beveled capsules drawn with Cocos `Graphics`;
  - resource glyphs gained extra highlights/cut lines;
  - when the full resource bar cannot fit, `LobbyCompactStaminaChip` preserves a local stamina entry where space allows.
- Hardened login/resource runtime:
  - `LoginFlow` now has `loginTicket` / `isCurrentLogin()` so stale dev-login responses cannot start a new loading/profile flow after a newer login attempt.
  - `LobbyResourceLoader` now hard-fails missing lobby poster `spriteFrame` instead of constructing a runtime SpriteFrame from texture fallback.
- Strengthened `scripts/check-layout.mjs`:
  - parses `LOBBY_SCENE_HOTSPOTS` from config instead of checking a duplicate hard-coded hotspot list;
  - checks hotspot normalized bounds and keeps config data-only;
  - guards compact scene entries, compact stamina chip, resource capsules, login ticket, resource loader hard-fail behavior, and non-stamina resource placeholders;
  - adds threshold viewports around 719/720, 1000x519, and 1180x500.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` remain active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1X Multi-Role Lobby Polish

- Advanced the lobby through product, design, art, UI, development, interface-boundary, review, and test roles.
- Added local readonly placeholder feedback for the top resource bar. Clicking stamina/coin/ruby/crystal now opens the unified unopened dialog; stamina explains it comes from readonly profile data, while other resources are explicitly marked as visual placeholders.
- Added local placeholder feedback for the bottom chat preview. Clicking chat opens the unified unopened dialog and does not create a send box or chat-service call.
- Hardened runtime cleanup:
  - `UiContentRootController.clear()` now destroys old children instead of only removing them.
  - `LobbyLoadingFlow.cancel()` invalidates stale loading callbacks during root destroy.
  - Lobby background resize/resource-refresh paths preserve the current background video where possible instead of forcing a stop/play rebuild.
  - Narrow top HUD now hides right-side system icons when they would collide with the player panel.
- Improved lobby visual depth with a local Cocos `LobbyAtmosphereOverlay`, darker stage edge pressure, richer central hotspot plaques, and heavier pseudo-illustration treatment on right challenge cards.
- Strengthened `scripts/check-layout.mjs`:
  - resource/chat placeholder tokens,
  - HUD click-contract guard,
  - content-root destroy guard,
  - loading cancel guard,
  - background preserve/resize guard,
  - system-icon overlap handling,
  - additional viewport threshold checks.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1W Unified Placeholder Dialog

- Stopped further lobby modularization for this stage and moved to visible product behavior polish.
- Added a unified local unopened-feature dialog for lobby placeholder entries: activity rail, central scene hotspots, right challenge cards, bottom navigation, adventure button, and top-right system icons.
- The dialog uses adaptive stage-safe sizing and dark-gold Cocos UI styling, with nodes `LobbyPlaceholderDim` and `LobbyPlaceholderPanel`.
- The dialog is local feedback only. It does not navigate to gameplay pages, does not call gameplay APIs, and does not create any economy write path.
- `scripts/check-layout.mjs` now guards the placeholder dialog methods, nodes, and multi-resolution panel bounds.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - Touched-code Chinese comment/text scan -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 1V Top HUD Renderer Split

- Split the lobby top HUD rendering out of `assets/scripts/scenes/lobby/LobbyHudRenderer.ts`.
- New module: `assets/scripts/scenes/lobby/LobbyTopHudRenderer.ts`, with Cocos meta `LobbyTopHudRenderer.ts.meta`.
- `LobbyTopHudRenderer` now owns the top-left player info panel, top resource bar, and top-right system icon group.
- `LobbyHudRenderer` now delegates the top HUD through `topHudRenderer.render(layout)` and keeps activity rail, scene hotspots, challenge rail, and bottom HUD.
- `LobbyHudLayout.ts` remains the single geometry source for HUD scale, edge inset, and player-info panel bounds, so both top HUD and the rest of the lobby overlay share the same adaptive formulas.
- `scripts/check-layout.mjs` now requires and scans the top HUD renderer, requires key player/resource/system-icon tokens there, and forbids that implementation from drifting back into `LobbyHudRenderer.ts`.
- Chinese comment rule remains active: the new top HUD module includes Chinese ownership and safety comments.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 2B Multi-Role Lobby Polish And Safety

- Current working path is `D:\business\project\lootchain-cocos`; older document entries may still mention the previous `D:\project\lootchain-cocos` path.
- Continued the remaining lobby work through product, design, art/UI, development, interface-boundary, review, and test roles.
- Visual/UI updates:
  - central building plaques now use richer dark-gold layered nameplates and all hotspot `hot` flags are disabled while entries remain placeholders;
  - right-side challenge cards now use polygonal dark-gold card traces plus a side rail instead of plain rectangular blocks;
  - bottom HUD now has a three-layer stepped black-gold platform, subtle red glow zones, and the adventure subtitle now shows `未开放` instead of fake chapter progress;
  - profile dialog now uses a safety-zone based dialog scale and switches to a single-column row layout on narrow panels, preventing avatar/text/row overlap.
- Runtime safety update:
  - `PlayerAuthApi.devLogin()` no longer writes the token immediately;
  - `LoginFlow` saves the token only after the current login ticket passes stale-response validation;
  - `LootChainGameRoot.onDestroy()` now cancels pending login callbacks.
- Guardrail updates:
  - `scripts/check-layout.mjs` now guards the new plaque/card/platform/profile-dialog tokens;
  - checks that unopened lobby config does not show `hot: true`;
  - checks preserve-background refresh order, stale-safe auth token saving, fixed readonly resource order, and disabled resource plus signs.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Poster SpriteFrame Import Fix

- Fixed the login-to-lobby loading error: `Bundle resources doesn't contain lobby/lobby_bg_poster/spriteFrame`.
- Root cause: `assets/resources/lobby/lobby_bg_poster.jpg.meta` had been imported as `texture` only, so Cocos had no `spriteFrame` sub-resource for `LobbyResourceLoader`.
- The lobby poster meta now includes a `spriteFrame` sub-meta for the 3840x2160 image while keeping the existing texture sub-resource.
- `scripts/check-layout.mjs` now requires `lobby_bg_poster.jpg.meta` and verifies that the poster remains a 3840x2160 `sprite-frame` import, so this regression is caught before preview.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
- Boundary unchanged: this only fixes local asset import metadata; no gameplay/economy endpoint was opened.

## 2026-05-30 Lobby Stage 2C Compact Action Access

- Added `LobbyCompactActionEntrances` for small or compressed lobby layouts where side rails or the bottom HUD are hidden.
- The compact action panel exposes local placeholder shortcuts for `活动`、`挑战`、`冒险`、`聊天`、`英雄`、`背包`、`任务`、`商店`.
- These shortcuts only open the unified unopened dialog. They do not navigate to gameplay, do not call battle/settlement/reward APIs, and do not create any economy write path.
- `LootChainGameRoot.rerenderLobbyOverlay()` now removes `LobbyCompactActionEntrances` and `LobbyCompactSceneEntrances` before redrawing, preventing duplicate compact panels after resize/profile refresh.
- `scripts/check-layout.mjs` now guards the compact action renderer tokens and checks its adaptive bounds across the existing viewport matrix.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no gameplay/economy endpoint was opened, no economy rule changed, and EX V1 remains closed.

## 2026-05-30 Lobby Stage 2F Readonly Codex Panel

- Added a Cocos-only readonly hero codex panel for the bottom `图鉴` entry and compact `图鉴` shortcut.
- New frontend modules:
  - `assets/scripts/types/LobbyCodexTypes.ts`
  - `assets/scripts/api/LobbyCodexApi.ts`
  - `assets/scripts/scenes/lobby/LobbyCodexState.ts`
  - `assets/scripts/scenes/lobby/LobbyCodexLoader.ts`
  - `assets/scripts/scenes/lobby/LobbyCodexPanelRenderer.ts`
- The client calls only `GET /api/player/lobby/codex`, a narrow lobby facade endpoint. It does not call the broader hero controller that contains growth write operations.
- The panel displays collection, owned count, rarity/faction/class/role, and readonly status. It has no upgrade, star-up, awaken, refine, acquire, reward, purchase, sell, gacha, settlement, or economy write action.
- EX content is filtered on both sides: backend filters locked/EX records, and the Cocos API wrapper filters `EX` rarity and `EX_` hero codes again before rendering.
- Modal behavior follows the current lobby rule: clicks inside the panel are blocked by `BlockInputEvents`; only the outer dim layer or explicit close button closes it.
- `scripts/check-layout.mjs` now validates the codex API allowlist, stale-request loader, modal blocking, EX filtering, and multi-resolution panel bounds.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - Backend `mvn.cmd --no-transfer-progress -pl lootchain-game -am -DskipTests compile` -> passed.
- Boundary unchanged: no economy rule changes, no EX V1 opening, and no new economy write entry.

## 2026-05-30 Normal Player Flow Analysis

- Added `docs/normal-player-flow-analysis.md` to define what a normal player should do after login.
- Multi-role conclusion: the next stage should move from lobby placeholders toward the first real gameplay loop, centered on `冒险/战役`.
- Recommended next stage: `Stage 3A` with lobby adventure CTA, readonly mainline recommendation state, and a readonly chapter-map shell.
- Full intended loop: login -> account state -> lobby target -> adventure -> team confirmation -> battle -> settlement -> growth -> back to lobby.
- Safety boundary: battle settlement and rewards must be backend-owned later; the current analysis does not change economy rules, does not open EX V1, and does not add an economy write entry.

## 2026-05-30 Protagonist Create Design

- Added `docs/protagonist-create-design.md` for the login-success protagonist creation flow.
- Generated and archived a cinematic UI concept image at `docs/ui-reference/protagonist/protagonist-create-concept-v1.png`.
- Product direction: after login, a new account should create a main protagonist before entering the lobby; existing accounts skip this step.
- Protagonist rules:
  - male/female selection plus character name;
  - unique `SSR 主角`, not a gacha-pool hero;
  - appears as the first hero card in the hero list;
  - can join battle;
  - has Attack, Defense, and Support forms, with Attack unlocked by default and other forms unlocked by mainline story progress/items.
- Recommended next frontend stage: `Stage P1` protagonist creation shell with Cocos UI, adaptive layout, native text/input/button controls, and local flow into the lobby.
- Backend creation is a high-risk player-state write and should be handled in a separate reviewed stage. Boundary unchanged: no economy rule changes, no EX V1 opening, and no economy write entry added in this design pass.

## 2026-05-30 Protagonist Stage P1 Cocos Shell

- Implemented the first Cocos-only protagonist creation shell.
- New modules:
  - `assets/scripts/types/ProtagonistTypes.ts`
  - `assets/scripts/scenes/protagonist/ProtagonistCreateState.ts`
  - `assets/scripts/scenes/protagonist/ProtagonistCreateFlow.ts`
  - `assets/scripts/scenes/protagonist/ProtagonistCreateRenderer.ts`
- Login success now routes through the protagonist flow before lobby loading.
- New local view: `protagonistCreate`.
- New accounts in local preview see male/female protagonist selection, name input, SSR protagonist framing, and Attack/Defense/Support form preview.
- Attack form is unlocked by default; Defense and Support stay locked with mainline-unlock copy.
- The shell stores preview-only local state under `lootchain.protagonist.preview.v1.{userId}` so repeat preview logins can skip creation.
- No backend protagonist creation API was added in this stage. No database write, no economy write, and no EX V1 opening.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.

### Protagonist Character Art Patch

- Cropped male/female protagonist card art from the generated concept image and added it to Cocos resources:
  - `assets/resources/ui/protagonist/protagonist_male_attack.png`
  - `assets/resources/ui/protagonist/protagonist_female_attack.png`
- Added image `.meta` files and required resource checks.
- `ProtagonistCreateRenderer.ts` now loads these SpriteFrames into the male/female cards first and uses the old Cocos silhouette only as a fallback.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.

### Protagonist Generated Art Replacement

- Replaced the first cropped protagonist card images with newly generated high-quality cinematic card art.
- Resource paths stay unchanged, so `ProtagonistCreateRenderer.ts` still loads:
  - `assets/resources/ui/protagonist/protagonist_male_attack.png`
  - `assets/resources/ui/protagonist/protagonist_female_attack.png`
- The existing `.meta` files were preserved, and the PNGs were resized to the current `512x768` SpriteFrame card size.
- This is a local UI asset replacement only. No backend API, database write, economy rule, or EX V1 behavior was changed.

### Protagonist DB Sync Stage

- Added backend-backed protagonist creation to the Cocos flow.
- After `dev-login`, the client calls `GET /api/player/protagonist/state`.
- If no protagonist exists, the create page calls `POST /api/player/protagonist` with only `gender` and `protagonistName`.
- The old local preview state remains only as a diagnostic mirror; it is no longer authoritative for skipping the create page.
- The backend creates `player_protagonist` plus a `user_hero` instance marked `source_type=PROTAGONIST`.
- Boundary unchanged: no gacha, reward, purchase, settlement, fund-pool, chain-claim, or EX V1 path was opened.

## 2026-05-30 Lobby Stage 2G Readonly Hero Roster

- Added a Cocos-only readonly hero roster panel for the bottom `英雄` entry and compact `英雄` shortcut.
- New frontend modules:
  - `assets/scripts/types/LobbyHeroTypes.ts`
  - `assets/scripts/api/LobbyHeroApi.ts`
  - `assets/scripts/scenes/lobby/LobbyHeroRosterState.ts`
  - `assets/scripts/scenes/lobby/LobbyHeroRosterLoader.ts`
  - `assets/scripts/scenes/lobby/LobbyHeroRosterPanelRenderer.ts`
- The client calls only `GET /api/player/lobby/heroes`, a narrow lobby facade endpoint. It does not call the broader hero controller that contains growth write operations.
- The panel pins `protagonist=true` heroes first, displays SSR protagonist form state, level, star, and power, and has no upgrade, star-up, awaken, refine, gacha, reward, purchase, sell, settlement, or economy write action.
- EX content is filtered on both sides: backend filters EX records, and the Cocos API wrapper filters `EX` rarity and `EX_` hero codes again before rendering.
- Modal behavior follows the current lobby rule: clicks inside the panel are blocked by `BlockInputEvents`; only the outer dim layer or explicit close button closes it.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - Backend `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerLobbyHeroServiceImplTest,PlayerProtagonistServiceImplTest" test` -> passed.
  - Backend `mvn.cmd --no-transfer-progress -pl lootchain-admin,lootchain-game -am -DskipTests compile` -> passed.
- Boundary unchanged: no economy rule changes, no EX V1 opening, and no new economy write entry.

## 2026-05-31 Lobby Stage 3A Readonly Adventure Shell

- Added the first playable-flow bridge after the lobby: the right-bottom `冒险` button and compact `冒险` shortcut now open a Cocos-only mainline adventure panel.
- New frontend modules:
  - `assets/scripts/types/LobbyAdventureTypes.ts`
  - `assets/scripts/api/LobbyAdventureApi.ts`
  - `assets/scripts/scenes/lobby/LobbyAdventureState.ts`
  - `assets/scripts/scenes/lobby/LobbyAdventureLoader.ts`
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts`
- The client calls only `GET /api/player/lobby/adventure`, a narrow readonly lobby facade.
- The panel shows current chapter, recommended stage, level requirement, recommended power, enemy summary, reward-preview text, and a disabled `编队未开放` button.
- The lobby adventure CTA subtitle now reads from the loaded readonly recommendation state when available, falling back to `主线 1-1 暗影城门` before the API response arrives.
- Modal behavior follows the lobby rule: clicks inside the panel are blocked by `BlockInputEvents`; only the outer dim layer or explicit close button closes it.
- `scripts/check-layout.mjs` now validates the adventure API allowlist, module files, panel bounds across supported viewports, and the HUD click contract for `openLobbyAdventurePanel()`.
- Boundary unchanged: no team save, no battle start, no settlement, no stamina cost, no reward grant, no economy rule changes, and no EX V1 opening.

## 2026-05-31 Lobby Stage 3B Readonly Formation Shell

- Added the next local flow step after adventure stage details: unlocked adventure stages can open a readonly `编队确认` panel.
- New frontend module:
  - `assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts`
- The formation shell reuses the existing readonly hero roster state from `GET /api/player/lobby/heroes`; no new backend write endpoint was added.
- The panel displays five default slots, pins the protagonist as the first/leader candidate when available, and lists candidate heroes for scanability.
- `战斗未开放` is a disabled visual state only. There is no team-save, battle-start, settlement, stamina-cost, reward-grant, or economy write action.
- `scripts/check-layout.mjs` now validates the formation module, modal bounds, root wiring, and `BlockInputEvents` behavior.

## 2026-05-31 Lobby Stage 3C Local Battle Preview Shell

- Continued the normal play path from `Adventure detail -> Formation confirm -> Battle preview`.
- New frontend module:
  - `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`
- The formation footer now exposes `Battle Preview`, which opens a local-only battle presentation shell.
- The preview renders ally slots from the readonly hero roster state, keeps the protagonist first when present, and shows placeholder enemy units plus a battle log.
- The preview has no battle-session creation, no team-save, no settlement, no stamina cost, no progress write, no reward grant, no economy rule change, and no EX V1 opening.
- Modal behavior follows the lobby rule: `BlockInputEvents` blocks clicks inside the panel; only the dim layer or explicit back button closes it.
- `scripts/check-layout.mjs` now validates the battle-preview module, root wiring, modal node names, `BlockInputEvents`, disabled settlement button, and responsive bounds.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed.

## 2026-05-31 Lobby Stage 4A Backend Battle Session And No-Reward Settlement

- Continued the playable flow from `Adventure -> Formation -> Battle Preview` into real backend battle-session APIs.
- New frontend files:
  - `assets/scripts/types/BattleTypes.ts`
  - `assets/scripts/api/BattleApi.ts`
  - `assets/scripts/scenes/lobby/LobbyBattleState.ts`
  - `assets/scripts/scenes/lobby/LobbyBattleFlow.ts`
- `LobbyBattlePreviewPanelRenderer.ts` now renders backend battle session state, no-reward settlement state, errors, and a return-to-lobby action.
- New backend endpoints consumed by Cocos:
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- The frontend only sends `stageCode`, owned hero ids, leader hero id, request id, and client metadata. It never sends rewards, resource deltas, stamina deltas, progress, drops, or hero attributes.
- `BattleApi` validates that backend settlement keeps `readonlyEconomy=true` and `rewardGranted=false`.
- `scripts/check-layout.mjs` now requires the battle API/types/flow/state files and guards against EX content and accidental economy semantics in the battle response.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed.
  - Backend `PlayerBattleServiceImplTest`, adventure, hero roster, and protagonist tests -> passed.
  - Backend `lootchain-admin,lootchain-game` compile -> passed.
- Local database migration `sql/13_battle_session_module.sql` was executed through JDBC; `battle_session` and `battle_settlement` exist in the local `lootchain` schema.
- Boundary unchanged: no stamina cost, no progress write, no reward grant, no bag/currency/USDT/fund-pool write, no economy rule change, and no EX V1 opening.

## 2026-05-31 Stage 4B Player Flow Smoke Verification

- Backend project added `D:\business\project\LootChain\scripts\smoke-player-flow.ps1`.
- The script verifies the current Cocos path against `lootchain-game`:
  `dev-login -> protagonist state -> lobby profile -> adventure -> hero roster -> battle start -> no-reward settlement -> lobby profile re-read`.
- Local verification passed against `http://localhost:8081` with `userId=1` and `MAIN_1_1`.
- The script confirmed:
  - battle routes are exposed by the running server;
  - the legal lineup used `heroIds=4,1,2`;
  - battle start returned `readonlyEconomy=true`;
  - settlement returned `rewardGranted=false` and `readonlyEconomy=true`;
  - stamina stayed `100 -> 100`;
  - combat power stayed `15448 -> 15448`.
- This is still a no-reward battle-record loop. It does not unlock stamina cost, progress writes, rewards, bag/currency/USDT/fund-pool writes, or EX V1.

## 2026-05-31 Lobby Stage 4C Battle Presentation Pass

- Fixed the compact/mobile adventure path: `LobbyAdventureCompactFormationButton` now lets narrow layouts continue from adventure to formation.
- Renamed reward copy in the adventure detail from pure drop language to `关卡配置预览（当前不发放）`.
- Added battle presentation helpers:
  - `assets/scripts/scenes/lobby/LobbyBattlePresentationLayout.ts`
  - `assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts`
- Reworked `LobbyBattlePreviewPanelRenderer.ts` from a list-style preview into a battle presentation panel:
  - cinematic dark backdrop;
  - ally/enemy actor lanes;
  - HP bars;
  - timeline/boundary badge;
  - hit effect layer and damage text;
  - compact footer layout for narrow screens;
  - result state that only says battle record completed, with no reward claim UI.
- `scripts/check-layout.mjs` now guards the compact formation CTA, battle presentation modules, cinematic backdrop, actor/effect nodes, footer behavior, and no-reward wording.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` passed.
  - Backend smoke script passed again: `rewardGranted=false`, `readonlyEconomy=true`, stamina `100 -> 100`, combat power `15448 -> 15448`.
- Stage 4D guardrail follow-up:
  - `LobbyBattlePresentationLayout.ts` now reduces actor count in extreme compact panels and keeps log width clear of actor lanes.
  - `scripts/check-layout.mjs` now checks battle actors, log, and footer buttons for internal bounds and overlap across the viewport matrix.
- Boundary unchanged: no stamina cost, no progress write, no reward grant, no bag/currency/USDT/fund-pool write, no economy rule change, and no EX V1 opening.

## 2026-05-31 Lobby Stage 4E Local Battle Timeline

- Added a local-only presentation timeline to `LobbyBattleFlow`.
- After the backend battle session is created, the panel advances through several visual steps before settlement can be recorded.
- `LobbyBattleState` now tracks `presentationStep` and `presentationComplete`.
- While the local presentation is running, the action button shows `演出中` through `LobbyBattlePlaybackPending` and does not call settlement.
- `LobbyBattlePresentationState` now drives timeline text, log lines, damage text, and lead enemy HP display from the current visual step.
- This timeline is presentation-only. It does not decide combat authority, rewards, stamina, progress, drops, or resources.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check passed.

## 2026-05-31 Lobby Stage 4F Selected Stage Propagation

- The adventure-to-battle path now keeps the selected stage explicit through `Adventure detail -> Formation confirm -> Battle preview -> battle start`.
- `LobbyAdventurePanelRenderer.ts` passes the actual `stageCode` from both detail and compact adventure entry buttons.
- `LobbyFormationPanelRenderer.ts` displays the current target stage and starts battle preview using the selected stage held by `LootChainGameRoot`.
- `LootChainGameRoot.ts` owns `selectedLobbyStageCode`; missing, empty, or `EX_` stage codes now stop the flow, show `关卡选择已失效，请重新选择主线关卡。`, and return to the adventure panel.
- `LobbyBattleFlow.ts` no longer silently falls back to `MAIN_1_1` when a stage is missing or illegal.
- `scripts/check-layout.mjs` guards the selected-stage propagation and the no-silent-fallback rule.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check passed.
  - Backend player-flow smoke passed again with `rewardGranted=false`, `readonlyEconomy=true`, stamina `100 -> 100`, and combat power `15448 -> 15448`.
  - Backend player-flow smoke also passed with non-default `StageCode=MAIN_1_2`, confirming the battle API echoes and records the selected stage without reward/economy changes.
- Boundary unchanged: this stage only preserves the selected stage. It does not save teams, spend stamina, write mainline progress, grant rewards, write bag/currency/USDT/fund-pool state, change economy rules, or open EX V1.

## 2026-05-31 Lobby Stage 4H Battle Stage Visibility

- Battle presentation copy now keeps the target stage visible to the player.
- The ready state subtitle shows `目标关卡 {stageCode}` before the battle session is created.
- The recorded-result state shows the settlement `stageCode` in both the subtitle and battle log.
- `scripts/check-layout.mjs` guards this copy so future battle UI changes do not hide the selected stage.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check passed.
- Boundary unchanged: display-only change, no backend contract change, no stamina/progress/reward/economy write, and no EX V1 opening.

## 2026-05-31 Lobby Stage 4I Formation Explicit Battle Stage

- The formation panel now passes its visible target `stageCode` directly into battle preview.
- `LootChainGameRoot.openLobbyBattlePreviewPanel(stageCode: string)` no longer uses an implicit previous selected stage fallback.
- Frontend stage normalization now only accepts `MAIN_数字_数字` codes, preventing display text such as `未选择关卡` from becoming a stage value.
- `scripts/check-layout.mjs` guards explicit formation-to-battle stage propagation.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check passed.
- Boundary unchanged: frontend state-flow hardening only, no backend contract change and no economy write.

## 2026-05-31 Lobby Stage 4J Return-To-Lobby Refresh

- Returning from the battle recorded-result panel now cleans up the local battle flow and refreshes readonly lobby data.
- `returnToLobbyFromBattlePreview()` calls `lobbyBattleFlow.cancel()` before closing panels, then reloads lobby profile, adventure state, and hero roster.
- `LobbyBattleFlow` now uses the same `MAIN_数字_数字` stage-code shape guard as the root flow.
- `scripts/check-layout.mjs` guards the return-to-lobby refresh path.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check passed.
- Boundary unchanged: readonly refresh and local timer cleanup only, no backend contract change and no economy write.

## 2026-05-31 Lobby Stage 4K New Player Full-Flow Smoke

- Current playable Cocos path has been verified end to end for a fresh local player:
  `dev-login -> protagonist state empty -> create SSR protagonist -> lobby profile -> hero roster -> adventure -> MAIN_1_1 battle start -> no-reward settlement -> lobby profile reread`.
- Backend project added `D:\business\project\LootChain\scripts\smoke-new-player-flow.ps1`.
- The smoke script creates only a local `game_user` shell for QA, then uses player APIs for protagonist and hero creation.
- It verifies:
  - created protagonist is SSR and defaults to attack form;
  - defense/support forms remain locked;
  - repeated create returns the existing protagonist and does not create another `player_protagonist` or `PROTAGONIST` `user_hero`;
  - hero roster keeps the protagonist as the first item;
  - battle start uses explicit `MAIN_1_1`;
  - settlement stays `rewardGranted=false` and `readonlyEconomy=true`;
  - stamina and combat power are unchanged after settlement.
- Latest local verification used `userId=12`, `protagonistHeroId=9`, `battleNo=Bf8f08ea10fc945ab9022db1bbfa3f548`, and `settlementNo=S52c47a1c10ba4ec9ba9733c9e4216a90`.
- Additional verification in this pass:
  - `npm.cmd run check:layout` passed.
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` passed.
  - Backend `PlayerProtagonistServiceImplTest` and `PlayerBattleServiceImplTest` passed.
  - `smoke-player-flow.ps1 -UserId 1 -StageCode MAIN_1_2` passed.
  - `smoke-battle-stage-guard.ps1` passed for `MAIN_9_9` and `EX_1_1`, with `battle_session` rows staying `0 -> 0`.
- Boundary unchanged: this stage only adds verification coverage and a local QA script. It does not open rewards, stamina cost, progress writes, bag/currency/USDT/fund-pool writes, EX V1, or any new economy write entry.

## 2026-05-31 Lobby Stage 4L Frontend Repeat-Submit Guard

- Added Cocos UI/state guards for the P0 duplicate-click risks found by the review agent.
- `ProtagonistCreateFlow.submitCreate()` now returns immediately while `creating=true`; the create button is also non-interactable during creation.
- `LootChainGameRoot.openLobbyBattlePreviewPanel()` and the async hero-roster callback now check the same selected stage and current battle-flow busy state before auto-starting battle.
- `LobbyBattleFlow.start()` now blocks repeated battle-start POSTs for the same stage while a session is starting, started, settling, or settled.
- `LobbyBattleFlow.settle()` now also returns when a settlement already exists.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 `tsc.cmd --noEmit` passed for protagonist and battle flow files.
- Boundary unchanged: frontend debounce/state hardening only. No backend contract change, no reward, no stamina cost, no progress write, no bag/currency/USDT/fund-pool write, no EX V1, and no new economy write entry.

## 2026-05-31 Lobby Stage 4M Battle Resume And Contract Hardening

- Fixed a real Cocos protagonist-create break: `ProtagonistApi.create()` now returns the backend POST result instead of being swallowed by a bad inline comment, and validates protagonist state/create responses before entering lobby.
- `LootChainGameRoot.openLobbyBattlePreviewPanel()` now reopens an existing same-stage battle state instead of silently blocking after the player returns from battle preview to formation.
- `returnToLobbyFromBattlePreview()` now clears the local battle snapshot with `lobbyBattleFlow.cancel(true)`, so the same stage can be entered again after the recorded-result flow returns to lobby.
- `BattleApi` no longer falls back to `MAIN_1_1` when the backend omits/changes `stageCode`; battle start must echo the requested `MAIN_x_y`, and settlement must match the session stage.
- `LobbyAdventureApi` filters illegal/EX stages before they reach the adventure UI, and `LobbyHeroApi` filters `id<=0` heroes so formation does not show units that battle start will later reject.
- `scripts/check-layout.mjs` now guards these Stage 4M contracts.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 `tsc.cmd --noEmit` passed.
  - `smoke-player-flow.ps1 -UserId 1 -StageCode MAIN_1_2` passed: `battleNo=B161c2bdd5a2b4314b2c047cca6f053c6`, `settlementNo=S098d0cf575a04c3d8daf4a52e7db8c61`.
  - `smoke-new-player-flow.ps1 -StageCode MAIN_1_1 -Gender female` passed with `userId=13`, `protagonistHeroId=10`, `battleNo=Bffd294803cb74937a1d5776bec5a932d`.
  - `smoke-battle-stage-guard.ps1` passed for `MAIN_9_9` and `EX_1_1` with `battle_session` rows staying `0 -> 0`.
- Boundary unchanged: no backend API or SQL change, no reward, stamina cost, progress write, bag/currency/USDT/fund-pool write, EX V1, or new economy write entry.

## 2026-05-31 Lobby Stage 4N Compact Responsive Hardening

- Hardened Cocos-only responsive layout for the current playable flow.
- `LobbyHudRenderer` now keeps compact action access available down to short viewports; below `300px` stage height it prioritizes `公告 / 冒险 / 英雄 / 图鉴`, while decorative scene shortcut panels wait until there is enough vertical room.
- `ProtagonistCreateRenderer` now uses tighter compact controls and a dense form-chip layout so the name input and `进入游戏` button do not touch or overlap on portrait/narrow screens.
- `LobbyFormationPanelRenderer` now sizes compact formation rows from the available body height, keeping five slots inside the panel without pressing into the footer.
- `LobbyBattlePresentationLayout` now separates the battle field from boundary text and footer buttons in very short panels.
- `scripts/check-layout.mjs` now verifies new compact viewports `390x300` and `360x240`, checks protagonist input/button spacing, formation internal bounds, and battle field/boundary/footer non-overlap.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 `tsc.cmd --noEmit` passed.
- Boundary unchanged: frontend layout only. No backend API/SQL change, no reward, stamina cost, progress write, bag/currency/USDT/fund-pool write, EX V1, or new economy write endpoint.

## 2026-05-31 Lobby Stage 4O Local Formation Selection

- Added local formation confirmation for the Cocos lobby flow.
- `LobbyFormationPanelRenderer` now lets the player click candidate heroes to add/remove them from the current battle lineup; the protagonist remains fixed as the leader.
- `LootChainGameRoot` now owns `selectedLobbyFormationHeroIds`, reconciles it after hero roster loads, and refreshes the formation panel when the local lineup changes.
- `LobbyBattleFlow` now sends the confirmed local lineup to the existing `POST /api/player/battles/start` request instead of always using the default top-power roster.
- This is not a saved team feature: no new backend endpoint, SQL table, long-term formation save, reward, stamina, progress, bag/currency/USDT/fund-pool write, or EX V1 path was opened.
- Verification:
  - `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 `tsc.cmd --noEmit` passed.
  - `git diff --check` passed for the Cocos project.

## 2026-05-31 Lobby Stage 4P Player API Phase Gate

- Backend added a current Cocos phase player API whitelist; Cocos docs must now treat it as active by default.
- Cocos-side change:
  - `assets/scripts/api/GachaApi.ts` now fails closed in `draw()` with "当前 Cocos 阶段未开放抽卡" instead of POSTing `/api/player/gacha/draw`.
  - `scripts/check-layout.mjs` now guards that draw remains client-blocked during this phase.
- Current playable API surface remains:
  - dev login;
  - protagonist state/create;
  - lobby readonly profile/notices/codex/heroes/adventure;
  - battle start and no-reward settlement.
- Economy/growth routes remain blocked: gacha draw, hero growth, bag use, full hero/bag/gacha endpoints, rewards, currency, USDT, fund pool, and EX V1.
- Verification:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos TypeScript check for `GachaApi` passed.
  - Backend `PlayerApiPhaseGateTest` passed.
  - Backend game/admin compile passed.

## 2026-05-31 Lobby Stage 4Q Battle Start Idempotency Contract

- Backend tightened the existing `POST /api/player/battles/start` contract.
- Cocos already sends explicit `requestId`, `stageCode`, `heroIds`, and `leaderHeroId`; that request must now stay stable when retried.
- Reusing a `requestId` with different stage, lineup, or leader now fails on the backend instead of returning an old session.
- Cocos implication:
  - do not reuse a battle start `requestId` after the player changes formation or stage;
  - current `LobbyBattleFlow` already creates a fresh `battle-start-*` request ID per start attempt.
- Verification:
  - backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed;
  - backend game/admin compile passed.
- Boundary unchanged: no reward, stamina, progress, bag/currency/USDT/fund-pool write, EX V1, or new economy route opened.

## 2026-05-31 Lobby Stage 4R Battle Settlement No-Economy Persistence

- Backend `battle_settlement` now persists explicit no-economy flags for the current Cocos battle result records.
- Persisted flags:
  - `settlement_mode='NO_REWARD'`
  - `reward_granted=0`
  - `readonly_economy=1`
  - `economy_applied=0`
- Local MySQL schema was migrated with `D:\business\project\LootChain\sql\14_battle_settlement_guard_flags.sql`.
- Cocos impact:
  - settlement response still reports `rewardGranted=false` and `readonlyEconomy=true`;
  - no client behavior change is required;
  - future reward/progress work must check these persisted flags before any real economy settlement.
- Verification:
  - local MySQL column check passed;
  - backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed;
  - backend game/admin compile passed.
- Boundary unchanged: no reward, stamina, progress, bag/currency/USDT/fund-pool write, EX V1, or economy route opened.

## 2026-05-31 Lobby Stage 4S Latest-Code Flow Smoke Guard

- Backend `lootchain-game` was restarted from current source on port `8081` before HTTP smoke verification.
- Backend added `D:\business\project\LootChain\scripts\smoke-cocos-current-flow.ps1` as a current Cocos phase guard smoke.
- Current Cocos playable path verified against the restarted backend:
  - existing player dev-login -> lobby -> heroes -> adventure -> battle start -> no-reward settlement -> lobby reread;
  - fresh player local QA shell -> dev-login -> protagonist create -> hero roster first protagonist -> protagonist-only battle -> no-reward settlement;
  - invalid `MAIN_9_9` and `EX_1_1` battle stages rejected before `battle_session` insert;
  - forbidden player endpoints for gacha, bag, and hero growth are blocked by backend phase gate;
  - economy snapshots stay unchanged around blocked calls and no-reward settlement;
  - settlement DB row persists `NO_REWARD`, `reward_granted=0`, `readonly_economy=1`, and `economy_applied=0`.
- Cocos code behavior did not change in this stage; this is latest-code integration verification and documentation sync.
- Boundary unchanged: no reward, stamina, progress, bag/currency/USDT/fund-pool write, EX V1, or economy route opened.

## 2026-05-31 Lobby Stage 4T Recent Battle Readback And Micro Viewport Guard

- Added Cocos support for the backend readonly recent battle record endpoint:
  - `BattleApi.recentBattles()` reads `GET /api/player/battles/recent`;
  - `LobbyBattleFlow` caches recent records and refreshes lobby overlays without writing rewards, stamina, progress, bag, currency, USDT, or fund-pool data;
  - `LobbyAdventurePanelRenderer` shows a compact "recent no-reward challenge" summary beside the recommended stage.
- Hardened physical viewport adaptation for Cocos Preview/browser cases where the design resolution remains `1920x1080` while the actual browser viewport is much smaller:
  - `UiLayout` now carries `viewportWidth` and `viewportHeight`;
  - `LootChainGameRoot.makeLayoutKey()` includes the physical viewport key, so HUD overlays rerender when only the browser viewport changes;
  - `LobbyHudRenderer` has a micro HUD path for `<640px` width or `<420px` height, keeping player entry, stamina, and `公告/冒险/英雄/图鉴` visible.
- `scripts/check-layout.mjs` now mirrors this physical viewport mode and includes `390x300` / `390x340` design-resolution Preview guard cases.
- Verification:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 TypeScript check passed.
  - Backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed.
  - Backend `lootchain-admin,lootchain-game -am -DskipTests compile` passed.
  - Backend current-flow smoke passed and verified recent battle readback for settlement `Sf11d24af1cab49fe9a6560f5b7d0d4d6`.
- Note: the old running Cocos Preview on port `7456` was serving stale compiled script cache during visual QA; source checks and layout guards are current, and Creator Preview should be restarted/reopened before visual screenshot acceptance.
- Boundary unchanged: the new endpoint is GET-only and read-only. No reward, stamina cost, progress write, bag/currency/USDT/fund-pool mutation, EX V1, or economy write endpoint was opened.

## 2026-05-31 Stage 4U Verification Refresh And Preview Reimport Gate

- Supervisor agent remains active as the user-perspective reviewer until the whole playable loop is visually accepted.
- Re-ran latest-code verification on 2026-05-31:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 TypeScript check passed.
  - Backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed.
  - Backend `lootchain-admin,lootchain-game -am -DskipTests compile` passed.
  - Current-flow smoke passed: `battleNo=Bf09e32b56989422085f2c35e00c94b58`, `settlementNo=S8901223518b349639c56a0297fe30bb9`.
  - Fresh-player smoke passed: created user `16`, protagonist hero `13`, `battleNo=Bbad8694fd4234ba68c1844cedb37210e`, `settlementNo=Sa18861ae01c7410ebf7e8d6c107b6e14`.
  - Stage guard smoke passed for `MAIN_9_9` and `EX_1_1`, with no `battle_session` insert.
- Live Preview cache status:
  - `http://localhost:7456/scripting/x/import-map.json` still maps `AdaptiveStageLayoutResolver.ts` to `./chunks/a3/a35bebda9e6bec087e22a9df1d4e9c0b9633ca8c.js`;
  - direct HTTP probing shows that chunk still does **not** contain `viewportWidth` or `viewportHeight`;
  - updating the source file modification times did not make the running Preview regenerate the chunk.
- Added optional Preview freshness gate:
  - `npm.cmd run check:preview`
  - it reads the running Preview import-map/chunks and fails until `AdaptiveStageLayoutResolver.ts` and `LobbyHudRenderer.ts` serve the latest physical-viewport/micro-HUD code.
- Before final screenshot acceptance, use the low-risk Creator-side refresh path:
  1. In Cocos Creator Assets, right-click `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts`.
  2. Run `Reimport Asset`.
  3. Run `Project -> Refresh Device` (`Ctrl+Shift+P`) or close the browser Preview tab/window and start Preview again.
  4. Verify the chunk probe returns `True` for both `viewportWidth` and `viewportHeight`.
- Boundary unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or economy write endpoint was opened.

## 2026-05-31 Stage 4V Recent Readback Fail-Closed And Result Exit

- Product/review agents found two remaining real-play risks and they were fixed:
  - battle result state could still close back to formation through the dim layer or bottom back button;
  - recent battle readback needed to fail closed on `NO_REWARD` records only.
- Cocos changes:
  - `LobbyBattlePreviewPanelRenderer.ts` maps result-state dim clicks to `returnToLobbyFromBattlePreview()` and replaces the bottom `返回编队` action with a disabled `已记录` indicator.
  - `BattleApi.ts` now requires `battleNo`, `settlementNo`, `serverSeed`, and recent `recordedTime`, and rejects recent records unless `settlementMode === 'NO_REWARD'`, `rewardGranted=false`, `readonlyEconomy=true`, and `economyApplied=false`.
  - `LobbyAdventurePanelRenderer.ts` uses clearer copy: current adventure is a no-reward battle preview, not a real reward/progress flow; stage detail only labels same-stage records as `本关`.
  - `LobbyBattlePresentationState.ts` uses `无奖励记录完成` / `演出结果` copy to avoid implying real progression.
  - `LobbyBattleFlow.ts` now retries recent-record loading when a previous error exists, instead of letting stale cached records block the next non-force refresh.
- Backend/API dependency:
  - `GET /api/player/battles/recent` now queries only `settlement_mode='NO_REWARD'`, `reward_granted=0`, `readonly_economy=1`, `economy_applied=0`.
  - `PlayerBattleServiceImpl` also filters the mapper result in Java before mapping VO data.
- Verification after restarting `lootchain-game` from the latest install:
  - Cocos `npm.cmd run check:layout` passed.
  - Focused Cocos Creator 3.8.8 TypeScript check passed.
  - Backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest` passed.
  - Backend `lootchain-admin,lootchain-game -am -DskipTests compile` passed.
  - Current-flow smoke passed: `battleNo=B3f19c9e199234d75be3ac7c2efe8fe56`, `settlementNo=S193a31a22dce42168975334095850464`.
  - Fresh-player smoke passed with recent readback: user `18`, protagonist hero `15`, `battleNo=B4c525184a1ff4b6ebcf5d59800752ebd`, `settlementNo=Sd82006f8403142c6856f69eb62de7ebe`.
  - Stage guard smoke passed for `MAIN_9_9` and `EX_1_1`.
- Preview freshness script status:
  - `npm.cmd run check:preview` currently fails as expected because the already-running Preview still serves stale chunks; rerun it after Creator-side reimport/Preview refresh.
- Boundary unchanged: this remains a no-reward readback/playable preview loop. No reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or economy write endpoint was opened.

## 2026-05-31 Stage 4W Battle Request/Settle Guard Hardening

- Backend battle contract was tightened for the Cocos-only playable loop:
  - battle `requestId` is required and now rejects values longer than 80 characters instead of truncating;
  - same battle-start `requestId` must keep the same stage, ordered lineup, and leader;
  - repeated settle returns the original no-reward settlement and does not write another settlement row.
- Added/expanded backend guard smoke scripts:
  - `D:\business\project\LootChain\scripts\smoke-battle-request-guard.ps1`
  - `D:\business\project\LootChain\scripts\smoke-battle-settle-guard.ps1`
  - expanded `smoke-battle-stage-guard.ps1`
  - hardened `smoke-cocos-current-flow.ps1`
- Verification passed against restarted `lootchain-game` on `http://localhost:8081`:
  - backend `PlayerBattleServiceImplTest,PlayerApiPhaseGateTest`: 14 tests passed;
  - request guard, stage guard, lineup guard, settle guard, current-flow, and fresh-player smoke all passed.
- Cocos source did not need behavior changes in this stage. Keep generating fresh battle/settle `requestId` values from the existing Cocos flow.
- Preview visual acceptance is still blocked only by stale running Preview chunks; run `npm.cmd run check:preview` again after Creator reimport/refresh.
- Boundary unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or economy write endpoint was opened.

## 2026-05-31 Stage 4X Runtime Visual Loop Acceptance

- The running Cocos Preview on `http://localhost:7456` has been refreshed and now passes `npm.cmd run check:preview`.
- Runtime QA used Chrome DevTools Protocol to call the Cocos root component methods directly, avoiding false failures from coordinate clicks.
- Captured visual evidence is under `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime`.
- Desktop evidence covers:
  - lobby HUD;
  - hero roster with the protagonist card;
  - adventure panel;
  - formation panel;
  - battle running state;
  - no-reward settlement result;
  - return to lobby.
- Compact viewport evidence covers:
  - `390x340` lobby;
  - `390x300` lobby;
  - both use the micro HUD path and keep core navigation visible.
- First-login visual evidence covers local QA user `21`:
  - protagonist creation screen with male/female SSR character art;
  - lobby entry after protagonist creation.
- Latest frontend verification:
  - `npm.cmd run check:layout` passed;
  - `npm.cmd run check:preview` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed over 84 TS files under `assets/scripts`.
- Latest backend integration evidence:
  - current-flow smoke passed with `battleNo=B9b348c1923cd4aa6bc1955cbe0fd5226`, `settlementNo=S181511c2f3a14089a45dd65c2c1a3280`;
  - fresh-player smoke passed with user `22`, protagonist hero `19`, `battleNo=B6711d99ceced46bfb3e51d94554cd437`, `settlementNo=S4b35e542e8a84b2988e44ecc75805ca4`;
  - backend focused unit tests passed with 16 tests.
- Product note: the lobby top-left HUD still displays `game_user.nickname`; the protagonist name created on the first-login screen is stored separately and is not yet the lobby display name.
- Boundary unchanged: no reward, stamina cost, mainline progress write, saved formation write, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

## 2026-05-31 Stage 4Y Lobby Display Name Uses Protagonist Name

- The lobby top-left HUD now displays the created protagonist name through the existing `displayName` field.
- Backend `GET /api/player/me/lobby` now returns:
  - `displayName`: protagonist name first, then account nickname/username fallback;
  - `protagonistName`: the current player's stored protagonist name.
- Frontend `PlayerLobbyProfileVO` and `LobbyProfileState` now carry/normalize `protagonistName`; HUD and profile dialog continue rendering from `displayName`.
- Visual evidence:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4y-protagonist-name\user-23-lobby-protagonist-name.png`
  - the top-left name is `SmokeHero23`, matching the protagonist name rather than the account nickname.
- Verification:
  - `npm.cmd run check:layout` passed;
  - `npm.cmd run check:preview` passed;
  - Cocos Creator TypeScript no-emit passed over 84 TS files;
  - backend profile HTTP check returned `displayName=SmokeHero23` and `protagonistName=SmokeHero23`;
  - current-flow and fresh-player backend smokes passed.
- Boundary unchanged: this is a read-only profile-display correction. No reward, stamina cost, mainline progress write, saved formation write, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

## 2026-05-31 Stage 4Z Adventure Stage Local Selection

- Adventure panel now supports explicit local selection of unlocked mainline stages:
  - desktop map nodes and compact rows are clickable;
  - selected rows/nodes show `已选`;
  - adventure detail and the formation CTA follow the selected stage.
- The selection is Cocos-local flow state only:
  - no mainline progress write;
  - no stamina cost;
  - no reward grant;
  - no saved formation;
  - no economy endpoint was opened.
- Files changed:
  - `assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts`
  - `assets/scripts/scenes/LootChainGameRoot.ts`
  - `scripts/check-layout.mjs`
  - `scripts/check-preview-freshness.mjs`
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator TypeScript no-emit passed over `assets/scripts`;
  - backend focused tests passed with 18 tests;
  - backend current-flow smoke passed for user `1`, `MAIN_1_1`, with `rewardGranted=false` and `readonlyEconomy=true`.
- Preview note:
  - `npm.cmd run check:preview` now intentionally checks the new adventure-selection chunks;
  - the currently open Preview on `7456` is still serving stale `LootChainGameRoot.ts` and `LobbyAdventurePanelRenderer.ts` chunks, so visual screenshot acceptance requires Creator-side reimport/refresh before rerunning the check.

### Stage 4Z Runtime Follow-up

- The Cocos Preview refreshed and `npm.cmd run check:preview` now passes.
- Runtime visual QA evidence is under:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4z-adventure-selection`
- Verified path:
  - adventure selected `MAIN_1_1`;
  - formation kept `MAIN_1_1`;
  - battle preview started `battleNo=B810204a94e064015a052f806dc199bec`;
  - no-reward settlement completed with `settlementNo=Sf4ebb68f5cec4eb890141477df987b1c`;
  - settlement still returned `rewardGranted=false` and `readonlyEconomy=true`;
  - return-to-lobby closed battle and formation overlays.
- Re-login/readback verification:
  - opening adventure after the settlement loaded recent record `Sf4ebb68f5cec4eb890141477df987b1c`;
  - recent record kept `rewardGranted=false` and `readonlyEconomy=true`.
- Compact `390x340` adventure selection screenshot was also captured to verify the compact path remains usable.

## 2026-05-31 Stage 4AA Backend Locked Stage Guard

- Backend battle start now follows the same readonly adventure unlock state as the Cocos adventure panel.
- A modified client can no longer start an allowlisted but locked stage such as `MAIN_1_2`; the request is rejected before hero lookup and before `battle_session` insert.
- Cocos behavior remains unchanged: unlocked stage selection is local UI state, and locked choices are not offered as playable targets.
- Backend verification:
  - focused tests passed with 16 tests;
  - `lootchain-admin,lootchain-game` compile passed;
  - `smoke-cocos-current-flow.ps1` passed for `MAIN_1_1` with `battleNo=B89bc55ec53ef46e6954005307f74247d`, `settlementNo=S30208205c7884abf8b2fdcb697bf9870`;
  - `smoke-battle-stage-guard.ps1` passed and now covers locked `MAIN_1_2` in addition to malformed, unavailable, and EX stages.
- Red line unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

### Stage 4AE Runtime Flow Acceptance And Micro HUD Follow-up

- Runtime Cocos QA evidence was captured under:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ae-lobby-goal-tracker`
- Verified Cocos path:
  - login -> lobby goal tracker -> adventure -> formation -> battle preview -> no-reward settlement -> return lobby -> adventure recent readback.
- Runtime IDs:
  - battle `B81f5c9e9f0274c3a81654dcfeeede8e6`;
  - settlement `S0bdab68da86e4438850a87e8a1f5cade`;
  - `rewardGranted=false`;
  - `readonlyEconomy=true`.
- HUD lifecycle fix:
  - Stage 4AE tracker nodes are mounted under `LootChainCocosLoginUIRoot`, not directly under `Canvas`;
  - this keeps different-resolution rerender and overlay cleanup consistent.
- Micro HUD source follow-up:
  - micro scale now uses `clamp(layout.uiScale, 0.72, 1)` instead of design-resolution/window ratio;
  - this prevents the 390x340 Preview from over-scaling target chip and bottom action-bar text.
- Latest verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos TypeScript no-emit passed;
  - backend current-player smoke passed with battle `Bd59ddfb0093d4356a05d83425677b93e`, settlement `Sa06408bc4c614ab8a714125e6692c913`;
  - backend new-player smoke passed with user `26`, protagonist `SmokeHero26`, battle `Be77d09e3caaa46e49adfd95193aaf518`, settlement `S403f91ee819e47efbc14b3934e9002ad`.
- Preview caveat:
  - the open Preview still needs Creator to refresh/reimport `LobbyHudRenderer.ts` for the final micro-scale token;
  - current `npm.cmd run check:preview` failure is limited to missing `layout.uiScale, 0.72, 1`.
- Red line unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

## 2026-05-31 Stage 4AB Locked Stage Frontend UX Guard

- Cocos adventure panel now makes locked stages explicit:
  - desktop map nodes show a `锁` badge and `锁定 {stageName}`;
  - compact rows use dim locked styling and `锁定` prefix;
  - locked taps only show a status message and do not change the current selected stage.
- Root entry points are also hardened:
  - `openLobbyFormationPanel()` rejects locked stages before opening formation;
  - `openLobbyBattlePreviewPanel()` rejects locked stages before preparing battle preview.
- Checks:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator TypeScript no-emit passed for the adventure/root files.
- Preview status:
  - `npm.cmd run check:preview` now passes after Creator refreshed the stale chunks.
- Runtime visual QA:
  - evidence folder: `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ab-locked-stage`;
  - locked `MAIN_1_2` shows `锁` / `锁定 裂隙回廊`;
  - locked taps and forced formation entry both stay in adventure and do not open formation/battle;
  - legal `MAIN_1_1` then completed formation -> battle preview -> battle start `B675f7d4555e744f08720f213d61cbbab` -> no-reward settlement `Sb69829a75ad04a3f99dd251828025ccd` -> return lobby.
- Fresh-player verification:
  - backend `smoke-new-player-flow.ps1` passed for user `24`, protagonist `SmokeHero24`, battle `B42b76a5c3df5492097789795e91e18ce`, settlement `S127c753f3e0747b682963f8506fe69ab`;
  - Cocos visual QA created user `25` as `VisualHero25`; the creation screen and lobby entry screenshots are in the same evidence folder.
- Red line unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

## 2026-05-31 Stage 4AC Battle Result Guidance And Recent Readback UX

- Cocos frontend-only stage; backend code/API/SQL did not change.
- Battle result panel now has a clearer no-reward completion state:
  - result copy says the no-reward record was written;
  - desktop battle result shows `LobbyBattleSettlementReceipt` with settlement number, battle number, reward status, resource status, and progress status;
  - player-facing wording avoids raw debug fields and says “奖励未开放 / 资源未变更 / 进度不推进”.
- Adventure detail now uses `LobbyAdventureRecentBattleSummaryCard`:
  - recent battle result, time/target, and no-reward resource guard are separated into readable lines;
  - empty/loading/error states still do not imply rewards or progression.
- Guard scripts updated:
  - `scripts/check-layout.mjs` checks the new result/readback nodes and copy tokens;
  - `scripts/check-preview-freshness.mjs` now probes the battle-preview chunk too, so stale Preview output is caught.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator TypeScript no-emit passed for the changed battle/adventure files;
  - `git diff --check` passed with existing LF->CRLF warnings only.
- Preview note:
  - the currently running Preview on `7456` is stale for this stage and `npm.cmd run check:preview` fails until Creator refreshes/reimports the changed scripts or Preview is reopened.
- Red line unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

### Stage 4AD Runtime Acceptance Follow-up

- The Stage 4AC Preview cache blocker is cleared: `npm.cmd run check:preview` now passes.
- Runtime visual QA evidence is under:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ad-result-guidance`
- Verified screenshots:
  - adventure recent-record card before battle;
  - formation targeting `MAIN_1_1`;
  - battle ready-to-record state;
  - result page with `LobbyBattleSettlementReceipt`;
  - adventure recent-record card after returning to lobby.
- Runtime Cocos settlement:
  - stage `MAIN_1_1`;
  - battle `B05d15599907544cea526baba82b0cb12`;
  - settlement `Sc6ee0f5062f44317a0333c5c3d7fde30`;
  - `rewardGranted=false`;
  - `readonlyEconomy=true`.
- Backend smoke rerun:
  - `scripts/smoke-cocos-current-flow.ps1` passed for user `1`, `MAIN_1_1`;
  - latest smoke settlement `S335a2554c0c74ba1b462d97f27de8e9e` still kept `rewardGranted=false` and `readonlyEconomy=true`.
- Latest checks:
  - `npm.cmd run check:layout` passed;
  - `npm.cmd run check:preview` passed;
  - focused Cocos Creator TypeScript no-emit passed.
- Red line unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.

### Stage 4AE Lobby Next-Step Goal Tracker

- Cocos frontend-only stage; backend code/API/SQL did not change.
- Lobby HUD now has a read-only next-step target:
  - desktop: `LobbyGoalTracker`;
  - compact: `LobbyCompactGoalTracker`;
  - micro viewport: `LobbyMicroGoalChip`.
- Tracker data is derived only from existing lobby adventure state, current local selected stage, and recent battle readback.
- Tracker click only opens the existing adventure panel. It does not start battle, bypass formation, grant rewards, spend stamina, save formation, or advance mainline progress.
- Guard scripts updated:
  - `check-layout` checks host methods, allowed click contract, and tracker bounds across desktop/compact/micro layouts;
  - `check-preview` checks the HUD Preview chunk for the new tracker tokens.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator TypeScript no-emit passed;
  - Cocos and backend `git diff --check` passed with existing LF->CRLF warnings only;
  - backend current-flow smoke passed for user `1`, `MAIN_1_1`, battle `B3c2c3bee321449cf9ffe379e32f947fd`, settlement `S4fd31cbe921e4edbb1af0c60438682bd`, `rewardGranted=false`, `readonlyEconomy=true`.
- Preview note:
  - the running Preview on `7456` is stale for `LobbyHudRenderer.ts` and `npm.cmd run check:preview` fails until Creator refreshes/reimports or Preview is reopened;
  - no runtime screenshots were captured for this stage yet because the served chunk still misses the new tracker.
- Red line unchanged: no reward, stamina cost, progress write, saved formation, bag/currency/USDT/fund-pool mutation, EX V1, or new economy write endpoint was opened.
## 2026-05-31 Stage 4AF Fresh Player Runtime Closure

- Cocos-only 新玩家完整流程已在最新 Preview 下跑通：
  - 新建本地 userId `29`;
  - Cocos dev-login;
  - 主角创建页创建 `VisualHero29`;
  - 大厅左上角显示 `VisualHero29`;
  - 主角英雄 `26` 自动作为第一位可上阵英雄进入本地编队;
  - 冒险 `MAIN_1_1` -> 编队 -> 战斗预演 -> 无奖励结算 -> 返回大厅 -> 最近记录回读。
- 运行时 ID：
  - battle `B8a2ffc4fea6e40689e3a03030d156d03`;
  - settlement `S013e12191ed944ca89b43cecf79a5fc6`;
  - `rewardGranted=false`;
  - `readonlyEconomy=true`。
- 新增/修复：
  - `assets/scripts/scenes/lobby/LobbyHeroRosterLoader.ts` 复用正在加载中的英雄队列 Promise，修复快速打开编队/战斗预演时可能拿到空阵容的竞态；
  - `cancel()` 会让旧请求失效，避免切换登录玩家后慢响应覆盖新玩家队列；
  - `tmp/stage4ae-fresh-player-qa.mjs` 拆分等待步骤：创建/进入大厅、冒险选关、编队队列加载、战斗预演、结算、最近记录回读。
- 视觉证据：
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ae-lobby-goal-tracker`
- 验证通过：
  - `npm.cmd run check:layout`;
  - `npm.cmd run check:preview`;
  - focused Cocos Creator TypeScript no-emit;
  - 后端 current-flow smoke：battle `B7af2444b982847219d02983aa45d5443`，settlement `S7d2455aff3604567ae56a4c83d2c3390`;
  - 后端 fresh-player smoke：user `30`，protagonist `SmokeHero30`，hero `27`，battle `B7bf0f5841814478396d8b9d4a4d001ab`，settlement `Sa3d6e79624f34e4ab217b8f32efad150`。
- 当前闭环仍是 no-reward playable preview：不发奖励、不扣体力、不推进进度、不保存编队、不改背包/货币/USDT/资金池、不开放 EX V1、不新增经济写入口。

## 2026-05-31 Stage 4AG 韧性闭环验收

- 本阶段继续保持 Cocos-only，不回到 `web-vue`。
- 产品/玩家视角：
  - 正常玩家可以从登录进入大厅，再进入冒险、编队、战斗预演、无奖励结算、返回大厅并看到最近记录；
  - 刷新或重新登录后，最近战斗记录仍能回读；
  - 非法 `EX_1_1` 和锁定 `MAIN_1_2` 不会打开编队或战斗。
- UI/交互修复：
  - 登录弹框内容区新增 `BlockInputEvents`，弹框内点击不会穿透到底层登录按钮；
  - 大厅所有弹框内容区已运行时复验阻断：个人信息、公告、图鉴、英雄、占位、冒险、编队、战斗；
  - 编队页在英雄队列加载中、加载失败或为空时禁用 `战斗预演`，避免空阵容误入战斗预览。
- 研发/测试补充：
  - 新增 `tmp/stage4ag-resilience-qa.mjs` 作为 Cocos Preview 运行时韧性脚本；
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 已同步守卫登录阻断、面板阻断、目标追踪、英雄队列竞态、战斗结算与回读 token。
- 最新 Cocos 运行时证据：
  - 证据目录 `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ag-resilience`；
  - 覆盖 `1920x900`、`1280x720`、`390x340`；
  - battle `B3525e4db77d94108a1c0379773366153`；
  - settlement `S6f721e05eee049658795824d15ddce0f`；
  - `rewardGranted=false`，`readonlyEconomy=true`，`economyApplied=false`；
  - 快速点击计数：battle start `1` 次，settle `1` 次。
- 最新验证通过：
  - `npm.cmd run check:layout`；
  - `npm.cmd run check:preview`；
  - focused Cocos Creator TypeScript no-emit；
  - 后端 current-flow、stage guard、lineup guard、request guard、settle guard、fresh-player smoke。
- 后端 smoke 最新记录：
  - current-flow user `1`：battle `B4031d43401ee4f2ca943675aa2dcf88a`，settlement `Secdd9cd5dcbd487bacaada9cb7f6ddfb`；
  - fresh-player user `31`：protagonist `SmokeHero31`，hero `28`，battle `Bf4ce3ccc1a4949cfbf8a534d21495f02`，settlement `S747eaef629204fe3a737933183504b5e`；
  - fresh-player stamina `100 -> 100`，combatPower `9432 -> 9432`。
- 红线不变：不发奖励、不扣体力、不推进进度、不保存编队、不改背包/货币/USDT/资金池、不开放 EX V1、不新增经济写入口。

## 2026-05-31 Stage 4AH 全屏战斗与英雄详情只读展示

- 本阶段继续保持 Cocos-only，不回到 `web-vue`。
- 产品/设计结论：
  - 战斗不再作为缩小弹框呈现，而是进入大厅内的全屏战斗逻辑视图；
  - 当前仍不切换到独立 Cocos Scene，先用 `currentView = 'battle'` 和 `LobbyBattleSceneRoot` 打通完整流程，降低资源和生命周期风险；
  - 英雄列表中的英雄卡可点击进入详情，详情只做信息展示，不提供升级、升星、觉醒、装备、抽卡或领取入口。
- UI/美术落地：
  - 新增高质量战斗背景素材 `assets/resources/ui/battle/battle_scene_cathedral.png`；
  - 新增英雄详情背景 `assets/resources/ui/hero-detail/hero_detail_backdrop.png`；
  - 新增主角详情动态立绘素材 `assets/resources/ui/hero-detail/hero_detail_protagonist.png`；
  - 详情层包含动态光效、主角立绘呼吸动画、名称、稀有度、星级、形态、属性、技能和只读说明。
- 研发落地：
  - `LootChainGameRoot.ts` 增加 `battle` 视图、`renderBattleScene()`、英雄详情打开/关闭/返回英雄列表流程；
  - `LobbyBattlePreviewPanelRenderer.ts` 升级为全屏战斗表现层，保留 no-reward battle flow、结算回执和内容区输入阻断；
  - `LobbyHeroRosterPanelRenderer.ts` 支持点击英雄卡打开详情；
  - 新增 `LobbyHeroDetailPanelRenderer.ts`，所有英雄详情数据均来自只读英雄队列本地派生；
  - `UiSpriteFrameCache.ts` 预加载本阶段新增 UI 资源；
  - `scripts/check-layout.mjs` 和 `scripts/check-preview-freshness.mjs` 已同步守卫全屏战斗、英雄详情、资源预加载和英雄卡点击 token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `git diff --check` 通过，仅保留仓库既有 LF->CRLF warning；
  - `npm.cmd run check:preview` 未通过，原因是当前打开的 Cocos Preview 仍在服务旧 chunk：缺少 `renderBattleScene`、`LobbyBattleSceneRoot`、`openLobbyHeroDetail` 和 `LobbyHeroDetailPanelRenderer` import-map entry。需要刷新/重开 Creator Preview 后复验。
- 红线不变：
  - 不发奖励；
  - 不扣体力；
  - 不推进主线进度；
  - 不保存编队；
  - 不改背包、货币、USDT、资金池；
  - 不开放 EX V1；
  - 不新增任何经济写入口。

## 2026-06-01 Stage 4AO Remaining Popup Paths Converted To Full-Screen Scenes

- 本阶段继续保持 Cocos-only，不回到 `web-vue`。
- 剩余弹层式路径已改为全屏逻辑场景：
  - 登录账号页：`LoginAccountSceneRoot` / `LoginAccountScenePanel`；
  - Gacha 本地 mock 结果：`currentView = 'gachaResult'` + `GachaResultSceneRoot`；
  - 未开放占位入口：`LobbyPlaceholderSceneRoot` / `LobbyPlaceholderScenePanel`。
- Gacha 结果仍只使用本地固定 mock，不请求真实抽卡、不扣资源、不发英雄、不写抽卡记录或保底。
- `check:layout` 和 Preview freshness 守卫已改为检查新的全屏场景 token，不再检查旧弹层节点。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Cocos Preview 仍在服务旧 chunk；刷新/重开 Creator Preview 后需要复验。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AR Lobby Feature Entries Full-Screen Scenes

- 大厅功能入口不再保留大厅背景作为底图，也不再把功能内容浮在大厅 HUD 上。
- `renderLobbyScenePage()` 现在走 `renderBase()` 清空当前内容，再渲染 `LobbyFeatureSceneBackdrop` 作为独立全屏功能场景。
- 资料、公告、冒险、编队、英雄、英雄详情、图鉴、占位入口的内容层已改为 `Lobby*SceneContent` / `Lobby*SceneFrame`，并按 `layout.stageWidth/stageHeight` 铺满舞台。
- `check:layout` 和 `check:preview` 已同步检查新的全屏场景 token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Creator Preview 还在服务旧 chunk；刷新/重开 Preview 后需要复验。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AQ Login Background Poster/Video Only

- 登录页背景现在只允许激活 `Login_BG_Poster` 和 `Login_BG_Video`。
- `BG_Main`、`Sky_Effects`、`FG_Architecture`、`Dragon_Layer`、`Character_Effects`、`Foreground_Effects` 等旧静态舞台层在登录态也会被强制关闭，避免盖住视频。
- 登录布局测量节点改为 `Login_BG_Poster` / `Login_BG_Video`。
- `LoginVideoBackground` 增加 poster 隐藏兜底：视频播放请求后即使 `PLAYING` 事件没有及时触发，也会隐藏 poster，避免一直显示静态图。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Creator Preview 还在服务旧 chunk；刷新/重开 Preview 后需要复验。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AP Login Account Scene And Video Restore Hardening

- 针对“登录背景视频没了、账号登录仍像弹框”的反馈，账号登录页已从 `loginDialog` 逻辑名改为 `loginAccount`。
- `LoginRenderer` 改为 `renderLoginAccountScene()` / `openLoginAccountScene()`，账号页不再渲染登录首页的右侧 rail 和主入口按钮。
- `LoginAccountScenePanel` 改为全屏半透明场景面，并增加顶部/底部场景压层，避免继续像居中弹框。
- `LoginVideoBackground` 新增 `resumeForLoginView()`，Root 回到登录/账号登录场景时会恢复视频节点、poster 兜底和静音播放。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，原因是运行中的 Creator Preview 还在服务旧 chunk；刷新/重开 Preview 后需要复验。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AM 主角创建本地库修复

- 用户反馈点击主角选择页“进入游戏”提示“系统异常”。
- 排查结论：
  - Cocos 登录与 `dev-login` 成功；
  - `GET /api/player/protagonist/state` 返回后端 `code=500`；
  - 本地 MySQL `lootchain` schema 缺少 `player_protagonist` 表。
- 本机已执行后端既有迁移脚本 `D:\project\LootChain\sql\12_protagonist_module.sql`：
  - 创建 `player_protagonist`；
  - 补齐 `user_hero.source_type` 与 `user_hero.sort_weight`；
  - 插入男女主角攻击形态服务端模板。
- 验证结果：
  - 默认 `userId=1` 的 `GET /api/player/protagonist/state` 已返回 `code=0` 且 `created=false`，未提前创建玩家主角；
  - 使用测试玩家 `userId=3` 复验 `POST /api/player/protagonist` 成功，确认创建链路恢复；
  - `npm.cmd run check:layout` 与 focused Cocos Creator TypeScript no-emit 已通过，前后端 `git diff --check` 已通过且仅有既有 LF->CRLF warning；
  - 如重置本地库或换机器后再次出现同类 500，先确认 SQL 12 是否已执行。
- 红线不变：未改经济规则，未开放 EX V1，未新增抽卡、奖励、购买、资金池或任何经济写入口。

## 2026-06-01 Stage 4AN 大厅功能页闪登录背景修复

- 问题：点击部分大厅功能弹框/功能页时，会短暂闪出登录页背景视频。
- 根因：功能页整页重绘会先释放并清空大厅 `Lobby_BG_Poster` / `Lobby_BG_Video`，而主场景里的登录背景视频节点仍在底层常驻，导致大厅背景重建前露出登录视频。
- Cocos 修复：
  - `LootChainGameRoot.ts` 新增登录舞台节点显隐控制，离开 `login/loginDialog` 后隐藏 `Login_BG_Video`、`Login_BG_Poster`、`BG_Main`、`Sky_Effects` 等登录静态节点；
  - 登录舞台隐藏只控制节点 `active`，不再主动 `stop()` 登录背景视频；
  - 回到登录页时通过 `tryPlayLoginSceneVideo()` 尝试恢复登录背景视频播放；
  - 新增 `renderLobbyWorldBase()`，大厅功能页切换时保留 `Lobby_BG_Poster`、`Lobby_BG_Video`、`Lobby_BG_Fallback`，只替换 HUD/页面层；
  - `UiContentRootController.ts` 新增 `clearExcept()`，用于保留指定运行时背景节点；
  - 返回大厅时走 `renderCurrentView()`，复用已有大厅背景保活刷新路径。
- 守卫同步：
  - `scripts/check-layout.mjs` 已加入登录舞台隐藏、背景节点保留、功能页不释放大厅背景的检查；
  - `scripts/check-preview-freshness.mjs` 已加入 Preview chunk freshness token。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前失败，运行中的 Cocos Preview 仍在服务旧 `LootChainGameRoot.ts` chunk；刷新/重开 Preview 后再复验。
- 追加修正：
  - 上一版主动停止登录视频会导致回到登录页后背景视频不再播放；
  - 当前已改为隐藏/显示登录舞台，并在登录页显示时重新尝试播放视频。
- 红线不变：本次不改经济规则，不开放 EX V1，不新增抽卡、奖励、购买、资金池或任何经济写入口。

## 2026-05-31 Stage 4AJ 召唤祭坛 Gacha 全屏预览

- 本阶段继续保持 Cocos-only，不回到 `web-vue`。
- 多角色结论：
  - 产品：召唤祭坛应作为独立全屏页面承载，不再用大厅弹框；
  - 数值：当前只记录 `NORMAL_HERO` 现有配置，不修改概率、保底、消耗或碎片规则；
  - 架构/审查：真实单抽、十连、兑换、补发都属于经济写入，当前不能开放；
  - UI/美术：按参考图方向建立暗黑哥特召唤大厅、左卡池、中央卡牌、右功能栏、底部召唤按钮。
- 本轮 Cocos 落地：
  - 新增 `assets/scripts/scenes/gacha/GachaSceneConfig.ts`；
  - 新增 `assets/scripts/scenes/gacha/GachaSceneRenderer.ts`；
  - 新增运行时背景 `assets/resources/ui/gacha/gacha_bg_cathedral.png`；
  - `深渊召唤` 活动入口和 `召唤祭坛` 场景热点进入 `currentView = 'gacha'` 全屏预览；
  - 单抽/十连按钮只显示关闭提示，不调用后端抽卡接口。
- 文档/素材：
  - 新增视觉参考 `docs/ui-reference/gacha/generated/gacha_bg_cathedral.png`；
  - 新增视觉目标稿 `docs/ui-reference/gacha/generated/gacha_ui_target_mockup.png`；
  - 后端项目新增 `docs/gacha/gacha-current-stage-output.md` 和 `docs/gacha/gacha-art-pack-manifest.json`。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过。
- 红线不变：不发奖励、不扣资源、不发放英雄、不更新保底、不开放兑换、不开放 EX V1、不新增任何经济写入口。

## 2026-06-01 Stage 4AK Gacha 本地结果预览层

- 本阶段只推进 Cocos 前端，不改后端代码、接口、SQL 或经济配置。
- 新增本地 mock 结果配置：
  - `GachaMockResultItem`
  - `GACHA_MOCK_RESULT_ONCE`
  - `GACHA_MOCK_RESULT_TEN`
- 单抽/十连按钮现在打开 `GachaMockResultLayer` 全屏遮罩结果层，展示固定 mock 卡牌结果；弹层内明确提示“未扣资源、未写入抽卡记录、未发放英雄、未更新保底”。
- 结果卡、遮罩、按钮和描边都由 Cocos `Graphics` 绘制，保持高清矢量式显示，不依赖模糊截图素材。
- `scripts/check-layout.mjs` 已新增 Gacha 本地结果层和前端-only 守卫；`scripts/check-preview-freshness.mjs` 已加入 Gacha 结果层运行包 freshness token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- Preview 状态：`npm.cmd run check:preview` 当前失败，运行中的 Cocos Preview 仍在服务旧 `GachaSceneRenderer.ts` chunk，刷新/重开 Preview 后再复验。
- 红线不变：不调用真实抽卡接口，不扣资源，不发英雄，不写入抽卡记录/保底，不开放兑换/补发，不开放 EX V1，不新增任何经济写入口。

## 2026-06-01 Stage 4AL 主角选择页全屏场景化

- `protagonistCreate` 仍是单 Cocos 主场景内的逻辑视图，但选择角色 UI 已从居中弹框改成全屏场景。
- `ProtagonistCreatePanel` 现在按安全区全屏铺开，使用 `drawFullSceneFrame()` 绘制薄边框、顶部/底部暗色压层和全屏输入拦截。
- 男/女主角卡、SSR 形态预览、角色名输入与“进入游戏”按钮按全屏舞台重新排布，避免看起来像登录后的弹窗。
- 本阶段不改主角创建接口：客户端仍只提交 `gender` 和 `protagonistName`，不提交英雄模板、稀有度、等级、星级、战力或属性。
- 守卫同步：
  - `scripts/check-layout.mjs` 已更新主角选择全屏场景的多分辨率布局检查；
  - `scripts/check-preview-freshness.mjs` 已新增 `ProtagonistCreateRenderer.ts` 全屏场景 freshness token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- Preview 状态：`npm.cmd run check:preview` 当前失败，运行中的 Cocos Preview 仍在服务旧 `ProtagonistCreateRenderer.ts` 和旧 `GachaSceneRenderer.ts` chunk；刷新/重开 Preview 后再复验。
- 红线不变：主角创建仍只是账号初始化能力，不开放抽卡、奖励、购买、结算、资金池、链上领取、EX V1 或任何经济写入口。

## 2026-05-31 Stage 4AI 大厅弹框改为场景式切换

- 本阶段继续保持 Cocos-only，不回到 `web-vue`。
- 产品/交互调整：
  - 登录账号页也纳入场景页规则，不再保持小弹框比例；
  - 大厅里的个人信息、公告、冒险、编队、英雄、英雄详情、图鉴、占位入口全部从“弹框覆盖大厅 HUD”改为“场景式页面切换”；
  - 当前实现仍在同一个 Cocos 主场景内完成，通过 `currentView` 切换逻辑场景，避免拆多个 `.scene` 导致登录态、资源缓存和 no-reward battle flow 被大范围重写；
  - 功能页保留大厅动态背景作为世界底图，但不再渲染大厅 HUD，因此视觉和交互上不再是弹框。
- 研发落地：
  - `LootChainGameRoot.ts` 的 `ViewName` 新增 `profile`、`adventure`、`codex`、`formation`、`heroes`、`heroDetail`、`notice`、`placeholder`；
  - 新增 `renderLobbyScenePage()`、`isLobbyScenePageView()`、`returnToLobbyFromScenePage()`；
  - 大厅 `renderLobby()` 只渲染背景和 HUD，不再渲染任何功能弹框；
  - 打开各入口时设置对应 `currentView` 并整页重绘；
  - 关闭/返回按钮统一回大厅，英雄详情的“返回英雄”回英雄列表；
  - loader 的刷新回调在功能页下会重绘当前逻辑场景。
- UI 调整：
  - 登录账号页改为按安全区铺开的全屏页面；
  - 公告、冒险、编队、英雄、图鉴、英雄详情、个人资料、占位页的面板尺寸改为按安全区铺开的全屏页面；
  - 遮罩层只挂 `BlockInputEvents` 阻断底层输入，不再点击遮罩关闭；
  - 主要关闭按钮文案改为 `返回大厅`，避免继续表达“弹框关闭”。
- 守卫脚本：
  - `scripts/check-layout.mjs` 已加入场景式页面 token、全屏页面尺寸断言和遮罩不关闭规则；
  - `scripts/check-preview-freshness.mjs` 已加入新逻辑场景切换 token 和各页面 `返回大厅`/`dim.addComponent(BlockInputEvents)` token。
- 验证状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `npm.cmd run check:preview` 当前仍失败，原因是 Cocos Preview 继续服务旧 chunk，需要刷新/重开 Creator Preview；
  - `git diff --check` 通过，仅有仓库既有 LF->CRLF warning。
- 红线不变：
  - 不发奖励；
  - 不扣体力；
  - 不推进主线进度；
  - 不保存编队；
  - 不改背包、货币、USDT、资金池；
  - 不开放 EX V1；
  - 不新增任何经济写入口。

## 2026-06-01 Stage 4AS 全屏功能页返回按钮统一

- 所有大厅功能页的返回入口统一为 Gacha 同款左上角金色箭头按钮。
- 新增共享组件 `assets/scripts/scenes/UiSceneBackButton.ts`，Gacha 和大厅功能页都走同一个 `renderSceneBackButton()`。
- 已接入页面：资料、公告、冒险、编队、英雄、英雄详情、图鉴、未开放占位页、战斗预览页。
- 旧底部“返回大厅”文字按钮已从大厅功能页移除，底部仅保留刷新、战斗预演等非返回操作。
- 验证状态：`npm.cmd run check:layout` 通过；focused Cocos Creator TypeScript no-emit 通过；`npm.cmd run check:preview` 当前仍提示运行中的 Preview 是旧 chunk，需要刷新/重开 Cocos Creator Preview 后复验。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口，不接真实抽卡写接口。

## 2026-06-01 Stage 4AT 召唤中心 Spine 动画接入

- 召唤预览页中心展示从 5 张本地占位卡替换为 `assets/spine/gacha/Lord of the Dark Abyss/1605.json` 导入的 Spine 骨骼动画。
- 新增 Gacha Spine 配置：UUID `ce6aee72-45cb-4315-abfd-74ac40b8d0ce`，皮肤 `0`，先播 `appear`，再循环 `idle`。
- `GachaSceneRenderer.ts` 通过 `assetManager.loadAny` 运行时加载 `sp.SkeletonData`，渲染 `GachaAbyssSpineStage` / `GachaAbyssSpineNode`；真实抽卡结果页的本地 mock 卡片保持不变。
- `check:layout` 与 `check-preview-freshness` 已加入 Spine 资源存在性和 Gacha 渲染 token 守卫。
- 验证状态：`npm.cmd run check:layout` 通过；focused Cocos Creator TypeScript no-emit 通过；Preview 仍需刷新/重开后复验最新 chunk。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口，不接真实抽卡写接口。

## 2026-06-01 Stage 4AU 移除友情召唤入口

- 按反馈移除 Gacha 预览卡池中的 `friend` / “友情召唤”入口。
- 当前召唤预览仅保留：限定召唤、英雄召唤、普通召唤、光暗召唤锁定占位。
- `scripts/check-layout.mjs` 新增守卫，阻止 Gacha 配置重新出现 `id: 'friend'` 或“友情召唤”。
- 红线不变：不改经济规则，不开放 EX V1，不新增任何经济写入口，不接真实抽卡写接口。

## 2026-06-01 Backend Hero Roster Art Sync

- 后端 `hero_template` 已新增 `portrait_asset` 纯展示字段，记录不带扩展名的 `act_数字` 立绘资源编号。
- 用户指定素材已同步到数据库与文档：
  - 深渊魔女·伊芙琳：`act_21053`
  - 永夜龙骑·阿尔萨斯：`act_21023`
- R/SR/SSR 启用模板已按职业收敛；UR 已补齐战士、辅助、刺客、法师、射手、坦克六职业各一个。
- 新增 UR 当前仅作为模板与图鉴展示数据，未加入 `gacha_pool_item`，因此 Cocos 召唤页仍保持本地预览/mock，不接真实抽卡、不发英雄、不写抽卡记录或保底。
- 立绘源文件当前仍位于 `C:\Users\axian\Desktop\hero`；如需 Cocos 直接显示，需要后续单独导入到 `assets/resources` 并刷新 Creator 生成 `.meta`。

## 2026-06-01 Stage 4AV Hero Portrait Resource Keys And Gacha Spine Swap

- Cocos 只读英雄/图鉴类型与 API 已接收后端 `portraitAsset` 字段，语义为不带扩展名的 `act_数字` 资源编号，后续可按资源目录约定加载对应 PNG/SpriteFrame。
- 当前不改变英雄列表/图鉴渲染，只建立资源映射字段；不调用养成、抽卡、背包、奖励、购买、出售或任何经济写入口。
- Gacha 中心 Spine 已改用 `assets/spine/gacha/huangfengjiaozong/huangfengjiaozong.skel`，UUID `ef87498c-2ef4-44e6-bee9-2d499e6ac570`，`default` 皮肤循环 `idle`。
- Gacha 背景与中心舞台已移除原有红色圆圈/法阵环，保留暗色背景、Spine 和本地 mock 结果预览。
- `scripts/check-layout.mjs` 已同步检查 huangfengjiaozong Spine 资源、`portraitAsset` 只读解析、旧红圈颜色回归守卫，以及友情召唤仍移除。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit。
- 边界不变：不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。
## 2026-06-01 Stage 4AZ Gacha Spine Runtime Fallback

- 当前 `huangfengjiaozong` 能被资源系统加载，但 Cocos Spine runtime 在 `getRuntimeData(true)` 阶段解析失败，通常表示 `.skel/atlas/texture` 不匹配或导出格式不被当前运行时支持。
- Gacha 中心现在仍优先尝试 `spine/gacha/huangfengjiaozong/huangfengjiaozong`；如果运行时解析失败，会临时显示已验证可播放的 `spine/gacha/Lord of the Dark Abyss/1605`，避免中心区域继续空白。
- 页面会保留明确诊断提示：`huangfengjiaozong Spine 运行时解析失败，已临时显示可用预览 Spine；需要重新导出 huangfengjiaozong。`
- `check:layout` 与 `check-preview-freshness` 已同步检查 fallback Spine 配置、资源和渲染 token。
- 边界不变：不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4AW Gacha Spine Runtime Resource Fix

- `huangfengjiaozong` Spine 已从非运行时资源目录移入 `assets/resources/spine/gacha/huangfengjiaozong/`，供 Cocos `resources` bundle 正常加载。
- Gacha 中心动画现在优先通过 `resources.load('spine/gacha/huangfengjiaozong/huangfengjiaozong', sp.SkeletonData)` 加载；保留 UUID `ef87498c-2ef4-44e6-bee9-2d499e6ac570` 作为兜底。
- 这次修正解释了 Preview 没显示新 Spine 的原因：代码配置已切换，但旧目录不在 `resources` 运行时包内，同时运行中的 Preview 仍可能服务旧 chunk。
- `check:layout` 与 `check-preview-freshness` 已同步到新资源路径和加载方式。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit。
- Preview 复验：需要在 Cocos Creator 中刷新/重开 Preview，等待资源重新导入后再进入 Gacha；当前运行中的旧 Preview 会继续提示 stale chunk。
- 边界不变：不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4AX Gacha Spine Skin/Animation Auto Resolve

- Preview 已确认能服务 `huangfengjiaozong` SkeletonData、`.bin` 和贴图资源；空白原因进一步收敛为资源内部皮肤/动画名与代码固定的 `default` / `idle` 不一致。
- `GachaSceneRenderer.ts` 现在会通过 `getSkinsEnum()` / `getAnimsEnum()` 自动选择可用皮肤和动画；找不到 `default` 或 `idle` 时不再静默失败。
- 只有实际拿到 Spine TrackEntry 后才移除加载 fallback，避免“动画没播但界面空白”。
- 运行时会在控制台输出 `[Gacha] huangfengjiaozong spine applied: skin=..., animation=..., size=...`，用于复验实际命中的皮肤、动画和尺寸。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit。
- Preview 复验：需要重开/刷新 Cocos Creator Preview 后再进入 Gacha；旧 Preview chunk 不包含本轮自动解析逻辑。
- 边界不变：不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4AY Gacha Spine No-Animation Static Pose Fallback

- 当前 `huangfengjiaozong` 已能被 Cocos 加载，但运行时未枚举到可播放 animation，界面会提示导出动画列表缺失。
- Gacha 中心 Spine 现在在无 animation 时不再一直显示 `黄风教宗准备中`，而是调用 `setToSetupPose()` 展示静态骨骼首帧。
- 如果 `skel/atlas/texture` 匹配失败，仍保留 fallback 并显示运行时解析失败提示。
- `check:layout` 与 `check-preview-freshness` 已同步静态骨骼首帧兜底 token。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit；`git diff --check`。
- 后续如要动态播放，需要美术重新导出包含 animation 的 `huangfengjiaozong` Spine；前端会自动选择实际存在的动画名。
- 边界不变：不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Hero Detail Spine Asset Field Sync

- 后端 `hero_template` 新增 `spine_asset` 展示字段，用于英雄详情页骨骼动画资源目录。
- 字段值由 `portrait_asset` 派生：复制后将 `act` 替换为 `npc`，例如 `act_1057 -> npc_1057`。
- 本地 `lootchain` 库已执行 `D:\project\LootChain\sql\16_hero_spine_asset.sql`；复验 `spine_asset` mismatch 计数为 `0`。
- 后端只读英雄/图鉴 VO 已带出 `spineAsset`，Cocos `LobbyHeroApi`、`LobbyCodexApi`、`LobbyHeroTypes`、`LobbyCodexTypes`、`HeroTypes` 已接收该字段。
- 当前只同步资源映射契约，不改英雄详情渲染流程，不接真实抽卡、不扣资源、不发英雄、不写抽卡记录/保底、不开放 EX V1、不新增经济写入口。

## 2026-06-01 Stage 4BA Gacha Status Text Position Fix

- Gacha 页全局状态提示现在有专用位置：`layout.stageBottom + 210 * layout.uiScale`。
- 这样 Spine 解析失败、fallback、概率/记录/兑换等本地提示不会再压住底部 `召唤1次` / `召唤10次` 按钮。
- `StatusPresenter.set()` 已支持传入 `layout/y` 来重新定位已有状态文字。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit；`git diff --check`。
- 当前运行中的 Preview 仍是旧 chunk，需要重开或刷新 Cocos Creator Preview 后才能看到新位置。
- 边界不变：不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4BB Gacha Spine JSON Export Handoff

- `huangfengjiaozong` 已补充导出 JSON runtime 文件：`assets/resources/spine/gacha/huangfengjiaozong/huangfengjiaozong.json`。
- 本地检查确认 JSON 包含 `default` skin 和 `idle` animation；atlas 引用 `huangfengjiaozong.png` 与 `huangfengjiaozong2.png` 两张图集页。
- 为避免同目录旧 `.skel` 与新 `.json` 同名时资源路径命中旧二进制，Gacha 目标 Spine 现在优先按新 JSON SkeletonData UUID `178d1dbd-5a53-459b-83bb-2f05c623d99e` 加载，`resources.load` 路径只作兜底。
- `check:layout` 已同步校验 JSON、atlas page、Spine 3.8.x 版本、`default` skin 和 `idle` animation。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit；`git diff --check`（仅既有 LF/CRLF warning）。
- `npm.cmd run check:preview` 当前仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk；复验需要重开或刷新 Preview，等待新资源重新导入后再进入 Gacha。
- 边界不变：该调整只影响 Cocos 前端视觉预览资源加载，不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4BC Gacha Huangfeng Ground Alignment

- `huangfengjiaozong` 已能在 Gacha 中心显示后，位置从偏空中下调到地面基准。
- Spine 节点现在使用 `spineGroundY = -stageHeight * 0.49`，底部阴影跟随下移到 `spineGroundY - 22 * scale`，让角色更贴近背景中央地面/法阵。
- 已移除中心局部透明遮罩，改为加深全屏 `GachaAbyssAtmosphere` 暗幕，统一压暗整个召唤背景，避免中间出现透明框。
- `check:layout` 与 `check-preview-freshness` 已同步守卫该位置基准和全屏背景压暗层，并禁止中心局部矩形遮罩回归。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit；`git diff --check`（仅既有 LF/CRLF warning）。
- `npm.cmd run check:preview` 当前仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，尚未包含这次全屏暗幕加深和落地位置 token。
- 复验仍需要重开或刷新 Cocos Creator Preview。
- 边界不变：只调整前端视觉坐标，不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4BD Gacha Huangfeng Size And Lower Placement

- 按反馈继续放大并下移 Gacha 中心 `huangfengjiaozong`。
- `spineGroundY` 已从 `-stageHeight * 0.49` 调为 `-stageHeight * 0.55`。
- Spine 缩放基数已从 `0.36` 调为 `0.43`，角色会比上一版更大。
- 全屏背景压暗仍由 `GachaAbyssAtmosphere` 完成，不恢复中心局部透明框。
- `check:layout` 与 `check-preview-freshness` 已同步新位置/缩放 token。
- 验证通过：`npm.cmd run check:layout`；focused Cocos Creator TypeScript no-emit；`git diff --check`（仅既有 LF/CRLF warning）。
- `npm.cmd run check:preview` 当前仍失败，原因是运行中的 Cocos Preview 继续服务旧 chunk，尚未包含这次放大/下移 token。
- 边界不变：只调整前端视觉坐标/缩放，不开放真实抽卡，不扣资源，不发英雄，不写抽卡记录/保底，不开放 EX V1，不新增经济写入口。

## 2026-06-01 Stage 4BE Hero Detail Spine Preview

- 英雄详情页左侧主视觉已接入 `LobbyHeroItemVO.spineAsset`，运行时按 `spine/hero/${spineAsset}/${spineAsset}` 从 `assets/resources/spine/hero` 加载骨骼动画资源。
- 当前资源契约以 `assets/resources/spine/hero/npc_1001/npc_1001.skel|atlas|png` 为首个样例；缺资源或解析失败时保留当前英雄静态占位，不使用其它角色资源误导展示。
- 详情页移除了原红色动态圆环和面板红圆，改为暗色脚底投影；compact 布局改为计算式左右分栏，避免骨骼动画与属性/技能面板重叠。
- `check:layout` 已增加 hero Spine 资源/加载/禁止红圈回归守卫，`check-preview-freshness` 已增加详情页 Spine chunk token。
- 验证：`npm.cmd run check:layout` 通过；focused Cocos Creator 3.8.8 TypeScript no-emit 通过。
- 边界不变：英雄详情仍为只读展示，不开放升级、升星、觉醒、装备、抽卡、领取、发放、扣费、保底或任何经济写入口；EX V1 仍不开放。
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

- 公司电脑复验英雄详情时，王国巡逻兵仍显示静态占位，没有显示骨骼动画。
- 当前工作区已有 `assets/resources/spine/hero/npc_1001/npc_1001.skel|atlas|png`，王国巡逻兵按数据库映射应读取 `spineAsset=npc_1001`。
- `npm.cmd run check:layout` 通过；`npm.cmd run check:preview` 失败，当前 Preview 仍在服务旧 `LobbyHeroDetailPanelRenderer.ts` chunk，缺少 `spine/hero/${asset}/${asset}`、动画解析和初始第二动画播放 token。
- 处理顺序：
  - 执行 MySQL 迁移 `D:\project\LootChain\sql\16_hero_spine_asset.sql`，确保接口返回 `spineAsset`；
  - 重开/刷新 Cocos Creator Preview，等待资源重新导入；
  - 重新进入英雄详情页复验。
- 无密码 `mysql -uroot` 查询在本机失败，需要用本机 MySQL 密码执行迁移与验证。
- 边界不变：英雄详情仍是只读展示，不开放升级、升星、觉醒、装备、抽卡、领取、扣费、保底或任何经济写入口；EX V1 仍不开放。

## 2026-06-02 Stage 4BM Hero Detail Spine Fallback And SQL Sync

- Cocos 只读 API 已增加英雄 Spine 资源字段兼容：
  - `LobbyHeroApi` / `LobbyCodexApi` 优先使用后端 `spineAsset`；
  - 后端暂未返回时，从 `portraitAsset` 派生：`act_1001 -> npc_1001`；
  - 该兼容仅用于展示资源定位，不新增后端请求或任何经济写入口。
- `scripts/check-layout.mjs` 已加入该兼容逻辑守卫。
- 已在本机 `D:\project\LootChain` 执行：
  - `sql/12_protagonist_module.sql`
  - `sql/15_hero_roster_art_refresh.sql`
  - `sql/16_hero_spine_asset.sql`
- SQL 复验：
  - `R_PATROL_01 / 王国巡逻兵` 为 `portrait_asset=act_1001`、`spine_asset=npc_1001`；
  - `spine_asset` 派生 mismatch 计数为 `0`。
- 卡池边界：
  - 本阶段没有写入或修改 `gacha_pool_item`；
  - 当前本地普通池已有 `UR_ARTHAS` / `UR_EVELYN` 两条 UR 条目，来源是既有 `sql/07_gacha_module.sql` 初始配置，不是本次新增；未自动删除或调整。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有 LF/CRLF warning；
- `npm.cmd run check:preview` 仍提示运行中的 Preview 是旧 chunk，需要重开/刷新 Cocos Creator Preview 后复验英雄详情 Spine。
- 边界不变：不改变经济规则，不开放 EX V1，不新增经济写入口，不开放真实抽卡写接口；Gacha 继续只做视觉预览和本地 mock。

## 2026-06-02 Stage 4BN Spine Resources Dynamic URL Conflict Cleanup

- 根据 Cocos 控制台日志修复 `assets/resources/spine` 动态加载 URL 冲突：
  - `huangfengjiaozong.json` 与旧 `huangfengjiaozong.skel` 同名冲突；
  - `.atlas` 与 `.spine` 源文件同名冲突；
  - `npc_1001.atlas` 与 `npc_1001.spine` 同名冲突。
- 运行时资源目录现在只保留可动态加载的入口：
  - Gacha 目标：`assets/resources/spine/gacha/huangfengjiaozong/huangfengjiaozong.json|atlas|png|huangfengjiaozong2.png`；
  - 英雄详情样例：`assets/resources/spine/hero/npc_1001/npc_1001.skel|atlas|png`；
  - Gacha fallback：`assets/resources/spine/gacha/Lord of the Dark Abyss/1605.json|atlas|png`。
- 旧 `.spine` 源文件和旧同名 `.skel` 已移动到 `docs/spine-source-archive/resources-conflict-backup/`，不再进入 Cocos `resources` 动态加载链路。
- `scripts/check-layout.mjs` 已增加守卫：
  - 禁止 `.spine` / `.spine.meta` 留在 `assets/resources/spine/**`；
  - 禁止已知冲突文件回到运行时资源目录。
- 验证：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos Creator TypeScript no-emit 通过；
  - 手动扫描 `assets/resources/spine` 未再发现 `.spine` 源文件或同 basename `.json/.skel` 冲突。
- 复验要求：Cocos Creator 需要重新导入 `assets/resources/spine` 或重开 Preview；旧资源库缓存未刷新前仍可能继续显示旧警告。
- 边界不变：本次只调整 Cocos 资源目录结构和检查脚本，不改后端、SQL、抽卡概率、卡池权重、保底、消耗、奖励或任何经济写入口。
## 2026-06-02 Stage 4BO Hero Detail Spine Runtime Fallback Diagnosis

- Rechecked the company preview issue where hero detail still showed the static placeholder and no `[HeroDetail]` logs.
- `npm.cmd run check:preview` still reports stale Cocos Preview chunks. The served `LobbyHeroDetailPanelRenderer.ts` chunk is missing the current `spine/hero/${asset}/${asset}` load path, centered art position, secondary-animation logic, and full-scene back button tokens.
- The currently running backend `GET /api/player/lobby/heroes` response also lacks `portraitAsset` / `spineAsset`, which indicates the local backend process may not have been restarted after the VO/resource-field changes.
- Cocos readonly API fallback is now stronger:
  - it still prefers backend `spineAsset`;
  - then derives `npc_*` from backend `portraitAsset=act_*`;
  - if both fields are missing, the known current sample `R_PATROL_01` falls back to `act_1001 / npc_1001`.
- Hero detail logging now prints `[HeroDetail] hero spine asset missing` when no resource can be resolved and `[HeroDetail] hero spine load start` before dynamic loading.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator TypeScript no-emit passed;
  - `git diff --check` passed with only existing LF/CRLF warnings;
  - `npm.cmd run check:preview` still fails because the running Preview serves stale chunks missing the new hero-detail logging tokens.
- Boundary unchanged: this is display-only fallback and diagnostics. It does not open real gacha, does not grant heroes, does not deduct resources, does not write gacha records, and does not change economy rules.

## 2026-06-02 Stage 4BP Hero Detail Spine Audio Events

- Hero detail now listens to Spine frame events through `sp.Skeleton.setEventListener()`.
- The renderer reads `event.data.audioPath`, resolves audio clips next to the current hero Spine resource, and plays loaded clips with `AudioSource.playOneShot()`.
- Current `npc_1001.skel` references `1001_skill1_1.mp3`, `1001_skill2_1.mp3`, and `1001_skill4_3.mp3`.
- Those audio files are not currently present under `assets`, so runtime will log `[HeroDetail] hero spine audio missing` until the clips are added and imported.
- Supported placement:
  - `assets/resources/spine/hero/npc_1001/1001_skill1_1.mp3`
  - `assets/resources/spine/hero/npc_1001/1001_skill2_1.mp3`
  - `assets/resources/spine/hero/npc_1001/1001_skill4_3.mp3`
  - or the same names under `assets/resources/spine/hero/npc_1001/audio/`.
- Verification: focused Cocos Creator TypeScript no-emit passed; `npm.cmd run check:layout` passed; `git diff --check` passed with only existing LF/CRLF warnings. `npm.cmd run check:preview` still fails because the running Preview serves stale chunks missing the new audio-event tokens.
- Boundary unchanged: this is Cocos display/audio wiring only. No backend, SQL, gacha, reward, resource, pity, EX V1, or economy write behavior was opened.

## 2026-06-02 Stage 4BQ Gacha Reveal Preview Scene

- Gacha next-stage frontend preview now has a separate `gachaReveal` full-screen logical scene between the summon page and the mock result page.
- Clicking `召唤1次` / `召唤10次` enters `GachaRevealSceneRoot` first; `GachaRevealContinueButton` then opens the existing local mock result scene.
- The reveal scene adds a red-gold ritual pulse, card-back reveal array, three static local steps (`聚魂 / 裂隙 / 显影`), and a no-write boundary strip.
- `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now guard the reveal scene, its config tokens, and the no-economy boundary.
- Verification: `npm.cmd run check:layout`, focused Cocos Creator TypeScript no-emit, and `git diff --check` passed. `npm.cmd run check:preview` still fails because the running Preview serves stale chunks missing `GACHA_REVEAL_STEPS` and `GachaRevealSceneRoot`; refresh/restart Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Gacha is still visual/local mock only. No real draw API, drawNo, resource deduction, hero grant, gacha record write, pity update, exchange, reissue, economy rule change, or EX V1 opening was added.

## 2026-06-02 Cocos Real Gacha Draw Integration

- The current Gacha stage now uses backend-driven summon pool display data and the existing player draw endpoint after explicit user approval for real draw integration.
- Cocos now loads `GET /api/player/gacha/pools` when entering the summon page, maps pool display config into the left rail, and switches the center Spine, right-side action notes, button labels, and pity text by selected `poolCode`.
- `再召唤 N 次必得...` has moved to the top of the Gacha page, and the `召唤1次` / `召唤10次` buttons now use an explicit wider gap.
- `GachaApi.draw()` now calls the existing `POST /api/player/gacha/draw`; successful responses show the real `drawNo` and returned result items in the result scene.
- Locked or preview-only pools remain non-drawable on the client, with backend display config driving the disabled reason.
- Backend display config is provided by `sql/17_gacha_pool_display_config.sql`; it has been imported locally with utf8mb4 client encoding:

```powershell
cd D:\project\LootChain
mysql -uroot -p lootchain < .\sql\17_gacha_pool_display_config.sql
```

- Local verification: `gacha_pool_display_config` exists with 4 rows for limited, hero, normal, and light-dark display entries.

- Verification completed: `npm.cmd run check:layout` passed, focused Cocos Creator 3.8.8 TypeScript no-emit passed, and `git diff --check` passed with existing LF/CRLF warnings only.
- `npm.cmd run check:preview` still reports stale running Cocos Preview chunks; restart or refresh Cocos Creator Preview before visual acceptance.
- Boundary: this stage only connects the already existing draw write endpoint. It does not add exchange, reissue, bag use/sell, hero growth, EX V1, or any new economy write endpoint, and it does not modify `gacha_pool_rate_config`, `gacha_pool_item`, `gacha_pity_config`, costs, weights, rewards, or pity rules.

## 2026-06-02 Gacha Spine Async Callback Error Fix

- Fixed the summon-page Preview error `Cannot read properties of null (reading 'isValid')`.
- Cause: stale async Spine load callbacks could return after the Gacha page had been redrawn or destroyed, and old code accessed `skeleton.node.isValid` directly.
- `GachaSceneRenderer.ts` now guards Gacha Spine callbacks through `isSkeletonNodeAlive()` / `isNodeAlive()` and safely skips failed async callbacks after load.
- Fallback cleanup now checks node liveness before `destroy()`.
- `scripts/check-layout.mjs` now blocks direct `skeleton.node.isValid` / `fallback.isValid` access in the Gacha renderer to prevent this regression.
- Acceptance role result: the `isValid` crash fix passed. The role also noted that the current worktree contains the previously approved real draw integration from Stage 4BR; that integration was not added by this bug fix.
- Verification: `npm.cmd run check:layout`, focused Cocos Creator TypeScript no-emit, targeted `rg` check, and `git diff --check` passed. Browser opened `http://localhost:7456/` and did not currently show the null `isValid` error or console warnings/errors.
- `npm.cmd run check:preview` still reports stale running Preview chunks, including an old `GachaSceneRenderer.ts` bundle. Restart or refresh Cocos Creator Preview before final visual acceptance.
- Boundary unchanged for this fix: no backend, SQL, probability, weight, pity, cost, reward, pool, EX V1, or new economy write-entry change was made.

## 2026-06-02 Real Gacha Draw Redis Runtime Note

- The summon-page `召唤失败：系统异常` was reproduced against `POST /api/player/gacha/draw`.
- With a dev-login `satoken`, `GET /api/player/gacha/pools` and `GET /api/player/gacha/pity/NORMAL_HERO` returned normally, while draw returned `code=500` when Redis `127.0.0.1:6379` was unavailable.
- Root cause: the real draw transaction depends on Redis/Redisson for request idempotency and player locking. This is a backend runtime dependency, not a Cocos rendering issue or pool-data issue.
- Docker Desktop was started and the existing `redis:7-alpine` container `usdt-monitor-redis` is now mapped to `0.0.0.0:6379->6379/tcp`.
- After Redis became reachable, a real single draw on `NORMAL_HERO` returned `code=0`, generated a `drawNo`, and returned one R hero result.
- DB verification: drawNo `GACHA6c7808f3dd2143679f662e74bd43a11b` wrote one `gacha_draw_log` row with `draw_count=1`, `DIAMOND 280` cost, and one `gacha_draw_result` row for `HERO/R_ACOLY_02/R`.
- User 1 now has `DIAMOND=720` after that real single draw; ten draw cost is still `2800`, so ten draw should remain a business failure until currency is topped up.
- Boundary unchanged: no Cocos or backend code was changed for this runtime fix, no SQL was changed, and no probability, weight, pity, cost, reward, pool, EX V1, exchange/reissue, or new economy write entry was modified.

## 2026-06-02 Lobby Bag Readonly Scene

- The lobby backpack is now connected as a Cocos-only full-screen logical scene instead of a placeholder.
- Entrances:
  - bottom nav `背包`;
  - compact/small-screen `背包` action.
- Data contract:
  - `GET /api/player/bag`;
  - `GET /api/player/bag/items/{itemCode}/source`.
- The scene shows grouped items, selected item details, read-only source text, refresh, and source reload.
- `使用/出售关闭` is disabled visual UI only. The client still does not call bag use, batch-use, sell, exchange, claim, reward, EX V1, or any new economy write endpoint.
- Guards updated:
  - `check:layout` now allows readonly bag GETs and still blocks `/api/player/bag/use`, `/api/player/bag/batch-use`, and `/api/player/bag/sell`;
  - `check:layout` and `check:preview` guard the new bag scene, loader, state, and API tokens.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `git diff --check` passed with existing LF/CRLF warnings only;
  - Browser at `http://localhost:7456/` currently has no warning/error logs;
  - `npm.cmd run check:preview` still fails because the running Preview is serving stale chunks and does not yet include the new bag modules. Restart or refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: no economy rule, gacha rule, reward, resource mutation, bag use/sell, hero growth, EX V1, or new economy write entry was changed.

## 2026-06-02 Gacha Side Pages, Assets, And Hero Fragments

- Top resource display now uses real read-only player profile data:
  - lobby HUD reads `PlayerLobbyProfileVO.gold` / `diamond`;
  - Gacha top bar uses the same current profile instead of hardcoded fake values.
- Backpack now also shows duplicate-hero fragments:
  - `LobbyBagLoader` loads `GET /api/player/bag` and `GET /api/player/heroes/fragments/list` in parallel;
  - hero fragments are merged into a read-only `英雄碎片` group as `HERO_FRAGMENT:{heroCode}`;
  - fragment source text is local read-only copy explaining duplicate hero conversion, so it does not call bag item source for non-bag assets.
- Gacha right-side actions now open full-screen logical scenes:
  - `概率保底` -> `gachaInfo`, using current pool detail plus player pity;
  - `记录` -> `gachaRecord`, using `GET /api/player/gacha/logs`;
  - `兑换` -> `gachaExchange`, read-only explanation only, disabled button;
  - `奖池内容` -> `gachaPoolContent`, listing current pool heroes/items from pool detail.
- New readonly backend contract consumed by Cocos:
  - `GET /api/player/gacha/pools/{poolCode}/detail`.
- After a successful real draw, the frontend reloads the lobby profile so Gacha top assets can reflect updated gold/diamond.
- Guards updated:
  - `check:layout` now allows read-only gold/diamond and hero-fragment bag merge;
  - fake resource values and exchange/reissue/bag use/sell remain blocked;
  - `check:preview` checks the new Gacha side pages and fragment merge tokens.
- Verification: `npm.cmd run check:layout`, focused Cocos TypeScript no-emit, backend focused tests, and both repo `git diff --check` passed. `npm.cmd run check:preview` still fails because the running Cocos Preview is serving stale chunks missing `renderGachaActionScene`, `this.heroApi.fragments()`, and `GachaActionScenePanel_`; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: no probability, weight, pity, cost, reward, duplicate-conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag use/sell, hero growth, or new economy write-entry change.

## 2026-06-02 Gacha Result Back Button Fix

- Fixed the top-left back arrow on the Gacha result scene.
- The main Gacha page now uses the normal `GachaBackButton -> closeGachaScene()` path again.
- The result scene now renders result content first and then renders `GachaResultBackButton -> closeGachaMockResultScene()` last, so the full-screen result panel cannot intercept the button.
- `check:layout` now guards both contracts: the main Gacha page must not use result-scene back logic, and the result-scene top bar must render above result content.
- `check:preview` freshness tokens now include the result-scene back button logic to catch stale Preview chunks.
- Boundary unchanged: Cocos frontend only; no backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, pool, EX V1, exchange/reissue, bag use/sell, hero growth, or new economy write-entry change.

## 2026-06-03 Unified Scene Back Header

- Added a high-resolution Cocos UI asset for the full-screen scene back button: `assets/resources/ui/common/scene_back_button.png`.
- `renderSceneBackButton()` now renders the shared dark-gold back button and a page title on the right side, including `召唤`, `召唤结果`, `英雄`, `背包`, `图鉴`, `冒险`, `编队`, `公告`, `资料`, and `战斗`.
- `UiSpriteFrameCache` preloads the new button spriteFrame, and local guard scripts now verify the asset, size, metadata, title node, and Preview freshness tokens.
- Boundary unchanged: Cocos frontend UI only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, pool rule, EX V1, or new economy write entry changed.
## 2026-06-03 Lobby Hidden Chat/Right Rail And Compact Gacha Action Panels

- Lobby world chat is hidden for the current phase. The bottom `LobbyChatPreview` and compact chat entry no longer render.
- Lobby right-side challenge cards are hidden through `SHOW_LOBBY_RIGHT_CHALLENGE_RAIL=false`; the HUD no longer reserves layout space for that hidden right rail.
- Gacha right-side action pages now use adaptive centered panels instead of near-fullscreen panels. Sparse pages such as probability/pity and exchange use a smaller modal-like panel.
- Guards updated in `check:layout` and `check:preview` for the hidden lobby entries and compact Gacha action panel frame.
- Boundary unchanged: Cocos frontend display only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, pool rule, EX V1, or new economy write entry changed.

## 2026-06-03 Backend Hero Template Text Repair

- 后端 `hero_template` 中上次新增的主角模板与四个 UR 英雄中文文案被落库为 `????`，已通过后端 SQL 修复。
- 修复脚本：`D:\project\LootChain\sql\18_hero_template_text_encoding_fix.sql`。
- 本地执行使用 `mysql --default-character-set=utf8mb4`，修复后受影响 6 条 `????` 计数为 `0`。
- Cocos 侧本轮不改 UI/接口/资源加载；英雄列表、图鉴、详情页会继续读取后端修复后的 `hero_template` 展示字段。
- 边界不变：没有改 Cocos 经济入口，没有改抽卡概率、权重、保底、消耗、奖励、重复转碎片、`gacha_pool_item`、EX V1 或任何新增经济写入口。

## 2026-06-03 Gacha Action Modal And Dynamic Pool Display

- 召唤页右侧功能按钮现在打开页内弹框，不再切换到 `gachaInfo/gachaRecord/gachaExchange/gachaPoolContent` 全屏逻辑页。
- 弹框支持点击空白遮罩关闭，并在右上角显示高清关闭按钮 `assets/resources/ui/common/modal_close_button.png`。
- 左侧卡池仍通过 `GET /api/player/gacha/pools` 拉取，后端展示配置来自 `gacha_pool_display_config`。
- 前端已使用配置字段：
  - `logoAsset`：左侧卡池 logo；
  - `themeColor`：左侧卡池色系；
  - `centerSpineResource/Uuid/Skin/Intro/Idle`：中央 Spine；
  - `rateNote/recordNote/exchangeNote/guaranteeNote/noticeText`：右侧弹框说明；
  - `buttonSingleText/buttonTenText/buttonDisabledReason`：召唤按钮与锁定状态。
- 新增默认 logo 资源：`assets/resources/ui/gacha/logo_limited.png`、`logo_hero.png`、`logo_normal.png`、`logo_locked.png`。
- 召唤页停留时会定时刷新卡池展示配置，后台更换 logo 或中央 Spine 路径后，前端会在下一轮刷新中同步。
- Verification: `npm.cmd run check:layout` passed; focused Cocos Creator TypeScript no-emit passed.
- Boundary unchanged: no probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag use/sell, hero growth, or new economy write entry changed.

## 2026-06-03 Spine Resource Conflict Cleanup And Hero UUID Binding

- Read `D:\project\lootchain-cocos\temp\logs\project.log`; the latest relevant warning was the Cocos dynamic URL collision where same-basename `.atlas` and `.spine` files under `assets/resources/spine/hero/**` produced identical runtime load URLs.
- Runtime `assets/resources/spine` was cleaned so it now keeps only playable `.skel` or `.json` plus `.atlas`/texture assets; source `.spine` files and the old duplicate `hunka_nima.skel` were moved into `docs/spine-source-archive/`.
- Resource validation now reports `fileCount=94`, `conflictCount=0` for `.atlas/.json/.skel/.spine` dynamic-load groups.
- Cocos hero/codex types and APIs now receive backend `spineUuid`; hero detail uses `assetManager.loadAny({ uuid })` first and falls back to `resources.load('spine/hero/{spineAsset}/{spineAsset}', sp.SkeletonData)`.
- Local DB was synchronized through backend `D:\project\LootChain\sql\21_hero_spine_uuid.sql`; 22 enabled heroes have matching Cocos `.skel.meta` uuid values, while disabled heroes remain without `spine_uuid`.
- Verification passed: `npm.cmd run check:layout`; focused Cocos Creator TypeScript no-emit; resource conflict scan; DB-to-meta UUID comparison `checked=22 errors=0`; `git diff --check` with only existing LF/CRLF warnings.
- `npm.cmd run check:preview` still reports stale running Cocos Preview chunks, including old `LobbyHeroDetailPanelRenderer.ts`; restart/refresh Cocos Creator Preview and wait for asset reimport before visual acceptance.
- Boundary unchanged: this is resource metadata and read-only hero display loading only; no probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag use/sell, hero growth, or new economy write entry changed.

## 2026-06-03 Preview Start Scene Fix

- Fixed the Cocos Preview error `无法查到当前场景 JSON 数据(start_scene) = current_scene`.
- Root cause: `profiles/v2/packages/preview.json` used `general.start_scene=current_scene`; when Creator had no active current-scene context, Preview could not resolve the scene JSON.
- `profiles/v2/packages/preview.json` now pins the main scene uuid `623f777a-eb33-4d74-ae88-eb79e749fcfe`.
- `scripts/check-layout.mjs` now guards `assets/main.scene.meta` and Preview `start_scene`, requiring them to stay aligned.
- The newly added `act_1012` / `npc_1012` and `act_1046` / `npc_1046` `.spine` source files were moved to `docs/spine-source-archive/preview-start-scene-fix-20260603/`; runtime `assets/resources/spine` keeps only dynamically loadable Spine assets and now scans with `conflictCount=0`.
- Verification passed: `http://localhost:7456/settings.js?scene=current_scene` returns 200, `npm.cmd run check:layout` passes, and resource conflict scan reports `fileCount=102`, `conflictCount=0`.
- Boundary unchanged: Cocos Preview/config and resource-archive cleanup only; no backend, SQL, probability, pool item, pity, reward, EX V1, or economy write-entry change.

## 2026-06-03 Home SQL Sync And Resource Guard Recovery

- Synced backend SQL 12, 15, 16, 17, 18, 19, 20, and 21 into local `lootchain`.
- On this machine `mysql` is not on PATH; the client is `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`.
- Important local note: Windows PowerShell `Get-Content | mysql` corrupted Chinese SQL text in the native pipe on the first attempt. The scripts were immediately rerun through MySQL `source D:/project/LootChain/sql/...`, which restored UTF-8 Chinese data and comments correctly.
- DB verification:
  - `player_protagonist` exists;
  - `hero_template.spine_uuid` exists;
  - enabled heroes: `22`, enabled missing uuid: `0`, disabled heroes with uuid: `0`;
  - repaired text rows still containing `?`: `0`;
  - `gacha_pool_display_config.tab_logo_asset` exists and the four default pools have tab logo paths;
  - table comments for `gacha_pool_display_config` and `mq_consume_log` are Chinese.
- Cocos resource cleanup:
  - archived newly added `.spine/.spine.meta` source files for `act_1012`, `npc_1012`, and `npc_1046` into `docs/spine-source-archive/home-sql-sync-20260603/`;
  - restored the four missing tracked runtime files for `assets/resources/spine/gacha/huangfengjiaozong/huangfengjiaozong.{json,atlas,png}` and `huangfengjiaozong2.png`;
  - `assets/resources/spine` now contains no `.spine/.spine.meta` source files.
- Verification: `profiles/v2/packages/preview.json` still pins `general.start_scene=623f777a-eb33-4d74-ae88-eb79e749fcfe`; `npm.cmd run check:layout` passes with `layout ok`.
- Boundary unchanged: SQL sync and display-resource recovery only. No probability, weight, pity, cost, reward, duplicate conversion, pool rule, EX V1, exchange/reissue, bag use/sell, hero growth, or new economy write entry changed.

## 2026-06-03 Hero Roster Reference Layout

- Hero roster now follows the reference-style hero wall layout:
  - left visual class rail: `全部 / 坦克 / 近战 / 远程 / 物理 / 法术`;
  - center horizontal vertical hero cards;
  - top readonly capsules for owned count, total power, readonly state, and refresh;
  - bottom-right disabled growth dock showing `养成入口未开放 / 升级关闭`.
- UI art assets were copied from `C:\Users\Ethan\Desktop\决胜之心3.8.99\UI\图标` into:
  - `assets/resources/ui/hero-roster/card_r.png`;
  - `assets/resources/ui/hero-roster/card_sr.png`;
  - `assets/resources/ui/hero-roster/card_ssr.png`;
  - `assets/resources/ui/hero-roster/card_ur.png`;
  - selected mapped portraits under `assets/resources/ui/hero-roster/portraits/`.
- `LobbyHeroRosterPanelRenderer.ts` now uses those card skins, maps stable portrait ids when available, and falls back to an in-card placeholder when a hero has no matching portrait. It never uses Spine atlas textures as roster portraits.
- Guards updated in `check:layout` and `check-preview-freshness`; `UiSpriteFrameCache` preloads the hero roster card skins.
- Verification passed: `npm.cmd run check:layout`; focused Cocos Creator TypeScript no-emit.
- Boundary unchanged: frontend display only. Hero upgrade, star-up, awakening, equipment, reward claim, resource mutation, EX V1, and new economy write entries remain closed.

## 2026-06-03 Hero Roster Dark Themed Card Refresh

- Product/design update: the reference-layout hero roster stays, but the light cream card skins were replaced because they read too cartoon-like against LootChain's dark cathedral theme.
- Planning boundary: rarity remains visual only here. Filters are still display placeholders except `全部`; hero cards still open the existing readonly hero detail page; the disabled growth dock remains non-interactive.
- UI art:
  - generated a high-quality dark gothic empty card frame with the built-in `image_gen` tool;
  - saved the source image as `docs/generated-art/hero-roster-dark-gothic-card-source.png`;
  - processed and replaced the runtime card skins at:
    - `assets/resources/ui/hero-roster/card_r.png`;
    - `assets/resources/ui/hero-roster/card_sr.png`;
    - `assets/resources/ui/hero-roster/card_ssr.png`;
    - `assets/resources/ui/hero-roster/card_ur.png`.
- Development:
  - kept the existing card asset paths and meta uuids stable;
  - redrew the no-portrait card fallback in `LobbyHeroRosterPanelRenderer.ts` as a dark seal/spire emblem instead of the old circular triangle placeholder.
- Verification passed: `npm.cmd run check:layout`; focused Cocos Creator TypeScript no-emit.
- Preview note: `npm.cmd run check:preview` still reports stale running Cocos Preview chunks. Restart/refresh Cocos Creator Preview and wait for `ui/hero-roster` reimport before judging the final visual result.
- Boundary unchanged: Cocos frontend visual asset and fallback drawing only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, EX V1, hero growth, bag write, or new economy write entry changed.

## 2026-06-03 Hero Roster Product Visual Pass

- Product observation from Preview:
  - the dark card skins loaded, but the cards were still too small against the large cathedral backdrop;
  - the background red ring competed with the hero cards;
  - rarity/name/stars needed a clearer in-card information area instead of sitting too close to decorative edges.
- Layout update:
  - enlarged hero roster cards on desktop and compact layouts;
  - slightly increased card spacing and lowered the card group a touch;
  - widened the portrait area so mapped hero art sits more naturally inside the frame.
- Card information update:
  - added `LobbyHeroRosterInfoPlate`, a dark in-card nameplate drawn inside the lower frame;
  - moved rarity, hero name, and stars into that nameplate using card-height-relative positioning;
  - updated `check:layout` and `check-preview-freshness` guards with the new information-plate token.
- Verification passed: `npm.cmd run check:layout`; focused Cocos Creator TypeScript no-emit.
- Boundary unchanged: Cocos frontend visual/layout only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, EX V1, hero growth, bag write, or new economy write entry changed.

## 2026-06-03 Hero Roster LootChain Visual Language Pass

- Product direction: the imported reference UI/Spine assets are useful as timing and layout references, but their bright/cartoon style should not become LootChain's hero-screen art language.
- Hero roster now avoids external cartoon portrait assets:
  - `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`;
  - previous `assets/resources/ui/hero-roster/portraits/` assets were moved out of `resources`;
  - archive path: `docs/art-source-archive/hero-roster-cartoon-portraits-20260603/portraits/`.
- Card center art is now code-native:
  - `LobbyHeroRosterHeroRelief` draws a dark hero relief/silhouette inside each card;
  - `LobbyHeroRosterAbyssDust` adds restrained red-gold dust in the card stage;
  - no cartoon UI Spine effect is used in the hero roster.
- Background shade was deepened slightly so the cathedral red ring reads as atmosphere instead of competing with the cards.
- Guards updated in `check:layout` and `check-preview-freshness` to keep external portraits disabled and the dark relief/dust tokens present.
- Verification passed: `npm.cmd run check:layout`; focused Cocos Creator TypeScript no-emit.
- Preview note: `npm.cmd run check:preview` still reports stale running Cocos Preview chunks missing `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`, `LobbyHeroRosterHeroRelief`, and `LobbyHeroRosterAbyssDust`; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/resource cleanup only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, EX V1, hero growth, bag write, or new economy write entry changed.

## 2026-06-04 Current Phase Guard Recheck

- Re-read the current Cocos handoff docs and reran the active phase guard checks.
- Verification passed:
  - `npm.cmd run check:layout` -> `layout ok`;
  - Preview config still pins `profiles/v2/packages/preview.json` `general.start_scene` to main scene uuid `623f777a-eb33-4d74-ae88-eb79e749fcfe`;
  - `assets/resources/spine` contains no `.spine/.spine.meta` source files;
  - Cocos Creator 3.8.8 bundled TypeScript no-emit passed for the project `tsconfig.json`;
  - source guard search did not find newly opened bag use/sell, gacha exchange/reissue, hero-growth write routes, or `gacha_pool_item` mutation paths.
- Preview note:
  - `http://localhost:7456/settings.js?scene=623f777a-eb33-4d74-ae88-eb79e749fcfe` returns 200;
  - `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale import-map/chunks;
  - visual acceptance for login, lobby, summon, hero-detail Spine, readonly bag, and Gacha action modal still requires restarting/refreshing Cocos Creator Preview and rerunning `npm.cmd run check:preview`.
- Contract note: `docs/api-contract.md` now marks the 2026-05-31 `GachaApi.draw()` local-block text as historical; the current approved client path may use the existing `POST /api/player/gacha/draw` only, while exchange/reissue, EX V1, bag use/sell, hero growth, and new economy write entries remain closed.
- Boundary unchanged: documentation/check-only update. No Cocos code, backend code, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, or economy write-entry change.

## 2026-06-04 Hero Roster Top-Left Cards And UR Effect

- User feedback: hero cards should sit near the top and align left like the second reference image; SSR and UR currently read too similarly, so UR needs a visible card effect.
- Multi-role pass:
  - resource/UI review selected `C:\Users\axian\Desktop\决胜之心3.8.99\spine\ui\card_light` as the best fit because it is a card-frame sweep light with star points, suitable for a persistent UR-card accent;
  - development/review confirmed the existing roster cards were centered in the content body and should switch to body top-left anchoring.
- Cocos update:
  - `LobbyHeroRosterPanelRenderer.ts` now anchors hero cards from the body top-left inset instead of centering the visible row;
  - card width/height now uses explicit `224 / 406` aspect constants;
  - UR cards render a local gold `LobbyHeroRosterUrAura` fallback and load the Spine runtime effect `LobbyHeroRosterUrCardLightSpine`;
  - SSR remains a static dark red/gold card, while UR gets the extra sweep-light layer.
- Resource update:
  - copied only runtime files `card_light.skel`, `card_light.atlas`, and `card_light.png` into `assets/resources/spine/ui/hero-roster/card_light/`;
  - the `.spine` source file was not copied into `assets/resources/spine`;
  - meta files were added for the `spine/ui/hero-roster/card_light` runtime path.
- Guards updated:
  - `scripts/check-layout.mjs` now requires the `card_light` runtime/meta files, validates the atlas page, and guards the top-left layout plus UR effect tokens;
  - `scripts/check-preview-freshness.mjs` now checks the same hero roster layout/effect tokens in Preview chunks.
- Verification:
  - `npm.cmd run check:layout` -> `layout ok`;
  - Cocos Creator 3.8.8 bundled TypeScript no-emit passed for the project `tsconfig.json`;
  - `git diff --check` passed, with only Git line-ending conversion warnings;
  - `assets/resources/spine` contains no `.spine/.spine.meta` source files.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks; its old `LobbyHeroRosterPanelRenderer.ts` chunk is missing the new top-left layout and UR effect tokens. Restart/refresh Cocos Creator Preview and wait for the `spine/ui/hero-roster/card_light` import before visual acceptance.
- Boundary unchanged: Cocos frontend visual/resource update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Border Effect Replacement

- User feedback: the previous `card_light` UR effect read as a tall full-card light beam and did not fit the card border; the top-left level and top-right badge also overlapped the card frame.
- Resource review:
  - replaced `spine/ui/card_light` with `C:\Users\axian\Desktop\决胜之心3.8.99\spine\ui\goods_1`;
  - `goods_1` is a better border fit because its atlas is mainly corner highlights, horizontal/vertical edge strokes, and small star glints.
- Resource update:
  - removed the old `assets/resources/spine/ui/hero-roster/card_light/` runtime path;
  - copied only runtime files into `assets/resources/spine/ui/hero-roster/goods_1_border/`:
    - `goods_1.skel`;
    - `goods_1.atlas`;
    - `goods_1.png`;
  - no `.spine` source file was copied into `assets/resources/spine`.
- Cocos update:
  - UR cards now render `LobbyHeroRosterUrBorderAura` as a thin local fallback border plus `LobbyHeroRosterUrGoodsBorderSpine` as the external Spine border effect;
  - the effect stays under portrait/text/chrome, so it should not cover names, rarity labels, stars, or corner badges;
  - `LobbyHeroRosterLevel` and `LobbyHeroRosterClassBadge` now use inset plus width/height center formulas, preventing the left/top/right edges from touching the card frame;
  - top-right status capsules now reserve the return-title area through `topBarLeftReserve`.
- Guards updated:
  - `check:layout` requires `goods_1_border` runtime/meta files, validates `goods_1.atlas -> goods_1.png`, and rejects legacy `card_light`/temporary `frame` UR effect paths;
  - `check:layout` and `check-preview-freshness` guard the new UR border, level inset, badge inset, and top-bar reserve tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the `goods_1_border` UR border effect and the new level/badge inset tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/resource update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Border Alignment And Top Text Readability

- User feedback: the UR border effect still needed to line up with the card frame, and the top `Lv.1` / corner-badge text was too small and overlapped the frame ornament.
- Cocos update:
  - `LobbyHeroRosterUrBorderAura` now uses explicit `HERO_ROSTER_UR_BORDER_INSET_X/Y` and draws the UR gold lines inside the card frame instead of outside it;
  - `LobbyHeroRosterUrGoodsBorderSpine` now scales from `width - 18` and `height - 22`, keeping the Spine border effect closer to the card frame;
  - top level text now renders through `LobbyHeroRosterLevelPlate` and `LobbyHeroRosterLevelText`, with a dark backing plate, gold stroke, and larger text;
  - the right-top class badge is larger and moved lower into the card so it no longer sits on the corner ornament.
- Guards updated: `check:layout` and `check-preview-freshness` now require the UR border inset constants, inner border-width calculation, level plate/text nodes, and `badgeSize = 36 * scale`.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the latest UR border inset, level plate/text, and larger badge tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Larger Cards And Border Outset

- User feedback: hero cards should be larger, and the UR border effect should sit a bit farther outward.
- Cocos update:
  - desktop hero card target height is now `420 * scale`, with max `440 * scale`;
  - compact/horizontal card target height is now `278 * scale`, with max `306 * scale`;
  - card gaps were slightly tightened so larger cards still fit the left-aligned row;
  - UR border drawing changed from inset to slight outset through `HERO_ROSTER_UR_BORDER_OUTSET_X/Y`;
  - `LobbyHeroRosterUrGoodsBorderSpine` now scales from `width + 12` and `height + 14`, pushing the border effect closer to the card's outer edge;
  - top level plate and corner badge were enlarged to stay readable after the card scale increase.
- Guards updated: `check:layout` and `check-preview-freshness` now require the card target/max height constants, UR border outset calculation, and updated top badge size token.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the larger-card and UR border-outset tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Larger Cards And Vertical Border Outset

- User feedback: cards still need to be larger, and the UR border effect should extend farther outward on the top and bottom.
- Cocos update:
  - desktop hero card target height is now `452 * scale`, with max `474 * scale`;
  - compact/horizontal card target height is now `298 * scale`, with max `328 * scale`;
  - UR horizontal border outset remains `4 * scale`, while vertical border outset increases to `10 * scale`;
  - `LobbyHeroRosterUrGoodsBorderSpine` now scales vertically from `height + 30`, while keeping horizontal scale at `width + 12`.
- Guards updated: `check:layout` and `check-preview-freshness` now require the exact `452 / 474 / 298 / 328` card constants, `HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`, and the `height + 30` Spine scale token.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the new `452 / 474 / 298 / 328`, `HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`, and `height + 30` tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Border Horizontal De-overlap

- User feedback: the UR border effect overlaps with background lines.
- Cocos update:
  - UR horizontal border outset is reduced from `4 * scale` to `0`, keeping the side outline on the card frame instead of spilling into the background;
  - UR vertical border outset remains `10 * scale`, preserving the requested top/bottom extension;
  - `LobbyHeroRosterUrGoodsBorderSpine` horizontal scale now uses `width + 2`, while vertical scale remains `height + 30`.
- Guards updated: `check:layout` and `check-preview-freshness` now require `HERO_ROSTER_UR_BORDER_OUTSET_X = 0`, `HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`, `width + 2`, and `height + 30`.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing `HERO_ROSTER_UR_BORDER_OUTSET_X = 0`, `width + 2`, and the current larger-card tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Rarity Label Line Fix

- User correction: restore the previous UR border adjustment; the visible problem is the line behind the bottom `SSR/UR` rarity text.
- Cocos update:
  - restored UR horizontal border outset to `4 * scale`;
  - restored `LobbyHeroRosterUrGoodsBorderSpine` horizontal scale to `width + 12`, keeping vertical scale at `height + 30`;
  - moved the bottom rarity text to `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218`;
  - split the info-plate top accent into two side segments using `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO = 0.48`, leaving the center clear behind `SSR/UR`.
- Guards updated: `check:layout` and `check-preview-freshness` now require the restored UR border tokens and the new rarity-label line-gap tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the restored `HERO_ROSTER_UR_BORDER_OUTSET_X = 4`, `width + 12`, and the new rarity-label line-gap tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Extra Outer Frame Removal

- User feedback: UR still reads as having one extra outer frame.
- Cocos update:
  - removed the local `drawUrBorderAura()` call and function;
  - removed the `LobbyHeroRosterUrBorderAura` node path and local `HERO_ROSTER_UR_BORDER_OUTSET_X/Y` outline constants from the active renderer;
  - UR differentiation now relies on the `goods_1_border` Spine layer only, scaled with `width + 12` and `height + 30`;
  - the bottom rarity-label line-gap fix remains active.
- Guards updated: `check:layout` now forbids `drawUrBorderAura`, `LobbyHeroRosterUrBorderAura`, `HERO_ROSTER_UR_BORDER_OUTSET_X/Y`, and the local `borderWidth` aura outline tokens, while still requiring the `goods_1_border` Spine effect.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance so the old local Aura frame is removed from runtime.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Rarity Label Top Line Removal

- User feedback: the bottom `SSR/UR` rarity text still has a border line behind it.
- Cocos update:
  - removed the info-plate top accent line entirely;
  - replaced the full info-plate stroke with `traceInfoPlateLowerFrame`, which draws only the side and bottom outline;
  - kept the lower rarity text placement at `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218`;
  - UR still uses only the `goods_1_border` Spine border effect.
- Guards updated: `check:layout` and `check-preview-freshness` now require `traceInfoPlateLowerFrame`, and `check:layout` forbids the old `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO`, `rarityLineGap`, and `accentY` accent-line tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing `traceInfoPlateLowerFrame`; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Rarity Label Baked Line Cover

- User feedback: the bottom `SSR/UR` rarity text still shows a line behind it after removing the drawn top line.
- Finding: the remaining line comes from the card skin texture and the previous inset tint fill boundary showing through the semi-transparent info plate.
- Cocos update:
  - increased info-plate base coverage through `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 238`;
  - uses full-plate rarity tint through `HERO_ROSTER_CARD_INFO_PLATE_TINT_ALPHA = 46`;
  - removed the inset tint shape that used `plateWidth - 8 * scale` / `plateHeight - 8 * scale`, so it no longer creates a horizontal boundary behind the rarity label;
  - kept `traceInfoPlateLowerFrame` for side and bottom outline only.
- Guards updated: `check:layout` now requires the new info-plate alpha constants and forbids the old inset tint shape tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the new info-plate alpha tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Rarity Label Opaque Cover

- User feedback: the line behind `SSR/UR` still appears, only less obvious; the previous pass reduced opacity bleed-through instead of fully removing it.
- Cocos update:
  - changed `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA` from `238` to `255`;
  - the bottom info plate now fully covers the baked card-skin line behind the rarity label instead of partially transparent blending it;
  - full-plate rarity tint and side/bottom-only outline remain unchanged.
- Guards updated: `check:layout` and `check-preview-freshness` now require `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 255`.
- Boundary unchanged: Cocos frontend visual/layout update only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Rarity Border Spine Mapping

- User request: use different `goods_1` border skeleton animations by rarity: `R=K3`, `SR=K4`, `SSR=K5`, `UR=K7`.
- Cocos update:
  - hero roster cards now use a shared `HERO_ROSTER_BORDER_EFFECT_RESOURCE` pointing at `spine/ui/hero-roster/goods_1_border/goods_1`;
  - `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` maps `R/SR/SSR/UR` to `K3/K4/K5/K7`;
  - the runtime `goods_1.skel` contains lowercase `k3/k4/k5/k7`, so animation resolution is case-insensitive while preserving the requested mapping in code;
  - the previous UR-only border-effect names and paths were replaced with rarity-generic rendering (`renderHeroCardBorderEffect`, `renderRarityGoodsBorderSpine`, `LobbyHeroRosterRarityGoodsBorderSpine_${rarity}`).
- Guards updated: `check:layout` and `check-preview-freshness` require the rarity mapping tokens and case-insensitive animation resolver; `check:layout` forbids the old UR-only border-effect tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` with only Git line-ending warnings; `.spine/.spine.meta` resource scan returned `0`.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Its old `LobbyHeroRosterPanelRenderer.ts` bundle is missing the latest rarity-to-border-animation mapping tokens; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual effect mapping only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Rarity Border Guard Recheck

- Re-read the current Cocos handoff docs and reran the active Stage 4CU guard checks.
- Verification passed:
  - `npm.cmd run check:layout` -> `layout ok`;
  - `profiles/v2/packages/preview.json` still pins `general.start_scene` to `623f777a-eb33-4d74-ae88-eb79e749fcfe`;
  - Cocos Creator 3.8.8 bundled TypeScript no-emit passed for project `tsconfig.json`;
  - `assets/resources/spine` contains `0` `.spine/.spine.meta` source files;
  - `assets/resources/spine/ui/hero-roster/goods_1_border/` contains only `goods_1.skel|atlas|png` and meta runtime files;
  - old UR-only border effect names are absent from the active hero roster renderer;
  - `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks, including an old `LobbyHeroRosterPanelRenderer.ts` bundle missing the latest larger-card and rarity-border tokens. Restart/refresh Cocos Creator Preview before visual acceptance.
- Local note: port `7456` is owned by a `CocosCreator` process, so this pass did not force-kill Creator or clear generated caches from the shell.
- Boundary unchanged: Cocos frontend verification/documentation only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Sequence Border Frames

- Added the provided UR card-border sequence frames under `assets/resources/ui/hero-roster/UR-card-border/`.
- Resource metadata:
  - added `UR-card-border.meta`;
  - added image/spriteFrame meta for `01.png` through `12.png`;
  - `check:layout` now verifies all 12 frames and their `464x628` spriteFrame metadata.
- Cocos update:
  - UR cards now prefer `LobbyHeroRosterUrSequenceBorderSprite`;
  - the sequence loads `ui/hero-roster/UR-card-border/01..12/spriteFrame` and loops at `0.07s` per frame;
  - the sequence sits below portrait/text/chrome, so it should not cover rarity, name, stars, level plate, or corner badge;
  - if the sequence frames fail to load, UR falls back to the existing `goods_1` `K7` Spine border, while R/SR/SSR keep `K3/K4/K5`.
- Guards updated: `check:layout` and `check-preview-freshness` now require the UR sequence-frame constants, loader, sprite node, and animation loop tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual sequence-frame effect only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Sequence Border Outer Alignment

- User feedback: the UR sequence effect was visually wrapping the inner card frame instead of the whole card frame.
- Cocos update:
  - measured the source sequence frame as `464x628`, with its main bright frame around `x=50..413`, `y=37..542`;
  - added outer-alignment ratios:
    - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = 1.28`;
    - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.245`;
    - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.049`;
  - `LobbyHeroRosterUrSequenceBorderSprite` now renders larger and slightly lower so the sequence frame wraps the card's outer frame.
- Guards updated: `check:layout` and `check-preview-freshness` now require the outer-alignment ratio tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` passed with only Git line-ending warnings.
- Boundary unchanged: Cocos frontend visual alignment only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster UR Sequence Border Outside Frame

- User feedback: the previous outer alignment still read as inside the card frame; the sequence bright frame needs to sit outside the whole card frame.
- Cocos update:
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = 1.56`;
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.44`;
  - `HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.045`;
  - these values intentionally overscale the source sequence so its internal bright border moves outside the card edge.
- Guards updated: `check:layout` and `check-preview-freshness` now require the new outside-frame ratios.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `git diff --check` passed with only Git line-ending warnings.
- Boundary unchanged: Cocos frontend visual alignment only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Unified Card Frame

- User request: replace the hero roster card base with `assets/resources/ui/hero-roster/hero_card_frame.png`.
- Resource metadata:
  - added `hero_card_frame.png.meta`;
  - the source image is `937x1676`;
  - `check:layout` validates the spriteFrame metadata dimensions.
- Cocos update:
  - added `LOBBY_HERO_ROSTER_CARD_FRAME_ASSET = 'ui/hero-roster/hero_card_frame/spriteFrame'`;
  - `LOBBY_HERO_ROSTER_CARD_ASSETS` now preloads only the unified frame;
  - `resolveHeroRosterCardAsset()` returns the same frame for all rarities;
  - card aspect constants now use `937 / 1676`;
  - rarity identity remains in the label/nameplate, `goods_1` R/SR/SSR borders, and UR sequence border.
- Guards updated: `check:layout` and `check-preview-freshness` require the unified card-frame tokens, and `check:layout` forbids the old active `card_r/card_sr/card_ssr/card_ur` renderer paths.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`.
- Boundary unchanged: Cocos frontend card-frame asset swap only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Card Interior Cleanup

- User feedback: card interior UI should use the new frame's built-in slots instead of drawn backgrounds.
- Cocos update:
  - removed the bottom `LobbyHeroRosterInfoPlate` drawn text background;
  - removed the `LobbyHeroRosterLevelPlate` level backing plate;
  - changed the top-right badge from diamond to circular `drawCircleBadge`;
  - positioned level and badge by card-frame ratios so they sit inside the top-left/top-right circles;
  - simplified the center `LobbyHeroRosterHeroRelief` to a single triangle mark;
  - reduced rarity/name/stars font sizes and placed them in the built-in bottom grid.
- Guards updated: `check:layout` / `check-preview-freshness` require the new ratios, circle badge, and triangle token; `check:layout` forbids the removed info plate, level plate, diamond badge, and protagonist dot tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit.
- Boundary unchanged: Cocos frontend card interior layout only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Wider Five Card Layout

- User feedback: roster cards are still too narrow; the rarity label should sit above the bottom text grid instead of inside it; one row should show at most five cards.
- Cocos update:
  - added `HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE = 1.2` so the unified `937/1676` card frame renders wider;
  - added `HERO_ROSTER_CARD_MAX_COLUMNS = 5` and row-width limiting through `maxCardsInRow` / `maxCardWidthForRow`;
  - tightened card gaps to give the wider cards enough room;
  - moved `SSR/UR/SR/R` to `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.278`, above the built-in lower grid;
  - kept the hero name and stars inside the lower grid with `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.151` and `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.087`.
- Guards updated: `check:layout` and `check-preview-freshness` now require the wider-card, five-column, and updated bottom-text placement tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual layout only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-04 Hero Roster Longer Cards And Rarity Order

- User request: make roster cards slightly longer and show heroes in `UR -> SSR -> SR -> R` order.
- Cocos update:
  - card target/max heights are now `468/492` on desktop and `310/340` in compact layout;
  - added `HERO_ROSTER_RARITY_DISPLAY_ORDER` with `UR:0 / SSR:1 / SR:2 / R:3`;
  - added local render sorting through `sortHeroesForRosterDisplay()` and `resolveRarityDisplayRank()`;
  - same-rarity heroes keep their original backend order, so this is only a rarity-group display sort;
  - visible card count and overflow copy now use sorted `displayHeroes`, so the first row prioritizes high rarity heroes.
- Guards updated: `check:layout` and `check-preview-freshness` now require the new height constants, rarity order mapping, and render-sort tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual layout and local display sorting only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Border Brightness And Star Placement

- User feedback: border effects look too dark; rarity should move further upward; the bottom grid should only show the hero name because stars overlap the baked gem; the UR sequence border is too large and should wrap the card frame.
- Product/UI decision:
  - keep the bottom grid for the hero name only;
  - place stars as a smaller secondary strip between rarity and the name grid;
  - keep UR sequence frames snug to the visible card frame instead of using the previous oversized aura.
- Cocos update:
  - restored `HERO_ROSTER_UR_SEQUENCE_BORDER_ALPHA = 255`;
  - tuned UR sequence-frame alignment to `1.18 / 1.16 / -0.048`;
  - moved rarity to `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.318`;
  - moved stars to `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.235`;
  - moved the name-only lower grid label to `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.132`.
- Guards updated: `check:layout` and `check-preview-freshness` now require the restored sequence alpha, snug UR ratios, and new rarity/name/star placement tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual layout/effect display only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Larger Star Text

- User feedback: roster card stars are too small.
- Cocos update:
  - enlarged `LobbyHeroRosterStars` from `Math.min(11 * scale, height * 0.032)` to `Math.min(15 * scale, height * 0.046)`;
  - enlarged the stars label box to `new Size(width - 68 * scale, height * 0.056)`;
  - kept stars between rarity and the name-only lower grid.
- Guard update: `check:layout` and `check-preview-freshness` now require the larger star font/label tokens and the current renderer ratios, including rarity/name/stars `0.324 / 0.132 / 0.168`.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual text-size only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster SSR Sequence Border And Level Fit

- User request: use the `SSR-card-border` sequence frames for SSR cards, align borders to card edges, move stars above the center triangle, remove card-name text, and make the top-left level fit two/three digits.
- Resource metadata:
  - added `assets/resources/ui/hero-roster/SSR-card-border.meta`;
  - added Cocos image/spriteFrame meta for 125 SSR frames, `合成 1_00000.png` through `合成 1_00124.png`;
  - SSR frame metadata is guarded as `1080x1920` and written without UTF-8 BOM.
- Cocos update:
  - SSR now prefers `LobbyHeroRosterSsrSequenceBorderSprite` and loads `ui/hero-roster/SSR-card-border/合成 1_00000..00124/spriteFrame`;
  - SSR uses alignment ratios `1.22 / 1.14 / -0.01`, while UR remains `1.25 / 1.25 / -0.01`;
  - UR/SSR share the generic `startSequenceBorderAnimation()` loop;
  - R/SR `goods_1` Spine borders now use edge padding constants `30 / 54 / -0.01`;
  - stars moved to `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.815`, above the center triangle;
  - card-internal hero-name text is restored in the bottom grid;
  - top-left level uses a wider `0.29` text area and `formatHeroCardLevel()`, so three-digit values render as `Lv100`.
- Guards updated: `check:layout` validates SSR frame metadata and requires the restored card-name text; `check-preview-freshness` requires the new SSR sequence and level-fit tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual resources/layout only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster SSR Melt Sequence Source

- SSR card borders now use the provided sequence frames under `assets/resources/ui/hero-roster/熔化/`.
- Resource metadata was added for `熔化.meta` and all 125 `合成 1_00000.png` through `合成 1_00124.png` frames, with guarded `1080x1920` spriteFrame metadata and no UTF-8 BOM.
- `HERO_ROSTER_SSR_SEQUENCE_BORDER_PATH_PREFIX` now points to `ui/hero-roster/熔化`; the older `SSR-card-border` directory may remain on disk but is no longer the active renderer/check path.
- SSR keeps the existing 125-frame loop, `0.04s` frame duration, and `1.22 / 1.14 / -0.01` alignment ratios for this source swap.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview and wait for resource import before visual acceptance.
- Boundary unchanged: Cocos frontend visual resource source only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster SSR Goods Border Restore

- Removed the heavy SSR sequence-frame resources:
  - `assets/resources/ui/hero-roster/熔化/`
  - `assets/resources/ui/hero-roster/熔化.meta`
  - `assets/resources/ui/hero-roster/SSR-card-border/`
  - `assets/resources/ui/hero-roster/SSR-card-border.meta`
- SSR cards now use the shared `goods_1` Spine border again through `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` with `SSR: 'K5'`.
- Only UR keeps the `UR-card-border` 12-frame sequence border; R/SR/SSR use the shared `goods_1` Spine path.
- `check:layout` now forbids reintroducing SSR sequence-frame renderer tokens or the deleted SSR sequence resource paths into the active renderer.
- Boundary unchanged: Cocos frontend resource cleanup and visual-path restore only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster SSR 04 Sequence Trial

- SSR card borders now trial the lightweight `assets/resources/ui/hero-roster/04/` sequence source.
- The `04` folder currently contains 7 frames, `00118.PNG` through `00124.PNG`; Cocos metadata was added for the folder and all frames with guarded `270x396` spriteFrame dimensions.
- SSR uses `ui/hero-roster/04/00118..00124/spriteFrame`, loops at `0.07s` per frame, and initially shares UR's `1.25 / 1.25 / -0.01` outer alignment ratios.
- If the 7-frame sequence fails to load before Creator imports resources, SSR falls back to the shared `goods_1` K5 border instead of rendering blank.
- `check:layout` guards the new `04` resource metadata and still forbids active renderer references to the deleted `熔化` and `SSR-card-border` paths.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview and wait for the new `04` import before visual acceptance.
- Boundary unchanged: Cocos frontend visual resource trial only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster SSR 03 Sequence Trial

- SSR card borders now trial the `assets/resources/ui/hero-roster/03/` sequence source.
- The `03` folder contains 25 frames, `00093.PNG` through `00117.PNG`; Cocos metadata was updated for all frames with guarded `374x515` spriteFrame dimensions.
- SSR uses `ui/hero-roster/03/00093..00117/spriteFrame`.
- These user-locked parameters are now guarded and should not be adjusted during this trial:
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_FRAME_DURATION_SECONDS = 0.15`
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_ALPHA = 255`
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO`
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.14`
  - `HERO_ROSTER_SSR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.035`
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks. Restart/refresh Cocos Creator Preview and wait for the new `03` import before visual acceptance.
- Boundary unchanged: Cocos frontend visual resource trial only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Sequence Cleanup And SSR Goods Restore

- Removed the experimental hero-roster sequence folders and metas:
  - `assets/resources/ui/hero-roster/01/`
  - `assets/resources/ui/hero-roster/02/`
  - `assets/resources/ui/hero-roster/03/`
  - `assets/resources/ui/hero-roster/04/`
- Removed the legacy card base images and metas:
  - `card_r.png`
  - `card_sr.png`
  - `card_ssr.png`
  - `card_ur.png`
- SSR cards now use the shared `goods_1` Spine border again through `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` with `SSR: 'K5'`.
- Only UR keeps the `UR-card-border` 12-frame sequence border; R/SR/SSR use the shared `goods_1` Spine path.
- The active card base remains `assets/resources/ui/hero-roster/hero_card_frame.png`.
- `check:layout` now forbids active renderer references to `01..04`, legacy `card_*` card-frame paths, or SSR sequence-frame renderer tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only Git line-ending warnings.
- Preview note: `npm.cmd run check:preview` failed because `http://localhost:7456/scripting/x/import-map.json` refused the connection, so Cocos Preview is not currently serving. Restart/refresh Preview before visual acceptance.
- Boundary unchanged: Cocos frontend resource cleanup and visual-path restore only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Cleanup Recheck After Window Switch

- Rechecked the Stage 4DK cleanup state after switching windows.
- Resource state:
  - `assets/resources/ui/hero-roster/` contains only `hero_card_frame.png`, `hero_card_frame.png.meta`, `UR-card-border/`, and `UR-card-border.meta`;
  - `UR-card-border/` contains the expected 12 PNG frames and metas;
  - old `01..04` trial sequence folders and legacy `card_r/card_sr/card_ssr/card_ur` base-card images remain absent.
- Renderer state:
  - all cards still use `ui/hero-roster/hero_card_frame/spriteFrame`;
  - `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` still maps `R=K3`, `SR=K4`, `SSR=K5`, `UR=K7`;
  - SSR uses the shared `goods_1` Spine `K5` border again;
  - UR keeps the `UR-card-border` 12-frame sequence border;
  - old SSR sequence renderer tokens remain absent from the active renderer.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only the existing `assets/main.scene` LF/CRLF warning.
- Preview note: `npm.cmd run check:preview` still fails, but `localhost:7456` is reachable again and serving stale chunks rather than refusing the connection. Restart/refresh Cocos Preview before visual acceptance.
- Boundary unchanged: Cocos frontend verification and docs sync only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Goods Border Effect Width Cap

- User clarification: do not change card/frame width; only widen the non-UR `goods_1` border effect.
- Cocos update:
  - card layout width and `ui/hero-roster/hero_card_frame/spriteFrame` remain unchanged;
  - current non-UR `goods_1` effect offsets remain `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33`, `HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 61`, and `HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.03`;
  - added `HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8`;
  - `renderRarityGoodsBorderSpine()` now uses that max for the X scale clamp, so the effect width can change without resizing the card or base frame.
- Guards updated: `check:layout` and `check-preview-freshness` require the new effect-only width cap and current non-UR effect offsets; legacy `01..04`, old `card_*`, and SSR sequence-frame renderer tokens remain forbidden.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only LF/CRLF warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Preview serves stale chunks missing the new `HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8` token. Restart/refresh Cocos Preview before visual acceptance.
- Boundary unchanged: Cocos frontend visual effect width only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster UR Goods K7 Overlay Trial

- User request: add a `goods_1` K7 layer on top of the existing UR border setup for visual review.
- Cocos update:
  - UR cards still render the existing `UR-card-border` 12-frame sequence;
  - UR cards now also call `renderRarityGoodsBorderSpine(card, 'UR', width, height)`, so `goods_1` plays the mapped `K7` Spine border layer;
  - the sequence-frame failure path no longer adds another `goods_1 K7` fallback because the K7 layer is now always rendered for UR;
  - card base frame, card size, row layout, and R/SR/SSR behavior remain unchanged.
- Guards updated: `check:layout` and `check-preview-freshness` require the UR branch K7 overlay token and the current `goods_1` effect values `33 / 61 / -0.03 / 2.8`.
- Verification passed: `npm.cmd run check:layout`; Cocos Creator 3.8.8 bundled TypeScript no-emit; `.spine/.spine.meta` resource scan returned `0`; `git diff --check` passed with only LF/CRLF warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Preview serves stale chunks missing the new UR K7 overlay token. Restart/refresh Cocos Preview before visual acceptance.
- Boundary unchanged: Cocos frontend UR visual overlay only. No backend, SQL, probability, weight, pity, cost, reward, duplicate conversion, `gacha_pool_item`, EX V1, exchange/reissue, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Scroll, Class Filter, Power, And Gacha Visibility

- Backend readonly hero fields:
  - `GET /api/player/lobby/heroes` now includes `faction` and `heroClass`, sourced from `hero_template`;
  - the lobby readonly hero limit is aligned to `80`;
  - no hero growth or economy write route was added.
- Cocos hero roster:
  - class tabs are generated from `heroClass` on the loaded heroes, with database extras preserved;
  - the card grid is now a masked vertical `ScrollView`, so all filtered heroes render instead of only the first row;
  - each card shows individual power under the hero name;
  - the top-right badge is now protagonist marker `主` or class abbreviation, not faction text.
- Gacha:
  - the light/dark summon pool is hidden from both local fallback pools and backend-loaded pool lists;
  - real summon remains gated by backend `drawEnabled && !previewOnly && !locked` and still uses only the existing `POST /api/player/gacha/draw`;
  - successful draws refresh readonly profile and hero roster state.
- Guards updated: `check:layout` covers hero scroll nodes, class-filter helpers, per-card power, gacha light/dark filtering, and post-draw readonly refresh.
- Verification passed: `npm.cmd run check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; backend `PlayerLobbyHeroServiceImplTest`; backend `lootchain-admin,lootchain-game -am -DskipTests compile`.
- Preview note: restart/refresh Cocos Creator Preview before final visual acceptance.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag write, hero growth, or new economy write entry changed.

### Stage 4DO Guard Sync Addendum

- `scripts/check-preview-freshness.mjs` now checks the same hero-roster scroll/class/power and gacha light/dark visibility tokens as `check:layout`.
- Boundary unchanged: guard update only; no economy rule or write-path change.

### Stage 4DO Preview Recheck

- `npm.cmd run check:preview` still fails because the running Cocos Preview service is serving stale chunks.
- Missing runtime tokens include the new hero roster scroll/class/power nodes and gacha light/dark filtering guards.
- Restart/refresh Cocos Creator Preview before visual acceptance.

## 2026-06-05 Hero Roster Power Placement And Class Options

- Added readonly `GET /api/player/lobby/heroes/filter-options` consumption for the hero roster class rail.
- Class tabs now merge backend `heroClasses`, loaded hero `heroClass` values, and the default six class order (`战士 / 辅助 / 刺客 / 法师 / 射手 / 坦克`), so the rail no longer collapses to only `全部` when the current hero list or local backend response is incomplete.
- Combat power on each card now sits above the hero name and uses the larger `Math.min(15 * scale, height * 0.044)` font sizing with `HERO_ROSTER_CARD_POWER_Y_RATIO = 0.205`.
- The new class-options path is readonly only; failure falls back locally and does not write class data.
- Guards updated: `check:layout` and `check-preview-freshness` require the new readonly endpoint, class option merge, and combat-power placement tokens.
- Verification passed: `npm.cmd run check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; backend `PlayerLobbyHeroServiceImplTest`; backend admin/game compile.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview serves stale chunks missing the new class-options and combat-power placement tokens. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Class Options Config Table Source

- Hero roster class tabs are now controlled by backend `sys_param_config.param_key='hero.class.options'`.
- Cocos keeps consuming the same readonly `/api/player/lobby/heroes/filter-options` endpoint; no frontend route or write behavior changed in this sub-step.
- Backend fallback remains conservative: if the config is missing/empty, it can still use enabled `hero_template.hero_class` plus the existing six default classes.
- SQL `D:\project\LootChain\sql\22_hero_class_options_config.sql` seeds `战士,辅助,刺客,法师,射手,坦克`, and local DB verification confirmed `status=1`.
- Boundary unchanged: readonly display config only. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag write, hero growth, or new economy write entry changed.

## 2026-06-05 Hero Roster Class Filter Match Fix

- Fixed the Cocos hero roster class filter path after clicking a left-side class could render an empty list.
- The click path was already re-rendering the current hero scene; the problem was raw text equality between the selected tab and each hero `heroClass`.
- `LobbyHeroRosterPanelRenderer` now keeps the visible tab text from backend/config data, but merges tabs, selected state, card badge abbreviations, and filtered heroes through a normalized class key.
- Empty or missing `heroClass` heroes still remain visible only in `全部`.
- Guards updated: `check:layout` and `check-preview-freshness` require `HERO_CLASS_KEY_ALIASES`, `normalizeHeroClassKey`, `addHeroClassTab`, and the normalized filter comparison.
- Verification passed: `npm.cmd run check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; `git diff --check` passed with only LF/CRLF warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview serves stale chunks missing the new normalized class-filter tokens. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos-only readonly display fix. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, exchange/reissue, EX V1, bag write, hero growth, or new economy write entry changed.

### Runtime Old Backend Class Fallback

- The currently running local game server still returns `code=1000` for `GET /api/player/lobby/heroes/filter-options`, and `GET /api/player/lobby/heroes` returns `heroClass: null`.
- `LobbyHeroApi` now keeps a readonly V1 `heroCode -> heroClass` fallback for known launched heroes, used only when the API field is missing.
- Backend-provided `heroClass` still wins whenever present; the fallback does not mutate hero data, templates, config, gacha pools, or economy state.
- `check:layout` now guards `HERO_CLASS_FALLBACKS`, `resolveHeroClassFallback()`, and the `heroClass ?? fallbackHeroClass` path.

## 2026-06-05 Hero Roster UR Effect Scroll Mask Fix

- Fixed the UR card top border/flame effect being clipped after the hero roster moved into a masked vertical `ScrollView`.
- `LobbyHeroRosterPanelRenderer` now adds `HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING = 62` and extends only the scroll mask upward for card effects.
- Card placement, card size, bottom text layout, and bottom clipping remain unchanged; the extra space is only for top effects that extend beyond the card frame.
- Guards updated: `check:layout` and `check-preview-freshness` now require the scroll effect top padding, `viewportHeight`, `viewportCenterY`, and adjusted `startY` calculation.
- Verification passed: `check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; `git diff --check` passed with only LF/CRLF warnings.
- Preview note: `check:preview` still fails because the running Cocos Preview serves stale chunks missing the new top-mask padding tokens. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: Cocos-only visual clipping fix. No interface, SQL, economy rule, gacha pool item, probability, cost, reward, pity, EX V1, bag write, hero growth, or new write entry changed.

## 2026-06-06 Current Flow PhaseGate And Smoke Closure

- Backend `PlayerApiPhaseGate` now allows readonly `GET /api/player/lobby/heroes/filter-options`, so the Cocos hero roster class rail no longer depends on the stale local fallback after the game server is restarted.
- The current smoke script now matches the current Cocos stage:
  - open/readable: filter-options, gacha pools GET, bag GET;
  - still blocked: gacha exchange/reissue, bag use/batch-use/sell, and hero growth writes.
- Local DB was brought up to the current battle-smoke schema by sourcing existing SQL `13_battle_session_module.sql` and `14_battle_settlement_guard_flags.sql` with `mysql --default-character-set=utf8mb4`.
- Runtime acceptance on the restarted local game server passed:
  - filter-options returned `code=0` with six configured classes;
  - a manual `NORMAL_HERO` single draw succeeded through existing `/api/player/gacha/draw` only;
  - `scripts/smoke-cocos-current-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1` passed with no-reward settlement flags intact.
- Verification passed: Cocos `check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; backend targeted tests; backend admin/game compile; backend current-flow smoke; `git diff --check`.
- Preview note: `check:preview` still fails because the running Cocos Preview serves stale chunks. Restart/refresh Cocos Creator Preview before final visual acceptance.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy write endpoint changed.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Login And Lobby Language Switch

- Added a Cocos-local i18n service at `assets/scripts/i18n/LootChainI18n.ts` with `zh-CN` and `en-US`, persisted through `sys.localStorage`.
- Login right-side first entry now displays `语言` / `Lang` instead of the previous prophecy text and toggles display language locally. It does not call login, dev-login, or any backend endpoint.
- Lobby top-right settings gear now opens a dedicated `设置` / `Settings` scene page with current language, `简体中文`, and `English` options.
- `HttpClient` now sends `Accept-Language` from the local Cocos language preference. This is passive request metadata only; no backend contract or economy behavior changed.
- Guards updated: `check:layout` and `check-preview-freshness` require the i18n service, login language entry, settings page, HUD routing, and language header.
- Verification passed: `npm.cmd run check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; `git diff --check` passed with only LF/CRLF warnings.
- Preview note: `npm.cmd run check:preview` still fails because the running Cocos Preview serves stale chunks and does not yet include the new i18n/settings modules. Restart/refresh Cocos Creator Preview before visual acceptance of login language toggle, Lobby settings panel, language persistence, and layout overlap.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy write entry changed.

## 2026-06-06 Language Modal And Backend I18n Read Model

- Login language entry now opens an in-page modal instead of toggling directly.
- The modal supports selecting `简体中文` / `English`, blank-area close, and a top-right close button; selection saves to local `LootChainI18n` and re-renders the login page.
- `UiPrimitiveFactory` and `StatusPresenter` now translate shared static labels/buttons/status text through `lootChainI18n.text()`, so login and Lobby static UI follow language on redraw.
- Lobby settings language switch now reloads localized player data after changing language: profile, notices, adventure, hero roster/filter options, codex, bag, battle recent, gacha pools, and selected pool detail/pity.
- Backend now consumes the existing Cocos `Accept-Language` header for `/api/player/**` and overlays player-facing display text from `game_text_i18n`.
- New backend SQL: `D:\project\LootChain\sql\23_game_text_i18n.sql`.
  Import with `mysql --default-character-set=utf8mb4` and `source D:/project/LootChain/sql/23_game_text_i18n.sql`.
- Local DB sync completed on `lootchain`: `game_text_i18n` has `200` rows, all `200` enabled rows are `en-US`; `HERO_TEMPLATE` contributes `120` rows for current hero/protagonist display fields.
- Localized API surfaces include hero list/detail/codex/fragments/filter options, gacha pool display/draw reward names, readonly bag item/source/type labels, notices, and readonly adventure text.
- Live 8081 acceptance after restarting `lootchain-game` from current source: `Accept-Language: en-US` returns English hero classes, hero list/detail/codex display fields, gacha pool text, bag type labels, and adventure text.
- Verification passed: Cocos `check:layout`; Cocos TypeScript no-emit; `.spine/.spine.meta` scan returned `0`; backend `mvn -pl lootchain-core test` passed `98` tests with `0` failures and `4` skipped live/external tests; both repos `git diff --check` passed with only LF/CRLF warnings.
- Preview note: running Cocos Preview on `7456` still serves stale chunks, so visual language-modal acceptance requires restarting/refreshing Preview and rerunning `npm.cmd run check:preview`.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 New Window Handoff Recheck And SQL Resync

- Re-executed the handoff checklist in this window after rereading the Cocos README, lobby analysis, and API contract.
- Verification passed:
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - backend `mvn.cmd --no-transfer-progress -pl lootchain-core test` passed `98` tests, `0` failures, `4` skipped live/external tests.
- Local SQL state on this machine was behind the handoff note: `game_text_i18n` did not exist at first.
- Synced `D:\project\LootChain\sql\23_game_text_i18n.sql` into local `lootchain`.
- Important Windows note repeated for this machine: do not import UTF-8 Chinese SQL through a plain PowerShell pipe. The first pipe import corrupted Chinese `HERO_CLASS` keys and produced `191` enabled English rows; the just-created display table was dropped and reimported with the MySQL client reading the SQL file directly using `--default-character-set=utf8mb4`.
- Final DB verification passed: `enabled_en_us=200`, `hero_template_en_us=120`, `hero_class_en_us=10`.
- `npm.cmd run check:preview` still reports stale Preview chunks on `7456`; refresh/restart Cocos Creator Preview before visual acceptance of the login language modal and localized Lobby flows.
- Boundary unchanged: local display-text SQL sync and verification only. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Lobby English Leak Audit

- Audited English-mode text after switching to `en-US`.
- Backend/API check:
  - current player GET surfaces were called with `Accept-Language: en-US`;
  - checked lobby profile/notices/codex/heroes/filter-options/adventure, gacha pools/detail/pity/logs, heroes/detail/codex/fragments, bag/source, recent battles, and protagonist state;
  - final result `ZH_COUNT=0`, so no backend API change was needed.
- Cocos frontend fix:
  - expanded `LootChainI18n` static, fragment, and dynamic translations for Lobby/Gacha local UI/status text;
  - covered Adventure, Bag, Notice, Codex, Hero Roster, Hero Detail, Formation, Battle Preview, Root status, and local Gacha preview strings;
  - hero roster compact power values now use `K` in English instead of the Chinese `万` unit.
- Verification passed:
  - custom static text audit in `en-US`: `MISS_COUNT=0`;
  - Cocos TypeScript no-emit;
  - `npm.cmd run check:layout`;
  - `.spine/.spine.meta` scan returned `0`;
  - both repos `git diff --check` passed with only LF/CRLF warnings.
- Preview still stale on `7456`; restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: frontend localization only. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Hero Roster English Class Tab Dedupe

- Fixed duplicated hero roster class tabs in English mode.
- Root cause: backend English class labels (`Warrior`, `Support`, `Assassin`, `Mage`, `Marksman`, `Tank`) and the Cocos default Chinese class tabs were merged before English aliases existed in `normalizeHeroClassKey()`.
- `HERO_CLASS_KEY_ALIASES` now maps the English labels and lowercase variants back to the existing canonical class keys.
- The visible labels still flow through `LootChainI18n`, so English mode displays English labels while filtering/deduping by one canonical key.
- Guards updated in `check-layout` and `check-preview-freshness`.
- Verification passed: `npm.cmd run check:layout`, Cocos TypeScript no-emit, and a custom mixed Chinese/default plus English/API tab dedupe check.
- Boundary unchanged: Cocos readonly display fix only. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Gacha Hero Pool Spine Ground Offset

- The summon-page center Spine ground position is now pool-aware.
- Normal hero summon pools (`NORMAL_HERO`, local `id='hero'`, or `displayType/poolType='HERO'`) render the center Spine slightly lower through `GACHA_HERO_POOL_SPINE_GROUND_Y_EXTRA_RATIO = -0.075`.
- Limited summon pools are explicitly excluded with `displayType === 'LIMITED'`, `poolType === 'LIMITED'`, and `poolCode.includes('LIMITED')`, so their Spine position stays unchanged.
- Guards updated in `check-layout` and `check-preview-freshness`.
- Verification passed: `npm.cmd run check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan returned `0`, and `git diff --check` passed with only LF/CRLF warnings.
- `npm.cmd run check:preview` still fails because the running Preview serves stale chunks; the gacha renderer chunk is missing the new hero-pool offset and `LIMITED` exclusion tokens. Restart/refresh Cocos Creator Preview before judging the visual position.
- Boundary unchanged: Cocos visual positioning only. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Hero Card Background Asset

- Backend `hero_template` now exposes display-only `card_background_asset` through `cardBackgroundAsset`.
- New SQL: `D:\project\LootChain\sql\24_hero_card_background_asset.sql`.
- Local DB was synced with MySQL direct `source`; current seed binds `UR_EVELYN` to `ui/hero-roster/card_background/StoryCover_Nuu`.
- Cocos hero roster cards now render `cardBackgroundAsset` under the unified `hero_card_frame.png`; invalid paths are ignored, and paths without `/spriteFrame` are normalized automatically.
- `assets/resources/spine/hero/Nuu/Nuu.spine` has been archived to `docs/spine-source-archive/hero/Nuu/Nuu.spine`; resources runtime scan remains `0` `.spine/.spine.meta`.
- Verification passed: Cocos `check:layout`, Cocos TypeScript no-emit, backend `PlayerLobbyHeroServiceImplTest`, and local SQL field verification.
- Preview note: `npm.cmd run check:preview` still reports stale running Preview chunks; the hero roster chunk is missing `LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET`, `renderHeroCardBackground`, and `hero.cardBackgroundAsset`. Restart/refresh Cocos Creator Preview before visual acceptance.
- Boundary unchanged: display metadata only. No `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, or new economy write endpoint changed.

## 2026-06-06 Hero Id 25 Nuu Spine UUID Sync

- `hero_template.id=25` (`UR_EVELYN`) now uses `portrait_asset=Nuu` and `spine_asset=Nuu`.
- Added Cocos runtime meta files for `assets/resources/spine/hero/Nuu/`.
- `Nuu.skel.meta` uses `spine-data` uuid `f0efa4e7-3338-4a1c-bafd-b8b18788a712`.
- Backend SQL `D:\project\LootChain\sql\25_hero_spine_uuid_id25_sync.sql` was added and sourced locally.
- Local DB now has `spine_uuid=f0efa4e7-3338-4a1c-bafd-b8b18788a712` for `id=25`.
- `.spine/.spine.meta` scan under `assets/resources/spine` remains `0`.
- Boundary unchanged: display resource metadata only; no economy rule or write entry changed.

## 2026-06-06 External Nuu idel_front Work Copy

- Created a non-destructive work copy for the external Nuu Spine source at `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work`; the original `C:\Users\Ethan\Desktop\C1812\Spine\Nuu` files were not modified.
- Existing runtime animations detected from `Nuu.skel`: `idle`, `idle_intro`, `intro`, `skill1`, `skill2`, `skill3`; the requested `idel_front` should duplicate from the actual source animation name `idle`.
- Added `IDEL_FRONT_WORK.md` in the work copy with the Spine-editor workflow. A real front-facing animation still needs manual pose/key adjustment in Spine; binary `.spine`/`.skel` files should not be patched directly.
- Boundary unchanged: external source-asset preparation only; no Cocos runtime resource, backend API, SQL, economy rule, bag write, hero growth, or EX V1 behavior changed.

## 2026-06-07 External Nuu idel_front JSON Pass

- Generated `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu_idel_front.json` from the exported work-copy `Nuu.json`.
- The original exported `Nuu.json` remains untouched.
- `Nuu_idel_front.json` keeps all original animations and adds `animations.idel_front` immediately after `animations.idle`.
- The new animation clones `idle`, then reduces side-sway and rebalances torso/head/pelvis/arms/legs/hair timelines toward a centered front-idle pose.
- The atlas does not contain a full painted front-facing head/body set, so this is a rig-pose approximation. Open the generated JSON in Spine and preview `idel_front` for final visual polish.
- Boundary unchanged: external source JSON preparation only; no Cocos runtime resource, backend API, SQL, economy rule, bag write, hero growth, or EX V1 behavior changed.

## 2026-06-07 External Nuu JSON Import Correction

- `Nuu_idel_front.spine` is still the untouched copied binary project and will not show `idel_front`.
- The work-copy `Nuu.json` now includes `animations.idel_front`; the original JSON export is preserved as `Nuu.original_export.json`.
- To preview the new animation in Spine, open/import `C:\Users\Ethan\Desktop\C1812\Spine\Nuu_idel_front_work\Nuu.json`, then save a new `.spine` project from Spine if needed.
- Verification passed: `Nuu.json` parses and contains `idel_front`; `.spine/.spine.meta` scan under Cocos runtime resources remains `0`.

## 2026-06-07 Hero Detail Nuu Spine Intro To Idle

- Hero detail playback for the Abyss Witch / `UR_EVELYN` Spine now plays `intro` once and then queues `idle` as the looping animation.
- Fallback intro names are `idle_intro`, `appear`, `enter`, `show`, `born`, and `入场`; heroes without intro still loop idle directly.
- Removed the old hero-detail behavior that played `skill2` first and repeated a secondary animation every 15 seconds.
- Cocos readonly fallback assets for `UR_EVELYN` now use `portraitAsset=Nuu` and `spineAsset=Nuu` in both hero roster and codex APIs, matching the current DB/API resource fields.
- Verification passed: `npm.cmd run check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Boundary unchanged: hero-detail visual playback only; no backend API, SQL, economy rule, bag write, hero growth, gacha rule, or EX V1 behavior changed.

## 2026-06-07 Hero Detail Nuu Spine Load Retry

- Hero detail Spine loading now validates UUID results before treating them as `sp.SkeletonData`.
- If `spineUuid` loading fails, returns a non-SkeletonData asset, or applies unsuccessfully, the renderer retries the `resources.load(path, sp.SkeletonData)` resource path.
- If the Nuu runtime still cannot be parsed, the detail page now shows a visible `Spine 资源解析失败：spine/hero/Nuu/Nuu` hint instead of silently leaving only the abstract fallback.
- Current resource state: `assets/resources/spine/hero/Nuu` contains the old `Nuu.skel` runtime set and no `Nuu.json`; if the failure hint appears after Preview refresh, re-export a Cocos-compatible JSON/skel set into this folder.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.

## 2026-06-07 Hero Detail Nuu JSON Runtime Sync

- `assets/resources/spine/hero/Nuu` now contains the freshly exported JSON runtime set: `Nuu.json`, `Nuu.atlas`, and `Nuu.png`.
- `Nuu.json.meta` is the active Cocos `spine-data` resource with uuid `b20d194a-da4c-4868-b25a-1cb98c25d3e8`.
- The old `Nuu.skel` and `Nuu.skel.meta` were moved out of `assets/resources` into `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607/`, removing the duplicate dynamic load URL conflict for `spine/hero/Nuu/Nuu`.
- Backend SQL `D:\project\LootChain\sql\26_hero_spine_uuid_nuu_json_sync.sql` was added and sourced locally; `hero_template.id=25 / UR_EVELYN` now stores the JSON uuid above.
- `Nuu.json` parses and contains `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, and `skill3`, so the detail page can run the current `intro -> idle` playback path once Preview imports the new resource.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, DB uuid readback, live lobby hero API uuid readback, and both repos `git diff --check` with only LF/CRLF warnings.
- Preview note: `check:preview` still sees stale running Preview chunks; restart/refresh Cocos Creator Preview before judging the Nuu hero detail visually.
- Compatibility note: the exported file reports Spine `4.3.10`; if Cocos Creator 3.8.8 still cannot parse it after Preview refresh, re-export Nuu as Spine 4.2.x.
- Boundary unchanged: display resource metadata only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Nuu Spine 4.1.24 UUID Sync

- Nuu has been replaced again with a lower-version JSON runtime export. Current `assets/resources/spine/hero/Nuu/Nuu.json` reports Spine `4.1.24`.
- Active `Nuu.json.meta` uuid is now `d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- The replacement also restored `Nuu.skel`; it was archived out of `assets/resources` into `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607-0118/` because `Nuu.skel` and `Nuu.json` share the same dynamic resources URL.
- Backend SQL `D:\project\LootChain\sql\27_hero_spine_uuid_nuu_4124_sync.sql` was added and sourced locally.
- DB and live lobby hero API now return `UR_EVELYN` with `spineUuid=d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- Next visual step is to let Cocos finish importing the resource, then restart/refresh Preview and open Abyss Witch detail again.
- Boundary unchanged: display resource metadata only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Spine Failure Visibility

- Hero detail now emits the Spine load-start line as `console.warn`, not `console.info`.
- If UUID loading fails and resource-path retry also fails, the page shows a visible `Spine UUID 与路径资源均解析失败` hint instead of silently leaving only the fallback portrait.
- Atlas text containing `pma:true` now drives `skeleton.premultipliedAlpha=true`, matching the current Nuu export.
- Cocos restart had reset `profiles/v2/packages/preview.json` to `current_scene`; it is fixed back to `623f777a-eb33-4d74-ae88-eb79e749fcfe`.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Boundary unchanged: Cocos readonly hero-detail diagnostics/visual loading only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Nuu Spine Version Diagnosis

- The visible detail-page hint confirmed the active Nuu resource reaches the hero-detail Spine path but fails to parse/apply.
- Imported resource check: `Nuu` is `sp.SkeletonData`, has texture `Nuu.png`, `pma:true` atlas text, and the expected `intro` / `idle` animations.
- Root cause is version compatibility: current `Nuu.json` reports Spine `4.1.24`, while Cocos Creator 3.8.8 local engine compatibility files support the `3.8` and `4.2` runtime lines. The `4.2` checker requires `4.2.*`, and the `3.8` checker requires `3.8.*`.
- Hero detail now detects unsupported Spine versions and displays `Spine 4.1.24 不兼容，请导出 4.2.x 或 3.8.x`.
- Required asset fix: re-export Nuu as Spine `4.2.x` or `3.8.x`, replace `Nuu.json / Nuu.atlas / Nuu.png`, keep `Nuu.skel` out of the same folder, then sync `hero_template.id=25.spine_uuid` to the new `Nuu.json.meta` uuid.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.

## 2026-06-07 Hero Detail Nuu Spine 4.2.43 Runtime Sync

- Nuu has been re-exported as Spine `4.2.43`, which matches the Cocos Creator 3.8.8 Spine 4.2 runtime line.
- Current active runtime set is `assets/resources/spine/hero/Nuu/Nuu.json`, `Nuu.atlas`, and `Nuu.png`.
- `Nuu.json` parses successfully and contains `default` skin plus `intro`, `idle`, `idle_intro`, `skill1`, `skill2`, `skill3`, `ult`, and `victory`.
- `Nuu.json.meta` uuid stayed `d6f527d7-2988-42f3-8ad3-9c96636ea79d`, so `hero_template.id=25 / UR_EVELYN` did not require a new SQL migration.
- Local DB verification confirmed `portrait_asset=Nuu`, `spine_asset=Nuu`, and the same `spine_uuid` for `id=25`.
- The old `Nuu.skel` and `Nuu.skel.meta` restored by export were archived to `docs/spine-source-archive/hero/Nuu/runtime-skel-archived-20260607-0145/` to avoid the duplicate dynamic resource URL conflict.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and Nuu-folder `.skel/.skel.meta` scan `0`.
- Preview acceptance still requires restarting/refreshing Cocos Creator Preview after import, then opening Abyss Witch detail to confirm `intro -> idle` playback.
- Boundary unchanged: display runtime resource sync only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Spine Runtime Retry

- Abyss Witch detail still fell back after the 4.2.43 export, so the active failure point moved from version compatibility to `SkeletonData.getRuntimeData(true)`.
- `LobbyHeroDetailPanelRenderer` now retries runtime application for hero Spine data at `180ms`, `420ms`, and `900ms` before showing the fallback hint.
- Retry is limited to runtime parse/application failures; unsupported versions and invalid animations still fail closed.
- UUID data is retried first, then the resource-path fallback is retried with the same logic.
- The visible failure hint is moved upward and now includes runtime diagnostics such as Spine version, texture count, and atlas texture names.
- `assets/resources/spine/hero/Nuu/Nuu.png.meta` now uses `clamp-to-edge` wrapping instead of `repeat`, avoiding browser WebGL issues with the current non-power-of-two `2031x817` atlas.
- Guards were added to `check-layout` and `check-preview-freshness`.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Current browser Preview still serves an older `LobbyHeroDetailPanelRenderer` chunk missing the new retry tokens; stop/restart Preview or hard-refresh after Cocos finishes script compilation before visual acceptance.
- Boundary unchanged: Cocos readonly hero-detail runtime resilience only. No SQL, economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Spine Apply Exception Diagnostics

- The latest visible hint reached `Spine 资源应用异常：spine/hero/Nuu/Nuu`, confirming that `SkeletonData` loads but application into `sp.Skeleton` still throws.
- Hero detail now resolves runtime data before assigning `skeleton.skeletonData`, so the Cocos setter is no longer the first parse point.
- The visible failure hint now includes the actual exception message through `formatHeroSpineError(error)`.
- Guards were updated in `check-layout` and `check-preview-freshness`.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, and `.spine/.spine.meta` scan `0`.
- Boundary unchanged: Cocos readonly diagnostics only. No SQL, economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Spine Safe Runtime Enum Patch

- The visible failure hint advanced to `Cannot read properties of null (reading 'name')`, which matches Cocos Creator 3.8.8 Spine enum helpers reading `skins[i].name` / `anims[i].name`.
- Nuu remains a valid Spine `4.2.43` JSON export with `default` skin and `intro` / `idle` animations.
- Hero detail now patches loaded `SkeletonData` with safe runtime skin/animation enum providers built from `_skeletonJson`, avoiding Cocos enum helper crashes during `skeleton.skeletonData = data`.
- Default skin is not actively applied through `setSkin('default')`; only non-default skins are set.
- Guards were updated in `check-layout` and `check-preview-freshness`.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.
- `check:preview` still reports stale browser Preview chunks; the active hero-detail chunk is missing `patchHeroSpineRuntimeEnums` and related safe-enum tokens, so refresh/restart Preview after Cocos script compilation before visual acceptance.
- Boundary unchanged: Cocos readonly hero-detail runtime compatibility only. No SQL, economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Nuu Full Idle Presentation

- Nuu's `intro` animation can show only partial red hair/entry meshes in the first frames, which is not suitable as the hero-detail first read.
- Added `HERO_DETAIL_SPINE_DISPLAY_PROFILES`; Nuu now uses `preferIdleFirst: true`, so detail view starts on the complete `idle` silhouette.
- Nuu detail presentation also caps max Spine scale at `0.88` and applies a small x/y offset to keep the long hair/body inside the gothic stage.
- Other heroes keep the generic `intro -> idle` behavior.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Boundary unchanged: Cocos readonly hero-detail presentation only. No SQL, economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Skel-First Asset Pipeline

- Hero detail now supports the original Spine runtime pipeline directly: `<asset>.skel + <asset>.atlas + texture(s)`.
- The renderer loads `resources.load('spine/hero/${asset}/${asset}', sp.SkeletonData)` first and uses `spineUuid` only as fallback, so visual asset replacement under the same folder does not require SQL uuid sync every time.
- The loaded data cache is keyed by resource path rather than uuid.
- Safe skin/animation enum handling now works for both JSON and `.skel`: JSON names come from `_skeletonJson`, binary `.skel` names come from `runtimeData.skins` / `runtimeData.animations` with null entries filtered out.
- Asset rule: never keep same-basename `.skel` and `.json` together in one runtime folder, because both resolve to the same Cocos `resources` URL.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, and `.spine/.spine.meta` scan `0`.
- `check:preview` still reports stale browser Preview chunks; refresh/restart Preview after Cocos script compilation before validating `.skel` loading visually.
- Boundary unchanged: Cocos readonly hero-detail asset pipeline only. No SQL, economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Original Skel Runtime Restore

- Nuu has been restored to the original runtime assets under `assets/resources/spine/hero/Nuu/`: `Nuu.skel`, `Nuu.atlas`, and `Nuu.png`.
- `Nuu.json` / `Nuu.json.meta` are absent, so the folder no longer has a same-basename `.skel` / `.json` Cocos resource conflict.
- `Nuu.skel.meta` uuid is `aa51fc97-c90c-40aa-90d9-2e6f6949482e`, but no SQL sync is required because hero detail now loads the resource path first and treats `spineUuid` only as fallback.
- `Nuu.spine` / `Nuu.spine.meta` were archived to `docs/spine-source-archive/hero/Nuu/source-spine-archived-20260607-1225/`.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, and `.spine/.spine.meta` scan `0`.
- Boundary unchanged: Cocos readonly resource restore only. No SQL, economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Skel UUID Fallback Sync

- After restoring the original skel, DB still pointed `hero_template.id=25.spine_uuid` to the removed JSON uuid `d6f527d7-2988-42f3-8ad3-9c96636ea79d`.
- Added and locally executed backend SQL `D:\project\LootChain\sql\28_hero_spine_uuid_nuu_skel_restore.sql`.
- `hero_template.id=25 / UR_EVELYN` now stores `spine_uuid=aa51fc97-c90c-40aa-90d9-2e6f6949482e`, matching `assets/resources/spine/hero/Nuu/Nuu.skel.meta`.
- `Nuu.skel` reports Spine `3.8.97`; Cocos Creator 3.8.8 accepts the `3.8.*` runtime line except `3.8.75`.
- `check:preview` still reports stale browser Preview chunks, so visual validation still requires Cocos script compilation and a hard refresh/restart of Preview.
- Boundary unchanged: display resource metadata only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Hero Detail Nuu UUID Apply Fallback

- The restored original Nuu runtime set is valid in Cocos library: `Nuu.skel` imports as `sp.SkeletonData`, depends on `Nuu.png`, and uses atlas `pma:true`.
- `hero_template.id=25 / UR_EVELYN` is synced to `spine_uuid=aa51fc97-c90c-40aa-90d9-2e6f6949482e`.
- Hero detail still loads by resource path first for the batch `.skel` workflow, but if path loading/applying fails it now retries with the exact `spine_uuid` through `loadHeroSpineUuidData()`.
- UUID-loaded data is cached separately as `uuid:${uuid}`, avoiding collision with path cache and same-path resource residue from earlier JSON/skel swaps.
- `check-preview-freshness` now inspects both the transpiled Preview chunk and sourcemap `sourcesContent`, avoiding false stale reports for TypeScript-only tokens.
- Verification passed: `check:layout`, Cocos Creator 3.8.8 TypeScript no-emit, and `.spine/.spine.meta` scan `0`.
- Current Preview still needs Cocos script recompilation: `check:preview` only reports the hero-detail chunk missing the newly added uuid fallback tokens. Stop/reload Preview in Cocos Creator, then rerun `npm.cmd run check:preview` before visual acceptance.
- Boundary unchanged: Cocos readonly hero-detail loading resilience only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Skel-Only Restore After JSON Abort

- The accidental Nuu JSON runtime re-add was reverted out of `assets/resources`.
- Active runtime set for `UR_EVELYN / Nuu` is again skel-only:
  - `assets/resources/spine/hero/Nuu/Nuu.skel`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- The JSON pair was archived to `docs/spine-source-archive/hero/Nuu/runtime-json-archived-20260607-restore-skel/`.
- `scripts/check-layout.mjs` now requires the Nuu skel runtime set and forbids `Nuu.json(.meta)` in the same runtime folder for this stage.
- Local DB was restored with backend SQL `sql/28_hero_spine_uuid_nuu_skel_restore.sql`; `hero_template.id=25` now points to `spine_uuid=aa51fc97-c90c-40aa-90d9-2e6f6949482e`.
- Diagnosis remains: Nuu `.skel` reports Spine `3.8.97`, but the prior Preview failure was Cocos Spine WASM `memory access out of bounds` while applying this specific binary export.
- Next visual step: let Cocos Creator reimport `assets/resources/spine/hero/Nuu/`, then restart/refresh Preview and re-open Abyss Witch detail.
- Boundary unchanged: readonly display resource metadata only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu No-Rotation Atlas Repack

- The visible hero-detail error is now a Cocos Spine WASM binary apply failure: `memory access out of bounds`.
- DB uuid, resource path, Cocos library import, and Preview script freshness are all correct; the failure is no longer a SQL/path/stale-chunk issue.
- Kept the original `Nuu.skel` and rebuilt only `Nuu.atlas` / `Nuu.png` from the 46 original images under `assets/resources/spine/hero/Nuu/images/`.
- The original rotated atlas was archived to `docs/spine-source-archive/hero/Nuu/atlas-rotated-archived-20260607-1330/`.
- New atlas details:
  - page `2048x2048`;
  - `pma:false`;
  - all 46 regions use `rotate:false`;
  - no `rotate: 180` or `rotate: 270` remains.
- Synced Cocos `library` cache for the current Preview:
  - `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
  - `library/24/2488bcbc-471a-4d6e-b9c9-7f0ef3274f08.png`;
  - `library/aa/aa51fc97-c90c-40aa-90d9-2e6f6949482e.json` `_atlasText`.
- `scripts/check-layout.mjs` now rejects Nuu atlas `rotate: 180/270`.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, `check:preview`, and no-rotation atlas validation.
- Next visual step: hard-refresh browser Preview and reopen Abyss Witch detail. If the same WASM error remains, the remaining cause is the skel binary payload itself rather than atlas rotation.
- Boundary unchanged: readonly resource compatibility only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu 3.8.99 Binary Version Tag Test

- After the no-rotation atlas repack, Abyss Witch still failed with Cocos Spine WASM `memory access out of bounds`.
- Kept the skel-only direction and did not add JSON.
- Archived the pre-test `3.8.97` binary under `docs/spine-source-archive/hero/Nuu/runtime-skel-3897-before-version-tag-test-20260607-1340/`.
- Patched only the single same-length binary header version string:
  - `assets/resources/spine/hero/Nuu/Nuu.skel`: `3.8.97 -> 3.8.99`;
  - `library/aa/aa51fc97-c90c-40aa-90d9-2e6f6949482e.bin`: `3.8.97 -> 3.8.99`.
- Binary size remains `277716` bytes; `Nuu.skel.meta` uuid and DB `spine_uuid` remain `aa51fc97-c90c-40aa-90d9-2e6f6949482e`.
- Verification passed: `check:layout`, `.spine/.spine.meta` scan `0`, `check:preview`, and both active/library binaries parse as `3.8.99`.
- Next visual step: hard-refresh browser Preview with cache bypass and reopen Abyss Witch detail. If the same WASM error remains, the non-JSON fix is a fresh Spine `3.8.99` binary export of the same project.
- Boundary unchanged: readonly runtime compatibility experiment only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Real 3.8.99 Binary Export Sync

- User re-exported Nuu as a real Spine `3.8.99` binary runtime after the header-only version test still failed.
- Active runtime:
  - `assets/resources/spine/hero/Nuu/Nuu.skel`;
  - size `276937` bytes;
  - parsed version `3.8.99`;
  - SHA256 `E45F2E631FE34FF4E6D9BC6AA03FF8399EE9E51D824D9B996F571F41BD50E0BF`.
- Cocos Preview cache:
  - `library/aa/aa51fc97-c90c-40aa-90d9-2e6f6949482e.bin` matches the active skel byte-for-byte;
  - `Nuu.skel.meta` uuid remains `aa51fc97-c90c-40aa-90d9-2e6f6949482e`;
  - DB already points `UR_EVELYN` to that uuid, so no SQL change was required.
- Atlas remains the no-rotation pack from the previous step: 46 regions, all `rotate:false`, no `rotate:180/270`, `pma:false`.
- `scripts/check-layout.mjs` now verifies Nuu is exported as Spine `3.8.99` binary and keeps the no-JSON/no-180/270 guards.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, `check:preview`, and active/library skel hash match.
- Next visual step: hard-refresh browser Preview and reopen Abyss Witch detail.
- Boundary unchanged: readonly runtime resource sync only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Fresh UUID For 3.8.99 Re-Export

- After the true 3.8.99 export still showed the same WASM error, Nuu was moved to a fresh SkeletonData uuid to rule out browser/Cocos/WASM cache reuse of the old binary identity.
- `assets/resources/spine/hero/Nuu/Nuu.skel.meta` now uses:
  - `76bea053-8d55-4925-a0e8-278b50701154`.
- Cocos Preview cache was copied to:
  - `library/76/76bea053-8d55-4925-a0e8-278b50701154.bin`;
  - `library/76/76bea053-8d55-4925-a0e8-278b50701154.json`.
- Active skel and new library bin SHA256 both equal:
  - `E45F2E631FE34FF4E6D9BC6AA03FF8399EE9E51D824D9B996F571F41BD50E0BF`.
- Added and locally sourced backend SQL:
  - `D:\project\LootChain\sql\30_hero_spine_uuid_nuu_3899_reexport.sql`.
- Local DB now returns `UR_EVELYN.spine_uuid=76bea053-8d55-4925-a0e8-278b50701154`.
- `scripts/check-layout.mjs` now verifies Nuu is the fresh 3.8.99 re-export uuid.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, `check:preview`, DB readback, and active/library hash match.
- Next visual step: fully refresh Preview/reload lobby data so the hero API returns the new uuid, then reopen Abyss Witch detail.
- Boundary unchanged: readonly resource identity/cache-bust plus display metadata SQL only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Nonessential Binary Export Diagnosis

- Nuu still plays correctly in the Spine editor, but Cocos Preview still fails with `memory access out of bounds`.
- This is now a Cocos Spine WASM runtime compatibility problem, not a path, SQL, uuid, Preview stale, or atlas rotation problem.
- The active Nuu `.skel` still contains `./images/` and an absolute `D:/...` path.
- Known working current skels (`npc_1001`, `goods_1`) do not contain those paths.
- Most likely next test: re-export the same Nuu binary with `非必要的数据 / Nonessential data` unchecked.
- Recommended export settings:
  - data format `二进制`;
  - extension `.skel`;
  - `非必要的数据` unchecked;
  - `动画清理` can remain checked;
  - `纹理图集 打包` unchecked so the current no-rotation `Nuu.atlas` / `Nuu.png` stays in place.
- Boundary unchanged: diagnosis and export guidance only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu 4.2.43 JSON Runtime Sync

- User chose to switch Nuu to JSON after repeated Cocos Spine binary WASM failures.
- Active Nuu runtime is now JSON-only:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`.
- `Nuu.skel` and `Nuu.skel.meta` are absent from the runtime folder.
- `Nuu.json` parses as Spine `4.2.43`.
- `Nuu.json.meta` uuid is `a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`, and Cocos library has `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`.
- Added and locally sourced backend SQL:
  - `D:\project\LootChain\sql\31_hero_spine_uuid_nuu_json_4243_sync.sql`.
- Local DB now returns `UR_EVELYN.spine_uuid=a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`.
- `scripts/check-layout.mjs` now requires Nuu Spine `4.2.x` JSON and rejects `Nuu.skel(.meta)` in the runtime folder.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, `check:preview`, and active JSON-only folder check.
- Next visual step: hard-refresh Preview/reload lobby data and reopen Abyss Witch detail.
- Boundary unchanged: readonly runtime resource sync plus display metadata SQL only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Atlas Format Compatibility Fix

- Abyss Witch/Nuu began rendering only a tiny fragment after the JSON switch.
- Root cause was the Spine 4.2 compact atlas format:
  - source atlas used `bounds:` / `offsets:`;
  - working project Spine atlases use `xy/size/orig/offset/index`;
  - Cocos library cache also embedded the compact atlas in `_atlasText`.
- Converted `assets/resources/spine/hero/Nuu/Nuu.atlas` to Cocos-compatible atlas entries for all `46` regions.
- Synchronized the converted atlas into Cocos library cache:
  - `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
  - `_atlasText` in `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`.
- `scripts/check-layout.mjs` now rejects `bounds:` in Nuu atlas and requires `xy:` entries.
- Next visual step: hard-refresh browser Preview and reopen Abyss Witch detail.
- Boundary unchanged: readonly runtime resource/cache format fix only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu No-Rotation Atlas Repack

- After the atlas format fix, Nuu rendered but hair/feet/posture looked wrong versus the Spine editor reference.
- User confirmed the Spine 4.2 export had atlas rotation disabled; the issue is therefore compact `bounds/offsets` atlas semantics plus trim/offset interpretation in the Cocos import/cache path, not a user-enabled rotation setting.
- Repacked `assets/resources/spine/hero/Nuu/images/*.png` into a fresh no-trim `Nuu.png` to remove offset ambiguity.
- Rebuilt `Nuu.atlas` as Cocos-compatible `xy/size/orig/offset/index` entries for all `46` regions.
- New atlas page is `2048x2048`, with source-image crops verified for key hair/foot/head regions.
- Synchronized the repacked page/atlas into Cocos library cache:
  - `library/24/2488bcbc-471a-4d6e-b9c9-7f0ef3274f08.png`;
  - `library/23/23fa6f1b-60b3-422d-89b6-1a4d09087bf8.atlas`;
  - `_atlasText` in `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`.
- Next visual step: hard-refresh browser Preview and reopen Abyss Witch detail; if only the motion posture is still off, tune Nuu's hero-detail animation selection separately.
- Boundary unchanged: readonly texture atlas repack/cache sync only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Export Settings Clarification

- User confirmed Spine packer `旋转 / Rotate` was already unchecked, so do not enable it for the next test.
- Recommended next Spine export/repack settings for Cocos:
  - Data: JSON, Spine 4.2.x.
  - Texture atlas: packed.
  - `旧格式输出 / Legacy output`: enabled.
  - `旋转 / Rotate`: disabled.
  - `去除X轴空白区` and `去除Y轴空白区`: disabled for this Nuu mesh test.
  - `别名 / Alias`: disabled.
  - `预乘Alpha / Premultiply alpha`: disabled unless the atlas writes `pma:true` and the Cocos renderer is configured for it.
- If that clean export still looks wrong after a full Preview reload, compare the Cocos-selected detail animation with the exact animation shown in Spine; current Nuu profile prefers `idle`.
- Boundary unchanged: export guidance only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Clean 4.2.43 Export Sync

- User re-exported Nuu with Cocos-friendly packer settings.
- Active runtime remains JSON-only:
  - `assets/resources/spine/hero/Nuu/Nuu.json`, Spine `4.2.43`;
  - `assets/resources/spine/hero/Nuu/Nuu.atlas`;
  - `assets/resources/spine/hero/Nuu/Nuu.png`, `2048x1024`.
- Import UUIDs stayed stable:
  - SkeletonData uuid `a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a`;
  - atlas uuid `23fa6f1b-60b3-422d-89b6-1a4d09087bf8`;
  - texture uuid `2488bcbc-471a-4d6e-b9c9-7f0ef3274f08`.
- No SQL change is required because `hero_template.id=25` already points to the same `spine_uuid`.
- Atlas validation now confirms `46` regions, `xy` legacy entries, `rotate:false`, `offset:0,0`, `orig == size`, no `bounds:`, no `rotate:180/270`, and no `pma:true`.
- Cocos library cache is in sync through Creator import: `library/a4`, `library/23`, and `library/24` all have the fresh 15:03 resource data.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, and `check:preview`.
- Next visual step: hard-refresh Preview and reopen Abyss Witch detail; if it is still wrong, compare the exact Spine editor animation with the Cocos-selected `idle` animation instead of changing atlas settings again.
- Boundary unchanged: readonly runtime resource sync and guard update only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Hero Detail Animation Profile

- After the clean export, Nuu still looked like the old standing pose in Preview.
- Resource/import state is clean, so the remaining mismatch is now treated as animation selection rather than atlas packing.
- `LobbyHeroDetailPanelRenderer` now supports per-hero display profile animation overrides:
  - `loopAnimation`;
  - `loopFallbackHints`;
  - `skipIntro`;
  - `introAnimation`;
  - `introFallbackHints`.
- Nuu is now configured to loop `run` and skip intro in hero detail, matching the user's Spine editor reference pose more closely than `idle`.
- `scripts/check-layout.mjs` and `scripts/check-preview-freshness.mjs` now require the new Nuu animation profile tokens.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, and `.spine/.spine.meta` scan `0`.
- Current Preview caveat: `check:preview` fails because the running browser Preview still serves old chunk `chunks/a7/a7fb55c8dfd684d9aeec34c18872af625688bf8e.js`, missing `loopAnimation: 'run'`, `skipIntro: true`, `displayProfile.loopAnimation`, and `displayProfile.skipIntro`.
- Next visual step: restart/refresh Cocos Preview, rerun `check:preview`, then reopen Abyss Witch detail.
- Boundary unchanged: readonly hero-detail animation selection only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu RGBA Timeline Runtime Fix And Intro Idle Profile

- Browser Preview testing showed Nuu was loading as `sp.SkeletonData`, but the forced `run` profile still looked wrong for the hero detail page.
- Runtime diagnosis found Cocos warning `[Spine] Invalid timeline type for a slot: rgba`; the affected Nuu JSON animations were `idle_intro`, `intro`, and `skill2`, which were present in JSON but not playable in Cocos runtime.
- Converted Nuu runtime JSON slot timelines from `rgba` to Cocos-compatible `color` in:
  - `assets/resources/spine/hero/Nuu/Nuu.json`;
  - `library/a4/a47845b1-08e7-4ffc-a0e6-4557b0ad5d8a.json`.
- After conversion, runtime animation names include `intro`, `idle_intro`, and `skill2`, and `setAnimation()` succeeds for them.
- Nuu hero detail profile now uses `intro -> idle` instead of the temporary `run` loop:
  - `loopAnimation: 'idle'`;
  - `introAnimation: 'intro'`;
  - `maxScale: 0.52`;
  - `xRatio: -0.035`;
  - `yRatio: 0.012`.
- `idle_intro -> idle` was tested but rejected because it can leave the character invisible after the queue; `intro -> idle` is the accepted current-stage behavior.
- Verification passed: `check:layout`, Cocos TypeScript no-emit with local `cc` declarations, `.spine/.spine.meta` scan `0`, and source/library `rgba` scan `0`.
- Preview verification: after Cocos Creator recompiled the Preview chunk, `npm.cmd run check:preview` passed.
- Real-code browser automation reopened Abyss Witch detail and logged `animation=intro -> idle`, node scale `0.52`, and the new y placement.
- Final screenshots:
  - `D:\project\lootchain-cocos\temp\codex-nuu-final-intro-0700ms.png`;
  - `D:\project\lootchain-cocos\temp\codex-nuu-final-idle.png`.
- Extra visual trial: hiding `R_hair01 + hair03` removes the large hair/cloth loop but cuts away too much hair, so that slot-hiding hack was not committed.
- Boundary unchanged: readonly display/resource compatibility only. No economy rule, gacha probability, pool item, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy endpoint changed.

## 2026-06-07 Nuu Raw 4.2 Runtime Lock

- User chose the complete-export path and asked not to mutate Nuu Spine asset content.
- Active Nuu files in `assets/resources/spine/hero/Nuu/` now match the latest external complete export under `C:\Users\Ethan\Desktop\C1812\Spine\Nuu\2` byte-for-byte.
- Nuu remains raw Spine `4.2.43` JSON, including its original `rgba` slot timelines. The old `rgba -> color` compatibility guard was removed because that belonged to the temporary 3.8-runtime workaround.
- Project engine config now selects `spine-4.2` in both:
  - `settings/v2/packages/engine.json`;
  - `profiles/v2/packages/engine.json`.
- Browser automation proved the root cause:
  - ordinary current Preview still serves Spine 3.8 engine import-map and logs `Invalid timeline type for a slot: rgba`;
  - temporary 4.2 import-map Preview loads all 14 Nuu animations and plays `intro -> idle` correctly.
- `scripts/check-preview-freshness.mjs` now fails when Preview still serves Spine 3.8, so stale engine runtime will no longer be mistaken for a valid Preview.
- Current local caveat: the generated Cocos engine cache under `D:\Program Files\cocos\editors\Creator\3.8.8\...\.cache\dev\preview\import-map.json` is read-only for normal users, so Cocos Creator must rebuild it with sufficient permission or from a user-writable install before ordinary Preview can pass the new runtime check.
- Boundary unchanged: this is display/runtime configuration only; no Spine asset content rewrite, backend API, SQL, economy rule, gacha item/probability/pity/cost/reward, EX V1, exchange/reissue, bag write, or hero growth path was opened.

## 2026-06-07 Nuu Runtime Baseline Correction

- User clarified that the rest of the project Spine assets are still `3.x`, so the final project baseline must stay Spine `3.8`.
- The 4.2 browser override was only diagnostic: it proved raw Nuu `4.2.43` works under Spine 4.2, but Cocos uses one global Spine runtime and cannot safely mix Nuu 4.2 with existing 3.8 hero/UI Spine assets.
- Restored project runtime expectation to `spine-3.8`:
  - `profiles/v2/packages/engine.json`;
  - `settings/v2/packages/engine.json`;
  - `scripts/check-preview-freshness.mjs`.
- Current accepted Nuu path is now: re-export Nuu as a complete Spine `3.8.x` JSON package, preferably from Spine `3.8.99`, producing `Nuu.json`, `Nuu.atlas`, and `Nuu.png`.
- `scripts/check-layout.mjs` now rejects Nuu `4.2.x` JSON and 4.x `rgba` timelines while the project baseline is 3.8. Until Nuu is re-exported as 3.8 JSON, `check:layout` should fail with a targeted Nuu version message.
- Boundary unchanged: this is a readonly runtime/export correction only; no economy, SQL, backend API, gacha, bag, EX V1, or hero-growth surface changed.

## 2026-06-07 Hero Card Background Replaces Triangle

- Hero roster cards now use `cardBackgroundAsset` as the center card artwork instead of drawing the triangle relief whenever the field is configured.
- The artwork is rendered inside the card, above `hero_card_frame.png`'s interior and below border effects, rarity, stars, name, power, level, and the class badge.
- Artwork size is clamped to the card interior, so the image node cannot exceed the card dimensions.
- Heroes without a valid `cardBackgroundAsset` still fall back to the old triangle relief.
- Verification passed: `check:layout`, TypeScript no-emit, `.spine` source scan `0`, and `git diff --check` with only LF/CRLF warnings. Current `check:preview` reports the running Preview still has an old hero-roster chunk; refresh/restart Preview for visual acceptance.
- Boundary unchanged: Cocos readonly rendering only; no economy, SQL, backend API, gacha, bag, EX V1, hero-growth, ownership, rarity, level, star, or power semantics changed.

## 2026-06-07 Hero Card Background Texture Fallback

- `cardBackgroundAsset` now stores/normalizes a base resources path such as `ui/hero-roster/card_background/StoryCover_Nuu`.
- Hero roster card art first tries `${assetPath}/spriteFrame`, then falls back to texture-only imports via `Texture2D` and creates a runtime `SpriteFrame`.
- This fixes images like `StoryCover_Nuu.png`, whose Cocos meta is imported as `texture` without a `spriteFrame` subresource.
- Verification passed: `check:layout`, TypeScript no-emit, `.spine` source scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Current `check:preview` still reports stale hero-roster chunk `chunks/16/169f5a75e3947698e88b496965aee7b3c8ca24ab.js`; refresh/restart Cocos Preview before visual acceptance.
- Boundary unchanged: readonly card presentation only; no SQL, backend API, economy, gacha, bag, EX V1, or hero-growth surface changed.

## 2026-06-07 Hero Card Artwork Lower Placement

- Hero roster `cardBackgroundAsset` artwork uses the current card ratios `width=1`, `height=0.5`, and `y=0.02`.
- The image remains clamped to the card interior and stays below rarity, stars, name, power, level, class badge, and border effects.
- Verification passed: `check:layout`, TypeScript no-emit, `.spine` source scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Boundary unchanged: readonly card composition only; no SQL, backend API, economy, gacha, bag, EX V1, or hero-growth surface changed.

## 2026-06-07 Hero Card Stars Replace Power Line

- Hero roster cards no longer render the per-card combat-power line.
- The hero name now sits above the star row with tighter spacing: `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.18`, `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.13`.
- The top HUD/profile power displays are unchanged; this only affects the card body presentation.
- Verification passed: `check:layout`, TypeScript no-emit, `.spine` source scan `0`, and `git diff --check` with only LF/CRLF warnings.
- Boundary unchanged: readonly card presentation only; no SQL, backend API, economy, gacha, bag, EX V1, hero-growth, or hero stat semantics changed.

## 2026-06-07 StoryCover Nuu Card Background Sync

- Nuu's hero roster card background fallback path now uses `ui/hero-roster/card_background/StoryCover_Nuu`.
- `StoryCover_Nuu.png` is present under `assets/resources/ui/hero-roster/card_background/` and imports as `texture`, so the existing Texture2D card-art fallback remains the intended load path.
- API contract and current Cocos docs now show `UR_EVELYN -> ui/hero-roster/card_background/StoryCover_Nuu`.
- Newly detected hero `.spine/.spine.meta` sources were moved out of `assets/resources/spine` into `docs/spine-source-archive/hero/source-archived-20260607-storycover-sync/`; the runtime source scan is back to `0`.
- Local DB readback was not run because `mysql` is not available on the current terminal PATH; user confirmed DB was already updated.
- Verification passed: `check:layout`, TypeScript no-emit, `.spine` source scan `0`, and `git diff --check` with only LF/CRLF warnings. Current `check:preview` is stale and missing `StoryCover_Nuu`; refresh/restart Preview for visual acceptance.
- Boundary unchanged: readonly display path sync only; no SQL migration, backend API shape, economy, gacha, bag, EX V1, hero-growth, or hero stat semantics changed.

## 2026-06-07 Restore Nuu Illust Card Background

- Restored Nuu's hero roster card background to `ui/hero-roster/card_background/Nuu_Illust`.
- Added and locally sourced backend SQL `D:\project\LootChain\sql\32_hero_card_background_restore_nuu_illust.sql`.
- Local DB readback: `hero_template.id=25 / UR_EVELYN -> ui/hero-roster/card_background/Nuu_Illust`.
- `assets/resources/spine` `.spine/.spine.meta` scan remains `0`; archived source files were not moved back into runtime resources.
- Boundary unchanged: readonly display metadata/path rollback only; no backend API shape, economy, gacha, bag, EX V1, hero-growth, or hero stat semantics changed.

## 2026-06-07 Nine Hero Display Asset Batch Sync

- Added and locally sourced backend SQL `D:\project\LootChain\sql\33_hero_display_asset_batch_sync.sql`.
- `hero_template` display assets are now synced for:
  - `UR_ARTHAS -> IshmaelA / IshmaelA_Illust`;
  - `UR_ATLAS -> Lucrecia / Lucrecia_Illust`;
  - `UR_AURELIA -> Belladonna / Belladonna_Illust`;
  - `UR_NYX -> Sphinx / Sphinx_Illust`;
  - `UR_SERAPHINA -> LucienA / LucienA_Illust`;
  - `SSR_KANE -> Ishmael / Ishmael_center`;
  - `SSR_LIVIA -> Carmilla / Carmilla_center`;
  - `SSR_MICHAEL -> HeylelS01 / HeylelS01_Illust`;
  - `SSR_RON -> Eulenspigel / Eulenspigel_Illust`.
- Cocos hero detail now loads SkeletonData by `spineUuid` first, then falls back to `spine/hero/{spineAsset}/{spineAsset}`. This keeps folders with both JSON and SKEL from picking the wrong runtime asset.
- The 9 newly mapped hero detail profiles use `idle` only; Nuu keeps its current `intro -> idle` profile.
- `LobbyHeroApi` includes readonly fallback display metadata for the same 9 hero codes for old-backend local preview resilience.
- Verification:
  - `npm.cmd run check:layout` passed;
  - Cocos Creator 3.8.8 TypeScript no-emit passed;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `npm.cmd run check:preview` passed;
  - local MySQL readback confirmed all 9 rows;
  - browser Preview CDP screenshots confirmed owned mapped cards/details render, including `SSR_KANE -> Ishmael / idle` and `SSR_LIVIA -> Carmilla / idle`.
- Runtime note: the currently running 8081 game-server process still omits `cardBackgroundAsset` in live JSON, while current backend source maps it. Restart `lootchain-game` from current source before API-level card-background readback acceptance; Cocos readonly fallback already displays the owned mapped cards.
- Boundary unchanged: display metadata and readonly Cocos presentation only; no economy, gacha, bag, EX V1, hero-growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Hero Detail Spine Nuu-Matched Visual Size Normalization

- Hero detail Spine sizing now uses Nuu/Abyss Witch as the accepted visual baseline instead of shrinking wide raw-bounds assets by their full width.
- Nuu keeps its accepted `intro -> idle`, `maxScale: 0.52`, `xRatio: -0.035`, and `yRatio: 0.012`.
- The 9 mapped UR/SSR idle-only detail profiles now use a stronger Nuu-match profile:
  - `HERO_DETAIL_NUU_MATCHED_HEIGHT_RATIO = 0.78`;
  - `HERO_DETAIL_NUU_MATCHED_MAX_WIDTH_RATIO = 3.2`;
  - `HERO_DETAIL_NUU_MATCHED_MAX_SCALE = 0.78`;
  - `HERO_DETAIL_NUU_MATCHED_SCALE_MULTIPLIER = 1.18`.
- The scale resolver now applies `displayProfile.scaleMultiplier`, so wide weapons/hair/cloth bounds no longer make the character body render noticeably smaller than Nuu.
- Verification passed: `check:layout`, Cocos Creator 3.8.8 TypeScript no-emit, `.spine/.spine.meta` scan `0`, and 2026-06-08 follow-up `check:preview`.
- Boundary unchanged: readonly Cocos hero-detail presentation only; no SQL, backend API, economy, gacha, bag, EX V1, hero-growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Hero Roster Card Background Nuu-Matched Figure Scale

- Hero-roster card background artwork now uses Nuu's card figure size as the visual baseline.
- `LobbyHeroRosterPanelRenderer` wraps card artwork in `LobbyHeroRosterCardBackgroundMask` using `Mask.Type.GRAPHICS_RECT`, allowing non-Nuu images to be enlarged while staying clipped inside the card art area.
- Nuu keeps `HERO_ROSTER_CARD_BACKGROUND_NUU_VISIBLE_HEIGHT_RATIO = 0.5`.
- Other mapped card backgrounds use `HERO_ROSTER_CARD_BACKGROUND_MATCHED_VISIBLE_HEIGHT_RATIO = 0.58` plus per-asset visible-alpha height ratios and focus-x offsets, so transparent padding in the source image no longer makes the figure look much smaller.
- Verification passed: `check:layout`, Cocos Creator 3.8.8 TypeScript no-emit, `.spine/.spine.meta` scan `0`, and 2026-06-08 follow-up `check:preview`.
- Boundary unchanged: readonly Cocos hero-roster card composition only; no SQL, backend API, economy, gacha, bag, EX V1, hero-growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Gacha Draw Redis-Unavailable Error Clarity

- Hero Summon real draw previously surfaced Redis connection failures as generic `系统异常`.
- Local diagnosis found `localhost:6379` is not reachable; new draw requests require Redis idempotency and Redisson locking before cost deduction.
- Backend `GachaDrawServiceImpl` in `D:\project\LootChain` now returns a clear business message when Redis/Redisson is unavailable: `抽卡服务暂不可用，请确认本地 Redis 已启动后重试`.
- Redisson setup/acquisition failures now clean up the already-registered request key, so a failed lock path does not leave a temporary false `抽卡请求处理中` state.
- Idempotent replay with an existing draw request still succeeds and does not create a new draw or deduct resources.
- Verification passed:
  - `mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=GachaDrawServiceImplTest" test` with 6 tests;
  - `npm.cmd run check:layout`;
  - Cocos Creator 3.8.8 TypeScript no-emit using generated Cocos declarations;
  - `npm.cmd run check:preview`;
  - `assets/resources/spine` `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed in both repos with only LF/CRLF warnings.
- Redis follow-up: `Test-NetConnection 127.0.0.1 -Port 6379` still returns `TcpTestSucceeded=False`.
- Restart `lootchain-game` for the clearer message to appear in Cocos; start Redis on `localhost:6379` for real draw to proceed.
- Boundary unchanged: no SQL, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 Active R/SR Card Background Asset Sync

- Added 12 R/SR card background PNGs under `assets/resources/ui/hero-roster/card_background` with Cocos texture-only `.meta` files:
  - `npc_1001`, `npc_1012`, `npc_1004`, `npc_1008`, `npc_1016`, `npc_1003`;
  - `npc_21006`, `npc_1002`, `npc_1028`, `npc_1038`, `npc_1037`, `npc_1036`.
- Backend SQL `D:\project\LootChain\sql\34_active_r_sr_card_background_asset_sync.sql` was sourced locally. Enabled R/SR `hero_template.card_background_asset` now follows `ui/hero-roster/card_background/` + current `spine_asset`; readback confirmed 12 matching rows.
- `LobbyHeroApi` and `LobbyCodexApi` now include readonly fallback card-background metadata for the same 12 enabled R/SR hero codes, for old-backend/local Preview resilience.
- `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan, and new meta JSON parse checks passed.
- Current `check:preview` reports stale `LobbyHeroApi` / `LobbyCodexApi` chunks; refresh/restart Cocos Preview before visual acceptance.
- Boundary unchanged: display metadata and readonly Cocos presentation only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 R/SR NPC Card Background Scale Clamp

- Newly added `ui/hero-roster/card_background/npc_*` card backgrounds now use a compact display profile in `LobbyHeroRosterPanelRenderer`.
- NPC card backgrounds are detected by `HERO_ROSTER_CARD_BACKGROUND_NPC_PREFIX` and use:
  - `HERO_ROSTER_CARD_BACKGROUND_NPC_VISIBLE_HEIGHT_RATIO = 0.42`;
  - `HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_HEIGHT_RATIO = 0.56`;
  - `HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO = 0.82`.
- This keeps R/SR NPC images inside the card art area, preserves aspect ratio, and stops them from force-filling the whole mask width. Existing Nuu and UR/SSR `*_Illust` card-art profiles are unchanged.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, and `.spine/.spine.meta` scan `0`.
- Current `check:preview` reports stale `LobbyHeroRosterPanelRenderer`; refresh/restart Cocos Preview before visual acceptance.
- Boundary unchanged: readonly card presentation only; no SQL, backend API, economy, gacha, bag, EX V1, hero-growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Gacha Summon Animation Before Real Draw

- Clicking summon now enters a transient Cocos-only `gachaSummon` view before submitting the real draw request.
- The summon scene imports PNG textures from the C1812-1 summon composition into `assets/resources/ui/gacha/summon`: `RecruitBG`, `Summon_BG_Floor`, `PrivateEquip_MagicCircle`, `Recruit_Light`, `silhouette_character`, `Summon_Ally`, `Summon_Neutral`, `Summon_Bystander`, and `Summon_Pradator`.
- `startGachaDraw()` now stores a `PendingGachaDraw`, plays the animation for `GACHA_SUMMON_ANIMATION_DURATION_SECONDS`, and only then calls the existing draw API through `executeGachaDrawAfterAnimation()`.
- The animation layer blocks duplicate clicks and stale scheduled tickets, while preserving the existing real draw API, requestId, result, error, pity refresh, and readonly asset refresh flow.
- Guard scripts now require the summon resources and the pre-draw animation flow tokens.
- Verification passed: `check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, summon `.meta` JSON parse, and `git diff --check` with only LF/CRLF warnings.
- Current Preview caveat: `check:preview` reports stale chunks for `LootChainGameRoot`, `LobbyHeroRosterPanelRenderer`, `GachaSceneConfig`, and `GachaSceneRenderer`; refresh/restart Cocos Preview before judging the new summon animation and NPC card scale clamp.
- Boundary unchanged: frontend animation and PNG resource display only; no backend API, SQL, economy rule, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Recruit_take4 Spine Summon Animation

- The summon pre-draw animation now uses the actual C1812-1 Spine runtime asset instead of only static PNG composition.
- Imported `Recruit_take4.skel`, `Recruit_take4.atlas`, and `Recruit_take4.png` from `C:\Users\Ethan\Desktop\C1812-1\素材\Assets\Data\Prefab\UI\Popup\Summon` into `assets/resources/spine/gacha/summon/recruit_take4`.
- Added `GACHA_SUMMON_SPINE_RESOURCE`, `GACHA_SUMMON_SPINE_UUID`, `GACHA_SUMMON_SPINE_SKIN`, and `GACHA_SUMMON_SPINE_ANIMATION` in `GachaSceneConfig`.
- `GachaSceneRenderer` now renders `GachaSummonRecruitTake4SpineNode`, loads `sp.SkeletonData` by UUID/resource path, applies skin/animation, and keeps the existing silhouette/PNG layer only as fallback.
- Guard scripts now require the Recruit_take4 Spine files, meta linkage, config constants, and renderer playback tokens.
- Verification passed: red `check:layout` before the fix, green `check:layout` after the fix, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, summon Spine `.meta` JSON parse, and `git diff --check` with only LF/CRLF warnings.
- Current Preview caveat: `check:preview` is stale for `GachaSceneConfig` and `GachaSceneRenderer`; restart/refresh Cocos Preview so it imports the new Spine resource before judging the animation.
- Boundary unchanged: frontend Spine animation playback only; no backend API, SQL, economy rule, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Fullscreen Summon Background And Rarity Burst

- Added `Summon_Normal_BG.png` as a fullscreen summon backdrop under `assets/resources/ui/gacha/summon`.
- The summon scene now uses cover sizing through `GachaSummonFullScreenBackground`, so the background fills the viewport instead of reading as a centered square.
- `Recruit_take4` still drives the Spine animation, but `hideSummonSpineSquareBackground()` clears the exported square `BG` attachment when the runtime allows it.
- The real draw request is now submitted during the `gachaSummon` animation with the existing `/api/player/gacha/draw` endpoint, using the same requestId/idempotency path. The result is held in memory until the animation finishes.
- The highest returned rarity drives the animation tone: SSR uses `GachaSummonRarityGoldBurst`, UR uses `GachaSummonRarityUrBurst`, and SSR/UR hold the burst briefly before the existing result page opens.
- Verification passed: red `check:layout` before implementation, green `check:layout` after implementation, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, new summon `.meta` JSON parse, and `git diff --check` with only LF/CRLF warnings.
- Current Preview caveat: `check:preview` is stale for `LootChainGameRoot`, `GachaSceneConfig`, and `GachaSceneRenderer`; refresh/restart Cocos Preview before judging the fullscreen background and SSR/UR rarity burst.
- Boundary unchanged: same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Summon Failure Path Minimum Animation Guard

- Fixed the early-failure path where clicking summon could flash the animation and immediately return to the summon page.
- `executeGachaDrawDuringAnimation()` now stores `pending.error` when the existing draw request fails, instead of switching out of `gachaSummon` immediately.
- `completePendingGachaDrawIfReady()` waits for the minimum animation window before presenting either a result or an error.
- Added `presentPendingGachaDrawFailure()` so local Redis/backend failures still allow the summon animation to be visible before returning with the error message.
- Verification passed: red `check:layout` before the fix, green `check:layout` after the fix, Cocos TypeScript no-emit, `.spine/.spine.meta` scan `0`, summon `.meta` JSON parse, and `git diff --check` with only LF/CRLF warnings.
- Current Preview caveat: `check:preview` is stale for `LootChainGameRoot` and still misses the delayed failure-path tokens; refresh/restart Cocos Preview before visual validation.
- Boundary unchanged: frontend flow/error presentation only; same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Gacha Summon Video Replacement

- The previous PNG/Spine summon-animation path has been withdrawn.
- Removed the old summon-animation resource folders under `assets/resources/ui/gacha/summon*` and `assets/resources/spine/gacha/summon*`.
- Added the requested summon media:
  - `assets/resources/video/gacha/call1.mp4` for normal/lower-rarity draw results;
  - `assets/resources/video/gacha/call2.mp4` for draws containing `SSR` or `UR`;
  - `assets/resources/audio/gacha/call.mp3` as the summon call audio.
- Clicking summon now submits the existing real draw request first, then chooses the full-screen video from the actual returned highest rarity:
  - `SSR` / `UR` -> `video/gacha/call2`;
  - all other results -> `video/gacha/call1`.
- `GachaSceneRenderer` uses a full-screen `VideoPlayer` with embedded video audio muted and plays `audio/gacha/call` through `AudioSource`; video completion hands off to the existing result page.
- Draw failure skips video playback and returns to the summon page with the backend error message.
- Guard scripts now require the new video/audio flow and reject the removed old summon PNG/Spine animation path.
- Verification passed: red/green `check:layout`, directed Cocos TypeScript no-emit, new `.meta` JSON parse, `ffprobe`/extracted-frame self-preview for both videos, `.spine/.spine.meta` scan `0`, and `git diff --check` with only LF/CRLF working-copy warnings.
- No real new draw was executed because it would spend resources, write draw logs, and grant heroes/fragments without explicit confirmation.
- Current Preview caveat: `check:preview` currently reports stale `LootChainGameRoot`, `GachaSceneConfig`, and `GachaSceneRenderer` chunks; restart/refresh Cocos Creator Preview so it imports the new video/audio resources and serves the updated chunks before visual runtime validation.
- Boundary unchanged: frontend video/audio presentation only; same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Gacha Summon Video Aspect Cover Fix

- Fixed the stretched/deformed full-screen summon video in 1920x1080 Preview.
- Source summon videos are 1680x720, so the renderer now treats them as 2.33:1 media instead of forcing them into the viewport aspect ratio.
- Added `GACHA_SUMMON_VIDEO_ASPECT_WIDTH = 1680` and `GACHA_SUMMON_VIDEO_ASPECT_HEIGHT = 720`.
- `GachaSceneRenderer.resolveSummonVideoCoverSize()` now computes an aspect-preserving cover size; at 1920x1080 it uses 2520x1080 and crops the sides rather than stretching the frame.
- `VideoPlayer.keepAspectRatio` is now `true`.
- Guard scripts now require the aspect-cover path and reject `videoPlayer.keepAspectRatio = false`.
- Verification passed: red `check:layout` caught the old stretched path, green `check:layout` passed after the fix, directed Cocos TypeScript no-emit passed, 1920x1080 cover calculation resolved to 2520x1080, `.spine/.spine.meta` scan returned `0`, and `git diff --check` passed with only LF/CRLF working-copy warnings.
- Current Preview caveat: `check:preview` currently reports stale `GachaSceneConfig` and `GachaSceneRenderer` chunks; restart/refresh Cocos Creator Preview so it serves the updated chunks before judging the visual fix.
- Boundary unchanged: frontend video sizing only; same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Read-Only SSR Probability Diagnosis

- User reported that the current SSR winning rate feels too high.
- No economy values were changed.
- Read-only review confirmed `NORMAL_HERO` config version 1 currently uses:
  - `R = 0.480000`;
  - `SR = 0.320000`;
  - `SSR = 0.180000`;
  - `UR = 0.020000`.
- SSR/UR combined probability is 20% per draw, so a ten-draw session has about `1 - 0.8^10 = 89.3%` chance of containing at least one SSR/UR before pity effects.
- Live read-only MySQL sample for current `NORMAL_HERO` draw results showed `UR=1`, `SSR=12`, `SR=32`, `R=29`, so the observed high-rarity rate is close to the configured rate.
- Conclusion: the high SSR feel is consistent with the current backend probability configuration, not a Cocos video-selection bug.
- Boundary unchanged: read-only diagnosis only; no SQL, backend API, Cocos economy behavior, `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Gacha Rate/Pity Adjustment And Real Pool Opening

- User explicitly approved this economy change and real-opening pass.
- Current active rates after Stage 4HD: `LIMITED_ABYSS_PREVIEW` and `NORMAL_HERO` use `R=0.576000`, `SR=0.384000`, `SSR=0.036000`, `UR=0.004000`; `BASIC_CONTRACT_PREVIEW` uses `R=0.600000`, `SR=0.400000` and has no active SSR/UR rate or reward item.
- `HERO_BASE` pity is now `SSR=80` and `UR=180` for limited/hero summon; normal summon uses `BASIC_RS_ONLY` without SSR/UR pity.
- `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW` are now real drawable pools: `locked=false`, `drawEnabled=true`, `previewOnly=false`.
- Current cost model:
  - `LIMITED_ABYSS_PREVIEW`: `LIMITED_CONTRACT_TICKET` 1/10 first, fallback `DIAMOND` 300/3000;
  - `NORMAL_HERO`: `HERO_CONTRACT_TICKET` 1/10 first, fallback `DIAMOND` 280/2800;
  - `BASIC_CONTRACT_PREVIEW`: `NORMAL_CONTRACT_TICKET` 1/10 first, fallback `BOUND_DIAMOND` 80/800.
- `SEALED_LIGHT_DARK` remains locked/display-only.
- Cocos did not need a new write path: summon buttons already follow backend gate fields and still call only `POST /api/player/gacha/draw`.
- Added backend SQL/guard:
  - `D:\project\LootChain\sql\35_gacha_rate_pity_open_normal_limited.sql`;
  - `D:\project\LootChain\scripts\check-gacha-economy-config.ps1`.
- Updated fresh-schema/display/i18n SQL: `07_gacha_module.sql`, `17_gacha_pool_display_config.sql`, and `23_game_text_i18n.sql`.
- Runtime closure:
  - pool list/detail/pity APIs returned the new open gates, rates, and pity values;
  - real draw endpoint calls for all three opened pools reached the deduction path and returned insufficient balance for the current user;
  - draw log/result counts stayed unchanged, so no accidental paid reward write occurred.
- Verification passed: backend economy guard, gacha service tests, Cocos `check:layout`, directed TypeScript no-emit, `check:preview`, `.spine/.spine.meta` scan `0`, and `git diff --check` in both repositories.
- Still closed: EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress writes, and any new economy write endpoint.

## 2026-06-10 Gacha Draw Guard And Display-Only Pool Closure

- Cocos now treats gacha drawability as fail-closed:
  - only `drawEnabled === true`, `previewOnly=false`, `locked=false`, and `status=1` can enable summon;
  - missing `drawEnabled` no longer opens a pool by accident.
- `SEALED_LIGHT_DARK` remains visible as a locked/display-only pool; Cocos now filters only explicit hidden rows (`displayType=HIDDEN` or `themeColor=hidden`).
- While a draw request is pending, leaving the gacha scene is blocked with `召唤请求处理中，请稍候。`; login/profile reset also clears stale gacha draw state.
- Lobby summon copy now reflects the current stage: backend pool state can open real draw, while exchange and reissue stay closed.
- Backend replay hardening:
  - `requestId` is capped at `128` characters;
  - same-`requestId` replay must match `poolCode`, `drawCount`, and `useTicket`, otherwise it returns `重复抽卡请求参数不一致`.
- Added low-balance draw smoke in `D:\project\LootChain\scripts\smoke-cocos-gacha-draw-guard.ps1`, proving failed real draw creates no draw/result/reward/currency/hero/pity writes and does not leave the request stuck in processing.
- Verification passed: Cocos `check:layout`, directed Cocos TypeScript no-emit, Cocos `check:preview`, backend economy guard, targeted Maven tests, and low-balance smoke.
- Preview note: if `http://127.0.0.1:7456` serves stale chunks again after later edits, refresh/reimport in Creator or reopen Preview, then rerun `npm.cmd run check:preview`.
- Still closed: EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress writes, and any new economy write endpoint.

## 2026-06-10 Normal Summon R/SR-Only And Box Summon Center

- `普通召唤` / `BASIC_CONTRACT_PREVIEW` is now R/SR-only:
  - active rates are `R=0.600000` and `SR=0.400000`;
  - active SSR/UR rates, reward items, and duplicate configs are disabled.
- The normal summon center presentation now uses `assets/resources/spine/gacha/box_summon/boxman_text`.
- The source `252.spine` file is archived under `docs/spine-source-archive/gacha/box_summon/252.spine`; runtime resources under `assets/resources/spine` keep only Cocos-importable JSON/atlas/PNG files.
- `GachaSceneRenderer` gives `box_summon` a small scale multiplier so its visible size is close to the limited and hero summon center Spine presentations.
- `概率保底` now uses backend rate/guarantee notes and filters fallback pity rows by active rate rarity, so normal summon does not show inactive SSR/UR pity.
- Browser Preview verification confirmed:
  - selecting `普通召唤` renders `box_summon`;
  - the probability panel shows R/SR-only copy and no SSR/UR pity rows;
  - `奖池内容` lists only `R_PATROL_01`, `R_ACOLY_02`, `SR_PRIEST_01`, and `SR_WITCH_03`.
- Verification passed: `check:layout`, directed Cocos TypeScript no-emit, `check:preview`, `.spine/.spine.meta` scan, backend economy guard, three-pool low-balance smoke, and targeted Maven suite with `35 tests, 0 failures`.
- No summon button was clicked during this visual verification; no recharge or successful paid draw was performed.
- Still closed: EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress writes, and any new economy write endpoint.

## 2026-06-17 Visual Battle Stage 9 Adaptive Performance

- Stage 9 adds viewport adaptation and low-performance degradation for the Cocos battle presentation.
- New helper: `assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts`.
- `390x340` uses `minimal`: timeline rail, battle log, Stage 8 side panel, recovery banner, assist auras, projectiles, floating text, and skill bar are disabled so the field and buttons do not overlap or overflow.
- `1280x720` uses `balanced`: standard HUD, timeline, log, projectiles, and floating text remain visible.
- `1920x1080` uses `cinematic`: full Stage 1-8 battle presentation remains visible, including Stage 8 settlement panel and recovery cue.
- `LobbyBattlePreviewPanelRenderer` now consumes `resolveBattleAdaptivePerformanceProfile()` and applies `motionScale`, `showTimelineRail`, `showBattleLog`, `showStage8Panel`, `showAssistAuras`, `showProjectiles`, `showFloatingText`, and `showSkillBar`.
- New guard: `npm.cmd run check:battle-stage9`.
- Boundary unchanged: no backend API, SQL, battle simulation authority, reward/stamina/progress write, bag write, hero growth write, offline settlement, re-settlement, or new economy write endpoint was opened.

## 2026-06-17 Visual Battle Stage 10 Full Chain Acceptance

- Stage 10 closes the Cocos visual battle V1 route: adventure -> formation -> battle -> settlement -> lobby readonly refresh.
- New guard: `npm.cmd run check:battle-stage10`.
- The guard runs Stage 1-9 guards plus layout, and checks the code hooks from `LobbyAdventurePanelRenderer` to `LobbyFormationPanelRenderer`, `LobbyBattleFlow`, `LobbyBattlePreviewPanelRenderer`, and `LootChainGameRoot.refreshLobbyReadonlyStateAfterBattle()`.
- New doc: `docs/battle/stage10-full-chain-acceptance.md`.

## 2026-06-17 Visual Battle Stage 11 Audio Runtime

- Stage 11 connects the Stage 2 battle BGM/SFX resources to the Cocos battle presentation runtime.
- New helper: `assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts`.
- `LobbyBattlePreviewPanelRenderer` now creates `LobbyBattleStage11AudioRuntime`, plays low-volume looping battle BGM, and triggers one-shot cues for battle start, action/assist events, hit feedback, and win/lose settlement receipts.
- New guard: `npm.cmd run check:battle-stage11`.
- New doc: `docs/battle/stage11-audio-runtime.md`.
- Boundary unchanged: no backend API, SQL, battle authority, reward/stamina/progress write, bag write, hero growth write, offline settlement, re-settlement, or new economy write endpoint was opened.
- This is a read-only acceptance pass: no start/settle click is performed during automated/browser verification.
- Boundary unchanged: no backend API, SQL, battle simulation authority, reward/stamina/progress write, bag write, hero growth write, offline settlement, re-settlement, or new economy write endpoint was opened.

## 2026-06-17 Visual Battle Stage 12 Battle Scene Redesign

- Stage 12 重做 Cocos 战斗场景表现，新增 `LobbyBattleStage12HeroCardDeck`、`LobbyBattleStage12EnemyPlaceholder`、`LobbyBattleStage12VictoryOverlay` 和 `LobbyBattleStage12RewardSlot`。
- 英雄战斗 Spine 对 `portrait_asset=act_*` 采用 act 骨骼优先，确保 R/SR 可播放 `run/skill0/skill1` 等战斗动作；`spine_asset/npc_*` 保留为非 act 资源或缺失 act 时的兜底。兼容 R/SR 旧 `skill*` 动画名和 SSR/UR 英文 `idle/atk/skill1/ult/hit` 动画名，并通过 `BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY` 限制角色缩放。
- 2026-06-21 SR/R 返修：战斗时间线第一个我方行动优先选择前排 R/SR `portrait_asset=act_*` 英雄，动作节奏改为先 `run` 接敌、再留出可见 `skill0` 普攻窗口、随后触发伤害飘字/受击；`screenshot:battle-center` 会强制 SR/R 阵容并验收 `run/skill0/skill1` cue。
- Stage 12 返修后，`BattleApi` 会保留 battle start 回执里的 `portraitAsset/spineAsset/spineUuid/scaleProfile`，主战场只渲染真实参战单位，不再把补位空格画成胶囊。
- 当前攻击、技能、受击和辅助 cue 会在单位头顶显示动作提示；无怪物骨骼时使用暗红怪物剪影占位，无主角骨骼时使用主角立绘兜底。
- 桌面/横屏战斗站位从旧等间距竖排改为 Stage 12 阵型偏移：前排靠近交战中心，后排退到侧后方，敌方镜像占位。
- 编队变更后会清掉本地旧 battle start 快照，下一次进入战斗预演必须按当前 `heroIds` 重新创建会话。
- 战斗音频运行时增加渲染代次和 `isBattleAudioSourceNodeValid()` 守卫，避免重绘后旧异步回调访问已销毁节点。
- 后端仅预留敌方/Boss 骨骼目录字段，不改变 battle start/settle 契约。
- 新增守卫：`npm.cmd run check:battle-stage12`。
- 新增文档：`docs/battle/stage12-battle-scene-redesign.md`。
- Verified on 2026-06-17: Cocos TypeScript no-emit, `check:battle-stage10`, `check:battle-stage12`, `check:layout`, `check:preview`, `.spine/.spine.meta` scan `0`, backend targeted Maven tests `50 tests, 0 failures`, local SQL 65 import, and both-repo `git diff --check` passed.
- Browser Preview accepted after refresh/login: selected `heroIds=[5,11,9,10]`, battle start request body matched the current formation, hero Spine rendered on the left, enemy placeholders remained on the right, and old debug/status panels were hidden.
- Boundary unchanged: no real battle settlement is triggered, no economy write entry is added, and reward/stamina/progress/power/drop/ranking/USDT/fund-pool/EX/bag/hero-growth writes remain closed.

## 2026-06-19 Battle Scene Takeover Fix

- 接手前序 AI 的战斗场景返修，重点修复旧 Preview chunk、挑战弹框入口、英雄详情空节点崩溃、旧 Stage 13 结果层残留、以及战斗页误导性的结算入口。
- 冒险关卡、紧凑挑战入口、详情挑战按钮现在都会先打开挑战弹框；弹框中的 `布阵` 进入编队，`挑战` 进入战斗预览。
- 从冒险挑战弹框直接点 `挑战` 时，会自动补齐默认 5 人阵容后再创建 battle session；从编队页进入战斗时仍保留玩家手动阵容选择。
- 当前视觉战斗只验收可视化播放闭环：允许创建 battle session，播放英雄 Spine/敌方占位/伤害漂浮/结果表现，演出完成后返回大厅。
- 当前 UI 不触发 `/api/player/battles/{battleNo}/settle`；后端 settle 契约仍保留给后续真实结算阶段，未经用户明确批准不要打开结算、奖励、体力或主线进度写入。
- 验收脚本已同步：`check:battle-stage8` 现在要求演出完成后的 `settle_idempotent.active=false`、标签为 `结算预留`，主动作返回大厅。
- `check:preview` 已增加 `fillLobbyFormationWithDefaultHeroes` / `fillDefaultFormationForDirectChallenge` token，避免 Cocos Preview 继续服务旧 chunk。

## 2026-06-19 Battle Scene Takeover Second Pass

- 布阵页改成战场式结构：左侧 `LobbyFormationBattlefieldScene` 显示出战英雄骨骼占位/名牌，右侧 `LobbyFormationHeroPicker` 显示可出战英雄列表。
- 布阵页左侧现在会优先加载出战英雄 Spine 作为 `LobbyFormationActorSpinePreview`，资源缺失或不兼容时才回退为占位剪影。
- 挑战弹框的我方阵容现在优先读取当前临时编队；奖励区改为 `奖励预览`，明确本轮不发放、不扣体力。
- 战斗页近战移动改为按攻击者/目标锚点推进到中场附近；目标区新增 `LobbyBattleActionTargetSpineEffectLayer`，可播放 `skill*_kz` 动画，缺失时显示本地法阵兜底。
- 演出完成后即显示视觉胜利覆盖层；无真实 settlement 时奖励文案为预览不发放。
- 视觉胜利现在也会播放一次 `resultWin` 音效，使用 `visualVictory` 本地 play key，不代表真实结算回执。
- 冒险详情旧的真实结算引导文案已改为视觉演出边界说明：本轮只播放战斗演出，不提交结算。
- 大厅 `战役` 热点、挑战卡和紧凑 `挑战` 入口现在进入同一主线关卡地图，不再停留在“副本占位”提示。
- 资源审计结论：英雄 Spine 路径齐全，但部分源资源不具备用户要求的严格动画名，当前运行时以兼容映射兜底；后续如要硬性验收严格命名，需要重导出或重命名资源。
- Browser Preview 已验收：大厅 -> 冒险 -> 挑战弹框 -> 布阵 -> 战斗 -> 视觉胜利；请求只有 `/api/player/battles/recent` 和 `/api/player/battles/start`，没有 `/settle`。
- 守卫已补：`check-layout`、`check-preview`、`check:battle-stage6`、`check:battle-stage12` 均覆盖本轮新 token。
- 边界不变：当前 UI 不触发 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-20 Battle Formation Spine Runtime Patch

- 布阵页英雄骨骼预览继续加固：`LobbyFormationActorSpinePreview` 现在优先按 `spineUuid` 加载，失败后再按 `spine/hero/{spineAsset}/{spineAsset}` 兜底，并在 Spine runtime 数据暂未就绪时按 `[180, 420, 900]ms` 重试。
- 失败时会输出 `[Formation]` 资源路径、uuid 和具体原因；只有重试耗尽后才回退 `LobbyFormationActorFallbackSilhouette`，避免资源存在但 Preview 偶发解析慢时永久显示占位。
- `check-layout` 新增 Cocos AssetDB 脏索引守卫：如果 `library/.assets-data.json` 仍索引 `db://assets/resources/spine/**/*.spine`，检查会失败并要求刷新 AssetDB。
- 本轮已清理本地旧 AssetDB/Preview targets 并重启 Cocos Preview；重建后 `.spine` 脏索引为 `0`，`check:preview` 已确认新 chunk 生效。
- 边界不变：当前战斗仍是视觉演出闭环，不触发 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-20 Battle Default Formation Closure Patch

- 修复挑战弹框/布阵/战斗开始三处阵容不一致：空阵容不再被 `normalizeLobbyFormationHeroIds([])` 误判成“主角 1 人阵容”，而是统一通过 `resolveDefaultFilledLobbyFormationHeroIds()` 补齐默认 top-5。
- 当前默认队伍会在弹框显示 `出战 5/5`，布阵页显示 `已确认 5/5`，`battle start` 发送同一组 `heroIds`。
- 本地浏览器验收结果：`heroIds=[5,11,9,10,63]`、`leaderHeroId=5`、0 次 `/settle`、0 console error；截图保存在 `artifacts/battle-takeover-20260620-r4-*`。
- 边界不变：当前战斗仍只做可视化演出，不开放真实结算、发奖、扣体力或主线进度写入。

## 2026-06-20 Battle Takeover Repair R6

- 战斗演出节奏从 4 步/约 3 秒调整为 24 步/约 12 秒，开场、接敌、命中、反击、支援、终结和视觉胜利都能被独立截图验收。
- 命中层不再用首个伤害事件常驻兜底，只在当前 `damage_float` / `hit_float` / 当前命中事件显示，避免开局就看到伤害数字。
- 战斗页英雄 Spine 改为有 `spineUuid` 时优先 UUID 加载，失败后再回退 resource path；成功应用后会移除敌我双方 fallback silhouette。
- `LobbyHeroDetailPanelRenderer`、`LobbyBattlePreviewPanelRenderer`、`UiSpriteFrameCache` 已补异步 `node.isValid` 防护，降低页面切换后旧回调触发空节点崩溃的风险。
- 新增 `check:battle-stage13d`、`check:battle-stage13g` 并纳入 `check:battle-stage13i`，守卫稀有度动画映射和战斗音频运行时真实接入。
- r6 浏览器验收：`POST /api/player/battles/start` 1 次，`/settle` 0 次，Cocos 错误遮罩 false，过滤截图 `ReadPixels` 性能警告后 console error 0；截图保存在 `artifacts/battle-takeover-20260620-r6-*`。
- 边界不变：当前战斗仍只做可视化演出，不开放真实结算、发奖、扣体力或主线进度写入。

## 2026-06-20 Battle Opening Convergence Patch

- 战斗开场新增前置汇合阶段：`LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 2`，双方在 `battle_start` 后先播放 `move/run` 向中场推进，汇合窗口结束后才开始读取行动时间线。
- 开场汇合期间 `currentActionCue/currentAssistCue` 被置空，`visibleDamagePreviewEvent/visibleBuffPreviewEvent` 回退到 `battle_start`，不会提前触发普攻、技能、命中层、伤害飘字、Buff 预览或辅助飘字。
- `resolveVisibleTimelineEvent()` 已把战斗时间线整体延后，前置阶段只显示 `battle_start`；第一个真实行动从汇合结束后的播放步开始。
- 新增 `check:battle-stage13j` 并纳入 `check:battle-stage13i`，守卫开场汇合常量、动作/辅助 cue 抑制、双方偏移、`move/run` 动画 cue 和 Preview freshness token。
- 边界不变：当前战斗仍只做可视化演出，不开放 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-25 Battle C1812 Reference Melee Fix

- 按参考视频 `C:\Users\axian\Desktop\C1812-1\video_2026-06-20_14-45-06.mp4` 返修战斗演出：近战初始跑入交锋区后持续围绕目标攻击，不再每次命中从出生点瞬移到目标再回原位。
- `LobbyBattlePreviewPanelRenderer.ts` 调整 root motion：当前 `damage_float` 命中帧拥有最高优先级，命中瞬间锁在目标前；跑动/接敌阶段仍走平滑移动。近战判断改用渲染单位 `unit.role`，避免前排 SR/R 因 cue 角色数据异常被当作后排而停在原位。
- 已撤销会把所有单位拉到同一点的目标当前位置追踪实验，保留 lane-based duel anchors；后排 SR/R 法系/辅助不再纳入近战 home-snap 验收。
- `scripts/repair-preview-stage14-real-combat.mjs` 和 `scripts/screenshot-battle-center-convergence.cjs` 已同步：旧 Preview chunk 会被修到当前命中帧优先级，截图验收继续检查近战接触、HP 扣减、死亡后不再受击、0 settle 请求。
- 已验收：
  - `npm.cmd run screenshot:battle-center`：SR/R 强制阵容通过，1 battle start、0 settle、0 page errors、0 console errors。
  - `$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center`：UR/SSR/SR 混合阵容通过，1 battle start、0 settle、0 page errors、0 console errors。
  - `npm.cmd run check:battle-stage14-real-combat`、`npm.cmd run check:battle-stage13i`、`npm.cmd run check:layout`、`npm.cmd run check:preview`、定向 TypeScript no-emit、`git diff --check` 均通过；`git diff --check` 仅有 LF/CRLF warning。
- 边界不变：仍只做战斗表现和既有 battle start，不开放 settle、发奖、扣体力、主线推进或任何经济写入口。

## 2026-06-20 Battle Opening Convergence Completion Guard Patch

- 战斗完成态不再走同场景增量刷新：`LootChainGameRoot` 和 `LobbyBattlePreviewPanelRenderer` 都会在 `presentationComplete / settling / settlement` 时强制完整重绘，避免视觉胜利阶段变黑屏。
- 开场汇合逻辑保持：前 2 个播放步双方先向中场推进，期间不触发行动 cue、辅助 cue、伤害飘字或 Buff 飘字；汇合后才进入真实行动时间线。
- 新增 `check:battle-stage13k`，并纳入 `check:battle-stage13i`，守卫根节点完成态门禁、渲染器完成态门禁、增量播放节点缓存、开场汇合抑制和战斗时间线延后。
- 本地浏览器验收：0.6s/1.3s 为 `开场汇合` 且无伤害，2.2s 后出现首次伤害，5.4s 出现治疗/护盾/受击反馈，13.9s 显示视觉胜利结果层且无黑屏；截图保存在 `artifacts/battle-stage13k-*`。
- 已通过：Cocos TypeScript no-emit、`check:battle-stage13k`、`check:battle-stage13i`、`check:layout`、浏览器新错误 0。
- 当前 `check:preview` 仍受运行中的 Creator Preview 旧 chunk 影响，在 7456/7457 都报告多模块 stale；需要重建/刷新 Preview 后再作为 freshness 绿灯依据。
- 边界不变：当前战斗仍只做可视化演出，不开放 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-20 Battle Opening Convergence Strict Gate Patch

- 战斗开场汇合改为严格门禁：`LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 4`，配合 48 步、250ms 的播放节奏，双方先用约 1 秒播放 `move/run` 向中场推进，之后才释放首个行动事件。
- 开场阶段只显示 `battle_start / 开场汇合`，不触发行动 cue、辅助 cue、伤害飘字、Buff 飘字或命中层；第一个真实行动从汇合窗口结束后开始。
- 战斗演员现在缓存“汇合后的战斗原位”，普攻/技能冲刺结束后返回该位置，不再退回原始左右列；视觉缩放脉冲移动到 `LobbyBattleActorVisualRoot`，避免被位置 tween 停掉。
- 时间线读取改为先过滤 combat event queue，避免渲染器按比例采样时从开场直接跳到后段伤害。
- 已补 `check:battle-stage13l` 并纳入 `check:battle-stage13i`；`check:preview` freshness tokens 也同步到新渲染 token。
- 本地预览截图保存在 `artifacts/battle-stage13l-action-frames/` 和 `artifacts/battle-stage13l-flow/`：3.0s 为开场汇合无伤害，3.5s 后出现首个受击/伤害，5.0s 出现治疗、护盾/加攻、受击和伤害分步反馈。
- 已通过：Cocos TypeScript no-emit、`check:battle-stage13l`、`check:battle-stage13k`、`check:battle-stage13i`、`check:layout`、`check:preview`、`.spine/.spine.meta` scan `0`、`git diff --check`。
- 边界不变：当前战斗仍只做可视化演出，不开放 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-20 Battle Opening Center Meet-Up R2

- 按最新验收要求，战斗开始后左侧英雄与右侧怪物/BOSS 必须先向中心区域移动，双方汇合后才允许进入第一轮攻击/技能。
- 开场门禁调整为 `LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 6` + `LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 1`：约 1.5 秒跑动到中场，再停顿 0.25 秒，之后才释放 `action_start/damage_preview/buff_preview/hit_react` 等战斗表现。
- 新增 `LOBBY_BATTLE_COMBAT_START_STEP` 作为统一战斗解锁点；渲染层在该点之前始终压制 action/assist cue、弹道、目标 Spine 特效、伤害飘字、治疗/护盾/Buff 飘字和受击反馈。
- 开场跑动和近战推进 cue 显式使用 `run`，不再在调用层传 `move`；动画解析层仍保留 `move/walk` 兼容兜底。
- 守卫同步：`check:battle-stage13j`、`check:battle-stage13k`、`check:battle-stage13l` 和 `check:preview` freshness token 均检查新的门禁和 `run` cue。
- 已验证：Cocos 定向 TypeScript no-emit、`check:battle-stage13j`、`check:battle-stage13k`、`check:battle-stage13l`、`check:battle-stage13i`、`check:layout`、`.spine/.spine.meta` scan `0`、`git diff --check` 通过且仅有 LF/CRLF warning。
- 当前 Preview 状态：`npm.cmd run check:preview` 仍失败于运行中的 Cocos Preview 旧 chunk；本机 7456/7457 分别由两个 Cocos Creator 项目进程监听，服务端 chunk 仍缺少 `LOBBY_BATTLE_COMBAT_START_STEP`、`opening-run` 和 `animationName: 'run'`。需要重启/刷新 Cocos Creator Preview 后再做运行时视觉验收。
- 边界不变：当前战斗仍只做可视化演出，不开放 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-20 Battle Opening Center Meet-Up R3

- 开场汇合继续作为硬门禁：双方未完成中场汇合前，不释放 action/assist cue、弹道、目标特效、伤害飘字、治疗/护盾/Buff 飘字或受击反馈。
- `BattleOpeningConvergenceState` 已拆分为 `active` 与 `moving`：`active` 用于禁止战斗表现，`moving` 才播放 `run`；双方到达中场后的 0.25 秒停顿会切回 `idle`，不再原地跑。
- Spine 动画解析补 `idle/stand`，并让 `run/move/walk` 在移动期间循环播放。
- 新增 `check:battle-stage13n` 并纳入 `check:battle-stage13i`；`check:battle-stage13j` 与 `check:preview` 已同步新 token。
- 新增 Preview temp 修复脚本：`repair:preview-cc` 修 Cocos 内部 cc chunk 依赖错配，`repair:preview-battle` 修 Creator 未刷新时的战斗 renderer 旧 chunk。
- 已验证：Cocos 定向 TypeScript no-emit、`check:battle-stage13j`、`check:battle-stage13m`、`check:battle-stage13n`、`check:battle-stage13i`、`check:layout`、`check:preview`、`scripts/screenshot-stage13.mjs`、`.spine/.spine.meta` scan `0`；Headless 预览截图无白屏，console errors `0`。
- 边界不变：本轮未点击挑战/开始战斗/结算；当前战斗仍不开放 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包或英雄写入口。

## 2026-06-20 Battle Opening Center Meet-Up R4

- 按最新要求继续收紧开场汇合：`resolveOpeningConvergenceOffset()` 不再使用旧的 `58%` 浅推进，改为 `BATTLE_OPENING_CENTER_CONVERGENCE_RATIO = 0.82`，并用 `BATTLE_OPENING_CENTER_STOP_GAP_RATIO = 0.18` 防止穿过中心线。
- 开场跑动后，典型桌面/紧凑站位都会停在中场交战区；后续攻击/技能的 home 仍是汇合后的中场位置，不回退到初始左右列。
- `check:battle-stage13n` 已增加中心停点计算守卫，要求旧 `0.58 / 1.72` 公式消失，并断言典型敌我站位最终落在中场范围。
- `check:preview` freshness token 已同步新中心汇合常量；`repair:preview-battle` 已支持只修补本轮中心公式，避免 Creator 继续服务旧战斗 chunk。
- 新增 `npm.cmd run screenshot:battle-center`，自动走登录 -> 大厅 -> 主线地图 -> 挑战弹框 -> 战斗截图；本轮输出 `artifacts/battle-center-convergence-current/`。
- Browser Preview 验收：`05-battle-0300ms.png` 双方仍在两侧起步；`06-opening-run-1000ms.png` 双方已推进到中场且无伤害飘字；`07/08/09` 才出现治疗、护盾、伤害和受击反馈。网络记录为 `/api/player/battles/start` 1 次、`/settle` 0 次，页面错误 0、console error 0。
- 已验证：`check:battle-stage13i`、`check:layout`、`check:preview`、Cocos TypeScript no-emit、`.spine/.spine.meta` scan `0`、`git diff --check` 通过；`git diff --check` 仅有既有 LF/CRLF warning。
- 边界不变：当前视觉战斗只允许既有 `POST /api/player/battles/start`；不点击或开放 `/api/player/battles/{battleNo}/settle`，不新增奖励、体力、进度、货币、背包、英雄成长或其它经济写入口。

## 2026-06-24 Battle Replay Full HP Loop R18

- 战斗回放改为本地完整视觉循环：`LobbyBattleReplayModel.ts` 不再只按旧 `action_start` 数量播放，而是合成行动直到一方死亡；首轮保证所选英雄参与，敌方每两次我方行动后穿插反击。
- HP 表现闭环：命中事件携带 `hpBefore/hpAfter/timeMs`，单位血条和敌方总血条按命中帧下降，敌方全灭后才进入视觉胜利。
- 近战接触修正：近战命中延后到接触点，战线前推距离调整为 `BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 240`，避免英雄站在原地或隔空攻击。
- 新增 Preview 缓存修复脚本：`repair:preview-battle-replay-loop` 和 `repair:preview-battle-contact-spacing`；`check:preview` 会拦截旧 `actionStarts` chunk 和旧接触距离。
- 浏览器验收：`npm.cmd run screenshot:battle-center` 通过，`/api/player/battles/start` 1 次、`/settle` 0 次、页面错误 0、console error 0；遥测为 `allMeleeBasicAttackMissCount=0`、`enemyHpRatioMin=0`、`allyHpRatioMin=0.0649`、`damageFloatSampleCount=7`、`deadUnitHitSampleCount=0`。
- 边界不变：仍只开放战斗演出和既有 battle start，不开放结算、发奖、扣体力、主线推进或其它经济写入口。

## 2026-06-25 Battle Real Combat Replay Stage14

- 战斗回放升级为真实属性数值模型：按单位 `power / level / rarity / role / side` 和关卡阶段推导 `maxHp / attack / defense / evasionRate / damageReduction / critRate / critDamage`，敌方额外叠加 `monsterDurabilityMultiplier`，避免低血怪一击清场。
- 命中事件现在带 `hitKey / hpBefore / hpAfter / evaded / critical / killed`；HP 条只按命中事件变化，死亡目标不再参与后续选敌。
- 表现层同步：`damage_float` 携带 `hitKey/eventSeq`，受击 cue 延后 320ms，保证伤害飘字、Slash VFX、Hit Stop、暴击震屏和 HP 扣减在命中帧同窗出现。
- 近战接触继续作为硬验收：禁用 sticky 旧接触缓存，改用近距离 lane gap；允许行动者冲刺路径的瞬时穿越，但禁止非行动站位堆叠、打空气、死亡后继续受击。
- 新增验证脚本：
  - `npm.cmd run check:battle-stage14-real-combat`
  - `npm.cmd run repair:preview-stage14-real-combat`
  - `npm.cmd run screenshot:battle-center`
- 已验收：
  - SR/R 阵容截图与 telemetry：`artifacts/battle-center-convergence-srr-stage14/`
  - mixed 阵容截图与 telemetry：`artifacts/battle-center-convergence-mixed-stage14/`
  - 两组均为 1 次 battle start、0 次 settle、0 page errors、0 console errors。
- 已通过：战斗模块定向 TypeScript no-emit、`check:battle-stage13i`、`check:preview`、`git diff --check`（仅 LF/CRLF warning）。
- 边界不变：仍只开放战斗演出和既有 battle start，不开放结算、发奖、扣体力、主线推进或其它经济写入口。

## 2026-06-25 Battle Sustained Clash Retune R19

- 根据用户录屏 `C:\Users\axian\Videos\Captures\Cocos Creator - lootchain-cocos - Google Chrome 2026-06-25 10-34-44.mp4` 继续返修：旧表现仍偏回合制，前线离中线过远，并且 stale Preview repair 可能把旧目标锚点跳点逻辑写回。
- 战斗前排改为持续交锋线模型：`BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 240`、`BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 132`，单位开场先靠近中线，之后围绕交锋线短前冲，不再按目标原始锚点大跳。
- 近战动作改用 `resolveActorClashLungeOffset()`：`melee_move/basic_attack/damage_float` 分别使用 `108/88/82` 的前冲保持距离，替代旧 `effectiveAdvanceRatio` 和 `duelFrame.actorDuelPosition` 位移。
- 战斗播放期隐藏单位姓名牌，保留 HP 条、伤害飘字、命中特效和底部技能框，降低画面遮挡和报表感。
- `repair:preview-stage14-real-combat` 已同步 stale chunk 变量声明、常量、姓名牌规则和旧分支清理；`check:preview`、`check:battle-stage13k`、`check:battle-stage13z2`、`check:battle-stage14-real-combat` 已同步新守卫。
- 已验收：SR/R 强制阵容与 mixed UR/SSR/SR 阵容均通过 `npm.cmd run screenshot:battle-center`，两组都是 1 次 `battle start`、0 次 `settle`、0 page errors、0 console errors。
- 边界不变：仍只开放战斗演出和既有 battle start，不开放结算、发奖、扣体力、主线推进或其它经济写入口。

## 2026-06-25 Battle Continuous Clash Retune R20

- 继续针对 `C:\Users\axian\Videos\Captures\Cocos Creator - lootchain-cocos - Google Chrome 2026-06-25 10-34-44.mp4` 修正“看起来像回合制”的问题：战斗 HUD 去掉回合文案，改成 `交战中 / 双方接战 / 阵线推进`。
- 前线接战改为更近的持续交锋线：`BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 300`、`BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 112`，前排单位开场后持续压在中线附近。
- 近战 root motion 改为“命中后回当前交锋位”，不回出生侧原位；新增 `resolveBattleActorClashIdleOffset()` 做小幅交锋微动，避免画面重新读成左右静态列。
- 自动验收补强：`screenshot:battle-center` 新增 `finalFrontLineGapMedian` 和 `postDamageFrontHoldMissCount`，会拦截前线过远、过近或命中后退回原位的回归。
- 已验收：
  - SR/R 强制阵容：`npm.cmd run screenshot:battle-center` 通过，1 次 `battle start`、0 次 `settle`、0 page errors、0 console errors，`finalFrontLineGapMedian=302.43`、`postDamageFrontHoldMissCount=0`、`enemyLastHpRatioMax=0`。
  - mixed UR/SSR/SR 阵容：`$env:BATTLE_ACCEPTANCE_FORMATION='mixed'; npm.cmd run screenshot:battle-center` 通过，1 次 `battle start`、0 次 `settle`、0 page errors、0 console errors，`finalFrontLineGapMedian=308.54`、`postDamageFrontHoldMissCount=0`、`enemyLastHpRatioMax=0`。
  - `check:battle-stage14-real-combat`、`check:battle-stage13z2`、`check:battle-stage13i`、`check:layout`、`check:preview`、Cocos 定向 TypeScript no-emit、`.spine/.spine.meta` scan `0`、`git diff --check` 均通过；`git diff --check` 仅有 LF/CRLF warning。
- 边界不变：仍只开放战斗演出和既有 `POST /api/player/battles/start`，不开放 `/api/player/battles/{battleNo}/settle`、发奖、扣体力、主线推进或其它经济写入口。
