# -*- coding: utf-8 -*-
"""炼魂大招「夜帝残影」(docs/60 P1b)演出自验(网页正式包 + 本地游戏服 + 本地库):
无头 Edge 登录 guidetest05(Lv.22、剧情全交 → 老号自动炼魂)→ 林地怪群旁 → 按 U 放大招,按时间点连拍,
打印按钮 / 虚影 / 特效就绪与命中情况。不改库。
用法:PREVIEW_PORT=7460 PYTHONIOENCODING=utf-8 python tools/qa/realm_ult_web.py [输出目录] [--account guidetest05] [--times 0.15,0.3,...]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--') and not a.startswith('guidetest') and ',' not in a and not a.startswith('{')), os.path.join(base.SCRATCH, 'realm_ult_web'))
ACCOUNT = sys.argv[sys.argv.index('--account') + 1] if '--account' in sys.argv else 'guidetest05'
TIMES = [float(x) for x in (sys.argv[sys.argv.index('--times') + 1] if '--times' in sys.argv else '0.15,0.32,0.5,0.62,0.75,0.9,1.1,1.4').split(',')]
TUNE = sys.argv[sys.argv.index('--tune') + 1] if '--tune' in sys.argv else ''
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_ult'
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
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'pass1234'}}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;")
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            idle = 0
            for _ in range(60):
                got = await ev(CLEAR)
                idle = idle + 1 if got == 'none' else 0
                if idle >= 4:
                    break
                await asyncio.sleep(1.5)
            await ev("await root.loadRealmState(); return 1;")
            print('realm', await ev("return JSON.stringify({ code: root.realmState && root.realmState.realmCode, open: root.realmUltOpen() });"), flush=True)
            T = "const t = root.lobbyTownRenderer; const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
            await ev("if (root.lobbyTownRenderer.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            for _ in range(150):
                if await ev(T + " return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(6)
            print('leader', await ev(T + " return JSON.stringify({ code: t.leader.hero.heroCode, spine: t.leader.hero.spineAsset, protag: t.leader.hero.protagonist, btn: !!root.node.getChildByPath ? 'n/a' : '' });"), flush=True)
            print('btn', await ev("let b = null; root.node.walk(n => { if (n.name === 'LobbyFieldRealmUlt') b = n; }); return b ? JSON.stringify([Math.round(b.worldPosition.x), Math.round(b.worldPosition.y), b.activeInHierarchy]) : 'none';"), flush=True)
            await ev(T + " const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_1') || t.def.camps[0]; tp(c.x - 300, c.y); t.setActorFacing(t.leader, 1); return 1;")
            await asyncio.sleep(3)
            # 等怪群刷出 / 特效与虚影预热
            for _ in range(20):
                ready = await ev(T + " return JSON.stringify({ ghost: (t.prewarmRealmUlt(), !!(t.realmUltShowInst && t.realmUltShowInst.ghost)), fx: ['v2_s681_4006','v2_a49_269','v2_a47_162','v2_a47_268'].map(e => t.fx.isReady(e)), mons: t.monsters.filter(m => !m.dead).length });")
                if '"ghost":true' in ready and 'false' not in ready:
                    break
                await asyncio.sleep(1)
            print('ready', ready, flush=True)
            # 积压的进化抉择(老号几十次)不替它选:收起弹窗、本会话不再弹
            print('hide evo', await ev("root.evolutionCheckDue = false; root.levelContractCheckDue = false; root.evolutionPick = null; root.removeNodeFromContent('LobbyEvolutionPick'); root.contractPick = null; root.removeNodeFromContent('LobbyContractPick'); root.setTownHudVisible(true); return 1;"), flush=True)
            await asyncio.sleep(1.5)
            for _ in range(200):
                if await ev(BUSY) == 'ok' and await ev(T + " return t.leader && t.leader.node.isValid ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(2)
            await ev(T + " const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_1') || t.def.camps[0]; tp(c.x - 300, c.y); t.setActorFacing(t.leader, 1); return 1;")
            await asyncio.sleep(3)
            print('btn2', await ev("let b = null; root.node.walk(n => { if (n.name === 'LobbyFieldRealmUlt') b = n; }); return b ? JSON.stringify([Math.round(b.worldPosition.x), Math.round(b.worldPosition.y), b.activeInHierarchy]) : 'none';"), flush=True)
            await shot('00_before')
            if '--solo' in sys.argv:
                # 展示用:藏队友,队长离怪群远一点(同原型构图)
                await ev(T + " t.followers.forEach(a => a.node.active = false); const c = t.def.camps.find(x => x.stageCode === 'FIELD_WOODS_1') || t.def.camps[0]; tp(c.x - 420, c.y - 20); t.setActorFacing(t.leader, 1); return 1;")
                await asyncio.sleep(2)
            if TUNE:
                # 调手感:覆盖 REALM_ULT 参数(realmUltCfg 读 window.__realmUltTune)
                print('tune', await ev("window.__realmUltTune = " + TUNE + "; return JSON.stringify(window.__realmUltTune);"), flush=True)
            if '--probe-wings' in sys.argv:
                await ev(T + " t.raiderAttack = 0.2; t.ultReadyAt = 0; t.actionUntil = 0; t.dashUntil = 0; t.leaderRealmUlt(); return 1;")
                for _ in range(10):
                    print('  wings', await ev(T + " return JSON.stringify(t.realmUltShowInst.wings.map(i => { const b = i.skeleton.findBone('chest'); return { wp: [Math.round(i.wings.position.x), Math.round(i.wings.position.y), Math.round(i.wings.angle)], b: b ? [Math.round(b.worldX), Math.round(b.worldY), Math.round(b.getWorldRotationX())] : null, anim: i.skeleton.getCurrent(0) && i.skeleton.getCurrent(0).trackTime.toFixed(2), ts: i.skeleton.timeScale, mode: i.skeleton._cacheMode }; }));"), flush=True)
                    await asyncio.sleep(0.12)
                return
            # 每个时间点单独放一次:到点 director.pause 冻结画面再截(无头截图一张要几秒,连拍对不上时刻);伤害压到 1 不打死怪(免得升级弹窗)
            for i, at in enumerate(TIMES):
                await ev(T + " t.raiderAttack = 0.2; t.monsters.forEach(m => { if (!m.dead) { m.hp = m.maxHp; } }); return 1;")
                r = await call('Runtime.evaluate', {'expression': js(T + " t.ultReadyAt = 0; t.actionUntil = 0; t.dashUntil = 0; t.leaderRealmUlt(); const t0 = Date.now(); return new Promise(res => { const f = () => { if (Date.now() - t0 >= " + str(int(at * 1000)) + ") { cc.director.pause(); const g = []; t.entityRoot.walk(n => { if (/^(TownFx|RealmUlt)/.test(n.name)) g.push(n.name); }); res((Date.now() - t0) + 'ms ' + g.join(',')); } else requestAnimationFrame(f); }; requestAnimationFrame(f); });"), 'awaitPromise': True, 'returnByValue': True}, 60)
                print('  at', at, r.get('result', {}).get('result', {}).get('value'), flush=True)
                await shot(f'ult_{i}_{int(at * 1000)}ms')
                await ev("cc.director.resume(); return 1;")
                await asyncio.sleep(3)
            print('after', await ev(T + " const out = []; t.entityRoot.walk(n => { if (/^(Town(Fx|Strike)|RealmUlt)/.test(n.name)) out.push(n.name); }); return JSON.stringify({ nodes: out, cd: Math.round((t.ultReadyAt - Date.now()) / 1000), mons: t.monsters.filter(m => !m.dead).length });"), flush=True)
            await asyncio.sleep(1.5)
            await shot('99_after')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
