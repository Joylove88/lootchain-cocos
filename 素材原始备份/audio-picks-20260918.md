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

未挂音效、未来可加:页签切换;抽卡召唤影像已有自带 call.mp3;同包 `UI/` 目录还有 33 条与本项目 UI 同源的界面音(TouchOpen/Close、Get_Reward、SummonMyth/Unique/Normal、LevelUp、Win/Lose),可替换现用界面音。
