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
# 11-09 用户「两边城墙都重叠了,不好看,主城重新设计」→ 选 P1 广场大道原型(周报截图/2026-11-09_地图画风原型/city_p1.png):
# 罗盘广场居中;大道北通大教堂(两侧柏树 + 花坛),西北佣兵公会、东北帝国学院;西街酒馆 → 西南公园池塘;东街集市 → 兵营 → 东门;
# 南面运河两座桥(主桥 + 码头桥),河南岸草坡和南门;城墙只在北边一道(两端各一座塔),东西两侧是树林草坡,不再有竖向城墙
PLAZA_PX = (886, 445)
ROADS_PX = [
    [(886, 445), (886, 270)],                                                         # 广场 → 大教堂(大道)
    [(886, 445), (1000, 455), (1300, 460), (1500, 448), (1640, 445), (1774, 445)],    # 广场 → 集市街 → 东门
    [(886, 445), (700, 452), (450, 455), (220, 450), (60, 445)],                      # 广场 → 西街(酒馆)
    [(886, 445), (886, 705), (886, 887)],                                             # 广场 → 运河主桥 → 南门
    [(820, 405), (640, 318)],                                                         # → 佣兵公会
    [(955, 405), (1130, 318)],                                                        # → 帝国学院
    [(470, 455), (430, 560), (330, 600)],                                             # 西街 → 公园
    [(1300, 460), (1330, 580), (1345, 705), (1300, 790), (1150, 840)],                # 集市 → 码头桥 → 河南岸小路
    [(300, 450), (300, 120)],                                                         # 西北巷
    [(1480, 448), (1480, 130)],                                                       # 东北巷
]
# 空地 / 前场(原型像素 x, y, rx, ry):不放房子
AREAS_PX = [
    (886, 445, 140, 80),    # 罗盘广场
    (886, 265, 95, 30),     # 大教堂台阶前
    (505, 312, 75, 30),     # 公会门前
    (1250, 318, 85, 30),    # 学院门前
    (1185, 498, 150, 48),   # 集市
    (430, 500, 75, 30),     # 酒馆门前(露天座)
    (1585, 460, 70, 38),    # 东门内
    (886, 790, 80, 45),     # 南门内(河南岸)
    (305, 640, 150, 70),    # 公园池塘
    (1500, 665, 90, 30),    # 码头
]
CANAL_Y_PX = 705
CANAL_BRIDGES_PX = [886, 1345]
# 民居街区(原型像素矩形):房子只摆在这些块里(其余是广场 / 地标 / 公园 / 城外草坡)
BLOCK_RECTS_PX = [(120, 95, 700, 425), (1060, 75, 1700, 300), (1400, 300, 1560, 425), (500, 480, 860, 655), (960, 540, 1300, 655),
                  (1380, 470, 1560, 560)]

# ── 地标(原型像素脚线, 素材, 显示宽, 挡块宽/深, 名牌)──
LANDMARKS = [
    ('cathedral', 886, 240, 1720, (1500, 330), '圣辉大教堂'),  # 11-09 伐木村画风版带钟楼更高(宽高比 1.1),缩宽防止塔顶出地图上沿
    ('guild_hall', 505, 296, 1800, (1400, 280), '佣兵公会'),
    ('academy', 1250, 302, 2350, (1850, 300), '帝国学院'),
    ('tavern', 430, 486, 1100, (820, 220), '金麦酒馆'),
    ('barracks', 1390, 424, 1900, (1500, 250), '王都兵营'),
]
# NPC(原型像素站位, 码, 名字, 素材, 朝向):任务 / 商店 / 情报 / 活人
NPCS = [
    ('SCHOLAR', '帝国学者 · 艾德里安', 'npc_scholar', 1205, 332, 1),
    ('GUILDMASTER', '公会会长 · 维克', 'npc_guildmaster', 560, 325, -1),
    ('CAPTAIN', '卫队长 · 罗兰', 'npc_captain', 1560, 470, 1),
    ('MERCHANT', '杂货商 · 托比', 'npc_merchant', 1120, 520, 1),
    ('INNKEEPER', '酒馆老板 · 巴克', 'npc_innkeeper', 470, 505, 1),
    ('BARD', '吟游诗人 · 林恩', 'npc_bard', 800, 478, 1),
    ('FLOWER_GIRL', '卖花姑娘 · 艾米', 'npc_flower_girl', 965, 480, -1),
    ('OLD_MAN', '老镇民 · 霍克', 'npc_old_man', 220, 600, 1),
    ('CHILD', '小汤姆', 'npc_child', 250, 615, 1),
    ('VENDOR', '果摊大婶 · 玛莎', 'npc_vendor', 1255, 525, -1),
    ('GUARD_S', '城门卫兵', 'npc_guard', 830, 815, 1),
    ('GUARD_E', '城门卫兵', 'npc_guard', 1615, 482, -1),
]
BOARD_PX = (978, 418)

