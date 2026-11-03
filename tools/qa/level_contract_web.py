# -*- coding: utf-8 -*-
"""英雄契约里程碑(docs/58 §3.1)界面自验(网页正式包,本地游戏服 8081 + 本地库):
QA 号(默认 guidetest06)先清掉 LEVEL_CONTRACT 发放日志、等级设 31(V04 / V09 已领奖)→ 登录进大厅后应连弹三档:
V04「祭坛的回应」→ V09「林地之王已除」→ Lv.30(本号 SR 几乎全有,候选里会有「已拥有 · 转碎片」卡)。
每档截:弹出 / 选中 / 订立后;跑完恢复等级、删发放日志和测试发的英雄、扣回碎片。
用法:PREVIEW_PORT=7460 PYTHONIOENCODING=utf-8 python tools/qa/level_contract_web.py [输出目录] [--account guidetest06 --uid 68]
"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--') and not a.isdigit() and not a.startswith('guidetest')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'level_contract_web')
ACCOUNT = sys.argv[sys.argv.index('--account') + 1] if '--account' in sys.argv else 'guidetest06'
UID = int(sys.argv[sys.argv.index('--uid') + 1]) if '--uid' in sys.argv else 68
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
PICK = "const p = root.contractPick; return JSON.stringify(p ? { m: root.contractMilestone, sel: p.selected, busy: p.busy, err: p.error, title: p.copy && p.copy.subtitle, heroes: p.candidates.map(c => c.heroCode + (c.owned ? '(已有)' : '')) } : null);"


def sql(q):
    return subprocess.run(['mysql', '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8').stdout.strip()


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_contract'
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
            for step in range(1, 4):
                st = 'null'
                for _ in range(90):
                    # 进化抉择(等级 31 会积压)先随便选掉,好让契约弹出来
                    await ev("if (root.evolutionPick && !root.evolutionPick.busy) { const c = root.evolutionPick.state.choice; if (c) { root.selectEvolutionCard(c.candidates[0].key); await root.confirmEvolution(); } } return 1;")
                    st = await ev(PICK)
                    if st not in ('null', None):
                        break
                    await asyncio.sleep(2)
                print(f'contract {step}', st, flush=True)
                if st in ('null', None):
                    break
                await asyncio.sleep(1.5)
                await shot(f'{step}a_popup')
                pick = json.loads(st)
                heroes = pick['heroes']
                target = next((h for h in heroes if '(已有)' in h), heroes[0]).replace('(已有)', '')
                await ev(f"root.selectStarterContract('{target}'); return 1;")
                await asyncio.sleep(1.2)
                await shot(f'{step}b_selected')
                await ev("await root.confirmStarterContract(); return 1;")
                await asyncio.sleep(1.0)
                await shot(f'{step}c_after')
                await asyncio.sleep(2)
            print('roster', await ev("return JSON.stringify(root.lobbyHeroRosterLoader.currentState().heroes.map(h => h.heroCode));"), flush=True)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    level0 = sql(f'select player_level from game_user where id={UID}')
    max_hero = sql(f'select ifnull(max(id),0) from user_hero where user_id={UID}')
    max_evo = sql(f'select ifnull(max(id),0) from user_evolution_choice where user_id={UID}')
    sql(f"delete from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%'")
    sql(f'update game_user set player_level=31 where id={UID}')
    try:
        asyncio.run(main())
    finally:
        print('granted', sql(f"select request_id, resource_type, resource_code, amount from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%'").replace('\n', ' ; '))
        for line in sql(f"select resource_code, amount from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%' and resource_type='HERO_FRAGMENT'").splitlines():
            code, amount = line.split('\t')
            sql(f"update user_hero_fragment set fragment_count=fragment_count-{int(float(amount))} where user_id={UID} and hero_code='{code}'")
        sql(f"delete from user_hero_fragment where user_id={UID} and fragment_count<=0")
        sql(f"delete from user_hero_attr where user_hero_id in (select id from user_hero where user_id={UID} and id>{max_hero})")
        sql(f"delete from user_hero where user_id={UID} and id>{max_hero}")
        sql(f"delete from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%'")
        sql(f"delete from user_evolution_choice where user_id={UID} and id>{max_evo}")
        sql(f'update game_user set player_level={level0} where id={UID}')
        print('restored level', sql(f'select player_level from game_user where id={UID}'))
