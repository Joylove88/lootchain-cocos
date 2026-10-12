# -*- coding: utf-8 -*-
"""单套 v2 特效图集修复(2026-10-12,夜烬女王战技 v2_a49_447 起用):
fx_pack_v2 的部分素材按黑底叠加设计,序列帧(如火墙)在矩形边缘仍有 ~10% 不透明度,
放到守卫战灰色地面上会露出矩形框。做法同 hu_fix_tex.py:
1) 整帧序列帧(宽 >= --min-w,默认 200)做"上沿 + 两侧上半段"羽化:火焰在帧的上沿/两侧被裁断才成矩形框,
   下半段是贴地法阵,两端本来就顶到帧边,不能削;
   火墙原图自带竖直切边 / 中缝:上半段按行水平模糊(--blur 像素半径);
   另外整帧铺着一层低不透明度薄雾(alpha 20~60),帧边一带把它渐隐(亮的法阵 / 火焰 alpha 高,保留);
2) 暗色像素按亮度降不透明度:法阵中心的暗紫圆盘在黑底上看不见,灰地面上成了一块暗斑 → 接近叠加发光观感;
3) 整张图转预乘透明(RGB×A)并在图集头写 pma: true(出包压缩据此跳过),代码侧把该 effect 加进 battleFxPremultiplied 名单。
首次运行把原图备份到 素材原始备份/<备份目录>/<code>/,之后总是从备份重算,可重复执行。
用法:python tools/qa/fxprev/fx_feather_tex.py <code> <备份目录名> [--min-w 200] [--blur 3] [--write]"""
import glob, os, shutil, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
src = open(os.path.join(HERE, 'hu_fix_tex.py'), encoding='utf-8').read()
ns = {'__file__': os.path.join(HERE, 'hu_fix_tex.py')}
exec(src[:src.index('\n', src.index('return float(ring.mean()), float((ring > 24).mean())')) + 1], ns)
parse_atlas, feather_mask, ring_stats = ns['parse_atlas'], ns['feather_mask'], ns['ring_stats']

code, backup_name = sys.argv[1], sys.argv[2]
WRITE = '--write' in sys.argv
MIN_W = int(sys.argv[sys.argv.index('--min-w') + 1]) if '--min-w' in sys.argv else 200
BLUR = int(sys.argv[sys.argv.index('--blur') + 1]) if '--blur' in sys.argv else 3


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def top_side_mask(w, h):
    ys = (np.arange(h) + 0.5)[:, None]
    xs = (np.arange(w) + 0.5)[None, :]
    top = smoothstep(ys / (0.34 * h))
    side = smoothstep(np.minimum(xs, w - xs) / (0.3 * w))
    # 两侧羽化只作用在上半段(火墙):y<=0.42h 全强度,到 0.62h 衰减为 0(法阵两端保留)
    strength = 1 - smoothstep((ys - 0.42 * h) / (0.2 * h))
    # 法阵左右两端原图就顶到帧边被切平:全高再加一道窄羽化(宽 7%)
    narrow = smoothstep(np.minimum(xs, w - xs) / (0.07 * w))
    return top * (1 - strength * (1 - side)) * narrow
d = os.path.join(REPO, 'assets', 'resources', 'spine', 'effect', code)
bak = os.path.join(REPO, '素材原始备份', backup_name, code)
pngs = [p for p in glob.glob(os.path.join(d, '*.png'))]
os.makedirs(bak, exist_ok=True)
for p in pngs:
    target = os.path.join(bak, os.path.basename(p))
    if not os.path.exists(target):
        shutil.copy2(p, target)
regs = parse_atlas(os.path.join(d, code + '.atlas'))
for p in pngs:
    img = np.asarray(Image.open(os.path.join(bak, os.path.basename(p))).convert('RGBA')).astype(np.float32)
    count = 0
    for name, (x, y, w, h) in regs.items():
        if w < MIN_W:
            continue
        # 火墙(上半段)原图就有竖直切边与中缝:按行做水平模糊(RGB 与 alpha 一起,先预乘再模糊),
        # 0.5h 以下逐渐过渡回原图,贴地法阵不受影响
        tile = img[y:y+h, x:x+w].copy()
        pm = np.concatenate([tile[..., :3] * tile[..., 3:4] / 255.0, tile[..., 3:4]], axis=-1)
        k = 2 * BLUR + 1
        pad = np.pad(pm, ((0, 0), (BLUR, BLUR), (0, 0)), mode='constant')
        cs = np.cumsum(pad, axis=1)
        cs = np.concatenate([np.zeros_like(cs[:, :1]), cs], axis=1)
        blurred = (cs[:, k:] - cs[:, :-k]) / k
        wy = (1 - smoothstep(((np.arange(h) + 0.5) / h - 0.5) / 0.14))[:, None, None]
        pm = pm * (1 - wy) + blurred * wy
        al = np.maximum(pm[..., 3:4], 1e-3)
        tile = np.concatenate([np.where(al > 1e-2, pm[..., :3] * 255.0 / al, 0), pm[..., 3:4]], axis=-1)
        img[y:y+h, x:x+w] = tile
        a = img[y:y+h, x:x+w, 3]
        edge = feather_mask(w, h, int(max(6, round(0.2 * min(w, h)))))
        keep_bright = smoothstep((a - 48) / 112)
        a = a * (edge + (1 - edge) * keep_bright) * top_side_mask(w, h)
        img[y:y+h, x:x+w, 3] = a
        count += 1
    lum = img[..., :3].max(axis=2) / 255.0
    img[..., 3] = img[..., 3] * np.clip(lum / 0.75, 0.15, 1) ** 1.3
    print(os.path.basename(p), 'feather', count, '/', len(regs), 'regions')
    if WRITE:
        al = img[..., 3:4] / 255.0
        out = np.concatenate([img[..., :3] * al, img[..., 3:4]], axis=-1)
        Image.fromarray((out + 0.5).clip(0, 255).astype(np.uint8), 'RGBA').save(p, optimize=True)
# 图集头标 pma: true:出包 PNG 压缩(compress-build-png.py)靠它跳过预乘图,
# 否则调色板量化按直通透明处理,透明区冒出绿色矩形(2026-10-13 用户手机实测夜烬女王战技)
atlas = os.path.join(d, code + '.atlas')
text = open(atlas, encoding='utf-8', newline='').read()
if WRITE and 'pma: true' not in text:
    nl = chr(13) + chr(10) if chr(13) + chr(10) in text else chr(10)
    lines = text.split(nl)
    at = next(i for i, ln in enumerate(lines) if ln.strip().startswith('repeat:'))
    lines.insert(at + 1, 'pma: true')
    open(atlas, 'w', encoding='utf-8', newline='').write(nl.join(lines))
    print('atlas header: pma: true')
print('WRITTEN' if WRITE else 'dry-run', 'backup:', bak)