TALL_TREES = {'oak': (C4('tree_oak'), (480, 600)), 'pine': (C4('tree_pine'), (360, 460))}  # 11-09 换手绘树
# 11-09 A 手绘风:民居约 4~5 人高(人约 230 世界单位高),沿街成排
HOUSES = {  # 11-09 P1:按原型民居尺度(约 3 人高),街区才排得下成片的房子
    'house_a': (640, 760), 'house_b': (620, 740), 'house_c': (640, 760), 'house_d': (520, 620), 'house_e': (700, 820), 'house_f': (640, 760),
}
LOW = {
    'bush': (C4('bush'), (150, 210)),
    'planter': (C4('planter'), (220, 280)),
    'barrels': (C4('barrels'), (180, 230)),
    'bench': (C4('bench'), (200, 240)),
}

ZONE_COLOR = {'street': (210, 190, 150), 'side': (230, 215, 180), 'block': (170, 120, 90), 'open': (250, 238, 120), 'nature': (120, 170, 90),
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
        bridges.append({'asset': C4('canal_bridge'), 'x': wx(bx), 'y': cy + 20, 'width': 560, 'flat': True})  # 11-09 短桥(长约 1.5 倍宽)刚好跨过运河
    for bx, flip in ((1250, False), (1460, True), (560, False)):
        flats.append({'asset': C4('boat'), 'x': wx(bx), 'y': cy - 30, 'width': 520, 'flat': True, 'flipX': flip})
    # 城墙:只在北边一道(大教堂身后),两端各一座圆塔;东西两侧不砌墙(11-09 用户:两边竖墙重叠难看),用树林草坡收边
    top = MAP_H / 2 - 60
    x0, x1 = wx(150), wx(1650)
    x = x0
    i = 0
    while x < x1:
        st('wall_h', x + 500, top - 330, 1000, blk(1000, 120), flip=i % 2 == 1)
        x += 960
        i += 1
    st('wall_tower', x0 - 80, top - 380, 520, blk(360, 150))
    st('wall_tower', x1 + 80, top - 380, 520, blk(360, 150), flip=True)
    # 南门:河南岸大道尽头;东门:东街尽头贴地图边
    gate_s = wx(886)
    bottom = -MAP_H / 2 + 40
    st('gatehouse', gate_s, bottom - 10, 1300, None, label='南门')
    stands[-1]['gate'] = True
    for sx in (-1, 1):
        st('wall_h', gate_s + sx * 1150, bottom + 40, 1000, blk(1000, 120), flip=sx > 0)
    gate_e_y = wy(445)
    st('gatehouse', MAP_W / 2 - 520, gate_e_y - 120, 1200, None, label='东门')
    stands[-1]['gate'] = True
    # 广场:公告板 / 喷泉;大道两侧旗杆 + 柏树 + 花坛;集市摊位;公园池塘 + 骑士像 + 长椅;码头栈桥
    bx, by = P(*BOARD_PX)
    board = {'key': 'board', 'label': '公告板', 'asset': C4('notice_board'), 'x': bx, 'y': by, 'width': 300,
             'footprint': {'w': 200, 'd': 50}, 'door': {'x': -70, 'y': -50}}
    fx, fy = P(765, 385)
    st('fountain', fx, fy, 560, blk(420, 140))
    for sx in (-1, 1):
        ax_, ay_ = P(886 + sx * 62, 300)
        st('banner', ax_, ay_, 230, blk(70, 40), flip=sx > 0)
        for k, cy_ in enumerate((215, 250, 285)):
            cx_, cyy = P(886 + sx * (105 + k * 8), cy_)
            st('cypress', cx_, cyy, 210, blk(70, 40), flip=k % 2 == 1)
        # 11-09 实机:6 个花箱围着罗盘又大又挤、红花跳色 → 只留大道口一对,缩到 320
        bx_, by_ = P(886 + sx * 95, 330)
        st('flower_bed', bx_, by_, 320, blk(290, 60), flip=sx > 0)
    for i, (sx_, sy_) in enumerate(((1090, 478), (1150, 470), (1215, 472), (1270, 480), (1120, 530), (1200, 528))):
        x, y = P(sx_, sy_)
        st('stall_a' if i % 2 == 0 else 'stall_b', x, y, 460, blk(360, 90), flip=i % 3 == 2)
    # 11-09 实机:池塘石边压到运河上 → 缩小北挪,雕像跟着北移
    pdx, pdy = P(305, 628)
    flats.append({'asset': C4('pond'), 'x': pdx, 'y': pdy, 'width': 1400, 'flat': True, 'water': True})
    sx_, sy_ = P(318, 570)
    st('statue', sx_, sy_, 200, blk(120, 60))
    for (bx_, by_, f) in ((285, 565, False), (395, 632, True), (215, 690, False)):
        x, y = P(bx_, by_)
        st('bench', x, y, 230, blk(180, 40), flip=f)
    for (dx_, f) in ((1460, False), (1580, True)):
        x, y = P(dx_, 680)
        flats.append({'asset': C4('pier'), 'x': x, 'y': y, 'width': 900, 'flat': True, 'flipX': f})
    for (rx_, ry_, w) in ((60, 840, 900), (190, 870, 760), (1560, 810, 900), (1700, 760, 820), (1730, 250, 700), (1740, 520, 640),
                          (40, 200, 640)):
        x, y = P(rx_, ry_)
        st('rocks', x, y, w, blk(w * 0.7, 120), flip=rx_ > 900)
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
    gate_s = wx(886)
    exits = [
        {'key': 'to_woods', 'label': '前往 · 村外林地', 'x': gate_s, 'y': -MAP_H // 2 + 140, 'radius': 140, 'toMap': 'WOODS',
         'toSpawn': {'x': 8250, 'y': 788}},
        {'key': 'to_gray', 'label': '前往 · 灰岩荒原', 'x': MAP_W // 2 - 140, 'y': wy(445), 'radius': 140, 'toMap': 'GRAY',
         'toSpawn': {'x': -8560, 'y': -190}},
    ]
    places = [{'name': n, 'x': wx(x), 'y': wy(y), 'icon': ic} for n, ic, x, y in [
        ('罗盘广场', 'portal', 886, 445), ('圣辉大教堂', 'place', 886, 265), ('佣兵公会', 'npc', 505, 315), ('帝国学院', 'npc', 1250, 320),
        ('集市街', 'npc', 1185, 500), ('金麦酒馆', 'npc', 430, 500), ('王都兵营', 'place', 1390, 440), ('公园', 'place', 305, 620),
        ('码头', 'place', 1500, 665), ('南门', 'place', 886, 820), ('东门', 'place', 1640, 445)]]
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
        self.zone = np.full((self.ny, self.nx), 'nature', dtype=object)
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
    z[:] = 'nature'
    for x0, y0, x1, y1 in BLOCK_RECTS_PX:
        z[(g.X >= wx(x0)) & (g.X <= wx(x1)) & (g.Y <= wy(y0)) & (g.Y >= wy(y1))] = 'block'
    ell = np.zeros(z.shape, bool)
    for x, y, rx, ry in areas:
        ell |= ((g.X - x) / rx) ** 2 + ((g.Y - y) / ry) ** 2 <= 1
    park = ((g.X - wx(305)) / (190 * S)) ** 2 + ((g.Y - wy(640)) / (95 * S)) ** 2 <= 1
    z[park] = 'park'
    z[ell & ~park] = 'open'
    z[(g.d_road > STREET_HALF) & (g.d_road <= STREET_HALF + 160)] = 'side'
    z[g.d_road <= STREET_HALF] = 'street'
    cy = wy(CANAL_Y_PX)
    canal = np.abs(g.Y - cy) < 300
    z[canal] = 'canal'
    z[(np.abs(g.Y - cy) >= 300) & (np.abs(g.Y - cy) < 420)] = 'side'
    wall = g.Y > MAP_H / 2 - 520
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


REJ = {}


def nearest_road(x, y):
    """离 (x, y) 最近的街道点与该段方向。"""
    best = None
    for line in ROAD_WORLD:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            L2 = max(1.0, dx * dx + dy * dy)
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
            px, py = ax + dx * t, ay + dy * t
            d = math.hypot(x - px, y - py)
            if best is None or d < best[0]:
                L = math.sqrt(L2)
                best = (d, px, py, dx / L, dy / L)
    return best


def place_houses(g, stands, rnd):
    """民居(11-09 用户「摆件乱糟糟没有规律,重叠度高」):候选点同原来(block 区泊松、近街优先),
    但离街近的(≤ 900)按最近一段街「对齐成排」——脚线落到离街中线固定距离的那条平行线上,门朝街;
    陡的街段(接近竖直)不排,只用横向的;互不重叠(阈值 2%),不盖身后的街 / 广场。"""
    rects = [rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in stands]
    out = []
    iy, ix = np.where((g.zone == 'block') & ~g.blocked)
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::2], ix[::2])]
    rnd.shuffle(cand)
    cand.sort(key=lambda p: abs(float(seg_dist(np.array(p[0]), np.array(p[1]), ROAD_WORLD)) - (STREET_HALF + 260)))
    names = list(HOUSES)
    for (x, y) in cand:
        d, px, py, tx, ty = nearest_road(x, y)
        if d < STREET_HALF + 40:
            REJ['near'] = REJ.get('near', 0) + 1
            continue
        name = names[rnd.randrange(len(names))]
        lo, hi = HOUSES[name]
        w = rnd.uniform(lo, hi)
        asset = C4(name)
        if d <= 520 and abs(tx) > 0.8:
            # 对齐成排:街北侧脚线 = 街中线 + 街半宽 + 60;街南侧往下推一个屋高的大半(屋顶不盖街)
            road_y = py + (x - px) * (ty / tx)
            if y > road_y:
                y = road_y + STREET_HALF + 60
            else:
                y = road_y - STREET_HALF - 60 - w * aspect(asset) * 0.6
        rect, h = rect_of(asset, x, y, w)
        if any(overlap(rect, r) > 0.02 * min(area(rect), area(r)) for r in rects):
            REJ['overlap'] = REJ.get('overlap', 0) + 1
            continue
        if not cover_ok(g, rect, y):
            REJ['cover'] = REJ.get('cover', 0) + 1
            continue
        i_ = g.idx(x, y)
        if g.zone[i_] in ('street', 'canal', 'wall', 'open') or g.blocked[i_]:
            REJ['zone'] = REJ.get('zone', 0) + 1
            continue
        out.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'block': blk(w * 0.82, min(h * 0.45, 260)), 'house': True})
        rects.append(rect)
    return out


