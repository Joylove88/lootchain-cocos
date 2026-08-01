const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (x) => errors.push(String(x)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:7456/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'artifacts/stage13-preview-01-login.png' });
  console.log('saved stage13-preview-01-login.png');

  // Try to click login button (center area, common position)
  // First inspect canvas/buttons
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const btns = Array.from(document.querySelectorAll('button, [class*=button], [class*=Button]'));
    return {
      hasCanvas: !!canvas,
      canvasRect: canvas ? { x: canvas.getBoundingClientRect().x, y: canvas.getBoundingClientRect().y, w: canvas.width, h: canvas.height } : null,
      btnCount: btns.length,
      btns: btns.slice(0, 10).map((b) => ({ text: (b.textContent || '').slice(0, 30), x: b.getBoundingClientRect().x, y: b.getBoundingClientRect().y })),
    };
  });
  console.log('page info: ' + JSON.stringify(info));

  // Click center to trigger login (Cocos canvas-based UI)
  await page.mouse.click(640, 360);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'artifacts/stage13-preview-02-after-click.png' });
  console.log('saved stage13-preview-02-after-click.png');

  // Click again (might be a second screen)
  await page.mouse.click(640, 500);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'artifacts/stage13-preview-03-lobby.png' });
  console.log('saved stage13-preview-03-lobby.png');

  console.log('console errors: ' + errors.length);
  if (errors.length > 0) {
    errors.slice(0, 5).forEach((e) => console.log('  ERR: ' + e));
  }
  await browser.close();
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });