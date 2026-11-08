# -*- coding: utf-8 -*-
"""主城 v4 布局生成(2026-11-08 用户选写实原型 city_r1「晴天暖石城」;主城改 NPC 城区:功能都在终端,城里只放任务 / 商店 / 活人 NPC)。

骨架取自原型 city_r1(1774×887 原型像素 → 14000×7000 世界单位);原型里房子很密、街很窄,落地时街道 / 广场放宽,
民居按街区成组摆(房子必须面朝街:贴图不许盖住身后的街道 / 广场 / NPC 站位)。
  中央罗盘广场(传送阵 + 公告板)→ 北:大教堂;西北:佣兵公会;东北:学院;东南:集市街;西南:酒馆;东:兵营 + 东门(去荒原);
  南:运河 + 两座石桥 + 南门(去林地);西:小公园。城墙沿地图边围一圈。

用法:
  python tools/qa/city_v4_gen.py preview [--scale 0.1]
  python tools/qa/city_v4_gen.py apply          写 assets/scripts/scenes/lobby/LobbyCityLayout.ts
改了布局之后要重跑:world_water_blocks.py(运河挡块)、city_ground_install.py、export_world_geometry.py --node。
"""
import json
import math
import os
import random
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources')
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_v4')
TS_OUT = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyCityLayout.ts')

MAP_W, MAP_H = 14000, 7000
PW, PH = 1774, 887
S = MAP_W / PW
EDGE = 50


def wx(px):
    return round((px - PW / 2) * S)


def wy(py):
    return round((PH / 2 - py) * S)


def P(px, py):
    return wx(px), wy(py)


def C4(name):
    return f'ui/world/city4/city4_{name}'


V3 = lambda n: f'ui/world/vil3/vil3_{n}'

# ── 骨架(原型像素)──
PLAZA_PX = (770, 455)
ROADS_PX = [
    [(0, 415), (300, 410), (560, 420), (700, 445), (770, 455)],                       # 西门大街 → 广场
    [(770, 455), (900, 470), (1100, 470), (1300, 455), (1450, 445), (1600, 470), (1774, 480)],  # 广场 → 东门
    [(770, 455), (785, 330), (790, 215)],                                             # 广场 → 大教堂
    [(770, 455), (720, 560), (650, 650), (620, 735), (590, 887)],                     # 广场 → 运河西桥 → 南门
    [(770, 455), (900, 360), (1050, 330), (1170, 345)],                               # 广场 → 学院
    [(770, 455), (680, 370), (590, 320)],                                             # 广场 → 佣兵公会
    [(900, 470), (1000, 540), (1150, 565), (1240, 640), (1250, 735)],                # 集市街 → 运河东桥
    [(300, 410), (300, 520), (420, 590)],                                             # 西街 → 酒馆
    [(1450, 445), (1520, 380), (1560, 350)],                                          # 东街 → 兵营
    [(300, 410), (230, 330)],                                                         # 西街 → 公园
]
# 空地 / 前场(原型像素 x, y, rx, ry):不放房子
AREAS_PX = [
    (770, 455, 120, 75),    # 罗盘广场
    (790, 230, 110, 45),    # 教堂前场
    (590, 325, 80, 40),     # 公会前院
    (1170, 350, 90, 40),    # 学院门前
    (1060, 560, 120, 45),   # 集市
    (420, 600, 80, 40),     # 酒馆门前
    (1560, 360, 80, 40),    # 兵营前
    (1690, 480, 70, 45),    # 东门内
    (590, 820, 70, 40),     # 南门内
    (210, 320, 120, 80),    # 公园
]
CANAL_Y_PX = 735
CANAL_BRIDGES_PX = [620, 1250]

