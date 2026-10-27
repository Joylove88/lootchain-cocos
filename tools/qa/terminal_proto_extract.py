"""终端 1:1 还原(docs/51,2026-10-27 用户:「和原型还是有差异需要1:1还原」):
把原型 proto_terminal_v2(1870×841)整张当静态底层,只抠掉会变的内容(头像 / 名字 / UID / 等级 / 战力 / 经验条填充 / 货币数值 / 红点),
运行时按同一套原型坐标把动态内容画回去;头像环单独裁一块带透明孔的覆盖层压在头像上面。
用法:python tools/qa/terminal_proto_extract.py
产物:assets/resources/ui/town/terminal/static.png(1870×841)、ring_overlay.png(250×250)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '周报截图', '2026-10-27_主城HUD原型', 'v3', 'proto_terminal_v2.png')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'town', 'terminal')

im = np.array(Image.open(SRC).convert('RGBA'))
H, W, _ = im.shape
assert (W, H) == (1870, 841), (W, H)


def row_fill(x0, y0, x1, y1, sample_cols):
    """按行用名片空白边的中位色填一块(保留纵向渐变),去掉文字 / 数值。"""
    for y in range(y0, y1):
        px = np.concatenate([im[y, a:b, :3] for a, b in sample_cols])
        im[y, x0:x1, :3] = np.median(px, axis=0).astype(np.uint8)


def ring_fill(cx, cy, r, sample_r=(16, 22)):
    """用圆环外一圈的中位色填圆(抠红点)。"""
    ys, xs = np.mgrid[cy - sample_r[1]:cy + sample_r[1] + 1, cx - sample_r[1]:cx + sample_r[1] + 1]
    d = np.hypot(xs - cx, ys - cy)
    ring = (d >= sample_r[0]) & (d <= sample_r[1])
    color = np.median(im[ys[ring], xs[ring], :3], axis=0).astype(np.uint8)
    ys, xs = np.mgrid[cy - r:cy + r + 1, cx - r:cx + r + 1]
    disc = np.hypot(xs - cx, ys - cy) <= r
    im[ys[disc], xs[disc], :3] = color


CARD_MARGIN = [(118, 134), (478, 494)]
# 名字 / ID
row_fill(150, 304, 462, 392, CARD_MARGIN)
# 等级 / 阵容战力 数值
row_fill(370, 418, 472, 494, CARD_MARGIN)
# EXP 文字
row_fill(372, 504, 472, 530, CARD_MARGIN)
# 货币数值(图标 / 标签 / + 钮留着)
row_fill(300, 566, 424, 702, CARD_MARGIN)
# 经验条:橙色填充段用空槽内色铺平(槽 x 135..365,内 140..360,y 509..523)
groove = np.median(im[511:522, 335:358, :3].reshape(-1, 3), axis=0).astype(np.uint8)
im[509:524, 140:361, :3] = groove
# 头像:圆内填名片暗色(运行时头像盖上)
ys, xs = np.mgrid[0:H, 0:W]
disc = np.hypot(xs - 305, ys - 195) <= 104
im[disc, :3] = (20, 18, 16)
# 红点:按颜色自动找(纯红小圆),按连通块求圆心半径再抠
src = np.array(Image.open(SRC).convert('RGB')).astype(int)
red = (src[:, :, 0] > 170) & (src[:, :, 1] < 90) & (src[:, :, 2] < 90)
from slice_sheet import label_components  # noqa: E402
labels, count = label_components(red, 2)
dots = []
for i in range(1, count + 1):
    ys_, xs_ = np.nonzero((labels == i) & red)
    if 80 < len(ys_) < 2500:
        cx, cy = int(xs_.mean()), int(ys_.mean())
        # 只认格子右上 / 邮件钮上的红点(任务卷轴的红蜡封、体力红晶也是红的,不能抠)
        if not any(abs(cx - ex) < 14 and abs(cy - ey) < 14 for ex, ey in [(1684, 112), (1684, 317), (1225, 526), (1427, 748)]):
            continue
        r = int(max(xs_.max() - xs_.min(), ys_.max() - ys_.min()) / 2) + 4
        dots.append((cx, cy, r))
        ring_fill(cx, cy, r, (r + 3, r + 9))
print('dots', dots)

os.makedirs(DST, exist_ok=True)
static = Image.fromarray(im)
static_path = os.path.join(DST, 'static.png')
static.save(static_path, optimize=True)
write_meta(static_path, 'static', W, H)

# 头像环覆盖层:名片 (180,70)-(430,320),圆孔 r<100 透明(2px 羽化),其余不透明(和底层同像素,盖住方头像四角)
ring = np.array(Image.open(SRC).convert('RGBA'))[70:320, 180:430].copy()
ys, xs = np.mgrid[0:250, 0:250]
d = np.hypot(xs - 125, ys - 125)
alpha = np.clip((d - 99) / 2, 0, 1)
ring[:, :, 3] = (alpha * 255).astype(np.uint8)
ring_path = os.path.join(DST, 'ring_overlay.png')
Image.fromarray(ring).save(ring_path, optimize=True)
write_meta(ring_path, 'ring_overlay', 250, 250)
# 取色给运行时:经验条橙、战力金
print('exp fill', np.median(np.array(Image.open(SRC).convert('RGB'))[512:520, 160:300].reshape(-1, 3), axis=0))
print('sizes', os.path.getsize(static_path) // 1024, 'KB', os.path.getsize(ring_path) // 1024, 'KB')
