# -*- coding: utf-8 -*-
"""主城重做 · 月夜整城出图(2026-11-11 用户看完两路实机演示选了「月夜」)。

做法:以确认过的中央广场干净底图(city_plate_moon.png)为中心,一块块往外「接着画」拼成 3×3 块的整城:
  每块 1672×941(= 一屏),相邻两块重叠 20%;出新的一块时,画布上已经画好的部分照原样摆上、没画的涂品红,
  让 Codex 只补品红区域(图 2 给中央广场当画风 / 镜头 / 比例基准)。出来后在重叠带里沿新旧差异最小的线切开接上(渐变过渡会把错位的
  灯柱 / 栏杆叠成重影);它要是把已画好的部分重画了(平均差 > MAX_DIFF)就重出,取最老实的一张。
  顺序:中 → 东 西 北 南 → 四个角(角块有两条已知边)。
  新块直接按「干净底图」出:不画人 / 动物 / 烟 / 明火(这些进游戏后是活的)。
产物(%TEMP%/lootchain-qa/city_moon/):tile_<名>.png(原始出图)、mosaic.png(整城)、filled.png(哪些像素已定)、mosaic_preview.jpg
用法:python tools/qa/city_moon_gen.py e w n s ne nw se sw      # 已有的块跳过;重出某块:--redo e
      python tools/qa/city_moon_gen.py --status
"""
import os
import shutil
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle_bg_layer_gen as B  # noqa: E402  复用 run_codex

SRC = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_redesign')
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_moon')
TW, TH = 1672, 941
STEP_X, STEP_Y = 1338, 753          # 重叠 20%(334 / 188 像素)
MW, MH = TW + STEP_X * 2, TH + STEP_Y * 2
SEAM_BAND = 150                     # 接缝只在已知区里离新区域这么近的一条带里找
FEATHER = 5                         # 接缝两侧各这么宽做羽化
MAX_DIFF = 16.0                     # 已知区新旧平均差超过这个 = 它把已画好的部分重画了 → 重出
RETRIES = 2
MAGENTA = (255, 0, 255)
# 中央广场那张底图上下沿带景深虚化(当时是一屏画面的近景 / 远景);放进整城中间就成了一条发虚的带,先让它重画成全清晰的
CENTRE = os.path.join(OUT, 'centre_sharp.png')
SHARP_PROMPT = (
    'Generate ONE new image with your image generation tool. Image 1 is a background plate of our own top-down game. Re-render the SAME '
    'picture - identical camera, framing, layout, buildings, props, vegetation, lighting and colours, nothing moved, nothing restyled - '
    'with ONE change: remove the depth-of-field blur. In image 1 the roofs and objects near the bottom edge and the fence, trees and '
    'haze near the top edge are out of focus; paint them crisp, with the same level of detail as the middle of the picture. Everything '
    'in sharp focus from edge to edge. Same framing and size as image 1 (landscape 16:9, 1672x941). No people, no text.'
)

