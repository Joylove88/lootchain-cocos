# -*- coding: utf-8 -*-
"""主城 v4 手绘重画(2026-11-23,用户看完原型选「A · v4 布局」):
v4 布局的 3D 渲染块(assets/resources/pre25/city/c_<行>_<列>.webp,整图 35976×25560,每块 1024)只当布局底稿,
按守卫战背景的画法逐块重画成白天手绘(复用野外重绘 field_repaint 的接缝参考 / 配准 / 分频拼接),再切块入库。
几何(可走格、高度、NPC、出口)全部沿用 v4(Pre25CityData.ts),所以重画时房子 / 墙 / 桥 / 树的位置和轮廓都不能动。

  python tools/qa/city_v4_paint.py base                        底稿(缩到 SCALE)+ 城墙外填草地、城门外接路 + 要画的块清单
  python tools/qa/city_v4_paint.py sample <c> <r>              画一块
  python tools/qa/city_v4_paint.py area <c0> <r0> <c1> <r1>    画一片(行优先,含两端)
  python tools/qa/city_v4_paint.py all                         画完清单里所有块(断点续跑)
  python tools/qa/city_v4_paint.py worker fwd|rev <起始行>      并行出图:多开几路各从一行起走(按块锁文件防撞车,走完自己那段再接别处)
  python tools/qa/city_v4_paint.py assemble [<c0> <r0> <c1> <r1>]   拼整图 mosaic.png / 拼一片 area_<c0>_<r0>_<c1>_<r1>.png
  python tools/qa/city_v4_paint.py export [<拼图名> ...]        切块入库 pre25/city_paint/ + 鸟瞰图 + Pre25PaintData.ts(缺省拼图名 mosaic)
  python tools/qa/city_v4_paint.py status
产物:%TEMP%/lootchain-qa/city_v4_paint/(base.png、pieces.json、pieces/、mosaic.png)。
"""
import ast
import json
import math
import os
import glob
import subprocess
import sys
import tempfile
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import field_repaint as FR  # noqa: E402  接缝参考 / 配准 / 分缝
import field_tex_regen as FT  # noqa: E402
from field_tex_regen import run_codex  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
ROOT = FR.ROOT
SRC = os.path.join(ROOT, 'assets', 'resources', 'pre25', 'city')
DATA_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'pre25', 'Pre25CityData.ts')
PLAN = os.path.join(ROOT, 'tools', 'proto3d', 'pre25', 'city_plan_v4.py')
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'city_v4_paint')
REF = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle', 'battle_scene_field_forest.jpg')
# 成品精度 = v4 渲染的一半:主城镜头 1.3 时电脑屏上一个成品像素约 1.5 个屏幕像素(野外 1.4)
SCALE = 0.5
PW, PH = FR.PW, FR.PH   # 1672 × 941
OV = FR.OV
WALL_KEEP_M = 5.0       # 城墙外这么多米以内保留渲染底稿(墙脚、角楼);再往外填草地交给生图画成城外田野
WALL_FACE_M = 9.0       # 南 / 西面城墙的外立面在画面上往下伸出约「墙高 × cos 俯角」:这么高的墙按这个往下多留
VIEW_PAD = 720          # 城墙外这么远(成品像素)以内的块要画:人贴墙站时镜头看得到约半屏
MEADOW = (104, 128, 70)
ROAD = (176, 150, 108)
WATER = (78, 118, 124)

