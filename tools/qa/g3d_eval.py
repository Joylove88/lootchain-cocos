# -*- coding: utf-8 -*-
"""3D 小样页面里执行一段 JS 拿结果(2026-11-20,低端兼容第 1 期):无头 Edge 打开地址,等小样就绪(主角 / 建筑到齐)再等几秒,执行 JS 文件里的表达式(可返回 Promise),结果存 JSON。
用法:python tools/qa/g3d_eval.py "<地址>" <标签> <js 文件> [--size=1440x900] [--dpr=2] [--settle=6]
     QA_GPU=low 用本机 AMD 核显。输出 %TEMP%/lootchain-qa/perf/eval_<标签>.json。跑完按配置目录清掉 Edge。"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9370')
import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
URL, TAG, JSF = ARGS[0], ARGS[1], ARGS[2]
W, H = (int(x) for x in OPT.get('size', '1440x900').split('x'))
DPR = float(OPT.get('dpr', '2'))
SETTLE = float(OPT.get('settle', '6'))
OUT = os.path.join(base.SCRATCH, 'perf')
os.makedirs(OUT, exist_ok=True)
JS_READY = r"""(() => { const d = window.__g3dd; if (!d) return 'nodbg'; const i = d.info(); const g = d.dungeon || {};
  if (i.error) return 'error ' + i.error; if (!i.opened || !g.leader) return 'wait'; if (g.bldTotal && g.bldDone < g.bldTotal) return 'bld'; return 'ok'; })()"""


async def main():
    profile = os.path.join(base.SCRATCH, 'eval_profile_' + TAG)
    shutil.rmtree(profile, ignore_errors=True)
    flags = ['--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', f'--window-size={W},{H}',
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

            async def call(m, p=None, timeout=120):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(expr, timeout=120):
                r = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True}, timeout)
                res = r.get('result', {})
                if 'exceptionDetails' in res:
                    raise RuntimeError(json.dumps(res['exceptionDetails'], ensure_ascii=False)[:600])
                return res.get('result', {}).get('value')

            await call('Runtime.enable')
            await call('Page.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': DPR, 'mobile': False})
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            st = ''
            while time.time() - t0 < 600:
                await asyncio.sleep(3)
                st = await ev(JS_READY)
                if st == 'ok' or str(st).startswith('error'):
                    break
            print('ready', st, round(time.time() - t0), 's', flush=True)
            await asyncio.sleep(SETTLE)
            val = await ev(open(JSF, encoding='utf-8').read(), 300)
            with open(os.path.join(OUT, f'eval_{TAG}.json'), 'w', encoding='utf-8') as f:
                json.dump(val, f, ensure_ascii=False, indent=1)
            print('RESULT', json.dumps(val, ensure_ascii=False)[:3000], flush=True)
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
