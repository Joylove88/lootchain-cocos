# -*- coding: utf-8 -*-
"""预渲染 2.5D · 主城 v4:流动的水 —— 生成水面网格 + 「水露在外面」的遮罩(11-19 用户:「河流是流动的吧?不是静态的吧」)。

  python tools/proto3d/pre25/water_build.py <布局前缀(city_plan_v4 --json 的,不带 .json)>

预渲染底图里的水是拍死的;游戏里在河 / 港湾 / 池塘上面叠一层会动的水(effects/pre25-water):
- 网格:河是一条带子(uv.x = 沿河往下游的米数,uv.y = 横向米数),港湾 / 池塘是扇面;顶点坐标 = 2D 世界坐标(地面投影,池塘在上城按 3 米抬高);
  第二套 uv = 整图里的位置(0~1,查遮罩用);颜色 r = 流速(河 1,港湾 / 池塘几乎不动)。
- 遮罩(整图 1/10 分辨率):这个像素看到的是水面(地面点落在水里、不在桥面上),且前面没有挡着的东西(桥、码头、船、河岸、树)= 白。
产物:assets/resources/pre25/city/water_mask.png、assets/scripts/scenes/lobby/pre25/Pre25WaterData.ts。
"""
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

LP = sys.argv[1]
ROOT = 'D:/project/lootchain-cocos'
OUT_MASK = ROOT + '/assets/resources/pre25/city/water_mask.png'
OUT_TS = ROOT + '/assets/scripts/scenes/lobby/pre25/Pre25WaterData.ts'
D = json.loads(re.search(r'= (\{.*\}) as const', open(ROOT + '/assets/scripts/scenes/lobby/pre25/Pre25CityData.ts', encoding='utf-8').read()).group(1))
lay = json.load(open(LP + '.json', encoding='utf-8'))
lg = json.load(open(LP + '_grid.json'))
surf = np.load(LP + '_surface.npy')
bridge = np.load(LP + '_bridge.npy')
IW, IH = D['px']
U = D['unit']
PPM = D['ppm']
P = math.radians(D['pitch'])
YAW = math.radians(D['yaw'])
HX, HZ = math.cos(YAW), math.sin(YAW)
C0 = D['c0']
PL = D['plane']
CH = D['chunk']
SINP, COSP = math.sin(P), math.cos(P)
WATER_Y = 0.04
POND = [-68, -51, 7, 4.5]
POND_Y = 3.05
SC = 10                                   # 遮罩:整图的 1/10


def to_px(X, Z, h=0.0):
    dx, dz = X - C0[0], Z - C0[2]
    sx = -dx * HZ + dz * HX
    sy = (dx * HX + dz * HZ) * SINP + h * COSP
    return (sx - PL[0]) * PPM, (PL[3] - sy) * PPM


def to_world(ix, iy):
    return (ix - IW / 2) * U, (IH / 2 - iy) * U


# ── 网格 ──
pos, uv0, uv1, col, idx, radial = [], [], [], [], [], []          # radial:港湾 / 池塘的「离岸多近」(中心 0、岸边 1)


def vert(X, Z, h, u, v, speed, rad=0.0):
    ix, iy = to_px(X, Z, h)
    x, y = to_world(ix, iy)
    pos.extend([round(x, 1), round(y, 1)])
    uv0.extend([round(u, 2), round(v, 2)])
    uv1.extend([round(ix / IW, 5), round(iy / IH, 5)])
    col.append(speed)
    radial.append(round(rad, 3))
    return len(col) - 1


river = lay['river']
RW = lay['riverW']
half = RW / 2 + 0.8
s = 0.0
prev = None
for i, (x, z) in enumerate(river):
    a = river[max(0, i - 1)]
    b = river[min(len(river) - 1, i + 1)]
    tx, tz = b[0] - a[0], b[1] - a[1]
    l = math.hypot(tx, tz) or 1
    nx, nz = -tz / l, tx / l
    if i > 0:
        s += math.hypot(x - river[i - 1][0], z - river[i - 1][1])
    l_ = vert(x - nx * half, z - nz * half, WATER_Y, s, -half, 255)
    r_ = vert(x + nx * half, z + nz * half, WATER_Y, s, half, 255)
    if prev is not None:
        pl, pr = prev
        idx.extend([pl, pr, r_, pl, r_, l_])
    prev = (l_, r_)


