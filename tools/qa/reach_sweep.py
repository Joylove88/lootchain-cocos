# -*- coding: utf-8 -*-
"""五图可达性扫描(2026-11-23 策划通玩第二轮):从每张图出生点,用仓库里当前的寻路器
(assets/scripts/scenes/lobby/LobbyTownPathfinder.ts,现场转成 JS 注入页面)对每个 NPC / 有动作的建筑 / 怪群 / 出口 /
兴趣点 / 传送阵跑一遍,列出「到不了」和「只能走到很远处」的点。地图数据和碰撞用页面里正在跑的那一版
(正式包 7460 = 线上数据;编辑器预览 7456 = 工作区数据),所以能验「新寻路器 × 线上地图」这种组合。

  python tools/qa/reach_sweep.py [--login guidetest05] [--pass pass1234] [--ws-blocks]
--ws-blocks:水面挡块也换成工作区 LobbyWaterBlocks.ts(验「工作区寻路器 × 工作区挡块 × 页面里其余地图数据」)。
--islands:另列各图和出生点不连通的成片可走区(≥ 4 万平方单位;网格连通,不做真实碰撞细查,当线索看)。
环境变量同 playtest_cdp.py(PREVIEW_PORT / EDGE_PORT / PT_PROFILE);默认另起 9385 + playtest_profile_reach,不碰别的测试浏览器。
注意:扫描会用 enterMap 依次进五张图(会给服务端报瞬移),请用测试号;扫完送回原图。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
TS = r'D:/Program Files/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa'), 'reach')


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def transpile(name='LobbyTownPathfinder.ts'):
    js = ("const ts = require(process.argv[1]); const fs = require('fs');"
          "const src = fs.readFileSync(process.argv[2], 'utf8');"
          "process.stdout.write(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText);")
    src = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', name)
    return subprocess.run(['node', '-e', js, TS, src], capture_output=True, text=True, encoding='utf-8', check=True).stdout


def page_lib(ws_blocks=False):
    """注入页面的前缀:工作区寻路器 PF2 + mk(def) + useWsBlocks(def);ws_blocks 时再注入工作区水面挡块 WS_BLOCKS。"""
    lib = "const __m = { exports: {} }; (function (module, exports) { " + transpile() + " })(__m, __m.exports); const PF2 = __m.exports.TownPathfinder;\n"
    if ws_blocks:
        lib += ("const __wb = { exports: {} }; (function (module, exports) { " + transpile('LobbyWaterBlocks.ts') + " })(__wb, __wb.exports);\n"
                "const WS_BLOCKS = { VILLAGE: __wb.exports.VILLAGE_WATER_BLOCKS, WOODS: __wb.exports.WOODS_WATER_BLOCKS,"
                " GRAY: __wb.exports.GRAY_WATER_BLOCKS, DEADWOOD: __wb.exports.DEADWOOD_WATER_BLOCKS };\n")
    return lib + MK_JS


# 按地图建寻路器(照抄 LobbyTownRenderer.makePathfinder:有 walkMask 的图 40 格 + 场地范围细查;整图场景用场景栅格)
MK_JS = r"""
const mk = (def) => {
  if (def.scene) { const sc = def.scene; const cell = sc.walk.cell * sc.unit; const rows = sc.walk.rows.length; const left = (-sc.px[0] / 2) * sc.unit; const bottom = (sc.px[1] / 2 - rows * sc.walk.cell) * sc.unit; return new PF2(left, bottom, sc.walk.cols * cell, rows * cell, (x, y) => t.walkable(x, y), cell); }
  const w = def.walk;
  const zones = def.buildings.filter(b => b.walkMask).map(b => { const xs = b.walkMask.outline.map(p => b.x + p[0]); const ys = b.walkMask.outline.map(p => b.y + p[1]); return { l: Math.min(...xs) - 60, r: Math.max(...xs) + 60, b: Math.min(...ys) - 60, t: Math.max(...ys) + 60 }; });
  const probe = zones.length ? (ax, ay, bx, by) => zones.some(z => Math.max(ax, bx) >= z.l && Math.min(ax, bx) <= z.r && Math.max(ay, by) >= z.b && Math.min(ay, by) <= z.t) : null;
  return new PF2(w.left, w.bottom, w.right - w.left, w.top - w.bottom, (x, y) => t.walkable(x, y), zones.length ? 40 : undefined, probe);
};
// --ws-blocks:页面里的水面挡块换成工作区 LobbyWaterBlocks.ts(正式包上验改挡块,不用出包)
const useWsBlocks = (def) => { if (typeof WS_BLOCKS !== 'undefined' && WS_BLOCKS[def.code]) { def.blocks = WS_BLOCKS[def.code]; t.blockGrid = null; } };
"""

SWEEP = r"""
refresh(); const startMap = t.def.code; const report = {}; const ISLANDS = %(islands)s, ISLAND_MIN = 40000;
for (const code of ['VILLAGE', 'WOODS', 'CITY', 'GRAY', 'DEADWOOD']) {
  if (t.def.code !== code) { t.enterMap(code); root.renderCurrentView(); for (let i = 0; i < 80; i++) { await sleep(500); refresh(); if (t.def.code === code && t.isMounted()) break; } await sleep(2500); refresh(); }
  useWsBlocks(t.def); const def = t.def; const t0 = performance.now(); const pf = mk(def); const sp = def.spawn; const targets = [];
  def.npcs.forEach(n => targets.push(['NPC ' + n.name, n.x, n.y, 160]));
  def.buildings.filter(b => b.action && b.action !== 'none').forEach(b => targets.push(['建筑 ' + (b.label || b.key), b.x + b.door.x, b.y + b.door.y, 160]));
  def.camps.forEach(c => targets.push(['怪群 ' + (c.label || c.stageCode) + (c.elite ? '[精英]' : ''), c.x, c.y, 320]));
  def.exits.forEach(e => targets.push(['出口 ' + e.label, e.x, e.y, 80]));
  (def.pois || []).forEach(p => targets.push(['兴趣点 ' + p.name, p.x, p.y, 160]));
  if (def.waypoint) targets.push(['传送阵', def.waypoint.x, def.waypoint.y, 160]);
  const bad = [];
  for (const [name, x, y, near] of targets) { const p = pf.find(sp.x, sp.y, x, y); if (!p) { bad.push('到不了 ' + name + ' @' + Math.round(x) + ',' + Math.round(y)); continue; } const e = p[p.length - 1]; const d = Math.hypot(e.x - x, e.y - y); if (d > near) bad.push('只能走到离 ' + name + ' ' + Math.round(d) + ' 远处 @' + Math.round(x) + ',' + Math.round(y)); }
  report[code] = { cell: pf.cell, targets: targets.length, bad, ms: Math.round(performance.now() - t0) };
  if (ISLANDS) {
    // 孤岛:网格上和出生点不连通的成片可走格(斜走不切墙角,和 A* 同一规矩;不做真实碰撞细查,只当线索)
    const cols = pf.cols, rows = pf.rows, grid = pf.grid, lab = new Int32Array(cols * rows).fill(-1); const comps = [];
    for (let s0 = 0; s0 < cols * rows; s0++) { if (!grid[s0] || lab[s0] >= 0) continue; const id = comps.length; const q = [s0]; lab[s0] = id; let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      while (q.length) { const i = q.pop(); const c = i %% cols, r = (i - c) / cols; n++; const wx = pf.cx(c), wy = pf.cy(r); sx += wx; sy += wy; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
        for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { const cc2 = c + dc, rr2 = r + dr; if (cc2 < 0 || rr2 < 0 || cc2 >= cols || rr2 >= rows) continue; const j = rr2 * cols + cc2;
          if (!grid[j] || lab[j] >= 0 || (dc && dr && (!grid[r * cols + cc2] || !grid[rr2 * cols + c]))) continue; lab[j] = id; q.push(j); } }
      comps.push({ n, cx: Math.round(sx / n), cy: Math.round(sy / n), x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1) }); }
    const main = lab[pf.row(sp.y) * cols + pf.col(sp.x)];
    const area = pf.cell * pf.cell; report[code].islands = comps.filter((c, i) => i !== main && c.n * area >= ISLAND_MIN).sort((a, b) => b.n - a.n).slice(0, 15)
      .map(c => Math.round(c.n * area / 1e4) + ' 万平方单位 · 中心 ' + c.cx + ',' + c.cy + ' · 范围 x ' + c.x0 + '~' + c.x1 + ' y ' + c.y0 + '~' + c.y1);
  }
}
if (t.def.code !== startMap) { t.enterMap(startMap); root.renderCurrentView(); for (let i = 0; i < 60; i++) { await sleep(500); refresh(); if (t.def.code === startMap && t.isMounted()) break; } }
report.backTo = t.def.code;
return JSON.stringify(report);
"""

LOGIN = ("for (let i = 0; i < 240; i++) { refresh(); if (root && ['login', 'loginAccount', 'lobby'].includes(view())) break; await sleep(500); }\n"
         "if (view() !== 'lobby') { for (let i = 0; i < 240 && texts(20).some(s => s.includes('正在下载') || s.includes('正在加载')); i++) await sleep(500);\n"
         "  root.loginFlow.setInputs({ string: '%s' }, { string: '%s' }); try { root.loginFlow.acceptedAgreement = true; } catch (e) {} root.run(() => root.loginFlow.login()); }\n"
         "for (let i = 0; i < 300; i++) { refresh(); if (view() === 'lobby' && t && t.isMounted && t.isMounted()) break; await sleep(500); }\n"
         "await sleep(3000); refresh(); return view() + ' @' + (t && t.def ? t.def.code : '?');")


def main():
    os.makedirs(OUT, exist_ok=True)
    lib = page_lib('--ws-blocks' in sys.argv)
    steps = [{'label': '登录', 'js': LOGIN % (arg('--login', 'guidetest05'), arg('--pass', 'pass1234')), 'wait': 0, 'shot': False},
             {'label': '五图可达性', 'js': lib + SWEEP % {'islands': 'true' if '--islands' in sys.argv else 'false'}, 'wait': 0, 'shot': False, 'timeout': 900}]
    sp = os.path.join(OUT, 'reach_steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    env = dict(os.environ)
    env.setdefault('EDGE_PORT', '9385')
    env.setdefault('PT_PROFILE', 'playtest_profile_reach')
    subprocess.run([sys.executable, os.path.join(HERE, 'playtest_cdp.py'), OUT, sp], env=env, check=False)
    for line in open(os.path.join(OUT, 'log.jsonl'), encoding='utf-8').read().splitlines()[-1:]:
        rec = json.loads(line)
        try:
            rep = json.loads(rec['result'])
        except Exception:
            print(rec['result'])
            return
        for code, v in rep.items():
            if isinstance(v, dict):
                print(f"{code}: 格子 {v['cell']:.0f} · {v['targets']} 个点 · 有问题 {len(v['bad'])}")
                for b in v['bad']:
                    print('   ', b)
                for b in v.get('islands', []):
                    print('    孤岛', b)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
