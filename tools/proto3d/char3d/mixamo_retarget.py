# -*- coding: utf-8 -*-
"""把 Mixamo 动作库的片段转套到我们自己的人形模型上,出一个「只有动作」的 glb + 一份说明数据。

  python -I tools/proto3d/char3d/mixamo_retarget.py <Mixamo 动作的 glb 目录> <我们的模型.glb> <输出目录>
        [--sheet=<预览图目录>] [--only=gs_cut1,gs_spin]

来源:mixamo.com 的动作包(FBX Binary,默认角色,T-pose,30 帧,不做关键帧精简;用 Adobe 账号在网站上下载,文件不进仓库)。
先用 Creator 自带的转换器把每个 FBX 转成 glb(文件名里的空格和括号换成下划线,如 great_sword_slash_2.glb):
  <Creator>/resources/app.asar.unpacked/node_modules/@cocos/fbx-gltf-conv/bin/win32/FBX-glTF-conv.exe --out <输出.glb> <输入.fbx>
现在的文件:D:\\project\\lootchain-3d-ref\\mixamo\\(great_sword_pack.zip 原包、great_sword_pack\\ 解压的 FBX、gltf\\ 转好的 glb);
输出放 D:\\project\\lootchain-3d-ref\\chars\\<键>\\moves\\,由 stage_chars.py 和模型一起临时拷进工程(assets/resources/g3d_moves/<键>/)。
两副骨架名字一样(mixamorig:*),但站姿不同(Mixamo 是 T 姿势、面朝 +z;我们的模型是 A 姿势、面朝 +x)、骨头自己的轴也不同,
所以不能把片段直接拿来播,要逐帧换算:

- 每根骨头取「相对站姿在世界里转了多少」(Mixamo 那边),换到我们的朝向里,再乘到我们这根骨头的站姿上;
- 我们的站姿先「摆成 T 姿势」:肩 / 上臂 / 小臂 / 大腿 / 小腿按骨头指向对齐,手掌按「指向 + 掌面」两个方向对齐,手指跟着手掌;脚不动(脚掌本来就平);
- 胯的高低和前后左右按腿长的比例缩放;
- 位移单独抽出来:胯在水平面上走过的路(平滑过)存进数据,片段里只留身体的晃动 —— 游戏里人是逻辑在挪,照着这条路挪就不滑步;
- 大剑是双手握的:左手按 Mixamo 里两只手的相对位置,重新解一遍左臂(两段),让左手还握在剑柄上(我们的小臂比 Mixamo 的短)。

输出:
  moves.glb   我们模型的骨架(没有网格)+ 每个招式一个动作片段(名字见 CLIPS)
  moves_data.json  每个片段:多长、位移轨迹(每帧 [往前, 往右] 米)、剑尖最快的时刻、刀光区间;剑在右手里的方向和握点(右手自己的坐标)
"""
import json
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_peek import acc, load  # noqa: E402

FPS = 30
# 输出的片段名 → Mixamo 文件名(不带扩展名)、是不是循环的。片段名避开 idle / walk / run / slash 这些词(模型自带的片段按词找)。
CLIPS = [
    ('gs_stand', 'great_sword_idle', True),
    ('gs_jog', 'great_sword_run', True),
    ('gs_jog2', 'great_sword_run_2', True),
    ('gs_step', 'great_sword_walk', True),
    # 11-18 用户嫌待机 / 跑「佝偻着身子」:把包里另外几种待机、走路也转进来挑
    ('gs_stand2', 'great_sword_idle_2', True),
    ('gs_stand3', 'great_sword_idle_3', True),
    ('gs_stand4', 'great_sword_idle_4', True),
    ('gs_stand5', 'great_sword_idle_5', True),
    ('gs_step2', 'great_sword_walk_2', True),
    ('gs_cut1', 'great_sword_slash', False),
    ('gs_cut2', 'great_sword_slash_2', False),
    ('gs_cut3', 'great_sword_slash_3', False),
    ('gs_cut4', 'great_sword_slash_4', False),
    ('gs_cut5', 'great_sword_slash_5', False),
    ('gs_atk', 'great_sword_attack', False),
    ('gs_spin', 'great_sword_high_spin_attack', False),
    ('gs_leap', 'great_sword_jump_attack', False),
    ('gs_slide', 'great_sword_slide_attack', False),
    ('gs_kick1', 'great_sword_kick', False),
    ('gs_kick2', 'great_sword_kick_2', False),
    ('gs_cast', 'great_sword_casting', False),
    ('gs_power', 'great_sword_power_up', False),
    ('gs_spell', 'spell_cast', False),
    ('gs_hit1', 'great_sword_impact', False),
    ('gs_hit2', 'great_sword_impact_2', False),
    ('gs_block', 'great_sword_blocking', False),
    ('gs_draw', 'draw_a_great_sword_1', False),
    ('gs_down', 'two_handed_sword_death', False),
]

