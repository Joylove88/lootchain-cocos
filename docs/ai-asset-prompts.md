# LootChain 全套 UI/场景素材 AI 生成指令

> 用法:每条指令 = 【统一风格前缀】+【主体描述】。生成后按"命名"列保存 PNG,交给开发导入。
> 优先级:P0 = 战斗与通用弹窗(先做),P1 = 各面板,P2 = 锦上添花。

---

## 〇、统一风格锚(每条指令都以此开头)

**英文(推荐,生图效果最好):**
```
Dark fantasy mobile game UI asset, gothic abyss theme, obsidian black and deep crimson color palette, antique gold filigree ornament edges, ornate yet clean and readable, high contrast, AAA mobile RPG quality, game asset on plain solid background, no text, no watermark
```

**中文(支持中文的平台用):**
```
暗黑奇幻手游UI素材,哥特深渊主题,黑曜石黑+深红主色,古金色雕花描边,华丽但干净易读,高对比度,3A手游品质,纯色底方便抠图,画面中不要出现任何文字和水印
```

### 工程约定(重要)
1. **UI 件必须透明底**:若平台不支持透明 PNG,生成时要求"纯绿色 #00FF00 背景",开发侧抠图;支持透明的平台(Recraft/Ideogram/即梦部分模式)直接选透明。
2. **"no text"必须加**:所有文字由游戏内代码渲染,素材上出现字就废了。
3. **框类素材要"边框装饰集中在四角与边缘,中央区域纯净"**,方便九宫格拉伸。
4. 分辨率按下表,宁大勿小(可缩不可放)。

---

## 〇之二、素材放置目录约定(放进目录后告诉我,导入/meta/接线全部我来)

| 素材类别 | 放置目录 |
|---|---|
| P0 通用弹窗/按钮/横幅/分隔线/道具格/Tab/滚动条 | `assets/resources/ui/common/ai/` |
| P0 战斗(背景/血条/怪物/技能卡/胜负旗/结算框/buff/特效) | `assets/resources/ui/battle/ai/` |
| P1 大厅背景、导航图标×8 | `assets/resources/ui/lobby/ai/` |
| P1 头像框、货币图标×3(跨界面通用) | `assets/resources/ui/common/ai/` |
| P1 英雄卡框×4、英雄详情背景、SR/R 英雄头像 | `assets/resources/ui/hero/ai/` |
| P1 召唤祭坛背景、魔法阵 | `assets/resources/ui/gacha/ai/` |
| P1.5 背包结构件(侧栏/格框/胶囊/横梁/宽按钮)与详情弹窗件 | `assets/resources/ui/common/ai/` |
| P1.5 物品图标(金币/强化石/契约券/碎片等,方图) | `assets/resources/ui/bag/ai/` |
| P2 冒险地图背景、关卡节点×4 | `assets/resources/ui/adventure/ai/` |
| P2 登录背景、LOGO 底纹、加载图标、角落装饰 | `assets/resources/ui/login/ai/` |
| 重生成的 monster_boss(纯洋红底) | `assets/resources/ui/battle/ai/` |

命名沿用文档各表的"命名"列;同名即视为替换旧版(想 A/B 对比就加后缀 `1`,我处理后覆盖正式名)。

## 一、P0:通用弹窗与按钮套件

| # | 素材 | 尺寸 | 命名 | 生成指令(接在风格锚后) |
|---|---|---|---|---|
| 1 | 弹窗主框(大) | 1024×768 | popup_frame_large.png | ornate rectangular dialog frame, dark obsidian panel with subtle stone texture, antique gold corner ornaments and thin gold border, empty clean center area for text, slight inner glow along edges |
| 2 | 弹窗主框(小) | 768×512 | popup_frame_small.png | 同上,补 "smaller compact dialog proportions" |
| 3 | 标题横幅 | 800×220 | title_banner.png | horizontal title banner ribbon, dark red and black banner cloth with gold trim and small demon-wing ornaments at both ends, empty center for title text |
| 4 | 主按钮 | 512×160 | button_primary.png | rectangular game button, dark gold metallic plate with crimson gem inlay at center-left, beveled gold edges, subtle emboss, empty center |
| 5 | 危险/次要按钮 | 512×160 | button_danger.png | 同 4,补 "deep crimson metallic plate instead of gold" |
| 6 | 按钮禁用态 | 512×160 | button_disabled.png | 同 4,补 "desaturated grey iron plate, no gem, worn surface" |
| 7 | 关闭按钮 | 128×128 | button_close.png | small round close button, dark iron ring with gold X-shaped ornament, gothic style |
| 8 | 分隔线 | 800×40 | divider_gold.png | thin horizontal gold filigree divider line, symmetrical vine ornament fading to transparent at both ends |
| 9 | 道具格 | 256×256 | item_slot.png | square item slot frame, dark recessed stone socket with thin gold border, empty center |
| 10 | 道具格高亮 | 256×256 | item_slot_glow.png | 同 9,补 "glowing warm golden aura around border" |
| 11 | Tab 选中态 | 400×112 | tab_selected.png | horizontal tab plate, dark base with bright gold underline glow and crimson accent |
| 12 | 滚动条 | 32×512 | scrollbar.png | slim vertical scrollbar, dark groove with gold handle bead |

