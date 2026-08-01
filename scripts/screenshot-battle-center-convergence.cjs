const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve('artifacts/battle-center-convergence-current');
const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';
const ACCEPTANCE_FORMATION_MODE = (process.env.BATTLE_ACCEPTANCE_FORMATION || 'srr').trim().toLowerCase();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetDir(dir) {
  ensureDir(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(png|json)$/i.test(entry.name)) {
      continue;
    }
    fs.unlinkSync(path.join(dir, entry.name));
  }
}

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function captureTelemetrySnapshot(page, snapshots, label) {
  const telemetry = await page.evaluate(() => globalThis.__lootchainBattlePlaybackTelemetry ?? null).catch(() => null);
  if (!telemetry || typeof telemetry !== 'object') {
    return;
  }
  snapshots.push({ label, telemetry });
}

function selectBestTelemetrySnapshot(snapshots, finalTelemetry) {
  const candidates = [
    ...snapshots.map((snapshot) => snapshot.telemetry),
    finalTelemetry,
  ].filter((telemetry) => telemetry && typeof telemetry === 'object');
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, telemetry) => {
    const bestCount = Array.isArray(best?.samples) ? best.samples.length : 0;
    const count = Array.isArray(telemetry?.samples) ? telemetry.samples.length : 0;
    return count > bestCount ? telemetry : best;
  }, candidates[0]);
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

function isNamedSpineHero(hero) {
  const portraitAsset = String(hero.portraitAsset || '').trim();
  const spineAsset = String(hero.spineAsset || '').trim();
  return /^(SSR|UR)$/.test(heroRarity(hero))
    && Number.isFinite(Number(hero.id))
    && Number(hero.id) > 0
    && hero.protagonist !== true
    && String(hero.heroCode || '').toUpperCase().startsWith('EX_') === false
    && !portraitAsset.startsWith('act_')
    && !portraitAsset.startsWith('npc_')
    && !spineAsset.startsWith('npc_');
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
  const median = sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(median * 100) / 100;
}

function parseHitKeyActor(hitKey) {
  const actionPart = String(hitKey || '').split(':').slice(2).join(':');
  const separatorIndex = actionPart.indexOf('->');
  return separatorIndex > 0 ? actionPart.slice(0, separatorIndex) : null;
}

function parseHitKeyTarget(hitKey) {
  const actionPart = String(hitKey || '').split(':').slice(2).join(':');
  const separatorIndex = actionPart.indexOf('->');
  return separatorIndex >= 0 ? actionPart.slice(separatorIndex + 2) : null;
}

function hitKeyBelongsToActor(sample) {
  const actorKey = parseHitKeyActor(sample?.currentActionHitKey);
  return typeof sample?.unitKey === 'string' && actorKey === sample.unitKey;
}

function hitKeyBelongsToTarget(sample) {
  const targetKey = parseHitKeyTarget(sample?.currentActionHitKey);
  return typeof sample?.unitKey === 'string' && targetKey === sample.unitKey;
}

function isBackRoleBattleSample(sample) {
  const role = String(sample?.role || '').trim().toLowerCase();
  const unitKey = String(sample?.unitKey || sample?.actionActorKey || sample?.rootMotionActorKey || '').toUpperCase();
  if (role === 'back' || role === 'ranged' || role === 'support') {
    return true;
  }
  return /(?:MAGE|PRIEST|WITCH|ARCHER|RANGER|SNIPER|ACOLYTE|CULT)/.test(unitKey);
}

function estimateSrRActorVisualHeight(sample) {
  const rawWidth = Number(sample.rawWidth || 0);
  const rawHeight = Number(sample.rawHeight || 0);
  const resolvedScale = Number(sample.resolvedScale || 0);
  if (!Number.isFinite(resolvedScale) || resolvedScale <= 0) {
    return 0;
  }
  const rawVisualHeight = Number(sample.estimatedHeight || 0);
  if (!isInflatedSrRActBounds(rawWidth, rawHeight)) {
    return rawVisualHeight;
  }
  const fallbackRawHeight = String(sample.rarity || '').toUpperCase() === 'R' ? 620 : 660;
  return fallbackRawHeight * resolvedScale;
}

function isInflatedSrRActBounds(rawWidth, rawHeight) {
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return false;
  }
  const aspect = rawWidth / Math.max(1, rawHeight);
  return aspect >= 1.8 || rawWidth >= 1450 || rawHeight >= 900;
}

function resolveForcedSrRBattleFormation(heroes) {
  const usable = normalizeHeroList(heroes)
    .filter((hero) => Number(hero.id) > 0 && hero.protagonist !== true && heroRarity(hero) !== 'EX')
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
  const srRActHeroes = usable.filter(isSrRActHero);
  const frontSrRHeroes = srRActHeroes.filter((hero) => !isBackRoleHero(hero));
  const frontSrR = frontSrRHeroes[0];
  if (!frontSrR) {
    return null;
  }
  const selected = [];
  for (const hero of frontSrRHeroes) {
    if (selected.length >= 5) {
      break;
    }
    selected.push(hero);
  }
  for (const hero of srRActHeroes) {
    if (selected.length >= 5) {
      break;
    }
    if (!selected.some((item) => item.id === hero.id)) {
      selected.push(hero);
    }
  }
  for (const hero of usable) {
    if (selected.length >= 5) {
      break;
    }
    if (!selected.some((item) => item.id === hero.id)) {
      selected.push(hero);
    }
  }
  return {
    mode: 'srr',
    heroIds: selected.map((hero) => Number(hero.id)).filter((id) => Number.isFinite(id) && id > 0),
    leaderHeroId: Number(frontSrR.id),
    frontSrR: summarizeHero(frontSrR),
    skillSrR: summarizeHero(selected.find((hero) => hero.id !== frontSrR.id) ?? frontSrR),
    selected: selected.map(summarizeHero),
  };
}

function resolveForcedMixedBattleFormation(heroes) {
  const usable = normalizeHeroList(heroes)
    .filter((hero) => Number(hero.id) > 0 && hero.protagonist !== true && heroRarity(hero) !== 'EX')
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
  const namedHeroes = usable.filter(isNamedSpineHero);
  const srRActHeroes = usable.filter(isSrRActHero);
  if (namedHeroes.length < 1 || srRActHeroes.length < 1) {
    return null;
  }
  const frontSrR = srRActHeroes.find((hero) => !isBackRoleHero(hero)) ?? srRActHeroes[0];
  const selected = [];
  const pushUnique = (hero) => {
    if (!hero || selected.length >= 5 || selected.some((item) => Number(item.id) === Number(hero.id))) {
      return;
    }
    selected.push(hero);
  };
  namedHeroes.slice(0, 3).forEach(pushUnique);
  pushUnique(frontSrR);
  srRActHeroes.forEach(pushUnique);
  usable.forEach(pushUnique);
  return {
    mode: 'mixed',
    heroIds: selected.map((hero) => Number(hero.id)).filter((id) => Number.isFinite(id) && id > 0),
    leaderHeroId: Number(frontSrR.id),
    frontSrR: summarizeHero(frontSrR),
    skillSrR: summarizeHero(srRActHeroes.find((hero) => hero.id !== frontSrR.id) ?? frontSrR),
    namedCount: selected.filter(isNamedSpineHero).length,
    srRActCount: selected.filter(isSrRActHero).length,
    selected: selected.map(summarizeHero),
  };
}

function resolveForcedBattleFormation(heroes) {
  if (ACCEPTANCE_FORMATION_MODE === 'mixed') {
    return resolveForcedMixedBattleFormation(heroes) ?? resolveForcedSrRBattleFormation(heroes);
  }
  return resolveForcedSrRBattleFormation(heroes);
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
      throw new Error(`failed to read lobby heroes for SR/R battle acceptance: ${JSON.stringify(payload).slice(0, 300)}`);
    }
    return payload.data;
  });
}

