# -*- coding: utf-8 -*-
"""村外林地 v4 布局生成(2026-11-08 用户:「镜头拉远一些,地图更大一些,怪物更密集一些;人物在树后面看不到;
装饰物之间不要重叠,要合理摆放,什么区域该放什么」)。

在 v3 原型骨架(woods_def_gen.py:原型 woods_overview 1808×870 像素)上:
- 地图整体放大 MAP_SCALE(路网 / 空地 / 地标 / 怪群 / 宝箱 / 兴趣点按比例外推;溪流按原尺寸重新串段,不放大贴图);
- 分区摆放(ZONES):路面 / 路肩 / 林间空地 / 营地 / 水边 / 岩区 / 遗迹 / 深林,每区一张「放什么、多密、留白」的表;
- 防重叠:高物件(树 / 岩 / 遗迹)树干间距 + 贴图矩形重叠上限;树冠不许盖住它身后的路 / 空地 / 怪群 / 宝箱(人走在树后会被挡);
- 输出 JSON(给 apply / 预览用)+ 预览图(实景合成 + 分区着色)。

用法:
  python tools/qa/woods_v4_gen.py preview [--scale 0.1]   出预览图到 %TEMP%/lootchain-qa/woods_v4/
  python tools/qa/woods_v4_gen.py json                     只出 JSON
"""
import json
import math
import os
import random
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import woods_def_gen as v3  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources')
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'woods_v4')

MAP_SCALE = 1.5
S = v3.S * MAP_SCALE  # 世界单位 / 原型像素
CX, CY = v3.CX, v3.CY
MAP_W = round(13560 * MAP_SCALE)
MAP_H = round(6525 * MAP_SCALE)
EDGE = 50  # walk 边界离地图边


def wx(px):
    return round((px - CX) * S)


def wy(py):
    return round((CY - py) * S)


# ── 骨架:沿用 v3 原型路网 / 空地,新增几条通往新怪群的岔路(原型像素) ──
ROADS = [list(line) for line in v3.ROADS] + [
    [(345, 615), (300, 520), (290, 395)],          # 营地外 → 西林
    [(1100, 665), (1150, 760), (1240, 820)],      # 遗迹 → 南林
    [(1380, 610), (1440, 520), (1500, 450)],      # 遗迹东 → 猎人营地南
    [(1020, 255), (1120, 150), (1260, 110)],      # 蛛巢 → 北林
]
# 通往新增怪群的小路(世界坐标)
EXTRA_ROADS_WORLD = [
    [(-6800, 950), (-6450, 1500), (-6200, 1850)],            # → 瀑布西鼠群
    [(-7350, -250), (-8100, -700), (-8650, -900)],           # → 西坡野犬
    [(-5450, -2700), (-5150, -3150)],                        # → 营地南鼠群
    [(7380, -2419), (8250, -2650), (9100, -2500)],           # → 东崖野犬
    [(6450, -2300), (7150, -3250), (7850, -3900)],           # → 东南蛛群
    [(7942, -956), (8650, -820)],                            # → 东南鼠群
]
AREAS = [tuple(a) for a in v3.AREAS] + [
    (300, 430, 70, 45),      # 西林空地
    (1240, 820, 85, 45),     # 南林空地
    (1260, 110, 80, 45),     # 北林空地
    (1480, 470, 70, 40),     # 猎人营地南
]

# 地标(原型像素);贴图尺寸按 LANDMARK_GROW 放大(大件跟着空地变大,但不按地图倍率放,免得贴图糊)
LANDMARK_GROW = 1.2


def load_rgba(asset):
    path = os.path.join(RES, asset + '.png')
    return Image.open(path).convert('RGBA')


_ASPECT = {}


def aspect(asset):
    """贴图高宽比。"""
    if asset not in _ASPECT:
        im = load_rgba(asset)
        _ASPECT[asset] = im.height / im.width
    return _ASPECT[asset]


def W3(name):
    return f'ui/world/woods3/w3_{name}'


def V3(name):
    return f'ui/world/vil3/vil3_{name}'


def FLD(name):
    return f'ui/world/fld_{name}'


# ── 分区:每区放什么(素材, 权重, 宽度范围, 类型 tall/low)、密度(每百万平方单位个数)、留白 ──
# tall = 参与防重叠 + 树冠遮挡检查;low = 矮物件(只防互相压、不许被高物件盖住)
TREE_KINDS = {
    'pine': (W3('tree_pine'), (380, 500)),
    'oak': (W3('tree_oak'), (520, 660)),
    'autumn': (W3('tree_autumn'), (540, 640)),
}
LOW = {
    'fern': (W3('fern'), (170, 230)),
    'mushrooms': (W3('mushrooms'), (100, 140)),
    'bush': (V3('bush'), (150, 210)),
    'grass': (V3('grass_tuft'), (90, 130)),
    'dry_grass_l': (FLD('g_grass_l'), (150, 210)),
    'dry_grass_s': (FLD('g_grass_s'), (110, 150)),
    'shrub': (FLD('g_shrub'), (150, 200)),
    'stones': (FLD('g_stones'), (120, 170)),
    'gravel': (FLD('g_gravel'), (170, 240)),
    'rocks_s': (FLD('g_rocks_s'), (140, 190)),
    'log': (FLD('forest_stump'), (260, 340)),
    'stump': (W3('stump'), (220, 280)),
}
TALL_EXTRA = {
    'rock_small': (W3('rock_small'), (300, 380)),
    'boulders_m': (FLD('g_boulders_m'), (240, 320)),
    'boulders_l': (FLD('g_boulders_l'), (360, 460)),
    'dead_tree': (FLD('dead_tree'), (300, 380)),
    'rocks': (FLD('rocks'), (380, 480)),
}

ZONES = {
    # 名称: (说明, 高物件表, 矮物件表, 高物件密度, 矮物件密度) 密度 = 每 100 万平方世界单位
    'road': ('路面:只铺路,不放任何立物', [], [], 0, 0),
    'shoulder': ('路肩(离路 130~320):碎石 / 草丛 / 蕨;不放树', [],
                 [('gravel', 2), ('stones', 2), ('grass', 3), ('dry_grass_s', 2), ('fern', 2)], 0, 9.0),
    'edge': ('林缘(离路 320~800):灌木 / 蕨 / 蘑菇 / 树桩 + 少量小树(只在路后侧)', [('pine', 3), ('autumn', 2), ('oak', 1)],
             [('bush', 3), ('fern', 4), ('mushrooms', 1), ('stump', 1), ('dry_grass_l', 2), ('grass', 2)], 2.6, 7.0),
    'clearing': ('林间空地 / 怪群活动区:中间留空打怪,外圈 20% 放主题件', [], [('grass', 2), ('dry_grass_s', 2), ('stones', 1)], 0, 1.6),
    'water': ('水面:不放', [], [], 0, 0),
    'waterside': ('水边(离水 250 内):岩块 / 蕨 / 草,不放大树(挡水面)', [('rock_small', 2), ('boulders_m', 1)],
                  [('fern', 3), ('grass', 3), ('rocks_s', 2), ('stones', 1)], 0.8, 7.0),
    'rocky': ('岩区(崖边 / 熊穴 / 西南坡):岩堆 / 枯树 / 松树,地面碎石', [('pine', 2), ('boulders_l', 2), ('rocks', 1), ('dead_tree', 1), ('boulders_m', 2)],
              [('gravel', 2), ('rocks_s', 3), ('dry_grass_l', 2), ('shrub', 2)], 1.6, 5.0),
    'ruins': ('遗迹(古树周边):残墙 / 柱 / 晶柱成组摆在外圈,地面苔藓', [('pine', 1), ('oak', 1)], [('fern', 2), ('grass', 2), ('stones', 2), ('mushrooms', 1)], 0.5, 4.0),
    'forest': ('深林:成片树林(针叶 / 阔叶 / 秋树按区域配色),树间留缝露地面,林下蕨 / 倒木 / 蘑菇', [('pine', 5), ('oak', 4), ('autumn', 2)],
               [('fern', 5), ('log', 1), ('mushrooms', 1), ('bush', 2), ('stump', 1)], 3.2, 5.0),
}
ZONE_COLOR = {
    'road': (214, 186, 130), 'shoulder': (236, 214, 160), 'edge': (150, 196, 92), 'clearing': (250, 238, 120),
    'water': (70, 150, 230), 'waterside': (120, 210, 230), 'rocky': (160, 150, 150), 'ruins': (190, 140, 230), 'forest': (40, 110, 50),
}


