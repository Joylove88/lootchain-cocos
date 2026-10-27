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
    ap.add_argument('--keep-cutout', action='store_true', help='保留模拟器刘海安全区(默认把安全区当成整屏,和原型 1:1 对比)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
    subprocess.run(ADB + ['reverse', 'tcp:8081', 'tcp:8081'], capture_output=True)
    # 先用 /json(不 attach 调试器)探到 inspector 起来,再只 attach 一次:每次 attach 后 0.2 秒内都可能撞 gfx-validator 断言
    import urllib.request
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2).read()
            break
        except Exception:
            time.sleep(1.5)
    time.sleep(3)
    view = wait_for("return root && (root.currentView === 'login' || root.currentView === 'lobby') ? 'view=' + root.currentView : 'wait';", 'view=')
    if 'view=login' in view:
        pw = os.environ.get('QA_PASS', 'pass1234')
        ev(f"root.loginFlow.setInputs({{string:'{args.login}'}}, {{string:'{pw}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
        print('login', args.login, flush=True)
    if not args.keep_cutout:
        # 这台 AVD(sdk_gphone64 API 34)自带顶部 136px 挖孔,横屏时 HUD 两侧各内缩 ~95 设计 px;无刘海手机没有这一截。
        # 对比原型时把安全区打成整屏(只改测试进程里的 sys.getSafeAreaRect),再整刷一次布局
        print('cutout', ev("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 'patched';"), flush=True)
        time.sleep(2)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait ' + root.currentView;", 'ready', 60), flush=True)
    if not args.keep_cutout:
        print('stage', ev("const L = t.hudLayout; return L ? Math.round(L.stageLeft) + '..' + Math.round(L.stageRight) + ' of ' + L.width : 'nolayout';"), flush=True)

    # 追踪条要有内容:没有进行中的剧情 / 悬赏就接一条悬赏(本地 QA 账号)
    print('bounty', ev("const w = root.worldState; const has = (w.bounties || []).some(b => b.state === 'ACCEPTED' || b.state === 'DONE'); if (!has && (w.bounties || []).length) { const b = w.bounties.find(x => x.state === 'OPEN'); root.api.world.acceptBounty(b.slot).then(r => { root.worldState = r.state; setTimeout(() => root.renderCurrentView(), 50); }); return 'accept ' + b.slot; } return 'has';"), flush=True)
    time.sleep(2)
    # 1) 主城:站在传送阵罗盘上,靠公告板一侧(出两条提示)。已在该图就不再切(调试包切图偶发 gfx-validator 崩)
    if 'town' not in args.skip:
        ev("if (t.currentMapCode() !== 'CITY') setTimeout(() => root.travelWorldMap('CITY', null), 50); return 1;")
        wait_for("return t.currentMapCode() === 'CITY' && t.leader ? 'ok' : 'wait';", 'ok')
        time.sleep(6)
        print('city', ev("const w = t.def.waypoint; tp(w.x + 120, w.y - 40); return JSON.stringify(t.nearbyInteracts().map(i => i.key));"), flush=True)
        time.sleep(2.5)
        shot(args.out, 'town')

    # 2) 终端
    if 'terminal' not in args.skip:
        ev("setTimeout(() => root.openLobbyTerminalPanel(), 50); return 1;")
        time.sleep(3)
        shot(args.out, 'terminal')
        ev("setTimeout(() => root.closeLobbyTerminalPanel(), 50); return 1;")
        time.sleep(1)

    # 3) 灰岩荒原:站到精英营地旁,锁精英,连打 + 技能,队友进战
    ev("if (t.currentMapCode() !== 'GRAY') setTimeout(() => root.travelWorldMap('GRAY', null), 50); return 1;")
    wait_for("return t.currentMapCode() === 'GRAY' && t.leader && t.monsters.length > 0 ? 'ok' : 'wait';", 'ok')
    time.sleep(5)
    # 精英可能刚被打死还没刷:先把队伍挪远、清掉刷新计时、补刷一次,再回来
    print('respawn', ev("const camp = t.def.camps.find(c => c.elite) || t.def.camps[0]; if (!t.monsters.some(m => m.camp.stageCode === camp.stageCode && !m.dead)) { t.monsters.filter(m => m.camp.stageCode === camp.stageCode).forEach(m => m.node.isValid && m.node.destroy()); t.monsters = t.monsters.filter(m => m.node.isValid); t.campRespawnAt.delete(camp.stageCode); tp(camp.x - 1200, camp.y); t.ensureMonsters(); return 'respawned ' + t.monsters.filter(m => m.camp.stageCode === camp.stageCode).length; } return 'alive';"), flush=True)
    time.sleep(1.5)
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
    if 'p2' in args.skip:
        return
    # 4) docs/51 P2:破防(直接把精英打到破防)→ 换队长(Alt+1 同款 swapLeader)→ 打死精英掉战利品 → 走近出「拾取 · 战利品」→ 拾取结算
    print('stagger', ev("const e = t.monsters.find(m => m.camp.elite && !m.dead); if (!e) return 'no elite'; t.setLockTarget(e); t.staggerMonster(e, Date.now()); return 'ok ' + e.stagger;"), flush=True)
    time.sleep(0.8)
    shot(args.out, 'field_stagger')
    print('swap', ev("const before = t.leader.hero.heroName; t.swapReadyAt = 0; t.swapLeader(0); return before + ' -> ' + t.leader.hero.heroName + ' hp ' + Math.round(t.leaderHp) + '/' + t.leaderMaxHp;"), flush=True)
    time.sleep(1.2)
    shot(args.out, 'field_swap')
    print('kill', ev("const e = t.monsters.find(m => m.camp.elite && !m.dead); if (!e) return 'no elite'; e.hp = 1; t.damageMonster(e, 5, true, false); return 'loots ' + t.loots.length;"), flush=True)
    time.sleep(1.5)
    print('near', ev("const l = t.loots[0]; if (!l) return 'no loot'; tp(l.x - 110, l.y); return JSON.stringify(t.nearbyInteracts().map(i => i.kind));"), flush=True)
    time.sleep(1.5)
    shot(args.out, 'field_loot')
    # 挂钩奖励回调:记下服务端发了什么,再按原样飘字
    ev("if (!t.__origShow) { t.__origShow = t.showLootRewards; t.showLootRewards = function (items, capped) { window.__lootRewards = { items, capped }; return t.__origShow(items, capped); }; } window.__lootRewards = null; return 1;")
    print('pickup', ev("const l = t.loots[0]; if (!l) return 'no loot'; t.pickupLoot(l); return 'picked, left ' + t.loots.length;"), flush=True)
    time.sleep(1.1)
    shot(args.out, 'field_picked')
    time.sleep(2)
    print('after', ev("return JSON.stringify({ loots: t.loots.length, lv: root.worldState && root.worldState.playerLevel, encounters: t.encounters.size, rewards: window.__lootRewards });"), flush=True)
    # docs/08 升级礼包:升级后等 2 秒(资料 / 邮件回读)截一张带升级提示 + 邮箱红点的,再开邮箱看礼包邮件
    time.sleep(2.5)
    shot(args.out, 'field_levelup')
    print('mails', ev("const ms = root.currentLobbyMailState().mails; return JSON.stringify(ms.slice(0, 3).map(m => ({ t: m.title, read: m.read, att: (m.attachments || []).map(a => a.name + 'x' + a.amount) })));"), flush=True)
    ev("setTimeout(() => root.openLobbyMailPanel(), 50); return 1;")
    time.sleep(3)
    shot(args.out, 'mail_pack')
    ev("setTimeout(() => root.closeLobbyMailPanel(), 50); return 1;")


if __name__ == '__main__':
    main()
