# -*- coding: utf-8 -*-
"""主城 v3 布局整理(2026-11-24,用户:「AI 感太强了,摆件的位置也不好看,还有这个城墙右侧怎么是破的」)。

3D 底稿里的小摆件是 city_plan_v4.py 程序撒的:草坪上按 8 米格均匀撒灌木 / 野花 / 石头(圆点花布)、沿街每 26 米一张长椅、
路灯每 18 米左右交替(穿过广场的那几盏就立在广场中间)、每棵树脚一圈石头树池(草坪上也有)。重画时 Codex 会照着底稿一件件画出来,
所以「乱」要在底稿上先清掉,再按 v3 提示词重画(city_v4_paint.py,CITY_PAINT_STYLE=v3)。

  python tools/qa/city_v3_cleanup.py plan            按规则挑要删的东西 → v3_cleanup/removals.json + 总览标注图
  python tools/qa/city_v3_cleanup.py occmap          v4 遮挡块(pre25/city/o_*.webp)缩到成品精度存成 npy(guide / occ 要用)
  python tools/qa/city_v3_cleanup.py guide           在底稿上用周围的草地 / 石板纹理把它们(连影子)补掉 → city_v4_paint/base_v3.png
                                                     (挡在它前面的房子 / 树冠按遮挡视深保护起来不碰;补丁只从空地上取)
  python tools/qa/city_v3_cleanup.py occ [--install] 遮挡块里删掉的那些东西清掉(否则人走到原位置后面会被「看不见的灌木」盖住)
                                                     → v3_cleanup/occ_out/;--install 拷进 assets/resources/pre25/city/
  python tools/qa/city_v3_cleanup.py crops <x0> <y0> <x1> <y1>   底稿前后对比小图(成品像素)
  python tools/qa/city_v3_cleanup.py compare <拼图.png> <输出目录> [x0 y0 x1 y1]   线上 v2 整图 vs 新拼图 前后对比(周报用)
  python tools/qa/city_v3_cleanup.py review <整图 mosaic.png>      城里 3 × 3 审查小图 rv3_*.jpg
  python tools/qa/city_v3_cleanup.py walk            删掉的东西里会挡路的(石头 / 长椅 / 花槽 / 路灯 / 立像)从碰撞分层栅格里去掉,
                                                     重算可走格 → 和现在的比对 → 写回 Pre25CityData.ts 的 walk(加 --dry 只比对)

规则(策划口径):
- 野花 / 石头全删;灌木 / 大灌木只留贴着房子(3 米内)或城墙内脚(6 米内)的,街边和草坪中间的删;
- 长椅只留围着广场成圈的(同一广场 ≥ 3 张),沿街的删;花槽只留上城挡土墙内侧那一排;
- 路灯:立在广场里面的、城门 10 米内的删,沿街的留;
- 草坪上的树去掉脚下那圈石头(石板街上的行道树保留树池);
- 绿篱、花坛、木桶 / 木箱、手推车、草垛、喷泉、立像不动(城门广场的立像留着当进城的主景)。
灌木 / 野花在 3D 碰撞里本来就不算(树叶类不计碰撞),删了不影响可走格;石头 / 长椅 / 花槽 / 路灯删了要把碰撞放开(walk)。
产物在 %TEMP%/lootchain-qa/v3_cleanup/。
"""
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
QA = os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa')
OUT = os.path.join(QA, 'v3_cleanup')
PAINT = os.path.join(QA, 'city_v4_paint')
CAP = os.path.join(QA, 'pre25_v4')            # v4 正交分块拍摄目录(map.json + tiles)
BANDS = os.path.join(QA, 'v4_bands')          # collide_bands.py 取回的碰撞分层栅格
LAYOUT = os.path.join(ROOT, '周报截图', '2026-11-19_整城布局原型', 'v4主城口径', 'layout_v4')
DATA3D = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'guard3d', 'G3DCityV4Data.ts')
CITY_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'pre25', 'Pre25CityData.ts')
BUILD_MAP = os.path.join(ROOT, 'tools', 'proto3d', 'pre25', 'build_map.py')

K = 42.43          # 底稿(成品)像素 / 米:地面横向、物体高度
KV = 30.0          # 地面纵深方向每米在画面上的像素
SUN = (44.0, 4.0)  # 每米高的东西,影子往画面右边拖这么远(lamp10 实测:4.4 米路灯影长约 195 像素、略往下)
# 每类摆件:脚下半径(米)、高度(米)、会不会挡路(3D 碰撞里算不算)
KINDS = {
    'wildflowers': (1.0, 0.2, False), 'rocks': (0.75, 0.45, True), 'shrub': (0.8, 0.9, False), 'bush': (1.35, 1.25, False),
    'bench': (1.05, 0.95, True), 'planter': (0.9, 0.75, True), 'statue': (1.4, 4.6, True),
}


def load_3d():
    s = open(DATA3D, encoding='utf-8').read()
    return json.loads(s[s.index('{'):s.rindex('}') + 1])


D = None
M = None


def init():
    global D, M
    if D is None:
        D = load_3d()
        M = json.load(open(os.path.join(CAP, 'map.json'), encoding='utf-8'))


def rle_decode(rle, n):
    out = np.empty(n, np.uint8)
    i = 0
    for k in range(0, len(rle), 2):
        out[i:i + rle[k + 1]] = rle[k]
        i += rle[k + 1]
    return out


