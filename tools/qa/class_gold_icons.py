"""契约之选右上职业标识:GPT 出的亮金职业图标(黑底 3×2)抠透明入库(2026-11-03 用户「重新出亮金职业图标」,对齐原型 contract_pick_b)。
源:周报截图/2026-11-02_主角/class_icons/sheet_v1.png(提示词 prompt.txt,参考原型右上三个图标)
出:assets/resources/ui/glass/class_gold_<warrior|mage|archer|assassin|support|tank>.png(96×96 透明,meta sprite-frame)
黑底 → 亮度当 alpha、颜色反推(去黑边),按亮区包围盒居中,四周留 8% 边。
用法:python tools/qa/class_gold_icons.py
"""
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-11-02_主角', 'class_icons', 'sheet_v1.png')
OUT = os.path.join(ROOT, 'assets', 'resources', 'ui', 'glass')
NAMES = [['warrior', 'mage', 'archer'], ['assassin', 'support', 'tank']]
SIZE = 96


def main():
    im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32) / 255.0
    h, w, _ = im.shape
    cw, ch = w // 3, h // 2
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            cell = im[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            alpha = np.clip((cell.max(axis=2) - 0.04) / 0.80, 0, 1)
            rgb = np.where(alpha[..., None] > 0.001, np.clip(cell / np.maximum(alpha[..., None], 1e-3), 0, 1), 0)
            ys, xs = np.where(alpha > 0.1)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            side = int(max(y1 - y0, x1 - x0) * 1.16)
            cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
            rgba = np.dstack([rgb, alpha])
            canvas = np.zeros((side, side, 4), np.float32)
            sy, sx = cy - side // 2, cx - side // 2
            for yy in range(side):
                src_y = sy + yy
                if 0 <= src_y < ch:
                    lo, hi = max(0, sx), min(cw, sx + side)
                    canvas[yy, lo - sx:hi - sx] = rgba[src_y, lo:hi]
            out = Image.fromarray((canvas * 255).round().astype(np.uint8), 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)
            path = os.path.join(OUT, f'class_gold_{name}.png')
            out.save(path, optimize=True)
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), path], check=True)
            print(name, path)


if __name__ == '__main__':
    main()
