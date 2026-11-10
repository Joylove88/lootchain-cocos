# -*- coding: utf-8 -*-
"""主城高低差素材入库(city_terrace_gen.py 产物 → ui/world/city4/):
  city4_terrace_wall.png         挡土墙一段(抠图、左右两端各切掉 CUT 比例保证直切可串接)
  city4_terrace_stairs.png       台阶(贴地件,人走在上面)
  city4_terrace_stairs_grand.png 大台阶(大道)
  city4_terrace_shade.png        墙脚接地暗带(程序生成,贴地件,上深下浅)
原图备份到 素材原始备份/city-terrace-20261110/。
用法:python tools/qa/city_terrace_install.py
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tree_hq_install import prepare  # noqa: E402
from world_tex_fit import resize_premul  # noqa: E402
import woods_ground_install as WG  # noqa: E402
from city_terrace_gen import OUT, ROOT  # noqa: E402

DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
BACKUP = os.path.join(ROOT, '素材原始备份', 'city-terrace-20261110')
CUT = 0.03
GRAND_TOP = 0.415
WALL_CUTS = {'b': 824, 'c': 547, 'd': 272}   # 与 city_plan_v2.TERRACE_PIECES 对应
WIDTH = {'terrace_wall': 1024, 'terrace_stairs': 768, 'terrace_stairs_grand': 1024}


def meta(name, w, h):
    m = WG.meta_for(name, '.png', w, h, False, True)
    m['userData']['hasAlpha'] = True
    m['userData']['fixAlphaTransparencyArtifacts'] = True
    for sm in m['subMetas'].values():
        if sm.get('importer') == 'sprite-frame':
            sm['userData']['trimType'] = 'none'
    return m


def save(name, im):
    dst = os.path.join(DST, f'city4_{name}.png')
    im.save(dst, optimize=True)
    WG.write_meta(dst, meta(f'city4_{name}', im.width, im.height))
    print('installed', dst, im.size)


def install(name):
    src = os.path.join(OUT, name + '.png')
    if not os.path.exists(src):
        print('missing', src)
        return
    os.makedirs(BACKUP, exist_ok=True)
    shutil.copy2(src, os.path.join(BACKUP, name + '.png'))
    if name == 'terrace_stairs_grand':
        # 生成的是两跑 20 多级(爬升远超台地只高一层)→ 只取下半跑:从中间平台往下,平台正好接到台地面
        tmp = os.path.join(OUT, '_grand_lower.png')
        im = Image.open(src).convert('RGB')
        im.crop((0, round(im.height * GRAND_TOP), im.width, im.height)).save(tmp)
        src = tmp
    rgba = prepare(src, 'magenta_strict')
    if name == 'terrace_wall':
        # 直切串接:两端各切掉一截(生图端头常有收边 / 抠图毛边),再把每列 alpha 底边对齐成同一条站地线
        c = round(rgba.width * CUT)
        rgba = rgba.crop((c, 0, rgba.width - c, rgba.height))
    w = WIDTH[name]
    if rgba.width > w:
        rgba = resize_premul(rgba, w, round(rgba.height * w / rgba.width))
    save(name, rgba)
    if name == 'terrace_wall':
        # 11-11 短段:在立柱(1024 宽里中心 237 / 512 / 789,柱宽约 60)右侧切开 → 拼跨时全城墙段同一比例、高度一致
        for suffix, cut in WALL_CUTS.items():
            save(f'terrace_wall_{suffix}', rgba.crop((0, 0, cut, rgba.height)))


def contact_strip():
    """通用墙脚接地暗带(ui/world/fx/contact_strip,渲染层 aoStrip 用):256×48,上沿最深往下渐隐,两端渐隐。"""
    w, h = 256, 48
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(-1, 1, w)[None, :]
    a = np.clip(1 - y, 0, 1) ** 1.6 * np.clip((1 - np.abs(x)) * 5, 0, 1)
    a[:6] *= np.linspace(0.55, 1, 6)[:, None]
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = (14, 12, 10)
    rgba[..., 3] = (a * 215).round().astype(np.uint8)
    dst = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'fx', 'contact_strip.png')
    Image.fromarray(rgba, 'RGBA').save(dst, optimize=True)
    WG.write_meta(dst, meta('contact_strip', w, h))
    print('installed', dst)


def shade():
    """墙脚暗带:512×44,上沿(贴墙脚)最深,往下渐隐;左右两端也渐隐(串段时互相盖住)。"""
    w, h = 512, 44
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(-1, 1, w)[None, :]
    a = (1 - y) ** 1.8 * np.clip((1 - np.abs(x)) * 6, 0, 1)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = (18, 14, 10)
    rgba[..., 3] = (a * 200).round().astype(np.uint8)
    save('terrace_shade', Image.fromarray(rgba, 'RGBA'))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    for n in WIDTH:
        install(n)
    shade()
    contact_strip()
