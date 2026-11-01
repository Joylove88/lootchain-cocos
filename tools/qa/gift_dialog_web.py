"""终端兑换码弹框自验(11-01 原型 周报截图/2026-11-01_B风格补全/proto/gift_b.png)。
无头 Edge 打开网页包 → 登录 guidetest02 → 开终端 → 「兑换码」弹框:打开 / 输错码 / 粘贴 / 兑换成功(飘字)/ 重复兑换 /
返回键 / 取消 / 点空白,逐步截图并打印状态。
先跑:本地库删掉 guidetest02 的 LOOTCHAIN888 兑换记录(delete from gift_code_claim where user_id=64)。
用法:PREVIEW_PORT=7460 python tools/qa/gift_dialog_web.py <输出目录> [--phone]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'gift_dialog_web'))
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
CLICK = "const n=(()=>{let f=null; root.node.walk(x=>{ if(!f && x.name==='%s' && x.activeInHierarchy && x.parent && x.parent.name==='Panel') f=x; }); return f;})(); if(!n) return 'nonode'; n.emit('click', n.getComponent('cc.Button')); return 'ok';"
STATE = ("let input=null; root.node.walk(x=>{ if(x.name==='LobbyGiftDialogInput') input=x; }); "
         "let err=null; root.node.walk(x=>{ if(x.name==='Error' && x.parent && x.parent.name==='Panel') err=x.getComponent('cc.Label').string; }); "
         "return JSON.stringify({dialog: root.lobbyGiftDialog, busy: root.lobbyGiftRedeeming, terminal: root.lobbyTerminalOpen, view: root.currentView, "
         "input: input ? input.getComponent('cc.EditBox').string : null, err});")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_gift'
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
                await asyncio.sleep(1)
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))

            async def wait_for(expr, tries=60, gap=1.0):
                for _ in range(tries):
                    if await ev(expr) == 'ok':
                        return True
                    await asyncio.sleep(gap)
                return False

            async def step(name, wait=2.0):
                await asyncio.sleep(wait)
                print(name, await ev(STATE), flush=True)
                await shot(name)

            if '--phone' in sys.argv:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1200, 'height': 540, 'deviceScaleFactor': 2, 'mobile': False})
            else:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            origin = base.PAGE.split('/?')[0].rstrip('/')
            await call('Browser.grantPermissions', {'origin': origin, 'permissions': ['clipboardReadWrite', 'clipboardSanitizedWrite']})
            # 无头页面默认不算「有焦点」,剪贴板读写会被拒
            await call('Emulation.setFocusEmulationEnabled', {'enabled': True})
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
            await wait_for("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';", 240)
            await asyncio.sleep(6)

            await ev("root.openLobbyTerminalPanel(); return 1;")
            await asyncio.sleep(3)
            await ev("root.runLobbyTerminalAction('gift'); return 1;")
            await step('01_open')
            # 空码点兑换 → 弹框内提示
            await ev(CLICK % 'Redeem')
            await step('02_empty')
            # 错码(模拟已输入)→ 服务端报错写进弹框
            await ev("root.lobbyGiftDialog = {draft: 'WRONGCODE123', error: ''}; root.renderLobbyGiftDialog(); return 1;")
            await ev(CLICK % 'Redeem')
            await step('03_wrong', 3)
            # 粘贴:先往剪贴板写 LOOTCHAIN888
            await call('Runtime.evaluate', {'expression': "navigator.clipboard.writeText('  LOOTCHAIN888 ').then(()=>'ok').catch(e=>'fail '+e.message)", 'awaitPromise': True, 'userGesture': True, 'returnByValue': True})
            await ev(CLICK % 'Paste')
            await step('04_paste')
            # 兑换成功:弹框关、终端还在、飘奖励
            await ev(CLICK % 'Redeem')
            await wait_for("let f=false; root.node.walk(x=>{ if(x.name.startsWith('LobbyRewardFloat_')) f=true; }); return f ? 'ok' : 'wait';", 60, 0.1)
            await asyncio.sleep(0.35)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            open(os.path.join(OUT, '05_success.png'), 'wb').write(base64.b64decode(m['result']['data']))
            print('05_success', await ev(STATE), flush=True)
            # 再兑一次同一个码(小写)→ 已兑换过
            await ev("root.runLobbyTerminalAction('gift'); root.lobbyGiftDialog = {draft: 'lootchain888', error: ''}; root.renderLobbyGiftDialog(); return 1;")
            await ev(CLICK % 'Redeem')
            await wait_for("return root.lobbyGiftRedeeming ? 'wait' : 'ok';", 40, 0.25)
            await step('06_again', 0.5)
            # 返回键:只关弹框,终端留着
            await ev("root.handleNativeBack(); return 1;")
            await step('07_back', 1.5)
            # 取消
            await ev("root.runLobbyTerminalAction('gift'); return 1;")
            await asyncio.sleep(1.5)
            await ev(CLICK % 'Cancel')
            await step('08_cancel', 1.5)
            # 点空白(压暗层)
            await ev("root.runLobbyTerminalAction('gift'); return 1;")
            await asyncio.sleep(1.5)
            await ev("let d=null; root.node.walk(x=>{ if(x.name==='LobbyGiftDialog') d=x; }); d.emit(cc.Node.EventType.TOUCH_END, {propagationStopped:false}); return 1;")
            await step('09_dim', 1.5)
            # 关终端时弹框一起关;终端关着时打开弹框应无效
            await ev("root.runLobbyTerminalAction('gift'); return 1;")
            await asyncio.sleep(1.5)
            await ev("root.closeLobbyTerminalPanel(); return 1;")
            await step('10_terminal_closed', 1.5)
            await ev("root.openLobbyGiftDialog(); return 1;")
            await step('11_open_without_terminal', 1)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
