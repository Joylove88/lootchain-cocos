# -*- coding: utf-8 -*-
"""枯木林 v4 素材逐件生成(2026-11-09 用户选写实原型 dead_r1,同灰岩荒原 v4 管线 gray4_assets_gen)。

做法同 tree_hq_gen:原型里裁出这件东西当参考(只取视角 / 体量 / 材质),Codex 单独重画成「真实航拍照片」质感的独立物件,
纯色平底(品红)由 dead4_install.py 自己抠图;地面材质出无缝方图。
输出 %TEMP%/lootchain-qa/dead4/<名字>.png;已存在的跳过(删掉重出)。和别的会话共用 Codex 时等它跑完再开(见 field_proto_gen)。

用法:python tools/qa/dead4_assets_gen.py [名字 ...]        不带参数 = 全部
     python tools/qa/dead4_assets_gen.py --crops            只出参考裁图拼图(核对裁框)
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
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'dead4')
PROTO_CANDIDATES = [os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_proto', 'dead_r1.png'),
                    os.path.join(ROOT, '周报截图', '2026-11-09_枯木林', 'proto', 'dead_r1.png')]
KEYS = {'magenta': 'pure magenta (#FF00FF)', 'cyan': 'pure cyan (#00FFFF)'}

PHOTO = (
    'Photographic realism, like a crop of a real high-resolution oblique aerial drone photo: true-to-life materials, dust, '
    'weathering, cracks, fine natural detail, realistic proportions, natural soft daylight from the upper left with clear volume '
    '(lit top-left faces, soft cool shadow sides). Muted natural colours, low saturation, matte. NOT an illustration, NOT painterly, '
    'NOT cartoon, NOT glossy, NO glow, no ornament spam, no repeated stamp patterns, no noise or grain, not over-sharpened.'
)

OBJ = (
    'Image 1 is a crop of our approved map concept (an aerial photo style game map of a dying dead forest in late autumn); image 2 is the '
    'whole concept for context. Use them for the viewing angle (high oblique bird\'s-eye view, about 50 degrees down, like an '
    'isometric ARPG camera), scale and material only.\n'
    'Generate ONE new image with your image generation tool: a single isolated {subject}.\n' + PHOTO + '\n'
    'Only the {short}; no ground patch, no grass, no surrounding rocks{extra_no}, no cast shadow on the ground, no other objects.\n'
    'Background: perfectly flat solid {key} everywhere around it and in every gap, no gradient, no shadow, no glow. Razor sharp '
    'silhouette against the background, no depth of field, no haze, no background colour reflected on the object. Centered with a '
    'small margin. {size}. No text, no frame.'
)

FLAT = (
    'Image 1 is a crop of our approved map concept (an aerial photo style game map of a dying dead forest in late autumn); image 2 is the '
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

# 名字: (模板, 参考裁框(原型 dead_r1 像素 x0,y0,x1,y1 或 None), 底色, 参数)
SPECS = {
    # ── 精灵守望者营地 ──
    'elf_tent': ('obj', (190, 362, 252, 408), 'magenta', dict(
        subject='slender elven ranger tent of pale weathered canvas with a tall ridge pole and guy ropes', short='tent')),
    'elf_tent_b': ('obj', (240, 390, 295, 425), 'magenta', dict(
        subject='small low elven lean-to tent of pale grey-green canvas stretched between two carved poles', short='tent')),
    'watch_platform': ('obj', (135, 325, 200, 420), 'magenta', dict(
        subject='slender carved wooden watch platform on four tall legs with a small shingled roof and a ladder', short='watch platform',
        size='Portrait 1024x1536')),
    'campfire': ('obj', (205, 445, 280, 485), 'magenta', dict(
        subject='small campfire: a ring of mossy grey stones around charred logs and ash, a thin wisp of smoke', short='campfire')),
    'stump_seat': ('obj', (255, 480, 300, 505), 'magenta', dict(
        subject='three short cut tree-stump seats with mossy tops', short='stumps')),
    # ── 枯死古树林 ──
    'giant_dead_tree': ('obj', (290, 20, 470, 270), 'magenta', dict(
        subject='gigantic ancient dead tree: a massive split hollow grey trunk with huge exposed gnarled roots and a few broken bare '
                'limbs, moss and bracket fungi', short='tree', size='Portrait 1024x1536')),
    'giant_dead_tree_b': ('obj', (495, 35, 610, 200), 'magenta', dict(
        subject='huge old dead tree with a shattered jagged top, peeling grey bark, thick buttress roots, no leaves', short='tree',
        size='Portrait 1024x1536')),
    'dead_snag': ('obj', (200, 100, 250, 265), 'magenta', dict(
        subject='tall broken dead tree snag: a bare grey trunk snapped off halfway with stubby dead branches and moss at its foot',
        short='snag', size='Portrait 1024x1536')),
    'dead_spruce': ('obj', (1625, 450, 1695, 730), 'magenta', dict(
        subject='tall thin dead spruce tree: grey bare trunk with short dry dead twigs all the way up, no needles', short='tree',
        size='Portrait 1024x1536')),
    'autumn_sapling': ('obj', (595, 200, 660, 270), 'magenta', dict(
        subject='small young beech tree with the last brown-orange autumn leaves on thin twigs', short='small tree')),
    'fallen_log': ('obj', (40, 288, 140, 324), 'magenta', dict(
        subject='long fallen dead tree trunk lying on the ground, grey bark peeling, moss, broken branch stubs', short='fallen log',
        size='Landscape 1536x1024')),
    'root_tangle': ('obj', (540, 395, 800, 485), 'magenta', dict(
        subject='tangle of enormous exposed grey tree roots arching left to right like a natural bridge', short='root bridge',
        size='Landscape 1536x1024')),
    # ── 黑泥沼泽 ──
    'bog_pool': ('flat', (300, 640, 600, 820), 'magenta', dict(
        subject='a stagnant black bog pool: dark still water with mud banks, dead reeds and a few drowned twigs',
        edge='black mud bank', size='Landscape 1536x1024')),
    'reeds': ('obj', (420, 740, 485, 800), 'magenta', dict(
        subject='clump of dead brown bog reeds and sedge grass', short='reeds')),
    'drowned_stump': ('obj', (400, 690, 455, 760), 'magenta', dict(
        subject='rotten broken tree stump with jagged splintered top, black with wet mud at the base', short='stump')),
    'web_snag': ('obj', (30, 540, 165, 625), 'magenta', dict(
        subject='two thin dead trees with a large torn grey spider web stretched between them', short='trees and web',
        size='Landscape 1536x1024')),
    # ── 鸦岩 ──
    'crag': ('obj', (887, 95, 1085, 215), 'magenta', dict(
        subject='large outcrop of mossy grey granite boulders with lichen, a rocky crag', short='rock outcrop',
        size='Landscape 1536x1024')),
    'mossy_boulder': ('obj', (895, 350, 935, 385), 'magenta', dict(
        subject='single mossy grey granite boulder with lichen patches', short='boulder')),
    # ── 旧墓园 + 礼拜堂 ──
    'chapel_ruin': ('obj', (780, 505, 1000, 690), 'magenta', dict(
        subject='ruined roofless small gothic stone chapel: grey limestone walls with a pointed arch window, collapsed parts and ivy',
        short='ruin', size='Landscape 1536x1024')),
    'headstones': ('obj', (930, 680, 1040, 745), 'magenta', dict(
        subject='group of four old leaning weathered grey headstones with moss', short='headstones')),
    'headstone': ('obj', (940, 690, 975, 735), 'magenta', dict(
        subject='single old leaning weathered grey headstone with a rounded top and moss', short='headstone')),
    'iron_fence': ('obj', (880, 735, 1000, 795), 'magenta', dict(
        subject='straight section of an old rusty wrought-iron cemetery fence with pointed railings, running left to right',
        short='fence section', size='Landscape 1536x1024')),
    # ── 废弃伐木村 ──
    'cottage': ('obj', (1300, 510, 1435, 610), 'magenta', dict(
        subject='abandoned old timber cottage with a sagging mossy shingle roof and a stone chimney, broken window',
        short='cottage', size='Landscape 1536x1024')),
    'cottage_collapsed': ('obj', (1115, 585, 1245, 695), 'magenta', dict(
        subject='collapsed abandoned timber hut: the roof caved in, broken planks and rafters', short='hut')),
    'cottage_collapsed_b': ('obj', (1405, 595, 1545, 690), 'magenta', dict(
        subject='half-collapsed timber cabin with a broken mossy roof sliding off one side', short='cabin',
        size='Landscape 1536x1024')),
    'log_stack': ('obj', (1325, 640, 1415, 685), 'magenta', dict(
        subject='neat stack of cut grey-brown logs, weathered', short='log stack', size='Landscape 1536x1024')),
    'broken_cart': ('obj', (1270, 690, 1390, 745), 'magenta', dict(
        subject='broken old wooden hand cart with one big spoked wheel, tilted, planks weathered grey', short='cart',
        size='Landscape 1536x1024')),
    # ── 低语石阵 ──
    'standing_stone': ('obj', (1165, 180, 1225, 265), 'magenta', dict(
        subject='tall mossy weathered grey standing stone (menhir) with faint worn carved runes', short='standing stone',
        size='Portrait 1024x1536')),
    'standing_stone_b': ('obj', (1225, 255, 1290, 330), 'magenta', dict(
        subject='short squat mossy standing stone, rounded top, lichen spots', short='standing stone')),
    # ── 女巫谷 ──
    'world_tree': ('obj', (1440, 0, 1774, 380), 'magenta', dict(
        subject='colossal ancient dead world-tree: an enormous split hollow grey trunk with gigantic twisting roots and a vast crown '
                'of bare grey branches', short='tree', size='Portrait 1024x1536')),
    'witch_hut': ('obj', (1560, 265, 1680, 360), 'magenta', dict(
        subject='small crooked witch hut of grey weathered planks with a steep sagging mossy roof, built between big roots',
        short='hut')),
    # ── 地形 ──
    'creek_a': ('flat', (680, 0, 790, 440), 'magenta', dict(
        subject='a straight section of a narrow dark forest creek running from the top edge to the bottom edge of the image: dark '
                'water over stones with small white riffles, mossy muddy banks', edge='the muddy banks on the left and right (top '
                'and bottom ends are cut straight and continue out of the image)', size='Portrait 1024x1536')),
    'creek_b': ('flat', (610, 480, 720, 887), 'magenta', dict(
        subject='a gently bending section of a narrow dark forest creek running from the top edge to the bottom edge of the image: '
                'dark water over stones with small riffles, mossy muddy banks', edge='the muddy banks on the left and right (top and '
                'bottom ends are cut straight and continue out of the image)', size='Portrait 1024x1536')),
    'dead_bush': ('obj', (1440, 540, 1500, 600), 'magenta', dict(
        subject='dry brown dead shrub with a few remaining orange-brown leaves', short='bush')),
    'dead_grass': ('obj', (380, 790, 440, 830), 'magenta', dict(
        subject='clump of dead brown and straw-coloured wild grass', short='grass clump')),
    'mushrooms': ('obj', None, 'magenta', dict(
        subject='small cluster of pale beige forest mushrooms growing from a mossy root', short='mushrooms')),
    'branches': ('obj', (1180, 470, 1260, 500), 'magenta', dict(
        subject='a few scattered fallen dead grey branches and twigs', short='branches', extra_no='')),
    # ── 地面材质(无缝)──
    'tex_mud': ('tex', None, None, dict(subject='dark wet forest soil and black mud with a few fallen leaves and tiny twigs')),
    'tex_deadgrass': ('tex', None, None, dict(subject='matted brown dead grass and dry sedge over dark soil')),
    'tex_leaves': ('tex', None, None, dict(subject='thick carpet of fallen brown, rust and orange beech and oak leaves')),
    'tex_track': ('tex', None, None, dict(subject='muddy forest dirt track with fine wet soil, small stones, puddle stains and boot prints')),
    'tex_moss': ('tex', None, None, dict(subject='forest floor of green-brown moss, thin roots and pine needles over dark soil')),
}


def proto():
    for p in PROTO_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('找不到原型 dead_r1.png')


def prompt_of(name):
    tpl, _, key, p = SPECS[name]
    args = dict(extra_no='', size='Square 1024x1024')
    args.update(p)
    if key:
        args['key'] = KEYS[key]
    return {'obj': OBJ, 'flat': FLAT, 'tex': TEX}[tpl].format(**args)


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
    waited = 0
    while other_codex_exec() > 0:
        if waited % 120 == 0:
            print('等别的 Codex 跑完…', flush=True)
        time.sleep(10)
        waited += 10
    before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-dead4-')
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
    for name in (sys.argv[1:] or list(SPECS)):
        gen(name)
    print('done', OUT, flush=True)


if __name__ == '__main__':
    main()
