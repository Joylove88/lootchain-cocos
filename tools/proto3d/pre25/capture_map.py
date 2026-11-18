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
PITCH = 42.0
DIST = 120.0                 # 镜头离参考点多远(正交下只影响近 / 远裁剪,不影响画面)
NEAR, FAR = 1.0, 240.0
C0 = (2.0, 0.0, 0.0)         # 参考点(地面):画面平面坐标的原点
# 地图范围(世界坐标,米):地面那块 64 × 48 往里收一点(再往外是没铺地面的空处);TOP = 远处高的东西(教堂尖顶)要拍进来
X_NEAR, X_FAR, Z_LEFT, Z_RIGHT, TOP = float(OPT.get('x0', -28)), float(OPT.get('x1', 31)), float(OPT.get('z0', -23)), float(OPT.get('z1', 23)), float(OPT.get('top', 12))

p = math.radians(PITCH)
F = (math.cos(p), -math.sin(p), 0.0)
R = (0.0, 0.0, 1.0)
U = (math.sin(p), math.cos(p), 0.0)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def plane(P):
    d = (P[0] - C0[0], P[1] - C0[1], P[2] - C0[2])
    return dot(d, R), dot(d, U)


# 画面平面上的范围:左右 = 地图两侧;下 = 近处地面边;上 = 远处地面边再往上 TOP 米高的东西
sx0, sx1 = plane((0, 0, Z_LEFT))[0], plane((0, 0, Z_RIGHT))[0]
sy0 = plane((X_NEAR, 0, 0))[1]
sy1 = plane((X_FAR, TOP, 0))[1]
img_w, img_h = int(math.ceil((sx1 - sx0) * PPM)), int(math.ceil((sy1 - sy0) * PPM))
tw, th = W - 2 * MARGIN, H - 2 * MARGIN
cols, rows = int(math.ceil(img_w / tw)), int(math.ceil(img_h / th))
ortho_h = H / 2 / PPM          # 正交相机的半高(米)
print(f'map {img_w}x{img_h}px  ppm {PPM}  tiles {cols}x{rows}  plane x[{sx0:.2f},{sx1:.2f}] y[{sy0:.2f},{sy1:.2f}]')


def ev(js):
    r = subprocess.run(DD + ['eval', js], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:]


def shot(path, wait):
    time.sleep(wait)
    subprocess.run(DD + ['shot', path], capture_output=True)
    if not os.path.exists(path):
        raise SystemExit(f'截图失败 {path}')


def tile_center(row, col):
    """第 row 行(从上往下)、第 col 列那一块的中心,在画面平面上的坐标(米)。"""
    cx = sx0 + (col * tw + tw / 2) / PPM
    cy = sy1 - (row * th + th / 2) / PPM
    return cx, cy


def aim(cx, cy):
    # 画面平面上 (cx, cy) 对应的世界点 = C0 + cx·R + cy·U;镜头放在它沿 -F 退 DIST 的地方
    T = tuple(C0[i] + cx * R[i] + cy * U[i] for i in range(3))
    pos = [T[i] - F[i] * DIST for i in range(3)]
    js = (f"var d=D.dungeon; D.shot({json.dumps(pos)}, {json.dumps(list(T))}, 30);"
          f"d.cam.projection=0; d.cam.orthoHeight={ortho_h:.6f}; d.cam.near={NEAR}; d.cam.far={FAR}; return [d.cam.projection, d.cam.orthoHeight]")
    return ev(js)


meta = {'ppm': PPM, 'pitch': PITCH, 'dist': DIST, 'near': NEAR, 'far': FAR, 'c0': C0, 'f': F, 'r': R, 'u': U,
        'plane': [sx0, sy0, sx1, sy1], 'img': [img_w, img_h], 'tile': [tw, th], 'grid': [cols, rows], 'margin': MARGIN,
        'shot': [W, H], 'bounds': {'x0': X_NEAR, 'x1': X_FAR, 'z0': Z_LEFT, 'z1': Z_RIGHT, 'top': TOP}}

print('helper', ev(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read()))
print('hide', ev('return __pre.hideChars()'))
# 冻结逻辑(落叶、火苗这类动的东西每张不一样;遮挡蒙版靠两张对比,必须一模一样),关暗角(块边会发暗)
print('freeze', ev('D.dungeon.frozen = true; D.post({vignette: 0}); return 1'))
meta['scene'] = json.loads(ev('return __pre.scene()'))
json.dump(meta, open(os.path.join(OUT, 'map.json'), 'w', encoding='utf-8'), indent=1)

only = [int(v) for v in OPT['only'].split(',')] if 'only' in OPT else None
n = 0
for row in range(rows):
    for col in range(cols):
        n += 1
        if only is not None and (n - 1) not in only:
            continue
        cx, cy = tile_center(row, col)
        tag = f'{row}_{col}'
        print(f'tile {tag}  center ({cx:.2f}, {cy:.2f})', aim(cx, cy), flush=True)
        ev('D.set({post: 2}); D.post({debug: 0, vignette: 0}); return 1')
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
