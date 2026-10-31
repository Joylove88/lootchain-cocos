"""野外技能 / 闪避表现自验(2026-10-31 用户:「瞬移没有动作动画;只有大招有技能特效,其他技能没有特效,有些还显示贴图」):
无头 Edge 打开网页包 → 登录 guidetest02 → 林地怪群旁 → 依次放 K / L / I / Shift,每个动作连拍几张,
打印队长英雄、技能特效是否就绪、实际播的动作名。
用法:PREVIEW_PORT=7460 python tools/qa/field_skill_web.py <输出目录> [--leader=英雄码]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'field_skill_web'))
LEADER = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--leader=')), '')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_skill'
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
            print('anims', await ev(T + " return JSON.stringify([t.leader, ...t.followers].map(a => [a.hero.heroCode, (a.skeleton.skeletonData.getRuntimeData().animations || []).map(x => x.name + ':' + x.duration.toFixed(2)).join(' ')]));"), flush=True)
            if '--solo' in sys.argv:
                await ev(T + " t.followers.forEach(a => a.node.active = false); return 1;")
            print('fx ready', await ev(T + " return JSON.stringify(Array.from(t.fx.ready.keys()));"), flush=True)
            if '--dodge' in sys.argv:
                # 空地上连按闪避,密集连拍看动作 / 残影
                await ev(T + " const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_1'); tp(t.def.spawn.x, t.def.spawn.y); return 1;")
                await asyncio.sleep(2.5)
                for k, frames in enumerate([2, 3, 4]):
                    r = await call('Runtime.evaluate', {'expression': js(T + " t.dodgeReadyAt = 0; t.dashUntil = 0; t.leaderDodge(); return new Promise(res => { let n = 0; const f = () => { n += 1; if (n >= " + str(frames) + ") { cc.director.pause(); res(t.leader.anim + ' ang=' + Math.round(t.leader.spineNode.angle) + ' ghosts=' + t.entityRoot.children.filter(n => n.name === 'TownDodgeGhost').length + ' x=' + Math.round(t.leader.x)); } else requestAnimationFrame(f); }; requestAnimationFrame(f); });"), 'awaitPromise': True, 'returnByValue': True}, 60)
                    print('  dodge', frames, r.get('result', {}).get('result', {}).get('value'), flush=True)
                    await shot(f'dodge_f{frames}')
                    await ev("cc.director.resume(); return 1;")
                    await asyncio.sleep(2)
                return
            await ev(T + " const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_1'); tp(c.x - 260, c.y); return 1;")
            await asyncio.sleep(2.5)
            await shot('00_before')
            for label, call_js in [('K', 't.leaderSkill(0)'), ('L', 't.leaderSkill(1)'), ('I', 't.leaderSkill(2)'), ('dodge', 't.leaderDodge()')]:
                await ev(T + " t.skillReadyAt = [0, 0, 0]; t.dodgeReadyAt = 0; t.actionUntil = 0; t.dashUntil = 0; return 1;")
                await ev(T + f" {call_js}; return 1;")
                print(label, 'anim', await ev(T + " return t.leader.anim + ' ts=' + (t.leader.skeleton && t.leader.skeleton.timeScale);"), flush=True)
                for i, delay in enumerate([0.12, 0.25, 0.35, 0.5]):
                    await asyncio.sleep(delay)
                    await shot(f'{label}_{i}')
                print(label, 'fx nodes', await ev(T + " const out = []; t.entityRoot.walk(n => { if (/^Town(Fx|Strike|Bolt|Dodge)/.test(n.name)) out.push(n.name); }); return out.join(',');"), flush=True)
                await asyncio.sleep(1.5)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