# ── 骨架换算 ──

def scaled_point(px, py):
    return wx(px), wy(py)


def old_world(px, py):
    return v3.wx(px), v3.wy(py)


def anchor_of(px, py):
    """立物 / 怪群锚到最近的空地:空地中心按地图倍率外推,物件相对空地中心的偏移只按 LANDMARK_GROW 放大(营地 / 遗迹成组不散开)。"""
    best = None
    for ax, ay, rx, ry in v3.AREAS:
        d = math.hypot((px - ax) / max(rx, 1), (py - ay) / max(ry, 1))
        if best is None or d < best[0]:
            best = (d, ax, ay)
    if best and best[0] < 1.8:
        _, ax, ay = best
        ox, oy = old_world(px, py)
        cx0, cy0 = old_world(ax, ay)
        return round(wx(ax) + (ox - cx0) * LANDMARK_GROW), round(wy(ay) + (oy - cy0) * LANDMARK_GROW)
    return scaled_point(px, py)


def build_skeleton():
    roads = [[scaled_point(x, y) for x, y in line] for line in ROADS] + [list(line) for line in EXTRA_ROADS_WORLD]
    areas = [(wx(x), wy(y), round(rx * S), round(ry * S)) for x, y, rx, ry in AREAS]
    flats = []
    for a, x, y, w, water in v3.FLATS:
        nx, ny = anchor_of(x, y) if a in ('camp_plaza', 'ruins_floor') else scaled_point(x, y)
        flats.append({'asset': W3(a), 'x': nx, 'y': ny, 'width': round(w * LANDMARK_GROW), 'flat': True, 'water': water})
    river = []
    for a, x, y, w, flip in v3.RIVER:
        nx, ny = scaled_point(x, y)
        river.append({'asset': W3(a), 'x': nx, 'y': ny, 'width': round(w * 1.38), 'flat': True, 'water': True, 'flipX': flip})
    bridge = {'asset': W3('bridge'), 'x': wx(790), 'y': wy(437), 'width': round(1050 * LANDMARK_GROW), 'flat': True}
    stands = []
    for a, x, y, w, extra in v3.STANDS:
        if a == 'tree_autumn':
            continue  # 散树交给分区重新撒
        nx, ny = anchor_of(x, y)
        item = {'asset': W3(a), 'x': nx, 'y': ny, 'width': round(w * (LANDMARK_GROW if w >= 900 else 1.0))}
        if 'flipX: true' in extra:
            item['flipX'] = True
        if 'block' in extra:
            bw = int(extra.split('w: ')[1].split(',')[0])
            bd = int(extra.split('d: ')[1].split(' ')[0].rstrip('}').strip())
            g = item['width'] / w
            item['block'] = {'w': round(bw * g), 'd': round(bd * g)}
        stands.append(item)
    return roads, areas, flats, river, bridge, stands


# 怪群(世界坐标,v4 直接给定):v3 的 23 群按放大后的地形重新拉开(原来挤在一起、圈套圈)+ 新增 10 群填空白区。
# 普通群只数 8~12(加密);服务端每群仍只登记 6 只,整群奖励不变(客户端按只数折算)。
# (关卡码, 名字, 怪物, 只数, 等级, x, y, 精英)
V4_CAMPS = [
    # 西南:入口营地 → 幼鼠窝(Lv.2~3)
    ('FIELD_WOODS_4', '营地外鼠群', 'MINI_RAT', 10, 3, -6250, -1900, False),
    ('FIELD_WOODS_1', '幼鼠窝', 'MINI_RAT', 10, 2, -5000, -200, False),
    ('FIELD_WOODS_3', '林道鼠群', 'MINI_RAT', 8, 2, -3900, -1350, False),
    ('FIELD_WOODS_12', '西林鼠群', 'MINI_RAT', 8, 2, -6950, 500, False),
    ('FIELD_WOODS_21', '西崖鼠群', 'MINI_RAT', 8, 2, -8450, 1900, False),
    ('FIELD_WOODS_22', '瀑布西鼠群', 'MINI_RAT', 9, 3, -6200, 1950, False),
    ('FIELD_WOODS_23', '西坡野犬', 'MEDIUM_DOG', 8, 3, -8700, -900, False),
    ('FIELD_WOODS_24', '营地南鼠群', 'MINI_RAT', 9, 3, -5000, -3600, False),  # 11-08 实机:原 (-4300,-3700) 半圈压在溪里
    # 中部:木桥 / 溪流 / 瀑布(Lv.4~5)
    ('FIELD_WOODS_5', '桥头野犬', 'MEDIUM_DOG', 8, 4, -2550, -700, False),
    ('FIELD_WOODS_13', '溪畔蛛群', 'SMALL_SPIDER', 9, 4, 50, -950, False),
    ('FIELD_WOODS_6', '瀑布蛛群', 'SMALL_SPIDER', 8, 4, -1300, 2950, False),
    ('FIELD_WOODS_25', '溪南野犬', 'MEDIUM_DOG', 8, 4, -1700, -3950, False),
    ('FIELD_WOODS_19', '南岔鼠群', 'MINI_RAT', 9, 5, -150, -2900, False),  # 11-08 实机:原 (-650,-2500) 两成落在水边崖石上
    ('FIELD_WOODS_2', '林间蛛巢', 'SMALL_SPIDER', 12, 5, 1500, 2050, False),
    ('FIELD_WOODS_E2', '林间蛛后', 'SMALL_SPIDER', 1, 7, 800, 2480, True),
    # 中东:林道 / 猎人营地(Lv.6~7)
    ('FIELD_WOODS_7', '林道野犬', 'MEDIUM_DOG', 8, 6, 2000, 700, False),
    ('FIELD_WOODS_14', '中路野犬', 'MEDIUM_DOG', 9, 6, 3350, 1500, False),
    ('FIELD_WOODS_8', '猎人营地野犬', 'MEDIUM_DOG', 10, 6, 4700, 150, False),
    ('FIELD_WOODS_26', '北林蛛群', 'SMALL_SPIDER', 10, 6, 4100, 3650, False),
    ('FIELD_WOODS_27', '中林野犬', 'MEDIUM_DOG', 9, 7, 5600, -900, False),
    # 南:古树遗迹(Lv.7~8)
    ('FIELD_WOODS_15', '遗迹西蛛群', 'SMALL_SPIDER', 10, 7, 1150, -2050, False),
    ('FIELD_WOODS_9', '遗迹蛛群', 'SMALL_SPIDER', 10, 7, 2350, -3450, False),
    ('FIELD_WOODS_16', '古树野犬', 'MEDIUM_DOG', 9, 8, 4450, -1900, False),
    ('FIELD_WOODS_28', '南林鼠群', 'MINI_RAT', 10, 7, 3800, -4250, False),
    ('FIELD_WOODS_17', '遗迹东蛛群', 'SMALL_SPIDER', 10, 8, 5700, -3100, False),
    # 东:熊穴 / 东林(Lv.8~10)
    ('FIELD_WOODS_E', '棕鬃熊', 'MEDIUM_BEAR', 1, 8, 6000, 850, True),
    ('FIELD_WOODS_10', '熊穴前野犬', 'MEDIUM_DOG', 9, 8, 6700, 2250, False),
    ('FIELD_WOODS_B', '腐木巨熊', 'MEDIUM_BEAR', 1, 10, 7950, 2950, True),
    ('FIELD_WOODS_18', '东林野犬', 'MEDIUM_DOG', 9, 9, 7350, 700, False),
    ('FIELD_WOODS_11', '遗迹东鼠群', 'MINI_RAT', 10, 9, 7150, -1950, False),
    ('FIELD_WOODS_20', '东南鼠群', 'MINI_RAT', 10, 9, 8700, -800, False),
    ('FIELD_WOODS_29', '东崖野犬', 'MEDIUM_DOG', 10, 9, 9150, -2500, False),
    ('FIELD_WOODS_30', '东南蛛群', 'SMALL_SPIDER', 10, 10, 7900, -3950, False),
]


