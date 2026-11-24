# -*- coding: utf-8 -*-
"""主城 / 荒原 / 枯木林 NPC 立绘重新抠图(2026-11-24,策划通玩 P1「主城 12 张 NPC 立绘抠穿」)。

问题:11-08 入库时用 tree_hq_install 的 'magenta' 判据((R+B)/2 - G > 15 一律算背景),
红围巾 / 偏粉的皮肤高光 / 白胡子边缘都满足 → 被抠成洞,游戏里对话大立绘上显示成黑斑(葛兰、酒馆老板最重)。

做法(传统抠图,不生图;原图 = 素材原始备份/city4-20261108/npc_*.png 的品红底 Codex 原图):
1. 背景判据改成 m = min(R, B) - G(纯品红底 ≈ 228;红围巾 ≈ -10、皮肤 ≈ -20、紫衣 ≈ 40、粉花 ≈ 80);
2. 只把「和画布边缘连通、m > 120」的区域算背景;画面内部封闭的小块只有平均 m > 190(真品红,例如手杖和身体之间的空隙)才算背景
   —— 人物身上再红再粉也不会被吃掉;
3. 边缘 2.5 像素内按品红反解 alpha(I = a·F + (1-a)·K,F 取内部颜色向外扩散的值)并还原边缘真实颜色,去掉粉紫溢色;
4. 按非透明包围盒裁紧(左右上留 4 像素,底边 = 站地线),预乘透明 Lanczos 缩到 768 高(同 city4_install 口径);
5. 先把当前入库的旧图备份到 素材原始备份/city4-npc-recut-20261124/installed_before/,meta 原地只改尺寸(uuid 不变)。

用法:python tools/qa/city_npc_recut.py [名字 ...] [--preview <目录>]
     名字不带 = 全部 13 张;--preview 输出前后对比图(深色对话框底 + 白底各一张)
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from world_tex_fit import fix_meta, resize_premul  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, '素材原始备份', 'city4-20261108')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
BACKUP = os.path.join(ROOT, '素材原始备份', 'city4-npc-recut-20261124', 'installed_before')
NAMES = ['bard', 'captain', 'child', 'flower_girl', 'guard', 'guildmaster', 'innkeeper', 'merchant',
         'old_man', 'scholar', 'vendor', 'wanderer', 'warden']
TARGET_H = 768
EDGE_T = 120      # 连通背景:m 超过这个就算(半透明边缘带由第 3 步反解)
ISLAND_T = 190    # 画面内部封闭小块:平均 m 超过这个才算背景(真品红空隙)
BAND = 2.5        # 边缘反解带宽(像素)
SPILL_T = 20      # 去溢色:m 超过这个算可能混了品红
GEN_T = 60        # 第二级去溢色门槛(明显偏品红才按中性色反解)
SPILL_NEAR = 40   # 去溢色只看离背景这么近的像素(发丝区;原图 1536 高,发卷能伸出 30 多像素)
SPILL_RESID = 40  # 像素离「干净前景色 → 品红」连线的距离上限(超过 = 本身就是偏粉的颜色,不动)


def key_out(rgb):
    a = rgb.astype(np.float32)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    h, w = m.shape
    # 背景色 K:画布四边像素的中位数
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    K = np.median(border, axis=0)
    cand = m > EDGE_T
    lab, n = ndimage.label(cand, structure=np.ones((3, 3)))
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge_labels))
    if n > 0:
        idx = np.arange(1, n + 1)
        means = ndimage.mean(m, lab, idx)
        sizes = ndimage.sum(np.ones_like(m), lab, idx)
        islands = [int(i) for i, mean, size in zip(idx, means, sizes) if int(i) not in edge_labels and mean > ISLAND_T and size >= 12]
        if islands:
            bg |= np.isin(lab, islands)
    fg = ~bg
    # 去掉背景里孤立的前景噪点(< 40 像素)
    flab, fn = ndimage.label(fg, structure=np.ones((3, 3)))
    if fn > 1:
        sizes = ndimage.sum(np.ones_like(m), flab, np.arange(1, fn + 1))
        keep = np.zeros(fn + 1, bool)
        keep[1:] = sizes >= 40
        fg = keep[flab]
    dist = ndimage.distance_transform_edt(fg)
    core = dist > BAND
    # 内部颜色向外扩散到边缘带(最近的内部像素的颜色)
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    F = a[iy, ix]
    band = fg & ~core
    # 品红反解 alpha:a = (I-K)·(F-K) / |F-K|²
    d = F - K
    denom = (d * d).sum(-1)
    alpha_band = np.where(denom > 400, ((a - K) * d).sum(-1) / np.maximum(denom, 1e-3), 1.0).clip(0, 1)
    alpha = np.where(core, 1.0, np.where(band, alpha_band, 0.0))
    # 边缘颜色:alpha 够大就用反解出的真实颜色,太小 / 反解不稳就用内部颜色
    al = np.maximum(alpha, 1e-3)[..., None]
    unmixed = ((a - (1 - al) * K) / al).clip(0, 255)
    use_unmix = (alpha > 0.35)[..., None]
    col = np.where(core[..., None], a, np.where(use_unmix, unmixed, F))
    # 去溢色(发丝和品红底混色:离背景 12 像素内、m 偏高、又没被连通背景吃掉):
    # 干净前景色 Fc = 最近的 m ≤ 20 的前景像素;像素颜色落在 Fc → K 连线上(残差小)才按比例反解成半透明并还原颜色,
    # 不在连线上的(粉花 / 紫衣这类本身偏粉的颜色)不动
    spill = fg & (m > SPILL_T) & (dist <= SPILL_NEAR)
    clean = fg & (m <= SPILL_T)
    if spill.any() and clean.any():
        _, (cy, cx) = ndimage.distance_transform_edt(~clean, return_indices=True)
        Fc = a[cy, cx]
        dk = K - Fc
        dk2 = (dk * dk).sum(-1)
        t = (((a - Fc) * dk).sum(-1) / np.maximum(dk2, 1e-3)).clip(0, 1)
        resid = np.sqrt((((a - Fc) - t[..., None] * dk) ** 2).sum(-1))
        apply = spill & (resid < SPILL_RESID) & (dk2 > 900)
        keep = np.maximum(1 - t, 1e-3)[..., None]
        fixed = np.where((1 - t)[..., None] > 0.15, ((a - t[..., None] * K) / keep).clip(0, 255), Fc)
        alpha = np.where(apply, np.minimum(alpha, 1 - t), alpha)
        col = np.where(apply[..., None], fixed, col)
    else:
        apply = np.zeros_like(fg)
    # 第二级:上面连线检验没过、但明显偏品红(m > 60)的发丝(最近的干净色常取到皮肤,连线对不上)——
    # 按「真实颜色接近中性(m ≈ 10)」反解:a = 1 - (m - 10) / (mK - 10),C = (I - (1-a)·K) / a。
    # 灰白发丝正好符合;粉花(m ≈ 30)、紫色薰衣草(m ≈ 40~60)达不到门槛不受影响;纯品红空隙 a ≈ 0 直接透明
    mK = float(min(K[0], K[2]) - K[1])
    # 画面内部离边缘远、但近乎纯品红(m > 150,正常颜色到不了)的小空隙(花篮缝里)也一并处理
    gen = fg & ~apply & (((m > GEN_T) & (dist <= SPILL_NEAR)) | (m > 150))
    if gen.any():
        ag = (1 - (m - 10) / max(mK - 10, 1)).clip(0, 1)
        keep = np.maximum(ag, 1e-3)[..., None]
        fixed = ((a - (1 - ag)[..., None] * K) / keep).clip(0, 255)
        alpha = np.where(gen, np.minimum(alpha, ag), alpha)
        col = np.where(gen[..., None], fixed, col)
    out = np.concatenate([col, (alpha * 255)[..., None]], -1)
    return Image.fromarray((out + 0.5).clip(0, 255).astype(np.uint8), 'RGBA')


def crop_tight(rgba):
    al = np.asarray(rgba.getchannel('A'))
    bb = Image.fromarray(((al > 24) * 255).astype(np.uint8)).getbbox()
    pad = 4
    bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(rgba.width, bb[2] + pad), min(rgba.height, bb[3] + 1))
    return rgba.crop(bb)


def recut(name):
    src = os.path.join(SRC, f'npc_{name}.png')
    dst = os.path.join(DST, f'city4_npc_{name}.png')
    os.makedirs(BACKUP, exist_ok=True)
    bak = os.path.join(BACKUP, f'city4_npc_{name}.png')
    if os.path.exists(dst) and not os.path.exists(bak):
        shutil.copy2(dst, bak)
    rgba = crop_tight(key_out(np.asarray(Image.open(src).convert('RGB'))))
    if rgba.height > TARGET_H:
        rgba = resize_premul(rgba, round(rgba.width * TARGET_H / rgba.height), TARGET_H)
    rgba.save(dst, optimize=True)
    fix_meta(dst + '.meta', rgba.width, rgba.height)
    return bak, dst, rgba.size


def sheet(pairs, out_dark, out_white):
    """前后对比:每张 NPC 一列,上旧下新;深色底(对话框 (20,24,33))一张、白底一张(洞最明显)。"""
    th = 420
    cells = []
    for old, new in pairs:
        o = Image.open(old).convert('RGBA')
        n = Image.open(new).convert('RGBA')
        o = o.resize((round(o.width * th / o.height), th), Image.LANCZOS)
        n = n.resize((round(n.width * th / n.height), th), Image.LANCZOS)
        cells.append((o, n))
    cw = max(max(o.width, n.width) for o, n in cells) + 16
    for bgcol, path in (((20, 24, 33, 255), out_dark), ((255, 255, 255, 255), out_white)):
        canvas = Image.new('RGBA', (cw * len(cells), th * 2 + 24), bgcol)
        for i, (o, n) in enumerate(cells):
            canvas.alpha_composite(o, (i * cw + (cw - o.width) // 2, 0))
            canvas.alpha_composite(n, (i * cw + (cw - n.width) // 2, th + 24))
        canvas.convert('RGB').save(path)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    preview = None
    if '--preview' in sys.argv:
        preview = sys.argv[sys.argv.index('--preview') + 1]
        args = [a for a in args if a != preview]
    names = args or NAMES
    pairs = []
    for name in names:
        bak, dst, size = recut(name)
        print('recut', name, size)
        pairs.append((bak, dst))
    if preview:
        os.makedirs(preview, exist_ok=True)
        sheet(pairs, os.path.join(preview, 'npc_recut_dark.png'), os.path.join(preview, 'npc_recut_white.png'))
        print('preview ->', preview)


if __name__ == '__main__':
    main()
