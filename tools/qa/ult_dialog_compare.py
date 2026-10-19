# -*- coding: utf-8 -*-
"""终极技能升级弹窗预览截图(不真升级):到上限态 + 可升级态各一张,用于和原型图对比。
用法:PREVIEW_PORT=7456 python tools/qa/ult_dialog_compare.py <tag> [1200x540m]
  视口默认 1200x540m(DSF 2 → 2400×1080,与 20:9 模拟器一致);输出 %TEMP%/lootchain-qa/shots/tour/<tag>_<vp>_ult_{capped,lv1}.png
  建议 EDGE_PROFILE=edge_ult_profile 用独立 profile,避免旧 chunk 缓存。"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1]
VP = sys.argv[2] if len(sys.argv) > 2 else '1200x540m'
mobile = VP.endswith('m')
W, H = [int(v) for v in VP.rstrip('m').split('x')]
SHOTS = os.path.join(base.SCRATCH, 'shots', 'tour')
os.makedirs(SHOTS, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

# 等名册到货 → 按大招等级挑英雄 → 详情 → 技能页 → 弹窗;pick 是挑英雄的 JS 表达式(all = 名册里 id>0 的英雄)
OPEN_ULT = r"""(async () => {{ const r = window.__root; const sleep = ms => new Promise(z => setTimeout(z, ms));
  try {{ r.closeAllLobbyScenePanelFlags && r.closeAllLobbyScenePanelFlags(); }} catch (e) {{}}
  r.currentView = 'lobby'; r.renderCurrentView(); await sleep(400);
  r.openLobbyHeroRosterPanel();
  const roster = () => (r.lobbyHeroRosterLoader.currentState().heroes || []).filter(h => h.id > 0);
  for (let i = 0; i < 80 && roster().length === 0; i++) await sleep(300);
  const all = roster(); if (!all.length) return 'no roster';
  const h = {pick}; if (!h) return 'no hero';
  await sleep(600); r.openLobbyHeroDetail(h.id);
  const cc = window.__cc; const gateOpen = () => {{ let b = null; const w = n => {{ if (b) return; if (n.name === 'LobbyHeroDetailLevelUpButton') {{ b = n; return; }} n.children.forEach(w); }}; w(cc.director.getScene()); return !!b; }};
  for (let i = 0; i < 240 && !gateOpen(); i++) await sleep(500);
  await sleep(1200); r.selectLobbyHeroDetailTab('skill'); await sleep(1200);
  r.openLobbyHeroUltimateDialog(); await sleep(3000);
  return 'hero=' + h.id + ' ult=' + h.ultimateSkillLevel + ' open=' + r.lobbyHeroUltimateDialogOpen; }})()"""
PICK_CAPPED = "all.find(x => (x.ultimateSkillLevel || 1) >= 5 && x.awakenStatus !== 1) || all[0]"
PICK_LV1 = "all.find(x => (x.ultimateSkillLevel || 1) < 5) || all[0]"


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
                path = os.path.join(SHOTS, f'{TAG}_{VP}_{name}.png')
                if 'result' in m:
                    open(path, 'wb').write(base64.b64decode(m['result']['data']))
                print('shot', path, flush=True)

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            if mobile:
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT, 900), flush=True)
            for _try in range(3):
                res = await ev(base.JS_LOGIN, 120)
                print('login', res, flush=True)
                if 'view=lobby' in str(res):
                    break
                await asyncio.sleep(10)
            print('capped', await ev(OPEN_ULT.format(pick=PICK_CAPPED), 300), flush=True)
            await shot('ult_capped')
            print('lv1', await ev(OPEN_ULT.format(pick=PICK_LV1), 300), flush=True)
            await shot('ult_lv1')
    finally:
        proc.terminate()


asyncio.run(main())
