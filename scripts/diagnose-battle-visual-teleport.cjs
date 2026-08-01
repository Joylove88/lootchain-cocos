const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve('artifacts/battle-visual-teleport-current');
const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetDir(dir) {
  ensureDir(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(json|png|webm)$/i.test(entry.name)) {
      fs.unlinkSync(path.join(dir, entry.name));
    }
  }
}

function normalizeHeroList(data) {
  return Array.isArray(data) ? data.filter((hero) => hero && typeof hero === 'object') : [];
}

function heroRarity(hero) {
  return String(hero.rarity || '').trim().toUpperCase();
}

function isBackRoleHero(hero) {
  const heroClass = String(hero.heroClass || '').toLowerCase();
  return heroClass.includes('mage')
    || heroClass.includes('archer')
    || heroClass.includes('support')
    || heroClass.includes('priest')
    || heroClass.includes('法')
    || heroClass.includes('射')
    || heroClass.includes('弓')
    || heroClass.includes('牧')
    || heroClass.includes('辅')
    || heroClass.includes('远程');
}

function isSrRActHero(hero) {
  return /^(SR|R)$/.test(heroRarity(hero))
    && Number.isFinite(Number(hero.id))
    && Number(hero.id) > 0
    && hero.protagonist !== true
    && String(hero.heroCode || '').toUpperCase().startsWith('EX_') === false
    && String(hero.portraitAsset || '').trim().startsWith('act_');
}

function summarizeHero(hero) {
  return {
    id: Number(hero.id),
    heroCode: String(hero.heroCode || ''),
    heroName: String(hero.heroName || ''),
    rarity: heroRarity(hero),
    heroClass: String(hero.heroClass || ''),
    portraitAsset: String(hero.portraitAsset || ''),
    power: Number(hero.power || 0),
  };
}

function resolveForcedSrRBattleFormation(heroes) {
  const usable = normalizeHeroList(heroes)
    .filter((hero) => Number(hero.id) > 0 && hero.protagonist !== true && heroRarity(hero) !== 'EX')
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
  const srRActHeroes = usable.filter(isSrRActHero);
  const frontSrRHeroes = srRActHeroes.filter((hero) => !isBackRoleHero(hero));
  const frontSrR = frontSrRHeroes[0] ?? srRActHeroes[0];
  if (!frontSrR) {
    return null;
  }
  const selected = [];
  const pushUnique = (hero) => {
    if (!hero || selected.length >= 5 || selected.some((item) => Number(item.id) === Number(hero.id))) {
      return;
    }
    selected.push(hero);
  };
  frontSrRHeroes.forEach(pushUnique);
  srRActHeroes.forEach(pushUnique);
  usable.forEach(pushUnique);
  return {
    mode: 'srr',
    heroIds: selected.map((hero) => Number(hero.id)).filter((id) => Number.isFinite(id) && id > 0),
    leaderHeroId: Number(frontSrR.id),
    selected: selected.map(summarizeHero),
  };
}

async function waitForLobbyReadyAndDisableNativeVideo(page) {
  await page.waitForFunction(() => {
    const cc = globalThis.cc;
    const scene = cc?.director?.getScene?.();
    if (!scene) {
      return false;
    }
    const nodes = [];
    const walk = (node) => {
      nodes.push(node);
      for (const child of node.children || []) {
        walk(child);
      }
    };
    walk(scene);
    const runtimeRoot = nodes.find((node) => node?.name === 'LootChainCocosLoginUIRoot');
    return Boolean(runtimeRoot?.children?.some((child) => child?.name === 'LobbyBottomHud'));
  }, null, { timeout: 30000 });

  await page.evaluate(() => {
    for (const video of Array.from(document.querySelectorAll('video'))) {
      try {
        video.pause();
      } catch {
        // Ignore native media pause failures in headless Chromium.
      }
      video.style.zIndex = '-1';
      video.style.pointerEvents = 'none';
      video.removeAttribute('controls');
    }
  });
}