# Mixamo 的世界 → 我们模型的世界:前(+z)→ +x,上不变,Mixamo 的 +x(角色左手边)→ −z
M = np.array([[0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [-1.0, 0.0, 0.0]])


# ───────────────────────── 四元数 / 矩阵 ─────────────────────────
def q2m(q):
    q = np.asarray(q, dtype=np.float64)
    q = q / np.linalg.norm(q, axis=-1, keepdims=True)
    x, y, z, w = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    m = np.empty(q.shape[:-1] + (3, 3))
    m[..., 0, 0] = 1 - 2 * (y * y + z * z)
    m[..., 0, 1] = 2 * (x * y - z * w)
    m[..., 0, 2] = 2 * (x * z + y * w)
    m[..., 1, 0] = 2 * (x * y + z * w)
    m[..., 1, 1] = 1 - 2 * (x * x + z * z)
    m[..., 1, 2] = 2 * (y * z - x * w)
    m[..., 2, 0] = 2 * (x * z - y * w)
    m[..., 2, 1] = 2 * (y * z + x * w)
    m[..., 2, 2] = 1 - 2 * (x * x + y * y)
    return m


def m2q(m):
    m = np.asarray(m, dtype=np.float64)
    out = np.empty(m.shape[:-2] + (4,))
    flat = m.reshape(-1, 3, 3)
    o = out.reshape(-1, 4)
    for i, r in enumerate(flat):
        t = r[0, 0] + r[1, 1] + r[2, 2]
        if t > 0:
            s = np.sqrt(t + 1.0) * 2
            q = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, 0.25 * s]
        elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
            s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
            q = [0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
        elif r[1, 1] > r[2, 2]:
            s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
            q = [(r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
        else:
            s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
            q = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s, (r[1, 0] - r[0, 1]) / s]
        o[i] = q
    return out


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.maximum(1e-12, np.linalg.norm(v, axis=-1, keepdims=True))


def arc(a, b):
    """把方向 a 转到方向 b 的最短转动(3×3)。"""
    a = unit(a)
    b = unit(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c < -0.999999:
        ax = unit(np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1, 0]))
        return 2 * np.outer(ax, ax) - np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k * (1 / (1 + c))


def frame2(y, x):
    """两个方向定一个朝向:y 为主,x 取和 y 垂直的那一份。列 = [x, y, z]。"""
    y = unit(y)
    x = unit(x - y * np.dot(x, y))
    return np.stack([x, y, np.cross(x, y)], axis=1)


# ───────────────────────── 骨架 ─────────────────────────
class Skel:
    def __init__(self, js):
        self.js = js
        nodes = js['nodes']
        self.n = len(nodes)
        self.names = [nd.get('name', '') for nd in nodes]
        self.short = [nm.split(':')[-1] for nm in self.names]
        self.parent = [-1] * self.n
        for i, nd in enumerate(nodes):
            for c in nd.get('children', []):
                self.parent[c] = i
        self.t = np.array([nd.get('translation', [0, 0, 0]) for nd in nodes], dtype=np.float64)
        self.q = np.array([nd.get('rotation', [0, 0, 0, 1]) for nd in nodes], dtype=np.float64)
        self.s = np.array([nd.get('scale', [1, 1, 1]) for nd in nodes], dtype=np.float64)
        self.r = q2m(self.q)
        order = []

        def walk(i):
            order.append(i)
            for c in nodes[i].get('children', []):
                walk(c)
        for i in range(self.n):
            if self.parent[i] < 0:
                walk(i)
        self.order = order
        self.idx = {}
        for i, nm in enumerate(self.short):
            self.idx.setdefault(nm, i)

    def fk(self, rot, hips_pos=None, hips=None):
        """rot:[F, n, 3, 3] 每根骨头自己的转动;返回世界转动 [F, n, 3, 3] 和世界位置 [F, n, 3]。"""
        F = rot.shape[0]
        wr = np.empty_like(rot)
        wp = np.empty((F, self.n, 3))
        for i in self.order:
            p = self.parent[i]
            t = np.broadcast_to(self.t[i], (F, 3))
            if hips is not None and i == hips:
                t = hips_pos
            if p < 0:
                wr[:, i] = rot[:, i]
                wp[:, i] = t
            else:
                wr[:, i] = wr[:, p] @ rot[:, i]
                wp[:, i] = wp[:, p] + np.einsum('fij,fj->fi', wr[:, p], t * self.s[p] if False else t)
        return wr, wp


def resample(times, vals, grid, quat):
    times = np.asarray(times).reshape(-1)
    idx = np.clip(np.searchsorted(times, grid, side='right') - 1, 0, len(times) - 1)
    nxt = np.clip(idx + 1, 0, len(times) - 1)
    span = np.maximum(1e-9, times[nxt] - times[idx])
    k = np.clip((grid - times[idx]) / span, 0, 1)[:, None]
    a = vals[idx]
    b = vals[nxt]
    if quat:
        sign = np.where(np.sum(a * b, axis=1, keepdims=True) < 0, -1.0, 1.0)
        out = a + (b * sign - a) * k
        return out / np.linalg.norm(out, axis=1, keepdims=True)
    return a + (b - a) * k


def read_clip(path):
    """一个 Mixamo 片段 → 骨架、每帧每根骨头自己的转动、胯的位置。"""
    js, binc = load(path)
    sk = Skel(js)
    an = js['animations'][0]
    tmax = 0.0
    chans = []
    for ch in an['channels']:
        s = an['samplers'][ch['sampler']]
        t = acc(js, binc, s['input']).reshape(-1)
        v = acc(js, binc, s['output'])
        tmax = max(tmax, float(t.max()))
        chans.append((ch['target']['node'], ch['target']['path'], t, v))
    F = int(round(tmax * FPS)) + 1
    grid = np.arange(F) / FPS
    rot = np.broadcast_to(sk.r, (F, sk.n, 3, 3)).copy()
    hips = sk.idx['Hips']
    hp = np.broadcast_to(sk.t[hips], (F, 3)).copy()
    for node, path, t, v in chans:
        if path == 'rotation':
            rot[:, node] = q2m(resample(t, v, grid, True))
        elif path == 'translation' and node == hips:
            hp = resample(t, v, grid, False)
    return sk, rot, hp, F


def smooth(x, sigma):
    r = int(sigma * 3) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([np.repeat(x[:1], r, axis=0), x, np.repeat(x[-1:], r, axis=0)])
    return np.stack([np.convolve(pad[:, c], k, mode='valid') for c in range(x.shape[1])], axis=1)


def sstep(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


# ───────────────────────── 主流程 ─────────────────────────
def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    src, hero_path, out = args[0], args[1], args[2]
    only = set(opt['only'].split(',')) if 'only' in opt else None
    os.makedirs(out, exist_ok=True)
    hjs, _ = load(hero_path)
    hero = Skel(hjs)
    H = hero.idx
    hero_rest_rot = np.broadcast_to(hero.r, (1, hero.n, 3, 3)).copy()
    hwr0, hwp0 = hero.fk(hero_rest_rot)
    hwr0, hwp0 = hwr0[0], hwp0[0]

    # Mixamo 站姿(哪个片段的都一样)
    dsk, _, _, _ = read_clip(os.path.join(src, CLIPS[0][1] + '.glb'))
    Dx = dsk.idx
    dwr0, dwp0 = dsk.fk(np.broadcast_to(dsk.r, (1, dsk.n, 3, 3)).copy())
    dwr0, dwp0 = dwr0[0], dwp0[0]
    missing = [nm for nm in dsk.short if nm not in H]
    assert not missing, missing

    def hdir(a, b):
        return unit(hwp0[H[b]] - hwp0[H[a]])

    def ddir(a, b):
        return M @ unit(dwp0[Dx[b]] - dwp0[Dx[a]])

    # 把我们的站姿摆成 T 姿势:C[骨头] = 站姿上再乘的一次转动(世界里)。默认跟父骨头的一样(整段一起带过去)。
    C = np.broadcast_to(np.eye(3), (hero.n, 3, 3)).copy()
    chain = {}
    for side in ('Left', 'Right'):
        chain[side + 'Shoulder'] = side + 'Arm'
        chain[side + 'Arm'] = side + 'ForeArm'
        chain[side + 'ForeArm'] = side + 'Hand'
        chain[side + 'UpLeg'] = side + 'Leg'
        chain[side + 'Leg'] = side + 'Foot'
    keep = set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'])
    for i in hero.order:
        nm = hero.short[i]
        p = hero.parent[i]
        if nm not in Dx or nm in keep:
            continue
        base = C[p] if p >= 0 else np.eye(3)
        if nm in chain:
            C[i] = arc(base @ hdir(nm, chain[nm]), ddir(nm, chain[nm])) @ base
        elif nm in ('LeftHand', 'RightHand'):
            fh = frame2(hdir(nm, nm + 'Middle1'), hwp0[H[nm + 'Index1']] - hwp0[H[nm + 'Pinky1']])
            fd = frame2(ddir(nm, nm + 'Middle1'), M @ (dwp0[Dx[nm + 'Index1']] - dwp0[Dx[nm + 'Pinky1']]))
            C[i] = fd @ fh.T
        else:
            C[i] = base
    Rt = np.einsum('nij,njk->nik', C, hwr0)          # 我们的骨头「T 姿势下」在世界里的朝向

    leg_h = np.linalg.norm(hwp0[H['LeftLeg']] - hwp0[H['LeftUpLeg']]) + np.linalg.norm(hwp0[H['LeftFoot']] - hwp0[H['LeftLeg']])
    leg_d = np.linalg.norm(dwp0[Dx['LeftLeg']] - dwp0[Dx['LeftUpLeg']]) + np.linalg.norm(dwp0[Dx['LeftFoot']] - dwp0[Dx['LeftLeg']])
    S = leg_h / leg_d
    hand_k = np.linalg.norm(hwp0[H['RightHandMiddle1']] - hwp0[H['RightHand']]) / np.linalg.norm(dwp0[Dx['RightHandMiddle1']] - dwp0[Dx['RightHand']])
    palm_k = np.linalg.norm(hwp0[H['RightHandIndex1']] - hwp0[H['RightHandPinky1']]) / np.linalg.norm(dwp0[Dx['RightHandIndex1']] - dwp0[Dx['RightHandPinky1']])
    print('腿长比 %.3f  手掌长度比 %.3f  手掌宽度比 %.3f' % (S, hand_k, palm_k))

    # 握点:手腕到中指根的中点,再往掌心一侧 2.5 厘米(Mixamo 手自己的坐标里)
    def grip_local(side):
        hd = Dx[side + 'Hand']
        mid = (dwp0[Dx[side + 'HandMiddle1']] - dwp0[hd]) * 0.55
        across = dwp0[Dx[side + 'HandIndex1']] - dwp0[Dx[side + 'HandPinky1']]
        palm = unit(np.cross(across, mid)) * (1 if side == 'Right' else -1)          # T 姿势下掌心朝下
        if palm[1] > 0:
            palm = -palm
        return dwr0[hd].T @ (mid + palm * 0.025)

    gR = grip_local('Right')
    gL = grip_local('Left')

    # 剑在右手里的方向:双手握着的时候,从左手握点指向右手握点(左手在剑柄尾、右手靠护手)。拿待机片段量。
    dsk2, drot, dhp, F = read_clip(os.path.join(src, 'great_sword_idle.glb'))
    dwr, dwp = dsk2.fk(drot, dhp, Dx['Hips'])
    pr = dwp[:, Dx['RightHand']] + np.einsum('fij,j->fi', dwr[:, Dx['RightHand']], gR)
    pl = dwp[:, Dx['LeftHand']] + np.einsum('fij,j->fi', dwr[:, Dx['LeftHand']], gL)
    ax = np.einsum('fji,fj->fi', dwr[:, Dx['RightHand']], unit(pr - pl))
    axis_d = unit(ax.mean(axis=0))
    spread = np.degrees(np.arccos(np.clip(ax @ axis_d, -1, 1)))
    print('剑的方向(Mixamo 右手坐标)', np.round(axis_d, 3).tolist(), '各帧偏差 平均 %.1f° 最大 %.1f°' % (spread.mean(), spread.max()),
          ' 两手间距 %.3f~%.3f 米' % (np.linalg.norm(pr - pl, axis=1).min(), np.linalg.norm(pr - pl, axis=1).max()))
    if 'axis' in opt:
        axis_d = unit(np.array([float(v) for v in opt['axis'].split(',')]))
        print('  改用指定的方向', axis_d.tolist())
    hR = H['RightHand']
    conv = Rt[hR].T @ M @ dwr0[Dx['RightHand']]          # Mixamo 右手坐标 → 我们右手坐标
    axis_h = conv @ axis_d
    grip_h = conv @ gR * hand_k
    convL = Rt[H['LeftHand']].T @ M @ dwr0[Dx['LeftHand']]
    gripL_h = convL @ gL * hand_k

    meta = {'fps': FPS, 'source': 'mixamo.com Great Sword Pack', 'sword': {'axis': np.round(axis_h, 4).tolist(), 'grip': np.round(grip_h, 4).tolist()}, 'clips': {}}
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    built = []
    sheet = opt.get('sheet')
    for name, fname, loop in CLIPS:
        if only and name not in only:
            continue
        path = os.path.join(src, fname + '.glb')
        if not os.path.exists(path):
            print('没有', fname)
            continue
        dsk, drot, dhp, F = read_clip(path)
        dwr, dwp = dsk.fk(drot, dhp, Dx['Hips'])
        # 位移:胯的水平轨迹。循环片段只去掉匀速的那一份;一次性的招式取平滑过的轨迹。
        h = np.stack([dhp[:, 2], -dhp[:, 0]], axis=1) * S            # [往前, 往右]
        if loop:
            root = np.outer(np.arange(F) / max(1, F - 1), h[-1] - h[0])
        else:
            sm = smooth(h, 4.0)
            root = sm - sm[0]
        resid = h - root
        hips_pos = np.empty((F, 3))
        hips_pos[:, 0] = hero.t[H['Hips']][0] + resid[:, 0] - (h[0, 0] if loop else 0) * 0
        hips_pos[:, 1] = hero.t[H['Hips']][1] + (dhp[:, 1] - dsk.t[Dx['Hips']][1]) * S
        hips_pos[:, 2] = hero.t[H['Hips']][2] + resid[:, 1]
        # 每根骨头:世界里相对站姿的转动 → 我们的世界朝向
        hw = np.broadcast_to(hwr0, (F, hero.n, 3, 3)).copy()
        for i in range(hero.n):
            nm = hero.short[i]
            if nm in Dx:
                d = dwr[:, Dx[nm]] @ dwr0[Dx[nm]].T
                hw[:, i] = M @ d @ M.T @ Rt[i]

        def locals_of(hw_):
            loc = np.empty_like(hw_)
            for i in range(hero.n):
                p = hero.parent[i]
                loc[:, i] = hw_[:, i] if p < 0 else np.einsum('fji,fjk->fik', hw_[:, p], hw_[:, i])
            return loc

        loc = locals_of(hw)
        _, hp_ = hero.fk(loc, hips_pos, H['Hips'])
        # 左手握回剑柄:按 Mixamo 里两只手握点的相对位置定目标,重新解左臂两段
        dpr = dwp[:, Dx['RightHand']] + np.einsum('fij,j->fi', dwr[:, Dx['RightHand']], gR)
        dpl = dwp[:, Dx['LeftHand']] + np.einsum('fij,j->fi', dwr[:, Dx['LeftHand']], gL)
        gap = np.linalg.norm(dpr - dpl, axis=1)
        hold = smooth((1 - sstep(0.26, 0.4, gap))[:, None], 1.5)[:, 0]
        rel = np.einsum('ij,fj->fi', M, dpl - dpr) * palm_k          # 两只手在剑柄上隔多远:按手掌的宽度比(一拳挨一拳)
        grip_r = hp_[:, hR] + np.einsum('fij,j->fi', hw[:, hR], grip_h)
        lh = H['LeftHand']
        la, lf = H['LeftArm'], H['LeftForeArm']
        target = grip_r + rel - np.einsum('fij,j->fi', hw[:, lh], gripL_h)
        l1 = np.linalg.norm(hwp0[lf] - hwp0[la])
        l2 = np.linalg.norm(hwp0[lh] - hwp0[lf])
        moved = 0.0
        for f in range(F):
            if hold[f] < 0.01:
                continue
            Sp = hp_[f, la]
            T = hp_[f, lh] + (target[f] - hp_[f, lh]) * hold[f]
            moved = max(moved, float(np.linalg.norm(T - hp_[f, lh])))
            d = T - Sp
            raw = np.linalg.norm(d)
            dist = min(l1 + l2 - 0.003, max(abs(l1 - l2) + 0.003, raw))
            d = d / raw
            cosA = np.clip((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1)
            e = hp_[f, lf] - Sp
            pole = e - d * np.dot(e, d)
            pole = unit(pole) if np.linalg.norm(pole) > 1e-5 else unit(np.cross(d, [0, 1, 0]))
            E = Sp + l1 * (d * cosA + pole * np.sqrt(1 - cosA * cosA))
            T2 = Sp + d * dist
            hw[f, la] = arc(hp_[f, lf] - Sp, E - Sp) @ hw[f, la]
            hw[f, lf] = arc(hp_[f, lh] - hp_[f, lf], T2 - E) @ hw[f, lf]
        loc = locals_of(hw)
        wr_, hp_ = hero.fk(loc, hips_pos, H['Hips'])
        grip_r = hp_[:, hR] + np.einsum('fij,j->fi', wr_[:, hR], grip_h)
        blade = np.einsum('fij,j->fi', wr_[:, hR], axis_h)
        tip = grip_r + blade * 1.3 + np.stack([root[:, 0], np.zeros(F), root[:, 1]], axis=1)
        speed = np.concatenate([[0], np.linalg.norm(np.diff(tip, axis=0), axis=1) * FPS])
        speed = smooth(speed[:, None], 1.0)[:, 0]
        peak = int(np.argmax(speed))
        fast = np.where(speed > max(6.0, speed.max() * 0.45))[0]
        yaw = np.degrees(np.arctan2(-(hw[:, H['Hips']] @ np.array([1.0, 0, 0]))[:, 2], (hw[:, H['Hips']] @ np.array([1.0, 0, 0]))[:, 0]))
        foot = min(hp_[:, H['LeftToeBase'], 1].min(), hp_[:, H['RightToeBase'], 1].min()) - hwp0[H['LeftToeBase'], 1]
        info = {
            'dur': round((F - 1) / FPS, 4), 'frames': F, 'loop': loop,
            'root': np.round(root, 3).tolist(),
            'peak': round(peak / FPS, 3), 'peakSpeed': round(float(speed[peak]), 1),
            'fast': [round(float(fast[0]) / FPS, 3), round(float(fast[-1]) / FPS, 3)] if len(fast) else None,
            'yawEnd': round(float(yaw[-1] - yaw[0]), 1),
            'hipsY': [round(float(hips_pos[:, 1].min() - hero.t[H['Hips']][1]), 3), round(float(hips_pos[:, 1].max() - hero.t[H['Hips']][1]), 3)],
        }
        meta['clips'][name] = info
        print('%-9s %-30s %.2fs 位移 前 %+.2f 右 %+.2f  剑尖最快 %.2fs(%.0f 米/秒)快的区间 %s  朝向变了 %+.0f°  胯高低 %s  脚尖最低 %+.3f  左手握着 %d%% 最多挪 %.2f 米' % (
            name, fname, info['dur'], root[-1, 0], root[-1, 1], info['peak'], info['peakSpeed'], info['fast'], info['yawEnd'], info['hipsY'], foot,
            round(100 * float((hold > 0.5).mean())), moved))
        built.append((name, loc, hips_pos, F))
        if sheet:
            draw_sheet(os.path.join(sheet, name + '.png'), name, hero, hp_, grip_r, blade, root, speed, info)
    write_glb(os.path.join(out, 'moves.glb'), hjs, hero, built)
    with open(os.path.join(out, 'moves_data.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False, separators=(',', ':'))
    print('写出', os.path.join(out, 'moves.glb'), os.path.getsize(os.path.join(out, 'moves.glb')), '字节;', len(built), '个片段')


# ───────────────────────── 预览图(火柴人) ─────────────────────────
def draw_sheet(path, name, hero, wp, grip, blade, root, speed, info):
    from PIL import Image, ImageDraw
    F = wp.shape[0]
    step = max(1, int(np.ceil(F / 24)))
    frames = list(range(0, F, step))
    cw, chh = 190, 170
    im = Image.new('RGB', (cw * len(frames), chh * 2 + 16), (14, 15, 20))
    dr = ImageDraw.Draw(im)
    sc = 62
    for k, f in enumerate(frames):
        ox = k * cw + cw // 2
        r = np.array([root[f, 0], 0, root[f, 1]])
        hot = speed[f] > max(6.0, speed.max() * 0.45)
        for view in (0, 1):
            oy = 16 + (chh - 16 if view == 0 else chh * 2 - chh // 2)

            def pt(p):
                q = p + r - np.array([root[f, 0], 0, 0]) * 0
                if view == 0:          # 侧面:横 = 往前,纵 = 往上
                    return (ox + (q[0] - root[f, 0]) * sc, oy - q[1] * sc)
                return (ox + (q[0] - root[f, 0]) * sc, oy + (q[2] - root[f, 1]) * sc)          # 俯视:横 = 往前,纵 = 往右
            for i in range(hero.n):
                p = hero.parent[i]
                nm = hero.short[i]
                if p < 0 or hero.short[p] == 'Armature' or 'Hand' in nm and nm not in ('LeftHand', 'RightHand') or nm.startswith('tripo'):
                    continue
                col = (235, 120, 110) if nm.startswith('Right') else (110, 170, 240) if nm.startswith('Left') else (210, 210, 210)
                dr.line([pt(wp[f, p]), pt(wp[f, i])], fill=col, width=2)
            dr.line([pt(grip[f] - blade[f] * 0.25), pt(grip[f] + blade[f] * 1.3)], fill=(255, 230, 90) if hot else (150, 150, 120), width=3 if hot else 2)
            if view == 0:
                dr.line([(k * cw, oy), ((k + 1) * cw, oy)], fill=(60, 60, 70))
        dr.text((k * cw + 4, 2), '%.2fs %+.2fm' % (f / FPS, root[f, 0]), fill=(255, 235, 120))
    dr.text((4, chh * 2 + 2), '%s  %.2fs  peak %.2fs  fast %s  yawEnd %s' % (name, info['dur'], info['peak'], info['fast'], info['yawEnd']), fill=(160, 220, 160))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


# ───────────────────────── 写 glb ─────────────────────────
def write_glb(path, hjs, hero, built):
    nodes = []
    for nd in hjs['nodes']:
        c = {k: v for k, v in nd.items() if k in ('name', 'children', 'translation', 'rotation', 'scale', 'matrix')}
        nodes.append(c)
    blob = bytearray()
    views = []
    accs = []

    def add(arr, typ, minmax=False):
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        while len(blob) % 4:
            blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': arr.nbytes})
        blob.extend(arr.tobytes())
        a = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = [float(arr.min())]
            a['max'] = [float(arr.max())]
        accs.append(a)
        return len(accs) - 1

    anims = []
    bones = [i for i in range(hero.n) if hero.names[i].startswith('mixamorig:')]
    hips = hero.idx['Hips']
    for name, loc, hips_pos, F in built:
        t = add(np.arange(F) / FPS, 'SCALAR', True)
        t2 = add(np.array([0.0, (F - 1) / FPS]), 'SCALAR', True)
        samplers = []
        channels = []
        for i in bones:
            q = m2q(loc[:, i])
            for f in range(1, F):
                if np.dot(q[f], q[f - 1]) < 0:
                    q[f] = -q[f]
            samplers.append({'input': t, 'output': add(q, 'VEC4'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': i, 'path': 'rotation'}})
            if i == hips:
                samplers.append({'input': t, 'output': add(hips_pos, 'VEC3'), 'interpolation': 'LINEAR'})
            else:
                samplers.append({'input': t2, 'output': add(np.stack([hero.t[i], hero.t[i]]), 'VEC3'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': i, 'path': 'translation'}})
            samplers.append({'input': t2, 'output': add(np.stack([hero.s[i], hero.s[i]]), 'VEC3'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': i, 'path': 'scale'}})
        anims.append({'name': name, 'samplers': samplers, 'channels': channels})
    while len(blob) % 4:
        blob.append(0)
    js = {
        'asset': {'version': '2.0', 'generator': 'lootchain mixamo_retarget.py'},
        'scene': 0, 'scenes': hjs['scenes'], 'nodes': nodes, 'animations': anims,
        'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accs,
    }
    body = json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    while len(body) % 4:
        body += b' '
    with open(path, 'wb') as fp:
        fp.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(body) + 8 + len(blob)))
        fp.write(struct.pack('<I4s', len(body), b'JSON'))
        fp.write(body)
        fp.write(struct.pack('<I4s', len(blob), b'BIN\x00'))
        fp.write(bytes(blob))


if __name__ == '__main__':
    main()
