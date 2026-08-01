# LootChain 玩家端接口契约

后端统一返回：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

客户端必须先判断 `code === 0`，再读取 `data`。

## 阶段开放范围

当前 Cocos 客户端只开放登录请求、主角色初始化请求、只读大厅资料/公告/图鉴/英雄/冒险请求、真实召唤 draw、年度主线 `MAIN_1_1` 至 `MAIN_25_16` 一次性首通结算和英雄 level-up：

- `POST /api/player/auth/dev-login`
- `GET /api/player/protagonist/state`，只用于判断当前玩家是否已经创建主角色。
- `POST /api/player/protagonist`，只用于账号初始化创建主角色。客户端只传 `gender` 和 `protagonistName`；SSR 主角模板、属性、战力、`user_hero` 实例、唯一性和幂等都由后端控制。
- `GET /api/player/me/lobby`，只用于大厅玩家信息和资料弹窗只读展示，不写入任何经济或玩法状态。
- `GET /api/player/lobby/notices`，只用于大厅公告/活动面板只读展示，读取已发布且处于有效期内的公告配置，不领取奖励、不改变玩家状态、不写入经济数据。
- `GET /api/player/lobby/codex`，只用于大厅英雄图鉴面板只读展示，后端会过滤 EX/锁定内容，前端不提供升星、觉醒、精炼、获取、领奖或任何经济写入口。
- `GET /api/player/lobby/heroes`，只用于大厅英雄队列列表展示，后端会把 `source_type=PROTAGONIST` 主角置顶并过滤 EX；列表本身不写入。
- `GET /api/player/lobby/heroes/filter-options`，只用于大厅英雄队列职业筛选项，优先读取 `sys_param_config.param_key='hero.class.options'` 的职业配置，不写库、不改变英雄或经济状态。
- `GET /api/player/lobby/team`，读取玩家已保存的出战阵容（`user_team`），返回 `heroIds` 有序列表与 `leaderHeroId`；未编队或英雄失效时返回空列表，由客户端回落默认阵容。只读，不发奖励、不改经济。
- `POST /api/player/lobby/team/save`，保存出战阵容。客户端只提交 `heroIds`（最多 5、去重）与可选 `leaderHeroId`；后端按战斗 start 同口径校验英雄归属与可用（拥有 + `status=1`），队长须在阵容内。只写 `user_team` 玩法配置，不涉及奖励、掉落、体力、进度、货币、背包或英雄属性。
- `GET /api/player/lobby/adventure`，用于大厅冒险主线展示与年度推荐状态读取。当前可根据服务端主线进度推荐 `MAIN_1_1` 至 `MAIN_25_16`；接口本身不写入。
- `POST /api/player/battles/start`，用于创建主线战斗会话。当前只有年度主线范围 `MAIN_1_1` 至 `MAIN_25_16` 允许按公式进入真实首通结算；越界如 `MAIN_25_17`、`MAIN_26_1` 必须被拒绝。
- `POST /api/player/battles/{battleNo}/settle`，用于提交战斗结果。客户端只提交 `requestId/result/durationSeconds/roundCount/clientChecksum`，不得提交奖励、掉落、体力、进度、货币、背包或英雄字段。
- `GET /api/player/battles/recent`，用于大厅/冒险读取最近战斗回执，只允许返回 `NO_REWARD` 或年度主线 `REAL_MAINLINE_R1` 至 `REAL_MAINLINE_R393`。
- `POST /api/player/heroes/{heroId}/level-up`，用于英雄详情页升级。客户端只传路径 `heroId`，消耗、校验和属性变化由后端控制；成功返回 `HeroOperationResultVO(heroId/level/star/awakenStatus/power)`；`star-up/awaken/refine` 仍关闭。

本文件后续列出的抽卡、英雄、背包接口只是后端已存在的玩家侧契约，不代表当前 UI 可以开放。当前 Cocos 流程在 dev-login 成功后先检查/创建主角色，再进入资源加载进度页，并在大厅资源准备完成后展示大厅背景、玩家信息、真实召唤入口、年度主线首通战斗入口和英雄详情升级入口。

### 2026-06-17 Visual Battle Stage 1 契约

- 本阶段只冻结可视化自动战斗 V1 的规格和资源候选，不新增玩家接口、不新增经济写入端点。
- 战斗仍只调用 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle`。
- Cocos 后续可基于 `battle start` 的 `battleNo/stageCode/serverSeed/lineup/enemyPreview/guardrails` 生成本地表现时间轴。
- 本地表现时间轴只允许驱动移动、攻击、技能、伤害飘字、治疗、Buff、死亡和胜负演出，不得提交为奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力依据。
- `lineup` 缺少 `heroClass/spineAsset/skill` 时，Cocos 只能从已加载英雄展示数据中按 `heroId` 合并，不能要求新增经济写接口。
- 外部 UI 素材路径 `C:\Users\axian\Desktop\C1812-1` 与音效路径 `C:\Users\axian\Desktop\C1812音效` 当前只作为候选库记录，未导入、未接入运行时。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage1`。

### 2026-06-17 Visual Battle Stage 2 资源契约

- 本阶段只导入表现资源，不新增玩家接口、不新增经济写入端点。
- Cocos 新增 `assets/resources/ui/battle/c1812` 下的 Boss 血条、技能目标框、Buff 图标和受击/地面冲击装饰候选。
- Cocos 新增 `assets/resources/audio/battle` 下的 BGM、普攻、受击候选、技能、治疗、Buff、结算和开战提示音频。
- 这些资源当前没有接入 battle start/settle 请求，也不会改变战斗结果、奖励、体力、进度、货币、背包、英雄属性或战力。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage2`。

### 2026-06-17 Visual Battle Stage 3 场景骨架契约

- 本阶段只新增 Cocos 表现快照和静态战斗场景骨架，不新增玩家接口、不新增经济写入端点。
- Cocos 将 `battle start` 的 `lineup/enemyPreview/serverSeed/battleNo/guardrails` 与只读英雄队列合并为 `BattlePresentationSnapshot`。
- 表现快照只供 Cocos 渲染左右阵营、前后排/首领定位、Boss 血条、目标框、命中装饰、Buff 图标和后续本地时间轴使用。
- `stage2AudioCues` 只记录后续音频播放路径，本阶段不自动播放 BGM/SFX，也不把音频事件提交给后端。
- 战斗写入仍只允许 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle`；客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力字段。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage3`。

### 2026-06-17 Visual Battle Stage 4 Spine 站位层契约

- 本阶段只新增 Cocos Spine 单位站位层，不新增玩家接口、不新增经济写入端点。
- 本阶段“不新增”指 Stage 4 增量；当前已批准的年度主线真实首通、召唤真实 draw 和英雄 `level-up` 仍按各自阶段契约生效，Stage 4 不回滚也不扩大它们。
- Cocos 只从已加载的只读英雄队列读取 `spineAsset/spineUuid`，并在战斗 actor 内渲染 `LobbyBattleActorSpineNode`。
- 无 Spine、加载失败或运行时解析失败时必须回退到 `LobbyBattleActorSpineFallbackSilhouette`；敌方当前没有专属 Spine 配置，继续使用 `LobbyBattleEnemyStandin`。
- Stage 4 只播放基础待机动画，`hit/move/attack_01/skill_01/death/victory` 仅作为后续表现阶段的动画名识别兜底。
- 战斗写入仍只允许 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle`；客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗或 Buff 字段。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage4`。

### 2026-06-17 Visual Battle Stage 5 确定性表现时间线契约

- 本阶段只新增 Cocos 本地表现时间线，不新增玩家接口、不新增经济写入端点。
- Cocos 基于 `serverSeed + battleNo + unitSnapshot` 生成本地确定性事件序列；同一输入必须得到同一 `timelineKey`、事件顺序、`damage_preview` 和 `buff_preview`。
- 时间线只驱动画面事件轨、命中飘字、受击提示、Buff 预览和后续动画调度，不作为结算权威。
- 战斗写入仍只允许 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle`；客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗或 Buff 字段。
- 本阶段不自动播放 Stage 2 音频，不生成服务端战报，不改变 `durationSeconds/roundCount/clientChecksum` 结算请求语义。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage5`。

### 2026-06-17 Visual Battle Stage 6 动作与飘字契约

- 本阶段只新增 Cocos 本地动作与飘字表现调度，不新增玩家接口、不新增经济写入端点。
- Cocos 将 Stage 5 的 `action_start/damage_preview/hit_react` 转换为 `melee_move/basic_attack/ranged_projectile/damage_float/hit_float`。
- 近战短推进、远程弹道、伤害飘字和受击飘字全部只在 Cocos 本地渲染，不提交伤害到服务端。
- 战斗写入仍只允许 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle`；客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗或 Buff 字段。
- 本阶段不自动播放 Stage 2 音频，不生成服务端战报，不改变 `durationSeconds/roundCount/clientChecksum` 结算请求语义。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage6`。

### 2026-06-17 Visual Battle Stage 7 技能与辅助契约

- 本阶段只新增 Cocos 本地技能与辅助表现调度，不新增玩家接口、不新增经济写入端点。
- Cocos 将 Stage 5 的 `buff_preview` 转换为 `skill_cast/heal_float/shield_float/buff_float/debuff_float`。
- 施法光环、治疗飘字、护盾飘字、Buff 飘字和 Debuff 飘字全部只在 Cocos 本地渲染，不提交治疗或护盾到服务端。
- 战斗写入仍只允许 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle`；客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff 或 Debuff 字段。
- 本阶段不自动播放 Stage 2 音频，不生成服务端战报，不改变 `durationSeconds/roundCount/clientChecksum` 结算请求语义。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage7`。

### 2026-06-17 Visual Battle Stage 8 结算与异常契约

- 本阶段只新增 Cocos 本地结算链路表现和异常恢复提示，不新增玩家接口、不新增经济写入端点。
- Cocos 将现有战斗面板状态翻译为 `start_idempotent/session_ready/playback_complete/settle_idempotent/receipt_recorded/error_recoverable`。
- `start/settle` 幂等、断线、返回重进、失败兜底只作为 UI 提示；真实结果仍以后端回执结算。
- 战斗写入仍只允许 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle`；客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff、Debuff 或任何结算明细字段。
- 本阶段不生成服务端战报，不新增重结算、补发或离线结算，不改变 `durationSeconds/roundCount/clientChecksum` 结算请求语义。
- 可复跑 Cocos 守卫：`npm.cmd run check:battle-stage8`。

### 2026-06-17 Stage 7 成长闭环契约

- 本阶段不新增玩家接口、不新增经济写入端点；只补齐年度主线下的冒险、编队、英雄升级和战斗 start/settle 串联体验。
- 编队仍是客户端本地一次性选择，不持久化；战斗 start 请求只允许提交 `stageCode/heroIds/leaderHeroId/requestId`，不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力字段。（2026-07-08 更新：编队本地不持久化的边界已解除，改为服务端持久化，详见下方「2026-07-08 队伍阵容持久化契约」；战斗 start 提交字段口径不变。）
- 战力校验由后端 start 阶段使用 `user_hero.power` 完成；Cocos 只展示后端回读战力和推荐战力，不本地推导属性战力。
- `POST /api/player/heroes/{heroId}/level-up` 成功后必须返回 `HeroOperationResultVO`，Cocos 以该回执显示等级/战力变化，并重新读取 `GET /api/player/me/lobby`、`GET /api/player/lobby/heroes`、`GET /api/player/bag`、`GET /api/player/lobby/adventure`。
- 早期推荐战力通过 `D:\project\LootChain\sql\64_stage7_growth_loop_power_tuning.sql` 调整：R1-R15 为 `7500/9300/10300/11000/11500/12600/12800/13700/13900/15000/16000/17500/19000/20500/22000`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage7-growth-loop.ps1 -BaseUrl http://127.0.0.1:8081`；覆盖 R1/R2 首通、R3 升级前战力不足、英雄 1->2、回读刷新、R3 start/settle 和 `star-up/awaken/refine` 阻断。

### 2026-06-17 Stage 6S 年度主线契约

