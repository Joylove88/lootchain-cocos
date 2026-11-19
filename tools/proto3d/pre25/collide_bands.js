// 预渲染 2.5D · 主城 v4:按高度分层的挡路栅格(collide_bands.py 注入,前面要先 eval 过 helper.js)。
// v4 有上城(+3 米)、台阶、坡道、桥面,不能再用「离地 0.25~1.9 米」的绝对高度判挡路 —— 每格记下「哪几层高度上有东西」
// (0.25 米一层,-1 ~ 15 米共 64 层),由 build_map.py 按该格的地面高度去判:地面 +0.25 ~ +1.9 有东西 = 挡路,
// 更高的 = 头顶有遮盖。树叶 / 角色 / 特效片不算。结果放 window.__collB(base64 的 Uint32 数组),由 py 分段取走。
var CELL = 0.2;
var X0 = -132, X1 = 132, Z0 = -116, Z1 = 120;
var NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
var bandA = new Uint32Array(NX * NZ), bandB = new Uint32Array(NX * NZ);          // 0.25 米一层:A = -1 ~ 7 米,B = 7 ~ 15 米(第 63 层 = 15 米以上)
var skipTop = function (t) { return t === 'DgLeaf' || t === 'DgGroundLeaf' || /^G3DChar|^ShowFx|^DgSword|^DgBlade/.test(t); };
var bitOf = function (y) { if (y >= 14.75) { return 63; } var k = Math.floor((y + 1) / 0.25); return k < 0 ? -1 : k; };
var markRange = function (i, j, y0, y1) {
  if (i < 0 || j < 0 || i >= NX || j >= NZ) { return; }
  var a = bitOf(y0), b = bitOf(y1);
  if (b < 0) { return; }
  if (a < 0) { a = 0; }
  var n = j * NX + i;
  for (var k = a; k <= b; k++) { if (k < 32) { bandA[n] |= (1 << k) >>> 0; } else { bandB[n] |= (1 << (k - 32)) >>> 0; } }
};
var m4 = new cc.Mat4(), v = new cc.Vec3();
var stat = { meshes: 0, tris: 0, vert: 0 };
meshes().forEach(function (m) {
  if (skipTop(m.top) || !m.c.enabled || !m.node.activeInHierarchy || !m.c.mesh) { return; }
  var mesh = m.c.mesh;
  stat.meshes++;
  m.node.getWorldMatrix(m4);
  for (var pi = 0; pi < mesh.struct.primitives.length; pi++) {
    var pos = mesh.readAttribute(pi, 'a_position');
    if (!pos) { continue; }
    var idx = mesh.readIndices(pi);
    var nv = pos.length / 3;
    var W = new Float32Array(pos.length);
    for (var k = 0; k < nv; k++) {
      v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      cc.Vec3.transformMat4(v, v, m4);
      W[k * 3] = v.x; W[k * 3 + 1] = v.y; W[k * 3 + 2] = v.z;
    }
    var nt = idx ? idx.length / 3 : nv / 3;
    for (var t = 0; t < nt; t++) {
      var ia = (idx ? idx[t * 3] : t * 3) * 3, ib = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, ic = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
      var ax = W[ia], ay = W[ia + 1], az = W[ia + 2], bx = W[ib], by = W[ib + 1], bz = W[ib + 2], cx = W[ic], cy = W[ic + 1], cz = W[ic + 2];
      var ymin = Math.min(ay, by, cy), ymax = Math.max(ay, by, cy);
      if (ymax < -1) { continue; }
      stat.tris++;
      // 法线的 y 分量(竖直的面 ≈ 0)
      var ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-9;
      if (Math.abs(ny) / nl < 0.3) {
        // 竖直 / 很陡的面:投到地面是一条线 —— 沿三条边逐点标,高度取整个三角形的上下沿
        stat.vert++;
        var E = [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]];
        for (var e = 0; e < 3; e++) {
          var L = Math.hypot(E[e][2] - E[e][0], E[e][3] - E[e][1]);
          var n = Math.max(1, Math.ceil(L / (CELL * 0.5)));
          for (var q = 0; q <= n; q++) {
            var px = E[e][0] + (E[e][2] - E[e][0]) * q / n, pz = E[e][1] + (E[e][3] - E[e][1]) * q / n;
            markRange(Math.floor((px - X0) / CELL), Math.floor((pz - Z0) / CELL), ymin, ymax);
          }
        }
        continue;
      }
      // 其余的面:格子中心落在三角形里就按平面算那一点的高度
      var minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx), minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz);
      var d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) { continue; }
      var i0 = Math.max(0, Math.floor((minx - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((maxx - X0) / CELL));
      var j0 = Math.max(0, Math.floor((minz - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((maxz - Z0) / CELL));
      var hit = false;
      for (var j = j0; j <= j1; j++) {
        var zz = Z0 + (j + 0.5) * CELL;
        for (var i = i0; i <= i1; i++) {
          var xx = X0 + (i + 0.5) * CELL;
          var l1 = ((bz - cz) * (xx - cx) + (cx - bx) * (zz - cz)) / d;
          var l2 = ((cz - az) * (xx - cx) + (ax - cx) * (zz - cz)) / d;
          var l3 = 1 - l1 - l2;
          if (l1 >= 0 && l2 >= 0 && l3 >= 0) {
            var y = l1 * ay + l2 * by + l3 * cy;
            markRange(i, j, y - 0.05, y + 0.05);
            hit = true;
          }
        }
      }
      if (!hit) {
        // 小于一格的碎三角:按重心标一下
        markRange(Math.floor(((ax + bx + cx) / 3 - X0) / CELL), Math.floor(((az + bz + cz) / 3 - Z0) / CELL), ymin, ymax);
      }
    }
  }
});
var both = new Uint32Array(NX * NZ * 2); both.set(bandA, 0); both.set(bandB, NX * NZ);
var u8 = new Uint8Array(both.buffer);
var s = '';
for (var b0 = 0; b0 < u8.length; b0 += 8192) { s += String.fromCharCode.apply(null, u8.subarray(b0, b0 + 8192)); }
window.__collB = btoa(s);
return JSON.stringify({ cell: CELL, x0: X0, z0: Z0, nx: NX, nz: NZ, stat: stat, len: window.__collB.length });
