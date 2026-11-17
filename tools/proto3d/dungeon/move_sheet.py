# -*- coding: utf-8 -*-
"""地宫小样 · 把一串招式逐帧推着截成一张分解图(常驻预览 dungeon_dev.py start 要先起着,模型要先放进工程)。

  python tools/proto3d/dungeon/move_sheet.py <输出.jpg> --moves=attack,attack,attack,attack [--stride=4] [--frames=40]
        [--at=1.6,1.2] [--yaw=0] [--cam=side|back|top] [--cols=8] [--crop=0.62]

--moves:依次出的招(attack = 普攻,dash / whirl / smash / wave = 技能);前一招到了能接的点自动接下一招。
--stride:每隔几帧(1/60 秒)截一张;--frames:一共截几张。引擎先暂停,逐帧推,所以每张图对应的时刻是准的。
"""
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
MOVES = [m for m in OPT.get('moves', 'attack').split(',') if m]
STRIDE = int(OPT.get('stride', '4'))
FRAMES = int(OPT.get('frames', '40'))
AT = [float(v) for v in OPT.get('at', '1.6,1.2').split(',')]
YAW = float(OPT.get('yaw', '0'))
CAM = OPT.get('cam', 'side')
COLS = int(OPT.get('cols', '8'))
CROP = float(OPT.get('crop', '0.62'))
TMP = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'g3dd_move.png')


def dev(*a):
    r = subprocess.run([sys.executable, DEV] + list(a), capture_output=True, text=True, cwd=ROOT, encoding='utf-8', errors='replace')
    return (r.stdout or '').strip()


x, z = AT
cams = {
    'side': "D.shot([%f, 1.5, %f], [%f, 1.0, %f], 42);" % (x + 1.2, z + 5.2, x + 1.2, z),
    'back': "D.shot([%f, 2.2, %f], [%f, 0.9, %f], 46);" % (x - 4.6, z + 0.6, x + 1.4, z),
    'top': "D.shot([%f, 6.2, %f], [%f, 0.2, %f], 46);" % (x + 0.6, z + 3.2, x + 1.0, z),
}
print(dev('eval', "D.pause(false); D.freeze(false); D.tp(%f, %f, %f); %s await sleep(900); D.pause(true); return JSON.stringify(D.info().mobs);" % (x, z, YAW, cams[CAM]))[:200])
queue = list(MOVES)
tiles = []
log = []
for i in range(FRAMES):
    # 没在出招(或者这一招到了能接的点、而且还没排下一招)就把下一招递进去
    st = dev('eval', "const d = D.dungeon; if (%s && (!d.act || (!d.queued && d.act.t / d.act.dur > 0.3))) { D.skill('%s'); return 'in'; } return d.act ? D.info().act : 'idle';" % (
        'true' if queue else 'false', queue[0] if queue else ''))
    if st == 'in':
        queue.pop(0)
    dev('eval', "D.step(1 / 60, %d); return 1;" % STRIDE)
    dev('shot', TMP)
    im = Image.open(TMP).convert('RGB')
    w, h = im.size
    cw = int(h * CROP)
    im = im.crop((w // 2 - cw // 2, int(h * 0.12), w // 2 + cw // 2, int(h * 0.96)))
    im = im.resize((300, int(300 * im.height / im.width)), Image.LANCZOS)
    act = dev('eval', "return D.info().act || '-';")
    ImageDraw.Draw(im).text((6, 4), '%d  %s' % (i * STRIDE, act), fill=(255, 235, 120))
    tiles.append(im)
    log.append(act)
dev('eval', "D.pause(false); D.shot(); return 1;")
rows = (len(tiles) + COLS - 1) // COLS
tw, th = tiles[0].size
sh = Image.new('RGB', (COLS * tw, rows * th), (8, 9, 12))
for i, im in enumerate(tiles):
    sh.paste(im, ((i % COLS) * tw, (i // COLS) * th))
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
sh.save(OUT, quality=88)
print('saved', OUT, sh.size)
print(' '.join(log)[:600])
