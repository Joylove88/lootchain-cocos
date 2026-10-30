# -*- coding: utf-8 -*-
"""村外林地 v3 地图定义生成(2026-10-29):林地原型 woods_overview.png(1808×870)坐标 → 世界坐标,输出 TS 片段
到 stdout(贴进 LobbyWorldMaps.ts 的 WOODS)。换算 x = (px - 904) × 7.5,y = (435 - py) × 7.5,地图约 13560×6525。
走廊 = 原型路网折线(半宽 HALF)+ 各据点林间空地椭圆;树林按走廊两侧撒(固定种子)。
用法:python tools/qa/woods_def_gen.py > out.ts
"""
import math
import random
import sys

S = 7.5
CX, CY = 904, 435
HALF = 230


def wx(px):
    return round((px - CX) * S)


def wy(py):
    return round((CY - py) * S)


# 路网(原型像素折线)
ROADS = [
    [(230, 720), (330, 645), (420, 590), (500, 545), (600, 505), (690, 480), (745, 445), (860, 420), (960, 395), (1060, 365), (1150, 345), (1250, 345), (1330, 350)],
    [(1150, 345), (1080, 295), (1020, 255), (940, 220), (860, 190), (790, 165), (770, 110)],
    [(1330, 350), (1420, 300), (1480, 255), (1550, 215), (1620, 180)],
    [(480, 555), (420, 480), (340, 430), (250, 360), (140, 315)],
    [(860, 420), (900, 500), (930, 590), (980, 640), (1100, 665), (1240, 660), (1380, 610), (1500, 640), (1560, 650)],
    [(1500, 640), (1560, 590), (1610, 520)],
    [(930, 590), (855, 650), (800, 700), (775, 790)],
    [(1330, 350), (1460, 360), (1630, 365)],
]
# 林间空地(原型 cx, cy, rx, ry 像素)
AREAS = [
    (165, 760, 150, 95),     # 入口营地
    (470, 450, 95, 55),      # 幼鼠窝
    (1010, 230, 120, 60),    # 林间蛛巢
    (1350, 370, 130, 60),    # 猎人营地
    (1190, 640, 190, 95),    # 古树遗迹
    (1600, 185, 110, 55),    # 熊穴前
    (790, 170, 55, 40),      # 瀑布宝箱
    (140, 315, 50, 35),      # 西宝箱
    (775, 790, 50, 35),      # 南宝箱
    (1630, 365, 50, 35),     # 东宝箱
]

# 怪群(关卡码, 名字, 怪物, 只数, 等级, 原型 x, y, elite)
CAMPS = [
    ('FIELD_WOODS_4', '营地外鼠群', 'MINI_RAT', 6, 3, 345, 615, False),
    ('FIELD_WOODS_1', '幼鼠窝', 'MINI_RAT', 8, 2, 470, 450, False),
    ('FIELD_WOODS_3', '林道鼠群', 'MINI_RAT', 6, 2, 520, 535, False),
    ('FIELD_WOODS_5', '桥头野犬', 'MEDIUM_DOG', 6, 4, 665, 490, False),
    ('FIELD_WOODS_6', '瀑布蛛群', 'SMALL_SPIDER', 6, 4, 800, 180, False),
    ('FIELD_WOODS_2', '林间蛛巢', 'SMALL_SPIDER', 10, 5, 1035, 250, False),
    ('FIELD_WOODS_E2', '林间蛛后', 'SMALL_SPIDER', 1, 7, 965, 205, True),
    ('FIELD_WOODS_7', '林道野犬', 'MEDIUM_DOG', 6, 6, 1090, 360, False),
    ('FIELD_WOODS_8', '猎人营地野犬', 'MEDIUM_DOG', 8, 6, 1290, 390, False),
    ('FIELD_WOODS_E', '棕鬃熊', 'MEDIUM_BEAR', 1, 8, 1450, 360, True),
    ('FIELD_WOODS_9', '遗迹蛛群', 'SMALL_SPIDER', 8, 7, 1110, 660, False),
    ('FIELD_WOODS_11', '遗迹东鼠群', 'MINI_RAT', 8, 9, 1500, 635, False),
    ('FIELD_WOODS_10', '熊穴前野犬', 'MEDIUM_DOG', 7, 8, 1480, 260, False),
    ('FIELD_WOODS_B', '腐木巨熊', 'MEDIUM_BEAR', 1, 10, 1610, 170, True),
    # 10-30 用户「地图多放些怪物」:沿路再加 9 群
    ('FIELD_WOODS_12', '西林鼠群', 'MINI_RAT', 6, 2, 290, 395, False),
    ('FIELD_WOODS_13', '溪畔蛛群', 'SMALL_SPIDER', 7, 4, 905, 520, False),
    ('FIELD_WOODS_14', '中路野犬', 'MEDIUM_DOG', 7, 6, 1190, 345, False),
    ('FIELD_WOODS_15', '遗迹西蛛群', 'SMALL_SPIDER', 8, 7, 990, 640, False),
    ('FIELD_WOODS_16', '古树野犬', 'MEDIUM_DOG', 7, 8, 1250, 655, False),
    ('FIELD_WOODS_17', '遗迹东蛛群', 'SMALL_SPIDER', 8, 8, 1390, 612, False),
    ('FIELD_WOODS_18', '东林野犬', 'MEDIUM_DOG', 7, 9, 1560, 365, False),
    ('FIELD_WOODS_19', '南岔鼠群', 'MINI_RAT', 7, 5, 830, 660, False),
    ('FIELD_WOODS_20', '东南鼠群', 'MINI_RAT', 8, 9, 1590, 555, False),
]

