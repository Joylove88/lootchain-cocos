# -*- coding: utf-8 -*-
"""晨风村 v3 素材(2026-10-29 用户:当前偏卡通;按我提供的鸟瞰图出素材):
从用户鸟瞰图 overview_ref.png(2000×967)按 SPEC 裁出每件的局部当参考,逐件让 Codex 按原图的写实风格单独重画,
浅灰平底 #c8c8c8(之后 village3_install_assets.py 抠图入库)。已有的跳过,可断点续跑。
用法:python tools/qa/village3_assets_gen.py [名字...]
产物:周报截图/2026-10-29_新手村设计/v3_src/v3_<名字>.png
"""
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, '周报截图', '2026-10-29_新手村设计')
REF = os.path.join(D, 'terrain_1to1', 'overview_ref.png')
OUT = os.path.join(D, 'v3_src')

# 名字: (类型, 原图裁框 x0,y0,x1,y1, 描述)
# 类型 S = 立物(建筑 / 树 / 小物,站在地上,人能走到它后面);F = 贴地件(水 / 广场 / 菜地 / 悬崖,画成从上往下看的一块地皮)
SPEC = {
    'chapel': ('S', (320, 0, 500, 250), 'the small stone chapel with a tall slate spire and arched windows'),
    'altar': ('S', (415, 185, 665, 305), 'the round stone summoning altar: circular stepped stone platform with a glowing blue crystal in the middle and blue-banner stone pillars around it'),
    'chief_house': ('S', (780, 0, 1190, 290), "the village chief's large timber-framed manor with slate roofs, standing on its raised stone terrace with the wide stone stairs leading down at the front right"),
    'training': ('S', (1250, 90, 1850, 380), 'the training ground: a large dirt yard enclosed by a wooden palisade fence, two wooden watch towers with blue banners, straw training dummies, an archery target and weapon racks'),
    'windmill': ('S', (120, 260, 390, 565), 'the stone windmill with four wooden lattice sails on its round stone base wall'),
    'watermill': ('S', (550, 540, 770, 670), 'the wooden water mill with its big water wheel, a small vegetable garden and a lean-to shed'),
    'shed_a': ('S', (460, 470, 560, 545), 'the small wooden shed with a plank roof'),
    'shed_b': ('S', (1190, 330, 1310, 425), 'the small timber cottage with a slate roof'),
    'smithy': ('S', (1490, 380, 1810, 610), "the blacksmith's workshop: big stone-and-timber building with a tall stone chimney, glowing forge under an open awning, anvil, carts and tools"),
    'market_house': ('S', (1230, 460, 1450, 610), 'the timber-framed house with a striped cloth market awning and goods in front'),
    'house_w': ('S', (880, 640, 1070, 810), 'the timber-framed cottage with a slate roof and a small fenced porch'),
    'house_s': ('S', (1360, 720, 1560, 870), 'the stone-and-timber cottage with a dark slate roof and a chimney'),
    'shed_sw': ('S', (420, 700, 570, 830), 'the small wooden farm shed with a slate roof and tools'),
    'gate': ('S', (1620, 720, 1760, 840), 'the village gate: a wooden arch frame with two hanging lanterns and a hanging wooden sign, short fence pieces on both sides'),
    'wheat': ('S', (0, 620, 410, 840), 'the golden wheat field plots divided and surrounded by low wooden fences, with two scarecrows'),
    'hay': ('S', (670, 820, 800, 890), 'the stacked hay bales and wooden crates'),
    'tree_oak': ('S', (150, 160, 310, 310), 'ONE single broad leafy oak tree (only one tree, full crown and trunk)'),
    'tree_pine': ('S', (80, 190, 175, 300), 'ONE single tall dark green pine / fir tree (only one tree)'),
    'bush': ('S', (520, 20, 610, 90), 'ONE round leafy green shrub with small white flowers'),
    'plaza': ('F', (1090, 600, 1400, 760), 'the round flagstone village square seen from above (ground only): concentric rings of worn flagstones; REMOVE the glowing teleport fountain in the middle (leave plain flagstones there), remove banners, lamps and people'),
    'veg': ('F', (350, 770, 580, 860), 'the vegetable garden beds seen from above (ground only): rows of cabbages, pumpkins and greens in dark soil; remove the fences'),
    'bridge': ('F', (840, 350, 1130, 490), 'the arched wooden footbridge with railings and small lanterns, seen from the same high angle; ONLY the bridge itself (remove the water, rocks and trees around it)'),
    'river_w': ('F', (80, 280, 500, 480), 'the winding stream with mossy rocky banks and small cascades, as a ground piece; remove the windmill, trees, people and labels; the stream ends fade out softly at the left and right'),
    'river_c': ('F', (440, 320, 1020, 570), 'the central river basin with mossy boulders, rocky banks and white rapids, as a ground piece; remove the bridge, trees, buildings, labels and "?" marks (river water continues where the bridge was)'),
    'falls': ('F', (620, 470, 920, 730), 'the stepped waterfall cascading down between rock ledges into a pool, as a ground piece; remove the water mill, trees and buildings'),
    'east_cliff': ('F', (1790, 100, 2000, 640), 'the eastern edge of the plateau: tall grey rock cliffs dropping into a misty gorge with a river and waterfalls, as a ground piece; remove the small bridge, trees and buildings'),
    'cliff_s': ('F', (240, 830, 720, 967), 'the southern edge of the plateau: grey rocky cliff face dropping into mist, as a ground piece; remove the trees'),
    'nw_falls': ('F', (0, 0, 330, 300), 'the north-west corner: rock cliffs with tall waterfalls and mist, as a ground piece'),
    'grass_tuft': ('S', (600, 290, 700, 340), 'ONE small clump of tall natural meadow grass blades with two or three tiny white and yellow wildflowers (only this one clump)'),
    'ground': ('G', (560, 230, 780, 330), ''),
}

