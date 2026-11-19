# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 0 期:把 capture_map.py 拍的分块拼成整张地图,切成游戏要的块,生成可走格和数据。

  python -I tools/proto3d/pre25/build_map.py <拍摄目录> <资源输出目录> <数据 .ts 输出> [--chunk=1024] [--q=86] [--unit=1.7]

产物:
  <资源输出目录>/c_<行>_<列>.webp  颜色块(有损)(chunk × chunk,最后一行 / 列不足的补边)
  <资源输出目录>/o_<行>_<列>.webp  遮挡块(无损):r / g = 挡人的东西(建筑、摆件、树、墙台阶)的视深(16 位,按近 / 远裁剪面归一),b = 它的不透明度;
                                  没东西的地方 r = g = 255、b = 0(= 无穷远,永远不挡人)
  <资源输出目录>/overview.jpg      整图缩略(小地图 / 地图页)
  <数据 .ts>                       PRE25_CITY_DATA:尺寸、块数、相机参数、可走格(十六进制行)、灯
以及拍摄目录里的 full_bg.jpg / full_occ.png 方便看。

坐标约定(和游戏里 2D 世界一致):整图中心 = 地图原点,x 往右、y 往上;1 个图片像素 = unit 个世界单位。
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
CAP, OUT, TS = ARGS[0], ARGS[1], ARGS[2]
CHUNK = int(OPT.get('chunk', 1024))
Q = int(OPT.get('q', 82))
DEPTH_LO = int(OPT.get('depthlo', 4))          # 深度低 8 位只留几位(12 位 ≈ 6 厘米一档,判定余量 35 厘米;省一半多体积)
UNIT = float(OPT.get('unit', 1.7))
CELL = int(OPT.get('cell', 16))
os.makedirs(OUT, exist_ok=True)

M = json.load(open(os.path.join(CAP, 'map.json'), encoding='utf-8'))
IW, IH = M['img']
TW, TH = M['tile']
COLS, ROWS = M['grid']
MG = M['margin']
PPM = M['ppm']
p = math.radians(M['pitch'])
sx0, sy0, sx1, sy1 = M['plane']
C0 = M['c0']
YAW = M.get('yaw', 0.0)
HH = (math.cos(math.radians(YAW)), 0.0, math.sin(math.radians(YAW)))
RR = (-HH[2], 0.0, HH[0])
NEAR, FAR = M['near'], M['far']


def load(path, mode='RGB'):
    return np.asarray(Image.open(path).convert(mode), dtype=np.float32)


