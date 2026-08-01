# 大厅参考图功能拆解

参考图：`D:\project\lootchain-cocos\docs\ui-reference\dragonheir\lobby\lobby.png`

本文从产品视角拆解参考大厅的可见功能点，用于后续规划 LootChain Cocos 大厅。当前阶段只做产品拆解与交互定义，不开放抽卡、英雄、背包、USDT、资金池或任何经济写入口。

## 2026-06-14 当前落地补充

- 当前 Cocos 大厅左上玩家等级只读展示来自 `GET /api/player/me/lobby.playerLevel`。
- Stage 6S 后，年度主线 R1-R393 首通获得的玩家经验会由后端按 `user_level_config.need_exp` 自动回写 `game_user.player_level`；Cocos 只回读展示，不提供玩家手动升级或领取升级奖励入口。
- 完整 R1/R2/R3 后累计玩家经验为 `190`，当前等级阈值下应显示 Lv.2，并继续推荐 `MAIN_1_4`；完整 R1-R9 后累计玩家经验为 `1750`，应显示 Lv.8 并解锁 `MAIN_2_1`；Stage 6R 后完整 R1-R15 应累计到 `5950`，显示 Lv.15 并推荐阶段保护的 `MAIN_2_7`。
- `MAIN_2_1` 在 Stage 6I 已开放一次性真实首通；`MAIN_2_2` 在 Stage 6M 已开放一次性真实首通；`MAIN_2_3` 在 Stage 6N 已开放一次性真实首通；`MAIN_2_4` 在 Stage 6P 已开放一次性真实首通；`MAIN_2_5` 在 Stage 6Q 已开放一次性真实首通；`MAIN_2_6` 在 Stage 6R 已开放一次性真实首通；Stage 6S 后主线扩展为 `MAIN_1_1` 至 `MAIN_25_16` 的年度真实首通链路，`MAIN_2_7` 是 `R16`，最终 `MAIN_25_16` 是 `R393`。
- Stage 6E 后，`GET /api/player/me/lobby.levelProgress` 提供经验进度，左上 EXP 小牌显示百分比，资料页显示 `当前经验/下一级门槛`、下一级差距和英雄等级上限。
- 冒险 stage 新增 `unlockHint`，冒险详情在锁定态直接展示后端锁定原因，例如完成 R3 后 `MAIN_2_1` 显示需要 Lv.8、当前 Lv.2。
- Stage 6F 后，冒险 stage 进一步提供 `lockReasonCode/levelGap/requiredLevelNeedExp/expToRequiredLevel`，`MAIN_2_1` 在 Lv.2、190 EXP 下展示还差 6 级 / 1560 EXP。
- Stage 6G 后，冒险 stage 进一步提供 `nextGuidanceTitle/nextGuidanceText/growthSourceSummary/growthSourceStatus/growthSourceHint/repeatableExpAvailable`，锁定态明确提示首通经验已用完、暂无重复经验入口，避免误导玩家刷关。
- Stage 6H 后，`MAIN_1_4` 至 `MAIN_1_9` 作为第一章成长桥开放真实首通结算；冒险地图围绕当前推荐/选中关卡显示，新增关卡后不会只显示早期节点。
- Stage 6I 后，`MAIN_2_1` 作为第二章入口开放真实首通结算；Stage 6L 后该首通会追加 `第二章预热经验 500`；Stage 6M 后 `MAIN_2_2` 作为断誓大厅开放真实首通结算；Stage 6N 后 `MAIN_2_3` 作为灰烬回廊开放真实首通结算；Stage 6P 后 `MAIN_2_4` 作为圣像断桥开放真实首通结算；Stage 6Q 后 `MAIN_2_5` 作为圣堂裂口开放真实首通结算；Stage 6R 后 `MAIN_2_6` 作为圣堂裂隙深处开放真实首通结算；Stage 6S 后年度主线继续开放到 `MAIN_25_16`，不限制每日首通次数，重复挑战仍不能刷经验或掉落。
- Stage 6J 后，`MAIN_2_2` 的运行期保护和 DB 守卫已补强：强制 start 不写 `battle_session`，活跃奖励规则必须为 `0`，Preview freshness 可明确诊断 target/chunk 缺失并已在本机恢复通过。
- Stage 6K 后，`MAIN_2_2` 成为只读预热详情：冒险页优先显示该推荐锁定关卡，奖励标题为“奖励只读预览（当前不发放）”，`PHASE_LOCKED` 按钮为“仅预览”，并继续禁止战斗会话、体力、奖励和主线推进写入。
- Stage 6S 后，冒险页按年度公式开放 `MAIN_1_1..MAIN_25_16` 的编队/战斗入口，并通过前置进度与出战阵容推荐战力控制推进；Cocos 仍拦截 `MAIN_25_17`、`MAIN_26_1` 等越界关卡，只切换预览或提示不可用。
- Stage 7 后，冒险、编队和英雄详情形成完整成长引导：冒险详情显示当前阵容战力与差距，战力不足时引导去英雄详情升级；编队页展示目标关卡、推荐战力、当前阵容战力、差距和达标状态；英雄详情显示金币/英雄经验书持有量，`level-up` 成功后回读资料、英雄、背包和冒险再返回挑战。

## 整体结构

大厅采用“全景场景地图 + 固定 HUD”的结构：

- 背景是暗黑城堡全景，场景建筑本身承载功能入口。
- 顶部是玩家状态、资源栏与系统入口。
- 左侧是限时活动与商业化/运营入口列表。
- 中央场景中散布主要玩法入口。
- 右侧是高优先级挑战/副本卡片。
- 底部是常驻主导航、聊天栏和主线冒险入口。

## 顶部区域

### 左上角玩家信息

可见元素：

- 玩家头像与头像框。
- 等级：示例 `Lv.89`。
- 玩家名称：示例 `LootChain`。
- 名称旁有一个小图标，可能是阵营、称号、认证、VIP 或复制/详情入口。
- 战力：示例 `2,658,490`。
- `EXP` 小按钮或经验标识。

点击玩家信息后建议弹出“玩家资料面板”，展示：

- 基础信息：头像、头像框、昵称、UID、服务器、注册时间、最后登录时间。
- 成长信息：等级、当前经验、升级所需经验、体力上限、当前战力。
- 社交信息：公会名称、称号、阵营、好友数量。
- 资产摘要：金币、钻石、核心材料等只读展示。
- 进度摘要：主线章节、深渊层数、世界 Boss 最高伤害、竞技段位。
- 账号信息：账号绑定状态、钱包绑定状态、登录方式。
- 操作按钮：复制 UID、修改昵称、更换头像/头像框、查看详细属性、联系客服、切换账号/退出登录。
- 风控提示：账号状态、封禁/冻结原因、实名或安全绑定状态。

### 顶部资源栏

可见元素：

- 体力/能量：`87/180`，带 `+`。
- 金币：`3,456K`，带 `+`。
- 红色宝石/钻石：`8,888`，带 `+`。
- 紫色水晶/高级材料：`2,450`，带 `+`。

点击资源或 `+` 后建议弹出：

- 资源说明：用途、当前数量、今日获取、今日消耗。
- 获取途径：任务、副本、活动、商店兑换等跳转。
- 购买/兑换入口：仅在对应经济规则和后端接口开放后启用。
- 体力特殊信息：自然恢复倒计时、下次恢复时间、今日购买次数、上限。

当前 LootChain 阶段注意：这些入口前期只能做只读或“暂未开放”，不能新增经济写入口。

### 顶部系统图标

可见元素：

- 好友/社交图标。
- 邮件图标。
- 设置齿轮。
- 菜单图标，右上有红点。

需要开发：

- 好友/社交：好友列表、申请、黑名单、最近互动、赠送体力入口。
- 邮件：系统邮件、奖励邮件、公告邮件、领取状态、批量领取。
- 设置：音效、音乐、画质、语言、账号、安全、客服、隐私协议、退出登录。
- 菜单：更多功能集合，例如公告、排行榜、兑换码、客服、社区、战斗记录、图鉴快捷入口。
- 红点系统：统一红点数据模型、优先级、清除规则、跨入口同步。

## 左侧活动列表

可见条目：

- `活动`：倒计时 `21:47:56`。
- `深渊召唤`：状态 `UP召唤中`。
- `圣契之路`：倒计时 `15天 21小时`。
- `黑市`：状态 `刷新中`。
- `首充礼包`：倒计时 `05:47:56`。

每个条目都有图标、标题、状态/倒计时和红点。

需要开发：

- 活动中心：活动列表、详情页、任务进度、奖励预览、领取状态。
- 限时召唤入口：卡池展示、UP 信息、倒计时、概率说明。当前阶段仅预留，不开放抽卡。
- 圣契之路：成长通行证/阶段任务/里程碑奖励。
- 黑市：限时商店、刷新倒计时、商品列表。当前阶段仅预留。
- 首充礼包：充值/礼包入口。当前阶段必须保持关闭或占位，不能接入真实支付/领取。
- 活动倒计时服务：本地展示必须以后端时间为准，避免客户端改时间。
- 运营配置：活动图标、排序、开始/结束时间、红点、跳转目标。

## 中央场景玩法入口

可见功能点：

- `召唤祭坛`
- `公会`
- `排行榜`
- `旅者集会`
- `熔铸工坊`
- `商店`
- `深渊之门`
- `战役 第24章 暗影回廊`

需要开发：

- 场景热点系统：每个建筑入口有点击区域、标签、红点、锁定态、开放条件、引导高亮。
- 召唤祭坛：抽卡入口、卡池列表、概率展示、历史记录。当前阶段只预留，不开放。
- 公会：公会信息、成员、申请、捐献、活动。未开放时显示解锁条件。
- 排行榜：战力、关卡、Boss、竞技、深渊等榜单。
- 旅者集会：可能对应社交、委托、集市、公告或旅团活动，需要二次定义。
- 熔铸工坊：装备打造、强化、分解、材料合成。当前阶段只预留。
- 商店：普通商店、兑换商店、礼包商店。当前阶段只预留。
- 深渊之门：深渊玩法入口，展示层数、进度、奖励、挑战按钮。
- 战役：主线章节入口，展示当前章节、关卡进度、推荐战力、扫荡/挑战入口。

## 右侧挑战卡片

可见卡片：

- `世界BOSS`：状态 `挑战中`。
- `无尽深渊`：进度 `120层`。
- `跨服竞技`：状态 `赛季进行中`。
- `资源副本`：状态 `今日双倍`。

需要开发：

- 卡片组件：背景图、标题、状态标签、进度、红点、倒计时、跳转。
- 世界 Boss：Boss 信息、开放时间、伤害排行、奖励预览、挑战记录。
- 无尽深渊：当前层数、历史最高层、层奖励、排行榜。
- 跨服竞技：赛季信息、段位、排名、匹配入口、赛季奖励。
- 资源副本：副本类型、剩余次数、今日加成、推荐战力、扫荡入口。

## 底部导航

可见元素：

- 左下角罗盘/世界入口。
- 常驻导航：`英雄`、`背包`、`圣契`、`图鉴`、`任务`、`锻造`、`商店`。
- 部分按钮带红点。
- 底部聊天栏：示例 `[世界] LootChain: 欢迎来到LootChain的世界!`
- 右下角主按钮：`冒险 24-15 暗影之堡`。

需要开发：

- 底部导航容器：图标、文字、红点、选中态、未开放态。
- 英雄：英雄列表、详情、升级、升星、觉醒、装备。经济写入口未开放前只做只读或占位。
- 背包：道具列表、分类、详情、使用/出售。当前阶段不开放写入口。
- 圣契：可能对应通行证、契约系统或成长线，需要产品二次定义。
- 图鉴：英雄、怪物、装备、成就收集。
- 任务：主线、每日、周常、成就、活动任务。
- 锻造：装备打造/强化入口，当前阶段只预留。
- 商店：商店入口，当前阶段只预留。
- 聊天：频道切换、消息列表、发送框、系统公告、屏蔽/举报。
- 冒险主按钮：当前主线关卡、章节名、推荐战力、继续挑战、扫荡、剧情入口。

## 横向基础系统

为了支撑大厅，需要先开发这些基础能力：

- HUD 适配：根据 Cocos 可视区域自适应顶部、底部、左右栏位置。
- 资源显示格式化：K/M/B、千分位、上限展示、颜色区分。
- 红点系统：模块级、入口级、子功能级红点聚合。
- 倒计时系统：统一服务端时间、暂停/恢复、跨天刷新。
- 模块开放条件：等级、主线进度、服务器开服天数、活动时间。
- 弹窗管理器：单弹窗、二级弹窗、遮罩、返回键、关闭恢复。
- 导航路由：场景入口到功能页的统一跳转。
- 引导系统：新手引导、强制点击、功能解锁提示。
- 空状态与未开放状态：所有未完成系统统一显示“暂未开放/敬请期待”。
- 音效与动效：点击、红点、倒计时、入口呼吸光、卡片 hover/press。

## 建议开发顺序

第一阶段，大厅壳与只读展示：

- 大厅背景与 HUD 框架。
- 左上玩家信息只读展示与资料弹窗。
- 顶部资源栏只读展示。
- 底部导航与中央热点占位。
- 右侧挑战卡片占位。
- 红点、倒计时、未开放弹窗基础组件。

第二阶段，低风险只读功能：

- 邮件列表只读/已读状态。
- 公告/活动详情只读。
- 排行榜只读。
- 图鉴只读。
- 主线章节展示。

第三阶段，受控写入口：

- 任务领取、邮件领取、背包使用、商店兑换、抽卡、英雄养成等必须等待服务端经济规则、事务、日志、风控和测试齐备后再开放。

## 当前边界

- 本文仅做产品拆解，不代表当前阶段已开放这些功能。
- 当前 Cocos 阶段仍以登录页、资源加载页、大厅背景页为准。
- 2026-06-12 当前战斗仅开放 R1 主线首通真实结算：`MAIN_1_1` 首次胜利可通过既有战斗 start/settle 接口扣体力 `6`、发放 `玩家经验50/GOLD300/LOW_ENHANCE_STONE x2` 并推进 `MAIN_1_2`。
- R1 不等于全面战斗经济开放：重复刷关掉落、副本、Boss、排行、扫荡、资金池奖励、USDT、EX V1、后台补发/重结算、背包 use/sell/batch-use 和英雄养成仍关闭。
- Cocos 客户端不提交奖励、体力、进度、货币或背包字段，只展示后端权威结算回执。
- 不开放 EX V1。
- 不新增任何经济写入口。
- 不改变概率、消耗、保底、奖励、USDT 审核、资金池释放等经济规则。

## 2026-05-28 阶段 1 实施记录

本轮开始大厅开发阶段 1，只落地参考图左上玩家信息区域与资料弹窗：

- `LootChainGameRoot` 大厅页从“资源准备完成”占位面板切换为 HUD 渲染链：`renderLobbyHud()` -> `renderLobbyPlayerInfo()`。
- 左上玩家信息入口包含头像框、等级、玩家名、战力、EXP 标识，并按 `stageLeft/stageTop/uiScale` 自适应定位。
- 点击玩家信息后打开 `LobbyProfilePanel` 只读资料弹窗，展示 UID、服务器、等级、经验、战力、体力、账号状态、登录方式、钱包绑定状态和脱敏钱包地址。
- 弹窗当前只有关闭能力，不开放复制 UID、修改昵称、换头像、退出登录、绑定钱包等写操作。
- Cocos 客户端新增 `PlayerProfileApi.lobbyProfile()`，只调用 `GET /api/player/me/lobby`。
- 阶段 1 未开放顶部资源栏、左侧活动、中央热点、右侧挑战卡片、底部导航、聊天、冒险按钮。
- 大厅阶段 1 已恢复动态背景视频：`VideoPlayer.stayOnBottom = true` 保持视频在 Canvas 底层，poster 只作为首帧兜底并在 `PLAYING` 后淡出，HUD 继续在 Canvas 上层渲染。
- 叠在背景上的大厅 UI 必须走统一舞台安全区：顶部、左侧、右侧、底部、弹窗都按 `stageLeft/stageRight/stageTop/stageBottom` 派生的 `safeLeft/safeRight/safeTop/safeBottom` 定位。
- 后续新增顶部资源栏、左侧活动、右侧挑战卡、底部导航和中央热点时，必须同步补 `scripts/check-layout.mjs` 多分辨率边界校验，避免只在当前预览分辨率下“碰巧正确”。

### 左上玩家信息 UI 深化

- 左上玩家信息从普通矩形卡片改为参考图方向的徽章式铭牌：大头像徽章 + 右侧半透明暗金底纹 + 三层文字排版。
- 头像不再使用缩写圆牌，改为运行时绘制的盔甲头像剪影、金属圆环和放射形外框。
- EXP 标识改为贴附在头像底部的小铜金牌。
- 玩家名旁增加小型金色徽记，战力下方增加细金线和红色菱形收尾，弱化现代卡片感。
- 左上组件使用 `lobbyHudScale()` 控制缩放下限，避免小分辨率下 UI 缩得无法识别。
- 返修约束：避免卡通化的放射三角、过亮边框和大面积实体色；头像框应保持暗金属、低饱和、细节克制。
- 返修约束：左对齐文字坐标必须按文本框左边界处理，不能再使用节点中心点导致文字压住头像。
- 返修约束：左上铭牌不显示接口状态调试文案，避免污染大厅 HUD。
- 最终方向：左上铭牌主体改为高质量图片资产 `assets/resources/ui/lobby/lobby_player_info_panel.png`，代码只覆盖动态文字和点击区域，避免用 Graphics 手绘导致品质和参考图差距过大。
- Stage 1A 修正：铭牌使用 `lobbyHudEdgeInset()` 贴近参考图左上角，仍由舞台安全区派生；动态文字宽度收窄，避开图片资产中央饰件。
- Stage 1A 修正：玩家名与战力开启文本缩放，所有铭牌动态文字增加黑色描边，提高背景视频播放时的可读性。
- Stage 1A 修正：图片资产首帧未加载时，兜底 Graphics 铭牌会补绘头像，避免出现只有框和文字的空状态。

## 2026-05-29 Stage 1B top-left HUD visual acceptance update

- The provided top-left player reference has been translated into the current Cocos-only lobby HUD as a compact `540x218` logical composition.
- The project asset `assets/resources/ui/lobby/lobby_player_info_panel.png` was rebuilt at `1080x436` so the avatar frame, EXP plate, dark fantasy backing, and underline stay sharp after Cocos scaling.
- Runtime text remains dynamic instead of baked into the bitmap: `Lv`, player name, combat power, and `EXP` are rendered by `LootChainGameRoot.renderLobbyPlayerInfo()` with shrink-safe boxes.
- The previous overlap root cause was addressed by removing the `1600x577` layout dependency and zeroing SpriteFrame trim metadata for the new asset grid.
- Layout guardrails now include HUD asset dimensions, trim metadata, internal text slot separation, avatar safe-zone separation, and multi-resolution bounds.
- Stage boundary unchanged: this is read-only lobby display work only; no gacha, hero, bag, USDT, fund-pool, EX V1, or economy write surface was opened.

### Revision

- The first rebuilt bitmap still read as a custom panel and was not close enough to the reference. It has been replaced with an art-only asset: high-quality portrait/frame/EXP on the left, transparent right-side text area, and no heavy dark backing panel.
- The runtime name sigil is now a thin gold anchor-like shape, and the combat underline is a plain thin gold line without the red diamond ornament.

### High Quality Avatar Frame Regeneration

- The screenshot-crop avatar frame was replaced with a newly generated high-resolution dark-fantasy avatar medallion from imagegen.
- The green-screen generated source was locally keyed to transparency, despilled, scaled, and composited into `assets/resources/ui/lobby/lobby_player_info_panel.png` on the same `1080x436` HUD canvas.
- The right-side player text area remains transparent and driven by Cocos runtime labels; only the avatar medallion and blank EXP plate are bitmap art.

### Profile Dialog Close Flash Fix

- The top-left player profile dialog is now treated as an overlay layer instead of a full lobby rerender trigger.
- Closing the dialog removes only `LobbyProfileDim` and `LobbyProfilePanel`, so the lobby poster/video background remains stable and the login background should not flash through.
- Profile data refresh updates only the HUD/profile overlay nodes.

### Stage 1C Top Resource Bar Implementation

- Implemented the first top-resource-bar pass in the Cocos lobby HUD.
- Current resources:
  - Stamina: read from `PlayerLobbyProfileVO.stamina/maxStamina`.
  - Coin/ruby/crystal: visible as reference-style visual placeholders only, because no read-only asset summary contract is in scope yet.
- The implementation intentionally excludes any obtain/purchase/claim path. Resource cells are visual HUD cells, and their visible `+` marks are disabled art only.
- The resource bar adaptively drops lower-priority placeholder cells on narrower stages, and hides entirely only if there is no safe space beside the player HUD.
- `scripts/check-layout.mjs` mirrors the placement formula and checks the resource bar against desktop, tablet, mobile landscape, mobile portrait, and minimum viewport geometry.
- This completes the "top resource bar read-only display" item from Stage 1 without changing economy rules, opening EX V1, or adding an economy write surface.

### Stage 1D Reference-Style HUD Skeleton

- Implemented a broader lobby HUD skeleton based on `docs/ui-reference/dragonheir/lobby/lobby.png`.
- Added top-right system icons, left activity rail, center scene hotspot plaques, right challenge cards, bottom navigation, chat preview, compass, and red adventure button.
- The visual direction is dark-gold gothic UI with thin transparent panels, icon medallions, red-dot markers, and restrained labels over the lobby video/background.
- Current implementation uses Cocos `Graphics` and dynamic labels rather than bitmap screenshot crops, so the UI remains sharp and editable.
- All module entries remain placeholder-only in this stage. Buttons do not call gacha, hero, bag, shop, reward, fund-pool, or other economy/gameplay write APIs.
- `scripts/check-layout.mjs` was extended to validate the new HUD regions across the existing multi-viewport set.

### Stage 1D Interaction Refinement

- Center scene function-point labels should be treated as labels attached to buildings, not independent floating menu buttons.
- The current implementation moves labels closer to their matching background buildings and increases label font size to better match the reference image proportions.
- Every center function point now has an invisible building hit area. Hovering or clicking the building area triggers the same placeholder content as the visible label.
- Clicking a building or label plays a short red-gold click pulse to make the interaction visible.
- These hotspots remain locked placeholders in the current stage. They must not call economy/gameplay write APIs until the corresponding module, backend contract, risk controls, and tests are explicitly opened.

### Stage 1D Hotspot Alignment Correction

- The first transparent-hit-area pass was visually too broad in preview and did not match the building silhouettes well enough.
- Hotspot data should remain per-building, not shared:
  - Label position and label width are separate from the clickable building hit area.
  - Building hit areas should cover the visible building mass only, not the whole surrounding scenery.
  - Hover should not expose full hit-area rectangles; it should use small local target/glow feedback.
- Current implementation follows that rule with independent coordinates for summon altar, guild, ranking, traveler gathering, forge, abyss gate, campaign, and shop.

### Stage 1D Hotspot Alignment Correction V2

- The second correction is calibrated to the active 16:9 lobby poster, not only to the 1536x1024 reference crop.
- Center labels are now smaller and closer to building-nameplate scale, with revised anchors for all eight center function points.
- Building hit areas are intentionally narrower than the visible plaque area where needed, so hover/click feels tied to the building rather than to empty scenery.
- The stage boundary remains unchanged: all entries are local unopened placeholders and no economy/gameplay write API is called.

### Stage 1D Module Split

- `LootChainGameRoot` should remain the scene root, not the long-term home for every lobby UI detail.
- Lobby HUD implementation is now separated into:
  - `LobbyHudRenderer.ts` for actual Cocos node rendering and local UI interaction.
  - `LobbyHudConfig.ts` for adjustable visual/content data, especially central hotspot anchors and hit areas.
  - `LobbyHudTypes.ts` for HUD contracts, constants, and type definitions.
- Future central-hotspot visual tuning should start in `LobbyHudConfig.ts`, then rely on `scripts/check-layout.mjs` for bounds validation.
- The split is intentionally UI-only and does not change module-opening status. All entries remain placeholder-only until backend contracts and risk controls are explicitly opened.

### Stage 1E Profile Dialog Module Split

- The readonly player profile dialog has been separated from the scene root.
- `LootChainGameRoot` remains responsible for lobby profile data ownership, route/view lifecycle, overlay open/close state, and background stability.
- `LobbyProfileDialogRenderer.ts` now owns the visible dialog composition: dim layer, panel, close button, avatar/header, profile rows, status text, readonly note, and wallet masking.
- This keeps the profile modal aligned with the lobby modularization direction while preserving the existing no-full-rerender behavior when opening or closing the dialog.
- Current product boundary is unchanged: the profile dialog remains readonly and does not expose edit nickname, avatar changes, wallet binding, logout, resource claim, purchase, or other write operations.

### Stage 1F Background Controller Split

- The lobby background poster/video controller has been separated from the scene root.
- `LootChainGameRoot` remains responsible for loading resources and switching views; `LobbyBackgroundController.ts` now owns the poster/video runtime, fade, replay, autoplay retry, and release/reset behavior.
- The visual behavior is intentionally unchanged: poster covers the full canvas, video stays behind Cocos HUD through `stayOnBottom`, and poster remains visible on video errors.
- This split prepares future lobby background/VFX work without mixing video lifecycle code into player HUD, modal, or feature-entry rendering.
- Product boundary is unchanged: the background controller is presentation-only and introduces no gameplay, reward, purchase, claim, or economy write path.

### Stage 1G Avatar Renderer Split

- The shared lobby avatar renderer has been separated from the scene root.
- `LobbyAvatarRenderer.ts` now owns the Cocos `Graphics` composition for the fallback dark-fantasy avatar used by the top-left HUD and profile dialog.
- Keeping avatar rendering as a focused module makes future avatar-frame or portrait replacement work safer, because HUD layout and modal data rendering no longer need to carry low-level drawing details.
- Product boundary is unchanged: this is visual presentation only and introduces no avatar edit, NFT/avatar-frame ownership, wallet binding, purchase, reward, or other write operation.

### Stage 1H Profile State Split

- The readonly lobby profile state and normalization layer has been separated from the scene root.
- `LobbyProfileState.ts` now owns fallback profile construction, profile loading/error state, current-user validation, and sanitization of the lobby profile VO.
- `LootChainGameRoot` remains the owner of the actual API call and UI refresh timing, keeping data ownership explicit while reducing scene-root responsibilities.
- Product boundary is unchanged: profile data remains readonly and does not expose nickname edits, avatar edits, wallet binding, logout, reward claim, or any economic write operation.

### Stage 1I Loading Renderer Split

- The lobby resource-loading screen renderer has been separated from the scene root.
- `LobbyLoadingRenderer.ts` now owns the loading mask/panel, message/error presentation, percentage display, progress bar, and retry button.
- `LootChainGameRoot` remains responsible for loading state, ticket guards, actual resource requests, and the transition into the lobby.
- Product boundary is unchanged: this screen only reports local resource loading progress and does not expose gameplay, reward, purchase, claim, or economy writes.

### Stage 1J Resource Loader Split

- The lobby poster/video resource loader has been separated from the scene root.
- `LobbyResourceLoader.ts` now owns Cocos resource requests for the lobby poster and video clip, including the `Texture2D` fallback used when the poster SpriteFrame path is unavailable.
- `LootChainGameRoot` remains responsible for loading tickets, progress/error state, stale-flow protection, and switching into the lobby after resources are ready.
- `scripts/check-layout.mjs` now treats the resource loader as a required lobby module and scans it for forbidden economy/write tokens.
- Product boundary is unchanged: this is local resource loading only and does not expose gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes.

### Stage 1K Login Renderer Split

- The login page and login dialog renderer has been separated from the scene root.
- `LoginRenderer.ts` now owns the visible login UI composition: logo, account-login button, right-side rail, dialog panel, input placement, third-party placeholders, agreement row, back button, and enter-game button.
- `LootChainGameRoot` remains responsible for state and behavior: current view routing, agreement flag, account/password input references, status label, dev-login API call, loading transition, and lobby/profile loading.
- `scripts/check-layout.mjs` now treats the login renderer as a required module, blocks API/gameplay routing inside it, and validates the dialog's internal controls against the multi-resolution layout set.
- Product boundary is unchanged: login still only uses dev-login and does not expose gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes.

