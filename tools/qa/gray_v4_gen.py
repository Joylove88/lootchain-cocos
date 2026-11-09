# -*- coding: utf-8 -*-
"""灰岩荒原 v4 布局生成(2026-11-08 用户选写实原型 gray_r1;规格对齐村外林地 v4:镜头 1.4、多层地表、成组摆放、投影)。

骨架取自原型 gray_r1(1774×887 原型像素 → 18000×9000 世界单位):
  西:流浪者营地(传送阵)→ 南西:龟裂盆地(狼王)→ 中:干河谷 + 石拱桥 → 北:盗匪哨岗 → 南:盗匪营寨
  → 东北:古遗迹(石像鬼)→ 东南:走私矿坑 → 远东北:碎岩巨像(首领)。
地标件按原生显示尺寸摆(不按地图倍率放大);杂物(枯树 / 岩块 / 枯草 / 碎石)按分区规则成组撒,
防重叠、立物不盖身后的路 / 怪群圈 / 交互点(规则同 woods_v4_gen)。

用法:
  python tools/qa/gray_v4_gen.py preview [--scale 0.08]   预览图到 %TEMP%/lootchain-qa/gray_v4/
  python tools/qa/gray_v4_gen.py schematic                 规划示意图
  python tools/qa/gray_v4_gen.py apply                     写 assets/scripts/scenes/lobby/LobbyGrayLayout.ts
改了布局之后要重跑:world_water_blocks.py(峡谷 / 矿坑挡块)、gray_ground_install.py --mask-only、export_world_geometry.py --node。
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
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'gray_v4')
TS_OUT = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyGrayLayout.ts')

MAP_W, MAP_H = 18000, 9000
PW, PH = 1774, 887  # 原型像素
S = MAP_W / PW
EDGE = 50


def wx(px):
    return round((px - PW / 2) * S)


def wy(py):
    return round((PH / 2 - py) * S)


def P(px, py):
    return wx(px), wy(py)


def G4(name):
    return f'ui/world/gray4/gray4_{name}'


# ── 骨架(原型像素)──
ROADS_PX = [
    [(0, 462), (120, 465), (300, 458), (440, 458), (520, 478), (600, 488), (690, 480), (800, 465), (910, 452), (1010, 440),
     (1170, 425), (1300, 392), (1420, 335), (1520, 268), (1600, 240), (1660, 222)],
    [(440, 458), (415, 540), (380, 630), (330, 690)],          # → 龟裂盆地
    [(700, 480), (745, 405), (790, 335), (835, 300)],          # → 盗匪哨岗
    [(910, 452), (960, 525), (1040, 585), (1065, 612)],        # → 盗匪营寨(北门)
    [(1170, 425), (1162, 370), (1165, 320)],                   # → 古遗迹
    [(1170, 425), (1230, 480), (1280, 525)],                   # → 矿坑西沿
    [(300, 458), (270, 340), (240, 235)],                      # → 西北坡
    [(800, 465), (810, 600), (780, 730)],                      # → 南谷
    [(1500, 315), (1620, 360), (1700, 470)],                   # → 巨像南 / 矿坑东
    [(1010, 440), (1000, 330), (980, 205)],                    # → 北岭
]
# 空地(原型像素 x, y, rx, ry):怪群活动区 / 营地 / 地标前场,地表偏踩实,不撒高物件
AREAS_PX = [
    (175, 430, 100, 55), (300, 700, 150, 85), (850, 262, 80, 50), (1065, 680, 130, 80), (1185, 265, 120, 62),
    (1595, 290, 140, 80), (240, 235, 70, 45), (780, 735, 80, 45), (1700, 480, 70, 45), (980, 205, 75, 45),
    (130, 640, 60, 40), (455, 235, 60, 40), (720, 560, 60, 40),
]
# 干河谷中线(原型像素)与宽度(世界单位;贴图两侧有崖沿,实际不可走宽度按贴图像素算)
GORGE_PX = [(565, -40), (585, 180), (598, 360), (592, 480), (615, 640), (660, 930)]
GORGE_W = 1500
BRIDGE_PX = (594, 486)
QUARRY_PX = (1495, 610)
FORT_PX = (1065, 690)
RUINS_PX = (1185, 268)
COLOSSUS_PX = (1600, 250)
CAMP_PX = (175, 425)  # 营地在主路北侧:帐篷往北延伸,不挡路上的人
WATCH_PX = (850, 262)

# ── 怪群(原型像素坐标):(关卡码, 名字, 怪物, 只数, 等级, px, py, 精英) ──
# 现有 FIELD_GRAY_1 / 2 / 3 / E 沿用关卡码(剧情任务 C102 / C103 按怪物码计数,猎犬 / 剑匪留在西半边)
CAMPS_PX = [
    # 西:营地外 / 西坡 / 盆地(Lv.10~12,荒野猎犬)
    ('FIELD_GRAY_4', '营地外猎犬', 'MEDIUM_DOG', 8, 10, 345, 362, False),
    ('FIELD_GRAY_5', '西坡猎犬', 'MEDIUM_DOG', 8, 10, 128, 640, False),
    ('FIELD_GRAY_8', '西北坡猎犬', 'MEDIUM_DOG', 8, 11, 240, 235, False),
    ('FIELD_GRAY_1', '荒野猎犬群', 'MEDIUM_DOG', 9, 11, 405, 585, False),
    ('FIELD_GRAY_6', '盆地猎犬', 'MEDIUM_DOG', 9, 11, 205, 770, False),
    ('FIELD_GRAY_7', '盆地东猎犬', 'MEDIUM_DOG', 9, 12, 430, 760, False),
    ('FIELD_GRAY_E2', '荒原狼王', 'WHITE_WOLF_KING', 1, 13, 305, 700, True),
    ('FIELD_GRAY_9', '河谷西匪探', 'DAGGER_FEMALE', 8, 12, 455, 235, False),
    # 中:桥东 / 哨岗 / 北岭 / 南谷(Lv.12~14)
    ('FIELD_GRAY_10', '桥头匪探', 'DAGGER_FEMALE', 8, 12, 720, 565, False),
    ('FIELD_GRAY_2', '盗匪哨岗', 'SWORD_MALE', 9, 13, 880, 345, False),
    ('FIELD_GRAY_11', '哨岗弩手', 'CROSSBOW_MALE', 8, 13, 745, 245, False),
    ('FIELD_GRAY_12', '北岭剑匪', 'SWORD_MALE', 8, 14, 980, 205, False),
    ('FIELD_GRAY_13', '南谷匪探', 'DAGGER_FEMALE', 8, 13, 780, 735, False),
    # 南:盗匪营寨(Lv.14~16)
    ('FIELD_GRAY_14', '营寨西剑匪', 'SWORD_MALE', 9, 14, 890, 650, False),
    ('FIELD_GRAY_16', '营寨北弓手', 'BOW_MALE', 8, 15, 1215, 505, False),
    ('FIELD_GRAY_3', '盗匪营地', 'BOW_MALE', 9, 15, 1065, 700, False),
    ('FIELD_GRAY_15', '营寨东锤匪', 'BLUNT_MALE', 9, 16, 1250, 760, False),
    # 东北:古遗迹(Lv.16~17,石像鬼)
    ('FIELD_GRAY_17', '遗迹西石像鬼', 'GARGOYLE', 5, 16, 1030, 335, False),
    ('FIELD_GRAY_E', '石像鬼', 'GARGOYLE', 1, 17, 1185, 262, True),
    ('FIELD_GRAY_18', '遗迹东石像鬼', 'GARGOYLE', 5, 17, 1330, 255, False),
    # 东南:走私矿坑(Lv.17~18)
    ('FIELD_GRAY_19', '矿坑矛匪', 'SPEAR_MALE', 9, 17, 1280, 585, False),
    ('FIELD_GRAY_20', '矿坑弩手', 'CROSSBOW_MALE', 8, 17, 1470, 455, False),
    ('FIELD_GRAY_21', '矿坑东矛匪', 'SPEAR_MALE', 9, 18, 1705, 640, False),
    ('FIELD_GRAY_22', '矿坑南锤匪', 'BLUNT_MALE', 9, 18, 1465, 790, False),
    # 远东北:碎岩巨像(Lv.18~20)
    ('FIELD_GRAY_23', '巨像外围石像鬼', 'GARGOYLE', 5, 18, 1700, 480, False),
    ('FIELD_GRAY_24', '巨像西石像鬼', 'GARGOYLE', 5, 19, 1400, 220, False),
    ('FIELD_GRAY_B', '碎岩巨像', 'ROCK_GOLEM', 1, 20, 1585, 300, True),
    # 11-08 第 2 章剧情精英(C208):另一位宿主「影」,矿坑东北沿
    ('FIELD_GRAY_S', '宿主 · 影', 'CROW_REAPER', 1, 18, 1590, 505, True),
]

# 荒原营地 NPC(11-08 第 2 章:流浪者联盟首领在营地接 / 交任务,不用来回跑王都):相对营地中心的世界偏移
NPCS_WORLD_OFFSET = [('WANDERER', '流浪者首领 · 葛兰', 'ui/world/city4/city4_npc_wanderer', -330, 40, 1)]

CHESTS_PX = [
    ('GRAY_W1', '荒原木箱', 'WOOD', 70, 380),
    ('GRAY_W2', '荒原木箱', 'WOOD', 700, 700),
    ('GRAY_W3', '荒原木箱', 'WOOD', 1360, 840),
    ('GRAY_I1', '狼王铁箱', 'IRON', 360, 790),
    ('GRAY_I2', '遗迹铁箱', 'IRON', 1265, 325),
    ('GRAY_S1', '秘藏宝箱', 'SECRET', 40, 835),
    ('GRAY_B1', '首领宝箱', 'BOSS', 1700, 330),
]
POIS_PX = [
    ('G_HIDDEN_1', 'HIDDEN', '峡谷边的旧背包', 655, 700),
    ('G_HIDDEN_2', 'HIDDEN', '哨塔下的暗格', 905, 240),
    ('G_HIDDEN_3', 'HIDDEN', '巨像掌心', 1500, 300),
    ('G_STELE_1', 'STELE', '荒原古碑', 1115, 330),
    ('G_HERB_1', 'HERB', '荒原草药', 200, 830),
    ('G_ORE_1', 'ORE', '矿脉', 1360, 650),
    ('G_ORE_2', 'ORE', '矿脉', 1620, 735),
    ('G_ORE_3', 'ORE', '矿脉', 1560, 495),
]
# 运行时 snapPois 挪过的兴趣点坐标写回这里(实机 [POI] 日志),服务端坐标表才对得上
POI_FIX = {  # 11-08 实机
    'G_HIDDEN_1': (-1984, -2496),
    'G_HIDDEN_2': (63, 2065),
    'G_HERB_1': (-6971, -4090),
    'G_ORE_3': (6631, -662),  # 11-09 实机(装饰按原型重摆后被挪)
}

PLACES_PX = [('流浪者营地', 'portal', 175, 425), ('龟裂盆地', 'den', 300, 700), ('盗匪哨岗', 'camp', 850, 262),
             ('盗匪营寨', 'camp', 1065, 680), ('古遗迹', 'ruins', 1185, 265), ('走私矿坑', 'cave', 1495, 610),
             ('碎岩巨像', 'ruins', 1595, 290)]

# ── 物件表(世界单位显示宽)──
TALL = {
    'pillar': (G4('rock_pillar'), (420, 560)),
    'boulders_l': (G4('boulders_l'), (400, 600)),
    'boulders_m': (G4('boulders_m'), (240, 360)),
    'dead_tree': ('ui/world/fld_dead_tree', (320, 420)),
}
LOW = {
    'grass': (G4('dry_grass'), (110, 160)),
    'scrub': (G4('scrub'), (170, 240)),
    'stones': (G4('stones'), (130, 180)),
    'bones': (G4('bones'), (240, 320)),
}

ZONES = {
    # 名称: (说明, 高物件表, 高物件密度) 密度 = 每 100 万平方世界单位;矮物件改为成组摆放(scatter_clusters)
    'road': ('路面', [], 0),
    'shoulder': ('路肩(离路 130~320)', [], 0),
    'plain': ('荒原平地:稀疏枯树 / 岩块,大片留白给地表材质', [('dead_tree', 3), ('boulders_m', 2), ('boulders_l', 2), ('pillar', 1)], 0.24),
    'clearing': ('空地 / 怪群活动区', [], 0),
    'gorge': ('河谷(挡路)', [], 0),
    'rim': ('河谷崖沿(离谷 0~600):岩块 / 枯树', [('boulders_m', 2), ('boulders_l', 2), ('dead_tree', 1)], 0.9),
    'rocky': ('岩区(上下边缘 / 巨像北坡):石柱 / 大岩', [('pillar', 3), ('boulders_l', 3), ('boulders_m', 1), ('dead_tree', 1)], 1.0),
    'ruins': ('遗迹外圈', [('boulders_m', 2)], 0.4),
    'quarry': ('矿坑外圈:碎石堆为主', [('boulders_m', 2), ('boulders_l', 1)], 0.6),
}
ZONE_COLOR = {
    'road': (214, 186, 130), 'shoulder': (236, 214, 160), 'plain': (150, 140, 120), 'clearing': (250, 238, 120),
    'gorge': (60, 60, 70), 'rim': (120, 110, 100), 'rocky': (160, 150, 150), 'ruins': (190, 140, 230), 'quarry': (110, 110, 150),
}
THEMES_PX = {
    'rocky': [(887, 30, 1000, 70), (887, 870, 1000, 60), (1450, 60, 260, 60), (60, 140, 120, 90), (1740, 820, 120, 80)],
    'ruins': [(1185, 268, 210, 110)],
    'quarry': [(1495, 610, 300, 170)],
}


_ASPECT = {}


def load_rgba(asset):
    path = os.path.join(RES, asset + '.png')
    if not os.path.exists(path):
        # 素材还没入库时用占位比例(预览画框)
        return None
    return Image.open(path).convert('RGBA')


PLACEHOLDER_ASPECT = {
    'tent_a': 0.8, 'tent_b': 0.8, 'wagon': 0.7, 'cart': 0.65, 'crates': 0.8, 'fence': 0.45, 'campfire': 0.6, 'watchtower': 1.5,
    'barricade': 0.5, 'palisade_wall': 0.5, 'palisade_gate': 0.6, 'palisade_tower': 1.45, 'bandit_tent': 0.75, 'arch_ruin': 0.66,
    'arch_ruin_b': 0.6, 'column': 2.2, 'fallen_column': 0.45, 'ruins_floor': 0.6, 'colossus_head': 0.8, 'colossus_body': 0.55,
    'standing_stone': 2.0, 'quarry_pit': 0.6, 'scaffold': 0.9, 'ore_cart': 0.5, 'spoil_heap': 0.6, 'crystal_cluster': 0.9,
    'gorge_a': 1.5, 'gorge_b': 1.5, 'bridge': 0.55, 'mesa': 0.5, 'rock_pillar': 1.5, 'boulders_l': 0.6, 'boulders_m': 0.7,
    'scrub': 0.8, 'dry_grass': 0.75, 'stones': 0.6, 'bones': 0.6,
}


def aspect(asset):
    if asset not in _ASPECT:
        im = load_rgba(asset)
        if im is not None:
            _ASPECT[asset] = im.height / im.width
        else:
            _ASPECT[asset] = PLACEHOLDER_ASPECT.get(asset.split('gray4_')[-1], 0.8)
    return _ASPECT[asset]


# ── 骨架 / 地标 ──

def gorge_segments():
    """沿河谷中线按段长串贴图(两种段交替、偶数段水平翻转),段间重叠 12% 盖住接缝。"""
    line = [P(x, y) for x, y in GORGE_PX]
    segs = []
    k = 0
    for (ax, ay), (bx, by) in zip(line, line[1:]):
        pass
    # 沿折线按弧长取段中心
    total = sum(math.hypot(bx - ax, by - ay) for (ax, ay), (bx, by) in zip(line, line[1:]))
    s = 0.0
    while s < total + 200:
        names = ['gorge_a', 'gorge_b']
        asset = G4(names[k % 2])
        h = GORGE_W * aspect(asset)
        pos = point_at(line, min(total, s + h / 2))
        segs.append({'asset': asset, 'x': round(pos[0]), 'y': round(pos[1]), 'width': GORGE_W, 'flat': True, 'gorge': True,
                     'flipX': k % 4 in (2, 3)})
        s += h * 0.88
        k += 1
    return segs


def point_at(line, s):
    for (ax, ay), (bx, by) in zip(line, line[1:]):
        L = math.hypot(bx - ax, by - ay)
        if s <= L:
            t = s / max(1, L)
            return ax + (bx - ax) * t, ay + (by - ay) * t
        s -= L
    return line[-1]


def ellipse_ring(cx, cy, rx, ry, n, a0=0.0, skip=None):
    out = []
    for i in range(n):
        a = a0 + i * math.tau / n
        if skip and skip[0] <= (math.degrees(a) % 360) <= skip[1]:
            continue
        out.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry))
    return out


def blk(w, d):
    return {'w': round(w), 'd': round(d)}


def landmarks():
    """返回 (flats 贴地件, stands 立物);立物带挡块(底座矩形)。"""
    flats, stands = [], []

    def st(name, x, y, w, block=None, flip=False):
        it = {'asset': G4(name), 'x': round(x), 'y': round(y), 'width': round(w)}
        if block:
            it['block'] = block
        if flip:
            it['flipX'] = True
        stands.append(it)

    # 流浪者营地(传送阵在营地中央的石圈)
    cx, cy = P(*CAMP_PX)
    st('tent_a', cx - 620, cy + 300, 540, blk(360, 110))
    st('tent_b', cx + 160, cy + 420, 580, blk(400, 120))
    st('wagon', cx + 820, cy + 220, 500, blk(340, 90))
    st('wagon', cx - 1080, cy + 40, 480, blk(320, 90), flip=True)
    st('cart', cx + 700, cy - 120, 330, blk(220, 70))
    st('crates', cx - 220, cy + 520, 260, blk(190, 60))
    st('crates', cx + 560, cy + 640, 240, blk(170, 60), flip=True)
    st('campfire', cx + 380, cy + 60, 280)
    for i, dx in enumerate((-820, -320, 180, 680)):
        st('fence', cx + dx, cy + 760 + (i % 2) * 30, 460, blk(400, 40), flip=i % 2 == 1)
    # 盗匪哨岗
    ax, ay = P(*WATCH_PX)
    st('watchtower', ax + 40, ay + 160, 560, blk(260, 110))
    st('barricade', ax - 520, ay - 60, 340, blk(280, 50))
    st('barricade', ax + 520, ay - 40, 340, blk(280, 50), flip=True)
    st('crates', ax - 260, ay + 260, 240, blk(170, 60))
    # 盗匪营寨:北面一排木栅(正中北门)+ 两角角楼 + 两侧望楼 / 拒马;南面敞开(南墙会挡住寨内的人;
    # 侧墙在斜俯视里是竖条,横向木栅贴图摆不出来)
    fx, fy = P(*FORT_PX)
    rx, ry = 1350, 780
    wall_w = 640
    n = int(rx * 2 // (wall_w * 0.92))
    for k in range(n + 1):
        x = fx - rx + k * wall_w * 0.92
        if abs(x - fx) < wall_w * 0.75:
            continue  # 北门位置
        st('palisade_wall', x, fy + ry, wall_w, blk(wall_w * 0.9, 70), flip=k % 2 == 1)
    st('palisade_gate', fx, fy + ry - 10, 780, None)
    st('palisade_tower', fx - rx - 120, fy + ry - 40, 380, blk(200, 80))
    st('palisade_tower', fx + rx + 120, fy + ry - 40, 380, blk(200, 80), flip=True)
    st('palisade_tower', fx - rx - 60, fy + 60, 360, blk(190, 80))
    st('palisade_tower', fx + rx + 60, fy + 80, 360, blk(190, 80), flip=True)
    for sx in (-1, 1):
        st('barricade', fx + sx * (rx + 40), fy + 420, 330, blk(270, 50), flip=sx > 0)
        st('barricade', fx + sx * (rx - 80), fy - 330, 340, blk(280, 50), flip=sx < 0)
    st('bandit_tent', fx - 520, fy + 260, 480, blk(330, 100))
    st('bandit_tent', fx + 480, fy + 300, 460, blk(320, 100), flip=True)
    st('bandit_tent', fx + 60, fy + 470, 500, blk(340, 100))
    st('campfire', fx - 40, fy - 60, 260)
    st('crates', fx + 760, fy + 80, 250, blk(180, 60))
    # 古遗迹
    rx0, ry0 = P(*RUINS_PX)
    flats.append({'asset': G4('ruins_floor'), 'x': rx0 + 60, 'y': ry0 + 60, 'width': 3000, 'flat': True})
    st('arch_ruin', rx0 - 380, ry0 + 380, 1180, blk(840, 100))
    st('arch_ruin_b', rx0 + 760, ry0 + 280, 1100, blk(780, 100))
    st('column', rx0 - 1080, ry0 + 120, 320, blk(140, 50))
    st('column', rx0 + 1200, ry0 - 80, 300, blk(130, 50))
    st('fallen_column', rx0 + 520, ry0 - 420, 540, blk(460, 60))
    st('fallen_column', rx0 - 760, ry0 - 330, 520, blk(440, 60), flip=True)
    # 碎岩巨像:巨像残躯横在场北,身边一圈立石(西南方留口给路)
    kx, ky = P(*COLOSSUS_PX)
    st('colossus_body', kx - 250, ky + 300, 2300, blk(1700, 280))
    st('colossus_head', kx + 1150, ky - 60, 900, blk(620, 180))
    for x, y in ellipse_ring(kx, ky + 120, 1900, 1050, 14, 0.15, skip=(185, 275)):
        st('standing_stone', x, y, 230, blk(100, 40))
    # 走私矿坑:坑本身贴地(坑心不可走,挡块由 world_water_blocks 按贴图算),外圈脚手架 / 矿车 / 碎石堆 / 矿晶
    qx, qy = P(*QUARRY_PX)
    flats.append({'asset': G4('quarry_pit'), 'x': qx, 'y': qy, 'width': 3700, 'flat': True, 'pit': True})
    st('scaffold', qx - 1650, qy + 320, 640, blk(420, 110))
    st('scaffold', qx + 1450, qy + 560, 620, blk(400, 110), flip=True)
    st('ore_cart', qx - 950, qy - 820, 320, blk(240, 60))
    st('ore_cart', qx + 820, qy - 900, 310, blk(230, 60), flip=True)
    st('spoil_heap', qx - 1900, qy - 260, 440, blk(330, 90))
    st('spoil_heap', qx + 1850, qy - 160, 420, blk(310, 90), flip=True)
    for dx, dy, w in ((-420, -980, 300), (1120, 820, 290), (-1350, 720, 280), (1900, 380, 270)):
        st('crystal_cluster', qx + dx, qy + dy, w, blk(160, 50))
    # 上边缘崖台(挡路,地图北界看起来是山而不是空地);下边缘只放矮岩群(人走在它后面不被挡)
    x = -MAP_W / 2 + 300
    rnd = random.Random(31)
    gx_top, gx_bot = wx(GORGE_PX[0][0]), wx(GORGE_PX[-1][0])
    while x < MAP_W / 2:
        w = rnd.uniform(1300, 1700)
        if abs(x + w / 2 - gx_top) < GORGE_W * 0.5 + w * 0.5:
            x += w * 0.82
            continue
        st('mesa', x + w / 2, MAP_H / 2 - 260 - rnd.uniform(0, 160), w, blk(w * 0.85, 140), flip=rnd.random() < 0.5)
        x += w * 0.82
    x = -MAP_W / 2 + 200
    while x < MAP_W / 2:
        kind = rnd.choice(['boulders_l', 'boulders_l', 'boulders_m', 'rock_pillar'])
        w = rnd.uniform(420, 640) if kind != 'boulders_m' else rnd.uniform(280, 380)
        if kind == 'rock_pillar':
            w = rnd.uniform(380, 480)
        if abs(x + w / 2 - gx_bot) < GORGE_W * 0.5 + w * 0.5:
            x += w
            continue
        st(kind, x + w / 2, -MAP_H / 2 + 90 + rnd.uniform(0, 260), w, blk(w * 0.65, 80), flip=rnd.random() < 0.5)
        x += w * rnd.uniform(0.75, 1.6) + (rnd.uniform(200, 700) if rnd.random() < 0.3 else 0)
    flats += gorge_segments()
    bx, by = P(*BRIDGE_PX)
    bridge = {'asset': G4('bridge'), 'x': bx, 'y': by, 'width': 1900, 'flat': True}
    return flats, stands, bridge


def build_skeleton():
    roads = [[P(x, y) for x, y in line] for line in ROADS_PX]
    areas = [(wx(x), wy(y), round(rx * S), round(ry * S)) for x, y, rx, ry in AREAS_PX]
    flats, stands, bridge = landmarks()
    return roads, areas, flats, stands, bridge


def build_camps():
    return [{'code': c, 'name': n, 'monster': m, 'count': k, 'level': lv, 'x': wx(px), 'y': wy(py), 'elite': e}
            for c, n, m, k, lv, px, py, e in CAMPS_PX]


def camp_radius(c):
    if c['code'].endswith('_B'):
        return 120
    if c['elite']:
        return 90
    return 170 if c['count'] <= 3 else 140 + c['count'] * 58


def build_points():
    chests = [{'code': c, 'label': n, 'kind': k, 'x': wx(x), 'y': wy(y)} for c, n, k, x, y in CHESTS_PX]
    pois = [{'code': c, 'kind': k, 'name': n, 'x': wx(x), 'y': wy(y)} for c, k, n, x, y in POIS_PX]
    for p in pois:
        if p['code'] in POI_FIX:
            p['x'], p['y'] = POI_FIX[p['code']]
    cx, cy = P(*CAMP_PX)
    waypoint = {'x': cx - 60, 'y': cy - 40}
    spawn = {'x': cx + 120, 'y': cy - 260}
    exits = [{'key': 'to_city', 'label': '返回 · 主城', 'x': -MAP_W // 2 + 140, 'y': wy(462), 'radius': 130,
              'toMap': 'CITY', 'toSpawn': {'x': 6000, 'y': -12}}]  # 11-09 主城 P1 东门内
    places = [{'name': n, 'x': wx(x), 'y': wy(y), 'icon': ic} for n, ic, x, y in PLACES_PX]
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
        self.zone = np.full((self.ny, self.nx), 'plain', dtype=object)
        self.blocked = np.zeros((self.ny, self.nx), bool)
        self.edge = np.zeros((self.ny, self.nx), bool)

    def idx(self, x, y):
        ix = int((x + MAP_W / 2) // CELL)
        iy = int((MAP_H / 2 - y) // CELL)
        return min(max(iy, 0), self.ny - 1), min(max(ix, 0), self.nx - 1)

    def at(self, x, y):
        return self.zone[self.idx(x, y)]


def seg_dist(X, Y, lines):
    best = np.full(X.shape, 1e9, np.float32)
    for line in lines:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / max(1.0, dx * dx + dy * dy), 0, 1)
            best = np.minimum(best, np.hypot(X - ax - dx * t, Y - ay - dy * t))
    return best


def ell_mask(g, lst_px):
    m = np.zeros(g.zone.shape, bool)
    for x, y, rx, ry in lst_px:
        m |= ((g.X - wx(x)) / (rx * S)) ** 2 + ((g.Y - wy(y)) / (ry * S)) ** 2 <= 1
    return m


def build_grid(roads, areas, flats, stands, camps, points):
    g = Grid()
    g.d_road = seg_dist(g.X, g.Y, roads)
    gorge_line = [P(x, y) for x, y in GORGE_PX]
    d_gorge = seg_dist(g.X, g.Y, [gorge_line])
    g.d_gorge = d_gorge
    gorge = d_gorge <= GORGE_W * 0.36
    ell = np.zeros(g.zone.shape, bool)
    for x, y, rx, ry in areas:
        ell |= ((g.X - x) / rx) ** 2 + ((g.Y - y) / ry) ** 2 <= 1
    campz = np.zeros(g.zone.shape, bool)
    for c in camps:
        campz |= np.hypot(g.X - c['x'], (g.Y - c['y']) / 0.8) <= camp_radius(c) * 0.85 + 60
    z = g.zone
    z[:] = 'plain'
    for name in ('rocky', 'ruins', 'quarry'):
        z[ell_mask(g, THEMES_PX[name])] = name
    z[(d_gorge > GORGE_W * 0.36) & (d_gorge <= GORGE_W * 0.36 + 600)] = 'rim'
    z[ell | campz] = 'clearing'
    z[(g.d_road > 130) & (g.d_road <= 320)] = 'shoulder'
    z[g.d_road <= 130] = 'road'
    z[gorge] = 'gorge'
    g.campz = campz
    g.blocked |= gorge
    # 矿坑坑心 / 立物贴图范围 / 交互点不放东西
    qx, qy = P(*QUARRY_PX)
    g.pit = ((g.X - qx) / 1500) ** 2 + ((g.Y - qy) / 760) ** 2 <= 1
    g.blocked |= g.pit
    for it in stands:
        w = it['width']
        h = w * aspect(it['asset'])
        g.blocked |= (np.abs(g.X - it['x']) < w * 0.5) & (g.Y > it['y'] - 60) & (g.Y < it['y'] + h * 0.9)
    for f in flats:
        if f.get('gorge') or f.get('pit'):
            continue
        w = f['width']
        h = w * aspect(f['asset'])
        m = ((g.X - f['x']) / (w * 0.46)) ** 2 + ((g.Y - f['y']) / (h * 0.44)) ** 2 <= 1
        z[m & (z != 'road') & (z != 'gorge')] = 'clearing'
    for px, py, pr in points:
        g.blocked |= np.hypot(g.X - px, g.Y - py) <= pr
    g.edge = (np.abs(g.X) > MAP_W / 2 - EDGE - 40) | (np.abs(g.Y) > MAP_H / 2 - EDGE - 40)
    return g


# ── 摆放(规则同 woods_v4_gen)──

class Placed:
    def __init__(self):
        self.tall, self.low, self.buckets = [], [], {}

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


def rect_of(asset, x, y, w):
    h = w * aspect(asset)
    return (x - w * 0.46, y, x + w * 0.46, y + h * 0.92), h


def overlap(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy


def area(r):
    return max(1.0, (r[2] - r[0]) * (r[3] - r[1]))


PROTECT = {'road', 'clearing', 'gorge'}
ROAD_COVER_MIN = 220


def cover_ok(g, rect, base_y):
    """高物件贴图里脚线后方不能有路 / 空地 / 河谷 / 交互点(人走到那里会被挡住)。"""
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
    w = r[2] - r[0]
    h = r[3] - r[1]
    return r[0] + w * 0.2 < px < r[2] - w * 0.2 and r[1] - 30 < py < r[1] + h * 0.75


def try_tall(g, Pl, asset, x, y, w, kind, structures):
    rect, h = rect_of(asset, x, y, w)
    if not cover_ok(g, rect, y):
        return False
    r_base = w * (0.22 if kind == 'tree' else 0.32)
    for o in Pl.near(x, y, 1):
        if o['layer'] != 'tall':
            continue
        if math.hypot(o['x'] - x, o['y'] - y) < r_base + o['r'] + 80:
            return False
        if overlap(rect, o['rect']) > 0.08 * min(area(rect), area(o['rect'])):
            return False
        if core_hit(x, y, o['rect']) or core_hit(o['x'], o['y'], rect):
            return False
    for srect in structures:
        if overlap(rect, srect) > 0.02 * area(rect):
            return False
    item = {'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'rect': rect, 'r': r_base, 'layer': 'tall', 'kind': kind}
    if (int(x * 3 + y * 7) // 11) % 2 == 0:
        item['flipX'] = True
    Pl.tall.append(item)
    Pl.add(item)
    return True


def try_low(g, Pl, asset, x, y, w, structures, group_overlap=0.3):
    rect, h = rect_of(asset, x, y, w)
    for o in Pl.near(x, y, 1):
        ov = overlap(rect, o['rect'])
        if o['layer'] == 'low' and ov > group_overlap * min(area(rect), area(o['rect'])):
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
    Pl.low.append(item)
    Pl.add(item)
    return True


def pick(rnd, table):
    tot = sum(wt for _, wt in table)
    v = rnd.random() * tot
    for name, wt in table:
        v -= wt
        if v <= 0:
            return name
    return table[-1][0]


def poisson(rnd, cand, spacing, limit):
    out, grid = [], {}
    order = list(range(len(cand)))
    rnd.shuffle(order)
    for i in order:
        x, y = cand[i]
        kx, ky = int(x // spacing), int(y // spacing)
        if all((ox - x) ** 2 + ((oy - y) / 0.8) ** 2 >= spacing * spacing
               for a in range(kx - 1, kx + 2) for b in range(ky - 1, ky + 2) for (ox, oy) in grid.get((a, b), ())):
            out.append((x, y))
            grid.setdefault((kx, ky), []).append((x, y))
            if len(out) >= limit:
                break
    return out


def place_group(g, Pl, rnd, structures, cx, cy, items, spread):
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
            if g.blocked[i] or g.zone[i] in ('road', 'gorge') or g.d_road[i] < 150:
                continue
            if try_low(g, Pl, asset, x, y, w, structures):
                break


TALL_DARTS = 30.0


def scatter_tall(g, Pl, structures, seed):
    rnd = random.Random(seed)
    for name, (desc, table, dens) in ZONES.items():
        if not table or dens <= 0:
            continue
        iy, ix = np.where((g.zone == name) & ~g.blocked & ~g.edge)
        if len(iy) == 0:
            continue
        n = int(len(iy) * CELL * CELL / 1e6 * dens * TALL_DARTS)
        for _ in range(n):
            k = rnd.randrange(len(iy))
            x = float(g.X[iy[k], ix[k]]) + rnd.uniform(-CELL / 2, CELL / 2)
            y = float(g.Y[iy[k], ix[k]]) + rnd.uniform(-CELL / 2, CELL / 2)
            kind = pick(rnd, table)
            asset, (lo, hi) = TALL[kind]
            try_tall(g, Pl, asset, x, y, rnd.uniform(lo, hi), 'tree' if kind == 'dead_tree' else 'rock', structures)


def scatter_clusters(g, Pl, structures, roads, stands, camps, seed):
    """矮物件成组:岩脚组(碎石 + 枯草)、枯树根组(枯草 + 灌丛)、路缘断续碎石带、空地草簇(圈心留空)、平地灌丛组、骨堆点缀。"""
    rnd = random.Random(seed + 101)
    cores = [(c['x'], c['y'], camp_radius(c)) for c in camps]
    rocks = [t for t in Pl.tall if t['kind'] == 'rock'] + [s for s in stands if any(k in s['asset'] for k in ('boulders', 'pillar', 'mesa', 'stone'))]
    for r in rocks:
        if rnd.random() > 0.75:
            continue
        items = [('stones', 0.9), (pick(rnd, [('grass', 2), ('scrub', 1)]), 0.8)]
        if rnd.random() < 0.5:
            items.append(('grass', 0.7))
        place_group(g, Pl, rnd, structures, r['x'] + rnd.uniform(-0.25, 0.25) * r['width'], r['y'] - 40, items, r['width'] * 0.3)
    for t in [t for t in Pl.tall if t['kind'] == 'tree']:
        if rnd.random() > 0.6:
            continue
        place_group(g, Pl, rnd, structures, t['x'] + rnd.uniform(-0.15, 0.15) * t['width'], t['y'] - 40,
                    [('grass', 1.0), (pick(rnd, [('scrub', 2), ('stones', 1)]), 0.8)], t['width'] * 0.25)
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
                    if math.sin(s_ / 300 + phase) + 0.6 * math.sin(s_ / 110 + phase * 1.7) > 0.75:
                        off = rnd.uniform(170, 240)
                        x = ax + (bx - ax) * t / seg + nx * side * off
                        y = ay + (by - ay) * t / seg + ny * side * off
                        if abs(x) < MAP_W / 2 - 80 and abs(y) < MAP_H / 2 - 80:
                            i = g.idx(x, y)
                            if not g.blocked[i] and g.zone[i] not in ('gorge', 'clearing', 'road'):
                                asset, (lo, hi) = LOW[pick(rnd, [('stones', 3), ('grass', 2)])]
                                try_low(g, Pl, asset, x, y, rnd.uniform(lo, hi) * 0.7, structures)
                    t += rnd.uniform(110, 160)
                acc += seg
    iy, ix = np.where((g.zone == 'clearing') & ~g.blocked)
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::3], ix[::3])]
    for (x, y) in poisson(rnd, cand, 700, 300):
        if any(math.hypot(x - cx, (y - cy) / 0.8) < cr * 0.6 for cx, cy, cr in cores):
            continue
        items = [('grass', 1.0)] + [(pick(rnd, [('grass', 3), ('stones', 1)]), 0.75) for _ in range(rnd.choice([1, 2, 3]))]
        place_group(g, Pl, rnd, structures, x, y, items, 110)
    iy, ix = np.where(np.isin(g.zone, ['plain', 'rim', 'rocky', 'quarry', 'ruins']) & ~g.blocked & (g.d_road > 360))
    cand = [(float(g.X[i, j]), float(g.Y[i, j])) for i, j in zip(iy[::5], ix[::5])]
    for (x, y) in poisson(rnd, cand, 900, 700):
        roll = rnd.random()
        if roll < 0.06:
            items = [('bones', 1.0), ('stones', 0.8)]
        elif roll < 0.55:
            items = [('scrub', 1.0), ('grass', 0.85), ('grass', 0.7)]
        else:
            items = [('grass', 1.0), ('grass', 0.8), ('stones', 0.8)]
        place_group(g, Pl, rnd, structures, x, y, items, 140)


def stand_ok(g, asset, x, y, w):
    i = g.idx(x, y)
    if 'palisade_gate' in asset:
        return True  # 门楼本来就跨在路上(挡块只给两侧门楼底座)
    if g.d_road[i] <= 170 or g.zone[i] == 'gorge':
        return False
    return True


CAMP_THEME = {
    # 怪群外圈主题件(放在活动圈外沿,不进圈心):(素材, 宽, 挡块?)
    'MEDIUM_DOG': [('bones', 300, False), ('stones', 160, False)],
    'WHITE_WOLF_KING': [('bones', 340, False), ('bones', 280, False)],
    'DAGGER_FEMALE': [('crates', 240, True), ('campfire', 240, False)],
    'SWORD_MALE': [('barricade', 320, True), ('crates', 240, True)],
    'CROSSBOW_MALE': [('barricade', 320, True), ('crates', 230, True)],
    'BOW_MALE': [('bandit_tent', 420, True), ('crates', 240, True)],
    'BLUNT_MALE': [('crates', 250, True), ('barricade', 320, True)],
    'SPEAR_MALE': [('spoil_heap', 380, True), ('ore_cart', 300, True)],
    'GARGOYLE': [('fallen_column', 480, True), ('standing_stone', 220, True)],
}


def camp_props(camps, rnd):
    out = []
    for c in camps:
        if c['elite'] or c['monster'] not in CAMP_THEME:
            continue
        r = camp_radius(c)
        a0 = rnd.uniform(0, math.tau)
        for i, (name, w, block) in enumerate(CAMP_THEME[c['monster']]):
            a = a0 + i * 2.4
            it = {'asset': G4(name), 'x': round(c['x'] + math.cos(a) * (r + 80)), 'y': round(c['y'] + math.sin(a) * (r + 60) * 0.8),
                  'width': w, 'theme': True}
            if block:
                it['block'] = blk(w * 0.6, 60)
            if rnd.random() < 0.5:
                it['flipX'] = True
            out.append(it)
    return out


# ── GPT 原型手摆(11-08 用户「装饰摆放还是不够好,让 GPT 出原型图,然后照着摆放」)──
# tools/qa/deco_proto.py 出原型 → 读组位置写 tools/qa/deco_hand/<图>_<区块>.json;该区块里的随机散布全部换成这些组。
# 组合模板:(件, 宽, dx, dy, 高物件?) dx / dy 为相对组脚点的世界偏移
DECO_KITS = {
    # 11-08 第一张原型对比:GPT 画的组比我们的显示宽大约 1.3 倍、每组草 / 碎石更多 → 按原型放大、补点缀
    'rockL': [('boulders_l', 700, 0, 0, True), ('dry_grass', 150, -330, -40, False), ('dry_grass', 130, 300, -80, False),
              ('dry_grass', 110, -120, -120, False), ('stones', 170, 170, -140, False), ('stones', 140, -260, -150, False)],
    'rockM': [('boulders_m', 430, 0, 0, True), ('dry_grass', 140, -230, -30, False), ('dry_grass', 115, 210, -40, False),
              ('stones', 150, 120, -110, False)],
    'tree': [('dead_tree', 500, 0, 0, True), ('scrub', 250, 220, -40, False), ('dry_grass', 140, -200, -50, False),
             ('dry_grass', 115, 90, -110, False), ('stones', 130, -90, -120, False)],
    'scrub': [('scrub', 280, 0, 0, False), ('dry_grass', 140, -150, -30, False), ('dry_grass', 120, 140, -60, False)],
    'bones': [('bones', 360, 0, 0, False), ('dry_grass', 130, 200, -20, False), ('dry_grass', 110, -180, -60, False),
              ('stones', 140, -60, -100, False)],
    'spoil': [('spoil_heap', 520, 0, 0, True), ('stones', 170, -260, -40, False), ('stones', 140, 240, -70, False)],
    'cart': [('cart', 360, 0, 0, True), ('crates', 240, 190, -30, True), ('dry_grass', 120, -160, -40, False)],
    'pebbles': [('stones', 170, 0, 0, False), ('dry_grass', 130, 120, -20, False), ('stones', 130, -110, -40, False)],
    'pillar': [('rock_pillar', 560, 0, 0, True), ('boulders_m', 340, 280, -60, True), ('dry_grass', 140, -200, -40, False),
               ('stones', 140, 120, -120, False)],
}
DECO_ASSET = {'dead_tree': 'ui/world/fld_dead_tree'}
HAND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deco_hand')


def apply_hand_deco(Pl, mp, seed, stands=None):
    import deco_proto as DP
    rnd = random.Random(seed + 303)
    for name in sorted(os.listdir(HAND_DIR)) if os.path.isdir(HAND_DIR) else []:
        if not name.startswith(mp + '_') or not name.endswith('.json'):
            continue
        hand = json.load(open(os.path.join(HAND_DIR, name), encoding='utf-8'))
        x0, y0, x1, y1 = DP.REGIONS[mp][hand['region']]
        inside = lambda it: x0 <= it['x'] <= x1 and y0 <= it['y'] <= y1
        Pl.tall = [t for t in Pl.tall if not inside(t)]
        Pl.low = [t for t in Pl.low if not inside(t)]
        if stands is not None:
            # 怪群外圈的主题杂物(骨堆 / 木箱 / 拒马…)也按原型重摆,不留随机件
            stands[:] = [st for st in stands if not (st.get('theme') and inside(st))]
        pw, ph = hand['protoSize']
        for kit, px, py in hand['groups']:
            gx = x0 + px / pw * (x1 - x0)
            gy = y1 - py / ph * (y1 - y0)
            flip = rnd.random() < 0.5
            for part, w, dx, dy, tall in DECO_KITS[kit]:
                asset = DECO_ASSET.get(part, G4(part))
                w = round(w * rnd.uniform(0.9, 1.1))
                it = {'asset': asset, 'x': round(gx + (-dx if flip else dx)), 'y': round(gy + dy), 'width': w, 'flipX': flip,
                      'rect': rect_of(asset, gx + dx, gy + dy, w)[0], 'r': 0, 'layer': 'tall' if tall else 'low',
                      'kind': 'tree' if part == 'dead_tree' else 'rock', 'hand': True}
                (Pl.tall if tall else Pl.low).append(it)


def generate(seed=8):
    roads, areas, flats, stands, bridge = build_skeleton()
    camps = build_camps()
    rnd0 = random.Random(seed + 7)
    # 边缘岩群 / 立石不许落进怪群活动圈;主题件不压路、不叠别的立物
    def in_camp(s, skip_boss=False):
        # 脚点或贴图竖向中轴(人站在后面会被挡)落进活动圈都算
        h = s['width'] * aspect(s['asset'])
        pts = [(s['x'], s['y'] + h * f) for f in (0, 0.3, 0.6, 0.85)]
        return any(math.hypot(px - c['x'], (py - c['y']) / 0.8) < camp_radius(c) * 0.95
                   for c in camps if not (skip_boss and c['code'] == 'FIELD_GRAY_B') for px, py in pts)
    stands = [s for s in stands if not in_camp(s, 'standing_stone' in s['asset'] or 'colossus' in s['asset'])]
    rects = [rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in stands]
    for it in camp_props(camps, rnd0):
        rc = rect_of(it['asset'], it['x'], it['y'], it['width'])[0]
        if any(overlap(rc, o) > 0.05 * min(area(rc), area(o)) for o in rects):
            continue
        stands.append(it)
        rects.append(rc)
    chests, pois, waypoint, spawn, exits, places = build_points()
    points = [(c['x'], c['y'], 260) for c in chests] + [(p['x'], p['y'], 260) for p in pois] + [(e['x'], e['y'], 320) for e in exits] \
        + [(waypoint['x'], waypoint['y'], 420), (spawn['x'], spawn['y'], 300)]
    cx, cy = P(*CAMP_PX)
    npcs = [{'code': c, 'name': n, 'asset': a, 'x': cx + dx, 'y': cy + dy, 'height': 215, 'flip': f} for c, n, a, dx, dy, f in NPCS_WORLD_OFFSET]
    points += [(n['x'], n['y'], 280) for n in npcs]
    g = build_grid(roads, areas, flats, stands, camps, points)
    # 压路 / 压河谷的立物直接去掉(打日志),地标件位置手调
    g.bad_stands = [s for s in stands if not stand_ok(g, s['asset'], s['x'], s['y'], s['width'])]
    stands = [s for s in stands if s not in g.bad_stands]
    structures = [rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in stands]
    Pl = Placed()
    scatter_tall(g, Pl, structures, seed)
    scatter_clusters(g, Pl, structures, roads, stands, camps, seed)
    apply_hand_deco(Pl, 'gray', seed, stands)
    return {'roads': roads, 'areas': areas, 'flats': flats, 'bridge': bridge, 'stands': stands, 'camps': camps, 'chests': chests,
            'pois': pois, 'waypoint': waypoint, 'spawn': spawn, 'exits': exits, 'places': places, 'tall': Pl.tall, 'low': Pl.low, 'npcs': npcs}, g


# ── 预览 ──
_IMG = {}


def img(asset):
    if asset not in _IMG:
        _IMG[asset] = load_rgba(asset)
    return _IMG[asset]


def splat_ground(Wp, Hp):
    """离线近似多层地表着色器(线性混合,不做高度混合 / 车辙):预览和地图页鸟瞰底图用。遮罩没生成时返回 None。"""
    d = os.path.join(RES, 'ui', 'world', 'gray4')
    if not os.path.exists(os.path.join(d, 'ground_splat.jpg')):
        return None
    m1 = np.asarray(Image.open(os.path.join(d, 'ground_splat.jpg')).convert('RGB').resize((Wp, Hp), Image.BILINEAR)).astype(np.float32) / 255
    m2 = np.asarray(Image.open(os.path.join(d, 'ground_splat2.jpg')).convert('RGB').resize((Wp, Hp), Image.BILINEAR)).astype(np.float32) / 255
    tiles = {'tex_earth': 720, 'tex_gravel': 1300, 'tex_drygrass': 560, 'tex_track': 640, 'tex_scree': 520}
    T = {}
    for name, tw in tiles.items():
        px = max(8, int(tw * Wp / MAP_W))
        t = Image.open(os.path.join(d, name + '.jpg')).convert('RGB').resize((px, px), Image.LANCZOS)
        reps = (Hp // px + 2, Wp // px + 2)
        T[name] = np.tile(np.asarray(t).astype(np.float32) / 255, (reps[0], reps[1], 1))[:Hp, :Wp]
    sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
    base = T['tex_earth']
    base = base + (T['tex_gravel'] - base) * sm(0.24, 0.6, m1[..., 0])[..., None]
    base = base + (T['tex_drygrass'] - base) * (m1[..., 1] * 0.7)[..., None]
    base = base + (T['tex_scree'] * np.array([1.12, 1.02, 0.86]) - base) * (np.clip(m2[..., 0] * 1.3 - 0.15, 0, 1) * 0.85)[..., None]
    base = base + (T['tex_track'] * 0.9 - base) * m2[..., 1][..., None]
    dist = m1[..., 2] * 512
    base = base + (T['tex_track'] - base) * (1 - sm(60, 150, dist))[..., None]
    base *= (0.9 + 0.18 * m1[..., 0])[..., None]
    return Image.fromarray((base.clip(0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')


def render_preview(L, g, scale=0.08, zones=False, marks=True):
    Wp, Hp = int(MAP_W * scale), int(MAP_H * scale)
    canvas = splat_ground(Wp, Hp) or Image.new('RGBA', (Wp, Hp), (150, 140, 122, 255))
    dr = ImageDraw.Draw(canvas)
    Q = lambda x, y: ((x + MAP_W / 2) * scale, (MAP_H / 2 - y) * scale)

    def paste(it, center):
        im = img(it['asset'])
        w = it['width']
        h = w * aspect(it['asset'])
        px, py = Q(it['x'], it['y'])
        if im is None:
            box = (px - w * scale / 2, py - (h * scale / 2 if center else h * scale), px + w * scale / 2, py + (h * scale / 2 if center else 0))
            dr.rectangle(box, outline=(60, 50, 40, 255) if not it.get('gorge') else (30, 30, 40, 255),
                         fill=(80, 70, 60, 120) if it.get('gorge') else None, width=1)
            return
        iw, ih = max(1, int(w * scale)), max(1, int(h * scale))
        im = im.resize((iw, ih), Image.LANCZOS)
        if it.get('flipX'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        pos = (int(px - iw / 2), int(py - ih / 2)) if center else (int(px - iw / 2), int(py - ih))
        canvas.paste(im, pos, im) if pos[0] < 0 or pos[1] < 0 else canvas.alpha_composite(im, pos)

    if not os.path.exists(os.path.join(RES, 'ui', 'world', 'gray4', 'ground_splat.jpg')):
        for line in L['roads']:
            dr.line([Q(x, y) for x, y in line], fill=(196, 178, 140, 255), width=max(2, int(240 * scale)))
    for f in L['flats']:
        paste(f, True)
    paste(L['bridge'], True)
    for it in sorted(L['stands'] + L['tall'] + L['low'], key=lambda t: -t['y']):
        paste(it, False)
    if not marks:
        return canvas
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 12)
    for c in L['camps']:
        r = camp_radius(c) * scale
        px, py = Q(c['x'], c['y'])
        col = (255, 90, 80, 255) if c['elite'] else (255, 226, 120, 255)
        dr.ellipse([px - r, py - r * 0.8, px + r, py + r * 0.8], outline=col, width=2)
        dr.text((px - 18, py - 7), f"{c['code'].replace('FIELD_GRAY_', '')} L{c['level']}", font=font, fill=col)
    for c in L['chests']:
        px, py = Q(c['x'], c['y'])
        dr.rectangle([px - 4, py - 4, px + 4, py + 4], fill=(240, 180, 60, 255))
    for p in L['pois']:
        px, py = Q(p['x'], p['y'])
        dr.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(120, 220, 255, 255))
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


def stats(L, g):
    by_zone = {}
    for it in L['tall'] + L['low']:
        zz = g.at(it['x'], it['y'])
        by_zone[zz] = by_zone.get(zz, 0) + 1
    return {'tall': len(L['tall']), 'low': len(L['low']), 'stands': len(L['stands']), 'flats': len(L['flats']), 'camps': len(L['camps']),
            'bad_stands': [(s['asset'].split('/')[-1], s['x'], s['y']) for s in g.bad_stands], 'by_zone': by_zone}


# ── 导出 TS ──

def short(asset):
    assert asset.startswith('ui/world/'), asset
    return asset[len('ui/world/'):]


def prop_block(it):
    w = it['width']
    if it.get('kind') == 'tree':
        return [round(w * 0.22), 50]
    return [round(w * 0.55), 60]


def export_ts(L):
    assets, index = [], {}

    def ai(a):
        k = short(a)
        if k not in index:
            index[k] = len(assets)
            assets.append(k)
        return index[k]

    def rows(items, tall):
        out = []
        for it in sorted(items, key=lambda t: -t['y']):
            row = [ai(it['asset']), it['x'], it['y'], it['width'], 1 if it.get('flipX') else 0]
            if tall:
                row += prop_block(it)
            out.append(row)
        return out

    def obj(it):
        d = {'asset': short(it['asset']), 'x': it['x'], 'y': it['y'], 'width': it['width']}
        for k in ('flat', 'flipX'):
            if it.get(k):
                d[k] = True
        if it.get('block'):
            d['block'] = it['block']
        return d

    J = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    camps = [[c['code'], c['name'], c['monster'], c['count'], c['level'], c['x'], c['y'], 1 if c['elite'] else 0] for c in L['camps']]
    tall_rows = rows(L['tall'], True)  # 先算行:素材表在行里登记
    low_rows = rows(L['low'], False)
    lines = [
        '/**',
        ' * 灰岩荒原 v4 布局(2026-11-08 用户选写实原型 gray_r1;规格对齐林地 v4)。',
        ' * 本文件由 tools/qa/gray_v4_gen.py apply 生成,别手改:改布局改生成器再重跑(之后还要重跑 world_water_blocks.py /',
        ' * gray_ground_install.py --mask-only / export_world_geometry.py --node)。',
        ' * 物件行 = [素材序号, x, y, 宽, 水平翻转(0/1), 挡块宽?, 挡块深?];素材 = ui/world 下的相对路径。',
        ' */',
        '/* eslint-disable */',
        f'export const GRAY_V4_SIZE = {J({"width": MAP_W, "height": MAP_H})};',
        f'export const GRAY_V4_ASSETS: string[] = {J(assets)};',
        f'export const GRAY_V4_ROADS: number[][][] = {J([[list(p) for p in line] for line in L["roads"]])};',
        f'export const GRAY_V4_AREAS: number[][] = {J([list(a) for a in L["areas"]])};',
        f'export const GRAY_V4_FLATS: Array<{{ asset: string; x: number; y: number; width: number; flat?: boolean; flipX?: boolean }}> = {J([obj(f) for f in L["flats"]])};',
        f'export const GRAY_V4_BRIDGE = {J(obj(L["bridge"]))};',
        f'export const GRAY_V4_STANDS: Array<{{ asset: string; x: number; y: number; width: number; flipX?: boolean; block?: {{ w: number; d: number }} }}> = {J([obj(s) for s in sorted(L["stands"], key=lambda t: -t["y"])])};',
        f'export const GRAY_V4_TALL: number[][] = {J(tall_rows)};',
        f'export const GRAY_V4_LOW: number[][] = {J(low_rows)};',
        '/** [关卡码, 名字, 怪物, 只数, 等级, x, y, 精英(0/1)] */',
        f'export const GRAY_V4_CAMPS: Array<[string, string, string, number, number, number, number, number]> = {J(camps)};',
        f'export const GRAY_V4_CHESTS = {J(L["chests"])} as const;',
        f'export const GRAY_V4_POIS = {J(L["pois"])} as const;',
        f'export const GRAY_V4_NPCS = {J([{**n, "asset": short(n["asset"])} for n in L["npcs"]])};',
        f'export const GRAY_V4_WAYPOINT = {J(L["waypoint"])};',
        f'export const GRAY_V4_SPAWN = {J(L["spawn"])};',
        f'export const GRAY_V4_EXITS = {J(L["exits"])};',
        f'export const GRAY_V4_PLACES = {J(L["places"])};',
        '',
    ]
    with open(TS_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    return TS_OUT


def main():
    os.makedirs(OUT, exist_ok=True)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    L, g = generate()
    print(json.dumps(stats(L, g), ensure_ascii=False))
    if cmd == 'apply':
        print(export_ts(L))
        return
    scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0.08
    render_preview(L, g, scale).convert('RGB').save(os.path.join(OUT, 'preview.png'))
    render_preview(L, g, scale, zones=True).convert('RGB').save(os.path.join(OUT, 'preview_zones.png'))
    print(os.path.join(OUT, 'preview.png'))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
