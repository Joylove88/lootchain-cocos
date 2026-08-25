// 矿境守卫战斗渲染层(docs/30 守卫-P1):消费 GuardBattleModel 纯 sim,负责画面与输入。
// 复用现有 battle start/settle 通道:开战回执→建局,胜负→host.settleLobbyBattleSession()(奖励后端权威)。
// P1 视觉:英雄/怪物用现有骨骼(缺省回退色块),水晶/格子/按钮程序绘制;宝箱/三选一/水晶技能在 P2。
import {
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  resources,
  Size,
  sp,
  Sprite,
  UIOpacity,
  UITransform,
  Vec3,
  tween,
} from 'cc';
import type { UiLayout } from './LobbyHudTypes';
import type { LobbyBattlePanelState } from './LobbyBattleState';
import type { LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import {
  createGuardBattle,
  guardBanishChoice,
  guardCellLane,
  guardCellX,
  guardChooseOption,
  guardCrystalSkillReady,
  guardCurrentSummonCost,
  guardDragTo,
  guardEnhance,
  guardFindHeroAt,
  guardHeroAttackValue,
  guardOpenChest,
  guardRerollChoice,
  guardSkipChoice,
  guardSummarizeSpawns,
  guardSummon,
  guardTick,
  guardTrialLayers,
  guardUseCrystalSkill,
  guardMonsterSpineResource,
  GUARD_CRYSTAL_REACH_X,
  GUARD_CRYSTAL_SKILL_CD_MS,
  GUARD_GRID_CELLS,
  GUARD_GRID_COLS,
  GUARD_GRID_ROWS,
  GUARD_MONSTER_DISPLAY_SCALE,
  GUARD_ROLE_PROFILE,
  GUARD_RUSH_TIME_LIMIT_MS,
  GUARD_SPAWN_X,
  resolveGuardRole,
  type GuardBattleState,
  type GuardChestReward,
  type GuardHeroUnit,
  type GuardMonster,
  type GuardPoolHero,
} from './GuardBattleModel';
import { resolveLobbyBattlePresentationSnapshot, type BattlePresentationSnapshot, type BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import {
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
} from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { resolveBattleSkillEffectResource, resolveHeroUltEffect, type BattleSkillEffectSpec } from './LobbyBattleSkillEffectConfig';

export interface LobbyGuardBattleHost {
  node: Node;
  currentLobbyBattleState(): LobbyBattlePanelState;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  settleLobbyBattleSession(): void;
  returnToLobbyFromBattlePreview(): void;
  setStatus(text: string): void;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize?: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

function rgba(r: number, g: number, b: number, a = 255): Color {
  return new Color(r, g, b, a);
}

const TICK_MS = 50;
/** 局外攻击 → 局内 1 星基础攻击折算(平衡口径:atk60≈成型阵容,见 guard_harness)。 */
const GUARD_BASE_ATTACK_SCALE = 1.0;
const GUARD_ROLE_LABEL: Record<string, string> = { melee: '近战', ranged: '远程', support: '辅助', control: '控制' };
const GUARD_ROLE_COLOR: Record<string, Color> = {
  melee: new Color(232, 150, 92),
  ranged: new Color(120, 196, 255),
  support: new Color(150, 230, 160),
  control: new Color(190, 150, 255),
};

interface GuardUnitView {
  node: Node;
  spineReady: boolean;
  lastAnimKey: string;
  skeleton: sp.Skeleton | null;
  idleAnim: string;
  attackAnim: string;
}

export class LobbyGuardBattleRenderer {
  constructor(private readonly host: LobbyGuardBattleHost) {}

  private root: Node | null = null;
  private fieldNode: Node | null = null;
  private sim: GuardBattleState | null = null;
  private simBattleNo = '';
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: BattlePresentationSnapshot | null = null;
  private heroViews = new Map<number, GuardUnitView>();
  private monsterViews = new Map<number, GuardUnitView>();
  private layoutWidth = 1280;
  private layoutHeight = 720;
  private settleRequested = false;
  private overlayShown = false;
  private dragFromCell: number | null = null;
  private dragGhost: Node | null = null;
  /** 墙钟累积器:后台/节流环境 setInterval 触发率不可靠,按真实流逝补跑固定步长子 tick。 */
  private lastTickWallMs = 0;
  private chestViews = new Map<number, Node>();
  private choiceOverlayLevel = 0;
  private wheelOverlayOpen = false;
  /** 点击英雄显示攻击范围(unitId;拖拽结束/再点空白清除)。 */
  private rangeShownUnitId: number | null = null;
  /** 技能特效包围盒缓存(effect:anim → 长边),与在场技能特效计数。 */
  private readonly guardFxBoundsCache = new Map<string, number | null>();
  private guardFxLiveCount = 0;

  isMounted(): boolean {
    return !!this.root && this.root.isValid;
  }

  /** 结算胜负供 LobbyBattleFlow 使用;未分出前 null(flow 兜底旧逻辑,不应发生)。 */
  resolveOutcome(): 'WIN' | 'LOSE' | null {
    if (!this.sim) {
      return null;
    }
    return this.sim.phase === 'victory' ? 'WIN' : this.sim.phase === 'defeat' ? 'LOSE' : null;
  }

  /** 难度Ⅲ(车轮战)层数 = BOSS 击杀 + 波次,走现有 trialLayers 结算通道;非试炼模式 null。 */
  resolveTrialLayers(): number | null {
    return this.sim && this.sim.mode === 'rush' ? guardTrialLayers(this.sim) : null;
  }

  unmount(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.fieldNode = null;
    this.sim = null;
    this.simBattleNo = '';
    this.snapshot = null;
    this.heroViews.clear();
    this.monsterViews.clear();
    this.settleRequested = false;
    this.overlayShown = false;
    this.dragFromCell = null;
    this.dragGhost = null;
    this.chestViews.clear();
    this.choiceOverlayLevel = 0;
    this.wheelOverlayOpen = false;
    this.rangeShownUnitId = null;
    this.guardFxLiveCount = 0;
  }

  /** 战斗状态 bump(结算回执到达等):只刷新结算覆盖层,不整场重建。 */
  onBattleStateBump(): void {
    if (this.isMounted()) {
      this.refreshEndOverlay();
    }
  }

  render(layout: UiLayout): void {
    this.layoutWidth = layout.width;
    this.layoutHeight = layout.height;
    const battleState = this.host.currentLobbyBattleState();
    const battleNo = battleState.start?.battleNo ?? '';
    if (!battleState.start) {
      // start 未回:轻量等待页。
      this.unmount();
      this.root = this.host.addChildPlainNode(this.host.node, 'LobbyGuardBattleRoot', 0, 0, layout.width, layout.height);
      this.paintBackdrop(this.root, layout.width, layout.height);
      this.host.addChildLabel(this.root, 'GuardStarting', battleState.error ? `开战失败:${battleState.error}` : '正在进入矿境…', 0, 0, 20, rgba(230, 214, 178), new Size(layout.width * 0.8, 30));
      if (battleState.error) {
        this.renderExitButton(this.root, layout.width, layout.height);
      }
      return;
    }
    if (battleState.assetsLoading) {
      this.unmount();
      this.root = this.host.addChildPlainNode(this.host.node, 'LobbyGuardBattleRoot', 0, 0, layout.width, layout.height);
      this.paintBackdrop(this.root, layout.width, layout.height);
      const progress = battleState.assetsTotalCount > 0 ? Math.round((battleState.assetsLoadedCount / battleState.assetsTotalCount) * 100) : 0;
      this.host.addChildLabel(this.root, 'GuardLoading', `矿境部署中… ${progress}%`, 0, 0, 20, rgba(230, 214, 178), new Size(layout.width * 0.8, 30));
      return;
    }
    if (this.isMounted() && this.simBattleNo === battleNo) {
      this.refreshEndOverlay();
      return;
    }
    this.unmount();
    this.mount(battleState, layout);
  }

  // ── 建场 ──
  private mount(battleState: LobbyBattlePanelState, layout: UiLayout): void {
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const snapshot = resolveLobbyBattlePresentationSnapshot(battleState, heroes);
    this.snapshot = snapshot;
    const pool: GuardPoolHero[] = snapshot.allies
      .filter((ally) => ally.power > 0 && !ally.unitKey.includes('empty'))
      .slice(0, 5)
      .map((ally, index) => ({
        heroCode: (ally.heroCode ?? ally.unitKey).toUpperCase(),
        displayName: ally.displayName,
        rarity: ally.rarity ?? 'R',
        role: resolveGuardRole(ally.heroCode ?? ally.unitKey, ally.heroClass),
        baseAttack: Math.max(10, Math.round((ally.attack ?? 40) * GUARD_BASE_ATTACK_SCALE)),
        sourceIndex: index,
      }));
    // 难度从 stageCode 后缀取:Ⅰ=10 波,Ⅱ=20 波(第10波节拍BOSS+末波终盘BOSS),Ⅲ=BOSS 车轮战无尽(层数结算)。
    const stageCode = (battleState.start?.stageCode ?? '').toUpperCase();
    const rushMode = stageCode.endsWith('_3');
    this.sim = createGuardBattle(
      pool,
      `${battleState.start?.serverSeed ?? ''}:${battleState.start?.battleNo ?? ''}`,
      rushMode ? 999 : stageCode.endsWith('_2') ? 20 : 10,
      rushMode ? 'rush' : 'standard',
    );
    this.simBattleNo = battleState.start?.battleNo ?? '';
    this.settleRequested = false;
    this.overlayShown = false;

    const root = this.host.addChildPlainNode(this.host.node, 'LobbyGuardBattleRoot', 0, 0, layout.width, layout.height);
    this.root = root;
    this.paintBackdrop(root, layout.width, layout.height);
    this.fieldNode = this.host.addChildPlainNode(root, 'GuardField', 0, -layout.height * 0.03, layout.width, layout.height);
    this.paintLanesAndGrid();
    this.renderCrystal();
    this.renderHud();
    this.renderSummonButton();
    this.renderEnhanceButton();
    this.renderCrystalSkillButton();
    this.renderExitButton(root, layout.width, layout.height);
    this.host.setStatus(rushMode ? '输出试炼·BOSS 车轮战:击杀一只更强一只,层数换输出分!' : '矿境守卫:召唤英雄,守住矿晶水晶!');
    this.lastTickWallMs = Date.now();
    this.tickTimer = setInterval(() => this.step(), TICK_MS);
  }

  private paintBackdrop(root: Node, width: number, height: number): void {
    const g = root.addComponent(Graphics);
    g.fillColor = rgba(16, 12, 11, 255);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
  }

  // ── 几何(参考图 2026-08-21):水晶+3×3 格占左 1/3,怪物跑道占右 2/3 ──
  // 分段线性映射:sim x∈[0,5](英雄区)→ [-0.44W,-0.167W];x∈[5,10](跑道)→ [-0.167W,+0.47W]。
  // 格子与怪物共用同一映射,射程像素与 sim 判定天然对齐。
  private static readonly HERO_ZONE_SIM_END = 5;
  private xToPx(x: number): number {
    const width = this.layoutWidth;
    const heroLeft = -width * 0.44;
    const heroRight = -width * 0.167;
    const runwayRight = width * 0.47;
    if (x <= LobbyGuardBattleRenderer.HERO_ZONE_SIM_END) {
      return heroLeft + (x / LobbyGuardBattleRenderer.HERO_ZONE_SIM_END) * (heroRight - heroLeft);
    }
    return heroRight + ((x - LobbyGuardBattleRenderer.HERO_ZONE_SIM_END) / (GUARD_SPAWN_X - LobbyGuardBattleRenderer.HERO_ZONE_SIM_END)) * (runwayRight - heroRight);
  }
  private pathLeftPx(): number {
    return this.xToPx(0);
  }
  private pathRightPx(): number {
    return this.xToPx(GUARD_SPAWN_X);
  }
  private laneToPy(lane: number): number {
    return this.layoutHeight * 0.12 - lane * this.layoutHeight * 0.19;
  }
  private unitSize(): number {
    return this.layoutHeight * 0.16;
  }
  private cellCenter(cell: number): { x: number; y: number } {
    return { x: this.xToPx(guardCellX(cell)), y: this.laneToPy(guardCellLane(cell)) };
  }
  private cellAtPosition(px: number, py: number): number | null {
    let best: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
      const center = this.cellCenter(cell);
      const dist = Math.hypot(center.x - px, center.y - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }
    return bestDist <= this.unitSize() * 0.9 ? best : null;
  }

  private paintLanesAndGrid(): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const g = field.addComponent(Graphics);
    const laneHeight = this.layoutHeight * 0.185;
    for (let lane = 0; lane < GUARD_GRID_ROWS; lane += 1) {
      const y = this.laneToPy(lane);
      g.fillColor = lane % 2 === 0 ? rgba(30, 23, 19, 200) : rgba(25, 19, 16, 200);
      g.rect(this.pathLeftPx() - this.layoutWidth * 0.05, y - laneHeight / 2, this.pathRightPx() - this.pathLeftPx() + this.layoutWidth * 0.12, laneHeight);
      g.fill();
    }
    // 3×3 大召唤格(参考图卡片式:暗底+金边圆角)
    for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
      const center = this.cellCenter(cell);
      const size = this.unitSize() * 1.05;
      g.fillColor = rgba(16, 13, 12, 200);
      g.roundRect(center.x - size / 2, center.y - size / 2, size, size, 10);
      g.fill();
      g.strokeColor = rgba(150, 118, 70, 170);
      g.lineWidth = 1.8;
      g.roundRect(center.x - size / 2, center.y - size / 2, size, size, 10);
      g.stroke();
    }
  }

  private renderCrystal(): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const x = this.xToPx(0) - this.layoutWidth * 0.035;
    const size = this.layoutHeight * 0.24;
    const holder = this.host.addChildPlainNode(field, 'GuardCrystal', x, this.laneToPy(1), size, size);
    const icon = resolveBagStyleItemIconAsset('SACRED_CRYSTAL', 'CURRENCY');
    if (!icon || !this.host.addSprite('GuardCrystalIcon', icon, 0, 0, size, size, holder)) {
      const g = holder.addComponent(Graphics);
      g.fillColor = rgba(110, 170, 255, 240);
      g.moveTo(0, size * 0.5);
      g.lineTo(size * 0.32, 0);
      g.lineTo(0, -size * 0.5);
      g.lineTo(-size * 0.32, 0);
      g.close();
      g.fill();
    }
    tween(holder)
      .repeatForever(tween().to(1.2, { scale: new Vec3(1.05, 1.05, 1) }).to(1.2, { scale: Vec3.ONE }))
      .start();
  }

  // ── HUD:水晶血条 / 金币 / 波次 ──
  private renderHud(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const hud = this.host.addChildPlainNode(root, 'GuardHud', 0, 0, width, height);
    const barW = Math.min(420, width * 0.4);
    const bar = this.host.addChildPlainNode(hud, 'GuardCrystalHpBar', -width / 2 + barW / 2 + 28, height / 2 - 42, barW, 20);
    bar.addComponent(Graphics);
    this.host.addChildLabel(hud, 'GuardCrystalHpText', '', -width / 2 + barW / 2 + 28, height / 2 - 42, 13, rgba(255, 245, 220), new Size(barW, 18));
    this.host.addChildLabel(hud, 'GuardWaveText', '', 0, height / 2 - 42, 20, rgba(255, 232, 160), new Size(width * 0.3, 26));
    this.host.addChildLabel(hud, 'GuardGoldText', '', width / 2 - 170, height / 2 - 42, 20, rgba(255, 214, 92), new Size(240, 26));
    this.host.addChildLabel(hud, 'GuardHintText', '拖动两个相同英雄合成升星 · 同星同名 10% 矿脉共鸣直升 2 星', 0, -height / 2 + 26, 13, rgba(196, 180, 150, 220), new Size(width * 0.7, 18));
    this.host.addChildLabel(hud, 'GuardXpText', '', -width / 2 + 120, height / 2 - 66, 13, rgba(150, 230, 190, 230), new Size(240, 18), HorizontalTextAlignment.LEFT);
    this.host.addChildLabel(hud, 'GuardPreviewText', '', width / 2 - 250, height / 2 - 66, 13, rgba(255, 190, 150, 235), new Size(430, 18), HorizontalTextAlignment.RIGHT);
    // 波次进度轨道(参考图:圆点连线,精英/BOSS 波标骷髅色)
    const track = this.host.addChildPlainNode(hud, 'GuardWaveTrack', 0, height / 2 - 66, 320, 16);
    track.addComponent(Graphics);
    // 场上定位计数(左侧竖排)
    const roles: Array<[string, string]> = [['melee', '近战'], ['ranged', '远程'], ['support', '辅助'], ['control', '控制']];
    roles.forEach(([role, label], index) => {
      const row = this.host.addChildPlainNode(hud, `GuardRoleCount_${role}`, -width / 2 + 74, height / 2 - 110 - index * 26, 130, 22);
      const color = GUARD_ROLE_COLOR[role] ?? rgba(220, 220, 220);
      const dot = row.addComponent(Graphics);
      dot.fillColor = rgba(color.r, color.g, color.b, 235);
      dot.circle(-56, 0, 6);
      dot.fill();
      this.host.addChildLabel(row, 'Text', `${label} 0`, 10, 0, 13, rgba(226, 214, 188, 235), new Size(110, 18), HorizontalTextAlignment.LEFT);
    });
  }

  private refreshWaveTrack(): void {
    const sim = this.sim;
    const hud = this.root?.getChildByName('GuardHud');
    const track = hud?.getChildByName('GuardWaveTrack');
    const g = track?.getComponent(Graphics);
    if (!sim || !track || !g) {
      return;
    }
    const trackW = 320;
    // rush(车轮战)无固定波数,轨道让位给层数文案。
    if (sim.mode === 'rush') {
      g.clear();
      return;
    }
    const step = trackW / (sim.maxWave - 1);
    g.clear();
    g.strokeColor = rgba(120, 96, 60, 200);
    g.lineWidth = 2;
    g.moveTo(-trackW / 2, 0);
    g.lineTo(trackW / 2, 0);
    g.stroke();
    for (let wave = 1; wave <= sim.maxWave; wave += 1) {
      const x = -trackW / 2 + (wave - 1) * step;
      const isElite = wave % 5 === 0 && wave % 10 !== 0;
      const isBoss = wave % 10 === 0;
      const reached = sim.wave >= wave;
      const radius = isBoss ? 7 : isElite ? 6 : 4;
      g.fillColor = isBoss
        ? (reached ? rgba(240, 80, 60, 255) : rgba(120, 46, 40, 235))
        : isElite
          ? (reached ? rgba(255, 170, 80, 255) : rgba(120, 86, 46, 235))
          : (reached ? rgba(255, 214, 110, 255) : rgba(70, 58, 44, 235));
      g.circle(x, 0, radius);
      g.fill();
    }
  }

  private refreshHud(): void {
    const root = this.root;
    const sim = this.sim;
    if (!root || !sim) {
      return;
    }
    const hud = root.getChildByName('GuardHud');
    if (!hud) {
      return;
    }
    const bar = hud.getChildByName('GuardCrystalHpBar');
    const barTransform = bar?.getComponent(UITransform);
    const graphics = bar?.getComponent(Graphics);
    if (bar && barTransform && graphics) {
      const barW = barTransform.width;
      const ratio = Math.max(0, sim.crystalHp / sim.crystalMaxHp);
      graphics.clear();
      graphics.fillColor = rgba(8, 8, 10, 220);
      graphics.roundRect(-barW / 2, -10, barW, 20, 9);
      graphics.fill();
      graphics.fillColor = ratio > 0.35 ? rgba(110, 190, 255, 240) : rgba(240, 90, 70, 245);
      graphics.roundRect(-barW / 2, -10, Math.max(6, barW * ratio), 20, 9);
      graphics.fill();
      graphics.strokeColor = rgba(214, 178, 110, 220);
      graphics.lineWidth = 1.6;
      graphics.roundRect(-barW / 2, -10, barW, 20, 9);
      graphics.stroke();
    }
    const hpText = hud.getChildByName('GuardCrystalHpText')?.getComponent(Label);
    if (hpText) {
      hpText.string = `矿晶水晶 ${Math.ceil(sim.crystalHp)} / ${sim.crystalMaxHp}`;
    }
    const waveText = hud.getChildByName('GuardWaveText')?.getComponent(Label);
    if (waveText) {
      if (sim.mode === 'rush') {
        const leftSec = Math.max(0, Math.ceil((GUARD_RUSH_TIME_LIMIT_MS - sim.timeMs) / 1000));
        waveText.string = `车轮战 层数 ${guardTrialLayers(sim)} · BOSS×${sim.bossKills} · 剩 ${Math.floor(leftSec / 60)}:${String(leftSec % 60).padStart(2, '0')}`;
      } else {
        waveText.string = sim.phase === 'prep'
          ? (sim.wave === 0 ? '首波来袭倒计时…' : `第 ${sim.wave}/${sim.maxWave} 波已清 · 备战中`)
          : `第 ${sim.wave}/${sim.maxWave} 波${sim.wave === sim.maxWave ? ' · BOSS!' : sim.wave % 10 === 0 ? ' · BOSS 节拍!' : ''}`;
      }
    }
    const goldText = hud.getChildByName('GuardGoldText')?.getComponent(Label);
    if (goldText) {
      goldText.string = `战斗金币 ${sim.gold}`;
    }
    const summonLabel = this.root?.getChildByName('GuardSummonButton')?.getChildByName('GuardSummonLabel')?.getComponent(Label);
    if (summonLabel) {
      summonLabel.string = `召唤 ${guardCurrentSummonCost(sim)}`;
    }
    const summonNext = this.root?.getChildByName('GuardSummonButton')?.getChildByName('GuardSummonNext')?.getComponent(Label);
    if (summonNext) {
      summonNext.string = `下次 ${Math.min(300, guardCurrentSummonCost(sim) + 10)}`;
    }
    this.refreshWaveTrack();
    const hudNode = this.root?.getChildByName('GuardHud');
    if (hudNode) {
      const counts: Record<string, number> = { melee: 0, ranged: 0, support: 0, control: 0 };
      for (const hero of sim.heroes) {
        counts[hero.role] = (counts[hero.role] ?? 0) + 1;
      }
      const names: Record<string, string> = { melee: '近战', ranged: '远程', support: '辅助', control: '控制' };
      for (const role of Object.keys(counts)) {
        const label = hudNode.getChildByName(`GuardRoleCount_${role}`)?.getChildByName('Text')?.getComponent(Label);
        if (label) {
          label.string = `${names[role]} ${counts[role]}`;
        }
      }
    }
    const xpText = hud.getChildByName('GuardXpText')?.getComponent(Label);
    if (xpText) {
      xpText.string = `等级 ${sim.level} · 击杀 ${sim.killCount}`;
    }
    const previewText = hud.getChildByName('GuardPreviewText')?.getComponent(Label);
    if (previewText) {
      if (sim.phase === 'prep' && sim.nextWaveSpawns) {
        const names: Record<string, string> = { normal: '小怪', fast: '快速', tank: '肉盾', flying: '飞行', shooter: '远程', elite: '精英', boss: 'BOSS' };
        const summary = guardSummarizeSpawns(sim.nextWaveSpawns);
        previewText.string = '下一波: ' + Object.entries(summary).map(([kind, count]) => `${names[kind] ?? kind}×${count}`).join(' ');
      } else {
        previewText.string = '';
      }
    }
    const enhanceLabel = this.root?.getChildByName('GuardEnhanceButton')?.getChildByName('GuardEnhanceLabel')?.getComponent(Label);
    if (enhanceLabel) {
      enhanceLabel.string = `强化 全队攻击+${sim.enhanceLevel * 8}% · ${sim.enhanceCost}`;
    }
    this.refreshCrystalSkillButton();
  }

  // ── P2:强化按钮(与召唤争夺金币) ──
  private renderEnhanceButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const buttonW = Math.min(210, width * 0.17);
    const button = this.host.addChildPlainNode(root, 'GuardEnhanceButton', width / 2 - buttonW / 2 - 36 - Math.min(240, width * 0.2) - 18, -height / 2 + 64, buttonW, 56);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(52, 44, 70, 245);
    g.roundRect(-buttonW / 2, -28, buttonW, 56, 12);
    g.fill();
    g.strokeColor = rgba(190, 150, 255, 235);
    g.lineWidth = 2;
    g.roundRect(-buttonW / 2, -28, buttonW, 56, 12);
    g.stroke();
    this.host.addChildLabel(button, 'GuardEnhanceLabel', '强化', 0, 0, 18, rgba(230, 214, 255), new Size(buttonW - 10, 24));
    this.host.applyImageButtonFeedback(button);
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      if (!guardEnhance(sim)) {
        this.host.setStatus('战斗金币不足,无法强化。');
      } else {
        this.host.setStatus(`全队攻击强化至 Lv${sim.enhanceLevel}(+${sim.enhanceLevel * 8}%)`);
      }
    }, this);
  }

  // ── P2:水晶技能(矿晶震荡,CD 45s) ──
  private renderCrystalSkillButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const height = this.layoutHeight;
    const button = this.host.addChildPlainNode(root, 'GuardCrystalSkillButton', -this.layoutWidth / 2 + 70, -height / 2 + 70, 88, 88);
    button.addComponent(Graphics);
    this.host.addChildLabel(button, 'GuardCrystalSkillLabel', '矿晶\n震荡', 0, 0, 16, rgba(190, 230, 255), new Size(80, 44));
    this.host.applyImageButtonFeedback(button);
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      if (!guardUseCrystalSkill(sim)) {
        this.host.setStatus('矿晶震荡冷却中…');
      } else {
        this.shakeField(10);
      }
    }, this);
    this.refreshCrystalSkillButton();
  }

  private refreshCrystalSkillButton(): void {
    const sim = this.sim;
    const button = this.root?.getChildByName('GuardCrystalSkillButton');
    const g = button?.getComponent(Graphics);
    if (!sim || !button || !g) {
      return;
    }
    const ready = guardCrystalSkillReady(sim);
    const remain = Math.max(0, sim.crystalSkillReadyMs - sim.timeMs);
    const frac = ready ? 1 : 1 - remain / GUARD_CRYSTAL_SKILL_CD_MS;
    g.clear();
    g.fillColor = ready ? rgba(30, 60, 96, 245) : rgba(22, 26, 34, 235);
    g.circle(0, 0, 42);
    g.fill();
    g.strokeColor = ready ? rgba(140, 220, 255, 250) : rgba(90, 110, 130, 200);
    g.lineWidth = 3;
    g.circle(0, 0, 42);
    g.stroke();
    if (!ready) {
      // CD 弧
      g.strokeColor = rgba(140, 220, 255, 200);
      g.lineWidth = 4;
      g.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, true);
      g.stroke();
    }
  }

  private shakeField(amplitude: number): void {
    const field = this.fieldNode;
    if (!field || !field.isValid) {
      return;
    }
    const base = new Vec3(field.position.x, field.position.y, field.position.z);
    tween(field)
      .to(0.05, { position: new Vec3(base.x + amplitude, base.y - amplitude * 0.5, base.z) })
      .to(0.06, { position: new Vec3(base.x - amplitude * 0.7, base.y + amplitude * 0.4, base.z) })
      .to(0.05, { position: base })
      .start();
  }

  private renderSummonButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const buttonW = Math.min(240, width * 0.2);
    const button = this.host.addChildPlainNode(root, 'GuardSummonButton', width / 2 - buttonW / 2 - 36, -height / 2 + 64, buttonW, 64);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(122, 62, 30, 245);
    g.roundRect(-buttonW / 2, -32, buttonW, 64, 14);
    g.fill();
    g.strokeColor = rgba(255, 200, 110, 240);
    g.lineWidth = 2.2;
    g.roundRect(-buttonW / 2, -32, buttonW, 64, 14);
    g.stroke();
    this.host.addChildLabel(button, 'GuardSummonLabel', '召唤', 0, 8, 24, rgba(255, 238, 190), new Size(buttonW - 12, 30));
    this.host.addChildLabel(button, 'GuardSummonNext', '', 0, -16, 12, rgba(214, 190, 150, 220), new Size(buttonW - 12, 15));
    this.host.applyImageButtonFeedback(button);
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      const unit = guardSummon(sim);
      if (!unit) {
        this.host.setStatus(sim.gold < sim.summonCost ? '战斗金币不足。' : '阵地已满,拖动相同英雄合成腾位。');
      }
    }, this);
  }

  private renderExitButton(parent: Node, width: number, height: number): void {
    const button = this.host.addChildPlainNode(parent, 'GuardExitButton', width / 2 - 34, height / 2 - 34, 44, 44);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(20, 14, 12, 220);
    g.circle(0, 0, 20);
    g.fill();
    g.strokeColor = rgba(214, 178, 110, 220);
    g.lineWidth = 1.8;
    g.circle(0, 0, 20);
    g.stroke();
    this.host.addChildLabel(button, 'GuardExitGlyph', '×', 0, 1, 24, rgba(238, 218, 180), new Size(40, 40));
    this.host.applyImageButtonFeedback(button);
    button.on(Node.EventType.TOUCH_END, () => this.host.returnToLobbyFromBattlePreview(), this);
  }

  // ── 主循环 ──
  private step(): void {
    const sim = this.sim;
    if (!sim || !this.isMounted()) {
      return;
    }
    // 固定步长累积器:一次回调补跑 (真实流逝/TICK_MS) 个子 tick,单次上限 1s 防挂起后雪崩。
    const now = Date.now();
    const elapsed = Math.min(1000, Math.max(TICK_MS, now - this.lastTickWallMs));
    this.lastTickWallMs = now;
    let phase = sim.phase;
    for (let spent = 0; spent < elapsed && phase !== 'victory' && phase !== 'defeat'; spent += TICK_MS) {
      phase = guardTick(sim, TICK_MS);
    }
    this.consumeEvents();
    this.syncHeroes();
    this.syncMonsters();
    this.syncChests();
    this.syncBossCastBar();
    this.syncChoiceOverlay();
    this.refreshHud();
    if (phase === 'victory' || phase === 'defeat') {
      if (this.tickTimer !== null) {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
      }
      this.showEndOverlay(phase === 'victory');
      if (!this.settleRequested) {
        this.settleRequested = true;
        setTimeout(() => this.host.settleLobbyBattleSession(), 700);
      }
    }
  }

  private consumeEvents(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    for (const event of sim.events) {
      if (event.type === 'kill' && typeof event.monsterId === 'number') {
        const view = this.monsterViews.get(event.monsterId);
        if (view && view.node.isValid) {
          this.spawnFloater(view.node.position.x, view.node.position.y + this.unitSize() * 0.5, `+${event.amount ?? 0}`, rgba(255, 214, 92));
        }
      } else if (event.type === 'crystalHit') {
        this.spawnFloater(this.xToPx(0), this.laneToPy(1) + this.layoutHeight * 0.14, `-${event.amount ?? 0}`, rgba(255, 120, 100));
      } else if (event.type === 'superMerge') {
        this.host.setStatus('矿脉共鸣!直升 2 星!');
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnFloater(center.x, center.y + this.unitSize() * 0.6, '矿脉共鸣 +2★', rgba(255, 240, 160));
        }
      } else if (event.type === 'waveStart') {
        this.host.setStatus(`第 ${event.wave} 波来袭!`);
      } else if (event.type === 'chestDrop') {
        this.host.setStatus('精英宝箱掉落!点击开箱!');
      } else if (event.type === 'bossCastStart') {
        this.host.setStatus('BOSS 蓄力轰击水晶!集火打断!');
      } else if (event.type === 'bossCastInterrupt') {
        this.spawnFloater(this.xToPx(5), this.laneToPy(1) + this.layoutHeight * 0.12, '打断!', rgba(255, 240, 160));
        this.shakeField(8);
      } else if (event.type === 'bossCastHit') {
        this.spawnFloater(this.xToPx(0), this.laneToPy(1) + this.layoutHeight * 0.16, `灭世轰击 -${event.amount ?? 0}`, rgba(255, 110, 90));
        this.shakeField(14);
      } else if (event.type === 'crystalSkill') {
        this.spawnFloater(this.xToPx(2), this.laneToPy(1), `矿晶震荡 ${event.amount ?? 0}`, rgba(150, 220, 255));
      } else if (event.type === 'heroAttack') {
        // 攻击动画:怪进入范围出手时播 attack(用户 2026-08-21);技能击追加专属技能特效打在目标身上。
        const hero = sim.heroes.find((entry) => entry.heroCode === event.heroCode && entry.cell === event.cell);
        if (hero) {
          this.playUnitAttack(this.heroViews.get(hero.unitId));
        }
        if (event.skillProc && typeof event.monsterId === 'number') {
          const target = sim.monsters.find((entry) => entry.monsterId === event.monsterId);
          if (target && event.heroCode) {
            this.spawnGuardSkillFx(event.heroCode, target);
            const targetView = this.monsterViews.get(target.monsterId);
            if (targetView && targetView.node.isValid) {
              this.spawnFloater(targetView.node.position.x, targetView.node.position.y + this.unitSize() * 0.6, `技能击 -${event.amount ?? 0}`, rgba(190, 150, 255));
            }
          }
        }
      }
    }
    sim.events.length = 0;
  }

  // ── P2:宝箱(点击→开箱轮盘) ──
  private syncChests(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const liveIds = new Set(sim.chests.map((chest) => chest.chestId));
    for (const [chestId, node] of [...this.chestViews]) {
      if (!liveIds.has(chestId)) {
        if (node.isValid) {
          node.destroy();
        }
        this.chestViews.delete(chestId);
      }
    }
    for (const chest of sim.chests) {
      if (this.chestViews.has(chest.chestId)) {
        continue;
      }
      const size = this.unitSize() * 0.7;
      const node = this.host.addChildPlainNode(field, `GuardChest_${chest.chestId}`, this.xToPx(chest.x), this.laneToPy(chest.lane) - size * 0.2, size, size);
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(140, 96, 40, 250);
      g.roundRect(-size * 0.4, -size * 0.3, size * 0.8, size * 0.55, 6);
      g.fill();
      g.strokeColor = rgba(255, 214, 110, 250);
      g.lineWidth = 2.4;
      g.roundRect(-size * 0.4, -size * 0.3, size * 0.8, size * 0.55, 6);
      g.stroke();
      g.moveTo(-size * 0.4, 0);
      g.lineTo(size * 0.4, 0);
      g.stroke();
      const hint = this.host.addChildLabel(node, 'GuardChestHint', '点击开箱', 0, size * 0.48, 12, rgba(255, 232, 150), new Size(size * 1.6, 16));
      hint.enableOutline = true;
      hint.outlineColor = rgba(40, 24, 10, 255);
      hint.outlineWidth = 2;
      tween(node)
        .repeatForever(tween().to(0.4, { scale: new Vec3(1.08, 1.08, 1) }).to(0.4, { scale: Vec3.ONE }))
        .start();
      this.host.applyImageButtonFeedback(node);
      node.on(Node.EventType.TOUCH_END, () => this.openChestWithWheel(chest.chestId), this);
      this.chestViews.set(chest.chestId, node);
    }
  }

  /** 账号前 3 箱固定 1-3-5 连(localStorage 计数;不可用则跳过脚本)。 */
  private nextChestScriptTier(): 1 | 3 | 5 | undefined {
    try {
      const store = (globalThis as { localStorage?: Storage }).localStorage;
      if (!store) {
        return undefined;
      }
      const opened = Number(store.getItem('lootchainGuardChestScript') ?? '0');
      if (opened >= 3) {
        return undefined;
      }
      store.setItem('lootchainGuardChestScript', String(opened + 1));
      return opened === 0 ? 1 : opened === 1 ? 3 : 5;
    } catch (error) {
      void error;
      return undefined;
    }
  }

  private openChestWithWheel(chestId: number): void {
    const sim = this.sim;
    const root = this.root;
    if (!sim || !root || this.wheelOverlayOpen) {
      return;
    }
    const result = guardOpenChest(sim, chestId, this.nextChestScriptTier());
    if (!result) {
      return;
    }
    this.wheelOverlayOpen = true;
    sim.paused = true;
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const overlay = this.host.addChildPlainNode(root, 'GuardWheelOverlay', 0, 0, width, height);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(8, 6, 6, 190);
    og.rect(-width / 2, -height / 2, width, height);
    og.fill();
    this.host.addChildLabel(overlay, 'GuardWheelTitle', '矿脉宝箱', 0, height * 0.3, 30, rgba(255, 232, 150), new Size(width * 0.6, 40));
    // 轮盘:程序绘制 8 段圆环 + 指针旋转 2.2s 减速停格
    const wheel = this.host.addChildPlainNode(overlay, 'GuardWheel', 0, height * 0.02, 300, 300);
    const wg = wheel.addComponent(Graphics);
    for (let i = 0; i < 8; i += 1) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      wg.fillColor = i % 2 === 0 ? rgba(52, 38, 26, 250) : rgba(34, 26, 20, 250);
      wg.moveTo(0, 0);
      wg.arc(0, 0, 140, a0, a1, false);
      wg.close();
      wg.fill();
    }
    wg.strokeColor = rgba(255, 200, 110, 250);
    wg.lineWidth = 4;
    wg.circle(0, 0, 140);
    wg.stroke();
    const pointer = this.host.addChildLabel(overlay, 'GuardWheelPointer', '▼', 0, height * 0.02 + 158, 26, rgba(255, 214, 92), new Size(40, 32));
    void pointer;
    // 指针不动转盘转:2.2s 缓停(圈数+随机相位由 tier 决定视觉落点,纯演出)
    const turns = 4 + result.tier;
    tween(wheel)
      .to(2.2, { angle: -360 * turns - 45 }, { easing: 'quartOut' })
      .call(() => this.revealChestRewards(overlay, result.tier, result.rewards))
      .start();
  }

  private revealChestRewards(overlay: Node, tier: number, rewards: GuardChestReward[]): void {
    if (!overlay.isValid) {
      return;
    }
    const height = this.layoutHeight;
    const tierLabel = this.host.addChildLabel(overlay, 'GuardWheelTier', tier >= 5 ? '★ 5 连大奖!★' : tier >= 3 ? '3 连奖!' : '奖励', 0, -height * 0.16, tier >= 5 ? 34 : 24, tier >= 5 ? rgba(255, 220, 90) : rgba(255, 236, 180), new Size(this.layoutWidth * 0.6, 44));
    tierLabel.enableOutline = true;
    tierLabel.outlineColor = rgba(60, 30, 10, 255);
    tierLabel.outlineWidth = 3;
    if (tier >= 5) {
      this.shakeField(12);
    }
    rewards.forEach((reward, index) => {
      const label = this.host.addChildLabel(overlay, `GuardWheelReward_${index}`, reward.label, 0, -height * 0.16 - 34 - index * 26, 17, rgba(236, 224, 196), new Size(this.layoutWidth * 0.6, 22));
      const opacity = label.node.addComponent(UIOpacity);
      opacity.opacity = 0;
      tween(opacity).delay(0.18 * index).to(0.2, { opacity: 255 }).start();
    });
    const close = this.host.addChildPlainNode(overlay, 'GuardWheelClose', 0, -height * 0.34, 200, 52);
    const g = close.addComponent(Graphics);
    g.fillColor = rgba(122, 62, 30, 245);
    g.roundRect(-100, -26, 200, 52, 12);
    g.fill();
    g.strokeColor = rgba(255, 200, 110, 240);
    g.lineWidth = 2;
    g.roundRect(-100, -26, 200, 52, 12);
    g.stroke();
    this.host.addChildLabel(close, 'GuardWheelCloseLabel', '收下', 0, 0, 19, rgba(255, 238, 190), new Size(180, 24));
    this.host.applyImageButtonFeedback(close);
    close.on(Node.EventType.TOUCH_END, () => {
      if (overlay.isValid) {
        overlay.destroy();
      }
      this.wheelOverlayOpen = false;
      if (this.sim) {
        this.sim.paused = false;
      }
      this.lastTickWallMs = Date.now();
    }, this);
  }

  // ── P2:升级三选一(pendingChoice 即暂停) ──
  private syncChoiceOverlay(): void {
    const sim = this.sim;
    const root = this.root;
    if (!sim || !root) {
      return;
    }
    const existing = root.getChildByName('GuardChoiceOverlay');
    if (!sim.pendingChoice) {
      if (existing) {
        existing.destroy();
        this.choiceOverlayLevel = 0;
        this.lastTickWallMs = Date.now();
      }
      return;
    }
    if (existing && this.choiceOverlayLevel === sim.level) {
      return;
    }
    existing?.destroy();
    this.choiceOverlayLevel = sim.level;
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const overlay = this.host.addChildPlainNode(root, 'GuardChoiceOverlay', 0, 0, width, height);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(8, 6, 6, 190);
    og.rect(-width / 2, -height / 2, width, height);
    og.fill();
    this.host.addChildLabel(overlay, 'GuardChoiceTitle', `等级提升!Lv${sim.level} · 三选一`, 0, height * 0.28, 28, rgba(255, 232, 150), new Size(width * 0.7, 38));
    const cardW = Math.min(230, width * 0.2);
    const cardH = 190;
    sim.pendingChoice.forEach((option, index) => {
      const x = (index - 1) * (cardW + 26);
      const card = this.host.addChildPlainNode(overlay, `GuardChoiceCard_${index}`, x, height * 0.02, cardW, cardH);
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(30, 24, 20, 250);
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
      g.fill();
      g.strokeColor = rgba(214, 200, 176, 235);
      g.lineWidth = 2;
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
      g.stroke();
      const title = this.host.addChildLabel(card, 'Title', option.title, 0, cardH * 0.22, 18, rgba(255, 240, 200), new Size(cardW - 16, 48));
      title.overflow = Label.Overflow.SHRINK;
      const detail = this.host.addChildLabel(card, 'Detail', option.detail, 0, -cardH * 0.08, 13, rgba(196, 184, 160, 230), new Size(cardW - 20, 40));
      detail.overflow = Label.Overflow.SHRINK;
      const banish = this.host.addChildLabel(card, 'Banish', sim.banishLeft > 0 ? '✕ 放逐' : '', 0, -cardH * 0.36, 12, rgba(255, 140, 120, 220), new Size(cardW - 20, 16));
      this.host.applyImageButtonFeedback(card);
      card.on(Node.EventType.TOUCH_END, (event: { getUILocation?: () => { y: number } }) => {
        // 底部 1/4 点击=放逐;其余=选择。
        const uiY = event.getUILocation ? event.getUILocation().y : Number.NaN;
        void uiY;
        guardChooseOption(sim, index);
      }, this);
      banish.node.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
        if (sim.banishLeft > 0) {
          guardBanishChoice(sim, index);
          this.choiceOverlayLevel = 0;
        }
        if (event) {
          event.propagationStopped = true;
        }
      }, this);
    });
    // 跳过 / 刷新
    const makeSmall = (name: string, text: string, x: number, onTap: () => void): void => {
      const button = this.host.addChildPlainNode(overlay, name, x, -height * 0.24, 170, 46);
      const g = button.addComponent(Graphics);
      g.fillColor = rgba(40, 34, 30, 245);
      g.roundRect(-85, -23, 170, 46, 10);
      g.fill();
      g.strokeColor = rgba(196, 168, 120, 220);
      g.lineWidth = 1.6;
      g.roundRect(-85, -23, 170, 46, 10);
      g.stroke();
      this.host.addChildLabel(button, `${name}Label`, text, 0, 0, 15, rgba(230, 216, 186), new Size(160, 20));
      this.host.applyImageButtonFeedback(button);
      button.on(Node.EventType.TOUCH_END, onTap, this);
    };
    makeSmall('GuardChoiceSkip', '跳过(+50 金币)', -100, () => {
      guardSkipChoice(sim);
    });
    makeSmall('GuardChoiceReroll', `刷新(剩 ${sim.rerollLeft})`, 100, () => {
      if (guardRerollChoice(sim)) {
        this.choiceOverlayLevel = 0;
      } else {
        this.host.setStatus('刷新次数已用完。');
      }
    });
  }

  // ── P2:BOSS 读条条(集火打断) ──
  private syncBossCastBar(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const existing = field.getChildByName('GuardBossCastBar');
    if (!sim.bossCast) {
      existing?.destroy();
      return;
    }
    const boss = sim.monsters.find((monster) => monster.monsterId === sim.bossCast?.monsterId && !monster.dead);
    if (!boss) {
      existing?.destroy();
      return;
    }
    const barW = 200;
    const barH = 14;
    const x = this.xToPx(boss.x);
    const y = this.laneToPy(boss.lane) + this.unitSize() * (boss.kind === 'boss' ? 1.6 : 1);
    let bar = existing;
    if (!bar) {
      bar = this.host.addChildPlainNode(field, 'GuardBossCastBar', x, y, barW, barH + 22);
      bar.addComponent(Graphics);
      this.host.addChildLabel(bar, 'GuardBossCastText', '', 0, barH + 4, 12, rgba(255, 180, 150), new Size(barW + 80, 16));
    }
    bar.setPosition(x, y, 0);
    const g = bar.getComponent(Graphics);
    if (g) {
      const progress = Math.min(1, (sim.timeMs - sim.bossCast.startMs) / Math.max(1, sim.bossCast.hitMs - sim.bossCast.startMs));
      g.clear();
      g.fillColor = rgba(10, 8, 8, 220);
      g.roundRect(-barW / 2, -barH / 2, barW, barH, 6);
      g.fill();
      g.fillColor = rgba(235, 70, 50, 245);
      g.roundRect(-barW / 2, -barH / 2, Math.max(4, barW * progress), barH, 6);
      g.fill();
      g.strokeColor = rgba(255, 210, 160, 235);
      g.lineWidth = 1.6;
      g.roundRect(-barW / 2, -barH / 2, barW, barH, 6);
      g.stroke();
    }
    const text = bar.getChildByName('GuardBossCastText')?.getComponent(Label);
    if (text) {
      const pct = Math.round((sim.bossCast.damageTaken / Math.max(1, sim.bossCast.threshold)) * 100);
      text.string = `灭世轰击蓄力中 · 集火打断 ${Math.min(100, pct)}%`;
    }
  }

  private spawnFloater(x: number, y: number, text: string, color: Color): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const label = this.host.addChildLabel(field, 'GuardFloater', text, x, y, 16, color, new Size(160, 22));
    label.node.setSiblingIndex(field.children.length - 1);
    const opacity = label.node.addComponent(UIOpacity);
    opacity.opacity = 235;
    tween(label.node).by(0.7, { position: new Vec3(0, 26, 0) }).start();
    tween(opacity).delay(0.35).to(0.35, { opacity: 0 }).call(() => {
      if (label.node.isValid) {
        label.node.destroy();
      }
    }).start();
  }

  // ── 英雄视图 ──
  private syncHeroes(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const liveIds = new Set(sim.heroes.map((hero) => hero.unitId));
    for (const [unitId, view] of [...this.heroViews]) {
      if (!liveIds.has(unitId)) {
        if (view.node.isValid) {
          view.node.destroy();
        }
        this.heroViews.delete(unitId);
      }
    }
    for (const hero of sim.heroes) {
      let view = this.heroViews.get(hero.unitId);
      if (!view) {
        view = this.createHeroView(hero);
        this.heroViews.set(hero.unitId, view);
      }
      if (!view.node.isValid) {
        continue;
      }
      if (this.dragFromCell !== hero.cell) {
        const center = this.cellCenter(hero.cell);
        view.node.setPosition(center.x, center.y, 0);
      }
      const starLabel = view.node.getChildByName('GuardHeroStar')?.getComponent(Label);
      if (starLabel) {
        starLabel.string = '★'.repeat(hero.star);
      }
      if (this.rangeShownUnitId === hero.unitId) {
        this.drawRangeIndicator(hero);
      }
      const attackLabel = view.node.getChildByName('GuardHeroAtk')?.getComponent(Label);
      if (attackLabel) {
        attackLabel.string = `${guardHeroAttackValue(sim, hero)}`;
      }
    }
  }

  private createHeroView(hero: GuardHeroUnit): GuardUnitView {
    const field = this.fieldNode;
    const size = this.unitSize();
    const center = this.cellCenter(hero.cell);
    const node = this.host.addChildPlainNode(field ?? this.host.node, `GuardHero_${hero.unitId}`, center.x, center.y, size, size);
    const pool = this.sim?.pool.find((entry) => entry.heroCode === hero.heroCode);
    const roleColor = GUARD_ROLE_COLOR[hero.role] ?? rgba(220, 220, 220);
    // 底座色环(职业色)
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(roleColor.r, roleColor.g, roleColor.b, 200);
    g.lineWidth = 2;
    g.ellipse(0, -size * 0.42, size * 0.34, size * 0.08);
    g.stroke();
    // 骨骼(异步),回退色块+名字
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    const fallback = this.host.addChildPlainNode(node, 'GuardHeroFallback', 0, 0, size * 0.62, size * 0.8);
    const fg = fallback.addComponent(Graphics);
    fg.fillColor = rgba(roleColor.r, roleColor.g, roleColor.b, 130);
    fg.roundRect(-size * 0.31, -size * 0.4, size * 0.62, size * 0.8, 8);
    fg.fill();
    const pendingView: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '' };
    this.attachUnitSpine(node, fallback, ally, size, false, pendingView);
    this.host.addChildLabel(node, 'GuardHeroName', `${pool?.displayName ?? hero.heroCode}·${GUARD_ROLE_LABEL[hero.role] ?? ''}`, 0, size * 0.56, 11, rgba(236, 224, 196), new Size(size * 1.4, 14));
    const star = this.host.addChildLabel(node, 'GuardHeroStar', '★', 0, size * 0.44, 12, rgba(255, 220, 110), new Size(size * 1.2, 14));
    star.enableOutline = true;
    star.outlineColor = rgba(40, 24, 10, 255);
    star.outlineWidth = 2;
    this.host.addChildLabel(node, 'GuardHeroAtk', '', 0, -size * 0.55, 11, rgba(214, 196, 156, 220), new Size(size, 13));
    this.bindHeroDrag(node, hero.unitId);
    return pendingView;
  }

  /** 骨骼挂载(英雄用 snapshot ally 解析;怪物用 spine/monster/<code> 直连);失败保留回退色块。 */
  private attachUnitSpine(node: Node, fallback: Node, ally: BattlePresentationUnitSnapshot | null, size: number, mirror: boolean, view?: GuardUnitView): void {
    const resource = ally ? resolveBattleUnitSpineResource(ally) : null;
    if (!resource) {
      return;
    }
    this.loadSpineInto(node, fallback, resource, size, mirror, view);
  }

  private loadSpineInto(node: Node, fallback: Node, resource: string, size: number, mirror: boolean, view?: GuardUnitView): void {
    const spineNode = this.host.addChildPlainNode(node, 'GuardUnitSpine', 0, -size * 0.36, size, size * 1.1);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    // 兜底直载:共享缓存层的在途合并队列若丢回调(极端环境观测到过)会永久悬空——4s 未回来就绕过缓存直载一次。
    let delivered = false;
    const applyData = (data: sp.SkeletonData | null): void => {
      if (delivered) {
        return;
      }
      delivered = true;
      if (!node.isValid || !spineNode.isValid) {
        return;
      }
      if (!data) {
        return;
      }
      try {
        const runtimeData = resolveBattleUnitSpineRuntimeData(data);
        const names = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
        if (!runtimeData || names.length === 0) {
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        skeleton.skeletonData = data;
        const idle = names.find((name) => /idle|stand|daiji|wait/i.test(name)) ?? names[0];
        skeleton.setAnimation(0, idle, true);
        // act 系骨骼 bounds 常虚标(截图验收:断刃佣兵缩成小人)——rawHeight 钳到 [140,1200] 再 fit。
        const rawHeight = Math.min(1200, Math.max(140, Number(runtimeData.height) || 300));
        const fit = (size * 1.05) / rawHeight;
        spineNode.setScale(mirror ? -fit : fit, fit, 1);
        if (view) {
          view.skeleton = skeleton;
          view.idleAnim = idle;
          view.attackAnim = names.find((name) => /atk|attack|gongji|skill|普攻/i.test(name) && !/hit|hurt|dead|die/i.test(name)) ?? idle;
          view.spineReady = true;
        }
        if (fallback.isValid) {
          fallback.destroy();
        }
      } catch (error) {
        console.warn('[GuardBattle] spine attach failed', resource, error);
      }
    };
    loadSharedSpineData(resource, null, 'GuardBattle', applyData);
    setTimeout(() => {
      if (!delivered && node.isValid) {
        resources.load(resource, sp.SkeletonData, (error: Error | null, data: sp.SkeletonData | null) => {
          if (!error && data) {
            applyData(data);
          }
        });
      }
    }, 4000);
  }

  /** 攻击动画:播一次 attack 再接回 idle(骨骼未就绪时静默跳过)。 */
  private playUnitAttack(view: GuardUnitView | undefined): void {
    if (!view || !view.spineReady || !view.skeleton || !view.skeleton.isValid || view.attackAnim === view.idleAnim) {
      return;
    }
    try {
      view.skeleton.setAnimation(0, view.attackAnim, false);
      view.skeleton.addAnimation(0, view.idleAnim, true, 0);
    } catch (error) {
      void error;
    }
  }

  // ── 点击英雄显示攻击范围(近战=本车道段,远程/控制/辅助=全车道横带)──
  private drawRangeIndicator(hero: GuardHeroUnit): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    field.getChildByName('GuardRangeIndicator')?.destroy();
    const profile = GUARD_ROLE_PROFILE[hero.role];
    const heroX = guardCellX(hero.cell);
    const left = this.xToPx(Math.max(0, heroX - profile.rangeCells));
    const right = this.xToPx(Math.min(GUARD_SPAWN_X, heroX + profile.rangeCells));
    const laneHeight = this.layoutHeight * 0.185;
    const layer = this.host.addChildPlainNode(field, 'GuardRangeIndicator', 0, 0, 10, 10);
    layer.setSiblingIndex(1);
    const g = layer.addComponent(Graphics);
    const bandTop = profile.laneLocked ? this.laneToPy(guardCellLane(hero.cell)) + laneHeight / 2 : this.laneToPy(0) + laneHeight / 2;
    const bandBottom = profile.laneLocked ? this.laneToPy(guardCellLane(hero.cell)) - laneHeight / 2 : this.laneToPy(GUARD_GRID_ROWS - 1) - laneHeight / 2;
    g.fillColor = rgba(120, 230, 110, 44);
    g.roundRect(left, bandBottom, right - left, bandTop - bandBottom, 10);
    g.fill();
    g.strokeColor = rgba(150, 240, 130, 190);
    g.lineWidth = 2;
    g.roundRect(left, bandBottom, right - left, bandTop - bandBottom, 10);
    g.stroke();
    // 选中格绿色高亮(参考图)
    const center = this.cellCenter(hero.cell);
    const cellSize = this.unitSize() * 1.05;
    g.strokeColor = rgba(150, 240, 110, 240);
    g.lineWidth = 3;
    g.roundRect(center.x - cellSize / 2, center.y - cellSize / 2, cellSize, cellSize, 10);
    g.stroke();
  }

  private clearRangeIndicator(): void {
    this.rangeShownUnitId = null;
    this.fieldNode?.getChildByName('GuardRangeIndicator')?.destroy();
  }

  // ── 技能击特效:该英雄专属技能特效打在目标怪身上(包围盒实测适配,缓存;同屏≤3)──
  private spawnGuardSkillFx(heroCode: string, monster: GuardMonster): void {
    const field = this.fieldNode;
    if (!field || this.guardFxLiveCount >= 3) {
      return;
    }
    const pool = this.sim?.pool.find((entry) => entry.heroCode === heroCode);
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    const spec: BattleSkillEffectSpec = resolveHeroUltEffect(heroCode, ally?.heroClass ?? null);
    const monsterScale = GUARD_MONSTER_DISPLAY_SCALE[monster.kind] ?? 1;
    const desired = this.unitSize() * Math.min(3, Math.max(1, monsterScale)) * 1.3;
    const x = this.xToPx(monster.x);
    const y = this.laneToPy(monster.lane) + this.monsterJitterY(monster) + this.unitSize() * 0.1;
    const node = this.host.addChildPlainNode(field, 'GuardSkillFx', x, y, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const skeleton = node.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    this.guardFxLiveCount += 1;
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      this.guardFxLiveCount = Math.max(0, this.guardFxLiveCount - 1);
      if (node.isValid) {
        node.destroy();
      }
    };
    loadSharedSpineData(resolveBattleSkillEffectResource(spec), null, 'GuardSkillFx', (data) => {
      if (!node.isValid || !data) {
        release();
        return;
      }
      try {
        const runtimeData = resolveBattleUnitSpineRuntimeData(data);
        const names = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
        if (!runtimeData || names.length === 0) {
          release();
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        const wanted = spec.animation.trim().toLowerCase();
        const animationName = names.find((name) => name.toLowerCase() === wanted)
          ?? names.find((name) => name.toLowerCase().includes(wanted))
          ?? names[0];
        skeleton.skeletonData = data;
        const extent = this.measureGuardFxExtent(skeleton, animationName, `${spec.effect}:${animationName}`);
        const fit = (desired / Math.max(8, extent ?? 1100)) * (spec.scale || 1);
        node.setScale(fit, fit, 1);
        skeleton.setAnimation(0, animationName, false);
        skeleton.setCompleteListener(() => release());
      } catch (error) {
        void error;
        release();
      }
    });
    tween(node).delay(2.2).call(release).start();
  }

  /** 采样动画 3 时刻,遍历 Region/Mesh 附件求 AABB 长边(按套缓存;测不出返回 null 走 1100 兜底)。 */
  private measureGuardFxExtent(skeleton: sp.Skeleton, animationName: string, cacheKey: string): number | null {
    if (this.guardFxBoundsCache.has(cacheKey)) {
      return this.guardFxBoundsCache.get(cacheKey) ?? null;
    }
    let extent: number | null = null;
    try {
      skeleton.setAnimation(0, animationName, false);
      const raw = (skeleton as unknown as { _skeleton?: unknown })._skeleton as {
        slots?: Array<{ getAttachment?: () => unknown; bone?: unknown }>;
        updateWorldTransform?: () => void;
      } | undefined;
      const duration = Math.max(0.2, skeleton.findAnimation(animationName)?.duration ?? 1);
      if (raw && raw.slots) {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let lastTime = 0;
        for (const ratio of [0.25, 0.5, 0.8]) {
          const targetTime = duration * ratio;
          skeleton.updateAnimation(Math.max(0, targetTime - lastTime));
          lastTime = targetTime;
          raw.updateWorldTransform?.();
          for (const slot of raw.slots ?? []) {
            const attachment = slot.getAttachment?.() as {
              computeWorldVertices?: (...args: unknown[]) => void;
              width?: number;
              worldVerticesLength?: number;
            } | null | undefined;
            if (!attachment || typeof attachment.computeWorldVertices !== 'function') {
              continue;
            }
            let verts: number[] | null = null;
            if (typeof attachment.width === 'number') {
              verts = new Array<number>(8).fill(0);
              attachment.computeWorldVertices(slot.bone, verts, 0, 2);
            } else if (typeof attachment.worldVerticesLength === 'number' && attachment.worldVerticesLength > 0) {
              const count = attachment.worldVerticesLength;
              verts = new Array<number>(count).fill(0);
              attachment.computeWorldVertices(slot, 0, count, verts, 0, 2);
            }
            if (!verts) {
              continue;
            }
            for (let i = 0; i + 1 < verts.length; i += 2) {
              if (!Number.isFinite(verts[i]) || !Number.isFinite(verts[i + 1])) {
                continue;
              }
              minX = Math.min(minX, verts[i]);
              maxX = Math.max(maxX, verts[i]);
              minY = Math.min(minY, verts[i + 1]);
              maxY = Math.max(maxY, verts[i + 1]);
            }
          }
        }
        if (Number.isFinite(minX) && maxX - minX > 8 && maxY - minY > 8) {
          extent = Math.max(maxX - minX, maxY - minY);
        }
      }
    } catch (error) {
      void error;
      extent = null;
    }
    this.guardFxBoundsCache.set(cacheKey, extent);
    return extent;
  }

  /** 怪物散布抖动(monsterId 哈希,确定性,不耗 rng):同车道内 ±0.32 车道高,摆脱"一条直线"。 */
  private monsterJitterY(monster: GuardMonster): number {
    const hash = (monster.monsterId * 2654435761) >>> 0;
    return (((hash % 1000) / 1000) - 0.5) * this.layoutHeight * 0.185 * 0.64;
  }

  private bindHeroDrag(node: Node, unitId: number): void {
    node.on(Node.EventType.TOUCH_START, () => {
      const hero = this.sim?.heroes.find((entry) => entry.unitId === unitId);
      if (hero) {
        this.dragFromCell = hero.cell;
        node.setSiblingIndex((this.fieldNode?.children.length ?? 2) - 1);
        // 点击英雄显示攻击范围(用户 2026-08-21);拖走或点别人时刷新/清除。
        this.rangeShownUnitId = unitId;
        this.drawRangeIndicator(hero);
      }
    }, this);
    node.on(Node.EventType.TOUCH_MOVE, (event: { getUIDelta?: () => { x: number; y: number }; getDeltaX?: () => number; getDeltaY?: () => number }) => {
      if (this.dragFromCell === null || !node.isValid) {
        return;
      }
      const deltaX = event.getUIDelta ? event.getUIDelta().x : event.getDeltaX ? event.getDeltaX() : 0;
      const deltaY = event.getUIDelta ? event.getUIDelta().y : event.getDeltaY ? event.getDeltaY() : 0;
      node.setPosition(node.position.x + deltaX, node.position.y + deltaY, 0);
    }, this);
    const finishDrag = () => {
      const sim = this.sim;
      if (!sim || this.dragFromCell === null) {
        return;
      }
      const fromCell = this.dragFromCell;
      this.dragFromCell = null;
      if (!node.isValid) {
        return;
      }
      const targetCell = this.cellAtPosition(node.position.x, node.position.y);
      if (targetCell !== null) {
        const action = guardDragTo(sim, fromCell, targetCell);
        if (action === 'none' && guardFindHeroAt(sim, targetCell)) {
          this.host.setStatus('只有同名同星英雄才能合成。');
        }
        if (action !== 'none') {
          this.clearRangeIndicator();
        }
      }
      const stillThere = sim.heroes.find((entry) => entry.unitId === unitId);
      if (this.rangeShownUnitId === unitId && stillThere) {
        this.drawRangeIndicator(stillThere);
      } else if (this.rangeShownUnitId === unitId) {
        this.clearRangeIndicator();
      }
      this.syncHeroes();
    };
    node.on(Node.EventType.TOUCH_END, finishDrag, this);
    node.on(Node.EventType.TOUCH_CANCEL, finishDrag, this);
  }

  // ── 怪物视图 ──
  private syncMonsters(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const liveIds = new Set(sim.monsters.map((monster) => monster.monsterId));
    for (const [monsterId, view] of [...this.monsterViews]) {
      if (!liveIds.has(monsterId)) {
        if (view.node.isValid) {
          view.node.destroy();
        }
        this.monsterViews.delete(monsterId);
      }
    }
    for (const monster of sim.monsters) {
      let view = this.monsterViews.get(monster.monsterId);
      if (!view) {
        view = this.createMonsterView(monster);
        this.monsterViews.set(monster.monsterId, view);
      }
      if (!view.node.isValid) {
        continue;
      }
      const flyLift = monster.kind === 'flying' ? this.unitSize() * 0.45 : 0;
      // 区域化散布:同车道内确定性 y 抖动(±0.32 车道高)+ sim 侧速度抖动,怪群成片不成线。
      const jitterY = monster.kind === 'boss' ? 0 : this.monsterJitterY(monster);
      view.node.setPosition(this.xToPx(monster.x), this.laneToPy(monster.lane) + jitterY + flyLift, 0);
      if (monster.dead) {
        // 死亡:淡出下沉一次
        if (view.lastAnimKey !== 'dead') {
          view.lastAnimKey = 'dead';
          const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
          tween(opacity).to(0.5, { opacity: 0 }).start();
          tween(view.node).by(0.5, { position: new Vec3(0, -12, 0) }).start();
        }
        continue;
      }
      const hpBar = view.node.getChildByName('GuardMonsterHp');
      const hpGraphics = hpBar?.getComponent(Graphics);
      const hpTransform = hpBar?.getComponent(UITransform);
      if (hpBar && hpGraphics && hpTransform) {
        const barW = hpTransform.width;
        const ratio = Math.max(0, monster.hp / monster.maxHp);
        hpGraphics.clear();
        hpGraphics.fillColor = rgba(8, 8, 10, 210);
        hpGraphics.rect(-barW / 2, -3, barW, 6);
        hpGraphics.fill();
        hpGraphics.fillColor = monster.kind === 'boss' ? rgba(235, 60, 45, 250) : monster.kind === 'elite' ? rgba(255, 150, 60, 240) : rgba(224, 82, 64, 230);
        hpGraphics.rect(-barW / 2, -3, Math.max(1, barW * ratio), 6);
        hpGraphics.fill();
      }
    }
  }

  private createMonsterView(monster: GuardMonster): GuardUnitView {
    const field = this.fieldNode;
    const baseSize = this.unitSize() * (GUARD_MONSTER_DISPLAY_SCALE[monster.kind] ?? 1);
    const node = this.host.addChildPlainNode(field ?? this.host.node, `GuardMonster_${monster.monsterId}`, this.xToPx(monster.x), this.laneToPy(monster.lane), baseSize, baseSize);
    const fallback = this.host.addChildPlainNode(node, 'GuardMonsterFallback', 0, 0, baseSize * 0.6, baseSize * 0.7);
    const g = fallback.addComponent(Graphics);
    g.fillColor = monster.kind === 'boss' ? rgba(190, 70, 60, 200) : monster.kind === 'elite' ? rgba(200, 130, 60, 190) : rgba(120, 96, 88, 180);
    g.roundRect(-baseSize * 0.3, -baseSize * 0.35, baseSize * 0.6, baseSize * 0.7, 8);
    g.fill();
    // 怪物朝左走:素材原始朝右为主,镜像面向水晶。目录名≠文件基名,走映射表。
    const view: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '' };
    this.loadSpineInto(node, fallback, guardMonsterSpineResource(monster.spineCode), baseSize, true, view);
    const hpBar = this.host.addChildPlainNode(node, 'GuardMonsterHp', 0, baseSize * 0.52, Math.min(baseSize * 0.9, monster.kind === 'boss' ? 220 : 110), 6);
    hpBar.addComponent(Graphics);
    return view;
  }

  // ── 终局覆盖层与结算 ──
  private showEndOverlay(victory: boolean): void {
    if (this.overlayShown || !this.root) {
      return;
    }
    this.overlayShown = true;
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const overlay = this.host.addChildPlainNode(this.root, 'GuardEndOverlay', 0, 0, width, height);
    const g = overlay.addComponent(Graphics);
    g.fillColor = rgba(8, 6, 6, 176);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    const sim = this.sim;
    const rush = sim?.mode === 'rush';
    const title = rush ? '试炼结束!' : victory ? '守卫成功!' : '水晶破碎…';
    const detail = sim
      ? rush
        ? `层数 ${guardTrialLayers(sim)}(BOSS×${sim.bossKills} + 波次 ${sim.wave})· 击杀 ${sim.killCount} · 用时 ${Math.round(sim.timeMs / 1000)} 秒`
        : `坚守 ${sim.wave} 波 · 击杀 ${sim.killCount} · 用时 ${Math.round(sim.timeMs / 1000)} 秒`
      : '';
    this.host.addChildLabel(overlay, 'GuardEndTitle', title, 0, height * 0.12, 40, victory || rush ? rgba(255, 232, 150) : rgba(255, 150, 130), new Size(width * 0.8, 52));
    this.host.addChildLabel(overlay, 'GuardEndDetail', detail, 0, height * 0.045, 17, rgba(226, 210, 180), new Size(width * 0.8, 24));
    this.host.addChildLabel(overlay, 'GuardEndSettle', '正在提交结算…', 0, -height * 0.03, 15, rgba(196, 182, 152), new Size(width * 0.7, 20));
  }

  /** 结算回执到达:更新覆盖层为奖励与返回按钮。 */
  private refreshEndOverlay(): void {
    const root = this.root;
    if (!root || !this.overlayShown) {
      return;
    }
    const battleState = this.host.currentLobbyBattleState();
    const overlay = root.getChildByName('GuardEndOverlay');
    if (!overlay) {
      return;
    }
    const settleLabel = overlay.getChildByName('GuardEndSettle')?.getComponent(Label);
    if (battleState.settling && settleLabel) {
      settleLabel.string = '正在提交结算…';
      return;
    }
    if (battleState.error && settleLabel) {
      settleLabel.string = `结算失败:${battleState.error}`;
    }
    const settlement = battleState.settlement;
    if (!settlement || overlay.getChildByName('GuardEndBack')) {
      return;
    }
    if (settleLabel) {
      settleLabel.string = settlement.message || (settlement.rewardGranted ? '奖励已发放。' : '本场未产生奖励。');
    }
    const rewards = (settlement.rewardItems ?? []).slice(0, 6).map((item) => `${item.resourceName ?? item.resourceCode} ×${item.amount}`).join('  ');
    if (rewards) {
      this.host.addChildLabel(overlay, 'GuardEndRewards', rewards, 0, -this.layoutHeight * 0.09, 16, rgba(255, 226, 150), new Size(this.layoutWidth * 0.8, 22));
    }
    const back = this.host.addChildPlainNode(overlay, 'GuardEndBack', 0, -this.layoutHeight * 0.18, 220, 56);
    const g = back.addComponent(Graphics);
    g.fillColor = rgba(122, 62, 30, 245);
    g.roundRect(-110, -28, 220, 56, 12);
    g.fill();
    g.strokeColor = rgba(255, 200, 110, 240);
    g.lineWidth = 2;
    g.roundRect(-110, -28, 220, 56, 12);
    g.stroke();
    this.host.addChildLabel(back, 'GuardEndBackLabel', '返回大厅', 0, 0, 20, rgba(255, 238, 190), new Size(200, 26));
    this.host.applyImageButtonFeedback(back);
    back.on(Node.EventType.TOUCH_END, () => this.host.returnToLobbyFromBattlePreview(), this);
  }
}