## 二、P0:战斗界面

| # | 素材 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 13 | 战斗背景·深渊荒漠 | 2560×1440 | battle_bg_desert.png | side-scrolling battle background, vast dark desert canyon at dusk, jagged obsidian rock spires, blood-red sky with dust haze, distant ruined gothic castle on horizon, wide flat empty ground band across lower third for characters, painterly, atmospheric perspective, no characters(注意:这条不需要透明底,不要加纯色底要求) |
| 14 | 战斗背景·血色大教堂 | 2560×1440 | battle_bg_cathedral.png | side-scrolling battle background, ruined gothic cathedral interior, broken stained-glass windows with crimson light beams, stone pillars, wide flat empty floor across lower third, no characters |
| 15 | 战斗背景·深渊城门 | 2560×1440 | battle_bg_gate.png | side-scrolling battle background, colossal demonic abyss gate glowing red, black fortress walls, ember particles in air, wide flat empty ground across lower third, no characters |
| 16 | 我方血条 | 512×64 | hp_bar_ally.png | slim horizontal HP bar frame with warm gold fill bar, dark iron casing, pointed ornamental ends(框和填充条最好分开生成两张:hp_frame.png / hp_fill_gold.png) |
| 17 | 敌方血条填充 | 512×48 | hp_fill_red.png | glowing crimson energy fill bar strip, slight inner gradient |
| 18 | Boss 血条 | 1024×96 | boss_gauge.png | wide boss HP gauge frame, black gothic casing with demon skull ornament at left end, gold trim |
| 19 | 技能/英雄卡框 | 320×400 | battle_card_frame.png | small vertical card frame for battle HUD, dark metal border with gold corners, empty center |
| 20 | 技能卡激活框 | 320×400 | battle_card_active.png | 同 19,补 "bright golden glowing border, energized" |
| 21 | 胜利横幅 | 600×1200 | banner_victory.png | vertical hanging victory banner, crimson and gold war banner cloth with laurel and sword emblem, battle-worn edges |
| 22 | 失败横幅 | 600×1200 | banner_defeat.png | 同 21,补 "torn grey-black mourning banner, broken sword emblem" |
| 23 | 结算弹窗框 | 1200×800 | result_frame.png | grand result dialog frame, dark obsidian panel with elaborate gold victory ornaments on top edge, empty center, celebratory but dark tone |
| 24 | Buff 图标×4 | 各 128×128 | buff_atk / buff_def / buff_shield / buff_stun .png | round buff icon, [sword up / shield / golden barrier / swirl stars] symbol, gold on dark disc, thin border(一次一个) |
| 25 | 斩击特效 | 512×512 | fx_slash.png | anime-style crescent slash effect, white-gold blade arc with crimson trail, on pure black background for additive blending(黑底,加法混合用) |
| 26 | 命中爆点 | 512×512 | fx_impact.png | radial impact burst, gold sparks and crimson shockwave ring, on pure black background |
| 27 | 小怪立绘×3 | 各 512×640 | monster_grunt_1/2/3.png | dark fantasy monster full body for side-view battle, [hunched abyss ghoul with rusty blade / horned imp warrior with spiked club / cloaked wraith with claws], facing left, painterly, consistent style, plain background |
| 28 | 精英怪立绘 | 640×768 | monster_elite.png | armored abyss knight monster, corrupted black armor with red glow cracks, greatsword, facing left |
| 29 | Boss 立绘 | 896×1024 | monster_boss.png | towering demon lord boss, obsidian body with molten crimson veins, crown of horns, facing left, imposing silhouette |

## 三、P1:大厅与导航

