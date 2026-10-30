"""野外三处修复自验(2026-10-30 用户反馈):
1. 路边草地往左上走不过去、原地踏步 → 放宽走廊 + 沿墙滑 + 挡住不播跑步;
2. 世界层重建后同群怪变成 0 血空壳(不打人、打不死)→ 遭遇数值缓存补发;
3. 两只怪叠在一起 → 追击错位 + 互相推开。
前提同 woods_shots(模拟器 / 游戏服 / inspector)。用法:python tools/qa/field_fix_check.py <输出目录>
"""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_v3_round import ev, shot, wait_for  # noqa: E402

CAMP = 'FIELD_WOODS_7'


def main() -> None:
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for _ in range(60):
        try:
            urllib.request.urlopen('http://127.0.0.1:43086/json', timeout=2).read()
            break
        except Exception:
            time.sleep(1.5)
    time.sleep(3)
    view = wait_for("return root && (root.currentView === 'login' || root.currentView === 'lobby') ? 'view=' + root.currentView : 'wait';", 'view=')
    if 'login' in view:
        ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';", 'ready', 60), flush=True)
    ev("if (t.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
    wait_for("return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';", 'ok', 60)
    time.sleep(6)

    # 1) 用户卡住的位置(坐标 26,45)往左上走 2.5 秒
    ev("tp(-4180, -1238); t.keys.add(cc.KeyCode.ARROW_LEFT); t.keys.add(cc.KeyCode.ARROW_UP); return 1;")
    time.sleep(2.5)
    moved = ev("t.keys.clear(); return Math.round(t.leader.x) + ',' + Math.round(t.leader.y) + ' moving=' + t.leader.moving;")
    print('1 walk up-left from -4180,-1238 ->', moved, flush=True)
    shot(out, 'walk_upleft')

    # 2) 开战 → 重建世界层 → 怪仍有数值、会打人、能打掉血
    ev(f"const c = t.def.camps.find(x => x.stageCode === '{CAMP}'); tp(c.x - 260, c.y); return 1;")
    time.sleep(5)
    print('2 before rebuild maxHp', ev(f"return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === '{CAMP}').map(m => m.maxHp));"), flush=True)
    ev("setTimeout(() => { t.buildWorld(); root.renderCurrentView(); }, 50); return 1;")
    time.sleep(4)
    ev(f"const c = t.def.camps.find(x => x.stageCode === '{CAMP}'); tp(c.x - 260, c.y); return 1;")
    hp0 = json.loads(ev("return t.leaderHp;"))
    stats = ev(f"return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === '{CAMP}').map(m => [m.maxHp, m.hp]));")
    for _ in range(6):
        ev("t.leaderAttack(); return 1;")
        time.sleep(0.8)
    time.sleep(3)
    hp1 = json.loads(ev("return t.leaderHp;"))
    after = ev(f"return JSON.stringify(t.monsters.filter(m => m.camp.stageCode === '{CAMP}').map(m => [m.maxHp, m.hp, m.dead]));")
    print('2 after rebuild stats', stats, flush=True)
    print('2 after attacks', after, 'leaderHp', hp0, '->', hp1, flush=True)

    # 3) 同群怪最近距离(纵向按 0.6 折算)
    gap = ev(f"const ms = t.monsters.filter(m => m.camp.stageCode === '{CAMP}' && !m.dead); let best = 1e9; "
             "for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) best = Math.min(best, Math.hypot(ms[i].x - ms[j].x, (ms[i].y - ms[j].y) / 0.6)); "
             "return Math.round(best) + ' (' + ms.length + ' alive)';")
    print('3 min gap between monsters', gap, flush=True)
    shot(out, 'pack_fight')


if __name__ == '__main__':
    main()
