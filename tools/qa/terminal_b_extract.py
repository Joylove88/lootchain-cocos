"""终端 B 风格 1:1(2026-10-30 用户确认原型 周报截图/2026-10-30_终端B风格/proto_terminal_b2.png):
和 terminal_proto_extract.py 同一做法——原型整张当静态底层,只抠掉会变的内容(头像 / 名字 / ID / 等级 / 战力 / EXP 文字与进度条 /
货币数值 / 红点),运行时按原型坐标画回去;头像环单独裁一块带透明孔的覆盖层压在头像上面。
用法:python tools/qa/terminal_b_extract.py
产物:assets/resources/ui/town/terminal/static_b.png(1870×841)、ring_overlay_b.png(200×200)
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402
from slice_sheet import label_components  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '周报截图', '2026-10-30_终端B风格', 'proto_terminal_b2.png')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'town', 'terminal')

src_rgb = np.array(Image.open(SRC).convert('RGB'))
im = np.array(Image.open(SRC).convert('RGBA'))
H, W, _ = im.shape
assert (W, H) == (1870, 841), (W, H)

# 名片左右内侧空白(玻璃面板 x 117..607)
CARD_MARGIN = [(122, 140), (585, 600)]


def row_fill(x0, y0, x1, y1, cols=CARD_MARGIN):
    """按行用名片空白边的中位色填一块(保留玻璃的纵向渐变),去掉文字 / 数值。"""
    for y in range(y0, y1):
        px = np.concatenate([im[y, a:b, :3] for a, b in cols])
        im[y, x0:x1, :3] = np.median(px, axis=0).astype(np.uint8)


def lerp_fill(x0, y0, x1, y1, pad=4):
    """逐行用区域左右紧邻的像素做线性插值(玻璃面板横向有渐变 / 分隔线,取名片边缘的色会露方块)。"""
    t = np.linspace(0, 1, x1 - x0)[:, None]
    for y in range(y0, y1):
        left = im[y, x0 - pad:x0, :3].astype(np.float32).mean(axis=0)
        right = im[y, x1:x1 + pad, :3].astype(np.float32).mean(axis=0)
        im[y, x0:x1, :3] = (left * (1 - t) + right * t).astype(np.uint8)


def ring_fill(cx, cy, r, sample_r):
    ys, xs = np.mgrid[cy - sample_r[1]:cy + sample_r[1] + 1, cx - sample_r[1]:cx + sample_r[1] + 1]
    d = np.hypot(xs - cx, ys - cy)
    ring = (d >= sample_r[0]) & (d <= sample_r[1])
    color = np.median(im[ys[ring], xs[ring], :3], axis=0).astype(np.uint8)
    ys, xs = np.mgrid[cy - r:cy + r + 1, cx - r:cx + r + 1]
    disc = np.hypot(xs - cx, ys - cy) <= r
    im[ys[disc], xs[disc], :3] = color


# 名字 / ID(左对齐 x 331)
lerp_fill(322, 160, 590, 252)
# 等级 / 阵容战力 数值(右对齐 x 573)
lerp_fill(470, 326, 582, 414)
# EXP 文字(左对齐 x 150,y 450)
lerp_fill(145, 437, 300, 464)
# 进度条整条(槽 + 填充)抠掉,运行时整条重画(x 150..573,y 469..483)
lerp_fill(145, 466, 582, 487)
# 货币数值(右对齐 x 497)
lerp_fill(370, 540, 508, 706)
# 头像:圆内填名片暗色(运行时头像盖上)
ys, xs = np.mgrid[0:H, 0:W]
disc = np.hypot(xs - 226, ys - 213) <= 86
im[disc, :3] = np.median(im[300:310, 130:320, :3].reshape(-1, 3), axis=0).astype(np.uint8)
# 红点:纯红小圆,只认格子右上的
red = (src_rgb[:, :, 0] > 180) & (src_rgb[:, :, 1] < 80) & (src_rgb[:, :, 2] < 80)
labels, count = label_components(red, 2)
dots = []
for i in range(1, count + 1):
    ys_, xs_ = np.nonzero((labels == i) & red)
    if 60 < len(ys_) < 2500:
        cx, cy = int(xs_.mean()), int(ys_.mean())
        if not any(abs(cx - ex) < 16 and abs(cy - ey) < 16 for ex, ey in [(812, 132), (1717, 132), (1717, 353), (1261, 563)]):
            continue
        r = int(max(xs_.max() - xs_.min(), ys_.max() - ys_.min()) / 2) + 4
        dots.append((cx, cy, r))
        ring_fill(cx, cy, r, (r + 3, r + 9))
print('dots', dots)

os.makedirs(DST, exist_ok=True)
static_path = os.path.join(DST, 'static_b.png')
Image.fromarray(im).save(static_path, optimize=True)
write_meta(static_path, 'static_b', W, H)

# 头像环覆盖层:原型 (126,113)-(326,313),圆孔 r<80 透明(2px 羽化),其余不透明(盖住方头像四角)
ring = np.array(Image.open(SRC).convert('RGBA'))[113:313, 126:326].copy()
yy, xx = np.mgrid[0:200, 0:200]
d = np.hypot(xx - 100, yy - 100)
ring[:, :, 3] = (np.clip((d - 79) / 2, 0, 1) * 255).astype(np.uint8)
ring_path = os.path.join(DST, 'ring_overlay_b.png')
Image.fromarray(ring).save(ring_path, optimize=True)
write_meta(ring_path, 'ring_overlay_b', 200, 200)
print('groove', np.median(src_rgb[473:480, 400:560].reshape(-1, 3), axis=0), 'fill', np.median(src_rgb[473:480, 170:270].reshape(-1, 3), axis=0))
print('sizes', os.path.getsize(static_path) // 1024, 'KB')