PROMPT = (
    "Image 1 is one piece of our game's NEW main city map, a high oblique bird's-eye view rendered from a rough 3D blockout. It is "
    "only a layout guide: its plastic 3D-render look is exactly what we want to get rid of.\n"
    "Image 2 is a battle background from the same game; it has the art quality we want: calm, clean painted realism with large "
    "smooth areas, details concentrated where objects are, one consistent soft light direction with real cast shadows and ambient "
    "occlusion, harmonious natural colours, nothing looks generated.\n"
    "{seam}"
    "Generate ONE new image with your image generation tool: repaint image 1 as a finished hand-painted realistic game map at the art "
    "quality of image 2. Keep exactly the same camera, framing and layout: every building, roof, wall, tower, step, bridge, canal "
    "edge, stall, lamp post, tree and street stays in the same place with the same size and outline, so the walkable areas do not "
    "change. Mood: a bright, peaceful, sunny day in a prosperous medieval river town, fresh and inviting, a place players want to "
    "linger. Lush green lawns and grass verges with natural tonal variation; warm sandy-beige trodden earth streets with a foot-worn "
    "centre and edges softened by grass tufts; canal water clear blue-green-grey with soft sky reflections and a little sparkle, "
    "mossy stone embankments; leafy green trees with natural clustered foliage (blossom trees stay soft white-pink, never neon); "
    "timber-frame and stone houses with slate roofs in varied muted tones; flower boxes, ivy and small shrubs where paving meets "
    "walls. {outside}Soft white sunlight from the upper left, gentle transparent shadows (never black). Colourful but never garish; "
    "natural matte materials with variety: no repeated identical leaves, flower heads or paving stones, no uniform carpet of tiny "
    "debris. Windows dark (daytime), lamps unlit, no light pools.\n"
    "Image 1 is the complete layout guide: do not ask questions or request other files, always generate the image.\n"
    "No characters, no animals, no UI, no text, no frame. Realistic painted game art, not cartoon, not a 3D render, not plastic. "
    "No blur, no noise, no film grain, no glow, no vignette, no depth of field: everything equally sharp. Landscape, exactly 1672x941."
)
# 大半在城墙外的块:底稿那部分只是平涂的布局示意(11-23 第一批 r1 c6~c8 用城里那套提示词,生图说「图 1 是绿色迷宫纹理,
# 看不到城」并要真正的底稿,三次都没出图)
COUNTRY = (
    "Image 1 is one piece of our game's world map just OUTSIDE the main city wall, a high oblique bird's-eye view. Most of it is only "
    "a flat colour guide: flat green = open meadow, the sandy stripe = the dirt road leading away from the city gate, the blue "
    "stripe = the river flowing out of the city. Where the stone city wall, its towers, the gate or anything built appears, that "
    "part is a rough 3D render: keep its exact shape, size and position.\n"
    "Image 2 is a battle background from the same game; it has the art quality we want: calm, clean painted realism with large "
    "smooth areas, details concentrated where objects are, one consistent soft light direction with real cast shadows and ambient "
    "occlusion, harmonious natural colours, nothing looks generated.\n"
    "{seam}"
    "Generate ONE new image with your image generation tool: paint it as finished, calm countryside at the art quality of image 2, "
    "keeping the wall, road and river exactly where image 1 has them. Lush meadow grass with gentle tonal variation and a few "
    "wildflowers; a few shrubs, lone trees and rocks spread sparsely, most of the meadow open and calm; the road as real trodden "
    "earth with grass tufts along its edges; the river clear blue-green-grey with grassy banks; the city wall weathered stone with "
    "moss and shrubs at its foot. A bright sunny day, soft white sunlight from the upper left, gentle transparent shadows. Natural "
    "matte colours, never garish.\n"
    "Image 1 is the complete layout guide: do not ask questions or request other files, always generate the image.\n"
    "No characters, no animals, no UI, no text, no frame. Realistic painted game art, not cartoon, not a 3D render. "
    "No blur, no noise, no film grain, no glow, no vignette, no depth of field: everything equally sharp. Landscape, exactly 1672x941."
)
COUNTRY_FRAC = 0.55   # 块里城外部分超过这个比例用 COUNTRY
SEAM = ("Image 3 shows the already finished neighbouring pieces (sharp areas) placed exactly where they overlap this piece: "
        "continue them seamlessly, matching their colours, lighting and every object that crosses the border.\n")
OUTSIDE = ("The flat green area outside the city wall is open countryside: meadow grass with wildflowers, a few shrubs and lone "
           "trees, the sandy road leading away from the gate and the river flowing out; keep it calm. ")

_BASE = None


def load_data():
    t = open(DATA_TS, encoding='utf-8').read()
    return json.loads(t[t.index('{'):t.rindex('}') + 1])


def _plan_literal(src, head):
    """city_plan_v4.py 里 `head` 后面第一个括号表达式(配对到收尾)按字面量解析。"""
    i = src.index(head) + len(head)
    open_ch = src[i]
    close_ch = {'[': ']', '{': '}', '(': ')'}[open_ch]
    depth = 0
    for j in range(i, len(src)):
        if src[j] == open_ch:
            depth += 1
        elif src[j] == close_ch:
            depth -= 1
            if depth == 0:
                return ast.literal_eval(src[i:j + 1])
    raise ValueError(head)


