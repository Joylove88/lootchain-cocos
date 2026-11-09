# -*- coding: utf-8 -*-
"""主城「远景 + 动态层」原型合成(11-10):在实机截图上叠出效果给用户确认,确认后再进游戏实现。
  wall_road      北墙下大道,原镜头(对照)
  wall_road_ext  同位置,镜头多往北放 EXT 世界单位(city_web.py 打印 k / camY);地图外那截填远景
效果层:北墙外远景(越远越淡暖雾)、地面云影、浮尘光点、屏幕下沿虚化前景树冠。
用法:python tools/qa/city_depth_proto.py <k> <camY>    产物:周报截图/2026-11-10_主城远景原型/
"""
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from battle_bg_layer_gen import ROOT  # noqa: E402

QA = os.path.join(os.environ.get('TEMP', '/tmp'), 'lootchain-qa', 'city_depth')
SHOTS = os.path.join(QA, 'before')
GEN = os.path.join(QA, 'gen')
DST = os.path.join(ROOT, '周报截图', '2026-11-10_主城远景原型')
CITY4 = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
W, H = 1600, 900
MAP_TOP = 3500
CROP = 0.6   # 远景只取上 60%(王宫山丘 + 远山)


def cloud_shadows(img, seed=3, alpha=0.2):
    """大块柔边云影(只压暗,不改色)。"""
    rng = np.random.default_rng(seed)
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for _ in range(5):
        cx, cy = rng.uniform(-100, W + 100), rng.uniform(150, H + 100)
        for _ in range(6):
            rx, ry = rng.uniform(120, 260), rng.uniform(60, 120)
            ox, oy = rng.uniform(-220, 220), rng.uniform(-70, 70)
            d.ellipse((cx + ox - rx, cy + oy - ry, cx + ox + rx, cy + oy + ry), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(70))
    a = np.asarray(m, np.float32)[..., None] / 255 * alpha
    base = np.asarray(img.convert('RGB'), np.float32)
    shade = base * np.array([0.5, 0.53, 0.62])
    return Image.fromarray((base * (1 - a) + shade * a).clip(0, 255).astype(np.uint8))


def motes(img, seed=5, n=26, y_max=0.75):
    rng = np.random.default_rng(seed)
    glow = Image.new('RGB', (W, H), 0)
    d = ImageDraw.Draw(glow)
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(0, H * y_max)
        r = rng.uniform(2, 5)
        c = int(rng.uniform(150, 235))
        d.ellipse((x - r * 3, y - r * 3, x + r * 3, y + r * 3), fill=(c // 3, c // 4, c // 8))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(c, int(c * 0.88), int(c * 0.6)))
    glow = glow.filter(ImageFilter.GaussianBlur(2.2))
    return ImageChops.screen(img.convert('RGB'), glow)


def foreground(img):
    """屏幕下沿左右两角虚化的近景树冠(暗、糊,比地面移得快)。"""
    out = img.convert('RGBA')
    tree = Image.open(os.path.join(CITY4, 'city4_tree_oak.png')).convert('RGBA')
    for (x, y, s, flip) in ((1360, 700, 480, True),):
        t = tree.resize((s, int(s * tree.height / tree.width)), Image.LANCZOS)
        if flip:
            t = t.transpose(Image.FLIP_LEFT_RIGHT)
        rgb = np.asarray(t, np.float32)
        rgb[..., :3] = rgb[..., :3] * np.array([0.42, 0.44, 0.38])
        t = Image.fromarray(rgb.clip(0, 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(9))
        a = np.asarray(t, np.float32)
        a[..., 3] *= 0.8
        out.alpha_composite(Image.fromarray(a.astype(np.uint8), 'RGBA'), (x, y))
    return out.convert('RGB')


def backdrop(ext, k, camY):
    """地图外那截(地图顶以上的纯黑像素,含城垛缝)填远景;只用远景的山丘王宫 + 远山段(近处小屋比例不对,裁掉)。"""
    map_top_y = int(round(H / 2 - (MAP_TOP - camY) * k))
    bd = Image.open(os.path.join(GEN, 'city_backdrop.png')).convert('RGB')
    bd = bd.crop((0, 0, bd.width, int(bd.height * CROP)))
    bh = int(W * bd.height / bd.width)
    bd = bd.resize((W, bh), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H))
    canvas.paste(bd, (0, map_top_y + 50 - bh))
    a = np.asarray(canvas, np.float32)
    haze = np.array([238, 226, 204], np.float32)
    # 整体先压一层暖雾(远景比城里淡),越往上越淡
    far = np.clip((map_top_y + 50 - np.arange(H)) / max(1, bh), 0, 1)[:, None, None]
    amt = 0.28 + 0.3 * far
    lum = a.mean(axis=2, keepdims=True)
    a = a * 0.8 + lum * 0.2
    a = a * (1 - amt) + haze * amt
    canvas = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    e = np.asarray(ext.convert('RGB'), np.int16)
    outside = (e.max(axis=2) < 10)
    outside[map_top_y + 60:] = False
    # 只要跟屏幕顶连通的黑(城垛缝也连得到);界面按钮里的暗色是封闭的,不动
    from scipy import ndimage
    lab, _ = ndimage.label(outside)
    top_ids = np.unique(lab[0][lab[0] > 0])
    sky = np.isin(lab, top_ids)
    m = Image.fromarray((~sky * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(0.8))
    canvas.paste(ext.convert('RGB'), (0, 0), m)
    print('map_top_y', map_top_y, 'backdrop h', bh)
    return canvas


def main(k, camY):
    os.makedirs(os.path.join(DST, 'before'), exist_ok=True)
    os.makedirs(os.path.join(DST, 'after'), exist_ok=True)
    road = Image.open(os.path.join(SHOTS, 'spot_wall_road.jpg')).convert('RGB')
    ext = Image.open(os.path.join(SHOTS, 'spot_wall_road_ext.jpg')).convert('RGB')
    plaza = Image.open(os.path.join(SHOTS, 'spot_plaza.jpg')).convert('RGB')
    road.save(os.path.join(DST, 'before', 'north_wall_road.jpg'), quality=90)
    plaza.save(os.path.join(DST, 'before', 'plaza.jpg'), quality=90)
    a = backdrop(ext, k, camY)
    a = cloud_shadows(a, 3, 0.36)
    a = motes(a, 5)
    a = foreground(a)
    a.save(os.path.join(DST, 'after', 'north_wall_road.jpg'), quality=90)
    p = cloud_shadows(plaza, 7, 0.42)
    p = motes(p, 9, 30, 0.9)
    p = foreground(p)
    p.save(os.path.join(DST, 'after', 'plaza.jpg'), quality=90)
    # 对比图:左现状 右原型
    for n, b, f in (('north_wall_road', road, a), ('plaza', plaza, p)):
        cmp_ = Image.new('RGB', (W * 2 + 20, H), (20, 20, 20))
        cmp_.paste(b, (0, 0))
        cmp_.paste(f, (W + 20, 0))
        cmp_.resize((W + 10, H // 2)).save(os.path.join(DST, f'compare_{n}.jpg'), quality=88)
    print('ok', DST)


if __name__ == '__main__':
    main(float(sys.argv[1]), float(sys.argv[2]))
