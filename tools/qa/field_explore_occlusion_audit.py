# -*- coding: utf-8 -*-
"""野外探索内容遮挡全量检查(2026-11-26 用户:林地采集点名字被石墙挡住只露「已采」,要求全图排查)。

无头 Edge 打开预览 7456 → 登录 selfchk1108 → 依次进 VILLAGE / WOODS / GRAY / DEADWOOD / CITY →
每个探索物(宝箱 / 兴趣点 / 隐藏点 / 传送阵 / 出口)把镜头移过去,暂停游戏手动出帧,截两张:
  ① 原样  ② 关掉所有遮挡件(立物遮挡 / 整图重绘遮挡件 / 建筑 / 场景遮挡条)的贴图
对比两张在「名字 / 圆徽 / 本体」各自屏幕框里的像素差,差异像素占比 = 被盖住的比例。
超过阈值的写进报告并存左右对比裁图。
用法:PYTHONIOENCODING=utf-8 python tools/qa/field_explore_occlusion_audit.py [输出目录] [--maps=WOODS,GRAY]
"""
import asyncio
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.request

import websockets
from PIL import Image, ImageChops, ImageDraw, ImageFilter

import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
# 独立调试端口:默认 9334 会和别的会话同时跑的自验脚本撞上(连到别人的浏览器,对方收尾时连接被重置)
base.PORT = int(os.environ.get('EDGE_PORT', '9417'))
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'field_explore_occlusion')
MAPS = next((a.split('=', 1)[1].split(',') for a in sys.argv[1:] if a.startswith('--maps=')), ['VILLAGE', 'WOODS', 'GRAY', 'DEADWOOD', 'CITY'])
ACCOUNT = os.environ.get('QA_ACCOUNT', 'selfchk1108')
THRESH = float(os.environ.get('OCC_THRESH', '0.06'))
RELOCATE = [x for x in os.environ.get('RELOCATE', '').split(',') if x]
RELOC_MAX = int(os.environ.get('RELOC_MAX', '160'))
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 40 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")