def build_camps():
    out = []
    for code, name, mon, n, lv, x, y, elite in V4_CAMPS:
        out.append({'code': code, 'name': name, 'monster': mon, 'count': n, 'level': lv, 'x': x, 'y': y, 'elite': elite})
    return out


def camp_radius(c):
    if c['code'].endswith('_B'):
        return 120
    if c['elite']:
        return 90
    return 170 if c['count'] <= 3 else 140 + c['count'] * 58


def schematic(path, scale=0.06, show_grid=True):
    """规划用示意图:路 / 空地 / 地标框 / 怪群圈(含等级)/ 溪流段。"""
    roads, areas, flats, river, bridge, stands = build_skeleton()
    camps = build_camps()
    Wp, Hp = int(MAP_W * scale), int(MAP_H * scale)
    im = Image.new('RGB', (Wp, Hp), (46, 78, 44))
    dr = ImageDraw.Draw(im)
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 13)
    P = lambda x, y: ((x + MAP_W / 2) * scale, (MAP_H / 2 - y) * scale)
    if show_grid:
        for gx in range(-10000, 10001, 1000):
            dr.line([P(gx, -MAP_H / 2), P(gx, MAP_H / 2)], fill=(60, 92, 58), width=1)
        for gy in range(-5000, 5001, 1000):
            dr.line([P(-MAP_W / 2, gy), P(MAP_W / 2, gy)], fill=(60, 92, 58), width=1)
    for x, y, rx, ry in areas:
        a, b = P(x - rx, y + ry), P(x + rx, y - ry)
        dr.ellipse([a, b], fill=(110, 130, 70))
    for f in flats + river + [bridge]:
        w = f['width']
        h = w * aspect(f['asset'])
        a, b = P(f['x'] - w / 2, f['y'] + h / 2), P(f['x'] + w / 2, f['y'] - h / 2)
        dr.rectangle([a, b], outline=(90, 170, 240) if f.get('water') else (200, 180, 120), width=1)
    for line in roads:
        dr.line([P(x, y) for x, y in line], fill=(214, 186, 130), width=max(2, int(220 * scale)))
    for s in stands:
        w = s['width']
        h = w * aspect(s['asset'])
        a, b = P(s['x'] - w / 2, s['y'] + h), P(s['x'] + w / 2, s['y'])
        dr.rectangle([a, b], outline=(240, 120, 90), width=1)
    for c in camps:
        r = camp_radius(c)
        a, b = P(c['x'] - r, c['y'] + r), P(c['x'] + r, c['y'] - r)
        col = (255, 90, 80) if c['elite'] else (255, 220, 90)
        dr.ellipse([a, b], outline=col, width=2)
        px, py = P(c['x'], c['y'])
        dr.text((px - 20, py - 8), f"{c['code'].replace('FIELD_WOODS_', '')} L{c['level']}×{c['count']}", font=font, fill=col)
    im.save(path)
    return im


# ── 兴趣点 / 宝箱 / 出口 / 传送阵(要留白的交互点)──

POI_FIX = {
    'W_STELE_1': (2568, -1426),
    'W_HERB_1': (5980, 273),
    'W_HERB_2': (-1285, -533),
    'W_ORE_1': (-696, -3798),
    'W_ORE_2': (4682, -3450),
}


def build_points():
    import woods_def_apply as ap
    chests = []
    for code, name, kind, x, y in ap.CHESTS:
        nx, ny = anchor_of(x, y)
        chests.append({'code': code, 'label': name, 'kind': kind, 'x': nx, 'y': ny})
    pois = [{'code': c, 'kind': k, 'name': n, 'x': round(x * MAP_SCALE), 'y': round(y * MAP_SCALE)} for c, k, n, x, y in ap.WOODS_POIS]
    # 运行时 snapPois 会把落在挡路处 / 怪群仇恨圈里 / 大树遮挡区的兴趣点挪走,而服务端领奖坐标表按地图定义导出(不经过运行时):
    # 把实机挪到的位置写回这里,两边一致(11-08 实机日志;改了布局要在预览里重看 [POI] 日志再更新)
    for p in pois:
        if p['code'] in POI_FIX:
            p['x'], p['y'] = POI_FIX[p['code']]
    waypoint = {'x': wx(180), 'y': wy(755)}
    spawn = {'x': wx(240), 'y': wy(735)}
    exits = [
        {'key': 'to_village', 'label': '返回 · 晨风村', 'x': round(-6420 * MAP_SCALE), 'y': round(-2440 * MAP_SCALE), 'radius': 130,
         'toMap': 'VILLAGE', 'toSpawn': {'x': 2300, 'y': -1000}},
        {'key': 'to_city', 'label': '前往 · 主城', 'x': round(5800 * MAP_SCALE), 'y': round(525 * MAP_SCALE), 'radius': 130,
         'toMap': 'CITY', 'toSpawn': {'x': -2344, 'y': -2750}},  # 11-08 主城 v4 南门内
    ]
    places = [{'name': n, 'x': wx(x), 'y': wy(y), 'icon': ic} for n, ic, x, y in [
        ('入口营地', 'portal', 240, 735), ('幼鼠窝', 'den', 430, 470), ('林间蛛巢', 'cave', 1000, 245),
        ('猎人营地', 'camp', 1330, 370), ('古树遗迹', 'ruins', 1150, 650), ('熊穴', 'cave', 1580, 195)]]
    return chests, pois, waypoint, spawn, exits, places


# ── 分区栅格 ──
CELL = 40


