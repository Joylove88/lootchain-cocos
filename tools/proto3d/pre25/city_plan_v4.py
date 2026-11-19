# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期 v4:主城布局(在 v3 自然生长式上按主城设计口径重排)(给用户确认用的平面图 + 之后 3D 摆城用的布局数据)。

  python tools/proto3d/pre25/city_plan_v4.py <输出.png> [--rot=<转到视角 D 的 png>] [--json=<布局数据.json>] [--seed=7]

11-19 用户看了 v2(方格网):「太过于整齐规律了吧。可以参考鸣潮、原神、流放之路 2」。
v3 口径(取的是这类主城共通的做法,不照搬任何一座城):
- 城依河而建:一条弯河从东南流到西南,穿过下城;三座桥(主桥在南门大路上);
- 上城 / 下城:大教堂、帝国学院、贵族区在北面高台(约 +3 米),一道宽台阶 + 一条盘山坡道上去;
- 主路弯曲分叉:南门大路 S 形上到罗盘广场;东门的集市路斜穿三角集市;西路通公会圆场、花园;
- 广场形状各异:罗盘广场(现有)、三角集市、公会圆场、喷泉小广场、钟楼小广场、码头、南门广场;
- 城墙顺地势是不规则多边形,角上圆塔;
- 房子沿街排、朝向跟街走、大小不一,街坊中间留能走的后院;房与房之间至少 2.5 米的巷子,哪里都走得通。
v4(11-19 用户:「你重新审视下,看看哪里不合理的地方调整下。要像原神,或者鸣潮那种主城的布局」):
- 一条主轴贯穿:西南门 → 主桥 → 桥头集市 → 罗盘广场 → 大台阶 → 上城大教堂广场 → 大教堂(地标在轴线尽头、高处,全城看得见);
- 功能聚在中心:传送、铁匠、公会、酒馆、集市都在罗盘广场一圈 40 米内,不用跑远;
- 分层:下城(河 / 港湾 / 仓库)— 中城(广场 / 商街 / 民居)— 上城(+3 米:教堂、学院、贵族区、王都花园),台阶 / 坡道 / 观景台连接;
- 道路分级:一条 14 米王都大道 + 几条 8~10 米主街 + 5~7 米小巷,不再一堆差不多宽的弯路;
- 空地都有用途(城门广场、桥头集市、教堂广场、校场、码头、花园、滨河绿带),不再随机撒公园。
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
# 视角 D 镜头往东北看(屏幕上方 = 东北):主轴线做成西南 → 东北,玩家从西南门进城就是「一路往屏幕上方走」,
# 尽头高处是大教堂;这是固定镜头下最强的构图。
WALL = [(-112, -58), (-84, -96), (-14, -104), (58, -98), (104, -72), (120, -22), (120, 40), (112, 92), (60, 106), (4, 108),
        (-46, 94), (-88, 78), (-116, 34), (-120, -20)]
GATES = {'south': (-70, 86), 'east': (120, 6)}           # 西南门 → 村外林地;东门 → 灰岩荒原
RIVER = catmull([(-126, 10), (-96, 26), (-64, 36), (-38, 40), (-12, 50), (16, 66), (46, 80), (80, 88), (126, 94)])
RIVER_W = 11
HARBOR = ('ellipse', 80, 88, 18, 7)                       # 河在东南放宽成港湾
UPPER = [(-100, -34), (-60, -30), (-34, -26), (-12, -23), (30, -23), (56, -24), (84, -34), (106, -62), (60, -96),
         (-14, -102), (-82, -92)]
