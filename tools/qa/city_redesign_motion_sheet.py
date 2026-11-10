# -*- coding: utf-8 -*-
"""主城重做 · 动效标注图(2026-11-11 用户:「部分摆件和NPC需要加入动效,或者动态」)。
在一屏效果图上标出哪些东西会动、NPC 怎么走,连同原型一起给用户确认。点位是对着 city_moon_night.png(1672×941)量的,
换了底图要重量(SHEETS 里加一组)。
用法:python tools/qa/city_redesign_motion_sheet.py [底图名,默认 city_moon_night]
产物:%TEMP%/lootchain-qa/city_redesign/<底图名>_motion.jpg
"""
import math
import os
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'city_redesign')
FONT = r'C:\Windows\Fonts\msyh.ttc'
FIRE, WIND, AIR, LIFE = (255, 176, 80), (150, 225, 150), (205, 215, 235), (110, 210, 255)

SHEETS = {
    'city_moon_night': {
        # (编号, 颜色, [(x, y) 标在图上的位置...])
        'marks': [
            (1, FIRE, [(543, 95), (1175, 50), (505, 600), (1490, 150)]),
            (2, FIRE, [(210, 290)]),
            (3, FIRE, [(1040, 400)]),
            (4, WIND, [(560, 40), (150, 560), (1085, 60), (1320, 590)]),
            (5, WIND, [(880, 560), (420, 380)]),
            (6, WIND, [(1625, 110), (1550, 560)]),
            (7, AIR, [(1080, 730)]),
            (8, AIR, [(880, 45)]),
            (9, LIFE, [(1400, 245)]),
            (10, LIFE, [(395, 485), (885, 150)]),
            (11, LIFE, [(180, 365)]),
            (12, LIFE, [(1245, 465)]),
        ],
        # 巡逻 / 走动路线(虚线 + 箭头)
        'routes': [
            (LIFE, [(1400, 340), (1230, 400), (1010, 330), (800, 300)]),                       # 守卫:教堂台阶 → 广场北侧
            (LIFE, [(1560, 700), (1250, 640), (760, 600), (430, 560), (270, 470)]),            # 镇民:集市拱门 → 广场南侧 → 铁匠铺
        ],
    },
}
# 图例用普通数字:微软雅黑没有 ⑪ ⑫ 这两个带圈数字,会画成方框
LEGEND = [
    ('火与光', FIRE, ['1  路灯 / 窗灯:灯芯轻微明暗,飞蛾绕灯', '2  铁匠炉:炉火跳动,偶尔溅火星', '3  传送石台:符文微光脉动,走近变亮']),
    ('风与叶', WIND, ['4  树 / 灌木 / 花丛:随风摆动(现成)', '5  落叶:顺风飘落(现成)', '6  挂旗 / 集市布篷:随风起伏']),
    ('烟与雾', AIR, ['7  烟囱烟:慢慢上飘、散开', '8  薄雾缓慢流动;云影掠过地面(云影现成)']),
    ('活物', LIFE, ['9  守卫:沿虚线巡逻,到点停下站岗', '10  镇民:沿虚线来回,在井边 / 摊位停留', '     两人凑近时冒对话气泡', '11  铁匠:打铁循环动作',
                  '12  任务 NPC:原地呼吸,玩家靠近转身']),
]


def dashed(d, pts, color, width=4, dash=16, gap=12):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(seg // (dash + gap)))
        for i in range(n + 1):
            a = i * (dash + gap) / seg
            b = min(1, a + dash / seg)
            if a >= 1:
                break
            d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=color + (235,), width=width)
    (x0, y0), (x1, y1) = pts[-2], pts[-1]
    ang = math.atan2(y1 - y0, x1 - x0)
    for s in (-1, 1):
        d.line([(x1, y1), (x1 - 22 * math.cos(ang + s * 0.45), y1 - 22 * math.sin(ang + s * 0.45))], fill=color + (235,), width=width)


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else 'city_moon_night')
    spec = SHEETS[base]
    im = Image.open(os.path.join(OUT, base + '.png')).convert('RGBA')
    W, H = im.size
    over = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for color, pts in spec['routes']:
        dashed(d, pts, color)
    num = ImageFont.truetype(FONT, 22)
    for n, color, spots in spec['marks']:
        for x, y in spots:
            d.ellipse([x - 19, y - 19, x + 19, y + 19], fill=(18, 18, 22, 225), outline=color + (255,), width=3)
            t = str(n)
            w = d.textlength(t, font=num)
            d.text((x - w / 2, y - 16), t, font=num, fill=color + (255,))
    im = Image.alpha_composite(im, over).convert('RGB')
    # 图例条
    pad, col_w = 28, (W - 28 * 2) // 4
    head, body = ImageFont.truetype(FONT, 26), ImageFont.truetype(FONT, 19)
    rows = max(len(lines) for _t, _c, lines in LEGEND)
    panel_h = pad * 2 + 40 + rows * 30
    sheet = Image.new('RGB', (W, H + panel_h), (22, 22, 26))
    sheet.paste(im, (0, 0))
    d = ImageDraw.Draw(sheet)
    for i, (title, color, lines) in enumerate(LEGEND):
        x = pad + i * col_w
        d.text((x, H + pad), title, font=head, fill=color)
        for j, line in enumerate(lines):
            d.text((x, H + pad + 42 + j * 30), line, font=body, fill=(222, 222, 226))
    dst = os.path.join(OUT, base + '_motion.jpg')
    sheet.save(dst, quality=93)
    print(dst, sheet.size)


if __name__ == '__main__':
    main()