def plan():
    src = open(PLAN, encoding='utf-8').read()
    return {'wall': _plan_literal(src, '\nWALL = '), 'gates': _plan_literal(src, '\nGATES = '),
            'river': _plan_literal(src, '\nRIVER = catmull('), 'riverW': 11}


def ground_px(D, X, Z):
    """3D 地面点 (X, Z)(米)→ 成品整图像素(同 Pre25City.pre25GroundToPx × SCALE)。"""
    P = math.radians(D['pitch'])
    yaw = math.radians(D.get('yaw', 0))
    hx, hz = math.cos(yaw), math.sin(yaw)
    dx, dz = X - D['c0'][0], Z - D['c0'][2]
    sx = -dx * hz + dz * hx
    sy = (dx * hx + dz * hz) * math.sin(P)
    return (sx - D['plane'][0]) * D['ppm'] * SCALE, (D['plane'][3] - sy) * D['ppm'] * SCALE


def _offset_poly(poly, m):
    """多边形每个点沿离中心的方向外推 m 米(近似外扩,城墙是凸的够用)。"""
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    out = []
    for x, z in poly:
        d = math.hypot(x - cx, z - cz) or 1.0
        out.append((x + (x - cx) / d * m, z + (z - cz) / d * m))
    return out


def grid(size):
    W, H = size
    sx, sy = round(PW * (1 - OV)), round(PH * (1 - OV))
    cols = int(np.ceil((W - PW) / sx)) + 1
    rows = int(np.ceil((H - PH) / sy)) + 1
    return [min(c * sx, W - PW) for c in range(cols)], [min(r * sy, H - PH) for r in range(rows)]


def base_img():
    global _BASE
    if _BASE is None:
        _BASE = Image.open(os.path.join(OUT, 'base.png')).convert('RGB')
        _BASE.load()
    return _BASE