# ── 地标(原型像素脚线, 素材, 显示宽, 挡块宽/深, 名牌)──
LANDMARKS = [
    ('cathedral', 790, 200, 2500, (2000, 360), '圣辉大教堂'),
    ('guild_hall', 560, 300, 1500, (1150, 260), '佣兵公会'),
    ('academy', 1190, 330, 1900, (1500, 300), '帝国学院'),
    ('tavern', 410, 590, 1100, (820, 220), '金麦酒馆'),
    ('barracks', 1580, 345, 1500, (1150, 240), '王都兵营'),
]
# NPC(原型像素站位, 码, 名字, 素材, 朝向):任务 / 商店 / 情报 / 活人
NPCS = [
    ('SCHOLAR', '帝国学者 · 艾德里安', 'npc_scholar', 1150, 365, -1),
    ('GUILDMASTER', '公会会长 · 维克', 'npc_guildmaster', 615, 335, 1),
    ('CAPTAIN', '卫队长 · 罗兰', 'npc_captain', 1665, 470, -1),
    ('MERCHANT', '杂货商 · 托比', 'npc_merchant', 1015, 575, 1),
    ('INNKEEPER', '酒馆老板 · 巴克', 'npc_innkeeper', 440, 612, 1),
    ('BARD', '吟游诗人 · 林恩', 'npc_bard', 705, 485, 1),
    ('FLOWER_GIRL', '卖花姑娘 · 艾米', 'npc_flower_girl', 845, 520, -1),
    ('OLD_MAN', '老镇民 · 霍克', 'npc_old_man', 240, 345, 1),
    ('CHILD', '小汤姆', 'npc_child', 190, 365, 1),
    ('VENDOR', '果摊大婶 · 玛莎', 'npc_vendor', 1105, 585, -1),
    ('GUARD_S', '城门卫兵', 'npc_guard', 630, 815, -1),
    ('GUARD_E', '城门卫兵', 'npc_guard', 1700, 520, -1),
]
BOARD_PX = (870, 480)

TALL_TREES = {'oak': (V3('tree_oak'), (480, 600)), 'pine': (V3('tree_pine'), (360, 460))}
HOUSES = {
    'house_a': (650, 820), 'house_b': (620, 760), 'house_c': (650, 820), 'house_d': (460, 560), 'house_e': (760, 900), 'house_f': (640, 780),
}
LOW = {
    'bush': (V3('bush'), (150, 210)),
    'planter': (C4('planter'), (220, 280)),
    'barrels': (C4('barrels'), (180, 230)),
    'bench': (C4('bench'), (200, 240)),
}

ZONE_COLOR = {'street': (210, 190, 150), 'side': (230, 215, 180), 'block': (170, 120, 90), 'open': (250, 238, 120),
              'park': (90, 160, 80), 'canal': (70, 120, 160), 'wall': (90, 90, 90)}

PLACEHOLDER_ASPECT = {'cathedral': 0.75, 'guild_hall': 0.7, 'academy': 0.6, 'tavern': 0.85, 'barracks': 0.55, 'gatehouse': 0.7,
                      'wall_h': 0.4, 'wall_tower': 1.6, 'wall_v': 1.6, 'house_a': 0.85, 'house_b': 0.9, 'house_c': 0.85, 'house_d': 1.4,
                      'house_e': 0.65, 'house_f': 0.85, 'stall_a': 0.85, 'stall_b': 0.85, 'notice_board': 1.3, 'fountain': 0.7,
                      'well': 1.3, 'lamp': 3.0, 'bench': 0.5, 'planter': 0.45, 'banner': 3.0, 'statue': 2.0, 'barrels': 0.8, 'hedge': 0.35,
                      'plaza': 0.62, 'canal': 0.35, 'canal_bridge': 1.3, 'boat': 0.4}
_ASPECT = {}


def load_rgba(asset):
    path = os.path.join(RES, asset + '.png')
    return Image.open(path).convert('RGBA') if os.path.exists(path) else None


def aspect(asset):
    if asset not in _ASPECT:
        im = load_rgba(asset)
        _ASPECT[asset] = im.height / im.width if im is not None else PLACEHOLDER_ASPECT.get(asset.split('city4_')[-1], 0.8)
    return _ASPECT[asset]


def blk(w, d):
    return {'w': round(w), 'd': round(d)}


def seg_dist(X, Y, lines):
    best = np.full(np.shape(X), 1e9, np.float32)
    for line in lines:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / max(1.0, dx * dx + dy * dy), 0, 1)
            best = np.minimum(best, np.hypot(X - ax - dx * t, Y - ay - dy * t))
    return best


def rect_of(asset, x, y, w):
    h = w * aspect(asset)
    return (x - w * 0.46, y, x + w * 0.46, y + h * 0.92), h


