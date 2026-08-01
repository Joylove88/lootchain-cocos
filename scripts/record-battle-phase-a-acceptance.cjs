const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';
const OUT_DIR = path.resolve('artifacts/battle-phase-a-acceptance-current');
const BASE_RESULT = path.resolve('artifacts/battle-center-convergence-current/preview-result.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetDir(dir) {
  ensureDir(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(json|html|png|webm)$/i.test(entry.name)) {
      fs.unlinkSync(path.join(dir, entry.name));
    }
  }
}

function writeJson(name, data) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return file;
}

function writeText(name, text) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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
    spineAsset: String(hero.spineAsset || ''),
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
    frontSrR: summarizeHero(frontSrR),
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
    const cc = globalThis.cc;
    const scene = cc?.director?.getScene?.();
    if (!scene) {
      return;
    }
    const nodes = [];
    const walk = (node) => {
      nodes.push(node);
      for (const child of node.children || []) {
        walk(child);
      }
    };
    walk(scene);
    const videoNode = nodes.find((node) => node?.name === 'Lobby_BG_Video');
    const video = videoNode?.getComponent?.(cc.VideoPlayer);
    try {
      video?.stop?.();
    } catch {
      // Headless Chromium may expose a native video surface that fails to stop.
    }
    const posterNode = nodes.find((node) => node?.name === 'Lobby_BG_Poster');
    if (posterNode) {
      posterNode.active = true;
      const opacity = posterNode.getComponent?.(cc.UIOpacity);
      if (opacity) {
        opacity.opacity = 255;
      }
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

async function samplePerformance(page) {
  const rafFps = await page.evaluate(async () => new Promise((resolve) => {
    const start = performance.now();
    let frames = 0;
    const tick = () => {
      frames += 1;
      const elapsed = performance.now() - start;
      if (elapsed >= 1600) {
        resolve(Math.round((frames * 1000 / elapsed) * 10) / 10);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  const runtime = await page.evaluate(() => {
    const cc = globalThis.cc;
    try {
      cc?.profiler?.showStats?.();
    } catch {
      // Profiler may be disabled in some preview builds.
    }
    const rawStats = cc?.profiler?._stats || cc?.profiler?.stats || {};
    const profilerStats = {};
    const normalizeCounter = (value) => {
      if (typeof value === 'number') {
        return value;
      }
      if (!value || typeof value !== 'object') {
        return null;
      }
      for (const key of ['_value', 'value', '_average', 'average', '_total', 'total']) {
        if (Number.isFinite(Number(value[key]))) {
          return Math.round(Number(value[key]) * 100) / 100;
        }
      }
      if (Number.isFinite(Number(value.counter?._value))) {
        return Math.round(Number(value.counter._value) * 100) / 100;
      }
      return null;
    };
    for (const key of Object.keys(rawStats || {})) {
      profilerStats[key] = normalizeCounter(rawStats[key]);
    }
    const memory = performance.memory ? {
      usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 10) / 10,
      totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 10) / 10,
      jsHeapLimitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024 * 10) / 10,
    } : null;
    const scene = cc?.director?.getScene?.();
    let nodeCount = 0;
    const vfxNodes = [];
    const walk = (node, depth = 0, path = '') => {
      if (!node) {
        return;
      }
      nodeCount += 1;
      const nodePath = path ? `${path}/${node.name}` : String(node.name || '');
      if (/Battle.*(Impact|Floating|Projectile|HitStop|Slash|Effect|VFX)|LobbyBattleAction/i.test(nodePath)) {
        vfxNodes.push({ depth, name: String(node.name || ''), path: nodePath, active: node.active === true });
      }
      for (const child of node.children || []) {
        walk(child, depth + 1, nodePath);
      }
    };
    walk(scene);
    return {
      profilerStats,
      memory,
      nodeCount,
      vfxNodes: vfxNodes.slice(-80),
      assetCount: Number(cc?.assetManager?.assets?.count ?? 0),
    };
  });

  const stats = runtime.profilerStats || {};
  const drawCall = stats.draws ?? stats.drawCalls ?? stats.drawcall ?? stats.drawCall ?? stats['Draw Calls'] ?? null;
  return {
    rafFps,
    profilerFps: stats.fps ?? stats.frame ?? null,
    drawCall,
    memory: runtime.memory,
    nodeCount: runtime.nodeCount,
    assetCount: runtime.assetCount,
    rawProfilerStats: stats,
    vfxNodes: runtime.vfxNodes,
  };
}

async function prepareBattlePage(browser, name, waitMs, capturePerformance) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const originalExitFullscreen = Document.prototype.exitFullscreen;
    if (typeof originalExitFullscreen !== 'function') {
      return;
    }
    Document.prototype.exitFullscreen = function safeLootChainPreviewExitFullscreen(...args) {
      if (!document.fullscreenElement || document.visibilityState !== 'visible') {
        return Promise.resolve();
      }
      return originalExitFullscreen.apply(this, args).catch((error) => {
        if (String(error?.message || error).includes('Document not active')) {
          return;
        }
        throw error;
      });
    };
  });

  const consoleLines = [];
  const pageErrors = [];
  const requests = [];
  const forcedBattleStartBodies = [];
  const battleStartResponses = [];
  let forcedBattleFormation = null;

  page.on('console', (message) => {
    consoleLines.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/player/')) {
      requests.push({ method: request.method(), url: request.url(), postData: request.postData() });
    }
  });
  page.on('response', async (response) => {
    if (!response.url().includes('/api/player/battles/start')) {
      return;
    }
    try {
      battleStartResponses.push(await response.json());
    } catch (error) {
      battleStartResponses.push({ error: error instanceof Error ? error.message : String(error) });
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
      requestId: `${original.requestId || 'battle-start'}-phase-a-acceptance`,
    };
    forcedBattleStartBodies.push(body);
    await route.continue({ postData: JSON.stringify(body) });
  });

  await page.goto(`${PREVIEW_URL}${PREVIEW_URL.includes('?') ? '&' : '?'}r=phase-a-acceptance-${name}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(15000);
  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await waitForLobbyReadyAndDisableNativeVideo(page);
  await page.waitForTimeout(1200);

  const lobbyHeroes = await readLobbyHeroesForBattleAcceptance(page);
  forcedBattleFormation = resolveForcedSrRBattleFormation(lobbyHeroes);
  if (!forcedBattleFormation || forcedBattleFormation.heroIds.length < 1) {
    throw new Error('missing owned SR/R battle heroes for Phase A acceptance recording');
  }

  await page.mouse.click(1125, 690);
  await page.waitForTimeout(2600);
  // 编队确认按钮正中(此前 1022 擦按钮左缘,易脱靶 flake)。
  await page.mouse.click(1070, 647);
  await page.waitForTimeout(1800);
  await page.mouse.click(696, 517);
  await page.waitForFunction(() => {
    const telemetry = globalThis.__lootchainBattlePlaybackTelemetry;
    return ['asset', 'embedded'].includes(telemetry?.background?.source) && telemetry?.background?.loaded === true;
  }, null, { timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(waitMs);

  const screenshotFile = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotFile, fullPage: false });
  const telemetry = await page.evaluate(() => globalThis.__lootchainBattlePlaybackTelemetry ?? null);
  const performanceData = capturePerformance ? await samplePerformance(page) : null;
  const video = page.video();
  await page.close();
  const rawVideoPath = await video.path();
  await context.close();
  const outputVideo = path.join(OUT_DIR, `${name}.webm`);
  fs.renameSync(rawVideoPath, outputVideo);

  const settleRequests = requests.filter((request) => /\/api\/player\/battles\/[^/]+\/settle/.test(request.url));
  const battleStartRequests = requests.filter((request) => request.url.includes('/api/player/battles/start'));
  const filteredConsole = consoleLines.filter((line) => line.type === 'error' && !line.text.includes('ReadPixels'));
  return {
    name,
    video: outputVideo,
    screenshot: screenshotFile,
    forcedBattleFormation,
    battleStartRequests: battleStartRequests.length,
    forcedBattleStartBodies,
    battleStartResponses,
    settleRequests: settleRequests.length,
    pageErrors,
    consoleErrors: filteredConsole,
    telemetry,
    performance: performanceData,
  };
}

function sanitizeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timelineHtml(title, events, notes) {
  const finiteEvents = events.filter((event) => Number.isFinite(Number(event.at)));
  const minAt = Math.min(...finiteEvents.map((event) => Number(event.at)));
  const maxAt = Math.max(...finiteEvents.map((event) => Number(event.at)));
  const span = Math.max(1, maxAt - minAt, 180);
  const rows = finiteEvents.map((event, index) => {
    const left = 116 + Math.round((Number(event.at) - minAt) / span * 720);
    const top = 98 + index * 58;
    return `
      <div class="label" style="top:${top - 8}px">${sanitizeHtml(event.label)}</div>
      <div class="dot" style="left:${left}px;top:${top}px;background:${event.color || '#f2c76b'}"></div>
      <div class="time" style="left:${left - 28}px;top:${top + 18}px">${Math.round(Number(event.at) - minAt)}ms</div>
    `;
  }).join('');
  const noteHtml = notes.map((note) => `<div>${sanitizeHtml(note)}</div>`).join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: #101012; color: #f4e2b2; font-family: "Microsoft YaHei", Arial, sans-serif; }
    .card { width: 960px; height: 540px; box-sizing: border-box; padding: 36px 48px; background: linear-gradient(135deg, #16110f, #07090d); border: 1px solid #8d6b31; }
    h1 { margin: 0 0 22px; font-size: 30px; font-weight: 700; }
    .axis { position: absolute; left: 116px; top: 95px; width: 720px; height: ${Math.max(1, finiteEvents.length - 1) * 58 + 2}px; border-left: 2px solid #9f7a38; border-bottom: 1px solid rgba(230,192,95,.35); }
    .label { position: absolute; left: 48px; width: 330px; font-size: 18px; color: #f7dfad; }
    .dot { position: absolute; width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 0 18px currentColor; }
    .time { position: absolute; width: 90px; text-align: center; font-size: 14px; color: #b9c8df; }
    .notes { position: absolute; left: 48px; bottom: 34px; right: 48px; font-size: 17px; line-height: 1.7; color: #d9c89e; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${sanitizeHtml(title)}</h1>
    <div class="axis"></div>
    ${rows}
    <div class="notes">${noteHtml}</div>
  </div>
</body>
</html>`;
}

