# -*- coding: utf-8 -*-
"""守卫战怪物血条回归(2026-11-11 战斗画面精致化 · 样片 09)。

生成 battle_polish_shots.py 的自定义步骤:
  1. 一排不同血量的小怪(含精英 / 坦克)定住不动 → 截静态图 hpbar_static,并核对条层里所有血条是不是同一张贴图、整层占几次绘制
     (定住模拟、不推进时间地重画,只切条层显隐,前后两帧的绘制次数差就是条层占的次数);
  2. 让其中几只一次掉一截血 → 逐帧读回血条所在的一小块画面,拼成残影收回的时间条 hpbar_trail.png(每行标毫秒数和残影长度);
  3. 边界:回血(残影直接收掉)、回满(血条隐藏)、全部击杀(条层里不留血条节点)——只打印数值;
  4. 首领:58% 血量静态图 hpbar_boss → 掉到 50% 的残影时间条 hpbar_boss_trail.png → 掉到 30% 转橙 hpbar_boss_low;
  5. (--resize)改一次视口尺寸触发战场重建 → 再排一遍小怪截 hpbar_resized,核对重建后血条照常。

用法:
  python tools/qa/guard_hpbar_steps.py <步骤.json> [--resize]
  PYTHONIOENCODING=utf-8 python tools/qa/battle_polish_shots.py <输出目录> pc|phone|both --only=guard --steps=<步骤.json>

说明:
- 小怪血量设成极大值再按比例扣,英雄继续打也看不出变化;排法固定(第 k 只在 2.7 + 0.62k 格、上下排交替),前后对比用同一套。
- 残影按真实时间收(渲染帧里用 Date.now),所以时间条是「暂停游戏 → 每隔约 34 毫秒手动推一帧 → 同一个任务里读回」。
- 步骤里的 js 会被拼成一行,所以里面不能写 // 注释。
"""
import json
import sys


def one_line(js):
    return ' '.join(line.strip() for line in js.strip().splitlines() if line.strip())


PRELUDE = r"""
const W = cc.game.canvas.width, Hh = cc.game.canvas.height; const gl = cc.director.root.device.gl;
const sx = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
const toCanvas = p => [Math.round(vp.x + p.x * sx), Math.round(Hh - vp.y - p.y * sx)];
const grab = (x0, y0, w, h) => { x0 = Math.max(0, Math.min(W - w, Math.round(x0))); y0 = Math.max(0, Math.min(Hh - h, Math.round(y0)));
  const buf = new Uint8Array(w * h * 4); gl.readPixels(x0, Hh - y0 - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) { img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); }
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; g.putImageData(img, 0, 0); return cv; };
const strip = (rows, w, h) => { const lab = 26; const out = document.createElement('canvas'); out.width = w + 320; out.height = rows.length * (h + 4) + 4; const g = out.getContext('2d');
  g.fillStyle = '#16161c'; g.fillRect(0, 0, out.width, out.height); g.font = '18px sans-serif'; g.textBaseline = 'middle';
  rows.forEach((row, i) => { const y = 4 + i * (h + 4); g.drawImage(row[1], 0, y); g.fillStyle = '#e8e6e0'; g.fillText(row[0], w + 12, y + h / 2); }); void lab; return out.toDataURL('image/png'); };
const viewOf = m => r.monsterViews.get(m.monsterId);
"""

ARRANGE = PRELUDE + r"""
cc.game.resume();
if (sim.pendingChoice) M.guardSkipChoice(sim);
alive().forEach(m => { m.dead = true; });
await sleep(600);
const kinds = ['normal', 'tank', 'normal', 'elite', 'fast', 'normal', 'shooter', 'normal'];
kinds.forEach((k, i) => sim.pendingSpawns.unshift({ kind: k, lane: i % 2, atMs: sim.timeMs + 40 + i * 30 }));
for (let i = 0; i < 80 && alive().length < kinds.length; i++) await sleep(100);
const ratios = [0.93, 0.74, 0.52, 0.63, 0.33, 0.17, 0.07, 0.85];
const list = alive();
list.forEach((m, k) => { m.lane = k % 2; m.x = 2.7 + k * 0.62; m.speedCellsPerSec = 0; m.maxHp = 9e8; m.hp = 9e8 * ratios[k % ratios.length]; });
window.__hpList = list;
for (let i = 0; i < 40; i++) { await sleep(150); if (list.every(m => { const v = viewOf(m); return v && v.spineReady && v.hpBg && v.hpBg.isValid; })) break; }
await sleep(1200);
cc.game.pause();
const tex = new Set(); let sprites = 0;
r.barLayer.children.forEach(c => { const sp = c.getComponent(cc.Sprite); if (sp && sp.spriteFrame && c.active) { sprites++; tex.add(sp.spriteFrame.texture.getHash()); } });
sim.paused = true;
const dc = () => { cc.director.tick(0); return cc.director.root.device.numDrawCalls; };
const on = dc(); r.barLayer.active = false; const off = dc(); r.barLayer.active = true; const on2 = dc(); sim.paused = false;
return JSON.stringify({ hpbars: list.map(m => { const v = viewOf(m); const p = v && v.hpBg && v.hpBg.isValid ? toCanvas(v.hpBg.worldPosition) : [-1, -1];
  return { kind: m.kind, ratio: +(m.hp / m.maxHp).toFixed(3), w: v ? v.hpBarW : 0, shown: v ? v.hpShownW : -1, trail: v && v.hpTrail ? v.hpTrail.active : null, x: p[0], y: p[1] }; }),
  barLayer: { sprites, textures: tex.size, drawCalls: [on - off, on2 - off], frame: on }, sx: +sx.toFixed(3), unit: Math.round(r.unitSize()) });
"""

