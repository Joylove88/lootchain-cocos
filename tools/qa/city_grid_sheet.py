# -*- coding: utf-8 -*-
"""主城网格巡检截图拼总览(city_web.py CITY_GRID=1 产物 g_<x>_<y>.jpg → 按世界坐标排成一张大图,北在上)。
用法:python tools/qa/city_grid_sheet.py <截图目录> [输出.jpg]
"""
import os
import re
import sys

from PIL import Image, ImageDraw


def main(src, dst):
    shots = {}
    for n in os.listdir(src):
        m = re.match(r'spot_g_(-?\d+)_(-?\d+)\.jpg$', n)
        if m:
            shots[(int(m.group(1)), int(m.group(2)))] = os.path.join(src, n)
    xs = sorted({k[0] for k in shots})
    ys = sorted({k[1] for k in shots}, reverse=True)
    tw, th = 480, 270
    sheet = Image.new('RGB', (tw * len(xs), th * len(ys)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for (x, y), p in shots.items():
        im = Image.open(p).convert('RGB').resize((tw, th))
        cx, cy = xs.index(x) * tw, ys.index(y) * th
        sheet.paste(im, (cx, cy))
        d.text((cx + 6, cy + th - 16), f'{x},{y}', fill=(255, 255, 0))
    sheet.save(dst, quality=85)
    print(dst, sheet.size, len(shots))


if __name__ == '__main__':
    src = sys.argv[1]
    main(src, sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, '_sheet.jpg'))
