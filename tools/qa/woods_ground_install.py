# -*- coding: utf-8 -*-
"""村外林地 v4 多层地表(2026-11-08 用户「地面效果能做到流放之路2这种级别吗,更细腻的材质」,选 E 方案前几项):
- 三张无缝材质(Codex 订阅生图:林地腐殖层 / 草甸 / 土路)转 1024² JPG 入库 ui/world/woods4/(带 mipmap、运行时设平铺);
- 混合遮罩 ground_splat.jpg(每像素 24 世界单位,RGB 4:4:4 JPG —— 出包的 PNG 量化会毁数据,透明通道也会被量化,所以不用 PNG / alpha):
    R = 大尺度噪声(腐殖层 ↔ 苔草过渡 + 明暗起伏),G = 草甸权重(怪群空地 / 林间空地 + 噪声成片),B = 离路中线距离 / 512
  第二张 ground_splat2.jpg:R = 落叶层(秋树 / 阔叶树冠下),G = 裸土(怪群圈心)
  着色器 effects/world-ground 按遮罩混 4 层(第 4 层 = 原 ground_woods3 苔草底纹),土路边缘按距离 + 噪声抖动、草土交界压一道暗沟、中线两侧车辙。
- 原图(1254² PNG)备份到 素材原始备份/woods-ground-tex-20261108/。

用法:python tools/qa/woods_ground_install.py <Codex 材质目录(含 tex_forest_floor.png / tex_meadow.png / tex_dirt_path.png)>
     python tools/qa/woods_ground_install.py --mask-only     (只按当前布局重出遮罩;改了 woods_v4_gen.py 的路网 / 怪群后要重跑)
"""
import json
import os
import shutil
import sys
import uuid

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import woods_v4_gen as G  # noqa: E402

ROOT = G.ROOT
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'woods4')
BACKUP = os.path.join(ROOT, '素材原始备份', 'woods-ground-tex-20261108')
TEXTURES = ['tex_forest_floor', 'tex_meadow', 'tex_dirt_path', 'tex_leaf_litter']
MASK_CELL = 24


def meta_for(name, ext, w, h, mip, compress):
    u = str(uuid.uuid4())
    sub_tex = '6c48a'
    sub_sf = 'f9941'
    return {
        'ver': '1.0.27', 'importer': 'image', 'imported': True, 'uuid': u, 'files': ['.json', ext],
        'subMetas': {
            sub_tex: {
                'importer': 'texture', 'uuid': f'{u}@{sub_tex}', 'displayName': name, 'id': sub_tex, 'name': 'texture',
                'userData': {'wrapModeS': 'repeat' if mip else 'clamp-to-edge', 'wrapModeT': 'repeat' if mip else 'clamp-to-edge',
                             'minfilter': 'linear', 'magfilter': 'linear', 'mipfilter': 'linear' if mip else 'none', 'anisotropy': 0,
                             'isUuid': True, 'imageUuidOrDatabaseUri': u, 'visible': False},
                'ver': '1.0.22', 'imported': True, 'files': ['.json'], 'subMetas': {}},
            sub_sf: {
                'importer': 'sprite-frame', 'uuid': f'{u}@{sub_sf}', 'displayName': name, 'id': sub_sf, 'name': 'spriteFrame',
                'userData': {'trimThreshold': 1, 'rotated': False, 'offsetX': 0, 'offsetY': 0, 'trimX': 0, 'trimY': 0,
                             'width': w, 'height': h, 'rawWidth': w, 'rawHeight': h, 'borderTop': 0, 'borderBottom': 0,
                             'borderLeft': 0, 'borderRight': 0, 'packable': False, 'pixelsToUnit': 100, 'pivotX': 0.5, 'pivotY': 0.5,
                             'meshType': 0, 'isUuid': True, 'imageUuidOrDatabaseUri': f'{u}@{sub_tex}', 'atlasUuid': '', 'trimType': 'none',
                             'vertices': {'rawPosition': [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0],
                                          'indexes': [0, 1, 2, 2, 1, 3], 'uv': [0, h, w, h, 0, 0, w, 0],
                                          'nuv': [0, 0, 1, 0, 0, 1, 1, 1], 'minPos': [-w / 2, -h / 2, 0], 'maxPos': [w / 2, h / 2, 0]}},
                'ver': '1.0.12', 'imported': True, 'files': ['.json'], 'subMetas': {}},
        },
        'userData': {'type': 'sprite-frame', 'fixAlphaTransparencyArtifacts': False, 'hasAlpha': False, 'redirect': f'{u}@{sub_tex}',
                     # 遮罩是数据图:不走 ASTC 有损压缩
                     'compressSettings': {'useCompressTexture': compress, 'presetId': 'lc-android-astc4'}},
    }


def write_meta(path, meta):
    """已有 meta 保留原 uuid(重跑不换引用)。"""
    mp = path + '.meta'
    if os.path.exists(mp):
        old = json.load(open(mp, encoding='utf-8'))
        u = old['uuid']
        s = json.dumps(meta).replace(meta['uuid'], u)
        meta = json.loads(s)
    with open(mp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def ensure_dir():
    os.makedirs(DST, exist_ok=True)
    dm = DST + '.meta'
    if not os.path.exists(dm):
        with open(dm, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'ver': '1.2.0', 'importer': 'directory', 'imported': True, 'uuid': str(uuid.uuid4()), 'files': [], 'subMetas': {}, 'userData': {}}, f, indent=2)


