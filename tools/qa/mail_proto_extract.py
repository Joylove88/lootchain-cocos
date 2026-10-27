"""邮箱 1:1 还原素材(docs/15 2026-10-28):从原型 proto_mail_v1(1870×841)裁面板框 / 按钮 / 行卡 / 标签 / 附件格 / 信封徽 / 分隔线,
把里面的文字 / 内容用面板底色抹平,存成九宫格件到 assets/resources/ui/town/mail/。
用法:python tools/qa/mail_proto_extract.py   → 另存一张 contact sheet 到 周报截图/.../measure/mail_assets.png 过目
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '周报截图', '2026-10-27_主城HUD原型', 'v3', 'proto_mail_v1.png')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'town', 'mail')
os.makedirs(DST, exist_ok=True)
full = np.array(Image.open(SRC).convert('RGBA'))


def median_of(box):
    x0, y0, x1, y1 = box
    return np.median(full[y0:y1, x0:x1, :3].reshape(-1, 3), axis=0).astype(np.uint8)


def cut(name, box, erase=None, sample=None, circle=None, keep_bright=None):
    x0, y0, x1, y1 = box
    im = full[y0:y1, x0:x1].copy()
    if erase:
        color = median_of(sample)
        for ex0, ey0, ex1, ey1 in erase:
            im[ey0 - y0:ey1 - y0, ex0 - x0:ex1 - x0, :3] = color
    if circle:
        cx, cy, r = circle
        ys, xs = np.mgrid[0:im.shape[0], 0:im.shape[1]]
        d = np.hypot(xs - (cx - x0), ys - (cy - y0))
        im[:, :, 3] = (np.clip((r - d) / 1.5, 0, 1) * 255).astype(np.uint8)
    if keep_bright is not None:
        # 线条件:只留比阈值亮的像素(金线 / 菱形),其余透明
        lum = im[:, :, :3].astype(int).max(axis=2)
        im[:, :, 3] = np.clip((lum - keep_bright) * 6, 0, 255).astype(np.uint8)
    out = Image.fromarray(im)
    path = os.path.join(DST, name + '.png')
    out.save(path, optimize=True)
    write_meta(path, name, out.width, out.height)
    print(name, out.size)
    return out


# 面板框(右栏整块,内容抹平;左右栏共用同一九宫格,inset 60)
cut('panel', (782, 98, 1775, 752), erase=[(815, 135, 1745, 720)], sample=(1550, 290, 1700, 420))
# 按钮(文字抹平):红主钮 / 暗次钮,inset [36,36,0,0]
cut('btn_primary', (432, 646, 728, 728), erase=[(470, 660, 690, 715)], sample=(445, 670, 465, 705))
cut('btn_secondary', (137, 646, 403, 728), erase=[(170, 660, 370, 715)], sample=(150, 670, 165, 705))
# 行卡:选中(亮金边)/ 普通,inset [40,40,30,30]
cut('row_selected', (122, 192, 738, 313), erase=[(140, 205, 720, 300)], sample=(520, 205, 620, 245))
cut('row_normal', (122, 322, 738, 443), erase=[(140, 335, 720, 430)], sample=(520, 335, 620, 375))
# 未读小牌 / 附件标签,inset [20,20,0,0] / [16,16,0,0]
cut('pill', (588, 128, 727, 172), erase=[(600, 135, 715, 165)], sample=(592, 134, 598, 166))
cut('tag', (632, 252, 712, 293), erase=[(642, 258, 702, 287)], sample=(636, 258, 640, 287))
# 附件格(图标 / 数量抹平),inset 30
cut('slot', (1008, 453, 1162, 607), erase=[(1019, 463, 1151, 602)], sample=(1030, 470, 1060, 490))
# 信封徽:未读(红点抹掉)/ 已读(开口信封);圆形抠出
cut('envelope', (148, 208, 236, 296), erase=[(214, 206, 242, 234)], sample=(160, 215, 175, 230), circle=(192, 252, 43))
cut('envelope_read', (148, 468, 236, 556), circle=(192, 512, 43))
# 分隔金线(带中菱)/ 附件小线:只留亮像素
cut('divider', (826, 246, 1740, 270), keep_bright=70)
cut('attach_line', (896, 418, 992, 442), keep_bright=70)
# 关闭钮(圆形抠出)
cut('close', (1703, 9, 1779, 85), circle=(1741, 47, 36))

# contact sheet
sheet = Image.new('RGBA', (1900, 700), (96, 96, 102, 255))
x = y = 10
rowh = 0
for f in sorted(os.listdir(DST)):
    if not f.endswith('.png'):
        continue
    im = Image.open(os.path.join(DST, f)).convert('RGBA')
    k = min(1, 420 / im.width, 200 / im.height)
    im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
    if x + im.width > 1890:
        x = 10
        y += rowh + 20
        rowh = 0
    sheet.alpha_composite(im, (x, y))
    x += im.width + 20
    rowh = max(rowh, im.height)
sheet.save(os.path.join(ROOT, '周报截图', '2026-10-27_主城HUD原型', 'v3', 'measure', 'mail_assets.png'))
print('sheet ok')
