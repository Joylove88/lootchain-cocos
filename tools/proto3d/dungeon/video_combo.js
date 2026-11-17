// 地宫小样 · 连招和技能的录屏脚本(dungeon_dev.py video … --script=这个文件 --secs=30)。
// 时间是按动作库(Mixamo 大剑包)那套招式调快之后的时长排的:四连约 1.9 秒、连环斩 1.3、突进斩 0.8、跃空重劈 0.8、剑气斩 0.5。
// 走到狼群旁 → 四连 → 连环斩 → 突进斩 → 四连 → 剑气斩 → 走向熊 → 四连 → 跃空重劈 → 四连 → 连环斩 → 剑气斩 → 四连 → 突进斩 → 四连 → 跃空重劈。
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
  mash(2.6, 4.3, 0.25);
  if (t > 2.6 && t < 9) {
    v.yaw = mix(232, 205, (t - 2.6) / 6.4);
    v.pitch = mix(11, 14, (t - 2.6) / 6.4);
  }
  once('whirl', 5.0, () => D.skill('whirl'));
  once('dash', 6.8, () => D.skill('dash'));
  mash(8.0, 9.2, 0.25);
  once('wave', 9.8, () => D.skill('wave'));
  if (t > 10.6 && t < 13.0) {
    D.go(4.4, -0.9);
    v.yaw = mix(205, 250, (t - 10.6) / 2.4);
    v.dist = mix(5.0, 5.6, (t - 10.6) / 2.4);
  }
  mash(13.2, 14.9, 0.25);
  once('smash', 15.6, () => D.skill('smash'));
  mash(16.9, 18.6, 0.25);
  once('whirl2', 19.2, () => D.skill('whirl'));
  once('wave2', 21.0, () => D.skill('wave'));
  mash(22.0, 23.7, 0.25);
  once('dash2', 24.2, () => D.skill('dash'));
  mash(25.4, 27.1, 0.25);
  once('smash2', 27.7, () => D.skill('smash'));
  if (t > 15) {
    v.yaw = mix(250, 300, (t - 15) / 14);
    v.pitch = mix(14, 18, (t - 15) / 14);
  }
};
