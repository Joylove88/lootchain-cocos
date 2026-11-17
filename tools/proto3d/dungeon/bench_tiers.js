// 地宫小样 · 拆开量耗时(dungeon_dev.py eval @这个文件;先用想量的档位起预览,比如 --qs=&dq=phone --size=1600x720,QA_GPU=low 用核显)。
// 同一个机位(主角站在大厅中段),边转镜头边量;每一项改一个设置,量完改回去。返回每项的每帧毫秒(中位数)和绘制次数。
const d = D.dungeon;
const gl = document.querySelector('canvas').getContext('webgl') || document.querySelector('canvas').getContext('webgl2');
const px = new Uint8Array(4);
const base = { ...D.cfg };
D.shot();
D.tp(-1.5, 0.6, 0);
D.view({ yaw: 250, pitch: 10, dist: 4.4, fov: 55 });
await sleep(1500);
D.freeze(true);
await sleep(300);
const measure = async (n = 24) => {
  await sleep(250);
  const ts = [];
  for (let i = 0; i < n; i++) {
    d.view.yaw += 0.4;
    const t0 = performance.now();
    D.step(0, 1);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  const i = D.info();
  return { ms: +ts[Math.floor(ts.length / 2)].toFixed(1), draws: i.draws, tris: i.tris, lights: i.lightsOn };
};
const chars = () => [d.leader, ...d.followers.map((f) => f.c), ...d.mobs.map((m) => m.c)].filter(Boolean);
const out = { tier: D.info().tier, canvas: D.info().canvas, post: D.info().post && { scale: D.info().post.cfg.scale, ao: D.info().post.cfg.ao } };
out['这一档原样'] = await measure();
for (const n of [0, 1, 2, 3, 5]) {
  if (n === base.realLights) continue;
  D.set({ realLights: n });
  out['真灯 ' + n + ' 处'] = await measure();
}
D.set({ realLights: base.realLights });
chars().forEach((c) => { c.node.active = false; });
out['不放角色'] = await measure();
chars().forEach((c) => { c.node.active = true; });
D.set({ fill: 0 });
out['不要主角补光'] = await measure();
D.set({ fill: base.fill });
D.set({ shadow: 0 });
if (d.moon) d.moon.shadowEnabled = false;
out['月光不投影'] = await measure();
if (d.moon) d.moon.shadowEnabled = true;
D.set({ post: 0 });
out['关后期'] = await measure();
D.set({ post: base.post });
if (base.postScale > 0) D.post({ scale: base.postScale });
if (!base.reflect) {
  D.set({ reflect: true });
  out['开倒影'] = await measure();
  D.set({ reflect: false });
}
D.freeze(false);
return JSON.stringify(out, null, 1);
