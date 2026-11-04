# -*- coding: utf-8 -*-
"""境界突破界面小图标(docs/60 §12):从用户确认的原型里直接抠金色线图标(原型 1870×841 实测框),按红通道出透明度,
统一填哑光金,裁到内容 + 等边留白,出 assets/resources/ui/realm/icon_<名>.png(+ sprite-frame meta)。
用法:python tools/qa/realm_icons_extract.py
"""
import os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PROTO = os.path.join(ROOT, '周报截图', '2026-11-04_境界突破', 'proto')
OUT = os.path.join(ROOT, 'assets', 'resources', 'ui', 'realm')
GOLD = (226, 192, 130)
# 名 → (原型文件, 框 x0 y0 x1 y1)
ICONS = {
    'cond_level': ('realm_break_lianhun_b.png', (1034, 234, 1078, 278)),
    'cond_story': ('realm_break_lianhun_b.png', (1034, 273, 1078, 317)),
    'trial_mirror': ('realm_break_lianhun_b.png', (1056, 376, 1144, 462)),
    'rw_outfit': ('realm_break_lianhun_b.png', (1058, 526, 1126, 590)),
    'rw_stats': ('realm_break_lianhun_b.png', (1192, 526, 1260, 590)),
    'rw_ult': ('realm_break_lianhun_b.png', (1324, 526, 1392, 590)),
    'rw_memory': ('realm_break_lianhun_b.png', (1456, 526, 1524, 590)),
    'rw_evo': ('realm_break_lianhun_b.png', (1584, 526, 1652, 590)),
    'done_stats': ('realm_break_done_b.png', (1026, 210, 1074, 256)),
}


def extract(name, src, box):
    im = np.asarray(Image.open(os.path.join(PROTO, src)).convert('RGB').crop(box)).astype(np.float32)
    r = im[..., 0]
    alpha = np.clip((r - 78.0) / (220.0 - 78.0), 0, 1)
    ys, xs = np.where(alpha > 0.12)
    if len(xs) == 0:
        raise SystemExit(f'{name}: 框里没有图标')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    a = alpha[y0:y1, x0:x1]
    side = int(max(a.shape) * 1.12) + 2
    canvas = np.zeros((side, side), np.float32)
    oy = (side - a.shape[0]) // 2
    ox = (side - a.shape[1]) // 2
    canvas[oy:oy + a.shape[0], ox:ox + a.shape[1]] = a
    rgba = np.zeros((side, side, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = GOLD
    rgba[..., 3] = np.round(canvas * 255).astype(np.uint8)
    # 放大到 128 好看清(原型里约 40~60px)
    img = Image.fromarray(rgba, 'RGBA').resize((128, 128), Image.LANCZOS)
    path = os.path.join(OUT, f'icon_{name}.png')
    img.save(path, optimize=True)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    paths = [extract(name, src, box) for name, (src, box) in ICONS.items()]
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), *paths], check=True)
    sheet = Image.new('RGBA', (140 * len(paths), 140), (20, 24, 32, 255))
    for i, p in enumerate(paths):
        sheet.alpha_composite(Image.open(p), (i * 140 + 6, 6))
    sheet.save(os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'realm_icons_sheet.png'))
    print('ok', len(paths))


if __name__ == '__main__':
    main()
