# -*- coding: utf-8 -*-
"""枯木林 v4 多层地表遮罩(同 gray_ground_install / woods_ground_install 的格式,着色器 effects/world-ground 共用):
  ground_splat.jpg  R = 大尺度噪声(黑泥 ↔ 苔藓过渡 + 明暗起伏),G = 枯草地权重(空地外圈 + 噪声成片),B = 离路中线距离 / 512
  ground_splat2.jpg R = 落叶(枯树 / 小树脚下、成片噪声;溪岸 / 沼泽外圈不铺),G = 裸土(怪群圈心 / 营地 / 伐木村踩秃)
材质槽位:floor = tex_mud(黑泥)、moss = tex_moss(苔藓)、meadow = tex_deadgrass、dirt = tex_track、leaf = tex_leaves。
遮罩每像素 24 世界单位,RGB 4:4:4 JPG(出包 PNG 量化会毁数据)。

用法:python tools/qa/dead_ground_install.py      (改了 dead_v4_gen.py 的路网 / 怪群 / 立物后要重跑)
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dead_v4_gen as G  # noqa: E402
import woods_ground_install as WG  # noqa: E402
from woods_ground_install import smoothstep, value_noise  # noqa: E402

DST = os.path.join(G.ROOT, 'assets', 'resources', 'ui', 'world', 'dead4')
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
    # 枯草:空地外圈 + 噪声高处成片(比荒原多一点)
    meadow = np.clip(clear * 0.55 + smoothstep(0.55, 0.8, n2) * 0.45, 0, 0.7)
    save_mask(np.stack([n1, meadow / 0.7, np.clip(d_road / 512.0, 0, 1)], axis=-1), 'ground_splat', W, H)
    # 落叶:枯树 / 小树脚下一圈 + 成片噪声;黑溪两岸、沼泽外圈不铺(那里是泥 / 苔藓)
    leaves = np.zeros(X.shape, np.float32)
    trees = [t for t in L['tall'] if t.get('kind') == 'tree'] + \
        [s for s in L['stands'] if any(k in s['asset'] for k in ('dead_tree', 'snag', 'spruce', 'sapling', 'world_tree'))]
    for t in trees:
        w = t['width']
        r = np.hypot((X - t['x']) / (w * 1.1), (Y - (t['y'] + w * 0.05)) / (w * 0.6))
        leaves = np.maximum(leaves, 1 - smoothstep(0.4, 1.2, r))
    n4 = value_noise(W, H, 9, 31) * 0.6 + value_noise(W, H, 4, 32) * 0.4
    # 11-09 预览:落叶层太艳、成片太多 → 树下一圈为主,噪声片只留稀疏几块
    leaves = np.maximum(leaves * 0.75, smoothstep(0.7, 0.9, n4) * 0.45)
    creek_line = [G.P(x, y) for x, y in G.CREEK_PX]
    d_c = G.seg_dist(X, Y, [creek_line])
    qx, qy = G.P(*G.BOG_PX)
    wet = np.maximum(1 - smoothstep(G.CREEK_W * 0.3, G.CREEK_W * 0.3 + 500, d_c),
                     1 - smoothstep(0.8, 1.3, np.hypot((X - qx) / (G.BOG_W * 0.5), (Y - qy) / (G.BOG_W * 0.3))))
    scree = np.clip(leaves * (1 - wet) - 0.05, 0, 1) * smoothstep(60, 160, d_road)
    bare = np.zeros(X.shape, np.float32)
    for c in L['camps']:
        r = G.camp_radius(c)
        k = 0.6 if c['elite'] else 1.0
        bare = np.maximum(bare, k * (1 - smoothstep(r * 0.25, r * 0.7, np.hypot(X - c['x'], (Y - c['y']) / 0.8))))
    cx, cy = G.P(*G.CAMP_PX)
    bare = np.maximum(bare, 1 - smoothstep(500, 1100, np.hypot(X - cx, (Y - cy - 200) / 0.7)))
    vx, vy = G.P(*G.HAMLET_PX)
    bare = np.maximum(bare, 1 - smoothstep(0.6, 1.0, np.hypot((X - vx) / 1500, (Y - vy) / 800)))
    bare = np.clip(bare * (0.35 + 0.65 * value_noise(W, H, 6, 41)), 0, 1) * 0.85
    save_mask(np.stack([scree, bare, np.zeros_like(bare)], axis=-1), 'ground_splat2', W, H)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(DST, exist_ok=True)
    build_mask()
