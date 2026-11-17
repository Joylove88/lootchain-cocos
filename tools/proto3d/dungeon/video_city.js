// 主城小样(?g3dcity=1)· 录屏脚本(dungeon_dev.py video … --script=这个文件 --secs=30;预览要用 reload --qs=&g3dcity=1 开成主城)。
// 从西边走进广场、正对教堂 → 拐去北边的铁匠铺和水井 → 穿过罗盘纹去南边的集市摊位 → 走到教堂台阶前 → 在广场上出一套四连和一记剑气斩。
// 镜头朝向:yaw = 270 朝东(教堂),0 朝北,180 朝南。t = 录到第几秒。
D.shot();
D.tp(-15, 0.6, 0);
D.view({ yaw: 270, pitch: 4, dist: 4.8, fov: 58 });
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
  if (t < 4.5) {
    D.go(-2, 0.5);
  } else if (t < 10) {
    D.go(-7.5, -8.6);
    v.yaw = mix(270, 322, (t - 4.5) / 3.5);
    v.pitch = mix(4, 7, (t - 4.5) / 3.5);
  } else if (t < 17) {
    D.go(5.2, 8.6);
    v.yaw = mix(322, 218, (t - 10) / 5);
  } else if (t < 23) {
    D.go(15, 0.4);
    v.yaw = mix(218, 270, (t - 17) / 4);
    v.pitch = mix(7, 3, (t - 17) / 4);
  }
  for (let k = 0; k < 6; k++) {
    once('a' + k, 24 + k * 0.25, () => D.skill('attack'));
  }
  once('wave', 27.2, () => D.skill('wave'));
  if (t > 23) {
    v.yaw = mix(270, 250, (t - 23) / 7);
    v.dist = mix(4.8, 5.6, (t - 23) / 7);
  }
};
