# -*- coding: utf-8 -*-
"""战斗背景「原样高清重绘」(2026-11-11 战斗画面精致化;做法同 city_moon_hires:内容、位置一点不动,只提精度和锐度)。

现状:战斗背景源图 1672×941,铺满画布后 1080p 电脑放大 1.15 倍、2400×1080 手机放大 1.44 倍(2K 屏 1.53 倍),画面发软。
办法:每张背景切 2×2 块(每块源图 1045×588,左右 / 上下各重叠 40%),放大 1.6 倍交给生图「原样重绘」成 1672×941,
拼回 2675×1506,再缩到 2508×1412(源图的 1.5 倍,手机 / 电脑 / 2K 屏都不再放大)入库。
  - 给生图的底稿 = 源图那一块放大 1.6 倍;左边 / 上边已经出好的重叠带直接贴成品,让它照着成品往下接。
  - 对位检查:重绘块和底稿分块做相位相关,位移中位数 > 1 或九成分位 > 3 像素就重出。
  - 低频换回原图:out = 重绘 − 模糊(重绘) + 模糊(底稿)(σ = 12)。色调 / 明暗 / 雾气完全跟原图走,只留重绘的细节和锐度。
  - 块和块在重叠带里沿「新旧差异最小」的线切开,不做大面积渐变(渐变会把石缝叠成重影)。

  python tools/qa/battle_bg_hires.py sample <背景名> [cx cy]      # 取一块出样片
  python tools/qa/battle_bg_hires.py compare <背景名>             # 样片对比图:按手机 / 电脑屏上实际大小并排
  python tools/qa/battle_bg_hires.py all [背景名 ...] [--redo=背景名:行,列]   # 整张重绘(可断点续跑);缺省 = 7 张分层背景
  python tools/qa/battle_bg_hires.py status
  python tools/qa/battle_bg_hires.py sheet <背景名>               # 整张的新旧对比(三处 1:1 局部)
  python tools/qa/battle_bg_hires.py install [背景名 ...]         # 入库:<名>.jpg(2508×1412)+ <名>_mask.jpg(近景遮罩,半分辨率);旧 PNG 先备份
产物:%TEMP%/lootchain-qa/battle_bg_hires/<背景名>/(piece_<行><列>.png、mosaic_hi.png)
只喂我们自己的背景图;同一时间只有一个生图在跑(run_codex 里排队)。
"""
import json
import os
import shutil
import sys
import uuid

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BG = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle')
BACKUP = os.path.join(ROOT, '素材原始备份', 'battle-bg-hd-20261111')
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP') or '/tmp', 'lootchain-qa'), 'battle_bg_hires')
NAMES = ['battle_scene_daily_arcane', 'battle_scene_daily_awaken', 'battle_scene_daily_abyss', 'battle_scene_guard_mine',
         'battle_scene_raid_mine', 'battle_scene_field_forest', 'battle_scene_field_wasteland']
SW, SH = 1672, 941          # 源图
CW, CH = 836, 471           # 样片取块(2 倍)
TW, TH = 1672, 941          # 生图出图尺寸
F = 1.6                     # 整张重绘的放大倍数
PW, PH = 1045, 588          # 整张重绘每块的源图尺寸(× F ≈ TW × TH)
COLS = [0, SW - PW]
ROWS = [0, SH - PH]
HW, HH = round(SW * F), round(SH * F)
FINAL = (2508, 1412)        # 入库尺寸(源图 1.5 倍)
MASK = (1254, 706)          # 近景遮罩(半分辨率)
SIGMA = 12.0
FEATHER = 4
RETRIES = 2

