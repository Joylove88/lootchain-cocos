// 预渲染 2.5D:跑图帧耗时(field_dev.py eval @tools/proto3d/pre25/bench_town.js)。
// 队长在原地附近绕圈跑 5 秒(摇杆方向每帧转),记每帧的间隔(requestAnimationFrame 时间戳)和绘制次数,返回中位数 / 95 分位 / 最长。
// 只量真实出图的节奏,不定格;在核显 + 手机视口下跑才有参考意义(QA_GPU=low field_dev.py start --view=phone)。
const dts = [];
const draws = [];
let last = 0;
let ang = 0;
const dev = cc.director.root.device;
const until = performance.now() + 5000;
await new Promise((done) => {
  const tick = (now) => {
    if (last) {
      dts.push(now - last);
      draws.push(dev.numDrawCalls);
    }
    last = now;
    ang += 0.03;
    t.joy.active = true;
    t.joy.dx = Math.cos(ang);
    t.joy.dy = Math.sin(ang);
    if (now < until) {
      requestAnimationFrame(tick);
    } else {
      done();
    }
  };
  requestAnimationFrame(tick);
});
t.joy.active = false;
t.joy.dx = 0;
t.joy.dy = 0;
const s = dts.slice().sort((a, b) => a - b);
const q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10;
const ds = draws.slice().sort((a, b) => a - b);
const cv = cc.game.canvas;
return JSON.stringify({ frames: s.length, median: q(0.5), p95: q(0.95), max: q(0.999), fps: Math.round(1000 / q(0.5)), drawsMedian: ds[Math.floor(ds.length / 2)], canvas: [cv.width, cv.height], map: t.def.code, pre25: !!window.__pre25 && window.__pre25.info().ready, gl: (() => { try { const gl = cv.getContext('webgl2') || cv.getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (e) { return '?'; } })() });
