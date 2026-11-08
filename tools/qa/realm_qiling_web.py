# -*- coding: utf-8 -*-
"""契灵突破(docs/60 §14)界面自验(预览 7456 / 正式包 7460 + 本地游戏服 8081 + 本地库),无头 Edge 一次只跑一个。
自检号 selfchk1108(uid 83,Lv.60 炼魂,在主城)→
01 突破窗口(三选一 / 天枢的幻影 / 契灵外观虚影)→ 02 试炼开场(零的台词)→ 03 打到一半(淡金血条 + 金白幻影)→
04 斩杀后突破成功页(契灵立绘 / 被动契印 / 记忆其二)→ 05 继续回到主城(队长身后 3 枚契印)→ 06 再开突破窗口 = 已到顶 → 07 主角详情境界页。
跑完把境界行恢复成炼魂、等级恢复。
用法:PYTHONIOENCODING=utf-8 python tools/qa/realm_qiling_web.py [输出目录]
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import websockets

import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'realm_qiling_web')
ACCOUNT, UID = 'selfchk1108', 83
MYSQL = r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")
STATE = ("const m = t.trial && t.trial.monster; return JSON.stringify({ realm: root.realmState && root.realmState.title, code: root.realmState && root.realmState.realmCode,"
         " canBreak: root.realmState && root.realmState.canBreak, mode: root.realmState && root.realmState.conditionMode, trial: root.realmTrial && root.realmTrial.target,"
         " done: root.realmDone, boss: m && [m.camp.label, m.maxHp, m.hit, m.skeleton && m.skeleton.color && [m.skeleton.color.r, m.skeleton.color.g, m.skeleton.color.b]],"
         " map: t.mapCode, seals: t.leader && t.leader.seals ? t.leader.seals.length : 0 });")


def sql(q):
    return subprocess.run([MYSQL, '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8').stdout.strip()


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_qiling'
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
                # 无头偶发画面冻结(rAF 不来):截图前手动推两帧
                await ev("cc.game.step(); cc.game.step(); return 1;")
                await asyncio.sleep(0.5)
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
            calm = 0
            for _ in range(300):
                calm = calm + 1 if await ev(BUSY) == 'ok' else 0
                if calm >= 3:
                    break
                await asyncio.sleep(2)
            await ev("await root.loadRealmState(); return 1;")
            print('realm', await ev(STATE), flush=True)
            await ev("root.openRealmBreak(); return 1;")
            await asyncio.sleep(8)
            print('break node', await ev("return !!root.ensureContentRoot().getChildByName('LobbyRealmBreak');"), flush=True)
            await shot('01_break')
            await ev("root.startRealmTrial(); return 1;")
            await asyncio.sleep(4)
            print('trial', await ev(STATE), flush=True)
            await shot('02_trial_start')
            # 战斗按钮在主城也要有(主城没有怪群,试炼期间按能打架的地图算)
            print('combat buttons', await ev("return JSON.stringify({ n: t.combatButtons ? t.combatButtons.length : -1 });"), flush=True)
            # 真打一下:普攻 + 技能,看伤害是否落到幻影上
            await asyncio.sleep(3)
            hp0 = await ev("return t.trial.monster.hp;")
            await ev("t.leaderSkill(0); return 1;")
            await asyncio.sleep(2.5)
            hp1 = await ev("return t.trial.monster.hp;")
            print('skill hit', hp0, '->', hp1, flush=True)
            await ev("const m = t.trial.monster; m.hp = Math.round(m.maxHp * 0.4); m.lastHitAt = Date.now(); t.drawMonsterHp(m); return m.maxHp;")
            await asyncio.sleep(6)
            await shot('03_trial_mid')
            await ev("const m = t.trial.monster; m.hp = 0; t.killMonster(m); return 1;")
            await asyncio.sleep(5)
            print('after win', await ev(STATE), flush=True)
            await shot('04_done')
            await ev("root.continueRealmDone(); return 1;")
            await asyncio.sleep(8)
            print('after continue', await ev(STATE), flush=True)
            await shot('05_field_seals')
            # 契印叠层:直接喂 2 层看亮起
            await ev("t.sealStacks = 2; t.refreshQilingSeals(t.leader); return 1;")
            await asyncio.sleep(1)
            await shot('05b_seals_lit')
            await ev("root.openRealmBreak(); return 1;")
            await asyncio.sleep(3)
            await shot('06_break_top')
            await ev("root.closeRealmBreak(); return 1;")
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    level = sql(f'select player_level from game_user where id={UID}')
    row = sql(f'select realm_code from user_protagonist_realm where user_id={UID}')
    print('start', level, row, flush=True)
    sql(f"update user_protagonist_realm set realm_code='LIANHUN' where user_id={UID}")
    try:
        asyncio.run(main())
    finally:
        print('realm row', sql(f'select realm_code, source, trial_ms from user_protagonist_realm where user_id={UID}'))
        sql(f"update user_protagonist_realm set realm_code='LIANHUN' where user_id={UID}")
        sql(f'update game_user set player_level={level} where id={UID}')
        print('restored', sql(f'select realm_code from user_protagonist_realm where user_id={UID}'))
