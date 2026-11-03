"""docs/60「选择主角」页自验(原型 周报截图/2026-11-02_主角/proto/protagonist_create_b(_female).png)。
无头 Edge 打开网页包 → 用「没有主角」的账号登录 → 应落到选择主角页:男版截图 → 切女 → 骰子换名 → 非法名提示 →
(--create 时)起一个随机名点「踏上强者之路」→ 应进大厅。
先跑:本地库清掉该账号的主角(player_protagonist + 主角 user_hero / user_hero_attr),备份见会话 scratchpad uid68_*.sql。
用法:PREVIEW_PORT=7460 python tools/qa/protag_create_web.py <输出目录> [--phone] [--user=guidetest06] [--create [--female]]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'protag_create_web'))
USER = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--user=')), 'guidetest06')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
FIND = "const find=(name)=>{let f=null; root.node.walk(x=>{ if(!f && x.name===name && x.activeInHierarchy) f=x; }); return f;};"
CLICK = FIND + "const n=find('%s'); if(!n) return 'nonode'; n.emit('click', n.getComponent('cc.Button')); return 'ok';"
STATE = (FIND + "const input=find('ProtagonistNameInput'); const hint=find('NameHint'); const s=root.protagonistCreateFlow.currentState(); "
         "return JSON.stringify({view: root.currentView, gender: s.selectedGender, name: s.protagonistName, auto: s.nameAuto, creating: s.creating, "
         "input: input ? input.getComponent('cc.EditBox').string : null, hint: hint ? hint.getComponent('cc.Label').string : null});")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_protag'
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
                await asyncio.sleep(1)
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))

            async def wait_for(expr, tries=60, gap=1.0):
                for _ in range(tries):
                    if await ev(expr) == 'ok':
                        return True
                    await asyncio.sleep(gap)
                return False

            async def step(name, wait=2.0):
                await asyncio.sleep(wait)
                print(name, await ev(STATE), flush=True)
                await shot(name)

            if '--phone' in sys.argv:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1200, 'height': 540, 'deviceScaleFactor': 2, 'mobile': False})
            else:
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
            if '--seen' in sys.argv:
                # 复现「注册后已看过序幕(旧版在选择主角页前播)→ 建号后不再播序幕、直接进村」
                await ev("for (let u = 60; u < 80; u++) localStorage.setItem('lootchain.prologue.seen.' + u, '1'); return 1;")
            await ev("root.loginFlow.setInputs({string:'%s'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;" % USER)
            if '--npc-markers' in sys.argv:
                # 晨风村 NPC 头顶标记 + 追踪副行:读当前标记,再注入「拿起武器」进行中看教官是否变金色 ?
                await wait_for("const t = root.lobbyTownRenderer; return root.currentView === 'lobby' && t.isMounted() && t.leader && t.leader.skeleton ? 'ok' : 'wait';", 300)
                await asyncio.sleep(4)
                MK = "const t = root.lobbyTownRenderer; return JSON.stringify(t.npcNodes.map(e => { const l = e.node.getChildByName('Marker').getComponent('cc.Label'); return e.code + ':' + l.string + ':' + (l.color.b < 120 ? 'gold' : 'gray'); }));"
                print('map', await ev("return root.lobbyTownRenderer.mapCode;"), 'markers', await ev(MK), flush=True)
                await shot('40_town')
                await ev("const t = root.lobbyTownRenderer; const w = JSON.parse(JSON.stringify(root.worldState)); w.quests = [{code:'V02',name:'拿起武器',desc:'去训练场,打倒教官放出来的幼鼠。',state:'ACCEPTED',objective:'KILL',objectiveTarget:'stage:FIELD_VILLAGE_T',progress:0,target:1,map:'VILLAGE',acceptNpc:'CHIEF',turnInNpc:'INSTRUCTOR',minLevel:1,rewards:[]}]; root.worldState = w; root.renderLobbyView ? root.renderLobbyView() : t.refreshNpcMarkers(w); t.refreshNpcMarkers(w); return 1;")
                await asyncio.sleep(2)
                print('V02 markers', await ev(MK), flush=True)
                await shot('41_town_v02')
                return
            if '--contract-only' in sys.argv:
                # 只看契约之选弹层:用已有主角的账号进大厅,直接注入 3 张候选卡渲染(不走建号 / 觉醒 / 接口)
                await wait_for("const t = root.lobbyTownRenderer; return root.currentView === 'lobby' && t.isMounted() && t.leader && t.leader.skeleton ? 'ok' : 'wait';", 300)
                await asyncio.sleep(4)
                await ev("root.contractPick = { candidates: [{heroCode:'R_GUARD_07',heroName:'城门卫兵',rarity:'R'},{heroCode:'R_RANGER_06',heroName:'荒原游侠',rarity:'R'},{heroCode:'R_CULT_05',heroName:'低语教徒',rarity:'R'}], selected: '', busy: false, error: '' }; root.renderStarterContract(); return 1;")
                await asyncio.sleep(3)
                await shot('30_contract_dim')
                await ev("root.selectStarterContract('R_RANGER_06'); return 1;")
                await asyncio.sleep(2)
                await shot('31_contract_dim_sel')
                return
            if not await wait_for("return root.currentView === 'protagonistCreate' ? 'ok' : 'wait';", 120):
                print('NOT on protagonistCreate:', await ev(STATE))
                await shot('00_wrong_view')
                return
            # docs/60 序幕视频:DOM 覆盖层(#lootchain-prologue);11-03 起选完主角(建号成功)后播:片头旁白 → 视频 → 片尾旁白
            PV = "(() => { const r = document.getElementById('lootchain-prologue'); if (!r) return 'none'; const v = r.querySelector('video'); return JSON.stringify({ t: v && +v.currentTime.toFixed(1), paused: v && v.paused, muted: v && v.muted, vop: v && v.style.opacity, text: r.innerText.replace(/ +/g, ' ').slice(0, 90) }); })()"
            async def pv():
                r = await call('Runtime.evaluate', {'expression': PV, 'returnByValue': True})
                return r.get('result', {}).get('result', {}).get('value')

            async def capture_prologue():
                for _ in range(100):
                    if await pv() != 'none':
                        break
                    await asyncio.sleep(0.2)
                for name, wait in [('08_prologue_open1', 1.5), ('08_prologue_open2', 3.5)]:
                    await asyncio.sleep(wait)
                    print(name, await pv(), flush=True)
                    await shot(name)
                for name, at in [('09_prologue_v1', 1.5), ('09_prologue_v2', 5.5), ('09_prologue_v3', 9.5), ('09_prologue_v4', 12.5)]:
                    for _ in range(300):
                        v = await pv()
                        if v == 'none':
                            break
                        try:
                            if json.loads(v)['t'] >= at:
                                break
                        except Exception:
                            pass
                        await asyncio.sleep(0.1)
                    print(name, await pv(), flush=True)
                    await shot(name)
                for _ in range(100):
                    v = await pv()
                    if v == 'none' or json.loads(v)['vop'] == '0':
                        break
                    await asyncio.sleep(0.2)
                for name, wait in [('09_prologue_close1', 2.5), ('09_prologue_close2', 3.0)]:
                    await asyncio.sleep(wait)
                    print(name, await pv(), flush=True)
                    await shot(name)
                for _ in range(30):
                    if await pv() == 'none':
                        break
                    await asyncio.sleep(1)
                print('prologue end', await pv(), flush=True)

            print('prologue on create page (should be none)', await pv(), flush=True)
            await step('01_male', 4)
            await ev(CLICK % 'GenderCard_female')
            await step('02_female')
            await ev(CLICK % 'NameDice')
            await step('03_dice')
            # 非法名:输入框本身写 12345(提交读输入框),应停在本页并在提示行报错
            await ev(FIND + "const b=find('ProtagonistNameInput').getComponent('cc.EditBox'); b.string='12345'; root.protagonistCreateFlow.setNameDraft('12345'); root.protagonistCreateFlow.submitCreate(); return 1;")
            await step('04_bad_name')
            await ev(CLICK % 'GenderCard_male')
            await step('05_back_male')
            if '--create' in sys.argv:
                # 重名(guidetest02 的主角名):后端应拒绝,提示行显示「该名字已被使用」
                await ev(FIND + "const b=find('ProtagonistNameInput').getComponent('cc.EditBox'); b.string='圣契64'; root.protagonistCreateFlow.setNameDraft('圣契64'); root.protagonistCreateFlow.submitCreate(); return 1;")
                await wait_for("return root.protagonistCreateFlow.currentState().creating ? 'wait' : 'ok';", 30, 0.5)
                await step('06_duplicate_name')
                if '--female' in sys.argv:
                    await ev(CLICK % 'GenderCard_female')
                    await asyncio.sleep(1)
                await ev(CLICK % 'NameDice')
                await asyncio.sleep(1)
                await ev(CLICK % 'Submit')
                await capture_prologue()
                ok = await wait_for("return root.currentView === 'lobby' ? 'ok' : 'wait';", 120)
                if not ok:
                    await step('07_create_failed', 2)
                    return
                # docs/60 觉醒演出:等开演,按时间线连拍,再点三下对话
                AW = "const a = root.awakenCinematic; return JSON.stringify({ phase: a.phase, line: a.lineIndex, hud: !!(root.ensureContentRoot().getChildByName('LobbyTownHud') || {}).active });"
                started = await wait_for("return root.awakenCinematic.active ? 'ok' : 'wait';", 90, 0.5)
                print('awaken started', started, await ev(AW), flush=True)
                for name, wait in [('10_eyes', 1.2), ('11_reveal', 1.6), ('12_getup', 1.4), ('13_bind', 2.2), ('14_bindline', 1.4), ('15_talk1', 1.6)]:
                    await asyncio.sleep(wait)
                    print(name, await ev(AW), flush=True)
                    await shot(name)
                for i in range(3):
                    await ev("let n=null; root.node.walk(x=>{ if(!n && x.name==='LobbyAwakenCinematic') n=x; }); if(!n) return 'none'; n.emit(cc.Node.EventType.TOUCH_END, {propagationStopped:false}); return 1;")
                    await asyncio.sleep(1.2)
                    print(f'tap{i+1}', await ev(AW), flush=True)
                    await shot(f'16_tap{i+1}')
                await step('17_after_awaken', 2)
                # docs/58 契约之选:演完应弹出 3 选 1;点中间一张 → 订立契约 → 新伙伴进队
                CS = "const c = root.contractPick; return JSON.stringify(c ? { codes: c.candidates.map(x => x.heroCode + ':' + x.heroName), sel: c.selected, busy: c.busy, err: c.error } : null);"
                if await wait_for("return root.contractPick ? 'ok' : 'wait';", 30, 0.5):
                    await asyncio.sleep(2)
                    print('contract', await ev(CS), flush=True)
                    await shot('18_contract')
                    await ev("const c = root.contractPick; root.selectStarterContract(c.candidates[1].heroCode); return 1;")
                    await asyncio.sleep(1.5)
                    print('contract sel', await ev(CS), flush=True)
                    await shot('19_contract_selected')
                    await ev("root.confirmStarterContract(); return 1;")
                    await wait_for("return root.contractPick ? 'wait' : 'ok';", 30, 0.5)
                    await asyncio.sleep(6)
                    print('party', await ev("const t = root.lobbyTownRenderer; return JSON.stringify([t.leader, ...t.followers].map(a => a.hero.heroCode));"), flush=True)
                    await shot('20_after_contract')
                else:
                    print('contract NOT shown', flush=True)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