# 台阶 / 坡道:(名字, 底端中点, 顶端中点, 宽);高度沿底 → 顶从 0 线性到 UPPER_H(台阶在 3D 里按 15 厘米一级搭)
STAIRS = [('大台阶', (8, -14.6), (8, -23.6), 12), ('学院侧台阶', (-26, -17.6), (-26, -26.6), 6)]
RAMP = ('盘山坡道', (71, -6), (71, -30), 8)
UPPER_H = 3.0
ROADS = [
    ('王都大道', 14, [(-70, 84), (-62, 70), (-50, 56), (-40, 42), (-30, 28), (-18, 14)]),
    ('大台阶', 12, [(8, -13), (8, -24), (16, -28)]),
    ('东市街', 10, [(12, 4), (34, 8), (58, 10), (82, 8), (102, 6), (120, 6)]),
    ('盘山坡道', 8, [(58, 10), (66, 2), (71, -6), (71, -30), (62, -33), (42, -30)]),
    ('西街', 9, [(-20, -2), (-40, -2), (-60, -8), (-80, -18), (-94, -36)]),
    ('学院台阶路', 7, [(-20, -14), (-26, -17), (-26, -27), (-30, -40), (-32, -52)]),
    ('上城环路', 8, [(-94, -36), (-80, -56), (-54, -72), (-32, -52), (-8, -64), (18, -70), (44, -74), (70, -62), (76, -42), (62, -32)]),
    ('北岸滨河路', 7, [(-108, 14), (-84, 24), (-62, 28), (-40, 32), (-20, 38), (6, 52), (34, 66), (60, 74)]),
    ('下城路', 8, [(-50, 56), (-30, 66), (-6, 76), (20, 86), (46, 94), (66, 100)]),
    ('东坊路', 7, [(34, 8), (38, 26), (40, 46), (34, 66)]),
    ('西坊巷', 6, [(-60, -8), (-66, 10), (-84, 24)]),
    ('西坊巷', 6, [(-40, -2), (-46, 14), (-40, 32)]),
    ('东坊巷', 6, [(82, 8), (86, 30), (80, 52), (60, 74)]),
    ('东坊巷', 6, [(38, 26), (60, 30), (86, 30)]),
    ('下城巷', 5.5, [(-6, 76), (-14, 92), (-30, 98)]),
    ('下城巷', 5.5, [(20, 86), (24, 100)]),
    ('上城小巷', 5.5, [(-8, -64), (-14, -84), (-40, -90)]),
    ('上城小巷', 5.5, [(44, -74), (50, -90)]),
]
BRIDGES = [(-36, 40, 10), (34, 72, 7), (-84, 22, 6)]           # x, z, 宽(主桥在王都大道上,宽 10)
PLAZAS = [
    ('罗盘广场(传送)', ('rect', -20, -14, 12, 14)),
    ('桥头集市', ('poly', [(-34, 22), (-14, 16), (-6, 30), (-22, 34)])),
    ('大教堂广场', ('circle', 24, -30, 13)),
    ('观景台', ('poly', [(-10, -31), (0, -30), (0, -25), (-10, -25)])),
    ('城门广场', ('circle', -64, 74, 10)),
    ('码头广场', ('poly', [(50, 96), (72, 100), (70, 104), (48, 102)])),
    ('兵营校场', ('rect', 86, -2, 108, 20)),
    ('学院前庭', ('rect', -42, -62, -22, -54)),
]
GREENS = [('王都花园', ('ellipse', -66, -50, 17, 12)), ('教堂后花园', ('ellipse', 70, -74, 11, 8)),
          ('滨河绿带', ('ellipse', -6, 44, 9, 4)), ('滨河绿带', ('ellipse', 18, 58, 8, 3.6))]
