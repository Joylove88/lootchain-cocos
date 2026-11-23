# -*- coding: utf-8 -*-
"""碰撞可视化截图(2026-11-23 祭坛看不见的墙):进图 → 把队长挪到 (x, y) → 截一张原画面 + 一张叠了碰撞的:
不可走的点涂红、水面挡块描黄框、立物挡块描橙框、NPC 标蓝圈;带 --to 时用工作区寻路器从 (x, y) 寻路过去,画绿线并报结果。
用来对「画面上看得见的路」和「看不见的墙」。

  python tools/qa/walk_debug_shot.py <地图> <x> <y> [--to x,y] [--ws-blocks] [--login guidetest05] [--pass pass1234] [--pc] [--out 目录]
  --ws-blocks:页面里的水面挡块换成工作区 LobbyWaterBlocks.ts(正式包上看改挡块的效果,不用出包)
环境变量同 playtest_cdp.py;默认 9386 + playtest_profile_walkdbg,不碰别的测试浏览器。产物:<out>/NN_原画面.png、NN_碰撞.png + log.jsonl。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import reach_sweep  # noqa: E402  共用:工作区寻路器 / 挡块注入 + 登录步骤

DRAW = r"""
refresh(); const MAP = '%(map)s', X = %(x)s, Y = %(y)s, TO = %(to)s;
if (t.def.code !== MAP) { t.enterMap(MAP); root.renderCurrentView(); for (let i = 0; i < 80; i++) { await sleep(500); refresh(); if (t.def.code === MAP && t.isMounted()) break; } await sleep(2500); refresh(); }
useWsBlocks(t.def);
const L = t.leader;
if (t.host.reportWorldPosition) t.host.reportWorldPosition('warp', t.mapCode, Math.round(X), Math.round(Y));
[L, ...t.followers].forEach((a, i) => { a.x = X - L.facing * i * 40; a.y = Y; a.node.setPosition(a.x, a.y, 0); });
t.trail = [new cc.Vec2(X, Y)]; t.autoPath = null; t.autoGoal = null; t.applyCamera(true);
await sleep(1800);
window.__walkDbg = { X, Y, TO };
return 'at ' + X + ',' + Y + ' walkable=' + t.walkable(X, Y);
"""

OVERLAY = r"""
refresh(); const { X, Y, TO } = window.__walkDbg;
const old = t.world.getChildByName('WalkDbg'); if (old) old.destroy();
const n = new cc.Node('WalkDbg'); n.layer = t.world.layer; t.world.addChild(n); n.addComponent(cc.UITransform);
const g = n.addComponent(cc.Graphics); const k = t.world.scale.x; const vs = cc.view.getVisibleSize();
const hw = vs.width / k / 2 + 120, hh = vs.height / k / 2 + 120;
const S = Math.max(10, Math.ceil(Math.sqrt((4 * hw * hh) / 40000)));   // 采样点控制在约 4 万个以内
g.fillColor = new cc.Color(255, 30, 30, 120);
// 每行把连续的不可走点并成一条矩形(一个 Graphics 画几万个小方块会撑爆顶点缓冲:Invalid typed array length)
let blocked = 0;
for (let y = Y - hh; y <= Y + hh; y += S) { let run = null;
  for (let x = X - hw; x <= X + hw + S; x += S) { const b = x <= X + hw && !t.walkable(x, y);
    if (b) { blocked++; if (run === null) run = x; } else if (run !== null) { g.rect(run - S / 2, y - S / 2, x - run, S); run = null; } } }
g.fill();
const near = (b) => Math.abs(b.x - X) < hw + b.w / 2 && Math.abs(b.y - Y) < hh + 80;
g.lineWidth = 3 / k; g.strokeColor = new cc.Color(255, 230, 0, 255);
const wb = (t.def.blocks || []).filter(near); wb.forEach(b => g.rect(b.x - b.w / 2, b.y, b.w, b.d)); g.stroke();
g.strokeColor = new cc.Color(255, 140, 0, 255);
t.def.props.filter(p => p.block && near({ x: p.x, y: p.y, w: p.block.w })).forEach(p => g.rect(p.x - p.block.w / 2, p.y, p.block.w, p.block.d)); g.stroke();
g.strokeColor = new cc.Color(60, 160, 255, 255); g.lineWidth = 5 / k;
t.def.npcs.filter(c => Math.abs(c.x - X) < hw && Math.abs(c.y - Y) < hh).forEach(c => g.circle(c.x, c.y, 30)); g.stroke();
g.fillColor = new cc.Color(255, 255, 255, 255); g.circle(X, Y, 10); g.fill();
const out = { blockedSamples: blocked, waterBlocks: wb.map(b => b.x + ',' + b.y + ' ' + b.w + 'x' + b.d) };
if (TO) {
  const pf = mk(t.def); const p = pf.find(X, Y, TO[0], TO[1]);
  if (!p) out.path = '寻路失败';
  else {
    const e = p[p.length - 1]; out.path = p.length + ' 点,终点离目标 ' + Math.round(Math.hypot(e.x - TO[0], e.y - TO[1]));
    let bad = 0; for (let i = 0; i < p.length; i++) { const a = i ? p[i - 1] : { x: X, y: Y }, b = p[i]; const d = Math.hypot(b.x - a.x, b.y - a.y);
      for (let s = 0; s <= d; s += 4) { const f = d ? s / d : 0; if (!t.walkable(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)) { bad++; break; } } }
    out.segmentsThroughWall = bad;
    g.strokeColor = new cc.Color(40, 255, 90, 255); g.lineWidth = 6 / k; g.moveTo(X, Y); p.forEach(q => g.lineTo(q.x, q.y)); g.stroke();
    g.fillColor = new cc.Color(40, 255, 90, 255); p.forEach(q => g.circle(q.x, q.y, 8)); g.fill();
  }
  g.strokeColor = new cc.Color(40, 255, 90, 255); g.lineWidth = 4 / k; g.circle(TO[0], TO[1], 40); g.stroke();
}
return JSON.stringify(out);
"""


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith('--') and sys.argv[sys.argv.index(a) - 1] not in ('--to', '--login', '--pass', '--out')]
    map_code, x, y = pos[0].upper(), float(pos[1]), float(pos[2])
    to = arg('--to')
    to_js = '[' + to + ']' if to else 'null'
    out = arg('--out') or os.path.join(reach_sweep.OUT, '..', 'walkdbg')
    os.makedirs(out, exist_ok=True)
    lib = reach_sweep.page_lib('--ws-blocks' in sys.argv)
    steps = [{'label': '登录', 'js': reach_sweep.LOGIN % (arg('--login', 'guidetest05'), arg('--pass', 'pass1234')), 'wait': 0, 'shot': False},
             {'label': '原画面', 'js': lib + DRAW % {'map': map_code, 'x': x, 'y': y, 'to': to_js}, 'wait': 0.5, 'timeout': 300},
             {'label': '碰撞', 'js': lib + OVERLAY, 'wait': 0.5, 'timeout': 300}]
    sp = os.path.join(out, 'walkdbg_steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    env = dict(os.environ)
    env.setdefault('EDGE_PORT', '9386')
    env.setdefault('PT_PROFILE', 'playtest_profile_walkdbg')
    cmd = [sys.executable, os.path.join(HERE, 'playtest_cdp.py'), out, sp] + (['--pc'] if '--pc' in sys.argv else [])
    subprocess.run(cmd, env=env, check=False)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
