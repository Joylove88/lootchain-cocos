# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 0 期:用正交(平行)投影分块拍一整张能滚动的地图。

  python tools/proto3d/pre25/capture_map.py <输出目录> [--ppm=96] [--only=0,1] [--skip-masks]

前提:dungeon_dev 开着 3D 主城小样,画布 3840×2160、&pix=0(见 helper.js 的说明)。

为什么是正交:小样那张是透视镜头,只能拍一个固定画面;要拍一张能跟着人滚动的大图,每一块必须是同一个
「平行投影」的一部分 —— 镜头只沿画面的右 / 上方向平移,不改朝向、不改远近,块与块逐像素接得上,深度也能直接比。

坐标(和 3D 小样一致):镜头从西往东俯 PITCH 度。
  前 f = (cos p, -sin p, 0)   画面右 r = (0, 0, 1)   画面上 u = (sin p, cos p, 0)
世界点 P 在画面平面上的位置 = (dot(P - C0, r), dot(P - C0, u)) 米,× ppm 就是像素;视深 = dot(P - C0, f) + DIST。

每块拍 3840×2160,四边各留 MARGIN 像素不要(泛光 / 遮蔽在画面边上取不到画面外的东西,会出接缝),中间一块拼进整图。
每块 8 张:底图(后期全开、关暗角)/ 深度(后期调试模式 5)/ 三组遮挡物各黑底白底一张(关后期)。
产物:tiles/<行>_<列>_<种类>.png + map.json(拼图要的一切参数),拼图交给 build_map.py。
"""
import json
import math
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DD = [sys.executable, os.path.join(ROOT, 'tools', 'proto3d', 'dungeon', 'dungeon_dev.py')]
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
TILES = os.path.join(OUT, 'tiles')
os.makedirs(TILES, exist_ok=True)

W, H, MARGIN = 3840, 2160, 128
PPM = float(OPT.get('ppm', 96))
PITCH = float(OPT.get('pitch', 42))
YAW = float(OPT.get('yaw', 0))          # 镜头水平朝向:0 = 正对东边;-45 = 往东北斜着看(11-18 用户选的视角 D)
DIST = 120.0                 # 镜头离参考点多远(正交下只影响近 / 远裁剪,不影响画面)
NEAR, FAR = 1.0, 240.0
# 11-20:镜头实际再往后退 BACK 米(近 / 远裁剪同步后移,深度图编码不变,map.json 仍记 DIST / NEAR / FAR)。
# 引擎算高光 / 天光反射用的是「镜头位置 → 像素」的视线,镜头离地只有 120 米时一块里视线差 ±7°、相邻两块接缝处差 15°,
# 湿地面 / 石板的反光每块不一样亮 → 拼出来一格一格的明暗方块(实测重叠区差 30 级);退到 2000 米后差 1 级。
BACK = float(OPT.get('back', 1880))
C0 = tuple(float(v) for v in OPT.get('c0', '2,0,0').split(','))         # 参考点(地面):画面平面坐标的原点

p = math.radians(PITCH)
a = math.radians(YAW)
HX, HZ = math.cos(a), math.sin(a)          # 水平朝向
F = (math.cos(p) * HX, -math.sin(p), math.cos(p) * HZ)
R = (-HZ, 0.0, HX)
U = (math.sin(p) * HX, math.cos(p), math.sin(p) * HZ)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def plane(P):
    d = (P[0] - C0[0], P[1] - C0[1], P[2] - C0[2])
    return dot(d, R), dot(d, U)


if 'rect' in OPT:
    # 直接给画面平面上的范围(米,相对 C0):左, 右, 下, 上
    sx0, sx1, sy0, sy1 = [float(v) for v in OPT['rect'].split(',')]
    X_NEAR = X_FAR = Z_LEFT = Z_RIGHT = TOP = None
else:
    # 地图范围(世界坐标,米):地面那块 64 × 48 往里收一点(再往外是没铺地面的空处);TOP = 远处高的东西(教堂尖顶)要拍进来(只适用于正对东边)
    X_NEAR, X_FAR, Z_LEFT, Z_RIGHT, TOP = float(OPT.get('x0', -28)), float(OPT.get('x1', 31)), float(OPT.get('z0', -23)), float(OPT.get('z1', 23)), float(OPT.get('top', 12))
    # 画面平面上的范围:左右 = 地图两侧;下 = 近处地面边;上 = 远处地面边再往上 TOP 米高的东西
    sx0, sx1 = plane((0, 0, Z_LEFT))[0], plane((0, 0, Z_RIGHT))[0]
    sy0 = plane((X_NEAR, 0, 0))[1]
    sy1 = plane((X_FAR, TOP, 0))[1]
img_w, img_h = int(math.ceil((sx1 - sx0) * PPM)), int(math.ceil((sy1 - sy0) * PPM))
tw, th = W - 2 * MARGIN, H - 2 * MARGIN
cols, rows = int(math.ceil(img_w / tw)), int(math.ceil(img_h / th))
ortho_h = H / 2 / PPM          # 正交相机的半高(米)
print(f'map {img_w}x{img_h}px  ppm {PPM}  yaw {YAW} pitch {PITCH}  tiles {cols}x{rows}  plane x[{sx0:.2f},{sx1:.2f}] y[{sy0:.2f},{sy1:.2f}]')


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_fast import Fast  # noqa: E402
FAST = Fast().__enter__()


def ev(js):
    v = FAST.js(js)
    return v if isinstance(v, str) else json.dumps(v)


def shot(path, wait):
    FAST.shot(path, wait)


# --poly=x,z;x,z;…:只拍和这个地面多边形(世界坐标,米;往外放 POLY_PAD 米)有交集的块,外面的块不拍(整城:城墙外的三角角落)
POLY = [tuple(float(v) for v in pt.split(',')) for pt in OPT['poly'].split(';')] if 'poly' in OPT else None
POLY_PAD = float(OPT.get('polypad', 10))


def in_poly(x, z):
    inside = False
    n = len(POLY)
    for i in range(n):
        x1, z1 = POLY[i]
        x2, z2 = POLY[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            inside = not inside
    return inside


def near_poly(x, z):
    if in_poly(x, z):
        return True
    for i in range(len(POLY)):
        x1, z1 = POLY[i]
        x2, z2 = POLY[(i + 1) % len(POLY)]
        dx, dz = x2 - x1, z2 - z1
        t = max(0.0, min(1.0, ((x - x1) * dx + (z - z1) * dz) / max(1e-9, dx * dx + dz * dz)))
        if math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)) < POLY_PAD:
            return True
    return False


def tile_needed(row, col):
    if POLY is None:
        return True
    # 块在画面平面上的范围 → 撒 7 × 7 个点换回地面(y = 0),有一个点在多边形附近就拍
    px0 = sx0 + col * tw / PPM
    py1 = sy1 - row * th / PPM
    for i in range(7):
        for j in range(7):
            sx = px0 + (tw / PPM) * i / 6
            sy = py1 - (th / PPM) * j / 6
            t = sy / math.sin(p)
            x = C0[0] + sx * R[0] + t * HX
            z = C0[2] + sx * R[2] + t * HZ
            if near_poly(x, z):
                return True
    return False


def tile_center(row, col):
    """第 row 行(从上往下)、第 col 列那一块的中心,在画面平面上的坐标(米)。"""
    cx = sx0 + (col * tw + tw / 2) / PPM
    cy = sy1 - (row * th + th / 2) / PPM
    return cx, cy


SHADOW_FOLLOW = float(OPT.get('shadowfollow', 0))          # --shadowfollow=36:每块的影子范围(米,半宽)


def aim(cx, cy):
    # 画面平面上 (cx, cy) 对应的世界点 = C0 + cx·R + cy·U;镜头放在它沿 -F 退 DIST 的地方
    T = tuple(C0[i] + cx * R[i] + cy * U[i] for i in range(3))
    pos = [T[i] - F[i] * (DIST + BACK) for i in range(3)]
    js = (f"var d=D.dungeon; D.shot({json.dumps(pos)}, {json.dumps(list(T))}, 30);"
          f"d.cam.projection=0; d.cam.orthoHeight={ortho_h:.6f}; d.cam.near={NEAR + BACK}; d.cam.far={FAR + BACK}; return [d.cam.projection, d.cam.orthoHeight]")
    if SHADOW_FOLLOW:
        # 月光影子跟着这一块走(11-19 主城 v4):固定范围的影子以月光节点为中心;整城罩一张图太糊,改成每块只罩自己附近
        t = -T[1] / F[1] if abs(F[1]) > 1e-6 else 0
        G = [T[i] + F[i] * t for i in range(3)]
        # 影子相机放在这块地面中心往月亮方向退 200 米(放在地面上时,地面和月亮之间的树 / 房子在影子相机背后,投不出影子 → 块与块之间影子断开)
        ev(f"var m=D.dungeon.moon; var f=m.node.forward; m.node.setWorldPosition({G[0]:.3f}-f.x*200, {G[1]:.3f}-f.y*200, {G[2]:.3f}-f.z*200); m.shadowOrthoSize={SHADOW_FOLLOW}; m.shadowNear=1; m.shadowFar=450; return 1")
    return ev(js)


meta = {'ppm': PPM, 'pitch': PITCH, 'yaw': YAW, 'dist': DIST, 'near': NEAR, 'far': FAR, 'c0': C0, 'f': F, 'r': R, 'u': U,
        'plane': [sx0, sy0, sx1, sy1], 'img': [img_w, img_h], 'tile': [tw, th], 'grid': [cols, rows], 'margin': MARGIN,
        'shot': [W, H], 'poly': POLY, 'polyPad': POLY_PAD, 'bounds': {'x0': X_NEAR, 'x1': X_FAR, 'z0': Z_LEFT, 'z1': Z_RIGHT, 'top': TOP}}

print('helper', ev(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read()))
print('hide', ev('return __pre.hideChars()'))
# 冻结逻辑(落叶、火苗这类动的东西每张不一样;遮挡蒙版靠两张对比,必须一模一样),关暗角(块边会发暗)
# 雾也关:后期的雾按「到镜头的距离」算,镜头退到 2000 米后整张都在雾里发白(11-20)
print('freeze', ev('D.dungeon.frozen = true; D.post({vignette: 0, fog: false}); return 1'))
time.sleep(1.5)
cv = json.loads(ev('return [cc.game.canvas.width, cc.game.canvas.height]'))
print('canvas', cv)
if cv != [W, H]:
    raise SystemExit(f'画布不是 {W}x{H}(工具栏没藏?),先 dungeon_dev shot 一张让它重排再来')
meta['scene'] = json.loads(ev('return __pre.scene()'))
json.dump(meta, open(os.path.join(OUT, 'map.json'), 'w', encoding='utf-8'), indent=1)

only = [int(v) for v in OPT['only'].split(',')] if 'only' in OPT else None
n = 0
for row in range(rows):
    for col in range(cols):
        n += 1
        if only is not None and (n - 1) not in only:
            continue
        if not tile_needed(row, col):
            print(f'tile {row}_{col} 在多边形外,不拍', flush=True)
            continue
        cx, cy = tile_center(row, col)
        tag = f'{row}_{col}'
        print(f'tile {tag}  center ({cx:.2f}, {cy:.2f})', aim(cx, cy), flush=True)
        ev('D.set({post: 2}); D.post({debug: 0, vignette: 0, fog: false}); return 1')
        shot(os.path.join(TILES, f'{tag}_bg.png'), 4.0)
        ev('D.post({debug: 5}); return 1')
        shot(os.path.join(TILES, f'{tag}_depth.png'), 2.5)
        ev('D.post({debug: 0}); return 1')
        if '--skip-masks' in sys.argv:
            continue
        ev('D.set({post: 0}); return 1')
        for g in ('bld', 'trees', 'stone'):
            ev(f"return __pre.iso('{g}')")
            for v in (0, 255):
                ev(f'return __pre.clear({v})')
                shot(os.path.join(TILES, f'{tag}_m_{g}_{v}.png'), 2.0)
            ev('return __pre.restore()')
        ev('return __pre.clear(null)')
ev('D.set({post: 2}); D.dungeon.frozen = false; return 1')
print('done')
