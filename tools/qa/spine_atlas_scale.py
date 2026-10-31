# -*- coding: utf-8 -*-
"""Spine 图集等比放大(2026-10-31,Meowa 换皮前提清晰度用):贴图 ×N(Lanczos)、图集坐标 ×N,骨骼 json 不动 →
游戏里显示尺寸不变、贴图像素 ×N²。换皮按图集区域尺寸回填,放大后 AI 能多画出细节。
兼容两种图集写法:旧版 xy / size / orig / offset,新版 bounds / offsets。
用法:python tools/qa/spine_atlas_scale.py <源目录> <基名> <输出目录> [--factor 2]
"""
import os, re, shutil, sys
from PIL import Image

args = sys.argv[1:]
SRC, BASE, OUT = args[0], args[1], args[2]
K = int(args[args.index('--factor') + 1]) if '--factor' in args else 2
os.makedirs(OUT, exist_ok=True)
shutil.copy(os.path.join(SRC, BASE + '.json'), os.path.join(OUT, BASE + '.json'))

KEYS = ('xy', 'size', 'orig', 'offset', 'bounds', 'offsets')
lines = []
for line in open(os.path.join(SRC, BASE + '.atlas'), encoding='utf-8'):
    raw = line.rstrip('\n')
    m = re.match(r'^(\s*)([a-zA-Z]+)\s*:\s*(.*)$', raw)
    if m and (m.group(2) in KEYS or (m.group(2) == 'size' and not m.group(1))):
        nums = [n.strip() for n in m.group(3).split(',')]
        if all(re.fullmatch(r'-?\d+', n) for n in nums):
            raw = f'{m.group(1)}{m.group(2)}: ' + ', '.join(str(int(n) * K) for n in nums)
    elif raw.strip().endswith('.png') and ':' not in raw:
        page = raw.strip()
        im = Image.open(os.path.join(SRC, page))
        im.resize((im.width * K, im.height * K), Image.LANCZOS).save(os.path.join(OUT, page))
    lines.append(raw)
open(os.path.join(OUT, BASE + '.atlas'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('scaled x', K, '->', OUT)
