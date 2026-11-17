# -*- coding: utf-8 -*-
"""地宫小样 · 程序化音效自检(常驻预览 dungeon_dev.py start 要先起着;不需要模型)。

  python tools/proto3d/dungeon/snd_check.py <输出目录> [--space=hall|open]

做三件事(都是离线渲染,不经过声卡,无头浏览器里也能跑):
1. 每个声音单独渲染一遍,量峰值、响度、长度,有没有削波(峰值到顶)或者没声;
2. 出一段试听带 <输出目录>/试听_<space>.wav:每个声音各放两遍,带环境声;
3. 把试听带画成频谱图 <输出目录>/频谱_<space>.png(横 = 时间,纵 = 频率,越亮越响;图上标了每个声音的名字)。
我听不到声音,只能看数和看图;好不好听要人来听。
"""
import base64
import io
import json
import os
import struct
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
DEV = os.path.join(HERE, 'dungeon_dev.py')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
OUT = ARGS[0]
SPACE = OPT.get('space', 'hall')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def dev(*a):
    r = subprocess.run([sys.executable, DEV] + list(a), capture_output=True, cwd=ROOT)
    return (r.stdout or b'').decode('utf-8', errors='replace').strip()


def last_json(text):
    i = text.rfind('\n{')
    return json.loads(text[i + 1:] if i >= 0 else text[text.index('{'):])


os.makedirs(OUT, exist_ok=True)
st = last_json(dev('eval', "return JSON.stringify(await D.audio.selftest('%s'));" % SPACE))
print('%-12s %6s %7s %6s' % ('声音', '峰值', '响度', '秒'))
for k, v in st.items():
    print('%-12s %6.3f %7.4f %6.2f %s' % (k, v['peak'], v['rms'], v['secs'], '' if v['ok'] else '  ← 有问题'))
reel = last_json(dev('eval', "const r = await D.audio.reel('%s'); return JSON.stringify(r);" % SPACE))
raw = base64.b64decode(reel['wav'])
wav = os.path.join(OUT, '试听_%s.wav' % SPACE)
open(wav, 'wb').write(raw)
n = (len(raw) - 44) // 4
pcm = np.frombuffer(raw, dtype='<i2', count=n * 2, offset=44).reshape(n, 2).astype(np.float64) / 32768
mono = pcm.mean(axis=1)
sr = struct.unpack_from('<I', raw, 24)[0]
print('试听带 %.1f 秒,峰值 %.3f,整体响度 %.4f → %s' % (n / sr, np.abs(pcm).max(), np.sqrt((mono ** 2).mean()), wav))
# 频谱图:短时傅里叶,纵轴取对数频率 60 Hz ~ 16 kHz
win = 2048
hop = 512
frames = 1 + (len(mono) - win) // hop
w = np.hanning(win)
spec = np.empty((frames, win // 2 + 1))
for i in range(frames):
    spec[i] = np.abs(np.fft.rfft(mono[i * hop:i * hop + win] * w))
db = 20 * np.log10(spec + 1e-6)
H = 360
freqs = np.geomspace(60, 16000, H)
bins = np.clip((freqs / (sr / 2) * (win // 2)).astype(int), 1, win // 2)
img = db[:, bins].T[::-1]
img = np.clip((img - db.max() + 72) / 72, 0, 1) ** 1.6          # 最响处往下 72 分贝以内才画出来
W = 1800
xs = np.linspace(0, frames - 1, W).astype(int)
img = img[:, xs]
rgb = np.stack([np.clip(img * 2.4 - 1.0, 0, 1), np.clip(img * 1.7 - 0.3, 0, 1), np.clip(img * 1.2, 0, 1) * 0.85 + 0.04], axis=2)
im = Image.fromarray((rgb * 255).astype(np.uint8))
sheet = Image.new('RGB', (W, H + 44), (10, 11, 14))
sheet.paste(im, (0, 44))
dr = ImageDraw.Draw(sheet)
for t, name in reel['marks']:
    x = int(t / (n / sr) * W)
    dr.line([(x, 30), (x, 44)], fill=(255, 230, 120))
    dr.text((x + 2, 4 + 12 * (reel['marks'].index([t, name]) % 2)), name, fill=(255, 235, 150))
for f in (100, 1000, 10000):
    y = 44 + H - 1 - int(np.argmin(np.abs(freqs - f)))
    dr.line([(0, y), (8, y)], fill=(200, 200, 200))
    dr.text((10, y - 6), '%d Hz' % f, fill=(200, 200, 200))
png = os.path.join(OUT, '频谱_%s.png' % SPACE)
sheet.save(png)
print('频谱图 →', png)
