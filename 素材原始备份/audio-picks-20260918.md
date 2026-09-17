# 音效选用清单(2026-09-18,来源:D:\骨骼动画素材\音效\游戏动画音效全集)

原始文件备份:`素材原始备份/audio-pack-picks-20260918/`;替换前的占位音源:`素材原始备份/audio-placeholder-20260918/`。
加工:裁剪(尾 80ms 淡出)、RMS 统一(界面 -24 / 通用 -19 / 打击 -17 / 结算 -16 dBFS,峰值封顶 -1 dB)、44.1kHz 单声道 16bit WAV。
替换方法:同名覆盖 `assets/resources/audio/...` 下的 wav 即可,不用改代码。

| 分组 | 文件 | 选用素材 | 触发点 | 听感 |
|---|---|---|---|---|
| 界面 | ui_click | 鼠标点击1(冰峰王座) | 按钮点击 | 轻脆短击 |
| 界面 | ui_error | 鼠标点击错误提示(冰峰王座) | 领取/升级/召唤/强化失败 | 低沉否定音 |
| 界面 | panel_open | 打开人物特性窗口 | 从大厅进任一功能页 | 羊皮纸翻开感 |
| 界面 | panel_close | 关闭人物特性窗口 | 功能页返回大厅 | 合上 |
| 界面 | coin | 硬币落地2 | 金币获得/HUD 金币 | 短促金属币声 |
| 界面 | reward_claim | 光魔法＋铃铛(裁 1.8s) | 任务/邮件/图鉴英雄激活领奖 | 铃铛光感 |
| 界面 | level_up | 升级声(裁 2.6s) | 英雄升级/升星/觉醒成功 | 上扬旋律 |
| 界面 | chest_open | 开东西声音 + 光魔法＋铃铛 叠层 | 图鉴里程碑宝箱 | 开锁 + 光 |
| 界面 | forge_success | 明亮的金属声(裁 1.6s) | 强化/合成成功 | 铁砧回响 |
| 界面 | gacha_rare | 人声合唱-神圣庄重-有乐器(裁 4.5s) | 抽卡结果含 SSR/UR | 哥特圣咏 |
| 界面 | gacha_common | 小型光魔法 | 抽卡结果无 SSR/UR | 微光 |
| 守卫 | summon | 魔法释放zth(裁 1.3s) | 召唤英雄上场 | 传送魔法 |
| 守卫 | merge | 上升分解和旋式(裁 1.6s) | 英雄合成升阶 | 上行琶音 |
| 守卫 | crystal_hit | 尖锐明亮类击中(裁 0.85s) | 矿晶受击 | 冰晶碎响 |
| 守卫 | hit | 打在身上1(裁 0.45s) | 怪物受击(高频) | 闷肉击 |
| 守卫 | skill | 浑厚短促的魔法激励 | 技能释放 | 低频魔法爆发 |
| 守卫 | wave_start | 军鼓滚奏1(裁 1.1s) | 新一波开始 | 军鼓滚奏 |
| 守卫 | victory | 军鼓-铜管-胜利(裁 4.3s) | 守卫战胜利 | 铜管凯歌 |
| 守卫 | defeat | 严重-渐强的锣(裁 3.4s) | 守卫战失败 | 渐强低锣 |
| 战斗预演 | battle_start_stinger | 严重事件-短-鼓和锣(裁 3.0s) | 开战 | 鼓+锣 |
| 战斗预演 | result_win / result_lose | 同 victory / defeat | 结算 | 同上 |
| 战斗预演 | hero_basic_01 | 攻击2-WQ(裁 0.85s) | 近战普攻 | 挥砍击中 |
| 战斗预演 | ranged_01 | 弓弩类发射(裁 0.65s) | 远程普攻 | 弓弦 |
| 战斗预演 | hit_light_01 | 打在身上2(裁 0.5s) | 受击 | 闷肉击 |
| 战斗预演 | hero_skill_01 | 带魔法的连斩zth(裁 2.5s) | 技能 | 魔法连斩 |
| 战斗预演 | heal_cast_01 | 治疗法术zth(裁 2.0s) | 治疗 | 治愈光 |
| 战斗预演 | buff_apply_01 | 吟唱激励zth(裁 1.35s) | 增益 | 吟唱 |

## 背景音乐(2026-09-18,来源:D:\骨骼动画素材\C1812音效\Data\Sound\BGM)

同一 C1812 包里 29 首 BGM 全部量过时长/响度/循环接缝(首尾 50ms 能量差)。选用:

| 文件 | 选用 | 触发点 | 依据 |
|---|---|---|---|
| `audio/bgm/bgm_lobby.mp3` | BGM_World(120s) | 大厅及所有功能页 | 接缝 0.0 dB 可无缝循环;包作者自带的 LobbyTest 与它是同一文件 |
| `audio/bgm/bgm_battle.mp3` | BGM_Battle_01(59s) | 进入战斗视图(守卫战/时间线战斗),回大厅切回 | 接缝 0.3 dB,能量最稳的战斗曲之一 |

