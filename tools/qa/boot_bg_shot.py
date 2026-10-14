# -*- coding: utf-8 -*-
"""启动加载页背景自验(2026-10-14):全新 profile 打开预览页,引擎起来后等加载屏出现,截 PC 与手机横屏两张。
用法:PREVIEW_PORT=7456 python boot_bg_shot.py <tag>  → %TEMP%/lootchain-qa/shots/<tag>_boot_{pc,phone}.png"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1] if len(sys.argv) > 1 else 'bootbg'
SHOTS = os.path.join(base.SCRATCH, 'shots')
os.makedirs(SHOTS, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
JS_WAIT_BOOT = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let cc = null; for (let i = 0; i < 20 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } }
  if (!cc) return 'cc import failed';
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; const s = cc.director.getScene(); if (s) w(s); return f; };
  for (let i = 0; i < 120; i++) { const bg = find('BootLoadingBg'); if (bg && bg.getChildByName('Img')) { await sleep(900); return 'bg ' + bg.getChildByName('Img').getComponent(cc.Sprite).spriteFrame.name + ' opacity ' + bg.getComponent(cc.UIOpacity).opacity; } await sleep(500); }
  return 'no boot bg (' + (find('BootLoadingRoot') ? 'root present' : 'no root') + ')';
})()"""


async def shoot(mobile, suffix):
    profile = base.PROFILE + '_bootbg'
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
            if mobile:
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            else:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_WAIT_BOOT, 'awaitPromise': True, 'returnByValue': True}, 400)
            print(suffix, r.get('result', {}).get('result', {}).get('value'), flush=True)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            if 'result' in m:
                open(os.path.join(SHOTS, f'{TAG}_boot_{suffix}.png'), 'wb').write(base64.b64decode(m['result']['data']))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


async def main():
    only = sys.argv[2] if len(sys.argv) > 2 else ''
    if only != 'phone':
        await shoot(False, 'pc')
    if only != 'pc':
        await shoot(True, 'phone')

asyncio.run(main())
