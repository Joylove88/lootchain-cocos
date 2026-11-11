# -*- coding: utf-8 -*-
"""战斗伤害数字位图字(2026-11-11 战斗画面精致化,用户确认样片 02)。

思源黑体 Black(本机自带 C:\\Windows\\Fonts\\NotoSansSC-VF.ttf,SIL 开源授权)→ 4 倍超采样画「描边 + 竖向渐变 + 顶部高光 + 细投影 + 斜体」再缩回,
四套配色打进一张图:
  normal 普通命中(冷白 → 淡青,深蓝黑描边)    字符码 = ASCII
  crit   战技 / 暴击 / 大额(亮黄 → 橙红)       字符码 = 0xE100 + ASCII
  hurt   我方掉血(粉红 → 正红)                  字符码 = 0xE200 + ASCII
  heal   回血(浅绿)                             字符码 = 0xE300 + ASCII
字符:0-9 . + - 以及单位后缀 K M B T Q a i(后缀按 78% 字高、底对齐)。

产物:
  assets/resources/ui/battle/font/battle_num.png(+ .meta:sprite-frame、不裁边)
  assets/scripts/scenes/lobby/BattleNumberFontData.ts(度量表,运行时由 BattleNumberFont.ts 拼成位图字;不走编辑器的 .fnt 导入)
  --sheet <目录> 另出一张字样图给人看
用法:python tools/qa/battle_num_font_gen.py [--sheet <目录>]
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = r'C:\Windows\Fonts\NotoSansSC-VF.ttf'
PNG = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle', 'font', 'battle_num.png')
TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'BattleNumberFontData.ts')
SS = 4
LINE = 64            # 位图字名义字号 = 行高
DIGIT = 48           # 数字字高(图里的像素)
BASE = (LINE + DIGIT) // 2   # 基线离行顶
ITALIC = 0.16
STROKE = 0.13        # 描边 / 字高
SUFFIX = 0.78
TRACK = -0.035       # 字距 / 字高
CHARS = '0123456789.+-KMBTQai'
SMALL = set('KMBTQai')
STYLES = [
    ('normal', 0x0000, {'top': (255, 255, 255), 'bottom': (196, 226, 255), 'stroke': (14, 22, 40), 'shadow': 150}),
    ('crit', 0xE100, {'top': (255, 244, 170), 'bottom': (255, 96, 44), 'stroke': (58, 12, 6), 'shadow': 170}),
    ('hurt', 0xE200, {'top': (255, 170, 160), 'bottom': (255, 52, 44), 'stroke': (44, 6, 6), 'shadow': 160}),
    ('heal', 0xE300, {'top': (224, 255, 224), 'bottom': (92, 224, 138), 'stroke': (6, 44, 24), 'shadow': 150}),
]


def font_of(px):
    f = ImageFont.truetype(FONT, px)
    try:
        f.set_variation_by_axes([900])
    except Exception:
        pass
    return f


def glyph(ch, st):
    """返回 (图, 图左沿相对笔位的偏移, 图上沿相对行顶的偏移, 步进);单位 = 成品像素。"""
    k = SUFFIX if ch in SMALL else 1.0
    big = DIGIT * SS
    f = font_of(int(big * k / 0.73))
    stroke = max(2, int(round(big * STROKE)))
    pad = stroke * 2 + int(big * 0.2)
    adv = f.getlength(ch) + big * TRACK * k
    W = int(f.getlength(ch) + pad * 2 + big * 0.5)
    H = LINE * SS + pad * 2
    pen_x, base_y = pad + int(big * 0.2), pad + BASE * SS
    mask = Image.new('L', (W, H), 0)
    outline = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).text((pen_x, base_y), ch, font=f, fill=255, anchor='ls')
    ImageDraw.Draw(outline).text((pen_x, base_y), ch, font=f, fill=255, anchor='ls', stroke_width=stroke)
    # 竖向渐变按「数字字身」的上下沿定(所有字同一条渐变,拼成一串才连贯)
    y0, y1 = base_y - big, base_y
    grad = Image.new('RGB', (W, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = min(1.0, max(0.0, (y - y0) / max(1, y1 - y0)))
        t = t * t * (3 - 2 * t)
        gd.line([(0, y), (W, y)], fill=tuple(int(st['top'][i] + (st['bottom'][i] - st['top'][i]) * t) for i in range(3)))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sh_mask = ImageChops.offset(outline, 0, int(big * 0.07)).filter(ImageFilter.GaussianBlur(big * 0.03)).point(lambda v: int(v * st['shadow'] / 255))
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    sh.putalpha(sh_mask)
    out = Image.alpha_composite(out, sh)
    ol = Image.new('RGBA', (W, H), st['stroke'] + (255,))
    ol.putalpha(outline)
    out = Image.alpha_composite(out, ol)
    fill = grad.convert('RGBA')
    fill.putalpha(mask)
    out = Image.alpha_composite(out, fill)
    hi = Image.new('L', (W, H), 0)
    ImageDraw.Draw(hi).rectangle([0, y0, W, y0 + int((y1 - y0) * 0.36)], fill=46)
    hi = ImageChops.multiply(hi.filter(ImageFilter.GaussianBlur(big * 0.04)), mask)
    white = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    white.putalpha(hi)
    out = Image.alpha_composite(out, white)
    # 斜体:以基线为轴,所有字同一个切变(x' = x + ITALIC × (基线 − y))
    shift = int(H * ITALIC) + 2
    wide = Image.new('RGBA', (W + shift * 2, H), (0, 0, 0, 0))
    wide.paste(out, (shift, 0))
    wide = wide.transform(wide.size, Image.AFFINE, (1, ITALIC, -ITALIC * base_y, 0, 1, 0), Image.BICUBIC)
    box = wide.getbbox()
    crop = wide.crop(box)
    # 缩回成品像素:裁剪框先对齐到 SS 的整数倍,偏移才是整数
    x0 = (box[0] // SS) * SS
    y0c = (box[1] // SS) * SS
    x1 = -(-box[2] // SS) * SS
    y1c = -(-box[3] // SS) * SS
    crop = wide.crop((x0, y0c, x1, y1c))
    small = crop.resize((crop.width // SS, crop.height // SS), Image.LANCZOS)
    xoff = (x0 - (shift + pen_x)) // SS
    yoff = (y0c - pad) // SS
    return small, xoff, yoff, int(round(adv / SS))


def build():
    glyphs = []
    rows = []
    for name, base, st in STYLES:
        row = [(base + ord(ch),) + glyph(ch, st) for ch in CHARS]
        rows.append(row)
    gap = 2
    # 每套 20 个字正好排一行;不要求 2 的幂(不开多级渐远、边缘钳制),高度按内容收紧,显存约 1.4MB
    width = 1184
    # 排版:每套一行(放不下就折行)
    placed = []
    x, y, row_h = gap, gap, 0
    for row in rows:
        for code, im, xoff, yoff, adv in row:
            if x + im.width + gap > width:
                x, y, row_h = gap, y + row_h + gap, 0
            placed.append((code, im, x, y, xoff, yoff, adv))
            x += im.width + gap
            row_h = max(row_h, im.height)
        x, y, row_h = gap, y + row_h + gap, 0
    height = y + gap
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    for code, im, px, py, xoff, yoff, adv in placed:
        atlas.paste(im, (px, py))
        glyphs.append([code, px, py, im.width, im.height, xoff, yoff, adv])
    return atlas, glyphs


def write_ts(atlas, glyphs):
    lines = [
        '// 由 tools/qa/battle_num_font_gen.py 生成,勿手改(改样式请改脚本后重新生成)。',
        '// 战斗伤害数字位图字的度量表:一张图 ui/battle/font/battle_num,四套配色按字符码区分(见 BattleNumberFont.ts)。',
        '',
        'export const BATTLE_NUM_FONT_DATA = {',
        f'  /** 名义字号 = 行高(图里的像素)。 */',
        f'  size: {LINE},',
        f'  /** 数字字高(图里的像素);显示字高 = 标签字号 × digitHeight / size。 */',
        f'  digitHeight: {DIGIT},',
        f'  atlasWidth: {atlas.width},',
        f'  atlasHeight: {atlas.height},',
        '  /** 各套配色的字符码偏移(字符码 = 偏移 + ASCII)。 */',
        '  styleBase: { ' + ', '.join(f'{n}: 0x{b:04x}' for n, b, _ in STYLES) + ' },',
        '  /** [字符码, x, y, 宽, 高, 左偏移, 上偏移, 步进] */',
        '  glyphs: [',
    ]
    for g in glyphs:
        lines.append('    [' + ', '.join(str(v) for v in g) + '],')
    lines += ['  ] as ReadonlyArray<readonly [number, number, number, number, number, number, number, number]>,', '};', '']
    open(TS, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))


def main():
    atlas, glyphs = build()
    os.makedirs(os.path.dirname(PNG), exist_ok=True)
    atlas.save(PNG, optimize=True)
    import install_sprite_meta
    install_sprite_meta.write_meta(PNG)   # sprite-frame、不裁边;已有 meta 保留 uuid
    write_ts(atlas, glyphs)
    print('atlas', atlas.size, os.path.getsize(PNG) // 1024, 'KB', 'glyphs', len(glyphs))
    if '--sheet' in sys.argv:
        out = sys.argv[sys.argv.index('--sheet') + 1]
        os.makedirs(out, exist_ok=True)
        by = {g[0]: g for g in glyphs}
        sheet = Image.new('RGBA', (1500, 460), (38, 34, 52, 255))

        def draw(text, base, x, y, scale):
            for ch in text:
                g = by[base + ord(ch)]
                im = atlas.crop((g[1], g[2], g[1] + g[3], g[2] + g[4]))
                if scale != 1:
                    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
                sheet.alpha_composite(im, (int(x + g[5] * scale), int(y + g[6] * scale)))
                x += g[7] * scale
            return x
        y = 14
        for (name, base, _), px, texts in zip(STYLES, (27, 40, 27, 27), (['17', '65', '374', '1.2K', '86.4K', '3.5M', '268.7B'], ['65', '893', '2.1K', '268.7K', '4.2M', '1.8B', '31.5Qa'],
                                                                             ['-217', '-1.4K'], ['+120', '+2.4K'])):
            x = 20
            for t in texts:
                x = draw(t, base, x, y, px / DIGIT) + 34
            y += 100
        sheet.convert('RGB').save(os.path.join(out, 'battle_num_sheet.png'))
        atlas_bg = Image.new('RGBA', atlas.size, (38, 34, 52, 255))
        atlas_bg.alpha_composite(atlas)
        atlas_bg.convert('RGB').save(os.path.join(out, 'battle_num_atlas_preview.png'))
        print(os.path.join(out, 'battle_num_sheet.png'))


if __name__ == '__main__':
    main()
