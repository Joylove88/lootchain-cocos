"""野外精英 / 首领自验(2026-11-01:Meowa 高清写实变种 + 骨骼光环 + 首领出场):
无头 Edge 打开网页包 → 登录 guidetest02 → 林地怪群旁 → 依次放 K / L / I / Shift,每个动作连拍几张,
打印队长英雄、技能特效是否就绪、实际播的动作名。
用法:PREVIEW_PORT=7460 python tools/qa/field_skill_web.py <输出目录> [--leader=英雄码]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'field_elite_web'))
LEADER = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--leader=')), '')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_elite'
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
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 80}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))

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
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            T = "const t = root.lobbyTownRenderer; const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
            await ev("if (root.lobbyTownRenderer.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(120):
                if await ev(T + " return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            if LEADER:
                idx = await ev(T + f" return t.followers.findIndex(a => a.hero.heroCode === '{LEADER}');")
                print('swap to', LEADER, idx, flush=True)
                if isinstance(idx, int) and idx >= 0:
                    await ev(T + f" t.swapLeader({idx}); return 1;")
            await asyncio.sleep(8)
            print('party', await ev(T + " return JSON.stringify([t.leader, ...t.followers].map(a => ({ code: a.hero.heroCode, rarity: a.hero.rarity, role: a.role, names: a.names, kit: t.kitOf(a) })));"), flush=True)
            await asyncio.sleep(6)
            for code in ['FIELD_WOODS_E2', 'FIELD_WOODS_E', 'FIELD_WOODS_B']:
                await ev(T + f" const c = t.def.camps.find(x => x.stageCode === '{code}'); tp(c.x - 420, c.y - 40); return 1;")
                await asyncio.sleep(4)
                # 展示模式:截图时临时隐藏其他怪 + 精英附近的道具(别的营地会被引过来、兽皮架之类会挡镜头),队伍站精英左侧
                await ev(T + f" const m = t.monsters.find(x => x.camp.stageCode === '{code}' && !x.dead); if (!m) return 0;"
                         f" t.monsters.forEach(x => {{ if (x !== m) x.node.active = false; }});"
                         f" (t.propNodes || []).forEach(p => {{ if (Math.hypot(p.node.position.x - m.x, p.node.position.y - m.y) < 700) p.node.active = false; }});"
                         f" tp(m.x - 280, m.y - 80); return 1;")
                await asyncio.sleep(2.5)
                print(code, await ev(T + f" const m = t.monsters.find(x => x.camp.stageCode === '{code}' && !x.dead); return m ? JSON.stringify({{ x: Math.round(m.x), y: Math.round(m.y), lx: Math.round(t.leader.x), ly: Math.round(t.leader.y), active: m.node.active, op: m.node.getComponent('cc.UIOpacity') ? m.node.getComponent('cc.UIOpacity').opacity : 255, scale: m.spineNode && m.spineNode.scale.x, kids: m.node.children.map(n => n.name + ':' + n.active) }}) : 'none';"), flush=True)
                await shot(f'{code}_idle')
                print(code, 'aura', await ev(T + f" const m = t.monsters.find(x => x.camp.stageCode === '{code}' && !x.dead); const out = []; m.node.children.filter(n => n.name === 'TownFx').forEach(h => {{ const f = h.children[0]; const sk = f && f.getComponent('sp.Skeleton'); const tr = sk && sk.getCurrent(0); out.push({{ hs: [h.scale.x, h.scale.y], hp: [Math.round(h.position.x), Math.round(h.position.y)], fs: f && [f.scale.x.toFixed(3), f.scale.y.toFixed(3)], fp: f && [Math.round(f.position.x), Math.round(f.position.y)], anim: tr && tr.animation.name, t: tr && tr.trackTime.toFixed(2), ts: sk && sk.timeScale, pma: sk && sk.premultipliedAlpha, op: h.getComponent('cc.UIOpacity') && h.getComponent('cc.UIOpacity').opacity, data: sk && sk.skeletonData && sk.skeletonData.name }}); }}); return JSON.stringify(out);"), flush=True)
                await ev(T + " t.monsters.forEach(x => x.node.active = true); (t.propNodes || []).forEach(p => p.node.active = true); return 1;")
                if code.endswith('_B'):
                    # 首领开战:点一下普攻触发出场(光环放大回弹 + 名号横幅)
                    await ev(T + " const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_B'); tp(c.x - 200, c.y - 20); t.leaderAttack(); return 1;")
                    for i in range(3):
                        await asyncio.sleep(0.35)
                        await shot(f'{code}_intro_{i}')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
