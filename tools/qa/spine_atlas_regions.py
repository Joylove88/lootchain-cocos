# -*- coding: utf-8 -*-
"""把骨骼图集里某个前缀的小图裁出来拼成一张总览(看英雄 / 特效骨骼里自带了哪些贴图、长什么样)。

用法:python tools/qa/spine_atlas_regions.py <图集 .atlas> <输出 png> [前缀,默认 tx/] [--bg=灰度 0~255,默认 96]
每个小图下面标名字和原始尺寸;底色用中灰,方便同时看清白色和深色的半透明贴图。
别的脚本可以 import 本文件用 parse() / regions()。
"""
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = r'C:\Windows\Fonts\NotoSansSC-VF.ttf'


def parse(path):
    """返回 [(页图文件名, 区域名, x, y, w, h, 是否旋转)]。只认旧版图集写法(rotate / xy / size 各占一行)。"""
    out, page = [], None
    lines = open(path, encoding='utf-8').read().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            page = None
            i += 1
            continue
        if page is None:
            page = line.strip()
            i += 1
            # 页头:size / format / filter / repeat
            while i < len(lines) and ':' in lines[i] and not lines[i].startswith(' '):
                i += 1
            continue
        if not line.startswith(' '):
            name, cur = line.strip(), {}
            i += 1
            while i < len(lines) and lines[i].startswith(' '):
                k, v = lines[i].strip().split(':', 1)
                cur[k.strip()] = v.strip()
                i += 1
            x, y = [int(t) for t in cur['xy'].split(',')]
            w, h = [int(t) for t in cur['size'].split(',')]
            out.append((page, name, x, y, w, h, cur.get('rotate', 'false') not in ('false', '0')))
            continue
        i += 1
    return out


def natural(name):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', name)]


def regions(atlas, prefix=''):
    """按名字自然排序,返回 [(区域名, 裁好并转正的小图)]。"""
    base = os.path.dirname(atlas)
    pages = {}
    tiles = []
    for page, name, x, y, w, h, rot in sorted(parse(atlas), key=lambda r: natural(r[1])):
        if not name.startswith(prefix):
            continue
        if page not in pages:
            pages[page] = Image.open(os.path.join(base, page)).convert('RGBA')
        im = pages[page].crop((x, y, x + (h if rot else w), y + (w if rot else h)))
        if rot:
            im = im.rotate(-90, expand=True)
        tiles.append((name, im))
    return tiles


def contact_sheet(tiles, out, strip='', bg=96, cell=150, cols=10):
    """tiles = [(名字, 小图)];拼成每格 cell 像素的总览。"""
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * (cell + 30)), (bg, bg, bg))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 13)
    for i, (name, im) in enumerate(tiles):
        cx, cy = (i % cols) * cell, (i // cols) * (cell + 30)
        t = im.copy()
        t.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        sheet.paste(t, (cx + (cell - t.width) // 2, cy + (cell - t.height) // 2), t)
        label = name[len(strip):] if strip and name.startswith(strip) else name
        d.text((cx + 4, cy + cell + 2), f'{label} {im.width}x{im.height}', font=f, fill=(255, 255, 255))
    sheet.save(out)
    print(out, sheet.size, len(tiles), 'regions')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    atlas, out = args[0], args[1]
    prefix = args[2] if len(args) > 2 else 'tx/'
    bg = int(next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--bg=')), '96'))
    tiles = regions(atlas, prefix)
    if not tiles:
        print('no region with prefix', prefix)
        return
    contact_sheet(tiles, out, strip=prefix, bg=bg)


if __name__ == '__main__':
    main()
