"""野外坐标同步自验(docs/55,2026-10-31):无头 Edge 打开网页包 → 登录 guidetest02 → 林地(warp)→ 自动寻路走到最近的宝箱旁开箱
(正常玩法不该有位置告警)→ 瞬移到远处再隔空领兴趣点(应记一条「距离太远」)→ 刷新页面看是否回到最后位置(下线续点)。
游戏服日志要重定向到 LootChain/logs/game-8081-1031.out.log,脚本最后打印本次的 field position 日志行。
用法:PREVIEW_PORT=7460 python tools/qa/field_pos_web.py <输出目录>
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'field_pos_web'))
GPU = '--gpu' in sys.argv
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_pos'
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
            LOG = r'D:\project\LootChain\logs\game-8081-1031.out.log'
            log_start = os.path.getsize(LOG) if os.path.exists(LOG) else 0
            T = "const t = root.lobbyTownRenderer; const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
            await ev("if (root.lobbyTownRenderer.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(120):
                if await ev(T + " return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            print('ws open', await ev("return root.playerWsClient.socket && root.playerWsClient.socket.readyState;"), flush=True)
            start = json.loads(await ev(T + " return JSON.stringify([Math.round(t.leader.x), Math.round(t.leader.y)]);"))
            chest = json.loads(await ev(T + f" const cs = t.def.chests.filter(c => c.kind === 'WOOD').map(c => [c.code, c.x, c.y, Math.hypot(c.x - {start[0]}, c.y - {start[1]})]); cs.sort((a, b) => a[3] - b[3]); return JSON.stringify(cs[0]);"))
            print('start', start, 'nearest wood chest', chest, flush=True)
            # 正常走动 20 秒(自动寻路朝宝箱,验证不误报移速);再瞬移到宝箱旁(会记一条移速异常,属预期),等坐标同步后开箱(不该报距离)
            await ev(T + f" t.autoWalkTo({chest[1]} - 120, {chest[2]} - 30); return 1;")
            await asyncio.sleep(20)
            print('walked 20s, dist', await ev(T + f" return Math.round(Math.hypot(t.leader.x - {chest[1]}, t.leader.y - {chest[2]}));"), flush=True)
            await ev(T + f" t.autoPath = null; tp({chest[1]} - 120, {chest[2]} - 30); return 1;")
            await asyncio.sleep(2.5)
            await asyncio.sleep(1.5)
            await ev(f"root.openWorldChest('{chest[0]}'); return 1;")
            await asyncio.sleep(3)
            await shot('chest_opened')
            # 作弊:瞬移到远处 + 隔空领兴趣点(石碑)
            await ev(T + " tp(-6000, -2900); return 1;")
            await asyncio.sleep(1.5)
            await ev("root.claimWorldPoi('W_STELE_1'); return 1;")
            await asyncio.sleep(3)
            await ev("if (root.worldPoiDialog) root.closeWorldPoiDialog(); return 1;")
            # 回到正常位置,停 12 秒让服务端落库(30 秒落库;断线也落库)
            await ev(T + f" tp({chest[1]} - 300, {chest[2]}); return 1;")
            await asyncio.sleep(3)
            before = json.loads(await ev(T + " return JSON.stringify([Math.round(t.leader.x), Math.round(t.leader.y)]);"))
            # 刷新 = 断线落库 + 重新进游戏
            await call('Page.reload')
            await asyncio.sleep(3)
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            for _ in range(200):
                v = await ev("return root ? root.currentView : 'noroot';")
                if v == 'lobby' and await ev(T + " return t && t.leader && t.isMounted() ? 'ok' : 'no';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(5)
            after = await ev(T + " return t.def.code + ' ' + Math.round(t.leader.x) + ',' + Math.round(t.leader.y);")
            print('before reload', before, 'after reload', after, flush=True)
            await shot('resumed')
            await asyncio.sleep(1)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
    if os.path.exists(LOG):
        with open(LOG, 'rb') as f:
            f.seek(log_start)
            for line in f.read().decode('utf-8', 'replace').splitlines():
                if 'field position' in line or 'player ws' in line:
                    print('LOG', line[line.find('c.lootchain') if 'c.lootchain' in line else 0:][:260])


asyncio.run(main())