PROMPT = (
    'Generate ONE new image with your image generation tool. Image 1 is a soft, low-resolution enlargement of part of a background '
    'plate from our own game (a battle arena backdrop, painted stylised realism). Re-render it as a crisp, high-fidelity version of '
    'EXACTLY the same picture: identical framing; every wall, pillar, arch, step, ledge, floor slab, crack, brazier, banner, rock, tree and '
    'shadow stays in exactly the same place with the same shape, size, colour and lighting. Do not add, remove, move or redesign anything.\n'
    'Only raise the fidelity: clean sharp edges; material detail at a finer scale - thin crisp stone joints, fine cracks, subtle chisel '
    'marks, carved trim with clean bevels, metal with small clean highlights; smooth soft gradients in the lighting and in the haze. '
    'Large calm surfaces (the floor, the ground, the mist, the sky) stay calm and smooth - no added texture noise there. No blur, no smeared '
    'paint strokes, no noise, no film grain, no speckle, no dithering, no depth of field, no vignette, no glow bloom.\n'
    'Keep the look, palette and mood of image 1 exactly. EMPTY background plate: no characters, no creatures, no UI, no text. '
    'Landscape 16:9, 1672x941.'
)
KNOWN_NOTE = (
    ' Note: a strip along the LEFT edge and/or the TOP edge of image 1 is already rendered in the final crisp quality (you can see it is '
    'sharper than the rest). Reproduce those strips unchanged, and render everything else to exactly the same level of detail, '
    'continuing their stone joints, cracks and edges seamlessly across the boundary.'
)


def label(im, text):
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(r'C:\Windows\Fonts\NotoSansSC-VF.ttf', 24)
    d.rectangle([0, 0, d.textlength(text, font=font) + 24, 40], fill=(0, 0, 0))
    d.text((12, 5), text, fill=(240, 236, 228), font=font)
    return im


def merge_low(hi, base):
    """低频换回原图:out = hi − blur(hi) + blur(base)。色调 / 明暗跟原图走,只留重绘的细节。"""
    import numpy as np
    a = np.asarray(hi.convert('RGB')).astype(np.float32)
    b = np.asarray(base.convert('RGB')).astype(np.float32)
    la = np.asarray(hi.convert('RGB').filter(ImageFilter.GaussianBlur(SIGMA))).astype(np.float32)
    lb = np.asarray(base.convert('RGB').filter(ImageFilter.GaussianBlur(SIGMA))).astype(np.float32)
    return Image.fromarray(np.clip(a - la + lb, 0, 255).astype(np.uint8), 'RGB')


def cmd_sample(name, cx, cy):
    import battle_bg_layer_gen as B
    os.makedirs(OUT, exist_ok=True)
    src = Image.open(os.path.join(BG, name + '.png')).convert('RGB')
    x0 = max(0, min(src.width - CW, round(cx - CW / 2)))
    y0 = max(0, min(src.height - CH, round(cy - CH / 2)))
    piece = src.crop((x0, y0, x0 + CW, y0 + CH))
    piece.save(os.path.join(OUT, f'{name}_src.png'))
    guide = os.path.join(OUT, f'{name}_guide.png')
    piece.resize((TW, TH), Image.LANCZOS).save(guide)
    dst = os.path.join(OUT, f'{name}_hi_raw.png')
    if B.run_codex([guide], PROMPT, dst, f'bg_hires_{name}'):
        raw = Image.open(dst).convert('RGB').resize((TW, TH), Image.LANCZOS)
        merge_low(raw, Image.open(guide).convert('RGB')).save(os.path.join(OUT, f'{name}_hi.png'))
        print('ok', os.path.join(OUT, f'{name}_hi.png'), flush=True)


def cmd_compare(name):
    src = Image.open(os.path.join(OUT, f'{name}_src.png')).convert('RGB')
    hi = Image.open(os.path.join(OUT, f'{name}_hi.png')).convert('RGB')
    for k, tag in ((1.435, '手机 2400×1080'), (1.148, '电脑 1080p')):
        w, h = round(src.width * k), round(src.height * k)
        old = src.resize((w, h), Image.BILINEAR)   # 游戏里就是双线性放大
        new = hi.resize((w, h), Image.LANCZOS)
        cw, ch = min(820, w), min(560, h)
        x0, y0 = (w - cw) // 2, (h - ch) // 2
        sheet = Image.new('RGB', (cw * 2 + 10, ch), (0, 0, 0))
        sheet.paste(label(old.crop((x0, y0, x0 + cw, y0 + ch)), f'现在({tag} 屏上实际大小)'), (0, 0))
        sheet.paste(label(new.crop((x0, y0, x0 + cw, y0 + ch)), f'高清重绘({tag} 屏上实际大小)'), (cw + 10, 0))
        dst = os.path.join(OUT, f"{name}_compare_{'phone' if k > 1.3 else 'pc'}.jpg")
        sheet.save(dst, quality=93)
        print(dst, sheet.size)


