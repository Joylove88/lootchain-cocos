# -*- coding: utf-8 -*-
"""量一个 .glb 里某个动作片段「哪一段是真正在挥 / 在射」:按时间把骨架摆出来,算某根骨头(默认右手)每一刻的移动速度。

为什么要有:平台给的预设动作很长(挥砍 6.6 秒、射击 9 秒),战斗里一次出手只有零点几秒,
要从长片段里截出「蓄势 → 出手 → 收」那一小段来播。这个脚本打印速度曲线和最快的几段,截哪里看它定。

用法:python -I clip_motion.py <文件.glb> <动作名里的词> [--bone=RightHand] [--step=0.05] [--json]
只用标准库;读的是下载来的文件,按规矩带 -I 跑。
"""
import json
import math
import struct
import sys

CTYPE = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    data = open(path, 'rb').read()
    magic, _version, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF':
        raise SystemExit('不是 glb 文件')
    off, doc, binary = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            doc = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binary = chunk
        off += 8 + clen
    return doc, binary


def accessor(doc, binary, index):
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    fmt, size = CTYPE[acc['componentType']]
    n = NCOMP[acc['type']]
    stride = view.get('byteStride') or size * n
    base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    out = []
    for i in range(acc['count']):
        out.append(struct.unpack_from('<' + fmt * n, binary, base + i * stride))
    return out


def q_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


def q_rot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    tx, ty, tz = 2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx)
    return (vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx))


def q_slerp(a, b, t):
    dot = sum(x * y for x, y in zip(a, b))
    if dot < 0:
        b = tuple(-x for x in b)
        dot = -dot
    if dot > 0.9995:
        r = tuple(x + (y - x) * t for x, y in zip(a, b))
    else:
        th = math.acos(dot)
        s = math.sin(th)
        r = tuple((math.sin((1 - t) * th) * x + math.sin(t * th) * y) / s for x, y in zip(a, b))
    n = math.sqrt(sum(x * x for x in r)) or 1
    return tuple(x / n for x in r)


def sample(times, values, t, rot):
    if t <= times[0]:
        return values[0]
    if t >= times[-1]:
        return values[-1]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= t:
            lo = mid
        else:
            hi = mid
    k = (t - times[lo]) / max(1e-9, times[hi] - times[lo])
    if rot:
        return q_slerp(values[lo], values[hi], k)
    return tuple(a + (b - a) * k for a, b in zip(values[lo], values[hi]))


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        raise SystemExit(__doc__)
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    bone_word = opt.get('bone', 'RightHand')
    step = float(opt.get('step', '0.05'))
    doc, binary = read_glb(args[0])
    nodes = doc['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    anim = next((a for a in doc.get('animations', []) if args[1].lower() in a.get('name', '').lower()), None)
    if not anim:
        raise SystemExit('没有这个动作;有的是:' + ', '.join(a.get('name', '?') for a in doc.get('animations', [])))
    target = next((i for i, n in enumerate(nodes) if n.get('name', '').endswith(bone_word)), None)
    if target is None:
        target = next((i for i, n in enumerate(nodes) if bone_word.lower() in n.get('name', '').lower()), None)
    if target is None:
        raise SystemExit('没有这根骨头:' + bone_word)
    tracks = {}
    duration = 0.0
    for ch in anim['channels']:
        s = anim['samplers'][ch['sampler']]
        times = [v[0] for v in accessor(doc, binary, s['input'])]
        values = accessor(doc, binary, s['output'])
        tracks[(ch['target']['node'], ch['target']['path'])] = (times, values)
        duration = max(duration, times[-1])

    def local(i, t):
        n = nodes[i]
        tr = tracks.get((i, 'translation'))
        ro = tracks.get((i, 'rotation'))
        sc = tracks.get((i, 'scale'))
        p = sample(tr[0], tr[1], t, False) if tr else tuple(n.get('translation', (0, 0, 0)))
        q = sample(ro[0], ro[1], t, True) if ro else tuple(n.get('rotation', (0, 0, 0, 1)))
        s = sample(sc[0], sc[1], t, False) if sc else tuple(n.get('scale', (1, 1, 1)))
        return p, q, s

    def world(i, t):
        chain = []
        while i is not None:
            chain.append(i)
            i = parent.get(i)
        pos, rot, scl = (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0), (1.0, 1.0, 1.0)
        for j in reversed(chain):
            p, q, s = local(j, t)
            scaled = (p[0] * scl[0], p[1] * scl[1], p[2] * scl[2])
            r = q_rot(rot, scaled)
            pos = (pos[0] + r[0], pos[1] + r[1], pos[2] + r[2])
            rot = q_mul(rot, q)
            scl = (scl[0] * s[0], scl[1] * s[1], scl[2] * s[2])
        return pos

    samples = []
    prev = None
    t = 0.0
    while t <= duration + 1e-6:
        p = world(target, t)
        v = 0.0 if prev is None else math.dist(p, prev) / step
        samples.append((round(t, 3), p, v))
        prev = p
        t += step
    if opt.get('json'):
        print(json.dumps({'clip': anim['name'], 'duration': duration, 'bone': nodes[target]['name'], 'samples': [[s[0], [round(x, 3) for x in s[1]], round(s[2], 2)] for s in samples]}))
        return
    peak = max(s[2] for s in samples) or 1
    print(f"动作 {anim['name']}  时长 {duration:.2f} 秒  骨头 {nodes[target]['name']}  每 {step} 秒一格(速度单位:米 / 秒,模型原始大小)")
    for tt, p, v in samples:
        bar = '#' * int(round(v / peak * 50))
        print(f'{tt:6.2f}  x {p[0]:6.2f} y {p[1]:6.2f} z {p[2]:6.2f}  v {v:5.2f} {bar}')
    # 最快的几段:速度超过峰值 35% 的连续区间
    runs, cur = [], None
    for tt, _p, v in samples:
        if v >= peak * 0.35:
            cur = [tt, tt, v] if cur is None else [cur[0], tt, max(cur[2], v)]
        elif cur is not None:
            runs.append(cur)
            cur = None
    if cur is not None:
        runs.append(cur)
    print('最快的几段(速度 ≥ 峰值 35%):' + '  '.join(f'{a:.2f}~{b:.2f} 秒(峰值 {m:.1f})' for a, b, m in runs))


if __name__ == '__main__':
    main()