| # | 素材 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 30 | 大厅背景 | 2560×1440 | lobby_bg.png | dark fantasy guild hall interior, gothic arches, warm candlelight against cold stone, banners hanging, spacious center composition leaving room for UI, no characters |
| 31 | 导航图标×8 | 各 192×192 | nav_hero / nav_bag / nav_codex / nav_summon / nav_adventure / nav_shop / nav_quest / nav_forge .png | round navigation icon, [crossed swords / leather satchel / open grimoire / summoning circle / compass rose / coin stack / scroll seal / anvil] gold emblem on dark disc with thin gold ring(一次一个,风格务必一致:同一会话连续生成) |
| 32 | 玩家头像框 | 256×256 | avatar_frame.png | square avatar frame, gold gothic border with small demon wings on top corners, empty center |
| 33 | 货币图标×3 | 各 128×128 | currency_gold / currency_diamond / currency_stamina .png | game currency icon, [ornate gold coin with demon head emboss / blood-red crystal gem / winged crimson flask] |

## 四、P1:各面板专属

| # | 素材 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 34 | 冒险章节地图背景 | 2048×1536 | adventure_map_bg.png | dark fantasy chapter map, aged parchment-free style: dark terrain seen from above with winding glowing path, obsidian mountains and crimson rifts, spots for stage nodes, no text no icons |
| 35 | 关卡节点×4 | 各 160×160 | node_normal / node_boss / node_clear / node_locked .png | round stage node medallion, [plain gold ring / demon skull crest / green-gold laurel check / grey chained lock] on dark disc(一次一个) |
| 36 | 英雄卡框×4 稀有度 | 各 512×912 | card_r / card_sr / card_ssr / card_ur .png | vertical hero card frame, ornate border, [muted silver-green / azure blue / royal purple / blazing gold-red] themed corner gems and trim, empty center for artwork, rarity luxury increases with tier(一次一个,同会话保风格) |
| 37 | 英雄详情背景 | 2048×1152 | hero_detail_bg.png | dark fantasy hero showcase stage, dramatic spotlight from above on empty center platform, gothic pillars in shadow at sides, subtle crimson mist at floor |
| 38 | 召唤祭坛背景 | 2048×1152 | summon_bg.png | demonic summoning altar chamber, giant glowing magic circle on floor, candles and chains, dark epic atmosphere, empty center |
| 39 | 魔法阵 | 1024×1024 | summon_circle.png | intricate summoning magic circle, glowing crimson and gold runes, concentric rings, on pure black background |
| 40 | 道具图标×6 | 各 192×192 | item_stone / item_expbook / item_fragment / item_ticket / item_chest / item_key .png | game item icon, [glowing enhancement ore / leather-bound tome / crystal shard cluster / ornate summon ticket / dark treasure chest / gothic key] |

## 五、P2:登录与点缀

| # | 素材 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 41 | 登录背景 | 2560×1440 | login_bg.png | epic dark fantasy key art background, abyss gate opening with light burst, silhouetted castle, dramatic clouds, center-bottom space reserved for logo and login button, no characters no text |
| 42 | 游戏 LOGO 底纹 | 1024×512 | logo_backing.png | ornate emblem backing, crossed swords behind gothic shield with chains and gold wings, on plain background |
| 43 | 加载图标 | 256×256 | loading_rune.png | circular loading rune ring, gold runes on dark ring, designed to look good rotating |
| 44 | 角落装饰 | 512×512 | corner_ornament.png | single corner filigree ornament, gold vine and thorn design fading to transparent, for panel corners |

---

## 生成技巧提醒

1. **同类素材同一会话连续生成**(图标集/卡框集/节点集),风格才统一;最好第一张满意后用"参考此图风格"继续。
2. **框类如果中央不干净**(AI 喜欢往中间加东西),在指令里强调 "large EMPTY center area, all ornament only on borders"。
3. 每类先生成 1 张给我看,确认风格锚合适后再批量——避免整批返工。
4. 战斗背景务必强调 "wide flat empty ground band across lower third"(角色要站的地带),不然地形起伏放不了单位。
5. 生成完发我文件即可,导入(sprite-frame 类型)、替换、布局适配全部我来。

## 交付顺序建议
第一批(立刻可用):#1 弹窗主框、#3 标题横幅、#4 主按钮、#13 战斗背景、#23 结算框、#27-29 怪物立绘。
第二批:其余 P0 → P1 → P2。

---

## 六、P1.5:背包系统套件(参考暗黑破坏神风格背包 + 物品详情弹窗)

风格锚不变,每条指令前接:`Dark fantasy mobile game UI asset, gothic abyss theme, obsidian black and deep crimson palette, antique gold filigree, painterly, high detail, mobile RPG quality, game asset, no text, no watermark`。
标注【透明】的开 transparent background / 生成后 Remove Background;标注【方图】的是物品图标,**不透明**,自带暗底直接铺进格子。

### A. 背包界面结构

