# -*- coding: utf-8 -*-
"""矿境面板素材入库(docs/48 / 49 原型 1:1 还原,2026-10-26):Codex 出图 → 裁切 / 抠黑底 / 缩放 → assets/resources/ui/raid/ + meta(sprite-frame,trim none)。
输入(周报截图/2026-10-26_真人矿/proto/assets/):
  a_mine_card.png   900×1000  → pvp_mine_card.png(720×800)
  b_npc_map.png     1600×900  → npc_map_bg.png(1200×675)
  c_mine_nodes.png  1200×600  两个圆形矿口(黑底)→ mine_node_on / mine_node_off(512×512,圆形 alpha)
  d_zone_thumbs.png 1800×300  六格 → zone_thumb_1..6(256×256)
  e_report_icons.png 800×400  剑 / 盾(黑底)→ ic_report_attack / ic_report_defend(192×192,亮度抠透明)
用法:python tools/qa/raid_install_assets.py [--only a,b,c,d,e]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-10-26_真人矿', 'proto', 'assets')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'raid')
os.makedirs(DST, exist_ok=True)


def save(name, im):
    path = os.path.join(DST, name + '.png')
    im.save(path, optimize=True)
    write_meta(path, name, im.width, im.height)
    print('installed', name, im.size)


def circle_alpha(im, size):
    im = im.convert('RGBA').resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, size - 3, size - 3), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(mask)
    return im


def luminance_alpha(im, size):
    """黑底图标:alpha = 亮度(加一点对比),颜色保留。"""
    im = im.convert('RGB').resize((size, size), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32)
    lum = arr.max(axis=2)
    alpha = np.clip((lum - 18) / (140 - 18), 0, 1) ** 0.8 * 255
    rgba = np.dstack([arr, alpha]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def largest_bbox(im, thresh=28):
    arr = np.asarray(im.convert('L'))
    ys, xs = np.where(arr > thresh)
    if len(xs) == 0:
        return (0, 0, im.width, im.height)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def main():
    only = None
    if '--only' in sys.argv:
        only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    want = lambda key: only is None or key in only  # noqa: E731

    if want('a') and os.path.exists(os.path.join(SRC, 'a_mine_card.png')):
        im = Image.open(os.path.join(SRC, 'a_mine_card.png')).convert('RGB')
        save('pvp_mine_card', im.resize((720, 800), Image.LANCZOS))
    # v2(2026-10-26 用户「UI 和原型不一样」):整卡插画(矿晶 + 亮矿洞,铺满卡片)替换 a;全屏矿洞底图
    if want('f') and os.path.exists(os.path.join(SRC, 'f_mine_card_full.png')):
        im = Image.open(os.path.join(SRC, 'f_mine_card_full.png')).convert('RGB')
        save('pvp_mine_card', im.resize((600, round(600 * im.height / im.width)), Image.LANCZOS))
    if want('g') and os.path.exists(os.path.join(SRC, 'g_backdrop.png')):
        im = Image.open(os.path.join(SRC, 'g_backdrop.png')).convert('RGB')
        save('raid_backdrop', im.resize((1600, round(1600 * im.height / im.width)), Image.LANCZOS))
    if want('b') and os.path.exists(os.path.join(SRC, 'b_npc_map.png')):
        im = Image.open(os.path.join(SRC, 'b_npc_map.png')).convert('RGB')
        save('npc_map_bg', im.resize((1200, 675), Image.LANCZOS))
    if want('c') and os.path.exists(os.path.join(SRC, 'c_mine_nodes.png')):
        im = Image.open(os.path.join(SRC, 'c_mine_nodes.png')).convert('RGB')
        half = im.width // 2
        for name, part in (('mine_node_on', im.crop((0, 0, half, im.height))), ('mine_node_off', im.crop((half, 0, im.width, im.height)))):
            x0, y0, x1, y1 = largest_bbox(part)
            side = max(x1 - x0, y1 - y0)
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            box = (max(0, cx - side // 2), max(0, cy - side // 2), min(part.width, cx + side // 2), min(part.height, cy + side // 2))
            save(name, circle_alpha(part.crop(box), 512))
    if want('d') and os.path.exists(os.path.join(SRC, 'd_zone_thumbs.png')):
        im = Image.open(os.path.join(SRC, 'd_zone_thumbs.png')).convert('RGB')
        cell = im.width // 6
        for i in range(6):
            save(f'zone_thumb_{i + 1}', im.crop((i * cell, 0, (i + 1) * cell, im.height)).resize((256, 256), Image.LANCZOS))
    if want('e') and os.path.exists(os.path.join(SRC, 'e_report_icons.png')):
        im = Image.open(os.path.join(SRC, 'e_report_icons.png')).convert('RGB')
        half = im.width // 2
        for name, part in (('ic_report_attack', im.crop((0, 0, half, im.height))), ('ic_report_defend', im.crop((half, 0, im.width, im.height)))):
            x0, y0, x1, y1 = largest_bbox(part, 40)
            side = max(x1 - x0, y1 - y0) + 16
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            box = (max(0, cx - side // 2), max(0, cy - side // 2), min(part.width, cx + side // 2), min(part.height, cy + side // 2))
            save(name, luminance_alpha(part.crop(box), 192))


if __name__ == '__main__':
    main()
