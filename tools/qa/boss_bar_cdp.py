# -*- coding: utf-8 -*-
"""无头 Edge + CDP 走正常启动链进守卫战,催生 BOSS,实测头顶血条量法并截图(独立临时 profile)。"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
# 输出目录(无头浏览器配置 edge_* / 截图 shots/)放仓库外:默认 %TEMP%/lootchain-qa,可用 LC_QA_OUT 覆盖。跑完记得删 edge_*。
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'lootchain-qa')
os.makedirs(os.path.join(SCRATCH, 'shots'), exist_ok=True)
PROFILE = os.path.join(SCRATCH, os.environ.get('EDGE_PROFILE', 'edge_boss_profile'))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = int(os.environ.get('EDGE_PORT', '9334'))
PAGE = 'http://localhost:' + os.environ.get('PREVIEW_PORT', '7456') + '/' + os.environ.get('PAGE_QS', '')
SHOT = os.path.join(SCRATCH, 'shots', sys.argv[1] if len(sys.argv) > 1 else 'boss_bar_cdp.png')

JS_BOOT = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let cc = null; for (let i = 0; i < 10 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(2000); } }
  if (!cc) return 'cc import failed'; window.__cc = cc;
  const findRoot = () => { const s = cc.director.getScene(); if (!s) return null; let f = null; const walk = n => { if (f) return; const c = n.getComponent && n.getComponent('LootChainGameRoot'); if (c) { f = c; return; } n.children.forEach(walk); }; walk(s); return f; };
  let root = null; for (let i = 0; i < 560 && !root; i++) { root = findRoot(); if (!root) await sleep(500); }
  if (!root) {
    // 编辑器当前场景不是 main(如重启后 Untitled):手动装 main 场景
    try {
      await new Promise((res, rej) => cc.assetManager.loadBundle('resources', (e, b) => e ? rej(e) : res(b)));
      const uuid = '623f777a-eb33-4d74-ae88-eb79e749fcfe';
      const json = await (await fetch(`scene/${uuid}.json`, { cache: 'no-store' })).json();
      const asset = await new Promise((res, rej) => cc.assetManager.loadWithJson(json, { assetId: uuid }, (e, a) => e ? rej(e) : res(a)));
      cc.director._persistRootNodes = {}; cc.director.runSceneImmediate(asset); cc.game.resume();
    } catch (e) { return 'manual scene err ' + e.message; }
    for (let i = 0; i < 40 && !root; i++) { root = findRoot(); if (!root) await sleep(500); }
    if (!root) return 'no root after manual scene';
  }
  window.__root = root;
  for (let i = 0; i < 600 && root.bootPreloadActive !== false; i++) await sleep(500);
  return 'inited=' + cc.game._inited + ' preload=' + root.bootPreloadActive + ' view=' + root.currentView;
})()"""

JS_LOGIN = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cc = window.__cc, root = window.__root;
  const log = [];
  if (root.currentView === 'login') {
    let btn = null; const w = n => { if (btn) return; if (n.name === 'MainAccountLoginButton') { btn = n; return; } n.children.forEach(w); }; w(cc.director.getScene());
    if (btn) btn.emit(cc.Button.EventType.CLICK);
    for (let i = 0; i < 20 && root.currentView !== 'loginAccount'; i++) await sleep(300);
  }
  if (root.currentView === 'loginAccount') {
    const boxes = []; const w2 = n => { const e = n.getComponent && n.getComponent(cc.EditBox); if (e) boxes.push(e); n.children.forEach(w2); }; w2(cc.director.getScene());
    log.push('editboxes=' + boxes.length);
    if (boxes.length >= 2) {
      boxes[0].string = 'guidetest02'; boxes[1].string = 'pass1234';
      try { root.setLoginInputs(boxes[0], boxes[1]); } catch (e) { log.push('setInputs err ' + e.message); }
      try { if (root.loginFlow) root.loginFlow.acceptedAgreement = true; } catch (e) {}
      try { root.submitLogin(); } catch (e) { log.push('login err ' + e.message); }
    }
  }
  for (let i = 0; i < 100 && ['login', 'loginAccount', 'loading'].includes(root.currentView); i++) await sleep(500);
  log.push('view=' + root.currentView);
  return log.join(' | ');
})()"""

JS_BATTLE = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const root = window.__root;
  try { await root.openLobbyBattlePreviewPanel('MAIN_1_1'); } catch (e) { return 'open err ' + e.message; }
  for (let i = 0; i < 30 && root.currentView !== 'battle'; i++) await sleep(500);
  await sleep(2000);
  const im = await (await fetch('scripting/x/import-map.json', { cache: 'no-store' })).json();
  const mKey = Object.keys(im.imports).find(k => /GuardBattleModel\.ts$/.test(k));
  window.__M = await System.import(mKey);
  let r = root.lobbyGuardBattleRenderer;
  for (let i = 0; i < 60 && !(r && r.sim); i++) { await sleep(500); r = root.lobbyGuardBattleRenderer; }
  window.__gr = r;
  return 'view=' + root.currentView + ' sim=' + !!(r && r.sim) + ' views=' + (r ? r.monsterViews.size : -1);
})()"""

