# -*- coding: utf-8 -*-
"""背包物品详情预览截图:强化石 + 一件高稀有度道具,用于和原型图对比。
用法:PREVIEW_PORT=7456 python tools/qa/bag_detail_compare.py <tag> [1200x540m]
  视口默认 1200x540m(DSF 2 → 2400×1080,与 20:9 模拟器一致);输出 %TEMP%/lootchain-qa/shots/tour/<tag>_<vp>_bag_{stone,rare}.png
  建议 EDGE_PROFILE=edge_ult_profile(与终极技能共用) 用独立 profile,避免旧 chunk 缓存。"""
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

# 背包 → 等道具到货 → 选中 pick 的道具 → 打开详情;pick 是挑道具的 JS 表达式(items = 全部道具)
OPEN_BAG = r"""(async () => {{ const r = window.__root; const sleep = ms => new Promise(z => setTimeout(z, ms));
  try {{ r.closeAllLobbyScenePanelFlags && r.closeAllLobbyScenePanelFlags(); }} catch (e) {{}}
  r.currentView = 'lobby'; r.renderCurrentView(); await sleep(400);
  r.openLobbyBagPanel();
  const all = () => ((r.currentLobbyBagState().groups) || []).flatMap(g => g.items || []);
  for (let i = 0; i < 80 && all().length === 0; i++) await sleep(300);
  const items = all(); if (!items.length) return 'no items';
  const it = {pick}; if (!it) return 'no item';
  // 背包首开有素材加载门:反复选中直到详情节点出现(最多 ~90s),再等图标到货
  const cc = window.__cc; const has = () => {{ let f = false; const w = n => {{ if (f) return; if (n.name === 'LobbyBagItemDetail') {{ f = true; return; }} n.children.forEach(w); }}; w(cc.director.getScene()); return f; }};
  r.lobbyBagPanelRenderer.detailPopupOpen = true; r.selectLobbyBagItem(it.itemCode); r.refreshLobbyOverlay(); await sleep(1500);
  for (let i = 0; i < 45 && !has(); i++) {{ r.lobbyBagPanelRenderer.detailPopupOpen = true; r.selectLobbyBagItem(it.itemCode); r.refreshLobbyOverlay(); await sleep(2000); }}
  await sleep(7000);
  return 'item=' + it.itemCode + ' rarity=' + it.rarity; }})()"""
PICK_STONE = "items.find(i => /^ENHANCE_STONE$/.test(i.itemCode || '')) || items[0]"
PICK_RARE = "items.find(i => /SSR|UR/.test(i.rarity || '')) || items.find(i => /SR/.test(i.rarity || '')) || items[items.length - 1]"


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
            print('stone', await ev(OPEN_BAG.format(pick=PICK_STONE), 300), flush=True)
            await shot('bag_stone')
            print('rare', await ev(OPEN_BAG.format(pick=PICK_RARE), 300), flush=True)
            await shot('bag_rare')
    finally:
        proc.terminate()


asyncio.run(main())
