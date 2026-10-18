// 原生调试包:在锻造强化页勾选「连续强化」后点强化,记录逐锤音效 / 特效节点 / 名牌数字的时间线(验证 2026-10-19 连续强化反馈)。
// 用法:先打开锻造强化页并选中一件 +0~+4 的未穿戴装备(或让脚本自己选),再:
//   python tools/qa/native_js_eval.py --port 43086 --timeout 60 --file tools/qa/native_auto_enhance_probe.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let root = null;
  cc.director.getScene().walk((n) => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
  const log = [];
  const t0 = Date.now();
  const mark = (s) => log.push(`${Date.now() - t0}ms ${s}`);
  if (root.currentView !== 'forge') { root.openLobbyForgePanel(); await sleep(2500); }
  if (root.lobbyForgeTab !== 'enhance') { root.selectLobbyForgeTab('enhance'); await sleep(1200); }
  // 挑一件未穿戴、+0~+4 的装备当目标(便宜、不掉级),没有就用当前
  const items = root.lobbyEquipmentItems || [];
  const target = items.find((i) => i.heroId == null && (i.enhanceLevel || 0) <= 4 && (i.enhanceLevel || 0) >= 0) || null;
  if (target && root.lobbyForgeEnhanceSlotId !== target.id) { try { root.selectLobbyForgeEnhanceSlot(target.id); } catch (e) { log.push('select err ' + e.message); } await sleep(1000); }
  const equipId = root.lobbyForgeEnhanceSlotId;
  const before = (items.find((i) => i.id === equipId) || {}).enhanceLevel;
  // 包一层音效与特效,记录调用
  const audio = globalThis.gameAudio || (root.constructor && root.constructor.gameAudio) || null;
  const sfxKeys = [];
  const renderer = root.lobbyForgePanelRenderer;
  const origStep = renderer.spawnEnhanceStepFx.bind(renderer);
  renderer.spawnEnhanceStepFx = (ok, lv, seq) => { mark(`stepFx ok=${ok} lv=${lv} seq=${seq}`); return origStep(ok, lv, seq); };
  const origFlash = renderer.spawnForgeFlash.bind(renderer);
  renderer.spawnForgeFlash = (ok, text, kind, opts) => { mark(`flash ok=${ok} kind=${kind} text=${text}`); return origFlash(ok, text, kind, opts); };
  const origPatch = renderer.patchEnhanceLevel.bind(renderer);
  renderer.patchEnhanceLevel = (lv) => { mark(`patchLevel ${lv}`); return origPatch(lv); };
  if (!root.lobbyForgeAutoRepeat) { try { root.toggleLobbyForgeAutoRepeat(); } catch (e) { log.push('toggle err ' + e.message); } await sleep(600); }
  mark('click auto enhance');
  root.autoEnhanceLobbyEquipment(equipId);
  for (let i = 0; i < 80 && root.lobbyHeroEquipBusy; i++) await sleep(250);
  await sleep(1500);
  renderer.spawnEnhanceStepFx = origStep; renderer.spawnForgeFlash = origFlash; renderer.patchEnhanceLevel = origPatch;
  const after = ((root.lobbyEquipmentItems || []).find((i) => i.id === equipId) || {}).enhanceLevel;
  return { equipId, before, after, autoRepeat: root.lobbyForgeAutoRepeat, log };
})()
