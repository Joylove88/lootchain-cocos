# -*- coding: utf-8 -*-
"""「发新版后老玩家第一次打开」的启动耗时自检(2026-11-18,用户报线上卡在「正在加载界面素材 0%」很久)。

用一个持久的无头 Edge 配置目录:
  1. 打开地址,等到登录页,再让后台下载跑 --warm 秒(缓存里攒一批文件,接近真实老玩家);
  2. 删掉 localStorage 里「本版本已核对」的标记(lootchain.mutableChecked),模拟发了新版本;
  3. 刷新,记下从刷新到登录页的耗时,以及加载页文字随时间的变化。
不登录、不操作。端口 9366,配置目录 %TEMP%\\lootchain-qa\\boot_upgrade_profile(--fresh 时先清空)。
用法:python tools/qa/boot_upgrade_check.py "<地址>" [--warm=120] [--fresh] [--rounds=1]"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9366')
import boss_bar_cdp as base  # noqa: E402

URL = next(a for a in sys.argv[1:] if not a.startswith('--'))
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
WARM = int(OPT.get('warm', '120'))
ROUNDS = int(OPT.get('rounds', '1'))
PROFILE = os.path.join(base.SCRATCH, 'boot_upgrade_profile')

STATE = r"""(() => { let root = null; try { cc.director.getScene().walk(n => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } }); } catch (e) {}
  const lab = (name) => { let s = null; try { cc.director.getScene().walk(n => { if (!s && n.name === name) { const l = n.getComponent(cc.Label) || n.getComponentInChildren(cc.Label); if (l) s = l.string; } }); } catch (e) {} return s; };
  return { view: root ? root.currentView : null, boot: root ? !!root.bootPreloadActive : null, title: lab('BootLoadingTitle'), pct: lab('BootLoadingPercent'), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) }; })()"""


async def main():
    if OPT.get('fresh'):
        shutil.rmtree(PROFILE, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={PROFILE}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--window-size=1600,900', '--use-angle=d3d11', '--enable-gpu', '--mute-audio', 'about:blank'])
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

            async def ev(expr):
                r = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
                return r.get('result', {}).get('result', {}).get('value')

            async def wait_login(tag, limit=900):
                t0 = time.time()
                last = None
                while time.time() - t0 < limit:
                    await asyncio.sleep(1)
                    st = await ev(STATE)
                    key = json.dumps(st, ensure_ascii=False)
                    if key != last:
                        print(f'  [{tag}] {time.time() - t0:6.1f}s {key}', flush=True)
                        last = key
                    if st and st.get('view') in ('login', 'lobby', 'loginAccount') and st.get('boot') is False:          # currentView 一开始就是 login,要等加载页撤掉
                        return time.time() - t0
                return None

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': URL})
            took = await wait_login('首次')
            print('首次打开到登录页:', took and round(took, 1), 's', flush=True)
            await asyncio.sleep(WARM)
            info = await ev("(async () => { const c = await caches.open('lootchain-assets-v1'); const k = await c.keys(); const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {}; return { cached: k.length, usageMB: Math.round((est.usage || 0) / 1048576) }; })()")
            print('后台下载', WARM, '秒后缓存:', json.dumps(info), flush=True)
            for r in range(ROUNDS):
                await ev("(() => { Object.keys(localStorage).filter(k => k.indexOf('lootchain.mutableChecked') === 0).forEach(k => localStorage.removeItem(k)); return 1; })()")
                await call('Page.reload', {'ignoreCache': False})
                took = await wait_login(f'模拟新版本 {r + 1}')
                print(f'模拟新版本后第一次打开到登录页:', took and round(took, 1), 's', flush=True)
            await call('Page.reload', {'ignoreCache': False})
            took = await wait_login('同版本再开')
            print('同版本再开到登录页:', took and round(took, 1), 's', flush=True)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            proc.kill()
        try:
            import edge_guard
            edge_guard.kill_profiles([PROFILE])
        except Exception:  # noqa: BLE001
            pass


asyncio.run(main())
