# -*- coding: utf-8 -*-
"""灰岩荒原 v4 多层地表遮罩(同 woods_ground_install 的格式,着色器 effects/world-ground 共用):
  ground_splat.jpg  R = 大尺度噪声(龟裂土 ↔ 碎石地过渡 + 明暗起伏),G = 枯草地权重(空地外圈 + 噪声成片),B = 离路中线距离 / 512
  ground_splat2.jpg R = 碎岩屑(岩块 / 崖台 / 石柱脚下、河谷崖沿、矿坑外圈),G = 裸土(怪群圈心踩秃)
材质槽位:floor = tex_earth(龟裂土)、moss = tex_gravel(碎石地)、meadow = tex_drygrass、dirt = tex_track、leaf = tex_scree。
遮罩每像素 24 世界单位,RGB 4:4:4 JPG(出包 PNG 量化会毁数据)。

用法:python tools/qa/gray_ground_install.py      (改了 gray_v4_gen.py 的路网 / 怪群 / 立物后要重跑)
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gray_v4_gen as G  # noqa: E402
import woods_ground_install as WG  # noqa: E402
from woods_ground_install import smoothstep, value_noise  # noqa: E402

DST = os.path.join(G.ROOT, 'assets', 'resources', 'ui', 'world', 'gray4')
MASK_CELL = 24


def save_mask(rgb, name, W, H):
    im = Image.fromarray((rgb * 255).round().clip(0, 255).astype(np.uint8), 'RGB')
    out = os.path.join(DST, name + '.jpg')
    im.save(out, quality=95, subsampling=0)
    WG.write_meta(out, WG.meta_for(name, '.jpg', W, H, False, False))
    print(out, W, H, os.path.getsize(out) // 1024, 'KB')


def build_mask():
    L, g = G.generate()
    W = int(np.ceil(G.MAP_W / MASK_CELL))
    H = int(np.ceil(G.MAP_H / MASK_CELL))
    xs = (np.arange(W) + 0.5) * MASK_CELL - G.MAP_W / 2
    ys = G.MAP_H / 2 - (np.arange(H) + 0.5) * MASK_CELL
    X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
    d_road = G.seg_dist(X, Y, L['roads'])
    clear = np.zeros(X.shape, np.float32)
    for c in L['camps']:
        r = G.camp_radius(c) * 0.85 + 60
        d = np.hypot(X - c['x'], (Y - c['y']) / 0.8)
        # 枯草长在空地外圈(圈心是踩秃的裸土)
        clear = np.maximum(clear, smoothstep(r * 0.55, r * 0.95, d) * (1 - smoothstep(r * 1.0, r * 1.6, d)))
    for x, y, rx, ry in L['areas']:
        e = np.hypot((X - x) / rx, (Y - y) / ry)
        clear = np.maximum(clear, 0.6 * smoothstep(0.5, 0.9, e) * (1 - smoothstep(1.0, 1.5, e)))
    n1 = value_noise(W, H, 83, 3) * 0.55 + value_noise(W, H, 30, 4) * 0.3 + value_noise(W, H, 11, 5) * 0.15
    n2 = value_noise(W, H, 60, 11) * 0.6 + value_noise(W, H, 20, 12) * 0.4
    # 荒原枯草比林地草甸稀:只在空地外圈 + 噪声高处成小片
    meadow = np.clip(clear * 0.5 + smoothstep(0.62, 0.85, n2) * 0.4, 0, 0.7)
    save_mask(np.stack([n1, meadow / 0.7, np.clip(d_road / 512.0, 0, 1)], axis=-1), 'ground_splat', W, H)
    scree = np.zeros(X.shape, np.float32)
    rocks = [t for t in L['tall'] if t.get('kind') == 'rock'] + \
            [s for s in L['stands'] if any(k in s['asset'] for k in ('mesa', 'boulders', 'pillar', 'standing_stone', 'spoil', 'colossus', 'crystal'))]
    for t in rocks:
        w = t['width']
        r = np.hypot((X - t['x']) / (w * 0.75), (Y - (t['y'] + w * 0.05)) / (w * 0.42))
        scree = np.maximum(scree, 1 - smoothstep(0.5, 1.15, r))
    gorge_line = [G.P(x, y) for x, y in G.GORGE_PX]
    d_g = G.seg_dist(X, Y, [gorge_line])
    scree = np.maximum(scree, 0.8 * (1 - smoothstep(G.GORGE_W * 0.3, G.GORGE_W * 0.3 + 700, d_g)))
    qx, qy = G.P(*G.QUARRY_PX)
    scree = np.maximum(scree, 0.85 * (1 - smoothstep(0.85, 1.35, np.hypot((X - qx) / 1700, (Y - qy) / 900))))
    n4 = value_noise(W, H, 9, 31) * 0.6 + value_noise(W, H, 4, 32) * 0.4
    scree = np.clip(scree * (0.35 + 1.1 * n4) - 0.1, 0, 1) * smoothstep(60, 160, d_road)
    bare = np.zeros(X.shape, np.float32)
    for c in L['camps']:
        r = G.camp_radius(c)
        k = 0.6 if c['elite'] else 1.0
        bare = np.maximum(bare, k * (1 - smoothstep(r * 0.25, r * 0.7, np.hypot(X - c['x'], (Y - c['y']) / 0.8))))
    cx, cy = G.P(*G.CAMP_PX)
    bare = np.maximum(bare, 1 - smoothstep(500, 1100, np.hypot(X - cx, (Y - cy - 200) / 0.7)))
    fx, fy = G.P(*G.FORT_PX)
    bare = np.maximum(bare, 1 - smoothstep(0.6, 1.0, np.hypot((X - fx) / 1300, (Y - fy) / 760)))
    bare = np.clip(bare * (0.35 + 0.65 * value_noise(W, H, 6, 41)), 0, 1) * 0.85
    save_mask(np.stack([scree, bare, np.zeros_like(bare)], axis=-1), 'ground_splat2', W, H)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(DST, exist_ok=True)
    build_mask()
