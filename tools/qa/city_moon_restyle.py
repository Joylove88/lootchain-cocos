# -*- coding: utf-8 -*-
"""主城(月夜)去 AI 感样片(2026-11-11 用户看完 2 倍高清版实机对比:「感觉还是AI感偏重」)。

这位用户说的「AI 感」历次都落在这几样上(见记忆 ui-asset-reuse-and-style / village-v3-realistic / gray-v4-relayout-1108):
重复的图案(星形叶团、一颗颗花点、每块石头一样的高光)、满屏发光和高饱和、塑料亮面、过度锐化;
通过的口径是「真实照片质感、降饱和、材质自然不重复、不发光」。高清重绘时我写的是「每片瓦每块石都要清晰的边」+「饱和的蓝青月光」,
等于把这几样又放大了一遍。这里在同一块画面上出几版不同处理给用户挑方向,几何(房子 / 树 / 栏杆的位置和轮廓)一律不动:

  python tools/qa/city_moon_restyle.py sample 名字 风格 cx cy     # 交给生图按风格原样重绘(风格见 STYLES;cx, cy = 整图像素里的中心)
  python tools/qa/city_moon_restyle.py matte 名字 cx cy            # 不重绘:对现有高清图做「压光 + 降艳」后处理
  python tools/qa/city_moon_restyle.py sheet 名字                  # 现在 + 各版并排(按 1080p 屏上实际大小)
产物:%TEMP%/lootchain-qa/city_moon/restyle/
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import city_moon_gen as GEN  # noqa: E402
import city_moon_hires as HI  # noqa: E402

SRC = GEN.OUT
OUT = os.path.join(SRC, 'restyle')
CW, CH = HI.CW, HI.CH            # 一块 836×471 整图像素,放大 2 倍 = 生图的 1672×942
PW, PH = HI.PW, HI.PH

SAME = (
    'Generate ONE new image with your image generation tool. Image 1 is a soft enlargement of part of a background plate from our '
    'own top-down game: a moonlit medieval stone town seen from above at a steep oblique angle. Re-render EXACTLY the same scene: '
    'identical framing; every building, roof, wall, door, window, lamp post, fence, planter, tree, bush, stair and paving edge stays '
    'in exactly the same place with the same outline, size and proportions. Our collision map is traced from image 1, so nothing '
    'may move, appear or disappear.\n'
)
TAIL = (
    'Clean image: no film grain, no noise, no speckle, no blur, no depth of field, no vignette. EMPTY plate: no people, no animals, '
    'no smoke, no text. Landscape 16:9, 1672x941.'
)
STYLES = {
    # 实拍质感:11-08 荒原 / 主城原型「插画风 AI 感强」→ 改成这套「真实航拍照片」口径后通过
    'real': ('实拍质感', SAME + (
        'Change only the rendering - it must look like a real high-resolution oblique aerial drone PHOTOGRAPH of a real preserved '
        'medieval town at night, not an illustration and not game concept art:\n'
        '- true-to-life materials with natural irregularity and weathering: worn cobbles and flagstones of uneven size and tone with '
        'dirt and moss in the joints, old slate roofs with chipped, patched, slightly misaligned tiles, rough lime plaster, aged dark '
        'oak beams, real wrought iron;\n'
        '- real vegetation: trees with natural irregular foliage masses (no star-shaped leaves, no stamped repeating leaf pattern), '
        'real shrubs and ivy; flowers small, sparse and natural instead of bright dots;\n'
        '- realistic night lighting: cool desaturated moonlight from the upper left with soft cast shadows falling to the lower '
        'right, darker contact shadows where walls meet the ground; street lamps and lit windows are small practical warm lights '
        'with natural falloff - no bloom, no glow halos, no light rays; a few windows stay dark;\n'
        '- realistic muted colour palette (blue-grey stone, dark slate, deep greens, rust-red and ochre autumn leaves), nothing neon '
        'or candy-coloured;\n'
        '- matte surfaces: no glossy highlight on every stone, no HDR look, no outlines, no painterly brush strokes, no '
        'over-sharpening, no fantasy-game look.\n'
        'It should read like a clean 50 megapixel long-exposure photo. ') + TAIL),
    # 实拍质感,但月光更亮更蓝、灯下暖光更明显(保住「月夜」选定时的冷暖气氛,免得整屏发灰发暗)
    'realblue': ('实拍质感 · 月色更亮', SAME + (
        'Change only the rendering - it must look like a real high-resolution oblique aerial drone PHOTOGRAPH of a real preserved '
        'medieval town on a bright full-moon night (as clear as blue hour just after dusk), not an illustration and not game '
        'concept art:\n'
        '- true-to-life materials with natural irregularity and weathering: worn cobbles and flagstones of uneven size and tone with '
        'dirt and moss in the joints, old slate roofs with chipped, patched, slightly misaligned tiles, rough lime plaster, aged dark '
        'oak beams, real wrought iron;\n'
        '- real vegetation: trees with natural irregular foliage masses (no star-shaped leaves, no stamped repeating leaf pattern), '
        'real shrubs and ivy; flowers small, sparse and natural instead of bright dots;\n'
        '- lighting: bright moonlight from the upper left with a distinct cool blue cast, everything clearly readable, soft cast '
        'shadows falling to the lower right, darker contact shadows where walls meet the ground; street lamps and lit windows throw '
        'clearly visible warm amber pools onto the nearby ground and walls with natural falloff - but no bloom, no glow halos, no '
        'light rays; a few windows stay dark;\n'
        '- natural colour that is not grey: blue-tinted stone in the moonlight, warm amber near the lamps, rich rust-red and orange '
        'autumn leaves, deep greens; nothing neon or candy-coloured;\n'
        '- matte surfaces: no glossy highlight on every stone, no HDR look, no outlines, no painterly brush strokes, no '
        'over-sharpening, no fantasy-game look.\n'
        'It should read like a clean 50 megapixel long-exposure photo. ') + TAIL),
    # 哑光手绘:图标那边用户选过「哑光手绘」(无金环、无发光)
    'paint': ('哑光手绘', SAME + (
        'Change only the rendering - repaint it as a hand-painted background by a senior human environment painter for a premium 2D '
        'RPG (opaque, gouache-like digital painting):\n'
        '- matte, non-glossy surfaces; no specular highlight on every stone;\n'
        '- controlled detail: large calm planes on the ground, roofs and walls with gentle tonal variation and only a few hand-placed '
        'cracks, chipped tiles and joints; fine detail is reserved for focal objects (doors, signs, lamps, the forge, the cart);\n'
        '- paving as broad irregular flagstones with soft worn edges, clearly not a uniform repeated cobble pattern;\n'
        '- foliage painted as soft organic masses with a few defined leaves along the silhouette (no star-shaped leaves, no stamped '
        'repeating leaf pattern); flowers as a few muted accents, not rows of bright dots;\n'
        '- restrained palette: slate blue-grey moonlight, moss green, weathered wood, small warm amber lamp pools (no bloom, no '
        'halos), muted rust-red autumn leaves; nothing neon or candy-coloured;\n'
        '- one consistent light: moonlight from the upper left, soft cast shadows to the lower right;\n'
        '- confident brushwork with clean readable shapes; no outlines, no smeared mush. ') + TAIL),
}


def box_of(cx, cy):
    x0 = max(0, min(GEN.MW - CW, round(cx - CW / 2)))
    y0 = max(0, min(GEN.MH - CH, round(cy - CH / 2)))
    return x0, y0, x0 + CW, y0 + CH


def prepare(name, cx, cy):
    """存这一块的范围、给生图的底稿(标准图放大 2 倍)和现在的高清版;返回 (范围, 底稿路径)。"""
    os.makedirs(OUT, exist_ok=True)
    box = box_of(cx, cy)
    with open(os.path.join(OUT, f'{name}_box.txt'), 'w', encoding='utf-8') as f:
        f.write(','.join(str(v) for v in box))
    guide = os.path.join(OUT, f'{name}_guide.png')
    if not os.path.exists(guide):
        Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB').crop(box).resize((PW, PH), Image.LANCZOS).save(guide)
    cur = os.path.join(OUT, f'{name}_cur.png')
    if not os.path.exists(cur):
        hi = Image.open(os.path.join(SRC, 'hires', 'mosaic_hi.png')).convert('RGB')
        hi.crop(tuple(v * HI.S for v in box)).save(cur)
    return box, guide


def alignment(guide, out):
    """重绘后和底稿的对位:分块相位相关的位移(像素),中位数 / 九成分位。"""
    import numpy as np
    a = np.asarray(Image.open(guide).convert('L'), np.float32)
    b = np.asarray(Image.open(out).convert('L').resize((PW, PH), Image.LANCZOS), np.float32)
    sh = HI.block_shifts(a, b)
    if len(sh) == 0:
        return None
    mag = np.hypot(sh[:, 0], sh[:, 1])
    return round(float(np.median(mag)), 2), round(float(np.percentile(mag, 90)), 2), len(sh)


def cmd_sample(name, style, cx, cy):
    import battle_bg_layer_gen as B
    _box, guide = prepare(name, cx, cy)
    dst = os.path.join(OUT, f'{name}_{style}.png')
    B.run_codex([guide], STYLES[style][1], dst, f'restyle_{name}_{style}')
    Image.open(dst).convert('RGB').resize((PW, PH), Image.LANCZOS).save(dst)
    print(dst, '对位(中位数, 九成分位, 块数)', alignment(guide, dst))


def matte(rgb):
    """压光 + 降艳(不重绘):削掉每块石头 / 每片瓦上的亮边,压高光,整体降饱和,品红花点和橙黄光晕多降一些。输入输出 0..1 浮点。"""
    import numpy as np
    from scipy import ndimage
    y = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    # 局部高光:比周围亮的部分削掉一多半(石缝 / 瓦缝这些暗线留着,结构不丢)
    base = ndimage.gaussian_filter(y, 5.0)
    d = y - base
    y2 = base + np.where(d > 0, d * 0.4, d * 0.9)
    # 高光软压:0.6 以上按 0.55 的斜率走
    y2 = np.where(y2 > 0.6, 0.6 + (y2 - 0.6) * 0.55, y2)
    gain = (y2 / np.maximum(1e-4, y))[..., None]
    out = rgb * gain
    # 饱和度:按色相分段降
    mx = out.max(-1)
    mn = out.min(-1)
    c = mx - mn
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    hue = np.zeros_like(mx)
    m = c > 1e-5
    rc = m & (mx == r)
    gc = m & (mx == g) & ~rc
    bc = m & ~rc & ~gc
    hue[rc] = ((g - b)[rc] / c[rc]) % 6
    hue[gc] = (b - r)[gc] / c[gc] + 2
    hue[bc] = (r - g)[bc] / c[bc] + 4
    hue *= 60

    def band(lo, hi, soft=12.0):
        return np.clip((hue - lo) / soft, 0, 1) * np.clip((hi - hue) / soft, 0, 1)
    keep = np.full_like(mx, 0.82)
    keep -= 0.34 * np.minimum(1, band(285, 352) * 4)        # 品红 / 粉:花点
    keep -= 0.14 * np.minimum(1, band(22, 62) * 4) * (mx > 0.55)   # 亮的橙黄:灯和窗的光
    keep -= 0.08 * np.minimum(1, band(165, 215) * 4)        # 青:月光里的青绿
    grey = (out @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    out = grey + (out - grey) * keep[..., None]
    return np.clip(out, 0, 1)


def cmd_matte(name, cx, cy):
    import numpy as np
    prepare(name, cx, cy)
    cur = np.asarray(Image.open(os.path.join(OUT, f'{name}_cur.png')).convert('RGB'), np.float32) / 255.0
    dst = os.path.join(OUT, f'{name}_matte.png')
    Image.fromarray((matte(cur) * 255 + 0.5).astype('uint8'), 'RGB').save(dst)
    print(dst)


def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('msyh.ttc', 28)
    except Exception:
        font = ImageFont.load_default()
    d.rectangle([0, 0, d.textlength(text, font=font) + 28, 48], fill=(0, 0, 0))
    d.text((14, 6), text, fill=(255, 230, 150), font=font)
    return im


def cmd_sheet(name):
    """各版并排:每格 = 这一块在 1080p 屏上的实际大小。"""
    k = HI.UNIT * 1920 / HI.VIEW_W          # 1 个整图像素 = k 个屏幕像素
    w, h = round(CW * k), round(CH * k)
    panels = [('cur', 'A  现在(2 倍高清版)'), ('matte', 'B  不重绘 · 压光降艳')]
    panels += [(key, f'{chr(67 + i)}  重绘 · {title}') for i, (key, (title, _p)) in enumerate(STYLES.items())]
    cells = []
    for key, text in panels:
        p = os.path.join(OUT, f'{name}_{key}.png')
        if os.path.exists(p):
            cells.append(label(Image.open(p).convert('RGB').resize((w, h), Image.LANCZOS), text))
    cols = 2
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w + (cols - 1) * 12, rows * h + (rows - 1) * 12), (0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.paste(cell, ((i % cols) * (w + 12), (i // cols) * (h + 12)))
    dst = os.path.join(OUT, f'{name}_sheet.jpg')
    sheet.save(dst, quality=93)
    print(dst, sheet.size, 'panels', len(cells))


# ── 整城重绘(11-11 用户选定 D「实拍质感 · 月色更亮」)──
# 分块、出图顺序、断点续跑都和高清重绘(city_moon_hires.py all)一样,三处不同:
#   1. 提示词换成选定的画风,另给一张画风基准图(用户选定的那张样片),每一块都照它的材质 / 亮度 / 色调出;
#   2. 不做「低频换回原图」(那会把新色调拉回旧图);改成:新块先按重叠带里的均值向已拼好的部分对齐亮度 / 色调,
#      再做两段式接缝——低频(色调、明暗)在整条重叠带里缓缓过渡,高频(石缝、瓦片)沿最小误差线硬切;
#   3. 画风换了纹理对不上,对位检查改成只比结构(边缘强度图分块找位移)。
ALL = os.path.join(OUT, 'all')
STYLE = 'realblue'
STYLE_REF = os.path.join(OUT, 'guild_realblue.png')
KNOWN_NOTE = (
    ' Note: a strip along the LEFT edge and/or the TOP edge of image 1 is already rendered in the final photographic look (you can '
    'see it differs from the rest). Reproduce those strips unchanged, and render everything else in exactly that look, continuing '
    'their paving, roofs, walls, foliage, colour and brightness seamlessly across the boundary.'
)
REF_NOTE = (
    ' Image 2 is a finished plate of another corner of the same town in exactly the target look: match its materials, level of '
    'detail, colour balance, brightness, contrast and lighting. Use image 2 ONLY as a look reference - do not copy any of its '
    'objects or its layout into the new image.'
)
SHIFT_MED, SHIFT_NEAR = 2.0, 0.6     # 对位判据(高清图像素):位移中位数不超过 2,且至少六成的块在 4 像素内(树叶纹理会造出个别离群块)
SIGMA_LOW = 24.0                      # 两段式接缝里「低频」的界线(高清图像素)
GAIN_LIMIT = 0.12                     # 新块向已拼好的部分对齐亮度 / 色调,每个通道最多调这么多


def struct_shifts(a_img, b_img, bs=160, search=8):
    """两张同尺寸的图只比结构:缩小一半取边缘强度图,分块在 ±search 内找相关最大的位移。返回各块位移(高清图像素)。"""
    import numpy as np
    from scipy import ndimage

    def edges(im):
        g = np.asarray(im.convert('L').resize((PW // 2, PH // 2), Image.BILINEAR), np.float32)
        g = ndimage.gaussian_filter(g, 1.5)
        return np.hypot(ndimage.sobel(g, 0), ndimage.sobel(g, 1))
    a, b = edges(a_img), edges(b_img)
    h, w = a.shape
    win = np.outer(np.hanning(bs), np.hanning(bs))
    out = []
    for y in range(0, h - bs + 1, bs // 2):
        for x in range(0, w - bs + 1, bs // 2):
            pa = (a[y:y + bs, x:x + bs] - a[y:y + bs, x:x + bs].mean()) * win
            pb = (b[y:y + bs, x:x + bs] - b[y:y + bs, x:x + bs].mean()) * win
            na, nb = float(np.sqrt((pa ** 2).sum())), float(np.sqrt((pb ** 2).sum()))
            if na < 1e-3 or nb < 1e-3:
                continue
            cc = np.fft.ifft2(np.fft.fft2(pa) * np.conj(np.fft.fft2(pb))).real / (na * nb)
            best = (-1.0, 0, 0)
            for dy in range(-search, search + 1):
                for dx in range(-search, search + 1):
                    v = cc[dy % bs, dx % bs]
                    if v > best[0]:
                        best = (float(v), dx, dy)
            if best[0] > 0.25:
                out.append((best[1] * 2, best[2] * 2))
    return np.array(out, np.float32) if out else np.zeros((0, 2), np.float32)


def shift_stats(a_img, b_img):
    """(位移中位数, 位移在 4 像素内的块占比, 测得出的块数);测得出的块不到 4 个 = 量不出来,按通过算。"""
    import numpy as np
    sh = struct_shifts(a_img, b_img)
    if len(sh) < 4:
        return 0.0, 1.0, len(sh)
    mag = np.hypot(sh[:, 0], sh[:, 1])
    return float(np.median(mag)), float((mag <= 4).mean()), len(sh)


def cmd_all(redo, no_gen=False):
    import numpy as np
    from scipy import ndimage
    import battle_bg_layer_gen as B
    os.makedirs(ALL, exist_ok=True)
    S, COLS, ROWS, HW, HH = HI.S, HI.COLS, HI.ROWS, HI.HW, HI.HH
    mosaic = Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB')
    hi = np.zeros((HH, HW, 3), np.uint8)
    filled = np.zeros((HH, HW), bool)
    prompt = STYLES[STYLE][1] + REF_NOTE

    def blur3(arr, sigma):
        return np.stack([ndimage.gaussian_filter(arr[..., k], sigma) for k in range(3)], -1)

    for r, y0 in enumerate(ROWS):
        for c, x0 in enumerate(COLS):
            tag = '%d%d' % (r, c)
            piece = os.path.join(ALL, 'piece_%s.png' % tag)
            hx, hy = x0 * S, y0 * S
            up_img = mosaic.crop((x0, y0, x0 + CW, y0 + CH)).resize((PW, PH), Image.LANCZOS)
            up = np.asarray(up_img, np.float32)
            known = filled[hy:hy + PH, hx:hx + PW].copy()
            old = hi[hy:hy + PH, hx:hx + PW].astype(np.float32)
            if (r, c) in redo and os.path.exists(piece):
                os.remove(piece)
            if not os.path.exists(piece) and no_gen:
                rows_done = hy + (PH if c > 0 else 0)
                part = hi[:max(PH, rows_done)]
                Image.fromarray(part).save(os.path.join(OUT, 'mosaic_hi_partial.png'))
                print('partial', tag, part.shape, flush=True)
                return False
            if not os.path.exists(piece):
                guide = up.copy()
                guide[known] = old[known]
                gpath = os.path.join(ALL, '_guide_%s.png' % tag)
                Image.fromarray(np.clip(guide, 0, 255).astype(np.uint8)).resize((HI.TW, HI.TH), Image.LANCZOS).save(gpath)
                best = None
                for attempt in range(HI.RETRIES + 1):
                    tmp = os.path.join(ALL, '_try_%s_%d.png' % (tag, attempt))
                    if not B.run_codex([gpath, STYLE_REF], prompt + (KNOWN_NOTE if known.any() else ''), tmp, 'real_%s#%d' % (tag, attempt)):
                        continue
                    res = Image.open(tmp).convert('RGB').resize((PW, PH), Image.LANCZOS)
                    med, near, blocks = shift_stats(up_img, res)
                    print('   piece %s try %d: blocks %d shift median %.1f within4 %.0f%%' % (tag, attempt, blocks, med, near * 100), flush=True)
                    if best is None or (med, -near) < best[0]:
                        best = ((med, -near), tmp)
                    if med <= SHIFT_MED and near >= SHIFT_NEAR:
                        break
                if best is None:
                    print('STOP: piece %s 生图失败,稍后重跑本命令续上' % tag, flush=True)
                    return False
                if best[0][0] > SHIFT_MED or -best[0][1] < SHIFT_NEAR:
                    print('   WARN piece %s 对位偏差较大 %s(仍采用,拼好后重点看这一块)' % (tag, best[0]), flush=True)
                os.replace(best[1], piece)
                for f in os.listdir(ALL):
                    if f.startswith('_try_%s_' % tag) or f == '_guide_%s.png' % tag:
                        os.remove(os.path.join(ALL, f))
            new = np.asarray(Image.open(piece).convert('RGB').resize((PW, PH), Image.LANCZOS), np.float32)
            if known.any():
                # 亮度 / 色调先向已拼好的部分对齐(按重叠带里的均值,逐通道)
                gain = np.array([np.clip(old[..., k][known].mean() / max(1.0, new[..., k][known].mean()), 1 - GAIN_LIMIT, 1 + GAIN_LIMIT) for k in range(3)], np.float32)
                new = new * gain
                ow_x = (CW - (x0 - COLS[c - 1])) * S if c > 0 else 0
                ow_y = (CH - (y0 - ROWS[r - 1])) * S if r > 0 else 0
                base = np.where(known[..., None], old, new)
                low_old, low_new = blur3(base, SIGMA_LOW), blur3(new, SIGMA_LOW)
                ys, xs = np.mgrid[0:PH, 0:PW].astype(np.float32)
                wl = np.zeros((PH, PW), np.float32)
                if ow_x > 24 and known[:, :8].mean() > 0.9:
                    wl = np.maximum(wl, np.clip(1 - xs / ow_x, 0, 1))
                if ow_y > 24 and known[:8, :].mean() > 0.9:
                    wl = np.maximum(wl, np.clip(1 - ys / ow_y, 0, 1))
                wl = (wl * wl * (3 - 2 * wl))[..., None]
                wh = HI.seam_weight(old, new, known, ow_x, ow_y)[..., None]
                new = low_old * wl + low_new * (1 - wl) + (base - low_old) * wh + (new - low_new) * (1 - wh)
                print('   gain %s' % ' '.join('%.3f' % g for g in gain), flush=True)
            hi[hy:hy + PH, hx:hx + PW] = np.clip(new, 0, 255).astype(np.uint8)
            filled[hy:hy + PH, hx:hx + PW] = True
            print('placed', tag, flush=True)
    assert filled.all(), '还有没覆盖到的像素'
    full = Image.fromarray(hi)
    full.save(os.path.join(OUT, 'mosaic_hi.png'))
    full.resize((HW // S, HH // S), Image.LANCZOS).save(os.path.join(OUT, 'mosaic.png'))          # 标准版 = 高清图缩一半
    full.resize((HW // 4, HH // 4), Image.LANCZOS).save(os.path.join(OUT, 'mosaic_hi_preview.jpg'), quality=88)
    print('wrote', os.path.join(OUT, 'mosaic_hi.png'), (HW, HH), flush=True)
    return True


def cmd_status():
    done = [(r, c) for r in range(len(HI.ROWS)) for c in range(len(HI.COLS)) if os.path.exists(os.path.join(ALL, 'piece_%d%d.png' % (r, c)))]
    print('pieces %d / %d' % (len(done), len(HI.ROWS) * len(HI.COLS)))
    for r in range(len(HI.ROWS)):
        print('  ' + ' '.join('#' if (r, c) in done else '.' for c in range(len(HI.COLS))))
    print('mosaic_hi.png', os.path.exists(os.path.join(OUT, 'mosaic_hi.png')))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'sample':
        cmd_sample(sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5]))
    elif cmd == 'matte':
        cmd_matte(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
    elif cmd == 'sheet':
        cmd_sheet(sys.argv[2])
    elif cmd == 'all':
        redo_set = set()
        for arg in sys.argv[2:]:
            if arg.startswith('--redo='):
                rr, cc = arg.split('=', 1)[1].split(',')
                redo_set.add((int(rr), int(cc)))
        cmd_all(redo_set, '--no-gen' in sys.argv)
    elif cmd == 'status':
        cmd_status()
    elif cmd == 'shift':
        # 校对位检查:底稿 vs 某张样片
        print(sys.argv[3], shift_stats(Image.open(os.path.join(OUT, f'{sys.argv[2]}_guide.png')).convert('RGB'),
                                       Image.open(os.path.join(OUT, f'{sys.argv[2]}_{sys.argv[3]}.png')).convert('RGB').resize((PW, PH), Image.LANCZOS)))
    else:
        print(__doc__)