def seam_path(cost):
    """cost[行, 列]:找一条自上而下、每行一个列号、相邻行最多偏一列的最小代价路径。"""
    import numpy as np
    h, w = cost.shape
    acc = cost.astype(np.float64).copy()
    for y in range(1, h):
        prev = acc[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        acc[y] += np.minimum(prev, np.minimum(left, right))
    path = np.zeros(h, np.int32)
    path[-1] = int(acc[-1].argmin())
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(acc[y, lo:hi].argmin())
    return path


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
        path = a + seam_path(diff[:, a:b])
        use_old |= xs < path[:, None]
    if ow_y > 24 and known[:8, :].mean() > 0.9:
        a, b = 8, ow_y - 8
        path = a + seam_path(diff[a:b, :].T)
        use_old |= ys < path[None, :]
    use_old &= known
    weight = ndimage.gaussian_filter(use_old.astype(np.float32), FEATHER)
    weight[~known] = 0
    return weight


def source_image(name):
    """源图:优先用备份里的原 PNG(入库后 assets 里已经是高清 JPG,不能拿它当源)。"""
    for p in (os.path.join(BACKUP, name + '.png'), os.path.join(BG, name + '.png')):
        if os.path.exists(p):
            return Image.open(p).convert('RGB')
    raise FileNotFoundError(name)


def cmd_all_one(name, redo):
    import numpy as np
    from scipy import ndimage
    import battle_bg_layer_gen as B
    out = os.path.join(OUT, name)
    os.makedirs(out, exist_ok=True)
    src = source_image(name)
    assert src.size == (SW, SH), (name, src.size)
    hi = np.zeros((HH, HW, 3), np.uint8)
    filled = np.zeros((HH, HW), bool)
    for r, y0 in enumerate(ROWS):
        for c, x0 in enumerate(COLS):
            tag = '%d%d' % (r, c)
            piece = os.path.join(out, 'piece_%s.png' % tag)
            hx, hy = min(HW - TW, round(x0 * F)), min(HH - TH, round(y0 * F))
            up_img = src.crop((x0, y0, x0 + PW, y0 + PH)).resize((TW, TH), Image.LANCZOS)
            up = np.asarray(up_img, np.float32)
            known = filled[hy:hy + TH, hx:hx + TW].copy()
            old = hi[hy:hy + TH, hx:hx + TW].astype(np.float32)
            if (r, c) in redo and os.path.exists(piece):
                os.remove(piece)
            if not os.path.exists(piece):
                guide = up.copy()
                guide[known] = old[known]
                gpath = os.path.join(out, '_guide_%s.png' % tag)
                Image.fromarray(np.clip(guide, 0, 255).astype(np.uint8)).save(gpath)
                best = None
                for attempt in range(RETRIES + 1):
                    tmp = os.path.join(out, '_try_%s_%d.png' % (tag, attempt))
                    if not B.run_codex([gpath], PROMPT + (KNOWN_NOTE if known.any() else ''), tmp, 'bg_hires_%s_%s#%d' % (name.replace('battle_scene_', ''), tag, attempt)):
                        continue
                    res = Image.open(tmp).convert('RGB').resize((TW, TH), Image.LANCZOS)
                    sh = block_shifts(np.asarray(up_img.convert('L'), np.float32), np.asarray(res.convert('L'), np.float32))
                    med = float(np.abs(np.median(sh, 0)).max()) if len(sh) else 99.0
                    p90 = float(np.percentile(np.abs(sh).max(1), 90)) if len(sh) else 99.0
                    print('   %s piece %s try %d: blocks %d shift median %.1f p90 %.1f' % (name, tag, attempt, len(sh), med, p90), flush=True)
                    if best is None or (med, p90) < best[0]:
                        best = ((med, p90), tmp)
                    if med <= 1.0 and p90 <= 3.0:
                        break
                if best is None:
                    print('STOP: %s piece %s 生图失败,稍后重跑本命令续上' % (name, tag), flush=True)
                    return False
                if best[0][0] > 1.0 or best[0][1] > 3.0:
                    print('   WARN %s piece %s 对位偏差较大 %s(仍采用,拼好后重点看这一块)' % (name, tag, best[0]), flush=True)
                os.replace(best[1], piece)
                for f in os.listdir(out):
                    if f.startswith('_try_%s_' % tag) or f == '_guide_%s.png' % tag:
                        os.remove(os.path.join(out, f))
            new = np.asarray(Image.open(piece).convert('RGB').resize((TW, TH), Image.LANCZOS), np.float32)
            low_new = np.stack([ndimage.gaussian_filter(new[..., k], SIGMA) for k in range(3)], -1)
            low_up = np.stack([ndimage.gaussian_filter(up[..., k], SIGMA) for k in range(3)], -1)
            new = np.clip(new - low_new + low_up, 0, 255)
            if known.any():
                ow_x = TW - (hx - min(HW - TW, round(COLS[c - 1] * F))) if c > 0 else 0
                ow_y = TH - (hy - min(HH - TH, round(ROWS[r - 1] * F))) if r > 0 else 0
                weight = seam_weight(old, new, known, ow_x, ow_y)[..., None]
                new = old * weight + new * (1 - weight)
            hi[hy:hy + TH, hx:hx + TW] = np.clip(new, 0, 255).astype(np.uint8)
            filled[hy:hy + TH, hx:hx + TW] = True
            print('placed', name, tag, flush=True)
    assert filled.all(), '还有没覆盖到的像素'
    Image.fromarray(hi).save(os.path.join(out, 'mosaic_hi.png'))
    print('wrote', os.path.join(out, 'mosaic_hi.png'), (HW, HH), flush=True)
    return True


def cmd_status():
    for name in NAMES:
        out = os.path.join(OUT, name)
        done = [(r, c) for r in range(2) for c in range(2) if os.path.exists(os.path.join(out, 'piece_%d%d.png' % (r, c)))]
        print('%-34s pieces %d / 4  mosaic %s' % (name, len(done), os.path.exists(os.path.join(out, 'mosaic_hi.png'))))


def cmd_sheet(name):
    """整张新旧对比:三处局部,按手机屏上实际大小(源图 ×1.435)并排。"""
    src = source_image(name)
    hi = Image.open(os.path.join(OUT, name, 'mosaic_hi.png')).convert('RGB')
    k = 1.435
    w, h = round(SW * k), round(SH * k)
    old = src.resize((w, h), Image.BILINEAR)
    new = hi.resize((w, h), Image.LANCZOS)
    cw, ch = 760, 430
    spots = [(0.24, 0.3), (0.66, 0.36), (0.45, 0.72)]
    sheet = Image.new('RGB', (cw * 2 + 10, (ch + 8) * len(spots)), (0, 0, 0))
    for i, (fx, fy) in enumerate(spots):
        x0 = max(0, min(w - cw, round(w * fx - cw / 2)))
        y0 = max(0, min(h - ch, round(h * fy - ch / 2)))
        sheet.paste(label(old.crop((x0, y0, x0 + cw, y0 + ch)), '现在' if i == 0 else ''), (0, i * (ch + 8)))
        sheet.paste(label(new.crop((x0, y0, x0 + cw, y0 + ch)), '高清重绘' if i == 0 else ''), (cw + 10, i * (ch + 8)))
    dst = os.path.join(OUT, f'{name}_sheet.jpg')
    sheet.save(dst, quality=92)
    full = os.path.join(OUT, f'{name}_full_preview.jpg')
    hi.resize((1672, 941), Image.LANCZOS).save(full, quality=90)
    print(dst, full)


def write_jpg_meta(jpg, old_png_meta, keep_uuid):
    """照旧 PNG 的 meta 写 JPG 的 meta(sprite-frame、不裁边、同一套安卓压缩预设);keep_uuid=False 时换新 uuid。"""
    text = open(old_png_meta, encoding='utf-8').read()
    old_uuid = json.loads(text)['uuid']
    if not keep_uuid:
        target = jpg + '.meta'
        # 已经装过就沿用上次的 uuid(重复入库不换号)
        new_uuid = json.load(open(target, encoding='utf-8'))['uuid'] if os.path.exists(target) else str(uuid.uuid4())
        text = text.replace(old_uuid, new_uuid)
    meta = json.loads(text)
    w, h = Image.open(jpg).size
    name = os.path.splitext(os.path.basename(jpg))[0]
    meta['files'] = ['.jpg', '.json']
    meta['userData']['hasAlpha'] = False
    for sub in meta['subMetas'].values():
        sub['displayName'] = name
        if sub.get('importer') == 'sprite-frame':
            sf = sub['userData']
            sf['trimType'] = 'none'
            for key, v in (('width', w), ('height', h), ('rawWidth', w), ('rawHeight', h), ('trimX', 0), ('trimY', 0), ('offsetX', 0), ('offsetY', 0)):
                sf[key] = v
            if 'vertices' in sf:
                hw, hh = w / 2, h / 2
                sf['vertices']['rawPosition'] = [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0]
                sf['vertices']['minPos'] = [-hw, -hh, 0]
                sf['vertices']['maxPos'] = [hw, hh, 0]
                sf['vertices']['uv'] = [0, h, w, h, 0, 0, w, 0]
    open(jpg + '.meta', 'w', encoding='utf-8', newline=chr(10)).write(json.dumps(meta, ensure_ascii=False, indent=2) + chr(10))


def cmd_install(names):
    """<名>.jpg(2508×1412,质量 92、色度不抽样)+ <名>_mask.jpg(近景遮罩 = 旧 _near.png 的透明度,半分辨率)。
    旧的 <名>.png / <名>_near.png 连 meta 先拷进备份目录,再从 assets 里拿走(整图 JPG 沿用旧整图的 uuid)。"""
    os.makedirs(BACKUP, exist_ok=True)
    for name in names:
        mosaic = os.path.join(OUT, name, 'mosaic_hi.png')
        if not os.path.exists(mosaic):
            print('skip(还没拼好)', name)
            continue
        png, near = os.path.join(BG, name + '.png'), os.path.join(BG, name + '_near.png')
        for p in (png, near):
            for q in (p, p + '.meta'):
                if os.path.exists(q) and not os.path.exists(os.path.join(BACKUP, os.path.basename(q))):
                    shutil.copy2(q, os.path.join(BACKUP, os.path.basename(q)))
        near_src = os.path.join(BACKUP, name + '_near.png')
        if not os.path.exists(near_src) or not os.path.exists(os.path.join(BACKUP, name + '.png.meta')):
            print('skip(备份里没有旧图 / meta)', name)
            continue
        jpg, mask = os.path.join(BG, name + '.jpg'), os.path.join(BG, name + '_mask.jpg')
        Image.open(mosaic).convert('RGB').resize(FINAL, Image.LANCZOS).save(jpg, quality=92, subsampling=0, optimize=True)
        Image.open(near_src).convert('RGBA').getchannel('A').resize(MASK, Image.LANCZOS).save(mask, quality=90, optimize=True)
        write_jpg_meta(jpg, os.path.join(BACKUP, name + '.png.meta'), True)
        write_jpg_meta(mask, os.path.join(BACKUP, name + '_near.png.meta'), False)
        for p in (png, near):
            for q in (p, p + '.meta'):
                if os.path.exists(q):
                    os.remove(q)
        print('installed', name, os.path.getsize(jpg) // 1024, 'KB +', os.path.getsize(mask) // 1024, 'KB', flush=True)
    print('接着:curl localhost:7456/asset-db/refresh 让 Creator 重新导入。', flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    if cmd == 'sample':
        cmd_sample(args[0], float(args[1]) if len(args) > 2 else 760, float(args[2]) if len(args) > 2 else 430)
    elif cmd == 'compare':
        cmd_compare(args[0])
    elif cmd == 'all':
        redo = {}
        for a in sys.argv[2:]:
            if a.startswith('--redo='):
                n, rc = a.split('=', 1)[1].split(':')
                rr, cc = rc.split(',')
                redo.setdefault(n, set()).add((int(rr), int(cc)))
        for n in (args or NAMES):
            if not cmd_all_one(n, redo.get(n, set())):
                break
    elif cmd == 'status':
        cmd_status()
    elif cmd == 'sheet':
        cmd_sheet(args[0])
    elif cmd == 'install':
        cmd_install(args or NAMES)
    else:
        print(__doc__)
