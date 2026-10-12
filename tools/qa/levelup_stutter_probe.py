# -*- coding: utf-8 -*-
"""英雄升级 / 升星卡顿与特效位置探针(2026-10-12 用户录屏反馈)。
进详情页后挂 rAF 帧间隔记录器 + 包一层 renderCurrentView 计时,点升级 / 升星,记录 4 秒内的长帧(>50ms)及其相对点击的时刻,
同时读出英雄舞台、庆祝特效、战力飘字的世界坐标做位置核对,并在 +0.4s / +1.0s 截图。
用法:PREVIEW_PORT=7456 python levelup_stutter_probe.py <tag> [915x412m|1600x900] [--star]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1]
VP = next((a for a in sys.argv[2:] if 'x' in a and not a.startswith('--')), '915x412m')
STAR = '--star' in sys.argv
mobile = VP.endswith('m')
W, H = [int(v) for v in VP.rstrip('m').split('x')]
SHOTS = os.path.join(base.SCRATCH, 'shots', 'tour')
os.makedirs(SHOTS, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

OPEN_DETAIL = r"""(async () => { const r = window.__root; r.openLobbyHeroRosterPanel();
  const pick = () => (r.lobbyHeroRosterLoader.currentState().heroes || []).find(h => h.id > 0 && !/^EX/i.test(h.rarity) && !/^EX_/i.test(h.heroCode));
  for (let i = 0; i < 60 && !pick(); i++) await new Promise(z => setTimeout(z, 300));
  await new Promise(z => setTimeout(z, 1200)); r.openLobbyHeroDetail(pick().id); await new Promise(z => setTimeout(z, 3500));
  const h = pick(); return JSON.stringify({ name: h.heroName, level: h.level, star: h.star, power: h.power }); })()"""
SWITCH_STAR = r"""(async () => { const r = window.__root; r.lobbyHeroDetailTab = 'star'; r.renderCurrentView(); await new Promise(z => setTimeout(z, 1500)); return r.lobbyHeroDetailTab; })()"""
INSTALL = r"""(() => { const r = window.__root; if (window.__probe) return 'installed';
  const p = window.__probe = { frames: [], renders: [], t0: 0 };
  let last = performance.now();
  const tick = (t) => { p.frames.push([t - p.t0, t - last]); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const orig = r.renderCurrentView.bind(r);
  r.renderCurrentView = () => { const a = performance.now(); const who = (new Error().stack || '').split('\n').slice(2, 6).map(l => l.trim().replace(/^at /, '').replace(/\s*\(.*$/, '')).join('<'); orig(); p.renders.push([a - p.t0, performance.now() - a, r.currentView, who]); };
  return 'ok'; })()"""
TAP = r"""(async () => { const cc = window.__cc; const name = '__BTN__'; let b = null; const find = () => { b = null; const w = n => { if (b) return; if (n.name === name) { b = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return b; };
  for (let i = 0; i < 120 && !find(); i++) await new Promise(z => setTimeout(z, 500));
  if (!b) return 'no button ' + name; window.__probe.t0 = performance.now(); window.__probe.frames.length = 0; window.__probe.renders.length = 0;
  b.emit(cc.Button.EventType.CLICK, b.getComponent(cc.Button)); return 'tapped'; })()"""
POS = r"""(() => { const cc = window.__cc; const out = {}; const names = ['LobbyHeroDetailArtStage', 'LobbyHeroDetailSpineNode', 'LobbyHeroDetailCelebrateFx', 'LobbyPowerFloatLayer'];
  const w = n => { if (names.indexOf(n.name) >= 0 || /^LobbyPowerDeltaFloat_|^LobbyPowerSurge_|^LobbySpineFx/.test(n.name)) { const ut = n.getComponent(cc.UITransform); const wp = n.worldPosition; out[n.name] = { x: Math.round(wp.x), y: Math.round(wp.y), w: ut ? Math.round(ut.width) : 0, h: ut ? Math.round(ut.height) : 0, sx: +n.scale.x.toFixed(3) }; } n.children.forEach(w); };
  w(cc.director.getScene()); return JSON.stringify(out); })()"""
REPORT = r"""(() => { const p = window.__probe; const win = p.frames.filter(f => f[0] >= 0 && f[0] <= 5000); const gaps = win.map(f => f[1]).sort((a, b) => a - b);
  const longF = win.filter(f => f[1] > 120).map(f => [Math.round(f[0]), Math.round(f[1])]);
  return JSON.stringify({ renders: p.renders.map(x => [Math.round(x[0]), Math.round(x[1]), x[3]]), frames5s: win.length, medianGap: Math.round(gaps[Math.floor(gaps.length / 2)] || 0), p95Gap: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0), over120ms: longF }); })()"""


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
            for _try in range(3):
                res = await ev(base.JS_LOGIN, 120)
                print(res, flush=True)
                if 'view=lobby' in str(res):
                    break
                await asyncio.sleep(10)
            await asyncio.sleep(2)
            print('detail', await ev(OPEN_DETAIL), flush=True)
            if STAR:
                print('tab', await ev(SWITCH_STAR), flush=True)
            print('install', await ev(INSTALL))
            print('pos before', await ev(POS), flush=True)
            await shot('before')
            print('tap', await ev(TAP.replace('__BTN__', 'StarUpButton' if STAR else 'LobbyHeroDetailLevelUpButton')), flush=True)
            await asyncio.sleep(0.4)
            print('pos +0.4s', await ev(POS), flush=True)
            await shot('t04')
            await asyncio.sleep(0.6)
            print('pos +1.0s', await ev(POS), flush=True)
            await shot('t10')
            await asyncio.sleep(3)
            print('report', await ev(REPORT), flush=True)
    finally:
        proc.terminate()


asyncio.run(main())
