# -*- coding: utf-8 -*-
"""预渲染 2.5D 小样:把拍下来的底图 / 蒙版 / 深度 / 主角动作帧打成网页要用的几样东西。

  python -I tools/proto3d/pre25/build.py <底图拍摄目录> <主角帧目录> <网页输出目录>

产物(放在网页目录,和 index.html 同级):
  bg.webp     底图(3840×2160)
  occ.png     遮挡图:r / g = 挡人的东西(建筑、摆件、树、墙台阶)离镜头的视深(两个 8 位),b = 它的不透明度;地面 = 255 / 255 / 0
  hero.webp   主角动作图集(8 方向 × 待机 / 跑 / 劈)
  data.json   相机矩阵、近远裁剪面、挡路块、灯、图集每帧的位置
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

CAP, HERO, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
HERO_SCALE = 1.3          # 图集里的主角按底图上同样位置的 1.3 倍大小存(画面放大一点也不糊)


def rgb(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


cam = json.load(open(os.path.join(CAP, 'cam.json'), encoding='utf-8'))
W, H = cam['w'], cam['h']

# ── 底图 ──
bg = Image.open(os.path.join(CAP, 'bg.png')).convert('RGB')
bg.save(os.path.join(OUT, 'bg.webp'), 'WEBP', quality=88, method=6)

# ── 遮挡图 ──
occ_a = np.zeros((H, W), np.float32)
for g in ('bld', 'trees', 'stone'):
    a = rgb(os.path.join(CAP, f'm_{g}_0.png'))
    b = rgb(os.path.join(CAP, f'm_{g}_255.png'))
    occ_a = np.maximum(occ_a, np.clip(1 - (b - a).mean(-1) / 255.0, 0, 1))
dep = np.asarray(Image.open(os.path.join(CAP, 'depth.png')).convert('RGB'), dtype=np.uint8)
occ = np.zeros((H, W, 3), np.uint8)
solid = occ_a > 0.02
occ[..., 0] = np.where(solid, dep[..., 0], 255)
occ[..., 1] = np.where(solid, dep[..., 1], 255)
occ[..., 2] = (occ_a * 255).astype(np.uint8)
Image.fromarray(occ).save(os.path.join(OUT, 'occ.png'), optimize=True)

# ── 主角图集 ──
meta = json.load(open(os.path.join(HERO, 'hero_meta.json'), encoding='utf-8'))
frames = []          # (key, yaw, i, rgba ndarray)
for key, c in meta['clips'].items():
    for yaw in meta['yaws']:
        for i in range(c['n']):
            a = rgb(os.path.join(HERO, f'{key}_{yaw}_{i}_0.png'))
            b = rgb(os.path.join(HERO, f'{key}_{yaw}_{i}_255.png'))
            wb = b[2:6, 2:6].reshape(-1, 3).mean(0)          # 白底经过色调映射后的颜色
            k = np.clip(1 - (b - a) / np.maximum(wb, 1), 0, 1).mean(-1)
            col = np.clip(a / np.maximum(k[..., None], 1e-3), 0, 255)
            col[k < 0.004] = 0
            frames.append((key, yaw, i, np.dstack([col, k * 255]).astype(np.uint8)))
S = frames[0][3].shape[0]
alpha_any = np.zeros((S, S), bool)
for f in frames:
    alpha_any |= f[3][..., 3] > 8
ys, xs = np.where(alpha_any)
x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
# 脚底在渲染图里的位置:镜头对准 (X, 1.15, Z),往下 1.15 米;近似平行投影,竖直 1 米 = cos(俯角) × 像素/米
pxm = S / meta['frameH']
foot = (S / 2, S / 2 + 1.15 * math.cos(math.radians(meta['pitch'])) * pxm)
hero_px_render = 1.78 * math.cos(math.radians(meta['pitch'])) * pxm


# 底图上主角在画面中间那一块大概多高(竖直 1.78 米投出来的像素)
def proj(x, y, z):
    m = cam['vp']
    X = m[0] * x + m[4] * y + m[8] * z + m[12]
    Y = m[1] * x + m[5] * y + m[9] * z + m[13]
    w = m[3] * x + m[7] * y + m[11] * z + m[15]
    return (X / w + 1) / 2 * W, (1 - Y / w) / 2 * H


L = cam['cam']['look']
ref_px = proj(L[0], 0, L[2])[1] - proj(L[0], 1.78, L[2])[1]
s = ref_px * HERO_SCALE / hero_px_render
# 每帧单独裁到最小范围、按高度从高到低一行行排(整张图集控制在 4096 宽以内,手机贴图上限)
crops = []
for n, (key, yaw, i, im) in enumerate(frames):
    big = Image.fromarray(im).crop((x0, y0, x1, y1))
    big = big.resize((math.ceil((x1 - x0) * s), math.ceil((y1 - y0) * s)), Image.LANCZOS)
    bb = big.getchannel('A').point(lambda v: 255 if v > 3 else 0).getbbox() or (0, 0, 1, 1)
    bb = (max(0, bb[0] - 1), max(0, bb[1] - 1), min(big.width, bb[2] + 1), min(big.height, bb[3] + 1))
    crops.append((key, yaw, i, big.crop(bb), bb))
order = sorted(range(len(crops)), key=lambda k: -crops[k][3].height)
AW = 4096
x = y = rowh = 0
place = {}
for k in order:
    im = crops[k][3]
    if x + im.width > AW:
        x, y, rowh = 0, y + rowh + 1, 0
    place[k] = (x, y)
    x += im.width + 1
    rowh = max(rowh, im.height)
AH = y + rowh
atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
index = {}
ax0, ay0 = (foot[0] - x0) * s, (foot[1] - y0) * s
for k, (key, yaw, i, im, bb) in enumerate(crops):
    px, py = place[k]
    atlas.paste(im, (px, py))
    index.setdefault(key, {}).setdefault(str(yaw), []).append([px, py, im.width, im.height, round(ax0 - bb[0], 2), round(ay0 - bb[1], 2)])
cw, ch = 0, 0
atlas.save(os.path.join(OUT, 'hero.webp'), 'WEBP', quality=90, method=6)

data = {
    'bg': [W, H], 'vp': cam['vp'], 'near': cam['near'], 'far': cam['far'], 'pitch': cam['cam']['pitch'], 'look': L,
    'solids': cam['solids'], 'lights': [l for l in cam['lights'] if l['kind'] not in ('hit', 'fill')],
    'hero': {'refPx': ref_px * HERO_SCALE, 'atlas': list(atlas.size),
             'clips': {k: {'dur': c['dur'], 'n': c['n']} for k, c in meta['clips'].items()}, 'frames': index},
}
json.dump(data, open(os.path.join(OUT, 'data.json'), 'w', encoding='utf-8'), separators=(',', ':'))
for f in ('bg.webp', 'occ.png', 'hero.webp', 'data.json'):
    print(f, f'{os.path.getsize(os.path.join(OUT, f)) / 1048576:.2f} MB')
print('atlas', atlas.size, 'frames', len(frames), 'refPx', round(ref_px, 1))
