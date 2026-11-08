# -*- coding: utf-8 -*-
"""野外立物贴图按实际显示尺寸预缩小(2026-11-08 用户「看起来比较糊、颗粒感、AI 感太强,需要更细腻」)。

根因:项目网页端只开了 WebGL1(settings engine.json 只有 gfx-webgl),WebGL1 不给非 2 次幂贴图生成 mipmap,
立物贴图(1024 级 AI 原图)在林地镜头 1.4 倍下按 2~3.7 倍缩小采样 → 树叶 / 碎石一颗颗闪、发硬发糙。
处理:按「所有地图里最大显示宽 × 1.2(1080 设计高)÷ 镜头倍数 × 1.1」算出需要的像素,原图超过 1.3 倍就预乘透明后 Lanczos 缩小
(不预乘会在边缘带出暗 / 亮边),meta 的 sprite-frame 尺寸同步改。原图备份到 素材原始备份/world-tex-fit-20261108/(保留相对路径)。

用法:python tools/qa/world_tex_fit.py [--maps WOODS] [--dry]
"""
import io
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk_map_overlay import dump_maps  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources')
BACKUP = os.path.join(ROOT, '素材原始备份', 'world-tex-fit-20261108')
MIN_RATIO = 1.3
MARGIN = 1.1


def needs():
    maps = dump_maps()
    need, used_in = {}, {}
    for code, d in maps.items():
        k = 1.2 / (d.get('cameraZoom') or 1)
        for p in d['props']:
            a = p['asset'].replace('/spriteFrame', '')
            need[a] = max(need.get(a, 0), p['width'] * k * MARGIN)
            used_in.setdefault(a, set()).add(code)
    return need, used_in


def resize_premul(im, w, h):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255.0
    rgb = a[..., :3] * a[..., 3:4]
    chans = [Image.fromarray(c) for c in (rgb[..., 0], rgb[..., 1], rgb[..., 2], a[..., 3])]
    out = np.stack([np.asarray(c.resize((w, h), Image.LANCZOS)) for c in chans], axis=-1).clip(0, 1)
    alpha = out[..., 3:4]
    rgb = np.where(alpha > 1e-4, out[..., :3] / np.maximum(alpha, 1e-4), 0)
    return Image.fromarray((np.concatenate([rgb, alpha], -1).clip(0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def fix_meta(meta_path, w, h):
    raw = io.open(meta_path, encoding='utf-8', newline='').read()
    m = json.loads(raw)
    for sub in m['subMetas'].values():
        if sub.get('importer') != 'sprite-frame':
            continue
        u = sub['userData']
        u.update({'width': w, 'height': h, 'rawWidth': w, 'rawHeight': h, 'trimX': 0, 'trimY': 0, 'offsetX': 0, 'offsetY': 0})
        v = u.get('vertices')
        if v:
            v['rawPosition'] = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0]
            v['uv'] = [0, h, w, h, 0, 0, w, 0]
            v['minPos'] = [-w / 2, -h / 2, 0]
            v['maxPos'] = [w / 2, h / 2, 0]
    nl = '\r\n' if '\r\n' in raw else '\n'
    io.open(meta_path, 'w', encoding='utf-8', newline='').write(json.dumps(m, ensure_ascii=False, indent=2).replace('\n', nl) + (nl if raw.endswith(('\n', '\r\n')) else ''))


def main():
    maps = sys.argv[sys.argv.index('--maps') + 1].split(',') if '--maps' in sys.argv else ['WOODS']
    dry = '--dry' in sys.argv
    need, used_in = needs()
    done = 0
    for a, n in sorted(need.items()):
        if not used_in[a] & set(maps):
            continue
        path = os.path.join(RES, a + '.png')
        if not os.path.exists(path):
            continue
        im = Image.open(path)
        w, h = im.size
        ratio = w / n
        if ratio < MIN_RATIO:
            continue
        nw = max(16, round(n))
        nh = max(16, round(h * nw / w))
        print(f'{a}: {w}x{h} -> {nw}x{nh} (x{ratio:.2f}, {",".join(sorted(used_in[a]))})')
        if dry:
            continue
        bak = os.path.join(BACKUP, a + '.png')
        os.makedirs(os.path.dirname(bak), exist_ok=True)
        if not os.path.exists(bak):
            shutil.copy2(path, bak)
        resize_premul(im, nw, nh).save(path, optimize=True)
        fix_meta(path + '.meta', nw, nh)
        done += 1
    print('resized', done)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
