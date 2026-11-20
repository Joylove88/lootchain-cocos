"""统计 GLB 模型的性能账:三角形 / 顶点 / 贴图尺寸 / 显存(未压缩 vs 压缩格式估算)/ 文件大小。

用法:python tools/proto3d/char3d/glb_budget.py <目录或文件> [...] [--json=out.json]
只读,不改任何文件。只依赖标准库 + PIL(读贴图尺寸)。

显存估算口径(含 mip 链 ×4/3):
  RGBA8 未压缩 = 4 字节/像素(引擎现在就是这样上传 JPEG/PNG 解码后的贴图)
  ASTC 6x6 = 3.56 bit/像素(手机常用);ETC2 RGB = 4 bit;BC7 = 8 bit(电脑);BC1 = 4 bit
"""
import io
import json
import os
import struct
import sys

from PIL import Image

COMP = {4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3}  # 无关,保留
MIP = 4.0 / 3.0


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, path
    off = 12
    js = None
    binc = b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc, len(data)


def model_stats(path):
    js, binc, size = read_glb(path)
    acc = js.get('accessors', [])
    tris = 0
    verts = 0
    prims = 0
    for m in js.get('meshes', []):
        for p in m.get('primitives', []):
            prims += 1
            mode = p.get('mode', 4)
            pos = p['attributes'].get('POSITION')
            if pos is not None:
                verts += acc[pos]['count']
            if 'indices' in p:
                n = acc[p['indices']]['count']
            else:
                n = acc[pos]['count'] if pos is not None else 0
            if mode == 4:
                tris += n // 3
    texs = []
    bvs = js.get('bufferViews', [])
    for i, img in enumerate(js.get('images', [])):
        if 'bufferView' in img:
            bv = bvs[img['bufferView']]
            raw = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
            try:
                im = Image.open(io.BytesIO(raw))
                w, h = im.size
            except Exception:
                w = h = 0
            texs.append({'w': w, 'h': h, 'bytes': len(raw), 'mime': img.get('mimeType', '')})
    px = sum(t['w'] * t['h'] for t in texs)
    return {
        'file': path, 'mb': round(size / 1048576, 2), 'tris': tris, 'verts': verts, 'prims': prims,
        'skinned': bool(js.get('skins')), 'anims': len(js.get('animations', [])),
        'tex': [f"{t['w']}x{t['h']}" for t in texs], 'tex_mb_file': round(sum(t['bytes'] for t in texs) / 1048576, 2),
        'vram_rgba8_mb': round(px * 4 * MIP / 1048576, 1),
        'vram_astc6_mb': round(px * 3.56 / 8 * MIP / 1048576, 1),
        'vram_bc7_mb': round(px * 1 * MIP / 1048576, 1),
        'vram_etc2_mb': round(px * 0.5 * MIP / 1048576, 1),
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = None
    for a in sys.argv[1:]:
        if a.startswith('--json='):
            out = a[7:]
    rows = []
    for a in args:
        if os.path.isdir(a):
            for root, _, files in os.walk(a):
                for fn in sorted(files):
                    if fn.lower().endswith('.glb'):
                        rows.append(model_stats(os.path.join(root, fn)))
        elif a.lower().endswith('.glb'):
            rows.append(model_stats(a))
    for r in rows:
        print(f"{os.path.relpath(r['file']):70s} {r['mb']:7.2f}MB tris {r['tris']:7d} verts {r['verts']:7d} "
              f"tex {','.join(r['tex']):40s} vram {r['vram_rgba8_mb']:7.1f} / astc {r['vram_astc6_mb']:6.1f} / bc7 {r['vram_bc7_mb']:6.1f}")
    if out:
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
