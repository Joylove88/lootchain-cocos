"""主角专属连招自验(11-03):登录 → 林地怪群旁 → 连按 J 打完 5 段,每段命中点前后连拍,打印每段动作名 / 切片 / 时长;
最后把整段连招按 ~12fps 连拍拼成 GIF(combo.gif),看是否一刀接一刀。
用法:PREVIEW_PORT=7460 python tools/qa/protag_combo_web.py <输出目录> [--user=guidetest02]
"""
import asyncio, base64, io, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
from PIL import Image
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'protag_combo_web'))
USER = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--user=')), 'guidetest02')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
T = "const t = root.lobbyTownRenderer;"


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_combo'
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

            async def grab():
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 80}, 120)
                return Image.open(io.BytesIO(base64.b64decode(m['result']['data']))).convert('RGB')

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount') and await ev("return (window.__lootchainPack && !root.bootPreloadActive) ? 'y' : 'n';") == 'y':
                    break
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'%s'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;" % USER)
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.lobbyTownRenderer && root.lobbyTownRenderer.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await ev("if (root.lobbyTownRenderer.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(120):
                if await ev(T + " return t.def.code === 'WOODS' && t.leader && t.leader.skeleton ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            print('leader', await ev(T + " return t.leader.hero.heroCode + ' ' + t.leader.hero.spineAsset;"), flush=True)
            # 站到怪群旁,队友藏起来便于看主角
            await ev(T + " const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_1') || t.def.camps[0]; t.leader.x = c.x - 230; t.leader.y = c.y; t.leader.node.setPosition(t.leader.x, t.leader.y, 0); t.followers.forEach(a => a.node.active = false); return 1;")
            await asyncio.sleep(2.5)
            # 页面里每 150ms 按一次 J(真实连点频率),每 60ms 记一次状态;同时用录屏拿帧(截图会卡住渲染、拉长间隔)
            await ev(T + " window.__log = []; const t0 = Date.now(); const pr = setInterval(() => t.leaderAttack(), 150); "
                     "const lg = setInterval(() => { const l = t.leader; window.__log.push([Date.now() - t0, t.comboStep, l.anim]); }, 60); "
                     "setTimeout(() => { clearInterval(pr); }, 5200); setTimeout(() => { clearInterval(lg); }, 6200); return 1;")
            frames = []

            async def on_frames():
                await call('Page.startScreencast', {'format': 'jpeg', 'quality': 80, 'everyNthFrame': 2})
                t0 = time.time()
                while time.time() - t0 < 6.2:
                    x = json.loads(await asyncio.wait_for(ws.recv(), 30))
                    if x.get('method') == 'Page.screencastFrame':
                        frames.append(Image.open(io.BytesIO(base64.b64decode(x['params']['data']))).convert('RGB'))
                        await ws.send(json.dumps({'id': 900000 + len(frames), 'method': 'Page.screencastFrameAck', 'params': {'sessionId': x['params']['sessionId']}}))
                await call('Page.stopScreencast')
            await on_frames()
            log = json.loads(await ev("return JSON.stringify(window.__log);"))
            last = None
            for ms, step, anim in log:
                if (step, anim) != last:
                    print(f'{ms:5d}ms step {step} {anim}', flush=True)
                    last = (step, anim)
            box = (380, 120, 1220, 700)
            crops = [f.crop(box) if f.size == (1600, 900) else f for f in frames]
            if crops:
                crops[0].save(os.path.join(OUT, 'combo.gif'), save_all=True, append_images=crops[1:], duration=int(6200 / max(1, len(crops))), loop=0)
            print('frames', len(frames), flush=True)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
