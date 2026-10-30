"""迷雾 / 探索度自验(docs/53 §2.2,2026-10-30):林地里截小地图 + 地图页(初始迷雾)→ 瞬移走过 10 格(过 25% 档)→
确认服务端 bits / percent / tier 变化、到档发奖 → 再截地图页。前提同 woods_shots。
用法:python tools/qa/explore_shots.py <输出目录>
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_v3_round import ev, shot, wait_for  # noqa: E402

STATE = "const e = (root.worldState.explore || []).find((x) => x.mapCode === 'WOODS'); return e ? e.percent + '% tier ' + e.tier + ' bits ' + e.bits : 'none';"


def main() -> None:
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';", 'ready', 60), flush=True)
    ev("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 1;")
    time.sleep(2)
    ev("if (t.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
    wait_for("return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';", 'ok', 60)
    time.sleep(6)
    print('start', ev(STATE), flush=True)
    shot(out, 'minimap_start')
    ev("setTimeout(() => root.openAreaMapPanel(), 50); return 1;")
    time.sleep(3)
    shot(out, 'map_start')
    ev("setTimeout(() => root.closeWorldMapPanel(), 50); return 1;")
    time.sleep(1)
    # 沿走廊走过若干格(用各地点 / 营地坐标,都在可走区里)
    pts = ev("return JSON.stringify(t.def.camps.slice(0, 12).map((c) => [c.x, c.y]));")
    import json
    for x, y in json.loads(json.loads(pts)):
        ev(f"tp({x - 300}, {y}); return 1;")
        time.sleep(1.2)
    time.sleep(2)
    print('after', ev(STATE), 'status', ev("return root.statusText || '';"), flush=True)
    shot(out, 'minimap_after')
    ev("setTimeout(() => root.openAreaMapPanel(), 50); return 1;")
    time.sleep(3)
    shot(out, 'map_after')
    ev("setTimeout(() => root.closeWorldMapPanel(), 50); return 1;")


if __name__ == '__main__':
    main()
