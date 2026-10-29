# -*- coding: utf-8 -*-
"""晨风村 v3 素材入库(2026-10-29,按用户鸟瞰图出的写实风格件):
周报截图/2026-10-29_新手村设计/v3_src/v3_*.png(浅灰平底)→ 抠透明(+ 栅栏类封闭灰底二次抠)→ 缩放 → assets/resources/ui/world/vil3/ + meta。
- 大件(世界宽度 > 1200)保留 1536 长边,其余 1024,小物 512;
- 贴地件(水 / 悬崖 / 广场 / 菜地 / 桥)边缘羽化,铺在草地上不出硬边;
- v3_ground 做成无缝平铺(四边交叉淡化)存 ground_village3,不抠图。
用法:python tools/qa/village3_install_assets.py [名字...](不写 = 全部)
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import cutout, write_meta  # noqa: E402
from village2_install_assets import feather, punch_holes  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-10-29_新手村设计', 'v3_src')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'vil3')
GROUND_DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world')
BIG = {'chief_house', 'training', 'river_c', 'river_w', 'east_cliff', 'wheat', 'cliff_s'}
SMALL = {'bush', 'hay', 'gate', 'shed_a'}
TINY = {'grass_tuft'}  # 场上只显示约 90 世界单位,256 足够
FLAT = {'decal_dirt': 40, 'decal_moss': 36, 'decal_weeds': 44, 'plaza': 18, 'veg': 18, 'river_w': 22, 'river_c': 22, 'falls': 22, 'east_cliff': 22, 'cliff_s': 22, 'nw_falls': 22, 'bridge': 6}
HOLES = {'gate', 'wheat', 'training', 'bridge', 'hay'}


def seamless(im: Image.Image) -> Image.Image:
    """四边交叉淡化:把图卷半格叠回原图,接缝处用卷过的那份盖住,平铺不露缝。"""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # 中心 1、四边 0 的权重:原图只在中间用,四边换成卷过的(它的中间是原图的四角,天然连续)
    wx = 1 - np.abs(xx / (w - 1) * 2 - 1)
    wy = 1 - np.abs(yy / (h - 1) * 2 - 1)
    m = np.clip(np.minimum(wx, wy) * 2.2, 0, 1)[..., None]
    out = a * m + rolled * (1 - m)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def warm(im: Image.Image) -> Image.Image:
    """草地底纹往鸟瞰图的晨光色调靠:整体提亮、偏暖(红绿略升、蓝略降)。"""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    a = a ** 0.86 * np.array([1.10, 1.06, 0.92])
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGB')


def plate_of(src: Image.Image) -> np.ndarray:
    a = np.asarray(src.convert('RGB')).astype(np.float32)
    ring = np.concatenate([a[:16].reshape(-1, 3), a[-16:].reshape(-1, 3), a[:, :16].reshape(-1, 3), a[:, -16:].reshape(-1, 3)])
    return np.median(ring, axis=0)


def shadowize(im: Image.Image, plate: np.ndarray) -> Image.Image:
    """平底上的接触阴影抠完会剩一圈浅灰实色:从透明外圈往里洪水找「低饱和、比底色暗一点」的像素,
    换成黑色半透明(越暗越不透明),落到草地上就是真阴影;石墙 / 屋顶不和外圈连通,不受影响。"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3]
    lum = rgb.mean(axis=2)
    pl = float(plate.mean())
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    cand = (a[..., 3] > 0) & (sat < 14) & (lum > pl * 0.55) & (lum < pl + 32)
    h, w = cand.shape
    seen = np.zeros((h, w), bool)
    outside = a[..., 3] < 8
    # 种子:紧挨透明外圈的候选像素
    edge = np.zeros((h, w), bool)
    edge[1:, :] |= outside[:-1, :]
    edge[:-1, :] |= outside[1:, :]
    edge[:, 1:] |= outside[:, :-1]
    edge[:, :-1] |= outside[:, 1:]
    stack = list(zip(*np.nonzero(cand & edge)))
    for y, x in stack:
        seen[y, x] = True
    while stack:
        y, x = stack.pop()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and cand[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                stack.append((yy, xx))
    dark = np.clip((pl - lum) / pl * 2.4, 0, 0.55)
    out = a.copy()
    out[seen, 0:3] = (18, 16, 12)
    out[seen, 3] = np.minimum(a[seen, 3], dark[seen] * 255)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def road_brush(dirt: Image.Image, side: int = 320) -> Image.Image:
    """路刷:夯土纹理(v3_dirt)裁圆 + 柔边,边缘按低频噪声起伏,沿路线盖章连成路(LobbyWorldMaps.roads)。"""
    tex = dirt.convert('RGB').resize((side, side), Image.LANCZOS)
    rng = np.random.default_rng(31)
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32)
    r = np.hypot(xx - side / 2 + 0.5, yy - side / 2 + 0.5) / (side / 2)
    ang = np.arctan2(yy - side / 2, xx - side / 2)
    wobble = sum(rng.uniform(0.02, 0.05) * np.sin(ang * k + rng.uniform(0, 6.28)) for k in (3, 5, 8))
    alpha = np.clip((0.95 + wobble - r) / 0.38, 0, 1) ** 1.3
    out = np.dstack([np.asarray(tex), (alpha * 255).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def main(names: set) -> None:
    os.makedirs(DST, exist_ok=True)
    for fn in sorted(os.listdir(SRC)):
        if not (fn.startswith('v3_') and fn.endswith('.png')):
            continue
        name = fn[3:-4]
        if names and name not in names:
            continue
        src = Image.open(os.path.join(SRC, fn))
        if name == 'dirt':
            im = road_brush(src)
            path = os.path.join(DST, 'vil3_road_brush.png')
            im.save(path)
            write_meta(path, 'vil3_road_brush', im.width, im.height)
            print('wrote road_brush', im.size)
            continue
        if name == 'ground':
            continue  # 10-29 第一版太平太亮(用户:偏卡通),换 ground2
        if name == 'ground2':
            im = warm(seamless(src).resize((1024, 1024), Image.LANCZOS))
            path = os.path.join(GROUND_DST, 'ground_village3.png')
            im.save(path)
            write_meta(path, 'ground_village3', im.width, im.height)
            print('wrote ground_village3', im.size)
            continue
        im = cutout(src)
        if name not in FLAT:
            im = shadowize(im, plate_of(src))
        if name in HOLES:
            im = punch_holes(im)
        side = 1536 if name in BIG else 256 if name in TINY else 512 if name in SMALL else 1024
        k = side / max(im.size)
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        if name in FLAT:
            im = feather(im.convert('RGBA'), FLAT[name])
        path = os.path.join(DST, f'vil3_{name}.png')
        im.save(path)
        write_meta(path, f'vil3_{name}', im.width, im.height)
        print('wrote', name, im.size)


if __name__ == '__main__':
    main(set(sys.argv[1:]))
