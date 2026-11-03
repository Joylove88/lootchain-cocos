# -*- coding: utf-8 -*-
"""登录后首屏地图自验(11-03 用户「每次登录后都要在主城展示一下,然后又切换到上次离线时的场景」):
无头 Edge 打开本地正式包 → 登录 → 每 0.25 秒记一次「正在进入世界」遮罩 / 跑图是否已挂上 / 当前地图,打印变化序列;
修好后应是 进入世界遮罩 →(下载页)→ 直接是上次离线的地图,中间不出现主城。
用法:PREVIEW_PORT=7460 python tools/qa/login_first_map.py [账号](默认 guidetest03,上次离线在晨风村)
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

ACCOUNT = sys.argv[1] if len(sys.argv) > 1 else 'guidetest03'
OUT = os.path.join(base.SCRATCH, 'login_first_map')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
PROBE = ("const has = (name) => { let on = false; root.node.walk(x => { if (x.name === name && x.activeInHierarchy) on = true; }); return on; }; "
         "return [root.currentView, has('WorldEntryLoading') ? 'entryGate' : '', has('PackLoading') ? 'pack' : '', has('SceneAssetLoading') ? 'sceneGate' : '', "
         "t && t.isMounted() ? 'town:' + t.def.code : 'noTown'].filter(Boolean).join(' ');")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_firstmap'
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

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(240):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'pass1234'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
            started = time.time()
            seen = []
            last = None
            while time.time() - started < 180:
                cur = await ev(PROBE)
                if cur != last:
                    seen.append(cur)
                    print('%6.2fs %s' % (time.time() - started, cur), flush=True)
                    last = cur
                if cur and cur.startswith('lobby town:') and time.time() - started > 8:
                    break
                await asyncio.sleep(0.25)
            towns = [s.split('town:')[1] for s in seen if 'town:' in s and 'entryGate' not in s]
            print('towns shown in order:', towns, flush=True)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            if 'result' in m:
                open(os.path.join(OUT, 'final.png'), 'wb').write(base64.b64decode(m['result']['data']))
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    asyncio.run(main())
