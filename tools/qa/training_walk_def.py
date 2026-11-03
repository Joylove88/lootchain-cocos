# -*- coding: utf-8 -*-
"""晨风村训练场改可进入场地(11-03 用户「地图显示我在靶场附近但跑不上去」「整个场内都应该可以走动」「移除背景图中的靶子,单独放靶子」):
1. 原图(素材原始备份/training_20261103/vil3_training.orig.png)抹掉场上 4 个木桩靶:用场内干净土面的小块按局部亮度补上,羽化接缝
   → assets/resources/ui/world/vil3/vil3_training.png(贴地画,人走在上面)
2. 前排栅栏 / 石墙 / 门柱、场内小棚、场内石柱切成遮挡件(只取非土面像素),按脚线排序当立物盖在人前面
   → vil3/vil3_training_fg_<n>.png
3. 外轮廓 / 场内地面 / 障碍洞 → assets/scripts/scenes/lobby/LobbyTrainingGround.ts(相对建筑原点,x 右 y 上)
用法:python tools/qa/training_walk_def.py [叠图输出.png]
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ORIG = os.path.join(ROOT, '素材原始备份', 'training_20261103', 'vil3_training.orig.png')
VIL3 = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'vil3')
OUT_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyTrainingGround.ts')
WIDTH = 1888  # LobbyWorldMaps training.width

# ── 贴图像素坐标(1533×891) ──
# 场上 4 个木桩靶(含脚下阴影)
PELLS = [(452, 405, 592, 540), (568, 448, 706, 582), (712, 458, 852, 588), (858, 462, 1000, 592)]
# 干净土面取样块
SOURCES = [(600, 386, 770, 448), (850, 592, 1000, 648), (606, 590, 776, 636)]

# 外轮廓:栅栏一整圈(后排栅栏脚线往外约 45 像素;再往外的草地照常可走,后排栅栏 / 塔楼也切了遮挡件,人走到背后会被挡住)
OUTLINE = [(25, 520), (100, 488), (160, 460), (215, 452), (262, 405), (400, 383), (480, 352), (545, 330), (720, 324), (800, 338),
           (950, 342), (1000, 352), (1100, 328), (1300, 415), (1470, 465), (1528, 515), (1515, 590), (1390, 645), (1220, 712),
           (1030, 782), (820, 868), (505, 795), (450, 772), (330, 722), (40, 566), (25, 545)]
# 场内地面:贴着栅栏 / 后排杂物脚线,入口台阶伸出外轮廓
FLOOR = [(105, 540), (160, 508), (215, 502), (262, 456), (400, 433), (480, 402), (545, 380), (720, 374), (800, 390), (950, 394),
         (1000, 405), (1090, 458), (1180, 503), (1300, 550), (1420, 550), (1450, 560), (820, 770), (578, 684), (500, 712),
         (462, 790), (320, 760), (392, 655), (300, 645)]
# 场内障碍脚底(小棚 / 两根门柱 / 场内石柱)
HOLES = [
    [(268, 560), (450, 555), (452, 628), (270, 605)],
    [(312, 600), (392, 600), (392, 704), (312, 692)],
    [(488, 640), (574, 640), (574, 710), (488, 707)],
    [(1006, 410), (1087, 410), (1087, 449), (1006, 447)],
]
# 遮挡件:区域多边形(只取里面的非土面像素),slice = 竖切宽度(斜栅栏切窄条,每条按自己的脚线排序)
FG = [
    # 前排:左前栅栏 → 左门柱 →(台阶留空)→ 右门柱 / 小石墩 → 石墙上的栅栏 → 右前栅栏
    ([(48, 430), (318, 548), (392, 548), (392, 712), (440, 712), (440, 640), (488, 568), (578, 568), (640, 632), (820, 692),
      (935, 668), (1032, 638), (1127, 606), (1220, 572), (1310, 538), (1387, 510), (1505, 455), (1510, 572), (1387, 626),
      (1310, 658), (1220, 693), (1127, 738), (1032, 763), (935, 798), (820, 848), (505, 772), (440, 750), (392, 712),
      (315, 708), (55, 556)], 32),
    ([(262, 470), (456, 470), (456, 632), (262, 610)], 0),
    ([(1002, 340), (1092, 340), (1092, 452), (1002, 452)], 0),
    # 后排:左后栅栏 / 两座塔楼 / 后排兵器架 / 右侧棚子桌子 / 右后栅栏(场内地面上沿以上;前面几件已占的像素不重复取)
    ([(0, 0), (1533, 0), (1533, 520), (1450, 560), (1420, 550), (1300, 550), (1180, 503), (1090, 458), (1000, 405), (950, 394),
      (800, 390), (720, 374), (545, 380), (480, 402), (400, 433), (262, 456), (215, 502), (160, 508), (105, 540), (0, 560)], 32),
]


def poly_mask(size, pts):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m) > 0


def remove_pells(im):
    arr = np.asarray(im).astype(np.float32)
    out = arr.copy()
    for i, (x0, y0, x1, y1) in enumerate(PELLS):
        w, h = x1 - x0, y1 - y0
        # 局部亮度:洞外一圈的平均色
        ring = arr[y0 - 12:y1 + 12, x0 - 12:x1 + 12, :3].reshape(-1, 3)
        inner = arr[y0:y1, x0:x1, :3].reshape(-1, 3)
        target = (ring.sum(0) - inner.sum(0)) / max(1, len(ring) - len(inner))
        fill = np.zeros((h, w, 3), np.float32)
        yy = 0
        k = i
        while yy < h:
            sx0, sy0, sx1, sy1 = SOURCES[k % len(SOURCES)]
            ph = min(h - yy, sy1 - sy0)
            pw = min(w, sx1 - sx0)
            ox = sx0 + (k * 37) % max(1, (sx1 - sx0) - pw + 1)
            patch = arr[sy0:sy0 + ph, ox:ox + pw, :3]
            patch = patch + (target - patch.reshape(-1, 3).mean(0))
            fill[yy:yy + ph, :pw] = patch
            if pw < w:
                fill[yy:yy + ph, pw:] = patch[:, :w - pw]
            yy += ph
            k += 1
        # 羽化:边缘 10px 渐变混回原图
        yy, xx = np.mgrid[0:h, 0:w]
        edge = np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy]).astype(np.float32)
        a = np.clip(edge / 10.0, 0, 1)[..., None]
        out[y0:y1, x0:x1, :3] = out[y0:y1, x0:x1, :3] * (1 - a) + fill * a
    return Image.fromarray(np.clip(out, 0, 255).round().astype(np.uint8), 'RGBA')


def object_mask(arr):
    """非土面:暗木头 / 灰石头 / 草 / 金属;土面 = 偏暖的浅黄褐。"""
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    lum = (r + g + b) / 3
    dirt = (r - b > 50) & (lum > 128) & (r >= g)
    mx = np.maximum(np.maximum(r, g), b)
    grass = (g > b + 22) & (g >= r - 12) & ((mx - np.minimum(np.minimum(r, g), b)) / np.maximum(1, mx) > 0.25)
    m = Image.fromarray(((~dirt) & (~grass) & (arr[..., 3] > 40)).astype(np.uint8) * 255, 'L')
    # 闭运算补木头高光的小洞,再收一圈去掉土面噪点
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(m) > 0


def drop_specks(mask, min_area=260):
    """去掉零散小块(场内土面上的碎石):不然一颗石子也会盖在人腿上。"""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    keep = np.zeros_like(mask)
    for y0, x0 in zip(*np.where(mask)):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        comp = []
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(comp) >= min_area:
            ys, xs = zip(*comp)
            keep[list(ys), list(xs)] = True
    return keep


def to_rel(pts, im):
    s = WIDTH / im.width
    h = im.height * s
    return [[round(px * s - WIDTH / 2), round(h - py * s)] for px, py in pts]


def main():
    src = Image.open(ORIG).convert('RGBA')
    base = remove_pells(src)
    base.save(os.path.join(VIL3, 'vil3_training.png'), optimize=True)
    s = WIDTH / src.width
    h_world = src.height * s
    arr = np.asarray(base)
    obj = object_mask(arr.astype(np.int32))
    pieces = []
    n = 0
    claimed = np.zeros(obj.shape, bool)
    for pts, slice_w in FG:
        region = drop_specks(poly_mask(src.size, pts) & obj & ~claimed)
        claimed |= region
        xs = np.where(region.any(0))[0]
        x0, x1 = xs.min(), xs.max() + 1
        step = slice_w or (x1 - x0)
        for sx in range(x0, x1, step):
            sub = np.zeros_like(region)
            sub[:, sx:min(x1, sx + step)] = region[:, sx:min(x1, sx + step)]
            if sub.sum() < 30:
                continue
            ys, xs2 = np.where(sub)
            bx0, bx1, by0, by1 = xs2.min(), xs2.max() + 1, ys.min(), ys.max() + 1
            piece = arr[by0:by1, bx0:bx1].copy()
            piece[..., 3] = np.where(sub[by0:by1, bx0:bx1], piece[..., 3], 0)
            name = f'vil3_training_fg_{n}'
            path = os.path.join(VIL3, name + '.png')
            Image.fromarray(piece, 'RGBA').save(path, optimize=True)
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), path], check=True, capture_output=True)
            # 立物锚点 = 贴图底边中点
            pieces.append((name, round(((bx0 + bx1) / 2) * s - WIDTH / 2), round(h_world - by1 * s), round((bx1 - bx0) * s, 1)))
            n += 1
    with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/**\n * 晨风村训练场可进入场地(由 tools/qa/training_walk_def.py 生成,别手改):相对建筑原点的世界坐标(x 右 y 上)。\n')
        f.write(' * outline 外轮廓里只有 floor 能走(holes 是场内障碍脚底);fg = 遮挡件(前排栅栏竖条 / 小棚 / 石柱),当立物按脚线排序盖在人前面。\n */\n')
        f.write(f"export const TRAINING_WALK_MASK = {{\n  outline: {to_rel(OUTLINE, src)},\n  floor: {to_rel(FLOOR, src)},\n  holes: {[to_rel(hh, src) for hh in HOLES]},\n}};\n\n")
        f.write('/** [贴图名, 相对 x, 相对 y(脚线), 显示宽]。 */\n')
        f.write('export const TRAINING_FG: Array<[string, number, number, number]> = [\n')
        for p in pieces:
            f.write(f"  ['{p[0]}', {p[1]}, {p[2]}, {p[3]}],\n")
        f.write('];\n')
    print('pieces', n)
    if len(sys.argv) > 1:
        bg = Image.new('RGBA', src.size, (60, 90, 50, 255))
        bg.alpha_composite(base)
        ov = Image.new('RGBA', src.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        d.polygon(OUTLINE, fill=(255, 0, 0, 60), outline=(255, 0, 0, 255))
        d.polygon(FLOOR, fill=(0, 255, 0, 90), outline=(0, 255, 0, 255))
        for hh in HOLES:
            d.polygon(hh, fill=(255, 0, 255, 140), outline=(255, 0, 255, 255))
        bg.alpha_composite(ov)
        fgv = Image.new('RGBA', src.size, (60, 90, 50, 255))
        fgv.alpha_composite(base)
        tint = np.zeros((src.height, src.width, 4), np.uint8)
        allfg = np.zeros((src.height, src.width), bool)
        for pts, _ in FG:
            allfg |= drop_specks(poly_mask(src.size, pts) & obj & ~allfg)
        tint[allfg] = (0, 160, 255, 150)
        fgv.alpha_composite(Image.fromarray(tint, 'RGBA'))
        sheet = Image.new('RGBA', (src.width, src.height * 2))
        sheet.paste(bg, (0, 0))
        sheet.paste(fgv, (0, src.height))
        sheet.convert('RGB').save(sys.argv[1])


if __name__ == '__main__':
    main()
