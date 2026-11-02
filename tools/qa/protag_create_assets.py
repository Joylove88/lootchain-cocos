"""docs/60「选择主角」页素材入库(原型 周报截图/2026-11-02_主角/proto/protagonist_create_b.png,用户 11-03 确认)。
- 人物:assets_src 里 GPT 出的透明原图(protag_asset_gen.py)→ 等比缩小 → ui/protagonist/b/
  · protag_m_base / protag_f_base 全身(舞台)、protag_m_bust / protag_f_bust 胸像(性别卡,从全身裁 + 圆角)
  · yedi_m 夜帝全身(舞台残影,运行时压淡)、zero_m 零的魂体、zero_m_round 零的圆头像(对话卡)
  · soul_sea_bg 万界之海背景(jpg)
- 图标:从原型按色差抠白色剪影(运行时染色)→ ui/glass/protag_*.png
ui/protagonist 与 ui/glass 都在网页开局包(scripts/web-pack-tiers.mjs CORE_PREFIXES)。
用法:python tools/qa/protag_create_assets.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402
from notice_dialog_assets import cut_white  # noqa: E402

SRC = os.path.join(kit.ROOT, '周报截图', '2026-11-02_主角', 'assets_src')
PROTO = os.path.join(kit.ROOT, '周报截图', '2026-11-02_主角', 'proto', 'protagonist_create_b.png')
OUT = os.path.join(kit.ROOT, 'assets', 'resources', 'ui', 'protagonist', 'b')

# 原型像素坐标(1870×841)里的图标中心与半径
ICONS = {
    'protag_info_home': (1236, 300, 16),
    'protag_info_class': (1236, 345, 16),
    'protag_info_past': (1236, 390, 16),
    'protag_dice': (1741, 622, 18),
}
# 技能图标:GPT 单独出的高清黑底金色图标(assets_src/skill_*.png)按色差抠白剪影
SKILL_ICONS = {'protag_skill_slash': 'skill_slash', 'protag_skill_seal': 'skill_seal', 'protag_skill_step': 'skill_step'}


def save(im, name, ext='png'):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.{ext}')
    if ext == 'jpg':
        im.convert('RGB').save(path, quality=88, optimize=True)
    else:
        im.save(path, optimize=True)
    kit.write_meta(path, im.width, im.height)
    print('wrote', os.path.relpath(path, kit.ROOT), im.size)


def scaled(name, height):
    im = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGBA')
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def bust(name, out_name):
    """性别卡胸像(原型卡 236×206):按透明通道找头顶与头部中心,头到胸口;下沿 40% 渐隐给「男 / 女」字让位,圆角做进透明通道。"""
    im = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGBA')
    a = np.array(im.getchannel('A')) > 40
    rows = np.where(a.any(1))[0]
    top = rows[0]
    head = a[top:top + int(im.height * 0.08)]
    cx = int(np.where(head.any(0))[0].mean())
    w = int(im.width * 0.62)
    h = round(w * 206 / 236)
    x0 = max(0, min(im.width - w, cx - w // 2))
    y0 = max(0, top - int(h * 0.05))
    W, H = 354, 309
    crop = im.crop((x0, y0, x0 + w, y0 + h)).resize((W, H), Image.LANCZOS)
    mask = Image.new('L', (W * kit.SS, H * kit.SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W * kit.SS - 1, H * kit.SS - 1), 18 * kit.SS, fill=255)
    mask = np.array(mask.resize((W, H), Image.LANCZOS)).astype(np.float32)
    fade = np.clip((np.linspace(1, 0, H) - 0.0) / 0.4, 0, 1)[:, None]
    alpha = np.array(crop.getchannel('A')).astype(np.float32) * (mask / 255) * fade
    crop.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    save(crop, out_name)


def round_portrait(name, out_name, size=256):
    im = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGB')
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size * kit.SS, size * kit.SS), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * kit.SS - 1, size * kit.SS - 1), fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    save(im, out_name)


def icons():
    P = np.array(Image.open(PROTO).convert('RGB')).astype(np.float32)
    for name, (cx, cy, half) in ICONS.items():
        im = cut_white(P, cx, cy, half, 18, 70)
        im = im.resize((half * 4, half * 4), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2))
        kit.save(name, im)
    for name, src in SKILL_ICONS.items():
        path = os.path.join(SRC, f'{src}.png')
        if not os.path.exists(path):
            print('skip (no source)', src)
            continue
        S = np.array(Image.open(path).convert('RGB')).astype(np.float32)
        half = min(S.shape[0], S.shape[1]) // 2
        im = cut_white(S, S.shape[1] // 2, S.shape[0] // 2, half, 24, 110).resize((128, 128), Image.LANCZOS)
        kit.save(name, im)


def main():
    save(scaled('protag_m_base', 1080), 'protag_m_base')
    save(scaled('protag_f_base', 1080), 'protag_f_base')
    save(scaled('yedi_m', 1080), 'yedi_m')
    save(scaled('zero_m', 384), 'zero_m')
    bust('protag_m_base', 'protag_m_bust')
    bust('protag_f_base', 'protag_f_bust')
    round_portrait('zero_m_portrait', 'zero_m_round')
    bg = Image.open(os.path.join(SRC, 'soul_sea_bg.png')).convert('RGB')
    save(bg, 'soul_sea_bg', 'jpg')
    icons()


if __name__ == '__main__':
    main()
