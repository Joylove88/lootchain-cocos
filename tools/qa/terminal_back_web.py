"""终端「<」返回自验(11-01,由 skin_ui_web 改出):任务 / 背包 / 商店从终端进,点「<」回终端、点「✕」回大厅。
用法:PREVIEW_PORT=7460 python tools/qa/terminal_back_web.py <输出目录> [--phone]
原注释:英雄皮肤界面自验(docs/56,2026-11-01):无头 Edge 打开网页包 → 登录 guidetest02 →
商店皮肤页(未拥有)截图 → 预览动作 → 购买 → 英雄详情皮肤页(默认 / 选中皮肤 / 穿戴后)→ 野外队长外观,逐步截图并打印状态。
先跑:本地库删掉 guidetest02 的 user_hero_skin(从未拥有开始测购买)。
用法:PREVIEW_PORT=7460 python tools/qa/skin_ui_web.py <输出目录> [--phone]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'terminal_back_web'))
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_termback'
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
                # 下载页挡着时先等它走完(新配置首访会补下皮肤 / 英雄素材)
                for _ in range(240):
                    if await ev("let b=false; root.node.walk(n=>{ if(n.name==='PackLoading' || n.name==='SceneAssetLoadingTip') b=true; }); return b ? 'wait' : 'ok';") == 'ok':
                        break
                    await asyncio.sleep(1)
                await asyncio.sleep(1)
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 85}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))

            async def wait_for(expr, tries=60, gap=1.0):
                for _ in range(tries):
                    if await ev(expr) == 'ok':
                        return True
                    await asyncio.sleep(gap)
                return False

            # --phone:短边 < 560 CSS 像素走手机版式(ScreenAdapter,设计高 720 + B 风格英雄详情)
            if '--phone' in sys.argv:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1200, 'height': 540, 'deviceScaleFactor': 1.5, 'mobile': False})
            else:
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
            await wait_for("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';", 240)
            await asyncio.sleep(6)
            print('skins', await ev("return JSON.stringify((root.api && 1) ? 'loaded' : 0);"), flush=True)
            # 终端 → 任务 / 背包 / 商店:点顶栏「<」应回到终端,点「✕」回大厅(11-01)
            click = "const n=(()=>{let f=null; root.node.walk(x=>{ if(!f && x.name==='%s' && x.activeInHierarchy) f=x; }); return f;})(); if(!n) return 'nonode'; n.emit('click', n.getComponent('cc.Button')); return 'ok';"
            # ① 终端每个入口:进去 → 返回(安卓返回键同一套「关最上层」)→ 应回到终端
            actions = ['heroes', 'formation', 'bag', 'forge', 'gacha', 'raid', 'daily', 'crystal', 'codex', 'quest',
                       'shop', 'guild', 'idle', 'worldmap', 'rank', 'mail', 'notice', 'gift', 'settings', 'profile']
            only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
            for action in (only or actions):
                await ev("root.openLobbyTerminalPanel(); return 1;")
                await asyncio.sleep(1.5)
                await ev(f"root.runLobbyTerminalAction('{action}'); return 1;")
                for _ in range(90):  # 首开要下素材:等下载页走完
                    await asyncio.sleep(1)
                    if await ev("let b=false; root.node.walk(n=>{ if(n.name==='PackLoading') b=true; }); return b ? 'wait' : 'ok';") == 'ok':
                        break
                await asyncio.sleep(3)
                opened = await ev("return JSON.stringify({view: root.currentView, ret: root.terminalReturn, formation: root.lobbyFormationPanelOpen, map: !!root.worldMapPanel, err: (window.__lastErr || '')});")
                await ev("root.handleNativeBack(); return 1;")
                await asyncio.sleep(2)
                st = await ev("return JSON.stringify({view: root.currentView, terminal: root.lobbyTerminalOpen});")
                print('back', action, opened, '->', st, flush=True)
                await ev("root.closeLobbyTerminalPanel(); return 1;")
                await asyncio.sleep(1)
            if only:
                return
            # ② 「<」/「✕」按钮:「<」回终端,「✕」回大厅
            for action, back, close in [('quest', 'LobbyQuestGlassBack', 'LobbyQuestGlassClose'), ('bag', 'LobbyBagGlassBack', 'LobbyBagGlassClose'),
                                        ('shop', 'LobbyShopGlassBack', 'LobbyShopGlassClose'), ('forge', 'LobbyForgeGlassBack', 'LobbyForgeBackButton')]:
                for btn in (back, close):
                    await ev("root.openLobbyTerminalPanel(); return 1;")
                    await asyncio.sleep(1.5)
                    await ev(f"root.runLobbyTerminalAction('{action}'); return 1;")
                    await asyncio.sleep(5)
                    r = await ev(click % btn)
                    await asyncio.sleep(2)
                    st = await ev("return JSON.stringify({view: root.currentView, terminal: root.lobbyTerminalOpen});")
                    print('button', action, btn, r, st, flush=True)
                    if btn == 'LobbyQuestGlassBack':
                        await shot('terminal_after_back')
                    await ev("root.closeLobbyTerminalPanel(); return 1;")
                    await asyncio.sleep(1)
            # 领光可领的任务后,终端任务红点应消失(领奖后重拉红点 + 开终端重拉)
            await ev("root.openLobbyQuestPanel(); return 1;")
            await asyncio.sleep(4)
            codes = await ev("const s=root.lobbyQuestState.summary; if(!s) return '[]'; const all=[...(s.daily||[]),...(s.achievements||[]),...(s.quests||[])]; return JSON.stringify(all.filter(q=>q.status==='COMPLETED'||q.claimable).map(q=>q.questCode));")
            print('claimable before', codes, 'badge', await ev("return String(root.lobbyBadges && root.lobbyBadges.quest);"), flush=True)
            for code in json.loads(codes or '[]'):
                await ev(f"root.claimLobbyQuest('{code}'); return 1;")
                await asyncio.sleep(3)
            await ev("root.closeLobbyQuestPanel(); root.openLobbyTerminalPanel(); return 1;")
            await asyncio.sleep(4)
            print('badge after', await ev("return String(root.lobbyBadges && root.lobbyBadges.quest);"), flush=True)
            await shot('terminal_after_claim')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
