# -*- coding: utf-8 -*-
"""field_actor_read.py 截出的同帧多方案 → 对比图 + 「轮廓突出度」量化。

  python tools/qa/field_actor_compare.py <目录> <tag> [方案名,...] [--hit] [--out=文件.jpg]
方案名 = cur(现状)/ v1_outline / v2_outline_rim_pop / v3_strong / 任意 <tag>_<名>.png。
轮廓突出度 = 人物外轮廓 ±3 像素带的平均亮度梯度 ÷ 外围背景环带的平均亮度梯度(背景本身的纹理噪声);
越大 = 轮廓越压过背景细节、越「跳出来」。人物轮廓取自同帧 bg / black 两张(alpha = 1 - black / bg)。
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = {a[2:].split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
D, TAG = ARGS[0], ARGS[1]
NAMES = ARGS[2].split(',') if len(ARGS) > 2 else ['cur', 'v1_outline', 'v2_outline_rim_pop', 'v3_strong']
HIT = bool(OPT.get('hit'))
VIEW = OPT.get('view', 'phone')
LABEL = { 'v1_outline': 'A1 暗色描边', 'v2_outline_rim_pop': 'A2 描边 + 受光轮廓光 + 本体提色', 'v3_strong': 'A3 加重版',
         'meowa_sim': 'B 换皮提亮配色(模拟)', 'combo': 'C = A2 + B',
         'r1_outline': '细描边(1.2 像素)', 'r2_recommend': '方案 A:细描边 + 淡轮廓光 + 本体提色', 'r3_recommend_notint': '方案 A + 去掉林地人物偏色',
         'off': '改前(同一帧关掉)', 'cur': '现状'}


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def load(name):
    pre = os.path.join(D, f'{VIEW}_{TAG}{"_hit" if HIT else ""}_{name}.png')
    return np.asarray(Image.open(pre).convert('RGB')).astype(np.float32)


def grad(g):
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
    gy = np.abs(np.diff(g, axis=0, prepend=g[:1, :]))
    return np.hypot(gx, gy)


def main():
    if OPT.get('curlabel'):
        LABEL['cur'] = OPT['curlabel']
    bg, blk = load('bg'), load('black')
    lb, lk = lum(bg), lum(blk)
    alpha = np.clip(1 - lk / np.maximum(lb, 1), 0, 1)
    mask = alpha > 0.5
    ys, xs = np.nonzero(mask)
    if not len(xs):
        print('no actor mask')
        return
    x0, x1 = max(0, xs.min() - 120), min(mask.shape[1], xs.max() + 120)
    y0, y1 = max(0, ys.min() - 90), min(mask.shape[0], ys.max() + 60)
    mp = os.path.join(D, f'metrics_{TAG}.json')
    if os.path.exists(mp):
        # 用本帧顶点缓冲量出来的队员屏幕框(比轮廓图的极值稳,不会被飘动的叶子拉大)
        meas = json.load(open(mp, encoding='utf-8')).get('measure', [])
        if len(meas) > (1 if HIT else 0):
            rs = [a['rect'] for a in meas[1 if HIT else 0]['actors'] if a.get('rect')]
            if rs:
                pad = int(OPT.get('pad', 70))
                x0, y0 = max(0, min(r[0] for r in rs) - pad), max(0, min(r[1] for r in rs) - pad)
                x1, y1 = min(mask.shape[1], max(r[2] for r in rs) + pad), min(mask.shape[0], max(r[3] for r in rs) + pad // 2)
    if OPT.get('full'):
        x0, y0, x1, y1 = 0, 0, mask.shape[1], mask.shape[0]
    m = Image.fromarray((mask * 255).astype(np.uint8))
    near = (np.asarray(m.filter(ImageFilter.MaxFilter(7))) > 127) & ~(np.asarray(m.filter(ImageFilter.MinFilter(7))) > 127)
    ring = (np.asarray(m.filter(ImageFilter.MaxFilter(61))) > 127) & ~(np.asarray(m.filter(ImageFilter.MaxFilter(21))) > 127)
    inner = np.asarray(m.filter(ImageFilter.MinFilter(9))) > 127
    stats = {}
    tiles = []
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 30)
    small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
    for name in NAMES:
        try:
            im = load(name)
        except FileNotFoundError:
            continue
        g = grad(lum(im))
        sat = lambda p: float(((p.max(-1) - p.min(-1)) / np.maximum(p.max(-1), 1)).mean())
        st = {
            'edge': round(float(g[near].mean()), 1), 'bgTex': round(float(g[ring].mean()), 1),
            'pop': round(float(g[near].mean() / max(1e-3, g[ring].mean())), 2),
            'lumActor': round(float(lum(im[inner]).mean()), 1), 'lumBg': round(float(lum(im[ring]).mean()), 1),
            'satActor': round(sat(im[inner]), 3), 'satBg': round(sat(im[ring]), 3),
        }
        stats[name] = st
        crop = Image.fromarray(im[y0:y1, x0:x1].astype(np.uint8))
        w = 960
        crop = crop.resize((w, round(crop.height * w / crop.width)), Image.LANCZOS)
        dr = ImageDraw.Draw(crop)
        dr.text((14, 10), LABEL.get(name, name), fill=(255, 232, 150), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
        dr.text((14, crop.height - 36), f"轮廓突出度 {st['pop']}   人物饱和 {st['satActor']} / 背景 {st['satBg']}", fill=(235, 235, 235), font=small, stroke_width=2, stroke_fill=(0, 0, 0))
        tiles.append(crop)
    if not tiles:
        return
    cols = 2 if len(tiles) > 1 else 1
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size
    sheet = Image.new('RGB', (tw * cols, th * rows), (12, 12, 12))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    out = OPT.get('out') or os.path.join(D, f'compare_{TAG}{"_hit" if HIT else ""}.jpg')
    sheet.save(out, quality=90)
    print(json.dumps(stats, ensure_ascii=False))
    print('sheet', out)


if __name__ == '__main__':
    main()
