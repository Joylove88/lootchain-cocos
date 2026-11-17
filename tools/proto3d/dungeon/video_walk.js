// 地宫小样的录屏脚本(dungeon_dev.py video … --script=这个文件):从铁栅门走到天井下 → 走到狼群旁 → 砍几下 → 镜头绕半圈 → 去打熊。
// t = 录到第几秒。主角走位用 D.go(自动走到某点),镜头直接改 D.dungeon.view。
D.shot();
D.tp(-9.6, 1.4, 0);
D.view({ yaw: 268, pitch: 7, dist: 3.6, fov: 55 });
window.__dgNext = 0;
window.__dgScript = (t) => {
  const v = D.dungeon.view;
  const mix = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));
  const hit = (from, to, every) => {
    if (t >= from && t < to && t >= window.__dgNext) {
      D.attack();
      window.__dgNext = t + every;
    }
  };
  if (t < 4.5) {
    D.go(-4.4, 1.2);
    v.yaw = mix(268, 250, t / 4.5);
  } else if (t < 8) {
    D.go(0.9, 1.1);
    v.yaw = mix(250, 222, (t - 4.5) / 3.5);
    v.dist = mix(3.6, 4.4, (t - 4.5) / 3.5);
    v.pitch = mix(7, 10, (t - 4.5) / 3.5);
  } else if (t < 14) {
    hit(8.6, 14, 0.95);
    v.yaw = mix(222, 200, (t - 8) / 6);
  } else if (t < 19) {
    hit(14, 19, 1.0);
    v.yaw = mix(200, 330, (t - 14) / 5);
    v.pitch = mix(10, 16, (t - 14) / 5);
  } else if (t < 23) {
    D.go(4.6, -0.6);
    v.yaw = mix(330, 262, (t - 19) / 4);
    v.pitch = mix(16, 9, (t - 19) / 4);
  } else {
    hit(23, 60, 0.95);
    v.yaw = mix(262, 240, (t - 23) / 5);
  }
};
