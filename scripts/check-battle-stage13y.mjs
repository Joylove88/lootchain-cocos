import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const requiredFiles = [
  'assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'assets/scripts/scenes/C1812CommonUiAssets.ts',
  'assets/scripts/scenes/UiSpriteFrameCache.ts',
  'scripts/screenshot-battle-center-convergence.cjs',
  'assets/resources/ui/battle/c1812/effects/hit_slash.png',
  'assets/resources/ui/battle/c1812/effects/hit_slash.png.meta',
  'assets/resources/ui/battle/c1812/effects/hit_burst.png',
  'assets/resources/ui/battle/c1812/effects/hit_burst.png.meta',
  'assets/resources/ui/battle/c1812/effects/hit_ring.png',
  'assets/resources/ui/battle/c1812/effects/hit_ring.png.meta',
  'assets/resources/ui/battle/c1812/effects/hit_spark.png',
  'assets/resources/ui/battle/c1812/effects/hit_spark.png.meta',
];

const requiredTokens = [
  {
    file: 'assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts',
    tokens: [
      'resolveBattlePresentationHpState',
      'applyBattlePresentationHpTimelineEvent',
      'parseBattleDisplayNumber',
      'enemyTotalHpRatio',
      'deadUnitKeys',
      "event.type === 'damage_preview'",
      "event.type === 'buff_preview'",
    ],
  },
  {
    file: 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
    tokens: [
      'resolveBattlePresentationHpState',
      'BattlePresentationHpState',
      'recordBattleHpTelemetry',
      'renderBattleImpactSpriteLayer',
      'BATTLE_C1812_HIT_SLASH_ASSET',
      'BATTLE_C1812_HIT_BURST_EFFECT_ASSET',
      'BATTLE_C1812_HIT_RING_ASSET',
      'BATTLE_C1812_HIT_SPARK_ASSET',
      'hpState.enemyTotalHpRatio',
      'hpState.units.get(unit.unitKey)',
      'hpUnitDead',
    ],
  },
  {
    file: 'assets/scripts/scenes/C1812CommonUiAssets.ts',
    tokens: [
      'BATTLE_C1812_HIT_SLASH_ASSET',
      'BATTLE_C1812_HIT_BURST_EFFECT_ASSET',
      'BATTLE_C1812_HIT_RING_ASSET',
      'BATTLE_C1812_HIT_SPARK_ASSET',
    ],
  },
  {
    file: 'assets/scripts/scenes/UiSpriteFrameCache.ts',
    tokens: [
      'BATTLE_C1812_HIT_SLASH_ASSET',
      'BATTLE_C1812_HIT_BURST_EFFECT_ASSET',
      'BATTLE_C1812_HIT_RING_ASSET',
      'BATTLE_C1812_HIT_SPARK_ASSET',
    ],
  },
  {
    file: 'scripts/screenshot-battle-center-convergence.cjs',
    tokens: [
      'hpSamples',
      'enemyHpRatioMin',
      'allyHpRatioMin',
      'hitVfxAssetSampleCount',
      'deadUnitHitSampleCount',
      'damageFloatSampleCount',
    ],
  },
];

const errors = [];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, relative))) {
    errors.push(`missing required file: ${relative}`);
  }
}

for (const { file, tokens } of requiredTokens) {
  const absolute = path.join(ROOT, file);
  const content = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
  for (const token of tokens) {
    if (!content.includes(token)) {
      errors.push(`${file} missing token: ${token}`);
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.scripts?.['check:battle-stage13y'] !== 'node ./scripts/check-battle-stage13y.mjs') {
  errors.push('package.json missing check:battle-stage13y script');
}

if (errors.length > 0) {
  console.error(`battle-stage13y guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('battle-stage13y guard passed.');
