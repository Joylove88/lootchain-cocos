# -*- coding: utf-8 -*-
"""野外真 3D 场景(?field3d=2)的交付图:借常驻预览(field_dev.py start 要先在后台跑着)截一套对比图。

  python tools/proto3d/field/field_sample.py <输出目录> [--only=cmp,fx,props,lineup,post]

出的图:
  cmp   同一刻对比(定格后只切开关):入口营地、林间怪群旁 —— 左 = 真 3D 场景,右 = 现在线上的 2D
  fx    队长的普攻三段 + 三个技能,各取出手后的两个时刻
  props 摆件的两种做法并排:代码生成的模型(默认) / 手绘图立进 3D(对照),整个场景
  lineup 对照台:同一种摆件,后排手绘立牌、前排代码生成的模型(各摆几个变体),一类一张
  post  后期处理(TownPost3D):同一刻开 / 关对比、拆开看遮蔽这一层、技能的光晕、各档位的边缘细节
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
ONLY = [x for x in OPT.get('only', 'cmp,fx,props,lineup,post').split(',') if x]
POSTONLY = [x for x in OPT.get('post', 'cmp,parts,fx,levels').split(',') if x]      # post 里只出哪几张(同一刻对比 / 遮蔽拆开 / 技能 / 各档位)
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


# 后期换档并等它换完(换档会整层撤掉重建);顺手把调试视图关掉
def post_level(level, extra=''):
    return js("const P = window.__f3dpost; P.level(%d); await sleep(500); for (let i = 0; i < 90; i++) { await sleep(150); const u = F.info(); const p = u.extras && u.extras[0] && u.extras[0].props;"
              " if (u.on && u.heroes3d >= 1 && p && p.items >= p.shown - 3 && i > 14) break; } P.set({ debug: 0 }); %s await sleep(500);"
              " return JSON.stringify({ on: P.info() ? P.info().on : false, last: P.info() ? P.info().last : null });" % (level, extra))


def post_set(patch):
    return js("window.__f3dpost.set(%s); await sleep(350); return 1;" % patch)


def crop2(im, box, k=2):
    c = im.crop(box)
    return c.resize((c.width * k, c.height * k), Image.NEAREST)


def post_sheets():
    if 'cmp' in POSTONLY:
        # 1. 同一刻:不开后期 / 开后期(默认档),两处
        for name, title, x, y, box in (('07_后期_同一刻对比_林间', '后期处理 · 林间(定格后只切后期的开关)', -6620, -1900, (640, 300, 1120, 570)),
                                       ('08_后期_同一刻对比_入口营地', '后期处理 · 入口营地(定格后只切后期的开关)', -8350, -2900, (980, 420, 1460, 690))):
            print('post cmp', name, tp(x, y)[-80:], flush=True)
            js("t.hitStopUntil = 0; t.keys.add(cc.KeyCode.KEY_D); await sleep(650); t.keys.delete(cc.KeyCode.KEY_D); await sleep(900); return 1;")
            js(FREEZE)
            print('  off', post_level(0), flush=True)
            a = Image.open(shot(name + '_a_关')).convert('RGB')
            print('  on', post_level(2), flush=True)
            b = Image.open(shot(name + '_b_开')).convert('RGB')
            js(UNFREEZE)
            k = 0.5
            size = (int(a.width * k), int(a.height * k))
            tiles = [tag(a.resize(size, Image.LANCZOS), '不开后期(上一版)'), tag(b.resize(size, Image.LANCZOS), '开后期:环境光遮蔽 + 泛光 + 调色'),
                     tag(crop2(a, box), '不开后期 · 局部放大 2 倍'), tag(crop2(b, box), '开后期 · 局部放大 2 倍')]
            sheet(tiles, 2, title, os.path.join(OUT, name + '.jpg'))
    if 'parts' in POSTONLY:
        # 2. 拆开看:遮蔽这一层长什么样、只加遮蔽、全开
        print('post parts', tp(-6900, -1750, followers=False)[-80:], flush=True)
        js(FREEZE)
        post_level(2)
        box = (300, 180, 1260, 720)
        post_set("{ aoStrength: 0, bloom: false }")
        a = Image.open(shot('post_parts_none')).convert('RGB').crop(box)
        post_set("{ aoStrength: 0.7, debug: 1 }")
        b = Image.open(shot('post_parts_aobuf')).convert('RGB').crop(box)
        post_set("{ debug: 0 }")
        c = Image.open(shot('post_parts_ao')).convert('RGB').crop(box)
        post_set("{ bloom: true }")
        js(UNFREEZE)
        sheet([tag(a, '不加遮蔽'), tag(b, '遮蔽这一层单独看(越黑 = 被周围挡得越多)'), tag(c, '加上遮蔽:枝叶之间、草根、脚下有了深浅')], 3,
              '环境光遮蔽 · 拆开看', os.path.join(OUT, '09_后期_遮蔽拆开看.jpg'))
    if 'fx' in POSTONLY:
        # 3. 技能:开着后期放一遍;重斩和旋风斩再单独看泛光这一层。
        #    (不开后期的样子见 03:换档要整层重建,特效留不住,没法在同一刻对比)
        tp(-6620, -1900)
        post_level(2)
        tiles = []
        layers = []
        for act, wait, name in (('attack', 300, '普攻'), (0, 560, '重斩'), (1, 260, '突进斩'), (2, 760, '旋风斩')):
            js("t.hitStopUntil = 0; await sleep(1300); window.__act = %s; window.__actWait = %d; return 1;" % ("'attack'" if act == 'attack' else act, wait))
            js('@' + os.path.join(SNIP, 'fight.js'))
            im = Image.open(shot('post_fx_%s' % act)).convert('RGB').crop((460, 150, 1460, 850))
            tiles.append(tag(im.resize((750, 525), Image.LANCZOS), name))
            if act in (0, 2):
                post_set("{ debug: 2 }")
                im = Image.open(shot('post_fx_%s_bloom' % act)).convert('RGB').crop((460, 150, 1460, 850))
                layers.append(tag(im.resize((750, 525), Image.LANCZOS), name + ' · 泛光这一层单独看'))
                post_set("{ debug: 0 }")
            js(UNFREEZE)
        sheet(tiles + layers, 3, '技能特效 · 开着后期(最后两格 = 泛光这一层单独看)', os.path.join(OUT, '10_后期_技能特效.jpg'))
    if 'levels' in POSTONLY:
        # 4. 各档位的边缘细节(放大 2 倍看像素)
        print('post levels', tp(-6900, -1750, followers=False)[-80:], flush=True)
        js(FREEZE)
        tiles = []
        for lv, label in ((0, '不开后期:硬件抗锯齿 + 软边'), (1, '标准:原尺寸 + 边缘抗锯齿'), (2, '高(默认):1.5 倍放大渲染'), (3, '超高:2 倍放大渲染')):
            post_level(lv)
            im = Image.open(shot('post_level_%d' % lv)).convert('RGB')
            tiles.append(tag(crop2(im, (420, 330, 660, 570)), label))
            tiles.append(tag(crop2(im, (760, 500, 1000, 740)), label))
        post_level(2)
        js(UNFREEZE)
        sheet([tiles[i] for i in (0, 2, 4, 6, 1, 3, 5, 7)], 4, '后期各档位 · 边缘和细节(局部放大 2 倍)', os.path.join(OUT, '11_后期_各档位细节.jpg'))

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
    if 'post' in ONLY:
        post_sheets()
    js("clearInterval(window.__lcKeepAlive); t.hitStopUntil = 0; window.__hideFollowers = false; return 1;")


if __name__ == '__main__':
    main()
