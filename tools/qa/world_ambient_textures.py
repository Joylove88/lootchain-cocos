# -*- coding: utf-8 -*-
"""跑图环境动效贴图(程序生成,2026-10-29):飘落树叶 3 片 + 云影 1 张 + 迷雾格 1 张(10-30) → assets/resources/ui/world/fx/。
用法:python tools/qa/world_ambient_textures.py
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'fx')

LEAF_COLORS = [((118, 142, 58), (78, 102, 36)), ((176, 150, 62), (128, 98, 34)), ((150, 112, 52), (102, 70, 30))]


def leaf(base, edge, side=96):
    """叶片:4 倍超采样画尖椭圆 + 叶脉,缩回去抗锯齿。"""
    s = side * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(64):
        a = i / 64 * math.tau
        r = 1 - 0.18 * abs(math.sin(a)) ** 3
        pts.append((s / 2 + math.cos(a) * s * 0.42 * r, s / 2 + math.sin(a) * s * 0.2 * (1 - 0.6 * max(0, math.cos(a)) ** 2)))
    d.polygon(pts, fill=base + (255,))
    d.line([(s * 0.1, s / 2), (s * 0.9, s / 2)], fill=edge + (255,), width=s // 48)
    for k in range(4):
        x = s * (0.28 + k * 0.14)
        d.line([(x, s / 2), (x + s * 0.08, s / 2 - s * 0.1)], fill=edge + (200,), width=s // 80)
        d.line([(x, s / 2), (x + s * 0.08, s / 2 + s * 0.1)], fill=edge + (200,), width=s // 80)
    # 叶柄
    d.line([(s * 0.04, s / 2 + s * 0.02), (s * 0.12, s / 2)], fill=edge + (255,), width=s // 40)
    return im.resize((side, side), Image.LANCZOS)


def cloud_shadow(side=512):
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32) / side
    a = np.zeros((side, side), np.float32)
    for _ in range(9):
        cx, cy = rng.uniform(0.3, 0.7), rng.uniform(0.35, 0.65)
        r = rng.uniform(0.12, 0.24)
        a = np.maximum(a, np.clip(1 - np.hypot((xx - cx) / 1.0, (yy - cy) / 0.8) / r, 0, 1))
    img = Image.fromarray((np.clip(a * 1.6, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(side / 18))
    alpha = np.asarray(img).astype(np.float32) / 255
    out = np.zeros((side, side, 4), np.uint8)
    out[..., :3] = (16, 20, 30)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def fog_cell(side=256):
    """迷雾格(docs/53 §2.2):圆角方块柔边 + 低频云絮,放大到 1.3 格铺,相邻格叠成整片、只在已探索边缘柔和散开。"""
    rng = np.random.default_rng(13)
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32) / (side - 1) * 2 - 1
    # 圆角方块距离场:中心 0、边缘 1
    d = np.maximum(np.abs(xx), np.abs(yy)) * 0.7 + np.hypot(xx, yy) * 0.3
    core = np.clip((1.0 - d) / 0.62, 0, 1) ** 0.55
    core = core * core * (3 - 2 * core)
    low = Image.fromarray((rng.random((6, 6)) * 255).astype(np.uint8)).resize((side, side), Image.BICUBIC)
    mid = Image.fromarray((rng.random((14, 14)) * 255).astype(np.uint8)).resize((side, side), Image.BICUBIC)
    cloud = 0.82 + 0.12 * (np.asarray(low).astype(np.float32) / 255) + 0.06 * (np.asarray(mid).astype(np.float32) / 255)
    alpha = np.clip(core * cloud, 0, 1)
    rgb = np.zeros((side, side, 3), np.float32)
    shade = 0.85 + 0.3 * (np.asarray(mid).astype(np.float32) / 255 - 0.5)
    rgb[..., 0] = 14 * shade
    rgb[..., 1] = 17 * shade
    rgb[..., 2] = 24 * shade
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def fog_cloud(seed, side=320):
    """白色云雾(10-30 用户:迷雾换白色云雾、不要方正):一格 = 许多软云团随机叠成的不规则一片 + 云絮噪声,
    受光面亮白、背光面淡蓝灰;运行时每格随机挑变体并旋转 / 翻转、放大约 1.9 格铺,相邻交叠看不出网格。"""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32) / (side - 1) * 2 - 1
    dens = np.zeros((side, side), np.float32)
    for _ in range(38):
        cx, cy = rng.uniform(-0.62, 0.62, 2)
        r = rng.uniform(0.24, 0.5)
        dens += np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (r * 0.55) ** 2)) * rng.uniform(0.5, 1.0)
    def noise(n):
        return np.asarray(Image.fromarray((rng.random((n, n)) * 255).astype(np.uint8)).resize((side, side), Image.BICUBIC)).astype(np.float32) / 255
    fbm = 0.5 * noise(5) + 0.3 * noise(11) + 0.2 * noise(23)
    dens = dens / dens.max() * (0.65 + 0.7 * fbm)
    # 外圈压到 0(不碰贴图边)
    # 外圈留足透明边:圆形淡出到半径 0.95 归零,任意角度旋转都不会转出直边
    edge = np.clip((0.95 - np.hypot(xx, yy)) / 0.32, 0, 1)
    alpha = np.clip((dens - 0.1) / 0.38, 0, 1) * edge
    alpha = alpha * alpha * (3 - 2 * alpha)
    # 受光:左上亮,右下 / 薄处偏灰蓝
    light = np.clip(0.55 + 0.35 * dens - 0.18 * (xx + yy) * 0.5 + 0.15 * (noise(17) - 0.5), 0, 1)
    lo = np.array([176, 186, 200], np.float32)
    hi = np.array([250, 251, 253], np.float32)
    rgb = lo[None, None] * (1 - light[..., None]) + hi[None, None] * light[..., None]
    out = np.dstack([rgb, alpha * 245]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main() -> None:
    os.makedirs(DST, exist_ok=True)
    items = [(f'leaf_{i}', leaf(b, e)) for i, (b, e) in enumerate(LEAF_COLORS)] + [('cloud_shadow', cloud_shadow())] + [(f'fog_cloud_{i}', fog_cloud(40 + i)) for i in range(3)]
    for name, im in items:
        path = os.path.join(DST, name + '.png')
        im.save(path)
        write_meta(path, name, im.width, im.height)
        print('wrote', name, im.size)


if __name__ == '__main__':
    main()
