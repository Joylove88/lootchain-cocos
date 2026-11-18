# -*- coding: utf-8 -*-
"""预渲染 2.5D:把可走格画到整图上看一眼,顺便检查给定的 3D 地面点(NPC / 出口 / 出生点)能不能走。

  python tools/proto3d/pre25/walk_overlay.py <拍摄目录(有 full_bg.jpg)> <数据 .ts> <输出 .jpg> [名字=X,Z ...]
"""
import json
import math
import re
import sys

from PIL import Image, ImageDraw

CAP, TS, OUT = sys.argv[1:4]
PTS = [a.split('=') for a in sys.argv[4:]]
D = json.loads(re.search(r'= (\{.*\}) as const', open(TS, encoding='utf-8').read()).group(1))
IW, IH = D['px']
P = math.radians(D['pitch'])
W = D['walk']
cell = W['cell']


def walk(ix, iy):
    c, r = int(ix // cell), int(iy // cell)
    if r < 0 or r >= len(W['rows']) or c < 0 or c >= W['cols']:
        return 0
    return (int(W['rows'][r][c >> 2], 16) >> (3 - (c & 3))) & 1


def px(X, Z):
    sx = Z - D['c0'][2]
    sy = (X - D['c0'][0]) * math.sin(P)
    return (sx - D['plane'][0]) * D['ppm'], (D['plane'][3] - sy) * D['ppm']


bg = Image.open(f'{CAP}/full_bg.jpg').convert('RGBA')
ov = Image.new('RGBA', bg.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
for r, row in enumerate(W['rows']):
    for c in range(W['cols']):
        if (int(row[c >> 2], 16) >> (3 - (c & 3))) & 1:
            d.rectangle([c * cell, r * cell, c * cell + cell - 1, r * cell + cell - 1], fill=(0, 255, 120, 60))
for name, xz in PTS:
    X, Z = [float(v) for v in xz.split(',')]
    x, y = px(X, Z)
    ok = walk(x, y)
    print(name, X, Z, round(x), round(y), 'ok' if ok else '不能走')
    d.ellipse([x - 14, y - 14, x + 14, y + 14], fill=(60, 160, 255, 255) if ok else (255, 50, 50, 255))
    d.text((x + 18, y - 8), name, fill=(255, 255, 255, 255))
im = Image.alpha_composite(bg, ov).convert('RGB')
im.thumbnail((1500, 1500))
im.save(OUT, quality=85)
