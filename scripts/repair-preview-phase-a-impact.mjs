import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_ROOT = path.join(ROOT, 'temp', 'programming', 'packer-driver', 'targets');

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) {
    return output;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      output.push(absolute);
    }
  }
  return output;
}

const helperBlock = `
  function __lootchainResolveBattleImpactProfile(cue, scale) {
    if (!cue || cue.kind !== 'damage_float') {
      return null;
    }
    var safeScale = Math.max(0.2, scale);
    var isCritical = cue.isCritical === true || cue.actorSide === 'ally' || String(cue.label || '').includes('暴击') || /\\\\bcrit\\\\b/i.test(String(cue.label || ''));
    return {
      cueKey: cue.cueKey,
      isCritical,
      hitStopMs: isCritical ? 172 : 86,
      screenShake: {
        enabled: isCritical,
        amplitude: (isCritical ? 11 : 0) * safeScale,
        durationMs: isCritical ? 156 : 0
      },
      defenderRecoil: {
        distanceX: (isCritical ? 204 : 156) * safeScale,
        liftY: (isCritical ? 36 : 28) * safeScale,
        durationMs: isCritical ? 210 : 150
      },
      slash: {
        width: (isCritical ? 176 : 126) * safeScale,
        height: (isCritical ? 102 : 72) * safeScale,
        lineWidth: Math.max(2, (isCritical ? 4.2 : 2.4) * safeScale),
        opacity: isCritical ? 242 : 198,
        primary: isCritical ? { r: 255, g: 78, b: 52, a: 228 } : { r: 236, g: 63, b: 48, a: 188 },
        secondary: isCritical ? { r: 255, g: 222, b: 102, a: 190 } : { r: 246, g: 198, b: 92, a: 128 }
      },
      floatingText: {
        fontSize: (isCritical ? 34 : 23) * safeScale,
        width: (isCritical ? 220 : 168) * safeScale,
        height: (isCritical ? 50 : 36) * safeScale,
        riseY: (isCritical ? 52 : 30) * safeScale,
        popScale: isCritical ? 1.32 : 1.08,
        color: isCritical ? { r: 255, g: 71, b: 45, a: 255 } : { r: 255, g: 219, b: 111, a: 255 }
      }
    };
  }
`;

