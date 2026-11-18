# -*- coding: utf-8 -*-
"""只缩贴图、不动模型结构的 .glb 轻量版(2026-11-18:用户笔记本 Arc 140V 核显上主城 3D 小样很卡、载入要好几分钟)。

图转 3D 平台给的模型每个带三张 4096×4096 的贴图(颜色 / 法线 / 粗糙度金属度),一张在显存里 60~80MB;
主城同时载入 14 个模型,光贴图就约 3.5GB —— 独显感觉不到,核显(共享系统内存)每帧都在搬数据,下载也慢(300MB 里大半是贴图)。

做法:每张图缩到 --tex(长边),没有透明的一律存 JPEG(法线图质量高一点),有透明的存 PNG;其余(网格、骨骼、动作、材质)原样拷。
网格 / 材质 / 贴图的个数和顺序不变,所以 Creator 重新导入后子资源的编号不变,.meta 可以沿用。

  python -I tools/proto3d/char3d/glb_texlite.py <输入.glb> <输出.glb> [--tex=1024] [--q=86]
  python -I tools/proto3d/char3d/glb_texlite.py --dir <原目录> <输出目录> [--tex=1024] [--big=cathedral,smithy,hero_m,hero_f] [--bigtex=2048]
      --dir:把 <原目录> 整个拷到 <输出目录>(连 .meta),再把里面每个 .glb 换成轻量版;--big 里列的键用 --bigtex
"""
import io
import json
import os
import shutil
import struct
import sys

from PIL import Image

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))


def lite(src, dst, tex, q):
    d = open(src, 'rb').read()
    assert d[:4] == b'glTF'
    jl = struct.unpack('<I', d[12:16])[0]
    doc = json.loads(d[20:20 + jl])
    b0 = 20 + jl + 8
    blen = struct.unpack('<I', d[20 + jl:24 + jl])[0]
    binary = d[b0:b0 + blen]
    views = doc['bufferViews']
    # 哪些图是法线图(质量给高一点)
    normal_imgs = set()
    for m in doc.get('materials', []):
        nt = m.get('normalTexture')
        if nt is not None:
            src_i = doc['textures'][nt['index']].get('source')
            if src_i is not None:
                normal_imgs.add(src_i)
    new_bytes = {}
    for i, im in enumerate(doc.get('images', [])):
        if 'bufferView' not in im:
            continue
        v = views[im['bufferView']]
        raw = binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        img = Image.open(io.BytesIO(raw))
        img.load()
        w, h = img.size
        if max(w, h) > tex:
            k = tex / max(w, h)
            img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        alpha = img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 255
        buf = io.BytesIO()
        if alpha:
            img.save(buf, 'PNG', optimize=True)
            im['mimeType'] = 'image/png'
        else:
            img.convert('RGB').save(buf, 'JPEG', quality=min(95, q + 6) if i in normal_imgs else q, optimize=True)
            im['mimeType'] = 'image/jpeg'
        new_bytes[im['bufferView']] = buf.getvalue()
    # 重新拼二进制块:每个 bufferView 按原顺序放,4 字节对齐
    out = bytearray()
    for vi, v in enumerate(views):
        data = new_bytes.get(vi)
        if data is None:
            data = binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        while len(out) % 4:
            out.append(0)
        v['byteOffset'] = len(out)
        v['byteLength'] = len(data)
        out.extend(data)
    while len(out) % 4:
        out.append(0)
    doc['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON'))
        f.write(js)
        f.write(struct.pack('<I4s', len(out), b'BIN\x00'))
        f.write(out)
    return len(d), total


def main():
    q = int(OPT.get('q', '86'))
    if OPT.get('dir'):
        src_dir, dst_dir = ARGS[0], ARGS[1]
        tex = int(OPT.get('tex', '1024'))
        big = [k for k in OPT.get('big', 'cathedral,smithy,hero_m,hero_f').split(',') if k]
        bigtex = int(OPT.get('bigtex', '2048'))
        if os.path.exists(dst_dir):
            shutil.rmtree(dst_dir)
        shutil.copytree(src_dir, dst_dir)
        a = b = 0
        for root, _dirs, files in os.walk(dst_dir):
            for name in files:
                if not name.lower().endswith('.glb'):
                    continue
                key = os.path.splitext(name)[0]
                path = os.path.join(root, name)
                t = bigtex if key in big else tex
                before, after = lite(path, path + '.tmp', t, q)
                os.replace(path + '.tmp', path)
                a += before
                b += after
                print(f'{key:10s} {t:5d}  {before / 1048576:6.1f}MB -> {after / 1048576:5.1f}MB')
        print(f'合计 {a / 1048576:.1f}MB -> {b / 1048576:.1f}MB')
    else:
        before, after = lite(ARGS[0], ARGS[1], int(OPT.get('tex', '1024')), q)
        print(f'{before / 1048576:.1f}MB -> {after / 1048576:.1f}MB')


if __name__ == '__main__':
    main()
