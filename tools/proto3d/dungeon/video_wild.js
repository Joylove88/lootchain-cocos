// 野外小样(?g3dwild=1)· 录屏脚本(dungeon_dev.py video … --script=这个文件 --secs=30;预览要用 reload --qs=&g3dwild=1 开成野外)。
// 沿旧石板路走进营地 → 篝火边打狼和蜘蛛(四连、连环斩、突进斩、剑气斩)→ 走到残墙那边打熊(四连、跃空重劈、连环斩)。
// t = 录到第几秒。出手一律走 D.skill(和按键是同一个入口);同一刻只递一次。
D.shot();
D.tp(-9.6, 2.3, 0);
D.view({ yaw: 268, pitch: 9, dist: 5.2, fov: 55 });
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
  const mash = (from, to, every) => {
    for (let k = 0; from + k * every < to; k++) {
      once('a' + from + '_' + k, from + k * every, () => D.skill('attack'));
    }
  };
  if (t < 3.6) {
    D.go(0.4, 2.4);
    v.yaw = mix(268, 246, t / 3.6);
    v.pitch = mix(9, 12, t / 3.6);
  }
  mash(3.8, 5.5, 0.25);
  if (t > 3.8 && t < 10) {
    v.yaw = mix(246, 215, (t - 3.8) / 6.2);
    v.pitch = mix(12, 15, (t - 3.8) / 6.2);
  }
  once('whirl', 6.2, () => D.skill('whirl'));
  once('dash', 8.0, () => D.skill('dash'));
  mash(9.2, 10.4, 0.25);
  once('wave', 11.0, () => D.skill('wave'));
  if (t > 11.8 && t < 14.2) {
    D.go(4.6, -0.6);
    v.yaw = mix(215, 256, (t - 11.8) / 2.4);
    v.dist = mix(5.2, 5.8, (t - 11.8) / 2.4);
  }
  mash(14.4, 16.1, 0.25);
  once('smash', 16.8, () => D.skill('smash'));
  mash(18.1, 19.8, 0.25);
  once('whirl2', 20.4, () => D.skill('whirl'));
  once('wave2', 22.2, () => D.skill('wave'));
  mash(23.2, 24.9, 0.25);
  once('dash2', 25.4, () => D.skill('dash'));
  mash(26.6, 28.2, 0.25);
  if (t > 16) {
    v.yaw = mix(256, 310, (t - 16) / 14);
    v.pitch = mix(15, 19, (t - 16) / 14);
  }
};