P1_HOUSES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deco_hand', 'city_p1_houses.json')


def hand_houses(stands, rnd):
    """11-09 主城 P1:民居按原型逐栋量的位置摆(deco_hand/city_p1_houses.json),不再随机撒。
    原型屋宽 px × S × 1.1 = 显示宽;窄屋(< 55 px)用窄高的 house_d,连排(> 100 px)用双联 house_e,其余在 a / b / c / f 里轮换;
    和地标重叠过 8% 的跳过(地标位置以生成器为准)。"""
    data = json.load(open(P1_HOUSES, encoding='utf-8'))
    rects = [rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in stands]
    normal = ['house_a', 'house_b', 'house_c', 'house_f']
    out = []
    for k, (px, py, pw) in enumerate(data['houses']):
        name = 'house_d' if pw < 55 else 'house_e' if pw > 100 else normal[k % len(normal)]
        w = round(pw * S * 1.1)
        asset = C4(name)
        x, y = wx(px), wy(py)
        rect, h = rect_of(asset, x, y, w)
        if any(overlap(rect, r) > 0.08 * min(area(rect), area(r)) for r in rects):
            REJ['hand_landmark'] = REJ.get('hand_landmark', 0) + 1
            continue
        # 民居之间:前后排贴图互相遮一截是正常的纵深;只拦脚点几乎重合的(同一排挤在一起)
        if any(abs(x - o['x']) < (w + o['width']) * 0.42 and abs(y - o['y']) < 160 for o in out):
            REJ['hand_crowd'] = REJ.get('hand_crowd', 0) + 1
            continue
        it = {'asset': asset, 'x': x, 'y': y, 'width': w, 'block': blk(w * 0.82, min(h * 0.45, 240)), 'house': True}
        if k % 3 == 1:
            it['flipX'] = True
        out.append(it)
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

    for zone, n, kinds in (('park', 14, ['oak', 'oak', 'pine']), ('nature', 90, ['oak', 'oak', 'pine']), ('block', 40, ['oak', 'pine'])):
        iy, ix = np.where((g.zone == zone) & ~g.blocked)
        for _ in range(n * 6):
            if not len(iy):
                break
            k = rnd.randrange(len(iy))
            x, y = float(g.X[iy[k], ix[k]]), float(g.Y[iy[k], ix[k]])
            if zone == 'park' and math.hypot(x - wx(305), (y - wy(650)) / 0.7) < 900:
                continue  # 池塘周围留空
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

    # 房前贴墙根:屋角一组木桶 / 门旁一张长椅(脚线就在墙根下 30,画在房子前面像靠着墙)
    for s in stands:
        if not s.get('house'):
            continue
        roll = rnd.random()
        corner = s['x'] + (1 if rnd.random() < 0.5 else -1) * s['width'] * 0.36
        if roll < 0.45:
            try_low('barrels', corner, s['y'] - 30, 0.9)
        elif roll < 0.7:
            try_low('bench', s['x'] + rnd.uniform(-0.15, 0.15) * s['width'], s['y'] - 30, 0.9)
    for t in list(tall):
        if rnd.random() < 0.5:
            try_low('bush', t['x'] + rnd.uniform(-0.2, 0.2) * t['width'], t['y'] - 50)
    # 广场边长椅(两侧各一张,朝广场)
    px, py = P(*PLAZA_PX)
    for sgn in (-1, 1):
        try_low('bench', px + sgn * 1250, py - 420)
    # 城外草坡:灌木丛点缀
    iy, ix = np.where((g.zone == 'nature') & ~g.blocked)
    for _ in range(60):
        if not len(iy):
            break
        k = rnd.randrange(len(iy))
        try_low('bush', float(g.X[iy[k], ix[k]]), float(g.Y[iy[k], ix[k]]))
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
    houses = hand_houses(stands + [board], rnd) if os.path.exists(P1_HOUSES) else place_houses(g, stands + [board], rnd)
    stands = stands + houses
    g = build_grid(roads, areas, flats, stands + [board], points)
    tall, low = place_greenery(g, stands + [board], rnd)
    lamps = lamps_along(roads, g, rnd)
    # 11-09:主城不再套 GPT 原型手摆组(树篱横穿房子 / 花箱悬空就出在这里),全部按街道规则摆
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
