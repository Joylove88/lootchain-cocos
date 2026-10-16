// 原生调试包:登录 guidetest02(若在登录页)并进 MAIN_1_1 守卫战,把渲染器挂到 globalThis.__gr。
// 用法:python tools/qa/native_js_eval.py --file tools/qa/native_enter_battle.js --timeout 120
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (name) => { let f = null; const w = (n) => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  let root = null;
  cc.director.getScene().walk((n) => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
  globalThis.__root = root;
  const log = [];
  if (root.currentView === 'login') {
    const btn = find('MainAccountLoginButton');
    if (btn) btn.emit(cc.Button.EventType.CLICK);
    for (let i = 0; i < 40 && root.currentView !== 'loginAccount'; i++) await sleep(300);
  }
  if (root.currentView === 'loginAccount') {
    const boxes = []; const w2 = (n) => { const e = n.getComponent && n.getComponent(cc.EditBox); if (e) boxes.push(e); n.children.forEach(w2); }; w2(cc.director.getScene());
    if (boxes.length >= 2) {
      boxes[0].string = 'guidetest02'; boxes[1].string = 'pass1234';
      try { root.setLoginInputs(boxes[0], boxes[1]); } catch (e) { log.push('setInputs err ' + e.message); }
      try { if (root.loginFlow) root.loginFlow.acceptedAgreement = true; } catch (e) {}
      try { root.submitLogin(); } catch (e) { log.push('login err ' + e.message); }
    }
    for (let i = 0; i < 60 && ['login', 'loginAccount', 'loading'].includes(root.currentView); i++) await sleep(500);
  }
  log.push('view=' + root.currentView);
  if (root.currentView !== 'battle') {
    try { await root.openLobbyBattlePreviewPanel('MAIN_1_1'); } catch (e) { return 'open err ' + e.message; }
    for (let k = 0; k < 4 && root.currentView !== 'battle'; k++) {
      const ch = find('BattleChallengeDialogChallengeButton');
      if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500); continue; }
      const b = find('LobbyAdventureFormationButton');
      if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); }
      for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500);
    }
  }
  let r = root.lobbyGuardBattleRenderer;
  for (let i = 0; i < 60 && !(r && r.sim); i++) { await sleep(500); r = root.lobbyGuardBattleRenderer; }
  globalThis.__gr = r;
  log.push('battle view=' + root.currentView + ' sim=' + !!(r && r.sim));
  return log.join(' | ');
})()
