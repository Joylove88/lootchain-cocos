# -*- coding: utf-8 -*-
"""野外三处修复自验(网页正式包,2026-10-30;模拟器内存吃紧时用):无头 Edge 打开本地正式包 → 登录 QA 号 → 林地:
1. 用户卡住的位置(坐标 26,45)真实键盘按住 ←↑ 2.5 秒,看是否走动、是否原地踏步;
2. 进战后重建世界层,同群怪仍有数值、会打人、能被打掉血;
3. 同群怪最近间距。
用法:PREVIEW_PORT=7460 python tools/qa/field_fix_web.py <输出目录>(先 python -m http.server 7460 在 build/web-mobile;游戏服 8081)
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'field_fix_web')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
TP = "const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
CAMP = 'FIELD_WOODS_7'
KEYS = {'ArrowLeft': 37, 'ArrowUp': 38}


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + TP + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_fieldfix'
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
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))

            async def keys(names, down):
                for n in names:
                    await call('Input.dispatchKeyEvent', {'type': 'keyDown' if down else 'keyUp', 'code': n, 'key': n, 'windowsVirtualKeyCode': KEYS[n]})

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
            for _ in range(90):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';") == 'ready':
                    break
                await asyncio.sleep(2)
            await ev("if (t.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(60):
                if await ev("return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(8)

            # 1) 卡住点往左上走(真实键盘)
            await ev("tp(-4180, -1238); return 1;")
            await asyncio.sleep(1)
            print('1 probe walkable', await ev("const pts = [[-4180,-1238],[-4230,-1198],[-4280,-1158],[-4330,-1118],[-4230,-1238],[-4180,-1190]]; "
                "const near = t.def.props.filter(p => p.block && Math.abs(p.x + 4180) < 400 && Math.abs(p.y + 1238) < 300).map(p => p.asset.split('/').slice(-2)[0] + '@' + p.x + ',' + p.y + ' b' + p.block.w + 'x' + p.block.d); "
                "return JSON.stringify({ w: pts.map(([x, y]) => t.walkable(x, y)), near });"), flush=True)
            await ev("tp(-4180, -1238); return 1;")
            await asyncio.sleep(0.5)
            # 无头浏览器拿不到键盘焦点(CDP 键盘事件进不了游戏):直接往游戏的按键集合里塞方向键,走的是同一条移动逻辑
            await ev("t.keys.add(cc.KeyCode.ARROW_LEFT); t.keys.add(cc.KeyCode.ARROW_UP); return 1;")
            for i in range(8):
                await asyncio.sleep(0.15)
                print('  t+%.2f' % (0.15 * (i + 1)), await ev("return (t.leader ? Math.round(t.leader.x) + ',' + Math.round(t.leader.y) : 'NO LEADER') + ' view=' + root.currentView + ' map=' + t.def.code + ' mounted=' + t.isMounted() + ' dead=' + t.leaderDead + ' status=' + (root.statusText || '');"), flush=True)
            print('1 keys held', await ev("return Array.from(t.keys).join(',') + ' v=' + JSON.stringify(t.inputVector());"), flush=True)
            await asyncio.sleep(0.9)
            mid = await ev("return Math.round(t.leader.x) + ',' + Math.round(t.leader.y) + ' moving=' + t.leader.moving;")
            await asyncio.sleep(1.3)
            await ev("t.keys.clear(); return 1;")
            end = await ev("return Math.round(t.leader.x) + ',' + Math.round(t.leader.y);")
            print('1 walk up-left from -4180,-1238: mid', mid, 'end', end, flush=True)
            await shot('walk_upleft')

            # 2) 进战 → 重建世界层 → 怪仍有数值、会打人、能被打掉血
            await ev(f"const c = t.def.camps.find(x => x.stageCode === '{CAMP}'); tp(c.x - 260, c.y); return 1;")
            await asyncio.sleep(5)
            print('2 before rebuild', await ev(f"return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === '{CAMP}').map(m => m.maxHp));"), flush=True)
            await ev("setTimeout(() => { t.buildWorld(); root.renderCurrentView(); }, 50); return 1;")
            await asyncio.sleep(5)
            await ev(f"const c = t.def.camps.find(x => x.stageCode === '{CAMP}'); tp(c.x - 260, c.y); return 1;")
            await asyncio.sleep(2)
            hp0 = await ev("return t.leaderHp;")
            stats = await ev(f"return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === '{CAMP}').map(m => m.maxHp));")
            for _ in range(8):
                await ev("t.leaderAttack(); return 1;")
                await asyncio.sleep(0.7)
            await asyncio.sleep(2)
            hp1 = await ev("return t.leaderHp;")
            after = await ev(f"return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === '{CAMP}').map(m => [m.hp, m.maxHp, m.dead]));")
            print('2 after rebuild maxHp', stats, flush=True)
            print('2 after attacks [hp,maxHp,dead]', after, 'leaderHp', hp0, '->', hp1, flush=True)

            # 3) 同群怪最近间距
            gap = await ev(f"const ms = t.monsters.filter(m => m.camp.stageCode === '{CAMP}' && !m.dead); let best = 1e9; "
                           "for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) best = Math.min(best, Math.hypot(ms[i].x - ms[j].x, (ms[i].y - ms[j].y) / 0.6)); "
                           "return Math.round(best) + ' (' + ms.length + ' alive)';")
            print('3 min gap', gap, flush=True)
            await shot('pack_fight')

            # 4) 发奖刷新(探索度到档 / 开宝箱都走 runWorldAction):队伍会不会丢、能不能恢复
            await ev("setTimeout(() => root.runWorldAction(async () => ({ state: root.worldState, rewards: [{ resourceType: 'CURRENCY', resourceCode: 'GOLD', resourceName: '金币', amount: 1 }], message: '探针' })), 50); return 1;")
            for i in range(10):
                await asyncio.sleep(1)
                print('4 t+%ds' % (i + 1), await ev("return (t.leader ? 'leader ok ' + Math.round(t.leader.x) : 'NO LEADER') + ' followers=' + t.followers.length + ' monsters=' + t.monsters.length + ' view=' + root.currentView + ' mounted=' + t.isMounted();"), flush=True)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
