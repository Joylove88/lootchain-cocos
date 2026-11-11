# -*- coding: utf-8 -*-
"""巡检「大招亮芯刷白」(2026-11-11 战斗画面精致化 · 样片 08)。

生成 battle_polish_shots.py 的自定义步骤:HERO_ULT_EFFECTS 里的每套大招在战场上各放一次,
从特效出现起逐帧推进(暂停模拟,只让特效自己播),每隔一帧读回整屏,统计「纯白」(三通道都 ≥ 245)连成的最大一块有多大,
记下最大的那一帧并拼成总览图(<视口>_ult_whiteout.png),日志里打印每套的统计(最大白块占全屏比例、出现时刻、包围盒)。

用法:
  python tools/qa/ult_whiteout_steps.py <步骤.json> [英雄码,逗号分隔;默认全部]
  PYTHONIOENCODING=utf-8 python tools/qa/battle_polish_shots.py <输出目录> pc --only=guard --steps=<步骤.json>

说明:
- 大招按英雄码触发(把场上第一位英雄临时改成该英雄码),英雄本体不换,只看特效。
- 白块按 16×16 像素的粗格统计(格内过半为纯白才算),开局没放大招时就白的格子(界面文字等)不算。
- 步骤里的 js 会被拼成一行,所以里面不能写 // 注释。
"""
import json
import re
import sys

CFG = r'D:\project\lootchain-cocos\assets\scripts\scenes\lobby\LobbyBattleSkillEffectConfig.ts'

PRELUDE = r"""
const W = cc.game.canvas.width, Hh = cc.game.canvas.height; const gl = cc.director.root.device.gl;
const CELL = 16; const gw = Math.floor(W / CELL), gh = Math.floor(Hh / CELL);
const S = window.__ultScan = window.__ultScan || { stats: {}, tiles: [], baseGrid: null };
const buf = new Uint8Array(W * Hh * 4);
const grid = new Uint16Array(gw * gh);
const scan = () => { gl.readPixels(0, 0, W, Hh, gl.RGBA, gl.UNSIGNED_BYTE, buf); grid.fill(0); for (let y = 0; y < gh * CELL; y += 2) { const row = (Hh - 1 - y) * W * 4; const gy = (y / CELL) | 0; for (let x = 0; x < gw * CELL; x += 2) { const i = row + x * 4; if (buf[i] >= 245 && buf[i + 1] >= 245 && buf[i + 2] >= 245) grid[gy * gw + ((x / CELL) | 0)]++; } } };
const HALF = (CELL / 2) * (CELL / 2) / 2;
const blob = () => { const seen = new Uint8Array(gw * gh); let best = 0, bb = null, total = 0; const base = S.baseGrid; for (let k = 0; k < gw * gh; k++) { if (grid[k] > HALF && !(base && base[k])) total++; } for (let k = 0; k < gw * gh; k++) { if (seen[k] || grid[k] <= HALF || (base && base[k])) continue; const st = [k]; seen[k] = 1; let n = 0, x0 = gw, y0 = gh, x1 = 0, y1 = 0; while (st.length) { const c = st.pop(); n++; const cx = c % gw, cy = (c / gw) | 0; if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy; const nb = [cx > 0 ? c - 1 : -1, cx < gw - 1 ? c + 1 : -1, cy > 0 ? c - gw : -1, cy < gh - 1 ? c + gw : -1]; for (const q of nb) { if (q >= 0 && !seen[q] && grid[q] > HALF && !(base && base[q])) { seen[q] = 1; st.push(q); } } } if (n > best) { best = n; bb = [x0 * CELL, y0 * CELL, (x1 + 1) * CELL, (y1 + 1) * CELL]; } } return { n: best, bb, total }; };
"""

BASE = PRELUDE + r"""
cc.game.resume(); await sleep(300);
r.fieldNode.children.forEach(c => { if (/^Guard(DamageNum|Floater)/.test(c.name)) c.active = false; });
r.queueDamage = () => {}; r.spawnFloater = () => {};
for (let i = 0; i < 60 && (r.ultFxLive > 0 || r.skillFxLive > 0); i++) await sleep(100);
await sleep(400); cc.game.pause(); cc.game.step(); scan();
const b = new Uint8Array(gw * gh); for (let k = 0; k < gw * gh; k++) b[k] = grid[k] > HALF ? 1 : 0; S.baseGrid = b; S.stats = {}; S.tiles = [];
cc.game.resume();
return 'base white cells ' + b.reduce((a, v) => a + v, 0) + ' / ' + (gw * gh);
"""

