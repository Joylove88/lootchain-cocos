# -*- coding: utf-8 -*-
"""主城高低差素材(11-10 用户选「主城高低差」):北部上城区(大教堂 / 公会 / 学院)抬高一层,
台地南沿一道挡土墙(顶上石栏杆),路穿过的地方修台阶。

只喂我们自己的图:图 1 = 实机截图(北城墙 + 草坪,定石材 / 光向 / 视角),图 2 / 3 = 精致风原型 city_jw_a 整图 + 局部(画风基准)。
品红平底,city_terrace_install.py 抠图入库。
用法:python tools/qa/city_terrace_gen.py [名字...]      产物:%TEMP%/lootchain-qa/city_terrace/gen/
"""
import os
import sys

os.environ.setdefault('STYLE', 'jw')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle_bg_layer_gen as B  # noqa: E402  复用 run_codex
import city4_assets_gen as C  # noqa: E402

ROOT = C.ROOT
OUT = os.path.join(B.tempfile.gettempdir(), 'lootchain-qa', 'city_terrace', 'gen')
SHOT = os.path.join(B.tempfile.gettempdir(), 'lootchain-qa', 'city_grid_after', 'spot_g_2000_2800.jpg')

COMMON = (
    'Image 1 is a screenshot of OUR game (top-down city map: the stone city wall, the paving and the lawn) — match its stone colour, '
    'its warm late-afternoon light from the upper left and its camera. Images 2 and 3 are the ART STYLE references you must match '
    '(ignore their content and their 45-degree angle).\n' + C.FRONTAL + '\n' + C.FA + '\n'
    'Stone: pale silver-grey ashlar and worn marble like the city wall in image 1, a little moss and dirt near the base, very few '
    'gold accents (none is fine). '
)
TAIL = (
    '\nOnly this object; no ground patch, no grass, no surrounding paving, no cast shadow on the ground, no other objects, no people.\n'
    'Background: perfectly flat solid pure magenta (#FF00FF) everywhere around it and in every gap (also between balusters), no '
    'gradient, no shadow, no glow. Razor sharp silhouette, no depth of field, no haze. {size}. No text, no frame.'
)

SPECS = {
    # 挡土墙:横向可串接的一段(上城区台地南沿)。顶面 = 台地地面,不画;只画「压顶 + 石栏杆 + 正立面」
    'terrace_wall': ('Generate ONE new image with your image generation tool: a single straight SECTION of a low stone RETAINING '
                     'WALL running perfectly horizontally from the left edge to the right edge of the image, the edge of a raised '
                     'upper-town terrace seen from the lower street in front of it. From top to bottom: a carved stone balustrade '
                     '(a row of short turned balusters between square posts every quarter of the width, with a flat handrail) on a '
                     'moulded coping, then the vertical FRONT FACE of the retaining wall made of large neatly fitted ashlar blocks '
                     '(about 4 courses high), a slightly projecting plinth course at the bottom. The front face is about as tall as '
                     'the balustrade. The left and right ends are cut perfectly straight and vertical through the wall so that '
                     'copies can be placed side by side seamlessly (no end posts at the cut ends, no corner). Even lighting along '
                     'the whole length.', 'Landscape 1536x640'),
    # 台阶:从下层街面笔直往上(往画面上方 = 北)爬到台地,两侧短墙 + 墩柱
    'terrace_stairs': ('Generate ONE new image with your image generation tool: a single wide straight flight of stone STAIRS '
                       'climbing straight AWAY from the viewer (from the bottom of the image up toward the top), connecting a lower '
                       'street to a raised terrace; about 7 broad shallow steps, each step edge perfectly horizontal; on the left '
                       'and right a low stone side wall with a carved balustrade running up along the stairs, ending at the bottom '
                       'in a square stone pedestal topped with a small stone urn. Symmetrical. The stairs are wider than they are '
                       'deep.', 'Landscape 1536x1024'),
    # 大台阶:大道上(广场 → 大教堂),更宽,中间一个平台
    'terrace_stairs_grand': ('Generate ONE new image with your image generation tool: a single grand, very wide straight flight of '
                             'stone STAIRS climbing straight AWAY from the viewer (from the bottom of the image toward the top) up '
                             'to a raised cathedral terrace: two runs of broad shallow steps with a flat landing in the middle, each '
                             'step edge perfectly horizontal; flanked left and right by low stone side walls with carved balustrades '
                             'and tall square pedestals at the bottom, each pedestal topped with an iron lantern. Symmetrical, '
                             'monumental but calm.', 'Landscape 1536x1024'),
}


def gen(name):
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, name + '.png')
    if os.path.exists(dst):
        print('exists', dst)
        return
    styles = [next(p for p in c if os.path.exists(p)) for c in C.FA_REFS]
    text, size = SPECS[name]
    B.run_codex([SHOT] + styles, COMMON + text + TAIL.format(size=size), dst, name)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    for n in sys.argv[1:] or list(SPECS):
        gen(n)
