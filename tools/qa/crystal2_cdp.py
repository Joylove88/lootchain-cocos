# -*- coding: utf-8 -*-
"""无头 Edge:docs/38 §9 水晶 v2 自验——升级页(金币 + 晶核消耗)→ 法术装备页(格位 / 卡片 / 详情)→ 替换装备 → 开战读快照 + 法术栏 → 战斗内法术装备只读页。"""
import asyncio, base64, json, os, sys, time, subprocess, urllib.request
import websockets
import boss_bar_cdp as base

TAG = next((a for a in sys.argv[1:] if not a.startswith('--')), 'cv2')
SKIP_BATTLE = '--no-battle' in sys.argv
SHOTS = os.path.join(base.SCRATCH, 'shots')

HELPERS = r"""
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cc = window.__cc, root = window.__root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  const text = name => { const n = find(name); const l = n && n.getComponent(cc.Label); return l ? l.string : null; };
  const waitIdle = async () => { for (let i = 0; i < 60 && root.lobbyGuardCrystalDialog && root.lobbyGuardCrystalDialog.busy; i++) await sleep(150); await sleep(500); };
  const boxOf = n => { const t = n.getComponent(cc.UITransform); const p = n.worldPosition; return { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(t.width), h: Math.round(t.height) }; };
"""

JS_OPEN = "(async () => {" + HELPERS + r"""
  for (let i = 0; i < 40 && root.currentView !== 'lobby'; i++) await sleep(250);
  await sleep(600);
  find('LobbyNavItem_crystal').emit(cc.Button.EventType.CLICK);
  for (let i = 0; i < 40 && !(root.lobbyGuardCrystalDialog && root.lobbyGuardCrystalDialog.info); i++) await sleep(200);
  for (let i = 0; i < 150 && !find('LobbyGuardCrystalTab_upgrade'); i++) await sleep(200);
  await sleep(900);
  const d = root.lobbyGuardCrystalDialog;
  const i = d.info;
  return JSON.stringify({ level: i.level, nextGold: i.nextUpgradeGold, nextCore: i.nextUpgradeCore, core: i.coreBalance, slots: i.spellSlots, nextSlotLevel: i.nextSlotLevel, loadout: i.current.spellLoadout,
    tabs: [text('LobbyGuardCrystalTab_upgrade') || (find('LobbyGuardCrystalTab_upgrade') && find('LobbyGuardCrystalTab_upgrade').getChildByName('Text').getComponent(cc.Label).string), find('LobbyGuardCrystalTab_spells') && find('LobbyGuardCrystalTab_spells').getChildByName('Text').getComponent(cc.Label).string],
    goldCard: text('LobbyGuardCrystalCostGold'), coreCard: text('LobbyGuardCrystalCostCore') });
})()"""

JS_DBG = "(async () => {" + HELPERS + r"""
  const out = {};
  ['LobbyGuardCrystalStatsDivider', 'LobbyGuardCrystalQuoteLine', 'LobbyGuardCrystalLevelBar'].forEach(name => {
    const n = find(name); if (!n) { out[name] = null; return; }
    const g = n.getComponent(cc.Graphics); const impl = g.impl;
    out[name] = { w: n.getComponent(cc.UITransform).width, h: n.getComponent(cc.UITransform).height, pos: [n.position.x, n.position.y],
      paths: impl ? impl.paths.length : -1, pts: impl ? impl.paths.map(p => p.points.length) : null,
      rd: g._renderData ? 'y' : 'n', rds: g._graphicsRenderData ? g._graphicsRenderData.length : (g.graphicsRenderData ? g.graphicsRenderData.length : -1),
      keys: Object.keys(g).filter(k => /render|impl|data|model/i.test(k)) };
  });
  return JSON.stringify(out);
})()"""

JS_SPELLUP = "(async () => {" + HELPERS + r"""
  root.lobbyGuardCrystalDialog.notice = '';
  find('LobbyGuardCrystalTab_spells').emit(cc.Button.EventType.CLICK);
  await sleep(700);
  find('LobbyGuardCrystalSpell_thunder').emit(cc.Button.EventType.CLICK);
  await sleep(700);
  const before = (root.lobbyGuardCrystalDialog.info.spells || []).find(s => s.spellId === 'thunder');
  const lab = find('LobbyGuardCrystalUpgradeLabel');
  const next = find('LobbyGuardCrystalSpellDetail').getChildByName('Next');
  return JSON.stringify({ before, label: lab ? lab.getComponent(cc.Label).string : null, nextText: next ? next.getComponent(cc.Label).string : null, gold: text('LobbyGuardSpellCostGold'), core: text('LobbyGuardSpellCostCore') });
})()"""

