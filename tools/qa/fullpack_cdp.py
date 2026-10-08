# -*- coding: utf-8 -*-
"""整包下载自验:正式包本地起服(127.0.0.1:7460),全新 Edge 配置。
第 1 次访问:统计网络字节、加载屏截图、到登录页的耗时、本地标记;第 2 次刷新:统计真正走网络的字节与到登录页耗时;
之后等后台把各页面素材读进内存,打印各分组状态。
用法:python fullpack_cdp.py [--mobile] [--throttle MBps]"""
import asyncio, base64, json, os, sys, time, subprocess, shutil, urllib.request
import websockets

SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'lootchain-qa')
os.makedirs(SCRATCH, exist_ok=True)
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = int(os.environ.get('EDGE_PORT', '9371'))
PROFILE = os.path.join(SCRATCH, 'edge_fullpack_profile')
PAGE = 'http://127.0.0.1:7460/'
SHOTS = os.path.join(SCRATCH, 'shots', 'fullpack')
os.makedirs(SHOTS, exist_ok=True)
MOBILE = '--mobile' in sys.argv
THROTTLE = float(sys.argv[sys.argv.index('--throttle') + 1]) if '--throttle' in sys.argv else 0

STATE_JS = r"""(async () => {
  let cc = window.__cc; if (!cc) { try { cc = await System.import('cc'); window.__cc = cc; } catch (e) { return JSON.stringify({ cc: false }); } }
  const s = cc.director.getScene(); if (!s) return JSON.stringify({ scene: false });
  let root = null, tip = null, boot = false;
  const walk = n => { const c = n.getComponent && n.getComponent('LootChainGameRoot'); if (c) root = c;
    if (n.name === 'BootLoadingRoot') boot = true; if (n.name === 'BootLoadingTip') { const l = n.getComponent(cc.Label); tip = l && l.string; } n.children.forEach(walk); };
  walk(s); window.__root = root;
  let groups = null;
  if (root && root.uiSpriteFrameCache) { const c = root.uiSpriteFrameCache; groups = {};
    ['battle','heroes','bag','forge','adventure','gacha','crystal'].forEach(g => { const w = c.groupWaits.get(g); groups[g] = w ? (w.total + ':' + w.pending.size) : '-'; }); }
  const ls = {}; try { ['lootchain.fullPack.version','lootchain.bootPreload.version'].forEach(k => ls[k] = localStorage.getItem(k)); } catch (e) {}
  let cached = null; try { const c = await caches.open('lootchain-assets-v1'); cached = (await c.keys()).length; } catch (e) {}
  return JSON.stringify({ view: root && root.currentView, boot, tip, groups, ls, cached, sw: !!navigator.serviceWorker.controller });
})()"""


async def main():
    shutil.rmtree(PROFILE, ignore_errors=True)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            pending = {}
            net = {'bytes': 0, 'sw': 0, 'reqs': 0, 'swreqs': 0}
            fromsw = set()

            async def reader():
                while True:
                    m = json.loads(await ws.recv())
                    if 'id' in m and m['id'] in pending:
                        pending.pop(m['id']).set_result(m)
                    elif m.get('method') == 'Network.responseReceived':
                        if m['params']['response'].get('fromServiceWorker'):
                            fromsw.add(m['params']['requestId'])
                    elif m.get('method') == 'Network.loadingFinished':
                        rid = m['params']['requestId']
                        if rid in fromsw:
                            net['swreqs'] += 1
                        else:
                            net['bytes'] += m['params'].get('encodedDataLength', 0)
                            net['reqs'] += 1

            task = asyncio.ensure_future(reader())

            async def call(method, params=None, timeout=300):
                nonlocal seq
                seq += 1
                fut = asyncio.get_event_loop().create_future()
                pending[seq] = fut
                await ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
                return await asyncio.wait_for(fut, timeout)

            async def ev(expr, timeout=120):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return r.get('result', {}).get('value') if 'exceptionDetails' not in r else 'EXC ' + str(r['exceptionDetails'])[:300]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                path = os.path.join(SHOTS, f'{name}.png')
                open(path, 'wb').write(base64.b64decode(m['result']['data']))
                print('   shot', path)

            if MOBILE:
                await call('Emulation.setDeviceMetricsOverride', {'width': 844, 'height': 390, 'deviceScaleFactor': 2, 'mobile': True,
                                                                   'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Network.enable')
            # 子请求也要计数:Service Worker 自己的网络请求在 SW target 里,这里只看页面视角(fromServiceWorker 记为本地)
            if THROTTLE:
                await call('Network.emulateNetworkConditions', {'offline': False, 'latency': 40, 'downloadThroughput': THROTTLE * 1048576, 'uploadThroughput': 1048576})
            await call('Page.enable')

            async def visit(tag, shoot_mid):
                net.update({'bytes': 0, 'sw': 0, 'reqs': 0, 'swreqs': 0})
                fromsw.clear()
                t0 = time.time()
                await call('Page.navigate', {'url': PAGE})
                shot_done = False
                last = None
                while time.time() - t0 < 1500:
                    await asyncio.sleep(2)
                    st = await ev(STATE_JS, 60)
                    try:
                        d = json.loads(st)
                    except Exception:
                        d = {}
                    if d.get('tip') != last:
                        last = d.get('tip')
                        print(f'   [{time.time() - t0:6.1f}s] boot={d.get("boot")} tip={last} net={net["bytes"] / 1048576:.1f}MB')
                    if shoot_mid and not shot_done and d.get('boot') and d.get('tip') and '下载' in d.get('tip', ''):
                        await asyncio.sleep(3)
                        await shot(f'{tag}_downloading')
                        shot_done = True
                    if d.get('view') == 'login' and not d.get('boot'):
                        break
                el = time.time() - t0
                print(f'{tag}: 到登录页 {el:.1f}s,页面走网络 {net["bytes"] / 1048576:.1f}MB/{net["reqs"]} 个请求,经 SW 本地 {net["swreqs"]} 个')
                await shot(f'{tag}_login')
                return el

            await visit('visit1', True)
            await asyncio.sleep(20)
            print('visit1 后台 20s:', await ev(STATE_JS, 60))
            await visit('visit2', False)
            await asyncio.sleep(14)
            print('visit2 后台 14s:', await ev(STATE_JS, 60))
            print(f'visit2 累计走网络 {net["bytes"] / 1048576:.1f}MB/{net["reqs"]} 个请求,经 SW {net["swreqs"]} 个')
            task.cancel()
    finally:
        proc.kill()


asyncio.run(main())
