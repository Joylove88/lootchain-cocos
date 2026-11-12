# -*- coding: utf-8 -*-
"""看一个 .glb 里有什么:面数 / 顶点数、材质和贴图(尺寸、格式、占多少字节)、骨骼数、动作(名字、时长)、包围盒。只用标准库。

用法:python -I glb_info.py <文件.glb> [--json]
(读的是下载来的文件,按规矩带 -I 跑)
"""
import json
import struct
import sys


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF':
        raise SystemExit('不是 glb 文件')
    off = 12
    doc, binary = None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            doc = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binary = chunk
        off += 8 + clen
    return doc, binary, len(data)


def image_size(buf):
    if buf[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack_from('>II', buf, 16)
        return 'png', w, h
    if buf[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(buf):
            if buf[i] != 0xFF:
                i += 1
                continue
            marker = buf[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack_from('>HH', buf, i + 5)
                return 'jpeg', w, h
            seg = struct.unpack_from('>H', buf, i + 2)[0]
            i += 2 + seg
        return 'jpeg', 0, 0
    if buf[:4] == b'RIFF' and buf[8:12] == b'WEBP':
        return 'webp', 0, 0
    if buf[:12] == b'\xabKTX 20\xbb\r\n\x1a\n':
        return 'ktx2', 0, 0
    return 'unknown', 0, 0


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    doc, binary, size = read_glb(sys.argv[1])
    acc = doc.get('accessors', [])
    views = doc.get('bufferViews', [])
    tris = verts = prims = 0
    lo = [1e30] * 3
    hi = [-1e30] * 3
    attrs = set()
    for mesh in doc.get('meshes', []):
        for p in mesh.get('primitives', []):
            prims += 1
            a = acc[p['attributes']['POSITION']]
            verts += a['count']
            attrs.update(p['attributes'].keys())
            if 'min' in a and 'max' in a:
                lo = [min(lo[i], a['min'][i]) for i in range(3)]
                hi = [max(hi[i], a['max'][i]) for i in range(3)]
            if 'indices' in p:
                tris += acc[p['indices']]['count'] // 3
            else:
                tris += a['count'] // 3
    images = []
    for im in doc.get('images', []):
        if 'bufferView' in im:
            v = views[im['bufferView']]
            buf = binary[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
            kind, w, h = image_size(buf)
            images.append({'name': im.get('name', ''), 'type': kind, 'w': w, 'h': h, 'kb': v['byteLength'] // 1024})
        else:
            images.append({'name': im.get('name', ''), 'uri': im.get('uri', '')[:60]})
    mats = []
    for m in doc.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        mats.append({
            'name': m.get('name', ''),
            'baseColor': 'baseColorTexture' in pbr, 'metalRough': 'metallicRoughnessTexture' in pbr,
            'normal': 'normalTexture' in m, 'occlusion': 'occlusionTexture' in m, 'emissive': 'emissiveTexture' in m,
            'metallicFactor': pbr.get('metallicFactor', 1), 'roughnessFactor': pbr.get('roughnessFactor', 1),
            'alphaMode': m.get('alphaMode', 'OPAQUE'), 'doubleSided': m.get('doubleSided', False),
        })
    skins = [{'name': s.get('name', ''), 'joints': len(s.get('joints', []))} for s in doc.get('skins', [])]
    nodes = doc.get('nodes', [])
    joint_names = []
    for s in doc.get('skins', []):
        joint_names = [nodes[j].get('name', '') for j in s.get('joints', [])]
        break
    anims = []
    for a in doc.get('animations', []):
        dur = 0.0
        for s in a.get('samplers', []):
            inp = acc[s['input']]
            if 'max' in inp:
                dur = max(dur, inp['max'][0])
        anims.append({'name': a.get('name', ''), 'seconds': round(dur, 2), 'channels': len(a.get('channels', []))})
    info = {
        'file_mb': round(size / 1048576, 2),
        'generator': doc.get('asset', {}).get('generator', ''),
        'extensionsUsed': doc.get('extensionsUsed', []),
        'extensionsRequired': doc.get('extensionsRequired', []),
        'meshes': len(doc.get('meshes', [])), 'primitives': prims, 'triangles': tris, 'vertices': verts,
        'attributes': sorted(attrs),
        'bounds_min': [round(v, 3) for v in lo], 'bounds_max': [round(v, 3) for v in hi],
        'size_xyz': [round(hi[i] - lo[i], 3) for i in range(3)],
        'materials': mats, 'images': images, 'skins': skins, 'animations': anims,
        'nodes': len(nodes), 'root_nodes': [nodes[i].get('name', '') for sc in doc.get('scenes', [])[:1] for i in sc.get('nodes', [])],
    }
    if '--json' in sys.argv:
        print(json.dumps(info, ensure_ascii=False, indent=2))
        return
    print(f"文件 {info['file_mb']} MB,生成器「{info['generator']}」,扩展 {info['extensionsUsed']}(必需 {info['extensionsRequired']})")
    print(f"网格 {info['meshes']} 个 / {prims} 段,三角面 {tris:,},顶点 {verts:,},顶点属性 {info['attributes']}")
    print(f"包围盒 最小 {info['bounds_min']} 最大 {info['bounds_max']} → 尺寸 xyz {info['size_xyz']}")
    for m in mats:
        print('材质', m)
    for im in images:
        print('贴图', im)
    print('骨架', skins, '根节点', info['root_nodes'])
    if joint_names:
        print('骨骼名', ', '.join(joint_names[:80]) + (' …' if len(joint_names) > 80 else ''))
    for a in anims:
        print('动作', a)


if __name__ == '__main__':
    main()
