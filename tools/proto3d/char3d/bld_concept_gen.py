# -*- coding: utf-8 -*-
"""主城建筑 / 摆件的单体设定图(给用户确认,之后拿去 tripo_run.py gen1 转 3D)。本机 Codex 订阅生图,一次一张,每张约一分钟。

做法:从主城原型里裁出那一块 + 整张原型当参考(民房再加一张已确认的民房设定图统一画风),提示词要求「只画这一样东西、整个完整、
左前方四分之三视角、浅灰底、均匀的阴天光、不要街道人物、亮着的窗只留平的琥珀色」。
第一批(铁匠铺 / 教堂 / 民房 A)的提示词在 周报截图/2026-11-17_主城3D小样/建筑设定图/*_提示词.txt。

用法:python tools/proto3d/char3d/bld_concept_gen.py <键> [<键> …]   键见 JOBS;民房要参考图 %TEMP%/lootchain-qa/bld/house_in.png
"""
import glob
import os
import shutil
import subprocess
import sys
import time
from PIL import Image

WORK = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'bld')
os.makedirs(WORK, exist_ok=True)
PROTO = 'D:/project/lootchain-cocos/周报截图/2026-11-17_主城3D小样/原型/01_主城中心广场_原型.jpg'
OUT = 'D:/project/lootchain-cocos/周报截图/2026-11-17_主城3D小样/建筑设定图/'
BIN = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
CODEX = max(glob.glob(os.path.join(BIN, '*', 'codex.exe')), key=os.path.getmtime)

COMMON = (
    "Use the image generation tool and produce exactly ONE image. Do not write any files, do not run commands.\n\n"
    "The first attached image is a crop from our own game concept art (second attached image = the full concept, for style). {extra}"
    "Draw ONLY the building or prop described below as a single isolated 3D game-asset concept in exactly the style of the reference: "
    "same kind of architecture, same materials, same level of weathered detail.\n\n"
    "{desc}\n\n"
    "Framing: the WHOLE object is visible and complete, nothing cropped, with a small margin around it; three-quarter view from the front-left, "
    "camera slightly above eye level, object centered. Plain flat light-grey studio background (#b8b8b8), nothing else in the picture: "
    "no street, no ground texture beyond a thin neutral base under the object, no other buildings, no trees, no people, no sky, no moon, no text, no UI.\n"
    "Lighting: soft, even, neutral overcast studio light so every surface is readable; no strong cast shadows, no night tint, no fog, no bloom or glow halos. "
    "Windows or lamp glass that are lit stay warm amber, but as flat coloured glass without light spill.\n"
    "Style: realistic dark-fantasy game asset, matte weathered materials, not cartoon, not glossy, no painterly brush strokes."
)
HOUSE_STYLE = ("Third attached image = a townhouse asset we already approved: match its materials and rendering style exactly, "
               "but the design must be clearly DIFFERENT from it. ")
