# -*- coding: utf-8 -*-
"""野外真 3D 场景(?field3d=2)的交付图:借常驻预览(field_dev.py start 要先在后台跑着)截一套对比图。

  python tools/proto3d/field/field_sample.py <输出目录> [--only=cmp,fx,props,lineup]

出的图:
  cmp   同一刻对比(定格后只切开关):入口营地、林间怪群旁 —— 左 = 真 3D 场景,右 = 现在线上的 2D
  fx    队长的普攻三段 + 三个技能,各取出手后的两个时刻
  props 摆件的两种做法并排:代码生成的模型(默认) / 手绘图立进 3D(对照),整个场景
  lineup 对照台:同一种摆件,后排手绘立牌、前排代码生成的模型(各摆几个变体),一类一张
"""
import os
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
DEV = os.path.join(HERE, 'field_dev.py')
SNIP = os.path.join(HERE, 'snippets')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0] if ARGS else os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'f3d_sample')
ONLY = [x for x in OPT.get('only', 'cmp,fx,props,lineup').split(',') if x]
RAW = os.path.join(OUT, '原图')
os.makedirs(RAW, exist_ok=True)


def dev(*args):
    r = subprocess.run([sys.executable, DEV] + list(args), capture_output=True, text=True, cwd=ROOT, encoding='utf-8', errors='replace')
    return (r.stdout or '').strip()


def js(body):
    return dev('eval', body)


def shot(name):
    path = os.path.join(RAW, name + '.png')
    dev('shot', path)
    return path


