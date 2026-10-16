// 原生调试包:复现「先开水晶法术页(法术数据进共享缓存)→ 再进守卫战」,开战后立刻检查特效就绪表。
// 2026-10-16「第一次放法术是贴图」回归用。用法:python tools/qa/native_js_eval.py --port 43086 --timeout 150 --file tools/qa/native_fx_ready_check.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (name) => { let f = null; const w = (n) => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  let root = null;
  cc.director.getScene().walk((n) => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
  globalThis.__root = root;
  if (root.currentView === 'battle') return 'already in battle, restart app first';
  // 1) 水晶法术页:详情卡 mountLobbySpineFx 会把法术骨骼数据放进 SpineDataStore 缓存
  root.openGuardCrystalDialog();
  await sleep(1500);
  const tab = find('LobbyGuardCrystalTab_spells');
  if (tab) { tab.emit(cc.Node.EventType.TOUCH_END); const btn = tab.getComponent(cc.Button); if (btn) tab.emit(cc.Button.EventType.CLICK, btn); }
  const spellsOpen = !!find('LobbyGuardCrystalSpellsPanel');
  await sleep(2500);
  try { root.closeGuardCrystalDialog && root.closeGuardCrystalDialog(); } catch (e) { /* ignore */ }
  await sleep(800);
  // 2) 进守卫战
  try { await root.openLobbyBattlePreviewPanel('MAIN_1_1'); } catch (e) { return 'open err ' + e.message; }
  for (let k = 0; k < 4 && root.currentView !== 'battle'; k++) {
    const ch = find('BattleChallengeDialogChallengeButton');
    if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(250); continue; }
    const b = find('LobbyAdventureFormationButton');
    if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); }
    for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(250);
  }
  let r = root.lobbyGuardBattleRenderer;
  for (let i = 0; i < 60 && !(r && r.sim); i++) { await sleep(100); r = root.lobbyGuardBattleRenderer; }
  // 3) 开战后立即(建场刚完成)检查
  const keys = ['v2_a47_340', 'v2_a47_447', 'v2_s576_022', 'v2_a47_343', 'v2_a49_206', 'v2_a47_376', 'v2_a49_005c'];
  const snap = () => keys.map((k) => k + ':' + r.attackSpineFxReady.has(k)).join(' ');
  const t0 = snap();
  await sleep(1500);
  return { spellsPageOpened: spellsOpen, view: root.currentView, spells: r.sim && r.sim.spellLoadout, atStart: t0, after1500ms: snap(), readyCount: r.attackSpineFxReady.size, retries: Array.from(r.attackSpineFxRetry.entries()) };
})()