def fan(cx, cz, rx, rz, h, speed, n=40, rr=1.0):          # rr = 外圈的径向值(真正的岸边 = 1)
    c = vert(cx, cz, h, cx, cz, speed, 0.0)
    ring = [vert(cx + math.cos(2 * math.pi * k / n) * rx, cz + math.sin(2 * math.pi * k / n) * rz, h,
                 cx + math.cos(2 * math.pi * k / n) * rx, cz + math.sin(2 * math.pi * k / n) * rz, speed, rr) for k in range(n)]
    for k in range(n):
        idx.extend([c, ring[k], ring[(k + 1) % n]])


# 港湾:布局里没存,按 city_plan_v4 的 HARBOR
# 扇面比水面放大一圈(11-20:正好卡在水边时,港湾外沿露出一条八角形的边;多出来的部分由遮罩裁掉)
fan(80, 88, 18.8 + 4, 7.8 + 4, WATER_Y, 30, 64, (18.8 + 4) / 18.8)
fan(POND[0], POND[1], POND[2] + 1.5, POND[3] + 1.5, POND_Y, 18, 48, (POND[2] + 1.5) / (POND[2] + 0.3))

# ── 遮罩 ──
mw, mh = math.ceil(IW / SC), math.ceil(IH / SC)
jj, ii = np.mgrid[0:mh, 0:mw]
ix = ii * SC + SC / 2
iy = jj * SC + SC / 2
sxv = PL[0] + ix / PPM
syv = PL[3] - iy / PPM


def ground(h):
    along = (syv - h * COSP) / SINP
    return C0[0] + sxv * (-HZ) + along * HX, C0[2] + sxv * HX + along * HZ


Xg, Zg = ground(WATER_Y)
gi = ((Xg - lg['x0']) * lg['surfRes']).astype(int)
gj = ((Zg - lg['z0']) * lg['surfRes']).astype(int)
ok = (gi >= 0) & (gj >= 0) & (gi < surf.shape[1]) & (gj < surf.shape[0])
water = np.zeros((mh, mw), bool)
water[ok] = (surf[gj[ok], gi[ok]] == 3) & ~bridge[gj[ok], gi[ok]]
Xp, Zp = ground(POND_Y)
water |= ((Xp - POND[0]) / POND[2]) ** 2 + ((Zp - POND[1]) / POND[3]) ** 2 <= 1
# 前面有东西挡着的像素去掉(查遮挡块的 b 通道)
vis = np.zeros((mh, mw), bool)
ys, xs = np.nonzero(water)
cr, cc = (iy[ys, xs] // CH).astype(int), (ix[ys, xs] // CH).astype(int)
for r_, c_ in set(zip(cr.tolist(), cc.tolist())):
    pth = f'{ROOT}/assets/resources/pre25/city/o_{r_}_{c_}.webp'
    sel = (cr == r_) & (cc == c_)
    if not os.path.exists(pth):
        continue
    o = np.asarray(Image.open(pth))
    py = (iy[ys[sel], xs[sel]] - r_ * CH).astype(int)
    px = (ix[ys[sel], xs[sel]] - c_ * CH).astype(int)
    vis[ys[sel], xs[sel]] = o[py, px, 2] < 100
m = Image.fromarray((vis * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
m.save(OUT_MASK, optimize=True)
print('mask', OUT_MASK, m.size, f'{vis.mean():.4f}', os.path.getsize(OUT_MASK) // 1024, 'KB')

data = {'pos': pos, 'uv0': uv0, 'uv1': uv1, 'speed': col, 'radial': radial, 'idx': idx, 'mask': 'pre25/city/water_mask/texture', 'riverHalf': half}
with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// 自动生成:tools/proto3d/pre25/water_build.py(主城 v4 流动的水:网格 + 遮罩路径;别手改)\n/* eslint-disable */\n')
    f.write('export const PRE25_WATER = ' + json.dumps(data, separators=(',', ':')) + ' as const;\n')
print('ts', OUT_TS, len(col), 'verts', len(idx) // 3, 'tris')
