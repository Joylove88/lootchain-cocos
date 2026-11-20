// 3D 小样每帧绘制次数从哪来(2026-11-20,低端兼容第 1 期 ③):配合 g3d_eval.py 用。
// 统计:场景里每个模型(按挂在 G3DDungeon 下的顶层节点归组)的子网格数、在不在主相机视野里、投不投影、走没走实例化;
// 每盏点光 / 聚光照到视野里多少子网格(前向渲染每照一个就多画一次);同一网格 + 同一材质重复出现的次数(合并 / 实例化的潜力)。
(() => {
  const d = window.__g3dd.dungeon;
  const rs = cc.director.getScene().renderScene;
  const cam = d.cam.camera;
  const fr = cam.frustum;
  const I = cc.geometry.intersect;
  const top = (n) => { let c = n, prev = n; while (c && c.parent && c.name !== 'G3DDungeon') { prev = c; c = c.parent; } return (c && c.name === 'G3DDungeon') ? prev.name : '(其它场景)'; };
  const groups = {};
  const repeat = {};
  let inView = 0, subInView = 0, subAll = 0, inst = 0, castInView = 0, castSub = 0;
  const viewSubs = [];
  for (const m of rs.models) {
    if (!m.enabled || !m.node || !m.node.activeInHierarchy) continue;
    if (!(cam.visibility & m.node.layer)) continue;
    const g = top(m.node).replace(/[_\-]?\d+$/, '');
    const vis = !m.worldBounds || I.aabbFrustum(m.worldBounds, fr);
    const subs = m.subModels.length;
    subAll += subs;
    const e = groups[g] || (groups[g] = { models: 0, subs: 0, viewModels: 0, viewSubs: 0, cast: 0, inst: 0, skinned: 0, tris: 0 });
    e.models++; e.subs += subs;
    if (m.type !== 0) e.skinned++;
    if (m.castShadow) e.cast += subs;
    let tri = 0;
    for (const sm of m.subModels) {
      const p = sm.passes[0];
      const isInst = p && p.batchingScheme === 1;
      if (isInst) { e.inst++; inst++; }
      const ia = sm.inputAssembler;
      tri += ia ? (ia.indexCount || ia.vertexCount) / 3 : 0;
      const key = (sm.subMesh && (sm.subMesh.__id || (sm.subMesh.__id = Math.random().toString(36).slice(2, 8)))) + '|' + (p && p.hash);
      if (vis) repeat[key] = (repeat[key] || { n: 0, g, tri: 0 }), repeat[key].n++, repeat[key].tri = ia ? Math.round((ia.indexCount || ia.vertexCount) / 3) : 0;
    }
    e.tris += Math.round(tri);
    if (vis) {
      inView++; subInView += subs; e.viewModels++; e.viewSubs += subs;
      if (m.castShadow) { castInView++; castSub += subs; }
      viewSubs.push(m);
    }
  }
  // 灯:每盏真灯照到的视野内子网格(前向渲染里每个都要再画一次)
  const lights = [];
  const sph = (rs.sphereLights || []).concat(rs.pointLights || []);
  for (const l of sph.concat(rs.spotLights || [])) {
    if (!l.node || !l.node.activeInHierarchy) continue;
    if (l.baked) continue;
    const lit = l.aabb && I.aabbFrustum(l.aabb, fr);
    if (!lit) { lights.push({ name: l.node.name, inView: false }); continue; }
    let n = 0;
    for (const m of viewSubs) { if (m.worldBounds && I.aabbWithAABB(m.worldBounds, l.aabb)) n += m.subModels.length; }
    lights.push({ name: l.node.name, inView: true, litSubs: n, range: +(l.range || 0).toFixed(1) });
  }
  const rep = Object.values(repeat).filter((r) => r.n > 1).sort((a, b) => b.n - a.n).slice(0, 25);
  const gl = Object.entries(groups).map(([k, v]) => ({ g: k, ...v })).sort((a, b) => b.viewSubs - a.viewSubs);
  const dev = cc.director.root.device;
  return { draws: dev.numDrawCalls, tris: dev.numTris, models: rs.models.length, subAll, inView, subInView, castInView, castSub, instSubs: inst,
    realLights: lights.filter((l) => l.inView).length, litSubsTotal: lights.reduce((t, l) => t + (l.litSubs || 0), 0), lights,
    groups: gl.slice(0, 40), repeats: rep, post: d.post && d.post.info().last };
})()
