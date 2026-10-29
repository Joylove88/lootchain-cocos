# -*- coding: utf-8 -*-
"""docs/53 新手村 v2 素材入库(2026-10-29):Codex 出图(周报截图/2026-10-29_新手村设计/assets_src/vil2_*.png,浅灰平底)
→ 洪水填充抠透明 → 最长边 1024(小件 512)→ assets/resources/ui/world/vil2/ + meta(sprite-frame,trim none)。
贴地件(plaza / path / wheat / veg / stream / pond)边缘再羽化一圈,铺在草地上不出硬边。
用法:python tools/qa/village2_install_assets.py [名字...](不写 = 全部)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import cutout, write_meta  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-10-29_新手村设计', 'assets_src')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'vil2')
SMALL = {'vil2_well', 'vil2_hay', 'vil2_barrels', 'vil2_lamp', 'vil2_bush', 'vil2_fence', 'vil2_banner', 'vil2_rocks', 'vil2_notice_board'}
SKIP = {'vil2_path'}  # 路改程序笔刷 vil2_road_brush,这张不入库
FLAT = {'vil2_plaza', 'vil2_veg', 'vil2_stream', 'vil2_pond'}


def feather(im, px=18):
    """贴地件:alpha 向内羽化 px,和草地自然融合。"""
    a = np.asarray(im.getchannel('A')).astype(np.float32) / 255
    inner = np.asarray(Image.fromarray((a > 0.5).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(px | 1)).filter(ImageFilter.GaussianBlur(px / 2))).astype(np.float32) / 255
    out = im.copy()
    out.putalpha(Image.fromarray((np.minimum(a, inner) * 255).astype(np.uint8)))
    return out


# 栅栏 / 村口 / 草垛:横杆之间被围住的平底灰,边缘洪水填充够不到,按「近平底色的连通块」再抠一遍
HOLES = {'vil2_fence', 'vil2_gate', 'vil2_hay', 'vil2_training', 'vil2_wheat', 'vil2_bridge'}
PLATE = np.array([200, 200, 200])


def punch_holes(im, tol=18, min_px=60):
    a = np.asarray(im.convert('RGBA')).copy()
    rgb = a[..., :3].astype(np.int16)
    near = (np.abs(rgb - PLATE).max(axis=2) < tol) & (a[..., 3] > 0)
    h, w = near.shape
    seen = np.zeros_like(near)
    for y0, x0 in zip(*np.nonzero(near)):
        if seen[y0, x0]:
            continue
        stack, comp = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and near[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        if len(comp) >= min_px:
            ys, xs = zip(*comp)
            a[ys, xs, 3] = 0
    # 抠掉的洞边缘收一圈软边
    alpha = Image.fromarray(a[..., 3])
    soft = np.asarray(alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8)))
    a[..., 3] = np.minimum(a[..., 3], np.maximum(soft, (a[..., 3] > 0) * 0 + soft))
    return Image.fromarray(a, 'RGBA')


def make_road_brush(side=256):
    """夯土路笔刷(程序生成,不走 Codex):圆形柔边土色块 + 低频明暗,地图里沿路线逐个盖章连成路网(LobbyWorldMaps.roads)。"""
    rng = np.random.default_rng(29)
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32)
    r = np.hypot(xx - side / 2 + 0.5, yy - side / 2 + 0.5) / (side / 2)
    low = Image.fromarray((rng.random((8, 8)) * 255).astype(np.uint8)).resize((side, side), Image.BICUBIC)
    noise = np.asarray(low).astype(np.float32) / 255 - 0.5
    base = np.array([214, 172, 118], np.float32)
    rgb = base[None, None, :] * (1 + noise[..., None] * 0.10)
    # 外圈略暗(踩实的路边)
    rgb *= (1 - np.clip((r - 0.55) / 0.4, 0, 1) * 0.10)[..., None]
    alpha = np.clip((1 - r) / 0.42, 0, 1) ** 1.6
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main(names):
    os.makedirs(DST, exist_ok=True)
    if not names or 'vil2_road_brush' in names:
        im = make_road_brush()
        path = os.path.join(DST, 'vil2_road_brush.png')
        im.save(path)
        write_meta(path, 'vil2_road_brush', im.width, im.height)
        print('wrote vil2_road_brush', im.size)
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith('.png'):
            continue
        name = fn[:-4]
        if names and name not in names:
            continue
        if name in SKIP:
            continue
        im = cutout(Image.open(os.path.join(SRC, fn)))
        if name in HOLES:
            im = punch_holes(im)
        side = 512 if name in SMALL else 1024
        k = side / max(im.size)
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        if name in FLAT:
            im = feather(im.convert('RGBA'))
        path = os.path.join(DST, name + '.png')
        im.save(path)
        write_meta(path, name, im.width, im.height)
        print('wrote', name, im.size)


if __name__ == '__main__':
    main(set(sys.argv[1:]))