def overlap(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy


def area(r):
    return max(1.0, (r[2] - r[0]) * (r[3] - r[1]))


# ── 骨架 ──

def build_skeleton():
    roads = [[P(x, y) for x, y in line] for line in ROADS_PX]
    areas = [(wx(x), wy(y), round(rx * S), round(ry * S)) for x, y, rx, ry in AREAS_PX]
    flats, stands = [], []

    def st(name, x, y, w, block=None, flip=False, label=None, asset=None):
        it = {'asset': asset or C4(name), 'x': round(x), 'y': round(y), 'width': round(w)}
        if block:
            it['block'] = block
        if flip:
            it['flipX'] = True
        if label:
            it['label'] = label
        stands.append(it)
        return it

    px, py = P(*PLAZA_PX)
    flats.append({'asset': C4('plaza'), 'x': px, 'y': py, 'width': 1900, 'flat': True})
    for name, lx, ly, w, (bw, bd), label in LANDMARKS:
        x, y = P(lx, ly)
        st(name, x, y, w, blk(bw, bd), label=label)
    # 运河:整条横贯(两头伸出地图),两座石桥压在上面
    cy = wy(CANAL_Y_PX)
    cw = 1500
    x = -MAP_W / 2 - 400
    k = 0
    while x < MAP_W / 2 + 400:
        flats.append({'asset': C4('canal'), 'x': round(x + cw / 2), 'y': cy, 'width': cw, 'flat': True, 'water': True, 'canal': True,
                      'flipX': k % 2 == 1})
        x += cw * 0.9
        k += 1
    bridges = []
    for bx in CANAL_BRIDGES_PX:
        bridges.append({'asset': C4('canal_bridge'), 'x': wx(bx), 'y': cy + 20, 'width': 760, 'flat': True})
    for bx, flip in ((1330, False), (1440, True), (860, False)):
        flats.append({'asset': C4('boat'), 'x': wx(bx), 'y': cy - 30, 'width': 520, 'flat': True, 'flipX': flip})
    # 城墙:北墙一排(带塔),南墙一排(南门处开口放门楼),东 / 西墙竖条(东门处开口放门楼)
    top = MAP_H / 2 - 60
    bottom = -MAP_H / 2 + 40
    gate_s = wx(590)
    x = -MAP_W / 2
    i = 0
    while x < MAP_W / 2:
        st('wall_h', x + 500, top - 360, 1000, blk(1000, 120), flip=i % 2 == 1)
        if i % 3 == 1:
            st('wall_tower', x + 1000, top - 420, 460, blk(320, 140))
        x += 980
        i += 1
    x = -MAP_W / 2
    i = 0
    while x < MAP_W / 2:
        if abs(x + 500 - gate_s) < 1000:
            x += 980
            i += 1
            continue
        st('wall_h', x + 500, bottom, 1000, blk(1000, 120), flip=i % 2 == 1)
        x += 980
        i += 1
    st('gatehouse', gate_s, bottom - 10, 1300, None, label='南门')
    stands[-1]['gate'] = True
    gate_e_y = wy(480)
    for sx in (-1, 1):
        xx = sx * (MAP_W / 2 - 260)
        y = bottom + 600
        while y < top - 300:
            if sx > 0 and abs(y - gate_e_y) < 750:
                y += 820
                continue
            st('wall_v', xx, y, 520, blk(400, 700), flip=sx < 0)
            y += 820
    st('gatehouse', MAP_W / 2 - 420, gate_e_y - 120, 1100, None, label='东门')
    stands[-1]['gate'] = True
    # 广场:公告板 / 旗杆 / 雕像;集市摊位;公园喷泉 / 井
    bx, by = P(*BOARD_PX)
    board = {'key': 'board', 'label': '公告板', 'asset': C4('notice_board'), 'x': bx, 'y': by, 'width': 300,
             'footprint': {'w': 200, 'd': 50}, 'door': {'x': -70, 'y': -50}}
    for dx in (-1, 1):
        st('banner', px + dx * 1050, py + 260, 260, blk(80, 40))
        st('statue', px + dx * 820, py - 520, 340, blk(180, 80), flip=dx > 0)
    for i, (sx, sy) in enumerate(((950, 520), (1000, 530), (1085, 530), (1135, 545), (1040, 610), (1110, 620))):
        x, y = P(sx, sy)
        st('stall_a' if i % 2 == 0 else 'stall_b', x, y, 460, blk(360, 90), flip=i % 3 == 2)
    fx, fy = P(205, 320)
    st('fountain', fx, fy, 520, blk(400, 140))
    wx_, wy_ = P(1520, 600)
    st('well', wx_, wy_, 300, blk(180, 80))
    return roads, areas, flats, stands, bridges, board


def build_npcs():
    out = []
    for code, name, asset, x, y, flip in NPCS:
        out.append({'code': code, 'name': name, 'asset': f'ui/world/city4/city4_{asset}', 'x': wx(x), 'y': wy(y), 'height': 215, 'flip': flip})
    return out


def build_points():
    px, py = P(*PLAZA_PX)
    waypoint = {'x': px, 'y': py}
    spawn = {'x': px, 'y': py - 500}
    gate_s = wx(590)
    exits = [
        {'key': 'to_woods', 'label': '前往 · 村外林地', 'x': gate_s, 'y': -MAP_H // 2 + 140, 'radius': 140, 'toMap': 'WOODS',
         'toSpawn': {'x': 8250, 'y': 788}},
        {'key': 'to_gray', 'label': '前往 · 灰岩荒原', 'x': MAP_W // 2 - 140, 'y': wy(480), 'radius': 140, 'toMap': 'GRAY',
         'toSpawn': {'x': -8560, 'y': -190}},
    ]
    places = [{'name': n, 'x': wx(x), 'y': wy(y), 'icon': ic} for n, ic, x, y in [
        ('罗盘广场', 'portal', 770, 455), ('圣辉大教堂', 'place', 790, 230), ('佣兵公会', 'npc', 590, 330), ('帝国学院', 'npc', 1170, 360),
        ('集市街', 'npc', 1060, 570), ('金麦酒馆', 'npc', 420, 605), ('王都兵营', 'place', 1570, 365), ('小公园', 'place', 210, 330),
        ('南门', 'place', 590, 830), ('东门', 'place', 1730, 480)]]
    return waypoint, spawn, exits, places


# ── 栅格 / 分区 ──
CELL = 40


class Grid:
    def __init__(self):
        self.nx = MAP_W // CELL + 1
        self.ny = MAP_H // CELL + 1
        xs = (np.arange(self.nx) * CELL - MAP_W / 2 + CELL / 2).astype(np.float32)
        ys = (MAP_H / 2 - np.arange(self.ny) * CELL - CELL / 2).astype(np.float32)
        self.X, self.Y = np.meshgrid(xs, ys)
        self.zone = np.full((self.ny, self.nx), 'block', dtype=object)
        self.blocked = np.zeros((self.ny, self.nx), bool)

    def idx(self, x, y):
        ix = int((x + MAP_W / 2) // CELL)
        iy = int((MAP_H / 2 - y) // CELL)
        return min(max(iy, 0), self.ny - 1), min(max(ix, 0), self.nx - 1)


STREET_HALF = 210


def build_grid(roads, areas, flats, stands, points):
    g = Grid()
    g.d_road = seg_dist(g.X, g.Y, roads)
    z = g.zone
    z[:] = 'block'
    ell = np.zeros(z.shape, bool)
    for x, y, rx, ry in areas:
        ell |= ((g.X - x) / rx) ** 2 + ((g.Y - y) / ry) ** 2 <= 1
    park = ((g.X - wx(210)) / (150 * S)) ** 2 + ((g.Y - wy(320)) / (95 * S)) ** 2 <= 1
    z[park] = 'park'
    z[ell & ~park] = 'open'
    z[(g.d_road > STREET_HALF) & (g.d_road <= STREET_HALF + 160)] = 'side'
    z[g.d_road <= STREET_HALF] = 'street'
    cy = wy(CANAL_Y_PX)
    canal = np.abs(g.Y - cy) < 300
    z[canal] = 'canal'
    z[(np.abs(g.Y - cy) >= 300) & (np.abs(g.Y - cy) < 420)] = 'side'
    wall = (g.Y > MAP_H / 2 - 520) | (g.Y < -MAP_H / 2 + 420) | (np.abs(g.X) > MAP_W / 2 - 560)
    z[wall] = 'wall'
    g.blocked |= canal | wall
    for it in stands:
        w = it['width']
        h = w * aspect(it['asset'])
        g.blocked |= (np.abs(g.X - it['x']) < w * 0.5) & (g.Y > it['y'] - 80) & (g.Y < it['y'] + h * 0.92)
    for px, py, pr in points:
        g.blocked |= np.hypot(g.X - px, g.Y - py) <= pr
    return g


PROTECT = {'street', 'open', 'canal'}


def cover_ok(g, rect, base_y, min_road=STREET_HALF + 40):
    """贴图里脚线后方不许有街 / 广场前场 / 运河 / NPC 站位(人会被房子挡住)。"""
    x0, y0, x1, y1 = rect
    for fy in np.linspace(max(y0, base_y + 20), y1, 8):
        for fx in np.linspace(x0, x1, 8):
            if abs(fx) > MAP_W / 2 or abs(fy) > MAP_H / 2:
                continue
            i = g.idx(fx, fy)
            if g.zone[i] in PROTECT or g.d_road[i] <= min_road:
                return False
            if g.blocked[i] and g.zone[i] != 'wall':
                return False
    return True


def place_houses(g, stands, rnd):
    """民居:在 block 区按泊松撒候选点,脚线离街 ≥ 街半宽 + 60(门口贴着街),贴图不盖身后的街 / 广场;互不重叠。"""
    rects = [rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in stands]
    out = []
    iy, ix = np.where((g.zone == 'block') & ~g.blocked)
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::2], ix[::2])]
    rnd.shuffle(cand)
    # 优先离街近的点(面朝街),再填里面
    cand.sort(key=lambda p: abs(float(seg_dist(np.array(p[0]), np.array(p[1]), ROAD_WORLD)) - (STREET_HALF + 260)))
    names = list(HOUSES)
    for (x, y) in cand:
        d = float(seg_dist(np.array(x), np.array(y), ROAD_WORLD))
        if d < STREET_HALF + 80:
            continue
        name = names[rnd.randrange(len(names))]
        lo, hi = HOUSES[name]
        w = rnd.uniform(lo, hi)
        asset = C4(name)
        rect, h = rect_of(asset, x, y, w)
        if any(overlap(rect, r) > 0.03 * min(area(rect), area(r)) for r in rects):
            continue
        if not cover_ok(g, rect, y):
            continue
        it = {'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'block': blk(w * 0.82, min(h * 0.45, 220)), 'house': True}
        if rnd.random() < 0.5:
            it['flipX'] = True
        out.append(it)
        rects.append(rect)
    return out


def place_greenery(g, stands, rnd):
    """公园成片树 + 街区里的零星庭院树 / 运河边树;矮物:灌木、花箱、木桶、长椅。"""
    rects = [rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in stands]
    tall, low = [], []

    def try_tree(x, y, kind):
        asset, (lo, hi) = TALL_TREES[kind]
        w = rnd.uniform(lo, hi)
        rect, h = rect_of(asset, x, y, w)
        if any(overlap(rect, r) > 0.06 * min(area(rect), area(r)) for r in rects):
            return False
        if not cover_ok(g, rect, y, STREET_HALF + 20):
            return False
        tall.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'kind': 'tree', 'flipX': rnd.random() < 0.5})
        rects.append(rect)
        return True

    for zone, n, kinds in (('park', 60, ['oak', 'oak', 'pine']), ('block', 260, ['oak', 'pine']), ('side', 80, ['oak'])):
        iy, ix = np.where((g.zone == zone) & ~g.blocked)
        for _ in range(n * 6):
            if not len(iy):
                break
            k = rnd.randrange(len(iy))
            x, y = float(g.X[iy[k], ix[k]]), float(g.Y[iy[k], ix[k]])
            if zone == 'park' and math.hypot(x - wx(205), (y - wy(320)) / 0.7) < 700:
                continue  # 喷泉周围留空
            if try_tree(x, y, kinds[rnd.randrange(len(kinds))]):
                n -= 1
                if n <= 0:
                    break

    def try_low(name, x, y, scale=1.0):
        asset, (lo, hi) = LOW[name]
        w = rnd.uniform(lo, hi) * scale
        rect, _ = rect_of(asset, x, y, w)
        if any(overlap(rect, r) > 0.05 * min(area(rect), area(r)) for r in rects):
            return False
        i = g.idx(x, y)
        if g.blocked[i] or g.zone[i] in ('street', 'canal'):
            return False
        low.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'flipX': rnd.random() < 0.5})
        rects.append(rect)
        return True

    # 房子门前:花箱 / 木桶;树下:灌木
    for s in stands:
        if s.get('house') and rnd.random() < 0.55:
            try_low(rnd.choice(['planter', 'barrels', 'planter']), s['x'] + rnd.uniform(-0.3, 0.3) * s['width'], s['y'] - 70)
    for t in list(tall):
        if rnd.random() < 0.5:
            try_low('bush', t['x'] + rnd.uniform(-0.2, 0.2) * t['width'], t['y'] - 50)
    # 广场 / 公园长椅
    px, py = P(*PLAZA_PX)
    for a in (200, 340):
        for sgn in (-1, 1):
            try_low('bench', px + sgn * 1150, py - 260 + (a - 200) * 3)
    for _ in range(8):
        try_low('bench', wx(210) + rnd.uniform(-900, 900), wy(320) + rnd.uniform(-500, 500))
    return tall, low


