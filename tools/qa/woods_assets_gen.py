# -*- coding: utf-8 -*-
"""村外林地 v3 素材(2026-10-29 用户确认:林地按晨风村 v3 的写实流程重做):
从林地原型 woods_overview.png(1808×870)按 SPEC 裁局部当参考,逐件让 Codex 按原图写实风格重画(浅灰平底),
之后 woods_install_assets.py 抠图入库。提示词模板与晨风村共用(village3_assets_gen)。已有的跳过,可断点续跑。
用法:python tools/qa/woods_assets_gen.py [名字...]
产物:周报截图/2026-10-29_新手村设计/woods_src/w3_<名字>.png
"""
import os
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from village3_assets_gen import FLAT, GROUND, STAND, size_of  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, '周报截图', '2026-10-29_新手村设计')
REF = os.path.join(D, 'woods_overview.png')
OUT = os.path.join(D, 'woods_src')

# 名字: (类型 S 立物 / F 贴地 / G 底纹 / D 贴花, 原型裁框, 描述)
SPEC = {
    # 入口营地
    'camp_tent': ('S', (0, 580, 105, 695), 'the canvas expedition tent with wooden poles and ropes'),
    'camp_palisade': ('S', (95, 590, 330, 690), 'ONE straight section of the sharpened wooden log palisade wall with a small watch post'),
    'camp_banner': ('S', (325, 715, 375, 835), 'the tall wooden pole with a long red war banner with a white emblem'),
    'camp_crates': ('S', (270, 740, 335, 805), 'the small pile of wooden supply crates and a barrel'),
    'camp_plaza': ('F', (0, 690, 330, 870), 'the flagstone and packed-earth camp yard seen from above (ground only); REMOVE the glowing teleport circle (plain flagstones there), tents, fences, banners and people'),
    # 幼鼠窝 / 蛛巢 / 猎人营地
    'rat_log': ('S', (285, 395, 425, 495), 'the big hollow fallen tree log lying on the ground (a rat nest), with moss and roots'),
    'spider_den': ('S', (865, 75, 1115, 235), 'the rocky cave mouth and boulders covered with thick white spider webs'),
    'hunter_tent': ('S', (1285, 300, 1400, 410), "the hunters' canvas lean-to tent with furs and tools"),
    'hunter_rack': ('S', (1395, 300, 1500, 410), 'the wooden hide-drying rack frame with stretched animal skins'),
    'campfire': ('S', (1415, 385, 1485, 435), 'the stone-ringed burning campfire with logs'),
    # 古树遗迹
    'ancient_tree': ('S', (1145, 420, 1345, 690), 'the huge ancient gnarled tree with a massive trunk, sprawling roots and a broad dark green crown'),
    'ruin_arch': ('S', (985, 445, 1135, 565), 'the ruined mossy stone archway with broken columns'),
    'ruin_wall': ('S', (1325, 585, 1465, 755), 'the crumbling mossy stone ruin wall with an arched doorway and fallen blocks'),
    'ruin_pillar': ('S', (1445, 555, 1505, 665), 'ONE weathered standing stone pillar with carvings and moss'),
    'crystal_pillar': ('S', (935, 640, 1005, 705), 'the stone pedestal with a floating glowing blue crystal on top'),
    'ruins_floor': ('F', (950, 600, 1310, 790), 'the overgrown ancient ruin courtyard floor seen from above (ground only): cracked mossy flagstones, low broken stone steps, grass in the cracks; remove the tree, walls, pillars and crystals'),
    # 熊穴
    'bear_den': ('S', (1495, 0, 1765, 195), 'the bear den: a dark cave entrance in a grey rock cliff with a huge carved bear head above it and two torches'),
    'bones': ('S', (1445, 95, 1545, 185), 'the big animal skeleton ribcage and bones lying on the ground'),
    # 地形
    'cliff_falls': ('F', (200, 0, 700, 245), 'the tall grey rock cliffs with the big waterfall plunging into a misty pool, as a terrain piece'),
    'river_a': ('F', (395, 195, 805, 445), 'the rocky mountain stream with stepped cascades and boulders, as a ground piece; remove the trees'),
    'river_b': ('F', (695, 440, 905, 645), 'the stream with small waterfalls between mossy rock ledges, as a ground piece; remove the bridge and trees'),
    'river_c': ('F', (415, 600, 725, 870), 'the stream winding through a rocky gully with small rapids, as a ground piece; remove the trees'),
    'bridge': ('F', (715, 395, 865, 475), 'the rustic wooden plank footbridge with rope-and-post railings; ONLY the bridge itself'),
    'cliff_ne': ('F', (1640, 170, 1808, 430), 'the grey rock cliff edge dropping into a misty gorge on the east side, as a terrain piece; remove the trees'),
    # 杂物
    'chest': ('S', (700, 130, 748, 178), 'ONE wooden treasure chest with gold metal bands (closed)'),
    'rock_big': ('S', (585, 615, 705, 725), 'the large mossy grey rock outcrop with ferns'),
    'rock_small': ('S', (55, 325, 135, 395), 'the small cluster of mossy grey boulders'),
    'stump': ('S', (1700, 180, 1770, 230), 'ONE old cut tree stump with roots and moss'),
    # 植被
    'tree_pine': ('S', (140, 30, 215, 150), 'ONE single tall dark green spruce / fir tree (only one tree)'),
    'tree_oak': ('S', (215, 270, 330, 400), 'ONE single broad dark-green forest oak tree with a thick trunk (only one tree)'),
    'tree_autumn': ('S', (85, 420, 185, 525), 'ONE single tree with orange and golden autumn leaves (only one tree)'),
    'fern': ('S', (1180, 590, 1240, 640), 'ONE lush clump of green forest ferns'),
    'mushrooms': ('S', (1090, 650, 1140, 690), 'ONE small cluster of brown forest mushrooms with moss'),
    # 底纹 / 贴花
    'ground': ('G', (820, 300, 960, 380), ''),
    'decal_leaves': ('D', (1500, 260, 1640, 340), 'an irregular patch of fallen brown and orange leaves and twigs on the forest floor'),
    'decal_moss': ('D', (760, 500, 860, 560), 'a low cluster of half-buried mossy grey stones nestled in dark moss and small ferns'),
    'decal_roots': ('D', (1200, 640, 1300, 700), 'a patch of gnarled tree roots snaking over mossy forest soil'),
}