def install_textures(src):
    os.makedirs(BACKUP, exist_ok=True)
    for name in TEXTURES:
        p = os.path.join(src, name + '.png')
        if not os.path.exists(p):
            print('skip (no source)', name)
            continue
        shutil.copy2(p, os.path.join(BACKUP, name + '.png'))
        im = Image.open(p).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        out = os.path.join(DST, name + '.jpg')
        im.save(out, quality=90, subsampling=0)
        write_meta(out, meta_for(name, '.jpg', 1024, 1024, True, True))
        print(out, os.path.getsize(out) // 1024, 'KB')


def value_noise(w, h, cell, seed):
    rnd = np.random.RandomState(seed)
    gw, gh = w // cell + 3, h // cell + 3
    grid = rnd.rand(gh, gw).astype(np.float32)
    im = Image.fromarray((grid * 255).astype(np.uint8)).resize((gw * cell, gh * cell), Image.BICUBIC)
    return np.asarray(im).astype(np.float32)[:h, :w] / 255.0


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def build_mask():
    L, g = G.generate()
    W = int(np.ceil(G.MAP_W / MASK_CELL))
    H = int(np.ceil(G.MAP_H / MASK_CELL))
    xs = (np.arange(W) + 0.5) * MASK_CELL - G.MAP_W / 2
    ys = G.MAP_H / 2 - (np.arange(H) + 0.5) * MASK_CELL
    X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
    d_road = G.seg_dist(X, Y, L['roads'])
    clear = np.zeros(X.shape, np.float32)
    for c in L['camps']:
        r = G.camp_radius(c) * 0.85 + 60
        clear = np.maximum(clear, 1 - smoothstep(r * 0.7, r * 1.15, np.hypot(X - c['x'], (Y - c['y']) / 0.8)))
    for x, y, rx, ry in L['areas']:
        clear = np.maximum(clear, 0.7 * (1 - smoothstep(0.6, 1.1, np.hypot((X - x) / rx, (Y - y) / ry))))
    # 噪声按世界尺度:大块约 2000、中块 700、小块 260 世界单位
    n1 = value_noise(W, H, 83, 3) * 0.55 + value_noise(W, H, 30, 4) * 0.3 + value_noise(W, H, 11, 5) * 0.15
    n2 = value_noise(W, H, 70, 11) * 0.6 + value_noise(W, H, 24, 12) * 0.4
    meadow = np.clip(clear * 0.55 + smoothstep(0.55, 0.8, n2) * 0.45, 0, 0.7)
    rgb = np.stack([n1, meadow / 0.7, np.clip(d_road / 512.0, 0, 1)], axis=-1)
    save_mask(rgb, 'ground_splat', W, H)
    # 第二张遮罩(11-08 第二版):R = 落叶层(秋树 / 阔叶树冠下,按噪声成片)、G = 裸土(怪群圈心被踩秃的地)
    leaf = np.zeros(X.shape, np.float32)
    for t in L['tall']:
        if t.get('kind') != 'tree' or 'pine' in t['asset']:
            continue
        w = t['width']
        k = 0.9 if 'autumn' in t['asset'] else 0.45
        r = np.hypot((X - t['x']) / (w * 0.62), (Y - (t['y'] + w * 0.12)) / (w * 0.4))
        leaf = np.maximum(leaf, k * (1 - smoothstep(0.45, 1.05, r)))
    n4 = value_noise(W, H, 9, 31) * 0.6 + value_noise(W, H, 4, 32) * 0.4
    # 噪声把圆斑打碎成一片片(实测整圆像个坑)
    leaf = np.clip(leaf * (0.35 + 1.1 * n4) - 0.1, 0, 1) * smoothstep(60, 160, d_road)
    bare = np.zeros(X.shape, np.float32)
    for c in L['camps']:
        if c['elite']:
            continue
        r = G.camp_radius(c)
        bare = np.maximum(bare, 1 - smoothstep(r * 0.25, r * 0.7, np.hypot(X - c['x'], (Y - c['y']) / 0.8)))
    bare = np.clip(bare * (0.35 + 0.65 * value_noise(W, H, 6, 41)), 0, 1) * 0.85
    save_mask(np.stack([leaf, bare, np.zeros_like(leaf)], axis=-1), 'ground_splat2', W, H)


def save_mask(rgb, name, W, H):
    im = Image.fromarray((rgb * 255).round().clip(0, 255).astype(np.uint8), 'RGB')
    out = os.path.join(DST, name + '.jpg')
    im.save(out, quality=95, subsampling=0)
    write_meta(out, meta_for(name, '.jpg', W, H, False, False))
    print(out, W, H, os.path.getsize(out) // 1024, 'KB')


def main():
    ensure_dir()
    if '--mask-only' not in sys.argv:
        install_textures(sys.argv[1])
    elif '--tex' in sys.argv:
        install_textures(sys.argv[sys.argv.index('--tex') + 1])
    build_mask()


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
