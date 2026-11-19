# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期 v2:扩大版整城布局平面图(给用户确认用,按比例,北在上)。

  python tools/proto3d/pre25/city_plan_v2.py <输出.png> [--rot=<转到视角 D 的输出.png>]

11-19 用户看了第一版:「主城太小」「左上侧区域根本走不过去」「需要一个更大,可以每个区域都可以走动的」。
v2 口径:城墙内 200 × 160 米(第一版 120 × 100,面积约 2.7 倍);底色(灰)= 能走的街面,深色块 = 房子,
每个街区四面都是街(没有死胡同);城墙内侧一圈环城路;主街 12 米、支路 8 米(斜视角下楼会盖住它东北侧约 0.7 倍楼高的街面,
街窄了人老被挡);西北角是能走进去的王都花园;中心广场 + 大教堂保留现有位置(教堂台地按教堂实际占地做,不再悬空)。
坐标 = 3D 主城场景地面坐标(米):X 往东、Z 往南(北 = -Z)。
"""
import sys

from PIL import Image, ImageDraw, ImageFont

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
PX = 6
WX0, WX1, WZ0, WZ1 = -100, 100, -80, 80          # 城墙内
X0, X1, Z0, Z1 = WX0 - 8, WX1 + 8, WZ0 - 8, WZ1 + 8
W, H = (X1 - X0) * PX, (Z1 - Z0) * PX
img = Image.new('RGB', (W, H + 190), (22, 24, 30))
d = ImageDraw.Draw(img, 'RGBA')
F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
FB = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 22)
FS = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 13)

PAVE = (104, 101, 95)          # 能走的街面
HOUSE = (54, 49, 47)
HOUSE_LINE = (140, 114, 88)
KEY = (196, 150, 84)           # 重要建筑(有 NPC / 功能)
WATER = (50, 82, 112)
GREEN = (52, 74, 48)
OLD = (230, 220, 200)          # 现有中心广场


def P(x, z):
    return ((x - X0) * PX, (z - Z0) * PX)


def rect(x0, z0, x1, z1, fill, outline=None, w=1):
    x0, x1 = min(x0, x1), max(x0, x1)
    z0, z1 = min(z0, z1), max(z0, z1)
    a, b = P(x0, z0), P(x1, z1)
    d.rectangle([a[0], a[1], b[0], b[1]], fill=fill, outline=outline, width=w)


def text(x, z, s, font=F, fill=(240, 236, 224), anchor='mm'):
    d.text(P(x, z), s, font=font, fill=fill, anchor=anchor)


def houses(x0, z0, x1, z1, gap=2.5, depth=8.0, along='x'):
    """一个街区里沿四边排一圈房子(中间留后院,也是能走的),房子之间留 2.5 米的窄巷。"""
    if along == 'x':
        n = max(1, round((x1 - x0) / 9.5))
        w = (x1 - x0 - gap * (n - 1)) / n
        for i in range(n):
            a = x0 + i * (w + gap)
            rect(a, z0, a + w, z0 + depth, HOUSE, HOUSE_LINE)
            if z1 - z0 > depth * 2 + 4:
                rect(a, z1 - depth, a + w, z1, HOUSE, HOUSE_LINE)
    else:
        n = max(1, round((z1 - z0) / 9.5))
        w = (z1 - z0 - gap * (n - 1)) / n
        for i in range(n):
            a = z0 + i * (w + gap)
            rect(x0, a, x0 + depth, a + w, HOUSE, HOUSE_LINE)
            if x1 - x0 > depth * 2 + 4:
                rect(x1 - depth, a, x1, a + w, HOUSE, HOUSE_LINE)


def key(x0, z0, x1, z1, name, sub=''):
    rect(x0, z0, x1, z1, HOUSE, KEY, 3)
    text((x0 + x1) / 2, (z0 + z1) / 2 - (1.6 if sub else 0), name, FB)
    if sub:
        text((x0 + x1) / 2, (z0 + z1) / 2 + 3.0, sub, FS, (205, 200, 190))


# ── 底:城墙内整片都是街面 ──
rect(WX0, WZ0, WX1, WZ1, PAVE)
rect(WX0, WZ0, WX1, WZ1, None, (150, 140, 120), 6)

# 街网:x 向 环城路 | A 街区 | 支路 | B 街区 | 北大街 | C 街区 | 支路 | D 街区 | 环城路
#       z 向 环城路 | 1 | 横街 | 2 | 西大街(广场以西) | 3 | 横街 | 4 | 滨河路 运河 滨河路 | 5 | 环城路
XA, XB, XC, XD = (-92, -59), (-51, -10), (2, 51), (59, 92)
Z1_, Z2_, Z3_, Z4_, Z5_ = (-72, -44), (-36, -6), (6, 20), (28, 44), (62, 72)

# ── A1 王都花园(西北,整片能走:小径、池塘、凉亭、树) ──
rect(XA[0], Z1_[0], XA[1], Z1_[1], GREEN, (120, 160, 110), 2)
c = P(-75.5, -58)
d.ellipse([c[0] - 8 * PX, c[1] - 5 * PX, c[0] + 8 * PX, c[1] + 5 * PX], fill=WATER)
for (x, z) in [(-88, -68), (-63, -68), (-88, -48), (-63, -48), (-80, -46), (-70, -70), (-84, -58), (-66, -58)]:
    cc = P(x, z)
    d.ellipse([cc[0] - 8, cc[1] - 8, cc[0] + 8, cc[1] + 8], fill=(150, 70, 40))
text(-75.5, -69, '王都花园(能走进去)', FS)
text(-75.5, -58, '池塘', FS)

# ── B1 帝国学院 + 学院前庭 ──
key(-48, -72, -14, -57, '帝国学院', '帝国学者')
rect(-40, -55, -22, -46, GREEN)
text(-31, -50.5, '学院前庭', FS)
# ── C1 贵族宅邸 + 宅邸花园 ──
key(6, -72, 30, -58, '贵族宅邸', '')
rect(32, -72, 48, -58, GREEN)
text(40, -65, '宅邸花园', FS)
houses(6, -54, 48, -46)
# ── D1 民居 ──
houses(XD[0], Z1_[0], XD[1], Z1_[1])

# ── A2 民居  B2 佣兵公会 ──
houses(XA[0], Z2_[0], XA[1], Z2_[1])
key(-48, -33, -26, -19, '佣兵公会', '公会会长')
houses(-24, -33, -12, -9, along='z')
houses(-48, -15, -28, -9)
# ── C2 钟楼小广场 + 民居(教堂北面) ──
rect(20, -34, 36, -22, (120, 116, 108), (200, 190, 170), 2)
text(28, -28, '钟楼小广场', FS)
houses(4, -34, 18, -18, along='z')
houses(38, -34, 50, -18, along='z')
# ── D2 王都兵营 ──
key(62, -33, 90, -20, '王都兵营', '卫队长')
houses(62, -16, 90, -8)

# ── 中心:现有广场 + 大教堂(台地按教堂实际占地) ──
rect(-20, -14, 12, 14, (120, 116, 108), OLD, 3)
cc = P(-2.5, 1.8)
d.ellipse([cc[0] - 4 * PX, cc[1] - 4 * PX, cc[0] + 4 * PX, cc[1] + 4 * PX], outline=(230, 230, 240), width=3)
text(-2.5, 1.8, '传送石', FS)
text(-4, -10, '罗盘广场(现有)', F, (255, 240, 210))
rect(14, -14, 48, 18, (92, 88, 84), (200, 190, 170), 2)
key(22, -10, 46, 14, '圣辉大教堂', '台地 = 教堂占地')

# ── A3 马厩  B3 金麦酒馆 ──
key(-90, 8, -62, 18, '马厩', '')
key(-48, 8, -28, 19, '金麦酒馆', '酒馆老板')
houses(-26, 16, -12, 20)
# ── D3 + D4 集市广场(跨集市街) ──
rect(XD[0], 8, XD[1], 42, (126, 118, 104), (220, 200, 160), 3)
text(75.5, 11.5, '集市广场', FB)
for (x, z) in [(64, 16), (72, 16), (80, 16), (88, 16), (64, 34), (72, 34), (80, 34), (88, 34)]:
    rect(x - 2.5, z - 2, x + 2.5, z + 2, (130, 70, 66), (200, 140, 120))
# ── C3/C4 教堂南面民居(集市街两侧) ──
houses(14, 30, 50, 44)
houses(2, 20, 12, 44, along='z')
# ── A4 马场  B4 民居 ──
rect(XA[0], Z4_[0], XA[1], Z4_[1], (86, 78, 60), (150, 130, 90), 2)
text(-75.5, 36, '马场(能走)', FS)
houses(XB[0], Z4_[0], XB[1] - 3, Z4_[1])

# ── 运河 + 三座桥 + 两岸滨河路 ──
CZ0, CZ1 = 48, 56
rect(WX0, CZ0, WX1, CZ1, WATER)
for bx, name in [(-55, '西桥'), (-4, '石桥(主)'), (55, '东桥')]:
    rect(bx - 3, CZ0 - 1, bx + 3, CZ1 + 1, (132, 126, 114), (210, 200, 180), 2)
    text(bx, CZ0 - 3.2, name, FS)
text(80, 52, '运河', FS)
rect(64, CZ1, 90, CZ1 + 5, (110, 86, 60), (170, 140, 100), 2)
text(77, CZ1 + 2.5, '码头(停船)', FS)

# ── 5 南岸:民居 + 南门广场 ──
houses(XA[0], Z5_[0], XA[1], Z5_[1] + 4)
houses(XB[0], Z5_[0], -20, Z5_[1] + 4)
rect(-18, 62, 6, 76, (120, 116, 108), (200, 190, 170), 2)
text(-6, 66, '南门广场', FS)
houses(10, Z5_[0], XC[1], Z5_[1] + 4)
houses(XD[0], 66, XD[1], Z5_[1] + 4)

# ── 城门 ──
def gate(x, z, name, to, horiz):
    cx, cy = P(x, z)
    d.rectangle([cx - 18, cy - 18, cx + 18, cy + 18], fill=(160, 60, 50), outline=(255, 210, 160), width=3)
    text(x, z, '门', FB)
    ox, oz = (0, 6.5) if horiz else (-12, 0)
    text(x + ox, z + oz - 2.4, name, F, (255, 220, 180))
    text(x + ox, z + oz + 0.6, to, FS, (255, 220, 180))


gate(-6, WZ1, '南门', '→ 村外林地', True)
gate(WX1, 24, '东门', '→ 灰岩荒原', False)

# ── 主街示意(虚线:12 米宽主街的中线) ──
for (ax, az, bx, bz) in [(-4, -14, -4, -78), (-4, 14, -4, 78), (-20, 0, -98, 0), (12, 24, 98, 24), (-98, -40, 98, -40), (-98, 59, 98, 59), (-55, -78, -55, 46), (55, -78, 55, 46), (-98, 24, -12, 24)]:
    n = int(max(abs(bx - ax), abs(bz - az)) / 4)
    for i in range(0, n, 2):
        p0 = P(ax + (bx - ax) * i / n, az + (bz - az) * i / n)
        p1 = P(ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n)
        d.line([p0, p1], fill=(230, 210, 150, 170), width=3)
text(-4, -80 + 4.5, '环城路(城墙内一圈)', FS, (255, 230, 170))

# ── NPC ──
NPCS = [
    ('吟游诗人', -6.5, 3.2), ('卖花姑娘', 4, 4), ('老镇民', 4, -5.5),
    ('公会会长', -37, -16), ('酒馆老板', -38, 22), ('帝国学者', -31, -43),
    ('杂货商', 64, 21), ('果摊大婶', 80, 21), ('小汤姆', 70, 39),
    ('卫队长', 76, -17.5), ('城门卫兵', 94, 30), ('城门卫兵', -12, 72),
]
for name, x, z in NPCS:
    cx, cy = P(x, z)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(90, 200, 255), outline=(255, 255, 255), width=2)
    d.text((cx + 9, cy), name, font=FS, fill=(180, 230, 255), anchor='lm')

# ── 第一版范围对比 ──
rect(-62, -50, 58, 50, None, (255, 120, 120), 2)
text(-60, -51.8, '第一版主城范围(120 × 100)', FS, (255, 150, 150), 'lm')

# ── 图例 ──
bx, by = 30, H + 60
d.line([bx, by, bx + 20 * PX, by], fill=(240, 236, 224), width=4)
d.text((bx + 20 * PX + 10, by), '20 米', font=F, fill=(240, 236, 224), anchor='lm')
d.text((bx + 20 * PX + 80, by), '灰 = 能走的街面    深色 = 房子    金边 = 有 NPC / 功能    绿 = 花园 / 前庭(能走)    红框 = 第一版范围', font=F, fill=(220, 214, 200), anchor='lm')
d.text((bx, by + 40), f'城墙内 {WX1 - WX0} × {WZ1 - WZ0} 米(第一版的 2.7 倍);跑速约 3.6 米/秒,横穿约 55 秒;每个街区四面临街,城墙内一圈环城路', font=F, fill=(220, 214, 200), anchor='lm')
d.text((bx, by + 72), '主街 12 米 / 支路 8 米 / 房子间巷子 2.5 米;斜视角下楼会盖住它东北侧约 0.7 倍楼高的街面(被盖住时人显示成剪影)', font=F, fill=(220, 214, 200), anchor='lm')
nx, ny = W - 50, H + 90
d.polygon([(nx, ny - 36), (nx - 12, ny), (nx + 12, ny)], fill=(240, 236, 224))
d.text((nx, ny + 16), '北', font=F, fill=(240, 236, 224), anchor='mm')
img.save(OUT)
print('saved', OUT, img.size)

if 'rot' in OPT:
    # 转到游戏镜头朝向(视角 D:往东北看 = 屏幕上方):平面图顺时针转 45°,再压扁成俯 45° 的样子
    core = img.crop((0, 0, W, H))
    r = core.rotate(45, expand=True, resample=Image.BICUBIC, fillcolor=(22, 24, 30))
    r = r.resize((r.width, int(r.height * 0.7071)), Image.LANCZOS)
    r.save(OPT['rot'])
    print('rot', OPT['rot'], r.size)