| # | 素材 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 45 | 分类侧栏底板【透明】 | 360×980 | bag_sidebar.png | vertical sidebar panel, dark iron plate with spiked top ornament and hanging chain at bottom, subtle crimson glow along left edge, tall empty center for menu rows |
| 46 | 分类选中高亮【透明】 | 400×96 | bag_tab_active.png | horizontal menu selection highlight, dark crimson gradient bar glowing brighter at left, thin gold top and bottom edges, fading to transparent at right end |
| 47 | 分类图标×7【透明】 | 各 128×128 | bag_ic_all / bag_ic_item / bag_ic_equip / bag_ic_material / bag_ic_shard / bag_ic_consume / bag_ic_misc .png | thin antique gold line-art icon, [swirling vortex / leather satchel / crossed sword and shield / crystal cluster / puzzle piece shard / round potion bottle / eight-point compass], minimal elegant stroke(一次一个,同会话) |
| 48 | 道具格基础框【透明】 | 200×200 | bag_slot.png | square inventory cell, dark recessed stone socket with thin iron border and subtle inner shadow, completely empty center |
| 49 | 稀有度格框×5【透明】 | 各 200×200 | bag_slot_n / bag_slot_r / bag_slot_sr / bag_slot_ssr / bag_slot_ur .png | square inventory slot BORDER ONLY, thin glowing [dull grey / azure blue / royal purple / radiant gold / blazing crimson] frame with tiny corner gems, strictly transparent empty center(一次一色,同会话) |
| 50 | 货币胶囊【透明】 | 400×96 | bag_currency_bar.png | slim horizontal currency capsule, dark rounded bar with thin gold trim, circular socket on left end for coin icon, small square plus-button socket on right end, empty middle |
| 51 | 顶部横梁装饰【透明】 | 1600×170 | bag_header_beam.png | horizontal ornate header beam, black iron with demon mask centerpiece and symmetric spiked wing flourishes, thin crimson gem accents |
| 52 | 宽按钮·普通【透明】 | 512×140 | bag_button_dark.png | wide flat game button, dark iron plate with corner rivets and subtle bevel, faint gold hairline border, empty center |
| 53 | 宽按钮·主操作【透明】 | 512×140 | bag_button_crimson.png | wide flat game button, deep crimson metal plate with glowing edges and corner rivets, gold hairline border, empty center |

### B. 物品详情弹窗

| # | 素材 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 54 | 详情竖框【透明】 | 900×1200 | item_detail_frame.png | tall vertical item-detail dialog frame, dark obsidian panel with ornate gold-and-crimson corner filigree, small pointed finial at top center, large EMPTY center area, all ornament only on borders |
| 55 | 途径行条【透明】 | 700×110 | item_source_row.png | slim horizontal list row plate, dark iron bar with thin gold border and a right-pointing arrow ornament at right end, empty center for text |
| 56 | 图标小按钮【透明】 | 340×130 | item_action_button.png | small rectangular button plate, dark iron with thin gold border, circular icon socket on the left third, empty right area for label |
| 57 | 出售横幅按钮【透明】 | 700×140 | item_sell_button.png | wide sell button, deep crimson banner plate with gold trim, circular coin socket at left, subtle glow, empty center |
| 58 | 操作图标×4【透明】 | 各 96×96 | ic_use / ic_forge / ic_source / ic_share .png | thin gold line-art icon, [sparkle hand / anvil hammer / open book / share arrows](一次一个) |
| 72 | 分类栏底板 v2【透明】(覆盖 bag_sidebar) | 640×1280 | bag_sidebar.png | tall vertical sidebar panel for dark fantasy game UI, dark obsidian stone board with thin antique gold frame, board body fills 85% of canvas width and 92% of canvas height, slim small crown ornament centered on top edge with tiny red gem, subtle chain pendant at bottom edge, completely EMPTY flat center area for text rows, ornament only on edges |
| 73 | 格阵容器板【透明】 | 1600×1200 | bag_grid_panel.png | large rectangular container panel for dark fantasy game inventory UI, dark iron plate with thin antique gold border line, demon mask crest with red gem centered on TOP edge only, small spike ornaments at four corners, panel body fills 90% of canvas, completely EMPTY flat dark center area, ornament only on borders |
| 74 | 页面标题背景板【透明】 | 560×140 | ui_title_plate.png (→ ui/common/ai) | horizontal page title backdrop plate for dark fantasy game UI, dark angular iron banner with snarling demon head ornament on the LEFT end and tapering spike tail fading to the right, thin crimson and gold accent lines, large EMPTY flat area right of the demon head for title text, ornament concentrated on left third |
| 75 | 底部导航栏底板【透明】 | 2048×230 | nav_bar_bg.png (→ ui/lobby/ai) | wide bottom navigation bar backdrop for dark fantasy game UI, long dark iron plate with thin antique gold line along the TOP edge, subtle demon spike ornaments at both ends, faint crimson gem accent at center of top edge, completely EMPTY flat dark surface for icon slots, ornament only on edges |

