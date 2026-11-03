// Web/H5 分层下载规则(2026-10-30 领导反馈「首访 500 多 M 会吓跑用户」,用户拍板开局包到晨风村为止):
// release:web 写 asset-manifest.json 时,按资源路径(resources 包里 uuid → 路径)给每个文件定层级:
//   core  = 首次打开必须下完才进游戏(新玩家从登录到晨风村打完训练场会看到的全部);
//   其余  = 进游戏后后台按 BACKGROUND_ORDER 顺序慢慢下;玩家先去了还没下完的地方,由运行时整块补下 + 加载页拦住。
// 非 resources 的文件(引擎 / 脚本 / main / internal 包)与资源包 config / 合包 JSON 一律 core。
// CORE_EXTRA_FILE:用新账号实跑开局流程记录下来的实际加载路径(tools/qa/record_core_assets.py 生成),补规则漏掉的。

export const CORE_PREFIXES = [
  // 启动 / 登录
  'login-bg', 'ui/boot', 'ui/login',
  // 大厅 / 跑图 HUD / 终端 / 共用组件 / 引导
  // ui/town 只取 HUD / 终端 / 邮件;主城建筑图(神殿 / 工坊 / 商行…)随主城的进图加载门下载
  'ui/common', 'ui/glass', 'ui/town/hud', 'ui/town/terminal', 'ui/town/mail', 'ui/lobby', 'ui/guide',
  // 晨风村(地图素材、动效贴图、鸟瞰底图、地图页图标、NPC、传送阵、世界地图)
  'ui/world/vil3', 'ui/world/vil2', 'ui/world/fx', 'ui/world/overview/ov_village', 'ui/world/mapui',
  'ui/world/ground_village3', 'ui/world/npc_', 'ui/world/portrait_chief', 'ui/world/waypoint', 'ui/world/fx_rune_ring',
  'ui/world/city_board', 'ui/world/ui_bounty_paper', 'ui/world/map_world1',
  // 野外兴趣点素材(docs/54:石碑 / 草药 / 矿脉 / 隐藏点,晨风村就有)
  'ui/world/poi',
  // 进化抉择卡面图案(docs/58 §10,Lv.2 就弹)
  'ui/evolution',
  // 序幕「神庭陨落」视频(docs/60,新号选完主角后播,1080p30 约 12.9MB)+ 对话头像在 ui/protagonist
  'video/prologue',
  // 主角野外骨骼(docs/60,永夜龙骑底换皮,男女两套:建角前不知道性别,两套都进开局包)+ 借用的永夜龙骑弹道 / 命中 / 战技 / 大招特效
  'spine/hero/protag_', 'spine/effect/fx_350131_jialulupifu_fly', 'spine/effect/fx_350131_jialulupifu_hit',
  'spine/effect/v2_a47_014', 'spine/effect/hu_085',
  // 契约之选候选 6 名 R(docs/58 §9:新号不再送 4 名 SR,觉醒后 3 选 1 R;6 名都要在开局包,候选按账号随机):
  // 战斗骨骼 + 名册立绘(契约卡)+ 野外弹道 / 命中 / 战技 / 大招特效(LobbyTownRenderer.partyPackPrefixesOf 实测)
  'spine/hero/act_1001', 'spine/hero/act_1012', 'spine/hero/act_1004', 'spine/hero/act_1008', 'spine/hero/act_1016', 'spine/hero/act_1003',
  'ui/hero/roster/R_',
  'spine/effect/fx_240019_haerbie_fly', 'spine/effect/fx_240019_haerbie_hit', 'spine/effect/v2_a47_004', 'spine/effect/hu_014',
  'spine/effect/fx_45013_yingshu_fly', 'spine/effect/fx_45013_yingshu_hit', 'spine/effect/v2_a47_391', 'spine/effect/hu_050',
  'spine/effect/fx_450141_miaomokepifu_fly', 'spine/effect/fx_450141_miaomokepifu_hit', 'spine/effect/v2_a47_073', 'spine/effect/hu_073',
  'spine/effect/fx_25002_dutengnv_fly', 'spine/effect/fx_25002_dutengnv_hit', 'spine/effect/v2_a47_125', 'spine/effect/hu_035',
  'spine/effect/fx_35005_kuangliechangmao_toushewu', 'spine/effect/fx_35005_kuangliechangmao_hit', 'spine/effect/v2_a47_257', 'spine/effect/hu_063',
  'spine/effect/fx_650011_zuozhupifu_fly', 'spine/effect/fx_650011_zuozhupifu_hit', 'spine/effect/v2_a47_188', 'spine/effect/hu_028',
  'ui/battle/attack',
  // 风 / 水着色器、通用读取态光环(UiKit mountKitLoading)、公用面板底 / 页签 / 分区徽记 / 队伍头像
  'effects/', 'spine/effect/v2_a49_153',
  'ui/crystal/ai/inner_panel_bg', 'ui/crystal/ai/tab_on', 'ui/crystal/ai/tab_off', 'ui/crystal/ai/section_emblem',
  'ui/hero/ai/refine_panel_bg', 'ui/hero/ai/avatar',
  // 训练场幼鼠
  'spine/monster/mini_rat', 'monster/mini_rat',
  // 音效 + 大厅背景音乐;启动就读的大厅海报(不在 ui/ 下)
  'audio/sfx', 'audio/ui', 'audio/bgm/bgm_lobby', 'lobby/lobby_bg_poster',
  // 村里 HUD 直接能打开、没有加载门的弹窗:商店 / 任务 / 个人资料 / 主角 / 背包 / 装备图标
  'ui/shop', 'ui/mission', 'ui/profile', 'ui/protagonist', 'ui/bag', 'ui/equip',
  // UiRefKit 通用金框 / 页签 / 关闭钮(村里各弹窗都用)
  'ui/formation',
];

// 后台下载顺序(越靠前越先下):玩家最可能的下一步。没列到的放最后,按文件名。
export const BACKGROUND_ORDER = [
  // 出村:村外林地 + 林地怪
  'ui/world/woods3', 'ui/world/ground_woods3', 'ui/world/overview/ov_woods',
  'spine/monster/small_spider', 'spine/monster/medium_dog', 'spine/monster/medium_bear', 'monster/',
  // 村里剧情会带去的功能页:召唤(祭司)/ 英雄养成 + 锻造(铁匠)/ 背包任务商店
  'ui/gacha', 'spine/gacha', 'ui/hero', 'ui/hero-detail', 'ui/hero-roster', 'ui/forge', 'ui/equip', 'ui/bag', 'ui/shop', 'ui/mission',
  // 战斗界面 / 音乐
  'ui/battle', 'audio/',
  // 主城、其余地图、玩法页
  'ui/world/', 'ui/raid', 'ui/crystal', 'ui/guard', 'ui/daily', 'ui/codex', 'ui/formation', 'ui/profile', 'ui/adventure',
  // 其余英雄 / 怪物骨骼,最后是技能特效
  'spine/hero/', 'spine/monster/', 'ui/', 'spine/effect/',
];

export const CORE_EXTRA_FILE = 'scripts/web-pack-core-extra.json';
