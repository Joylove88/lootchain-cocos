# -*- coding: utf-8 -*-
"""主角野外骨骼入库(docs/60,2026-11-03 用户确认永夜龙骑底的男女两套):
- C:/mw/protag/<m2|f2>/out_fix(protag_spine_reskin + protag_spine_fix 产物,图集 ×2)→ assets/resources/spine/hero/<protag_m|protag_f>/
  贴图缩回原骨骼尺寸(1939×821,AI 按两倍像素画的细节缩下来更干净,显存 / 包体与其他英雄一致),图集直接用原 IshmaelA.atlas 坐标(×2 图集正好是它的两倍)
- 队伍头像:立绘(protag_m_v5 / protag_f_v6)裁头胸,暗底 256 → ui/hero/ai/avatar/PROTAGONIST_<MALE|FEMALE>_ATTACK.png(同其他英雄头像口径)
spine/hero/protag_ 前缀进网页开局包(scripts/web-pack-tiers.mjs)。
用法:python tools/qa/protag_spine_install.py
"""
import os, shutil, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERO = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero')
AVATAR = os.path.join(ROOT, 'assets', 'resources', 'ui', 'hero', 'ai', 'avatar')
ART = os.path.join(ROOT, '周报截图', '2026-11-02_主角', 'assets_src')
BASE = 'IshmaelA'
TARGETS = [('m2', 'protag_m', 'protag_m_v9', 'PROTAGONIST_MALE_ATTACK'), ('f2', 'protag_f', 'protag_f_v8', 'PROTAGONIST_FEMALE_ATTACK')]


# 11-03 用户「头一直在仰头」:永夜龙骑头盔骨骼本来斜向上,画进去的脸跟着仰;骨骼动画是在初始姿势上叠加,
# 把头骨 face01 初始角度往下压 15°(实测 -12° 已明显看向正前方,+ 方向更仰)全部动作一起修正
HEAD_TILT = -15.0
# 11-03 用户「头和脖子错位、离领口远」:压角度是绕脖根转,脸整体前移;把头骨在世界坐标里往背后(左)挪 18、下沉 5.4
# (父骨 chest 世界角 62.71°,换算成 chest 本地坐标;0 / 10 / 18 三档渲染对比 18 最贴领口)
HEAD_SHIFT = (-18.0, -5.4)
CHEST_WORLD_DEG = 62.71


def head_shift_local():
    import math
    a = math.radians(CHEST_WORLD_DEG)
    wx, wy = HEAD_SHIFT
    return wx * math.cos(a) + wy * math.sin(a), -wx * math.sin(a) + wy * math.cos(a)


def install_spine(src_key, name):
    # 衣服统一(protag_spine_unify.py)跑过就用它的结果
    src = os.path.join('C:/mw/protag', src_key, 'out_unify')
    if not os.path.isdir(src):
        src = os.path.join('C:/mw/protag', src_key, 'out_fix')
    dst = os.path.join(HERO, name)
    os.makedirs(dst, exist_ok=True)
    orig = os.path.join(HERO, BASE)
    w, h = Image.open(os.path.join(orig, BASE + '.png')).size
    Image.open(os.path.join(src, BASE + '.png')).convert('RGBA').resize((w, h), Image.LANCZOS).save(os.path.join(dst, name + '.png'), optimize=True)
    atlas = open(os.path.join(orig, BASE + '.atlas'), encoding='utf-8').read().splitlines()
    first = next(i for i, l in enumerate(atlas) if l.strip())
    atlas[first] = name + '.png'
    open(os.path.join(dst, name + '.atlas'), 'w', encoding='utf-8', newline='\n').write('\n'.join(atlas) + '\n')
    import json
    data = json.load(open(os.path.join(src, BASE + '.json'), encoding='utf-8'))
    for bone in data['bones']:
        if bone['name'] == 'face01':
            bone['rotation'] = round(bone.get('rotation', 0) + HEAD_TILT, 2)
            lx, ly = head_shift_local()
            bone['x'] = round(bone.get('x', 0) + lx, 2)
            bone['y'] = round(bone.get('y', 0) + ly, 2)
    json.dump(data, open(os.path.join(dst, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('spine', name, (w, h), 'from', src)


def install_avatar(art, code):
    im = Image.open(os.path.join(ART, art + '.png')).convert('RGBA')
    a = np.array(im.getchannel('A')) > 40
    top = np.where(a.any(1))[0][0]
    head = a[top:top + int(im.height * 0.08)]
    cx = int(np.where(head.any(0))[0].mean())
    side = int(im.width * 0.42)
    x0 = max(0, min(im.width - side, cx - side // 2))
    y0 = max(0, top - int(side * 0.06))
    crop = im.crop((x0, y0, x0 + side, y0 + side)).resize((256, 256), Image.LANCZOS)
    # 暗底(同 UR_ARTHAS 等头像的深色底)+ 轻微暗角
    yy, xx = np.mgrid[0:256, 0:256]
    d = np.sqrt((xx - 128) ** 2 + (yy - 110) ** 2) / 181
    base = np.clip(np.array([30, 26, 30]) * (1 - 0.55 * d[..., None]), 0, 255).astype(np.uint8)
    bg = Image.fromarray(np.dstack([base, np.full((256, 256), 255, np.uint8)]), 'RGBA')
    bg.alpha_composite(crop)
    path = os.path.join(AVATAR, code + '.png')
    bg.convert('RGB').save(path, optimize=True)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), path], check=True)
    print('avatar', code)


if __name__ == '__main__':
    for key, name, art, code in TARGETS:
        install_spine(key, name)
        install_avatar(art, code)
