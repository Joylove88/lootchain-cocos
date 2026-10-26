# -*- coding: utf-8 -*-
"""矿境面板 UI 自验(电脑端,docs/48/49 原型 1:1):真人矿页 / NPC 矿页截图:无头 Edge 打开本地正式包 → 登录 → 主城 → 打开每日副本面板截图 → 点特殊玩法按钮 → 冒险关卡面板截图。
用法:PREVIEW_PORT=7460 python tools/qa/special_mode_cdp.py <输出目录>"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'special_mode')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_raidui'
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
            await ev("root.openLobbyRaidPanel(); return 'raid';")
            for _ in range(30):
                st = await ev("const p=root.currentLobbyRaidPvpState(); const n=root.currentLobbyRaidState(); return (p.home && n.stages) ? 'ready' : 'wait';")
                if st == 'ready':
                    break
                await asyncio.sleep(1)
            for _ in range(40):
                if await ev("return root.uiSpriteFrameCache.groupProgress('raid') ? 'wait' : 'ready';") == 'ready':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(2)
            print('render', await ev("try { root.renderCurrentLobbyScenePage(); return 'ok'; } catch (e) { return String(e && e.stack || e).slice(0, 600); }"), flush=True)
            print('gate', await ev("const g=root.uiSpriteFrameCache.groupProgress('raid'); return JSON.stringify(g);"), flush=True)
            await shot('raid_ui_pvp')
            await ev("root.selectLobbyRaidTab('npc'); return 'npc';")
            await asyncio.sleep(3)
            await shot('raid_ui_npc')
            await ev("root.selectLobbyRaidStage('RAID_12'); return 'z2';")
            await asyncio.sleep(2)
            await shot('raid_ui_npc_zone2')
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
