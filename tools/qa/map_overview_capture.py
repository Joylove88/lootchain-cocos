"""地图页鸟瞰底图生成(2026-10-30,原型 proto_map_b):在模拟器里把整张跑图地图缩到一屏、藏掉 HUD / 角色 / 怪 / 飘叶云影,
adb 截图后按地图边界裁出,缩到长边 2048 存 assets/resources/ui/world/overview/ov_<地图>.png(+ meta)。
改了地图布局 / 素材后重跑。前提同 village2_shots(模拟器 emulator-5554 / 游戏服 8081 / inspector 43086;登录 QA 号)。
用法:python tools/qa/map_overview_capture.py [VILLAGE WOODS CITY GRAY]
"""
import io
import json
import os
import subprocess
import sys
import time

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402
from town_v3_round import ADB, ev, wait_for  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'overview')


def capture(code: str) -> None:
    # 渲染层直接切图(QA 号可能锁了晨风村);等素材加载
    # 刚登录时 GameRoot 会异步按存档把图切回去(preloadWorldMap 回调):切完等一会儿再确认 def 真是目标图,不是就重切
    for _ in range(4):
        ev(f"if (t.def.code !== '{code}') setTimeout(() => {{ t.enterMap('{code}'); root.renderCurrentView(); }}, 50); return 1;")
        wait_for(f"return t.def.code === '{code}' && t.leader ? 'ok' : 'wait';", 'ok', 60)
        time.sleep(8)
        if '{code}'.format(code=code) in ev("return t.def.code;"):
            break
    print(code, ev("return t.def.code;"), flush=True)
    info = json.loads(json.loads(ev(
        "const vs = cc.view.getVisibleSize(); const W = t.def.width, H = t.def.height; const s = Math.min(vs.width / W, vs.height / H);"
        "t._ac = t.applyCamera; t.applyCamera = () => {}; t._st = t.step; t.step = () => {};"
        "t.world.setScale(s, s, 1); t.world.setPosition(0, 0, 0);"
        "const hide = []; const hud = cc.director.getScene().getChildByPath ? null : null;"
        "const walk = (n) => { if (/LobbyTownHud|Ambient|TownMonster_|TownActor|GuidePointer|TownWaypointFx|Glow$|^Plate$|^Name$/.test(n.name)) { hide.push(n); } n.children.forEach(walk); };"
        "walk(cc.director.getScene()); t.world.parent.children.forEach((n) => { if (n !== t.world && n.active) hide.push(n); }); hide.forEach((n) => n.active = false);"
        "t.monsters.forEach((m) => m.node.active = false); if (t.leader) t.leader.node.active = false; t.followers.forEach((f) => f.node.active = false);"
        "t._hidden = hide;"
        "return JSON.stringify({ vw: vs.width, vh: vs.height, s, W, H });")))
    time.sleep(2.5)
    png = subprocess.run(ADB + ['exec-out', 'screencap', '-p'], capture_output=True).stdout
    img = Image.open(io.BytesIO(png)).convert('RGB')
    ratio = img.width / info['vw']
    mw = info['W'] * info['s'] * ratio
    mh = info['H'] * info['s'] * ratio
    cx, cy = img.width / 2, img.height / 2
    box = (round(cx - mw / 2) + 2, round(cy - mh / 2) + 2, round(cx + mw / 2) - 2, round(cy + mh / 2) - 2)
    out = img.crop(box)
    k = 2048 / max(out.size)
    if k < 1:
        out = out.resize((round(out.width * k), round(out.height * k)), Image.LANCZOS)
    os.makedirs(DST, exist_ok=True)
    path = os.path.join(DST, f'ov_{code.lower()}.png')
    out.save(path)
    write_meta(path, f'ov_{code.lower()}', out.width, out.height)
    print('wrote', path, out.size, flush=True)
    # 还原
    ev("t._hidden.forEach((n) => n.isValid && (n.active = true)); t.monsters.forEach((m) => m.node.active = true); if (t.leader) t.leader.node.active = true;"
       "t.followers.forEach((f) => f.node.active = true); t.applyCamera = t._ac; t.step = t._st; t.world.setScale(t.k, t.k, 1); t.applyCamera(true); return 1;")


def main() -> None:
    subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';", 'ready', 60), flush=True)
    for code in (sys.argv[1:] or ['VILLAGE', 'WOODS']):
        capture(code.upper())


if __name__ == '__main__':
    main()
