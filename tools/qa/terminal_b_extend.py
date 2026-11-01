"""终端底图上下外扩(2026-11-01 用户「终端上下有空白黑边」):原型 1870×841 在 16:9 电脑屏等比放进去上下留空,
从原图上沿第 29 行(上面是原型自带的平色带)/ 底边按列外扩各 200 行,往外渐暗;标题 / 关闭钮所在列按两侧插值,原图内容不动。
输入 素材原始备份/terminal_static_b_1101/static_b.png(terminal_b_extract.py 的产物),输出 ui/town/terminal/static_b_ext.png(1870×1241)。
"""
import numpy as np
from PIL import Image, ImageFilter

SRC = '素材原始备份/terminal_static_b_1101/static_b.png'
DST = 'assets/resources/ui/town/terminal/static_b_ext.png'
PAD, TOP = 200, 29

a = np.asarray(Image.open(SRC).convert('RGB'), dtype=float)
H, W = a.shape[:2]


def row_from(rows, holes=()):
    row = a[rows].mean(0).copy()
    for x0, x1 in holes:
        for c in range(3):
            row[x0:x1, c] = np.linspace(row[x0 - 1, c], row[x1, c], x1 - x0)
    r = Image.fromarray(np.clip(row[None].repeat(9, 0), 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))
    return np.asarray(r, dtype=float)[4]


rt = row_from(slice(TOP, TOP + 2), holes=[(50, 230), (1715, 1830)])
rb = row_from(slice(H - 4, H))
out = np.zeros((H + 2 * PAD, W, 3))
out[PAD:PAD + H] = a
for y in range(PAD + TOP):
    out[y] = rt * (1 - 0.45 * (PAD + TOP - y) / (PAD + TOP))
for y in range(PAD + H, H + 2 * PAD):
    out[y] = rb * (1 - 0.45 * (y - PAD - H) / PAD)
Image.fromarray(np.clip(out, 0, 255).astype('uint8')).save(DST)
print(DST, W, H + 2 * PAD)
