# -*- coding: utf-8 -*-
"""新手引导标记服务端存档 · 双设备小测(docs/57 §12,2026-11-25;编辑器预览 7456 + 本地游戏服 8081)。

两台「设备」= 两个全新的无头 Edge 配置目录(先后跑,一次只开一个),登同一个新号:
  准备:接口注册新号 → 建主角 → 契约之选(跳过新手流程,直接进村;序幕 / 觉醒的「待演」只记在建号那台设备上,不会出)
  设备 A:模拟接到 V04 → 第一次开终端出说明卡 → 点「知道了」→ 服务端有 intro:terminal
          → 终端进召唤出免费召唤强引导 → 跳过 → 服务端有 skip:V04(进召唤同时点掉「新」角标 → newseen:gacha;图鉴角标没点 → new:codex)
          → 点追踪条 → 服务端有 tracker_walk;本机待发队列为空
  设备 B:进大厅拉到服务端标记 → 本机兜底记录已合并 →「新」角标合并(白盒:点掉过的 gacha 不出、没点的 codex 出)
          → 开终端不再出说明卡 → 模拟接到 V04 进召唤,免费单抽在也不再出强引导(对照:去掉跳过标记就会出)
          → 没看过的背包说明卡照样出,点掉后服务端有 intro:bag
截图 / log 在 <输出目录>/device_a|device_b(默认 %TEMP%/lootchain-qa/guide_sync_<时间>);跑完按配置目录关掉无头 Edge。

用法:python tools/qa/guide_flag_sync_check.py [输出目录]
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import edge_guard  # noqa: E402

API = 'http://localhost:8081'
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
DEVICES = {
    'device_a': {'profile': 'guide_sync_profile_a', 'port': '9386'},
    'device_b': {'profile': 'guide_sync_profile_b', 'port': '9387'},
}

INJECT = [{
    'label': '注入会话',
    'js': "localStorage.setItem('lootchain.player.tokenName', 'satoken'); localStorage.setItem('lootchain.player.tokenValue', '{TOKEN}');"
          " localStorage.setItem('lootchain.player.userId', '{UID}'); setTimeout(() => location.reload(), 300); return 'set';",
    'wait': 3, 'shot': False,
}]

# 进大厅且这台设备已经拉过服务端标记(GuideFlagSync.pulledUid)
WAIT_LOBBY = ("let ready = false; for (let i = 0; i < 360; i++) { refresh(); if (root && view() === 'lobby' && !root.bootPreloadActive && t && t.isMounted && t.isMounted()"
              " && t.leaderPosition() && root.guideFlags && root.guideFlags.pulledUid === {UID}) { ready = true; break; } await sleep(500); }"
              " await sleep(3000); refresh(); return JSON.stringify({ ok: ready, view: view(), pulled: root.guideFlags ? root.guideFlags.pulledUid : null,"
              " known: root.guideFlags ? Array.from(root.guideFlags.known) : null, contract: !!root.contractPick, evo: !!root.evolutionPick });")

# 轮询服务端标记直到含 flag(上报是异步的)
def server_has(flag):
    return ("let server = []; for (let i = 0; i < 20; i++) { await sleep(500); server = await root.api.guide.flags(); if (server.includes('" + flag + "')) break; }")


SIM_V04 = ("const q = root.worldState.quests.find(x => x.code === 'V04'); q.state = 'ACCEPTED'; q.progress = 0;"
           " root.refreshLobbyViewPreservingBackground(); await sleep(3500);")

STEPS_A = [
    {'label': 'A等进大厅', 'js': WAIT_LOBBY + '', 'shot': False},
    {'label': 'A模拟接到V04', 'js': "refresh(); " + SIM_V04 + " return JSON.stringify({ ok: true, fresh: Array.from(root.featureUnlocks.fresh) });", 'shot': False},
    {'label': 'A第一次开终端_说明卡',
     'js': "refresh(); root.openLobbyTerminalPanel(); for (let i = 0; i < 30; i++) { await sleep(300); if (root.featureIntroOpen) break; } await sleep(600);"
           " return JSON.stringify({ ok: root.featureIntroOpen === 'terminal', intro: root.featureIntroOpen });"},
    {'label': 'A说明卡点知道了_上报',
     'js': "refresh(); const layer = root.node.getChildByName('LobbyFeatureIntroLayer'); let okBtn = null; if (layer) layer.walk(n => { if (!okBtn && n.name === 'Ok') okBtn = n; });"
           " tap(okBtn); " + server_has('intro:terminal') +
           " return JSON.stringify({ ok: !!okBtn && !root.featureIntroOpen && server.includes('intro:terminal'), tapped: !!okBtn, intro: root.featureIntroOpen, server,"
           " local: localStorage.getItem('lc_feature_intro_{UID}') });", 'shot': False},
    {'label': 'A终端进召唤_强引导',
     'js': "refresh(); root.runLobbyTerminalAction('gacha'); for (let i = 0; i < 40; i++) { await sleep(500); if (find('LobbyGuideOverlay')) break; } await sleep(1500);"
           " return JSON.stringify({ ok: !!find('LobbyGuideOverlay') && !!find('GuideSkip'), view: view(), free: root.gachaFreeSingleAvailable() });"},
    {'label': 'A跳过引导_上报',
     'js': "refresh(); tap(find('GuideSkip')); await sleep(800); const gone = !find('LobbyGuideOverlay'); " + server_has('skip:V04') +
           " return JSON.stringify({ ok: gone && root.storyGuideBlocked('V04') && server.includes('skip:V04') && server.includes('newseen:gacha'), gone, server });", 'shot': False},
    {'label': 'A回大厅点追踪条_上报',
     'js': "refresh(); root.closeGachaScene(); for (let i = 0; i < 20; i++) { await sleep(300); if (view() === 'lobby') break; } await sleep(2500);"
           " refresh(); root.closeLobbyTerminalPanel(); root.terminalReturn = null; await sleep(800); const had = !!find('AutoWalkHint');"
           " tap(find('LobbyWorldQuestTracker')); await sleep(1200); if (t.cancelAutoWalk) t.cancelAutoWalk(); const after = !!find('AutoWalkHint'); " + server_has('tracker_walk') +
           " return JSON.stringify({ ok: !after && server.includes('tracker_walk'), hadHint: had, hintAfter: after, server });"},
    {'label': 'A服务端标记齐全_待发队列空',
     'js': "await sleep(1500); const server = await root.api.guide.flags(); const want = ['intro:terminal', 'skip:V04', 'new:gacha', 'new:codex', 'newseen:gacha', 'tracker_walk'];"
           " const outbox = localStorage.getItem('lc_guide_outbox_{UID}');"
           " return JSON.stringify({ ok: want.every(f => server.includes(f)) && outbox === null, missing: want.filter(f => !server.includes(f)), server, outbox });", 'shot': False},
]

STEPS_B = [
    {'label': 'B等进大厅_拉到标记',
     'js': WAIT_LOBBY.replace("return JSON.stringify({ ok: ready,", "const want = ['intro:terminal', 'skip:V04', 'tracker_walk', 'newseen:gacha', 'new:codex'];"
                              " return JSON.stringify({ ok: ready && want.every(f => root.guideFlags.has(f)),"), 'shot': False},
    {'label': 'B本机兜底已合并',
     'js': "refresh(); const intro = JSON.parse(localStorage.getItem('lc_feature_intro_{UID}') || '[]'); const skip = localStorage.getItem('lc_story_guide_skip_{UID}_V04');"
           " const walk = localStorage.getItem('lc_tracker_walk_{UID}');"
           " return JSON.stringify({ ok: intro.includes('terminal') && skip === '1' && walk === '1' && t.questTrackerUsed() === true && !find('AutoWalkHint'),"
           " intro, skip, walk, trackerUsed: t.questTrackerUsed(), hint: !!find('AutoWalkHint') });"},
    {'label': 'B新角标合并_白盒',
     'js': "refresh(); const u = root.featureUnlocks; const had = { gacha: !!(u.baseline && u.baseline.has('gacha')), codex: !!(u.baseline && u.baseline.has('codex')) };"
           # 这台设备上 V04 还没到(召唤 / 图鉴没开):假设它们开着,把服务端角标重合一次 —— 点掉过的 gacha 不该出,别处挂着没点的 codex 该出
           " if (u.baseline) { u.baseline.add('gacha'); u.baseline.add('codex'); } u.fresh.add('gacha'); u.mergedVersion = -1;"
           " const gachaFresh = u.isFresh('gacha'); const codexFresh = u.isFresh('codex');"
           " u.fresh.delete('codex'); u.fresh.delete('gacha'); if (u.baseline && !had.gacha) u.baseline.delete('gacha'); if (u.baseline && !had.codex) u.baseline.delete('codex'); u.saveFresh();"
           " return JSON.stringify({ ok: !!u.baseline && !gachaFresh && codexFresh, gachaFresh, codexFresh, baselineHad: had });", 'shot': False},
    {'label': 'B开终端不出说明卡',
     'js': "refresh(); root.openLobbyTerminalPanel(); await sleep(3500);"
           " return JSON.stringify({ ok: root.lobbyTerminalOpen && !root.featureIntroOpen && !root.featureIntroPending, terminal: root.lobbyTerminalOpen, intro: root.featureIntroOpen });"},
    {'label': 'B模拟V04进召唤_不出强引导',
     'js': "refresh(); root.closeLobbyTerminalPanel(); root.terminalReturn = null; await sleep(800); " + SIM_V04 +
           " refresh(); root.openLobbyTerminalPanel(); await sleep(1500); root.runLobbyTerminalAction('gacha');"
           " for (let i = 0; i < 40; i++) { await sleep(500); if (view() === 'gacha' && root.gachaFreeSingleAvailable() === true) break; } await sleep(3000);"
           " return JSON.stringify({ ok: view() === 'gacha' && root.gachaFreeSingleAvailable() === true && !find('LobbyGuideOverlay') && root.storyGuideBlocked('V04'),"
           " view: view(), free: root.gachaFreeSingleAvailable(), guide: !!find('LobbyGuideOverlay'), blocked: root.storyGuideBlocked('V04') });"},
    {'label': 'B对照_去掉跳过标记就会出',
     'js': "refresh(); root.guideFlags.known.delete('skip:V04'); localStorage.removeItem('lc_story_guide_skip_{UID}_V04'); root.storyGuideDone.clear(); root.renderCurrentView();"
           " for (let i = 0; i < 20; i++) { await sleep(400); if (find('LobbyGuideOverlay')) break; } const shown = !!find('LobbyGuideOverlay');"
           " root.guideFlags.known.add('skip:V04'); localStorage.setItem('lc_story_guide_skip_{UID}_V04', '1'); root.renderCurrentView(); await sleep(1500);"
           " return JSON.stringify({ ok: shown && !find('LobbyGuideOverlay'), controlShown: shown, afterRestore: !!find('LobbyGuideOverlay') });", 'shot': False},
    {'label': 'B没看过的背包说明卡照出_上报',
     'js': "refresh(); root.closeGachaScene(); for (let i = 0; i < 20; i++) { await sleep(300); if (view() === 'lobby') break; } await sleep(2500);"
           " refresh(); root.closeLobbyTerminalPanel(); root.terminalReturn = null; root.openLobbyBagPanel(); for (let i = 0; i < 30; i++) { await sleep(300); if (root.featureIntroOpen) break; }"
           " await sleep(700); const bag = root.featureIntroOpen; root.dismissFeatureIntroCard(true); " + server_has('intro:bag') +
           " root.returnToLobbyFromScenePage(); await sleep(1200); const outbox = localStorage.getItem('lc_guide_outbox_{UID}');"
           " return JSON.stringify({ ok: bag === 'bag' && server.includes('intro:bag') && outbox === null, bag, server, outbox });"},
]


def call(path, token=None, body=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['satoken'] = token
    req = urllib.request.Request(API + path, method='POST' if body is not None else 'GET',
                                 data=json.dumps(body).encode('utf-8') if body is not None else None, headers=headers)
    data = json.load(urllib.request.urlopen(req, timeout=15))
    if data.get('code') != 0:
        raise SystemExit(f'{path} 失败: {data}')
    return data.get('data')


def prepare_account():
    stamp = time.strftime('%m%d%H%M%S')
    reg = call('/api/player/auth/register', body={'username': 'gs' + stamp, 'password': 'pass1234', 'nickname': None})
    token, uid = reg['tokenValue'], reg['userId']
    call('/api/player/protagonist', token, {'gender': 'male', 'protagonistName': 'gs' + stamp})
    contract = call('/api/player/starter/contract', token)
    if not contract.get('picked'):
        call('/api/player/starter/contract', token, {'heroCode': contract['candidates'][0]['heroCode']})
    flags = call('/api/player/guide/flags', token)['flags']
    if flags:
        raise SystemExit('新号服务端已有引导标记: ' + str(flags))
    return token, uid


def write_steps(path, steps, token, uid):
    text = json.dumps(steps, ensure_ascii=False, indent=1).replace('{TOKEN}', token).replace('{UID}', str(uid))
    open(path, 'w', encoding='utf-8').write(text)
    return path


def run_device(name, out_dir, token, uid, steps):
    dev = DEVICES[name]
    env = dict(os.environ, PREVIEW_PORT='7456', PT_PROFILE=dev['profile'], EDGE_PORT=dev['port'], PYTHONIOENCODING='utf-8')
    os.makedirs(out_dir, exist_ok=True)
    runner = os.path.join(HERE, 'playtest_cdp.py')
    inject = write_steps(os.path.join(out_dir, '_inject.json'), INJECT, token, uid)
    main_steps = write_steps(os.path.join(out_dir, '_steps.json'), steps, token, uid)
    print('>>', name, '全新配置注入会话', flush=True)
    subprocess.run([sys.executable, runner, out_dir, inject, '--fresh', '--keep'], env=env, check=False)
    print('>>', name, '跑步骤', flush=True)
    subprocess.run([sys.executable, runner, out_dir, main_steps], env=env, check=False)   # 不带 --keep:跑完关掉这台设备
    edge_guard.kill_profiles([os.path.join(SCRATCH, dev['profile'])])
    results = []
    for line in open(os.path.join(out_dir, 'log.jsonl'), encoding='utf-8'):
        rec = json.loads(line)
        if rec.get('step') == '注入会话':
            continue
        try:
            res = json.loads(rec.get('result') or '{}')
        except (TypeError, ValueError):
            res = {'raw': rec.get('result')}
        results.append((rec.get('step'), bool(res.get('ok')) if isinstance(res, dict) else False, res))
    return results


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = args[0] if args else os.path.join(SCRATCH, 'guide_sync_' + time.strftime('%m%d_%H%M'))
    os.makedirs(out_dir, exist_ok=True)
    token, uid = prepare_account()
    print('新号 uid', uid, flush=True)
    all_results = []
    try:
        for name, steps in (('device_a', STEPS_A), ('device_b', STEPS_B)):
            results = run_device(name, os.path.join(out_dir, name), token, uid, steps)
            all_results.extend(results)
            if len(results) < len(steps):
                print(f'{name} 只跑完 {len(results)}/{len(steps)} 步', flush=True)
                all_results.append((name + ' 步骤没跑完', False, {}))
                break
    finally:
        edge_guard.kill_profiles([os.path.join(SCRATCH, d['profile']) for d in DEVICES.values()])
    final = call('/api/player/guide/flags', token)['flags']
    print('\n==== 结果 ====')
    for step, ok, res in all_results:
        print(('PASS ' if ok else 'FAIL ') + str(step) + ('' if ok else '  ' + json.dumps(res, ensure_ascii=False)[:600]))
    print('服务端最终标记:', final)
    failed = [s for s, ok, _ in all_results if not ok]
    print('全部通过' if not failed else f'{len(failed)} 项失败', '| 输出', out_dir)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
