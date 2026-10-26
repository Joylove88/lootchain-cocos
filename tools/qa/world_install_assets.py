# -*- coding: utf-8 -*-
"""docs/50 新手村 / 野区 / 世界地图素材入库:Codex 出图(周报截图/2026-10-26_新手村野区/assets_src/)→ 抠底 / 缩放 →
assets/resources/ui/world/ + meta(sprite-frame,trim none,imported:false 让命令行构建导入)。
- 建筑 / 物件(vil_* / fld_* / waypoint / city_board):浅灰平底洪水填充抠透明,最长边 1024(小件 512);
- NPC 站立(npc_*):抠透明,高 512;对话立绘 portrait_*:抠透明,高 1024;
- 地面 ground_*:整张缩到 1024(生成时要求四边无缝,直接平铺);
- 世界地图 map_world*:等比缩到 2400 宽;
- 横版战斗背景 battle_*:同掠夺背景做法 → 2048×1152(上下镜像补带),落 ui/battle/battle_scene_field_<名>;
- 悬赏令纸 ui_bounty_paper:深灰底抠透明,高 768。
用法:python tools/qa/world_install_assets.py [名字...](不写 = 全部)
"""
import io
import json
import os
import sys

from PIL import Image, ImageFilter, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import cutout, write_meta  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-10-26_新手村野区', 'assets_src')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world')
BATTLE_DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle')
SMALL = {'vil_well', 'vil_fence', 'fld_forest_stump', 'fld_rocks', 'fld_dead_tree', 'vil_tree', 'fld_forest_trees', 'waypoint', 'city_board'}


def mark_unimported(path):
    meta_path = path + '.meta'
    m = json.load(io.open(meta_path, encoding='utf-8'))
    m['imported'] = False
    for sub in m.get('subMetas', {}).values():
        sub['imported'] = False
    io.open(meta_path, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')


def fit_height(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def fit_long(im, side):
    k = side / max(im.size)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def battle_bg(im):
    W, H = 2048, 1152
    scaled = im.convert('RGB').resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    h = min(H, scaled.height)
    scaled = scaled.crop((0, (scaled.height - h) // 2, W, (scaled.height - h) // 2 + h))
    pad_top = (H - h) // 2
    pad_bottom = H - h - pad_top
    out = Image.new('RGB', (W, H))
    out.paste(scaled, (0, pad_top))
    if pad_top > 0:
        top = ImageOps.flip(scaled.crop((0, 0, W, pad_top))).filter(ImageFilter.GaussianBlur(1.2))
        out.paste(Image.eval(top, lambda v: int(v * 0.72)), (0, 0))
    if pad_bottom > 0:
        bottom = ImageOps.flip(scaled.crop((0, h - pad_bottom, W, h))).filter(ImageFilter.GaussianBlur(0.8))
        out.paste(bottom, (0, pad_top + h))
    return out


def save(dst_dir, name, im):
    os.makedirs(dst_dir, exist_ok=True)
    path = os.path.join(dst_dir, name + '.png')
    im.save(path, optimize=True)
    write_meta(path, name, im.width, im.height)
    mark_unimported(path)
    return path


def main():
    wanted = set(sys.argv[1:])
    report = {}
    for file in sorted(os.listdir(SRC)):
        if not file.endswith('.png'):
            continue
        name = file[:-4]
        if wanted and name not in wanted:
            continue
        im = Image.open(os.path.join(SRC, file))
        if name.startswith('ground_'):
            out = im.convert('RGB').resize((1024, 1024), Image.LANCZOS)
            save(DST, name, out)
        elif name.startswith('map_world'):
            out = im.convert('RGB').resize((2400, round(im.height * 2400 / im.width)), Image.LANCZOS)
            save(DST, name, out)
        elif name.startswith('battle_'):
            out = battle_bg(im)
            save(BATTLE_DST, 'battle_scene_field_' + name[len('battle_'):], out)
        elif name.startswith('npc_'):
            out = fit_height(cutout(im), 512)
            save(DST, name, out)
        elif name.startswith('portrait_'):
            out = fit_height(cutout(im), 1024)
            save(DST, name, out)
        elif name == 'ui_bounty_paper':
            out = fit_height(cutout(im), 768)
            save(DST, name, out)
        else:
            out = fit_long(cutout(im), 512 if name in SMALL else 1024)
            save(DST, name, out)
        report[name] = out.size
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
