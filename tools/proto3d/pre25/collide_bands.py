# -*- coding: utf-8 -*-
"""预渲染 2.5D · 主城 v4:在摄影棚里跑 collide_bands.js,把「按高度分层的挡路栅格」取回来存成 npy。

  python tools/proto3d/pre25/collide_bands.py <输出目录>

产物:<输出目录>/bands.npy(uint32,[nz, nx],每位 = 半米一层是否有东西)+ bands.json(范围 / 格子)。
前提:dungeon_dev 开着主城 v4(&cityv4=1 + 全部模型)。build_map.py --bands=<输出目录> --layout=<布局前缀> 用它。
"""
import base64
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_fast import Fast  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
helper = open(os.path.join(HERE, 'helper.js'), encoding='utf-8').read().replace('return Object.keys(window.__pre);', '')
js = helper + '\n' + open(os.path.join(HERE, 'collide_bands.js'), encoding='utf-8').read()
with Fast() as f:
    meta = f.js(js)
    meta = json.loads(meta) if isinstance(meta, str) else meta
    print('meta', {k: meta[k] for k in ('nx', 'nz', 'stat', 'len')}, flush=True)
    parts = []
    step = 1_000_000
    for off in range(0, meta['len'], step):
        parts.append(f.js(f'return window.__collB.substr({off}, {step})'))
    f.js('window.__collB = null; return 1')
raw = base64.b64decode(''.join(parts))
u32 = np.frombuffer(raw, np.uint32).reshape(2, meta['nz'], meta['nx'])
bands = u32[0].astype(np.uint64) | (u32[1].astype(np.uint64) << np.uint64(32))          # 64 层,每层 0.25 米(-1 ~ 15 米)
np.save(os.path.join(OUT, 'bands.npy'), bands)
json.dump({k: meta[k] for k in ('cell', 'x0', 'z0', 'nx', 'nz')}, open(os.path.join(OUT, 'bands.json'), 'w'))
print('saved', OUT, bands.shape, 'occupied', float((bands != 0).mean()))