JOBS = {
    'house_b': dict(crop=(0.80, 0.22, 1.0, 0.62), size='square', ref='house', extra=HOUSE_STYLE,
        desc="BUILDING: a WIDE medieval half-timbered house, about twice as wide as it is deep, eaves side facing the viewer. Dark rubble-stone ground floor with a plank door "
             "near one end, a low round-arched cart doorway at the other end and two small windows; jettied half-timbered upper storey with dark weathered timber and "
             "grey-brown plaster, a row of four small leaded windows (two lit warm amber); long steep dark slate roof with a slightly sagging ridge, two small dormers and "
             "two stone chimneys."),
    'house_c': dict(crop=(0.80, 0.22, 1.0, 0.62), size='portrait', ref='house', extra=HOUSE_STYLE,
        desc="BUILDING: a TALL NARROW medieval half-timbered townhouse with its gable end facing the viewer. Dark rubble-stone ground floor with a plank door and a "
             "shop window with a wooden shutter-counter; two jettied half-timbered upper storeys, each stepping out a little further, with close-set dark timber studs, "
             "cross braces and grey-brown plaster; leaded windows (three lit warm amber); a very steep dark slate gable roof with carved bargeboards and a hoist beam at "
             "the gable peak; one stone chimney at the side."),
    'house_d': dict(crop=(0.80, 0.22, 1.0, 0.62), size='square', ref='house', extra=HOUSE_STYLE,
        desc="BUILDING: a medieval INN-like corner house with an L-shaped plan: a two-storey main wing and a lower side wing meeting at a right angle. Dark rubble-stone "
             "ground floor with a wide plank door under a small slate porch roof on timber posts and a few small windows; half-timbered upper storey with dark weathered "
             "timber and grey-brown plaster; two steep dark slate roofs meeting in a valley, one dormer, a large stone chimney; an external wooden stair with a railing "
             "leading to an upper door on the side wing; leaded windows, three lit warm amber."),
    'well': dict(crop=(0.29, 0.38, 0.43, 0.62), size='square', extra="",
        desc="PROP: the roofed stone well from the reference. A round wall of weathered grey stone blocks about waist high on a wider stone step; two stout dark timber "
             "posts carrying a small steep slate-covered gable roof; a wooden windlass with an iron crank between the posts, a rope and a wooden bucket with iron hoops."),
    'stall': dict(crop=(0.76, 0.38, 1.0, 0.68), size='square', extra="",
        desc="PROP: ONE medieval market stall from the reference. A sturdy dark timber frame with four posts; a sagging dark wine-red canvas awning, patched and faded; "
             "a plank counter with baskets of apples, turnips and bread and a few clay jugs; a shelf at the back; two burlap sacks and one small barrel at the side. "
             "No people."),
    'lamp': dict(crop=(0.92, 0.24, 1.0, 0.72), size='portrait', extra="",
        desc="PROP: ONE tall cast-iron street lamp post from the reference. A stepped square stone-and-iron base, a slender fluted black iron column with a decorative "
             "collar, two small scroll brackets under the lantern, a four-sided glass lantern with an iron frame and a small pointed cap with a finial; the glass is "
             "warm amber. Dark weathered iron with slight rust."),
    'statue': dict(crop=(0.40, 0.20, 0.47, 0.42), size='portrait', extra="",
        desc="PROP: the stone statue on a pedestal from the reference. A robed, hooded saint-like figure in weathered pale grey stone, standing, one hand raised, the "
             "other holding a closed book; simple carved folds, mossy stains; on a tall square stone pedestal with a moulded cap and base. No inscription text."),
}


def run(key):
    job = JOBS[key]
    im = Image.open(PROTO).convert('RGB')
    w, h = im.size
    x0, y0, x1, y1 = job['crop']
    crop = im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
    k = 1024 / max(crop.size)
    crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    cpath = os.path.join(WORK, key + '_crop.jpg')
    crop.save(cpath, quality=92)
    ppath = os.path.join(WORK, 'proto.jpg')
    im.save(ppath, quality=90)
    prompt = COMMON.format(desc=job['desc'], extra=job.get('extra', ''))
    prompt += "\nImage shape: square." if job['size'] == 'square' else "\nImage shape: portrait (taller than wide, about 2:3)."
    open(os.path.join(OUT, key + '_提示词.txt'), 'w', encoding='utf-8').write(prompt)
    refs = ['-i', cpath, '-i', ppath]
    if job.get('ref'):
        refs += ['-i', os.path.join(WORK, job['ref'] + '_in.png')]
    stamp = time.time()
    r = subprocess.run([CODEX, 'exec', '--skip-git-repo-check', '-s', 'read-only', '-C', WORK, '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"'] + refs + ['-'],
                       input=prompt.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
    home = os.path.expanduser('~/.codex/generated_images')
    new = [p for p in glob.glob(os.path.join(home, '**', '*.png'), recursive=True) if os.path.getmtime(p) > stamp]
    if not new:
        print(key, 'NO IMAGE', r.returncode, r.stdout.decode('utf-8', 'replace')[-500:], flush=True)
        return
    dst = os.path.join(OUT, key + '.png')
    shutil.copyfile(max(new, key=os.path.getmtime), dst)
    print(key, 'ok', Image.open(dst).size, round(time.time() - stamp), 's', flush=True)


for key in sys.argv[1:]:
    run(key)
print('ALL DONE', flush=True)