def lamps_along(roads, g, rnd):
    out = []
    for line in roads[:3] + roads[3:5]:
        acc = 0.0
        side = 1
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            seg = math.hypot(bx - ax, by - ay)
            nx, ny = -(by - ay) / max(1, seg), (bx - ax) / max(1, seg)
            t = 300.0
            while t < seg:
                x = ax + (bx - ax) * t / seg + nx * side * (STREET_HALF + 70)
                y = ay + (by - ay) * t / seg + ny * side * (STREET_HALF + 70)
                i = g.idx(x, y)
                if not g.blocked[i] and g.zone[i] not in ('canal', 'wall') and all(math.hypot(x - o['x'], y - o['y']) > 600 for o in out):
                    out.append({'x': round(x), 'y': round(y)})
                side = -side
                t += 1100
            acc += seg
    return out


ROAD_WORLD = [[P(x, y) for x, y in line] for line in ROADS_PX]


# ── GPT 原型手摆(11-08 用户「装饰摆放还是不够好,让 GPT 出原型图,然后照着摆放」)──
# tools/qa/deco_proto.py 出原型 → 逐件读位置写 tools/qa/deco_hand/city_<区块>.json([件号, 原型像素 x, y, 宽倍率?]);
# 该区块里的随机民居 / 树 / 小件全部换成原型里的。件号同 deco_proto.DECO['city']。
HAND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deco_hand')


