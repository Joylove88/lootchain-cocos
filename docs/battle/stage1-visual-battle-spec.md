# Stage 1 可视化战斗规格冻结

更新时间：2026-06-17

本文件冻结后续 10 个阶段中第 1 阶段的产品、策划、UI、DB、开发和测试口径。第 1 阶段只做规格闭环、资源候选记录和守卫校验，不实现运行时战斗、不复制外部素材、不新增数据库写口。

## 阶段目标

- 将现有静态战斗预演升级方向冻结为 **Cocos 可视化自动战斗 V1**。
- 继续以 Cocos-only 为当前玩家端验收路径，不回到 `web-vue`。
- 主线范围沿用年度基座：`MAIN_1_1` 至 `MAIN_25_16`，不开放越界关卡。
- 战斗入口继续只使用既有玩家端接口：
  - `POST /api/player/battles/start`
  - `POST /api/player/battles/{battleNo}/settle`
- Cocos 根据 `battle start` 回执、玩家英雄只读数据、敌方预览和 `serverSeed` 生成本地表现时间轴。
- 结算、奖励、体力、进度、货币、背包和英雄属性仍全部以后端权威回执为准。

## 第一阶段范围

- 冻结战斗场景布局、单位站位、职业行为、动画命名、事件模型、资源命名、音效候选和验收标准。
- 记录 `C:\Users\axian\Desktop\C1812-1`、`C:\Users\axian\Desktop\C1812音效` 和 `D:\project\lootchain-cocos\assets\resources` 的候选资源。
- 增加只读守卫，确认规格文档、候选资源路径和经济红线没有遗漏。
- 更新交接文档，让下一阶段可以直接按规格进入资源导入和战斗运行时开发。

## 非目标

- 不在本阶段实现角色移动、攻击、技能、飘字或结算界面运行时。
- 不复制、导入或改名外部 C1812 素材和音效。
- 不新增战斗模拟服务端接口。
- 不新增持久编队表或保存阵容接口。
- 不新增经济写入口。
- 不新增奖励、体力、进度、货币、背包、英雄属性或战力写入口。
- 不开放重复刷关经验/掉落、扫荡、副本、Boss、排行奖励、任务/成就领奖、体力领取/购买。
- 不开放背包 `use/sell/batch-use`、英雄 `star-up/awaken/refine`、EX V1、USDT、资金池、后台补发或重结算。

## 10 阶段路线

| 阶段 | 名称 | 目标 | 交付边界 |
|---:|---|---|---|
| 1 | 规格冻结 | 冻结战斗 V1 设计、资源候选和守卫 | 文档 + 只读校验 |
| 2 | 资源导入与试听 | 从 C1812 资源库筛选、裁切、导入首批 UI/音效 | 仅表现资源，不改经济 |
| 3 | 数据适配层 | 将 `battle start`、英雄列表、敌方预览合并成表现快照 | 不新增后端接口 |
| 4 | 场景与站位 | 渲染左右队伍、敌方/Boss、血条和基础 HUD | 静态可视化闭环 |
| 5 | 本地时间轴 | 基于 `serverSeed + battleNo + unitSnapshot` 生成确定性表现事件 | 本地表现，不作为发奖依据 |
| 6 | 动作与飘字 | 近战移动、普攻、远程弹道、伤害/受击飘字 | 不提交伤害到服务端 |
| 7 | 技能与辅助 | 播放技能动画、治疗、护盾、Buff/Debuff 表现 | 简化规则，表现优先 |
| 8 | 结算与异常 | start/settle 幂等、断线、返回重进、失败兜底 | 以后端回执结算 |
| 9 | 适配与性能 | 390x340、1280x720、1920x1080、低性能降级 | 不遮挡、不越界 |
| 10 | 全链路验收 | 冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读 | 产品/测试验收 |

## 当前接口与数据来源

### 战斗启动

`POST /api/player/battles/start`

当前 Cocos 只提交：

```json
{
  "stageCode": "MAIN_1_1",
  "heroIds": [1, 2, 3],
  "leaderHeroId": 1,
  "requestId": "client-generated-id"
}
```

返回表现可用字段：

- `battleNo`
- `stageCode`
- `status`
- `serverSeed`
- `lineup`
- `enemyPreview`
- `expireTime`
- `readonlyEconomy`
- `guardrails`

`lineup` 当前包含 `heroId/heroCode/heroName/rarity/level/star/power/leader/protagonist/sourceType`。缺少 `heroClass/spineAsset/skill`，Cocos 后续阶段需要从已加载英雄列表按 `heroId` 合并展示数据。

