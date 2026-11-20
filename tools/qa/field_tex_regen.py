# -*- coding: utf-8 -*-
"""野外地面材质重出(2026-11-20 野外画质第二期,用户「先出荒原的新地面材质原型」)。

第一期只对旧材质做了离线降噪(field_tex_calm.py),底子还是「满屏细节」画法。这里按守卫战地面的口径重画平铺材质:
大片安静、低对比的平滑地面,只有稀疏清楚的小细节(几道细裂纹、偶尔一颗碎石),不是均匀撒满的噪点。
参考图 = 我们自己的守卫战背景(荒原战场)地面一块,只取「安静」的质感;材质颜色按各层原来的亮度 / 色相(着色器靠亮度做高度混合,亮度别差太多)。

  python tools/qa/field_tex_regen.py GRAY                # 出荒原 5 张(已存在的跳过,删掉重出)
  python tools/qa/field_tex_regen.py GRAY tex_scree      # 只出某几张
  python tools/qa/field_tex_regen.py GRAY --sheet        # 拼对比图:旧材质 / 新材质 / 新材质 2×2 平铺(查接缝)
输出 %TEMP%/lootchain-qa/field_tex_regen/<地图>/<名字>.png;入库另做(先出原型给用户确认)。
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
WORLD = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world')
BACKUP = os.path.join(ROOT, '素材原始备份', 'field-tex-calm-20261120')
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_tex_regen')
REF_BG = os.path.join(WORLD, '..', 'battle', 'battle_scene_field_wasteland.jpg')
REF_BOX = (500, 760, 1900, 1380)   # 守卫战荒原背景里的一块地面(2508×1412 原图像素)

# 第三版(第一、二版喂守卫战地面当参考 → 五张都被带成空白平面):改成喂这一层的旧材质,做「原样减噪重画」
PROMPT = (
    'Image 1 is the current ground texture of one terrain layer in our game ({subject}). It looks too busy and noisy in game: '
    'the whole surface is an even carpet of tiny debris. Generate ONE new image with your image generation tool: a re-rendered '
    'version of the same material, calmer and cleaner, like the ground in a high-quality painted-realism game.\n'
    'Keep the material clearly recognisable: {detail}. Keep the larger features crisp and well defined, remove about two thirds of '
    'the tiny speckles and crumbs, and let calmer smooth ground with soft large-scale tonal variation show between the feature '
    'groups. Features sit in irregular loose groups, never an even sprinkle, never repeated stamps.\n'
    'Colours: {colour}, close to image 1; muted, low saturation, matte. Realistic photographic material seen from straight above '
    '(orthographic top-down), not an illustration. Not blurry, not smeared, no brush strokes, no noise, no film grain, not '
    'over-sharpened. Evenly lit with no directional light gradient, no vignette, no objects. Must tile seamlessly on all four '
    'edges. Square 1024x1024. No text.'
)

# 第一版(只写「稀疏」)出来五张几乎全是空白平面、层与层分不出(= 用户说过的「磨平」)→ 每层写明细节覆盖率
SPECS = {
    'GRAY': {
        'tex_earth': ('gray4/tex_earth.jpg', dict(subject='dry cracked earth of a limestone wasteland', colour='pale grey-beige',
                                                  detail='a clear network of fine dark hairline cracks dividing the ground into large irregular plates '
                                                         '(plates 15 to 35 percent of the image wide), a few small pebbles, gentle dust tone variation inside the plates')),
        'tex_gravel': ('gray4/tex_gravel.jpg', dict(subject='dusty ground with drifts of pale limestone gravel', colour='pale grey with slightly warmer dust',
                                                    detail='pebbles and small gravel of varied sizes cover about 40 percent of the surface in loose drifts '
                                                           'and clusters, smooth dusty ground between the drifts')),
        'tex_drygrass': ('gray4/tex_drygrass.jpg', dict(subject='dusty earth with small clumps of short dry grass', colour='grey-beige earth, pale straw-yellow grass',
                                                        detail='short dry grass tufts cover about 30 percent of the surface in small separate clumps of '
                                                               'different sizes, bare dusty earth with a few pebbles between them')),
        'tex_track': ('gray4/tex_track.jpg', dict(subject='packed dirt track surface', colour='pale grey-beige, only slightly warm',
                                                  detail='faint shallow wheel ruts and scuffs, fine dust, a scattering of small embedded pebbles over about '
                                                         '10 percent of the surface')),
        'tex_scree': ('gray4/tex_scree.jpg', dict(subject='limestone scree', colour='light grey stone, grey-beige dust',
                                                  detail='angular broken limestone fragments of mixed sizes (small to fist-sized) cover about 55 percent of '
                                                         'the surface in loose groups, fine dust and grit between them')),
    },
}


def ref_image() -> str:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'ref_floor.png')
    if not os.path.exists(path):
        Image.open(REF_BG).convert('RGB').crop(REF_BOX).save(path)
    return path


def match_mean(img: Image.Image, ref: Image.Image) -> Image.Image:
    """平均颜色对齐旧材质(逐通道平移,保留新图自己的明暗起伏)。"""
    import numpy as np
    a = np.asarray(img, dtype=np.float32)
    b = np.asarray(ref, dtype=np.float32)
    a = a + (b.reshape(-1, 3).mean(0) - a.reshape(-1, 3).mean(0))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def run_codex(inputs, prompt, dst, tag, match=None):
    while other_codex_exec() > 0:
        time.sleep(10)
    before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-texregen-')
    cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"', '--skip-git-repo-check', '-s', 'read-only', '-C', work]
    for i in inputs:
        cmd += ['-i', i]
    cmd.append('-')
    t0 = time.time()
    print('gen', tag, flush=True)
    r = subprocess.run(cmd, input=prompt.encode('utf-8'), capture_output=True, timeout=1500)
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(GEN) if d not in before] if os.path.isdir(GEN) else []
    mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
    imgs = [p for d in mine for p in glob.glob(os.path.join(GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', tag, r.returncode, text[-400:], flush=True)
        return False
    img = Image.open(max(imgs, key=os.path.getmtime)).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    img.save(dst.replace('.png', '_raw.png'))
    if match:
        img = match_mean(img, Image.open(match).convert('RGB'))
    img.save(dst)
    print('ok', tag, f'{time.time() - t0:.0f}s', dst, flush=True)
    return True


def sheet(code: str) -> None:
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 26)
    rows = []
    for name, (rel, _) in SPECS[code].items():
        new = os.path.join(OUT, code, name + '.png')
        if not os.path.exists(new):
            continue
        old = Image.open(os.path.join(BACKUP, rel)).convert('RGB').resize((512, 512))
        nw = Image.open(new).convert('RGB')
        tile = Image.new('RGB', (1024, 1024))
        for dx in (0, 512):
            for dy in (0, 512):
                tile.paste(nw.resize((512, 512)), (dx, dy))
        row = Image.new('RGB', (512 * 2 + 1024 // 2 + 20, 512), (20, 20, 20))
        row.paste(old, (0, 0))
        row.paste(nw.resize((512, 512)), (522, 0))
        row.paste(tile.resize((512, 512)), (1044, 0))
        d = ImageDraw.Draw(row)
        d.text((8, 6), f'{name} 旧', fill=(255, 220, 120), font=font)
        d.text((530, 6), '新', fill=(255, 220, 120), font=font)
        d.text((1052, 6), '新 2×2 平铺', fill=(255, 220, 120), font=font)
        rows.append(row)
    out = Image.new('RGB', (rows[0].width, len(rows) * 522), (20, 20, 20))
    for i, r in enumerate(rows):
        out.paste(r, (0, i * 522))
    path = os.path.join(OUT, code, 'sheet.jpg')
    out.save(path, quality=88)
    print('sheet', path)


def main() -> None:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    code = args[0] if args else 'GRAY'
    if '--sheet' in sys.argv:
        sheet(code)
        return
    os.makedirs(os.path.join(OUT, code), exist_ok=True)
    ref = ref_image()
    for name, (_, params) in SPECS[code].items():
        if len(args) > 1 and name not in args[1:]:
            continue
        dst = os.path.join(OUT, code, name + '.png')
        if os.path.exists(dst):
            continue
        old = os.path.join(BACKUP, SPECS[code][name][0])
        run_codex([old], PROMPT.format(**params), dst, f'{code}/{name}', old)


if __name__ == '__main__':
    main()
