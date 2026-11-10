# -*- coding: utf-8 -*-
"""主城 v4(11-09 P1 广场大道)多层地表遮罩(格式同 woods_ground_install,着色器 effects/world-ground 共用):
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
    # 11-09 P1:城外草坡(分区 nature:河南岸 / 城墙后 / 东西两侧)+ 公园整片草地
    gi = np.clip(((G.MAP_H / 2 - Y) // G.CELL).astype(int), 0, g.ny - 1)
    gj = np.clip(((X + G.MAP_W / 2) // G.CELL).astype(int), 0, g.nx - 1)
    zone = g.zone[gi, gj]
    nature = np.isin(zone, ['nature', 'park']).astype(np.float32)
    # 11-10 规划 v2:街区庭院草坪(garden)边缘只糊一点,保持跟房子 / 街对齐的方正形状
    garden = (zone == 'garden').astype(np.float32)
    # 边缘做软:按 3 格均值糊一下
    k = 5
    pad = np.pad(nature, k, mode='edge')
    nature = sum(pad[k + dy:k + dy + H, k + dx:k + dx + W] for dy in range(-k, k + 1) for dx in range(-k, k + 1)) / (2 * k + 1) ** 2
    grass = np.maximum(grass, smoothstep(0.35, 0.75, nature))
    k2 = 1
    padg = np.pad(garden, k2, mode='edge')
    garden = sum(padg[k2 + dy:k2 + dy + H, k2 + dx:k2 + dx + W] for dy in range(-k2, k2 + 1) for dx in range(-k2, k2 + 1)) / (2 * k2 + 1) ** 2
    # 11-11 实机:庭院草坪被街边铺石带吃掉大半后剩一条细长草带(像绿地毯)→ 乘过街距后做开运算,窄于 13 格(312)的条整条去掉
    road_k = smoothstep(G.STREET_HALF, G.STREET_HALF + 120, d_road)
    gterm = smoothstep(0.3, 0.7, garden) * road_k
    r = 6

    def box(m, rr):
        p = np.pad(m.astype(np.float32), rr, mode='constant')
        return sum(p[rr + dy:rr + dy + H, rr + dx:rr + dx + W] for dy in range(-rr, rr + 1) for dx in range(-rr, rr + 1))
    core = box(gterm > 0.5, r) >= (2 * r + 1) ** 2 - 0.5
    keep = np.clip(box(box(core, r) > 0.5, 1) / 9.0, 0, 1)
    gterm = gterm * keep
    px, py = G.P(305, 640)
    grass = np.maximum(grass, 1 - smoothstep(0.75, 1.05, np.hypot((X - px) / (200 * G.S), (Y - py) / (110 * G.S))))
    for t in L['tall']:
        w = t['width']
        grass = np.maximum(grass, 0.75 * (1 - smoothstep(0.4, 1.0, np.hypot((X - t['x']) / (w * 0.7), (Y - t['y'] - w * 0.1) / (w * 0.4)))))
    # 城墙根 / 运河岸一圈杂草
    edge = (np.abs(Y) > G.MAP_H / 2 - 700) | (np.abs(X) > G.MAP_W / 2 - 700)
    cy = G.wy(G.CANAL_Y_PX)
    bank = (np.abs(Y - cy) > 280) & (np.abs(Y - cy) < 520)
    grass = np.maximum(grass, (edge | bank) * smoothstep(0.45, 0.75, n2) * 0.8)
    grass *= road_k
    grass = np.maximum(grass, gterm)
    # 11-09 实机:街边是一条直硬线像贴上去的带子 → 距离加两层噪声,街沿参差、卵石散进泥地(同 city_fa2)
    # 11-09 精致风:规整铺石之间撕纸边很假,振幅收小成缓弯(fa 手绘风是 220 / 90)
    ragged = (value_noise(W, H, 9, 61) - 0.5) * 70 + (value_noise(W, H, 3, 62) - 0.5) * 30
    n1 = n1 * 0.55  # 精致风:苔痕卵石层(同纹理变体)只零星出现
    save_mask(np.stack([n1, np.clip(grass, 0, 1), np.clip((d_road - STREET_SHIFT + ragged) / 512.0, 0, 1)], axis=-1), 'ground_splat', W, H)
    flag = np.zeros(X.shape, np.float32)
    qx, qy = G.P(*G.PLAZA_PX)
    # 11-09 精致风:罗盘外圈石板和细卵石按噪声穿插成迷彩斑 → 外圈去掉,只留教堂 / 学院前场
    for px_, py_, rx, ry in [(886, 268, 120, 42), (1250, 322, 95, 35), (505, 315, 85, 35)]:
        wx_, wy_ = G.P(px_, py_)
        flag = np.maximum(flag, 1 - smoothstep(0.7, 1.1, np.hypot((X - wx_) / (rx * G.S), (Y - wy_) / (ry * G.S))))
    packed = np.zeros(X.shape, np.float32)
    for px_, py_, rx, ry in [(1185, 500, 155, 52), (430, 502, 85, 35), (1585, 462, 85, 40), (1500, 668, 95, 30)]:
        wx_, wy_ = G.P(px_, py_)
        packed = np.maximum(packed, 1 - smoothstep(0.6, 1.0, np.hypot((X - wx_) / (rx * G.S), (Y - wy_) / (ry * G.S))))
    packed = np.clip(packed * (0.5 + 0.5 * value_noise(W, H, 6, 41)), 0, 1) * 0.8
    save_mask(np.stack([flag, packed, np.zeros_like(flag)], axis=-1), 'ground_splat2', W, H)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(DST, exist_ok=True)
    build_mask()
