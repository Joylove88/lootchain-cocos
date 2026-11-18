# -*- coding: utf-8 -*-
"""预渲染 2.5D:按游戏里的镜头(斜 45°、俯 45°、正交)把主角几个动作的某几帧渲出来拼成一张对比图(挑姿势用)。

  python tools/proto3d/pre25/pose_samples.py <输出.jpg> 片段@秒 [片段@秒 ...] [--yaw=225] [--ppm=150] [--camyaw=-45] [--pitch=45]

前提:dungeon_dev 开着 3D 主城小样(方形画布,比如 640×640),g3d_moves 里有这些片段。只留主角和剑的网格,灰底。
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_fast import Fast  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
SPECS = [a.split('@') for a in ARGS[1:]]
YAW = float(OPT.get('yaw', 225))
PPM = float(OPT.get('ppm', 150))
p = math.radians(float(OPT.get('pitch', 45)))
ca = math.radians(float(OPT.get('camyaw', -45)))
X, Z, LY = 3.0, -0.5, 1.15
fwd = (math.cos(p) * math.cos(ca), -math.sin(p), math.cos(p) * math.sin(ca))
look = [X, LY, Z]
pos = [look[i] - fwd[i] * 30 for i in range(3)]
tmp = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'pose_tmp.png')
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
tiles = []
with Fast() as f:
    f.js(open(os.path.join(os.path.dirname(__file__), 'helper.js'), encoding='utf-8').read())
    f.js("document.querySelectorAll('body > div').forEach(function(e){ if(!e.querySelector('canvas')) e.style.display='none'}); "
         "D.post({fog:false, ao:false, bloom:false, vignette:0}); D.set({realLights:0}); __pre.iso('hero'); __pre.clear(70); return 1")
    h = f.js('return cc.game.canvas.height')
    f.js(f"var d=D.dungeon; D.shot({json.dumps(pos)}, {json.dumps(look)}, 30); d.cam.projection=0; d.cam.orthoHeight={h / 2 / PPM:.5f}; d.cam.near=1; d.cam.far=80; return 1")
    for clip, t in SPECS:
        f.js(f"D.tp({X},{Z},{YAW}); D.clip('{clip}', {float(t):.3f}); return 1")
        f.shot(tmp, wait=0.25)
        im = Image.open(tmp).convert('RGB')
        ImageDraw.Draw(im).text((10, 8), f'{clip} @ {t}s', font=font, fill=(255, 240, 200))
        tiles.append(im)
    f.js("__pre.clear(null); __pre.restore(); D.clip(); return 1")
n = len(tiles)
cols = min(n, 6)
rows = (n + cols - 1) // cols
w, hh = tiles[0].size
sheet = Image.new('RGB', (cols * w, rows * hh), (40, 40, 40))
for i, im in enumerate(tiles):
    sheet.paste(im, ((i % cols) * w, (i // cols) * hh))
sheet.thumbnail((2400, 2400))
sheet.save(OUT, quality=88)
print('saved', OUT, n)
