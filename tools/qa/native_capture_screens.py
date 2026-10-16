"""原生调试包:按清单逐个打开界面并截图(模拟器 / 真机),用于改版前留底与 GPT 原型输入。

用法:python tools/qa/native_capture_screens.py --out <目录> [--port 43086] [--device emulator-5554] [--only bag,quest]
每个界面:先回大厅(关掉所有面板),执行打开脚本,等待,adb screencap 存 <key>.png。
"""
import argparse
import asyncio
import json
import os
import subprocess
import time

import websockets

WS = 'ws://127.0.0.1:{port}/00010002-0003-4004-8005-000600070008'
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
RESET_JS = "try { root.closeAllLobbyScenePanelFlags && root.closeAllLobbyScenePanelFlags(); } catch (e) {} try { root.lobbyShopDialogKind = null; } catch (e) {} try { root.currentView = 'lobby'; root.renderCurrentView(); } catch (e) {}"
SCREENS = [
    ('bag', "root.openLobbyBagPanel();", 3.0),
    ('quest', "root.openLobbyQuestPanel();", 3.0),
    ('mail', "root.openLobbyMailPanel();", 3.0),
    ('shop_gold', "root.openLobbyShopDialog('gold');", 2.5),
    ('shop_stamina', "root.openLobbyShopDialog('stamina');", 2.5),
    ('shop_diamond', "root.openLobbyShopDialog('diamond');", 2.5),
    ('forge_fuse', "root.openLobbyForgePanel(); setTimeout(() => root.selectLobbyForgeTab('fuse'), 600);", 4.0),
    ('forge_decompose', "root.openLobbyForgePanel(); setTimeout(() => root.selectLobbyForgeTab('decompose'), 600);", 4.0),
    ('forge_gem', "root.openLobbyForgePanel(); setTimeout(() => root.selectLobbyForgeTab('gem'), 600);", 4.0),
]


async def evaluate(port: int, expr: str) -> str:
    async with websockets.connect(WS.format(port=port), max_size=None, open_timeout=10) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
        while True:
            data = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
            if data.get('id') == 1:
                return json.dumps(data.get('result', {}).get('result', {}).get('value'))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--port', type=int, default=43086)
    ap.add_argument('--device', default='emulator-5554')
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    only = set(filter(None, args.only.split(',')))
    for key, js, wait in SCREENS:
        if only and key not in only:
            continue
        expr = f"(() => {{ {ROOT_JS} {RESET_JS} try {{ {js} }} catch (e) {{ return 'err ' + e.message; }} return root.currentView; }})()"
        res = asyncio.run(evaluate(args.port, expr))
        time.sleep(wait)
        path = os.path.join(args.out, f'{key}.png')
        with open(path, 'wb') as f:
            f.write(subprocess.run(['adb', '-s', args.device, 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
        print(key, res, os.path.getsize(path))


if __name__ == '__main__':
    main()
