# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 0 期:把 capture_hero_ortho.py 拍的主角帧(黑底 / 白底各一张)打成游戏用的图集。

  python -I tools/proto3d/pre25/build_hero.py <帧目录> <资源输出目录> <名字> [--page=2048] [--mirror] [--scale=1]

- 透明度 = 黑白两张的差(和遮挡蒙版同一个办法),颜色除回透明度存直通道(不预乘)。
- 每帧裁到最小包围盒,按高度从高到低一行行排进 page × page 的图集页(手机贴图上限 4096,用 2048 更稳)。
- --mirror:只存 5 个方向(0 / 45 / 90 / 135 / 180),另外 3 个运行时水平翻转(225 = 135 翻、270 = 90 翻、315 = 45 翻);
  不带时 8 个方向都存。顺便算一下「翻转的方向和真拍的差多少」写进输出,判断镜像穿不穿帮。
产物:<名字>_<页>.png + <名字>.json:
  { ppm, pitch, fps, pages, clips: { 键: { dur, n, loop } }, yaws, mirror: { 225: 135, ... },
    frames: { "键/方向/序号": [页, x, y, w, h, ox, oy] } }   ox / oy = 裁剪框左上角相对脚底的像素偏移(y 往下为正)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
SRC, OUT, NAME = ARGS[0], ARGS[1], ARGS[2]
PAGE = int(OPT.get('page', 2048))
SCALE = float(OPT.get('scale', 1))
MIRROR = 'mirror' in OPT
FMT = OPT.get('fmt', 'webp')          # webp(有损,带透明)比 png 小约 5 倍
Q = int(OPT.get('q', 80))
# 抽帧:--every=stand:2,fall:3 = 待机每 2 帧留 1、倒地每 3 帧留 1(慢动作帧多了看不出来,省图集)
EVERY = {k: int(v) for k, v in (kv.split(':') for kv in OPT.get('every', '').split(',') if kv)}
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(SRC, 'hero_meta.json'), encoding='utf-8'))
foot = meta['foot']
MIRROR_OF = {225: 135, 270: 90, 315: 45}


def rgb(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


def frame(key, yaw, i):
    a = rgb(os.path.join(SRC, f'{key}_{yaw}_{i}_0.png'))
    b = rgb(os.path.join(SRC, f'{key}_{yaw}_{i}_255.png'))
    wb = b[2:6, 2:6].reshape(-1, 3).mean(0)          # 白底经过后期后的颜色
    k = np.clip(1 - (b - a) / np.maximum(wb, 1), 0, 1).mean(-1)
    col = np.clip(a / np.maximum(k[..., None], 1e-3), 0, 255)
    k[k < 0.02] = 0
    return np.dstack([col, k * 255]).astype(np.uint8)


items = []          # (键, 方向, 序号, rgba, 裁剪左上 x, y)
diffs = []
for key, c in meta['clips'].items():
    for yaw in meta['yaws']:
        if MIRROR and yaw in MIRROR_OF:
            continue
        step = EVERY.get(key, 1)
        for j, i in enumerate(range(0, c['n'], step)):
            im = frame(key, yaw, i)
            if MIRROR and yaw in MIRROR_OF.values() and i % 3 == 0:
                twin = [m for m, s in MIRROR_OF.items() if s == yaw][0]
                if os.path.exists(os.path.join(SRC, f'{key}_{twin}_{i}_0.png')):
                    real = frame(key, twin, i).astype(np.float32)
                    flip = im[:, ::-1].astype(np.float32)
                    a = np.maximum(real[..., 3], flip[..., 3]) / 255.0
                    if a.sum() > 0:
                        diffs.append(float((np.abs(real[..., :3] - flip[..., :3]).mean(-1) * a).sum() / a.sum()))
            if SCALE != 1:
                pil = Image.fromarray(im)
                im = np.asarray(pil.resize((round(pil.width * SCALE), round(pil.height * SCALE)), Image.LANCZOS))
            ys, xs = np.nonzero(im[..., 3] > 0)
            if len(xs) == 0:
                x0 = y0 = 0
                crop = np.zeros((2, 2, 4), np.uint8)
            else:
                x0, x1, y0, y1 = max(0, xs.min() - 1), xs.max() + 2, max(0, ys.min() - 1), ys.max() + 2
                crop = im[y0:y1, x0:x1]
            items.append((key, yaw, j, crop, x0, y0))

# 按高度排:一行行塞
order = sorted(range(len(items)), key=lambda n: -items[n][3].shape[0])
pages = [np.zeros((PAGE, PAGE, 4), np.uint8)]
x = y = row_h = 0
place = {}
for n in order:
    h, w = items[n][3].shape[:2]
    if x + w > PAGE:
        x, y, row_h = 0, y + row_h + 1, 0
    if y + h > PAGE:
        pages.append(np.zeros((PAGE, PAGE, 4), np.uint8))
        x = y = row_h = 0
    pages[-1][y:y + h, x:x + w] = items[n][3]
    place[n] = (len(pages) - 1, x, y)
    x += w + 1
    row_h = max(row_h, h)

frames = {}
fx, fy = foot[0] * SCALE, foot[1] * SCALE
for n, (key, yaw, i, crop, x0, y0) in enumerate(items):
    pg, px, py = place[n]
    h, w = crop.shape[:2]
    frames[f'{key}/{yaw}/{i}'] = [pg, px, py, w, h, round(x0 - fx, 1), round(y0 - fy, 1)]
total = 0
for k, pg in enumerate(pages):
    # 最后一页按实际用到的高度裁(省流量)
    used = pg
    if k == len(pages) - 1:
        rows = np.nonzero(pg[..., 3].max(1))[0]
        hh = int(rows.max()) + 2 if len(rows) else 2
        hh = 1 << (hh - 1).bit_length()          # 补到 2 的整数次方
        used = pg[:min(PAGE, hh)]
    path = os.path.join(OUT, f'{NAME}_{k}.{FMT}')
    if FMT == 'webp':
        Image.fromarray(used).save(path, 'WEBP', quality=Q, method=6, alpha_quality=90)
    else:
        Image.fromarray(used).save(path, optimize=True)
    total += os.path.getsize(path)
out = {'ppm': meta['ppm'] * SCALE, 'pitch': meta['pitch'], 'camYaw': meta.get('camYaw', 0), 'fps': meta['fps'], 'pages': len(pages),
       'clips': {k: {'dur': c['dur'], 'n': len(range(0, c['n'], EVERY.get(k, 1))), 'loop': c['loop']} for k, c in meta['clips'].items()},
       'yaws': meta['yaws'], 'mirror': {str(k): v for k, v in MIRROR_OF.items()} if MIRROR else {}, 'frames': frames}
json.dump(out, open(os.path.join(OUT, f'{NAME}.json'), 'w', encoding='utf-8'), separators=(',', ':'))
print(f'frames {len(items)}  pages {len(pages)}  {FMT} {total / 1e6:.2f}MB  mirror={MIRROR}'
      + (f'  镜像差(平均每像素色差,0~255) {np.mean(diffs):.1f} / 最大 {np.max(diffs):.1f}' if diffs else ''))
