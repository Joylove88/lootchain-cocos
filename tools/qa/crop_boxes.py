"""按手工框从 GPT 素材表裁单件(发光件会把相邻件连成一块,slice_sheet 切不开时用)。
用法:python tools/qa/crop_boxes.py <素材表.png> <输出目录> name=x0,y0,x1,y1 ...
框内 alpha<10 清零;只留主体(膨胀 6px 后最大连通块,外加面积 ≥ 主体 3% 的块),去掉相邻件漏进来的碎屑;裁到内容边,四周留 4px 透明边。
"""
import os
import sys

import numpy as np
from PIL import Image

from slice_sheet import label_components

src, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
sheet = Image.open(src).convert('RGBA')
for spec in sys.argv[3:]:
    name, box = spec.split('=')
    x0, y0, x1, y1 = (int(v) for v in box.split(','))
    im = np.array(sheet.crop((x0, y0, x1, y1)))
    im[im[:, :, 3] < 10] = 0
    mask = im[:, :, 3] > 24
    labels, count = label_components(mask, 6)
    if count > 1:
        areas = [int(((labels == i) & mask).sum()) for i in range(1, count + 1)]
        keep = {i + 1 for i, a in enumerate(areas) if a >= max(areas) * 0.03}
        im[~np.isin(labels, list(keep))] = 0
    ys, xs = np.nonzero(im[:, :, 3])
    im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    pad = np.zeros((im.shape[0] + 8, im.shape[1] + 8, 4), np.uint8)
    pad[4:-4, 4:-4] = im
    Image.fromarray(pad).save(os.path.join(out, name + '.png'))
    print(name, pad.shape[1], pad.shape[0])
