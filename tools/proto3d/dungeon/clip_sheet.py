# -*- coding: utf-8 -*-
"""地宫小样 · 把主角的一个动作片段按时刻定格、截成一张分解图(挑片段、量出手时刻用)。
常驻预览 dungeon_dev.py start 要先起着,模型和招式要先放进工程(tools/proto3d/char3d/stage_chars.py in)。

  python tools/proto3d/dungeon/clip_sheet.py <输出.jpg> --clip=gs_cut1 [--from=0] [--to=片段长] [--dt=0.1]
        [--at=1.6,1.2] [--yaw=0] [--cam=side|front|back|top] [--cols=8] [--crop=0.62]

人定在原地(片段自带的位移不挪),每张图左上角是片段里的秒数。
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
DEV = os.path.join(HERE, 'dungeon_dev.py')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
CLIP = OPT['clip']
AT = [float(v) for v in OPT.get('at', '-4.5,-3.0').split(',')]
YAW = float(OPT.get('yaw', '0'))
CAM = OPT.get('cam', 'side')
COLS = int(OPT.get('cols', '8'))
CROP = float(OPT.get('crop', '0.62'))
DT = float(OPT.get('dt', '0.1'))
TMP = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'g3dd_clip.png')


def dev(*a):
    r = subprocess.run([sys.executable, DEV] + list(a), capture_output=True, text=True, cwd=ROOT, encoding='utf-8', errors='replace')
    return (r.stdout or '').strip()


x, z = AT
cams = {
    'side': "D.shot([%f, 1.3, %f], [%f, 1.0, %f], 40);" % (x + 0.3, z + 5.4, x + 0.3, z),
    'front': "D.shot([%f, 1.5, %f], [%f, 1.0, %f], 40);" % (x + 5.0, z + 2.2, x, z),
    'back': "D.shot([%f, 2.2, %f], [%f, 0.9, %f], 46);" % (x - 4.6, z + 0.6, x + 1.4, z),
    'top': "D.shot([%f, 6.2, %f], [%f, 0.2, %f], 46);" % (x + 0.2, z + 2.6, x + 0.2, z),
}
info = dev('eval', "D.pause(false); D.freeze(false); D.tp(%f, %f, %f); %s D.clip('%s', 0); await sleep(700); D.pause(true); const m = D.dungeon.leader.moves; return JSON.stringify(m && m.clips['%s'] ? { dur: m.clips['%s'].dur } : {});" % (
    x, z, YAW, cams[CAM], CLIP, CLIP, CLIP))
try:
    dur = json.loads(info.splitlines()[-1]).get('dur', 2.0)
except Exception:  # noqa: BLE001
    dur = 2.0
T0 = float(OPT.get('from', '0'))
T1 = float(OPT.get('to', str(dur)))
tiles = []
t = T0
while t <= T1 + 1e-6:
    dev('eval', "D.clip('%s', %f); D.step(1 / 60, 2); return 1;" % (CLIP, t))
    dev('shot', TMP)
    im = Image.open(TMP).convert('RGB')
    w, h = im.size
    cw = int(h * CROP)
    im = im.crop((w // 2 - cw // 2, int(h * 0.1), w // 2 + cw // 2, int(h * 0.94)))
    im = im.resize((300, int(300 * im.height / im.width)), Image.LANCZOS)
    ImageDraw.Draw(im).text((6, 4), '%s  %.2fs' % (CLIP, t), fill=(255, 235, 120))
    tiles.append(im)
    t += DT
dev('eval', "D.clip(); D.pause(false); D.shot(); return 1;")
rows = (len(tiles) + COLS - 1) // COLS
tw, th = tiles[0].size
sh = Image.new('RGB', (COLS * tw, rows * th), (8, 9, 12))
for i, im in enumerate(tiles):
    sh.paste(im, ((i % COLS) * tw, (i // COLS) * th))
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
sh.save(OUT, quality=88)
print('saved', OUT, sh.size, 'dur', dur)
