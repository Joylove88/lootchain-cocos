"""地图页自验(2026-10-30,原型 周报截图/2026-10-30_地图鸟瞰/proto_map_b):林地里点小地图 → 鸟瞰页;点地点设目的地(路线预览);
切世界地图;再点「自动寻路」走一段,确认队长真的沿路动了。前提同 woods_shots(模拟器 / 游戏服 / inspector)。
用法:python tools/qa/area_map_shots.py <输出目录>
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_v3_round import ev, shot, wait_for  # noqa: E402


def main() -> None:
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';", 'ready', 60), flush=True)
    ev("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 1;")
    time.sleep(2)
    ev("if (t.def.code !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
    wait_for("return t.def.code === 'WOODS' && t.leader ? 'ok' : 'wait';", 'ok', 60)
    time.sleep(6)
    # 站到木桥西头,方便看路线
    ev("tp(-850, 0); return 1;")
    time.sleep(2)
    ev("setTimeout(() => root.openAreaMapPanel(), 50); return 1;")
    time.sleep(3)
    shot(out, 'area')
    ev("const p = t.areaMapInfo().places.find((x) => x.name === '猎人营地'); setTimeout(() => root.setAreaMapDest({ x: p.x, y: p.y, label: p.name }), 50); return 1;")
    time.sleep(2.5)
    shot(out, 'area_dest')
    ev("setTimeout(() => root.setWorldMapView('world'), 50); return 1;")
    time.sleep(3)
    shot(out, 'world')
    ev("setTimeout(() => root.setWorldMapView('area'), 50); return 1;")
    time.sleep(1.5)
    before = ev("return Math.round(t.leader.x) + ',' + Math.round(t.leader.y);")
    ev("const p = t.areaMapInfo().places.find((x) => x.name === '猎人营地'); setTimeout(() => root.startAreaAutoWalk(p.x, p.y), 50); return 1;")
    time.sleep(5)
    after = ev("return Math.round(t.leader.x) + ',' + Math.round(t.leader.y) + ' walking=' + t.isAutoWalking();")
    print('autowalk', before, '->', after, flush=True)
    shot(out, 'walking')


if __name__ == '__main__':
    main()
