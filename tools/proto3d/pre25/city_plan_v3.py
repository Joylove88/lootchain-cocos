# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期 v3:自然生长式整城布局(给用户确认用的平面图 + 之后 3D 摆城用的布局数据)。

  python tools/proto3d/pre25/city_plan_v3.py <输出.png> [--rot=<转到视角 D 的 png>] [--json=<布局数据.json>] [--seed=7]

11-19 用户看了 v2(方格网):「太过于整齐规律了吧。可以参考鸣潮、原神、流放之路 2」。
v3 口径(取的是这类主城共通的做法,不照搬任何一座城):
- 城依河而建:一条弯河从东南流到西南,穿过下城;三座桥(主桥在南门大路上);
- 上城 / 下城:大教堂、帝国学院、贵族区在北面高台(约 +3 米),一道宽台阶 + 一条盘山坡道上去;
- 主路弯曲分叉:南门大路 S 形上到罗盘广场;东门的集市路斜穿三角集市;西路通公会圆场、花园;
- 广场形状各异:罗盘广场(现有)、三角集市、公会圆场、喷泉小广场、钟楼小广场、码头、南门广场;
- 城墙顺地势是不规则多边形,角上圆塔;
- 房子沿街排、朝向跟街走、大小不一,街坊中间留能走的后院;房与房之间至少 2.5 米的巷子,哪里都走得通。
坐标 = 3D 主城场景地面坐标(米):X 往东、Z 往南(北 = -Z)。罗盘广场和大教堂保留现有位置。
"""
import json
import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
RND = random.Random(int(OPT.get('seed', 7)))

X0, X1, Z0, Z1 = -122, 122, -104, 106
PX = 5
W, H = (X1 - X0) * PX, (Z1 - Z0) * PX
RES = 2                                  # 占地栅格:每米 2 格
GW, GH = (X1 - X0) * RES, (Z1 - Z0) * RES


def catmull(pts, n=10):
    """折线 → 平滑曲线(Catmull-Rom,过每个点)。"""
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(tuple(pts[-1]))
    return out


# ── 布局 ──
WALL = [(-104, -70), (-74, -92), (-16, -98), (40, -94), (88, -76), (110, -40), (115, 24), (112, 76), (66, 94), (-6, 100),
        (-62, 96), (-102, 84), (-116, 34), (-114, -30)]
GATES = {'south': (-6, 100), 'east': (115, 24)}
RIVER = catmull([(126, 74), (96, 66), (64, 56), (30, 50), (-6, 55), (-40, 64), (-74, 58), (-100, 64), (-126, 74)])
RIVER_W = 11
UPPER = [(-50, -40), (-20, -50), (14, -46), (40, -44), (62, -50), (82, -42), (76, -22), (50, -16), (14, -16), (-12, -20), (-34, -24)]
UPPER_H = 3.0
ROADS = [
    # (名字, 宽, 控制点)
    ('南门大路', 10, [(-6, 98), (-9, 84), (-3, 70), (-6, 55), (-12, 42), (-5, 28), (-5, 14)]),
    ('集市路', 10, [(115, 24), (98, 27), (80, 31), (64, 30), (48, 24), (30, 21), (12, 13)]),
    ('盘山坡道', 8, [(12, -14), (26, -18), (46, -20), (58, -28), (60, -42), (48, -56), (28, -64), (8, -68)]),
    ('西路', 9, [(-20, 0), (-34, -3), (-46, -1), (-60, -9), (-72, -20), (-82, -36), (-80, -54)]),
    ('学院路', 7, [(-14, -14), (-20, -28), (-26, -40), (-34, -50)]),
    ('北岸滨河路', 6, [(110, 60), (90, 56), (64, 46), (30, 41), (-6, 45), (-40, 54), (-72, 48), (-104, 54)]),
    ('南岸滨河路', 6, [(104, 82), (88, 76), (62, 66), (30, 60), (-6, 66), (-40, 74), (-76, 69), (-100, 76)]),
    ('北巷', 6, [(-80, -54), (-62, -74), (-34, -84), (-6, -86), (8, -68)]),
    ('东巷', 6, [(60, -42), (80, -32), (96, -14), (104, 6), (98, 27)]),
    ('西坊巷', 6, [(-60, -9), (-68, 8), (-84, 22), (-90, 40), (-80, 50)]),
    ('酒馆巷', 6, [(-46, -1), (-42, 14), (-30, 24), (-20, 32), (-8, 34)]),
    ('东坊巷', 6, [(12, 13), (20, 26), (30, 36), (40, 42)]),
    ('东桥路', 6, [(48, 24), (52, 38), (56, 50), (60, 64), (64, 80)]),
    ('西桥路', 6, [(-58, 30), (-58, 46), (-60, 62), (-64, 80)]),
    ('坊间小巷', 5, [(-68, 8), (-50, 14), (-42, 14)]),
    ('坊间小巷', 5, [(-90, 40), (-72, 34), (-58, 30), (-42, 30), (-30, 24)]),
    ('坊间小巷', 5, [(80, 31), (84, 46), (90, 56)]),
    ('坊间小巷', 5, [(-34, -50), (-50, -64), (-62, -74)]),
    ('坊间小巷', 5, [(28, -64), (40, -80), (60, -84)]),
    ('坊间小巷', 5, [(-6, 66), (-20, 82), (-40, 88)]),
    ('坊间小巷', 5, [(30, 60), (34, 78), (20, 90)]),
]
BRIDGES = [(-6, 55, 7), (56, 52, 7), (-60, 62, 5)]          # x, z, 宽
PLAZAS = [
    # (名字, 形状)
    ('罗盘广场(现有)', ('rect', -20, -14, 12, 14)),
    ('三角集市', ('poly', [(50, 16), (90, 22), (72, 46), (56, 36)])),
    ('公会圆场', ('circle', -46, -6, 11)),
    ('喷泉小广场', ('circle', -20, 32, 8)),
    ('钟楼小广场', ('circle', 2, -36, 8)),
    ('码头', ('poly', [(72, 54), (104, 60), (102, 66), (70, 60)])),
    ('南门广场', ('circle', -6, 88, 10)),
    ('学院前庭', ('rect', -42, -50, -22, -42)),
]
GREENS = [('王都花园', ('ellipse', -84, -30, 19, 14)), ('宅邸花园', ('ellipse', 72, -62, 11, 8))]
POND = ('ellipse', -86, -31, 7, 4.5)
PADDOCK = ('poly', [(-108, 18), (-94, 12), (-88, 34), (-104, 40)])
KEYS = [
    # (名字, NPC, x, z, 宽, 进深, 朝向度(0 = 正面朝南))
    ('圣辉大教堂', '', 30, 2, 22, 28, -20),
    ('帝国学院', '帝国学者', -40, -64, 30, 13, 18),
    ('佣兵公会', '公会会长', -60, -22, 16, 12, 35),
    ('金麦酒馆', '酒馆老板', -34, 42, 14, 11, -10),
    ('马厩', '', -100, 4, 20, 8, 75),
    ('王都兵营', '卫队长', 96, -6, 18, 9, 70),
    ('贵族宅邸', '', 40, -78, 18, 12, -8),
    ('贵族宅邸', '', 18, -84, 14, 10, 5),
]
TERRACE = ('poly', [(14, -12), (46, -12), (48, 18), (16, 18)])       # 教堂台地 = 教堂占地(不再悬空)
NPCS = [('吟游诗人', -6.5, 3.2), ('卖花姑娘', 4, 4), ('老镇民', 4, -5.5), ('帝国学者', -32, -46), ('公会会长', -46, -6),
        ('酒馆老板', -28, 34), ('杂货商', 62, 28), ('果摊大婶', 76, 32), ('小汤姆', 66, 40), ('卫队长', 88, -2),
        ('城门卫兵', 108, 28), ('城门卫兵', -10, 92)]


# ── 占地栅格 ──
def gi(x, z):
    return (x - X0) * RES, (z - Z0) * RES


def shape_poly(shape, n=48):
    k = shape[0]
    if k == 'rect':
        _, a, b, c, d = shape
        return [(a, b), (c, b), (c, d), (a, d)]
    if k == 'poly':
        return shape[1]
    if k == 'circle':
        _, x, z, r = shape
        return [(x + r * math.cos(2 * math.pi * i / n), z + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    if k == 'ellipse':
        _, x, z, rx, rz = shape
        return [(x + rx * math.cos(2 * math.pi * i / n), z + rz * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rot_rect(x, z, w, d, yaw):
    a = math.radians(yaw)
    ux, uz = math.cos(a), -math.sin(a)          # 宽度方向
    vx, vz = math.sin(a), math.cos(a)           # 进深方向(正面朝 +v 的反向)
    return [(x + sx * ux * w / 2 + sz * vx * d / 2, z + sx * uz * w / 2 + sz * vz * d / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def raster(polys=(), lines=(), dilate=0.0):
    im = Image.new('L', (GW, GH), 0)
    dr = ImageDraw.Draw(im)
    for p in polys:
        dr.polygon([gi(x, z) for x, z in p], fill=255)
    for pts, w in lines:
        q = [gi(x, z) for x, z in pts]
        dr.line(q, fill=255, width=max(1, int(round(w * RES))))
        r = w * RES / 2
        for x, y in q:
            dr.ellipse([x - r, y - r, x + r, y + r], fill=255)
    a = np.asarray(im) > 0
    if dilate > 0:
        from scipy import ndimage
        rr = int(round(dilate * RES))
        yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
        a = ndimage.binary_dilation(a, structure=(xx * xx + yy * yy) <= rr * rr)
    return a


road_curves = [(n, w, catmull(p)) for n, w, p in ROADS]
inside = raster([WALL])
from scipy import ndimage  # noqa: E402
inside_core = ndimage.binary_erosion(inside, iterations=int(6 * RES))          # 城墙内侧留 6 米走道
road_m = raster(lines=[(c, w) for _, w, c in road_curves])
water_m = raster(lines=[(RIVER, RIVER_W)])
plaza_m = raster([shape_poly(s) for _, s in PLAZAS])
green_m = raster([shape_poly(s) for _, s in GREENS] + [shape_poly(PADDOCK)])
key_polys = [rot_rect(x, z, w, d, y) for _, _, x, z, w, d, y in KEYS]
key_m = raster(key_polys + [shape_poly(TERRACE)])
hard = road_m | water_m | plaza_m | green_m | key_m | ~inside_core
# 11-19 用户:「建筑不要太多太密集,让玩家可以有更多走动的空间」→ 房子离街 2 米、房与房之间至少 SPACE 米、沿街间距放大、填空只补少量
SPACE = float(OPT.get('space', 5.0))
# 11-19 用户选「加更多广场 / 绿地」:在房子排之前,找城里最大的几块空地,轮流做成街心公园 / 小广场(空地有内容,不只是碎石地)
dt = ndimage.distance_transform_edt(inside_core & ~hard) / RES
spots = []
dtw = dt.copy()
while len(spots) < int(OPT.get('parks', 9)):
    j, i = np.unravel_index(int(np.argmax(dtw)), dtw.shape)
    r = float(dtw[j, i])
    if r < 7:
        break
    x, z = X0 + i / RES, Z0 + j / RES
    spots.append((x, z, r))
    yy, xx = np.mgrid[0:GH, 0:GW]
    dtw[(xx - i) ** 2 + (yy - j) ** 2 < (30 * RES) ** 2] = 0
# 用户点名去掉的自动公园(11-19:「左侧这个小公园移除点」= 学院和王都花园之间那个)
DROP_NEAR = [(-64, -50)]
for k, (x, z, r) in enumerate(spots):
    if not all(math.hypot(x - dx, z - dz) > 8 for dx, dz in DROP_NEAR):
        continue          # 公园 / 广场按原来的顺序轮流分,去掉一个不影响别的
    if k % 2 == 0:
        rr = min(r - 1.5, 13)
        GREENS.append((f'街心公园', ('ellipse', round(x, 1), round(z, 1), round(rr, 1), round(rr * 0.75, 1))))
    else:
        PLAZAS.append((f'小广场', ('circle', round(x, 1), round(z, 1), round(min(r - 1.5, 9), 1))))
plaza_m = raster([shape_poly(s_) for _, s_ in PLAZAS])
green_m = raster([shape_poly(s_) for _, s_ in GREENS] + [shape_poly(PADDOCK)])
hard = road_m | water_m | plaza_m | green_m | key_m | ~inside_core
print('自动加的公园 / 小广场', len(spots))
hard_d = ndimage.binary_dilation(hard, iterations=int(2.0 * RES))

# ── 沿街排房子 ──
houses = []
house_m = np.zeros((GH, GW), bool)
for name, w, c in road_curves:
    seg = [(c[i], c[i + 1]) for i in range(len(c) - 1)]
    L = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in seg]
    total = sum(L)
    for side in (-1, 1):
        s = RND.uniform(1, 5)
        while s < total:
            hw = RND.choice([6.5, 7.0, 7.5, 8.0, 9.0, 10.0])
            hd = RND.choice([6.0, 6.5, 7.0, 8.0])
            gap = RND.uniform(SPACE, SPACE * 2.2)
            # 弧长 s 处的点和切线
            acc = 0
            for (a, b), l in zip(seg, L):
                if acc + l >= s + hw / 2:
                    t = (s + hw / 2 - acc) / max(l, 1e-6)
                    px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                    tx, tz = (b[0] - a[0]) / max(l, 1e-6), (b[1] - a[1]) / max(l, 1e-6)
                    break
                acc += l
            else:
                break
            nx, nz = -tz * side, tx * side
            off = w / 2 + 2.3 + hd / 2 + RND.uniform(0, 1.0)
            cx, cz = px + nx * off, pz + nz * off
            yaw = math.degrees(math.atan2(-tz, tx)) + RND.uniform(-6, 6)
            poly = rot_rect(cx, cz, hw, hd, yaw)
            fm = raster([poly])
            if not (fm & hard_d).any() and not (fm & ndimage.binary_dilation(house_m, iterations=int(SPACE * RES))).any():
                houses.append({'x': round(cx, 2), 'z': round(cz, 2), 'w': hw, 'd': hd, 'yaw': round(yaw, 1), 'road': name})
                house_m |= fm
                s += hw + gap
            else:
                s += 2.0

# 填空:街坊中间还空着的大块地,按最近那条街的方向再塞房子(还是留 2.6 米巷子、离街 1 米以上);
# 每栋房子往外 6 米内要能看到街或广场(不让房子堵成一团、后院走不出去)
samples = []
for name, w, c in road_curves:
    for i in range(len(c) - 1):
        a_, b_ = c[i], c[i + 1]
        l = math.hypot(b_[0] - a_[0], b_[1] - a_[1]) or 1
        samples.append((a_[0], a_[1], (b_[0] - a_[0]) / l, (b_[1] - a_[1]) / l))
S = np.array(samples)
open_m = road_m | plaza_m
open_near = ndimage.binary_dilation(open_m, iterations=int(14 * RES))
n_fill = 0
for _ in range(int(OPT.get('infill', 40000))):
    if n_fill >= int(OPT.get('fillmax', 12)):
        break
    cx, cz = RND.uniform(X0, X1), RND.uniform(Z0, Z1)
    i, j = int((cx - X0) * RES), int((cz - Z0) * RES)
    if not (0 <= i < GW and 0 <= j < GH) or not inside_core[j, i] or hard_d[j, i] or not open_near[j, i]:
        continue
    k = int(np.argmin((S[:, 0] - cx) ** 2 + (S[:, 1] - cz) ** 2))
    yaw = math.degrees(math.atan2(-S[k, 3], S[k, 2])) + RND.choice([0, 0, 90]) + RND.uniform(-8, 8)
    hw = RND.choice([6.5, 7.0, 7.5, 8.0, 9.0])
    hd = RND.choice([6.0, 6.5, 7.0])
    poly = rot_rect(cx, cz, hw, hd, yaw)
    fm = raster([poly])
    if (fm & hard_d).any() or (fm & ndimage.binary_dilation(house_m, iterations=int(SPACE * RES))).any():
        continue
    houses.append({'x': round(cx, 2), 'z': round(cz, 2), 'w': hw, 'd': hd, 'yaw': round(yaw, 1), 'road': 'infill'})
    house_m |= fm
    n_fill += 1

# 林荫大道:主路两边每 9 米一棵树(在街沿上,不挡路)
avenue = []
blocked_t = water_m | plaza_m | key_m | house_m
for name, w, c in road_curves:
    if name not in ('南门大路', '集市路', '西路', '盘山坡道', '北岸滨河路', '学院路'):
        continue
    acc, nxt = 0.0, 4.0
    for i in range(len(c) - 1):
        a_, b_ = c[i], c[i + 1]
        l = math.hypot(b_[0] - a_[0], b_[1] - a_[1]) or 1e-6
        tx, tz = (b_[0] - a_[0]) / l, (b_[1] - a_[1]) / l
        while nxt <= acc + l:
            t = (nxt - acc) / l
            px, pz = a_[0] + (b_[0] - a_[0]) * t, a_[1] + (b_[1] - a_[1]) * t
            for side in (-1, 1):
                x, z = px - tz * side * (w / 2 + 1.0), pz + tx * side * (w / 2 + 1.0)
                gi_, gj_ = int((x - X0) * RES), int((z - Z0) * RES)
                if 0 <= gi_ < GW and 0 <= gj_ < GH and inside_core[gj_, gi_] and not blocked_t[gj_, gi_]:
                    avenue.append((round(x, 1), round(z, 1)))
            nxt += 9.0
        acc += l

# 院子里的树(街坊中间空出来的地方点几棵)
trees = []
free = inside_core & ~(hard | house_m)
for _ in range(900):
    x, z = RND.uniform(X0, X1), RND.uniform(Z0, Z1)
    i, j = int((x - X0) * RES), int((z - Z0) * RES)
    if 0 <= i < GW and 0 <= j < GH and free[j, i]:
        far = all(math.hypot(x - t[0], z - t[1]) > 9 for t in trees)
        if far:
            trees.append((round(x, 1), round(z, 1)))
    if len(trees) >= 70:
        break

walk_m = inside & ~(water_m | house_m | key_m | raster([shape_poly(POND)]))
print(f'房子 {len(houses)} 栋,树 {len(trees)} 棵;城墙内 {inside.sum() / RES / RES:.0f} 平方米,能走 {walk_m.sum() / inside.sum():.0%}')

# ── 画平面图 ──
img = Image.new('RGB', (W, H + 170), (22, 24, 30))
d = ImageDraw.Draw(img, 'RGBA')
F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
FB = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 20)
FS = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 12)


def P(x, z):
    return ((x - X0) * PX, (z - Z0) * PX)


def fillp(poly, fill, outline=None, w=1):
    d.polygon([P(x, z) for x, z in poly], fill=fill, outline=outline, width=w)


def text(x, z, s, font=F, fill=(240, 236, 224), anchor='mm'):
    d.text(P(x, z), s, font=font, fill=fill, anchor=anchor)


fillp(WALL, (84, 82, 76))                                    # 城里的地面(土 / 碎石,也能走)
fillp(UPPER, (100, 96, 88), (200, 186, 150), 2)              # 上城高台
for n, w, c in road_curves:                                  # 石板街
    d.line([P(x, z) for x, z in c], fill=(128, 124, 116), width=int(w * PX), joint='curve')
    r = w * PX / 2
    for x, z in (c[0], c[-1]):
        cx, cy = P(x, z)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(128, 124, 116))
for n, s in PLAZAS:
    fillp(shape_poly(s), (142, 136, 124), (225, 214, 190), 2)
for n, s in GREENS:
    fillp(shape_poly(s), (52, 76, 48), (120, 160, 110), 2)
fillp(shape_poly(POND), (50, 82, 112))
fillp(shape_poly(PADDOCK), (96, 84, 60), (150, 130, 90), 2)
d.line([P(x, z) for x, z in RIVER], fill=(50, 82, 112), width=RIVER_W * PX, joint='curve')
for x, z, bw in BRIDGES:
    fillp(rot_rect(x, z, bw, RIVER_W + 4, 0), (140, 132, 118), (215, 205, 185), 2)
fillp(shape_poly(TERRACE), (110, 104, 96), (210, 198, 176), 2)
for h in houses:
    fillp(rot_rect(h['x'], h['z'], h['w'], h['d'], h['yaw']), (54, 49, 47), (140, 114, 88))
for x, z in avenue:
    cx, cy = P(x, z)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(170, 80, 44), outline=(90, 40, 20))
for n, s_ in GREENS:
    if n == '街心公园':
        _, gx, gz, rx, rz = s_
        for k in range(5):
            a_ = 2 * math.pi * k / 5 + 0.4
            cx, cy = P(gx + rx * 0.6 * math.cos(a_), gz + rz * 0.6 * math.sin(a_))
            d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(150, 70, 40), outline=(90, 40, 20))
for x, z in trees:
    cx, cy = P(x, z)
    d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(150, 70, 40), outline=(90, 40, 20))
for (name, npc, x, z, w_, d_, y) in KEYS:
    fillp(rot_rect(x, z, w_, d_, y), (54, 49, 47), (196, 150, 84), 3)
    text(x, z, name, FB)
d.line([P(x, z) for x, z in WALL + [WALL[0]]], fill=(160, 150, 130), width=6, joint='curve')
for x, z in WALL:
    cx, cy = P(x, z)
    d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=(120, 112, 100), outline=(200, 190, 170), width=2)
# 台阶 / 坡道示意
for (x, z, s_) in [(-4, -17, '大台阶'), (-36, -27, '台阶'), (62, -36, '坡道'), (8, -16, '坡道')]:
    text(x, z, s_, FS, (255, 230, 170))
for n, s in PLAZAS:
    p = shape_poly(s)
    cx, cz = sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
    text(cx, cz, n, FS, (40, 36, 30))
for n, s in GREENS:
    text(s[1], s[2] - s[4] + 3, n, FS)
text(-98, 26, '马场', FS)
text(30, -30, '上城(高台 +3 米)', F, (255, 230, 170))
text(0, 54, '主桥', FS)
text(100, 62, '河', FS)
for k, (x, z) in GATES.items():
    cx, cy = P(x, z)
    d.rectangle([cx - 16, cy - 16, cx + 16, cy + 16], fill=(160, 60, 50), outline=(255, 210, 160), width=3)
    text(x, z, '门', FB)
text(-6, 105, '南门 → 村外林地', FS, (255, 220, 180))
text(115, 32, '东门', FS, (255, 220, 180))
text(115, 36, '→ 灰岩荒原', FS, (255, 220, 180))
for name, x, z in NPCS:
    cx, cy = P(x, z)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(90, 200, 255), outline=(255, 255, 255), width=2)
    d.text((cx + 8, cy), name, font=FS, fill=(180, 230, 255), anchor='lm')
by = H + 50
d.line([30, by, 30 + 20 * PX, by], fill=(240, 236, 224), width=4)
d.text((30 + 20 * PX + 10, by), '20 米', font=F, fill=(240, 236, 224), anchor='lm')
d.text((30 + 20 * PX + 80, by), '浅灰 = 石板街 / 广场   深灰 = 碎石地(也能走)   深色 = 房子   金边 = 有 NPC / 功能   绿 = 花园(能走)', font=F, fill=(220, 214, 200), anchor='lm')
d.text((30, by + 36), f'约 {230} × {200} 米(第一版 120 × 100);弯河穿城、上城高台、主路弯曲分叉、广场形状各异;房子少而疏、沿街排,中间是能走的空地 / 后院', font=F, fill=(220, 214, 200), anchor='lm')
d.text((30, by + 68), f'房子 {len(houses)} 栋(复用现有 4 种民居模型,换朝向 / 大小);房与房之间至少 5 米;能走面积约占城内 {walk_m.sum() / inside.sum():.0%}', font=F, fill=(220, 214, 200), anchor='lm')
nx, ny = W - 50, H + 80
d.polygon([(nx, ny - 34), (nx - 12, ny), (nx + 12, ny)], fill=(240, 236, 224))
d.text((nx, ny + 16), '北', font=F, fill=(240, 236, 224), anchor='mm')
img.save(OUT)
print('saved', OUT, img.size)

if 'rot' in OPT:
    core = img.crop((0, 0, W, H))
    r = core.rotate(45, expand=True, resample=Image.BICUBIC, fillcolor=(22, 24, 30))
    r = r.resize((r.width, int(r.height * 0.7071)), Image.LANCZOS)
    r.save(OPT['rot'])
if 'json' in OPT:
    json.dump({'wall': WALL, 'gates': GATES, 'river': RIVER, 'riverW': RIVER_W, 'upper': UPPER, 'upperH': UPPER_H,
               'roads': [{'name': n, 'w': w, 'pts': [list(map(lambda v: round(v, 2), p)) for p in c]} for n, w, c in road_curves],
               'bridges': BRIDGES, 'plazas': PLAZAS, 'greens': GREENS, 'paddock': PADDOCK, 'keys': KEYS, 'terrace': TERRACE,
               'houses': houses, 'trees': trees, 'avenue': avenue, 'npcs': NPCS}, open(OPT['json'], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