STAND = """Image 1 is a crop from a fantasy village map (high 3/4 bird's-eye view). Recreate {desc} as ONE isolated 2D game asset.
- Same design, shape, materials, colours and proportions as in image 1, same high 3/4 viewing angle. Recreate it faithfully, do not redesign it.
- Remove everything else around it (other buildings, trees, people, text labels, "?" marks).
- Style: realistic painterly fantasy like image 1, warm morning sunlight from the upper left, natural slightly muted colours, crisp fine detail at full resolution. NOT cartoon, NOT glossy toy-like, NOT over-saturated.
- Centered with generous margin on a perfectly flat plain light grey background (#c8c8c8), only a soft contact shadow at its base. No text, no frame.
- Output {size}."""

FLAT = """Image 1 is a crop from a fantasy village map (high 3/4 bird's-eye view). Recreate {desc}.
- Keep its shape, layout and colours like image 1, same viewing angle; it lies flat on the ground and will be placed on a grass map as a ground decal.
- Style: realistic painterly fantasy like image 1, warm morning light, natural muted colours, crisp fine detail at full resolution. NOT cartoon.
- Everything outside the piece is a perfectly flat plain light grey background (#c8c8c8); the piece's outer edge is a soft natural grass / rock / dirt border (no hard rectangle edge). No text.
- Output {size}."""

GROUND = """Image 1 is a crop of the meadow ground of a fantasy village map (high 3/4 bird's-eye view).
Paint a SEAMLESS TILEABLE square ground texture of that meadow: natural sunlit grass with soft large patches of slightly warmer and cooler green and a few small dry patches, in the same realistic painterly style and colours as image 1 (natural, slightly muted, NOT saturated cartoon green).
Low detail density: no flowers, no stones, no leaves, no paths, no objects, no strong noise — it must stay calm and smooth when repeated.
The texture must tile perfectly on all four edges. Output 1024x1024."""


def size_of(box) -> str:
    w, h = box[2] - box[0], box[3] - box[1]
    r = w / h
    return '1536x1024' if r > 1.25 else '1024x1536' if r < 0.8 else '1024x1024'


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    names = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    ref = Image.open(REF).convert('RGB')
    gen = os.path.join(ROOT, 'tools', 'qa', 'gen_proto.py')
    for name, (kind, box, desc) in SPEC.items():
        if names and name not in names:
            continue
        out = os.path.join(OUT, f'v3_{name}.png')
        if os.path.exists(out):
            continue
        crop = ref.crop(box)
        # 小裁块先放大到长边 1024,参考图细节看得清
        k = 1024 / max(crop.size)
        crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
        crop_path = os.path.join(OUT, f'ref_{name}.png')
        crop.save(crop_path)
        tpl = GROUND if kind == 'G' else STAND if kind == 'S' else FLAT
        prompt = tpl.format(desc=desc, size=size_of(box))
        prompt_path = os.path.join(OUT, f'p_{name}.txt')
        with open(prompt_path, 'w', encoding='utf-8') as f:
            f.write(prompt)
        print('gen', name, flush=True)
        res = subprocess.run([sys.executable, gen, '--prompt', prompt_path, '--out', out, '--ref', crop_path], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        lines = (res.stdout or res.stderr or 'no output').strip().splitlines()
        print('  ', lines[-1][:90] if lines else '', flush=True)


if __name__ == '__main__':
    main()
