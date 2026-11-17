# -*- coding: utf-8 -*-
"""看一个 glb 里的骨架和动作:节点树(名字 / 位移 / 朝向)、每根骨头在站姿下指向哪、每个动作多长。

  python -I tools/proto3d/char3d/glb_peek.py <模型.glb> [--tree] [--anims] [--dirs]

转套动作(mixamo_retarget.py)之前用它核对两副骨架:名字对不对得上、站姿是 T 还是 A、面朝哪、单位是米还是厘米。
"""
import json
import struct
import sys

import numpy as np


def load(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF', path
    off = 12
    js = None
    binc = b''
    while off < len(b):
        n, t = struct.unpack_from('<I4s', b, off)
        body = b[off + 8: off + 8 + n]
        if t == b'JSON':
            js = json.loads(body.decode('utf-8'))
        elif t == b'BIN\x00':
            binc = body
        off += 8 + n
    return js, binc


CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(js, binc, i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']])
    nc = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0)
    if stride and stride != dt.itemsize * nc:
        raw = np.frombuffer(binc, dtype=np.uint8, count=stride * a['count'], offset=off).reshape(a['count'], stride)
        out = np.frombuffer(raw[:, :dt.itemsize * nc].tobytes(), dtype=dt).reshape(a['count'], nc)
    else:
        out = np.frombuffer(binc, dtype=dt, count=a['count'] * nc, offset=off).reshape(a['count'], nc)
    return out.astype(np.float64) if dt == np.float32 else out


def qmat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local(node):
    m = np.eye(4)
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    m[:3, :3] = qmat(node.get('rotation', [0, 0, 0, 1])) * np.array(node.get('scale', [1, 1, 1]))[None, :]
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m


def world(js):
    nodes = js['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    out = {}

    def w(i):
        if i not in out:
            m = local(nodes[i])
            out[i] = w(parent[i]) @ m if i in parent else m
        return out[i]
    for i in range(len(nodes)):
        w(i)
    return out, parent


def main():
    path = sys.argv[1]
    opts = set(a for a in sys.argv[2:] if a.startswith('--'))
    js, binc = load(path)
    nodes = js['nodes']
    wm, parent = world(js)
    print(path, 'nodes', len(nodes), 'meshes', len(js.get('meshes', [])), 'skins', len(js.get('skins', [])), 'anims', len(js.get('animations', [])))
    if '--tree' in opts:
        def depth(i):
            return 0 if i not in parent else depth(parent[i]) + 1
        for i, n in enumerate(nodes):
            t = n.get('translation', [0, 0, 0])
            r = n.get('rotation', [0, 0, 0, 1])
            s = n.get('scale', [1, 1, 1])
            print('%3d %s%s  t=%s r=%s%s' % (i, '  ' * depth(i), n.get('name', '?'), np.round(t, 3).tolist(), np.round(r, 3).tolist(),
                                            '' if np.allclose(s, 1) else ' s=%s' % np.round(s, 4).tolist()))
    if '--dirs' in opts:
        name = {n.get('name', ''): i for i, n in enumerate(nodes)}
        keys = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm',
                'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
        for k in keys:
            i = next((v for n, v in name.items() if n.split(':')[-1] == k), None)
            if i is None:
                print('  missing', k)
                continue
            p = wm[i][:3, 3]
            kids = nodes[i].get('children', [])
            d = ''
            if kids:
                c = wm[kids[0]][:3, 3] - p
                ln = np.linalg.norm(c)
                d = ' -> %s dir=%s len=%.3f' % (nodes[kids[0]].get('name', ''), np.round(c / max(ln, 1e-9), 2).tolist(), ln)
            print('  %-14s pos=%s%s' % (k, np.round(p, 3).tolist(), d))
    if '--anims' in opts:
        for a in js.get('animations', []):
            tmax = 0
            n = 0
            paths = {}
            for ch in a['channels']:
                s = a['samplers'][ch['sampler']]
                t = acc(js, binc, s['input'])
                tmax = max(tmax, float(t.max()))
                n = max(n, len(t))
                paths[ch['target']['path']] = paths.get(ch['target']['path'], 0) + 1
            print('  anim %-28s %.3fs keys<=%d %s' % (a.get('name', '?'), tmax, n, paths))


if __name__ == '__main__':
    main()
