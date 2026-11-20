# -*- coding: utf-8 -*-
"""野外地面材质「降噪留白」(2026-11-20 野外画质看齐守卫战,方案 ①):

守卫战耐看的一大原因是地面大片安静、细节只在四周;野外地面平铺材质满屏碎草叶 / 碎石 / 落叶,高频细节量是守卫战的 2~3 倍。
这里离线把每张平铺材质的高频细节收到 detail 倍(out = 模糊 + (原图 − 模糊) × detail),低频的明暗 / 色块不动;
模糊按「世界单位」算(约 5 个世界单位 ≈ 手机上 5 个屏幕像素),换算到各材质自己的贴图像素;模糊时四周按平铺环绕,输出仍然无缝。
运行时零开销(不多采样)。原图备份在 素材原始备份/field-tex-calm-20261120/,每次都从备份重算(可反复调 detail)。

  python tools/qa/field_tex_calm.py            # 全部
  python tools/qa/field_tex_calm.py WOODS GRAY # 只做某几张图
  python tools/qa/field_tex_calm.py --restore  # 全部还原成原图
"""
import os
import shutil
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORLD = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world')
BACKUP = os.path.join(ROOT, '素材原始备份', 'field-tex-calm-20261120')
BLUR_UNITS = 5.0

# 地图 → [(贴图相对 ui/world 的路径, 一格世界单位, detail)];tiles 与 LobbyWorldMaps 里 groundSplat.tiles / groundTile 一致
MAPS = {
    'WOODS': [('woods4/tex_forest_floor.jpg', 720, 0.5), ('ground_woods3.png', 1400, 0.5), ('woods4/tex_meadow.jpg', 560, 0.5),
              ('woods4/tex_dirt_path.jpg', 640, 0.55), ('woods4/tex_leaf_litter.jpg', 380, 0.5)],
    'GRAY': [('gray4/tex_earth.jpg', 720, 0.42), ('gray4/tex_gravel.jpg', 1300, 0.42), ('gray4/tex_drygrass.jpg', 560, 0.45),
             ('gray4/tex_track.jpg', 640, 0.5), ('gray4/tex_scree.jpg', 520, 0.42)],
    'DEADWOOD': [('dead4/tex_mud.jpg', 720, 0.45), ('dead4/tex_moss.jpg', 1300, 0.45), ('dead4/tex_deadgrass.jpg', 560, 0.45),
                 ('dead4/tex_track.jpg', 640, 0.5), ('dead4/tex_leaves.jpg', 520, 0.45)],
    'VILLAGE': [('ground_village3.png', 1000, 0.62)],
}


def calm(src: Image.Image, tile: float, detail: float) -> Image.Image:
    w, h = src.size
    r = BLUR_UNITS * w / tile
    pad = int(r * 3) + 2
    # 平铺环绕:3×3 拼起来模糊,取中间一块,边缘无缝
    big = Image.new('RGB', (w + pad * 2, h + pad * 2))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            big.paste(src, (pad + dx * w, pad + dy * h))
    low = big.filter(ImageFilter.GaussianBlur(r)).crop((pad, pad, pad + w, pad + h))
    # out = low + (src - low) * detail = blend(low, src, detail)
    return Image.blend(low, src, detail)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    restore = '--restore' in sys.argv
    for code, items in MAPS.items():
        if args and code not in args:
            continue
        for rel, tile, detail in items:
            path = os.path.join(WORLD, rel)
            bak = os.path.join(BACKUP, rel)
            if not os.path.exists(bak):
                os.makedirs(os.path.dirname(bak), exist_ok=True)
                shutil.copy2(path, bak)
            if restore:
                shutil.copy2(bak, path)
                print('restored', rel)
                continue
            src = Image.open(bak).convert('RGB')
            out = calm(src, tile, detail)
            out.save(path, quality=93, subsampling=0) if path.endswith('.jpg') else out.save(path, optimize=True)
            print(code, rel, src.size, 'detail', detail, 'blur px', round(BLUR_UNITS * src.size[0] / tile, 1))


if __name__ == '__main__':
    main()
