# -*- coding: utf-8 -*-
"""正式包"切换界面等待"实测:127.0.0.1:7460 起的 release 包,全新 Edge 配置。
第 1 次访问:等整包下载完;第 2 次访问(刷新):登录后立刻逐个打开界面,每 100ms 采样
  gate=页面加载提示(SceneAssetLoading)是否在、miss=当前场景里激活但还没贴图的 Sprite 数,
  记录"加载提示消失"和"缺图归零"的时间。然后等 60s(后台预读完)再测一遍。
用法:python switch_wait.py [--skip-download] [--mobile]"""
import asyncio, json, os, sys, time, subprocess, shutil, urllib.request
import websockets
import boss_bar_cdp as base

EDGE = base.EDGE
PORT = int(os.environ.get('EDGE_PORT', '9411'))
PROFILE = os.path.join(base.SCRATCH, 'edge_switch_profile')
PAGE = 'http://127.0.0.1:7460/'
MOBILE = '--mobile' in sys.argv
SKIP_DL = '--skip-download' in sys.argv

PAGES = [
    ('adventure', 'r.openLobbyAdventurePanel()', 'r.closeLobbyAdventurePanel()'),
    ('bag', 'r.openLobbyBagPanel()', 'r.closeLobbyBagPanel()'),
    ('forge', 'r.openLobbyForgePanel()', 'r.closeLobbyForgePanel()'),
    ('roster', 'r.openLobbyHeroRosterPanel()', 'r.closeLobbyHeroRosterPanel()'),
    ('formation', 'r.openLobbyFormationPanel()', 'r.closeLobbyFormationPanel()'),
    ('gacha', 'r.openLobbyGachaScene()', 'r.closeGachaScene()'),
    ('codex', 'r.openLobbyCodexPanel()', 'r.closeLobbyCodexPanel()'),
    ('daily', 'r.openLobbyDailyDungeonPanel()', 'r.closeLobbyDailyDungeonPanel()'),
    ('quest', 'r.openLobbyQuestPanel()', 'r.closeLobbyQuestPanel()'),
    ('crystal', 'r.openGuardCrystalDialog()', 'r.closeGuardCrystalDialog()'),
    ('shop', "r.openLobbyShopDialog('gold')", 'r.closeLobbyShopDialog()'),
]

STATE = r"""(() => {
  const cc = window.__cc; const s = cc && cc.director.getScene(); if (!s) return null;
  let gate = false, miss = 0, boot = false; const missNames = [];
  const w = n => { if (!n.activeInHierarchy) return; if (n.name === 'SceneAssetLoading') gate = true; if (n.name === 'BootLoadingRoot') boot = true;
    const sp = n.getComponent(cc.Sprite); if (sp && sp.enabledInHierarchy && !sp.spriteFrame) { miss++; if (missNames.length < 6) missNames.push(n.name); }
    n.children.forEach(w); };
  w(s);
  return { gate, miss, boot, view: window.__root && window.__root.currentView, missNames };
})()"""


async def main():
    if not SKIP_DL:
        shutil.rmtree(PROFILE, ignore_errors=True)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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

            async def call(method, params=None, timeout=600):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if m.get('id') == my:
                        return m

            async def ev(expr, timeout=600):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return r.get('result', {}).get('value') if 'exceptionDetails' not in r else 'EXC ' + str(r['exceptionDetails'])[:300]

            if MOBILE:
                await call('Emulation.setDeviceMetricsOverride', {'width': 844, 'height': 390, 'deviceScaleFactor': 2, 'mobile': True,
                                                                   'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            else:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.enable')

            async def boot(tag):
                t0 = time.time()
                await call('Page.navigate', {'url': PAGE})
                await asyncio.sleep(6)
                await ev(base.JS_BOOT, 900)
                while time.time() - t0 < 1500:
                    st = await ev(STATE, 30)
                    if st and not st.get('boot') and st.get('view') == 'login':
                        break
                    await asyncio.sleep(2)
                print(f'{tag}: 到登录页 {time.time() - t0:.1f}s', flush=True)

            if not SKIP_DL:
                await boot('首次访问(整包下载)')
            await boot('刷新')
            t_login = time.time()
            print('login:', await ev(base.JS_LOGIN, 120), f'{time.time() - t_login:.1f}s', flush=True)

            async def tour(tag):
                print(f'--- {tag}')
                for name, opener, closer in PAGES:
                    await ev(f"(async () => {{ const r = window.__root; try {{ await ({opener}); }} catch (e) {{ return 'err ' + e.message; }} return 'ok'; }})()", 60)
                    t0 = time.time()
                    gate_end = None
                    miss_end = None
                    first = None
                    last = None
                    while time.time() - t0 < 25:
                        st = await ev(STATE, 30) or {}
                        if first is None:
                            first = st
                        last = st
                        el = time.time() - t0
                        if gate_end is None and not st.get('gate'):
                            gate_end = el
                        if not st.get('gate') and st.get('miss', 1) == 0:
                            miss_end = el
                            break
                        await asyncio.sleep(0.1)
                    print(f'{name:10s} 首帧 gate={first.get("gate")} miss={first.get("miss")} | 提示消失 {gate_end if gate_end is None else round(gate_end, 2)}s'
                          f' | 缺图归零 {miss_end if miss_end is None else round(miss_end, 2)}s | 末态 miss={last.get("miss")} {last.get("missNames")}', flush=True)
                    await ev(f"(async () => {{ const r = window.__root; try {{ {closer}; }} catch (e) {{}} await new Promise(z => setTimeout(z, 600)); return 1; }})()", 60)

            await tour('登录后立刻切换')
            await asyncio.sleep(60)
            await tour('等 60s 后台预读后再切换')
    finally:
        proc.terminate()


asyncio.run(main())
