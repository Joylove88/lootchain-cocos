// 地宫小样 · 输入自检(dungeon_dev.py eval @这个文件):往窗口 / 画布上发键盘和指针事件(和浏览器真发的走同一条路),看主角动没动、镜头转没转、出手没出手。
// 无头浏览器里发的是「合成事件」:能证明这段监听代码是对的,证明不了真手指的手感。
D.freeze(false);
D.shot();
D.tp(-4.0, 1.6, 0);
D.view({ yaw: 262, pitch: 8, dist: 4, fov: 55 });
await sleep(800);
const cv = document.querySelector('canvas');
const r = cv.getBoundingClientRect();
const pos = () => D.info().leader.slice(0, 2);
const out = {};
// 键盘:按住 D 0.7 秒(往镜头的右手边走)
let a = pos();
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
await sleep(700);
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
await sleep(200);
let b = pos();
out['键盘 D 0.7 秒'] = { 走了几米: +Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2) };
// 触屏摇杆:左半屏按下,往上推(往镜头看过去的方向走)
const pe = (type, id, x, y, extra = {}) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: r.left + x * r.width, clientY: r.top + y * r.height, bubbles: true, ...extra }));
a = pos();
pe('pointerdown', 11, 0.15, 0.7);
pe('pointermove', 11, 0.15, 0.5);
await sleep(700);
out['摇杆推着的时候'] = { stick: D.info().stick };
pe('pointerup', 11, 0.15, 0.5);
await sleep(200);
b = pos();
out['摇杆往上 0.7 秒'] = { 走了几米: +Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2), 松手后: D.info().stick };
// 触屏转镜头:右半屏横着拖
const y0 = D.info().view.yaw;
pe('pointerdown', 12, 0.7, 0.5);
for (let i = 1; i <= 6; i++) pe('pointermove', 12, 0.7 + i * 0.02, 0.5);
pe('pointerup', 12, 0.82, 0.5);
out['右半屏横拖'] = { 镜头转了几度: +(D.info().view.yaw - y0).toFixed(1) };
// 触屏出手:右半屏点一下
await sleep(900);
const before = D.info().act;
pe('pointerdown', 13, 0.75, 0.6);
await sleep(60);
pe('pointerup', 13, 0.75, 0.6);
await sleep(50);
out['右半屏点一下'] = { 出手了: !before && !!D.info().act };
await sleep(1200);
// 鼠标:右键拖动转镜头、滚轮缩放、左键出手
const me = (type, x, y, extra = {}) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientX: r.left + x * r.width, clientY: r.top + y * r.height, bubbles: true, ...extra }));
const y1 = D.info().view.yaw;
me('pointerdown', 0.5, 0.5, { button: 2 });
me('pointermove', 0.56, 0.5);
me('pointerup', 0.56, 0.5, { button: 2 });
const d0 = D.info().view.dist;
cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
out['鼠标右键拖 + 滚轮'] = { 镜头转了几度: +(D.info().view.yaw - y1).toFixed(1), 距离: [d0, +D.info().view.dist.toFixed(2)] };
const b2 = D.info().act;
me('pointerdown', 0.5, 0.5, { button: 0 });
me('pointerup', 0.5, 0.5, { button: 0 });
await sleep(50);
out['鼠标左键'] = { 出手了: !b2 && !!D.info().act };
return JSON.stringify(out, null, 1);
