# -*- coding: utf-8 -*-
"""主城(月夜)遮挡条自查图:裁一块整城图,把每条遮挡条按「脚线离它下沿多远」上色,并画出脚线。
  绿 = 脚线就在这条的下沿(普通立物:墙脚 / 柱脚);橙 = 脚线在下沿下面(悬空段,比如门洞拱顶,脚线是手工给的);
  红线 = 脚线;蓝线 = 一条的上沿(同一列里上下两条之间的分界 = 入库脚本切开的地方)。青色小方点 = 可走格中心。
用法:python tools/qa/city_moon_strips_dbg.py 名字 x0 y0 x1 y1 [放大倍数]     (整图像素)
输出:%TEMP%/lootchain-qa/city_moon/strips_<名字>.jpg
"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(os.environ.get('TEMP', '/tmp'), 'lootchain-qa', 'city_moon')


def load_data():
    s = io.open(os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyCityMoonData.ts'), encoding='utf-8').read()
    d, _ = json.JSONDecoder().raw_decode(s[s.index('= {"px"') + 2:])
    return d


def main():
    name, x0, y0, x1, y1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    zoom = float(sys.argv[6]) if len(sys.argv) > 6 else 2.0
    d = load_data()
    im = Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((int(im.width * zoom), int(im.height * zoom)), Image.LANCZOS).convert('RGBA')
    over = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(over)
    cell = d['cell']
    dots = []
    for r, hexrow in enumerate(d['walk']):
        if (r + 1) * cell < y0 or r * cell > y1:
            continue
        for c in range(d['cols']):
            if c * cell > x1 or (c + 1) * cell < x0:
                continue
            if (int(hexrow[c >> 2], 16) >> (3 - (c & 3))) & 1:
                cx, cy = ((c + 0.5) * cell - x0) * zoom, ((r + 0.5) * cell - y0) * zoom
                dots.append((cx, cy))
    for sx, sy, sw, sh, foot in d['strips']:
        if sx + sw < x0 or sx > x1 or sy + sh < y0 or max(foot, sy) > y1 + 400:
            continue
        hang = foot > sy + sh + 2
        col = (255, 150, 30, 70) if hang else (40, 220, 90, 45)
        dr.rectangle([(sx - x0) * zoom, (sy - y0) * zoom, (sx + sw - x0) * zoom - 2, (sy + sh - y0) * zoom], fill=col)
        dr.line([(sx - x0) * zoom, (sy - y0) * zoom, (sx + sw - x0) * zoom - 2, (sy - y0) * zoom], fill=(60, 120, 255, 255), width=2)
        dr.line([(sx - x0) * zoom, (foot - y0) * zoom, (sx + sw - x0) * zoom - 2, (foot - y0) * zoom], fill=(255, 30, 30, 255), width=3)
    # 可走格:格子中心一个青色小方点(画在最上面,和遮挡条的绿底分得开)
    half = max(1.5, cell * zoom * 0.16)
    for cx, cy in dots:
        dr.rectangle([cx - half, cy - half, cx + half, cy + half], fill=(40, 230, 255, 235))
    out = Image.alpha_composite(im, over).convert('RGB')
    dd = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype('arial.ttf', 14)
    except Exception:
        font = ImageFont.load_default()
    step = 50 if (x1 - x0) <= 700 else 100
    for gx in range((x0 // step + 1) * step, x1, step):
        dd.text(((gx - x0) * zoom + 2, 2), str(gx), fill=(255, 255, 0), font=font)
        dd.line([(gx - x0) * zoom, 0, (gx - x0) * zoom, 10], fill=(255, 255, 0), width=1)
    for gy in range((y0 // step + 1) * step, y1, step):
        dd.text((2, (gy - y0) * zoom + 2), str(gy), fill=(0, 255, 255), font=font)
        dd.line([0, (gy - y0) * zoom, 10, (gy - y0) * zoom], fill=(0, 255, 255), width=1)
    dst = os.path.join(SRC, f'strips_{name}.jpg')
    out.save(dst, quality=88)
    print(dst, out.size)


if __name__ == '__main__':
    main()
