# -*- coding: utf-8 -*-
"""灰岩荒原 v4 素材逐件生成(2026-11-08 用户选写实版原型 gray_r1:「AI 感还是比较强,需要更写实,更细腻」)。

做法同 tree_hq_gen:原型里裁出这件东西当参考(只取视角 / 体量 / 材质),Codex 单独重画成「真实航拍照片」质感的独立物件,
纯色平底(品红;紫黑矿晶用青色)由 gray4_install.py 自己抠图;地面材质出无缝方图。
输出 %TEMP%/lootchain-qa/gray4/<名字>.png;已存在的跳过(删掉重出)。和别的会话共用 Codex 时等它跑完再开(见 field_proto_gen)。

用法:python tools/qa/gray4_assets_gen.py [名字 ...]        不带参数 = 全部
     python tools/qa/gray4_assets_gen.py --crops            只出参考裁图拼图(核对裁框)
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
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'gray4')
PROTO_CANDIDATES = [os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_proto', 'gray_r1.png'),
                    os.path.join(ROOT, '周报截图', '2026-11-08_主城荒原重做', 'proto', 'gray_r1.png')]
KEYS = {'magenta': 'pure magenta (#FF00FF)', 'cyan': 'pure cyan (#00FFFF)'}

PHOTO = (
    'Photographic realism, like a crop of a real high-resolution oblique aerial drone photo: true-to-life materials, dust, '
    'weathering, cracks, fine natural detail, realistic proportions, natural soft daylight from the upper left with clear volume '
    '(lit top-left faces, soft cool shadow sides). Muted natural colours, low saturation, matte. NOT an illustration, NOT painterly, '
    'NOT cartoon, NOT glossy, NO glow, no ornament spam, no repeated stamp patterns, no noise or grain, not over-sharpened.'
)

OBJ = (
    'Image 1 is a crop of our approved map concept (an aerial photo style game map of a grey limestone wasteland); image 2 is the '
    'whole concept for context. Use them for the viewing angle (high oblique bird\'s-eye view, about 50 degrees down, like an '
    'isometric ARPG camera), scale and material only.\n'
    'Generate ONE new image with your image generation tool: a single isolated {subject}.\n' + PHOTO + '\n'
    'Only the {short}; no ground patch, no grass, no surrounding rocks{extra_no}, no cast shadow on the ground, no other objects.\n'
    'Background: perfectly flat solid {key} everywhere around it and in every gap, no gradient, no shadow, no glow. Razor sharp '
    'silhouette against the background, no depth of field, no haze, no background colour reflected on the object. Centered with a '
    'small margin. {size}. No text, no frame.'
)

FLAT = (
    'Image 1 is a crop of our approved map concept (an aerial photo style game map of a grey limestone wasteland); image 2 is the '
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

# 名字: (模板, 参考裁框(原型像素 x0,y0,x1,y1 或 None), 底色, 参数)
SPECS = {
    # ── 流浪者营地 ──
    'tent_a': ('obj', (108, 458, 212, 528), 'magenta', dict(
        subject='weathered canvas ridge tent with patched dusty off-white canvas, wooden poles and guy ropes', short='tent')),
    'tent_b': ('obj', (108, 458, 212, 528), 'magenta', dict(
        subject='larger square wall tent of dusty beige canvas with a rolled-up door flap, wooden poles and ropes', short='tent')),
    'wagon': ('obj', (230, 432, 306, 488), 'magenta', dict(
        subject='old covered wagon with a dusty patched canvas hood and big wooden spoked wheels', short='wagon')),
    'cart': ('obj', (256, 480, 322, 522), 'magenta', dict(
        subject='open wooden two-wheel hand cart loaded with a few sacks', short='cart')),
    'crates': ('obj', (196, 470, 240, 500), 'magenta', dict(
        subject='small stack of weathered wooden crates and two old barrels', short='crates and barrels')),
    'fence': ('obj', (70, 480, 160, 560), 'magenta', dict(
        subject='straight section of a weathered grey split-rail wooden fence, running left to right', short='fence section',
        size='Landscape 1536x1024')),
    'campfire': ('obj', (180, 525, 245, 555), 'magenta', dict(
        subject='small campfire: a ring of grey stones around charred logs and ash, a thin wisp of smoke', short='campfire')),
    # ── 盗匪哨岗 / 营寨 ──
    'watchtower': ('obj', (800, 190, 912, 318), 'magenta', dict(
        subject='crude wooden watchtower on four log legs with a small roofed platform and a ladder', short='watchtower',
        size='Portrait 1024x1536')),
    'barricade': ('obj', (740, 250, 800, 300), 'magenta', dict(
        subject='spiked wooden barricade (cheval de frise) of sharpened crossed logs', short='barricade', size='Landscape 1536x1024')),
    'palisade_wall': ('obj', (930, 640, 1060, 760), 'magenta', dict(
        subject='straight section of a palisade wall of sharpened vertical logs lashed together, running left to right',
        short='wall section', size='Landscape 1536x1024')),
    'palisade_gate': ('obj', (1010, 690, 1110, 760), 'magenta', dict(
        subject='palisade gate: a wooden double gate of vertical logs between two small log gate towers', short='gate',
        size='Landscape 1536x1024')),
    'palisade_tower': ('obj', (970, 590, 1030, 660), 'magenta', dict(
        subject='small log watch tower standing on stilts with a plank platform, part of a palisade fort', short='tower',
        size='Portrait 1024x1536')),
    'bandit_tent': ('obj', (1050, 615, 1110, 660), 'magenta', dict(
        subject='rough bandit tent of stained canvas and animal hides with a faded red cloth strip and a spear rack beside it',
        short='tent')),
    # ── 古遗迹 ──
    'arch_ruin': ('obj', (1085, 185, 1290, 300), 'magenta', dict(
        subject='ruined weathered limestone archway: two cracked pillars with a broken round arch on top', short='ruin',
        size='Landscape 1536x1024')),
    'arch_ruin_b': ('obj', (1160, 190, 1290, 300), 'magenta', dict(
        subject='broken ancient limestone wall fragment with half of a collapsed arch and fallen blocks at its foot', short='ruin',
        size='Landscape 1536x1024')),
    'column': ('obj', (1010, 225, 1040, 300), 'magenta', dict(
        subject='single standing broken ancient limestone column with a cracked fluted shaft', short='column',
        size='Portrait 1024x1536')),
    'fallen_column': ('obj', (1180, 290, 1250, 320), 'magenta', dict(
        subject='toppled ancient limestone column lying on its side, broken into three drums', short='column pieces',
        size='Landscape 1536x1024')),
    'ruins_floor': ('flat', (1020, 250, 1300, 340), 'magenta', dict(
        subject='an ancient cracked limestone paved floor of large worn square slabs, some missing, dust and gravel in the joints',
        edge='broken slabs fading into gravel', size='Landscape 1536x1024')),
    # ── 碎岩巨像 ──
    'colossus_head': ('obj', (1630, 140, 1740, 250), 'magenta', dict(
        subject='gigantic fallen stone statue head lying on its side, weathered limestone, cracked and partly broken, lichen',
        short='statue head')),
    'colossus_body': ('obj', (1470, 140, 1760, 300), 'magenta', dict(
        subject='gigantic broken stone statue torso with one outstretched arm lying on the ground in pieces, weathered limestone',
        short='statue pieces', size='Landscape 1536x1024')),
    'standing_stone': ('obj', (1462, 150, 1512, 232), 'magenta', dict(
        subject='tall weathered grey standing stone (menhir), rough and lichen-spotted', short='standing stone',
        size='Portrait 1024x1536')),
    # ── 走私矿坑 ──
    'quarry_pit': ('flat', (1230, 470, 1730, 740), 'magenta', dict(
        subject='a terraced open-pit stone quarry: stepped grey rock benches spiralling down into a deep pit, rubble on the ledges',
        edge='broken rocky rim', size='Landscape 1536x1024')),
    'scaffold': ('obj', (1250, 530, 1400, 640), 'magenta', dict(
        subject='timber mining scaffold / headframe with a pulley wheel and a short wooden ramp', short='scaffold')),
    'ore_cart': ('obj', (1420, 670, 1500, 700), 'magenta', dict(
        subject='old iron mine cart full of grey ore on a short piece of rail track', short='mine cart and rails',
        size='Landscape 1536x1024')),
    'spoil_heap': ('obj', (1300, 480, 1400, 530), 'magenta', dict(
        subject='heap of broken grey rock rubble and spoil from a quarry', short='rubble heap')),
    'crystal_cluster': ('obj', (1500, 560, 1600, 640), 'cyan', dict(
        subject='cluster of dark purple-black corrupted crystals jutting out of a grey rock, faint inner violet sheen, no glow',
        short='crystal cluster with its rock')),
    # ── 地形 ──
    'gorge_a': ('flat', (500, 0, 700, 440), 'magenta', dict(
        subject='a straight section of a narrow dry rocky gorge running from the top edge to the bottom edge of the image: steep '
                'grey limestone walls with ledges, a dry stony river bed at the bottom', edge='the gorge rim on the left and right '
                '(top and bottom ends are cut straight and continue out of the image)', size='Portrait 1024x1536')),
    'gorge_b': ('flat', (540, 440, 720, 887), 'magenta', dict(
        subject='a gently bending section of a narrow dry rocky gorge running from the top edge to the bottom edge of the image: '
                'steep grey limestone walls with ledges, a dry stony river bed at the bottom', edge='the gorge rim on the left and '
                'right (top and bottom ends are cut straight and continue out of the image)', size='Portrait 1024x1536')),
    'bridge': ('flat', (480, 440, 700, 525), 'magenta', dict(
        subject='an old weathered single-span stone arch bridge with low parapets, seen from above, spanning left to right',
        edge='the bridge itself (no gorge, no ground)', size='Landscape 1536x1024')),
    'mesa': ('obj', (0, 0, 560, 140), 'magenta', dict(
        subject='large outcrop of layered grey limestone cliffs / mesa with eroded vertical flutes and scree at its foot',
        short='cliff outcrop', size='Landscape 1536x1024')),
    'rock_pillar': ('obj', (95, 80, 170, 195), 'magenta', dict(
        subject='tall eroded badlands rock pillar (hoodoo) of layered grey and beige limestone', short='rock pillar',
        size='Portrait 1024x1536')),
    'boulders_l': ('obj', (1300, 410, 1400, 460), 'magenta', dict(
        subject='cluster of three large weathered grey limestone boulders', short='boulders', size='Landscape 1536x1024')),
    'boulders_m': ('obj', (870, 540, 930, 575), 'magenta', dict(
        subject='two medium weathered grey limestone boulders', short='boulders')),
    'scrub': ('obj', (810, 520, 845, 555), 'magenta', dict(
        subject='thorny dry desert scrub bush with small grey-green leaves and twiggy branches', short='bush')),
    'dry_grass': ('obj', (300, 380, 330, 400), 'magenta', dict(
        subject='clump of dry pale straw-coloured wild grass', short='grass clump')),
    'stones': ('obj', (420, 560, 470, 590), 'magenta', dict(
        subject='a few scattered small grey stones and pebbles', short='stones', extra_no='')),
    'bones': ('obj', (220, 720, 290, 760), 'magenta', dict(
        subject='bleached animal skeleton: a horned skull and a curved rib cage lying on the ground', short='bones')),
    # ── 地面材质(无缝)──
    'tex_earth': ('tex', None, None, dict(subject='grey-beige dry cracked earth with fine gravel and dust, small polygonal cracks')),
    'tex_gravel': ('tex', None, None, dict(subject='pale grey limestone gravel and pebbles over dusty ground')),
    'tex_drygrass': ('tex', None, None, dict(subject='sparse short dry straw-coloured grass and tiny thorny weeds over dusty grey earth')),
    'tex_track': ('tex', None, None, dict(subject='pale packed dirt track surface with fine dust, small embedded pebbles, faint footprints')),
    'tex_scree': ('tex', None, None, dict(subject='grey limestone scree: angular broken rock fragments of mixed sizes, dust between them')),
}


def proto():
    for p in PROTO_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('找不到原型 gray_r1.png')


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
    work = tempfile.mkdtemp(prefix='lc-gray4-')
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
