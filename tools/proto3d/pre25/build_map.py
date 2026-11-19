# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 0 期:把 capture_map.py 拍的分块拼成整张地图,切成游戏要的块,生成可走格和数据。

  python -I tools/proto3d/pre25/build_map.py <拍摄目录> <资源输出目录> <数据 .ts 输出> [--chunk=1024] [--q=86] [--unit=1.7]

产物:
  <资源输出目录>/c_<行>_<列>.webp  颜色块(有损)(chunk × chunk,最后一行 / 列不足的补边)
  <资源输出目录>/o_<行>_<列>.webp  遮挡块(无损):r / g = 挡人的东西(建筑、摆件、树、墙台阶)的视深(16 位,按近 / 远裁剪面归一),b = 它的不透明度;
                                  没东西的地方 r = g = 255、b = 0(= 无穷远,永远不挡人)
  <资源输出目录>/overview.jpg      整图缩略(小地图 / 地图页)
  <数据 .ts>                       PRE25_CITY_DATA:尺寸、块数、相机参数、可走格(十六进制行)、灯
以及拍摄目录里的 full_bg.jpg / full_occ.png 方便看。

坐标约定(和游戏里 2D 世界一致):整图中心 = 地图原点,x 往右、y 往上;1 个图片像素 = unit 个世界单位。
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image


def save_retry(im, path, *a, **k):
    """Creator 开着时会短暂占住正在导入的图(Windows 报 Errno 22),重试几次(11-20)。"""
    import time as _t
    for n in range(20):
        try:
            return im.save(path, *a, **k)
        except OSError:
            if n == 19:
                raise
            _t.sleep(0.5)

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
CAP, OUT, TS = ARGS[0], ARGS[1], ARGS[2]
CHUNK = int(OPT.get('chunk', 1024))
Q = int(OPT.get('q', 72))          # 11-20:82 → 72(草 / 细叶让颜色块翻倍;抽样对比 74 以下肉眼无差)
DEPTH_LO = int(OPT.get('depthlo', 4))          # 深度低 8 位只留几位(12 位 ≈ 6 厘米一档,判定余量 35 厘米;省一半多体积)
UNIT = float(OPT.get('unit', 1.7))
CELL = int(OPT.get('cell', 16))
os.makedirs(OUT, exist_ok=True)

M = json.load(open(os.path.join(CAP, 'map.json'), encoding='utf-8'))
IW, IH = M['img']
TW, TH = M['tile']
COLS, ROWS = M['grid']
MG = M['margin']
PPM = M['ppm']
p = math.radians(M['pitch'])
sx0, sy0, sx1, sy1 = M['plane']
C0 = M['c0']
YAW = M.get('yaw', 0.0)
HH = (math.cos(math.radians(YAW)), 0.0, math.sin(math.radians(YAW)))
RR = (-HH[2], 0.0, HH[0])
NEAR, FAR = M['near'], M['far']


def load(path, mode='RGB'):
    return np.asarray(Image.open(path).convert(mode), dtype=np.float32)


