// 预渲染 2.5D 小样:注入到 3D 小样页面(dungeon_dev eval)里的辅助函数。只在截图机位下用,不进游戏代码。
var d = D.dungeon;
var W = d.world;
function topName(n) { var t = n; while (t.parent && t.parent !== W) { t = t.parent; } return t.name; }
function meshes() {
  var out = [];
  W.walk(function (n) { n.components.forEach(function (c) { var k = c.__classname__ || ''; if (k === 'cc.MeshRenderer' || k === 'cc.SkinnedMeshRenderer') { out.push({ c: c, top: topName(n), node: n }); } }); });
  return out;
}
var GROUPS = {
  bld: function (t) { return t.indexOf('DgBld_') === 0; },
  trees: function (t) { return t === 'DgBark' || t === 'DgLeaf'; },
  stone: function (t) { return ['DgStone', 'DgRubble', 'DgTimber', 'DgIron', 'DgGoods', 'DgLampGlass'].indexOf(t) >= 0; },
  hero: function (t) { return t === 'G3DChar_hero_m' || t === 'DgSword'; },
};
window.__pre = {
  saved: null,
  hideChars: function () {
    d.leader.node.active = false; d.followers.forEach(function (f) { f.c.node.active = false; }); d.npcs.forEach(function (c) { c.node.active = false; });
    W.children.forEach(function (k) { if (['DgSword', 'DgBladeTrail', 'DgSwordWave'].indexOf(k.name) >= 0) { k.active = false; } });
    document.querySelectorAll('body > div').forEach(function (e) { if (!e.querySelector('canvas')) { e.style.display = 'none'; } });
    return 1;
  },
  iso: function (group) {
    var keep = GROUPS[group];
    var ms = meshes();
    this.saved = ms.map(function (m) { return [m.c, m.c.enabled]; });
    ms.forEach(function (m) { m.c.enabled = !!keep(m.top) && m.c.enabled; });
    return ms.filter(function (m) { return m.c.enabled; }).length;
  },
  restore: function () { if (this.saved) { this.saved.forEach(function (p) { p[0].enabled = p[1]; }); this.saved = null; } return 1; },
  clear: function (v) { var cam = d.cam; if (this.flags0 === undefined) { this.flags0 = cam.clearFlags; } if (v === null) { cam.clearFlags = this.flags0; return 1; } cam.clearFlags = 7; cam.clearColor = new cc.Color(v, v, v, 255); return 1; },          // 主城用天空盒清屏(14),拍蒙版时改纯色(7)
  scene: function () {
    var lights = d.recs.map(function (r) { var p = r.L.node.worldPosition; var c = r.L.color; return { kind: r.kind, p: [p.x, p.y, p.z], c: [c.r, c.g, c.b], on: r.L.node.active }; });
    var c = d.cam.camera;
    return { solids: d.solids.map(function (s) { return [s.x, s.z, s.hx, s.hz, s.h || 0]; }), lights: lights, near: c.nearClip, far: c.farClip, fov: c.fov };
  },
  vp: function () { var c = d.cam.camera; var m = c.matViewProj; return { vp: [m.m00, m.m01, m.m02, m.m03, m.m04, m.m05, m.m06, m.m07, m.m08, m.m09, m.m10, m.m11, m.m12, m.m13, m.m14, m.m15], w: cc.game.canvas.width, h: cc.game.canvas.height, pos: [c.node.worldPosition.x, c.node.worldPosition.y, c.node.worldPosition.z] }; },
};
return Object.keys(window.__pre);
