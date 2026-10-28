"""锻造 合成 / 分解 / 宝石 三个页签的 B 风格原型提示词(2026-10-28,强化页 forge_b 已确认)。
用法:python tools/qa/proto_prompts/ui_v4/build_forge_tabs.py → 同目录 forge_<tab>_b.txt
生成:python tools/qa/gen_proto.py --prompt forge_<tab>_b.txt --out proto/forge_<tab>_b.png --ref proto/forge_b.png proto/hero_equip_b.png before/forge_<tab>.png
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

HEAD = """Generate ONE image: a finished UI mockup for a dark-fantasy mobile RPG, landscape phone 20:9 (about 1870x841).
THREE images are attached:
- FIRST image = our APPROVED forge screen, "强化" (enhance) tab. Keep EXACTLY the same: dark blurred forge background, the top bar (back arrow + page title + small "?" help on the left; currency chips + close X on the right), the slim vertical tab rail on the far right (强化 / 合成 / 分解 / 宝石 with icons), the frosted dark glass panel style (soft rounded corners, thin faint white outline), fonts, colours, the champagne-gold primary pill button and the slate-grey secondary pill button.
- SECOND image = another APPROVED screen: use it for the exact look of small components — item slots (one rounded frosted frame around the item icon, no double frames), segmented tabs, grey outlined tag pills with light fill, list rows with a champagne outline when selected.
- THIRD image = our CURRENT (old style) version of this tab. Use it ONLY to know which information and controls exist; do NOT copy its red ribbon banners, spiky gold frames, glowing blue slots or glowing icons.
Change ONLY the page title, the selected tab in the right rail, and the content area. All text in Simplified Chinese exactly as written below; crisp and legible. No glow, no sparkles, no red banners, no ornate frames. Item icons muted and matte; rarity shown only as a thin coloured line or small coloured text, never glowing frames.
"""

TABS = {
    'fuse': """Page title: "合成". Selected rail tab: 合成. Currency chips: "金币 62,730", "合成概率石 0".
LEFT/CENTRE (about 58% width): a calm frosted stage. In the middle a large result slot (rounded frosted square, about 150px) showing a faint "?" and under it grey text "放入材料后预览产物"; around it three equal material slots (rounded frosted squares about 110px with a thin "+" in the centre): one above-left, one above-right, one below — connected to the centre by faint thin lines. Below: one line of small grey text "从右侧列表点一组,或用「一键放入」自动装填 3 件". Then a row with a small checkbox, a small green-crystal icon, "合成概率石 +20%(上限 95%)" and on the right a small tag pill "×0". Bottom: secondary pill "一键放入" and primary pill "合成".
RIGHT panel (about 34% width): header "可合成装备" with a small grey link "规则 ›"; a short list of rows (each: small item icon in one rounded frame, "武器 · 白装 ×1", and on the right a small grey tag pill "不足 3 件"); a second row "胸甲 · 蓝装 ×3" with a small green tag pill "可合成" and a champagne outline (selected).""",
    'decompose': """Page title: "分解". Selected rail tab: 分解. Currency chips: "金币 62,730", "强化石 0", "祝福石 0", "护符 0".
LEFT panel (about 62% width): two filter rows of small segmented chips: "稀有度" — 全部 (selected, champagne), 白装, 绿装, 蓝装, 紫装, 橙装, 红装 (each chip label in its rarity colour, muted); "强化状态" — 全部 (selected), 未强化, 已强化. Below a tidy 8-column grid of square item slots (one rounded frosted frame each, muted item icon, a thin rarity line at the bottom, small name under it), 10 items shown, two of them selected with a champagne outline and a small check mark in the corner. Bottom right of the panel: secondary pill "一键全选" and secondary pill "清空".
RIGHT panel (about 30% width): header "分解概览"; a big number row "已选装备  2 /20 件" (the 2 in champagne, large); section "预计获得" with one row: small enhance-stone icon "强化石" and a big "8"; section "可能获得材料" with two small cells: "祝福石 ×0", "护符 ×0"; one line of small grey hint text "高品质装备分解可获得更多材料". Bottom: secondary pill "批量设置" and primary pill "分解".""",
    'gem': """Page title: "宝石". Selected rail tab: 宝石. Currency chips: "金币 62,730", "碎·焰锋石 2", "碎·赤魂石 2".
LEFT panel (about 40% width): header "可镶嵌装备" with a small grey hint "绿装起开孔"; a list of rows (each: small item icon in one rounded frame, item name, small grey "已镶 1/3 孔", and a thin rarity line); first row "灼世角盔 +2" selected with a champagne outline; a few more rows.
RIGHT panel (about 52% width): header "宝石镶嵌"; at the top centre the selected item icon in a rounded frosted frame with its name "灼世角盔 +2" and grey "紫装 · 3 孔"; below a row of 3 round socket slots (frosted circles): socket 1 filled with a small red gem icon and label "碎·焰锋石 攻击 +12"; sockets 2 and 3 empty with a thin "+" and grey "2 阶宝石" / "3 阶宝石"; under the sockets a small grey hint "第 i 孔镶 i 阶宝石;低阶宝石 3 合 1 升阶(背包 → 合成)". Bottom: secondary pill "卸下宝石" and primary pill "镶嵌".""",
}

TAIL = "\nOutput only the single finished mockup image, no annotations.\n"

if __name__ == '__main__':
    for key, body in TABS.items():
        with open(os.path.join(HERE, f'forge_{key}_b.txt'), 'w', encoding='utf-8') as f:
            f.write(HEAD + body + TAIL)
    print('wrote', ', '.join(TABS))
