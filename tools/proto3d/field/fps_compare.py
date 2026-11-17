# -*- coding: utf-8 -*-
"""和参考的那个 FPS(fable52-fps-repro 的在线演示)并排对比。三步,图都放同一个工作目录:

  python tools/proto3d/field/fps_ref.py start                      # 后台起参考页的无头浏览器(9368)
  python tools/proto3d/field/fps_ref.py shots <工作目录>            # 截参考 FPS:fps_hall / fps_floor / fps_fire / fps_wide .png
  python tools/proto3d/field/fps_ref.py stop
  python tools/proto3d/field/fps_compare.py ours  <工作目录>        # 截我们自由视角的同类镜头(常驻预览 field_dev.py start 要先起着;模型要先放进工程)
  python tools/proto3d/field/fps_compare.py sheet <工作目录> <输出.jpg>

左 = 参考 FPS,右 = 我们;同一行是同一类画面(整体灯光 / 地面 / 开打 / 白天 / 材质局部原尺寸)。
"""
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CMD = sys.argv[1] if len(sys.argv) > 1 else 'sheet'
WORK = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'fps_compare')
DEST = sys.argv[3] if len(sys.argv) > 3 else os.path.join(WORK, 'compare.jpg')
os.makedirs(WORK, exist_ok=True)
_argv = sys.argv
sys.argv = ['field_sample.py', os.path.join(WORK, 'ours_raw')]
sys.path.insert(0, HERE)
import field_sample as fs  # noqa: E402
sys.argv = _argv


def ours():
    def grab(name):
        shutil.copyfile(fs.shot(name), os.path.join(WORK, 'ours_' + name + '.png'))
        print('saved', name, flush=True)

    plaza = (-8105, -3750)
    for look in ('dusk', 'day'):
        print(look, fs.setup(cam=True, look=look), flush=True)
        fs.tp(-9150, -3350)                      # 入口营地:营帐、栅栏、火把
        fs.js(fs.UNFREEZE)
        fs.view(-60, 10, 8)
        grab(look + '_camp_low')
        fs.view(20, 24, 10)
        grab(look + '_camp_mid')
        fs.tp(plaza[0], plaza[1])                # 石板地:贴地看地面
        fs.js(fs.UNFREEZE)
        fs.view(140, 9, 8.5)
        grab(look + '_floor_low')
        fs.view(40, 14, 6.5)
        grab(look + '_floor_near')
        fs.tp(-6620, -1900)                      # 怪群旁:技能出手
        fs.js(fs.UNFREEZE)
        fs.view(-35, 16, 8, settle=1300)
        fs.js("window.__act = 2; window.__actWait = 700; return 1;")
        fs.js('@' + os.path.join(fs.SNIP, 'fight.js'))
        grab(look + '_fight')
        fs.js(fs.UNFREEZE)
    print('back', fs.setup(ground=False, cam=False, look='day'), flush=True)


def sheet():
    size = (960, 540)

    def tile(name, label, box=None):
        im = Image.open(os.path.join(WORK, name + '.png')).convert('RGB')
        if box:
            im = im.crop(box)
        return fs.tag(im.resize(size, Image.LANCZOS), label)

    rows = [
        (('fps_hall', '参考 FPS · 大厅'), ('ours_dusk_camp_mid', '我们 · 黄昏 · 入口营地')),
        (('fps_floor', '参考 FPS · 地面(湿地面,照得出灯和柱子)'), ('ours_dusk_floor_near', '我们 · 黄昏 · 石板地')),
        (('fps_fire', '参考 FPS · 开火'), ('ours_dusk_fight', '我们 · 黄昏 · 旋风斩')),
        (('fps_wide', '参考 FPS · 另一个方向'), ('ours_day_camp_low', '我们 · 白天 · 入口营地')),
    ]
    tiles = []
    for a, b in rows:
        tiles += [tile(*a), tile(*b)]
    # 材质局部:各取 640×360 的一块,原尺寸放大 1.5 倍
    tiles += [tile('fps_floor', '参考 FPS · 局部放大(墙 + 地面)', (1180, 560, 1820, 920)),
              tile('ours_dusk_floor_near', '我们 · 局部放大(石板地 + 草)', (560, 640, 1200, 1000))]
    fs.sheet(tiles, 2, '和参考的那个 FPS 并排(左 = 参考,右 = 我们的自由视角;同一行是同一类画面,都是 1920 宽的原始截图缩小)', DEST)
    print('sheet', DEST)


if CMD == 'ours':
    ours()
else:
    sheet()
