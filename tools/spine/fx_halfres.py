# -*- coding: utf-8 -*-
"""把已入库的骨骼特效贴图等比降到一半分辨率(atlas 坐标同步 ×0.5),骨骼几何不变、上屏尺寸不变。

适用:多页大图集、战场上只按 0.3~0.5 倍显示的特效(贴图像素本来就被缩小采样,半分辨率肉眼无差),
如 v2_s681_6030(4 页 2048² ≈ 12.4MB → 4 页 1024²)。只改入库副本,不动 fx_pack_v2 原始素材。
缩放前先预乘 alpha、缩放后还原,避免透明边缘发黑;atlas 支持 3.x 缩进格式(xy/size/orig/offset)与 4.x(bounds/offsets)。
用法:python tools/spine/fx_halfres.py assets/resources/spine/effect/<code>
"""
import io, math, os, re, sys

import numpy as np
from PIL import Image


def scale_atlas(text: str) -> str:
    out = []
    lines = text.splitlines()
    for line in lines:
        stripped = line.strip()
        indented = line[:1] in (' ', '\t')
        m = re.match(r'^(\s*)(xy|size|orig|offset|bounds|offsets):\s*(.+)$', line)
        if not m:
            out.append(line)
            continue
        pad, key, vals = m.group(1), m.group(2), [int(v.strip()) for v in m.group(3).split(',')]
        if key == 'size' and not indented:
            # 页尺寸
            vals = [max(1, v // 2) for v in vals]
        elif key == 'bounds':
            x0, y0 = vals[0] // 2, vals[1] // 2
            x1, y1 = math.ceil((vals[0] + vals[2]) / 2), math.ceil((vals[1] + vals[3]) / 2)
            vals = [x0, y0, x1 - x0, y1 - y0]
        elif key == 'xy':
            vals = [v // 2 for v in vals]
        elif key == 'size':
            # 区域尺寸:与 xy 的向下取整配合,保证右下边界不缩
            vals = [math.ceil(v / 2) for v in vals]
        else:
            vals = [int(round(v / 2)) for v in vals]
        out.append(f"{pad}{key}: {', '.join(str(v) for v in vals)}" if key in ('xy', 'size', 'orig', 'offset') and indented else f"{pad}{key}: {','.join(str(v) for v in vals)}")
    return '\n'.join(out) + '\n'


def half_png(path: str) -> None:
    img = Image.open(path).convert('RGBA')
    arr = np.asarray(img).astype(np.float32) / 255.0
    alpha = arr[..., 3:4]
    premul = np.concatenate([arr[..., :3] * alpha, alpha], axis=-1)
    w, h = img.size
    small = Image.fromarray((premul * 255.0 + 0.5).clip(0, 255).astype(np.uint8), 'RGBA').resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS)
    sarr = np.asarray(small).astype(np.float32) / 255.0
    a = sarr[..., 3:4]
    rgb = np.where(a > 1e-4, sarr[..., :3] / np.maximum(a, 1e-4), 0.0)
    final = np.concatenate([rgb.clip(0, 1), a], axis=-1)
    Image.fromarray((final * 255.0 + 0.5).astype(np.uint8), 'RGBA').save(path, optimize=True)


def main() -> None:
    folder = sys.argv[1]
    code = os.path.basename(os.path.normpath(folder))
    atlas_path = os.path.join(folder, f'{code}.atlas')
    text = io.open(atlas_path, encoding='utf-8').read()
    pages = [l.strip() for l in text.splitlines() if l.strip().lower().endswith('.png') and ':' not in l]
    io.open(atlas_path, 'w', encoding='utf-8', newline='\n').write(scale_atlas(text))
    for page in pages:
        p = os.path.join(folder, page)
        before = os.path.getsize(p)
        half_png(p)
        print(f'{page}: {before / 1024:.0f}KB -> {os.path.getsize(p) / 1024:.0f}KB')


if __name__ == '__main__':
    main()
