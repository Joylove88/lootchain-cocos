import { chromium } from 'playwright';

const OUT = 'artifacts/stage13-preview-login.png';
const URL = 'http://localhost:7456/';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: OUT, fullPage: false });
console.log('screenshot saved: ' + OUT);
console.log('console errors: ' + errors.length);
if (errors.length > 0) {
  errors.slice(0, 5).forEach((e) => console.log('  ERR: ' + e));
}
await browser.close();