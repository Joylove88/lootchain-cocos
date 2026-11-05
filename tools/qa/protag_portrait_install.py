# -*- coding: utf-8 -*-
"""主角立绘换成和骨骼一致的服装(2026-11-05 用户「英雄名册里的主角封面图和布阵里主角骨骼形象不一致」)。
Codex 按骨骼截图出的透明全身图 → 按旧图人物包围盒等比对齐(同高、底对齐、水平居中)→ 覆盖原 810×1080 文件(meta / uuid 不变)。
旧图先备份到 素材原始备份/protag-portrait-20261105/。
用法:python tools/qa/protag_portrait_install.py <生成图目录>   (目录里 gen_base_m / gen_base_f / gen_lh_m / gen_lh_f .png)
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources', 'ui')
BACKUP = os.path.join(ROOT, '素材原始备份', 'protag-portrait-20261105')
MAP = {
    'gen_base_m.png': os.path.join(RES, 'protagonist', 'b', 'protag_m_base.png'),
    'gen_base_f.png': os.path.join(RES, 'protagonist', 'b', 'protag_f_base.png'),
    'gen_lh_m.png': os.path.join(RES, 'realm', 'protag_m_lianhun.png'),
    'gen_lh_f.png': os.path.join(RES, 'realm', 'protag_f_lianhun.png'),
}


def bbox(im):
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 24)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def main():
    src_dir = sys.argv[1]
    os.makedirs(BACKUP, exist_ok=True)
    for name, dst in MAP.items():
        src = os.path.join(src_dir, name)
        if not os.path.exists(src):
            print('skip', name)
            continue
        bak = os.path.join(BACKUP, os.path.basename(dst))
        if not os.path.exists(bak):
            shutil.copyfile(dst, bak)
        old = Image.open(bak).convert('RGBA')
        new = Image.open(src).convert('RGBA')
        # Codex 偶尔给的“透明”底是近白 / 棋盘格:四角不透明就报错,不入库
        corners = [new.getpixel(p)[3] for p in [(0, 0), (new.width - 1, 0), (0, new.height - 1), (new.width - 1, new.height - 1)]]
        if max(corners) > 10:
            raise SystemExit(f'{name} 背景不透明(四角 alpha {corners}),重出')
        ox0, oy0, ox1, oy1 = bbox(old)
        nx0, ny0, nx1, ny1 = bbox(new)
        crop = new.crop((nx0, ny0, nx1, ny1))
        scale = (oy1 - oy0) / crop.height
        w = max(1, round(crop.width * scale))
        h = oy1 - oy0
        crop = crop.resize((w, h), Image.LANCZOS)
        canvas = Image.new('RGBA', old.size, (0, 0, 0, 0))
        cx = (ox0 + ox1) / 2
        x = int(round(cx - w / 2))
        x = max(0, min(old.width - w, x)) if w <= old.width else (old.width - w) // 2
        canvas.alpha_composite(crop, (x, oy0)) if x >= 0 else canvas.paste(crop, (x, oy0), crop)
        canvas.save(dst)
        print('installed', os.path.relpath(dst, ROOT), old.size, 'bbox', (ox0, oy0, ox1, oy1), '<-', name, 'scale', round(scale, 3))


if __name__ == '__main__':
    main()
