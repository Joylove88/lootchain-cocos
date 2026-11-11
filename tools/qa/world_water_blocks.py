# -*- coding: utf-8 -*-
"""野外地图水面 / 崖壁挡块(11-03 用户「只要地图可见范围内的应该都能走」):原来手摆的大矩形把河边草地、小棚一起挡了,
林地更是只有走廊能走。改成按贴图像素算:水面(偏蓝 / 白沫)+ 崖石(灰、低饱和)= 不可走,岸边草地 / 土 = 可走;桥面留空。
贴图取自地图定义里 water: true 的贴地件 + ROCK_ASSETS 里的崖壁件(地图定义用 walk_map_overlay.dump_maps 转出来)。
按 CELL 世界单位一格判定(格内过半像素不可走就挡),横向连续格并成一条矩形,写进 LobbyWaterBlocks.ts。
用法:python tools/qa/world_water_blocks.py
"""
import os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk_map_overlay import dump_maps  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyWaterBlocks.ts')
CELL = 40
# 主城 11-11 起是整图场景(可走栅格里已经没有水面),不再出挡块
MAPS = {'VILLAGE': 'VILLAGE_WATER_BLOCKS', 'WOODS': 'WOODS_WATER_BLOCKS', 'GRAY': 'GRAY_WATER_BLOCKS', 'DEADWOOD': 'DEADWOOD_WATER_BLOCKS'}
# 不挂流水着色器、但整块是崖石的贴地件
ROCK_ASSETS = ('vil3_cliff_s',)
# 11-08 灰岩荒原:峡谷段整块不可走(贴图本身就是抠好的谷,按不透明像素算;峡谷是灰色,按颜色判会把两岸龟裂土也算进去)
ALPHA_ASSETS = ('gray4_gorge', 'city4_canal/')  # 主城运河(含两岸石砌堤)整段不可走,石桥按桥面留空
# 矿坑:只有坑心不可走(外圈台阶 / 坑沿能走),按贴图内椭圆算
PIT_ASSETS = ('gray4_quarry_pit', 'dead4_bog_pool', 'city4_pond')
# 11-09 枯木林黑溪:两岸泥岸可走,只有中间水面一条不可走(按贴图不透明像素的中间带算;暗色溪水按颜色判不出来)
CREEK_ASSETS = ('dead4_creek',)
# 桥面(按贴图不透明像素留空):石桥 / 树根桥
BRIDGE_ASSETS = ('bridge', 'dead4_root_tangle')


def alpha_pixels(a):
    return a[..., 3] > 140


def pit_pixels(a):
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    return (a[..., 3] > 140) & ((((xx - w / 2) / (w * 0.36)) ** 2 + ((yy - h * 0.55) / (h * 0.33)) ** 2) <= 1)


def creek_pixels(a):
    h, w = a.shape[:2]
    xx = np.arange(w)[None, :]
    return (a[..., 3] > 140) & (np.abs(xx - w / 2) < w * 0.2)


def load(asset, flip=False):
    path = os.path.join(ROOT, 'assets', 'resources', asset.replace('/spriteFrame', '') + '.png')
    im = Image.open(path).convert('RGBA')
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return np.asarray(im).astype(np.int32)


def blocked_pixels(a):
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(1, mx)
    lum = (r + g + b) / 3
    water = (b > r + 8) | ((lum > 170) & (sat < 0.12))
    rock = (sat < 0.22) & (lum > 55)
    grass = (g > b + 22) & (g >= r - 18) & (sat > 0.22)
    return (al > 140) & (water | rock) & ~grass