### C. 物品图标(对照后端物品表;【方图】不透明,自带暗色渐晕底,可直接铺格)

统一模板:`square game item icon, dark vignette background, centered single [object], painterly, glossy highlights, dramatic rim light, mobile RPG quality, no border, no text`。同会话连续生成保证同风格。

| # | 物品(后端编码) | 尺寸 | 命名 | [object] 填入 |
|---|---|---|---|---|
| 59 | 金币 GOLD | 256 | icon_gold.png | ornate gold coin with demon head emboss |
| 60 | 钻石 DIAMOND | 256 | icon_diamond.png | brilliant violet-blue crystal gem |
| 61 | 绑定钻石 BOUND_DIAMOND | 256 | icon_bound_diamond.png | crimson crystal gem wrapped in a thin dark chain |
| 62 | 体力 STAMINA | 256 | icon_stamina.png | winged crimson potion flask glowing softly |
| 63 | 低阶强化石 LOW_ENHANCE_STONE | 256 | icon_enhance_low.png | rough dark whetstone with faint red runes |
| 64 | 高阶强化石 ENHANCE_STONE_HIGH(已启用:强化 +10 以上主材料) | 256 | icon_enhance_high.png | polished obsidian whetstone with bright crimson runes |
| 65 | 英雄经验书 | 256 | icon_expbook.png | dark leather tome with glowing gold sigil |
| 66 | 小额金币箱 CURRENCY_BOX | 256 | icon_gold_chest.png | small iron treasure chest with gold coins spilling out |
| 67 | 普通契约券 NORMAL_CONTRACT_TICKET | 256 | icon_ticket_normal.png | dark parchment contract scroll with plain wax seal |
| 68 | 英雄契约券 HERO_CONTRACT_TICKET | 256 | icon_ticket_hero.png | gold-trimmed contract scroll with royal wax seal |
| 69 | 限定契约券 LIMITED_CONTRACT_TICKET | 256 | icon_ticket_limited.png | crimson contract scroll with demon-horn wax seal, faint fire |
| 70 | 英雄碎片×5 稀有度 | 各 256 | icon_shard_n / _r / _sr / _ssr / _ur .png | crystal shard cluster with small puzzle emblem, [dull grey / azure / royal purple / radiant gold / blazing crimson] glow(一次一色,同会话) |
| 71 | Regression Item | 256 | icon_regression.png | swirling violet hourglass crystal, time-warp energy |

### 接入说明(素材到位后我来做)
- A/B 组透明素材放 `assets/resources/ui/common/ai/`;C 组物品图标放 `assets/resources/ui/bag/ai/`。
- 背包将按参考图重排:左分类侧栏(可点过滤)、格阵稀有度边框、右上容量、详情改为居中弹窗(用途/获取途径/操作按钮,只读版把"使用/合成/分享"做禁用态,"来源"接现有查看来源)。
- 物品图标按 itemCode → icon 映射表接入,缺图回退现有水晶图。

---

## 七、锻造工坊套件(2026-07-14,放 `assets/resources/ui/forge/ai/`)

统一风格后缀(每条末尾都加):
```
dark fantasy mobile game UI, gothic metal texture, weathered bronze with dark gold gilded trim, deep brown-black base tone, volumetric light, highly detailed, clean edges, no text, no logo, no watermark
```
道具/图标类用图标模板后缀:
```
game item icon, dark fantasy style, front view, centered, clean silhouette, isolated on transparent background, no text, PNG
```
导入后 meta 的 type 必须改 `sprite-frame`(或放好后叫我批处理)。

### A. 结构件(✅ = 已生成接入)

