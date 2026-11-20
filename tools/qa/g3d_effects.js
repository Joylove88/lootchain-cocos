// 3D 小样里用到的着色器(2026-11-20 单遍多灯评估):按着色器名统计子网格数、每盏真灯的类型 / 范围 / 亮度
(() => {
  const rs = cc.director.getScene().renderScene;
  const fx = {};
  for (const m of rs.models) {
    if (!m.enabled || !m.node || !m.node.activeInHierarchy) continue;
    for (const sm of m.subModels) {
      for (const p of sm.passes) {
        const k = (p.program || '?') + ' | phase=' + p.phase + ' | blend=' + (p.blendState && p.blendState.targets[0].blend ? 1 : 0);
        fx[k] = (fx[k] || 0) + 1;
      }
    }
  }
  const L = [];
  for (const arr of [rs.sphereLights, rs.pointLights, rs.spotLights, rs.rangedDirLights]) {
    for (const l of (arr || [])) L.push({ name: l.node && l.node.name, type: l.type, range: +(l.range || 0).toFixed(2), size: l.size, lum: l.luminance, color: l.color && [l.color.x, l.color.y, l.color.z].map((v) => +v.toFixed(2)), baked: l.baked, active: !!(l.node && l.node.activeInHierarchy) });
  }
  return { effects: Object.entries(fx).sort((a, b) => b[1] - a[1]), lights: L, realLights: window.__g3dd.cfg.realLights, tier: window.__g3dd.cfg.tier };
})()
