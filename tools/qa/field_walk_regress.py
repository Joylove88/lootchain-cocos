# -*- coding: utf-8 -*-
"""野外寻路 / 战斗中寻路回归(2026-11-23 策划通玩阻断修复后的引擎实跑):用游戏自己的渲染器 / 寻路器 / 挡块真走,不注入工作区代码。

  python tools/qa/field_walk_regress.py [--release] [--only 祭坛,训练场,林地,石桥,战斗] [--keep]
  默认跑编辑器预览 7456(要先开 Creator,改完代码 asset-db/refresh 后等预览 chunk 更新);--release 跑本地正式包 7460(= 上线前的包)。
  每次都 --fresh 新配置(预览的配置目录会缓存旧 chunk)。账号 guidetest05 / pass1234(本地库测试号)。

走的线(看「离目标」和「重规划峰值」:离目标 < 100、重规划 0 = 正常;战斗类看说明):
  祭坛  出生点 → 祭司莉娅(应出现「对话 · 祭司 · 莉娅」)、莉娅 → 祭坛门口 → 木桥西头 → 出生点、祭坛土路东头 → 莉娅
  训练场 出生点 / 场外 / 门口 → 稻草靶、场里 → 门外、场里 → 林地出口(换图)
  林地  瀑布下浅溪南岸放开范围可走采样应全可走,南边走进去
  石桥  荒原 (-4672,234) → (-1984,-2496)、(-6416,-873) 向东过峡谷石桥(最近经过 -3175,-510 应 < 150)
  战斗  荒原弓手营 FIELD_GRAY_3:脱战时点寻路走向弓手 → 进战斗那一刻寻路取消;战斗中点寻路回出生点 → 一直在走;
        营外 800 左右站着(交战怪在 900 内但没人追)→ 约 7 秒内脱战且之后不闪回战斗中
产物:%TEMP%/lootchain-qa/field_walk_regress/NN_*.png + log.jsonl + exceptions.txt;终端打印每步结果。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
OUT = os.path.join(QA, 'field_walk_regress')

LOGIN = r"""for (let i = 0; i < 240; i++) { refresh(); if (root && ['login', 'loginAccount', 'lobby'].includes(view())) break; await sleep(500); }
if (view() !== 'lobby') { for (let i = 0; i < 240 && texts(20).some(s => s.includes('正在下载') || s.includes('正在加载')); i++) await sleep(500);
  root.loginFlow.setInputs({ string: 'guidetest05' }, { string: 'pass1234' }); try { root.loginFlow.acceptedAgreement = true; } catch (e) {} root.run(() => root.loginFlow.login()); }
for (let i = 0; i < 300; i++) { refresh(); if (view() === 'lobby' && t && t.isMounted && t.isMounted()) break; await sleep(500); }
await sleep(3000); refresh(); return view() + ' @' + (t && t.def ? t.def.code : '?');"""

# 公共:进图 / 瞬移(队友排在 side 一侧)/ 自动寻路走到底(被进战斗打断就在战斗中再点一次,和玩家一样)
C = r"""
refresh();
const enter = async (CODE) => { if (t.def.code !== CODE) { t.enterMap(CODE); root.renderCurrentView(); for (let i = 0; i < 80; i++) { await sleep(500); refresh(); if (t.def.code === CODE && t.isMounted()) break; } await sleep(3000); refresh(); } };
const warp = (x, y, side) => { const L = t.leader; const s = side || -1; if (t.host.reportWorldPosition) t.host.reportWorldPosition('warp', t.mapCode, Math.round(x), Math.round(y));
  [L, ...t.followers].forEach((a, i) => { a.x = x + s * i * 40; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x, y)]; t.autoPath = null; t.autoGoal = null; t.applyCamera(true); };
