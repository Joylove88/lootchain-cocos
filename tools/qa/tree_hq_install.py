# -*- coding: utf-8 -*-
"""把 tree_hq_gen.py 生成的高质量树装进游戏(2026-11-08)。

- 品红平底(#FF00FF)自己抠图:按「离品红多远」算透明度,边缘像素按 I = a·F + (1-a)·K 反解前景色去品红溢色,
  外缘只留 1~2 像素抗锯齿(模型自带的透明底是一圈羽化糊边,用户嫌糊的主因之一);
- 按非透明包围盒裁紧(树根贴底边:道具按底边站地、按宽度缩放);
- 按游戏里最大显示宽(world_tex_fit.needs)预乘透明 Lanczos 缩小,不缩到需要以下;
- 没开 groundShadows 的地图(晨风村)道具自带接地暗斑:按树根质心垫柔边椭圆(--no-shadow 关);
- 原图备份到 素材原始备份/tree-hq-20261108/,meta 尺寸同步。

用法:python tools/qa/tree_hq_install.py <候选 png> <目标资源,如 ui/world/vil3/vil3_tree_oak> [--key cyan] [--no-shadow] [--preview 输出.png]
     (开了 groundShadows 的地图(林地)用 --no-shadow,渲染层自己画投影 / 接地暗斑)
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from world_tex_fit import RES, ROOT, fix_meta, needs, resize_premul  # noqa: E402

BACKUP = os.path.join(ROOT, '素材原始备份', 'tree-hq-20261108')
def key_out(im, key='magenta'):
    """硬遮罩 + 收边 + 边缘带回填内部颜色。
    实测按「品红度」算半透明 + 反解前景色不行:叶子本身蓝通道低,叶色混了品红的边缘像素((R+B)/2 只比 G 高一点)
    被当成不透明,外圈一圈粉紫。改为:(R+B)/2 - G > 15 一律算背景(树皮 / 叶子都远低于这个值),前景收 1 像素,
    离背景 3 像素内的边缘带颜色用内部像素向外扩散回填,最后 alpha 轻微模糊做抗锯齿。"""
    from PIL import ImageFilter
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    # 背景色差:品红底 = (R+B)/2 - G;青色底(秋叶树:橙红叶子在品红判据下会被当成背景) = (G+B)/2 - R
    if key == 'cyan':
        e = (a[..., 1] + a[..., 2]) / 2 - a[..., 0]
    else:
        e = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
    fg = Image.fromarray(((e < 15) * 255).astype(np.uint8))
    fg = fg.filter(ImageFilter.MinFilter(3))           # 收 1 像素
    fg = fg.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))  # 去针孔
    core = np.asarray(fg.filter(ImageFilter.MinFilter(5))) > 0   # 离背景 ≥ 3 像素的内部,颜色可信
    rgb = a.copy()
    known = core.copy()
    # 向外逐圈扩散:未知像素取 3×3 邻域里已知像素的均值
    for _ in range(6):
        k = known.astype(np.float32)
        s = np.zeros_like(rgb)
        c = np.zeros_like(k)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                s += np.roll(np.roll(rgb * k[..., None], dy, 0), dx, 1)
                c += np.roll(np.roll(k, dy, 0), dx, 1)
        grow = (~known) & (c > 0)
        rgb[grow] = s[grow] / c[grow][:, None]
        known |= grow
    # 边缘带:原色与回填色按「品红度」混(越像品红越用回填色),保住叶边本身的明暗
    band = (~core)
    w = np.clip((e + 40) / 55, 0, 1)[..., None]
    out_rgb = np.where(band[..., None], a * (1 - w) + rgb * w, a)
    alpha = np.asarray(fg.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)
    out = np.concatenate([np.clip(out_rgb, 0, 255), alpha[..., None]], -1)
    return Image.fromarray((out + 0.5).astype(np.uint8), 'RGBA')


def prepare(src, key='magenta'):
    im = Image.open(src)
    if im.mode == 'RGBA' and np.asarray(im.getchannel('A')).min() < 250:
        rgba = im  # 自带透明底(第一轮候选)
    else:
        rgba = key_out(im, key)
    al = np.asarray(rgba.getchannel('A'))
    # 去掉孤立噪点:包围盒按 alpha > 24 算
    bb = Image.fromarray(((al > 24) * 255).astype(np.uint8)).getbbox()
    pad = 4
    bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(rgba.width, bb[2] + pad), min(rgba.height, bb[3] + 1))
    return rgba.crop(bb)


def add_contact_shadow(rgba):
    """晨风村等没开 groundShadows 的地图,道具自带接地暗斑(旧 vil3 素材都烘在图里);新树没有就像飘着。
    以树根底部 15% 行的不透明质心为中心画一个柔边椭圆,垫在树下,画布底边多留几像素给阴影。"""
    from PIL import ImageDraw, ImageFilter
    w, h = rgba.size
    al = np.asarray(rgba.getchannel('A')).astype(np.float32)
    rows = al[int(h * 0.85):]
    xs = np.arange(w)
    cx = float((rows.sum(0) * xs).sum() / max(1.0, rows.sum()))
    extra = round(h * 0.04)
    canvas = Image.new('RGBA', (w, h + extra), (0, 0, 0, 0))
    sh = Image.new('L', canvas.size, 0)
    blur = w * 0.022
    rx, ry = w * 0.26, w * 0.055
    cy = h + extra - ry - blur * 2.2  # 椭圆 + 模糊整个落在画布内(否则底边被切成一条直线)
    ImageDraw.Draw(sh).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=165)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    shadow = Image.new('RGBA', canvas.size, (18, 22, 10, 0))
    shadow.putalpha(sh)
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(rgba, (0, 0))
    return canvas


def match_aspect(rgba, old_path):
    """按旧图高宽比补透明边:道具按宽度缩放,新图更瘦高会在游戏里整体变高(实测村松 1.17 → 1.83),
    更矮胖则变矮;补边后游戏里的显示高度 / 遮挡范围与旧图一致。瘦高补左右,矮胖补顶部(底边是站地线不能动)。"""
    ow, oh = Image.open(old_path).size
    old_r = oh / ow
    w, h = rgba.size
    r = h / w
    if r > old_r * 1.06:
        nw = round(h / old_r)
        canvas = Image.new('RGBA', (nw, h), (0, 0, 0, 0))
        canvas.paste(rgba, ((nw - w) // 2, 0))
        return canvas
    if r < old_r / 1.06:
        nh = round(w * old_r)
        canvas = Image.new('RGBA', (w, nh), (0, 0, 0, 0))
        canvas.paste(rgba, (0, nh - h))
        return canvas
    return rgba


def main():
    src, target = sys.argv[1], sys.argv[2].replace('/spriteFrame', '')
    key = sys.argv[sys.argv.index('--key') + 1] if '--key' in sys.argv else 'magenta'
    rgba = prepare(src, key)
    old = os.path.join(BACKUP, target + '.png')
    rgba = match_aspect(rgba, old if os.path.exists(old) else os.path.join(RES, target + '.png'))
    need, _ = needs()
    n = need.get(target)
    if not n:
        raise SystemExit(f'{target} 不在任何地图的道具里')
    w = max(16, round(n))
    if rgba.width > w:
        rgba = resize_premul(rgba, w, round(rgba.height * w / rgba.width))
    if '--no-shadow' not in sys.argv:
        rgba = add_contact_shadow(rgba)
    if '--preview' in sys.argv:
        rgba.save(sys.argv[sys.argv.index('--preview') + 1])
        print('preview', rgba.size)
        return
    path = os.path.join(RES, target + '.png')
    bak = os.path.join(BACKUP, target + '.png')
    os.makedirs(os.path.dirname(bak), exist_ok=True)
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    rgba.save(path, optimize=True)
    fix_meta(path + '.meta', rgba.width, rgba.height)
    print('installed', path, rgba.size, f'(need {n:.0f})')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
