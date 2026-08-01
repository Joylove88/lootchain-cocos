# Stage 2 战斗资源导入与技术试听

更新时间：2026-06-17

本阶段目标是把可视化战斗 V1 的首批通用表现资源导入 Cocos，形成后续场景、站位、时间轴和动作阶段可直接引用的资源基座。本阶段仍不实现运行时战斗动画，不新增后端接口，不新增经济写入口。

## 阶段边界

- 只导入表现资源：战斗 UI、Buff 图标、技能/目标框、血纹装饰、通用 BGM 和通用 SFX。
- 不接入运行时播放逻辑。
- 不接入战斗模拟、伤害结算、胜负判定或奖励发放。
- 不改 `POST /api/player/battles/start` 和 `POST /api/player/battles/{battleNo}/settle` 契约。
- 不复制未列入白名单的外部素材。
- 不开放 EX V1、背包 `use/sell/batch-use`、英雄 `star-up/awaken/refine`、补发、重结算或其它经济写入口。

## 导入脚本

可复跑导入命令：

```powershell
cd D:\project\lootchain-cocos
node .\scripts\import-battle-stage2-assets.mjs
```

导入脚本只处理固定白名单，目标路径在 `assets/resources` 内，外部来源限制为：

- `C:\Users\axian\Desktop\C1812-1`
- `C:\Users\axian\Desktop\C1812音效`

脚本会为新资源生成 Cocos `.meta`，已有 `.meta` 不会覆盖。

## 首批 UI 资源

| 目标路径 | 来源 | 用途 | meta 口径 |
|---|---|---|---|
| `assets/resources/ui/battle/c1812/boss_gauge_frame.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Boss_Gauge_Frame.png` | Boss 血条框 | 横向九宫格，左右 24 |
| `assets/resources/ui/battle/c1812/boss_gauge_bar.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Boss_Gauge_Bar.png` | Boss 血条填充 | 固定图，后续用 filled 模式 |
| `assets/resources/ui/battle/c1812/skill_target_frame.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Boder_Select_Skill.png` | 技能选中/目标锁定框 | 固定图 |
| `assets/resources/ui/battle/c1812/blood_deco.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\deco_blood.png` | 受击/地面冲击装饰候选 | 固定图 |
| `assets/resources/ui/battle/c1812/buff_attack_up.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Buff_AtkUp.png` | 攻击增益 Buff | 固定 32x32 |
| `assets/resources/ui/battle/c1812/buff_defense_down.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Buff_DefDown.png` | 防御降低 Debuff | 固定 32x32 |
| `assets/resources/ui/battle/c1812/buff_shield.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Buff_Shield.png` | 护盾 Buff | 固定 32x32 |
| `assets/resources/ui/battle/c1812/buff_stun.png` | `C:\Users\axian\Desktop\C1812-1\素材切图\Buff_Stun.png` | 眩晕 Debuff | 固定 32x32 |

## 首批音频资源

| 目标路径 | 来源 | 用途 | 技术试听口径 |
|---|---|---|---|
| `assets/resources/audio/battle/bgm/battle_loop_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\BGM\BGM_Battle.wav` | 战斗 BGM | 时长约 38.79s |
| `assets/resources/audio/battle/sfx/attack/hero_basic_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\001_Ella_Atk_a_v1.wav` | 英雄近战普攻 | 时长约 1.82s |
| `assets/resources/audio/battle/sfx/attack/ranged_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\102_RagamuffinArcher_Atk_a_v1.wav` | 远程普攻 | 时长约 1.30s |
| `assets/resources/audio/battle/sfx/hit/hit_light_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\169_AnkouBug_atk_a_v1.wav` | 轻受击候选 | 时长约 0.87s |
| `assets/resources/audio/battle/sfx/skill/hero_skill_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\002_Ella_Skill01_a_v1.wav` | 英雄技能候选 | 时长约 2.71s |
| `assets/resources/audio/battle/sfx/heal/heal_cast_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\024_Miya_fairy01_Skill01_a_v1.wav` | 治疗技能候选 | 时长约 1.57s |
| `assets/resources/audio/battle/sfx/buff/buff_apply_01.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\047_Sugarplum_Skill01_a_v1.wav` | Buff 施加候选 | 时长约 1.57s |
| `assets/resources/audio/battle/ui/result_win.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\002_Win.wav` | 胜利结算 | 时长约 6.60s |
| `assets/resources/audio/battle/ui/result_lose.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\003_Lose.wav` | 失败结算 | 时长约 6.39s |
| `assets/resources/audio/battle/ui/battle_start_stinger.wav` | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\TouchStart.wav` | 战斗开始提示 | 时长约 0.78s |

## 技术试听结论

- 本阶段使用 `ffprobe` 做技术试听：确认音频可解析、时长落在候选清单预期范围内、不是空文件。
- 主观听感仍需要后续 Preview 或编辑器内人工试听确认。
- `hit_light_01`、`heal_cast_01`、`buff_apply_01` 仍是按命名与时长推断的候选，后续运行时接入前需要听感复核。
- `hit_light_01` 的源文件名是 `169_AnkouBug_atk_a_v1.wav`，更像攻击音，后续如果试听不符合受击反馈，应改为敌方虫类攻击音候选。
- `battle_loop_01.wav` 当前只确认可解析和时长合适，循环点未知，正式运行时需要确认循环是否突兀。
- `result_win.wav` 与 `result_lose.wav` 均超过 6 秒，只适合作结算段落音，不适合作短按钮或短反馈。
- 部分 SFX 峰值接近 0 dB，后续接入运行时前需要做音量层级和归一化检查。

## UI 复核结论

- `boss_gauge_frame.png`、`boss_gauge_bar.png`、`skill_target_frame.png`、`buff_attack_up.png`、`buff_defense_down.png` 均与目标用途匹配。
- `boss_gauge_frame.png` 当前左右九宫格为 `24/24`，后续在 390x340、1280x720、1920x1080 下需要检查端帽是否被拉坏；若明显变形，调到 `32` 至 `40` 或改为固定宽缩放。
- `skill_target_frame.png` 来源 `Boder_Select_Skill.png` 存在拼写错误，目标命名已避免沿用源文件拼写。
- `blood_deco.png` 视觉更像金色冲击/地面爆发装饰，不像真实血迹；后续运行时如果作为命中特效接入，建议考虑改名为 `hit_burst_deco` 或移动到 `ui/battle/effect/hit/`。
- Buff 图标当前按“攻击增益”和“防御降低”导入；如果后续策划需要表达“造成伤害提升/易伤”，可另评估 `Buff_GiveDmgUp.png` 或 `Buff_TakeDmgUp.png`。

## 验收命令

```powershell
cd D:\project\lootchain-cocos
npm.cmd run check:battle-stage2
npm.cmd run check:layout
npm.cmd run check:preview
git diff --check
```

`check:preview` 需要 Cocos Creator Preview 正在 `localhost:7456` 运行；如果本机未启动 Preview，只能记录为环境缺口，不能宣称运行时视觉验收通过。
