# -*- coding: utf-8 -*-
"""主城地面变体(11-10 用户实机「看起来好别扭」):
苔痕卵石 / 主街两层原来是另外生成(或镜像)的扇形铺石,跟底层老卵石石块对不齐,
交界处两套图案错位拼成撕纸边。改为全部从 tex_cobble 派生,逐像素对齐,交界只变色调:
  tex_cobble_moss = 同一张卵石,石缝里长青苔(按低频噪声成片,石面略偏暗偏冷)
  tex_street      = 同一张卵石,整体压暗偏暖 + 石面磨亮(车马多走的主街)
原图先备份到 素材原始备份/city4-20261110-ground/。

11-10 第二版:底层换成大块旧石板 tex_slab(用户给的场地参考:大石板、稀疏裂缝、低对比)→ 传源纹理名即可。

用法:python tools/qa/city_ground_variants.py [源纹理名,默认 tex_slab;tex_cobble = 第一版]
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
BAK = os.path.join(ROOT, '素材原始备份', 'city4-20261110-ground')


def tile_noise(n, cells, seed):
    """可平铺的值噪声(cells 格,双线性插值,环绕)。"""
    rng = np.random.default_rng(seed)
    g = rng.random((cells, cells)).astype(np.float32)
    t = np.arange(n, dtype=np.float32) * cells / n
    i0 = t.astype(int) % cells
    i1 = (i0 + 1) % cells
    f = t - np.floor(t)
    f = f * f * (3 - 2 * f)
    a = g[np.ix_(i0, i0)] * (1 - f)[None, :] + g[np.ix_(i0, i1)] * f[None, :]
    b = g[np.ix_(i1, i0)] * (1 - f)[None, :] + g[np.ix_(i1, i1)] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def wrap_blur(arr, r):
    """环绕边界的高斯模糊(保持平铺无缝)。"""
    k = np.arange(-r * 3, r * 3 + 1, dtype=np.float32)
    k = np.exp(-0.5 * (k / r) ** 2)
    k /= k.sum()
    out = arr.astype(np.float32)
    for axis in (0, 1):
        out = sum(np.roll(out, int(s), axis=axis) * w for s, w in zip(range(-r * 3, r * 3 + 1), k))
    return out


def main():
    os.makedirs(BAK, exist_ok=True)
    for n in ('tex_cobble.jpg', 'tex_cobble_moss.jpg', 'tex_street.jpg'):
        dst = os.path.join(BAK, n)
        if not os.path.exists(dst):
            shutil.copy2(os.path.join(DST, n), dst)
    name = (sys.argv[1:] or ['tex_slab'])[0]
    path = os.path.join(BAK, name + '.jpg')
    if not os.path.exists(path):
        path = os.path.join(DST, name + '.jpg')
    src = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255
    n = src.shape[0]
    lum = src.mean(axis=-1)
    # 石缝 = 比周围暗的细线
    joint = np.clip((wrap_blur(lum, 6) - lum - 0.02) / 0.08, 0, 1)
    joint = wrap_blur(joint, 1)

    # 苔痕:成片(低频噪声)出现在石缝里,石面稍偏暗偏冷
    patch = tile_noise(n, 6, 7) * 0.65 + tile_noise(n, 16, 8) * 0.35
    patch = np.clip((patch - 0.35) / 0.35, 0, 1)
    moss_c = np.array([0.36, 0.42, 0.24], np.float32)
    m = (joint * patch)[..., None] * 0.85
    moss = src * (1 - 0.08 * patch[..., None]) * np.array([0.98, 1.0, 0.98], np.float32)
    moss = moss * (1 - m) + moss_c * m * (0.8 + 0.4 * lum[..., None])
    Image.fromarray((np.clip(moss, 0, 1) * 255).round().astype(np.uint8)).save(os.path.join(DST, 'tex_cobble_moss.jpg'), quality=93)

    # 主街:压暗偏暖,石面磨亮(提一点石面对比),石缝更深
    face = 1 - joint
    st = src * np.array([0.86, 0.83, 0.79], np.float32)
    st = st + (lum - wrap_blur(lum, 3))[..., None] * 0.35 * face[..., None]
    st = st * (1 - 0.18 * joint[..., None])
    Image.fromarray((np.clip(st, 0, 1) * 255).round().astype(np.uint8)).save(os.path.join(DST, 'tex_street.jpg'), quality=93)
    print('ok', n, 'joint mean', round(float(joint.mean()), 3))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
