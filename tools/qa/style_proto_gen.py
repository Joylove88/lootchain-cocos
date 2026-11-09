# -*- coding: utf-8 -*-
"""地图画风原型(11-09 用户:「摆件还是很乱糟糟的,没有规律,不够自然,重叠度也很高;地形看着不舒服,可以参考英雄联盟地形画风试试看」)。

按实际游戏镜头(斜俯视约 50°、角色约占画面高 1/8)出整屏原型,参考图 = 用户现网截图(构图 / 角色比例),
只取「手绘 MOBA 地形」这类画风方向(笔触柔和、地面干净好读、草石边缘有机过渡、摆件沿墙角 / 路边成组),不复刻任何具体游戏的素材。
A = 手绘 MOBA 地形风;B = 维持写实但按比例和街道规则重摆;F = 野外(枯木林)用 A 风格。
用法:python tools/qa/style_proto_gen.py [city_a city_b field_a]   输出 %TEMP%/lootchain-qa/style_proto/<名字>.png
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_proto_gen import GEN, codex_exe, other_codex_exec  # noqa: E402

OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'style_proto')

RULES = (
    'LAYOUT RULES (very important): every object has believable real-world scale relative to the small characters in the reference '
    '(a person is about 1/8 of the image height; a house is 4-6 people tall; a statue at most 2 people tall; a bench, barrel or flower '
    'box is knee to waist high). Ground stones / cobbles are SMALL (about a hand to a foot across, dozens fit in one character width). '
    'Every object is grounded: it sits on the ground with a soft contact shadow; flower boxes hang ON house walls under windows; benches '
    'stand against walls; hedges run along walls or path edges, never crossing a house or a tree. Objects never overlap each other. '
    'Houses line the streets in neat rows following the street direction, with small clusters of props (barrels, crates, plants) '
    'tucked into corners and doorways. The middle of streets and the plaza stay open and clean for walking. Natural, orderly, '
    'readable. Same high oblique camera as the reference (about 50 degrees down, isometric game view), landscape 16:9. '
    'Do NOT draw any characters, UI, text, icons or minimap.'
)

# 11-09 用户「按英雄联盟的画质风格,重新设计主城」:拿「顶级 MOBA 手绘画质」当画风方向(粗壮夸张的造型、强烈的冷暖光、饱和但和谐的色彩、
# 手绘质感的材质细节、少量发光点缀),布局沿用 P1 原型;只取画风方向,建筑 / 地标都是我们自己的设计,不复刻任何游戏的地图或素材
HIFI = (
    'ART STYLE (most important): premium hand-painted stylized fantasy game art at the quality of a top-tier MOBA game map: bold, '
    'chunky, slightly exaggerated shapes and silhouettes (thick walls, oversized rooflines, sturdy proportions), rich saturated but '
    'harmonious colours (warm golden sandstone, deep royal-blue slate roofs with gold trim, lush emerald greens, turquoise water), '
    'strong directional golden sunlight from the upper left with cool blue-violet shadows and soft ambient occlusion, crisp painted '
    'edge highlights on every form, detailed hand-painted textures (stone blocks, wood grain, roof tiles) that stay clean and '
    'readable, a few small magical accents (soft glowing blue crystal lanterns, gold trim), vivid flowers and banners. Very polished, '
    'high detail, no blur. Original designs only (do not copy any existing game locations or assets). '
)

# 11-09 用户:「AI 感太重,也不像那类 MOBA 画风」→ 换画法:低饱和、大色块、笔触可见、细节只给焦点,去掉金边 / 发光 / 处处高光
MUTED = (
    'ART STYLE (most important, avoid the typical over-rendered AI look): a hand-painted game environment painted by a human concept '
    'artist in gouache / oil, with visible broad brush strokes and simplified forms. Large calm areas of flat colour with only subtle '
    'painted variation; detail is concentrated on a few focal points and left loose and suggestive everywhere else. Restrained, slightly '
    'desaturated palette: dusty ochre and cream stone, muted slate grey-blue and faded terracotta roofs, sage and olive greens, soft teal '
    'water. Soft warm afternoon light with gentle shadows, low texture contrast so the walkable ground stays quiet. NO gold trim, NO '
    'glowing lamps, NO rim highlights on everything, NO glossy surfaces, no outlines, no repeated identical houses, no perfect symmetry, '
    'no sparkles, no hyper-detailed tiles. Feels like a painting, not a 3D render. '
)
MUTED_B = MUTED.replace('Large calm areas of flat colour', 'Bolder chunky shapes and confident large brush strokes; large calm areas of flat colour')

# 11-09 用户发来一张 MOBA 对局截图当画风参考 → 只提炼通用的画面特征(不把截图喂给生图、不复刻任何建筑 / 单位 / 地图):
# 地面 = 偏冷偏暗的大块灰蓝石板,缝里长苔藓小草,细节少、明度压低 → 人物和特效跳出来;建筑 / 摆件造型粗壮简洁、轮廓清楚;
# 颜色重点留给角色和少量焦点,环境整体收敛
MOBA = (
    'ART STYLE (most important): stylized hand-painted top-down MOBA arena look. The GROUND is the key: large irregular cool blue-grey '
    'stone slabs (each slab about one to two people wide) with soft painted edges, thin dark joints with moss and tiny grass tufts '
    'growing in the seams, a few cracks and fallen leaves; the ground is fairly dark, cool and low in detail so characters and effects '
    'stand out clearly on it. Grass areas are rich deep green with soft painted texture and clean organic edges against the stone. '
    'Buildings and props have chunky, simplified, slightly exaggerated shapes with clear silhouettes and soft painted shading, '
    'readable from far away; muted warm stone and slate-blue roofs so they do not compete with the characters. Lighting is clear and '
    'even with soft ambient occlusion around every object base. Painted, not photographic; no gold trim, no glowing lamps, no '
    'sparkles, no over-rendered tiny details. Original designs only. '
)
MOBA_B = MOBA.replace('fairly dark, cool and low in detail', 'dark, cool and very low in detail, with a slightly stronger contrast')

# 11-09 用户:「不朽箴言 可以参考这款游戏,画风比较精致」→ 只提炼通用特征(不喂它的截图、不复刻任何角色 / 界面 / 画面):
# 精修高细节的暗黑奇幻插画质感、边缘干净锐利、雕花石作、银灰 / 大理石 + 深石板蓝屋顶、克制的金银点缀、宝石色点睛、电影感轮廓光
REFINED = (
    'ART STYLE (most important): a refined, high-detail dark-fantasy illustration with the polish of premium RPG key art: crisp clean '
    'edges and silhouettes, finely carved ornamental gothic stonework (tracery, carved trims, small statues and reliefs), pale silver-grey '
    'stone and worn marble, deep slate-blue roofs, restrained gold and silver metal accents, jewel-tone accent colours (deep violet and '
    'sapphire banners, teal water, a few warm amber lamp glows), dramatic but readable lighting with a soft rim light on edges, rich but '
    'controlled detail, polished and clean, NOT muddy brushwork, NOT cartoon, NOT a photo. The walkable plaza paving is fine and clean '
    'with an elegant inlaid pattern and LOW contrast, so characters stand out on it. Original designs only. '
)
CAMERA_FRONT = ('CAMERA: high oblique view about 50 degrees down looking straight north with NO yaw: house fronts face the viewer, roof '
                'ridges run horizontal, vertical edges vertical (NOT a 45-degree isometric corner view). ')

JOBS = {
    'city_a': (['ref_city_6.png', 'ref_city_7.png'], (
        'Image 1 and 2 are screenshots of our game\'s capital city at the real gameplay camera (with UI and characters). Redesign this '
        'same kind of city street scene in a HAND-PAINTED STYLIZED MOBA TERRAIN art style: painterly textures with soft brush detail, '
        'warm sunlit harmonious palette (warm sandstone, slate-blue roofs, rich but not neon greens), gentle stylized proportions, soft '
        'ambient occlusion, clear value separation between walkable ground (smooth, low-detail, light) and obstacles (darker, more '
        'detailed), organic soft-edged transitions between paving stones, grass and dirt, a few flowers and small plants along edges. '
        'Think classic top-down fantasy MOBA / ARPG map painting, but our own original city. ' + RULES)),
    'city_b': (['ref_city_6.png', 'ref_city_7.png'], (
        'Image 1 and 2 are screenshots of our game\'s capital city at the real gameplay camera (with UI and characters). Redraw this '
        'same kind of city street scene keeping a REALISTIC look (like a real oblique aerial photo of a medieval European town), but '
        'fix the problems: realistic small cobblestones, consistent scale, everything grounded and arranged neatly. ' + RULES)),
    'city_hifi_overview': (['city_p1.png'], (
        'Image 1 is our approved hub-city layout (birds-eye overview). Repaint the SAME city with the SAME layout (same streets, '
        'plaza with compass rose, cathedral at the top, guild hall, academy, tavern, market, barracks and east gate, park with pond, canal '
        'with two bridges and docks, south gate, north wall only, wooded edges) but upgrade the art. ' + HIFI +
        'Same high oblique birds-eye camera, wide 2:1 landscape, fill the frame. No text, no UI, no people.')),
    'city_hifi_close': (['city_p1.png', 'ref_city_6.png'], (
        'Image 1 is our hub-city layout; image 2 is a screenshot at the real gameplay camera (ignore its old art, characters and UI). '
        'Paint a close-up of the central compass plaza area of this city at the gameplay camera (about 50 degrees down, isometric game '
        'view, a person would be about 1/8 of the image height): the compass-rose plaza in the middle, a fountain, the notice board, '
        'lamp posts, the start of the cathedral avenue with cypresses and flower beds, rows of houses and the market stalls at the edges. ' +
        HIFI + RULES)),
    'city_muted_a': (['city_p1.png', 'ref_city_6.png'], (
        'Image 1 is our hub-city layout; image 2 is a screenshot at the real gameplay camera (ignore its old art, characters and UI). '
        'Paint a close-up of the central compass-rose plaza of this city at the gameplay camera (about 50 degrees down, isometric game '
        'view, a person would be about 1/8 of the image height): the compass-rose plaza in the middle, a simple fountain, a notice board, '
        'a couple of plain iron lamp posts, the start of the cathedral avenue with cypresses and a flower bed, a few houses and two market '
        'stalls at the edges. ' + MUTED + RULES)),
    'city_muted_b': (['city_p1.png', 'ref_city_6.png'], (
        'Image 1 is our hub-city layout; image 2 is a screenshot at the real gameplay camera (ignore its old art, characters and UI). '
        'Paint a close-up of the central compass-rose plaza of this city at the gameplay camera (about 50 degrees down, isometric game '
        'view, a person would be about 1/8 of the image height): the compass-rose plaza in the middle, a simple fountain, a notice board, '
        'a couple of plain iron lamp posts, the start of the cathedral avenue with cypresses and a flower bed, a few houses and two market '
        'stalls at the edges. ' + MUTED_B + RULES)),
    'city_moba_a': (['city_p1.png', 'ref_city_6.png'], (
        'Image 1 is our hub-city layout; image 2 is a screenshot at the real gameplay camera (ignore its old art, characters and UI). '
        'Paint a close-up of the central compass-rose plaza of this city at the gameplay camera (about 50 degrees down, isometric game '
        'view, a person would be about 1/8 of the image height): the compass rose inlaid into the stone slabs in the middle, a simple '
        'fountain, a notice board, two plain iron lamp posts, the start of the cathedral avenue with cypresses and a grass bed, a few '
        'houses and two market stalls at the edges, grass patches at the corners. ' + MOBA + RULES)),
    'city_moba_b': (['city_p1.png', 'ref_city_6.png'], (
        'Image 1 is our hub-city layout; image 2 is a screenshot at the real gameplay camera (ignore its old art, characters and UI). '
        'Paint a close-up of the central compass-rose plaza of this city at the gameplay camera (about 50 degrees down, isometric game '
        'view, a person would be about 1/8 of the image height): the compass rose inlaid into the stone slabs in the middle, a simple '
        'fountain, a notice board, two plain iron lamp posts, the start of the cathedral avenue with cypresses and a grass bed, a few '
        'houses and two market stalls at the edges, grass patches at the corners. ' + MOBA_B + RULES)),
    # 11-09 用户:「或者参考这个画风」= 我们自己的野外原型 field_a(枯木林伐木村):直接拿它当画风参考图
    'city_fa': (['field_a.png', 'city_p1.png', 'ref_city_6.png'], (
        'Image 1 is the ART STYLE reference you must match exactly (our own approved concept: hand-painted, softly textured ground '
        'with gentle painted variation, warm natural light, clean readable open ground in the middle, buildings and props grouped at the '
        'edges, weathered wood and stone with painterly detail, restrained palette). Image 2 is our hub-city layout; image 3 is a '
        'screenshot at the real gameplay camera (ignore its old art, characters and UI). Paint, in the exact style of image 1, a close-up '
        'of this city’s central compass-rose plaza at the gameplay camera (about 50 degrees down, a person about 1/8 of the image '
        'height): worn stone paving with the compass rose inlaid in the middle, a simple stone fountain, a wooden notice board, two '
        'plain iron lamp posts, the start of the cathedral avenue with cypresses and a flower bed, a few town houses of honey-coloured '
        'stone with slate and faded terracotta roofs, two market stalls at the edges, small planters and barrels. Daytime, warm and '
        'pleasant (not autumn-dead, keep greens alive). ' + RULES)),
    # 11-09 用户再次指定 field_a 画风:city_fa 还是太干净(满地小卵石 + 崭新房子)→ 地面改成大片柔和笔触的踩实泥地 / 旧石板,
    # 建筑旧化,颜色更土更暖,细节只在摆件上
    'city_fa2': (['field_a.png', 'city_p1.png'], (
        'Image 1 is the ART STYLE reference you must match as closely as possible: look at how its GROUND is painted (broad soft '
        'brush patches of packed earth with subtle dark and light blotches, scattered pebbles, dry grass tufts at the edges; NOT a '
        'tiled pattern), how weathered and lived-in the wood and stone are, the warm earthy muted palette, the soft diffuse light and '
        'the gentle painterly detail on props. Image 2 is our hub-city layout. Paint, in exactly that style and rendering, a close-up of '
        'the central plaza of this city at the same camera as image 1 (high oblique isometric view, about 50 degrees down): the open '
        'plaza ground painted as broad worn flagstones and packed earth blending into each other (a weathered compass rose of inlaid '
        'stones in the middle, partly worn away), an old stone fountain, a wooden notice board, two simple iron lamp posts, the start of '
        'the cathedral avenue with a few cypresses and a small flower bed, old town houses of honey stone and timber with weathered '
        'slate and faded terracotta roofs at the edges, two market stalls with faded awnings, barrels, crates, a cart. Daytime, warm '
        'and lived-in, some green plants and flowers but muted. ' + RULES)),
    'city_jw_a': (['city_fa2.png', 'city_p1.png'], (
        'Image 1 is our current prototype of the central plaza (use it ONLY for the layout and the list of objects, NOT for its style); '
        'image 2 is our hub-city layout. Repaint this same central plaza in a completely new, more refined style: a compass rose inlaid in '
        'the plaza paving in the middle, an elegant carved stone fountain, a notice board, two ornate iron lamp posts, the start of the '
        'cathedral avenue with cypresses and a carved stone flower bed, refined town houses of pale stone and dark timber with slate-blue '
        'roofs at the edges, two market stalls with deep-coloured awnings, a few barrels and crates. Late afternoon golden light. '
        + CAMERA_FRONT + REFINED + RULES)),
    'city_jw_b': (['city_fa2.png', 'city_p1.png'], (
        'Image 1 is our current prototype of the central plaza (use it ONLY for the layout and the list of objects, NOT for its style); '
        'image 2 is our hub-city layout. Repaint this same central plaza in a completely new, more refined style: a compass rose inlaid in '
        'the plaza paving in the middle, an elegant carved stone fountain, a notice board, two ornate iron lamp posts, the start of the '
        'cathedral avenue with cypresses and a carved stone flower bed, refined town houses of pale stone and dark timber with slate-blue '
        'roofs at the edges, two market stalls with deep-coloured awnings, a few barrels and crates. Blue-hour dusk: cool violet-blue '
        'ambient light, warm amber glow from the lamps and windows, still bright enough to read every object clearly. '
        + CAMERA_FRONT + REFINED + RULES)),
    'field_a': (['ref_field_hamlet.jpg'], (
        'Image 1 is a screenshot of our game\'s forest field map (a dying autumn forest with an abandoned woodcutter hamlet) at the real '
        'gameplay camera. Redesign this same area in a HAND-PAINTED STYLIZED MOBA TERRAIN art style: painterly ground with soft brush '
        'detail, clear readable walkable dirt paths and clearings, dead and autumn trees grouped into forest edges and clusters (not '
        'scattered randomly), tree roots and rocks framing the paths, a muted autumn palette with warm light. ' + RULES.replace(
            'Houses line the streets in neat rows following the street direction', 'Cottages and log piles sit together in the hamlet clearing'))),
}


def gen(name):
    dst = os.path.join(OUT, name + '.png')
    if os.path.exists(dst):
        print('skip', name)
        return
    refs, prompt = JOBS[name]
    while other_codex_exec() > 0:
        time.sleep(10)
    before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-style-')
    cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"', '--skip-git-repo-check', '-s', 'read-only', '-C', work]
    for r in refs:
        cmd += ['-i', os.path.join(OUT, r)]
    cmd.append('-')
    t0 = time.time()
    r = subprocess.run(cmd, input=('Generate ONE new image with your image generation tool. ' + prompt).encode('utf-8'), capture_output=True, timeout=1500)
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(GEN) if d not in before]
    mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
    imgs = [p for d in mine for p in glob.glob(os.path.join(GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', name, text[-400:], flush=True)
        return
    shutil.copy(max(imgs, key=os.path.getmtime), dst)
    print('ok', name, f'{time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    os.makedirs(OUT, exist_ok=True)
    for n in (sys.argv[1:] or list(JOBS)):
        gen(n)
