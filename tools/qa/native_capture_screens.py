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
# 锻造页签:打开 → 轮询到 forge 视图 → 切页签 → 轮询 lobbyForgeTab 到位再放手(首开有素材加载门,定时器会抢跑)
FORGE_TAB_JS = ("root.openLobbyForgePanel(); let n=0; const t=setInterval(() => {{ n++; if (root.currentView==='forge' && root.lobbyForgeTab!=='{tab}') {{ root.selectLobbyForgeTab('{tab}'); }} "
                "if ((root.currentView==='forge' && root.lobbyForgeTab==='{tab}' && n>8) || n>60) clearInterval(t); }}, 250);")
# 终极技能弹窗:等名册到货 → 开英雄详情 → 技能页 → 弹窗(pick = 挑英雄的表达式,all = 名册里 id>0 的英雄)
ULT_JS = ("let n=0; const t=setInterval(() => {{ n++; const all=root.lobbyHeroRosterLoader.currentState().heroes.filter(h=>h.id>0); "
          "if (all.length>0) {{ clearInterval(t); const h={pick}; root.openLobbyHeroDetail(h.id); "
          "setTimeout(() => {{ root.selectLobbyHeroDetailTab('skill'); setTimeout(() => root.openLobbyHeroUltimateDialog(), 800); }}, 1500); }} "
          "else if (n>40) clearInterval(t); }}, 250);")
SCREENS = [
    ('bag', "root.openLobbyBagPanel();", 3.0),
    ('quest', "root.openLobbyQuestPanel();", 3.0),
    ('mail', "root.openLobbyMailPanel();", 3.0),
    ('shop_gold', "root.openLobbyShopDialog('gold');", 2.5),
    ('shop_stamina', "root.openLobbyShopDialog('stamina');", 2.5),
    ('shop_diamond', "root.openLobbyShopDialog('diamond');", 2.5),
    ('forge_fuse', FORGE_TAB_JS.format(tab='fuse'), 5.0),
    ('forge_decompose', FORGE_TAB_JS.format(tab='decompose'), 5.0),
    ('forge_gem', FORGE_TAB_JS.format(tab='gem'), 5.0),
    # 终极技能升级弹窗:挑一个大招未满级的英雄 → 英雄详情 → 技能页 → 弹窗
    ('ult', ULT_JS.format(pick="all.find(h=>(h.ultimateSkillLevel||1)<5)||all.find(h=>h.awakenStatus===1 && (h.ultimateSkillLevel||1)<10)||all[0]"), 6.0),
    # 终极技能(到上限态):挑 ultimateSkillLevel>=5 且未觉醒的英雄,与原型 Lv5/5 同态
    ('ult_capped', ULT_JS.format(pick="all.find(h=>(h.ultimateSkillLevel||1)>=5 && h.awakenStatus!==1)||all[0]"), 6.0),
    # 背包物品详情弹窗:打开背包后点第一件有自定义图标的道具
    ('bag_detail', "root.openLobbyBagPanel(); setTimeout(() => { const items=root.currentLobbyBagState().groups.flatMap(g=>g.items); const it=items.find(i=>/ENHANCE_STONE|FUSION_LUCK/.test(i.itemCode||''))||items[0]; root.lobbyBagPanelRenderer.detailPopupOpen = true; root.selectLobbyBagItem(it.itemCode); root.refreshLobbyOverlay(); }, 1500);", 4.5),
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