class Grid:
    def __init__(self):
        self.nx = MAP_W // CELL + 1
        self.ny = MAP_H // CELL + 1
        xs = (np.arange(self.nx) * CELL - MAP_W / 2 + CELL / 2).astype(np.float32)
        ys = (MAP_H / 2 - np.arange(self.ny) * CELL - CELL / 2).astype(np.float32)
        self.X, self.Y = np.meshgrid(xs, ys)
        self.zone = np.full((self.ny, self.nx), 'forest', dtype=object)
        self.blocked = np.zeros((self.ny, self.nx), bool)  # 不许放任何东西(水面 / 地标脚底 / 交互点)
        self.edge = np.zeros((self.ny, self.nx), bool)

    def idx(self, x, y):
        ix = int((x + MAP_W / 2) // CELL)
        iy = int((MAP_H / 2 - y) // CELL)
        return min(max(iy, 0), self.ny - 1), min(max(ix, 0), self.nx - 1)

    def at(self, x, y):
        return self.zone[self.idx(x, y)]

    def is_blocked(self, x, y):
        return bool(self.blocked[self.idx(x, y)])


def seg_dist(X, Y, lines):
    best = np.full(X.shape, 1e9, np.float32)
    for line in lines:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / max(1.0, dx * dx + dy * dy), 0, 1)
            d = np.hypot(X - ax - dx * t, Y - ay - dy * t)
            best = np.minimum(best, d)
    return best


def water_mask(grid, water_flats):
    """水面像素(偏蓝 / 白沫)→ 栅格;崖石单独一张(不放东西,但不算水边)。"""
    mask = np.zeros(grid.zone.shape, bool)
    rock = np.zeros(grid.zone.shape, bool)
    for f in water_flats:
        im = load_rgba(f['asset'])
        if f.get('flipX'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        w = f['width']
        h = w * im.height / im.width
        a = np.asarray(im).astype(np.int32)
        r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        sat = (mx - mn) / np.maximum(1, mx)
        lum = (r + g + b) / 3
        water = (al > 140) & ((b > r + 8) | ((lum > 170) & (sat < 0.12)))
        stone = (al > 140) & (sat < 0.22) & (lum > 55) & ~water
        x0, y1 = f['x'] - w / 2, f['y'] + h / 2
        sel = (grid.X >= x0) & (grid.X < x0 + w) & (grid.Y <= y1) & (grid.Y > y1 - h)
        iy, ix = np.where(sel)
        px = ((grid.X[iy, ix] - x0) / w * im.width).astype(int).clip(0, im.width - 1)
        py = ((y1 - grid.Y[iy, ix]) / h * im.height).astype(int).clip(0, im.height - 1)
        mask[iy, ix] |= water[py, px]
        rock[iy, ix] |= stone[py, px]
    return mask, rock


def dilate(mask, r_cells):
    out = mask.copy()
    for dy in range(-r_cells, r_cells + 1):
        for dx in range(-r_cells, r_cells + 1):
            if dx * dx + dy * dy > r_cells * r_cells:
                continue
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


THEMES = {
    # 主题区(世界坐标椭圆):岩区(瀑布崖下 / 熊穴 / 东崖 / 西南坡 / 东南角)、遗迹(古树周边)
    'rocky': [(7950, 3300, 2100, 1300), (9300, 1500, 1100, 1300), (-4300, 3300, 2600, 1000), (-9300, -3900, 1600, 1100), (9200, -3900, 1200, 900)],
    'ruins': [(3300, -2350, 2500, 1350)],
}


def build_grid(roads, areas, flats, river, stands, camps, points):
    g = Grid()
    d_road = seg_dist(g.X, g.Y, roads)
    g.d_road = d_road
    water, cliff = water_mask(g, [f for f in flats + river if f.get('water')])
    near_water = dilate(water, 6)  # 约 240
    ell = np.zeros(g.zone.shape, bool)
    for x, y, rx, ry in areas:
        ell |= ((g.X - x) / rx) ** 2 + ((g.Y - y) / ry) ** 2 <= 1
    campz = np.zeros(g.zone.shape, bool)
    for c in camps:
        campz |= np.hypot(g.X - c['x'], (g.Y - c['y']) / 0.8) <= camp_radius(c) * 0.85 + 60
    themes = {}
    for name, lst in THEMES.items():
        m = np.zeros(g.zone.shape, bool)
        for x, y, rx, ry in lst:
            m |= ((g.X - x) / rx) ** 2 + ((g.Y - y) / ry) ** 2 <= 1
        themes[name] = m
    z = g.zone
    z[:] = 'forest'
    z[(d_road > 320) & (d_road <= 800)] = 'edge'
    z[themes['rocky']] = 'rocky'
    z[themes['ruins']] = 'ruins'
    z[near_water & ~water] = 'waterside'
    z[ell | campz] = 'clearing'
    z[(d_road > 130) & (d_road <= 320)] = 'shoulder'
    z[d_road <= 130] = 'road'
    z[water] = 'water'
    g.campz = campz
    g.water_or_cliff = water | cliff
    g.blocked |= water | cliff
    # 立物贴图范围内不再放别的(防叠);平铺地标(营地 / 遗迹地面)当空地,只放矮物
    for st in stands:
        w = st['width']
        h = w * aspect(st['asset'])
        g.blocked |= (np.abs(g.X - st['x']) < w * 0.5) & (g.Y > st['y'] - 60) & (g.Y < st['y'] + h * 0.9)
    for f in flats:
        if f.get('water'):
            continue
        w = f['width']
        h = w * aspect(f['asset'])
        m = ((g.X - f['x']) / (w * 0.46)) ** 2 + ((g.Y - f['y']) / (h * 0.44)) ** 2 <= 1
        z[m & (z != 'road') & (z != 'water')] = 'clearing'
    for px, py, pr in points:
        g.blocked |= np.hypot(g.X - px, g.Y - py) <= pr
    g.edge = (np.abs(g.X) > MAP_W / 2 - EDGE - 40) | (np.abs(g.Y) > MAP_H / 2 - EDGE - 40)
    return g


# ── 撒点 ──
# 投点倍数:投得多、靠防重叠规则自然饱和(投不进的地方就是留白)
TALL_DARTS = 30.0
FOREST_OVERLAP = 0.25
LOW_DARTS = 2.6

class Placed:
    def __init__(self):
        self.tall = []
        self.low = []
        self.decal = []
        self.buckets = {}

    @staticmethod
    def key(x, y):
        return int(x // 800), int(y // 800)

    def near(self, x, y, rad=1):
        kx, ky = self.key(x, y)
        for i in range(kx - rad, kx + rad + 1):
            for j in range(ky - rad, ky + rad + 1):
                yield from self.buckets.get((i, j), ())

    def add(self, item):
        self.buckets.setdefault(self.key(item['x'], item['y']), []).append(item)


def rect_of(asset, x, y, w, kind):
    h = w * aspect(asset)
    if kind == 'tree':
        # 树冠可见范围:左右 0.44w,高度从脚线上 0.06h 到 0.96h
        return (x - w * 0.44, y + h * 0.06, x + w * 0.44, y + h * 0.96), h
    return (x - w * 0.46, y, x + w * 0.46, y + h * 0.92), h


def overlap(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy


def area(r):
    return max(1.0, (r[2] - r[0]) * (r[3] - r[1]))


PROTECT = {'road', 'clearing', 'water'}
ROAD_COVER_MIN = 220  # 路中线 220 以内(路面 + 路肩内侧)不许被树冠盖住


def canopy_ok(g, rect, base_y):
    """高物件贴图矩形里、脚线后方(y > 脚线)不能有路 / 空地(怪群活动区)/ 水 / 交互点:人走到那里会被挡住。"""
    x0, y0, x1, y1 = rect
    for fy in np.linspace(max(y0, base_y + 20), y1, 7):
        for fx in np.linspace(x0, x1, 7):
            if abs(fx) > MAP_W / 2 or abs(fy) > MAP_H / 2:
                continue
            i = g.idx(fx, fy)
            if g.zone[i] in PROTECT or g.blocked[i] or g.d_road[i] <= ROAD_COVER_MIN:
                return False
    return True


def core_hit(px, py, r):
    """点落在贴图「核心」(左右中间 60%、下部 75%):树干 / 石头埋进别人的树冠里。"""
    w = r[2] - r[0]
    h = r[3] - r[1]
    return r[0] + w * 0.2 < px < r[2] - w * 0.2 and r[1] - 30 < py < r[1] + h * 0.75


def try_tall(g, P, asset, x, y, w, kind, structures):
    rect, h = rect_of(asset, x, y, w, 'tree' if kind == 'tree' else 'prop')
    if not canopy_ok(g, rect, y):
        return False
    r_trunk = w * (0.22 if kind == 'tree' else 0.32)
    # 深林(离路 900 以上)树冠可以相接成片(上限 FOREST_OVERLAP);路边 / 林缘 / 岩区严格不叠
    i = g.idx(x, y)
    limit = FOREST_OVERLAP if (kind == 'tree' and g.zone[i] == 'forest' and g.d_road[i] > 900) else 0.12
    for o in P.near(x, y, 1):
        if o['layer'] != 'tall':
            continue
        if math.hypot(o['x'] - x, o['y'] - y) < r_trunk + o['r']:
            return False
        if overlap(rect, o['rect']) > limit * min(area(rect), area(o['rect'])):
            return False
        # 脚线不能落进别人的贴图核心(树从树冠里长出来 / 石头埋在树后)
        if core_hit(x, y, o['rect']) or core_hit(o['x'], o['y'], rect):
            return False
    for srect in structures:
        if overlap(rect, srect) > 0.02 * area(rect):
            return False
    item = {'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'rect': rect, 'r': r_trunk, 'layer': 'tall', 'kind': kind}
    P.tall.append(item)
    P.add(item)
    return True


def try_low(g, P, asset, x, y, w, structures):
    rect, h = rect_of(asset, x, y, w, 'prop')
    for o in P.near(x, y, 1):
        ov = overlap(rect, o['rect'])
        if o['layer'] == 'low' and ov > 0.08 * min(area(rect), area(o['rect'])):
            return False
        if o['layer'] == 'tall':
            # 矮物件在高物件后面(被挡)不行;在前面只许压住树根一小块
            if y > o['y'] - 10 and ov > 0:
                return False
            if y <= o['y'] - 10 and ov > 0.35 * area(rect):
                return False
    for srect in structures:
        if overlap(rect, srect) > 0.05 * area(rect):
            return False
    item = {'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'rect': rect, 'r': 0, 'layer': 'low'}
    P.low.append(item)
    P.add(item)
    return True


def stand_ok(g, asset, x, y, w, landmark=False):
    """立物(帐篷 / 遗迹 / 岩块 / 主题件)落点:脚不在路 / 水上;贴图里脚线后方不盖住路面、水面、怪群活动圈(地标巨树只管路和水)。"""
    i = g.idx(x, y)
    if g.d_road[i] <= 170 or g.zone[i] == 'water' or g.water_or_cliff[i]:
        return False
    rect, _ = rect_of(asset, x, y, w, 'prop')
    x0, y0, x1, y1 = rect
    for fy in np.linspace(max(y0, y + 20), y1, 8):
        for fx in np.linspace(x0, x1, 8):
            if abs(fx) > MAP_W / 2 or abs(fy) > MAP_H / 2:
                continue
            j = g.idx(fx, fy)
            if g.d_road[j] <= ROAD_COVER_MIN - 40 or g.zone[j] == 'water':
                return False
            if not landmark and g.campz[j]:
                return False
    return True


def settle(g, items, placed=None):
    """放大后地标 / 立物按 1.2 倍锚定、路按 1.5 倍外推,有的会压到路上:就近挪到不挡路的位置(优先往路的前方 = 屏幕下方挪)。"""
    out = list(placed or [])
    moved = []
    rects = [rect_of(o['asset'], o['x'], o['y'], o['width'], 'prop')[0] for o in out]
    result = []
    for it in items:
        landmark = it['asset'].endswith('ancient_tree')
        x0, y0 = it['x'], it['y']
        best = None
        for r in range(0, 1300, 50):
            angs = [0] if r == 0 else [-90, -60, -120, -30, -150, 0, 180, 30, 150, 60, 120, 90]
            for a in angs:
                x = x0 + math.cos(math.radians(a)) * r
                y = y0 + math.sin(math.radians(a)) * r * 0.8
                if not stand_ok(g, it['asset'], x, y, it['width'], landmark):
                    continue
                rc = rect_of(it['asset'], x, y, it['width'], 'prop')[0]
                # 立物之间也不叠(帐篷压晾架、骨堆埋帐篷后)
                if any(overlap(rc, o) > 0.04 * min(area(rc), area(o)) for o in rects):
                    continue
                best = (round(x), round(y))
                break
            if best:
                break
        item = dict(it)
        if best and best != (x0, y0):
            item['x'], item['y'] = best
            moved.append((it['asset'].split('/')[-1], (x0, y0), best))
        rects.append(rect_of(item['asset'], item['x'], item['y'], item['width'], 'prop')[0])
        result.append(item)
    return result, moved


def pick(rnd, table):
    tot = sum(wt for _, wt in table)
    v = rnd.random() * tot
    for name, wt in table:
        v -= wt
        if v <= 0:
            return name
    return table[-1][0]


def tree_mix(x, y):
    """深林配色分区:西 / 北偏针叶,东(猎人营地 / 熊穴)偏秋树,中南偏阔叶。"""
    if x > 4500 and y > -1500:
        return [('autumn', 4), ('pine', 3), ('oak', 2)]
    if y > 2000 or x < -6000:
        return [('pine', 6), ('oak', 2), ('autumn', 1)]
    return [('oak', 4), ('pine', 4), ('autumn', 2)]


def scatter(g, P, structures, seed=8, layers=('tall', 'low')):
    rnd = random.Random(seed)
    cells = {}
    for name in ZONES:
        cells[name] = np.where((g.zone == name) & ~g.blocked & ~g.edge)
    # 先高后矮:按密度 × 面积投点,投不进的不补(天然留白)
    for layer in layers:
        for name, (desc, tall_t, low_t, tall_d, low_d) in ZONES.items():
            iy, ix = cells[name]
            if len(iy) == 0:
                continue
            area_m = len(iy) * CELL * CELL / 1e6
            table = tall_t if layer == 'tall' else low_t
            dens = tall_d if layer == 'tall' else low_d
            if not table or dens <= 0:
                continue
            n = int(area_m * dens * (TALL_DARTS if layer == 'tall' else LOW_DARTS))
            for _ in range(n):
                k = rnd.randrange(len(iy))
                x = float(g.X[iy[k], ix[k]]) + rnd.uniform(-CELL / 2, CELL / 2)
                y = float(g.Y[iy[k], ix[k]]) + rnd.uniform(-CELL / 2, CELL / 2)
                if layer == 'tall':
                    kind_name = pick(rnd, tree_mix(x, y) if name == 'forest' else table)
                    if kind_name in TREE_KINDS:
                        asset, (lo, hi) = TREE_KINDS[kind_name]
                        try_tall(g, P, asset, x, y, rnd.uniform(lo, hi), 'tree', structures)
                    else:
                        asset, (lo, hi) = TALL_EXTRA[kind_name]
                        try_tall(g, P, asset, x, y, rnd.uniform(lo, hi), 'rock', structures)
                else:
                    asset, (lo, hi) = LOW[pick(rnd, table)]
                    try_low(g, P, asset, x, y, rnd.uniform(lo, hi), structures)
    return P


DECALS = {
    'forest': [(W3('decal_leaves'), 520), (W3('decal_roots'), 440), (W3('decal_moss'), 340)],
    'edge': [(W3('decal_leaves'), 480), (V3('decal_weeds'), 520), (W3('decal_moss'), 320)],
    'waterside': [(W3('decal_moss'), 380), (V3('decal_weeds'), 480)],
    'rocky': [(FLD('g_crack'), 300), (V3('decal_dirt'), 420), (W3('decal_moss'), 320)],
    'ruins': [(W3('decal_moss'), 380), (W3('decal_roots'), 420)],
    'clearing': [(V3('decal_weeds'), 520), (V3('decal_dirt'), 440), (W3('decal_leaves'), 460)],
    'shoulder': [(V3('decal_weeds'), 420)],
}


def scatter_decals(g, P, seed=13, step=640):
    rnd = random.Random(seed)
    out = []
    for gy in range(-MAP_H // 2, MAP_H // 2 + step, int(step * 0.7)):
        for gx in range(-MAP_W // 2, MAP_W // 2 + step, step):
            x = gx + rnd.uniform(-step * 0.4, step * 0.4)
            y = gy + rnd.uniform(-step * 0.3, step * 0.3)
            if abs(x) > MAP_W / 2 or abs(y) > MAP_H / 2:
                continue
            zz = g.at(x, y)
            if zz in ('road', 'water') or g.is_blocked(x, y) or rnd.random() < 0.18:
                continue
            table = DECALS.get(zz)
            if not table:
                continue
            asset, base = table[rnd.randrange(len(table))]
            out.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(base * rnd.uniform(0.8, 1.2)), 'flat': True, 'flipX': rnd.random() < 0.5})
    P.decal = out
    return out


def camp_props(camps, rnd):
    """怪群外圈主题件:鼠群 = 倒木 + 碎石,蛛群 = 岩块 + 蘑菇,野犬 = 骨堆 + 石块;放在活动圈外沿,不进圈心。"""
    out = []
    for c in camps:
        if c['elite']:
            continue
        r = camp_radius(c)
        kinds = {'MINI_RAT': [(FLD('forest_stump'), 300), (FLD('g_rocks_s'), 170)],
                 'SMALL_SPIDER': [(FLD('g_boulders_m'), 280), (W3('mushrooms'), 130)],
                 'MEDIUM_DOG': [(W3('bones'), 360), (FLD('g_stones'), 150)]}[c['monster']]
        ang0 = rnd.uniform(0, math.tau)
        for i, (asset, w) in enumerate(kinds):
            ang = ang0 + i * 2.3
            out.append({'asset': asset, 'x': round(c['x'] + math.cos(ang) * (r + 60)), 'y': round(c['y'] + math.sin(ang) * (r + 40) * 0.8), 'width': w})
    return out


def dress_camp_rims(g, P, camps, structures, rnd):
    """怪群空地外沿一圈矮物(草丛 / 蕨 / 灌木 / 碎石),空地像林间草甸而不是光秃的圆;圈心留空打怪。"""
    for c in camps:
        r = camp_radius(c) * 0.85 + 60
        n = 7 if not c['elite'] else 4
        a0 = rnd.uniform(0, math.tau)
        for k in range(n):
            a = a0 + k * math.tau / n + rnd.uniform(-0.25, 0.25)
            rr = r * rnd.uniform(0.92, 1.12)
            x = c['x'] + math.cos(a) * rr
            y = c['y'] + math.sin(a) * rr * 0.8
            i = g.idx(x, y)
            if g.blocked[i] or g.d_road[i] <= 150:
                continue
            asset, (lo, hi) = LOW[pick(rnd, [('grass', 3), ('fern', 3), ('bush', 2), ('stones', 1), ('dry_grass_l', 2), ('rocks_s', 1)])]
            try_low(g, P, asset, x, y, rnd.uniform(lo, hi), structures)


# ── 矮物件成组摆放(11-08 用户「地面摆件、装饰物乱糟糟的没有规律」)──
# 原做法按分区密度均匀撒点 → 每隔 300 就一件、一处混五六种、和环境没关系。改成:
#   1. 树根组:树前脚下 1 中 + 1~2 小(蕨 / 蘑菇 / 草),跟着树种;
#   2. 岩脚组:石头 / 岩块前面碎石 + 枯草;
#   3. 路缘带:沿路两侧离中线 170~230 断续成串的小碎石 / 草叶(一段有一段没有,按沿路噪声);
#   4. 空地草簇:林间空地 / 怪群外圈 3~5 丛草成一簇,圈心留空;
#   5. 林下组:深林 / 林缘少量「灌木 + 两丛蕨 + 草」或「倒木 + 蕨 + 蘑菇」;
#   6. 水边组:蕨 + 小石 + 草。
# 组与组之间留空(地面露出来),一片区域只用两三种主角素材。
LOW_MODE = 'cluster'

# 红蘑菇太跳,只放在林下倒木组里点一下
ROOT_SETS = {
    'pine': [('fern', 3), ('grass', 2)],
    'oak': [('fern', 3), ('bush', 1), ('grass', 2)],
    'autumn': [('fern', 2), ('dry_grass_s', 2), ('grass', 1)],
}


def poisson(rnd, cand_xy, spacing, limit):
    """在候选点里挑互相至少隔 spacing 的点(随机顺序贪心;纵向按 0.8 压扁算距离)。"""
    out = []
    grid = {}
    order = list(range(len(cand_xy)))
    rnd.shuffle(order)
    for i in order:
        x, y = cand_xy[i]
        kx, ky = int(x // spacing), int(y // spacing)
        ok = all((ox - x) ** 2 + ((oy - y) / 0.8) ** 2 >= spacing * spacing
                 for a in range(kx - 1, kx + 2) for b in range(ky - 1, ky + 2) for (ox, oy) in grid.get((a, b), ()))
        if ok:
            out.append((x, y))
            grid.setdefault((kx, ky), []).append((x, y))
            if len(out) >= limit:
                break
    return out


def try_low_group(g, P, asset, x, y, w, structures):
    """同 try_low,但矮物件之间允许互相压 30%(成簇);在树前允许压住树根更多一点。"""
    rect, h = rect_of(asset, x, y, w, 'prop')
    for o in P.near(x, y, 1):
        ov = overlap(rect, o['rect'])
        if o['layer'] == 'low' and ov > 0.3 * min(area(rect), area(o['rect'])):
            return False
        if o['layer'] == 'tall':
            if y > o['y'] - 10 and ov > 0:
                return False
            if y <= o['y'] - 10 and ov > 0.45 * area(rect):
                return False
    for srect in structures:
        if overlap(rect, srect) > 0.05 * area(rect):
            return False
    item = {'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'rect': rect, 'r': 0, 'layer': 'low'}
    if (int(x * 7 + y * 13) // 17) % 2 == 0:
        item['flipX'] = True
    P.low.append(item)
    P.add(item)
    return True


def place_group(g, P, rnd, structures, cx, cy, items, spread):
    """以 (cx, cy) 为中心放一组:第一件(最大)放中心,其余绕着放;每件都过防遮挡检查。"""
    placed = 0
    for k, (name, scale) in enumerate(items):
        asset, (lo, hi) = LOW[name]
        w = rnd.uniform(lo, hi) * scale
        for _ in range(6):
            r = 0 if k == 0 else spread * rnd.uniform(0.45, 1.0)
            a = rnd.uniform(0, math.tau)
            x = cx + math.cos(a) * r
            y = cy + math.sin(a) * r * 0.6
            if abs(x) > MAP_W / 2 - 80 or abs(y) > MAP_H / 2 - 80:
                continue
            i = g.idx(x, y)
            if g.blocked[i] or g.zone[i] in ('road', 'water') or g.d_road[i] < 150:
                continue
            if try_low_group(g, P, asset, x, y, w, structures):
                placed += 1
                break
    return placed


def scatter_clusters(g, P, structures, roads, stands, seed=8):
    rnd = random.Random(seed + 101)
    camp_cores = [(c[5], c[6], 140 + c[3] * 58) for c in V4_CAMPS]
    # 1. 树根组(约 55% 的树)
    for t in list(P.tall):
        if t.get('kind') != 'tree' or rnd.random() > 0.55:
            continue
        kind = 'pine' if 'pine' in t['asset'] else 'autumn' if 'autumn' in t['asset'] else 'oak'
        n = rnd.choice([2, 2, 3])
        names = [pick(rnd, ROOT_SETS[kind]) for _ in range(n)]
        items = [(names[0], 1.0)] + [(nm, 0.75) for nm in names[1:]]
        side = rnd.choice([-1, 1])
        place_group(g, P, rnd, structures, t['x'] + side * t['width'] * rnd.uniform(0.08, 0.22), t['y'] - rnd.uniform(25, 60), items, t['width'] * 0.22)
    # 2. 岩脚组
    rocks = [t for t in P.tall if t.get('kind') == 'rock'] + [s for s in stands if 'rock' in s['asset'] or 'boulder' in s['asset']]
    for r in rocks:
        if rnd.random() > 0.8:
            continue
        items = [(pick(rnd, [('stones', 2), ('rocks_s', 2), ('gravel', 1)]), 0.9), (pick(rnd, [('gravel', 2), ('dry_grass_s', 2), ('grass', 1)]), 0.7)]
        if rnd.random() < 0.5:
            items.append(('dry_grass_s', 0.7))
        place_group(g, P, rnd, structures, r['x'] + rnd.uniform(-0.25, 0.25) * r['width'], r['y'] - 40, items, r['width'] * 0.3)
    # 3. 路缘带:沿每条路两侧,按沿路一维噪声决定哪段有;一段内每 85~120 放一件小东西
    for line in roads:
        for side in (-1, 1):
            phase = rnd.uniform(0, 100)
            acc = 0.0
            for (ax, ay), (bx, by) in zip(line, line[1:]):
                seg = math.hypot(bx - ax, by - ay)
                if seg < 1:
                    continue
                nx, ny = -(by - ay) / seg, (bx - ax) / seg
                t = 0.0
                while t < seg:
                    s_ = acc + t
                    if math.sin(s_ / 260 + phase) + 0.6 * math.sin(s_ / 97 + phase * 1.7) > 0.55:
                        off = rnd.uniform(170, 230)
                        x = ax + (bx - ax) * t / seg + nx * side * off
                        y = ay + (by - ay) * t / seg + ny * side * off
                        if abs(x) < MAP_W / 2 - 80 and abs(y) < MAP_H / 2 - 80:
                            i = g.idx(x, y)
                            if not g.blocked[i] and g.zone[i] not in ('water', 'clearing', 'road'):
                                asset, (lo, hi) = LOW[pick(rnd, [('gravel', 3), ('stones', 3), ('grass', 2), ('dry_grass_s', 2)])]
                                try_low_group(g, P, asset, x, y, rnd.uniform(lo, hi) * 0.7, structures)
                    t += rnd.uniform(85, 120)
                acc += seg
    # 4. 空地草簇:林间空地 / 怪群外圈,圈心留空
    iy, ix = np.where((g.zone == 'clearing') & ~g.blocked)
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::3], ix[::3])]
    for (x, y) in poisson(rnd, cand, 620, 400):
        if any(math.hypot(x - cx, (y - cy) / 0.8) < cr * 0.6 for cx, cy, cr in camp_cores):
            continue
        items = [(pick(rnd, [('grass', 3), ('dry_grass_l', 2)]), 1.0)] + [(pick(rnd, [('grass', 3), ('dry_grass_s', 2)]), 0.75) for _ in range(rnd.choice([2, 3, 4]))]
        place_group(g, P, rnd, structures, x, y, items, 110)
    # 5. 林下组(深林 / 林缘,稀)
    iy, ix = np.where(np.isin(g.zone, ['forest', 'edge']) & ~g.blocked & (g.d_road > 360))
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::5], ix[::5])]
    for (x, y) in poisson(rnd, cand, 950, 500):
        if rnd.random() < 0.35:
            items = [('log', 0.9), ('fern', 0.8), ('mushrooms', 0.8)]
        else:
            items = [('bush', 1.0), ('fern', 0.9), ('fern', 0.75), ('grass', 0.75)]
        place_group(g, P, rnd, structures, x, y, items, 140)
    # 6. 水边组
    iy, ix = np.where((g.zone == 'waterside') & ~g.blocked)
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::3], ix[::3])]
    for (x, y) in poisson(rnd, cand, 700, 200):
        items = [('fern', 1.0), (pick(rnd, [('rocks_s', 2), ('stones', 1)]), 0.8), ('grass', 0.7)]
        place_group(g, P, rnd, structures, x, y, items, 110)


