// 地宫小样 · 连招和技能的录屏脚本(dungeon_dev.py video … --script=这个文件 --secs=30)。
// 时间是按动作库(Mixamo 大剑包)那套招式的时长排的:四连约 2.8 秒、连环斩 1.8、突进斩 1.1、跃空重劈 1.2、剑气斩 0.8。
// 走到狼群旁 → 四连普攻 → 连环斩 → 突进斩穿过去 → 剑气斩 → 走向熊 → 四连 → 跃空重劈 → 四连 → 连环斩 → 剑气斩 → 突进斩收尾。
// t = 录到第几秒。出手一律走 D.skill(和按键是同一个入口);同一刻只递一次。
D.shot();
D.tp(-3.2, 1.0, 0);
D.view({ yaw: 250, pitch: 11, dist: 5.0, fov: 52 });
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
  // 连着按普攻:from ~ to 之间每隔 every 秒递一次(提前按会被记下来,到点自动接)
  const mash = (from, to, every) => {
    for (let k = 0; from + k * every < to; k++) {
      once('a' + from + '_' + k, from + k * every, () => D.skill('attack'));
    }
  };
  if (t < 2.4) {
    D.go(0.6, 1.1);
    v.yaw = mix(250, 232, t / 2.4);
  }
  mash(2.6, 5.2, 0.3);
  if (t > 2.6 && t < 9) {
    v.yaw = mix(232, 205, (t - 2.6) / 6.4);
    v.pitch = mix(11, 14, (t - 2.6) / 6.4);
  }
  once('whirl', 6.0, () => D.skill('whirl'));
  once('dash', 8.2, () => D.skill('dash'));
  mash(9.6, 10.6, 0.3);
  once('wave', 11.2, () => D.skill('wave'));
  if (t > 12.2 && t < 14.6) {
    D.go(4.4, -0.9);
    v.yaw = mix(205, 250, (t - 12.2) / 2.4);
    v.dist = mix(5.0, 5.6, (t - 12.2) / 2.4);
  }
  mash(14.8, 17.2, 0.3);
  once('smash', 17.9, () => D.skill('smash'));
  mash(19.4, 21.8, 0.3);
  once('whirl2', 22.6, () => D.skill('whirl'));
  once('wave2', 24.8, () => D.skill('wave'));
  mash(25.8, 27.0, 0.3);
  once('dash2', 27.8, () => D.skill('dash'));
  if (t > 16.6) {
    v.yaw = mix(250, 300, (t - 16.6) / 12);
    v.pitch = mix(14, 18, (t - 16.6) / 12);
  }
};