TRAIL = PRELUDE + r"""
const list = (window.__hpList || []).filter(m => !m.dead);
const picks = [[list[1], 0.18], [list[3], 0.18], [list[5], 0.08], [list[7], 0.05]].filter(p => p[0] && viewOf(p[0]) && viewOf(p[0]).hpBg);
if (!picks.length) return JSON.stringify({ err: 'no bars' });
let x0 = W, y0 = Hh, x1 = 0, y1 = 0;
picks.forEach(p => { const v = viewOf(p[0]); const c = toCanvas(v.hpBg.worldPosition); const half = (v.hpBarW / 2 + 14) * sx; x0 = Math.min(x0, c[0] - half); x1 = Math.max(x1, c[0] + half); y0 = Math.min(y0, c[1] - 16 * sx); y1 = Math.max(y1, c[1] + 16 * sx); });
const w = Math.round(x1 - x0), h = Math.round(y1 - y0);
cc.game.pause();
cc.game.step();
const rows = [['掉血前', grab(x0, y0, w, h)]]; const nums = [];
const t0 = performance.now();
picks.forEach(p => { p[0].hp = Math.max(1, p[0].hp - p[0].maxHp * p[1]); });
for (let i = 0; i < 20; i++) {
  cc.game.step();
  const t = Math.round(performance.now() - t0);
  const state = picks.map(p => { const v = viewOf(p[0]); return [Math.round(v.hpShownW || 0), v.hpTrailW === undefined ? -1 : +v.hpTrailW.toFixed(1)]; });
  rows.push([t + ' ms  ' + state.map(s => s[0] + '/' + (s[1] < 0 ? '-' : s[1])).join('  '), grab(x0, y0, w, h)]);
  nums.push([t].concat(state));
  await sleep(34);
}
window.__hpTrailNums = nums;
return strip(rows, w, h);
"""

TRAIL_NUMS = r"""return JSON.stringify({ trail: window.__hpTrailNums || null, live: r.hpTrailViews.size });"""

EDGE = PRELUDE + r"""
cc.game.resume();
const list = (window.__hpList || []).filter(m => !m.dead);
const out = {};
const a = list[2], b = list[4], c = list[6];
a.hp = a.hp - a.maxHp * 0.2; await sleep(160);
out.dropTrail = !!viewOf(a).hpTrail.active;
a.hp = a.hp + a.maxHp * 0.3; await sleep(200);
out.healTrailOff = !viewOf(a).hpTrail.active; out.healShown = viewOf(a).hpShownW;
b.hp = b.maxHp; await sleep(200);
out.fullHidden = !viewOf(b).hpBg.active && !viewOf(b).hpFill.active && !viewOf(b).hpTrail.active;
b.hp = b.maxHp * 0.9; await sleep(200);
out.reshown = viewOf(b).hpBg.active && viewOf(b).hpFill.active; out.reshownTrail = viewOf(b).hpTrail.active;
c.hp = c.maxHp * 0.02; await sleep(200);
out.tinyShown = viewOf(c).hpShownW;
const before = r.barLayer.children.filter(n => /Hp(Bg|Trail|Fill)$/.test(n.name)).length;
list.forEach(m => { m.hp = 0; m.dead = true; });
await sleep(700);
out.hpNodesBeforeKill = before;
out.hpNodesAfterKill = r.barLayer.children.filter(n => n.isValid && /Hp(Bg|Trail|Fill)$/.test(n.name)).length;
out.trailSet = r.hpTrailViews.size;
return JSON.stringify(out);
"""