# 立物(素材, 原型 x, 脚底 y, 世界宽, 额外)
STANDS = [
    ('camp_tent', 55, 690, 560, "block: { w: 380, d: 120 }"),
    ('camp_tent', 30, 820, 520, "flipX: true, block: { w: 360, d: 110 }"),
    ('camp_palisade', 200, 640, 1000, "block: { w: 900, d: 80 }"),
    ('camp_palisade', 150, 865, 1100, "flipX: true, block: { w: 1000, d: 80 }"),
    ('camp_banner', 80, 650, 210, ''),
    ('camp_banner', 285, 760, 210, ''),
    ('camp_banner', 345, 800, 210, 'flipX: true'),
    ('camp_crates', 300, 790, 300, "block: { w: 220, d: 60 }"),
    ('rat_log', 360, 480, 760, "block: { w: 560, d: 120 }"),
    ('spider_den', 990, 225, 1600, "block: { w: 1200, d: 260 }"),
    ('hunter_tent', 1330, 400, 640, "block: { w: 440, d: 120 }"),
    ('hunter_rack', 1440, 395, 540, "block: { w: 380, d: 60 }"),
    ('campfire', 1395, 425, 280, ''),
    ('ancient_tree', 1245, 685, 1600, "block: { w: 520, d: 160 }"),
    ('ruin_arch', 1060, 560, 980, "block: { w: 700, d: 90 }"),
    ('ruin_wall', 1395, 750, 950, "block: { w: 700, d: 110 }"),
    ('ruin_wall', 960, 740, 820, "flipX: true, block: { w: 600, d: 100 }"),
    ('ruin_pillar', 1475, 665, 320, "block: { w: 140, d: 50 }"),
    ('ruin_pillar', 1030, 610, 300, "block: { w: 140, d: 50 }"),
    ('crystal_pillar', 970, 700, 280, "block: { w: 140, d: 50 }"),
    ('crystal_pillar', 1355, 640, 280, "block: { w: 140, d: 50 }"),
    ('bear_den', 1630, 160, 1800, "block: { w: 1300, d: 300 }"),
    ('bones', 1500, 185, 560, ''),
    ('rock_big', 640, 720, 640, "block: { w: 440, d: 120 }"),
    ('rock_big', 960, 120, 700, "flipX: true, block: { w: 480, d: 120 }"),
    ('rock_small', 95, 395, 380, "block: { w: 260, d: 70 }"),
    ('rock_small', 1180, 200, 360, "flipX: true, block: { w: 240, d: 70 }"),
    ('stump', 1735, 225, 280, "block: { w: 160, d: 50 }"),
    ('stump', 600, 560, 260, "block: { w: 150, d: 50 }"),
    ('tree_autumn', 135, 525, 620, "block: { w: 140, d: 60 }"),
    ('tree_autumn', 860, 600, 600, "block: { w: 140, d: 60 }"),
    ('tree_autumn', 1250, 270, 560, "block: { w: 140, d: 60 }"),
]

# 贴地件(素材, 原型中心 x, y, 世界宽, water)
FLATS = [
    ('cliff_falls', 450, 122, 3800, True),
    ('cliff_ne', 1724, 300, 1300, True),
    ('camp_plaza', 165, 780, 2500, False),
    ('ruins_floor', 1130, 695, 2700, False),
]


