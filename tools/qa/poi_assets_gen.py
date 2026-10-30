# -*- coding: utf-8 -*-
"""野外兴趣点素材(docs/54,2026-10-30 用户确认原型 poi_scene_b):
1. gen:逐件让 Codex 按晨风村 v3 写实风格单独画(浅灰平底 #c8c8c8),参考 = 原型局部 + vil3 同类件;已有的跳过,可断点续跑;
2. install:抠透明 + 接触阴影转半透明 → assets/resources/ui/world/poi/poi_<名字>.png + meta;
3. icons:地图页 / 小地图的白线图标(PIL 4 倍画再缩,不经 Codex)→ ui/world/mapui/map_<名字>.png。
用法:python tools/qa/poi_assets_gen.py gen|install|gen_icons|install_icons [名字...]
产物原图:周报截图/2026-10-30_野外兴趣点/src/poi_<名字>.png
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, '周报截图', '2026-10-30_野外兴趣点')
SRC = os.path.join(D, 'src')
PROTO = os.path.join(D, 'proto', 'poi_scene_b.png')
VIL3 = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'vil3')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'poi')
ICON_DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'mapui')

# 名字: (原型裁框 或 None, vil3 风格参考件, 描述)
SPEC = {
    'stele': ((1030, 290, 1150, 490), 'vil3_altar.png',
              'an old weathered standing stone stele about as tall as a person: rough grey granite slab with a rounded top, worn carved runes and a faded sun emblem, patches of green moss and a little ivy, a few small stones and grass tufts at its base'),
    'herb': (None, 'vil3_bush.png',
             'a small clump of wild medicinal herbs: bright fresh green serrated leaves on short stems with a few tiny white flowers, low and wide, clearly a plant you could pick (NOT a shrub or tree)'),
    'herb_cut': (None, 'vil3_bush.png',
                 'the same small clump of wild medicinal herbs AFTER it has been harvested: only short cut stems and a few dull wilted grey-brown leaves left close to the ground'),
    'ore': (None, 'vil3_altar.png',
            'a small rocky outcrop of grey stone, knee high, with clearly visible veins of pale blue-silver ore running through its cracks, a few loose rock chips around it'),
    'ore_cut': (None, 'vil3_altar.png',
                'the same small grey rocky outcrop AFTER it has been mined: the ore veins chipped out leaving fresh pale broken stone faces, dull and empty, more loose rubble around it'),
    'hidden': ((1420, 230, 1640, 310), 'vil3_decal_dirt.png',
               'a small patch of freshly turned dark soil on the ground, seen from the same high angle, slightly mounded, with a few clods and one tiny metallic glint peeking out, edges fading into grass'),
}

PROMPT = """Image 1 is our in-game reference (high 3/4 bird's-eye view of a realistic painted fantasy village); image 2 is one of our existing assets for the art style.
Draw {desc} as ONE isolated 2D game asset.
- Same high 3/4 viewing angle and the same realistic painterly style as the references: warm morning sunlight from the upper left, natural slightly muted colours, crisp fine detail. NOT cartoon, NOT glossy, NOT over-saturated, NO glow, NO magic light.
- Centered with generous margin on a perfectly flat plain light grey background (#c8c8c8), only a soft contact shadow at its base. No text, no frame, nothing else.
- Output a square image."""


def gen(names: set) -> None:
    os.makedirs(SRC, exist_ok=True)
    tmp = os.path.join(D, 'tmp')
    os.makedirs(tmp, exist_ok=True)
    for name, (box, style, desc) in SPEC.items():
        if names and name not in names:
            continue
        out = os.path.join(SRC, f'poi_{name}.png')
        if os.path.exists(out):
            print('skip', name)
            continue
        ref1 = os.path.join(tmp, f'ref_{name}.png')
        proto = Image.open(PROTO).convert('RGB')
        (proto.crop(box) if box else proto).save(ref1)
        prompt = os.path.join(tmp, f'prompt_{name}.txt')
        open(prompt, 'w', encoding='utf-8').write(PROMPT.format(desc=desc))
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'gen_proto.py'), '--prompt', prompt, '--out', out,
                        '--ref', ref1, os.path.join(VIL3, style)], check=False)


# 场上显示尺寸(世界单位,长边):石碑约一人高,草药 / 矿脉及膝,隐藏点是一小块地皮
SIDE = {'stele': 512, 'herb': 384, 'herb_cut': 384, 'ore': 384, 'ore_cut': 384, 'hidden': 384}
FLAT = {'hidden': 30}


def install(names: set) -> None:
    from town_install_assets import cutout, write_meta
    from village2_install_assets import feather
    from village3_install_assets import plate_of, shadowize
    os.makedirs(DST, exist_ok=True)
    for name in SPEC:
        if names and name not in names:
            continue
        path_src = os.path.join(SRC, f'poi_{name}.png')
        if not os.path.exists(path_src):
            print('missing', name)
            continue
        src = Image.open(path_src)
        im = cutout(src)
        if name not in FLAT:
            im = shadowize(im, plate_of(src))
        bbox = im.getchannel('A').getbbox()
        if bbox:
            im = im.crop(bbox)
        k = SIDE[name] / max(im.size)
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        if name in FLAT:
            im = feather(im.convert('RGBA'), FLAT[name])
        path = os.path.join(DST, f'poi_{name}.png')
        im.save(path)
        write_meta(path, f'poi_{name}', im.width, im.height)
        print('wrote', name, im.size)


# 地图图标(和 mapui 现有彩色小图标同口径,参考 map_chest):Codex 透明底出图 → 裁边缩 128
ICON_SPEC = {
    'hidden': 'a round dark slate-blue badge with a bold cream-white question mark "?" in the middle and a thin gold rim',
    'stele': 'a small weathered grey standing stone stele with a rounded top and a faint carved rune, a tuft of green moss at its base',
    'herb': 'a small sprig of bright green medicinal herb leaves with two tiny white flowers',
    'ore': 'a small grey rock chunk with pale blue-silver ore crystals sticking out of it',
}
ICON_PROMPT = """Image 1 is one of our existing map icons. Draw a NEW map icon in exactly the same style, size feel, lighting and outline as image 1: {desc}.
- One single small object, chunky readable silhouette that still reads at 30 pixels, a thin dark outline like image 1, painterly, not glossy, no glow.
- Fully TRANSPARENT background, nothing else, no text (except the "?" if asked), no frame, no shadow plate.
- Output a square image."""


def gen_icons(names: set) -> None:
    tmp = os.path.join(D, 'tmp')
    os.makedirs(tmp, exist_ok=True)
    os.makedirs(SRC, exist_ok=True)
    ref = os.path.join(tmp, 'ref_map_chest.png')
    Image.open(os.path.join(ICON_DST, 'map_chest.png')).convert('RGBA').resize((512, 512), Image.LANCZOS).save(ref)
    for name, desc in ICON_SPEC.items():
        if names and name not in names:
            continue
        out = os.path.join(SRC, f'icon_{name}.png')
        if os.path.exists(out):
            print('skip icon', name)
            continue
        prompt = os.path.join(tmp, f'prompt_icon_{name}.txt')
        open(prompt, 'w', encoding='utf-8').write(ICON_PROMPT.format(desc=desc))
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'gen_proto.py'), '--prompt', prompt, '--out', out, '--ref', ref], check=False)


def install_icons(names: set) -> None:
    from town_install_assets import write_meta
    for name in ICON_SPEC:
        if names and name not in names:
            continue
        path_src = os.path.join(SRC, f'icon_{name}.png')
        if not os.path.exists(path_src):
            print('missing icon', name)
            continue
        im = Image.open(path_src).convert('RGBA')
        bbox = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
        side = max(im.size)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        out = sq.resize((128, 128), Image.LANCZOS)
        path = os.path.join(ICON_DST, f'map_{name}.png')
        out.save(path)
        write_meta(path, f'map_{name}', 128, 128)
        print('wrote icon', name)


def icons(names: set) -> None:
    """(弃用 10-30:白线稿和现有彩色地图图标不统一,改 gen_icons / install_icons)白线图标,128 像素。"""
    from town_install_assets import write_meta
    os.makedirs(ICON_DST, exist_ok=True)
    S = 512
    W = 30

    def canvas():
        im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        return im, ImageDraw.Draw(im)

    def finish(im: Image.Image, name: str) -> None:
        # 深色外描边:把白线稿膨胀一圈垫在下面
        from PIL import ImageFilter
        a = im.getchannel('A').filter(ImageFilter.MaxFilter(25))
        shadow = Image.new('RGBA', (S, S), (16, 18, 24, 0))
        shadow.putalpha(a.point(lambda v: int(v * 0.78)))
        out = Image.alpha_composite(shadow, im).resize((128, 128), Image.LANCZOS)
        path = os.path.join(ICON_DST, f'map_{name}.png')
        out.save(path)
        write_meta(path, f'map_{name}', 128, 128)
        print('wrote icon', name)

    white = (244, 244, 244, 255)
    todo = {'hidden', 'stele', 'herb', 'ore'}
    if names:
        todo &= names
    if 'hidden' in todo:
        im, d = canvas()
        d.ellipse((76, 76, S - 76, S - 76), outline=white, width=W)
        # 问号:上弧 + 竖 + 点
        d.arc((176, 138, 336, 290), start=200, end=40, fill=white, width=W + 6)
        d.line((300, 262, 256, 300, 256, 336), fill=white, width=W + 6, joint='curve')
        d.ellipse((238, 362, 274, 398), fill=white)
        finish(im, 'hidden')
    if 'stele' in todo:
        im, d = canvas()
        d.rounded_rectangle((176, 96, 336, 400), radius=70, outline=white, width=W)
        d.line((136, 412, 376, 412), fill=white, width=W)
        for y in (190, 250, 310):
            d.line((222, y, 290, y), fill=white, width=W - 10)
        finish(im, 'stele')
    if 'herb' in todo:
        im, d = canvas()
        # 叶子:两段弧围成叶形 + 叶脉
        d.chord((120, 110, 420, 410), start=135, end=315, outline=white, width=W)
        d.chord((92, 82, 392, 382), start=315, end=135, outline=white, width=W)
        d.line((150, 380, 360, 140), fill=white, width=W - 6)
        finish(im, 'herb')
    if 'ore' in todo:
        im, d = canvas()
        # 矿镐:镐头弧 + 柄
        d.arc((96, 96, 416, 330), start=200, end=340, fill=white, width=W + 4)
        d.line((256, 150, 256, 420), fill=white, width=W)
        d.line((170, 420, 342, 420), fill=white, width=W - 8)
        finish(im, 'ore')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    rest = set(sys.argv[2:])
    {'gen': gen, 'install': install, 'icons': icons, 'gen_icons': gen_icons, 'install_icons': install_icons}.get(cmd, lambda _: print(__doc__))(rest)
