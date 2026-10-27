"""把 GPT 出的透明底素材表按连通块切成单件(裁到内容边),按网格顺序(先行后列)命名。
用法:python tools/qa/slice_sheet.py <素材表.png> <输出目录> name1,name2,... [--rows N] [--pad 4] [--merge 18]
- 连通块按 alpha>24 求,先膨胀 merge 像素把尖刺 / 分离的小饰件并进主体;
- rows 指定行数时按中心 y 聚成 N 行,每行按 x 排序;
- 每件四周留 pad 像素透明边;外缘 alpha<8 清零,去掉生成噪点。
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def label_components(mask: np.ndarray, merge: int):
    """膨胀后求连通块(不依赖 scipy):MaxFilter 膨胀 + 逐块 floodfill 打标签(最多 250 块)。"""
    img = Image.fromarray((mask * 255).astype(np.uint8), 'L')
    size = merge * 2 + 1
    while size > 1:
        step = min(size, 9) | 1
        img = img.filter(ImageFilter.MaxFilter(step))
        size -= step - 1
    count = 0
    while True:
        arr = np.array(img)
        hits = np.argwhere(arr == 255)
        if len(hits) == 0 or count >= 250:
            break
        count += 1
        y, x = hits[0]
        ImageDraw.floodfill(img, (int(x), int(y)), count)
    labels = np.array(img).astype(np.int32)
    return labels, count


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('out')
    ap.add_argument('names')
    ap.add_argument('--rows', type=int, default=0)
    ap.add_argument('--pad', type=int, default=4)
    ap.add_argument('--merge', type=int, default=18)
    ap.add_argument('--min-area', type=int, default=1500)
    args = ap.parse_args()
    names = args.names.split(',')
    im = Image.open(args.sheet).convert('RGBA')
    arr = np.array(im)
    alpha = arr[:, :, 3]
    arr[alpha < 8] = 0
    mask = alpha > 24
    labels, count = label_components(mask, args.merge)
    boxes = []
    for index in range(1, count + 1):
        part = (labels == index) & mask
        if part.sum() < args.min_area:
            continue
        ys, xs = np.nonzero(part)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, index))
    if args.rows > 0:
        boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
        per = int(np.ceil(len(boxes) / args.rows))
        ordered = []
        for r in range(args.rows):
            ordered += sorted(boxes[r * per:(r + 1) * per], key=lambda b: b[0])
        boxes = ordered
    print(f'{len(boxes)} 件(期望 {len(names)})')
    os.makedirs(args.out, exist_ok=True)
    for (x0, y0, x1, y1, index), name in zip(boxes, names):
        crop = arr[y0:y1, x0:x1].copy()
        keep = labels[y0:y1, x0:x1] == index
        crop[~keep] = 0
        p = args.pad
        out = np.zeros((crop.shape[0] + p * 2, crop.shape[1] + p * 2, 4), dtype=np.uint8)
        out[p:-p, p:-p] = crop
        Image.fromarray(out).save(os.path.join(args.out, f'{name}.png'))
        print(name, (x1 - x0, y1 - y0), 'at', (x0, y0))


if __name__ == '__main__':
    main()
