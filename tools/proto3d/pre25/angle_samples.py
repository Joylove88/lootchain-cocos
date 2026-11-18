# -*- coding: utf-8 -*-
"""预渲染 2.5D:同一个广场换几种镜头角度出样图(给用户挑视角用)。

  python tools/proto3d/pre25/angle_samples.py <输出目录> [--hero=-3,3]

前提:dungeon_dev 开着 3D 主城小样(电脑画布,&pix=0)。每种角度:正交投影、水平朝向 yaw(0 = 正对东边,和现在的预渲染主城一样;
45 = 斜着看,暗黑 2 那种)、俯角 pitch、每米多少屏幕像素 ppm(现在游戏里约 77);主角摆在 hero 点、侧过一点朝着镜头。
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
os.makedirs(OUT, exist_ok=True)
HX, HZ = [float(v) for v in OPT.get('hero', '-3,3').split(',')]
ANGLES = [
    ('0_现在', 0, 42, 77),
    ('1_现在角度拉近', 0, 42, 120),
    ('2_暗黑2式_斜45_俯30', 45, 30, 120),
    ('3_斜45_俯45', 45, 45, 120),
    ('4_暗黑2式_另一斜向_俯30', -45, 30, 120),
    ('5_另一斜向_俯45', -45, 45, 120),
]
if 'only' in OPT:
    ANGLES = [a for a in ANGLES if a[0].split('_')[0] in OPT['only'].split(',')]

with Fast() as f:
    f.js("document.querySelectorAll('body > div').forEach(function(e){ if(!e.querySelector('canvas')) e.style.display='none'}); return 1")
    time.sleep(1.5)
    h = f.js('return cc.game.canvas.height')
    for name, yaw, pitch, ppm in ANGLES:
        a, p = math.radians(yaw), math.radians(pitch)
        hx, hz = math.cos(a), math.sin(a)
        fwd = (math.cos(p) * hx, -math.sin(p), math.cos(p) * hz)
        look = [HX, 0.9, HZ]
        pos = [look[i] - fwd[i] * 80 for i in range(3)]
        # 主角朝镜头,再侧过 25 度(四分之三侧面);模型 yaw θ 面朝 (cos θ, 0, -sin θ)
        face = (180 - yaw + 25) % 360
        f.js(f"D.tp({HX},{HZ},{face}); var d=D.dungeon; D.shot({json.dumps(pos)}, {json.dumps(look)}, 30); "
             f"d.cam.projection=0; d.cam.orthoHeight={h / 2 / ppm:.5f}; d.cam.near=1; d.cam.far=260; return 1")
        f.shot(os.path.join(OUT, name + '.png'), wait=2.5)
        print(name, 'ok', flush=True)
