# -*- coding: utf-8 -*-
"""2026-10-11 用户反馈项截图:① 英雄升级(点钮后 +0.25s/+0.7s/+1.6s/+3.6s 看按钮态 / 庆祝特效 / 战力飘字顺序)
② 五个面板统一读取态(强制 loading 标志) ③ 能量条去光环(走 battle_tour --ui-check)。
用法:PREVIEW_PORT=7456 python ui_levelup_tour.py <tag> [915x412m]"""
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

OPEN_DETAIL = r"""(async () => { const r = window.__root; r.openLobbyHeroRosterPanel();
  const pick = () => (r.lobbyHeroRosterLoader.currentState().heroes || []).find(h => h.id > 0 && !/^EX/i.test(h.rarity) && !/^EX_/i.test(h.heroCode));
  for (let i = 0; i < 60 && !pick(); i++) await new Promise(z => setTimeout(z, 300));
  await new Promise(z => setTimeout(z, 1200)); r.openLobbyHeroDetail(pick().id); await new Promise(z => setTimeout(z, 3500));
  const h = pick(); return JSON.stringify({ name: h.heroName, level: h.level, power: h.power }); })()"""
TAP_LEVELUP = r"""(() => { const cc = window.__cc; let b = null; const w = n => { if (b) return; if (n.name === 'LobbyHeroDetailLevelUpButton') { b = n; return; } n.children.forEach(w); };
  w(cc.director.getScene()); if (!b) return 'no button'; b.emit(cc.Button.EventType.CLICK, b.getComponent(cc.Button)); return 'tapped'; })()"""
STATE = r"""(() => { const cc = window.__cc, r = window.__root; let b = null, fx = 0, fl = 0;
  const w = n => { if (n.name === 'LobbyHeroDetailLevelUpButtonLabel') b = n; if (n.name === 'LobbyHeroDetailCelebrateFx') fx++; if (/^LobbyPowerDeltaFloat_/.test(n.name)) fl++; n.children.forEach(w); };
  w(cc.director.getScene()); const lab = b && b.getComponent(cc.Label);
  return JSON.stringify({ btn: lab ? lab.string : null, celebrateFx: fx, floats: fl, busy: r.lobbyHeroLevelUpBusyId, status: String(r.lastStatusText || '').slice(0, 40) }); })()"""
# 强制各面板进入 loading 态(不依赖网络时序);字段名按 GameRoot 当前实现,找不到的会打印 err
LOADING = {
    'roster': "r.closeAllLobbyScenePanelFlags(); const h = r.lobbyHeroRosterLoader.currentState(); h.loading = true; h.loaded = false; h.heroes = []; r.openLobbyHeroRosterPanel();",
    'daily': "r.closeAllLobbyScenePanelFlags(); const d = r.lobbyDailyDungeonState; d.loading = true; d.summary = null; r.openLobbyDailyDungeonPanel();",
    'crystal': "r.closeAllLobbyScenePanelFlags(); r.openGuardCrystalDialog(); const c = r.lobbyGuardCrystalDialog; if (c) { c.loading = true; c.info = null; } r.renderCurrentView();",
    'codex': "r.closeAllLobbyScenePanelFlags(); r.closeGuardCrystalDialog && r.closeGuardCrystalDialog(); const x = r.lobbyCodexLoader.currentState(); x.loading = true; x.entries = []; x.loaded = false; r.openLobbyCodexPanel();",
    'quest': "r.closeAllLobbyScenePanelFlags(); r.closeGuardCrystalDialog && r.closeGuardCrystalDialog(); const q = r.lobbyQuestState; q.loading = true; q.summary = null; r.openLobbyQuestPanel();",
}


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
            # ① 升级时序
            print('detail', await ev(OPEN_DETAIL), flush=True)
            await shot('lv_before')
            print('S0', await ev(STATE))
            print(await ev(TAP_LEVELUP))
            for wait, tag in ((0.25, 't025'), (0.45, 't070'), (0.9, 't160'), (2.0, 't360')):
                await asyncio.sleep(wait)
                print('S+' + tag, await ev(STATE), flush=True)
                await shot('lv_' + tag)
            # ② 五面板读取态
            for key, js in LOADING.items():
                res = await ev("(async () => { const r = window.__root; try { %s } catch (e) { return 'err ' + e.message; } await new Promise(z => setTimeout(z, 1800)); return r.currentView; })()" % js)
                print('loading', key, res, flush=True)
                await shot('loading_' + key)
                await ev("(() => { const r = window.__root; r.closeGuardCrystalDialog && r.closeGuardCrystalDialog(); r.closeAllLobbyScenePanelFlags(); r.currentView = 'lobby'; r.renderCurrentView(); return 1; })()")
                await asyncio.sleep(0.8)
    finally:
        proc.terminate()


asyncio.run(main())
