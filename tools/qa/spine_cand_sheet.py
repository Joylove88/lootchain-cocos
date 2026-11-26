# -*- coding: utf-8 -*-
"""骨骼底子选型对比图(2026-11-26 主角换底骨骼):fxprev/render_char.py 渲出的各动作 GIF → 每个候选一行关键帧。

  python tools/qa/spine_cand_sheet.py <输出.jpg> <渲染目录>|<标签>|<动作1,动作2,...> ...
动作名后加 * = 取「人物最舒展」那一帧(攻击 / 技能看招式);不加 = 取中间帧。同一行所有帧按同一比例缩放,看得出身高差。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageSequence

CELL_H = 300
FONT = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 22)
SMALL = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)


def frames(path):
    return [f.convert('RGB') for f in ImageSequence.Iterator(Image.open(path))]


def body_box(im):
    ref = im.getpixel((2, 2))
    diff = Image.eval(Image.merge('RGB', [Image.eval(c, lambda v: v) for c in im.split()]), lambda v: v)
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            p = px[x, y]
            if abs(p[0] - ref[0]) + abs(p[1] - ref[1]) + abs(p[2] - ref[2]) > 24:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 2, max(ys) + 2


def main():
    out = sys.argv[1]
    rows = []
    for spec in sys.argv[2:]:
        d, label, anims = spec.split('|')
        cells = []
        for a in anims.split(','):
            widest = a.endswith('*')
            name = a.rstrip('*')
            p = os.path.join(d, f'{name}.gif')
            if not os.path.exists(p):
                continue
            fr = frames(p)
            if widest:
                best, bw = fr[len(fr) // 2], -1
                for f in fr[:: max(1, len(fr) // 16)]:
                    b = body_box(f)
                    if b and b[2] - b[0] > bw:
                        best, bw = f, b[2] - b[0]
                f = best
            else:
                f = fr[len(fr) // 2]
            cells.append((name, f))
        rows.append((label, cells))
    # 统一缩放:每行按该行所有帧并集框裁剪,高度定到 CELL_H
    tiles = []
    for label, cells in rows:
        boxes = [body_box(f) for _, f in cells]
        boxes = [b for b in boxes if b]
        if not boxes:
            continue
        top = min(b[1] for b in boxes)
        bot = max(b[3] for b in boxes)
        k = (CELL_H - 30) / max(1, bot - top)
        row = []
        for (name, f), b in zip(cells, [body_box(f) for _, f in cells]):
            if not b:
                continue
            c = f.crop((max(0, b[0] - 10), top, min(f.width, b[2] + 10), bot))
            c = c.resize((max(1, round(c.width * k)), CELL_H - 30), Image.LANCZOS)
            t = Image.new('RGB', (c.width + 16, CELL_H), f.getpixel((2, 2)))
            t.paste(c, (8, 0))
            ImageDraw.Draw(t).text((8, CELL_H - 26), name, fill=(200, 200, 200), font=SMALL)
            row.append(t)
        tiles.append((label, row))
    width = max(220 + sum(t.width for t in row) for _, row in tiles)
    sheet = Image.new('RGB', (width, CELL_H * len(tiles)), (22, 24, 30))
    dr = ImageDraw.Draw(sheet)
    for i, (label, row) in enumerate(tiles):
        y = i * CELL_H
        for j, line in enumerate(label.split('/')):
            dr.text((12, y + 20 + j * 30), line, fill=(255, 230, 140) if j == 0 else (210, 210, 210), font=FONT if j == 0 else SMALL)
        x = 220
        for t in row:
            sheet.paste(t, (x, y))
            x += t.width
        dr.line((0, y, width, y), fill=(60, 60, 70))
    sheet.save(out, quality=88)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
