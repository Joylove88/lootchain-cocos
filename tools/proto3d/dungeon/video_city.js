// 主城小样(?g3dcity=1)· 录屏脚本(dungeon_dev.py video … --script=这个文件 --secs=30;预览要用 reload --qs=&g3dcity=1 开成主城)。
// 第三轮的布局:从西边街口进广场(左前方是斜对着入口的铁匠铺)→ 走到炉口前 → 穿过罗盘纹去南边的集市摊位 → 走到教堂前(斜着看正面和南侧面)→ 出一套四连和一记剑气斩。
// 镜头朝向:yaw = 270 朝东(教堂),0 朝北,180 朝南。t = 录到第几秒。
D.shot();
D.tp(-16.5, 0.9, 0);
D.view({ yaw: 276, pitch: 7, dist: 5.0, fov: 64 });
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
    D.go(-11.5, -3.2);
    v.yaw = mix(276, 318, (t - 1.2) / 3.5);
  } else if (t < 10.5) {
    D.go(-9.4, -5.6);
    v.yaw = mix(318, 338, (t - 5) / 3);
    v.pitch = mix(7, 6, (t - 5) / 3);
  } else if (t < 17.5) {
    D.go(-6.0, 6.6);
    v.yaw = mix(338, 205, (t - 10.5) / 5.5);
  } else if (t < 20.5) {
    // 第十一轮:走到大台阶脚下
    D.go(9.6, -0.2);
    v.yaw = mix(205, 272, (t - 17.5) / 3);
    v.pitch = mix(4, 8, (t - 17.5) / 3);
  } else if (t < 25) {
    // 走上大台阶,到教堂门口
    D.go(17.6, -0.2);
    v.yaw = 272;
    v.pitch = mix(8, 4, (t - 20.5) / 4);
  }
  for (let k = 0; k < 4; k++) {
    once('a' + k, 25.4 + k * 0.25, () => D.skill('attack'));
  }
  once('wave', 27.4, () => D.skill('wave'));
  if (t > 25) {
    // 门口出几招,镜头绕到侧面、拉远,看台阶和广场
    v.yaw = mix(272, 205, (t - 25) / 5);
    v.dist = mix(5.0, 7.5, (t - 25) / 5);
    v.pitch = mix(4, 10, (t - 25) / 5);
  }
};
