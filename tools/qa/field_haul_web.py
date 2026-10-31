"""野外按只掉落自验(docs/52 §7,2026-10-31):无头 Edge 打开网页包 → 登录 guidetest02 → 林地 → 打一群普通小怪(幼鼠窝)+ 一只精英,
过程中截图(本轮战果卡 / 掉落飞行图标),打印每次击杀上报回执、战果卡累计、最终世界状态。
用法:PREVIEW_PORT=7460 python tools/qa/field_haul_web.py <输出目录>
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'field_haul_web'))
GPU = '--gpu' in sys.argv
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_haul'
    shutil.rmtree(profile, ignore_errors=True)
    flags = [] if GPU else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', *flags, 'about:blank'])
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
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                # currentView 初始值就是 login:要等启动下载页结束(下载器登记 = 开局包下完)才算真正到登录页
                if view in ('login', 'lobby', 'loginAccount') and await ev("return (window.__lootchainPack && !root.bootPreloadActive) ? 'y' : 'n';") == 'y':
                    break
                await asyncio.sleep(1)
            if view != 'lobby' and os.environ.get('NEW_USER') == '1':
                acct = 'poi' + str(int(time.time()))[-8:]
                await ev("root.loginFlow.setInputs({string:'" + acct + "'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.register()); return 1;")
                for _ in range(60):
                    v = await ev("return root.currentView;")
                    if v in ('protagonistCreate', 'lobby'):
                        break
                    await asyncio.sleep(1)
                if v == 'protagonistCreate':
                    await ev("root.protagonistCreateFlow.nameInput = { string: '兴趣" + acct[-4:] + "' }; root.submitProtagonistCreate(); return 1;")
                print('new account', acct, v, flush=True)
            elif view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;")
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            for i in range(8):
                await asyncio.sleep(3)
                print('  pack', await ev("const P = window.__lootchainPack; const g = root.uiSpriteFrameCache.groupDownloads; const names = []; root.node.walk(n => { if (/Loading/.test(n.name)) names.push(n.name); }); "
                                         "return JSON.stringify({ view: root.currentView, urgent: P && P.urgent.length, queue: P && P.queue.length, inFlight: P && P.inFlight.size, running: P && P.running, started: P && P.started, paused: P && P.paused, waiters: P && P.waiters.map(w => w.need.size + '/' + w.total), failed: P && P.failed.size, groups: Array.from(g.entries()), loading: names });"), flush=True)
            T = "const t = root.lobbyTownRenderer; const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
            await ev("if (root.lobbyTownRenderer.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(120):
                if await ev(T + " return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(6)
            # 截获击杀上报回执(包一层 api)
            await ev("const api = root.api.world; if (!api.__wrapped) { const k = api.fieldKill.bind(api); api.fieldKill = async (id, n) => { const r = await k(id, n); (window.__kills = window.__kills || []).push({ id, n, drops: r.drops.filter(d => d.items.length).length, rewards: r.rewards.map(x => x.resourceName + x.amount).join(','), capped: r.capped }); return r; }; api.__wrapped = true; } return 1;")
            for camp_code, label in [('FIELD_WOODS_1', 'normal'), ('FIELD_WOODS_E2', 'elite')]:
                await ev(T + f" const c = t.def.camps.find(x => x.stageCode === '{camp_code}'); tp(c.x - 220, c.y); return 1;")
                await asyncio.sleep(2)
                for step in range(60):
                    await ev(T + " t.leaderAttack(); return 1;")
                    await asyncio.sleep(0.6)
                    if step == 8:
                        await shot(f'{label}_mid')
                    alive = await ev(T + f" return t.monsters.filter(m => m.camp.stageCode === '{camp_code}' && !m.dead).length;")
                    if alive == 0:
                        break
                await asyncio.sleep(0.5)
                await shot(f'{label}_cleared')
                await asyncio.sleep(2.5)
                await shot(f'{label}_after')
                print(label, 'haul', await ev(T + " return t.haul ? JSON.stringify({ kills: t.haul.kills, groups: t.haul.groups, totals: Array.from(t.haul.totals.values()), notes: t.haul.notes }) : 'none';"), flush=True)
            print('kill reports', await ev("return JSON.stringify(window.__kills || []);"), flush=True)
            await asyncio.sleep(9)
            print('after idle haul', await ev(T + " return t.haul ? 'still shown' : 'hidden';"), flush=True)
            await shot('zz_idle')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
