# -*- coding: utf-8 -*-
"""(2026-10-05 重建的最小版)守卫战探针公共片段。"""
HELPERS = r"""
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cc = window.__cc, r = window.__gr, sim = r.sim, M = window.__M;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
"""
JS_PREP = r"""(async () => {""" + HELPERS + r"""
  if (sim.pendingChoice) M.guardSkipChoice(sim);
  sim.crystalHp = sim.crystalMaxHp = 9e9; sim.gold = 99999;
  for (let i = 0; i < 4 && sim.heroes.length < 4; i++) { M.guardSummon(sim, true); await sleep(80); }
  return JSON.stringify({ phase: sim.phase, heroes: sim.heroes.length });
})()"""
