# Visual Battle Stage 13 Battle Flow Upgrade Plan

更新时间：2026-06-20

## 目标

把当前战斗链路升级成真正像横版 RPG 的完整流程：关卡地图 -> 挑战弹框 -> 布阵 -> 战斗演出 -> 胜利结算。
当前项目已有 Stage 1-12 表现基础设施；本阶段做游戏感升级，严格执行稀有度动画规则、C1812 UI/音效接入和守卫。

## 边界（不变）

- Cocos-only，不回 web-vue。
- 不新增经济写入口；不擅自发奖、扣体力、写进度。
- 战斗预演只复用既有 `POST /api/player/battles/start`；验收不主动 settle。
- 后端如需加怪物/BOSS 骨骼字段，只加配置/只读返回字段，不加经济逻辑。
- `.spine` 源文件归档到 `docs/spine-source-archive`，不留在 `assets/resources/spine`。
- 异步资源回调必须检查 `node.isValid` 与渲染代次。

## 资源扫描结论

- `C:\Users\axian\Desktop\C1812-1`：10238 文件（9755 png），含 150 章节背景、88 按钮、574 frame、258 banner、457 skill、142 boss、496 victory、386 item、109 currency、41 enemy、538 portrait、30 formation。
- `C:\Users\axian\Desktop\C1812音效`：1574 wav。

## 阶段拆分

### Stage 13A 资源导入 + 关卡地图升级
- `BattleStageMapRenderer`：地图背景+虚线路径+关卡节点(已通关/当前/锁定/Boss)+顶部章节标题+左下首通奖励+右下挑战入口。
- 守卫：`check:battle-stage13a`。

### Stage 13B 挑战弹框
- `BattleChallengeDialogRenderer`：暗金哥特弹框，敌方阵容/通关奖励/通关条件/我方阵容/布阵按钮/挑战按钮。
- 守卫：`check:battle-stage13b`。

### Stage 13C 布阵界面战场化
- `BattleFormationSceneRenderer`：左侧战场站位(前中后/上中下，Spine/占位)，右侧英雄列表(职业筛选/头像/稀有度/等级/出战态)，底部总战力/上阵人数，右下挑战按钮。
- 守卫：`check:battle-stage13c`。

### Stage 13D Spine 动画适配层（稀有度规则）
- SSR/UR: run/atk/hit/dead/skill1/skill2/skill3/ult/victory。
- SR/R: run/skill0(普攻)/skill1/skill2/skill4/die/hurt/win_1(回退win_2)。
- `skill*_kz` 在目标区域播放。
- 怪物伪动画：idle/run/attack/hit/dead(缩放/位移/闪白/淡出)。
- 守卫：`check:battle-stage13d`。

### Stage 13E 战斗场景框架 + 行动时间线
- `BattleSceneRenderer`：横版背景、双方分层站位、底部英雄头像卡/血条/能量条、左上暂停/时间/波次、右上倍速、BOSS顶部血条。
- `BattleTimelinePlayer`：移动0.25-0.45s/攻击前摇0.2-0.4s/命中飘字/受击0.2s/返回0.25-0.45s/缓冲0.2s；开场0.5s入场。
- 守卫：`check:battle-stage13e`。

### Stage 13F 特效与飘字层
- `BattleFloatingTextLayer`：普攻(黄/白)、暴击(金大)、治疗(绿+)、护盾/增益(蓝/金)、MISS、BLOCK、死亡淡出，动作事件触发。
- `BattleProjectileLayer`：远程弹道/光束/飞行特效。
- 守卫：`check:battle-stage13f`。

### Stage 13G 音效
- `BattleAudioRuntime`：C1812音效挑选 battle_bgm/click/battle_start/run/basic_attack/skill_cast/hit/heal/buff/dead/victory，动作事件触发，不循环堆叠。
- 守卫：`check:battle-stage13g`。

### Stage 13H 胜利结算
- `BattleResultRenderer`：胜利大标题(金光/翅膀/横幅)、出战英雄头像/状态、获得奖励/战斗经验、返回/战后统计按钮、战场暗色遮罩。
- 守卫：`check:battle-stage13h`。

### Stage 13I 守卫与验收
- 聚合 `check:battle-stage13*`、`check:layout`、`check:preview-freshness`、TypeScript no-emit、`.spine/.spine.meta` 扫描。
- 5 张验收截图：关卡地图/挑战弹框/布阵/战斗中/胜利结算。
- 文档同步：README、current-chat-context、api-contract。

### Stage 13J 开场汇合
- 战斗创建成功后先进入开场汇合窗口：左侧英雄与右侧怪物/BOSS 同时播放 `move/run`，向中场推进。
- 汇合窗口内只显示 `battle_start`，不解析行动 cue，不显示普攻、技能、命中、伤害飘字或辅助飘字。
- 汇合结束后再按延后的 deterministic timeline 播放近战突进、远程弹道、技能、受击、飘字和胜利表现。
- 守卫：`check:battle-stage13j`，并纳入 `check:battle-stage13i`。

### Stage 13K 开场汇合完成态守卫
- 战斗播放中仍走 `refreshPlayback()` 增量刷新，避免每 500ms 重建整页导致 Spine/音频/浮字反复初始化。
- 一旦 `presentationComplete / settling / settlement` 出现，根节点和渲染器都必须退出同场景增量路径，强制完整重绘胜利/结果 UI。
- 验收重点：前置汇合阶段没有伤害飘字；汇合后才出现首次行动；最终显示视觉胜利层，不黑屏。
- 守卫：`check:battle-stage13k`，并纳入 `check:battle-stage13i`。

## 2026-06-20 接管修复口径

- 当前实际战斗表现用 `LOBBY_BATTLE_PRESENTATION_STEP_COUNT = 24`、`LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS = 500`，约 12 秒完成视觉战斗，保证开场、接敌、命中、反击、支援、终结和胜利层都能被截图验收。
- 命中/伤害层只跟随当前 `damage_float` / `hit_float` / 当前命中事件显示，不再用首个伤害事件做常驻兜底。
- 英雄战斗 Spine 有 `spineUuid` 时必须优先 UUID 加载，失败后才回退 resource path；成功应用后销毁敌我双方 fallback silhouette。
- 异步 UI、Spine、音频回调必须用安全 `node.isValid` 防护，避免页面切换后触发空节点崩溃。
- Stage 13I 已纳入 `check:battle-stage13d` 与 `check:battle-stage13g`，分别守卫稀有度动画映射实际接入和战斗音频实际接入。
- Stage 13J 已新增开场汇合守卫，要求 `LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT`、动作/辅助 cue 抑制、`battle_start` 前置事件、延后 combat timeline、双方中场偏移、`move/run` 动画 cue，以及汇合期间伤害/Buff 预览和浮字层抑制同时存在。
- Stage 13K 已新增完成态重绘守卫，要求 `presentationComplete / settling / settlement` 退出增量播放路径，避免视觉胜利结果层被同场景刷新截断成黑屏。

## 模块拆分

- `BattleStageMapRenderer`
- `BattleChallengeDialogRenderer`
- `BattleFormationSceneRenderer`
- `BattleSceneRenderer`（重构现有 preview）
- `BattleUnitSpineRuntime`（强化稀有度规则）
- `BattleTimelinePlayer`
- `BattleFloatingTextLayer`
- `BattleProjectileLayer`
- `BattleResultRenderer`
- `BattleAudioRuntime`

每个模块清晰输入输出，不互相直接读写全局状态；异步回调检查 `node.isValid` 与渲染代次。
