"""野外兴趣点自验(docs/54,2026-10-30):无头 Edge 打开网页包 → 登录(NEW_USER=1 注册新号进晨风村;否则 guidetest02,POI_MAP=WOODS 去林地)→
逐个兴趣点:隐藏点走近自动弹「发现」卡、石碑按交互打开阅读面板、采集点读条 2 秒后飘字 → 打开地图页截图;打印探索度前后变化。
用法:[NEW_USER=1] [POI_MAP=WOODS] [SHOWCASE=1 只远看截图] PREVIEW_PORT=7460 python tools/qa/poi_web_shots.py <输出目录>
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'poi_web_shots'))
GPU = '--gpu' in sys.argv
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_poi'
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
            if view != 'lobby' and os.environ.get('NEW_USER') == '1':
                acct = 'poi' + str(int(time.time()))[-8:]
                await ev("root.loginFlow.setInputs({string:'" + acct + "'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.register()); return 1;")
                for _ in range(60):
                    v = await ev("return root.currentView;")
                    if v in ('protagonistCreate', 'lobby'):
                        break
                    await asyncio.sleep(1)
                if v == 'protagonistCreate':
                    await ev("root.protagonistCreateFlow.nameInput = { string: '兴趣" + acct[-4:] + "' }; root.submitProtagonistCreate(); return 1;")
                print('new account', acct, v, flush=True)
            elif view != 'lobby':
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
            MAP = os.environ.get('POI_MAP', 'VILLAGE')
            if MAP != 'VILLAGE':
                await ev(f"if (root.lobbyTownRenderer.def.code !== '{MAP}') setTimeout(() => root.travelWorldMap('{MAP}', null), 50); return 1;")
            for _ in range(120):
                if await ev(T + f" return t.def.code === '{MAP}' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(6)
            pois = json.loads(await ev(T + " return JSON.stringify((t.def.pois || []).map(p => [p.code, p.kind, p.x, p.y, t.walkable(p.x, p.y)]));"))
            print('pois', pois, flush=True)
            print('explore', await ev("const e = root.worldState.explore.find(x => x.mapCode === root.lobbyTownRenderer.def.code); return JSON.stringify({ percent: e.percent, found: e.found });"), flush=True)
            if os.environ.get('PROBE') == '1':
                print('probe', await ev(T + " const out = []; for (const [code, e] of t.poiNodes) { const kids = e.node.children.map(c => { const sp = c.getComponent('cc.Sprite'); const ut = c.getComponent('cc.UITransform'); return c.name + (sp ? ':frame=' + (sp.spriteFrame ? sp.spriteFrame.name : 'NULL') : '') + (ut ? ':' + Math.round(ut.width) + 'x' + Math.round(ut.height) : '') + '@' + Math.round(c.position.y) + (c.active ? '' : ':off'); }); out.push(code + ' active=' + e.node.active + ' parent=' + (e.node.parent && e.node.parent.name) + ' pos=' + Math.round(e.node.position.x) + ',' + Math.round(e.node.position.y) + ' [' + kids.join(' | ') + ']'); } return out.join(' ;; ');"), flush=True)
            if os.environ.get('SHOWCASE') == '1':
                # 远看:队长站在兴趣点左边 430(提示框不出,看圆徽 / 光圈 / 名字从远处是否显眼)
                for code, kind, x, y, ok in pois:
                    await ev(T + f" tp({x} - 430, {y} - 60); return 1;")
                    await asyncio.sleep(2.2)
                    await shot(f'show_{code}')
                # 宝箱:远看每个;再开第一个木箱看开盖空箱
                chests = json.loads(await ev(T + " return JSON.stringify((t.def.chests || []).map(c => [c.code, c.kind, c.x, c.y]));"))
                for code, kind, x, y in chests:
                    await ev(T + f" tp({x} - 430, {y} - 60); return 1;")
                    await asyncio.sleep(2.2)
                    await shot(f'show_{code}')
                wood = next((c for c in chests if c[1] == 'WOOD'), None)
                if wood:
                    await ev(T + f" tp({wood[2]} - 160, {wood[3]} - 30); return 1;")
                    await asyncio.sleep(1.5)
                    await ev(f"root.openWorldChest('{wood[0]}'); return 1;")
                    await asyncio.sleep(3.5)
                    await shot(f'show_{wood[0]}_opened')
                    print('chest opened', await ev("return JSON.stringify(root.worldState.openedChests);"), flush=True)
                return
            for code, kind, x, y, ok in pois:
                if kind == 'HIDDEN':
                    await ev(T + f" tp({x} - 260, {y}); return 1;")
                    await asyncio.sleep(1.5)
                    await shot(f'{code}_a_near')
                    await ev(T + f" tp({x}, {y}); return 1;")
                    await asyncio.sleep(3)
                    print(code, await ev("return JSON.stringify(root.worldPoiDialog && { kind: root.worldPoiDialog.kind, rewards: root.worldPoiDialog.rewards.length, progress: root.worldPoiDialog.progressText });"), flush=True)
                    await shot(f'{code}_b_found')
                    await ev("if (root.worldPoiDialog) root.closeWorldPoiDialog(); return 1;")
                    await asyncio.sleep(1)
                elif kind == 'STELE':
                    await ev(T + f" tp({x} - 120, {y} - 40); return 1;")
                    await asyncio.sleep(1.5)
                    await shot(f'{code}_a_prompt')
                    await ev(T + " t.enterNearBuilding(); return 1;")
                    await asyncio.sleep(3)
                    print(code, await ev("return JSON.stringify(root.worldPoiDialog && { kind: root.worldPoiDialog.kind, first: root.worldPoiDialog.first, footer: root.worldPoiDialog.footerText });"), flush=True)
                    await shot(f'{code}_b_read')
                    await ev("if (root.worldPoiDialog) root.closeWorldPoiDialog(); return 1;")
                    await asyncio.sleep(1)
                else:
                    await ev(T + f" tp({x} - 120, {y} - 40); return 1;")
                    await asyncio.sleep(1.5)
                    await ev(T + " t.enterNearBuilding(); return 1;")
                    await asyncio.sleep(1.0)
                    await shot(f'{code}_a_gathering')
                    await asyncio.sleep(2.5)
                    await shot(f'{code}_b_done')
                    print(code, 'gathered', await ev("return JSON.stringify(root.worldState.gatheredToday);"), flush=True)
            print('explore after', await ev("const e = root.worldState.explore.find(x => x.mapCode === root.lobbyTownRenderer.def.code); return JSON.stringify({ percent: e.percent, found: e.found });"), flush=True)
            await ev("setTimeout(() => root.openAreaMapPanel(), 30); return 1;")
            await asyncio.sleep(4)
            await shot('zz_areamap')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
