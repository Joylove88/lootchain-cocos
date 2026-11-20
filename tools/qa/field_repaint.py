# -*- coding: utf-8 -*-
"""野外整图重绘(2026-11-20 用户看完「整图重绘」上限原型:「先重绘林地一张」)。

做法同主城 city_moon_restyle(一张画当地图),但野外图大(林地 20340×9788 世界单位),分块更多:
  1. capture:游戏里隐藏角色 / 怪 / 界面 / 第一期调色层(?fieldlook=0),镜头逐格移动截图(battle_polish_shots + mosaic_steps)
  2. stitch:按 mosaic.json 拼成整图底稿 base.png(每世界单位 PX 像素)
  3. sample / all:底稿切块(1672×941,重叠 20%),交给生图「布局不变、按守卫战背景的画法重画」;
     左 / 上已画好的重叠带贴进参考,块间按重叠带均值对齐色调,重叠带沿差异最小的线切开
  4. status / sheet:进度、整图缩略
产物在 %TEMP%/lootchain-qa/field_repaint/<地图>/

  python tools/qa/field_repaint.py WOODS stitch
  python tools/qa/field_repaint.py WOODS sample 4 3     # 试画第 4 列第 3 行那一块,出对比图
  python tools/qa/field_repaint.py WOODS all            # 整图(可断点续跑)
"""
import glob
import json
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_tex_regen import run_codex  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
QA = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'field_repaint')
BG = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle')
Image.MAX_IMAGE_PIXELS = None

PX = 0.75            # 成品每世界单位像素(手机上林地每世界单位约 1.07 屏幕像素 → 放大约 1.4 倍,同守卫战高清前)
PW, PH = 1672, 941   # 生图出图尺寸 = 每块成品像素
OV = 0.2             # 块间重叠
REF = {'WOODS': 'battle_scene_field_forest.jpg', 'GRAY': 'battle_scene_field_wasteland.jpg', 'DEADWOOD': 'battle_scene_daily_abyss.jpg'}

PROMPT = (
    'Image 1 is one piece of our game\'s top-down field map (ground and props, no characters), a high oblique bird\'s-eye view. '
    'Image 2 is a battle background from the same game; it has the art quality we want: calm, clean painted-realism ground with '
    'large smooth areas, details concentrated where objects are, one consistent soft light direction with real cast shadows and '
    'ambient occlusion, harmonious muted natural colours.\n'
    'Generate ONE new image with your image generation tool: re-render image 1 at the art quality of image 2. Keep exactly the same '
    'camera, framing and layout: every path, clearing, rock, tree, bush, log, bridge, stream, cliff and fence stays in the same '
    'place with the same size and outline, so the walkable areas and obstacles do not change. Light from the upper left: objects '
    'get proper contact shadows and sit in the ground; open ground becomes calm and clean (no carpet of tiny debris); dirt paths '
    'have natural soft edges, gentle wear and a few small stones, no straight parallel lines. Muted natural colours like image 2, '
    'matte, but keep the overall brightness of image 1 (daylight forest, do not darken the scene). {extra}\n'
    'No characters, no creatures, no UI, no text, no frame. Realistic painted game art, not cartoon. No blur, no noise, no film '
    'grain, no glow, no vignette, no depth of field: everything equally sharp. Landscape, exactly 1672x941.'
)
EXTRA_SEAM = ('Image 3 shows the already finished neighbouring pieces (sharp areas) placed exactly where they overlap this piece: '
              'continue them seamlessly, matching their colours, lighting and every object that crosses the border.')


def out_dir(code):
    d = os.path.join(QA, code)
    os.makedirs(os.path.join(d, 'pieces'), exist_ok=True)
    return d


