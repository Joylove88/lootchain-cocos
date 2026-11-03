# -*- coding: utf-8 -*-
"""进化抉择卡面图案(docs/58 §10):GPT 出的 5×3 白色线条图案(黑底)抠透明入库,运行时按路线颜色染色。
源:周报截图/2026-11-03_进化抉择/icons_v1.png(提示词同目录 icons_prompt.txt,参考原型 evolution_pick_b 卡面圆徽)
出:assets/resources/ui/evolution/glyph_<名>.png(128×128 白色 + alpha,meta sprite-frame)
用法:python tools/qa/evolution_glyphs.py [源图]
"""
import os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '周报截图', '2026-11-03_进化抉择', 'icons_v1.png')
OUT = os.path.join(ROOT, 'assets', 'resources', 'ui', 'evolution')
NAMES = [['atk', 'hp', 'guard', 'skill_dmg', 'skill_cd'],
         ['combo3', 'roll', 'speed', 'map_chest', 'map_hidden'],
         ['gold', 'exp', 'cat_attr', 'cat_combat', 'cat_explore']]
SIZE = 128


def main():
    os.makedirs(OUT, exist_ok=True)
    im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32) / 255.0
    h, w, _ = im.shape
    cw, ch = w / 5, h / 3
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            cell = im[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
            alpha = np.clip((cell.max(axis=2) - 0.06) / 0.80, 0, 1)
            ys, xs = np.where(alpha > 0.15)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            side = int(max(y1 - y0, x1 - x0) * 1.12)
            cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
            canvas = np.zeros((side, side), np.float32)
            sy, sx = cy - side // 2, cx - side // 2
            for yy in range(side):
                src_y = sy + yy
                if 0 <= src_y < cell.shape[0]:
                    lo, hi = max(0, sx), min(cell.shape[1], sx + side)
                    canvas[yy, lo - sx:hi - sx] = alpha[src_y, lo:hi]
            a = Image.fromarray((canvas * 255).round().astype(np.uint8), 'L').resize((SIZE, SIZE), Image.LANCZOS)
            white = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
            white.putalpha(a)
            path = os.path.join(OUT, f'glyph_{name}.png')
            white.save(path, optimize=True)
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), path], check=True, capture_output=True)
            print(name)


if __name__ == '__main__':
    main()
