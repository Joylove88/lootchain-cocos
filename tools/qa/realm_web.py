# -*- coding: utf-8 -*-
"""主角境界突破(docs/60 §12)界面自验(网页正式包 + 本地游戏服 8081 + 本地库):
QA 号(默认 guidetest03 / uid 65)临时设成 Lv.10、V02~V09 已交付、V10 已接 → 进大厅(积压的进化 / 英雄契约自动选掉)→
01 突破窗口 → 02 试炼开场 → 03 打到一半(心魔血条)→ 03b 倒下失败面板 → 再来一次 → 04 斩杀后突破成功页 → 05 继续(交 V10 去主城)。
跑完把境界行 / 剧情 / 传送阵 / 坐标 / 进化 / 契约发放 / 新英雄 / 等级恢复。
用法:PREVIEW_PORT=7460 PYTHONIOENCODING=utf-8 python tools/qa/realm_web.py [输出目录] [--account guidetest03 --uid 65]
"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--') and not a.isdigit() and not a.startswith('guidetest')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'realm_web')
ACCOUNT = sys.argv[sys.argv.index('--account') + 1] if '--account' in sys.argv else 'guidetest03'
UID = int(sys.argv[sys.argv.index('--uid') + 1]) if '--uid' in sys.argv else 65
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
# 积压的进化抉择 / 英雄契约:选第一个
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")
STATE = "return JSON.stringify({ realm: root.realmState && root.realmState.title, code: root.realmState && root.realmState.realmCode, canBreak: root.realmState && root.realmState.canBreak, brk: !!root.realmBreak, trial: root.realmTrial, done: root.realmDone, info: t.realmTrialInfo() });"


def sql(q):
    return subprocess.run(['mysql', '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8').stdout.strip()


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_realm'
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
            idle = 0
            for _ in range(80):
                got = await ev(CLEAR)
                idle = idle + 1 if got == 'none' else 0
                if idle >= 4:
                    break
                await asyncio.sleep(1.5)
            # 清掉积压后队伍会重排,「正在加载队伍」下载页可能这时才出来:连续 3 次没有再继续
            calm = 0
            for _ in range(300):
                calm = calm + 1 if await ev(BUSY) == 'ok' else 0
                if calm >= 3:
                    break
                await asyncio.sleep(2)
            # 过场加载页(11-04 B 风格):手动挂一次截图
            await ev("root.showPackLoading('正在加载队伍', 41, 100); return 1;")
            await asyncio.sleep(2)
            await shot('00_pack_loading')
            await ev("root.hidePackLoading(); return 1;")
            await ev("await root.loadRealmState(); return 1;")
            print('realm', await ev(STATE), flush=True)
            await ev("root.openRealmBreak(); return 1;")
            await asyncio.sleep(2.5)
            await shot('01_break')
            await ev("root.startRealmTrial(); return 1;")
            await asyncio.sleep(3)
            print('trial', await ev(STATE), flush=True)
            await shot('02_trial_start')
            if '--probe' in sys.argv:
                print('probe', await ev("const g = t.groundRoot; const out = g.children.map(c => c.name + ':' + (c.active ? 1 : 0)).slice(-8); const a = g.getChildByName('RealmTrialArena'); const sp = a && a.getChildByName('Art'); const comp = sp && sp.getComponent(cc.Sprite); return JSON.stringify({ n: g.children.length, tail: out, arena: a && [a.position.x, a.position.y, a.active, a.activeInHierarchy], sf: comp ? !!comp.spriteFrame : 'nosprite', leader: [t.leader.x, t.leader.y], groundParent: g.parent && g.parent.name, gIdx: g.getSiblingIndex(), eIdx: t.entityRoot.getSiblingIndex(), gActive: g.activeInHierarchy });"), flush=True)
                return
            # 打掉 60% 血 + 等台词收起
            await ev("const m = t.trial.monster; m.hp = Math.round(m.maxHp * 0.4); m.lastHitAt = Date.now(); t.drawMonsterHp(m); return m.maxHp;")
            await asyncio.sleep(7)
            await shot('03_trial_mid')
            await asyncio.sleep(1.3)
            await shot('03c_aura_later')
            await ev("t.leaderHp = 1; t.damageLeader ? t.damageLeader(10) : null; if (!t.leaderDead) { t.leaderHp = 0; t.onLeaderDown(); } return t.leaderDead;")
            await asyncio.sleep(1.5)
            await shot('03b_fail')
            await ev("root.retryRealmTrial(); return 1;")
            await asyncio.sleep(16)
            await ev("const m = t.trial.monster; m.hp = 0; t.killMonster(m); return 1;")
            await asyncio.sleep(4)
            print('after win', await ev(STATE), flush=True)
            await shot('04_done')
            await ev("root.continueRealmDone(); return 1;")
            await asyncio.sleep(6)
            print('after continue', await ev("return JSON.stringify({ map: t.mapCode, realm: root.realmState && root.realmState.title });"), flush=True)
            await shot('05_after')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    marks = {
        'level': sql(f'select player_level from game_user where id={UID}'),
        'story': sql(f'select ifnull(max(id),0) from user_story_quest where user_id={UID}'),
        'hero': sql(f'select ifnull(max(id),0) from user_hero where user_id={UID}'),
        'evo': sql(f'select ifnull(max(id),0) from user_evolution_choice where user_id={UID}'),
        'grant': sql('select ifnull(max(id),0) from reward_grant_log'),
    }
    sql('drop table if exists qa_bak_pos'); sql(f'create table qa_bak_pos as select * from user_world_position where user_id={UID}')
    sql('drop table if exists qa_bak_wp'); sql(f'create table qa_bak_wp as select * from user_waypoint where user_id={UID}')
    sql('drop table if exists qa_bak_story'); sql(f'create table qa_bak_story as select * from user_story_quest where user_id={UID}')
    try:
        sql(f'delete from user_protagonist_realm where user_id={UID}')
        sql(f'update game_user set player_level=10 where id={UID}')
        sql(f'delete from user_story_quest where user_id={UID}')
        for i in range(1, 10):
            sql(f"insert into user_story_quest(user_id, quest_code, state, progress, baseline, accepted_at, claimed_at) values ({UID}, 'V0{i}', 'CLAIMED', 1, 0, now(), now())")
        sql(f"insert into user_story_quest(user_id, quest_code, state, progress, baseline, accepted_at) values ({UID}, 'V10', 'ACCEPTED', 0, 0, now())")
        asyncio.run(main())
    finally:
        print('realm row', sql(f'select realm_code, source, trial_ms from user_protagonist_realm where user_id={UID}'))
        sql(f'delete from user_protagonist_realm where user_id={UID}')
        sql(f"delete from user_hero_attr where user_hero_id in (select id from user_hero where user_id={UID} and id>{marks['hero']})")
        sql(f"delete from user_hero where user_id={UID} and id>{marks['hero']}")
        sql(f"delete from user_evolution_choice where user_id={UID} and id>{marks['evo']}")
        sql(f"delete from reward_grant_log where user_id={UID} and id>{marks['grant']} and (request_id like 'LEVEL_CONTRACT:%' or request_id like 'STORY:{UID}:%')")
        sql(f'delete from user_story_quest where user_id={UID}'); sql(f'insert into user_story_quest select * from qa_bak_story')
        sql(f'delete from user_waypoint where user_id={UID}'); sql(f'insert into user_waypoint select * from qa_bak_wp')
        sql(f'delete from user_world_position where user_id={UID}'); sql(f'insert into user_world_position select * from qa_bak_pos')
        sql('drop table if exists qa_bak_pos'); sql('drop table if exists qa_bak_wp'); sql('drop table if exists qa_bak_story')
        sql(f"update game_user set player_level={marks['level']} where id={UID}")
        print('restored', sql(f'select player_level from game_user where id={UID}'), sql(f'select group_concat(quest_code) from user_story_quest where user_id={UID}'))
