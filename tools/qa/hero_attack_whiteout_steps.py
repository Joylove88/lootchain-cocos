# -*- coding: utf-8 -*-
"""巡检「英雄攻击动作里有没有大片发白把人盖住」(2026-11-11 战斗画面精致化 · 样片 07)。

异界神州这批英雄的骨骼里自带普攻 / 技能特效,守卫战里每次出手都会播;其中个别贴图是不透明的实心白 / 淡色块
(甘宁的「聚气」圆盘),会把人整个盖住。本脚本生成一份 battle_polish_shots.py 的自定义步骤:
把每位英雄逐个摆到战场空地上,把守卫战里实际会选中的攻击动作按 30 帧/秒走一遍,每帧读回英雄所在的一块画面,
统计「白 / 淡色」像素占比,取占比最高的一帧拼成总览图(<视口>_whiteout_audit.png),并在日志里打印每位的统计。

用法:
  python tools/qa/hero_attack_whiteout_steps.py <步骤.json> [骨骼目录名,逗号分隔;默认异界神州 19 位]
  PYTHONIOENCODING=utf-8 python tools/qa/battle_polish_shots.py <输出目录> pc --only=guard --steps=<步骤.json>

注意:
- 英雄大小借用战场上现成的一只异界神州英雄的缩放(甘宁 / 张角),只为看遮挡,不是精确体型。
- 「淡色」= 三通道最小值 ≥ 185 且最大最小差 ≤ 75(白、淡紫、淡蓝都算;金色 / 青色的发光不算)。
- 攻击动作的选法与渲染器 loadSpineInto 一致:第一个名字含 atk / attack / gongji / skill / 普攻、且不含 hit / hurt / dead / die 的动画。
- 步骤里的 js 会被拼成一行,所以里面不能写 // 注释。
"""
import json
import sys

HEROES = ['sz_caoren', 'sz_daqiao', 'sz_dianwei', 'sz_diaochan', 'sz_ganning', 'sz_huangzhong', 'sz_huatuo', 'sz_huaxiong', 'sz_lvbu',
          'sz_sunshangxiang', 'sz_sunwukong', 'sz_taishici', 'sz_xunyou', 'sz_yangjian', 'sz_zhangchunhua', 'sz_zhangfei', 'sz_zhangjiao',
          'sz_zhaoyun', 'sz_zhugeliang']