### Stage 1L Adaptive Layout Resolver Split

- The adaptive viewport/stage layout resolver has been separated from the scene root.
- `AdaptiveStageLayoutResolver.ts` now owns visible-size detection, active stage-node bounds, reference resolution constants, minimum viewport clamps, and safe-area derivation.
- `LootChainGameRoot` remains responsible for lifecycle, route/view state, `renderBase()`, root sizing, content cleanup, and `makeLayoutKey()` because those depend on current view and overlay state.
- `UiLayout` is shared through `LobbyHudTypes.ts`, so login, loading, lobby HUD, and the root scene now consume the same structural layout contract.
- `scripts/check-layout.mjs` now requires the adaptive layout module, blocks layout formula code from returning to the root script, and keeps the supported viewport checks tied to the same formula.
- Product boundary is unchanged: this is local layout calculation only and does not expose gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes.

### Stage 1M UI SpriteFrame Cache Split

- The UI SpriteFrame cache and preload logic has been separated from the scene root.
- `UiSpriteFrameCache.ts` now owns cached SpriteFrames, in-flight load tracking, `resources.load(path, SpriteFrame)`, login image preloading, and lobby player-info panel preloading.
- `LootChainGameRoot` remains responsible for Cocos Inspector-bound frame overrides and shared UI node construction. This keeps `logoFrame`, `mainButtonFrame`, and `rightRailFrames` scene bindings intact.
- `addSprite()` and `addImageButton()` continue to be root host primitives, but SpriteFrame resolve/request work is delegated to the cache module.
- `scripts/check-layout.mjs` now requires the cache module, blocks business/API/UI-node responsibilities inside it, and prevents cache maps/loaders from returning to the root script.
- Product boundary is unchanged: this is local UI asset loading only and does not expose gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes.

### Stage 1N Readonly Profile Loader Split

- The readonly lobby profile loading flow has been separated from the scene root.
- `LobbyProfileLoader.ts` now owns the `LobbyProfileState`, loading/error transitions, stale-user checks, and the readonly `PlayerProfileApi.lobbyProfile()` request.
- `LootChainGameRoot` remains responsible for login sequencing, lobby resource loading, profile dialog open/close state, and the actual overlay node refresh implementation.
- The loader can only notify root through `isLobbyViewActive()` and `refreshLobbyOverlay()`, preserving the no-full-lobby-rerender rule that prevents background flashes.
- `scripts/check-layout.mjs` now requires the profile loader module, blocks the profile loading implementation from returning to root, and enforces `PlayerProfileApi` as exact read-only `GET /api/player/me/lobby`.
- Product boundary is unchanged: profile data remains readonly and does not expose gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes.

### Stage 1O Loading Flow Controller Split

- The lobby loading flow controller has been separated from the scene root.
- `LobbyLoadingFlow.ts` now owns loading ticket state, progress/message/error state, retry startup, stale-load protection, and the local poster/video resource loading orchestration.
- `LootChainGameRoot` remains responsible only for view switching and narrow host callbacks: show/refresh loading, write loaded poster/video into the lobby background controller, and enter the lobby.
- `LobbyLoadingRenderer.ts` remains pure presentation, while `LobbyResourceLoader.ts` remains pure Cocos resource loading. This keeps loading UI, loading flow, and resource IO independently replaceable.
- `scripts/check-layout.mjs` now requires the loading-flow module, scans it for forbidden gameplay/economy tokens, and blocks loading ticket/progress implementation from returning to the scene root.
- `docs/api-contract.md` was aligned with the current stage: `dev-login` plus readonly lobby profile are the only active Cocos client API surfaces.
- Product boundary is unchanged: this is local resource-loading orchestration only and does not expose gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes.

### Stage 1P Login Flow Split

- The Cocos-only login flow has been separated from the scene root.
- `LoginFlow.ts` now owns agreement state, account input references, default dev-user fallback, `userId` parsing, the `PlayerAuthApi.devLogin(userId)` request, login error formatting, and the last token name used by loading retry.
- `LootChainGameRoot` remains responsible for route/view lifecycle and only exposes narrow login host callbacks: API base URL setup, status text, readonly profile reset/loading, and loading-flow start.
- `LoginRenderer.ts` remains presentation-only. It can render account inputs and buttons, but it does not call `dev-login`, profile APIs, gameplay APIs, or economy APIs.
- `scripts/check-layout.mjs` now requires the login-flow module, scans it for forbidden gameplay/economy responsibilities, and blocks login implementation details from returning to the root scene script.
- Product boundary is unchanged: login still only uses `POST /api/player/auth/dev-login`; profile remains readonly through `GET /api/player/me/lobby`; no gameplay, reward, purchase, claim, fund-pool, EX V1, or economy writes are exposed.

### Stage 1Q Shared Text And Status Modules

- Shared formatting is now centralized in `assets/scripts/scenes/UiTextFormatter.ts`.
- Status text presentation is now centralized in `assets/scripts/scenes/StatusPresenter.ts`.
- The status presenter resets its label reference when the content root is cleared, avoiding invisible status updates after view transitions.
- Product impact: no feature behavior changed. This is a maintainability step before further lobby UI polish.
- Boundary unchanged: login/profile are the only active client API surfaces, and profile remains readonly.

### Stage 1R UI Primitive Factory Split

- Shared Cocos UI primitive construction is now centralized in `assets/scripts/scenes/UiPrimitiveFactory.ts`.
- Login, loading, HUD, profile dialog, and background modules continue to call the same host methods, but the root no longer owns low-level drawing/feedback/password-mask implementation.
- Product impact: future visual tuning can update labels, buttons, panels, image buttons, and pointer feedback in one place without reopening gameplay or economy scope.
- Boundary unchanged: all lobby entries remain local placeholders; no gameplay/economy write API was added.

### Stage 1S Content Root Controller Split

- Cocos content-root lifecycle is now centralized in `assets/scripts/scenes/UiContentRootController.ts`.
- The root no longer stores `contentRoot`; it delegates root sizing, UI node creation, node removal, full clearing, and content-root recovery.
- Route/view switching intentionally remains in `LootChainGameRoot.ts` as part of root lifecycle responsibility.
- Product impact: this reduces scene-root complexity and makes later lobby visual work less likely to accidentally break node cleanup or root sizing.
- Boundary unchanged: only `POST /api/player/auth/dev-login` and readonly `GET /api/player/me/lobby` are active; no EX V1 or economic write path was opened.

### Stage 1T Chinese Code Comments

- Added Chinese comments to the current Cocos frontend implementation so future product/UI/code review can follow each module's purpose faster.
- Comment focus:
  - Module responsibility and ownership.
  - Adaptive layout and multi-resolution decisions.
  - Placeholder-only lobby entry boundaries.
  - Async stale-request/ticket guards.
  - Resource fallback and video/poster behavior.
  - Readonly profile display and wallet masking.
- Product impact: no visible behavior changed. This is a maintainability pass only.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: login/profile remain the only active client API surfaces; no gameplay/economy write path was opened.

### Stage 1U HUD Layout Metrics Split

- Lobby HUD geometry calculation is now separated from visible HUD drawing.
- `LobbyHudLayout.ts` owns shared formulas for HUD scale, safe edge inset, and the top-left player-info panel bounds.
- `LobbyHudRenderer.ts` still renders the same UI nodes, but delegates these formulas so later visual modules can reuse one source of truth.
- Product impact: no visible behavior changed. This is a maintainability and multi-resolution safety step before splitting more HUD regions.
- Guardrail impact: `scripts/check-layout.mjs` now verifies the new module exists and blocks these geometry formulas from moving back into the renderer.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled `tsc.cmd` focused no-emit check -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: lobby entries remain local placeholders; no gameplay/economy write path was opened.

### Stage 1V Top HUD Renderer Split

- The lobby top HUD is now separated from the main HUD renderer.
- `LobbyTopHudRenderer.ts` owns player info, resource bar, and top-right system icons.
- `LobbyHudRenderer.ts` remains responsible for the remaining lobby overlay regions: activity rail, scene hotspots, challenge rail, bottom navigation, chat preview, and adventure button.
- Product impact: no visible behavior changed. The split reduces the size and responsibility of the main HUD renderer before the next visual modules are separated.
- Guardrail impact: `scripts/check-layout.mjs` requires the new module and blocks top-HUD implementation tokens from moving back into the main renderer.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - `assets/scripts/**/*.ts` Chinese-content scan -> all TypeScript files contain Chinese comments or Chinese UI text.
  - `git diff --check` -> passed, with only existing LF/CRLF conversion warnings.
- Boundary unchanged: resource plus signs and all system icons remain local placeholder UI; no gameplay/economy write path was opened.

### Stage 1W Unified Placeholder Dialog

- Product stage changed from module splitting to visible lobby UX polish.
- All currently unopened lobby entries now share one local feedback pattern: a dark-gold modal with module title, “功能暂未开放”, explanatory text, dim close, and “知道了” close button.
- Covered entries:
  - Activity rail items.
  - Central building hotspots and their visible plaques.
  - Right challenge cards.
  - Bottom navigation items.
  - Adventure main button.
  - Top-right system icons.
- Product reason: a single modal makes the current stage boundary clearer than scattered status text and creates the base empty/unopened-state behavior listed in the first-stage lobby plan.
- UX rule: hover may still show a light status hint, but click must use the unified modal.
- Safety rule: the modal is local-only. It cannot jump into gameplay, claim rewards, purchase resources, open EX V1, or call any new economy endpoint.
- Guardrail impact: `scripts/check-layout.mjs` now checks placeholder dialog method tokens, node names, no-full-lobby-rebuild behavior, and adaptive panel bounds.
- Verification completed:
  - `npm.cmd run check:layout` -> passed with `layout ok`.
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed.
  - Touched-code Chinese comment/text scan -> passed.
- Boundary unchanged: no gameplay/economy write path was opened.

### Stage 1X Multi-Role Lobby Polish

- Product, design, art, UI, development, interface-boundary, review, and test roles were used to decide the next lobby batch.
- Product decision: continue with Cocos-only visible lobby polish and local placeholder UX. Real gameplay, economy, reward, chat, red-dot, countdown, activity, ranking, mail, shop, gacha, battle, and settlement systems remain blocked until backend contracts and rules are explicitly opened.
- UI/design decision: current lobby has the functional skeleton but still reads as an overlay of simple controls. The next visible goal is darker atmospheric pressure, richer plaques/cards, clearer placeholder feedback, and safer multi-resolution behavior.
- Implemented local UX:
  - Resource cells now open the unified placeholder dialog. Stamina identifies readonly profile data; coin/ruby/crystal identify visual placeholders.
  - Chat preview now opens the unified placeholder dialog and does not expose message sending.
  - Resource `+` marks were visually softened as disabled art marks.
- Implemented runtime hardening:
  - Content-root clearing now destroys old children.
  - Loading flow has a cancel path for root destruction.
  - Lobby background can be preserved and resized during lobby rerender instead of always stop/play rebuilding.
  - Top-right system icons hide on narrow layouts when they would overlap the player panel.
  - The placeholder dialog close button is now a child of the dialog panel.
- Implemented visual polish:
  - Added `LobbyAtmosphereOverlay` for dark edge pressure.
  - Central scene plaques now have shadow, layered dark-gold strokes, and thin gold lines.
  - Right challenge cards now have stronger pseudo-illustration shading and subtle red light.
- Test/guardrail impact:
  - `check-layout` now includes resource/chat placeholder tokens, HUD click-contract checks, content-root destroy checks, loading cancel checks, background preserve/resize checks, system-icon overlap handling, and additional viewport threshold samples.
- Boundary unchanged: all these changes remain local UI/runtime behavior only and do not open gameplay or economy write paths.

### Stage 2D Readonly Notice Panel And Interface Guardrails

- 产品定位：
  - 活动入口先承载“公告与活动”只读详情，而不是进入真实活动任务、奖励或玩法。
  - 面板用于验证大厅功能接口接入链路：登录 token -> GET 只读接口 -> schema 校验 -> loader stale guard -> Cocos 面板渲染。
- 已开发功能：
  - 桌面左侧活动栏第一项点击打开 `LobbyNoticePanel`。
  - 小屏 `LobbyCompactActionEntrances` 的 `活动` 点击打开同一个 `LobbyNoticePanel`。
  - 面板包含标题、接口状态、公告列表、空状态、错误兜底、刷新按钮、关闭按钮和边界说明。
  - profile 弹窗、notice 面板、placeholder 弹窗互斥，避免多层面板叠加。
- 接口接入：
  - 新增 `LobbyNoticeApi.lobbyNotices()`，只调用 `GET /api/player/lobby/notices`。
  - 响应在 API 边界做结构校验：数组数量上限、标题/内容长度裁剪、priority 数值范围、日期字段类型。
  - 新增 `LobbyNoticeLoader`，使用 ticket 防止旧请求覆盖新面板状态。
- 仍保持未开放：
  - 挑战、冒险、英雄、背包、任务、商店、聊天发送、活动领奖、战斗结算、抽卡等入口仍然只走本地未开放弹窗。
  - 不开放任何资源增减、奖励领取、购买兑换、结算、链上或资金池类能力。
- 验收结果：
  - `npm.cmd run check:layout` 通过。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` 通过。
  - 后端 `lootchain-game` reactor compile 通过。

### Stage 2E 弹框关闭与公告异常兜底

- 问题：
  - 公告/活动面板在本地公告表未初始化时会显示 `读取失败：系统异常`。
  - 点击弹框内容区可能穿透到遮罩层，导致弹框被关闭。
- 处理：
  - 后端公告读取失败时返回空只读列表，并记录 warning，避免影响大厅体验。
  - 公告面板、玩家资料弹窗、统一未开放弹窗的面板本体都加入 `BlockInputEvents`。
  - 公告面板错误文案改为“服务端公告暂不可用，已显示本地说明”，避免误导为玩法失败。
- 交互规则：
  - 点击遮罩外侧可关闭。
  - 点击明确的关闭/确认按钮可关闭。
  - 点击弹框内部内容区不关闭。

### Stage 1Y HUD Placeholder State And Safety Polish

- 多角色结论：当前继续以 Cocos-only 大厅为准，剩余入口只做可见占位与状态表达，不接真实玩法/经济/聊天/结算。
- 产品调整：
  - 左侧活动栏取消真实倒计时/运营感文案，改为 `预览中`、`未开放`、`占位展示`、`暂未开放`。
  - 右侧挑战卡取消“挑战中/今日双倍”等像真实活动的数据，改为 `预览中`、`锁定`、`未开放`、`占位展示`。
  - 底部导航本阶段不显示红点，避免被误解为真实任务、商店、图鉴更新。
- UI/美术调整：
  - 底部 HUD 增加暗色地台、分段金属上沿和左右压暗。
  - 活动条改为暗金旗帜式条目，并增加小型状态徽标。
  - 挑战卡增加状态徽标，继续保留 Graphics 伪插画质感。
  - 底部导航增加独立金属槽位和分隔刻线。
  - 聊天预览改为黑玻璃 ticker，独立显示 `[世界]` 频道章。
- 安全与接口调整：
  - 体力仍来自只读大厅资料；金币、红宝石、水晶改为 `未开放`，不再展示假余额。
  - `LobbyProfileLoader.cancel()` 会在根销毁和登录重置时让旧 profile 请求失效。
  - profile 响应 `userId` 不匹配当前登录用户时进入本地兜底状态，不展示错号资料。
- 验收结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口；大厅入口仍是本地 placeholder。

### Stage 1Z Profile And Placeholder Clarity

- 产品目标：让“玩家资料可看但不可改”和“大厅入口存在但未开放”更容易理解。
- 玩家资料弹窗：
  - 保留等级、经验、战力、体力、账号状态、登录方式、钱包绑定、钱包地址脱敏展示。
  - 空间足够时增加本地占位属性：主线进度、深渊层数、公会、称号。
  - 这些属性只用于大厅观感和后续规划，不代表玩法或后端数据已经开放。
- 未开放弹窗：
  - 根据入口类型显示不同副标题：只读/占位资源、本地聊天预览、系统入口占位、玩法未开放。
  - 增加本地边界提示，强调不跳转、不发奖、不写入经济数据。
- 校验：
  - `scripts/check-layout.mjs` 已加入资料占位行和 `LobbyPlaceholderBoundaryNote` 守卫。
  - `npm.cmd run check:layout` 与 Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` 均通过。
- 边界不变：所有新增内容仍是只读/本地占位，不开放 EX V1，不新增经济写入口。

### Stage 2A Small-Screen Access And Guardrails

- 多角色结论：
  - 产品：小屏不能只隐藏大厅入口，至少要能触达八个核心场景入口。
  - 设计/美术：继续用 Cocos `Graphics` 提升资源栏和小屏入口质感，不新增 bitmap 资产。
  - 接口/测试：补登录旧请求防护、资源导入硬失败、配置漂移守卫和资源占位守卫。
- 小屏可达性：
  - 当普通中央热点因尺寸阈值隐藏时，显示 `LobbyCompactSceneEntrances`。
  - 面板包含 8 个场景入口，点击全部走统一未开放弹窗。
  - 桌面和大屏仍保留原来的建筑铭牌与透明热区。
- 顶部资源：
  - 资源格从直矩形升级为暗金斜切胶囊。
  - 体力仍来自只读 profile。
  - 金币、红宝石、水晶继续是 `未开放` 占位。
  - 空间不足时用 `LobbyCompactStaminaChip` 保留体力入口。
- 运行边界：
  - `LoginFlow` 增加 ticket，避免旧登录响应覆盖新登录流程。
  - `LobbyResourceLoader` 不再用 texture fallback 构造运行时 SpriteFrame，大厅 poster 必须有导入后的 spriteFrame。
- 检查脚本：
  - 解析 `LobbyHudConfig.ts` 中的 hotspot 配置并校验坐标，不再维护第二份硬编码坐标。
  - 校验 config 只保留数据，不允许 API/节点/资源加载/经济关键词。
  - 校验 resourceItems 只有体力读取 profile，其余资源不能恢复为假余额或 profile 经济字段。
  - 增加小屏与阈值 viewport。
- 验收结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口。

### Stage 2B Multi-Role Lobby Polish And Safety

- 产品结论：
  - 当前大厅入口仍全部是本地 placeholder，不能出现像真实活动/任务/奖励的红点或假进度。
  - “冒险”主按钮可以保留为主视觉焦点，但副标题必须标识 `未开放`，不能展示不存在的关卡进度。
  - 玩家资料弹窗在小屏必须可读，不能因为头像和文字重叠导致资料入口不可用。
- 设计/UI 结论：
  - 中央热点应继续向“建筑铭牌”靠近，不做明亮按钮块。
  - 右侧挑战卡需要更像参考图的图片卡/边栏卡，不应只是矩形面板。
  - 底部导航需要黑金地台厚度，让组件像落在场景底部，而不是浮在视频上。
- 实施内容：
  - `LobbyHudRenderer.ts`：中央牌匾增加多层暗金描边；挑战卡改为非矩形 trace；右侧挑战栏增加暗金轨道；底部 HUD 增加三层阶梯平台；冒险副标题改为 `未开放`。
  - `LobbyHudConfig.ts`：所有 activity、scene hotspot、challenge、bottom nav 的 `hot` 均保持 `false`，避免未开放入口显示真实红点。
  - `LobbyProfileDialogRenderer.ts`：新增 `profileDialogScale()` 和 `isNarrowProfileDialog()`；窄屏改为单列资料行，姓名/UID/状态文本开启 shrink。
  - `PlayerAuthApi.ts` / `LoginFlow.ts` / `LootChainGameRoot.ts`：token 保存移动到登录 ticket 校验之后，root 销毁时取消未完成登录。
  - `scripts/check-layout.mjs`：补充 UI token、未开放红点、背景 preserve 顺序、stale-safe token、资源占位顺序、disabled plus 非交互守卫。
- 验收结果：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed。
  - `git diff --check` -> passed，仅有已有 LF/CRLF 转换 warning。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口；当前可调用接口仍只有 `POST /api/player/auth/dev-login` 和只读 `GET /api/player/me/lobby`。

### Lobby Poster SpriteFrame Import Fix

- 问题：登录后进入资源加载页时，`LobbyResourceLoader` 加载 `lobby/lobby_bg_poster/spriteFrame` 失败。
- 原因：大厅背景 poster 文件存在，但 `.meta` 被导入为 texture-only，没有 spriteFrame 子资源。
- 处理：
  - 修复 `assets/resources/lobby/lobby_bg_poster.jpg.meta`，为 3840x2160 poster 增加 spriteFrame 子资源。
  - 补 `scripts/check-layout.mjs` 守卫，防止后续替换背景图时再次丢失 spriteFrame 导入类型。
- 验收：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
- 边界不变：该项仅修复资源导入，不涉及玩法、奖励、经济或后端接口。

### Stage 2C Compact Action Access

- 产品目标：小屏布局不能只隐藏大厅入口，必须保留核心模块的本地可达性。
- 本轮新增：
  - `LobbyCompactActionEntrances`：当活动/挑战侧栏或底部 HUD 因分辨率隐藏时出现。
  - 快捷入口包括活动、挑战、冒险、聊天、英雄、背包、任务、商店。
  - 中央场景入口仍由 `LobbyCompactSceneEntrances` 承担，两者共同覆盖小屏大厅主要入口。
- 交互规则：
  - 所有 compact action 入口只打开统一未开放弹窗。
  - 不进入战斗、不领取奖励、不购买/兑换/消耗资源、不访问玩法或经济写接口。
  - 窄屏极限高度不足时允许隐藏 compact action 面板，避免遮挡登录/加载/弹窗等关键 UI。
- 工程约束：
  - `LootChainGameRoot.rerenderLobbyOverlay()` 必须清理 compact action/scene 面板，防止重绘叠层。
  - `scripts/check-layout.mjs` 必须校验 compact action 面板在各 viewport 内不越界、不压底部 HUD。
- 验收：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口。

### Stage 2F Readonly Codex Panel

- 产品定位：
  - `图鉴` 是大厅底部导航中的基础入口，本阶段先作为只读预览开放。
  - 面板展示“收录/已拥有/只读预览”状态，帮助玩家理解图鉴入口存在，但不进入英雄养成。
  - 不显示 EX V1 内容，不暴露获取、升级、升星、觉醒、精炼、奖励领取、购买、出售或任何经济操作。
- UI/美术要求：
  - 弹框沿用大厅暗金风格，使用安全区内居中布局。
  - 卡片以英雄名、稀有度、阵营/职业、定位和拥有状态为主，避免做成可点击养成卡。
  - 内部点击必须被弹框自身吸收，防止玩家点卡片区域时误关闭弹框。
- 接口边界：
  - Cocos 只调用 `GET /api/player/lobby/codex`。
  - 该接口是大厅专用只读门面，不让前端直接依赖包含写操作的英雄 Controller。
  - 后端过滤锁定/EX 记录，前端再过滤 `EX` rarity 与 `EX_` heroCode。
- 已开发内容：
  - 新增 `LobbyCodexTypes.ts`、`LobbyCodexApi.ts`、`LobbyCodexState.ts`、`LobbyCodexLoader.ts`、`LobbyCodexPanelRenderer.ts`。
  - `LootChainGameRoot.ts` 接入图鉴面板的打开、关闭、刷新、重绘和登录重置。
  - `LobbyHudRenderer.ts` 将底部 `图鉴` 和小屏 compact `图鉴` 接到该只读面板。
  - `scripts/check-layout.mjs` 增加只读 API allowlist、EX 过滤、modal 阻断和多分辨率 bounds 守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 bundled focused `tsc.cmd --noEmit` -> passed。
  - 后端 `lootchain-game` compile -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不新增任何经济写入口。

### Stage 3A Readonly Adventure Shell

- 产品定位：
  - 大厅右下 `冒险` 是玩家登录后的第一主目标入口，不能长期停留在占位提示。
  - 本阶段先打通 `大厅 -> 主线冒险地图` 的只读路径，让玩家明确下一步是主线 1-1。
  - 不在本阶段开放编队保存、战斗启动、结算或奖励。
- UI/美术要求：
  - 弹框沿用大厅暗金、深红、哥特风格。
  - 使用章节列表、地图节点和推荐关卡详情组成完整信息架构。
  - `编队未开放` 保持禁用视觉状态，避免误导玩家以为已经能战斗。
  - 面板和节点必须按安全区自适应，内部点击不能穿透关闭弹框。
- 接口边界：
  - Cocos 只调用 `GET /api/player/lobby/adventure`。
  - 该接口只读，返回章节、关卡、推荐战力、敌人摘要和掉落预览文案。
  - 掉落预览不是发奖，真实奖励必须在后续后端结算事务中决定。
- 已开发内容：
  - 新增 `LobbyAdventureTypes.ts`、`LobbyAdventureApi.ts`、`LobbyAdventureState.ts`、`LobbyAdventureLoader.ts`、`LobbyAdventurePanelRenderer.ts`。
  - `LootChainGameRoot.ts` 接入冒险面板打开、关闭、刷新、登录重置和自适应重绘。
  - `LobbyHudRenderer.ts` 将右下主 `冒险` 按钮和 compact `冒险` 快捷入口接到只读面板。
  - `scripts/check-layout.mjs` 增加只读 API allowlist、冒险模块必需项、点击契约和多分辨率 bounds 守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - 后端 `PlayerLobbyAdventureServiceImplTest` -> passed。
  - 后端 `lootchain-admin,lootchain-game` compile -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不保存主线进度，不保存编队，不创建战斗，不扣体力，不发放奖励，不新增任何经济写入口。

### Stage 3B Readonly Formation Shell

- 产品定位：
  - 玩家从 `冒险` 看到推荐关卡后，下一步自然会确认队伍。
  - 本阶段只打通可感知路径：`冒险关卡详情 -> 编队确认`。
  - 不在本阶段保存队伍、不开始战斗、不结算奖励。
- UI/美术要求：
  - 编队面板沿用暗金弹框风格，展示五个上阵槽。
  - 主角优先进入第一槽，并标注 `队长 / 主角`。
  - 候选英雄列表只读展示，避免玩家误以为可以拖拽保存。
  - `战斗未开放` 用禁用视觉状态表达下一阶段边界。
- 已开发内容：
  - 新增 `LobbyFormationPanelRenderer.ts`。
  - `LobbyAdventurePanelRenderer.ts` 的 `编队确认` 入口接到 formation 面板。
  - `LootChainGameRoot.ts` 接入 formation 面板打开、关闭、重绘和登录重置。
  - `scripts/check-layout.mjs` 增加 formation 模块、弹框边界和 root wiring 守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不保存编队，不创建战斗，不扣体力，不发放奖励，不新增任何经济写入口。

### Stage 3C Local Battle Preview Shell

- 产品定位：
  - 玩家从编队确认后需要看到“下一步会进入战斗”的明确反馈。
  - 本阶段只做本地战斗表现预演，不创建真实战斗、不保存阵容、不结算、不发奖。
  - 真实战斗闭环下一阶段必须由后端权威 session 和 settlement 控制。
- UI/美术要求：
  - 战斗预演继续沿用大厅暗金弹框风格。
  - 左侧展示我方五个槽位，主角仍优先展示为第一/队长。
  - 右侧展示敌方占位单位，中下方展示本地战斗日志。
  - “结算未开放”保持禁用视觉状态，避免玩家误以为已经能获得奖励。
- 已开发内容：
  - 新增 `LobbyBattlePreviewPanelRenderer.ts`。
  - `LobbyFormationPanelRenderer.ts` 增加 `LobbyFormationBattlePreviewButton`。
  - `LootChainGameRoot.ts` 接入 battle preview 面板打开、关闭、重绘和登录重置。
  - `scripts/check-layout.mjs` 增加 battle preview 必需文件、节点名、`BlockInputEvents`、禁用结算按钮和响应式 bounds 守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed with `layout ok`。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：不改变经济规则，不开放 EX V1，不保存编队，不创建真实战斗，不扣体力，不写进度，不结算，不发奖，不新增任何经济写入口。

