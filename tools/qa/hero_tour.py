# -*- coding: utf-8 -*-
"""英雄详情多页签/弹窗巡检(hero 工作流专用,复制自 panel_tour.py)。
用法:EDGE_PORT=9371 EDGE_PROFILE=edge_wf_hero python -u hero_tour.py <tag> 844x390m 667x375m 1600x900 [--only attr,equip,...] [--hero 妮克丝]"""
import asyncio, base64, json, os, sys, time, subprocess, urllib.request
import websockets
import boss_bar_cdp as base

args = sys.argv[1:]
TAG = args[0]
VIEWS = [a for a in args[1:] if 'x' in a and not a.startswith('--')]
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None
HERO = args[args.index('--hero') + 1] if '--hero' in args else '妮克丝'
USER = 1
SHOTS = os.path.join(base.SCRATCH, 'shots', 'hero')
os.makedirs(SHOTS, exist_ok=True)
IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

OPEN_DETAIL = """(async () => { r.openLobbyHeroRosterPanel(); for (let i = 0; i < 60 && !(r.lobbyHeroRosterState.panelState.heroes || []).length; i++) await new Promise(z => setTimeout(z, 300));
 await new Promise(z => setTimeout(z, 1500)); const hs = r.lobbyHeroRosterState.panelState.heroes; const h = hs.find(x => (x.heroName||'').includes(%s)) || hs[0]; r.openLobbyHeroDetail(h.heroId || h.id); })()""" % json.dumps(HERO)

FIND_FRAME = "(() => { let panel=null; const w = n => { if (panel) return; if (n.name === 'LobbyHeroDetailSceneFrame') { panel = n; return; } n.children.forEach(w); }; w(window.__cc.director.getScene()); return panel; })()"

# (名字, 表达式, 等待秒);依次执行,不关闭(状态逐步推进)
STEPS = [
    ('attr', OPEN_DETAIL, 6),
    ('attrpop', "(() => { const b = findNode('LobbyHeroDetailAttrDetailBtn'); if (!b) return 'no btn'; b.emit(window.__cc.Button.EventType.CLICK); return 'clicked'; })()", 2),
    ('ult', "(() => { const o = findNode('LobbyHeroAttrDetailOverlay'); if (o) o.destroy(); r.openLobbyHeroUltimateDialog(); })()", 2),
    ('refine', "(() => { r.closeLobbyHeroUltimateDialog(); r.openLobbyHeroRefineDialog(); })()", 2),
    ('equip', "(() => { r.closeLobbyHeroRefineDialog(); r.selectLobbyHeroDetailTab('equip'); })()", 4),
    ('equipscroll', "(async () => { const sv = findNode('WearGridScrollView'); if (!sv) return 'no scrollview'; const c = sv.getComponent(window.__cc.ScrollView); c.scrollToBottom(0.1); await new Promise(z => setTimeout(z, 600)); return 'content y=' + Math.round(c.content.position.y) + ' h=' + Math.round(c.content.getComponent(window.__cc.UITransform).height); })()", 2),
    ('skill', "(() => { r.selectLobbyHeroDetailTab('skill'); })()", 3),
    ('star', "(() => { r.selectLobbyHeroDetailTab('star'); })()", 3),
    ('awaken', "(() => { const p = r.lobbyHeroDetailPanelRenderer; p.isHeroAwakenable = () => true; p.openAwakenDialog(r.currentLobbyHeroDetailHero()); })()", 2),
]
EXTRA = os.environ.get('HERO_EXTRA')  # 额外 JSON 步骤 [[name, expr, wait], ...] 覆盖默认
if EXTRA:
    STEPS = [tuple(s) for s in json.loads(open(EXTRA, encoding='utf-8').read())]
    STEPS = [(n, e.replace('__OPEN_DETAIL__', OPEN_DETAIL).replace('__FRAME__', FIND_FRAME), w) for n, e, w in STEPS]


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
                        if m.get('id') == my:
                            return m

                async def ev(expr, timeout=400):
                    r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                    return r.get('result', {}).get('value') if 'exceptionDetails' not in r else 'EXC ' + str(r['exceptionDetails'].get('exception', {}).get('description', r['exceptionDetails']))[:240]

                await call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                                   'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                if mobile:
                    await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                    await call('Network.setUserAgentOverride', {'userAgent': IPHONE_UA, 'platform': 'iPhone'})
                tok = json.load(urllib.request.urlopen(urllib.request.Request('http://localhost:8081/api/player/auth/dev-login', data=json.dumps({'userId': USER}).encode(), headers={'Content-Type': 'application/json'}, method='POST'), timeout=10))['data']
                SETLS = "localStorage.setItem('lootchain.player.tokenName',%s);localStorage.setItem('lootchain.player.tokenValue',%s);localStorage.setItem('lootchain.player.userId','%d');" % (json.dumps(tok['tokenName']), json.dumps(tok['tokenValue']), USER)
                await call('Page.addScriptToEvaluateOnNewDocument', {'source': "try{localStorage.setItem('lootchain.player.tokenName',%s);localStorage.setItem('lootchain.player.tokenValue',%s);localStorage.setItem('lootchain.player.userId','%d');}catch(e){}" % (json.dumps(tok['tokenName']), json.dumps(tok['tokenValue']), USER)})
                for attempt in range(4):
                    await call('Page.navigate', {'url': base.PAGE})
                    await asyncio.sleep(8)
                    boot = await ev(base.JS_BOOT, 900)
                    print(vp, 'boot', attempt, boot)
                    if isinstance(boot, str) and boot.startswith('inited'):
                        break
                    await asyncio.sleep(10)
                print(vp, 'login', await ev("(async () => { const r = window.__root; const log = []; for (let k = 0; k < 4 && r.currentView !== 'lobby'; k++) { if (r.currentView === 'login') { %s try { await r.api.profile.lobbyProfile(); } catch (e) { log.push('probe ' + (e && (e.message || e.code || JSON.stringify(e)))); } try { await r.tryResumeSession(); } catch (e) {} } for (let i = 0; i < 40 && r.currentView !== 'lobby'; i++) await new Promise(z => setTimeout(z, 500)); } return 'view=' + r.currentView + ' ' + log.join(';'); })()" % SETLS, 200))
                await asyncio.sleep(3)
                WAIT_SCALE = float(os.environ.get('TOUR_WAIT_SCALE', '1'))
                for name, expr, wait in STEPS:
                    res = await ev(f"(async () => {{ const r = window.__root; const findNode = (name) => {{ let f = null; const w = n => {{ if (f) return; if (n.name === name) {{ f = n; return; }} n.children.forEach(w); }}; w(window.__cc.director.getScene()); return f; }}; try {{ var v = await ({expr}); }} catch (e) {{ return 'err ' + e.message; }} await new Promise(z => setTimeout(z, {int(wait * 1000 * WAIT_SCALE)})); return 'ok view=' + r.currentView + ' ' + (typeof v === 'string' ? v : ''); }})()", 180)
                    if ONLY and name not in ONLY:
                        print(vp, name, '(no shot)', res)
                        continue
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    path = os.path.join(SHOTS, f'{TAG}_{vp}_{name}.png')
                    open(path, 'wb').write(base64.b64decode(m['result']['data']))
                    print(vp, name, res)
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{base.PORT}/json/close/{t['id']}", timeout=5)
            except Exception:
                pass
    finally:
        proc.terminate()


if __name__ == '__main__':
    asyncio.run(main())
