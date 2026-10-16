// 原生调试包:英雄详情页点升级 → 各环节时间线 + 屏幕上「Lv.N」/ 战力文字实际变化时刻(每 50ms 轮询标签)。
// 2026-10-16 用户「点升级后 3~6 秒数值才变」。用法:python tools/qa/native_js_eval.py --port 43086 --timeout 120 --file tools/qa/native_levelup_timeline.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let root = null;
  cc.director.getScene().walk((n) => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
  const heroes = root.lobbyHeroRosterLoader.currentState().heroes.filter((h) => h.id > 0 && h.rarity.toUpperCase() !== 'EX');
  const hero = heroes.find((h) => /魔女/.test(h.heroName || '')) || heroes[0];
  if (root.currentView !== 'heroDetail' || root.lobbyHeroDetailHeroId !== hero.id) {
    root.openLobbyHeroDetail(hero.id);
    for (let i = 0; i < 60 && root.currentView !== 'heroDetail'; i++) await sleep(100);
    await sleep(2500);
  }
  const t0 = Date.now();
  const log = [];
  const mark = (s) => log.push(`${Date.now() - t0}ms ${s}`);
  const wrap = (obj, name, tag) => {
    const orig = obj[name];
    obj[name] = function (...a) {
      mark(`${tag} start`);
      const r = orig.apply(this, a);
      if (r && typeof r.then === 'function') { return r.then((v) => { mark(`${tag} done`); return v; }); }
      return r;
    };
    return () => { obj[name] = orig; };
  };
  const restores = [
    wrap(root.api.hero, 'levelUp', 'api.levelUp'),
    wrap(root, 'loadLobbyHeroRoster', 'roster'),
    wrap(root, 'loadLobbyHeroDetail', 'detail'),
    wrap(root, 'loadLobbyProfile', 'profile'),
    wrap(root, 'loadLobbyBag', 'bag'),
    wrap(root, 'loadLobbyAdventure', 'adventure'),
    wrap(root, 'renderCurrentView', 'renderCurrentView'),
    wrap(root, 'celebrateHeroGrowth', 'celebrate'),
    wrap(root, 'spawnPowerDeltaFloat', 'powerFloat'),
    wrap(root, 'scheduleHeroDetailRefresh', 'scheduleRefresh'),
  ];
  // 屏幕标签快照:所有激活中、含 Lv / 战力 / 数字的短标签
  const labels = () => {
    const out = [];
    cc.director.getScene().walk((n) => {
      if (!n.activeInHierarchy) return;
      const l = n.getComponent(cc.Label);
      if (l && l.string && l.string.length < 24 && /Lv|战力|生命|攻击|防御|\d/.test(l.string)) out.push(l.string);
    });
    return out.sort().join('|');
  };
  const before = labels();
  const levelBefore = hero.level;
  let lastSig = before;
  const changes = [];
  root.levelUpLobbyHero(hero.id);
  mark('click');
  for (let i = 0; i < 160; i++) {
    await sleep(50);
    const sig = labels();
    if (sig !== lastSig) {
      const a = new Set(lastSig.split('|'));
      const b = sig.split('|').filter((x) => !a.has(x));
      changes.push(`${Date.now() - t0}ms +[${b.slice(0, 6).join(', ')}]`);
      lastSig = sig;
    }
  }
  restores.forEach((f) => f());
  const after = root.lobbyHeroRosterLoader.currentState().heroes.find((h) => h.id === hero.id);
  return { hero: hero.heroName, levelBefore, levelAfter: after && after.level, log, labelChanges: changes };
})()