def generate(seed=8):
    roads, areas, flats, river, bridge, stands = build_skeleton()
    camps = build_camps()
    chests, pois, waypoint, spawn, exits, places = build_points()
    rnd = random.Random(seed)
    extra = camp_props(camps, rnd)
    points = [(c['x'], c['y'], 260) for c in chests] + [(p['x'], p['y'], 260) for p in pois] + [(e['x'], e['y'], 320) for e in exits] \
        + [(waypoint['x'], waypoint['y'], 420), (spawn['x'], spawn['y'], 300)]
    # 先不带立物建一次栅格,把压路的立物挪开,再带立物建正式栅格
    g0 = build_grid(roads, areas, flats, river, [], camps, points)
    stands, moved = settle(g0, stands)
    extra, moved2 = settle(g0, extra, stands)
    g = build_grid(roads, areas, flats, river, stands + extra, camps, points)
    g.moved = moved + moved2
    structures = [rect_of(st['asset'], st['x'], st['y'], st['width'], 'prop')[0] for st in stands + extra]
    P = Placed()
    if LOW_MODE == 'cluster':
        # 11-08 第二版:高物件照旧,矮物件改成按环境成组摆;地表贴花全部去掉(落叶 / 裸土交给地表着色器)
        scatter(g, P, structures, seed, layers=('tall',))
        scatter_clusters(g, P, structures, roads, stands + extra, seed)
        P.decal = []
    else:
        dress_camp_rims(g, P, camps, structures, rnd)
        scatter(g, P, structures, seed)
        scatter_decals(g, P)
    return {'roads': roads, 'areas': areas, 'flats': flats, 'river': river, 'bridge': bridge, 'stands': stands + extra,
            'camps': camps, 'chests': chests, 'pois': pois, 'waypoint': waypoint, 'spawn': spawn, 'exits': exits, 'places': places,
            'tall': P.tall, 'low': P.low, 'decals': P.decal}, g


