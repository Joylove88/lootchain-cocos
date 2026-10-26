# -*- coding: utf-8 -*-
"""矿境面板素材入库(docs/48 / 49 原型 1:1 还原,2026-10-26):Codex 出图 → 裁切 / 抠黑底 / 缩放 → assets/resources/ui/raid/ + meta(sprite-frame,trim none)。
输入(周报截图/2026-10-26_真人矿/proto/assets/):
  a_mine_card.png   900×1000  → pvp_mine_card.png(720×800)
  b_npc_map.png     1600×900  → npc_map_bg.png(1200×675)
  c_mine_nodes.png  1200×600  两个圆形矿口(黑底)→ mine_node_on / mine_node_off(512×512,圆形 alpha)
  d_zone_thumbs.png 1800×300  六格 → zone_thumb_1..6(256×256)
  e_report_icons.png 800×400  剑 / 盾(黑底)→ ic_report_attack / ic_report_defend(192×192,亮度抠透明)
  h/i/j/k_btn_*.png  分级按钮(黑底)→ btn_primary / btn_secondary / btn_small / btn_disabled(高 120,外部黑底抠透明 + 九宫格边距)
  l_back_banner.png  「<」返回横幅(黑底)→ back_banner(高 140,外部黑底抠透明)
  m_icon_crystal.png 矿晶货币图标(黑底)→ ui/bag/ai/icon_sacred_crystal(160×160,外部黑底抠透明,居中留 4px 边)
用法:python tools/qa/raid_install_assets.py [--only a,b,c,d,e]
"""
import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402

NL = chr(10)
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


def outside_alpha(im, thresh=40, core=None):
    """黑底按钮:只把和四角连通的暗像素当背景(按钮内部的暗红不受影响),边缘 1px 柔化。"""
    rgb = im.convert('RGB')
    arr = np.asarray(rgb)
    dark = Image.fromarray(np.where(arr.max(axis=2) < thresh, 255, 0).astype(np.uint8), 'L').copy()
    for corner in ((0, 0), (dark.width - 1, 0), (0, dark.height - 1), (dark.width - 1, dark.height - 1)):
        if dark.getpixel(corner) == 255:
            ImageDraw.floodfill(dark, corner, 128)
    outside = np.asarray(dark) == 128
    if core:
        # 雕花框内芯的暗红会经框缝和外部黑底连通:内芯矩形(相对亮区包围盒)强制不透明
        bx0, by0, bx1, by1 = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8), 'L').getbbox()
        bw, bh = bx1 - bx0, by1 - by0
        outside = outside.copy()
        outside[round(by0 + bh * core[1]):round(by0 + bh * core[3]), round(bx0 + bw * core[0]):round(bx0 + bw * core[2])] = False
    alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(0.8))
    out = rgb.copy()
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    return out.crop(box)


# 九宫格边距(按归一后 120 高的像素):左右 = 端头雕花内沿,上下 = 金边厚度
BUTTON_SLICES = {
    'btn_primary': (70, 30),
    'btn_secondary': (64, 26),
    'btn_small': (52, 30),
    'btn_disabled': (64, 26),
}


def write_slice(path, lr, tb):
    import json
    meta_path = path + '.meta'
    m = json.load(io.open(meta_path, encoding='utf-8'))
    sf = m['subMetas']['f9941']['userData']
    sf['borderLeft'] = sf['borderRight'] = lr
    sf['borderTop'] = sf['borderBottom'] = tb
    io.open(meta_path, 'w', encoding='utf-8', newline=NL).write(json.dumps(m, ensure_ascii=False, indent=2) + NL)


def mark_unimported(path):
    import json
    meta_path = path + '.meta'
    m = json.load(io.open(meta_path, encoding='utf-8'))
    m['imported'] = False
    for sub in m.get('subMetas', {}).values():
        sub['imported'] = False
    io.open(meta_path, 'w', encoding='utf-8', newline=NL).write(json.dumps(m, ensure_ascii=False, indent=2) + NL)


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
    # v3(2026-10-26 用户「按钮全是一样的,应该根据主次做不同的按钮」+「返回横幅带 <」)
    for key, src, name, height in (('h', 'h_btn_primary', 'btn_primary', 120), ('i', 'i_btn_secondary', 'btn_secondary', 120),
                                   ('j', 'j_btn_small', 'btn_small', 120), ('k', 'k_btn_disabled', 'btn_disabled', 120),
                                   ('l', 'l_back_banner', 'back_banner', 140)):
        src_path = os.path.join(SRC, src + '.png')
        if not want(key) or not os.path.exists(src_path):
            continue
        im = outside_alpha(Image.open(src_path), core=(0.07, 0.2, 0.9, 0.82) if key == 'l' else None)
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
        save(name, im)
        path = os.path.join(DST, name + '.png')
        if name in BUTTON_SLICES:
            write_slice(path, *BUTTON_SLICES[name])
        mark_unimported(path)
    # 矿晶正式图标(2026-10-26 用户「矿晶图标跟钻石很像」):原先借用召唤钻石图 ic_diamond_gem
    src_path = os.path.join(SRC, 'm_icon_crystal.png')
    if want('m') and os.path.exists(src_path):
        im = outside_alpha(Image.open(src_path), thresh=30)
        # 外缘零星火星会把包围盒撑大:按亮区(alpha>200 的连片主体)重算包围盒
        a = np.asarray(im.getchannel('A'))
        rows = np.where((a > 200).sum(axis=1) > a.shape[1] * 0.04)[0]
        cols = np.where((a > 200).sum(axis=0) > a.shape[0] * 0.04)[0]
        im = im.crop((cols.min(), rows.min(), cols.max() + 1, rows.max() + 1))
        side = 152
        k = side / max(im.width, im.height)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        canvas = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((160 - im.width) // 2, (160 - im.height) // 2))
        dst = os.path.join(ROOT, 'assets', 'resources', 'ui', 'bag', 'ai', 'icon_sacred_crystal.png')
        canvas.save(dst, optimize=True)
        write_meta(dst, 'icon_sacred_crystal', 160, 160)
        mark_unimported(dst)
        print('installed icon_sacred_crystal', canvas.size)


if __name__ == '__main__':
    main()
