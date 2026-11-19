# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期:摄影棚里整城的一张俯视总览(视角 D 正交,整座城装进一屏),看摆放用。

  python tools/proto3d/pre25/city_overview.py <输出.png> [--cx=-2] [--cz=0] [--half=60] [--yaw=-45] [--pitch=45] [--wait=8]

前提:dungeon_dev 开着 3D 主城小样,地址带 &cityfull=1 和要摆的模型(&bld=…)。
"""
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_fast import Fast  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
cx, cz = float(OPT.get('cx', -2)), float(OPT.get('cz', 0))
half = float(OPT.get('half', 60))
p, a = math.radians(float(OPT.get('pitch', 45))), math.radians(float(OPT.get('yaw', -45)))
fwd = (math.cos(p) * math.cos(a), -math.sin(p), math.cos(p) * math.sin(a))
look = [cx, 0, cz]
pos = [look[i] - fwd[i] * 200 for i in range(3)]
with Fast() as f:
    f.js(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read())
    f.js("try { __pre.hideChars(); } catch (e) {} D.post({vignette: 0, fog: false}); return 1")          # 镜头离得远时雾会把整张图罩灰
    # 等模型都载完
    for _ in range(60):
        st = f.js("var d=D.dungeon; return JSON.stringify([d.bldDone, d.bldTotal])")
        done, total = json.loads(st)
        if total and done >= total:
            break
        time.sleep(2)
    print('buildings', st)
    f.js(f"var d=D.dungeon; D.shot({json.dumps(pos)}, {json.dumps(look)}, 30); d.cam.projection=0; d.cam.orthoHeight={half}; d.cam.near=1; d.cam.far=500; return 1")
    f.shot(OUT, wait=float(OPT.get('wait', 8)))
print('saved', OUT)
