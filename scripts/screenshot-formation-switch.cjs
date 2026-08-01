const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve('artifacts/formation-switch-current');
const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function readFormationDebug(page) {
  return page.evaluate(() => {
    const root = globalThis;
    const debug = root.__lootchainFormationDebug;
    return debug ? JSON.parse(JSON.stringify(debug)) : null;
  });
}

function assertFormationDebug(debug, label) {
  if (!debug || !Array.isArray(debug.selectedHeroIds)) {
    throw new Error(`${label}: missing __lootchainFormationDebug`);
  }
  return debug;
}

async function waitForFormationDebug(page, label) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < 5200) {
    latest = assertFormationDebug(await readFormationDebug(page), label);
    const visuals = Array.isArray(latest.srRVisuals) ? latest.srRVisuals : [];
    const resolvedActors = visuals.filter((visual) =>
      Number.isFinite(Number(visual?.estimatedHeight))
      && Number(visual.estimatedHeight) > 0
    );
    const expectedActors = Math.max(2, Math.min(5, Number(latest.selectedCount) || 5));
    if (resolvedActors.length >= expectedActors) {
      return latest;
    }
    await page.waitForTimeout(260);
  }
  return latest ? assertFormationDebug(latest, label) : assertFormationDebug(await readFormationDebug(page), label);
}

function medianNumber(values) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(median * 100) / 100;
}

function summarizeHeights(actors) {
  const heights = actors.map((visual) => Number(visual.estimatedHeight));
  const min = heights.length > 0 ? Math.round(Math.min(...heights) * 100) / 100 : null;
  const max = heights.length > 0 ? Math.round(Math.max(...heights) * 100) / 100 : null;
  const median = medianNumber(heights);
  const ratio = min && max ? Math.round((max / Math.max(1, min)) * 100) / 100 : null;
  return { count: actors.length, min, median, max, ratio };
}

function isStylizedFormationActor(visual) {
  const asset = String(visual?.primaryAsset || '');
  const rarity = String(visual?.rarity || '').toUpperCase();
  return asset.startsWith('act_') || rarity === 'R' || rarity === 'SR';
}

function isContractWitchFormationActor(visual) {
  return String(visual?.heroCode || '') === 'SR_WITCH_03' || String(visual?.primaryAsset || '') === 'act_1028';
}

function isIshmaelFormationActor(visual) {
  return String(visual?.heroCode || '') === 'SSR_KANE' || String(visual?.primaryAsset || '') === 'Ishmael';
}

function findFormationHeroVisual(analyses, heroCode, primaryAsset) {
  for (const analysis of analyses) {
    const found = analysis.heroes.find((hero) =>
      String(hero.heroCode || '') === heroCode || String(hero.primaryAsset || '') === primaryAsset
    );
    if (found) {
      return found;
    }
  }
  return null;
}

function analyzeFormationVisuals(debug) {
  const visuals = Array.isArray(debug?.srRVisuals) ? debug.srRVisuals : [];
  const resolvedActors = visuals.filter((visual) =>
    Number.isFinite(Number(visual?.estimatedHeight))
    && Number(visual.estimatedHeight) > 0
  );
  const all = summarizeHeights(resolvedActors);
  const stylizedActors = resolvedActors.filter(isStylizedFormationActor);
  const regularStylizedActors = stylizedActors.filter((visual) => !isContractWitchFormationActor(visual));
  const realisticActors = resolvedActors.filter((visual) => !isStylizedFormationActor(visual));
  return {
    count: resolvedActors.length,
    min: all.min,
    median: all.median,
    max: all.max,
    ratio: all.ratio,
    stylized: summarizeHeights(stylizedActors),
    regularStylized: summarizeHeights(regularStylizedActors),
    realistic: summarizeHeights(realisticActors),
    heroes: resolvedActors.map((visual) => ({
      heroCode: visual.heroCode,
      rarity: visual.rarity,
      primaryAsset: visual.primaryAsset,
      estimatedHeight: visual.estimatedHeight,
      resolvedScale: visual.resolvedScale,
    })),
  };
}

function sameIds(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((id, index) => id === right[index]);
}

