# -*- coding: utf-8 -*-
"""女主脖子 / 立领对位(11-03 用户「头悬浮在衣领口上面」「脖子没有在领口里」):
GPT 画的头贴图 face01 / face02 自带一整条长脖子,马甲 body01 / body02 立领里面是实心深棕。
脖子跟着头骨骼转,头一仰一转,脖子就离开领口(大招 / 胜利动作最明显)。
正规做法:脖子画在身体上(立领里面填皮肤色的脖子,带领子内阴影),头只留下巴下一小截脖子根盖在上面,头画在上衣前面。
- 立领内区域 = 从领口内一点出发、只走「深色 + 不透明」像素的洪水填充,限制在领子包围盒内;
  填充 = 脖子肤色(从头贴图脖子采样)× 竖向渐暗 + 原阴影 SHADOW 比例;最外 2px 当领子内边,再暗一点。
- 头贴图 FACE_CUT 行以下渐隐成透明(留下巴下约 6px 脖子根)。
用法:python tools/qa/protag_collar_cut.py <输入 png> <输出 png> [atlas](默认仓库里的 protag_f.atlas)
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ATLAS = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero', 'protag_f', 'protag_f.atlas')
SHADOW = float(os.environ.get('COLLAR_SHADOW', '0.35'))
# 正向贴图像素:种子点 + 允许漫延的包围盒 (x0, y0, x1, y1);亮度阈值以下才算领子里面
CUTS = {
    'body01': {'seed': (100, 140), 'box': (68, 104, 142, 178), 'lum': 80},
    'body02': {'seed': (114, 135), 'box': (72, 98, 162, 172), 'lum': 80},
}
# 头贴图(正向):这一行以下的脖子渐隐掉(下巴约在 95~100 行)
FACE_CUT = {'face01': int(os.environ.get('FACE_CUT', '106')), 'face02': int(os.environ.get('FACE_CUT', '106'))}
FACE_FEATHER = 8
# 肤色采样(face01 正向贴图脖子中段)
SKIN_SAMPLE = ('face01', (46, 100, 62, 112))


def regions(atlas_path):
    lines = open(atlas_path, encoding='utf-8').read().splitlines()
    out, cur = {}, None
    for l in lines[5:]:
        if not l.startswith(' '):
            cur = l.strip()
            out[cur] = {}
        else:
            k, v = l.strip().split(':', 1)
            out[cur][k] = v.strip()
    return out


def flood(dark, seed, box):
    x0, y0, x1, y1 = box
    h, w = dark.shape
    seen = np.zeros_like(dark)
    q = deque([seed])
    seen[seed[1], seed[0]] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if x0 <= nx < x1 and y0 <= ny < y1 and 0 <= nx < w and 0 <= ny < h and dark[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))
    return seen


def upright(im, reg, name):
    r = reg[name]
    x, y = map(int, r['xy'].split(','))
    w, h = map(int, r['size'].split(','))
    rot = r['rotate'] == 'true'
    crop = im.crop((x, y, x + (h if rot else w), y + (w if rot else h)))
    return (crop.rotate(-90, expand=True) if rot else crop), (x, y, rot)


def put_back(im, fixed, place):
    x, y, rot = place
    im.paste(fixed.rotate(90, expand=True) if rot else fixed, (x, y))


def main():
    src, dst = sys.argv[1], sys.argv[2]
    atlas = sys.argv[3] if len(sys.argv) > 3 else ATLAS
    reg = regions(atlas)
    im = Image.open(src).convert('RGBA')
    # 肤色
    face, _ = upright(im, reg, SKIN_SAMPLE[0])
    sx0, sy0, sx1, sy1 = SKIN_SAMPLE[1]
    skin = np.asarray(face).astype(np.float32)[sy0:sy1, sx0:sx1, :3].reshape(-1, 3).mean(0)
    print('skin', skin.round(1))
    # 立领里面填脖子
    for name, cut in CUTS.items():
        up, place = upright(im, reg, name)
        arr = np.asarray(up).astype(np.float32)
        lum = arr[..., :3].mean(axis=2)
        dark = (lum < cut['lum']) & (arr[..., 3] > 40)
        inner = flood(dark, cut['seed'], cut['box'])
        if inner.sum() < 50:
            raise SystemExit(f'{name}: 领口内区域太小({int(inner.sum())}),种子 / 阈值不对')
        core = inner.copy()
        for _ in range(2):
            e = core.copy()
            e[1:] &= core[:-1]
            e[:-1] &= core[1:]
            e[:, 1:] &= core[:, :-1]
            e[:, :-1] &= core[:, 1:]
            core = e
        rim = inner & ~core
        ys, xs = np.where(inner)
        y0, y1 = ys.min(), ys.max()
        # 竖向渐暗:领口上沿亮(0.95),领子深处暗(0.6);再叠原阴影
        for mask, extra in ((core, 1.0), (rim, 0.75)):
            yy, xx = np.where(mask)
            t = (yy - y0) / max(1, y1 - y0)
            shade = (0.95 - 0.35 * t) * extra
            base = skin[None, :] * shade[:, None]
            orig = arr[yy, xx, :3]
            arr[yy, xx, :3] = base * (1 - SHADOW) + orig * SHADOW
            arr[yy, xx, 3] = 255
        put_back(im, Image.fromarray(arr.round().astype(np.uint8), 'RGBA'), place)
        print(name, 'neck px', int(inner.sum()))
    # 头贴图剪短脖子
    for name, row in FACE_CUT.items():
        up, place = upright(im, reg, name)
        arr = np.asarray(up).astype(np.float32)
        yy = np.arange(arr.shape[0])[:, None]
        keep = np.clip((row + FACE_FEATHER - yy) / FACE_FEATHER, 0, 1)
        arr[..., 3] *= keep
        put_back(im, Image.fromarray(arr.round().astype(np.uint8), 'RGBA'), place)
        print(name, 'neck cut below row', row)
    im.save(dst, optimize=True)


if __name__ == '__main__':
    main()
