# -*- coding: utf-8 -*-
"""村外林地 v3 素材入库(2026-10-29):周报截图/2026-10-29_新手村设计/woods_src/w3_*.png → assets/resources/ui/world/woods3/。
处理与晨风村 v3 相同(village3_install_assets):抠图 + 接触阴影转半透明 + 贴地件羽化;底纹做无缝存 ground_woods3。
用法:python tools/qa/woods_install_assets.py [名字...](不写 = 全部)
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import cutout, write_meta  # noqa: E402
from village2_install_assets import feather, punch_holes  # noqa: E402
from village3_install_assets import plate_of, seamless, shadowize, warm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-10-29_新手村设计', 'woods_src')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'woods3')
GROUND_DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world')
BIG = {'cliff_falls', 'river_a', 'river_c', 'camp_plaza', 'ruins_floor', 'spider_den', 'bear_den', 'ancient_tree'}
SMALL = {'camp_banner', 'camp_crates', 'campfire', 'ruin_pillar', 'crystal_pillar', 'rock_small', 'stump', 'chest', 'bones'}
TINY = {'fern', 'mushrooms'}
FLAT = {'cliff_falls': 26, 'river_a': 24, 'river_b': 22, 'river_c': 24, 'cliff_ne': 22, 'camp_plaza': 22, 'ruins_floor': 26,
        'bridge': 6, 'decal_leaves': 40, 'decal_moss': 36, 'decal_roots': 36}
HOLES = {'camp_palisade', 'hunter_rack', 'bridge', 'ruin_arch', 'ruin_wall', 'bones', 'spider_den'}


def main(names: set) -> None:
    os.makedirs(DST, exist_ok=True)
    for fn in sorted(os.listdir(SRC)):
        if not (fn.startswith('w3_') and fn.endswith('.png')):
            continue
        name = fn[3:-4]
        if names and name not in names:
            continue
        src = Image.open(os.path.join(SRC, fn))
        if name == 'ground':
            # 林地底纹:比草甸暗,只轻提一点亮度
            im = warm(seamless(src).resize((1024, 1024), Image.LANCZOS))
            path = os.path.join(GROUND_DST, 'ground_woods3.png')
            im.save(path)
            write_meta(path, 'ground_woods3', im.width, im.height)
            print('wrote ground_woods3', im.size)
            continue
        im = cutout(src)
        if name not in FLAT:
            im = shadowize(im, plate_of(src))
        if name in HOLES:
            im = punch_holes(im)
        side = 1536 if name in BIG else 256 if name in TINY else 512 if name in SMALL else 1024
        k = side / max(im.size)
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        if name in FLAT:
            im = feather(im.convert('RGBA'), FLAT[name])
        path = os.path.join(DST, f'w3_{name}.png')
        im.save(path)
        write_meta(path, f'w3_{name}', im.width, im.height)
        print('wrote', name, im.size)


if __name__ == '__main__':
    main(set(sys.argv[1:]))