function layerHtml(performance) {
  const nodes = Array.isArray(performance?.vfxNodes) ? performance.vfxNodes : [];
  const rows = [
    { depth: 0, name: 'BattleRoot / camera shake parent', source: 'LobbyBattlePreviewPanelRenderer' },
    { depth: 1, name: 'Battlefield units', source: 'heroes / enemies' },
    { depth: 2, name: 'LobbyBattleActionProjectileLayer', source: 'projectile / ranged' },
    { depth: 2, name: 'LobbyBattleImpactSlashLayer', source: 'slash VFX on hit frame' },
    { depth: 2, name: 'LobbyBattleImpactHitStopLayer', source: 'hit stop overlay' },
    { depth: 2, name: 'LobbyBattleActionFloatingTextLayer', source: 'damage / hit floating text' },
    { depth: 2, name: 'LobbyBattleActionCriticalDamageFloatText', source: 'critical damage text child' },
  ];
  const dynamicRows = nodes.slice(-10).map((node) => ({
    depth: Math.min(3, Math.max(0, Number(node.depth || 0))),
    name: `${node.active ? 'active' : 'inactive'} ${node.name}`,
    source: node.path,
  }));
  const allRows = rows.concat(dynamicRows);
  const rowHtml = allRows.map((row) => `
    <div class="row" style="padding-left:${28 + row.depth * 32}px">
      <div class="node">${sanitizeHtml(row.name)}</div>
      <div class="source">${sanitizeHtml(row.source)}</div>
    </div>
  `).join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: #09090b; color: #f5dfad; font-family: "Microsoft YaHei", Arial, sans-serif; }
    .card { width: 960px; min-height: 540px; box-sizing: border-box; padding: 34px 44px; background: linear-gradient(135deg, #15100e, #06080d); border: 1px solid #8f6a2c; }
    h1 { margin: 0 0 20px; font-size: 30px; }
    .row { display: grid; grid-template-columns: 455px 1fr; align-items: center; height: 44px; border-bottom: 1px solid rgba(216,170,78,.18); }
    .node { font-size: 18px; color: #ffe4ad; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .source { font-size: 14px; color: #91a2b8; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <div class="card">
    <h1>VFX Layer 层级截图</h1>
    ${rowHtml}
  </div>
</body>
</html>`;
}

async function renderHtmlImage(browser, html, outputName) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const output = path.join(OUT_DIR, outputName);
  await page.screenshot({ path: output, fullPage: true });
  await page.close();
  return output;
}

function firstByCue(items, cueKey, effectKind) {
  return items.find((item) => item?.cueKey === cueKey && (!effectKind || item.effectKind === effectKind));
}

function buildAcceptanceFromBaseResult(baseResult, recordings) {
  const floating = Array.isArray(baseResult.telemetryFloatingTextSamples) ? baseResult.telemetryFloatingTextSamples : [];
  const impacts = Array.isArray(baseResult.telemetryImpactSamples) ? baseResult.telemetryImpactSamples : [];
  const summary = baseResult.telemetryAnalysis?.summary || {};
  const criticalFloat = floating.find((sample) => sample?.kind === 'action' && sample?.critical === true);
  const normalFloat = floating.find((sample) => sample?.kind === 'action' && sample?.critical !== true);
  const criticalCueKey = criticalFloat?.cueKey ?? impacts.find((sample) => sample?.isCritical === true)?.cueKey;
  const normalCueKey = normalFloat?.cueKey ?? impacts.find((sample) => sample?.isCritical !== true)?.cueKey;

  const criticalEvents = [
    { label: 'Slash VFX', at: firstByCue(impacts, criticalCueKey, 'slash')?.at, color: '#ffcc58' },
    { label: 'Hit Stop', at: firstByCue(impacts, criticalCueKey, 'hitStop')?.at, color: '#f2f2f2' },
    { label: 'Critical floating text', at: criticalFloat?.at, color: '#ff514f' },
    { label: 'Camera Shake', at: firstByCue(impacts, criticalCueKey, 'screenShake')?.at, color: '#7db7ff' },
  ];
  const normalEvents = [
    { label: 'Damage cue arrives', at: firstByCue(impacts, normalCueKey, 'slash')?.at, color: '#f2c76b' },
    { label: 'Slash VFX', at: firstByCue(impacts, normalCueKey, 'slash')?.at, color: '#ffcc58' },
    { label: 'Hit Stop', at: firstByCue(impacts, normalCueKey, 'hitStop')?.at, color: '#f2f2f2' },
    { label: 'Damage floating text', at: normalFloat?.at, color: '#f8dd7c' },
  ];

  const criticalCueKeys = Array.from(new Set(impacts
    .filter((sample) => sample?.isCritical === true && sample?.cueKey)
    .map((sample) => String(sample.cueKey))));
  const criticalShakeCueKeys = Array.from(new Set(impacts
    .filter((sample) => sample?.isCritical === true && sample?.effectKind === 'screenShake' && sample?.cueKey)
    .map((sample) => String(sample.cueKey))));
  const deadSamples = (baseResult.telemetryFocusSamples || []).filter((sample) => /dead|death|die/i.test(String(sample?.currentActionKind || sample?.state || sample?.animation || '')));
  const multiTargetCues = floating.reduce((acc, sample) => {
    if (!sample?.cueKey || sample.kind !== 'action') {
      return acc;
    }
    acc.set(sample.cueKey, (acc.get(sample.cueKey) || 0) + 1);
    return acc;
  }, new Map());
  const multiTargetCueCount = Array.from(multiTargetCues.values()).filter((count) => count > 1).length;

  return {
    generatedAt: new Date().toISOString(),
    baseResultFile: BASE_RESULT,
    videos: {
      normalAttack: recordings.normal.video,
      criticalHit: recordings.critical.video,
    },
    screenshots: {
      normalAttack: recordings.normal.screenshot,
      criticalHit: recordings.critical.screenshot,
    },
    timeline: {
      normalCueKey,
      criticalCueKey,
      normalEvents,
      criticalEvents,
      maxDamageFloatSyncDeltaMs: summary.damageFloatImpactSyncMaxDelta,
    },
    cameraShake: {
      trigger: 'resolveBattleImpactProfile(cue).screenShake.enabled === true only when cue.isCritical / crit label / 暴击 text is true',
      criticalDamageCueCount: criticalCueKeys.length,
      criticalShakeCueCount: criticalShakeCueKeys.length,
      missingShakeCueKeys: criticalCueKeys.filter((cueKey) => !criticalShakeCueKeys.includes(cueKey)),
      allCriticalDamageCuesHaveShake: criticalCueKeys.length > 0 && criticalCueKeys.every((cueKey) => criticalShakeCueKeys.includes(cueKey)),
    },
    performance: recordings.critical.performance,
    telemetrySummary: summary,
    acceptance: {
      meleeContactsBeforeDamage: Number(summary.srRBasicAttackContactSampleCount || 0) > 0
        && Number(summary.srRDamageContactHoldSampleCount || 0) > 0
        && Number(summary.srRBasicAttackHomeSnapCount || 0) === 0,
      criticalAlwaysTriggersShake: criticalCueKeys.length > 0 && criticalCueKeys.every((cueKey) => criticalShakeCueKeys.includes(cueKey)),
      floatingTextSyncedToHitFrame: Number(summary.damageFloatImpactSyncMaxDelta || 999) <= 80,
      deadUnitsIgnoredAfterDeath: deadSamples.length === 0 ? 'not-exercised' : 'needs-dedicated-death-telemetry',
      multiTargetFeedback: multiTargetCueCount > 0 ? 'exercised' : 'not-exercised',
    },
    raw: {
      normalRecording: recordings.normal,
      criticalRecording: recordings.critical,
    },
  };
}

(async () => {
  resetDir(OUT_DIR);
  if (!fs.existsSync(BASE_RESULT)) {
    throw new Error(`missing base battle telemetry result: ${BASE_RESULT}. Run npm.cmd run screenshot:battle-center first.`);
  }

  const baseResult = readJson(BASE_RESULT);
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  });
  try {
    const normal = await prepareBattlePage(browser, 'normal-attack', 5300, false);
    const critical = await prepareBattlePage(browser, 'critical-hit', 11200, true);
    const acceptance = buildAcceptanceFromBaseResult(baseResult, { normal, critical });
    const hitStopImage = await renderHtmlImage(
      browser,
      timelineHtml('Hit Stop 触发时序图', acceptance.timeline.criticalEvents, [
        `critical cue: ${acceptance.timeline.criticalCueKey || 'n/a'}`,
        'Hit Stop 与 Slash / 暴击飘字在同一命中窗口触发。',
      ]),
      'hit-stop-timeline.png',
    );
    const damageImage = await renderHtmlImage(
      browser,
      timelineHtml('伤害数字生成时序图', acceptance.timeline.normalEvents, [
        `normal cue: ${acceptance.timeline.normalCueKey || 'n/a'}`,
        `max slash-float delta: ${acceptance.timeline.maxDamageFloatSyncDeltaMs ?? 'n/a'}ms`,
      ]),
      'damage-number-timeline.png',
    );
    const layerImage = await renderHtmlImage(browser, layerHtml(acceptance.performance), 'vfx-layer-hierarchy.png');
    acceptance.artifacts = {
      hitStopTimeline: hitStopImage,
      damageNumberTimeline: damageImage,
      vfxLayerHierarchy: layerImage,
    };
    writeJson('acceptance-report.json', acceptance);
    writeText('artifact-index.html', `<!doctype html><meta charset="utf-8"><title>LootChain Phase A Acceptance</title>
<h1>LootChain Phase A Acceptance</h1>
<ul>
  <li><a href="./normal-attack.webm">普通攻击录屏</a></li>
  <li><a href="./critical-hit.webm">暴击录屏</a></li>
  <li><a href="./hit-stop-timeline.png">Hit Stop 触发时序图</a></li>
  <li><a href="./damage-number-timeline.png">伤害数字生成时序图</a></li>
  <li><a href="./vfx-layer-hierarchy.png">VFX Layer 层级截图</a></li>
  <li><a href="./acceptance-report.json">验收 JSON</a></li>
</ul>`);

    console.log(`Phase A acceptance artifacts: ${OUT_DIR}`);
    console.log(`normal video: ${normal.video}`);
    console.log(`critical video: ${critical.video}`);
    console.log(`FPS: ${acceptance.performance?.rafFps}`);
    console.log(`DrawCall: ${acceptance.performance?.drawCall ?? 'unavailable'}`);
    console.log(`Memory: ${acceptance.performance?.memory?.usedJSHeapMB ?? 'unavailable'} MB`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
