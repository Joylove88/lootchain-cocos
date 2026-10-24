# -*- coding: utf-8 -*-
"""线上站点冒烟截图(2026-10-24,Railway 部署):全新 profile 无头 Edge 打开线上地址,等引擎起来、GameRoot 出现,
记录当前界面 / 接口地址 / 失败请求,截 PC 一张。不登录、不操作。
用法:python live_site_shot.py <url> <tag>  → %TEMP%/lootchain-qa/shots/<tag>_live.png"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

URL = sys.argv[1]
TAG = sys.argv[2] if len(sys.argv) > 2 else 'live'
SHOTS = os.path.join(base.SCRATCH, 'shots')
os.makedirs(SHOTS, exist_ok=True)
JS_WAIT = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t0 = Date.now();
  let root = null;
  for (let i = 0; i < 180 && !root; i++) {
    try { const s = window.cc && cc.director.getScene(); if (s) s.walk(n => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } }); } catch (e) {}
    if (!root) await sleep(500);
  }
  if (!root) return { err: 'no GameRoot', inited: window.cc && cc.game._inited };
  for (let i = 0; i < 60 && !(root.currentView === 'login' || root.currentView === 'lobby'); i++) await sleep(500);
  await sleep(4000);
  const failed = performance.getEntriesByType('resource').filter(r => r.responseStatus >= 400).map(r => r.name).slice(0, 8);
  return { view: root.currentView, bootMs: Date.now() - t0, frames: cc.director.getTotalFrames(), resources: performance.getEntriesByType('resource').length, failed,
           sw: navigator.serviceWorker && navigator.serviceWorker.controller ? 'controlled' : 'none' };
})()"""


async def main():
    profile = base.PROFILE + '_live'
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x
            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': URL})
            r = await call('Runtime.evaluate', {'expression': JS_WAIT, 'awaitPromise': True, 'returnByValue': True}, 400)
            print(json.dumps(r.get('result', {}).get('result', {}).get('value'), ensure_ascii=False), flush=True)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            if 'result' in m:
                out = os.path.join(SHOTS, f'{TAG}_live.png')
                open(out, 'wb').write(base64.b64decode(m['result']['data']))
                print(out)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

asyncio.run(main())