const P = (o) => Math.round(o.x) + ',' + Math.round(o.y);
const st = () => (t.inCombat ? '战斗中' : '脱战');
const walk = async (sx, sy, x, y, tag, limitSec, stopFn, probe) => {
  if (sx !== null) { warp(sx, sy); await sleep(800); refresh(); }
  const hp0 = t.leaderHp; const t0 = Date.now(); const L0 = { x: t.leader.x, y: t.leader.y };
  let ok = t.autoWalkTo(x, y); const pts = t.autoPath ? t.autoPath.length : 0; let rp = 0, cuts = 0, near = 1e9, stopped = false;
  while (Date.now() - t0 < (limitSec || 60) * 1000) {
    await sleep(250); refresh(); if (t.leaderHp < hp0) t.leaderHp = hp0;
    if (t.autoProbe) rp = Math.max(rp, t.autoProbe.replans);
    if (probe) near = Math.min(near, Math.hypot(t.leader.x - probe[0], t.leader.y - probe[1]));
    if (stopFn && stopFn()) { stopped = true; break; }
    if (!t.autoPath) { const d = Math.hypot(t.leader.x - x, t.leader.y - y); if (d > 140 && t.inCombat && cuts < 3) { cuts++; ok = t.autoWalkTo(x, y) && ok; continue; } break; }
  }
  refresh(); const d = Math.hypot(t.leader.x - x, t.leader.y - y);
  return tag + ' | 寻路=' + ok + ' 折点 ' + pts + ' | ' + P(L0) + ' → ' + P(t.leader) + ' 离目标 ' + Math.round(d) + ' | ' + ((Date.now() - t0) / 1000).toFixed(1) + 's 重规划峰值 ' + rp
    + (cuts ? ' | 进战斗被打断后重点 ' + cuts + ' 次' : '') + (probe ? ' | 最近经过 (' + probe.join(',') + ') ' + Math.round(near) : '') + (stopped ? ' | 到检查点停' : t.autoPath ? ' | 超时仍在走' : '');
};
"""

ALTAR = C + r"""
await enter('VILLAGE'); t.pathfinder = null; t.pathfinderMap = null;
const npc = t.def.npcs.find(n => n.code === 'PRIEST'); const altar = t.def.buildings.find(b => b.key === 'altar');
const out = [await walk(t.def.spawn.x, t.def.spawn.y, npc.x, npc.y, '出生点 → 祭司莉娅', 70)];
await sleep(1200); refresh();
out.push('莉娅身边可交互:' + JSON.stringify(buttons(40).filter(s => /莉娅|祭司|祭坛/.test(s)).slice(0, 3)));
out.push(await walk(null, null, altar.x + altar.door.x, altar.y + altar.door.y, '莉娅 → 圣契祭坛门口', 30));
out.push(await walk(null, null, -500, 250, '祭坛门口 → 木桥西头', 40));
out.push(await walk(null, null, t.def.spawn.x, t.def.spawn.y, '木桥西头 → 出生点', 70));
out.push(await walk(-1100, 520, npc.x + 40, npc.y - 40, '祭坛土路东头(-1100,520) → 莉娅', 30));
return out.join('\n');
"""

TRAINING = C + r"""
await enter('VILLAGE'); t.pathfinder = null; t.pathfinderMap = null;
const dm = t.monsters.filter(m => m.camp && m.camp.dummy)[0]; const sp = t.def.spawn; const ex = t.def.exits.find(e => e.toMap === 'WOODS');
const out = [];
out.push(await walk(sp.x, sp.y, dm.x - 90, dm.y, '出生点 → 稻草靶', 80));
out.push(await walk(970, 786, dm.x - 90, dm.y, '(970,786) → 稻草靶', 60));
out.push(await walk(1460, 760, 1200, 420, '场里 → 门外', 60));
out.push(await walk(1350, 450, dm.x - 90, dm.y, '门口 → 场里', 60));
out.push(await walk(dm.x - 90, dm.y, ex.x, ex.y, '场里 → 林地出口', 90, () => t.def.code !== 'VILLAGE'));
for (let i = 0; i < 40; i++) { refresh(); if (t.def.code === 'WOODS' && t.isMounted()) break; await sleep(500); }
out.push('出口后所在地图 ' + t.def.code);
return out.join('\n');
"""

WOODS = C + r"""
await enter('WOODS'); t.pathfinder = null; t.pathfinderMap = null;
const Z = [-2260, -1540, -2010, -1374]; let open = 0, n = 0;
for (let x = Z[0] + 10; x <= Z[2] - 10; x += 20) for (let y = Z[1] + 10; y <= Z[3] - 10; y += 20) { n++; if (t.walkable(x, y)) open++; }
const out = ['浅溪南岸放开范围内可走采样 ' + open + '/' + n];
const st0 = [[-2130, -1750], [-1900, -1650], [-2400, -1700], [-1800, -1450]].find(c => t.walkable(c[0], c[1]));
if (!st0) return out.concat('附近找不到可走起点').join('\n');
out.push(await walk(st0[0], st0[1], -2130, -1440, '(' + st0.join(',') + ') → 浅溪南岸草地 (-2130,-1440)', 40));
out.push(await walk(null, null, -2240, -1400, '南岸草地 → 西头 (-2240,-1400)', 20));
return out.join('\n');
"""

BRIDGE = C + r"""
await enter('GRAY'); t.pathfinder = null; t.pathfinderMap = null;
const out = [];
out.push(await walk(-4672, 234, -1984, -2496, '(-4672,234) → (-1984,-2496)', 50, null, [-3175, -510]));
out.push(await walk(-6416, -873, 5205, 2268, '(-6416,-873) → 东边,过峡谷石桥即停', 50, () => t.leader.x > -2300, [-3175, -510]));
return out.join('\n');
"""

COMBAT = C + r"""
const STAGE = 'FIELD_GRAY_3', P0 = { x: 2900, y: -2663 };
const mine = () => t.monsters.filter(m => !m.dead && m.camp.stageCode === STAGE);
const engaged = () => t.monsters.filter(m => !m.dead && t.encounters.has(m.camp.stageCode));
const nearest = () => { const L = t.leader; const e = engaged().map(m => Math.round(Math.hypot(m.x - L.x, m.y - L.y))).sort((a, b) => a - b); return e.length ? e[0] : '-'; };
"""

COMBAT_ENTER = COMBAT + r"""
await enter('GRAY'); t.pathfinder = null; t.pathfinderMap = null;
warp(P0.x, P0.y); await sleep(2500); refresh();
for (let i = 0; i < 30 && t.inCombat; i++) await sleep(500);
const a = mine().sort((m, n) => Math.hypot(m.x - P0.x, m.y - P0.y) - Math.hypot(n.x - P0.x, n.y - P0.y));
if (!a.length) return '弓手没刷出来';
const m0 = a[0];
const rows = ['起点 ' + P(t.leader) + ' ' + st() + ' 弓手 ' + P(m0) + ' 已交战=' + t.encounters.has(STAGE)];
const hp0 = t.leaderHp; const ok = t.autoWalkTo(m0.x, m0.y); rows.push('脱战时点寻路走向弓手 autoWalkTo=' + ok + ' autoWalkInCombat=' + t.autoWalkInCombat);
const t0 = Date.now(); let flipAt = null, cutAt = null, flipPos = null;
for (let i = 0; i < 150; i++) { await sleep(100); refresh(); if (t.leaderHp < hp0) t.leaderHp = hp0;
  if (t.inCombat && flipAt === null) { flipAt = Date.now() - t0; flipPos = P(t.leader); }
  if (!t.autoPath && cutAt === null) { cutAt = Date.now() - t0; break; } }