def font(size):
    for name in ('msyhbd.ttc', 'msyh.ttc', 'simhei.ttf'):
        p = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tag(im, text):
    d = ImageDraw.Draw(im, 'RGBA')
    f = font(max(20, im.width // 36))
    w = d.textlength(text, font=f)
    d.rectangle((0, 0, w + 24, f.size + 18), fill=(8, 10, 14, 205))
    d.text((12, 6), text, font=f, fill=(244, 244, 244, 255))
    return im


def sheet(tiles, cols, title, path):
    w, h = tiles[0].size
    gap = 8
    head = 64 if title else 0
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * w + (cols - 1) * gap, head + rows * h + (rows - 1) * gap), (10, 12, 16))
    if title:
        ImageDraw.Draw(out).text((14, 12), title, font=font(32), fill=(244, 244, 244))
    for i, t in enumerate(tiles):
        out.paste(t if t.size == (w, h) else t.resize((w, h), Image.LANCZOS), ((i % cols) * (w + gap), head + (i // cols) * (h + gap)))
    out.save(path, quality=90)
    print(path, out.size, flush=True)


def tp(x, y, wait=3500, followers=True):
    js("window.__tp = [%d, %d]; window.__tpWait = %d; window.__hideFollowers = %s; return 1;" % (x, y, wait, 'false' if followers else 'true'))
    return js('@' + os.path.join(SNIP, 'tp.js'))


FREEZE = "t.hitStopUntil = Date.now() + 3600000; await sleep(250); return 1;"
UNFREEZE = "t.hitStopUntil = 0; return 1;"
# 切开关并等它切完(摆件立牌要几轮才建齐)
OFF = "F.toggle(0); await sleep(900); return JSON.stringify({ on: F.info().on });"
ON = ("F.toggle(2); for (let i = 0; i < 80; i++) { await sleep(150); const u = F.info(); const p = u.extras && u.extras[0] && u.extras[0].props;"
      " if (u.on && u.heroes3d >= 1 && p && p.items >= p.shown - 3 && i > 12) break; } await sleep(600); return JSON.stringify({ on: F.info().on, h3: F.info().heroes3d });")


def compare(name, title, x, y, box=None):
    print('cmp', name, tp(x, y)[-120:], flush=True)
    # 往右走一小段再停:队友跟在后面排开,队长不被挡着
    js("t.hitStopUntil = 0; t.keys.add(cc.KeyCode.KEY_D); await sleep(650); t.keys.delete(cc.KeyCode.KEY_D); await sleep(900); return 1;")
    js(FREEZE)
    a = Image.open(shot(name + '_a_3D')).convert('RGB')
    js(OFF)
    b = Image.open(shot(name + '_b_2D')).convert('RGB')
    print('  back', js(ON), flush=True)
    js(UNFREEZE)
    if box:
        a = a.crop(box)
        b = b.crop(box)
    k = 0.75
    size = (int(a.width * k), int(a.height * k))
    sheet([tag(a.resize(size, Image.LANCZOS), '真 3D 场景:地面受光 + 真投影,角色 / 摆件有前后遮挡'), tag(b.resize(size, Image.LANCZOS), '现在线上的 2D')], 2, title, os.path.join(OUT, name + '.jpg'))


def main():
    print('dev', js("return JSON.stringify({ map: t.def.code, f3d: F.info().mode });"), flush=True)
    if 'cmp' in ONLY:
        compare('01_同一刻对比_入口营地', '野外真 3D 场景 · 入口营地(定格后只切开关)', -7600, -3350)
        compare('02_同一刻对比_林间', '野外真 3D 场景 · 林间(定格后只切开关)', -6620, -1900)
    if 'fx' in ONLY:
        tp(-6620, -1900)
        tiles = []
        plan = [('attack', 300, '普攻'), ('attack', 300, '普攻(下一段)'), (0, 560, '重斩 · 出手'), (0, 700, '重斩 · 余波'), (1, 260, '突进斩'), (2, 760, '旋风斩')]
        for act, wait, label in plan:
            js("window.__act = %s; window.__actWait = %d; return 1;" % ("'attack'" if act == 'attack' else act, wait))
            js('@' + os.path.join(SNIP, 'fight.js'))
            im = Image.open(shot('fx_%s_%d_%d' % (act, wait, len(tiles)))).convert('RGB').crop((460, 150, 1460, 850))
            tiles.append(tag(im.resize((750, 525), Image.LANCZOS), label))
            js(UNFREEZE)
            time.sleep(1.2)
        sheet(tiles, 3, '技能特效(纯代码:条带 / 粒子 / 贴地环 / 点光,没有素材文件)', os.path.join(OUT, '03_技能特效.jpg'))
    if 'props' in ONLY:
        tiles = []
        for name, x, y, box in (('入口营地', -8350, -2900, (0, 0, 1920, 1078)), ('林间', -6620, -1900, (0, 0, 1920, 1078))):
            tp(x, y, followers=False)
            js(FREEZE)
            a = Image.open(shot('props_%s_mesh' % name)).convert('RGB').crop(box)
            js("window.__f3dprops.set({ mesh: false }); await sleep(4000); return 1;")
            b = Image.open(shot('props_%s_card' % name)).convert('RGB').crop(box)
            js("window.__f3dprops.set({ mesh: true }); await sleep(4500); return 1;")
            js(UNFREEZE)
            size = (int(a.width * 0.6), int(a.height * 0.6))
            tiles.append(tag(a.resize(size, Image.LANCZOS), name + ' · 代码生成的模型(第二版,默认)'))
            tiles.append(tag(b.resize(size, Image.LANCZOS), name + ' · 手绘图立进 3D(对照)'))
        sheet(tiles, 2, '摆件的两种做法(同一个 3D 场景、同一套灯)', os.path.join(OUT, '04_摆件两种做法对照.jpg'))
    if 'lineup' in ONLY:
        groups = [
            ('树', ['w3_tree_oak', 'w3_tree_pine', 'w3_tree_autumn'], 1, 640, (-8950, -3250), (-7950, -3190)),
            ('岩石与枯树', ['fld_g_boulders_l', 'fld_rocks', 'w3_rock_small', 'fld_dead_tree'], 1, 560, (-8900, -3250), (-7950, -3200)),
            ('营地', ['w3_camp_crates', 'w3_camp_tent', 'w3_camp_banner'], 1, 560, (-8700, -3300), (-7950, -3250)),
            ('栅栏', ['w3_camp_palisade'], 1, 700, (-8700, -3250), (-7950, -3250)),
            ('灌木蕨草', ['vil3_bush', 'w3_fern', 'vil3_grass_tuft', 'fld_g_grass_s', 'fld_g_grass_l'], 2, 420, (-8500, -3250), (-7950, -3190)),
        ]
        for i, (name, keys, n, gap, at, cam) in enumerate(groups):
            js("window.__lineup = { keys: %s, at: [%d, %d], n: %d, cam: [%d, %d], gap: %d, wait: 3500 }; return 1;" % (repr(keys), at[0], at[1], n, cam[0], cam[1], gap))
            print('lineup', name, js('@' + os.path.join(SNIP, 'lineup.js'))[:200].encode('unicode_escape').decode(), flush=True)
            im = Image.open(shot('lineup_%s' % name)).convert('RGB')
            tag(im, name + ' · 后排 = 手绘图立牌,前排 = 代码生成的模型(同一套灯、同一个镜头)')
            path = os.path.join(OUT, '06_对照台_%d_%s.jpg' % (i + 1, name))
            im.save(path, quality=90)
            print(path, im.size, flush=True)
        js("clearInterval(window.__lcKeepAlive); [t.leader, ...t.followers].forEach(a => { a.node.active = true; }); return 1;")
    js("clearInterval(window.__lcKeepAlive); t.hitStopUntil = 0; window.__hideFollowers = false; return 1;")


if __name__ == '__main__':
    main()
