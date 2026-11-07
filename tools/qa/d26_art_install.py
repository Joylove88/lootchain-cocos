# -*- coding: utf-8 -*-
"""D26 异界神州英雄美术入库(2026-11-07)。
  card   : 骨骼待机透明立绘 D:/骨骼动画素材/d26_portrait/<资源名>.png → ui/hero-roster/card_background/<资源名>.png(长边 ≤900)
  roster : GPT 横版卡面 D:/骨骼动画素材/d26_art/roster/<英雄码>.png → ui/hero/roster/<英雄码>.jpg(768×432)
  avatar : GPT 头像     D:/骨骼动画素材/d26_art/avatar/<英雄码>.png → ui/hero/ai/avatar/<英雄码>.png(256×256)
  emblem : GPT 徽章内芯 D:/骨骼动画素材/d26_art/emblem/<英雄码>.png → 裁圆垫到统一金环下 → ui/hero/ult_emblem/<英雄码>.png(512×509,同老徽章)
           (11-08 用户嫌金环版 AI 感太强,已弃用,改用 emblem_paint)
  emblem_paint : B 主题哑光手绘徽章 D:/骨骼动画素材/d26_art/emblem_paint/<英雄码>.png → 裁圆(无金环,界面自己画细白圈)
           → ui/hero/ult_emblem/<英雄码>.png(384×384,透明圆外)
原图备份 素材原始备份/d26-hero-art-20261107。meta:已有就只改尺寸,否则抄同目录现成 meta 换 uuid(sprite-frame,trim none)。
用法:python tools/qa/d26_art_install.py [card roster avatar]
"""
import io, json, os, shutil, sys, uuid
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from d26_art_gen import HEROES  # 英雄码 → 资源名

ROOT = r'D:\project\lootchain-cocos'
RES = os.path.join(ROOT, 'assets', 'resources')
BACKUP = os.path.join(ROOT, '素材原始备份', 'd26-hero-art-20261107')
KINDS = {
    'card': (os.path.join(RES, r'ui\hero-roster\card_background'), 'npc_1001.png.meta', '.png'),
    'roster': (os.path.join(RES, r'ui\hero\roster'), 'R_ACOLY_02.jpg.meta', '.jpg'),
    'avatar': (os.path.join(RES, r'ui\hero\ai\avatar'), 'R_ACOLY_02.png.meta', '.png'),
    'emblem': (os.path.join(RES, r'ui\hero\ult_emblem'), 'UR_ARTHAS.png.meta', '.png'),
    'emblem_paint': (os.path.join(RES, r'ui\hero\ult_emblem'), 'UR_ARTHAS.png.meta', '.png'),
}

# 老徽章(10-19)几何:512×509,内芯圆心 (256, 254)、半径 147(两枚老徽章逐像素差分量出);金环 = 永夜龙骑徽章挖掉内芯
EMBLEM_CX, EMBLEM_CY, EMBLEM_R = 256, 254, 147


def circle_mask(size, cx, cy, r, feather):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m


EMBLEM_PAINT_SIZE = 384


def round_emblem(src):
    """B 主题徽章:中心裁正方 → 4 倍超采样画圆 → 缩到 384(圆边抗锯齿),圆外全透明。"""
    im = src.convert('RGB')
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    big = EMBLEM_PAINT_SIZE * 4
    im = im.resize((big, big), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, big - 3, big - 3), fill=255)
    im.putalpha(mask)
    return im.resize((EMBLEM_PAINT_SIZE, EMBLEM_PAINT_SIZE), Image.LANCZOS)


def compose_emblem(core_src):
    ring = Image.open(os.path.join(KINDS['emblem'][0], 'UR_ARTHAS.png')).convert('RGBA')
    hole = circle_mask(ring.size, EMBLEM_CX, EMBLEM_CY, EMBLEM_R + 0.5, 0.8)
    ring.putalpha(ImageChops.multiply(ring.getchannel('A'), ImageChops.invert(hole)))
    core = core_src.convert('RGB')
    side = min(core.size)
    core = core.crop(((core.width - side) // 2, (core.height - side) // 2, (core.width + side) // 2, (core.height + side) // 2))
    d = (EMBLEM_R + 3) * 2
    core = core.resize((d, d), Image.LANCZOS).convert('RGBA')
    core.putalpha(circle_mask((d, d), d // 2, d // 2, EMBLEM_R + 3, 0.8))
    out = Image.new('RGBA', ring.size, (0, 0, 0, 0))
    out.alpha_composite(core, (EMBLEM_CX - d // 2, EMBLEM_CY - d // 2))
    out.alpha_composite(ring)
    return out


def write_meta(path, tpl_path, name, w, h, has_alpha):
    meta_path = path + '.meta'
    if os.path.exists(meta_path):
        m = json.load(io.open(meta_path, encoding='utf-8'))
    else:
        tpl = io.open(tpl_path, encoding='utf-8').read()
        old = json.loads(tpl)['uuid']
        m = json.loads(tpl.replace(old, str(uuid.uuid4())))
        for sub in m['subMetas'].values():
            sub['displayName'] = name
    m['userData']['hasAlpha'] = has_alpha
    sf = m['subMetas']['f9941']['userData']
    sf['trimType'] = 'none'
    for key, v in (('width', w), ('height', h), ('rawWidth', w), ('rawHeight', h), ('trimX', 0), ('trimY', 0), ('offsetX', 0), ('offsetY', 0)):
        sf[key] = v
    if 'vertices' in sf:
        hw, hh = w // 2, h // 2
        sf['vertices']['rawPosition'] = [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0]
        sf['vertices']['minPos'] = [-hw, -hh, 0]
        sf['vertices']['maxPos'] = [hw, hh, 0]
        sf['vertices']['uv'] = [0, h, w, h, 0, 0, w, 0]
    io.open(meta_path, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')


def install(kind):
    dst_dir, tpl_name, ext = KINDS[kind]
    tpl = os.path.join(dst_dir, tpl_name)
    os.makedirs(os.path.join(BACKUP, kind), exist_ok=True)
    done = []
    for code, asset in HEROES.items():
        src = (os.path.join('D:/骨骼动画素材/d26_portrait', asset + '.png') if kind == 'card'
               else os.path.join('D:/骨骼动画素材/d26_art', kind, code + '.png'))
        if not os.path.exists(src):
            continue
        name = asset if kind == 'card' else code
        shutil.copy2(src, os.path.join(BACKUP, kind, os.path.basename(src)))
        im = Image.open(src)
        if kind == 'emblem':
            im = compose_emblem(im)
        elif kind == 'emblem_paint':
            im = round_emblem(im)
        elif kind == 'card':
            im = im.convert('RGBA')
            im.thumbnail((900, 900), Image.LANCZOS)
        elif kind == 'roster':
            im = ImageEnhance.Color(im.convert('RGB').resize((768, 432), Image.LANCZOS)).enhance(0.9)
        else:
            im = im.convert('RGB')
            side = min(im.size)
            im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2)).resize((256, 256), Image.LANCZOS)
        dst = os.path.join(dst_dir, name + ext)
        if ext == '.jpg':
            im.save(dst, quality=88)
        else:
            im.save(dst, optimize=True)
        write_meta(dst, tpl, name, im.width, im.height, kind in ('card', 'emblem', 'emblem_paint'))
        done.append(name)
    print(f'{kind}: {len(done)} installed', ' '.join(done))


if __name__ == '__main__':
    for k in (sys.argv[1:] or ['card', 'roster', 'avatar']):  # emblem 要显式点名
        install(k)
