# -*- coding: utf-8 -*-
"""预渲染 2.5D · 第 1 期:整城布局平面图(给用户确认用的原型,按比例,北在上)。

  python tools/proto3d/pre25/city_plan.py <输出.png>

坐标 = 3D 主城场景的地面坐标(米):X 往东、Z 往南(北 = -Z)。中心广场和大教堂是现有 3D 场景里的真实位置,
其余街区是第 1 期新规划的(房子用方块示意)。游戏镜头(视角 D)从西南往东北斜着看:平面图上的东北方向 = 屏幕上方。
"""
import math
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
PX = 9                      # 每米多少像素
X0, X1, Z0, Z1 = -66, 62, -54, 54
W, H = (X1 - X0) * PX, (Z1 - Z0) * PX
img = Image.new('RGB', (W, H + 170), (22, 24, 30))
d = ImageDraw.Draw(img, 'RGBA')
F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
FB = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 26)
FS = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)


def P(x, z):
    return ((x - X0) * PX, (z - Z0) * PX)


def rect(x0, z0, x1, z1, fill, outline=None, w=1):
    x0, x1 = min(x0, x1), max(x0, x1)
    z0, z1 = min(z0, z1), max(z0, z1)
    a, b = P(x0, z0), P(x1, z1)
    d.rectangle([a[0], a[1], b[0], b[1]], fill=fill, outline=outline, width=w)


def poly(pts, fill, outline=None):
    d.polygon([P(x, z) for x, z in pts], fill=fill, outline=outline)


def text(x, z, s, font=F, fill=(240, 236, 224), anchor='mm'):
    d.text(P(x, z), s, font=font, fill=fill, anchor=anchor)


ROAD = (92, 90, 86)
PLAZA = (118, 114, 106)
HOUSE = (58, 52, 50)
HOUSE_LINE = (150, 120, 90)
WATER = (52, 84, 112)
GREEN = (46, 62, 44)
NEW = (196, 150, 84)

# 城墙外圈(示意)
rect(-62, -50, 58, 50, None, (120, 110, 96), 4)

# ── 运河(南) ──
rect(-62, 33, 58, 39, WATER)
text(30, 36, '运河', FS)

# ── 街道(可走) ──
streets = [
    (-20, -5, -60, 5),        # 西街:广场 → 酒馆 / 公会 → 西头
    (-9, -14, 1, -48),        # 北街:广场 → 帝国学院
    (0, 14, 10, 33),          # 南街:广场 → 石桥
    (-12, 39, -2, 50),        # 南门外
    (4, 20, 58, 28),          # 集市街 → 东门(沿大教堂南侧往东)
    (-20, 14, 0, 20),         # 广场南沿
]
for s in streets:
    rect(*s, ROAD)
# 石桥
rect(-12, 32, -2, 40, (130, 124, 112), (200, 190, 170), 2)
text(-7, 36, '石桥', FS, (30, 30, 30))
# 南街接石桥
rect(-12, 20, -2, 33, ROAD)

# ── 中心广场(现有,40 × 28 米可走区 + 台地) ──
rect(-20, -14, 12, 14, PLAZA, (230, 220, 200), 3)
rect(12.6, -10, 20, 10, (100, 96, 90), (200, 190, 170), 2)          # 台地
text(16.3, 0, '台地', FS)
# 罗盘
c = P(-2.5, 1.8)
d.ellipse([c[0] - 4.2 * PX, c[1] - 4.2 * PX, c[0] + 4.2 * PX, c[1] + 4.2 * PX], outline=(230, 230, 240), width=3)
text(-2.5, 1.8, '传送石', FS, (230, 230, 240))
# 铁匠铺(现有,斜着摆)
sm = [(-17, -13), (-6, -18), (-3, -11), (-14, -6)]
poly(sm, HOUSE, HOUSE_LINE)
text(-10, -12, '铁匠铺', F)
# 水井 / 摊位 / 告示板
rect(-7.5, -6, -4.5, -3, (90, 80, 70), (180, 160, 130))
text(-6, -1.6, '水井', FS)
rect(-6, 6.5, -2, 10, (120, 70, 70), (190, 130, 120))
rect(-3, 10.5, 1, 13.5, (120, 70, 70), (190, 130, 120))
text(-1, 12, '摊位', FS)
rect(2, -9, 4, -7, (150, 120, 80))
text(3, -10.5, '告示板', FS)
# 大教堂(现有)
poly([(24, -10), (52, -10), (52, 13), (24, 13)], (70, 66, 74), (190, 180, 200))
text(38, 1, '圣辉大教堂', FB)
text(38, 5, '(现有,第 1 期不进去)', FS, (180, 176, 168))