(async () => {
  ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const consoleLines = [];
  const pageErrors = [];
  const requests = [];

  page.on('console', (message) => {
    consoleLines.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/player/')) {
      requests.push({ method: request.method(), url, postData: request.postData() });
    }
  });

  const files = [];
  await page.goto(`${PREVIEW_URL}${PREVIEW_URL.includes('?') ? '&' : '?'}r=formation-switch-${Date.now()}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(15000);
  files.push(await screenshot(page, '00-title.png'));

  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await page.waitForTimeout(8500);
  files.push(await screenshot(page, '01-lobby.png'));

  await page.mouse.click(1125, 690);
  await page.waitForTimeout(2600);
  files.push(await screenshot(page, '02-stage-map.png'));

  await page.mouse.click(1022, 648);
  await page.waitForTimeout(1800);
  files.push(await screenshot(page, '03-challenge-dialog.png'));

  await page.mouse.click(582, 517);
  await page.waitForTimeout(2400);
  files.push(await screenshot(page, '04-formation-open.png'));
  const openDebug = await waitForFormationDebug(page, 'formation open');

  await page.mouse.click(920, 219);
  await page.waitForTimeout(1400);
  files.push(await screenshot(page, '05-after-bench.png'));
  const afterBenchDebug = assertFormationDebug(await readFormationDebug(page), 'after bench');

  // Keep the acceptance path covering SR_WITCH_03 / act_1028 because this
  // skeleton has a smaller visual body than the other SR act skeletons.
  await page.mouse.click(920, 405);
  await page.waitForTimeout(1600);
  files.push(await screenshot(page, '06-after-add-other.png'));
  const afterAddDebug = await waitForFormationDebug(page, 'after add other');

  const settleRequests = requests.filter((request) => request.method === 'POST' && request.url.includes('/settle'));
  const battleStartRequests = requests.filter((request) => request.url.includes('/api/player/battles/start'));
  const filteredConsole = consoleLines.filter((line) => line.type === 'error' && !line.text.includes('ReadPixels'));
  const errors = [];
  if (openDebug.selectedCount < 5) {
    errors.push(`open formation expected 5 selected heroes, got ${openDebug.selectedCount}`);
  }
  if (afterBenchDebug.selectedCount !== openDebug.selectedCount - 1) {
    errors.push(`bench should reduce selected count by 1, before=${openDebug.selectedCount}, after=${afterBenchDebug.selectedCount}`);
  }
  if (sameIds(openDebug.selectedHeroIds, afterBenchDebug.selectedHeroIds)) {
    errors.push('bench click did not change selected hero ids');
  }
  if (afterAddDebug.selectedCount !== openDebug.selectedCount) {
    errors.push(`adding another hero should return selected count to ${openDebug.selectedCount}, got ${afterAddDebug.selectedCount}`);
  }
  if (!afterAddDebug.selectedHeroNames.includes('契约魔女')) {
    errors.push(`formation switch must add 契约魔女 for act_1028 visual acceptance, got: ${afterAddDebug.selectedHeroNames.join('/')}`);
  }
  const addSet = new Set(afterAddDebug.selectedHeroIds);
  const lostAfterBenchIds = afterBenchDebug.selectedHeroIds.filter((heroId) => !addSet.has(heroId));
  const addedIds = afterAddDebug.selectedHeroIds.filter((heroId) => !afterBenchDebug.selectedHeroIds.includes(heroId));
  const originalIds = new Set(openDebug.selectedHeroIds);
  if (lostAfterBenchIds.length > 0) {
    errors.push(`adding another hero must preserve all benched-state heroes, lost ids: ${lostAfterBenchIds.join(',')}`);
  }
  if (addedIds.length !== 1) {
    errors.push(`adding another hero should add exactly one id, got: ${addedIds.join(',') || 'none'}`);
  }
  if (addedIds.some((heroId) => originalIds.has(heroId))) {
    errors.push(`adding another hero should use a different hero, got original ids: ${addedIds.filter((heroId) => originalIds.has(heroId)).join(',')}`);
  }
  if (sameIds(openDebug.selectedHeroIds, afterAddDebug.selectedHeroIds)) {
    errors.push('adding another hero restored the original selection instead of switching to a different hero');
  }
  const openVisualAnalysis = analyzeFormationVisuals(openDebug);
  const afterAddVisualAnalysis = analyzeFormationVisuals(afterAddDebug);
  const visualAnalysis = afterAddVisualAnalysis.count >= Math.min(5, afterAddDebug.selectedCount) ? afterAddVisualAnalysis : openVisualAnalysis;
  const visualAnalysisCandidates = [afterAddVisualAnalysis, openVisualAnalysis].filter((analysis) => analysis.count > 0);
  const expectedVisualCount = Math.min(5, visualAnalysis === afterAddVisualAnalysis ? afterAddDebug.selectedCount : openDebug.selectedCount);
  if (visualAnalysis.count < expectedVisualCount) {
    errors.push(`formation must resolve all selected actor spine heights, expected=${expectedVisualCount}, got=${visualAnalysis.count}`);
  }
  const eulenspigelVisual = findFormationHeroVisual(visualAnalysisCandidates, 'SSR_RON', 'Eulenspigel');
  const ishmaelVisual = findFormationHeroVisual(visualAnalysisCandidates, 'SSR_KANE', 'Ishmael');
  const regularRealisticActors = visualAnalysis.heroes.filter((hero) =>
    !isStylizedFormationActor(hero)
    && hero.primaryAsset !== 'Eulenspigel'
    && !isIshmaelFormationActor(hero)
  );
  const regularRealistic = summarizeHeights(regularRealisticActors);
  if (regularRealistic.count > 0 && (regularRealistic.min === null || regularRealistic.min < 175)) {
    errors.push(`formation regular realistic actor is too small, minHeight=${regularRealistic.min}`);
  }
  if (regularRealistic.count > 0 && (regularRealistic.max === null || regularRealistic.max > 215)) {
    errors.push(`formation regular realistic actor is too large, maxHeight=${regularRealistic.max}`);
  }
  if (regularRealistic.count > 1 && (regularRealistic.ratio === null || regularRealistic.ratio > 1.16)) {
    errors.push(`formation regular realistic actor heights are not visually aligned, ratio=${regularRealistic.ratio}`);
  }
  const regularStylized = visualAnalysis.regularStylized;
  if (regularStylized.count > 0 && (regularStylized.min === null || regularStylized.min < 225)) {
    errors.push(`formation stylized actor is too small, minHeight=${regularStylized.min}`);
  }
  if (regularStylized.count > 0 && (regularStylized.max === null || regularStylized.max > 252)) {
    errors.push(`formation stylized actor is too large, maxHeight=${regularStylized.max}`);
  }
  if (regularStylized.count > 1 && (regularStylized.ratio === null || regularStylized.ratio > 1.1)) {
    errors.push(`formation stylized actor heights are not visually aligned, ratio=${regularStylized.ratio}`);
  }
  const witchVisual = visualAnalysis.heroes.find((hero) => hero.heroCode === 'SR_WITCH_03' || hero.primaryAsset === 'act_1028');
  if (!witchVisual) {
    errors.push('formation visual acceptance must include SR_WITCH_03 / act_1028');
  }
  if (witchVisual && Number(witchVisual.resolvedScale) < 0.66) {
    errors.push(`formation SR_WITCH_03 / act_1028 visual compensation is too small, resolvedScale=${witchVisual.resolvedScale}`);
  }
  if (
    visualAnalysis.realistic.count > 0
    && regularStylized.count > 0
    && visualAnalysis.realistic.max !== null
    && regularStylized.min !== null
    && visualAnalysis.realistic.max > regularStylized.min * 0.9
  ) {
    errors.push(`formation realistic actors visually dominate stylized actors, realisticMax=${visualAnalysis.realistic.max}, stylizedMin=${regularStylized.min}`);
  }
  if (!ishmaelVisual) {
    errors.push('formation visual acceptance must include SSR_KANE / Ishmael');
  }
  if (ishmaelVisual && Number(ishmaelVisual.estimatedHeight) < 220) {
    errors.push(`formation Ishmael actor is too small after requested 10% enlargement, estimatedHeight=${ishmaelVisual.estimatedHeight}`);
  }
  if (ishmaelVisual && Number(ishmaelVisual.estimatedHeight) > 235) {
    errors.push(`formation Ishmael actor is too large after requested 10% enlargement, estimatedHeight=${ishmaelVisual.estimatedHeight}`);
  }
  if (eulenspigelVisual && Number(eulenspigelVisual.estimatedHeight) < 112) {
    errors.push(`formation Eulenspigel actor is too small after visual compensation, estimatedHeight=${eulenspigelVisual.estimatedHeight}`);
  }
  if (eulenspigelVisual && Number(eulenspigelVisual.estimatedHeight) > 122) {
    errors.push(`formation Eulenspigel actor is still too dominant, estimatedHeight=${eulenspigelVisual.estimatedHeight}`);
  }
  if (battleStartRequests.length > 0) {
    errors.push(`formation switch acceptance must not start battle sessions, got ${battleStartRequests.length}`);
  }

  const result = {
    files,
    openDebug,
    afterBenchDebug,
    afterAddDebug,
    openVisualAnalysis,
    afterAddVisualAnalysis,
    acceptedVisualAnalysis: visualAnalysis,
    battleStartRequests,
    settleRequests,
    pageErrors,
    filteredConsole,
    errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'formation-switch-result.json'), JSON.stringify(result, null, 2), 'utf8');
  await browser.close();

  console.log(`formation switch screenshots: ${OUT_DIR}`);
  console.log(`open selected count: ${openDebug.selectedCount}`);
  console.log(`after bench selected count: ${afterBenchDebug.selectedCount}`);
  console.log(`after add selected count: ${afterAddDebug.selectedCount}`);
  console.log(`formation actor visual heights: ${JSON.stringify(visualAnalysis)}`);
  console.log(`battle start requests: ${battleStartRequests.length}`);
  console.log(`settle requests: ${settleRequests.length}`);
  console.log(`page errors: ${pageErrors.length}`);
  console.log(`console errors: ${filteredConsole.length}`);
  if (errors.length > 0) {
    console.error(`formation switch errors: ${errors.join('; ')}`);
  }
  if (errors.length > 0 || settleRequests.length > 0 || pageErrors.length > 0 || filteredConsole.length > 0) {
    process.exit(1);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
