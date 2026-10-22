# 用法:python tools/qa/equip_icon_remake_transparent.py <out_dir> <raw_dir>
# 2026-10-22 装备图标 v3c:暗底抠透明(用户「流光加图标背景上」:背景流光要垫在装备图后面,所以底必须透明)
# raw 1254 → 描边内侧内容:从四角 / 四边中点洪水填充与底色相近(dist<T1)的连通区=底;再以 T2 做第二次填充得到光晕带,alpha 按 dist 线性过渡
# 512 输出:透明画布 + 内容(带 alpha)+ 程序重画的稀有度描边(同 remake_border.py)
import glob, os, sys, statistics
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out_c')
RAW = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'raw')  # GPT 原图目录(1254 方、暗底 + 描边)
os.makedirs(OUT, exist_ok=True)
S = 512; SS = 4
INSET, WIDTH, RADIUS = 14, 16, 40
T1, T2 = 24, 96

def find_border(g, W, H):
    def peak(get):
        sc = [sum(get(i, t) for t in range(int(H * 0.3), int(H * 0.7), 4)) for i in range(90)]
        return max(range(90), key=lambda i: sc[i])
    l = peak(lambda i, t: g.getpixel((i, t))); r = peak(lambda i, t: g.getpixel((W - 1 - i, t)))
    t_ = peak(lambda i, t: g.getpixel((t, i))); b = peak(lambda i, t: g.getpixel((t, H - 1 - i)))
    return l, r, t_, b

def border_color(im, g, W, H, l):
    xs = range(max(l - 3, 0), l + 4)
    px = [im.getpixel((x, y)) for x in xs for y in range(int(H * 0.3), int(H * 0.7), 6) if g.getpixel((x, y)) > 60]
    if not px:
        return (200, 200, 200)
    return tuple(int(statistics.median(c[i] for c in px)) for i in range(3))

def region(binary_np, seeds):
    # binary_np: True=候选;用 PIL floodfill 在 L 图上从各 seed 填 128,返回被填到的掩码
    # PIL 12 的 floodfill 在 L 模式下不填(实测 0 像素),转 RGB 再填
    img = Image.fromarray(np.where(binary_np, 255, 0).astype(np.uint8), 'L').convert('RGB')
    for sx, sy in seeds:
        if img.getpixel((sx, sy))[0] == 255:
            ImageDraw.floodfill(img, (sx, sy), (128, 0, 0))
    return np.asarray(img)[:, :, 0] == 128

for f in sorted(glob.glob(os.path.join(RAW, 'equip_*.png'))):
    name = os.path.basename(f)
    im = Image.open(f).convert('RGB'); g = im.convert('L'); W, H = im.size
    l, r, t_, b = find_border(g, W, H)
    col = border_color(im, g, W, H, l)
    m = 20
    inner = im.crop((l + m, t_ + m, W - r - m, H - b - m))
    a = np.asarray(inner).astype(np.int16); h, w = a.shape[:2]
    ring = np.concatenate([a[:30].reshape(-1, 3), a[-30:].reshape(-1, 3), a[:, :30].reshape(-1, 3), a[:, -30:].reshape(-1, 3)])
    plate = np.median(ring, axis=0)
    dist = np.abs(a - plate).max(axis=2)
    seeds = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    R1 = region(dist < T1, seeds)
    R2 = region(dist < T2, seeds)
    alpha = np.full((h, w), 255, np.float32)
    halo = R2 & ~R1
    alpha[halo] = np.clip((dist[halo] - T1) / (T2 - T1), 0, 1) * 255
    alpha[R1] = 0
    rgba = np.dstack([np.asarray(inner), alpha.astype(np.uint8)])
    content = Image.fromarray(rgba, 'RGBA')
    innerS = S - 2 * (INSET + WIDTH + 6)
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    canvas.alpha_composite(content.resize((innerS, innerS), Image.LANCZOS), ((S - innerS) // 2, (S - innerS) // 2))
    ringimg = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(ringimg)
    d.rounded_rectangle(((INSET - 2) * SS, (INSET - 2) * SS, (S - INSET + 2) * SS - 1, (S - INSET + 2) * SS - 1), radius=(RADIUS + 2) * SS, outline=(0, 0, 0, 160), width=2 * SS)
    d.rounded_rectangle((INSET * SS, INSET * SS, (S - INSET) * SS - 1, (S - INSET) * SS - 1), radius=RADIUS * SS, outline=col + (255,), width=WIDTH * SS)
    canvas.alpha_composite(ringimg.resize((S, S), Image.LANCZOS))
    canvas.save(os.path.join(OUT, name))
    print(name, 'plate', plate.astype(int).tolist(), 'transparent %', round(100 * (alpha < 8).mean(), 1))
print('done ->', OUT)
