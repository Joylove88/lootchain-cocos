# -*- coding: utf-8 -*-
"""开局爽感原型(?opening=v2)一键自验 + 关键帧 + 录屏(2026-11-27,docs/开局爽感原型方案.md)。

流程:本地注册新号 → 带 ?opening=v2 写会话刷新 → 建角(计时:点确认到开打)→ 前世一战(页面里挂自动打的脚本,
到点截关键帧:开场 / 满屏大招 / 援护大招 / 连杀 / 紫橙光柱 / 精英 / 首领读条 / 主角正面命中 / 胜利)→ 黑场收尾 → 回村
→ 契约之选 → 订立后 Lv.1 正常开局(核对:没演觉醒 / 没播序幕 / 没出移动教学、名册只有主角 + 契约伙伴、等级 1)。
全程屏幕流录像 → <输出目录>/rec.mp4。

用法:python tools/qa/opening_v2_shots.py [输出目录] [--pc] [--release]
  默认手机横屏 1200×540@2x;--pc = 电脑 1600×900。编辑器预览 7456 + 本地游戏服 8081;无头 Edge 一次只开一个,跑完按配置目录关。
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
PC = '--pc' in sys.argv
RELEASE = '--release' in sys.argv  # 本地正式包 7460(出包后验证;全新配置会先下开局包)
PROFILE_NAME = 'playtest_profile_opening' + ('_rel' if RELEASE else '')
ENV = dict(os.environ, PREVIEW_PORT='7460' if RELEASE else '7456', PT_PROFILE=PROFILE_NAME, EDGE_PORT=('9396' if RELEASE else '9386'), PYTHONIOENCODING='utf-8', PAGE_QS='?opening=v2')

# 页面里的自动打:最近的怪远就推摇杆过去,近了普攻 + 技能(大招 / 援护留给关键帧步骤手动放,window.__holdUlt)
AUTO = r"""
if (window.__autoTimer) clearInterval(window.__autoTimer);
window.__holdUlt = true;
window.__autoTimer = setInterval(() => {
  const r = window.__root; const t = r && r.lobbyTownRenderer; if (!t) return;
  const op = t.opening; const L = t.leader;
  if (!op || op.over || !L) { if (t.joy) t.joy.active = false; return; }
  const alive = t.monsters.filter(m => !m.dead && m.node.isValid);
  if (!alive.length) { t.joy.active = false; return; }
  let best = null, bd = 1e9;
  for (const m of alive) { const d = Math.hypot(m.x - L.x, (m.y - L.y) * 1.4); if (d < bd) { bd = d; best = m; } }
  if (bd > 190) { const dx = best.x - L.x, dy = best.y - L.y, len = Math.hypot(dx, dy) || 1; t.joy = { active: true, id: 99, dx: dx / len, dy: dy / len }; }
  else t.joy = { active: false, id: -1, dx: 0, dy: 0 };
  if (bd < 320) {
    const now = Date.now();
    if (!window.__holdUlt && now >= t.ultReadyAt) t.leaderRealmUlt();
    for (let i = 0; i < 3; i++) if (now >= t.skillReadyAt[i]) { t.leaderSkill(i); break; }
    t.leaderAttack();
    if (!window.__holdUlt) t.followers.forEach((a, i) => { if (now >= a.assistReadyAt) t.triggerAssist(i); });
  }
}, 110);
"""

STATE = r"""const op = t && t.opening; const L = t && t.leader;
const st = op ? { wave: op.wave, elapsed: Math.round((Date.now() - op.startedAt) / 1000), kills: t.openingHud.kills, combo: t.openingHud.combo, best: t.openingHud.best,
  alive: t.monsters.filter(m => !m.dead).length, hp: Math.round(t.leaderHp / Math.max(1, t.leaderMaxHp) * 100), loot: op.loot, over: op.over,
  party: t.followers.map(a => a.hero.heroCode), lead: L && L.hero.spineAsset } : { phase: root.openingPhase };"""


def near(n, r):
    return f"t.monsters.filter(m => !m.dead && t.leader && Math.hypot(m.x - t.leader.x, (m.y - t.leader.y) * 1.4) < {r}).length >= {n}"


def steps():
    s = []
    s.append({'label': '等创建页', 'js': "for (let i = 0; i < 300; i++) { refresh(); if (root && (view() === 'protagonistCreate' || view() === 'lobby')) break; await sleep(500); } return view() + ' ' + location.search;", 'wait': 1, 'shot': True})
    s.append({'label': '建角到开打', 'rec_start': True,
              'js': "refresh(); const nm = '原' + String(Date.now()).slice(-6); const f = root.protagonistCreateFlow; f.setNameDraft(nm); if (f.nameInput) f.nameInput.string = nm; window.__t0 = Date.now(); root.submitProtagonistCreate(); let ok = false; for (let i = 0; i < 240; i++) { await sleep(250); refresh(); if (t && t.isOpeningActive && t.isOpeningActive()) { ok = true; break; } }"
                    " const ms = Date.now() - window.__t0; return JSON.stringify({ ok, msToFight: ms, prologue: !!document.getElementById('lootchain-prologue'), awaken: !!(root.awakenCinematic && root.awakenCinematic.active), pending: localStorage.getItem('lootchain.awaken.pending.' + root.api.tokenStore.userId()) });",
              'wait': 0.4, 'shot': True})
    s.append({'label': '零开场台词', 'js': "await sleep(1200); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '第一波涌来', 'js': AUTO + " for (let i = 0; i < 40; i++) { await sleep(250); if (t.opening && t.opening.wave >= 0) break; } await sleep(1600); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '一刀清一片_连杀', 'js': "for (let i = 0; i < 120; i++) { await sleep(250); if (t.openingHud.combo >= 8) break; } " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '夜帝残影满屏', 'js': f"for (let i = 0; i < 120; i++) {{ await sleep(200); if (Date.now() >= t.ultReadyAt && {near(5, 520)}) break; }} t.leaderRealmUlt(); await sleep(560); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '援护大招_奥蕾莉亚', 'js': f"await sleep(1200); for (let i = 0; i < 120; i++) {{ await sleep(200); if (t.followers[0] && Date.now() >= t.followers[0].assistReadyAt && {near(3, 700)}) break; }} t.triggerAssist(0); await sleep(900); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '援护大招_伊芙琳', 'js': f"await sleep(600); for (let i = 0; i < 120; i++) {{ await sleep(200); if (t.followers[1] && Date.now() >= t.followers[1].assistReadyAt && {near(2, 700)}) break; }} t.triggerAssist(1); await sleep(900); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '放开自动_大招援护全开', 'js': "window.__holdUlt = false; await sleep(5000); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '紫橙光柱', 'js': "for (let i = 0; i < 300; i++) { await sleep(100); if (find('OpeningDrop_purple') || find('OpeningDrop_orange')) break; } await sleep(250); " + STATE + " return JSON.stringify(Object.assign(st, { purple: !!find('OpeningDrop_purple'), orange: !!find('OpeningDrop_orange') }));", 'shot': True})
    s.append({'label': '主角正面命中帧', 'js': "for (let i = 0; i < 100; i++) { await sleep(100); const L = t.leader; if (L && t.monsters.some(m => !m.dead && Math.abs(m.y - L.y) < 80 && Math.abs(m.x - L.x) < 220)) break; } window.__holdUlt = true; t.leaderAttack(); await sleep(330); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '精英来袭', 'js': "window.__holdUlt = false; for (let i = 0; i < 400; i++) { await sleep(250); if (t.opening && t.opening.wave >= 3) break; } await sleep(2500); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '首领登场', 'js': "for (let i = 0; i < 600; i++) { await sleep(250); if (!t.opening || t.opening.wave >= 5) break; } await sleep(1200); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '首领读条红圈', 'js': "window.__holdUlt = true; let boss = null; for (let i = 0; i < 300; i++) { await sleep(100); boss = t.monsters.find(m => !m.dead && m.camp.stageCode.endsWith('_B')); if (!boss || boss.castUntil > Date.now() + 300) break; } await sleep(400); window.__holdUlt = false; " + STATE + " return JSON.stringify(Object.assign(st, { casting: !!(boss && boss.castUntil > 0) }));", 'shot': True})
    s.append({'label': '胜利', 'js': "for (let i = 0; i < 1200; i++) { await sleep(250); if (!t.opening || t.opening.over) break; } await sleep(700); " + STATE + " return JSON.stringify(st);", 'shot': True})
    s.append({'label': '收尾黑场一句话', 'js': "for (let i = 0; i < 80; i++) { await sleep(100); if (root.openingPhase === 'ending') break; } await sleep(1600); return root.openingPhase;", 'shot': True})
    s.append({'label': '回到村里', 'js': "if (window.__autoTimer) clearInterval(window.__autoTimer); for (let i = 0; i < 100; i++) { await sleep(200); if (root.openingPhase === 'idle') break; } await sleep(1500); refresh();"
                    " return JSON.stringify({ phase: root.openingPhase, map: t.currentMapCode(), party: t.resolveParty().map(h => h.heroCode), done: localStorage.getItem('lc_opening_v2_done_' + root.api.tokenStore.userId()), level: root.currentLobbyProfile().playerLevel });", 'shot': True})
    s.append({'label': '契约之选', 'rec_stop': True, 'js': "for (let i = 0; i < 100; i++) { await sleep(300); if (root.contractPick) break; } await sleep(1200); return JSON.stringify({ contract: !!root.contractPick, n: root.contractPick ? root.contractPick.candidates.length : 0 });", 'shot': True})
    s.append({'label': '订立后_Lv1正常开局', 'js': "refresh(); if (root.contractPick) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await sleep(600); root.confirmStarterContract(); } for (let i = 0; i < 60; i++) { if (!root.contractPick) break; await sleep(500); } await sleep(5000); refresh();"
                    " return JSON.stringify({ party: t.resolveParty().map(h => h.heroCode), level: root.currentLobbyProfile().playerLevel, moveGuide: t.moveGuideActive(), awaken: root.awakenCinematic.active, prologue: !!document.getElementById('lootchain-prologue'), queue: root.popupQueue.size, icons: (find('LobbySystemIcons') || { children: [] }).children.map(c => c.name) });", 'shot': True})
    # 方案 F:真实野外掉落按品质上色(直调表现层,奖励不变;林地实打要先走剧情,这里只验表现)
    s.append({'label': 'F_真实掉落上色', 'js': "refresh(); const L = t.leader; const pos = [{ x: L.x + 220, y: L.y + 40 }, { x: L.x + 300, y: L.y - 60 }, { x: L.x + 160, y: L.y - 90 }];"
                    " t.playKillDrops([{ index: 0, items: [{ code: 'LOW_ENHANCE_STONE', name: '初级强化石', amount: 1 }] }, { index: 1, items: [{ code: 'HERO_EXP_BOOK', name: '英雄经验书', amount: 1 }] }, { index: 2, items: [{ code: 'GOLD', name: '金币', amount: 84 }] }], pos);"
                    " await sleep(650); return JSON.stringify({ drops: ['OpeningDrop_blue', 'OpeningDrop_green', 'OpeningDrop_white'].map(n => !!find(n)) });", 'shot': True})
    return s


def register():
    name = 'op' + time.strftime('%m%d%H%M%S')
    req = urllib.request.Request(API + '/api/player/auth/register', method='POST',
                                 data=json.dumps({'username': name, 'password': 'pass1234', 'nickname': None}).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    data = json.load(urllib.request.urlopen(req, timeout=15))
    if data.get('code') != 0:
        raise SystemExit('注册失败: ' + str(data))
    return name, data['data']['tokenValue'], data['data']['userId']


def run(out_dir, steps_path, *flags):
    cmd = [sys.executable, os.path.join(HERE, 'playtest_cdp.py'), out_dir, steps_path, *flags] + (['--pc'] if PC else [])
    print('>>', os.path.basename(steps_path), *flags, flush=True)
    subprocess.run(cmd, env=ENV, check=False)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = args[0] if args else os.path.join(SCRATCH, 'opening_v2_' + time.strftime('%m%d_%H%M'))
    os.makedirs(out_dir, exist_ok=True)
    name, token, uid = register()
    print('新号', name, 'uid', uid, flush=True)
    inject = [{'label': '注入新号会话', 'js': "localStorage.setItem('lootchain.player.tokenName', 'satoken'); localStorage.setItem('lootchain.player.tokenValue', '%s');"
                                            " localStorage.setItem('lootchain.player.userId', '%s'); setTimeout(() => location.reload(), 300); return 'set';" % (token, uid), 'wait': 3, 'shot': False}]
    p_inject = os.path.join(out_dir, '_inject.json')
    p_steps = os.path.join(out_dir, '_opening.json')
    json.dump(inject, open(p_inject, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(steps(), open(p_steps, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    try:
        run(out_dir, p_inject, '--fresh', '--keep')
        run(out_dir, p_steps, '--keep')
    finally:
        edge_guard.kill_profiles([os.path.join(SCRATCH, PROFILE_NAME)])
    rec = os.path.join(out_dir, 'rec')
    if os.path.isdir(rec) and len(os.listdir(rec)) > 2:
        subprocess.run([sys.executable, os.path.join(HERE, 'rec_to_mp4.py'), rec, os.path.join(out_dir, 'rec.mp4')], check=False)
    print('结果:', out_dir, flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
