(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cc = window.__cc, root = window.__root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  try { await root.openLobbyBattlePreviewPanel('MAIN_1_1'); } catch (e) { return 'open err ' + e.message; }
  for (let i = 0; i < 20 && root.currentView !== 'battle'; i++) await sleep(500);
  // 进关前的「编队确认」步骤
  for (let k = 0; k < 4 && root.currentView !== 'battle'; k++) {
    const ch = find('BattleChallengeDialogChallengeButton');
    if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500); continue; }
    const b = find('LobbyAdventureFormationButton');
    if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); }
    for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500);
  }
  window.__M = null;
  let r = root.lobbyGuardBattleRenderer;
  for (let i = 0; i < 60 && !(r && r.sim); i++) { await sleep(500); r = root.lobbyGuardBattleRenderer; }
  window.__gr = r;
  return 'view=' + root.currentView + ' sim=' + !!(r && r.sim) + ' newCode=' + (r && typeof r.pulseUltDim === 'function');
})()