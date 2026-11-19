# -*- coding: utf-8 -*-
"""预渲染 2.5D:把可走格画到整图上看一眼,顺便检查给定的 3D 地面点(NPC / 出口 / 出生点)能不能走。

  python tools/proto3d/pre25/walk_overlay.py <拍摄目录(有 full_bg.jpg)> <数据 .ts> <输出 .jpg> [名字=X,Z ...]
"""
import json
import math
import re
import sys

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None          # 整城整图 2.8 亿像素

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


YAW = math.radians(D.get('yaw', 0))
HH = (math.cos(YAW), math.sin(YAW))
RR = (-HH[1], HH[0])


def px(X, Z):
    dx, dz = X - D['c0'][0], Z - D['c0'][2]
    sx = dx * RR[0] + dz * RR[1]
    sy = (dx * HH[0] + dz * HH[1]) * math.sin(P)
    return (sx - D['plane'][0]) * D['ppm'], (D['plane'][3] - sy) * D['ppm']


bg = Image.open(f'{CAP}/full_bg.jpg')
SC = min(1.0, 2400 / bg.width)          # 整城太大:先缩小再画(格子按比例画)
bg = bg.resize((round(bg.width * SC), round(bg.height * SC))).convert('RGBA')
ov = Image.new('RGBA', bg.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
for r, row in enumerate(W['rows']):
    for c in range(W['cols']):
        if (int(row[c >> 2], 16) >> (3 - (c & 3))) & 1:
            d.rectangle([c * cell * SC, r * cell * SC, (c * cell + cell) * SC - 1, (r * cell + cell) * SC - 1], fill=(0, 255, 120, 60))
for name, xz in PTS:
    X, Z = [float(v) for v in xz.split(',')]
    x, y = px(X, Z)
    ok = walk(x, y)
    print(name, X, Z, round(x), round(y), 'ok' if ok else '不能走')
    x, y = x * SC, y * SC
    d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(60, 160, 255, 255) if ok else (255, 50, 50, 255))
    d.text((x + 12, y - 8), name, fill=(255, 255, 255, 255))
im = Image.alpha_composite(bg, ov).convert('RGB')
im.thumbnail((2400, 2400))
im.save(OUT, quality=85)