- 本阶段不新增玩家接口、不新增经济写入端点；只把既有 battle start/settle 契约扩展为年度公式范围。
- 年度范围：第 1 章 `MAIN_1_1..MAIN_1_9`，第 2-25 章每章 `MAIN_X_1..MAIN_X_16`，共 `393` 关；`R16=MAIN_2_7`，`R393=MAIN_25_16`。
- 结算模式：`REAL_MAINLINE_R1..REAL_MAINLINE_R393`。服务端必须校验 `stageCode` 与 `settlementMode` 对应关系，`MAIN_25_17/REAL_MAINLINE_R394` 等越界组合必须被拒绝。
- 首通规则：每关仅首次 `WIN` 真实结算；重复挑战返回 `NO_REWARD`，不扣体力、不发奖励、不推进主线。
- 年度推进：不限制每日真实主线首通次数，也不以体力或等级卡节奏；start 阶段必须校验前置进度和出战阵容战力，满足即可连续挑战。
- 安全奖励集合仅允许 `PLAYER_EXP/PLAYER_EXP`、`CURRENCY/GOLD`、`ITEM/LOW_ENHANCE_STONE`、`ITEM/HERO_EXP_BOOK`；禁止 `DIAMOND/BOUND_DIAMOND/STAMINA/USDT/HERO/HERO_FRAGMENT/EX_*`。
- 长期材料堆叠：`item_template.HERO_EXP_BOOK.max_stack` 与 `LOW_ENHANCE_STONE.max_stack` 必须覆盖全年累计投放；当前守卫要求 `999999 >= HERO_EXP_BOOK 1101` 且 `999999 >= LOW_ENHANCE_STONE 8076`。
- 可复跑守卫：`D:\project\LootChain\scripts\check-battle-mainline-year-config.ps1`。
- 可复跑全链路 smoke：`D:\project\LootChain\scripts\smoke-mainline-year-full-chain.ps1 -BaseUrl http://127.0.0.1:8081`，已用 `0` 体力账号 `userId=50 / heroId=58` 验证 R1-R393 连续推进、最终 `Lv.60 / exp=91450 / stamina=0`、最终重复 `NO_REWARD`、`MAIN_25_17` 拦截。

### 2026-06-17 Stage 6R MAIN_2_6 / R15 首通契约

- 本阶段不新增玩家接口、不新增经济写入端点；只把既有战斗结算白名单推进到 `MAIN_2_6 / REAL_MAINLINE_R15`。
- `MAIN_2_6` 首次 `WIN`：后端权威扣体力 `6`，发放 `PLAYER_EXP 750`、`GOLD 1400`、`LOW_ENHANCE_STONE x6`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_7`。
- `MAIN_2_7` 必须是只读预热：`unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=0`、`expToRequiredLevel=0`；rewardPreview 必须表达 `预览/不发放`。
- Cocos 本地入口白名单只允许 `MAIN_1_1` 至 `MAIN_2_6` 打开编队/战斗；`MAIN_2_7` 即使被误标 `unlocked=true`，也只能预览。
- DB 守卫：`battle_stage_config.stage_code='MAIN_2_6'` 必须为 `PHASE6_REAL_BATTLE_R15` 且四个经济写开关开启，`ranking/fund/usdt/ex` 关闭；`MAIN_2_7` 必须为 `PHASE5_READONLY`、全部经济写开关关闭、活跃奖励规则为 `0`。
- R16 缺席守卫：活跃 `battle_reward_rule` 与 `battle_stage_config` 中不得出现 `REAL_MAINLINE_R16`、`PHASE6_REAL_BATTLE_R16` 或 `R16_*`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6r-main26-first-clear.ps1 -BaseUrl http://127.0.0.1:8081`；强制 start 可用 `D:\project\LootChain\scripts\smoke-battle-stage-guard.ps1 -BaseUrl http://127.0.0.1:8081 -UserId <stage6rUserId> -InvalidStages MAIN_2_7`。

### 2026-06-17 Stage 6Q MAIN_2_5 / R14 首通契约

- 本阶段不新增玩家接口、不新增经济写入端点；只把既有战斗结算白名单推进到 `MAIN_2_5 / REAL_MAINLINE_R14`。
- `MAIN_2_5` 首次 `WIN`：后端权威扣体力 `6`，发放 `PLAYER_EXP 700`、`GOLD 1300`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_6`。
- `MAIN_2_6` 必须是只读预热：`unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=0`、`expToRequiredLevel=0`；rewardPreview 必须表达 `预览/不发放`。
- Cocos 本地入口白名单只允许 `MAIN_1_1` 至 `MAIN_2_5` 打开编队/战斗；`MAIN_2_6` 即使被误标 `unlocked=true`，也只能预览。
- DB 守卫：`battle_stage_config.stage_code='MAIN_2_5'` 必须为 `PHASE6_REAL_BATTLE_R14` 且四个经济写开关开启，`ranking/fund/usdt/ex` 关闭；`MAIN_2_6` 必须为 `PHASE5_READONLY`、全部经济写开关关闭、活跃奖励规则为 `0`。
- R15 缺席守卫：活跃 `battle_reward_rule` 与 `battle_stage_config` 中不得出现 `REAL_MAINLINE_R15`、`PHASE6_REAL_BATTLE_R15` 或 `R15_*`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6q-main25-first-clear.ps1 -BaseUrl http://127.0.0.1:8081`；强制 start 可用 `D:\project\LootChain\scripts\smoke-battle-stage-guard.ps1 -BaseUrl http://127.0.0.1:8081 -UserId <stage6qUserId> -InvalidStages MAIN_2_6`。

### 2026-06-17 Stage 6P MAIN_2_4 / R13 首通契约

- 本阶段不新增玩家接口、不新增经济写入端点；只把既有战斗结算白名单推进到 `MAIN_2_4 / REAL_MAINLINE_R13`。
- `MAIN_2_4` 首次 `WIN`：后端权威扣体力 `6`，发放 `PLAYER_EXP 650`、`GOLD 1200`、`LOW_ENHANCE_STONE x5`、`HERO_EXP_BOOK x1`，推进 `MAIN_2_5`。
- `MAIN_2_5` 必须是只读预热：`unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=0`、`expToRequiredLevel=0`；rewardPreview 必须表达 `预览/不发放`。
- Cocos 本地入口白名单只允许 `MAIN_1_1` 至 `MAIN_2_4` 打开编队/战斗；`MAIN_2_5` 即使被误标 `unlocked=true`，也只能预览。
- DB 守卫：`battle_stage_config.stage_code='MAIN_2_4'` 必须为 `PHASE6_REAL_BATTLE_R13` 且四个经济写开关开启，`ranking/fund/usdt/ex` 关闭；`MAIN_2_5` 必须为 `PHASE5_READONLY`、全部经济写开关关闭、活跃奖励规则为 `0`。
- R14 缺席守卫：活跃 `battle_reward_rule` 与 `battle_stage_config` 中不得出现 `REAL_MAINLINE_R14`、`PHASE6_REAL_BATTLE_R14` 或 `R14_*`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6p-main24-first-clear.ps1 -BaseUrl http://127.0.0.1:8081`；强制 start 可用 `D:\project\LootChain\scripts\smoke-battle-stage-guard.ps1 -BaseUrl http://127.0.0.1:8081 -UserId <stage6pUserId> -InvalidStages MAIN_2_5`。

### 2026-06-17 Stage 6O MAIN_2_4 只读预热契约

- 本阶段不新增玩家接口、不新增经济写入端点，不开放 `R13 / REAL_MAINLINE_R13`。
- `MAIN_2_4` 仍可由 `GET /api/player/lobby/adventure` 作为 R12 后推荐返回，但必须是只读预热：`unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=0`、`expToRequiredLevel=0`。
- `MAIN_2_4.rewardPreview` 每一项必须表达 `预览/不发放`；引导文案必须表达不创建战斗、不扣体力、不发奖励、不推进 `MAIN_2_5`。
- Cocos 本地入口白名单只允许 `MAIN_1_1` 至 `MAIN_2_3` 打开编队/战斗；`MAIN_2_4` 即使被误标 `unlocked=true`，也只能预览。
- DB 守卫：`battle_stage_config.stage_code='MAIN_2_4'` 必须为 `PHASE5_READONLY`、`readonly_reason LIKE '6O%'`、`display_only=1`、`preview_only=1`，且 `grant/settlement/stamina/progress/ranking/fund/usdt/ex` 全部为 `0`；`battle_drop_preview_config.owner_code='MAIN_2_4'` 仅允许 no-grant 展示行；`battle_reward_rule.owner_code='MAIN_2_4'` 活跃数量必须为 `0`。
- R13 缺席守卫：活跃 `battle_reward_rule` 与 `battle_stage_config` 中不得出现 `REAL_MAINLINE_R13`、`PHASE6_REAL_BATTLE_R13` 或 `R13_*`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6n-main23-first-clear.ps1 -BaseUrl http://127.0.0.1:8081`，当前已扩展覆盖 Stage 6O；强制 start 可用 `D:\project\LootChain\scripts\smoke-battle-stage-guard.ps1 -BaseUrl http://127.0.0.1:8081 -UserId 42 -InvalidStages MAIN_2_4`。

### 2026-06-17 Stage 6N MAIN_2_3 / R12 契约

- 本阶段不新增玩家接口、不新增经济写入端点；只把 `MAIN_2_3` 纳入既有 battle start/settle 白名单。
- 新增真实首通结算范围：`MAIN_2_3`，结算模式为 `REAL_MAINLINE_R12`。
- 开放条件：`stageCode=MAIN_2_3`、`result=WIN`、玩家已完成 `MAIN_2_2`、玩家等级达到 Lv.11 且尚未首通 `MAIN_2_3`。
- 固定消耗：扣体力 `6`。
- 固定奖励：`PLAYER_EXP 600`、`GOLD 1100`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`；不得发放 `DIAMOND/STAMINA/USDT/HERO/HERO_FRAGMENT/EX_*`。
- 主线推进：`MAIN_2_3 -> MAIN_2_4`。推进只代表后续推荐展示，不代表 `MAIN_2_4` 开放真实结算。
- 完成 R1-R12 后累计经验为 `3850`，后端应按 `user_level_config.need_exp` 自动回写 `game_user.player_level=12`。
- `MAIN_2_4` 必须保持 `unlocked=false`、`display-only/preview-only`，强行 start 不得创建有效真实战斗会话；重复 `MAIN_2_3` settle 必须返回 `NO_REWARD`、不扣体力、不发奖励、不推进。
- 后端配置守卫：`battle_stage_config.stage_code='MAIN_2_3'` 必须为 `PHASE6_REAL_BATTLE_R12` 且四个经济写开关开启；`MAIN_2_4` 必须为 `PHASE5_READONLY` 且全部经济写开关关闭、活跃奖励规则为 `0`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6n-main23-first-clear.ps1 -BaseUrl http://127.0.0.1:8081`，覆盖 R1-R12、`MAIN_2_4` 阶段保护、重复 `MAIN_2_3=NO_REWARD` 和资源不变。

### 2026-06-15 Stage 6M MAIN_2_2 / R11 契约

- 本阶段不新增玩家接口、不新增经济写入端点；只把 `MAIN_2_2` 纳入既有 battle start/settle 白名单。
- 新增真实首通结算范围：`MAIN_2_2`，结算模式为 `REAL_MAINLINE_R11`。
- 开放条件：`stageCode=MAIN_2_2`、`result=WIN`、玩家已完成 `MAIN_2_1`、玩家等级达到 Lv.10 且尚未首通 `MAIN_2_2`。
- 固定消耗：扣体力 `6`。
- 固定奖励：`PLAYER_EXP 550`、`GOLD 1000`、`LOW_ENHANCE_STONE x4`、`HERO_EXP_BOOK x1`；不得发放 `DIAMOND/STAMINA/USDT/HERO/HERO_FRAGMENT/EX_*`。
- 主线推进：`MAIN_2_2 -> MAIN_2_3`。推进只代表后续推荐展示，不代表 `MAIN_2_3` 开放真实结算。
- 完成 R1-R11 后累计经验为 `3250`，后端应按 `user_level_config.need_exp` 自动回写 `game_user.player_level=11`。
- `MAIN_2_3` 必须保持 `unlocked=false`、`display-only/preview-only`，强行 start 不得创建有效真实战斗会话；重复 `MAIN_2_2` settle 必须返回 `NO_REWARD`、不扣体力、不发奖励、不推进。
- 后端配置守卫：`battle_stage_config.stage_code='MAIN_2_2'` 必须为 `PHASE6_REAL_BATTLE_R11` 且四个经济写开关开启；`MAIN_2_3` 必须为 `PHASE5_READONLY` 且全部经济写开关关闭、活跃奖励规则为 `0`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6m-main22-first-clear.ps1 -BaseUrl http://127.0.0.1:8081`，覆盖 R1-R11、`MAIN_2_3` 阶段保护、重复 `MAIN_2_2=NO_REWARD` 和资源不变。

