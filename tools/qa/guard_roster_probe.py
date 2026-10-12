# -*- coding: utf-8 -*-
"""docs/40 P2 自验:守卫战是否按服务端出场名单(start.guardMonsters,后台副本阵容)抽怪物皮肤。
进 MAIN_1_1(正式包走 js_battle_release.js),打印名单、sim 每怪种抽到的皮肤表,跑一段时间后统计实际出场怪的皮肤,并截一张战斗图。
用法:PREVIEW_PORT=7460 python guard_roster_probe.py <tag> [915x412m]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1]
VP = sys.argv[2] if len(sys.argv) > 2 else '915x412m'
mobile = VP.endswith('m')
W, H = [int(v) for v in VP.rstrip('m').split('x')]
SHOTS = os.path.join(base.SCRATCH, 'shots', 'tour')
os.makedirs(SHOTS, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle_release.js' if os.environ.get('PREVIEW_PORT') == '7460' else 'js_battle2.js'), encoding='utf-8').read()
ROSTER = r"""(() => { const r = window.__gr, root = window.__root; const st = root.currentLobbyBattleState().start || {};
  return JSON.stringify({ stage: st.stageCode, roster: (st.guardMonsters || []).map(m => m.guardKind + ':' + m.spineAsset.split('/')[2]),
    picked: r && r.sim ? r.sim.monsterSpineCodes : null }); })()"""
SEEN = r"""(() => { const s = window.__gr && window.__gr.sim; if (!s) return 'no sim'; const seen = {};
  (s.monsters || []).forEach(m => { const k = m.kind + ':' + m.spineCode; seen[k] = (seen[k] || 0) + 1; });
  return JSON.stringify({ wave: s.wave, alive: (s.monsters || []).length, seen }); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=600):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('method') == 'Runtime.exceptionThrown':
                        d = x['params']['exceptionDetails']
                        print('  !! page exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:300], flush=True)
                    if x.get('id') == my:
                        return x

            async def ev(e, timeout=600):
                r = (await call('Runtime.evaluate', {'expression': e, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            if mobile:
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT, 900))
            print(await ev(base.JS_LOGIN, 120))
            await asyncio.sleep(3)
            print('battle', await ev(JS_BATTLE, 300), flush=True)
            print('roster', await ev(ROSTER), flush=True)
            for i in range(4):
                await asyncio.sleep(15)
                print('seen', await ev(SEEN), flush=True)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            if 'result' in m:
                open(os.path.join(SHOTS, f'{TAG}_{VP}_roster.png'), 'wb').write(base64.b64decode(m['result']['data']))
                print('shot saved')
    finally:
        proc.terminate()


asyncio.run(main())
