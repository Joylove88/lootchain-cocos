"""10-28 整体 UI 改版:按用户选定的 B 风格(毛玻璃)拼各界面原型提示词。
用法:python tools/qa/proto_prompts/ui_v4/build_b_prompts.py → 同目录生成 <界面>_b.txt
生成:python tools/qa/gen_proto.py --prompt <界面>_b.txt --out <原型.png> --ref proto/hero_b2.png before/<现状>.png
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

HEAD = """Generate ONE image: a finished UI mockup for a dark-fantasy mobile RPG, landscape phone 20:9 (about 1870x841).
TWO images are attached:
- FIRST image = our APPROVED style reference (hero detail screen). Match its visual language exactly: frosted dark glass panels, soft rounded corners, thin faint white outlines, white/grey text, the single champagne-gold accent for the selected item and the one primary button, translucent secondary pill buttons, small monochrome muted-gold attribute icons, calm darkened blurred background.
- SECOND image = our CURRENT version of the screen to redesign. Use it ONLY to know which information and controls exist; do NOT copy its style (it is too flashy, cluttered and AI-looking: red ribbon banners, spiky gold frames, candles, glowing icons - remove all of that).
All text in Simplified Chinese exactly as written below; text crisp and legible. The screen must clearly belong to the same game as the FIRST image.
"""

EXTRA = """Extra rules: painted item / reward art may stay but must be muted, matte, no glow or sparkle; item rarity shown as a thin coloured line or a small tag, never thick glowing coloured frames. Small inline stat icons use the monochrome muted gold (#C9A86A) engraved style. Background scenes darkened and blurred, no visible candles or glowing particles. Generous spacing, aligned grid, clear hierarchy: title > section headers > rows > secondary text.
Output only the single finished mockup image, no annotations.
"""

SCREENS = {
    'forge': """SCREEN: "强化" (equipment enhance), full screen.
- Top bar: back arrow + title "强化" + small "?" help; right: currency chips "金币 4.7M", "钻石 924.5K", "高阶强化石 325", and close (X).
- Far right: a slim vertical tab rail with 4 icon tabs + labels: 强化 (selected), 合成 (small red dot), 分解, 宝石.
- Left panel (about 26% width): header "选择装备 (31)"; a row of small filter chips: 全部 (selected), 武器, 头盔, 胸甲, 鞋子, 戒指, 项链; a scroll list of item rows, each = small item icon with a tiny "已穿" tag, name, "强化等级 +N", a short row of small stars: 灼世掠影靴 +12 (selected row), 灼世龙鳞甲 +2, 灼世龙鳞甲 +0, 灼世角盔 +0, 灼世角盔 +0. Bottom of panel: "筛选" dropdown and "品质优先" sort toggle.
- Centre: the selected item art (a pair of dark armoured boots with ember-red accents, matte, NOT glowing) resting on a simple dark plinth; below: "灼世掠影靴", big "+12", a star bar with "12/20"; "强化消耗": two cost chips "高阶强化石 2/3" (the 2 in muted red = not enough) and "金币 1600". Under that: secondary pill "词缀洗练", primary button "材料不足" shown in a disabled dimmed state, and a small checkbox "连续强化" with an info icon.
- Right panel (about 28% width), three stacked sections: "强化等级" big "+12 → +13", rows with stat icons: 生命值 106 → 110, 速度 18 → 18, 强化加成 +120% → +130% (new values in soft green), then "成功率 21% · 失败强化等级 -1"; "强化保护": two rows with small item icons and counts x18 / x12: "祝福石保护 成功率 +20%" and "护符保护 失败不降级", each with a checkbox on the right; "强化等级预览": +13 生命值 +110 · 速度 +18; +15 生命值 +120 · 速度 +20; +20 生命值 +144 · 速度 +24.
""",
    'bag': """SCREEN: "背包" (inventory), full screen.
- Top bar: back arrow + title "背包"; right: currency chips "金币 4.7M", "钻石 924.5K", close (X).
- Left category list (about 20% width), each row = small monochrome icon + name + count right-aligned: 全部 11.9K (selected), 材料 1,327, 装备 31, 召唤券 0, 消耗品 597, 英雄碎片 4,980, 货币箱 47, 门票 29.
- Right large panel: header "全部" and on the right "共 55 种"; a tidy 9-column x 4-row grid of square item slots (dark glass squares, rounded), each with a muted painted item icon (rune stones, dark crystals in blue / purple / gold, red ember shards, scrolls, old books, a small treasure chest) and a count in the bottom-right corner (e.g. 94, 255, 18, 12, 325, 2, 221, 207, 2, 1, 2, 4, 4, 180, 300, 140, 260, 160 ...); rarity = a thin coloured line along the bottom edge of each slot (purple / blue / orange). The first slot is selected with a champagne outline.
- Bottom of panel: one line of small grey hint text "点击道具查看详情、获取途径,可使用的道具可直接使用或合成。"
""",
    'gacha': """SCREEN: "召唤" (summon / gacha), full screen. This screen keeps a big scene illustration as its main visual: a dark gothic hall with a towering hooded shadow figure with dark tendrils and a small blonde girl in front of it - painted, calm, darkened, no glowing red ring, no particles.
- Top bar: back arrow + title "召唤"; right: currency chips "限定契约券 0", "钻石 924.5K", close (X).
- Top centre: "再召唤 167 次必得 UR 英雄" (the number 167 in the champagne accent, larger); under it one line of small grey text "限定召唤:UP 英雄概率提升,优先消耗限定契约券,不足时消耗钻石。"
- Left: a vertical list of 4 banner cards (frosted glass, each with a small icon, title + grey subtitle): 限定召唤 / UP 英雄概率提升 (selected, champagne outline), 英雄召唤 / 常驻英雄池, 装备召唤 / 装备与锻造材料, 普通召唤 / 仅产出 R/SR.
- Right edge: three small round icon buttons with labels: 概率保底, 记录, 奖池内容; below them a small checkbox "跳过动画"; then a compact card "概率提升" with rows: tag "UR" + "永夜龙骑·阿尔萨斯、深渊魔女·伊芙琳"; tag "SSR" + "夜烬女王·莉维娅"; tag "SR" + "契约魔女、深渊行者".
- Bottom centre: two large buttons side by side: translucent secondary "召唤1次" with small cost text under it "限定契约券 x1 · 钻石 300"; champagne primary "召唤10次" with "限定契约券 x10 · 钻石 3000".
""",
    'shop': """SCREEN: "金币商店" (gold shop), full screen.
- Top bar: back arrow + title "金币商店" + small grey subtitle "用钻石换取金币,档位越高赠送越多"; right: currency chips "金币 4.7M", "钻石 924.5K", close (X).
- Centre: 4 equal product cards in a row (frosted glass, rounded), each: name at top, a muted painted gold-coin illustration in the middle (bigger pile from left to right: one coin, a small stack, a pile, a small chest of coins - matte, no shine sparkles), big amount number + small "金币", a small green-tinted tag for bonus, and a price pill at the bottom with a small diamond icon:
  1) 一袋金币 · 2,000 金币 · price 20
  2) 一堆金币 · 11,000 金币 · 赠 10% · price 100
  3) 金币山 · 36,000 金币 · 赠 20% · price 300
  4) 金币宝箱 · 104,000 金币 · 赠 30% · price 800 - this card has a small corner tag "最划算" and a champagne outline; its price pill is the champagne primary button, the others are translucent pills.
