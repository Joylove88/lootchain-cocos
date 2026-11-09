# -*- coding: utf-8 -*-
"""主城北缘远景(11-10 用户看了战斗背景分层:「主城也能搞成这种风格吗」→ 选「远景 + 动态层」):
主城北墙外现在只是一条地面,镜头走到北边就到头了。给北墙外接一层远景:近处城外坡地 / 上城区屋顶 → 山丘上的王宫高塔 →
远山,越远越淡越暖雾(午后金光),运行时比地面移得慢做视差。

只喂我们自己的图:图 1 = 主城鸟瞰(北墙一段,定画风 / 色调 / 屋顶石材),图 2 = 精致风原型 city_jw_a(画风基准)。
用法:python tools/qa/city_backdrop_gen.py [名字...]     产物:%TEMP%/lootchain-qa/city_depth/gen/
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle_bg_layer_gen as B  # noqa: E402  复用 run_codex
import city4_assets_gen as C  # noqa: E402

ROOT = C.ROOT
OUT = os.path.join(B.tempfile.gettempdir(), 'lootchain-qa', 'city_depth', 'gen')
OV = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'overview', 'ov_city.png')
JW = os.path.join(ROOT, '周报截图', '2026-11-09_地图画风原型', 'city_jw_a.png')

STYLE = (
    'Match the art style, palette and light of images 1 and 2 exactly (our own game art): refined high-detail fantasy illustration, '
    'pale silver-grey stone, deep slate-blue and faded terracotta roofs, dark timber, small restrained gold accents, warm '
    'late-afternoon golden light from the upper left, soft shadows. NOT a photo, NOT cartoon, no outlines, no glow, no sparkles, '
    'no characters, no text, no UI, no frame.'
)

SPECS = {
    # 北墙外远景横条:下沿是城外坡地(会被北城墙挡住下沿),往上越来越远越淡
    'city_backdrop': (
        'Generate ONE new image with your image generation tool. A wide panoramic distant BACKDROP strip for the northern edge of '
        'our top-down city map (image 1 shows the city; this is what lies BEYOND its north wall). Seen from a high camera looking '
        'north and down at about 35 degrees. Layers from bottom to top: (1) bottom 25%: grassy slopes and a few clusters of '
        'slate-roofed houses and cypress trees just outside the wall, still fairly clear; (2) middle: a gentle hill rising behind, '
        'crowned by a grand royal palace / citadel with tall slender gothic spires and towers, terraced upper-town roofs climbing '
        'the hill, small bridges and walls; (3) far: rolling blue-grey mountains; (4) thin warm hazy sky at the top. STRONG '
        'atmospheric perspective: every layer further away is lighter, softer, lower in contrast and tinted with warm golden-grey '
        'haze, the palace is pale and soft, the mountains almost dissolve into the haze. Wide, calm, uncluttered, the palace '
        'slightly off-centre. ' + STYLE + ' Size: very wide landscape, 2048x864.'),
}

# 11-10「照这个做」:镜头左右走时远景要横向够长(视差 0.15 × 地图半宽 + 半屏,超宽屏 2.4:1 也够)→ 中间这张 + 左右各接一张
SIDE = (
    'Generate ONE new image with your image generation tool. Image 1 is the CENTER panel of a wide panoramic backdrop. Paint the '
    'panel that continues it seamlessly to the {side}: the same high camera, the SAME horizon heights (the green hills band, the '
    'hazy mountain ridges and the thin warm sky sit at exactly the same heights as in image 1), the same scale, the same golden '
    'afternoon haze and palette, so that the two images can be placed side by side. Content: {content} Strong atmospheric '
    'perspective, everything far is pale, soft and hazy. No palace in this panel. ' + STYLE + ' Size: very wide landscape, 2048x864.')
SPECS['city_backdrop_l'] = SIDE.format(side='LEFT', content=(
    'rolling green hills with scattered trees and rocks, a small distant hilltop monastery with a bell tower and a long arched '
    'stone aqueduct crossing a valley, terraced fields, hazy blue-grey mountain ridges behind.'))
SPECS['city_backdrop_r'] = SIDE.format(side='RIGHT', content=(
    'rolling green hills, a distant river winding through a valley with a stone bridge, a small watchtower on a ridge and a '
    'windmill, a few cypress groves, hazy blue-grey mountain ridges behind.'))


def gen(name):
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, name + '.png')
    if os.path.exists(dst):
        print('exists', dst)
        return
    ov = os.path.join(OUT, '_ref_ov_north.png')
    if not os.path.exists(ov):
        im = Image.open(OV).convert('RGB')
        im.crop((560, 0, 1600, 420)).save(ov)
    refs = [os.path.join(OUT, 'city_backdrop.png')] if name != 'city_backdrop' else [ov, JW]
    B.run_codex(refs, SPECS[name], dst, name)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    for n in sys.argv[1:] or list(SPECS):
        gen(n)
