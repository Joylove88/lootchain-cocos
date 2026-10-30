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
  // 初始 4 英雄(StarterHeroGranter:SR_ABYSS_06 / SR_WITCH_03 / SR_PALADIN_02 / SR_PRIEST_01)
  'spine/hero/npc_1036', 'spine/hero/npc_1028', 'spine/hero/npc_1002', 'spine/hero/npc_21006',
  'ui/hero-roster/card_background/npc_1036', 'ui/hero-roster/card_background/npc_1028',
  'ui/hero-roster/card_background/npc_1002', 'ui/hero-roster/card_background/npc_21006',
  // 初始 4 英雄的野外战斗特效(普攻弹道 / 命中 / 战技,resolveTownHeroFxKit)+ 普攻斩击贴图
  'spine/effect/fx_45008_ailina_fly', 'spine/effect/fx_45008_ailina_hit', 'spine/effect/fx_450101_shengnvpifu_fly', 'spine/effect/fx_450101_shengnvpifu_hit',
  'spine/effect/fx_15004_xe_fxw', 'spine/effect/fx_15004_xe_hit', 'spine/effect/fx_150079_laierde_fly', 'spine/effect/fx_150079_laierde_hit',
  'spine/effect/v2_a47_444', 'spine/effect/v2_a47_217', 'spine/effect/v2_a47_202', 'spine/effect/v2_a47_427',
  'ui/battle/attack', 'spine/hero/act_1036', 'spine/hero/act_1028', 'spine/hero/act_1002', 'spine/hero/act_21006',
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
