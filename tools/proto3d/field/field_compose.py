# -*- coding: utf-8 -*-
"""把 field_shots.py 截的图拼成带标注的成品(左右对比 / 多张一排)。

  python tools/proto3d/field/field_compose.py pair  <输出.jpg> <左图> <右图> --title=标题 [--left=左标注] [--right=右标注] [--box=x0,y0,x1,y1]
  python tools/proto3d/field/field_compose.py strip <输出.jpg> <图1> <图2> … --title=标题 [--labels=a|b|c] [--box=x0,y0,x1,y1] [--cols=3]

--box 是从每张原图里裁哪一块(不给 = 整张)。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))


def font(size):
    for name in ('msyhbd.ttc', 'msyh.ttc', 'simhei.ttf'):
        p = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def crop(path):
    im = Image.open(path).convert('RGB')
    if OPT.get('box'):
        x0, y0, x1, y1 = [int(v) for v in OPT['box'].split(',')]
        im = im.crop((x0, y0, x1, y1))
    return im


def tag(im, text):
    if not text:
        return im
    d = ImageDraw.Draw(im, 'RGBA')
    f = font(max(20, im.width // 34))
    w = d.textlength(text, font=f)
    pad = 12
    d.rectangle((0, 0, w + pad * 2, f.size + pad * 1.6), fill=(8, 10, 14, 200))
    d.text((pad, pad * 0.5), text, font=f, fill=(244, 244, 244, 255))
    return im


def sheet(tiles, cols, title):
    w, h = tiles[0].size
    gap = 8
    head = 64 if title else 0
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * w + (cols - 1) * gap, head + rows * h + (rows - 1) * gap), (10, 12, 16))
    if title:
        ImageDraw.Draw(out).text((14, 12), title, font=font(32), fill=(244, 244, 244))
    for i, t in enumerate(tiles):
        out.paste(t.resize((w, h), Image.LANCZOS) if t.size != (w, h) else t, ((i % cols) * (w + gap), head + (i // cols) * (h + gap)))
    return out


def main():
    if len(ARGS) < 3:
        raise SystemExit(__doc__)
    mode, dst = ARGS[0], ARGS[1]
    if mode == 'pair':
        tiles = [tag(crop(ARGS[2]), OPT.get('left', '开:有模型的队员和怪换成 3D')), tag(crop(ARGS[3]), OPT.get('right', '关:现在线上的 2D 骨骼'))]
        out = sheet(tiles, 2, OPT.get('title', ''))
    else:
        labels = OPT.get('labels', '').split('|') if OPT.get('labels') else []
        tiles = [tag(crop(p), labels[i] if i < len(labels) else '') for i, p in enumerate(ARGS[2:])]
        out = sheet(tiles, int(OPT.get('cols', '3')), OPT.get('title', ''))
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    out.save(dst, quality=90)
    print(dst, out.size)


if __name__ == '__main__':
    main()
