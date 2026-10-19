// 安卓原生:检查 Graphics 停用→启用(面板暂存复用 / 局部刷新)后是否还挂着原生 drawInfo。
// 用法(调试包 + adb forward tcp:43086 tcp:43086):
//   python tools/qa/native_js_eval.py --file tools/qa/native_graphics_reenable_check.js
// 打开背包 → 统计 → refreshLobbyOverlay 三次 → 再统计;lost > 0 说明 GraphicsBufferPatch 的原生补丁失效。
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let root = null;
  cc.director.getScene().walk((n) => {
    if (!root) {
      const c = n.components.find((comp) => comp.constructor.name === 'LootChainGameRoot');
      if (c) root = c;
    }
  });
  const count = () => {
    const res = { ok: 0, lost: 0, lostNames: {} };
    cc.director.getScene().walk((n) => {
      const g = n.getComponent(cc.Graphics);
      if (!g || !g.enabledInHierarchy || !g._isDrawing) return;
      if (g.renderEntity._dynamicDrawInfoArr.length > 0) {
        res.ok += 1;
      } else {
        res.lost += 1;
        res.lostNames[n.name] = (res.lostNames[n.name] || 0) + 1;
      }
    });
    return res;
  };
  if (root.currentView !== 'bag') {
    root.openLobbyBagPanel();
    await wait(3500);
  }
  const before = count();
  for (let i = 0; i < 3; i += 1) {
    root.refreshLobbyOverlay();
    await wait(1200);
  }
  await wait(1000);
  return { patched: !!cc.Graphics.prototype.__lcNativeReenablePatched, before, after: count() };
})()
