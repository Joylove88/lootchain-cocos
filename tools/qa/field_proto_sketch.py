# -*- coding: utf-8 -*-
"""灰岩荒原 / 主城 重做(11-08)鸟瞰原型的布局草图:给 Codex 当构图参考(-i),也给用户看分区。

用法:python tools/qa/field_proto_sketch.py   → %TEMP%/lootchain-qa/field_proto/sketch_gray.png / sketch_city.png
坐标 = 原型像素(2000 宽,y 向下);落地时按 世界 = (px - CX) * S 换算(同 woods_def_gen)。
"""
import os
import tempfile

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_proto')

GRAY = {
    'size': (2000, 1000),
    'bg': (150, 132, 108),
    'roads': [
        [(0, 520), (230, 560), (520, 500), (700, 530), (800, 560), (1050, 500), (1350, 470), (1650, 380), (1840, 260)],
        [(520, 500), (470, 640), (400, 780)],
        [(800, 560), (900, 420), (980, 300)],
        [(1050, 500), (1150, 640), (1250, 760)],
        [(1350, 470), (1320, 380), (1300, 330)],
        [(1350, 470), (1480, 600), (1600, 700)],
    ],
    'river': [(640, 0), (700, 250), (690, 530), (760, 780), (720, 1000)],
    'zones': [
        ('WANDERER OUTPOST (safe, waypoint)', (230, 560), 120, 80, (120, 170, 120)),
        ('CRACKED BASIN (hound packs)', (400, 790), 170, 110, (190, 160, 110)),
        ('BANDIT WATCHPOST', (980, 290), 110, 70, (170, 90, 70)),
        ('BANDIT FORT', (1250, 770), 160, 100, (170, 90, 70)),
        ('ANCIENT RUINS (gargoyle elite)', (1300, 320), 140, 90, (130, 130, 150)),
        ('SMUGGLER OPEN-PIT MINE (dark crystals)', (1610, 710), 170, 110, (90, 90, 120)),
        ('COLOSSUS ARENA (boss)', (1830, 230), 130, 100, (110, 60, 60)),
    ],
    'labels': [('DRY RIVERBED / CANYON', (700, 140)), ('STONE BRIDGE', (705, 560)), ('MESAS & CLIFFS', (1000, 40)),
               ('MESAS & CLIFFS', (1000, 965)), ('EXIT -> CITY', (40, 490))],
}

CITY = {
    'size': (2000, 1150),
    'bg': (110, 110, 112),
    'roads': [
        [(1000, 560), (1000, 230)],
        [(1000, 560), (650, 1150)],
        [(1000, 560), (2000, 700)],
        [(1000, 560), (300, 560)],
        [(1000, 560), (450, 260)],
        [(1000, 560), (1550, 240)],
        [(1000, 560), (450, 880)],
        [(1000, 560), (1450, 900)],
    ],
    'river': [],
    'zones': [
        ('CENTRAL PLAZA + BRASS COMPASS (waypoint)', (1000, 560), 170, 110, (190, 170, 120)),
        ('NOTICE BOARD', (1200, 610), 40, 25, (200, 180, 90)),
        ('ADVENTURE GATE', (1000, 190), 150, 80, (120, 120, 160)),
        ('SUMMON TEMPLE', (450, 240), 130, 80, (120, 120, 160)),
        ('TRIAL TOWER', (1550, 220), 110, 90, (120, 120, 160)),
        ('HERO CAMP', (290, 560), 130, 80, (120, 160, 120)),
        ('GUARD CRYSTAL', (1250, 450), 60, 50, (90, 160, 200)),
        ('FORGE', (1700, 560), 130, 80, (190, 110, 70)),
        ('TRADE HOUSE / MARKET', (450, 890), 140, 80, (170, 150, 100)),
        ('MERCENARY GUILD', (850, 930), 120, 70, (170, 90, 70)),
        ('HALL OF HEROES', (1450, 910), 140, 80, (150, 130, 170)),
    ],
    'labels': [('CITY WALL', (1000, 40)), ('SOUTH GATE -> WOODS', (650, 1110)), ('EAST GATE -> WASTELAND', (1830, 660)),
               ('houses / gardens / trees fill gaps', (1000, 1060))],
}


