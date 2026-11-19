// 预渲染主城:真推摇杆走一走,量「推了走不动」的地方(field_dev.py eval @本文件;页面要在 ?pre25=1 的主城)。
// 11-19 用户:「明明是空地但还是按障碍物挡住了」「你可以自己控制人物在可视范围内行走」。
// ① SPOTS 每个点往 8 个方向各推 1.2 秒,记走了多远(世界单位;正常约 700);② 随机乱走 RAND_SECS 秒,
// 每 1.5 秒换一个随机方向,推着摇杆 0.8 秒挪不到 40 单位记一次「卡住」(位置 + 方向)。
var SPOTS = window.__probeSpots || [];
var RAND_SECS = window.__probeSecs || 60;
var L = t.leader;
var put = function (x, y) { L.x = x; L.y = y; L.node.setPosition(x, y, 0); t.camX = x; t.camY = y; };
var push = function (dx, dy) { t.joy.active = true; t.joy.dx = dx; t.joy.dy = dy; };
var stop = function () { t.joy.active = false; t.joy.dx = 0; t.joy.dy = 0; };
var out = { spots: [], stuck: [], randMoved: 0 };
for (var s = 0; s < SPOTS.length; s++) {
  var sp = SPOTS[s];
  var row = { name: sp[0], dirs: [] };
  for (var k = 0; k < 8; k++) {
    var a = k * Math.PI / 4;
    put(sp[1], sp[2]);
    await sleep(250);
    push(Math.cos(a), Math.sin(a));
    await sleep(1200);
    stop();
    row.dirs.push(Math.round(Math.hypot(L.x - sp[1], L.y - sp[2])));
  }
  out.spots.push(row);
}
if (RAND_SECS > 0) {
  var start = window.__probeStart || [L.x, L.y];
  put(start[0], start[1]);
  await sleep(300);
  var until = performance.now() + RAND_SECS * 1000;
  var ang = Math.random() * Math.PI * 2;
  var last = [L.x, L.y], lastAt = performance.now(), turnAt = performance.now() + 1500;
  while (performance.now() < until) {
    push(Math.cos(ang), Math.sin(ang));
    await sleep(100);
    var now = performance.now();
    if (now - lastAt >= 800) {
      var d = Math.hypot(L.x - last[0], L.y - last[1]);
      out.randMoved += d;
      if (d < 40) {
        out.stuck.push([Math.round(L.x), Math.round(L.y), Math.round(ang * 180 / Math.PI)]);
        ang = Math.random() * Math.PI * 2;
        turnAt = now + 1500;
      }
      last = [L.x, L.y]; lastAt = now;
    }
    if (now >= turnAt) { ang = Math.random() * Math.PI * 2; turnAt = now + 1500; }
  }
  stop();
  out.randMoved = Math.round(out.randMoved);
}
return JSON.stringify(out);
