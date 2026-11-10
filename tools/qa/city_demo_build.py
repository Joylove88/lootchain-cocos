# -*- coding: utf-8 -*-
"""主城重做演示广场(2026-11-11 用户:「两个弄下,我看看效果,然后再决定用哪个」):把一屏效果图做成能在游戏里跑的场景。

做法 = 训练场那一套的通用版(「整图贴地 + 可走区 + 遮挡件」),不再把原型拆成单栋立物摆回平地:
  底图     city_plate_<路>.png(去掉人 / 烟 / 明火的干净底图)四周镜像 + 虚化 + 压暗补一圈(超宽屏不露黑边)→ <路>_base.jpg 贴地件
  遮挡层   同一张图只留「立在地面上的东西」的像素 → <路>_fg.png;运行时按 32px 竖条切成遮挡条,各带一条脚线(人的脚线比它靠北就被盖住)
  随风摆   树(高植被)单独抠成立物 <路>_tree_<i>.png,走现成的风摆着色器 + 透视孔;布(旗 / 篷)<路>_cloth_<i>.png 走上端固定的摆法
  可走栅格 分割图里白色 = 能走的地面,收边后按 12px 一格存成十六进制行
分割图 city_seg_<路>.png 四色:白 = 地面,绿 = 植被,红 = 布,蓝 = 其余立着的东西(tools/qa/city_redesign_proto.py seg_<路>)。

用法:python tools/qa/city_demo_build.py [moon] [lit]
产物:assets/resources/ui/world/citydemo/*、assets/scripts/scenes/lobby/LobbyCityDemoData.ts;
      自查图 %TEMP%/lootchain-qa/city_demo/<路>_classes.jpg / <路>_strips.jpg
"""
import json
import os
import shutil
import sys
import tempfile
import uuid

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import woods_ground_install as WG  # noqa: E402  meta_for / write_meta

ROOT = WG.ROOT if hasattr(WG, 'ROOT') else os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_redesign')
DBG = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_demo')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'citydemo')
DATA_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyCityDemoData.ts')
BACKUP = os.path.join(ROOT, '素材原始备份', 'citydemo-20261111')

PAD_X, PAD_Y = 120, 60        # 底图四周补边(图片像素)
CELL = 12                     # 可走栅格一格(图片像素)
ERODE = 7                     # 可走区收边(脚不贴墙)
STRIP_W = 32                  # 遮挡条宽
TREE_RUN = 150                # 植被连通块高于这个算树 / 大灌木(矮的花圃留在遮挡条里)
TREE_AREA = 9000
# 不随风摆的植被(图片像素框 x0, y0, x1, y1):贴在墙 / 拱门上的爬藤
STATIC_VEG = {'moon': [(215, 40, 440, 270), (1395, 370, 1672, 770)]}
CLOTH_AREA = 1200
BODY_HALF = 64                # 人身半宽(判断一条遮挡条旁边有没有人能站到它后面)
# 出生点(图片像素):可走栅格只保留和它连通的那一片
SPAWN = {'moon': (800, 500), 'lit': (800, 470)}
REFS = np.array([[255, 255, 255], [0, 255, 0], [255, 0, 0], [0, 0, 255], [0, 0, 0]], np.float32)   # 白 绿 红 蓝 黑(黑按蓝算)


def classify(seg):
    d = ((seg[:, :, None, :].astype(np.float32) - REFS[None, None, :, :]) ** 2).sum(-1)
    lab = d.argmin(-1)
    lab[lab == 4] = 3
    # 5×5 众数滤波:去掉边界上的杂色点
    votes = np.stack([ndimage.uniform_filter((lab == c).astype(np.float32), 5) for c in range(4)])
    return votes.argmax(0)


def vertical_run_height(mask):
    """每个像素所在竖向连续段的高度。"""
    h, w = mask.shape
    out = np.zeros((h, w), np.int32)
    for x in range(w):
        col = mask[:, x]
        y = 0
        while y < h:
            if not col[y]:
                y += 1
                continue
            y0 = y
            while y < h and col[y]:
                y += 1
            out[y0:y, x] = y - y0
    return out


def runs_of(col, gap=6):
    """一维布尔数组里的连续段 [(y0, y1)](闭区间),间隔小于 gap 的并成一段。"""
    out = []
    y, n = 0, len(col)
    while y < n:
        if not col[y]:
            y += 1
            continue
        y0 = y
        while y < n and col[y]:
            y += 1
        if out and y0 - out[-1][1] - 1 < gap:
            out[-1][1] = y - 1
        else:
            out.append([y0, y - 1])
    return out


