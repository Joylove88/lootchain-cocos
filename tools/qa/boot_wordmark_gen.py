# -*- coding: utf-8 -*-
"""启动加载页字标(11-11,原型 周报截图/2026-11-11_启动加载页/proto/boot_loading_b.png):
白色宽字距 LOOTCHAIN + 香槟 SILENT GODS + 两侧外端渐隐发丝线,透明底。
画布对应原型 1870×841 坐标里 x 525~1345 / y 200~340(中心 x 935 = 舞台中心,y 270),按 SCALE 倍超采样输出。
字体 Noto Sans SC(OFL,系统自带 VF)。用法:python tools/qa/boot_wordmark_gen.py [输出路径]"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SCALE = 2
X0, Y0, X1, Y1 = 525, 200, 1345, 340
FONT = 'C:/Windows/Fonts/NotoSansSC-VF.ttf'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'resources', 'ui', 'boot', 'boot_wordmark.png')

WHITE = (246, 246, 246)
CHAMPAGNE = (227, 196, 138)


def font(size: float, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, max(1, round(size * SCALE)))
    f.set_variation_by_name(weight)
    return f


def tracked(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, ink_left: float, ink_right: float, cap_top: float, color) -> None:
    """按原型量得的墨迹左右沿排字:字距 = (目标宽 - 字形墨迹总宽) 均分到字间(空格算一个字间额外加宽)。"""
    glyphs = []
    for ch in text:
        if ch == ' ':
            glyphs.append(None)
            continue
        l, t, r, b = f.getbbox(ch)
        glyphs.append((ch, l, t, r, b))
    ink = sum(g[3] - g[1] for g in glyphs if g)
    gaps = len(text) - 1 + text.count(' ')  # 空格处双倍字间
    target = (ink_right - ink_left) * SCALE
    gap = (target - ink) / gaps
    cap_t = f.getbbox('H')[1]
    x = (ink_left - X0) * SCALE
    y = (cap_top - Y0) * SCALE - cap_t
    for g in glyphs:
        if g is None:
            x += gap
            continue
        ch, l, t, r, b = g
        draw.text((x - l, y), ch, font=f, fill=color + (255,))
        x += (r - l) + gap


def hairline(img: Image.Image, xa: float, xb: float, y: float, fade_left: bool) -> None:
    px = img.load()
    a, b = round((xa - X0) * SCALE), round((xb - X0) * SCALE)
    cy = (y - Y0) * SCALE
    for x in range(a, b):
        t = (x - a) / max(1, b - a - 1)
        k = t if fade_left else 1 - t
        k = k ** 1.4
        for dy, w in ((-1, 0.35), (0, 1.0), (1, 0.35)):
            yy = round(cy) + dy
            alpha = round(235 * k * w)
            if alpha > 0:
                px[x, yy] = CHAMPAGNE + (alpha,)


def main() -> None:
    img = Image.new('RGBA', ((X1 - X0) * SCALE, (Y1 - Y0) * SCALE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # LOOTCHAIN:原型墨迹 x 568~1308、大写 y 217~267(字高 50)
    big = font(50 / 0.733, 'Medium')
    tracked(d, 'LOOTCHAIN', big, 568, 1308, 217, WHITE)
    # SILENT GODS:墨迹 x 737~1131、大写 y 307~322(字高 15)
    small = font(15.5 / 0.733, 'Bold')
    tracked(d, 'SILENT GODS', small, 737, 1131, 307, CHAMPAGNE)
    # 发丝线:左 548~693、右 1177~1322,y 316,外端渐隐
    hairline(img, 548, 693, 316, True)
    hairline(img, 1177, 1322, 316, False)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    img.save(OUT, optimize=True)
    print('saved', os.path.abspath(OUT), img.size, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
