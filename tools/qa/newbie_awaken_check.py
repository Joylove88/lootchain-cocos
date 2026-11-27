# -*- coding: utf-8 -*-
"""新号正常开局回归(2026-11-27):主角骨骼换 Lucius 底后没有 down_end,觉醒演出永远不开演 → 契约之选不弹(线上 P0)。
不带任何开关:本地注册新号 → 建角 → 觉醒演出(躺地 → 起身)→ 契约之选弹出 → 订立 → 名册里有契约伙伴。

用法:python tools/qa/newbie_awaken_check.py [输出目录] [--pc]
要求编辑器预览 7456 + 本地游戏服 8081;无头 Edge 一次只开一个,跑完按配置目录关(复用 opening_v2_shots 的注册 / 注入写法)。
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import edge_guard  # noqa: E402
import opening_v2_shots as ov  # noqa: E402  复用 register()

SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
PC = '--pc' in sys.argv
PROFILE_NAME = 'playtest_profile_awaken'
ENV = dict(os.environ, PREVIEW_PORT='7456', PT_PROFILE=PROFILE_NAME, EDGE_PORT='9387', PYTHONIOENCODING='utf-8', PAGE_QS='')


def steps():
    s = []
    s.append({'label': '等创建页', 'js': "for (let i = 0; i < 300; i++) { refresh(); if (root && (view() === 'protagonistCreate' || view() === 'lobby')) break; await sleep(500); } return view();", 'wait': 1, 'shot': True})
    s.append({'label': '建角_等觉醒开演',
              'js': "refresh(); const nm = '测' + String(Date.now()).slice(-6); const f = root.protagonistCreateFlow; f.setNameDraft(nm); if (f.nameInput) f.nameInput.string = nm; root.submitProtagonistCreate(); let ok = false; for (let i = 0; i < 160; i++) { await sleep(250); refresh(); if (root.awakenCinematic && root.awakenCinematic.active) { ok = true; break; } }"
                    " const L = t && t.leader; return JSON.stringify({ awakenActive: ok, ready: !!(t && t.awakenStageReady && t.awakenStageReady()), anim: L && L.anim, view: view() });",
              'wait': 0.6, 'shot': True})
    s.append({'label': '觉醒中段', 'js': "await sleep(3500); const L = t && t.leader; return JSON.stringify({ active: root.awakenCinematic.active, anim: L && L.anim });", 'shot': True})
    s.append({'label': '觉醒结束_等契约之选',
              'js': "let taps = 0; for (let i = 0; i < 60 && root.awakenCinematic.active; i++) { await sleep(900); const c = root.awakenCinematic; if (c.phase === 'talk') { c.nextLine(); taps++; } }"
                    " let pick = false; for (let i = 0; i < 160; i++) { await sleep(300); refresh(); if (root.contractPick) { pick = true; break; } }"
                    " return JSON.stringify({ taps, contract: pick, awakenActive: root.awakenCinematic.active, n: root.contractPick ? root.contractPick.candidates.length : 0 });",
              'wait': 1.2, 'shot': True})
    s.append({'label': '订立契约',
              'js': "refresh(); if (!root.contractPick) return 'no contract'; root.selectStarterContract(root.contractPick.candidates[0].heroCode); await sleep(600); await root.confirmStarterContract();"
                    " for (let i = 0; i < 40; i++) { await sleep(300); if (!root.contractPick) break; } refresh(); return JSON.stringify({ party: t.resolveParty().map(h => h.heroCode), contractOpen: !!root.contractPick });",
              'wait': 1.5, 'shot': True})
    return s


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = args[0] if args else os.path.join(SCRATCH, 'newbie_awaken_' + time.strftime('%m%d_%H%M'))
    os.makedirs(out_dir, exist_ok=True)
    name, token, uid = ov.register()
    print('新号', name, 'uid', uid, flush=True)
    # 序幕视频看过标记先写上(这里只验觉醒 → 契约之选,视频另有自验)
    inject = [{'label': '注入新号会话', 'js': "localStorage.setItem('lootchain.player.tokenName', 'satoken'); localStorage.setItem('lootchain.player.tokenValue', '%s');"
                                            " localStorage.setItem('lootchain.player.userId', '%s'); localStorage.setItem('lootchain.prologue.seen.%s', '1');"
                                            " setTimeout(() => location.reload(), 300); return 'set';" % (token, uid, uid), 'wait': 3, 'shot': False}]
    p_inject = os.path.join(out_dir, '_inject.json')
    p_steps = os.path.join(out_dir, '_awaken.json')
    json.dump(inject, open(p_inject, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(steps(), open(p_steps, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cmd = lambda p, *f: [sys.executable, os.path.join(HERE, 'playtest_cdp.py'), out_dir, p, *f] + (['--pc'] if PC else [])
    try:
        subprocess.run(cmd(p_inject, '--fresh', '--keep'), env=ENV, check=False)
        subprocess.run(cmd(p_steps, '--keep'), env=ENV, check=False)
    finally:
        edge_guard.kill_profiles([os.path.join(SCRATCH, PROFILE_NAME)])
    print('结果:', out_dir, flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