async function readLobbyHeroesForBattleAcceptance(page) {
  return page.evaluate(async () => {
    const tokenName = localStorage.getItem('lootchain.player.tokenName');
    const tokenValue = localStorage.getItem('lootchain.player.tokenValue');
    if (!tokenName || !tokenValue) {
      throw new Error('missing lootchain player token in localStorage');
    }
    const response = await fetch('http://localhost:8081/api/player/lobby/heroes', {
      headers: {
        [tokenName]: tokenValue,
        'Accept-Language': 'zh-CN',
      },
    });
    const payload = await response.json();
    if (!response.ok || payload.code !== 0 || !Array.isArray(payload.data)) {
      throw new Error(`failed to read lobby heroes for battle acceptance: ${JSON.stringify(payload).slice(0, 300)}`);
    }
    return payload.data;
  });
}

async function installVisualFrameSampler(page) {
  await page.evaluate(() => {
    const root = globalThis;
    root.__lootchainVisualTeleportSamples = [];
    root.__lootchainVisualTeleportRunning = true;
    const collect = () => {
      if (!root.__lootchainVisualTeleportRunning) {
        return;
      }
      const cc = root.cc;
      const scene = cc?.director?.getScene?.();
      const samples = [];
      if (scene) {
        const walk = (node, parentPath = '') => {
          const path = parentPath ? `${parentPath}/${node.name || ''}` : String(node.name || '');
          if (/LobbyBattleActor_(Ally|Enemy)_/.test(String(node.name || ''))) {
            const pos = node.position;
            const visualRoot = (node.children || []).find((child) => child?.name === 'LobbyBattleActorVisualRoot');
            const visualPos = visualRoot?.position;
            samples.push({
              name: String(node.name || ''),
              path,
              x: Math.round(Number(pos?.x || 0) * 100) / 100,
              y: Math.round(Number(pos?.y || 0) * 100) / 100,
              visualX: Math.round(Number(visualPos?.x || 0) * 100) / 100,
              visualY: Math.round(Number(visualPos?.y || 0) * 100) / 100,
              active: node.active === true,
            });
          }
          for (const child of node.children || []) {
            walk(child, path);
          }
        };
        walk(scene);
      }
      root.__lootchainVisualTeleportSamples.push({
        at: Math.round(performance.now() * 100) / 100,
        wallAt: Date.now(),
        samples,
        telemetryPhase: root.__lootchainBattlePlaybackTelemetry?.samples?.at?.(-1)?.phase ?? null,
        telemetryAction: root.__lootchainBattlePlaybackTelemetry?.samples?.at?.(-1)?.currentActionKind ?? null,
      });
      if (root.__lootchainVisualTeleportSamples.length > 1200) {
        root.__lootchainVisualTeleportSamples.splice(0, root.__lootchainVisualTeleportSamples.length - 1200);
      }
      requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  });
}

function analyzeVisualSamples(frames) {
  const errors = [];
  const jumps = [];
  const byNode = new Map();
  for (const frame of frames) {
    for (const sample of frame.samples || []) {
      if (!sample.active) {
        continue;
      }
      const list = byNode.get(sample.name) ?? [];
      list.push({ ...sample, at: frame.at, wallAt: frame.wallAt, telemetryPhase: frame.telemetryPhase, telemetryAction: frame.telemetryAction });
      byNode.set(sample.name, list);
    }
  }
  for (const [name, list] of byNode.entries()) {
    list.sort((a, b) => a.at - b.at);
    for (let index = 1; index < list.length; index += 1) {
      const prev = list[index - 1];
      const current = list[index];
      const dt = Math.max(1, current.at - prev.at);
      const dx = current.x - prev.x;
      const dy = current.y - prev.y;
      const distance = Math.hypot(dx, dy);
      const speed = distance / dt;
      const sceneReset = Math.abs(current.wallAt - prev.wallAt) > 260;
      if (sceneReset) {
        continue;
      }
      if (distance > 46 || speed > 1.6) {
        jumps.push({
          name,
          distance: Math.round(distance * 100) / 100,
          speed: Math.round(speed * 1000) / 1000,
          dt: Math.round(dt * 100) / 100,
          prev,
          current,
        });
      }
    }
  }
  jumps.sort((a, b) => b.distance - a.distance || b.speed - a.speed);
  if (jumps.length > 0) {
    errors.push(`visual actor node teleport risk: jumps=${jumps.length}, max=${jumps[0].distance}px/${jumps[0].dt}ms`);
  }
  return {
    errors,
    summary: {
      frameCount: frames.length,
      actorNodeCount: byNode.size,
      jumpCount: jumps.length,
      maxJump: jumps[0] ?? null,
    },
    jumps: jumps.slice(0, 40),
  };
}

(async () => {
  resetDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleLines = [];
  const requests = [];
  const forcedBattleStartBodies = [];
  let forcedBattleFormation = null;
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => consoleLines.push({ type: message.type(), text: message.text() }));
  page.on('request', (request) => {
    if (request.url().includes('/api/player/')) {
      requests.push({ method: request.method(), url: request.url(), postData: request.postData() });
    }
  });
  await page.route('**/api/player/battles/start', async (route) => {
    const request = route.request();
    if (!forcedBattleFormation || request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const original = JSON.parse(request.postData() || '{}');
    const body = {
      ...original,
      heroIds: forcedBattleFormation.heroIds,
      leaderHeroId: forcedBattleFormation.leaderHeroId,
      requestId: `${original.requestId || 'battle-start'}-visual-teleport`,
    };
    forcedBattleStartBodies.push(body);
    await route.continue({ postData: JSON.stringify(body) });
  });

  await page.goto(`${PREVIEW_URL}${PREVIEW_URL.includes('?') ? '&' : '?'}r=visual-teleport-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(15000);
  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await waitForLobbyReadyAndDisableNativeVideo(page);
  await page.waitForTimeout(1200);
  forcedBattleFormation = resolveForcedSrRBattleFormation(await readLobbyHeroesForBattleAcceptance(page));
  if (!forcedBattleFormation) {
    throw new Error('missing forced SR/R battle formation');
  }
  await page.mouse.click(1125, 690);
  await page.waitForTimeout(2600);
  await page.mouse.click(1022, 648);
  await page.waitForTimeout(1800);
  await installVisualFrameSampler(page);
  await page.mouse.click(696, 517);
  await page.waitForTimeout(8500);
  const screenshotPath = path.join(OUT_DIR, 'visual-teleport-diagnostic.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const frames = await page.evaluate(() => {
    globalThis.__lootchainVisualTeleportRunning = false;
    return globalThis.__lootchainVisualTeleportSamples ?? [];
  });
  const video = page.video();
  await page.close();
  const rawVideoPath = await video.path();
  await context.close();
  await browser.close();
  const videoPath = path.join(OUT_DIR, 'visual-teleport-diagnostic.webm');
  fs.renameSync(rawVideoPath, videoPath);

  const filteredConsole = consoleLines.filter((line) => line.type === 'error' && !line.text.includes('ReadPixels'));
  const settleRequests = requests.filter((request) => /\/api\/player\/battles\/[^/]+\/settle/.test(request.url));
  const analysis = analyzeVisualSamples(frames);
  const result = {
    screenshotPath,
    videoPath,
    forcedBattleFormation,
    forcedBattleStartBodies,
    pageErrors,
    consoleErrors: filteredConsole,
    settleRequests,
    analysis,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'visual-teleport-diagnostic.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`battle visual teleport diagnostics: ${OUT_DIR}`);
  console.log(`frames: ${analysis.summary.frameCount}`);
  console.log(`actor nodes: ${analysis.summary.actorNodeCount}`);
  console.log(`visual jumps: ${analysis.summary.jumpCount}`);
  if (pageErrors.length > 0 || filteredConsole.length > 0 || settleRequests.length > 0 || analysis.errors.length > 0) {
    console.error(`diagnostic errors: ${[
      ...analysis.errors,
      pageErrors.length > 0 ? `pageErrors=${pageErrors.length}` : '',
      filteredConsole.length > 0 ? `consoleErrors=${filteredConsole.length}` : '',
      settleRequests.length > 0 ? `settleRequests=${settleRequests.length}` : '',
    ].filter(Boolean).join('; ')}`);
    process.exit(1);
  }
})();
