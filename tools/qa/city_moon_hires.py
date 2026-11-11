# -*- coding: utf-8 -*-
"""主城(月夜)高清重绘(2026-11-11 用户看完实机:「美术可以更细腻吗」)。

现在整城图 4348×2447 像素铺成 5825×3278 世界单位,1080p 下 1 个图片像素要放大到约 1.24 个屏幕像素(2K 屏约 1.65),
再加上生图本身偏软,画面就显得不够细。办法:把整城图按小块交给生图「原样重绘成高一倍精度」(内容、位置一点不动,只加细节和锐度),
再拼回去,得到高精度整城图;可走栅格 / 遮挡条 / 抠图沿用原来的分割图。

  python tools/qa/city_moon_hires.py sample 名字 cx cy [倍数=2]     # 以 (cx, cy)(整图像素)为中心取一块,出一张高清重绘样片
  python tools/qa/city_moon_hires.py compare 名字 [倍数=2]           # 新旧对比图:按 1080p / 2K 屏上实际看到的大小并排
产物:%TEMP%/lootchain-qa/city_moon/hires/
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import city_moon_gen as GEN  # noqa: E402

SRC = GEN.OUT
OUT = os.path.join(SRC, 'hires')
TW, TH = GEN.TW, GEN.TH
# 一个图片像素合多少世界单位、镜头看多宽(世界单位):算「屏上实际多大」用
UNIT = 2240 / 1672
VIEW_W = 2080

PROMPT = (
    'Generate ONE new image with your image generation tool. Image 1 is a soft, low-resolution enlargement of part of a background '
    'plate from our own top-down game (a moonlit stylised-realism town). Re-render it as a crisp, high-fidelity version of EXACTLY '
    'the same picture: identical framing; every building, roof, wall, door, window, lamp, fence, plant, stone and shadow stays in '
    'exactly the same place with the same shape, size, colour and lighting. Do not add, remove, move or redesign anything.\n'
    'Only raise the fidelity: clean sharp edges; material detail at a finer scale - individual roof slates with thin crisp edges, '
    'small cobbles and flagstones with thin mortar lines, wood grain and plank seams, carved stone trim, wrought iron bars, leaf '
    'clusters made of small distinct leaves, small flower heads; soft smooth gradients in the lighting. No blur, no smeared paint '
    'strokes, no noise, no film grain, no speckle, no depth of field, no vignette.\n'
    'Keep the look: hand-painted stylised realism, saturated blue-teal moonlight, small warm lamp pools, autumn red-orange foliage. '
    'EMPTY background plate: no people, no animals, no smoke, no text. Landscape 16:9, 1672x941.'
)


def crop_box(cx, cy, scale):
    w, h = round(TW / scale), round(TH / scale)
    x0 = max(0, min(GEN.MW - w, round(cx - w / 2)))
    y0 = max(0, min(GEN.MH - h, round(cy - h / 2)))
    return x0, y0, x0 + w, y0 + h


def cmd_sample(name, cx, cy, scale):
    import battle_bg_layer_gen as B
    os.makedirs(OUT, exist_ok=True)
    box = crop_box(cx, cy, scale)
    mosaic = Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB')
    src = mosaic.crop(box)
    src.save(os.path.join(OUT, f'{name}_src.png'))
    guide = os.path.join(OUT, f'{name}_guide.png')
    src.resize((TW, TH), Image.LANCZOS).save(guide)
    with open(os.path.join(OUT, f'{name}_box.txt'), 'w', encoding='utf-8') as f:
        f.write(','.join(str(v) for v in box))
    dst = os.path.join(OUT, f'{name}_hi.png')
    B.run_codex([guide], PROMPT, dst, f'hires_{name}')


def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('msyh.ttc', 26)
    except Exception:
        font = ImageFont.load_default()
    d.rectangle([0, 0, d.textlength(text, font=font) + 24, 44], fill=(0, 0, 0))
    d.text((12, 6), text, fill=(255, 230, 150), font=font)
    return im


def cmd_compare(name, scale):
    src = Image.open(os.path.join(OUT, f'{name}_src.png')).convert('RGB')
    hi = Image.open(os.path.join(OUT, f'{name}_hi.png')).convert('RGB').resize((TW, TH), Image.LANCZOS)
    for screen_w, tag in ((1920, '1080p'), (2560, '2K')):
        k = UNIT * screen_w / VIEW_W          # 屏上:1 个原图像素 = k 个屏幕像素
        w, h = round(src.width * k), round(src.height * k)
        old = src.resize((w, h), Image.BILINEAR)          # 游戏里就是双线性放大
        new = hi.resize((w, h), Image.LANCZOS)
        # 取中间一块 900 宽并排(整块太大看不清差别)
        cw, ch = min(900, w), min(640, h)
        x0, y0 = (w - cw) // 2, (h - ch) // 2
        sheet = Image.new('RGB', (cw * 2 + 12, ch), (0, 0, 0))
        sheet.paste(label(old.crop((x0, y0, x0 + cw, y0 + ch)), f'现在({tag} 屏上实际大小)'), (0, 0))
        sheet.paste(label(new.crop((x0, y0, x0 + cw, y0 + ch)), f'高清重绘({tag} 屏上实际大小)'), (cw + 12, 0))
        dst = os.path.join(OUT, f'{name}_compare_{tag}.jpg')
        sheet.save(dst, quality=92)
        print(dst, sheet.size)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'sample':
        cmd_sample(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]) if len(sys.argv) > 5 else 2.0)
    elif cmd == 'compare':
        cmd_compare(sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 2.0)
    else:
        print(__doc__)
