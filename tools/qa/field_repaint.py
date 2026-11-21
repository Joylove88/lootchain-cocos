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
import re
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
# 各图成品精度:晨风村镜头近(手机每世界单位约 1.2 屏幕像素)、图小,按原精度出
PX_MAP = {'VILLAGE': 1.2}
# 只重画地面 + 贴地件的图(建筑 / 立物照旧实时画;截底稿时要把立物 / 建筑藏掉:field_repaint_capture.py <图> --flats)
FLATS_ONLY = {'VILLAGE'}
PW, PH = 1672, 941   # 生图出图尺寸 = 每块成品像素
OV = 0.2             # 块间重叠
REF = {'WOODS': 'battle_scene_field_forest.jpg', 'GRAY': 'battle_scene_field_wasteland.jpg', 'DEADWOOD': 'battle_scene_daily_abyss.jpg',
       'VILLAGE': 'battle_scene_field_forest.jpg'}
# 每张图的气氛(拼进提示词;林地沿用第一版不加)
MOOD = {'WOODS': 'daylight forest, do not darken the scene',
        'GRAY': ('daylight grey rocky wasteland, do not darken the scene. Keep the cool grey-beige colour of image 1, do not turn the '
                 'ground brown. From image 2 take only the lighting, shadows and colour harmony, NOT its empty stone floor: the open '
                 'ground here is dry cracked earth with soft clusters of small stones and gravel, wind-blown dust and faint tonal '
                 'variation, calmer than image 1 but never blank, smooth or plaster-like'),
        'DEADWOOD': ('gloomy dead forest at dusk, but keep it readable, do not make it darker than image 1. From image 2 take only the '
                     'lighting, shadows and colour harmony, NOT its empty floor: the open ground keeps natural detail (moss, leaf '
                     'litter, mud, roots) calmer than image 1 but never blank or smooth'),
        'VILLAGE': 'sunny peaceful village, do not darken the scene'}

