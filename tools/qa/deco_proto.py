# -*- coding: utf-8 -*-
"""野外装饰按 GPT 原型摆放(2026-11-08 用户:「装饰摆放还是不够好,让 GPT 出原型图,然后照着摆放,就不会很乱 / 不合理」)。

流程:
  1. base:按区块渲染「只有地面 / 路 / 地标 / 怪群圈、没有零散装饰」的底图(生成器离线渲染,像素 ↔ 世界坐标精确对应);
  2. sheet:我们实际有的装饰件清单(缩略图 + 编号),GPT 只能用这些;
  3. gen:Codex 以底图为构图、清单为素材,出「摆好装饰」的同构图原型;
  4. 照原型逐件读位置 → 写进 tools/qa/deco_hand/<图>_<区块>.json(像素坐标 + 件号 + 宽),生成器换算成世界坐标替代该区块的随机散布。

用法:python tools/qa/deco_proto.py base|sheet|gen <gray|city> <区块名>
输出 %TEMP%/lootchain-qa/deco_proto/<图>_<区块>_{base,proto}.png、<图>_sheet.png
"""
import glob
import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_proto_gen import GEN, codex_exe, other_codex_exec  # noqa: E402

OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'deco_proto')
HAND = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deco_hand')
SCALE = 0.25  # 底图 1 像素 = 4 世界单位(6000×4000 区块 → 1500×1000)

# 区块:世界坐标 (x0, y0, x1, y1),3:2
REGIONS = {
    # 荒原:3 列 × 2 行,每块 6000×4000(最上沿 3500~4500 崖台带不动)
    'gray': {
        'w1': (-9000, -500, -3000, 3500), 'w2': (-9000, -4500, -3000, -500),
        'c1': (-3000, -500, 3000, 3500), 'c2': (-3000, -4500, 3000, -500),
        'e1': (3000, -500, 9000, 3500), 'e2': (3000, -4500, 9000, -500),
    },
    # 主城:城墙内 3 列 × 2 行,每块 4650×3100(城墙带不动)
    'city': {
        'w1': (-6975, 0, -2325, 3100), 'w2': (-6975, -3100, -2325, 0),
        'c1': (-2325, 0, 2325, 3100), 'c2': (-2325, -3100, 2325, 0),
        'e1': (2325, 0, 6975, 3100), 'e2': (2325, -3100, 6975, 0),
    },
}

# 装饰件清单(编号 → 素材, 默认显示宽, 中文名):GPT 只能从这里挑
DECO = {
    'gray': [
        ('A', 'ui/world/gray4/gray4_boulders_l', 520, '大岩块群'),
        ('B', 'ui/world/gray4/gray4_boulders_m', 300, '中岩块'),
        ('C', 'ui/world/gray4/gray4_rock_pillar', 480, '风蚀石柱'),
        ('D', 'ui/world/fld_dead_tree', 360, '枯树'),
        ('E', 'ui/world/gray4/gray4_scrub', 200, '枯灌木'),
        ('F', 'ui/world/gray4/gray4_dry_grass', 130, '枯草丛'),
        ('G', 'ui/world/gray4/gray4_stones', 150, '碎石'),
        ('H', 'ui/world/gray4/gray4_bones', 280, '兽骨'),
        ('I', 'ui/world/gray4/gray4_crates', 250, '木箱木桶'),
        ('J', 'ui/world/gray4/gray4_barricade', 330, '拒马'),
        ('K', 'ui/world/gray4/gray4_cart', 320, '手推车'),
        ('L', 'ui/world/gray4/gray4_spoil_heap', 420, '碎石堆'),
    ],
}
DECO['city'] = [
    ('A', 'ui/world/city4/city4_house_a', 700, '石屋'), ('B', 'ui/world/city4/city4_house_b', 680, '木筋屋'),
    ('C', 'ui/world/city4/city4_house_c', 700, '红瓦屋'), ('D', 'ui/world/city4/city4_house_d', 520, '窄高屋'),
    ('E', 'ui/world/city4/city4_house_e', 820, '联排屋'), ('F', 'ui/world/city4/city4_house_f', 720, '铺面屋'),
    ('G', 'ui/world/vil3/vil3_tree_oak', 540, '橡树'), ('H', 'ui/world/vil3/vil3_tree_pine', 420, '松树'),
    ('I', 'ui/world/vil3/vil3_bush', 190, '灌木'), ('J', 'ui/world/city4/city4_planter', 260, '花箱'),
    ('K', 'ui/world/city4/city4_barrels', 220, '木桶'), ('L', 'ui/world/city4/city4_bench', 230, '长椅'),
    ('M', 'ui/world/city4/city4_hedge', 420, '绿篱'), ('N', 'ui/world/city4/city4_well', 300, '水井'),
]
GEN_MOD = {'gray': 'gray_v4_gen', 'city': 'city_v4_gen'}
RES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'resources')


def font(n):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', n)


