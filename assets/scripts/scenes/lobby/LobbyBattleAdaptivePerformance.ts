import type { BattlePresentationLayout } from './LobbyBattlePresentationLayout';
import type { BattlePresentationSnapshot } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimeline } from './LobbyBattlePresentationTimeline';
import type { LobbyBattlePresentationState } from './LobbyBattlePresentationState';

export type BattleAdaptivePerformanceTier = 'cinematic' | 'balanced' | 'compact' | 'minimal';

export interface BattleAdaptivePerformanceProfile {
  viewportKey: '390x340' | '1280x720' | '1920x1080';
  safeWidth: number;
  safeHeight: number;
  tier: BattleAdaptivePerformanceTier;
  motionScale: number;
  frameBudgetMs: number;
  nodeBudget: number;
  showTimelineRail: boolean;
  showBattleLog: boolean;
  showStage8Panel: boolean;
  showRecoveryBanner: boolean;
  showAssistAuras: boolean;
  showProjectiles: boolean;
  showFloatingText: boolean;
  showSkillBar: boolean;
  showPerformanceBadge: boolean;
  maxVisibleUnits: number;
  maxFloatingTexts: number;
  overlapGuardrails: string[];
}

interface BattleAdaptiveDimensions {
  safeWidth: number;
  safeHeight: number;
  fieldWidth: number;
  fieldHeight: number;
  logWidth: number;
  logHeight: number;
}

/**
 * Stage 9 viewport profile. This file is local presentation logic only:
 * 390x340 keeps the battle readable, 1280x720 keeps the standard HUD, and
 * 1920x1080 keeps the full cinematic layer.
 */
export function resolveBattleAdaptivePerformanceProfile(
  layout: BattlePresentationLayout,
  snapshot: BattlePresentationSnapshot,
  timeline: BattlePresentationTimeline,
  presentation: LobbyBattlePresentationState,
  scale: number,
): BattleAdaptivePerformanceProfile {
  const dimensions = resolveDimensions(layout);
  const viewportKey = resolveViewportKey(dimensions.safeWidth, dimensions.safeHeight);
  const unitCount = snapshot.allies.length + snapshot.enemies.length;
  const eventCount = timeline.events.length;
  const tier = resolveTier(viewportKey, dimensions, layout, scale, unitCount, eventCount);
  const profile = createProfileForTier(tier, viewportKey, dimensions, layout, presentation, scale);
  profile.overlapGuardrails = assertBattleAdaptivePerformanceBounds(profile);
  return profile;
}

export function assertBattleAdaptivePerformanceBounds(profile: BattleAdaptivePerformanceProfile): string[] {
  const guardrails: string[] = [];
  if (profile.safeWidth < 320) {
    guardrails.push('safeWidth below readable viewport');
  }
  if (profile.safeHeight < 300) {
    guardrails.push('safeHeight below readable viewport');
  }
  if (profile.showBattleLog && profile.safeWidth < 760) {
    guardrails.push('battle log would overlap compact field');
  }
  if (profile.showStage8Panel && (profile.safeWidth < 540 || profile.safeHeight < 470)) {
    guardrails.push('Stage 8 panel would overlap compact field');
  }
  if (profile.showSkillBar && profile.safeHeight < 380) {
    guardrails.push('skill bar would overlap footer');
  }
  return guardrails;
}

function resolveDimensions(layout: BattlePresentationLayout): BattleAdaptiveDimensions {
  const safeWidth = Math.max(0, layout.panelSize.width);
  const safeHeight = Math.max(0, layout.panelSize.height);
  return {
    safeWidth,
    safeHeight,
    fieldWidth: Math.max(0, layout.field.width),
    fieldHeight: Math.max(0, layout.field.height),
    logWidth: Math.max(0, layout.log.width),
    logHeight: Math.max(0, layout.log.height),
  };
}

function resolveViewportKey(safeWidth: number, safeHeight: number): BattleAdaptivePerformanceProfile['viewportKey'] {
  if (safeWidth <= 420 || safeHeight <= 380) {
    return '390x340';
  }
  if (safeWidth <= 1360 || safeHeight <= 800) {
    return '1280x720';
  }
  return '1920x1080';
}

