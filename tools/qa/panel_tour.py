# -*- coding: utf-8 -*-
"""多分辨率逐界面巡检:每个视口登录一次,然后依次直接调 GameRoot 的 open* 打开各界面截图、再 close* 关掉。
用法:EDGE_PORT=9355 EDGE_PROFILE=edge_boss_profile8 python panel_tour.py <tag> 844x390m 1024x768m ... [--only bag,shop_gold]"""
import asyncio, base64, json, os, sys, time, subprocess, urllib.request
import websockets
import boss_bar_cdp as base

args = sys.argv[1:]
TAG = args[0]
VIEWS = [a for a in args[1:] if 'x' in a and not a.startswith('--')]
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None
USER = int(args[args.index('--user') + 1]) if '--user' in args else None
SHOTS = os.path.join(base.SCRATCH, 'shots', 'tour')
os.makedirs(SHOTS, exist_ok=True)
IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

# (名字, 打开表达式, 关闭表达式, 打开后等待秒)
STEPS = [
    ('adventure', 'r.openLobbyAdventurePanel()', 'r.closeLobbyAdventurePanel()', 4),
    ('bag', 'r.openLobbyBagPanel()', 'r.closeLobbyBagPanel()', 4),
    ('forge', 'r.openLobbyForgePanel()', 'r.closeLobbyForgePanel()', 4),
    ('codex', 'r.openLobbyCodexPanel()', 'r.closeLobbyCodexPanel()', 4),
    ('formation', 'r.openLobbyFormationPanel()', 'r.closeLobbyFormationPanel()', 4),
    ('roster', 'r.openLobbyHeroRosterPanel()', 'r.closeLobbyHeroRosterPanel()', 6),
    ('herodetail', '(async () => { r.openLobbyHeroRosterPanel(); for (let i = 0; i < 60 && !(r.lobbyHeroRosterState.panelState.heroes || []).length; i++) await new Promise(z => setTimeout(z, 300)); await new Promise(z => setTimeout(z, 1500)); r.openLobbyHeroDetail(r.lobbyHeroRosterState.panelState.heroes[0].heroId); })()',
     'r.closeLobbyHeroDetailPanel(); r.closeLobbyHeroRosterPanel && r.closeLobbyHeroRosterPanel()', 6),
    ('daily', 'r.openLobbyDailyDungeonPanel()', 'r.closeLobbyDailyDungeonPanel()', 4),
    ('gacha', 'r.openLobbyGachaScene()', 'r.closeGachaScene()', 5),
    ('quest', 'r.openLobbyQuestPanel()', 'r.closeLobbyQuestPanel()', 4),
    ('mail', 'r.openLobbyMailPanel()', 'r.closeLobbyMailPanel()', 3),
    ('more', 'r.openLobbyMorePanel()', 'r.closeLobbyMorePanel()', 3),
    ('settings', 'r.openLobbySettingsPanel()', 'r.closeLobbySettingsPanel()', 3),
    ('notice', 'r.openLobbyNoticePanel()', 'r.closeLobbyNoticePanel()', 3),
    ('profile', 'r.openPlayerProfileDialog()', 'r.closePlayerProfileDialog()', 3),
    ('shop_gold', "r.openLobbyShopDialog('gold')", 'r.closeLobbyShopDialog()', 4),
    ('shop_diamond', "r.openLobbyShopDialog('diamond')", 'r.closeLobbyShopDialog()', 4),
    ('shop_stamina', "r.openLobbyShopDialog('stamina')", 'r.closeLobbyShopDialog()', 4),
    ('crystal', 'r.openGuardCrystalDialog()', 'r.closeGuardCrystalDialog()', 6),
    ('furnace', 'r.openLobbyTokenFurnace()', 'r.closeLobbyTokenFurnace()', 4),
    ('challenge', "r.openLobbyBattlePreviewPanel('MAIN_1_1')", 'r.closeLobbyBattlePreviewPanel(); r.returnToLobbyFromBattlePreview && r.returnToLobbyFromBattlePreview()', 5),
]


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
        for vp in VIEWS:
            mobile = vp.endswith('m')
            w, h = [int(v) for v in vp.rstrip('m').split('x')]
            t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
            async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
                seq = 0

                async def call(method, params=None, timeout=400):
                    nonlocal seq
                    seq += 1
                    my = seq
                    await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                    while True:
                        m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                        if m.get('method') == 'Runtime.exceptionThrown':
                            d = m['params']['exceptionDetails']
                            print('  !! page exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:700], flush=True)
                        if m.get('id') == my:
                            return m

                async def ev(expr, timeout=400):
                    r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                    return r.get('result', {}).get('value') if 'exceptionDetails' not in r else 'EXC ' + str(r['exceptionDetails'].get('exception', {}).get('description', r['exceptionDetails']))[:240]

                await call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                                   'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Runtime.enable')
                if mobile:
                    await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                    await call('Network.setUserAgentOverride', {'userAgent': IPHONE_UA, 'platform': 'iPhone'})
                if USER:
                    tok = json.load(urllib.request.urlopen(urllib.request.Request('http://localhost:8081/api/player/auth/dev-login', data=json.dumps({'userId': USER}).encode(), headers={'Content-Type': 'application/json'}, method='POST'), timeout=10))['data']
                    await call('Page.addScriptToEvaluateOnNewDocument', {'source': "try{localStorage.setItem('lootchain.player.tokenName',%s);localStorage.setItem('lootchain.player.tokenValue',%s);localStorage.setItem('lootchain.player.userId','%d');}catch(e){}" % (json.dumps(tok['tokenName']), json.dumps(tok['tokenValue']), USER)})
                SETLS = ("localStorage.setItem('lootchain.player.tokenName',%s);localStorage.setItem('lootchain.player.tokenValue',%s);localStorage.setItem('lootchain.player.userId','%d');" % (json.dumps(tok['tokenName']), json.dumps(tok['tokenValue']), USER)) if USER else ''
                await call('Page.navigate', {'url': base.PAGE})
                await asyncio.sleep(8)
                print(vp, 'boot', await ev(base.JS_BOOT, 900))
                print(vp, 'login', await ev(base.JS_LOGIN, 120) if not USER else await ev("(async () => { const r = window.__root; %s const ls = [localStorage.getItem('lootchain.player.tokenName'), (localStorage.getItem('lootchain.player.tokenValue')||'').slice(0,6), localStorage.getItem('lootchain.player.userId')]; if (r.currentView === 'login') { try { await r.tryResumeSession(); } catch (e) { return 'resume err ' + e.message + ' ls=' + ls; } } for (let i = 0; i < 120 && r.currentView !== 'lobby'; i++) await new Promise(z => setTimeout(z, 500)); return 'view=' + r.currentView; })()" % SETLS, 90))
                await asyncio.sleep(3)
                WAIT_SCALE = float(os.environ.get('TOUR_WAIT_SCALE', '1'))
                for name, opener, closer, wait in STEPS:
                    if ONLY and name not in ONLY:
                        continue
                    res = await ev(f"(async () => {{ const r = window.__root; try {{ await ({opener}); }} catch (e) {{ return 'open err ' + e.message; }} await new Promise(z => setTimeout(z, {int(wait * 1000 * WAIT_SCALE)})); return 'ok view=' + r.currentView; }})()", 120)
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    path = os.path.join(SHOTS, f'{TAG}_{vp}_{name}.png')
                    if 'result' in m:
                        open(path, 'wb').write(base64.b64decode(m['result']['data']))
                    else:
                        print('  !! screenshot failed', str(m.get('error'))[:300], flush=True)
                    cl = await ev(f"(async () => {{ const r = window.__root; try {{ {closer}; }} catch (e) {{ return 'close err ' + e.message; }} await new Promise(z => setTimeout(z, 800)); return 'view=' + r.currentView; }})()", 60)
                    print(vp, name, res, "|", cl, flush=True)
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{base.PORT}/json/close/{t['id']}", timeout=5)
            except Exception:
                pass
    finally:
        proc.terminate()


if __name__ == '__main__':
    asyncio.run(main())