""",
    'quest': """SCREEN: "任务" (quests), full screen.
- Top bar: back arrow + title "任务"; close (X) on the right.
- Under the title: segmented tabs "日常任务" (selected) | "成就"; on the right small text "可领取 1 · 今日完成 1/5".
- A list of 5 full-width quest rows (frosted glass, rounded), each: small monochrome icon in a soft square, title + grey description, a slim progress bar with count above it, reward chips (small icon + text), and an action button on the right:
  1) 每日登录 / 登录游戏 1 次 / 1/1 (bar full, champagne) / 金币×1000 / primary button "领取" (this row slightly highlighted)
  2) 冒险 / 冒险战斗胜利 2 次 / 0/2 / 金币×2000, 经验书×1 / dimmed disabled pill "未完成"
  3) 每日副本 / 每日副本胜利 1 次 / 0/1 / 强化石×2 / "未完成"
  4) 圣契召唤 / 召唤 1 次 / 0/1 / 金币×1500 / "未完成"
  5) 锻造强化 / 强化装备 1 次 / 0/1 / 金币×1000 / "未完成"
""",
    'mail': """SCREEN: "邮件" (mailbox), full screen, two columns.
- Top bar: back arrow + title "邮件"; close (X) on the right.
- Left column (about 34% width): header "收件箱 1/50" with a small text button "全部已读" on the right; a list with one mail row selected (champagne outline): envelope icon, "QA 测试补券", grey "系统 · 10-15", a small tag "已领"; empty space below; bottom: secondary pill "删除已读" and primary button "一键领取".
- Right column: title "QA 测试补券"; grey meta line "发件人:系统   2026-10-15 00:25   有效期:永久"; a thin divider; body text "安卓召唤视频测试用(2026-10-15)"; section header "附件" with two square item slots (muted painted ticket icons) labelled "普通契约券 x20" and "英雄契约券 x10", both shown as already claimed (dimmed with a small check); bottom-right: secondary pill "删除" and a disabled pill "已领取".
""",
    'adventure': """SCREEN: "冒险" (adventure stage map), full screen.
