// 原生调试包:在登录页时用本地 QA 账号 guidetest02 登录(只登录,不进战斗),回到大厅后返回当前视图。
// 新装包 / 新模拟器(平板等)没有会话时用。用法:python tools/qa/native_js_eval.py --port 43086 --timeout 90 --file tools/qa/native_login_qa.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (name) => { let f = null; const w = (n) => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  let root = null;
  cc.director.getScene().walk((n) => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
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
  return log.join(' | ');
})()
