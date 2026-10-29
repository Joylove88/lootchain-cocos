# -*- coding: utf-8 -*-
"""跑图环境动效贴图(程序生成,2026-10-29):飘落树叶 3 片 + 云影 1 张 → assets/resources/ui/world/fx/。
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


def main() -> None:
    os.makedirs(DST, exist_ok=True)
    items = [(f'leaf_{i}', leaf(b, e)) for i, (b, e) in enumerate(LEAF_COLORS)] + [('cloud_shadow', cloud_shadow())]
    for name, im in items:
        path = os.path.join(DST, name + '.png')
        im.save(path)
        write_meta(path, name, im.width, im.height)
        print('wrote', name, im.size)


if __name__ == '__main__':
    main()