# 11-08 用户:功能都在终端了,主城不放功能建筑,改放任务 NPC / 活人 NPC / 地区商店 NPC → 有机街区布局
CITY2 = {
    'size': (2000, 1150),
    'bg': (120, 116, 108),
    'roads': [
        [(0, 520), (300, 560), (620, 540), (900, 580), (1250, 640), (1600, 620), (2000, 640)],
        [(900, 580), (870, 400), (950, 160)],
        [(900, 580), (780, 800), (650, 1150)],
        [(900, 580), (1100, 420), (1300, 320)],
        [(900, 580), (700, 420), (600, 330)],
        [(1250, 640), (1300, 820), (1450, 960)],
        [(620, 540), (500, 760)],
    ],
    'river': [(0, 900), (400, 880), (800, 930), (1200, 900), (1600, 950), (2000, 920)],
    'zones': [
        ('PLAZA: compass waypoint + notice board', (900, 590), 150, 95, (190, 170, 120)),
        ('CATHEDRAL (landmark)', (950, 150), 140, 70, (150, 150, 160)),
        ('MERCENARY GUILD (bounty NPC)', (600, 320), 120, 70, (170, 110, 80)),
        ('ACADEMY / LIBRARY (scholar NPC)', (1300, 310), 130, 70, (130, 130, 170)),
        ('MARKET STREET (shop NPCs, stalls)', (1260, 700), 170, 70, (180, 150, 90)),
        ('TAVERN (rumor NPC)', (480, 770), 110, 60, (150, 110, 70)),
        ('BARRACKS + EAST GATE (guard captain)', (1820, 600), 140, 80, (120, 120, 120)),
        ('PARK', (230, 380), 120, 90, (100, 140, 90)),
        ('DOCKS / CANAL BRIDGES', (1450, 960), 120, 50, (110, 120, 140)),
    ],
    'labels': [('CITY WALL', (1000, 40)), ('SOUTH GATE -> WOODS', (650, 1110)), ('EAST GATE -> WASTELAND', (1850, 700)),
               ('CANAL', (300, 930)), ('irregular residential blocks fill the rest', (1600, 450))],
}


# 11-09 第二步第一张:枯木林(Lv.20–30,docs/50 §5.3 / docs/59 第 3 章「古树枯死、精灵守望者、古树低语」);西口接灰岩荒原
DEAD = {
    'size': (2000, 1000),
    'bg': (78, 72, 60),
    'roads': [
        [(0, 520), (260, 540), (520, 480), (780, 520), (1000, 470), (1250, 520), (1500, 460), (1720, 420), (1880, 330)],
        [(520, 480), (470, 300), (420, 180)],
        [(520, 480), (560, 680), (480, 820)],
        [(1000, 470), (1020, 300), (1060, 170)],
        [(1000, 470), (960, 650), (1000, 820)],
        [(1250, 520), (1350, 680), (1420, 800)],
        [(1500, 460), (1480, 300)],
    ],
    'river': [(780, 1000), (820, 760), (760, 560), (860, 330), (820, 0)],
    'zones': [
        ('ELVEN WARDEN CAMP (safe, waypoint)', (230, 560), 120, 80, (110, 150, 120)),
        ('WITHERED GIANT-TREE GROVE (tree stalkers)', (420, 190), 170, 100, (110, 90, 70)),
        ('BLACK MUD BOG, poison mist (spiders)', (470, 830), 180, 110, (60, 75, 55)),
        ('RAVEN CRAG (bats, ravens)', (1060, 160), 140, 80, (100, 100, 100)),
        ('OLD GRAVEYARD + RUINED CHAPEL', (1000, 830), 170, 100, (120, 115, 120)),
        ('ABANDONED WOODCUTTER HAMLET (infected)', (1420, 800), 150, 90, (120, 100, 80)),
        ('WHISPERING STONE CIRCLE (stele fragments)', (1480, 280), 120, 80, (130, 130, 150)),
        ('WITCH HOLLOW: huge dead world-tree (boss)', (1840, 330), 140, 110, (90, 60, 80)),
    ],
    'labels': [('BLACK CREEK', (800, 60)), ('ROOT BRIDGE', (790, 520)), ('EXIT -> WASTELAND', (40, 490)),
               ('dense dead forest edges', (1000, 970)), ('dense dead forest edges', (1300, 40))],
}


def font(size):
    for f in ('C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def draw(spec, name):
    w, h = spec['size']
    im = Image.new('RGB', (w, h), spec['bg'])
    d = ImageDraw.Draw(im)
    if spec['river']:
        d.line(spec['river'], fill=(95, 80, 60), width=60, joint='curve')
    for line in spec['roads']:
        d.line(line, fill=(205, 190, 160), width=34, joint='curve')
    f = font(22)
    for label, (x, y), rx, ry, col in spec['zones']:
        d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=col, outline=(30, 30, 30), width=3)
        d.text((x, y), label, fill=(15, 15, 15), font=f, anchor='mm')
    for label, (x, y) in spec['labels']:
        d.text((x, y), label, fill=(25, 25, 25), font=f, anchor='lm' if x < 100 else 'mm')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'sketch_{name}.png')
    im.save(path)
    print(path)


if __name__ == '__main__':
    draw(GRAY, 'gray')
    draw(CITY, 'city')
    draw(CITY2, 'city2')
    draw(DEAD, 'dead')
