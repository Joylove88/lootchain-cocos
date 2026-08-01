const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (x) => errors.push(String(x)));

  await page.goto('http://localhost:7456/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'artifacts/stage13-preview-01-login.png' });
  console.log('saved 01-login');

  // 点击中心进入大厅
  await page.mouse.click(640, 360);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'artifacts/stage13-preview-02-lobby.png' });
  console.log('saved 02-lobby');

  // 检查大厅画面，找冒险按钮区域（通常底部导航栏）
  // 大厅底部导航栏：冒险按钮通常在左侧或中部
  // 尝试点击可能的冒险入口位置
  const positions = [
    { name: 'bottom-left', x: 200, y: 660 },
    { name: 'bottom-center-left', x: 350, y: 660 },
    { name: 'bottom-center', x: 640, y: 660 },
    { name: 'mid-left', x: 150, y: 400 },
    { name: 'bottom-center-right', x: 500, y: 660 },
  ];
  
  for (const pos of positions) {
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `artifacts/stage13-preview-try-${pos.name}.png` });
    console.log('saved try-' + pos.name);
  }

  console.log('console errors: ' + errors.length);
  if (errors.length > 0) errors.slice(0, 5).forEach((e) => console.log('  ERR: ' + e));
  await browser.close();
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });