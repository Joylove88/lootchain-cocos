# -*- coding: utf-8 -*-
"""主城植被压色(11-10 用户实机「看起来好别扭」):树 / 灌木 / 绿篱是高饱和黄绿,
跟哑光暖灰的精致风建筑不搭,像贴上去的。统一降饱和 + 压暗 + 往暖橄榄靠。
原图备份在 素材原始备份/city4-20261110-ground/,每次都从备份重算(可反复调参)。

用法:python tools/qa/city_veg_grade.py
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
BAK = os.path.join(ROOT, '素材原始备份', 'city4-20261110-ground')
NAMES = ['city4_tree_pine', 'city4_tree_oak', 'city4_cypress', 'city4_bush', 'city4_hedge']
SAT = 0.62          # 饱和度保留
GAIN = 0.86         # 整体压暗
TINT = np.array([1.0, 0.97, 0.86], np.float32)  # 暖橄榄(少一点蓝、绿稍收)


def main():
    os.makedirs(BAK, exist_ok=True)
    for n in NAMES:
        bak = os.path.join(BAK, n + '.png')
        if not os.path.exists(bak):
            shutil.copy2(os.path.join(DST, n + '.png'), bak)
        im = np.asarray(Image.open(bak).convert('RGBA')).astype(np.float32) / 255
        rgb, a = im[..., :3], im[..., 3:]
        gray = (rgb * np.array([0.3, 0.59, 0.11], np.float32)).sum(-1, keepdims=True)
        out = (gray + (rgb - gray) * SAT) * GAIN * TINT
        # 高光别全压:亮部回补一点,保留叶片层次
        out = out + np.clip(gray - 0.6, 0, 1) * 0.15
        res = np.concatenate([np.clip(out, 0, 1), a], -1)
        Image.fromarray((res * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(DST, n + '.png'))
        print('ok', n)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
