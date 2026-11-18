# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期:整城布局原型图(本机 Codex 订阅生图,一张约 1~2 分钟;给用户确认用,确认后才在 3D 里摆、拍)。

  python tools/proto3d/pre25/city_proto_gen.py <输出.png> [--extra="补充要求"]

参考图(放在 %TEMP%/lootchain-qa/cityproto/):
  plaza_render.png  现有中心广场的游戏内实际渲染(视角 D:斜 45°、俯 45°、正交)
  plan_rot.png      整城平面布局(city_plan.py 出的图转到同一朝向:屏幕上方 = 东北)
"""
import glob
import os
import shutil
import subprocess
import sys
import time

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
WORK = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'cityproto')
BIN = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
CODEX = max(glob.glob(os.path.join(BIN, '*', 'codex.exe')), key=os.path.getmtime)

PROMPT = (
    "Use the image generation tool and produce exactly ONE image. Do not write any files, do not run commands.\n\n"
    "Image 1 is an in-game render of the CENTRAL PLAZA of our medieval fantasy city, from our real game camera: an orthographic, "
    "isometric-style view looking down at about 45 degrees, rotated 45 degrees (the top of the image is north-east). "
    "Image 2 is the planned layout of the WHOLE CITY drawn in exactly the same orientation (top of the image = north-east): "
    "dark boxes are buildings, grey bands are walkable streets, the blue band is a canal, the red squares are city gates.\n\n"
    "Draw ONE wide 16:9 concept image of the whole city as seen from exactly the same camera as image 1 (same angle, same orthographic look, "
    "same scale of buildings), so it reads like a zoomed-out screenshot of our game. Keep the central plaza recognisable and in the same place "
    "relative to the districts: the compass rose in the paving, the well, the steep-roofed half-timbered smithy with its glowing forge, "
    "the two red-awning market stalls, and the big gothic cathedral with its stone terrace and wide stairs on the upper-right side.\n\n"
    "Around it, follow the layout of image 2: on the LOWER-LEFT a street leading to a large Mercenary Guild hall and a Golden Wheat tavern "
    "(warm windows, a hanging sign), with a stable yard behind; on the UPPER-LEFT a straight street leading to an Imperial Academy "
    "(stone college with a small courtyard and a clock tower); on the RIGHT a market street running past the cathedral to the EAST GATE "
    "(a stone gatehouse in the city wall), with a barracks beside it; across the LOWER-RIGHT a canal with a stone bridge, and beyond the bridge "
    "the SOUTH GATE in the city wall; small docks with boats at the far right end of the canal. Fill the gaps with dense half-timbered houses, "
    "narrow alleys, a few autumn maple trees with sparse red leaves, street lamps. A low city wall wraps the edge of the city.\n\n"
    "Style must match image 1 exactly: realistic, matte, low saturation, a cold moonlit night that is still fairly bright and readable, "
    "wet dark flagstones, warm amber light only from some windows, the forge and the street lamps. No glow haze, no light beams, "
    "no fog banks, no text, no labels, no UI, no characters, no cartoon look. The whole city must fit in the frame with a little margin."
)


def main():
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    refs = ['-i', os.path.join(WORK, 'plaza_render.png'), '-i', os.path.join(WORK, 'plan_rot.png')]
    prompt = PROMPT + (('\n\nExtra: ' + OPT['extra']) if 'extra' in OPT else '')
    stamp = time.time()
    r = subprocess.run([CODEX, 'exec', '--skip-git-repo-check', '-s', 'read-only', '-C', WORK, '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"'] + refs + ['-'],
                       input=prompt.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
    home = os.path.expanduser('~/.codex/generated_images')
    imgs = [p for p in glob.glob(os.path.join(home, '**', '*.png'), recursive=True) if os.path.getmtime(p) > stamp]
    if not imgs:
        print(r.stdout.decode('utf-8', 'replace')[-2000:])
        raise SystemExit('没出图')
    src = max(imgs, key=os.path.getmtime)
    shutil.copy(src, OUT)
    with open(os.path.splitext(OUT)[0] + '_提示词.txt', 'w', encoding='utf-8') as f:
        f.write(prompt)
    print('saved', OUT)


main()