`enemyPreview` 当前包含 `enemyCode/enemyName/level/power/role`。缺少专用敌方 Spine、技能和音效时，第一版运行时应允许通用敌方模型兜底。

### 战斗结算

`POST /api/player/battles/{battleNo}/settle`

当前 Cocos 只提交：

```json
{
  "requestId": "client-generated-id",
  "result": "WIN",
  "durationSeconds": 52,
  "roundCount": 12,
  "clientChecksum": "presentation-checksum"
}
```

客户端不得提交奖励、掉落、体力、主线进度、货币、背包、英雄属性或战力字段。

## 战斗主流程

1. 冒险详情读取推荐关卡和推荐战力。
2. 玩家进入本地一次性编队，不保存阵容。
3. Cocos 提交 `POST /api/player/battles/start`。
4. 后端校验前置进度、主线范围和阵容战力。
5. Cocos 合并 start 回执、英雄展示数据和敌方预览，生成 `BattlePresentationSnapshot`。
6. Cocos 根据 `serverSeed + battleNo + unitSnapshot` 生成本地表现事件流。
7. 战斗表现播放 45 到 60 秒，包含移动、攻击、技能、飘字、死亡和胜负演出。
8. Cocos 只提交结算最小字段到 `settle`。
9. Cocos 展示后端权威结算回执。
10. Cocos 回读大厅、冒险、英雄和背包，只展示服务端结果。

## 场景布局

- 全屏逻辑战斗页，不使用浮层小卡片承载主战斗。
- 层级顺序：
  1. 背景层：战斗背景、远景、地台。
  2. 单位层：我方、敌方、Boss。
  3. 特效层：弹道、技能、受击、治疗、护盾、地面圈。
  4. 飘字层：伤害、治疗、护盾、Buff、暴击。
  5. HUD 层：血条、技能框、暂停、结算提示。
- 我方在左侧，敌方/Boss 在右侧。
- 前排靠近中线，后排靠近屏幕边缘。
- 战斗区域需要避开底部系统导航、顶部资源栏和结算弹层。

## 队伍站位

5 人队伍默认站位：

| 槽位 | 我方位置 | 敌方镜像 | 推荐职业 |
|---|---|---|---|
| front_1 | 左中前 | 右中前 | tank/warrior |
| front_2 | 左下前 | 右下前 | warrior/assassin |
| back_1 | 左上后 | 右上后 | mage/archer/support |
| back_2 | 左中后 | 右中后 | archer/mage |
| back_3 | 左下后 | 右下后 | support/mage |

职业归类：

- 坦克/战士：前排，优先承受近战。
- 刺客：前排侧翼，技能可突进后排表现。
- 射手/法师：后排，使用远程弹道或范围特效。
- 辅助：后排，优先治疗、护盾或加属性表现。

## 自动战斗规则

- 本地表现事件流必须是确定性的，输入为 `serverSeed + battleNo + unitSnapshot`。
- 表现用 HP、伤害、治疗量可以按等级、战力、职业估算，但不得成为经济权威。
- 第一版目标时长 45 到 60 秒。
- 第一版只支持自动战斗，不做手动技能释放。
- 如果后端返回失败或结算失败，客户端必须显示失败/重试/返回，而不是按本地胜负发奖。
- 重复点击 start/settle、网络失败、返回重进都不能造成重复结算或假奖励。

## 行为设计

### 近战

- 行为：待机 -> 跑向目标 -> 普攻/技能 -> 回位或短暂停顿。
- 目标：优先最近前排；无前排则攻击最近敌人。
- 视觉：近战接触点出现命中闪光和伤害飘字。

### 远程

- 行为：待机 -> 抬手/施法 -> 弹道/瞬发 -> 命中。
- 目标：射手优先低血目标；法师优先 2 到 3 个目标范围表现。
- 视觉：弹道从施法点到目标点，命中后显示伤害或暴击飘字。

### 辅助

- 行为：待机 -> 施法 -> 治疗/护盾/Buff。
- 目标：优先最低血量友方；无治疗目标时弱攻击。
- 视觉：绿色治疗、蓝白护盾、金色增益飘字。

## 动画命名规范

新接入战斗 Spine 必须优先使用 ASCII 小写命名。

必需动画：

- `idle`
- `move`
- `attack_01`
- `skill_01`
- `hit`
- `death`
- `victory`

可选动画：

