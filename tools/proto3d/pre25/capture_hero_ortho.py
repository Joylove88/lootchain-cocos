# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 0 期:主角动作帧(正交投影,和 capture_map.py 拍的地图同一个俯角、同一个画面方向)。

  python tools/proto3d/pre25/capture_hero_ortho.py <输出目录> [--ppm=120] [--yaws=0,45,...] [--clips=stand,run,...]

前提:dungeon_dev 开着 3D 主城小样,画布方形(512×512 足够:120 像素 / 米时框住 4.3 米)。
- 只留主角(和剑)的网格,关雾 / 遮蔽 / 泛光 / 暗角、关点光(只剩月光 + 跟着主角的补光)。
- 镜头正交、从西往东俯 PITCH 度;主角站在 (X, Z) 原地播(片段的位移不要,2D 逻辑自己挪人)。
- 黑底、白底各拍一张求透明度(build_hero.py)。
- 动作切片和播放倍速照抄地宫小样定下的(G3DHeroMoves 的 GS_COMBO:四连约 1.9 秒);帧按「实际播放时间」每 FPS 取一帧。
"""
import json
import math
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_fast import Fast  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DD = [sys.executable, os.path.join(ROOT, 'tools', 'proto3d', 'dungeon', 'dungeon_dev.py')]
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)

PITCH = float(OPT.get('pitch', 42))
CAM_YAW = float(OPT.get('yaw', 0))          # 镜头水平朝向,和 capture_map.py 的 --yaw 一致(主角自己的 8 个朝向仍是世界里的 0 / 45 / … 度)
PPM = float(OPT.get('ppm', 120))
FPS = float(OPT.get('fps', 20))
SLOW_FPS = float(OPT.get('slowfps', 12))          # 待机 / 倒地这种慢的,帧可以少一些
X, Z, LOOK_Y = 3.0, -0.5, 1.15
DIST = 30.0
# (键, 片段, 起, 止, 倍速, 循环):起止是片段自己的秒数;循环的按整段取帧(首尾不重复)
CLIPS = [
    ('stand', 'gs_stand', 0.0, None, 1.0, True),
    ('run', 'gs_jog2', 0.0, None, 1.0, True),
    ('cut1', 'gs_cut1', 0.25, 1.0, 1.75, False),
    ('cut2', 'gs_cut3', 0.35, 1.3, 1.8, False),
    ('cut3', 'gs_cut4', 0.3, 1.45, 1.85, False),
    ('cut4', 'gs_spin', 0.2, 1.6, 1.7, False),
    ('fall', 'fall', 0.0, None, 1.0, False),
]
if 'clips' in OPT:
    keep = OPT['clips'].split(',')
    CLIPS = [c for c in CLIPS if c[0] in keep]
YAWS = [int(v) for v in OPT.get('yaws', '0,45,90,135,180,225,270,315').split(',')]


FAST = Fast().__enter__()


def ev(js):
    v = FAST.js(js)
    return v if isinstance(v, str) else json.dumps(v)


def shot(path, wait):
    FAST.shot(path, wait)


print('helper', ev(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read()))
size = json.loads(ev('return [cc.game.canvas.width, cc.game.canvas.height]'))
print('canvas', size)
print('btn', ev("document.querySelectorAll('body > div').forEach(function(e){ if(!e.querySelector('canvas')) e.style.display='none'}); return 1"))
print('post', ev("D.post({fog:false, ao:false, bloom:false, vignette:0}); D.set({realLights:0}); return 1"))
print('iso', ev("return __pre.iso('hero')"))
p = math.radians(PITCH)
look = [X, LOOK_Y, Z]
ca = math.radians(CAM_YAW)
fwd = (math.cos(p) * math.cos(ca), -math.sin(p), math.cos(p) * math.sin(ca))
pos = [look[i] - fwd[i] * DIST for i in range(3)]
ortho_h = size[1] / 2 / PPM
print('cam', ev(f"var d=D.dungeon; D.shot({json.dumps(pos)}, {json.dumps(look)}, 30); d.cam.projection=0; d.cam.orthoHeight={ortho_h:.6f}; d.cam.near=1; d.cam.far=80; return 1"))
# 主角脚底在画面上的位置(像素,左上原点):正交下 = 画面中心往下 LOOK_Y·cos(p)·PPM
foot_px = [size[0] / 2, size[1] / 2 + LOOK_Y * math.cos(p) * PPM]
meta = {'pitch': PITCH, 'camYaw': CAM_YAW, 'ppm': PPM, 'fps': FPS, 'canvas': size, 'foot': foot_px, 'yaws': YAWS, 'clips': {}}


def clip_len(clip):
    v = ev(f"var c=D.dungeon.leader; var k=(c.anim && c.anim.clips || []).find(function(a){{return a && a.name==='{clip}'}}); return k ? k.duration : -1")
    try:
        return float(v)
    except ValueError:
        return -1


for key, clip, t0, t1, speed, loop in CLIPS:
    if t1 is None:
        t1 = clip_len(clip)
        if t1 <= 0:
            print('没有片段', clip, '跳过')
            continue
    dur = (t1 - t0) / speed
    n = max(2, round(dur * (SLOW_FPS if key in ('stand', 'fall') else FPS)))
    meta['clips'][key] = {'clip': clip, 't0': t0, 't1': t1, 'speed': speed, 'dur': dur, 'n': n, 'loop': loop}
    for yaw in YAWS:
        for i in range(n):
            # 循环的不取最后一帧(和第一帧一样);一次性的首尾都取
            f = i / n if loop else i / (n - 1)
            t = t0 + (t1 - t0) * f
            ev(f"D.tp({X},{Z},{yaw}); D.clip('{clip}', {t:.4f}); return 1")
            for v in (0, 255):
                ev(f'return __pre.clear({v})')
                shot(os.path.join(OUT, f'{key}_{yaw}_{i}_{v}.png'), 0.15)
        print(key, yaw, n, 'ok', flush=True)
    json.dump(meta, open(os.path.join(OUT, 'hero_meta.json'), 'w', encoding='utf-8'), indent=1)
ev('return __pre.clear(null)')
ev('return __pre.restore()')
ev('D.clip(); return 1')
print('done')
