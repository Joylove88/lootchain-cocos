"""docs/51 主城 HUD v3 自验:登录 → 主城(站传送阵,出交互提示条)→ 终端 → 灰岩荒原打精英(锁定 / 队友出手 / 援护位 / 队长血条 / 精英条),逐张 adb 截图。
前提:模拟器 emulator-5554 已装调试包并在前台;本地游戏服 8081;inspector 43086。
用法:python tools/qa/town_v3_round.py <输出目录> [--login guidetest02]
出图后用 proto_stack.py 和原型 proto_town_v3 / proto_field_v1 / proto_terminal_v2 并排比对。
"""
import argparse
import asyncio
import json
import os
import subprocess
import time

import websockets

from native_capture_screens import ROOT_JS, WS

ADB = ['adb', '-s', 'emulator-5554']
PORT = 43086
T = ROOT_JS + " const t = root && root.lobbyTownRenderer;"
# 全队瞬移到 (x, y):队长 / 队友 / 足迹一起改,镜头直接对过去
TELEPORT = ("const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); "
            "t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };")


class Inspector:
    """整轮只连一次 inspector:调试包每次 Debugger attached 后 0.2 秒左右都可能撞 gfx-validator 断言崩溃(10-27 logcat 实测),
    按次连接一轮要 attach 几十次,几乎必崩。"""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self.ws = None
        self.seq = 0

    def _connect(self) -> None:
        self.ws = self.loop.run_until_complete(websockets.connect(WS.format(port=PORT), max_size=None, open_timeout=10, ping_interval=None))

    def call(self, expr: str) -> str:
        if self.ws is None:
            self._connect()
        self.seq += 1
        my = self.seq

        async def run() -> str:
            await self.ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
            while True:
                data = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=20))
                if data.get('id') == my:
                    return json.dumps(data.get('result', {}).get('result', {}).get('value'))
        return self.loop.run_until_complete(run())


INSPECTOR = Inspector()


def ev(body: str) -> str:
    return INSPECTOR.call(f"(() => {{ {T} {TELEPORT} try {{ {body} }} catch (e) {{ return 'err ' + e.message; }} }})()")


def shot(out: str, name: str) -> None:
    path = os.path.join(out, f'{name}.png')
    with open(path, 'wb') as f:
        f.write(subprocess.run(ADB + ['exec-out', 'screencap', '-p'], capture_output=True).stdout)
    print('shot', name, os.path.getsize(path), flush=True)


def wait_for(body: str, want: str, tries: int = 40, gap: float = 1.5) -> str:
    res = ''
    for _ in range(tries):
        try:
            res = ev(body)
        except Exception as error:  # 应用刚启动 inspector 还没起来:下次重连
            res = f'exc {error}'
            INSPECTOR.ws = None
        if want in res:
            return res
        time.sleep(gap)
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--login', default='guidetest02')
    ap.add_argument('--skip', default='', help='跳过的步骤:town,terminal,field(逗号分隔)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
    subprocess.run(ADB + ['reverse', 'tcp:8081', 'tcp:8081'], capture_output=True)
    view = wait_for("return root && (root.currentView === 'login' || root.currentView === 'lobby') ? 'view=' + root.currentView : 'wait';", 'view=')
    if 'view=login' in view:
        pw = os.environ.get('QA_PASS', 'pass1234')
        ev(f"root.loginFlow.setInputs({{string:'{args.login}'}}, {{string:'{pw}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
        print('login', args.login, flush=True)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait ' + root.currentView;", 'ready', 60), flush=True)

    # 追踪条要有内容:没有进行中的剧情 / 悬赏就接一条悬赏(本地 QA 账号)
    print('bounty', ev("const w = root.worldState; const has = (w.bounties || []).some(b => b.state === 'ACCEPTED' || b.state === 'DONE'); if (!has && (w.bounties || []).length) { const b = w.bounties.find(x => x.state === 'OPEN'); root.api.world.acceptBounty(b.slot).then(r => { root.worldState = r.state; root.renderCurrentView(); }); return 'accept ' + b.slot; } return 'has';"), flush=True)
    time.sleep(2)
    # 1) 主城:站在传送阵罗盘上,靠公告板一侧(出两条提示)
    ev("root.travelWorldMap('CITY', null); return 1;")
    wait_for("return t.currentMapCode() === 'CITY' && t.leader ? 'ok' : 'wait';", 'ok')
    time.sleep(6)
    print('city', ev("const w = t.def.waypoint; tp(w.x + 120, w.y - 40); return JSON.stringify(t.nearbyInteracts().map(i => i.key));"), flush=True)
    time.sleep(2.5)
    shot(args.out, 'town')

    # 2) 终端
    if 'terminal' not in args.skip:
        ev("root.openLobbyTerminalPanel(); return 1;")
        time.sleep(3)
        shot(args.out, 'terminal')
        ev("root.closeLobbyTerminalPanel(); return 1;")

    # 3) 灰岩荒原:站到精英营地旁,锁精英,连打 + 技能,队友进战
    ev("root.travelWorldMap('GRAY', null); return 1;")
    wait_for("return t.currentMapCode() === 'GRAY' && t.leader && t.monsters.length > 0 ? 'ok' : 'wait';", 'ok')
    time.sleep(5)
    print('field', ev("const camp = t.def.camps.find(c => c.elite) || t.def.camps[0]; tp(camp.x - 230, camp.y); t.engageCamp(camp.stageCode); return camp.stageCode;"), flush=True)
    time.sleep(2.5)
    ev("window.__v3bot && clearInterval(window.__v3bot); let n = 0; window.__v3bot = setInterval(() => { try { "
       + ROOT_JS + " const t = root.lobbyTownRenderer; n++; const elite = t.monsters.find(m => m.camp.elite && !m.dead); if (elite && t.lockTarget !== elite) t.setLockTarget(elite); "
       "if (t.leaderHp < t.leaderMaxHp * 0.5) t.leaderHp = t.leaderMaxHp * 0.9; "
       "if (n % 9 === 0) t.leaderSkill(n % 2 === 0 ? 0 : 2); else t.leaderAttack(); if (n > 120) clearInterval(window.__v3bot); } catch (e) {} }, 350); return 'bot';")
    time.sleep(5.5)
    print('state', ev("return JSON.stringify({ combat: t.inCombat, lock: t.lockTarget && t.lockTarget.camp.stageCode, hp: Math.round(t.leaderHp) + '/' + t.leaderMaxHp, "
                     "comp: t.followers.map(a => a.role + ':' + Math.round(a.hp) + '/' + a.maxHp + (a.target ? ':T' : '')), mons: t.monsters.filter(m => !m.dead).map(m => m.hp + '/' + m.maxHp) });"), flush=True)
    shot(args.out, 'field')
    time.sleep(1.2)
    shot(args.out, 'field_b')
    ev("window.__v3bot && clearInterval(window.__v3bot); return 1;")


if __name__ == '__main__':
    main()