await sleep(800); refresh();
rows.push('期望:进战斗那一刻寻路取消 → 进战斗 ' + (flipAt === null ? '没进' : (flipAt / 1000).toFixed(1) + 's @' + flipPos) + ' · 寻路取消 ' + (cutAt === null ? '没取消' : (cutAt / 1000).toFixed(1) + 's') + ' · 追击中 ' + mine().filter(m => m.victim).length);
return rows.join('\n');
"""

COMBAT_RETREAT = COMBAT + r"""
refresh(); const hp0 = Math.max(t.leaderHp, 1);
const rows = ['点撤退前:' + st() + ' 最近交战怪 ' + nearest() + ' 追击中 ' + mine().filter(m => m.victim).length];
const goal = t.def.spawn; const ok = t.autoWalkTo(goal.x, goal.y);
rows.push('战斗中点寻路回出生点 autoWalkTo=' + ok + ' autoWalkInCombat=' + t.autoWalkInCombat);
const s0 = { x: t.leader.x, y: t.leader.y }; const t0 = Date.now(); let walking = 0, combat = 0;
for (let i = 1; i <= 20; i++) { await sleep(500); refresh(); if (t.leaderHp < hp0) t.leaderHp = hp0; if (t.autoPath) walking++; if (t.inCombat) combat++; }
rows.push('期望:战斗中寻路不被取消 → 10 秒里在走 ' + walking + '/20 次采样(其中战斗中 ' + combat + ' 次),累计走了 ' + Math.round(Math.hypot(t.leader.x - s0.x, t.leader.y - s0.y)));
return rows.join('\n');
"""

COMBAT_RELEASE = COMBAT + r"""
await enter('GRAY'); refresh();
const camp = t.def.camps.find(c => c.stageCode === STAGE); const homes = mine().map(m => [m.homeX, m.homeY]);
const ux0 = P0.x - camp.x, uy0 = P0.y - camp.y, ul = Math.hypot(ux0, uy0), ux = ux0 / ul, uy = uy0 / ul;
let P1 = null; for (let r = 300; r < 1600; r += 10) { const x = camp.x + ux * r, y = camp.y + uy * r; if (!t.walkable(x, y)) continue;
  const dmin = Math.min(...homes.map(h => Math.hypot(h[0] - x, h[1] - y))); if (dmin >= 790) { P1 = { x, y }; break; } }
