# -*- coding: utf-8 -*-
"""预渲染 2.5D 小样:从 3D 主城小样(dungeon_dev 已经开着、3840×2160、&pix=0)拍底图 + 遮挡层蒙版 + 相机矩阵。

  python tools/proto3d/pre25/capture_bg.py <输出目录>

底图:藏起角色 / 按钮,固定俯视机位拍一张(后期全开)。
蒙版:每组(bld 建筑与摆件模型 / trees 树 / stone 代码拼的墙台阶等)只留这一组,关后期,分别用黑底、白底各拍一张:
      两张一样的地方就是这组东西(不透明),差多少就透明多少 —— 不靠抠颜色,物体是什么颜色都不怕。
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DD = [sys.executable, os.path.join(ROOT, 'tools', 'proto3d', 'dungeon', 'dungeon_dev.py')]
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
CAM = {'pitch': 42, 'dist': 56, 'fov': 32, 'look': [3, 0, -0.5]}


def ev(js):
    r = subprocess.run(DD + ['eval', js], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:]


def shot(path, wait=3.0):
    time.sleep(wait)
    subprocess.run(DD + ['shot', path], capture_output=True)


print('helper', ev(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read()))
print('hide', ev('return __pre.hideChars()'))
MASKS_ONLY = '--masks' in sys.argv
if '--depth' in sys.argv:
    p0, dd0, f0, L0 = CAM['pitch'], CAM['dist'], CAM['fov'], CAM['look']
    ev(f"var p={p0}*Math.PI/180; D.shot([{L0[0]}-Math.cos(p)*{dd0}, Math.sin(p)*{dd0}, {L0[2]}], [{L0[0]},{L0[1]},{L0[2]}], {f0}); return 1")
    json.dump({'cam': CAM, **json.loads(ev('return __pre.vp()')), **json.loads(ev('return __pre.scene()'))}, open(os.path.join(OUT, 'cam.json'), 'w'), indent=1)
    ev('D.post({debug: 5}); return 1'); shot(os.path.join(OUT, 'depth.png'), 4); ev('D.post({debug: 0}); return 1'); print('depth only done'); sys.exit(0)
p, dd, f, L = CAM['pitch'], CAM['dist'], CAM['fov'], CAM['look']
print('cam', ev(f"var p={p}*Math.PI/180; D.shot([{L[0]}-Math.cos(p)*{dd}, Math.sin(p)*{dd}, {L[2]}], [{L[0]},{L[1]},{L[2]}], {f}); return 1"))
if not MASKS_ONLY:
    shot(os.path.join(OUT, 'bg.png'), 5)
    vp = ev('return __pre.vp()')
    json.dump({'cam': CAM, **json.loads(vp), **json.loads(ev('return __pre.scene()'))}, open(os.path.join(OUT, 'cam.json'), 'w'), indent=1)
    print('vp', vp[:120])
    # 深度:后期调试模式 5(g3d-post.effect)把视深拆成 r / g 两个 8 位
    print('depth', ev('D.post({debug: 5}); return 1'))
    shot(os.path.join(OUT, 'depth.png'), 3)
    ev('D.post({debug: 0}); return 1')
print('post off', ev('D.set({post: 0}); return 1'))
for g in ['bld', 'trees', 'stone']:
    print(g, 'meshes', ev(f"return __pre.iso('{g}')"))
    for v in (0, 255):
        ev(f'return __pre.clear({v})')
        shot(os.path.join(OUT, f'm_{g}_{v}.png'), 2.5)
    ev('return __pre.restore()')
ev('return __pre.clear(null)')
print('post on', ev('D.set({post: 2}); return 1'))
print('done')