HEAD = (
    'Generate ONE new image with your image generation tool. Image 1 is an UNFINISHED background plate for our own top-down 2D action '
    'RPG: {known} already painted and final; the flat magenta area is blank canvas. Image 2 is a finished neighbouring screen of the '
    'same city (the central square) - use it as the reference for art style, camera, lighting and scale.\n'
    'Finish image 1: keep the painted part exactly as it is, pixel for pixel, and paint the magenta area so that the city continues '
    'seamlessly across the boundary - streets, walls, roofs, fences and planting that are cut by the boundary must carry on naturally.\n'
    'Same camera as image 2 (high top-down view looking down at roughly 55-60 degrees, no horizon), same scale (doors, lamp posts, '
    'barrels, steps exactly the size they have in image 2), same stylised-realistic hand-painted look (clean, soft-edged, medium '
    'detail, no gritty noise, not flat), same clear moonlit night: saturated cool blue-teal moonlight everywhere, small warm amber '
    'pools from lit lamp posts and windows, crimson / rust-orange / magenta foliage and flowers as accents, planting softening every '
    'edge between paving and buildings.\n'
    'Everything is in sharp focus from edge to edge: NO depth-of-field blur, no out-of-focus foreground or background. Anything that '
    'is cut by the boundary of the painted part (a roof, a wall, a tree, a fence, a street) must be completed in the new area - '
    'never start a different object right at the boundary.\n'
    'This is an EMPTY background plate: no people, no animals, no smoke, no open flames (lamps and windows are lit), no text, no UI.\n'
    'Walkable paving must connect to the walkable paving of the painted part. Open ground is large worn stone slabs, a little lighter '
    'than its surroundings. No building stands alone on open paving; squares are enclosed by buildings, walls, fences and planting.\n'
    'CONTENT of the new area - {content}\n'
    'Same size as image 1 (landscape 16:9, 1672x941).'
)
# 名字 → (行, 列, 已知部分的说法, 这一块画什么)
TILES = {
    'e': (1, 2, 'its LEFT fifth is',
          'the MARKET SQUARE: the street coming through the stone archway opens into a small square lined with timber market stalls '
          'under crimson and cream canvas awnings (crates, baskets, barrels, sacks), shop fronts with lit windows behind them, a lamp '
          'post in the middle; on the far right the EAST GATE of the city: a stretch of the stone city wall with a gatehouse and an open '
          'gate, the paved road passing through it to the right edge of the image; next to the gate a barracks with a weapon rack.'),
    'w': (1, 0, 'its RIGHT fifth is',
          'the GUILD YARD: beyond the smithy, a paved yard in front of the mercenary guild hall - a large timber-and-stone hall with a '
          'broad door, two dull-red banners and a trophy shield above it - and beside it a tavern with a hanging sign, lit windows and '
          'a few outdoor tables and benches under an autumn tree; barrels and a cart; on the far left the stone city wall with a round '
          'tower closes the picture.'),
    # 第一版在已画好的教堂大门正上方又画了一座带门带台阶的完整教堂(两个门叠在一起)→ 明说「那扇门就是教堂正门,往上接着画同一栋楼」
    'n': (0, 1, 'its BOTTOM fifth is',
          'the CATHEDRAL QUARTER. On the right, directly above the painted strip, rises the upper part of the cathedral whose entrance '
          'is already in the painted strip: its gothic stone facade with a softly lit rose window, two towers and the long slate roof '
          'of the nave behind. The new area contains NO doorway, NO staircase and NO forecourt of the cathedral - those are already '
          'painted below. To the left of the cathedral, behind the iron fence of the painted strip, a small walled park: lawn, autumn '
          'trees, flower beds, a dark pond with lily pads and a stone statue of a knight on a plinth, a paved path with benches that '
          'leads from a gate in the fence to the left edge of the image; the stone city wall closes the top.'),
    # 第一版在广场下沿的出口正下方画了房子,去运河 / 南门的路被堵死 → 明说那块铺地往下必须是一条通到码头的路
    's': (2, 1, 'its TOP fifth is',
          'the CANAL QUARTER. IMPORTANT: the open paving that reaches the bottom edge of the painted strip - between the flower bed on '
          'its left and the large slate roof on its right - CONTINUES straight down as a wide, completely unobstructed paved lane with '
          'a few broad steps (at least as wide as that opening), a house on each side of it, to a stone quay along a dark canal that '
          'crosses the picture from left to right. The quay is a continuous walkable promenade from the left edge to the right edge of '
          'the picture. A humpbacked stone bridge carries the lane over the canal to the SOUTH GATE of the city at the bottom edge - a '
          'gatehouse in the stone city wall with an open gate, the road leaving through it at the bottom of the image; lamp posts along '
          'the quay, a moored boat, autumn trees.'),
    # 东块的城墙沿它的上沿走,东北角大半在墙外 → 这块只当屋顶 / 城墙远景;学院挪到西北(从公园的小路走得到)
    'ne': (0, 2, 'its LEFT fifth and its BOTTOM fifth are',
           'ROOFTOPS AND THE CITY WALL: the apse and slate roofs of the cathedral and the roofs and chimneys of the market houses seen '
           'from above; the stone city wall that appears in the painted strip continues upward along the right side with a round corner '
           'tower; beyond the wall only dark trees. No open square here.'),
    'nw': (0, 0, 'its RIGHT fifth and its BOTTOM fifth are',
           'the ACADEMY: the paved park path continues to the left into a small cloister court in front of a stone academy building '
           'with a square bell tower - an arcade, clipped hedges, a sundial, lamp posts; the path links the academy court with the '
           'park on the right; the stone city wall with a round corner tower closes the top and the left.'),
    'se': (2, 2, 'its LEFT fifth and its TOP fifth are',
           'the HARBOUR: the canal widens into a small harbour basin with timber piers, two moored boats, mooring posts, coiled rope, '
           'crates and barrels; warehouses with hoists along the quay; the quay promenade of the painted strip continues unobstructed '
           'to the right as a wide walkable waterfront; the stone city wall with a water gate closes the right and the bottom.'),
    'sw': (2, 0, 'its RIGHT fifth and its TOP fifth are',
           'the STABLE YARD: the quay promenade of the painted strip continues unobstructed to the left into a paved yard with stables, '
           'a hay cart, a water trough and a few houses; a small footbridge over the canal; the stone city wall with a round corner '
           'tower closes the left and the bottom.'),
}


