# -*- coding: utf-8 -*-
"""召唤页逐个卡池截图(2026-10-30 用户反馈线上召唤页中央骨骼花屏):无头 Edge 打开网页包 → 登录 QA 号 → 召唤 → 逐个卡池选中截图,
并打印每个卡池中央骨骼的资源路径 / 贴图尺寸 / 预乘设置。
用法:PREVIEW_PORT=7460 python tools/qa/gacha_pool_shots.py <输出目录> [--gpu](--gpu 用真显卡,默认 SwiftShader)
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'gacha_pool_shots'))
GPU = '--gpu' in sys.argv
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_gacha'
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
            await ev("setTimeout(() => root.openLobbyGachaScene(), 30); return 1;")
            for _ in range(240):
                if await ev("return root.currentView === 'gacha' && root.gachaSceneState.pools.length && !root.uiSpriteFrameCache.groupProgress('gacha') ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            pools = json.loads(await ev("return JSON.stringify(root.gachaSceneState.pools.map(p => [p.poolCode || p.id, p.title, p.centerSpineResource || '']));"))
            print('pools', pools, flush=True)
            for i, (code, title, res) in enumerate(pools):
                await ev(f"setTimeout(() => root.selectGachaPool('{code}'), 30); return 1;")
                await asyncio.sleep(8)
                info = await ev("let sk = null; root.node.walk(n => { if (!sk && n.name === 'GachaAbyssSpineNode') sk = n.getComponent('sp.Skeleton'); }); if (!sk || !sk.skeletonData) return 'no skeleton'; "
                                "const d = sk.skeletonData; return JSON.stringify({ name: d.name, pma: sk.premultipliedAlpha, tex: (d.textures || []).map(t => t ? [t.width, t.height, t.name || '', t.getPixelFormat ? t.getPixelFormat() : ''] : null), names: d.textureNames });")
                print(i, code, title, res, info, flush=True)
                await shot(f'pool_{i}_{code}')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
