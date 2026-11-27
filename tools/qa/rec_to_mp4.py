# -*- coding: utf-8 -*-
"""把 playtest_cdp.py 录下的屏幕流帧(<目录>/f_<毫秒>.jpg)按真实时间间隔合成 mp4(2026-11-27)。

  python tools/qa/rec_to_mp4.py <帧目录> [输出.mp4] [--speed=1.0] [--from=秒] [--to=秒]
屏幕流只在画面变化时出帧、间隔不均匀:按相邻帧时间差写 ffmpeg concat 的 duration,播放节奏与实际一致;
--speed=2 = 两倍速;--from / --to 截取一段(秒,从第一帧算)。需要 ffmpeg 在 PATH。
"""
import os
import subprocess
import sys


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    src = args[0]
    out = os.path.abspath(args[1]) if len(args) > 1 else os.path.join(os.path.dirname(os.path.abspath(src)), 'rec.mp4')
    speed = float(opts.get('speed', '1'))
    frames = sorted((int(f[2:-4]), f) for f in os.listdir(src) if f.startswith('f_') and f.endswith('.jpg'))
    if len(frames) < 2:
        raise SystemExit('帧太少')
    t0 = frames[0][0]
    lo = float(opts.get('from', '0')) * 1000
    hi = float(opts.get('to', '1e9')) * 1000
    frames = [x for x in frames if lo <= x[0] - t0 <= hi]
    lst = os.path.join(src, '_concat.txt')
    with open(lst, 'w', encoding='utf-8') as fh:
        for i, (ts, name) in enumerate(frames):
            nxt = frames[i + 1][0] if i + 1 < len(frames) else ts + 40
            dur = max(0.016, min(1.0, (nxt - ts) / 1000.0 / speed))
            fh.write(f"file '{name}'\nduration {dur:.4f}\n")
        fh.write(f"file '{frames[-1][1]}'\n")
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', 'fps=30,scale=1280:-2',
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'veryfast', out]
    subprocess.run(cmd, check=True, cwd=src)
    total = (frames[-1][0] - frames[0][0]) / 1000.0 / speed
    print(f'{out}  帧 {len(frames)}  时长约 {total:.1f}s')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
