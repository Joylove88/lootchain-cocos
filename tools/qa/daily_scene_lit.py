"""每日副本 B 风格左栏 / 横幅用的提亮场景图(11-02 用户「地图封面太暗,要和原型一样亮」)。
原图 ui/daily/ai/scene_*.png 平均亮度 17~32,原型缩略图约 43~51:按图逐张求线性增益(暗部保持黑、亮部柔和压顶,不像 gamma 那样把暗部抬成灰雾)把平均亮度拉到 ~47,再加饱和度。
原图不动(旧版页面仍在用),输出 scene_*_lit.png(meta 同 glass_kit_gen 口径)。
用法:python tools/qa/daily_scene_lit.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageEnhance

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402

DIR = os.path.join(kit.ROOT, 'assets', 'resources', 'ui', 'daily', 'ai')
TARGET = 47.0


def lit(name):
    src = Image.open(os.path.join(DIR, f'scene_{name}.png')).convert('RGBA')
    rgb = np.asarray(src.convert('RGB')).astype(float) / 255.0
    lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2])
    def tone(x, gain):
        # 线性增益 + 软压顶(超过 0.8 的部分渐进逼近 1)
        y = x * gain
        knee = 0.8
        over = np.maximum(0, y - knee)
        return np.where(y > knee, knee + (1 - knee) * (1 - np.exp(-over / (1 - knee))), y)
    lo, hi = 1.0, 5.0
    for _ in range(30):  # 二分求增益,使平均亮度≈TARGET
        g = (lo + hi) / 2
        mean = tone(lum, g).mean() * 255
        if mean > TARGET:
            hi = g
        else:
            lo = g
    gain = (lo + hi) / 2
    scale = np.where(lum > 1e-4, tone(lum, gain) / np.maximum(lum, 1e-4), gain)
    out = np.clip(rgb * scale[..., None], 0, 1)
    im = Image.fromarray((out * 255).astype(np.uint8), 'RGB')
    im = ImageEnhance.Color(im).enhance(1.25)
    im.putalpha(src.getchannel('A'))
    path = os.path.join(DIR, f'scene_{name}_lit.png')
    im.save(path, optimize=True)
    kit.write_meta(path, im.width, im.height)
    print(name, f'gain={gain:.2f}', round(np.asarray(im.convert('L')).mean()))


if __name__ == '__main__':
    for key in ('awaken', 'forge', 'arcane', 'abyss'):
        lit(key)