def stitch(kind):
    full = np.zeros((ROWS * TH, COLS * TW, 3), np.float32)
    for r in range(ROWS):
        for c in range(COLS):
            path = os.path.join(CAP, 'tiles', f'{r}_{c}_{kind}.png')
            if not os.path.exists(path):          # 多边形外没拍的块:留黑(颜色)/ 留 0(深度、蒙版 → 当成没东西)
                if kind.startswith('m_') and kind.endswith('_255'):
                    full[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = 255
                continue
            a = load(path)
            full[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = a[MG:MG + TH, MG:MG + TW]
    return full[:IH, :IW]


print('stitch bg')
bg = stitch('bg')
print('stitch depth')
dep = stitch('depth')
print('stitch masks')
alpha = np.zeros((IH, IW), np.float32)
alpha_solid = np.zeros((IH, IW), np.float32)          # 只算实心的(建筑、摆件、墙、台阶),不算树:可走格的「被盖住」只看它
for g in ('bld', 'trees', 'stone'):
    a = stitch(f'm_{g}_0')
    b = stitch(f'm_{g}_255')
    ag = np.clip(1 - (b - a).mean(-1) / 255.0, 0, 1)
    alpha = np.maximum(alpha, ag)
    if g != 'trees':
        alpha_solid = np.maximum(alpha_solid, ag)
# 1 像素以下的毛刺(块与块之间、远处天空)清掉
alpha[alpha < 0.03] = 0

bg8 = np.clip(bg, 0, 255).astype(np.uint8)
if 'walkonly' not in OPT:
    Image.fromarray(bg8).save(os.path.join(CAP, 'full_bg.jpg'), quality=90)
occ = np.zeros((IH, IW, 3), np.uint8)
solid = alpha > 0
occ[..., 0] = np.where(solid, dep[..., 0], 255).astype(np.uint8)
occ[..., 1] = np.where(solid, dep[..., 1], 255).astype(np.uint8)
occ[..., 2] = (alpha * 255 + 0.5).astype(np.uint8)
if 'walkonly' not in OPT:
    Image.fromarray(occ).save(os.path.join(CAP, 'full_occ.png'))

# ── 切块 ──
ccols, crows = math.ceil(IW / CHUNK), math.ceil(IH / CHUNK)
pad_w, pad_h = ccols * CHUNK, crows * CHUNK
bgp = np.zeros((pad_h, pad_w, 3), np.uint8)
bgp[:IH, :IW] = bg8
# 补边:往外复制最后一行 / 列(块边取样不发黑)
bgp[IH:, :IW] = bg8[IH - 1:IH]
bgp[:, IW:] = bgp[:, IW - 1:IW]
occp = np.zeros((pad_h, pad_w, 3), np.uint8)
occp[..., 0] = 255
occp[..., 1] = 255
occp[:IH, :IW] = occ
# 贴地的东西不进遮挡(11-20):草丛 / 树池矮石 / 花坛沿离地不到 0.4 米,挡不住人,却让整片草地的深度都进了遮挡图(无损压不动,26MB → 52MB)。
# 按布局高度图算每个像素看到的地面深度(迭代两次找射线落地点),比它近不到 0.4 米高的遮挡像素清掉。人脚要落进这条带,得站在离它 < 0.4 米的地方 = 碰撞体里。
FLAT_H = float(OPT.get('flath', 0.4))
if 'layout' in OPT and FLAT_H > 0:
    _lg = json.load(open(OPT['layout'] + '_grid.json'))
    _Hg = np.load(OPT['layout'] + '_height.npy')


def flatten_low(o, r, c):
    if 'layout' not in OPT or FLAT_H <= 0:
        return 0
    jj, ii = np.mgrid[r * CHUNK:(r + 1) * CHUNK, c * CHUNK:(c + 1) * CHUNK]
    sxv_ = sx0 + (ii + 0.5) / PPM
    syv_ = sy1 - (jj + 0.5) / PPM
    Hh = np.zeros(sxv_.shape, np.float32)
    for _ in range(3):
        al = (syv_ - Hh * math.cos(p)) / math.sin(p)
        Xg = C0[0] + sxv_ * RR[0] + al * HH[0]
        Zg = C0[2] + sxv_ * RR[2] + al * HH[2]
        gi_ = np.clip(((Xg - _lg['x0']) * _lg['res']).astype(int), 0, _lg['w'] - 1)
        gj_ = np.clip(((Zg - _lg['z0']) * _lg['res']).astype(int), 0, _lg['h'] - 1)
        Hh = _Hg[gj_, gi_]
    gdp = syv_ / math.tan(p) - Hh / math.sin(p) + M['dist']
    od = NEAR + (o[..., 0] / 255.0 + o[..., 1] / 255.0 / 255.0) * (FAR - NEAR)
    low = (o[..., 2] > 0) & (od > gdp - FLAT_H / math.sin(p))
    o[low, 0] = 255
    o[low, 1] = 255
    o[low, 2] = 0
    return int(low.sum())


flat_n = 0
total_c = total_o = 0
present = []          # 存下来的块 [行, 列];整块落在没拍的区域(纯黑)的不存,游戏里也不铺
for r in range(crows):
    for c in range(ccols):
        sl = (slice(r * CHUNK, (r + 1) * CHUNK), slice(c * CHUNK, (c + 1) * CHUNK))
        if bgp[sl].max() < 6:
            continue
        present.append([r, c])
        if 'walkonly' in OPT:          # 只重算可走格(调碰撞时):块已经写过,不再编码
            continue
        cp = os.path.join(OUT, f'c_{r}_{c}.webp')
        save_retry(Image.fromarray(bgp[sl]), cp, 'WEBP', quality=Q, method=6)
        op = os.path.join(OUT, f'o_{r}_{c}.webp')
        o = occp[sl].copy()
        flat_n += flatten_low(o, r, c)
        o[..., 1] &= 0xFF ^ ((1 << (8 - DEPTH_LO)) - 1)
        save_retry(Image.fromarray(o), op, 'WEBP', lossless=True, method=6)
        total_c += os.path.getsize(cp)
        total_o += os.path.getsize(op)
if 'walkonly' not in OPT:
    print(f'贴地遮挡清掉 {flat_n} 像素')
    ov = Image.fromarray(bg8)
    ov.thumbnail((2048, 2048), Image.LANCZOS)          # 地图页要铺满全屏看得清(11-19 从 1024 提上来)
    ov.save(os.path.join(OUT, 'overview.jpg'), quality=85)
print(f'chunks {ccols}x{crows} (存了 {len(present)} 块)  color {total_c / 1e6:.2f}MB  occ {total_o / 1e6:.2f}MB  overview {os.path.getsize(os.path.join(OUT, "overview.jpg")) / 1e3:.0f}KB')

# ── 可走格:图片里每格中心 → 画面平面 → 地面(y = 0)上的世界点 → 在广场里、不在挡路块里、不上台地 ──
B = M['bounds']
area = OPT.get('area', '-20,20,-14,14').split(',')
AX0, AX1, AZ0, AZ1 = [float(v) for v in area]
XMAX = float(OPT.get('xmax', 11.0))          # 整城用 --xmax=999(台地 / 大教堂由挡路块挡)          # 台地(高 2.4 米)这一期不上:台阶脚下为止
R = 0.35
solids = M['scene']['solids']
# --collide=<目录>:挡路按模型真实形状(collide_raster.js 出的 collide.npy 挡路 + collide_over.npy 头顶有遮盖,
# collide_meta.json 范围);这时挡路块只留「逻辑挡块」(高 ≤ 1 米:运河水面这类模型上看不出来、但不能走的)。
# 11-19 用户:主城碰撞拦得太广,空地走不过去 —— 原来每栋楼 / 每棵树一个放宽的方框。
COL = None
if 'collide' in OPT:
    from scipy import ndimage
    cd = OPT['collide']
    cm = json.load(open(os.path.join(cd, 'collide_meta.json')))
    obst = np.load(os.path.join(cd, 'collide.npy')).astype(bool)
    over = np.load(os.path.join(cd, 'collide_over.npy')).astype(bool)
    rc = max(1, round(R / cm['cell']))
    yy, xx = np.mgrid[-rc:rc + 1, -rc:rc + 1]
    disk = (xx * xx + yy * yy) <= rc * rc
    # 人当半径 R 的圆:实物往外胀 R。「头顶有遮盖」只取往里缩 1.2 米的芯(楼里面):屋檐比墙出挑,檐下那一条在斜视角里
    # 是看得见的街面,不能挡;再把墙围起来的洞填实(模型外墙有缝,光靠墙会把楼里面当空地)
    core = ndimage.binary_erosion(over, structure=np.ones((25, 25), bool))
    COL = ndimage.binary_fill_holes(ndimage.binary_dilation(obst, structure=disk) | core)
    solids = [s for s in solids if s[4] <= 1]
    print(f'collide: 挡路 {obst.mean():.3f} 遮盖 {over.mean():.3f} → 合计 {COL.mean():.3f};逻辑挡块 {len(solids)} 个')
gc, gr = math.ceil(IW / CELL), math.ceil(IH / CELL)
grid = np.zeros((gr, gc), np.uint8)
# ── 主城 v4(--bands=<collide_bands.py 的目录> --layout=<city_plan_v4 的布局前缀>):向量化算可走格 ──
# 地面高度(上城 / 台阶 / 坡道 / 桥面)来自布局的高度图;挡路 = 该格地面 +0.3 ~ +1.9 米之间有东西(分层栅格);头顶有遮盖的芯 + 填洞 = 楼里面;
# 水面(河 / 港湾 / 池塘)不能走,桥面能走;相邻格高差超过 0.6 米(挡土墙边)不能走。
V4 = 'bands' in OPT
HEIGHT_OUT = None
if V4:
    from scipy import ndimage
    bm = json.load(open(os.path.join(OPT['bands'], 'bands.json')))
    bands = np.load(os.path.join(OPT['bands'], 'bands.npy'))
    LP = OPT['layout']
    lg = json.load(open(LP + '_grid.json'))
    Hgrid = np.load(LP + '_height.npy')
    bridge = np.load(LP + '_bridge.npy')
    surf = np.load(LP + '_surface.npy')
    inside = np.load(LP + '_inside.npy')
    lay = json.load(open(LP + '.json', encoding='utf-8'))
    HEIGHT_OUT = (lg, Hgrid)
    # 分层栅格每格的地面高度(从布局高度图取)
    bx = bm['x0'] + (np.arange(bm['nx']) + 0.5) * bm['cell']
    bz = bm['z0'] + (np.arange(bm['nz']) + 0.5) * bm['cell']
    hi_ = np.clip(((bx - lg['x0']) * lg['res']).astype(int), 0, lg['w'] - 1)
    hj_ = np.clip(((bz - lg['z0']) * lg['res']).astype(int), 0, lg['h'] - 1)
    Hb = Hgrid[hj_][:, hi_]
    # 0.25 米一层(第 k 层 = -1 + 0.25k 米起):挡路窗口 = 下沿 ≥ 地面 +0.25(台阶面 / 桥面的误差在这之内)~ 地面 +1.9
    lo = np.ceil((Hb + 1.25) / 0.25).astype(np.uint64)
    hi = np.minimum(np.floor((Hb + 2.9) / 0.25), 62).astype(np.uint64)
    B = bands.astype(np.uint64)
    one = np.uint64(1)
    win = ((one << (hi + one)) - one) & ~((one << lo) - one)
    obst = (B & win) != 0
    over = (B >> (hi + one)) != 0
    rc = max(1, round(R / bm['cell']))
    yy, xx = np.mgrid[-rc:rc + 1, -rc:rc + 1]
    disk = (xx * xx + yy * yy) <= rc * rc
    core = ndimage.binary_erosion(over, structure=np.ones((13, 13), bool))
    COLB = ndimage.binary_fill_holes(ndimage.binary_dilation(obst, structure=disk) | core)
    # 布局栅格上的「不能走」:城墙内侧以外、水(桥面除外)、池塘、挡土墙边的陡坎
    water = (surf == 3) & ~bridge
    gx = lg['x0'] + (np.arange(lg['w']) + 0.5) / lg['res']
    gz = lg['z0'] + (np.arange(lg['h']) + 0.5) / lg['res']
    GX, GZ = np.meshgrid(gx, gz)
    pe = OPT.get('pond', '-68,-51,7,4.5').split(',')          # 王都花园的池塘(椭圆:中心 x, z,半轴 rx, rz)
    pe = [float(v) for v in pe]
    pondm = ((GX - pe[0]) / (pe[2] + 0.4)) ** 2 + ((GZ - pe[1]) / (pe[3] + 0.4)) ** 2 <= 1
    dmax = np.zeros_like(Hgrid)
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            dmax = np.maximum(dmax, np.abs(Hgrid - np.roll(np.roll(Hgrid, dj, 0), di, 1)))
    cliff = ndimage.binary_dilation(dmax > 0.6, iterations=1)
    BADL = ~inside | water | pondm | cliff
    # 每个可走格中心 → 画面平面 → 地面 (X, Z)(y = 0 投影,和游戏里的 2D 逻辑坐标一致)
    ixs = (np.arange(gc) + 0.5) * CELL
    iys = (np.arange(gr) + 0.5) * CELL
    IXc, IYc = np.meshgrid(ixs, iys)
    sxv = sx0 + IXc / PPM
    syv = sy1 - IYc / PPM
    tv = syv / math.sin(p)
    Xw = C0[0] + sxv * RR[0] + tv * HH[0]
    Zw = C0[2] + sxv * RR[2] + tv * HH[2]
    bi = ((Xw - bm['x0']) / bm['cell']).astype(int)
    bj = ((Zw - bm['z0']) / bm['cell']).astype(int)
    okb = (bi >= 0) & (bj >= 0) & (bi < bm['nx']) & (bj < bm['nz'])
    li = ((Xw - lg['x0']) * lg['res']).astype(int)
    lj = ((Zw - lg['z0']) * lg['res']).astype(int)
    okl = (li >= 0) & (lj >= 0) & (li < lg['w']) & (lj < lg['h'])
    g = okb & okl
    g[g] = ~COLB[bj[g], bi[g]] & ~BADL[lj[g], li[g]]
    if 'nohide' not in OPT:
        # 人站在这里会几乎整个被前面的房子 / 墙挡住(身上 4 个点里 ≥ 3 个被实心东西盖住;树冠不算)→ 不让走
        # (11-19 跑图:房子背后、西南城墙里侧的窄条里,主角整个看不见)。按抬高后的脚底算(上城 / 台阶 / 桥面)
        Hc = np.zeros(g.shape, np.float32)
        Hc[okl] = Hgrid[lj[okl], li[okl]]
        footIy = IYc - Hc * math.cos(p) * PPM
        gd = (sy1 - IYc / PPM) / math.tan(p) + M['dist'] - Hc * math.sin(p)
        hid = np.zeros(g.shape, np.int8)
        xx_ = np.clip(IXc.astype(int), 0, IW - 1)
        for up in (25, 60, 95, 130):
            yy_ = np.clip((footIy - up).astype(int), 0, IH - 1)
            a_ = alpha_solid[yy_, xx_] > 0.5
            od_ = NEAR + (dep[yy_, xx_, 0] / 255.0 + dep[yy_, xx_, 1] / 255.0 / 255.0) * (FAR - NEAR)
            hid += (a_ & (od_ < gd - up * math.tan(p) / PPM - 0.35)).astype(np.int8)
        # 脚下往前(画面下方)40 像素的地面也要露着:不然脚正好踩在前面那堵墙 / 屋檐的边上,看着像站在墙头 / 屋顶上(第二轮跑图:西城墙里侧)
        yy_ = np.clip((footIy + 40).astype(int), 0, IH - 1)
        a_ = alpha_solid[yy_, xx_] > 0.5
        od_ = NEAR + (dep[yy_, xx_, 0] / 255.0 + dep[yy_, xx_, 1] / 255.0 / 255.0) * (FAR - NEAR)
        edge = a_ & (od_ < gd - 40 / PPM / math.tan(p) - 0.35) & (Hc < 0.05)          # 只在平地上判(台阶 / 桥 / 坡道是斜面,按平地算会全判成「踩边」)          # 画面往下 = 离镜头更近:那里的平地视深是 gd − 40 像素对应的米数,比它还近才算挡在前面
        hid += (edge * 3).astype(np.int8)
        before = int(g.sum())
        nearGate = np.zeros(g.shape, bool)
        for gx_, gz_ in lay.get('gates', {}).values():          # 城门里面 9 米内不按这条去掉(出口在门洞里,要能走进去)
            nearGate |= (Xw - gx_) ** 2 + (Zw - gz_) ** 2 < 81
        if 'dbghide' in OPT:          # 调试:被这条去掉的格子存成图(红 = 身体被挡,黄 = 脚踩边沿)
            dbg = np.zeros(g.shape + (3,), np.uint8)
            dbg[g] = (40, 120, 40)
            dbg[g & (hid >= 3) & ~nearGate] = (230, 60, 60)
            dbg[g & edge & ~nearGate] = (240, 210, 40)
            Image.fromarray(dbg).save(OPT['dbghide'])
        # 台阶 / 坡道 / 桥面(高度在变的地方,往外 1.5 米)两条都不判:那是必经的路,而且斜面按平地算会误判
        slopeL = ndimage.binary_dilation(dmax > 0.04, iterations=3)
        onSlope = np.zeros(g.shape, bool)
        onSlope[okl] = slopeL[lj[okl], li[okl]]
        g &= (hid < 3) | nearGate | onSlope
        print(f'v4 hide: 会被整个挡住的格子去掉 {before - int(g.sum())} 个')
    grid = g.astype(np.uint8)
    lab_, nlab = ndimage.label(grid)
    if nlab > 1:
        sz = ndimage.sum(grid, lab_, range(1, nlab + 1))
        keep = int(np.argmax(sz)) + 1
        print(f'walk 连通块 {nlab} 个,只留最大的({int(sz[keep - 1])} 格),去掉孤岛 {int(grid.sum() - sz[keep - 1])} 格')
        grid = (lab_ == keep).astype(np.uint8)
    print(f'v4 collide: 挡路 {obst.mean():.3f} 遮盖 {over.mean():.3f} 合计 {COLB.mean():.3f}')
for r in (range(0) if V4 else range(gr)):
    for c in range(gc):
        ix, iy = (c + 0.5) * CELL, (r + 0.5) * CELL
        sx = sx0 + ix / PPM
        sy = sy1 - iy / PPM
        # 画面平面 → 地面:横向沿 R、纵向沿水平朝向 H 走 sy / sin(俯角)
        t = sy / math.sin(p)
        X = C0[0] + sx * RR[0] + t * HH[0]
        Z = C0[2] + sx * RR[2] + t * HH[2]
        ok = AX0 + R < X < min(AX1, XMAX) - R and AZ0 + R < Z < AZ1 - R
        if ok:
            # 地面被近处的实心东西(屋顶、墙)盖住的格子不让走:人走进去会整个被挡住,玩家看不见自己。
            # 树冠不算(11-19 用户录屏卡位:枝杈把树下的地切成一块块孤岛,人钻进去出不来;站在树下本来也看得见人)
            y0, y1, x0, x1 = int(r * CELL), int(min(IH, (r + 1) * CELL)), int(c * CELL), int(min(IW, (c + 1) * CELL))
            ground_d = sy / math.tan(p) + M['dist']
            od = NEAR + (dep[y0:y1, x0:x1, 0] / 255.0 + dep[y0:y1, x0:x1, 1] / 255.0 / 255.0) * (FAR - NEAR)
            cover = (alpha_solid[y0:y1, x0:x1] > 0.5) & (od < ground_d - 0.3)
            if cover.mean() > 0.35 and 'nocover' not in OPT:          # 整城用 --nocover:被挡住的地方主角显示成半透明剪影(pre25-actor.effect),不再整格禁走
                ok = False
        if ok and COL is not None:
            ci = int((X - cm['x0']) / cm['cell'])
            cj = int((Z - cm['z0']) / cm['cell'])
            if not (0 <= ci < cm['nx'] and 0 <= cj < cm['nz']) or COL[cj, ci]:
                ok = False
        if ok:
            for s in solids:
                if abs(X - s[0]) < s[2] + R and abs(Z - s[1]) < s[3] + R:
                    ok = False
                    break
        grid[r, c] = 1 if ok else 0

# 只留连成一片的最大那块(四邻接):零碎的孤岛走进去就出不来
lab = np.zeros(grid.shape, np.int32)
sizes = [0]
for r0 in (range(0) if V4 else range(gr)):
    for c0 in range(gc):
        if grid[r0, c0] and not lab[r0, c0]:
            k = len(sizes)
            lab[r0, c0] = k
            stack = [(r0, c0)]
            n = 0
            while stack:
                r, c = stack.pop()
                n += 1
                for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                    if 0 <= rr < gr and 0 <= cc < gc and grid[rr, cc] and not lab[rr, cc]:
                        lab[rr, cc] = k
                        stack.append((rr, cc))
            sizes.append(n)
if len(sizes) > 1:
    best = int(np.argmax(sizes))
    dropped = sum(sizes) - sizes[best]
    grid = (lab == best).astype(np.uint8)
    print(f'walk 连通块 {len(sizes) - 1} 个,只留最大的({sizes[best]} 格),去掉孤岛 {dropped} 格')
rows_hex = []
for r in range(gr):
    bits = grid[r].tolist()
    while len(bits) % 4:
        bits.append(0)
    rows_hex.append(''.join('%x' % (bits[i] << 3 | bits[i + 1] << 2 | bits[i + 2] << 1 | bits[i + 3]) for i in range(0, len(bits), 4)))
walk_cells = int(grid.sum())
print(f'walk {gc}x{gr} cells, walkable {walk_cells}')

# 灯(画面上的光晕位置):3D 场景里的点光 → 图片像素
lights = []
for L in M['scene'].get('lights', []):
    if not L.get('on', True):
        continue
    P = L['p']
    d = [P[0] - C0[0], P[1] - C0[1], P[2] - C0[2]]
    sx = d[0] * RR[0] + d[2] * RR[2]
    sy = (d[0] * HH[0] + d[2] * HH[2]) * math.sin(p) + d[1] * math.cos(p)
    ix, iy = (sx - sx0) * PPM, (sy1 - sy) * PPM
    if 0 <= ix < IW and 0 <= iy < IH:
        lights.append([round(ix), round(iy), L['kind'], [round(v) for v in L['c']]])

data = {
    'px': [IW, IH], 'chunk': CHUNK, 'grid': [ccols, crows], 'chunks': present, 'unit': UNIT, 'ppm': PPM, 'pitch': M['pitch'], 'yaw': YAW,
    'near': NEAR, 'far': FAR, 'dist': M['dist'], 'c0': C0, 'plane': M['plane'],
    'walk': {'cell': CELL, 'cols': gc, 'rows': rows_hex}, 'lights': lights,
}
if HEIGHT_OUT is not None:
    # 地面高度图(地面坐标 X / Z,米;0.1 米一档,行程编码 [值, 长度, …]):游戏里人物 / NPC 站在上城、台阶、桥面上时抬高用
    lg_, Hg_ = HEIGHT_OUT
    q = np.clip(np.round(Hg_ * 10), 0, 255).astype(np.uint8).ravel()
    rle = []
    i_ = 0
    while i_ < len(q):
        j_ = i_
        while j_ < len(q) and q[j_] == q[i_] and j_ - i_ < 65535:
            j_ += 1
        rle += [int(q[i_]), j_ - i_]
        i_ = j_
    data['height'] = {'x0': lg_['x0'], 'z0': lg_['z0'], 'res': lg_['res'], 'w': lg_['w'], 'h': lg_['h'], 'rle': rle}
with open(TS, 'w', encoding='utf-8', newline='\n') as f:
    f.write('/**\n * 预渲染 2.5D 主城广场(第 0 期)的地图数据(由 tools/proto3d/pre25/build_map.py 生成,别手改)。\n'
            ' * px = 整图像素;chunk = 每块边长;grid = 块的列 / 行数;unit = 一个图片像素合多少世界单位;\n'
            ' * ppm = 图片像素 / 米(画面平面上);pitch = 俯角;near / far / dist = 深度编码用(视深 = near + v·(far − near));\n'
            ' * c0 / plane = 画面平面坐标(米)的原点和范围 [左, 下, 右, 上];walk = 可走格(每行十六进制,高位在左,第 0 行在最上);\n'
            ' * lights = 灯 [x, y(图片像素,左上原点), 种类, 颜色]。\n */\n')
    f.write('export const PRE25_CITY_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ' as const;\n')
print('ts', TS, os.path.getsize(TS))
