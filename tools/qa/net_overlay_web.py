"""断网遮罩自验(2026-10-31 用户:「网络不好 / 没网时显示连接服务器中,不能有其他操作」):
无头 Edge 打开网页包 → 登录 guidetest02 → 大厅(野外)→
① CDP 模拟离线(navigator.onLine=false)→ 应出「连接服务器中 / 网络已断开」,野外冻结;恢复联网 → 遮罩撤掉;
② 屏蔽长连接与接口地址 + 掐断当前长连接 → 应出「网络不稳定,正在重新连接」;解除屏蔽 → 自动重连、遮罩撤掉。
每步截图 + 打印遮罩状态。
用法:PREVIEW_PORT=7460 python tools/qa/net_overlay_web.py <输出目录>
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'net_overlay_web'))
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
STATE = ("const n = root.netOverlayNode; const labels = []; if (n && n.isValid) n.walk(c => { const l = c.getComponent('cc.Label'); if (l) labels.push(l.string); });"
         " const t = root.lobbyTownRenderer; return JSON.stringify({ shown: !!(n && n.isValid), labels, watch: root.connectionWatch.state(Date.now()),"
         " ws: root.playerWsClient.socket ? root.playerWsClient.socket.readyState : null, leaderX: t.leader ? Math.round(t.leader.x) : null, last: n && n.isValid ? n.getSiblingIndex() === root.node.children.length - 1 : null });")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_net'
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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

            await call('Network.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount') and await ev("return (window.__lootchainPack && !root.bootPreloadActive) ? 'y' : 'n';") == 'y':
                    break
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;")
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.worldState && root.playerWsClient.socket && root.playerWsClient.socket.readyState === 1 && root.lobbyTownRenderer.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(5)
            print('00 normal', await ev(STATE), flush=True)
            await shot('00_normal')

            # ① 离线
            await call('Network.emulateNetworkConditions', {'offline': True, 'latency': 0, 'downloadThroughput': -1, 'uploadThroughput': -1})
            await asyncio.sleep(0.6)
            print('01 offline 0.6s', await ev(STATE), flush=True)
            await asyncio.sleep(2.0)
            print('02 offline 2.6s', await ev(STATE), flush=True)
            # 遮罩下按方向键 / 普攻:队长不该动
            await ev("const t = root.lobbyTownRenderer; t.keys.add(cc.KeyCode.ARROW_RIGHT); return 1;")
            await asyncio.sleep(1.5)
            await ev("const t = root.lobbyTownRenderer; t.keys.delete(cc.KeyCode.ARROW_RIGHT); return 1;")
            print('03 offline + 按右 1.5s', await ev(STATE), flush=True)
            await shot('01_offline')
            await call('Network.emulateNetworkConditions', {'offline': False, 'latency': 0, 'downloadThroughput': -1, 'uploadThroughput': -1})
            for i in range(20):
                await asyncio.sleep(1)
                st = json.loads(await ev(STATE))
                if not st['shown'] and st['ws'] == 1:
                    break
            print('04 back online', i + 1, 's', json.dumps(st, ensure_ascii=False), flush=True)
            await shot('02_online')

            # ② 长连接连不上:重连地址指到死端口 + 掐断当前长连接 → 2.5 秒宽限后应挡;恢复地址 → 退避重连上即撤
            await ev("const w = root.playerWsClient; w.__url = w.resolveWsUrl; w.resolveWsUrl = () => 'ws://127.0.0.1:1/dead'; w.socket.close(); return 1;")
            for i in range(15):
                await asyncio.sleep(1)
                st = json.loads(await ev(STATE))
                if st['shown']:
                    break
            print('05 ws dead', i + 1, 's', json.dumps(st, ensure_ascii=False), flush=True)
            await shot('03_unreachable')
            await ev("const w = root.playerWsClient; w.resolveWsUrl = w.__url; return 1;")
            for i in range(20):
                await asyncio.sleep(1)
                st = json.loads(await ev(STATE))
                if not st['shown'] and st['ws'] == 1:
                    break
            print('06 ws restored', i + 1, 's', json.dumps(st, ensure_ascii=False), flush=True)
            # ③ 接口连不上:屏蔽 /api/ 后发一个请求 → 应挡;解除屏蔽 → 3 秒一次的探测请求回来即撤
            await call('Network.setBlockedURLs', {'urls': ['*/api/*']})
            await ev("root.api.http.get('/api/player/me/rename').catch(() => 0); return 1;")
            for i in range(10):
                await asyncio.sleep(1)
                st = json.loads(await ev(STATE))
                if st['shown']:
                    break
            print('07 api blocked', i + 1, 's', json.dumps(st, ensure_ascii=False), flush=True)
            await shot('04_api_blocked')
            await call('Network.setBlockedURLs', {'urls': []})
            for i in range(15):
                await asyncio.sleep(1)
                st = json.loads(await ev(STATE))
                if not st['shown']:
                    break
            print('08 api unblocked', i + 1, 's', json.dumps(st, ensure_ascii=False), flush=True)
            await shot('05_recovered')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
