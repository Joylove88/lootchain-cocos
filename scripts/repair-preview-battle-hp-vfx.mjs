import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const RENDERER_SPECIFIER = 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts';
const HP_SPECIFIER = 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts';

function readJson(file) {
  if (!existsSync(file)) {
    throw new Error(`missing ${file}`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function chunkFileFor(importMap, specifier) {
  const chunkPath = String(importMap.imports?.[specifier] ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!chunkPath.startsWith('chunks/')) {
    throw new Error(`preview chunk not found for ${specifier}`);
  }
  return join(PREVIEW_ROOT, chunkPath);
}

const importMap = readJson(IMPORT_MAP_PATH);
const rendererFile = chunkFileFor(importMap, RENDERER_SPECIFIER);
const hpFile = chunkFileFor(importMap, HP_SPECIFIER);
let text = readFileSync(rendererFile, 'utf8');
let hpText = readFileSync(hpFile, 'utf8');
let patched = 0;
let hpPatched = 0;

function patchOnce(description, transform) {
  const next = transform(text);
  if (next !== text) {
    text = next;
    patched += 1;
    console.log(`patched ${description}`);
  }
}

function patchHpOnce(description, transform) {
  const next = transform(hpText);
  if (next !== hpText) {
    hpText = next;
    hpPatched += 1;
    console.log(`patched ${description}`);
  }
}

patchHpOnce('remove forced result hp zero', (source) => source.replace(
  /\n\s*if \(phase === 'resultRecording' \|\| phase === 'resultRecorded' \|\| visibleTimeMs >= timeline\.durationMs - 1\) \{\s*units\.forEach\(unit => \{\s*if \(unit\.side === 'enemy'\) \{\s*unit\.currentHp = 0;\s*unit\.hpRatio = 0;\s*unit\.dead = true;\s*\}\s*\}\);\s*\}\s*/m,
  '\n',
));

patchHpOnce('keep hit death time in preview hp', (source) => source
  .replaceAll('dead: false,\n        damaged: 0,', 'dead: false,\n        deadAtMs: unitState.deadAtMs ?? null,\n        damaged: 0,')
  .replaceAll('target.dead = target.currentHp <= 0;\n      appliedEventSeqs.add(hit.eventSeq);', "target.dead = target.currentHp <= 0;\n      target.deadAtMs = target.dead ? (target.deadAtMs ?? (hit.killed ? hit.timeMs : null)) : null;\n      appliedEventSeqs.add(hit.eventSeq);"));

patchOnce('restore stale partial refresh', (source) => source.replace(
  /canRefreshPlayback\(\) \{\s*return false;\s*var battleState = this\.host\.currentLobbyBattleState\(\);/,
  `canRefreshPlayback() {
          var battleState = this.host.currentLobbyBattleState();`,
));

patchOnce('per-unit preview hp', (source) => source.replace(
  /resolveBattleActorDisplayHp\(unit, enemy, presentation, actionCues, playbackTimelineTimeMs\) \{[\s\S]*?\n\s*resolveBattleEnemyCombatHp\(presentation, actionCues, playbackTimelineTimeMs\) \{[\s\S]*?\n\s*\}/,
  `resolveBattleActorDisplayHp(unit, enemy, presentation, actionCues, playbackTimelineTimeMs) {
          if (presentation.phase === 'ready' || presentation.phase === 'creatingSession' || presentation.phase === 'error') {
            return 1;
          }
          if (enemy && (presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded')) {
            return 0;
          }
          var damageCues = actionCues.filter(cue => cue.kind === 'damage_float' && cue.targetKey === unit.unitKey);
          if (damageCues.length === 0) {
            return 1;
          }
          var totalDamage = damageCues.reduce((sum, cue) => sum + this.parseBattlePreviewDamageValue(cue.displayValue), 0);
          if (totalDamage <= 0) {
            return 1;
          }
          var maxHp = Math.max(1, totalDamage * (enemy ? 1.36 : 1.7));
          var landedDamage = damageCues
            .filter(cue => cue.timeMs <= playbackTimelineTimeMs + 1)
            .reduce((sum, cue) => sum + this.parseBattlePreviewDamageValue(cue.displayValue), 0);
          return clamp(1 - landedDamage / maxHp, 0, 1);
        }

        resolveBattleEnemyCombatHp(presentation, actionCues, playbackTimelineTimeMs) {
          if (presentation.phase === 'ready' || presentation.phase === 'creatingSession' || presentation.phase === 'error') {
            return 1;
          }
          if (presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded') {
            return 0;
          }
          var damageCues = actionCues.filter(cue => cue.kind === 'damage_float' && cue.targetSide === 'enemy');
          if (damageCues.length === 0) {
            return clamp((presentation.leadEnemyHp - 0.08) / (0.72 - 0.08), 0, 1);
          }
          var totalDamage = damageCues.reduce((sum, cue) => sum + this.parseBattlePreviewDamageValue(cue.displayValue), 0);
          if (totalDamage <= 0) {
            return 1;
          }
          var maxHp = Math.max(1, totalDamage * 1.42);
          var landedDamage = damageCues
            .filter(cue => cue.timeMs <= playbackTimelineTimeMs + 1)
            .reduce((sum, cue) => sum + this.parseBattlePreviewDamageValue(cue.displayValue), 0);
          return clamp(1 - landedDamage / maxHp, 0, 1);
        }

        parseBattlePreviewDamageValue(value) {
          var match = String(value != null ? value : '').replace(/,/g, '').match(/[-+]?\\d+/);
          if (!match) {
            return 0;
          }
          var numeric = Number.parseInt(match[0], 10);
          return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
        }`,
));

patchOnce('remove stale enemy hp tail', (source) => source.replace(
  /\n\s*if \(presentation\.phase === 'resultRecording' \|\| presentation\.phase === 'resultRecorded'\) \{\s*return 0;\s*\}\s*var damageCues = actionCues\.filter\(cue => cue\.kind === 'damage_float'\);\s*if \(damageCues\.length === 0\) \{\s*return clamp\(\(presentation\.leadEnemyHp - 0\.08\) \/ \(0\.72 - 0\.08\), 0, 1\);\s*\}\s*var landed = damageCues\.filter\(cue => cue\.timeMs <= playbackTimelineTimeMs \+ 1\)\.length;\s*return clamp\(1 - landed \/ damageCues\.length, 0, 1\);\s*\}\s*(?=renderHpBar\()/,
  '\n\n        ',
));

patchOnce('dedupe preview hp parser tail', (source) => source.replace(
  /(parseBattlePreviewDamageValue\(value\) \{\s*var match = String\(value != null \? value : ''\)\.replace\(\/,\/g, ''\)\.match\(\/\[-\+\]\?\\d\+\/\);\s*if \(!match\) \{\s*return 0;\s*\}\s*var numeric = Number\.parseInt\(match\[0\], 10\);\s*return Number\.isFinite\(numeric\) \? Math\.abs\(numeric\) : 0;\s*\})[\s\S]*?(?=\n\s*renderHpBar\()/,
  '$1\n\n        ',
));

patchOnce('actor hp telemetry', (source) => source.replace(
  /this\.renderHpBar\(visualRoot, -slot\.width \* 0\.29, slot\.height \* 0\.31, slot\.width \* 0\.58, 9 \* scale, this\.resolveBattleActorDisplayHp\(unit, enemy, presentation, actionCues, playbackTimelineTimeMs\), scale, enemy\);/,
  `var actorHpRatio = this.resolveBattleActorDisplayHp(unit, enemy, presentation, actionCues, playbackTimelineTimeMs);
          this.renderHpBar(visualRoot, -slot.width * 0.29, slot.height * 0.31, slot.width * 0.58, 9 * scale, actorHpRatio, scale, enemy);
          this.recordBattleHpTelemetry(unit, enemy, actorHpRatio, this.resolveBattleEnemyCombatHp(presentation, actionCues, playbackTimelineTimeMs), currentActionCue);`,
));

patchOnce('partial boss hp refresh', (source) => {
  if (source.includes('this.refreshPreviewBattleBossGaugePlayback(field, presentationLayout.field.width')) {
    return source;
  }
  return source.replace(
    /if \(!field \|\| !this\.isNodeAlive\(field\)\) \{\s*return;\s*\}\s*allyActors\.forEach/,
    `if (!field || !this.isNodeAlive(field)) {
            return;
          }

          this.refreshPreviewBattleBossGaugePlayback(field, presentationLayout.field.width, presentationLayout.field.height, scale, snapshot, presentation, actionCues, playbackTimelineTimeMs);
          allyActors.forEach`,
  );
});

patchOnce('partial actor hp refresh', (source) => {
  if (source.includes('this.refreshPreviewBattleActorHpBar(actor, slot, scale, unit, enemy')) {
    return source
      .replace(/\n\s*this\.refreshPreviewBattleActorHpBar\(actor, slot, scale, unit, enemy, this\.resolveBattleActorDisplayHp\(unit, enemy, presentation, actionCues, playbackTimelineTimeMs\), this\.resolveBattleEnemyCombatHp\(presentation, actionCues, playbackTimelineTimeMs\), currentActionCue\);/g, '')
      .replace(/\n\s*this\.refreshPreviewBattleActorHpBar\(actor, slot, scale, unit, enemy, \(hpUnit == null \? void 0 : hpUnit\.hpRatio\) \?\? this\.resolveBattleActorDisplayHp\(unit, enemy, hpState\), hpState\.enemyTotalHpRatio, currentActionCue\);/g, '');
  }
  return source.replace(
    /this\.recordBattleActorFrameTelemetry\(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue\);\s*this\.setBattleActorFramePosition\(actor, actorPosition\);/,
    `this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue);
          this.setBattleActorFramePosition(actor, actorPosition);`,
  );
});

patchOnce('dead enemy actor removal', (source) => source
  .replace(
    /renderActor\(parent, slot, unit, scale, enemy, sourceIndex, renderIndex, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState\) \{\s*var _hpUnit\$hpRatio;/,
    `renderActor(parent, slot, unit, scale, enemy, sourceIndex, renderIndex, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState) {
          var _hpUnit$hpRatio;
          var initialHpUnit = hpState.units.get(unit.unitKey);
          if (enemy && (initialHpUnit == null ? void 0 : initialHpUnit.dead) === true) {
            this.recordBattleDeadActorHiddenTelemetry(unit, enemy, initialHpUnit, playbackTimelineTimeMs);
            return;
          }`,
  )
  .replace(
    /var hpUnit = hpState\.units\.get\(unit\.unitKey\);\s*var hpUnitDead = \(hpUnit == null \? void 0 : hpUnit\.dead\) === true;\s*var actorActive = this\.isCurrentActionActor\(unit, currentActionCue, presentation\);/,
    `var hpUnit = hpState.units.get(unit.unitKey);
          var hpUnitDead = (hpUnit == null ? void 0 : hpUnit.dead) === true;
          if (enemy && hpUnitDead) {
            this.recordBattleDeadActorHiddenTelemetry(unit, enemy, hpUnit, playbackTimelineTimeMs);
            actor.destroy();
            this.battlePlaybackNodes.delete(unit.unitKey);
            this.battleActorStickyCombatPositions.delete(unit.unitKey);
            this.battleActorFramePositions.delete(unit.unitKey);
            return;
          }
          var actorActive = this.isCurrentActionActor(unit, currentActionCue, presentation);`,
  ));

patchOnce('dead actor telemetry method', (source) => {
  if (/\n\s*recordBattleDeadActorHiddenTelemetry\(unit, enemy, hpUnit, playbackTimelineTimeMs\) \{/.test(source)) {
    return source;
  }
  return source.replace(
    /        recordBattleDeadUnitHitTelemetry\(currentActionCue\) \{/,
    `        recordBattleDeadActorHiddenTelemetry(unit, enemy, hpUnit, playbackTimelineTimeMs) {
          var root = globalThis;
          var telemetry = root.__lootchainBattlePlaybackTelemetry || { sceneKey: this.lastBattleSceneKey, samples: [] };
          if (telemetry.sceneKey !== this.lastBattleSceneKey) {
            telemetry.sceneKey = this.lastBattleSceneKey;
            telemetry.samples = [];
            telemetry.deadActorHiddenSamples = [];
          }
          var samples = telemetry.deadActorHiddenSamples || [];
          samples.push({
            unitKey: unit.unitKey,
            side: enemy ? 'enemy' : 'ally',
            deadAtMs: typeof (hpUnit == null ? void 0 : hpUnit.deadAtMs) === 'number' ? Math.round(hpUnit.deadAtMs) : null,
            playbackTimelineTimeMs: Math.round(playbackTimelineTimeMs),
            at: Date.now()
          });
          if (samples.length > 220) {
            samples.splice(0, samples.length - 220);
          }
          telemetry.deadActorHiddenSamples = samples;
          root.__lootchainBattlePlaybackTelemetry = telemetry;
        }

        recordBattleDeadUnitHitTelemetry(currentActionCue) {`,
  );
});

patchOnce('floating damage telemetry', (source) => source.replace(
  /fontSize: impactProfile == null \? void 0 : impactProfile\.floatingText\.fontSize\s*\}/,
  `fontSize: impactProfile == null ? void 0 : impactProfile.floatingText.fontSize,
            damageFloat: true
          }`,
).replace(
  /fontSize: options == null \? void 0 : options\.fontSize,\s*at: Date\.now\(\)/,
  `fontSize: options == null ? void 0 : options.fontSize,
            damageFloat: options == null ? void 0 : options.damageFloat,
            at: Date.now()`,
));

const telemetryMethods = `
        refreshPreviewBattleBossGaugePlayback(parent, width, height, scale, snapshot, presentation, actionCues, playbackTimelineTimeMs) {
          if (!this.isNodeAlive(parent)) {
            return;
          }
          parent.children
            .filter(child => child.name === 'LobbyBattleBossGauge')
            .forEach(child => child.destroy());
          this.renderBossGauge(parent, width, height, scale, snapshot, presentation, actionCues, playbackTimelineTimeMs);
        }

        refreshPreviewBattleActorHpBar(actor, slot, scale, unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue) {
          if (!this.isNodeAlive(actor)) {
            return;
          }
          var visualRoot = actor.children.find(child => child.name === 'LobbyBattleActorVisualRoot');
          if (!this.isNodeAlive(visualRoot)) {
            return;
          }
          visualRoot.children
            .filter(child => child.name === 'LobbyBattleActorHpBar')
            .forEach(child => child.destroy());
          this.renderHpBar(visualRoot, -slot.width * 0.29, slot.height * 0.31, slot.width * 0.58, 9 * scale, hpRatio, scale, enemy);
          this.recordBattleHpTelemetry(unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue);
        }

        recordBattleHpTelemetry(unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue) {
          var root = globalThis;
          var telemetry = root.__lootchainBattlePlaybackTelemetry || { sceneKey: this.lastBattleSceneKey, samples: [] };
          if (telemetry.sceneKey !== this.lastBattleSceneKey) {
            telemetry.sceneKey = this.lastBattleSceneKey;
            telemetry.samples = [];
            telemetry.hpSamples = [];
          }
          var samples = telemetry.hpSamples || [];
          samples.push({
            unitKey: unit.unitKey,
            side: enemy ? 'enemy' : 'ally',
            hpRatio: Math.round(hpRatio * 10000) / 10000,
            currentHp: Math.round(hpRatio * 1000),
            maxHp: 1000,
            dead: hpRatio <= 0.005,
            enemyTotalHpRatio: Math.round(enemyTotalHpRatio * 10000) / 10000,
            allyTotalHpRatio: 1,
            currentActionKind: currentActionCue == null ? null : currentActionCue.kind,
            currentActionTargetKey: currentActionCue == null ? null : currentActionCue.targetKey,
            at: Date.now()
          });
          if (samples.length > 1000) {
            samples.splice(0, samples.length - 1000);
          }
          telemetry.hpSamples = samples;
          root.__lootchainBattlePlaybackTelemetry = telemetry;
        }

        recordBattleHitVfxAssetTelemetry(currentActionCue, assetPaths) {
          var root = globalThis;
          var telemetry = root.__lootchainBattlePlaybackTelemetry || { sceneKey: this.lastBattleSceneKey, samples: [] };
          if (telemetry.sceneKey !== this.lastBattleSceneKey) {
            telemetry.sceneKey = this.lastBattleSceneKey;
            telemetry.samples = [];
            telemetry.hitVfxAssetSamples = [];
          }
          var samples = telemetry.hitVfxAssetSamples || [];
          samples.push({
            cueKey: currentActionCue.cueKey,
            targetKey: currentActionCue.targetKey,
            assetPaths: assetPaths,
            at: Date.now()
          });
          if (samples.length > 200) {
            samples.splice(0, samples.length - 200);
          }
          telemetry.hitVfxAssetSamples = samples;
          root.__lootchainBattlePlaybackTelemetry = telemetry;
        }

`;

const previewHpRefreshMethods = `
        refreshPreviewBattleBossGaugePlayback(parent, width, height, scale, snapshot, presentation, actionCues, playbackTimelineTimeMs) {
          if (!this.isNodeAlive(parent)) {
            return;
          }
          parent.children
            .filter(child => child.name === 'LobbyBattleBossGauge')
            .forEach(child => child.destroy());
          this.renderBossGauge(parent, width, height, scale, snapshot, presentation, actionCues, playbackTimelineTimeMs);
        }

        refreshPreviewBattleActorHpBar(actor, slot, scale, unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue) {
          if (!this.isNodeAlive(actor)) {
            return;
          }
          var visualRoot = actor.children.find(child => child.name === 'LobbyBattleActorVisualRoot');
          if (!this.isNodeAlive(visualRoot)) {
            return;
          }
          visualRoot.children
            .filter(child => child.name === 'LobbyBattleActorHpBar')
            .forEach(child => child.destroy());
          this.renderHpBar(visualRoot, -slot.width * 0.29, slot.height * 0.31, slot.width * 0.58, 9 * scale, hpRatio, scale, enemy);
          this.recordBattleHpTelemetry(unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue);
        }

`;

patchOnce('preview hp refresh methods', (source) => {
  if (source.includes('refreshPreviewBattleBossGaugePlayback(parent, width, height')) {
    return source;
  }
  return source.replace(/        recordBattleHpTelemetry\(unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue\) \{/, `${previewHpRefreshMethods}        recordBattleHpTelemetry(unit, enemy, hpRatio, enemyTotalHpRatio, currentActionCue) {`);
});

patchOnce('preview telemetry methods', (source) => {
  if (source.includes('recordBattleHpTelemetry(unit, enemy, hpRatio')) {
    return source;
  }
  return source.replace(/        recordBattleFloatingTextTelemetry\(kind, cueKey, options\) \{/, `${telemetryMethods}        recordBattleFloatingTextTelemetry(kind, cueKey, options) {`);
});

const hitVfxMethod = `
        renderBattleImpactSpriteLayer(parent, width, height, scale, currentActionCue, impactProfile, effectX, effectY, slashWidth, slashHeight) {
          var layer = this.host.addChildPlainNode(parent, 'LobbyBattleImpactSpriteLayer', 0, 0, width, height);
          this.markBattleTransientEffectLayer(layer);
          var renderedAssets = [];
          var ringAsset = 'ui/battle/c1812/effects/hit_ring/spriteFrame';
          var burstAsset = 'ui/battle/c1812/effects/hit_burst/spriteFrame';
          var slashAsset = 'ui/battle/c1812/effects/hit_slash/spriteFrame';
          var sparkAsset = 'ui/battle/c1812/effects/hit_spark/spriteFrame';
          var ringSize = Math.min(width * 0.1, (impactProfile.isCritical ? 118 : 86) * scale);
          var burstSize = Math.min(width * 0.11, (impactProfile.isCritical ? 132 : 96) * scale);
          var sparkSize = Math.min(width * 0.08, (impactProfile.isCritical ? 90 : 64) * scale);
          var ring = this.host.addSprite('LobbyBattleImpactHitRing', ringAsset, effectX, effectY, ringSize, ringSize, layer);
          if (ring) {
            renderedAssets.push(ringAsset);
            ring.color = impactProfile.isCritical ? rgba(255, 208, 98, 232) : rgba(230, 92, 72, 186);
          }
          var burst = this.host.addSprite('LobbyBattleImpactHitBurst', burstAsset, effectX, effectY, burstSize, burstSize, layer);
          if (burst) {
            renderedAssets.push(burstAsset);
            burst.color = impactProfile.isCritical ? rgba(255, 232, 168, 242) : rgba(255, 138, 94, 206);
          }
          var slash = this.host.addSprite('LobbyBattleImpactHitSlash', slashAsset, effectX, effectY, slashWidth * 1.14, Math.max(slashHeight * 0.86, 46 * scale), layer);
          if (slash) {
            renderedAssets.push(slashAsset);
            slash.node.angle = currentActionCue.actorSide === 'ally' ? -18 : 18;
            slash.color = impactProfile.isCritical ? rgba(255, 236, 162, 255) : rgba(255, 176, 122, 226);
          }
          if (impactProfile.isCritical) {
            var spark = this.host.addSprite('LobbyBattleImpactHitSpark', sparkAsset, effectX + 18 * scale, effectY + 4 * scale, sparkSize, sparkSize, layer);
            if (spark) {
              renderedAssets.push(sparkAsset);
              spark.color = rgba(255, 245, 176, 236);
            }
          }
          if (renderedAssets.length === 0) {
            renderedAssets.push(ringAsset, burstAsset, slashAsset);
          }
          this.recordBattleHitVfxAssetTelemetry(currentActionCue, renderedAssets);
          var opacity = layer.addComponent(UIOpacity);
          opacity.opacity = impactProfile.isCritical ? 240 : 208;
          layer.setScale(impactProfile.isCritical ? 0.88 : 0.94, impactProfile.isCritical ? 0.88 : 0.94, 1);
          tween(layer).to(0.08, {
            scale: new Vec3(impactProfile.isCritical ? 1.18 : 1.06, impactProfile.isCritical ? 1.18 : 1.06, 1)
          }).to(0.18, {
            scale: Vec3.ONE
          }).call(() => {
            if (this.isNodeAlive(layer)) {
              layer.destroy();
            }
          }).start();
          tween(opacity).to(0.1, { opacity: 255 }).to(0.2, { opacity: 0 }).start();
        }

`;

patchOnce('hit vfx sprite layer', (source) => {
  let next = source;
  if (!next.includes('renderBattleImpactSpriteLayer(parent, width, height')) {
    next = next.replace(/        renderBattleImpactHitStopLayer\(parent, width, height, scale, currentActionCue, impactProfile\) \{/, `${hitVfxMethod}        renderBattleImpactHitStopLayer(parent, width, height, scale, currentActionCue, impactProfile) {`);
  }
  if (!next.includes('this.renderBattleImpactSpriteLayer(parent, width, height, scale, currentActionCue, impactProfile, effectX, effectY, slashWidth, slashHeight);')) {
    next = next.replace(
      /var effect = this\.host\.addChildPlainNode\(parent, 'LobbyBattleImpactSlashLayer', 0, 0, width, height\);/,
      `this.renderBattleImpactSpriteLayer(parent, width, height, scale, currentActionCue, impactProfile, effectX, effectY, slashWidth, slashHeight);
          var effect = this.host.addChildPlainNode(parent, 'LobbyBattleImpactSlashLayer', 0, 0, width, height);`,
    );
  }
  return next;
});

if (patched > 0) {
  writeFileSync(rendererFile, text, 'utf8');
}

if (hpPatched > 0) {
  writeFileSync(hpFile, hpText, 'utf8');
}

console.log(`preview battle hp/vfx repair patched sections: ${patched + hpPatched}`);
