"""终端按分辨率自适应(2026-11-01 用户「上下两边模糊了,应该可以按分辨率自适应」):原型整图拆成两层。
- 面板层 panels_b.png(1870×841 透明):原型里卡片 / 15 格 / 底栏按圆角矩形抠出,标题「终端」与关闭 ✕ 按亮度抠字形,其余全透明;按 contain 等比居中。
- 背景层 bg_b.jpg:GPT 从原型去掉全部界面、外扩成 3:2 的干净大厅(素材原始备份/terminal_static_b_1101/bg_gpt_raw.png),
  按原型背景色调逐通道匹配后再轻模糊 + 压暗(淡化);按 cover 铺满任意分辨率。
- 竖向:面板层运行时按「整行纯玻璃」拉伸行切段拉高(LobbyTerminalPanelRenderer STRETCH_ROWS),换面板图要重测拉伸行。
输入 素材原始备份/terminal_static_b_1101/static_b.png(terminal_b_extract.py 产物)。
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = '素材原始备份/terminal_static_b_1101/static_b.png'
BG_RAW = '素材原始备份/terminal_static_b_1101/bg_gpt_raw.png'
OUT_DIR = 'assets/resources/ui/town/terminal/'
W, H = 1870, 841
SS = 4
RADIUS = 14
BG_DIM, BG_BLUR = 0.72, 3
HERO_ICON = '素材原始备份/terminal_static_b_1101/hero_icon_line_gpt.png'
HERO_ICON_H, HERO_ICON_THICKEN = 84, 23
LABEL_FONT = 'C:/Windows/Fonts/NotoSansSC-VF.ttf'

TILE_X0 = [630, 856, 1083, 1309, 1536]
TILE_W = 210
TILE_Y0 = [105, 326, 537]
TILE_H = [205, 195, 195]
RECTS = [(114, 104, 607, 732), (67, 749, 1804, 826)]  # 左卡片、底栏(实测描边)
for r, y0 in enumerate(TILE_Y0):
    for x0 in TILE_X0:
        RECTS.append((x0 - 1, y0 - 1, x0 + TILE_W + 1, y0 + TILE_H[r] + 1))

src = Image.open(SRC).convert('RGBA')
mask = Image.new('L', (W * SS, H * SS), 0)
d = ImageDraw.Draw(mask)
for x0, y0, x1, y1 in RECTS:
    d.rounded_rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), radius=RADIUS * SS, fill=255)
mask = np.asarray(mask.resize((W, H), Image.LANCZOS), dtype=float) / 255

# 标题 / 关闭钮:白字压在暗背景上,按亮度取字形(含抗锯齿边)
lum = np.asarray(src.convert('L'), dtype=float)
glyph = np.zeros_like(lum)
for x0, y0, x1, y1 in [(55, 10, 230, 105), (1720, 15, 1825, 100)]:
    seg = lum[y0:y1, x0:x1]
    bg_l = np.median(seg)
    glyph[y0:y1, x0:x1] = np.clip((seg - bg_l - 25) / 110, 0, 1)
alpha = np.maximum(mask, glyph)
rgb = np.asarray(src, dtype=float)[..., :3].copy()
# 字形像素去掉背景色(反预乘到白字),避免叠到新背景上带一圈旧底色
gm = (glyph > mask)
rgb[gm] = np.clip(rgb[gm] * 0 + 242, 0, 255)
# 原型红点(格右上 (+181, +27))抠掉时填成了平色圆盘,竖向拉伸会把它拉成细竖条:逐行在圆盘左右两侧玻璃色之间线性插值重填
for y0 in TILE_Y0:
    for x0 in TILE_X0:
        cx, cy, rr = x0 + 181, y0 + 27, 16
        for y in range(cy - rr, cy + rr + 1):
            half = int((rr * rr - (y - cy) ** 2) ** 0.5)
            xl, xr = cx - half - 2, cx + half + 2
            for c in range(3):
                rgb[y, xl:xr + 1, c] = np.linspace(rgb[y, xl, c], rgb[y, xr, c], xr - xl + 1)
# 英雄格(11-01 用户「为啥英雄这里一直黄的」):原型把它画成了选中态(金底 + 金色实心剪影 + 金色胶囊字)。
# 换成普通格:底 = 编队格去掉图标和标签(每列竖向插值),图标 = GPT 按整套线框风格重画的白色线框英雄头像(线条加粗到同等比例),字 = Noto Sans SC 白字。
M = 3  # 连格子描边 / 抗锯齿外缘一起换
HX, FX, HY0, HTW, HTH = 630 - M, 856 - M, 105 - M, 210 + 2 * M, 205 + 2 * M
tile = np.dstack([rgb, alpha * 255])[HY0:HY0 + HTH, FX:FX + HTW].copy()
ya, yb = 150 - HY0, 294 - HY0
for c in range(3):
    top, bot = tile[ya, :, c].copy(), tile[yb, :, c].copy()
    for i, y in enumerate(range(ya, yb + 1)):
        t = i / (yb - ya)
        tile[y, :, c] = top * (1 - t) + bot * t
icon = Image.open(HERO_ICON).convert('RGBA').split()[3]
icon = icon.crop(icon.getbbox())
icon = icon.filter(ImageFilter.MaxFilter(HERO_ICON_THICKEN))
ih = HERO_ICON_H
iw = round(icon.width * ih / icon.height)
icon = np.asarray(icon.resize((iw, ih), Image.LANCZOS), dtype=float) / 255
ix, iy = round(HTW / 2 - iw / 2), round(192 - HY0 - ih / 2)
reg = tile[iy:iy + ih, ix:ix + iw]
for c in range(3):
    reg[..., c] = reg[..., c] * (1 - icon) + 242 * icon
tile_img = Image.fromarray(np.clip(tile, 0, 255).astype('uint8'), 'RGBA')
font = ImageFont.truetype(LABEL_FONT, 26)
font.set_variation_by_axes([430])
d = ImageDraw.Draw(tile_img)
bb = d.textbbox((0, 0), '英雄', font=font)
d.text((HTW / 2 - (bb[0] + bb[2]) / 2, 265.5 - HY0 - (bb[1] + bb[3]) / 2), '英雄', font=font, fill=(242, 242, 242, 255))
out = np.dstack([rgb, alpha * 255]).astype('uint8')
out[HY0:HY0 + HTH, HX:HX + HTW] = np.asarray(tile_img)
Image.fromarray(out, 'RGBA').save(OUT_DIR + 'panels_b.png')

# 背景:3:2 图按宽 1870 等比(高约 1247),中心对齐原型;按原型面板外的背景区域逐通道匹配均值 / 对比
bg = Image.open(BG_RAW).convert('RGB')
bh = round(bg.height * W / bg.width)
bg = bg.resize((W, bh), Image.LANCZOS)
b = np.asarray(bg, dtype=float)
oy = (bh - H) // 2
outside = (mask < 0.01) & (glyph < 0.01)
src_rgb = np.asarray(src, dtype=float)[..., :3]
ref = src_rgb[outside]
cur = b[oy:oy + H][outside]
for c in range(3):
    m0, s0 = cur[:, c].mean(), cur[:, c].std()
    m1, s1 = ref[:, c].mean(), ref[:, c].std()
    b[..., c] = (b[..., c] - m0) * (s1 / max(s0, 1e-3)) + m1
# 11-01 用户「背景也可以淡化」:轻模糊 + 压暗,面板更突出
faded = Image.fromarray(np.clip(b * BG_DIM, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(BG_BLUR))
faded.save(OUT_DIR + 'bg_b.jpg', quality=90)
print('panels_b.png', W, H, ' bg_b.jpg', W, bh)
