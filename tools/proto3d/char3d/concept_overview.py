# -*- coding: utf-8 -*-
"""把一批三视图设定图拼成一张带名字的总览(给用户确认设计用,不进 git)。

用法:python concept_overview.py <设定图目录> <输出 jpg> --items="主角男:主角 · 男(觉醒境),主角女:…" [--title=…] [--cols=2] [--suffix=_三视图_v1] [--w=1100]
  --items  逗号分隔,每项「文件名前缀:显示的名字」(不写冒号就用前缀当名字)
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = r'C:\Windows\Fonts\msyh.ttc'
FONT_B = r'C:\Windows\Fonts\msyhbd.ttc'
BG = (16, 16, 20)


def opt(name, default=''):
    return next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{name}=')), default)


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold and os.path.exists(FONT_B) else FONT, size)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    items = [x.split(':', 1) if ':' in x else [x, x] for x in opt('items').split(',') if x]
    cols = int(opt('cols', '2'))
    w = int(opt('w', '1100'))
    suffix = opt('suffix', '_三视图_v1')
    cells = []
    for key, label in items:
        p = os.path.join(src, f'{key}{suffix}.png')
        if not os.path.exists(p):
            print('缺', p)
            continue
        im = Image.open(p).convert('RGB')
        cells.append((label, im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS)))
    if not cells:
        raise SystemExit('一张都没有')
    ch = max(c[1].size[1] for c in cells)
    rows = (len(cells) + cols - 1) // cols
    gap, top, cap = 14, 76 if opt('title') else 14, 46
    sheet = Image.new('RGB', (cols * w + (cols + 1) * gap, top + rows * (ch + cap + gap)), BG)
    d = ImageDraw.Draw(sheet)
    if opt('title'):
        d.text((gap + 6, 18), opt('title'), font=font(32, True), fill=(240, 240, 240))
    for i, (label, im) in enumerate(cells):
        x = gap + (i % cols) * (w + gap)
        y = top + (i // cols) * (ch + cap + gap)
        d.text((x + 6, y + 4), label, font=font(28, True), fill=(235, 225, 190))
        sheet.paste(im, (x, y + cap))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out, quality=90)
    print('ok', out, sheet.size)


if __name__ == '__main__':
    main()
