# -*- coding: utf-8 -*-
"""炼魂主角后颈补垫(2026-11-06 用户「主角炼魂境外观,脖子左侧出现透明空白」)。

炼魂版为了把头抬出新肩甲(protag_spine_install.py HEAD_LIFT_SPINE 男 22 / 女 14),脖子根离开了身体贴图的领口,
后颈和肩甲之间露出透明楔形;单把头放低(14 / 18 档)缝仍在 → 在身体之上、肩甲 / 脸之下补一块挂胸骨(chest)的深色衣领垫片:
- 贴图:在图集页里找一块没被任何区域占用的空白,画柔边椭圆(颜色取领口暗部),登记为区域 neckfill;
- 骨骼:新增部件 neckfill(骨 chest),插在 body01 之后;所有动作的 drawOrder 关键帧按「原顺序 + 新部件紧跟 body01」重算偏移,
  其余部件的相对层级逐帧不变。重复运行会先移除旧的 neckfill。
用法:python tools/qa/protag_neck_fill.py <骨骼目录> <base> [--x 78 --y 26 --w 46 --h 30 --rot 0 --color 34,31,33 --test]
--test:垫片画成亮绿,方便在渲染图里看位置。
"""
import argparse, json, os, re
import numpy as np
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('base')
ap.add_argument('--x', type=float, default=78.0)
ap.add_argument('--y', type=float, default=26.0)
ap.add_argument('--w', type=float, default=46.0)
ap.add_argument('--h', type=float, default=30.0)
ap.add_argument('--rot', type=float, default=0.0)
ap.add_argument('--color', default='34,31,33')
ap.add_argument('--after', default='body01')
ap.add_argument('--test', action='store_true')
args = ap.parse_args()

NAME = 'neckfill'
PAD = 64  # 贴图里垫片的像素尺寸(正方形,椭圆柔边;骨骼里按 w / h 拉伸)
png_path = os.path.join(args.dir, args.base + '.png')
atlas_path = os.path.join(args.dir, args.base + '.atlas')
json_path = os.path.join(args.dir, args.base + '.json')

# ── 图集:去掉旧 neckfill,找空白 ──
lines = open(atlas_path, encoding='utf-8').read().splitlines()
out, i = [], 0
while i < len(lines):
    if lines[i].strip() == NAME:
        i += 1
        while i < len(lines) and lines[i].startswith('  '):
            i += 1
        continue
    out.append(lines[i])
    i += 1
lines = out
rects = []
for k, l in enumerate(lines):
    if l.startswith('  xy:'):
        x, y = map(int, l.split(':')[1].split(','))
        rot = lines[k - 1].split(':')[1].strip() if lines[k - 1].startswith('  rotate:') else 'false'
        w, h = map(int, lines[k + 1].split(':')[1].split(','))
        if rot in ('true', '90'):
            w, h = h, w
        rects.append((x, y, w, h))
im = Image.open(png_path).convert('RGBA')
W, H = im.size
alpha = np.asarray(im)[..., 3]
occupied = np.zeros((H, W), bool)
for x, y, w, h in rects:
    occupied[max(0, y - 2):y + h + 2, max(0, x - 2):x + w + 2] = True
spot = None
for yy in range(0, H - PAD, 8):
    for xx in range(0, W - PAD, 8):
        if not occupied[yy:yy + PAD, xx:xx + PAD].any() and alpha[yy:yy + PAD, xx:xx + PAD].max() == 0:
            spot = (xx, yy)
            break
    if spot:
        break
assert spot, 'no free space in atlas page'

# ── 画垫片:柔边椭圆 ──
color = (60, 255, 60) if args.test else tuple(int(c) for c in args.color.split(','))
yy, xx = np.mgrid[0:PAD, 0:PAD]
r = np.sqrt(((xx + 0.5 - PAD / 2) / (PAD / 2)) ** 2 + ((yy + 0.5 - PAD / 2) / (PAD / 2)) ** 2)
a = np.clip((1.0 - r) / 0.28, 0, 1) * 255
pad = np.zeros((PAD, PAD, 4), np.uint8)
pad[..., 0], pad[..., 1], pad[..., 2] = color
pad[..., 3] = a.astype(np.uint8)
im.paste(Image.fromarray(pad, 'RGBA'), spot)
im.save(png_path, optimize=True)
lines += [NAME, '  rotate: false', f'  xy: {spot[0]}, {spot[1]}', f'  size: {PAD}, {PAD}', f'  orig: {PAD}, {PAD}', '  offset: 0, 0', '  index: -1']
open(atlas_path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')

# ── 骨骼:插部件 + 重算 drawOrder ──
data = json.load(open(json_path, encoding='utf-8'))
old_names = [s['name'] for s in data['slots'] if s['name'] != NAME]


def apply_offsets(names, offsets):
    n = len(names)
    order = [None] * n
    unchanged = []
    orig = 0
    for off in offsets:
        idx = names.index(off['slot'])
        while orig != idx:
            unchanged.append(orig)
            orig += 1
        order[orig + off.get('offset', 0)] = orig
        orig += 1
    while orig < n:
        unchanged.append(orig)
        orig += 1
    for k in range(n - 1, -1, -1):
        if order[k] is None:
            order[k] = unchanged.pop()
    return [names[k] for k in order]


# 先把每个 drawOrder 关键帧还原成「旧部件名顺序」(若之前插过 neckfill,按带 neckfill 的旧 setup 还原后剔除)
setup_before = [s['name'] for s in data['slots']]
resolved = {}
for anim_name, anim in data['animations'].items():
    keys = anim.get('drawOrder')
    if not keys:
        continue
    resolved[anim_name] = []
    for key in keys:
        if 'offsets' in key:
            order = [n for n in apply_offsets(setup_before, key['offsets']) if n != NAME]
        else:
            order = None
        resolved[anim_name].append(order)

data['slots'] = [s for s in data['slots'] if s['name'] != NAME]
pos = next(k for k, s in enumerate(data['slots']) if s['name'] == args.after) + 1
data['slots'].insert(pos, {'name': NAME, 'bone': 'chest', 'attachment': NAME})
new_names = [s['name'] for s in data['slots']]

for anim_name, orders in resolved.items():
    keys = data['animations'][anim_name]['drawOrder']
    for key, order in zip(keys, orders):
        if order is None:
            continue
        want = list(order)
        want.insert(want.index(args.after) + 1, NAME)
        key['offsets'] = [{'slot': n, 'offset': want.index(n) - new_names.index(n)} for n in new_names if want.index(n) != new_names.index(n)]
        assert apply_offsets(new_names, key['offsets']) == want, (anim_name, key.get('time'))

skin = next(s for s in data['skins'] if s['name'] == 'default')
skin['attachments'][NAME] = {NAME: {'x': args.x, 'y': args.y, 'rotation': args.rot, 'width': args.w, 'height': args.h}}
json.dump(data, open(json_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('neckfill', args.base, 'atlas spot', spot, 'slot', pos, 'at', (args.x, args.y, args.w, args.h, args.rot), 'drawOrder anims', len(resolved))
