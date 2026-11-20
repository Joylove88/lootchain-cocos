# -*- coding: utf-8 -*-
"""野外画质对比图(2026-11-20「野外达到守卫战精细度」):把守卫战截图和各野外地图截图缩到同宽,竖排 / 两两并排出一张对比图,并打印量化指标。

用法:python tools/qa/field_vs_guard_sheet.py <输出.jpg> <标签=图片路径> [标签=图片路径 ...]
指标(每张图一行,按整屏、去掉上下 12% 的 HUD 区算):
- sharp  = 拉普拉斯方差(高频细节量,越大越锐;同分辨率下才可比)
- contrast = 亮度标准差(明暗对比)
- sat    = 平均饱和度(HSV S)
- vig    = 四角亮度 / 中心亮度(< 1 = 有暗角)
- topbot = 上 1/3 亮度 / 下 1/3 亮度(景深 / 空气透视的粗指标)
- glow   = 高亮像素占比(V > 0.92,发光点多少)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter


def metrics(img: Image.Image) -> dict:
    w, h = img.size
    a = np.asarray(img.convert('RGB').crop((0, int(h * 0.12), w, int(h * 0.88))), dtype=np.float32) / 255
    lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    lap = np.abs(np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES), dtype=np.float32))
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hh, ww = lum.shape
    c = lum[hh // 3: hh * 2 // 3, ww // 3: ww * 2 // 3].mean()
    k = 8
    corners = np.mean([lum[:hh // k, :ww // k].mean(), lum[:hh // k, -ww // k:].mean(), lum[-hh // k:, :ww // k].mean(), lum[-hh // k:, -ww // k:].mean()])
    return {
        'sharp': round(float(lap.var()), 1),
        'contrast': round(float(lum.std()), 3),
        'sat': round(float(sat.mean()), 3),
        'vig': round(float(corners / max(c, 1e-6)), 3),
        'topbot': round(float(lum[: hh // 3].mean() / max(lum[-hh // 3:].mean(), 1e-6)), 3),
        'glow': round(float((mx > 0.92).mean()), 4),
    }


def main() -> None:
    out = sys.argv[1]
    items = [a.split('=', 1) for a in sys.argv[2:]]
    W = 1200
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 34)
    tiles = []
    for label, path in items:
        img = Image.open(path).convert('RGB')
        m = metrics(img)
        print(label, m)
        t = img.resize((W, round(img.height * W / img.width)), Image.LANCZOS)
        d = ImageDraw.Draw(t)
        d.rectangle((0, 0, W, 50), fill=(0, 0, 0))
        d.text((14, 6), f'{label}  锐 {m["sharp"]}  对比 {m["contrast"]}  饱和 {m["sat"]}  暗角 {m["vig"]}', fill=(255, 230, 160), font=font)
        tiles.append(t)
    cols = 2
    rows = (len(tiles) + cols - 1) // cols
    th = max(t.height for t in tiles)
    sheet = Image.new('RGB', (W * cols + 10 * (cols - 1), th * rows + 10 * (rows - 1)), (20, 20, 20))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * (W + 10), (i // cols) * (th + 10)))
    sheet.save(out, quality=90)
    print('saved', out, sheet.size)


if __name__ == '__main__':
    main()