if (!P1) return '营外找不到测点';
const side = P1.x >= camp.x ? 1 : -1;
const a = mine().sort((m, n) => Math.hypot(m.x - P1.x, m.y - P1.y) - Math.hypot(n.x - P1.x, n.y - P1.y)); const m0 = a[0];
const d0 = Math.hypot(m0.x - P1.x, m0.y - P1.y); let nearPt = null;
for (let r = 230; r < d0; r += 20) { const x = m0.x + (P1.x - m0.x) / d0 * r, y = m0.y + (P1.y - m0.y) / d0 * r; if (t.walkable(x, y)) { nearPt = { x, y }; break; } }
warp(nearPt.x, nearPt.y, side); const hp0 = Math.max(t.leaderHp, 1); for (let i = 0; i < 12; i++) { await sleep(500); if (t.leaderHp < hp0) t.leaderHp = hp0; }
refresh(); const rows = ['贴近弓手 6 秒:' + st() + ' 追击中 ' + mine().filter(m => m.victim).length + ' → 退到营外 ' + P(P1)];
warp(P1.x, P1.y, side); const t0 = Date.now(); let offAt = null, backOn = 0, within900 = 0;
for (let i = 0; i <= 28; i++) { refresh(); if (t.leaderHp < hp0) t.leaderHp = hp0; const L = t.leader; const s = (Date.now() - t0) / 1000;
  const n9 = engaged().filter(m => Math.hypot(m.x - L.x, m.y - L.y) < 900).length; within900 = Math.max(within900, n9);
  const chased = engaged().some(m => m.victim);
  if (!t.inCombat && offAt === null) offAt = s; else if (t.inCombat && offAt !== null && !chased) backOn++;
  await sleep(500); }
rows.push('期望:约 7 秒内脱战、之后不闪回 → 脱战于 ' + (offAt === null ? '14 秒内没脱战' : offAt.toFixed(1) + 's') + ' · 脱战后没人追却闪回战斗中 ' + backOn + ' 次 · 期间 900 内交战怪最多 ' + within900 + ' 只 · 交战记录仍在=' + t.encounters.has(STAGE));
return rows.join('\n');
"""

GROUPS = {
    '祭坛': [('晨风村_祭坛进出', ALTAR)],
    '训练场': [('晨风村_训练场', TRAINING)],
    '林地': [('林地_浅溪南岸', WOODS)],
    '石桥': [('荒原_峡谷石桥', BRIDGE)],
    '战斗': [('荒原_走向弓手进战斗即停', COMBAT_ENTER), ('荒原_战斗中点寻路撤退', COMBAT_RETREAT), ('荒原_营外看脱战', COMBAT_RELEASE)],
}


def main():
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(GROUPS)
    os.makedirs(OUT, exist_ok=True)
    steps = [{'label': '登录', 'js': LOGIN, 'wait': 0, 'shot': False}]
    for g in only:
        steps += [{'label': label, 'js': js, 'wait': 0, 'timeout': 400} for label, js in GROUPS[g]]
    sp = os.path.join(OUT, 'steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    env = dict(os.environ)
    if '--release' in sys.argv:
        env.setdefault('PREVIEW_PORT', '7460')
        env.setdefault('PT_PROFILE', 'playtest_profile_walkreg_rel')
    else:
        env.setdefault('PREVIEW_PORT', '7456')
        env.setdefault('PT_PROFILE', 'playtest_profile_walkreg')
    env.setdefault('EDGE_PORT', '9388')
    cmd = [sys.executable, os.path.join(HERE, 'playtest_cdp.py'), OUT, sp, '--fresh'] + (['--keep'] if '--keep' in sys.argv else [])
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    for line in proc.stdout:
        line = line.rstrip('\n')
        if line.startswith('{'):
            try:
                r = json.loads(line)
                print('==', r['step'], f"{r['sec']}s", r['view'])
                print(r['result'])
                continue
            except Exception:
                pass
        print(line[:600])
    proc.wait()


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
