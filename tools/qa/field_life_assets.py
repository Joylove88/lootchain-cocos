# -*- coding: utf-8 -*-
"""野外沉浸感第一步的贴图(2026-11-22 用户看完目标画面:「开始做」)。

程序生成(不用生图):
  life_dapple    512² 可平铺:树冠下透下来的光斑(白 = 透光,黑 = 叶影),world-dapple 着色器两层错开飘
  life_smoke     256² 柔边烟团(白,alpha = 浓度)
  life_dust      512×128 风沙带(白,横向拉长的噪声带)
  life_bird      128×64 飞鸟投影(黑,俯视展翅剪影,柔边)
生图(品红底抠图,边缘锐利):
  life_leaf_0..2 林地近景枝叶(两绿一秋)
  life_fly_0..2  蝴蝶(俯视)

  python tools/qa/field_life_assets.py procedural     # 程序贴图入库
  python tools/qa/field_life_assets.py gen            # 生图(枝叶 + 蝴蝶,各一张整版)→ 抠图拆件入库
产物 assets/resources/ui/world/fx/life_*.png(meta 按 leaf_0 的精灵帧模板克隆新 uuid,不裁边)。
"""
import io
import json
import os
import re
import sys
import uuid

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FX = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'fx')
TEMPLATE_META = os.path.join(FX, 'leaf_0.png.meta')
OUT = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'field_life')
RNG = np.random.default_rng(20261122)


def install(name, im):
    """写 PNG + 精灵帧 meta(已有 meta 就只改尺寸,保住 uuid)。"""
    path = os.path.join(FX, name + '.png')
    im.save(path)
    meta = path + '.meta'
    w, h = im.size
    if not os.path.exists(meta):
        raw = io.open(TEMPLATE_META, encoding='utf-8', newline='').read()
        old = json.loads(raw)['uuid']
        raw = raw.replace(old, str(uuid.uuid4()))
        io.open(meta, 'w', encoding='utf-8', newline='').write(raw)
    raw = io.open(meta, encoding='utf-8', newline='').read()
    m = json.loads(raw)
    for sub in m['subMetas'].values():
        if sub.get('importer') == 'sprite-frame':
            u = sub['userData']
            u.update({'trimType': 'none', 'width': w, 'height': h, 'rawWidth': w, 'rawHeight': h, 'trimX': 0, 'trimY': 0,
                      'offsetX': 0, 'offsetY': 0})
            v = u.get('vertices')
            if v:
                v['rawPosition'] = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0]
                v['uv'] = [0, h, w, h, 0, 0, w, 0]
                v['minPos'] = [-w / 2, -h / 2, 0]
                v['maxPos'] = [w / 2, h / 2, 0]
    nl = '\r\n' if '\r\n' in raw else '\n'
    io.open(meta, 'w', encoding='utf-8', newline='').write(json.dumps(m, ensure_ascii=False, indent=2).replace('\n', nl) + nl)
    print('installed', name, im.size)


def periodic_noise(n, f_lo, f_hi, seed):
    """可平铺带通噪声(频域随机相位 → 反变换),归一到 0..1。"""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(n)[None, :] * n
    r = np.hypot(fx, fy)
    band = np.exp(-((np.log(np.maximum(r, 1e-3)) - np.log((f_lo * f_hi) ** 0.5)) / np.log(f_hi / f_lo) * 2) ** 2)
    band[0, 0] = 0
    spec = band * np.exp(2j * np.pi * rng.random((n, n)))
    a = np.real(np.fft.ifft2(spec))
    return (a - a.min()) / (a.max() - a.min())