PROMPT = (
    'Image 1 is one piece of our game\'s top-down field map (ground and props, no characters), a high oblique bird\'s-eye view. '
    'Image 2 is a battle background from the same game; it has the art quality we want: calm, clean painted-realism ground with '
    'large smooth areas, details concentrated where objects are, one consistent soft light direction with real cast shadows and '
    'ambient occlusion, harmonious muted natural colours.\n'
    'Generate ONE new image with your image generation tool: re-render image 1 at the art quality of image 2. Keep exactly the same '
    'camera, framing and layout: every path, clearing, rock, tree, bush, log, bridge, stream, cliff and fence stays in the same '
    'place with the same size and outline, so the walkable areas and obstacles do not change. Light from the upper left: objects '
    'get proper contact shadows and sit in the ground; open ground becomes calm and clean (no carpet of tiny debris). Dirt roads and '
    'bare patches must look like real trodden earth, never a flat uniform colour fill: subtle tonal variation, compacted wheel ruts '
    'and a foot-worn centre running along the road, a few small pebbles and darker damp spots, grass tufts creeping in and breaking '
    'up the edges irregularly, the edges blending softly into the surrounding ground. Small stone clusters become natural rounded '
    'stones and gravel partly sunk into the soil, never grey square blocks. Muted natural colours like image 2, '
    'matte, but keep the overall brightness of image 1 ({mood}). {extra}\n'
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
    if not run_codex(inputs, PROMPT.format(extra=extra, mood=MOOD.get(code, MOOD['WOODS'])), raw, f'{code} piece r{r} c{c}'):
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
            bc = base.crop((x0, y0, x0 + PW, y0 + PH)).convert('RGB')
            raw = p.replace('.png', '_raw.png')
            if os.path.exists(raw):
                # 生图出 1024 方图:按底稿配准缩放 + 平移(立物位置要和原图对上,遮挡件的形状取原立物贴图)
                src, reg = _register(np.asarray(bc, dtype=np.float32), Image.open(raw))
                print('piece', r, c, 'reg', reg, flush=True)
            else:
                src = np.asarray(Image.open(p).convert('RGB') if os.path.exists(p) else bc, dtype=np.float32)
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


ROAD_PROMPT = (
    'Image 1 is one finished piece of our game\'s top-down field map. Image 3 is the same piece with the areas to fix tinted red. '
    'Image 2 is a battle background from the same game showing the art quality we want.\n'
    'Generate ONE new image with your image generation tool: return image 1 UNCHANGED (same camera, framing, layout, colours, '
    'lighting, trees, rocks, water, grass, every object in the same place) except inside the red areas of image 3:\n'
    '- dirt roads and bare dirt patches there are a flat uniform fill: repaint them as real trodden earth with the same outline '
    'and width: subtle tonal variation, compacted wheel ruts and a foot-worn centre running along the road, a few small pebbles and '
    'darker damp spots, grass tufts creeping in and breaking up the edges irregularly, edges blending softly into the grass;\n'
    '- clusters of grey square block-like stones there become natural rounded small stones and gravel partly sunk into the soil '
    'and moss (or just ground if they are tiny).\n'
    'Same brightness and colour temperature as image 1, matte, realistic painted game art. No characters, no UI, no text, no '
    'frame, no blur, no vignette. Landscape, exactly 1672x941.'
)


def road_mask(code):
    """要修的区域(整图尺寸 0/1):平涂的土路 / 裸土块(底稿里土色且平滑的大块)+ 方块碎石(立物表里的碎石 / 砂砾)。"""
    from scipy import ndimage as nd
    d = out_dir(code)
    mp = os.path.join(d, 'road_mask.png')
    if os.path.exists(mp):
        return np.asarray(Image.open(mp)) > 127
    base = Image.open(os.path.join(d, 'base.png')).convert('RGB')
    q = 4
    a = np.asarray(base.resize((base.width // q, base.height // q), Image.BOX), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dirt = (r - g > 14) & (g - b > 12) & (r > 105) & (r < 200) & (r - b > 38)
    lum = a.mean(2)
    mu = nd.uniform_filter(lum, 7)
    sd = np.sqrt(np.maximum(nd.uniform_filter(lum * lum, 7) - mu * mu, 0))
    m = nd.binary_opening(dirt & (sd < 14), iterations=3)
    lab, n = nd.label(m)
    sz = nd.sum(m, lab, range(1, n + 1))
    m = nd.binary_dilation(nd.binary_closing(np.isin(lab, 1 + np.where(sz > 1500)[0]), iterations=4), iterations=3)
    im = Image.fromarray((m * 255).astype(np.uint8)).resize(base.size, Image.NEAREST)
    pp = os.path.join(d, 'phone_props.json')
    if os.path.exists(pp):
        props = json.load(open(pp, encoding='utf-8'))
        meta = json.load(open(os.path.join(d, 'mosaic.json'), encoding='utf-8'))
        dr = ImageDraw.Draw(im)
        for p in props['props']:
            if not re.search(r'fld_g_(stones|gravel)', p['asset']):
                continue
            cx, cy = (p['x'] + meta['W'] / 2) * PX, (meta['H'] / 2 - p['y']) * PX
            rx, ry = p['w'] * PX * 0.6, p['h'] * PX * 0.6
            dr.ellipse((cx - rx, cy - ry * 1.6, cx + rx, cy + ry * 0.4), fill=255)
    im.save(mp)
    return np.asarray(im) > 127


def _register(old, raw_img):
    """生图出的是 1024 方图(内容被压扁),拉回 PW×PH 后常有几十像素的上下 / 左右缩放 + 平移误差:
    在 4 倍降采样上枚举横 / 竖缩放,每种用相位相关找平移,取峰值最高的 → 返回对齐到 old 的新图(PH×PW×3 float)。"""
    q = 4
    ga = np.asarray(Image.fromarray(old.astype(np.uint8)).convert('L').resize((PW // q, PH // q)), dtype=np.float32)
    ga = (ga - ga.mean()) * np.outer(np.hanning(ga.shape[0]), np.hanning(ga.shape[1]))
    Fa = np.fft.fft2(ga)
    best = (-1, 1.0, 1.0, 0, 0)
    for sy in np.arange(0.90, 1.121, 0.01):
        for sx in np.arange(0.96, 1.041, 0.01):
            w, h = round(PW * sx / q), round(PH * sy / q)
            gb = np.asarray(raw_img.convert('L').resize((w, h), Image.BILINEAR), dtype=np.float32)
            # 以中心对齐裁 / 补到同尺寸
            canvas = np.full((PH // q, PW // q), gb.mean(), dtype=np.float32)
            oy, ox = (PH // q - h) // 2, (PW // q - w) // 2
            ys0, xs0 = max(0, oy), max(0, ox)
            ys1, xs1 = min(PH // q, oy + h), min(PW // q, ox + w)
            canvas[ys0:ys1, xs0:xs1] = gb[ys0 - oy:ys1 - oy, xs0 - ox:xs1 - ox]
            gb = (canvas - canvas.mean()) * np.outer(np.hanning(canvas.shape[0]), np.hanning(canvas.shape[1]))
            F = Fa * np.conj(np.fft.fft2(gb))
            c = np.fft.ifft2(F / (np.abs(F) + 1e-6)).real
            k = float(c.max())
            if k > best[0]:
                y, x = np.unravel_index(np.argmax(c), c.shape)
                y = y - c.shape[0] if y > c.shape[0] // 2 else y
                x = x - c.shape[1] if x > c.shape[1] // 2 else x
                best = (k, sx, sy, y * q, x * q)
    _, sx, sy, dy, dx = best
    w, h = round(PW * sx), round(PH * sy)
    big = raw_img.convert('RGB').resize((w, h), Image.LANCZOS)
    out = Image.new('RGB', (PW, PH))
    out.paste(Image.fromarray(old.astype(np.uint8)), (0, 0))
    out.paste(big, ((PW - w) // 2 + dx, (PH - h) // 2 + dy))
    return np.asarray(out, dtype=np.float32), (round(sx, 2), round(sy, 2), dy, dx)


def cmd_roads(code):
    """在 mosaic.png 上只修路面 / 碎石:逐块(同重绘网格)给生图「只改红区」,按遮罩合回 → mosaic_roads.png(可断点续跑)。"""
    from scipy import ndimage as nd
    d = out_dir(code)
    src_path = os.path.join(d, 'mosaic_roads.png')
    canvas = np.asarray(Image.open(src_path if os.path.exists(src_path) else os.path.join(d, 'mosaic.png')).convert('RGB'), dtype=np.float32).copy()
    H, W = canvas.shape[:2]
    mask = road_mask(code)
    xs, ys = grid((W, H))
    os.makedirs(os.path.join(d, 'roads'), exist_ok=True)
    done_path = os.path.join(d, 'roads', 'done.json')
    done = set(json.load(open(done_path))) if os.path.exists(done_path) else set()
    pending = set()
    ref = os.path.join(d, 'roads', 'ref.jpg')
    Image.open(os.path.join(BG, REF[code])).convert('RGB').resize((1672, 941)).save(ref)
    for r in range(len(ys)):
        for c in range(len(xs)):
            key = f'{r}_{c}'
            x0, y0 = xs[c], ys[r]
            mk = mask[y0:y0 + PH, x0:x0 + PW]
            if key in done or mk.mean() < 0.004:
                continue
            old = canvas[y0:y0 + PH, x0:x0 + PW].copy()
            src = os.path.join(d, 'roads', f'src_{key}.png')
            Image.fromarray(old.astype(np.uint8)).save(src)
            tint = old.copy()
            tint[mk] = tint[mk] * 0.45 + np.array([255, 30, 30]) * 0.55
            tp = os.path.join(d, 'roads', f'tint_{key}.jpg')
            Image.fromarray(tint.astype(np.uint8)).save(tp, quality=88)
            raw = os.path.join(d, 'roads', f'raw_{key}.png')
            ok = os.path.exists(raw)
            for _ in range(3):
                if ok:
                    break
                ok = run_codex([src, ref, tp], ROAD_PROMPT, raw, f'{code} roads r{r} c{c}')
            if not ok:
                continue
            new, reg = _register(old, Image.open(raw))
            ring = nd.binary_dilation(mk, iterations=30) & ~nd.binary_dilation(mk, iterations=8)
            if ring.sum() > 500:
                for ch in range(3):
                    o, n_ = old[..., ch][ring], new[..., ch][ring]
                    k = np.clip(o.std() / max(n_.std(), 1e-3), 0.8, 1.25)
                    new[..., ch] = (new[..., ch] - n_.mean()) * k + o.mean()
            w = nd.gaussian_filter(nd.binary_dilation(mk, iterations=6).astype(np.float32), 5)
            # 和已修过的左 / 上邻块重叠的带子:从 0 渐变到 1,免得同一段路两次画法硬切
            ramp = np.ones((PH, PW), dtype=np.float32)
            if c > 0 and f'{r}_{c - 1}' in done:
                ov = xs[c - 1] + PW - x0
                ramp[:, :ov] = np.minimum(ramp[:, :ov], np.linspace(0, 1, ov)[None, :])
            if r > 0 and f'{r - 1}_{c}' in done:
                ov = ys[r - 1] + PH - y0
                ramp[:ov, :] = np.minimum(ramp[:ov, :], np.linspace(0, 1, ov)[:, None])
            w = (w * ramp)[..., None]
            canvas[y0:y0 + PH, x0:x0 + PW] = old * (1 - w) + np.clip(new, 0, 255) * w
            done.add(key)
            pending.add(key)
            # 整图 PNG 一张约 200MB,每块都存太慢:每 4 块存一次(断点续跑时没存进去的块会从缓存的生图结果重新合)
            if len(pending) >= 4:
                Image.fromarray(canvas.astype(np.uint8)).save(src_path, compress_level=1)
                json.dump(sorted(done), open(done_path, 'w'))
                pending.clear()
            print('roads done', key, 'reg', reg, flush=True)
    if pending or not os.path.exists(src_path):
        Image.fromarray(canvas.astype(np.uint8)).save(src_path, compress_level=1)
        json.dump(sorted(done), open(done_path, 'w'))
    out = Image.open(src_path)
    out.resize((W // 8, H // 8), Image.LANCZOS).save(os.path.join(d, 'mosaic_roads_small.jpg'), quality=85)
    print('roads finished', len(done))


FIX_FILE = os.path.join(ROOT, 'tools', 'qa', 'field_paint_fixes.json')
FIX_PROMPT = (
    'Image 1 is one finished piece of our game\'s top-down field map. Image 2 is the same piece with the area to change tinted red. '
    'Generate ONE new image with your image generation tool: return image 1 UNCHANGED (same camera, framing, layout, colours, lighting, '
    'every object in the same place) except inside the red area of image 2, where: {what}\n'
    'Same brightness, colour temperature and painting style as image 1, matte, realistic painted game art. No characters, no UI, no '
    'text, no frame, no blur, no vignette. Landscape, exactly 1672x941.'
)


def _final_src(d):
    for name in ('mosaic_fixed.png', 'mosaic_roads.png', 'mosaic.png'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p


def cmd_fix(code):
    """局部修图(跑图自查发现的问题):tools/qa/field_paint_fixes.json 里 {图: [{id, rect: [x0, y0, x1, y1] 世界坐标, what: 英文要求}]},
    逐条只重画那一块(配准 + 羽化合回)→ mosaic_fixed.png。已做过的 id 记在 fixes/done.json(改了要求要重做就删掉那条)。"""
    from scipy import ndimage as nd
    d = out_dir(code)
    items = json.load(open(FIX_FILE, encoding='utf-8')).get(code, [])
    fd = os.path.join(d, 'fixes')
    os.makedirs(fd, exist_ok=True)
    done_path = os.path.join(fd, 'done.json')
    done = set(json.load(open(done_path))) if os.path.exists(done_path) else set()
    if not items:
        print('no fixes for', code)
        return
    # 每次都从修图前的整图重来(修图清单是全量的)
    base_src = os.path.join(d, 'mosaic_roads.png') if os.path.exists(os.path.join(d, 'mosaic_roads.png')) else os.path.join(d, 'mosaic.png')
    canvas = np.asarray(Image.open(base_src).convert('RGB'), dtype=np.float32).copy()
    H, W = canvas.shape[:2]
    meta = json.load(open(os.path.join(d, 'mosaic.json'), encoding='utf-8'))
    for it in items:
        x0, y0, x1, y1 = it['rect']
        rx0, rx1 = (min(x0, x1) + meta['W'] / 2) * PX, (max(x0, x1) + meta['W'] / 2) * PX
        ry0, ry1 = (meta['H'] / 2 - max(y0, y1)) * PX, (meta['H'] / 2 - min(y0, y1)) * PX
        # 以修图区为中心取一块 1672×941(区太大就按比例放大取景再缩)
        k = max(1.0, (rx1 - rx0) * 1.4 / PW, (ry1 - ry0) * 1.4 / PH)
        cw, ch = round(PW * k), round(PH * k)
        cx0 = int(np.clip((rx0 + rx1) / 2 - cw / 2, 0, W - cw))
        cy0 = int(np.clip((ry0 + ry1) / 2 - ch / 2, 0, H - ch))
        crop = Image.fromarray(canvas[cy0:cy0 + ch, cx0:cx0 + cw].astype(np.uint8)).resize((PW, PH), Image.LANCZOS)
        old = np.asarray(crop, dtype=np.float32)
        mk = np.zeros((PH, PW), dtype=bool)
        mk[int((ry0 - cy0) / k):int((ry1 - cy0) / k), int((rx0 - cx0) / k):int((rx1 - cx0) / k)] = True
        src = os.path.join(fd, f'src_{it["id"]}.png')
        crop.save(src)
        tint = old.copy()
        tint[mk] = tint[mk] * 0.45 + np.array([255, 30, 30]) * 0.55
        tp = os.path.join(fd, f'tint_{it["id"]}.jpg')
        Image.fromarray(tint.astype(np.uint8)).save(tp, quality=88)
        raw = os.path.join(fd, f'raw_{it["id"]}.png')
        if it['id'] not in done and os.path.exists(raw):
            os.remove(raw)
        ok = os.path.exists(raw)
        for _ in range(3):
            if ok:
                break
            ok = run_codex([src, tp], FIX_PROMPT.format(what=it['what']), raw, f'{code} fix {it["id"]}')
        if not ok:
            print('fix failed', it['id'])
            continue
        new, reg = _register(old, Image.open(raw))
        w = nd.gaussian_filter(nd.binary_dilation(mk, iterations=10).astype(np.float32), 8)[..., None]
        merged = old * (1 - w) + np.clip(new, 0, 255) * w
        big = np.asarray(Image.fromarray(merged.astype(np.uint8)).resize((cw, ch), Image.LANCZOS), dtype=np.float32)
        # 只把改过的地方贴回(放大取景时其余像素保持原分辨率)
        wb = np.asarray(Image.fromarray((w[..., 0] * 255).astype(np.uint8)).resize((cw, ch), Image.BILINEAR), dtype=np.float32)[..., None] / 255
        region = canvas[cy0:cy0 + ch, cx0:cx0 + cw]
        canvas[cy0:cy0 + ch, cx0:cx0 + cw] = region * (1 - wb) + big * wb
        done.add(it['id'])
        cmp = Image.new('RGB', (PW, PH * 2 + 10))
        cmp.paste(crop, (0, 0))
        cmp.paste(Image.fromarray(merged.astype(np.uint8)), (0, PH + 10))
        cmp.resize((PW // 2, PH + 5)).save(os.path.join(fd, f'cmp_{it["id"]}.jpg'), quality=85)
        print('fix done', it['id'], 'reg', reg, flush=True)
    Image.fromarray(canvas.astype(np.uint8)).save(os.path.join(d, 'mosaic_fixed.png'), compress_level=1)
    json.dump(sorted(done), open(done_path, 'w'))
    print('fixes', len(done))


FLOW_Q = 8   # 水流遮罩 = 整图的 1/8


def cmd_flow(code):
    """水流遮罩(world-paint-ground 用):R = 水面(青蓝),G = 白水(瀑布 / 急流的白沫,只认水面旁边的亮白);
    入库 ui/world/<code>_paint/flow.png,并在 LobbyFieldPaintData 里标 flow。"""
    from scipy import ndimage as nd
    d = out_dir(code)
    img = Image.open(_final_src(d)).convert('RGB')
    W, H = img.size
    a = np.asarray(img.resize((W // FLOW_Q, H // FLOW_Q), Image.BOX), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    water = (b > r + 22) & (g > r + 8) & ((mx - mn) / np.maximum(mx, 1) > 0.18)
    water = nd.binary_opening(water, iterations=1)
    lab, n = nd.label(water)
    sz = nd.sum(water, lab, range(1, n + 1))
    water = np.isin(lab, 1 + np.where(sz > 40)[0])
    near = nd.binary_dilation(water, iterations=16)
    foam = (mn > 158) & (mx - mn < 48) & near
    foam = nd.binary_opening(foam, iterations=1) | (foam & nd.binary_dilation(water, iterations=2))
    R = nd.gaussian_filter((water | foam).astype(np.float32), 1.2)
    G = nd.gaussian_filter(foam.astype(np.float32), 1.2)
    out = np.zeros(a.shape, dtype=np.uint8)
    out[..., 0] = np.clip(R * 255, 0, 255)
    out[..., 1] = np.clip(G * 255, 0, 255)
    dst = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', f'{code.lower()}_paint')
    os.makedirs(dst, exist_ok=True)
    Image.fromarray(out).save(os.path.join(dst, 'flow.png'))
    view = a.copy()
    view[water] = view[water] * 0.4 + np.array([0, 120, 255]) * 0.6
    view[foam] = view[foam] * 0.4 + np.array([255, 0, 200]) * 0.6
    Image.fromarray(view.astype(np.uint8)).save(os.path.join(d, 'flow_view.jpg'), quality=85)
    _data_set(code, flow=True)
    print('flow', out.shape, 'water', round(float(water.mean()), 4), 'foam', round(float(foam.mean()), 4))


DATA_PATH = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldPaintData.ts')


def _data_load():
    if not os.path.exists(DATA_PATH):
        return {}
    txt = open(DATA_PATH, encoding='utf-8').read()
    return json.loads(txt[txt.rindex('> = ') + 4: txt.rindex(';')])


def _data_save(data):
    with open(DATA_PATH, 'w', encoding='utf-8', newline='\r\n') as fh:
        fh.write('// 由 tools/qa/field_repaint.py export / flow 生成:野外整图重绘的图块表(px = 每世界单位像素;图块从地图左上角起 tileW × tileH 切;flow = 有水流遮罩)。\n')
        fh.write('export interface FieldPaintDef { px: number; tileW: number; tileH: number; cols: number; rows: number; w: number; h: number; mapW: number; mapH: number; dir: string; flow?: boolean; flatsOnly?: boolean }\n')
        fh.write('export const FIELD_PAINT: Record<string, FieldPaintDef> = ' + json.dumps(data, ensure_ascii=False) + ';\n')


def _data_set(code, **kw):
    data = _data_load()
    if code in data:
        data[code].update(kw)
        _data_save(data)


TILE = (2048, 1024)


def cmd_export(code):
    """整图切成游戏图块(2048×1024 WebP,边上的块按实际尺寸)入库 ui/world/<code>_paint/,并生成 LobbyFieldPaintData.ts 里这张图的条目。"""
    d = out_dir(code)
    img = Image.open(_final_src(d)).convert('RGB')
    W, H = img.size
    dst = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', f'{code.lower()}_paint')
    os.makedirs(dst, exist_ok=True)
    cols, rows = -(-W // TILE[0]), -(-H // TILE[1])
    for r in range(rows):
        for c in range(cols):
            box = (c * TILE[0], r * TILE[1], min(W, (c + 1) * TILE[0]), min(H, (r + 1) * TILE[1]))
            # 11-21 用户拍板图块改 WebP(同画质约为 JPG 的一半);旧 JPG 图块连 meta 一起删,免得同名两份都进包
            for ext in ('.jpg', '.jpg.meta'):
                old_p = os.path.join(dst, f'p_{r}_{c}{ext}')
                if os.path.exists(old_p):
                    os.remove(old_p)
            img.crop(box).save(os.path.join(dst, f'p_{r}_{c}.webp'), 'WEBP', quality=82, method=6)
    meta = json.load(open(os.path.join(d, 'mosaic.json'), encoding='utf-8'))
    entry = {'px': PX, 'tileW': TILE[0], 'tileH': TILE[1], 'cols': cols, 'rows': rows, 'w': W, 'h': H, 'mapW': meta['W'], 'mapH': meta['H'],
             'dir': f'ui/world/{code.lower()}_paint'}
    if os.path.exists(os.path.join(dst, 'flow.png')):
        entry['flow'] = True
    if code in FLATS_ONLY:
        entry['flatsOnly'] = True
    data = _data_load()
    data[code] = entry
    _data_save(data)
    total = sum(os.path.getsize(os.path.join(dst, f)) for f in os.listdir(dst) if f.endswith('.webp'))
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
    PX = PX_MAP.get(code, PX)
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
    elif cmd == 'fix':
        cmd_fix(code)
    elif cmd == 'flow':
        cmd_flow(code)
    elif cmd == 'roads':
        cmd_roads(code)
    elif cmd == 'roadmask':
        print(road_mask(code).mean())
    elif cmd == 'sample':
        cmd_sample(code, int(sys.argv[3]), int(sys.argv[4]))
