# -*- coding: utf-8 -*-
"""手绘主城可走格整图体检(2026-11-24 用户:「人物到这个位置不能往下了」「全量全图跑测试」)。
可走格 = Pre25CityData.walk(每格 16 个 v4 像素 = 手绘图 8 像素;半尺寸世界里约 11.4 世界单位)+ Pre25City 里的补丁(WALK_PATCHES)。

  python tools/qa/city_walk_audit.py            打印:孤岛(走不到的可走块)/ 各地点 · NPC · 出口按「通道至少多宽」能不能从出生点走到
  python tools/qa/city_walk_audit.py --shots    另把卡点(只有窄缝能到的路段)裁成叠图存到 %TEMP%/lootchain-qa/city_walk_audit/
判定:摇杆是点碰撞 + 分轴滑墙,一两格宽的缝寻路能穿、手推很难找到 → 主路线上的通道要 ≥ 4 格宽(约 45 世界单位)。
"""
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from scipy import ndimage as nd

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DATA_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'pre25', 'Pre25CityData.ts')
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa'), 'city_walk_audit')
PAINT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa'), 'city_v4_paint')


def load_grid():
    src = open(DATA_TS, encoding='utf-8').read()
    D = json.loads(src[src.find('{', src.find('PRE25_CITY_DATA')):src.rfind('}') + 1])
    w = D['walk']
    cols = w['cols']
    G = np.array([[c == '1' for c in bin(int(h, 16))[2:].zfill(len(h) * 4)[:cols]] for h in w['rows']], dtype=bool)
    return D, G


def map_def():
    """CITY 的出生点 / 地点 / NPC / 出口 / 可走格补丁(node 编译地图定义,和游戏同一份)。"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from walk_map_overlay import dump_maps
    return dump_maps()['CITY']


def apply_patches(G, D, d):
    """地图定义里 scene.walkPatches(世界坐标矩形 [x0, y0, x1, y1, 1=可走 / 0=挡])叠到栅格上,和运行时一致。"""
    U = d['scene']['unit']
    IW, IH = D['px']
    cell = D['walk']['cell']
    for x0, y0, x1, y1, ok in d['scene'].get('walkPatches') or []:
        c0, c1 = sorted([int((x0 / U + IW / 2) / cell), int((x1 / U + IW / 2) / cell)])
        r0, r1 = sorted([int((IH / 2 - y0 / U) / cell), int((IH / 2 - y1 / U) / cell)])
        G[max(0, r0):r1 + 1, max(0, c0):c1 + 1] = bool(ok)
    for r, c0, c1, ok in d['scene'].get('walkRuns') or []:
        if 0 <= r < G.shape[0]:
            G[r, max(0, c0):min(G.shape[1] - 1, c1) + 1] = bool(ok)
    return G


def main():
    D, G = load_grid()
    d = map_def()
    G = apply_patches(G, D, d)
    U = d['scene']['unit']
    IW, IH = D['px']
    cell = D['walk']['cell']

    def rc(x, y):
        return int((IH / 2 - y / U) / cell), int((x / U + IW / 2) / cell)

    def world(r, c):
        return round((c * cell + cell / 2 - IW / 2) * U), round((IH / 2 - r * cell - cell / 2) * U)

    sp = d['spawn']
    s = rc(sp['x'], sp['y'])
    lab, n = nd.label(G)                      # 4 连通
    main_id = lab[s]
    sizes = nd.sum(G, lab, range(1, n + 1))
    print(f'可走格 {int(G.sum())} 格(每格 {cell * U:.1f} 世界单位),连通块 {n} 个,出生点所在块 {int(sizes[main_id - 1])} 格')
    isl = sorted([(int(sizes[i - 1]), i) for i in range(1, n + 1) if i != main_id and sizes[i - 1] >= 30], reverse=True)
    print(f'走不到的孤岛(≥30 格)共 {len(isl)} 块,前 15:')
    for sz, i in isl[:15]:
        rr, cc = np.where(lab == i)
        print(f'   {sz:6d} 格  中心 {world(int(rr.mean()), int(cc.mean()))}  范围 x {world(0, cc.min())[0]}~{world(0, cc.max())[0]}  y {world(rr.max(), 0)[1]}~{world(rr.min(), 0)[1]}')
    EDT = nd.distance_transform_edt(G)
    targets = [('出口 ' + e['label'], e['x'], e['y'], e.get('triggerRadius') or e['radius'] * 0.7) for e in d['exits']]
    targets += [('地点 ' + p['name'], p['x'], p['y'], 90) for p in d['places']]
    targets += [('NPC ' + n_['name'], n_['x'], n_['y'] - 60, 120) for n_ in d['npcs']]
    print('\n按通道最窄处要求(格,1 格 ≈ %.0f 世界单位)能不能从出生点走到(近 = 走到目标半径内):' % (cell * U))
    ths = [1, 2, 3, 4]
    reach = {}
    for t in ths:
        M = EDT >= t
        lb, _ = nd.label(M)
        sid = lb[s] if M[s] else 0
        reach[t] = (lb, sid)
    bad = []
    for name, x, y, near in targets:
        r, c = rc(x, y)
        rad = max(1, int(near / U / cell))
        row = []
        for t in ths:
            lb, sid = reach[t]
            win = lb[max(0, r - rad):r + rad + 1, max(0, c - rad):c + rad + 1]
            row.append(bool(sid) and bool((win == sid).any()))
        flag = '' if all(row) else ('  ← 只有窄缝能到' if row[0] else '  ← 走不到')
        if flag:
            bad.append((name, x, y, row))
        print(f"   {name:24s} " + ' '.join(('✓' if v else '✗') + f'≥{t}' for v, t in zip(row, ths)) + flag)
    json.dump({'bad': bad, 'islands': [[sz, world(*map(int, (np.where(lab == i)[0].mean(), np.where(lab == i)[1].mean())))] for sz, i in isl[:30]]},
              open(os.path.join(os.environ.get('TEMP', '.'), 'city_walk_audit.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    if '--shots' in sys.argv:
        shots(G, bad, rc, world)


def shots(G, bad, rc, world):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    os.makedirs(OUT, exist_ok=True)
    mos = Image.open(os.path.join(PAINT, 'mosaic.png')).convert('RGB')
    oy = json.load(open(os.path.join(PAINT, 'mosaic.json')))['origin'][1]
    for k, (name, x, y, _) in enumerate(bad):
        r, c = rc(x, y)
        px, py = c * 8, r * 8 - oy
        box = (px - 700, py - 450, px + 700, py + 450)
        crop = np.asarray(mos.crop(box)).astype(np.float32)
        r0, c0 = (box[1] + oy) // 8, box[0] // 8
        sub = G[r0:r0 + crop.shape[0] // 8 + 2, c0:c0 + crop.shape[1] // 8 + 2]
        m = np.kron(sub, np.ones((8, 8), bool))[(box[1] + oy) - r0 * 8:, box[0] - c0 * 8:][:crop.shape[0], :crop.shape[1]]
        crop[~m] = crop[~m] * 0.5 + np.array([230, 40, 40]) * 0.5
        Image.fromarray(crop.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, f'{k:02d}_{re.sub(r"[^0-9A-Za-z一-龥]", "_", name)}.jpg'), quality=86)
    print('shots ->', OUT)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
