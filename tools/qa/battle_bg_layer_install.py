# -*- coding: utf-8 -*-
"""战斗背景分层入库(配合 battle_bg_layer_gen.py,11-10):
  battle_scene_<名>.png       远景层 = 整图(覆盖原图,保留 uuid;原图先备份到 素材原始备份/battle-bg-20261110/)
  battle_scene_<名>_near.png  近景层 = 整图像素 × 遮罩(遮罩取自 _nearmask 的非品红区,按列自下而上连通,边缘羽化 2px)
  battle_fog_strip.png        雾带(横向无缝,白色 + 柔和透明度,运行时按主题染色)
并打印每张图的「近景上沿」比例(从图顶算,列中位数)→ 填 LobbyGuardBattleRenderer.SCENE_BG_LAYER。

用法:python tools/qa/battle_bg_layer_install.py [背景名...]   (不带参数 = 产物目录里已有遮罩的全部)
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import woods_ground_install as WG  # noqa: E402
from battle_bg_layer_gen import OUT, BG, ROOT  # noqa: E402

BAK = os.path.join(ROOT, '素材原始备份', 'battle-bg-20261110')


def meta(name, w, h, alpha):
    m = WG.meta_for(name, '.png', w, h, False, True)
    m['userData']['hasAlpha'] = alpha
    m['userData']['fixAlphaTransparencyArtifacts'] = True
    return m


def near_mask(mask_img, size):
    a = np.asarray(mask_img.convert('RGB').resize(size, Image.LANCZOS)).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magenta = (np.minimum(r, b) - g > 90) & (r > 150) & (b > 150)
    h, w = magenta.shape
    # 按列自下而上:遇到连续 ≥6px 品红就停,上面全算远景(近景里零星误判的品红点补回)
    top = np.zeros(w, np.int32)
    for x in range(w):
        col = magenta[:, x]
        run = 0
        y0 = 0
        for y in range(h - 1, -1, -1):
            if col[y]:
                run += 1
                if run >= 6:
                    y0 = y + run
                    break
            else:
                run = 0
        top[x] = y0
    m = np.zeros((h, w), np.float32)
    for x in range(w):
        m[top[x]:, x] = 1.0
    im = Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    return im, float(np.median(top) / h)


def fog_strip():
    """横向无缝雾带 1024×256:多层可平铺噪声 × 竖向柔和轮廓。"""
    w, h = 1024, 256
    rng = np.random.default_rng(11)
    x = np.arange(w)
    acc = np.zeros((h, w), np.float32)
    for cells, amp in ((3, 0.4), (7, 0.28), (15, 0.18), (31, 0.14)):
        gx = rng.random((cells + 1, 8)).astype(np.float32)
        gx[-1] = gx[0]
        t = x * cells / w
        i0 = t.astype(int)
        f = t - i0
        f = f * f * (3 - 2 * f)
        cols = gx[i0] * (1 - f)[:, None] + gx[i0 + 1] * f[:, None]  # w × 8
        ys = np.linspace(0, 7, h)
        j0 = np.minimum(ys.astype(int), 6)
        fy = ys - j0
        fy = fy * fy * (3 - 2 * fy)
        acc += amp * (cols[:, j0] * (1 - fy) + cols[:, j0 + 1] * fy).T
    prof = np.exp(-((np.linspace(-1, 1, h)) / 0.42) ** 2)[:, None]
    alpha = np.clip((acc - 0.28) / 0.55, 0, 1) ** 1.6 * prof * 0.8
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
    out = os.path.join(BG, 'battle_fog_strip.png')
    Image.fromarray(rgba, 'RGBA').save(out, optimize=True)
    WG.write_meta(out, meta('battle_fog_strip', w, h, True))
    print('fog', out)


def install(name):
    full_p = os.path.join(OUT, name + '.png')
    mask_p = os.path.join(OUT, name + '_nearmask.png')
    if not (os.path.exists(full_p) and os.path.exists(mask_p)):
        print('skip(缺图)', name)
        return
    os.makedirs(BAK, exist_ok=True)
    dst = os.path.join(BG, name + '.png')
    if os.path.exists(dst) and not os.path.exists(os.path.join(BAK, name + '.png')):
        shutil.copy2(dst, os.path.join(BAK, name + '.png'))
        shutil.copy2(dst + '.meta', os.path.join(BAK, name + '.png.meta'))
    full = Image.open(full_p).convert('RGB')
    w, h = full.size
    full.save(dst, optimize=True)
    WG.write_meta(dst, meta(name, w, h, False))
    m, top = near_mask(Image.open(mask_p), (w, h))
    near = full.convert('RGBA')
    near.putalpha(m)
    near_dst = os.path.join(BG, name + '_near.png')
    near.save(near_dst, optimize=True)
    WG.write_meta(near_dst, meta(name + '_near', w, h, True))
    print(f'{name}: {w}x{h} 近景上沿 {top:.3f}')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    names = sys.argv[1:] or sorted(n[:-len('_nearmask.png')] for n in os.listdir(OUT) if n.endswith('_nearmask.png'))
    fog_strip()
    for n in names:
        install(n)