| # | 素材 | 尺寸/底 | 命名 | 生成指令 |
|---|---|---|---|---|
| 76 | ✅ 锻造全屏背景 | 1920×1080 不透明 | forge_bg.png | Full-scene background of an underground dwarven forge workshop, a central furnace with orange-red firelight rising from the bottom of the frame, silhouettes of anvils and smithing tools on both sides, stone vaulted ceiling, drifting ember particles, keep the top and bottom areas dark for UI overlay, overall dim so it never competes with foreground UI |
| 77 | ✅ 铸造台/材料石台 | 1920×1088 透明 | forge_anvil.png | Front view of a magical forging altar, circular stone base with two stepped tiers, a floating rune circle glowing soft gold at the center of the platform, dark gold engraved chains wrapped around the base, leave the top area empty for an equipment icon, centered composition, isolated on transparent background, PNG |
| 78 | ✅ 合成祭坛底板 | 1600×560 透明 | fuse_altar.png | Horizontal equipment-fusion altar base plate, a wide stone table with three recessed circular rune sockets evenly spaced across the surface glowing faint blue-purple, sockets connected by glowing rune line patterns, small candle flames standing at both ends, isolated on transparent background, PNG |
| 79 | ✅ 装备槽框 | 512×512 透明 | slot_frame.png | Square equipment slot frame, rounded rectangle, weathered bronze border with diamond-shaped gem rivets at the four corners, completely empty and transparent inside the frame, border thickness about 8% of the image, isolated on transparent background, PNG |
| 80 | ✅ 主操作按钮 | 800×240(实际 1983×793,按 2.5:1 等比) | btn_forge.png | Horizontal primary action button base, deep red metal panel with heavy bright gold trim, embossed blacksmith-hammer reliefs on the left and right ends, empty center space reserved for text, subtle inner glow, isolated on transparent background, PNG |
| 81 | ✅ 环形装备展示环 | 1024×1024 透明 | enhance_ring.png | a large ornate circular display frame, gothic spiked ring with dark gold trim, hanging chains draped from both sides, empty center, front view, centered |
| 82 | 选项卡底板(备用,当前用右下导航) | 600×192 透明 ×2 | tab_active.png / tab_normal.png | 选中态:Horizontal tab button plate (selected state), dark crimson leather-textured panel, bright gold trim, a single glowing gold line along the top edge, subtle outer glow;未选态同构图换 dark gray-brown stone slab texture, thin dark copper trim, no glow |

### B. 道具图标(待生成;图标模板后缀)

| # | 物品(后端编码) | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 83 | 强化祝福石 ENHANCE_BLESS_STONE | 512 透明 | icon_bless_stone.png | a radiant blessing gemstone, luminous violet-purple crystal shard wrapped in a thin golden filigree band, soft holy glow emanating from within, small light particles floating around it |
| 84 | 强化护符 ENHANCE_GUARD_RUNE | 512 透明 | icon_guard_rune.png | a protective ward talisman, bronze shield-shaped amulet with a glowing golden rune engraved in the center, weathered metal edges, subtle protective aura |

### C. 部位图标(待生成;图标模板后缀,同会话连续生成保风格)

| # | 部位 | 尺寸 | 命名 | 生成指令 |
|---|---|---|---|---|
| 85 | 武器 WEAPON | 512 透明 | icon_weapon.png | an ornate longsword pointing diagonally upward |
| 86 | 头盔 HELMET | 512 透明 | icon_helmet.png | a horned knight helmet |
| 87 | 胸甲 CHEST | 512 透明 | icon_chest.png | a heavy plate chest armor |
| 88 | 鞋子 BOOTS | 512 透明 | icon_boots.png | a pair of armored greaves boots |
| 89 | 戒指 RING | 512 透明 | icon_ring.png | a gothic ring with a glowing gem |
| 90 | 项链 NECKLACE | 512 透明 | icon_necklace.png | an amulet necklace with a diamond-shaped pendant on a chain |

### D. 右下功能导航徽章(可选,当前程序绘制;同会话连续生成)

统一模板:`round medallion navigation icon, [emblem] in antique gold on a dark iron disc with thin gold ring border, dark fantasy game UI, centered, isolated on transparent background, no text` — 生成后告诉我加接线。

| # | 功能 | 尺寸 | 命名 | [emblem] 填入 |
|---|---|---|---|---|
| 91 | 强化 | 256 透明 | nav_forge_enhance.png | a blacksmith hammer striking sparks |
| 92 | 合成 | 256 透明 | nav_forge_fuse.png | three orbs merging into one |
| 93 | 分解 | 256 透明 | nav_forge_decompose.png | a shattered crystal splitting apart |
| 94 | 祝福 | 256 透明 | nav_forge_bless.png | a four-pointed radiant star |

### E. 雕花面板底(强化页质感升级,待生成)

| # | 素材 | 尺寸/底 | 命名 | 生成指令 |
|---|---|---|---|---|
| 95 | 通用雕花面板底(九宫格) | 800×600 透明 | panel_ornate.png | an ornate rectangular UI panel frame, dark obsidian stone body with antique gold filigree border, small gold corner ornaments and a tiny gem centered on the top edge, large completely EMPTY flat dark center area, all ornament strictly on the borders only, border thickness about 6% of the image, isolated on transparent background, PNG |

