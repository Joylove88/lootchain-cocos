# -*- coding: utf-8 -*-
"""主城整体重新设计原型(2026-11-11 用户看全城总览:「整体看起来比较别扭,需要重新设计下」)。

别扭的原因(对照拍板的画风原型 city_jw_a):
  1. 建筑全部一排排朝南孤零零站在大片空铺石上,没有一处被建筑围合;原型里广场四面都有房子 / 屋顶收边;
  2. 北城墙 / 台地墙 / 运河三条横带贯穿全图,整张图像条形码;
  3. 街和广场、院子是同一种石板,没有路沿、没有铺装层级;草坪是软边圆角块,不对应任何院墙 / 树篱;
  4. 地图 14000×7000 只放了约 30 栋建筑,一屏里常常只有 1 栋 + 一片空地。

出两版整城鸟瞰原型给用户选:图 1 = 现状鸟瞰(只当「有哪些地标」的清单 + 反面教材),图 2 = 画风 / 密度 / 围合感基准。
用法:python tools/qa/city_redesign_proto.py [a] [b]     产物:%TEMP%/lootchain-qa/city_redesign/city_redesign_<a|b>.png
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle_bg_layer_gen as B  # noqa: E402  复用 run_codex
import city_v4_gen as G  # noqa: E402

OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_redesign')
STYLE_REF = os.path.join(G.ROOT, '周报截图', '2026-11-09_地图画风原型', 'city_jw_a.png')

COMMON = (
    'Generate ONE new image with your image generation tool: a redesigned LAYOUT of a whole medieval fantasy capital city, as the map of '
    'a top-down 2D action RPG (the player walks around it; the camera later shows about one sixth of the width at a time).\n'
    'Image 1 is the CURRENT map of our own game seen from above. Use it ONLY as the list of landmarks that must exist and as the camera '
    'convention (ground seen straight from above, every building drawn upright as a frontal sprite whose facade faces the bottom of the '
    'image, roofs rising toward the top). Its layout is what we want to REPLACE: it feels awkward because buildings stand alone in rows '
    'on a huge empty slab, three full-width horizontal bands (city wall, terrace wall, canal) cut it into stripes, streets and squares '
    'are the same paving, and lawns are shapeless blobs.\n'
    'Image 2 is the ART STYLE, DENSITY and ENCLOSURE reference you must match: refined stonework, warm late-afternoon light from the '
    'upper left, blue slate and orange tile roofs, squares tightly framed by buildings on every side, small props clustered at building '
    'corners, patterned paving with inlaid lines and curb borders. (Ignore its 45-degree camera; keep the camera convention of image 1.)\n'
    'Design rules for the new layout:\n'
    '- Every open space is ENCLOSED and has a purpose: squares framed by continuous building frontages; the lower edge of each square is '
    'closed by the ROOFS of a row of houses seen from behind; left and right edges by gable-end houses, arcades, garden walls or tree rows.\n'
    '- Houses stand shoulder to shoulder in terraces forming street walls and city blocks with small walled back gardens; no house '
    'floating alone in paving.\n'
    '- Clear paving hierarchy with crisp stone curbs: a main avenue with a centre inlay line, side streets in smaller darker cobbles, '
    'squares with their own pattern, gardens and lawns only inside stone-edged or hedge-edged beds with geometric shapes.\n'
    '- Streets are narrow (about one fifth of a house width for lanes, one house width for the avenue); much less empty paving.\n'
    '- No element spans the whole width as a straight band: the raised upper town is a U-shaped precinct only around the cathedral with '
    'a grand staircase; the canal bends once and widens into a small harbour basin; the city wall follows the outline with towers.\n'
    '- Landmarks to keep (same buildings as image 1): cathedral at the top centre on the raised precinct; mercenary guild hall; imperial '
    'academy with bell tower; tavern; barracks by the east gate; market with striped stalls; central compass-rose plaza with the fountain '
    'and a notice board; park with a pond and a knight statue; canal with two stone bridges and wooden piers; south gate and east gate; '
    'street lamps, benches, barrels, flower beds, cypress and oak trees.\n'
)
VARIANTS = {
    'a': ('Layout concept A — RADIAL OLD TOWN: the compass plaza is a round square at the centre, enclosed by a ring of terraced houses '
          'with four streets radiating out (north to the cathedral stairs, south over a bridge to the south gate, east through the '
          'market square to the east gate, west to the park). Guild hall and tavern share a small square to the west, academy and its '
          'cloister garden to the north-east. Organic, slightly irregular medieval blocks.'),
    'b': ('Layout concept B — FORMAL AXIS: one grand tree-lined avenue runs from the south gate over the bridge, through the square '
          'compass plaza, up the grand staircase to the cathedral. Symmetric squares left and right of the plaza: guild square with the '
          'tavern on the west, market square with the barracks on the east. Rectangular perimeter blocks of terraced houses with inner '
          'courtyards, the academy with a formal garden in the north-east, the park in the south-west.'),
}
TAIL = ('\nShow the WHOLE city in one image, evenly lit, readable like a game level map, no fog, no vignette, no depth of field. '
        'No people, no UI, no labels, no text, no frame. Landscape 1536x1024.')

# ── 11-11 研究口碑好的俯视 / 斜视角游戏主城后总结的共性(只取共性,自己的话写成口径;别家截图一张都不喂生图) ──
#  1 围合:可走区域是「广场 + 街巷」网络,不是大平地上摆房子;一屏内可走铺地 ≤ 40%,四边被立面 / 山墙 / 屋顶背面 / 树冠收住
#  2 明暗:走路的地方是一汪暖亮,边角压暗(建筑长影 / 树荫 / 檐下),每屏只有一个最亮的焦点
#  3 冷暖:暖金直射光 + 蓝紫阴影;高饱和点缀色 ≤ 10% 且只聚在焦点旁;绿色只做树冠 / 爬藤 / 花箱,不要大草坪
#  4 铺装层级:小块铺石(比脚小)+ 路沿 + 排水线 + 镶边;街 / 广场 / 院子各一种
#  5 细节有松有紧:小物成簇贴墙脚 / 街角 / 门口,路中间留空;每个街区一套自己的小物(集市 / 公会 / 教堂 / 码头)
#  6 生气:行人、鸽子、炊烟、飘旗、喷泉水花、灯火窗
#  7 纵深与引导:底边屋顶 / 树冠当前景,台阶 / 拱门 / 桥做高差,街的尽头能看见下一个地标;想去的地方一屏内看得到
ART_DIRECTION = (
    'ART DIRECTION (our own house rules, follow all of them):\n'
    '1. ENCLOSURE - walkable paving is a pocket carved out of building mass and fills at most 40% of the picture. Upper edge: one '
    'continuous terrace of facades. Left and right edges: gable ends, an arcade, a garden wall with a gate, a tree row. Lower edge: the '
    'ROOFS and chimneys of the next row of houses seen from behind (only roofs, no facades) plus tree canopies overlapping the bottom '
    'corners as foreground. No building stands alone on open paving.\n'
    '2. LIGHT AND VALUE - late-afternoon sun from the upper left. Buildings and trees throw long soft blue-violet shadows across the '
    'paving toward the lower right; the walkable centre is a warm sunlit pool while corners, eaves and alley mouths fall darker. Exactly '
    'ONE brightest focal point per screen. A few windows and hanging lanterns glow warm inside the shadowed facades.\n'
    '3. COLOUR - about 70% muted neutrals (warm limestone walls, grey-violet cobbles), 20% roofs (slate blue, terracotta), at most 10% '
    'saturated accents gathered next to the focal point (crimson and purple banners, striped awnings, flowers, polished brass). Green '
    'appears only as tree canopies, ivy and window boxes - never as lawn blobs.\n'
    '4. PAVING HIERARCHY - small hand-laid cobbles, each stone much smaller than a character\'s foot, in fan and herringbone patterns, '
    'framed by crisp stone curbs, a gutter line and inlaid border bands; the street, the square and the courtyards each have their own '
    'paving; a slightly lighter worn track where people walk.\n'
    '5. CLUSTERED STORYTELLING PROPS - detail gathers at the feet of buildings, at corners and doorways: barrels, crates, a hand cart, '
    'shop signs on iron brackets, a laundry line across an alley, potted plants, a well, stacked firewood, sacks, a cat on a wall. The '
    'middle of every lane stays clear for the player. Each district has its own prop family.\n'
    '6. LIFE - two to four small townsfolk going about their day, a few pigeons, chimney smoke, fluttering pennants, sparkling water.\n'
    '7. DEPTH AND GUIDANCE - overlapping layers (foreground roofs and treetops at the bottom edge, mid-ground square, facades behind), a '
    'change of level (steps, a raised terrace with a balustrade, a bridge), and at least one opening (street, archway or stair) through '
    'which the next landmark is visible so the player knows where to go.\n'
)

VARIANTS['c'] = (
    'Layout concept C - RING OF FIVE SQUARES: the walkable city is a network of five small squares joined by short streets into a LOOP '
    '(no dead ends), everything else is solid building mass. Each square is small enough that ONE camera screen (one sixth of the image '
    'width by one fifth of its height) shows all of its enclosing sides, and each has its own identity and prop family: (1) the central '
    'compass plaza with the fountain and notice board; (2) cathedral forecourt on the raised precinct at the top, reached by the grand '
    'staircase from the plaza, cathedral facade closing the vista; (3) guild square in the west with the guild hall, the tavern and '
    'weapon racks, banners; (4) market square in the east with striped stalls, the academy bell tower visible behind, leading to the '
    'barracks and east gate; (5) harbour square in the south where the canal widens into a basin with piers, boats and a stone bridge '
    'leading to the south gate. A small walled park with the pond and knight statue sits between guild square and harbour. Streets '
    'between squares bend slightly so every street ends on a landmark.\n' + ART_DIRECTION)

# ── 一屏实机视角效果图:图 1 = 现在的实机截图(只取镜头口径 + 角色比例),图 2 = 画风基准 ──
SHOT_REF = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_grid_1111')
SCREEN_COMMON = (
    'Generate ONE new image with your image generation tool: a mock-up of ONE SCREEN of gameplay inside the capital city of our own '
    'top-down 2D action RPG, showing how it should look after an art overhaul.\n'
    'Image 1 is a real screenshot of the CURRENT game. Keep exactly its camera convention and scale: the ground is seen straight from '
    'above (no horizon, no perspective convergence), every building and prop is drawn upright as a frontal sprite whose facade faces '
    'the bottom of the image with its roof rising toward the top, and the hero party stands near the centre at the same size as in '
    'image 1 (a character is about one seventh of the image height; a two-storey house is about three characters tall). Do NOT draw '
    'any UI: no minimap, no buttons, no joystick, no text, no name labels, no toolbar.\n'
    'Image 2 is the ART STYLE reference for materials, palette and level of finish (ignore its 45-degree camera). RENDERING must '
    'match image 2: semi-realistic, smoothly hand-painted high-resolution game art with fine stone and wood detail - NOT pixel art, no '
    'dithering, no chunky pixels, no cartoon outlines. The hero party is three realistically proportioned armoured fantasy adventurers '
    'like the ones in image 1 (adult proportions, NOT chibi, NOT anime); townsfolk have the same realistic proportions.\n'
    'What is wrong in image 1 and must be fixed: flat even lighting with no cast shadows, giant featureless paving slabs as big as a '
    'person, large empty areas, buildings standing alone, shapeless lawn patches, no small props, no life.\n' + ART_DIRECTION)
SCREENS = {
    'plaza': ('spot_g_0_500.jpg',
              'SCENE - the central compass plaza: the golden compass-rose inlay in the paving at the centre (hero party standing on it), '
              'an ornate stone fountain to the left, a wooden notice board to the right; at the top centre a grand staircase with '
              'balustrades climbs to the raised cathedral precinct, flanked left and right by continuous shop and guild facades with '
              'banners; a street opens to the right toward striped market awnings; the lower edge is closed by house roofs seen from '
              'behind and two tree canopies.'),
    'plaza_dusk': ('spot_g_0_500.jpg',
                   'SCENE - the same central compass plaza as described (compass-rose inlay with the hero party, fountain left, notice '
                   'board right, grand staircase with balustrades at the top centre, continuous shop and guild facades with banners, '
                   'house roofs and tree canopies closing the lower edge). LIGHTING OVERRIDE for rule 2: early dusk, deep blue-violet '
                   'ambient, the square lit by warm street lanterns and glowing windows that cast pools of amber light on the cobbles, '
                   'the fountain softly lit; still clearly readable for gameplay, not dark.'),
    'market': ('spot_g_-2000_-650.jpg',
               'SCENE - the market street and its small square: two rows of striped canvas stalls with fruit, cloth and pottery along the '
               'sides, a half-timbered tavern with a hanging sign and outdoor tables at the upper left, terraced houses shoulder to '
               'shoulder along the top, an archway at the upper right through which the academy bell tower is visible, a well at a '
               'corner, crates and barrels stacked by the stalls, roofs of the next row along the lower edge.'),
    'harbor': ('spot_g_0_500.jpg',
               'SCENE - the harbour square by the canal: along the lower third a stone quay with mooring posts and a turquoise canal '
               'basin with two moored boats and a wooden pier; a stone bridge crosses the canal at the lower right toward the south '
               'gate; warehouses with hoists and fishmonger stalls with nets and baskets along the top; gable-end houses left and '
               'right; stacked barrels, coiled rope, drying nets; gulls instead of pigeons.'),
}
SCREEN_TAIL = '\nNo UI, no text, no labels, no frame, no vignette border. Landscape 16:9, 1672x941.'

# ── 11-11 用户看了上面精致风的一屏图:「AI 感太强」「设计来设计去和以前差不多」,并指着暗调写实那一路说「像这个风格的也行」──
# 换方向:暗调写实。只取那一路的共性(低明度、克制、材质可信、火光暖点、雾气),用自己的话写;
# 参考图只喂我们自己已上线的写实野外图(枯木林实机截图:镜头高俯角、地面写实、整体偏暗),别家截图一张不喂、提示词里也不点名。
# AI 感的来源逐条反着写:满屏雕花金饰 → 朴素实用;处处一样细 → 大面积安静 + 少数几簇;高饱和发光 → 低饱和无辉光;
# 一尘不染 → 旧、脏、修补过;完全对称 → 歪一点;插画笔触 → 像引擎里的实机画面 / 低空航拍。
DARK_REF = os.path.join(G.ROOT, '周报截图', '2026-11-09_枯木林', 'after', 'spot_hamlet.jpg')
DARK_COMMON = (
    'Generate ONE new image with your image generation tool: a mock-up of ONE SCREEN of gameplay inside the capital city of our own '
    'top-down 2D action RPG.\n'
    'Image 1 is a real screenshot of a wilderness map of OUR OWN game. The city must look like it belongs to the same world. Keep from '
    'image 1: the camera (a high top-down view looking down at roughly 60 degrees, north up, orthographic, no horizon, no perspective '
    'convergence - roofs are seen from above and south-facing walls are foreshortened), the photographic realism of the ground, the '
    'dark muted grading, and the hero party in the centre at exactly the same size and look. Do NOT draw any UI: no minimap, no '
    'buttons, no joystick, no skill icons, no health bar, no text, no name labels, no toolbar.\n'
    'GROUNDED DARK REALISM - our house rules, follow all of them:\n'
    '1. RENDERING - it must look like an in-engine screenshot of a modern 3D top-down action RPG, or a low-altitude aerial photograph '
    'of a real medieval town: physically based materials, baked global illumination, soft ambient occlusion where things touch the '
    'ground, natural cast shadows. It is NOT an illustration: no painterly brush strokes, no outlines, no concept-art glow, no bloom, '
    'no lens flare, no god rays, no sparkles, no HDR look, no depth-of-field blur, no tilt-shift.\n'
    '2. RESTRAINT - plain, functional, hand-built architecture: rough fieldstone and rubble walls, heavy dark timber frames, lime '
    'plaster stained by rain, plank doors, small shuttered windows, roofs of weathered wooden shingles and dark slate with missing '
    'tiles, moss and sagging ridges. NO carved tracery, NO gold, NO finials, NO fleur-de-lis, NO flower boxes, NO ornate lamps. '
    'Everything is slightly crooked and asymmetrical, old, dirty, repaired with mismatched planks, marked by soot and water stains.\n'
    '3. VALUE AND COLOUR - low-key and desaturated. About 85% of the picture is muted earth tones (grey stone, brown-black timber, wet '
    'dark mud). The walkable ground is a little lighter than the buildings so the paths read clearly; roofs are large, calm, dark '
    'shapes. The only saturated colour is warm orange firelight and at most two faded dull-crimson cloth banners.\n'
    '4. CONTROLLED DETAIL - large quiet areas (roof planes, plain walls, open ground) against a few dense clusters at wall feet and '
    'corners: stacked firewood, barrels, crates, sacks, a hand cart, a weapon rack, hay, hanging cloth. The middle of the square and '
    'the lanes stay clear for the player.\n'
    '5. GROUND - uneven worn cobblestones with mud-filled gaps, shallow puddles, cart ruts, scattered straw, a few plank walkways over '
    'the muddiest patches, darker dirt gathered along the base of every wall. No decorative inlays, no shiny curbs.\n'
    '6. ENCLOSURE - the square is a pocket inside dense building mass and the walkable ground fills at most 40% of the picture. Top: a '
    'continuous wall of buildings. Sides: gable ends, a covered timber gallery, a stone archway leading on to the next area. Bottom: '
    'the dark roofs of the next row of houses seen from above. No building stands alone on open ground.\n'
    '7. LIFE - a few townsfolk in hooded cloaks near the fires, a guard by the archway, crows on a roof ridge, chimney smoke drifting, '
    'a thin ground mist in the far corners.\n'
)
DARK_PLAZA = (
    'SCENE - the central square of the capital: in the centre an old circular stone dais set flush into the ground, carved with a '
    'faint, worn eight-pointed star, cracked and mossy (the hero party stands on it); a plain stone well with a timber windlass to '
    'the left; a rough timber notice board with pinned parchments to the right; at the top centre a broad flight of worn stone steps '
    'between two iron braziers climbs toward the massive plain stone portal of the cathedral (only its lowest part is visible); a '
    'smithy with an open forge at the upper left; a tavern with a hanging wooden sign at the upper right; a stone archway on the '
    'right edge leads to the market, a few canvas stalls visible beyond it. ')
DARK_SCREENS = {
    'dusk': DARK_PLAZA + 'LIGHT - overcast dusk just after rain: cold blue-grey ambient light, wet stones; warm firelight from the two '
            'braziers, the forge, wall torches and a few lit windows falls in small pools with natural falloff and glints in the puddles. '
            'Dark but clearly readable for gameplay.',
    'day': DARK_PLAZA + 'LIGHT - overcast daytime: soft grey diffuse daylight from above, gentle shadows, damp stones, the forge and the '
           'two braziers are the only warm accents. Muted and sober, not gloomy, fully readable for gameplay.',
    'market': 'SCENE - the market lane of the capital: a crooked lane widening into a small yard, lined with rough timber stalls under '
              'patched undyed canvas (root vegetables in baskets, dried fish, clay pots, bolts of coarse cloth), a butcher\'s hooks, a '
              'cooper\'s yard with barrels, a covered timber gallery along the left side, tall narrow timber-framed houses along the '
              'top, a stone archway at the upper right through which a square bell tower is visible, dark roofs of the next row along '
              'the bottom. LIGHT - overcast dusk just after rain: cold blue-grey ambient, warm light from lanterns hung on the stalls, '
              'a cooking fire and a few lit windows, glinting in puddles.',
    'harbor': 'SCENE - the canal quay of the capital: along the lower third a rough stone quay with timber mooring posts and dark still '
              'canal water, two moored flat-bottomed boats and a plank pier; a humpbacked stone bridge crosses the canal at the lower '
              'right; warehouses with timber hoists, a net-drying rack, fish barrels and coiled rope along the top; gable-end houses '
              'left and right; gulls on the posts. LIGHT - overcast dusk: cold blue-grey ambient, mist over the water, warm light from '
              'two quay braziers and a few windows reflected in the water.',
}
DARK_TAIL = '\nNo UI, no text, no labels, no frame, no vignette border. Landscape 16:9, 1672x941.'

# ── 11-11 用户看暗调写实第一版:「看起来还是 AI 感很强,需要柔和一些吧。颗粒感不要有」(与 10-27「不要粗颗粒也不要卡通亮面」同一口径)──
# 颗粒感 = 每片瓦 / 每块石头都刻出来的高频碎细节 + 满地稻草泥点苔斑 + 过锐;柔和 = 大块面、低微对比、哑光、漫射光、薄雾、暖光少而淡。
# 同一场景重渲染(构图不变,只改渲染口径),方便前后对比。
SOFT_RULES = (
    'SOFT, CLEAN RENDERING (most important):\n'
    '- No graininess at all: no gritty speckle, no noise, no film grain, no micro-scratches, no crunchy sharpening, no high-frequency '
    'texture anywhere.\n'
    '- Surfaces are smooth and matte with broad, soft value transitions. Roofs are large calm planes on which the shingle rows are only '
    'faintly suggested; walls are smooth plaster and softly modelled stone blocks; the paving is large, smooth, worn flagstones with '
    'soft shallow joints - not thousands of tiny cobbles. No scattered straw, no mud speckle, no moss speckle, no debris.\n'
    '- Light is soft and diffuse with gentle gradients and soft-edged shadows; a light atmospheric haze lowers the contrast toward the '
    'edges and the far corners. Warm lights are few and gentle - pale amber, softly falling off, never saturated orange, no glow halos.\n'
    '- Overall a little lighter and gentler: mid-dark, low-contrast, calm, a muted cool grey-brown palette. Matte everywhere: no glossy '
    'highlights, no wet sparkle, no outlines, not cartoon, not plastic.\n'
    '- Fewer small objects: big simple shapes first, detail only in two or three small clusters.\n'
)
SOFT_EDIT = (
    'Generate ONE new image with your image generation tool. Image 1 is our current mock-up of one gameplay screen of our own game. '
    'Re-render the SAME scene - same camera, same layout, the same buildings and main props in the same places, and the same hero party '
    'in the centre, unchanged in size and look - but change the rendering as follows.\n' + SOFT_RULES +
    'Same framing and size as image 1 (landscape 16:9, 1672x941). No UI, no text, no labels, no frame, no vignette border.'
)

# 柔和版第一张干净是干净了,但像没贴材质的素模;再出一张折中:保留柔和 / 无颗粒 / 薄雾,把「手绘感的材质」和冷暖光找回来
MID_EDIT = (
    'Generate ONE new image with your image generation tool. Images 1 and 2 are two mock-ups of the SAME gameplay screen of our own '
    'game. Image 1 is soft and clean but too bare and flat, like untextured models. Image 2 has material character but is far too '
    'gritty, grainy and noisy. Produce the same scene IN BETWEEN - same camera, same layout, the same buildings and main props in the '
    'same places, and the same hero party in the centre, unchanged in size and look:\n'
    '- Keep from image 1: the softness, the clean matte surfaces, the gentle haze, the calm large shapes, and the complete absence of '
    'grain, speckle, noise and crunchy sharpening.\n'
    '- Bring back, gently: hand-painted material character with soft edges - roof slates as soft rows with subtle tonal variation from '
    'slate to slate, softly modelled stone blocks with shallow joints, softly painted timber grain, worn flagstones with gentle tonal '
    'variation and a few shallow damp patches. Low-frequency, low-contrast, never noisy.\n'
    '- Richer but still gentle light: a cool blue-grey dusk ambient against soft warm amber pools on the ground around the two '
    'braziers, the forge and a few windows; soft cast shadows and soft ambient occlusion so every building and prop sits firmly on '
    'the ground; a little more depth between light and shade than image 1, far less harsh than image 2.\n'
    '- Muted, harmonious palette; matte; no glossy highlights, no glow halos, no outlines, not cartoon, not plastic.\n'
    'Same framing and size (landscape 16:9, 1672x941). No UI, no text, no labels, no frame, no vignette border.'
)

# ── 11-11 用户看柔和版:「哈哈,这个更不行啊,磨平了的感觉。参考图2这种的呢」(图 2 = 他先前指的那类暗黑风俯视 ARPG 主城实机画面)──
# 我在浏览器里把那一类画面放大细看了(只看不存不喂),它既不颗粒也不磨平的原因不在「材质刻得多细」,而在光:
#   1 画面六成以上沉在柔和的暗部里,暗部只剩剪影,纹理几乎看不见(所以没有颗粒);只有火光照到的几小块才露出真实材质(所以不平)
#   2 光源少而近:火盆 / 火把 / 炉口,几米内自然衰减;人和柱子被火拉出长长的软影;全画面只有一处冷色点缀
#   3 空气:烟 / 雾很重,光池之外的东西都被雾吃软;画面四边自然沉进黑里
#   4 布局是斜的:街、墙、房子斜着穿过画面(经典等距视角),不对称,大建筑被画面裁掉;近处有压暗的屋角 / 旗杆 / 挂旗当剪影
#     —— 我前几张都是「正中一座台阶、左右对称」的舞台布景,这是 AI 味的另一个来源
#   5 颜色近乎单色:冷的蓝灰黑 + 暖的橙;材质是引擎实机那种自然的软,不锐化
LIT_COMMON = (
    'Generate ONE new image with your image generation tool: a candid gameplay screenshot taken inside the capital city of our own '
    'top-down 2D action RPG, as it would look rendered in real time by a modern 3D game engine.\n'
    'Image 1 is a real screenshot of a wilderness map of OUR OWN game. Keep from image 1: the high top-down camera (looking down at '
    'roughly 55-60 degrees, no horizon), the realism, and the hero party near the centre at exactly the same size and look. Do NOT '
    'draw any UI: no minimap, no buttons, no joystick, no skill icons, no health bar, no text, no labels.\n'
    'LIGHT-DRIVEN DARK REALISM - our house rules, follow all of them:\n'
    '1. LIGHT DOES THE WORK - deep dusk, almost night. About 60% of the frame lies in deep, soft shadow where buildings are only dark '
    'silhouettes with barely visible texture. Material detail is revealed ONLY inside a few pools of warm firelight (iron braziers, a '
    'wall torch, an open forge, one open doorway) that fall off naturally within a few metres. People, posts and fences near the '
    'fires cast long soft shadows radiating away from the flames. No fill light that reveals everything, no evenly lit areas.\n'
    '2. ATMOSPHERE - thick cold haze and chimney smoke hang between the buildings and soften everything outside the light pools; a few '
    'slow drifting motes; the edges of the frame sink into darkness on their own.\n'
    '3. MATERIALS - physically based and believable at natural scale: big worn paving slabs, rough-hewn timber, mortared fieldstone, '
    'dark slate. The natural softness of a real-time game frame at 1080p - nothing over-sharpened, no crunchy micro-contrast, no '
    'noise, no speckle - yet inside the light pools the surfaces clearly show real material texture. Never smooth clay, never '
    'plastic, never a painting.\n'
    '4. PALETTE - almost monochrome: cold blue-grey-black shadows against warm orange-amber light. Desaturated. The only other colour '
    'is one small cold accent (see scene) and two dull dark-red banners hanging as near-silhouettes.\n'
    '5. LAYOUT - classic isometric feel: streets, walls and buildings run DIAGONALLY across the frame (rotated roughly 30-45 degrees), '
    'never parallel to the image edges. Asymmetrical. Large structures are cropped by the frame. Dark roof corners, poles and hanging '
    'banners overlap the near edges as silhouettes. It must NOT look like a symmetric stage set centred on a staircase.\n'
    '6. PLAIN ARCHITECTURE - heavy timber and stone, plank fences and palisades, stone plinths and steps; functional, weathered, '
    'nothing ornate, no gold, no stained glass.\n'
    '7. LIFE - three or four cloaked townsfolk as small dark figures warming their hands at a brazier, one guard with a spear, smoke.\n'
    'SCENE - the central square of the capital: an old round stone dais set flush into the ground, its worn carved runes giving off a '
    'faint cold blue-white glow (the one cold accent; the hero party stands beside it); iron braziers on low stone plinths around the '
    'square; a plain stone well; a timber notice board; a smithy with a glowing forge on one side; broad worn stone steps climbing '
    'diagonally toward the dark portal of the cathedral at an upper corner; a stone archway toward the market at another corner. '
)
LIT_SCREENS = {
    'snow': 'WEATHER - deep winter: a thin layer of trampled snow and frost on the ground with darker slushy tracks where people walk, '
            'snow lying on roofs, ledges and fence tops; the snow is blue-grey in shadow and warm where the firelight reaches it.',
    'wet': 'WEATHER - just after rain: wet dark paving with shallow puddles that pick up small soft reflections of the fires; damp '
           'timber; no snow.',
}
LIT_TAIL = '\nNo UI, no text, no labels, no frame. Landscape 16:9, 1672x941.'

# ── 11-11 用户又给了一个参考:「参考夜族觉醒」(应是《夜族崛起》那类俯视哥特 ARPG)。浏览器里放大看了实机画面(只看不存不喂),
# 它跟上面「近乎单色的暗」不是一路,共性是:
#   1 风格化写实:手绘感的 PBR 贴图,干净、软边、中等细节,体块略敦实好读 —— 没有照片噪点,但有明确的体积明暗 / 接触阴影 / 投影,所以不平
#   2 夜里不是黑,是饱和的蓝青色月光,暗部是深蓝不是黑,全屏都看得清;暖色路灯 / 窗灯是小块光池
#   3 颜色丰富:蓝青环境光 + 暖灯 + 红 / 橙 / 品红的秋叶和花做补色点缀
#   4 铺地和建筑的交界全用植物软化:树篱、灌木、花圃、爬藤、铁栏杆 + 灯柱
#   5 薄雾、灯周围很轻的柔光、树和灯柱在地上的月影、画面最上最下略虚
MOON_COMMON = (
    'Generate ONE new image with your image generation tool: a candid gameplay screenshot taken inside the capital city of our own '
    'top-down 2D action RPG, as it would look rendered in real time by a modern 3D game engine.\n'
    'Image 1 is a real screenshot of a wilderness map of OUR OWN game. Keep from image 1 ONLY the camera (a high top-down view '
    'looking down at roughly 55-60 degrees, no horizon) and the hero party near the centre at exactly the same size and look. Ignore '
    'its gritty photographic ground texture. Do NOT draw any UI: no minimap, no buttons, no joystick, no skill icons, no health bar, '
    'no text, no labels.\n'
    'STYLISED REALISM - our house rules, follow all of them:\n'
    '1. RENDERING - stylised-realistic real-time 3D look with hand-painted PBR textures: clean, soft-edged, medium detail with gentle '
    'painterly tonal variation; shapes slightly chunky and easy to read. No gritty photo noise, no speckle, no crunchy sharpening - '
    'but NOT flat either: clear form shading, soft ambient occlusion where things meet, real cast shadows, a soft sheen on worn stone '
    'edges. Not clay, not plastic, not cartoon outlines.\n'
    '2. COLOUR HARMONY - rich but controlled: one dominant ambient colour, small warm light pools, and a few complementary accents '
    '(crimson, rust-orange and magenta foliage and flowers, two dull red banners). Shadows are deep colour, never black; every part '
    'of the frame stays readable.\n'
    '3. LUSH EDGES - every border between paving and buildings is softened by planting: clipped hedges, bushes, flower beds, ivy on '
    'walls, grass tufts along the kerbs, tall dark cypress and autumn trees; wrought-iron fences and low stone walls with lamp posts '
    'on the pillars.\n'
    '4. ATMOSPHERE - a light mist in the distance, a very gentle soft glow around the lamps, soft shadows of trees and lamp posts '
    'lying across the paving, the very top and bottom edges of the frame slightly out of focus.\n'
    '5. LAYOUT - the square is enclosed by buildings, walls, fences and planting; the walkable paving (large worn slabs) is a little '
    'lighter than its surroundings; asymmetrical, large structures cropped by the frame, not a symmetric stage set.\n'
    '6. ARCHITECTURE - gothic stone and timber with steep slate roofs and clean masonry blocks; iron lanterns; restrained, no gold.\n'
    '7. LIFE - a few townsfolk, one guard, a couple of moths around a lamp, a few falling leaves.\n'
    'SCENE - the central square of the capital: an old round stone dais set flush into the ground, its worn carved runes giving off a '
    'faint cool glow (the hero party stands beside it); a plain stone well; a timber notice board; a smithy with a glowing forge on '
    'one side; broad stone steps climbing toward the portal of the cathedral at an upper corner; a stone archway toward the market '
    'at another corner; lamp posts around the square. '
)
MOON_SCREENS = {
    'night': 'LIGHT - a clear night under a strong moon: saturated cool blue-teal moonlight is the dominant ambient colour and fills '
             'the whole frame; warm amber light from the lamp posts, a few windows and the forge makes small pools on the paving.',
    'day': 'LIGHT - late afternoon: warm golden sunlight from the upper left is the dominant colour, with long soft blue-violet '
           'shadows of buildings and trees across the paving; lamps unlit; the forge is the only fire.',
}

# ── 11-11 用户:「两个弄下,我看看效果,然后再决定用哪个」→ 两路各做一个能在游戏里跑的中央广场(tools/qa/city_demo_build.py)──
# 实机要的两张图都从一屏效果图再出:
#   plate_<路> 干净底图:去掉队伍 / 所有人 / 烟 / 飞蛾 / 空中的叶子(这些进游戏后是活的),明火换成炭火(火苗由游戏里的动效画)
#   seg_<路>   四色分割图:白 = 能走的地面,绿 = 树 / 灌木 / 花,红 = 布,蓝 = 其余立在地面上的东西 → 可走栅格 + 遮挡条 + 随风摆的件
PLATE_SRC = {'moon': 'city_moon_night', 'lit': 'city_lit_snow'}
PLATE_COMMON = (
    'Generate ONE new image with your image generation tool. Image 1 is a screenshot of one screen of our own game. Produce the SAME '
    'picture as an EMPTY BACKGROUND PLATE: identical camera, framing, layout, buildings, props, vegetation, lighting, colours and '
    'rendering style - nothing moved, nothing resized, nothing restyled - with ONLY these changes:\n'
    '- remove the hero party in the centre and every other person and animal (townsfolk, guard, blacksmith, people beyond the '
    'archway, birds), showing the ground or background that is behind them, without their shadows;\n'
    '- remove chimney smoke, steam, sparks, moths, fireflies, falling snowflakes and every leaf that is in the air (leaves lying on '
    'the ground stay);\n'
)
PLATE_STYLE = {
    'moon': '- the lamps stay lit exactly as they are; the forge keeps only a low bed of glowing embers instead of tall flames (its warm '
            'light on the surroundings stays); the cool glow of the runes on the round stone dais stays.\n',
    'lit': '- every open flame (iron braziers, wall torches, the forge) is replaced by a low bed of glowing embers; the warm light they '
           'cast on the ground and walls stays exactly as it is; the faint cold glow of the runes on the round stone dais stays.\n',
}
PLATE_TAIL = 'Same framing and size as image 1 (landscape 16:9, 1672x941). No UI, no text, no labels, no frame.'
SEG_PROMPT = (
    'Generate ONE new image with your image generation tool. Image 1 is a background plate of our own game. Produce a flat-colour '
    'SEGMENTATION MAP of image 1 with exactly the same framing and geometry (every edge in exactly the same place), using ONLY these '
    'four flat colours with hard edges - no shading, no texture, no outlines, no gradients:\n'
    '- pure WHITE #FFFFFF: open ground a character can walk on - paving, the flush round stone dais, stair steps, the street visible '
    'through the archway, snow or puddles lying on the ground;\n'
    '- pure GREEN #00FF00: trees (trunk and canopy), bushes, hedges, flower beds, ivy;\n'
    '- pure RED #FF0000: cloth - banners, flags, awnings, canvas roofs of stalls;\n'
    '- pure BLUE #0000FF: everything else that stands above the ground - buildings, roofs (also snow-covered roofs), walls, fences, '
    'railings, pillars, lamp posts, braziers and their plinths, the well, the notice board, barrels, crates, carts, stalls, the '
    'anvil, stacked wood, the stone archway itself, low kerb walls and planter edges.\n'
    'Every pixel must be one of the four colours. Same framing and size as image 1 (landscape 16:9, 1672x941).'
)

# 暗调写实 · 整城布局(紧凑版:3×3 屏,整张图 = 整座城;图 2 = 上面出的中央广场一屏图,只当「这座城放大 3 倍看是什么样」)
DARK_CITY = (
    'Generate ONE new image with your image generation tool: the map of a WHOLE small walled medieval capital for our own top-down 2D '
    'action RPG, seen from the same high top-down orthographic camera as image 1 (north up, no horizon, no perspective convergence), '
    'the entire city in one picture.\n'
    'Image 1 is a real screenshot of a wilderness map of our own game: keep its camera, its photographic realism and its dark muted '
    'grading. Image 2 is our approved look for ONE screen of this city (its central square) - the whole-city map must look like the '
    'same place seen from three times farther away: image 2 corresponds to the central ninth of the new image. Do not draw any '
    'characters or UI.\n'
    'GROUNDED DARK REALISM: in-engine 3D screenshot or low-altitude aerial photograph look, NOT an illustration; plain hand-built '
    'stone-and-timber buildings with weathered shingle and slate roofs, nothing ornate, no gold; low-key desaturated earth tones; the '
    'walkable ground (wet cobbles, mud, plank walkways) slightly lighter than the dark roofs so the street network reads at a '
    'glance; small warm firelight accents; thin mist over the water.\n'
    'LAYOUT - a compact, dense city, three screens wide and three screens tall, a ring of small squares joined by short crooked lanes '
    'with no dead ends; everything that is not a square, yard or lane is solid building mass (roofs shoulder to shoulder):\n'
    '- centre: the central square (stone dais with a worn star, well, notice board), enclosed on all sides;\n'
    '- top centre: the cathedral, a massive plain stone church on a raised precinct, a broad flight of steps descending to the '
    'central square;\n'
    '- top left: the mercenary guild hall with a training yard (weapon racks, straw dummies) ; top right: the academy with a square '
    'bell tower and a small cloister court;\n'
    '- middle left: the tavern and the smithy sharing a yard; middle right: the market lane with canvas stalls leading to the east '
    'gate, a barracks beside the gate;\n'
    '- bottom left: a small walled old garden with a dark pond and a weathered knight statue; bottom centre: a quay and a humpbacked '
    'stone bridge over a canal, the street continuing to the south gate; bottom right: the canal widens into a harbour basin with '
    'plank piers, moored boats and warehouses;\n'
    '- a thick city wall with round towers follows the outer edge, partly cut by the image border; outside it only dark ground.\n'
    'Each square or yard is about one third of the image wide at most, so a single screen shows all of its enclosing sides. Lanes are '
    'narrow, about a quarter of a house wide. A typical house is about one fourteenth of the image width.\n'
    'LIGHT - overcast dusk just after rain, cold blue-grey ambient, small pools of warm light from braziers, torches and windows. Dark '
    'but every lane and square clearly readable. No text, no labels, no frame, no vignette border. Landscape 16:9, 1672x941.'
)


def base():
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, 'current_birdseye.png')
    if not os.path.exists(dst):
        L, g = G.generate()
        G.render_preview(L, g, 2048 / G.MAP_W, marks=False).convert('RGB').save(dst)
    return dst


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cur = base()
    for v in (sys.argv[1:] or list(VARIANTS)):
        if v.startswith(('plate_', 'seg_')) and v.split('_', 1)[1].rstrip('0123456789') in PLATE_SRC:  # 实机演示用的干净底图 / 分割图
            kind, name = v.split('_', 1)
            style = name.rstrip('0123456789')
            dst = os.path.join(OUT, f'city_{v}.png')
            src = os.path.join(OUT, (PLATE_SRC[style] if kind == 'plate' else f'city_plate_{name}') + '.png')
            if os.path.exists(dst) or not os.path.exists(src):
                print('exists' if os.path.exists(dst) else 'no source', dst)
                continue
            B.run_codex([src], PLATE_COMMON + PLATE_STYLE[style] + PLATE_TAIL if kind == 'plate' else SEG_PROMPT, dst, f'city_{v}')
            continue
        if v.startswith('moon_') and v[5:].rstrip('0123456789') in MOON_SCREENS:  # 风格化写实(moon_night / moon_day)
            dst = os.path.join(OUT, f'city_{v}.png')
            if os.path.exists(dst):
                print('exists', dst)
                continue
            B.run_codex([os.path.join(OUT, '_shot_dark_ref.png')], MOON_COMMON + MOON_SCREENS[v[5:].rstrip('0123456789')] + LIT_TAIL, dst, f'city_{v}')
            continue
        if v.startswith('lit_') and v[4:].rstrip('0123456789') in LIT_SCREENS:  # 光影主导的暗调写实(lit_snow / lit_wet / lit_snow2 ...)
            dst = os.path.join(OUT, f'city_{v}.png')
            if os.path.exists(dst):
                print('exists', dst)
                continue
            B.run_codex([os.path.join(OUT, '_shot_dark_ref.png')], LIT_COMMON + LIT_SCREENS[v[4:].rstrip('0123456789')] + LIT_TAIL, dst, f'city_{v}')
            continue
        if v.startswith('mid_'):  # 折中版:图 1 = 柔和版,图 2 = 暗调第一版(mid_dusk ← city_soft_dusk.png + city_dark_dusk.png)
            dst = os.path.join(OUT, f'city_{v}.png')
            name = v[4:].rstrip('0123456789')
            srcs = [os.path.join(OUT, f'city_soft_{name}.png'), os.path.join(OUT, f'city_dark_{name}.png')]
            if os.path.exists(dst) or not all(os.path.exists(s) for s in srcs):
                print('exists' if os.path.exists(dst) else 'no source', dst)
                continue
            B.run_codex(srcs, MID_EDIT, dst, f'city_{v}')
            continue
        if v.startswith('soft_'):  # 柔和版:同一张暗调图重渲染(soft_dusk ← city_dark_dusk.png;soft_dusk2 = 再出一张)
            dst = os.path.join(OUT, f'city_{v}.png')
            src = os.path.join(OUT, f'city_dark_{v[5:].rstrip("0123456789")}.png')
            if os.path.exists(dst) or not os.path.exists(src):
                print('exists' if os.path.exists(dst) else 'no source', dst)
                continue
            B.run_codex([src], SOFT_EDIT, dst, f'city_{v}')
            continue
        if v.rstrip('0123456789') == 'dark_city':  # 暗调写实整城布局(要先有 city_dark_dusk.png)
            dst = os.path.join(OUT, f'city_{v}.png')
            if os.path.exists(dst):
                print('exists', dst)
                continue
            B.run_codex([os.path.join(OUT, '_shot_dark_ref.png'), os.path.join(OUT, 'city_dark_dusk.png')], DARK_CITY, dst, f'city_{v}')
            continue
        if v.startswith('dark_') and v[5:].rstrip('0123456789') in DARK_SCREENS:  # 暗调写实一屏效果图(dark_dusk / dark_dusk2 ...)
            dst = os.path.join(OUT, f'city_{v}.png')
            if os.path.exists(dst):
                print('exists', dst)
                continue
            ref = os.path.join(OUT, '_shot_dark_ref.png')
            if not os.path.exists(ref):
                from PIL import Image
                im = Image.open(DARK_REF).convert('RGB')
                im.crop((0, 41, im.width, im.height)).save(ref)  # 去掉预览页顶部调试条
            B.run_codex([ref], DARK_COMMON + DARK_SCREENS[v[5:].rstrip('0123456789')] + DARK_TAIL, dst, f'city_{v}')
            continue
        if v in SCREENS:  # 一屏实机视角效果图
            dst = os.path.join(OUT, f'city_screen_{v}.png')
            if os.path.exists(dst):
                print('exists', dst)
                continue
            shot, scene = SCREENS[v]
            ref = os.path.join(OUT, f'_shot_{os.path.splitext(shot)[0]}.png')
            if not os.path.exists(ref):
                from PIL import Image
                im = Image.open(os.path.join(SHOT_REF, shot)).convert('RGB')
                im.crop((0, 41, im.width, im.height)).save(ref)  # 去掉预览页顶部调试条
            B.run_codex([ref, STYLE_REF], SCREEN_COMMON + scene + SCREEN_TAIL, dst, f'city_screen_{v}')
            continue
        dst = os.path.join(OUT, f'city_redesign_{v}.png')
        if os.path.exists(dst):
            print('exists', dst)
            continue
        B.run_codex([cur, STYLE_REF], COMMON + VARIANTS[v] + TAIL, dst, f'city_redesign_{v}')