POND = ('ellipse', -68, -51, 7, 4.5)
PADDOCK = ('poly', [(-108, 40), (-94, 36), (-90, 56), (-104, 62)])
KEYS = [
    ('圣辉大教堂', '', 42, -48, 22, 28, 45),
    ('帝国学院', '帝国学者', -32, -74, 30, 13, 10),
    ('佣兵公会', '公会会长', -42, -16, 16, 12, 0),
    ('金麦酒馆', '酒馆老板', -2, 22, 14, 11, -25),
    ('马厩', '', -80, 46, 18, 8, 80),
    ('王都兵营', '卫队长', 98, -14, 18, 9, 0),
    ('贵族宅邸', '', 14, -86, 18, 12, 0),
    ('贵族宅邸', '', 46, -86, 14, 10, -10),
    ('港口仓库', '', 98, 72, 18, 8, -15),
]
TERRACE = ('poly', [(28, -28), (54, -28), (58, -66), (30, -68)])          # 大教堂坐落的台基(= 教堂占地 + 一圈)
NPCS = [('吟游诗人', -6.5, 3.2), ('卖花姑娘', 4, 4), ('老镇民', 4, -5.5), ('帝国学者', -32, -58), ('公会会长', -40, -8),
        ('酒馆老板', -8, 28), ('杂货商', -26, 22), ('果摊大婶', -18, 30), ('小汤姆', -30, 30), ('卫队长', 92, 4),
        ('城门卫兵', 114, 2), ('城门卫兵', -66, 80)]

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
water_m = raster([shape_poly(HARBOR)], lines=[(RIVER, RIVER_W)])
plaza_m = raster([shape_poly(s) for _, s in PLAZAS])
green_m = raster([shape_poly(s) for _, s in GREENS] + [shape_poly(PADDOCK)])
key_polys = [rot_rect(x, z, w, d, y) for _, _, x, z, w, d, y in KEYS]
key_m = raster(key_polys + [shape_poly(TERRACE)])
hard = road_m | water_m | plaza_m | green_m | key_m | ~inside_core
# 11-19 用户:「建筑不要太多太密集,让玩家可以有更多走动的空间」→ 房子离街 2 米、房与房之间至少 SPACE 米、沿街间距放大、填空只补少量
SPACE = float(OPT.get('space', 7.0))
# 11-19 用户选「加更多广场 / 绿地」:在房子排之前,找城里最大的几块空地,轮流做成街心公园 / 小广场(空地有内容,不只是碎石地)
dt = ndimage.distance_transform_edt(inside_core & ~hard) / RES
spots = []
dtw = dt.copy()
while len(spots) < int(OPT.get('parks', 0)):
    j, i = np.unravel_index(int(np.argmax(dtw)), dtw.shape)
    r = float(dtw[j, i])
    if r < 7:
        break
    x, z = X0 + i / RES, Z0 + j / RES
    spots.append((x, z, r))
    yy, xx = np.mgrid[0:GH, 0:GW]
    dtw[(xx - i) ** 2 + (yy - j) ** 2 < (30 * RES) ** 2] = 0
# 用户点名去掉的自动公园(11-19:「左侧这个小公园移除点」= 学院和王都花园之间那个)
DROP_NEAR = []
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
    if n_fill >= int(OPT.get('fillmax', 4)):
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

# 林荫大道:主路两边每 12 米一棵树(在街沿上,不挡路)
avenue = []
blocked_t = water_m | plaza_m | key_m | house_m
for name, w, c in road_curves:
    if name not in ('王都大道', '东市街', '西街', '盘山坡道', '北岸滨河路', '上城环路'):
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
            nxt += 12.0
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
    if len(trees) >= int(OPT.get('trees', 36)):
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
fillp(shape_poly(HARBOR), (50, 82, 112))
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
for (x, z, s_) in [(10, -18, '大台阶 ↗'), (-24, -22, '台阶'), (70, -12, '坡道')]:
    text(x, z, s_, FS, (255, 230, 170))
for n, s in PLAZAS:
    p = shape_poly(s)
    cx, cz = sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
    text(cx, cz, n, FS, (40, 36, 30))
for n, s in GREENS:
    text(s[1], s[2] - s[4] + 3, n, FS)
text(-99, 49, '马场', FS)
text(-10, -40, '上城(高台 +3 米)', F, (255, 230, 170))
text(-46, 44, '主桥', FS)
text(78, 90, '港湾', FS)
for k, (x, z) in GATES.items():
    cx, cy = P(x, z)
    d.rectangle([cx - 16, cy - 16, cx + 16, cy + 16], fill=(160, 60, 50), outline=(255, 210, 160), width=3)
    text(x, z, '门', FB)
text(-70, 93, '西南门 → 村外林地', FS, (255, 220, 180))
text(112, 14, '东门', FS, (255, 220, 180))
text(112, 18, '→ 灰岩荒原', FS, (255, 220, 180))
for name, x, z in NPCS:
    cx, cy = P(x, z)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(90, 200, 255), outline=(255, 255, 255), width=2)
    d.text((cx + 8, cy), name, font=FS, fill=(180, 230, 255), anchor='lm')