- `cast`
- `projectile`
- `heal`
- `shield`
- `intro`

旧资源允许通过映射表兜底，但新资源不要依赖中文名、空格名或临时导出名。

## 特效与音效命名规范

推荐资源命名：

- `ui/battle/background/*`
- `ui/battle/hud/*`
- `ui/battle/effect/hit/*`
- `ui/battle/effect/skill/*`
- `audio/battle/bgm/*`
- `audio/battle/sfx/attack/*`
- `audio/battle/sfx/hit/*`
- `audio/battle/sfx/skill/*`
- `audio/battle/sfx/heal/*`
- `audio/battle/sfx/buff/*`
- `audio/battle/ui/*`

第一阶段只记录候选资源，不导入外部音频。

## 战斗事件模型

事件必须按 `seq` 和 `timeMs` 排序。字段建议：

```ts
type BattlePresentationEvent = {
  seq: number;
  timeMs: number;
  type: BattlePresentationEventType;
  source?: string;
  targets?: string[];
  value?: number;
  hpAfter?: number;
  animation?: string;
  effect?: string;
  sfx?: string;
  text?: string;
};
```

事件类型：

- `battle_start`
- `unit_spawn`
- `round_start`
- `action_start`
- `move`
- `attack`
- `projectile`
- `damage`
- `heal`
- `shield`
- `buff_apply`
- `buff_expire`
- `hit_react`
- `unit_death`
- `round_end`
- `battle_end`
- `settlement_submit`
- `settlement_result`
- `error`

事件流只用于 Cocos 表现，不得作为发奖、掉落、体力扣减或主线推进依据。

## DB 与后端边界

第 1 阶段不新增表、不改表、不新增接口。

后续如果需要服务端权威战斗模拟，应另开阶段设计，至少包含：

- 战斗快照结构。
- 服务端模拟结果结构。
- 幂等键与重试策略。
- 事件保存与保留期。
- 作弊防护。
- 与现有 `battle_session/battle_settlement` 的关系。

在未批准前，Cocos 不提交本地伤害、治疗、Buff、胜负推导、奖励和掉落明细。

## UI 与音频资源原则

- UI 素材优先从 `D:\project\lootchain-cocos\assets\resources` 已接入资源中使用。
- 需要新素材时，从 `C:\Users\axian\Desktop\C1812-1` 筛选，先记录、试听、裁切和配置 meta，再接入。
- 音效从 `C:\Users\axian\Desktop\C1812音效` 筛选，先试听确认用途，再导入 Cocos。
- 第一阶段所有外部素材和音效均 **只记录不接入**。

## 多角色验收

产品验收：

- 战斗 V1 范围明确，当前只做主线 PVE 自动战斗。
- 从冒险、编队、战斗、结算、回大厅的目标闭环清楚。
- 非目标和经济红线明确。

策划验收：

- 近战、远程、辅助、Boss/敌方行为有第一版规则。
- 45 到 60 秒节奏、职业站位和目标选择可用于后续实现。
- 后续阶段能逐步扩展技能、Buff、Boss 和表现复杂度。

UI 验收：

- 场景层级、站位、安全区和 HUD 方向明确。
- 已有 C1812 风格 UI 资源优先使用。
- 外部 C1812 候选资源只记录，不在本阶段直接接入。

DB 设计验收：

- 第 1 阶段不新增表、不改表。
- 没有新增经济写入口。
- 后续服务端权威战斗模拟必须单独设计并审批。

开发验收：

- 后续实现可以从现有 `battle start/settle` 接口和 Cocos 本地表现时间轴切入。
- 动画名、事件类型、资源命名有明确约束。
- 守卫脚本可复跑，防止规格遗漏。

测试验收：

- 后续实现必须覆盖 `390x340`、`1280x720`、`1920x1080`。
- 必须覆盖战力不足、锁定关、越界关、空阵容、重复点击、网络失败、返回重进。
- 必须确认不会产生客户端伪造奖励或重复结算。

## 阶段完成标准

- `docs/battle/stage1-visual-battle-spec.md` 存在并包含上述规格。
- `docs/battle/stage1-asset-audio-inventory.md` 存在并记录 C1812 UI 与音效候选。
- `npm.cmd run check:battle-stage1` 通过。
- `npm.cmd run check:layout` 通过。
- `git diff --check` 通过，允许已有 LF/CRLF 提示。
- 如本机 Cocos Preview 未启动，`check:preview` 可记录为环境缺口，不能宣称视觉运行时已验收。