function resolveTier(
  viewportKey: BattleAdaptivePerformanceProfile['viewportKey'],
  dimensions: BattleAdaptiveDimensions,
  layout: BattlePresentationLayout,
  scale: number,
  unitCount: number,
  eventCount: number,
): BattleAdaptivePerformanceTier {
  if (viewportKey === '390x340' || dimensions.fieldHeight < 170 * scale) {
    return 'minimal';
  }
  if (layout.compact || layout.stackedFooter || dimensions.fieldWidth < 760 * scale) {
    return 'compact';
  }
  if (viewportKey === '1920x1080' && unitCount <= 10 && eventCount <= 36) {
    return 'cinematic';
  }
  return 'balanced';
}

function createProfileForTier(
  tier: BattleAdaptivePerformanceTier,
  viewportKey: BattleAdaptivePerformanceProfile['viewportKey'],
  dimensions: BattleAdaptiveDimensions,
  layout: BattlePresentationLayout,
  _presentation: LobbyBattlePresentationState,
  scale: number,
): BattleAdaptivePerformanceProfile {
  if (tier === 'minimal') {
    return {
      viewportKey,
      safeWidth: dimensions.safeWidth,
      safeHeight: dimensions.safeHeight,
      tier,
      motionScale: 0,
      frameBudgetMs: 20,
      nodeBudget: 72,
      showTimelineRail: false,
      showBattleLog: false,
      showStage8Panel: false,
      showRecoveryBanner: false,
      showAssistAuras: false,
      showProjectiles: false,
      showFloatingText: false,
      showSkillBar: false,
      showPerformanceBadge: true,
      maxVisibleUnits: 6,
      maxFloatingTexts: 0,
      overlapGuardrails: [],
    };
  }
  if (tier === 'compact') {
    return {
      viewportKey,
      safeWidth: dimensions.safeWidth,
      safeHeight: dimensions.safeHeight,
      tier,
      motionScale: 0.45,
      frameBudgetMs: 20,
      nodeBudget: 108,
      showTimelineRail: false,
      showBattleLog: false,
      showStage8Panel: false,
      showRecoveryBanner: false,
      showAssistAuras: dimensions.fieldHeight >= 210 * scale,
      showProjectiles: dimensions.fieldHeight >= 190 * scale,
      showFloatingText: dimensions.fieldHeight >= 190 * scale,
      showSkillBar: dimensions.fieldHeight >= 220 * scale,
      showPerformanceBadge: true,
      maxVisibleUnits: 8,
      maxFloatingTexts: 2,
      overlapGuardrails: [],
    };
  }
  if (tier === 'balanced') {
    return {
      viewportKey,
      safeWidth: dimensions.safeWidth,
      safeHeight: dimensions.safeHeight,
      tier,
      motionScale: 0.75,
      frameBudgetMs: 18,
      nodeBudget: 150,
      showTimelineRail: false,
      showBattleLog: false,
      showStage8Panel: false,
      showRecoveryBanner: false,
      showAssistAuras: true,
      showProjectiles: true,
      showFloatingText: true,
      showSkillBar: true,
      showPerformanceBadge: false,
      maxVisibleUnits: 10,
      maxFloatingTexts: 4,
      overlapGuardrails: [],
    };
  }
  return {
    viewportKey,
    safeWidth: dimensions.safeWidth,
    safeHeight: dimensions.safeHeight,
    tier,
    motionScale: 1,
    frameBudgetMs: 16,
    nodeBudget: 220,
    showTimelineRail: false,
    showBattleLog: false,
    showStage8Panel: false,
    showRecoveryBanner: false,
    showAssistAuras: true,
    showProjectiles: true,
    showFloatingText: true,
    showSkillBar: true,
    showPerformanceBadge: false,
    maxVisibleUnits: 10,
    maxFloatingTexts: 6,
    overlapGuardrails: [],
  };
}