- Top bar: back arrow + title "冒险" + small "?" help; close (X) on the right; centre a single line hint "继续挑战第 3 层「沉默祭坛」:首通胜利可领取奖励。"
- Left: slim frosted panel "章节" with 5 chapter rows: 暗影之堡 (selected, champagne), 灰烬圣堂, 血月荒原, 霜骨长城, 虚空港湾.
- Centre/right: a large painted map of a dark volcanic badland (matte, desaturated, faint dull ember cracks only, NOT glowing lava everywhere), small title at top "暗影之堡 · 第一章"; a winding path with 9 round stage nodes numbered 1-9: nodes 1 and 2 cleared (small check mark, muted), node 3 current (champagne ring, slightly larger), nodes 4-9 locked (dim grey).
- Bottom-right floating frosted card: "沉默祭坛", grey "推荐战力 879 · 当前 1626 · 可挑战" (可挑战 in soft green), primary button "编队确认"; just above the card a small translucent pill button with a small crystal icon "守卫水晶".
""",
    'crystal': """SCREEN: "守卫水晶" (guardian crystal upgrade), full screen.
- Top bar: back arrow + title "守卫水晶"; right: currency chips "金币 4.7M", "守卫晶核 4", close (X).
- Left (about 35% width): the crystal illustration - a blue crystal cluster held by a dark iron stand, painted, matte, only a soft inner light, NO big glow, NO sparkles; under it a level plate "Lv.1", a thin progress bar "1 / 30 级", small grey "Lv.5 解锁第 3 个法术格".
- Right top: segmented tabs "水晶升级" (selected) | "法术装备 2/2".
- Right panel: header "水晶属性提升" with grey subtitle "每一次升级,都让水晶在黑暗中更加璀璨"; column headings "Lv.1 → Lv.2"; 6 rows, each with a small monochrome muted-gold icon: 水晶生命 +0% → +2% (+2%); 开局金币 +0 → +5 (+5); 法术强度 +0% → +2% (+2%); 开局能量 +0 → +2 (+2); 能量上限 150 本级不变; 法术格数 2 格 本级不变 (new values in soft green, "本级不变" grey).
- Bottom: a cost strip "升级消耗  金币 300   守卫晶核 4/5" (the 4 in muted red), small grey "守卫晶核:冒险关卡首次通关、每日副本胜利获得"; on the right the primary button "升级至 Lv.2".
""",
    'town': """SCREEN: the town HUD over the live game scene. IMPORTANT: keep the game scene from the SECOND image EXACTLY (the isometric dark cobblestone plaza, the bronze compass disc with the cyan rune teleport circle, the chibi heroes standing on it, the notice board, the guild hall building, the lamp posts) - only redesign the HUD overlay in the approved style, small and unobtrusive:
- Top-left: circular minimap (about 150px) as a frosted dark glass disc with a thin faint white ring (no heavy gold ring), simple dark top-down map with tiny monochrome building marks and a champagne player arrow; a small frosted label "主城" under it; next to its lower right a small round frosted button with a small portal icon and tiny label "传送".
- Under the minimap: a minimal quest tracker without a panel: small champagne diamond + "荒原的威胁 0/5", under it smaller grey "Lv.10 可接 · 去村外林地升级".
- Top-right: a row of 4 small round frosted icon buttons with tiny labels under them: 召唤, 商店, 邮件 (small red dot), 终端.
- Near the leader hero: one slim frosted interaction pill "传送 · 世界地图" with a small key hint "F" on its left, and a dimmer pill "查看 · 公告板" under it.
- Bottom-left: a subtle translucent frosted joystick (thin ring + small knob).
- Nothing else on screen (no currency bar, no portrait frame, no bottom dock).
""",
}

if __name__ == '__main__':
    for key, body in SCREENS.items():
        with open(os.path.join(HERE, f'{key}_b.txt'), 'w', encoding='utf-8') as f:
            f.write(HEAD + body + EXTRA)
    print('wrote', ', '.join(SCREENS))
