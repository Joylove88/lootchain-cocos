"""公告弹框(11-02 原型 周报截图/2026-11-01_B风格补全/proto/notice_b2.png)素材。
- 横幅:notice_banner_common / notice_banner_update(GPT 出图,用户 11-02 确认)裁成原型横幅比例 910:275、做圆角 → ui/town/terminal/notice_banner_*.png
- 图标:从原型按色差抠白色剪影(运行时染色)→ ui/glass/notice_*.png
用法:python tools/qa/notice_dialog_assets.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402

PROTO_DIR = os.path.join(kit.ROOT, '周报截图', '2026-11-01_B风格补全', 'proto')
# 放终端目录:属于网页开局包(scripts/web-pack-tiers.mjs CORE_PREFIXES 'ui/town/terminal'),公告弹框没有加载门
OUT_NOTICE = os.path.join(kit.ROOT, 'assets', 'resources', 'ui', 'town', 'terminal')


def cut_white(P, cx, cy, half, lo, hi):
    box = P[cy - half:cy + half, cx - half:cx + half]
    bg = np.median(np.concatenate([box[0], box[-1], box[:, 0], box[:, -1]]), axis=0)
    a = np.clip((np.sqrt(((box - bg) ** 2).sum(2)) - lo) / (hi - lo), 0, 1)
    out = np.zeros(box.shape[:2] + (4,), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA').resize((half * 4, half * 4), Image.LANCZOS)


def banners():
    os.makedirs(OUT_NOTICE, exist_ok=True)
    for key in ('common', 'update'):
        im = Image.open(os.path.join(PROTO_DIR, f'notice_banner_{key}.png')).convert('RGB')
        h = round(im.width * 275 / 910)
        top = (im.height - h) // 2
        im = im.crop((0, top, im.width, top + h)).resize((1200, 363), Image.LANCZOS)
        # 圆角直接做进透明通道(原型圆角 10 → 贴图 13),省掉运行时圆角遮罩
        mask = Image.new('L', (1200 * kit.SS, 363 * kit.SS), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1200 * kit.SS - 1, 363 * kit.SS - 1), 13 * kit.SS, fill=255)
        im.putalpha(mask.resize((1200, 363), Image.LANCZOS))
        path = os.path.join(OUT_NOTICE, f'notice_banner_{key}.png')
        im.save(path, optimize=True)
        kit.write_meta(path, im.width, im.height)
        print('wrote', path, im.size)


def tab_gold(name='tab_gold', W=160, H=64, R=12):
    """选中态暗金底(原型 notice_b2「公告」页签逐像素取色):左暗金 (122,100,72) → 右亮金 (205,170,112) 横向渐变 + 下沿略亮,
    浅金细边 (214,182,128)、上沿一道淡高光。11-02 用户:选中态全局统一用它 + 白字。
    tab_gold 160×64 圆角 12(九宫格 18,GLASS_SLICES.tabGold / tabActive);pill_gold 160×56 全圆角(九宫格 28/27,GLASS_SLICES.pillGold)。"""
    SS = kit.SS
    w, h = W * SS, H * SS
    x = np.linspace(0, 1, w)[None, :, None]
    y = np.linspace(0, 1, h)[:, None, None]
    left, right = np.array([122, 100, 72]), np.array([205, 170, 112])
    rgb = left * (1 - x) + right * x
    rgb = rgb * (0.96 + 0.08 * y)  # 下沿略亮(原型 y 138 起比中段亮)
    body = np.dstack([np.clip(rgb, 0, 255), np.full((h, w), 255.0)])
    im = Image.fromarray(body.astype(np.uint8), 'RGBA')
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), R * SS, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    rim = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle((0, 0, w - 1, h - 1), R * SS, outline=(214, 182, 128, 235), width=int(1.6 * SS))
    out.alpha_composite(rim)
    hl = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(hl).rounded_rectangle((2 * SS, 2 * SS, w - 1 - 2 * SS, h - 1 - 2 * SS), (R - 2) * SS, outline=(255, 236, 196, 60), width=SS)
    clip = Image.new('L', (w, h), 0)
    ImageDraw.Draw(clip).rectangle((0, 0, w, h // 3), fill=255)
    out.alpha_composite(Image.composite(hl, Image.new('RGBA', (w, h), (0, 0, 0, 0)), clip))
    kit.save(name, out.resize((W, H), Image.LANCZOS))


def icons():
    P = np.asarray(Image.open(os.path.join(PROTO_DIR, 'notice_b2.png')).convert('RGB')).astype(float)
    # 列表格图标(格子 83 方,图标约 50 方,半径 32 避开格框)
    for name, (x, y) in {'notice_megaphone': (265, 229), 'notice_wrench': (265, 471), 'notice_scroll': (265, 592)}.items():
        kit.save(name, cut_white(P, x, y, 32, 30, 120))
    # 页签「更新」报纸图标
    kit.save('notice_paper', cut_white(P, 715, 113, 20, 30, 120))


if __name__ == '__main__':
    banners()
    icons()
    tab_gold()
    tab_gold('pill_gold', 160, 56, 28)
