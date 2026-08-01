/* eslint-disable no-console */
// 验收:英雄详情升级消耗行 + 背包物品详情获取途径行(自绘描边+箭头)。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';
const OUT_DIR = path.join(__dirname, '..', 'temp', 'hero-bag-detail');

const sceneNodeExists = (name) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  let found = false;
  const walk = (node) => {
    if (!node || found) return;
    if (node.name === name && node.activeInHierarchy) { found = true; return; }
    for (const child of node.children || []) walk(child);
  };
  walk(scene);
  return found;
};

const emitSceneButtonClick = (buttonNodeName) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  let target = null;
  const walk = (node) => {
    if (!node || target) return;
    if (node.name === buttonNodeName && node.activeInHierarchy) { target = node; return; }
    for (const child of node.children || []) walk(child);
  };
  walk(scene);
  if (!target) return false;
  target.emit(cc.Button.EventType.CLICK, target.getComponent(cc.Button));
  return true;
};

const readLabels = (prefix) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  const rows = [];
  const walk = (node) => {
    if (!node) return;
    if (node.name.startsWith(prefix) && node.activeInHierarchy) {
      const label = node.getComponent(cc.Label);
      if (label) rows.push({ name: node.name, text: label.string });
    }
    for (const child of node.children || []) walk(child);
  };
  walk(scene);
  return rows;
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];

  await page.goto(`${PREVIEW_URL}?r=hbd-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(15000);
  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await page.waitForTimeout(9000);

  // ---- 英雄详情:底部导航"英雄"→ 第一张卡 → 详情
  await page.evaluate(emitSceneButtonClick, 'LobbyNavItem_hero');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, '01-roster.png') });
  const cardClicked = await page.evaluate(emitSceneButtonClick, 'LobbyHeroRosterCard_0');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT_DIR, '02-hero-detail.png') });
  const costRows = await page.evaluate(readLabels, 'LobbyHeroDetailLevelUpCost');
  console.log('cardClicked:', cardClicked, 'cost line:', JSON.stringify(costRows));
  if (!costRows.some((row) => row.text.includes('升级至') || row.text.includes('上限') || row.text.includes('读取中'))) {
    errors.push('hero detail cost line missing');
  }

  // ---- 背包详情:重载回大厅后从导航进背包(避免跨场景返回路径不稳)
  await page.goto(`${PREVIEW_URL}?r=hbd2-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(15000);
  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await page.waitForTimeout(9000);
  await page.evaluate(emitSceneButtonClick, 'LobbyNavItem_bag');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT_DIR, '03-bag.png') });
  const cellClicked = await page.evaluate(emitSceneButtonClick, 'LobbyBagItemCard_0');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, '04-bag-detail.png') });
  const srcRows = await page.evaluate(readLabels, 'LobbyBagSourceDesc');
  console.log('cellClicked:', cellClicked, 'source rows:', JSON.stringify(srcRows));
  const hasPlate = await page.evaluate(sceneNodeExists, 'LobbyBagSourceRowPlate_0');
  if (!hasPlate) {
    errors.push('bag source row plate missing');
  }

  await browser.close();
  console.log(`out: ${OUT_DIR}`);
  if (errors.length > 0) {
    console.error('errors:', errors.join('; '));
    process.exit(1);
  }
  console.log('hero+bag detail acceptance ok');
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
