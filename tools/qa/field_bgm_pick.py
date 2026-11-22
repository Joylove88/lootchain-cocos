# -*- coding: utf-8 -*-
"""野外 BGM 候选筛选 + 找循环点(2026-11-22,配合 field_bgm_ace.py)。

我听不到,只能量:每版先过质检(长静音 / 削波 / 响度忽大忽小 / 结尾突兀),再按节拍网格找一对「前后最像」的点
当循环起止(整小节、循环 ≥ 50 秒、避开前奏和尾声),接缝处按波形互相关对齐 + 短交叉淡变,做成无缝循环。

  python -I tools/qa/field_bgm_pick.py [图码…] [--top 3] [--copy <目录>] [--tag 实验名]
读 %TEMP%/lootchain-qa/field_bgm_ace/<图>/*.wav 和 runs.jsonl;产物在同目录 picks/:
  <图>_<序号>_loop.wav(游戏用的循环段)/ <图>_<序号>_preview.mp3(从头放 → 循环一遍多 → 淡出,能听到接缝)+ picks.json。
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa'), 'field_bgm_ace')
FSR = 22050      # 分析用采样率
HOP = 512


def load(path):
    sr, a = wavfile.read(path)
    if a.dtype == np.int16:
        x = a.astype(np.float32) / 32768
    elif a.dtype == np.int32:
        x = a.astype(np.float32) / 2147483648
    else:
        x = a.astype(np.float32)
    if x.ndim == 1:
        x = x[:, None]
    return sr, x


def db(v):
    return 20 * math.log10(math.sqrt(float(np.mean(v ** 2))) + 1e-12)


def features(mono, sr):
    y = signal.resample_poly(mono, FSR, sr).astype(np.float32)
    f, t, S = signal.stft(y, FSR, nperseg=2048, noverlap=2048 - HOP)
    M = np.abs(S)
    # 色度
    sel = (f > 60) & (f < 5000)
    pcs = (np.round(69 + 12 * np.log2(f[sel] / 440)).astype(int)) % 12
    chroma = np.zeros((12, M.shape[1]))
    for k in range(12):
        chroma[k] = (M[sel][pcs == k] ** 2).sum(0)
    chroma = np.log1p(chroma * 50)
    # 简易梅尔能量(32 带)
    edges = np.geomspace(40, 10000, 33)
    mel = np.stack([np.log1p((M[(f >= lo) & (f < hi)] ** 2).sum(0) * 100) for lo, hi in zip(edges[:-1], edges[1:])])
    # 起音包络
    lm = np.log1p(M * 100)
    onset = np.maximum(0, np.diff(lm, axis=1, prepend=lm[:, :1])).sum(0)
    return chroma, mel, onset


def beat_grid(onset, bpm, n_frames):
    per = 60 / bpm * FSR / HOP
    best, phase = -1, 0.0
    for ph in np.linspace(0, per, 48, endpoint=False):
        idx = np.round(np.arange(ph, n_frames - 1, per)).astype(int)
        s = onset[idx].sum()
        if s > best:
            best, phase = s, ph
    return np.arange(phase, n_frames - 1, per)


def qc(x, sr):
    mono = x.mean(1)
    w = int(0.4 * sr)
    n = len(mono) // w
    st = 10 * np.log10((mono[: n * w].reshape(n, w) ** 2).mean(1) + 1e-12)
    body = st[int(3 / 0.4): max(int(3 / 0.4) + 1, n - int(4 / 0.4))]
    med = float(np.median(body))
    gaps = int((body < med - 30).sum())           # 主体里明显掉空的 0.4 秒段数
    jumpy = float(np.percentile(body, 95) - np.percentile(body, 5))
    clip = int((np.abs(x) > 0.995).sum())
    end_drop = float(st[-3:].mean() - med)        # 结尾是否收住(越负越像有尾声)
    return {'dur': round(len(mono) / sr, 1), 'rms_db': round(db(mono), 1), 'peak_db': round(20 * math.log10(float(np.abs(x).max()) + 1e-12), 1),
            'gaps': gaps, 'dyn_db': round(jumpy, 1), 'clip': clip, 'end_drop_db': round(end_drop, 1)}


def find_loop(x, sr, bpm, min_loop=50.0, head_skip=6.0, tail_skip=6.0):
    mono = x.mean(1)
    chroma, mel, onset = features(mono, sr)
    nf = chroma.shape[1]
    beats = beat_grid(onset, bpm, nf)
    if len(beats) < 40:
        return None
    # 每拍的特征(色度 + 能量,各自标准化)
    bi = np.round(beats).astype(int)
    seg = lambda A: np.stack([A[:, a:b].mean(1) for a, b in zip(bi[:-1], bi[1:])])
    C = seg(chroma)
    E = seg(mel)
    C = C / (np.linalg.norm(C, axis=1, keepdims=True) + 1e-9)
    E = (E - E.mean(0)) / (E.std(0) + 1e-9)
    E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    nb = len(C)
    bt = beats[:-1] * HOP / FSR                     # 每拍起点(秒)
    spb = 60 / bpm
    K = 8                                           # 比较前后各 8 拍
    # 每拍响度(dB):上面的特征都按拍归一化了,不看绝对音量,接缝两边一响一轻会很突兀,单独罚
    edges_s = np.append(bt, bt[-1] + spb)
    L = np.array([db(mono[int(a * sr): max(int(a * sr) + 1, int(b * sr))]) for a, b in zip(edges_s[:-1], edges_s[1:])])
    # 掉空的拍:0.2 秒一格,比主体中位响度低 30 dB 的格落在哪拍,那拍就算掉空(按拍算会把 0.4 秒的停顿平均掉)
    g = int(0.2 * sr)
    ng = len(mono) // g
    st = 10 * np.log10((mono[: ng * g].reshape(ng, g) ** 2).mean(1) + 1e-12)
    gap_t = (np.where(st < np.median(st) - 30)[0] + 0.5) * 0.2
    gapb = np.zeros(nb, int)
    for t in gap_t:
        k = int(np.searchsorted(bt, t, side='right')) - 1
        if 0 <= k < nb:
            gapb[k] = 1
    gcum = np.concatenate([[0], np.cumsum(gapb)])
    seam_w = max(1, int(round(2.0 / spb)))           # 接缝前后约 2 秒的拍数
    best = None
    lo = int(np.searchsorted(bt, head_skip))
    hi = int(np.searchsorted(bt, bt[-1] - tail_skip))
    min_beats = int(math.ceil(min_loop / spb))
    for i in range(max(lo, K), hi):
        for j in range(i + min_beats, min(hi, nb - K)):
            if (j - i) % 4:
                continue
            sc = 0.6 * float((C[i - K:i + K] * C[j - K:j + K]).sum(1).mean()) + 0.4 * float((E[i - K:i + K] * E[j - K:j + K]).sum(1).mean())
            sc += 0.03 if (j - i) % 16 == 0 else 0.0          # 整 4 小节(一个乐句)加分
            sc += 0.02 * min(1.0, (bt[j] - bt[i]) / 100.0)    # 循环长一点好(不容易听腻)
            sc -= 0.04 * float(np.abs(L[i - K:i + K] - L[j - K:j + K]).mean())   # 接缝两边响度差,平均差 3 dB 扣 0.12
            sc -= 0.15 * float(gcum[j] - gcum[i])             # 循环段里每个掉空的拍扣 0.15
            # 接缝处(循环尾前 2 秒 → 循环头后 2 秒)的直接响度差,超过 1.5 dB 的部分每 dB 扣 0.03
            le =10 * math.log10(float(np.mean(10 ** (L[j - seam_w:j] / 10))) + 1e-12)
            ls = 10 * math.log10(float(np.mean(10 ** (L[i:i + seam_w] / 10))) + 1e-12)
            sc -= 0.03 * max(0.0, abs(le - ls) - 1.5)
            if best is None or sc > best[0]:
                best = (sc, i, j)
    if not best:
        return None
    sc, i, j = best
    le = 10 * math.log10(float(np.mean(10 ** (L[j - seam_w:j] / 10))) + 1e-12)
    ls = 10 * math.log10(float(np.mean(10 ** (L[i:i + seam_w] / 10))) + 1e-12)
    a, b = int(bt[i] * sr), int(bt[j] * sr)
    # 接缝微调:j 附近 ±25ms 找和 i 处波形最像的位置
    w = int(0.025 * sr)
    ref = mono[a: a + int(0.05 * sr)]
    win = mono[b - w: b + w + len(ref)]
    if len(win) > len(ref) and len(ref) > 0:
        cc = signal.correlate(win, ref, mode='valid')
        nrm = np.sqrt(signal.correlate(win ** 2, np.ones(len(ref)), mode='valid')) * np.sqrt((ref ** 2).sum()) + 1e-9
        b = b - w + int(np.argmax(cc / nrm))
    return {'score': round(float(sc), 3), 'start_s': round(a / sr, 2), 'end_s': round(b / sr, 2), 'loop_s': round((b - a) / sr, 1),
            'seam_db': round(le - ls, 1), 'gaps_in_loop': int(gcum[j] - gcum[i]),
            # 接缝两边响度差 > 3 dB 时改用 2 拍(最多 2 秒)的交叉淡变,让音量过渡得像自然的强弱变化
            'xf_ms': int(min(2 * spb, 2.0) * 1000) if abs(le - ls) > 3 else 60, 'a': a, 'b': b}


def make_loop(x, sr, a, b, xf_ms=60):
    k = int(xf_ms / 1000 * sr)
    loop = x[a:b].copy()
    t = np.linspace(0, np.pi / 2, k, dtype=np.float32)[:, None]
    loop[-k:] = x[b - k:b] * np.cos(t) + x[a - k:a] * np.sin(t)    # 尾巴渐渐换成「循环起点之前」那段,接回开头就是原曲的连续
    return loop


def to_mp3(wav, mp3):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', mp3], check=True)


def main():
    args = sys.argv[1:]
    top = int(args[args.index('--top') + 1]) if '--top' in args else 3
    copy = args[args.index('--copy') + 1] if '--copy' in args else None
    tag = args[args.index('--tag') + 1] if '--tag' in args else ''
    root = os.path.join(OUT, tag) if tag else OUT          # 实验批(field_bgm_ace.py --tag)
    runs = {}
    rp = os.path.join(root, 'runs.jsonl')
    if os.path.exists(rp):
        for line in open(rp, encoding='utf-8'):
            r = json.loads(line)
            runs[os.path.basename(r['file'])] = r
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from field_bgm_ace import MAPS
    codes = [a for a in args if a in MAPS] or list(MAPS)
    allpicks = {}
    for code in codes:
        d = os.path.join(root, code)
        if not os.path.isdir(d):
            continue
        pd = os.path.join(d, 'picks')
        os.makedirs(pd, exist_ok=True)
        rows = []
        for fn in sorted(os.listdir(d)):
            if not fn.endswith('.wav'):
                continue
            sr, x = load(os.path.join(d, fn))
            q = qc(x, sr)
            lp = find_loop(x, sr, MAPS[code]['bpm'])
            bad = q['gaps'] > 3 or q['clip'] > 200 or q['dyn_db'] > 22 or lp is None
            score = (lp['score'] if lp else 0) - 0.05 * max(0, q['gaps']) - (0.3 if bad else 0)
            rows.append({'file': fn, 'qc': q, 'loop': {k: v for k, v in (lp or {}).items() if k not in ('a', 'b')}, 'bad': bad,
                         'score': round(score, 3), 'run': runs.get(fn, {}), '_lp': lp})
            print(code, fn, q, {k: v for k, v in (lp or {}).items() if k not in ('a', 'b')}, 'BAD' if bad else '', flush=True)
        rows.sort(key=lambda r: -r['score'])
        for rank, r in enumerate([r for r in rows if not r['bad']][:top], 1):
            sr, x = load(os.path.join(d, r['file']))
            lp = r['_lp']
            loop = make_loop(x, sr, lp['a'], lp['b'], lp['xf_ms'])
            # 统一响度 -16 dBFS(峰值 ≤ -1 dBFS)
            g = 10 ** ((-16 - db(loop.mean(1))) / 20)
            loop = loop * g
            pk = float(np.abs(loop).max())
            if pk > 0.891:
                loop *= 0.891 / pk
                g *= 0.891 / pk
            stem = os.path.join(pd, f'{code}_{rank}')
            wavfile.write(stem + '_loop.wav', sr, (np.clip(loop, -1, 1) * 32767).astype(np.int16))
            # 试听:原曲开头到循环起点 → 循环段 → 再放 40 秒(听接缝)→ 淡出
            pre = x[:lp['a']] * g
            tail = loop[: int(40 * sr)].copy()
            fo = int(5 * sr)
            tail[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
            pv = np.concatenate([pre, loop, tail])
            wavfile.write(stem + '_preview.wav', sr, (np.clip(pv, -1, 1) * 32767).astype(np.int16))
            to_mp3(stem + '_preview.wav', stem + '_preview.mp3')
            os.remove(stem + '_preview.wav')
            r['rank'] = rank
            r['preview'] = stem + '_preview.mp3'
            r['loop_wav'] = stem + '_loop.wav'
            r['seam_at_s'] = round(len(pre) / sr + len(loop) / sr, 1)
        for r in rows:
            r.pop('_lp', None)
        allpicks[code] = rows
        if copy:
            os.makedirs(copy, exist_ok=True)
            import shutil
            for r in rows:
                if r.get('rank'):
                    shutil.copy2(r['preview'], os.path.join(copy, os.path.basename(r['preview'])))
    with open(os.path.join(root, "picks.json"), 'w', encoding='utf-8') as f:
        json.dump(allpicks, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
