# -*- coding: utf-8 -*-
"""hu_* 大招图集修复(2026-10-06 用户「实机看着假」):
1) 内容铺满到矩形边框的区域(AE 渲染的烟尘 / 爆炸序列帧、光柱、发光块)做边缘羽化——
   这类帧在图集里就是一整块半透明矩形(例:hu_093 tx/exp02 距边 13px 处 alpha 已到 86/255),战场上直接显示成硬边矩形;
2) 整张图转预乘透明(RGB×A),配合代码 premultipliedAlpha=true。
从 素材原始备份/hu-ult-pma-20261006(非预乘原图)重算,可重复执行。用法:python hu_fix_tex.py [--write]"""
import glob, json, os, sys
import numpy as np
from PIL import Image
ROOT = 'assets/resources/spine/effect'
ORIG = '素材原始备份/hu-ult-pma-20261006'
OUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hu_fix_tex.json')
WRITE = '--write' in sys.argv

def parse_atlas(path):
    regs = {}; cur = None; hdr = True
    for ln in open(path, encoding='utf-8').read().splitlines():
        if not ln.strip():
            cur = None; hdr = True; continue
        if hdr and ln.strip().endswith('.png'):
            continue
        if ':' in ln and (ln[0] in ' \t' or (hdr and ln.split(':')[0] in ('size', 'format', 'filter', 'repeat', 'pma', 'scale'))):
            if cur is None:
                continue
            k, v = ln.split(':', 1); regs[cur][k.strip()] = v.strip()
        else:
            hdr = False; cur = ln.strip(); regs[cur] = {}
    out = {}
    for n, r in regs.items():
        if 'bounds' in r:
            x, y, w, h = map(int, r['bounds'].split(','))
        else:
            x, y = map(int, r['xy'].split(',')); w, h = map(int, r['size'].split(','))
        if r.get('rotate', 'false') in ('true', '90'):
            w, h = h, w
        out[n] = (x, y, w, h)
    return out

def smoothstep(t):
    t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)

def feather_mask(w, h, band):
    xs = np.arange(w) + 0.5; ys = np.arange(h) + 0.5
    fx = np.minimum(smoothstep(xs / band), smoothstep((w - xs) / band))
    fy = np.minimum(smoothstep(ys / band), smoothstep((h - ys) / band))
    return fy[:, None] * fx[None, :]

def ellipse_mask(w, h, soft=0.45):
    """椭圆柔边:中心 1,到内切椭圆边界降到 0(四角全部去掉)。AE 渲染的烟尘 / 爆炸序列帧整帧都是半透明内容,只有这样才不成矩形。"""
    xs = (np.arange(w) + 0.5) / (w / 2) - 1
    ys = (np.arange(h) + 0.5) / (h / 2) - 1
    r = np.sqrt(xs[None, :] ** 2 + ys[:, None] ** 2)
    return smoothstep((1 - r) / soft)

def ring_stats(a, e):
    h, w = a.shape
    m = np.ones((h, w), bool); m[e:h-e, e:w-e] = False
    ring = a[m]
    return float(ring.mean()), float((ring > 24).mean())

report = {}
for d in sorted(p for p in glob.glob(os.path.join(ROOT, 'hu_*')) if os.path.isdir(p)):
    code = os.path.basename(d)
    img = np.asarray(Image.open(os.path.join(ORIG, code + '.png')).convert('RGBA')).astype(np.float32)
    regs = parse_atlas(os.path.join(d, code + '.atlas'))
    rows = []
    for name, (x, y, w, h) in regs.items():
        if w < 20 or h < 20:
            continue
        a = img[y:y+h, x:x+w, 3]
        short = min(w, h)
        # 判定 A:最外 3px 有内容(真正被裁切到边的图);判定 B:短边 12% 的环带里有明显内容(序列帧铺满到边,只留 1~2px 透明边)
        m3, f3 = ring_stats(a, 3)
        bd = int(max(3, min(32, round(0.12 * short))))
        mb, fb = ring_stats(a, bd)
        hard = m3 > 8 or f3 > 0.12
        filled = mb > 6 or fb > 0.08
        if not (hard or filled):
            continue
        band = int(max(4, min(64, round(0.22 * short))))
        # 贴边被裁切的图(hard):矩形带状羽化,保住形状;整帧铺满但留了软边的序列帧(filled):椭圆柔边,彻底去掉矩形感
        rows.append({'region': name, 'w': w, 'h': h, 'why': 'hard' if hard else 'filled', 'ring3': round(m3, 1), 'ring12%': round(mb, 1), 'band': band, 'meanA': round(float(a.mean()), 1)})
        if WRITE:
            img[y:y+h, x:x+w, 3] = a * (feather_mask(w, h, band) if hard else ellipse_mask(w, h))
    report[code] = rows
    if WRITE:
        al = img[..., 3:4] / 255.0
        out = np.concatenate([img[..., :3] * al, img[..., 3:4]], axis=-1)
        Image.fromarray((out + 0.5).clip(0, 255).astype(np.uint8), 'RGBA').save(os.path.join(d, code + '.png'), optimize=True)
    print('%s feather %3d / %3d regions  %s' % (code, len(rows), len(regs), ', '.join(r['region'] + ('*' if r['why'] == 'hard' else '') for r in sorted(rows, key=lambda r: -r['meanA'])[:5])))
json.dump(report, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('total', sum(len(v) for v in report.values()), 'WRITTEN' if WRITE else 'dry-run')
