"""10-28 三项自验:①任意处传送(传送阵上立即 / 别处读条 5 秒 / 交战中不能传)+ 小地图旁「传送」钮;
②终端体力超上限显示;③原生包锻造素材后台预读(首开不进「正在加载」闸门)。
前提同 town_v3_round.py(模拟器调试包在前台、本地游戏服 8081、inspector 43086)。
用法:python tools/qa/teleport_round.py <输出目录> [--login guidetest02]
"""
import argparse
import json
import os
import subprocess
import time
import urllib.request

from town_v3_round import ADB, PORT, ev, shot, wait_for


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--login', default='guidetest02')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
    subprocess.run(ADB + ['reverse', 'tcp:8081', 'tcp:8081'], capture_output=True)
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
    ev("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 'patched';")
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';", 'ready', 60), flush=True)

    # ① 主城:离传送阵远处 → 世界地图说明应是「读条 5 秒」;HUD 小地图旁有「传送」钮
    ev("if (t.currentMapCode() !== 'CITY') setTimeout(() => root.travelWorldMap('CITY', null), 50); return 1;")
    wait_for("return t.currentMapCode() === 'CITY' && t.leader ? 'ok' : 'wait';", 'ok')
    time.sleep(5)
    print('far', ev("const w = t.def.waypoint; tp(w.x + 700, w.y + 200); return 'sec=' + t.teleportChannelSec() + ' note=' + root.worldTeleportNote();"), flush=True)
    time.sleep(2)
    shot(args.out, 'hud_mapbtn')
    print('btn', ev("const find = (node) => node.name === 'LobbyTownWorldMapBtn' ? node : node.children.reduce((a, c) => a || find(c), null); const b = find(cc.director.getScene()); return b ? 'found ' + Math.round(b.worldPosition.x) + ',' + Math.round(b.worldPosition.y) : 'missing';"), flush=True)
    ev("setTimeout(() => root.openWorldMapPanel(), 50); return 1;")
    time.sleep(2.5)
    dest = json.loads(ev("const m = root.worldState.maps.find(x => x.unlocked && x.mapCode !== 'CITY'); return m ? m.mapCode : 'NONE';"))
    print('dest', dest, flush=True)
    ev(f"setTimeout(() => root.selectWorldMapPoint('{dest}'), 30); return 1;")
    time.sleep(1.5)
    shot(args.out, 'worldmap_far')
    # 别处点传送 → 读条 5 秒
    print('go_far', ev(f"setTimeout(() => root.teleportWorldMap('{dest}'), 30); return 'map ' + t.currentMapCode();"), flush=True)
    time.sleep(1.5)
    shot(args.out, 'channel_far')
    print('mid', ev("return 'map ' + t.currentMapCode() + ' channel ' + JSON.stringify(t.channel ? { label: t.channel.label, sec: (t.channel.endAt - t.channel.startAt) / 1000 } : null);"), flush=True)
    print('arrive', wait_for(f"return t.currentMapCode() === '{dest}' && t.leader ? 'ok' : 'wait ' + t.currentMapCode();", 'ok', 20, 1), flush=True)
    time.sleep(4)

    # 站上传送阵 → 立即传送
    print('on', ev("const w = t.def.waypoint; tp(w.x, w.y); return 'sec=' + t.teleportChannelSec() + ' note=' + root.worldTeleportNote();"), flush=True)
    time.sleep(1.5)
    ev("setTimeout(() => root.openWorldMapPanel(), 50); return 1;")
    time.sleep(2.5)
    ev("setTimeout(() => root.selectWorldMapPoint('CITY'), 30); return 1;")
    time.sleep(1.5)
    shot(args.out, 'worldmap_on')
    t0 = time.time()
    ev("setTimeout(() => root.teleportWorldMap('CITY'), 30); return 1;")
    print('instant', wait_for("return t.currentMapCode() === 'CITY' ? 'ok' : 'wait';", 'ok', 30, 0.3), round(time.time() - t0, 1), 's', flush=True)
    time.sleep(4)

    # ② 终端体力超上限(只改测试进程里的资料数值)
    print('stamina', ev("const p = root.currentLobbyProfile(); p.__origStamina = p.stamina; p.stamina = 1164; setTimeout(() => root.openLobbyTerminalPanel(), 50); return p.maxStamina;"), flush=True)
    time.sleep(3)
    shot(args.out, 'terminal_over')
    ev("setTimeout(() => root.closeLobbyTerminalPanel(), 50); const p = root.currentLobbyProfile(); p.stamina = p.__origStamina; return 1;")
    time.sleep(1)
    ev("setTimeout(() => root.openLobbyTerminalPanel(), 50); return 1;")
    time.sleep(3)
    shot(args.out, 'terminal_normal')
    ev("setTimeout(() => root.closeLobbyTerminalPanel(), 50); return 1;")
    time.sleep(1)

    # ③ 锻造预读:登录后已过一阵,锻造分组图应已在内存;打开锻造应直接出页面(groupProgress 为 null)
    print('forge_cached', ev("const paths = root.uiSpriteFrameCache.groupAssetPaths('forge'); const miss = paths.filter(p => !cc.resources.get(p, cc.SpriteFrame)); return miss.length + '/' + paths.length + ' missing';"), flush=True)
    print('forge_open', ev("root.openLobbyForgePanel(); return JSON.stringify(root.uiSpriteFrameCache.groupProgress('forge'));"), flush=True)
    time.sleep(2)
    shot(args.out, 'forge_first')


if __name__ == '__main__':
    main()