def render_base(mp, region):
    G = importlib.import_module(GEN_MOD[mp])
    L, g = G.generate()
    x0, y0, x1, y1 = REGIONS[mp][region]
    keep = dict(L)
    keep['tall'] = []
    keep['low'] = []
    keep['stands'] = [s for s in L['stands'] if not s.get('theme') and not s.get('house')]
    full = G.render_preview(keep, g, scale=SCALE, marks=False)
    W, H = full.size
    px0 = int((x0 + G.MAP_W / 2) * SCALE)
    py0 = int((G.MAP_H / 2 - y1) * SCALE)
    crop = full.crop((px0, py0, px0 + int((x1 - x0) * SCALE), py0 + int((y1 - y0) * SCALE))).convert('RGB')
    # 怪群活动圈画成淡红虚线椭圆(告诉 GPT 圈内留空)
    dr = ImageDraw.Draw(crop)
    for c in L.get('camps', []):
        r = G.camp_radius(c)
        cx, cy = (c['x'] - x0) * SCALE, (y1 - c['y']) * SCALE
        rx, ry = r * SCALE, r * 0.8 * SCALE
        for a in range(0, 360, 12):
            import math
            p = (cx + math.cos(math.radians(a)) * rx, cy + math.sin(math.radians(a)) * ry)
            q = (cx + math.cos(math.radians(a + 6)) * rx, cy + math.sin(math.radians(a + 6)) * ry)
            dr.line([p, q], fill=(210, 70, 60), width=2)
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f'{mp}_{region}_base.png')
    crop.save(p)
    print(p, crop.size)
    return p


def render_sheet(mp):
    items = DECO[mp]
    tw, th = 220, 250
    cols = 6
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * th), (200, 200, 200))
    dr = ImageDraw.Draw(sheet)
    for i, (code, asset, w, name) in enumerate(items):
        im = Image.open(os.path.join(RES, asset + '.png')).convert('RGBA')
        im.thumbnail((tw - 30, th - 60))
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.paste(im, (x + (tw - im.width) // 2, y + 46 + (th - 60 - im.height) // 2), im)
        dr.text((x + 8, y + 6), code, fill=(160, 20, 20), font=font(30))
    p = os.path.join(OUT, f'{mp}_sheet.png')
    sheet.save(p)
    print(p)
    return p


PROMPT = (
    'Image 1 is a top-down screenshot of one area of our game map (realistic aerial style). It currently has the ground, dirt roads, '
    'a few big landmarks and NO small decorations. The faint red dashed ellipses are monster arenas. Image 2 is the ONLY set of '
    'decoration objects you may use (each labelled with a letter; same art style and viewing angle).\n'
    'Generate ONE new image with your image generation tool: the SAME image 1 - identical framing, ground, roads, landmarks, scale '
    'and position of everything - with decorations from image 2 added, arranged the way a skilled level designer would dress a '
    '{theme}: objects in natural groups (big rock + medium rock + stones + dry grass at its foot; dead tree with scrub and grass '
    'around the roots; bones near monster arenas), groups placed along cliff edges, road shoulders, around landmarks and in '
    'corners, with clear empty space between groups so the ground stays readable. Keep the roads, road shoulders, the inside of the '
    'red ellipses and the space in front of tents / gates completely clear. Objects keep the same size relative to the map as in a '
    'real game (a boulder group about as wide as a road). Do not add any object that is not in image 2, no new buildings, no '
    'people. You may erase the red ellipse lines. Same size as image 1. No text.'
)
THEME = {'gray': 'semi-arid grey limestone wasteland', 'city': 'sunny medieval city district'}
PROMPT_CITY = (
    'Image 1 is a top-down screenshot of one district of the capital city in our game (realistic aerial style). It has the paved streets, '
    'the big landmark buildings, city walls / canal and townspeople, but NO ordinary houses, trees or street props yet. Image 2 is the '
    'ONLY set of objects you may add (each labelled with a letter; same art style and viewing angle): townhouses A-F, trees G-H, '
    'small props I-N. '
    'Generate ONE new image with your image generation tool: the SAME image 1 - identical framing, streets, landmarks, walls, '
    'canal and people, same scale and positions - with objects from image 2 added the way a skilled level designer would build a '
    'believable medieval city block: townhouses in neat rows / small terraces along the streets with their fronts facing the street '
    '(never standing in the street), back gardens and courtyards with a few trees behind them, planters / barrels / benches '
    'against house fronts and around squares, a few trees lining wider streets and the canal bank, small green corners. Keep every '
    'street and square fully walkable and clear, keep a clear space around every person, do not cover the landmark buildings. '
    'Houses keep a realistic size relative to the streets (a house front about 1.5 times the street width). Do not add anything '
    'not in image 2. Same size as image 1. No text.'
)


def gen(mp, region):
    base = os.path.join(OUT, f'{mp}_{region}_base.png')
    sheet = os.path.join(OUT, f'{mp}_sheet.png')
    dst = os.path.join(OUT, f'{mp}_{region}_proto.png')
    while other_codex_exec() > 0:
        time.sleep(10)
    before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-deco-')
    cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"', '--skip-git-repo-check', '-s', 'read-only',
           '-C', work, '-i', base, '-i', sheet, '-']
    t0 = time.time()
    prompt = PROMPT_CITY if mp == 'city' else PROMPT.format(theme=THEME[mp])
    r = subprocess.run(cmd, input=prompt.encode('utf-8'), capture_output=True, timeout=1200)
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(GEN) if d not in before]
    mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
    imgs = [p for d in mine for p in glob.glob(os.path.join(GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', text[-400:])
        return
    shutil.copy(max(imgs, key=os.path.getmtime), dst)
    print('ok', dst, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    cmd, mp = sys.argv[1], sys.argv[2]
    if cmd == 'base':
        for r in (sys.argv[3:] or list(REGIONS[mp])):
            render_base(mp, r)
    elif cmd == 'sheet':
        render_sheet(mp)
    elif cmd == 'gen':
        for r in (sys.argv[3:] or list(REGIONS[mp])):
            if not os.path.exists(os.path.join(OUT, f'{mp}_{r}_proto.png')):
                gen(mp, r)