_H = None


def ground_h(x, z):
    global _H
    if _H is None:
        h = D['height']
        _H = (rle_decode(h['rle'], h['w'] * h['h']).reshape(h['h'], h['w']).astype(np.float32) / 10.0, h['res'])
    a, res = _H
    X0, Z0 = D['bounds'][0], D['bounds'][1]
    i = min(a.shape[1] - 1, max(0, int((x - X0) * res)))
    j = min(a.shape[0] - 1, max(0, int((z - Z0) * res)))
    return float(a[j, i])


def proj(x, z, y=0.0):
    """地面 (x, z, 高 y) → 底稿 / 成品像素(v4 拍摄整图的一半)"""
    p = math.radians(M['pitch'])
    yaw = math.radians(M.get('yaw', 0))
    hh = (math.cos(yaw), math.sin(yaw))
    rr = (-hh[1], hh[0])
    c0 = M['c0']
    sx0, _, _, sy1 = M['plane']
    dx, dz = x - c0[0], z - c0[2]
    sx = dx * rr[0] + dz * rr[1]
    sy = (dx * hh[0] + dz * hh[1]) * math.sin(p) + (y - c0[1]) * math.cos(p)
    return (sx - sx0) * M['ppm'] / 2, (sy1 - sy) * M['ppm'] / 2


def in_poly(x, z, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % n]
        if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
            inside = not inside
    return inside


def dist_seg(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    l2 = dx * dx + dz * dz or 1e-9
    t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / l2))
    return math.hypot(x - ax - dx * t, z - az - dz * t)


def dist_ring(x, z, ring):
    return min(dist_seg(x, z, *ring[i], *ring[(i + 1) % len(ring)]) for i in range(len(ring)))


def house_dist(x, z):
    """离最近一栋房子 / 重要建筑外沿的距离(按朝向旋转的矩形)"""
    best = 1e9
    for h in D['houses']:
        a = math.radians(h.get('yaw', 0))
        ux, uz = math.cos(a), -math.sin(a)
        lx = (x - h['x']) * ux + (z - h['z']) * uz
        lz = -(x - h['x']) * uz + (z - h['z']) * ux
        ex = max(0.0, abs(lx) - h['w'] / 2)
        ez = max(0.0, abs(lz) - h['d'] / 2)
        best = min(best, math.hypot(ex, ez))
    for k in D['keys']:
        _, _, kx, kz, w, dd = k[:6]
        ex = max(0.0, abs(x - kx) - w / 2)
        ez = max(0.0, abs(z - kz) - dd / 2)
        best = min(best, math.hypot(ex, ez))
    return best


def plaza_hit(x, z, pad=0.0):
    for name, sh in D['plazas']:
        if sh[0] == 'circle':
            if math.hypot(x - sh[1], z - sh[2]) <= sh[3] + pad:
                return name
        elif sh[0] == 'rect':
            # ['rect', cx, cz, w, d] 或 [x0, z0, x1, z1] 两种写法都兼容
            if len(sh) >= 5:
                cx, cz, w, d = sh[1], sh[2], sh[3], sh[4]
                if abs(x - cx) <= w / 2 + pad and abs(z - cz) <= d / 2 + pad:
                    return name
        elif sh[0] == 'poly':
            if in_poly(x, z, sh[1]) or (pad > 0 and dist_ring(x, z, sh[1]) <= pad):
                return name
    return None