# 页面里的工具:列探索物、取各部件屏幕框、开关遮挡件
HELPERS = r"""
window.__occ = window.__occ || {};
const H = window.__occ;
H.items = () => {
  const out = [];
  for (const [code, e] of t.chestNodes) out.push({ id: 'chest:' + code, x: e.node.position.x, y: e.node.position.y });
  for (const [code, e] of t.poiNodes) { const p = e.poi; out.push({ id: 'poi:' + p.kind + ':' + code, x: p.x, y: p.y }); }
  if (t.waypointNode && t.waypointNode.isValid) out.push({ id: 'waypoint', x: t.def.waypoint.x, y: t.def.waypoint.y });
  for (const ex of t.def.exits) out.push({ id: 'exit:' + ex.key, x: ex.x, y: ex.y });
  return out;
};
H.partNodes = (id) => {
  const res = {};
  const add = (name, node) => { if (node && node.isValid && node.activeInHierarchy) res[name] = node; };
  if (id.startsWith('chest:')) {
    const e = t.chestNodes.get(id.slice(6));
    if (e) { add('art', e.sprite && e.sprite.node); add('name', e.name && e.name.node); add('badge', e.badge); }
  } else if (id.startsWith('poi:')) {
    const code = id.split(':')[2]; const e = t.poiNodes.get(code);
    if (e) {
      if (e.poi.kind === 'HIDDEN') { add('art', e.node.getChildByName('Art')); add('badge', e.badge && e.badge.getChildByName('Badge')); }
      else { add('art', e.art); add('name', e.name && e.name.node); add('badge', e.badge); }
    }
  } else if (id === 'waypoint') {
    add('art', t.waypointNode.getChildByName('Art'));
  } else if (id.startsWith('exit:')) {
    const n = t.groundRoot.getChildByName('TownExit_' + id.slice(5));
    if (n) add('name', n.getChildByName('Label'));
    // 迁到标签层后名字不在出口节点下
    const tag = t.tagRoot && t.tagRoot.isValid ? t.tagRoot.getChildByName('Tag_exit_' + id.slice(5)) : null;
    if (tag) add('name', tag.getChildByName('Label'));
  }
  return res;
};
H.parts = (id) => {
  const res = H.partNodes(id); const out = {};
  for (const k in res) { const lab = res[k].getComponent(cc.Label); out[k] = lab ? lab.string : 1; }
  return out;
};
H.showPart = (id, name, on) => { const n = H.partNodes(id)[name] || H._hidden; if (!on) { H._hidden = n; } if (n) n.active = on; };
H.blockers = () => {
  const list = [];
  // 整图重绘的遮挡件:形状贴图按图块拆成子节点挂在 Art 下,要把整棵子树的贴图都关掉
  for (const o of t.occluders) if (o.node && o.node.isValid) o.node.getComponentsInChildren(cc.Sprite).forEach(s => list.push(s));
  for (const b of t.buildings || []) { if (b.node && b.node.isValid && !(b.cfg && b.cfg.flat)) b.node.getComponentsInChildren(cc.Sprite).forEach(s => list.push(s)); }
  if (t.scene && t.scene.root && t.scene.root.isValid) t.scene.root.getComponentsInChildren(cc.Sprite).forEach(s => list.push(s));
  return list;
};
H.setBlockers = (on) => { for (const s of H.blockers()) s.enabled = on; };
// 挪探索物(找新点位用):本体节点 + 标签层节点 + 排序用的脚线 y 一起改
H.itemNode = (id) => { if (id.startsWith('chest:')) { const e = t.chestNodes.get(id.slice(6)); return e && e.node; } if (id.startsWith('poi:')) { const e = t.poiNodes.get(id.split(':')[2]); return e && e.node; } return null; };
H.tagNode = (id) => { if (!t.tagRoot) return null; if (id.startsWith('chest:')) return t.tagRoot.getChildByName('Tag_chest_' + id.slice(6)); if (id.startsWith('poi:')) return t.tagRoot.getChildByName('Tag_poi_' + id.split(':')[2]); return null; };
H.moveItem = (id, x, y) => {
  const n = H.itemNode(id); if (!n) return 0; n.setPosition(x, y, 0);
  const tag = H.tagNode(id); if (tag) tag.setPosition(x, y, 0);
  const pn = t.propNodes.find(p => p.node === n); if (pn) pn.y = y;
  t.sortEntities(true); return 1;
};
// 候选点:可走、离怪群够远(同 snapPois 的 clear)
H.candidates = (x0, y0, rMax) => {
  const out = [];
  for (let r = 40; r <= rMax; r += 20) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2; const x = Math.round(x0 + Math.cos(a) * r); const y = Math.round(y0 + Math.sin(a) * r * 0.7);
    if (!t.walkable(x, y)) continue;
    if (!t.def.camps.every(c => Math.hypot(x - c.x, (y - c.y) / 0.7) > c.radius + 420)) continue;
    // 往镜头这边(脚线往下)挪更容易站到遮挡件前面:同距离下优先
    out.push([x, y, Math.hypot(x - x0, y - y0) + (y > y0 ? 30 : 0)]);
  }
  out.sort((a, b) => a[2] - b[2]);
  return out;
};
"""
TP = ("const all=[t.leader,...t.followers]; all.forEach((a,i)=>{ a.x={x}-i*60; a.y={y}; a.node.setPosition(a.x,a.y,0); });"
      " t.trail=[new cc.Vec2({x}-200,{y}), new cc.Vec2({x},{y})]; t.applyCamera(true); return 1;")


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + HELPERS + body + " } catch (e) { return 'err ' + e.message + ' ' + (e.stack||'').slice(0,300); } })()"


