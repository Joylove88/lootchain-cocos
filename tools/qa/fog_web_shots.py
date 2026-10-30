# -*- coding: utf-8 -*-
"""迷雾贴边自验(2026-10-30 用户:站在迷雾位置雾不散——邻格云团放大 2.5 倍盖过已点亮格):无头 Edge 打开网页包 → 登录 QA 号 →
林地 → 瞬移到几处新格(每处停 2 秒等点亮)→ 截全屏(含小地图)+ 打开地图页截图。
用法:PREVIEW_PORT=7460 python tools/qa/fog_web_shots.py <输出目录>
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'fog_web_shots'))
GPU = '--gpu' in sys.argv
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_fog'
    shutil.rmtree(profile, ignore_errors=True)
    flags = [] if GPU else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', *flags, 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(body, timeout=120):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 80}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                # currentView 初始值就是 login:要等启动下载页结束(下载器登记 = 开局包下完)才算真正到登录页
                if view in ('login', 'lobby', 'loginAccount') and await ev("return (window.__lootchainPack && !root.bootPreloadActive) ? 'y' : 'n';") == 'y':
                    break
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;")
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            for i in range(8):
                await asyncio.sleep(3)
                print('  pack', await ev("const P = window.__lootchainPack; const g = root.uiSpriteFrameCache.groupDownloads; const names = []; root.node.walk(n => { if (/Loading/.test(n.name)) names.push(n.name); }); "
                                         "return JSON.stringify({ view: root.currentView, urgent: P && P.urgent.length, queue: P && P.queue.length, inFlight: P && P.inFlight.size, running: P && P.running, started: P && P.started, paused: P && P.paused, waiters: P && P.waiters.map(w => w.need.size + '/' + w.total), failed: P && P.failed.size, groups: Array.from(g.entries()), loading: names });"), flush=True)
            T = "const t = root.lobbyTownRenderer; const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
            await ev("if (root.lobbyTownRenderer.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(120):
                if await ev(T + " return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(6)
            print('lit before', await ev(T + " return JSON.stringify(Array.from(t.exploreLitCells()));"), flush=True)
            await shot('00_start')
            # 从出生点往一个方向走几格:每格停 2.5 秒(点亮检测 0.4 秒一次 + 上报)
            pts = json.loads(await ev(T + " const w = t.def.width, h = t.def.height; const x0 = t.leader.x, y0 = t.leader.y; "
                                      "return JSON.stringify([[x0 + w / 8, y0], [x0 + w / 4, y0], [x0 + w / 4, y0 + h / 5]]);"))
            for i, (x, y) in enumerate(pts):
                await ev(T + f" tp({x}, {y}); return 1;")
                await asyncio.sleep(2.5)
                await shot(f'01_step{i}')
            print('lit after', await ev(T + " return JSON.stringify(Array.from(t.exploreLitCells()));"), flush=True)
            await ev("setTimeout(() => root.openAreaMapPanel(), 30); return 1;")
            await asyncio.sleep(4)
            await shot('02_areamap')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
