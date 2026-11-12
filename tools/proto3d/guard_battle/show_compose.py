# -*- coding: utf-8 -*-
"""把全 3D 样板的截图(show_shots.py shots)和现在实机的截图拼成对比图 / 分镜图(交付用)。

用法:python tools/proto3d/guard_battle/show_compose.py <样板目录> [现在实机截图目录]
样板目录下要有 show/;现在实机的截图默认取 周报截图/2026-11-11_战斗3D光影小样/ref(tools/qa/battle_polish_shots.py 截的)。拼好的图存到 <样板目录>/compare/。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ARGV = [x for x in sys.argv[1:] if not x.startswith('--')]
ROOT = ARGV[0] if ARGV else '.'
REF = ARGV[1] if len(ARGV) > 1 else os.path.join(os.path.dirname(os.path.abspath(ROOT)), '2026-11-11_战斗3D光影小样', 'ref')
def opt(name, default=''):
    return next((x.split('=', 1)[1] for x in sys.argv if x.startswith(f'--{name}=')), default)


# --show=show_v2 换一批样板截图;--out=compare_v2 换输出目录;--before=show 再拼一组「改之前 / 改之后」
SHOW, OUT = os.path.join(ROOT, opt('show', 'show')), os.path.join(ROOT, opt('out', 'compare'))
BEFORE = os.path.join(ROOT, opt('before')) if opt('before') else ''
os.makedirs(OUT, exist_ok=True)
FONT = next((p for p in (r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf') if os.path.exists(p)), None)


def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()


def load(folder, name, size):
    im = Image.open(os.path.join(folder, name)).convert('RGB')
    # 等比缩放后居中裁成目标尺寸(两边的图比例可能差一点)
    k = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x, y = (im.width - size[0]) // 2, (im.height - size[1]) // 2
    return im.crop((x, y, x + size[0], y + size[1]))


def label(draw, xy, text, size=34, fill=(255, 255, 255), bg=(16, 20, 30)):
    f = font(size)
    box = draw.textbbox(xy, text, font=f)
    draw.rectangle((box[0] - 14, box[1] - 9, box[2] + 14, box[3] + 11), fill=bg)
    draw.text(xy, text, font=f, fill=fill)


def side_by_side(name, left, right, ltext, rtext, head=''):
    w, h = left.size
    pad, top = 8, 86 if head else 0
    canvas = Image.new('RGB', (w * 2 + pad, top + h), (10, 12, 18))
    canvas.paste(left, (0, top))
    canvas.paste(right, (w + pad, top))
    d = ImageDraw.Draw(canvas)
    if head:
        d.text((24, 20), head, font=font(40), fill=(232, 236, 244))
    label(d, (24, top + 20), ltext)
    label(d, (w + pad + 24, top + 20), rtext, fill=(255, 226, 160))
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
        canvas.paste(im, (x, y))
        label(d, (x + 20, y + 16), text, size=30)
    path = os.path.join(OUT, name)
    canvas.save(path, quality=90)
    print('saved', path, canvas.size)


S = (1600, 900)
if os.path.isdir(REF):
    side_by_side('对比01_现在实机_vs_全3D样板_待机.jpg', load(REF, 'pc_guard_00_calm.png', S), load(SHOW, '01_战场全景_待机.jpg', S),
                 '现在实机(2D 骨骼 + 手绘背景)', '全 3D 样板(程序生成的角色、场景、特效,引擎内实时)', head='守卫战 · 同一机位:现在 vs 全 3D 样板')
    side_by_side('对比02_现在实机大招_vs_全3D样板落雷.jpg', load(REF, 'pc_guard_21_ult_SR_ZHANGJIAO.png', S), load(SHOW, '03_落雷.jpg', S),
                 '现在实机 · 大招', '全 3D 样板 · 落雷(雷光照亮地面和盔甲)', head='守卫战 · 放技能的一瞬间:现在 vs 全 3D 样板')
else:
    print('没找到现在实机的截图目录,跳过对比图:', REF)
C = (1280, 720)
grid('分镜_蓄力_落雷_连锁_余烬.jpg', [(load(SHOW, '02_蓄力.jpg', C), '① 蓄力:杖顶聚电,脚下起阵'), (load(SHOW, '03_落雷.jpg', C), '② 落雷:整个院子被照亮'),
                             (load(SHOW, '04_连锁.jpg', C), '③ 连锁:电弧跳向旁边的敌人'), (load(SHOW, '05_余烬.jpg', C), '④ 余烬:裂纹、焦痕、倒地')], 2, C, head='全 3D 样板 · 一次落雷的四个瞬间(战场机位)')
grid('近景_术士_骑士_水晶_低机位.jpg', [(load(SHOW, '07_术士_中景.jpg', C), '术士(布衣、露脸):中景'), (load(SHOW, '10_骑士_近景.jpg', C), '重甲骑士:近景'),
                              (load(SHOW, '08_水晶.jpg', C), '水晶'), (load(SHOW, '06_落雷_低机位.jpg', C), '落雷 · 低机位(可做大招特写镜头)')], 2, C, head='全 3D 样板 · 换机位看模型(同一个场景,实时)')


def crop(folder, name, box, size):
    im = Image.open(os.path.join(folder, name)).convert('RGB').crop(box)
    return im.resize(size, Image.LANCZOS)


if BEFORE and os.path.isdir(BEFORE):
    # 改之前 / 改之后:同一个机位;战场机位再裁出水晶和英雄那一块放大看
    side_by_side('前后01_水晶.jpg', load(BEFORE, '08_水晶.jpg', S), load(SHOW, '08_水晶.jpg', S), '精细化之前', '精细化之后', head='水晶:精细化前后(同一机位)')
    side_by_side('前后02_术士.jpg', load(BEFORE, '07_术士_中景.jpg', S), load(SHOW, '07_术士_中景.jpg', S), '精细化之前', '精细化之后', head='术士:精细化前后(同一机位)')
    box = (40, 400, 840, 850)
    side_by_side('前后03_战场机位局部放大.jpg', crop(BEFORE, '01_战场全景_待机.jpg', box, S), crop(SHOW, '01_战场全景_待机.jpg', box, S), '精细化之前(战场机位,放大 2 倍)', '精细化之后(战场机位,放大 2 倍)',
                 head='战场机位下的水晶和术士:精细化前后')


# --ref=ref_look:对照验证的两张图(同一个引擎、同一套灯光里,代码生成的术士和现成的高精度模型站在一起),拼一张带标注的
REFDIR = os.path.join(ROOT, opt('ref')) if opt('ref') else ''
if REFDIR and os.path.isdir(REFDIR):
    a = load(REFDIR, 'look_ref_refBody.jpg', S)
    b = load(REFDIR, 'look_ref_refFace.jpg', S)
    pad, top = 8, 86
    canvas = Image.new('RGB', (S[0] * 2 + pad, top + S[1]), (10, 12, 18))
    canvas.paste(a, (0, top))
    canvas.paste(b, (S[0] + pad, top))
    d = ImageDraw.Draw(canvas)
    d.text((24, 20), '同一个 Cocos 场景、同一套灯光:代码生成的术士 vs 现成的高精度模型(Poly Haven,CC0)', font=font(40), fill=(232, 236, 244))
    k = S[0] / 1920
    for x, y, text, gold in [(150, 150, '现成模型:大理石胸像', True), (330, 1010, '代码生成的术士', False), (1010, 1010, '现成模型:哥特雕像', True)]:
        label(d, (int(x * k), top + int(y * k) - 30), text, size=30, fill=(255, 226, 160) if gold else (255, 255, 255))
    for x, y, text, gold in [(300, 1010, '现成模型:大理石胸像', True), (1250, 1010, '代码生成的术士', False)]:
        label(d, (S[0] + pad + int(x * k), top + int(y * k) - 30), text, size=30, fill=(255, 226, 160) if gold else (255, 255, 255))
    path = os.path.join(OUT, '验证_同引擎同灯光_代码生成vs现成高精度模型.jpg')
    canvas.save(path, quality=92)
    print('saved', path, canvas.size)