### Stage 4A Backend Battle Session And No-Reward Settlement

- 产品定位：
  - 玩家现在可以从大厅冒险进入编队，再进入后端创建的战斗会话，并记录一次无奖励结算。
  - 这是“流程闭环”阶段，不是经济结算开放阶段。
- 接口行为：
  - `POST /api/player/battles/start`：创建 battle session，保存服务端阵容快照和敌方快照。
  - `POST /api/player/battles/{battleNo}/settle`：记录战斗结果，但 `rewardGranted=false`。
- UI 行为：
  - 战斗面板打开后自动创建会话。
  - 会话创建成功后展示 battleNo、阵容快照、敌方预览和服务端种子。
  - 点击“记录结算”只记录无奖励结果，完成后可以“返回大厅”。
  - 面板仍保留“奖励未开放”禁用视觉标识。
- 安全边界：
  - 前端不提交奖励、掉落、经验、金币、材料、体力消耗、主线进度或英雄属性。
  - 前端校验后端响应必须保持 `readonlyEconomy=true` 和 `rewardGranted=false`。
  - 后端真实奖励/体力/进度结算必须后续单独审查。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - 后端相关单测与 game/admin compile -> passed。

### Stage 4C Battle Presentation Pass

- 产品定位：
  - 让 `冒险 -> 编队 -> 战斗 -> 记录结果 -> 返回大厅` 从玩家视角更像一条真实游玩路径。
  - 当前仍然不是奖励结算开放阶段，只是把 battle session / no-reward settlement 包装成可感知的战斗表现。
- UI/美术要求：
  - 战斗面板不能继续像左右列表，应有暗黑影视风舞台、角色站位、血条、回合条、命中特效和底部日志。
  - 结果页只能表达“战斗记录已完成”，不出现获得奖励、领取按钮、金币/材料增长或飞入背包动画。
  - 移动/窄屏必须能从冒险继续到编队，footer 按钮需要自动重排。
- 已开发内容：
  - `LobbyAdventurePanelRenderer.ts` compact 模式新增 `LobbyAdventureCompactFormationButton`。
  - 冒险详情将 `掉落预览` 降级为 `关卡配置预览（当前不发放）`。
  - 新增 `LobbyBattlePresentationLayout.ts`，统一计算战斗站位、日志、边界徽标、footer 按钮布局。
  - 新增 `LobbyBattlePresentationState.ts`，把 battle API 状态翻译成创建中、演出中、记录中、已记录、错误等 UI 阶段。
  - `LobbyBattlePreviewPanelRenderer.ts` 重做为表现层：`LobbyBattleCinematicBackdrop`、`LobbyBattleActor_*`、`LobbyBattleActorHpBar`、`LobbyBattleEffectLayer`、`LobbyBattleBoundaryBadge`。
  - `scripts/check-layout.mjs` 已增加 compact CTA、战斗表现模块、actor/effect/boundary 节点和 no-reward 文案守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - `scripts/smoke-player-flow.ps1` -> passed，确认 `rewardGranted=false`、`readonlyEconomy=true`，体力和战力未变化。
- 边界不变：不改变经济规则，不开放 EX V1，不扣体力，不写主线进度，不发奖励，不新增任何经济写入口。

### Stage 4E Local Battle Timeline

- 产品定位：
  - 避免玩家进入战斗后立刻看到“记录结果”，补足一段可读的战斗过程。
  - 当前仍然只做表现时间轴，不做真实战斗模拟和经济结算。
- 已开发内容：
  - `LobbyBattleState.ts` 增加 `presentationStep` 和 `presentationComplete`。
  - `LobbyBattleFlow.ts` 在 battle session 创建成功后启动本地计时器，推进 4 个演出阶段。
  - 演出中主按钮为 `LobbyBattlePlaybackPending`，禁用 settlement。
  - 历史版本演出完成后才出现 `LobbyBattleSettlementButton`；2026-06-19 返修后当前视觉验收流改为 `LobbyBattleReturnLobbyButton`，不主动提交结算。
  - `LobbyBattlePresentationState.ts` 根据 step 输出回合文字、日志、伤害浮字和敌方 HP 展示。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：时间轴只驱动画面，不决定胜负、不发奖励、不扣体力、不写进度、不写资源。

### Stage 4F Selected Stage Propagation

- 产品定位：
  - 玩家在冒险面板选择某个主线关卡后，编队、战斗预览和 battle start 必须保持同一个目标关卡。
  - 未来开放多关卡时，不能因为参数丢失而静默打回 `MAIN_1_1`。
- UI/体验要求：
  - 编队页必须展示当前目标关卡，玩家能确认自己正在为哪一关编队。
  - 关卡选择丢失、为空或命中 `EX_` 非法关卡时，不进入战斗，提示重新选择主线关卡并返回冒险面板。
  - 该提示是流程保护，不是未开放 placeholder。
- 已开发内容：
  - `LobbyAdventurePanelRenderer.ts` 将推荐关卡和详情关卡的 `stageCode` 显式传入 `openLobbyFormationPanel(stageCode)`。
  - `LobbyFormationPanelRenderer.ts` 读取 `currentLobbySelectedStageCode()`，并在只读编队说明中展示目标关卡。
  - `LootChainGameRoot.ts` 使用 `selectedLobbyStageCode` 统一保存当前关卡选择，并用 `resolveLobbyStageCode()` / `rejectInvalidLobbyStageSelection()` 拦截非法状态。
  - `LobbyBattleFlow.ts` 的 `prepare()` 与 `start()` 不再用空值回落到 `MAIN_1_1`，非法关卡会进入错误状态。
  - `scripts/check-layout.mjs` 增加 selected-stage 与 no-fallback 守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
  - 后端 smoke 使用非默认 `StageCode=MAIN_1_2` 通过，battle start 返回同一关卡，settlement 仍保持 `rewardGranted=false` / `readonlyEconomy=true`。
- 边界不变：只传递关卡选择，不保存编队，不扣体力，不写主线进度，不发奖励，不新增经济写入口，不开放 EX V1。

### Stage 4H Battle Stage Visibility

- 产品定位：
  - 玩家进入战斗后仍要能确认目标关卡，避免“我选了 1-2，但不知道实际打哪关”的不确定感。
- 已开发内容：
  - 战斗 ready 状态 subtitle 显示 `目标关卡 {stageCode}`。
  - 记录完成页 subtitle 和日志显示后端 settlement 返回的 `stageCode`。
  - `scripts/check-layout.mjs` 增加结果页关卡文案守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只改展示，不改变接口、不发奖励、不扣体力、不写进度、不新增经济写入口。

### Stage 4I Formation Explicit Battle Stage

- 产品定位：
  - 编队页进入战斗时必须使用编队页当前展示的目标关卡，不能靠 root 历史状态兜底。
- 已开发内容：
  - `LobbyFormationBattlePreviewButton` 显式调用 `openLobbyBattlePreviewPanel(stageCode)`。
  - `LootChainGameRoot.openLobbyBattlePreviewPanel()` 改为必须传入关卡。
  - 前端只接受 `MAIN_数字_数字` 形式的主线关卡，空值、展示文案和 `EX_` 都会被拒绝并回到冒险选择。
  - `scripts/check-layout.mjs` 增加显式 stage 传递守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只改状态传递，不保存编队、不扣体力、不写进度、不发奖励。

### Stage 4J Return-To-Lobby Refresh

- 产品定位：
  - 结算记录完成后返回大厅，应该回到干净的大厅状态，而不是保留战斗面板的旧计时器或旧快照。
- 已开发内容：
  - 返回大厅时调用 `lobbyBattleFlow.cancel()` 清理本地战斗表现计时。
  - 关闭 battle preview 与 formation 面板后，回读只读玩家资料、冒险状态和英雄队列。
  - `LobbyBattleFlow` 内部关卡格式校验与 root 对齐，只接受 `MAIN_数字_数字`。
  - `scripts/check-layout.mjs` 增加回大厅刷新守卫。
- 验收：
  - `npm.cmd run check:layout` -> passed。
  - Cocos Creator 3.8.8 focused `tsc.cmd --noEmit` -> passed。
- 边界不变：只读刷新，不扣体力、不写进度、不发奖励、不新增经济写入口。

### 2026-05-31 Stage 4K New Player Full-Flow Smoke And Product Gate

- Product gate now has runtime evidence for the first-player path, not only existing-player smoke.
- Verified path:
  `empty protagonist -> create SSR protagonist -> protagonist first in hero roster -> MAIN_1_1 battle -> no-reward settlement -> lobby readonly refresh`.
- UX/product implications:
  - protagonist creation can be treated as the required first-time gate before normal lobby play;
  - protagonist is not part of gacha and remains `source_type=PROTAGONIST`;
  - duplicate create is idempotent and does not create a second SSR protagonist;
  - current settlement must continue to communicate "battle record only / no reward yet".
- Validation evidence:
  - `scripts/smoke-new-player-flow.ps1` passed with `userId=12`, `protagonistHeroId=9`, `battleNo=Bf8f08ea10fc945ab9022db1bbfa3f548`, `settlementNo=S52c47a1c10ba4ec9ba9733c9e4216a90`;
  - repeated create kept one `player_protagonist` and one `PROTAGONIST` hero row;
  - stamina and combat power stayed unchanged.
- Remaining visible-product work:
  - capture/inspect the Cocos UI version of the same flow across desktop and compact resolutions;
  - harden double-click states on create protagonist, battle start, and settlement buttons;
  - continue improving the role-selection and hero-card art to match the dark cinematic reference.
- Boundary unchanged: no reward, stamina cost, mainline progress, bag/currency/USDT/fund-pool, EX V1, or economy write path was opened.

### 2026-05-31 Stage 4L Repeat-Submit Product Gate

- Product gate moved the previous remaining item "harden double-click states" from open risk to implemented frontend protection.
- Protected actions:
  - create protagonist;
  - auto battle start after formation/battle-preview open;
  - no-reward settlement record.
- Player-facing effect:
  - rapid taps no longer send extra protagonist-create or battle-start POSTs from Cocos;
  - settlement cannot be submitted again after a result exists;
  - current stage selection still remains explicit and visible through the flow.
- Review/QA note:
  - backend protagonist create remains idempotent and battle stage guard remains authoritative;
  - frontend guards reduce duplicate requests and stale state before those backend safeguards are reached.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos TypeScript check passed.
- Boundary unchanged: frontend debounce/state hardening only, no economy write path opened.

### 2026-05-31 Stage 4M Battle Resume And Contract Hardening

- Product gate closed the next real-play blocker: after entering battle preview, returning to formation must not strand the player in a hidden busy state.
- Player-facing behavior:
  - if a same-stage battle session already exists, opening battle preview shows that existing state so the player can continue to no-reward settlement;
  - after the recorded-result flow returns to lobby, local battle state is cleared and the player can enter the same mainline stage again;
  - invalid or EX stage codes are filtered/rejected before they become playable UI choices;
  - roster/formation no longer displays invalid `id=0` heroes that battle start would reject.
- Contract hardening:
  - battle start response must echo the requested `MAIN_x_y`;
  - settlement response must match the session stage;
  - missing stage no longer silently falls back to `MAIN_1_1`;
  - protagonist create/state response is validated before routing to lobby.
- Verification passed:
  - Cocos `check:layout`;
  - focused Cocos TypeScript check;
  - existing-player smoke on `MAIN_1_2`;
  - fresh-player smoke on `MAIN_1_1`;
  - stage guard smoke for unopened `MAIN_9_9` and `EX_1_1`.
- Boundary unchanged: this stage improves frontend flow and validation only. No reward, stamina cost, mainline progress, bag/currency/USDT/fund-pool write, EX V1, or economy write path was opened.

### 2026-05-31 Stage 4N Compact Responsive Product Gate

- Product gate closed the next responsive P1 set for the current flow.
- Player-facing effect:
  - short-height lobby layouts keep essential access to `公告 / 冒险 / 英雄 / 图鉴`;
  - protagonist creation no longer lets the name input and `进入游戏` button touch or overlap on portrait/narrow screens;
  - compact formation keeps all five slots inside the panel and clear of footer actions;
  - battle presentation keeps the fight field, boundary note, and footer buttons separated in very short panels.
- QA baseline:
  - `390x300` is now included as a compact playable viewport in `scripts/check-layout.mjs`;
  - `360x240` is included as a floor viewport for non-overlap and critical-control survival;
  - `320x180` remains a no-crash/no-bounds minimum, not a full visual-quality target.
- Verification:
  - Cocos `npm.cmd run check:layout` passed;
  - focused Cocos Creator 3.8.8 TypeScript check passed.
- Boundary unchanged: layout-only frontend work. No reward, stamina cost, mainline progress, bag/currency/USDT/fund-pool write, EX V1, backend API/SQL change, or economy write path was opened.

### 2026-05-31 Stage 4O Local Formation Product Gate

- Product gate moved formation from "default readonly preview" to "local battle lineup confirmation".
- Player-facing behavior:
  - candidate heroes can be clicked to add/remove them from the current lineup;
  - the protagonist stays fixed as the leader, matching the current main-character-first design;
  - battle preview/start uses the lineup the player just confirmed, instead of silently rebuilding the default top-power lineup.
- UI/UX boundary:
  - this is still a local, per-battle lineup only;
  - it does not save long-term teams or unlock formation management systems;
  - there is no drag-swap, equipment, growth, reward claim, or resource mutation in this stage.
- Technical boundary:
  - no backend API/SQL change;
  - existing `POST /api/player/battles/start` receives only `heroIds` and `leaderHeroId`;
  - no client-submitted attributes, rewards, stamina, progress, currency, USDT, fund-pool, or EX data.
- Verification:
  - Cocos `npm.cmd run check:layout` passed;
  - focused Cocos Creator 3.8.8 TypeScript check passed;
  - Cocos `git diff --check` passed.
- Remaining P0/P1 product risks:
  - backend player API feature gate is still needed so current Cocos phase exposes only allowed endpoints;
  - no-reward battle settlement should eventually persist an explicit no-economy mode flag;
  - full visual QA still needs Cocos preview screenshots/video across desktop and compact viewports.

### 2026-05-31 Stage 4P Player API Gate Product Gate

- Product/security gate closed the current-phase route exposure risk.
- Player-facing effect:
  - current Cocos lobby can still log in, create protagonist, read lobby panels, start battle, and record no-reward battle settlement;
  - unapproved economy/growth routes are blocked even if a client attempts to call them with a valid player token.
- Cocos-side effect:
  - `GachaApi.draw()` now fails locally with "当前 Cocos 阶段未开放抽卡";
  - layout guard prevents accidentally reintroducing the draw POST during this phase.
- Backend allowlist is active by default through `lootchain.player.cocos-phase-gate-enabled=true`.
- This stage reduces risk without opening content:
  - no reward settlement;
  - no stamina cost;
  - no mainline progress;
  - no bag/currency/USDT/fund-pool write;
  - no EX V1.
- Remaining product risks:
  - no-reward settlement mode is still returned in VO but not persisted as a DB flag;
  - repeated battle start with same `requestId` but different payload still needs stricter backend contract handling;
  - Cocos visual QA still needs screenshots/video across target resolutions.

### 2026-05-31 Stage 4Q Battle Start Idempotency Product Gate

- Product/security gate closed the repeated `requestId` payload mismatch risk.
- Player-facing intent:
  - rapid retry of the same battle start request can safely return the original session;
  - changing stage or formation is a different player intent and must use a new request ID.
- Backend behavior:
  - missing battle start `requestId` is rejected;
  - same `requestId` with different stage, lineup, or leader is rejected;
  - same `requestId` with the same payload still returns the existing battle session.
- Cocos behavior:
  - current `LobbyBattleFlow` creates a fresh `battle-start-*` request ID per start attempt;
  - local formation changes are therefore represented by a new start request.
- Remaining product risks:
  - no-reward settlement mode still needs DB persistence;
  - latest-code HTTP smoke should be run after server restart;
  - visual QA/screenshots across target resolutions remain outstanding.

### 2026-05-31 Stage 4R Battle Settlement No-Economy Product Gate

- Product/security gate closed the "VO-only no reward" risk.
- Settlement records now carry DB-visible flags that make the current Cocos result auditable:
  - `settlement_mode=NO_REWARD`
  - `reward_granted=0`
  - `readonly_economy=1`
  - `economy_applied=0`
- Player-facing behavior is unchanged:
  - the battle result can still be recorded;
  - it still does not grant rewards, deduct stamina, advance mainline progress, or mutate resources.
- Future product rule:
  - any real reward/progress settlement must be designed as a separate reviewed stage and must not treat `NO_REWARD` records as claimable rewards.
- Remaining product risks:
  - latest-code HTTP smoke after server restart;
  - unified DB snapshot smoke for red-line economy tables;
  - Cocos visual QA/screenshots across target resolutions.

### 2026-05-31 Stage 4S Latest-Code Smoke Product Gate

- Product/security gate closed the "compiled but not running latest code" risk for the current Cocos flow.
- Local `lootchain-game` was restarted from current source on port `8081` before smoke.
- Player-facing flow now has HTTP verification coverage for:
  - existing-player login -> lobby -> adventure/hero roster -> battle start -> no-reward settlement -> lobby reread;
  - fresh-player login -> protagonist creation -> hero roster protagonist first -> protagonist-only battle -> no-reward settlement;
  - invalid or EX stages rejected before battle session insert.
- Red-line verification was extended:
  - gacha, bag, and hero growth player endpoints are blocked by phase gate at HTTP level;
  - economy table snapshots stay unchanged around forbidden calls and no-reward settlement;
  - battle settlement row persists `NO_REWARD`, `reward_granted=0`, `readonly_economy=1`, and `economy_applied=0`;
  - battle start `requestId` idempotency accepts same payload and rejects changed lineup.
- Remaining product risk:
  - Cocos visual QA/screenshots across target desktop and compact resolutions remain outstanding.

### 2026-05-31 Stage 4T Recent Battle Readback Product Gate

- Product gap closed:
  - after a no-reward battle settlement, the player can now see a recent challenge record in the adventure panel instead of returning to a fully stateless lobby.
- Player-facing behavior:
  - recent record text is deliberately framed as "无奖励记录";
  - it does not imply claimable drops, stamina spend, mainline completion, or progression.
- UI behavior:
  - adventure detail panel shows the latest matching stage record when available, otherwise the latest recent record or empty state;
  - physical micro viewport mode keeps the core navigation path visible when Preview/browser viewport is extremely small.
- Backend contract:
  - `GET /api/player/battles/recent` is read-only and current-phase allowlisted;
  - records expose `settlementMode`, `rewardGranted`, `readonlyEconomy`, and `economyApplied` so the client can fail closed if the red-line flags change.
- Product red line:
  - this is a readback/clarity feature only;
  - no reward settlement, stamina cost, mainline progress, saved formation, economy write, or EX V1 is introduced.
- Acceptance notes:
  - latest HTTP smoke verifies the recent record contains the just-created settlement and keeps `rewardGranted=false`, `readonlyEconomy=true`, `economyApplied=false`;
  - visual screenshot acceptance still requires restarting Cocos Preview because port `7456` was serving stale compiled cache.

### 2026-05-31 Stage 4U Supervisor Gate

- User-perspective gate remains open until real visual acceptance uses the latest Preview chunk.
- Latest product-flow smoke confirms the non-visual loop is intact:
  - existing player: login -> lobby -> heroes/adventure -> battle start -> no-reward settlement -> recent battle readback -> return-to-lobby clarity;
  - fresh player: login -> SSR protagonist creation -> protagonist first in hero roster -> protagonist-only battle -> no-reward settlement;
  - invalid mainline and EX stages remain blocked before `battle_session` insert.
- Product acceptance cannot rely on the current `7456` screenshots until the `AdaptiveStageLayoutResolver.ts` chunk contains `viewportWidth` and `viewportHeight`.
- Manual low-risk visual unblock:
  - Reimport `assets/scripts/scenes/AdaptiveStageLayoutResolver.ts` in Creator Assets;
  - run `Project -> Refresh Device` or reopen Preview;
  - accept screenshots only after `npm.cmd run check:preview` passes, proving the latest physical-viewport/micro-HUD code is served.
- Red-line gate remains unchanged: recent battle history is readability only and does not imply rewards, stamina spend, progress, saved formation, resources, USDT, fund-pool, or EX V1.

### 2026-05-31 Stage 4V Result Exit And Recent Contract Gate

- Product gate closed:
  - result-recorded battle panels can no longer send the player back into old formation state through the dim layer or bottom back slot;
  - recent battle readback now has a stricter no-reward contract.
- Player behavior:
  - after result recording, the clear action is returning to lobby, where recent no-reward history can be read;
  - adventure wording now frames the path as no-reward battle preview instead of real progression.
- API/product contract:
  - recent records are accepted only when `settlementMode=NO_REWARD`, `rewardGranted=false`, `readonlyEconomy=true`, and `economyApplied=false`;
  - backend query and service mapping both filter to no-reward readonly records only.
- Acceptance notes:
  - current-flow smoke and fresh-player smoke both verify recent readback after settlement;
  - invalid mainline and EX stages still reject before session insert;
  - final visual acceptance is still pending the Cocos Preview chunk refresh.

### 2026-05-31 Stage 4W Request/Settle Guard Product Gate

- Product/security gate tightened:
  - battle `requestId` longer than 80 characters is rejected instead of truncated, preventing accidental idempotency collisions;
  - same start `requestId` with changed stage, lineup, or leader is rejected;
  - settle retries return the original no-reward result and keep one settlement row.
- Player-facing intent:
  - repeated taps/network retries are safe when the payload is unchanged;
  - changed formation or stage must create a new battle request, which the current Cocos flow already does;
  - failed invalid requests do not create hidden battle sessions or settlements.
- Acceptance coverage:
  - request guard covers missing/null/blank/overlong `requestId`;
  - stage guard covers malformed, BOSS, EX, Unicode, and overlong stage values;
  - lineup guard covers invalid/non-owned/over-limit teams;
  - settle guard covers unknown battle, missing/blank/overlong settle `requestId`, illegal result, and duplicate settlement.
- Red-line gate remains unchanged:
  - these are safety checks only;
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4X Runtime Visual Acceptance Gate

- Supervisor/user-perspective gate now has live Preview screenshot evidence instead of only source/static checks.
- Player-visible flow accepted for this stage:
  - existing player enters lobby and can open hero roster, adventure, formation, battle preview, no-reward result, and return lobby;
  - first-login local QA player enters protagonist creation, sees high-quality male/female SSR character cards, creates a protagonist, then enters lobby;
  - compact Preview/browser sizes `390x340` and `390x300` keep the minimal player HUD, stamina, and core nav visible.
- Evidence folder:
  - `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4x-runtime`
- Product observations:
  - result copy correctly says no-reward/recorded and does not imply claimable rewards;
  - protagonist name and lobby player display name are currently separate concepts: lobby HUD reads `game_user.nickname`;
  - debug FPS overlay may cover a small corner during Preview screenshots, but it is a Creator preview overlay rather than lobby UI.
- Acceptance coverage:
  - Cocos layout guard passed;
  - Preview freshness guard passed;
  - Cocos TypeScript no-emit passed;
  - existing-player current-flow HTTP smoke passed;
  - fresh-player HTTP smoke passed and verifies protagonist first in hero roster, SSR rarity, attack form default, locked defense/support forms, no-reward settlement, and no stamina/combat-power change.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AE Runtime Flow Acceptance And Micro HUD Correction

- Runtime Preview flow is accepted for the lobby next-step tracker:
  - login -> lobby;
  - next-step tracker -> adventure;
  - `MAIN_1_1` -> formation;
  - battle preview -> no-reward settlement;
  - return lobby -> tracker still visible;
  - reopen adventure -> recent record readback.
- Evidence is stored in `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ae-lobby-goal-tracker`.
- Runtime IDs:
  - battle `B81f5c9e9f0274c3a81654dcfeeede8e6`;
  - settlement `S0bdab68da86e4438850a87e8a1f5cade`;
  - settlement remained `rewardGranted=false` and `readonlyEconomy=true`.
- Product/UI note:
  - desktop tracker placement is valid and does not block top-left player info, right rail, or bottom nav;
  - tracker nodes now mount inside `LootChainCocosLoginUIRoot`, so different-resolution rerenders can cleanly remove and rebuild them.
- Micro viewport correction:
  - `LobbyHudRenderer.viewportUnit()` no longer scales from design resolution / browser window ratio;
  - micro HUD now uses `clamp(layout.uiScale, 0.72, 1)` to prevent 390x340 over-sized text and button bars.
- Verification:
  - `npm.cmd run check:layout` passed;
  - focused Cocos TypeScript no-emit passed;
  - backend current-player smoke and new-player smoke both passed with no reward/resource mutation.
- Preview caveat:
  - the open Preview still needs one more Creator script refresh for the final micro-scale token;
  - `check:preview` currently reports stale `LobbyHudRenderer.ts` missing `layout.uiScale, 0.72, 1`.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AE Latest Context Note

- The next completed frontend source stage is the lobby next-step goal tracker.
- New HUD nodes:
  - `LobbyGoalTracker`;
  - `LobbyCompactGoalTracker`;
  - `LobbyMicroGoalChip`.
- The tracker only reads adventure/selected-stage/recent-battle state and only opens the existing adventure panel.
- Static/frontend checks passed except current Preview freshness:
  - `npm.cmd run check:layout` passed;
  - focused Cocos TypeScript no-emit passed;
  - `npm.cmd run check:preview` fails because the open Preview still serves stale `LobbyHudRenderer.ts`.
- Backend smoke for the full current flow passed with battle `B3c2c3bee321449cf9ffe379e32f947fd` and settlement `S4fd31cbe921e4edbb1af0c60438682bd`, still `rewardGranted=false` and `readonlyEconomy=true`.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AE Lobby Next-Step Goal Tracker

- Product/user-supervisor goal:
  - after a player returns to lobby from the no-reward battle/result/readback flow, the lobby must explain the next action without making the player reopen panels blindly.
- UI behavior implemented:
  - desktop HUD shows `LobbyGoalTracker` near the bottom play flow area;
  - constrained non-micro layouts show `LobbyCompactGoalTracker`;
  - very small viewports show `LobbyMicroGoalChip` above the micro action bar;
  - text emphasizes current mainline target, latest readonly record, and the no-reward/no-stamina/no-progress boundary.
- Player action:
  - the tracker CTA only opens the adventure panel;
  - locked targets are displayed as locked and do not jump to formation or battle;
  - missing/loading/error states remain readable and do not imply claimable rewards.
- R&D guard:
  - HUD host reads current adventure, selected stage, and battle recent state only;
  - `check-layout` now verifies the new nodes and click contract;
  - `check-preview` now catches stale HUD chunks for the tracker.
- Verification:
  - frontend layout guard passed;
  - focused Cocos TypeScript no-emit passed;
  - backend current-flow smoke still passed with no-reward settlement `S4fd31cbe921e4edbb1af0c60438682bd` and `readonlyEconomy=true`.
- Current acceptance blocker:
  - open Cocos Preview is stale for `LobbyHudRenderer.ts`, so visual screenshot acceptance waits for Creator refresh/reimport or Preview reopen.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AA Locked Stage Authority Gate

- Product/supervisor requirement:
  - the selected-stage flow must not rely only on Cocos UI hiding locked nodes;
  - backend battle start must reject locked stages even if a modified client sends a valid-looking `MAIN_x_y`.
- Backend behavior:
  - `POST /api/player/battles/start` keeps the existing format/static allowlist checks;
  - then it reads the current player's readonly adventure state and requires the target stage to be present and `unlocked=true`;
  - locked stages are rejected before hero lookup and before `battle_session` insert.
- Player-facing impact:
  - normal `MAIN_1_1` flow is unchanged;
  - locked `MAIN_1_2` is now consistently blocked by both UI and backend authority;
  - no new progress, reward, stamina, formation-save, or economy behavior was introduced.
- Verification:
  - backend focused tests passed with 16 tests;
  - current-flow smoke still passed for `MAIN_1_1` with no-reward settlement;
  - stage guard smoke passed and now includes the locked-stage case.

