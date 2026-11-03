# -*- coding: utf-8 -*-
"""女主马甲领口换成男主的(11-03 用户「能不能和男主一样」):两套骨骼同底、贴图同布局,
男主马甲是宽毛领 V 口、脖子露在里面;女主被画成贴脖立领,怎么挪头都像飘着。
把男主 body01 / body02 贴图的领口区域(羽化边)盖到女主同位置上,其余(胸甲 / 缝线 / 腰带)保留女版。
用法:python tools/qa/protag_collar_graft.py <女主 png 输入> <输出 png>(男主贴图 = 仓库 protag_m.png)
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MALE = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero', 'protag_m', 'protag_m.png')
# 贴图区域(图集坐标,旋转存放)+ 正向贴图里要覆盖的领口矩形 (x0, y0, x1, y1) + 羽化宽
REGIONS = {
    'body01': ((829, 114, 176, 339), (40, 80, 176, 190), 10),
    'body02': ((1543, 605, 214, 381), (60, 60, 214, 190), 10),
}


def upright(im, x, y, w, h):
    return im.crop((x, y, x + h, y + w)).rotate(-90, expand=True)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    f = Image.open(src).convert('RGBA')
    m = Image.open(MALE).convert('RGBA')
    for name, ((x, y, w, h), (x0, y0, x1, y1), feather) in REGIONS.items():
        fu = np.asarray(upright(f, x, y, w, h)).astype(np.float32)
        mu = np.asarray(upright(m, x, y, w, h)).astype(np.float32)
        H, W = fu.shape[:2]
        yy, xx = np.mgrid[0:H, 0:W]
        inside = np.minimum.reduce([xx - x0, x1 - 1 - xx, yy - y0, y1 - 1 - yy]).astype(np.float32)
        t = np.clip((inside + 1) / feather, 0, 1)[..., None]
        out = fu * (1 - t) + mu * t
        back = Image.fromarray(out.round().astype(np.uint8), 'RGBA').rotate(90, expand=True)
        f.paste(back, (x, y))
        print(name, 'grafted')
    f.save(dst, optimize=True)


if __name__ == '__main__':
    main()