FOREST_GROUND = """Image 1 is a close crop of the forest floor of a fantasy woodland map (high 3/4 bird's-eye view, realistic painterly).
Paint a SEAMLESS TILEABLE square ground texture of that woodland floor, REALISTIC (like a high-end PC isometric RPG such as Diablo / Path of Exile, not a mobile cartoon game):
- mix of short dark-green forest grass and moss with patches of brown soil, a few tiny leaves and twigs, natural shadowed depth;
- colour: natural muted deep olive / moss green with warm brown soil, slightly darker than a sunny meadow — NOT saturated, NOT flat;
- even density (no big objects, no paths, no large stones), so it repeats without obvious features.
It must tile perfectly on all four edges. Output 1024x1024."""

DECAL = """Image 1 is a crop of a fantasy woodland map (high 3/4 bird's-eye view, realistic painterly). Paint ONE flat ground decal: {desc}, realistic natural colours like image 1, crisp detail, lying flat seen from the same high angle. The patch fills about 65% of the image; outside it is a perfectly flat plain light grey background (#c8c8c8); soft ragged natural edge, no hard outline, no shadow. Output 1536x1024."""


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    names = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    ref = Image.open(REF).convert('RGB')
    gen = os.path.join(ROOT, 'tools', 'qa', 'gen_proto.py')
    for name, (kind, box, desc) in SPEC.items():
        if names and name not in names:
            continue
        out = os.path.join(OUT, f'w3_{name}.png')
        if os.path.exists(out):
            continue
        crop = ref.crop(box)
        k = 1024 / max(crop.size)
        crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
        crop_path = os.path.join(OUT, f'ref_{name}.png')
        crop.save(crop_path)
        if kind == 'G':
            prompt = FOREST_GROUND
        elif kind == 'D':
            prompt = DECAL.format(desc=desc)
        else:
            prompt = (STAND if kind == 'S' else FLAT).format(desc=desc, size=size_of(box)).replace('a fantasy village map', 'a fantasy woodland map')
        prompt_path = os.path.join(OUT, f'p_{name}.txt')
        with open(prompt_path, 'w', encoding='utf-8') as f:
            f.write(prompt)
        print('gen', name, flush=True)
        res = subprocess.run([sys.executable, gen, '--prompt', prompt_path, '--out', out, '--ref', crop_path], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        lines = (res.stdout or res.stderr or 'no output').strip().splitlines()
        print('  ', lines[-1][:90] if lines else '', flush=True)


if __name__ == '__main__':
    main()