ONE = PRELUDE + r"""
const codes = __CODES__;
const out = {};
for (const pair of codes) { const code = pair[0], effect = pair[1];
 cc.game.resume(); sim.paused = false;
 for (let i = 0; i < 60 && (r.ultFxLive > 0 || r.skillFxLive > 0); i++) await sleep(100);
 let hero = sim.heroes.find(h => h.heroCode === code);
 if (!hero) { hero = sim.heroes[0]; const entry = (sim.pool || []).find(e => e.heroCode === hero.heroCode); if (entry) entry.heroCode = code; hero.heroCode = code; }
 hero.star = Math.max(hero.star, 2); M.guardHeroPerks(sim, hero.heroCode).ultLv = 1;
 r.heroFxLastAt.delete(hero.heroCode); r.lastUltDimAt = 0;
 if (alive().length < 4) { for (let k = 0; k < 5; k++) sim.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: sim.timeMs + 40 + k * 30 }); }
 for (let i = 0; i < 40 && alive().length < 4; i++) await sleep(100);
 alive().forEach((m, k) => { m.x = 3.4 + (k % 5) * 0.5; m.speedCellsPerSec = 0; m.hp = 9e8; m.maxHp = 9e8; });
 await sleep(150);
 const known = new Set(fxNodes());
 hero.skillReadyMs = sim.timeMs; hero.skillPendingSinceMs = 0;
 let node = null;
 for (let i = 0; i < 160 && !node; i++) { await sleep(50); if (M.guardHeroSkillPending && M.guardHeroSkillPending(sim, hero)) M.guardCastHeroSkillNow(sim, hero.unitId); node = fxNodes().find(c => !known.has(c) && c.getComponent(cc.sp.Skeleton) && c.getComponent(cc.sp.Skeleton).skeletonData) || null; }
 if (!node) { out[code] = { effect, err: 'not fired' }; continue; }
 const got = describe(node).data; cc.game.pause(); sim.paused = true;
 let best = { n: -1 }, bestBuf = null, frames = 0, t0 = performance.now();
 for (let i = 0; i < 420 && node.isValid; i++) { cc.game.step(); if (i % 2) continue; frames++; scan(); const b = blob(); if (b.n > best.n) { const d = describe(node); best = { n: b.n, bb: b.bb, total: b.total, t: d.t, step: i }; bestBuf = buf.slice(); } }
 out[code] = { effect, got, frames, ms: Math.round(performance.now() - t0), blobPct: +(best.n * CELL * CELL * 100 / (W * Hh)).toFixed(2), totalPct: +(best.total * CELL * CELL * 100 / (W * Hh)).toFixed(2), t: best.t, bb: best.bb };
 S.stats[code] = out[code];
 if (bestBuf) { const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d'); const img = g.createImageData(W, Hh); for (let y = 0; y < Hh; y++) { const src = (Hh - 1 - y) * W * 4; img.data.set(bestBuf.subarray(src, src + W * 4), y * W * 4); } for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; g.putImageData(img, 0, 0); const tw = 480, th = Math.round(480 * Hh / W); const t = document.createElement('canvas'); t.width = tw; t.height = th; t.getContext('2d').drawImage(cv, 0, 0, tw, th); S.tiles.push({ code, effect, url: t.toDataURL('image/jpeg', 0.9), bb: best.bb, blobPct: out[code].blobPct, totalPct: out[code].totalPct, t: best.t }); }
 sim.paused = false; cc.game.resume(); await sleep(300); }
return JSON.stringify(out);
"""

SHEET = r"""
const S = window.__ultScan; const W = cc.game.canvas.width, Hh = cc.game.canvas.height;
const tiles = S.tiles.slice().sort((a, b) => b.blobPct - a.blobPct);
const tw = 480, th = Math.round(480 * Hh / W), cols = 4, lab = 30, pad = 6;
const sheet = document.createElement('canvas'); sheet.width = cols * (tw + pad) + pad; sheet.height = Math.ceil(tiles.length / cols) * (th + lab + pad) + pad;
const g = sheet.getContext('2d'); g.fillStyle = '#16161c'; g.fillRect(0, 0, sheet.width, sheet.height);
const load = u => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
for (let i = 0; i < tiles.length; i++) { const t = tiles[i]; const ox = pad + (i % cols) * (tw + pad), oy = pad + Math.floor(i / cols) * (th + lab + pad); g.drawImage(await load(t.url), ox, oy); if (t.bb) { const k = tw / W; g.strokeStyle = '#ff5a5a'; g.lineWidth = 1; g.strokeRect(ox + t.bb[0] * k + 0.5, oy + t.bb[1] * k + 0.5, (t.bb[2] - t.bb[0]) * k, (t.bb[3] - t.bb[1]) * k); } g.fillStyle = t.blobPct >= 1.5 ? '#ff9a8a' : '#e8e6e0'; g.font = '16px sans-serif'; g.fillText(t.code + ' · ' + t.effect + '  最大白块 ' + t.blobPct + '%(纯白合计 ' + t.totalPct + '%)@' + (t.t !== undefined ? t.t.toFixed(2) : '?') + 's', ox + 2, oy + th + 20); }
return sheet.toDataURL('image/png');
"""


def one_line(js):
    return ' '.join(line.strip() for line in js.strip().splitlines())


def main():
    out = sys.argv[1]
    src = open(CFG, encoding='utf-8').read()
    block = src[src.index('const HERO_ULT_EFFECTS'):]
    block = block[:block.index('\n};')]
    pairs = re.findall(r"^\s+([A-Z0-9_]+): \{ effect: '([a-z0-9_]+)'", block, re.M)
    if len(sys.argv) > 2:
        want = sys.argv[2].split(',')
        pairs = [p for p in pairs if p[0] in want]
    steps = [{'js': one_line(BASE)}]
    # 每步放 4 套:单步执行有时限,别把 22 套塞进一步
    for k in range(0, len(pairs), 4):
        steps.append({'js': one_line(ONE).replace('__CODES__', json.dumps(pairs[k:k + 4]))})
    steps.append({'js': one_line(SHEET), 'save': 'ult_whiteout.png'})
    json.dump(steps, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(out, len(steps), 'steps,', len(pairs), 'ults')


if __name__ == '__main__':
    main()
