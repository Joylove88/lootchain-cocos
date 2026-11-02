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
            await ev("root.loginFlow.setInputs({string:'%s'}, {string:'pass1234'}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;" % USER)
            if not await wait_for("return root.currentView === 'protagonistCreate' ? 'ok' : 'wait';", 120):
                print('NOT on protagonistCreate:', await ev(STATE))
                await shot('00_wrong_view')
                return
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
                ok = await wait_for("return root.currentView === 'lobby' ? 'ok' : 'wait';", 120)
                await step('07_after_create' if ok else '07_create_failed', 6)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


asyncio.run(main())