### 2026-05-31 Stage 4AB Locked Stage UX Guard

- Product/user-supervisor P0:
  - locked stages must be visible but unmistakably unavailable;
  - tapping a locked stage must explain why it is locked;
  - locked stages must not become selected and must not open formation or battle preview.
- UI behavior implemented:
  - desktop locked map nodes show a `锁` badge and `锁定` prefix;
  - compact locked rows use dim styling and `锁定` prefix;
  - locked taps only call the new locked-preview status path.
- Engineering guard:
  - `openLobbyFormationPanel()` and `openLobbyBattlePreviewPanel()` now both re-check `stage.unlocked`;
  - even if a future UI path passes a locked stage, root will send the player back to adventure instead of entering formation/battle.
- Verification:
  - static layout guard passed;
  - focused TypeScript no-emit passed;
  - Preview freshness now checks locked-stage tokens and passes after Creator refreshed stale chunks;
  - runtime QA captured screenshots in `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ab-locked-stage`;
  - locked `MAIN_1_2` did not change selected stage and did not open formation/battle;
  - legal `MAIN_1_1` completed no-reward battle settlement `Sb69829a75ad04a3f99dd251828025ccd` and returned to lobby.
- Fresh-player verification:
  - backend fresh-player smoke still passes through dev-login, protagonist creation, protagonist-first roster, no-reward battle, recent readback, and lobby profile reread;
  - current Cocos Preview also shows the protagonist creation screen and then a lobby HUD using the created protagonist name `VisualHero25`.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4Y Protagonist Name Display Gate

- Product correction:
  - the lobby identity name must represent the player's created protagonist, not the account nickname.
- Accepted behavior:
  - first-login player creates a protagonist named `SmokeHero23`;
  - `/api/player/me/lobby.displayName` returns `SmokeHero23`;
  - Cocos top-left HUD displays `SmokeHero23`;
  - the original account nickname remains available as `nickname` for account/profile use.
- UI impact:
  - no special HUD rendering fork was needed because the HUD already renders `profile.displayName`;
  - profile dialog also inherits the same display name.
- Red-line gate remains unchanged:
  - this is a read-only identity-display correction only;
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4Z Adventure Stage Selection Gate

- Product correction:
  - the player must be able to choose an unlocked mainline stage in the adventure panel before entering formation;
  - the chosen stage must be visually highlighted and must stay consistent through detail, formation, battle preview, and backend battle request.
- Accepted source behavior:
  - unlocked desktop stage nodes and compact rows can be clicked;
  - selected stages show `已选`;
  - detail panel and compact `编队确认` CTA follow the selected stage;
  - invalid, malformed, locked, or not-loaded stage choices fail locally and do not create battle state.
- UX guard:
  - selection is intentionally not a battle start;
  - formation remains the explicit next step;
  - result-recorded battle state still routes back to lobby, not old formation.
- Verification:
  - static layout guard passed;
  - TypeScript no-emit passed;
  - backend current-flow smoke still records a no-reward `MAIN_1_1` battle with no resource mutation.
- Visual acceptance blocker:
  - Preview freshness now checks the new stage-selection chunks;
  - the currently running Preview is stale for this stage until Creator reimports/refreshed `LootChainGameRoot.ts` and `LobbyAdventurePanelRenderer.ts`.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4Z Runtime Selection Acceptance

- The Preview cache blocker cleared and the new stage-selection chunks are now live.
- Player-visible path accepted:
  - adventure shows selected `MAIN_1_1`;
  - formation status keeps the same target stage;
  - battle preview starts the same stage;
  - no-reward settlement returns the same stage;
  - result return closes battle/formation and lands back in lobby.
- Evidence:
  - desktop screenshots cover adventure, formation, battle, result, and return lobby;
  - compact `390x340` screenshot covers the small-layout adventure selection path.
- Runtime settlement guard:
  - `settlementNo=Sf4ebb68f5cec4eb890141477df987b1c`;
  - `rewardGranted=false`;
  - `readonlyEconomy=true`.
- Recent readback:
  - a fresh login into adventure read `Sf4ebb68f5cec4eb890141477df987b1c` as the latest recent record;
  - the record still kept `rewardGranted=false` and `readonlyEconomy=true`.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AC Battle Result Guidance And Recent Readback UX

- Product/user-supervisor correction:
  - after settlement, the player must understand this is a recorded no-reward battle result, not a real reward/progression settlement;
  - returning to lobby should have a clear follow-up: open mainline adventure and view the recent readback.
- UI behavior implemented:
  - battle result copy now states the no-reward record was written and that rewards/resources/progress did not change;
  - desktop result panels show a compact receipt card with settlement number, battle number, reward status, resource status, and progress status;
  - adventure detail now shows a recent-record card instead of one compressed line.
- UX wording rule:
  - player-facing copy uses “奖励未开放 / 资源未变更 / 进度不推进”;
  - raw fields such as `rewardGranted=false` remain only in code comments and guard logic.
- Engineering guard:
  - new nodes are mounted inside existing battle/adventure panels, preserving `BlockInputEvents` behavior so content-area clicks do not close the modal;
  - `check-layout` and `check-preview` now guard the new result receipt and recent-record card tokens.
- Current acceptance:
  - static layout guard passed;
  - focused TypeScript no-emit passed;
  - runtime Preview acceptance is pending because the open Preview is still serving stale chunks for the two changed renderer files.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AD Runtime Acceptance For Result Guidance

- The Stage 4AC runtime cache blocker is cleared and the running Preview now serves the new result/readback chunks.
- Player-visible path accepted:
  - enter lobby as user `1`;
  - open adventure and see `LobbyAdventureRecentBattleSummaryCard`;
  - select `MAIN_1_1`;
  - enter formation and battle preview;
  - record no-reward battle settlement;
  - see `LobbyBattleSettlementReceipt` on the result page;
  - return to lobby and reopen adventure;
  - recent-record card reads back the latest settlement.
- Evidence:
  - screenshots are stored in `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ad-result-guidance`;
  - result receipt screenshot confirms the receipt node is visible in the modal content area;
  - adventure readback screenshot confirms recent-record presentation after returning.
- Runtime IDs:
  - stage `MAIN_1_1`;
  - battle `B05d15599907544cea526baba82b0cb12`;
  - settlement `Sc6ee0f5062f44317a0333c5c3d7fde30`.
- Guard status:
  - runtime settlement returned `rewardGranted=false` and `readonlyEconomy=true`;
  - backend current-flow smoke also passed with no economy snapshot change.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.

### 2026-05-31 Stage 4AE Latest Context Note

- The next completed frontend source stage is the lobby next-step goal tracker.
- New HUD nodes:
  - `LobbyGoalTracker`;
  - `LobbyCompactGoalTracker`;
  - `LobbyMicroGoalChip`.
- The tracker only reads adventure/selected-stage/recent-battle state and only opens the existing adventure panel.
- Static/frontend checks passed except current Preview freshness:
  - `npm.cmd run check:layout` passed;
  - focused Cocos TypeScript no-emit passed;
  - `npm.cmd run check:preview` fails because the open Preview still serves stale `LobbyHudRenderer.ts`.
- Backend smoke for the full current flow passed with battle `B3c2c3bee321449cf9ffe379e32f947fd` and settlement `S4fd31cbe921e4edbb1af0c60438682bd`, still `rewardGranted=false` and `readonlyEconomy=true`.
- Red-line gate remains unchanged:
  - no reward, stamina spend, mainline progress, saved formation, resources, USDT, fund-pool, or EX V1 behavior is introduced.
### 2026-05-31 Stage 4AF Fresh Player Closed-Loop Acceptance

- 产品验收结果：
  - 新玩家首次登录后会先进入主角创建页；
  - 创建 `VisualHero29` 后，大厅身份名立即使用主角名；
  - 大厅 next-step tracker 能引导玩家进入冒险，而不是让玩家在 HUD 中迷路；
  - 冒险、编队、战斗预演、无奖励结算、最近记录回读已经形成闭环。
- 玩家视角确认：
  - 主角是 SSR 主角，不进入抽卡池；
  - 主角作为英雄列表第一位进入可上阵队列；
  - 当前默认使用攻击形态，防御/辅助形态仍保持后续主线道具解锁方向；
  - 结算页和最近记录只表达“无奖励记录已写入”，不暗示领取、掉落、体力消耗或进度推进。
- UI/交互确认：
  - 弹框内容区仍通过 `BlockInputEvents` 阻止点击穿透；
  - 小视口路径使用 `LobbyMicroGoalChip` 与 micro action bar，当前 `390x340` 截图已覆盖；
  - 目标引导只打开冒险面板，不跳过编队，也不直接触发 battle start。
- 研发/审查补充：
  - `LobbyHeroRosterLoader` 修复并发加载竞态，快速操作时也会等待同一个英雄队列请求完成；
  - 最新运行时：user `29`，hero `26`，battle `B8a2ffc4fea6e40689e3a03030d156d03`，settlement `S013e12191ed944ca89b43cecf79a5fc6`；
  - 后端 fresh-player smoke 仍确认体力和战力不变：user `30`，stamina `100 -> 100`，combatPower `9432 -> 9432`。
- 边界不变：
  - 当前仍不开放真实奖励、体力消耗、主线进度写入、保存编队、背包/货币/USDT/资金池变更、EX V1 或任何经济写入口。

### 2026-05-31 Stage 4AG 大厅韧性闭环补充

- 产品验收结论：
  - 大厅当前已经从“能走通”推进到“能抵抗误触和重复操作”；
  - 玩家可以登录、进入大厅、查看目标、进入冒险、编队、战斗预演、记录无奖励结算、返回大厅和重登回读；
  - 锁定关卡和非法 EX 路径不会进入下一步。
- 设计/UI 要点：
  - 所有弹框都必须维持“遮罩点击关闭、内容区点击不关闭”的规则；
  - 登录弹框内容区已补 `BlockInputEvents`，和大厅弹框规则保持一致；
  - 编队页在英雄数据未准备好时不展示可点击的出战预演，按钮改为 `读取中` 或 `不可出战`。
- 研发要点：
  - `LobbyFormationPanelRenderer.canOpenBattlePreview()` 只允许 `MAIN`、无错误、且可见英雄数量大于 0 时进入战斗预演；
  - `check-layout`/`check-preview` 已把弹框阻断、目标追踪、战斗回执、最近记录、英雄队列竞态列为固定守卫；
  - `tmp/stage4ag-resilience-qa.mjs` 覆盖弹框阻断、非法/锁定路径、battle start/settle 快速点击去重、返回/重登回读、多分辨率 HUD。
- 最新运行时证据：
  - user `1`，displayName/protagonistName `圣契1`；
  - battle `B3525e4db77d94108a1c0379773366153`；
  - settlement `S6f721e05eee049658795824d15ddce0f`；
  - 最近记录返回大厅和重登后均回读同一 settlement；
  - `rewardGranted=false`，`readonlyEconomy=true`，`economyApplied=false`；
  - 截图目录 `D:\business\project\lootchain-cocos\docs\visual-qa\stage-4ag-resilience`。
- 测试/审查结论：
  - 前端 `check:layout`、`check:preview`、focused TypeScript no-emit 通过；
  - 后端 current-flow、stage guard、lineup guard、request guard、settle guard、fresh-player smoke 通过；
  - 未改变经济规则，未开放 EX V1，未新增经济写入口。

### 2026-05-31 Stage 4AH 全屏战斗与英雄详情补充

- 产品判断：
  - 战斗是核心体验，不能塞在缩小弹框里；
  - 当前先做大厅内全屏战斗逻辑视图，表现上等同进入战斗场景，后续如果需要物理 Cocos Scene 再拆；
  - 英雄列表需要能查看单个英雄详情，详情必须覆盖名称、稀有度、星级、技能、属性和主角形态信息。
- 设计/UI 方案：
  - 战斗层使用全屏遮罩和专属背景，不再压缩在小面板中；
  - 战斗过程保留阶段状态、己方/敌方、伤害/胜负/结算回执；
  - 英雄详情作为英雄列表上层详情页，返回后仍在英雄列表，不打断玩家查阅队伍；
  - 详情内容区拦截输入，避免点击穿透导致外层误关闭。
- 美术方案：
  - 新增暗黑哥特高质量战斗背景；
  - 新增英雄详情背景；
  - 新增主角动态立绘素材，用呼吸和光效表现“动态图”阶段目标；
  - 风格继续贴近参考图，避免卡通化和低龄化。
- 研发实现：
  - `LootChainGameRoot.ts` 增加 `battle` 视图和英雄详情状态；
  - `LobbyBattlePreviewPanelRenderer.ts` 升级为 `LobbyBattleSceneRoot` 全屏战斗表现层；
  - `LobbyHeroRosterPanelRenderer.ts` 支持英雄卡点击打开详情；
  - `LobbyHeroDetailPanelRenderer.ts` 新增只读详情展示；
  - `UiSpriteFrameCache.ts` 预加载新增资源；
  - `check-layout`/`check-preview` 已补本阶段 token 守卫。
- 审查结论：
  - 本阶段不新增任何战斗奖励、体力扣除、主线推进、保存编队、资源发放或经济写入；
  - 英雄详情只读，不开放升级、升星、觉醒、装备、抽卡、领取；
  - 不接 EX V1。
- 验收状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF->CRLF warning；
  - `npm.cmd run check:preview` 当前失败，原因为 Cocos Preview 仍在服务旧 chunk，需要刷新/重开 Preview 后复验。

### 2026-05-31 Stage 4AI 弹框转场景页补充

- 产品判断：
  - 登录账号页也不应继续保持小弹框比例；
  - 大厅入口承载的是长期功能页面，不应该继续用弹框承载；
  - 个人信息、公告、冒险、编队、英雄、英雄详情、图鉴、占位入口都应表现为“进入一个页面/场景”，玩家通过明确返回按钮离开；
  - 当前优先做单 Cocos 主场景内的逻辑场景切换，不拆物理 `.scene`，以保证已有登录、加载、大厅、战斗闭环稳定。
- UI/交互规则：
  - 大厅只保留 HUD；
  - 功能页打开后不再渲染大厅 HUD；
  - 功能页面板按安全区全屏铺开；
  - 遮罩层只阻断底层输入，不允许点击遮罩关闭；
  - 主退出按钮统一文案 `返回大厅`；
  - 英雄详情保留 `返回英雄`，作为上一级导航。
- 研发实现：
  - `LoginRenderer.ts` 的账号登录面板改为安全区全屏页面，`DialogDim` 只阻断底层输入；
  - `LootChainGameRoot.ts` 扩展 `ViewName`，新增 `profile/adventure/codex/formation/heroes/heroDetail/notice/placeholder`；
  - `renderLobbyScenePage()` 统一负责大厅功能页逻辑场景；
  - `returnToLobbyFromScenePage()` 统一清理功能页状态并回大厅；
  - 各 panel renderer 的 `dim` 从 Button 点击关闭改为 `BlockInputEvents`；
  - 各 panel renderer 的宽高从固定弹框上限改为基于 `layout.safeWidth/safeHeight` 的全屏页面。
- 审查结论：
  - 本阶段只改前端页面组织和 UI 尺寸；
  - 不新增后端接口；
  - 不新增经济写入口；
  - 不改变 no-reward battle contract；
  - 不开放 EX V1。
- 验收状态：
  - `npm.cmd run check:layout` 通过；
  - focused Cocos TypeScript no-emit 通过；
  - `git diff --check` 通过，仅有既有 LF->CRLF warning；
  - `npm.cmd run check:preview` 失败，原因为 Preview 旧 chunk 未刷新。

## 2026-05-31 Stage 4AJ 召唤祭坛入口分析补充

- 大厅入口调整：
  - 左侧活动栏 `深渊召唤` 不再显示占位弹框，进入全屏召唤预览页；
  - 场景热点 `召唤祭坛` 不再显示占位弹框，进入全屏召唤预览页；
  - 小屏快捷入口新增 `召唤`，同样进入全屏召唤预览页。
- 视觉结构：
  - 顶部：返回、标题、货币展示；
  - 左侧：卡池列表；
  - 中央：五张预览卡，SSR 主卡突出；
  - 右侧：概率、记录、兑换、保底；
  - 底部：保底说明、单抽、十连。
- 当前行为边界：
  - 概率、记录、兑换、保底按钮只给本地阶段提示；
  - 单抽/十连按钮只提示未开放；
  - 不调用后端抽卡、兑换、补发或任何资源变更接口。
- 多分辨率策略：
  - 大屏使用左卡池 + 中央 5 卡 + 右功能栏；
  - 窄屏使用顶部卡池 tab + 中央 3 卡 + 底部按钮；
  - 背景按 cover 方式铺满，UI 按 `safeWidth/safeHeight/uiScale` 自适应。

## 2026-06-01 Stage 4AK 召唤结果层产品补充

- 本阶段把单抽/十连从纯提示推进为“本地 mock 结果展示”，用于验证结果页视觉节奏和弹层交互。
- 点击单抽/十连后进入 `GachaMockResultLayer`，展示固定 mock 卡牌结果；关闭或返回后仍停留在 Gacha 召唤预览页。
- 结果层必须明确传达当前不是正式抽卡：
  - 未扣资源；
  - 未写入抽卡记录；
  - 未发放英雄；
  - 未更新保底。
- 产品边界不变：
  - 真实单抽、十连、兑换、补发仍未开放；
  - 概率、记录、兑换、保底按钮仍是只读/占位提示；
  - 不调用后端抽卡、兑换、补发、奖励或任何资源变更接口。
- 后续素材方向：
  - 继续补透明卡框、按钮三态、概率/记录/兑换/保底图标、召唤阵、粒子；
  - 真实抽卡开放前必须先完成后端 G1 只读白名单和 G2 测试环境单抽授权评审。

## 2026-06-01 Stage 4AL 主角选择全屏场景补充

- 选择角色不再按弹框理解，而是登录成功后的独立全屏阶段：`登录 -> 选择角色/创建主角 -> 资源加载 -> 大厅`。
- UI 目标：
  - 用全屏暗黑大殿背景承接主角创建；
  - 男/女角色卡作为主视觉中心；
  - SSR 形态说明和角色名输入作为右侧/底部操作区；
  - “进入游戏”是创建主角后的流程推进按钮，不是弹窗确认按钮。
- 当前产品边界：
  - 仍只开放男/女主角和默认攻击形态；
  - 防御/辅助形态继续锁定展示；
  - 主角不进入抽卡池，不参与抽卡概率，不产出抽卡碎片；
  - 不开放换头像、改名付费、重选角色、职业转化等写入口。
- 后续验收重点：
  - 新账号首次登录时必须看到全屏选择角色场景；
  - 创建中防重复点击仍有效；
  - 创建成功后进入 loading，再到大厅；
  - 小屏下角色卡、形态说明、输入框和进入按钮不能重叠。

## 2026-06-01 Stage 4AM 主角创建异常定位补充

- 现象：点击主角选择页“进入游戏”后提示“系统异常”。
- 定位：
  - 前端提交路径仍是 `POST /api/player/protagonist`，只提交 `gender` 与 `protagonistName`；
  - 后端 `GET /api/player/protagonist/state` 在本地返回 `code=500`；
  - MySQL 查询确认本地库缺少 `player_protagonist` 表，属于本地 schema 未执行主角模块 SQL。
- 修复：
  - 已执行 `D:\project\LootChain\sql\12_protagonist_module.sql`；
  - 默认 `userId=1` 仅复验状态接口，保持未创建状态，方便继续从 Cocos UI 走真实创建；
  - 另用测试玩家 `userId=3` 复验创建接口成功。
- 验证：
  - `userId=1` 的状态接口已返回 `code=0 / created=false`；
  - 主角模板 `PROTAGONIST_MALE_ATTACK`、`PROTAGONIST_FEMALE_ATTACK` 已存在；
  - `npm.cmd run check:layout` 与 focused Cocos Creator TypeScript no-emit 已通过。
- 产品边界：
  - 主角创建仍仅是账号初始化写入；
  - 不开放抽卡、奖励、购买、结算、资金池、链上领取、EX V1 或任何经济写入口。

## 2026-06-01 Stage 4AN 大厅功能页背景保活补充

- 现象：部分大厅功能页打开或关闭时，会闪出登录页背景视频。
- 产品判断：
  - 大厅功能页应以大厅世界背景为底图；
  - 页面切换可以替换 HUD 和内容页，但不能在中间帧露出登录舞台；
  - 登录舞台只属于 `login/loginDialog`，登录后不应继续参与大厅底图显示。
- 技术调整：
  - 登录舞台静态节点统一纳入 `LOGIN_SCENE_STAGE_NODE_NAMES`，非登录视图时隐藏；
  - 登录舞台通过节点显隐隔离底层画面，不再主动停止登录背景视频；
  - 回到登录页时递归尝试恢复登录背景视频播放；
  - 大厅功能页使用 `renderLobbyWorldBase()`，保留大厅 `Lobby_BG_*` 节点并只清理页面层；
  - `clearExcept()` 成为 UI root 的受控清理能力，避免再次用全清空路径处理大厅功能页。
- 验收重点：
  - 从大厅点击个人信息、公告、冒险、编队、英雄、图鉴、占位入口时不应闪登录背景；
  - 回到登录页或重新打开 Preview 时登录背景视频仍应播放；
  - 功能页返回大厅时大厅背景视频/poster 应连续；
  - 刷新/重开 Preview 后必须复验最新 chunk。
- 边界不变：只处理 Cocos 前端渲染生命周期，不新增后端接口或经济写入口。

## 2026-06-01 Stage 4AO 剩余弹层全屏场景化补充

- 产品要求：全部弹框都应表现为“进入新的全屏场景”，不再以局部弹层覆盖当前页。
- 当前实现仍采用单 Cocos 主场景内 `currentView` 逻辑场景切换：
  - 登录账号页使用 `LoginAccountSceneRoot` / `LoginAccountScenePanel`；
  - Gacha 本地结果使用 `gachaResult` 视图和 `GachaResultSceneRoot`；
  - 未开放占位入口使用 `LobbyPlaceholderSceneRoot` / `LobbyPlaceholderScenePanel`。
- 交互规则：
  - 全屏场景根节点必须挂 `BlockInputEvents`，阻断底层大厅或登录页输入；
  - 退出必须走明确返回按钮或场景内确认按钮，不再依赖遮罩点击关闭；
  - Gacha 结果关闭后回到 Gacha 预览页，不回大厅，不触发真实抽卡。
- 审查结论：
  - 本轮只改 Cocos 前端渲染组织和守卫 token；
  - 不新增后端接口、SQL、抽卡写口、奖励写口或经济变更；
  - `GachaMockResultItem` 仍只作为本地 UI mock 数据结构。
- 验收重点：
  - 点击账号登录应进入全屏账号页；
  - 点击 Gacha 单抽/十连应进入全屏结果预览页；
  - 点击未开放入口应进入全屏占位页；
  - 刷新/重开 Preview 后执行 `npm.cmd run check:preview` 复验最新运行包。

## 2026-06-01 Stage 4AP 登录账号页返修补充

- 反馈问题：
  - 登录背景视频在当前预览中消失；
  - 账号登录页视觉仍像弹框，没有明显“新场景切换”感。
- 调整结论：
  - 登录账号页从 `loginDialog` 改为 `loginAccount` 逻辑场景；
  - 账号登录页不再复用登录首页的 Logo、右侧 rail 和主登录按钮；
  - 登录账号页使用全屏半透明场景面和顶部/底部压层，保留视频背景但不再是居中弹框；
  - 登录视频控制组件提供 `resumeForLoginView()`，确保返回登录场景时视频和 poster 兜底能恢复。
- 验收重点：
  - 初始登录页必须能看到 `login_bg_loop_1080p` 或 poster 兜底；
  - 点击账号登录后应进入 `loginAccount` 全屏账号页，而不是显示旧 `loginDialog` 弹框；
  - 账号页返回登录页后背景视频仍应存在；
  - 重开/刷新 Preview 后执行 `npm.cmd run check:preview`。

## 2026-06-01 Stage 4AQ 登录背景只保留 Poster/Video

- 反馈问题：登录页当前看到的是静态背景，不是替换后的背景视频。
- 调整结论：
  - 登录页背景层只保留 `Login_BG_Poster` 和 `Login_BG_Video`；
  - 旧静态舞台节点全部关闭，避免与新视频资源叠加；
  - poster 只作为视频首帧/加载兜底，视频播放请求后会主动隐藏 poster；
  - 登录布局以 `Login_BG_Poster` / `Login_BG_Video` 作为舞台测量依据。
- 验收重点：
  - 重新打开 Preview 后，登录页不应再看到旧静态舞台层；
  - `Login_BG_Video` 应显示动态视频；
  - 视频加载前允许短暂显示 `Login_BG_Poster`，但不应长期停留在静态图；
  - 执行 `npm.cmd run check:preview` 确认运行包已更新。

## 2026-06-01 Stage 4AR 大厅功能入口全屏新场景化

- 反馈问题：从大厅点击某些功能时仍像弹框。
- 调整结论：
  - 大厅主界面只负责 HUD 和场景热点；
  - 点击资料、公告、冒险、编队、英雄、英雄详情、图鉴或占位入口后，先清空大厅运行时内容，再进入独立全屏功能场景；
  - 功能页不再复用大厅世界背景作为底图，避免视觉上继续像“覆盖在大厅上的弹框”；
  - 功能页内容层铺满舞台，不再按安全区缩成居中面板。
- 新场景节点：
  - `LobbyFeatureSceneBackdrop`：功能页统一全屏底图；
  - `LobbyAdventureSceneContent` / `LobbyAdventureSceneFrame`；
  - `LobbyCodexSceneContent` / `LobbyCodexSceneFrame`；
  - `LobbyFormationSceneContent` / `LobbyFormationSceneFrame`；
  - `LobbyHeroRosterSceneContent` / `LobbyHeroRosterSceneFrame`；
  - `LobbyHeroDetailSceneContent` / `LobbyHeroDetailSceneFrame`；
  - `LobbyNoticeSceneContent` / `LobbyNoticeSceneFrame`；
  - `LobbyProfileSceneRoot` / `LobbyProfileSceneContent`。
- 验收重点：
  - 从大厅点击任一功能后不应继续看到大厅 HUD；
  - 功能页应铺满舞台边界，而不是居中弹框；
  - 返回大厅后再重建大厅背景与 HUD；
  - 刷新/重开 Preview 后执行 `npm.cmd run check:preview`。

## 2026-06-01 Stage 4AS 返回按钮统一补充

- 产品要求：所有功能进入的新全屏场景，返回按钮要和抽奖模块保持一致。
- 交互结论：全屏功能页统一使用左上角金色箭头，不再使用底部“返回大厅”文字按钮作为返回入口。
- 英雄详情页的左上角箭头返回英雄列表，保持页面层级关系；战斗预览页未结算时返回编队，已记录结果后返回大厅。
- 未开放占位页也使用同款箭头，避免占位页仍像确认弹框。
- 技术落地：新增 `UiSceneBackButton.ts`，Gacha 与大厅功能页统一调用 `renderSceneBackButton()`，`check-layout` 和 `check-preview-freshness` 同步检查新按钮 token。
- 当前验证：静态布局检查与 focused TypeScript 编译已通过；运行中 Preview 仍为旧 chunk，需重开 Preview 后复验视觉与点击行为。

## 2026-06-01 Stage 4AT 召唤中心 Spine 展示补充

- 产品要求：召唤界面中心不再展示背景占位卡牌，改为展示 `Lord of the Dark Abyss` Spine 骨骼动画。
- 交互结论：该 Spine 仅作为召唤预览页中心视觉展示，不能表示真实抽卡结果、概率命中或奖励发放。
- 技术落地：Gacha 中心区新增 `GachaAbyssSpineStage` / `GachaAbyssSpineNode`，运行时按 UUID 加载 `sp.SkeletonData`，设置皮肤 `0`，先播 `appear` 再循环 `idle`。
- 结果页边界：单抽/十连仍只进入本地 mock 结果预览页，不扣资源、不发英雄、不写记录、不更新保底。
- 当前验证：`check:layout` 与 focused TypeScript 编译已通过；Preview 需要刷新/重开后复验 Spine 运行时渲染。

