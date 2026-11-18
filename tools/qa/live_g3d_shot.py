# -*- coding: utf-8 -*-
"""线上 3D 实验小样冒烟(2026-11-18):全新 profile 无头 Edge(独显)打开线上带 3D 开关的地址,不登录、不操作,
等小样场景建好、按需取的模型到齐,记下页面异常 / 失败请求 / 是否走了高动态,截一张。
用法:python tools/qa/live_g3d_shot.py "<带 ?g3dcity=1… 的完整地址>" <标签> [最多等几秒,缺省 420]
     → %TEMP%/lootchain-qa/shots/<标签>_g3d.png
独立调试端口 9367 + 配置目录 live_g3d_profile(每次清空 = 等同首次访问);跑完自己关浏览器。"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9367')
import boss_bar_cdp as base  # noqa: E402

URL = sys.argv[1]
TAG = sys.argv[2] if len(sys.argv) > 2 else 'live'
WAIT = int(sys.argv[3]) if len(sys.argv) > 3 else 420
SHOTS = os.path.join(base.SCRATCH, 'shots')
os.makedirs(SHOTS, exist_ok=True)

JS_STATE = r"""(() => {
  const d = window.__g3dd;
  if (!d) return { state: 'nodbg', view: (() => { try { let v = ''; cc.director.getScene().walk(n => { const c = n.getComponent('LootChainGameRoot'); if (c) v = c.currentView; }); return v; } catch (e) { return ''; } })() };
  const i = d.info();
  const bld = d.dungeon && d.dungeon.cityBld ? Object.keys(d.dungeon.cityBld).length : -1;
  return { state: i.opened ? 'ok' : (i.error ? 'error ' + i.error : 'wait'), bld, followers: i.followers, charTris: i.stats && i.stats.charTris, tier: i.tier, fps: i.fps,
           hdr: i.post && i.post.last && i.post.last.hdr, mobile: i.mobile };
})()"""


async def main():
    profile = os.path.join(base.SCRATCH, 'live_g3d_profile')
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--window-size=1920,1080', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', 'about:blank'])
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
            issues = []
            failed = []

            async def call(m, p=None, timeout=120):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x
                    if x.get('method') == 'Runtime.exceptionThrown':
                        issues.append('exception ' + json.dumps(x['params'].get('exceptionDetails', {}), ensure_ascii=False)[:300])
                    elif x.get('method') == 'Runtime.consoleAPICalled' and x['params'].get('type') == 'error':
                        issues.append('console.error ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in x['params'].get('args', []))[:300])
                    elif x.get('method') == 'Network.loadingFailed':
                        failed.append(x['params'].get('errorText', ''))
                    elif x.get('method') == 'Network.responseReceived' and x['params']['response'].get('status', 200) >= 400:
                        failed.append('%s %s' % (x['params']['response']['status'], x['params']['response'].get('url', '')[-90:]))

            await call('Runtime.enable')
            await call('Network.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': 1920, 'height': 1080, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            last = None
            stable = 0
            while time.time() - t0 < WAIT:
                await asyncio.sleep(5)
                r = await call('Runtime.evaluate', {'expression': JS_STATE, 'returnByValue': True})
                cur = r.get('result', {}).get('result', {}).get('value')
                if cur != last:
                    print('%4ds' % (time.time() - t0), json.dumps(cur, ensure_ascii=False), flush=True)
                    stable = 0
                else:
                    stable += 1
                last = cur
                # 场景开了、模型数连续 40 秒没再变 = 到齐了(或者这个小样本来就没有按需取的建筑)
                if cur and cur.get('state') == 'ok' and stable >= 8:
                    break
                if cur and str(cur.get('state', '')).startswith('error'):
                    break
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            out = os.path.join(SHOTS, f'{TAG}_g3d.png')
            if 'result' in m:
                open(out, 'wb').write(base64.b64decode(m['result']['data']))
            print('RESULT', json.dumps({'final': last, 'secs': round(time.time() - t0), 'issues': issues[:10], 'issueCount': len(issues), 'failed': failed[:10], 'failedCount': len(failed), 'shot': out},
                                       ensure_ascii=False), flush=True)
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