# ── 现有广场四周的房子(示意) ──
for x0, z0, x1, z1 in [(-30, -26, -18, -16), (-4, -26, 12, -17), (14, -26, 22, -12), (-30, -14, -22, -6),
                       (-30, 6, -22, 14), (-30, 16, -21, 30), (-20, 22, -12, 31), (12, 14, 22, 19), (-2, 21, 3, 30)]:
    rect(x0, z0, x1, z1, HOUSE, HOUSE_LINE)

# ── 新规划的街区(金色边 = 第 1 期新做) ──
def block(x0, z0, x1, z1, name, sub=''):
    rect(x0, z0, x1, z1, HOUSE, NEW, 3)
    text((x0 + x1) / 2, (z0 + z1) / 2 - (1.6 if sub else 0), name, FB)
    if sub:
        text((x0 + x1) / 2, (z0 + z1) / 2 + 2.4, sub, FS, (200, 196, 186))


block(-50, -22, -32, -8, '佣兵公会', '接任务')
block(-50, 8, -32, 24, '金麦酒馆', '情报')
block(-60, -7, -54, 7, '民居')
block(-16, -50, 8, -36, '帝国学院', '学者')
rect(-6, -36, 4, -30, GREEN)
text(-1, -33, '学院前庭', FS)
block(8, 30, 30, 33, '民居')
block(30, 28, 50, 33, '王都兵营', '卫队长')
block(30, 14, 50, 19.5, '集市', '杂货 / 果摊')
block(-50, 26, -24, 32, '马厩院')
rect(30, 40, 58, 50, (60, 74, 84), (120, 150, 170), 2)
text(44, 45, '码头(远景)', F)

# ── 城门 / 出口 ──
def gate(x, z, name, to):
    cx, cy = P(x, z)
    d.rectangle([cx - 22, cy - 22, cx + 22, cy + 22], fill=(160, 60, 50), outline=(255, 210, 160), width=3)
    text(x, z, '门', FB)
    text(x, z + 4.6, name, F, (255, 220, 180))
    text(x, z + 7.2, to, FS, (255, 220, 180))


gate(58, 24, '东门', '→ 灰岩荒原')
gate(-7, 49, '南门', '→ 村外林地')

# ── NPC ──
NPCS = [
    ('吟游诗人', -6.5, 3.2), ('卖花姑娘', 4, 4), ('老镇民', 3, -5.5),
    ('公会会长', -41, -6.5), ('酒馆老板', -41, 6.5), ('帝国学者', -2, -29),
    ('杂货商', 34, 21), ('果摊大婶', 44, 21), ('小汤姆', 34, 25.5),
    ('卫队长', 45, 25.5), ('城门卫兵', 54, 21), ('城门卫兵', -9.5, 44),
]
for name, x, z in NPCS:
    cx, cy = P(x, z)
    d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(90, 200, 255), outline=(255, 255, 255), width=2)
    d.text((cx + 10, cy), name, font=FS, fill=(180, 230, 255), anchor='lm')

# ── 比例尺 / 指北 / 镜头方向 ──
bx, by = 30, H + 80
d.line([bx, by, bx + 20 * PX, by], fill=(240, 236, 224), width=4)
for k in range(0, 21, 10):
    d.line([bx + k * PX, by - 8, bx + k * PX, by + 8], fill=(240, 236, 224), width=3)
d.text((bx + 20 * PX + 12, by), '20 米', font=F, fill=(240, 236, 224), anchor='lm')
nx, ny = W - 60, H + 110
d.polygon([(nx, ny - 40), (nx - 14, ny), (nx + 14, ny)], fill=(240, 236, 224))
d.text((nx, ny + 18), '北', font=F, fill=(240, 236, 224), anchor='mm')
# 镜头:从西南往东北看
ax, ay = W - 520, H + 150
d.line([ax - 40, ay + 30, ax + 30, ay - 40], fill=(255, 200, 90), width=5)
d.polygon([(ax + 38, ay - 48), (ax + 12, ay - 40), (ax + 30, ay - 22)], fill=(255, 200, 90))
d.text((ax + 50, ay - 20), '游戏镜头朝这个方向看(东北 = 屏幕上方)', font=FS, fill=(255, 210, 120), anchor='lm')
d.text((bx + 20 * PX + 90, by), '灰 = 现有   金边 = 第 1 期新做   蓝点 = NPC   红 = 城门出口', font=F, fill=(220, 214, 200), anchor='lm')
d.text((bx, by + 46), f'整城约 {X1 - X0 - 8} × {Z1 - Z0 - 8} 米;按主角跑速约 4 米/秒,横穿约 30 秒', font=F, fill=(220, 214, 200), anchor='lm')
img.save(OUT)
print('saved', OUT, img.size)
