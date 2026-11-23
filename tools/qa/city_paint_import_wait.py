# -*- coding: utf-8 -*-
"""等 Creator 把 city_v4_paint.py export 新写的手绘图块导入完(2026-11-24 主城重做)。

  python tools/qa/city_paint_import_wait.py [--refresh] [--timeout 600]
--refresh:先请求编辑器预览 7456 的 /asset-db/refresh(Creator 不一定自己察觉到整批改写的图)。
判定:pre25/city_paint 下每个 .webp / .jpg / .png 都有 .meta,且 library/<uuid 前两位>/<uuid>* 至少有一个文件比源图新。
打印还没导完的个数,全部导完退出码 0,超时退出码 1。
"""
import glob
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DIR = os.path.join(ROOT, 'assets', 'resources', 'pre25', 'city_paint')
LIB = os.path.join(ROOT, 'library')


def pending():
    left = []
    for f in sorted(os.listdir(DIR)):
        if not f.lower().endswith(('.webp', '.jpg', '.png')):
            continue
        src = os.path.join(DIR, f)
        meta = src + '.meta'
        if not os.path.exists(meta):
            left.append(f + ' (no meta)')
            continue
        try:
            uuid = json.load(open(meta, encoding='utf-8'))['uuid']
        except Exception:
            left.append(f + ' (meta unreadable)')
            continue
        libs = glob.glob(os.path.join(LIB, uuid[:2], uuid + '*'))
        if not libs or max(os.path.getmtime(p) for p in libs) < os.path.getmtime(src):
            left.append(f)
    return left


def main():
    timeout = float(sys.argv[sys.argv.index('--timeout') + 1]) if '--timeout' in sys.argv else 600
    if '--refresh' in sys.argv:
        try:
            print('refresh', urllib.request.urlopen('http://localhost:7456/asset-db/refresh', timeout=30).status, flush=True)
        except Exception as e:
            print('refresh failed', e, flush=True)
    t0 = time.time()
    last = None
    while True:
        left = pending()
        if len(left) != last:
            print(f'{time.time() - t0:5.0f}s 还没导完 {len(left)}' + (f'(如 {left[:3]})' if left else ''), flush=True)
            last = len(left)
        if not left:
            return 0
        if time.time() - t0 > timeout:
            return 1
        time.sleep(3)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
