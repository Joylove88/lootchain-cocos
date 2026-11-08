# -*- coding: utf-8 -*-
"""枯木林 v4 布局生成(2026-11-09 用户选写实原型 dead_r1;管线 / 规格同灰岩荒原 v4 gray_v4_gen:镜头 1.4、多层地表、成组摆放、投影)。

骨架取自原型 dead_r1(1774×887 原型像素 → 18000×9000 世界单位):
  西:精灵守望者营地(传送阵,西口接灰岩荒原)→ 西北:枯死古树林 → 西南:黑泥沼泽(蛛母)→ 中:黑溪 + 树根桥
  → 北:鸦岩 → 中南:旧墓园 + 礼拜堂(守墓人)→ 东南:废弃伐木村 → 东北:低语石阵 → 远东:女巫谷(林间女巫)。
地标件按原生显示尺寸摆;杂物(枯树 / 岩块 / 枯草 / 落枝)按分区规则成组撒,防重叠、立物不盖身后的路 / 怪群圈 / 交互点。

用法:
  python tools/qa/dead_v4_gen.py preview [--scale 0.08]   预览图到 %TEMP%/lootchain-qa/dead_v4/
  python tools/qa/dead_v4_gen.py apply                     写 assets/scripts/scenes/lobby/LobbyDeadwoodLayout.ts
改了布局之后要重跑:world_water_blocks.py(黑溪 / 沼泽挡块)、dead_ground_install.py --mask-only、export_world_geometry.py --node。
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
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'dead_v4')
TS_OUT = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyDeadwoodLayout.ts')

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
    return f'ui/world/dead4/dead4_{name}'


# ── 骨架(原型像素)──
ROADS_PX = [
    [(0, 428), (120, 432), (230, 440), (330, 430), (430, 410), (540, 420), (640, 432), (760, 418), (880, 402), (990, 412),
     (1100, 432), (1200, 412), (1300, 382), (1400, 362), (1500, 352), (1580, 362)],
    [(430, 410), (425, 330), (410, 270)],                      # → 枯死古树林
    [(430, 410), (465, 500), (470, 575)],                      # → 黑泥沼泽北沿
    [(880, 402), (882, 300), (890, 230)],                      # → 鸦岩
    [(880, 402), (860, 480), (835, 545)],                      # → 礼拜堂
    [(1100, 432), (1150, 510), (1215, 590)],                   # → 伐木村
    [(1300, 382), (1285, 320), (1270, 300)],                   # → 低语石阵
    [(230, 440), (180, 560), (140, 640)],                      # → 西南林
    [(1500, 352), (1520, 460), (1560, 540)],                   # → 女巫谷南
]
# 空地(原型像素 x, y, rx, ry):怪群活动区 / 营地 / 地标前场,地表偏踩实,不撒高物件
AREAS_PX = [
    (215, 440, 105, 60), (370, 300, 110, 55), (560, 640, 90, 50), (300, 610, 80, 45), (900, 260, 90, 50),
    (900, 715, 140, 70), (1290, 640, 150, 75), (1270, 290, 120, 60), (1570, 400, 120, 60), (140, 640, 60, 40),
    (775, 600, 60, 40), (1440, 470, 60, 40), (1150, 300, 60, 40), (1080, 250, 60, 40),
]
# 黑溪中线(原型像素)与贴图宽度(世界单位;两侧泥岸可走,中间水面不可走,按贴图像素算挡块)
CREEK_PX = [(722, -40), (735, 120), (745, 250), (720, 350), (692, 432), (662, 520), (680, 650), (670, 780), (690, 930)]
CREEK_W = 1000
BRIDGE_PX = (690, 436)
CAMP_PX = (215, 440)   # 精灵营地:帐篷 / 瞭望台在主路北侧,篝火在南侧
GROVE_PX = (400, 230)
BOG_PX = (430, 700)
BOG_W = 3400
CRAG_PX = (965, 165)
CHAPEL_PX = (895, 678)
HAMLET_PX = (1330, 640)
STONES_PX = (1270, 270)
WITCH_PX = (1615, 345)
# 灰岩荒原东口(从枯木林回去落在这里;荒原出口本身在 LobbyWorldMaps GRAY 段追加)
GRAY_EAST_SPAWN = {'x': 8400, 'y': -270}

# ── 怪群(原型像素坐标):(关卡码, 名字, 怪物, 只数, 等级, px, py, 精英) ──
# Lv.20~29 普通 24 群 + 沼泽蛛母(E2)/ 守墓人(E)精英 + 林间女巫(B)首领;骨骼都是现成的(有移动 / 攻击 / 死亡动作)
CAMPS_PX = [
    # 西:营地外 / 古树林(Lv.20~21,食腐鸦 / 蝙蝠)
    ('FIELD_DEADWOOD_1', '营地外食腐鸦', 'SMALL_RAVEN', 8, 20, 365, 345, False),
    ('FIELD_DEADWOOD_2', '西林食腐鸦', 'SMALL_RAVEN', 8, 20, 140, 640, False),
    ('FIELD_DEADWOOD_3', '古树林蝙蝠', 'SMALL_BAT', 8, 21, 255, 255, False),
    ('FIELD_DEADWOOD_4', '古树林东蝙蝠', 'SMALL_BAT', 8, 21, 520, 290, False),
    ('FIELD_DEADWOOD_5', '西北林食腐鸦', 'SMALL_RAVEN', 9, 21, 110, 170, False),
    # 西南:黑泥沼泽(Lv.22~24,毒蛛)
    ('FIELD_DEADWOOD_6', '沼泽毒蛛', 'LARGE_SPIDER', 5, 22, 300, 610, False),
    ('FIELD_DEADWOOD_7', '沼泽南毒蛛', 'LARGE_SPIDER', 5, 23, 255, 805, False),
    ('FIELD_DEADWOOD_8', '沼泽东毒蛛', 'LARGE_SPIDER', 5, 23, 590, 800, False),
    ('FIELD_DEADWOOD_E2', '沼泽蛛母', 'LARGE_SPIDER', 1, 24, 565, 640, True),
    # 北:鸦岩 / 黑溪东岸(Lv.22~23)
    ('FIELD_DEADWOOD_9', '鸦岩蝙蝠', 'SMALL_BAT', 9, 22, 840, 250, False),
    ('FIELD_DEADWOOD_10', '鸦岩东食腐鸦', 'SMALL_RAVEN', 9, 23, 1095, 215, False),
    ('FIELD_DEADWOOD_11', '溪东蝙蝠', 'SMALL_BAT', 8, 22, 1010, 335, False),
    # 中南:旧墓园 + 礼拜堂(Lv.24~26,亡灵祭司 / 腐化者 / 守墓人)
    ('FIELD_DEADWOOD_12', '墓园亡灵祭司', 'STAFF_PRIEST', 6, 24, 800, 770, False),
    ('FIELD_DEADWOOD_13', '礼拜堂亡灵祭司', 'STAFF_PRIEST', 6, 25, 775, 600, False),
    ('FIELD_DEADWOOD_14', '墓园南腐化者', 'MUTANT_MALE', 8, 25, 965, 835, False),
    ('FIELD_DEADWOOD_18', '溪南腐化者', 'MUTANT_MALE', 8, 24, 770, 505, False),
    ('FIELD_DEADWOOD_E', '守墓人', 'HALIDOM_KEEPER', 1, 26, 1060, 705, True),
    # 东南:废弃伐木村(Lv.25~26,腐化伐木工)
    ('FIELD_DEADWOOD_15', '伐木村腐化者', 'MUTANT_MALE', 9, 25, 1210, 545, False),
    ('FIELD_DEADWOOD_16', '伐木村东腐化者', 'MUTANT_MALE', 9, 26, 1560, 615, False),
    ('FIELD_DEADWOOD_17', '伐木村南腐化者', 'MUTANT_MALE', 8, 26, 1300, 805, False),
    # 东北:低语石阵(Lv.26~27)
    ('FIELD_DEADWOOD_19', '石阵亡灵祭司', 'STAFF_PRIEST', 6, 27, 1150, 365, False),
    ('FIELD_DEADWOOD_20', '石阵东亡灵祭司', 'STAFF_PRIEST', 6, 27, 1420, 210, False),
    ('FIELD_DEADWOOD_21', '石阵北食腐鸦', 'SMALL_RAVEN', 9, 26, 1250, 110, False),
    # 远东:女巫谷(Lv.28~30)
    ('FIELD_DEADWOOD_22', '女巫谷毒蛛', 'LARGE_SPIDER', 5, 28, 1580, 520, False),
    ('FIELD_DEADWOOD_23', '女巫谷蝙蝠', 'SMALL_BAT', 9, 28, 1715, 540, False),
    ('FIELD_DEADWOOD_24', '女巫谷亡灵祭司', 'STAFF_PRIEST', 6, 29, 1440, 470, False),
    ('FIELD_DEADWOOD_B', '林间女巫', 'CURSED_CASTER', 1, 30, 1565, 405, True),
]

# 营地 NPC(11-09 第 3 章:精灵守望者在营地接 / 交任务):相对营地中心的世界偏移
NPCS_WORLD_OFFSET = [('WARDEN', '精灵守望者 · 希尔瓦', 'ui/world/city4/city4_npc_warden', -330, 40, 1)]

CHESTS_PX = [
    ('DEADWOOD_W1', '林间木箱', 'WOOD', 60, 300),
    ('DEADWOOD_W2', '林间木箱', 'WOOD', 610, 320),
    ('DEADWOOD_W3', '林间木箱', 'WOOD', 1560, 820),
    ('DEADWOOD_I1', '蛛母铁箱', 'IRON', 640, 700),
    ('DEADWOOD_I2', '墓园铁箱', 'IRON', 1120, 760),
    ('DEADWOOD_S1', '秘藏宝箱', 'SECRET', 40, 840),
    ('DEADWOOD_B1', '首领宝箱', 'BOSS', 1705, 420),
]
POIS_PX = [
    ('D_HIDDEN_1', 'HIDDEN', '树根桥下的布包', 640, 485),
    ('D_HIDDEN_2', 'HIDDEN', '礼拜堂的暗格', 860, 560),
    ('D_HIDDEN_3', 'HIDDEN', '女巫的药瓶', 1690, 330),
    ('D_STELE_1', 'STELE', '低语石碑', 1270, 265),
    ('D_STELE_2', 'STELE', '古树下的碑', 450, 275),
    ('D_HERB_1', 'HERB', '沼泽草药', 180, 730),
    ('D_HERB_2', 'HERB', '林间草药', 1480, 120),
]
# 运行时 snapPois 挪过的兴趣点坐标写回这里(实机 [POI] 日志),服务端坐标表才对得上
POI_FIX = {}

PLACES_PX = [('精灵营地', 'portal', 215, 440), ('枯死古树林', 'den', 400, 230), ('黑泥沼泽', 'den', 430, 700),
             ('鸦岩', 'camp', 965, 165), ('旧墓园', 'ruins', 900, 700), ('废弃伐木村', 'camp', 1330, 640),
             ('低语石阵', 'ruins', 1270, 270), ('女巫谷', 'ruins', 1615, 345)]

# ── 物件表(世界单位显示宽)──
TALL = {
    'snag': (G4('dead_snag'), (360, 500)),
    'spruce': (G4('dead_spruce'), (300, 420)),
    'old_tree': (G4('giant_dead_tree_b'), (620, 900)),
    'old_tree2': (G4('giant_dead_tree'), (700, 1000)),
    'sapling': (G4('autumn_sapling'), (260, 360)),
    'dead_tree': ('ui/world/fld_dead_tree', (320, 420)),
    'boulder': (G4('mossy_boulder'), (220, 340)),
    'log': (G4('fallen_log'), (420, 620)),
}
# scatter_clusters 认 grass / scrub / stones / bones 四个键:枯草 / 枯灌丛 / 落枝 / 蘑菇
LOW = {
    'grass': (G4('dead_grass'), (110, 160)),
    'scrub': (G4('dead_bush'), (170, 240)),
    'stones': (G4('branches'), (150, 210)),
    'bones': (G4('mushrooms'), (100, 140)),
}

ZONES = {
    # 名称: (说明, 高物件表, 高物件密度) 密度 = 每 100 万平方世界单位;矮物件成组摆放(scatter_clusters)
    'road': ('路面', [], 0),
    'shoulder': ('路肩(离路 130~320)', [], 0),
    'plain': ('林地:稀疏枯树 / 枯杉 / 小树 / 倒木,空地留给地表材质',
              [('old_tree', 3), ('old_tree2', 2), ('dead_tree', 3), ('sapling', 3), ('snag', 1), ('spruce', 1), ('log', 2), ('boulder', 1)], 1.0),
    'clearing': ('空地 / 怪群活动区', [], 0),
    'gorge': ('黑溪水面(挡路)', [], 0),
    'rim': ('溪岸(离水 0~500):小树 / 苔石 / 倒木', [('sapling', 3), ('boulder', 2), ('log', 1), ('dead_tree', 1)], 0.9),
    'rocky': ('林缘(上下边):密的老枯树 / 小树', [('old_tree', 3), ('old_tree2', 2), ('dead_tree', 2), ('sapling', 2), ('spruce', 1)], 1.8),
    'ruins': ('墓园 / 石阵外圈', [('snag', 1), ('boulder', 1)], 0.3),
    'quarry': ('沼泽外圈:断树为主', [('snag', 2), ('dead_tree', 2), ('log', 1)], 0.7),
}
ZONE_COLOR = {
    'road': (214, 186, 130), 'shoulder': (236, 214, 160), 'plain': (150, 140, 120), 'clearing': (250, 238, 120),
    'gorge': (60, 60, 70), 'rim': (120, 110, 100), 'rocky': (160, 150, 150), 'ruins': (190, 140, 230), 'quarry': (110, 110, 150),
}
THEMES_PX = {
    'rocky': [(887, 25, 1000, 60), (887, 875, 1000, 55), (40, 60, 120, 120), (1740, 820, 120, 90), (1740, 80, 90, 120)],
    'ruins': [(930, 720, 200, 110), (1270, 270, 200, 110)],
    'quarry': [(430, 700, 270, 170)],
}


_ASPECT = {}


def load_rgba(asset):
    path = os.path.join(RES, asset + '.png')
    if not os.path.exists(path):
        # 素材还没入库时用占位比例(预览画框)
        return None
    return Image.open(path).convert('RGBA')


PLACEHOLDER_ASPECT = {
    'elf_tent': 0.8, 'elf_tent_b': 0.7, 'watch_platform': 1.6, 'stump_seat': 0.5, 'giant_dead_tree': 1.2, 'giant_dead_tree_b': 1.4,
    'dead_snag': 2.4, 'dead_spruce': 3.0, 'autumn_sapling': 1.0, 'fallen_log': 0.35, 'root_tangle': 0.45, 'bog_pool': 0.55,
    'reeds': 0.8, 'drowned_stump': 1.0, 'web_snag': 0.7, 'crag': 0.55, 'mossy_boulder': 0.7, 'chapel_ruin': 0.75,
    'headstones': 0.6, 'headstone': 1.1, 'iron_fence': 0.45, 'cottage': 0.7, 'cottage_collapsed': 0.8, 'cottage_collapsed_b': 0.7,
    'log_stack': 0.5, 'broken_cart': 0.5, 'standing_stone_b': 1.1, 'world_tree': 1.2, 'witch_hut': 0.85, 'creek_a': 1.5,
    'creek_b': 1.5, 'dead_bush': 0.8, 'dead_grass': 0.75, 'mushrooms': 0.7, 'branches': 0.5,
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
            _ASPECT[asset] = PLACEHOLDER_ASPECT.get(asset.split('dead4_')[-1], 0.8)
    return _ASPECT[asset]


# ── 骨架 / 地标 ──

def gorge_segments():
    """沿河谷中线按段长串贴图(两种段交替、偶数段水平翻转),段间重叠 12% 盖住接缝。"""
    line = [P(x, y) for x, y in CREEK_PX]
    segs = []
    k = 0
    for (ax, ay), (bx, by) in zip(line, line[1:]):
        pass
    # 沿折线按弧长取段中心
    total = sum(math.hypot(bx - ax, by - ay) for (ax, ay), (bx, by) in zip(line, line[1:]))
    s = 0.0
    while s < total + 200:
        names = ['creek_a', 'creek_b']
        asset = G4(names[k % 2])
        h = CREEK_W * aspect(asset)
        pos = point_at(line, min(total, s + h / 2))
        segs.append({'asset': asset, 'x': round(pos[0]), 'y': round(pos[1]), 'width': CREEK_W, 'flat': True, 'gorge': True,
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
    """返回 (flats 贴地件, stands 立物, bridge);立物带挡块(底座矩形)。"""
    flats, stands = [], []

    def st(name, x, y, w, block=None, flip=False):
        it = {'asset': G4(name), 'x': round(x), 'y': round(y), 'width': round(w)}
        if block:
            it['block'] = block
        if flip:
            it['flipX'] = True
        stands.append(it)

    # 精灵守望者营地(传送阵在营地中央;帐篷 / 瞭望台在主路北侧,篝火 / 树桩座在南侧)
    cx, cy = P(*CAMP_PX)
    st('watch_platform', cx - 620, cy + 360, 560, blk(260, 100))
    st('elf_tent', cx - 100, cy + 430, 560, blk(380, 110))
    st('elf_tent_b', cx + 470, cy + 300, 480, blk(330, 100))
    st('elf_tent', cx + 940, cy + 540, 520, blk(360, 110), flip=True)
    st('campfire', cx + 420, cy - 560, 300)
    st('stump_seat', cx + 760, cy - 640, 320)
    # 枯死古树林:两棵巨大枯树 + 断树
    gx, gy = P(*GROVE_PX)
    st('giant_dead_tree', gx - 520, gy + 40, 1700, blk(520, 170))
    st('giant_dead_tree_b', gx + 1450, gy + 420, 1250, blk(380, 130), flip=True)
    st('dead_snag', gx - 1700, gy - 120, 540, blk(160, 60))
    st('fallen_log', gx + 520, gy - 520, 700, blk(560, 70))
    # 黑泥沼泽:沼泽水塘贴地(水心不可走,挡块由 world_water_blocks 按贴图算),外圈芦苇 / 烂树桩 / 蛛网
    bx, by = P(*BOG_PX)
    flats.append({'asset': G4('bog_pool'), 'x': bx, 'y': by, 'width': BOG_W, 'flat': True, 'pit': True})
    st('web_snag', bx - 2950, by + 1250, 950, blk(560, 70))
    st('web_snag', bx + 1900, by - 1150, 880, blk(520, 70), flip=True)
    st('drowned_stump', bx + 700, by + 820, 380, blk(200, 60))
    st('drowned_stump', bx - 1500, by - 700, 360, blk(190, 60), flip=True)
    for dx, dy, w in ((-1650, 220, 330), (1700, 160, 320), (-700, -920, 300), (900, -980, 310), (300, 1000, 280)):
        st('reeds', bx + dx, by + dy, w)
    # 鸦岩:苔岩堆
    kx, ky = P(*CRAG_PX)
    st('crag', kx, ky + 200, 2000, blk(1600, 240))
    st('mossy_boulder', kx - 1250, ky - 150, 420, blk(280, 60))
    st('mossy_boulder', kx + 1250, ky - 60, 380, blk(250, 60), flip=True)
    # 旧墓园 + 礼拜堂:礼拜堂在北,墓碑在南,东 / 南两边铁栅栏(西边、北边敞开)
    hx, hy = P(*CHAPEL_PX)
    st('chapel_ruin', hx, hy + 120, 2100, blk(1500, 170))
    st('headstones', hx + 650, hy - 520, 900, blk(600, 80))
    for dx, dy, f in ((-450, -380, False), (-80, -720, True), (380, -880, False), (1050, -820, True), (-700, -860, False)):
        st('headstone', hx + dx, hy + dy, 260, blk(130, 40), flip=f)
    for i, dx in enumerate((-600, 0, 600, 1200)):
        st('iron_fence', hx + dx, hy - 1150, 640, blk(580, 40), flip=i % 2 == 1)
    # 废弃伐木村:三间木屋 + 原木堆 + 破推车
    vx, vy = P(*HAMLET_PX)
    st('cottage', vx + 300, vy + 420, 1350, blk(950, 160))
    st('cottage_collapsed', vx - 1500, vy - 450, 1200, blk(820, 150))
    st('cottage_collapsed_b', vx + 1450, vy - 420, 1300, blk(900, 150), flip=True)
    st('log_stack', vx - 450, vy + 380, 720, blk(560, 80))
    st('log_stack', vx + 350, vy - 380, 760, blk(600, 80), flip=True)
    st('broken_cart', vx - 80, vy - 980, 650, blk(440, 80))
    # 低语石阵:一圈立石(南面留口给路)
    sx, sy = P(*STONES_PX)
    for k, (x, y) in enumerate(ellipse_ring(sx, sy + 60, 1250, 640, 11, 0.2, skip=(235, 305))):
        st('standing_stone' if k % 3 else 'standing_stone_b', x, y, 300 if k % 3 else 260, blk(130, 45), flip=k % 2 == 1)
    # 女巫谷:枯死世界树 + 树根间的女巫小屋
    wx0, wy0 = P(*WITCH_PX)
    st('world_tree', wx0 + 120, wy0 + 120, 3000, blk(1300, 260))
    st('witch_hut', wx0 + 280, wy0 - 40, 880, blk(560, 120))
    # 上边缘:密的枯杉 / 断树(地图北界看起来是林子而不是空地);下边缘:倒木 + 断树(人走在它们后面不被挡)
    x = -MAP_W / 2 + 200
    rnd = random.Random(31)
    gx_top, gx_bot = wx(CREEK_PX[0][0]), wx(CREEK_PX[-1][0])
    for row, (base, jitter) in enumerate(((MAP_H / 2 - 80, 160), (MAP_H / 2 - 420, 220))):
        x = -MAP_W / 2 + 200 + row * 380
        while x < MAP_W / 2:
            kind = rnd.choice(['giant_dead_tree_b', 'giant_dead_tree_b', 'giant_dead_tree', 'autumn_sapling', 'dead_spruce'])
            w = {'giant_dead_tree_b': rnd.uniform(700, 950), 'giant_dead_tree': rnd.uniform(800, 1050),
                 'autumn_sapling': rnd.uniform(320, 420), 'dead_spruce': rnd.uniform(320, 400)}[kind]
            if abs(x - gx_top) < CREEK_W * 0.5 + w * 0.5:
                x += w
                continue
            st(kind, x, base - rnd.uniform(0, jitter), w, blk(w * 0.25, 60), flip=rnd.random() < 0.5)
            x += w * rnd.uniform(0.6, 1.0) + (rnd.uniform(150, 500) if row else 0)
    x = -MAP_W / 2 + 300
    while x < MAP_W / 2:
        kind = rnd.choice(['fallen_log', 'fallen_log', 'dead_snag', 'mossy_boulder'])
        w = {'fallen_log': rnd.uniform(520, 720), 'dead_snag': rnd.uniform(380, 480), 'mossy_boulder': rnd.uniform(260, 360)}[kind]
        if abs(x - gx_bot) < CREEK_W * 0.5 + w * 0.5:
            x += w
            continue
        st(kind, x, -MAP_H / 2 + 80 + rnd.uniform(0, 220), w, blk(w * 0.6, 60), flip=rnd.random() < 0.5)
        x += w * rnd.uniform(0.8, 1.5) + (rnd.uniform(200, 600) if rnd.random() < 0.3 else 0)
    flats += gorge_segments()
    bx2, by2 = P(*BRIDGE_PX)
    bridge = {'asset': G4('root_tangle'), 'x': bx2, 'y': by2, 'width': 1700, 'flat': True}
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
    exits = [{'key': 'to_gray', 'label': '返回 · 灰岩荒原', 'x': -MAP_W // 2 + 140, 'y': wy(428), 'radius': 130,
              'toMap': 'GRAY', 'toSpawn': dict(GRAY_EAST_SPAWN)}]
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
    gorge_line = [P(x, y) for x, y in CREEK_PX]
    d_gorge = seg_dist(g.X, g.Y, [gorge_line])
    g.d_gorge = d_gorge
    gorge = d_gorge <= CREEK_W * 0.3
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
    z[(d_gorge > CREEK_W * 0.3) & (d_gorge <= CREEK_W * 0.3 + 500)] = 'rim'
    z[ell | campz] = 'clearing'
    z[(g.d_road > 130) & (g.d_road <= 320)] = 'shoulder'
    z[g.d_road <= 130] = 'road'
    z[gorge] = 'gorge'
    g.campz = campz
    g.blocked |= gorge
    # 沼泽水心 / 立物贴图范围 / 交互点不放东西
    qx, qy = P(*BOG_PX)
    g.pit = ((g.X - qx) / (BOG_W * 0.36)) ** 2 + ((g.Y - qy) / (BOG_W * 0.55 * 0.32)) ** 2 <= 1
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
            try_tall(g, Pl, asset, x, y, rnd.uniform(lo, hi), 'rock' if kind in ('boulder', 'log') else 'tree', structures)


def scatter_clusters(g, Pl, structures, roads, stands, camps, seed):
    """矮物件成组:岩脚组(碎石 + 枯草)、枯树根组(枯草 + 灌丛)、路缘断续碎石带、空地草簇(圈心留空)、平地灌丛组、骨堆点缀。"""
    rnd = random.Random(seed + 101)
    cores = [(c['x'], c['y'], camp_radius(c)) for c in camps]
    rocks = [t for t in Pl.tall if t['kind'] == 'rock'] + [s for s in stands if any(k in s['asset'] for k in ('boulder', 'crag', 'stone', 'log'))]
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
    if g.d_road[i] <= 170 or g.zone[i] == 'gorge':
        return False
    return True


CAMP_THEME = {
    # 怪群外圈主题件(放在活动圈外沿,不进圈心):(素材, 宽, 挡块?)
    'SMALL_RAVEN': [('fallen_log', 520, True), ('mushrooms', 130, False)],
    'SMALL_BAT': [('dead_snag', 420, True), ('branches', 180, False)],
    'LARGE_SPIDER': [('web_snag', 760, True), ('reeds', 280, False)],
    'STAFF_PRIEST': [('headstone', 250, True), ('standing_stone_b', 240, True)],
    'MUTANT_MALE': [('log_stack', 600, True), ('branches', 180, False)],
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
                   for c in camps if not (skip_boss and c['code'] == 'FIELD_DEADWOOD_B') for px, py in pts)
    stands = [s for s in stands if not in_camp(s, 'standing_stone' in s['asset'] or 'world_tree' in s['asset'] or 'witch_hut' in s['asset'])]
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
    apply_hand_deco(Pl, 'dead', seed, stands)
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
    d = os.path.join(RES, 'ui', 'world', 'dead4')
    if not os.path.exists(os.path.join(d, 'ground_splat.jpg')):
        return None
    m1 = np.asarray(Image.open(os.path.join(d, 'ground_splat.jpg')).convert('RGB').resize((Wp, Hp), Image.BILINEAR)).astype(np.float32) / 255
    m2 = np.asarray(Image.open(os.path.join(d, 'ground_splat2.jpg')).convert('RGB').resize((Wp, Hp), Image.BILINEAR)).astype(np.float32) / 255
    tiles = {'tex_mud': 720, 'tex_moss': 1300, 'tex_deadgrass': 560, 'tex_track': 640, 'tex_leaves': 520}
    T = {}
    for name, tw in tiles.items():
        px = max(8, int(tw * Wp / MAP_W))
        t = Image.open(os.path.join(d, name + '.jpg')).convert('RGB').resize((px, px), Image.LANCZOS)
        reps = (Hp // px + 2, Wp // px + 2)
        T[name] = np.tile(np.asarray(t).astype(np.float32) / 255, (reps[0], reps[1], 1))[:Hp, :Wp]
    sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
    base = T['tex_mud']
    base = base + (T['tex_moss'] - base) * sm(0.24, 0.6, m1[..., 0])[..., None]
    base = base + (T['tex_deadgrass'] - base) * (m1[..., 1] * 0.7)[..., None]
    base = base + (T['tex_leaves'] - base) * (np.clip(m2[..., 0] * 1.3 - 0.15, 0, 1) * 0.85)[..., None]
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

    if not os.path.exists(os.path.join(RES, 'ui', 'world', 'dead4', 'ground_splat.jpg')):
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
        dr.text((px - 18, py - 7), f"{c['code'].replace('FIELD_DEADWOOD_', '')} L{c['level']}", font=font, fill=col)
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
        ' * 枯木林 v4 布局(2026-11-09 用户选写实原型 dead_r1;规格同灰岩荒原 v4)。',
        ' * 本文件由 tools/qa/dead_v4_gen.py apply 生成,别手改:改布局改生成器再重跑(之后还要重跑 world_water_blocks.py /',
        ' * dead_ground_install.py --mask-only / export_world_geometry.py --node)。',
        ' * 物件行 = [素材序号, x, y, 宽, 水平翻转(0/1), 挡块宽?, 挡块深?];素材 = ui/world 下的相对路径。',
        ' */',
        '/* eslint-disable */',
        f'export const DEAD_V4_SIZE = {J({"width": MAP_W, "height": MAP_H})};',
        f'export const DEAD_V4_ASSETS: string[] = {J(assets)};',
        f'export const DEAD_V4_ROADS: number[][][] = {J([[list(p) for p in line] for line in L["roads"]])};',
        f'export const DEAD_V4_AREAS: number[][] = {J([list(a) for a in L["areas"]])};',
        f'export const DEAD_V4_FLATS: Array<{{ asset: string; x: number; y: number; width: number; flat?: boolean; flipX?: boolean }}> = {J([obj(f) for f in L["flats"]])};',
        f'export const DEAD_V4_BRIDGE = {J(obj(L["bridge"]))};',
        f'export const DEAD_V4_STANDS: Array<{{ asset: string; x: number; y: number; width: number; flipX?: boolean; block?: {{ w: number; d: number }} }}> = {J([obj(s) for s in sorted(L["stands"], key=lambda t: -t["y"])])};',
        f'export const DEAD_V4_TALL: number[][] = {J(tall_rows)};',
        f'export const DEAD_V4_LOW: number[][] = {J(low_rows)};',
        '/** [关卡码, 名字, 怪物, 只数, 等级, x, y, 精英(0/1)] */',
        f'export const DEAD_V4_CAMPS: Array<[string, string, string, number, number, number, number, number]> = {J(camps)};',
        f'export const DEAD_V4_CHESTS = {J(L["chests"])} as const;',
        f'export const DEAD_V4_POIS = {J(L["pois"])} as const;',
        f'export const DEAD_V4_NPCS = {J([{**n, "asset": short(n["asset"])} for n in L["npcs"]])};',
        f'export const DEAD_V4_WAYPOINT = {J(L["waypoint"])};',
        f'export const DEAD_V4_SPAWN = {J(L["spawn"])};',
        f'export const DEAD_V4_EXITS = {J(L["exits"])};',
        f'export const DEAD_V4_PLACES = {J(L["places"])};',
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