JS = r"""
cc.game.resume(); await sleep(400); sim.paused = true; await sleep(600);
const field = r.fieldNode;
field.children.slice().forEach(c => { if (/^Guard(DamageNum|SkillFx|AttackHitFx|Impact|StrikeFx|CastFlash|MuzzleFlash|CellBurst|Floater|Projectile)/.test(c.name)) c.active = false; });
alive().forEach(m => { const v = r.monsterViews.get(m.monsterId); if (v && v.node) v.node.active = false; });
const names = __NAMES__;
const load = p => new Promise(res => cc.resources.load(p, cc.sp.SkeletonData, (e, d) => res(e ? null : d)));
const views = sim.heroes.map(h => ({ h, v: r.heroViews.get(h.unitId) })).filter(x => x.v && x.v.skeleton && x.v.skeleton.isValid);
const ref = views.find(x => /GANNING|ZHANGJIAO/.test(x.h.heroCode)) || views[0];
if (!ref) return 'no hero view ready';
const inUse = new Set(views.map(x => x.v.skeleton.skeletonData));
const refScale = Math.abs(ref.v.skeleton.node.scale.x);
const u = r.unitSize();
const holder = new cc.Node('WhiteoutProbe'); holder.layer = field.layer; field.addChild(holder); holder.addComponent(cc.UITransform);
holder.setPosition(r.xToPx(6.4), r.walkwayY() + u * 0.15, 0);
const sx = cc.view.getScaleX(), sy = cc.view.getScaleY();
const cv = cc.game.canvas; const gl = cc.director.root.device.gl;
await sleep(100);
const wp = holder.worldPosition; const vo = cc.view.getVisibleOrigin();
const cx = (wp.x - vo.x) * sx, cyTop = cv.height - (wp.y - vo.y) * sy; const up = u * sx;
const bw = Math.round(up * 2.6), bh = Math.round(up * 2.3); const bx = Math.round(cx - up * 1.1), byTop = Math.round(cyTop - up * 1.9);
const hx0 = Math.round(up * 0.45), hx1 = Math.round(up * 1.75), hy0 = Math.round(up * 0.35), hy1 = Math.round(up * 1.95);
const buf = new Uint8Array(bw * bh * 4);
const grab = () => { cc.game.step(); gl.readPixels(bx, cv.height - (byTop + bh), bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf); };
const pale = () => { let n = 0, tot = 0; for (let y = hy0; y < hy1; y++) { const row = (bh - 1 - y) * bw * 4; for (let x = hx0; x < hx1; x++) { const i = row + x * 4; const a = buf[i], b = buf[i + 1], c = buf[i + 2]; const mn = Math.min(a, b, c), mx = Math.max(a, b, c); tot++; if (mn >= 185 && mx - mn <= 75) n++; } } return n / tot; };
const tile = document.createElement('canvas'); tile.width = bw; tile.height = bh; const tg = tile.getContext('2d');
const snap = () => { const img = tg.createImageData(bw, bh); for (let y = 0; y < bh; y++) { const src = (bh - 1 - y) * bw * 4; img.data.set(buf.subarray(src, src + bw * 4), y * bw * 4); } for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; return img; };
const cols = 7; const rows = Math.ceil(names.length / cols); const pad = 6; const lab = 44;
const sheet = document.createElement('canvas'); sheet.width = cols * (bw + pad) + pad; sheet.height = rows * (bh + lab + pad) + pad; const g = sheet.getContext('2d'); g.fillStyle = '#16161c'; g.fillRect(0, 0, sheet.width, sheet.height);
const stats = {};
cc.game.pause();
for (let idx = 0; idx < names.length; idx++) { const nm = names[idx]; const data = await load('spine/hero/' + nm + '/' + nm); if (!data) { stats[nm] = 'load failed'; continue; }
 const rt = data.getRuntimeData(); const an = rt.animations.map(a => a.name); const idle = an.find(n => /idle|stand|daiji|wait/i.test(n)) || an[0]; const attack = an.find(n => /atk|attack|gongji|skill|普攻/i.test(n) && !/hit|hurt|dead|die/i.test(n)) || idle; const dur = rt.animations.find(a => a.name === attack).duration;
 const n = new cc.Node('S'); n.layer = field.layer; holder.addChild(n); n.addComponent(cc.UITransform); const sk = n.addComponent(cc.sp.Skeleton); sk.premultipliedAlpha = false; sk.skeletonData = data; n.setScale(refScale, refScale, 1);
 sk.setAnimation(0, idle, false); sk.timeScale = 0; grab(); grab(); const base = pale();
 sk.timeScale = 1; sk.setAnimation(0, attack, false); sk.timeScale = 0;
 let best = -1, bestT = 0, bestImg = null, over = 0; const steps = Math.min(90, Math.ceil(dur * 30));
 for (let i = 0; i <= steps; i++) { if (i > 0) { sk.timeScale = 1; sk.updateAnimation(1 / 30); sk.timeScale = 0; } grab(); const f = pale(); if (f - base > 0.12) over++; if (f > best) { best = f; bestT = i / 30; bestImg = snap(); } }
 stats[nm] = { attack, dur: +dur.toFixed(2), base: +base.toFixed(3), peak: +best.toFixed(3), t: +bestT.toFixed(2), framesOver: over };
 const ox = pad + (idx % cols) * (bw + pad), oy = pad + Math.floor(idx / cols) * (bh + lab + pad);
 if (bestImg) g.putImageData(bestImg, ox, oy);
 g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.strokeRect(ox + hx0 + 0.5, oy + hy0 + 0.5, hx1 - hx0, hy1 - hy0);
 g.fillStyle = (best - base > 0.12) ? '#ff9a8a' : '#e8e6e0'; g.font = '600 20px sans-serif'; g.fillText(nm + '  ' + attack, ox + 4, oy + bh + 20);
 g.font = '16px sans-serif'; g.fillText('淡色占比 ' + Math.round(best * 100) + '%(平时 ' + Math.round(base * 100) + '%) @' + bestT.toFixed(2) + 's,超标 ' + over + ' 帧', ox + 4, oy + bh + 40);
 n.destroy(); cc.game.step(); if (!inUse.has(data)) { try { cc.assetManager.releaseAsset(data); } catch (e) {} } await sleep(20); }
holder.destroy(); window.__whiteoutPng = sheet.toDataURL('image/png');
return JSON.stringify({ refScale: +refScale.toFixed(4), ref: ref.h.heroCode, box: [bw, bh], tile: { bw, bh, pad, lab, cols }, stats }, null, 1);
"""


def main():
    out = sys.argv[1]
    names = sys.argv[2].split(',') if len(sys.argv) > 2 else HEROES
    js = ' '.join(line.strip() for line in JS.strip().splitlines()).replace('__NAMES__', json.dumps(names))
    steps = [
        {'js': js},
        {'js': "return window.__whiteoutPng || 'no png';", 'save': 'whiteout_audit.png'},
    ]
    json.dump(steps, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(out, len(steps), 'steps,', len(names), 'heroes')


if __name__ == '__main__':
    main()
