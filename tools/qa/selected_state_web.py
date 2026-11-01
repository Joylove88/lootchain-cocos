"""选中态全局口径自验(11-02 用户:选中黄底配白字)——任务页签 / 商店页签 + 支付方式 / 区域地图切换 / 英雄装备部位页签 / 公告页签逐一截图。
原:终端公告弹框自验(11-02 原型 周报截图/2026-11-01_B风格补全/proto/notice_b2.png)。
无头 Edge 打开网页包 → 登录 guidetest02 → 开终端 → 「公告」弹框:默认页 / 点条目 / 切「更新」/ 长正文滚到底 / ✕ / 重开看已读红点 / 返回键。
先跑:本地库导入 tools/qa/notice_dialog_seed.sql(QA_1102_ 公告,含不应出现的活动类)。
用法:PREVIEW_PORT=7460 python tools/qa/notice_dialog_web.py <输出目录> [--phone]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'selected_state_web'))
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
DLG = "let d=null; root.node.walk(x=>{ if(!d && x.name==='LobbyNoticeDialog') d=x; });"
CLICK = DLG + " if(!d) return 'nodialog'; let n=null; d.walk(x=>{ if(!n && x.name==='%s' && x.activeInHierarchy) n=x; }); if(!n) return 'nonode'; n.emit('click', n.getComponent('cc.Button')); return 'ok';"
STATE = (DLG + " const t=[]; const dots=[]; if(d) d.walk(x=>{ if(x.name==='Title' && x.parent && x.parent.name.startsWith('Row_')) t.push(x.parent.name+':'+x.getComponent('cc.Label').string); "
         "if(x.name==='Dot') dots.push(x.parent.name); }); "
         "const data=root.lobbyNoticeDialogData(); "
         "return JSON.stringify({dialog: root.lobbyNoticeDialog, open: !!d, terminal: root.lobbyTerminalOpen, loading: data.loading, all: data.notices.map(n=>n.noticeNo), rows: t, dots});")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_sel'
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

            async def wait_pack():
                for _ in range(90):
                    await asyncio.sleep(1)
                    if await ev("let b=false; root.node.walk(n=>{ if(n.name==='PackLoading' || n.name==='SceneAssetLoadingTip') b=true; }); return b ? 'wait' : 'ok';") == 'ok':
                        break
                await asyncio.sleep(3)
            for name, open_js, close_js in [
                ('quest', "root.openLobbyQuestPanel();", "root.closeLobbyQuestPanel();"),
                ('shop_diamond', "root.openLobbyShopDialog('diamond');", "root.closeLobbyShopDialog();"),
                ('shop_gold', "root.openLobbyShopDialog('gold');", "root.closeLobbyShopDialog();"),
                ('areamap', "root.openAreaMapPanel();", "root.closeAreaMapPanel && root.closeAreaMapPanel();"),
                ('hero_equip', "const h=root.lobbyHeroRosterLoader.currentState().heroes.find(x=>x.id>0 && !String(x.heroCode).startsWith('EX')); root.openLobbyHeroDetail(h.id); setTimeout(()=>root.selectLobbyHeroDetailTab('equip'), 2500);", "root.closeLobbyHeroDetailPanel();"),
            ]:
                await ev(open_js + " return 1;")
                await wait_pack()
                await shot(name)
                print(name, 'done', flush=True)
                await ev(close_js + " return 1;")
                await asyncio.sleep(2)
            await ev("root.openLobbyTerminalPanel(); return 1;")
            await asyncio.sleep(3)
            await ev("root.runLobbyTerminalAction('notice'); return 1;")
            await asyncio.sleep(4)
            await shot('notice')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