### 2026-06-14 Stage 6L MAIN_2_1 Lv10 预热契约

- 本阶段不新增玩家接口、不新增经济写入、不开放 R11；`MAIN_2_2` 只允许作为冒险推荐详情和后续章节预热展示。
- `MAIN_2_1` 首通仍为 `REAL_MAINLINE_R10`；固定奖励包含基础 `PLAYER_EXP 450`、第二章预热 `PLAYER_EXP 500`、`GOLD 900`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`。
- `GET /api/player/lobby/adventure` 的 stage `lockReasonCode` 现在允许 `PHASE_LOCKED`，表示等级/前置可能已达成，但当前阶段仍未开放真实挑战。
- R10 后普通验收样例：玩家 `Lv.10 / exp=2700`，`MAIN_2_2.requiredLevel=10`，应返回 `unlocked=false`、`lockReasonCode=PHASE_LOCKED`、`statusLabel=阶段保护`、`levelGap=0`、`expToRequiredLevel=0`。
- `MAIN_2_2.rewardPreview` 只能返回 no-grant 文案，例如 `玩家经验（预览，不发放）/金币（预览，不发放）/装备材料（预览，不发放）`；客户端必须以只读奖励预览展示，不得生成领取、挑战或结算动作。
- Cocos 冒险详情应优先展示推荐的锁定 `MAIN_2_2`，按钮文案按锁定原因显示：`PHASE_LOCKED=仅预览`、`PROGRESS_REQUIRED=主线未达`、默认等级不足显示 `等级不足`。
- 后端配置守卫：`battle_stage_config.stage_code='MAIN_2_2'` 必须保持 `display_only=1`、`preview_only=1`、`grant_enabled=0`、`settlement_enabled=0`、`stamina_cost_enabled=0`、`progress_write_enabled=0`，且活跃 `battle_reward_rule` 数量为 `0`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6i-main21-first-clear.ps1 -BaseUrl http://127.0.0.1:8081` 会覆盖 R1-R10、`MAIN_2_2` 推荐、`PHASE_LOCKED`、强制 start 阻断和重复 `MAIN_2_1=NO_REWARD`。

### 2026-06-14 Stage 6J MAIN_2_2 阶段保护补强

- 本阶段不新增玩家接口、不开放新经济写入；`MAIN_2_2` 继续只允许作为冒险推荐/预览展示。
- 强制调用 `POST /api/player/battles/start` 且 `stageCode=MAIN_2_2` 时，后端必须在读取冒险详情、读取阵容和创建战斗会话前返回失败，当前错误文案为 `关卡暂未开放`。
- DB 守卫要求 `battle_stage_config.stage_code='MAIN_2_2'` 同时满足 `status=1`、`phase_code='PHASE5_READONLY'`、`display_only=1`、`preview_only=1`、`grant_enabled=0`、`settlement_enabled=0`、`stamina_cost_enabled=0`、`progress_write_enabled=0`。
- DB 守卫要求 `battle_reward_rule.owner_code='MAIN_2_2' and status=1 and deleted=0` 的数量为 `0`。
- 可复跑保护 smoke：`D:\project\LootChain\scripts\smoke-battle-stage-guard.ps1 -BaseUrl http://127.0.0.1:8081 -InvalidStages MAIN_2_2`；本机结果为 `MAIN_2_2` 返回 `关卡暂未开放`，对应 requestId 前后 `battle_session` 计数均为 `0`。

### 2026-06-14 Stage 6I MAIN_2_1 第二章入口契约

- 新增真实首通结算范围：`MAIN_2_1`，结算模式为 `REAL_MAINLINE_R10`。
- 开放条件：`stageCode=MAIN_2_1`、`result=WIN`、玩家已完成 `MAIN_1_9`、玩家等级达到 Lv.8 且尚未首通 `MAIN_2_1`。
- 固定消耗：扣体力 `6`。
- 固定奖励：`PLAYER_EXP 450`、`GOLD 900`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`；不得发放 `DIAMOND/STAMINA/USDT/HERO/HERO_FRAGMENT/EX_*`。
- 主线推进：`MAIN_2_1 -> MAIN_2_2`。推进只代表后续推荐展示，不代表 `MAIN_2_2` 开放真实结算。
- 完成 R1-R10 后累计经验为 `2200`，后端应按 `user_level_config.need_exp` 自动回写 `game_user.player_level=9`。
- `MAIN_2_2` 必须保持 `unlocked=false`、`display-only/preview-only`，强行 start 不得创建有效真实战斗会话；重复 `MAIN_2_1` settle 必须返回 `NO_REWARD`、不扣体力、不发奖励、不推进。
- 冒险 stage：完成 `MAIN_2_1` 后推荐 `MAIN_2_2`，当前验收样例返回 `growthSourceStatus=FIRST_CLEAR_USED_UP`、`levelGap=1`、`expToRequiredLevel=500`。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6i-main21-first-clear.ps1`。最新本机闭环 smoke：`userId=29` / `heroId=37`，R1-R10 后 `playerLevel=9`、`exp=2200`、`stamina=140`、`MAIN_2_2` 启动阻断、重复 `MAIN_2_1` 为 `NO_REWARD`，临时账号提升到 Lv.10 后 `MAIN_2_2` 仍 `unlocked=false`。

### 2026-06-14 Stage 6H 第一章成长桥契约

- 新增真实首通结算范围：`MAIN_1_4` 至 `MAIN_1_9`，结算模式依次为 `REAL_MAINLINE_R4` 至 `REAL_MAINLINE_R9`。
- 开放条件：对应关卡 `result=WIN`、玩家已完成前一关且尚未首通当前关；每关仍只允许首次胜利扣体力和发放奖励。
- 固定消耗：每关扣体力 `6`。
- 固定玩家经验：`MAIN_1_4=60`、`MAIN_1_5=200`、`MAIN_1_6=250`、`MAIN_1_7=300`、`MAIN_1_8=350`、`MAIN_1_9=400`，桥接总计 `1560 EXP`。
- R1-R9 后累计经验为 `1750`，后端应按 `user_level_config.need_exp` 自动回写 `game_user.player_level=8`。
- 固定资源：只发放 `GOLD`、`LOW_ENHANCE_STONE`、`HERO_EXP_BOOK`；不得发放 `DIAMOND/STAMINA/USDT/HERO/HERO_FRAGMENT/EX_*`。
- 主线推进：`MAIN_1_4 -> MAIN_1_5 -> MAIN_1_6 -> MAIN_1_7 -> MAIN_1_8 -> MAIN_1_9 -> MAIN_2_1`。
- `MAIN_2_1` 在完成 `MAIN_1_9` 且达到 Lv.8 后可解锁并创建无奖励战斗会话，但结算必须保持 `settlementMode=NO_REWARD`、`rewardGranted=false`、`economyApplied=false`、`progressApplied=false`、`readonlyEconomy=true`、`staminaCost=0`。
- 冒险 stage：完成 `MAIN_1_9` 后 `MAIN_2_1.unlocked=true`、`recommended=true`、`growthSourceStatus=NEXT_STAGE_READONLY`；不代表第二章真实奖励开放。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6h-growth-bridge-to-lv8.ps1`。最新本机闭环 smoke：`userId=25` / `heroId=33`，`MAIN_2_1` 结算为 `NO_REWARD` 且体力未变化。

### 2026-06-14 Stage 6E 等级进度与锁定原因只读契约

- `GET /api/player/me/lobby` 新增 `levelProgress`，只读展示用，客户端不得提交或回写其中任何字段。
- `levelProgress.currentExp/currentLevel/currentLevelNeedExp/nextLevel/nextLevelNeedExp/expIntoLevel/expToNextLevel/progressPercent/maxHeroLevel/nextUnlockDesc` 均由后端从 `game_user` 与 `user_level_config` 计算。
- 当前验收样例：玩家 `playerLevel=2`、`exp=190` 时，`currentLevelNeedExp=100`、`nextLevel=3`、`nextLevelNeedExp=250`、`expIntoLevel=90`、`expToNextLevel=60`、`progressPercent=60`。
- `GET /api/player/lobby/adventure` 的 stage 增加 `unlockHint`。完成 R1/R2/R3 后推荐 `MAIN_2_1`，但 `MAIN_2_1.unlocked=false`，`unlockHint` 必须表达需要 Lv.8、当前 Lv.2。
- Cocos UI 只读展示：左上 EXP 百分比、资料页经验进度、冒险详情锁定原因；不新增玩家升级、升级奖励领取、体力领取/购买或任何经济/进度写入口。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6e-level-progress-readonly.ps1`。

#### Stage 6F 锁定关卡差距字段

- `GET /api/player/lobby/adventure` 的 stage 在 `unlockHint` 基础上新增结构化字段：`lockReasonCode`、`levelGap`、`requiredLevelNeedExp`、`expToRequiredLevel`。
- 当前编码：`NONE` 表示已满足进入条件，`LEVEL_REQUIRED` 表示玩家等级不足，`PROGRESS_REQUIRED` 表示等级足够但主线前置未完成，`PHASE_LOCKED` 表示等级/前置可能已达成但当前阶段仍未开放真实挑战。
- `requiredLevelNeedExp` 来自 `user_level_config.need_exp`；若配置缺失，后端返回 `null`，Cocos 不得显示 `0 EXP` 误导玩家。
- 验收样例：完成 R1/R2/R3 后，玩家 `Lv.2 / exp=190`，`MAIN_2_1.requiredLevel=8`，应返回 `lockReasonCode=LEVEL_REQUIRED`、`levelGap=6`、`requiredLevelNeedExp=1750`、`expToRequiredLevel=1560`。
- Cocos 冒险详情展示“距离要求：6 级 / 1,560 EXP”；不得把 `levelProgress.expToNextLevel=60` 误当成 `MAIN_2_1` 解锁差距。

#### Stage 6G 锁定后下一步引导字段

- `GET /api/player/lobby/adventure` 的 stage 继续只读扩展 `nextGuidanceTitle`、`nextGuidanceText`、`growthSourceSummary`、`growthSourceStatus`、`growthSourceHint`、`repeatableExpAvailable`。
- 这些字段只用于说明“为什么锁、经验来源是否还有、现在不能做什么”，不代表可点击行动，不新增任何玩家经验、体力、奖励、背包或进度写入口。
- 当前验收样例：完成 R1/R2/R3 后，`MAIN_2_1` 返回 `growthSourceStatus=FIRST_CLEAR_USED_UP`、`repeatableExpAvailable=false`，说明当前阶段玩家经验仅来自 `MAIN_1_1 / MAIN_1_2 / MAIN_1_3` 首通奖励，已首通后暂无可重复获取玩家经验入口。
- Cocos 冒险详情底部只读说明显示“首通经验已用完；暂无重复经验入口。”；锁定按钮仍不可进入编队或战斗。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6g-adventure-next-step-readonly.ps1`。

### 2026-06-14 Stage 6D 玩家等级自动成长契约

- R1/R2/R3 首通结算给出的 `PLAYER_EXP` 是玩家经验到账来源；客户端不得提交等级、经验或升级请求。
- 后端在同一首通结算事务内根据 `game_user.exp + 本次 PLAYER_EXP` 计算累计经验，并按 `user_level_config.need_exp` 满足条件的最高等级回写 `game_user.player_level`。
- 当前等级阈值：Lv.1=`0`、Lv.2=`100`、Lv.3=`250`、Lv.8=`1750`。完整 R1/R2/R3 后累计经验 `190`，玩家等级应为 `2`。
- `GET /api/player/me/lobby` 的 `playerLevel` 与 `exp` 是 Cocos 展示玩家等级的唯一来源；`GET /api/player/lobby/adventure` 使用同一玩家等级判断关卡锁定。
- `MAIN_2_1` 仍 required_level=8 且不开放真实结算；Stage 6D 只让它在完成 R3 后成为推荐展示，不允许创建战斗会话。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6d-player-levelup.ps1`。

### 2026-06-14 R3 主线首通与英雄 2→3 契约

