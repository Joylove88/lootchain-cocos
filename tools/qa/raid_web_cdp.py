# -*- coding: utf-8 -*-
"""掠夺 P0 电脑端真键盘自验:无头 Edge 打开本地正式包 → 登录 → 主城 → startRaidPrototype → CDP 真键盘事件(A 左冲 / J 连段 / U 技能 / K 翻滚)→ 看模型状态 + 截图。
用法:PREVIEW_PORT=7460 python tools/qa/raid_web_cdp.py <输出目录>(先 python -m http.server 7460 --directory build/web-mobile;游戏服 8081)"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'raid_web')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const gr=root&&root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
STATE = "const u=sim.monsters.find(m=>m.player); return JSON.stringify({phase:sim.phase, t:Math.round(sim.timeMs), x:u&&+u.x.toFixed(2), hp:u&&Math.round(u.hp), heroes:sim.heroes.map(h=>Math.round(h.hp||0)+(h.dead?'X':'')), crystal:Math.round(sim.crystalHp), inputs:sim.inputs.length, proj:(gr.projectiles||[]).length, raiderInViews:!!(sim.raider&&gr.monsterViews.get(sim.raider.monsterId)), keys:[...raid.keys]});"


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_raid'
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

            async def key(code, key_name, vk, ms):
                await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': code, 'key': key_name, 'windowsVirtualKeyCode': vk})
                await asyncio.sleep(ms / 1000)
                await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': code, 'key': key_name, 'windowsVirtualKeyCode': vk})

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(240):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(2)
            if view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    if await ev("return root.currentView;") == 'lobby':
                        break
                    await asyncio.sleep(2)
            for _ in range(45):
                if '"sprites":9' in await ev("const t=root.lobbyTownRenderer; return JSON.stringify({sprites:t.buildings.filter(b=>b.sprite).length});"):
                    break
                await asyncio.sleep(2)
            await ev("root.startRaidPrototype(); return 'raid';")
            for _ in range(40):
                if await ev("return (gr && gr.isMounted() && raid) ? 'ready' : 'wait';") == 'ready':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(2)
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            print('start', await ev(STATE), flush=True)
            await shot('raid_web_start')
            await key('KeyA', 'a', 65, 1000)
            await asyncio.sleep(0.4)
            print('after A', await ev(STATE), flush=True)
            for _ in range(3):
                await key('KeyJ', 'j', 74, 60)
                await asyncio.sleep(0.3)
            await asyncio.sleep(0.2)
            await shot('raid_web_combo')
            print('after JJJ', await ev(STATE), flush=True)
            await key('KeyU', 'u', 85, 60)
            await asyncio.sleep(0.9)
            await key('KeyK', 'k', 75, 60)
            await asyncio.sleep(0.6)
            print('after U,K', await ev(STATE), flush=True)
            peak = 0
            for i in range(30):
                await key('KeyJ', 'j', 74, 50)
                await asyncio.sleep(0.35)
                if i in (6, 12, 18):
                    st = await ev(STATE)
                    print('mid', i, st, flush=True)
                    if '"proj":0' not in st:
                        await shot(f'raid_web_mid{i}')
            print('after spam', await ev(STATE), flush=True)
            await shot('raid_web_fight')
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
