# -*- coding: utf-8 -*-
"""给带骨骼的 .glb 出一个手机用的低配版:减面 + 缩贴图。只用 numpy 和 PIL,不联网、不花积分。

  python -I tools/proto3d/char3d/glb_lod.py <输入.glb> <输出.glb> [--tris=12000] [--tex=1024]

减面用的是「顶点聚类」这种粗办法(不是建模软件那种逐边折叠):
- 把模型切成小格子,同一格里的顶点并成一个(位置取这一格的平均),落在同一格里的三角形就没了;格子大小自动试,试到面数接近目标;
- 同一格里贴图坐标离得远的顶点不并(贴图接缝两边各留一个,位置相同),所以不裂缝、贴图不串;
- 骨骼权重取离格子中心最近的那个原始顶点的,动作照常能播。
细节掉得比专业减面多(脸、手指最明显),只适合「手机上能不能跑」这种验证和远处的角色;正式要用的低模还是得从源头出(生成时限面数,或者建模软件里减)。
贴图:颜色 / 法线 / 粗糙度金属度三张都缩到 --tex 那么大(原来是 4096,一张在显存里就是 64MB 以上)。
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
TARGET = int(OPT.get('tris', '12000'))
TEX = int(OPT.get('tex', '1024'))
UVCELLS = 24

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def read_glb(path):
    data = open(path, 'rb').read()
    magic, _version, length = struct.unpack_from('<4sII', data, 0)
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
    return doc, binary


def view_bytes(doc, binary, index):
    bv = doc['bufferViews'][index]
    start = bv.get('byteOffset', 0)
    return binary[start: start + bv['byteLength']]


def read_accessor(doc, binary, index):
    acc = doc['accessors'][index]
    if 'sparse' in acc:
        raise SystemExit('不支持稀疏存取器')
    dtype = np.dtype(CT[acc['componentType']])
    n = NC[acc['type']]
    bv = doc['bufferViews'][acc['bufferView']]
    start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride') or dtype.itemsize * n
    count = acc['count']
    raw = np.frombuffer(binary, dtype=np.uint8, count=(count - 1) * stride + dtype.itemsize * n, offset=start)
    if stride == dtype.itemsize * n:
        arr = raw.view(dtype).reshape(count, n)
    else:
        idx = (np.arange(count)[:, None] * stride + np.arange(dtype.itemsize * n)[None, :]).reshape(-1)
        arr = raw[idx].view(dtype).reshape(count, n)
    return np.array(arr)


def simplify(pos, uv, tri, cell):
    """返回 (每个原始顶点并到哪个新顶点, 新三角形, 每个新顶点所在的格子号, 每个原始顶点的格子号)。"""
    lo = pos.min(axis=0)
    g = np.floor((pos - lo) / cell).astype(np.int64)
    dims = g.max(axis=0) + 1
    cid = (g[:, 0] * dims[1] + g[:, 1]) * dims[2] + g[:, 2]
    if uv is not None:
        q = np.floor(np.clip(uv, -4, 4) * UVCELLS).astype(np.int64) + 4 * UVCELLS
        key = (cid * (8 * UVCELLS + 1) + q[:, 0]) * (8 * UVCELLS + 1) + q[:, 1]
    else:
        key = cid
    _uniq, new_of = np.unique(key, return_inverse=True)
    cell_of_new = np.zeros(new_of.max() + 1, dtype=np.int64)
    cell_of_new[new_of] = cid
    t = new_of[tri]
    c = cell_of_new[t]
    keep = (c[:, 0] != c[:, 1]) & (c[:, 1] != c[:, 2]) & (c[:, 0] != c[:, 2])      # 两个角落在同一格 = 面积为零
    t = t[keep]
    # 去掉重复的三角形(不看起点,保留绕向)
    rot = np.argmin(t, axis=1)
    rows = np.arange(len(t))
    canon = np.stack([t[rows, rot], t[rows, (rot + 1) % 3], t[rows, (rot + 2) % 3]], axis=1)
    canon = np.unique(canon, axis=0)
    return new_of, canon, cell_of_new, cid


def lod_primitive(doc, binary, prim, out_views):
    attrs = prim['attributes']
    pos = read_accessor(doc, binary, attrs['POSITION']).astype(np.float64)
    uv = read_accessor(doc, binary, attrs['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in attrs else None
    tri = read_accessor(doc, binary, prim['indices']).reshape(-1, 3).astype(np.int64)
    before = len(tri)
    if before <= TARGET:
        return before, before
    # 格子大小二分:面数随格子变大单调变少
    size = float((pos.max(axis=0) - pos.min(axis=0)).max())
    lo, hi = size / 2000, size / 8
    best = None
    for _ in range(26):
        mid = (lo * hi) ** 0.5
        res = simplify(pos, uv, tri, mid)
        n = len(res[1])
        if best is None or abs(n - TARGET) < abs(len(best[1]) - TARGET):
            best = res
        if n > TARGET:
            lo = mid
        else:
            hi = mid
        if abs(n - TARGET) < TARGET * 0.02:
            break
    new_of, new_tri, cell_of_new, cid = best
    nv = len(cell_of_new)
    # 每格的平均位置;每个新顶点的位置 = 所在格的平均位置(同格不同贴图坐标的几个新顶点位置相同 → 不裂缝)
    ucell, cinv = np.unique(cid, return_inverse=True)
    csum = np.zeros((len(ucell), 3))
    np.add.at(csum, cinv, pos)
    cmean = csum / np.bincount(cinv)[:, None]
    mean_of_old = cmean[cinv]
    # 每个新顶点的「代表」= 这一组里离格子中心最近的原始顶点(骨骼权重等直接抄它的)
    dist = ((pos - mean_of_old) ** 2).sum(axis=1)
    order = np.lexsort((dist, new_of))
    first = np.ones(len(order), dtype=bool)
    first[1:] = new_of[order][1:] != new_of[order][:-1]
    rep = np.zeros(nv, dtype=np.int64)
    rep[new_of[order][first]] = order[first]
    cnt = np.bincount(new_of, minlength=nv).astype(np.float64)

    def mean_attr(a):
        s = np.zeros((nv, a.shape[1]))
        np.add.at(s, new_of, a.astype(np.float64))
        return s / cnt[:, None]

    for name, index in list(attrs.items()):
        acc = doc['accessors'][index]
        arr = read_accessor(doc, binary, index)
        if name == 'POSITION':
            out = mean_of_old[rep].astype(np.float32)
        elif name == 'NORMAL':
            m = mean_attr(arr)
            ln = np.linalg.norm(m, axis=1)
            bad = ln < 1e-6
            m[bad] = arr[rep][bad]
            ln[bad] = 1
            out = (m / ln[:, None]).astype(np.float32)
        elif name == 'TEXCOORD_0' and arr.dtype == np.float32:
            out = mean_attr(arr).astype(np.float32)
        else:
            out = arr[rep]
        new_acc = dict(acc)
        new_acc.pop('byteOffset', None)
        new_acc['count'] = nv
        if name == 'POSITION':
            new_acc['min'] = [float(v) for v in out.min(axis=0)]
            new_acc['max'] = [float(v) for v in out.max(axis=0)]
        else:
            new_acc.pop('min', None)
            new_acc.pop('max', None)
        out_views.append((np.ascontiguousarray(out).tobytes(), 34962))
        new_acc['bufferView'] = -len(out_views)          # 先记成负数,写文件时换成真的编号
        doc['accessors'].append(new_acc)
        attrs[name] = len(doc['accessors']) - 1
    idx = new_tri.reshape(-1)
    small = nv <= 65535
    out_views.append((idx.astype(np.uint16 if small else np.uint32).tobytes(), 34963))
    doc['accessors'].append({'bufferView': -len(out_views), 'componentType': 5123 if small else 5125, 'count': int(len(idx)), 'type': 'SCALAR'})
    prim['indices'] = len(doc['accessors']) - 1
    return before, len(new_tri)


def main():
    src, dst = ARGS[0], ARGS[1]
    doc, binary = read_glb(src)
    out_views = []          # 新加的数据块:(字节, 用途)
    stats = []
    for mesh in doc.get('meshes', []):
        for prim in mesh['primitives']:
            if prim.get('mode', 4) != 4 or 'indices' not in prim:
                continue
            if prim.get('targets'):
                raise SystemExit('带变形目标的网格没处理')
            stats.append(lod_primitive(doc, binary, prim, out_views))
    # 贴图
    images = {}
    for i, img in enumerate(doc.get('images', [])):
        if 'bufferView' not in img:
            continue
        raw = view_bytes(doc, binary, img['bufferView'])
        im = Image.open(io.BytesIO(raw))
        w, h = im.size
        if max(w, h) > TEX:
            k = TEX / max(w, h)
            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            buf = io.BytesIO()
            if img.get('mimeType') == 'image/png':
                im.save(buf, 'PNG', optimize=True)
            else:
                im.convert('RGB').save(buf, 'JPEG', quality=90)
            images[i] = buf.getvalue()
            stats.append(('tex', img.get('name', i), (w, h), im.size, len(raw), len(buf.getvalue())))
    # 重排二进制块:只留还在用的数据块,新加的接在后面
    used = set()
    for acc in doc['accessors']:
        if acc.get('bufferView', -1) >= 0:
            used.add(acc['bufferView'])
    live = set()
    for mesh in doc.get('meshes', []):
        for prim in mesh['primitives']:
            live.update(prim['attributes'].values())
            if 'indices' in prim:
                live.add(prim['indices'])
    for skin in doc.get('skins', []):
        if 'inverseBindMatrices' in skin:
            live.add(skin['inverseBindMatrices'])
    for anim in doc.get('animations', []):
        for smp in anim['samplers']:
            live.add(smp['input'])
            live.add(smp['output'])
    used = {doc['accessors'][i]['bufferView'] for i in live if doc['accessors'][i].get('bufferView', -1) >= 0}
    for i, img in enumerate(doc.get('images', [])):
        if 'bufferView' in img:
            used.add(img['bufferView'])
    blob = bytearray()
    views = []
    remap = {}

    def add(data, base):
        while len(blob) % 4:
            blob.append(0)
        v = dict(base)
        v['buffer'] = 0
        v['byteOffset'] = len(blob)
        v['byteLength'] = len(data)
        blob.extend(data)
        views.append(v)
        return len(views) - 1

    img_view = {img['bufferView']: i for i, img in enumerate(doc.get('images', [])) if 'bufferView' in img}
    for old in sorted(used):
        bv = doc['bufferViews'][old]
        base = {k: v for k, v in bv.items() if k not in ('buffer', 'byteOffset', 'byteLength')}
        data = images.get(img_view[old]) if old in img_view and img_view[old] in images else view_bytes(doc, binary, old)
        remap[old] = add(data, base)
    extra = [add(data, {'target': target}) for data, target in out_views]
    for i, acc in enumerate(doc['accessors']):
        bvi = acc.get('bufferView')
        if bvi is None:
            continue
        if bvi < 0:
            acc['bufferView'] = extra[-bvi - 1]
        elif bvi in remap:
            acc['bufferView'] = remap[bvi]
        else:
            # 没人用的旧存取器(被换掉的顶点 / 索引):指到一块空数据上,免得读文件的工具报越界
            acc['bufferView'] = remap[min(remap)] if i not in live and remap else bvi
            acc['count'] = 0 if i not in live else acc['count']
            acc.pop('byteOffset', None)
            acc.pop('min', None)
            acc.pop('max', None)
    for img in doc.get('images', []):
        if 'bufferView' in img:
            img['bufferView'] = remap[img['bufferView']]
    doc['bufferViews'] = views
    while len(blob) % 4:
        blob.append(0)
    doc['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack('<II', len(blob), 0x004E4942))
        f.write(bytes(blob))
    for s in stats:
        print(s)
    print('写出', dst, '%.2f MB' % (len(blob) / 1048576))


if __name__ == '__main__':
    main()
