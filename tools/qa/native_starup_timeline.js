// 原生调试包:英雄详情「升星」页签点升星 → 屏幕上星级 / 消耗 / 战力文字实际变化时刻(每 50ms 轮询标签 + 星星精灵数)。
// 2026-10-16 用户「升星变化还是太慢,延迟 2~3 秒」。用法:python tools/qa/native_js_eval.py --port 43086 --timeout 120 --file tools/qa/native_starup_timeline.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let root = null;
  cc.director.getScene().walk((n) => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
  const heroes = root.lobbyHeroRosterLoader.currentState().heroes.filter((h) => h.id > 0 && h.rarity.toUpperCase() !== 'EX');
  const hero = heroes.find((h) => /魔女/.test(h.heroName || '')) || heroes[0];
  if (root.currentView !== 'heroDetail' || root.lobbyHeroDetailHeroId !== hero.id) {
    root.openLobbyHeroDetail(hero.id);
    for (let i = 0; i < 60 && root.currentView !== 'heroDetail'; i++) await sleep(100);
    await sleep(2000);
  }
  root.selectLobbyHeroDetailTab('star');
  await sleep(2500);
  const labels = () => {
    const out = [];
    let stars = 0;
    cc.director.getScene().walk((n) => {
      if (!n.activeInHierarchy) return;
      if (n.name.startsWith('LobbyHeroDetailStar_')) stars += 1;
      const l = n.getComponent(cc.Label);
      if (l && l.string && l.string.length < 24 && /星|战力|\d/.test(l.string)) out.push(l.string);
    });
    return 'stars=' + stars + '|' + out.sort().join('|');
  };
  const t0 = Date.now();
  const log = [];
  const mark = (s) => log.push(`${Date.now() - t0}ms ${s}`);
  const origStar = root.api.hero.starUp;
  root.api.hero.starUp = function (...a) { mark('api.starUp start'); return origStar.apply(this, a).then((v) => { mark('api.starUp done'); return v; }); };
  const origRender = root.renderCurrentView;
  root.renderCurrentView = function (...a) { mark('renderCurrentView'); return origRender.apply(this, a); };
  const starBefore = hero.star;
  let lastSig = labels();
  const changes = [];
  root.starUpLobbyHero(hero.id);
  mark('click');
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    const sig = labels();
    if (sig !== lastSig) {
      const a = new Set(lastSig.split('|'));
      const added = sig.split('|').filter((x) => !a.has(x));
      changes.push(`${Date.now() - t0}ms +[${added.slice(0, 8).join(', ')}]`);
      lastSig = sig;
    }
  }
  root.api.hero.starUp = origStar;
  root.renderCurrentView = origRender;
  const after = root.lobbyHeroRosterLoader.currentState().heroes.find((h) => h.id === hero.id);
  return { hero: hero.heroName, starBefore, starAfter: after && after.star, log, labelChanges: changes };
})()