def make_dapple():
    n = 512
    leaf = periodic_noise(n, 10, 26, 1)      # 叶隙尺度
    clump = periodic_noise(n, 2.5, 6, 2)     # 树冠疏密
    fine = periodic_noise(n, 30, 70, 3)      # 叶边碎
    v = leaf * 0.62 + clump * 0.28 + fine * 0.10
    thr = np.quantile(v, 0.66)               # 约三成透光
    light = np.clip((v - thr) / 0.045, 0, 1)
    light = light * light * (3 - 2 * light)
    img = Image.fromarray((light * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    # 平铺接缝:高斯模糊在边上按镜像处理会断,先三倍平铺模糊再切中间
    big = Image.new('L', (n * 3, n * 3))
    base = Image.fromarray((light * 255).astype(np.uint8))
    for i in range(3):
        for j in range(3):
            big.paste(base, (i * n, j * n))
    img = big.filter(ImageFilter.GaussianBlur(1.6)).crop((n, n, 2 * n, 2 * n))
    rgba = Image.merge('RGBA', (img, img, img, Image.new('L', (n, n), 255)))
    return rgba


def fbm(h, w, seed, octaves=5, base=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh, gw = base * 2 ** o, base * 2 ** o * max(1, w // h)
        g = rng.random((gh + 1, gw + 1)).astype(np.float32)
        layer = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        out += layer * amp
        tot += amp
        amp *= 0.5
    return out / tot


def make_smoke():
    n = 256
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.hypot(xx - n / 2, yy - n / 2) / (n / 2)
    blob = np.clip(1 - d, 0, 1) ** 1.6
    noise = fbm(n, n, 7, 5, 3)
    a = np.clip(blob * (0.55 + 0.9 * (noise - 0.5)) * 1.25, 0, 1)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)))
    white = Image.new('L', (n, n), 255)
    return Image.merge('RGBA', (white, white, white, Image.fromarray(a)))


def make_dust():
    w, h = 512, 128
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # 横向两头渐隐、竖向高斯截面,再乘拉长的噪声(风吹出来的一缕一缕)
    prof = np.exp(-((yy - h / 2) / (h * 0.22)) ** 2) * np.clip(np.sin(np.pi * xx / w), 0, 1) ** 0.8
    n1 = fbm(h, w, 11, 5, 2)
    streak = np.asarray(Image.fromarray((n1 * 255).astype(np.uint8)).resize((w, h // 6)).resize((w, h), Image.BICUBIC), np.float32) / 255
    a = np.clip(prof * (0.25 + 1.2 * np.clip(streak - 0.35, 0, 1)), 0, 1)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)))
    white = Image.new('L', (w, h), 255)
    return Image.merge('RGBA', (white, white, white, Image.fromarray(a)))


def make_bird():
    """俯视展翅的鸟剪影(画大再缩 + 柔边):身体一条,两翼向后掠的弧形。"""
    W, H = 512, 256
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    cx, cy = W / 2, H * 0.48
    d.ellipse((cx - 22, cy - 70, cx + 22, cy + 80), fill=255)                      # 身体
    d.ellipse((cx - 18, cy - 100, cx + 18, cy - 50), fill=255)                     # 头
    d.polygon([(cx - 14, cy + 70), (cx + 14, cy + 70), (cx + 34, cy + 122), (cx - 34, cy + 122)], fill=255)   # 尾
    for s in (-1, 1):                                                               # 两翼:前缘外凸、后缘锯齿羽
        pts = [(cx + s * 14, cy - 30)]
        for k in range(1, 9):
            t = k / 8
            pts.append((cx + s * (14 + t * 230), cy - 30 - 40 * np.sin(t * np.pi * 0.9) + 50 * t * t))
        for k in range(8, -1, -1):
            t = k / 8
            feather = 10 if k % 2 else 0
            pts.append((cx + s * (14 + t * 220), cy + 26 + 18 * t + feather - 10 * np.sin(t * np.pi)))
        d.polygon(pts, fill=255)
    im = im.filter(ImageFilter.GaussianBlur(6)).resize((128, 64), Image.LANCZOS)
    black = Image.new('L', im.size, 0)
    return Image.merge('RGBA', (black, black, black, im))


def cmd_procedural():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (('life_dapple', make_dapple), ('life_smoke', make_smoke), ('life_dust', make_dust), ('life_bird', make_bird)):
        im = fn()
        im.save(os.path.join(OUT, name + '.png'))
        install(name, im)


LEAF_PROMPT = (
    'Generate ONE new image with your image generation tool: three separate overhanging tree branches with dense leaves, seen from '
    'directly above and very close to the camera (foreground foliage that frames the edge of a top-down game screen). Branch 1: '
    'green oak leaves. Branch 2: green beech leaves, a bit lighter. Branch 3: autumn maple leaves in orange and red. Each branch is '
    'a natural irregular cluster about one third of the image wide, the three clusters clearly separated by empty background. '
    'Realistic painted game art like image 1, sunlight from the upper left, leaves crisp and sharp (no blur, no depth of field). '
    'The background must be one flat pure magenta colour #FF00FF everywhere, no shadows or gradients on the background, nothing '
    'magenta inside the leaves. Landscape 1672x941.'
)
FLY_PROMPT = (
    'Generate ONE new image with your image generation tool: six small butterflies seen from directly above with wings fully open, '
    'arranged in a loose 3 by 2 grid with lots of empty space between them: two orange-and-black ones, two pale yellow-white ones, '
    'two blue ones. Realistic painted game art, crisp clean edges, no blur, no shadows. The background must be one flat pure magenta '
    'colour #FF00FF everywhere, nothing magenta in the butterflies. Landscape 1672x941.'
)


def split_parts(rgba, min_area, max_parts):
    from scipy import ndimage as nd
    a = np.asarray(rgba.getchannel('A')) > 40
    lab, n = nd.label(nd.binary_dilation(a, iterations=6))
    sizes = nd.sum(a, lab, range(1, n + 1))
    order = np.argsort(-sizes)
    parts = []
    for i in order[:max_parts]:
        if sizes[i] < min_area:
            continue
        ys, xs = np.where(lab == i + 1)
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        piece = rgba.crop(box)
        m = Image.fromarray(((lab[box[1]:box[3], box[0]:box[2]] == i + 1) * 255).astype(np.uint8))
        al = Image.fromarray(np.minimum(np.asarray(piece.getchannel('A')), np.asarray(m)))
        piece.putalpha(al)
        parts.append((box, piece))
    parts.sort(key=lambda p: (p[0][1] // 300, p[0][0]))
    return [p for _, p in parts]


def cmd_gen():
    import battle_bg_layer_gen as B
    from tree_hq_install import key_out
    os.makedirs(OUT, exist_ok=True)
    ref = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle', 'battle_scene_field_forest.jpg')
    jobs = [('leaves', LEAF_PROMPT, [ref], 'magenta_strict', 3, 20000, 'life_leaf_', 760),
            ('flies', FLY_PROMPT, [], 'magenta_strict', 6, 800, 'life_fly_', 96)]
    for tag, prompt, inputs, key, nparts, min_area, prefix, max_side in jobs:
        raw = os.path.join(OUT, tag + '.png')
        if not os.path.exists(raw):
            if not B.run_codex(inputs, prompt, raw, f'field life {tag}'):
                continue
        cut = key_out(Image.open(raw).convert('RGB'), key)
        cut.save(os.path.join(OUT, tag + '_cut.png'))
        parts = split_parts(cut, min_area, nparts)
        print(tag, 'parts', len(parts), [p.size for p in parts])
        for i, p in enumerate(parts):
            s = max_side / max(p.size)
            if s < 1:
                p = p.resize((max(1, round(p.width * s)), max(1, round(p.height * s))), Image.LANCZOS)
            p.save(os.path.join(OUT, f'{prefix}{i}.png'))
            if tag == 'flies' and i >= 3:
                continue    # 蝴蝶留三只(每种颜色一只)
            install(f'{prefix}{i}', p)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1]
    if cmd == 'procedural':
        cmd_procedural()
    elif cmd == 'gen':
        cmd_gen()