def cmd_stitch(code):
    d = out_dir(code)
    cap = os.path.join(d, 'capture')
    meta = json.load(open(os.path.join(d, 'mosaic.json'), encoding='utf-8'))
    s = 2400 / meta['vw']
    W, H = round(meta['W'] * s), round(meta['H'] * s)
    canvas = Image.new('RGB', (W, H))
    for i in range(meta['cols'] * meta['rows']):
        c, r = i % meta['cols'], i // meta['cols']
        x0 = round((c * meta['sx']) * s)
        y0 = round((r * meta['sy']) * s)
        canvas.paste(Image.open(os.path.join(cap, f'phone_mos_{i:03d}.png')).convert('RGB'), (x0, y0))
    canvas.save(os.path.join(d, 'base_capture.png'))
    base = canvas.resize((round(meta['W'] * PX), round(meta['H'] * PX)), Image.LANCZOS)
    base.save(os.path.join(d, 'base.png'))
    base.resize((base.width // 8, base.height // 8), Image.LANCZOS).save(os.path.join(d, 'base_small.jpg'), quality=85)
    print('stitched', canvas.size, '->', base.size)


def grid(base_size):
    W, H = base_size
    sx, sy = round(PW * (1 - OV)), round(PH * (1 - OV))
    cols = int(np.ceil((W - PW) / sx)) + 1
    rows = int(np.ceil((H - PH) / sy)) + 1
    xs = [min(c * sx, W - PW) for c in range(cols)]
    ys = [min(r * sy, H - PH) for r in range(rows)]
    return xs, ys


def seam_guide(d, xs, ys, c, r):
    """左 / 上已出好的块里和本块重叠的部分贴到本块坐标上(其余透明)→ 给生图当接缝参考;返回 None = 没有邻块。"""
    x0, y0 = xs[c], ys[r]
    guide = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    found = False
    for (cc, rr) in ((c - 1, r), (c, r - 1), (c - 1, r - 1), (c + 1, r - 1)):
        if cc < 0 or rr < 0 or cc >= len(xs):
            continue
        p = os.path.join(d, 'pieces', f'piece_{rr:02d}_{cc:02d}.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        guide.alpha_composite(im, (xs[cc] - x0, ys[rr] - y0)) if False else guide.paste(im, (xs[cc] - x0, ys[rr] - y0), im)
        found = True
    return guide if found else None


def gen_piece(code, c, r, xs, ys):
    d = out_dir(code)
    dst = os.path.join(d, 'pieces', f'piece_{r:02d}_{c:02d}.png')
    if os.path.exists(dst):
        return dst
    base = Image.open(os.path.join(d, 'base.png'))
    tmp = tempfile.mkdtemp(prefix='lc-frp-')
    src = os.path.join(tmp, 'src.png')
    base.crop((xs[c], ys[r], xs[c] + PW, ys[r] + PH)).save(src)
    ref = os.path.join(tmp, 'ref.jpg')
    Image.open(os.path.join(BG, REF[code])).convert('RGB').resize((1672, 941)).save(ref)
    inputs = [src, ref]
    extra = ''
    guide = seam_guide(d, xs, ys, c, r)
    if guide is not None:
        g = Image.open(src).convert('RGBA')
        g = Image.blend(g, Image.new('RGBA', g.size, (0, 0, 0, 255)), 0.55)
        g.alpha_composite(guide)
        gp = os.path.join(tmp, 'guide.png')
        g.convert('RGB').save(gp)
        inputs.append(gp)
        extra = EXTRA_SEAM
    raw = dst.replace('.png', '_raw.png')
    if not run_codex(inputs, PROMPT.format(extra=extra), raw, f'{code} piece r{r} c{c}'):
        return None
    Image.open(raw).convert('RGB').resize((PW, PH), Image.LANCZOS).save(dst)
    return dst


def cmd_sample(code, c, r):
    d = out_dir(code)
    xs, ys = grid(Image.open(os.path.join(d, 'base.png')).size)
    p = gen_piece(code, c, r, xs, ys)
    if not p:
        return
    base = Image.open(os.path.join(d, 'base.png')).crop((xs[c], ys[r], xs[c] + PW, ys[r] + PH))
    s = Image.new('RGB', (PW, PH * 2 + 10), (10, 10, 10))
    s.paste(base, (0, 0))
    s.paste(Image.open(p), (0, PH + 10))
    s.save(os.path.join(d, f'sample_r{r}_c{c}.jpg'), quality=88)
    print('sample', os.path.join(d, f'sample_r{r}_c{c}.jpg'), 'grid', len(xs), 'x', len(ys))


def cmd_all(code):
    d = out_dir(code)
    xs, ys = grid(Image.open(os.path.join(d, 'base.png')).size)
    for r in range(len(ys)):
        for c in range(len(xs)):
            for attempt in range(3):
                if gen_piece(code, c, r, xs, ys):
                    break


def _seam_mask(old, new, axis):
    """重叠带里沿「新旧差异最小」的线切开:返回 0..1 权重(1 = 用新块),axis=1 左右重叠(竖缝),axis=0 上下重叠(横缝)。"""
    diff = np.abs(old - new).sum(axis=2)
    if axis == 0:
        diff = diff.T
    h, w = diff.shape
    cost = diff.copy()
    for y in range(1, h):
        prev = cost[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        cost[y] += np.minimum(np.minimum(left, prev), right)
    path = np.zeros(h, dtype=int)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(np.argmin(cost[y, lo:hi]))
    xs = np.arange(w)[None, :]
    m = np.clip((xs - path[:, None]) / 6.0 + 0.5, 0, 1).astype(np.float32)   # 缝两侧 6 像素软过渡
    return m.T if axis == 0 else m


def cmd_assemble(code):
    """按行优先把块贴进整图:每块先按和已贴部分的重叠带均值对齐色调(只校正 70%),再沿差异最小的线切缝。"""
    d = out_dir(code)
    base = Image.open(os.path.join(d, 'base.png'))
    xs, ys = grid(base.size)
    W, H = base.size
    canvas = np.zeros((H, W, 3), dtype=np.float32)
    filled = np.zeros((H, W), dtype=bool)
    for r in range(len(ys)):
        for c in range(len(xs)):
            p = os.path.join(d, 'pieces', f'piece_{r:02d}_{c:02d}.png')
            x0, y0 = xs[c], ys[r]
            src = np.asarray(Image.open(p).convert('RGB') if os.path.exists(p) else base.crop((x0, y0, x0 + PW, y0 + PH)), dtype=np.float32)
            old = canvas[y0:y0 + PH, x0:x0 + PW]
            f = filled[y0:y0 + PH, x0:x0 + PW]
            if f.any():
                src = src + (old[f].mean(0) - src[f].mean(0)) * 0.7
            w = np.ones((PH, PW), dtype=np.float32)
            if c > 0:
                ov = xs[c - 1] + PW - x0
                w[:, :ov] = np.minimum(w[:, :ov], _seam_mask(old[:, :ov], src[:, :ov], 1))
            if r > 0:
                ov = ys[r - 1] + PH - y0
                w[:ov, :] = np.minimum(w[:ov, :], _seam_mask(old[:ov, :], src[:ov, :], 0))
            w = np.where(f, w, 1.0)[..., None]
            canvas[y0:y0 + PH, x0:x0 + PW] = old * (1 - w) + src * w
            filled[y0:y0 + PH, x0:x0 + PW] = True
    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    out.save(os.path.join(d, 'mosaic.png'))
    out.resize((W // 8, H // 8), Image.LANCZOS).save(os.path.join(d, 'mosaic_small.jpg'), quality=85)
    print('assembled', out.size)


TILE = (2048, 1024)


def cmd_export(code):
    """整图切成游戏图块(2048×1024 JPG,边上的块按实际尺寸)入库 ui/world/<code>_paint/,并生成 LobbyFieldPaintData.ts 里这张图的条目。"""
    d = out_dir(code)
    img = Image.open(os.path.join(d, 'mosaic.png')).convert('RGB')
    W, H = img.size
    dst = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', f'{code.lower()}_paint')
    os.makedirs(dst, exist_ok=True)
    cols, rows = -(-W // TILE[0]), -(-H // TILE[1])
    for r in range(rows):
        for c in range(cols):
            box = (c * TILE[0], r * TILE[1], min(W, (c + 1) * TILE[0]), min(H, (r + 1) * TILE[1]))
            img.crop(box).save(os.path.join(dst, f'p_{r}_{c}.jpg'), quality=84)
    meta = json.load(open(os.path.join(d, 'mosaic.json'), encoding='utf-8'))
    entry = {'px': PX, 'tileW': TILE[0], 'tileH': TILE[1], 'cols': cols, 'rows': rows, 'w': W, 'h': H, 'mapW': meta['W'], 'mapH': meta['H'],
             'dir': f'ui/world/{code.lower()}_paint'}
    data_path = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldPaintData.ts')
    data = {}
    if os.path.exists(data_path):
        txt = open(data_path, encoding='utf-8').read()
        data = json.loads(txt[txt.rindex('> = ') + 4: txt.rindex(';')])
    data[code] = entry
    with open(data_path, 'w', encoding='utf-8', newline='\r\n') as fh:
        fh.write('// 由 tools/qa/field_repaint.py export 生成:野外整图重绘的图块表(px = 每世界单位像素;图块从地图左上角起 tileW × tileH 切)。\n')
        fh.write('export interface FieldPaintDef { px: number; tileW: number; tileH: number; cols: number; rows: number; w: number; h: number; mapW: number; mapH: number; dir: string }\n')
        fh.write('export const FIELD_PAINT: Record<string, FieldPaintDef> = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    total = sum(os.path.getsize(os.path.join(dst, f)) for f in os.listdir(dst) if f.endswith('.jpg'))
    print('exported', cols, 'x', rows, 'tiles', round(total / 1e6, 1), 'MB ->', dst)


def cmd_status(code):
    d = out_dir(code)
    xs, ys = grid(Image.open(os.path.join(d, 'base.png')).size)
    done = len([p for p in glob.glob(os.path.join(d, 'pieces', 'piece_*.png')) if not p.endswith('_raw.png')])
    print(f'{code}: {done} / {len(xs) * len(ys)} pieces')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    code, cmd = sys.argv[1], sys.argv[2]
    if cmd == 'assemble':
        cmd_assemble(code)
    elif cmd == 'export':
        cmd_export(code)
    elif cmd == 'stitch':
        cmd_stitch(code)
    elif cmd == 'all':
        cmd_all(code)
    elif cmd == 'status':
        cmd_status(code)
    elif cmd == 'sample':
        cmd_sample(code, int(sys.argv[3]), int(sys.argv[4]))
