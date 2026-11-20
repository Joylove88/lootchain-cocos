# -*- coding: utf-8 -*-
"""野外「整图重绘」上限原型(2026-11-20 用户看完第一期:「还是和守卫图差远了」)。

调色 / 光影 / 换材质都只是在旧素材上加工;这里看「把地图画面本身按守卫战背景的画法重画」能到什么程度:
同一帧分层截图里去掉角色的那层(L2_bg,地面 + 立物)取中间 16:9 一块,连同守卫战同主题背景一起交给生图,
「布局一样、按守卫战背景的画法重画」;再把角色 / 特效(L1 − L2)和界面(L0 − L1)原样贴回。

  python tools/qa/field_repaint_proto.py GRAY      # 出 proto_repaint/GRAY_repaint.png + 对比图
"""
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_tex_regen import run_codex  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SHOTS = os.path.join(ROOT, '周报截图', '2026-11-20_野外画质提升')
BG = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle')
OUT = os.path.join(SHOTS, 'proto_repaint')
REF = {'GRAY': 'battle_scene_field_wasteland.jpg', 'WOODS': 'battle_scene_field_forest.jpg', 'DEADWOOD': 'battle_scene_daily_abyss.jpg',
       'VILLAGE': 'battle_scene_field_forest.jpg'}
BOX = (240, 0, 2160, 1080)   # 2400×1080 截图中间 16:9 一块

PROMPT = (
    'Image 1 is a screenshot of one area of our game\'s top-down field map (the ground and the props only, characters removed). '
    'Image 2 is a battle background from the same game; it has the art quality we want: a calm, clean, painted-realism ground with '
    'large smooth areas, details concentrated on the edges, one consistent soft light direction with real cast shadows and ambient '
    'occlusion, atmospheric depth, harmonious muted colours.\n'
    'Generate ONE new image with your image generation tool: re-render image 1 at the art quality of image 2. Keep the exact same '
    'top-down camera, framing and layout: every path, rock, tent, wagon, tree, cliff and patch of ground stays in the same place with '
    'the same size and outline, so the walkable areas do not change. Unify everything under one light from the upper left: props '
    'get proper contact shadows and blend into the ground, the open ground becomes calm and clean (no carpet of tiny debris), '
    'subtle large-scale tonal variation and soft light patches. Muted natural colours like image 2, matte, not glossy.\n'
    'No characters, no creatures, no UI, no text. Not an illustration or cartoon; realistic painted game art. No blur, no noise, '
    'no film grain, no glow, no vignette. Landscape 16:9.'
)


def arr(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32) / 255


def mask(a, b, thr, grow):
    d = np.abs(a - b).max(axis=2)
    m = Image.fromarray(((d > thr) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(grow)).filter(ImageFilter.GaussianBlur(1.2))
    return (np.asarray(m, dtype=np.float32) / 255)[..., None]


def main():
    code = sys.argv[1] if len(sys.argv) > 1 else 'GRAY'
    os.makedirs(OUT, exist_ok=True)
    layers = os.path.join(SHOTS, 'layers', code)
    tmp = tempfile.mkdtemp(prefix='lc-repaint-')
    src = os.path.join(tmp, 'bg.png')
    Image.open(os.path.join(layers, 'phone_L2_bg.png')).convert('RGB').crop(BOX).save(src)
    ref = os.path.join(tmp, 'ref.jpg')
    Image.open(os.path.join(BG, REF[code])).convert('RGB').resize((1672, 941)).save(ref)
    raw = os.path.join(OUT, f'{code}_repaint_raw.png')
    if not os.path.exists(raw):
        if not run_codex([src, ref], PROMPT, raw, f'repaint {code}'):
            return
    w, h = BOX[2] - BOX[0], BOX[3] - BOX[1]
    bg = np.asarray(Image.open(raw).convert('RGB').resize((w, h), Image.LANCZOS), dtype=np.float32) / 255
    full, actors, bg0 = (arr(os.path.join(layers, f'phone_{n}.png'))[BOX[1]:BOX[3], BOX[0]:BOX[2]] for n in ('L0_full', 'L1_actors', 'L2_bg'))
    m_ui = mask(full, actors, 0.06, 3)
    m_act = mask(actors, bg0, 0.09, 3)
    res = bg * (1 - m_act) + actors * m_act
    res = res * (1 - m_ui) + full * m_ui
    out = os.path.join(OUT, f'{code}_repaint.png')
    Image.fromarray(np.clip(res * 255, 0, 255).astype(np.uint8)).save(out)
    # 对比:改前 / 现在线上(第一期)/ 整图重绘
    now = os.path.join(SHOTS, 'after', {'GRAY': '荒原', 'WOODS': '林地', 'DEADWOOD': '枯木林', 'VILLAGE': '晨风村'}[code] + '_同机位.png')
    rows = [Image.fromarray((full * 255).astype(np.uint8))]
    if os.path.exists(now):
        rows.append(Image.open(now).convert('RGB').crop(BOX))
    rows.append(Image.open(out))
    sheet = Image.new('RGB', (w, len(rows) * (h + 10) - 10), (10, 10, 10))
    for i, r in enumerate(rows):
        sheet.paste(r, (0, i * (h + 10)))
    sheet.save(os.path.join(OUT, f'{code}_改前_第一期_整图重绘.jpg'), quality=88)
    print('saved', out)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