def stitch(kind):
    full = np.zeros((ROWS * TH, COLS * TW, 3), np.float32)
    for r in range(ROWS):
        for c in range(COLS):
            path = os.path.join(CAP, 'tiles', f'{r}_{c}_{kind}.png')
            if not os.path.exists(path):          # 多边形外没拍的块:留黑(颜色)/ 留 0(深度、蒙版 → 当成没东西)
                if kind.startswith('m_') and kind.endswith('_255'):
                    full[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = 255
                continue
            a = load(path)
            full[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = a[MG:MG + TH, MG:MG + TW]
    return full[:IH, :IW]


print('stitch bg')
bg = stitch('bg')
print('stitch depth')
dep = stitch('depth')
print('stitch masks')
alpha = np.zeros((IH, IW), np.float32)
alpha_solid = np.zeros((IH, IW), np.float32)          # 只算实心的(建筑、摆件、墙、台阶),不算树:可走格的「被盖住」只看它
for g in ('bld', 'trees', 'stone'):
    a = stitch(f'm_{g}_0')
    b = stitch(f'm_{g}_255')
    ag = np.clip(1 - (b - a).mean(-1) / 255.0, 0, 1)
    alpha = np.maximum(alpha, ag)
    if g != 'trees':
        alpha_solid = np.maximum(alpha_solid, ag)
# 1 像素以下的毛刺(块与块之间、远处天空)清掉
alpha[alpha < 0.03] = 0

bg8 = np.clip(bg, 0, 255).astype(np.uint8)
Image.fromarray(bg8).save(os.path.join(CAP, 'full_bg.jpg'), quality=90)
occ = np.zeros((IH, IW, 3), np.uint8)
solid = alpha > 0
occ[..., 0] = np.where(solid, dep[..., 0], 255).astype(np.uint8)
occ[..., 1] = np.where(solid, dep[..., 1], 255).astype(np.uint8)
occ[..., 2] = (alpha * 255 + 0.5).astype(np.uint8)
Image.fromarray(occ).save(os.path.join(CAP, 'full_occ.png'))

# ── 切块 ──
ccols, crows = math.ceil(IW / CHUNK), math.ceil(IH / CHUNK)
pad_w, pad_h = ccols * CHUNK, crows * CHUNK
bgp = np.zeros((pad_h, pad_w, 3), np.uint8)
bgp[:IH, :IW] = bg8
# 补边:往外复制最后一行 / 列(块边取样不发黑)
bgp[IH:, :IW] = bg8[IH - 1:IH]
bgp[:, IW:] = bgp[:, IW - 1:IW]
occp = np.zeros((pad_h, pad_w, 3), np.uint8)
occp[..., 0] = 255
occp[..., 1] = 255
occp[:IH, :IW] = occ
total_c = total_o = 0
present = []          # 存下来的块 [行, 列];整块落在没拍的区域(纯黑)的不存,游戏里也不铺
for r in range(crows):
    for c in range(ccols):
        sl = (slice(r * CHUNK, (r + 1) * CHUNK), slice(c * CHUNK, (c + 1) * CHUNK))
        if bgp[sl].max() < 6:
            continue
        present.append([r, c])
        cp = os.path.join(OUT, f'c_{r}_{c}.webp')
        Image.fromarray(bgp[sl]).save(cp, 'WEBP', quality=Q, method=6)
        op = os.path.join(OUT, f'o_{r}_{c}.webp')
        o = occp[sl].copy()
        o[..., 1] &= 0xFF ^ ((1 << (8 - DEPTH_LO)) - 1)
        Image.fromarray(o).save(op, 'WEBP', lossless=True, method=6)
        total_c += os.path.getsize(cp)
        total_o += os.path.getsize(op)
ov = Image.fromarray(bg8)
ov.thumbnail((1024, 1024), Image.LANCZOS)
ov.save(os.path.join(OUT, 'overview.jpg'), quality=85)
print(f'chunks {ccols}x{crows} (存了 {len(present)} 块)  color {total_c / 1e6:.2f}MB  occ {total_o / 1e6:.2f}MB  overview {os.path.getsize(os.path.join(OUT, "overview.jpg")) / 1e3:.0f}KB')

# ── 可走格:图片里每格中心 → 画面平面 → 地面(y = 0)上的世界点 → 在广场里、不在挡路块里、不上台地 ──
B = M['bounds']
area = OPT.get('area', '-20,20,-14,14').split(',')
AX0, AX1, AZ0, AZ1 = [float(v) for v in area]
XMAX = float(OPT.get('xmax', 11.0))          # 整城用 --xmax=999(台地 / 大教堂由挡路块挡)          # 台地(高 2.4 米)这一期不上:台阶脚下为止
R = 0.35
solids = M['scene']['solids']
gc, gr = math.ceil(IW / CELL), math.ceil(IH / CELL)
grid = np.zeros((gr, gc), np.uint8)
for r in range(gr):
    for c in range(gc):
        ix, iy = (c + 0.5) * CELL, (r + 0.5) * CELL
        sx = sx0 + ix / PPM
        sy = sy1 - iy / PPM
        # 画面平面 → 地面:横向沿 R、纵向沿水平朝向 H 走 sy / sin(俯角)
        t = sy / math.sin(p)
        X = C0[0] + sx * RR[0] + t * HH[0]
        Z = C0[2] + sx * RR[2] + t * HH[2]
        ok = AX0 + R < X < min(AX1, XMAX) - R and AZ0 + R < Z < AZ1 - R
        if ok:
            # 地面被近处的实心东西(屋顶、墙)盖住的格子不让走:人走进去会整个被挡住,玩家看不见自己。
            # 树冠不算(11-19 用户录屏卡位:枝杈把树下的地切成一块块孤岛,人钻进去出不来;站在树下本来也看得见人)
            y0, y1, x0, x1 = int(r * CELL), int(min(IH, (r + 1) * CELL)), int(c * CELL), int(min(IW, (c + 1) * CELL))
            ground_d = sy / math.tan(p) + M['dist']
            od = NEAR + (dep[y0:y1, x0:x1, 0] / 255.0 + dep[y0:y1, x0:x1, 1] / 255.0 / 255.0) * (FAR - NEAR)
            cover = (alpha_solid[y0:y1, x0:x1] > 0.5) & (od < ground_d - 0.3)
            if cover.mean() > 0.35 and 'nocover' not in OPT:          # 整城用 --nocover:被挡住的地方主角显示成半透明剪影(pre25-actor.effect),不再整格禁走
                ok = False
        if ok:
            for s in solids:
                if abs(X - s[0]) < s[2] + R and abs(Z - s[1]) < s[3] + R:
                    ok = False
                    break
        grid[r, c] = 1 if ok else 0

# 只留连成一片的最大那块(四邻接):零碎的孤岛走进去就出不来
lab = np.zeros(grid.shape, np.int32)
sizes = [0]
for r0 in range(gr):
    for c0 in range(gc):
        if grid[r0, c0] and not lab[r0, c0]:
            k = len(sizes)
            lab[r0, c0] = k
            stack = [(r0, c0)]
            n = 0
            while stack:
                r, c = stack.pop()
                n += 1
                for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                    if 0 <= rr < gr and 0 <= cc < gc and grid[rr, cc] and not lab[rr, cc]:
                        lab[rr, cc] = k
                        stack.append((rr, cc))
            sizes.append(n)
if len(sizes) > 1:
    best = int(np.argmax(sizes))
    dropped = sum(sizes) - sizes[best]
    grid = (lab == best).astype(np.uint8)
    print(f'walk 连通块 {len(sizes) - 1} 个,只留最大的({sizes[best]} 格),去掉孤岛 {dropped} 格')
rows_hex = []
for r in range(gr):
    bits = grid[r].tolist()
    while len(bits) % 4:
        bits.append(0)
    rows_hex.append(''.join('%x' % (bits[i] << 3 | bits[i + 1] << 2 | bits[i + 2] << 1 | bits[i + 3]) for i in range(0, len(bits), 4)))
walk_cells = int(grid.sum())
print(f'walk {gc}x{gr} cells, walkable {walk_cells}')

# 灯(画面上的光晕位置):3D 场景里的点光 → 图片像素
lights = []
for L in M['scene'].get('lights', []):
    if not L.get('on', True):
        continue
    P = L['p']
    d = [P[0] - C0[0], P[1] - C0[1], P[2] - C0[2]]
    sx = d[0] * RR[0] + d[2] * RR[2]
    sy = (d[0] * HH[0] + d[2] * HH[2]) * math.sin(p) + d[1] * math.cos(p)
    ix, iy = (sx - sx0) * PPM, (sy1 - sy) * PPM
    if 0 <= ix < IW and 0 <= iy < IH:
        lights.append([round(ix), round(iy), L['kind'], [round(v) for v in L['c']]])

data = {
    'px': [IW, IH], 'chunk': CHUNK, 'grid': [ccols, crows], 'chunks': present, 'unit': UNIT, 'ppm': PPM, 'pitch': M['pitch'], 'yaw': YAW,
    'near': NEAR, 'far': FAR, 'dist': M['dist'], 'c0': C0, 'plane': M['plane'],
    'walk': {'cell': CELL, 'cols': gc, 'rows': rows_hex}, 'lights': lights,
}
with open(TS, 'w', encoding='utf-8', newline='\n') as f:
    f.write('/**\n * 预渲染 2.5D 主城广场(第 0 期)的地图数据(由 tools/proto3d/pre25/build_map.py 生成,别手改)。\n'
            ' * px = 整图像素;chunk = 每块边长;grid = 块的列 / 行数;unit = 一个图片像素合多少世界单位;\n'
            ' * ppm = 图片像素 / 米(画面平面上);pitch = 俯角;near / far / dist = 深度编码用(视深 = near + v·(far − near));\n'
            ' * c0 / plane = 画面平面坐标(米)的原点和范围 [左, 下, 右, 上];walk = 可走格(每行十六进制,高位在左,第 0 行在最上);\n'
            ' * lights = 灯 [x, y(图片像素,左上原点), 种类, 颜色]。\n */\n')
    f.write('export const PRE25_CITY_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ' as const;\n')
print('ts', TS, os.path.getsize(TS))
