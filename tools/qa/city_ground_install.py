# -*- coding: utf-8 -*-
"""主城 v4 多层地表遮罩(格式同 woods_ground_install,着色器 effects/world-ground 共用):
  ground_splat.jpg  R = 大尺度噪声(老卵石 ↔ 长苔卵石),G = 草坪(公园 / 树下庭院 / 城墙根),B = (离街中线距离 - STREET_SHIFT) / 512
  ground_splat2.jpg R = 广场石板(罗盘广场外圈、大教堂 / 学院前场),G = 踩实的条石地(集市 / 酒馆 / 兵营前)
材质槽位:floor = tex_cobble、moss = tex_cobble_moss、meadow = tex_grass、dirt = tex_street、leaf = tex_flagstone。
着色器把「离路 85~185」画成路;主城街宽一倍,距离整体减 STREET_SHIFT 编码,街面就宽出这么多(不改着色器)。

用法:python tools/qa/city_ground_install.py      (改了 city_v4_gen.py 的街道 / 地标后要重跑)
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import city_v4_gen as G  # noqa: E402
import woods_ground_install as WG  # noqa: E402
from woods_ground_install import smoothstep, value_noise  # noqa: E402

DST = os.path.join(G.ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
MASK_CELL = 24
STREET_SHIFT = 110


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
    n1 = value_noise(W, H, 83, 3) * 0.55 + value_noise(W, H, 30, 4) * 0.3 + value_noise(W, H, 11, 5) * 0.15
    n2 = value_noise(W, H, 50, 11) * 0.6 + value_noise(W, H, 18, 12) * 0.4
    grass = np.zeros(X.shape, np.float32)
    px, py = G.P(210, 320)
    grass = np.maximum(grass, 1 - smoothstep(0.75, 1.05, np.hypot((X - px) / (150 * G.S), (Y - py) / (95 * G.S))))
    for t in L['tall']:
        w = t['width']
        grass = np.maximum(grass, 0.75 * (1 - smoothstep(0.4, 1.0, np.hypot((X - t['x']) / (w * 0.7), (Y - t['y'] - w * 0.1) / (w * 0.4)))))
    # 城墙根 / 运河岸一圈杂草
    edge = (np.abs(Y) > G.MAP_H / 2 - 700) | (np.abs(X) > G.MAP_W / 2 - 700)
    cy = G.wy(G.CANAL_Y_PX)
    bank = (np.abs(Y - cy) > 280) & (np.abs(Y - cy) < 520)
    grass = np.maximum(grass, (edge | bank) * smoothstep(0.45, 0.75, n2) * 0.8)
    grass *= smoothstep(G.STREET_HALF, G.STREET_HALF + 120, d_road)
    save_mask(np.stack([n1, np.clip(grass, 0, 1), np.clip((d_road - STREET_SHIFT) / 512.0, 0, 1)], axis=-1), 'ground_splat', W, H)
    flag = np.zeros(X.shape, np.float32)
    qx, qy = G.P(*G.PLAZA_PX)
    flag = np.maximum(flag, 1 - smoothstep(1100, 1500, np.hypot(X - qx, (Y - qy) / 0.62)))
    for px_, py_, rx, ry in [(790, 230, 150, 60), (1170, 355, 110, 45), (590, 330, 90, 45)]:
        wx_, wy_ = G.P(px_, py_)
        flag = np.maximum(flag, 1 - smoothstep(0.7, 1.1, np.hypot((X - wx_) / (rx * G.S), (Y - wy_) / (ry * G.S))))
    packed = np.zeros(X.shape, np.float32)
    for px_, py_, rx, ry in [(1060, 565, 140, 50), (420, 605, 80, 35), (1560, 365, 90, 40)]:
        wx_, wy_ = G.P(px_, py_)
        packed = np.maximum(packed, 1 - smoothstep(0.6, 1.0, np.hypot((X - wx_) / (rx * G.S), (Y - wy_) / (ry * G.S))))
    packed = np.clip(packed * (0.5 + 0.5 * value_noise(W, H, 6, 41)), 0, 1) * 0.8
    save_mask(np.stack([flag, packed, np.zeros_like(flag)], axis=-1), 'ground_splat2', W, H)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(DST, exist_ok=True)
    build_mask()
