# -*- coding: utf-8 -*-
"""主城重做 · 月夜整城入库(2026-11-11):把 city_moon_gen.py 拼好的整城图做成游戏里的整图场景。

  python tools/qa/city_moon_build.py seg      # 9 个窗口各出一张五色分割图(Codex),拼成 seg_full.png
  python tools/qa/city_moon_build.py build    # 底图切块 + 遮罩、树 / 布 / 水面抠图、可走栅格、遮挡条、灯光位置 → 入库 + LobbyCityMoonData.ts

分割图五色:白 = 能走的地面(铺石 / 草坪 / 台阶 / 桥面 / 码头),绿 = 植被,红 = 布,青 = 水面,蓝 = 其余立着的东西。
做法同演示广场(city_demo_build.py,选定后已删):
  底图   整图四周镜像补一圈虚化暗边,切成不超过 2048 的块 → citymoon/base_<i>.jpg(贴地件)
  遮挡层 「立在地面上的东西」的遮罩,按底图块同样的切法、半分辨率 → citymoon/mask_<i>.jpg;运行时遮挡条 = 底图块上的 32px 竖条
         × 这张遮罩(effects/world-occlude),每条带一条脚线。颜色直接取底图,所以和底图不会有任何色差
         (第一版是另存一套 fg_<i>.png:27MB,而且出包压成 256 色后会和 JPG 底图对不上)
  脚线   每列里连在一起的一段立物 = 一条,脚线 = 它的下沿;再按三条规则修:
         A 墙脚下的花丛(上面立物、最下面一截植被)在交界处切开;B 墙前面的窄东西(灯柱 / 门柱 / 木桶:两侧相邻列的墙脚明显更高)
         在墙脚处切开——不切的话墙会跟着柱子的脚线走,人站在门口台阶上会被整面墙盖住;C 门洞拱顶(悬在路上方)手工给脚线(ARCH_FEET)
  随风摆 够高、不太宽、没贴在墙上的植被连通块抠成立物 tree_<i>.png(现成风摆 + 透视孔);布 cloth_<i>.png(上端固定)
  水面   抠成贴地件 water_<i>.png,挂流水着色器(波纹 + 闪光)
  灯光   暖色高亮连通块 = 灯 / 窗,自动出光晕位置和大小
  可走   白色收边后 12px 一格,只留和出生点连通的一片;末尾打印探索度掩码(要抄到后端 FieldExploreRules 的 CITY 一项)
自查图:%TEMP%/lootchain-qa/city_moon/build_classes.jpg / build_strips.jpg
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
import city_moon_gen as GEN  # noqa: E402

ROOT = WG.ROOT
SRC = GEN.OUT
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'citymoon')
DATA_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyCityMoonData.ts')
BACKUP = os.path.join(ROOT, '素材原始备份', 'citymoon-20261111')

PAD_X, PAD_Y = 128, 60         # 补边;PAD_X 是条宽的整数倍(遮挡条直接从底图块取像素,不能跨块)
CELL = 12
ERODE = 4
STRIP_W = 32
VEG_SPLIT_MIN = 14             # 规则 A:植被 / 立物两截各至少这么高才切
BUMP_MIN = 28                  # 规则 B:相邻列的墙脚至少比我高这么多才算「我前面多了个东西」
# 规则 C:门洞拱顶。[列范围 x0, x1, 条的下沿落在 y0..y1 之间, 脚线 y](整图像素)
ARCH_FEET = [
    # 南门:人从桥上下来穿过门洞,拱顶(门楼)要盖住他 → 脚线 = 门柱脚
    (2096, 2290, 2200, 2350, 2412),
]
# 这些框(整图像素 x0, y0, x1, y1)里的条不管后面有没有路都留着:明火前面的东西要能挡住火
KEEP_BOXES = [
    (1490, 1050, 1610, 1190),   # 铁匠炉
]
TREE_H, TREE_AREA, TREE_MAX_W = 150, 9000, 1100
TREE_SLAB = 380                # 宽树冠按这个宽度均分成几片立物(等宽 + 同高 → 风摆时片与片之间不撕缝;一整片太宽摆幅会过大)
TRUNK_W, TRUNK_H = 46, 30      # 树冠底下能走,只挡树干脚下这么大一块
# 手工通道(整图像素折线 + 半宽):图上是通的、但被篷布 / 拱顶盖住算不出来的地方强制可走
BRIDGES = [
    # 广场 → 集市:穿过爬藤石拱门
    ([(2760, 1560), (2850, 1490), (2915, 1440), (2990, 1410), (3080, 1420), (3160, 1440)], 22),
    # 广场 → 南巷的那几级台阶(台阶棱线在分割图里是一道道细线,闭运算后连成一条挡带)
    ([(1990, 1690), (1990, 1900)], 55),
    # 石桥南头 → 南门门洞(门楼顶盖着底下的路)
    ([(2190, 2170), (2190, 2310)], 40),
    # 码头步道在桥头两侧被灯柱 / 系船柱卡窄的两小段
    ([(1400, 2018), (1540, 2018)], 20),
    ([(2240, 2018), (2330, 2018)], 20),
    ([(2420, 2012), (3200, 2012)], 18),
    ([(3530, 1986), (3670, 1986)], 20),
]
# 手工挡线:广场 / 公会院子下沿那道栏杆从大枫树的树冠底下穿过去(沿栏杆柱脚连的线)
BLOCK_LINES = [
    ([(770, 1630), (1120, 1625), (1530, 1650), (1860, 1545)], 14),
]
# 自查:这些点(整图像素)要和出生点连通
KEY_POINTS = {'公会院子': (700, 1300), '集市': (3500, 1400), '东门': (4230, 1210), '码头步道': (2200, 1970), '南门': (2190, 2390),
              '港口': (3600, 1960), '马厩院': (600, 2050), '学院(暂时只是景)': (600, 560), '公园(暂时只是景)': (1900, 420)}
CLOTH_AREA = 1200
WATER_AREA = 6000
BODY_HALF = 64
MAX_TEX = 2048
SPAWN = (GEN.STEP_X + 800, GEN.STEP_Y + 500)       # 中央广场石台左边的空地(整图像素)
REFS = np.array([[255, 255, 255], [0, 255, 0], [255, 0, 0], [0, 0, 255], [0, 255, 255], [0, 0, 0]], np.float32)   # 白 绿 红 蓝 青 黑(黑按蓝算)
GROUND, VEG, CLOTH, SOLID, WATER = 0, 1, 2, 3, 4

SEG_PROMPT = (
    'Generate ONE new image with your image generation tool. Image 1 is a background plate of our own top-down game. Produce a '
    'flat-colour SEGMENTATION MAP of image 1 with exactly the same framing and geometry (every edge in exactly the same place), using '
    'ONLY these five flat colours with hard edges - no shading, no texture, no outlines, no gradients:\n'
    '- pure WHITE #FFFFFF: open ground a character can walk on - paving, lawn, earth paths, stair steps, bridge decks, quays and '
    'piers, the flush round stone dais, the road through an open gate or archway;\n'
    '- pure GREEN #00FF00: trees (trunk and canopy), bushes, hedges, flower beds, vegetable patches, ivy;\n'
    '- pure RED #FF0000: cloth - banners, flags, awnings, canvas roofs of stalls;\n'
    '- pure CYAN #00FFFF: water - canal, harbour basin, pond, trough;\n'
    '- pure BLUE #0000FF: everything else that stands above the ground - buildings, roofs, city walls, towers, gatehouses, fences, '
    'railings, bridge parapets, pillars, lamp posts, wells, statues, notice boards, benches, tables, barrels, crates, carts, stalls, '
    'anvils, stacked wood, boats, mooring posts, low kerb walls and planter edges.\n'
    'Every pixel must be one of the five colours. Same framing and size as image 1 (landscape 16:9, 1672x941).'
)
WINDOWS = {'c': (1, 1)}
WINDOWS.update({name: (r, c) for name, (r, c, _k, _t) in GEN.TILES.items()})


def classify(seg):
    d = ((seg[:, :, None, :].astype(np.float32) - REFS[None, None, :, :]) ** 2).sum(-1)
    lab = d.argmin(-1)
    lab[lab == 5] = SOLID
    votes = np.stack([ndimage.uniform_filter((lab == c).astype(np.float32), 5) for c in range(5)])
    return votes.argmax(0)


def runs_of(col, gap=6):
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
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)))


def save_png(name, rgba):
    dst = os.path.join(DST, name + '.png')
    im = Image.fromarray(rgba, 'RGBA')
    im.save(dst, optimize=True)
    m = WG.meta_for(name, '.png', im.width, im.height, False, False)
    m['userData']['hasAlpha'] = True
    m['userData']['fixAlphaTransparencyArtifacts'] = True
    WG.write_meta(dst, m)


def save_jpg(name, im):
    dst = os.path.join(DST, name + '.jpg')
    im.save(dst, quality=92, subsampling=0)
    WG.write_meta(dst, WG.meta_for(name, '.jpg', im.width, im.height, False, False))


def ensure_dir():
    os.makedirs(DST, exist_ok=True)
    dm = DST + '.meta'
    if not os.path.exists(dm):
        with open(dm, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'ver': '1.2.0', 'importer': 'directory', 'imported': True, 'uuid': str(uuid.uuid4()), 'files': [], 'subMetas': {}, 'userData': {}}, f, indent=2)


def padded_base(plate):
    arr = np.pad(plate, ((PAD_Y, PAD_Y), (PAD_X, PAD_X), (0, 0)), mode='reflect')
    blur = np.asarray(Image.fromarray(arr, 'RGB').filter(ImageFilter.GaussianBlur(14))).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.clip(np.maximum(PAD_X - xx, xx - (w - 1 - PAD_X)) / PAD_X, 0, 1)
    dy = np.clip(np.maximum(PAD_Y - yy, yy - (h - 1 - PAD_Y)) / PAD_Y, 0, 1)
    ramp = np.maximum(dx, dy)[:, :, None]
    out = (arr.astype(np.float32) * (1 - ramp) + blur * ramp) * (1 - 0.55 * ramp)
    return np.clip(out, 0, 255).astype(np.uint8)


def split(n, limit, mult=1):
    """把长度 n 切成尽量均匀的几段,每段 ≤ limit 且(除最后一段)是 mult 的倍数。"""
    k = -(-n // limit)
    size = -(-n // k)
    size = -(-size // mult) * mult
    return k, size


def cmd_seg(redo=False):
    import battle_bg_layer_gen as B
    mosaic = Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB')
    for name, (r, c) in WINDOWS.items():
        dst = os.path.join(SRC, f'seg_{name}.png')
        if os.path.exists(dst) and not redo:
            print('exists', dst)
            continue
        x0, y0 = GEN.origin(r, c)
        crop = os.path.join(SRC, f'_segsrc_{name}.png')
        mosaic.crop((x0, y0, x0 + GEN.TW, y0 + GEN.TH)).save(crop)
        B.run_codex([crop], SEG_PROMPT, dst, f'moon_seg_{name}')
    # 拼整图:每个像素取中心离它最近的那个窗口(重叠带一分为二)
    full = np.zeros((GEN.MH, GEN.MW, 3), np.uint8)
    best = np.full((GEN.MH, GEN.MW), 1e18, np.float64)
    yy, xx = np.mgrid[0:GEN.MH, 0:GEN.MW]
    for name, (r, c) in WINDOWS.items():
        p = os.path.join(SRC, f'seg_{name}.png')
        if not os.path.exists(p):
            print('missing', p)
            continue
        x0, y0 = GEN.origin(r, c)
        seg = np.asarray(Image.open(p).convert('RGB').resize((GEN.TW, GEN.TH), Image.NEAREST))
        d = ((xx[y0:y0 + GEN.TH, x0:x0 + GEN.TW] - (x0 + GEN.TW / 2)) / GEN.TW) ** 2 + ((yy[y0:y0 + GEN.TH, x0:x0 + GEN.TW] - (y0 + GEN.TH / 2)) / GEN.TH) ** 2
        win = best[y0:y0 + GEN.TH, x0:x0 + GEN.TW]
        take = d < win
        full[y0:y0 + GEN.TH, x0:x0 + GEN.TW][take] = seg[take]
        win[take] = d[take]
    Image.fromarray(full).save(os.path.join(SRC, 'seg_full.png'))
    print('wrote seg_full.png')


def cmd_build():
    ensure_dir()
    os.makedirs(BACKUP, exist_ok=True)
    for f in ('mosaic.png', 'seg_full.png'):
        shutil.copy2(os.path.join(SRC, f), os.path.join(BACKUP, f))
    plate = np.asarray(Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB'))
    H, W = plate.shape[:2]
    seg = np.asarray(Image.open(os.path.join(SRC, 'seg_full.png')).convert('RGB').resize((W, H), Image.NEAREST))
    lab = classify(seg)
    # 物体里面的白色小块(亮着的窗 / 木桶描边 / 告示纸)不是地面
    g_cc, g_n = ndimage.label(lab == GROUND)
    sizes = ndimage.sum(lab == GROUND, g_cc, range(1, g_n + 1))
    small = np.isin(g_cc, [i for i, s in enumerate(sizes, 1) if s < 2500])
    lab[small] = SOLID
    ground, veg, cloth, water = lab == GROUND, lab == VEG, lab == CLOTH, lab == WATER
    solid_like = lab == SOLID

    for old in os.listdir(DST):   # 旧的逐件抠图清掉(数量每次不同)
        if old.startswith(('tree_', 'cloth_', 'water_', 'base_', 'fg_', 'mask_')):
            os.remove(os.path.join(DST, old))

    # ── 植被:先按「细脖子」拆开(腐蚀出芯,再把每个像素归给最近的芯),够高的连通块 = 树 ──
    # 树冠底下是能走的(只挡树干):可走判定里把树的像素换成「离它最近的非植被类别」(树冠盖着栏杆就还是栏杆,盖着铺地就是铺地)
    # 枫树这种树冠在分割图里是镂空的(叶缝里露着地面):先闭运算把叶缝填上,否则一腐蚀就碎成一堆小块、认不出是树
    veg_c = ndimage.binary_closing(veg, iterations=8)
    core = ndimage.binary_erosion(veg_c, iterations=12)
    c_lab, c_n = ndimage.label(core)
    trees, tree_union = [], np.zeros((H, W), bool)
    canopy = np.zeros((H, W), bool)          # 所有树(不管抠不抠成立物)的像素
    trunks = np.zeros((H, W), bool)
    if c_n:
        _d, (iy, ix) = ndimage.distance_transform_edt(c_lab == 0, return_indices=True)
        v_lab = np.where(veg_c, c_lab[iy, ix], 0)
        for i, sl in enumerate(ndimage.find_objects(v_lab), 1):
            if sl is None:
                continue
            mask = v_lab[sl] == i
            h, w = mask.shape
            if mask.sum() < TREE_AREA or h < TREE_H:
                continue
            # 贴在墙 / 拱门上的爬藤:外圈一大半是立物 → 不是树
            y0, x0 = max(0, sl[0].start - 8), max(0, sl[1].start - 8)
            y1, x1 = min(H, sl[0].stop + 8), min(W, sl[1].stop + 8)
            m_big = v_lab[y0:y1, x0:x1] == i
            ring = ndimage.binary_dilation(m_big, iterations=7) & ~m_big
            if ring.sum() and solid_like[y0:y1, x0:x1][ring].mean() > 0.62:
                continue
            canopy[sl] |= mask
            # 树干脚:连通块最下面 12 行的水平中心
            ys, xs = np.where(mask)
            foot = sl[0].start + ys.max()
            low = xs[ys >= ys.max() - 12]
            tx = sl[1].start + int(np.median(low))
            trunks[max(0, foot - TRUNK_H):foot + 1, max(0, tx - TRUNK_W // 2):tx + TRUNK_W // 2] = True
            if w > TREE_MAX_W:
                continue          # 太宽的不抠立物(留在遮挡条里),但底下照样能走
            by0, by1 = sl[0].start + ys.min(), foot
            bx0, bx1 = sl[1].start + xs.min(), sl[1].start + xs.max()
            k = -(-(bx1 - bx0 + 1) // TREE_SLAB)
            edges = np.linspace(bx0, bx1 + 1, k + 1).round().astype(int)
            for a0, a1 in zip(edges[:-1], edges[1:]):
                piece = v_lab[by0:by1 + 1, a0:a1] == i
                if piece.sum() < 200:
                    continue
                name = f'tree_{len(trees)}'
                save_png(name, np.dstack([plate[by0:by1 + 1, a0:a1], soft_alpha(piece)]))
                trees.append([name, round((a0 + a1 - 1) / 2, 1), int(by1), int(a1 - a0), int(by1 - by0 + 1)])
                tree_union[by0:by1 + 1, a0:a1] |= piece
    # 树冠底下的类别:取最近的非树像素
    lab_walk = lab.copy()
    if canopy.any():
        d2, (jy, jx) = ndimage.distance_transform_edt(canopy, return_indices=True)
        near = canopy & (d2 <= 24)
        lab_walk[near] = lab[jy[near], jx[near]]
        lab_walk[canopy & (d2 > 24)] = GROUND
    ground_walk = (lab_walk == GROUND) & ~trunks
    # 手工挡线(整图像素折线 + 半宽):树冠底下被盖住的栏杆,按上面的规则会被当成地面,补回来
    if BLOCK_LINES:
        bl = Image.new('L', (W, H), 0)
        bdraw = ImageDraw.Draw(bl)
        for pts, half in BLOCK_LINES:
            bdraw.line(pts, fill=255, width=half * 2)
        ground_walk &= ~(np.asarray(bl) > 0)

    # ── 布 ──
    cl_lab, cl_n = ndimage.label(ndimage.binary_closing(cloth, iterations=2))
    cloths, cloth_union = [], np.zeros((H, W), bool)
    for i, sl in enumerate(ndimage.find_objects(cl_lab), 1):
        mask = cl_lab[sl] == i
        if mask.sum() < CLOTH_AREA:
            continue
        name = f'cloth_{len(cloths)}'
        save_png(name, np.dstack([plate[sl], soft_alpha(mask)]))
        cloths.append([name, round((sl[1].start + sl[1].stop - 1) / 2, 1), int(sl[0].stop - 1), int(sl[1].stop - sl[1].start), int(sl[0].stop - sl[0].start)])
        cloth_union[sl] |= mask

    # ── 水面:贴地件(流水着色器按颜色认水,所以只给它水面那几块像素)──
    w_lab, w_n = ndimage.label(ndimage.binary_opening(water, iterations=2))
    waters = []
    for i, sl in enumerate(ndimage.find_objects(w_lab), 1):
        mask = w_lab[sl] == i
        if mask.sum() < WATER_AREA:
            continue
        hh, ww = mask.shape
        # 太大的水面按 2048 切开
        kx, sx = split(ww, MAX_TEX)
        ky, sy = split(hh, MAX_TEX)
        for a in range(ky):
            for b in range(kx):
                sub = mask[a * sy:(a + 1) * sy, b * sx:(b + 1) * sx]
                if sub.sum() < 400:
                    continue
                yy0, xx0 = sl[0].start + a * sy, sl[1].start + b * sx
                name = f'water_{len(waters)}'
                save_png(name, np.dstack([plate[yy0:yy0 + sub.shape[0], xx0:xx0 + sub.shape[1]], soft_alpha(sub, 1.2)]))
                waters.append([name, xx0 + sub.shape[1] / 2, yy0 + sub.shape[0] / 2, sub.shape[1], sub.shape[0]])

    # ── 遮挡层 + 遮挡条 ──
    M = (lab != GROUND) & (lab != WATER) & ~tree_union & ~cloth_union
    M = ndimage.binary_opening(M, iterations=1)
    veg_m = M & (lab == VEG)
    runs = []
    for i, x0 in enumerate(range(0, W, STRIP_W)):
        x1 = min(W, x0 + STRIP_W)
        occ = M[:, x0:x1].sum(1)
        vg = veg_m[:, x0:x1].sum(1)
        for y0, y1 in runs_of(occ > 0):
            if y1 - y0 < 10:
                continue
            # 规则 A:这一段最下面一截是植被、上面是立物 → 在交界处切开(上半截 = 后面的墙,脚线在交界;下半截 = 墙脚前的花丛)
            rows_veg = vg[y0:y1 + 1] * 2 >= np.maximum(1, occ[y0:y1 + 1])
            k = len(rows_veg) - 1
            while k >= 0 and rows_veg[k]:
                k -= 1
            veg_h = len(rows_veg) - 1 - k
            if veg_h >= VEG_SPLIT_MIN and k >= VEG_SPLIT_MIN and not rows_veg[k - VEG_SPLIT_MIN + 1:k + 1].any():
                runs.append({'i': i, 'x0': x0, 'x1': x1, 'y0': y0, 'y1': y0 + k, 'foot': y0 + k, 'veg': False, 'wall': True})
                runs.append({'i': i, 'x0': x0, 'x1': x1, 'y0': y0 + k + 1, 'y1': y1, 'foot': y1, 'veg': True, 'wall': False})
            else:
                runs.append({'i': i, 'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'foot': y1, 'veg': bool(rows_veg.mean() > 0.6), 'wall': False})
    by_i = {}
    for r in runs:
        by_i.setdefault(r['i'], []).append(r)
        # base = 这条的下沿是真墙脚(紧挨着下面就是地面;规则 A 切出来的墙也算)。布被抠走留下的缺口上沿不是墙脚,不能拿来当依据
        below = ground[r['y1'] + 1:r['y1'] + 9, r['x0']:r['x1']]
        r['base'] = r['wall'] or (below.size > 0 and float(below.mean()) >= 0.3)

    def evidence(r, side):
        """这一侧最近 3 列里「和我上半截重叠、脚线明显比我高」的条 → (隔几列, 它的脚线)。"""
        for dist in (1, 2, 3):
            best = None
            for q in by_i.get(r['i'] + side * dist, []):
                if q['base'] and q['y0'] < r['y1'] - BUMP_MIN and r['y0'] + 20 < q['y1'] < r['y1'] - BUMP_MIN:
                    best = q['y1'] if best is None else max(best, q['y1'])
            if best is not None:
                return dist, best
        return None

    def front_width(r):
        """我脚线附近这个「前面的东西」横向占几列:顺着脚线一列一列往两边找(相邻两列脚线差不超过 20,斜墙脚也跟得上);
        植被段、规则 A 切出来的墙(它们是「后面的墙」,不是这个东西的一部分)不算。"""
        n = 1
        for side in (-1, 1):
            foot = r['y1']
            for dist in (1, 2, 3, 4):
                nxt = [q['y1'] for q in by_i.get(r['i'] + side * dist, [])
                       if not q['veg'] and not q['wall'] and abs(q['y1'] - foot) <= 20 and q['y1'] - q['y0'] >= 16]
                if not nxt:
                    break
                foot = min(nxt, key=lambda v: abs(v - foot))
                n += 1
        return n

    # 规则 B:墙前面的窄东西。两侧都有更高的墙脚(且这东西不超过 4 列宽)→ 在两侧墙脚的连线处切;
    # 只有一侧有(隔不超过 2 列)且这东西不超过 3 列宽 → 按那一侧的墙脚切。宽的东西(房子 / 长花坛)不切:
    # 它们后面真能站人,切了屋顶就盖不住人了。
    split_runs, n_bump = [], 0
    for r in runs:
        cut = None
        if not r['veg']:
            left, right = evidence(r, -1), evidence(r, 1)
            if left and right:
                if front_width(r) <= 4:
                    cut = (left[1] * right[0] + right[1] * left[0]) / (left[0] + right[0])
            elif left or right:
                e = left or right
                if e[0] <= 2 and front_width(r) <= 3:
                    cut = e[1]
        if cut is not None:
            cut = int(round(cut))
            if cut - r['y0'] >= 20 and r['y1'] - cut >= 16:
                split_runs.append(dict(r, y1=cut, foot=cut))
                split_runs.append(dict(r, y0=cut + 1))
                n_bump += 1
                continue
        split_runs.append(r)
    runs = split_runs
    # 规则 C:门洞拱顶手工给脚线
    for ax0, ax1, ay0, ay1, afoot in ARCH_FEET:
        for r in runs:
            if ax0 <= (r['x0'] + r['x1']) / 2 <= ax1 and ay0 <= r['y1'] <= ay1:
                r['foot'] = max(r['foot'], afoot)
    walkish = ground
    keep = np.zeros((H, W), bool)
    for kx0, ky0, kx1, ky1 in KEEP_BOXES:
        keep[ky0:ky1, kx0:kx1] = True
    strips = []
    for r in runs:
        xa, xb = max(0, r['x0'] - BODY_HALF), min(W, r['x1'] + BODY_HALF)
        # 只留用得上的:脚线上方(这条遮住的范围里)左右一个身位内有能走的地面 = 人能站到它后面
        behind = r['foot'] > r['y0'] and walkish[r['y0']:r['foot'], xa:xb].any()
        if behind or keep[r['y0']:r['y1'] + 1, r['x0']:r['x1']].any():
            strips.append([r['x0'], r['y0'], r['x1'] - r['x0'], r['y1'] - r['y0'] + 1, r['foot']])
    print('  runs', len(runs), 'bump splits', n_bump, 'strips', len(strips))

    # ── 可走栅格 ──
    solid = ndimage.binary_opening(ndimage.binary_closing(~ground_walk, iterations=3), iterations=2)
    walk = ndimage.binary_erosion(~solid, iterations=ERODE)
    # 手工通道:折线按半宽画粗
    if BRIDGES:
        br = Image.new('L', (W, H), 0)
        bd = ImageDraw.Draw(br)
        for pts, half in BRIDGES:
            bd.line(pts, fill=255, width=half * 2, joint='curve')
            for x, y in pts:
                bd.ellipse([x - half, y - half, x + half, y + half], fill=255)
        walk |= np.asarray(br) > 0
    cols, rows = -(-W // CELL), -(-H // CELL)
    grid = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            grid[r, c] = walk[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL].mean() >= 0.6
    g_lab, _ = ndimage.label(grid)
    sr, sc = SPAWN[1] // CELL, SPAWN[0] // CELL
    if not grid[sr, sc]:
        ys, xs = np.where(grid)
        k = ((ys - sr) ** 2 + (xs - sc) ** 2).argmin()
        sr, sc = int(ys[k]), int(xs[k])
    # 自查:各街区和出生点连不连通
    for label, (kx, ky) in KEY_POINTS.items():
        kr, kc = ky // CELL, kx // CELL
        ys, xs = np.where(grid)
        k = ((ys - kr) ** 2 + (xs - kc) ** 2).argmin()
        same = g_lab[ys[k], xs[k]] == g_lab[sr, sc]
        print('  %s %s(最近可走格离它 %d 像素)' % ('连通' if same else '【不通】', label, int(np.hypot(ys[k] - kr, xs[k] - kc) * CELL)))
    # 调试图:绿 = 最终可走(和出生点连通),黄 = 可走但没连上,暗红 = 算作地面但被收边 / 栅格吃掉,其余 = 原图压暗
    dbgw = (plate.astype(np.float32) * 0.45)
    up = lambda m: np.kron(m, np.ones((CELL, CELL), bool))[:H, :W]
    conn = up(g_lab == g_lab[sr, sc])
    other = up(grid) & ~conn
    lost = ground_walk & ~up(grid)
    dbgw[lost] = dbgw[lost] * 0.5 + np.array([150, 30, 30]) * 0.5
    dbgw[other] = dbgw[other] * 0.4 + np.array([255, 220, 40]) * 0.6
    dbgw[conn] = dbgw[conn] * 0.4 + np.array([60, 255, 120]) * 0.6
    Image.fromarray(np.clip(dbgw, 0, 255).astype(np.uint8)).save(os.path.join(SRC, 'build_walk.png'))
    grid = g_lab == g_lab[sr, sc]
    hex_cols = -(-cols // 4) * 4
    walk_rows = []
    for r in range(rows):
        bits = ''.join('1' if (c < cols and grid[r, c]) else '0' for c in range(hex_cols))
        walk_rows.append(''.join('%x' % int(bits[k:k + 4], 2) for k in range(0, hex_cols, 4)))

    # ── 灯光:暖色高亮连通块(灯芯 / 亮窗)──
    p = plate.astype(np.int32)
    warm = (p[:, :, 0] >= 222) & (p[:, :, 1] >= 165) & (p[:, :, 0] - p[:, :, 2] >= 60)
    warm = ndimage.binary_closing(warm, iterations=2)
    l_lab, l_n = ndimage.label(warm)
    glows = []
    for i, sl in enumerate(ndimage.find_objects(l_lab), 1):
        area = int((l_lab[sl] == i).sum())
        if area < 28:
            continue
        cy, cx = ndimage.center_of_mass(l_lab[sl] == i)
        glows.append([round(sl[1].start + cx), round(sl[0].start + cy), int(min(215, 44 + 4.8 * area ** 0.5)), area])
    # 靠得很近的并成一个(一盏灯的灯芯常被灯框切成几块)
    glows.sort(key=lambda g: -g[3])
    kept = []
    for g in glows:
        if all((g[0] - k[0]) ** 2 + (g[1] - k[1]) ** 2 > 46 ** 2 for k in kept):
            kept.append(g)
    glows = kept

    # ── 底图切块 + 遮罩(同样的切法、半分辨率)──
    base = padded_base(plate)
    bh, bw = base.shape[:2]
    bkx, bsx = split(bw, MAX_TEX, STRIP_W)
    bky, bsy = split(bh, MAX_TEX)
    assert PAD_X % STRIP_W == 0 and bsx % STRIP_W == 0, '遮挡条不能跨底图块:补边和块宽都得是条宽的整数倍'
    alpha = np.pad(soft_alpha(M, 0.6), ((PAD_Y, PAD_Y), (PAD_X, PAD_X)))
    base_tiles, mask_names = [], []
    for a in range(bky):
        for b in range(bkx):
            sub = base[a * bsy:(a + 1) * bsy, b * bsx:(b + 1) * bsx]
            name = f'base_{len(base_tiles)}'
            save_jpg(name, Image.fromarray(sub, 'RGB'))
            # [贴图名, 中心 x, 中心 y(整图像素,不含补边), 宽, 高]
            base_tiles.append([name, b * bsx + sub.shape[1] / 2 - PAD_X, a * bsy + sub.shape[0] / 2 - PAD_Y, sub.shape[1], sub.shape[0]])
            m = Image.fromarray(np.ascontiguousarray(alpha[a * bsy:(a + 1) * bsy, b * bsx:(b + 1) * bsx]))
            m = m.resize((-(-m.width // 2), -(-m.height // 2)), Image.BILINEAR)
            mname = f'mask_{len(mask_names)}'
            save_jpg(mname, Image.merge('RGB', [m, m, m]))
            mask_names.append(mname)
    # 占位透明图(告示板交互点用:只要名牌和交互,不画东西)
    save_png('blank', np.zeros((8, 8, 4), np.uint8))
    yy, xx = np.mgrid[0:128, 0:128]
    rr = np.clip(np.hypot(xx - 63.5, yy - 63.5) / 63.5, 0, 1)
    save_png('fx_dot', np.dstack([np.full((128, 128, 3), 255, np.uint8), ((1 - rr) ** 2 * (3 - 2 * (1 - rr)) * 255).astype(np.uint8)]))
    # 鸟瞰图(地图页 / 小地图底图):整图缩到 1024 宽
    ov = Image.fromarray(plate).resize((1024, round(1024 * H / W)), Image.LANCZOS)
    save_jpg('overview', ov)

    # ── 自查图 ──
    colors = np.array([[255, 255, 255], [40, 220, 60], [240, 60, 60], [60, 90, 255], [40, 230, 230]], np.float32)
    mix = plate.astype(np.float32) * 0.5 + colors[lab] * 0.5
    Image.fromarray(mix.astype(np.uint8)).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(SRC, 'build_classes.jpg'), quality=86)
    dbg = Image.fromarray(plate).convert('RGBA')
    over = Image.new('RGBA', dbg.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for r in range(rows):
        for c in range(cols):
            if grid[r, c]:
                d.rectangle([c * CELL, r * CELL, (c + 1) * CELL - 1, (r + 1) * CELL - 1], fill=(60, 255, 120, 46))
    for x0, y0, w, h, foot in strips:
        d.line([x0, foot, x0 + w - 1, foot], fill=(255, 40, 40, 255), width=3)
    for name, cx, foot, w, h in trees:
        d.rectangle([cx - w / 2, foot - h, cx + w / 2, foot], outline=(60, 255, 255, 255), width=4)
    for name, cx, foot, w, h in cloths:
        d.rectangle([cx - w / 2, foot - h, cx + w / 2, foot], outline=(255, 90, 255, 255), width=4)
    for x, y, rad, area in glows:
        d.ellipse([x - rad, y - rad, x + rad, y + rad], outline=(255, 220, 80, 230), width=3)
    Image.alpha_composite(dbg, over).convert('RGB').resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(SRC, 'build_strips.jpg'), quality=86)

    data = {'px': [W, H], 'pad': [PAD_X, PAD_Y], 'base': base_tiles, 'tiles': {'cols': bkx, 'tileW': bsx, 'tileH': bsy, 'masks': mask_names},
            'cell': CELL, 'cols': cols, 'walk': walk_rows, 'strips': strips, 'trees': trees, 'cloths': cloths, 'waters': waters,
            'glows': [g[:3] for g in glows], 'spawn': [sc * CELL + CELL // 2, sr * CELL + CELL // 2]}
    with open(DATA_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/**\n * 主城(月夜)整图场景数据(由 tools/qa/city_moon_build.py 生成,别手改)。坐标都是整图像素(左上原点,不含补边)。\n'
                ' * base = 底图块 [贴图名, 中心 x, 中心 y, 宽, 高];tiles = 底图块的切法(带补边的像素)+ 各块的遮罩贴图;walk = 可走栅格(十六进制行,高位在左);\n'
                ' * strips = 遮挡条 [x, y, w, h, 脚线 y];trees / cloths = 随风摆的件 [贴图名, 中心 x, 脚线 y, 宽, 高];waters = 水面贴地件 [贴图名, 中心 x, 中心 y, 宽, 高];\n'
                ' * glows = 自动找到的灯 / 窗 [x, y, 光晕半径]。\n */\n/* eslint-disable */\n'
                'export const CITY_MOON_DATA: { px: number[]; pad: number[]; base: Array<[string, number, number, number, number]>; '
                'tiles: { cols: number; tileW: number; tileH: number; masks: string[] }; cell: number; cols: number; walk: string[]; strips: number[][]; '
                'trees: Array<[string, number, number, number, number]>; cloths: Array<[string, number, number, number, number]>; '
                'waters: Array<[string, number, number, number, number]>; glows: number[][]; spawn: number[] } = '
                + json.dumps(data, ensure_ascii=False, separators=(', ', ': ')) + ' as never;\n')
    print('size', (W, H), 'base tiles', len(base_tiles), (bsx, bsy), 'masks', len(mask_names), 'strips', len(strips), 'of', len(runs),
          'trees', len(trees), 'cloths', len(cloths), 'waters', len(waters), 'glows', len(glows), 'walk cells', int(grid.sum()),
          'class %', [round(float((lab == c).mean()) * 100, 1) for c in range(5)])
    print('wrote', DATA_TS)
    # 探索度的「可探索区块」(8 列 × 5 行,格号 = 行 × 8 + 列,行从顶边往下):块里有可走格才算。
    # 后端 FieldExploreRules.MASKS 的 CITY 一项要和它一致(改了可走区就得跟着改,前后端同发)。
    gy, gx = np.where(grid)
    ec = np.minimum(7, ((gx + 0.5) * CELL / (W / 8)).astype(int))
    er = np.minimum(4, ((gy + 0.5) * CELL / (H / 5)).astype(int))
    mask = 0
    for cell_no in set((er * 8 + ec).tolist()):
        mask |= 1 << int(cell_no)
    print('explore mask(后端 FieldExploreRules CITY)= %dL  可探索 %d / 40 块' % (mask, bin(mask).count('1')))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'seg':
        cmd_seg('--redo' in sys.argv)
    else:
        cmd_build()
