# -*- coding: utf-8 -*-
"""矿境面板渲染排障:打开面板后收集 window.onerror / console.error 与面板节点树(名字 / active / 透明度)。
用法:PREVIEW_PORT=7460 python tools/qa/raid_ui_probe.py"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boss_bar_cdp as base  # noqa: E402

ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"


async def main():
    profile = base.PROFILE + '_raidprobe'
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
                r = await call('Runtime.evaluate', {'expression': "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()", 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:500]

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            await call('Runtime.evaluate', {'expression': "(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } window.__cc = cc; return 'ok'; })()", 'awaitPromise': True, 'returnByValue': True}, 400)
            v = ''
            for _ in range(120):
                v = await ev("return root ? root.currentView : 'noroot';")
                if v in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(2)
            if v != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    if await ev("return root.currentView;") == 'lobby':
                        break
                    await asyncio.sleep(2)
            await asyncio.sleep(3)
            await ev("window.__errs=[]; window.addEventListener('error', e=>window.__errs.push(String(e.message))); const oe=console.error; console.error=(...a)=>{ window.__errs.push(a.map(x=>String(x&&x.stack||x)).join(' ').slice(0,400)); oe.apply(console,a); }; const ow=console.warn; console.warn=(...a)=>{ window.__errs.push('W:'+a.map(x=>String(x)).join(' ').slice(0,200)); ow.apply(console,a); }; return 'hooked';")
            await ev("root.openLobbyRaidPanel(); return 'raid';")
            for i in range(12):
                await asyncio.sleep(1)
                print('t', i, await ev("const ui=root.node.getChildByName('LootChainCocosLoginUIRoot'); const cr=ui&&ui.children[0]; return JSON.stringify({gate: root.uiSpriteFrameCache.groupProgress('raid'), cr: cr&&cr.name, kids: cr? cr.children.map(c=>c.name).slice(0,12) : null});"), flush=True)
            print('input', await ev("return JSON.stringify({active: document.activeElement && document.activeElement.tagName, held: root.isHeroGrowthRenderHeld ? root.isHeroGrowthRenderHeld() : 'n/a', timer: root.uiSpriteFrameCache.renderRefreshTimer !== null});"), flush=True)
            print('gatewhy', await ev("const ui=root.node.getChildByName('LootChainCocosLoginUIRoot'); const cr=ui&&ui.children[0]; const t=cr.getChildByName('SceneAssetLoadingTitle'); const c=cr.getChildByName('SceneAssetLoadingCount'); const g=root.sceneAssetGateGroup(root.currentView); return JSON.stringify({title: t&&t.getComponent(cc.Label).string, count: c&&c.getComponent(cc.Label).string, group: g, progress: root.uiSpriteFrameCache.groupProgress(g), gateNow: root.renderSceneAssetGate(root.resolveLayout())});"), flush=True)
            print('manual', await ev("root.renderCurrentView(); const ui=root.node.getChildByName('LootChainCocosLoginUIRoot'); const cr=ui&&ui.children[0]; return JSON.stringify(cr.children.map(c=>c.name).slice(0,12));"), flush=True)
            print('errs', await ev("return JSON.stringify(window.__errs.slice(0,8));"), flush=True)
            print('view', await ev("return JSON.stringify({view: root.currentView, raidOpen: root.lobbyRaidPanelOpen, gate: root.uiSpriteFrameCache.groupProgress('raid'), tab: root.currentLobbyRaidState().tab, pvp: !!root.currentLobbyRaidPvpState().home, stages: !!root.currentLobbyRaidState().stages});"), flush=True)
            print('tabchain', await ev("let t=null; root.node.walk(n=>{ if(n.name==='LobbyRaidTab_pvp') t=n; }); if(!t) return 'notab'; const chain=[]; let p=t; while(p){ chain.push(p.name+(p.activeInHierarchy?'':'(off)')); p=p.parent; } return chain.join(' < ');"), flush=True)
            print('rootkids', await ev("return JSON.stringify(root.node.children.map(c=>c.name+':'+c.children.length+':'+c.activeInHierarchy));"), flush=True)
            print('walk', await ev("let c=null; root.node.walk(n=>{ if(n.name==='LobbyRaidSceneContent') c=n; }); if(!c) return 'nocontent'; const f=c.children[0]; return JSON.stringify({parent:c.parent&&c.parent.name, active:c.activeInHierarchy, frame:f&&f.name, kids:(f?f.children:[]).map(n=>n.name+':'+n.active+':'+n.children.length)});"), flush=True)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            open(os.path.join(os.environ.get('TEMP','.'), 'raid_probe_before.png'), 'wb').write(__import__('base64').b64decode(m['result']['data']))
            print('masks', await ev("let c=null; root.node.walk(n=>{ if(n.name==='LobbyRaidSceneContent') c=n; }); if(!c) return 'nocontent'; let n=0; c.walk(x=>{ const mk=x.getComponent(cc.Mask); if(mk){ mk.destroy(); n++; } }); return 'destroyed '+n;"), flush=True)
            await asyncio.sleep(1.5)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            open(os.path.join(os.environ.get('TEMP','.'), 'raid_probe_after.png'), 'wb').write(__import__('base64').b64decode(m['result']['data']))
            print('nodes', await ev("const c=root.node.getChildByName('LobbyRaidSceneContent'); if(!c) return 'nocontent'; const f=c.children[0]; return JSON.stringify(f.children.map(n=>n.name+':'+n.active+':'+(n.getComponent(cc.UIOpacity)?n.getComponent(cc.UIOpacity).opacity:'-')+':'+n.children.length));"), flush=True)
            print('mine', await ev("const c=root.node.getChildByName('LobbyRaidSceneContent'); if(!c) return 'nocontent'; let m=null; c.walk(n=>{ if(n.name==='LobbyRaidPvpMine') m=n; }); if(!m) return 'nomine'; return JSON.stringify({pos:[m.position.x,m.position.y], size:[m.getComponent(cc.UITransform).width, m.getComponent(cc.UITransform).height], kids:m.children.map(n=>n.name+':'+n.components.map(x=>x.constructor.name).join('/'))});"), flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
