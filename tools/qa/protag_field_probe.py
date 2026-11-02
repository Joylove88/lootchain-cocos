"""主角野外队长加载探针(docs/60):登录 → 等跑图队伍建好 → 打印队长骨骼加载状态 + 控制台报错 → 截图。
用法:PREVIEW_PORT=7460 python tools/qa/protag_field_probe.py <输出目录> [--user=guidetest02]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'protag_field_probe'))
USER = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--user=')), 'guidetest02')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
T = "const t = root.lobbyTownRenderer;"


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_protagfield'
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    logs = []
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
                    if x.get('method') == 'Runtime.consoleAPICalled' and x['params'].get('type') in ('warning', 'error'):
                        logs.append(' '.join(str(a.get('value', a.get('description', '')))[:300] for a in x['params'].get('args', [])))
                    if x.get('id') == my:
                        return x

            async def ev(body, timeout=120):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            await call('Runtime.enable')
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
                if await ev(T + " return root.currentView === 'lobby' && t && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            for i in range(20):
                st = await ev(T + " const l = t.leader; return JSON.stringify({ map: t.def && t.def.code, code: l.hero.heroCode, spine: l.hero.spineAsset, portrait: l.hero.portraitAsset, "
                              "skel: !!l.skeleton, names: l.names, kids: l.node.children.map(c => c.name), followers: t.followers.map(a => a.hero.heroCode + ':' + !!a.skeleton), heroName: l.hero.heroName, bar: t.leaderBar && t.leaderBar.name && t.leaderBar.name.string });")
                print(i, st, flush=True)
                if '"skel":true' in st:
                    break
                await asyncio.sleep(2)
            if '--chief' in sys.argv:
                print('maps', await ev("return JSON.stringify((root.worldState && root.worldState.maps || []).map(m => m.mapCode + ':' + m.unlocked + ':' + (m.lockReason || '')));"), flush=True)
                await ev("setTimeout(() => root.preloadWorldMap('VILLAGE', () => { root.lobbyTownRenderer.enterMap('VILLAGE', { x: 200, y: 420 }); root.renderCurrentView(); }), 50); return 1;")
                await asyncio.sleep(8)
                print('after travel', await ev(T + " return t.def.code + ' status=' + (root.statusPresenter && root.statusPresenter.text);"), flush=True)
                for _ in range(90):
                    if await ev(T + " return t.def.code === 'VILLAGE' && t.leader && t.leader.skeleton ? 'ok' : 'wait';") == 'ok':
                        break
                    await asyncio.sleep(1)
                await asyncio.sleep(4)
                import base64 as _b64
                for code in ['CHIEF', 'INSTRUCTOR', 'PRIEST', 'SMITH']:
                    await ev(T + f" const n = t.def.npcs.find(x => x.code === '{code}'); t.leader.x = n.x - 160; t.leader.y = n.y - 120; t.leader.node.setPosition(t.leader.x, t.leader.y, 0); return 1;")
                    await asyncio.sleep(3)
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    open(os.path.join(OUT, f'npc_{code}.png'), 'wb').write(_b64.b64decode(m['result']['data']))
                await ev(T + " t.leader.x = 200; t.leader.y = 420; t.leader.node.setPosition(200, 420, 0); return 1;")
                await asyncio.sleep(3)
                print('npcdbg', await ev(T + " const P = 'ui/world/npc_chief/spriteFrame'; return JSON.stringify({ code: t.def.code, npcs: t.def.npcs.map(n => n.code), res: !!cc.resources.get(P, cc.SpriteFrame), cache: !!root.uiSpriteFrameCache.resolve(P, {}), names: t.entityRoot.children.filter(c => /Npc/.test(c.name)).map(c => c.name), info: !!cc.resources.getInfoWithPath('ui/world/npc_chief', cc.SpriteFrame) || !!cc.resources.getInfoWithPath(P) });"), flush=True)
                await ev("cc.resources.load('ui/world/npc_chief/spriteFrame', cc.SpriteFrame, (e, f) => { window.__npcErr = e ? String(e) : ('ok ' + (f && f.name)); }); return 1;")
                await asyncio.sleep(4)
                print('npcload', await ev("return String(window.__npcErr);"), flush=True)
                print('chief', await ev(T + " const n = t.entityRoot.getChildByName('TownNpc_CHIEF'); if (!n) return 'no node'; const kids = t.entityRoot.children; const art = n.getChildByName('Art'); "
                      "const house = kids.find(c => /chief/i.test(c.name)); return JSON.stringify({ active: n.activeInHierarchy, pos: [n.position.x, n.position.y], idx: kids.indexOf(n), houseIdx: house ? kids.indexOf(house) : -1, houseName: house && house.name, "
                      "art: !!(art && art.getComponent(cc.Sprite) && art.getComponent(cc.Sprite).spriteFrame), op: n.getComponent(cc.UIOpacity) && n.getComponent(cc.UIOpacity).opacity, total: kids.length, near: kids.filter(c => Math.abs(c.position.x - 300) < 500 && Math.abs(c.position.y - 600) < 300).map(c => c.name + '@' + kids.indexOf(c) + ':' + Math.round(c.position.y)) });"), flush=True)
            if '--rprefixes' in sys.argv:
                heroes = [('R_PATROL_01','战士','1001'),('R_ACOLY_02','辅助','1012'),('R_SCOUT_03','刺客','1004'),('R_CULT_05','法师','1008'),('R_RANGER_06','射手','1016'),('R_GUARD_07','坦克','1003')]
                arr = ','.join("{id:%d,heroCode:'%s',heroClass:'%s',rarity:'R',spineAsset:'npc_%s',portraitAsset:'act_%s',heroName:'x',level:1,power:1}" % (i + 1, c, k, n, n) for i, (c, k, n) in enumerate(heroes))
                print('RPREFIX', await ev(T + " return JSON.stringify(t.partyPackPrefixesOf([" + arr + "]));"), flush=True)
            print('res', await ev("const r = cc.resources; const info = r.getInfoWithPath('spine/hero/protag_m/protag_m', cc.sp.SkeletonData); return JSON.stringify({ info: !!info, uuid: info && info.uuid });"))
            await asyncio.sleep(2)
            m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
            open(os.path.join(OUT, 'field.png'), 'wb').write(base64.b64decode(m['result']['data']))
            print('LOGS:')
            for line in logs[-40:]:
                print('  ', line[:300])
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