function analyzeTelemetry(telemetry, options = {}) {
  const errors = [];
  const summary = {
    sampleCount: telemetry?.samples?.length ?? 0,
    allyMovingTowardCenter: 0,
    enemyMovingTowardCenter: 0,
    allyHoldingCenter: 0,
    enemyHoldingCenter: 0,
    maxFrameDelta: 0,
    maxFrameSpeed: 0,
    maxFrameDeltaSample: null,
    maxContinuousFrameDelta: 0,
    maxContinuousFrameSpeed: 0,
    maxContinuousFrameDeltaSample: null,
    battlefieldOutOfBoundsSampleCount: 0,
    battlefieldOutOfBoundsWorstSample: null,
    combatGroundBandMissCount: 0,
    combatGroundBandWorstSample: null,
    maxBattlefieldAbsX: 0,
    maxBattlefieldAbsY: 0,
    openingFaceGapMedian: null,
    srRSpineCueCount: 0,
    srRRunCueCount: 0,
    srRAttackCueCount: 0,
    srRSkillCueCount: 0,
    namedSpineCueCount: 0,
    namedAtkCueCount: 0,
    namedSkillCueCount: 0,
    srRMeleeApproachSampleCount: 0,
    srRBasicAttackContactSampleCount: 0,
    srRBasicAttackClosestDistance: null,
    srRBasicAttackMedianDistance: null,
    srRBasicAttackAdvanceMedian: null,
    allMeleeBasicAttackContactMedian: null,
    allMeleeBasicAttackContactSampleCount: 0,
    allMeleeDamageContactSampleCount: 0,
    allMeleeBasicAttackMissCount: 0,
    backgroundTelemetryPresent: false,
    backgroundLoaded: false,
    backgroundSource: null,
    srRSpineVisualHeightMin: null,
    srRSpineVisualHeightMedian: null,
    srRSpineVisualHeightMax: null,
    srRSpineVisualHeightRatio: null,
    srSpineVisualHeightMedian: null,
    rSpineVisualHeightMedian: null,
    srRarityHeightRatio: null,
    allySpineVisualHeightMin: null,
    allySpineVisualHeightMedian: null,
    allySpineVisualHeightMax: null,
    allySpineVisualHeightRatio: null,
    allySpineVisualWidthMedian: null,
    allySpineVisualWidthMax: null,
    allySpineVisualWidthRatio: null,
    homeLineGapMin: null,
    finalFrontLineGapMedian: null,
    postDamageFrontHoldMissCount: 0,
    targetMeetSampleCount: 0,
    basicAttackRootMotionSampleCount: 0,
    srRDamageHomeSnapCount: 0,
    maxActionFloatingTextsPerFrame: 0,
    maxAllFloatingTextsPerFrame: 0,
    maxPersistentFloatingTextLayers: 0,
    impactSampleCount: 0,
    criticalImpactSampleCount: 0,
    hitStopSampleCount: 0,
    screenShakeSampleCount: 0,
    slashSampleCount: 0,
    criticalFloatingTextSampleCount: 0,
    damageFloatImpactSyncMaxDelta: null,
    hpSampleCount: 0,
    enemyHpRatioMin: null,
    enemyLastHpRatioMax: null,
    allyHpRatioMin: null,
    damageOneShotSampleCount: 0,
    damageFloatSampleCount: 0,
    hitVfxAssetSampleCount: 0,
    deadUnitHitSampleCount: 0,
    deadActorHiddenSampleCount: 0,
    maxLiveActorOverlapPairs: 0,
    postActionIdleVerticalDriftMax: 0,
    postActionIdleVerticalDriftSample: null,
    perActionMeleeContactMissCount: 0,
    deadActorVisibleAfterDeadMsMax: 0,
    deadTargetSelectedActionCount: 0,
    hpDropCueMismatchCount: 0,
    actionActorUnitCount: 0,
    maxSimultaneousRootMotionActors: 0,
    rootMotionOverlapWindowCount: 0,
    bothSidesRootMotionWindowCount: 0,
    damageCadenceMedianMs: null,
    longestDamageCueGapMs: null,
    formationSrRVisualHeightOk: true,
  };
  if (!telemetry || !Array.isArray(telemetry.samples) || telemetry.samples.length < 20) {
    return { errors: ['battle telemetry missing or too short'], summary };
  }
  summary.backgroundTelemetryPresent = !!telemetry.background;
  summary.backgroundLoaded = telemetry.background?.loaded === true;
  summary.backgroundSource = telemetry.background?.source ?? null;
  if (!summary.backgroundTelemetryPresent || !['asset', 'embedded'].includes(summary.backgroundSource) || summary.backgroundLoaded !== true) {
    errors.push(`battle background did not render image-backed battle scene: ${summary.backgroundSource}/${summary.backgroundLoaded}`);
  }
  const byUnit = new Map();
  for (const sample of telemetry.samples) {
    if (!sample || typeof sample.unitKey !== 'string') {
      continue;
    }
    const list = byUnit.get(sample.unitKey) ?? [];
    list.push(sample);
    byUnit.set(sample.unitKey, list);
  }
  const battlefieldBounds = {
    minX: -820,
    maxX: 820,
    minY: -210,
    maxY: 190,
  };
  const openingFaceAllyX = [];
  const openingFaceEnemyX = [];
  const firstCombatByUnit = new Map();
  for (const samples of byUnit.values()) {
    samples.sort((a, b) => a.at - b.at);
    const start = samples.find((sample) => sample.openingActive && sample.openingElapsedMs <= 360) ?? samples.find((sample) => sample.openingActive);
    const run = [...samples].reverse().find((sample) => sample.openingMoving && sample.openingElapsedMs >= 780) ?? [...samples].reverse().find((sample) => sample.openingMoving);
    const combat = samples.find((sample) => !sample.openingActive && sample.phase === 'roundPlaying');
    const openingFace = [...samples].reverse().find((sample) => sample.openingActive && Number(sample.openingElapsedMs || 0) >= 1320);
    if (openingFace && Number.isFinite(Number(openingFace.x))) {
      if (openingFace.side === 'ally') {
        openingFaceAllyX.push(Number(openingFace.x));
      } else if (openingFace.side === 'enemy') {
        openingFaceEnemyX.push(Number(openingFace.x));
      }
    }
    if (combat && typeof combat.unitKey === 'string' && !firstCombatByUnit.has(combat.unitKey)) {
      firstCombatByUnit.set(combat.unitKey, combat);
    }
    for (let index = 1; index < samples.length; index += 1) {
      const prev = samples[index - 1];
      const current = samples[index];
      if (
        prev.openingActive !== true
        && current.openingActive !== true
        && prev.phase === current.phase
        && Number.isFinite(Number(prev.x))
        && Number.isFinite(Number(prev.y))
        && Number.isFinite(Number(current.x))
        && Number.isFinite(Number(current.y))
      ) {
        const continuousDelta = Math.hypot(current.x - prev.x, current.y - prev.y);
        const continuousElapsed = Math.max(16, current.at - prev.at);
        const continuousSpeed = continuousDelta / continuousElapsed;
        const roundedContinuousDelta = Math.round(continuousDelta * 100) / 100;
        const roundedContinuousSpeed = Math.round(continuousSpeed * 1000) / 1000;
        summary.maxContinuousFrameSpeed = Math.max(summary.maxContinuousFrameSpeed, roundedContinuousSpeed);
        if (roundedContinuousDelta > summary.maxContinuousFrameDelta) {
          summary.maxContinuousFrameDelta = roundedContinuousDelta;
          summary.maxContinuousFrameDeltaSample = {
            unitKey: current.unitKey,
            side: current.side,
            delta: roundedContinuousDelta,
            speed: roundedContinuousSpeed,
            prev,
            current,
          };
        }
      }
      const sameMotionWindow = prev.openingActive === current.openingActive
        && prev.actionKind === current.actionKind
        && prev.actionActorKey === current.actionActorKey
        && prev.actionTargetKey === current.actionTargetKey
        && prev.currentActionKind === current.currentActionKind
        && prev.rootMotionKind === current.rootMotionKind;
      if (!sameMotionWindow && !current.openingActive) {
        continue;
      }
      const delta = Math.hypot(current.x - prev.x, current.y - prev.y);
      const elapsed = Math.max(16, current.at - prev.at);
      const speed = delta / elapsed;
      if (Number.isFinite(delta)) {
        const roundedDelta = Math.round(delta * 100) / 100;
        const roundedSpeed = Math.round(speed * 1000) / 1000;
        summary.maxFrameSpeed = Math.max(summary.maxFrameSpeed, roundedSpeed);
        if (roundedDelta > summary.maxFrameDelta) {
          summary.maxFrameDelta = roundedDelta;
          summary.maxFrameDeltaSample = { unitKey: current.unitKey, side: current.side, delta: roundedDelta, speed: roundedSpeed, prev, current };
        }
      }
    }
    if (!start || !run || !combat) {
      continue;
    }
    const movedTowardCenter = Math.abs(run.x) < Math.abs(start.x) - 8;
    const heldCenter = Math.abs(combat.x) < Math.abs(start.x) - 14;
    if (movedTowardCenter) {
      if (start.side === 'enemy') {
        summary.enemyMovingTowardCenter += 1;
      } else {
        summary.allyMovingTowardCenter += 1;
      }
    }
    if (heldCenter) {
      if (start.side === 'enemy') {
        summary.enemyHoldingCenter += 1;
      } else {
        summary.allyHoldingCenter += 1;
      }
    }
  }
  if (summary.allyMovingTowardCenter < 2) {
    errors.push(`not enough allies moved toward center: ${summary.allyMovingTowardCenter}`);
  }
  if (summary.enemyMovingTowardCenter < 2) {
    errors.push(`not enough enemies moved toward center: ${summary.enemyMovingTowardCenter}`);
  }
  if (summary.allyHoldingCenter < 2) {
    errors.push(`allies appear to snap back after convergence: ${summary.allyHoldingCenter}`);
  }
  if (summary.enemyHoldingCenter < 2) {
    errors.push(`enemies appear to snap back after convergence: ${summary.enemyHoldingCenter}`);
  }
  const openingAllyMedian = medianNumber(openingFaceAllyX);
  const openingEnemyMedian = medianNumber(openingFaceEnemyX);
  if (openingAllyMedian !== null && openingEnemyMedian !== null) {
    summary.openingFaceGapMedian = Math.round(Math.abs(openingEnemyMedian - openingAllyMedian) * 100) / 100;
    if (summary.openingFaceGapMedian > 360) {
      errors.push(`opening run stops too far from face-to-face combat: gap=${summary.openingFaceGapMedian}`);
    }
  }
  const maxFrameSpeedLimit = 5.6;
  if (summary.maxFrameSpeed > maxFrameSpeedLimit) {
    errors.push(`actor movement speed too high, possible snap/stutter: ${summary.maxFrameSpeed}px/ms`);
  }
  const maxFrameDeltaLimit = 126;
  if (summary.maxFrameDelta > maxFrameDeltaLimit) {
    errors.push(`actor frame delta too large, movement reads as snap/drift: ${summary.maxFrameDelta}px`);
  }
  const maxContinuousFrameDeltaLimit = 84;
  if (summary.maxContinuousFrameDelta > maxContinuousFrameDeltaLimit) {
    errors.push(`actor continuous frame delta too large, visible teleport risk: ${summary.maxContinuousFrameDelta}px`);
  }
  const maxContinuousFrameSpeedLimit = 1.25;
  if (summary.maxContinuousFrameSpeed > maxContinuousFrameSpeedLimit) {
    errors.push(`actor continuous frame speed too high, visible teleport risk: ${summary.maxContinuousFrameSpeed}px/ms`);
  }
  if (summary.battlefieldOutOfBoundsSampleCount > 0) {
    errors.push(`battle actors left the safe battlefield bounds: count=${summary.battlefieldOutOfBoundsSampleCount}`);
  }
  const samples = Array.isArray(telemetry.samples) ? telemetry.samples : [];
  for (const sample of samples) {
    if (
      !sample
      || sample.openingActive === true
      || (sample.phase !== 'roundPlaying' && sample.phase !== 'resultRecording')
      || typeof sample.unitKey !== 'string'
      || sample.unitKey.includes('empty')
      || !Number.isFinite(Number(sample.x))
      || !Number.isFinite(Number(sample.y))
    ) {
      continue;
    }
    const absX = Math.abs(Number(sample.x || 0));
    const absY = Math.abs(Number(sample.y || 0));
    summary.maxBattlefieldAbsX = Math.max(summary.maxBattlefieldAbsX, Math.round(absX * 100) / 100);
    summary.maxBattlefieldAbsY = Math.max(summary.maxBattlefieldAbsY, Math.round(absY * 100) / 100);
    const outside = sample.x < battlefieldBounds.minX
      || sample.x > battlefieldBounds.maxX
      || sample.y < battlefieldBounds.minY
      || sample.y > battlefieldBounds.maxY;
    if (!outside) {
      continue;
    }
    summary.battlefieldOutOfBoundsSampleCount += 1;
    summary.combatGroundBandMissCount += 1;
    const overflow = Math.max(
      battlefieldBounds.minX - sample.x,
      sample.x - battlefieldBounds.maxX,
      battlefieldBounds.minY - sample.y,
      sample.y - battlefieldBounds.maxY,
      0,
    );
    const roundedOverflow = Math.round(overflow * 100) / 100;
    if (!summary.battlefieldOutOfBoundsWorstSample || roundedOverflow > summary.battlefieldOutOfBoundsWorstSample.overflow) {
      summary.battlefieldOutOfBoundsWorstSample = { overflow: roundedOverflow, sample, bounds: battlefieldBounds };
    }
    if (!summary.combatGroundBandWorstSample || roundedOverflow > summary.combatGroundBandWorstSample.overflow) {
      summary.combatGroundBandWorstSample = { overflow: roundedOverflow, sample, bounds: battlefieldBounds };
    }
  }
  const homeAllyX = [];
  const homeEnemyX = [];
  for (const sample of firstCombatByUnit.values()) {
    if (!sample || sample.openingActive || sample.phase !== 'roundPlaying') {
      continue;
    }
    if (sample.side === 'ally') {
      homeAllyX.push(sample.x);
    } else if (sample.side === 'enemy') {
      homeEnemyX.push(sample.x);
    }
  }
  const allyHomeMedian = medianNumber(homeAllyX);
  const enemyHomeMedian = medianNumber(homeEnemyX);
  if (allyHomeMedian !== null && enemyHomeMedian !== null) {
    summary.homeLineGapMin = Math.round(Math.abs(enemyHomeMedian - allyHomeMedian) * 100) / 100;
    if (summary.homeLineGapMin < 180) {
      errors.push(`battle lines overlap too much after face-to-face convergence, gap=${summary.homeLineGapMin}`);
    }
    if (summary.homeLineGapMin > 420) {
      errors.push(`battle lines stayed too far apart after face-to-face convergence, gap=${summary.homeLineGapMin}`);
    }
  }
  const finalAllyFrontX = [];
  const finalEnemyFrontX = [];
  for (const samplesOfUnit of byUnit.values()) {
    const combatSamples = samplesOfUnit
      .filter((sample) => sample && sample.openingActive !== true && sample.phase === 'roundPlaying' && !isBackRoleBattleSample(sample))
      .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    const finalSample = combatSamples[combatSamples.length - 1];
    if (!finalSample || typeof finalSample.unitKey !== 'string' || finalSample.unitKey.includes('empty')) {
      continue;
    }
    if (finalSample.side === 'ally') {
      finalAllyFrontX.push(Number(finalSample.x || 0));
    } else if (finalSample.side === 'enemy') {
      finalEnemyFrontX.push(Number(finalSample.x || 0));
    }
  }
  const finalAllyMedian = medianNumber(finalAllyFrontX);
  const finalEnemyMedian = medianNumber(finalEnemyFrontX);
  if (finalAllyMedian !== null && finalEnemyMedian !== null) {
    summary.finalFrontLineGapMedian = Math.round(Math.abs(finalEnemyMedian - finalAllyMedian) * 100) / 100;
    if (summary.finalFrontLineGapMedian > 420) {
      errors.push(`final front lines are too far apart and still read turn-based: gap=${summary.finalFrontLineGapMedian}`);
    }
    // 回放驱动的锁定-贴身战斗模型下,攻击者停留在目标面前(接触间距 ~46px),前线中位差下限放宽到 24;
    // 单位间的可读性由同侧重叠(overlap)与围攻席位错位保证。
    if (summary.finalFrontLineGapMedian < 24) {
      errors.push(`final front lines overlap too much and hurt readability: gap=${summary.finalFrontLineGapMedian}`);
    }
  }
  const meleeMoveActorSamples = samples.filter((sample) =>
    sample
    && sample.rootMotionKind === 'melee_move'
    && sample.isActionActor === true
    && sample.openingActive !== true
    && /^(SR|R)$/.test(String(sample.rarity || '').toUpperCase())
  );
  const basicAttackActorSamples = samples.filter((sample) =>
    sample
    && sample.currentActionKind === 'basic_attack'
    && sample.isActionActor === true
    && /^(SR|R)$/.test(String(sample.rarity || '').toUpperCase())
  );
  const srRBasicAttackActorSamples = samples.filter((sample) =>
    sample
    && sample.currentActionKind === 'basic_attack'
    && sample.isActionActor === true
    && /^(SR|R)$/.test(String(sample.rarity || '').toUpperCase())
  );
  const srRBasicAttackWithOwnRootMotion = srRBasicAttackActorSamples.filter((sample) => sample.rootMotionKind === 'basic_attack');
  if (srRBasicAttackWithOwnRootMotion.length > 0) {
    errors.push(`SR/R basic attack still drives root motion instead of holding melee contact: samples=${srRBasicAttackWithOwnRootMotion.length}`);
  }
  if (options.requireSrR === true && srRBasicAttackActorSamples.length > 0 && basicAttackActorSamples.length < 1) {
    errors.push('forced SR/R battle formation produced no SR/R basic attack frame at melee contact');
  }
  const allMeleeBasicAttackActorSamples = samples.filter((sample) =>
    sample
    && sample.currentActionKind === 'basic_attack'
    && sample.isActionActor === true
    && sample.openingActive !== true
    && !isBackRoleBattleSample(sample)
  );
  const basicAttackRootMotionSamples = samples.filter((sample) =>
    sample
    && sample.rootMotionKind === 'melee_move'
    && sample.openingActive !== true
  );
  summary.basicAttackRootMotionSampleCount = basicAttackRootMotionSamples.length;
  if (srRBasicAttackActorSamples.length > 0 && basicAttackRootMotionSamples.length < 1) {
    errors.push('melee_move did not establish target-front contact before basic_attack');
  }
  summary.srRMeleeApproachSampleCount = meleeMoveActorSamples.length;
  const firstByUnit = new Map();
  for (const sample of samples) {
    if (!sample || typeof sample.unitKey !== 'string' || sample.openingActive) {
      continue;
    }
    if (!firstByUnit.has(sample.unitKey)) {
      firstByUnit.set(sample.unitKey, sample);
    }
  }
  const meleeMoveGroups = new Map();
  for (const sample of meleeMoveActorSamples) {
    const key = `${sample.unitKey}->${sample.actionTargetKey || 'target'}`;
    const group = meleeMoveGroups.get(key) ?? [];
    group.push(sample);
    meleeMoveGroups.set(key, group);
  }
  const approachDistances = [];
  for (const group of meleeMoveGroups.values()) {
    const xs = group.map((sample) => Number(sample.x || 0)).filter((value) => Number.isFinite(value));
    if (xs.length >= 2) {
      approachDistances.push(Math.max(...xs) - Math.min(...xs));
      continue;
    }
    const sample = group[0];
    const start = sample ? firstByUnit.get(sample.unitKey) : null;
    if (sample && start) {
      approachDistances.push(Math.abs(Number(sample.x || 0) - Number(start.x || 0)));
    }
  }
  // 新交锋模型：大跑动由开场全员冲锋承担（见下方 frontMeleeCharge 校验），每次普攻只需要在交锋线有可见小前冲。
  const approached = approachDistances.some((distance) => distance > 28);
  const faceToFaceHomeReady = summary.homeLineGapMin !== null && summary.homeLineGapMin >= 180 && summary.homeLineGapMin <= 420;
  if (meleeMoveActorSamples.length > 0 && !approached && !faceToFaceHomeReady) {
    errors.push('SR/R melee_move actor did not visibly lunge into the clash before basic attack');
  }
  summary.srRBasicAttackAdvanceMedian = medianNumber(approachDistances);
  if (meleeMoveActorSamples.length > 0 && !faceToFaceHomeReady && (summary.srRBasicAttackAdvanceMedian === null || summary.srRBasicAttackAdvanceMedian < 28)) {
    errors.push(`SR/R melee_move actor clash lunge is too short before basic attack, median=${summary.srRBasicAttackAdvanceMedian}`);
  }
  // 开场全员冲锋校验：战斗中必须有多名 front 近战一起向前冲到交锋区，而不是只有一个出手者跑出去、其余站桩。
  const frontMeleeChargeByUnit = new Map();
  for (const sample of samples) {
    if (!sample || sample.side !== 'ally' || sample.phase !== 'roundPlaying' || sample.openingActive) {
      continue;
    }
    if (typeof sample.unitKey !== 'string' || sample.unitKey.includes('empty')) {
      continue;
    }
    const xs = frontMeleeChargeByUnit.get(sample.unitKey) ?? [];
    xs.push(Number(sample.x || 0));
    frontMeleeChargeByUnit.set(sample.unitKey, xs);
  }
  const frontMeleeChargeAdvances = [];
  for (const xs of frontMeleeChargeByUnit.values()) {
    if (xs.length >= 2) {
      frontMeleeChargeAdvances.push(Math.max(...xs) - Math.min(...xs));
    }
  }
  const frontMeleeChargers = frontMeleeChargeAdvances.filter((distance) => distance > 120);
  summary.frontMeleeChargeUnitCount = frontMeleeChargers.length;
  summary.frontMeleeChargeAdvanceMedian = medianNumber(frontMeleeChargers);
  if (meleeMoveActorSamples.length > 0 && summary.frontMeleeChargeUnitCount < 2) {
    errors.push(`front melee did not charge together to the clash at combat start, chargedUnits=${summary.frontMeleeChargeUnitCount}`);
  }
  const basicAttackHomeSnapSamples = basicAttackActorSamples.filter((sample) => {
    const start = firstByUnit.get(sample.unitKey);
    if (!start) {
      return false;
    }
    return Math.abs(Number(sample.x || 0) - Number(start.x || 0)) < 112;
  });
  summary.srRBasicAttackHomeSnapCount = basicAttackHomeSnapSamples.length;
  // 交锋式战斗中 home 是开场冲锋后的前线站位，近战围绕该位置小前冲属于正确表现，不再把它当出生点回弹。
  const srRDamageContactHoldSamples = samples.filter((sample) =>
    sample
    && sample.currentActionKind === 'damage_float'
    && sample.isActionActor === true
    && hitKeyBelongsToActor(sample)
    && !isBackRoleBattleSample(sample)
    && /^(SR|R)$/.test(String(sample.rarity || '').toUpperCase())
  );
  summary.srRDamageContactHoldSampleCount = srRDamageContactHoldSamples.length;
  if (options.requireSrR === true && basicAttackActorSamples.length > 0 && srRDamageContactHoldSamples.length < 1) {
    errors.push('SR/R damage float did not occur while attacker was held at target-front contact');
  }
  const postDamageRetreatMisses = [];
  for (const sample of samples) {
    if (
      !sample
      || sample.currentActionKind !== 'damage_float'
      || sample.isActionActor !== true
      || sample.openingActive === true
      || isBackRoleBattleSample(sample)
    ) {
      continue;
    }
    const unitSamples = byUnit.get(sample.unitKey) ?? [];
    const later = unitSamples.find((candidate) =>
      candidate
      && candidate.openingActive !== true
      && candidate.phase === 'roundPlaying'
      && candidate.isActionActor !== true
      && !(candidate.currentActionKind === 'damage_float' && candidate.isActionTarget === true)
      && Number(candidate.at || 0) >= Number(sample.at || 0) + 520
      && Number(candidate.at || 0) <= Number(sample.at || 0) + 1320
    );
    if (!later) {
      continue;
    }
    const retreatToSide = Math.abs(Number(later.x || 0)) - Math.abs(Number(sample.x || 0));
    if (retreatToSide > 230) {
      postDamageRetreatMisses.push({ unitKey: sample.unitKey, fromX: sample.x, laterX: later.x, retreatToSide: Math.round(retreatToSide * 100) / 100 });
    }
  }
  summary.postDamageFrontHoldMissCount = postDamageRetreatMisses.length;
  if (summary.postDamageFrontHoldMissCount > 0) {
    errors.push(`melee actors retreated back toward side columns after hit instead of holding the clash: count=${summary.postDamageFrontHoldMissCount}`);
  }
  const srRDamageHomeSnapSamples = srRDamageContactHoldSamples.filter((sample) => {
    const start = firstByUnit.get(sample.unitKey);
    if (!start) {
      return false;
    }
    return Math.abs(Number(sample.x || 0) - Number(start.x || 0)) < 112;
  });
  summary.srRDamageHomeSnapCount = srRDamageHomeSnapSamples.length;
  // 同上：命中帧允许在前线 home 附近停留，真正的出生点回弹由前线冲锋和帧间位移检查覆盖。
  const postActionDriftMotionKinds = new Set(['melee_move', 'basic_attack', 'damage_float', 'hit_float', 'ranged_projectile']);
  for (const samplesOfUnit of byUnit.values()) {
    let lastActiveSample = null;
    let idleSegmentStart = null;
    let idleMinY = 0;
    let idleMaxY = 0;
    for (const sample of samplesOfUnit) {
      if (!sample || sample.openingActive === true || sample.phase !== 'roundPlaying') {
        idleSegmentStart = null;
        continue;
      }
      const activeMotion = postActionDriftMotionKinds.has(String(sample.rootMotionKind || ''))
        || postActionDriftMotionKinds.has(String(sample.currentActionKind || sample.actionKind || ''))
        || sample.isActionActor === true
        || sample.isActionTarget === true;
      if (activeMotion) {
        lastActiveSample = sample;
        idleSegmentStart = null;
        continue;
      }
      if (!lastActiveSample) {
        idleSegmentStart = null;
        continue;
      }
      const elapsedAfterAction = Number(sample.playbackTimelineTimeMs || 0) - Number(lastActiveSample.playbackTimelineTimeMs || 0);
      if (!Number.isFinite(elapsedAfterAction) || elapsedAfterAction < 0 || elapsedAfterAction > 2400) {
        idleSegmentStart = null;
        continue;
      }
      const y = Number(sample.y || 0);
      if (!idleSegmentStart) {
        idleSegmentStart = sample;
        idleMinY = y;
        idleMaxY = y;
        continue;
      }
      idleMinY = Math.min(idleMinY, y);
      idleMaxY = Math.max(idleMaxY, y);
      const drift = Math.round((idleMaxY - idleMinY) * 100) / 100;
      if (drift > summary.postActionIdleVerticalDriftMax) {
        summary.postActionIdleVerticalDriftMax = drift;
        summary.postActionIdleVerticalDriftSample = {
          unitKey: sample.unitKey,
          drift,
          start: idleSegmentStart,
          current: sample,
          lastActive: lastActiveSample,
        };
      }
    }
  }
  if (summary.postActionIdleVerticalDriftMax > 54) {
    errors.push(`post-action idle vertical drift is too large and reads as lane jumping: max=${summary.postActionIdleVerticalDriftMax}`);
  }
  const targetMeetSamples = samples.filter((sample) =>
    sample
    && sample.currentActionKind === 'basic_attack'
    && sample.isActionTarget === true
    && sample.actionTargetKey === sample.unitKey
  );
  summary.targetMeetSampleCount = targetMeetSamples.length;
  const meleeContactRange = 380;
  const contactDistances = [];
  const closestContactByGroup = new Map();
  for (const sample of basicAttackActorSamples) {
    const targetSample = samples.find((candidate) =>
      candidate
      && candidate.unitKey === sample.actionTargetKey
      && candidate.currentActionKind === 'basic_attack'
      && candidate.isActionTarget === true
      && Math.abs(Number(candidate.at || 0) - Number(sample.at || 0)) <= 72
    );
    if (!targetSample) {
      continue;
    }
    const distance = Math.round(Math.abs(Number(sample.x || 0) - Number(targetSample.x || 0)) * 100) / 100;
    contactDistances.push(distance);
    const groupKey = `${sample.actionActorKey}->${sample.actionTargetKey}`;
    closestContactByGroup.set(groupKey, Math.min(closestContactByGroup.get(groupKey) ?? Number.POSITIVE_INFINITY, distance));
    summary.srRBasicAttackClosestDistance = summary.srRBasicAttackClosestDistance === null
      ? distance
      : Math.min(summary.srRBasicAttackClosestDistance, distance);
  }
  const closestContactDistances = Array.from(closestContactByGroup.values()).filter((distance) => Number.isFinite(distance));
  summary.srRBasicAttackContactSampleCount = closestContactDistances.filter((distance) => distance <= meleeContactRange).length;
  const srRDamageContactProvesHitFrame = summary.srRDamageContactHoldSampleCount > 0
    || summary.allMeleeDamageContactSampleCount > 0;
  if (basicAttackActorSamples.length > 0 && summary.srRBasicAttackContactSampleCount < 1 && !srRDamageContactProvesHitFrame) {
    errors.push(`SR/R basic attack actor did not reach target contact range: closest=${summary.srRBasicAttackClosestDistance}`);
  }
  const closeContactDistances = closestContactDistances.filter((distance) => distance <= meleeContactRange);
  summary.srRBasicAttackMedianDistance = medianNumber(closeContactDistances);
  if (
    basicAttackActorSamples.length > 0
    && !srRDamageContactProvesHitFrame
    && (summary.srRBasicAttackMedianDistance === null || summary.srRBasicAttackMedianDistance > meleeContactRange)
  ) {
    errors.push(`SR/R basic attack contact distance is not in close-combat range, median=${summary.srRBasicAttackMedianDistance}`);
  }
  const allMeleeContactRange = 380;
  const allMeleeContactDistances = [];
  const allMeleeClosestByGroup = new Map();
  const allMeleeDamageClosestByGroup = new Map();
  for (const sample of allMeleeBasicAttackActorSamples) {
    const targetSample = samples.find((candidate) =>
      candidate
      && candidate.unitKey === sample.actionTargetKey
      && candidate.currentActionKind === 'basic_attack'
      && candidate.isActionTarget === true
      && Math.abs(Number(candidate.at || 0) - Number(sample.at || 0)) <= 64
    );
    if (!targetSample) {
      continue;
    }
    const distance = Math.round(Math.abs(Number(sample.x || 0) - Number(targetSample.x || 0)) * 100) / 100;
    const groupKey = `${sample.actionActorKey}->${sample.actionTargetKey}`;
    allMeleeClosestByGroup.set(groupKey, Math.min(allMeleeClosestByGroup.get(groupKey) ?? Number.POSITIVE_INFINITY, distance));
  }
  for (const sample of samples) {
    if (
      !sample
      || sample.currentActionKind !== 'damage_float'
      || sample.isActionActor !== true
      || sample.openingActive === true
      || isBackRoleBattleSample(sample)
    ) {
      continue;
    }
    const targetSample = samples.find((candidate) =>
      candidate
      && candidate.unitKey === sample.actionTargetKey
      && candidate.currentActionKind === 'damage_float'
      && candidate.actionActorKey === sample.actionActorKey
      && candidate.actionTargetKey === sample.actionTargetKey
      && candidate.isActionTarget === true
      && candidate.currentActionHitKey === sample.currentActionHitKey
      && (candidate.currentActionEventSeq == null || sample.currentActionEventSeq == null || candidate.currentActionEventSeq === sample.currentActionEventSeq)
      && candidate.openingActive !== true
      && Math.abs(Number(candidate.at || 0) - Number(sample.at || 0)) <= 72
    );
    if (!targetSample) {
      continue;
    }
    const distance = Math.round(Math.abs(Number(sample.x || 0) - Number(targetSample.x || 0)) * 100) / 100;
    const groupKey = `${sample.actionActorKey}->${sample.actionTargetKey}`;
    allMeleeDamageClosestByGroup.set(groupKey, Math.min(allMeleeDamageClosestByGroup.get(groupKey) ?? Number.POSITIVE_INFINITY, distance));
  }
  const allMeleeEffectiveClosestByGroup = new Map();
  for (const [groupKey, distance] of allMeleeClosestByGroup.entries()) {
    allMeleeEffectiveClosestByGroup.set(groupKey, Math.min(distance, allMeleeDamageClosestByGroup.get(groupKey) ?? Number.POSITIVE_INFINITY));
  }
  for (const [groupKey, distance] of allMeleeDamageClosestByGroup.entries()) {
    if (!allMeleeEffectiveClosestByGroup.has(groupKey)) {
      allMeleeEffectiveClosestByGroup.set(groupKey, distance);
    }
  }
  allMeleeContactDistances.push(...Array.from(allMeleeEffectiveClosestByGroup.values()).filter((distance) => Number.isFinite(distance)));
  summary.allMeleeBasicAttackContactMedian = medianNumber(allMeleeContactDistances);
  summary.allMeleeBasicAttackContactSampleCount = allMeleeContactDistances.filter((distance) => distance <= allMeleeContactRange).length;
  summary.allMeleeDamageContactSampleCount = Array.from(allMeleeDamageClosestByGroup.values()).filter((distance) => Number.isFinite(distance) && distance <= allMeleeContactRange).length;
  summary.allMeleeBasicAttackMissCount = allMeleeContactDistances.filter((distance) => distance > allMeleeContactRange).length;
  summary.perActionMeleeContactMissCount = summary.allMeleeBasicAttackMissCount;
  if (allMeleeBasicAttackActorSamples.length > 0 && summary.allMeleeBasicAttackContactMedian !== null && summary.allMeleeBasicAttackContactMedian > allMeleeContactRange) {
    errors.push(`all melee basic attacks are not close enough to their targets, median=${summary.allMeleeBasicAttackContactMedian}`);
  }
  if (allMeleeContactDistances.length > 0 && summary.allMeleeBasicAttackMissCount > Math.max(1, Math.floor(allMeleeContactDistances.length * 0.18))) {
    errors.push(`too many melee attacks happen away from the target: miss=${summary.allMeleeBasicAttackMissCount}/${allMeleeContactDistances.length}`);
  }
  const allowedPerActionMeleeMissCount = Math.max(1, Math.floor(allMeleeContactDistances.length * 0.12));
  if (summary.perActionMeleeContactMissCount > allowedPerActionMeleeMissCount) {
    errors.push(`per-action melee contact missed target-front range: miss=${summary.perActionMeleeContactMissCount}/${allMeleeContactDistances.length}`);
  }
  if (options.requireSrR === true && meleeMoveActorSamples.length < 1) {
    errors.push('forced SR/R battle formation produced no SR/R melee_move approach sample');
  }
  const spineCues = Array.isArray(telemetry.spineCues) ? telemetry.spineCues : [];
  const srRCues = spineCues.filter((cue) => cue && /^(SR|R)$/.test(String(cue.rarity || '').toUpperCase()));
  const namedCues = spineCues.filter((cue) => cue && /^(SSR|UR)$/.test(String(cue.rarity || '').toUpperCase()));
  summary.srRSpineCueCount = srRCues.length;
  for (const cue of srRCues) {
    const requested = String(cue.requestedAnimationName || '').toLowerCase();
    const applied = String(cue.appliedAnimationName || '').toLowerCase();
    if (requested === 'run' && applied.includes('run')) {
      summary.srRRunCueCount += 1;
    }
    if (requested === 'skill0' && applied.includes('skill0')) {
      summary.srRAttackCueCount += 1;
    }
    if ((requested === 'skill1' || requested === 'skill_01' || requested === 'skill2' || requested === 'skill_02' || requested === 'skill4' || requested === 'skill_04' || requested === 'heal' || requested === 'shield' || requested === 'buff') && /skill[124]/.test(applied)) {
      summary.srRSkillCueCount += 1;
    }
  }
  summary.namedSpineCueCount = namedCues.length;
  for (const cue of namedCues) {
    const requested = String(cue.requestedAnimationName || '').toLowerCase();
    const applied = String(cue.appliedAnimationName || '').toLowerCase();
    if (requested === 'atk' && (applied.includes('atk') || applied.includes('attack'))) {
      summary.namedAtkCueCount += 1;
    }
    if ((requested === 'skill1' || requested === 'skill2' || requested === 'skill3' || requested === 'ult') && /(skill|ult)/.test(applied)) {
      summary.namedSkillCueCount += 1;
    }
  }
  if (srRCues.length > 0 && summary.srRRunCueCount < 1) {
    errors.push('SR/R spine cues were captured but no run cue applied');
  }
  if (srRCues.length > 0 && summary.srRAttackCueCount < 1) {
    errors.push('SR/R spine cues were captured but no skill0 attack cue applied');
  }
  if (options.requireSrR === true && summary.srRSpineCueCount < 1) {
    errors.push('forced SR/R battle formation produced no SR/R spine cues');
  }
  if (options.requireSrR === true && summary.srRRunCueCount < 1) {
    errors.push('forced SR/R battle formation produced no SR/R run cue');
  }
  if (options.requireSrR === true && summary.srRAttackCueCount < 1) {
    errors.push('forced SR/R battle formation produced no SR/R skill0 attack cue');
  }
  if (options.requireSrRSkill === true && summary.srRSkillCueCount < 1) {
    errors.push('forced SR/R battle formation produced no SR/R skill cue');
  }
  if (options.requireMixedScale === true && summary.namedSpineCueCount < 1) {
    errors.push('mixed battle formation produced no SSR/UR spine cues');
  }
  if (options.requireMixedScale === true && summary.namedAtkCueCount < 1) {
    errors.push('mixed battle formation produced no SSR/UR atk cue');
  }
  if (options.requireMixedScale === true && summary.namedSkillCueCount < 1) {
    errors.push('mixed battle formation produced no SSR/UR skill cue');
  }
  const spineVisualSamples = Array.isArray(telemetry.spineVisualSamples) ? telemetry.spineVisualSamples : [];
  const srRVisualHeightsByUnit = new Map();
  const srVisualHeightsByUnit = new Map();
  const rVisualHeightsByUnit = new Map();
  for (const sample of spineVisualSamples) {
    const rarity = String(sample?.rarity || '').toUpperCase();
    if (!sample || sample.side !== 'ally' || !/^(SR|R)$/.test(rarity)) {
      continue;
    }
    const height = estimateSrRActorVisualHeight(sample);
    if (height > 0) {
      srRVisualHeightsByUnit.set(sample.unitKey, Math.max(srRVisualHeightsByUnit.get(sample.unitKey) ?? 0, height));
      const byRarity = rarity === 'SR' ? srVisualHeightsByUnit : rVisualHeightsByUnit;
      byRarity.set(sample.unitKey, Math.max(byRarity.get(sample.unitKey) ?? 0, height));
    }
  }
  const srRVisualHeights = Array.from(srRVisualHeightsByUnit.values());
  const srVisualHeights = Array.from(srVisualHeightsByUnit.values());
  const rVisualHeights = Array.from(rVisualHeightsByUnit.values());
  const allyVisualsByUnit = new Map();
  for (const sample of spineVisualSamples) {
    if (!sample || sample.side !== 'ally') {
      continue;
    }
    const width = Math.max(0, Number(sample.estimatedWidth || 0));
    const height = Math.max(0, Number(sample.estimatedHeight || 0));
    if (height <= 0) {
      continue;
    }
    const existing = allyVisualsByUnit.get(sample.unitKey) ?? { width: 0, height: 0 };
    allyVisualsByUnit.set(sample.unitKey, {
      width: Math.max(existing.width, width),
      height: Math.max(existing.height, height),
    });
  }
  const allyVisuals = Array.from(allyVisualsByUnit.values());
  const allyVisualHeights = allyVisuals.map((visual) => visual.height).filter((value) => value > 0);
  const allyVisualWidths = allyVisuals.map((visual) => visual.width).filter((value) => value > 0);
  summary.srRSpineVisualHeightMin = srRVisualHeights.length > 0 ? Math.round(Math.min(...srRVisualHeights) * 100) / 100 : null;
  summary.srRSpineVisualHeightMedian = medianNumber(srRVisualHeights);
  summary.srRSpineVisualHeightMax = srRVisualHeights.length > 0 ? Math.round(Math.max(...srRVisualHeights) * 100) / 100 : null;
  summary.srRSpineVisualHeightRatio = summary.srRSpineVisualHeightMin && summary.srRSpineVisualHeightMax
    ? Math.round((summary.srRSpineVisualHeightMax / summary.srRSpineVisualHeightMin) * 100) / 100
    : null;
  summary.srSpineVisualHeightMedian = medianNumber(srVisualHeights);
  summary.rSpineVisualHeightMedian = medianNumber(rVisualHeights);
  summary.srRarityHeightRatio = summary.srSpineVisualHeightMedian && summary.rSpineVisualHeightMedian
    ? Math.round((Math.max(summary.srSpineVisualHeightMedian, summary.rSpineVisualHeightMedian) / Math.max(1, Math.min(summary.srSpineVisualHeightMedian, summary.rSpineVisualHeightMedian))) * 100) / 100
    : null;
  summary.allySpineVisualHeightMin = allyVisualHeights.length > 0 ? Math.round(Math.min(...allyVisualHeights) * 100) / 100 : null;
  summary.allySpineVisualHeightMedian = medianNumber(allyVisualHeights);
  summary.allySpineVisualHeightMax = allyVisualHeights.length > 0 ? Math.round(Math.max(...allyVisualHeights) * 100) / 100 : null;
  summary.allySpineVisualHeightRatio = summary.allySpineVisualHeightMin && summary.allySpineVisualHeightMax
    ? Math.round((summary.allySpineVisualHeightMax / Math.max(1, summary.allySpineVisualHeightMin)) * 100) / 100
    : null;
  summary.allySpineVisualWidthMedian = medianNumber(allyVisualWidths);
  summary.allySpineVisualWidthMax = allyVisualWidths.length > 0 ? Math.round(Math.max(...allyVisualWidths) * 100) / 100 : null;
  summary.allySpineVisualWidthRatio = summary.allySpineVisualWidthMedian && summary.allySpineVisualWidthMax
    ? Math.round((summary.allySpineVisualWidthMax / Math.max(1, summary.allySpineVisualWidthMedian)) * 100) / 100
    : null;
  if (options.requireSrR === true && srRVisualHeights.length < 3) {
    errors.push(`forced SR/R battle formation produced too few SR/R visual samples: ${srRVisualHeights.length}`);
  }
  if (options.requireSrR === true && (srVisualHeights.length < 1 || rVisualHeights.length < 1)) {
    errors.push(`forced SR/R battle formation must include both SR and R visual samples: sr=${srVisualHeights.length}, r=${rVisualHeights.length}`);
  }
  if (srRVisualHeights.length > 0 && (summary.srRSpineVisualHeightMin === null || summary.srRSpineVisualHeightMin < 230)) {
    errors.push(`SR/R spine visual height is too small, min=${summary.srRSpineVisualHeightMin}`);
  }
  // 画布补偿(BATTLE_ACT_CANVAS_COMPENSATION)后,遥测的 bounds 视觉高会按各骨骼画布占比放大(1.05~3.5×),
  // 画面"内容高"才是对齐目标;bounds 指标上限相应放宽(内容对齐由编队站台人工验收保障)。
  if (srRVisualHeights.length > 0 && (summary.srRSpineVisualHeightMedian === null || summary.srRSpineVisualHeightMedian > 900)) {
    errors.push(`SR/R spine visual height is too large/uneven, median=${summary.srRSpineVisualHeightMedian}`);
  }
  if (srRVisualHeights.length > 1 && (summary.srRSpineVisualHeightRatio === null || summary.srRSpineVisualHeightRatio > 3.8)) {
    errors.push(`SR/R spine visual height spread is too uneven, ratio=${summary.srRSpineVisualHeightRatio}`);
  }
  if (srVisualHeights.length > 0 && rVisualHeights.length > 0 && (summary.srRarityHeightRatio === null || summary.srRarityHeightRatio > 3.0)) {
    errors.push(`SR and R visual heights are not aligned, ratio=${summary.srRarityHeightRatio}`);
  }
  if (options.requireMixedScale === true && allyVisuals.length < 5) {
    errors.push(`mixed battle formation produced too few ally visual samples: ${allyVisuals.length}`);
  }
  if (options.requireMixedScale === true && (summary.allySpineVisualHeightMin === null || summary.allySpineVisualHeightMin < 190)) {
    errors.push(`mixed battle ally visual height too small, min=${summary.allySpineVisualHeightMin}`);
  }
  if (options.requireMixedScale === true && (summary.allySpineVisualHeightMedian === null || summary.allySpineVisualHeightMedian > 330)) {
    errors.push(`mixed battle ally visual height too large, median=${summary.allySpineVisualHeightMedian}`);
  }
  if (options.requireMixedScale === true && (summary.allySpineVisualHeightRatio === null || summary.allySpineVisualHeightRatio > 1.72)) {
    errors.push(`mixed battle ally visual height spread too uneven, ratio=${summary.allySpineVisualHeightRatio}`);
  }
  if (options.requireMixedScale === true && (summary.allySpineVisualWidthMax === null || summary.allySpineVisualWidthMax > 760)) {
    errors.push(`mixed battle ally visual width too large, max=${summary.allySpineVisualWidthMax}`);
  }
  if (options.requireMixedScale === true && (summary.allySpineVisualWidthRatio === null || summary.allySpineVisualWidthRatio > 2.65)) {
    errors.push(`mixed battle ally visual width spread too uneven, ratio=${summary.allySpineVisualWidthRatio}`);
  }
  const floatingTextSamples = Array.isArray(telemetry.floatingTextSamples) ? telemetry.floatingTextSamples : [];
  const damageCueTimes = Array.from(new Set(floatingTextSamples
    .filter((sample) => sample?.kind === 'action' && sample?.damageFloat === true)
    .map((sample) => Number(sample.cueTimeMs ?? sample.at))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value))))
    .sort((a, b) => a - b);
  const damageCueGaps = [];
  for (let index = 1; index < damageCueTimes.length; index += 1) {
    const gap = damageCueTimes[index] - damageCueTimes[index - 1];
    if (Number.isFinite(gap) && gap > 0) {
      damageCueGaps.push(gap);
    }
  }
  summary.damageCadenceMedianMs = medianNumber(damageCueGaps);
  summary.longestDamageCueGapMs = damageCueGaps.length > 0 ? Math.max(...damageCueGaps) : null;
  const floatingBuckets = new Map();
  const allFloatingBuckets = new Map();
  for (const sample of floatingTextSamples) {
    if (!sample) {
      continue;
    }
    const bucket = Math.floor(Number(sample.at || 0) / 140);
    const allBucket = Math.floor(Number(sample.at || 0) / 260);
    allFloatingBuckets.set(allBucket, (allFloatingBuckets.get(allBucket) ?? 0) + 1);
    if (sample.kind !== 'action') {
      continue;
    }
    floatingBuckets.set(bucket, (floatingBuckets.get(bucket) ?? 0) + 1);
  }
  summary.maxActionFloatingTextsPerFrame = Math.max(0, ...floatingBuckets.values());
  summary.maxAllFloatingTextsPerFrame = Math.max(0, ...allFloatingBuckets.values());
  if (summary.maxActionFloatingTextsPerFrame > 3) {
    errors.push(`too many action floating texts in one frame bucket: ${summary.maxActionFloatingTextsPerFrame}`);
  }
  if (summary.maxAllFloatingTextsPerFrame > 3) {
    errors.push(`too many floating texts share one visual window: ${summary.maxAllFloatingTextsPerFrame}`);
  }
  const transientLayerSamples = Array.isArray(telemetry.transientLayerSamples) ? telemetry.transientLayerSamples : [];
  summary.maxPersistentFloatingTextLayers = Math.max(0, ...transientLayerSamples.map((sample) => Number(sample?.persistentFloatingLayers || 0)).filter((value) => Number.isFinite(value)));
  if (summary.maxPersistentFloatingTextLayers > 4) {
    errors.push(`floating text layers persist too long or stack up: max=${summary.maxPersistentFloatingTextLayers}`);
  }
  const impactSamples = Array.isArray(telemetry.impactSamples) ? telemetry.impactSamples : [];
  const criticalImpactSamples = impactSamples.filter((sample) => sample?.isCritical === true);
  const hitStopSamples = impactSamples.filter((sample) => sample?.effectKind === 'hitStop');
  const screenShakeSamples = impactSamples.filter((sample) => sample?.effectKind === 'screenShake');
  const slashSamples = impactSamples.filter((sample) => sample?.effectKind === 'slash');
  const criticalFloatingTextSamples = floatingTextSamples.filter((sample) => sample?.kind === 'action' && sample?.critical === true);
  summary.impactSampleCount = impactSamples.length;
  summary.criticalImpactSampleCount = criticalImpactSamples.length;
  summary.hitStopSampleCount = hitStopSamples.length;
  summary.screenShakeSampleCount = screenShakeSamples.length;
  summary.slashSampleCount = slashSamples.length;
  summary.criticalFloatingTextSampleCount = criticalFloatingTextSamples.length;
  if (impactSamples.length < 3) {
    errors.push(`battle impact telemetry missing: samples=${impactSamples.length}`);
  }
  if (hitStopSamples.length < 1) {
    errors.push('damage impact did not produce hit stop telemetry');
  }
  if (slashSamples.length < 1) {
    errors.push('damage impact did not produce slash VFX telemetry');
  }
  if (criticalImpactSamples.length > 0 && criticalFloatingTextSamples.length < 1) {
    errors.push('critical damage did not produce enlarged critical floating text telemetry');
  }
  if (criticalImpactSamples.length > 0 && screenShakeSamples.length < 1) {
    errors.push('critical impact did not trigger screen shake telemetry');
  }
  const floatingByCue = new Map();
  for (const sample of floatingTextSamples) {
    if (!sample?.cueKey || sample.kind !== 'action') {
      continue;
    }
    floatingByCue.set(sample.cueKey, sample);
  }
  const slashSyncDeltas = slashSamples
    .map((sample) => {
      const floating = floatingByCue.get(sample.cueKey);
      if (!floating) {
        return null;
      }
      return Math.abs(Number(sample.at || 0) - Number(floating.at || 0));
    })
    .filter((value) => Number.isFinite(value));
  summary.damageFloatImpactSyncMaxDelta = slashSyncDeltas.length > 0 ? Math.max(...slashSyncDeltas) : null;
  if (slashSamples.length > 0 && slashSyncDeltas.length < 1) {
    errors.push('damage float and slash impact did not share a cue window');
  }
  if (summary.damageFloatImpactSyncMaxDelta !== null && summary.damageFloatImpactSyncMaxDelta > 90) {
    errors.push(`damage float is not synced to impact frame, maxDelta=${summary.damageFloatImpactSyncMaxDelta}ms`);
  }
  const hpSamples = Array.isArray(telemetry.hpSamples) ? telemetry.hpSamples : [];
  const enemyHpRatios = hpSamples
    .filter((sample) => sample?.side === 'enemy')
    .map((sample) => Number(sample.hpRatio))
    .filter((value) => Number.isFinite(value));
  const allyHpRatios = hpSamples
    .filter((sample) => sample?.side === 'ally')
    .map((sample) => Number(sample.hpRatio))
    .filter((value) => Number.isFinite(value));
  const damageFloatSamples = floatingTextSamples.filter((sample) => sample?.kind === 'action' && sample?.damageFloat === true);
  const hitVfxAssetSamples = Array.isArray(telemetry.hitVfxAssetSamples) ? telemetry.hitVfxAssetSamples : [];
  const deadUnitHitSamples = Array.isArray(telemetry.deadUnitHitSamples) ? telemetry.deadUnitHitSamples : [];
  const deadActorHiddenSamples = Array.isArray(telemetry.deadActorHiddenSamples) ? telemetry.deadActorHiddenSamples : [];
  summary.hpSampleCount = hpSamples.length;
  summary.enemyHpRatioMin = enemyHpRatios.length > 0 ? Math.min(...enemyHpRatios) : null;
  summary.allyHpRatioMin = allyHpRatios.length > 0 ? Math.min(...allyHpRatios) : null;
  const hpByUnit = new Map();
  const damageFloatingByHitKey = new Map();
  for (const sample of damageFloatSamples) {
    if (typeof sample?.hitKey !== 'string' || sample.hitKey.length <= 0) {
      continue;
    }
    damageFloatingByHitKey.set(sample.hitKey, sample);
  }
  for (const sample of hpSamples) {
    if (!sample?.unitKey || sample.side !== 'enemy') {
      continue;
    }
    const list = hpByUnit.get(sample.unitKey) ?? [];
    list.push(sample);
    hpByUnit.set(sample.unitKey, list);
  }
  for (const list of hpByUnit.values()) {
    list.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    const lastRatio = Number(list[list.length - 1]?.hpRatio);
    if (Number.isFinite(lastRatio)) {
      summary.enemyLastHpRatioMax = summary.enemyLastHpRatioMax === null
        ? lastRatio
        : Math.max(summary.enemyLastHpRatioMax, lastRatio);
    }
    for (let index = 1; index < list.length; index += 1) {
      const prev = Number(list[index - 1]?.hpRatio);
      const current = Number(list[index]?.hpRatio);
      const sample = list[index];
      const combatDamageDrop = sample?.phase === 'roundPlaying'
        && sample.currentActionKind === 'damage_float'
        && sample.currentActionTargetKey === sample.unitKey
        && hitKeyBelongsToTarget(sample);
      if (combatDamageDrop && Number.isFinite(prev) && Number.isFinite(current) && prev >= 0.82 && current <= 0.12) {
        summary.damageOneShotSampleCount += 1;
      }
    }
  }
  summary.damageFloatSampleCount = damageFloatSamples.length;
  summary.hitVfxAssetSampleCount = hitVfxAssetSamples.length;
  summary.deadUnitHitSampleCount = deadUnitHitSamples.length;
  summary.deadActorHiddenSampleCount = deadActorHiddenSamples.length;
  if (hpSamples.length < 12) {
    errors.push(`battle HP telemetry missing or too short: samples=${hpSamples.length}`);
  }
  if (summary.enemyHpRatioMin === null || summary.enemyHpRatioMin > 0.02) {
    errors.push(`enemy HP bars did not reach defeat state before visual result, min=${summary.enemyHpRatioMin}`);
  }
  if (summary.enemyLastHpRatioMax === null || summary.enemyLastHpRatioMax > 0.02) {
    errors.push(`not all enemy HP bars reached defeat state before visual result, lastMax=${summary.enemyLastHpRatioMax}`);
  }
  if (summary.allyHpRatioMin === null || summary.allyHpRatioMin >= 0.96) {
    errors.push(`ally HP bars did not react to counter damage, min=${summary.allyHpRatioMin}`);
  }
  if (summary.damageOneShotSampleCount > 0) {
    errors.push(`enemy HP collapsed in a single hit window, samples=${summary.damageOneShotSampleCount}`);
  }
  if (summary.damageFloatSampleCount < 1) {
    errors.push('damage floating numbers were not generated on hit cues');
  }
  if (summary.hitVfxAssetSampleCount < 1) {
    errors.push('hit VFX asset layer did not render imported C1812 effect sprites');
  }
  if (summary.damageCadenceMedianMs !== null && summary.damageCadenceMedianMs > 1400) {
    errors.push(`damage cadence is too sparse and reads turn-based, medianGap=${summary.damageCadenceMedianMs}ms`);
  }
  if (summary.longestDamageCueGapMs !== null && summary.longestDamageCueGapMs > 2400) {
    errors.push(`damage cues have a long empty window, longestGap=${summary.longestDamageCueGapMs}ms`);
  }
  if (summary.deadUnitHitSampleCount > 0) {
    errors.push(`dead units still received hit feedback: samples=${summary.deadUnitHitSampleCount}`);
  }
  if (summary.enemyHpRatioMin !== null && summary.enemyHpRatioMin <= 0.02 && summary.deadActorHiddenSampleCount < 1) {
    errors.push('dead enemy actors did not fade/hide after defeat');
  }
  const deathTimelineByUnit = new Map();
  for (const sample of hpSamples) {
    if (!sample?.unitKey || sample.side !== 'enemy') {
      continue;
    }
    const deadAtMs = typeof sample.deadAtMs === 'number' ? sample.deadAtMs : Number.NaN;
    if ((sample.dead === true || Number(sample.hpRatio) <= 0.02) && Number.isFinite(deadAtMs)) {
      deathTimelineByUnit.set(sample.unitKey, Math.min(deathTimelineByUnit.get(sample.unitKey) ?? Number.POSITIVE_INFINITY, deadAtMs));
    }
  }
  const liveFrameBuckets = new Map();
  const deadTargetActionKeys = new Set();
  for (const sample of samples) {
    if (!sample || sample.openingActive === true || typeof sample.unitKey !== 'string') {
      continue;
    }
    const playbackMs = Number(sample.playbackTimelineTimeMs);
    if (!Number.isFinite(playbackMs)) {
      continue;
    }
    const deadAtMs = deathTimelineByUnit.get(sample.unitKey);
    if (Number.isFinite(deadAtMs) && playbackMs >= deadAtMs + 260) {
      summary.deadActorVisibleAfterDeadMsMax = Math.max(summary.deadActorVisibleAfterDeadMsMax, Math.round(playbackMs - deadAtMs));
      continue;
    }
    const targetDeadAtMs = deathTimelineByUnit.get(sample.currentActionTargetKey);
    if (Number.isFinite(targetDeadAtMs) && playbackMs >= targetDeadAtMs + 420) {
      const hitKey = sample.currentActionHitKey ?? sample.rootMotionHitKey ?? 'no-hitKey';
      const eventSeq = sample.currentActionEventSeq ?? sample.rootMotionEventSeq ?? 'no-eventSeq';
      deadTargetActionKeys.add(`${sample.currentActionTargetKey}:${eventSeq}:${hitKey}`);
    }
    const bucket = Math.floor(playbackMs / 120);
    const unitMap = liveFrameBuckets.get(bucket) ?? new Map();
    unitMap.set(sample.unitKey, sample);
    liveFrameBuckets.set(bucket, unitMap);
  }
  summary.deadTargetSelectedActionCount = deadTargetActionKeys.size;
  const overlapReturnMotionKinds = new Set(['melee_move', 'basic_attack', 'ranged_projectile']);
  const isRecentReturnMotionSample = (sample) => {
    if (!sample || typeof sample.unitKey !== 'string') {
      return false;
    }
    const playbackMs = Number(sample.playbackTimelineTimeMs);
    if (!Number.isFinite(playbackMs)) {
      return false;
    }
    const unitSamples = byUnit.get(sample.unitKey) ?? [];
    for (let index = unitSamples.length - 1; index >= 0; index -= 1) {
      const candidate = unitSamples[index];
      const candidatePlaybackMs = Number(candidate?.playbackTimelineTimeMs);
      if (!Number.isFinite(candidatePlaybackMs) || candidatePlaybackMs > playbackMs) {
        continue;
      }
      if (playbackMs - candidatePlaybackMs > 900) {
        break;
      }
      if (
        overlapReturnMotionKinds.has(String(candidate.rootMotionKind || ''))
        || overlapReturnMotionKinds.has(String(candidate.currentActionKind || candidate.actionKind || ''))
        || candidate.isActionActor === true
      ) {
        return true;
      }
    }
    return false;
  };
  const rootMotionBuckets = new Map();
  for (const unitMap of liveFrameBuckets.values()) {
    const bucketSamples = Array.from(unitMap.values());
    let overlapPairs = 0;
    for (let index = 0; index < bucketSamples.length; index += 1) {
      for (let next = index + 1; next < bucketSamples.length; next += 1) {
        const a = bucketSamples[index];
        const b = bucketSamples[next];
        if (a.side !== b.side) {
          continue;
        }
        if (a.currentActionKind === 'damage_float' || a.currentActionKind === 'hit_float' || b.currentActionKind === 'damage_float' || b.currentActionKind === 'hit_float') {
          continue;
        }
        const transientActionPass = ['melee_move', 'basic_attack', 'ranged_projectile'].includes(String(a.rootMotionKind || ''))
          || ['melee_move', 'basic_attack', 'ranged_projectile'].includes(String(b.rootMotionKind || ''))
          || ['melee_move', 'basic_attack', 'ranged_projectile'].includes(String(a.currentActionKind || a.actionKind || ''))
          || ['melee_move', 'basic_attack', 'ranged_projectile'].includes(String(b.currentActionKind || b.actionKind || ''))
          || (a.isActionActor === true && (a.currentActionKind === 'damage_float' || a.currentActionKind === 'hit_float'))
          || (b.isActionActor === true && (b.currentActionKind === 'damage_float' || b.currentActionKind === 'hit_float'));
        if (transientActionPass || isRecentReturnMotionSample(a) || isRecentReturnMotionSample(b)) {
          continue;
        }
        const dx = Math.abs(Number(a.x || 0) - Number(b.x || 0));
        const dy = Math.abs(Number(a.y || 0) - Number(b.y || 0));
        if (dx <= 48 && dy <= 58) {
          overlapPairs += 1;
        }
      }
    }
    summary.maxLiveActorOverlapPairs = Math.max(summary.maxLiveActorOverlapPairs, overlapPairs);
  }
  const actionActorKeys = new Set();
  const rootMotionKinds = new Set(['melee_move', 'basic_attack', 'ranged_projectile']);
  const rootMotionBucketMs = 160;
  for (const sample of samples) {
    if (!sample || sample.openingActive === true || typeof sample.unitKey !== 'string') {
      continue;
    }
    const rootMotionKind = String(sample.rootMotionKind || '');
    if (!rootMotionKinds.has(rootMotionKind)) {
      continue;
    }
    const rootMotionActorKey = typeof sample.rootMotionActorKey === 'string' ? sample.rootMotionActorKey : '';
    const rootMotionParticipant = rootMotionActorKey === sample.unitKey
      || (rootMotionActorKey.length < 1 && sample.isActionActor === true);
    if (!rootMotionParticipant) {
      continue;
    }
    const sampleAtMs = Number(sample.at);
    if (!Number.isFinite(sampleAtMs)) {
      continue;
    }
    actionActorKeys.add(sample.unitKey);
    const bucket = Math.floor(sampleAtMs / rootMotionBucketMs);
    const bucketValue = rootMotionBuckets.get(bucket) ?? { unitKeys: new Set(), sides: new Set() };
    bucketValue.unitKeys.add(sample.unitKey);
    bucketValue.sides.add(sample.side);
    rootMotionBuckets.set(bucket, bucketValue);
  }
  summary.actionActorUnitCount = actionActorKeys.size;
  for (const bucket of rootMotionBuckets.values()) {
    summary.maxSimultaneousRootMotionActors = Math.max(summary.maxSimultaneousRootMotionActors, bucket.unitKeys.size);
    if (bucket.unitKeys.size >= 2) {
      summary.rootMotionOverlapWindowCount += 1;
    }
    if (bucket.unitKeys.size >= 2 && bucket.sides.has('ally') && bucket.sides.has('enemy')) {
      summary.bothSidesRootMotionWindowCount += 1;
    }
  }
  for (const list of hpByUnit.values()) {
    list.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    for (let index = 1; index < list.length; index += 1) {
      const prevRatio = Number(list[index - 1]?.hpRatio);
      const currentRatio = Number(list[index]?.hpRatio);
      if (!Number.isFinite(prevRatio) || !Number.isFinite(currentRatio) || currentRatio >= prevRatio - 0.0025) {
        continue;
      }
      const sample = list[index];
      if (sample?.phase !== 'roundPlaying') {
        continue;
      }
      const hitKey = sample.lastDamageHitKey ?? sample.currentActionHitKey;
      const eventSeq = sample.lastDamageEventSeq ?? sample.currentActionEventSeq;
      const cueMatches = typeof hitKey === 'string'
        && hitKey.length > 0
        && parseHitKeyTarget(hitKey) === sample.unitKey
        && Number.isFinite(Number(eventSeq))
        && damageFloatingByHitKey.has(hitKey);
      if (!cueMatches) {
        summary.hpDropCueMismatchCount += 1;
      }
    }
  }
  if (summary.maxLiveActorOverlapPairs > 0) {
    errors.push(`live actors overlap in the same-side battle lane: maxPairs=${summary.maxLiveActorOverlapPairs}`);
  }
  if (summary.deadActorVisibleAfterDeadMsMax > 420) {
    errors.push(`dead enemy actor remained visible too long after death: max=${summary.deadActorVisibleAfterDeadMsMax}ms`);
  }
  if (summary.deadTargetSelectedActionCount > 0) {
    errors.push(`dead enemies were selected by later actions: count=${summary.deadTargetSelectedActionCount}`);
  }
  if (summary.hpDropCueMismatchCount > 0) {
    errors.push(`HP dropped outside synchronized damage hitKey/eventSeq cue: count=${summary.hpDropCueMismatchCount}`);
  }
  if (summary.maxSimultaneousRootMotionActors < 2) {
    errors.push(`battle still reads as one-at-a-time turns, simultaneousRootMotion=${summary.maxSimultaneousRootMotionActors}`);
  }
  if (summary.rootMotionOverlapWindowCount < 2) {
    errors.push(`battle has too few overlapping action windows: overlapWindows=${summary.rootMotionOverlapWindowCount}`);
  }
  if (summary.bothSidesRootMotionWindowCount < 1) {
    errors.push(`battle lacks cross-side simultaneous pressure: bothSidesWindows=${summary.bothSidesRootMotionWindowCount}`);
  }
  return { errors, summary };
}

