# -*- coding: utf-8 -*-
"""矿境掠夺 PVE 闭环自验(docs/48,电脑端):无头 Edge 打开本地正式包 → 登录 → 主城 → 矿境面板截图 → 掠夺 RAID_n(走编队确认 → battles/start)
→ 机器人打(清守卫 → 砸水晶)→ 结算 → 打印结算回执(奖励 / 体力 / 复演裁定)+ 终局截图。
用法:PREVIEW_PORT=7460 [PHONE=1] [STALL=1] python tools/qa/raid_server_cdp.py <输出目录> [RAID_1]"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'raid_server')
STAGE = sys.argv[2] if len(sys.argv) > 2 else 'RAID_1'
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const gr=root&&root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
STATE = "if(!sim) return 'nosim'; const u=sim.monsters.find(m=>m.player); return JSON.stringify({phase:sim.phase, t:Math.round(sim.timeMs), x:u&&+u.x.toFixed(2), hp:u&&Math.round(u.hp), max:u&&u.maxHp, heroes:sim.heroes.map(h=>Math.round(h.hp||0)+'/'+h.maxHp+(h.dead?'X':'')), crystal:sim.crystalHp+'/'+sim.crystalMaxHp, inputs:sim.inputs.length, serverRaid: gr.serverRaid});"
BOT = ("window.__raidBot = setInterval(()=>{ try { const u=sim.monsters.find(m=>m.player); if(!u||sim.phase!=='wave'){ clearInterval(window.__raidBot); return; } const alive=sim.heroes.filter(h=>!h.dead); "
       "const cellX=(h)=>h.fx!==undefined?h.fx:1.45+(h.cell%6)*1.18; const target=alive.length? alive.reduce((a,b)=>Math.abs(cellX(b)-u.x)<Math.abs(cellX(a)-u.x)?b:a) : null; const tx = target ? cellX(target) : 0.9; const stop = target ? 1.1 : 0.2; "
       "const laneT = target ? (target.flane!==undefined ? target.flane : (Math.floor(target.cell/6)===0 ? 0.25 : 0.75)) : 0.5; const laneD = laneT - (u.laneF||0.5); "
       "raid.keys.delete(65); raid.keys.delete(68); raid.keys.delete(87); raid.keys.delete(83); "
       "if (Math.abs(tx-u.x) > stop || Math.abs(laneD) > 0.3) { if (Math.abs(tx-u.x) > stop) raid.keys.add(tx<u.x?65:68); if (Math.abs(laneD) > 0.3) raid.keys.add(laneD<0?87:83); setTimeout(()=>{ raid.keys.delete(65); raid.keys.delete(68); raid.keys.delete(87); raid.keys.delete(83); }, 120); } "
       "else { raid.attackPressedAt = Date.now(); if (Math.random()<0.15) raid.skillPressedAt[Math.floor(Math.random()*3)] = Date.now(); } } catch(e){} }, 300); return 'bot';")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_raidsrv'
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
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, flush=True)

            if os.environ.get('PHONE') == '1':
                # 手机横屏(20:9 Pixel 7 逻辑像素 915×412,DPR 2)+ 安卓 UA + 触摸:走手机设计高 720 的布局
                await call('Network.setUserAgentOverride', {'userAgent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', 'platform': 'Android'})
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            else:
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
                for _ in range(60):
                    if await ev("return root.currentView;") == 'lobby':
                        break
                    await asyncio.sleep(2)
            for _ in range(45):
                if '"sprites":9' in await ev("const t=root.lobbyTownRenderer; return JSON.stringify({sprites:t.buildings.filter(b=>b.sprite).length});"):
                    break
                await asyncio.sleep(2)
            # 矿境面板
            await ev("root.openLobbyRaidPanel(); return 'raid-panel';")
            for _ in range(30):
                st = await ev("const s=root.currentLobbyRaidState(); return JSON.stringify({loading:s.loading, has:!!s.stages, err:s.error, sel:s.selectedStageCode});")
                if '"has":true' in st or '"err":"' in st and '"err":""' not in st:
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(3)
            print('panel', await ev("const s=root.currentLobbyRaidState(); return JSON.stringify({err:s.error, sel:s.selectedStageCode, clearedMax:s.stages&&s.stages.clearedMax, n:s.stages&&s.stages.stages.length});"), flush=True)
            await shot('raid_panel')
            # 选矿 + 掠夺 → 编队确认 → 开战
            if STAGE.upper().startswith('RAIDPVP_'):
                await ev(f"root.startLobbyRaidPvp({int(STAGE.split('_')[1])}, null); return 'preview-pvp';")
            else:
                await ev(f"root.selectLobbyRaidStage('{STAGE}'); root.startLobbyRaidBattle('{STAGE}'); return 'preview';")
            await asyncio.sleep(3)
            print('preview view', await ev("return root.currentView + ' stage=' + root.selectedLobbyStageCode;"), flush=True)
            await shot('raid_preview')
            await ev("window.__errs=[]; const ce=console.error.bind(console); console.error=(...a)=>{ window.__errs.push(a.map(x=>x&&x.stack?x.stack:String(x)).join(' ').slice(0,400)); ce(...a); }; window.addEventListener('unhandledrejection', e=>window.__errs.push('rej '+String(e.reason&&e.reason.stack||e.reason).slice(0,400))); window.addEventListener('error', e=>window.__errs.push('err '+String(e.message).slice(0,300))); return 'hook';")
            await ev("root.confirmLobbyBattleStart ? root.confirmLobbyBattleStart() : root.lobbyBattleFlow.start(root.selectedLobbyStageCode); return 'start';")
            if os.environ.get('STALL') == '1':
                # 复现「正在进入矿境…」卡死:开战请求在途时重置流程(回执作废),期望等待页 4 秒后自动重发开战
                await ev("root.lobbyBattleFlow.prepare(root.selectedLobbyStageCode); return 'stall';")
                print('stall injected', flush=True)
            for _ in range(90):
                st = await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({starting:b.starting, has:!!b.start, err:b.error, mounted: !!(gr && gr.isMounted() && raid)});")
                if '"mounted":true' in st or ('"err":"' in st and '"err":""' not in st):
                    print('start', st, flush=True)
                    break
                await asyncio.sleep(1)
            else:
                print('start-timeout', await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({starting:b.starting, has:!!b.start, err:b.error, assets:b.assetsLoading, view:root.currentView, errs:(window.__errs||[]).slice(-6)});"), flush=True)
            if os.environ.get('PROBE_ANIM') == '1':
                # 连点攻击 3 秒(每 150ms 按一下),每 100ms 采样主角骨骼当前动作 / 片段时刻 / 倍速 + 模型连招段数(验证不再只播起手)
                async def eva(body):
                    r = await call('Runtime.evaluate', {'expression': "(async()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()", 'awaitPromise': True, 'returnByValue': True}, 120)
                    res = r.get('result', {}).get('result', {})
                    return res.get('value') if 'value' in res else json.dumps(r)[:400]
                # 跑速实测:往右跑 1 秒,量主角节点屏幕位移 / 单位尺寸(与野外「每秒几个身高」对比)
                spd = await eva("const ctrl=raid; const n=ctrl.raider.view.node; const x0=n.position.x; raid.keys.add(68); await new Promise(r=>setTimeout(r,1000)); raid.keys.delete(68); const x1=n.position.x; const y0=n.position.y; raid.keys.add(83); await new Promise(r=>setTimeout(r,400)); raid.keys.delete(83); const dyPer400=Math.round(n.position.y-y0); const sk=ctrl.raider.view.skeleton; return JSON.stringify({dxPerSec:Math.round(x1-x0), dyPer400, laneSpanPx:Math.round(gr.raidLaneY(1)-gr.raidLaneY(0)), unitSize:Math.round(gr.unitSize()), runScale: sk?sk.timeScale:null, anim: sk&&sk.getCurrent(0)?sk.getCurrent(0).animation.name:null});")
                print('speed', spd, flush=True)
                # 先让机器人走到守卫身边(实战:有命中 / 受击 / 顿帧),贴身后停机器人再连点采样
                await ev(BOT)
                for _ in range(40):
                    near = await ev("const u=sim.monsters.find(m=>m.player); if(!u) return 'n'; const cellX=(c)=>1.45+(c%6)*1.18; return sim.heroes.some(h=>!h.dead && Math.abs((h.fx!=null?h.fx:cellX(h.cell))-u.x)<1.3) ? 'y' : 'n';")
                    if near == 'y':
                        break
                    await asyncio.sleep(0.5)
                await ev("clearInterval(window.__raidBot); raid.keys.clear && raid.keys.clear(); return 'stop-bot';")
                print('near', near, flush=True)
                samples = await eva("const ctrl=raid; const v=ctrl&&ctrl.raider&&ctrl.raider.view; const out=[]; const t0=Date.now(); const press=setInterval(()=>{ ctrl.attackPressedAt=Date.now(); },150); "
                                   "for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,100)); const e=v&&v.skeleton&&v.skeleton.getCurrent(0); out.push((Date.now()-t0)+':'+(e?e.animation.name+'@'+e.trackTime.toFixed(2):'-')+'x'+(v&&v.skeleton?v.skeleton.timeScale.toFixed(2):'-')+' c'+(sim.raider?sim.raider.comboStep:'-')); } clearInterval(press); return out.join(' | ');")
                print('anim', samples, flush=True)
                skills = await eva("const ctrl=raid; const v=ctrl.raider.view; const out=[]; for (const i of [0,1,2]) { ctrl.skillPressedAt[i]=Date.now(); await new Promise(r=>setTimeout(r,250)); const e=v.skeleton.getCurrent(0); out.push('skill'+i+':'+(e?e.animation.name+'@'+e.trackTime.toFixed(2):'-')+'x'+v.skeleton.timeScale.toFixed(2)); await new Promise(r=>setTimeout(r,1300)); } return out.join(' | ');")
                print('skills', skills, flush=True)
                if os.environ.get('PROBE_FX') == '1':
                    # 技能特效截图:贴身后按技能,在模型第一下命中后约 150ms 截图(特效正亮)
                    await ev(BOT)
                    await asyncio.sleep(3)
                    await ev("clearInterval(window.__raidBot); return 'stop';")
                    print('kit', await ev("const k=raid.raiderFxKit; const f=raid.combatFx; return JSON.stringify({skill:k&&k.skill, ult:k&&k.ult&&k.ult.effect, ready: f?[...f.ready.keys()]:null, pending: f?[...f.pending]:null, names: raid.raider&&raid.raider.names});"), flush=True)
                    for i, hit_ms in ((0, 504), (1, 200), (2, 400)):
                        await asyncio.sleep(1.2)
                        for _ in range(30):
                            if await ev(f"return sim.raider && sim.timeMs >= sim.raider.skillReadyMs[{i}] && sim.timeMs >= sim.raider.actionUntilMs ? 'y' : 'n';") == 'y':
                                break
                            await asyncio.sleep(0.5)
                        await ev(f"raid.skillPressedAt[{i}]=Date.now(); window.__fxPeak=0; window.__fxSampler=setInterval(()=>{{ let n=0; cc.director.getScene().walk(x=>{{ if((x.name==='RaidFxKz'||x.name==='TownFx') && x.activeInHierarchy) n++; }}); window.__fxPeak=Math.max(window.__fxPeak,n); }},40); return 'k';")
                        await asyncio.sleep((hit_ms + 120) / 1000)
                        await shot(f'skill_fx_{i}')
                        await asyncio.sleep(1.2)
                        print('fxnodes', i, await ev("clearInterval(window.__fxSampler); return window.__fxPeak;"), flush=True)
            await asyncio.sleep(2)
            print('battle', await ev(STATE), flush=True)
            print('pool', await ev("if(!sim) return 'nosim'; return JSON.stringify({pool: sim.pool.map(p=>p.heroCode+':'+p.displayName+':'+p.sourceIndex), allies: (gr.snapshot? gr.snapshot.allies.map(a=>a.unitKey+':'+a.displayName) : null), raidRaw: !!(root.currentLobbyBattleState().start||{}).raid, npcAssets: (gr.snapshot? gr.snapshot.allies.filter(a=>a.unitKey.startsWith('npc')).map(a=>a.spineAsset+'|'+a.portraitAsset) : null), views: [...gr.heroViews.values()].map(v=>v.node.name+':'+v.spineReady), lineupRaw: (root.currentLobbyBattleState().start||{}).lineup.map(h=>!!h.guardRaw)});"), flush=True)
            await shot('raid_battle_start')
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await ev(BOT)
            for i in range(60):
                await asyncio.sleep(3)
                st = await ev(STATE)
                if i % 5 == 0:
                    print('t', st, flush=True)
                if i in (2, 4, 8):
                    await shot(f'raid_battle_mid_{i}')
                if '"phase":"victory"' in st or '"phase":"defeat"' in st:
                    print('end', st, flush=True)
                    break
            await ev("clearInterval(window.__raidBot); return 'stop';")
            # 等结算回执
            for _ in range(30):
                st = await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({settling:b.settling, err:b.error, s: b.settlement && {result:b.settlement.result, mode:b.settlement.settlementMode, granted:b.settlement.rewardGranted, first:b.settlement.firstClear, stamina:[b.settlement.staminaBefore,b.settlement.staminaAfter], rewards:(b.settlement.rewardItems||[]).map(r=>r.resourceName+'x'+r.amount), msg:b.settlement.message}});")
                if '"s":{' in st or ('"err":"' in st and '"err":""' not in st):
                    print('settlement', st, flush=True)
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(2)
            await shot('raid_settlement')
            print('result', await ev("const o=gr.root&&gr.root.getChildByName('GuardEndOverlay'); const r=o&&o.getChildByName('GuardRaidResult'); return JSON.stringify({overlay:!!o, result:!!r, children: r? r.children.map(c=>c.name):[]});"), flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
