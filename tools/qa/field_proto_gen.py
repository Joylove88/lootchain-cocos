# -*- coding: utf-8 -*-
"""灰岩荒原 / 主城 重做(11-08)鸟瞰原型:Codex 桌面版命令行出图。

用法:python tools/qa/field_proto_gen.py <名字> [<名字> ...]   名字见 JOBS;已存在的跳过(删掉重出)
输出 %TEMP%/lootchain-qa/field_proto/<名字>.png

和别的会话共用 Codex 时不串图:
- 开跑前等到没有别的 `codex.exe exec` 进程(别的会话按「最新一张」取图,同时跑会被它拿走);
- 只认本次调用新建的 generated_images/<会话> 目录。
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources')
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_proto')
GEN = os.path.expanduser('~/.codex/generated_images')

STYLE = (
    'Render it in exactly the same style, camera angle (top-down 3/4 bird\'s-eye, slight perspective), scale of objects and level '
    'of detail as the FIRST reference image (a finished map overview of the same game): realistic hand-painted dark-fantasy ARPG '
    'map, natural light from the upper left, soft cast shadows, crisp fine detail. Not cartoon, no saturated colors, no noise or '
    'film grain, no glow spam. Wide 2:1 landscape image, fill the whole frame edge to edge (no border, no frame, no vignette '
    'box). Absolutely NO text, NO labels, NO icons, NO UI, NO characters or monsters.'
)

# 11-08 用户:「AI 感还是比较强,需要更写实,更细腻」→ 不再给旧鸟瞰图当画风参考(那批本身就有 AI 味),
# 改成「真实航拍照片」口径:自然漫射光、低饱和真实材质、风化脏旧、尺度真实、布局不对称、不堆金边发光
REAL = (
    'IMPORTANT STYLE: it must look like a real high-resolution oblique aerial drone PHOTOGRAPH (about 50 degrees down) of a real '
    'place, not an illustration. Photographic realism: true-to-life materials and weathering (dust, mud, moss, stains, worn '
    'edges), natural soft daylight with gentle shadows, realistic muted color palette, realistic object scale (a person would be '
    'tiny), irregular organic placement, no repetition, no symmetry, no ornamental gold trim, no glowing effects, no outlines, no '
    'over-sharpening, no painterly brush strokes, no fantasy-game look. Fine natural detail everywhere, like a 50 megapixel '
    'photo. Wide 2:1 landscape, fill the whole frame edge to edge. Absolutely NO text, NO labels, NO UI, NO people.'
)

JOBS = {
    'gray_r1': (['SKETCH:gray'], (
        'Oblique aerial photograph of a grey limestone badlands / semi-desert plateau (think Spanish Bardenas Reales, Utah badlands '
        'and Cappadocia mixed), used as a game zone. Follow the reference image (a rough layout sketch) for where every area and '
        'road goes; the colored ellipses are only zone markers, do not draw ellipses. Ground: pale grey and grey-beige cracked '
        'earth, gravel, sparse dry grass and thorny scrub, a few dead gnarled trees, scattered grey boulders, eroded rock pillars. '
        'Top and bottom edges: grey layered mesas and cliffs. A dry riverbed gorge runs north-south, crossed by a weathered old '
        'stone arch bridge on the main road. Dirt tracks with wheel ruts link the areas. Areas: west - a small travellers\' camp '
        '(a few dusty canvas tents, two wooden wagons, crates, a low fence, a ring of old flat stones on the ground); south-west - '
        'a flat cracked clay basin with bleached animal bones; north-center - a crude wooden watchtower and barricades; '
        'south-center - a log palisade fort with a gate and tents inside; north-east - ruined stone arches and fallen columns on '
        'an old paved floor; south-east - a terraced open-pit quarry mine with timber scaffolding, ore carts on rails, spoil heaps, '
        'with veins of dark purple-black crystal in the rock; far north-east - a ring of standing stones around a gigantic '
        'collapsed stone statue lying broken in pieces. Leave open flat ground around each area. ' + REAL)),
    # 11-09 枯木林(Lv.20–30):月影森林的古树大片枯死、黑泥沼泽毒雾、旧墓园、精灵守望者营地、女巫的枯死世界树
    'dead_r1': (['SKETCH:dead'], (
        'Oblique aerial photograph of a dying old-growth forest in late autumn, used as a game zone (think the dead spruce forests '
        'of the Harz mountains, Black Forest bark-beetle kill zones and a misty peat bog). Follow the reference image (a rough '
        'layout sketch) for where every area and path goes; the colored ellipses are only zone markers, do not draw ellipses. '
        'Most trees are dead: grey bare trunks, broken snags, fallen logs, a few last brown-orange leaves; the forest is SPARSE '
        'with many open clearings so the ground is clearly visible and walkable. Ground: dark wet soil, black mud, brown dead '
        'grass, fallen leaves, moss, roots, a few pale mushrooms. Low patches of ground fog in hollows. A slow dark creek winds '
        'north-south, crossed by a natural bridge of giant fallen roots on the main path. Muddy forest tracks link the areas. '
        'Areas: west - a small elven ranger camp on a low rise (a few slender pale canvas tents, a carved wooden watch platform, '
        'a fire pit, a circle of old flat stones); north-west - a grove of gigantic withered ancient trees with huge exposed roots; '
        'south-west - a black mud bog with dead reeds, pools of stagnant water and thick webs between dead trees; north-center - '
        'a rocky crag with crows; south-center - an old overgrown graveyard with leaning headstones, an iron fence and a roofless '
        'stone chapel; south-east - an abandoned woodcutter hamlet of a few collapsed timber cottages, stacked logs and a broken '
        'cart; north-east - a ring of tall mossy standing stones; far east - a hollow where one colossal dead world-tree with a '
        'split trunk towers over a crooked witch hut. Leave open flat ground around each area. ' + REAL)),
    'city_r1': (['SKETCH:city2'], (
        'Oblique aerial photograph of a real walled late-medieval capital city district (think Rothenburg, Carcassonne, old '
        'Edinburgh), used as the hub town of a game. Follow the reference image (a rough layout sketch) for where each place and '
        'street goes; the colored ellipses are only markers, do not draw ellipses. Organic irregular street plan with worn '
        'cobblestone streets. Weathered grey and honey-colored stone buildings, dark slate and faded terracotta roofs, timber '
        'framing, chimneys, small courtyards, laundry lines, potted plants. Places: a central cobbled square with a large old '
        'brass compass rose inlaid in the paving and a wooden notice board; a gothic cathedral to the north; a stout mercenary '
        'guild hall with a yard; an academy / library with a cloister; a market street lined with canvas-awning stalls, barrels '
        'and crates; a tavern with outdoor benches; barracks next to the east gate; a small park with old trees; a stone canal '
        'with three bridges and small boats in the south. A thick crenellated city wall with towers around the edge, a gatehouse '
        'in the south wall and one in the east wall, countryside fields just outside. ' + REAL)),
    'city_r2': (['SKETCH:city2'], (
        'Oblique aerial photograph of a real walled northern-European medieval capital (think Tallinn old town and Bruges), '
        'overcast soft light, used as the hub town of a game. Follow the reference image (a rough layout sketch) for where each '
        'place and street goes; the colored ellipses are only markers, do not draw ellipses. Organic irregular street plan with '
        'wet dark cobblestones. Grey granite and whitewashed buildings with steep dark slate and red-brown tile roofs, stepped '
        'gables, chimneys. Places: a central square with a large old brass compass rose inlaid in the paving and a wooden notice '
        'board; a tall cathedral to the north; a mercenary guild hall with a training yard; an academy / library with a cloister; '
        'a market street with stalls; a tavern; barracks by the east gate; a small park; a canal with stone bridges and moored '
        'boats in the south. Thick city wall with round towers, a gatehouse in the south wall and one in the east wall. ' + REAL)),
}

_OLD_JOBS = {
    'gray_a': (['ui/world/overview/ov_woods.png', 'SKETCH:gray'], (
        'Paint a game map overview of "Greyrock Wasteland", a semi-arid level-10-20 zone. Follow the SECOND reference image (a '
        'rough layout sketch) for where every area and road goes; the colored ellipses are only zone markers, do not paint ellipses. '
        'Ground: cracked dry grey-ochre earth, patches of pale gravel, sparse dry grass tufts, dead leafless trees, scattered '
        'boulders, a few tall weathered rock pillars; muted grey / ochre / dusty brown palette. Top and bottom edges: layered '
        'mesas and cliffs closing the map. A dry riverbed canyon runs north-south with an old stone arch bridge where the main '
        'road crosses it. Packed-dirt roads with wheel ruts connect the areas exactly as in the sketch, with a road leaving the '
        'west edge. Areas: (1) west: wanderer outpost - a few canvas tents, two covered wagons, crates, a small wooden palisade, '
        'a campfire and a round stone waypoint platform with faint blue runes; (2) south-west: cracked basin, open flat ground '
        'with animal bones; (3) north-center: bandit watchpost - wooden watchtower, spiked barricades; (4) south-center: bandit '
        'fort - larger timber palisade wall with gate, tents, banners in faded red; (5) north-east-center: ancient ruins - broken '
        'stone arches, toppled columns, cracked paved floor; (6) south-east: smuggler open-pit mine - terraced pit, timber '
        'scaffolding, mine carts on rails, piles of ore, dark purple-black corrupted crystals jutting from the rock; (7) far '
        'north-east: boss arena - a ring of standing stones around an enormous collapsed stone colossus lying in pieces. '
        'Leave open walkable space around each area (they are monster camps). ' + STYLE)),
    'city_a': (['ui/world/overview/ov_village.png', 'SKETCH:city', 'ui/town/hall.png'], (
        'Paint a game map overview of the royal capital city (the main hub town). Follow the SECOND reference image (a rough '
        'layout sketch) for where every building, plaza and street goes; the colored ellipses are only markers, do not paint '
        'ellipses. Building style: follow the THIRD reference image - dark slate-blue stone, gold trim, small blue crystal '
        'lights, red banners (a dark, low-saturation imperial city with a hint of arcane technology). Paved streets of dark grey '
        'flagstone. Center: a large round plaza with a big brass compass inlaid in the pavement and a wooden notice board on its '
        'east side. North: a grand adventure gate building (huge arched portal), a summoning temple with columns, a tall trial '
        'tower. Middle: hero barracks camp (west), a guard crystal on a pedestal (north-east of the plaza), a forge with glowing '
        'furnace and chimneys (east). South: trade house with market stalls, a mercenary guild hall, a hall of heroes with '
        'statues. A crenellated city wall runs around the edge with a south gate (bottom, slightly left) and an east gate '
        '(right edge). Fill the gaps with smaller townhouses, gardens, trees, fountains, carts, lamp posts. Every functional '
        'building must stand clearly apart with a forecourt in front of its door. ' + STYLE)),
    'city_b': (['ui/world/overview/ov_village.png', 'SKETCH:city'], (
        'Paint a game map overview of the royal capital city (the main hub town). Follow the SECOND reference image (a rough '
        'layout sketch) for where every building, plaza and street goes; the colored ellipses are only markers, do not paint '
        'ellipses. Building style: a warm medieval royal capital that clearly belongs to the same world as the village in the '
        'first reference - pale limestone and grey stone walls, dark slate and terracotta roofs, timber details, blue-and-gold '
        'royal banners; daylight, natural colors. Paved streets of worn cobblestone. Center: a large round plaza with a big brass '
        'compass inlaid in the pavement and a wooden notice board on its east side. North: a grand adventure gate (huge arched '
        'stone portal), a summoning temple with columns and a dome, a tall wizard trial tower. Middle: hero barracks with a '
        'training yard (west), a guard crystal - a large blue crystal on a stone pedestal (north-east of the plaza), a forge '
        'with glowing furnace and chimneys (east). South: trade house with colorful market stalls, a mercenary guild hall, a '
        'hall of heroes with statues. A crenellated city wall runs around the edge with a south gate (bottom, slightly left) and '
        'an east gate (right edge). Fill the gaps with townhouses, gardens, trees, fountains, carts, lamp posts. Every '
        'functional building must stand clearly apart with a forecourt in front of its door. ' + STYLE)),
}


def codex_exe():
    base = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
    found = glob.glob(os.path.join(base, '*', 'codex.exe'))
    return max(found, key=os.path.getmtime)


def other_codex_exec():
    out = subprocess.run(['powershell', '-NoProfile', '-Command',
                          "(Get-CimInstance Win32_Process -Filter \"Name='codex.exe'\" | ? { $_.CommandLine -match ' exec ' }).Count"],
                         capture_output=True, text=True).stdout.strip()
    return int(out or 0)


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    os.makedirs(OUT, exist_ok=True)
    for name in sys.argv[1:]:
        dst = os.path.join(OUT, name + '.png')
        if os.path.exists(dst):
            print('skip', name)
            continue
        refs, prompt = JOBS[name]
        paths = [os.path.join(OUT, f'sketch_{r[7:]}.png') if r.startswith('SKETCH:') else os.path.join(RES, r) for r in refs]
        waited = 0
        while other_codex_exec() > 0:
            if waited % 60 == 0:
                print('等别的 Codex 跑完…', flush=True)
            time.sleep(10)
            waited += 10
        before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
        work = tempfile.mkdtemp(prefix='lc-fproto-')
        cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"',
               '--skip-git-repo-check', '-s', 'read-only', '-C', work]
        for p in paths:
            cmd += ['-i', p]
        cmd.append('-')
        t0 = time.time()
        print('gen', name, flush=True)
        r = subprocess.run(cmd, input=prompt.encode('utf-8'), capture_output=True, timeout=1200)
        text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
        new_dirs = [d for d in os.listdir(GEN) if d not in before]
        mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
        imgs = [p for d in mine for p in glob.glob(os.path.join(GEN, d, '*.png'))]
        if not imgs:
            print('FAIL', name, r.returncode, new_dirs, text[-800:])
            continue
        shutil.copy(max(imgs, key=os.path.getmtime), dst)
        print('ok', name, dst, f'{time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
