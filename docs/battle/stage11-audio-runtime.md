# 可视化战斗 Stage 11：战斗音频运行时

更新时间：2026-06-17

## 阶段目标

Stage 11 将 Stage 2 已导入的战斗 BGM / SFX 接入 Cocos 战斗页运行时，让 `battle start`、本地表现时间线、技能/辅助 cue 和结算回执拥有对应音频反馈。

本阶段只处理客户端表现，不新增后端接口，不新增 SQL，不新增经济写入口，不改变 start/settle 契约。

## 接入范围

- BGM：`battleBgm` 使用 `audio/battle/bgm/battle_loop_01` 低音量循环。
- 开战提示：创建战斗会话时播放 `battleStart`。
- 普攻/远程/技能/受击：读取 Stage 5/6/7 的 `audioCue`，映射到 `heroBasicAttack`、`rangedAttack`、`heroSkill`、`hitLight`。
- 治疗/Buff：辅助 cue 映射到 `healCast`、`buffApply`。
- 结算：`WIN` 播放 `resultWin`，`LOSE` 播放 `resultLose`。
- 视觉胜利：当前不提交 settlement 的战斗演出完成后，也会用 `visualVictory` 播放一次 `resultWin`，只作为本地表现反馈。
- UI 状态：战斗页显示 `LobbyBattleStage11AudioStatus`，用于验收当前音频计划。

## 边界

- 不新增后端接口。
- 不新增 SQL。
- 不新增经济写入口。
- 不改变 start/settle 契约。
- 不把本地音频播放结果提交给后端。
- 不把视觉胜利音效视为真实结算回执；真实奖励、体力和进度仍必须以后续明确授权的后端结算为准。
- 不用本地音频或时间线决定奖励、体力、主线进度、货币、背包或英雄属性。
- 不开放 EX V1、gacha exchange/reissue、背包 use/sell/batch-use、升星、觉醒、精炼、后台补发、重结算或离线结算。

## 多角色验收

产品验收：

- 战斗页进入后有低音量战斗 BGM，开战、技能、受击和结算有基本反馈。
- 音频状态可被验收，不需要玩家配置复杂开关。

策划验收：

- 当前音频只按表现 cue 匹配，不新增战斗 AI 或权威结算。
- 辅助 cue 优先于动作 cue，动作 cue 优先于时间线事件 cue。

UI 验收：

- `LobbyBattleStage11AudioStatus` 不遮挡单位、技能框、结算回执和底部按钮。
- 极窄屏仍保留核心战斗画面，音频状态只作为轻量提示。

DB 设计验收：

- 本阶段没有表结构、SQL 和后端配置变更。
- 音频资源沿用 Stage 2 已导入资源路径。

开发验收：

- 新增 `LobbyBattleAudioRuntime.ts`，把战斗状态转换为 `BattleAudioRuntimePlan`。
- `LobbyBattlePreviewPanelRenderer` 只负责加载 `AudioClip` 和调用 `AudioSource` 播放。
- 加载或播放失败只记录 warning，不中断战斗 UI。

测试验收：

- `npm.cmd run check:battle-stage11` 必须通过。
- `npm.cmd run check:battle-stage10` 必须继续通过。
- `npm.cmd run check:layout`、`npm.cmd run check:preview` 和定向 TypeScript no-emit 需要通过。

## 验收命令

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage11
npm.cmd run check:layout
npm.cmd run check:preview
git diff --check
```
