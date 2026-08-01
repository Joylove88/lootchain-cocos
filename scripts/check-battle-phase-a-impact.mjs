import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const requiredFiles = [
  'assets/scripts/scenes/lobby/LobbyBattleImpactDirector.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
  'scripts/screenshot-battle-center-convergence.cjs',
];

const requiredTokens = [
  {
    file: 'assets/scripts/scenes/lobby/LobbyBattleImpactDirector.ts',
    tokens: [
      'resolveBattleImpactProfile',
      'isBattleImpactCritical',
      'hitStopMs',
      'screenShake',
      'defenderRecoil',
      'slash',
      'floatingText',
    ],
  },
  {
    file: 'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
    tokens: [
      'critical',
      'isCritical',
      'damage_float',
    ],
  },
  {
    file: 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
    tokens: [
      'resolveBattleImpactProfile',
      'renderBattleImpactHitStopLayer',
      'applyBattleImpactScreenShake',
      'recordBattleImpactTelemetry',
      'battleImpactTelemetry',
      'LobbyBattleImpactSlashLayer',
      'LobbyBattleActionCriticalDamageFloatText',
      'BATTLE_IMPACT_HIT_STOP_LAYER_NAME',
    ],
  },
  {
    file: 'scripts/screenshot-battle-center-convergence.cjs',
    tokens: [
      'impactSamples',
      'criticalImpactSamples',
      'hitStopSampleCount',
      'screenShakeSampleCount',
      'slashSampleCount',
      'criticalFloatingTextSampleCount',
      'damageFloatImpactSyncMaxDelta',
    ],
  },
];

const errors = [];

for (const relative of requiredFiles) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) {
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
if (packageJson.scripts?.['check:battle-phase-a-impact'] !== 'node ./scripts/check-battle-phase-a-impact.mjs') {
  errors.push('package.json missing check:battle-phase-a-impact script');
}

if (errors.length > 0) {
  console.error(`Battle Phase A impact guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('Battle Phase A impact guard passed.');
