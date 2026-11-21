# -*- coding: utf-8 -*-
"""3D 小样 CPU 剖析(2026-11-21,低端兼容):无头 Edge 打开地址,等就绪后执行一段「准备」JS(比如把主角传到怪群旁开打),
再用 Chrome 自带的采样剖析器采 N 秒,按函数统计自身耗时(self time)和含子调用耗时,打印前 40 名。
用法:python tools/qa/g3d_profile.py "<地址>" <标签> [--prep=<js 文件>] [--secs=5] [--wait=3]
     QA_GPU=low 用本机 AMD 核显。输出 %TEMP%/lootchain-qa/perf/prof_<标签>.json。跑完按配置目录清掉 Edge。"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict

import websockets

os.environ.setdefault('EDGE_PORT', '9371')
import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
URL, TAG = ARGS[0], ARGS[1]
SECS = float(OPT.get('secs', '5'))
WAIT = float(OPT.get('wait', '3'))
OUT = os.path.join(base.SCRATCH, 'perf')
os.makedirs(OUT, exist_ok=True)
JS_READY = r"""(() => { const d = window.__g3dd; if (!d) return 'nodbg'; const i = d.info(); const g = d.dungeon || {};
  if (i.error) return 'error ' + i.error; if (!i.opened || !g.leader) return 'wait'; if (g.bldTotal && g.bldDone < g.bldTotal) return 'bld'; return 'ok'; })()"""


async def main():
    profile = os.path.join(base.SCRATCH, 'prof_profile_' + TAG)
    shutil.rmtree(profile, ignore_errors=True)
    flags = ['--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--window-size=1440,900',
             '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit']
    if os.environ.get('QA_GPU') == 'low':
        flags.append('--force_low_power_gpu')
    proc = subprocess.Popen([base.EDGE] + flags + ['about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=180):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(expr):
                r = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
                return r.get('result', {}).get('result', {}).get('value')

            await call('Runtime.enable')
            await call('Page.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 2, 'mobile': False})
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            st = ''
            while time.time() - t0 < 600:
                await asyncio.sleep(3)
                st = await ev(JS_READY)
                if st == 'ok' or str(st).startswith('error'):
                    break
            print('ready', st, flush=True)
            if 'prep' in OPT:
                print('prep', await ev(open(OPT['prep'], encoding='utf-8').read()), flush=True)
            await asyncio.sleep(WAIT)
            await call('Profiler.enable')
            await call('Profiler.setSamplingInterval', {'interval': 200})
            await call('Profiler.start')
            await asyncio.sleep(SECS)
            r = await call('Profiler.stop')
            prof = r['result']['profile']
            nodes = {n['id']: n for n in prof['nodes']}
            parent = {}
            for n in prof['nodes']:
                for c in n.get('children', []):
                    parent[c] = n['id']
            # 每个样本的时间间隔
            samples = prof.get('samples', [])
            deltas = prof.get('timeDeltas', [])
            self_t = defaultdict(float)
            total_t = defaultdict(float)
            tot = 0.0
            for sid, dt in zip(samples, deltas):
                dt = max(0, dt) / 1000.0
                tot += dt
                n = nodes[sid]
                cf = n['callFrame']
                key = f"{cf['functionName'] or '(anon)'} @{cf['url'].split('/')[-1]}:{cf['lineNumber']}"
                self_t[key] += dt
                seen = set()
                cur = sid
                while cur is not None:
                    c2 = nodes[cur]['callFrame']
                    k2 = f"{c2['functionName'] or '(anon)'} @{c2['url'].split('/')[-1]}:{c2['lineNumber']}"
                    if k2 not in seen:
                        total_t[k2] += dt
                        seen.add(k2)
                    cur = parent.get(cur)
            top_self = sorted(self_t.items(), key=lambda kv: -kv[1])[:40]
            top_total = sorted(total_t.items(), key=lambda kv: -kv[1])[:60]
            res = {'secs': SECS, 'sampledMs': round(tot, 1), 'self': [[k, round(v, 1)] for k, v in top_self], 'total': [[k, round(v, 1)] for k, v in top_total]}
            with open(os.path.join(OUT, f'prof_{TAG}.json'), 'w', encoding='utf-8') as f:
                json.dump(res, f, ensure_ascii=False, indent=1)
            print('sampled ms', round(tot, 1), flush=True)
            for k, v in top_self[:30]:
                print(f'  self {v:8.1f}  {k}', flush=True)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            proc.kill()
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass


asyncio.run(main())