def world_grid(prop, map_w, map_h, value_fn):
    a = load(prop['asset'], bool(prop.get('flipX')))
    x, y, width = prop['x'], prop['y'], prop['width']
    h_img, w_img = a.shape[:2]
    height = width * h_img / w_img * (prop.get('tilt') or 1)
    vals = value_fn(a)
    out = {}
    x0, y1 = x - width / 2, y + height / 2
    gx0 = int(np.floor((x0 + map_w / 2) / CELL))
    gx1 = int(np.ceil((x0 + width + map_w / 2) / CELL))
    gy0 = int(np.floor((y1 - height + map_h / 2) / CELL))
    gy1 = int(np.ceil((y1 + map_h / 2) / CELL))
    for gy in range(gy0, gy1):
        for gx in range(gx0, gx1):
            wx0, wy0 = gx * CELL - map_w / 2, gy * CELL - map_h / 2
            px0 = int((wx0 - x0) / width * w_img)
            px1 = int((wx0 + CELL - x0) / width * w_img)
            py0 = int((y1 - (wy0 + CELL)) / height * h_img)
            py1 = int((y1 - wy0) / height * h_img)
            px0, px1 = max(0, px0), min(w_img, px1)
            py0, py1 = max(0, py0), min(h_img, py1)
            if px1 <= px0 or py1 <= py0:
                continue
            out[(gx, gy)] = float(vals[py0:py1, px0:px1].mean())
    return out


def blocks_for(d):
    map_w, map_h = d['width'], d['height']
    flats = [p for p in d['props'] if p.get('flat')]
    blocked = set()
    for p in flats:
        fn = None
        if any(r in p['asset'] for r in ALPHA_ASSETS):
            fn = alpha_pixels
        elif any(r in p['asset'] for r in CREEK_ASSETS):
            fn = creek_pixels
        elif any(r in p['asset'] for r in PIT_ASSETS):
            fn = pit_pixels
        elif p.get('water') or any(r in p['asset'] for r in ROCK_ASSETS):
            fn = blocked_pixels
        if fn:
            for k, v in world_grid(p, map_w, map_h, fn).items():
                if v > 0.5:
                    blocked.add(k)
    bridge = {}
    for p in flats:
        if any(r in p['asset'] for r in BRIDGE_ASSETS):
            for k, v in world_grid(p, map_w, map_h, lambda a: a[..., 3] > 140).items():
                bridge[k] = max(bridge.get(k, 0), v)
    deck = {k for k, v in bridge.items() if v > 0.35}
    blocked -= deck

    def n4(k):
        gx, gy = k
        return [(gx + 1, gy), (gx - 1, gy), (gx, gy + 1), (gx, gy - 1)]
    # 去孤立格 / 补单格洞
    blocked = {k for k in blocked if sum(n in blocked for n in n4(k)) >= 1}
    cand = {n for k in blocked for n in n4(k)} - blocked - deck
    blocked |= {k for k in cand if sum(n in blocked for n in n4(k)) >= 3}
    rects = []
    for gy in sorted({k[1] for k in blocked}):
        xs = sorted(k[0] for k in blocked if k[1] == gy)
        start = prev = xs[0]
        for gx in xs[1:] + [None]:
            if gx is not None and gx == prev + 1:
                prev = gx
                continue
            wx0 = start * CELL - map_w / 2
            wx1 = (prev + 1) * CELL - map_w / 2
            rects.append((round((wx0 + wx1) / 2), round(gy * CELL - map_h / 2), round(wx1 - wx0), CELL))
            if gx is not None:
                start = prev = gx
    return rects


def main():
    maps = dump_maps()
    with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/**\n * 野外水面 / 崖壁挡块(由 tools/qa/world_water_blocks.py 按贴图像素生成,别手改):{ x 中心, y 下沿, w, d }。\n */\n')
        for code, const in MAPS.items():
            rects = blocks_for(maps[code])
            f.write(f'export const {const}: Array<{{ x: number; y: number; w: number; d: number }}> = [\n')
            for i in range(0, len(rects), 4):
                f.write('  ' + ' '.join(f'{{ x: {x}, y: {y}, w: {w}, d: {d} }},' for x, y, w, d in rects[i:i + 4]) + '\n')
            f.write('];\n\n')
            print(code, 'rects', len(rects))


if __name__ == '__main__':
    main()