# ── 预览 ──

_IMG = {}


def img(asset):
    if asset not in _IMG:
        _IMG[asset] = load_rgba(asset)
    return _IMG[asset]


def render_preview(L, g, scale=0.1, zones=False, region=None):
    """region = (x0, y0, x1, y1) 世界坐标:只出这一块(局部放大)。"""
    if region:
        rx0, ry0, rx1, ry1 = region
    else:
        rx0, ry0, rx1, ry1 = -MAP_W / 2, -MAP_H / 2, MAP_W / 2, MAP_H / 2
    Wp, Hp = int((rx1 - rx0) * scale), int((ry1 - ry0) * scale)
    canvas = Image.new('RGBA', (Wp, Hp), (70, 96, 54, 255))
    P = lambda x, y: ((x - rx0) * scale, (ry1 - y) * scale)
    ground = img('ui/world/ground_woods3')
    tile = max(1, int(1000 * scale))
    gt = ground.resize((tile, tile))
    ox = int(((-MAP_W / 2 - rx0) * scale) % tile) - tile
    oy = int(((ry1 - MAP_H / 2) * scale) % tile) - tile
    for ty in range(oy, Hp, tile):
        for tx in range(ox, Wp, tile):
            canvas.alpha_composite(gt, (tx, ty)) if tx >= 0 and ty >= 0 else canvas.paste(gt, (tx, ty), gt)

    def visible(x, y, width):
        return rx0 - width * 1.5 < x < rx1 + width * 1.5 and ry0 - width * 2 < y < ry1 + width * 1.5

    def paste(asset, x, y, width, center, flip=False, angle=0):
        if not visible(x, y, width):
            return
        im = img(asset)
        w = max(1, int(width * scale))
        h = max(1, int(width * im.height / im.width * scale))
        im = im.resize((w, h), Image.LANCZOS)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if angle:
            im = im.rotate(angle, expand=True)
        px, py = P(x, y)
        pos = (int(px - im.width / 2), int(py - im.height / 2)) if center else (int(px - im.width / 2), int(py - im.height))
        canvas.paste(im, pos, im) if pos[0] < 0 or pos[1] < 0 else canvas.alpha_composite(im, pos)

    for d in L['decals']:
        paste(d['asset'], d['x'], d['y'], d['width'], True, d.get('flipX'))
    for f in L['flats'] + L['river']:
        paste(f['asset'], f['x'], f['y'], f['width'], True, f.get('flipX'))
    step = 220 * 0.38
    j = 0
    for line in L['roads']:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            n = max(1, round(math.hypot(bx - ax, by - ay) / step))
            for k in range(0 if True else 1, n + 1):
                f = k / n
                paste(V3('road_brush'), ax + (bx - ax) * f, ay + (by - ay) * f, 220 * (0.92 + ((j * 37) % 17) / 100), True, angle=(j * 47) % 360)
                j += 1
    b = L['bridge']
    paste(b['asset'], b['x'], b['y'], b['width'], True)
    stand = [(it['y'], it) for it in L['stands'] + L['tall'] + L['low']]
    for _, it in sorted(stand, key=lambda t: -t[0]):
        paste(it['asset'], it['x'], it['y'], it['width'], False, bool(it.get('flipX')))
    dr = ImageDraw.Draw(canvas)
    for c in L['camps']:
        r = camp_radius(c) * scale
        px, py = P(c['x'], c['y'])
        col = (255, 90, 80, 255) if c['elite'] else (255, 226, 120, 255)
        dr.ellipse([px - r, py - r * 0.8, px + r, py + r * 0.8], outline=col, width=max(1, int(2 * scale / 0.1)))
    if zones:
        zr = np.zeros((g.ny, g.nx, 4), np.uint8)
        for name, col in ZONE_COLOR.items():
            m = g.zone == name
            zr[m, :3] = col
            zr[m, 3] = 120
        zimg = Image.fromarray(zr, 'RGBA')
        # 裁到 region
        gx0 = int((rx0 + MAP_W / 2) / CELL)
        gy0 = int((MAP_H / 2 - ry1) / CELL)
        gx1 = int((rx1 + MAP_W / 2) / CELL)
        gy1 = int((MAP_H / 2 - ry0) / CELL)
        zimg = zimg.crop((gx0, gy0, gx1, gy1)).resize(canvas.size, Image.NEAREST)
        canvas.alpha_composite(zimg)
    return canvas


