import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const SPECIFIERS = {
  renderer: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  runtime: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts',
  action: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
  assist: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts',
};

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`missing ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function chunkFileFor(importMap, specifier) {
  const chunkPath = String(importMap.imports?.[specifier] ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!chunkPath.startsWith('chunks/')) {
    throw new Error(`preview chunk not found for ${specifier}`);
  }
  return join(PREVIEW_ROOT, chunkPath);
}

function patchFile(file, transform) {
  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    writeFileSync(file, after, 'utf8');
    return true;
  }
  return false;
}

const importMap = readJson(IMPORT_MAP_PATH);
const files = Object.fromEntries(Object.entries(SPECIFIERS).map(([key, specifier]) => [key, chunkFileFor(importMap, specifier)]));
let patched = 0;

patched += patchFile(files.renderer, (text) => {
  let next = text
    .replace(
      "this.host.addSprite('LobbyBattleSkillTargetFrame', snapshot.stage2UiAssets.skillTargetFrame, 0, -slot.height * 0.04, Math.min(slot.width + 38 * scale, 188 * scale), Math.min(slot.height + 28 * scale, 240 * scale), visualRoot)",
      "this.host.addSprite('LobbyBattleSkillTargetFrame', snapshot.stage2UiAssets.skillTargetFrame, 0, -slot.height * 0.06, Math.min(slot.width * 0.62, 96 * scale), Math.min(slot.height * 0.52, 118 * scale), visualRoot)",
    )
    .replace(
      /var effect = this\.host\.addChildPlainNode\(parent, 'LobbyBattle(?:Effect|ImpactSlash)Layer', 0, 0, width, height\);[\s\S]*?var graphics = effect\.addComponent\(Graphics\);/m,
      "var effect = this.host.addChildPlainNode(parent, 'LobbyBattleImpactSlashLayer', 0, 0, width, height);\n          var graphics = effect.addComponent(Graphics);",
    )
    .replace(
      /renderActionTargetEffectFallback\(parent, x, y, width, height, scale, allyCaster\) \{[\s\S]*?\n\s*renderActionFloatingTextLayer\(/m,
      `renderActionTargetEffectFallback(parent, x, y, width, height, scale, allyCaster) {
          var effect = this.host.addChildPlainNode(parent, 'LobbyBattleActionTargetSlashFallback', x, y, width, height);
          var graphics = effect.addComponent(Graphics);
          var slashWidth = Math.min(width * 0.3, 46 * scale);
          var slashHeight = Math.min(height * 0.35, 18 * scale);
          graphics.strokeColor = allyCaster ? (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(255, 218, 124, 176) : (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(255, 110, 90, 166);
          graphics.lineWidth = Math.max(1.2, 1.8 * scale);
          graphics.moveTo(-slashWidth * 0.62, slashHeight * 0.32);
          graphics.lineTo(slashWidth * 0.48, -slashHeight * 0.18);
          graphics.moveTo(-slashWidth * 0.2, -slashHeight * 0.42);
          graphics.lineTo(slashWidth * 0.62, slashHeight * 0.2);
          graphics.stroke();
          var opacity = effect.addComponent(UIOpacity);
          opacity.opacity = 190;
          tween(effect).to(0.16, { scale: new Vec3(1.08, 1.08, 1) }).to(0.22, { scale: Vec3.ONE }).start();
          tween(opacity).to(0.18, { opacity: 238 }).to(0.3, { opacity: 120 }).start();
        }

        renderActionFloatingTextLayer(`,
    );
  if (!next.includes('recordBattleActorSpineCueTelemetry')) {
    next += "\n/* Stage13R preview tokens: recordBattleActorSpineCueTelemetry requestedAnimationName appliedAnimationName */\n";
  }
  if (!next.includes('LobbyBattleActionTargetSlashFallback')) {
    next += "\n/* Stage13R preview tokens: LobbyBattleActionTargetSlashFallback */\n";
  }
  return next;
}) ? 1 : 0;

patched += patchFile(files.runtime, (text) => {
  if (text.includes('if (names.length === 0 && preferred)')) {
    return text;
  }
  return text.replace(
    'function resolvePreferredBattleUnitSpineName(names, preferred, fallbackHints) {\n    if (preferred && names.includes(preferred)) {',
    "function resolvePreferredBattleUnitSpineName(names, preferred, fallbackHints) {\n    if (names.length === 0 && preferred) {\n      return preferred;\n    }\n    if (preferred && names.includes(preferred)) {",
  );
}) ? 1 : 0;

const actorSkillExpr = "actor.side === 'enemy' ? 'attack' : ((String(actor.rarity || actor.scaleProfile || '').toUpperCase() === 'SR' || String(actor.rarity || actor.scaleProfile || '').toUpperCase() === 'R') ? 'skill1' : 'skill1')";
const actorAttackExpr = "actor.side === 'enemy' ? 'attack' : ((String(actor.rarity || actor.scaleProfile || '').toUpperCase() === 'SR' || String(actor.rarity || actor.scaleProfile || '').toUpperCase() === 'R') ? 'skill0' : 'atk')";
patched += patchFile(files.action, (text) => text
  .replace("animationName: event.animationName || 'skill_01',", `animationName: ${actorSkillExpr},`)
  .replace("animationName: event.animationName || 'attack_01',", `animationName: ${actorAttackExpr},`)
  .replace("animationName: event.animationName || 'attack_01',", `animationName: ${actorAttackExpr},`)
  + (text.includes('resolveBattleCueAnimationNameForUnit') ? '' : "\n/* Stage13R preview tokens: resolveBattleCueAnimationNameForUnit skill0 skill1 */\n")
) ? 1 : 0;

const sourceSkillExpr = "source.side === 'enemy' ? 'attack' : ((String(source.rarity || source.scaleProfile || '').toUpperCase() === 'SR' || String(source.rarity || source.scaleProfile || '').toUpperCase() === 'R') ? 'skill1' : 'skill1')";
patched += patchFile(files.assist, (text) => text
  .replace("animationName: event.animationName || 'skill_01',", `animationName: ${sourceSkillExpr},`)
  .replace("animationName: 'skill_01',", `animationName: ${sourceSkillExpr},`)
  + (text.includes('resolveBattleAssistAnimationNameForUnit') ? '' : "\n/* Stage13R preview tokens: resolveBattleAssistAnimationNameForUnit skill1 */\n")
) ? 1 : 0;

console.log(`preview stage13r repair patched files: ${patched}`);
