# -*- coding: utf-8 -*-
"""主城(月夜)标准版 vs 高清版实机对比图:两套都用 city_moon_web.py 在同一视口(建议 2560x1440)截巡检图,
本脚本把同名截图里同一块区域原尺寸并排(左标准、右高清)。

  PAGE_QS='?cityHd=0' QA_VIEW=2560x1440 python tools/qa/city_moon_web.py <标准版目录> --only=tour_
  QA_VIEW=2560x1440 python tools/qa/city_moon_web.py <高清版目录> --only=tour_
  python tools/qa/city_moon_compare.py <标准版目录> <高清版目录> <输出目录>

每个街区出一张 <输出目录>/cmp_<街区>.jpg(各裁 1100×760 原尺寸,尽量避开 HUD)。
注意:预览页的游戏画面固定是设计分辨率 1920×1080,视口开大只是四周多一圈底色,对比的是 1080p 下的实机效果。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# 每张图裁哪一块(2560×1440 截图里的像素)。预览页按设计分辨率 1920×1080 出画面,居中在 x 320~2240、y 205~1285,
# 四周是页面底色:裁剪框必须落在这个范围里。默认裁右下一块(避开左上小地图 / 任务栏、右上按钮、左下摇杆),个别街区另挑。
GAME = (320, 205, 2240, 1285)
LOWER_RIGHT = (1120, 505, 2220, 1265)
UPPER_MID = (800, 225, 1900, 985)
CROPS = {
    'tour_00_nw': LOWER_RIGHT,
    'tour_01_n': UPPER_MID,
    'tour_02_ne': LOWER_RIGHT,
    'tour_10_w': LOWER_RIGHT,
    'tour_11_c': UPPER_MID,
    'tour_12_e': LOWER_RIGHT,
    'tour_20_sw': LOWER_RIGHT,
    'tour_21_s': LOWER_RIGHT,
    'tour_22_se': UPPER_MID,
}


def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('msyh.ttc', 30)
    except Exception:
        font = ImageFont.load_default()
    d.rectangle([0, 0, d.textlength(text, font=font) + 28, 50], fill=(0, 0, 0))
    d.text((14, 6), text, fill=(255, 230, 150), font=font)
    return im


def main():
    std_dir, hd_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    for name, box in CROPS.items():
        a = os.path.join(std_dir, name + '.jpg')
        b = os.path.join(hd_dir, name + '.jpg')
        if not os.path.exists(a) or not os.path.exists(b):
            continue
        left = label(Image.open(a).convert('RGB').crop(box), '现在(标准版)')
        right = label(Image.open(b).convert('RGB').crop(box), '2 倍重绘(高清版)')
        sheet = Image.new('RGB', (left.width * 2 + 16, left.height), (0, 0, 0))
        sheet.paste(left, (0, 0))
        sheet.paste(right, (left.width + 16, 0))
        dst = os.path.join(out, 'cmp_%s.jpg' % name.split('_', 2)[2])
        sheet.save(dst, quality=92)
        print(dst, sheet.size)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
