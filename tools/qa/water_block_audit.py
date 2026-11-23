# -*- coding: utf-8 -*-
"""水面挡块 × 重绘画面对位排查(2026-11-23):挡块(LobbyWaterBlocks.ts)是按旧贴地件像素生成的,地面 11-21 整图重绘后
河岸 / 路宽有偏移(晨风村祭坛土路被封就是这个)。本脚本把重绘图块(ui/world/<图>_paint)拼回整图,按挡块的 40 格逐格对:
- 多挡(over):挡住的格子,画面上没有水(水流遮罩 R),格子本身是土路 / 草地(像素占比 + 纹理平滑),颜色 / 纹理又和旁边
  某格能走的地面一样 → 像是路 / 岸边空地被挡了。从「挡块边上那一圈」开始,把判成多挡的格子当能走再往里长 GROW 轮
  (路被压住常常不止一排)。岸石 / 崖壁 / 急流纹理粗,不会判进来。
- 漏挡(hole):画面上是水(水流遮罩 R 过半)、却没挡住的格子(只有晨风村 / 林地有水流遮罩;荒原峡谷是干谷、枯木林黑溪按颜色判不出水,只查多挡)。
按 8 连通聚成块,列世界坐标 + 格数,并出总览图和每块的局部图(红框 = 挡块,黄 = 多挡,蓝 = 漏挡)。

  python tools/qa/water_block_audit.py [VILLAGE WOODS GRAY DEADWOOD] [--blocks 某个 LobbyWaterBlocks.ts] [--min 2]
产物:%TEMP%/lootchain-qa/water_audit/<图>_overview.jpg、<图>_<序号>.jpg、report.json。
看完局部图再用 tools/qa/walk_debug_shot.py 在游戏画面里核对,确认后写进 world_water_blocks.py 的 CLEAR_ZONES / ADD_ZONES。
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa'), 'water_audit')
CELL = 40
S = 0.4                 # 拼图比例(像素 / 世界单位):一格 = 16 像素
CP = int(CELL * S)
GROW = 6                # 多挡往挡块里长几轮
GROUND_FRAC = 0.75      # 格内土路或草地像素占比 ≥ 它才算「地面」
GROUND_TEX = 18.0       # 且格内亮度纹理低于它(岸石 / 崖壁 / 急流纹理都在 20 以上)
COLOR_T = 22.0          # 和旁边能走地面的平均色差(RGB 欧氏)小于它才算「一样」
TEX_T = 9.0             # 亮度纹理(格内标准差)差小于它
WATER_OVER = 0.08       # 格内水面占比低于它才可能是多挡
WATER_HOLE = 0.5        # 格内水面占比高于它、又没挡 = 漏挡
CONST = {'VILLAGE': 'VILLAGE_WATER_BLOCKS', 'WOODS': 'WOODS_WATER_BLOCKS', 'GRAY': 'GRAY_WATER_BLOCKS', 'DEADWOOD': 'DEADWOOD_WATER_BLOCKS'}


def paint_defs():
    src = open(os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldPaintData.ts'), encoding='utf-8').read()
    return json.loads(src[src.index('= {') + 2:].strip().rstrip(';'))


def parse_blocks(path):
    out, cur = {}, None
    for line in open(path, encoding='utf-8'):
        m = re.match(r'export const (\w+)', line)
        if m:
            cur = m.group(1)
            out[cur] = []
            continue
        if cur:
            out[cur] += [tuple(map(int, r.groups())) for r in re.finditer(r'\{ x: (-?\d+), y: (-?\d+), w: (\d+), d: (\d+) \}', line)]
    return out


def stitch(pd):
    """重绘图块拼回整图(S 比例),上下左右补齐到整格:返回 canvas(Hc*CP, Wc*CP, 3)、pad_top。"""
    mw, mh = pd['mapW'], pd['mapH']
    wc, hc = int(np.ceil(mw / CELL)), int(np.ceil(mh / CELL))
    img_w, img_h = int(round(mw * S)), int(round(mh * S))
    full = Image.new('RGB', (img_w, img_h))
    k = S / pd['px']
    d = os.path.join(ROOT, 'assets', 'resources', pd['dir'].replace('/', os.sep))
    for r in range(pd['rows']):
        for c in range(pd['cols']):
            p = os.path.join(d, f'p_{r}_{c}.webp')
            if not os.path.exists(p):
                continue
            t = Image.open(p).convert('RGB')
            x0, y0 = int(round(c * pd['tileW'] * k)), int(round(r * pd['tileH'] * k))
            x1, y1 = int(round((c * pd['tileW'] + t.size[0]) * k)), int(round((r * pd['tileH'] + t.size[1]) * k))
            full.paste(t.resize((max(1, x1 - x0), max(1, y1 - y0)), Image.BOX), (x0, y0))
    pad_top = hc * CP - img_h
    canvas = np.zeros((hc * CP, wc * CP, 3), dtype=np.uint8)
    canvas[pad_top:pad_top + img_h, :img_w] = np.asarray(full)[:, :min(img_w, wc * CP)]
    return canvas, pad_top, wc, hc


def water_grid(pd, wc, hc, pad_top):
    """水流遮罩 R(水面 + 白沫)按格的占比;没有遮罩返回 None。"""
    p = os.path.join(ROOT, 'assets', 'resources', pd['dir'].replace('/', os.sep), 'flow.png')
    if not pd.get('flow') or not os.path.exists(p):
        return None
    img_w, img_h = int(round(pd['mapW'] * S)), int(round(pd['mapH'] * S))
    r = np.asarray(Image.open(p).convert('RGB').resize((img_w, img_h), Image.BILINEAR))[..., 0].astype(np.float32) / 255
    canvas = np.zeros((hc * CP, wc * CP), dtype=np.float32)
    canvas[pad_top:pad_top + img_h, :img_w] = r[:, :min(img_w, wc * CP)]
    return (canvas > 0.5).reshape(hc, CP, wc, CP).mean(axis=(1, 3))


def audit(code, pd, rects, min_cells):
    canvas, pad_top, wc, hc = stitch(pd)
    mw, mh = pd['mapW'], pd['mapH']
    # 格子(行 = 从上往下 0..hc-1;块的 gy 从下往上)
    blocked = np.zeros((hc, wc), dtype=bool)
    for x, y, w, dd in rects:
        gx0 = int(round((x - w / 2 + mw / 2) / CELL))
        gx1 = int(round((x + w / 2 + mw / 2) / CELL))
        gy = int(round((y + mh / 2) / CELL))
        if 0 <= gy < hc:
            blocked[hc - 1 - gy, max(0, gx0):min(wc, gx1)] = True
    cells = canvas.reshape(hc, CP, wc, CP, 3).astype(np.float32)
    mean = cells.mean(axis=(1, 3))
    lum = cells.mean(axis=4)
    tex = lum.std(axis=(1, 3))
    # 土路 / 草地像素占比(晨风村祭坛被压的路:土路占比 0.97~1、纹理 10~15;真岸石 / 崖壁 / 急流:土路 ≤ 0.23、纹理 20~50)
    rr, gg, bb = cells[..., 0], cells[..., 1], cells[..., 2]
    mx, mn = cells.max(axis=4), cells.min(axis=4)
    sat = (mx - mn) / np.maximum(mx, 1)
    dirt = ((rr > gg + 6) & (gg > bb + 6) & (sat > 0.18) & (sat < 0.55) & (lum > 90) & (lum < 215)).mean(axis=(1, 3))
    grass = ((gg >= rr - 6) & (gg > bb + 14) & (sat > 0.2) & (lum > 50)).mean(axis=(1, 3))
    ground = ((dirt >= GROUND_FRAC) | (grass >= GROUND_FRAC)) & (tex < GROUND_TEX)
    water = water_grid(pd, wc, hc, pad_top)
    inside = np.zeros((hc, wc), dtype=bool)
    v0 = (pad_top + CP - 1) // CP
    inside[v0:, :int(mw // CELL)] = True
    walk = ~blocked & inside
    over = np.zeros_like(blocked)
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for _ in range(GROW):
        open_ = walk | over
        new = np.zeros_like(blocked)
        cand = blocked & ~over & inside & ground
        if water is not None:
            cand &= water < WATER_OVER
        ys, xs = np.nonzero(cand)
        for r, c in zip(ys, xs):
            # 和旁边任一格能走的地面颜色 / 纹理一样(路被压住:挡块那格和路面那格是同一种土)
            for dr, dc in dirs:
                q = (r + dr, c + dc)
                if 0 <= q[0] < hc and 0 <= q[1] < wc and open_[q] and np.linalg.norm(mean[r, c] - mean[q]) < COLOR_T and abs(tex[r, c] - tex[q]) < TEX_T:
                    new[r, c] = True
                    break
        if not new.any():
            break
        over |= new
    hole = (~blocked & inside & (water > WATER_HOLE)) if water is not None else np.zeros_like(blocked)
    clusters = []
    for kind, mask in (('over', over), ('hole', hole)):
        lab, n = nd.label(mask, structure=np.ones((3, 3)))
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lab == i)
            if len(ys) < min_cells:
                continue
            wx = lambda c: c * CELL - mw / 2
            wy = lambda r: (hc - 1 - r) * CELL - mh / 2
            clusters.append({'kind': kind, 'cells': int(len(ys)),
                             'x0': int(wx(xs.min())), 'x1': int(wx(xs.max() + 1)), 'y0': int(wy(ys.max())), 'y1': int(wy(ys.min()) + CELL),
                             'cx': int(wx(xs.mean() + 0.5)), 'cy': int(wy(ys.mean()) + CELL / 2), '_r': (int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max()))})
    clusters.sort(key=lambda c: -c['cells'])
    # 总览图 + 每块局部图(先清掉这张图上一轮的局部图)
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith(code + '_') and f.endswith('.jpg'):
            os.remove(os.path.join(OUT, f))
    vis = canvas.copy()
    tint = np.zeros((hc, wc, 3), dtype=np.float32)
    alpha = np.zeros((hc, wc), dtype=np.float32)
    tint[blocked] = (230, 40, 40)
    alpha[blocked] = 0.28
    tint[over] = (255, 220, 0)
    alpha[over] = 0.6
    tint[hole] = (30, 140, 255)
    alpha[hole] = 0.6
    tb = np.repeat(np.repeat(tint, CP, 0), CP, 1)
    ab = np.repeat(np.repeat(alpha, CP, 0), CP, 1)[..., None]
    vis = (vis * (1 - ab) + tb * ab).astype(np.uint8)
    ov = Image.fromarray(vis)
    ov.thumbnail((2400, 2400))
    dr = ImageDraw.Draw(ov)
    sc = ov.size[0] / vis.shape[1]
    for i, c in enumerate(clusters):
        r0, r1, c0, c1 = c['_r']
        dr.rectangle([c0 * CP * sc - 4, r0 * CP * sc - 4, (c1 + 1) * CP * sc + 4, (r1 + 1) * CP * sc + 4], outline=(255, 255, 255), width=2)
        dr.text(((c1 + 1) * CP * sc + 6, r0 * CP * sc), str(i + 1), fill=(255, 255, 255))
    ov.save(os.path.join(OUT, f'{code}_overview.jpg'), quality=85)
    for i, c in enumerate(clusters[:40]):
        r0, r1, c0, c1 = c['_r']
        m = 6
        y0, y1 = max(0, (r0 - m) * CP), min(vis.shape[0], (r1 + 1 + m) * CP)
        x0, x1 = max(0, (c0 - m) * CP), min(vis.shape[1], (c1 + 1 + m) * CP)
        pair = np.concatenate([canvas[y0:y1, x0:x1], np.full((y1 - y0, 6, 3), 255, np.uint8), vis[y0:y1, x0:x1]], axis=1)
        im = Image.fromarray(pair)
        if im.size[0] > 1600:
            im.thumbnail((1600, 1600))
        im.save(os.path.join(OUT, f'{code}_{i + 1:02d}_{c["kind"]}.jpg'), quality=88)
    for c in clusters:
        c.pop('_r')
    return {'blockedCells': int(blocked.sum()), 'over': int(over.sum()), 'hole': int(hole.sum()), 'flow': water is not None, 'clusters': clusters}


def main():
    maps = [a.upper() for a in sys.argv[1:] if not a.startswith('--') and sys.argv[sys.argv.index(a) - 1] not in ('--blocks', '--min')] or list(CONST)
    bpath = sys.argv[sys.argv.index('--blocks') + 1] if '--blocks' in sys.argv else os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyWaterBlocks.ts')
    min_cells = int(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 2
    pds = paint_defs()
    blocks = parse_blocks(bpath)
    report = {}
    for code in maps:
        rep = audit(code, pds[code], blocks[CONST[code]], min_cells)
        report[code] = rep
        print(f"{code}: 挡块格 {rep['blockedCells']} · 多挡 {rep['over']} 格 · 漏挡 {rep['hole']} 格{'' if rep['flow'] else '(无水流遮罩,只查多挡)'} · 成块 {len(rep['clusters'])}")
        for i, c in enumerate(rep['clusters'][:25]):
            print(f"   {i + 1:2d}. {'多挡' if c['kind'] == 'over' else '漏挡'} {c['cells']:3d} 格  中心 {c['cx']},{c['cy']}  范围 x {c['x0']}~{c['x1']} y {c['y0']}~{c['y1']}")
    json.dump(report, open(os.path.join(OUT, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('->', OUT)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
