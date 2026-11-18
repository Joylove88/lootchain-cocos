// 预渲染拍主角帧用:骨骼动画摆完、剑挂上手之前,把上身(Spine)往后扳 window.__LEAN_DEG 度(11-19 用户嫌单手跑弓着身子)。
// 装一次就行(包一层 D.dungeon.poseLeader);改角度改 window.__LEAN_DEG,0 = 不扳。
var d = D.dungeon;
if (!d.__leanPatched) {
  d.__leanPatched = true;
  var orig = d.poseLeader;
  var bone = null;
  d.poseLeader = function () {
    var deg = window.__LEAN_DEG || 0;
    var c = d.leader;
    if (deg && c) {
      if (!bone || !bone.isValid) {
        bone = null;
        c.node.walk(function (n) { if (!bone && /Spine$/.test(n.name)) { bone = n; } });
      }
      if (bone) {
        var y = d.lyaw * Math.PI / 180;
        var f = new cc.Vec3(Math.cos(y), 0, -Math.sin(y));
        var ax = new cc.Vec3();
        cc.Vec3.cross(ax, f, new cc.Vec3(0, 1, 0));
        ax.normalize();
        var q = new cc.Quat();
        cc.Quat.fromAxisAngle(q, ax, deg * Math.PI / 180);
        var wr = new cc.Quat();
        cc.Quat.multiply(wr, q, bone.worldRotation);
        bone.setWorldRotation(wr);
      }
    }
    return orig.apply(this, arguments);
  };
}
return 'lean patch ok, deg=' + (window.__LEAN_DEG || 0);
