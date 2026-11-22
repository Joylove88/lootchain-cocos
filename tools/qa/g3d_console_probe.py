# -*- coding: utf-8 -*-
"""3D 小样启动探针(2026-11-22):无头 Edge 打开地址,收集页面报错 / 控制台错误和警告,每 3 秒报一次 3D 小样的就绪状态。
录像脚本卡在「ready nodbg」(调试钩子 __g3dd 一直没出来 = 小样没启动)时先跑这个,看是哪一行抛的错。

用法:python tools/qa/g3d_console_probe.py "<地址>" [--secs=90]
跑完按配置目录清掉 Edge。"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9373')
import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
URL = ARGS[0]
SECS = int(OPT.get('secs', '90'))
JS_STATE = r"""(() => { const d = window.__g3dd; if (!d) return 'nodbg'; const i = d.info(); const g = d.dungeon || {};
  if (i.error) return 'error ' + i.error; if (!i.opened || !g.leader) return 'wait'; if (g.bldTotal && g.bldDone < g.bldTotal) return 'bld ' + g.bldDone + '/' + g.bldTotal; return 'ok'; })()"""


async def main():
    profile = os.path.join(base.SCRATCH, 'probe_profile')
    shutil.rmtree(profile, ignore_errors=True)
    flags = ['--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--window-size=1280,720',
             '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio']
    proc = subprocess.Popen([base.EDGE] + flags + ['about:blank'])
    seen = set()
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
            pending = {}

            def show(kind, text):
                key = (kind, text[:300])
                if key in seen:
                    return
                seen.add(key)
                print(f'[{kind}] {text[:1200]}', flush=True)

            async def pump():
                while True:
                    x = json.loads(await ws.recv())
                    if 'id' in x and x['id'] in pending:
                        pending.pop(x['id']).set_result(x)
                        continue
                    m = x.get('method')
                    p = x.get('params', {})
                    if m == 'Runtime.exceptionThrown':
                        d = p.get('exceptionDetails', {})
                        desc = (d.get('exception') or {}).get('description') or d.get('text', '')
                        show('exception', f"{desc} @ {d.get('url', '')}:{d.get('lineNumber')}")
                    elif m == 'Runtime.consoleAPICalled' and p.get('type') in ('error', 'warning', 'assert'):
                        args = ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))
                        show(p.get('type'), args)
                    elif m == 'Log.entryAdded':
                        e = p.get('entry', {})
                        if e.get('level') in ('error',):
                            show('log', f"{e.get('text', '')} {e.get('url', '')}")

            async def call(method, params=None):
                nonlocal seq
                seq += 1
                fut = asyncio.get_event_loop().create_future()
                pending[seq] = fut
                await ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
                return await asyncio.wait_for(fut, 60)

            task = asyncio.ensure_future(pump())
            await call('Runtime.enable')
            await call('Log.enable')
            await call('Page.enable')
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            last = ''
            while time.time() - t0 < SECS:
                await asyncio.sleep(3)
                r = await call('Runtime.evaluate', {'expression': JS_STATE, 'returnByValue': True})
                st = r.get('result', {}).get('result', {}).get('value')
                if st != last:
                    print(f'state {round(time.time() - t0)}s: {st}', flush=True)
                    last = st
                if st == 'ok':
                    break
            task.cancel()
    finally:
        proc.terminate()
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass


asyncio.run(main())