> 用途:替换强化页左列面板 / 强化保护 / 等级预览 / 属性对比面板的程序绘制圆角矩形;装饰必须集中在边框、中央纯净,方便九宫格拉伸。

### F. 逐件装备图标(36 件;v2 风格修订 2026-07-14:对齐参考图的干净写实道具风)

- 目录:`assets/resources/ui/forge/ai/equip/`;**命名 = equip_{系列颜色}_{部位}.png(按当前真实稀有度,见表)**;512×512 **不透明方图(自带暗渐晕底)**。
- ⚠️ 数据库装备编码带历史颜色后缀(P1 稀有度改制原地重标)——**文件名不用编码**,映射由客户端维护,按表存图即可。
- **v1 教训**:透明底+重特效(火焰装饰堆/光雾)导致格内混乱;v2 改为与 C 组道具同款**自带暗底方图 + 写实弱特效**。
- **统一模板 v2**(每条 = 模板 + [object] + [accent]):
```
square game item icon, dark vignette background filling the whole square, centered single [object], realistic painterly rendering in the style of Diablo item icons, muted weathered metal materials, clean readable silhouette, soft dramatic lighting, [accent], moderate detail, no border, no text, no watermark
```
- **[accent] 按系列**(特效务必克制):

| 系列 | [accent] |
|---|---|
| 白 · 粗铁 | plain worn grey iron, no glow |
| 绿 · 铁誓 | faint emerald-green rune accents, very subtle glow |
| 蓝 · 裂隙 | subtle azure-blue crack accents, faint cold glow |
| 紫 · 深渊 | subtle violet gem accents, faint purple glow |
| 橙 · 灼世 | warm amber metal tint, faint ember glow along edges |
| 红 · 烬灭 | dark charred metal, subtle crimson edge glow |