def origin(r, c):
    return c * STEP_X, r * STEP_Y


def load_state():
    os.makedirs(OUT, exist_ok=True)
    mp, fp = os.path.join(OUT, 'mosaic.png'), os.path.join(OUT, 'filled.png')
    if os.path.exists(mp) and os.path.exists(fp):
        return np.asarray(Image.open(mp).convert('RGB')).copy(), np.asarray(Image.open(fp).convert('L')).copy() > 0
    mosaic = np.zeros((MH, MW, 3), np.uint8)
    filled = np.zeros((MH, MW), bool)
    centre = np.asarray(Image.open(CENTRE).convert('RGB').resize((TW, TH), Image.LANCZOS))
    x0, y0 = origin(1, 1)
    mosaic[y0:y0 + TH, x0:x0 + TW] = centre
    filled[y0:y0 + TH, x0:x0 + TW] = True
    return mosaic, filled


def save_state(mosaic, filled):
    Image.fromarray(mosaic).save(os.path.join(OUT, 'mosaic.png'))
    Image.fromarray((filled * 255).astype(np.uint8)).save(os.path.join(OUT, 'filled.png'))
    prev = mosaic.copy()
    prev[~filled] = (40, 20, 40)
    Image.fromarray(prev).resize((MW // 2, MH // 2), Image.LANCZOS).save(os.path.join(OUT, 'mosaic_preview.jpg'), quality=88)


def seam_path(cost):
    """cost[行, 列]:找一条自上而下、每行一个列号、相邻行最多偏一列的最小代价路径。"""
    h, w = cost.shape
    acc = cost.astype(np.float64).copy()
    for y in range(1, h):
        prev = acc[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        acc[y] += np.minimum(prev, np.minimum(left, right))
    path = np.zeros(h, np.int32)
    path[-1] = int(acc[-1].argmin())
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(acc[y, lo:hi].argmin())
    return path


def old_weight(old, res, known):
    """已知区里哪些像素继续用旧图(1)/ 换成新图(0):沿新旧差异最小的线切开,不做大面积渐变(渐变会把错位的灯柱 / 栏杆叠成重影)。"""
    diff = ndimage.uniform_filter(np.abs(res - old).mean(-1), 7)
    use_old = np.zeros((TH, TW), bool)
    xs = np.arange(TW)[None, :]
    ys = np.arange(TH)[:, None]
    ow, oh = TW - STEP_X, TH - STEP_Y
    # 左 / 右已知带:竖向接缝
    if known[:, :8].mean() > 0.9:
        a, b = ow - SEAM_BAND, ow - 8
        p = a + seam_path(diff[:, a:b])
        use_old |= xs < p[:, None]
    if known[:, -8:].mean() > 0.9:
        a, b = TW - ow + 8, TW - ow + SEAM_BAND
        p = a + seam_path(diff[:, a:b])
        use_old |= xs > p[:, None]
    # 上 / 下已知带:横向接缝(转置后同一个算法)
    if known[:8, :].mean() > 0.9:
        a, b = oh - SEAM_BAND, oh - 8
        p = a + seam_path(diff[a:b, :].T)
        use_old |= ys < p[None, :]
    if known[-8:, :].mean() > 0.9:
        a, b = TH - oh + 8, TH - oh + SEAM_BAND
        p = a + seam_path(diff[a:b, :].T)
        use_old |= ys > p[None, :]
    use_old &= known
    w = ndimage.gaussian_filter(use_old.astype(np.float32), FEATHER)
    w[~known] = 0
    return w


def gen(name, mosaic, filled, redo=False):
    r, c, known_txt, content = TILES[name]
    x0, y0 = origin(r, c)
    raw_p = os.path.join(OUT, f'tile_{name}.png')
    win_known = filled[y0:y0 + TH, x0:x0 + TW].copy()
    if win_known.all() and os.path.exists(raw_p) and not redo:
        print('exists', name)
        return True
    old = mosaic[y0:y0 + TH, x0:x0 + TW].astype(np.float32)

    def known_diff(path):
        res = np.asarray(Image.open(path).convert('RGB').resize((TW, TH), Image.LANCZOS)).astype(np.float32)
        d = np.abs(res - old).mean(-1)
        return res, float(d[win_known].mean()), float(np.percentile(d[win_known], 90))

    if not os.path.exists(raw_p) or redo:
        canvas = mosaic[y0:y0 + TH, x0:x0 + TW].copy()
        canvas[~win_known] = MAGENTA
        cp = os.path.join(OUT, f'_canvas_{name}.png')
        Image.fromarray(canvas).save(cp)
        best = None
        for attempt in range(RETRIES + 1):
            tmp = os.path.join(OUT, f'_try_{name}_{attempt}.png')
            if not B.run_codex([cp, CENTRE], HEAD.format(known=known_txt, content=content), tmp, f'moon_tile_{name}#{attempt}'):
                continue
            _res, mean, p90 = known_diff(tmp)
            print(name, f'attempt {attempt}: known-area mean abs diff {mean:.1f} (p90 {p90:.1f})', flush=True)
            if best is None or mean < best[0]:
                best = (mean, tmp)
            if mean <= MAX_DIFF:
                break
        if best is None:
            return False
        shutil.copy2(best[1], raw_p)
    res, mean, p90 = known_diff(raw_p)
    print(name, 'known-area mean abs diff %.1f (p90 %.1f)' % (mean, p90), 'known %.0f%%' % (win_known.mean() * 100), flush=True)
    w_old = old_weight(old, res, win_known)[:, :, None]
    out = old * w_old + res * (1 - w_old)
    mosaic[y0:y0 + TH, x0:x0 + TW] = np.clip(out, 0, 255).astype(np.uint8)
    filled[y0:y0 + TH, x0:x0 + TW] = True
    save_state(mosaic, filled)
    return True


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    args = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(CENTRE):
        if not B.run_codex([os.path.join(SRC, 'city_plate_moon.png')], SHARP_PROMPT, CENTRE, 'moon_centre_sharp'):
            print('FAILED centre')
            sys.exit(1)
    mosaic, filled = load_state()
    if '--status' in args:
        print('mosaic', (MW, MH), 'filled %.0f%%' % (filled.mean() * 100), [n for n in TILES if os.path.exists(os.path.join(OUT, f'tile_{n}.png'))])
        save_state(mosaic, filled)
        sys.exit(0)
    if '--reset' in args:
        # 从中央广场重新拼:已有的块按命令行给的顺序重放(不重新出图),删掉的块重新出
        for f in ('mosaic.png', 'filled.png'):
            if os.path.exists(os.path.join(OUT, f)):
                os.remove(os.path.join(OUT, f))
        mosaic, filled = load_state()
    redo = '--redo' in args
    for name in [a for a in args if not a.startswith('--')]:
        if not gen(name, mosaic, filled, redo):
            print('FAILED', name)
            break
