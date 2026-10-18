"""界面改版对照总览:每个界面一行「改版前 | GPT 原型 | 改版后」,拼成一张 jpg(周报用)。

用法:python tools/qa/compare_sheet.py <周报截图/日期_主题 目录> [--cols before,proto,after] [--width 760]
目录下 before/ proto/ after/ 里同名 png 逐行对齐;缺哪一列就留灰底并标「缺」。
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFont

LABELS = {'before': '改版前', 'proto': 'GPT 原型', 'after': '改版后'}
# native_capture_screens.py 的界面键 → 行名(也决定行序;其余键按字母排在后面)
ROW_NAMES = {
    'bag': '背包', 'quest': '任务', 'mail': '邮件',
    'shop_gold': '金币商店', 'shop_stamina': '体力补充', 'shop_diamond': '钻石充值',
    'forge_fuse': '锻造·合成', 'forge_decompose': '锻造·分解', 'forge_gem': '锻造·宝石',
    'ult': '终极技能升级', 'bag_detail': '物品详情',
}


def load_font(size: int) -> ImageFont.ImageFont:
    for path in (r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--cols', default='before,proto,after')
    ap.add_argument('--width', type=int, default=760)
    ap.add_argument('--out', default='')
    args = ap.parse_args()
    cols = [c for c in args.cols.split(',') if c]
    found = {os.path.splitext(f)[0] for c in cols if os.path.isdir(os.path.join(args.root, c)) for f in os.listdir(os.path.join(args.root, c)) if f.endswith('.png')}
    order = list(ROW_NAMES)
    names = sorted(found, key=lambda n: (order.index(n) if n in order else len(order), n))
    w = args.width
    h = round(w * 1080 / 2400)
    pad, head, label_w = 12, 44, 150
    font = load_font(24)
    small = load_font(20)
    sheet = Image.new('RGB', (label_w + len(cols) * (w + pad) + pad, head + len(names) * (h + pad) + pad), (24, 22, 26))
    draw = ImageDraw.Draw(sheet)
    for ci, col in enumerate(cols):
        draw.text((label_w + pad + ci * (w + pad) + w // 2, head // 2), LABELS.get(col, col), fill=(240, 214, 150), font=font, anchor='mm')
    for ri, name in enumerate(names):
        y = head + ri * (h + pad)
        draw.text((label_w // 2, y + h // 2), ROW_NAMES.get(name, name), fill=(220, 210, 190), font=small, anchor='mm')
        for ci, col in enumerate(cols):
            x = label_w + pad + ci * (w + pad)
            path = os.path.join(args.root, col, name + '.png')
            if os.path.exists(path):
                im = Image.open(path).convert('RGB')
                im = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
                sheet.paste(im.crop((0, 0, w, min(h, im.height))), (x, y))
            else:
                draw.rectangle((x, y, x + w, y + h), fill=(50, 48, 54))
                draw.text((x + w // 2, y + h // 2), '缺', fill=(160, 150, 140), font=font, anchor='mm')
    out = args.out or os.path.join(args.root, '前后对照总览.jpg')
    sheet.save(out, quality=86)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