加工:单声道 128kbps MP3(LAME 带无缝信息),峰值压到 -1 dB 内;旧的程序合成 `bgm_lobby.wav`、`battle/bgm/battle_loop_01.wav` 已删(备份在 audio-placeholder-20260918)。
其他备选:BGM_Town(城镇,末尾渐弱不适合硬循环)、BGM_Adventure(首尾渐弱 65s)、Card_BGM=BGM_Battle_06(平缓上扬,可做抽卡页)、BGM_Loading=BGM_Survivor(76s 末尾淡出)。

## 守卫战普攻音(2026-09-18)

守卫战里每次普攻发射时播(`audio/sfx/atk/`,裁 1.2s、RMS -18,代码里再压到 0.55 倍):SSR/UR 用 C1812 包 `FX/Source` 里本角色自带的攻击音,R/SR 按职业兜底。

| 键 | 素材 | 用于 |
|---|---|---|
| hero_ssr_kane | 193_Ishmael_Atk_a_v2 | 白银圣枪 |
| hero_ssr_livia | 210_Carmilla_Atk_a_v3 | 夜烬女王 |
| hero_ssr_michael | 410_HeyrelS01_Atk_a_v1 | 圣光审判者 |
| hero_ssr_ron | 356_Eulenspigel_Atk_b_v1 | 灰烬猎手 |
| hero_ur_arthas | 388_IshmaelA_Atk_a_v1 | 永夜龙骑 |
| hero_ur_atlas | 289_Lucrecia_Atk_a_v1 | 圣铠壁垒 |
| hero_ur_aurelia | 157_Belladonna_Atk_a_v1 | 苍翎神射 |
| hero_ur_evelyn | 096_Nuu_Atk_a_v1 | 深渊魔女 |
| hero_ur_nyx | 117_Sphinx_Atk | 影刃女皇 |
| hero_ur_seraphina | 318_LucienA_Atk_a_v1 | 晨星圣女 |
| class_melee | 攻击2-WQ(通用包) | 战士/坦克/刺客 |
| class_ranged | 弓弩类发射-mcx(通用包) | 射手 |
| class_mage | 小魔法音效1-mcx(通用包) | 法师 |
| class_support | 小型光魔法-xys(通用包) | 辅助 |

## 守卫战英雄大招音(2026-09-18,来源:通用音效包 技能音效 目录)

按大招名/特效元素挑,`audio/sfx/skill/hero_<code>.wav`,裁 2.2s、RMS -17,施放事件时播;未知英雄回退通用 `skill`。

| 英雄 | 大招 | 素材 |
|---|---|---|
| UR_NYX 影刃女皇 | 血影绞杀 | 17魔法灵力类/吸血魔法 |
| SSR_RON 灰烬猎手 | 杀星一闪 | 01金/呼啸声快速击中 |
| SR_ABYSS_06 深渊行者 | 冥狱之环 | 19诅咒类/空旷的群体诅咒魔法 |
| R_SCOUT_03 灰谷斥候 | 血镰绝影 | 17魔法灵力类/带诅咒的剑术 |
| UR_EVELYN 深渊魔女 | 冰狱湮灭 | 13冰/冰的魔法释放 |
| SSR_LIVIA 夜烬女王 | 焚世之焰 | 04火/火焰喷发 |
| SR_WITCH_03 契约魔女 | 朔夜降临 | 19诅咒类/诡异的空间感类似诅咒的魔法 |
| R_CULT_05 低语教徒 | 暗蚀诅咒 | 15毒/毒气回旋射出 |
| UR_AURELIA 苍翎神射 | 翠翎风暴 | 07风类/小型飓风 |
| SR_SNIPER_05 峡谷狙击手 | 狂裂爆矢 | 10爆炸/爆炸-大-短促 |
| R_RANGER_06 荒原游侠 | 猎鹰降临 | 16召唤类/魔法释放－鸟的嘶叫 |
| UR_ARTHAS 永夜龙骑 | 裂空龙斩 | 04火/火特技吼声 |
| SSR_MICHAEL 圣光审判者 | 雷霆裁决 | 06雷电/打雷般低沉的雷电魔法 |
| SSR_KANE 白银圣枪 | 圣枪穿刺 | 08光/带有光的穿击1 |
| SR_BLADE_04 断刃佣兵 | 旋刃风暴 | 技能击中类效果/旋转击中 |
| R_PATROL_01 王国巡逻兵 | 誓约结界 | 01金/剑气类法术 |
| UR_ATLAS 圣铠壁垒 | 天启旋盾 | 12其他类/魔法盾释放 |
| SR_PALADIN_02 见习圣骑士 | 圣纹壁垒 | 08光/光魔法、神圣感 |
| R_GUARD_07 城门卫兵 | 盾锋回斩 | 冷兵器/击中-与盾相碰撞2-较亮 |
| UR_SERAPHINA 晨星圣女 | 月华圣辉 | 18治愈系/佛光普照 |
| SR_PRIEST_01 银色祭司 | 圣愈祷言 | 18治愈系/治愈系的光感魔法 |
| R_ACOLY_02 礼拜堂侍僧 | 微光庇护 | 18治愈系/美好之光 |

未挂音效、未来可加:页签切换;抽卡召唤影像已有自带 call.mp3;同包 `UI/` 目录还有 33 条与本项目 UI 同源的界面音(TouchOpen/Close、Get_Reward、SummonMyth/Unique/Normal、LevelUp、Win/Lose),可替换现用界面音。