JS_MEASURE = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const r = window.__gr, sim = r.sim, M = window.__M;
  const log = [];
  for (let i = 0; i < 20 && !sim.heroes.length; i++) { try { M.guardSummon(sim, true); } catch (e) { break; } }
  let boss = sim.monsters.find(m => m.kind === 'boss' && !m.dead);
  for (let k = 0; k < 6 && !boss; k++) {
    if (sim.pendingChoice && M.guardSkipChoice) { try { M.guardSkipChoice(sim); } catch (e) {} }
    if (!sim.pendingSpawns.some(s => s.kind === 'boss')) sim.pendingSpawns.unshift({ kind: 'boss', lane: 1, atMs: sim.timeMs + 200 });
    for (let i = 0; i < 20; i++) { await sleep(300); boss = sim.monsters.find(m => m.kind === 'boss' && !m.dead); if (boss) break; }
  }
  if (!boss) return 'no boss; choice=' + !!sim.pendingChoice + ' t=' + sim.timeMs;
  boss.speedCellsPerSec = 0; boss.x = 4.2;
  for (const m of sim.monsters) { if (m !== boss) { m.dead = true; } }
  window.__boss = boss;
  let v = null;
  for (let i = 0; i < 60; i++) { await sleep(400); v = r.monsterViews.get(boss.monsterId); if (v && v.spineReady) break; }
  log.push('boss=' + boss.spineCode + ' spineReady=' + (v && v.spineReady));
  if (!v || !v.skeleton) return log.join(' | ');
  window.__bv = v;
  await sleep(2500);
  const samples = [], bars = []; const hpN = v.node.getChildByName('GuardMonsterHp');
  for (let i = 0; i < 10; i++) { const t = r.measureRenderedTopY(v.skeleton); samples.push(t === null ? 'null' : t.toFixed(0)); bars.push(hpN ? hpN.position.y.toFixed(0) : '-'); await sleep(250); }
  log.push('WALK samples=' + samples.join(',') + ' bars=' + bars.join(','));
  log.push('declaredHead=' + r.monsterHeadOffsetY(boss).toFixed(1) + ' scale=' + v.skeleton.node.scale.y.toFixed(3) + ' vc=' + v.skeleton.renderData.vertexCount);
  return log.join(' | ');
})()"""

JS_MEASURE_B = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const r = window.__gr, boss = window.__boss, v = window.__bv;
  boss.x = 0.3;
  await sleep(4000);
  const samples = [], bars = [], holds = []; const hpN = v.node.getChildByName('GuardMonsterHp');
  for (let i = 0; i < 12; i++) { const t = r.measureRenderedTopY(v.skeleton); samples.push(t === null ? 'null' : t.toFixed(0)); bars.push(hpN ? hpN.position.y.toFixed(0) : '-'); holds.push(Date.now() < (v.attackHoldUntil || 0) ? 'H' : '-'); await sleep(250); }
  return 'ATTACK samples=' + samples.join(',') + ' bars=' + bars.join(',') + ' hold=' + holds.join('');
})()"""