def cmd_base():
    os.makedirs(os.path.join(OUT, 'pieces'), exist_ok=True)
    D = load_data()
    pl = plan()
    W, H = math.ceil(D['px'][0] * SCALE), math.ceil(D['px'][1] * SCALE)
    cs = round(D['chunk'] * SCALE)
    render = Image.new('RGB', (W, H), MEADOW)
    for r, c in D['chunks']:
        im = Image.open(os.path.join(SRC, f'c_{r}_{c}.webp')).convert('RGB')
        render.paste(im.resize((max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))), Image.LANCZOS), (c * cs, r * cs))
    print('render', render.size, flush=True)

    # 保留区 = 城墙外扩 WALL_KEEP_M 的多边形 ∪ 它往画面下方平移「墙高 × cos 俯角」(南 / 西面墙的外立面)
    keep_poly = [ground_px(D, x, z) for x, z in _offset_poly(pl['wall'], WALL_KEEP_M)]
    face = WALL_FACE_M * math.cos(math.radians(D['pitch'])) * D['ppm'] * SCALE
    keep = Image.new('L', (W, H), 0)
    kd = ImageDraw.Draw(keep)
    kd.polygon(keep_poly, fill=255)
    kd.polygon([(x, y + face) for x, y in keep_poly], fill=255)
    for k in range(1, 8):
        kd.polygon([(x, y + face * k / 8) for x, y in keep_poly], fill=255)
    # 往下平移的那条带里多半是 3D 摄影棚的深灰地面(约 62,64,70、很平):认出来去掉,只留墙的外立面
    from scipy import ndimage as nd
    ra = np.asarray(render, dtype=np.int16)
    lum = ra @ np.array([0.299, 0.587, 0.114])
    spread = ra.max(2) - ra.min(2)
    floor = (lum < 84) & (ra[..., 2] >= ra[..., 0]) & (spread < 18)
    floor = nd.binary_closing(nd.binary_opening(floor, iterations=2), iterations=3)
    inner = Image.new('L', (W, H), 0)
    ImageDraw.Draw(inner).polygon([ground_px(D, x, z) for x, z in _offset_poly(pl['wall'], 1.5)], fill=255)
    ka = (np.asarray(keep) > 128) & ~(floor & (np.asarray(inner) == 0))
    keep = Image.fromarray((ka * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))

    # 城外:草地 + 城门外的路 + 流出城的河(给生图当布局提示)
    outside = Image.new('RGB', (W, H), MEADOW)
    od = ImageDraw.Draw(outside)
    ppm = D['ppm'] * SCALE
    cx = sum(p[0] for p in pl['wall']) / len(pl['wall'])
    cz = sum(p[1] for p in pl['wall']) / len(pl['wall'])
    rv = list(pl['river'])
    for a, b, at in ((rv[1], rv[0], 0), (rv[-2], rv[-1], None)):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        ext = (b[0] + (b[0] - a[0]) / d * 50, b[1] + (b[1] - a[1]) / d * 50)
        if at == 0:
            rv.insert(0, ext)
        else:
            rv.append(ext)
    river = [ground_px(D, x, z) for x, z in rv]
    od.line(river, fill=WATER, width=round(pl['riverW'] * ppm * 0.75), joint='curve')
    for gx, gz in pl['gates'].values():
        d = math.hypot(gx - cx, gz - cz)
        far = (gx + (gx - cx) / d * 60, gz + (gz - cz) / d * 60)
        od.line([ground_px(D, gx, gz), ground_px(D, *far)], fill=ROAD, width=round(9 * ppm * 0.75))
    # 草地上叠一层很柔的大色块(太碎的噪点会被生图看成「绿色迷宫纹理」)
    rng = np.random.default_rng(7)
    blot = Image.fromarray(((rng.normal(0, 1, (H // 160 + 2, W // 160 + 2)) * 7 + 128).clip(0, 255)).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    blot = blot.filter(ImageFilter.GaussianBlur(40))
    shift = np.asarray(blot, np.int16)[..., None] - 128
    outside = Image.fromarray(np.clip(np.asarray(outside, np.int16) + shift, 0, 255).astype(np.uint8))
    base = Image.composite(render, outside, keep)
    base.save(os.path.join(OUT, 'base.png'), compress_level=1)
    base.resize((W // 16, H // 16), Image.LANCZOS).save(os.path.join(OUT, 'base_small.jpg'), quality=85)

    # 要画的块:和「城墙外扩 VIEW_PAD」相交的
    view = Image.new('L', (W, H), 0)
    vpoly = [ground_px(D, x, z) for x, z in _offset_poly(pl['wall'], VIEW_PAD / ppm)]
    ImageDraw.Draw(view).polygon(vpoly, fill=255)
    va = np.asarray(view) > 0
    ka = np.asarray(keep) > 128
    xs, ys = grid((W, H))
    sel = []
    for r, y in enumerate(ys):
        for c, x in enumerate(xs):
            if va[y:y + PH, x:x + PW].any():
                out_frac = float((~ka[y:y + PH, x:x + PW]).mean())
                sel.append({'c': c, 'r': r, 'outside': out_frac > 0.04, 'out': round(out_frac, 3)})
    json.dump({'size': [W, H], 'xs': xs, 'ys': ys, 'pieces': sel, 'wall': [ground_px(D, x, z) for x, z in pl['wall']]},
              open(os.path.join(OUT, 'pieces.json'), 'w', encoding='utf-8'))
    print('base', (W, H), 'grid', len(xs), 'x', len(ys), 'pieces', len(sel), flush=True)


def _meta():
    return json.load(open(os.path.join(OUT, 'pieces.json'), encoding='utf-8'))


def piece_path(c, r):
    return os.path.join(OUT, 'pieces', f'piece_{r:02d}_{c:02d}.png')


def seam_guide_all(xs, ys, c, r):
    """八邻里已出好的块和本块重叠的部分贴到本块坐标上(其余透明);和 field_repaint.seam_guide 一样,
    只是右 / 下邻也算(先画了小样那一片,四周的块后画时要接上它)。返回 None = 没有邻块。"""
    x0, y0 = xs[c], ys[r]
    guide = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    found = False
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1):
            cc, rr = c + dc, r + dr
            if (dc, dr) == (0, 0) or cc < 0 or rr < 0 or cc >= len(xs) or rr >= len(ys):
                continue
            p = piece_path(cc, rr)
            if os.path.exists(p):
                try:
                    im = Image.open(p).convert('RGBA')
                except OSError:   # 并行时邻块可能刚好在改名,读不到就当没有
                    continue
                guide.paste(im, (xs[cc] - x0, ys[rr] - y0), im)
                found = True
    return guide if found else None


# 个别块的补充说明(11-24:南门门洞底稿是背光的灰石板路,r15 / r16 c6 两块都画成了从拱洞里流出去的水,
# r16 还是照着 r15 的接缝参考跟着画错 → 两块一起删,先画 r15 再画 r16,并加这句)
_GATE_DRY = ('IMPORTANT: the arched passage through the gatehouse is a DRY stone-paved road - the gray area under the arch is '
             'shaded paving, NOT water. The dirt road runs straight out through the gate. There is no water, river, stream '
             'or moat anywhere under or near this gate.')
PIECE_HINTS = {(6, 15): _GATE_DRY, (6, 16): _GATE_DRY}


def gen_piece(c, r, out_frac, xs, ys, strict=False):
    dst = piece_path(c, r)
    if os.path.exists(dst):
        return dst
    tmp = tempfile.mkdtemp(prefix='lc-cv4-')
    src = os.path.join(tmp, 'src.png')
    base_img().crop((xs[c], ys[r], xs[c] + PW, ys[r] + PH)).save(src)
    ref = os.path.join(tmp, 'ref.jpg')
    Image.open(REF).convert('RGB').resize((PW, PH), Image.LANCZOS).save(ref, quality=92)
    inputs = [src, ref]
    seam = ''
    guide = seam_guide_all(xs, ys, c, r)
    if guide is not None:
        g = Image.open(src).convert('RGBA')
        g = Image.blend(g, Image.new('RGBA', g.size, (0, 0, 0, 255)), 0.55)
        g.alpha_composite(guide)
        gp = os.path.join(tmp, 'guide.png')
        g.convert('RGB').save(gp)
        inputs.append(gp)
        seam = SEAM
    raw = dst.replace('.png', '_raw.png')
    if out_frac > COUNTRY_FRAC:
        prompt = COUNTRY.format(seam=seam)
    else:
        prompt = PROMPT.format(seam=seam, outside=OUTSIDE if out_frac > 0.04 else '')
    if (c, r) in PIECE_HINTS:
        prompt += '\n' + PIECE_HINTS[(c, r)]
    tag = f'city r{r} c{c} out={out_frac:.2f}'
    if not (run_codex_strict(inputs, prompt, raw, tag) if strict else run_codex(inputs, prompt, raw, tag, size=None)):
        return None
    tmp_dst = dst[:-4] + '.part.png'   # 先写临时名再改名:并行时别的路正在读本块当接缝参考,不能读到半截文件
    Image.open(raw).convert('RGB').resize((PW, PH), Image.LANCZOS).save(tmp_dst)
    os.replace(tmp_dst, dst)
    return dst


def run_codex_strict(inputs, prompt, raw, tag):
    """并行出图用(11-23):同 field_tex_regen.run_codex,但①不等别的 Codex 跑完 ②只认 Codex 输出里带本次会话号的出图目录。
    原版「只冒出一个新目录就认它」在多路同时跑时会出错:本路没出图(比如回了一句提问)而别路恰好新建了目录,就会把别人的块当成自己的。"""
    before = set(os.listdir(FT.GEN)) if os.path.isdir(FT.GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-cv4x-')
    cmd = [FT.codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"',
           '--skip-git-repo-check', '-s', 'read-only', '-C', work]
    for i in inputs:
        cmd += ['-i', i]
    cmd.append('-')
    t0 = time.time()
    print('gen', tag, flush=True)
    try:
        r = subprocess.run(cmd, input=prompt.encode('utf-8'), capture_output=True, timeout=1500)
    except subprocess.TimeoutExpired:
        print('FAIL', tag, 'timeout', flush=True)
        return False
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(FT.GEN) if d not in before] if os.path.isdir(FT.GEN) else []
    mine = [d for d in new_dirs if d in text]
    imgs = [q for d in mine for q in glob.glob(os.path.join(FT.GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', tag, r.returncode, ' '.join(text[-400:].split()), flush=True)
        return False
    Image.open(max(imgs, key=os.path.getmtime)).convert('RGB').save(raw)
    print('ok', tag, f'{time.time() - t0:.0f}s', raw, flush=True)
    return True


def run_pieces(sel):
    m = _meta()
    xs, ys = m['xs'], m['ys']
    frac = {(p['c'], p['r']): p.get('out', 0.5 if p['outside'] else 0.0) for p in m['pieces']}
    failed = []
    for c, r in sorted(sel, key=lambda t: (t[1], t[0])):
        for _ in range(3):
            if gen_piece(c, r, frac.get((c, r), 0.0), xs, ys):
                break
        else:
            failed.append((c, r))
    if failed:
        print('FAILED pieces', failed, flush=True)


def run_worker(order, start_r):
    """并行出图的一路(11-23):fwd = 从 start_r 行起行优先往后,rev = 从 start_r 行起倒着往前;走完自己那段再接剩下的。
    每块先抢锁文件 piece_RR_CC.lock(O_EXCL),抢不到 = 别的路在画(锁超过 30 分钟算残留,可以接手)。"""
    m = _meta()
    xs, ys = m['xs'], m['ys']
    frac = {(p['c'], p['r']): p.get('out', 0.5 if p['outside'] else 0.0) for p in m['pieces']}
    keys = sorted(frac, key=lambda t: (t[1], t[0]))
    if order == 'rev':
        keys.reverse()
        head = [k for k in keys if k[1] <= start_r]
    else:
        head = [k for k in keys if k[1] >= start_r]
    keys = head + [k for k in keys if k not in head]
    failed = []
    for c, r in keys:
        dst = piece_path(c, r)
        if os.path.exists(dst):
            continue
        lock = dst[:-4] + '.lock'
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(lock) < 1800:
                    continue
                os.utime(lock)
            except OSError:
                continue
        try:
            for _ in range(3):
                if gen_piece(c, r, frac[(c, r)], xs, ys, strict=True):
                    break
            else:
                failed.append((c, r))
        finally:
            try:
                os.remove(lock)
            except OSError:
                pass
    if failed:
        print('FAILED pieces', failed, flush=True)
    print('worker done', order, start_r, flush=True)


def cmd_assemble(sel, name):
    """同 field_repaint.cmd_assemble(配准 + 色调对齐 70% + 分频接缝),只拼 sel 里的块,画布只开到它们的外接框(uint8 省内存)。"""
    from scipy import ndimage as nd
    m = _meta()
    xs, ys = m['xs'], m['ys']
    base = base_img()
    X0 = min(xs[c] for c, r in sel)
    Y0 = min(ys[r] for c, r in sel)
    X1 = max(xs[c] + PW for c, r in sel)
    Y1 = max(ys[r] + PH for c, r in sel)
    canvas = np.asarray(base.crop((X0, Y0, X1, Y1)), dtype=np.uint8).copy()
    filled = np.zeros(canvas.shape[:2], dtype=bool)
    regs = {}
    for c, r in sorted(sel, key=lambda t: (t[1], t[0])):
        x0, y0 = xs[c] - X0, ys[r] - Y0
        bc = np.asarray(base.crop((xs[c], ys[r], xs[c] + PW, ys[r] + PH)), dtype=np.float32)
        raw = piece_path(c, r).replace('.png', '_raw.png')
        if not os.path.exists(raw):
            continue
        src, reg = FR._register(bc, Image.open(raw))
        regs[f'{c},{r}'] = [float(v) for v in reg]
        old = canvas[y0:y0 + PH, x0:x0 + PW].astype(np.float32)
        f = filled[y0:y0 + PH, x0:x0 + PW]
        if f.any():
            src = src + (old[f].mean(0) - src[f].mean(0)) * 0.7
        w = np.ones((PH, PW), dtype=np.float32)
        wide = np.ones((PH, PW), dtype=np.float32)
        if (c - 1, r) in sel or any(filled[y0:y0 + PH, x0:x0 + 8].ravel()):
            ov = min(PW, xs[c - 1] + PW - xs[c]) if c > 0 else 0
            if ov > 0:
                w[:, :ov] = np.minimum(w[:, :ov], FR._seam_mask(old[:, :ov], src[:, :ov], 1))
                wide[:, :ov] = np.minimum(wide[:, :ov], np.linspace(0, 1, ov, dtype=np.float32)[None, :])
        if r > 0:
            ov = min(PH, ys[r - 1] + PH - ys[r])
            if ov > 0:
                w[:ov, :] = np.minimum(w[:ov, :], FR._seam_mask(old[:ov, :], src[:ov, :], 0))
                wide[:ov, :] = np.minimum(wide[:ov, :], np.linspace(0, 1, ov, dtype=np.float32)[:, None])
        if f.any():
            w = np.where(f, w, 1.0)[..., None]
            wide = np.where(f, wide, 1.0)[..., None]
            old_lf = FR._blur_known(old, f, FR.LF_SIGMA)
            src_lf = nd.gaussian_filter(src, (FR.LF_SIGMA, FR.LF_SIGMA, 0))
            mixed = old_lf * (1 - wide) + src_lf * wide + (old - old_lf) * (1 - w) + (src - src_lf) * w
            out = np.where(f[..., None], mixed, src)
        else:
            out = src
        canvas[y0:y0 + PH, x0:x0 + PW] = np.clip(out, 0, 255).astype(np.uint8)
        filled[y0:y0 + PH, x0:x0 + PW] = True
    img = Image.fromarray(canvas)
    path = os.path.join(OUT, f'{name}.png')
    img.save(path, compress_level=1)
    img.resize((img.width // 4, img.height // 4), Image.LANCZOS).save(path.replace('.png', '_small.jpg'), quality=86)
    json.dump({'origin': [X0, Y0], 'size': [X1 - X0, Y1 - Y0], 'reg': regs}, open(path.replace('.png', '.json'), 'w'))
    print('assembled', name, img.size, 'origin', (X0, Y0), flush=True)


PAINT_DIR = os.path.join(ROOT, 'assets', 'resources', 'pre25', 'city_paint')
PAINT_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'pre25', 'Pre25PaintData.ts')
TILE = 1024   # 游戏图块边长(成品像素)= v4 渲染 2048 像素 = 2 × 2 个遮挡块


def cmd_export(sources):
    """拼好的图(mosaic 或 area_*,各带 .json 记原点)贴回底稿,切成 1024 的 WebP 图块入库 pre25/city_paint/,
    出鸟瞰图(地图页 / 小地图)和 Pre25PaintData.ts。没画到的地方是底稿(3D 渲染缩图)——小样阶段就是这样。"""
    import uuid
    m = _meta()
    W, H = m['size']
    cols, rows = -(-W // TILE), -(-H // TILE)
    canvas = Image.new('RGB', (cols * TILE, rows * TILE), MEADOW)
    canvas.paste(base_img(), (0, 0))
    for name in sources:
        p = os.path.join(OUT, name + '.png')
        j = json.load(open(p.replace('.png', '.json'), encoding='utf-8'))
        canvas.paste(Image.open(p).convert('RGB'), tuple(j['origin']))
    xs, ys = m['xs'], m['ys']
    cover = np.zeros((rows, cols), bool)
    for pc in m['pieces']:
        x0, y0 = xs[pc['c']], ys[pc['r']]
        cover[y0 // TILE:(y0 + PH - 1) // TILE + 1, x0 // TILE:(x0 + PW - 1) // TILE + 1] = True
    os.makedirs(PAINT_DIR, exist_ok=True)
    tiles = []
    for R in range(rows):
        for C in range(cols):
            if cover[R, C]:
                canvas.crop((C * TILE, R * TILE, (C + 1) * TILE, (R + 1) * TILE)).save(
                    os.path.join(PAINT_DIR, f'p_{R}_{C}.webp'), 'WEBP', quality=82, method=6)
                tiles.append([R, C])
    keep = {f'p_{R}_{C}.webp' for R, C in tiles}
    for f in os.listdir(PAINT_DIR):
        if f.startswith('p_') and f.replace('.meta', '') not in keep:
            os.remove(os.path.join(PAINT_DIR, f))
    # 水流遮罩(effects/world-paint-ground 的 flowTex,同野外重绘):R = 水面。来源 = v4 的水面遮罩(water_mask.png,v4 像素 / 10),
    # 缩到「成品像素 / 8」并补成整格(cols × rows 块);往里收一圈 + 柔边,岸石不跟着晃
    wm = Image.open(os.path.join(SRC, 'water_mask.png')).convert('L')
    fw, fh = cols * TILE // 8, rows * TILE // 8
    w2 = wm.resize((round(wm.width * 10 * SCALE / 8), round(wm.height * 10 * SCALE / 8)), Image.BILINEAR)
    w2 = w2.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    flow = Image.new('RGB', (fw, fh), (0, 0, 0))
    flow.paste(Image.merge('RGB', (w2, Image.new('L', w2.size, 0), Image.new('L', w2.size, 0))), (0, 0))
    flow.save(os.path.join(PAINT_DIR, 'flow.png'))
    ov_path = os.path.join(PAINT_DIR, 'overview.jpg')
    # 鸟瞰图(地图页 / 小地图):画过的块以外是底稿的平涂草地,块边是台阶状——游戏镜头拍不到(块都画到城墙外 VIEW_PAD),
    # 地图页整张看会露出来 → 城墙外扩 0.7 × VIEW_PAD 的八边形(一定在画过的范围里)以外柔边压暗成暗角,城像一座被田野围着的岛
    ov = canvas.crop((0, 0, W, H)).resize((2048, round(2048 * H / W)), Image.LANCZOS)
    s = ov.width / W
    D, pl = load_data(), plan()
    ppm = D['ppm'] * SCALE
    vig = Image.new('L', ov.size, 0)
    ImageDraw.Draw(vig).polygon([(x * s, y * s) for x, y in (ground_px(D, X, Z) for X, Z in _offset_poly(pl['wall'], VIEW_PAD * 0.7 / ppm))], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(28))
    far = Image.blend(ov.filter(ImageFilter.GaussianBlur(30)), Image.new('RGB', ov.size, (38, 46, 32)), 0.55)
    Image.composite(ov, far, vig).save(ov_path, quality=86)
    if not os.path.exists(ov_path + '.meta'):
        # 地图页 / 小地图按 spriteFrame 取:照抄 3D 版鸟瞰图的 meta(sprite-frame)换个 uuid
        tpl = open(os.path.join(SRC, 'overview.jpg.meta'), encoding='utf-8').read()
        old = json.loads(tpl)['uuid']
        open(ov_path + '.meta', 'w', encoding='utf-8', newline='\n').write(tpl.replace(old, str(uuid.uuid4())))
    data = {'tile': TILE, 'scale': SCALE, 'grid': [cols, rows], 'tiles': tiles}
    open(PAINT_TS, 'w', encoding='utf-8', newline='\n').write(
        '/**\n * 主城 v4 手绘图块(自动生成:tools/qa/city_v4_paint.py export;别手改)。\n'
        ' * tile = 图块边长(成品像素),scale = 成品像素 / v4 渲染像素;grid = 整图补成整格后的列 / 行数(水流遮罩 flow.png 按它铺);\n'
        ' * tiles = 入库的块 [行, 列](城墙外一圈以外的没画)。\n */\n'
        f'export const PRE25_PAINT: {{ tile: number; scale: number; grid: [number, number]; tiles: Array<[number, number]> }} = {json.dumps(data)};\n')
    total = sum(os.path.getsize(os.path.join(PAINT_DIR, f)) for f in os.listdir(PAINT_DIR) if f.endswith('.webp'))
    print('exported', len(tiles), 'tiles', round(total / 1e6, 1), 'MB ->', PAINT_DIR, flush=True)


def area(args):
    c0, r0, c1, r1 = map(int, args)
    return [(c, r) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]


def cmd_status():
    m = _meta()
    done = sum(os.path.exists(piece_path(p['c'], p['r'])) for p in m['pieces'])
    print(f"{done} / {len(m['pieces'])} 块(网格 {len(m['xs'])} × {len(m['ys'])},成品 {m['size'][0]}×{m['size'][1]})")


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd, rest = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ('status', [])
    if cmd == 'base':
        cmd_base()
    elif cmd == 'sample':
        run_pieces([(int(rest[0]), int(rest[1]))])
    elif cmd == 'area':
        run_pieces(area(rest))
    elif cmd == 'all':
        run_pieces([(p['c'], p['r']) for p in _meta()['pieces']])
    elif cmd == 'worker':
        run_worker(rest[0], int(rest[1]))
    elif cmd == 'assemble':
        if rest:
            cmd_assemble(area(rest), 'area_' + '_'.join(rest))
        else:
            cmd_assemble([(p['c'], p['r']) for p in _meta()['pieces']], 'mosaic')
    elif cmd == 'export':
        cmd_export(rest or ['mosaic'])
    else:
        cmd_status()