- R3 开放条件：`stageCode=MAIN_1_3`、`result=WIN`、玩家已完成 `MAIN_1_2` 且尚未首通 `MAIN_1_3`。
- R3 结算模式：`settlementMode=REAL_MAINLINE_R3`。
- R3 固定消耗与奖励：扣体力 `6`、玩家经验 `80`、`GOLD 1200`、`LOW_ENHANCE_STONE x3`、`HERO_EXP_BOOK x1`，可支撑一次英雄 2→3 的最小升级消耗。
- R3 主线推进：写入/更新 `user_mainline_progress`，`maxCompletedStageCode=MAIN_1_3`，`currentStageCode=MAIN_2_1`。
- `MAIN_2_1` 只作为后续推荐展示，仍不开放真实结算。
- 英雄升级仍只开放 `POST /api/player/heroes/{heroId}/level-up`；`star-up/awaken/refine` 继续关闭。
- 仍关闭：重复刷关掉落、副本、Boss、排行、扫荡、资金池奖励、USDT、EX V1、后台补发/重结算、背包 use/sell/batch-use、升星、觉醒、精炼。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6c-r3-levelup.ps1`。最新本机闭环 smoke：`userId=13` / `heroId=30` 已完成 `MAIN_1_1`、`MAIN_1_2`、英雄 1→2、`MAIN_1_3` 与英雄 2→3；`MAIN_2_1` 启动返回 `code=1000` 且没有创建 `battle_session`，不属于本阶段真实结算。

### 2026-06-14 R2 主线首通与英雄升级契约

- R2 开放条件：`stageCode=MAIN_1_2`、`result=WIN`、玩家已完成 `MAIN_1_1` 且尚未首通 `MAIN_1_2`。
- R2 结算模式：`settlementMode=REAL_MAINLINE_R2`。
- R2 固定消耗与奖励：扣体力 `6`、玩家经验 `60`、`GOLD 800`、`LOW_ENHANCE_STONE x2`、`HERO_EXP_BOOK x1`，可支撑一次英雄 1→2 的最小升级消耗。
- R2 主线推进：写入/更新 `user_mainline_progress`，`maxCompletedStageCode=MAIN_1_2`，`currentStageCode=MAIN_1_3`。
- 英雄升级：`POST /api/player/heroes/{heroId}/level-up` 消耗后端配置的金币与英雄经验书，成功后 Cocos 必须回读玩家资料、英雄列表与背包。
- 仍关闭：重复刷关掉落、副本、Boss、排行、扫荡、资金池奖励、USDT、EX V1、后台补发/重结算、背包 use/sell/batch-use、升星、觉醒、精炼。
- 可复跑 smoke：`D:\project\LootChain\scripts\smoke-stage6b-r2-levelup.ps1`。最新本机闭环 smoke：`userId=10` / `heroId=27` 已完成 `MAIN_1_1`、`MAIN_1_2` 与一次 `level-up`；`MAIN_1_3` 启动返回 `code=1000` 且没有创建 `battle_session`，不属于本阶段真实结算。

### 2026-06-12 R1 主线首通结算契约

- 开放条件：`stageCode=MAIN_1_1`、`result=WIN`、玩家尚未首通 `MAIN_1_1`。
- 结算模式：`settlementMode=REAL_MAINLINE_R1`。
- 固定消耗与奖励：扣体力 `6`、玩家经验 `50`、`GOLD 300`、`LOW_ENHANCE_STONE x2`。
- 主线推进：写入/更新 `user_mainline_progress`，`maxCompletedStageCode=MAIN_1_1`，`currentStageCode=MAIN_1_2`。
- 幂等：同一战斗或同一结算请求重放必须返回原回执，不二次扣体力、不二次发奖励、不二次推进。
- 非开放条件：`LOSE/ABORT`、非 `MAIN_1_1`、已首通 `MAIN_1_1`、锁定关卡或过期/无效会话均不得产生 R1 奖励。
- 禁止资源：R1 响应和配置不得包含 `USDT`、`HERO`、`HERO_FRAGMENT`、`DIAMOND`、`BOUND_DIAMOND`、`STAMINA`、`EX_CORE_SHARD` 或 `EX_` 前缀资源。
- 仍关闭：重复刷关掉落、副本、Boss、排行、扫荡、资金池奖励、USDT、EX V1、后台补发/重结算、背包 use/sell/batch-use、英雄养成。

R1 settle response data 关键字段：

```json
{
  "battleNo": "B...",
  "settlementNo": "S...",
  "stageCode": "MAIN_1_1",
  "result": "WIN",
  "settlementMode": "REAL_MAINLINE_R1",
  "rewardGranted": true,
  "economyApplied": true,
  "progressApplied": true,
  "firstClear": true,
  "staminaCost": 6,
  "staminaBefore": 100,
  "staminaAfter": 94,
  "rewardItems": [
    { "resourceType": "PLAYER_EXP", "resourceCode": "PLAYER_EXP", "resourceName": "玩家经验", "amount": 50 },
    { "resourceType": "CURRENCY", "resourceCode": "GOLD", "resourceName": "金币", "amount": 300 },
    { "resourceType": "ITEM", "resourceCode": "LOW_ENHANCE_STONE", "resourceName": "低阶强化石", "amount": 2 }
  ],
  "mainlineProgress": {
    "beforeStageCode": "",
    "afterStageCode": "MAIN_1_2",
    "unlockedStageCode": "MAIN_1_2",
    "progressed": true
  },
  "readonlyEconomy": false
}
```

## 认证

- `POST /api/player/auth/dev-login`
  - body: `{ "userId": 1 }`
  - response data: `{ "tokenName": "player-token", "tokenValue": "..." }`

除 dev-login 外，所有 `/api/player/**` 请求都需要带登录接口返回的 token header。

当前默认只做登录联调。真实抽卡、英雄培养、背包使用/出售等写入口需要专项测试账号和清理策略后再显式接入。

## 主角色

- `GET /api/player/protagonist/state`
  - response data:
    ```json
    {
      "created": true,
      "profile": {
        "userId": 1,
        "protagonistNo": "PG...",
        "gender": "male",
        "protagonistName": "圣契1",
        "rarity": "SSR",
        "currentForm": "attack",
        "attackUnlocked": true,
        "defenseUnlocked": false,
        "supportUnlocked": false,
        "userHeroId": 1001,
        "heroCode": "PROTAGONIST_MALE_ATTACK",
        "power": 8300
      }
    }
    ```
- `POST /api/player/protagonist`
  - body: `{ "gender": "male", "protagonistName": "圣契1" }`
  - response data: 同 `profile`。

约束：
- 该接口是账号初始化写入，不是经济入口。
- 客户端禁止传 `heroCode`、`rarity`、`level`、`star`、`power`、属性或任何奖励字段。
- 重复创建会返回已有主角色，不会生成第二个主角色或第二条主角英雄实例。
- 防御/辅助形态仍保持锁定，后续只能由主线进度/道具解锁链路打开。

## 大厅玩家资料

- `GET /api/player/me/lobby`
  - response data:
    ```json
    {
      "userId": 1,
      "displayName": "圣契1",
      "protagonistName": "圣契1",
      "username": "player001",
      "nickname": "账号昵称",
      "avatar": null,
      "playerLevel": 1,
      "exp": 0,
      "levelProgress": {
        "currentLevel": 1,
        "currentExp": 0,
        "currentLevelNeedExp": 0,
        "nextLevel": 2,
        "nextLevelNeedExp": 100,
        "expIntoLevel": 0,
        "expToNextLevel": 100,
        "progressPercent": 0,
        "maxHeroLevel": 10,
        "nextUnlockDesc": "开放英雄等级上限"
      },
      "stamina": 100,
      "maxStamina": 120,
      "combatPower": 9432,
      "status": 1,
      "accountStatus": "正常",
      "walletBound": false,
      "walletAddress": null,
      "loginMethod": "dev-login"
    }
    ```

约束：
- 该接口只读，只服务大厅左上角玩家信息、资源栏和资料弹窗展示。
- `displayName` 的优先级是：已创建主角色名 -> 账号昵称 -> 登录用户名 -> `Player{userId}`。
- `protagonistName` 只来自当前登录玩家自己的 `player_protagonist`，前端不能传 `userId` 查询其他玩家资料。
- 该接口不创建主角、不改昵称、不扣体力、不写战力、不写背包/货币/奖励/进度。

## 大厅英雄队列

- `GET /api/player/lobby/heroes`
  - response data:
    ```json
    [
      {
        "id": 1001,
        "heroCode": "PROTAGONIST_MALE_ATTACK",
        "heroName": "圣契1",
        "rarity": "SSR",
        "faction": "深渊议会",
        "heroClass": "战士",
        "level": 1,
        "star": 1,
        "power": 8300,
        "protagonist": true,
        "sourceType": "PROTAGONIST",
        "portraitAsset": "act_1001",
    "cardBackgroundAsset": "ui/hero-roster/card_background/Nuu_Illust",
        "spineAsset": "npc_1001",
        "spineUuid": "7196cf65-7226-4546-8f38-b60935a6a97a",
        "currentForm": "attack",
        "formLabel": "攻击形态"
      }
    ]
    ```

约束：
- 该接口只读，不执行英雄升级、升星、觉醒、洗练、抽卡、发奖、购买、出售或结算。
- 主角由后端按 `protagonist=true` / `sourceType=PROTAGONIST` 置顶；前端也会再按主角标记排序。
- EX 稀有度和 `EX_` 英雄编码会在后端和前端双重过滤。
- `portraitAsset`、`cardBackgroundAsset`、`spineAsset`、`spineUuid` 仅用于 Cocos 英雄列表/详情资源展示；`cardBackgroundAsset` 是 `assets/resources` 下的卡牌背景资源路径，前端会按 SpriteFrame 资源加载；`spineUuid` 对应 Cocos `sp.SkeletonData` 资源 uuid，前端优先按 uuid 加载，失败时才按 `assets/resources/spine/hero/{spineAsset}/{spineAsset}` 路径兜底。
- 这些展示字段不代表获取来源、概率、奖励、消耗、碎片转换或任何经济语义。

### 2026-06-06 Hero card background display field

- `hero_template.card_background_asset` 通过玩家英雄列表、详情、图鉴和大厅只读英雄/图鉴 VO 暴露为 `cardBackgroundAsset`。
- 当前 SQL：`D:\project\LootChain\sql\24_hero_card_background_asset.sql`。
- 当前示例值：`UR_EVELYN -> ui/hero-roster/card_background/Nuu_Illust`。
- 该字段只控制 Cocos 英雄界面卡牌背景展示，不改变英雄拥有状态、抽卡概率、池物品、奖励、碎片转换、EX V1、英雄养成或任何经济写入口。

### 2026-06-07 Nine hero display asset mapping

- 当前增量 SQL：`D:\project\LootChain\sql\33_hero_display_asset_batch_sync.sql`。
- 本批只同步展示字段：`portrait_asset`、`card_background_asset`、`spine_asset`、`spine_uuid`。
- 当前映射：
  - `UR_ARTHAS -> IshmaelA / ui/hero-roster/card_background/IshmaelA_Illust`;
  - `UR_ATLAS -> Lucrecia / ui/hero-roster/card_background/Lucrecia_Illust`;
  - `UR_AURELIA -> Belladonna / ui/hero-roster/card_background/Belladonna_Illust`;
  - `UR_NYX -> Sphinx / ui/hero-roster/card_background/Sphinx_Illust`;
  - `UR_SERAPHINA -> LucienA / ui/hero-roster/card_background/LucienA_Illust`;
  - `SSR_KANE -> Ishmael / ui/hero-roster/card_background/Ishmael_center`;
  - `SSR_LIVIA -> Carmilla / ui/hero-roster/card_background/Carmilla_center`;
  - `SSR_MICHAEL -> HeylelS01 / ui/hero-roster/card_background/HeylelS01_Illust`;
  - `SSR_RON -> Eulenspigel / ui/hero-roster/card_background/Eulenspigel_Illust`。
- Cocos 英雄详情优先使用 `spineUuid` 加载 `sp.SkeletonData`，失败再按 `assets/resources/spine/hero/{spineAsset}/{spineAsset}` 路径兜底。
- 本批英雄详情动画统一使用 `idle`。这只是展示动画选择，不改变技能、属性、战斗或养成语义。
- 该批同步不新增接口、不改变返回结构，不开放 EX V1、英雄养成、背包写操作、gacha exchange/reissue，也不改变抽卡概率、保底、消耗、奖励或重复转碎片规则。

### 大厅英雄职业筛选项

- `GET /api/player/lobby/heroes/filter-options`
  - response data:
    ```json
    {
      "heroClasses": ["战士", "辅助", "刺客", "法师", "射手", "坦克"]
    }
    ```

约束：
- 该接口优先读取 `sys_param_config.param_key='hero.class.options'`，`param_value` 使用逗号/分号/换行分隔职业名。
- `heroClasses` 仅用于 Cocos 英雄队列左侧职业筛选项。
- Cocos 左侧按钮显示该接口返回的职业文本，但内部过滤使用规范化职业 key 匹配 `GET /api/player/lobby/heroes` 的 `heroClass`；该规范化只用于只读展示去重、选中态和筛选，不写库、不修改英雄模板。
- 当前运行中的旧本地后端如果尚未开放本接口，或 `GET /api/player/lobby/heroes` 暂时返回 `heroClass: null`，Cocos 会对已知 V1 `heroCode` 使用只读职业兜底映射；后端返回真实 `heroClass` 时始终优先使用后端字段。
- 当配置缺失或为空时，后端才回退读取启用模板 `hero_template.hero_class where status=1` 并合并默认六职业；查询失败时只返回默认六职业展示兜底：`战士 / 辅助 / 刺客 / 法师 / 射手 / 坦克`。
- 该兜底不会插入或修改数据库行，不改变英雄、抽卡、经济或奖励语义。

## 大厅冒险主线只读壳

- `GET /api/player/lobby/adventure`
  - response data:
    ```json
    {
      "mode": "mainline",
      "readonly": false,
      "playerLevel": 3,
      "playerPower": 8300,
      "currentChapterCode": "CHAPTER_01",
      "currentChapterName": "暗影之堡",
      "recommendedStageCode": "MAIN_1_1",
      "recommendedStageName": "暗影城门",
      "recommendationText": "继续主线 1-1，当前仅开放 MAIN_1_1 至 MAIN_2_1 首通真实结算；MAIN_2_2 仍受阶段保护。",
      "guardrails": ["仅 R1-R10 首通胜利开放真实结算", "客户端不提交奖励、体力、进度或货币字段", "不开放重复刷关掉落、USDT、资金池或 EX V1"],
      "chapters": [
        {
          "chapterCode": "CHAPTER_01",
          "chapterName": "暗影之堡",
          "subtitle": "第一章",
          "summary": "从破碎城门进入深渊边境，确认第一条主线推进路径。",
          "unlocked": true,
          "stages": [
            {
              "stageCode": "MAIN_1_1",
              "stageName": "暗影城门",
              "orderNo": 1,
              "unlocked": true,
              "recommended": true,
              "requiredLevel": 1,
              "recommendedPower": 7500,
              "enemySummary": "黑甲守卫 x3 / 裂隙侍从 x2",
              "rewardPreview": ["玩家经验", "金币", "低阶强化石"],
              "statusLabel": "推荐",
              "unlockHint": "已达成进入条件",
              "lockReasonCode": "NONE",
              "levelGap": 0,
              "requiredLevelNeedExp": 0,
              "expToRequiredLevel": 0,
              "nextGuidanceTitle": "已开放主线 1-1",
              "nextGuidanceText": "可进入编队确认；首通胜利按服务端白名单结算。",
              "growthSourceSummary": "当前阶段玩家经验仅来自 MAIN_1_1 至 MAIN_2_1 首通奖励。",
              "growthSourceStatus": "NEXT_FIRST_CLEAR_AVAILABLE",
              "growthSourceHint": "仅当前白名单主线的首次胜利会发放玩家经验；重复挑战不会发放额外经验。",
              "repeatableExpAvailable": false
            }
          ]
        }
      ]
    }
    ```

约束：
- 该接口只读，只服务大厅 `冒险` 面板展示当前主线目标、章节、关卡、推荐战力、敌人摘要和掉落预览。
- 当前不保存主线进度，不保存编队，不创建战斗，不结算，不扣体力，不发放奖励。
- 掉落预览只是文案，真实奖励必须等后续战斗结算阶段由后端事务和奖励服务控制。
- Cocos 只允许通过该 GET 门面读取，不调用战斗、奖励、背包、英雄养成或经济写接口。

## 抽卡

- `GET /api/player/gacha/pools`
- `GET /api/player/gacha/pools/{poolCode}`
- `GET /api/player/gacha/pity/{poolCode}`
- `POST /api/player/gacha/draw`
  - body: `{ "poolCode": "NORMAL_HERO", "requestId": "...", "drawCount": 1, "useTicket": false }`
- `GET /api/player/gacha/logs`

### 2026-06-03 Gacha pool display metadata

- `GET /api/player/gacha/pools` and `GET /api/player/gacha/pools/{poolCode}` now include `tabLogoAsset`.
- `tabLogoAsset` is a Cocos resources path for the right-side image slot inside each left summon-pool tab.
- `logoAsset` remains the small pool badge/icon path; `tabLogoAsset` is the larger tab background/logo slot. If `tabLogoAsset` is empty, Cocos falls back to `logoAsset` and then to the theme color block.
- This field is display-only and does not affect probability, pool items, pity, cost, rewards, duplicate conversion, exchange/reissue, EX V1, or any economy write path.

## 英雄

- `GET /api/player/heroes`
- `GET /api/player/heroes/{heroId}`
- `GET /api/player/heroes/fragments/list`

## 2026-06-02 Cocos Gacha/Asset Readonly Contract Update

- `GET /api/player/me/lobby`
  - adds readonly `gold` and `diamond` fields for Cocos top asset display;
  - values come from `user_currency`; missing rows are displayed as `0`;
  - the read path must not create accounts or write currency logs.
- `GET /api/player/gacha/pools/{poolCode}/detail`
  - readonly player-facing pool detail for Cocos side pages;
  - includes pool display metadata, rates, pool items, pity configs, duplicate conversion configs, and ticket configs;
  - used by Gacha `概率保底`, `兑换` explanation, and `奖池内容` pages.
- `GET /api/player/gacha/logs`
  - used by the Gacha `记录` page with current selected pool filter.
- `GET /api/player/heroes/fragments/list`
  - used by the Cocos backpack to merge duplicate-hero fragments into a read-only `英雄碎片` group;
  - fragments remain stored in `user_hero_fragment`, not `user_bag`.
- Still not available in this stage:
  - gacha exchange/reissue;
  - bag use/batch-use/sell;
  - hero growth writes;
  - EX V1;
  - any new economy write endpoint.
- `GET /api/player/heroes/codex`
- `POST /api/player/heroes/{heroId}/level-up`
- `POST /api/player/heroes/{heroId}/star-up`
- `POST /api/player/heroes/{heroId}/awaken`
- `POST /api/player/heroes/refine`

## 背包

- `GET /api/player/bag`
- `POST /api/player/bag/use`
- `POST /api/player/bag/batch-use`
- `POST /api/player/bag/sell`
- `GET /api/player/bag/items/{itemCode}/source`

## 当前缺口

- 正式注册/登录/邮箱登录/钱包登录未实现。
- 除主角色初始化、`GET /api/player/me/lobby` 只读大厅资料、`GET /api/player/lobby/notices` 只读公告、`GET /api/player/lobby/codex` 只读图鉴、`GET /api/player/lobby/heroes` 只读英雄队列、`GET /api/player/lobby/heroes/filter-options` 只读英雄职业筛选项、`GET /api/player/lobby/adventure` 只读冒险壳、`POST /api/player/battles/start` 战斗会话和 `POST /api/player/battles/{battleNo}/settle` 无奖励记录结算外，玩家 `/me` 总览、货币总览等更大接口仍未实现。
- 队伍保存、副本、Boss 玩家侧接口未实现；战斗启动/结算当前只用于无奖励 battle session 闭环，不扣体力、不写主线进度、不发放奖励。
- Cocos 本地预览跨域需要后端 CORS 或同源代理支持。

## 2026-05-31 Battle Session Contracts

Current Cocos battle flow can call only these battle endpoints:

- `POST /api/player/battles/start`
- `POST /api/player/battles/{battleNo}/settle`

`start` request fields:

- `requestId`
- `stageCode`
- `heroIds`
- `leaderHeroId`
- `clientVersion`

`settle` request fields:

- `requestId`
- `result`
- `durationSeconds`
- `roundCount`
- `clientChecksum`

Contract boundary:

- Client must not submit reward, drop, currency, bag, stamina, progress, hero attribute, USDT, fund-pool, or EX data.
- Server response must keep `readonlyEconomy=true`.
- Settlement response must keep `rewardGranted=false`.
- Real reward/stamina/progress settlement remains unopened and must be separately reviewed.

### 2026-05-31 Stage 4O Formation Use In Battle Start

- Cocos now keeps a local `selectedLobbyFormationHeroIds` list while the formation panel is open.
- The selected list is used only to populate existing battle-start request fields:
  - `heroIds`
  - `leaderHeroId`
- The protagonist is kept as the local leader when present.
- This stage does not add a team-save API and does not persist formation outside the battle-session lineup snapshot.
- The client still must not submit hero attributes, rarity overrides, power, rewards, stamina, progress, currency, USDT, fund-pool, or EX data.

### 2026-05-31 Stage 4P Cocos Phase API Gate

Backend now enables a current-phase allowlist by default:

- config: `lootchain.player.cocos-phase-gate-enabled=true`
- gate: `com.lootchain.config.PlayerApiPhaseGate`

Allowed routes in the current Cocos phase:

- `POST /api/player/auth/dev-login`
- `GET /api/player/me/lobby`
- `GET /api/player/protagonist/state`
- `POST /api/player/protagonist`
- `GET /api/player/lobby/adventure`
- `GET /api/player/lobby/codex`
- `GET /api/player/lobby/heroes`
- `GET /api/player/lobby/notices`
- `GET /api/player/battles/recent`
- `POST /api/player/battles/start`
- `POST /api/player/battles/{battleNo}/settle`

Blocked routes include full gacha, full hero growth/detail, full bag/use, reward, currency, USDT, fund-pool, and EX routes unless separately reviewed and added to the allowlist.

Historical note: this 2026-05-31 phase required Cocos `GachaApi.draw()` to stay locally blocked. The current 2026-06-02+ summon phase has separately reviewed and connected the existing `POST /api/player/gacha/draw` endpoint only. The client still must not add gacha exchange/reissue, EX V1, bag use/sell, hero growth, reward/currency/fund-pool writes, or any new economy write route.

### 2026-05-31 Stage 4Q Battle Start Idempotency

`POST /api/player/battles/start` now treats `requestId` as a required idempotency key.

Rules:

- missing or blank `requestId` is rejected;
- `requestId` longer than 80 characters is rejected and must not be truncated;
- a repeated `requestId` may return an existing battle session only when all of these match:
  - `stageCode`
  - ordered `heroIds`
  - `leaderHeroId`
- a repeated `requestId` with a different stage, lineup, or leader is rejected with `重复战斗请求参数不一致`.

Cocos must create a new battle start `requestId` whenever the player changes stage or formation.

### 2026-05-31 Stage 4R Settlement No-Economy Flags

Current Cocos battle settlement remains a no-reward record, now persisted with DB-visible guard fields:

- `settlement_mode='NO_REWARD'`
- `reward_granted=0`
- `readonly_economy=1`
- `economy_applied=0`

`POST /api/player/battles/{battleNo}/settle` still returns:

- `rewardGranted=false`
- `readonlyEconomy=true`

Any future reward, stamina, mainline progress, bag/currency, USDT, fund-pool, or EX settlement must be added in a separate reviewed stage and must not treat `NO_REWARD` records as reward-eligible.

### 2026-05-31 Stage 4T Recent Battle Readonly Record

`GET /api/player/battles/recent` is now available in the current Cocos phase as a read-only return-to-lobby clarity endpoint.

Required guard fields per record:

- `settlementMode='NO_REWARD'`
- `rewardGranted=false`
- `readonlyEconomy=true`
- `economyApplied=false`

Cocos `BattleApi.recentBattles()` must fail closed if these flags indicate a reward/economy-applied state. The current strict acceptance contract is:

- `settlementMode === 'NO_REWARD'`
- `rewardGranted === false`
- `readonlyEconomy === true`
- `economyApplied === false`
- `battleNo`, `settlementNo`, `stageCode`, and `recordedTime` must be present.

The backend service also filters the recent query to no-reward readonly rows only. The adventure panel may display these records only as recent no-reward challenge history.

This endpoint must not grant rewards, deduct stamina, write mainline progress, save formation, mutate bag/currency/USDT/fund-pool data, expose EX V1, or become a claimable reward source.

### 2026-05-31 Stage 4W Battle Guard Smoke Matrix

Additional current-phase backend guards now exist for the Cocos battle path:

- `scripts/smoke-battle-request-guard.ps1`
  - missing/null/blank/overlong `requestId` must be rejected before `battle_session` insert.
- `scripts/smoke-battle-stage-guard.ps1`
  - empty, malformed, BOSS, EX, Unicode, and overlong `stageCode` values must be rejected before `battle_session` insert.
- `scripts/smoke-battle-lineup-guard.ps1`
  - empty, zero, negative, duplicate, non-owned, leader-not-in-lineup, and over-limit lineups must be rejected before `battle_session` insert.
- `scripts/smoke-battle-settle-guard.ps1`
  - unknown battle, missing/blank/overlong settle `requestId`, and illegal result must be rejected before `battle_settlement` insert;
  - repeated settle must return the original no-reward settlement and keep one row per battle.
- `scripts/smoke-cocos-current-flow.ps1`
  - same battle-start `requestId` with changed stage, lineup, or leader must be rejected;
  - PhaseGate failures must match the Cocos current-phase blocking message, while tolerating Windows PowerShell UTF-8 display issues.

Cocos must continue to create a fresh start `requestId` when the player changes stage or formation, and a fresh settle `requestId` per settlement attempt. It must not retry a changed payload under an old idempotency key.

### Local Smoke Verification

The backend repo now contains:

```powershell
D:\business\project\LootChain\scripts\smoke-player-flow.ps1
```

Run it after `lootchain-game` starts:

```powershell
cd D:\business\project\LootChain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-player-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1 -StageCode MAIN_1_1
```

The script checks the current Cocos player path through dev-login, protagonist state, lobby profile, adventure, hero roster, battle start, no-reward settlement, and lobby profile re-read. Passing criteria include `rewardGranted=false`, `readonlyEconomy=true`, and no stamina/combat-power change.

### 2026-05-31 Current Phase Guard Smoke

The backend repo also contains:

```powershell
D:\business\project\LootChain\scripts\smoke-cocos-current-flow.ps1
```

Run it after restarting `lootchain-game` from current source:

```powershell
cd D:\business\project\LootChain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-cocos-current-flow.ps1 -BaseUrl http://localhost:8081 -UserId 1
```

The script verifies:

- current readonly/open player APIs are reachable: `GET /api/player/lobby/heroes/filter-options`, `GET /api/player/gacha/pools`, and `GET /api/player/bag`;
- forbidden player write routes are still blocked by the current Cocos phase gate: gacha exchange/reissue, bag use/batch-use/sell, and hero growth;
- blocked calls do not mutate tracked economy snapshots;
- battle start `requestId` is idempotent only for the same payload;
- no-reward settlement does not mutate tracked economy snapshots;
- `battle_settlement` persists `settlement_mode='NO_REWARD'`, `reward_granted=0`, `readonly_economy=1`, and `economy_applied=0`.
- recent battle readback contains the just-created settlement and keeps `rewardGranted=false`, `readonlyEconomy=true`, and `economyApplied=false`.

This smoke is contract verification only. It does not open reward, stamina, progress, bag/currency mutation beyond the already reviewed gacha draw path, USDT, fund-pool, EX V1, gacha exchange/reissue, bag writes, hero growth, or any new economy write route.

### 2026-05-31 Stage 4AA Locked Stage Backend Guard

`POST /api/player/battles/start` now checks the same readonly adventure unlock state that the Cocos adventure panel displays.

- The backend still validates `stageCode` format and the current static mainline allowlist first.
- After that, the target stage must exist in `GET /api/player/lobby/adventure` and must be `unlocked=true` for the current player.
- Locked mainline stages such as `MAIN_1_2` are rejected before hero lookup and before any `battle_session` insert.
- Cocos should continue to hide/disable locked stages locally, but backend remains authoritative against modified clients.

Verification added in the backend project:

```powershell
cd D:\business\project\LootChain
mvn.cmd --no-transfer-progress -pl lootchain-core "-Dtest=PlayerBattleServiceImplTest,PlayerApiPhaseGateTest,PlayerLobbyAdventureServiceImplTest" test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-battle-stage-guard.ps1 -BaseUrl http://localhost:8081 -UserId 1
```

This is a defensive battle-start guard only. It does not open rewards, stamina cost, mainline progress write, saved formation, bag/currency, USDT, fund-pool, EX V1, or any economy write route.

### 2026-06-05 Lobby hero class fields

- `GET /api/player/lobby/heroes` now includes display-only `faction` and `heroClass`.
- These fields come from `hero_template.faction` and `hero_template.hero_class`.
- Cocos uses `heroClass` for the hero roster class filter and one-character card badge. Missing `heroClass` heroes stay visible in `全部` only.
- The client must not implement class filtering by calling hero detail for every card, and must not add any hero growth, gacha, reward, bag, or economy write path for this filter.

### 2026-06-05 Cocos summon visibility and real-draw gate

- Cocos may show locked/display-only pools such as `SEALED_LIGHT_DARK`, but it filters explicit hidden rows only: `displayType=HIDDEN` or `themeColor=hidden`.
- Cocos enables summon buttons only for pools returned by the backend with `drawEnabled=true`, `previewOnly=false`, and `locked=false`; the actual draw still goes only through the existing `POST /api/player/gacha/draw`.
- Preview-only or locked pools must not be treated as real active pools by the client. A pool becomes drawable only when backend data exposes it as a real active pool under the same guard.
- This does not add exchange/reissue, does not change `gacha_pool_item`, and does not change probability, weight, pity, cost, reward, or duplicate conversion rules.

### 2026-06-06 Current Cocos PhaseGate and smoke closure

- `PlayerApiPhaseGate` now allows readonly `GET /api/player/lobby/heroes/filter-options`, matching the Cocos hero roster class rail contract.
- The current smoke script verifies the active stage boundary:
  - open: filter-options, gacha pools GET, bag GET, battle start, no-reward battle settlement, and recent battle readback;
  - blocked: gacha exchange/reissue, bag use/batch-use/sell, hero level-up/star-up/awaken/refine;
  - unchanged: no-reward settlement persists `settlement_mode='NO_REWARD'`, `reward_granted=0`, `readonly_economy=1`, and `economy_applied=0`.
- Local DB sync note: if `battle_session` or `battle_settlement` is missing, source existing SQL `13_battle_session_module.sql` and `14_battle_settlement_guard_flags.sql` with `mysql --default-character-set=utf8mb4`.
- Manual runtime acceptance on the restarted local game server confirmed:
  - `GET /api/player/lobby/heroes/filter-options` returned `code=0` with six configured classes;
  - one `NORMAL_HERO` single draw succeeded through the existing `/api/player/gacha/draw` path only;
  - current smoke passed with `rewardGranted=false`, `readonlyEconomy=true`, and `economy_applied=0`.
- Boundary unchanged: no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

### 2026-06-06 Cocos language preference request header

- Cocos now keeps display language locally in `assets/scripts/i18n/LootChainI18n.ts`.
- Supported current-stage values are `zh-CN` and `en-US`; default is `zh-CN`.
- `HttpClient` sends `Accept-Language: <current Cocos language>` on API calls.
- This header is passive metadata for future localization. No backend endpoint, response schema, economy rule, gacha rule, bag write, hero growth path, SQL, or PhaseGate rule was changed in this step.
- Login language toggling and Lobby settings language selection are local Cocos UI actions only.

### 2026-06-06 Player API localization contract

- Cocos still sends `Accept-Language` from `LootChainI18n.currentLanguage()`.
- Backend now consumes this header for `/api/player/**`.
- Supported current-stage values:
  - `zh-CN` (default and fallback);
  - `en-US`.
- Backend language parsing:
  - accepts normal browser-style `Accept-Language` values;
  - any unsupported/blank value falls back to `zh-CN`;
  - language context is cleared after request completion.
- New display-only DB table:
  - SQL: `D:\project\LootChain\sql\23_game_text_i18n.sql`;
  - table: `game_text_i18n(owner_type, owner_key, field_name, lang, text_value, status)`;
  - unique key: `(owner_type, owner_key, field_name, lang)`;
  - import must use `mysql --default-character-set=utf8mb4` to avoid corrupting Chinese seed text;
  - local `lootchain` DB currently has `200` enabled `en-US` rows, including `120` `HERO_TEMPLATE` rows for current hero/protagonist display fields.
- Localized response surfaces in this stage:
  - `GET /api/player/lobby/heroes` and related hero detail/codex/fragments display fields, including hero names, factions, classes, detail story, and detail skills where translated rows exist;
  - `GET /api/player/lobby/heroes/filter-options` class labels;
  - `GET /api/player/gacha/pools`, pool detail display fields, and `POST /api/player/gacha/draw` reward display names;
  - `GET /api/player/bag` and item source display fields;
  - `GET /api/player/lobby/notices`;
  - `GET /api/player/lobby/adventure`.
- Runtime acceptance:
  - after restarting local `lootchain-game` from current source on `8081`, readonly calls with `Accept-Language: en-US` returned English hero classes, hero list/detail/codex display fields, gacha pool text, bag type labels, and adventure text.
- Fallback rule:
  - missing translations return the original DB/hardcoded text;
  - translation rows must never drive gacha probability, weight, pity, cost, reward, duplicate conversion, item use/sell, hero growth, progress, or any economy state.
- Boundary unchanged:
  - no new API route;
  - no new economy write endpoint;
  - no `gacha_pool_item` modification;
  - no EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write opened.

### 2026-06-08 Active R/SR card background display mapping

- Current incremental SQL: `D:\project\LootChain\sql\34_active_r_sr_card_background_asset_sync.sql`.
- For enabled R/SR rows only, `hero_template.card_background_asset` now follows `ui/hero-roster/card_background/` + current `spine_asset`.
- Local DB readback confirmed 12 enabled R/SR rows match this rule:
  - `R_PATROL_01 -> npc_1001`;
  - `R_ACOLY_02 -> npc_1012`;
  - `R_SCOUT_03 -> npc_1004`;
  - `R_CULT_05 -> npc_1008`;
  - `R_RANGER_06 -> npc_1016`;
  - `R_GUARD_07 -> npc_1003`;
  - `SR_PRIEST_01 -> npc_21006`;
  - `SR_PALADIN_02 -> npc_1002`;
  - `SR_WITCH_03 -> npc_1028`;
  - `SR_BLADE_04 -> npc_1038`;
  - `SR_SNIPER_05 -> npc_1037`;
  - `SR_ABYSS_06 -> npc_1036`.
- These values are display-only resources for Cocos hero roster/codex presentation. They do not change API shape, hero ownership, gacha pool items, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag writes, hero growth, or any economy write path.

### 2026-06-09 Gacha Real Pool And Rate Contract Update

- `GET /api/player/gacha/pools` now exposes these real drawable pools when returned by backend data:
  - `LIMITED_ABYSS_PREVIEW`;
  - `NORMAL_HERO`;
  - `BASIC_CONTRACT_PREVIEW`.
- A pool is drawable in Cocos only when all existing gate fields allow it:
  - `locked=false`;
  - `drawEnabled=true`;
  - `previewOnly=false`.
- `SEALED_LIGHT_DARK` remains locked/display-only and must not be treated as drawable.
- Current active real-pool rate contract after Stage 4HG:
  - `LIMITED_ABYSS_PREVIEW`: `R=0.576000`, `SR=0.384000`, `SSR=0.036000`, `UR=0.004000`;
  - `NORMAL_HERO`: `R=0.576000`, `SR=0.384000`, `SSR=0.040000`, no active UR rate;
  - `BASIC_CONTRACT_PREVIEW`: `R=0.600000`, `SR=0.400000`, no active SSR/UR rate.
- Pity contract:
  - `LIMITED_ABYSS_PREVIEW` uses `HERO_BASE`: `SSR=80`, `UR=180`;
  - `NORMAL_HERO` uses `HERO_PERMANENT_SSR_ONLY`: `SSR=80`, no active UR pity;
  - `BASIC_CONTRACT_PREVIEW` uses `BASIC_RS_ONLY` with no active SSR/UR pity config.
- Cost contract for the opened pools:
  - `LIMITED_ABYSS_PREVIEW`: `LIMITED_CONTRACT_TICKET` 1/10 first, fallback `DIAMOND` 300/3000;
  - `NORMAL_HERO`: `HERO_CONTRACT_TICKET` 1/10 first, fallback `DIAMOND` 280/2800;
  - `BASIC_CONTRACT_PREVIEW`: `NORMAL_CONTRACT_TICKET` 1/10 first, fallback `BOUND_DIAMOND` 80/800.
- Write contract:
  - the only current Cocos gacha write remains `POST /api/player/gacha/draw`;
  - Cocos sends `paymentMode=AUTO` so backend chooses ticket first and falls back to pool currency only when tickets are insufficient;
  - no exchange/reissue API is opened;
  - no EX V1, bag write, hero growth, reward/stamina/progress write, or new economy write endpoint is opened.
- Runtime closure note:
  - with Redis/backend online, real draw calls for the opened pools reached the deduction path;
  - the current user lacked enough DIAMOND, so the calls returned insufficient-balance and created no new draw log/result rows.

### 2026-06-10 Controlled Normal Hero Real Draw Closure

- A dedicated one-off test account was used for a successful current-stage draw:
  - `userId=4`;
  - `username=codex_cocos_draw_20260610140143`;
  - setup balance: `DIAMOND=280`.
- The successful write path remained the existing Cocos draw contract only:
  - `POST /api/player/gacha/draw`;
  - `poolCode=NORMAL_HERO`;
  - `drawCount=1`;
  - `requestId=codex-cocos-normal-draw-20260610140143`;
  - `useTicket=false`.
- Result:
  - `drawNo=GACHA96a43b72b1734a69a71a613021717f8d`;
  - reward `SR_WITCH_03 / SR`;
  - `grantNo=RWDc334bcee86e34bca953807914ca29c98-19875bc0`.
- Idempotent replay with the same `requestId` returned the same `drawNo` and `grantNo`, without a second deduction.
- Verified persistence:
  - test account `DIAMOND` moved from `280.000000` to `0.000000`;
  - one `user_currency_log` row for the request;
  - one `gacha_draw_log` row for the request;
  - one `gacha_draw_result` row for the draw;
  - one successful non-audit HERO `reward_grant_log` row;
  - `user_hero` contains the protagonist and the granted `SR_WITCH_03`;
  - `user_hero_attr` contains generated hero attributes;
  - `gacha_event_outbox` contains `GACHA_DRAW_COMPLETED` and `GACHA_HERO_OBTAINED`;
  - `reward_event_outbox` contains one reward event;
  - `user_operation_log` contains one `GACHA_DRAW` operation row.
- Closed boundaries remain unchanged: no EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint is opened.

### 2026-06-10 Gacha draw guard and display-only pool closure

- Cocos drawability is now fail-closed:
  - a pool is drawable only when `drawEnabled === true`, `previewOnly=false`, `locked=false`, and `status=1`;
  - missing `drawEnabled` no longer defaults to open.
- `SEALED_LIGHT_DARK` is visible as a locked/display-only pool but remains non-drawable.
- During a submitted draw, Cocos blocks leaving the summon scene with `召唤请求处理中，请稍候。`, and login/profile reset clears stale gacha drawing state.
- Current lobby summon copy now says real draw is controlled by backend pool state; only draw is open, while exchange and reissue remain closed.
- Backend idempotency now requires same `requestId` replays to match `poolCode`, `drawCount`, and resolved payment mode; mismatched replays return `重复抽卡请求参数不一致`.
- `PlayerGachaDrawDTO.requestId` is capped at `128` characters.
- Low-balance failure smoke verifies an opened pool reaches the draw path, returns insufficient balance, cleans the temporary request key, and writes no draw/result/reward/currency/hero/pity state.
- `SEALED_LIGHT_DARK` economy guard now verifies both `real display gate = 0` and locked display-only gate `= 1`.
- This pass does not open EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress writes, or any new economy write endpoint.

## Visual Battle Stage 9 适配与性能契约

更新时间：2026-06-17

### Cocos 表现契约

- 新增 `LobbyBattleAdaptivePerformance.ts` 作为本地表现适配层。
- `resolveBattleAdaptivePerformanceProfile()` 输入只来自现有战斗表现布局、表现快照、本地时间线和当前战斗展示状态。
- 输出 `BattleAdaptivePerformanceProfile`：
  - `390x340`：`minimal`，关闭时间轴、日志、Stage 8 面板、恢复提示、辅助光环、飞行物、飘字和技能框；
  - `1280x720`：`balanced`，保留标准 HUD、时间轴、日志、飞行物和飘字；
  - `1920x1080`：`cinematic`，保留完整 Stage 1-8 表现。
- `assertBattleAdaptivePerformanceBounds()` 用于检查不遮挡、不越界风险。

### 后端接口契约

- 不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 战斗写入仍只允许：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`

### 禁止项

- Cocos 不提交奖励、体力、进度、货币、背包、英雄属性、战力、伤害、治疗、护盾或 Buff 结算字段。
- 不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、后台补发、重结算或离线结算。
- Stage 9 验收命令：`npm.cmd run check:battle-stage9`。

## Visual Battle Stage 10 全链路验收契约

更新时间：2026-06-17

### 验收路径

`冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读`

### Cocos 契约

- 冒险页只从可进入主线关卡打开本地一次性编队。
- 编队页只确认本次 `battle start` 阵容，不保存长期队伍。
- 战斗页只展示 Stage 1-9 的本地表现和后端回执状态。
- 返回大厅后只回读大厅、冒险、英雄和背包，展示服务端权威结果。
- Stage 10 自动验收不触发真实战斗写入，不点击开始战斗或提交结算。

### 后端接口契约

- 不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 战斗写入仍只允许：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`

### 禁止项

- Cocos 不提交奖励、体力、进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff、Debuff 或任何结算明细字段。
- 不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、后台补发、重结算或离线结算。
- Stage 10 验收命令：`npm.cmd run check:battle-stage10`。

## Visual Battle Stage 11 战斗音频运行时契约

更新时间：2026-06-17

Stage 11 只把 Stage 2 已导入的 Cocos 音频资源接入战斗表现运行时。

### Cocos 契约

- `LobbyBattleAudioRuntime.ts` 将当前战斗状态、表现时间线、动作 cue、辅助 cue 和 Stage 2 音频路径转换为本地 `BattleAudioRuntimePlan`。
- `LobbyBattlePreviewPanelRenderer` 使用 `AudioSource` 播放 BGM 和一次性 SFX。
- 音频只用于表现；加载失败或播放失败不得阻断战斗 UI。
- `LobbyBattleStage11AudioStatus` 只展示音频计划，不提供经济或战斗写入操作。

### 后端接口契约

- 不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 不改变 start/settle 契约。
- 战斗写入仍只允许：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- 客户端仍不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff、Debuff 或音频播放结果字段。

### 验收

- Stage 11 验收命令：`npm.cmd run check:battle-stage11`。
- 不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、后台补发、重结算或离线结算。

## Visual Battle Stage 12 战斗场景重做契约

更新时间：2026-06-17

### Cocos 契约

- Cocos 战斗页重做为横版队伍对抗表现：左侧英雄队伍、右侧怪物/BOSS，底部英雄卡牌队列，结算时显示胜利/失败覆盖层。
- 英雄战斗骨骼对 `portrait_asset=act_*` 采用 act 资源优先，确保 R/SR 的 `run/skill0/skill1` 等战斗动画可播放；`spine_asset/npc_*` 仅作为非 act 资源或 act 缺失时的兜底，避免战斗页继续误走卡面/详情用骨骼。
- R/SR 战斗验收要求：本地表现时间线必须稳定触发至少一次前排 `act_*` 英雄 `run -> skill0 -> hit`，辅助/技能 cue 可使用 `skill1` 或旧资源的 `skill_01` 映射；伤害飘字只能在命中点后出现。
- `battle start` 阵容项必须在 Cocos 归一化后保留 `portraitAsset/spineAsset/spineUuid`，敌方预览项保留 `spineAsset/scaleProfile`。
- `SSR/UR` 与 `R/SR` 骨骼使用不同缩放 profile，避免大体型资源占据半屏。
- 主战场只渲染真实参战英雄和有效敌方预览；快照补位空格不得渲染为战斗单位。
- 怪物/BOSS 资源未配置时必须使用占位，不得阻断战斗页面。
- 音频加载和播放失败不得阻断 UI；旧 UI 节点销毁后异步回调必须直接丢弃。

### 后端接口契约

- `PlayerBattleEnemyVO.spineAsset` 仅作为敌方显示资源目录。
- 不新增玩家接口。
- 不改变 `POST /api/player/battles/start` 与 `POST /api/player/battles/{battleNo}/settle` 的写入边界。
- 新增后台配置字段只用于展示预留：
  - `battle_stage_config.enemy_spine_asset`
  - `battle_boss_config.boss_spine_asset`

### 禁止项

- 不触发真实战斗结算做自动验收。
- Cocos 不提交奖励、体力、进度、货币、背包、英雄属性、战力、伤害、治疗、护盾、Buff、Debuff 或任何结算明细字段。
- 不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、后台补发、重结算或离线结算。
- Stage 12 验收命令：`npm.cmd run check:battle-stage12`。

### 2026-06-10 Stage 4HB multi-pool low-balance draw guard

- Repeatable backend smoke command:

```powershell
cd D:\project\LootChain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-cocos-gacha-draw-guard.ps1 -BaseUrl http://localhost:8081 -UserId 4
```

- Default pool coverage:
  - `LIMITED_ABYSS_PREVIEW`;
  - `NORMAL_HERO`;
  - `BASIC_CONTRACT_PREVIEW`.
- The script also accepts a narrowed pool set when needed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-cocos-gacha-draw-guard.ps1 -PoolCode NORMAL_HERO
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-cocos-gacha-draw-guard.ps1 -PoolCodes LIMITED_ABYSS_PREVIEW,NORMAL_HERO,BASIC_CONTRACT_PREVIEW
```

- Guard behavior:
  - logs in through existing `POST /api/player/auth/dev-login`;
  - reads current `GET /api/player/gacha/pools`;
  - requires each target pool to be real-open with `locked=false`, `drawEnabled=true`, and `previewOnly=false`;
  - aborts if the test account has enough balance for a successful single draw;
  - aborts if the test account has enough ticket for `paymentMode=AUTO` to become a successful ticket draw;
  - submits existing `POST /api/player/gacha/draw` twice with the same request id and `paymentMode=AUTO`;
  - requires both calls to fail low-balance without leaving a temporary processing state;
  - verifies no draw/result/reward/currency/hero/fragment/pity state changed for the failed request.
- `SEALED_LIGHT_DARK` remains outside this smoke because it is locked/display-only, not a real-open pool.
- Do not recharge a test account or run a new successful real draw unless the user explicitly approves that specific write.

### 2026-06-10 Stage 4HC hero summon center Spine mapping

- Active display mapping:
  - `LIMITED_ABYSS_PREVIEW.centerSpineResource = spine/gacha/huangfengjiaozong/huangfengjiaozong`;
  - `NORMAL_HERO.centerSpineResource = spine/gacha/hunka_nima/hunka_nima`;
  - `NORMAL_HERO.centerSpineUuid = cd644c64-da4a-4397-8f3b-cdb3ffcbd3c5`;
  - `SEALED_LIGHT_DARK.centerSpineResource = spine/gacha/Lord of the Dark Abyss/1605`.
- Guard requirement:
  - `NORMAL_HERO` must not reuse the `LIMITED_ABYSS_PREVIEW` center Spine.
- Verification command:

```powershell
cd D:\project\LootChain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-gacha-economy-config.ps1
```

- This mapping is display metadata only and must not affect rates, pity, costs, rewards, draw idempotency, duplicate conversion, EX V1, exchange/reissue, bag writes, hero growth, reward/stamina/progress writes, or any new economy endpoint.

### 2026-06-10 Stage 4HD normal summon R/SR-only contract

- `BASIC_CONTRACT_PREVIEW` remains a real drawable pool only through existing gates:
  - `locked=false`;
  - `drawEnabled=true`;
  - `previewOnly=false`.
- Active rate contract for `BASIC_CONTRACT_PREVIEW`:
  - `R=0.600000`;
  - `SR=0.400000`;
  - no active `SSR` or `UR` rate row.
- Active reward contract for `BASIC_CONTRACT_PREVIEW`:
  - active reward item rarities are only `R` and `SR`;
  - active `SSR`/`UR` reward item count is `0`;
  - active `SSR`/`UR` duplicate config count is `0`.
- Display mapping:
  - `BASIC_CONTRACT_PREVIEW.centerSpineResource = spine/gacha/box_summon/boxman_text`;
  - `BASIC_CONTRACT_PREVIEW.centerSpineUuid = 3a0e1b57-8392-4f08-83ce-31ce91d26481`;
  - `centerSpineSkin=default`;
  - `centerIntroAnimation=idle`;
  - `centerIdleAnimation=idle`.
- `LIMITED_ABYSS_PREVIEW` keeps the high-rarity limited contract:
  - `R=0.576000`;
  - `SR=0.384000`;
  - `SSR=0.036000`;
  - `UR=0.004000`.
- `NORMAL_HERO` currently has no active UR after Stage 4HG:
  - `R=0.576000`;
  - `SR=0.384000`;
  - `SSR=0.040000`;
  - no active UR rate/item/duplicate/pity.
- `HERO_BASE` pity remains `SSR=80`, `UR=180` for limited summon; `NORMAL_HERO` uses `HERO_PERMANENT_SSR_ONLY` with `SSR=80`; normal summon uses `BASIC_RS_ONLY` with no active SSR/UR pity.
- Cocos display contract:
  - use `rateNote` and `guaranteeNote` from the selected pool when present;
  - if notes are absent, render only active rates and filter pity/current-pity rows to rarities that are active in `detail.rates`;
  - normal summon must not display inactive SSR/UR pity rows;
  - decimal probability values are backend fractions and must be multiplied by `100` for percent fallback display.
- Preview verification:
  - `普通召唤` center uses `spine/gacha/box_summon/boxman_text`;
  - `概率保底` shows R/SR-only copy with no SSR/UR pity rows;
  - `奖池内容` shows only active R/SR reward rows.
- Write contract remains unchanged:
  - the only Cocos gacha write is still `POST /api/player/gacha/draw`;
  - current Cocos draw requests use `paymentMode=AUTO`;
  - no exchange/reissue, EX V1, bag write, hero growth, reward/stamina/progress write, or new economy write endpoint is opened.

### 2026-06-11 Gacha Currency/Ticket Price And C1812 UI Contract

- Backend incremental SQL: `D:\project\LootChain\sql\38_gacha_currency_ticket_price_model.sql`.
- `GET /api/player/gacha/pools` exposes `primaryCost*` fields for the preferred ticket cost and `backupCost*` fields for fallback currency cost.
- `POST /api/player/gacha/draw` accepts `paymentMode`:
  - `AUTO`: ticket first, fallback to pool currency when tickets are insufficient;
  - `TICKET`: ticket only;
  - `CURRENCY`: currency only.
- Legacy `useTicket=true/false` remains compatible, but current Cocos sends `paymentMode=AUTO`.
- `BASIC_CONTRACT_PREVIEW` must keep `pityGroupCode=BASIC_RS_ONLY`; attaching it to `HERO_BASE` is invalid because the normal pool has no active SSR/UR rates or rewards.
- Cocos summon page imports C1812 UI resources under `assets/resources/ui/gacha/c1812`:
  - `summon_floor`;
  - `summon_magic_circle`;
  - `summon_reward_slot`;
  - `summon_case_frame`;
  - `currency_gold`.
- These assets are presentation-only and do not change draw cost, probability, pity, reward, duplicate conversion, EX V1, exchange/reissue, bag writes, hero growth, or any economy write path.

### 2026-06-13 Gacha Pool Item V1 Baseline Contract

- Backend incremental SQL:
  - `D:\project\LootChain\sql\47_gacha_pool_item_v1_baseline.sql`;
  - `D:\project\LootChain\sql\48_gacha_normal_no_ur_limited_first_ur_pair.sql`.
- The player-facing pool detail endpoint must expose the current active item baseline:
  - `BASIC_CONTRACT_PREVIEW`: 6 active R + 6 active SR, all weight `100`, no active SSR/UR item;
  - `NORMAL_HERO`: 6 active R + 6 active SR + 4 active SSR, all weight `100`, no active UR item;
  - `LIMITED_ABYSS_PREVIEW`: 6 active R + 6 active SR + 4 active SSR + first-version UR pair `UR_ARTHAS`/`UR_EVELYN`, with the UR pair weight `500` each.
- Active pool version contract:
  - `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW` must each have exactly one active economy version: `config_version=1`;
  - historical non-v1 child configs are disabled, including the old `BASIC_CONTRACT_PREVIEW config_version=2` SSR placeholder.
- Active pity contract:
  - `LIMITED_ABYSS_PREVIEW` uses `HERO_BASE` with `SSR=80` and `UR=180`;
  - `NORMAL_HERO` uses `HERO_PERMANENT_SSR_ONLY` with `SSR=80` only;
  - `BASIC_CONTRACT_PREVIEW` uses `BASIC_RS_ONLY` with no active SSR/UR pity.
- Cocos display contract:
  - `奖池内容` must render only active backend items from `GET /api/player/gacha/pools/{poolCode}/detail`;
  - normal summon must show all 12 active R/SR items and must not show SSR/UR rows;
  - Cocos must not hardcode the old 2R+2SR fallback as the current normal-pool truth.
- Boundary:
  - this baseline changes configuration data only;
  - it does not add a new player API route;
  - the only gacha write remains `POST /api/player/gacha/draw`;
  - EX V1, exchange/reissue, bag writes, hero growth, reward/stamina/progress writes, and new economy endpoints remain closed.

### 2026-07-08 二期经济闭环契约（战斗真实结算 + 挂机收益）

- 本阶段经用户明确批准打通经济闭环：战斗演出完成后客户端自动调用 `POST /api/player/battles/{battleNo}/settle`（`requestId` 幂等、`result/durationSeconds/roundCount/clientChecksum`），首通奖励、体力、主线推进全部以服务端结算回执为准；旧的"本轮不提交结算"边界文案全部下线并同步守卫基线。
- 新增挂机收益端点（`PlayerIdleController`，已加入 `PlayerApiPhaseGate` 白名单）：
  - `GET /api/player/idle/summary`：服务端权威计费。`farmingFloor = min(393, 已通关序号+1)`（读 `user_mainline_progress` × `MainlineStageRules`），`goldPerHour = 120 + floor*30`，经验书每 7200 秒 1 本，累计上限 8 小时，最低领取 60 秒；只读不写。
  - `POST /api/player/idle/claim`：客户端只传 `requestId`；行锁（`user_idle_state FOR UPDATE`）+ `uk_idle_claim_request(user_id,request_id)` 双重幂等，重放返回原 `claimNo` 且不重复入账；奖励经 `RewardGrantService`（`SOURCE_TYPE=IDLE_REWARD`）发放 `CURRENCY:GOLD` 与 `ITEM:HERO_EXP_BOOK` 并写 `user_idle_claim_log`。
- 客户端接线：API 路径字符串隔离在 `assets/scripts/api/IdleApi.ts`（守卫扫描面之外），渲染/根脚本只用方法调用；大厅左下挂机面板展示真实汇总（产出/待领取/累计），领取按钮与自动挑战开关生效。
- 自动挑战闭环：结算成功回调 `onBattleSettlementRecorded` → 强刷冒险/资料/背包/最近记录/挂机汇总 → 开关开启且 `result=WIN` 且回执 `unlockedStageCode` 匹配 `MAIN_x_y` 时，4 秒回执展示后自动进入下一关并开战；失败或无推进自动停链。
- E2E 已验证（dev 库 user 1）：MAIN_1_2 首通 +800 金 → 挂机领取（curl 幂等重放 + 游戏内按钮）→ 自动挑战续战 MAIN_1_3 +1200 金 → `user_mainline_progress` 推进 `current=MAIN_1_4`；全部流水见 `user_currency_log/user_item_log/user_idle_claim_log`。
- 验收脚本：`node scripts/screenshot-idle-loop-acceptance.cjs`（挂机面板/领取/开关）；`npm.cmd run screenshot:battle-center`（settle 请求数改为仅记录不判失败）。

### 2026-07-08 主线首通奖励配置源切换

- 后端 `POST /api/player/battles/{battleNo}/settle` 的首通奖励数值改为读 `battle_reward_rule` 配置表（owner_type=STAGE、settlement_mode 匹配、first_clear_only=1、status=1），无配置行时回退 `MainlineStageRules` 代码规则；切换时已全量比对 393 关 × 4 项零差异，玩家侧契约与数值不变。
- 客户端无需任何改动；冒险面板奖励预览仍来自代码规则，改表调数值时后端需同步预览口径。

### 2026-07-08 队伍阵容持久化契约

- 解除「编队仅本地一次性、不持久化」的旧边界：出战阵容改为服务端持久化，登录还原，不再回落默认前 5 战力。
- 新表 `user_team`（`user_id` 唯一，`hero_ids` 逗号分隔有序 `user_hero.id`、`leader_hero_id`），落库脚本 `D:\project\LootChain\sql\67_team_formation_persist.sql`；纯玩法配置，不涉及奖励/掉落/体力/进度/货币/背包/英雄属性。
- 新接口（已加入 `PlayerApiPhaseGate` 白名单 + 单测断言）：
  - `GET /api/player/lobby/team`：读已保存阵容，返回 `heroIds`（有序，最多 5）与 `leaderHeroId`；读取端再过滤仍拥有且 `status=1` 的英雄，未编队/失效时返回空列表。
  - `POST /api/player/lobby/team/save`：只提交 `heroIds`（去重、最多 5）与可选 `leaderHeroId`；校验口径与战斗 start 一致（拥有 + `status=1`，队长须在阵容内），upsert 到 `user_team`。
- 客户端（`LobbyTeamApi` / `api.lobbyTeam`）：登录本会话首次在名单加载后拉一次 `getTeam` 还原到 `selectedLobbyFormationHeroIds`（在默认填充之前，触发大厅挂机演出重绘）；之后每次上/下阵变更 `toggleLobbyFormationHero` 后 `saveTeam` 回写（并发合并、失败静默）。
- E2E（dev 库 user 1，curl）：初始空 → save `[5,2,1]` 队长缺省取首位 5 → get 读回一致 → 未拥有英雄拒绝 → 队长不在阵容拒绝 → 覆盖 upsert；DB 行核对一致。

### 2026-07-09 数值体系 ÷10 重设计 + 攻击力驱动伤害

- `POST /api/player/battles/start` 回执的 `lineup[].` 新增 `attack` 字段 = `hero_template.base_attack × 等级系数(1+0.12×(lv-1)) × 星系数(1.05^(star-1))`(后端 `toLineup` 接 `HeroTemplateMapper` 计算)。客户端伤害飘字据此做**攻击力驱动**展示,消除旧"按合成战力(被血量主导)"的怪现象;敌方/占位无 attack 时按 `power` 兜底。纯表现,不改结算/发奖。
- 英雄基础属性与战力整体 ÷10(为后续装备/升星/觉醒留成长空间):`hero_template` 基础属性、`user_hero.power`、`battle_stage_config.recommended_power`(DB,`sql/68_stat_scale_redesign_div10.sql`)+ 后端 `MainlineStageRules` 推荐战力常量/公式 + `MAINLINE_ENEMIES` 敌人战力同步 ÷10,门槛判定不变。
- 战斗大数字来自 3 条独立 stat 路径(后端战力/门槛、客户端基础伤害飘字、客户端回放 sim `LobbyBattleReplayModel`),均已同步缩放;详见 cocos 记忆 `battle-number-scale`。实测伤害飘字全部落在 17~333(0 个≥1000),大招从 2661/3335 → 266/333。

### 2026-07-08 大厅/战斗友军体型对齐 Nuu

- 纯 Cocos 表现层调优，不涉及后端/接口/SQL/经济。`assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts` 的 `BATTLE_COMBAT_CANVAS_COMPENSATION_BY_ASSET`（大厅挂机演出与战斗友军共用同一友军公式）逐英雄反解补偿系数，使每个英雄渲染高度对齐 Nuu(UR_EVELYN, ≈160px)。
- 反解口径：友军分支 `rendered_px ∝ comp[asset]` 无上限截断，故 `newVal = oldVal × Nuu_px / hero_px`；实测法见记忆 `lobby-hero-size-tuning`（注入阵容 + 冻结骨骼姿势读 `renderData.chunk.vb`）。
- 守卫 `check-battle-stage13w` 的 `BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO` pin 同步校准到当前编队统一档 `0.53`。