(async () => {
  resetDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
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
  const battleStartResponses = [];
  const forcedBattleStartBodies = [];
  let forcedBattleFormation = null;

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
  page.on('response', async (response) => {
    if (!response.url().includes('/api/player/battles/start')) {
      return;
    }
    try {
      const payload = await response.json();
      battleStartResponses.push(payload);
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
      requestId: `${original.requestId || 'battle-start'}-${forcedBattleFormation.mode || ACCEPTANCE_FORMATION_MODE}`,
    };
    forcedBattleStartBodies.push(body);
    await route.continue({ postData: JSON.stringify(body) });
  });

  const files = [];
  const telemetrySnapshots = [];
  await page.goto(`${PREVIEW_URL}${PREVIEW_URL.includes('?') ? '&' : '?'}r=battle-center-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(15000);
  files.push(await screenshot(page, '00-title.png'));

  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  files.push(await screenshot(page, '01-login-form.png'));

  await page.mouse.click(640, 421);
  await waitForLobbyReadyAndDisableNativeVideo(page);
  await page.waitForTimeout(1200);
  files.push(await screenshot(page, '02-lobby.png'));
  const lobbyHeroes = await readLobbyHeroesForBattleAcceptance(page);
  forcedBattleFormation = resolveForcedBattleFormation(lobbyHeroes);
  if (!forcedBattleFormation || forcedBattleFormation.heroIds.length < 1) {
    throw new Error(`missing owned battle heroes for ${ACCEPTANCE_FORMATION_MODE} battle acceptance`);
  }
  if (ACCEPTANCE_FORMATION_MODE === 'mixed' && (forcedBattleFormation.namedCount < 1 || forcedBattleFormation.srRActCount < 1)) {
    throw new Error(`mixed battle acceptance needs both named and SR/R act heroes: named=${forcedBattleFormation.namedCount}, srRAct=${forcedBattleFormation.srRActCount}`);
  }

  // 语义等待 + 重试点击:新素材加重页面加载,固定盲等下点击时 UI 可能未就绪导致输入被丢弃。
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
  const clickUntilNode = async (x, y, nodeName, attempts, fallbackButtonName) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      // 物理点击优先;headless 合成点击对个别按钮 hit 不稳定时,最后一轮用事件触发兜底(不改变任何断言)。
      if (fallbackButtonName && attempt === attempts - 1) {
        await page.evaluate(emitSceneButtonClick, fallbackButtonName).catch(() => false);
      } else {
        await page.mouse.click(x, y);
      }
      const appeared = await page.waitForFunction(sceneNodeExists, nodeName, { timeout: 4000 }).then(() => true).catch(() => false);
      if (appeared) {
        return true;
      }
    }
    return false;
  };
  await clickUntilNode(1125, 690, 'LobbyAdventureFormationButton', 3);
  await page.waitForTimeout(900);
  files.push(await screenshot(page, '03-stage-map.png'));

  // 编队确认按钮正中(此前 1022 擦按钮左缘 ~5px,布局微小波动即脱靶造成 flake)。
  await clickUntilNode(0, 0, 'BattleChallengeDialogPanel', 1, 'LobbyAdventureFormationButton');
  await page.waitForTimeout(600);
  files.push(await screenshot(page, '04-challenge-dialog.png'));

  const challengeClicked = await clickUntilNode(0, 0, 'LobbyBattleSceneRoot', 1, 'BattleChallengeDialogChallengeButton');
  void challengeClicked;
  await page.waitForFunction(() => {
    const telemetry = globalThis.__lootchainBattlePlaybackTelemetry;
    return ['asset', 'embedded'].includes(telemetry?.background?.source) && telemetry?.background?.loaded === true;
  }, null, { timeout: 6000 }).catch(() => {
    // The analysis step below will fail with the precise background telemetry state.
  });
  await page.waitForTimeout(300);
  files.push(await screenshot(page, '05-battle-0300ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '05-battle-0300ms');
  await page.waitForTimeout(700);
  files.push(await screenshot(page, '06-opening-run-1000ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '06-opening-run-1000ms');
  await page.waitForTimeout(650);
  files.push(await screenshot(page, '07-opening-hold-1650ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '07-opening-hold-1650ms');
  await page.waitForTimeout(850);
  files.push(await screenshot(page, '08-first-action-2500ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '08-first-action-2500ms');
  await page.waitForTimeout(700);
  files.push(await screenshot(page, '09-basic-contact-3200ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '09-basic-contact-3200ms');
  await page.waitForTimeout(700);
  files.push(await screenshot(page, '10-basic-impact-3900ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '10-basic-impact-3900ms');
  await page.waitForTimeout(700);
  files.push(await screenshot(page, '11-damage-hold-4600ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '11-damage-hold-4600ms');
  await page.waitForTimeout(500);
  files.push(await screenshot(page, '12-mid-combat-5100ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '12-mid-combat-5100ms');
  await page.waitForTimeout(12000);
  await page.waitForFunction(() => {
    const hpSamples = globalThis.__lootchainBattlePlaybackTelemetry?.hpSamples ?? [];
    const latestByEnemy = new Map();
    for (const sample of hpSamples) {
      if (!sample || sample.side !== 'enemy' || !sample.unitKey) {
        continue;
      }
      latestByEnemy.set(sample.unitKey, sample);
    }
    if (latestByEnemy.size < 1) {
      return false;
    }
    return Array.from(latestByEnemy.values()).every((sample) => Number(sample.hpRatio) <= 0.02 || sample.dead === true);
  }, null, { timeout: 18000 }).catch(() => {
    // The telemetry analysis below reports which enemy HP bar remained alive.
  });
  files.push(await screenshot(page, '13-visual-result-17100ms.png'));
  await captureTelemetrySnapshot(page, telemetrySnapshots, '13-visual-result-17100ms');

  const finalTelemetry = await page.evaluate(() => globalThis.__lootchainBattlePlaybackTelemetry ?? null);
  const telemetry = selectBestTelemetrySnapshot(telemetrySnapshots, finalTelemetry);
  const telemetryAnalysis = analyzeTelemetry(telemetry, {
    requireSrR: ACCEPTANCE_FORMATION_MODE !== 'mixed',
    requireMixedScale: ACCEPTANCE_FORMATION_MODE === 'mixed',
  });
  const telemetryUnitKeys = Array.from(new Set((telemetry?.samples ?? []).map((sample) => sample?.unitKey).filter(Boolean)));
  const telemetrySpineCues = Array.isArray(telemetry?.spineCues) ? telemetry.spineCues : [];
  const bodyState = await page.evaluate(() => ({
    hasCocosErrorOverlay: document.body.innerText.includes('Please open the console to see detailed errors')
      || document.body.innerText.includes('Cannot read properties'),
    text: document.body.innerText.slice(0, 500),
  }));
  const settleRequests = requests.filter((request) => /\/api\/player\/battles\/[^/]+\/settle/.test(request.url));
  const battleStartRequests = requests.filter((request) => request.url.includes('/api/player/battles/start'));
  const filteredConsole = consoleLines.filter((line) => line.type === 'error' && !line.text.includes('ReadPixels'));
  const result = {
    files,
    battleStartRequests,
    forcedBattleStartBodies,
    battleStartResponses,
    settleRequests,
    pageErrors,
    filteredConsole,
    bodyState,
    forcedBattleFormation,
    telemetryUnitKeys,
    telemetrySpineCues,
    telemetrySamples: telemetry?.samples ?? [],
    telemetryFocusSamples: (telemetry?.samples ?? []).filter((sample) => sample?.actionKind === 'basic_attack' || sample?.openingActive).slice(-180),
    telemetrySpineVisualSamples: (telemetry?.spineVisualSamples ?? []).slice(-80),
    telemetryFloatingTextSamples: telemetry?.floatingTextSamples ?? [],
    telemetryImpactSamples: (telemetry?.impactSamples ?? []).slice(-120),
    telemetryHpSamples: telemetry?.hpSamples ?? [],
    telemetryHitVfxAssetSamples: (telemetry?.hitVfxAssetSamples ?? []).slice(-80),
    telemetryDeadUnitHitSamples: (telemetry?.deadUnitHitSamples ?? []).slice(-40),
    telemetryDeadActorHiddenSamples: (telemetry?.deadActorHiddenSamples ?? []).slice(-40),
    telemetrySnapshotLabels: telemetrySnapshots.map((snapshot) => ({
      label: snapshot.label,
      sampleCount: Array.isArray(snapshot.telemetry?.samples) ? snapshot.telemetry.samples.length : 0,
    })),
    telemetryAnalysis,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'preview-result.json'), JSON.stringify(result, null, 2), 'utf8');
  await browser.close();

  console.log(`battle center convergence screenshots: ${OUT_DIR}`);
  console.log(`battle start requests: ${battleStartRequests.length}`);
  console.log(`settle requests: ${settleRequests.length} (二期闭环后演出完成会自动提交结算，此项仅记录不判失败)`);
  console.log(`page errors: ${pageErrors.length}`);
  console.log(`console errors: ${filteredConsole.length}`);
  console.log(`telemetry samples: ${telemetryAnalysis.summary.sampleCount}`);
  console.log(`forced battle formation (${forcedBattleFormation.mode || ACCEPTANCE_FORMATION_MODE}): ${forcedBattleFormation.selected.map((hero) => hero.heroCode).join('/')}`);
  if (telemetryAnalysis.errors.length > 0) {
    console.error(`telemetry errors: ${telemetryAnalysis.errors.join('; ')}`);
  }
  if (pageErrors.length > 0 || filteredConsole.length > 0 || bodyState.hasCocosErrorOverlay || telemetryAnalysis.errors.length > 0) {
    process.exit(1);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
