# -*- coding: utf-8 -*-
"""一批 AI 图转 3D 的角色进引擎之后,把截图拼成带标注的图(给用户看的交付物,不进 git)。

输入是 show_shots.py 出的图(都在同一个目录里):
  look … --hero=0 --knights=0 --cams=lineup,lineupFront,battle,<名字>@body,<名字>@face|side --tag=<tag>   → look_<tag>_<机位>.jpg
  clips … --cam=<名字>@body|side --tag=<名字>_                                                         → clip_<名字>_<动作>_<秒>.jpg

用法:python batch_report.py <截图目录> <设定图单视图目录> <输出目录> --tag=c2 --batch=第一批
      --chars="wukong:孙悟空:biped,nyx:妮克丝:biped,wolf:荒原狼:beast,spider:林地毒蛛:beast"
      [--stats="wukong=5.8 万面 · 65 骨;…"] [--note=…]
      [--main=lineup] [--subs=heroesFront,battle] [--sublabels="三个英雄的正面,实际战斗的俯视机位"] [--title=…] [--name=阵容]
  --main / --subs  合影用哪几个机位(主图一张大的,下面最多两张小的);--name 是输出文件名里的那一段
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = r'C:\Windows\Fonts\msyh.ttc'
FONT_B = r'C:\Windows\Fonts\msyhbd.ttc'
BG = (16, 16, 20)
CLIP_CN = {'idle': '待机', 'walk': '行走', 'run': '奔跑', 'slash': '挥砍', 'shoot': '射击', 'hurt': '受击(预设)', 'fall': '倒地'}


def opt(name, default=''):
    return next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{name}=')), default)


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold and os.path.exists(FONT_B) else FONT, size)


def tag(draw, xy, text, size=26, bold=True, fill=(255, 255, 255), box=(0, 0, 0, 170), pad=8):
    f = font(size, bold)
    l, t, r, b = draw.textbbox(xy, text, font=f)
    draw.rectangle((l - pad, t - pad, r + pad, b + pad), fill=box)
    draw.text(xy, text, font=f, fill=fill)


def fit(im, w, h):
    k = max(w / im.size[0], h / im.size[1])
    im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    x, y = (im.size[0] - w) // 2, (im.size[1] - h) // 2
    return im.crop((x, y, x + w, y + h))


def contain(im, w, h, bg):
    """等比缩放后整张放进 w×h(不裁),空出来的地方填底色。"""
    k = min(w / im.size[0], h / im.size[1])
    im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
    out = Image.new('RGB', (w, h), bg)
    out.paste(im, ((w - im.size[0]) // 2, (h - im.size[1]) // 2))
    return out


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    src, views, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    t = opt('tag', 'c2')
    batch = opt('batch', '第一批')
    chars = [c.split(':') for c in opt('chars').split(',') if c]      # [键, 中文名, biped|beast]
    stats = dict(x.split('=', 1) for x in opt('stats').split(';') if '=' in x)
    look = lambda cam: Image.open(os.path.join(src, f'look_{t}_{cam}.jpg')).convert('RGB')

    # ── 阵容 ──
    W = 1920
    a = fit(look(opt('main', 'lineup')), W, 1080)
    parts = [a]
    subs = [c for c in opt('subs', 'heroesFront,battle').split(',') if c]
    sublabels = opt('sublabels', '三个英雄的正面,实际战斗的俯视机位(人物在画面里就这么大)').split(',')
    for cam in subs[:2]:
        if os.path.exists(os.path.join(src, f'look_{t}_{cam}.jpg')):
            parts.append(fit(look(cam), 956, 538))
    sheet = Image.new('RGB', (W, 70 + 1080 + (8 + 538 if len(parts) > 1 else 0)), BG)
    sheet.paste(a, (0, 70))
    for i, im in enumerate(parts[1:]):
        sheet.paste(im, (i * 964, 70 + 1080 + 8))
    d = ImageDraw.Draw(sheet, 'RGBA')
    d.text((24, 16), opt('title', f'{batch}:全部是 AI 图转 3D 的角色,放在同一个引擎场景里(' + '、'.join(c[1] for c in chars) + ')'), font=font(28, True), fill=(240, 240, 240))
    for i in range(len(parts) - 1):
        if i < len(sublabels) and sublabels[i]:
            tag(d, (i * 964 + 20, 70 + 1080 + 8 + 14), sublabels[i], 22)
    p = os.path.join(out, f"AI图转3D_{batch}_{opt('name', '阵容')}.jpg")
    sheet.save(p, quality=92)
    print('ok', p, sheet.size)

    # ── 每个角色:设定图 → 引擎里全身 → 特写 ──
    rh, cw = 560, [330, 760, 760]
    sheet = Image.new('RGB', (150 + sum(cw) + 16 * 3, 70 + (rh + 14) * len(chars)), BG)
    d = ImageDraw.Draw(sheet, 'RGBA')
    d.text((24, 16), f'{batch}:左边是设定图(只用文字生成),右边两张是转成 3D、绑好骨骼后在引擎里的样子', font=font(26, True), fill=(240, 240, 240))
    for r, (key, cn, kind) in enumerate(chars):
        y = 70 + r * (rh + 14)
        d.text((16, y + rh // 2 - 40), cn, font=font(30, True), fill=(235, 235, 235))
        if key in stats:
            for k, line in enumerate(stats[key].split('·')):
                d.text((16, y + rh // 2 + 6 + k * 26), line.strip(), font=font(18), fill=(165, 165, 175))
        front = Image.open(os.path.join(views, f'{cn}_front.png')).convert('RGB')
        sheet.paste(contain(front, cw[0], rh, front.getpixel((2, 2))), (150, y))
        body = look(f'{key}-body')
        bw, bh = body.size
        sheet.paste(fit(body.crop((int(bw * 0.14), 0, int(bw * 0.86), bh)), cw[1], rh), (150 + cw[0] + 16, y))
        second = 'face' if kind == 'biped' else 'side'
        det = look(f'{key}-{second}')
        dw, dh = det.size
        det = det.crop((int(dw * 0.22), 0, int(dw * 0.94), dh)) if kind == 'biped' else det.crop((int(dw * 0.1), int(dh * 0.08), int(dw * 0.9), dh))
        sheet.paste(fit(det, cw[2], rh), (150 + cw[0] + cw[1] + 32, y))
        tag(d, (150 + cw[0] + cw[1] + 32 + 12, y + 10), '脸部特写' if kind == 'biped' else '侧面', 20)
    p = os.path.join(out, f"AI图转3D_{batch}_{opt('name', '阵容')}_设定图到引擎.jpg")
    sheet.save(p, quality=92)
    print('ok', p, sheet.size)

    # ── 动作定格:人形每个动作 2 帧,怪物的行走 4 帧 ──
    cell_w, cell_h, left, top = 300, 360, 150, 70
    rows = []
    for key, cn, kind in chars:
        if kind == 'biped':
            cells = [(c, tm) for c in ('idle', 'walk', 'run', 'slash', 'shoot', 'fall') for tm in ('1.1', '1.8')]
        else:
            cells = [('walk', tm) for tm in ('0.3', '0.9', '1.5', '2.1')]
        cells = [(c, tm) for c, tm in cells if os.path.exists(os.path.join(src, f'clip_{key}_{c}_{float(tm):.1f}.jpg'))]
        if cells:
            rows.append((key, cn, kind, cells))
    if rows:
        cols = max(len(r[3]) * (1 if r[2] == 'biped' else 2) for r in rows)
        sheet = Image.new('RGB', (left + cell_w * cols, top + cell_h * len(rows) + 56), BG)
        d = ImageDraw.Draw(sheet, 'RGBA')
        d.text((24, 16), f'{batch}:平台自动绑骨 + 预设动作,在引擎里播放的定格', font=font(26, True), fill=(240, 240, 240))
        for r, (key, cn, kind, cells) in enumerate(rows):
            y = top + r * cell_h
            d.text((14, y + cell_h // 2 - 20), cn, font=font(26, True), fill=(235, 235, 235))
            for k, (c, tm) in enumerate(cells):
                im = Image.open(os.path.join(src, f'clip_{key}_{c}_{float(tm):.1f}.jpg')).convert('RGB')
                w, h = im.size
                cw2 = cell_w if kind == 'biped' else cell_w * 2          # 怪物是横着的,一格占两格宽
                im = im.crop((int(w * 0.27), 0, int(w * 0.73), h)) if kind == 'biped' else im.crop((int(w * 0.1), int(h * 0.14), int(w * 0.9), h))
                sheet.paste(fit(im, cw2, cell_h), (left + k * cw2, y))
                tag(d, (left + k * cw2 + 8, y + 6), f'{CLIP_CN.get(c, c)} {tm} 秒', 17, False, pad=4)
        d.text((24, top + cell_h * len(rows) + 14), opt('note', ''), font=font(20), fill=(225, 205, 150))
        p = os.path.join(out, f"AI图转3D_{batch}_{opt('name', '阵容')}_动作定格.jpg")
        sheet.save(p, quality=90)
        print('ok', p, sheet.size)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
