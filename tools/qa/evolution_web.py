# -*- coding: utf-8 -*-
"""进化抉择自验(docs/58 §10,网页正式包):无头 Edge 打开本地正式包 → 登录(默认 guidetest02,Lv.6 有 5 次积压)→
等进化抉择页自己弹出 → 截图:默认(中间选中)/ 选左卡 / 刷新后 / 确认后接下一次;打印服务端状态与跑图拿到的进化效果。
配置目录不清(首访要整块下素材,无头下很慢),带 --fresh 才清。
用法:PREVIEW_PORT=7460 python tools/qa/evolution_web.py [输出目录] [--account guidetest02] [--fresh]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'evolution_web')
ACCOUNT = sys.argv[sys.argv.index('--account') + 1] if '--account' in sys.argv else 'guidetest02'
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
PICK = "const p = root.evolutionPick; return p ? JSON.stringify({ lv: p.state.choice && p.state.choice.level, pending: p.state.pendingCount, sel: p.selected, cards: p.state.choice ? p.state.choice.candidates.map(c => c.key + ' ' + c.name + ' / ' + c.desc) : [], refresh: p.state.choice && p.state.choice.refreshPrice, pity: p.state.choice && p.state.choice.pityLeft, err: p.error }) : 'none';"


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_evolution'
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
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'pass1234'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
            for _ in range(400):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted()) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(2)
            picked = 'none'
            for _ in range(90):
                picked = await ev(PICK)
                if picked != 'none':
                    break
                await asyncio.sleep(2)
            print('pick', picked, flush=True)
            if picked == 'none':
                await shot('00_no_pick')
                return
            await asyncio.sleep(2.5)
            await shot('01_default')
            await ev("root.toggleEvolutionHelp(true); return 1;")
            await asyncio.sleep(1.5)
            await shot('01b_help')
            await ev("root.toggleEvolutionHelp(false); return 1;")
            await asyncio.sleep(0.8)
            await ev("const p = root.evolutionPick; root.selectEvolutionCard(p.state.choice.candidates[0].key); return 1;")
            await asyncio.sleep(1.5)
            await shot('02_select_left')
            await ev("await root.refreshEvolution(); return 1;")
            await asyncio.sleep(1.5)
            print('after refresh', await ev(PICK), flush=True)
            await shot('03_refreshed')
            await ev("await root.confirmEvolution(); return 1;")
            await asyncio.sleep(2)
            print('after confirm', await ev(PICK), flush=True)
            print('town evo', await ev("return JSON.stringify({ evo: t.evo, q: Array.from(t.evoQualities) });"), flush=True)
            await shot('04_next')
            if '--drain' in sys.argv:
                # 把积压的抉择逐个确认完(默认选中间那张),再看地图页探索档位
                for _ in range(80):
                    if await ev(PICK) == 'none':
                        break
                    await ev("await root.confirmEvolution(); return 1;")
                    await asyncio.sleep(1.2)
                print('drained, town evo', await ev("return JSON.stringify({ evo: t.evo, q: Array.from(t.evoQualities) });"), flush=True)
            if '--map' in sys.argv:
                await ev("if (t.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
                for _ in range(200):
                    if await ev("return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                        break
                    await asyncio.sleep(2)
                await asyncio.sleep(3)
                await ev("root.openAreaMapPanel(); return 1;")
                await asyncio.sleep(3)
                await shot('05_map_tiers')
                await ev("root.lobbyAreaMapRenderer.exploreOpen = true; root.redrawWorldMapPanel(); return 1;")
                await asyncio.sleep(2)
                await shot('05b_map_tiers_open')
                await ev("root.claimExploreTier('WOODS', 2); return 1;")
                await asyncio.sleep(3)
                print('tiers', await ev("const e = root.worldState.explore.find(x => x.mapCode === 'WOODS'); return JSON.stringify(e.tiers.map(x => [x.tier, x.reached, x.claimed]));"), flush=True)
                await shot('06_map_claimed')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    asyncio.run(main())