def cmd_plan():
    init()
    os.makedirs(OUT, exist_ok=True)
    wall = D['wall']
    upper = D['upper']
    gates = list(D['gates'].values())
    rem = []
    keep_n = {}
    # 广场上成圈的长椅:按广场数
    bench_plaza = {}
    for kind, x, z, yaw in D['props']:
        if kind == 'bench':
            pn = plaza_hit(x, z, pad=2.5)
            if pn:
                bench_plaza.setdefault(pn, []).append((x, z))
    for kind, x, z, yaw in D['props']:
        why = None
        if kind in ('wildflowers', 'rocks'):
            why = '草坪点景'
        elif kind in ('shrub', 'bush'):
            if house_dist(x, z) > 3.0 and dist_ring(x, z, wall) > 6.0:
                why = '街边 / 草坪中间的散撒'
        elif kind == 'bench':
            pn = plaza_hit(x, z, pad=2.5)
            if not pn or len(bench_plaza.get(pn, [])) < 3:
                why = '沿街 / 不成圈的长椅'
        elif kind == 'planter':
            if dist_ring(x, z, upper) > 2.6:
                why = '沿街花槽'
        if why:
            rem.append({'kind': kind, 'x': x, 'z': z, 'yaw': yaw, 'why': why})
        else:
            keep_n[kind] = keep_n.get(kind, 0) + 1
    lamps_keep = 0
    for x, z in D['lamps']:
        pn = plaza_hit(x, z, pad=0.5)
        ng = min(math.hypot(x - g[0], z - g[1]) for g in gates)
        if pn or ng < 10:
            rem.append({'kind': 'lamp', 'x': x, 'z': z, 'why': ('广场中间的路灯' if pn else '城门口的路灯')})
        else:
            lamps_keep += 1
    keep_n['lamp'] = lamps_keep
    # 草坪上的树去掉树池:看树池外一圈底稿颜色是不是草
    base = Image.open(os.path.join(PAINT, 'base.png'))
    rings = 0
    for n, (x, z) in enumerate(list(D['avenue']) + list(D['trees'])):
        y = ground_h(x, z)
        g = 0
        for a in range(0, 360, 30):
            px, py = proj(x + math.cos(math.radians(a)) * 1.7, z + math.sin(math.radians(a)) * 1.7, y)
            r_, g_, b_ = base.getpixel((int(px), int(py)))[:3]
            g += 1 if (g_ > r_ * 1.08 and g_ > b_ * 1.12) else 0
        if g >= 7:
            h = 7.6 + ((n * 37) % 10) * 0.28
            rem.append({'kind': 'treering', 'x': x, 'z': z, 'r0': 0.3 + (h - 7) * 0.045, 'why': '草坪上的树池'})
            rings += 1
    for r in rem:
        r['y'] = ground_h(r['x'], r['z'])
    json.dump(rem, open(os.path.join(OUT, 'removals.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cnt = {}
    for r in rem:
        cnt[r['kind']] = cnt.get(r['kind'], 0) + 1
    print('删', cnt, ' 合计', len(rem))
    print('留', keep_n)
    # 总览标注(1/6)
    sm = base.resize((base.width // 6, base.height // 6), Image.BILINEAR)
    dr = ImageDraw.Draw(sm)
    col = {'lamp': (255, 220, 0), 'treering': (0, 200, 255), 'bench': (255, 60, 60), 'planter': (255, 140, 0)}
    for r in rem:
        px, py = proj(r['x'], r['z'], r['y'])
        c = col.get(r['kind'], (255, 0, 255))
        dr.ellipse([px / 6 - 4, py / 6 - 4, px / 6 + 4, py / 6 + 4], outline=c, width=2)
    sm.save(os.path.join(OUT, 'removals_overview.jpg'), quality=85)
    print('标注图', os.path.join(OUT, 'removals_overview.jpg'))


def load_removals():
    """删除清单;环境变量 LC_REMOVALS 可换成别的清单(v2 退路用 removals_v2.json:去掉树池和补不干净的那几件)"""
    return json.load(open(os.environ.get('LC_REMOVALS') or os.path.join(OUT, 'removals.json'), encoding='utf-8'))


# ── 遮罩 ──
def item_size(r):
    """(脚下半径, 高) 米"""
    if r['kind'] == 'lamp':
        return 0.45, 4.45
    if r['kind'] == 'treering':
        return 1.3, 0.3
    return KINDS[r['kind']][:2]


def item_mask(r):
    """返回 (要补的形状:本体 + 影子, 保护区形状, 只有本体的形状(清遮挡块用))。形状:('e', cx, cy, rx, ry) / ('p', [(x, y), ...]) /
    ('l', x0, y0, x1, y1, w) / ('ring', cx, cy, rx, ry, ix, iy);坐标 = 底稿(成品)像素。"""
    x, z, y = r['x'], r['z'], r['y']
    bx, by = proj(x, z, y)
    shapes = []
    protect = []
    body = []
    k = r['kind']
    if k == 'lamp':
        top = by - 4.45 * K
        body += [('p', [(bx - 9, top - 6), (bx + 9, top - 6), (bx + 9, by + 6), (bx - 9, by + 6)]),
                 ('p', [(bx - 18, top - 10), (bx + 18, top - 10), (bx + 18, by - 3.35 * K), (bx - 18, by - 3.35 * K)]),
                 ('e', bx, by, 14, 10)]
        shapes += body + [('l', bx, by, bx + SUN[0] * 4.4, by + SUN[1] * 4.4, 14),
                          ('e', bx + SUN[0] * 4.0, by + SUN[1] * 4.0, 22, 13)]
    elif k == 'treering':
        tw = r['r0'] * K * 1.3 + 3
        shapes += [('ring', bx, by - 3, 1.32 * K, 1.32 * KV + 4, 0.52 * K, 0.52 * KV)]
        protect += [('p', [(bx - tw, by - 400), (bx + tw, by - 400), (bx + tw, by + 7), (bx - tw, by + 7)])]
    else:
        rp, hp, _ = KINDS[k]
        body += [('e', bx, by - hp * K / 2, rp * K + 6, rp * KV + hp * K / 2 + 6)]
        shapes += list(body)
        for t in np.linspace(0, 1, 6):
            shapes.append(('e', bx + SUN[0] * hp * t, by + SUN[1] * hp * t, rp * K + 4, rp * KV + 4))
    return shapes, protect, body


def base_depth(r):
    """摆件脚下那一点的视深(米,和遮挡块同一套编码)"""
    p = math.radians(M['pitch'])
    _, by = proj(r['x'], r['z'], r['y'])
    sy = M['plane'][3] - (by * 2) / M['ppm']
    return sy / math.tan(p) - r['y'] / math.sin(p) + M['dist']


# ── 遮挡块(v4 渲染精度 35976×25560,每块 1024)缩到成品精度:2×2 取最近的视深、最大的不透明度 ──
OCC_DIR = os.path.join(ROOT, 'assets', 'resources', 'pre25', 'city')
_OCC = None


def occ_maps():
    global _OCC
    if _OCC is None:
        _OCC = (np.load(os.path.join(OUT, 'occ_d.npy'), mmap_mode='r'), np.load(os.path.join(OUT, 'occ_a.npy'), mmap_mode='r'))
    return _OCC


def depth_m(code):
    """遮挡块 r·256 + g → 视深(米)"""
    code = code.astype(np.float32)
    return M['near'] + (np.floor(code / 256) / 255.0 + np.mod(code, 256) / 65025.0) * (M['far'] - M['near'])


def cmd_occmap():
    init()
    IW, IH = M['img']
    W, H = IW // 2, IH // 2
    d = np.full((H, W), 65535, np.uint16)
    a = np.zeros((H, W), np.uint8)
    n = 0
    for r in range(math.ceil(IH / 1024)):
        for c in range(math.ceil(IW / 1024)):
            p = os.path.join(OCC_DIR, f'o_{r}_{c}.webp')
            if not os.path.exists(p):
                continue
            o = np.asarray(Image.open(p).convert('RGB'))
            code = o[..., 0].astype(np.uint16) * 256 + o[..., 1]
            al = o[..., 2]
            code[al == 0] = 65535
            code = code.reshape(512, 2, 512, 2).min(axis=(1, 3))
            al = al.reshape(512, 2, 512, 2).max(axis=(1, 3))
            y0, x0 = r * 512, c * 512
            hh, ww = min(512, H - y0), min(512, W - x0)
            d[y0:y0 + hh, x0:x0 + ww] = code[:hh, :ww]
            a[y0:y0 + hh, x0:x0 + ww] = al[:hh, :ww]
            n += 1
    np.save(os.path.join(OUT, 'occ_d.npy'), d)
    np.save(os.path.join(OUT, 'occ_a.npy'), a)
    print('遮挡块', n, '→', os.path.join(OUT, 'occ_d.npy'))


def draw_shapes(dr, shapes, ox, oy, fill=255):
    for s in shapes:
        if s[0] == 'e':
            _, cx, cy, rx, ry = s
            dr.ellipse([cx - rx - ox, cy - ry - oy, cx + rx - ox, cy + ry - oy], fill=fill)
        elif s[0] == 'p':
            dr.polygon([(px - ox, py - oy) for px, py in s[1]], fill=fill)
        elif s[0] == 'l':
            _, x0, y0, x1, y1, w = s
            dr.line([(x0 - ox, y0 - oy), (x1 - ox, y1 - oy)], fill=fill, width=int(w))
        elif s[0] == 'ring':
            _, cx, cy, rx, ry, ix, iy = s
            dr.ellipse([cx - rx - ox, cy - ry - oy, cx + rx - ox, cy + ry - oy], fill=fill)
            dr.ellipse([cx - ix - ox, cy - iy - oy, cx + ix - ox, cy + iy - oy], fill=0)
            # 石块高 0.22 米:上沿往上抬一点
            dr.ellipse([cx - rx - ox, cy - ry - 9 - oy, cx + rx - ox, cy + ry - 9 - oy], outline=fill, width=10)


def shapes_bbox(shapes):
    xs, ys = [], []
    for s in shapes:
        if s[0] == 'e':
            xs += [s[1] - s[3], s[1] + s[3]]
            ys += [s[2] - s[4], s[2] + s[4]]
        elif s[0] == 'p':
            xs += [p[0] for p in s[1]]
            ys += [p[1] for p in s[1]]
        elif s[0] == 'l':
            xs += [s[1] - s[5], s[3] + s[5]]
            ys += [s[2] - s[5], s[4] + s[5]]
        elif s[0] == 'ring':
            xs += [s[1] - s[3], s[1] + s[3]]
            ys += [s[2] - s[4] - 14, s[2] + s[4]]
    return int(min(xs)) - 2, int(min(ys)) - 2, int(max(xs)) + 3, int(max(ys)) + 3


def cmd_guide(src=None, dst=None, grow=0):
    """src / dst 缺省 = 底稿 base.png → base_v3.png。也能直接作用在画好的整图上(paint 命令:mosaic.png 带 json 原点,
    11-24 账户停用后不靠生图的退路):整图先垫回底稿大小的画布对齐坐标,遮罩再外扩 grow 像素(画出来的东西比 3D 略胖、影子更软)。"""
    init()
    rem = load_removals()
    src = src or os.path.join(PAINT, 'base.png')
    dst = dst or os.path.join(PAINT, 'base_v3.png')
    print('载入', src, '…', flush=True)
    srcim = Image.open(src).convert('RGB')
    origin = (0, 0)
    if os.path.exists(src[:-4] + '.json'):
        origin = tuple(json.load(open(src[:-4] + '.json', encoding='utf-8'))['origin'])
    IW, IH = M['img']
    if origin != (0, 0) or srcim.size != (IW // 2, IH // 2):
        canvas = Image.new('RGB', (IW // 2, IH // 2), (0, 0, 0))
        canvas.paste(srcim, origin)
        img = np.asarray(canvas).copy()
    else:
        img = np.asarray(srcim).copy()
    srcsize = srcim.size
    del srcim
    H, W = img.shape[:2]
    # 全部要删的区域(找补丁来源时避开:别把另一件要删的东西抄过来)
    allm = Image.new('L', (W, H), 0)
    dra = ImageDraw.Draw(allm)
    items = []
    for r in rem:
        sh, pr, _ = item_mask(r)
        draw_shapes(dra, sh, 0, 0)
        items.append((r, sh, pr))
    allm = np.asarray(allm) > 0
    occ_d, occ_a = occ_maps()
    # 大的先补(树池、路灯),小的后补
    items.sort(key=lambda t: -(shapes_bbox(t[1])[2] - shapes_bbox(t[1])[0]) * (shapes_bbox(t[1])[3] - shapes_bbox(t[1])[1]))
    st = {'ok': 0, 'weak': 0, 'protected_px': 0}
    for n, (r, sh, pr) in enumerate(items):
        x0, y0, x1, y1 = shapes_bbox(sh)
        mw, mh = x1 - x0, y1 - y0
        S = int(min(420, max(110, 2.6 * max(mw, mh))))
        cx0, cy0 = max(0, x0 - S - 16), max(0, y0 - S - 16)
        cx1, cy1 = min(W, x1 + S + 16), min(H, y1 + S + 16)
        crop = img[cy0:cy1, cx0:cx1].astype(np.float32)
        ch, cw = crop.shape[:2]
        mi = Image.new('L', (cw, ch), 0)
        draw_shapes(ImageDraw.Draw(mi), sh, cx0, cy0)
        m = np.asarray(mi) > 0
        pm = np.zeros((ch, cw), bool)
        if pr:
            pi = Image.new('L', (cw, ch), 0)
            draw_shapes(ImageDraw.Draw(pi), pr, cx0, cy0)
            pm = np.asarray(pi) > 0
        if grow:
            # 成品图里路灯 / 长椅画得比 3D 粗一圈、影子更长:再多扩一些
            g = grow + (int(os.environ.get('LC_KIND_GROW', '8')) if r['kind'] in ('lamp', 'bench') else 0)
            m = ndimage.binary_dilation(m, iterations=g)
            if pm.any():
                pm = ndimage.binary_dilation(pm, iterations=grow)
        # 挡在它前面的东西(房子、墙、树冠、别的摆件)不碰:遮挡块里比它近一截的像素
        oa = np.asarray(occ_a[cy0:cy1, cx0:cx1])
        od = depth_m(np.asarray(occ_d[cy0:cy1, cx0:cx1]))
        rp, hp = item_size(r)
        front = (oa > 100) & (od < base_depth(r) - hp * 0.7071 - rp - 0.6)
        front = ndimage.binary_dilation(front, iterations=1)
        st['protected_px'] += int((front & m).sum())
        pm |= front
        m &= ~pm
        if not m.any():
            continue
        # 补丁来源只取空地:别的要删的东西、保护区、任何立着的东西(房子 / 树 / 墙 / 留着的摆件)都不行
        forb = ndimage.binary_dilation(allm[cy0:cy1, cx0:cx1] | pm | (oa > 100), iterations=6)
        ring = ndimage.binary_dilation(m, iterations=10) & ~m & ~pm
        if ring.sum() < 20:          # 四周几乎都被保护区围住(房子后面露出来的一小条):比对圈就不扣保护区
            ring = ndimage.binary_dilation(m, iterations=10) & ~m
        ys, xs = np.nonzero(m)
        ry, rx = np.nonzero(ring)
        if rx.size == 0:
            continue
        best = None
        D0 = 0.62 * max(mw, mh) + 14
        for dist in (D0, D0 * 1.45, D0 * 2.1, D0 * 3.0):
            for ang in range(0, 360, 15):
                dx = int(round(math.cos(math.radians(ang)) * dist))
                dy = int(round(math.sin(math.radians(ang)) * dist))
                sx, sy = xs + dx, ys + dy
                srx, sry = rx + dx, ry + dy
                if sx.min() < 0 or sy.min() < 0 or sx.max() >= cw or sy.max() >= ch or srx.min() < 0 or sry.min() < 0 or srx.max() >= cw or sry.max() >= ch:
                    continue
                if forb[sy, sx].any():
                    continue
                a = crop[ry, rx]
                b = crop[sry, srx]
                shift = a.mean(0) - b.mean(0)
                ssd = float(((a - b - shift) ** 2).mean()) + 0.5 * float((shift ** 2).sum())
                # 补丁里面别有边缘(房子 / 树干的轮廓):内部梯度能量不能比周围大很多
                src = crop[sy, sx]
                e_in = float(src.std(0).mean())
                e_ring = float(a.std(0).mean())
                ssd += 4.0 * max(0.0, e_in - e_ring * 1.15) ** 2
                # 补丁里面的平均色要和周围一圈对得上(11-24 直接补成品图时:比对圈对上了、里面却抄来一块路面 → 草地上一块粉 / 沙色圆斑)
                ssd += 2.0 * float(np.abs(src.mean(0) + shift - a.mean(0)).sum()) ** 2
                if best is None or ssd < best[0]:
                    best = (ssd, dx, dy, shift)
        if best is None:
            # 实在找不到:按周围平均色扩散填(扩散 60 轮)
            st['weak'] += 1
            fill = crop.copy()
            known = ~m
            for _ in range(60):
                acc = np.zeros_like(fill)
                cnt = np.zeros((ch, cw), np.float32)
                for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    sh_k = np.roll(np.roll(known, ddy, 0), ddx, 1)
                    acc += np.roll(np.roll(fill, ddy, 0), ddx, 1) * sh_k[..., None]
                    cnt += sh_k
                upd = (~known) & (cnt > 0)
                fill[upd] = acc[upd] / cnt[upd][:, None]
                known = known | upd
            out = fill
        else:
            st['ok'] += 1
            _, dx, dy, shift = best
            src = np.roll(np.roll(crop, -dy, 0), -dx, 1) + shift
            out = src
        # 羽化:遮罩往外 3 像素渐变
        md = ndimage.binary_dilation(m, iterations=3) & ~pm
        alpha = ndimage.gaussian_filter(md.astype(np.float32), 1.6)
        alpha = np.maximum(alpha, m.astype(np.float32))
        alpha[pm] = 0
        blended = crop * (1 - alpha[..., None]) + out * alpha[..., None]
        img[cy0:cy1, cx0:cx1] = np.clip(blended, 0, 255).astype(np.uint8)
        if n % 50 == 0:
            print(f'  {n} / {len(items)}', flush=True)
    print('补丁', st)
    out_im = Image.fromarray(img)
    if origin != (0, 0) or srcsize != (W, H):
        out_im = out_im.crop((origin[0], origin[1], origin[0] + srcsize[0], origin[1] + srcsize[1]))
        json.dump({'origin': list(origin), 'size': list(srcsize)}, open(dst[:-4] + '.json', 'w', encoding='utf-8'))
    out_im.save(dst, compress_level=1)
    print('写出', dst)


def cmd_occ(install):
    """删掉的立物从遮挡块里清掉:本体范围内、视深落在它自己那一段的像素 → 没东西(r = g = 255、b = 0)"""
    init()
    rem = load_removals()
    IW, IH = M['img']
    per_chunk = {}
    for r in rem:
        if r['kind'] in ('treering', 'wildflowers'):
            continue          # 离地不到 0.4 米,遮挡块里本来就没有
        _, _, body = item_mask(r)
        full = []
        for s in body:          # 成品像素 → v4 渲染像素(× 2)
            if s[0] == 'e':
                full.append(('e', s[1] * 2, s[2] * 2, s[3] * 2, s[4] * 2))
            elif s[0] == 'p':
                full.append(('p', [(px * 2, py * 2) for px, py in s[1]]))
        x0, y0, x1, y1 = shapes_bbox(full)
        rp, hp = item_size(r)
        d0 = base_depth(r)
        lo, hi = d0 - hp * 0.7071 - rp - 0.6, d0 + rp + 0.6
        for cr in range(max(0, y0 // 1024), min(math.ceil(IH / 1024), y1 // 1024 + 1)):
            for cc in range(max(0, x0 // 1024), min(math.ceil(IW / 1024), x1 // 1024 + 1)):
                per_chunk.setdefault((cr, cc), []).append((full, lo, hi))
    od_dir = os.path.join(OUT, 'occ_out')
    shutil.rmtree(od_dir, ignore_errors=True)          # 每次按当前清单重出,别混进上一份清单改过的块
    os.makedirs(od_dir, exist_ok=True)
    changed = 0
    px_total = 0
    for (cr, cc), lst in sorted(per_chunk.items()):
        p = os.path.join(OCC_DIR, f'o_{cr}_{cc}.webp')
        if not os.path.exists(p):
            continue
        o = np.asarray(Image.open(p).convert('RGB')).copy()
        od = depth_m(o[..., 0].astype(np.uint16) * 256 + o[..., 1])
        hit = np.zeros(o.shape[:2], bool)
        for full, lo, hi in lst:
            mi = Image.new('L', (1024, 1024), 0)
            draw_shapes(ImageDraw.Draw(mi), full, cc * 1024, cr * 1024)
            mm = np.asarray(mi) > 0
            hit |= mm & (o[..., 2] > 0) & (od >= lo) & (od <= hi)
        n = int(hit.sum())
        if n == 0:
            continue
        o[hit] = (255, 255, 0)
        Image.fromarray(o).save(os.path.join(od_dir, f'o_{cr}_{cc}.webp'), 'WEBP', lossless=True, method=6)
        changed += 1
        px_total += n
    print(f'遮挡块改了 {changed} 块、清掉 {px_total} 像素 → {od_dir}')
    if install:
        for f in os.listdir(od_dir):
            if f.startswith('o_') and f.endswith('.webp'):
                shutil.copy(os.path.join(od_dir, f), os.path.join(OCC_DIR, f))
        print('已拷进', OCC_DIR)


def cmd_compare(a):
    """样张对比:compare <拼图 png(带同名 json 的 origin)> <输出目录> [x0 y0 x1 y1 成品像素裁切]
    左 = 现在线上的 v2 整图(mosaic.png),右 = 新拼的一片;另存 before / after 单张。"""
    src, outdir = a[0], a[1]
    os.makedirs(outdir, exist_ok=True)
    meta = json.load(open(src[:-4] + '.json', encoding='utf-8'))
    ox, oy = meta['origin']
    new = Image.open(src).convert('RGB')
    mm = json.load(open(os.path.join(PAINT, 'mosaic.json'), encoding='utf-8'))
    mx, my = mm['origin']
    if len(a) >= 6:
        x0, y0, x1, y1 = [int(v) for v in a[2:6]]
    else:
        x0, y0, x1, y1 = ox, oy, ox + new.width, oy + new.height
    after = new.crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy))
    before = Image.open(os.path.join(PAINT, 'mosaic.png')).crop((x0 - mx, y0 - my, x1 - mx, y1 - my)).convert('RGB')
    before.save(os.path.join(outdir, 'before.jpg'), quality=90)
    after.save(os.path.join(outdir, 'after.jpg'), quality=90)
    w = 1400
    h = int(before.height * w / before.width)
    pair = Image.new('RGB', (w * 2 + 12, h), (20, 20, 20))
    pair.paste(before.resize((w, h), Image.LANCZOS), (0, 0))
    pair.paste(after.resize((w, h), Image.LANCZOS), (w + 12, 0))
    pair.save(os.path.join(outdir, 'pair.jpg'), quality=88)
    print(os.path.join(outdir, 'pair.jpg'))


def cmd_review(a):
    """review <拼好的整图 mosaic.png(带同名 json 的 origin)> → v3_cleanup/rv3_<行><列>.jpg:城里范围切 3 × 3 张、缩到 1/3 看全城"""
    src = a[0]
    meta = json.load(open(src[:-4] + '.json', encoding='utf-8'))
    ox, oy = meta['origin']
    im = Image.open(src)
    X0, X1, Y0, Y1 = 1300, 16900, 1900, 12300          # 成品像素:城墙一圈外加一点
    w, h = (X1 - X0) // 3, (Y1 - Y0) // 3
    for r in range(3):
        for c in range(3):
            box = (X0 + c * w - ox, Y0 + r * h - oy, X0 + (c + 1) * w - ox, Y0 + (r + 1) * h - oy)
            t = im.crop(box)
            t = t.resize((t.width // 3, t.height // 3), Image.LANCZOS)
            dr = ImageDraw.Draw(t)
            dr.text((8, 6), f'{r}{c}', fill=(255, 255, 0))
            t.save(os.path.join(OUT, f'rv3_{r}{c}.jpg'), quality=86)
    print('审查图', os.path.join(OUT, 'rv3_00.jpg'), '…')


def cmd_patch(a):
    """patch <底图.png(带 json 原点)> <输出.png> <spec.json>:把别的图(已画好的 v3 块,带 json 原点)里圈定的多边形贴进底图。
    spec = [{"src": 路径, "poly": [[x, y], ...](成品像素), "feather": 10}, ...];边缘羽化,接缝一圈把贴进来的低频颜色对齐到底图
    (11-24 账户停用后:南门右侧墙 / 运河口那段墙用下午画好的 v3 块局部补,不再生成新图)。"""
    dst_p, out_p, spec_p = a[0], a[1], a[2]
    dj = json.load(open(dst_p[:-4] + '.json', encoding='utf-8'))
    dox, doy = dj['origin']
    dst = np.asarray(Image.open(dst_p).convert('RGB')).copy()
    for it in json.load(open(spec_p, encoding='utf-8')):
        sj = json.load(open(it['src'][:-4] + '.json', encoding='utf-8'))
        sox, soy = sj['origin']
        src_im = Image.open(it['src']).convert('RGB')
        F = int(it.get('feather', 10))
        poly = it['poly']
        x0 = int(min(p[0] for p in poly)) - 3 * F
        y0 = int(min(p[1] for p in poly)) - 3 * F
        x1 = int(max(p[0] for p in poly)) + 3 * F
        y1 = int(max(p[1] for p in poly)) + 3 * F
        d = dst[y0 - doy:y1 - doy, x0 - dox:x1 - dox].astype(np.float32)
        s = np.asarray(src_im.crop((x0 - sox, y0 - soy, x1 - sox, y1 - soy))).astype(np.float32)
        mi = Image.new('L', (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(mi).polygon([(px - x0, py - y0) for px, py in poly], fill=255)
        m = np.asarray(mi) > 0
        alpha = np.clip(ndimage.gaussian_filter(m.astype(np.float32), F / 2), 0, 1)
        inner = ndimage.gaussian_filter(ndimage.binary_erosion(m, iterations=F).astype(np.float32), F / 2)
        w = np.clip(1 - inner, 0, 1)
        if it.get('grass_fix'):          # 贴进来的草地整片对齐底图的低频颜色(v3 的草偏橄榄黄,只在接缝对齐会留一圈色差)
            g = (s[..., 1] > s[..., 0] * 1.04) & (s[..., 1] > s[..., 2] * 1.1)
            w = np.maximum(w, np.clip(ndimage.gaussian_filter(g.astype(np.float32), 3), 0, 1))
        w = w[..., None]
        d_lf = ndimage.gaussian_filter(d, (14, 14, 0))
        s_lf = ndimage.gaussian_filter(s, (14, 14, 0))
        s2 = s + (d_lf - s_lf) * w
        outc = d * (1 - alpha[..., None]) + s2 * alpha[..., None]
        dst[y0 - doy:y1 - doy, x0 - dox:x1 - dox] = np.clip(outc, 0, 255).astype(np.uint8)
        print('patched', os.path.basename(it['src']), (x0, y0, x1, y1))
    Image.fromarray(dst).save(out_p, compress_level=1)
    json.dump({'origin': [dox, doy], 'size': [dst.shape[1], dst.shape[0]]}, open(out_p[:-4] + '.json', 'w'))
    print('写出', out_p)


def cmd_crops(a):
    x0, y0, x1, y1 = [int(v) for v in a[:4]]
    b = Image.open(os.path.join(PAINT, 'base.png')).crop((x0, y0, x1, y1))
    c = Image.open(os.path.join(PAINT, 'base_v3.png')).crop((x0, y0, x1, y1))
    w, h = b.size
    sc = min(1.0, 1300 / w)
    b = b.resize((int(w * sc), int(h * sc)), Image.LANCZOS)
    c = c.resize((int(w * sc), int(h * sc)), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    b.save(os.path.join(OUT, f'crop_{x0}_{y0}_before.jpg'), quality=88)
    c.save(os.path.join(OUT, f'crop_{x0}_{y0}_after.jpg'), quality=88)
    print(os.path.join(OUT, f'crop_{x0}_{y0}_after.jpg'))


# ── 可走格 ──
def hex_rows_to_bits(rows, cols):
    g = np.zeros((len(rows), cols), np.uint8)
    for r, s in enumerate(rows):
        bits = ''.join(f'{int(ch, 16):04b}' for ch in s)[:cols]
        g[r] = np.frombuffer(bits.encode(), np.uint8) - 48
    return g


def read_city_walk(path):
    s = open(path, encoding='utf-8').read()
    d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    return d['walk'], s


def cmd_walk(dry):
    init()
    rem = load_removals()
    bm = json.load(open(os.path.join(BANDS, 'bands.json')))
    bands = np.load(os.path.join(BANDS, 'bands.npy'))
    cell = bm['cell']
    cleared = 0
    kept_tall = 0
    B64 = bands.astype(np.uint64)
    for r in rem:
        k = r['kind']
        if k == 'lamp':
            rad, top = 0.55, 5.0
        elif k in KINDS and KINDS[k][2]:
            rad, top = KINDS[k][0] + 0.25, 1.4
        else:
            continue
        # 只清「最高一层不超过摆件自己高度」的格子:旁边房子 / 墙的格子一直到屋顶都有东西,留着
        maxbit = int(math.floor((r['y'] + top + 1.0) / 0.25))
        limit = np.uint64((1 << (maxbit + 1)) - 1) if maxbit < 63 else np.uint64(0xFFFFFFFFFFFFFFFF)
        i0 = int((r['x'] - rad - bm['x0']) / cell)
        i1 = int((r['x'] + rad - bm['x0']) / cell) + 1
        j0 = int((r['z'] - rad - bm['z0']) / cell)
        j1 = int((r['z'] + rad - bm['z0']) / cell) + 1
        for j in range(max(0, j0), min(bm['nz'], j1)):
            for i in range(max(0, i0), min(bm['nx'], i1)):
                cx = bm['x0'] + (i + 0.5) * cell
                cz = bm['z0'] + (j + 0.5) * cell
                if math.hypot(cx - r['x'], cz - r['z']) <= rad and B64[j, i]:
                    if B64[j, i] & ~limit:
                        kept_tall += 1
                        continue
                    cleared += 1
                    bands[j, i] = 0
    nb = os.path.join(OUT, 'bands')
    os.makedirs(nb, exist_ok=True)
    np.save(os.path.join(nb, 'bands.npy'), bands)
    shutil.copy(os.path.join(BANDS, 'bands.json'), os.path.join(nb, 'bands.json'))
    print('碰撞格清掉', cleared, ' 范围内但有更高的东西(房子 / 墙 / 树干)留着', kept_tall, ' 栅格类型', bands.dtype)
    wo = os.path.join(OUT, 'walk_out')
    os.makedirs(wo, exist_ok=True)
    ov = os.path.join(ROOT, 'assets', 'resources', 'pre25', 'city', 'overview.jpg')
    shutil.copy(ov, os.path.join(wo, 'overview.jpg'))
    ts_new = os.path.join(OUT, 'walk_v3.ts')
    cmd = [sys.executable, '-I', BUILD_MAP, CAP, wo, ts_new, '--walkonly', '--unit=1.42', '--bands=' + nb, '--layout=' + LAYOUT]
    print(' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)
    new_walk, _ = read_city_walk(ts_new)
    cur_walk, cur_src = read_city_walk(CITY_TS)
    a = hex_rows_to_bits(cur_walk['rows'], cur_walk['cols'])
    b = hex_rows_to_bits(new_walk['rows'], new_walk['cols'])
    print('现在可走', int(a.sum()), ' 新', int(b.sum()), ' 新增', int((b & ~a).sum()), ' 变不能走', int((a & ~b).sum()))
    if dry:
        return
    if int((a & ~b).sum()) > 0:
        print('有格子从能走变成不能走,先别写回(看 walk_diff.png)')
    i = cur_src.index('"walk":')
    j = cur_src.index('"lights":')
    seg = '"walk":' + json.dumps(new_walk, ensure_ascii=False, separators=(',', ':')) + ','
    open(CITY_TS, 'w', encoding='utf-8', newline='\n').write(cur_src[:i] + seg + cur_src[j:])
    print('写回', CITY_TS)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    c = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if c == 'plan':
        cmd_plan()
    elif c == 'occmap':
        cmd_occmap()
    elif c == 'guide':
        cmd_guide()
    elif c == 'paint':          # paint <画好的整图.png(带 json 原点)> <输出.png> [外扩像素,缺省 5]
        cmd_guide(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 5)
    elif c == 'occ':
        cmd_occ('--install' in sys.argv)
    elif c == 'crops':
        cmd_crops(sys.argv[2:])
    elif c == 'compare':
        cmd_compare(sys.argv[2:])
    elif c == 'review':
        cmd_review(sys.argv[2:])
    elif c == 'patch':
        cmd_patch(sys.argv[2:])
    elif c == 'walk':
        cmd_walk('--dry' in sys.argv)
