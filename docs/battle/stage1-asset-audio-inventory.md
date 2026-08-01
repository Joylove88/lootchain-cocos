# Stage 1 战斗 UI 与音效候选清单

更新时间：2026-06-17

本清单来自产品、UI、开发和测试分角色只读扫描。第 1 阶段只记录候选，不复制、不导入、不改 meta、不接入运行时。

## 扫描范围

- Cocos 现有资源：`D:\project\lootchain-cocos\assets\resources`
- 外部 UI 素材：`C:\Users\axian\Desktop\C1812-1`
- 外部音效素材：`C:\Users\axian\Desktop\C1812音效`

音效库统计：`C:\Users\axian\Desktop\C1812音效` 共 `1574` 个音频，其中 `BGM 29`、`FX 438`、`UI 33`、`VOICE 1074`。Cocos 当前 `assets/resources` 下发现 `5` 个音频。

## 当前 Cocos 可直接复用的 UI

| 路径 | 尺寸 | 用途建议 | 第一阶段 |
|---|---:|---|---|
| `D:\project\lootchain-cocos\assets\resources\ui\battle\battle_scene_cathedral.png` | 1672x941 | 主战斗背景，横向哥特战场 | 记录，可作为后续默认背景 |
| `D:\project\lootchain-cocos\assets\resources\ui\battle\c1812\hp_bar_frame.png` | 413x20 | 普通单位血条框 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\battle\c1812\hp_bar_fill.png` | 396x16 | 普通单位血条填充 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\battle\c1812\skill_frame.png` | 58x79 | 技能框/技能槽 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\battle\c1812\skill_frame_active.png` | 66x87 | 技能可释放/选中高亮 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\battle\c1812\banner_victory.png` | 155x343 | 胜利结算装饰 | 记录，后续确认布局 |
| `D:\project\lootchain-cocos\assets\resources\ui\battle\c1812\banner_defeat.png` | 155x343 | 失败结算装饰 | 记录，后续确认布局 |
| `D:\project\lootchain-cocos\assets\resources\ui\common\c1812\button_primary.png` | 240x84 | 主按钮 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\common\c1812\button_danger.png` | 213x79 | 退出/失败态按钮 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\common\c1812\modal_frame.png` | 248x440 | 暂停/结算弹框 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\common\c1812\item_slot.png` | 96x96 | 技能槽、Buff 槽、掉落槽 | 记录 |
| `D:\project\lootchain-cocos\assets\resources\ui\common\c1812\title_banner.png` | 410x86 | 标题条/战斗提示条 | 记录 |

## 外部 C1812 UI 候选

| 路径 | 尺寸 | 用途建议 | 第一阶段 |
|---|---:|---|---|
| `C:\Users\axian\Desktop\C1812-1\素材切图\BG_customsshed_001.png` | 1024x709 | 备选战斗背景/地台俯视图 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Assets\Data\Prefab\UI\Popup\JointBossWar\BG_BattelContents_Map.png` | 1400x1800 | Boss/地下场景背景 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Assets\Data\HexMap\Tiles\RGBA\HL2_basetile_013.png` | 208x213 | 地台/棋盘格底座 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Assets\Data\HexMap\Tiles\RGBA\HL2_wall_001.png` | 264x208 | 场景遮挡物/废墟边界 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Boss_Gauge_Frame.png` | 512x54 | Boss 血条框 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Boss_Gauge_Bar.png` | 494x36 | Boss 血条填充 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材\Assets\Data\Prefab\UI\Popup\JointBossWar\Bar_Totalwar.png` | 724x80 | Boss/总战进度条 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\gauge_bg.png` | 413x20 | 普通血条备用 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\gauge_bar.png` | 396x16 | 普通血条填充备用 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\battle_btn.png` | 58x79 | 技能框备用 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\battle_btn_highlight.png` | 66x87 | 技能高亮备用 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Boder_Select_Skill.png` | 63x63 | 技能选中描边/目标选中框 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Buff_*.png` | 34 个，32x32 | Buff/Debuff 图标库 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Boss_Portrait_Frame.png` | 80x74 | Boss 头像框 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\avatarframe_*.png` | 135 个 | 头像框候选库 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Assets\Data\UI\BattlePortrait\*_battle_portrait.png` | 70 个，1438x392 | 战斗头像/半身横条 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Assets\Data\Font\WD_DamageFont_0.png` | 256x197 | 伤害飘字字体图集 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材\TMP_CombatPowerFont Atlas.png` | 512x512 | 数字/战力字体备用 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材\Assets\Data\Prefab\UI\Popup\Event\Daily\TrumpCardGame\SpeedGame_Victory.png` | 1024x393 | 胜利横幅参考 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材\Assets\Data\Prefab\UI\Popup\Event\Daily\TrumpCardGame\SpeedGame_Defeat.png` | 780x160 | 失败横幅参考 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材\Assets\Data\Prefab\UI\Popup\Result\WD_Result_Dead01.png` | 1024x1024 | 失败结算图集 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\btn_large_yellow.png` | 240x84 | 按钮备选 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\btn_large_red.png` | 280x84 | 危险按钮备选 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\btn_large_green.png` | 240x84 | 确认按钮备选 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\box_white_border.png` | 44x42 | 小边框/选中框 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\Assets\Data\Prefab\UI\Popup\Guild\TotalWar\Popup_Bg_Boss.png` | 564x800 | Boss 弹框/详情底板 | 只记录不接入 |
| `C:\Users\axian\Desktop\C1812-1\素材切图\deco_blood.png` | 264x188 | 伤害/濒死装饰底纹 | 只记录不接入 |