## 2026-06-01 Stage 4AU 友情召唤移除补充

- 产品要求：移除召唤页中的“友情召唤”卡池入口，避免玩家误解当前存在友情点或友情池经济规则。
- 交互结论：Gacha 卡池列表仅保留限定召唤、英雄召唤、普通召唤，以及锁定态光暗召唤占位。
- 技术落地：删除 `GACHA_PREVIEW_POOLS` 中 `id: 'friend'` 的池配置，并在 `check-layout` 加入回归守卫。
- 边界不变：这只是前端卡池分类展示调整，不开放真实抽卡、友情点、扣费、发奖、记录、保底或兑换写入。

## 2026-06-01 Backend Hero Roster Art Sync 补充

- 后端英雄模板新增 `portrait_asset` 字段后，Cocos 后续英雄列表/图鉴/详情页可以按该字段接入立绘资源映射。
- 当前立绘文件仍在 `C:\Users\axian\Desktop\hero`，没有进入 Cocos `assets/resources`，因此本轮不改变前端渲染逻辑。
- 已确认后端职业口径：战士、辅助、刺客、法师、射手、坦克。
- R/SR 当前已做到六职业各一个启用模板；SSR 当前启用法师、坦克、战士、刺客各一个；UR 已补齐六职业各一个。
- 新增 UR 不进入 `gacha_pool_item`，召唤页仍是视觉预览和本地 mock，不改变真实抽卡概率或结果池。

## 2026-06-01 Stage 4AV 英雄立绘资源编号与 Gacha 视觉修正

- 产品语义修正：英雄立绘绑定字段使用 `act_数字` 资源编号，不再把 `.png` 文件后缀写入数据库字段；实际图片文件仍可在 Cocos 资源目录中保留 `.png`。
- Cocos 大厅英雄队列、图鉴和普通英雄类型已具备 `portraitAsset` 只读字段，后续可在英雄列表/详情卡片接入立绘展示。
- Gacha 视觉修正：中心展示 Spine 从深渊之主换为 `huangfengjiaozong`，并移除背景/中心舞台上的红色圆圈，避免画面出现多余红色法阵环。
- 当前仍只做视觉预览和本地 mock 结果层，不开放真实抽卡、兑换、补发、扣资源、发英雄、记录或保底写入。

## 2026-06-01 Stage 4AW Gacha Spine 运行时资源加载补充

- 现象：配置已经切到 `huangfengjiaozong`，但 Preview 中没有显示新的中心 Spine。
- 原因：Spine 原先放在 `assets/spine/...`，不是 `resources` 运行时可寻址目录；按 UUID 动态加载在当前 Preview/build bundle 里不稳定，且旧 Preview chunk 未刷新时仍会执行旧逻辑。
- 调整结论：Gacha 中心 Spine 作为运行时动态资源，必须放入 `assets/resources/spine/gacha/huangfengjiaozong/`，并优先用 `resources.load` 加载。
- 交互边界：加载失败时只保留本地视觉 fallback 和状态提示，不触发抽卡、不扣资源、不发英雄、不写任何经济数据。
- 验收重点：
  - 重开 Cocos Creator Preview 后进入 Gacha，中心应显示 `huangfengjiaozong` 的 `idle` Spine；
  - `node .\scripts\check-preview-freshness.mjs` 应不再提示 Gacha chunk 缺少 `GACHA_ABYSS_SPINE_RESOURCE` 或 `resources.load`；
  - 召唤页单抽/十连仍只进入本地 mock 结果页，不调用真实抽卡写接口。

## 2026-06-01 Stage 4AX Gacha Spine 皮肤/动画自动解析补充

- 现象：资源进入 `resources` 后，Gacha 中心仍可能空白。
- 技术判断：`huangfengjiaozong` 的实际皮肤/动画名可能不是 `default` / `idle`；Cocos 在动画名无效时返回 `null` 而不抛异常，容易造成 fallback 被提前销毁。
- 调整结论：
  - Gacha 中心 Spine 不再硬依赖固定皮肤/动画名；
  - 播放前从 `SkeletonData` 枚举实际存在的 skin 和 animation；
  - 若配置名不存在，自动选择可用项，并保留运行时日志辅助验收；
  - TrackEntry 无效时保留 fallback 和状态提示。
- 验收重点：
  - 重开 Preview 后进入 Gacha，控制台应出现 `[Gacha] huangfengjiaozong spine applied`；
  - 日志中的 `skin` / `animation` 应为资源实际存在的名称；
  - 中心不应再出现完全空白。

## 2026-06-01 Stage 4AY Gacha Spine 无动画兜底补充

- 现象：界面一直显示 `黄风教宗准备中`，并提示未找到可播放动画。
- 结论：当前资源能被加载，但 Cocos 无法枚举到 animation；这通常表示 `.skel` 没有导出动画，或当前导出的动画数据不是 Cocos 运行时可识别格式。
- 调整结论：
  - 无 animation 不再视为阻塞显示；
  - 运行时解析成功后，先展示静态骨骼 setup pose；
  - 真正的解析失败仍保留 fallback 和错误提示；
  - 动态播放依赖后续重新导出带 animation 的 Spine。
- 验收重点：
  - 重开 Preview 后不应再一直停在 `黄风教宗准备中`；
  - 若资源没有 animation，应看到静态骨骼首帧和对应状态提示；
  - 若要动态效果，需要在 Cocos Inspector 中能看到 `huangfengjiaozong` 的 animation 列表。
## 2026-06-01 Stage 4AZ Gacha Spine 运行时解析失败兜底

- 现象：`huangfengjiaozong` 已进入 `resources` 并能返回 `sp.SkeletonData`，但运行时 `getRuntimeData(true)` 为空，界面继续显示准备中。
- 产品判断：当前不能继续让召唤中心空白；但也不能把该问题误判为抽卡、概率或后端问题。
- 技术结论：
  - 资源路径与 UUID 加载链已打通；
  - 当前失败点是 `.skel/atlas/texture` 在 Cocos 3.8.8 Spine runtime 中无法解析；
  - 要显示真正的黄风教宗动态 Spine，需要重新导出或重新匹配该资源包。
- 临时交互策略：
  - 优先加载 `huangfengjiaozong`；
  - 运行时解析失败时自动展示 `Lord of the Dark Abyss/1605` 作为可用 Spine 预览，确保中心区域不空白；
  - 状态栏明确说明需要重新导出 `huangfengjiaozong`，避免误以为已经显示目标资源。
- 边界不变：该 fallback 只是 Cocos 视觉预览兜底，不触发真实单抽/十连，不扣资源，不发英雄，不写抽卡记录/保底，不开放兑换、补发或 EX V1。

## 2026-06-01 Stage 4BA Gacha 状态文字位置补充

- 问题：Gacha 页蓝色状态提示位于底部安全区，会遮挡 `召唤1次` / `召唤10次` 按钮。
- 调整结论：
  - Gacha 和 GachaResult 视图使用专用状态提示高度；
  - 状态文字移动到底部召唤按钮上方；
  - 既保留 Spine 解析失败/fallback 的诊断提示，又不影响按钮点击和识别。
- 验收重点：
  - 重开 Preview 后进入 Gacha；
  - 触发 `huangfengjiaozong` fallback 或点击右侧概率/记录/兑换/保底；
  - 蓝色状态文字不应再压住底部召唤按钮。
- 边界不变：该调整仅改变前端提示文字位置，不改变抽卡、概率、消耗、保底、奖励或任何经济写入。

## 2026-06-01 Hero Detail Spine Asset Field Sync

- 英雄详情骨骼动画资源目录由后端 `hero_template.spine_asset` 提供。
- 字段值按 `portrait_asset` 派生：复制后将 `act` 替换为 `npc`，例如 `act_21053 -> npc_21053`。
- Cocos 大厅英雄队列、图鉴和普通英雄类型已具备 `spineAsset` 只读字段，后续英雄详情页可按该目录加载对应骨骼动画资源。
- 当前只补资源映射契约，不改变英雄列表/图鉴/详情页渲染，也不新增任何抽卡、养成、奖励、扣费或经济写入口。

## 2026-06-01 Stage 4BB Gacha Spine JSON Export Handoff

- Gacha 中心目标资源继续是 `huangfengjiaozong`，但运行时主入口从旧 `.skel` UUID 切换为用户新导出的 JSON SkeletonData UUID。
- 新 JSON 已确认包含 `default` skin 与 `idle` animation；atlas 为双图集页，必须同时保留 `huangfengjiaozong.png` 与 `huangfengjiaozong2.png`。
- 这次调整只解决“同名 skel/json 并存时可能加载旧资源”的前端资源歧义，不改变 Gacha 的本地 mock、按钮行为或任何经济规则。
- 验收重点：重开 Preview 后进入 Gacha；期望控制台命中 `huangfengjiaozong`，若仍显示备用 Spine，再检查 Cocos runtime 是否仍拒绝 `3.8.75` 数据。
- 当前 `check:preview` 仍提示运行中的 Preview 是旧 chunk，需重开或刷新后再复验。

## 2026-06-01 Stage 4BC Gacha Huangfeng Ground Alignment

- Gacha 中心 `huangfengjiaozong` 的视觉定位从悬空感较强的舞台中段下调到地面基准，目标是让脚底贴近背景中央法阵/地面。
- 技术实现调整 Spine 节点本地 Y、阴影位置，并加深背景后的全屏氛围暗幕，让整体背景退后；不改变资源、动画、按钮行为或本地 mock 结果。
- 验收重点：重开 Preview 后进入 Gacha，角色底部应落在地面视觉区域，不再悬在建筑中段；整个背景应统一压暗，不应在中间出现局部透明框。若仍偏高，只继续微调 `spineGroundY` 系数。
- 当前 `check:preview` 仍提示运行中的 Preview 是旧 chunk，需重开或刷新后再复验该视觉调整。

## 2026-06-01 Stage 4BD Gacha Huangfeng Size And Lower Placement

- Gacha 中心 `huangfengjiaozong` 继续按验收反馈放大并下移。
- 当前参数：`spineGroundY = -stageHeight * 0.55`，Spine 缩放基数 `0.43`。
- 验收重点：角色应比上一版更有主视觉分量，底部更贴近法阵地面，同时不遮挡底部召唤文案与按钮。
- 当前 `check:preview` 仍提示运行中的 Preview 是旧 chunk，需重开或刷新后再复验该视觉调整。

## 2026-06-01 Hero Detail Spine Preview Design Note

- 产品视角：英雄详情页只展示当前英雄自己的 `spineAsset`，资源缺失或解析失败时静态降级，不串用其它英雄或 Gacha 怪物 Spine，避免误导拥有状态和角色身份。
- 设计视角：骨骼动画承接左侧 `LobbyHeroDetailArtStage` 主视觉，不铺成整页背景；移除红色动态圆环和大红圆背景，保留暗色脚底投影、暗金地线和右侧只读属性/技能信息结构。
- 用户视角：窄屏下 art stage 与 info panel 使用计算式宽度和 gap，目标是不让角色、武器或特效压住徽章、属性格、技能列表、底部只读说明或返回按钮。
- 验收重点：重开 Cocos Preview 后进入英雄详情，确认 `npc_1001` 能按 `assets/resources/spine/hero/npc_1001/npc_1001` 加载；没有对应资源的英雄应显示静态占位且页面信息仍可读。
- 边界不变：该功能仅为 Cocos 只读视觉预览，不新增任何养成、抽卡、奖励、扣费、发放、记录或保底写入口。
## 2026-06-02 Hero Detail Secondary Animation/Layout QA Note

- 产品侧补充：英雄详情页应优先呈现当前英雄自己的 `spineAsset`，主动画负责常驻展示，第二动画每 15 秒插播一次作为战斗感反馈，播放后回到主循环。
- 设计侧补充：英雄主视觉不再使用大金边框或红圈背景，右侧信息区按“身份 -> 星级 -> 来源 -> 属性 -> 技能”纵向分层，避免徽章、星级和文字重叠。
- 用户侧验收：进入 `npc_1001` 英雄详情后，左侧骨骼动画应稳定显示且周期性触发第二动画；右侧拥有状态、星级、属性、技能文本应可读，不应相互覆盖。
- 边界不变：该页只读展示，不新增养成、抽卡、奖励、扣费、发放、记录或保底写入入口。
## 2026-06-02 Gacha Background Consistency Note

- 召唤页背景与英雄详情背景统一使用 `ui/hero-detail/hero_detail_backdrop/spriteFrame`，让两个强角色展示场景共用同一套暗黑殿堂空间。
- 该调整只替换视觉背景资源，不改变卡池、按钮、概率、mock 结果、Spine 展示或任何后端写入边界。
## 2026-06-02 Generated Gacha Background / Hero Grounding Note

- 抽奖背景改用新生成的 `ui/gacha/gacha_bg_abyss_ring/spriteFrame`：深冷蓝黑殿堂、上方低饱和红环、地面暗金反光，中央下方留给暗灰骨骼角色站立。
- 英雄详情主视觉桌面布局从左侧偏置改为中心站位，让角色在红环下方落地展示；脚底投影和 Spine 根节点共用同一地面基线，避免人物悬空。
- 该调整仅影响 Cocos 视觉资源与布局，不改变抽卡、概率、mock 结果、养成、奖励、扣费或任何后端写入边界。
## 2026-06-02 Gacha Background Overlay Removal Note

- 抽奖页背景不再叠加全屏黑色暗层，便于直接观察新生成的深冷蓝黑殿堂背景与上方红环。
- 角色和 UI 的可读性后续应优先通过角色局部描边、投影、按钮自身底色来保障，而不是用整屏黑罩压暗背景。
- 该调整仅影响视觉层，不改变抽卡、概率、mock 结果、奖励、扣费或任何后端写入边界。
## 2026-06-02 Hero Detail Overlay / Identity Plate Note

- 英雄详情视觉层移除了中间半屏暗带，并降低全屏暗遮罩透明度，让背景红环和殿堂空间更可见。
- 英雄名称、等级、战力从左上角迁移到角色下方居中身份牌，减少左上角漂浮信息感，也让视觉焦点集中在人物脚下区域。
- 原主视觉底部 caption 被移除，底部只保留一条只读边界说明，解决下方两行文字重叠问题。
- 该调整仅影响 Cocos 视觉与排版，不改变抽卡、养成、奖励、扣费、发放、记录或任何后端写入边界。
## 2026-06-02 Hero Detail Initial Secondary Animation Note

- 英雄详情页现在进入时先播放第二动画作为亮相动作，然后回到主循环；后续每 15 秒继续插播第二动画。
- 该调整仅改变 Cocos Spine 展示节奏，不改变英雄详情只读边界、养成、抽卡、奖励、扣费、记录或任何后端写入。
## 2026-06-02 Hero Detail Spine Company Preview QA Note

- 公司电脑更新代码后，王国巡逻兵详情页仍显示静态占位图形，未显示 Spine。
- QA 判断：
  - 本机 `npc_1001` Spine 资源存在，王国巡逻兵应通过 `spineAsset=npc_1001` 加载；
  - 当前 `check:preview` 显示 Cocos Preview 仍在服务旧 chunk，旧 `LobbyHeroDetailPanelRenderer.ts` 运行包缺少英雄详情 Spine 加载与动画 token；
  - 同时公司本地 MySQL 需要确认已执行 `sql/16_hero_spine_asset.sql`，否则后端不会给 Cocos 返回 `spineAsset`。
- 复验动作：先跑 SQL 16 并验证 `R_PATROL_01` 为 `act_1001 / npc_1001`，再重开 Cocos Creator Preview，等资源重新导入后重新进入英雄详情。
- 该问题属于本地环境同步/Preview 刷新问题，不改变英雄详情只读边界，也不新增任何经济写入口。

## 2026-06-02 Hero Detail Spine Fallback / SQL Sync QA Note

- 为降低公司/家里电脑本地库不同步导致的空白风险，Cocos 只读英雄队列与图鉴 API 已增加 `portraitAsset -> spineAsset` 兜底：
  - 后端返回 `spineAsset` 时直接使用；
  - 后端缺字段或本地库暂未同步时，按展示资源约定从 `act_数字` 派生 `npc_数字`；
  - 渲染层仍只按 `spine/hero/{spineAsset}/{spineAsset}` 加载当前英雄自己的资源，不串用 Gacha 或其它英雄 Spine。
- 本机已执行 SQL 12/15/16 并复验：
  - `R_PATROL_01` 为 `act_1001 / npc_1001`；
  - `hero_template` 中有立绘资源的英雄 `spine_asset` 派生 mismatch 为 `0`。
- 卡池风险记录：
  - 本次没有改 `gacha_pool_item`；
  - 当前普通池已有 `UR_ARTHAS`、`UR_EVELYN`，来源是既有 `sql/07_gacha_module.sql` 初始配置，不属于本阶段新增；
  - 若后续要调整普通池 UR 掉落，需要单独做经济评审，不在当前 Cocos 视觉/只读详情阶段处理。
- 验收重点：
  - 重开 Cocos Creator Preview 后进入王国巡逻兵详情，期望加载 `assets/resources/spine/hero/npc_1001/npc_1001`；
  - 如果仍显示静态占位，先看 Preview 是否仍旧 chunk，再看接口响应中的 `portraitAsset/spineAsset` 和控制台 `[HeroDetail]` 日志。
- 边界不变：只读展示，不开放升级、升星、觉醒、装备、抽卡、领取、扣费、记录、保底、奖励或任何经济写入口；EX V1 仍不开放。

## 2026-06-02 Spine Dynamic URL Conflict QA Note

- Cocos 控制台的 `动态加载 URL 相同` 日志说明资源结构存在冲突，不是数据库或接口单点问题。
- 设计/技术结论：
  - `assets/resources` 下用于 `resources.load` 的 Spine 目录，不能同时保留同 basename 的 `.json` 与 `.skel`；
  - `.spine` 工程源文件也不能留在 `assets/resources/spine`，否则可能与 `.atlas` 共用动态 URL；
  - 运行时目录只保留 SkeletonData 入口、atlas 和贴图；源文件统一归档到非运行时目录。
- 本轮处理：
  - `huangfengjiaozong` 运行时保留 JSON 版本，移出旧 skel 与 spine 源文件；
  - `npc_1001` 运行时保留 skel 版本，移出 spine 源文件；
  - `act_1001` 与 `Lord of the Dark Abyss/085` 的 spine 源文件也移出 `resources`；
  - 归档目录为 `docs/spine-source-archive/resources-conflict-backup/`。
- QA 验收重点：
  - Cocos Creator 重新导入后，控制台不应再出现这些同名动态 URL 冲突日志；
  - 英雄详情应继续按 `spine/hero/npc_1001/npc_1001` 加载；
  - Gacha 应继续按新 JSON UUID/路径命中 `huangfengjiaozong`。
- 边界不变：这是资源目录结构修复，不涉及后端、SQL、抽卡、奖励、扣费、卡池、保底、EX V1 或任何经济写入口。
## 2026-06-02 Hero Detail Spine Runtime Fallback QA Note

- 复查公司电脑英雄详情静态占位问题时，确认当前 Preview 仍在服务旧 chunk；旧运行包缺少英雄详情 Spine 加载、诊断日志和新全屏返回按钮逻辑。
- 同时当前运行中的英雄列表接口暂未返回 `portraitAsset/spineAsset`，所以即便源码有 `portraitAsset -> spineAsset` 兜底，旧服务响应也可能无法给出资源名。
- 已在 Cocos 只读层增加当前样例兜底：`R_PATROL_01 -> act_1001 / npc_1001`。该映射只用于展示资源，不参与抽卡、发放、扣费、保底或任何经济写入。
- 英雄详情页新增 `[HeroDetail] hero spine asset missing` 和 `[HeroDetail] hero spine load start` 诊断，方便区分“接口没给资源名”“Preview 旧 chunk”“资源加载失败”“Spine runtime 解析失败”。
- 验证结果：`check:layout`、focused TypeScript 与 `git diff --check` 已通过；`check:preview` 仍失败，说明当前运行 Preview 还没有吃到本轮新增的英雄详情日志与 Spine 资源兜底代码。
- QA 复验顺序：重启/刷新 Cocos Creator Preview；若 `check:preview` 仍失败，关闭 Creator 后清理生成缓存；后端服务重启后再确认英雄列表正式带出 `portraitAsset/spineAsset`。

## 2026-06-02 Hero Detail Spine Audio QA Note

- 现象：英雄详情 Spine 动画有音效设计，但运行时听不到。
- QA 结论：当前不是经济或后端问题，而是 Cocos 前端尚未监听 Spine event 音效，加上 `npc_1001` 对应 mp3 文件未进入 `assets/resources`。
- 已完成前端接入：
  - 英雄详情 Spine 节点增加 `AudioSource`；
  - 监听 `sp.Skeleton.setEventListener()`；
  - 从 `event.data.audioPath` 解析音效名并加载 `AudioClip`；
  - 成功后 `playOneShot`，失败时输出 `[HeroDetail] hero spine audio missing`。
- 当前 `npc_1001.skel` 需要的音频名：`1001_skill1_1.mp3`、`1001_skill2_1.mp3`、`1001_skill4_3.mp3`。
- 资源补齐后复验：把同名音频放到 `assets/resources/spine/hero/npc_1001/` 或 `assets/resources/spine/hero/npc_1001/audio/`，等待 Cocos 重新导入，再进英雄详情触发技能动画。
- 验证结果：`check:layout`、focused TypeScript 与 `git diff --check` 已通过；`check:preview` 仍失败，说明当前运行 Preview 还没有吃到本轮新增的音频事件监听代码。
- 边界不变：只处理只读展示音频，不涉及抽卡、发放、扣费、保底、奖励、后端写入或 EX V1。

## 2026-06-02 Real Gacha Draw QA Note

- Product direction changed after explicit user approval: the summon page may now call the existing real draw endpoint, but only through the current backend gacha transaction flow.
- Left-side summon pool entries should be driven by backend display config. Each row needs a reserved logo slot, theme color, title/subtitle, lock state, and draw-enabled flag.
- The selected pool drives the center Spine resource, right-side action notes, single/ten button labels, disabled reason, and top pity line.
- The top pity line now belongs near the upper Gacha stage instead of below the center art. The single and ten draw buttons need a wider visual gap to avoid crowding.
- Preview-only or locked pools can appear as product placeholders, but must remain non-drawable. They may show limited/basic/light-dark themes while keeping real economy output closed.
- Real draw is limited to the existing `POST /api/player/gacha/draw` path and backend transaction behavior. Exchange, reissue, bag use/sell, hero growth, EX V1, and any new economy write endpoint remain closed.
- QA focus for this stage: pool switching changes Spine/UI data, locked pools cannot draw, real draw returns `drawNo` and result items, pity refreshes after draw, stale Cocos Preview chunks are cleared before visual acceptance, and SQL 17 display config is imported locally with MySQL password.

## 2026-06-02 Gacha Reveal Preview QA Note

- 大厅左侧“深渊召唤”、场景热点“召唤祭坛”和小屏“召唤”仍进入独立 Gacha 全屏预览页。
- 召唤页点击 `召唤1次` / `召唤10次` 后新增中间演出页 `gachaReveal`，而不是直接跳到结果：
  - 返回按钮回到召唤页；
  - `查看本地结果` 才进入结果页；
  - 结果仍使用固定本地 mock 数据。
- 演出页 QA 重点：
  - 背景应继续是 `gacha_bg_abyss_ring`；
  - 中央应出现红金召唤阵呼吸、卡背淡入、聚魂/裂隙/显影进度；
  - 底部边界条必须说明不扣资源、不生成 drawNo、不写记录、不更新保底。
- 验证结果：`check:layout`、focused TypeScript 与 `git diff --check` 已通过；`check:preview` 仍失败，运行中的 Preview 旧 chunk 缺少 `GACHA_REVEAL_STEPS`、`GachaRevealSceneRoot`、`GachaRevealContinueButton` 等新 token，需要重开 Cocos Creator Preview 后再确认运行效果。
- 边界不变：该阶段只扩展 Cocos 前端演出与本地 mock 结果，不接真实抽卡、不发英雄、不扣资源、不写记录、不改保底、不开放兑换/补发/EX V1，也不新增任何经济写入口。

## 2026-06-02 Gacha Spine Async Callback QA Note

- 现象：召唤页在中心 Spine 异步加载期间切换/重绘时，Preview 可能弹出 `Cannot read properties of null (reading 'isValid')`。
- QA 判断：这是 Cocos Gacha 渲染层的过期异步回调问题，不是卡池配置、概率、保底或 SQL 数据问题。
- 修复验收点：
  - Gacha 中心 Spine 回调先通过 `isSkeletonNodeAlive()` 判断骨骼节点仍存在；
  - fallback 节点销毁前先通过 `isNodeAlive()` 判断；
  - 已加载 SkeletonData 后的回调分发有异常隔离，旧页面回调不会再打断当前 Preview；
  - 资源加载失败、运行时解析失败、动画缺失仍应继续显示明确状态提示。
- 回归守卫：`check:layout` 已禁止 `GachaSceneRenderer.ts` 直接使用 `skeleton.node.isValid` / `fallback.isValid`。
- 验收角色结论：本轮 `isValid` 报错修复通过；当前工作区存在前一阶段已批准的真实 draw 接入，验收时需按阶段区分，不应误判为本轮新增经济入口。
- 验证结果：`check:layout`、focused TypeScript、针对性 `rg` 与 `git diff --check` 已通过；Browser 当前打开 `http://localhost:7456/` 未再检测到 null `isValid` 错误文本或控制台 warning/error。`check:preview` 仍提示运行中的 Cocos Preview 是旧 chunk，需要重开/刷新 Preview 后做最终视觉验收。
- 边界：本轮只修复 Gacha Cocos 前端异步回调崩溃，不修改后端、SQL、经济规则、卡池、概率、保底、消耗、奖励、EX V1 或新增经济写入口。

## 2026-06-02 Real Draw Redis Dependency QA Note

- 现象：召唤页真实抽卡显示“召唤失败：系统异常”。
- QA 结论：不是 Cocos Canvas、Spine 或卡池展示配置问题，而是本地后端真实 draw 事务依赖 Redis/Redisson，当前 Redis `6379` 未启动时后端返回通用 500。
- 数据复核：
  - `NORMAL_HERO` 卡池启用，概率 4 档、池项 8 条、英雄模板 8 个均正常；
  - 玩家 1 正常，`DIAMOND=1000`；
  - 单抽成本 280，可执行；十连成本 2800，当前余额不足。
- 环境修复：
  - 已启动 Docker Desktop；
  - 已确认 `usdt-monitor-redis` 映射 `0.0.0.0:6379->6379/tcp`；
  - Redis 可达后，带 dev-login token 的 `POST /api/player/gacha/draw` 单抽返回 `code=0`、真实 `drawNo` 和 R 英雄结果。
- DB 复核：`drawNo=GACHA6c7808f3dd2143679f662e74bd43a11b` 消耗 `DIAMOND 280`，结果为 `HERO/R_ACOLY_02/R`；玩家 1 抽后 `DIAMOND=720`。
- QA 复验建议：回到 Cocos 召唤页后先点 `召唤1次` 验收真实结果页；不要用当前余额直接验收十连，十连应先补足钻石或预期看到余额不足业务提示。
- 边界不变：本轮只修复本地运行依赖，未修改代码/SQL/经济规则，未改变卡池、概率、权重、保底、消耗、奖励、重复转碎片或 EX V1，未新增经济写入口。

## 2026-06-02 Lobby Bag Readonly QA Note

- 大厅背包已从占位入口推进到独立 full-screen 逻辑场景。
- 入口验收：
  - 底部导航“背包”进入背包场景；
  - 小屏/紧凑 HUD 的“背包”动作进入同一背包场景；
  - 返回按钮使用统一全屏场景返回逻辑，返回大厅时不应闪出登录背景。
- 数据验收：
  - 背包列表只调用 `GET /api/player/bag`；
  - 选中道具来源只调用 `GET /api/player/bag/items/{itemCode}/source`；
  - 切换账号后不保留上一账号背包快照；
  - 服务端无数据或来源读取失败时显示空态/错误提示，不进入写入流程。
