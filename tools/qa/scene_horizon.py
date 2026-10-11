# -*- coding: utf-8 -*-
"""量战场背景图的地平线比例(从图顶算),填进 LobbyGuardBattleRenderer.SCENE_BG_HORIZON。
口径与旧表一致:行间亮度梯度峰值(天空 / 远景 → 地面的明暗交界),限制在 30%~55% 区间内找;打印前三个候选并出一张标线图目视校对。
用法:python scene_horizon.py assets/resources/ui/battle/battle_scene_daily_awaken.png [更多图...]
输出:%TEMP%/lootchain-qa/shots/horizon_<名>.png(红线=首选,黄线=次选)"""
import os, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.environ.get('TEMP', '/tmp'), 'lootchain-qa', 'shots')
os.makedirs(OUT, exist_ok=True)


def measure(path):
    im = Image.open(path).convert('L').resize((512, 288)).filter(ImageFilter.GaussianBlur(2))
    w, h = im.size
    px = im.load()
    rows = [sum(px[x, y] for x in range(w)) / w for y in range(h)]
    # 行间梯度(下一行 − 本行 的绝对值,再平滑)
    grad = [abs(rows[y + 1] - rows[y]) for y in range(h - 1)]
    sm = [sum(grad[max(0, y - 3):y + 4]) / len(grad[max(0, y - 3):y + 4]) for y in range(len(grad))]
    lo, hi = int(h * 0.30), int(h * 0.55)
    cands = sorted(range(lo, hi), key=lambda y: -sm[y])
    picked = []
    for y in cands:
        if all(abs(y - q) > 12 for q in picked):
            picked.append(y)
        if len(picked) == 3:
            break
    ratios = [round(y / h, 3) for y in picked]
    src = Image.open(path).convert('RGB')
    d = ImageDraw.Draw(src)
    for i, r in enumerate(ratios):
        yy = int(src.height * r)
        d.line([(0, yy), (src.width, yy)], fill=(255, 40, 40) if i == 0 else (255, 220, 60), width=6 if i == 0 else 3)
        d.text((20, yy - 40), f'{r:.3f}', fill=(255, 255, 255))
    name = os.path.splitext(os.path.basename(path))[0]
    out = os.path.join(OUT, f'horizon_{name}.png')
    src.resize((1024, int(1024 * src.height / src.width))).save(out)
    return ratios, out


if __name__ == '__main__':
    for p in sys.argv[1:]:
        ratios, out = measure(p)
        print(os.path.basename(p), 'horizon candidates (top→)', ratios, '->', out)
