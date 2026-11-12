# -*- coding: utf-8 -*-
"""把「AI 图转 3D 的角色进引擎」的截图拼成三张带标注的对比图(给用户看的交付物,不进 git)。

输入是 show_shots.py 出的图:
  look <目录> --knights=0 --char=idle --cams=pair,pairFace,aiBody,aiFace,aiBack --tag=<tag>   → look_<tag>_<机位>.jpg
  clips <目录> --clips=idle,walk,slash,hurt,fall --times=0.4,1.1,1.8,2.5                      → clip_<动作>_<秒>.jpg

用法:python char_report.py <截图目录> <输出目录> --tag=b1 --front=<设定图正面.png> --preview=<平台预览图> [--name=术士]
      [--stats="5.8 万面 · 65 根骨骼 · 5 个动作"] [--note01=…]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = r'C:\Windows\Fonts\msyh.ttc'
FONT_B = r'C:\Windows\Fonts\msyhbd.ttc'
BG = (16, 16, 20)
CLIP_CN = {'idle': '待机', 'walk': '行走', 'run': '跑', 'slash': '挥砍', 'shoot': '射击', 'hurt': '受击(预设)', 'fall': '倒地'}


def opt(name, default=''):
    return next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{name}=')), default)


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold and os.path.exists(FONT_B) else FONT, size)


def tag(draw, xy, text, size=30, bold=True, fill=(255, 255, 255), box=(0, 0, 0, 170), pad=10):
    f = font(size, bold)
    x, y = xy
    l, t, r, b = draw.textbbox((x, y), text, font=f)
    draw.rectangle((l - pad, t - pad, r + pad, b + pad), fill=box)
    draw.text((x, y), text, font=f, fill=fill)


def fit(im, w, h):
    """等比缩放后居中裁到 w×h。"""
    k = max(w / im.size[0], h / im.size[1])
    im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    x, y = (im.size[0] - w) // 2, (im.size[1] - h) // 2
    return im.crop((x, y, x + w, y + h))


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    t = opt('tag', 'b1')
    name = opt('name', '术士')
    stats = opt('stats', '')
    look = lambda cam: Image.open(os.path.join(src, f'look_{t}_{cam}.jpg')).convert('RGB')

    # ── 01 同场景对比:上面全身并排,下面两张脸 + AI 角色的脸部特写 ──
    W = 1920
    pair = fit(look('pair'), W, 1080)
    face2 = fit(look('pairFace'), 960, 540)
    ai_face = look('aiFace')
    ai_face = fit(ai_face.crop((int(ai_face.size[0] * 0.42), 0, ai_face.size[0], int(ai_face.size[1] * 0.92))), 960, 540)
    sheet = Image.new('RGB', (W, 70 + 1080 + 8 + 540), BG)
    sheet.paste(pair, (0, 70))
    sheet.paste(face2, (0, 70 + 1080 + 8))
    sheet.paste(ai_face, (960, 70 + 1080 + 8))
    d = ImageDraw.Draw(sheet, 'RGBA')
    d.text((24, 16), f'同一个引擎(Cocos)、同一个场景、同一套灯光:AI 图转 3D 的{name}(左)和代码生成的{name}(右)', font=font(30, True), fill=(240, 240, 240))
    tag(d, (480, 104), 'AI 图转 3D', 30)
    if stats:
        tag(d, (480, 160), stats, 22, False)
    tag(d, (1170, 104), '代码生成(上一轮精细化之后)', 30)
    tag(d, (24, 70 + 1080 + 8 + 16), '两张脸并排', 24)
    tag(d, (960 + 24, 70 + 1080 + 8 + 16), 'AI 图转 3D · 脸部特写', 24)
    if opt('note01'):
        tag(d, (24, 70 + 1080 - 60), opt('note01'), 22, False)
    p = os.path.join(out, f'AI图转3D_01_{name}_同场景对比.jpg')
    sheet.save(p, quality=92)
    print('ok', p, sheet.size)

    # ── 02 动作定格 ──
    clips = [c for c in opt('clips', 'idle,walk,slash,hurt,fall').split(',') if c]
    times = [x for x in opt('times', '0.4,1.1,1.8,2.5').split(',') if x]
    cw, ch, left, top = 360, 432, 190, 70
    sheet = Image.new('RGB', (left + cw * len(times), top + ch * len(clips) + 70), BG)
    d = ImageDraw.Draw(sheet, 'RGBA')
    d.text((24, 16), f'AI 图转 3D 的{name}:平台自动绑骨 + 预设动作,在引擎里播放的定格(每行一个动作,从左到右是时间)', font=font(26, True), fill=(240, 240, 240))
    for r, c in enumerate(clips):
        d.text((20, top + r * ch + ch // 2 - 34), CLIP_CN.get(c, c), font=font(30, True), fill=(235, 235, 235))
        d.text((20, top + r * ch + ch // 2 + 8), c, font=font(20), fill=(150, 150, 160))
        for k, tm in enumerate(times):
            im = Image.open(os.path.join(src, f'clip_{c}_{float(tm):.1f}.jpg')).convert('RGB')
            w, h = im.size
            cell = fit(im.crop((int(w * 0.30), int(h * 0.02), int(w * 0.78), h)), cw, ch)
            sheet.paste(cell, (left + k * cw, top + r * ch))
            tag(d, (left + k * cw + 10, top + r * ch + 8), f'{tm} 秒', 18, False, pad=5)
    d.text((24, top + ch * len(clips) + 16), opt('note02', ''), font=font(22), fill=(225, 205, 150))
    p = os.path.join(out, f'AI图转3D_02_{name}_动作定格.jpg')
    sheet.save(p, quality=90)
    print('ok', p, sheet.size)

    # ── 03 从设定图到引擎 ──
    if opt('front') and opt('preview'):
        H = 900
        a = Image.open(opt('front')).convert('RGB')
        a = a.resize((round(a.size[0] * H / a.size[1]), H), Image.LANCZOS)
        b = Image.open(opt('preview')).convert('RGB')
        b = b.resize((H, H), Image.LANCZOS)
        c = look('aiBody')
        c = fit(c.crop((int(c.size[0] * 0.30), 0, int(c.size[0] * 0.80), c.size[1])), round(H * 0.86), H)
        gap = 70
        sheet = Image.new('RGB', (a.size[0] + b.size[0] + c.size[0] + gap * 2 + 48, H + 176), BG)
        d = ImageDraw.Draw(sheet, 'RGBA')
        d.text((24, 16), f'{name}:从一张设定图到引擎里能动的 3D 角色', font=font(30, True), fill=(240, 240, 240))
        x = 24
        for im, cap in ((a, opt('cap1', '① 设定图(只用文字描述生成,原创设计)')), (b, opt('cap2', '② 多视图转 3D(平台给的预览)')), (c, opt('cap3', '③ 绑骨 + 动作后进引擎(和场景同一套灯光)'))):
            sheet.paste(im, (x, 70))
            d.text((x, 70 + H + 14), cap, font=font(24, True), fill=(235, 235, 235))
            if im is not c:
                d.text((x + im.size[0] + 14, 70 + H // 2 - 30), '→', font=font(48, True), fill=(200, 200, 210))
            x += im.size[0] + gap
        d.text((24, 70 + H + 56), opt('note03', ''), font=font(22), fill=(225, 205, 150))
        p = os.path.join(out, f'AI图转3D_03_{name}_从设定图到引擎.jpg')
        sheet.save(p, quality=92)
        print('ok', p, sheet.size)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
