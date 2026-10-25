"""主城跑图素材入库:生成图(建筑 / 路灯 透明底,地面 方图)→ 抠透明(不透明底时四边洪水填充)→ 定尺寸 → assets/resources/ui/town/ + meta(sprite-frame,trim none)。

用法:python tools/qa/town_install_assets.py <生成目录> [名字...]
- 建筑:等比缩到最长边 1024;路灯:高 256;地面:取中心 512 方块做 2×2 镜像拼成 1024 无缝贴图。
"""
import io
import json
import os
import sys
import uuid

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = r'D:\project\lootchain-cocos'
DST = os.path.join(ROOT, r'assets\resources\ui\town')
PNG_TPL = os.path.join(ROOT, r'assets\resources\ui\hero\ai\stat_hp.png.meta')
T1, T2, RIM = 14, 52, 4


def region(mask, seeds):
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), 'L').convert('RGB')
    for sx, sy in seeds:
        if img.getpixel((sx, sy))[0] == 255:
            ImageDraw.floodfill(img, (sx, sy), (128, 0, 0))
    return np.asarray(img)[:, :, 0] == 128


def cutout(im):
    """已带真透明就只裁边;平底图按四边中值色洪水填充抠透明。"""
    if im.mode == 'RGBA':
        alpha = np.asarray(im.getchannel('A'))
        if (alpha < 16).mean() > 0.05:
            bbox = Image.fromarray((alpha > 16).astype(np.uint8) * 255).getbbox()
            return im.crop(bbox) if bbox else im
    rgb = im.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    h, w = a.shape[:2]
    ring = np.concatenate([a[:16].reshape(-1, 3), a[-16:].reshape(-1, 3), a[:, :16].reshape(-1, 3), a[:, -16:].reshape(-1, 3)])
    plate = np.median(ring, axis=0)
    dist = np.abs(a - plate).max(axis=2)
    seeds = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    r1 = region(dist < T1, seeds)
    grown = np.asarray(Image.fromarray(r1.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(RIM * 2 + 1))) > 0
    band = grown & ~r1
    alpha = np.full((h, w), 255, np.float32)
    alpha[band] = np.clip((dist[band] - T1) / (T2 - T1), 0.15, 1) * 255
    alpha[r1] = 0
    rgba = Image.fromarray(np.dstack([np.asarray(rgb), alpha.astype(np.uint8)]), 'RGBA')
    bbox = Image.fromarray((alpha > 16).astype(np.uint8) * 255).getbbox()
    return rgba.crop(bbox) if bbox else rgba


def write_meta(path, name, w, h):
    tpl = io.open(PNG_TPL, encoding='utf-8').read()
    old = json.loads(tpl)['uuid']
    meta_path = path + '.meta'
    if os.path.exists(meta_path):
        m = json.load(io.open(meta_path, encoding='utf-8'))
    else:
        m = json.loads(tpl.replace(old, str(uuid.uuid4())))
        for sub in m['subMetas'].values():
            sub['displayName'] = name
    m['userData']['hasAlpha'] = True
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


def main():
    src_dir = sys.argv[1]
    names = sys.argv[2:] or sorted(os.path.splitext(f)[0] for f in os.listdir(src_dir) if f.endswith('.png'))
    os.makedirs(DST, exist_ok=True)
    report = {}
    for name in names:
        src = os.path.join(src_dir, name + '.png')
        if not os.path.exists(src):
            print('missing', name)
            continue
        im = Image.open(src)
        if name == 'ground':
            rgb = im.convert('RGB')
            side = min(rgb.size)
            cx, cy = rgb.width // 2, rgb.height // 2
            half = min(256, side // 2)
            q = rgb.crop((cx - half, cy - half, cx + half, cy + half)).resize((512, 512), Image.LANCZOS)
            out = Image.new('RGB', (1024, 1024))
            out.paste(q, (0, 0))
            out.paste(q.transpose(Image.FLIP_LEFT_RIGHT), (512, 0))
            out.paste(q.transpose(Image.FLIP_TOP_BOTTOM), (0, 512))
            out.paste(q.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_TOP_BOTTOM), (512, 512))
            out = out.convert('RGBA')
        else:
            obj = cutout(im)
            if name == 'lamp':
                hh = 256
                ww = max(1, round(obj.width * hh / obj.height))
                out = obj.resize((ww, hh), Image.LANCZOS)
            else:
                # 小件装饰(树 / 货箱 / 石凳)显示才 200 世界单位,512 够用,省显存
                k = (512 if name in ('tree', 'crates', 'bench') else 1024) / max(obj.size)
                out = obj.resize((max(1, round(obj.width * k)), max(1, round(obj.height * k))), Image.LANCZOS)
        dst = os.path.join(DST, name + '.png')
        out.save(dst)
        write_meta(dst, name, out.width, out.height)
        report[name] = out.size
    print(json.dumps(report))


if __name__ == '__main__':
    main()
