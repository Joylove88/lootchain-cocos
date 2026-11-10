# -*- coding: utf-8 -*-
"""主城摆件规划 v2(11-10 用户:「摆件看着与地面不符,摆放的也很乱」+ 鸟瞰图「这个看着也不好看」):
原来民居按原型逐栋量 + 树 / 灌木 / 石堆在分区里随机撒,结果房子东一栋西一栋、树长在铺石上、城里堆着野外大石头。
改成按街道规划:
  民居  —— 沿横向街道两侧连排(脚线对齐到离街中线固定距离的平行线,间隔 30~70),竖向巷两侧按行叠;同一排宽度一致、户型轮换
  树    —— 南大道两侧行道树(同种同宽等距,脚下一圈草坪树池);地标门前左右对称一对;公园池塘一圈;
           城边草坡(nature)按「树丛」种:丛心互相隔开,每丛 3~4 棵同种,丛下整片草坪;离街至少 STREET_HALF + 260
  矮物  —— 不再随机撒灌木;树丛脚下一两丛灌木;地标门前角落各一丛;民居只有约两成在屋角摆木桶 / 长椅
  石堆  —— 城里全部去掉(野外件)
生成器 city_v4_gen.generate() 在 CITY_PLAN != 'v1' 时走这里。
"""
import math

import numpy as np

import city_v4_gen as G

HOUSE_SEQ = ['house_a', 'house_b', 'house_c', 'house_f', 'house_e', 'house_b', 'house_a', 'house_c']
HOUSE_W = {'house_a': 640, 'house_b': 620, 'house_c': 640, 'house_d': 500, 'house_e': 760, 'house_f': 600}
ROW_GAP = (30, 70)
ROW_STEP = 640                      # 街区内部横排行距(后排屋脚压在前排屋顶后面)
FRONT = G.STREET_HALF + 70          # 街北侧民居脚线离街中线
AVENUE_TREE_W = 430
GROVE_GAP = 1150
GROVE_ROAD = G.STREET_HALF + 260
REJ = {}
REJ_PTS = []


def _rej(k, x=None, y=None):
    REJ[k] = REJ.get(k, 0) + 1
    if x is not None:
        REJ_PTS.append((k, x, y))


def _rects(items):
    return [G.rect_of(s['asset'], s['x'], s['y'], s['width'])[0] for s in items]


def _free(rect, rects, tol=0.03):
    return not any(G.overlap(rect, r) > tol * min(G.area(rect), G.area(r)) for r in rects)


def _zone(g, x, y):
    return g.zone[g.idx(x, y)]


