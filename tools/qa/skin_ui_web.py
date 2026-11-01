"""英雄皮肤界面自验(docs/56,2026-11-01):无头 Edge 打开网页包 → 登录 guidetest02 →
商店皮肤页(未拥有)截图 → 预览动作 → 购买 → 英雄详情皮肤页(默认 / 选中皮肤 / 穿戴后)→ 野外队长外观,逐步截图并打印状态。
先跑:本地库删掉 guidetest02 的 user_hero_skin(从未拥有开始测购买)。
用法:PREVIEW_PORT=7460 python tools/qa/skin_ui_web.py <输出目录> [--phone]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'skin_ui_web'))
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_skinui'
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
            # ① 商店皮肤页
            for _ in range(240):
                if await ev("let b=false; root.node.walk(n=>{ if(n.name==='PackLoading') b=true; }); return b ? 'wait' : 'ok';") == 'ok':
                    break
                await asyncio.sleep(1)
            await ev("root.openLobbyShopDialog('skin'); return 1;")
            for _ in range(240):
                if await ev("let b=false; root.node.walk(n=>{ if(n.name==='PackLoading') b=true; }); return b ? 'wait' : 'ok';") == 'ok':
                    break
                await asyncio.sleep(1)
            await ev("if (!root.lobbyShopDialog) root.openLobbyShopDialog('skin'); return 1;")
            await wait_for("return root.lobbyShopDialog && root.lobbyShopDialog.kind === 'skin' && !root.lobbyShopDialog.busy ? 'ok' : 'wait';", 120)
            await asyncio.sleep(5)
            await shot('01_shop_skin')
            await ev("root.toggleShopSkinPreview(); return 1;")
            await asyncio.sleep(6)
            await shot('02_shop_preview')
            await ev("root.toggleShopSkinPreview(); return 1;")
            await asyncio.sleep(1)
            await ev("root.buyShopSkin('SKIN_WITCH03_BLOODMOON'); return 1;")
            await wait_for("return root.lobbyShopDialog && !root.lobbyShopDialog.busy ? 'ok' : 'wait';", 60)
            await asyncio.sleep(3)
            print('buy notice', await ev("return root.lobbyShopDialog ? root.lobbyShopDialog.notice : 'none';"), flush=True)
            await shot('03_shop_bought')
            # 其他分页:金币(确认分页 + 内容下移不重叠)
            await ev("root.switchLobbyShopTab('gold'); return 1;")
            await asyncio.sleep(3)
            await shot('04_shop_gold')
            await ev("root.closeLobbyShopDialog(); return 1;")
            await asyncio.sleep(1)
            # ② 英雄详情 → 皮肤页
            hid = await ev("const h = root.lobbyHeroRosterLoader.currentState().heroes.find(x => x.heroCode === 'SR_WITCH_03'); return h ? h.id : 0;")
            print('witch hero id', hid, flush=True)
            await ev(f"root.openLobbyHeroDetail({hid}); return 1;")
            await asyncio.sleep(6)
            await shot('04b_hero_attr')
            await ev("root.selectLobbyHeroDetailTab('skin'); return 1;")
            await asyncio.sleep(6)
            await shot('05_hero_skin_default')
            await ev("root.selectHeroSkin('SKIN_WITCH03_BLOODMOON'); return 1;")
            await asyncio.sleep(4)
            await shot('06_hero_skin_selected')
            await ev("root.equipHeroSkin('SR_WITCH_03', 'SKIN_WITCH03_BLOODMOON'); return 1;")
            await wait_for("return root.heroSkinEquipping ? 'wait' : 'ok';", 60)
            await asyncio.sleep(4)
            await shot('07_hero_skin_equipped')
            print('after equip power', await ev("const h = root.lobbyHeroRosterLoader.currentState().heroes.find(x => x.heroCode === 'SR_WITCH_03'); return h ? h.power : 0;"), flush=True)
            # 点「已穿戴」提示战力加成(11-01)
            await asyncio.sleep(3)
            await ev("root.remindHeroSkinEquipped('SKIN_WITCH03_BLOODMOON'); return 1;")
            await asyncio.sleep(0.6)
            await shot('07b_hero_skin_remind')
            # 默认已是动作预览;切到静态立绘
            await ev("root.toggleHeroSkinPreview(); return 1;")
            await asyncio.sleep(4)
            await shot('08_hero_skin_static')
            await ev("root.toggleHeroSkinPreview(); return 1;")
            await asyncio.sleep(6)
            print('preview probe', await ev("let h=null; root.node.walk(n=>{ if(!h && n.name==='HeroSkinSpinePreview') h=n; }); if(!h) return 'none'; const sn=h.children[0]; const sk=sn.getComponent('sp.Skeleton'); const st=h.parent; const ut=st.getComponent('cc.UITransform'); return JSON.stringify({holder:[Math.round(h.position.x),Math.round(h.position.y)], stageH: ut && Math.round(ut.height), spine:[Math.round(sn.position.x),Math.round(sn.position.y)], scale: sn.scale.x.toFixed(4), anim: sk && sk.animation, wpos: [Math.round(sn.worldPosition.x), Math.round(sn.worldPosition.y)], data: sk && sk.skeletonData && sk.skeletonData.name});"), flush=True)
            # 任务页(B 风格电脑端也用)
            await ev("root.closeLobbyHeroDetailPanel(); return 1;")
            await asyncio.sleep(2)
            await ev("root.openLobbyQuestPanel(); return 1;")
            await asyncio.sleep(6)
            await shot('09_quest')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
