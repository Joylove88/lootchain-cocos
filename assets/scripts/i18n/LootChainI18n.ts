import { sys } from 'cc';

export type LootChainLanguage = 'zh-CN' | 'en-US';

export type LootChainI18nKey =
  | 'common.back'
  | 'language.changed'
  | 'language.current'
  | 'language.english'
  | 'language.simplifiedChinese'
  | 'language.title'
  | 'language.subtitle'
  | 'login.rightRail.language'
  | 'login.rightRail.placeholder'
  | 'lobby.system.friends'
  | 'lobby.system.mail'
  | 'lobby.system.settings'
  | 'lobby.system.menu'
  | 'lobby.system.unopenedDetail'
  | 'settings.title'
  | 'settings.languageRow'
  | 'settings.languageDetail';

const LANGUAGE_STORAGE_KEY = 'lootchain.player.language';
const DEFAULT_LANGUAGE: LootChainLanguage = 'zh-CN';

const LANGUAGE_LABELS: Record<LootChainLanguage, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
};

const DICTIONARY: Record<LootChainLanguage, Record<LootChainI18nKey, string>> = {
  'zh-CN': {
    'common.back': '返回',
    'language.changed': '已切换为{language}。',
    'language.current': '当前语言',
    'language.english': 'English',
    'language.simplifiedChinese': '简体中文',
    'language.title': '语言',
    'language.subtitle': '选择显示语言',
    'login.rightRail.language': '语言',
    'login.rightRail.placeholder': '该入口为登录页占位，当前阶段暂未开放。',
    'lobby.system.friends': '好友',
    'lobby.system.mail': '邮件',
    'lobby.system.settings': '设置',
    'lobby.system.menu': '更多菜单',
    'lobby.system.unopenedDetail': '系统入口暂未开放；当前仅保留本地占位反馈，不读取或写入系统数据。',
    'settings.title': '设置',
    'settings.languageRow': '语言',
    'settings.languageDetail': '选择显示语言',
  },
  'en-US': {
    'common.back': 'Back',
    'language.changed': 'Language set to {language}.',
    'language.current': 'Current language',
    'language.english': 'English',
    'language.simplifiedChinese': 'Simplified Chinese',
    'language.title': 'Language',
    'language.subtitle': 'Choose display language',
    'login.rightRail.language': 'Lang',
    'login.rightRail.placeholder': 'This login entry is a placeholder for the current stage.',
    'lobby.system.friends': 'Friends',
    'lobby.system.mail': 'Mail',
    'lobby.system.settings': 'Settings',
    'lobby.system.menu': 'More',
    'lobby.system.unopenedDetail': 'This system entry is not open yet. It only shows local placeholder feedback.',
    'settings.title': 'Settings',
    'settings.languageRow': 'Language',
    'settings.languageDetail': 'Choose display language',
  },
};

type Interpolation = Record<string, string | number>;

