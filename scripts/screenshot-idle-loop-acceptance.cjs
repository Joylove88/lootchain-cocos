/* eslint-disable no-console */
// 二期闭环验收:大厅挂机收益面板(真实汇总/领取/自动挑战开关)E2E。
// 前置:Cocos preview(7456)与游戏服(8081)已启动;领取用例需要 user_idle_state 有累计时长。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';
const OUT_DIR = path.join(__dirname, '..', 'temp', 'idle-loop-acceptance');

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file });
  return file;
}

const sceneNodeExists = (name) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  let found = false;
  const walk = (node) => {
    if (!node || found) {
      return;
    }
    if (node.name === name && node.activeInHierarchy) {
      found = true;
      return;
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(scene);
  return found;
};

const emitSceneButtonClick = (buttonNodeName) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  let target = null;
  const walk = (node) => {
    if (!node || target) {
      return;
    }
    if (node.name === buttonNodeName && node.activeInHierarchy) {
      target = node;
      return;
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(scene);
  if (!target) {
    return false;
  }
  target.emit(cc.Button.EventType.CLICK, target.getComponent(cc.Button));
  return true;
};

const readSceneLabels = (prefix) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  const rows = [];
  const walk = (node) => {
    if (!node) {
      return;
    }
    if (node.name.startsWith(prefix) && node.activeInHierarchy) {
      const label = node.getComponent(cc.Label);
      if (label) {
        rows.push({ name: node.name, text: label.string });
      }
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(scene);
  return rows;
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const idleRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/player/idle/')) {
      idleRequests.push({ method: request.method(), url: request.url() });
    }
  });
  const files = [];
  const errors = [];

  await page.goto(`${PREVIEW_URL}${PREVIEW_URL.includes('?') ? '&' : '?'}r=idle-loop-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(15000);
  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await page.waitForTimeout(9000);

  const panelReady = await page.waitForFunction(sceneNodeExists, 'LobbyIdleRewardPanel', { timeout: 20000 }).then(() => true).catch(() => false);
  if (!panelReady) {
    errors.push('idle reward panel not found in lobby');
  }
  files.push(await screenshot(page, '01-lobby-idle-panel.png'));

  const beforeRows = await page.evaluate(readSceneLabels, 'LobbyIdle');
  console.log('idle panel labels:', JSON.stringify(beforeRows, null, 1));
  const hasRealSummary = beforeRows.some((row) => row.text.includes('待领取'));
  if (!hasRealSummary) {
    errors.push('idle panel missing real summary rows (待领取)');
  }

  // 领取收益
  const claimClicked = await page.evaluate(emitSceneButtonClick, 'LobbyIdleClaimButton');
  if (!claimClicked) {
    errors.push('claim button not clickable');
  }
  await page.waitForTimeout(5000);
  files.push(await screenshot(page, '02-after-claim.png'));
  const afterRows = await page.evaluate(readSceneLabels, 'LobbyIdle');
  console.log('after claim labels:', JSON.stringify(afterRows, null, 1));

  // 自动挑战开关
  const toggleClicked = await page.evaluate(emitSceneButtonClick, 'LobbyIdleAutoToggle');
  if (!toggleClicked) {
    errors.push('auto challenge toggle not clickable');
  }
  await page.waitForTimeout(2500);
  files.push(await screenshot(page, '03-auto-toggle-on.png'));
  const toggleRows = await page.evaluate(readSceneLabels, 'LobbyIdleAutoToggle');
  console.log('toggle labels:', JSON.stringify(toggleRows, null, 1));
  const toggleOn = toggleRows.some((row) => row.text.includes('自动挑战 · 开'));
  if (!toggleOn) {
    errors.push('auto challenge toggle did not switch on');
  }

  const claimRequests = idleRequests.filter((request) => request.method === 'POST');
  const summaryRequests = idleRequests.filter((request) => request.method === 'GET');
  console.log(`idle summary requests: ${summaryRequests.length}`);
  console.log(`idle claim requests: ${claimRequests.length}`);
  if (summaryRequests.length < 1) {
    errors.push('no idle summary request observed');
  }
  if (claimRequests.length < 1) {
    errors.push('no idle claim request observed');
  }

  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({ files, idleRequests, beforeRows, afterRows, toggleRows, errors }, null, 2), 'utf8');
  await browser.close();
  console.log(`screenshots: ${OUT_DIR}`);
  if (errors.length > 0) {
    console.error(`errors: ${errors.join('; ')}`);
    process.exit(1);
  }
  console.log('idle loop acceptance ok');
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
