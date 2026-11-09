# -*- coding: utf-8 -*-
"""主城 v4 素材逐件生成(2026-11-08 用户选写实原型 city_r1「晴天暖石城」;主城改 NPC 城区,功能建筑全部只在终端)。

做法同 tree_hq_gen:原型里裁出这件东西当参考(只取视角 / 体量 / 材质),Codex 单独重画成「真实航拍照片」质感的独立物件,
纯色平底(品红;花草多的用青色)由 city4_install.py 自己抠图;地面材质出无缝方图。
输出 %TEMP%/lootchain-qa/city4/<名字>.png;已存在的跳过(删掉重出)。和别的会话共用 Codex 时等它跑完再开(见 field_proto_gen)。

用法:python tools/qa/city4_assets_gen.py [名字 ...]        不带参数 = 全部
     python tools/qa/city4_assets_gen.py --crops            只出参考裁图拼图(核对裁框)
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_proto_gen import GEN, codex_exe, other_codex_exec  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city4')
PROTO_CANDIDATES = [os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_proto', 'city_r1.png'),
                    os.path.join(ROOT, '周报截图', '2026-11-08_主城荒原重做', 'proto', 'city_r1.png')]
KEYS = {'magenta': 'pure magenta (#FF00FF)', 'cyan': 'pure cyan (#00FFFF)'}

PHOTO = (
    'Photographic realism, like a crop of a real high-resolution oblique aerial drone photo: true-to-life materials, dust, '
    'weathering, cracks, fine natural detail, realistic proportions, natural soft daylight from the upper left with clear volume '
    '(lit top-left faces, soft cool shadow sides). Muted natural colours, low saturation, matte. NOT an illustration, NOT painterly, '
    'NOT cartoon, NOT glossy, NO glow, no ornament spam, no repeated stamp patterns, no noise or grain, not over-sharpened.'
)

OBJ = (
    'Image 1 is a crop of our approved map concept (an aerial photo style game map of a sunny walled late-medieval capital city of honey-coloured limestone); image 2 is the '
    'whole concept for context. Use them for the viewing angle (high oblique bird\'s-eye view, about 50 degrees down, like an '
    'isometric ARPG camera), scale and material only.\n'
    'Generate ONE new image with your image generation tool: a single isolated {subject}.\n' + PHOTO + '\n'
    'Only the {short}; no ground patch, no grass, no surrounding rocks{extra_no}, no cast shadow on the ground, no other objects.\n'
    'Background: perfectly flat solid {key} everywhere around it and in every gap, no gradient, no shadow, no glow. Razor sharp '
    'silhouette against the background, no depth of field, no haze, no background colour reflected on the object. Centered with a '
    'small margin. {size}. No text, no frame.'
)

FLAT = (
    'Image 1 is a crop of our approved map concept (an aerial photo style game map of a sunny walled late-medieval capital city of honey-coloured limestone); image 2 is the '
    'whole concept for context. Use them for the viewing angle (high oblique bird\'s-eye view, about 50 degrees down) and material.\n'
    'Generate ONE new image with your image generation tool: {subject}, as a ground-level map piece that will be laid flat on our '
    'terrain. ' + PHOTO + '\n'
    'Its outer border must be an irregular natural edge of {edge}, and everything outside that edge is perfectly flat solid {key} '
    '(no gradient, no shadow). {size}. No text, no frame.'
)

TEX = (
    'Generate ONE new image with your image generation tool: a seamless tileable square ground texture of {subject}, seen from '
    'straight above (orthographic top-down), for a game terrain shader. ' + PHOTO + '\n'
    'Evenly lit with no directional light gradient, no vignette, no large single features, no objects, no plants taller than '
    'a few centimetres. Must tile seamlessly on all four edges. Square 1024x1024. No text.'
)

NPC = (
    'Image 1 is an existing NPC sprite from our game (a realistic painted full-body character on a plain background). Match its '
    'art style exactly: realistic semi-painterly rendering, natural proportions (NOT chibi, NOT anime), muted natural colours, soft '
    'light from the upper left, same level of detail, standing pose, seen from the front at eye level, whole body visible from head to '
    'shoes.\n'
    'Generate ONE new image with your image generation tool: {subject}. No glow, no magic effects.\n'
    'Background: perfectly flat solid {key} everywhere around the figure, no gradient, no shadow, no floor. Razor sharp silhouette. '
    'Centered, portrait 1024x1536. No text, no frame.'
)

# ── 11-09 A 手绘风(用户选画风原型 city_a:「参考英雄联盟地形画风」)──
# STYLE=paint:同一套物件清单按手绘 MOBA 地形风重画,图 2 改给画风参考 city_a(不再给写实原型);NPC 立绘不重画;产物另放 city4p
STYLE = os.environ.get('STYLE', '')
STYLE_REF_CANDIDATES = [os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'style_proto', 'city_a.png'),
                        os.path.join(ROOT, '周报截图', '2026-11-09_地图画风原型', 'city_a.png')]
PAINT = (
    'Hand-painted stylized fantasy map art in the style of image 2: painterly brushwork with soft texture detail, warm sunlight from '
    'the upper left with soft ambient occlusion, harmonious slightly saturated palette (warm sandstone, slate-blue roofs, rich '
    'greens), clean readable shapes, gently stylized sturdy proportions (not chibi, not cartoonish toy look), crisp silhouette. '
    'NOT a photo, no photographic noise, no glow, no ornament spam, not over-sharpened.'
)
if STYLE == 'paint':
    OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city4p')
    _concept = 'an aerial photo style game map of a sunny walled late-medieval capital city of honey-coloured limestone'
    OBJ = OBJ.replace(PHOTO, PAINT).replace('image 2 is the whole concept for context', 'image 2 is the ART STYLE reference you must match').replace(_concept, 'a walled late-medieval capital city')
    FLAT = FLAT.replace(PHOTO, PAINT).replace('image 2 is the whole concept for context', 'image 2 is the ART STYLE reference you must match').replace(_concept, 'a walled late-medieval capital city')
    TEX = TEX.replace(PHOTO, PAINT + ' Small-scale pattern: about 14 to 18 stones (or tiles / tufts) fit across the whole texture width. LOW CONTRAST and soft: gentle value range, muted colours, thin soft joints, so that characters standing on it read clearly; a calm floor, not a busy pattern.')

# ── 11-09 伐木村画风(用户:「参考这个画风」= field_a 伐木村原型;拍板原型 city_fa2)──
# STYLE=fa:图 2 = city_fa2(主城广场按伐木村画法)、图 3 = field_a(伐木村本体);旧化、土暖低饱和、细节只给物件;产物放 city4f
FA_REFS = [[os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'style_proto', n),
            os.path.join(ROOT, '周报截图', '2026-11-09_地图画风原型', n)] for n in ('city_fa2.png', 'field_a.png')]
FA_GROUND_REF = [os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'style_proto', 'fa2_ground_crop.png'),
                 os.path.join(ROOT, '周报截图', '2026-11-09_地图画风原型', 'fa2_ground_crop.png')]
FA = (
    'Painted exactly in the style of images 2 and 3 (our approved style references): a hand-painted game environment with soft '
    'painterly brushwork, weathered and lived-in materials (worn chipped stone, grey sun-bleached wood, patched mossy roofs, faded '
    'cloth), a warm earthy MUTED palette (dusty ochre, warm grey stone, faded terracotta and dull slate roofs, olive and sage greens), '
    'Match the colour grading of image 2 exactly: desaturated warm brown-grey overall, stone is pale weathered grey-beige (NOT yellow, '
    'NOT orange, NOT golden), calm stone walls with simple soft block shapes rather than busy patchy blotches; '
    'soft warm afternoon light from the upper left with gentle shadows and soft ambient occlusion, believable proportions (not chibi, '
    'not a toy). Detail is moderate and loose, not over-rendered. NOT a photo, NOT a glossy 3D render, NO gold trim, NO glow, NO rim '
    'highlights on every edge, no sparkles, no ornament spam, not over-sharpened, no outlines.'
)
# ── 11-09 精致风 A(用户:「不朽箴言 可以参考这款游戏,画风比较精致」→ 原型 city_jw_a「午后金光」拍板)──
# STYLE=jw:图 2 = city_jw_a 整图、图 3 = 它的左上局部(雕花石作 / 喷泉细节);只借通用特征,不喂那款游戏的任何截图;产物放 city4j
_STY_DIRS = lambda n: [os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'style_proto', n), os.path.join(ROOT, '周报截图', '2026-11-09_地图画风原型', n)]
if STYLE == 'jw':
    FA_REFS = [_STY_DIRS('city_jw_a.png'), _STY_DIRS('jwa_detail_crop.png')]
    FA_GROUND_REF = _STY_DIRS('jwa_ground_crop.png')
    FA = (
        'Painted exactly in the style of images 2 and 3 (our approved style references): a refined, high-detail fantasy illustration '
        'with crisp clean edges, finely carved ornamental gothic stonework (tracery, carved trims, small reliefs), pale silver-grey stone '
        'and worn marble, deep slate-blue roofs, dark timber, restrained gold and dark-iron accents (small gold finials and trims, not '
        'everywhere), jewel-tone accents (deep violet and sapphire cloth, a few violet flowers), warm late-afternoon golden light from '
        'the upper left with soft shadows and a gentle warm rim light, polished and clean, rich but controlled detail, believable '
        'proportions (not chibi, not a toy). NOT a photo, NOT muddy brushwork, NOT cartoon, no glow effects, no sparkles, no outlines.'
    )
if STYLE in ('fa', 'jw'):
    OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city4f' if STYLE == 'fa' else 'city4j')
    _concept = 'an aerial photo style game map of a sunny walled late-medieval capital city of honey-coloured limestone'
    _ctx = 'image 2 is the whole concept for context'
    _sty = 'images 2 and 3 are the ART STYLE references you must match (ignore their content)'
    # 11-09 用户:「房子看起来是斜的歪的」——生图默认给 45° 等距角,和游戏正俯视镜头不符 → 强制正面朝镜头
    FRONTAL = ('CAMERA (very important): the camera looks straight ahead (north), tilted about 50 degrees down, with NO yaw rotation. '
               'The main front of the object faces the viewer squarely: its front edge and roof ridge run perfectly horizontal, parallel '
               'to the bottom edge of the image; all vertical edges are perfectly vertical; the side walls are barely visible or not '
               'visible at all. NOT a 45-degree isometric corner view, NOT turned, NOT tilted, no fisheye. Same camera as the houses in '
               'image 2. ')
    OBJ = OBJ.replace(PHOTO, FA).replace(_ctx, _sty).replace(_concept, 'a walled late-medieval capital city').replace('scale and material only', 'scale and building type only')
    if STYLE == 'jw':
        FRONTAL = FRONTAL.replace('Same camera as the houses in image 2. ', 'IGNORE the 45-degree angle of the houses in the style references; use this frontal camera. ')
    OBJ = OBJ.replace('Generate ONE new image', FRONTAL + 'Generate ONE new image').replace('like an isometric ARPG camera', 'like a top-down ARPG camera looking straight north')
    FLAT = FLAT.replace(PHOTO, FA).replace(_ctx, _sty).replace(_concept, 'a walled late-medieval capital city')
    _tex_extra = ' Paint it like the ground in the references: broad soft brush patches with ' if STYLE == 'fa' else ' Match the paving of image 1: neat and refined, not brushy; '
    TEX = TEX.replace(PHOTO, FA.replace('images 2 and 3', 'images 1 and 2') + _tex_extra + 
                      'subtle darker and lighter blotches, NOT a busy repeated tile pattern; about 14 to 18 stones (or tufts) across the '
                      'texture width where stones are visible. LOW CONTRAST, gentle value range, so characters standing on it read clearly.')

# 伐木村画风下单独改写的物件描述(正面构图 / 对称 / 少碎件)
FA_SUBJECT = {
    # 11-09 用户:「格格不入」——实机地面 5 种贴图色相 / 质感 / 石块尺度各不一样(灰条砖街 vs 暖卵石 vs 黄石板),拼成补丁
    # → 全部按 city_fa2 的地面(图 1 = 它的局部)出同一色系:踩实的土 + 半埋的旧卵石,只在石头多少 / 草多少上区分
    'tex_cobble': 'the packed-earth town ground of image 1: warm brown trodden earth with soft broad brush blotches and SPARSE half-buried '
                  'worn rounded cobbles (cobbles cover about a third of the surface, in loose irregular clusters), a few pebbles',
    'tex_cobble_moss': 'the same packed-earth town ground as image 1 but with very few stones, more bare trodden earth, a few small dry '
                       'grass tufts and faint moss patches',
    'tex_street': 'a worn old cobblestone street in exactly the colours of image 1: irregular rounded cobbles of varied size packed '
                  'closely, earth and dust filling the joints, some stones missing showing earth; NOT bricks, NOT rows, NOT a grid',
    'tex_flagstone': 'worn irregular large old flagstones of the same warm brown-grey as the stones in image 1, soft rounded edges, '
                     'earth and dust in the wide joints, a few cracks; NOT a regular grid, NOT square tiles',
    'tex_grass': 'short trodden olive-green and dry yellowish town grass with soft painted strokes and a few bare earth spots, the '
                 'same muted earthy palette as image 1',
    # 11-09 第二版:第一版桥身拉满竖图(显示 1620 长,运河才 460 宽)一路顶到南门 → 要短桥,两端带台阶落到街面
    'canal_bridge': 'a SHORT old single-arch stone footbridge with low parapets, seen from high above looking north, its deck running '
                    'perfectly straight and vertical (NOT diagonal, NOT turned); the whole bridge is only about 1.3 times as long as it '
                    'is wide; at the top and bottom ends the parapets end in small square stone posts and the deck widens slightly with '
                    'two low worn steps down to the street; left and right parapets mirror-symmetrical',
    'cathedral': 'large old gothic cathedral seen from its front: a SYMMETRICAL west facade with the main arched wooden double door '
                 'exactly in the centre, one tall square bell tower rising from the middle of the facade, a big rose window above the '
                 'door, a long dark slate nave roof behind; simple sturdy shapes with only a few small pinnacles, weathered pale grey-beige '
                 'stone with moss',
}

# 精致风 A:地面贴图按原型 A 的细密卵石铺地(图 1 = 它的局部)出同一色系;桥 / 大教堂沿用上面的构图描述,石色换银灰
JW_SUBJECT = dict(FA_SUBJECT)
JW_SUBJECT.update({
    'tex_cobble': 'the fine plaza paving of image 1: small neat rounded-square grey setts laid in gentle sweeping arcs, pale silver-grey '
                  'and warm grey stones lit by warm golden light, thin dark joints, subtle wear',
    'tex_cobble_moss': 'the same fine grey sett paving as image 1 but older and a little irregular, with thin moss lines and a few tiny '
                       'grass tufts in some joints',
    'tex_street': 'a street of slightly larger worn grey setts laid in gentle fan-shaped arcs, the same colours and light as image 1',
    'tex_flagstone': 'large refined pale marble-grey flagstones with thin neat joints and subtle wear, the same colours and light as image 1',
    'tex_grass': 'a neat lush green town lawn of short grass with soft fine detail and a few tiny violet and white flowers, in the warm '
                 'golden light of image 1',
})
JW_SUBJECT['academy'] = ('medieval academy / library seen straight from the front as a single frontal facade: a long two-storey hall with tall pointed windows, a square bell tower at one side and an arched entrance in the middle, pale silver-grey stone and deep slate-blue roofs; NO courtyard, NO garden, NO view from above')
JW_SUBJECT['cathedral'] = JW_SUBJECT['cathedral'].replace('weathered pale grey-beige stone with moss', 'pale silver-grey stone with finely carved tracery and small gold finials')

# 名字: (模板, 参考裁框(原型 city_r1 像素 x0,y0,x1,y1 或 None), 底色, 参数)
SPECS = {
    # ── 地标建筑(纯景观,功能都在终端)──
    'cathedral': ('obj', (680, 0, 960, 205), 'magenta', dict(
        subject='large gothic cathedral of weathered honey-coloured limestone with a tall front tower, pointed arch windows, '
                'flying buttresses and a dark slate roof', short='cathedral', size='Landscape 1536x1024')),
    'guild_hall': ('obj', (380, 150, 680, 300), 'magenta', dict(
        subject='stout medieval mercenary guild hall of rough grey-honey stone with a slate roof, a big arched wooden door, '
                'a small crest shield above it and faded red banners', short='guild hall', size='Landscape 1536x1024')),
    'academy': ('obj', (1004, 130, 1354, 330), 'magenta', dict(
        subject='medieval academy / library building with a square bell tower, tall windows and a cloister arcade with a small inner '
                'garden, honey limestone and slate roofs', short='academy', size='Landscape 1536x1024')),
    'tavern': ('obj', (310, 500, 500, 660), 'magenta', dict(
        subject='cosy two-storey timber-framed tavern with white plaster panels, a mossy terracotta roof, a hanging sign and '
                'wooden benches and tables in front', short='tavern with its benches')),
    'barracks': ('obj', (1374, 290, 1754, 420), 'magenta', dict(
        subject='long stone barracks building with a slate roof, a weapon rack and a training dummy beside the door',
        short='barracks', size='Landscape 1536x1024')),
    'gatehouse': ('obj', (490, 760, 650, 870), 'magenta', dict(
        subject='medieval city gatehouse: two round crenellated stone towers with an arched gateway and an open portcullis between '
                'them, seen from inside the city', short='gatehouse', size='Landscape 1536x1024')),
    'wall_h': ('obj', (650, 790, 900, 870), 'magenta', dict(
        subject='straight section of a thick crenellated medieval city wall of weathered limestone running left to right, with a '
                'wooden walkway visible on top', short='wall section', size='Landscape 1536x1024')),
    'wall_tower': ('obj', (1714, 670, 1774, 780), 'magenta', dict(
        subject='round crenellated medieval wall tower of weathered limestone with arrow slits', short='tower',
        size='Portrait 1024x1536')),
    'wall_v': ('obj', (1594, 60, 1754, 300), 'magenta', dict(
        subject='section of a crenellated medieval city wall running AWAY from the viewer (from the bottom of the image toward the '
                'top), seen from inside the city at a high oblique angle, weathered limestone', short='wall section',
        size='Portrait 1024x1536')),
    # ── 民居(6 种)──
    'house_a': ('obj', (340, 330, 500, 400), 'magenta', dict(
        subject='medieval two-storey stone townhouse of honey limestone with a steep dark slate roof, a chimney and small windows '
                'with wooden shutters', short='house')),
    'house_b': ('obj', (1174, 390, 1314, 470), 'magenta', dict(
        subject='medieval timber-framed townhouse with white plaster panels, an overhanging upper floor and a dark slate roof',
        short='house')),
    'house_c': ('obj', (740, 520, 880, 600), 'magenta', dict(
        subject='medieval stone house with a faded terracotta tile roof, a chimney, flower boxes under the windows', short='house')),
    'house_d': ('obj', (560, 540, 640, 640), 'magenta', dict(
        subject='narrow tall three-storey medieval townhouse, stone ground floor and timber-framed upper floors, steep slate roof',
        short='house', size='Portrait 1024x1536')),
    'house_e': ('obj', (0, 600, 130, 670), 'magenta', dict(
        subject='pair of attached medieval row houses, one with a terracotta roof and one with a slate roof, timber details',
        short='row houses', size='Landscape 1536x1024')),
    'house_f': ('obj', (1294, 470, 1414, 560), 'magenta', dict(
        subject='medieval corner shop house: stone walls, slate roof, a canvas awning over a ground-floor shop window with goods',
        short='house')),
    # ── 集市 / 街景 ──
    'stall_a': ('obj', (904, 490, 1010, 590), 'magenta', dict(
        subject='medieval market stall with a striped cream-and-red canvas awning, a wooden counter with baskets of fruit and '
                'vegetables', short='market stall')),
    'stall_b': ('obj', (1010, 490, 1114, 590), 'magenta', dict(
        subject='medieval market stall with a plain beige canvas awning, a wooden counter with bolts of cloth and pottery',
        short='market stall')),
    'notice_board': ('obj', (830, 470, 875, 525), 'magenta', dict(
        subject='wooden town notice board with a small shingle roof on two posts, covered with pinned parchment notices',
        short='notice board', size='Portrait 1024x1536')),
    'fountain': ('obj', (180, 320, 240, 360), 'magenta', dict(
        subject='small round stone fountain with a central pillar and water in the basin', short='fountain')),
    'well': ('obj', (180, 320, 240, 360), 'magenta', dict(
        subject='old round stone well with a small wooden roof, a crank and a bucket', short='well', size='Portrait 1024x1536')),
    'lamp': ('obj', (640, 380, 660, 430), 'magenta', dict(
        subject='single wrought-iron medieval street lamp post with a glass lantern on top', short='lamp post',
        size='Portrait 1024x1536')),
    'bench': ('obj', (450, 620, 520, 660), 'magenta', dict(
        subject='weathered wooden bench with iron legs', short='bench', size='Landscape 1536x1024')),
    'planter': ('obj', (130, 600, 260, 640), 'cyan', dict(
        subject='rectangular stone planter box overflowing with red and white flowers and green leaves', short='planter',
        size='Landscape 1536x1024')),
    'banner': ('obj', (720, 380, 760, 440), 'magenta', dict(
        subject='tall wooden pole with a long hanging royal banner of deep blue cloth with a gold sun emblem', short='banner pole',
        size='Portrait 1024x1536')),
    'statue': ('obj', (720, 380, 760, 440), 'magenta', dict(
        subject='weathered stone statue of an armoured knight holding a sword point-down, on a square stone plinth', short='statue',
        size='Portrait 1024x1536')),
    'barrels': ('obj', (1110, 560, 1170, 600), 'magenta', dict(
        subject='group of three old wooden barrels and a sack', short='barrels')),
    'hedge': ('obj', (130, 300, 260, 330), 'cyan', dict(
        subject='short straight section of a neatly trimmed green garden hedge running left to right', short='hedge',
        size='Landscape 1536x1024')),
    # ── 贴地件 ──
    'plaza': ('flat', (670, 395, 850, 505), 'magenta', dict(
        subject='a round cobbled town square seen from above with a large old brass compass rose inlaid in the paving',
        edge='the round cobbled square (outside it nothing)', size='Square 1024x1024')),
    'canal': ('flat', (300, 690, 600, 760), 'magenta', dict(
        subject='a straight section of a stone-lined town canal with calm dark green water, running from the left edge to the right '
                'edge of the image', edge='the top and bottom stone embankment walls (left and right ends are cut straight and '
                'continue out of the image)', size='Landscape 1536x1024')),
    'canal_bridge': ('flat', (575, 660, 680, 790), 'magenta', dict(
        subject='an old single-arch stone bridge with low parapets, seen from above, spanning from the top to the bottom of the '
                'image', edge='the bridge itself (no water, no ground)', size='Portrait 1024x1536')),
    'boat': ('flat', (1254, 680, 1394, 735), 'magenta', dict(
        subject='a small moored wooden river boat seen from above', edge='the boat hull', size='Landscape 1536x1024')),
    # ── 11-09 A 手绘风:城里的树 / 灌木(原来借用晨风村写实树,和手绘房子画风对不上)──
    'tree_oak': ('obj', None, 'magenta', dict(subject='a lush rounded oak tree with a full leafy crown and a sturdy trunk', short='tree',
                 size='Portrait 1024x1536')),
    'tree_pine': ('obj', None, 'magenta', dict(subject='a neat conical evergreen fir tree', short='tree', size='Portrait 1024x1536')),
    'bush': ('obj', None, 'cyan', dict(subject='a small round leafy green garden shrub with a few tiny white flowers', short='bush')),
    # ── 11-09 P1 广场大道版主城新增(手绘风)──
    'pond': ('flat', None, 'magenta', dict(subject='a small park pond with a rounded natural shape, clear teal water with a few lily pads, '
             'edged with rounded stones and a little grass', edge='the stone-edged pond bank', size='Landscape 1536x1024')),
    'pier': ('flat', None, 'magenta', dict(subject='a wooden canal pier: a straight plank boardwalk on wooden posts with a few mooring '
             'posts and a rope coil, running left to right', edge='the pier itself (no water)', size='Landscape 1536x1024')),
    'rocks': ('obj', None, 'magenta', dict(subject='a cluster of rounded grey boulders with moss and a few grass tufts', short='boulders',
              size='Landscape 1536x1024')),
    'cypress': ('obj', None, 'magenta', dict(subject='a tall slender dark green Italian cypress tree', short='tree',
                size='Portrait 1024x1536')),
    'flower_bed': ('obj', None, 'cyan', dict(subject='a low rectangular stone-bordered flower bed full of red and white flowers and a '
                   'small shrub', short='flower bed', size='Landscape 1536x1024')),
    # ── 地面材质(无缝)──
    'tex_cobble': ('tex', None, None, dict(subject='old worn medieval cobblestone paving of rounded honey-grey stones with dust in the joints')),
    'tex_cobble_moss': ('tex', None, None, dict(subject='old uneven cobblestones with moss, weeds and packed earth in the gaps')),
    'tex_grass': ('tex', None, None, dict(subject='short well-kept town park lawn with a few clover and tiny daisies')),
    'tex_street': ('tex', None, None, dict(subject='main street paving of larger rectangular worn grey-honey setts laid in rows')),
    'tex_flagstone': ('tex', None, None, dict(subject='large worn square limestone flagstones of a square in front of a cathedral')),
    # 11-10 用户实机「好别扭」+ 给了几张战斗场地参考(只取通用特征:大块石板、稀疏裂缝、低对比、细节留给边缘)
    'tex_slab': ('tex', None, None, dict(subject='large worn stone slabs')),
    # ── NPC(画风参考 npc_chief)──
    'npc_scholar': ('npc', None, 'magenta', dict(subject='an imperial scholar: a middle-aged man with round spectacles and a short grey '
                    'beard, deep blue scholar robe with gold trim, holding a big leather-bound book and a rolled map')),
    'npc_guildmaster': ('npc', None, 'magenta', dict(subject='a mercenary guild master: a scarred broad-shouldered woman in her forties '
                        'with short dark hair, worn leather armour with a fur collar, a sword at her hip, arms crossed')),
    'npc_captain': ('npc', None, 'magenta', dict(subject='a city guard captain: a stern man in polished steel half-plate over a blue '
                    'tabard with a gold sun emblem, helmet under one arm, a halberd in the other hand')),
    'npc_merchant': ('npc', None, 'magenta', dict(subject='a cheerful plump general-goods merchant in a green vest, white shirt and '
                     'apron, carrying a wooden crate of goods')),
    'npc_innkeeper': ('npc', None, 'magenta', dict(subject='a burly tavern keeper with a big moustache, rolled-up sleeves and a stained '
                      'apron, holding a tankard and a cloth')),
    'npc_bard': ('npc', None, 'magenta', dict(subject='a young travelling bard with a feathered hat and a red cape, playing a lute')),
    'npc_flower_girl': ('npc', None, 'magenta', dict(subject='a young flower seller woman in a simple dress and headscarf holding a '
                        'basket of flowers')),
    'npc_old_man': ('npc', None, 'magenta', dict(subject='an old townsman with a walking stick, a brown wool coat and a flat cap')),
    'npc_child': ('npc', None, 'magenta', dict(subject='a small town boy about eight years old in a tunic and short trousers, holding a '
                  'wooden toy sword')),
    'npc_guard': ('npc', None, 'magenta', dict(subject='a city guard in a steel kettle helmet and chainmail under a blue tabard with a '
                  'gold sun emblem, holding a spear upright, standing at attention')),
    'npc_vendor': ('npc', None, 'magenta', dict(subject='a market vendor woman with rolled sleeves and an apron, holding up an apple')),
    # 11-08 第 2 章:灰岩荒原流浪者营地首领
    'npc_wanderer': ('npc', None, 'magenta', dict(subject='a weathered wasteland caravan leader: a lean grey-bearded man in a dusty hooded '
                     'travel cloak and patched leather, a scarf around his neck, a curved knife at his belt, leaning on a staff')),
    # 11-09 第 3 章:枯木林精灵守望者营地的守望者
    'npc_warden': ('npc', None, 'magenta', dict(subject='a tall slender elven forest warden woman with long silver-blond hair and pointed '
                   'ears, in a weathered moss-green hooded ranger cloak over fitted brown leather armor, a longbow on her back, one hand '
                   'resting on a carved wooden staff, calm and watchful')),
}


def proto():
    for p in PROTO_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('找不到原型 gray_r1.png')


SLAB_PROMPT = (
    'Image 1 and image 2 are our own approved art style references (a refined painted fantasy town in warm late-afternoon light); '
    'use them only for colour, light and rendering quality, ignore their content.\n'
    'Generate ONE new image with your image generation tool: a seamless tileable square ground texture seen from straight above '
    '(orthographic top-down) for a game terrain shader: an old town square paved with LARGE irregular worn stone slabs, only about 5 '
    'to 7 slabs across the whole texture width, slabs of varied size (some square, some long, a few split into two by a crack), '
    'thin soft dark joints, a few sparse hairline cracks and chipped corners, faint dust and very slight wear in the joints. '
    'Refined hand-painted look with soft subtle brushwork inside each slab, calm surfaces, NOT a photo, NOT cartoon, NOT glossy. '
    'Colour: muted warm grey and pale grey-beige stone with only very subtle variation between slabs, matte. '
    'VERY LOW CONTRAST and a gentle value range so characters standing on it read clearly; no strong outlines on the slabs, no '
    'bevel highlights, no moss, no plants, no objects, no symbols, no large single features. Evenly lit, no directional light '
    'gradient, no vignette. Must tile seamlessly on all four edges. Square 1024x1024. No text.'
)


def prompt_of(name):
    if name == 'tex_slab':
        return SLAB_PROMPT
    tpl, _, key, p = SPECS[name]
    args = dict(extra_no='', size='Square 1024x1024')
    args.update(p)
    if key:
        args['key'] = KEYS[key]
    subj = JW_SUBJECT if STYLE == 'jw' else FA_SUBJECT
    if STYLE in ('fa', 'jw') and name in subj:
        args['subject'] = subj[name]
        if name == 'canal_bridge':
            args['size'] = 'Square 1024x1024'
    if STYLE == 'jw' and name.startswith('house_'):  # 民居几十栋:比地标朴素,否则满城紫旗金饰太花
        args['subject'] += '; an ordinary townhouse, more modest than the landmarks: NO banners, NO heraldry, only two or three tiny gold finials on the roof, simple carved window trims, a flower box'
    text = {'obj': OBJ, 'flat': FLAT, 'tex': TEX, 'npc': NPC}[tpl].format(**args)
    if STYLE in ('fa', 'jw'):  # 写实版的「蜂蜜色石灰岩」会把颜色拉黄 → 伐木村画风换灰米色旧石,精致风换银灰石
        stone, tone = ('pale weathered grey-beige stone', 'grey-beige') if STYLE == 'fa' else ('pale silver-grey stone', 'silver-grey')
        for w in ('honey-coloured limestone', 'honey limestone', 'grey-honey stone', 'honey stone', 'honey-grey', 'grey-honey', 'honey'):
            text = text.replace(w, stone if 'stone' in w or 'limestone' in w else tone)
    return text


def crop_ref(name):
    box = SPECS[name][1]
    if not box:
        return None
    im = Image.open(proto()).convert('RGB')
    x0, y0, x1, y1 = box
    pad = 12
    c = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
    # 裁图太小时放大一点,模型更容易看清
    k = max(1.0, 512 / max(c.size))
    c = c.resize((round(c.width * k), round(c.height * k)), Image.LANCZOS)
    path = os.path.join(OUT, 'ref', name + '.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    c.save(path)
    return path


def crops_sheet():
    names = [n for n in SPECS if SPECS[n][1]]
    tiles = [Image.open(crop_ref(n)) for n in names]
    f = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
    cols = 6
    tw = 260
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * (tw + 24)), (30, 30, 30))
    for i, (n, t) in enumerate(zip(names, tiles)):
        t.thumbnail((tw - 8, tw - 8))
        x, y = (i % cols) * tw, (i // cols) * (tw + 24)
        sheet.paste(t, (x + 4, y + 24))
        ImageDraw.Draw(sheet).text((x + 4, y + 2), n, fill=(240, 220, 160), font=f)
    p = os.path.join(OUT, 'crops_sheet.jpg')
    sheet.save(p, quality=88)
    print(p)


def gen(name):
    dst = os.path.join(OUT, name + '.png')
    if os.path.exists(dst):
        print('skip', name, flush=True)
        return
    refs = [r for r in (crop_ref(name), proto() if SPECS[name][1] else None) if r]
    if STYLE == 'paint':
        style_ref = next((p for p in STYLE_REF_CANDIDATES if os.path.exists(p)), None)
        refs = [r for r in (crop_ref(name), style_ref) if r] if SPECS[name][0] != 'tex' else [style_ref]
    if STYLE in ('fa', 'jw'):
        styles = [next(p for p in c if os.path.exists(p)) for c in FA_REFS]
        # 没有裁框的物件(树 / 灌木 / 池塘…)图 1 也给 city_fa2,保证提示词里的「图 2 / 图 3」对得上号
        refs = ([] if SPECS[name][0] == 'tex' else [crop_ref(name) or styles[0]]) + styles
        if SPECS[name][0] == 'tex':  # 地面贴图:图 1 = city_fa2 地面局部(要贴合的材质),图 2 = city_fa2 整图
            refs = [next(p for p in FA_GROUND_REF if os.path.exists(p)), styles[0]]
    if SPECS[name][0] == 'npc':
        refs = [os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'npc_chief.png')]
    waited = 0
    while other_codex_exec() > 0:
        if waited % 120 == 0:
            print('等别的 Codex 跑完…', flush=True)
        time.sleep(10)
        waited += 10
    before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-city4-')
    cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"',
           '--skip-git-repo-check', '-s', 'read-only', '-C', work]
    for r in refs:
        cmd += ['-i', r]
    cmd.append('-')
    t0 = time.time()
    print('gen', name, flush=True)
    try:
        r = subprocess.run(cmd, input=prompt_of(name).encode('utf-8'), capture_output=True, timeout=1200)
    except subprocess.TimeoutExpired:
        print('TIMEOUT', name, flush=True)
        return
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(GEN) if d not in before]
    mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
    imgs = [p for d in mine for p in glob.glob(os.path.join(GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', name, r.returncode, new_dirs, text[-500:], flush=True)
        return
    shutil.copy(max(imgs, key=os.path.getmtime), dst)
    print('ok', name, f'{time.time() - t0:.0f}s', flush=True)


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    os.makedirs(OUT, exist_ok=True)
    if '--crops' in sys.argv:
        crops_sheet()
        return
    for name in (sys.argv[1:] or [n for n in SPECS if not (STYLE in ('paint', 'fa', 'jw') and SPECS[n][0] == 'npc')]):
        gen(name)
    print('done', OUT, flush=True)


if __name__ == '__main__':
    main()
