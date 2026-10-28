"""商店 B 风格插画从已确认原型抠图(2026-10-29):原型卡片底色均匀,按与底色的色差算透明度,半透明边反推前景色。
输出 assets/resources/ui/shop/glass/*.png + meta(sprite-frame / trim none / 不压缩)。
用法:python tools/qa/shop_proto_extract.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glass_kit_gen import ROOT, write_meta  # noqa: E402

PROTO = os.path.join(ROOT, '周报截图', '2026-10-28_整体UI去AI感', 'proto')
OUT = os.path.join(ROOT, 'assets', 'resources', 'ui', 'shop', 'glass')

# 原型(1870×841)里的插画框:x0, y0, x1, y1
CUTS = {
    'shop_b.png': {
        'illu_gold_small': (150, 262, 470, 492),
        'illu_gold_medium': (565, 262, 890, 492),
        'illu_gold_large': (978, 262, 1310, 495),
        'illu_gold_chest': (1390, 258, 1738, 505),
    },
    'shop_stamina_b_barB.png': {
        'illu_stamina': (380, 248, 650, 528),
    },
    'shop_diamond_b.png': {
        'illu_diamond_1': (106, 345, 406, 508),
        'illu_diamond_2': (447, 345, 747, 508),
        # 原型里这张是「热门」高亮卡,卡内底偏暖:阈值调高,不把暖底当主体
        'illu_diamond_3': (787, 340, 1087, 508, 26),
        'illu_diamond_4': (1127, 312, 1427, 508),
        'illu_diamond_5': (1467, 300, 1767, 508),
    },
}


def cut(img, box, lo=10, hi=70):
    a = np.asarray(img).astype(float)
    x0, y0, x1, y1 = box
    r = a[y0:y1, x0:x1]
    edge = np.concatenate([r[0], r[-1], r[:, 0], r[:, -1]])
    bg = np.median(edge, axis=0)
    alpha = np.clip((np.sqrt(((r - bg) ** 2).sum(2)) - lo) / (hi - lo), 0, 1)
    # 只留主体附近:实心区(alpha > 0.6)外扩 ~14px 之外的淡斑(原型背景窗影漏进来的)清零,边缘再柔化一圈
    core = Image.fromarray(((alpha > 0.6) * 255).astype(np.uint8))
    near = np.asarray(core.filter(ImageFilter.MaxFilter(29)).filter(ImageFilter.GaussianBlur(4))).astype(float) / 255
    alpha = alpha * np.clip(near * 1.6, 0, 1)
    # 抠图框四边 14px 内渐隐:主体若被框边切到(或框边附近残留背景),上机不会露出一道直边
    hgt, wid = alpha.shape
    yy, xx = np.mgrid[0:hgt, 0:wid]
    border = np.minimum(np.minimum(xx, wid - 1 - xx), np.minimum(yy, hgt - 1 - yy)).astype(float)
    alpha = alpha * np.clip(border / 14.0, 0, 1)
    fg = np.clip((r - bg * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3), 0, 255)
    out = np.zeros(r.shape[:2] + (4,), np.uint8)
    out[..., :3] = fg.astype(np.uint8)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main():
    os.makedirs(OUT, exist_ok=True)
    for proto, items in CUTS.items():
        img = Image.open(os.path.join(PROTO, proto)).convert('RGB')
        if img.size != (1870, 841):
            img = img.resize((1870, 841), Image.LANCZOS)
        for name, box in items.items():
            im = cut(img, box[:4], lo=box[4] if len(box) > 4 else 10)
            # 放大 2 倍存,手机高分屏显示不糊
            im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
            path = os.path.join(OUT, f'{name}.png')
            im.save(path)
            write_meta(path, im.width, im.height)
            print('wrote', name, im.size)


if __name__ == '__main__':
    main()