def stats(L, g):
    tall, low = L['tall'], L['low']
    pairs = 0
    for i, a in enumerate(tall):
        for b2 in tall[i + 1:]:
            if abs(a['x'] - b2['x']) > 900 or abs(a['y'] - b2['y']) > 900:
                continue
            if overlap(a['rect'], b2['rect']) > 0.14 * min(area(a['rect']), area(b2['rect'])) + 1:
                pairs += 1
    by_zone = {}
    tall_ids = {id(t) for t in tall}
    for it in tall + low:
        zz = g.at(it['x'], it['y'])
        by_zone.setdefault(zz, [0, 0])[0 if id(it) in tall_ids else 1] += 1
    return {'tall': len(tall), 'low': len(low), 'decals': len(L['decals']), 'stands': len(L['stands']), 'camps': len(L['camps']),
            'overlap_pairs': pairs, 'by_zone': by_zone}


TS_OUT = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyWoodsLayout.ts')


def short(asset):
    """'ui/world/woods3/w3_x' → 'woods3/w3_x'(TS 里用 worldAsset() 补 /spriteFrame)。"""
    assert asset.startswith('ui/world/'), asset
    return asset[len('ui/world/'):]


def prop_block(it, layer):
    """树:树干挡块(宽 0.22w、深 50);岩块 / 枯树:底座挡块;矮物件不挡路。"""
    if layer != 'tall':
        return None
    w = it['width']
    if it.get('kind') == 'tree':
        return [round(w * 0.22), 50]
    return [round(w * 0.55), 60]


