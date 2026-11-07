# -*- coding: utf-8 -*-
"""D26 镜像自检(2026-11-08 罗圈腿修复后加):19 名入库骨骼(镜像后)待机首帧 vs 原始素材整图水平翻转,逐个打印 alpha 差异像素占比。
正常 < 1%(只有裁边 1px 误差);某个英雄明显偏大 = 有新的「不继承镜像」骨骼没处理(见 d26_install_heroes.mirror_non_inheriting_bones)。
用法:python tools/qa/d26_mirror_check.py(中间产物写到 %TEMP%/lootchain-qa/d26_mirror)"""
import os, shutil, subprocess, sys
from PIL import Image, ImageChops, ImageOps

sys.path.insert(0, r'D:\project\lootchain-cocos\tools\qa')
from d26_install_heroes import HEROES  # (编号, 资源名, 档位)

S = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'd26_mirror')
os.makedirs(S, exist_ok=True)
SRC = 'D:/骨骼动画素材/d26_42'
RENDER = r'D:\project\lootchain-cocos\tools\qa\fxprev\render_portrait.py'
HERO_DIR = r'D:\project\lootchain-cocos\assets\resources\spine\hero'
stage = os.path.join(S, 'all_orig')
names = []
for code, asset, _tier in HEROES:
    out = os.path.join(stage, asset)
    os.makedirs(out, exist_ok=True)
    jdir = f'{SRC}/fx42json/{code}'
    shutil.copyfile(os.path.join(jdir, [f for f in os.listdir(jdir) if f.endswith('.json')][0]), os.path.join(out, asset + '.json'))
    for f in os.listdir(f'{SRC}/fx42/{code}'):
        if f.endswith('.png'):
            shutil.copyfile(f'{SRC}/fx42/{code}/{f}', os.path.join(out, f))
        elif f.endswith('.atlas'):
            shutil.copyfile(f'{SRC}/fx42/{code}/{f}', os.path.join(out, asset + '.atlas'))
    names.append(asset)
subprocess.run([sys.executable, RENDER, stage, os.path.join(S, 'all_orig_out')] + names, check=True, capture_output=True)
subprocess.run([sys.executable, RENDER, HERO_DIR, os.path.join(S, 'all_now_out')] + names, check=True, capture_output=True)
worst = 0
for asset in names:
    ref = ImageOps.mirror(Image.open(os.path.join(S, 'all_orig_out', asset + '.png')).convert('RGBA'))
    im = Image.open(os.path.join(S, 'all_now_out', asset + '.png')).convert('RGBA').resize(ref.size)
    diff = ImageChops.difference(ref.getchannel('A'), im.getchannel('A')).point(lambda v: 255 if v > 64 else 0)
    pct = sum(diff.histogram()[255:]) / (ref.size[0] * ref.size[1]) * 100
    worst = max(worst, pct)
    print(f'{asset:18s} {pct:5.2f}%')
print(f'worst {worst:.2f}%')
