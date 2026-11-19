// 预渲染 2.5D:从摄影棚里真实的模型三角形算「挡路」栅格(dungeon_dev eval @本文件;先 eval 过 helper.js)。
// 11-19 用户:主城碰撞拦得太广,空地也走不过去 —— 原来是每栋楼 / 每棵树一个放宽的方框,这里改成按模型本身的形状:
// 把每个三角形切到「脚踝到头顶」那一层(Y_LO ~ Y_HI 米),落在地面上的投影标成挡路。屋顶、树冠在头顶以上的部分不挡;
// 地面、水面、低于脚踝的路沿不挡;树叶不算(树下能走,看得见人);石桥不算(桥面能走,两边由运河的逻辑挡块管)。
// 另出一张「头顶有遮盖」栅格(三角形切到 Y_HI 以上的部分):屋顶 / 楼板下面就是楼里面,和挡路一起算(楼的外墙模型不封闭,
// 光看墙会把楼里面当空地)。树干树枝、城门楼(门洞要能穿过去)不算遮盖。
// 结果:每 CELL 米一格,X0..X1 × Z0..Z1,按位打包后 base64 返回;解包 / 换成可走格见 build_map.py --collide。
var CELL = 0.1, Y_LO = 0.25, Y_HI = 1.9;
var X0 = -72, X1 = 68, Z0 = -60, Z1 = 60;
var NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
var grid = new Uint8Array(NX * NZ);
var over = new Uint8Array(NX * NZ);
var SKIP_TOP = ['DgLeaf', 'DgSword', 'DgBladeTrail', 'DgSwordWave'];
var skipTop = function (t) { return SKIP_TOP.indexOf(t) >= 0 || /^G3DChar|^ShowFx|bridge/i.test(t); };
var noOver = function (t) { return t === 'DgBark' || /gate/i.test(t); };
var ms = meshes();
var stat = { meshes: 0, tris: 0, kept: 0, skipped: 0, noData: 0 };
var G = grid;
var mark = function (x, z) {
  var i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
  if (i >= 0 && j >= 0 && i < NX && j < NZ) { G[j * NX + i] = 1; }
};
var seg = function (ax, az, bx, bz) {
  var n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5)));
  for (var k = 0; k <= n; k++) { mark(ax + (bx - ax) * k / n, az + (bz - az) * k / n); }
};
var fillTri = function (a, b, c) {
  var minx = Math.min(a[0], b[0], c[0]), maxx = Math.max(a[0], b[0], c[0]);
  var minz = Math.min(a[2], b[2], c[2]), maxz = Math.max(a[2], b[2], c[2]);
  var d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-6) { return; }
  var i0 = Math.max(0, Math.floor((minx - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((maxx - X0) / CELL));
  var j0 = Math.max(0, Math.floor((minz - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((maxz - Z0) / CELL));
  for (var j = j0; j <= j1; j++) {
    var z = Z0 + (j + 0.5) * CELL;
    for (var i = i0; i <= i1; i++) {
      var x = X0 + (i + 0.5) * CELL;
      var l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      var l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) { G[j * NX + i] = 1; }
    }
  }
};
// 多边形按 y 平面裁一刀(keepAbove = 留 y >= h 那边)
var clipY = function (poly, h, keepAbove) {
  var out = [];
  for (var k = 0; k < poly.length; k++) {
    var p = poly[k], q = poly[(k + 1) % poly.length];
    var pin = keepAbove ? p[1] >= h : p[1] <= h, qin = keepAbove ? q[1] >= h : q[1] <= h;
    if (pin) { out.push(p); }
    if (pin !== qin) {
      var t = (h - p[1]) / (q[1] - p[1]);
      out.push([p[0] + (q[0] - p[0]) * t, h, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out;
};
var m4 = new cc.Mat4(), v = new cc.Vec3();
ms.forEach(function (m) {
  var top = m.top;
  if (skipTop(top) || !m.c.enabled || !m.node.activeInHierarchy) { stat.skipped++; return; }
  var mesh = m.c.mesh;
  if (!mesh) { return; }
  stat.meshes++;
  m.node.getWorldMatrix(m4);
  var nPrim = mesh.struct.primitives.length;
  for (var pi = 0; pi < nPrim; pi++) {
    var pos = mesh.readAttribute(pi, 'a_position');
    if (!pos) { stat.noData++; continue; }
    var idx = mesh.readIndices(pi);
    var nv = pos.length / 3;
    var wpos = new Float32Array(pos.length);
    var ymin = 1e9, ymax = -1e9;
    for (var k = 0; k < nv; k++) {
      v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      cc.Vec3.transformMat4(v, v, m4);
      wpos[k * 3] = v.x; wpos[k * 3 + 1] = v.y; wpos[k * 3 + 2] = v.z;
      if (v.y < ymin) { ymin = v.y; } if (v.y > ymax) { ymax = v.y; }
    }
    if (ymax < Y_LO) { continue; }
    var wantOver = !noOver(top);
    if (ymin > Y_HI && !wantOver) { continue; }
    var nt = idx ? idx.length / 3 : nv / 3;
    for (var t = 0; t < nt; t++) {
      stat.tris++;
      var ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      var a = [wpos[ia * 3], wpos[ia * 3 + 1], wpos[ia * 3 + 2]];
      var b = [wpos[ib * 3], wpos[ib * 3 + 1], wpos[ib * 3 + 2]];
      var c = [wpos[ic * 3], wpos[ic * 3 + 1], wpos[ic * 3 + 2]];
      var hiY = Math.max(a[1], b[1], c[1]), loY = Math.min(a[1], b[1], c[1]);
      if (hiY < Y_LO) { continue; }
      if (loY <= Y_HI) {
        var poly = clipY(clipY([a, b, c], Y_LO, true), Y_HI, false);
        if (poly.length >= 2) {
          stat.kept++;
          G = grid;
          for (var e = 0; e < poly.length; e++) { var p = poly[e], q = poly[(e + 1) % poly.length]; seg(p[0], p[2], q[0], q[2]); }
          for (var f = 1; f + 1 < poly.length; f++) { fillTri(poly[0], poly[f], poly[f + 1]); }
        }
      }
      if (wantOver && hiY > Y_HI) {
        var up = clipY([a, b, c], Y_HI, true);
        if (up.length >= 3) {
          G = over;
          for (var f2 = 1; f2 + 1 < up.length; f2++) { fillTri(up[0], up[f2], up[f2 + 1]); }
        }
      }
    }
  }
});
// 按位打包 → base64
var pack = function (arr) {
  var bytes = new Uint8Array(Math.ceil(NX * NZ / 8));
  for (var n = 0; n < NX * NZ; n++) { if (arr[n]) { bytes[n >> 3] |= 128 >> (n & 7); } }
  var s = '';
  for (var b0 = 0; b0 < bytes.length; b0 += 8192) { s += String.fromCharCode.apply(null, bytes.subarray(b0, b0 + 8192)); }
  return btoa(s);
};
return JSON.stringify({ cell: CELL, x0: X0, z0: Z0, nx: NX, nz: NZ, yLo: Y_LO, yHi: Y_HI, stat: stat, bits: pack(grid), over: pack(over) });