def apply_hand_deco(stands, tall, low, seed):
    import deco_proto as DP
    if not os.path.isdir(HAND_DIR):
        return stands, tall, low
    table = {code: (asset, w) for code, asset, w, _ in DP.DECO['city']}
    rnd = random.Random(seed + 505)
    for name in sorted(os.listdir(HAND_DIR)):
        if not name.startswith('city_') or not name.endswith('.json'):
            continue
        hand = json.load(open(os.path.join(HAND_DIR, name), encoding='utf-8'))
        x0, y0, x1, y1 = DP.REGIONS['city'][hand['region']]
        inside = lambda it: x0 <= it['x'] <= x1 and y0 <= it['y'] <= y1
        stands = [st for st in stands if not (st.get('house') and inside(st))]
        tall = [t for t in tall if not inside(t)]
        low = [t for t in low if not inside(t)]
        pw, ph = hand['protoSize']
        for row in hand['items']:
            code, px, py = row[:3]
            k = row[3] if len(row) > 3 else 1.0
            asset, w = table[code]
            w = round(w * k * rnd.uniform(0.95, 1.05))
            x = round(x0 + px / pw * (x1 - x0))
            y = round(y1 - py / ph * (y1 - y0))
            flip = rnd.random() < 0.5
            if code in 'ABCDEF':
                h = w * aspect(asset)
                stands.append({'asset': asset, 'x': x, 'y': y, 'width': w, 'block': blk(w * 0.82, min(h * 0.45, 220)), 'house': True,
                               'flipX': flip, 'hand': True})
            elif code in 'GH':
                tall.append({'asset': asset, 'x': x, 'y': y, 'width': w, 'kind': 'tree', 'flipX': flip, 'hand': True})
            else:
                low.append({'asset': asset, 'x': x, 'y': y, 'width': w, 'flipX': flip, 'hand': True})
    return stands, tall, low