JS_SPELLUP_CLICK = "(async () => {" + HELPERS + r"""
  find('LobbyGuardCrystalUpgrade').emit(cc.Button.EventType.CLICK);
  await waitIdle();
  await sleep(400);
  const d = root.lobbyGuardCrystalDialog;
  const after = (d.info.spells || []).find(s => s.spellId === 'thunder');
  const card = find('LobbyGuardCrystalSpell_thunder');
  const lv = card && card.getChildByName('Level');
  return JSON.stringify({ notice: d.notice, after, cardLv: lv ? lv.getChildByName('Text').getComponent(cc.Label).string : null });
})()"""

JS_TRY_UPGRADE ="(async () => {" + HELPERS + r"""
  find('LobbyGuardCrystalUpgrade').emit(cc.Button.EventType.CLICK);
  await waitIdle();
  return JSON.stringify({ notice: root.lobbyGuardCrystalDialog.notice, level: root.lobbyGuardCrystalDialog.info.level });
})()"""

JS_SPELLS_TAB = "(async () => {" + HELPERS + r"""
  root.lobbyGuardCrystalDialog.notice = '';
  find('LobbyGuardCrystalTab_spells').emit(cc.Button.EventType.CLICK);
  await sleep(800);
  const sockets = []; for (let k = 0; k < 6; k++) { const s = find('LobbyGuardCrystalSocket_' + k); if (s) sockets.push(text('LobbyGuardCrystalSocketName_' + k)); }
  const det = find('LobbyGuardCrystalSpellDetail');
  const panel = find('LobbyGuardCrystalPanel');
  return JSON.stringify({ title: text('LobbyGuardCrystalLoadoutTitle'), sockets, detail: det ? boxOf(det) : null, panel: boxOf(panel), action: det ? det.getChildByName('Action').getChildByName('Text').getComponent(cc.Label).string : null });
})()"""

JS_SELECT = (lambda spell: "(async () => {" + HELPERS + r"""
  find('LobbyGuardCrystalSpell_%s').emit(cc.Button.EventType.CLICK);
  await sleep(600);
  const det = find('LobbyGuardCrystalSpellDetail');
  const panel = find('LobbyGuardCrystalPanel');
  return JSON.stringify({ detail: boxOf(det), panel: boxOf(panel), action: det.getChildByName('Action').getChildByName('Text').getComponent(cc.Label).string });
})()""" % spell)

JS_ACTION = "(async () => {" + HELPERS + r"""
  const det = find('LobbyGuardCrystalSpellDetail');
  det.getChildByName('Action').emit(cc.Button.EventType.CLICK);
  await waitIdle();
  const d = root.lobbyGuardCrystalDialog;
  return JSON.stringify({ notice: d.notice, loadout: d.info.current.spellLoadout });
})()"""

JS_SOCKET = (lambda idx: "(async () => {" + HELPERS + r"""
  find('LobbyGuardCrystalSocket_%d').emit(cc.Button.EventType.CLICK);
  await sleep(500);
  return JSON.stringify({ target: root.lobbyGuardCrystalDialog.targetSlot, selected: root.lobbyGuardCrystalDialog.selectedSpell });
})()""" % idx)