低优先或暂不建议：`Stage1_Back.png`、`TotalWar_BG_Boss_*.png`、`FightClubBG.png`、`blood_splatter1-5.png`、`icon_hp.png` 多数是 4x4 占位或极小块；`sactx-*.png` 多为 Unity/图集导出，除非同时解析 atlas，否则不要当单张 UI 资源使用。

## 外部 C1812 音效候选

| 用途 | 路径 | 格式/时长 | 命名分类建议 | 第一阶段 |
|---|---|---:|---|---|
| 英雄近战普攻 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\001_Ella_Atk_a_v1.wav` | wav / 1.82s | `audio/battle/sfx/attack/hero_basic_01` | 只记录不接入 |
| 轻快普攻 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\013_Xita_Atk_a_v1.wav` | wav / 0.90s | `audio/battle/sfx/attack/hero_light_01` | 只记录不接入 |
| 远程/弓手普攻 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\102_RagamuffinArcher_Atk_a_v1.wav` | wav / 1.30s | `audio/battle/sfx/attack/ranged_01` | 只记录不接入 |
| 怪物近战普攻 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\065_DunkelHund_Atk.wav` | wav / 1.73s | `audio/battle/sfx/attack/enemy_basic_01` | 只记录不接入 |
| 受击候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\169_AnkouBug_atk_a_v1.wav` | wav / 0.87s | `audio/battle/sfx/hit/hit_light_01` | 只记录不接入 |
| 受击候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\253_Eir_Atk_a_v1.wav` | wav / 0.60s | `audio/battle/sfx/hit/hit_tap_01` | 只记录不接入 |
| 暴击候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\044_SphinxA_UltA_a_v3.wav` | wav / 2.12s | `audio/battle/sfx/critical/critical_impact_01` | 只记录不接入 |
| Boss 暴击候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\113_Boss_Omen_Ult_a_v1.wav` | wav / 2.55s | `audio/battle/sfx/critical/boss_critical_01` | 只记录不接入 |
| 治疗候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\024_Miya_fairy01_Skill01_a_v1.wav` | wav / 1.57s | `audio/battle/sfx/heal/heal_cast_01` | 只记录不接入 |
| 治疗候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\254_Eir_Skill01_a_v1.wav` | wav / 1.58s | `audio/battle/sfx/heal/heal_cast_02` | 只记录不接入 |
| Buff 候选 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\047_Sugarplum_Skill01_a_v1.wav` | wav / 1.57s | `audio/battle/sfx/buff/buff_apply_01` | 只记录不接入 |
| Buff UI | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\SkillLevelUp.wav` | wav / 0.90s | `audio/battle/ui/buff_notice_01` | 只记录不接入 |
| 英雄技能 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\002_Ella_Skill01_a_v1.wav` | wav / 2.71s | `audio/battle/sfx/skill/hero_skill_01` | 只记录不接入 |
| 暗色/机械技能 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\050_Ashimov_Skill01_a_v2.wav` | wav / 2.04s | `audio/battle/sfx/skill/hero_skill_02` | 只记录不接入 |
| Boss 短吼 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\111_Boss_Omen_Atk_a_v1.wav` | wav / 1.23s | `audio/battle/sfx/boss/boss_roar_short_01` | 只记录不接入 |
| Boss 长吼 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\FX\Source\313_Boss_Rhamaan_Skill02_a_v1.wav` | wav / 4.48s | `audio/battle/sfx/boss/boss_roar_long_01` | 只记录不接入 |
| 胜利结算 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\002_Win.wav` | wav / 6.60s | `audio/battle/ui/result_win` | 只记录不接入 |
| 失败结算 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\003_Lose.wav` | wav / 6.39s | `audio/battle/ui/result_lose` | 只记录不接入 |
| 按钮 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\Button_Click.wav` | wav / 0.37s | `audio/ui/button_click` | 只记录不接入 |
| 轻触 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\TouchClick.wav` | wav / 0.20s | `audio/ui/touch_click` | 只记录不接入 |
| 战斗开始 | `C:\Users\axian\Desktop\C1812音效\Data\Sound\UI\TouchStart.wav` | wav / 0.78s | `audio/battle/ui/battle_start_stinger` | 只记录不接入 |
| 战斗 BGM | `C:\Users\axian\Desktop\C1812音效\Data\Sound\BGM\BGM_Battle.wav` | wav / 38.79s | `audio/battle/bgm/battle_loop_01` | 只记录不接入 |
| 战斗 BGM | `C:\Users\axian\Desktop\C1812音效\Data\Sound\BGM\BGM_Battle_01.wav` | wav / 59.18s | `audio/battle/bgm/battle_loop_02` | 只记录不接入 |

