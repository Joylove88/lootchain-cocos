# -*- coding: utf-8 -*-
"""野外角色可读性诊断 / 自验(2026-11-26 用户:「主角和随行英雄跟写实背景混在一起,看不出谁是谁,边缘发糊」)。

同一帧定格(director.pause)截多张,离线算出人物轮廓,量化「人和背景分不分得开」:
  cur      现状(藏界面)
  bg       同帧把队伍藏掉 = 纯背景
  black    同帧把队伍染黑 = 求人物不透明度(alpha = 1 - black / bg)
  noov     同帧关掉盖在世界层上的调色层(TodWash / TodMul / TodSun / TodGlow / LifeDapple / FieldLookOverlay)
  hit_*    普攻命中那一帧(同样 cur / bg / black 三张)
并打印每个队员的贴图密度(贴图像素 / 屏幕像素,由本帧顶点缓冲按三角形面积算)、缩放、预乘、过滤方式。

  python tools/qa/field_actor_read.py [输出目录] [--map=WOODS] [--pc] [--tag=before]
产物:<输出目录>/phone_<tag>_*.png、metrics_<tag>.json、read_<tag>.jpg(人物轮廓 / 背景环带对比图)。
要求 7456 预览 + 8081 后端;一次只跑一个无头 Edge(battle_polish_shots 自带收尾)。
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = {a[2:].split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
OUT = ARGS[0] if ARGS else os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'actor_read')
MAP = OPT.get('map', 'WOODS')
TAG = OPT.get('tag', 'before')
VIEW = 'pc' if OPT.get('pc') else 'phone'
SPOT = OPT.get('spot')  # "x,y":把队伍挪到这里(不传 = 默认站在怪群旁)

HELPERS = r"""
window.__ar = (() => {
  const W = t.world;
  const actors = () => [t.leader, ...t.followers].filter(a => a && a.node && a.node.isValid);
  const op = (n, v) => { const o = n.getComponent(cc.UIOpacity) || n.addComponent(cc.UIOpacity); const old = o.opacity; o.opacity = v; return old; };
  const OV = ['TodWash', 'TodMul', 'TodGlow', 'TodSun', 'LifeDapple', 'FieldLookOverlay'];
  const saved = new Map();
  const hideUI = () => { let n = W; while (n.parent && n.parent !== cc.director.getScene()) { n.parent.children.forEach(s => { if (s !== n && s.getComponent(cc.UITransform)) { const o = s.getComponent(cc.UIOpacity) || s.addComponent(cc.UIOpacity); o.opacity = 0; } }); n = n.parent; } };
  const shot = () => { hideUI(); cc.game.step(); hideUI(); cc.game.step(); return cc.game.canvas.toDataURL('image/png'); };
  return {
    actors, shot,
    overlays(on) { for (const nm of OV) { const n = W.getChildByName(nm); if (!n) continue; if (!on) { saved.set(nm, op(n, 0)); } else if (saved.has(nm)) { op(n, saved.get(nm)); } } },
    party(v) { actors().forEach(a => op(a.node, v)); },
    black(on) { actors().forEach(a => { if (!a.skeleton) return; if (on) { a.__c = a.skeleton.color.clone(); a.skeleton.color = new cc.Color(0, 0, 0, 255); } else if (a.__c) { a.skeleton.color = a.__c; } a.skeleton.markForUpdateRenderData(true); a.skeleton.updateRenderData && a.skeleton.updateRenderData(); }); },
    measure() {
      const cv = cc.game.canvas; const vis = cc.view.getVisibleSize(); const fb = cv.width / vis.width;
      const res = { fb, canvas: [cv.width, cv.height], k: t.k, dpr: window.devicePixelRatio, map: t.def && t.def.code, actors: [] };
      for (const a of actors()) {
        const s = a.skeleton; const info = { hero: a.hero && a.hero.heroCode, name: a.hero && a.hero.heroName, protagonist: !!(a.hero && a.hero.protagonist) };
        res.actors.push(info);
        if (!s) { info.err = 'no skeleton'; continue; }
        const tf = s.node.getComponent(cc.UITransform); const ws = s.node.worldScale;
        info.nodeScale = [s.node.scale.x, s.node.scale.y]; info.worldScale = [ws.x, ws.y];
        info.pma = s.premultipliedAlpha; info.color = [s.color.r, s.color.g, s.color.b];
        const texs = (s.skeletonData && s.skeletonData.textures) || [];
        info.textures = texs.map(tx => { const im = tx && tx.image; const g = tx && tx.getGFXSampler && tx.getGFXSampler(); const gt = tx.getGFXTexture && tx.getGFXTexture(); return [tx.width, tx.height, tx._minFilter, tx._magFilter, tx._mipFilter, (tx.mipmapLevel || (tx._mipmapLevel)) || 1, gt ? gt.levelCount : -1]; });
        const rd = s.renderData; info.rdKeys = rd ? Object.keys(rd).slice(0, 40) : null;
        const vb = rd && rd.chunk && rd.chunk.vb; const st = rd && rd.floatStride; const nv = rd && rd.vertexCount;
        const ib = rd && (rd.indices || (rd._indices));
        info.vcount = nv; info.stride = st; info.icount = ib ? (rd.indexCount || ib.length) : 0;
        if (!vb || !st) continue;
        // 顶点:未合批 = 骨骼节点本地坐标;合批 = 世界坐标
        const toPx = (x, y) => { const p = s.enableBatch ? new cc.Vec3(x, y, 0) : tf.convertToWorldSpaceAR(new cc.Vec3(x, y, 0)); return [p.x * fb, cv.height - p.y * fb]; };
        let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        const px = []; const uv = [];
        for (let i = 0; i < nv; i++) { const o = i * st; const p = toPx(vb[o], vb[o + 1]); px.push(p); uv.push([vb[o + 3], vb[o + 4]]);
          const col = st >= 6 ? new Uint32Array(vb.buffer, vb.byteOffset + (o + 5) * 4, 1)[0] : 0xffffffff; if (((col >>> 24) & 255) === 0) continue;
          if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
        info.rect = [minx, miny, maxx, maxy].map(v => Math.round(v));
        const T = texs[0] || { width: 1, height: 1 };
        let ta = 0, sa = 0; const per = [];
        const cnt = info.icount;
        let base = 1e9; for (let i = 0; i < cnt; i++) if (ib[i] < base) base = ib[i];
        info.ibase = base;
        if (ib && cnt >= 3) {
          for (let i = 0; i + 2 < cnt; i += 3) { const a1 = ib[i] - base, b1 = ib[i + 1] - base, c1 = ib[i + 2] - base; if (a1 >= nv || b1 >= nv || c1 >= nv) continue;
            const A = px[a1], B = px[b1], C = px[c1]; const s2 = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
            const U = uv[a1], V = uv[b1], X = uv[c1]; const t2 = Math.abs(((V[0] - U[0]) * (X[1] - U[1]) - (X[0] - U[0]) * (V[1] - U[1])) * T.width * T.height) / 2;
            if (s2 > 4) { ta += t2; sa += s2; per.push(Math.sqrt(t2 / s2)); } }
        }
        per.sort((p, q) => p - q);
        info.texelPerPx = sa > 0 ? +Math.sqrt(ta / sa).toFixed(3) : null;
        info.texelPerPxMedian = per.length ? +per[per.length >> 1].toFixed(3) : null;
        info.rectH = Math.round(maxy - miny);
      }
      return JSON.stringify(res);
    },
  };
})();
"""

# --proto:同帧套上 effects/world-actor 材质的几档参数(描边宽度单位 = 帧缓冲像素)
PROTO = {
    's0_now': dict(w=2.4, ol=(0.04, 0.035, 0.03, 0.8), rim=(1.0, 0.94, 0.8, 0.32), rimW=1.0, pop=(1.12, 1.06, 0.04)),
    's1_bias': dict(w=2.4, ol=(0.04, 0.035, 0.03, 0.8), rim=(1.0, 0.94, 0.8, 0.32), rimW=1.0, pop=(1.12, 1.06, 0.04), sharp=(0.0, 0.0, -0.7)),
    's2_bias_sharp': dict(w=2.4, ol=(0.04, 0.035, 0.03, 0.8), rim=(1.0, 0.94, 0.8, 0.32), rimW=1.0, pop=(1.12, 1.06, 0.04), sharp=(0.6, 1.0, -0.7)),
    's3_sharp_softol': dict(w=2.0, ol=(0.04, 0.035, 0.03, 0.8), olo=0.15, ohi=0.85, rim=(1.0, 0.94, 0.8, 0.32), rimW=1.0, pop=(1.12, 1.06, 0.04), sharp=(0.6, 1.0, -0.7)),
}
PROTO_JS = r"""
const eff = await new Promise(r => cc.resources.load('effects/world-actor', cc.EffectAsset, (e, a) => r(e ? 'ERR ' + e.message : a)));
if (typeof eff === 'string') return eff;
window.__am = (c) => { for (const a of window.__ar.actors()) { const s = a.skeleton; if (!s) continue;
  if (!c) { s.customMaterial = null; } else { const m = new cc.Material(); m.initialize({ effectAsset: eff });
    m.setProperty('olStyle', new cc.Vec4(c.w, c.olo ?? 0.35, c.ohi ?? 0.7, 1)); if (c.sharp) m.setProperty('sharpParams', new cc.Vec4(c.sharp[0], c.sharp[1], c.sharp[2], 0)); m.setProperty('olColor', new cc.Vec4(...c.ol)); m.setProperty('rimColor', new cc.Vec4(...c.rim));
    m.setProperty('popParams', new cc.Vec4(c.pop[0], c.pop[1], c.pop[2], 0)); m.setProperty('olDir', new cc.Vec4(-0.8, 0.6, 1, c.rimW || 1.25), 4); s.customMaterial = m; }
  if (c && c.white) { if (!a.__c0) a.__c0 = s.color.clone(); s.color = new cc.Color(255, 255, 255, 255); } else if (a.__c0) { s.color = a.__c0; a.__c0 = null; }
  s.markForUpdateRenderData(true); } };
return 'proto ready';
"""

# --ab:游戏里已经套了 world-actor 材质时,同帧摘掉材质 + 还原地图人物偏色 = 改前画面(等效 ?actorlook=0)
AB_OFF = r"""for (const a of window.__ar.actors()) { const s = a.skeleton; if (!s) continue; a.__m = s.customMaterial; a.__k = s.color.clone();
  s.customMaterial = null; const tt = t.def.actorTint; if (tt) s.color = new cc.Color(tt[0], tt[1], tt[2], 255); s.markForUpdateRenderData(true); }
const u = window.__ar.shot();
for (const a of window.__ar.actors()) { const s = a.skeleton; if (!s) continue; s.customMaterial = a.__m; s.color = a.__k; s.markForUpdateRenderData(true); }
window.__ar.shot(); return u;"""

FREEZE = "cc.director.pause(); cc.game.step(); await sleep(150); return 'frozen';"


def steps():
    st = [{'js': "return 'settle';", 'wait': 6}]
    if SPOT:
        x, y = [float(v) for v in str(SPOT).split(',')]
        st.append({'js': f"""const all=[t.leader,...t.followers]; all.forEach((a,i)=>{{a.x={x}-i*90;a.y={y}-(i%2)*40;a.node.setPosition(a.x,a.y,0);}});
t.trail=[new cc.Vec2({x}-300,{y}),new cc.Vec2({x},{y})]; t.applyCamera(true);
(t.monsters || []).forEach(m => {{ if (m.node) m.node.active = false; m.x = 1e7; m.y = 1e7; }}); await sleep(3500); return 'tp';"""})
    st.append({'js': HELPERS + "return 'helpers';"})
    if OPT.get('leaderspine'):
        # --leaderspine=protag_f_lh:临时把队长骨骼换成另一套(测试号是男主时验女主 / 别的外观)
        path = f"spine/hero/{OPT['leaderspine']}/{OPT['leaderspine']}"
        st.append({'js': f"""const data = await new Promise(r => cc.resources.load('{path}', cc.sp ? cc.sp.SkeletonData : cc.SkeletonData, (e, a) => r(e ? null : a)));
if (!data) return 'leaderspine load failed'; const L = t.leader; L.skeleton.skeletonData = data; t.applyActorAnimation(L, true); await sleep(1500); return 'leaderspine ok';"""})
    st.append({'js': FREEZE})
    st.append({'js': "return window.__ar.measure();"})
    st.append({'js': "return window.__ar.shot();", 'save': f'{TAG}_cur.png'})
    st.append({'js': "window.__ar.party(0); const u = window.__ar.shot(); window.__ar.party(255); return u;", 'save': f'{TAG}_bg.png'})
    st.append({'js': "window.__ar.black(true); const u = window.__ar.shot(); window.__ar.black(false); return u;", 'save': f'{TAG}_black.png'})
    st.append({'js': "window.__ar.overlays(false); const u = window.__ar.shot(); window.__ar.overlays(true); return u;", 'save': f'{TAG}_noov.png'})
    if OPT.get('proto'):
        st.append({'js': PROTO_JS})
        for k, c in PROTO.items():
            st.append({'js': f"window.__am({json.dumps(c)}); const u = window.__ar.shot(); return u;", 'save': f'{TAG}_{k}.png'})
        st.append({'js': "window.__am(null); window.__ar.shot(); return 'reset';"})
    if OPT.get('ab'):
        st.append({'js': AB_OFF, 'save': f'{TAG}_off.png'})
    st.append({'js': "window.__ar.overlays(false); window.__ar.party(0); const u = window.__ar.shot(); window.__ar.party(255); window.__ar.overlays(true); return u;", 'save': f'{TAG}_noov_bg.png'})
    # 命中那一帧:放开普攻,约 0.3 秒刀落下时定格
    st.append({'js': "cc.director.resume(); t.skillReadyAt=[0,0,0]; t.actionUntil=0; t.leaderAttack(); await sleep(320); cc.director.pause(); cc.game.step(); return 'hit';"})
    st.append({'js': "return window.__ar.measure();"})
    st.append({'js': "return window.__ar.shot();", 'save': f'{TAG}_hit_cur.png'})
    st.append({'js': "window.__ar.party(0); const u = window.__ar.shot(); window.__ar.party(255); return u;", 'save': f'{TAG}_hit_bg.png'})
    st.append({'js': "window.__ar.black(true); const u = window.__ar.shot(); window.__ar.black(false); return u;", 'save': f'{TAG}_hit_black.png'})
    if OPT.get('ab'):
        st.append({'js': AB_OFF, 'save': f'{TAG}_hit_off.png'})
    if OPT.get('proto'):
        for k, c in PROTO.items():
            st.append({'js': f"window.__am({json.dumps(c)}); const u = window.__ar.shot(); return u;", 'save': f'{TAG}_hit_{k}.png'})
        st.append({'js': "window.__am(null); window.__ar.shot(); return 'reset';"})
    st.append({'js': "cc.director.resume(); return 'resumed';"})
    return st


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def srgb_to_lab(c):
    c = c / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def analyze(prefix, rects):
    """人物 alpha 由 black / bg 求;每个人的框内:人物像素 vs 轮廓外 6~26 像素环带的背景。"""
    cur = np.asarray(Image.open(prefix + '_cur.png').convert('RGB')).astype(np.float32)
    bg = np.asarray(Image.open(prefix + '_bg.png').convert('RGB')).astype(np.float32)
    blk = np.asarray(Image.open(prefix + '_black.png').convert('RGB')).astype(np.float32)
    lb, lk = lum(bg), lum(blk)
    alpha = np.clip(1 - lk / np.maximum(lb, 1), 0, 1)
    alpha[lb < 18] = (np.abs(cur - bg).sum(-1) > 20)[lb < 18]
    mask = alpha > 0.5
    out = []
    H, W = mask.shape
    for r in rects:
        if not r:
            out.append(None)
            continue
        x0, y0, x1, y1 = max(0, r[0] - 30), max(0, r[1] - 30), min(W, r[2] + 30), min(H, r[3] + 30)
        m = Image.fromarray((mask[y0:y1, x0:x1] * 255).astype(np.uint8))
        inner = np.asarray(m.filter(ImageFilter.MinFilter(5))) > 127      # 轮廓内缩 2px,去掉边缘混色
        d1 = np.asarray(m.filter(ImageFilter.MaxFilter(13))) > 127
        d2 = np.asarray(m.filter(ImageFilter.MaxFilter(53))) > 127
        ring = d2 & ~d1
        edge = (np.asarray(m.filter(ImageFilter.MaxFilter(3))) > 127) & ~(np.asarray(m.filter(ImageFilter.MinFilter(3))) > 127)
        c = cur[y0:y1, x0:x1]
        if inner.sum() < 50 or ring.sum() < 50:
            out.append(None)
            continue
        ca, cb = c[inner], c[ring]
        la, lbm = lum(ca), lum(cb)
        lab_a, lab_b = srgb_to_lab(ca).mean(0), srgb_to_lab(cb).mean(0)
        sat = lambda p: ((p.max(-1) - p.min(-1)) / np.maximum(p.max(-1), 1)).mean()
        # 轮廓清晰度:沿轮廓的亮度梯度(cur 图),和人物内部梯度比
        g = lum(c)
        gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
        gy = np.abs(np.diff(g, axis=0, prepend=g[:1, :]))
        grad = np.hypot(gx, gy)
        out.append({
            'px': int(inner.sum()),
            'lumActor': round(float(la.mean()), 1), 'lumBg': round(float(lbm.mean()), 1),
            'michelson': round(float(abs(la.mean() - lbm.mean()) / max(1, la.mean() + lbm.mean())), 3),
            'deltaE': round(float(np.linalg.norm(lab_a - lab_b)), 1),
            'deltaL': round(float(lab_a[0] - lab_b[0]), 1),
            'satActor': round(float(sat(ca)), 3), 'satBg': round(float(sat(cb)), 3),
            'edgeGrad': round(float(grad[edge].mean()), 1), 'innerGrad': round(float(grad[inner].mean()), 1), 'bgGrad': round(float(grad[ring].mean()), 1),
        })
    return out, mask


def sheet(prefix, rects, metrics, mask, title):
    cur = Image.open(prefix + '_cur.png').convert('RGB')
    xs = [r for r in rects if r]
    if not xs:
        return
    x0 = max(0, min(r[0] for r in xs) - 160)
    y0 = max(0, min(r[1] for r in xs) - 120)
    x1 = min(cur.width, max(r[2] for r in xs) + 160)
    y1 = min(cur.height, max(r[3] for r in xs) + 80)
    crop = cur.crop((x0, y0, x1, y1))
    mk = Image.fromarray((mask[y0:y1, x0:x1] * 255).astype(np.uint8)).convert('RGB')
    w = 900
    hh = round(crop.height * w / crop.width)
    a = crop.resize((w, hh), Image.LANCZOS)
    b = mk.resize((w, hh), Image.NEAREST)
    im = Image.new('RGB', (w * 2, hh + 40), (20, 20, 20))
    im.paste(a, (0, 40))
    im.paste(b, (w, 40))
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
    ImageDraw.Draw(im).text((10, 6), title, fill=(255, 230, 140), font=font)
    im.save(prefix + '_read.jpg', quality=88)


def main():
    os.makedirs(OUT, exist_ok=True)
    sp = os.path.join(OUT, f'steps_{TAG}.json')
    json.dump(steps(), open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=MAP)
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), OUT, VIEW, '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)
    log = p.stdout + p.stderr
    open(os.path.join(OUT, f'log_{TAG}.txt'), 'w', encoding='utf-8').write(log)
    meas = []
    for line in log.splitlines():
        i = line.find('step {"fb"')
        if i >= 0:
            meas.append(json.loads(line[i + 5:]))
    report = {'measure': meas}
    for k, (pre, m) in enumerate(((f'{VIEW}_{TAG}', meas[0] if meas else None), (f'{VIEW}_{TAG}_hit', meas[1] if len(meas) > 1 else None))):
        prefix = os.path.join(OUT, pre)
        if not m or not os.path.exists(prefix + '_cur.png'):
            continue
        rects = [a.get('rect') for a in m['actors']]
        res, mask = analyze(prefix, rects)
        report['hit' if k else 'idle'] = [dict(hero=a.get('hero'), **(r or {})) for a, r in zip(m['actors'], res)]
        if k == 0 and os.path.exists(prefix + '_noov.png'):
            # 调色层对人物的影响:同一人物像素,关层前后亮度 / 饱和度
            cur = np.asarray(Image.open(prefix + '_cur.png').convert('RGB')).astype(np.float32)
            nov = np.asarray(Image.open(prefix + '_noov.png').convert('RGB')).astype(np.float32)
            inner = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))) > 127
            sat = lambda p: float(((p.max(-1) - p.min(-1)) / np.maximum(p.max(-1), 1)).mean())
            report['overlayOnActors'] = {'lumWith': round(float(lum(cur[inner]).mean()), 1), 'lumWithout': round(float(lum(nov[inner]).mean()), 1),
                                         'satWith': round(sat(cur[inner]), 3), 'satWithout': round(sat(nov[inner]), 3)}
        sheet(prefix, rects, res, mask, f'{MAP} {TAG} {"命中帧" if k else "待机"}')
    json.dump(report, open(os.path.join(OUT, f'metrics_{TAG}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False, indent=1)[:6000])
    errs = [l for l in log.splitlines() if 'EXC' in l or 'rror' in l]
    if errs:
        print('\n'.join(errs[-15:]))


if __name__ == '__main__':
    main()