by = H + 50
d.line([30, by, 30 + 20 * PX, by], fill=(240, 236, 224), width=4)
d.text((30 + 20 * PX + 10, by), '20 米', font=F, fill=(240, 236, 224), anchor='lm')
d.text((30 + 20 * PX + 80, by), '浅灰 = 石板街 / 广场   深灰 = 碎石地(也能走)   深色 = 房子   金边 = 有 NPC / 功能   绿 = 花园(能走)', font=F, fill=(220, 214, 200), anchor='lm')
d.text((30, by + 36), f'约 240 × 210 米;主轴:西南门 → 主桥 → 桥头集市 → 罗盘广场 → 大台阶 → 大教堂(屏幕上从下往上走);功能 NPC 都在广场一圈 40 米内', font=F, fill=(220, 214, 200), anchor='lm')
d.text((30, by + 68), f'房子 {len(houses)} 栋(复用现有 4 种民居模型,换朝向 / 大小);房与房之间至少 7 米;能走面积约占城内 {walk_m.sum() / inside.sum():.0%}', font=F, fill=(220, 214, 200), anchor='lm')
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


# ── 高度图(每 0.5 米一格):地面 0、上城 UPPER_H、台阶 / 坡道线性;3D 摆城(房子落在多高)和游戏里人物抬高都按它 ──
HRES = 2
HW, HH = (X1 - X0) * HRES, (Z1 - Z0) * HRES
height = np.zeros((HH, HW), np.float32)
um = Image.new('L', (HW, HH), 0)
ImageDraw.Draw(um).polygon([((x - X0) * HRES, (z - Z0) * HRES) for x, z in UPPER], fill=255)
height[np.asarray(um) > 0] = UPPER_H
yy, xx = np.mgrid[0:HH, 0:HW]
wx = X0 + (xx + 0.5) / HRES
wz = Z0 + (yy + 0.5) / HRES
for name, b0, b1, w in STAIRS + [RAMP]:
    ax, az = b1[0] - b0[0], b1[1] - b0[1]
    L2 = ax * ax + az * az
    t = ((wx - b0[0]) * ax + (wz - b0[1]) * az) / L2
    lat = np.abs((wx - b0[0]) * az - (wz - b0[1]) * ax) / math.sqrt(L2)
    m = (t >= -0.02) & (t <= 1.0) & (lat <= w / 2)
    height[m] = np.clip(t[m], 0, 1) * UPPER_H
# 桥面:桥模型(11 米长时)从桥头到桥顶量过的高度表,按缩放倍数等比放大;沿桥的轴(垂直于河)铺进高度图,同时记成「桥面」(能走的水面)
BRIDGE11 = [0, 0.16, 0.41, 0.72, 0.98, 1.08, 1.08, 1.02, 0.84, 0.58, 0.26, 0.03, 0]
bridge_m = np.zeros((HH, HW), bool)
for bi, (bx_, bz_, bw_) in enumerate(BRIDGES):
    # 最近的河道点和切线
    best = None
    for i in range(len(RIVER) - 1):
        ax_, az_ = RIVER[i]
        cx_, cz_ = RIVER[i + 1]
        dx_, dz_ = cx_ - ax_, cz_ - az_
        l2 = dx_ * dx_ + dz_ * dz_ or 1e-9
        t_ = max(0, min(1, ((bx_ - ax_) * dx_ + (bz_ - az_) * dz_) / l2))
        px_, pz_ = ax_ + dx_ * t_, az_ + dz_ * t_
        dd = math.hypot(bx_ - px_, bz_ - pz_)
        if best is None or dd < best[0]:
            l = math.sqrt(l2)
            best = (dd, px_, pz_, dx_ / l, dz_ / l)
    _, px_, pz_, tx_, tz_ = best
    blen = RIVER_W + (7 if bi == 0 else 5)          # 同 G3DCityV4 的桥长
    sc = blen / 11
    deck = 3.4 * sc
    nx_, nz_ = -tz_, tx_                              # 桥的轴 = 河的法线
    u = (wx - px_) * nx_ + (wz - pz_) * nz_           # 沿桥轴(-blen/2 .. blen/2)
    v = (wx - px_) * tx_ + (wz - pz_) * tz_           # 横向
    m = (np.abs(u) <= blen / 2) & (np.abs(v) <= deck / 2)
    tt = (u[m] + blen / 2) / blen * 12
    i0 = np.clip(np.floor(tt).astype(int), 0, 11)
    fr = tt - i0
    prof = np.array(BRIDGE11)
    height[m] = np.maximum(height[m], (prof[i0] * (1 - fr) + prof[i0 + 1] * fr) * sc)
    bridge_m |= m