def generate(seed=11):
    rnd = random.Random(seed)
    roads, areas, flats, stands, bridges, board = build_skeleton()
    npcs = build_npcs()
    waypoint, spawn, exits, places = build_points()
    points = [(n['x'], n['y'], 320) for n in npcs] + [(e['x'], e['y'], 360) for e in exits] + \
        [(waypoint['x'], waypoint['y'], 600), (spawn['x'], spawn['y'], 300), (board['x'], board['y'], 260)]
    g = build_grid(roads, areas, flats, stands + [board], points)
    houses = place_houses(g, stands + [board], rnd)
    stands = stands + houses
    g = build_grid(roads, areas, flats, stands + [board], points)
    tall, low = place_greenery(g, stands + [board], rnd)
    lamps = lamps_along(roads, g, rnd)
    stands, tall, low = apply_hand_deco(stands, tall, low, seed)
    return {'roads': roads, 'areas': areas, 'flats': flats, 'bridges': bridges, 'stands': stands, 'board': board, 'npcs': npcs,
            'waypoint': waypoint, 'spawn': spawn, 'exits': exits, 'places': places, 'tall': tall, 'low': low, 'lamps': lamps}, g


# ── 预览 ──
_IMG = {}


def img(asset):
    if asset not in _IMG:
        _IMG[asset] = load_rgba(asset)
    return _IMG[asset]


