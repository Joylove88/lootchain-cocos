# -*- coding: utf-8 -*-
"""3D 小样性能基线一键重跑(2026-11-20,低端设备兼容第 0 期):依次跑主城 / 地宫 / 野外的核显档 + 主城 / 地宫的手机档,
全部在本机 AMD 核显(QA_GPU=low)上、不锁 60 帧、带 &bench=1,出一张对比表。每项优化做完重跑一次和上次比。
用法:python tools/qa/g3d_baseline.py [--base=https://lootchain-web-production.up.railway.app] [--tag=后缀] [--only=city_igpu,dungeon_phone] [--gpu=low|default]
     本地正式包:--base=http://localhost:7460
输出 %TEMP%/lootchain-qa/perf/baseline_<tag>.md(表)+ 每项的 json / jpg(g3d_perf_probe 产物)。一项约 1.5~2 分钟,串行跑,别同时开别的无头浏览器。
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
BASE = OPT.get('base', 'https://lootchain-web-production.up.railway.app').rstrip('/')
TAG = OPT.get('tag', time.strftime('%m%d_%H%M'))
GPU = OPT.get('gpu', 'low')
BLD = 'smithy,cathedral,house,house_b,house_c,house_d,well,stall,lamp,statue,ground'
CASES = [
    ('city_igpu', f'?g3dcity=1&bld={BLD}&dq=igpu', '1440x900', '2'),
    ('dungeon_igpu', '?g3ddungeon=1&dq=igpu', '1440x900', '2'),
    ('wild_igpu', '?g3dwild=1&dq=igpu', '1440x900', '2'),
    ('city_phone', f'?g3dcity=1&bld={BLD}&dq=phone', '800x360', '2'),
    ('dungeon_phone', '?g3ddungeon=1&dq=phone', '800x360', '2'),
]
ONLY = set(OPT['only'].split(',')) if 'only' in OPT else None
OUT = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'perf')
os.makedirs(OUT, exist_ok=True)

rows = []
for key, qs, size, dpr in CASES:
    if ONLY and key not in ONLY:
        continue
    tag = f'{key}_{TAG}'
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    if GPU == 'low':
        env['QA_GPU'] = 'low'
    url = f'{BASE}/{qs}&dfps=1&bench=1'
    print(f'== {key}  {url}', flush=True)
    subprocess.run([sys.executable, os.path.join(HERE, 'g3d_perf_probe.py'), url, tag, '--uncap', f'--size={size}', f'--dpr={dpr}', '--wait=600'], env=env, timeout=900)
    try:
        rec = json.load(open(os.path.join(OUT, tag + '.json'), encoding='utf-8'))
    except Exception as e:  # noqa: BLE001
        rows.append((key, None, str(e)))
        continue
    rows.append((key, rec, ''))


def pick(bench, prefix):
    for b in bench or []:
        if b['name'].startswith(prefix):
            return b
    return None


lines = [f'# 3D 小样基线 {TAG}', '', f'地址 {BASE},显卡 {GPU},不锁 60 帧。每格 = 每帧毫秒(显卡毫秒)。', '',
         '| 项 | 显卡 | 渲染 | 现状 | 关AO | 关泛光 | 关月光阴影 | 灯0 | 藏建筑 | 藏角色 | 分辨率×0.5 | 全关 | 万面 | 绘制 | 贴图MB | 加载(场景/主角/建筑 秒) |',
         '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
for key, rec, err in rows:
    if not rec:
        lines.append(f'| {key} | 失败 {err} |')
        continue
    fin = rec.get('final') or {}
    bench = fin.get('bench') or []
    full = (fin.get('benchFull') or {})

    def cell(prefix):
        b = pick(bench, prefix)
        if not b:
            return '-'
        g = b.get('gpu')
        return f"{b['avg']}" + (f"({g})" if g is not None else '')
    now = pick(bench, '现状') or {}
    mem = fin.get('mem') or {}
    hud = (fin.get('hud') or '').split('·')
    res = next((h.strip() for h in hud if '×' in h), '')
    m = rec.get('marks', {})
    lines.append(f"| {key} | {(fin.get('gpu') or '')[7:30]} | {res} | {cell('现状')} | {cell('关遮蔽')} | {cell('关泛光')} | {cell('关月光阴影')} | {cell('灯 0')} | {cell('藏起建筑')} | {cell('藏起角色')} | "
                 f"{cell('分辨率×0.5')} | {cell('全关')} | {round((now.get('tris') or fin.get('tris') or 0) / 10000)} | {now.get('draws') or fin.get('draws')} | {mem.get('texMB')} | "
                 f"{m.get('opened')}/{m.get('hero')}/{m.get('bld', '-')} |")
md = os.path.join(OUT, f'baseline_{TAG}.md')
open(md, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
print('saved', md)
