# -*- coding: utf-8 -*-
"""地宫小样的交付图:借常驻预览(dungeon_dev.py start 要先在后台跑着)截一套,再和参考 FPS 左右并排。

  python tools/proto3d/dungeon/dungeon_shots.py <输出目录> [--fps=<参考 FPS 截图目录>] [--only=shots,sheet,compare]

出的图:
  01_地宫小样_六个镜头.jpg       大厅全景、贴地看倒影、玩家视角、铁栅门、石台和火盆、打怪
  02_和参考FPS并排对比.jpg       左 = 参考 FPS(fps_ref.py shots 截的 fps_hall / fps_floor / fps_fire / fps_wide),右 = 地宫小样
原图在 <输出目录>/原图。
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
DEV = os.path.join(HERE, 'dungeon_dev.py')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0] if ARGS else os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'g3dd_shots')
FPS = OPT.get('fps', '')
ONLY = [x for x in OPT.get('only', 'shots,sheet,compare').split(',') if x]
RAW = os.path.join(OUT, '原图')
os.makedirs(RAW, exist_ok=True)


def dev(*args):
    r = subprocess.run([sys.executable, DEV] + list(args), capture_output=True, text=True, cwd=ROOT, encoding='utf-8', errors='replace')
    return (r.stdout or '').strip()


def js(body):
    return dev('eval', body)


def shot(name):
    path = os.path.join(RAW, name + '.png')
    dev('shot', path)
    return path


def font(size):
    for name in ('msyhbd.ttc', 'msyh.ttc', 'simhei.ttf'):
        p = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tag(im, text):
    d = ImageDraw.Draw(im, 'RGBA')
    f = font(max(20, im.width // 36))
    w = d.textlength(text, font=f)
    d.rectangle((0, 0, w + 24, f.size + 18), fill=(8, 10, 14, 205))
    d.text((12, 6), text, font=f, fill=(244, 244, 244, 255))
    return im


def sheet(tiles, cols, title, path):
    w, h = tiles[0].size
    gap = 8
    head = 64
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * w + (cols - 1) * gap, head + rows * h + (rows - 1) * gap), (10, 12, 16))
    ImageDraw.Draw(out).text((14, 12), title, font=font(30), fill=(240, 240, 240))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % cols) * (w + gap), head + (i // cols) * (h + gap)))
    out.save(path, quality=90)
    print('sheet', path, out.size, flush=True)


# 机位:名字、说明、摆镜头前先把主角放哪、镜头(pos / look / fov;None = 跟着主角的玩家视角)
SHOTS = [
    ('hall', '大厅全景:天井的月光、冷色壁灯、远处的绿光', "D.tp(-4.6, 1.4, 20);", "D.shot([-10.6, 1.7, 3.3], [2, 1.5, -0.6], 60);"),
    ('floor', '贴地看:积水里照得出柱子、光斑和符文石板', "D.tp(-10.2, -3.2, 20);", "D.shot([-7.6, 0.5, 2.6], [-1.5, 0.7, -0.6], 58);"),
    ('follow', '玩家视角(镜头跟着主角)', "D.tp(-7.6, 1.9, 0);", "D.shot(); D.view({ yaw: 262, pitch: 6, dist: 3.4, fov: 55 });"),
    ('gate', '西头的铁栅门:门后的红光', "D.tp(-9.4, 0.4, 180);", "D.shot([-5.4, 1.6, 2.0], [-12, 1.9, -0.2], 58);"),
    ('dais', '东头的石台:火盆的暖光和符文的绿光', "D.tp(-4.6, 1.4, 20);", "D.shot([4.4, 1.5, 2.9], [10.6, 1.2, -1.6], 58);"),
]


def take():
    for name, _label, place, cam in SHOTS:
        js("D.freeze(false); " + place + " " + cam + " await sleep(1600); D.freeze(true); await sleep(300); return 1;")
        shot(name)
        print('shot', name, flush=True)
    print('fight', js('@' + os.path.join(HERE, 'shot_fight.js'))[:300], flush=True)
    shot('fight')
    js("D.freeze(false); D.shot(); return 1;")


def load(name, size=None, box=None, base=RAW):
    im = Image.open(os.path.join(base, name + '.png')).convert('RGB')
    if box:
        im = im.crop(box)
    return im.resize(size, Image.LANCZOS) if size else im


def main():
    if 'shots' in ONLY:
        take()
    size = (960, 540)
    if 'sheet' in ONLY:
        tiles = [tag(load(n, size), label) for n, label, _p, _c in SHOTS] + [tag(load('fight', size), '打怪:砍中的一刻(火星 + 临时亮一下的灯)')]
        sheet(tiles, 2, '地宫小样 · 整间由代码生成(材质、几何、灯),角色是 AI 图转 3D 的模型;预览地址带 ?g3ddungeon=1', os.path.join(OUT, '01_地宫小样_六个镜头.jpg'))
    if 'compare' in ONLY and FPS:
        rows = [
            (('fps_hall', '参考 FPS · 大厅'), ('hall', '地宫小样 · 大厅')),
            (('fps_floor', '参考 FPS · 地面'), ('floor', '地宫小样 · 地面')),
            (('fps_fire', '参考 FPS · 开火'), ('fight', '地宫小样 · 打怪')),
            (('fps_wide', '参考 FPS · 另一个方向'), ('gate', '地宫小样 · 铁栅门')),
        ]
        tiles = []
        for (a, la), (b, lb) in rows:
            tiles += [tag(load(a, size, base=FPS), la), tag(load(b, size), lb)]
        tiles += [tag(load('fps_floor', size, (1180, 560, 1820, 920), FPS), '参考 FPS · 局部放大(墙 + 地面)'),
                  tag(load('floor', size, (640, 620, 1280, 980)), '地宫小样 · 局部放大(地面)')]
        sheet(tiles, 2, '和参考的那个 FPS 并排(左 = 参考,右 = 地宫小样;都是 1920 宽的原始截图缩小,同一台电脑)', os.path.join(OUT, '02_和参考FPS并排对比.jpg'))


if __name__ == '__main__':
    main()