const floatingTextMethod = `
        renderActionFloatingTextLayer(parent, width, height, scale, presentation, currentActionCue, anchors, frameAnchors) {
          var _frameAnchors$get, _duelFrame$hitPoint$x, _duelFrame$hitPoint$y;

          if (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded' || !currentActionCue || currentActionCue.kind !== 'damage_float') {
            return;
          }

          if (!this.shouldRenderBattleFloatingText(currentActionCue.targetKey, currentActionCue.cueKey, currentActionCue.timeMs)) {
            return;
          }

          var anchorKey = currentActionCue.targetKey;
          var hitAnchor = (_frameAnchors$get = frameAnchors.get(anchorKey)) != null ? _frameAnchors$get : anchors.get(anchorKey);
          var anchor = hitAnchor;

          if (!anchor) {
            return;
          }

          var duelFrame = currentActionCue.actorRole !== 'back' ? this.resolveActorMeleeDuelFrame(currentActionCue, frameAnchors.size > 0 ? frameAnchors : anchors, scale) : null;
          var impactProfile = __lootchainResolveBattleImpactProfile(currentActionCue, scale);
          this.recordBattleFloatingTextTelemetry('action', currentActionCue.cueKey, {
            cueTimeMs: currentActionCue.timeMs,
            critical: impactProfile == null ? void 0 : impactProfile.isCritical,
            fontSize: impactProfile == null ? void 0 : impactProfile.floatingText.fontSize
          });

          if (impactProfile) {
            this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'floatingText');
          }

          var layer = this.host.addChildPlainNode(parent, 'LobbyBattleActionFloatingTextLayer', 0, 0, width, height);
          this.markBattleTransientEffectLayer(layer);
          var laneOffset = this.resolveBattleFloatingTextLaneOffset(currentActionCue.cueKey, scale);
          var labelX = ((_duelFrame$hitPoint$x = duelFrame == null ? void 0 : duelFrame.hitPoint.x) != null ? _duelFrame$hitPoint$x : anchor.x + (anchor.enemy ? -anchor.width * 0.08 : anchor.width * 0.12)) + laneOffset.x;
          var labelY = ((_duelFrame$hitPoint$y = duelFrame == null ? void 0 : duelFrame.hitPoint.y) != null ? _duelFrame$hitPoint$y : anchor.y + anchor.height * 0.52 + height * 0.018) + laneOffset.y;
          var isDamage = currentActionCue.kind === 'damage_float';
          var textName = (impactProfile == null ? void 0 : impactProfile.isCritical) ? 'LobbyBattleActionCriticalDamageFloatText' : isDamage ? 'LobbyBattleActionDamageFloatText' : 'LobbyBattleActionHitFloatText';
          var textValue = currentActionCue.displayValue || (isDamage ? '-0' : '受击');
          var floatText = this.host.addChildLabel(layer, textName, textValue, labelX, labelY, (impactProfile == null ? void 0 : impactProfile.floatingText.fontSize) != null ? impactProfile.floatingText.fontSize : isDamage ? 21 * scale : 16 * scale, impactProfile ? this.battleImpactColor(impactProfile.floatingText.color) : isDamage ? rgba(255, 219, 111) : rgba(220, 235, 255), new Size(Math.min((impactProfile == null ? void 0 : impactProfile.floatingText.width) != null ? impactProfile.floatingText.width : 160 * scale, width * 0.34), (impactProfile == null ? void 0 : impactProfile.floatingText.height) != null ? impactProfile.floatingText.height : 34 * scale));
          floatText.overflow = Label.Overflow.SHRINK;
          this.applyOutline(floatText, scale, true);
          var opacity = layer.addComponent(UIOpacity);
          opacity.opacity = 222;

          if (impactProfile == null ? void 0 : impactProfile.isCritical) {
            floatText.node.setScale(0.82, 0.82, 1);
            tween(floatText.node).to(0.08, {
              scale: new Vec3(impactProfile.floatingText.popScale, impactProfile.floatingText.popScale, 1)
            }).to(0.16, {
              scale: Vec3.ONE
            }).start();
          }

          tween(layer).to(0.34, {
            position: new Vec3(0, (impactProfile == null ? void 0 : impactProfile.floatingText.riseY) != null ? impactProfile.floatingText.riseY : 20 * scale, 0)
          }).to(0.28, {
            position: new Vec3(0, ((impactProfile == null ? void 0 : impactProfile.floatingText.riseY) != null ? impactProfile.floatingText.riseY : 30 * scale) + 10 * scale, 0)
          }).start();
          tween(opacity).to(0.18, {
            opacity: 255
          }).to(0.44, {
            opacity: 0
          }).start();
        }

`;

