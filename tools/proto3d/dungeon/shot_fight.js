// 地宫小样 · 打怪的定格:站到狼群旁,等它们围上来,砍几下,在最后一下刚命中的时候定格(dungeon_dev.py eval @这个文件)。
D.freeze(false);
D.shot();
D.tp(1.6, 1.2, 0);
D.view({ yaw: 205, pitch: 9, dist: 4.4, fov: 52 });
await sleep(2600);
const log = [];
for (let i = 0; i < 3; i++) {
  const ok = D.attack();
  await sleep(i === 2 ? 400 : 950);
  log.push({ ok, mobs: D.info().mobs.join(' ') });
}
D.freeze(true);
await sleep(200);
return JSON.stringify({ log, leader: D.info().leader, fx: D.info().fx });
