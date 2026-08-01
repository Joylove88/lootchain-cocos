import { Size } from 'cc';

export interface BattlePresentationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BattlePresentationSlot extends BattlePresentationRect {
  lane: number;
}

export interface BattlePresentationLayout {
  compact: boolean;
  stackedFooter: boolean;
  panelSize: Size;
  field: BattlePresentationRect;
  allySlots: BattlePresentationSlot[];
  enemySlots: BattlePresentationSlot[];
  timeline: BattlePresentationRect;
  log: BattlePresentationRect;
  boundary: BattlePresentationRect;
  footerButtons: BattlePresentationRect[];
}

/** 战斗表现专用布局，统一处理桌面、横屏移动和竖屏窄屏。 */
export function resolveBattlePresentationLayout(width: number, height: number, scale: number): BattlePresentationLayout {
  const compact = width < 760 * scale || height < 470 * scale;
  const stackedFooter = width < 620 * scale;
  const verticalCramped = height < 360 * scale;
  const boundaryHeight = (verticalCramped ? 18 : 24) * scale;
  const boundaryY = -height / 2 + (stackedFooter ? (verticalCramped ? 84 : 86) : (verticalCramped ? 54 : 62)) * scale;
  const fieldTop = height / 2 - (verticalCramped ? 78 : 106) * scale;
  const baseFieldBottom = -height / 2 + (stackedFooter ? 118 : 86) * scale;
  const footerClearBottom = boundaryY + boundaryHeight / 2 + (verticalCramped ? 6 : 8) * scale;
  const fieldBottom = Math.max(baseFieldBottom, footerClearBottom);
  const fieldWidth = width - 78 * scale;
  const fieldHeight = Math.max(32 * scale, fieldTop - fieldBottom);
  const fieldY = (fieldTop + fieldBottom) / 2;
  const compactSlotCount = compact && fieldHeight < 190 * scale ? 1 : compact ? 3 : 5;
  const actorWidth = compact ? Math.min((verticalCramped ? 148 : 182) * scale, fieldWidth * 0.32) : Math.min(278 * scale, fieldWidth * 0.23);
  const actorHeight = compact ? Math.min((verticalCramped ? 94 : 144) * scale, fieldHeight * 0.56) : Math.min(328 * scale, fieldHeight * BATTLE_STAGE13X_ACTOR_HEIGHT_RATIO);
  const laneGap = compact ? (verticalCramped ? 58 : 78) * scale : 128 * scale;
  const allyX = compact ? -fieldWidth * 0.26 : -fieldWidth * 0.34;
  const enemyX = compact ? fieldWidth * 0.26 : fieldWidth * 0.34;
  const startY = compactSlotCount === 1 ? fieldHeight * 0.18 : compact ? fieldHeight * 0.12 : 0;
  const allySlots = compact
    ? createCompactSlots(allyX, startY, actorWidth, actorHeight, laneGap, compactSlotCount, false)
    : createStage13XFormationSlots(allyX, actorWidth, actorHeight, scale, fieldWidth, fieldHeight, false);
  const enemySlots = compact
    ? createCompactSlots(enemyX, startY, actorWidth, actorHeight, laneGap, compactSlotCount, true)
    : createStage13XFormationSlots(enemyX, actorWidth, actorHeight, scale, fieldWidth, fieldHeight, true);
  const timeline: BattlePresentationRect = {
    x: 0,
    y: fieldHeight / 2 - 26 * scale,
    width: Math.min(fieldWidth - 34 * scale, compact ? 330 * scale : 430 * scale),
    height: 28 * scale,
  };
  const log: BattlePresentationRect = {
    x: 0,
    y: -fieldHeight / 2 + (compact ? Math.min((verticalCramped ? 28 : 58) * scale, Math.max((verticalCramped ? 18 : 30) * scale, fieldHeight * 0.3)) / 2 + 8 * scale : 44 * scale),
    width: Math.min(fieldWidth - 34 * scale, compact ? fieldWidth - 40 * scale : 340 * scale),
    height: compact ? Math.min((verticalCramped ? 28 : 58) * scale, Math.max((verticalCramped ? 18 : 30) * scale, fieldHeight * 0.3)) : Math.min(78 * scale, fieldHeight * 0.32),
  };
  const boundary: BattlePresentationRect = {
    x: 0,
    y: boundaryY,
    width: width - 110 * scale,
    height: boundaryHeight,
  };
  const buttonY = -height / 2 + 30 * scale;
  const footerButtons = stackedFooter
    ? [
        { x: 0, y: -height / 2 + 52 * scale, width: 168 * scale, height: 34 * scale },
        { x: -86 * scale, y: -height / 2 + 16 * scale, width: 144 * scale, height: 32 * scale },
        { x: 86 * scale, y: -height / 2 + 16 * scale, width: 144 * scale, height: 32 * scale },
      ]
    : [
        { x: -190 * scale, y: buttonY, width: 132 * scale, height: 36 * scale },
        { x: -36 * scale, y: buttonY, width: 136 * scale, height: 36 * scale },
        { x: 128 * scale, y: buttonY, width: 126 * scale, height: 36 * scale },
      ];
  return {
    compact,
    stackedFooter,
    panelSize: new Size(width, height),
    field: { x: 0, y: fieldY, width: fieldWidth, height: fieldHeight },
    allySlots,
    enemySlots,
    timeline,
    log,
    boundary,
    footerButtons,
  };
}

export const BATTLE_STAGE13X_ACTOR_HEIGHT_RATIO = 0.64;

const BATTLE_STAGE13X_FORMATION_OFFSETS = [
  { x: 72, y: 96 },
  { x: -42, y: -18 },
  { x: 92, y: -126 },
  { x: -178, y: 162 },
  { x: -176, y: -204 },
] as const;

function createStage13XFormationSlots(baseX: number, width: number, height: number, scale: number, fieldWidth: number, fieldHeight: number, mirror: boolean): BattlePresentationSlot[] {
  const side = mirror ? -1 : 1;
  const maxX = fieldWidth / 2 - width / 2 - 22 * scale;
  const maxY = fieldHeight / 2 - height / 2 - 16 * scale;
  return BATTLE_STAGE13X_FORMATION_OFFSETS.map((offset, index) => ({
    x: clamp(baseX + side * offset.x * scale, -maxX, maxX),
    y: clamp(offset.y * scale, -maxY, maxY),
    width,
    height,
    lane: index,
  }));
}

function createCompactSlots(x: number, startY: number, width: number, height: number, gap: number, count: number, mirror: boolean): BattlePresentationSlot[] {
  const slots: BattlePresentationSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = index - (count - 1) / 2;
    const laneOffset = mirror ? (index % 2) * 18 : -(index % 2) * 18;
    slots.push({
      x: x + laneOffset,
      y: startY - row * gap,
      width,
      height,
      lane: index,
    });
  }
  return slots;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