def soft_alpha(mask, blur=0.8):
    a = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(a)


def save_png(name, rgba):
    dst = os.path.join(DST, name + '.png')
    im = Image.fromarray(rgba, 'RGBA')
    im.save(dst, optimize=True)
    m = WG.meta_for(name, '.png', im.width, im.height, False, False)
    m['userData']['hasAlpha'] = True
    m['userData']['fixAlphaTransparencyArtifacts'] = True
    WG.write_meta(dst, m)
    return dst


def padded_base(plate):
    """四周镜像补边,越往外越虚越暗(超宽 / 超高屏露出来的是一圈失焦的暗边,不是黑条)。"""
    arr = np.pad(plate, ((PAD_Y, PAD_Y), (PAD_X, PAD_X), (0, 0)), mode='reflect')
    im = Image.fromarray(arr, 'RGB')
    blur = np.asarray(im.filter(ImageFilter.GaussianBlur(14))).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.clip(np.maximum(PAD_X - xx, xx - (w - 1 - PAD_X)) / PAD_X, 0, 1)
    dy = np.clip(np.maximum(PAD_Y - yy, yy - (h - 1 - PAD_Y)) / PAD_Y, 0, 1)
    ramp = np.maximum(dx, dy)[:, :, None]
    out = arr.astype(np.float32) * (1 - ramp) + blur * ramp
    out *= 1 - 0.55 * ramp
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def build(style):
    plate_p = os.path.join(SRC, f'city_plate_{style}.png')
    seg_p = os.path.join(SRC, f'city_seg_{style}.png')
    os.makedirs(BACKUP, exist_ok=True)
    for p in (plate_p, seg_p):
        shutil.copy2(p, os.path.join(BACKUP, os.path.basename(p)))
    plate = np.asarray(Image.open(plate_p).convert('RGB'))
    H, W = plate.shape[:2]
    seg = np.asarray(Image.open(seg_p).convert('RGB').resize((W, H), Image.NEAREST))
    lab = classify(seg)
    # 物体里面的白色小块(亮着的窗、木桶描边、告示纸)不是地面:面积小的白色连通块并进周围的立物
    g_cc, g_n = ndimage.label(lab == 0)
    sizes = ndimage.sum(lab == 0, g_cc, range(1, g_n + 1))
    for i, size in enumerate(sizes, 1):
        if size < 2500:
            lab[g_cc == i] = 3
    ground, veg, cloth = lab == 0, lab == 1, lab == 2

    # ── 树 / 大灌木:整块连通的植被,够高够大的单独抠成立物(整棵一起摆;按竖向段高切会把一棵树切碎)──
    # 贴在墙上的爬藤不摆(STATIC_VEG 里的框:留在遮挡条里)
    sway_veg = veg.copy()
    for x0, y0, x1, y1 in STATIC_VEG.get(style, []):
        sway_veg[y0:y1, x0:x1] = False
    t_lab, t_n = ndimage.label(ndimage.binary_opening(sway_veg, iterations=1))
    trees, tree_union = [], np.zeros((H, W), bool)
    for i in range(1, t_n + 1):
        core = t_lab == i
        ys, xs = np.where(core)
        if core.sum() < TREE_AREA or ys.max() - ys.min() < TREE_RUN:
            continue
        mask = ndimage.binary_dilation(core, iterations=2) & sway_veg
        ys, xs = np.where(mask)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        rgba = np.dstack([plate[y0:y1 + 1, x0:x1 + 1], soft_alpha(mask[y0:y1 + 1, x0:x1 + 1])])
        name = f'{style}_tree_{len(trees)}'
        save_png(name, rgba)
        trees.append([name, round((x0 + x1) / 2, 1), int(y1), int(x1 - x0 + 1), int(y1 - y0 + 1)])
        tree_union |= mask

    # ── 布:旗 / 篷,上端固定随风起伏 ──
    c_lab, c_n = ndimage.label(ndimage.binary_closing(cloth, iterations=2))
    cloths, cloth_union = [], np.zeros((H, W), bool)
    for i in range(1, c_n + 1):
        mask = c_lab == i
        if mask.sum() < CLOTH_AREA:
            continue
        ys, xs = np.where(mask)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        rgba = np.dstack([plate[y0:y1 + 1, x0:x1 + 1], soft_alpha(mask[y0:y1 + 1, x0:x1 + 1])])
        name = f'{style}_cloth_{len(cloths)}'
        save_png(name, rgba)
        cloths.append([name, round((x0 + x1) / 2, 1), int(y1), int(x1 - x0 + 1), int(y1 - y0 + 1)])
        cloth_union |= mask

    # ── 遮挡层:其余立着的东西(建筑 / 栏杆 / 灯柱 / 井 / 矮植被 …)──
    M = (lab != 0) & ~tree_union & ~cloth_union
    M = ndimage.binary_opening(M, iterations=1)
    save_png(f'{style}_fg', np.dstack([plate, soft_alpha(M, 0.6)]))
    cc, _ = ndimage.label(M)
    runs = []
    for i, x0 in enumerate(range(0, W, STRIP_W)):
        x1 = min(W, x0 + STRIP_W)
        for y0, y1 in runs_of(M[:, x0:x1].any(1)):
            if y1 - y0 < 10:
                continue
            ids = cc[y0:y1 + 1, x0:x1]
            ids = ids[ids > 0]
            comp = int(np.bincount(ids).argmax()) if len(ids) else 0
            runs.append({'i': i, 'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'comp': comp, 'foot': y1})
    # 悬空的段(拱门顶 / 屋檐):脚线取同一连通块左右邻条里较低的那条脚线,人从拱下走过时拱顶盖在人上面
    for r in runs:
        near = [q for q in runs if q['comp'] == r['comp'] and q is not r and abs(q['i'] - r['i']) <= 4 and q['y0'] <= r['y1'] and q['y1'] >= r['y0']]
        left = [q['y1'] for q in near if q['i'] < r['i']]
        right = [q['y1'] for q in near if q['i'] > r['i']]
        if left and right:
            r['foot'] = max(r['foot'], min(max(left), max(right)))
    # 只留「旁边有人能站到它后面」的条:左右一个身位内、脚线以北、条顶以南有可走地面;
    # 贴着随风摆的树 / 布的条也留着(树摆过来时前面的灯柱 / 栏杆还得盖在它上面)
    sway_near = ndimage.binary_dilation(tree_union | cloth_union, iterations=10)
    strips = []
    for r in runs:
        xa, xb = max(0, r['x0'] - BODY_HALF), min(W, r['x1'] + BODY_HALF)
        behind = r['foot'] > r['y0'] and ground[r['y0']:r['foot'], xa:xb].any()
        if behind or sway_near[r['y0']:r['y1'] + 1, r['x0']:r['x1']].any():
            strips.append([r['x0'], r['y0'], r['x1'] - r['x0'], r['y1'] - r['y0'] + 1, r['foot']])

    # ── 可走栅格 ──
    # 挡路的东西先闭运算(栏杆条之间的缝填上)再开运算(台阶棱线这种孤立细线去掉),然后整体收边
    solid = ndimage.binary_opening(ndimage.binary_closing(~ground, iterations=4), iterations=2)
    walk = ndimage.binary_erosion(~solid, iterations=ERODE)
    cols, rows = -(-W // CELL), -(-H // CELL)
    grid = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            grid[r, c] = walk[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL].mean() >= 0.7
    g_lab, _ = ndimage.label(grid)
    sx, sy = SPAWN[style]
    sr, sc = sy // CELL, sx // CELL
    if not grid[sr, sc]:
        ys, xs = np.where(grid)
        k = ((ys - sr) ** 2 + (xs - sc) ** 2).argmin()
        sr, sc = int(ys[k]), int(xs[k])
    grid = g_lab == g_lab[sr, sc]
    hex_cols = -(-cols // 4) * 4
    walk_rows = []
    for r in range(rows):
        bits = ''.join('1' if (c < cols and grid[r, c]) else '0' for c in range(hex_cols))
        walk_rows.append(''.join('%x' % int(bits[k:k + 4], 2) for k in range(0, hex_cols, 4)))

    # ── 底图 ──
    base = padded_base(plate)
    base_p = os.path.join(DST, f'{style}_base.jpg')
    base.save(base_p, quality=93, subsampling=0)
    WG.write_meta(base_p, WG.meta_for(f'{style}_base', '.jpg', base.width, base.height, False, False))

    # ── 自查图 ──
    os.makedirs(DBG, exist_ok=True)
    colors = np.array([[255, 255, 255], [40, 220, 60], [240, 60, 60], [60, 90, 255]], np.float32)
    mix = plate.astype(np.float32) * 0.5 + colors[lab] * 0.5
    Image.fromarray(mix.astype(np.uint8)).save(os.path.join(DBG, f'{style}_classes.jpg'), quality=88)
    dbg = Image.fromarray(plate).convert('RGBA')
    over = Image.new('RGBA', dbg.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for r in range(rows):
        for c in range(cols):
            if grid[r, c]:
                d.rectangle([c * CELL, r * CELL, (c + 1) * CELL - 1, (r + 1) * CELL - 1], fill=(60, 255, 120, 50))
    for x0, y0, w, h, foot in strips:
        d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], outline=(255, 210, 60, 200))
        d.line([x0, foot, x0 + w - 1, foot], fill=(255, 40, 40, 255), width=3)
    for name, cx, foot, w, h in trees:
        d.rectangle([cx - w / 2, foot - h, cx + w / 2, foot], outline=(60, 255, 255, 255), width=3)
    for name, cx, foot, w, h in cloths:
        d.rectangle([cx - w / 2, foot - h, cx + w / 2, foot], outline=(255, 90, 255, 255), width=3)
    Image.alpha_composite(dbg, over).convert('RGB').save(os.path.join(DBG, f'{style}_strips.jpg'), quality=88)

    print(style, 'size', (W, H), 'strips', len(strips), 'of', len(runs), 'trees', len(trees), 'cloths', len(cloths),
          'walk cells', int(grid.sum()), 'spawn cell', (sc, sr), 'class %', [round(float((lab == c).mean()) * 100, 1) for c in range(4)])
    return {'px': [W, H], 'pad': [PAD_X, PAD_Y], 'cell': CELL, 'cols': cols, 'walk': walk_rows, 'strips': strips, 'trees': trees, 'cloths': cloths,
            'spawn': [sc * CELL + CELL // 2, sr * CELL + CELL // 2]}


def ensure_dir():
    os.makedirs(DST, exist_ok=True)
    dm = DST + '.meta'
    if not os.path.exists(dm):
        with open(dm, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'ver': '1.2.0', 'importer': 'directory', 'imported': True, 'uuid': str(uuid.uuid4()), 'files': [], 'subMetas': {}, 'userData': {}}, f, indent=2)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ensure_dir()
    # 柔光点(光晕 / 火焰载体 / 飞蛾 / 雪片共用):128 的白色径向渐变,边缘到 0
    yy, xx = np.mgrid[0:128, 0:128]
    r = np.clip(np.hypot(xx - 63.5, yy - 63.5) / 63.5, 0, 1)
    a = ((1 - r) ** 2 * (3 - 2 * (1 - r)) * 255).astype(np.uint8)   # smoothstep(1 - r)
    save_png('fx_dot', np.dstack([np.full((128, 128, 3), 255, np.uint8), a]))
    styles = sys.argv[1:] or ['moon', 'lit']
    data = {}
    if os.path.exists(DATA_TS):   # 只重做一路时保留另一路
        txt = open(DATA_TS, encoding='utf-8').read()
        data = json.loads(txt[txt.index('= {') + 2:txt.rindex('}') + 1])
    for style in styles:
        data[style] = build(style)
    body = json.dumps(data, ensure_ascii=False, separators=(', ', ': '))
    with open(DATA_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/**\n * 主城重做演示广场的场景数据(由 tools/qa/city_demo_build.py 生成,别手改)。坐标都是图片像素(左上原点)。\n'
                ' * walk = 可走栅格(一格 cell 像素,每行一个十六进制串,高位在左);strips = 遮挡条 [sx, sy, sw, sh, 脚线 y];\n'
                ' * trees / cloths = 单独抠出来随风摆的件 [贴图名, 中心 x, 脚线 y, 宽, 高]。\n */\n'
                '/* eslint-disable */\n'
                'export const CITY_DEMO_DATA: Record<string, { px: number[]; pad: number[]; cell: number; cols: number; walk: string[]; strips: number[][]; '
                'trees: Array<[string, number, number, number, number]>; cloths: Array<[string, number, number, number, number]>; spawn: number[] }> = '
                + body + ' as never;\n')
    print('wrote', DATA_TS)


if __name__ == '__main__':
    main()
