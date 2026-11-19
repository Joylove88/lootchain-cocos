# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期:整城新建筑的单体设定图(本机 Codex 订阅生图,一张约 1~2 分钟;给用户确认,确认后才拿去 Tripo 转 3D)。

  python tools/proto3d/pre25/city_bld_concepts.py <键> [<键> …]      键见 JOBS;不给 = 全部

参考图:① 从整城原型(周报截图/2026-11-19_整城布局原型/02_整城原型_视角D.png)裁出的那一块;② 整张原型(看风格);
③ 已经转过 3D、用户认可的民房设定图(统一材质和画法)。提示词沿用主城第一批设定图的口径(bld_concept_gen.py):
只画这一样东西、整个完整、左前方四分之三、浅灰底、均匀的阴天光、不要街道人物、亮着的窗只留平的琥珀色。
产物:周报截图/2026-11-19_整城布局原型/建筑设定图/<键>.png + <键>_提示词.txt
"""
import glob
import os
import shutil
import subprocess
import sys
import time

from PIL import Image

ROOT = 'D:/project/lootchain-cocos'
PROTO = ROOT + '/周报截图/2026-11-19_整城布局原型/02_整城原型_视角D.png'
STYLE = ROOT + '/周报截图/2026-11-17_主城3D小样/建筑设定图/house.png'
OUT = ROOT + '/周报截图/2026-11-19_整城布局原型/建筑设定图/'
WORK = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'citybld')
BIN = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
CODEX = max(glob.glob(os.path.join(BIN, '*', 'codex.exe')), key=os.path.getmtime)
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

COMMON = (
    "Use the image generation tool and produce exactly ONE image. Do not write any files, do not run commands.\n\n"
    "The first attached image is a crop from our own game concept art of a medieval dark-fantasy city (second attached image = the full concept, for style; "
    "third attached image = a townhouse asset we already approved, match its materials and rendering style). "
    "Draw ONLY the building or prop described below as a single isolated 3D game-asset concept in exactly that style: "
    "same kind of architecture, same materials, same level of weathered detail.\n\n"
    "{desc}\n\n"
    "Framing: the WHOLE object is visible and complete, nothing cropped, with a small margin around it; three-quarter view from the front-left, "
    "camera slightly above eye level, object centered. Plain flat light-grey studio background (#b8b8b8), nothing else in the picture: "
    "no street, no ground texture beyond a thin neutral base under the object, no other buildings, no trees, no people, no sky, no moon, no text, no UI.\n"
    "Lighting: soft, even, neutral overcast studio light so every surface is readable; no strong cast shadows, no night tint, no fog, no bloom or glow halos. "
    "Windows or lamp glass that are lit stay warm amber, but as flat coloured glass without light spill.\n"
    "Style: realistic dark-fantasy game asset, matte weathered materials, not cartoon, not glossy, no painterly brush strokes."
)

# 裁图框 = 整城原型(1672 × 941)上的像素
JOBS = {
    'academy': dict(crop=(280, 30, 640, 330), size='square',
        desc="BUILDING: the IMPERIAL ACADEMY, a stone college building. A long two-storey main hall of dressed grey stone with tall pointed-arch windows "
             "(several lit warm amber), an arcade of round arches along the ground floor, steep dark slate roofs with small dormers and stone gables, and a square "
             "CLOCK TOWER rising from the middle with a clock face on each side, a belfry with louvred openings and a tall pointed slate spire with a finial. "
             "Two short side wings frame the front. No courtyard garden, no surrounding walls."),
    'guild': dict(crop=(200, 400, 570, 650), size='square',
        desc="BUILDING: the MERCENARY GUILD HALL, a large and imposing half-timbered hall. A heavy rubble-stone ground floor with a wide round-arched double door "
             "reached by three stone steps, two iron wall lanterns beside the door; two half-timbered upper storeys with dark weathered timber and grey-brown plaster, "
             "rows of leaded windows (some lit warm amber); two long dark red cloth banners with a simple crossed-swords emblem hanging from the upper storey; "
             "a very steep dark slate roof with two big gables and two stone chimneys."),
    'tavern': dict(crop=(410, 600, 670, 830), size='square',
        desc="BUILDING: the GOLDEN WHEAT TAVERN, a cosy two-storey half-timbered inn. Rubble-stone ground floor with a wide plank door, big leaded windows glowing warm "
             "amber, a few barrels and crates stacked beside the door; jettied half-timbered upper storey; steep dark slate roof with two dormers and a large stone "
             "chimney; an iron bracket holding a hanging wooden sign painted with a golden wheat sheaf (no letters)."),
    'stable': dict(crop=(560, 540, 800, 720), size='square',
        desc="BUILDING: a medieval STABLE, a long low timber building open on the front side: a row of five horse stalls with plank partitions and half-doors, "
             "dark timber posts carrying a long sloping dark slate roof, straw on the floor, a hay loft with a small hatch above, a water trough and a few sacks "
             "and hay bales in front. No horses, no people."),
    'barracks': dict(crop=(1200, 220, 1480, 390), size='square',
        desc="BUILDING: the ROYAL BARRACKS, a long sober two-storey building of grey dressed stone with a dark slate roof, small barred windows (a few lit warm amber), "
             "a heavy timber gate in the middle under a round stone arch, two tall flagpoles with long dark red pennants, a weapon rack with spears and a stack "
             "of shields beside the gate."),
    'gate': dict(crop=(1090, 690, 1260, 850), size='square',
        desc="BUILDING: a CITY GATEHOUSE, a stout square stone tower straddling a passage: a tall round-arched gateway with a raised iron portcullis and open heavy "
             "timber doors, crenellated battlements on top with a small pointed slate roof, arrow slits, two iron lanterns flanking the arch, and a short stub of "
             "crenellated city wall on each side (cut cleanly, so wall segments can be attached)."),
    'wall': dict(crop=(10, 380, 300, 560), size='landscape',
        desc="MODULAR PIECE: a STRAIGHT SECTION of the city wall, about 12 metres long and 6 metres high, made of weathered grey stone blocks, with a crenellated "
             "parapet and a narrow wall-walk on top, a few drain holes and moss stains; both ends cut perfectly flat and vertical so sections can be lined up. Nothing else."),
    'wall_tower': dict(crop=(10, 380, 300, 560), size='square',
        desc="MODULAR PIECE: a round CORNER TOWER of the city wall in the same weathered grey stone, a little taller than the wall, with a crenellated top, arrow "
             "slits and a stub of wall leaving at a right angle on two sides (cut cleanly)."),
    'bridge': dict(crop=(990, 610, 1200, 770), size='landscape',
        desc="STRUCTURE: an arched STONE BRIDGE over a canal: one wide round arch of dressed grey stone, a gently humped deck paved with flagstones, low stone "
             "parapets with capstones, a small iron lamp post at each of the four corners (glass warm amber). The bridge ends are cut flat where they meet the canal "
             "banks. No water, no people."),
    'dock': dict(crop=(1450, 390, 1640, 520), size='landscape',
        desc="STRUCTURE: a small wooden canal DOCK: a plank pier on dark timber piles about 10 metres long with a short side landing, mooring posts with coiled rope, "
             "a few crates and barrels, and ONE small wooden rowing boat moored beside it. No water surface, no people."),
}


def run(key):
    job = JOBS[key]
    im = Image.open(PROTO).convert('RGB')
    crop = im.crop(job['crop'])
    k = 1024 / max(crop.size)
    crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    cpath = os.path.join(WORK, key + '_in.jpg')
    crop.save(cpath, quality=92)
    ppath = os.path.join(WORK, 'proto_full.jpg')
    im.save(ppath, quality=90)
    spath = os.path.join(WORK, 'style_house.png')
    if not os.path.exists(spath):
        st = Image.open(STYLE).convert('RGB')
        st.thumbnail((1024, 1024))
        st.save(spath)
    prompt = COMMON.format(desc=job['desc'])
    prompt += {'square': '\nImage shape: square.', 'landscape': '\nImage shape: landscape (wider than tall, about 3:2).',
               'portrait': '\nImage shape: portrait (taller than wide, about 2:3).'}[job['size']]
    open(os.path.join(OUT, key + '_提示词.txt'), 'w', encoding='utf-8').write(prompt)
    refs = ['-i', cpath, '-i', ppath, '-i', spath]
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


for key in (sys.argv[1:] or list(JOBS)):
    run(key)
print('ALL DONE', flush=True)