BOSS = PRELUDE + r"""
cc.game.resume();
alive().forEach(m => { m.dead = true; });
await sleep(500);
sim.pendingSpawns.unshift({ kind: 'boss', lane: 1, atMs: sim.timeMs + 100 });
let boss = null;
for (let i = 0; i < 80 && !boss; i++) { await sleep(150); boss = sim.monsters.find(m => m.kind === 'boss' && !m.dead) || null; }
if (!boss) return JSON.stringify({ err: 'no boss' });
boss.speedCellsPerSec = 0; boss.x = 4.6; boss.maxHp = 48000 * 1e4; boss.hp = boss.maxHp * 0.58;
window.__hpBoss = boss;
let v = null;
for (let i = 0; i < 80; i++) { await sleep(300); v = viewOf(boss); if (v && v.spineReady && v.hpBarLocked) break; }
await sleep(1500);
cc.game.pause();
const bar = v && v.node.getChildByName('GuardMonsterHp');
const text = bar && bar.getChildByName('GuardMonsterHpText');
if (text) text.getComponent(cc.Label).string = 'BOSS  27840 / 48000';
const p = bar ? toCanvas(bar.worldPosition) : [-1, -1];
return JSON.stringify({ bossbar: { code: boss.spineCode, locked: !!(v && v.hpBarLocked), x: p[0], y: p[1], shown: v ? v.hpShownW : -1, trail: v && v.hpTrail ? v.hpTrail.active : null,
  parts: bar ? bar.children.map(n => n.name.replace('GuardMonsterHp', '')) : [] }, sx: +sx.toFixed(3) });
"""

BOSS_TRAIL = PRELUDE + r"""
const boss = window.__hpBoss; const v = viewOf(boss); const bar = v.node.getChildByName('GuardMonsterHp');
const c = toCanvas(bar.worldPosition); const w = Math.round(330 * sx), h = Math.round(40 * sx);
cc.game.pause(); cc.game.step();
const rows = [['掉血前', grab(c[0] - w / 2, c[1] - h / 2, w, h)]]; const nums = [];
const t0 = performance.now();
boss.hp = boss.maxHp * 0.5;
for (let i = 0; i < 20; i++) {
  cc.game.step();
  const t = Math.round(performance.now() - t0);
  const s = [Math.round(v.hpShownW || 0), v.hpTrailW === undefined ? -1 : +v.hpTrailW.toFixed(1)];
  rows.push([t + ' ms  ' + s[0] + '/' + (s[1] < 0 ? '-' : s[1]), grab(c[0] - w / 2, c[1] - h / 2, w, h)]);
  nums.push([t].concat(s));
  await sleep(34);
}
window.__hpTrailNums = nums;
return strip(rows, w, h);
"""

BOSS_LOW = PRELUDE + r"""
cc.game.resume();
const boss = window.__hpBoss; const v = viewOf(boss);
boss.hp = boss.maxHp * 0.3;
await sleep(900);
cc.game.pause();
const sp = v.hpFill.getComponent(cc.Sprite);
return JSON.stringify({ bossLow: { shown: v.hpShownW, fill: [sp.color.r, sp.color.g, sp.color.b], trail: v.hpTrail.active, live: r.hpTrailViews.size } });
"""

steps = [
    {'js': one_line(ARRANGE), 'shot': 'hpbar_static'},
    {'js': one_line(TRAIL), 'save': 'hpbar_trail.png'},
    {'js': TRAIL_NUMS},
    {'js': one_line(EDGE)},
    {'js': one_line(BOSS), 'shot': 'hpbar_boss'},
    {'js': one_line(BOSS_TRAIL), 'save': 'hpbar_boss_trail.png'},
    {'js': TRAIL_NUMS},
    {'js': one_line(BOSS_LOW), 'shot': 'hpbar_boss_low'},
]
if '--resize' in sys.argv:
    # 视口改小再改回:每次都会触发战场重建(remountSceneTree),重建后再排一遍小怪
    steps += [
        {'js': "cc.game.resume(); alive().forEach(m => { m.dead = true; }); await sleep(400); return 'cleared';"},
        {'metrics': 'small', 'wait': 2.5},
        {'js': one_line(ARRANGE), 'shot': 'hpbar_resized_small'},
        {'js': "cc.game.resume(); alive().forEach(m => { m.dead = true; }); await sleep(400); return 'cleared';"},
        {'metrics': 'restore', 'wait': 2.5},
        {'js': one_line(ARRANGE), 'shot': 'hpbar_resized'},
    ]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
json.dump(steps, open(args[0], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(args[0], len(steps), 'steps')