def plan_houses(g, stands, rnd):
    rects = _rects(stands)
    out = []
    seq = 0

    def put(name, x, y, w, flip):
        nonlocal seq
        asset = G.C4(name)
        rect, h = G.rect_of(asset, x, y, w)
        # 脚线落在街边带(side)或街区(block)里都行,但屋身中心必须在街区里
        if _zone(g, x, y) not in ('block', 'side') or _zone(g, x, y + h * 0.4) != 'block' or g.blocked[g.idx(x, y)]:
            _rej('zone', x, y)
            return None
        if not _free(rect, rects):
            _rej('overlap', x, y)
            return None
        # 民居之间:前后排互相遮一截是正常纵深,只拦同一排挤在一起的(脚点横向太近且前后差不到半个屋高)
        if any(abs(x - o['x']) < (w + o['width']) * 0.47 and abs(y - o['y']) < h * 0.5 for o in out):
            _rej('crowd', x, y)
            return None
        if not G.cover_ok(g, rect, y):
            _rej('cover', x, y)
            return None
        it = {'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'block': G.blk(w * 0.82, min(h * 0.45, 240)), 'house': True}
        if flip:
            it['flipX'] = True
        out.append(it)
        seq += 1
        return it

    # 横向街:两侧连排
    for line in G.ROAD_WORLD:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            seg = math.hypot(bx - ax, by - ay)
            tx, ty = (bx - ax) / max(1, seg), (by - ay) / max(1, seg)
            if abs(tx) < 0.85 or seg < 500:
                continue
            x0, x1 = sorted((ax, bx))
            for side in (1, -1):
                x = x0 + 120
                while x < x1 - 120:
                    name = HOUSE_SEQ[seq % len(HOUSE_SEQ)]
                    w = HOUSE_W[name] * rnd.uniform(0.98, 1.02)
                    cx = x + w / 2
                    road_y = ay + (cx - ax) * (ty / tx)
                    h = w * G.aspect(G.C4(name))
                    y = road_y + FRONT if side > 0 else road_y - FRONT - h * 0.92
                    if put(name, cx, y, w, seq % 3 == 1):
                        x += w + rnd.uniform(*ROW_GAP)
                    else:
                        x += 140
    # 街区内部:按横排填满(行距 ROW_STEP,同排连排、每 3 栋留一条小巷),排得整整齐齐
    for bx0, by0, bx1, by1 in G.BLOCK_RECTS_PX:
        x_left, x_right = G.wx(bx0), G.wx(bx1)
        y = G.wy(by1) + 60
        while y < G.wy(by0) - 300:
            x = x_left + 60
            run = 0
            while x < x_right - 300:
                name = HOUSE_SEQ[seq % len(HOUSE_SEQ)]
                w = HOUSE_W[name] * rnd.uniform(0.98, 1.02)
                # 放不下就试窄户型(house_d 500)再跳过,免得一个 NPC 站位 / 路灯把整排后半截空出来
                if not put(name, x + w / 2, y, w, seq % 3 == 1):
                    name, w = 'house_d', HOUSE_W['house_d'] * rnd.uniform(0.98, 1.02)
                    if not put(name, x + w / 2, y, w, seq % 3 == 1):
                        x += 160
                        continue
                run += 1
                x += w + rnd.uniform(*ROW_GAP) + (200 if run % 3 == 0 else 0)
            y += ROW_STEP
    # 竖向巷:两侧按行叠(屋后接屋)
    for line in G.ROAD_WORLD:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            seg = math.hypot(bx - ax, by - ay)
            tx, ty = (bx - ax) / max(1, seg), (by - ay) / max(1, seg)
            if abs(ty) < 0.85 or seg < 600:
                continue
            y0, y1 = sorted((ay, by))
            for side in (1, -1):
                y = y0 + 150
                while y < y1 - 150:
                    name = HOUSE_SEQ[seq % len(HOUSE_SEQ)]
                    w = HOUSE_W[name] * rnd.uniform(0.98, 1.02)
                    road_x = ax + (y - ay) * (tx / ty)
                    x = road_x + side * (G.STREET_HALF + 60 + w / 2)
                    h = w * G.aspect(G.C4(name))
                    if put(name, x, y, w, side < 0):
                        y += h * 0.62
                    else:
                        y += 160
    return out


def mark_gardens(g):
    """街区里排不下房子的空地(不压街 / 街边带 / 地标 / 民居)改成庭院草坪(分区 garden,地表画草)。
    原来这些地方是大片空铺石,鸟瞰像没填完。"""
    free = (g.zone == 'block') & ~g.blocked
    # 太窄的碎块(< 3 格宽)不改,免得街区里到处是绿斑
    k = 2
    pad = np.pad(free.astype(np.float32), k, mode='constant')
    H, W = free.shape
    dense = sum(pad[k + dy:k + dy + H, k + dx:k + dx + W] for dy in range(-k, k + 1) for dx in range(-k, k + 1)) / (2 * k + 1) ** 2
    g.zone[free & (dense > 0.85)] = 'garden'


def plan_greenery(g, stands, rnd):
    rects = _rects(stands)
    n_fixed = len(rects)
    tall, low = [], []

    grove_feet = []

    def tree(kind, x, y, w, flip=None, tol=0.05, road=G.STREET_HALF + 120, grove=False):
        asset = G.TALL_TREES[kind][0]
        rect, _ = G.rect_of(asset, x, y, w)
        i = g.idx(x, y)
        if g.blocked[i] or g.zone[i] in ('street', 'canal', 'wall', 'open') or g.d_road[i] < road:
            _rej('tree_zone')
            return False
        if grove:
            # 树丛内互相遮一截是正常的纵深,只拦脚点太近的;对其它物件仍按严格重叠
            if any(math.hypot(x - fx, (y - fy) * 1.6) < w * 0.42 for fx, fy in grove_feet):
                _rej('grove_crowd')
                return False
            others = rects[:n_fixed]
            if not _free(rect, others, 0.04):
                _rej('tree_overlap')
                return False
            tall.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'kind': 'tree', 'flipX': rnd.random() < 0.5})
            grove_feet.append((x, y))
            return True
        if not _free(rect, rects, tol):
            _rej('tree_overlap')
            return False
        tall.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'kind': 'tree',
                     'flipX': (rnd.random() < 0.5) if flip is None else flip})
        rects.append(rect)
        return True

    def bush(x, y, w=170):
        asset = G.LOW['bush'][0]
        rect, _ = G.rect_of(asset, x, y, w)
        i = g.idx(x, y)
        if g.blocked[i] or g.zone[i] in ('street', 'canal', 'wall') or not _free(rect, rects, 0.05):
            return False
        low.append({'asset': asset, 'x': round(x), 'y': round(y), 'width': round(w), 'flipX': rnd.random() < 0.5})
        rects.append(rect)
        return True

    # 1) 南大道(广场 → 运河主桥)两侧行道树:同种同宽、等距、左右对称
    ax = G.wx(886)
    y_top = G.wy(445) - 80 * G.S - 420   # 罗盘广场南沿再往下一截才开始种,不压广场
    y_bot = G.wy(G.CANAL_Y_PX) + 520
    y = y_top
    k = 0
    while y > y_bot:
        for sx in (-1, 1):
            tree('oak', ax + sx * (G.STREET_HALF + 170), y, AVENUE_TREE_W, flip=(sx > 0) ^ (k % 2 == 1), road=G.STREET_HALF + 100)
        y -= 640
        k += 1
    # 2) 地标门前左右一对(公会 / 学院 / 酒馆 / 兵营)
    for name, lx, ly, w, _b, _l in G.LANDMARKS:
        if name == 'cathedral':
            continue
        x, y = G.P(lx, ly)
        for sx in (-1, 1):
            tree('oak', x + sx * (w * 0.5 + 200), y - 40, 420, flip=sx > 0)
            bush(x + sx * (w * 0.42), y - 60)
    # 3) 公园:池塘一圈树(南边临河、东北入口留空)
    px, py = G.P(305, 640)
    for deg in range(0, 360, 34):
        a = math.radians(deg)
        if 200 <= deg <= 340 or 30 <= deg <= 70:
            continue
        tree('oak' if deg % 68 else 'pine', px + math.cos(a) * 1150, py + math.sin(a) * 640, 450, road=G.STREET_HALF + 160)
    # 4) 城边草坡:树丛(丛心互相隔开,每丛同种 3~4 棵)
    iy, ix = np.where((g.zone == 'nature') & ~g.blocked & (g.d_road > GROVE_ROAD + 200))
    order = list(range(len(iy)))
    rnd.shuffle(order)
    centers = []
    for k in order:
        x, y = float(g.X[iy[k], ix[k]]), float(g.Y[iy[k], ix[k]])
        if any(math.hypot(x - cx, (y - cy) * 1.3) < GROVE_GAP for cx, cy, _ in centers):
            continue
        kind = 'pine' if (y > G.wy(200) or abs(x) > G.MAP_W / 2 - 1600) and rnd.random() < 0.7 else 'oak'
        centers.append((x, y, kind))
    groves = []
    for cx, cy, kind in centers:
        n = 0
        lo, hi = G.TALL_TREES[kind][1]
        base_w = rnd.uniform(lo, hi)
        for j in range(rnd.choice((3, 3, 4))):
            a = rnd.uniform(0, math.tau)
            r = 0 if j == 0 else rnd.uniform(200, 300)
            if tree(kind, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.6, base_w * rnd.uniform(0.85, 1.0), road=GROVE_ROAD, grove=True):
                n += 1
        if n:
            groves.append((cx, cy))
            bush(cx + rnd.uniform(-260, 260), cy - 220)
    # 4b) 庭院草坪:按连通块种 —— 小块中心 1 棵,宽块左右对称 2 棵(不再随机撒)
    from scipy import ndimage
    lab, n_lab = ndimage.label((g.zone == 'garden') & (g.d_road > G.STREET_HALF + 160))
    for i_lab in range(1, n_lab + 1):
        yy, xx = np.where(lab == i_lab)
        if len(yy) < 30:
            continue
        xs, ys = g.X[yy, xx], g.Y[yy, xx]
        cx, cy = float(xs.mean()), float(ys.min() + (ys.max() - ys.min()) * 0.3)
        width = float(xs.max() - xs.min())
        w = 440
        if width > 1300:
            for sx in (-1, 1):
                tree('oak', cx + sx * width * 0.25, cy, w, flip=sx > 0, road=G.STREET_HALF + 160, grove=True)
        else:
            tree('oak', cx, cy, w, road=G.STREET_HALF + 160, grove=True)
    # 5) 民居:约两成屋角摆木桶 / 门旁长椅(贴墙根)
    for s in stands:
        if not s.get('house') or rnd.random() > 0.22:
            continue
        name = 'barrels' if rnd.random() < 0.6 else 'bench'
        asset, (lo, hi) = G.LOW[name]
        w = (lo + hi) / 2 * 0.9
        x = s['x'] + (1 if rnd.random() < 0.5 else -1) * s['width'] * 0.34
        rect, _ = G.rect_of(asset, x, s['y'] - 30, w)
        if _free(rect, rects, 0.05) and g.zone[g.idx(x, s['y'] - 30)] not in ('street', 'canal'):
            low.append({'asset': asset, 'x': round(x), 'y': round(s['y'] - 30), 'width': round(w), 'flipX': rnd.random() < 0.5})
            rects.append(rect)
    # 广场边长椅(两侧各一张)
    qx, qy = G.P(*G.PLAZA_PX)
    for sgn in (-1, 1):
        asset, (lo, hi) = G.LOW['bench']
        low.append({'asset': asset, 'x': round(qx + sgn * 1250), 'y': round(qy - 420), 'width': 220, 'flipX': sgn > 0})
    return tall, low, groves


def strip_wild(stands):
    """城里不放野外大石堆。"""
    return [s for s in stands if 'city4_rocks' not in s['asset']]
