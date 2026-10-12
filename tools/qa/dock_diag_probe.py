# -*- coding: utf-8 -*-
"""诊断:详情页局部按钮态是否可用(dockButtons / setDockPending / markHeroDockPending / 整刷压制)。
用法:PREVIEW_PORT=7456 python dock_diag_probe.py"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OPEN_DETAIL = r"""(async () => { const r = window.__root; r.openLobbyHeroRosterPanel();
  const pick = () => (r.lobbyHeroRosterLoader.currentState().heroes || []).find(h => h.id > 0 && !/^EX/i.test(h.rarity) && !/^EX_/i.test(h.heroCode));
  for (let i = 0; i < 60 && !pick(); i++) await new Promise(z => setTimeout(z, 300));
  await new Promise(z => setTimeout(z, 1200)); r.openLobbyHeroDetail(pick().id);
  const cc = window.__cc; const find = () => { let b = null; const w = n => { if (b) return; if (n.name === 'LobbyHeroDetailLevelUpButton') { b = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return b; };
  for (let i = 0; i < 120 && !find(); i++) await new Promise(z => setTimeout(z, 500));
  return 'button=' + !!find(); })()"""
DIAG = r"""(() => { const r = window.__root, p = r.lobbyHeroDetailPanelRenderer; const out = {};
  out.dockLen = p.dockButtons ? p.dockButtons.length : 'undefined';
  out.alive = (p.dockButtons || []).map(e => [e.node.name, e.node.isValid, e.node.activeInHierarchy, e.idleEnabled]);
  out.hasMark = typeof r.markHeroDockPending; out.hasHold = 'heroGrowthHoldUntil' in r;
  out.setPendingTrue = p.setDockPending ? p.setDockPending(true) : 'no fn';
  out.labelAfter = (p.dockButtons || []).map(e => e.label.string);
  out.setPendingFalse = p.setDockPending ? p.setDockPending(false) : 'no fn';
  return JSON.stringify(out); })()"""


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
                    if x.get('id') == my:
                        return x

            async def ev(e, timeout=600):
                r = (await call('Runtime.evaluate', {'expression': e, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT, 900))
            for _try in range(3):
                res = await ev(base.JS_LOGIN, 120)
                print(res, flush=True)
                if 'view=lobby' in str(res):
                    break
                await asyncio.sleep(10)
            print('detail', await ev(OPEN_DETAIL), flush=True)
            print('diag', await ev(DIAG), flush=True)
    finally:
        proc.terminate()


if __name__ == '__main__':
    asyncio.run(main())