JS_BATTLE = "(async () => {" + HELPERS + r"""
  root.closeGuardCrystalDialog();
  await sleep(300);
  try { await root.openLobbyBattlePreviewPanel('MAIN_1_1'); } catch (e) { return 'open err ' + e.message; }
  for (let i = 0; i < 40 && root.currentView !== 'battle'; i++) await sleep(500);
  if (root.currentView !== 'battle') {
    for (let k = 0; k < 3 && root.currentView !== 'battle'; k++) {
      const b = find('LobbyAdventureFormationButton');
      if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); }
      for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500);
    }
  }
  let r = root.lobbyGuardBattleRenderer;
  for (let i = 0; i < 60 && !(r && r.sim); i++) { await sleep(500); r = root.lobbyGuardBattleRenderer; }
  window.__gr = r;
  const sim = r.sim;
  const snap = root.lobbyBattleFlow && root.lobbyBattleFlow.state && root.lobbyBattleFlow.state.start ? root.lobbyBattleFlow.state.start.guardCrystal : null;
  const bar = find('GuardSpellBar');
  return JSON.stringify({ view: root.currentView, snapshot: snap, slots: sim.spellSlots, loadout: sim.spellLoadout, bar: bar ? bar.children.map(c => c.name) : null });
})()"""

JS_SETTINGS = "(async () => {" + HELPERS + r"""
  const r = window.__gr;
  r.openBattleSettings();
  await sleep(600);
  r.renderSettingsPage(find('GuardSettingsOverlay'), 'spells');
  await sleep(700);
  const desc = id => { const c = find('GuardSpellCard_' + id); const d = c && c.getChildByName('Desc'); return d ? d.getComponent(cc.Label).string : null; };
  return JSON.stringify({ tip: text('GuardSpellsTip'), quake: desc('quake'), goldrush: desc('goldrush'), aegis: desc('aegis'), warhorn: desc('warhorn') });
})()"""


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}',
                             '--no-first-run', '--no-default-browser-check', '--window-size=1600,900',
                             '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                             '--autoplay-policy=no-user-gesture-required', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        req = urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?{base.PAGE}', method='PUT')
        target = json.load(urllib.request.urlopen(req, timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(method, params=None):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get('id') == my:
                        return msg

            async def ev(expr, timeout=120):
                r = await asyncio.wait_for(call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}), timeout)
                res = r.get('result', {})
                if 'exceptionDetails' in res:
                    return 'EXC: ' + json.dumps(res['exceptionDetails'].get('exception', {}).get('description', res['exceptionDetails']), ensure_ascii=False)[:600]
                return res.get('result', {}).get('value')

            async def snap(name):
                shot = await call('Page.captureScreenshot', {'format': 'png'})
                data = shot.get('result', {}).get('data')
                if data:
                    with open(os.path.join(SHOTS, f'{TAG}_{name}.png'), 'wb') as f:
                        f.write(base64.b64decode(data))
                    print('shot', name)

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await asyncio.sleep(10)
            print('boot:', await ev(base.JS_BOOT, 330))
            print('login:', await ev(base.JS_LOGIN, 90))
            print('open:', await ev(JS_OPEN, 60))
            await snap('upgrade')
            if '--dbg' in sys.argv:
                print('dbg:', await ev(JS_DBG, 30))
                return
            if '--spellup' in sys.argv:
                print('spellTab:', await ev(JS_SPELLUP, 30))
                await snap('spellup_before')
                print('spellClick:', await ev(JS_SPELLUP_CLICK, 60))
                await snap('spellup_after')
                return
            print('tryUpgrade:', await ev(JS_TRY_UPGRADE, 30))
            await snap('upgrade_short')
            print('spellsTab:', await ev(JS_SPELLS_TAB, 30))
            await snap('spells')
            print('selectThunder:', await ev(JS_SELECT('thunder'), 30))
            await snap('spells_thunder')
            print('selectGoldrush:', await ev(JS_SELECT('goldrush'), 30))
            await snap('spells_goldrush')
            print('replace:', await ev(JS_ACTION, 30))
            await snap('spells_replaced')
            print('socket0:', await ev(JS_SOCKET(0), 30))
            print('selectAegis:', await ev(JS_SELECT('aegis'), 30))
            await snap('spells_target0')
            print('replace0:', await ev(JS_ACTION, 30))
            await snap('spells_replaced0')
            print('selectWarhorn:', await ev(JS_SELECT('warhorn'), 30))
            await snap('spells_locked')
            if not SKIP_BATTLE:
                print('battle:', await ev(JS_BATTLE, 120))
                await asyncio.sleep(1.5)
                await snap('battle')
                print('settings:', await ev(JS_SETTINGS, 30))
                await snap('battle_settings')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        time.sleep(1)


if __name__ == '__main__':
    asyncio.run(main())