const impactMethods = `
        renderImpactLayer(parent, width, height, scale, presentation, snapshot, _damageEvent, currentEvent, currentActionCue, currentAssistCue, anchors) {
          var _anchors$get, _duelFrame$hitPoint$x2, _duelFrame$hitPoint$y2;

          if (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded') {
            return;
          }

          if (currentAssistCue && currentEvent.type === 'buff_preview') {
            return;
          }

          var cueIsImpact = (currentActionCue == null ? void 0 : currentActionCue.kind) === 'damage_float' || (currentActionCue == null ? void 0 : currentActionCue.kind) === 'hit_float';
          var eventIsImpact = currentEvent.type === 'damage_preview' || currentEvent.type === 'hit_react';

          if (!cueIsImpact && !eventIsImpact) {
            return;
          }

          var impactProfile = __lootchainResolveBattleImpactProfile(currentActionCue, scale);

          if (!currentActionCue || !impactProfile) {
            return;
          }

          var activeAnchor = currentActionCue ? (_anchors$get = anchors.get(currentActionCue.targetKey)) != null ? _anchors$get : anchors.get(currentActionCue.actorKey) : null;
          var duelFrame = currentActionCue && currentActionCue.actorRole !== 'back' ? this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale) : null;
          var effectX = (_duelFrame$hitPoint$x2 = duelFrame == null ? void 0 : duelFrame.hitPoint.x) != null ? _duelFrame$hitPoint$x2 : activeAnchor ? activeAnchor.x + (activeAnchor.enemy ? -activeAnchor.width * 0.2 : activeAnchor.width * 0.2) : width * 0.15;
          var effectY = (_duelFrame$hitPoint$y2 = duelFrame == null ? void 0 : duelFrame.hitPoint.y) != null ? _duelFrame$hitPoint$y2 : activeAnchor ? activeAnchor.y + activeAnchor.height * 0.16 : height * 0.02;
          var slashKey = 'effect:impact:slash:' + currentActionCue.cueKey;

          if (this.playedBattleCueKeys.has(slashKey)) {
            return;
          }

          this.playedBattleCueKeys.add(slashKey);
          this.renderBattleImpactHitStopLayer(parent, width, height, scale, currentActionCue, impactProfile);
          this.applyBattleImpactScreenShake(parent, currentActionCue, impactProfile);
          this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'slash');
          var slashWidth = Math.min(impactProfile.slash.width, width * 0.18);
          var slashHeight = Math.min(impactProfile.slash.height, height * 0.22);
          var effect = this.host.addChildPlainNode(parent, 'LobbyBattleImpactSlashLayer', 0, 0, width, height);
          this.markBattleTransientEffectLayer(effect);
          var graphics = effect.addComponent(Graphics);
          graphics.strokeColor = this.battleImpactColor(impactProfile.slash.primary);
          graphics.lineWidth = impactProfile.slash.lineWidth;
          graphics.moveTo(effectX - slashWidth * 0.48, effectY + slashHeight * 0.24);
          graphics.lineTo(effectX + slashWidth * 0.34, effectY - slashHeight * 0.05);
          graphics.lineTo(effectX - slashWidth * 0.04, effectY - slashHeight * 0.34);
          graphics.stroke();
          graphics.strokeColor = this.battleImpactColor(impactProfile.slash.secondary);
          graphics.lineWidth = Math.max(1, impactProfile.slash.lineWidth * 0.56);
          graphics.moveTo(effectX - slashWidth * 0.22, effectY + slashHeight * 0.24);
          graphics.lineTo(effectX + slashWidth * 0.48, effectY - slashHeight * 0.22);
          graphics.stroke();
          var opacity = effect.addComponent(UIOpacity);
          opacity.opacity = impactProfile.slash.opacity;
          tween(effect).to(0.08, {
            scale: new Vec3(impactProfile.isCritical ? 1.18 : 1.08, impactProfile.isCritical ? 1.18 : 1.08, 1)
          }).to(0.2, {
            scale: Vec3.ONE
          }).call(() => {
            if (this.isNodeAlive(effect)) {
              effect.destroy();
            }
          }).start();
          tween(opacity).to(0.1, {
            opacity: Math.min(255, impactProfile.slash.opacity + 24)
          }).to(0.22, {
            opacity: 0
          }).start();
        }

        renderBattleImpactHitStopLayer(parent, width, height, scale, currentActionCue, impactProfile) {
          var hitStopKey = 'effect:impact:hitStop:' + currentActionCue.cueKey;

          if (this.playedBattleCueKeys.has(hitStopKey)) {
            return;
          }

          this.playedBattleCueKeys.add(hitStopKey);
          this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'hitStop');
          var layer = this.host.addChildPlainNode(parent, 'LobbyBattleImpactHitStopLayer', 0, 0, width, height);
          this.markBattleTransientEffectLayer(layer);
          var graphics = layer.addComponent(Graphics);
          graphics.fillColor = impactProfile.isCritical ? rgba(255, 246, 196, 42) : rgba(255, 255, 255, 18);
          graphics.rect(-width / 2, -height / 2, width, height);
          graphics.fill();
          var opacity = layer.addComponent(UIOpacity);
          opacity.opacity = impactProfile.isCritical ? 118 : 72;
          var holdSeconds = Math.max(0.04, impactProfile.hitStopMs / 1000);
          tween(opacity).delay(holdSeconds).to(0.08, {
            opacity: 0
          }).call(() => {
            if (this.isNodeAlive(layer)) {
              layer.destroy();
            }
          }).start();
          void scale;
        }

        applyBattleImpactScreenShake(parent, currentActionCue, impactProfile) {
          var screenShakeKey = 'effect:impact:screenShake:' + currentActionCue.cueKey;

          if (!impactProfile.screenShake.enabled || this.playedBattleCueKeys.has(screenShakeKey)) {
            return;
          }

          this.playedBattleCueKeys.add(screenShakeKey);
          this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'screenShake');
          var base = new Vec3(parent.position.x, parent.position.y, parent.position.z);
          var amplitude = impactProfile.screenShake.amplitude;
          var halfDuration = Math.max(0.035, impactProfile.screenShake.durationMs / 2000);
          tween(parent).to(halfDuration, {
            position: new Vec3(base.x + amplitude, base.y - amplitude * 0.34, base.z)
          }).to(halfDuration, {
            position: new Vec3(base.x - amplitude * 0.58, base.y + amplitude * 0.22, base.z)
          }).to(0.05, {
            position: base
          }).call(() => {
            if (this.isNodeAlive(parent)) {
              parent.setPosition(base);
            }
          }).start();
        }

        battleImpactColor(color) {
          return rgba(color.r, color.g, color.b, color.a);
        }

`;

function patchFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  content = content
    .replaceAll('distanceX: (isCritical ? 62 : 34) * safeScale', 'distanceX: (isCritical ? 132 : 84) * safeScale')
    .replaceAll('distanceX: (isCritical ? 112 : 68) * safeScale', 'distanceX: (isCritical ? 132 : 84) * safeScale')
    .replaceAll('distanceX: (isCritical ? 132 : 84) * safeScale', 'distanceX: (isCritical ? 156 : 108) * safeScale')
    .replaceAll('distanceX: (isCritical ? 156 : 108) * safeScale', 'distanceX: (isCritical ? 180 : 132) * safeScale')
    .replaceAll('distanceX: (isCritical ? 180 : 132) * safeScale', 'distanceX: (isCritical ? 204 : 156) * safeScale')
    .replaceAll('liftY: (isCritical ? 9 : 4) * safeScale', 'liftY: (isCritical ? 36 : 28) * safeScale')
    .replaceAll('liftY: (isCritical ? 14 : 8) * safeScale', 'liftY: (isCritical ? 36 : 28) * safeScale');
  if (!content.includes('renderActionFloatingTextLayer(parent, width, height, scale, presentation, currentActionCue, anchors, frameAnchors)')) {
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      return true;
    }
    return false;
  }
  if (!content.includes('__lootchainResolveBattleImpactProfile')) {
    content = content.replace(
      /  function formatBattleHudClock\(timeMs\) \{[\s\S]*?  \}\n/,
      (match) => `${match}${helperBlock}\n`,
    );
  }
  content = content.replace(
    "BATTLE_TRANSIENT_EFFECT_NODE_NAMES = new Set(['LobbyBattleActionFloatingTextLayer', 'LobbyBattleAssistFloatingTextLayer', 'LobbyBattleImpactSlashLayer', 'LobbyBattleActionProjectileLayer', 'LobbyBattleActionTargetSpineEffectLayer', 'LobbyBattleAssistAuraLayer']);",
    "BATTLE_TRANSIENT_EFFECT_NODE_NAMES = new Set(['LobbyBattleActionFloatingTextLayer', 'LobbyBattleAssistFloatingTextLayer', 'LobbyBattleImpactSlashLayer', 'LobbyBattleImpactHitStopLayer', 'LobbyBattleActionProjectileLayer', 'LobbyBattleActionTargetSpineEffectLayer', 'LobbyBattleAssistAuraLayer']);",
  );
  content = content.replace(
    /        recordBattleFloatingTextTelemetry\(kind, cueKey\) \{[\s\S]*?        shouldRenderBattleFloatingText\(targetKey, cueKey, cueTimeMs\) \{/,
    `        recordBattleFloatingTextTelemetry(kind, cueKey, options) {
          var _root$__lootchainBatt7, _telemetry$floatingTe;

          var root = globalThis;
          var telemetry = (_root$__lootchainBatt7 = root.__lootchainBattlePlaybackTelemetry) != null ? _root$__lootchainBatt7 : {
            sceneKey: this.lastBattleSceneKey,
            samples: []
          };

          if (telemetry.sceneKey !== this.lastBattleSceneKey) {
            telemetry.sceneKey = this.lastBattleSceneKey;
            telemetry.samples = [];
            telemetry.floatingTextSamples = [];
          }

          var samples = (_telemetry$floatingTe = telemetry.floatingTextSamples) != null ? _telemetry$floatingTe : [];
          samples.push({
            kind,
            cueKey,
            cueTimeMs: options == null ? void 0 : options.cueTimeMs,
            critical: options == null ? void 0 : options.critical,
            fontSize: options == null ? void 0 : options.fontSize,
            at: Date.now()
          });

          if (samples.length > 600) {
            samples.splice(0, samples.length - 600);
          }

          telemetry.floatingTextSamples = samples;
          root.__lootchainBattlePlaybackTelemetry = telemetry;
        }

        recordBattleImpactTelemetry(currentActionCue, impactProfile, effectKind) {
          var _root$__lootchainImpact, _impactTelemetry$imp;

          var root = globalThis;
          var battleImpactTelemetry = (_root$__lootchainImpact = root.__lootchainBattlePlaybackTelemetry) != null ? _root$__lootchainImpact : {
            sceneKey: this.lastBattleSceneKey,
            samples: []
          };

          if (battleImpactTelemetry.sceneKey !== this.lastBattleSceneKey) {
            battleImpactTelemetry.sceneKey = this.lastBattleSceneKey;
            battleImpactTelemetry.samples = [];
            battleImpactTelemetry.impactSamples = [];
          }

          var impactSamples = (_impactTelemetry$imp = battleImpactTelemetry.impactSamples) != null ? _impactTelemetry$imp : [];
          impactSamples.push({
            cueKey: currentActionCue.cueKey,
            effectKind,
            isCritical: impactProfile.isCritical,
            cueTimeMs: currentActionCue.timeMs,
            hitStopMs: impactProfile.hitStopMs,
            screenShakeAmplitude: impactProfile.screenShake.amplitude,
            slashWidth: impactProfile.slash.width,
            floatingTextFontSize: impactProfile.floatingText.fontSize,
            at: Date.now()
          });

          if (impactSamples.length > 500) {
            impactSamples.splice(0, impactSamples.length - 500);
          }

          battleImpactTelemetry.impactSamples = impactSamples;
          root.__lootchainBattlePlaybackTelemetry = battleImpactTelemetry;
        }

        shouldRenderBattleFloatingText(targetKey, cueKey, cueTimeMs) {`,
  );
  content = content.replace(
    /        renderActionFloatingTextLayer\(parent, width, height, scale, presentation, currentActionCue, anchors, frameAnchors\) \{[\s\S]*?        resolveActionAnchorPoint\(anchor, launch, scale\) \{/,
    `${floatingTextMethod}        resolveActionAnchorPoint(anchor, launch, scale) {`,
  );
  content = content.replace(
    /        renderImpactLayer\(parent, width, height, scale, presentation, snapshot, _damageEvent, currentEvent, currentActionCue, currentAssistCue, anchors\) \{[\s\S]*?        renderStage8SettlementFlowPanel\(parent, width, height, scale, settlementView, compact\) \{/,
    `${impactMethods}        renderStage8SettlementFlowPanel(parent, width, height, scale, settlementView, compact) {`,
  );
  if (content === original) {
    return false;
  }
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

let patched = 0;
for (const file of walk(TARGET_ROOT)) {
  if (patchFile(file)) {
    patched += 1;
  }
}

console.log(`preview phase-a impact repair patched files: ${patched}`);
