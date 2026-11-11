# -*- coding: utf-8 -*-
"""把 shots.py 截的图和现在实机的截图拼成对比图(交付 / 周报用)。

用法:python tools/proto3d/guard_battle/compose.py <目录>
目录下要有:ref/(tools/qa/battle_polish_shots.py 截的现在实机图)和 proto/(shots.py shots 截的小样图);拼好的图存到 <目录>/compare/。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
REF, PRO, OUT = os.path.join(ROOT, 'ref'), os.path.join(ROOT, 'proto'), os.path.join(ROOT, 'compare')
os.makedirs(OUT, exist_ok=True)
FONT = next((p for p in (r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf') if os.path.exists(p)), None)


def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()


def load(folder, name, size=None):
    im = Image.open(os.path.join(folder, name)).convert('RGB')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return im


def label(draw, xy, text, size=34, fill=(255, 255, 255), bg=(16, 20, 30)):
    f = font(size)
    box = draw.textbbox(xy, text, font=f)
    draw.rectangle((box[0] - 14, box[1] - 9, box[2] + 14, box[3] + 11), fill=bg)
    draw.text(xy, text, font=f, fill=fill)


def side_by_side(name, left, right, ltext, rtext, vertical=False, head=''):
    w, h = left.size
    pad, top = 8, 86 if head else 0
    canvas = Image.new('RGB', (w, top + h * 2 + pad) if vertical else (w * 2 + pad, top + h), (10, 12, 18))
    canvas.paste(left, (0, top))
    canvas.paste(right, (0, top + h + pad) if vertical else (w + pad, top))
    d = ImageDraw.Draw(canvas)
    if head:
        d.text((24, 20), head, font=font(40), fill=(232, 236, 244))
    label(d, (24, top + 20), ltext)
    label(d, (24, top + h + pad + 20) if vertical else (w + pad + 24, top + 20), rtext, fill=(255, 226, 160))
    path = os.path.join(OUT, name)
    canvas.save(path, quality=90)
    print('saved', path, canvas.size)


def grid(name, items, cols, cell, head=''):
    rows = (len(items) + cols - 1) // cols
    pad, top = 6, 86 if head else 0
    canvas = Image.new('RGB', (cols * cell[0] + (cols - 1) * pad, top + rows * cell[1] + (rows - 1) * pad), (10, 12, 18))
    d = ImageDraw.Draw(canvas)
    if head:
        d.text((24, 20), head, font=font(40), fill=(232, 236, 244))
    for i, (im, text) in enumerate(items):
        x, y = (i % cols) * (cell[0] + pad), top + (i // cols) * (cell[1] + pad)
        canvas.paste(im.resize(cell, Image.LANCZOS) if im.size != cell else im, (x, y))
        label(d, (x + 16, y + 14), text, size=26)
    path = os.path.join(OUT, name)
    canvas.save(path, quality=90)
    print('saved', path, canvas.size)


PC = (1920, 1080)
side_by_side('01_全景_现在实机_vs_3D小样.jpg', load(REF, 'pc_guard_00_calm.png', PC), load(PRO, 'pc_00_全景.png', PC), '现在:2D 背景图 + 骨骼角色', '小样:程序材质 + 实时光照(角色仍是 2D 纸片)',
             head='守卫战战场 · 同一视口 1920×1080(左:现在线上的画面  右:3D 光影小样)')
side_by_side('02_落雷_现在实机_vs_3D小样.jpg', load(REF, 'pc_guard_3_spell_thunder.png', PC), load(PRO, 'pc_2_落雷_b劈下.png', PC), '现在:九天神雷(特效盖在画面上,地面不变)', '小样:落雷那一瞬整场被照亮,影子跟着变',
             head='技能的光有没有打到地面和道具上 · 落雷')
side_by_side('03_冰_现在实机_vs_3D小样.jpg', load(REF, 'pc_guard_3_spell_frost.png', PC), load(PRO, 'pc_3_冰环_b冻住.png', PC), '现在:冰封', '小样:冰环扫过留下霜面,冷光打在地面和怪身上',
             head='技能的光有没有打到地面和道具上 · 冰')
PH = (2400, 1080)
side_by_side('04_手机视口_现在实机_vs_3D小样.jpg', load(REF, 'phone_guard_00_calm.png', PH), load(PRO, 'phone_00_全景.png', PH), '现在(手机横屏 2400×1080)', '小样 · 中档(手机默认档)', vertical=True,
             head='手机横屏视口 2400×1080')
cell = (960, 540)
grid('05_三个技能_分镜.jpg', [
    (load(PRO, 'pc_1_火球_a飞行.png'), '火球 · 飞行中(沿途地面被映亮)'), (load(PRO, 'pc_1_火球_b命中.png'), '火球 · 命中爆闪'), (load(PRO, 'pc_1_火球_c余烬.png'), '火球 · 焦痕和余烬'),
    (load(PRO, 'pc_2_落雷_a预警.png'), '落雷 · 预警圈'), (load(PRO, 'pc_2_落雷_b劈下.png'), '落雷 · 劈下(整场一闪)'), (load(PRO, 'pc_2_落雷_c焦痕.png'), '落雷 · 焦痕'),
    (load(PRO, 'pc_3_冰环_a扩散.png'), '冰环 · 扩散'), (load(PRO, 'pc_3_冰环_b冻住.png'), '冰环 · 霜面 + 冰刺'), (load(PRO, 'pc_00_全景.png'), '平时'),
], 3, cell, head='三个技能演示(逐帧定格,1920×1080 高档)')
box = (240, 300, 1840, 900)
grid('06_角色受光的三种做法.jpg', [(load(PRO, f'pc_4_角色受光_{m}{t}.png').crop(box), s) for m, t, s in (
    (0, '不受光', '① 不受光:现在的 2D 角色层原样盖上去(场景亮了,人没变)'), (1, '整体染色', '② 整体染色:按所在位置的光照乘一个颜色(小样默认)'), (2, '逐像素', '③ 逐像素:每盏灯真的去照(要给骨骼配法线图,成本高)'))],
     1, (1600, 600), head='2D 角色放进 3D 场景的三种受光方式(落雷劈下、整场被照亮的同一瞬间)')
box2 = (900, 400, 1740, 860)
grid('07_纸片怪_vs_程序拼的3D石像怪.jpg', [(load(PRO, 'pc_1_火球_a飞行.png').crop(box2), '左右是纸片怪(2D 图),中间灰色那只是程序拼出来的 3D 石像怪'), (load(PRO, 'pc_3_冰环_b冻住.png').crop(box2), '被冰环冻住:石像眼睛变蓝,身上真的被冷光照到')],
     2, (840, 460), head='怪物做成 3D:硬壳类(石像 / 机关)可以用基本体拼,全程受光、真投影')
box3 = (300, 250, 1500, 925)
grid('08_三档画质_同一帧.jpg', [(load(PRO, f'pc_5_画质_{q}.png', PC).crop(box3), s) for q, s in (
    ('high', '高:4 倍抗锯齿 + 全分辨率环境光遮蔽 + 7 盏点光全算'), ('mid', '中(手机默认):半分辨率遮蔽,火盆 / 水晶的光改成贴地光斑'), ('low', '低:画布短边 720,不要环境反射和遮蔽,投影保留'))],
     3, (1200, 675), head='三档画质 · 同一帧局部')

# ── 引擎里的技术验证(tools/proto3d/guard_battle/engine_shots.py 截的,目录 engine/;没有就跳过)──
ENG = os.path.join(ROOT, 'engine')
if os.path.exists(os.path.join(ENG, 'pc_g3d_01_开.png')):
    side_by_side('09_引擎内_同一局_关3D_vs_开3D.jpg', load(ENG, 'pc_g3d_00_关.png', PC), load(ENG, 'pc_g3d_01_开.png', PC), '关:现在的 2D 背景图', '开:3D 场景垫在下面,格子 / 英雄 / 怪物 / 特效 / 界面原样不动',
                 head='在游戏引擎里(Creator 预览,真实的一局守卫战):同一局、同一视口,只切 3D 层开关')
    grid('10_引擎内_技能光打在地面上.jpg', [(load(ENG, f'pc_g3d_{n}.png'), t) for n, t in (
        ('10_平时', '平时'), ('11_神雷', '水晶法术 · 九天神雷(落点周围的石板被冷光照亮)'), ('12_冰封', '水晶法术 · 冰封(一片青光)'),
        ('13_震荡', '水晶法术 · 矿晶震荡'), ('14_战技', '英雄战技'), ('15_大招', '英雄大招(游戏原有的压暗层照常压在 3D 背景上)'))],
         3, cell, head='在游戏引擎里:技能还是原来那套 2D 特效,3D 层在落点亮一盏灯')
    if os.path.exists(os.path.join(ENG, 'phone_g3d_11_神雷.png')):
        side_by_side('11_引擎内_手机视口.jpg', load(ENG, 'phone_g3d_16_大招_关3D同一帧.png', PH), load(ENG, 'phone_g3d_11_神雷.png', PH), '关(手机横屏 2400×1080)', '开 · 九天神雷', vertical=True,
                     head='在游戏引擎里 · 手机横屏视口')