const STATIC_TEXT_TRANSLATIONS: Partial<Record<LootChainLanguage, Record<string, string>>> = {
  'en-US': {
    '预言': 'Lang',
    '客服': 'Support',
    '公告': 'Notice',
    '修复': 'Repair',
    '账号登录': 'Account Login',
    '等待圣契召唤。': 'Waiting for covenant summons.',
    '使用测试账号进入 LootChain 当前 Cocos 阶段': 'Use a test account to enter the current Cocos stage',
    '账号 / 邮箱': 'Account / Email',
    '密码': 'Password',
    '进入游戏': 'Enter Game',
    '返回登录': 'Back',
    '当前阶段只接入 dev-login；账号为数字时作为 User ID。': 'Current stage only uses dev-login; numeric account is treated as User ID.',
    '其他登录方式': 'Other Login Methods',
    '第三方登录暂未开放。': 'Third-party login is not open yet.',
    '我已阅读并同意《用户协议》和《隐私政策》': 'I have read and agree to the User Agreement and Privacy Policy',
    '该入口为登录页占位，当前阶段暂未开放。': 'This login entry is a placeholder for the current stage.',
    '请求中...': 'Requesting...',
    'Please accept the user agreement and privacy policy first.': 'Please accept the user agreement and privacy policy first.',
    '资源加载中': 'Loading Resources',
    '重试加载': 'Retry',
    '好友': 'Friends',
    '邮件': 'Mail',
    '设置': 'Settings',
    '更多菜单': 'More',
    '语言': 'Language',
    '当前语言': 'Current language',
    '选择显示语言': 'Choose display language',
    '简体中文': 'Simplified Chinese',
    'English': 'English',
    '返回': 'Back',
    '全部': 'All',
    '英雄': 'Heroes',
    '背包': 'Bag',
    '契约': 'Contract',
    '图鉴': 'Codex',
    '任务': 'Quests',
    '锻造': 'Forge',
    '商店': 'Shop',
    '召唤': 'Summon',
    '主线': 'Main',
    '深渊爬塔': 'Abyss Tower',
    '编队': 'Formation',
    '详情': 'Details',
    '只读': 'Read Only',
    '刷新': 'Refresh',
    '已同步': 'Synced',
    '拥有': 'Owned',
    '战力': 'Power',
    '等级': 'Level',
    '升级': 'Level Up',
    '升级中': 'Leveling',
    '详情页可升级': 'Level in Details',
    '查看详情': 'Details',
    '限定召唤': 'Limited Summon',
    '普通召唤': 'Normal Summon',
    '光暗召唤': 'Light/Dark Summon',
    '单次召唤': 'Single Summon',
    '十连召唤': 'Ten Summons',
    '召唤1次': 'Summon 1',
    '召唤10次': 'Summon 10',
    '召唤结果': 'Summon Result',
    '返回召唤': 'Back to Summon',
    '兑换未开放': 'Exchange Closed',
    '补发未开放': 'Reissue Closed',
    '概率提升预览': 'Rate Up Preview',
    '卡池详情': 'Pool Details',
    '召唤记录': 'Summon Logs',
    '背包只读': 'Bag Read Only',
    '使用/出售关闭': 'Use/Sell Disabled',
    '道具': 'Items',
    '碎片': 'Fragments',
    '英雄碎片': 'Hero Fragments',
    '装备': 'Equipment',
    '材料': 'Materials',
    '消耗品': 'Consumables',
    '普通': 'Normal',
    '坦克': 'Tank',
    '近战': 'Melee',
    '远程': 'Ranged',
    '物理': 'Physical',
    '法术': 'Magic',
    '职业': 'Class',
    '阵营': 'Faction',
    '品质': 'Rarity',
    '星级': 'Stars',
    '请选择语言': 'Choose Language',
    '点击空白关闭': 'Tap outside to close',
    '该道具不在当前背包列表中。': 'This item is not in the current bag list.',
    '该主线关卡暂不可选，请刷新爬塔面板。': 'This main stage is not selectable. Refresh the adventure panel.',
    '该英雄当前不可查看详情。': 'This hero cannot be opened right now.',
    '该英雄当前不可上阵。': 'This hero cannot join the formation right now.',
    '主角当前固定为队长，不能从本次阵容移除。': 'The protagonist is fixed as leader and cannot be removed.',
    '正在读取召唤卡池配置。': 'Loading summon pool configuration.',
    '该卡池配置不存在，请刷新召唤页。': 'This pool configuration is missing. Refresh the summon page.',
    '当前没有可读取的召唤卡池。': 'No summon pools are available.',
    '当前卡池缺少真实 poolCode，无法召唤。': 'This pool is missing a real poolCode and cannot summon.',
    '该卡池暂未开放真实抽卡。': 'Real draws are not open for this pool.',
    '召唤请求处理中，请勿重复点击。': 'Summon request is processing. Do not tap repeatedly.',
    '召唤演出为本地 mock：不生成 drawNo、不扣资源、不发英雄。': 'Summon animation is local mock: no drawNo, no cost, no hero grant.',
    '本地结果预览：不扣资源、不发英雄、不写入抽卡记录或保底。': 'Local result preview: no cost, no hero grant, no draw log or pity write.',
    '查看本地 mock 结果：仍不扣资源、不发英雄、不写入抽卡记录或保底。': 'Viewing local mock result: no cost, no hero grant, no draw log or pity write.',
    '已关闭召唤结果，兑换和补发入口仍未开放。': 'Summon result closed; exchange and reissue remain closed.',
    '已返回召唤页；兑换和补发入口仍未开放。': 'Returned to summon page; exchange and reissue remain closed.',
    '正在检查主角色状态...': 'Checking protagonist status...',
    '正在初始化玩家档案...': 'Initializing player profile...',
    '玩家档案初始化完成。': 'Player profile initialized.',
    '玩家档案初始化失败': 'Player profile initialization failed',
    '请先创建你的圣契主角。': 'Create your covenant protagonist first.',
    '攻击形态已默认解锁。': 'Attack form is unlocked by default.',
    '该形态需要通过主线剧情道具解锁。': 'This form requires a main story item to unlock.',
    '主角色创建中，请勿重复提交。': 'Creating protagonist. Do not submit repeatedly.',
    '战斗演出完成，可记录无奖励结果。': 'Battle animation complete. No-reward result can be recorded.',
    '战斗记录完成，奖励未开放。': 'Battle log complete. Rewards are not open.',
    '关卡选择已失效，请重新选择主线关卡。': 'Stage selection expired. Choose a main stage again.',
    '同步主线目标': 'Sync Main Objective',
    '主线状态读取中': 'Loading mainline status',
    '正在回读最近无奖励战斗记录': 'Loading recent no-reward battle record',
    '仅读取大厅状态，不写入资源。': 'Only reading lobby state; no resource writes.',
    '主线目标异常': 'Main objective error',
    '可打开爬塔面板重试，不发起战斗。': 'Open Adventure to retry. No battle will start.',
    '最近记录也读取异常': 'Recent record also failed to load',
    '进入爬塔': 'Enter Adventure',
    '当前仅展示体力数值，不开放购买、领取或消耗入口。': 'Only stamina value is shown. Purchase, claim, and cost entries are closed.',
    '开始主线预演': 'Start Mainline Preview',
    '等待服务器推荐主线目标': 'Waiting for server mainline recommendation',
    '准备英雄队伍后从爬塔面板选择关卡。': 'Prepare a hero team, then choose a stage in Adventure.',
    '主线目标未解锁': 'Main objective locked',
    '只能查看目标，不绕过锁定进入编队。': 'View target only. Locked stages cannot enter formation.',
    '下一步目标': 'Next Objective',
    '打开深渊爬塔选关；战斗胜利后自动结算发奖并推进主线。': 'Opens Abyss Tower stage select. Settlement submits automatically after victory, granting rewards and advancing mainline.',
    '继续爬塔': 'Continue Adventure',
    '最近记录同步中': 'Syncing recent record',
    '最近记录读取异常，可从爬塔面板重试': 'Recent record failed. Retry from Adventure.',
    '尚无战斗记录，先完成一次无奖励预演': 'No battle record yet. Complete one no-reward preview first.',
    '无奖励记录': 'No-Reward Record',
    '只读记录待核验': 'Read-only record pending check',
    '活动、召唤和运营入口将在后续阶段接入；当前只保留大厅本地展示。': 'Events, summon, and operations entries will connect later. Current lobby keeps local display only.',
    '场景玩法入口暂未开放；当前不会跳转到玩法页面，也不会调用玩法或经济接口。': 'Scene gameplay entries are not open. They do not navigate or call gameplay/economy APIs.',
    '挑战副本仍是本地占位；当前不会进入战斗、结算或发放资源。': 'Challenge dungeons are local placeholders. No battle, settlement, or resource grant.',
    '挑战副本暂未开放；当前不会进入战斗、结算或发放资源。': 'Challenge dungeons are not open. No battle, settlement, or resource grant.',
    '底部导航入口暂未开放；当前不会进入养成、商店或其他写入型系统。': 'Bottom navigation is not open. Growth, shop, and other write systems remain closed.',
    '召唤祭坛按后端卡池状态开放真实召唤；当前仅开放 draw，兑换和补发关闭。': 'Summon altar opens real draws by backend pool state. Only draw is open; exchange and reissue stay closed.',
    '主线章节只读展示；当前不会进入战斗或产生进度写入。': 'Mainline chapters are read-only. No battle or progress write.',
    '英雄图鉴只读预览；当前不会进入养成或改变英雄状态。': 'Hero codex is read-only. No growth or hero-state change.',
    '英雄队列展示已开放详情页升级；升星、觉醒仍关闭。': 'Hero roster opens level-up in details. Star-up and awaken remain closed.',
    '背包只读展示道具和来源；当前不会使用、出售或发放任何道具。': 'Bag is read-only and shows items/sources only. No use, sell, or grant.',
    '活动公告只读展示；当前不进入玩法或改变玩家资源。': 'Notices are read-only. No gameplay entry or resource change.',
    '聊天系统暂未开放；当前仅展示本地欢迎语，不连接聊天服务，也不会发送消息。': 'Chat is not open. Local welcome preview only; no chat service or message send.',
    '商店入口暂未开放；当前不会购买、兑换或消耗资源。': 'Shop is not open. No purchase, exchange, or resource cost.',
    '正在读取主线推荐...': 'Loading mainline recommendation...',
    '主线推荐暂不可用，当前不进入战斗。': 'Mainline recommendation unavailable. No battle will start.',
    '等待主线数据': 'Waiting for mainline data',
    '主线地图读取中，请稍候。': 'Loading mainline map. Please wait.',
    '主线地图暂不可用；不会进入战斗或结算。': 'Mainline map unavailable. No battle or settlement.',
    '编队确认': 'Formation Confirm',
    '暂无可进入关卡': 'No available stage',
    '章节': 'Chapter',
    '推荐关卡': 'Recommended Stage',
    '暂无推荐关卡。': 'No recommended stage.',
    '关卡配置预览（当前不发放）': 'Stage config preview (no rewards)',
    '当前阶段不发放奖励；仅展示关卡配置占位': 'Rewards are not granted in this stage; stage config is preview only',
    '可进入本次编队确认与无奖励战斗预演，不保存长期阵容。': 'Formation confirmation and no-reward battle preview are available. Formation is not saved.',
    '等级不足，仅展示关卡预告。': 'Level too low. Stage preview only.',
    '等级不足': 'Level Too Low',
    '最近挑战记录读取中...': 'Loading recent challenge record...',
    '最近挑战记录暂不可用': 'Recent challenge record unavailable',
    '本关暂无最近挑战记录': 'No recent record for this stage',
    '只读接口同步中，不进入结算。': 'Read-only API syncing. Settlement will not start.',
    '可刷新重试；失败不会改变玩家资源。': 'Refresh to retry. Failure does not change resources.',
    '完成一次无奖励战斗后会在这里显示记录。': 'Complete one no-reward battle to show a record here.',
    '最近战斗记录': 'Recent Battle Records',
    '背包读取失败': 'Bag Loading Failed',
    '背包读取中，请稍候。': 'Loading bag. Please wait.',
    '背包暂不可用，已显示空状态': 'Bag unavailable. Empty state shown.',
    '等待背包数据': 'Waiting for bag data',
    '只读道具列表': 'Read-only Item List',
    '当前背包暂无可展示道具。': 'No displayable bag items.',
    '查看来源': 'View Source',
    '来源读取中...': 'Loading source...',
    '来源读取失败': 'Source Loading Failed',
    '暂无来源说明。': 'No source description.',
    '来源读取失败：': 'Source loading failed: ',
    '点击“查看来源”读取服务端来源说明。': 'Tap View Source to load server source details.',
    '当前背包只读展示道具与来源，不提供使用、出售、兑换、领取或资源变更入口。': 'Bag shows items and sources only. Use, sell, exchange, claim, and resource changes are closed.',
    '召唤券': 'Summon Ticket',
    '资源箱': 'Resource Box',
    '未分类': 'Uncategorized',
    '英雄图鉴': 'Hero Codex',
    '正在读取只读图鉴...': 'Loading read-only codex...',
    '等待图鉴数据': 'Waiting for codex data',
    '只读英雄图鉴': 'Read-only Hero Codex',
    '图鉴读取失败': 'Codex Loading Failed',
    '图鉴读取中，请稍候。': 'Loading codex. Please wait.',
    '当前暂无可展示的英雄图鉴。': 'No displayable hero codex entries.',
    '服务端图鉴暂不可用，已显示空状态': 'Server codex unavailable. Empty state shown.',
    '定位待补充': 'Role pending',
    '未收集': 'Not Collected',
    '当前面板只读取图鉴基础信息，不提供升级、升星、获取或资源变更入口。': 'This panel reads codex basics only. Upgrade, star-up, acquire, and resource changes are closed.',
    '英雄队列读取失败': 'Hero Roster Loading Failed',
    '英雄队列读取中，请稍候。': 'Loading hero roster. Please wait.',
    '当前暂无可展示的已拥有英雄。': 'No owned heroes to display.',
    '暂无该职业英雄': 'No heroes in this class',
    '英雄列表只读展示；进入英雄详情可升级，升星、觉醒、抽卡、领取仍关闭。': 'Hero list is read-only; level-up is available in details. Star-up, awaken, summon, and claim remain closed.',
    '玩家资料': 'Player Profile',
    '资料': 'Profile',
    '资料读取中...': 'Loading profile...',
    '资料接口暂不可用，已使用本地占位': 'Profile API unavailable. Local placeholder shown.',
    '本地开发服': 'Local Dev Server',
    '当前阶段仅展示只读资料；头像、昵称、绑定、登出等操作暂不开放。': 'Profile is read-only. Avatar, nickname, binding, and logout actions are closed.',
    '账号状态': 'Account Status',
    '登录方式': 'Login Method',
    '未绑定': 'Unbound',
    '已绑定': 'Bound',
    '称号': 'Title',
    '未加入': 'Not Joined',
    '深渊层数': 'Abyss Floor',
    '主线进度': 'Mainline Progress',
    '公会': 'Guild',
    '圣契旅者': 'Covenant Traveler',
    '英雄详情': 'Hero Details',
    '战斗展示属性': 'Battle Display Stats',
    '技能预览': 'Skill Preview',
    '仅开放升级：服务器按下一等级配置扣金币与英雄经验书；升星、觉醒、装备仍关闭。': 'Only level-up is open: the server charges gold and hero EXP books from the next-level config. Star-up, awaken, and equipment remain closed.',
    '生命': 'HP',
    '攻击': 'ATK',
    '防御': 'DEF',
    '速度': 'Speed',
    '暴击': 'Crit',
    '主动': 'Active',
    '被动': 'Passive',
    '终结技': 'Ultimate',
    '预留': 'Reserved',
    '主角': 'Protagonist',
    '已拥有英雄': 'Owned Hero',
    '奖励获得': 'Reward Grant',
    '后台补发': 'Admin Reissue',
    '攻击形态': 'Attack Form',
    '守御/祷言形态': 'Guard/Prayer Forms',
    '锁定': 'Locked',
    '待机': 'Idle',
    '战技预览': 'Skill Preview',
    '已拥有英雄的基础攻击展示，具体数值以后端技能配置为准。': 'Basic attack display for owned heroes. Final values depend on backend skill config.',
    '技能配置尚未开放写操作，当前只展示战斗定位。': 'Skill config write is not open. Current display shows battle role only.',
    '终结技等级与真实效果以后端只读配置为准。': 'Ultimate level and effects follow backend read-only config.',
    '队伍协同': 'Team Synergy',
    '加入本次阵容时参与本地战斗演出，不保存长期编队。': 'Joins the local battle preview only. Formation is not saved.',
    '召唤仪式': 'Summon Ritual',
    '本地演出预览': 'Local Animation Preview',
    '概率保底': 'Rates & Pity',
    '兑换': 'Exchange',
    '奖池内容': 'Pool Contents',
    '正在读取召唤记录...': 'Loading summon logs...',
    '只读读取当前玩家召唤记录，不提供补发或重抽。': 'Reads current player summon logs only. Reissue and redraw are closed.',
    '正在读取卡池展示配置...': 'Loading pool display config...',
    '兑换涉及经济写入，当前阶段仅展示规则说明并保持关闭。': 'Exchange is an economy write and remains closed. Rules are display-only.',
    '信息来自后端卡池配置，只读展示。': 'Information comes from backend pool config and is read-only.',
    '当前不开放兑换、补发、碎片消耗或资源变更接口。': 'Exchange, reissue, fragment cost, and resource changes are closed.',
    '当前还没有召唤记录。': 'No summon logs yet.',
    '卡池详情读取中...': 'Loading pool details...',
    '当前卡池暂未返回展示详情。': 'This pool has not returned display details.',
    '该召唤暂未开放': 'This summon is not open',
    '再召唤 30 次必得 传说英雄': 'Legendary hero guaranteed in 30 summons',
    '传说英雄': 'Legendary Hero',
    '神话英雄': 'Mythic Hero',
    '限定英雄卡池规则冻结后接入': 'Limited hero pool will connect after rules are frozen',
    '预览': 'Preview',
    '召唤中': 'Summoning',
    '单次召唤演出预览': 'Single summon animation preview',
    '十连召唤演出预览': 'Ten-summon animation preview',
    '当前只展示本地 mock 揭示节奏，不代表真实概率或奖励。': 'Local mock reveal pacing only. It does not represent real rates or rewards.',
    '视觉演出阶段：不扣资源、不生成 drawNo、不写记录、不更新保底。': 'Visual animation stage: no cost, drawNo, log write, or pity update.',
    '查看本地结果': 'View Local Result',
    '召唤结果预览': 'Summon Result Preview',
    '十连结果预览': 'Ten-Summon Result Preview',
    '本结果为本地 mock：未扣资源、未写入抽卡记录、未发放英雄、未更新保底。': 'This is a local mock result: no cost, draw log, hero grant, or pity update.',
    '货币': 'Currency',
    '奖励': 'Reward',
    '战斗': 'Battle',
    '主线战斗': 'Mainline Battle',
    '正在创建后端战斗会话...': 'Creating backend battle session...',
    '会话创建中': 'Creating Session',
    '等待后端返回战斗种子与敌方快照。': 'Waiting for backend battle seed and enemy snapshot.',
    '编队已锁定为本次预演阵容。': 'Formation locked for this preview.',
    '正在记录无奖励战斗结果...': 'Recording no-reward battle result...',
    '结果记录中': 'Recording Result',
    '正在提交无奖励结果记录，请勿重复点击。': 'Submitting no-reward result. Do not tap repeatedly.',
    '演出已完成，可记录无奖励结果。': 'Animation complete. No-reward result can be recorded.',
    '奖励未开放': 'Rewards Closed',
    '资源未变更': 'Resources Unchanged',
    '异常：奖励状态不应开启。': 'Error: reward state should not be enabled.',
    '异常：资源只读校验未通过': 'Error: read-only resource check failed',
    '无奖励记录完成': 'No-Reward Record Complete',
    '无奖励结算完成': 'No-Reward Settlement Complete',
    '返回大厅后，深渊爬塔面板会展示本关最近记录；当前仍不会发放奖励或推进主线。': 'After returning to lobby, Adventure shows this stage record. Rewards and progress remain closed.',
    '返回大厅': 'Back to Lobby',
    '战斗暂不可用': 'Battle Unavailable',
    '失败状态不会写入奖励、体力、进度或资源。': 'Failure does not write reward, stamina, progress, or resources.',
    '创建失败': 'Creation Failed',
    '重试创建': 'Retry Creation',
    '战斗会话未创建。': 'Battle session not created.',
    '战斗演出仅记录结果：不扣体力，不写主线进度，不发奖励。': 'Battle animation only records result: no stamina cost, progress write, or reward.',
    '演出完成 / 等待记录': 'Animation Complete / Waiting Record',
    '演出进行中，结算按钮暂不可用。': 'Animation in progress. Settlement button is disabled.',
    '记录结果': 'Record Result',
    '演出中': 'Animating',
    '点击开始只创建 battle session，不改变玩家资源。': 'Start only creates a battle session. Player resources do not change.',
    '点击开始只创建 battle session；本轮不提交奖励、体力或主线进度结算。': 'Start only creates a battle session. This pass does not submit rewards, stamina, or mainline progress settlement.',
    '点击开始后由后端生成战斗会话。': 'Backend creates the battle session after start.',
    '我方编队已就绪。': 'Formation ready.',
    '开始战斗': 'Start Battle',
    '黑甲守卫': 'Black-armored Guard',
    '待确认': 'Pending',
    '待上阵': 'Pending',
    '空位': 'Empty Slot',
    '奖励：未开放': 'Reward: Closed',
    '进度：不推进': 'Progress: No Advance',
    '资源：未变更': 'Resources: Unchanged',
    '资源：只读校验异常': 'Resources: Read-only Check Error',
    '结算回执': 'Settlement Receipt',
    '返回编队': 'Back to Formation',
    '英雄队列暂不可用，当前不能进入战斗。': 'Hero roster unavailable. Battle cannot start.',
    '正在读取可上阵英雄...': 'Loading deployable heroes...',
    '正在读取英雄队列，请稍候。': 'Loading hero roster. Please wait.',
    '暂无可展示英雄；请先获取英雄或刷新英雄队列。': 'No heroes to display. Obtain heroes or refresh the hero roster.',
    '候选英雄（点击上阵/下阵）': 'Candidate Heroes (tap to deploy/remove)',
    '点击候选英雄调整本次出战；阵容只用于 battle start 快照，不保存长期队伍，不改变玩家资源。': 'Tap candidates to adjust this battle. Formation is only for battle-start snapshot, not saved, and does not change resources.',
    '刷新英雄': 'Refresh Heroes',
    '不可出战': 'Cannot Deploy',
    '战斗预演': 'Battle Preview',
    '未选择': 'Not Selected',
    '队长 / 主角': 'Leader / Protagonist',
    '主角不进入抽卡池；防御/辅助形态后续由主线道具解锁。': 'Protagonist is not in gacha. Guard/support forms unlock later through mainline items.',
    '防御形态与辅助形态后续通过主线剧情道具解锁。': 'Defense and support forms unlock later through mainline story items.',
    '结算': 'Settlement',
    '当前仅展示资料，不提供任何增减入口。': 'Only profile information is shown. Increase/decrease actions are closed.',
    '召唤卡池': 'Summon Pool',
    '当前阶段仅开放登录、大厅只读展示和玩家资料查看。该入口暂不连接玩法或经济写接口。': 'Current stage only opens login, read-only lobby display, and player profile viewing. This entry does not connect gameplay or economy write APIs.',
    '本关暂无记录；最近挑战 ${latest.stageCode}': 'No record for this stage; latest challenge ${latest.stageCode}',
    '当前可进入无奖励战斗预演；不保存长期编队，不扣体力，不改变玩家资源。': 'No-reward battle preview is available. Formation is not saved; stamina and resources are unchanged.',
    '时间未知': 'Unknown Time',
    '${safeText(item.itemName)}来自重复抽到同名英雄后的自动转化，当前只读展示，不提供兑换、升星或资源变更入口。': '${safeText(item.itemName)} comes from duplicate hero auto-conversion. It is read-only; exchange, star-up, and resource changes are closed.',
    '正在读取背包道具...': 'Loading bag items...',
    '仅展示': 'Display Only',
    '战斗结算关卡不一致：会话 ${currentStart.stageCode}，结算 ${settlement.stageCode}': 'Battle settlement stage mismatch: session ${currentStart.stageCode}, settlement ${settlement.stageCode}',
    '当前没有可上阵英雄，请先获取英雄或刷新英雄队列。': 'No deployable heroes. Obtain heroes or refresh the hero roster.',
    '本次确认阵容已失效，请刷新英雄队列后重新编队。': 'Confirmed formation expired. Refresh hero roster and form again.',
    '仅创建 battle session，不扣体力，不写进度，不发奖励。': 'Creates battle session only. No stamina cost, progress write, or reward.',
    '当前只写 battle_settlement 记录，不触发奖励、体力或进度。': 'Only writes a battle_settlement record. No reward, stamina, or progress is triggered.',
    '战斗演出已完成。': 'Battle animation complete.',
    '记录中': 'Recording',
    '下一步：返回大厅后可在深渊爬塔查看本关最近记录；奖励、体力、主线进度、背包和货币均未变更。': 'Next: return to lobby and view this stage record in Mainline Adventure. Rewards, stamina, mainline progress, bag, and currency are unchanged.',
    '目标关卡：${settlement.stageCode}': 'Target stage: ${settlement.stageCode}',
    '${rewardGuardText}；${readonlyGuardText}；主线进度不推进。': '${rewardGuardText}; ${readonlyGuardText}; mainline progress does not advance.',
    '下一步：返回大厅，进入深渊爬塔查看最近挑战记录。': 'Next: return to lobby and open Mainline Adventure to view recent challenge records.',
    "目标关卡 ${state.stageCode || '未选择'} / 准备创建战斗会话，本阶段不发奖励、不扣体力。": "Target stage ${state.stageCode || 'Not Selected'} / preparing battle session. No reward or stamina cost in this stage.",
    "目标关卡 ${state.stageCode || '未选择'} / 准备创建战斗会话，胜利后自动提交结算。": "Target stage ${state.stageCode || 'Not Selected'} / preparing battle session. Settlement submits automatically after victory.",
    '首通奖励（胜利结算后发放）': 'First-clear rewards (granted after victory settlement)',
    '奖励配置预览，胜利结算后发放': 'Reward configuration preview; granted after victory settlement.',
    '年度主线 MAIN_1_1 至 MAIN_25_16 已配置；战斗胜利后自动提交结算并发放奖励。': 'Annual mainline MAIN_1_1 to MAIN_25_16 is configured. Settlement submits automatically after victory and rewards are granted.',
    '主角攻击形态前压，队伍进入战斗位置。': 'Protagonist advances in attack form; the team takes battle position.',
    '敌方黑甲守卫正在蓄势。': 'Enemy black-armored guard is charging.',
    '第 1 回合 / 接敌': 'Round 1 / Engage',
    '第 1 回合 / 主角出手': 'Round 1 / Protagonist Strike',
    '主角斩击命中裂隙前锋。': 'Protagonist slash hits the rift vanguard.',
    '敌方前排护甲被削弱。': 'Enemy front armor is weakened.',
    '第 2 回合 / 敌方反击': 'Round 2 / Enemy Counter',
    '敌方释放暗焰反击。': 'Enemy releases a dark-flame counter.',
    '我方队长格挡，队伍保持阵线。': 'Our leader blocks and the team holds formation.',
    '主角攻击形态爆发，压制敌方核心。': 'Protagonist attack form bursts and suppresses the enemy core.',
    '敌方阵线崩解，等待记录结果。': 'Enemy line collapses; waiting to record result.',
    '敌方前排被击退。': 'Enemy front line is knocked back.',
    '战斗表现完成，正在提交后端结算。': 'Battle presentation complete; submitting settlement to the backend.',
    '战斗胜负已定，正在提交后端结算…': 'Battle outcome confirmed; submitting settlement to the backend…',
    '结算提交中，奖励以回执为准…': 'Settlement submitting; rewards follow the backend receipt…',
    '本关已首通，重复挑战不再发放奖励': 'Stage already first-cleared; repeat runs grant no rewards',
    '首通奖励已发放（重复挑战不再发放）': 'First-clear rewards granted (repeats grant none)',
    '奖励预览（首通结算后发放）': 'Reward preview (granted after first-clear settlement)',
    '解锁后进入首通结算；胜利自动发放奖励与经验。': 'Unlock to enter first-clear settlement; victory grants rewards and EXP automatically.',
    '已记录': 'Recorded',
    '裂隙侍从': 'Rift Acolyte',
    '裂隙法师': 'Rift Mage',
    'Lv.1 / 预演': 'Lv.1 / Preview',
    '韧性': 'Tenacity',
    '普攻': 'Basic Attack',
    '攻击形态默认开放，对单体目标造成暗金斩击伤害。': 'Attack form is open by default and deals dark-gold slash damage to a single target.',
    '凝聚裂隙能量打击前排，当前为战斗表现预览。': 'Condenses rift energy to strike the front line. Current display is battle preview.',
    '主角在队首时提升本次预演的压制感与生存展示。': 'When the protagonist leads, this preview emphasizes pressure and survival.',
    '${safeText(hero.heroName)}·普攻': '${safeText(hero.heroName)} · Basic Attack',
    '主': 'P',
    '英': 'H',
    '战': 'W',
    '辅': 'S',
    '刺': 'A',
    '法': 'M',
    '射': 'R',
    '坦': 'T',
    '排行榜': 'Rankings',
    '加载中': 'Loading',
    '爬塔状态暂时不可用': 'Adventure status temporarily unavailable',
    "状态：${stage.statusLabel || '查看解锁条件'}": "Status: ${stage.statusLabel || 'View unlock condition'}",
    '${goal.stageLine}：已打开深渊爬塔，当前仍是无奖励预演。': '${goal.stageLine}: Mainline Adventure opened. Current stage remains no-reward preview.',
    '占位': 'Placeholder',
    '任务系统暂未开放；当前不会领取奖励或写入任务进度。': 'Quest system is not open. No reward claim or quest progress write.',
    '准备进入游戏...': 'Preparing to enter game...',
    '登录成功：${tokenName || FALLBACK_TOKEN_NAME}，准备资源清单...': 'Login successful: ${tokenName || FALLBACK_TOKEN_NAME}. Preparing resource list...',
    '资源加载完成，进入圣契大厅...': 'Resources loaded. Entering Covenant Lobby...',
    '资源加载失败：${message}': 'Resource loading failed: ${message}',
    '公告与活动': 'Notices & Events',
    '正在读取服务端公告...': 'Loading server notices...',
    '服务端公告暂不可用，已显示本地说明': 'Server notices unavailable. Local note shown.',
    '服务端只读公告': 'Server Read-only Notice',
    '公告读取中，请稍候。': 'Loading notices. Please wait.',
    '服务端暂无可展示公告。': 'No server notices to display.',
    '当前面板只读取公告信息，不进入玩法，不改变玩家资源。': 'This panel reads notices only. It does not enter gameplay or change resources.',
    '大厅公告占位': 'Lobby Notice Placeholder',
    '服务端公告暂不可用时，大厅会保留本地只读说明。该面板不会触发玩法、资源或账号状态变更。': 'When server notices are unavailable, the lobby keeps a local read-only note. This panel does not trigger gameplay, resources, or account changes.',
    '钱包绑定': 'Wallet Binding',
    '钱包地址': 'Wallet Address',
    '未知': 'Unknown',
    '检查大厅背景资源...': 'Checking lobby background resources...',
    '大厅首帧准备完成，加载动态背景...': 'Lobby first frame ready. Loading dynamic background...',
    '大厅动态背景准备完成，整理界面状态...': 'Lobby dynamic background ready. Preparing UI state...',
    '大厅静态背景准备完成，整理界面状态...': 'Lobby static background ready. Preparing UI state...',
    '系统入口暂未开放；当前仅保留本地占位反馈，不读取或写入系统数据。': 'System entry is not open. It only keeps local placeholder feedback and does not read or write system data.',
    '限定召唤预览': 'Limited Summon Preview',
    '英雄召唤预览': 'Hero Summon Preview',
    '普通召唤预览': 'Normal Summon Preview',
    '克莱恩': 'Klein',
    '概率与保底合并展示，只读取后端卡池配置。': 'Rates and pity are displayed together from backend pool config only.',
    '记录': 'Logs',
    '召唤记录将只读展示历史结果，不能补发或重抽。': 'Summon logs are read-only history. Reissue and redraw are closed.',
    '召唤积分兑换属于经济写入，当前阶段保持关闭。': 'Summon point exchange is an economy write and remains closed in this stage.',
    '展示当前卡池中的英雄与物品条目，不变更卡池。': 'Displays heroes and items in the current pool without changing the pool.',
    '聚魂': 'Soul Gather',
    '深渊契约正在聚合': 'Abyss covenant is gathering',
    '裂隙': 'Rift',
    '召唤阵打开本地预览': 'Summon circle opens local preview',
    '显影': 'Reveal',
    '即将展示 mock 结果': 'Mock result will reveal soon',
    '说明：${safeText(selectedPool.exchangeNote)}': 'Note: ${safeText(selectedPool.exchangeNote)}',
    'huangfengjiaozong Spine 运行时解析失败，已临时显示可用预览 Spine；需要重新导出 huangfengjiaozong。': 'huangfengjiaozong Spine runtime parse failed. A usable preview Spine is shown temporarily; re-export huangfengjiaozong.',
    '黄风教宗准备中': 'Huangfeng Jiaozong Preparing',
    '召唤 Spine 资源加载失败，请确认 assets/resources/spine/gacha/huangfengjiaozong 已重新导入。': 'Summon Spine resource loading failed. Confirm assets/resources/spine/gacha/huangfengjiaozong has been reimported.',
    'huangfengjiaozong Spine 解析失败，备用预览 Spine 也加载失败，请检查 resources/spine/gacha 资源导入。': 'huangfengjiaozong Spine parse failed, and fallback preview Spine also failed. Check resources/spine/gacha import.',
    '卡池 Spine 资源加载失败：${resource}': 'Pool Spine resource loading failed: ${resource}',
    '${assetLabel} Spine 运行时解析失败，请检查 skel/atlas/texture 是否匹配。': '${assetLabel} Spine runtime parse failed. Check whether skel/atlas/texture match.',
    '${assetLabel} 未找到导出动画，已显示静态骨骼首帧。': '${assetLabel} has no exported animation. Static skeleton first frame is shown.',
    '召唤 Spine 动画 ${introAnimation}/${idleAnimation} 播放失败。': 'Summon Spine animation ${introAnimation}/${idleAnimation} failed.',
    '召唤 Spine 动画 ${idleAnimation} 播放失败。': 'Summon Spine animation ${idleAnimation} failed.',
    '召唤 Spine 播放失败：${message}': 'Summon Spine playback failed: ${message}',
    '卡池信息由后端配置驱动。': 'Pool information is driven by backend config.',
    '真实 drawNo：${drawResult.drawNo}': 'Real drawNo: ${drawResult.drawNo}',
    '已上阵': 'Deployed',
    '戰士': 'Warrior',
    '鎴樺+': 'Warrior',
    '杈呭姪': 'Support',
    '鍒哄': 'Assassin',
    '娉曞笀': 'Mage',
    '灏勬墜': 'Marksman',
    '鍧﹀厠': 'Tank',
  },
};

