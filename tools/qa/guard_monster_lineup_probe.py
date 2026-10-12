# -*- coding: utf-8 -*-
"""守卫战新怪物外观验证(docs/40 P2 收尾):开战回执里的出场名单(后台副本阵容)带上候选怪后,
把场上一只活怪克隆成每只候选怪(冻结在网格里、不掉血),截图并记录每只的骨骼是否加载、idle/攻击/死亡动作是否解析到。
前置:候选怪已有 guard_kind 且在本关(MAIN_1_1)阵容里,服务端会下发它们的骨骼路径。
用法:PREVIEW_PORT=7460 python guard_monster_lineup_probe.py <tag> CODE1,CODE2,...  [915x412m]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1]
CODES = sys.argv[2].split(',')
VP = sys.argv[3] if len(sys.argv) > 3 else '915x412m'
mobile = VP.endswith('m')
W, H = [int(v) for v in VP.rstrip('m').split('x')]
SHOTS = os.path.join(base.SCRATCH, 'shots', 'tour')
os.makedirs(SHOTS, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle_release.js' if os.environ.get('PREVIEW_PORT') == '7460' else 'js_battle2.js'), encoding='utf-8').read()

PLACE = r"""(async (codes, bossMode) => {
  const sleep = ms => new Promise(z => setTimeout(z, ms));
  const r = window.__gr, root = window.__root, s = r.sim;
  for (let i = 0; i < 80 && !(s.monsters || []).length; i++) await sleep(250);
  const tmpl = s.monsters[0];
  if (!tmpl) return 'no live monster to clone';
  const roster = (root.currentLobbyBattleState().start.guardMonsters || []).filter(m => codes.indexOf(m.monsterCode) >= 0)
    .filter(m => bossMode ? m.guardKind === 'boss' : m.guardKind !== 'boss');
  if (window.__probeTimer) clearInterval(window.__probeTimer);
  // 场上原有怪与后续刷怪一律移除;英雄照常打,候选怪血量极大不会死
  window.__probeTimer = setInterval(() => { s.monsters = s.monsters.filter(m => m.monsterId >= 90000); s.monsters.forEach(m => { m.hp = m.maxHp; m.x = m.__px; m.speedCellsPerSec = 0; }); }, 200);
  s.monsters = [];
  await sleep(400);
  roster.forEach((m, i) => {
    const code = m.spineAsset.split('/')[2];
    const px = bossMode ? 6 : 2.6 + (i % 4) * 2.4;
    const lane = bossMode ? 2 : (i % 2 === 0 ? 1 : 3);
    s.monsters.push(Object.assign({}, tmpl, { monsterId: 90000 + i, kind: m.guardKind, spineCode: code, x: px, __px: px, lane,
      hp: 1e12, maxHp: 1e12, speedCellsPerSec: 0, dead: false, diedAtMs: 0, greedy: false, escaped: false }));
  });
  window.__probeRoster = roster.map((m, i) => ({ id: 90000 + i, code: m.monsterCode, name: m.monsterName, kind: m.guardKind }));
  return 'placed ' + roster.length;
})(__CODES__, __BOSS__)"""

STATE = r"""(() => { const r = window.__gr;
  return JSON.stringify((window.__probeRoster || []).map(p => { const v = r.monsterViews.get(p.id);
    const sk = v && v.skeleton; const anims = sk && sk.skeletonData ? (sk.skeletonData.getRuntimeData ? (sk.skeletonData.getRuntimeData().animations || []).length : -1) : 0;
    const box = v && v.node && v.node.isValid ? v.node.getComponentsInChildren('sp.Skeleton').length : 0;
    return { code: p.code, name: p.name, kind: p.kind, ready: !!(v && v.spineReady), idle: v && v.idleAnim, attack: v && v.attackAnim, death: v && v.deathAnim, anims };
  })); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=600):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('method') == 'Runtime.exceptionThrown':
                        d = x['params']['exceptionDetails']
                        print('  !! page exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:300], flush=True)
                    if x.get('id') == my:
                        return x

            async def ev(e, timeout=600):
                r = (await call('Runtime.evaluate', {'expression': e, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(SHOTS, f'{TAG}_{VP}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                print('shot', name, flush=True)

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            if mobile:
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT, 900))
            for _try in range(3):  # 首访整包预读期间点登录常被吞,失败就等一会儿重试
                res = await ev(base.JS_LOGIN, 120)
                print(res, flush=True)
                if 'view=lobby' in str(res):
                    break
                await asyncio.sleep(10)
            await asyncio.sleep(3)
            print('battle', await ev(JS_BATTLE, 300), flush=True)
            # 每批 4 只(BOSS 每批 1 只),逐批截图
            batches = [CODES[i:i + 4] for i in range(0, len(CODES), 4)]
            for bi, batch in enumerate(batches):
                for boss in (False, True):
                    res = await ev(PLACE.replace('__CODES__', json.dumps(batch)).replace('__BOSS__', 'true' if boss else 'false'), 120)
                    if not str(res).startswith('placed') or str(res) == 'placed 0':
                        continue
                    await asyncio.sleep(10)
                    print('batch', bi, 'boss' if boss else '', await ev(STATE), flush=True)
                    await shot(f'b{bi}{"boss" if boss else ""}')
    finally:
        proc.terminate()


asyncio.run(main())
