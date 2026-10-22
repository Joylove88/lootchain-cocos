# 用法:MAT_WORK=<工作目录> python tools/qa/material_icon_gen.py [名字...];需要 gen_proto.py 在 MAT_WORK/../../../gen(见 codex-image-gen 记忆)
# 材料图标去 AI 感(2026-10-22 用户定 A 方案,21 张全部重做;顺序跑,单张 40~130s;已有的跳过)
import os, subprocess, sys
HERE = os.environ.get('MAT_WORK') or os.path.dirname(os.path.abspath(__file__))  # 工作目录(raw/ out/);默认脚本所在目录
GEN = os.path.join(HERE, '..', '..', '..', 'gen', 'gen_proto.py')
P = r'D:\project\lootchain-cocos\assets\resources\ui'
BAG = os.path.join(P, 'bag', 'ai')
FORGE = os.path.join(P, 'forge', 'ai')
SAMPLES = [
    ('mat_enhance_stone', os.path.join(BAG, 'icon_enhance_low.png'), 'a dark charcoal whetstone-like enhancement stone engraved with glowing red runes'),
    ('mat_bless_stone', os.path.join(FORGE, 'icon_bless_stone.png'), 'a violet amethyst crystal blessing stone bound with a thin gold filigree band'),
    ('mat_reroll_stone', os.path.join(BAG, 'icon_reroll_stone.png'), 'a dark slate reroll stone carved with a blue spiral rune'),
    ('mat_exp_book', os.path.join(BAG, 'icon_expbook.png'), 'a thick leather-bound hero experience tome with a gold arcane sigil on the cover'),
    ('mat_ticket_hero', os.path.join(BAG, 'icon_ticket_hero.png'), 'a parchment hero contract scroll with a red wax seal and gold trim'),
    ('mat_shard_ssr', os.path.join(BAG, 'icon_shard_ssr.png'), 'a cluster of golden topaz crystals with a small gold puzzle-piece fragment'),
    ('mat_enhance_high', os.path.join(BAG, 'icon_enhance_high.png'), 'an elongated obsidian-black high-grade enhancement stone split by bright red molten rune cracks'),
    ('mat_guard_rune', os.path.join(FORGE, 'icon_guard_rune.png'), 'a bronze heater-shield shaped protective amulet with a hanging ring and an engraved golden rune'),
    ('mat_luck_stone', os.path.join(BAG, 'icon_luck_stone.png'), 'a faceted emerald green gem set in a thin gold frame with a small gold four-leaf clover inside'),
    ('mat_reforge_stone', os.path.join(BAG, 'icon_reforge_stone.png'), 'a jagged dark crimson-black abyss crystal shard with deep red inner veins'),
    ('mat_awaken_stone', os.path.join(BAG, 'icon_awaken_stone.png'), 'a dark obsidian orb cracked open with thin seams of molten gold light'),
    ('mat_boss_mark', os.path.join(BAG, 'icon_boss_mark.png'), 'a round dark iron medallion embossed with a horned demon face with red eyes'),
    ('mat_guard_core', os.path.join(BAG, 'icon_guard_core.png'), 'a cluster of pale icy-blue quartz crystals rising from a small rock base'),
    ('mat_regression', os.path.join(BAG, 'icon_regression.png'), 'an ornate antique hourglass with a dark bronze frame and violet sand'),
    ('mat_ticket_normal', os.path.join(BAG, 'icon_ticket_normal.png'), 'a rolled aged parchment contract scroll tied with a red wax seal'),
    ('mat_ticket_limited', os.path.join(BAG, 'icon_ticket_limited.png'), 'a rolled crimson parchment contract scroll with a red ribbon and red wax seal'),
    ('mat_gold_chest', os.path.join(BAG, 'icon_gold_chest.png'), 'an iron-bound dark wooden treasure chest, lid open, filled with gold coins, a few coins spilled in front'),
    ('mat_shard_n', os.path.join(BAG, 'icon_shard_n.png'), 'a cluster of grey-silver quartz crystals with a small silver puzzle-piece fragment'),
    ('mat_shard_r', os.path.join(BAG, 'icon_shard_r.png'), 'a cluster of sapphire blue crystals with a small blue puzzle-piece fragment'),
    ('mat_shard_sr', os.path.join(BAG, 'icon_shard_sr.png'), 'a cluster of amethyst purple crystals with a small purple puzzle-piece fragment'),
    ('mat_shard_ur', os.path.join(BAG, 'icon_shard_ur.png'), 'a cluster of ruby red crystals with a small red puzzle-piece fragment'),
]
TEMPLATE = (
    "Image 1 is our current game item icon: {desc}. Redraw the SAME item (same object, silhouette, materials and colors) as a new "
    "1024x1024 square game item icon in a calm, grounded, painterly-realistic style that matches dark fantasy ARPG inventories. "
    "{extra}Remove every flashy effect: NO glowing colored haze, NO magic swirls or energy trails, NO sparkles, NO light rays, NO particle dust, "
    "NO lens flare. Any rune or gem may keep only a soft self-glow confined strictly to its own surface. Single consistent soft key light "
    "from the top-left, gentle contact shadow under the object. Background: a flat, matte, near-black charcoal plane (exactly #15151a) "
    "filling the whole square, completely uniform, no vignette, no gradient, no frame, no border line. Object centered, filling about 70% "
    "of the square, fully inside with margin on all sides. Fully opaque. No text, no letters, no numbers, no watermark. "
    "Only generate the image; do not run any shell commands, do not copy or save files."
)
SHARD_EXTRA = (
    "Image 2 is the already-redrawn golden version of the same shard icon: match its exact composition, crystal arrangement, camera angle, "
    "puzzle-piece placement, scale and lighting, changing only the color. "
)
out_dir = os.path.join(HERE, 'raw'); os.makedirs(out_dir, exist_ok=True)
SHARD_REF = os.path.join(out_dir, 'mat_shard_ssr.png')
only = set(sys.argv[1:])
for name, ref, desc in SAMPLES:
    if only and name not in only:
        continue
    out = os.path.join(out_dir, name + '.png')
    if os.path.exists(out):
        print('skip', name, flush=True); continue
    shard = name.startswith('mat_shard_') and name != 'mat_shard_ssr'
    refs = [ref] + ([SHARD_REF] if shard else [])
    pf = os.path.join(out_dir, name + '.txt')
    open(pf, 'w', encoding='utf-8').write(TEMPLATE.format(desc=desc, extra=SHARD_EXTRA if shard else ''))
    r = subprocess.run([sys.executable, GEN, out, pf] + refs, capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(name, (r.stdout or r.stderr).strip()[-200:], flush=True)
print('ALL DONE', flush=True)
