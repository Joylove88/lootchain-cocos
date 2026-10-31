# -*- coding: utf-8 -*-
"""Meowa 换皮贴图回填到原骨骼(2026-10-31):
Meowa 导入时会按图集尺寸重建附件大小(放大过的图集 → 骨骼也跟着放大,v2_a47_217 ×4 后整体大 4 倍),
所以只拿它画好的贴图:按区域名把新贴图逐块搬回「我们自己放大过的图集」(spine_atlas_scale 产物),骨骼仍用原 skel / json。
同时逐块做颜色统计对齐(按透明度加权的均值 / 标准差,RGB 各通道):特效里原本暗色的烟雾 / 冲击波块,AI 常画成灰白实心,
对齐后回到原版的色相与明暗,只保留新画出的细节。透明度取新图(轮廓更细),但不超过原版同位置透明度 ×1.3;再把原版以 --halo(默认 0.55)透明度垫在下面,保住柔光渐隐。
用法:python tools/qa/fx_tex_repack.py <放大后的源目录> <Meowa 产物目录> <输出目录> <基名> [--no-color] [--halo 0.55]
"""
import os, re, shutil, sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
SRC, NEW, OUT, BASE = args[0], args[1], args[2], args[3]
COLOR = '--no-color' not in args
# 柔光底:原版贴图按此透明度垫在新贴图下面(AI 画的边缘常偏硬,发光特效的柔和光晕 / 渐隐靠它保住);0 = 不垫
HALO = float(args[args.index('--halo') + 1]) if '--halo' in args else 0.55


def parse_atlas(path):
    """→ {page: str, regions: {name: dict(x, y, w, h, rot, ow, oh, ox, oy)}}(新旧两种写法统一;ox / oy = 去白边后左下角偏移)。"""
    lines = [l.rstrip('\n') for l in open(path, encoding='utf-8')]
    pages, regions, cur, page = [], {}, None, None
    for raw in lines:
        s = raw.strip()
        if not s:
            continue
        m = re.match(r'^([a-zA-Z]+)\s*:\s*(.*)$', s)
        if m is None:
            if s.lower().endswith(('.png', '.jpg', '.webp')):
                page, cur = s, None
                pages.append(page)
            else:
                cur = {'page': page, 'rot': False}
                regions[s] = cur
            continue
        if cur is None:
            continue
        key, val = m.group(1), m.group(2)
        nums = [v.strip() for v in val.split(',')]
        if key == 'rotate':
            cur['rot'] = val.strip() in ('true', '90')
        elif key == 'xy':
            cur['x'], cur['y'] = int(nums[0]), int(nums[1])
        elif key == 'size':
            cur['w'], cur['h'] = int(nums[0]), int(nums[1])
        elif key == 'orig':
            cur['ow'], cur['oh'] = int(nums[0]), int(nums[1])
        elif key == 'offset':
            cur['ox'], cur['oy'] = int(nums[0]), int(nums[1])
        elif key == 'bounds':
            cur['x'], cur['y'], cur['w'], cur['h'] = map(int, nums[:4])
        elif key == 'offsets':
            cur['ox'], cur['oy'], cur['ow'], cur['oh'] = map(int, nums[:4])
    for r in regions.values():
        r.setdefault('ow', r['w'])
        r.setdefault('oh', r['h'])
        r.setdefault('ox', 0)
        r.setdefault('oy', 0)
    return pages, regions


def crop_upright(img, r, rot_dir):
    """区域裁出来并转正(旋转存放的块宽高互换)。"""
    w, h = (r['h'], r['w']) if r['rot'] else (r['w'], r['h'])
    piece = img.crop((r['x'], r['y'], r['x'] + w, r['y'] + h))
    if r['rot']:
        piece = piece.rotate(rot_dir, expand=True)
    return piece


def full_canvas(img, r, rot_dir):
    """去白边前的完整画布(orig 尺寸),偏移按 Spine 口径(左下角为原点)。"""
    piece = crop_upright(img, r, rot_dir)
    canvas = Image.new('RGBA', (r['ow'], r['oh']), (0, 0, 0, 0))
    canvas.paste(piece, (r['ox'], r['oh'] - r['oy'] - piece.height))
    return canvas


