# -*- coding: utf-8 -*-
"""主城 NPC 骨骼入库(2026-11-11 用户「npc可以骨骼素材中找合适的用」「去D盘里找」)。

素材:D:\\骨骼\\失落之剑 素材包的「怪NPC」「小人」(Spine 4.1.24,带 .spine 工程、没带散图)。
先用 tools/qa/npc_spine_convert.ps1 转成 4.2.43(产物在 D:\\骨骼动画素材\\ls_npc_42:out\\<套名>\\*.skel + 原 atlas / png,
json\\<套名>\\*.json),再跑本脚本:

  python tools/qa/npc_spine_install.py [套名 ...]        # 不给套名 = out 目录里有的全装

做的事:拷到 assets/resources/spine/npc/<小写套名>/<小写套名>.skel(没有 skel 只有 json 的装 json)+ .atlas + .png,
图集首行的贴图名跟着改;然后打印一行可以直接贴进 LobbyCityMoon.ts NPC_SPINE 的配置:
  bodyH / footY = 导出 json 里 skeleton 的包围盒 × 待机动作第 0 帧根骨骼的缩放
  (这批素材的待机动作把根骨骼缩到 0.25、图集也按 0.25 出;不乘的话人只有预期的 1/4 大);
  pma 取图集里的 pma 行;anim = 待机动作名。
入库后在 Creator 里刷新一次(curl localhost:7456/asset-db/refresh)生成 meta。
"""
import glob
import io
import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = r'D:\骨骼动画素材\ls_npc_42'
DST = os.path.join(ROOT, 'assets', 'resources', 'spine', 'npc')


def idle_of(data):
    names = list((data.get('animations') or {}).keys())
    for want in ('idle', 'stand'):
        for n in names:
            if n.lower() == want:
                return n
    for n in names:
        if 'idle' in n.lower():
            return n
    return names[0] if names else ''


def root_scale(data, anim):
    """待机动作第 0 帧根骨骼的缩放(没有缩放轨道 = 1)。"""
    bones = data.get('bones') or []
    root = bones[0]['name'] if bones else 'root'
    tl = (((data.get('animations') or {}).get(anim) or {}).get('bones') or {}).get(root) or {}
    keys = tl.get('scale') or []
    if keys:
        first = keys[0]
        return float(first.get('x', 1)), float(first.get('y', 1))
    return float(bones[0].get('scaleX', 1)) if bones else 1.0, float(bones[0].get('scaleY', 1)) if bones else 1.0


def install(name):
    out = os.path.join(SRC, 'out', name)
    js = glob.glob(os.path.join(SRC, 'json', name, '*.json')) or glob.glob(os.path.join(SRC, 'manual', name + '.json'))
    skel = glob.glob(os.path.join(out, '*.skel'))
    atlas = glob.glob(os.path.join(out, '*.atlas'))
    pngs = glob.glob(os.path.join(out, '*.png'))
    if not js or not atlas or not pngs or (not skel and not js):
        print('SKIP', name, '缺文件:', 'json' if not js else '', 'atlas' if not atlas else '', 'png' if not pngs else '')
        return
    low = name.lower()
    dst = os.path.join(DST, low)
    os.makedirs(dst, exist_ok=True)
    if skel:
        shutil.copy2(skel[0], os.path.join(dst, low + '.skel'))
    else:
        shutil.copy2(js[0], os.path.join(dst, low + '.json'))
    text = io.open(atlas[0], encoding='utf-8').read()
    for i, png in enumerate(pngs):
        new = low + ('' if i == 0 else '_%d' % (i + 1)) + '.png'
        shutil.copy2(png, os.path.join(dst, new))
        text = text.replace(os.path.basename(png), new)
    io.open(os.path.join(dst, low + '.atlas'), 'w', encoding='utf-8', newline='\n').write(text)
    data = json.load(io.open(js[0], encoding='utf-8'))
    sk = data['skeleton']
    anim = idle_of(data)
    _sx, sy = root_scale(data, anim)
    body_h = round(float(sk.get('height', 0)) * sy)
    foot_y = round(float(sk.get('y', 0)) * sy)
    pma = 'pma:true' in text.replace(' ', '').lower()
    cfg = "{ path: 'spine/npc/%s/%s', bodyH: %d%s%s%s }" % (
        low, low, body_h, ', footY: %d' % foot_y if abs(foot_y) >= 2 else '', ', pma: true' if pma else '',
        ", anim: '%s'" % anim if anim.lower() not in ('idle', 'stand') else '')
    print('%-20s 动作 %s  根骨骼缩放 %.2f  →  %s' % (name, list((data.get('animations') or {}).keys())[:6], sy, cfg))


def main():
    names = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not names:
        names = sorted(os.listdir(os.path.join(SRC, 'out'))) if os.path.isdir(os.path.join(SRC, 'out')) else []
    for n in names:
        install(n)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
