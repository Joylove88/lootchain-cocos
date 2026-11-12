# -*- coding: utf-8 -*-
"""把一张三视图设定图(几个人物并排站在纯色底上)切成几张单视图,给「多视图转 3D」当输入。

做法:四周边缘取底色 → 逐列看有没有和底色差得多的像素 → 连续有内容的列就是一个人物;
几个人物用同一个上下范围裁(保证三张里人物一样高、脚在同一条线上),左右各留一点边。

用法:python sheet_split.py <设定图 png> <输出目录> [--names=front,right,back] [--pad=0.05] [--thr=26] [--prefix=名字_]
  --names  从左到右每个人物对应的视图名。注意「侧面朝画面右边站」看到的是角色的右侧,所以叫 right。
输出:<输出目录>/<prefix><视图名>.png,并打印每张的尺寸和人物占的列范围,方便核对有没有切到相邻的人。
"""
import os
import sys

from PIL import Image


def arg(name, default):
    for a in sys.argv[3:]:
        if a.startswith('--' + name + '='):
            return a.split('=', 1)[1]
    return default


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, out_dir = sys.argv[1], sys.argv[2]
    names = arg('names', 'front,right,back').split(',')
    pad = float(arg('pad', '0.05'))
    thr = int(arg('thr', '26'))
    prefix = arg('prefix', '')

    im = Image.open(src).convert('RGB')
    W, H = im.size
    px = im.load()

    # 底色:四条边上的像素取中位数(人物不贴边,边上全是底)
    border = [px[x, y] for x in range(W) for y in (0, 1, H - 2, H - 1)] + [px[x, y] for y in range(H) for x in (0, 1, W - 2, W - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))

    def is_fg(x, y):
        c = px[x, y]
        return max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2])) > thr

    col = [sum(1 for y in range(H) if is_fg(x, y)) for x in range(W)]
    min_px = max(3, H // 300)          # 一列里至少这么多个前景像素才算「有内容」(挡掉零星噪点)

    # 连续有内容的列 → 人物;中间断开不到 6 列的算同一个人(指缝、发丝)
    runs = []
    start = None
    gap = 0
    for x in range(W):
        if col[x] >= min_px:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap > 6:
                runs.append((start, x - gap))
                start = None
                gap = 0
    if start is not None:
        runs.append((start, W - 1))
    runs = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:len(names)])
    # 相邻两个视图挨在一起(老鼠尾巴伸到旁边、熊的毛边贴着)会被当成一个:把最宽的那段从中间最细的一列切开,直到数目够
    while len(runs) < len(names):
        a, b = max(runs, key=lambda r: r[1] - r[0])
        lo, hi = a + int((b - a) * 0.2), a + int((b - a) * 0.8)
        cut = min(range(lo, hi + 1), key=lambda x: (col[x], abs(x - (a + b) // 2)))
        print(f'两个视图挨在一起,在第 {cut} 列切开(那一列只有 {col[cut]} 个前景像素)')
        runs.remove((a, b))
        runs += [(a, cut - 1), (cut + 1, b)]
        runs.sort()
    if len(runs) != len(names):
        raise SystemExit(f'只找到 {len(runs)} 个人物,要 {len(names)} 个;调 --thr 试试')

    # 上下范围:所有人物合起来的最高点和最低点
    rows = [y for y in range(H) if any(is_fg(x, y) for a, b in runs for x in range(a, b + 1, 2))]
    top, bottom = min(rows), max(rows)
    margin = int((bottom - top) * pad) + 8      # 每张图四周留的边(原图不够就用底色补)

    os.makedirs(out_dir, exist_ok=True)
    print(f'底色 {bg},人物上下 {top}~{bottom}(图高 {H}),四周留边 {margin}')
    for i, ((a, b), name) in enumerate(zip(runs, names)):
        # 从原图里能取多少取多少,但左右不能伸进相邻人物
        lo = (runs[i - 1][1] + a) // 2 if i > 0 else 0
        hi = (runs[i + 1][0] + b) // 2 if i + 1 < len(runs) else W
        x0, x1 = max(lo, a - margin), min(hi, b + margin + 1)
        y0, y1 = max(0, top - margin), min(H, bottom + margin + 1)
        crop = im.crop((x0, y0, x1, y1))
        # 原图留边不够的那几侧用底色补齐,保证每张图里人物四周的边一样宽
        cw, ch = (b - a + 1) + margin * 2, (bottom - top + 1) + margin * 2
        canvas = Image.new('RGB', (cw, ch), bg)
        canvas.paste(crop, (margin - (a - x0), margin - (top - y0)))
        path = os.path.join(out_dir, f'{prefix}{name}.png')
        canvas.save(path)
        print(f'{name}: 人物列 {a}~{b},从原图取 {x0}~{x1},成图 {cw}x{ch} -> {path}')


if __name__ == '__main__':
    main()
