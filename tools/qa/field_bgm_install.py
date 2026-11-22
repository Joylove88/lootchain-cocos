# -*- coding: utf-8 -*-
"""把选定的野外 BGM 循环段装进游戏(2026-11-22,配合 field_bgm_ace.py / field_bgm_pick.py)。

  python -I tools/qa/field_bgm_install.py VILLAGE=<loop.wav> WOODS=<loop.wav> ...
loop.wav = field_bgm_pick.py 产出的 picks/<图>_<名次>_loop.wav(已无缝、-16 dBFS、峰值 ≤ -1 dBFS)。
产物:assets/resources/audio/bgm/bgm_field_<图小写>.mp3(44.1 kHz 立体声 160k,LAME 头带无缝信息),
文件名和 LobbyWorldMaps.ts 里各图的 bgm 键对应;同名覆盖不用动 meta。
装完解码回来自检:时长和原循环段差多少样点、首尾接缝跳变(浏览器按 LAME 头裁掉编码延迟后才无缝)。
"""
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DST = os.path.join(ROOT, 'assets', 'resources', 'audio', 'bgm')
SR = 44100


def main():
    pairs = [a.split('=', 1) for a in sys.argv[1:] if '=' in a]
    if not pairs:
        raise SystemExit(__doc__)
    for code, src in pairs:
        key = f'bgm_field_{code.lower()}'
        out = os.path.join(DST, key + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ar', str(SR), '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '160k', out], check=True)
        # 自检:原循环段(重采样后)长度 vs 解码长度;解码后首尾接缝
        sr0, a = wavfile.read(src)
        want = int(round(len(a) * SR / sr0))
        tmp = os.path.join(tempfile.gettempdir(), key + '_check.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, tmp], check=True)
        sr1, b = wavfile.read(tmp)
        os.remove(tmp)
        x = b.astype(np.float32) / 32768
        jump = float(np.abs(x[-1] - x[0]).max())
        k = int(0.02 * SR)
        db = lambda v: 20 * math.log10(math.sqrt(float(np.mean(v ** 2))) + 1e-12)
        print(f'{key}: {os.path.getsize(out) / 1e6:.2f} MB, {len(x) / SR:.1f}s, 解码长度差 {len(x) - want:+d} 样点, '
              f'接缝跳变 {jump:.4f}, 首尾 20ms 响度差 {db(x[-k:]) - db(x[:k]):+.1f} dB, 响度 {db(x):.1f} dBFS')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
