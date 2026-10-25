# -*- coding: utf-8 -*-
"""主城跑图 电脑端(网页正式包)键盘走动自验:无头 Edge 1600×900 打开本地起服的正式包 → 登录 QA 号 → 进大厅 →
CDP 发真实键盘事件(按住 D 1.5s / W 0.8s)→ 看队长位置变化 + 截图。
用法:PREVIEW_PORT=7460 python tools/qa/town_web_cdp.py <输出目录>(先 python -m http.server 7460 --directory build/web-mobile;游戏服 8081)"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'town_web')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_town'
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
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
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
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, flush=True)

            async def key(code, key_name, ms):
                await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': code, 'key': key_name, 'windowsVirtualKeyCode': ord(key_name.upper())})
                await asyncio.sleep(ms / 1000)
                await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': code, 'key': key_name, 'windowsVirtualKeyCode': ord(key_name.upper())})

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            # 等到登录页或大厅(正式包首访会整包下载,给足时间)
            view = ''
            for _ in range(240):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(2)
            print('view', view, flush=True)
            if view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    view = await ev("return root.currentView;")
                    if view == 'lobby':
                        break
                    await asyncio.sleep(2)
                print('after login', view, flush=True)
            # 等地面 / 建筑图到齐(首访要下载),最多 90s
            for _ in range(45):
                state = await ev("const t=root.lobbyTownRenderer; return JSON.stringify({mounted:t.isMounted(), leader:t.leader&&{x:Math.round(t.leader.x),y:Math.round(t.leader.y)}, sprites:t.buildings.filter(b=>b.sprite).length, props:t.propNodes.length, view: root.currentView});")
                if '"sprites":9' in state:
                    break
                await asyncio.sleep(2)
            print(state, flush=True)
            await asyncio.sleep(2)
            # 画布要先有焦点,键盘事件才进引擎(真人玩也是先点一下)
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 300, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 300, 'button': 'left', 'clickCount': 1})
            await asyncio.sleep(0.3)
            await shot('web_spawn')
            await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': 'KeyD', 'key': 'd', 'windowsVirtualKeyCode': 68})
            await asyncio.sleep(0.4)
            print('holding D keys=', await ev("return JSON.stringify([...root.lobbyTownRenderer.keys]);"), flush=True)
            await asyncio.sleep(1.1)
            await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': 'KeyD', 'key': 'd', 'windowsVirtualKeyCode': 68})
            await asyncio.sleep(0.5)
            print('after D', await ev("const t=root.lobbyTownRenderer; return JSON.stringify({x:Math.round(t.leader.x),y:Math.round(t.leader.y),facing:t.leader.facing,anim:t.leader.anim,keys:[...t.keys]});"), flush=True)
            await key('KeyW', 'w', 800)
            await asyncio.sleep(0.8)
            print('after W', await ev("const t=root.lobbyTownRenderer; return JSON.stringify({x:Math.round(t.leader.x),y:Math.round(t.leader.y)});"), flush=True)
            await shot('web_walk')
            # 走到熔铸工坊门口按 E
            await ev("const t=root.lobbyTownRenderer; const cfg=t.buildings.find(b=>b.cfg.key==='forge').cfg; t.leader.x=cfg.x+cfg.door.x-40; t.leader.y=cfg.y+cfg.door.y-20; t.leader.node.setPosition(t.leader.x,t.leader.y,0); return 'tp';")
            await asyncio.sleep(1)
            await shot('web_forge_door')
            await key('KeyE', 'e', 80)
            await asyncio.sleep(4)
            print('after E view', await ev("return root.currentView;"), flush=True)
            await shot('web_enter')
    finally:
        # 只杀自己这棵无头进程树,别碰用户自己开着的 Edge
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