- **生成技巧**:①同部位 6 件同一会话从白到红连续生成("same object, change the accent to ...");②最好先出 1 张给参考图对样,确认风格再批量;③不透明方图**无需任何后处理**,直接放入覆盖即可。
- 接线约定:equipCode → 图标自动映射,缺图回退部位图标(#85~90)→ 线稿。文件覆盖即换装。

| 装备 | 命名 | 主体描述(接统一前缀后) |
|---|---|---|
| 粗铁短剑 | equip_white_weapon.png | a simple short sword, made of crude rough iron, dull grey metal with scratches and worn edges, simple plain design, no glow |
| 粗铁头盔 | equip_white_helmet.png | a plain iron helmet, made of crude rough iron, dull grey metal with scratches and worn edges, simple plain design, no glow |
| 粗铁胸甲 | equip_white_chest.png | a plain iron breastplate, made of crude rough iron, dull grey metal with scratches and worn edges, simple plain design, no glow |
| 粗铁行靴 | equip_white_boots.png | a pair of simple traveler boots, made of crude rough iron, dull grey metal with scratches and worn edges, simple plain design, no glow |
| 粗铁指环 | equip_white_ring.png | a plain metal ring, made of crude rough iron, dull grey metal with scratches and worn edges, simple plain design, no glow |
| 粗铁吊坠 | equip_white_neck.png | a simple pendant on a leather cord, made of crude rough iron, dull grey metal with scratches and worn edges, simple plain design, no glow |
| 铁誓短剑 | equip_green_weapon.png | a sturdy short sword with oath runes etched on the blade, made of polished dark iron with faint emerald-green rune engravings, subtle green glow |
| 铁誓头盔 | equip_green_helmet.png | an iron helmet with riveted cheek guards, made of polished dark iron with faint emerald-green rune engravings, subtle green glow |
| 铁誓胸甲 | equip_green_chest.png | a riveted iron breastplate, made of polished dark iron with faint emerald-green rune engravings, subtle green glow |
| 铁誓行靴 | equip_green_boots.png | a pair of armored marching boots, made of polished dark iron with faint emerald-green rune engravings, subtle green glow |
| 铁誓指环 | equip_green_ring.png | a signet ring with a small crest, made of polished dark iron with faint emerald-green rune engravings, subtle green glow |
| 铁誓吊坠 | equip_green_neck.png | a round medallion pendant on a chain, made of polished dark iron with faint emerald-green rune engravings, subtle green glow |
| 裂隙长刃 | equip_blue_weapon.png | a long slender battle blade, dark steel body split by glowing azure-blue rift cracks, cold blue energy seeping from the fissures |
| 裂隙战盔 | equip_blue_helmet.png | a war helm with an angular visor, dark steel body split by glowing azure-blue rift cracks, cold blue energy seeping from the fissures |
| 裂隙鳞甲 | equip_blue_chest.png | a scale mail chest armor, dark steel body split by glowing azure-blue rift cracks, cold blue energy seeping from the fissures |
| 裂隙疾行靴 | equip_blue_boots.png | a pair of swift greaves with small wing accents, dark steel body split by glowing azure-blue rift cracks, cold blue energy seeping from the fissures |
| 裂隙秘环 | equip_blue_ring.png | an arcane ring with tiny orbiting runes, dark steel body split by glowing azure-blue rift cracks, cold blue energy seeping from the fissures |
| 裂隙咒链 | equip_blue_neck.png | a cursed chain amulet holding a small rune tablet, dark steel body split by glowing azure-blue rift cracks, cold blue energy seeping from the fissures |
| 深渊噬魂刃 | equip_purple_weapon.png | a soul-devouring greatsword with a demonic eye set in the guard, obsidian-black body with sinister violet abyssal glow and purple energy wisps |
| 深渊角盔 | equip_purple_helmet.png | a horned demon war helm, obsidian-black body with sinister violet abyssal glow and purple energy wisps |
| 深渊龙鳞甲 | equip_purple_chest.png | a dragon-scale chest armor with layered plates, obsidian-black body with sinister violet abyssal glow and purple energy wisps |
| 深渊掠影靴 | equip_purple_boots.png | a pair of shadow-swift greaves with talon-shaped toes, obsidian-black body with sinister violet abyssal glow and purple energy wisps |
| 深渊灼目戒 | equip_purple_ring.png | a ring crowned with a blazing eye-shaped gem, obsidian-black body with sinister violet abyssal glow and purple energy wisps |
| 深渊寂灭链 | equip_purple_neck.png | an annihilation chain amulet holding a dark core crystal, obsidian-black body with sinister violet abyssal glow and purple energy wisps |
| 灼世噬魂刃 | equip_orange_weapon.png | a soul-devouring greatsword with a demonic eye set in the guard, dark gold and scorched bronze body with molten orange ember veins, radiant amber glow |
| 灼世角盔 | equip_orange_helmet.png | a horned demon war helm, dark gold and scorched bronze body with molten orange ember veins, radiant amber glow |
| 灼世龙鳞甲 | equip_orange_chest.png | a dragon-scale chest armor with layered plates, dark gold and scorched bronze body with molten orange ember veins, radiant amber glow |
| 灼世掠影靴 | equip_orange_boots.png | a pair of shadow-swift greaves with talon-shaped toes, dark gold and scorched bronze body with molten orange ember veins, radiant amber glow |
| 灼世灼目戒 | equip_orange_ring.png | a ring crowned with a blazing eye-shaped gem, dark gold and scorched bronze body with molten orange ember veins, radiant amber glow |
| 灼世寂灭链 | equip_orange_neck.png | an annihilation chain amulet holding a dark core crystal, dark gold and scorched bronze body with molten orange ember veins, radiant amber glow |
| 烬灭噬魂刃 | equip_red_weapon.png | a soul-devouring greatsword with a demonic eye set in the guard, charred jet-black body wreathed in blazing crimson flames, red-hot glowing cracks, apocalyptic aura |
| 烬灭角盔 | equip_red_helmet.png | a horned demon war helm, charred jet-black body wreathed in blazing crimson flames, red-hot glowing cracks, apocalyptic aura |
| 烬灭龙鳞甲 | equip_red_chest.png | a dragon-scale chest armor with layered plates, charred jet-black body wreathed in blazing crimson flames, red-hot glowing cracks, apocalyptic aura |
| 烬灭掠影靴 | equip_red_boots.png | a pair of shadow-swift greaves with talon-shaped toes, charred jet-black body wreathed in blazing crimson flames, red-hot glowing cracks, apocalyptic aura |
| 烬灭灼目戒 | equip_red_ring.png | a ring crowned with a blazing eye-shaped gem, charred jet-black body wreathed in blazing crimson flames, red-hot glowing cracks, apocalyptic aura |
| 烬灭寂灭链 | equip_red_neck.png | an annihilation chain amulet holding a dark core crystal, charred jet-black body wreathed in blazing crimson flames, red-hot glowing cracks, apocalyptic aura |

### 使用位置速查
- 强化页:enhance_ring(环形展示)/ slot_frame(装备格·材料卡)/ forge_anvil(材料石台)/ btn_forge(强化按钮)/ icon_bless_stone·icon_guard_rune(强化保护面板+材料卡)/ 部位图标(左列/环内/页签);
- 合成页:fuse_altar(三槽祭坛)/ btn_forge(合成按钮);分解页:slot_frame 系;
- 高阶强化石用背包 C 组 #64 icon_enhance_high(+10 以上材料卡自动切换)。
