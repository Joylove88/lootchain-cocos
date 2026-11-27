# -*- coding: utf-8 -*-
"""主角骨骼换底(2026-11-26 用户:「主角的骨骼动画好奇怪」→ 选「C Lucius 男女共用」):
失落之剑 Lucius(Meowa 上传转 4.2、去掉大招巨龙)→ Meowa 整副换皮成主角外观 → 这里装进游戏。

  python tools/qa/protag_lucius_install.py <换皮包目录> <资源名>      # 资源名 = protag_m / protag_m_lh / protag_f / protag_f_lh
换皮包目录里是 char.json / char.atlas / 贴图(Meowa 下载解开、改名后的样子)。做的事:
- 动画改成游戏的 SSR/UR 命名:Idle→idle、Run→run、Attack_1/2/3→atk/atk2/atk3、Skill→skill2、Pain→hit、Die→dead、Stun→stun;
  另复制 skill1 = Attack_3(重斩)、skill3 = Attack_2(旋风斩);去掉 Run_old
- 巨龙部件的图集区域清成透明(大招已删,贴图只是占地方)
- 图集页名改成 <资源名>.png、pma:false
- 旧文件先备份到 素材原始备份/protag-ishmael-20261126/<资源名>/(只备份一次,不覆盖)
"""
import copy
import json
import os
import re
import shutil
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BACKUP = os.path.join(ROOT, '素材原始备份', 'protag-ishmael-20261126')

RENAME = {'Idle': 'idle', 'Run': 'run', 'Attack_1': 'atk', 'Attack_2': 'atk2', 'Attack_3': 'atk3', 'Skill': 'skill2',
          'Pain': 'hit', 'Die': 'dead', 'Stun': 'stun'}
COPIES = {'skill1': 'Attack_3', 'skill3': 'Attack_2'}
DROP = {'Run_old'}
# Lucius 静止姿势包围盒(render_char.py setupBounds,11-26 实测)
BOUNDS = (-246.35, -48.77, 373.99, 426.85)


def parse_atlas(lines):
    regs, name = [], None
    for i, line in enumerate(lines):
        s = line.strip()
        if s and ':' not in s and not s.endswith('.png'):
            name = s
            regs.append({'name': name})
        elif name and s.startswith('bounds:'):
            regs[-1]['bounds'] = list(map(int, s.split(':', 1)[1].split(',')))
        elif name and s.startswith('rotate:'):
            regs[-1]['rotate'] = s.split(':', 1)[1].strip()
    return regs


def main():
    src, asset = sys.argv[1], sys.argv[2]
    dst = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero', asset)
    bak = os.path.join(BACKUP, asset)
    if os.path.isdir(dst) and not os.path.isdir(bak):
        os.makedirs(bak)
        for n in os.listdir(dst):
            if not n.endswith('.meta'):
                shutil.copy2(os.path.join(dst, n), os.path.join(bak, n))
        print('backup ->', bak)
    d = json.load(open(os.path.join(src, 'char.json'), encoding='utf-8'))
    anims = d['animations']
    out = {}
    for new, old in COPIES.items():
        out[new] = copy.deepcopy(anims[old])
    for old, a in anims.items():
        if old in DROP:
            continue
        out[RENAME.get(old, old)] = a
    d['animations'] = out
    d['skeleton']['images'] = './'
    # 游戏按 skeleton.x/y/width/height 定体型 / 站位;Meowa 导出不带,用 fxprev/render_char.py 打印的 setupBounds 补(同一副骨骼同值)
    x, y, w, h = BOUNDS
    d['skeleton'].update({'x': x, 'y': y, 'width': w, 'height': h})
    os.makedirs(dst, exist_ok=True)
    json.dump(d, open(os.path.join(dst, f'{asset}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    lines = open(os.path.join(src, 'char.atlas'), encoding='utf-8').read().splitlines()
    page = next(l.strip() for l in lines if l.strip().endswith('.png'))
    im = Image.open(os.path.join(src, page)).convert('RGBA')
    for r in parse_atlas(lines):
        if re.match(r'0[89]Dragon', r['name']) and 'bounds' in r:
            x, y, w, h = r['bounds']
            if r.get('rotate') in ('90', 'true', '270'):
                w, h = h, w
            im.paste((0, 0, 0, 0), (x, y, x + w, y + h))
    # 11-27:贴图补齐到 2 的幂(1985×808 → 2048×1024,内容贴左上、区域坐标不变),否则引擎不生成 mipmap,
    # 野外缩小 2.4 倍显示时锯齿 + 细节糊成一片(实测 mip 偏置无效 = 没有 mip)
    pw, ph = 1 << (im.width - 1).bit_length(), 1 << (im.height - 1).bit_length()
    if (pw, ph) != im.size:
        canvas = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
        canvas.paste(im, (0, 0))
        im = canvas
    im.save(os.path.join(dst, f'{asset}.png'), optimize=True)
    text = []
    for l in lines:
        s = l.strip()
        if s == page:
            l = f'{asset}.png'
        elif s.startswith('pma:'):
            l = 'pma:false'
        elif s.startswith('size:'):
            l = f'size:{im.width},{im.height}'
        text.append(l)
    open(os.path.join(dst, f'{asset}.atlas'), 'w', encoding='utf-8', newline='\n').write('\n'.join(text) + '\n')
    print(asset, 'anims', sorted(out), 'png', im.size)


if __name__ == '__main__':
    main()
