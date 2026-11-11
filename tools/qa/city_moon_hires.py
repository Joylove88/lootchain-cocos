# -*- coding: utf-8 -*-
"""主城(月夜)高清重绘(2026-11-11 用户看完实机:「美术可以更细腻吗」→ 看过样片后「按 2 倍重绘」)。

现在整城图 4348×2447 像素铺成 5825×3278 世界单位,1080p 下 1 个图片像素要放大到约 1.24 个屏幕像素(2K 屏约 1.65),
再加上生图本身偏软,画面就显得不够细。办法:把整城图按小块交给生图「原样重绘成高一倍精度」(内容、位置一点不动,只加细节和锐度),
再拼回去,得到 2 倍精度的整城图;可走栅格 / 遮挡条 / 抠图沿用原来的分割图。

  python tools/qa/city_moon_hires.py sample 名字 cx cy [倍数=2]     # 以 (cx, cy)(整图像素)为中心取一块,出一张高清重绘样片
  python tools/qa/city_moon_hires.py compare 名字 [倍数=2]           # 新旧对比图:按 1080p / 2K 屏上实际看到的大小并排
  python tools/qa/city_moon_hires.py all [--redo=行,列 ...]          # 整城 6×6 块逐块重绘并拼成 2 倍整城图(可断点续跑)
  python tools/qa/city_moon_hires.py all --no-gen                    # 不出图,只把已有的块拼起来存 mosaic_hi_partial.png(提前看接缝)
  python tools/qa/city_moon_hires.py status                          # 哪些块已出
产物:%TEMP%/lootchain-qa/city_moon/hires/(piece_<行><列>.png 原始重绘块、mosaic_hi.png 2 倍整城图、mosaic_hi_preview.jpg)

整城重绘的做法:
  - 源图每块 836×471(放大 2 倍正好是生图的 1672×942),6 列 × 6 行,左右重叠约 134、上下约 76 源像素;按行从左到右出。
  - 给生图的底稿 = 源图那一块放大 2 倍;左边 / 上边已经出好的重叠带直接贴成品(让它照着成品的石缝 / 瓦片往下接)。
  - 对位检查:重绘块和底稿分块做相位相关,位移中位数超过 1 或九成分位超过 3 个像素就重出(样片实测都在 ±1 内)。
  - 低频换回原图:out = 重绘 − 模糊(重绘) + 模糊(底稿)(σ = 12)。色调、光池、阴影的位置完全跟原图走,只留下重绘的细节和锐度,
    块和块之间的低频天然一致。
  - 和已拼好的部分在重叠带里沿「新旧差异最小」的线切开(不做大面积渐变,免得石缝叠成重影)。
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
KNOWN_NOTE = (
    ' Note: a strip along the LEFT edge and/or the TOP edge of image 1 is already rendered in the final crisp quality (you can see it is '
    'sharper than the rest). Reproduce those strips unchanged, and render everything else to exactly the same level of detail, '
    'continuing their stone joints, roof slates, planks and foliage seamlessly across the boundary.'
)

# ── 整城重绘的分块 ──
S = 2
CW, CH = 836, 471
COLS = [0, 702, 1405, 2107, 2810, 3512]
ROWS = [0, 395, 790, 1186, 1581, 1976]
PW, PH = CW * S, CH * S
HW, HH = GEN.MW * S, GEN.MH * S
SIGMA = 12.0
FEATHER = 4
RETRIES = 2


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


def block_shifts(a, b, bs=256):
    """两张同尺寸灰度图分块相位相关 → 每块位移 (dx, dy)(像素);只留相关峰明显的块。"""
    import numpy as np
    h, w = a.shape
    win = np.outer(np.hanning(bs), np.hanning(bs))
    out = []
    for y in range(0, h - bs + 1, bs // 2):
        for x in range(0, w - bs + 1, bs // 2):
            pa = a[y:y + bs, x:x + bs]
            pb = b[y:y + bs, x:x + bs]
            fa = np.fft.fft2((pa - pa.mean()) * win)
            fb = np.fft.fft2((pb - pb.mean()) * win)
            r = fa * np.conj(fb)
            r /= np.maximum(1e-6, np.abs(r))
            c = np.fft.ifft2(r).real
            iy, ix = np.unravel_index(int(np.argmax(c)), c.shape)
            if c.max() > 0.05:
                out.append((ix if ix < bs // 2 else ix - bs, iy if iy < bs // 2 else iy - bs))
    return np.array(out, np.float32) if out else np.zeros((0, 2), np.float32)


def seam_weight(old, new, known, ow_x, ow_y):
    """重叠带里新旧怎么接:左带找一条竖缝、上带找一条横缝(最小误差),缝的已知侧用旧图。返回「用旧图」的权重 0..1。"""
    import numpy as np
    from scipy import ndimage
    h, w = known.shape
    diff = ndimage.uniform_filter(np.abs(new - old).mean(-1), 7)
    use_old = np.zeros((h, w), bool)
    xs = np.arange(w)[None, :]
    ys = np.arange(h)[:, None]
    if ow_x > 24 and known[:, :8].mean() > 0.9:
        a, b = 8, ow_x - 8
        path = a + GEN.seam_path(diff[:, a:b])
        use_old |= xs < path[:, None]
    if ow_y > 24 and known[:8, :].mean() > 0.9:
        a, b = 8, ow_y - 8
        path = a + GEN.seam_path(diff[a:b, :].T)
        use_old |= ys < path[None, :]
    use_old &= known
    weight = ndimage.gaussian_filter(use_old.astype(np.float32), FEATHER)
    weight[~known] = 0
    return weight


def cmd_all(redo, no_gen=False):
    import numpy as np
    from scipy import ndimage
    import battle_bg_layer_gen as B
    os.makedirs(OUT, exist_ok=True)
    mosaic = Image.open(os.path.join(SRC, 'mosaic.png')).convert('RGB')
    hi = np.zeros((HH, HW, 3), np.uint8)
    filled = np.zeros((HH, HW), bool)
    for r, y0 in enumerate(ROWS):
        for c, x0 in enumerate(COLS):
            tag = '%d%d' % (r, c)
            piece = os.path.join(OUT, 'piece_%s.png' % tag)
            hx, hy = x0 * S, y0 * S
            up_img = mosaic.crop((x0, y0, x0 + CW, y0 + CH)).resize((PW, PH), Image.LANCZOS)
            up = np.asarray(up_img, np.float32)
            known = filled[hy:hy + PH, hx:hx + PW].copy()
            old = hi[hy:hy + PH, hx:hx + PW].astype(np.float32)
            if (r, c) in redo and os.path.exists(piece):
                os.remove(piece)
            if not os.path.exists(piece) and no_gen:
                # 只拼已有的块(另一个进程还在出图时用来提前看接缝):存一张已拼部分的预览就收工
                rows_done = hy + (PH if c > 0 else 0)
                part = hi[:max(PH, rows_done)]
                Image.fromarray(part).save(os.path.join(OUT, 'mosaic_hi_partial.png'))
                print('partial', tag, part.shape, flush=True)
                return False
            if not os.path.exists(piece):
                guide = up.copy()
                guide[known] = old[known]
                gpath = os.path.join(OUT, '_guide_%s.png' % tag)
                Image.fromarray(np.clip(guide, 0, 255).astype(np.uint8)).resize((TW, TH), Image.LANCZOS).save(gpath)
                best = None
                for attempt in range(RETRIES + 1):
                    tmp = os.path.join(OUT, '_try_%s_%d.png' % (tag, attempt))
                    if not B.run_codex([gpath], PROMPT + (KNOWN_NOTE if known.any() else ''), tmp, 'hires_%s#%d' % (tag, attempt)):
                        continue
                    res = Image.open(tmp).convert('RGB').resize((PW, PH), Image.LANCZOS)
                    sh = block_shifts(np.asarray(up_img.convert('L'), np.float32), np.asarray(res.convert('L'), np.float32))
                    med = float(np.abs(np.median(sh, 0)).max()) if len(sh) else 99.0
                    p90 = float(np.percentile(np.abs(sh).max(1), 90)) if len(sh) else 99.0
                    print('   piece %s try %d: blocks %d shift median %.1f p90 %.1f' % (tag, attempt, len(sh), med, p90), flush=True)
                    if best is None or (med, p90) < best[0]:
                        best = ((med, p90), tmp)
                    if med <= 1.0 and p90 <= 3.0:
                        break
                if best is None:
                    print('STOP: piece %s 生图失败,稍后重跑本命令续上' % tag, flush=True)
                    return False
                if best[0][0] > 1.0 or best[0][1] > 3.0:
                    print('   WARN piece %s 对位偏差较大 %s(仍采用,拼好后重点看这一块)' % (tag, best[0]), flush=True)
                os.replace(best[1], piece)
                for f in os.listdir(OUT):
                    if f.startswith('_try_%s_' % tag) or f == '_guide_%s.png' % tag:
                        os.remove(os.path.join(OUT, f))
            new = np.asarray(Image.open(piece).convert('RGB').resize((PW, PH), Image.LANCZOS), np.float32)
            # 低频换回原图:色调 / 光影跟原图走,只留重绘的细节
            low_new = np.stack([ndimage.gaussian_filter(new[..., k], SIGMA) for k in range(3)], -1)
            low_up = np.stack([ndimage.gaussian_filter(up[..., k], SIGMA) for k in range(3)], -1)
            new = np.clip(new - low_new + low_up, 0, 255)
            if known.any():
                ow_x = (CW - (x0 - COLS[c - 1])) * S if c > 0 else 0
                ow_y = (CH - (y0 - ROWS[r - 1])) * S if r > 0 else 0
                weight = seam_weight(old, new, known, ow_x, ow_y)[..., None]
                new = old * weight + new * (1 - weight)
            hi[hy:hy + PH, hx:hx + PW] = np.clip(new, 0, 255).astype(np.uint8)
            filled[hy:hy + PH, hx:hx + PW] = True
            print('placed', tag, flush=True)
    assert filled.all(), '还有没覆盖到的像素'
    Image.fromarray(hi).save(os.path.join(OUT, 'mosaic_hi.png'))
    Image.fromarray(hi).resize((HW // 4, HH // 4), Image.LANCZOS).save(os.path.join(OUT, 'mosaic_hi_preview.jpg'), quality=88)
    print('wrote', os.path.join(OUT, 'mosaic_hi.png'), (HW, HH), flush=True)
    return True


def cmd_status():
    done = [(r, c) for r in range(len(ROWS)) for c in range(len(COLS)) if os.path.exists(os.path.join(OUT, 'piece_%d%d.png' % (r, c)))]
    print('pieces %d / %d' % (len(done), len(ROWS) * len(COLS)))
    for r in range(len(ROWS)):
        print('  ' + ' '.join('#' if (r, c) in done else '.' for c in range(len(COLS))))
    print('mosaic_hi.png', os.path.exists(os.path.join(OUT, 'mosaic_hi.png')))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'sample':
        cmd_sample(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]) if len(sys.argv) > 5 else 2.0)
    elif cmd == 'compare':
        cmd_compare(sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 2.0)
    elif cmd == 'all':
        redo_set = set()
        for arg in sys.argv[2:]:
            if arg.startswith('--redo='):
                rr, cc = arg.split('=', 1)[1].split(',')
                redo_set.add((int(rr), int(cc)))
        cmd_all(redo_set, '--no-gen' in sys.argv)
    elif cmd == 'status':
        cmd_status()
    else:
        print(__doc__)