const FRAGMENT_TEXT_TRANSLATIONS: Partial<Record<LootChainLanguage, ReadonlyArray<readonly [string, string]>>> = {
  'en-US': [
    ['LootChain: 欢迎来到LootChain的世界！', 'LootChain: Welcome to LootChain!'],
    ['主线 1-1 暗影城门', 'Mainline 1-1 Shadow Gate'],
    ['暗影城门', 'Shadow Gate'],
    ['暗渊之主', 'Lord of the Abyss'],
    ['永夜祭司', 'Evernight Priestess'],
    ['亡语者', 'Deathspeaker'],
    ['月蚀之影', 'Eclipse Shadow'],
    ['荒野狂战', 'Wilder Berserker'],
    ['格雷夫', 'Grave'],
    ['莱奥娜', 'Leona'],
    ['维洛斯', 'Velos'],
    ['艾莉西亚', 'Alicia'],
    ['古堡密钥', 'Castle Key'],
    ['突破材料', 'Breakthrough Material'],
    ['月蚀碎片', 'Eclipse Fragment'],
    ['召唤材料', 'Summon Material'],
    ['星陨余烬', 'Starfall Ash'],
    ['深渊裂刃', 'Abyss Riftblade'],
    ['圣契斩击', 'Covenant Slash'],
    ['誓约战意', 'Oathbound Will'],
    ['活动公告', 'Event Notice'],
    ['世界聊天', 'World Chat'],
    ['世界BOSS', 'World Boss'],
    ['无尽深渊', 'Endless Abyss'],
    ['跨服竞技', 'Cross-server Arena'],
    ['资源副本', 'Resource Dungeon'],
    ['召唤祭坛', 'Summon Altar'],
    ['深渊之门', 'Abyss Gate'],
    ['战役', 'Campaign'],
    ['黑市', 'Black Market'],
    ['圣契之路', 'Covenant Road'],
    ['深渊召唤', 'Abyss Summon'],
    ['首充礼包', 'First Purchase Pack'],
    ['旅者集会', 'Traveler Gathering'],
    ['熔铸工坊', 'Forge Workshop'],
    ['深渊爬塔', 'Mainline Adventure'],
    ['主线战斗', 'Mainline Battle'],
    ['最近战斗记录', 'Recent Battle Records'],
    ['英雄队列', 'Hero Roster'],
    ['英雄图鉴', 'Hero Codex'],
    ['玩家资料', 'Player Profile'],
    ['账号状态', 'Account Status'],
    ['登录方式', 'Login Method'],
    ['深渊层数', 'Abyss Floor'],
    ['主线进度', 'Mainline Progress'],
    ['战斗展示属性', 'Battle Display Stats'],
    ['技能预览', 'Skill Preview'],
    ['战技预览', 'Skill Preview'],
    ['终结技', 'Ultimate'],
    ['队伍协同', 'Team Synergy'],
    ['召唤仪式', 'Summon Ritual'],
    ['概率保底', 'Rates & Pity'],
    ['奖池内容', 'Pool Contents'],
    ['召唤记录', 'Summon Logs'],
    ['召唤结果', 'Summon Result'],
    ['本地演出预览', 'Local Animation Preview'],
    ['本地只读展示', 'Local Read-only Display'],
    ['编队确认', 'Formation Confirm'],
    ['候选英雄', 'Candidate Heroes'],
    ['战斗预演', 'Battle Preview'],
    ['结算回执', 'Settlement Receipt'],
    ['无奖励记录', 'No-Reward Record'],
    ['无奖励结算', 'No-Reward Settlement'],
    ['奖励状态异常', 'Reward State Error'],
    ['资源校验异常', 'Resource Check Error'],
    ['资源未变更', 'Resources Unchanged'],
    ['只读展示', 'Read-only Display'],
    ['只读预览', 'Read-only Preview'],
    ['只读接口', 'Read-only API'],
    ['只读道具列表', 'Read-only Item List'],
    ['服务端公告', 'Server Notice'],
    ['服务端图鉴', 'Server Codex'],
    ['服务端', 'Server'],
    ['本关暂无最近挑战记录', 'No recent record for this stage'],
    ['最近挑战记录', 'Recent Challenge Record'],
    ['本关暂无记录', 'No record for this stage'],
    ['等待公告数据', 'Waiting for notice data'],
    ['等待图鉴数据', 'Waiting for codex data'],
    ['等待背包数据', 'Waiting for bag data'],
    ['等待主线数据', 'Waiting for mainline data'],
    ['等待开始', 'Waiting to Start'],
    ['会话创建中', 'Creating Session'],
    ['结果记录中', 'Recording Result'],
    ['演出进行中', 'Animating'],
    ['演出完成', 'Animation Complete'],
    ['记录结果', 'Record Result'],
    ['返回大厅', 'Back to Lobby'],
    ['返回编队', 'Back to Formation'],
    ['返回召唤', 'Back to Summon'],
    ['查看来源', 'View Source'],
    ['查看目标', 'View Target'],
    ['刷新英雄', 'Refresh Heroes'],
    ['刷新', 'Refresh'],
    ['进入爬塔', 'Enter Adventure'],
    ['继续爬塔', 'Continue Adventure'],
    ['开始战斗', 'Start Battle'],
    ['开始主线预演', 'Start Mainline Preview'],
    ['重试创建', 'Retry Creation'],
    ['重试加载', 'Retry Loading'],
    ['读取中', 'Loading'],
    ['待同步', 'Pending Sync'],
    ['读取失败', 'Load Failed'],
    ['创建失败', 'Creation Failed'],
    ['来源读取失败', 'Source Load Failed'],
    ['背包读取失败', 'Bag Load Failed'],
    ['图鉴读取失败', 'Codex Load Failed'],
    ['公告读取失败', 'Notice Load Failed'],
    ['英雄队列读取失败', 'Hero Roster Load Failed'],
    ['资料账号不匹配', 'Profile Account Mismatch'],
    ['资料占位', 'Profile Placeholder'],
    ['资料读取中', 'Loading Profile'],
    ['只读/占位资源', 'Read-only/Placeholder Resource'],
    ['功能暂未开放', 'Feature Not Open'],
    ['玩法未开放', 'Gameplay Not Open'],
    ['系统入口占位', 'System Entry Placeholder'],
    ['系统入口', 'System Entry'],
    ['本地聊天预览', 'Local Chat Preview'],
    ['仅展示', 'Display Only'],
    ['聊天系统', 'Chat System'],
    ['大厅入口', 'Lobby Entry'],
    ['当前仅展示资料', 'Current display is read-only profile'],
    ['当前仅本地展示', 'Current display is local-only'],
    ['不跳转', 'no navigation'],
    ['不发奖', 'no reward'],
    ['不写入经济数据', 'no economy write'],
    ['暂未开放', 'Not Open'],
    ['未开放', 'Closed'],
    ['未开', 'Closed'],
    ['锁定', 'Locked'],
    ['占位展示', 'Placeholder Display'],
    ['预览中', 'Previewing'],
    ['待确认', 'Pending'],
    ['待上阵', 'Pending'],
    ['已上阵', 'Deployed'],
    ['未选择', 'Not Selected'],
    ['不可出战', 'Cannot Deploy'],
    ['未绑定', 'Unbound'],
    ['已绑定', 'Bound'],
    ['未加入', 'Not Joined'],
    ['未分类', 'Uncategorized'],
    ['未收集', 'Not Collected'],
    ['定位待补充', 'Role Pending'],
    ['待机', 'Idle'],
    ['主动', 'Active'],
    ['被动', 'Passive'],
    ['攻击形态', 'Attack Form'],
    ['防御形态', 'Defense Form'],
    ['辅助形态', 'Support Form'],
    ['守御/祷言形态', 'Guard/Prayer Forms'],
    ['攻击', 'ATK'],
    ['防御', 'DEF'],
    ['生命', 'HP'],
    ['速度', 'Speed'],
    ['暴击', 'Crit'],
    ['等级不足', 'Level Too Low'],
    ['等级要求', 'Level Required'],
    ['推荐战力', 'Recommended Power'],
    ['推荐关卡', 'Recommended Stage'],
    ['敌方', 'Enemy'],
    ['章节', 'Chapter'],
    ['空位', 'Empty Slot'],
    ['队长 / 主角', 'Leader / Protagonist'],
    ['队长', 'Leader'],
    ['主角', 'Protagonist'],
    ['主线', 'Mainline'],
    ['等级', 'Level'],
    ['经验', 'EXP'],
    ['体力', 'Stamina'],
    ['战力', 'Power'],
    ['金币', 'Gold'],
    ['钻石', 'Diamond'],
    ['水晶', 'Crystal'],
    ['数量', 'Quantity'],
    ['堆叠', 'Stack'],
    ['编码', 'Code'],
    ['类型', 'Type'],
    ['效果', 'Effect'],
    ['出售价', 'Sell Price'],
    ['过期', 'Expires'],
    ['永久', 'Permanent'],
    ['来源', 'Source'],
    ['分类', 'Groups'],
    ['总数', 'Total'],
    ['收录', 'Codex'],
    ['已拥有', 'Owned'],
    ['拥有', 'Owned'],
    ['已选', 'Selected'],
    ['锁', 'Locked'],
    ['奖励', 'Reward'],
    ['资源', 'Resources'],
    ['进度', 'Progress'],
    ['结算单', 'Settlement'],
    ['战斗号', 'Battle No.'],
    ['服务器种子', 'Server Seed'],
    ['关卡', 'Stage'],
    ['会话', 'Session'],
    ['结果', 'Result'],
    ['状态', 'Status'],
    ['下一步目标', 'Next Objective'],
    ['下一步', 'Next'],
    ['概率', 'Rate'],
    ['保底', 'Pity'],
    ['重置', 'Reset'],
    ['当前', 'Current'],
    ['还需', 'Need'],
    ['重复英雄转化碎片', 'Duplicate Hero Fragment Conversion'],
    ['重复转化', 'Duplicate Conversion'],
    ['同名碎片', 'same-hero fragments'],
    ['碎片来源', 'Fragment Source'],
    ['重复', 'Duplicate'],
    ['转化', 'converts to'],
    ['英雄碎片', 'Hero Fragment'],
    ['碎片', 'Fragment'],
    ['材料', 'Material'],
    ['道具', 'Item'],
    ['货币', 'Currency'],
    ['召唤券', 'Summon Ticket'],
    ['资源箱', 'Resource Box'],
    ['装备', 'Equipment'],
    ['消耗品', 'Consumable'],
    ['召唤', 'Summon'],
    ['抽', 'draws'],
    ['消耗', 'cost'],
    ['权重', 'weight'],
    ['限定', 'limited'],
    ['英雄', 'Hero'],
    ['战士', 'Warrior'],
    ['辅助', 'Support'],
    ['輔助', 'Support'],
    ['刺客', 'Assassin'],
    ['法师', 'Mage'],
    ['法師', 'Mage'],
    ['射手', 'Marksman'],
    ['坦克', 'Tank'],
    ['近战', 'Melee'],
    ['远程', 'Ranged'],
    ['物理', 'Physical'],
    ['法术', 'Magic'],
    ['活动', 'Events'],
    ['公告', 'Notice'],
    ['挑战', 'Challenge'],
    ['聊天', 'Chat'],
    ['图鉴', 'Codex'],
    ['背包', 'Bag'],
    ['圣契', 'Contract'],
    ['任务', 'Quests'],
    ['锻造', 'Forge'],
    ['商店', 'Shop'],
    ['公会', 'Guild'],
    ['深渊爬塔', 'Abyss Tower'],
    ['编队', 'Formation'],
    ['资料', 'Profile'],
    ['称号', 'Title'],
    ['邮件', 'Mail'],
    ['好友', 'Friends'],
    ['设置', 'Settings'],
    ['更多菜单', 'More'],
    ['本地开发服', 'Local Dev Server'],
    ['世界', 'World'],
    ['黑甲守卫', 'Black-armored Guard'],
    ['第 1 回合 / 接敌', 'Round 1 / Engage'],
    ['第 1 回合 / 主角出手', 'Round 1 / Protagonist Strike'],
    ['第 2 回合 / 敌方反击', 'Round 2 / Enemy Counter'],
    ['第 3 回合 / 终结斩', 'Round 3 / Finisher'],
    ['我方编队已就绪', 'Formation ready'],
    ['主角攻击形态前压，队伍进入战斗位置', 'Protagonist advances in attack form; formation enters battle position'],
    ['敌方黑甲守卫正在蓄势', 'Enemy guard is charging'],
    ['主角斩击命中裂隙前锋', 'Protagonist slash hits the rift vanguard'],
    ['敌方前排护甲被削弱', 'Enemy front armor weakened'],
    ['敌方释放暗焰反击', 'Enemy releases dark-flame counterattack'],
    ['我方队长格挡，队伍保持阵线', 'Leader blocks; formation holds'],
    ['主角攻击形态爆发，压制敌方核心', 'Protagonist attack form bursts and suppresses the enemy core'],
    ['敌方阵线崩解，等待记录结果', 'Enemy line collapses; waiting to record result'],
    ['战斗表现完成，正在提交后端结算', 'Battle presentation complete; submitting settlement to the backend'],
    ['（点击上阵/下阵）', ' (tap to deploy/remove)'],
    ['（当前不发放）', ' (no rewards)'],
    ['（预览）', ' (Preview)'],
    ['：', ': '],
    ['，', ', '],
    ['。', '.'],
    ['；', '; '],
    ['、', ' / '],
    ['（', ' ('],
    ['）', ')'],
  ],
};

