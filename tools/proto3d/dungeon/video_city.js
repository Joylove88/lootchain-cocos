// 主城小样(?g3dcity=1)· 录屏脚本(dungeon_dev.py video … --script=这个文件 --secs=30;预览要用 reload --qs=&g3dcity=1 开成主城)。
// 第二轮的布局:从西边街口进广场(左前方是铁匠铺的炉火)→ 走到铁匠铺门口 → 穿过罗盘纹去南边的集市摊位 → 走到教堂台阶前 → 出一套四连和一记剑气斩。
// 镜头朝向:yaw = 270 朝东(教堂),0 朝北,180 朝南。t = 录到第几秒。
D.shot();
D.tp(-16.5, 0.6, 0);
D.view({ yaw: 282, pitch: -1, dist: 4.8, fov: 58 });
window.__dgDone = {};
window.__dgScript = (t) => {
  const v = D.dungeon.view;
  const mix = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));
  const once = (key, at, fn) => {
    if (t >= at && !window.__dgDone[key]) {
      window.__dgDone[key] = 1;
      fn();
    }
  };
  if (t < 1.2) {
    // 开场停一下:这个机位就是原型的构图
  } else if (t < 5) {
    D.go(-9.5, -1.5);
    v.yaw = mix(282, 300, (t - 1.2) / 3.5);
  } else if (t < 10.5) {
    D.go(-5.6, -5.4);
    v.yaw = mix(300, 348, (t - 5) / 3.5);
    v.pitch = mix(-1, 5, (t - 5) / 3.5);
  } else if (t < 17.5) {
    D.go(5.4, 8.4);
    v.yaw = mix(348, 205, (t - 10.5) / 5.5);
  } else if (t < 23) {
    D.go(14.5, 0.4);
    v.yaw = mix(205, 270, (t - 17.5) / 4);
    v.pitch = mix(5, -4, (t - 17.5) / 4.5);
  }
  for (let k = 0; k < 6; k++) {
    once('a' + k, 24 + k * 0.25, () => D.skill('attack'));
  }
  once('wave', 27.2, () => D.skill('wave'));
  if (t > 23) {
    v.yaw = mix(270, 248, (t - 23) / 7);
    v.dist = mix(4.8, 5.8, (t - 23) / 7);
    v.pitch = mix(-4, 2, (t - 23) / 5);
  }
};
