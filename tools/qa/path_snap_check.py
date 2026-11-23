# -*- coding: utf-8 -*-
"""寻路「起点吸到墙另一侧」回归(2026-11-23):五张图各取一批贴着墙站的起点(自己能站、身边 28 内有站不了人的点),
各配几个目标(NPC / 出口 / 怪群 / 兴趣点),分别用「旧选格」(螺旋顺序取第一个可走格)和工作区寻路器跑。
主指标 = 照游戏规则实走(换折点 / 分轴移动 / 沿墙滑 / 卡住重算 3 次放弃;新版另带 11-23 的「换折点先看直线」)的结果:ok 到了 / stuck 卡住放弃 / short 停在离目标远处 /
nopath 寻路失败 / timeout;另列「变差的例」(旧能到、新到不了)。直线细查穿墙(4 单位一步)只作参考,擦墙角也会算进去。
地图数据 / 碰撞用页面里正在跑的那一版。

  python tools/qa/path_snap_check.py [--per-map 300] [--ws-blocks] [--login guidetest05] [--pass pass1234]
环境变量同 playtest_cdp.py;默认 9387 + playtest_profile_snap。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import reach_sweep  # noqa: E402

CHECK = r"""
refresh(); const startMap = t.def.code; const PER = %(per)d; const report = {};
// 旧选格:螺旋顺序取第一个可走格(11-23 前的 nearestOpen),其余照工作区寻路器
class PF2Old extends PF2 {
  anchorCells(x, y) { const c = this.col(x), r = this.row(y); const rings = Math.ceil(960 / this.cell);
    for (let d = 0; d <= rings; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue; if (this.open(c + dc, r + dr)) return [(r + dr) * this.cols + (c + dc)]; }
    return []; }
}
const mkOld = (def) => { const p = mk(def); Object.setPrototypeOf(p, PF2Old.prototype); return p; };
let seed = 20261123; const rnd = () => { seed = (seed * 1103515245 + 12345) %% 2147483648; return seed / 2147483648; };
const line = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)); for (let k = 1; k <= n; k++) { const f = k / n; if (!t.walkable(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)) return false; } return true; };
const crossIdx = (s, p) => { let a = s; for (let i = 0; i < p.length; i++) { if (!line(a, p[i])) return i; a = p[i]; } return -1; };
// 照 LobbyTownRenderer 实走:autoPathVector 换折点 + stepLeader 分轴移动 / 沿墙滑 + watchAutoWalk 卡住重算(0.6 秒挪不到 12 就重算,3 次放弃)
let simAt = '';
const segOk = (ax, ay, bx, by, maxLen) => { const len = Math.hypot(bx - ax, by - ay); if (len < 1) return true; const reach = Math.min(len, maxLen); for (let q = 12; q <= reach; q += 12) { if (!t.walkable(ax + (bx - ax) * q / len, ay + (by - ay) * q / len)) return false; } return true; };
const simWalk = (pf, sx, sy, tx, ty, los) => { simAt = '';
  let path = pf.find(sx, sy, tx, ty); if (!path) return 'nopath';
  const sc = t.def.scene; const near = sc ? sc.walk.cell * sc.unit * 1.2 : 48; const W = t.def.walk;
  const inFrame = (x, y) => x >= W.left && x <= W.right && y >= W.bottom && y <= W.top;
  let x = sx, y = sy, probe = { x, y, at: 0, replans: 0 }; const dt = 1 / 30; const maxT = Math.hypot(tx - sx, ty - sy) / 340 * 4 + 12;
  for (let tm = 0; tm < maxT; tm += dt) {
    while (path.length > 0) { const d = Math.hypot(path[0].x - x, path[0].y - y); if (d >= (path.length > 1 ? near : 48)) break;
      if (sc && path.length > 1 && d > 10 && !pf.clear(x, y, path[1].x, path[1].y)) break;
      if (los && !sc && path.length > 1 && d > 10 && !segOk(x, y, path[1].x, path[1].y, 240)) break; path.shift(); }
    if (path.length === 0) return Math.hypot(tx - x, ty - y) < 160 ? 'ok' : 'short';
    if (tm - probe.at >= 0.6) { const mv = Math.hypot(x - probe.x, y - probe.y); probe.x = x; probe.y = y; probe.at = tm;
      if (mv >= 12) probe.replans = 0; else { probe.replans++; if (probe.replans > 3) { simAt = Math.round(x) + ',' + Math.round(y); return 'stuck'; } const np = pf.find(x, y, tx, ty); if (!np) { simAt = Math.round(x) + ',' + Math.round(y); return 'stuck'; } path = np; } }
    const dx = path[0].x - x, dyv = (path[0].y - y) / 0.8; const len = Math.max(1, Math.hypot(dx, dyv)); const vx = dx / len, vy = dyv / len;
    const nx = x + vx * 340 * dt, ny = y + vy * 340 * 0.8 * dt; const stuck = !t.walkable(x, y); const ox = x, oy = y;
    if (t.walkable(nx, y) || (stuck && inFrame(nx, y))) x = nx;
    if (t.walkable(x, ny) || (stuck && inFrame(x, ny))) y = ny;
    if (x === ox && y === oy) { const step = 340 * dt; for (const [qx, qy] of [[-vy, vx], [vy, -vx]]) { const tx2 = ox + qx * step * 0.7, ty2 = oy + qy * step * 0.56;
      if ((qx * vx + qy * vy) > -0.01 && t.walkable(tx2, ty2)) { x = tx2; y = ty2; break; } } }
  }
  return 'timeout';
};
for (const code of ['VILLAGE', 'WOODS', 'CITY', 'GRAY', 'DEADWOOD']) {
  if (t.def.code !== code) { t.enterMap(code); root.renderCurrentView(); for (let i = 0; i < 80; i++) { await sleep(500); refresh(); if (t.def.code === code && t.isMounted()) break; } await sleep(2500); refresh(); }
  useWsBlocks(t.def); const def = t.def; const w = def.walk;
  const targets = [...def.npcs.map(n => [n.x, n.y]), ...def.exits.map(e => [e.x, e.y]), ...def.camps.map(c => [c.x, c.y]), ...(def.pois || []).map(p => [p.x, p.y])];
  const starts = []; let tries = 0;
  while (starts.length < PER && tries < PER * 400) { tries++;
    const x = w.left + rnd() * (w.right - w.left), y = w.bottom + rnd() * (w.top - w.bottom);
    if (!t.walkable(x, y)) continue; let nearWall = false;
    for (let a = 0; a < 8 && !nearWall; a++) { const ang = a * Math.PI / 4; if (!t.walkable(x + Math.cos(ang) * 28, y + Math.sin(ang) * 28)) nearWall = true; }
    if (nearWall) starts.push([x, y]); }
  const pfNew = mk(def), pfOld = mkOld(def);
  const res = { starts: starts.length, routes: 0, oldCross: 0, newCross: 0, oldFirst: 0, newFirst: 0, oldFail: 0, newFail: 0, walkOld: {}, walkNew: {}, fixed: [], broke: [], island: 0, stuckAt: [] };
  const sp = def.spawn; const islandOf = new Map();
  const t0 = performance.now();
  for (const [sx, sy] of starts) for (let k = 0; k < 3; k++) { const [tx, ty] = targets[Math.floor(rnd() * targets.length)]; res.routes++;
    const s = { x: sx, y: sy }; const po = pfOld.find(sx, sy, tx, ty), pn = pfNew.find(sx, sy, tx, ty);
    if (!po) res.oldFail++; else { const i = crossIdx(s, po); if (i >= 0) { res.oldCross++; if (i === 0) res.oldFirst++; } }
    if (!pn) res.newFail++; else { const i = crossIdx(s, pn); if (i >= 0) { res.newCross++; if (i === 0) res.newFirst++; } }
    const wo = simWalk(pfOld, sx, sy, tx, ty, false), wn = simWalk(pfNew, sx, sy, tx, ty, true);
    res.walkOld[wo] = (res.walkOld[wo] || 0) + 1; res.walkNew[wn] = (res.walkNew[wn] || 0) + 1;
    const tag = Math.round(sx) + ',' + Math.round(sy) + '→' + Math.round(tx) + ',' + Math.round(ty);
    if (wo !== 'ok' && wn === 'ok' && res.fixed.length < 4) res.fixed.push(tag + ' 旧:' + wo);
    if (wo === 'ok' && wn !== 'ok' && res.broke.length < 6) res.broke.push(tag + ' 新:' + wn + (simAt ? ' 卡在 ' + simAt : ''));
    if (wn === 'stuck' && res.stuckAt.length < 6) res.stuckAt.push(tag + ' 卡在 ' + simAt);
    if (wn === 'nopath') { const key = sx + ',' + sy; if (!islandOf.has(key)) { const q = pfNew.find(sp.x, sp.y, sx, sy); islandOf.set(key, !q || Math.hypot(q[q.length - 1].x - sx, q[q.length - 1].y - sy) > 60); } if (islandOf.get(key)) res.island++; } }
  res.ms = Math.round(performance.now() - t0); report[code] = res;
}
if (t.def.code !== startMap) { t.enterMap(startMap); root.renderCurrentView(); for (let i = 0; i < 60; i++) { await sleep(500); refresh(); if (t.def.code === startMap && t.isMounted()) break; } }
return JSON.stringify(report);
"""


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    out = os.path.join(reach_sweep.OUT, '..', 'snap')
    os.makedirs(out, exist_ok=True)
    lib = reach_sweep.page_lib('--ws-blocks' in sys.argv)
    steps = [{'label': '登录', 'js': reach_sweep.LOGIN % (arg('--login', 'guidetest05'), arg('--pass', 'pass1234')), 'wait': 0, 'shot': False},
             {'label': '起点吸附对比', 'js': lib + CHECK % {'per': int(arg('--per-map', '300'))}, 'wait': 0, 'shot': False, 'timeout': 1500}]
    sp = os.path.join(out, 'snap_steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    env = dict(os.environ)
    env.setdefault('EDGE_PORT', '9387')
    env.setdefault('PT_PROFILE', 'playtest_profile_snap')
    subprocess.run([sys.executable, os.path.join(HERE, 'playtest_cdp.py'), out, sp], env=env, check=False)
    rec = json.loads(open(os.path.join(out, 'log.jsonl'), encoding='utf-8').read().splitlines()[-1])
    try:
        rep = json.loads(rec['result'])
    except Exception:
        print(rec['result'])
        return
    for code, v in rep.items():
        print(f"{code}: 贴墙起点 {v['starts']} · 路线 {v['routes']} · 实走 旧 {v['walkOld']} → 新 {v['walkNew']}")
        print(f"    直线细查穿墙(含擦墙角)旧 {v['oldCross']}(第一步 {v['oldFirst']})→ 新 {v['newCross']}(第一步 {v['newFirst']})"
              f" · 寻路失败 旧 {v['oldFail']} → 新 {v['newFail']} · {v['ms']}ms")
        for e in v['fixed']:
            print('    修好的例:', e)
        for e in v['broke']:
            print('    变差的例:', e)
        if v.get('island') is not None:
            print(f"    新版寻路失败里起点从出生点也到不了(孤岛,玩家走不进去)的:{v['island']} 条")
        for e in v.get('stuckAt', []):
            print('    新版仍卡住:', e)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