def splat_ground(Wp, Hp):
    d = os.path.join(RES, 'ui', 'world', 'city4')
    if not os.path.exists(os.path.join(d, 'ground_splat.jpg')):
        return None
    m1 = np.asarray(Image.open(os.path.join(d, 'ground_splat.jpg')).convert('RGB').resize((Wp, Hp), Image.BILINEAR)).astype(np.float32) / 255
    m2 = np.asarray(Image.open(os.path.join(d, 'ground_splat2.jpg')).convert('RGB').resize((Wp, Hp), Image.BILINEAR)).astype(np.float32) / 255
    T = {}
    for name, tw in TILES.items():
        px = max(8, int(tw * Wp / MAP_W))
        t = Image.open(os.path.join(d, name + '.jpg')).convert('RGB').resize((px, px), Image.LANCZOS)
        T[name] = np.tile(np.asarray(t).astype(np.float32) / 255, (Hp // px + 2, Wp // px + 2, 1))[:Hp, :Wp]
    sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
    base = T['tex_cobble']
    base = base + (T['tex_cobble_moss'] - base) * sm(0.24, 0.6, m1[..., 0])[..., None]
    base = base + (T['tex_grass'] - base) * (m1[..., 1] * 0.7)[..., None]
    base = base + (T['tex_flagstone'] * np.array([1.12, 1.02, 0.86]) - base) * (np.clip(m2[..., 0] * 1.3 - 0.15, 0, 1) * 0.85)[..., None]
    base = base + (T['tex_street'] * 0.9 - base) * m2[..., 1][..., None]
    dist = m1[..., 2] * 512
    base = base + (T['tex_street'] - base) * (1 - sm(150, 240, dist))[..., None]
    base *= (0.9 + 0.18 * m1[..., 0])[..., None]
    return Image.fromarray((base.clip(0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')


TILES = {'tex_cobble': 300, 'tex_cobble_moss': 520, 'tex_grass': 420, 'tex_street': 340, 'tex_flagstone': 460}


def render_preview(L, g, scale=0.1, zones=False, marks=True):
    Wp, Hp = int(MAP_W * scale), int(MAP_H * scale)
    canvas = splat_ground(Wp, Hp) or Image.new('RGBA', (Wp, Hp), (176, 160, 130, 255))
    dr = ImageDraw.Draw(canvas)
    Q = lambda x, y: ((x + MAP_W / 2) * scale, (MAP_H / 2 - y) * scale)
    if not os.path.exists(os.path.join(RES, 'ui', 'world', 'city4', 'ground_splat.jpg')):
        for line in L['roads']:
            dr.line([Q(x, y) for x, y in line], fill=(214, 200, 168, 255), width=max(2, int(STREET_HALF * 2 * scale)))

    def paste(it, center, h_override=None):
        im = img(it['asset'])
        w = it['width']
        h = h_override or w * aspect(it['asset'])
        px, py = Q(it['x'], it['y'])
        if im is None:
            box = (px - w * scale / 2, py - (h * scale / 2 if center else h * scale), px + w * scale / 2, py + (h * scale / 2 if center else 0))
            dr.rectangle(box, outline=(60, 50, 40, 255), fill=(70, 120, 160, 140) if it.get('water') else None, width=1)
            return
        iw, ih = max(1, int(w * scale)), max(1, int(h * scale))
        im = im.resize((iw, ih), Image.LANCZOS)
        if it.get('flipX'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        pos = (int(px - iw / 2), int(py - ih / 2)) if center else (int(px - iw / 2), int(py - ih))
        canvas.paste(im, pos, im) if pos[0] < 0 or pos[1] < 0 else canvas.alpha_composite(im, pos)

    for f in L['flats'] + L['bridges']:
        paste(f, True)
    lamp_items = [{'asset': C4('lamp'), 'x': l['x'], 'y': l['y'], 'width': 120} for l in L['lamps']]
    npc_items = [{'asset': n['asset'], 'x': n['x'], 'y': n['y'], 'width': 215 / max(0.1, aspect(n['asset'])), 'flipX': n['flip'] < 0} for n in L['npcs']]
    for it in sorted(L['stands'] + [L['board']] + L['tall'] + L['low'] + lamp_items + npc_items, key=lambda t: -t['y']):
        paste(it, False)
    if not marks:
        return canvas
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 12)
    for n in L['npcs']:
        px, py = Q(n['x'], n['y'])
        dr.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 220, 90, 255))
        dr.text((px + 5, py - 7), n['name'].split(' · ')[-1], font=font, fill=(255, 240, 160, 255))
    for e in L['exits'] + [L['waypoint']]:
        px, py = Q(e['x'], e['y'])
        dr.ellipse([px - 6, py - 6, px + 6, py + 6], outline=(120, 160, 255, 255), width=2)
    if zones:
        zr = np.zeros((g.ny, g.nx, 4), np.uint8)
        for name, col in ZONE_COLOR.items():
            m = g.zone == name
            zr[m, :3] = col
            zr[m, 3] = 110
        canvas.alpha_composite(Image.fromarray(zr, 'RGBA').resize(canvas.size, Image.NEAREST))
    return canvas


# ── 导出 TS ──

def short(asset):
    assert asset.startswith('ui/world/'), asset
    return asset[len('ui/world/'):]


def export_ts(L):
    J = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))

    def obj(it):
        d = {'asset': short(it['asset']), 'x': it['x'], 'y': it['y'], 'width': it['width']}
        for k in ('flat', 'water', 'flipX'):
            if it.get(k):
                d[k] = True
        if it.get('block'):
            d['block'] = it['block']
        return d

    def tree_row(t):
        o = obj(t)
        o['block'] = {'w': round(t['width'] * 0.2), 'd': 50}
        return o

    board = dict(L['board'])
    board['asset'] = short(board['asset'])
    lines = [
        '/**',
        ' * 主城 v4 布局(2026-11-08 用户选写实原型 city_r1「晴天暖石城」;主城改 NPC 城区,功能都在终端)。',
        ' * 本文件由 tools/qa/city_v4_gen.py apply 生成,别手改:改布局改生成器再重跑(之后还要重跑 world_water_blocks.py /',
        ' * city_ground_install.py / export_world_geometry.py --node)。素材 = ui/world 下的相对路径。',
        ' */',
        '/* eslint-disable */',
        f'export const CITY_V4_SIZE = {J({"width": MAP_W, "height": MAP_H})};',
        f'export const CITY_V4_ROADS: number[][][] = {J([[list(p) for p in line] for line in L["roads"]])};',
        f'export const CITY_V4_AREAS: number[][] = {J([list(a) for a in L["areas"]])};',
        f'export const CITY_V4_FLATS: Array<{{ asset: string; x: number; y: number; width: number; flat?: boolean; water?: boolean; flipX?: boolean }}> = {J([obj(f) for f in L["flats"] + L["bridges"]])};',
        f'export const CITY_V4_STANDS: Array<{{ asset: string; x: number; y: number; width: number; flipX?: boolean; block?: {{ w: number; d: number }} }}> = {J([obj(s) for s in sorted(L["stands"] + L["tall"], key=lambda t: -t["y"])])};',
        f'export const CITY_V4_LOW: Array<{{ asset: string; x: number; y: number; width: number; flipX?: boolean }}> = {J([obj(s) for s in sorted(L["low"], key=lambda t: -t["y"])])};',
        f'export const CITY_V4_BOARD = {J(board)};',
        f'export const CITY_V4_NPCS = {J([{**n, "asset": short(n["asset"])} for n in L["npcs"]])};',
        f'export const CITY_V4_LAMPS = {J(L["lamps"])};',
        f'export const CITY_V4_WAYPOINT = {J(L["waypoint"])};',
        f'export const CITY_V4_SPAWN = {J(L["spawn"])};',
        f'export const CITY_V4_EXITS = {J(L["exits"])};',
        f'export const CITY_V4_PLACES = {J(L["places"])};',
        '',
    ]
    # 树挡块(树干)写进 STANDS 行:tree_row
    lines[10] = f'export const CITY_V4_STANDS: Array<{{ asset: string; x: number; y: number; width: number; flipX?: boolean; block?: {{ w: number; d: number }} }}> = {J([tree_row(s) if s.get("kind") == "tree" else obj(s) for s in sorted(L["stands"] + L["tall"], key=lambda t: -t["y"])])};'
    with open(TS_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    return TS_OUT


def stats(L):
    return {'houses': sum(1 for s in L['stands'] if s.get('house')), 'stands': len(L['stands']), 'trees': len(L['tall']), 'low': len(L['low']),
            'lamps': len(L['lamps']), 'npcs': len(L['npcs'])}


def main():
    os.makedirs(OUT, exist_ok=True)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    L, g = generate()
    print(json.dumps(stats(L), ensure_ascii=False))
    if cmd == 'apply':
        print(export_ts(L))
        return
    scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0.1
    render_preview(L, g, scale).convert('RGB').save(os.path.join(OUT, 'preview.png'))
    render_preview(L, g, scale, zones=True).convert('RGB').save(os.path.join(OUT, 'preview_zones.png'))
    print(os.path.join(OUT, 'preview.png'))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