def export_ts(L):
    """写 LobbyWoodsLayout.ts:林地 v4 全部布局数据(LobbyWorldMaps.ts 的 WOODS 段引用)。"""
    assets = []
    index = {}

    def ai(a):
        k = short(a)
        if k not in index:
            index[k] = len(assets)
            assets.append(k)
        return index[k]

    def rows(items, layer):
        out = []
        for it in items:
            blk = prop_block(it, layer)
            row = [ai(it['asset']), it['x'], it['y'], it['width'], 1 if it.get('flipX') else 0]
            if blk:
                row += blk
            out.append(row)
        return out

    decals = rows(L['decals'], 'decal')
    # 立物按脚线从后往前排(只影响初次挂载顺序,渲染层每帧还会按 y 排)
    tall = rows(sorted(L['tall'], key=lambda t: -t['y']), 'tall')
    low = rows(sorted(L['low'], key=lambda t: -t['y']), 'low')

    def obj(it):
        d = {'asset': short(it['asset']), 'x': it['x'], 'y': it['y'], 'width': it['width']}
        for k in ('flat', 'water', 'flipX'):
            if it.get(k):
                d[k] = True
        if it.get('block'):
            d['block'] = it['block']
        return d

    J = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    camps = [[c['code'], c['name'], c['monster'], c['count'], c['level'], c['x'], c['y'], 1 if c['elite'] else 0] for c in L['camps']]
    lines = [
        '/**',
        ' * 村外林地 v4 布局(2026-11-08 用户:镜头拉远 / 地图更大 / 怪更密 / 树不挡人 / 装饰不重叠、分区摆放)。',
        ' * 本文件由 tools/qa/woods_v4_gen.py apply 生成,别手改:改布局改生成器再重跑(之后还要重跑 world_water_blocks.py / export_world_geometry.py)。',
        ' * 物件行 = [素材序号, x, y, 宽, 水平翻转(0/1), 挡块宽?, 挡块深?];素材 = ui/world 下的相对路径。',
        ' */',
        '/* eslint-disable */',
        f'export const WOODS_V4_SIZE = {J({"width": MAP_W, "height": MAP_H})};',
        f'export const WOODS_V4_ASSETS: string[] = {J(assets)};',
        f'export const WOODS_V4_ROADS: number[][][] = {J([[list(p) for p in line] for line in L["roads"]])};',
        f'export const WOODS_V4_AREAS: number[][] = {J([list(a) for a in L["areas"]])};',
        f'export const WOODS_V4_FLATS: Array<{{ asset: string; x: number; y: number; width: number; flat?: boolean; water?: boolean; flipX?: boolean }}> = {J([obj(f) for f in L["flats"] + L["river"]])};',
        f'export const WOODS_V4_BRIDGE = {J(obj(L["bridge"]))};',
        f'export const WOODS_V4_STANDS: Array<{{ asset: string; x: number; y: number; width: number; flipX?: boolean; block?: {{ w: number; d: number }} }}> = {J([obj(s) for s in L["stands"]])};',
        f'export const WOODS_V4_DECALS: number[][] = {J(decals)};',
        f'export const WOODS_V4_TALL: number[][] = {J(tall)};',
        f'export const WOODS_V4_LOW: number[][] = {J(low)};',
        '/** [关卡码, 名字, 怪物, 只数, 等级, x, y, 精英(0/1)] */',
        f'export const WOODS_V4_CAMPS: Array<[string, string, string, number, number, number, number, number]> = {J(camps)};',
        f'export const WOODS_V4_CHESTS = {J(L["chests"])} as const;',
        f'export const WOODS_V4_POIS = {J(L["pois"])} as const;',
        f'export const WOODS_V4_WAYPOINT = {J(L["waypoint"])};',
        f'export const WOODS_V4_SPAWN = {J(L["spawn"])};',
        f'export const WOODS_V4_EXITS = {J(L["exits"])};',
        f'export const WOODS_V4_PLACES = {J(L["places"])};',
        '',
    ]
    with open(TS_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    return TS_OUT


def main():
    os.makedirs(OUT, exist_ok=True)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if cmd == 'apply':
        L, g = generate()
        print(json.dumps(stats(L, g), ensure_ascii=False))
        print(export_ts(L))
        return
    if cmd == 'schematic':
        p = os.path.join(OUT, 'schematic.png')
        schematic(p)
        print(p)
        return
    scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0.1
    L, g = generate()
    print(json.dumps(stats(L, g), ensure_ascii=False))
    with open(os.path.join(OUT, 'woods_v4.json'), 'w', encoding='utf-8') as f:
        json.dump({k: v for k, v in L.items() if k not in ('tall', 'low')} | {
            'tall': [{k: v for k, v in t.items() if k != 'rect'} for t in L['tall']],
            'low': [{k: v for k, v in t.items() if k != 'rect'} for t in L['low']]}, f, ensure_ascii=False)
    if cmd == 'preview':
        render_preview(L, g, scale).convert('RGB').save(os.path.join(OUT, 'preview.png'))
        render_preview(L, g, scale, zones=True).convert('RGB').save(os.path.join(OUT, 'preview_zones.png'))
        print(os.path.join(OUT, 'preview.png'))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