- UI 验收：
  - 页面展示分类、总数、只读标识、道具卡片、选中详情、来源说明；
  - `使用/出售关闭` 必须是禁用状态；
  - 不出现使用、出售、批量使用、兑换、领取、资源变更等可点击写入口。
- 守卫与验证：
  - `check:layout` 已通过，并继续阻断 `/api/player/bag/use`、`/api/player/bag/batch-use`、`/api/player/bag/sell`；
  - focused TypeScript no-emit 已通过；
  - `git diff --check` 已通过，仅有既有 LF/CRLF warning；
  - 当前 Browser 控制台暂无 warning/error；
  - `check:preview` 仍提示运行中的 Cocos Preview 是旧 chunk，需要重开/刷新 Preview 后做最终视觉验收。
- 边界不变：这是背包只读展示阶段，不改经济规则，不开放 EX V1，不新增经济写入口，不开放背包使用/出售/批量使用。

## 2026-06-02 Gacha Side Pages And Fragment QA Note

- 顶部资产：
  - 大厅 HUD 与 Gacha 顶栏必须从 `GET /api/player/me/lobby` 的 `gold` / `diamond` 展示；
  - 不应再出现 `3,456K`、`8,888`、`2,450` 等硬编码假资产。
- 英雄碎片：
  - 重复英雄转化碎片存储在 `user_hero_fragment`；
  - 背包页需要显示“英雄碎片”分组，但这是前端聚合展示，不是把碎片写入 `user_bag`；
  - 点击碎片来源应显示“重复抽到同名英雄自动转化”的只读说明，不调用 `/api/player/bag/items/{itemCode}/source`。
- 召唤右侧功能：
  - `概率保底`、`记录`、`兑换`、`奖池内容` 均进入独立 full-screen 逻辑场景，不再只弹状态提示；
  - `概率保底` 合并概率配置、保底配置、当前 pity 和重复转碎片规则；
  - `记录` 只读展示当前玩家召唤记录；
  - `兑换` 只展示说明与禁用按钮，不开放兑换写接口；
  - `奖池内容` 展示当前卡池中启用的英雄/物品条目。
- QA 重点：
  - 切换卡池后，打开右侧功能页读取当前选中 `poolCode`；
  - 真实 draw 成功后顶部金币/钻石需重新读资料刷新；
  - 小屏 Gacha 也必须能进入四个右侧功能页；
  - 兑换、补发、背包使用/出售、英雄养成、EX V1 仍不可点击、不可调用。
- 验证结果：`check:layout` 通过，focused TypeScript no-emit 通过，后端聚焦测试 7 个通过，两个仓库 `git diff --check` 通过；`check:preview` 仍提示运行中的 Cocos Preview 是旧 chunk，缺少 Gacha 子页、碎片聚合等本轮 token，需要重开/刷新后做视觉验收。

## 2026-06-02 Gacha Result Back Button QA Note

- QA 现象：召唤结果页左上角返回箭头可见，但点击没有返回到召唤页。
- 验收修复点：
  - 主召唤页返回按钮必须仍然关闭 Gacha 场景并回到大厅，不应误用结果页关闭逻辑；
  - 召唤结果页返回按钮必须调用 `closeGachaMockResultScene()` 并回到召唤页；
  - 结果页返回按钮必须在全屏结果内容层之后渲染，避免被结果面板或遮罩拦截点击。
- QA 复验方式：重开/刷新 Cocos Creator Preview 后进入召唤页，执行一次可用召唤进入结果页，点击左上角返回箭头，应回到召唤页而不是停留在结果页。
- 边界不变：本次只是 Cocos 结果页返回交互修复，不涉及后端、SQL、抽卡概率、消耗、奖励、保底、重复转碎片、卡池或任何新经济写入口。

## 2026-06-03 Unified Scene Back Header QA Note

- QA 现象：全屏逻辑场景左上角返回按钮需要高质量 UI，并且按钮右侧需要展示当前页面标题。
- 验收点：
  - 返回按钮应使用 `assets/resources/ui/common/scene_back_button.png` 的暗金高清按钮素材；
  - 标题应紧跟在按钮右侧，召唤页显示 `召唤`，英雄页显示 `英雄`，背包页显示 `背包`，其他全屏逻辑场景按各自功能名显示；
  - 召唤结果页返回按钮必须仍返回召唤页，主召唤页返回按钮必须仍返回大厅；
  - 标题和按钮不应被全屏内容面板遮挡或拦截点击。
- 守卫要求：`check:layout` 校验按钮素材尺寸、spriteFrame meta、统一坐标和标题节点；`check:preview` 用新 token 判断运行中的 Cocos Preview 是否还是旧 chunk。
- 边界不变：本次仅涉及 Cocos UI 与 QA 守卫，不改变后端、SQL、抽卡概率/权重/保底/消耗/奖励/重复转碎片、EX V1 或任何经济写入口。
## 2026-06-03 Hidden Chat And Right Rail QA Note

- Lobby world chat is currently not open and must stay hidden:
  - no bottom `LobbyChatPreview`;
  - no compact chat action entry.
- Lobby right-side challenge buttons must stay hidden in the current stage. Wide lobby should not render `LobbyChallengeRail`.
- Gacha right-side action pages should not look empty:
  - probability/pity, record, exchange, and pool-content pages use a centered panel instead of a full-width/full-height content frame;
  - exchange keeps its disabled button, with list content reserved above it.
- QA should restart/refresh Cocos Creator Preview before visual acceptance, because stale chunks can keep the old full-screen panel and old lobby buttons visible.
- Boundary unchanged: frontend visual/layout only; no backend, SQL, economy rule, EX V1, or new economy write-entry change.

## 2026-06-03 Home SQL Sync / Spine Resource QA Note

- SQL sync QA:
  - Local SQL 12, 15, 16, 17, 18, 19, 20, and 21 were imported into `lootchain`.
  - On Windows PowerShell, avoid `Get-Content | mysql` for Chinese SQL unless the native pipe encoding is explicitly controlled; the safer local path used here is MySQL `source D:/project/LootChain/sql/xx.sql` with `--default-character-set=utf8mb4`.
  - Verification must include `hero_template.spine_uuid`, enabled hero uuid count, repaired text rows with no `?`, `gacha_pool_display_config.tab_logo_asset`, and Chinese table comments.
- Spine resource QA:
  - `.spine` source files must not remain under `assets/resources/spine`; they should be archived under `docs/spine-source-archive/`.
  - `act_1012`, `npc_1012`, and `npc_1046` source files were archived to `docs/spine-source-archive/home-sql-sync-20260603/`.
  - `huangfengjiaozong` must keep the runtime files `huangfengjiaozong.json`, `huangfengjiaozong.atlas`, `huangfengjiaozong.png`, and `huangfengjiaozong2.png` in `assets/resources/spine/gacha/huangfengjiaozong/`.
  - Current `check:layout` passes after restoring those runtime files and archiving source files.
- Visual acceptance still requires restarting Cocos Creator Preview and waiting for asset reimport before judging summon and hero-detail Spine behavior.
- Boundary unchanged: this QA note covers local SQL/display-resource synchronization only; no gacha probability, cost, reward, pity, EX V1, exchange/reissue, bag write, hero growth, or new economy write surface is opened.

## 2026-06-03 Hero Roster Reference Layout QA Note

- Product acceptance:
  - hero roster should read like a hero-wall screen, not a data table;
  - left rail shows class tabs, with only `全部` active until backend provides class-filter data;
  - hero cards are vertical, large, and visually grouped across the center;
  - top-right data is readonly, not fake currency;
  - bottom-right growth area must look disabled and say `升级关闭` / `养成入口未开放`.
- UI art acceptance:
  - card skins come from the provided local art folder and live under `assets/resources/ui/hero-roster/`;
  - mapped portraits live under `assets/resources/ui/hero-roster/portraits/`;
  - if a hero has no mapped portrait, the card must show the local placeholder instead of a Spine atlas sheet.
- Development acceptance:
  - clicking a hero card still opens the existing readonly hero detail page;
  - refresh still calls the existing readonly hero roster loader;
  - no upgrade/level-up/star-up/awaken/equipment/bag/gacha/economy write route is added or called.
- Review result:
  - `check:layout` passes;
  - focused TypeScript passes;
  - Cocos Preview must be restarted/refreshed so newly imported `ui/hero-roster` resources are visible.

## 2026-06-03 Hero Roster Dark Card QA Note

- Product/design acceptance:
  - hero roster cards should no longer look cream-colored, cute, or cartoon-like;
  - cards should match the current dark cathedral backdrop with black obsidian, worn metal, restrained gold, and low-saturation rarity accents;
  - rarity color is a visual reading aid only and must not imply new mechanics.
- UI art acceptance:
  - `card_r.png`, `card_sr.png`, `card_ssr.png`, and `card_ur.png` under `assets/resources/ui/hero-roster/` are now generated dark gothic card skins;
  - generated source is archived at `docs/generated-art/hero-roster-dark-gothic-card-source.png`;
  - no-portrait fallback should look like a dark seal/spire emblem, not a temporary circle/triangle placeholder.
- Development acceptance:
  - card asset paths and meta uuids stay stable;
  - clicking a card still only opens the existing readonly hero detail page;
  - disabled growth visual remains non-interactive and must not call upgrade/star/equipment/economy routes.
- Review result:
  - `check:layout` passes;
  - focused TypeScript passes;
  - `check:preview` still reports stale running Cocos Preview chunks;
  - restart/refresh Cocos Preview and wait for `ui/hero-roster` reimport before visual acceptance.

## 2026-06-03 Hero Roster Product Visual Pass QA Note

- Product acceptance:
  - hero cards should read as the screen's main mid-ground object, not as small stickers on the cathedral background;
  - the red ring backdrop may remain atmospheric, but it should not visually overpower the cards;
  - card text must sit inside the lower in-card nameplate, with clear padding from the metal frame.
- UI/layout acceptance:
  - desktop card height should feel materially larger than the first dark-card pass;
  - card spacing should leave the cards as a group, not isolated columns;
  - rarity, name, and stars should be vertically grouped inside `LobbyHeroRosterInfoPlate`;
  - long hero names may shrink, but they must not escape or overlap the card frame.
- Development acceptance:
  - `LobbyHeroRosterInfoPlate` exists and is guarded by `check:layout` / `check-preview-freshness`;
  - clicking hero cards still only opens readonly hero detail;
  - disabled growth dock remains non-interactive.
- Review result:
  - `check:layout` passes;
  - focused TypeScript passes;
  - restart/refresh Cocos Preview before judging final visual placement.

## 2026-06-03 Hero Roster LootChain Visual Language QA Note

- Product acceptance:
  - the hero roster should no longer depend on bright/cartoon reference portraits or UI Spine effects;
  - imported reference assets may inform timing and hierarchy, but the visible hero screen should read as LootChain dark fantasy;
  - the red ring backdrop should sit behind the cards as atmosphere, not become the main subject.
- UI acceptance:
  - each hero card center should show `LobbyHeroRosterHeroRelief`, a dark in-card relief/silhouette;
  - card-stage particles should be restrained red-gold dust through `LobbyHeroRosterAbyssDust`;
  - no `ui/hero-roster/portraits/*` asset should be required for the current hero roster.
- Development acceptance:
  - `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`;
  - clicking a card still opens the existing readonly hero detail page;
  - refresh still calls the readonly hero roster loader;
  - disabled growth dock remains non-interactive and must not call upgrade/star/equipment/economy routes.
- Review result:
  - `check:layout` passes;
  - focused TypeScript passes;
  - `check:preview` still reports stale running Preview chunks missing `USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false`, `LobbyHeroRosterHeroRelief`, and `LobbyHeroRosterAbyssDust`;
  - restart/refresh Cocos Preview before final visual acceptance.

## 2026-06-04 Hero Roster Top-Left Cards And UR Effect QA Note

- Product acceptance:
  - hero cards should start near the top of the roster body and expand from the left, matching the second reference image's reading order;
  - SSR and UR should no longer read as nearly identical cards;
  - UR rarity remains visual emphasis only and must not imply new odds, rewards, growth, or acquisition behavior.
- UI/resource acceptance:
  - `spine/ui/card_light` from the provided local reference package is used only as a UR card-frame light effect;
  - runtime files live at `assets/resources/spine/ui/hero-roster/card_light/card_light.skel|atlas|png`;
  - no `.spine` source file may remain under `assets/resources/spine`;
  - if the Spine runtime fails to load, `LobbyHeroRosterUrAura` still provides a gold UR fallback.
- Development acceptance:
  - `LobbyHeroRosterPanelRenderer.ts` uses top-left body anchoring through `bodyLeft + cardInsetX + cardWidth / 2` and `bodyTop - cardInsetY - cardHeight / 2`;
  - only `rarity === 'UR'` cards render `LobbyHeroRosterUrCardLightSpine`;
  - clicking a card still only opens the existing readonly hero detail page;
  - refresh still calls the readonly hero roster loader;
  - disabled growth dock remains non-interactive.
- Review result:
  - `check-layout` and `check-preview-freshness` guard the layout/effect tokens and the `card_light` runtime resource path;
  - `check:layout`, focused TypeScript, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks missing the latest hero roster top-left layout and UR effect tokens;
  - final visual acceptance still requires restarting/refreshing Cocos Preview after resource import.

## 2026-06-04 Hero Roster UR Border Effect Replacement QA Note

- Product acceptance:
  - UR card effects should read as border emphasis, not as a vertical full-card beam;
  - SSR/UR differentiation should come from restrained UR border motion and gold edge highlights;
  - level text and corner badge must sit inside the card frame with visible padding.
- UI/resource acceptance:
  - `spine/ui/goods_1` from the provided local reference package is the selected UR border effect;
  - runtime files live at `assets/resources/spine/ui/hero-roster/goods_1_border/goods_1.skel|atlas|png`;
  - old `card_light` and temporary `frame` UR effect runtime paths must stay absent from `assets/resources/spine/ui/hero-roster`;
  - no `.spine` source file may remain under `assets/resources/spine`.
- Development acceptance:
  - only `rarity === 'UR'` cards render `LobbyHeroRosterUrGoodsBorderSpine`;
  - `LobbyHeroRosterUrBorderAura` provides a thin local fallback border if the Spine runtime fails to load;
  - `LobbyHeroRosterLevel` uses `levelInsetX + levelWidth / 2` and `levelInsetY + levelHeight / 2` center positioning;
  - `LobbyHeroRosterClassBadge` uses `badgeInsetX + badgeSize / 2` and `badgeInsetY + badgeSize / 2` center positioning;
  - top status capsules respect `topBarLeftReserve` so they do not push into the return-title area.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing `goods_1_border` and the latest level/badge inset tokens;
  - final visual acceptance still requires restarting/refreshing Cocos Preview after the new Spine resource import.

## 2026-06-04 Hero Roster UR Border Alignment QA Note

- Product acceptance:
  - UR border lines should sit on the card frame instead of floating outside it;
  - top `Lv.1` and class badge must be readable at normal zoom and should not sit directly on ornate card-frame texture;
  - UR differentiation should remain a border effect, not a central glow over the hero relief or nameplate.
- UI acceptance:
  - `LobbyHeroRosterUrBorderAura` should use the inset `borderWidth/borderHeight` path;
  - `LobbyHeroRosterLevelPlate` should create a small dark backing area for level text;
  - `LobbyHeroRosterClassBadge` should be visibly larger and lower than the previous overlapping corner placement.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing the latest UR border inset and top label readability tokens;
  - final visual acceptance still requires refreshing/restarting Cocos Preview so the latest hero roster chunk and `goods_1_border` resource are served.

## 2026-06-04 Hero Roster Larger Cards QA Note

- Product acceptance:
  - the hero cards should read larger and more dominant in the roster scene;
  - UR border effect should sit closer to the card's outer edge than the previous inner-line version;
  - increasing card size must not introduce new economy, growth, reward, or acquisition semantics.
- UI acceptance:
  - desktop card target/max heights should use the new `420 / 440` constants;
  - UR border uses `HERO_ROSTER_UR_BORDER_OUTSET_X/Y` and `width + borderOutsetX * 2`;
  - top level plate and class badge remain readable after the card size increase.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing the latest larger-card and UR border-outset tokens;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Larger Cards And Vertical Border Outset QA Note

- Product acceptance:
  - the hero cards should read visibly larger than the previous `420 / 440` version;
  - UR top and bottom border effects should extend farther outside the frame, while left/right spread remains restrained to avoid touching adjacent cards;
  - the change remains purely visual/read-only and must not add upgrade, acquisition, reward, or economy semantics.
- UI acceptance:
  - desktop card target/max heights should use `452 / 474`;
  - compact card target/max heights should use `298 / 328`;
  - UR border vertical outset should use `HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`;
  - UR Spine border scale should use `height + 30`.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing the latest larger-card and vertical border-outset tokens;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster UR Border Horizontal De-overlap QA Note

- Product acceptance:
  - UR should still read as the highest rarity through top/bottom border emphasis;
  - side border glow should not spill into background vertical lines or adjacent-card spacing;
  - the change remains purely visual/read-only.
- UI acceptance:
  - UR horizontal border outset should use `HERO_ROSTER_UR_BORDER_OUTSET_X = 0`;
  - UR vertical border outset should stay at `HERO_ROSTER_UR_BORDER_OUTSET_Y = 10`;
  - UR Spine border scale should use `width + 2` and `height + 30`.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing the latest horizontal de-overlap tokens;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Rarity Label Line Fix QA Note

- Product acceptance:
  - UR should not gain an extra-feeling frame from the previous horizontal de-overlap attempt;
  - the bottom `SSR/UR` text should sit on a clean info plate without a decorative line running behind the glyphs;
  - UR top/bottom border emphasis remains stronger than SSR, but this change targets the lower rarity label area.
- UI acceptance:
  - UR horizontal border outset returns to `HERO_ROSTER_UR_BORDER_OUTSET_X = 4`;
  - UR Spine border scale returns to `width + 12` horizontally and keeps `height + 30` vertically;
  - the info-plate top accent uses a center gap, guarded by `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO = 0.48`;
  - rarity label vertical placement uses `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218`.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing the restored UR border width and rarity-label line-gap tokens;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster UR Extra Outer Frame Removal QA Note

- Product acceptance:
  - UR should not show an additional local gold frame outside the card art and Spine border;
  - UR rarity should still read above SSR through the imported `goods_1_border` Spine effect;
  - the bottom `SSR/UR` rarity label should keep the center line gap from the previous fix.
- UI acceptance:
  - `LobbyHeroRosterUrBorderAura` must stay absent from the active renderer;
  - `drawUrBorderAura` and local `HERO_ROSTER_UR_BORDER_OUTSET_X/Y` aura constants must stay absent;
  - only `LobbyHeroRosterUrGoodsBorderSpine` should render the UR border effect.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Rarity Border Spine Mapping QA Note

- Product acceptance:
  - R/SR/SSR/UR should no longer share a single UR-only border behavior;
  - each rarity should play the requested `goods_1` animation: `R=K3`, `SR=K4`, `SSR=K5`, `UR=K7`;
  - the change remains purely visual/read-only and must not add upgrade, acquisition, reward, draw, or economy semantics.
- UI acceptance:
  - the shared resource path is `spine/ui/hero-roster/goods_1_border/goods_1`;
  - `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY` is the source of truth for rarity-to-animation mapping;
  - animation lookup must remain case-insensitive because the current runtime skeleton stores the clips as lowercase `k3/k4/k5/k7`;
  - old UR-only effect names such as `renderHeroCardUrEffect` and `LobbyHeroRosterUrGoodsBorderSpine` must stay absent from the active renderer.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks missing the latest rarity mapping tokens;
  - final visual acceptance still requires refreshing/restarting Cocos Preview so the latest hero roster chunk and `goods_1_border` resource are served.

## 2026-06-04 Hero Roster Rarity Label Opaque Cover QA Note

- Product acceptance:
  - the baked card-skin line behind `SSR/UR/SR/R` should be fully covered, not just dimmed;
  - rarity label readability should remain unchanged;
  - the side and bottom outline remain, while top/internal horizontal lines stay absent.
- UI acceptance:
  - info-plate base alpha is now guarded by `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 255`;
  - full-plate tint remains `HERO_ROSTER_CARD_INFO_PLATE_TINT_ALPHA = 46`.
- Review result:
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Rarity Label Baked Line Cover QA Note

- Product acceptance:
  - the card skin's baked lower-panel line should not show through behind `SSR/UR/SR/R`;
  - the info plate should remain readable and tinted by rarity;
  - the side and bottom outline remain, while the top and internal horizontal lines stay absent.
- UI acceptance:
  - info-plate base alpha is guarded by `HERO_ROSTER_CARD_INFO_PLATE_BASE_ALPHA = 238`;
  - full-plate tint alpha is guarded by `HERO_ROSTER_CARD_INFO_PLATE_TINT_ALPHA = 46`;
  - inset tint tokens `plateWidth - 8 * scale` and `plateHeight - 8 * scale` must stay absent.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Rarity Label Top Line Removal QA Note

- Product acceptance:
  - bottom `SSR/UR/SR/R` rarity labels should not have a visible horizontal border or accent line behind the text;
  - the info plate should still read as a contained lower panel through side and bottom outline;
  - UR rarity differentiation remains the Spine border effect, not extra static frame lines.
- UI acceptance:
  - `traceInfoPlateLowerFrame` draws the info-plate side and bottom outline only;
  - old accent-line tokens `HERO_ROSTER_CARD_INFO_ACCENT_GAP_RATIO`, `rarityLineGap`, and `accentY` must stay absent;
  - `HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.218` remains the rarity label placement.
- Review result:
  - `check:layout`, focused TypeScript, `git diff --check`, and `.spine` source scan passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Rarity Border Guard Recheck QA Note

- QA recheck confirms Stage 4CU remains the active acceptance target: R/SR/SSR/UR cards should map to `goods_1` animations `K3/K4/K5/K7`, with case-insensitive runtime lookup for lowercase `k3/k4/k5/k7`.
- Static acceptance passed again: `check:layout`, project TypeScript no-emit, `.spine` source scan, old UR-only token search, and `git diff --check`.
- Preview acceptance is still blocked by stale running Cocos Preview chunks; restart/refresh Preview before judging card size, rarity border animation mapping, top labels, and bottom opaque info plates.

## 2026-06-04 Hero Roster UR Sequence Border Frames QA Note

- Product acceptance:
  - UR should now read through the provided `UR-card-border` sequence-frame effect, not only the shared `goods_1` border;
  - R/SR/SSR should keep the existing `goods_1` `K3/K4/K5` behavior;
  - the UR effect remains visual/read-only and must not imply a new acquisition, reward, growth, probability, or economy behavior.
- UI acceptance:
  - `LobbyHeroRosterUrSequenceBorderSprite` should align with the UR card frame and loop smoothly across 12 frames;
  - the effect should sit behind hero relief and card chrome so it does not cover rarity label, name, stars, level plate, or corner badge;
  - if sequence frames fail before Creator reimport, the fallback `goods_1` `K7` border may appear instead of a blank card.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster UR Sequence Border Outer Alignment QA Note

- Product acceptance:
  - the UR sequence-frame effect should wrap the full card frame, not the inner portrait/content frame;
  - the red/gold top flame can extend slightly beyond the card, but the visible rectangular border should read as the card outer edge;
  - Lv, corner badge, rarity label, name, and stars must remain readable above the effect layer.
- UI acceptance:
  - `LobbyHeroRosterUrSequenceBorderSprite` uses the outer-alignment ratios `1.28 / 1.245 / -0.049`;
  - if further tuning is needed after Preview refresh, adjust those ratios only, keeping the sequence node below card chrome.
- Review result:
  - `check:layout`, project TypeScript no-emit, and `git diff --check` passed;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster UR Sequence Border Outside Frame QA Note

- Product acceptance:
  - the UR sequence-frame bright border should sit outside the card's visible frame, not on the inner frame line;
  - top flame may extend beyond the card, but side/bottom glow should read as an outer aura wrapping the whole card;
  - text and badges remain above the effect layer.
- UI acceptance:
  - current outside-frame ratios are `1.56 / 1.44 / -0.045`;
  - if the effect is still visually inside after Preview refresh, tune only those ratios upward or sideways, keeping the sequence node below card chrome.
- Review result:
  - `check:layout`, project TypeScript no-emit, and `git diff --check` passed;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Unified Card Frame QA Note

- Product acceptance:
  - all hero roster cards should share `hero_card_frame.png` as the base frame;
  - rarity should not depend on separate base-card textures anymore;
  - rarity still reads through text, nameplate tone, shared Spine border mapping for R/SR/SSR, and UR sequence-frame border.
- UI acceptance:
  - card proportions follow the new `937 / 1676` source ratio;
  - UR sequence-frame alignment should be rechecked after Preview refresh because the base frame changed;
  - old `card_r/card_sr/card_ssr/card_ur` paths may remain on disk as archived/legacy resources, but the active renderer must not reference them.
- Review result:
  - `check:layout`, project TypeScript no-emit, and `.spine` source scan passed;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Card Interior Cleanup QA Note

- Product acceptance:
  - the card should rely on the frame art's own slots; avoid additional text plate or level plate backgrounds;
  - left level text should sit cleanly in the top-left circle area;
  - right class/protagonist marker should be circular and sit inside the top-right circle;
  - center emblem should be a single triangle only;
  - bottom rarity/name/stars should be smaller and contained inside the built-in bottom text grid.
- UI acceptance:
  - no `LobbyHeroRosterInfoPlate` or `LobbyHeroRosterLevelPlate` should render;
  - no diamond badge should render on the top-right;
  - if text still overflows after Preview refresh, tune only the three bottom text Y ratios and font caps.
- Review result:
  - `check:layout` and project TypeScript no-emit passed;
  - final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-04 Hero Roster Wider Five Card Layout QA Note

- Product acceptance:
  - hero roster cards should read wider and less cramped than the previous narrow frame layout;
  - one row should contain at most five cards;
  - the rarity label `SSR/UR/SR/R` should sit above the lower text grid, not inside it;
  - hero name and stars should remain inside the lower text grid without overlapping or clipping.
- UI acceptance:
  - active renderer should keep `HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE = 1.2`;
  - active renderer should keep `HERO_ROSTER_CARD_MAX_COLUMNS = 5`;
  - bottom text placement should use `0.278 / 0.151 / 0.087` for rarity, name, and stars respectively;
  - if text still feels crowded after Preview refresh, tune only the bottom text ratios/font caps and keep the five-card row constraint.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Cleanup Recheck After Window Switch QA Note

- Product acceptance:
  - Stage 4DK remains the active target: SSR should use shared `goods_1 K5`, R/SR should use `goods_1 K3/K4`, and UR should remain the only sequence-frame border card;
  - all cards should use the unified `hero_card_frame.png` base;
  - the old SSR sequence trials and legacy rarity-specific base-card images must stay removed.
