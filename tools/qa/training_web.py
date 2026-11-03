# -*- coding: utf-8 -*-
"""训练场改版自验(11-03,网页正式包):无头 Edge 打开本地正式包 → 登录 guidetest03(晨风村新手阶段)→
1. 推进到「拿起武器」V02(V01 对话交付 → 接 V02);
2. 截图:场外入口 / 场内贴前排栅栏(栅栏应盖住腿)/ 后排栅栏背后(栅栏应盖住人)/ 教官和 3 个稻草靶;
3. 场内多点可走探针、栅栏不可穿;
4. 连续普攻打掉 3 个稻草靶 → 任务进度 3/3;等 5 秒看是否重立。
用法:PREVIEW_PORT=7460 python tools/qa/training_web.py [输出目录](游戏服 8081;测完按备份恢复 guidetest03 的剧情行)
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'training_web')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
TP = "const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 70; a.y = y - i * 20; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 300, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
O = (1760, 366)  # 训练场原点


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " " + TP + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


def rel(px, py):
    s = 1888 / 1533
    return round(O[0] + px * s - 944), round(O[1] + 1097.3 - py * s)


async def main():
    # 不清配置目录:首访要整块下地图 / 队伍素材(无头下很慢),留着缓存下次直接读;带 --fresh 才清
    profile = base.PROFILE + '_training'
    if '--fresh' in sys.argv:
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
                    print('shot', name, flush=True)

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
                await ev("root.loginFlow.setInputs({string:'guidetest03'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
            for _ in range(120):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState && t.leader) ? 'ready' : 'wait';") == 'ready':
                    break
                await asyncio.sleep(2)
            # 无头 SwiftShader 下骨骼加载很慢:等队长骨骼就绪再截图
            for _ in range(90):
                if await ev("return t.leader && t.leader.skeleton && t.leader.skeleton.skeletonData ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(2)
            # 首访要整块下地图素材(「正在加载队伍」挡下载页),等它消失
            for _ in range(400):
                if await ev("let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';") == 'ok':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(3)
            print('map', await ev("return t.def.code;"), flush=True)
            # 1) 推进到 V02
            q = await ev("return JSON.stringify(root.worldState.quests.filter(q => q.code === 'V01' || q.code === 'V02').map(q => q.code + ':' + q.state + ':' + q.progress + '/' + q.target));")
            print('quests', q, flush=True)
            if 'V01:ACCEPTED' in q:
                print('V01', await ev("await root.runWorldAction(() => root.api.world.reportQuest('V01', 'TALK', 'CHIEF')); return String(await root.runWorldAction(() => root.api.world.claimQuest('V01')));"), flush=True)
            q = await ev("return JSON.stringify(root.worldState.quests.filter(q => q.code === 'V02').map(q => q.code + ':' + q.state + ':' + q.progress + '/' + q.target));")
            if 'AVAILABLE' in q:
                print('accept V02', await ev("return String(await root.runWorldAction(() => root.api.world.acceptQuest('V02')));"), flush=True)
            await ev("root.closeWorldDialog && root.closeWorldDialog(); return 1;")
            print('quests', await ev("return JSON.stringify(root.worldState.quests.filter(q => q.code === 'V02').map(q => q.code + ':' + q.state + ':' + q.progress + '/' + q.target + ' ' + q.desc));"), flush=True)
            # 2) 截图
            ex, ey = rel(400, 760)
            await ev(f"tp({ex}, {ey}); return 1;")
            await asyncio.sleep(2.5)
            await shot('01_entrance')
            fx, fy = rel(1000, 695)
            await ev(f"tp({fx}, {fy}); return 1;")
            await asyncio.sleep(2)
            await shot('02_inside_front_fence')
            bx, by = rel(820, 300)
            await ev(f"tp({bx}, {by}); return 1;")
            await asyncio.sleep(2)
            await shot('03_behind_back_fence')
            sx, sy = rel(330, 500)
            await ev(f"tp({sx}, {sy}); return 1;")
            await asyncio.sleep(2)
            await shot('04_behind_shed')
            # 3) 可走探针
            probes = {'inside_center': rel(760, 520), 'inside_left_corner': rel(150, 520), 'inside_right_corner': rel(1400, 555),
                      'stairs': rel(420, 690), 'front_fence': rel(1000, 745), 'back_fence': rel(700, 350), 'behind_back': rel(820, 300),
                      'left_shed': rel(360, 600), 'outside_front': rel(1000, 830)}
            body = "return JSON.stringify({" + ", ".join(f"'{k}': t.walkable({x}, {y})" for k, (x, y) in probes.items()) + "});"
            print('walkable', await ev(body), flush=True)
            # 4) 打稻草靶
            await ev("tp(1650, 760); return 1;")
            await asyncio.sleep(2)
            print('dummies', await ev("return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === 'FIELD_VILLAGE_T').map(m => [Math.round(m.x), Math.round(m.y), m.dead, m.hp + '/' + m.maxHp]));"), flush=True)
            await shot('05_dummies')
            for round_ in range(3):
                target = await ev("const m = t.monsters.find(m => m.camp.stageCode === 'FIELD_VILLAGE_T' && !m.dead); if (!m) return 'none'; tp(m.x - 110, m.y); t.setLockTarget(m); return Math.round(m.x) + ',' + Math.round(m.y);")
                print('target', target, flush=True)
                if target == 'none':
                    break
                for i in range(40):
                    await ev("t.leaderAttack(); return 1;")
                    await asyncio.sleep(0.35)
                    if i == 2 and round_ == 0:
                        await shot('06_hit')
                    alive = await ev("const m = t.monsters.filter(m => m.camp.stageCode === 'FIELD_VILLAGE_T' && !m.dead); return m.length;")
                    if alive is not None and int(alive) < 3 - round_:
                        break
                await asyncio.sleep(0.3)
                if round_ == 0:
                    await shot('07_broken')
            await asyncio.sleep(3)
            print('after kills', await ev("return JSON.stringify(root.worldState.quests.filter(q => q.code === 'V02').map(q => q.code + ':' + q.state + ':' + q.progress + '/' + q.target));"), flush=True)
            print('status', await ev("return root.statusText || '';"), flush=True)
            await asyncio.sleep(5)
            print('respawned', await ev("return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === 'FIELD_VILLAGE_T').map(m => [Math.round(m.x), Math.round(m.y), m.dead]));"), flush=True)
            await shot('08_respawned')
            npc = await ev("return JSON.stringify(t.def.npcs.find(n => n.code === 'INSTRUCTOR'));")
            print('instructor', npc, flush=True)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    asyncio.run(main())
