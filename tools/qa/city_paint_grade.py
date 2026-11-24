# -*- coding: utf-8 -*-
"""手绘主城「去 AI 感」调色(2026-11-24 样张 V1:不重画,只后期):
压黄绿与高光(满屏黄绿高光是 AI 味最重的一点)、阴影提亮偏冷(天光)、削弱最细一层碎细节(处处一样锐利)、加一层很淡的大尺度明暗起伏(草坪平涂)。

  python tools/qa/city_paint_grade.py <输入图> <输出图> [--strength 1.0]
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def grade(im, strength=1.0, seed=7):
    rgb = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # 1) 黄绿(约 50°~120°)降饱和、往深绿偏一点、亮叶子压暗
    hue_deg = h * 360
    w = np.clip(1 - np.abs(hue_deg - 85) / 40, 0, 1) * np.clip((s - 0.15) / 0.25, 0, 1)
    s2 = s * (1 - 0.22 * strength * w)
    h2 = h + (6 / 360) * strength * w * np.clip((95 - hue_deg) / 30, 0, 1)
    v2 = v - 0.10 * strength * w * np.clip((v - 0.62) / 0.3, 0, 1)
    out = np.asarray(Image.fromarray((np.stack([h2 % 1, s2, v2], -1).clip(0, 1) * 255).astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255
    # 2) 全局高光压一点(去「发光」感)、阴影提亮偏冷
    luma = out @ np.array([0.299, 0.587, 0.114], np.float32)
    hi = np.clip((luma - 0.68) / 0.32, 0, 1)
    out = out - 0.07 * strength * hi[..., None] * out
    lo = np.clip(1 - luma / 0.42, 0, 1) ** 2
    out = out + strength * lo[..., None] * np.array([0.010, 0.022, 0.050], np.float32)
    # 3) 最细一层细节削弱 30%(碎石 / 叶片 / 瓦片那层「处处锐利」)
    blur = np.asarray(Image.fromarray((out.clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32) / 255
    out = out - 0.30 * strength * (out - blur)
    # 4) 大尺度明暗起伏 ±3.5%(草坪 / 石板不再是一整块均匀颜色)
    rng = np.random.default_rng(seed)
    H, W = out.shape[:2]
    small = rng.random((max(2, H // 96), max(2, W // 96))).astype(np.float32)
    noise = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(40))).astype(np.float32) / 255
    out = out * (1 + 0.07 * strength * (noise - 0.5))[..., None]
    return Image.fromarray((out.clip(0, 1) * 255 + 0.5).astype(np.uint8))


if __name__ == '__main__':
    st = float(sys.argv[sys.argv.index('--strength') + 1]) if '--strength' in sys.argv else 1.0
    grade(Image.open(sys.argv[1]), st).save(sys.argv[2], quality=92)
    print('ok', sys.argv[2])
