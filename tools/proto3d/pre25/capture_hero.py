# -*- coding: utf-8 -*-
"""预渲染 2.5D 小样:主角 8 方向动作帧(dungeon_dev 开着、方形画布,比如 1024×1024)。

  python tools/proto3d/pre25/capture_hero.py <输出目录>

只留主角(和剑)的网格,关雾 / 遮蔽 / 泛光 / 暗角、关路灯这类点光(只剩月光 + 跟着主角的补光,和底图里站在广场上的光一致),
镜头方向和底图一样(从西往东俯 42°),但离得远、视角窄(近似平行投影),黑底白底各拍一张算透明度。
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
PITCH, DIST, FRAME_H = 42, 30.0, 3.4          # 画面竖向框住 3.4 米(双手大剑举起来会超过 2.5 米)
X, Z = 3.0, -0.5
CLIPS = [('stand', 'gs_stand', 2.0, 6), ('jog', 'gs_jog', 0.73, 8), ('cut', 'gs_cut1', 1.27, 10)]
YAWS = [0, 45, 90, 135, 180, 225, 270, 315]


def ev(js):
    r = subprocess.run(DD + ['eval', js], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:]


def shot(path, wait):
    time.sleep(wait)
    subprocess.run(DD + ['shot', path], capture_output=True)


import math
fov = 2 * math.degrees(math.atan(FRAME_H / 2 / DIST))
print('helper', ev(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read()))
print('btn', ev("document.querySelectorAll('body > div').forEach(function(e){ if(!e.querySelector('canvas')) e.style.display='none'}); return 1"))
print('post', ev("D.post({fog:false, ao:false, bloom:false, vignette:0}); D.set({realLights:0}); return 1"))
print('iso', ev("return __pre.iso('hero')"))
p = math.radians(PITCH)
look = [X, 1.15, Z]
pos = [X - math.cos(p) * DIST, 1.15 + math.sin(p) * DIST, Z]
print('cam', ev(f"D.shot({json.dumps(pos)}, {json.dumps(look)}, {fov:.4f}); return 1"))
meta = {'pitch': PITCH, 'frameH': FRAME_H, 'clips': {}, 'yaws': YAWS}
for key, clip, dur, n in CLIPS:
    meta['clips'][key] = {'clip': clip, 'dur': dur, 'n': n}
    for yaw in YAWS:
        for i in range(n):
            t = dur * i / n
            ev(f"D.tp({X},{Z},{yaw}); D.clip('{clip}', {t:.4f}); return 1")
            for v in (0, 255):
                ev(f'return __pre.clear({v})')
                shot(os.path.join(OUT, f'{key}_{yaw}_{i}_{v}.png'), 0.35)
        print(key, yaw, 'ok', flush=True)
json.dump(meta, open(os.path.join(OUT, 'hero_meta.json'), 'w'), indent=1)
ev('return __pre.clear(null)')
ev('return __pre.restore()')
ev('D.clip(); return 1')
print('done')