def match_color(new, ref):
    a = np.asarray(new).astype(np.float32)
    b = np.asarray(ref).astype(np.float32)
    wa = a[..., 3:4] / 255.0
    wb = b[..., 3:4] / 255.0
    if wa.sum() < 1 or wb.sum() < 1:
        return new
    out = a.copy()
    for c in range(3):
        ma = (a[..., c:c + 1] * wa).sum() / wa.sum()
        sa = np.sqrt((((a[..., c:c + 1] - ma) ** 2) * wa).sum() / wa.sum()) + 1e-3
        mb = (b[..., c:c + 1] * wb).sum() / wb.sum()
        sb = np.sqrt((((b[..., c:c + 1] - mb) ** 2) * wb).sum() / wb.sum()) + 1e-3
        out[..., c] = np.clip((a[..., c] - ma) * (sb / sa) + mb, 0, 255)
    # 透明度:新图轮廓,但不超过原版 ×1.3(防止原本半透明的烟雾变成实心)
    out[..., 3] = np.minimum(a[..., 3], np.clip(b[..., 3] * 1.3, 0, 255))
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def is_pma(img):
    """贴图是否预乘透明(RGB ≤ A 几乎处处成立;feather 处理过的 v2 特效 / hu 大招包是预乘的,见 battleFxPremultiplied)。"""
    a = np.asarray(img).astype(np.int32)
    m = a[..., 3] > 8
    return bool(m.any()) and float(((a[..., :3].max(-1) > a[..., 3] + 3) & m).mean()) < 0.002


def unpremultiply(img):
    a = np.asarray(img).astype(np.float32)
    k = np.where(a[..., 3:4] > 0, 255.0 / np.maximum(a[..., 3:4], 1), 0)
    a[..., :3] = np.clip(a[..., :3] * k, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def premultiply(img):
    a = np.asarray(img).astype(np.float32)
    a[..., :3] = a[..., :3] * a[..., 3:4] / 255.0
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def main():
    src_pages, src_regions = parse_atlas(os.path.join(SRC, BASE + '.atlas'))
    new_atlas = [f for f in os.listdir(NEW) if f.endswith('.atlas')][0]
    new_pages, new_regions = parse_atlas(os.path.join(NEW, new_atlas))
    src_imgs = {p: Image.open(os.path.join(SRC, p)).convert('RGBA') for p in src_pages}
    # 原图是预乘透明:先还原成直通透明再对齐 / 垫底,输出时再预乘回去(否则游戏按预乘画,新画的亮部会过曝)
    pma_pages = {p for p, im in src_imgs.items() if is_pma(im)}
    src_imgs = {p: unpremultiply(im) if p in pma_pages else im for p, im in src_imgs.items()}
    new_imgs = {p: Image.open(os.path.join(NEW, p)).convert('RGBA') for p in new_pages}
    out_imgs = {p: im.copy() for p, im in src_imgs.items()}
    os.makedirs(OUT, exist_ok=True)
    done = missing = 0
    for name, r in src_regions.items():
        n = new_regions.get(name)
        if n is None:
            missing += 1
            continue
        # 0 尺寸的空区域(特效包里偶有占位附件)没东西可搬
        if min(r['w'], r['h'], r['ow'], r['oh'], n['w'], n['h'], n['ow'], n['oh']) <= 0:
            continue
        ref = full_canvas(src_imgs[r['page']], r, 90)
        # 新图集旋转方向不确定:两种都试,和原版透明度更接近的那个对
        best = None
        for rot_dir in ((90, -90) if n['rot'] else (0,)):
            cand = full_canvas(new_imgs[n['page']], n, rot_dir).resize((r['ow'], r['oh']), Image.LANCZOS)
            diff = np.abs(np.asarray(cand)[..., 3].astype(np.int32) - np.asarray(ref)[..., 3].astype(np.int32)).mean()
            if best is None or diff < best[0]:
                best = (diff, cand)
        piece = best[1]
        if COLOR:
            piece = match_color(piece, ref)
        if HALO > 0:
            under = np.asarray(ref).astype(np.float32)
            under[..., 3] *= HALO
            piece = Image.alpha_composite(Image.fromarray(under.astype(np.uint8), 'RGBA'), piece)
        # 切回原图集的去白边区域,按原来的存放方式(含旋转)贴回
        w, h = r['w'], r['h']
        stripped = piece.crop((r['ox'], r['oh'] - r['oy'] - h, r['ox'] + w, r['oh'] - r['oy']))
        if r['rot']:
            stripped = stripped.rotate(-90, expand=True)
        page = out_imgs[r['page']]
        page.paste(Image.new('RGBA', stripped.size, (0, 0, 0, 0)), (r['x'], r['y']))
        page.paste(stripped, (r['x'], r['y']))
        done += 1
    for p, im in out_imgs.items():
        (premultiply(im) if p in pma_pages else im).save(os.path.join(OUT, p))
    if pma_pages:
        print('premultiplied pages:', ', '.join(sorted(pma_pages)))
    for f in os.listdir(SRC):
        if os.path.splitext(f)[1] in ('.skel', '.json', '.atlas'):
            shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
    print(f'repacked {done} regions, missing {missing} -> {OUT}')


main()