class LootChainI18n {
  private language: LootChainLanguage = this.loadLanguage();

  currentLanguage(): LootChainLanguage {
    return this.language;
  }

  setLanguage(language: LootChainLanguage): LootChainLanguage {
    this.language = language;
    this.saveLanguage(language);
    return this.language;
  }

  toggleLanguage(): LootChainLanguage {
    return this.setLanguage(this.language === 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  languageLabel(language: LootChainLanguage = this.language): string {
    return LANGUAGE_LABELS[language];
  }

  t(key: LootChainI18nKey, params?: Interpolation): string {
    const template = DICTIONARY[this.language][key] ?? DICTIONARY[DEFAULT_LANGUAGE][key] ?? key;
    if (!params) {
      return template;
    }
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)),
      template,
    );
  }

  text(value: string): string {
    if (!value || this.language === DEFAULT_LANGUAGE) {
      return value;
    }
    return STATIC_TEXT_TRANSLATIONS[this.language]?.[value] ?? this.translateDynamicText(value);
  }

  private translateDynamicText(value: string): string {
    const battlePower = value.match(/^战力\s*(.+)$/);
    if (battlePower) {
      return `Power ${battlePower[1]}`;
    }
    const closed = value.match(/^(.+) 暂未开放。$/);
    if (closed) {
      return `${closed[1]} is not open yet.`;
    }
    const selected = value.match(/^(.+) 已选中。$/);
    if (selected) {
      return `${selected[1]} selected.`;
    }
    const joined = value.match(/^(.+) 已加入本次阵容。$/);
    if (joined) {
      return `${joined[1]} joined this formation.`;
    }
    const removed = value.match(/^(.+) 已移出本次阵容。$/);
    if (removed) {
      return `${removed[1]} removed from this formation.`;
    }
    const unlockedPreview = value.match(/^(.+) 尚未解锁，当前只展示预告。$/);
    if (unlockedPreview) {
      return `${unlockedPreview[1]} is locked and only shown as preview.`;
    }
    const unlockedFormation = value.match(/^(.+) 尚未解锁，当前只展示预告，不会进入编队。$/);
    if (unlockedFormation) {
      return `${unlockedFormation[1]} is locked and only shown as preview; formation will not open.`;
    }
    const stageSelected = value.match(/^已选择 (.+)，可进入编队确认。$/);
    if (stageSelected) {
      return `${stageSelected[1]} selected. Formation confirmation is available.`;
    }
    const completed = value.match(/^召唤完成：(.+)$/);
    if (completed) {
      return `Summon complete: ${completed[1]}`;
    }
    const failed = value.match(/^召唤失败：(.+)$/);
    if (failed) {
      return `Summon failed: ${failed[1]}`;
    }
    const loadingFailed = value.match(/^召唤卡池读取失败，已使用本地展示兜底：(.+)$/);
    if (loadingFailed) {
      return `Pool loading failed; local fallback is shown: ${loadingFailed[1]}`;
    }
    const pityFailed = value.match(/^保底信息读取失败：(.+)$/);
    if (pityFailed) {
      return `Pity loading failed: ${pityFailed[1]}`;
    }
    const detailFailed = value.match(/^卡池详情读取失败：(.+)$/);
    if (detailFailed) {
      return `Pool detail loading failed: ${detailFailed[1]}`;
    }
    const logFailed = value.match(/^召唤记录读取失败：(.+)$/);
    if (logFailed) {
      return `Summon log loading failed: ${logFailed[1]}`;
    }
    const battleCreated = value.match(/^战斗会话已创建：(.+)$/);
    if (battleCreated) {
      return `Battle session created: ${battleCreated[1]}`;
    }
    const battleCreateFailed = value.match(/^战斗会话创建失败：(.+)$/);
    if (battleCreateFailed) {
      return `Battle session creation failed: ${battleCreateFailed[1]}`;
    }
    const battleRecordFailed = value.match(/^战斗记录失败：(.+)$/);
    if (battleRecordFailed) {
      return `Battle log failed: ${battleRecordFailed[1]}`;
    }
    const ownedCount = value.match(/^拥有\s+(.+)$/);
    if (ownedCount) {
      return `Owned ${ownedCount[1]}`;
    }
    const codexCount = value.match(/^收录\s+(.+)$/);
    if (codexCount) {
      return `Codex ${codexCount[1]}`;
    }
    const ownedCodexCount = value.match(/^已拥有\s+(.+)$/);
    if (ownedCodexCount) {
      return `Owned ${ownedCodexCount[1]}`;
    }
    const shownItems = value.match(/^已显示\s+(.+)\/(.+)\s+件$/);
    if (shownItems) {
      return `Showing ${shownItems[1]}/${shownItems[2]} items`;
    }
    const scrollRows = value.match(/^共\s+(.+)\s+条，拖动查看完整列表。$/);
    if (scrollRows) {
      return `${scrollRows[1]} rows. Drag to view the full list.`;
    }
    const categoryCount = value.match(/^分类\s+(.+)$/);
    if (categoryCount) {
      return `Groups ${categoryCount[1]}`;
    }
    const totalCount = value.match(/^总数\s+(.+)$/);
    if (totalCount) {
      return `Total ${totalCount[1]}`;
    }
    const itemQuantity = value.match(/^数量\s+(.+)\s+\/\s+堆叠\s+(.+)$/);
    if (itemQuantity) {
      return `Qty ${itemQuantity[1]} / Stack ${itemQuantity[2]}`;
    }
    const itemCode = value.match(/^编码\s+(.+)$/);
    if (itemCode) {
      return `Code ${itemCode[1]}`;
    }
    const itemType = value.match(/^类型\s+(.+)\s+\/\s+(.+)$/);
    if (itemType) {
      return `Type ${this.translateInlineText(itemType[1])} / ${itemType[2]}`;
    }
    const itemEffect = value.match(/^效果\s+(.+)$/);
    if (itemEffect) {
      return `Effect ${this.translateInlineText(itemEffect[1])}`;
    }
    const itemSell = value.match(/^出售价\s+(.+)\s+金币$/);
    if (itemSell) {
      return `Sell Price ${itemSell[1]} Gold`;
    }
    const itemExpire = value.match(/^过期\s+(.+)$/);
    if (itemExpire) {
      return `Expires ${this.translateInlineText(itemExpire[1])}`;
    }
    const publishTime = value.match(/^发布\s+(.+)$/);
    if (publishTime) {
      return `Published ${publishTime[1]}`;
    }
    const levelRequired = value.match(/^等级要求\s+Lv\.(.+)$/);
    if (levelRequired) {
      return `Level Required Lv.${levelRequired[1]}`;
    }
    const recommendedPower = value.match(/^推荐战力\s+(.+)$/);
    if (recommendedPower) {
      return `Recommended Power ${recommendedPower[1]}`;
    }
    const enemySummary = value.match(/^敌方：(.+)$/);
    if (enemySummary) {
      return `Enemy: ${this.translateInlineText(enemySummary[1])}`;
    }
    const selectedStage = value.match(/^已选\s+(.+)$/);
    if (selectedStage) {
      return `Selected ${this.translateInlineText(selectedStage[1])}`;
    }
    const lockedStage = value.match(/^锁定\s+(.+)$/);
    if (lockedStage) {
      return `Locked ${this.translateInlineText(lockedStage[1])}`;
    }
    const recentBattle = value.match(/^最近\s+(.+)\s+·\s+(.+)\s+·\s+(.+)$/);
    if (recentBattle) {
      return `Recent ${recentBattle[1]} · ${this.translateInlineText(recentBattle[2])} · ${this.translateInlineText(recentBattle[3])}`;
    }
    const stageRecord = value.match(/^本关\s+(.+)\s+·\s+(.+)$/);
    if (stageRecord) {
      return `This stage ${this.translateInlineText(stageRecord[1])} · ${stageRecord[2]}`;
    }
    const nextStep = value.match(/^下一步[： ·]\s*(.+)$/);
    if (nextStep) {
      return `Next: ${this.translateInlineText(nextStep[1])}`;
    }
    const resourceTitle = value.match(/^资源：(.+)$/);
    if (resourceTitle) {
      return `Resource: ${this.translateInlineText(resourceTitle[1])}`;
    }
    const resourceValueStamina = value.match(/^当前值：(.+)。体力来自只读玩家资料；购买、领取和恢复加速入口暂未开放。$/);
    if (resourceValueStamina) {
      return `Current value: ${resourceValueStamina[1]}. Stamina comes from read-only profile data; purchase, claim, and recovery acceleration are closed.`;
    }
    const resourceValuePlaceholder = value.match(/^当前值：(.+)。该资源当前为大厅视觉占位，待只读资产汇总接口开放后再接入真实数量。$/);
    if (resourceValuePlaceholder) {
      return `Current value: ${resourceValuePlaceholder[1]}. This resource is a lobby visual placeholder until a read-only asset summary API is opened.`;
    }
    const gachaRate = value.match(/^概率\s+(.+)：(.+)%$/);
    if (gachaRate) {
      return `Rate ${gachaRate[1]}: ${gachaRate[2]}%`;
    }
    const gachaPity = value.match(/^保底\s+(.+)：(.+)\s+抽，重置\s+(.+)$/);
    if (gachaPity) {
      return `Pity ${gachaPity[1]}: ${gachaPity[2]} draws, reset ${gachaPity[3]}`;
    }
    const gachaCurrentPity = value.match(/^当前\s+(.+)\s+保底：已\s+(.+)\s+\/\s+(.+)，还需\s+(.+)\s+抽$/);
    if (gachaCurrentPity) {
      return `Current ${gachaCurrentPity[1]} pity: ${gachaCurrentPity[2]} / ${gachaCurrentPity[3]}, ${gachaCurrentPity[4]} draws left`;
    }
    const duplicateConfig = value.match(/^重复\s+(.+)\s+英雄：转化\s+(.+)\s+同名碎片$/);
    if (duplicateConfig) {
      return `Duplicate ${duplicateConfig[1]} hero: converts to ${duplicateConfig[2]} same-hero fragments`;
    }
    const duplicateSource = value.match(/^碎片来源：重复\s+(.+)\s+英雄转化\s+(.+)\s+碎片$/);
    if (duplicateSource) {
      return `Fragment source: duplicate ${duplicateSource[1]} hero converts to ${duplicateSource[2]} fragments`;
    }
    const duplicateResult = value.match(/^重复转化\s+(.+)\s+碎片$/);
    if (duplicateResult) {
      return `Duplicate conversion: ${duplicateResult[1]} fragments`;
    }
    const gachaLog = value.match(/^(.+)\s+(.+)抽\s+(.+)\s+消耗\s+(.+)\s+(.+)\s+(.+)$/);
    if (gachaLog) {
      return `${gachaLog[1]} ${gachaLog[2]} draws ${gachaLog[3]} cost ${gachaLog[4]} ${gachaLog[5]} ${gachaLog[6]}`;
    }
    const poolItem = value.match(/^(.+)\s+(.+)\s+(.+)\s+权重\s+(.+)$/);
    if (poolItem) {
      return `${poolItem[1]} ${this.translateInlineText(poolItem[2])} ${poolItem[3]} weight ${this.translateInlineText(poolItem[4])}`;
    }
    const drawLeft = value.match(/^再召唤\s+(.+)\s+次必得\s+(.+)$/);
    if (drawLeft) {
      return `${this.translateInlineText(drawLeft[2])} guaranteed in ${drawLeft[1]} summons`;
    }
    const battleReceipt = value.match(/^关卡\s+(.+)\s+\/\s+无奖励记录已写入\s+\/\s+(.+)$/);
    if (battleReceipt) {
      return `Stage ${battleReceipt[1]} / no-reward record written / ${this.translateInlineText(battleReceipt[2])}`;
    }
    const battleSession = value.match(/^关卡\s+(.+)\s+\/\s+会话\s+(.+)$/);
    if (battleSession) {
      return `Stage ${battleSession[1]} / Session ${battleSession[2]}`;
    }
    const settlementResult = value.match(/^结果：(.+)\s+\/\s+状态：(.+)$/);
    if (settlementResult) {
      return `Result: ${this.translateInlineText(settlementResult[1])} / Status: ${this.translateInlineText(settlementResult[2])}`;
    }
    const settlementNo = value.match(/^结算单：(.+)$/);
    if (settlementNo) {
      return `Settlement: ${settlementNo[1]}`;
    }
    const battleNo = value.match(/^战斗号：(.+)$/);
    if (battleNo) {
      return `Battle No.: ${battleNo[1]}`;
    }
    const formationSummary = value.match(/^已确认\s+(.+)\s+名出战英雄：目标\s+(.+)；本次阵容会用于战斗会话，不写经济。$/);
    if (formationSummary) {
      return `Confirmed ${formationSummary[1]} deployed heroes: target ${formationSummary[2]}; this formation is used for battle session only and does not write economy.`;
    }
    const heroFormationLine = value.match(/^(.+)\.\s+(.+)\s+Lv\.(.+)\s+战力\s+(.+)$/);
    if (heroFormationLine) {
      return `${heroFormationLine[1]}. ${heroFormationLine[2]} Lv.${heroFormationLine[3]} Power ${heroFormationLine[4]}`;
    }
    const emptyFormationLine = value.match(/^(.+)\.\s+空位$/);
    if (emptyFormationLine) {
      return `${emptyFormationLine[1]}. Empty Slot`;
    }
    const heroStars = value.match(/^Lv\.(.+)\s+星\s+(.+)$/);
    if (heroStars) {
      return `Lv.${heroStars[1]} Stars ${heroStars[2]}`;
    }
    return this.translateTextFragments(value);
  }

  private translateInlineText(value: string): string {
    const exact = STATIC_TEXT_TRANSLATIONS[this.language]?.[value];
    if (exact) {
      return exact;
    }
    return this.translateTextFragments(value);
  }

  private translateTextFragments(value: string): string {
    const replacements = FRAGMENT_TEXT_TRANSLATIONS[this.language];
    if (!replacements) {
      return value;
    }
    return replacements.reduce((text, [source, target]) => text.split(source).join(target), value);
  }

  private loadLanguage(): LootChainLanguage {
    try {
      const value = sys.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return this.isLanguage(value) ? value : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  private saveLanguage(language: LootChainLanguage): void {
    try {
      sys.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Local storage can be unavailable in restricted preview containers; the in-memory value still applies.
    }
  }

  private isLanguage(value: string | null): value is LootChainLanguage {
    return value === 'zh-CN' || value === 'en-US';
  }
}

export const lootChainI18n = new LootChainI18n();
