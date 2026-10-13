# -*- coding: utf-8 -*-
"""限时副本三张新战场背景 + 主题石台(battle_scene_daily_awaken/arcane/abyss)落位自验:进 MAIN_1_1 后把 start.stageCode 改成 DAILY_*_1,
看 resolveSceneBgName 是否选到新图(不是回退图)、horizonPy 是否取到量好的地平线,再把 GuardSceneBg 换成该图截图目视。
用法:PREVIEW_PORT=7456 python daily_bg_probe.py <tag> [915x412m]"""
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
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read()
SWAP = r"""(async () => { const cc = window.__cc, r = window.__gr, root = window.__root;
  const st = root.currentLobbyBattleState(); st.start.stageCode = '%s';
  const name = r.resolveSceneBgName(), path = r.resolveSceneBgPath(), hy = Math.round(r.horizonPy());
  let n = null; const w = x => { if (n) return; if (x.name === 'GuardSceneBg') { n = x; return; } x.children.forEach(w); }; w(cc.director.getScene());
  const res = await new Promise(z => cc.resources.load(path, cc.SpriteFrame, (e, f) => z(e ? 'ERR ' + e.message : f)));
  if (typeof res === 'string') return JSON.stringify({ name, path, hy, load: res });
  if (n) n.getComponent(cc.Sprite).spriteFrame = res;
  // 背景上下裁切按图走(SCENE_BG_TOP_CROP,2026-10-13):换图后按新口径重摆背景节点
  if (n && r.sceneBgCenterY) { const H = r.layoutHeight, W = r.layoutWidth, bgH = 1152 * Math.max(W / 2048, H / 1152); n.setPosition(0, r.sceneBgCenterY(bgH, H), 0); }
  // 石台按主题换皮(2026-10-13):改完关卡码后重画格子,让新石台进截图
  try { r.paintLanesAndGrid(); } catch (e) { void e; }
  await new Promise(z => setTimeout(z, 1800));
  return JSON.stringify({ name, path, hy, tex: res.texture.width + 'x' + res.texture.height, swapped: !!n }); })()"""


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

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(SHOTS, f'{TAG}_{VP}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                print('shot', name, flush=True)

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
            await asyncio.sleep(2)
            for theme in ('AWAKEN', 'ARCANE', 'ABYSS', 'FORGE'):
                print(theme, await ev(SWAP % f'DAILY_{theme}_1', 120), flush=True)
                await shot('daily_' + theme.lower())
    finally:
        proc.terminate()


asyncio.run(main())
