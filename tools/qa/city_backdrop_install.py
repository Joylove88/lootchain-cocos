# -*- coding: utf-8 -*-
"""主城北缘远景 + 动态层素材入库(11-10 原型「照这个做」;配合 city_backdrop_gen.py):
  ui/world/city4/backdrop_0..2.jpg  远景横条(左 / 中 / 右三张生成图各取上 CROP,交界 FADE px 交叉淡化,统一压暖雾),
                                    整条再切三段(单张贴图宽度 ≤ 2048,手机 GPU 安全)
  ui/world/fx/fg_canopy.png         近景虚化树冠(city4_tree_oak 压暗 + 高斯模糊)
  ui/world/fx/mote.png              浮尘光点(白色柔边圆,运行时染暖色)
打印远景整条尺寸 → 填 LobbyWorldMaps CITY.backdrop。
用法:python tools/qa/city_backdrop_install.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import woods_ground_install as WG  # noqa: E402
from city_backdrop_gen import OUT, ROOT  # noqa: E402

CITY4 = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
FX = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'fx')
CROP = 0.6      # 只取上 60%(王宫山丘 + 远山 + 天);下面的近处小屋比城里房子还大,比例不对
FADE = 300      # 拼接交叉淡化宽度(原图像素)
PIECES = 3
HAZE = np.array([238, 226, 204], np.float32)


def meta(name, ext, w, h, alpha):
    m = WG.meta_for(name, ext, w, h, False, True)
    m['userData']['hasAlpha'] = alpha
    if alpha:
        m['userData']['fixAlphaTransparencyArtifacts'] = True
    # 不裁透明边(运行时按整图尺寸摆放)
    for sm in m['subMetas'].values():
        if sm.get('importer') == 'sprite-frame':
            sm['userData']['trimType'] = 'none'
    return m


def panel(name, h_ref=None):
    im = Image.open(os.path.join(OUT, name + '.png')).convert('RGB')
    im = im.crop((0, 0, im.width, int(im.height * CROP)))
    if h_ref and im.height != h_ref:
        im = im.resize((round(im.width * h_ref / im.height), h_ref), Image.LANCZOS)
    return np.asarray(im, np.float32)


def stitch(parts):
    out = parts[0]
    for p in parts[1:]:
        h = out.shape[0]
        w = out.shape[1] + p.shape[1] - FADE
        acc = np.zeros((h, w, 3), np.float32)
        acc[:, :out.shape[1] - FADE] = out[:, :out.shape[1] - FADE]
        t = np.linspace(0, 1, FADE)[None, :, None]
        t = t * t * (3 - 2 * t)
        acc[:, out.shape[1] - FADE:out.shape[1]] = out[:, -FADE:] * (1 - t) + p[:, :FADE] * t
        acc[:, out.shape[1]:] = p[:, FADE:]
        out = acc
    return out


def grade(a):
    """同原型:先去一点饱和,再压暖雾,越往上越淡(远景比城里淡)。"""
    h = a.shape[0]
    lum = a.mean(axis=2, keepdims=True)
    a = a * 0.8 + lum * 0.2
    far = (1 - np.arange(h) / (h - 1))[:, None, None]
    amt = 0.28 + 0.3 * far
    return a * (1 - amt) + HAZE * amt


def backdrop():
    c = panel('city_backdrop')
    parts = [panel('city_backdrop_l', c.shape[0]), c, panel('city_backdrop_r', c.shape[0])]
    a = grade(stitch(parts)).clip(0, 255).astype(np.uint8)
    h, w = a.shape[:2]
    step = int(np.ceil(w / PIECES))
    for i in range(PIECES):
        piece = Image.fromarray(a[:, i * step:min(w, (i + 1) * step)])
        dst = os.path.join(CITY4, f'backdrop_{i}.jpg')
        piece.save(dst, quality=88, optimize=True)
        WG.write_meta(dst, meta(f'backdrop_{i}', '.jpg', piece.width, piece.height, False))
        print('piece', i, piece.size)
    print(f'backdrop total {w}x{h}  piece_w {step}')


def fg_canopy():
    tree = Image.open(os.path.join(CITY4, 'city4_tree_oak.png')).convert('RGBA')
    tree.thumbnail((440, 440), Image.LANCZOS)
    pad = 36
    canvas = Image.new('RGBA', (tree.width + pad * 2, tree.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(tree, (pad, pad))
    a = np.asarray(canvas, np.float32)
    a[..., :3] *= np.array([0.42, 0.44, 0.38])
    im = Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(8))
    dst = os.path.join(FX, 'fg_canopy.png')
    im.save(dst, optimize=True)
    WG.write_meta(dst, meta('fg_canopy', '.png', im.width, im.height, True))
    print('fg_canopy', im.size)


def mote():
    s = 64
    y, x = np.mgrid[0:s, 0:s]
    r = np.hypot(x - (s - 1) / 2, y - (s - 1) / 2) / (s / 2)
    alpha = np.clip(1 - r, 0, 1) ** 2.2
    core = np.exp(-(r / 0.22) ** 2)
    alpha = np.clip(alpha * 0.55 + core * 0.6, 0, 1)
    rgba = np.zeros((s, s, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
    dst = os.path.join(FX, 'mote.png')
    Image.fromarray(rgba, 'RGBA').save(dst, optimize=True)
    WG.write_meta(dst, meta('mote', '.png', s, s, True))
    print('mote', s)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    fg_canopy()
    mote()
    backdrop()