def diff_ratio(a, b, box):
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(a.width, x1), min(a.height, y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    da = ImageChops.difference(a.crop((x0, y0, x1, y1)), b.crop((x0, y0, x1, y1))).convert('L')
    hist = da.histogram()
    changed = sum(hist[28:])
    return changed / max(1, (x1 - x0) * (y1 - y0))


async def main():
    # 配置目录放在 lootchain-qa 外面:别的会话的脚本开跑前会用 edge_guard.py 清掉 lootchain-qa 下所有测试浏览器(11-26 被连杀 4 次)
    profile = os.path.join(os.environ.get('TEMP') or '.', 'lc_occaudit_profile')
    proc = subprocess.Popen([base.EDGE, '--headless=new', '--disable-extensions', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    report = []
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(body, timeout=180):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def grab():
                m = None
                for attempt in range(3):
                    try:
                        m = await call('Page.captureScreenshot', {'format': 'png'}, 60)
                        break
                    except (asyncio.TimeoutError, TimeoutError):
                        print('grab timeout, retry', attempt, flush=True)
                        await ev("cc.director.tick(0); return 1;")
                return Image.open(io.BytesIO(base64.b64decode(m['result']['data']))).convert('RGB')

            async def settle(max_s=300):
                calm = 0
                for _ in range(max_s // 2):
                    calm = calm + 1 if await ev(BUSY) == 'ok' else 0
                    if calm >= 3:
                        return
                    await asyncio.sleep(2)

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(240):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'pass1234'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
            for _ in range(400):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted()) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(2)
            idle = 0
            for _ in range(60):
                got = await ev(CLEAR)
                idle = idle + 1 if got == 'none' else 0
                if idle >= 3:
                    break
                await asyncio.sleep(1.5)
            await settle()
            for code in MAPS:
                await ev(f"if (t.def.code !== '{code}') setTimeout(() => root.travelWorldMap('{code}', null), 50); return 1;")
                ok = False
                for _ in range(200):
                    if await ev(f"return (t.def && t.def.code === '{code}' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok':
                        ok = True
                        break
                    await asyncio.sleep(2)
                if not ok:
                    print('map fail', code, flush=True)
                    report.append({'map': code, 'error': 'travel failed'})
                    continue
                await settle(400)
                await asyncio.sleep(5)
                # 冻住圆徽上下浮动 / 光圈呼吸(按 Date.now 走,零步长出帧也会变,会被当成底噪剔掉)
                await ev("t.stepPoiCues = function () {}; t.stepChestGlow = function () {}; return 1;")
                if os.environ.get('BEFORE') == '1':
                    # 模拟 11-26 修复前的挂法:名字 / 圆徽挂回物件节点(跟着立物排序),隐藏点圆徽回立物层,出口名牌回地面层的出口节点
                    print('before-sim', await ev("""
                      let n = 0;
                      const back = (node, parent) => { if (node && node.isValid && parent && parent.isValid) { const p = node.position.clone(); node.parent = parent; node.setPosition(p); n++; } };
                      for (const e of t.chestNodes.values()) { back(e.name && e.name.node, e.node); back(e.badge, e.node); }
                      for (const e of t.poiNodes.values()) {
                        if (e.poi.kind === 'HIDDEN') { if (e.badge && e.badge.parent === t.tagRoot) { e.badge.parent = t.entityRoot; t.propNodes.push({ node: e.badge, y: e.poi.y }); n++; } }
                        else { back(e.name && e.name.node, e.node); back(e.badge, e.node); }
                      }
                      for (const ex of t.def.exits) { const tag = t.tagRoot && t.tagRoot.getChildByName('Tag_exit_' + ex.key); const lab = tag && tag.getChildByName('Label'); back(lab, t.groundRoot.getChildByName('TownExit_' + ex.key)); }
                      t.sortEntities(true);
                      return n;"""), flush=True)
                items = json.loads(await ev("return JSON.stringify(H.items());"))
                if os.environ.get('DEBUG') == '1':
                    print('dbg', await ev("const canvas = cc.director.getScene().getComponentInChildren(cc.Canvas); const cam = canvas.cameraComponent; const fs = cc.screen.windowSize; const ds = cc.view.getDesignResolutionSize(); const vp = cc.view.getViewportRect(); const lp = t.leader.node.worldPosition; const sp = cam.worldToScreen(new cc.Vec3(), lp); return JSON.stringify({ win: [fs.width, fs.height], design: [ds.width, ds.height], vp: [vp.x, vp.y, vp.width, vp.height], leaderWorld: [lp.x, lp.y], leaderScreen: [sp.x, sp.y], dpr: cc.screen.devicePixelRatio });"), flush=True)
                    items = items[:int(os.environ.get("DEBUG_N", "3"))]
                print('map', code, 'items', len(items), flush=True)
                for it in items:
                    # 队长先站到探索物左下 220 / 170 让镜头对过去(镜头跟队长),截图前再把队伍挪开
                    await ev(TP.replace('{x}', str(round(it['x'] - 220))).replace('{y}', str(round(it['y'] - 170))))
                    await asyncio.sleep(1.2)
                    # 等整图遮挡件 / 图块到位(视野换了要加载)
                    for _ in range(10):
                        if await ev(BUSY) == 'ok':
                            break
                        await asyncio.sleep(1)
                    await asyncio.sleep(1.5)
                    # 暂停后:镜头钉住、队伍挪到 3000 外、透视孔清零(队长站在同一堵墙后会开孔,把被挡的名字露出来,测不准)
                    await ev("cc.game.pause(); H._cam = H._cam || t.applyCamera; t.applyCamera = function () {}; [t.leader, ...t.followers].forEach(a => { a.y -= 3000; a.node.setPosition(a.x, a.y, 0); }); t.trail = []; for (let i = 0; i < 4; i++) t.updateCanopyHoles(1); H._cull = H._cull || t.cullMonsters; t.cullMonsters = function () {}; t.monsters.forEach(m => { if (m.node.isValid) m.node.active = false; }); cc.director.tick(0); cc.director.tick(0); return 1;")
                    if RELOCATE and it['id'] not in RELOCATE:
                        await ev("t.applyCamera = H._cam; t.cullMonsters = H._cull; cc.game.resume(); return 1;")
                        continue
                    if it['id'] in RELOCATE:
                        # 找新点位:逐个候选挪过去测本体被挡比例,取第一个 < 0.04 的(候选按距离排)
                        async def art_ratio():
                            await ev("H.setBlockers(true); cc.director.tick(0); cc.director.tick(0); return 1;")
                            a_on = await grab()
                            await ev("H.setBlockers(false); cc.director.tick(0); cc.director.tick(0); return 1;")
                            a_off = await grab()
                            await ev("cc.director.tick(0); return 1;")
                            a_off2 = await grab()
                            await ev(f"H.showPart({json.dumps(it['id'])}, 'art', false); cc.director.tick(0); cc.director.tick(0); return 1;")
                            a_hide = await grab()
                            await ev(f"H.showPart({json.dumps(it['id'])}, 'art', true); H.setBlockers(true); return 1;")
                            kp = ImageChops.invert(ImageChops.difference(a_off, a_off2).convert('L').point(lambda v: 255 if v > 12 else 0).filter(ImageFilter.MaxFilter(7)))
                            m = ImageChops.multiply(ImageChops.difference(a_off, a_hide).convert('L').point(lambda v: 255 if v > 28 else 0), kp)
                            o = ImageChops.multiply(ImageChops.difference(a_on, a_off).convert('L').point(lambda v: 255 if v > 28 else 0), kp)
                            area = m.histogram()[255]
                            return (ImageChops.multiply(m, o).histogram()[255] / area) if area >= 40 else None, a_on
                        base_ratio, base_img = await art_ratio()
                        cands = json.loads(await ev(f"return JSON.stringify(H.candidates({it['x']}, {it['y']}, {RELOC_MAX}));"))
                        print('reloc', it['id'], 'base', base_ratio, 'cands', len(cands), flush=True)
                        best = None
                        for cx, cy, _d in cands[:int(os.environ.get("RELOC_N", "60"))]:
                            await ev(f"H.moveItem({json.dumps(it['id'])}, {cx}, {cy}); return 1;")
                            r, img = await art_ratio()
                            if r is not None and r < 0.04:
                                best = (cx, cy, round(r, 3), round(_d))
                                img.save(os.path.join(OUT, f"reloc_{code}_{it['id'].replace(':', '_')}.jpg"), quality=85)
                                break
                        base_img.save(os.path.join(OUT, f"reloc_{code}_{it['id'].replace(':', '_')}_orig.jpg"), quality=85)
                        await ev(f"H.moveItem({json.dumps(it['id'])}, {it['x']}, {it['y']}); t.applyCamera = H._cam; t.cullMonsters = H._cull; cc.director.tick(0); cc.game.resume(); return 1;")
                        print('RELOC', json.dumps({'map': code, 'id': it['id'], 'from': [round(it['x']), round(it['y'])], 'base': base_ratio, 'best': best}, ensure_ascii=False), flush=True)
                        report.append({'map': code, 'id': it['id'], 'reloc': best, 'base': base_ratio})
                        continue
                    raw = await ev(f"return JSON.stringify(H.parts({json.dumps(it['id'])}));")
                    try:
                        parts = raw if isinstance(raw, dict) else json.loads(raw)
                    except Exception:
                        print('parts err', it['id'], str(raw)[:300], flush=True)
                        await ev("t.applyCamera = H._cam; t.cullMonsters = H._cull; cc.game.resume(); return 1;")
                        continue
                    img_on = await grab()
                    await ev("H.setBlockers(false); cc.director.tick(0); cc.director.tick(0); return 1;")
                    img_off = await grab()
                    await ev("cc.director.tick(0); cc.director.tick(0); return 1;")
                    img_off2 = await grab()
                    # 底噪:两张同样状态的图之间也在变的像素(随风摆的树 / 水面 / 瀑布着色器),膨胀一圈后从所有掩码里剔掉
                    noise = ImageChops.difference(img_off, img_off2).convert('L').point(lambda v: 255 if v > 12 else 0).filter(ImageFilter.MaxFilter(7))
                    keep = ImageChops.invert(noise)
                    row = {'map': code, 'id': it['id'], 'x': round(it['x']), 'y': round(it['y']), 'parts': {}}
                    flagged = False
                    boxes = {}
                    occ_mask = ImageChops.multiply(ImageChops.difference(img_on, img_off).convert('L').point(lambda v: 255 if v > 28 else 0), keep)
                    for name, info in parts.items():
                        if isinstance(info, str):
                            row['parts'][name + '_text'] = info
                        await ev(f"H.showPart({json.dumps(it['id'])}, {json.dumps(name)}, false); cc.director.tick(0); cc.director.tick(0); return 1;")
                        img_hide = await grab()
                        await ev(f"H.showPart({json.dumps(it['id'])}, {json.dumps(name)}, true); return 1;")
                        mask = ImageChops.multiply(ImageChops.difference(img_off, img_hide).convert('L').point(lambda v: 255 if v > 28 else 0), keep)
                        area = mask.histogram()[255]
                        if area < 40:
                            row['parts'][name] = 'offscreen'
                            continue
                        both = ImageChops.multiply(mask, occ_mask).histogram()[255]
                        ratio = both / area
                        row['parts'][name] = round(ratio, 3)
                        bb = mask.getbbox()
                        if bb:
                            boxes[name] = bb
                        if ratio > THRESH:
                            flagged = True
                    await ev("H.setBlockers(true); t.applyCamera = H._cam; t.cullMonsters = H._cull; cc.director.tick(0); cc.game.resume(); return 1;")
                    hh = img_on.height
                    row['flagged'] = flagged
                    report.append(row)
                    print(('!! ' if flagged else '   ') + json.dumps(row, ensure_ascii=False), flush=True)
                    if flagged or os.environ.get('SAVE_ALL') == '1':
                        if boxes:
                            xs = [b[0] for b in boxes.values()] + [b[2] for b in boxes.values()]
                            ys = [b[1] for b in boxes.values()] + [b[3] for b in boxes.values()]
                            crop = (max(0, int(min(xs)) - 60), max(0, int(min(ys)) - 60), min(img_on.width, int(max(xs)) + 60), min(hh, int(max(ys)) + 60))
                            a, b = img_on.crop(crop), img_off.crop(crop)
                            da = ImageDraw.Draw(a)
                            for name, bx in boxes.items():
                                da.rectangle((bx[0] - crop[0], bx[1] - crop[1], bx[2] - crop[0], bx[3] - crop[1]), outline=(255, 0, 255))
                            pair = Image.new('RGB', (a.width * 2 + 10, a.height), (0, 0, 0))
                            pair.paste(a, (0, 0))
                            pair.paste(b, (a.width + 10, 0))
                            pair.save(os.path.join(OUT, f"{code}_{it['id'].replace(':', '_')}.jpg"), quality=88)
            json.dump(report, open(os.path.join(OUT, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            bad = [r for r in report if r.get('flagged')]
            print(f'DONE items={len([r for r in report if "id" in r])} flagged={len(bad)} out={OUT}', flush=True)
    finally:
        proc.kill()


asyncio.run(main())
