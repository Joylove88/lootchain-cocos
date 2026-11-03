# -*- coding: utf-8 -*-
"""女主马甲立领内侧挖透明(11-03 用户「头悬浮在衣领口上面」):
GPT 画的 body01 / body02 立领里面是实心深棕,头画在上衣后面时脖子根被这块挡住,下巴停在领口上像浮着。
把领子里面那块深色区域抹成透明(边缘 2px 渐变留一点内阴影),后面的脖子就从领口里露出来,领子边仍盖住脖子根。
区域 = 从领口内一点出发、只走「深色 + 不透明」像素的洪水填充,限制在领子包围盒内,免得漫到皮甲缝线上。
用法:python tools/qa/protag_collar_cut.py <输入 png> <输出 png> [atlas](默认仓库里的 protag_f.atlas)
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ATLAS = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero', 'protag_f', 'protag_f.atlas')
# 正向贴图像素:种子点 + 允许漫延的包围盒 (x0, y0, x1, y1);亮度阈值以下才算领子里面
CUTS = {
    'body01': {'seed': (100, 140), 'box': (68, 104, 142, 178), 'lum': 80},
    'body02': {'seed': (114, 135), 'box': (72, 98, 162, 172), 'lum': 80},
}


def regions(atlas_path):
    lines = open(atlas_path, encoding='utf-8').read().splitlines()
    out, cur = {}, None
    for l in lines[5:]:
        if not l.startswith(' '):
            cur = l.strip()
            out[cur] = {}
        else:
            k, v = l.strip().split(':', 1)
            out[cur][k] = v.strip()
    return out


def flood(dark, seed, box):
    x0, y0, x1, y1 = box
    h, w = dark.shape
    seen = np.zeros_like(dark)
    q = deque([seed])
    seen[seed[1], seed[0]] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if x0 <= nx < x1 and y0 <= ny < y1 and 0 <= nx < w and 0 <= ny < h and dark[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))
    return seen


def main():
    src, dst = sys.argv[1], sys.argv[2]
    atlas = sys.argv[3] if len(sys.argv) > 3 else ATLAS
    reg = regions(atlas)
    im = Image.open(src).convert('RGBA')
    for name, cut in CUTS.items():
        r = reg[name]
        x, y = map(int, r['xy'].split(','))
        w, h = map(int, r['size'].split(','))
        rot = r['rotate'] == 'true'
        crop = im.crop((x, y, x + (h if rot else w), y + (w if rot else h)))
        up = crop.rotate(-90, expand=True) if rot else crop
        arr = np.asarray(up).astype(np.float32)
        lum = arr[..., :3].mean(axis=2)
        dark = (lum < cut['lum']) & (arr[..., 3] > 40)
        inner = flood(dark, cut['seed'], cut['box'])
        if inner.sum() < 50:
            raise SystemExit(f'{name}: 领口内区域太小({int(inner.sum())}),种子 / 阈值不对')
        # 边缘 2px 留半透明内阴影:腐蚀两次,核心全透明,外圈 alpha 110
        core = inner.copy()
        for _ in range(2):
            e = core.copy()
            e[1:] &= core[:-1]
            e[:-1] &= core[1:]
            e[:, 1:] &= core[:, :-1]
            e[:, :-1] &= core[:, 1:]
            core = e
        rim = inner & ~core
        arr[core, 3] = 0
        arr[rim, 3] = np.minimum(arr[rim, 3], 110)
        fixed = Image.fromarray(arr.round().astype(np.uint8), 'RGBA')
        im.paste(fixed.rotate(90, expand=True) if rot else fixed, (x, y))
        print(name, 'cut px', int(inner.sum()))
    im.save(dst, optimize=True)


if __name__ == '__main__':
    main()
