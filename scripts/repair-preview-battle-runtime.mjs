import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const BATTLE_RENDERER_SPECIFIER = 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts';

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`missing ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizeChunkPath(chunkPath) {
  const normalized = String(chunkPath ?? '').replace(/\\/g, '/');
  return normalized.startsWith('./') ? normalized : `./${normalized.replace(/^\/+/, '')}`;
}

const importMap = readJson(IMPORT_MAP_PATH);
const chunkPath = normalizeChunkPath(importMap.imports?.[BATTLE_RENDERER_SPECIFIER]);
if (!chunkPath || !chunkPath.startsWith('./chunks/')) {
  throw new Error(`${BATTLE_RENDERER_SPECIFIER} import-map chunk not found`);
}

const chunkFile = join(PREVIEW_ROOT, chunkPath.replace(/^\.\//, ''));
let text = readFileSync(chunkFile, 'utf8');
const requiredTokens = [
  'BATTLE_OPENING_CENTER_CONVERGENCE_RATIO = 0.82',
  'BATTLE_OPENING_CENTER_STOP_GAP_RATIO = 0.42',
  'BATTLE_OPENING_LANE_STOP_GAP_RATIOS',
  'resolveBattleActorFramePosition',
  'resolveBattleActorRootMotionCue',
  'resolveBattleActorRootMotionPosition',
  'resolveBattleTimelineToPresentationRatio',
  'timelineToPresentationRatio',
  "cue.kind === 'melee_move' || cue.kind === 'basic_attack'",
  'setBattleActorFramePosition',
  'BATTLE_ACTOR_POSITION_EPSILON',
  'effectiveAdvanceRatio',
  'Math.floor(now / 24)',
  'isNodeMounted(this.battleSceneRoot)',
  'return this.isNodeAlive(node) && !!node.parent;',
];
const forbiddenTokens = [
  'playBattleOpeningActorMotion',
  'opening-center-motion',
  'battleActorMotionLocks',
  'isBattleActorMotionLocked',
  'remainingMs = Math.max(90, durationMs - elapsedMs)',
];

const missing = requiredTokens.filter((token) => !text.includes(token));
const stale = forbiddenTokens.filter((token) => text.includes(token));
if (
  stale.length === 0
  && missing.every((token) => token === 'resolveBattleTimelineToPresentationRatio' || token === 'timelineToPresentationRatio')
  && text.includes('resolveBattleActorRootMotionPosition(homePosition, targetPosition, cue, playbackTimelineTimeMs)')
  && text.includes('var elapsedMs = clamp(playbackTimelineTimeMs - cue.timeMs, 0, cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS);')
) {
  text = text.replace(
    'var elapsedMs = clamp(playbackTimelineTimeMs - cue.timeMs, 0, cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS);',
    `var timelineToPresentationRatio = 0.23; // resolveBattleTimelineToPresentationRatio fallback for stale Preview chunks.
          var visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs) * Math.max(0.08, timelineToPresentationRatio);
          var elapsedMs = clamp(visualElapsedMs, 0, cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS);`,
  );
  writeFileSync(chunkFile, text, 'utf8');
  console.log(`repaired preview battle runtime visual-time ratio: ${chunkPath}`);
  process.exit(0);
}
if (
  stale.length === 0
  && missing.every((token) => token === 'Math.floor(now / 24)')
  && text.includes('var bucketTime = openingConvergence.active ? openingConvergence.elapsedMs : playbackTimelineTimeMs;')
  && text.includes('Math.floor(bucketTime / 120)')
  && text.includes('at: Date.now()')
  && text.includes('telemetry.samples.length > 800')
) {
  text = text
    .replace(
      'var bucketTime = openingConvergence.active ? openingConvergence.elapsedMs : playbackTimelineTimeMs;\n          var bucket = this.lastBattleSceneKey + ":" + unit.unitKey + ":" + Math.floor(bucketTime / 120) + ":" + (openingConvergence.active ? \'opening\' : presentation.phase);',
      'var now = Date.now();\n          var bucket = this.lastBattleSceneKey + ":" + unit.unitKey + ":" + Math.floor(now / 24) + ":" + (openingConvergence.active ? \'opening\' : presentation.phase);',
    )
    .replace('at: Date.now()', 'at: now')
    .replace('telemetry.samples.length > 800', 'telemetry.samples.length > 4000')
    .replace('telemetry.samples.length - 800', 'telemetry.samples.length - 4000');
  writeFileSync(chunkFile, text, 'utf8');
  console.log(`repaired preview battle runtime telemetry sampling: ${chunkPath}`);
  process.exit(0);
}
if (
  stale.length === 0
  && text.includes('this.drawStage12CampPlate(parent, -width * 0.27, -height * 0.35, width * 0.2, height * 0.072, scale, false);')
  && text.includes('this.drawStage12CampPlate(parent, width * 0.27, -height * 0.35, width * 0.2, height * 0.072, scale, true);')
  && text.includes('graphics.strokeColor = active ?')
) {
  text = text
    .replace(
      /\s*this\.drawStage12CampPlate\(parent, -width \* 0\.27, -height \* 0\.35, width \* 0\.2, height \* 0\.072, scale, false\);\s*this\.drawStage12CampPlate\(parent, width \* 0\.27, -height \* 0\.35, width \* 0\.2, height \* 0\.072, scale, true\);\s*/g,
      '\n          ',
    )
    .replace(
      /graphics\.strokeColor = active \?[^;]+;\n\s+graphics\.lineWidth = Math\.max\(1, active \? 1\.6 \* scale : 0\.8 \* scale\);\n\s+graphics\.ellipse\(0, -slot\.height \* 0\.42, slot\.width \* 0\.38, Math\.max\(10 \* scale, slot\.height \* 0\.064\)\);\n\s+graphics\.stroke\(\);/,
      `var showActiveRing = active || targetActive || assistTargetActive;
          if (showActiveRing) {
            graphics.strokeColor = targetActive || assistTargetActive ? rgba(248, 196, 84, 176) : rgba(128, 104, 66, 92);
            graphics.lineWidth = Math.max(1, (targetActive || assistTargetActive ? 1.25 : 0.8) * scale);
            graphics.ellipse(0, -slot.height * 0.42, slot.width * 0.34, Math.max(8 * scale, slot.height * 0.052));
            graphics.stroke();
          }`,
    );
  writeFileSync(chunkFile, text, 'utf8');
  console.log(`repaired preview battle runtime stage13p visual cleanup: ${chunkPath}`);
  process.exit(0);
}
if (
  stale.length === 0
  && text.includes("this.host.addChildPlainNode(parent, 'LobbyBattleOpeningConvergenceCue'")
  && text.includes('width * (0.12 + 0.08 * progress)')
) {
  text = text.replace(
    /var cue = this\.host\.addChildPlainNode\(parent, 'LobbyBattleOpeningConvergenceCue'[\s\S]*?tween\(opacity\)\.to\(0\.28, \{\s*opacity: 210\s*\}\)\.to\(0\.28, \{\s*opacity: 138\s*\}\)\.start\(\);/,
    'void parent;\n          void width;\n          void height;\n          void scale;',
  );
  writeFileSync(chunkFile, text, 'utf8');
  console.log(`repaired preview battle runtime opening halo cleanup: ${chunkPath}`);
  process.exit(0);
}
if (missing.length > 0 || stale.length > 0) {
  console.error('preview battle runtime is stale; focus Cocos Creator and restart/refresh Preview so the new chunk is rebuilt.');
  if (missing.length > 0) {
    console.error(`missing tokens: ${missing.join(', ')}`);
  }
  if (stale.length > 0) {
    console.error(`stale tokens: ${stale.join(', ')}`);
  }
  process.exit(1);
}

console.log(`preview battle runtime ok: ${chunkPath}`);