if 'json' in OPT:
    base = OPT['json'].replace('.json', '')
    np.save(base + '_height.npy', height)
    np.save(base + '_bridge.npy', bridge_m)
    surf = np.where(water_m, 3, np.where(green_m, 2, np.where(road_m | plaza_m, 1, 0))).astype(np.uint8)
    np.save(base + '_surface.npy', surf)
    inside_wall = np.asarray(Image.fromarray((inside * 255).astype(np.uint8))) > 0
    np.save(base + '_inside.npy', inside_core)
    json.dump({'x0': X0, 'z0': Z0, 'res': HRES, 'w': HW, 'h': HH, 'surfRes': RES}, open(base + '_grid.json', 'w'))
if 'ts' in OPT:
    def hstr(a):
        q = np.clip(np.round(a * 10), 0, 255).astype(np.uint8).ravel()        # 0.1 米一档
        out, i = [], 0
        while i < len(q):                                                         # 行程编码:值,长度
            j = i
            while j < len(q) and q[j] == q[i] and j - i < 65535:
                j += 1
            out += [int(q[i]), j - i]
            i = j
        return out
    model = lambda h: ('house_b' if h['w'] >= 9 else 'house_c' if h['w'] <= 6.5 else ['house', 'house_d'][int(abs(h['x'] * 7 + h['z'] * 13)) % 2])
    data = {
        'bounds': [X0, Z0, X1, Z1], 'wall': WALL, 'gates': GATES, 'river': [[round(x, 2), round(z, 2)] for x, z in RIVER], 'riverW': RIVER_W,
        'harbor': HARBOR[1:], 'upper': UPPER, 'upperH': UPPER_H, 'stairs': [[n, list(a), list(b), w] for n, a, b, w in STAIRS],
        'ramp': [RAMP[0], list(RAMP[1]), list(RAMP[2]), RAMP[3]],
        'roads': [{'name': n, 'w': w, 'pts': [[round(v, 2) for v in p] for p in c]} for n, w, c in road_curves],
        'bridges': BRIDGES, 'plazas': [[n, list(sh)] for n, sh in PLAZAS], 'greens': [[n, list(sh)] for n, sh in GREENS],
        'pond': list(POND[1:]), 'paddock': PADDOCK[1], 'terrace': TERRACE[1],
        'keys': [list(k) for k in KEYS],
        'houses': [dict(h, model=model(h)) for h in houses],
        'trees': trees, 'avenue': avenue, 'npcs': NPCS,
        'height': {'res': HRES, 'w': HW, 'h': HH, 'rle': hstr(height)},
        # 地面类别(同一套 0.5 米格):0 碎石 / 土,1 石板街 / 广场,2 花园草地,3 水(给 3D 地面上色用)
        'surface': {'res': RES, 'w': GW, 'h': GH, 'rle': hstr((np.where(water_m, 3, np.where(green_m, 2, np.where(road_m | plaza_m, 1, 0)))).astype(np.float32) / 10)},
    }
    head = '// 自动生成:tools/proto3d/pre25/city_plan_v4.py --ts=…(主城 v4 布局;别手改)' + chr(10) + '/* eslint-disable */' + chr(10)
    open(OPT['ts'], 'w', encoding='utf-8').write(head + 'export const CITY_V4_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ' as const;' + chr(10))
    print('ts', OPT['ts'])