- UI acceptance:
  - active renderer should keep `LOBBY_HERO_ROSTER_CARD_FRAME_ASSET` and `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY`;
  - active renderer should not contain `renderSsrCardSequenceBorder`, `LobbyHeroRosterSsrSequenceBorderSprite`, `loadSsrSequenceBorderFrames`, `ui/hero-roster/01..04`, or old `ui/hero-roster/card_*` references;
  - final visual pass should confirm hero name, stars, level, and badge remain readable after Preview refresh.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` now reaches `localhost:7456` but still reports stale chunks, so final visual acceptance requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Goods Border Effect Width Cap QA Note

- Product acceptance:
  - widening R/SR/SSR border visuals should affect only the `goods_1` effect layer;
  - card base width, row layout, unified `hero_card_frame.png`, and UR sequence-frame behavior should remain unchanged;
  - the change must stay visual-only and must not alter rarity, ownership, growth, acquisition, reward, or economy semantics.
- UI acceptance:
  - active renderer keeps `HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33`;
  - active renderer keeps `HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 61` and `HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.03`;
  - X scale clamp uses `HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8`;
  - final visual pass should confirm R/SR/SSR effect width changes without moving or resizing the card frame itself.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale chunks missing the new effect-width cap token, so final visual acceptance requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster UR Goods K7 Overlay Trial QA Note

- Product acceptance:
  - UR should now visually combine the existing `UR-card-border` sequence frame with the `goods_1 K7` Spine effect;
  - this is a visual trial only and should not change rarity, ownership, acquisition, rewards, growth, or economy semantics;
  - R/SR/SSR behavior should remain unchanged.
- UI acceptance:
  - UR branch should call `renderUrCardSequenceBorder(card, width, height)` and then `renderRarityGoodsBorderSpine(card, 'UR', width, height)`;
  - sequence-frame failure should not add a duplicate K7 layer;
  - after Preview refresh, check whether the combined UR effect is too bright, doubled, clipped, or overlapping level/badge/name/star text.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale chunks missing the new UR K7 overlay token, so final visual acceptance requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster SSR Melt Sequence Source QA Note

- Product acceptance:
  - SSR cards should now play the `熔化` sequence-frame source, not the earlier `SSR-card-border` source;
  - the source swap should not move card text, stars, level, badge, or existing card layout;
  - hero-name text should remain visible in the lower grid after the source swap.
- UI acceptance:
  - active SSR sequence frame paths use `ui/hero-roster/熔化/合成 1_00000..00124/spriteFrame`;
  - frame count remains `125`, frame duration remains `0.04`, and frame metadata remains `1080x1920`;
  - SSR sequence alignment remains `1.22 / 1.14 / -0.01` until a fresh Preview visual pass requires tuning.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview and waiting for the new resource import.

## 2026-06-05 Hero Roster SSR Goods Border Restore QA Note

- Product acceptance:
  - SSR should no longer rely on large sequence-frame folders;
  - SSR should visually return to the shared `goods_1` K5 border behavior;
  - resource cleanup should not change hero order, card size, text layout, hero ownership, growth, rewards, or acquisition semantics.
- UI acceptance:
  - `熔化` and `SSR-card-border` resources are removed from `assets/resources/ui/hero-roster`;
  - active renderer keeps `SSR: 'K5'` in `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY`;
  - active renderer has no `renderSsrCardSequenceBorder`, `LobbyHeroRosterSsrSequenceBorderSprite`, `loadSsrSequenceBorderFrames`, `ui/hero-roster/熔化`, or `ui/hero-roster/SSR-card-border` token.
- Final visual acceptance still requires refreshing/restarting Cocos Preview so the current renderer chunk and resource deletion are picked up.

## 2026-06-05 Hero Roster SSR 04 Sequence Trial QA Note

- Product acceptance:
  - SSR can temporarily trial the smaller `04` sequence to judge whether the visual language fits better than the previous large sequence folders;
  - the trial must stay visual-only and must not imply a rarity, acquisition, reward, growth, or economy change;
  - if the 7-frame loop feels too short, too soft, or too jumpy after Preview, prefer reverting to `goods_1` K5 or tuning the SSR sequence ratios rather than importing another large folder.
- UI acceptance:
  - active SSR sequence source is `ui/hero-roster/04/00118..00124/spriteFrame`;
  - source frame metadata is `270x396`;
  - initial alignment shares UR's `1.25 / 1.25 / -0.01`;
  - old `ui/hero-roster/熔化` and `ui/hero-roster/SSR-card-border` paths must stay absent from the active renderer.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance requires refreshing/restarting Cocos Preview and waiting for `04` import.

## 2026-06-05 Hero Roster SSR 03 Sequence Trial QA Note

- Product acceptance:
  - SSR should now evaluate the `03` sequence rather than `04`;
  - the test should focus on whether 25 frames produce a smoother, more premium border loop;
  - the trial must stay visual-only and must not imply a rarity, acquisition, reward, growth, or economy change.
- UI acceptance:
  - active SSR sequence source is `ui/hero-roster/03/00093..00117/spriteFrame`;
  - source frame metadata is `374x515`;
  - frame duration must remain `0.15`;
  - alpha must remain `255`;
  - width ratio must remain tied to UR width;
  - height ratio must remain `1.14`;
  - Y ratio must remain `-0.035`.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance requires refreshing/restarting Cocos Preview and waiting for `03` import.

## 2026-06-05 Hero Roster Sequence Cleanup And SSR Goods Restore QA Note

- Product acceptance:
  - SSR should no longer rely on experimental sequence folders `01..04`;
  - SSR should visually return to the shared `goods_1` K5 border behavior;
  - old `card_r/card_sr/card_ssr/card_ur` base-card images are removed because all cards use the unified `hero_card_frame.png`;
  - cleanup must not change hero order, card size, text layout, hero ownership, growth, rewards, or acquisition semantics.
- UI acceptance:
  - active renderer keeps `SSR: 'K5'` in `HERO_ROSTER_BORDER_ANIMATION_BY_RARITY`;
  - active renderer has no `renderSsrCardSequenceBorder`, `LobbyHeroRosterSsrSequenceBorderSprite`, `loadSsrSequenceBorderFrames`, `ui/hero-roster/01..04`, or old `ui/hero-roster/card_*` token;
  - `UR-card-border` remains available for UR only, and `hero_card_frame.png` remains the only active card base.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` could not reach `localhost:7456`; final visual acceptance still requires refreshing/restarting Cocos Preview so the current renderer chunk and resource deletion are picked up.

## 2026-06-04 Hero Roster Longer Cards And Rarity Order QA Note

- Product acceptance:
  - roster cards should feel slightly longer and more like vertical collectible hero cards;
  - the first visible row should prioritize rarities in `UR -> SSR -> SR -> R` order;
  - heroes with the same rarity should keep their existing relative order;
  - the longer card should not push the bottom overflow hint, lower text grid, level text, or corner badge into overlap.
- UI acceptance:
  - desktop card target/max heights should remain `468 / 492`;
  - compact card target/max heights should remain `310 / 340`;
  - render sorting should use `HERO_ROSTER_RARITY_DISPLAY_ORDER` and `displayHeroes`;
  - the sort is presentation-only and must not change owned heroes, team formation, rewards, fragments, gacha state, or any economy data.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Border Brightness And Star Placement QA Note

- Product acceptance:
  - border effects should read brighter and should not look dimmed by a translucent overlay;
  - UR sequence-frame border should hug the card frame instead of sitting one large ring outside it;
  - rarity should sit clearly above the lower name grid;
  - stars should sit between rarity and the name grid, not on the baked gem area;
  - the lower grid should visually contain only the hero name.
- UI acceptance:
  - UR sequence alpha should remain `255`;
  - UR sequence ratios should remain `1.18 / 1.16 / -0.048` until a fresh Preview visual pass says otherwise;
  - rarity/name/star placement should remain `0.318 / 0.132 / 0.235`;
  - if star text still feels busy, reduce star font size first before moving it back into the name grid.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Larger Star Text QA Note

- Product acceptance:
  - star text should be noticeably easier to read than the previous 11px-scaled version;
  - larger stars should remain between rarity and the name grid;
  - stars should not collide with rarity, the hero name, or the baked lower-card gem.
- UI acceptance:
  - star font sizing should remain `Math.min(15 * scale, height * 0.046)`;
  - star label bounds should remain `new Size(width - 68 * scale, height * 0.056)`;
  - if stars still feel weak after Preview refresh, prefer color/outline strength before moving them back into the name grid.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster SSR Sequence Border And Level Fit QA Note

- Product acceptance:
  - SSR cards should use the provided `SSR-card-border` sequence-frame effect instead of the shared `goods_1` K5 Spine border;
  - UR and SSR sequence borders should visually hug the card frame with the same alignment family;
  - R/SR Spine border effects should sit on the card edge rather than reading as an inner border;
  - stars should sit above the center triangle and remain readable;
  - hero-name text should render inside the bottom grid so card identity remains clear;
  - `Lv.9`, `Lv.99`, and `Lv100` should all stay readable inside the top-left circle.
- UI acceptance:
  - SSR sequence frame count remains `125`, with frame duration `0.04`;
  - SSR sequence frame paths use `ui/hero-roster/SSR-card-border/合成 1_00000..00124/spriteFrame`;
  - SSR frame meta remains `1080x1920`;
  - SSR sequence alignment remains `1.22 / 1.14 / -0.01`, while UR remains `1.25 / 1.25 / -0.01`;
  - R/SR `goods_1` border edge padding remains `30 / 54 / -0.01`;
  - card width remains unchanged for this pass, so sequence-border ratios remain synchronized with the current card width.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks, so final visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Scroll/Class Filter/Power QA Note

- Product decision:
  - per-card combat power belongs below the hero name in the bottom information area;
  - the top-right card badge should mean class/role, not faction, because faction names are too long and the left filter is class-driven;
  - protagonist keeps `主`, non-protagonist heroes use one-character class abbreviations with `英` fallback.
- UI acceptance:
  - class tabs are derived from `heroClass` values returned by `GET /api/player/lobby/heroes`;
  - empty/missing `heroClass` heroes appear in `全部` only;
  - the card grid scrolls vertically inside the card area and must not clip the top bar, left filter rail, back button, footer, or disabled upgrade dock;
  - every filtered hero renders into `LobbyHeroRosterScrollContent`;
  - `LobbyHeroRosterHeroPower` must stay under `LobbyHeroRosterHeroName` without overlapping the rarity, name, stars, or baked card frame.
- Gacha acceptance:
  - light/dark summon is hidden;
  - summon buttons are real only for backend active pools with `drawEnabled=true`, `previewOnly=false`, and `locked=false`;
  - limited preview pools must not be forced open by the client.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, backend `PlayerLobbyHeroServiceImplTest`, and backend admin/game compile passed;
  - `check:preview` still fails because running Cocos Preview serves stale chunks missing the new class-options and combat-power placement tokens;
  - visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Power Above Name And DB Class Options QA Note

- Product decision:
  - per-card combat power now belongs above the hero name, inside the lower information area but separated from the name line;
  - the power font should be larger than the previous small label and remain readable on desktop and compact layouts;
  - the left class rail should not depend only on the current visible heroes. It should consume backend class options and always keep the existing six class tabs available.
- API acceptance:
  - `GET /api/player/lobby/heroes/filter-options` returns readonly `heroClasses`;
  - backend source is `sys_param_config.param_key='hero.class.options'`; enabled `hero_template.hero_class` is used only when the config is missing/empty;
  - fallback is the existing six classes: `战士 / 辅助 / 刺客 / 法师 / 射手 / 坦克`;
  - fallback is display-only and must not write a class dictionary or mutate hero templates.
- UI acceptance:
  - `LobbyHeroRosterPanelRenderer` should call `resolveHeroFilterTabs(state.heroes, state.heroClassOptions)`;
  - the merged class tab set should include `heroClassOptions`, loaded hero `heroClass`, and the default six-class order;
  - `LobbyHeroRosterHeroPower` uses `HERO_ROSTER_CARD_POWER_Y_RATIO = 0.205`;
  - power font sizing should remain `Math.min(15 * scale, height * 0.044)` unless a fresh Preview screenshot shows overlap;
  - power, rarity, stars, hero name, level, and class badge must not overlap the baked card frame or each other.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, backend `PlayerLobbyHeroServiceImplTest`, and backend admin/game compile passed;
  - visual acceptance still requires refreshing/restarting Cocos Preview.

## 2026-06-05 Hero Roster Class Filter Match QA Note

- Product decision:
  - the left class rail continues to display backend/configured class names;
  - filtering must match heroes by a normalized class key, not by raw display-text equality;
  - empty/missing `heroClass` heroes remain visible only under `全部`.
- UI acceptance:
  - `resolveHeroFilterTabs()` should merge default classes, `state.heroClassOptions`, and loaded hero classes by normalized key;
  - `isHeroClassTabActive()` should use the same normalized key as the filter path;
  - `filterHeroesBySelectedClass()` should compare `normalizeHeroClassKey(this.resolveHeroClass(hero))` against the selected normalized key;
  - `resolveHeroClassBadgeText()` should use the same key for one-character class badge abbreviations.
- Runtime compatibility:
  - current local game-server Preview can still be backed by an old process where `filter-options` returns `code=1000` and roster heroes return `heroClass: null`;
  - `LobbyHeroApi` should keep a readonly V1 `heroCode -> heroClass` fallback so class switching works before the backend process is refreshed;
  - real backend `heroClass` must remain the preferred source when present.
- Review result:
  - `check:layout`, project TypeScript no-emit, and `.spine` source scan passed;
  - `check:preview` still fails because the running Cocos Preview serves stale chunks missing `HERO_CLASS_KEY_ALIASES`, `normalizeHeroClassKey`, `addHeroClassTab`, and the new normalized filter comparison tokens;
  - this remains a Cocos-only readonly display fix and does not open hero growth, bag use/sell, gacha exchange/reissue, EX V1, or any new economy write surface.

## 2026-06-05 Hero Roster UR Effect Scroll Mask QA Note

- Product issue:
  - after adding vertical scrolling, the first-row UR card top flame/border effect can be clipped by the ScrollView Mask.
- UI acceptance:
  - `LobbyHeroRosterScrollView` should extend upward by `HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING = 62`;
  - the top padding should affect only the mask/viewport safety area, not the card size or lower information layout;
  - `startY` should subtract `scrollEffectTopPadding`, keeping the visible card row aligned while leaving room for external top effects;
  - bottom clipping should stay at the original body bottom so card rows do not leak into the footer/upgrade dock.
- Review result:
  - `check:layout` and project TypeScript no-emit passed after the mask adjustment;
  - this remains a Cocos-only visual clipping fix and does not open hero growth, bag use/sell, gacha exchange/reissue, EX V1, or any new economy write surface.

## 2026-06-06 Current Flow Closure QA Note

- Backend/API acceptance:
  - readonly `GET /api/player/lobby/heroes/filter-options` is now allowed by the current Cocos PhaseGate;
  - current-stage smoke verifies filter-options, gacha pools GET, and bag GET as open paths;
  - exchange/reissue, bag use/batch-use/sell, and hero growth writes remain blocked.
- Runtime acceptance:
  - restarted local `lootchain-game` returned class filter options with `code=0`;
  - existing `/api/player/gacha/draw` was manually verified once on `NORMAL_HERO`;
  - `scripts/smoke-cocos-current-flow.ps1` passed with no-reward battle settlement flags intact.
- Visual acceptance:
  - Cocos `check:layout`, TypeScript no-emit, and `.spine/.spine.meta` source scan passed;
  - running Preview still serves stale chunks, so restart/refresh Cocos Creator Preview before judging hero roster scroll, class tabs, power labels, UR effects, hidden light/dark summon, readonly bag, and gacha dialogs.
- Boundary unchanged:
  - this QA closure does not open hero growth, bag writes, gacha exchange/reissue, EX V1, reward/stamina/progress writes, or any new economy write surface.

## 2026-06-06 Login/Lobby Language Switch QA Note

- Product decision:
  - login right-side first entry changes from prophecy copy to language switching;
  - Lobby settings gear opens the current-stage settings page instead of the generic unopened placeholder;
  - current settings scope is language only. Audio, graphics, account, security, and other settings remain out of scope.
- UI acceptance:
  - login first right-rail button displays `语言` in Chinese and `Lang` in English;
  - clicking the login language button toggles language locally, keeps the login page in place, and does not call login or backend APIs;
  - Lobby settings page displays `设置` / `Settings`, current language, `简体中文`, `English`, and a back button;
  - switching language in Lobby settings immediately re-renders the settings page and keeps the selected language highlighted;
  - the language preference persists through `sys.localStorage`; if storage is unavailable, Chinese remains the default and the UI must not throw.
- Technical acceptance:
  - `LootChainGameRoot.makeLayoutKey()` includes current language so resize/refresh cannot reuse stale labels;
  - `LobbyTopHudRenderer` routes only `settings` to `openLobbySettingsPanel()`;
  - `HttpClient` sends `Accept-Language` from the local Cocos language preference without adding any new API path.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine/.spine.meta` source scan, and `git diff --check` passed;
  - `check:preview` still fails because running Cocos Preview serves stale chunks and does not yet include the new i18n/settings modules;
  - visual acceptance still requires refreshing/restarting Cocos Preview.
- Boundary unchanged:
  - this is Cocos-only local display state plus passive request metadata. It does not open hero growth, bag writes, gacha exchange/reissue, EX V1, reward/stamina/progress writes, or any new economy write surface.

## 2026-06-06 Language Modal And API Text Localization QA Note

- Product decision:
  - login language is a modal selection, not a direct toggle;
  - selecting language reloads/re-renders login content immediately;
  - after entering Lobby, static UI and API-loaded display text must follow the selected language.
- UI acceptance:
  - login right-side language entry opens `LoginLanguageDialog*`;
  - modal has two explicit language options, blank-area close, and top-right close;
  - language selection persists through `sys.localStorage`;
  - shared labels/buttons/status text pass through `lootChainI18n.text()` on redraw;
  - Lobby settings language switch reloads localized player data instead of only repainting old API state.
- API/DB acceptance:
  - Cocos sends `Accept-Language`;
  - backend maps it to `zh-CN` / `en-US` and overlays VO display text from `game_text_i18n`;
  - localized surfaces include heroes, class options, gacha display/reward names, readonly bag, notices, and readonly adventure;
  - local `lootchain` DB imported `sql/23_game_text_i18n.sql`, with `200` total rows and `200` enabled `en-US` rows, including `120` `HERO_TEMPLATE` rows;
  - missing translations fall back to original text.
- Verification passed:
  - Cocos `check:layout`;
  - Cocos TypeScript no-emit;
  - `.spine/.spine.meta` source scan returned `0`;
  - backend `mvn -pl lootchain-core test` passed `98` tests, `0` failures, `4` skipped live/external tests;
  - live 8081 `Accept-Language: en-US` readonly calls returned English hero classes, hero list/detail/codex, gacha pool text, bag type labels, and adventure text;
  - `git diff --check` passed in both repos with only LF/CRLF warnings.
- Preview note:
  - Cocos Preview on `7456` still serves stale chunks; restart/refresh Preview before visual language-modal and Lobby language acceptance.
- Boundary unchanged:
  - no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy write endpoint changed.

## 2026-06-06 Hero Card Background Asset QA Note

- Product decision:
  - hero roster cards can now read a per-template card background from `hero_template.card_background_asset`;
  - the field is only for visual card presentation and should complement the unified `hero_card_frame.png`, not replace hero ownership, rarity, star, power, or class data.
- UI acceptance:
  - `cardBackgroundAsset` should render inside the card frame and below border effects/text;
  - empty or invalid paths must gracefully fall back to the existing triangle/relief card visual;
  - Cocos should normalize resources paths that omit `/spriteFrame`.
- API/DB acceptance:
  - SQL `D:\project\LootChain\sql\24_hero_card_background_asset.sql` adds the field and seeds `UR_EVELYN -> ui/hero-roster/card_background/StoryCover_Nuu`;
  - player hero list/detail/codex and lobby hero/codex VOs expose `cardBackgroundAsset`.
- Resource acceptance:
  - `.spine` source files must stay out of `assets/resources/spine`; `Nuu.spine` was archived under `docs/spine-source-archive/hero/Nuu/`.
- Boundary unchanged:
  - display metadata only; no `gacha_pool_item`, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, or new economy write endpoint changed.

## 2026-06-07 Hero Card Background Artwork QA Note

- Product acceptance:
  - configured `cardBackgroundAsset` should replace the old center triangle placeholder on hero roster cards;
  - the image should stay inside the card and must not exceed the card dimensions;
  - rarity, stars, name, power, level, and class badge must remain above the image and readable;
  - unconfigured heroes may keep the triangle as a fallback so empty data does not create blank cards.
- UI acceptance:
  - `renderHeroCard()` should compute `hasCardArtwork` from `renderHeroCardBackground(...)`;
  - `LobbyHeroRosterHeroRelief` should only be drawn when `hasCardArtwork` is false;
  - artwork width and height should be clamped with `Math.min(...)` against the card dimensions;
  - card background paths still normalize to `/spriteFrame`.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` still reports stale running Preview chunks until Cocos Preview refreshes the hero-roster bundle.
- Boundary unchanged:
  - readonly card presentation only; no hero data semantics, economy rule, gacha, bag write, EX V1, or hero-growth surface changed.

## 2026-06-07 Hero Card Background Texture Fallback QA Note

- Problem observed:
  - Nuu's `cardBackgroundAsset` was configured, the triangle fallback disappeared, but the actual image did not show.
- Cause:
  - `StoryCover_Nuu.png` is imported by Cocos as `texture` only;
  - there is no `spriteFrame` subresource at `ui/hero-roster/card_background/StoryCover_Nuu/spriteFrame`.
- Product/UI acceptance update:
  - hero roster should support both sprite-frame imported card art and texture-only imported card art;
  - the configured artwork must remain inside the card, above the frame interior and below rarity/stars/name/power/level/badge/border effects;
  - unconfigured heroes keep the triangle fallback, while configured-but-loading images should not resize or push text.
- Technical acceptance:
  - renderer normalizes `cardBackgroundAsset` to a safe base resources path;
  - loading order is `${assetPath}/spriteFrame`, then `Texture2D` at the base path, then `${assetPath}/texture`;
  - texture-only assets are wrapped in a runtime `SpriteFrame`.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed;
  - `check:preview` is currently stale and missing the new texture-fallback tokens until Cocos Preview refreshes the hero-roster chunk.
- Boundary unchanged:
  - readonly visual rendering only; no SQL, backend API contract, economy rule, gacha, bag write, EX V1, or hero-growth surface changed.

## 2026-06-07 Hero Card Artwork Lower Placement QA Note

- Product observation:
  - Nuu card art appeared too high in the frame and left the lower composition feeling detached from the card edge.
- UI decision:
  - lower configured `cardBackgroundAsset` art slightly so the hero illustration visually sits closer to the lower card frame;
  - keep text and star/rank information above the artwork layer so readability is unchanged.
- Implementation:
  - current artwork ratios are `HERO_ROSTER_CARD_BACKGROUND_WIDTH_RATIO = 1`, `HERO_ROSTER_CARD_BACKGROUND_HEIGHT_RATIO = 0.5`, and `HERO_ROSTER_CARD_BACKGROUND_Y_RATIO = 0.02`;
  - width/height clamp remains unchanged, so the artwork cannot exceed the card.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed.
- Boundary unchanged:
  - readonly card composition only; no SQL, backend API contract, economy rule, gacha, bag write, EX V1, or hero-growth surface changed.

## 2026-06-07 Hero Card Stars Replace Power Line QA Note

- Product observation:
  - card bottom information is visually crowded when rarity, stars, combat power, and hero name all compete inside the same frame.
- UI decision:
  - remove per-card combat power from the card body;
  - present the hero name above the star row with a smaller vertical gap so the bottom frame reads as rarity, name, stars with less overlap risk.
- Implementation:
  - `HERO_ROSTER_CARD_NAME_Y_RATIO = 0.18`;
  - `HERO_ROSTER_CARD_STARS_Y_RATIO = 0.13`;
  - `LobbyHeroRosterHeroPower`, `HERO_ROSTER_CARD_POWER_Y_RATIO`, and card text `战力 ${formatCompactInteger(hero.power)}` are removed from active renderer;
  - total/account power surfaces outside the card are unchanged.
- Review result:
  - `check:layout`, project TypeScript no-emit, `.spine` source scan, and `git diff --check` passed.
- Boundary unchanged:
  - readonly card composition only; no SQL, backend API contract, economy rule, gacha, bag write, EX V1, hero-growth, or hero stat semantics changed.

## 2026-06-07 StoryCover Nuu Card Background QA Note

- Product/art update:
  - Nuu's card presentation now uses `StoryCover_Nuu.png` instead of the previous Nuu card background.
- UI acceptance:
  - renderer fallback/default path should match the DB-facing value `ui/hero-roster/card_background/StoryCover_Nuu`;
  - the image remains below rarity/name/stars/level/class badge/border effects and inside the existing card frame.
- Technical acceptance:
  - `StoryCover_Nuu.png.meta` imports as `texture`;
  - the existing `${assetPath}/spriteFrame -> Texture2D base path -> ${assetPath}/texture` load order must remain in place.
- Resource hygiene:
  - hero `.spine/.spine.meta` source files must not remain in `assets/resources/spine`;
  - this pass archived detected sources to `docs/spine-source-archive/hero/source-archived-20260607-storycover-sync/`.
- Review note:
  - local DB verification was not possible in this terminal because `mysql` is not on PATH; user confirmed DB was already updated.
  - static Cocos checks passed; Preview is stale until the hero-roster chunk refreshes.
- Boundary unchanged:
  - readonly display path sync only; no SQL migration, backend API contract shape, economy rule, gacha, bag write, EX V1, hero-growth, or hero stat semantics changed.

## 2026-06-07 Restore Nuu Illust Card Background QA Note

- Product decision:
  - after visual trial, revert Nuu's card background from `StoryCover_Nuu` to `Nuu_Illust`.
- UI/DB acceptance:
  - renderer fallback/default path is `ui/hero-roster/card_background/Nuu_Illust`;
  - DB display field `hero_template.id=25.card_background_asset` is restored to the same path.
- SQL:
  - rollback script: `D:\project\LootChain\sql\32_hero_card_background_restore_nuu_illust.sql`.
- Resource hygiene:
  - `.spine/.spine.meta` source files remain outside `assets/resources/spine`.
- Boundary unchanged:
  - readonly display metadata/path rollback only; no backend API contract shape, economy rule, gacha, bag write, EX V1, hero-growth, or hero stat semantics changed.

## 2026-06-07 Nine Hero Display Asset Batch QA Note

- Product decision:
  - map the selected enabled UR/SSR heroes to the new Cocos hero Spine resources and matching hero-card background art;
  - card background art should use the existing `assets/resources/ui/hero-roster/card_background` files that match the provided character resource names, following the `Nuu_Illust` style rather than reverting to the temporary StoryCover trial.
- UI acceptance:
  - roster cards should receive `cardBackgroundAsset` values such as `ui/hero-roster/card_background/IshmaelA_Illust`, `Lucrecia_Illust`, `Carmilla_center`, and so on;
  - card art remains inside the unified frame and below rarity/name/star/level/class badge/border effects;
  - hero detail loads by `spineUuid` first to avoid same-path JSON/SKEL ambiguity;
  - the 9 newly mapped hero details should resolve and play `idle` only.
- API/DB acceptance:
  - SQL `D:\project\LootChain\sql\33_hero_display_asset_batch_sync.sql` updates only `hero_template` display fields for `UR_ARTHAS`, `UR_ATLAS`, `UR_AURELIA`, `UR_NYX`, `UR_SERAPHINA`, `SSR_KANE`, `SSR_LIVIA`, `SSR_MICHAEL`, and `SSR_RON`;
  - `D:\project\LootChain\sql\05_hero_module.sql` now reapplies the same display mapping for fresh schema imports;
  - local DB readback confirmed the 9 rows after import.
- Review result:
  - `npm.cmd run check:layout`, Cocos TypeScript no-emit, `.spine/.spine.meta` source scan, and `npm.cmd run check:preview` passed;
  - browser Preview CDP visual check confirmed the owned mapped cards show artwork in the roster;
  - `SSR_KANE -> Ishmael` and `SSR_LIVIA -> Carmilla` details rendered real Spine and logged `animation=idle`;
  - focused backend test `PlayerLobbyHeroServiceImplTest` passed.
- Runtime note:
  - the currently running 8081 game-server process still omits `cardBackgroundAsset` in live JSON, while current source maps it. Restart the game server from current source before treating API-level `cardBackgroundAsset` readback as accepted.
- Boundary unchanged:
  - readonly display metadata and presentation only; no backend API contract shape, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, or reward/stamina/progress write changed.

## 2026-06-08 Active R/SR Card Background Asset QA Note

- Product/data decision:
  - enabled R/SR hero roster cards should use card background images placed under `assets/resources/ui/hero-roster/card_background`;
  - the DB-facing value is `ui/hero-roster/card_background/` + current `hero_template.spine_asset`;
  - this applies only to `status=1`, `deleted=0`, `rarity in ('R','SR')` templates.
