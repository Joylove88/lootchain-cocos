"""英雄详情 装备 / 技能 / 升星 三个页签的 B 风格原型提示词(2026-10-28,属性页 hero_b2 已确认)。
用法:python tools/qa/proto_prompts/ui_v4/build_hero_tabs.py → 同目录 hero_<tab>_b.txt
生成:python tools/qa/gen_proto.py --prompt hero_<tab>_b.txt --out proto/hero_<tab>_b.png --ref proto/hero_b2.png before/hero_<tab>.png
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

HEAD = """Generate ONE image: a finished UI mockup for a dark-fantasy mobile RPG, landscape phone 20:9 (about 1870x841).
TWO images are attached:
- FIRST image = our APPROVED hero detail screen, "属性" (attributes) tab. Keep EXACTLY the same: background, the hero art (red-haired dark queen with a scythe) and her position, the name plate under her, the top bar (back arrow + "英雄", currency chips, close X), the left vertical tab list style, the frosted dark glass panel style (soft rounded corners, thin faint white outline), fonts, colours, the muted-gold flat stat icons, the champagne-gold primary pill button and the slate-grey secondary pill button.
- SECOND image = our CURRENT (old style) version of this tab. Use it ONLY to know which information and controls exist; do NOT copy its red ribbon banners, spiky gold frames or glowing icons.
Change ONLY: the selected tab in the left list, and the content of the RIGHT column (same right column area as the first image: x about 1191..1829, below the top bar). The right column must use the same frosted glass panels with small section headers (thin champagne vertical bar + white title, optional grey "xxx ›" text link on the right), the same spacing rhythm, and the same text colours (white values, light grey-blue labels).
All text in Simplified Chinese exactly as written below; crisp and legible. No glow, no sparkles, no red banners, no ornate frames.
"""

TABS = {
    'equip': """Selected tab: "装备" (the 装备 tab gets the muted-gold selected pill; 属性 becomes a normal tab).
Also show the 6 equipment slots around the hero art (keep the hero visible): three small rounded-square frosted glass slots on each side of the hero, connected to her by faint thin lines. Left side top to bottom: 头盔, 胸甲, 鞋子; right side top to bottom: 武器, 戒指, 项链. Each empty slot shows a faint white line drawing of the part and small grey text "点击穿戴"; the 武器 slot is equipped: a small dagger icon with a thin grey rarity line at the bottom and tiny text "+0".
RIGHT column:
1) Panel "装备" with two small pills on the right of the header: secondary "一键穿戴" and secondary "一键卸下". Under the header a row of 6 segmented tabs: 武器 (selected, champagne), 头盔, 胸甲, 鞋子, 戒指, 项链.
2) Below, split into two parts inside the same panel: on the left a short list of wearable items (each row: small item icon in a rounded square, name, small sword icon + "战力 2"): one row "粗铁短剑" selected with a champagne outline; on the right a detail card: larger item icon, name "粗铁短剑", grey "普通 · +0", a thin divider, a stat row with a muted-gold sword icon "攻击  +1", and a highlighted line "战力 +2" in soft green.
3) Bottom of the right column: secondary pill "强化" and primary pill "穿戴".""",
    'skill': """Selected tab: "技能".
RIGHT column, one tall frosted panel "技能" containing a vertical list of skill cards (each card = slightly lighter glass row with rounded corners):
1) Ultimate card (larger, first): a round skill emblem icon on the left (keep it painted but matte), title "夜烬·焚世之焰", a small grey pill tag "大招 · Lv.5/5" next to the title, description in grey (2 lines): "守卫战 2★ 解锁；蓄满后点击英雄手动释放伤害 +25%，不点自动释放。每升 1 级伤害 +10%。", and on the right a small secondary pill "升级".
2) Passive card: round emblem with a small lock badge, title "能量护盾", grey pill tag "★3 解锁 · 单体", grey description "每波开始为守卫水晶套一层护盾（约本英雄生命的 18%），水晶受击先扣盾。" — the whole card slightly dimmed (locked).
3) Passive card: round emblem with lock badge, title "生命强化", grey pill tag "★6 解锁 · 常驻", grey description "最大生命提升 15%，解锁后战斗中永久生效。" — slightly dimmed (locked).
Leave calm empty space below the cards inside the panel.""",
    'star': """Selected tab: "升星". In the top bar the second currency chip shows a small purple shard icon and "20" instead of the diamond.
RIGHT column:
1) Panel "升星": a comparison row: left box "★ 1星" (white star), a small champagne "›››" arrow in the middle, right box "★★ 2星" highlighted with a champagne outline; below it one row with a small lock icon: "觉醒" in white, grey "大招上限 Lv.5 → Lv.10 · 属性增强", and on the right a small grey pill "★10 解锁".
2) Panel "升星解锁": two rows, each with a small round lock icon, a white title and grey description, and a small grey pill on the right: "能量护盾" / "每波开始为守卫水晶套一层护盾（约本英雄生命的 18%），水晶受击先扣盾。" / "★3 解锁"; "生命强化" / "最大生命提升 15%，解锁后战斗中永久生效。" / "★6 解锁".
3) Bottom panel (same style as the "升级" block of the first image): title "升至 2★" (with "2★" in champagne), cost row "碎片 20/20" (small purple shard icon) and "金币 10,000" (coin icon), a small grey hint on the right "可一键升至 2 星"; then two buttons: secondary "一键升星" (left) and primary "升星" (right).""",
}

TAIL = "\nOutput only the single finished mockup image, no annotations.\n"

if __name__ == '__main__':
    for key, body in TABS.items():
        with open(os.path.join(HERE, f'hero_{key}_b.txt'), 'w', encoding='utf-8') as f:
            f.write(HEAD + body + TAIL)
    print('wrote', ', '.join(TABS))
