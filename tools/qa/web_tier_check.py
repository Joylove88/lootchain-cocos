# -*- coding: utf-8 -*-
"""网页分层下载自验(2026-10-30,领导反馈首访 500 多 M):全新无头 Edge 配置打开本地正式包,
1. 首访:统计进登录页前实际下载量(Network 字节)+ 开局包清单大小;
2. 记录:后台下载一开始就冻结,在晨风村跑一遍(走动 / 打训练鼠 / 打开村里 HUD 能直接开的弹窗),
   列出引擎加载了、但既不在开局包也不是加载门补下的文件 = 会「先缺图」的漏网文件(候选写进 scripts/web-pack-core-extra.json);
3. 加载门:后台仍冻结时进林地 / 锻造 / 召唤 / 英雄名册,截加载中与加载完的图;
4. 解冻后台,看 60 秒内是否在下。
用法:[NEW_USER=1] PREVIEW_PORT=7460 python tools/qa/web_tier_check.py <输出目录>(先在 build/web-mobile 起 python -m http.server 7460;游戏服 8081)
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

NEW_USER = os.environ.get('NEW_USER') == '1'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'web_tier_check')
os.makedirs(OUT, exist_ok=True)
BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'build', 'web-mobile')
MANIFEST = json.load(open(os.path.join(BUILD, 'asset-manifest.json'), encoding='utf-8'))
CORE = MANIFEST.get('core', len(MANIFEST['files']))
CORE_SET = set(p for p, _ in MANIFEST['files'][:CORE])
RES_OF = {p: (MANIFEST.get('res') or [''] * len(MANIFEST['files']))[i] for i, (p, _) in enumerate(MANIFEST['files'])}

ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer; const P = window.__lootchainPack;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
TP = "const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
# 后台下载一出现就冻结(紧急下载不受影响),setPaused 改成空函数防 GameRoot 每秒解冻
FREEZE = r"""(() => { try { performance.setResourceTimingBufferSize(200000); } catch (e) {} const iv = setInterval(() => { const p = window.__lootchainPack; if (p) { p.paused = true; p.__setPaused = p.setPaused; p.setPaused = () => {}; clearInterval(iv); } }, 50); })();"""
CLOSE = "if (root.lobbyGuardCrystalDialog) root.closeGuardCrystalDialog(); root.lobbyShopDialog = null; root.worldMapPanel = null; root.lobbyMailPanelOpen = false; root.returnToLobbyFromScenePage();"
VILLAGE_PANELS = [
    ('shop_gold', "root.openLobbyShopDialog('gold')"),
    ('shop_stamina', "root.openLobbyShopDialog('stamina')"),
    ('shop_diamond', "root.openLobbyShopDialog('diamond')"),
    ('quest', 'root.openLobbyQuestPanel()'),
    ('profile', 'root.openPlayerProfileDialog()'),
    ('mail', 'root.openLobbyMailPanel()'),
    ('settings', 'root.openLobbySettingsPanel()'),
    ('notice', 'root.openLobbyNoticePanel()'),
    ('terminal', 'root.openLobbyTerminalPanel()'),
    ('areamap', 'root.openAreaMapPanel()'),
]
GATES = [
    ('forge', 'root.openLobbyForgePanel()'),
    ('heroes', 'root.openLobbyHeroRosterPanel()'),
    ('bag', 'root.openLobbyBagPanel()'),
    ('gacha', "root.openLobbyGachaScene ? root.openLobbyGachaScene() : root.openLobbyGachaSceneFromCodex()"),
    ('formation', 'root.openLobbyFormationPanel()'),
    ('crystal', 'root.openGuardCrystalDialog()'),
    ('raid', 'root.openLobbyRaidPanel()'),
    ('codex', 'root.openLobbyCodexPanel()'),
    ('daily', 'root.openLobbyDailyDungeonPanel()'),
]


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + TP + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_tier'
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    report = {}
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
            net = {'bytes': 0}
            pending = {}

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('method') == 'Network.loadingFinished':
                        net['bytes'] += x['params'].get('encodedDataLength', 0)
                    if x.get('id') == my:
                        return x

            async def ev(body, timeout=120):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 70}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))

            async def wait(sec):
                # 期间也要读 CDP 事件(Network 字节)
                end = time.time() + sec
                while time.time() < end:
                    await ev('return 1;')
                    await asyncio.sleep(0.4)

            async def leaks(label):
                """引擎加载过(非下载器 fetch)、不在开局包、也不在下载器已到本地集合里的文件。"""
                raw = await ev("const have = P ? P.have : new Set(); const out = []; performance.getEntriesByType('resource').forEach(e => { "
                               "if (e.initiatorType === 'fetch' || e.name.indexOf('/assets/') < 0) return; const rel = e.name.replace(location.origin + '/', '').split('?')[0]; "
                               "if (!have.has(rel)) out.push(rel); }); return JSON.stringify(Array.from(new Set(out)));")
                try:
                    rels = json.loads(raw)
                except Exception:
                    print(label, 'leaks?', raw, flush=True)
                    return []
                bad = [r for r in rels if r not in CORE_SET and r in RES_OF]
                print(f'[{label}] 漏网文件 {len(bad)}', flush=True)
                for r in bad[:40]:
                    print('   ', RES_OF.get(r) or '?', r, flush=True)
                return bad

            await call('Network.enable')
            await call('Page.enable')
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': FREEZE})
            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            core_bytes = sum(s for _, s in MANIFEST['files'][:CORE])
            all_bytes = sum(s for _, s in MANIFEST['files'])
            print(f'清单:开局包 {CORE} 个 {core_bytes / 1e6:.1f}MB / 全部 {len(MANIFEST["files"])} 个 {all_bytes / 1e6:.1f}MB', flush=True)
            t0 = time.time()
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                # currentView 初始值就是 login:要等启动下载页结束(下载器登记 = 开局包下完)才算真正到登录页
                if view in ('login', 'lobby', 'loginAccount') and await ev("return (window.__lootchainPack && !root.bootPreloadActive) ? 'y' : 'n';") == 'y':
                    break
                await asyncio.sleep(1)
            boot_mb = net['bytes'] / 1e6
            print(f'1 首访进到 {view}:下载 {boot_mb:.1f}MB,用时 {time.time() - t0:.0f}s', flush=True)
            report['boot_mb'] = round(boot_mb, 1)
            await shot('01_login')
            if view != 'lobby' and NEW_USER:
                # 新玩家:本地服注册一个一次性测试号 → 建主角 → 晨风村(初始 4 英雄)
                acct = 'tier' + str(int(time.time()))[-8:]
                await ev("root.loginFlow.setInputs({string:'" + acct + "'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.register()); return 1;")
                for _ in range(60):
                    v = await ev("return root.currentView;")
                    if v in ('protagonistCreate', 'lobby'):
                        break
                    await asyncio.sleep(1)
                if v == 'protagonistCreate':
                    await shot('01b_protagonist')
                    await ev("root.protagonistCreateFlow.nameInput = { string: '分层" + acct[-4:] + "' }; root.submitProtagonistCreate(); return 1;")
                print('  新号', acct, v, flush=True)
            elif view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
            for _ in range(120):
                st = await ev("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : (root.currentView + (root.node.getChildByPath ? '' : ''));")
                if st == 'ready':
                    break
                await asyncio.sleep(1)
            print('  进大厅', await ev("return t.def.code + ' 已下 ' + Math.round(P.progress().doneBytes / 1e6) + '/' + Math.round(P.progress().totalBytes / 1e6) + 'MB paused=' + P.paused;"), flush=True)
            if await ev("return t.def.code;") != 'VILLAGE':
                await ev("setTimeout(() => root.travelWorldMap('VILLAGE', null), 50); return 1;")
                await asyncio.sleep(1.5)
                print('  回村', await ev("return t.def.code + ' status=' + (root.statusText || '') + ' maps=' + JSON.stringify((root.worldState.maps || []).map(m => m.mapCode + ':' + m.unlocked));"), flush=True)
                for _ in range(60):
                    if await ev("return t.def.code === 'VILLAGE' && t.leader && !root.findNodeInContent?.('PackLoading') ? 'ok' : 'wait';") == 'ok':
                        break
                    await asyncio.sleep(1)
            await wait(6)
            await shot('02_village')

            # 2) 晨风村跑一遍
            for x, y in [(0, 0), (1100, 100), (-1500, 400), (2200, -600), (-2600, -900), (0, 0)]:
                await ev(f"tp({x}, {y}); return 1;")
                await wait(2.5)
            await ev("const c = t.def.camps[0]; tp(c.x - 200, c.y); return 1;")
            await wait(2)
            for _ in range(8):
                await ev("t.leaderAttack(); return 1;")
                await wait(0.7)
            await wait(3)
            await shot('03_training')
            report['leak_walk'] = await leaks('跑图 + 训练鼠')
            for name, code in VILLAGE_PANELS:
                await ev(f"setTimeout(() => {{ try {{ {code}; }} catch (e) {{ console.log('open fail {name}', e); }} }}, 30); return 1;")
                await wait(4)
                await shot(f'04_{name}')
                await ev(f"setTimeout(() => {{ try {{ {CLOSE} }} catch (e) {{}} }}, 30); return 1;")
                await wait(1.5)
            report['leak_panels'] = await leaks('村里弹窗')

            # 3) 加载门(后台仍冻结)
            for name, code in GATES:
                await ev(f"setTimeout(() => {{ try {{ {code}; }} catch (e) {{ console.log('open fail {name}', e); }} }}, 30); return 1;")
                await wait(0.8)
                await shot(f'05_{name}_a')
                for _ in range(90):
                    st = await ev("const g = root.uiSpriteFrameCache && root.uiSpriteFrameCache.groupDownloads; let pl = false; root.node.walk(x => { if (x.name === 'PackLoading') pl = true; }); return ((g && g.size) || pl) ? 'dl' : 'ok';")
                    if st == 'ok':
                        break
                    await asyncio.sleep(1)
                await wait(4)
                await shot(f'05_{name}_b')
                await leaks(f'门 {name}')
                await ev(f"setTimeout(() => {{ try {{ {CLOSE} }} catch (e) {{}} }}, 30); return 1;")
                await wait(1.5)
            await ev("setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
            await wait(1)
            await shot('06_woods_a')
            print('  林地门', await ev("let n = null; root.node.walk(x => { if (!n && x.name === 'PackLoading') n = x; }); return n ? 'loading page shown' : 'NO loading page';"), flush=True)
            for _ in range(120):
                if await ev("return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await wait(5)
            await shot('06_woods_b')
            report['leak_woods'] = await leaks('林地')

            # 4) 解冻后台
            before = await ev("return P.progress().doneBytes;")
            await ev("P.setPaused = P.__setPaused; P.setPaused(false); return 1;")
            await wait(60)
            after = await ev("return P.progress().doneBytes;")
            print(f'4 后台 60 秒下了 {(after - before) / 1e6:.1f}MB', await ev("return 'total ' + Math.round(P.progress().totalBytes / 1e6) + 'MB done ' + Math.round(P.progress().doneBytes / 1e6) + 'MB';"), flush=True)
            json.dump(report, open(os.path.join(OUT, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