- API/DB acceptance:
  - SQL `D:\project\LootChain\sql\34_active_r_sr_card_background_asset_sync.sql` updates only `hero_template.card_background_asset`;
  - local DB readback confirmed 12 enabled R/SR rows match the spine-derived path rule;
  - `D:\project\LootChain\sql\05_hero_module.sql` includes the same display-only mapping for fresh local schema imports.
- UI/resource acceptance:
  - the 12 `npc_*.png` card backgrounds and their Cocos texture-only `.meta` files exist in `assets/resources/ui/hero-roster/card_background`;
  - `LobbyHeroApi` and `LobbyCodexApi` include readonly fallback metadata for the same R/SR hero codes;
  - existing hero-card rendering still uses the Texture2D fallback path, so these texture-only imports can render without spriteFrame subresources.
- Review result:
  - `npm.cmd run check:layout` passed;
  - Cocos TypeScript no-emit passed;
  - `.spine/.spine.meta` source scan returned `0`;
  - new `npc_*.png.meta` JSON parse check passed;
  - current `check:preview` is stale for `LobbyHeroApi` and `LobbyCodexApi`, so refresh/restart Preview before visual acceptance.
- Boundary unchanged:
  - display metadata/resource sync only; no gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-08 R/SR NPC Card Background Scale QA Note

- Product issue:
  - the new R/SR `npc_*` card background images rendered too large and visually spilled beyond the intended card composition.
- UI acceptance:
  - `ui/hero-roster/card_background/npc_*` assets should use a compact card-art profile instead of the UR/SSR `*_Illust` enlargement profile;
  - NPC card art should preserve its source aspect ratio;
  - NPC card art should not force-fill the whole mask width;
  - rarity, name, stars, level, class badge, and border effects must remain readable and above the art layer.
- Implementation:
  - `LobbyHeroRosterPanelRenderer` detects NPC card backgrounds through `HERO_ROSTER_CARD_BACKGROUND_NPC_PREFIX`;
  - compact profile constants are `0.42` visible height, `0.56` max display height, and `0.82` max display width;
  - Nuu and the previously mapped UR/SSR `*_Illust` profiles are unchanged.
- Review result:
  - `check:layout`, Cocos TypeScript no-emit, and `.spine/.spine.meta` scan passed;
  - `check:preview` is stale for `LobbyHeroRosterPanelRenderer`, so refresh/restart Preview before visual acceptance.
- Boundary unchanged:
  - readonly card presentation only; no SQL, backend API, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-10 R/SR NPC Card Background Scale Rebalance QA Note

- Product issue:
  - after switching machines, R/SR `npc_*` card background figures looked too small in the hero roster.
- Diagnosis:
  - the 12 `npc_*.png` card backgrounds have near-full alpha bounds, so the issue is not caused by newly introduced transparent padding;
  - the previous compact profile used `0.42` target visible height plus `0.82` width cap, which left too much empty card art area.
- UI acceptance:
  - R/SR NPC figures should read as character card art rather than small icons;
  - artwork must still stay inside `LobbyHeroRosterCardBackgroundMask`;
  - rarity/name/star/level/class badge/border effects must remain above the art layer.
- Implementation:
  - NPC target visible height is now `0.58`;
  - NPC max display height is now `0.74`;
  - NPC max display width is now `0.96`;
  - UR/SSR and Nuu card-art profiles are unchanged.
- Review result:
  - `check:layout`, focused Cocos TypeScript no-emit, `.spine/.spine.meta` scan, and `git diff --check` passed;
  - running Preview is stale for `LobbyHeroRosterPanelRenderer`, so refresh/restart Preview before visual acceptance.
- Boundary unchanged:
  - readonly card presentation only; no SQL, backend API, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Gacha Summon Animation QA Note

- Product decision:
  - clicking a summon button should show a summon animation first;
  - the real draw request should be submitted only after that animation finishes.
- UI/resource acceptance:
  - summon PNG resources live under `assets/resources/ui/gacha/summon`;
  - the animation should compose the background, floor, magic circle, light, center silhouette, and four role sprites;
  - the animation view should block duplicate draw clicks while the pending draw ticket is active;
  - closing the gacha scene during the animation should be blocked until the animation finishes.
- Flow acceptance:
  - `startGachaDraw()` validates the currently selected pool, stores `PendingGachaDraw`, and switches to `gachaSummon`;
  - `finishPendingGachaDrawAfterAnimation()` ignores stale tickets;
  - `executeGachaDrawAfterAnimation()` uses the existing draw API, requestId creation, result display, pity refresh, and readonly asset refresh flow.
- Resource hygiene:
  - only PNG assets were imported from the C1812-1 summon composition;
  - no `.spine/.spine.meta` source files should exist under `assets/resources/spine`.
- Review result:
  - `check:layout`, Cocos TypeScript no-emit, summon `.meta` JSON parse, and `.spine/.spine.meta` scan passed;
  - `git diff --check` reported only LF/CRLF working-copy warnings;
  - `check:preview` is stale for `LootChainGameRoot`, `LobbyHeroRosterPanelRenderer`, `GachaSceneConfig`, and `GachaSceneRenderer`, so refresh/restart Preview before visual acceptance.
- Boundary unchanged:
  - frontend animation only; no backend API, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Recruit_take4 Spine Summon QA Note

- Product issue:
  - the initial summon scene used static PNG/tween composition and did not play the skeletal animation available in C1812-1.
- Resource acceptance:
  - `Recruit_take4.skel`, `Recruit_take4.atlas`, and `Recruit_take4.png` should exist under `assets/resources/spine/gacha/summon/recruit_take4`;
  - `Recruit_take4.skel.meta` should be `spine-data` and reference the atlas UUID;
  - no `.spine/.spine.meta` files should exist under `assets/resources/spine`.
- UI acceptance:
  - `gachaSummon` should render `GachaSummonRecruitTake4SpineNode` during the pre-draw animation;
  - the center silhouette/PNG composition is fallback only and should be removed once the Spine asset applies;
  - the animation should still block duplicate summon clicks and should submit the real draw only after the scheduled animation window.
- Review result:
  - `check:layout` failed before resources/code existed and passed after implementation;
  - Cocos TypeScript no-emit, summon Spine `.meta` JSON parse, `.spine/.spine.meta` scan, and `git diff --check` passed;
  - `check:preview` is stale for `GachaSceneConfig` and `GachaSceneRenderer`, so restart/refresh Preview before visual acceptance.
- Boundary unchanged:
  - frontend animation playback only; no backend API, SQL, economy rule, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-09 Fullscreen Summon And Rarity Burst QA Note

- Product issue:
  - the summon animation appeared as a centered square block;
  - SSR/UR draws need a different visual response with golden light.
- UI/resource acceptance:
  - `Summon_Normal_BG.png` should fill the full viewport through cover sizing;
  - `Recruit_take4` should not leave its exported square `BG` attachment visible when the runtime can clear it;
  - SSR should show `GachaSummonRarityGoldBurst`;
  - UR should show `GachaSummonRarityUrBurst`;
  - lower-rarity results should not use the SSR/UR gold burst.
- Flow acceptance:
  - clicking summon enters `gachaSummon` immediately;
  - the existing real draw endpoint is submitted during the animation, not after the animation;
  - the response is used only to select the animation rarity tone until the animation is ready;
  - the existing result page, pity refresh, and readonly asset refresh still happen after the animation result handoff.
- Review result:
  - `check:layout` failed before the full-screen/rarity requirements existed and passed after implementation;
  - Cocos TypeScript no-emit, summon `.meta` JSON parse, `.spine/.spine.meta` scan, and `git diff --check` passed.
  - `check:preview` is stale for `LootChainGameRoot`, `GachaSceneConfig`, and `GachaSceneRenderer`, so refresh/restart Preview before visual acceptance.
- Boundary unchanged:
  - same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Summon Failure Path Minimum Animation QA Note

- Product issue:
  - when the draw request fails quickly, the summon scene should not flash and disappear before the user can see the animation.
- Flow acceptance:
  - draw failure during `gachaSummon` should set `pending.error`;
  - the scene should remain in `gachaSummon` until `finishPendingGachaDrawAfterAnimation()` marks `animationReady`;
  - only after the minimum animation window should `presentPendingGachaDrawFailure()` return to the summon page and show the error.
- Review result:
  - `check:layout` failed before the delayed-failure guard existed and passed after implementation;
  - Cocos TypeScript no-emit, summon `.meta` JSON parse, `.spine/.spine.meta` scan, and `git diff --check` passed;
  - `check:preview` is stale for `LootChainGameRoot`, so refresh/restart Preview before visual validation.
- Boundary unchanged:
  - frontend flow/error presentation only; same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Summon Fullscreen Background And Local SSR/UR Preview QA Note

- Product issue:
  - the latest preview still showed a large red circular backdrop and a small square-looking summon background;
  - the user also needed a way to inspect SSR/UR gold effects without spending resources or forcing a real draw.
- UI acceptance:
  - remove the extra red circular veil from `GachaSummonAnimationVeil`;
  - render `Summon_Normal_BG.png` as the full-screen base with cover overscan;
  - keep `RecruitBG` as a low-opacity overlay only;
  - expand the `Recruit_take4` Spine stage to the full-screen context and repeatedly hide the exported `BG` attachment;
  - SSR and UR previews should enter `gachaSummon` with `GachaSummonRarityGoldBurst` / `GachaSummonRarityUrBurst` available.
- Flow acceptance:
  - `GachaSummonPreviewSSRButton` and `GachaSummonPreviewURButton` are local visual preview buttons only;
  - `openGachaRarityPreviewScene(rarity)` sets local `gachaPreviewSummonRarity`, renders the animation, and auto-returns to the summon page;
  - the preview path must not create requestId, must not call `/api/player/gacha/draw`, and must not update resources, draw logs, rewards, fragments, pity, or readonly asset refresh.
- Code hygiene:
  - `LobbyHeroApi.ts` and `LobbyCodexApi.ts` duplicate `R_PATROL_01` fallback entries were cleaned so TypeScript no-emit can run; the retained fallback keeps the read-only `cardBackgroundAsset`.
- Review result:
  - `check:layout`, Cocos TypeScript no-emit, summon `.meta` JSON parse, `.spine/.spine.meta` scan, and `git diff --check` passed;
  - `check:preview` is stale for `LootChainGameRoot` and `GachaSceneRenderer`, so refresh/restart Preview before visual validation.
- Boundary unchanged:
  - frontend visual preview and readonly fallback cleanup only; no backend API, SQL, economy rule, new economy write entry, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Summon Rarity Background Switch QA Note

- Product issue:
  - summon animation background should use different full-screen art by rarity;
  - ordinary hero results should use `RecruitBG.png`;
  - SSR/UR results should use `Headhunting_bg.png`.
- UI/resource acceptance:
  - import `Headhunting_bg.png` under `assets/resources/ui/gacha/summon`;
  - `GachaSceneConfig` should expose `headhuntingBg: 'ui/gacha/summon/Headhunting_bg'`;
  - `GachaSceneRenderer` should render one full-screen background via `GachaSummonFullScreenBackground`;
  - `resolveSummonBackgroundAsset()` should return `Headhunting_bg` only for SSR/UR, and `RecruitBG` otherwise;
  - `Summon_Normal_BG` should no longer drive the summon animation background.
- Review result:
  - `check:layout`, Cocos TypeScript no-emit, `Headhunting_bg.png.meta` JSON parse, `.spine/.spine.meta` scan, and `git diff --check` passed;
  - `check:preview` is stale for `GachaSceneConfig` and `GachaSceneRenderer`, so refresh/restart Preview before visual validation.
- Boundary unchanged:
  - frontend visual background selection only; no backend API, SQL, economy rule, new economy write entry, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Summon Video Replacement QA Note

- Product issue:
  - the previous summon-animation implementation was rejected and should be treated as withdrawn;
  - clicking summon should now play a full-screen video instead of the old PNG/Spine composition.
- UI/resource acceptance:
  - old `assets/resources/ui/gacha/summon*` and `assets/resources/spine/gacha/summon*` resources should not exist;
  - normal/lower-rarity results should play `assets/resources/video/gacha/call1.mp4`;
  - results containing `SSR` or `UR` should play `assets/resources/video/gacha/call2.mp4`;
  - `assets/resources/audio/gacha/call.mp3` should play as the summon call audio;
  - the video should fill the full viewport through `VideoPlayer` instead of appearing as a small centered square.
- Flow acceptance:
  - clicking summon submits the existing `POST /api/player/gacha/draw` request first, so video choice is based on the actual result;
  - the request still uses the existing requestId/idempotency path;
  - on video completion, the existing gacha result page opens;
  - draw failure should not play video and should return to the summon page with the backend error.
- Review result:
  - `check:layout` failed before the video/audio resources and video-flow code existed, then passed after implementation;
  - directed Cocos TypeScript no-emit passed;
  - new video/audio `.meta` JSON parse passed;
  - `ffprobe` and extracted mid-frame self-preview confirmed `call1` and `call2` are valid, distinct 1680x720 videos;
  - `.spine/.spine.meta` scan returned `0`;
  - `git diff --check` passed with only LF/CRLF working-copy warnings;
  - `check:preview` currently reports stale `LootChainGameRoot`, `GachaSceneConfig`, and `GachaSceneRenderer` chunks, so restart/refresh Preview before runtime visual acceptance.
- Testing caveat:
  - no real new draw was executed because it would spend resources, write draw logs, and grant heroes/fragments without explicit user confirmation.
- Boundary unchanged:
  - frontend video/audio presentation only; same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Summon Video Aspect Cover QA Note

- Product issue:
  - the full-screen summon video looked stretched/deformed in 1920x1080 Preview.
- Root cause:
  - `call1.mp4` and `call2.mp4` are 1680x720 videos;
  - forcing them into a 1920x1080 node with `keepAspectRatio = false` distorts the frame.
- UI acceptance:
  - `VideoPlayer.keepAspectRatio` must be `true`;
  - the video node should use an aspect-preserving cover size derived from 1680:720;
  - 1920x1080 should resolve to 2520x1080, centered, with side cropping rather than stretching;
  - circles and sigils in `call1/call2` should remain circular, not oval.
- Review result:
  - `check:layout` failed before the aspect-cover guard existed and passed after implementation;
  - directed Cocos TypeScript no-emit passed;
  - 1920x1080 cover-size calculation resolved to 2520x1080;
  - `check:preview` currently reports stale `GachaSceneConfig` and `GachaSceneRenderer` chunks, so restart/refresh Preview before runtime visual acceptance.
- Boundary unchanged:
  - frontend video sizing only; same existing draw endpoint only; no backend API, SQL, economy rule, new economy write entry, gacha pool item, probability, weight, pity, cost, reward, duplicate conversion, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write changed.

## 2026-06-09 Gacha Economy Opening QA Note

- Product change:
  - after explicit user approval, SSR/UR rates and pity are adjusted and ordinary/limited real draw pools are opened.
- Expected gacha pool state:
  - `LIMITED_ABYSS_PREVIEW`, `NORMAL_HERO`, and `BASIC_CONTRACT_PREVIEW` should be selectable and drawable when backend returns `locked=false`, `drawEnabled=true`, and `previewOnly=false`;
  - `SEALED_LIGHT_DARK` should remain locked/display-only and non-drawable.
- Expected rate/pity display:
  - `R=57.6%`;
  - `SR=38.4%`;
  - `SSR=3.6%`;
  - `UR=0.4%`;
  - SSR pity `80`;
  - UR pity `180`.
- Cocos behavior:
  - no new write entry should appear in UI code;
  - summon still uses the existing `POST /api/player/gacha/draw`;
  - insufficient balance should surface as an error without playing the result video or creating rewards.
- Review result:
  - backend economy guard passed;
  - backend gacha service tests passed;
  - Cocos `check:layout`, directed TypeScript no-emit, `check:preview`, `.spine/.spine.meta` scan, and `git diff --check` passed.
- Still closed:
  - EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress writes, and any new economy write endpoint.

## 2026-06-10 Controlled Real Draw Closure QA Note

- QA target:
  - complete one current-stage real draw through the same Cocos-approved backend write path, without opening any additional economy surface.
- Runtime setup:
  - created one-off test account `userId=4 / codex_cocos_draw_20260610140143`;
  - assigned exactly `DIAMOND=280` to that test account only;
  - left `userId=1` and long-running accounts untouched.
- Flow verified:
  - `dev-login` succeeded;
  - protagonist state returned `created=false`, then protagonist creation succeeded for the test account;
  - `GET /api/player/me/lobby` returned the test profile and `DIAMOND=280`;
  - `GET /api/player/gacha/pools` exposed `NORMAL_HERO` as `locked=false`, `drawEnabled=true`, `previewOnly=false`;
  - `GET /api/player/gacha/pity/NORMAL_HERO` returned `UR/SSR counter=0,totalCount=0` before draw.
- Real draw result:
  - request `codex-cocos-normal-draw-20260610140143`;
  - `drawNo=GACHA96a43b72b1734a69a71a613021717f8d`;
  - reward `SR_WITCH_03 / 契约魔女 / SR`;
  - `grantNo=RWDc334bcee86e34bca953807914ca29c98-19875bc0`.
- Persistence verified:
  - diamond balance `280 -> 0`;
  - exactly one currency deduction log, one draw log, one draw result, and one successful HERO reward grant;
  - same request replay returned the same draw/grant and did not double charge;
  - pity counters became `counter=1,totalCount=1`;
  - gacha/reward outbox rows and one `GACHA_DRAW` operation log were present;
  - generated hero attributes were present for the granted hero.
- Red-line check:
  - `gacha exchange/reissue`, bag `use/batch-use/sell`, and hero `level-up/star-up/awaken/refine` still return the Cocos phase gate message;
  - no EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint was opened.

## 2026-06-10 Gacha Draw Guard And Display-Only Pool QA Note

- Product issue:
  - current real draw is open, so the client must not treat missing/undefined `drawEnabled` as drawable;
  - the light/dark pool should remain visible as locked/display-only instead of disappearing from the summon rail;
  - draw request pending state must not allow the user to leave and later reopen stale summon/result state.
- UI/flow acceptance:
  - summon buttons enable only on `drawEnabled === true`, `previewOnly=false`, `locked=false`, and active pool status;
  - `SEALED_LIGHT_DARK` appears as locked/display-only and cannot draw;
  - closing the gacha page while a draw request is pending shows `召唤请求处理中，请稍候。`;
  - account/login reset clears stale `drawing`, `error`, `lastDrawResult`, and `activeAction`;
  - lobby copy says real draw is backend-gated and only `draw` is open; exchange/reissue are closed.
- Backend acceptance:
  - same `requestId` replay returns existing result only for the same `poolCode`, `drawCount`, and `useTicket`;
  - mismatched replay returns `重复抽卡请求参数不一致`;
  - request id length is guarded at `128`;
  - `SEALED_LIGHT_DARK` display config is verified as locked/display-only, not real-open.
- Review result:
  - Cocos `check:layout` passed;
  - directed Cocos TypeScript no-emit passed;
  - Cocos `check:preview` passed after Preview refreshed the changed chunks;
  - backend economy guard passed;
  - targeted Maven tests passed;
  - low-balance gacha draw smoke passed with no draw/result/reward/currency writes.
- Preview status:
  - current `http://127.0.0.1:7456` Preview now serves the changed Cocos scripts;
  - if stale chunks recur after later edits, no repository script can non-destructively refresh those chunks from outside Creator;
  - run Creator-side `Reimport Asset` for the changed scripts plus `Project -> Refresh Device`, or reopen Preview, then rerun `npm.cmd run check:preview`.
- Boundary unchanged:
  - same existing `POST /api/player/gacha/draw` gacha write only;
  - no EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy endpoint was opened;
  - no new successful draw or recharge was performed in this pass.

## 2026-06-10 Multi-Pool Low-Balance Draw Guard QA Note

- QA target:
  - close the remaining validation gap between the three real-open pools and the previous single-pool low-balance smoke.
- Expected pool scope:
  - `LIMITED_ABYSS_PREVIEW`;
  - `NORMAL_HERO`;
  - `BASIC_CONTRACT_PREVIEW`.
- Expected failure behavior:
  - each target pool must be returned by `GET /api/player/gacha/pools` with `locked=false`, `drawEnabled=true`, and `previewOnly=false`;
  - the low-balance test account must have balance below the pool single-draw cost, otherwise the smoke must abort before calling draw;
  - the same request id is submitted twice to existing `POST /api/player/gacha/draw`;
  - both calls must fail without getting stuck in `抽卡请求处理中`;
  - no draw log/result, reward grant, currency log, hero, fragment, or pity state may change for the failed request.
- Locked-pool behavior:
  - `SEALED_LIGHT_DARK` remains visible locked/display-only and non-drawable;
  - it is intentionally excluded from the real-open low-balance smoke.
- Review result:
  - three-pool low-balance smoke passed for `userId=4`;
  - each real-open pool stayed write-clean with `drawLogs=0`, `drawResults=0`, `rewardGrantLogs=0`, and `currencyLogs=0`;
  - backend economy guard and targeted Maven tests passed;
  - Cocos `check:layout`, directed TypeScript no-emit, `check:preview`, `.spine/.spine.meta` scan, and `git diff --check` passed.
  - Browser self-preview reached lobby as `userId=4` and opened `召唤祭坛`; the three real-open pools and visible locked/display-only `光暗召唤` were present, with no console errors and no draw button click.
- Boundary unchanged:
  - no Cocos write entry was added;
  - no successful draw or recharge is part of this QA pass;
  - EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress writes, and any new economy endpoint remain closed.

## 2026-06-10 Hero Summon Center Spine QA Note

- Product issue:
  - selecting `英雄召唤` still displayed the limited summon center skeleton.
- Root cause:
  - the active `NORMAL_HERO` display config row used the same `center_spine_resource` and UUID as `LIMITED_ABYSS_PREVIEW`;
  - Cocos was following backend display data correctly, but the data pointed to the wrong center Spine.
- Expected display:
  - `LIMITED_ABYSS_PREVIEW` keeps `spine/gacha/huangfengjiaozong/huangfengjiaozong`;
  - `NORMAL_HERO` uses `spine/gacha/hunka_nima/hunka_nima`;
  - `NORMAL_HERO` must not reuse the limited center Spine.
- Review result:
  - added SQL `D:\project\LootChain\sql\36_gacha_hero_center_spine_display_sync.sql`;
  - updated fresh display SQL and the gacha rate/pity opening SQL to keep the mapping stable;
  - economy/display guard now catches any regression where hero summon points back to limited summon;
  - Browser self-preview after refresh/login confirmed `英雄召唤` center renders the `hunka_nima` white-haired seated skeleton and no draw button was clicked.
- Boundary unchanged:
  - display metadata only; no gacha probability, weight, pity, cost, reward, write route, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint changed.

## 2026-06-10 Normal Summon R/SR-Only And Box Summon Center QA Note

- Product request:
  - `普通召唤` must remove SSR/UR heroes from the active pool;
  - the center summon Spine should use `assets/resources/spine/gacha/box_summon`;
  - the center Spine sizing should remain consistent with the other real-open pool presentation.
- Expected economy/display result:
  - `BASIC_CONTRACT_PREVIEW` stays real-open only through the existing draw gate fields;
  - active rates are `R=0.600000` and `SR=0.400000`;
  - active SSR/UR rates, reward items, and duplicate configs are `0`;
  - pity group is `BASIC_RS_ONLY`, with no active SSR/UR pity;
  - `center_spine_resource=spine/gacha/box_summon/boxman_text`;
  - `center_spine_uuid=3a0e1b57-8392-4f08-83ce-31ce91d26481`.
- Cocos resource handling:
  - `box_summon` now has Cocos meta files for `boxman_text.json`, `boxman_text.atlas`, and atlas page PNGs;
  - original `252.spine` source was moved to `docs/spine-source-archive/gacha/box_summon/252.spine`;
  - layout guard checks the `box_summon` Spine JSON version, default skin, idle animation, atlas pages, and bans `.spine` source files from `assets/resources/spine`.
- Review target:
  - selecting `普通召唤` should render `box_summon`, not limited summon or hero summon;
  - `box_summon` should use the normal summon scale multiplier so it is visually close to the limited and hero center Spine sizes;
  - `概率保底` should show the R/SR-only rate/guarantee notes and must not show inactive SSR/UR pity rows;
  - `奖池内容` should list only active R/SR reward rows;
  - no draw button should be clicked during visual verification unless the user explicitly approves a paid successful draw;
  - failure smoke remains low-balance/write-clean only.
- Review result:
  - Browser Preview selected `普通召唤` and displayed `box_summon`;
  - `概率保底` showed `R 60% / SR 40%` and the R/SR-only no-SSR/UR-pity note;
  - 当时 `奖池内容` 只显示旧的 2R+2SR；该结果已被 2026-06-13 V1 卡池条目基线覆盖，普通召唤当前应显示 6R+6SR；
  - no single/ten draw button was clicked.
- Boundary unchanged:
  - Cocos still uses only existing `POST /api/player/gacha/draw`;
  - no EX V1, exchange/reissue, bag use/sell/batch-use, hero growth, reward/stamina/progress write, or new economy endpoint is opened.

## 2026-06-13 Gacha Pool Item V1 Baseline QA Note

- Product/design result:
  - `普通召唤` is the early daily R/SR pool;
  - `英雄召唤` is the permanent full regular hero pool;
  - `限定召唤` keeps the same rarity rates as the permanent pool but uses abyss-themed internal weights.
- Backend configuration result:
  - `BASIC_CONTRACT_PREVIEW`: 6 active R + 6 active SR, all weight `100`, no active SSR/UR;
  - `NORMAL_HERO`: 6R + 6SR + 4SSR, all weight `100`, no active UR;
  - `LIMITED_ABYSS_PREVIEW`: 6R + 6SR + 4SSR + first-version UR pair `UR_ARTHAS`/`UR_EVELYN`, with both UR heroes weighted `500`.
- Cocos review target:
  - `奖池内容` must read backend active items and show the expanded V1 roster;
  - normal summon must no longer show only the historical `R_PATROL_01/R_ACOLY_02/SR_PRIEST_01/SR_WITCH_03` subset;
  - normal summon must still hide SSR/UR and must not show SSR/UR pity rows;
  - hero summon must not show UR rows or UR pity;
  - limited summon must show only `UR_ARTHAS` and `UR_EVELYN` in the UR tier.
- Guard result:
  - `check-gacha-economy-config.ps1` now checks exact item counts, weights, UP flags, active version, duplicate active rows, disabled/EX/protagonist hero leakage, and `SEALED_LIGHT_DARK` locked display-only state.
- Boundary unchanged:
  - this is backend configuration and Cocos-readonly presentation data only;
  - no successful draw, recharge, EX V1, exchange/reissue, bag write, hero growth, reward/stamina/progress write, or new economy endpoint is opened.

## 2026-06-11 Gacha Price And C1812 Summon UI QA Note

- Product pricing:
  - limited summon uses limited tickets first, then diamonds 300/3000;
  - hero summon uses hero tickets first, then diamonds 280/2800;
  - normal summon uses normal tickets first, then bound diamonds 80/800.
- Cocos request:
  - draw remains `POST /api/player/gacha/draw`;
  - current request body uses `paymentMode=AUTO`.
- UI resource decision:
  - scanned `C:\Users\axian\Desktop\C1812-1`;
  - selected summon floor, magic circle, reward slot, case frame, and gold currency icon;
  - imported them under `assets/resources/ui/gacha/c1812`;
  - used the floor and magic circle under the center Spine, and the frame/slot on reveal/result cards.
- QA result:
  - backend economy guard passed;
  - targeted gacha Maven tests passed with `25 tests, 0 failures`;
  - AUTO low-balance smoke passed for all three real pools without persistence writes;
  - Cocos `check:layout` and directed TypeScript no-emit passed.
- Visual acceptance status:
  - Cocos Preview is not currently serving `localhost:7456` after reboot, so browser preview is blocked by `ECONNREFUSED`;
  - start or refresh Creator Preview before judging the final summon page visuals.