# 溪流:沿原型河道(瀑布潭 → 木桥 → 南出图)串溪流件,交替翻转、首尾重叠连成一条(素材, 原型 x, y, 世界宽, flipX)
RIVER = [
    ('river_a', 520, 285, 1900, False),
    ('river_c', 610, 345, 1700, True),
    ('river_a', 705, 400, 1700, False),
    ('river_b', 790, 490, 1500, False),
    ('river_b', 795, 570, 1500, True),
    ('river_c', 735, 640, 1700, False),
    ('river_a', 660, 715, 1700, True),
    ('river_c', 600, 790, 1700, False),
    ('river_a', 565, 860, 1800, True),
]


def dist_lines(x, y, lines):
    best = 1e18
    for line in lines:
        for i in range(len(line) - 1):
            ax, ay = line[i]
            bx, by = line[i + 1]
            dx, dy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / max(1.0, dx * dx + dy * dy)))
            best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
    return best


def in_areas(x, y, areas, pad=0.0):
    return any(((x - ax) / (rx + pad)) ** 2 + ((y - ay) / (ry + pad)) ** 2 <= 1 for ax, ay, rx, ry in areas)


def main() -> None:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    lines = [[(wx(x), wy(y)) for x, y in line] for line in ROADS]
    areas = [(wx(x), wy(y), round(rx * S), round(ry * S)) for x, y, rx, ry in AREAS]
    out = []
    out.append('  corridors: {')
    out.append(f'    half: {HALF},')
    out.append('    lines: [')
    for line in lines:
        out.append('      [' + ', '.join(f'[{x}, {y}]' for x, y in line) + '],')
    out.append('    ],')
    out.append('    areas: [')
    for x, y, rx, ry in areas:
        out.append(f'      {{ x: {x}, y: {y}, rx: {rx}, ry: {ry} }},')
    out.append('    ],')
    out.append('  },')
    print('\n'.join(out))
    print('---camps')
    for code, name, mon, n, lv, x, y, elite in CAMPS:
        e = ', true' if elite else ''
        print(f"    camp('{code}', '{name}', '{mon}', {n}, {lv}, {wx(x)}, {wy(y)}{e}),")
    print('---flats')
    for a, x, y, w, water in FLATS:
        t = ', water: true' if water else ''
        print(f"    {{ asset: W3('{a}'), x: {wx(x)}, y: {wy(y)}, width: {w}, flat: true{t} }},")
    for a, x, y, w, flip in RIVER:
        f = ', flipX: true' if flip else ''
        print(f"    {{ asset: W3('{a}'), x: {wx(x)}, y: {wy(y)}, width: {w}, flat: true, water: true{f} }},")
    print('---stands')
    for a, x, y, w, extra in STANDS:
        e = (', ' + extra) if extra else ''
        print(f"    {{ asset: W3('{a}'), x: {wx(x)}, y: {wy(y)}, width: {w}{e} }},")
    # 树林:沿走廊两侧撒(离路 half+60 ~ half+900),越远越稀;避开空地与立物
    rnd = random.Random(29)
    trees = []
    stands = [(wx(x), wy(y), w) for _, x, y, w, _ in STANDS]
    for gy in range(-3300, 3400, 270):
        for gx in range(-6900, 6900, 320):
            x = gx + rnd.uniform(-110, 110)
            y = gy + rnd.uniform(-90, 90)
            d = dist_lines(x, y, lines)
            if d < HALF + 70 or in_areas(x, y, areas, 60):
                continue
            # 树往上画约 0.9 个宽:树冠上沿也不能盖到路 / 空地(否则路南侧的树会把人和路整个挡住)
            top_y = y + 460
            if dist_lines(x, top_y, lines) < HALF + 40 or in_areas(x, top_y, areas, 40) or dist_lines(x, y + 230, lines) < HALF:
                continue
            # 河道上不种树
            if any(abs(x - wx(rx)) < rw * 0.32 and abs(y - wy(ry)) < rw * 0.22 for _, rx, ry, rw, _ in RIVER):
                continue
            keep = 0.97 if d < HALF + 600 else 0.5 if d < HALF + 1200 else 0.12
            if rnd.random() > keep:
                continue
            if any(abs(x - sx) < w * 0.45 and -80 < y - sy < w * 0.5 for sx, sy, w in stands):
                continue
            trees.append((round(x), round(y)))
    print('---trees', len(trees))
    print('    ...[' + ', '.join(f'[{x}, {y}]' for x, y in trees) + ']')
    print('---roads (路刷用)')
    print('const WOODS_ROADS: number[][][] = [')
    for line in lines:
        print('  [' + ', '.join(f'[{x}, {y}]' for x, y in line) + '],')
    print('];')
    print('---waypoint', wx(180), wy(755), 'exit', wx(20), wy(760), 'spawn', wx(240), wy(735))


if __name__ == '__main__':
    main()