文件名里没有明确的 `hit/hurt/crit/heal/buff/roar` 资源，所以受击、暴击、治疗、Buff 和 Boss 吼叫均为按命名与时长推断的试听候选，后续必须人工试听确认。

## 当前项目内已有音频

| 路径 | 用途判断 | 第一阶段 |
|---|---|---|
| `D:\project\lootchain-cocos\assets\resources\spine\hero\npc_1001\audio\1001_skill1_1.mp3` | npc_1001 Spine 技能音效 | 只记录 |
| `D:\project\lootchain-cocos\assets\resources\spine\hero\npc_1001\audio\1001_skill2_1.mp3` | npc_1001 Spine 技能音效 | 只记录 |
| `D:\project\lootchain-cocos\assets\resources\spine\hero\npc_1001\audio\1001_skill4_3.mp3` | npc_1001 Spine 技能音效 | 只记录 |
| `D:\project\lootchain-cocos\assets\resources\audio\gacha\call.mp3` | 抽卡音效，不建议战斗复用 | 不接入战斗 |
| `D:\project\lootchain-cocos\assets\resources\login-bg\bgm\12_Orisols- 古魂 音乐组-古魂Orisols世界观设定OST.mp3` | 登录/背景音乐，不建议作为战斗 BGM | 不接入战斗 |

## 后续接入规则

- 所有外部素材先进入候选清单，再做试听/视觉筛选。
- 外部 PNG 进入 Cocos 前必须确认尺寸、裁切方式、九宫格参数、透明通道和 meta。
- 外部音频进入 Cocos 前必须确认音量、时长、循环点、格式、授权和命名。
- 技能与英雄绑定音效优先以英雄配置为准，通用候选只做兜底。
- 不允许为了表现资源新增经济接口或修改战斗奖励规则。

