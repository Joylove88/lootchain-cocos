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
  SpriteFrame,
  Texture2D,
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
  guardSellHero,
  guardSummarizeSpawns,
  guardSummon,
  guardTick,
  guardTrialLayers,
  guardUseCrystalSkill,
  guardMonsterSpineResource,
  GUARD_CELL_UNLOCK_EVERY,
  GUARD_START_CELLS,
  guardCellFromUnlockRank,
  guardCellUnlockRank,
  GUARD_CRYSTAL_REACH_X,
  GUARD_CRYSTAL_SKILL_CD_MS,
  GUARD_ENHANCE_ATK_PCT,
  GUARD_MAX_STAR,
  GUARD_GRID_CELLS,
  GUARD_GRID_COLS,
  GUARD_GRID_ROWS,
  GUARD_HERO_SKILL,
  GUARD_MONSTER_DB_SCALE,
  GUARD_MONSTER_DISPLAY_SCALE,
  GUARD_ROLE_PROFILE,
  GUARD_RUSH_TIME_LIMIT_MS,
  GUARD_SPAWN_X,
  resolveGuardRole,
  type GuardBattleState,
  type GuardChestReward,
  type GuardZone,
  type GuardHeroUnit,
  type GuardMonster,
  type GuardPoolHero,
} from './GuardBattleModel';
import { resolveLobbyBattlePresentationSnapshot, type BattlePresentationSnapshot, type BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import {
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineAnimationNames,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpinePrimaryAsset,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
} from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import { resolveBattleSkillEffectResource, resolveHeroUltEffect, type BattleSkillEffectSpec } from './LobbyBattleSkillEffectConfig';

/** 守卫场逐英雄体型微调(乘在共享 EXTRA 表之上):罗恩共享表 1.55 后格子里仍偏小,守卫再 +20%(2026-09-02 用户)。 */
const GUARD_HERO_SCALE_TWEAK_BY_ASSET: Record<string, number> = {
  Eulenspigel: 1.2,
};

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
/** 显式束状特效名单(包围盒宽高比判不准的,如凤凰焚世=大花瓣包裹的火柱):必须锚英雄身前沿目标方向喷射。 */
/** 水晶技能渲染开关(2026-09-02 用户拍板:先隐藏,机制保留)。 */
const GUARD_CRYSTAL_SKILL_HIDDEN = true;
const GUARD_BEAM_EFFECT_CODES = new Set(['fx_5601_fenghuang_skill']);
/** 束状根部视觉内缩(素材 AABB 左缘外圈是淡出羽尾,亮部起点在盒内一段;按比例内缩让亮部贴炮口)。逐特效标定。 */
const GUARD_BEAM_ROOT_INSET: Record<string, number> = { fx_5601_fenghuang_skill: 0.2 };
/** 同英雄技能特效表现冷却(视频验收:束状几乎常驻屏幕,视觉疲劳)。 */
const GUARD_HERO_FX_COOLDOWN_MS = 1600;
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
  /** 死亡动画名(怪物,有则死亡时播放)。 */
  deathAnim: string;
  /** 受击红闪截止时刻(打击感,2026-08-26)。 */
  hitFlashUntil: number;
}

/** 普攻弹幕(轻量 Graphics 弹体,归巢飞向目标;打击感系统 2026-08-26)。crystalTarget=BOSS 暗弹;visualOnly=保底技能弹(命中不出飘字)。 */
interface GuardProjectile {
  node: Node;
  targetId: number;
  x: number;
  y: number;
  amount: number;
  color: Color;
  crystalTarget?: boolean;
  visualOnly?: boolean;
  scale?: number;
}
const GUARD_HIT_FLASH_COLOR = new Color(255, 130, 110, 255);
const GUARD_SPINE_WHITE = new Color(255, 255, 255, 255);
// 减速染色加深(2026-09-02:去掉雪星挂件后本体染色是唯一标记,压低红绿通道让"结冰感"更明显)
const GUARD_SLOW_TINT_COLOR = new Color(96, 168, 255, 255);

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
  /** 已绘制选中层对应的格位:仅换人/换格时整层重建(每 tick 重建=详情框闪烁,2026-08-28 用户验收)。 */
  private rangeShownDrawnCell = -1;
  /** 技能特效包围盒缓存(effect:anim → 宽高+原点偏移),与在场技能特效计数。 */
  private readonly guardFxBoundsCache = new Map<string, { w: number; h: number; cx: number; cy: number } | null>();
  private guardFxLiveCount = 0;
  /** 在场技能特效瞄准器(step 逐帧驱动:锁定目标方向,目标死亡自动转向最近怪物)。 */
  private readonly guardFxAimers = new Map<Node, () => void>();
  /** 同英雄特效上次触发时刻(表现冷却)与束状同屏计数(≤1)。 */
  private readonly heroFxLastAt = new Map<string, number>();
  private beamFxLive = 0;
  private lastSkillShakeAt = 0;
  /** 车道/格子底图(解锁进度变化时整层重画;key=已解锁格数:提示倒数)。 */
  private fieldBaseG: Graphics | null = null;
  private paintedCellsKey = '';
  private layoutUiScale = 1;
  /** 金币 HUD 滚动显示值(-1=未初始化)与在场飞行金币计数。 */
  private displayedGold = -1;
  private goldCoinLive = 0;
  /** 持续区域(灼烧/旋风)视图。 */
  private readonly zoneViews = new Map<number, Node>();
  /** 区域技能起手飞行(zoneId→施放英雄位置):旋风/灼烧从英雄身上飞出落地,归属一眼可辨(2026-09-02 用户反馈像水晶放的)。 */
  private readonly zoneFlights = new Map<number, { fromX: number; fromY: number; startMs: number }>();
  /** 输出贡献统计面板(2026-09-02 用户拍板参考图):点"统计"展开每英雄伤害排行。 */
  private statsPanelOpen = false;
  private lastStatsRefreshMs = 0;
  /** 普攻弹幕(远程/控制;打击感系统 2026-08-26)。 */
  private readonly projectiles: GuardProjectile[] = [];

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
    this.guardFxAimers.clear();
    this.fieldBaseG = null;
    this.paintedCellsKey = '';
    this.displayedGold = -1;
    this.goldCoinLive = 0;
    this.zoneViews.clear();
    this.projectiles.length = 0;
    this.heroFxLastAt.clear();
    this.beamFxLive = 0;
    this.damageSlot = 0;
    this.liveDamageFloaters = 0;
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
    this.layoutUiScale = layout.uiScale;
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
    // 上阵 4 英雄(2026-08-26 用户拍板:5→4,同名副本更聚焦,高星可成)。
    const pool: GuardPoolHero[] = snapshot.allies
      .filter((ally) => ally.power > 0 && !ally.unitKey.includes('empty'))
      .slice(0, 4)
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
    // 点空白处关闭范围显示与英雄详情(英雄节点会拦截冒泡,2026-08-26 用户拍板)。
    root.on(Node.EventType.TOUCH_END, () => {
      if (this.rangeShownUnitId !== null) {
        this.clearRangeIndicator();
      }
    }, this);
    this.paintBackdrop(root, layout.width, layout.height);
    this.mountBackground(root);
    this.fieldNode = this.host.addChildPlainNode(root, 'GuardField', 0, -layout.height * 0.03, layout.width, layout.height);
    this.paintLanesAndGrid();
    this.renderCrystal();
    this.renderHud();
    this.renderSummonButton();
    this.renderEnhanceButton();
    this.renderCrystalSkillButton();
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

  /** 贴图挂载:同步建占位节点锁定兄弟序(异步补挂会排到末尾、盖住整场),资源到位只填 spriteFrame。 */
  private mountSprite(parent: Node, name: string, path: string, x: number, y: number, width: number, height: number): void {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const apply = (frame: SpriteFrame): void => {
      if (!node.isValid) {
        return;
      }
      const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      node.getComponent(UITransform)?.setContentSize(width, height);
    };
    resources.load(path, SpriteFrame, (error: Error | null, frame: SpriteFrame | null) => {
      if (!error && frame) {
        apply(frame);
        return;
      }
      // 兜底:spriteFrame 子资源未导出时(meta 尚未翻 sprite-frame),直接取 texture 运行时包一层
      resources.load(path.replace(/\/spriteFrame$/, '/texture'), Texture2D, (err2: Error | null, tex: Texture2D | null) => {
        if (err2 || !tex) {
          return;
        }
        const wrapped = new SpriteFrame();
        wrapped.texture = tex;
        apply(wrapped);
      });
    });
  }

  /** 主按钮(素材=英雄详情升级按钮 btn_star_up 431×100,2026-08-26 用户拍板);标签由调用方叠加。 */
  private mountPrimaryButton(parent: Node, name: string, x: number, y: number, w: number): Node {
    const h = w * (100 / 431);
    const button = this.host.addChildPlainNode(parent, name, x, y, w, h);
    this.mountSprite(button, `${name}Art`, 'ui/hero/ai/btn_star_up/spriteFrame', 0, 0, w, h);
    this.host.applyImageButtonFeedback(button);
    return button;
  }

  /** 弹框面板底:现有素材 popup_frame_large(926×543 金雕花黑石板,2026-08-25 用户拍板改素材);miss 时直载补图。 */
  private paintOverlayPanel(parent: Node, w: number, h: number, y: number): Node {
    const panel = this.host.addChildPlainNode(parent, 'GuardOverlayPanel', 0, y, w, h);
    this.mountSprite(panel, 'Frame', 'ui/common/ai/popup_frame_large/spriteFrame', 0, 0, w, h);
    return panel;
  }

  /** 战场背景(矿洞图 1536×1024):cover 等比铺满,裁洞顶保地面;顶部再压一条渐暗带保 HUD 可读。 */
  private mountBackground(root: Node): void {
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    // 背景源图 2048×1152(gpt-image-2 原生 16:9 直出,零放大,2026-08-28 终版)
    const bgSrcW = 2048;
    const bgSrcH = 1152;
    const cover = Math.max(width / bgSrcW, height / bgSrcH);
    const bgW = bgSrcW * cover;
    const bgH = bgSrcH * cover;
    this.mountSprite(root, 'GuardSceneBg', 'ui/battle/battle_scene_guard_mine/spriteFrame', 0, (bgH - height) / 2, bgW, bgH);
    const shade = this.host.addChildPlainNode(root, 'GuardTopShade', 0, height / 2 - height * 0.08, width, height * 0.16);
    const g = shade.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 8, 118);
    g.rect(-width / 2, -height * 0.08, width, height * 0.16);
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
  /** 两排格子(2026-08-28 用户拍板):row0 贴地面顶部,row1 贴地面底部,中间整条走道。 */
  private laneToPy(lane: number): number {
    return this.layoutHeight * (lane === 0 ? 0.12 : -0.30);
  }

  /** 中央走道 Y(怪物通行,水晶垂直居中对准)。 */
  private walkwayY(): number {
    return -this.layoutHeight * 0.09;
  }

  /** 怪物 Y:跑道段(x≥5.6)上下两道散布,x∈[4.2,5.6] 平滑汇入走道,格子区只走走道——不踩英雄格。 */
  private monsterY(lane: number, x: number): number {
    const spreadY = this.walkwayY() + (0.5 - Math.min(1, lane)) * this.layoutHeight * 0.2;
    if (x >= 6.8) {
      return spreadY;
    }
    if (x <= 5.0) {
      return this.walkwayY();
    }
    const t = (x - 5.0) / 1.8;
    return this.walkwayY() + (spreadY - this.walkwayY()) * t;
  }

  /** 走道汇聚系数(1=跑道全散布,0.18=走道):抖动幅度随之收敛。 */
  private monsterSpread(x: number): number {
    if (x >= 6.8) {
      return 1;
    }
    if (x <= 5.0) {
      return 0.18;
    }
    return 0.18 + 0.82 * ((x - 5.0) / 1.8);
  }
  private unitSize(): number {
    return this.layoutHeight * 0.16;
  }
  /** 两排横铺布局(2026-08-28):格位独立排布,不再挂 sim 的 guardCellX 像素映射。 */
  private cellCenter(cell: number): { x: number; y: number } {
    const col = cell % GUARD_GRID_COLS;
    const row = Math.floor(cell / GUARD_GRID_COLS);
    return { x: this.layoutWidth * -0.41 + col * this.cellPitchPx(), y: this.laneToPy(row) };
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

  /** 相邻格列的像素间距(2026-09-02 用户拍板:格子只占屏幕左 1/3)。 */
  private cellPitchPx(): number {
    return this.layoutWidth * 0.054;
  }

  /** 英雄立绘显示尺寸(随小卡缩放,略溢出卡面)。 */
  private heroDisplaySize(): number {
    return this.cellPitchPx() * 1.35;
  }

  private paintLanesAndGrid(): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    this.fieldBaseG = field.getComponent(Graphics) ?? field.addComponent(Graphics);
    this.repaintFieldBase();
  }

  /** 下一格解锁还差几次召唤(全开返回 0)。 */
  private nextCellUnlockNeed(sim: GuardBattleState): number {
    if (sim.unlockedCells >= GUARD_GRID_CELLS) {
      return 0;
    }
    const nextAt = (sim.unlockedCells - GUARD_START_CELLS + 1) * GUARD_CELL_UNLOCK_EVERY;
    return Math.max(1, nextAt - sim.summonCount);
  }

  /** 车道+格子底图(解锁进度变化时重画;锁定格画暗卡,下一个待解锁格标倒数)。 */
  private repaintFieldBase(): void {
    const g = this.fieldBaseG;
    const field = this.fieldNode;
    const sim = this.sim;
    if (!g || !field || !sim) {
      return;
    }
    this.paintedCellsKey = `${sim.unlockedCells}:${this.nextCellUnlockNeed(sim)}`;
    g.clear();
    // 1:1 复刻(2026-08-28 用户提供整套 HUD 素材):英雄格用 ghud_cell_card 素材,锁定格同卡压暗+锁图标
    const size = this.cellPitchPx() * 0.92;
    const cardH = size * (232 / 213);
    for (const stale of field.children.filter((child) => child.name === 'GuardLockIcon' || child.name === 'GuardCellCard')) {
      stale.destroy();
    }
    for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
      const center = this.cellCenter(cell);
      const locked = guardCellUnlockRank(cell) >= sim.unlockedCells;
      const card = this.host.addChildPlainNode(field, 'GuardCellCard', center.x, center.y, size, cardH);
      card.setSiblingIndex(1);
      this.mountSprite(card, 'Img', 'ui/battle/ai/ghud_cell_card/spriteFrame', 0, 0, size, cardH);
      const cardOpacity = card.addComponent(UIOpacity);
      cardOpacity.opacity = locked ? 110 : 235;
      if (locked) {
        const lockNode = this.host.addChildPlainNode(field, 'GuardLockIcon', center.x, center.y + size * 0.1, 26, 26);
        this.mountSprite(lockNode, 'Img', 'ui/common/ai/ic_lock/spriteFrame', 0, 0, 26, 26);
      }
    }
    field.getChildByName('GuardLockHint')?.destroy();
    if (sim.unlockedCells < GUARD_GRID_CELLS) {
      const nextCell = guardCellFromUnlockRank(sim.unlockedCells);
      const center = this.cellCenter(nextCell);
      const hint = this.host.addChildLabel(field, 'GuardLockHint', `再召唤 ${this.nextCellUnlockNeed(sim)} 次
解锁此格`, center.x, center.y, 11, rgba(220, 202, 168, 225), new Size(size, 44));
      hint.enableOutline = true;
      hint.outlineColor = rgba(20, 12, 6, 255);
      hint.outlineWidth = 2;
    }
  }

  private renderCrystal(): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    // 1:1 复刻:新水晶素材(ghud_cell 同批,299×652 熔岩基座蓝晶簇)
    const height = this.layoutHeight * 0.38;
    const width = height * (299 / 652);
    const x = -this.layoutWidth * 0.462;
    const y = -this.layoutHeight * 0.055;
    const holder = this.host.addChildPlainNode(field, 'GuardCrystal', x, y, width, height);
    this.mountSprite(holder, 'GuardCrystalIcon', 'ui/battle/ai/ghud_crystal_tower/spriteFrame', 0, 0, width, height);
    tween(holder)
      .repeatForever(tween().to(1.4, { scale: new Vec3(1.03, 1.03, 1) }).to(1.4, { scale: Vec3.ONE }))
      .start();
  }

  // ── HUD:1:1 复刻用户提供的整套素材(2026-08-28)──
  private renderHud(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const hud = this.host.addChildPlainNode(root, 'GuardHud', 0, 0, width, height);
    // 左侧信息暗底板(2026-08-28 用户验收:亮背景处信息看不清;2026-09-02 职业计数移除后收矮)
    const panelW = 214;
    const panelH = height * 0.155;
    const leftPanel = this.host.addChildPlainNode(hud, 'GuardLeftPanel', -width / 2 + 10 + panelW / 2, height / 2 - 12 - panelH / 2, panelW, panelH);
    const lpG = leftPanel.addComponent(Graphics);
    lpG.fillColor = rgba(8, 6, 5, 150);
    lpG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);
    lpG.fill();
    // 左上:水晶生命(素材框 632×105,内嵌蓝条)
    const hpW = Math.min(390, width * 0.29);
    const hpH = hpW * (105 / 632);
    const hpBar = this.host.addChildPlainNode(hud, 'GuardCrystalHpBar', -width / 2 + hpW / 2 + 26, height / 2 - 20 - hpH / 2, hpW, hpH);
    hpBar.addComponent(Graphics);
    this.mountSprite(hpBar, 'Frame', 'ui/battle/ai/ghud_hp_frame/spriteFrame', 0, 0, hpW, hpH);
    const hpText = this.host.addChildLabel(hpBar, 'GuardCrystalHpText', '', hpW * 0.05, 1, 15, rgba(255, 250, 235, 250), new Size(hpW * 0.8, 20));
    hpText.enableOutline = true;
    hpText.outlineColor = rgba(10, 14, 26, 255);
    hpText.outlineWidth = 2;
    // 左侧改版(2026-09-02 用户拍板参考图):去掉职业计数竖条,换"统计"按钮展开每英雄输出贡献
    const stripTop = height / 2 - 20 - hpH - 14;
    const statsBtnW = 88;
    const statsBtnH = 38;
    const statsBtn = this.host.addChildPlainNode(hud, 'GuardStatsButton', -width / 2 + 24 + statsBtnW / 2, stripTop - statsBtnH / 2, statsBtnW, statsBtnH);
    const sbG = statsBtn.addComponent(Graphics);
    sbG.fillColor = rgba(24, 18, 12, 225);
    sbG.roundRect(-statsBtnW / 2, -statsBtnH / 2, statsBtnW, statsBtnH, 8);
    sbG.fill();
    sbG.strokeColor = rgba(214, 168, 92, 220);
    sbG.lineWidth = 1.6;
    sbG.roundRect(-statsBtnW / 2, -statsBtnH / 2, statsBtnW, statsBtnH, 8);
    sbG.stroke();
    const sbLabel = this.host.addChildLabel(statsBtn, 'Text', '统计', 0, 0, 17, rgba(244, 220, 166, 252), new Size(statsBtnW - 8, 22));
    sbLabel.enableOutline = true;
    sbLabel.outlineColor = rgba(12, 8, 6, 255);
    sbLabel.outlineWidth = 2;
    statsBtn.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      this.statsPanelOpen = !this.statsPanelOpen;
      this.refreshStatsPanel(true);
    }, this);
    this.host.applyImageButtonFeedback(statsBtn, 1.05, 0.95);
    const teamAtk = this.host.addChildLabel(hud, 'GuardTeamAtkText', '', -width / 2 + 24, stripTop - statsBtnH - 20, 16, rgba(255, 176, 130, 250), new Size(190, 22), HorizontalTextAlignment.LEFT);
    teamAtk.enableOutline = true;
    teamAtk.outlineColor = rgba(12, 8, 6, 255);
    teamAtk.outlineWidth = 2;
    // 顶部中央:标题横幅(素材 704×110)
    const bannerW = Math.min(600, width * 0.42);
    const bannerH = bannerW * (110 / 704);
    const banner = this.host.addChildPlainNode(hud, 'GuardTopBanner', 0, height / 2 - 16 - bannerH / 2, bannerW, bannerH);
    this.mountSprite(banner, 'Img', 'ui/battle/ai/ghud_top_banner/spriteFrame', 0, 0, bannerW, bannerH);
    const waveText = this.host.addChildLabel(banner, 'GuardWaveText', '', 0, 2, 20, rgba(255, 236, 190, 252), new Size(bannerW - 60, 26));
    waveText.overflow = Label.Overflow.SHRINK;
    waveText.enableOutline = true;
    waveText.outlineColor = rgba(20, 12, 6, 255);
    waveText.outlineWidth = 2;
    // BOSS 顶部血条:名字 + 红条(名字在条上方,数字条内)
    const bossName = this.host.addChildLabel(hud, 'GuardBossTopName', '', 0, height / 2 - 16 - bannerH - 16, 17, rgba(255, 224, 190, 252), new Size(500, 22));
    bossName.enableOutline = true;
    bossName.outlineColor = rgba(30, 10, 6, 255);
    bossName.outlineWidth = 2;
    const bossBar = this.host.addChildPlainNode(hud, 'GuardBossTopBar', 0, height / 2 - 16 - bannerH - 40, 480, 24);
    bossBar.addComponent(Graphics);
    const bossText = this.host.addChildLabel(bossBar, 'GuardBossTopBarText', '', 0, 0, 14, rgba(255, 244, 230, 252), new Size(440, 18));
    bossText.enableOutline = true;
    bossText.outlineColor = rgba(40, 12, 8, 255);
    bossText.outlineWidth = 2;
    // 右上:战斗金币(素材 325×89)+ 设置 + 关闭
    const pillW = 240;
    const pillH = pillW * (89 / 325);
    const goldPill = this.host.addChildPlainNode(hud, 'GuardGoldPill', width / 2 - 128 - pillW / 2, height / 2 - 20 - pillH / 2, pillW, pillH);
    this.mountSprite(goldPill, 'Img', 'ui/battle/ai/ghud_gold_pill/spriteFrame', 0, 0, pillW, pillH);
    const goldText = this.host.addChildLabel(goldPill, 'GuardGoldText', '', pillW * 0.08, 1, 21, rgba(255, 222, 130, 252), new Size(pillW * 0.66, 26), HorizontalTextAlignment.CENTER);
    goldText.enableOutline = true;
    goldText.outlineColor = rgba(24, 14, 6, 255);
    goldText.outlineWidth = 2;
    const settingsBtn = this.host.addChildPlainNode(hud, 'GuardSettingsButton', width / 2 - 82, height / 2 - 20 - pillH / 2, 42, 42);
    this.mountSprite(settingsBtn, 'Img', 'ui/battle/ai/ghud_btn_settings/spriteFrame', 0, 0, 42, 42);
    this.host.applyImageButtonFeedback(settingsBtn);
    settingsBtn.on(Node.EventType.TOUCH_END, () => this.host.setStatus('战斗内设置即将开放。'), this);
    const closeBtn = this.host.addChildPlainNode(hud, 'GuardCloseButton', width / 2 - 34, height / 2 - 20 - pillH / 2, 42, 42);
    this.mountSprite(closeBtn, 'Img', 'ui/battle/ai/ghud_btn_close/spriteFrame', 0, 0, 42, 42);
    this.host.applyImageButtonFeedback(closeBtn);
    closeBtn.on(Node.EventType.TOUCH_END, () => this.host.returnToLobbyFromBattlePreview(), this);
    // 次级信息:等级击杀(左)/下一波预告(右)/波次轨道(标准模式)
    this.host.addChildLabel(hud, 'GuardXpText', '', -width / 2 + 24, stripTop - statsBtnH - 44, 14, rgba(150, 230, 190, 230), new Size(220, 20), HorizontalTextAlignment.LEFT);
    this.host.addChildLabel(hud, 'GuardPreviewText', '', width / 2 - 250, height / 2 - 26 - pillH - 16, 15, rgba(255, 190, 150, 240), new Size(440, 20), HorizontalTextAlignment.RIGHT);
    const track = this.host.addChildPlainNode(hud, 'GuardWaveTrack', 0, height / 2 - 16 - bannerH - 14, 320, 14);
    track.addComponent(Graphics);
    this.host.addChildLabel(hud, 'GuardHintText', '拖动同名同星英雄合成升星(最高 5★)· 拖到水晶出售回金', 0, -height / 2 + 16, 14, rgba(196, 180, 150, 200), new Size(width * 0.6, 18));
  }

  /** 输出贡献统计面板:英雄伤害降序排行(名字+K/M/B 值+橙色占比条),开着时每 0.5s 重建一次。 */
  private refreshStatsPanel(force: boolean): void {
    const hud = this.root?.getChildByName('GuardHud');
    const sim = this.sim;
    if (!hud) {
      return;
    }
    const existing = hud.getChildByName('GuardStatsPanel');
    if (!this.statsPanelOpen || !sim) {
      if (existing) {
        existing.destroy();
      }
      return;
    }
    const now = Date.now();
    if (!force && existing && now - this.lastStatsRefreshMs < 500) {
      return;
    }
    this.lastStatsRefreshMs = now;
    if (existing) {
      existing.destroy();
    }
    const entries = Object.entries(sim.heroDamage)
      .map(([heroCode, damage]) => ({
        name: sim.pool.find((entry) => entry.heroCode === heroCode)?.displayName ?? heroCode,
        damage,
      }))
      .sort((a, b) => b.damage - a.damage)
      .slice(0, 8);
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const hpW = Math.min(390, width * 0.29);
    const hpH = hpW * (105 / 632);
    const panelTop = height / 2 - 20 - hpH - 14 - 44;
    const rowH = 32;
    const panelW = 300;
    const panelH = 46 + Math.max(1, entries.length) * rowH + 10;
    const panel = this.host.addChildPlainNode(hud, 'GuardStatsPanel', -width / 2 + 16 + panelW / 2, panelTop - panelH / 2, panelW, panelH);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = rgba(10, 8, 7, 215);
    pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    pg.fill();
    pg.strokeColor = rgba(190, 150, 84, 190);
    pg.lineWidth = 1.4;
    pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    pg.stroke();
    const title = this.host.addChildLabel(panel, 'Title', '我方贡献统计', 0, panelH / 2 - 22, 17, rgba(244, 220, 166, 252), new Size(panelW - 20, 22));
    title.enableOutline = true;
    title.outlineColor = rgba(12, 8, 6, 255);
    title.outlineWidth = 2;
    if (entries.length === 0) {
      this.host.addChildLabel(panel, 'Empty', '暂无输出记录', 0, -4, 14, rgba(196, 182, 152, 220), new Size(panelW - 20, 18));
      return;
    }
    const maxDamage = Math.max(1, entries[0].damage);
    entries.forEach((entry, index) => {
      const rowY = panelH / 2 - 46 - rowH * index - rowH / 2 + 4;
      const name = this.host.addChildLabel(panel, `Name_${index}`, entry.name, -panelW / 2 + 14 + 78, rowY + 6, 14, rgba(236, 226, 200, 248), new Size(156, 18), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const value = this.host.addChildLabel(panel, `Value_${index}`, this.formatDamageValue(entry.damage), panelW / 2 - 14 - 55, rowY + 6, 15, rgba(255, 214, 120, 252), new Size(110, 20), HorizontalTextAlignment.RIGHT);
      value.enableOutline = true;
      value.outlineColor = rgba(12, 8, 6, 255);
      value.outlineWidth = 2;
      const barW = panelW - 28;
      const bar = this.host.addChildPlainNode(panel, `Bar_${index}`, 0, rowY - 8, barW, 5);
      const bg = bar.addComponent(Graphics);
      bg.fillColor = rgba(50, 40, 30, 200);
      bg.roundRect(-barW / 2, -2.5, barW, 5, 2.5);
      bg.fill();
      bg.fillColor = rgba(255, 158, 54, 240);
      bg.roundRect(-barW / 2, -2.5, Math.max(4, barW * (entry.damage / maxDamage)), 5, 2.5);
      bg.fill();
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
    if (this.paintedCellsKey !== `${sim.unlockedCells}:${this.nextCellUnlockNeed(sim)}`) {
      this.repaintFieldBase();
    }
    // 水晶生命:蓝条画在素材框内(框中空区约 [-0.27w, +0.44w])
    const hpBar = hud.getChildByName('GuardCrystalHpBar');
    const hpTransform = hpBar?.getComponent(UITransform);
    const hpGraphics = hpBar?.getComponent(Graphics);
    if (hpBar && hpTransform && hpGraphics) {
      const w = hpTransform.width;
      const h = hpTransform.height;
      const ratio = Math.max(0, sim.crystalHp / sim.crystalMaxHp);
      const fillL = -w * 0.27;
      const fillW = w * 0.71;
      hpGraphics.clear();
      hpGraphics.fillColor = rgba(10, 14, 24, 235);
      hpGraphics.roundRect(fillL, -h * 0.22, fillW, h * 0.44, h * 0.2);
      hpGraphics.fill();
      hpGraphics.fillColor = ratio > 0.35 ? rgba(90, 180, 255, 245) : rgba(240, 90, 70, 245);
      hpGraphics.roundRect(fillL, -h * 0.22, Math.max(4, fillW * ratio), h * 0.44, h * 0.2);
      hpGraphics.fill();
    }
    const hpText = hud.getChildByName('GuardCrystalHpBar')?.getChildByName('GuardCrystalHpText')?.getComponent(Label);
    if (hpText) {
      hpText.string = `水晶生命 ${Math.ceil(sim.crystalHp)} / ${sim.crystalMaxHp}`;
    }
    const waveText = hud.getChildByName('GuardTopBanner')?.getChildByName('GuardWaveText')?.getComponent(Label);
    if (waveText) {
      if (sim.mode === 'rush') {
        const leftSec = Math.max(0, Math.ceil((GUARD_RUSH_TIME_LIMIT_MS - sim.timeMs) / 1000));
        waveText.string = `车轮战 层数 ${guardTrialLayers(sim)} · BOSS×${sim.bossKills} · 剩余 ${Math.floor(leftSec / 60)}:${String(leftSec % 60).padStart(2, '0')}`;
      } else {
        waveText.string = sim.phase === 'prep'
          ? (sim.wave === 0 ? '首波来袭倒计时…' : `第 ${sim.wave}/${sim.maxWave} 波已清 · 备战中`)
          : `第 ${sim.wave}/${sim.maxWave} 波${sim.wave === sim.maxWave ? ' · BOSS!' : sim.wave % 10 === 0 ? ' · BOSS 节拍!' : ''}`;
      }
    }
    const goldText = hud.getChildByName('GuardGoldPill')?.getChildByName('GuardGoldText')?.getComponent(Label);
    if (goldText) {
      if (this.displayedGold < 0) {
        this.displayedGold = sim.gold;
      }
      const diff = sim.gold - this.displayedGold;
      if (diff !== 0) {
        const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
        this.displayedGold = Math.abs(step) >= Math.abs(diff) ? sim.gold : this.displayedGold + step;
      }
      goldText.string = `${this.displayedGold}`;
    }
    const summonCost = this.root?.getChildByName('GuardSummonButton')?.getChildByName('GuardSummonCost')?.getComponent(Label);
    if (summonCost) {
      summonCost.string = `${guardCurrentSummonCost(sim)} · 下次 ${Math.min(300, guardCurrentSummonCost(sim) + 10)}`;
    }
    this.refreshWaveTrack();
    this.refreshStatsPanel(false);
    const xpText = hud.getChildByName('GuardXpText')?.getComponent(Label);
    if (xpText) {
      xpText.string = `等级 ${sim.level} · 击杀 ${sim.killCount}`;
    }
    const teamAtkText = hud.getChildByName('GuardTeamAtkText')?.getComponent(Label);
    if (teamAtkText) {
      const pct = sim.mods.teamAtkPct + sim.enhanceLevel * 8;
      const surge = sim.supportSurgeUntilMs > sim.timeMs ? ' ·涌泉' : '';
      teamAtkText.string = `全队攻击 +${pct}%${surge}`;
    }
    const previewText = hud.getChildByName('GuardPreviewText')?.getComponent(Label);
    if (previewText) {
      if (sim.phase === 'prep' && sim.nextWaveSpawns) {
        const kindNames: Record<string, string> = { normal: '小怪', fast: '快速', tank: '肉盾', flying: '飞行', shooter: '远程', elite: '精英', boss: 'BOSS' };
        const summary = guardSummarizeSpawns(sim.nextWaveSpawns);
        previewText.string = '下一波: ' + Object.entries(summary).map(([kind, count]) => `${kindNames[kind] ?? kind}×${count}`).join(' ');
      } else {
        previewText.string = '';
      }
    }
    const enhanceDesc = this.root?.getChildByName('GuardEnhanceButton')?.getChildByName('GuardEnhanceDesc')?.getComponent(Label);
    if (enhanceDesc) {
      enhanceDesc.string = `全队攻击 +${sim.enhanceLevel * GUARD_ENHANCE_ATK_PCT}%`;
    }
    const enhanceCost = this.root?.getChildByName('GuardEnhanceButton')?.getChildByName('GuardEnhanceCost')?.getComponent(Label);
    if (enhanceCost) {
      enhanceCost.string = `${sim.enhanceCost}`;
    }
    this.refreshCrystalSkillButton();
  }

  // ── P2:强化按钮(素材版,与召唤争夺金币) ──
  private renderEnhanceButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const w = Math.min(236, width * 0.18);
    const h = w * (234 / 510);
    const summonW = Math.min(264, width * 0.2);
    const summonH = summonW * (236 / 560);
    const button = this.host.addChildPlainNode(root, 'GuardEnhanceButton', width / 2 - 24 - summonW - 16 - w / 2, -height / 2 + 18 + summonH / 2, w, h);
    this.mountSprite(button, 'Art', 'ui/battle/ai/ghud_btn_enhance/spriteFrame', 0, 0, w, h);
    this.host.applyImageButtonFeedback(button);
    const title = this.host.addChildLabel(button, 'GuardEnhanceLabel', '强化', w * 0.1, h * 0.2, 22, rgba(255, 238, 190, 252), new Size(w * 0.6, 26));
    title.enableOutline = true;
    title.outlineColor = rgba(20, 12, 6, 255);
    title.outlineWidth = 2;
    const desc = this.host.addChildLabel(button, 'GuardEnhanceDesc', '', w * 0.1, -h * 0.08, 13, rgba(232, 214, 180, 240), new Size(w * 0.66, 16));
    desc.overflow = Label.Overflow.SHRINK;
    const cost = this.host.addChildLabel(button, 'GuardEnhanceCost', '', w * 0.1, -h * 0.3, 16, rgba(255, 214, 110, 250), new Size(w * 0.6, 20));
    cost.enableOutline = true;
    cost.outlineColor = rgba(24, 14, 6, 255);
    cost.outlineWidth = 2;
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

  // ── P2:水晶技能(素材圆钮+能量条;CD 进度映射为能量 0..300) ──
  private renderCrystalSkillButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    // 2026-09-02 用户拍板:水晶技能先隐藏(机制保留,后续再放出)
    if (GUARD_CRYSTAL_SKILL_HIDDEN) {
      return;
    }
    const height = this.layoutHeight;
    const size = 96;
    const button = this.host.addChildPlainNode(root, 'GuardCrystalSkillButton', -this.layoutWidth / 2 + 34 + size / 2, -height / 2 + 66 + size / 2, size, size);
    this.mountSprite(button, 'Art', 'ui/battle/ai/ghud_btn_skill/spriteFrame', 0, 0, size, size * (271 / 273));
    this.host.applyImageButtonFeedback(button);
    const label = this.host.addChildLabel(button, 'GuardCrystalSkillLabel', '水晶技能', 0, -size / 2 - 14, 15, rgba(200, 232, 255, 250), new Size(110, 20));
    label.enableOutline = true;
    label.outlineColor = rgba(10, 16, 28, 255);
    label.outlineWidth = 2;
    const pillW = 132;
    const pillH = pillW * (71 / 239);
    const pill = this.host.addChildPlainNode(root, 'GuardCrystalEnergy', -this.layoutWidth / 2 + 34 + size + 14 + pillW / 2, -height / 2 + 66 + size * 0.32, pillW, pillH);
    this.mountSprite(pill, 'Img', 'ui/battle/ai/ghud_energy_pill/spriteFrame', 0, 0, pillW, pillH);
    const energy = this.host.addChildLabel(pill, 'Text', '', pillW * 0.08, 1, 15, rgba(150, 214, 255, 252), new Size(pillW * 0.7, 18));
    energy.enableOutline = true;
    energy.outlineColor = rgba(10, 16, 28, 255);
    energy.outlineWidth = 2;
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      if (!guardUseCrystalSkill(sim)) {
        this.host.setStatus('水晶能量未满…');
      } else {
        this.shakeField(10);
      }
    }, this);
    this.refreshCrystalSkillButton();
  }

  private refreshCrystalSkillButton(): void {
    if (GUARD_CRYSTAL_SKILL_HIDDEN) {
      return;
    }
    const sim = this.sim;
    const button = this.root?.getChildByName('GuardCrystalSkillButton');
    if (!sim || !button) {
      return;
    }
    const ready = guardCrystalSkillReady(sim);
    const remain = Math.max(0, sim.crystalSkillReadyMs - sim.timeMs);
    const frac = ready ? 1 : 1 - remain / GUARD_CRYSTAL_SKILL_CD_MS;
    const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
    opacity.opacity = ready ? 255 : 150;
    const energy = this.root?.getChildByName('GuardCrystalEnergy')?.getChildByName('Text')?.getComponent(Label);
    if (energy) {
      energy.string = `${Math.round(frac * 300)} / 300`;
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
    // 2026-09-02 用户拍板:恢复横向摆放(格子已收左 1/3,右下无冲突)
    const w = Math.min(264, width * 0.2);
    const h = w * (236 / 560);
    const button = this.host.addChildPlainNode(root, 'GuardSummonButton', width / 2 - 24 - w / 2, -height / 2 + 18 + h / 2, w, h);
    this.mountSprite(button, 'Art', 'ui/battle/ai/ghud_btn_summon/spriteFrame', 0, 0, w, h);
    this.host.applyImageButtonFeedback(button);
    const title = this.host.addChildLabel(button, 'GuardSummonLabel', '召唤', w * 0.08, h * 0.14, 28, rgba(255, 244, 210, 255), new Size(w * 0.6, 34));
    title.enableOutline = true;
    title.outlineColor = rgba(60, 26, 8, 255);
    title.outlineWidth = 3;
    const cost = this.host.addChildLabel(button, 'GuardSummonCost', '', w * 0.08, -h * 0.22, 15, rgba(255, 224, 140, 250), new Size(w * 0.72, 20));
    cost.enableOutline = true;
    cost.outlineColor = rgba(50, 22, 8, 255);
    cost.outlineWidth = 2;
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
    this.updateProjectiles();
    for (const aim of this.guardFxAimers.values()) {
      aim();
    }
    this.syncHeroes();
    this.syncMonsters();
    this.syncChests();
    this.syncZones();
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
          this.spawnGoldCoin(view.node.position.x, view.node.position.y);
          // 击杀迸发(打击感):小金环炸开
          this.spawnCellBurst(view.node.position.x, view.node.position.y - this.unitSize() * 0.2, rgba(255, 190, 90), false);
        }
      } else if (event.type === 'crystalHit') {
        this.spawnFloater(this.xToPx(0), this.walkwayY() + this.layoutHeight * 0.14, `-${event.amount ?? 0}`, rgba(255, 120, 100));
        // 水晶受击红闪(打击感)
        const crystalSprite = field.getChildByName('GuardCrystal')?.getChildByName('GuardCrystalIcon')?.getComponent(Sprite);
        if (crystalSprite && crystalSprite.isValid) {
          crystalSprite.color = rgba(255, 130, 110, 255);
          setTimeout(() => {
            if (crystalSprite.isValid) {
              crystalSprite.color = rgba(255, 255, 255, 255);
            }
          }, 130);
        }
      } else if (event.type === 'summon') {
        // 召唤落位爆闪(2026-08-27 用户拍板)
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnCastFlash(center.x, center.y - this.unitSize() * 0.2, this.unitSize() * 1.05);
        }
      } else if (event.type === 'superMerge' || event.type === 'merge') {
        // 合成爆闪(超阶更大+金色)
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnCastFlash(center.x, center.y - this.unitSize() * 0.2, this.unitSize() * (event.type === 'superMerge' ? 1.9 : 1.5));
        }
        if (event.type === 'superMerge') {
          this.host.setStatus('矿脉共鸣!直升 2 星!');
          if (typeof event.cell === 'number') {
            const center = this.cellCenter(event.cell);
            this.spawnFloater(center.x, center.y + this.unitSize() * 0.6, '矿脉共鸣 +2★', rgba(255, 240, 160));
          }
        }
        // 首次跨过 2 星=解锁专属技能:横幅点明"解锁了什么"(2026-08-25 用户拍板)。
        if (event.skillUnlocked && typeof event.cell === 'number') {
          this.showSkillUnlockBanner(event.cell, event.heroCode ?? '');
        }
      } else if (event.type === 'bossSkill') {
        // BOSS 技能(2026-08-28):重踏=脚下冲击环+大震屏+水晶掉血;投射=暗弹从 BOSS 飞向水晶
        const bossView = typeof event.monsterId === 'number' ? this.monsterViews.get(event.monsterId) : null;
        const bx = bossView?.node.isValid ? bossView.node.position.x : this.xToPx(5);
        const by = bossView?.node.isValid ? bossView.node.position.y : this.walkwayY();
        this.spawnFloater(bx, by + this.unitSize() * 1.1, `${event.skillName ?? 'BOSS技能'}!`, rgba(255, 140, 90), 20);
        if (event.skillKind === 'volley') {
          const field2 = this.fieldNode;
          if (field2) {
            const node = this.host.addChildPlainNode(field2, 'GuardBossBolt', bx - this.unitSize() * 0.4, by, 10, 10);
            node.setSiblingIndex(field2.children.length - 1);
            const g = node.addComponent(Graphics);
            g.fillColor = rgba(180, 90, 255, 150);
            g.ellipse(0, 0, 16, 9);
            g.fill();
            g.fillColor = rgba(255, 120, 200, 245);
            g.ellipse(1, 0, 9, 5);
            g.fill();
            this.projectiles.push({ node, targetId: -1, x: bx - this.unitSize() * 0.4, y: by, amount: event.amount ?? 0, color: rgba(200, 110, 255), crystalTarget: true });
          }
        } else {
          // 重踏:BOSS 脚下冲击环+全场震屏,水晶伤害即时结算(sim 已扣),水晶处红闪+飘字
          this.spawnCellBurst(bx, by - this.unitSize() * 0.5, rgba(255, 130, 70), true);
          this.shakeField(11);
          const cx = this.xToPx(GUARD_CRYSTAL_REACH_X) - this.unitSize() * 0.5;
          this.spawnFloater(cx, this.walkwayY() + this.layoutHeight * 0.1, `-${this.formatDamageValue(event.amount ?? 0)}`, rgba(255, 120, 100), 20);
        }
      } else if (event.type === 'heroSkill') {
        // 主动技能(2★ 冷却制):施法动画+技能名飘字;近战/远程附专属特效打向首个目标
        const caster = sim.heroes.find((entry) => entry.heroCode === event.heroCode && entry.cell === event.cell);
        if (caster) {
          this.playUnitAttack(this.heroViews.get(caster.unitId));
        }
        if (typeof event.cell === 'number') {
          // 施放者亮相:脚下金圈+弹跳+技能名喊话(归属一眼可辨,2026-08-27)
          this.highlightCaster(event.cell, `${event.skillName ?? '技能'}!`);
        }
        if (typeof event.zoneId === 'number' && typeof event.cell === 'number') {
          // 区域技能(旋风/灼烧)从施放英雄身上飞出落地
          const from = this.cellCenter(event.cell);
          this.zoneFlights.set(event.zoneId, { fromX: from.x, fromY: from.y, startMs: sim.timeMs });
        }
        if (typeof event.monsterId === 'number' && event.heroCode) {
          const target = sim.monsters.find((entry) => entry.monsterId === event.monsterId);
          if (target) {
            this.spawnGuardSkillFx(event.heroCode, caster?.cell ?? null, target);
          }
        }
      } else if (event.type === 'cellsUnlock') {
        this.host.setStatus('阵地扩建!解锁 1 个新召唤格!');
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnFloater(center.x, center.y + this.unitSize() * 0.4, '新格解锁!', rgba(150, 240, 160));
        }
      } else if (event.type === 'waveStart') {
        this.host.setStatus(`第 ${event.wave} 波来袭!`);
      } else if (event.type === 'chestDrop') {
        this.host.setStatus('精英宝箱掉落!点击开箱!');
      } else if (event.type === 'bossCastStart') {
        this.host.setStatus('BOSS 蓄力轰击水晶!集火打断!');
      } else if (event.type === 'bossCastInterrupt') {
        this.spawnFloater(this.xToPx(5), this.walkwayY() + this.layoutHeight * 0.12, '打断!', rgba(255, 240, 160));
        this.shakeField(8);
      } else if (event.type === 'bossCastHit') {
        this.spawnFloater(this.xToPx(0), this.walkwayY() + this.layoutHeight * 0.16, `灭世轰击 -${event.amount ?? 0}`, rgba(255, 110, 90));
        this.shakeField(14);
      } else if (event.type === 'crystalSkill') {
        this.spawnFloater(this.xToPx(2), this.walkwayY(), `矿晶震荡 ${event.amount ?? 0}`, rgba(150, 220, 255));
      } else if (event.type === 'heroAttack') {
        // 攻击动画:怪进入范围出手时播 attack(用户 2026-08-21);技能击追加专属技能特效打在目标身上。
        const hero = sim.heroes.find((entry) => entry.heroCode === event.heroCode && entry.cell === event.cell);
        if (hero) {
          this.playUnitAttack(this.heroViews.get(hero.unitId));
        }
        // 打击感(2026-08-26):远程/控制普攻发弹幕(命中才结算表现);近战刀光斩闪;技能击照旧专属特效。
        if (typeof event.monsterId === 'number') {
          const target = sim.monsters.find((entry) => entry.monsterId === event.monsterId);
          const targetView = target ? this.monsterViews.get(target.monsterId) : null;
          if (target && targetView && targetView.node.isValid) {
            const jitterX = ((event.timeMs % 48) - 24);
            if (event.skillProc && event.heroCode) {
              this.spawnGuardSkillFx(event.heroCode, hero?.cell ?? null, target);
              if (hero) {
                this.highlightCaster(hero.cell, '技能击!');
              }
              this.queueDamage(target.monsterId, event.amount ?? 0, true, targetView.node.position.x + jitterX, targetView.node.position.y);
              this.flashMonster(target.monsterId);
              // 节流震屏:技能命中的重量感(≥1.2s 一次)
              const now = Date.now();
              if (now - this.lastSkillShakeAt > 1200) {
                this.lastSkillShakeAt = now;
                this.shakeField(4);
              }
            } else if (hero && (hero.role === 'ranged' || hero.role === 'control' || hero.role === 'support')) {
              const origin = this.cellCenter(hero.cell);
              const color = GUARD_ROLE_COLOR[hero.role] ?? rgba(255, 220, 150);
              this.spawnProjectile(origin.x + this.unitSize() * 0.4, origin.y + this.unitSize() * 0.05, target, event.amount ?? 0, color);
            } else {
              this.spawnSlashArc(targetView.node.position.x + jitterX * 0.4, targetView.node.position.y + this.unitSize() * 0.16);
              this.queueDamage(target.monsterId, event.amount ?? 0, false, targetView.node.position.x + jitterX, targetView.node.position.y);
              this.flashMonster(target.monsterId);
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
      const size = this.unitSize() * 0.8;
      const node = this.host.addChildPlainNode(field, `GuardChest_${chest.chestId}`, this.xToPx(chest.x), this.monsterY(chest.lane, chest.x) - size * 0.15, size, size);
      // 呼吸光晕(2026-08-28 用户验收:掉在地上不明显):金色双环随缩放呼吸,画在宝箱图之下
      const glow = this.host.addChildPlainNode(node, 'GuardChestGlow', 0, -size * 0.06, size, size);
      const glowG = glow.addComponent(Graphics);
      glowG.fillColor = rgba(255, 214, 110, 56);
      glowG.circle(0, 0, size * 0.56);
      glowG.fill();
      glowG.strokeColor = rgba(255, 226, 130, 190);
      glowG.lineWidth = 4;
      glowG.circle(0, 0, size * 0.56);
      glowG.stroke();
      glowG.strokeColor = rgba(255, 240, 180, 120);
      glowG.lineWidth = 2;
      glowG.circle(0, 0, size * 0.72);
      glowG.stroke();
      const glowOpacity = glow.addComponent(UIOpacity);
      tween(glow)
        .repeatForever(tween().to(0.7, { scale: new Vec3(1.22, 1.22, 1) }).to(0.7, { scale: new Vec3(0.92, 0.92, 1) }))
        .start();
      tween(glowOpacity)
        .repeatForever(tween().to(0.7, { opacity: 255 }).to(0.7, { opacity: 140 }))
        .start();
      // 场上宝箱用素材(2026-08-25:程序画的方块太素)。
      this.mountSprite(node, 'Img', 'ui/guard/chest_closed/spriteFrame', 0, 0, size, size);
      const hint = this.host.addChildLabel(node, 'GuardChestHint', '点击开箱', 0, size * 0.48, 15, rgba(255, 232, 150), new Size(size * 1.8, 20));
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
    // 横版布局适配 popup_frame_large(1.7 宽高比):左轮盘右奖励列。
    const wheelPanelH = Math.min(600, height * 0.62);
    this.paintOverlayPanel(overlay, wheelPanelH * 1.7, wheelPanelH, 0);
    this.host.addChildLabel(overlay, 'GuardWheelTitle', '矿脉宝箱', 0, wheelPanelH / 2 - 76, 32, rgba(255, 232, 150), new Size(width * 0.6, 42));
    // 轮盘(2026-08-25 用户验收重做):暖色扇区+奖励字样+双层金圈;中心矿脉宝箱素材,停格开箱爆金光。
    const wheelX = -wheelPanelH * 0.4;
    const wheelY = -height * 0.025;
    const radius = Math.min(168, wheelPanelH * 0.34);
    const wheel = this.host.addChildPlainNode(overlay, 'GuardWheel', wheelX, wheelY, radius * 2, radius * 2);
    const wg = wheel.addComponent(Graphics);
    for (let i = 0; i < 8; i += 1) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      wg.fillColor = i % 2 === 0 ? rgba(112, 74, 34, 252) : rgba(70, 48, 26, 252);
      wg.moveTo(0, 0);
      wg.arc(0, 0, radius, a0, a1, false);
      wg.close();
      wg.fill();
    }
    // 分隔线+双层金圈
    wg.strokeColor = rgba(236, 190, 110, 130);
    wg.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      wg.moveTo(Math.cos(a) * 58, Math.sin(a) * 58);
      wg.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    wg.stroke();
    wg.strokeColor = rgba(255, 208, 116, 250);
    wg.lineWidth = 5;
    wg.circle(0, 0, radius);
    wg.stroke();
    wg.strokeColor = rgba(140, 100, 50, 220);
    wg.lineWidth = 2;
    wg.circle(0, 0, radius - 9);
    wg.stroke();
    // 扇区奖励字样(随盘转)
    const segLabels = ['金币', '召唤', '词条', '强攻', '金币', '召唤', '词条', '强攻'];
    segLabels.forEach((text, i) => {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const label = this.host.addChildLabel(wheel, `GuardWheelSeg_${i}`, text, Math.cos(a) * (radius - 46), Math.sin(a) * (radius - 46), 19, rgba(255, 232, 178, 245), new Size(64, 26));
      label.enableOutline = true;
      label.outlineColor = rgba(40, 24, 8, 255);
      label.outlineWidth = 2;
    });
    // 中心矿脉宝箱(不随盘转);停格后换开箱图+金光
    const chestNode = this.host.addChildPlainNode(overlay, 'GuardWheelChest', wheelX, wheelY, 128, 128);
    this.mountSprite(chestNode, 'Img', 'ui/guard/chest_closed/spriteFrame', 0, 0, 128, 128);
    const pointer = this.host.addChildLabel(overlay, 'GuardWheelPointer', '▼', wheelX, wheelY + radius + 20, 30, rgba(255, 214, 92), new Size(44, 36));
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
    // 开箱动效:闭箱→开箱素材切换 + 缩放弹跳 + 金光爆环
    const chestNode = overlay.getChildByName('GuardWheelChest');
    if (chestNode && chestNode.isValid) {
      chestNode.getChildByName('Img')?.destroy();
      this.mountSprite(chestNode, 'Img', 'ui/guard/chest_open/spriteFrame', 0, 6, 150, 150);
      chestNode.setScale(0.7, 0.7, 1);
      tween(chestNode)
        .to(0.16, { scale: new Vec3(1.22, 1.22, 1) }, { easing: 'backOut' })
        .to(0.14, { scale: new Vec3(1, 1, 1) })
        .start();
      const burst = this.host.addChildPlainNode(overlay, 'GuardWheelBurst', 0, chestNode.position.y, 10, 10);
      const bg = burst.addComponent(Graphics);
      bg.strokeColor = rgba(255, 222, 120, 235);
      bg.lineWidth = 6;
      bg.circle(0, 0, 60);
      bg.stroke();
      const burstOpacity = burst.addComponent(UIOpacity);
      tween(burst).to(0.5, { scale: new Vec3(3.4, 3.4, 1) }, { easing: 'quadOut' }).start();
      tween(burstOpacity).to(0.5, { opacity: 0 }).call(() => { if (burst.isValid) { burst.destroy(); } }).start();
    }
    const panelH = Math.min(600, height * 0.62);
    const colX = panelH * 0.5;
    const tierLabel = this.host.addChildLabel(overlay, 'GuardWheelTier', tier >= 5 ? '★ 5 连大奖!★' : tier >= 3 ? '3 连奖!' : '奖励', colX, panelH / 2 - 128, tier >= 5 ? 32 : 24, tier >= 5 ? rgba(255, 220, 90) : rgba(255, 236, 180), new Size(panelH * 0.8, 44));
    tierLabel.enableOutline = true;
    tierLabel.outlineColor = rgba(60, 30, 10, 255);
    tierLabel.outlineWidth = 3;
    if (tier >= 5) {
      this.shakeField(12);
    }
    // 免费召唤是"开箱瞬间直接上阵到随机空格"(不涨召唤费):给新英雄头上飘绿字点明
    if (rewards.some((reward) => reward.kind === 'summon') && this.sim && this.sim.heroes.length > 0) {
      const newest = this.sim.heroes.reduce((latest, hero) => (hero.unitId > latest.unitId ? hero : latest), this.sim.heroes[0]);
      const center = this.cellCenter(newest.cell);
      this.spawnFloater(center.x, center.y + this.unitSize() * 0.75, '免费召唤!已上阵', rgba(150, 240, 160));
    }
    rewards.forEach((reward, index) => {
      const label = this.host.addChildLabel(overlay, `GuardWheelReward_${index}`, reward.label, colX, panelH / 2 - 176 - index * 34, 19, rgba(236, 224, 196), new Size(panelH * 0.82, 26));
      label.overflow = Label.Overflow.SHRINK;
      const opacity = label.node.addComponent(UIOpacity);
      opacity.opacity = 0;
      tween(opacity).delay(0.18 * index).to(0.2, { opacity: 255 }).start();
    });
    const close = this.mountPrimaryButton(overlay, 'GuardWheelClose', colX, -panelH / 2 + 100, 236);
    this.host.addChildLabel(close, 'GuardWheelCloseLabel', '收下', 0, 0, 22, rgba(255, 238, 190), new Size(200, 28));
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
    const panelH = height * 0.6;
    this.paintOverlayPanel(overlay, Math.min(width * 0.9, panelH * 1.62), panelH, 0);
    // 标题下移 15px(2026-08-28 用户验收)
    this.host.addChildLabel(overlay, 'GuardChoiceTitle', `等级提升!Lv${sim.level} · 三选一`, 0, panelH / 2 - 93, 30, rgba(255, 232, 150), new Size(width * 0.7, 40));
    const cardW = Math.min(262, width * 0.22);
    const cardH = 232;
    sim.pendingChoice.forEach((option, index) => {
      const x = (index - 1) * (cardW + 32);
      const card = this.host.addChildPlainNode(overlay, `GuardChoiceCard_${index}`, x, height * 0.015, cardW, cardH);
      // 词条卡美化(2026-08-28):双层描边+上半高光渐层+四角金饰角+头带
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(30, 22, 17, 252);
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);
      g.fill();
      g.fillColor = rgba(56, 40, 28, 130);
      g.roundRect(-cardW / 2 + 4, 0, cardW - 8, cardH / 2 - 4, 12);
      g.fill();
      g.strokeColor = rgba(230, 196, 132, 250);
      g.lineWidth = 2.6;
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);
      g.stroke();
      g.strokeColor = rgba(120, 92, 56, 200);
      g.lineWidth = 1.2;
      g.roundRect(-cardW / 2 + 5, -cardH / 2 + 5, cardW - 10, cardH - 10, 11);
      g.stroke();
      // 四角金饰角
      g.strokeColor = rgba(255, 214, 130, 240);
      g.lineWidth = 3;
      const tick = 16;
      for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as Array<[number, number]>) {
        g.moveTo(sx * (cardW / 2 - 3) - sx * tick, sy * (cardH / 2 - 3));
        g.lineTo(sx * (cardW / 2 - 3), sy * (cardH / 2 - 3));
        g.lineTo(sx * (cardW / 2 - 3), sy * (cardH / 2 - 3) - sy * tick);
      }
      g.stroke();
      g.fillColor = rgba(84, 58, 32, 240);
      g.roundRect(-cardW / 2 + 6, cardH / 2 - 52, cardW - 12, 44, 10);
      g.fill();
      // 标题进头带(2026-08-25 用户验收:头带空着、标题飘在下面)。
      const title = this.host.addChildLabel(card, 'Title', option.title, 0, cardH / 2 - 29, 21, rgba(255, 240, 200), new Size(cardW - 22, 40));
      title.overflow = Label.Overflow.SHRINK;
      const detail = this.host.addChildLabel(card, 'Detail', option.detail, 0, cardH * 0.05, 17, rgba(212, 200, 176, 240), new Size(cardW - 24, 60));
      detail.overflow = Label.Overflow.SHRINK;
      const banish = this.host.addChildLabel(card, 'Banish', sim.banishLeft > 0 ? '✕ 放逐' : '', 0, -cardH * 0.37, 15, rgba(255, 140, 120, 230), new Size(cardW - 20, 20));
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
      const button = this.mountPrimaryButton(overlay, name, x, -panelH / 2 + 94, 252);
      const smallLabel = this.host.addChildLabel(button, `${name}Label`, text, 0, 0, 18, rgba(255, 238, 190), new Size(196, 24));
      smallLabel.overflow = Label.Overflow.SHRINK;
      button.on(Node.EventType.TOUCH_END, onTap, this);
    };
    // 按钮间距加大(2026-08-28 用户验收)
    makeSmall('GuardChoiceSkip', '跳过(+50 金币)', -160, () => {
      guardSkipChoice(sim);
    });
    makeSmall('GuardChoiceReroll', `刷新(剩 ${sim.rerollLeft})`, 160, () => {
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

  // ── 打击感系统(2026-08-26 用户拍板:弹幕射击+受击反馈)──
  /** 普攻弹幕:发光弹体从英雄身前归巢飞向目标,命中才结算飘字+爆闪+受击红闪。 */
  private spawnProjectile(fromX: number, fromY: number, monster: GuardMonster, amount: number, color: Color): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    if (this.projectiles.length >= 40) {
      // 弹体满载:直接结算命中(伤害表现不丢)
      this.resolveProjectileHit(this.xToPx(monster.x), this.monsterY(monster.lane, monster.x) + this.monsterJitterY(monster) * this.monsterSpread(monster.x), monster.monsterId, amount, color);
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardProjectile', fromX, fromY, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const g = node.addComponent(Graphics);
    // 弹体:亮核+外辉+尾迹(朝右绘制,飞行时整体旋转)
    g.strokeColor = rgba(color.r, color.g, color.b, 130);
    g.lineWidth = 5;
    g.moveTo(-30, 0);
    g.lineTo(-8, 0);
    g.stroke();
    g.fillColor = rgba(color.r, color.g, color.b, 120);
    g.ellipse(0, 0, 13, 7);
    g.fill();
    g.fillColor = rgba(255, 250, 235, 245);
    g.ellipse(1, 0, 8, 4);
    g.fill();
    this.projectiles.push({ node, targetId: monster.monsterId, x: fromX, y: fromY, amount, color });
  }

  /** 保底技能弹:完整特效被限流时,从英雄身前发一颗大号发光弹(纯表现)——技能归属永远可见。 */
  private spawnSkillBolt(heroCell: number, monster: GuardMonster): void {
    const field = this.fieldNode;
    if (!field || this.projectiles.length >= 40) {
      return;
    }
    const origin = this.cellCenter(heroCell);
    const fromX = origin.x + this.heroDisplaySize() * 0.5;
    const fromY = origin.y + this.heroDisplaySize() * 0.1;
    const node = this.host.addChildPlainNode(field, 'GuardSkillBolt', fromX, fromY, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    node.setScale(1.6, 1.6, 1);
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(200, 150, 255, 150);
    g.lineWidth = 6;
    g.moveTo(-34, 0);
    g.lineTo(-9, 0);
    g.stroke();
    g.fillColor = rgba(200, 150, 255, 140);
    g.ellipse(0, 0, 15, 8);
    g.fill();
    g.fillColor = rgba(255, 250, 240, 250);
    g.ellipse(1, 0, 9, 5);
    g.fill();
    this.projectiles.push({ node, targetId: monster.monsterId, x: fromX, y: fromY, amount: 0, color: rgba(200, 150, 255), visualOnly: true });
  }

  /** 每 tick 推进弹幕(归巢;目标死亡转向最近怪;命中=爆闪+飘字+受击红闪)。 */
  private updateProjectiles(): void {
    const sim = this.sim;
    if (!sim || this.projectiles.length === 0) {
      return;
    }
    const speed = 90; // px / tick(50ms)≈ 1800px/s
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const proj = this.projectiles[i];
      if (!proj.node.isValid) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (proj.crystalTarget) {
        // BOSS 暗弹:飞向水晶,命中=水晶红闪+飘字+小震屏
        const tx = this.xToPx(GUARD_CRYSTAL_REACH_X) - this.unitSize() * 0.5;
        const ty = this.walkwayY() + this.layoutHeight * 0.02;
        const dx = tx - proj.x;
        const dy = ty - proj.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= speed) {
          this.spawnImpactFlash(tx, ty, proj.color);
          this.spawnFloater(tx, ty + this.unitSize() * 0.4, `-${this.formatDamageValue(proj.amount)}`, rgba(255, 120, 100), 20);
          this.shakeField(5);
          const crystalSprite = this.fieldNode?.getChildByName('GuardCrystal')?.getChildByName('GuardCrystalIcon')?.getComponent(Sprite);
          if (crystalSprite && crystalSprite.isValid) {
            crystalSprite.color = rgba(255, 130, 110, 255);
            setTimeout(() => {
              if (crystalSprite.isValid) {
                crystalSprite.color = rgba(255, 255, 255, 255);
              }
            }, 130);
          }
          proj.node.destroy();
          this.projectiles.splice(i, 1);
        } else {
          proj.x += (dx / dist) * speed;
          proj.y += (dy / dist) * speed;
          proj.node.setPosition(proj.x, proj.y, 0);
          proj.node.angle = Math.atan2(dy, dx) * (180 / Math.PI);
        }
        continue;
      }
      let target = sim.monsters.find((entry) => entry.monsterId === proj.targetId && !entry.dead) ?? null;
      if (!target) {
        let bestDist = Number.POSITIVE_INFINITY;
        for (const candidate of sim.monsters) {
          if (candidate.dead) {
            continue;
          }
          const dist = Math.abs(this.xToPx(candidate.x) - proj.x);
          if (dist < bestDist) {
            bestDist = dist;
            target = candidate;
          }
        }
        if (target) {
          proj.targetId = target.monsterId;
        }
      }
      const tx = target ? this.xToPx(target.x) : proj.x + speed;
      const ty = target ? this.monsterY(target.lane, target.x) + this.monsterJitterY(target) * this.monsterSpread(target.x) + this.unitSize() * 0.12 : proj.y;
      const dx = tx - proj.x;
      const dy = ty - proj.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= speed || !target) {
        if (proj.visualOnly) {
          this.spawnImpactFlash(tx, ty, proj.color);
          this.flashMonster(proj.targetId);
        } else {
          this.resolveProjectileHit(tx, ty, proj.targetId, proj.amount, proj.color);
        }
        proj.node.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }
      proj.x += (dx / dist) * speed;
      proj.y += (dy / dist) * speed;
      proj.node.setPosition(proj.x, proj.y, 0);
      proj.node.angle = Math.atan2(dy, dx) * (180 / Math.PI);
    }
  }

  /** 伤害数字缩写阶梯(2026-08-28 用户拍板):千=K,百万=M,十亿=B;再往上 T/Qa/Qi(放置游戏惯例)。 */
  private formatDamageValue(n: number): string {
    if (n < 1000) {
      return `${n}`;
    }
    const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let value = n;
    let idx = -1;
    while (value >= 1000 && idx < units.length - 1) {
      value /= 1000;
      idx += 1;
    }
    const text = value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '');
    return `${text}${units[idx]}`;
  }

  /** 伤害数字(2026-08-28 参考图重做):每次命中各自弹一个数字、环形四散,不再合并 ×N;
   *  小额白字 / 大额与技能击红字带火焰箭头;同屏上限保性能(超限时小字让位给大字)。 */
  private damageSlot = 0;
  private liveDamageFloaters = 0;

  private queueDamage(targetId: number, amount: number, skill: boolean, x: number, y: number): void {
    void targetId;
    const big = skill || amount >= 1000;
    if (this.liveDamageFloaters >= (big ? 46 : 30)) {
      return;
    }
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    this.damageSlot = (this.damageSlot + 1) % 12;
    const slot = this.damageSlot;
    // 12 方位角错开 + 半径分档:同一目标连续挨打时数字铺成一片,不叠在一个点上
    const angle = (slot / 12) * Math.PI * 2 + (slot % 3) * 0.26;
    const radius = this.unitSize() * (0.3 + (slot % 4) * 0.12);
    const px = x + Math.cos(angle) * radius * 1.5;
    const py = y + this.unitSize() * 0.32 + Math.sin(angle) * radius * 0.8;
    const valueText = this.formatDamageValue(amount);

    const node = this.host.addChildPlainNode(field, 'GuardDamageNum', px, py, big ? 200 : 120, 32);
    node.setSiblingIndex(field.children.length - 1);
    this.liveDamageFloaters += 1;
    let labelX = 0;
    if (big) {
      // 大额/技能击:火焰箭头素材 + 红色粗体大字(参考图)
      this.mountSprite(node, 'Icon', 'ui/guard/crit_marker/spriteFrame', -46, -2, 34, 34);
      labelX = 26;
    }
    const size = skill ? 24 : big ? 22 : 16;
    const color = skill ? rgba(255, 92, 92, 252) : big ? rgba(255, 120, 80, 250) : rgba(255, 248, 236, 240);
    const label = this.host.addChildLabel(node, 'Text', `-${valueText}`, labelX, 0, size, color, new Size(big ? 140 : 116, size + 10));
    label.enableOutline = true;
    label.outlineColor = rgba(40, 12, 6, 255);
    label.outlineWidth = big ? 3 : 2;
    label.isBold = true;

    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 250;
    // 弹出:先小幅弹大再回落,升幅按槽位错开,整片数字有层次不齐步走
    node.setScale(big ? 0.6 : 0.8, big ? 0.6 : 0.8, 1);
    tween(node).to(0.09, { scale: new Vec3(big ? 1.18 : 1.06, big ? 1.18 : 1.06, 1) }, { easing: 'backOut' })
      .to(0.1, { scale: Vec3.ONE }).start();
    const rise = 30 + (slot % 4) * 9;
    const life = big ? 0.95 : 0.78;
    tween(node).by(life, { position: new Vec3(0, rise, 0) }, { easing: 'quadOut' }).start();
    tween(opacity).delay(life * 0.5).to(life * 0.45, { opacity: 0 }).call(() => {
      this.liveDamageFloaters = Math.max(0, this.liveDamageFloaters - 1);
      if (node.isValid) {
        node.destroy();
      }
    }).start();
  }

  /** 命中结算:爆闪+伤害入聚合窗+目标受击红闪。 */
  private resolveProjectileHit(x: number, y: number, targetId: number, amount: number, color: Color): void {
    this.spawnImpactFlash(x, y, color);
    this.queueDamage(targetId, amount, false, x, y);
    this.flashMonster(targetId);
  }

  /** 命中爆闪:小十字星芒 0.18s。 */
  private spawnImpactFlash(x: number, y: number, color: Color): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardImpact', x, y, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(255, 248, 230, 235);
    g.circle(0, 0, 9);
    g.fill();
    g.strokeColor = rgba(color.r, color.g, color.b, 220);
    g.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
    }
    g.stroke();
    const opacity = node.addComponent(UIOpacity);
    tween(node).to(0.18, { scale: new Vec3(1.7, 1.7, 1) }).start();
    tween(opacity).to(0.2, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 格位爆闪(召唤/合成/击杀通用):扩散金环+星芒,big=合成/超阶加倍。 */
  private spawnCellBurst(x: number, y: number, color: Color, big: boolean): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardCellBurst', x, y, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(color.r, color.g, color.b, 235);
    g.lineWidth = big ? 6 : 4;
    g.circle(0, 0, big ? 46 : 32);
    g.stroke();
    g.strokeColor = rgba(255, 248, 224, 220);
    g.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      g.moveTo(Math.cos(a) * (big ? 30 : 20), Math.sin(a) * (big ? 30 : 20));
      g.lineTo(Math.cos(a) * (big ? 62 : 44), Math.sin(a) * (big ? 62 : 44));
    }
    g.stroke();
    const opacity = node.addComponent(UIOpacity);
    tween(node).to(big ? 0.34 : 0.26, { scale: new Vec3(big ? 2.0 : 1.6, big ? 2.0 : 1.6, 1) }, { easing: 'quadOut' }).start();
    tween(opacity).to(big ? 0.36 : 0.28, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 出手金色爆闪(素材版 cast_flash,2026-08-28 用户验收:程序画的圆圈不好看)。 */
  private spawnCastFlash(x: number, y: number, sizePx: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardCastFlash', x, y, sizePx, sizePx);
    node.setSiblingIndex(field.children.length - 1);
    this.mountSprite(node, 'Img', 'ui/guard/cast_flash/spriteFrame', 0, 0, sizePx, sizePx);
    const opacity = node.addComponent(UIOpacity);
    node.setScale(0.55, 0.55, 1);
    tween(node).to(0.22, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' }).start();
    tween(opacity).delay(0.12).to(0.28, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 施放者亮相:英雄脚下金色爆闪+身形弹跳,一眼看清技能是谁放的(2026-08-27 用户验收)。 */
  private highlightCaster(cell: number, label: string): void {
    const center = this.cellCenter(cell);
    this.spawnCastFlash(center.x, center.y - this.unitSize() * 0.24, this.unitSize() * 1.2);
    const hero = this.sim?.heroes.find((entry) => entry.cell === cell);
    const view = hero ? this.heroViews.get(hero.unitId) : null;
    if (view && view.node.isValid) {
      tween(view.node).to(0.1, { scale: new Vec3(1.12, 1.12, 1) }).to(0.14, { scale: Vec3.ONE }).start();
    }
    if (label) {
      this.spawnFloater(center.x, center.y + this.unitSize() * 0.95, label, rgba(255, 226, 130), 18);
    }
  }

  /** 近战刀光:目标处双弧斩闪 0.16s。 */
  private spawnSlashArc(x: number, y: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardSlash', x, y, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    node.angle = ((this.floaterCycle % 3) - 1) * 26;
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(255, 244, 214, 235);
    g.lineWidth = 5;
    g.arc(0, 0, 34, -Math.PI * 0.42, Math.PI * 0.42, false);
    g.stroke();
    g.strokeColor = rgba(255, 190, 120, 200);
    g.lineWidth = 3;
    g.arc(0, 0, 46, -Math.PI * 0.3, Math.PI * 0.3, false);
    g.stroke();
    const opacity = node.addComponent(UIOpacity);
    tween(node).to(0.16, { scale: new Vec3(1.45, 1.45, 1) }).start();
    tween(opacity).to(0.18, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 受击红闪(spine 染色 90ms,syncMonsters 每帧恢复)。 */
  private flashMonster(monsterId: number): void {
    const view = this.monsterViews.get(monsterId);
    if (view) {
      view.hitFlashUntil = Date.now() + 90;
    }
  }

  /** 飘字槽位轮转:连续飘字横向 3 槽×纵向 2 层错开,不再叠成一团(2026-08-26 用户验收)。 */
  private floaterCycle = 0;

  private spawnFloater(x: number, y: number, text: string, color: Color, fontSize = 16): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    this.floaterCycle = (this.floaterCycle + 1) % 6;
    const ox = ((this.floaterCycle % 3) - 1) * 38;
    const oy = Math.floor(this.floaterCycle / 3) * 26;
    const label = this.host.addChildLabel(field, 'GuardFloater', text, x + ox, y + oy, fontSize, color, new Size(190, fontSize + 8));
    label.enableOutline = true;
    label.outlineColor = rgba(20, 12, 8, 255);
    label.outlineWidth = fontSize >= 20 ? 3 : 2;
    label.isBold = true;
    label.node.setSiblingIndex(field.children.length - 1);
    const opacity = label.node.addComponent(UIOpacity);
    opacity.opacity = 240;
    tween(label.node).by(0.8, { position: new Vec3(0, 34, 0) }).start();
    tween(opacity).delay(0.4).to(0.35, { opacity: 0 }).call(() => {
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
        // 只在换格时整层重建;冷却/攻击文字逐帧轻量刷新(整层每 tick 重建会闪)
        if (this.rangeShownDrawnCell !== hero.cell) {
          this.drawRangeIndicator(hero);
        } else {
          this.refreshHeroInfoLive(hero);
        }
      }
      // 选中态合成指引(2026-08-28 用户拍板):可合成同名同星高亮+绿圈脉动,其余变暗
      const heroOpacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
      if (this.rangeShownUnitId !== null) {
        const selectedHero = sim.heroes.find((entry) => entry.unitId === this.rangeShownUnitId);
        const mergeable = !!selectedHero && selectedHero.unitId !== hero.unitId
          && selectedHero.heroCode === hero.heroCode && selectedHero.star === hero.star && hero.star < GUARD_MAX_STAR;
        heroOpacity.opacity = hero.unitId === this.rangeShownUnitId || mergeable ? 255 : 120;
        let mergeHint = view.node.getChildByName('GuardMergeHint');
        if (mergeable) {
          if (!mergeHint) {
            mergeHint = this.host.addChildPlainNode(view.node, 'GuardMergeHint', 0, -this.unitSize() * 0.42, 10, 10);
            const hintG = mergeHint.addComponent(Graphics);
            hintG.strokeColor = rgba(120, 255, 130, 235);
            hintG.lineWidth = 4;
            hintG.ellipse(0, 0, this.unitSize() * 0.42, this.unitSize() * 0.12);
            hintG.stroke();
            tween(mergeHint).repeatForever(tween().to(0.5, { scale: new Vec3(1.15, 1.15, 1) }).to(0.5, { scale: Vec3.ONE })).start();
          }
        } else if (mergeHint) {
          mergeHint.destroy();
        }
      } else {
        heroOpacity.opacity = 255;
        view.node.getChildByName('GuardMergeHint')?.destroy();
      }
      const attackLabel = view.node.getChildByName('GuardHeroAtk')?.getComponent(Label);
      if (attackLabel) {
        attackLabel.string = `${guardHeroAttackValue(sim, hero)}`;
      }
      // 主动技能冷却条(2★ 起):橙=充能中,亮蓝=就绪
      let cdNode = view.node.getChildByName('GuardHeroCd');
      if (!cdNode) {
        cdNode = this.host.addChildPlainNode(view.node, 'GuardHeroCd', 0, -this.heroDisplaySize() * 0.7, this.heroDisplaySize() * 0.8, 6);
        cdNode.addComponent(Graphics);
      }
      const cdG = cdNode.getComponent(Graphics);
      if (cdG) {
        cdG.clear();
        if (hero.star >= 2) {
          const cd = GUARD_HERO_SKILL[hero.role].cdMs;
          const ready = Math.max(0, Math.min(1, 1 - (hero.skillReadyMs - sim.timeMs) / cd));
          const w = this.unitSize() * 0.8;
          cdG.fillColor = rgba(10, 8, 8, 190);
          cdG.roundRect(-w / 2, -3, w, 6, 3);
          cdG.fill();
          cdG.fillColor = ready >= 1 ? rgba(140, 230, 255, 245) : rgba(255, 196, 90, 225);
          cdG.roundRect(-w / 2, -3, Math.max(3, w * ready), 6, 3);
          cdG.fill();
        }
      }
    }
  }

  /** 持续区域(灼烧区/旋风)视图:横跨三车道的地面区域,旋风随时间旋转并跟随推进。 */
  private syncZones(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const live = new Set(sim.zones.map((zone: GuardZone) => zone.zoneId));
    for (const [zoneId, node] of [...this.zoneViews]) {
      if (!live.has(zoneId)) {
        if (node.isValid) {
          node.destroy();
        }
        this.zoneViews.delete(zoneId);
        this.zoneFlights.delete(zoneId);
      }
    }
    for (const zone of sim.zones) {
      let node = this.zoneViews.get(zone.zoneId);
      if (!node) {
        node = this.host.addChildPlainNode(field, `GuardZone_${zone.zoneId}`, this.xToPx(zone.x), this.walkwayY(), 10, 10);
        node.setSiblingIndex(1);
        node.addComponent(Graphics);
        this.zoneViews.set(zone.zoneId, node);
      }
      if (!node.isValid) {
        continue;
      }
      // 起手飞行:450ms 内从施放英雄位置抛物线飞到落点,弹大成型
      const tx = this.xToPx(zone.x);
      const ty = this.walkwayY();
      let px = tx;
      let py = ty;
      let flightScale = 1;
      const flight = this.zoneFlights.get(zone.zoneId);
      if (flight) {
        const t = (sim.timeMs - flight.startMs) / 450;
        if (t >= 1) {
          this.zoneFlights.delete(zone.zoneId);
        } else {
          const eased = 1 - (1 - t) * (1 - t);
          px = flight.fromX + (tx - flight.fromX) * eased;
          py = flight.fromY + (ty - flight.fromY) * eased + Math.sin(Math.max(0, t) * Math.PI) * this.layoutHeight * 0.06;
          flightScale = 0.25 + 0.75 * eased;
        }
      }
      node.setPosition(px, py, 0);
      const g = node.getComponent(Graphics);
      if (!g) {
        continue;
      }
      const radiusPx = Math.max(48, this.xToPx(Math.min(GUARD_SPAWN_X, zone.x + zone.radiusCells)) - this.xToPx(zone.x));
      g.clear();
      if (zone.kind === 'burn') {
        node.angle = 0;
        node.setScale(flightScale, flightScale, 1);
        // 无边框火海(2026-08-28 用户验收:黄色边框不要):各车道地面椭圆火光+跳动余烬
        const pulse = 0.85 + 0.15 * Math.sin(sim.timeMs / 140);
        // 走道单团火海(分区布局后灼烧区落在中央走道上)
        g.fillColor = rgba(255, 120, 40, 66);
        g.ellipse(0, -this.unitSize() * 0.4, radiusPx * 0.95 * pulse, this.unitSize() * 0.18);
        g.fill();
        g.fillColor = rgba(255, 190, 80, 110);
        g.ellipse(0, -this.unitSize() * 0.4, radiusPx * 0.55 * pulse, this.unitSize() * 0.11);
        g.fill();
        g.fillColor = rgba(255, 210, 100, 175);
        for (let i = -2; i <= 2; i += 1) {
          const flickY = -this.unitSize() * (0.22 + 0.16 * Math.sin(sim.timeMs / 170 + i * 1.7));
          g.circle(i * radiusPx * 0.36, flickY, 6);
        }
        g.fill();
      } else {
        // 旋风素材化(2026-09-02 用户拍板 image2 方向):透明漩涡贴图子节点自旋,父节点压扁成地面椭圆
        node.angle = 0;
        let spin = node.getChildByName('GuardZoneWindSpin');
        if (!spin) {
          const d0 = radiusPx * 2.1;
          spin = this.host.addChildPlainNode(node, 'GuardZoneWindSpin', 0, 0, d0, d0);
          this.mountSprite(spin, 'Img', 'ui/guard/fx_wind_zone/spriteFrame', 0, 0, d0, d0);
        }
        node.setScale(flightScale, 0.42 * flightScale, 1);
        const d = radiusPx * 2.1;
        spin.getComponent(UITransform)?.setContentSize(d, d);
        spin.getChildByName('Img')?.getComponent(UITransform)?.setContentSize(d, d);
        spin.angle = ((sim.timeMs / 1000) * 200) % 360;
      }
    }
  }

  private createHeroView(hero: GuardHeroUnit): GuardUnitView {
    const field = this.fieldNode;
    const size = this.heroDisplaySize();
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
    const pendingView: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '', deathAnim: '', hitFlashUntil: 0 };
    this.attachUnitSpine(node, fallback, ally, size, false, pendingView);
    // 名字宽度钳到格距内+SHRINK(视频验收:相邻列名字连成乱串);定位词收进详情卡,不再挤标签
    const nameLabel = this.host.addChildLabel(node, 'GuardHeroName', pool?.displayName ?? hero.heroCode, 0, size * 0.6, 15, rgba(236, 224, 196), new Size(this.cellPitchPx() * 0.94, 20));
    nameLabel.overflow = Label.Overflow.SHRINK;
    const star = this.host.addChildLabel(node, 'GuardHeroStar', '★', 0, size * 0.46, 16, rgba(255, 220, 110), new Size(size * 1.4, 20));
    star.enableOutline = true;
    star.outlineColor = rgba(40, 24, 10, 255);
    star.outlineWidth = 2;
    this.host.addChildLabel(node, 'GuardHeroAtk', '', 0, -size * 0.58, 14, rgba(214, 196, 156, 230), new Size(size * 1.2, 18));
    this.bindHeroDrag(node, hero.unitId);
    return pendingView;
  }

  /** 骨骼挂载(英雄用 snapshot ally 解析;怪物用 spine/monster/<code> 直连);失败保留回退色块。 */
  private attachUnitSpine(node: Node, fallback: Node, ally: BattlePresentationUnitSnapshot | null, size: number, mirror: boolean, view?: GuardUnitView): void {
    const resource = ally ? resolveBattleUnitSpineResource(ally) : null;
    if (!resource || !ally) {
      return;
    }
    // 英雄体型走主战斗统一公式(布阵补偿表):act 系 bounds 虚标(断刃佣兵缩成小人)由逐资源表校准。
    this.loadSpineInto(node, fallback, resource, size, mirror, view, { allyUnit: ally });
  }

  private loadSpineInto(
    node: Node,
    fallback: Node,
    resource: string,
    size: number,
    mirror: boolean,
    view?: GuardUnitView,
    opts?: {
      /** S196 怪物:体型按 标定视高/bounds高 算(bounds 虚标由 DB 校准表补偿,同旧战斗渲染公式),不走英雄的钳制路径。 */
      calibratedScale?: (rawBoundsHeight: number) => number;
      /** S196 素材原点=脚底中心:骨骼节点直接放地面线,不做 bounds 偏移补偿。 */
      footY?: number;
      /** 循环动画优先级(怪物行进优先 walk/run/move)。 */
      preferAnim?: RegExp;
      /** 怪物:动画名走稀有度映射(原始名单会命中 *_turn_/*_link_ 过渡段)。 */
      enemyAnimNames?: boolean;
      /** 英雄:走主战斗统一体型公式(资源补偿表,修 act 系 bounds 虚标导致的体型忽大忽小)。 */
      allyUnit?: BattlePresentationUnitSnapshot;
    },
  ): void {
    const spineNode = this.host.addChildPlainNode(node, 'GuardUnitSpine', 0, opts?.footY ?? -size * 0.36, size, size * 1.1);
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
        const rawNames = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
        if (!runtimeData || rawNames.length === 0) {
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        skeleton.skeletonData = data;
        // S196 怪物骨骼没有 default 皮肤,全部附件挂在具名皮肤里——不 setSkin 就一个附件都不画(怪物隐形根因,2026-08-25)。
        const skin = resolveBattleUnitSpineSkinName(data, runtimeData);
        if (skin) {
          skeleton.setSkin(skin);
          skeleton.setSlotsToSetupPose();
        }
        let idle: string;
        let attack: string;
        if (opts?.enemyAnimNames) {
          const mapped = resolveBattleUnitSpineAnimationNames(data, this.toGuardEnemyUnit(resource));
          idle = mapped.move ?? mapped.idle ?? rawNames[0];
          attack = mapped.attack ?? idle;
        } else {
          idle = (opts?.preferAnim ? rawNames.find((name) => opts.preferAnim!.test(name)) : undefined)
            ?? rawNames.find((name) => /idle|stand|daiji|wait/i.test(name))
            ?? rawNames[0];
          attack = rawNames.find((name) => /atk|attack|gongji|skill|普攻/i.test(name) && !/hit|hurt|dead|die/i.test(name)) ?? idle;
        }
        let fit: number;
        if (opts?.allyUnit) {
          // 体型=共享公式(含 EXTRA 表:罗恩 1.55)× 守卫场微调表(罗恩再 ×1.2)
          fit = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, size, size, this.layoutUiScale, false, opts.allyUnit)
            * (GUARD_HERO_SCALE_TWEAK_BY_ASSET[resolveBattleUnitSpinePrimaryAsset(opts.allyUnit) ?? ''] ?? 1);
          const pos = resolveBattleUnitSpineNodePosition(runtimeData, fit, size, opts.allyUnit, false);
          // 横向偏移钳制 ±12%(2026-09-02 二收:±30% 仍挡不住深渊魔女的 bounds 过冲)——立绘钉在卡位中心附近
          spineNode.setPosition(Math.max(-size * 0.12, Math.min(size * 0.12, pos.x)), pos.y, 0);
        } else if (opts?.calibratedScale) {
          fit = opts.calibratedScale(Math.max(1, Number(runtimeData.height) || 300));
        } else {
          const rawHeight = Math.min(1200, Math.max(140, Number(runtimeData.height) || 300));
          fit = (size * 1.05) / rawHeight;
        }
        spineNode.setScale(mirror ? -fit : fit, fit, 1);
        const track = skeleton.setAnimation(0, idle, true);
        if (!track) {
          // 动画起不来按失败处理:保留回退块,别销毁。
          return;
        }
        if (view) {
          view.skeleton = skeleton;
          view.idleAnim = idle;
          view.attackAnim = attack;
          if (opts?.enemyAnimNames) {
            const mappedNames = resolveBattleUnitSpineAnimationNames(data, this.toGuardEnemyUnit(resource));
            view.deathAnim = mappedNames.death ?? '';
          }
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

  // ── 点击英雄显示攻击范围(2026-08-28 用户拍板:区域制,参考蔚蓝星球——远程=大区域+远端弧形边界,近战=本车道矩形块)──
  private drawRangeIndicator(hero: GuardHeroUnit): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    this.rangeShownDrawnCell = hero.cell;
    field.getChildByName('GuardRangeIndicator')?.destroy();
    const profile = GUARD_ROLE_PROFILE[hero.role];
    // 覆盖范围从水晶起算(与所站格子无关)——同类型英雄范围永远一样大。
    const left = this.xToPx(0);
    const right = this.xToPx(Math.min(GUARD_SPAWN_X, profile.rangeCells));
    const layer = this.host.addChildPlainNode(field, 'GuardRangeIndicator', 0, 0, 10, 10);
    layer.setSiblingIndex(1);
    const g = layer.addComponent(Graphics);
    // 分区布局(2026-08-28):范围=走道打击区横带 + 以水晶为心的远端弧形边界
    const bandTop = this.walkwayY() + this.layoutHeight * 0.15;
    const bandBottom = this.walkwayY() - this.layoutHeight * 0.15;
    g.fillColor = rgba(120, 230, 110, 26);
    g.roundRect(left, bandBottom, right - left, bandTop - bandBottom, 18);
    g.fill();
    const cy = this.walkwayY();
    const radius = Math.max(60, right - left);
    const halfSpan = Math.atan2((bandTop - bandBottom) / 2, radius);
    g.strokeColor = rgba(190, 240, 130, 225);
    g.lineWidth = 6;
    g.arc(left, cy, radius, -halfSpan, halfSpan, false);
    g.stroke();
    // 选中格高亮:素材金光卡(1:1 复刻 2026-08-28)
    const center = this.cellCenter(hero.cell);
    const cellSize = this.cellPitchPx() * 0.92;
    const selW = cellSize * (259 / 213);
    const selH = cellSize * (232 / 213) * (237 / 232);
    this.mountSprite(layer, 'SelectedCard', 'ui/battle/ai/ghud_cell_selected/spriteFrame', center.x, center.y, selW, selH);
    this.showHeroInfo(hero);
  }

  /** 选中英雄信息卡(2026-08-25 用户拍板:点击展示信息,再点消失):名/星/定位/攻击/攻速/射程。 */
  private showHeroInfo(hero: GuardHeroUnit): void {
    const root = this.root;
    const sim = this.sim;
    if (!root || !sim) {
      return;
    }
    root.getChildByName('GuardHeroInfoPanel')?.destroy();
    const pool = sim.pool.find((entry) => entry.heroCode === hero.heroCode);
    const profile = GUARD_ROLE_PROFILE[hero.role];
    const skill = GUARD_HERO_SKILL[hero.role];
    // 放大+内容整体下移进框(2026-08-28 用户验收:名字盖住框顶)
    const w = 404;
    const h = 312;
    const panel = this.host.addChildPlainNode(root, 'GuardHeroInfoPanel', -this.layoutWidth / 2 + 88 + w / 2, this.layoutHeight / 2 - 226 - h / 2, w, h);
    // 素净框(2026-08-28 用户验收:原框坠饰太多且全遮背景):细金线石板框 + 轻透明,背后英雄隐约可见
    this.mountSprite(panel, 'Frame', 'ui/common/ai/bag_grid_panel/spriteFrame', 0, 0, w, h);
    const panelOpacity = panel.addComponent(UIOpacity);
    panelOpacity.opacity = 225;
    const nameLabel = this.host.addChildLabel(panel, 'Name', pool?.displayName ?? hero.heroCode, 0, h / 2 - 58, 21, rgba(255, 234, 180), new Size(w - 96, 26));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.host.addChildLabel(panel, 'Star', '★'.repeat(hero.star), 0, h / 2 - 88, 18, rgba(255, 220, 110), new Size(w - 60, 22));
    const roleName = GUARD_ROLE_LABEL[hero.role] ?? hero.role;
    this.host.addChildLabel(panel, 'Role', `定位 ${roleName} · 覆盖 ${profile.rangeCells} 格`, 0, h / 2 - 118, 16, rgba(226, 214, 188), new Size(w - 60, 20));
    this.host.addChildLabel(panel, 'Atk', `攻击 ${guardHeroAttackValue(sim, hero)} · 攻速 ${(1000 / (profile.intervalMs * (1 - Math.min(50, sim.mods.atkSpeedPct) / 100))).toFixed(1)}/秒`, 0, h / 2 - 148, 15, rgba(255, 200, 150), new Size(w - 60, 20));
    // 主动技能卡(参考蔚蓝星球:技能名+冷却+描述)
    const cdLeft = Math.max(0, (hero.skillReadyMs - sim.timeMs) / 1000);
    const skillState = hero.star >= 2 ? (cdLeft <= 0 ? '就绪' : `冷却 ${cdLeft.toFixed(1)}s`) : '2★ 解锁';
    const skillTitle = this.host.addChildLabel(panel, 'SkillName', `⚡ ${skill.name} · ${skillState}`, 0, h / 2 - 182, 17, rgba(150, 220, 255), new Size(w - 64, 22));
    skillTitle.overflow = Label.Overflow.SHRINK;
    const desc = this.host.addChildLabel(panel, 'SkillDesc', skill.desc, 0, h / 2 - 226, 13, rgba(206, 196, 172), new Size(w - 76, 46));
    desc.overflow = Label.Overflow.SHRINK;
  }

  /** 信息卡逐帧轻量刷新:只改冷却/攻击文字,不重建节点。 */
  private refreshHeroInfoLive(hero: GuardHeroUnit): void {
    const sim = this.sim;
    const panel = this.root?.getChildByName('GuardHeroInfoPanel');
    if (!sim || !panel || !panel.isValid) {
      return;
    }
    const skill = GUARD_HERO_SKILL[hero.role];
    const skillLabel = panel.getChildByName('SkillName')?.getComponent(Label);
    if (skillLabel) {
      const cdLeft = Math.max(0, (hero.skillReadyMs - sim.timeMs) / 1000);
      const skillState = hero.star >= 2 ? (cdLeft <= 0 ? '就绪' : `冷却 ${cdLeft.toFixed(1)}s`) : '2★ 解锁';
      skillLabel.string = `⚡ ${skill.name} · ${skillState}`;
    }
    const atkLabel = panel.getChildByName('Atk')?.getComponent(Label);
    if (atkLabel) {
      const profile = GUARD_ROLE_PROFILE[hero.role];
      atkLabel.string = `攻击 ${guardHeroAttackValue(sim, hero)} · 攻速 ${(1000 / (profile.intervalMs * (1 - Math.min(50, sim.mods.atkSpeedPct) / 100))).toFixed(1)}/秒`;
    }
    const starLabel = panel.getChildByName('Star')?.getComponent(Label);
    if (starLabel) {
      starLabel.string = '★'.repeat(hero.star);
    }
  }

  private clearRangeIndicator(): void {
    this.rangeShownUnitId = null;
    this.rangeShownDrawnCell = -1;
    this.fieldNode?.getChildByName('GuardRangeIndicator')?.destroy();
    this.root?.getChildByName('GuardHeroInfoPanel')?.destroy();
  }

  // ── 技能击特效(2026-08-25 用户拍板):束状=从英雄身前沿攻击方向延伸、锁定怪物方向;爆点=贴在目标身上;
  //    目标死亡自动转向最近存活怪(guardFxAimers 逐帧驱动)。──
  private spawnGuardSkillFx(heroCode: string, heroCell: number | null, monster: GuardMonster): void {
    const field = this.fieldNode;
    const sim = this.sim;
    if (!field || !sim || heroCell === null) {
      return;
    }
    // 被限流时不再静默吞掉:保底从英雄身前发一颗大号技能弹(纯表现)——归属永远可见(2026-09-02 用户验收)
    if (this.guardFxLiveCount >= 5) {
      this.spawnSkillBolt(heroCell, monster);
      return;
    }
    const pool = sim.pool.find((entry) => entry.heroCode === heroCode);
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    const spec: BattleSkillEffectSpec = resolveHeroUltEffect(heroCode, ally?.heroClass ?? null);
    // 表现限流(视频验收):同英雄 1.6s 内只放一次完整特效;束状同屏最多 1 条;被限流走保底技能弹。
    const now = Date.now();
    if (now - (this.heroFxLastAt.get(heroCode) ?? -1e9) < GUARD_HERO_FX_COOLDOWN_MS) {
      this.spawnSkillBolt(heroCell, monster);
      return;
    }
    if (GUARD_BEAM_EFFECT_CODES.has(spec.effect) && this.beamFxLive >= 1) {
      this.spawnSkillBolt(heroCell, monster);
      return;
    }
    this.heroFxLastAt.set(heroCode, now);
    const hero = sim.heroes.find((entry) => entry.cell === heroCell);
    const role = hero?.role ?? 'ranged';
    const origin = this.cellCenter(heroCell);
    const muzzleX = origin.x + this.unitSize() * 0.45;
    const muzzleY = origin.y + this.unitSize() * 0.02;
    const rangePx = Math.max(this.unitSize() * 1.5, this.xToPx(Math.min(GUARD_SPAWN_X, GUARD_ROLE_PROFILE[role].rangeCells)) - muzzleX);
    // 出手闪光:一眼看清技能从谁身前发出(2026-08-26 用户验收)。
    const flash = this.host.addChildPlainNode(field, 'GuardMuzzleFlash', muzzleX, muzzleY, 10, 10);
    const flashG = flash.addComponent(Graphics);
    flashG.fillColor = rgba(255, 230, 150, 210);
    flashG.circle(0, 0, 16);
    flashG.fill();
    const flashOpacity = flash.addComponent(UIOpacity);
    tween(flash).to(0.2, { scale: new Vec3(2.4, 2.4, 1) }).start();
    tween(flashOpacity).to(0.24, { opacity: 0 }).call(() => { if (flash.isValid) { flash.destroy(); } }).start();
    const node = this.host.addChildPlainNode(field, 'GuardSkillFx', muzzleX, muzzleY, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const skeleton = node.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    this.guardFxLiveCount += 1;
    let released = false;
    let beamCounted = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      if (beamCounted) {
        this.beamFxLive = Math.max(0, this.beamFxLive - 1);
      }
      this.guardFxAimers.delete(node);
      this.guardFxLiveCount = Math.max(0, this.guardFxLiveCount - 1);
      if (node.isValid) {
        node.destroy();
      }
    };
    const markBeamLive = (): boolean => {
      if (this.beamFxLive >= 1) {
        return false;
      }
      this.beamFxLive += 1;
      beamCounted = true;
      return true;
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
        const bounds = this.measureGuardFxExtent(skeleton, animationName, `${spec.effect}:${animationName}`);
        const extentW = Math.max(8, bounds?.w ?? 1100);
        const extentH = Math.max(8, bounds?.h ?? 1100);
        const centerX = bounds?.cx ?? 0;
        const centerY = bounds?.cy ?? 0;
        // 束状=仅显式名单(2026-08-27 用户拍板:除凤凰束外全部走"英雄飞向怪物"弹道表现)。
        const vertical = extentH >= extentW * 1.5;
        const beam = GUARD_BEAM_EFFECT_CODES.has(spec.effect);
        // 束状同屏 ≤1(含宽高比判入的):抢不到名额直接放弃本次表现
        if (beam && !markBeamLive()) {
          release();
          return;
        }
        const beamExtent = vertical ? extentH : extentW;
        const beamThickExtent = vertical ? extentW : extentH;
        // 放大上限 1.5×:超采样必糊(高星大目标不再无限放大)。
        const burstFit = Math.min(1.5, (this.unitSize() * 1.7 / Math.max(extentW, extentH)) * (spec.scale || 1));
        let currentTargetId = monster.monsterId;
        let flying = !beam;
        let flyX = muzzleX;
        let flyY = muzzleY;
        const resolveTarget = (): GuardMonster | null => {
          if (!this.sim) {
            return null;
          }
          let target = this.sim.monsters.find((entry) => entry.monsterId === currentTargetId && !entry.dead) ?? null;
          if (!target) {
            // 目标死亡:自动转向离英雄最近的存活怪。
            let bestDist = Number.POSITIVE_INFINITY;
            for (const candidate of this.sim.monsters) {
              if (candidate.dead) {
                continue;
              }
              const dist = Math.abs(this.xToPx(candidate.x) - muzzleX);
              if (dist < bestDist) {
                bestDist = dist;
                target = candidate;
              }
            }
            if (target) {
              currentTargetId = target.monsterId;
            }
          }
          return target;
        };
        const aim = (): void => {
          if (!node.isValid) {
            return;
          }
          const target = resolveTarget();
          if (!target) {
            return;
          }
          const tx = this.xToPx(target.x);
          const ty = this.monsterY(target.lane, target.x) + this.monsterJitterY(target) * this.monsterSpread(target.x) + this.unitSize() * 0.1;
          if (beam) {
            const dx = tx - muzzleX;
            const dy = ty - muzzleY;
            const dist = Math.max(this.unitSize(), Math.hypot(dx, dy));
            // 角度钳制:以英雄前方(朝右)为基准上下各 45°,火柱不乱转(2026-08-26 用户拍板)。
            const aimAngle = Math.max(-45, Math.min(45, Math.atan2(dy, dx) * (180 / Math.PI)));
            node.angle = aimAngle + (vertical ? -90 : 0);
            const len = Math.min(Math.max(dist, this.unitSize() * 1.5), rangePx);
            // 拉伸上限 1.5× 可读基准(视频验收 2.2× 仍占屏 1/3 且糊):柱身锚身前指向目标,尖端尽力延伸。
            const naturalFit = (this.unitSize() * 2.0) / Math.max(extentW, extentH);
            const fitLen = Math.min(len / beamExtent, naturalFit * 1.5);
            const fitThick = Math.min(fitLen * (spec.scale || 1), (this.unitSize() * 1.8) / beamThickExtent, naturalFit * 1.6);
            // 竖版素材长度轴=本地 Y(旋转 -90° 后指向目标),横版=本地 X。
            if (vertical) {
              node.setScale(fitThick, fitLen, 1);
            } else {
              node.setScale(fitLen, fitThick, 1);
            }
            // 根部贴炮口:内容"根部"(长度轴负端+视觉内缩标定)经缩放+最终旋转后补偿——亮部从英雄身前喷出。
            const inset = (GUARD_BEAM_ROOT_INSET[spec.effect] ?? 0) * beamExtent;
            const rootLx = vertical ? centerX * fitThick : (centerX - extentW / 2 + inset) * fitLen;
            const rootLy = vertical ? (centerY - extentH / 2 + inset) * fitLen : centerY * fitThick;
            const nodeRad = node.angle * (Math.PI / 180);
            const cos = Math.cos(nodeRad);
            const sin = Math.sin(nodeRad);
            node.setPosition(muzzleX - (rootLx * cos - rootLy * sin), muzzleY - (rootLx * sin + rootLy * cos), 0);
          } else if (flying) {
            // 弹道:每 tick 朝当前目标位置推进,到位后转命中段
            const dx = tx - flyX;
            const dy = ty - flyY;
            const dist = Math.hypot(dx, dy);
            const stepLen = 150;
            if (dist <= stepLen) {
              flying = false;
              flyX = tx;
              flyY = ty;
              try {
                skeleton.setAnimation(0, animationName, false);
                skeleton.setCompleteListener(() => release());
              } catch (error) {
                void error;
                release();
              }
            } else {
              flyX += (dx / dist) * stepLen;
              flyY += (dy / dist) * stepLen;
              // 弹道朝向也钳在前向 ±75°,不向后翻转
              node.angle = Math.max(-75, Math.min(75, Math.atan2(dy, dx) * (180 / Math.PI)));
            }
            node.setScale(burstFit, burstFit, 1);
            node.setPosition(flyX - centerX * burstFit, flyY - centerY * burstFit, 0);
          } else {
            // 命中段:贴住目标(目标死了由 resolveTarget 换最近怪)
            node.setPosition(tx - centerX * burstFit, ty - centerY * burstFit, 0);
          }
        };
        aim();
        this.guardFxAimers.set(node, aim);
        if (beam) {
          let plays = 0;
          skeleton.setAnimation(0, animationName, false);
          skeleton.setCompleteListener(() => {
            plays += 1;
            if (plays >= 2 || spec.loop) {
              release();
              return;
            }
            try {
              skeleton.setAnimation(0, animationName, false);
            } catch (error) {
              void error;
              release();
            }
          });
        } else {
          // 飞行段循环播放,命中时重播一次(aim 内切换)
          skeleton.setAnimation(0, animationName, true);
        }
      } catch (error) {
        void error;
        release();
      }
    });
    tween(node).delay(3.4).call(release).start();
  }

  /** 采样动画 3 时刻,遍历 Region/Mesh 附件求 AABB 宽高与原点偏移(按套缓存;测不出返回 null 走兜底)。 */
  private measureGuardFxExtent(skeleton: sp.Skeleton, animationName: string, cacheKey: string): { w: number; h: number; cx: number; cy: number } | null {
    if (this.guardFxBoundsCache.has(cacheKey)) {
      return this.guardFxBoundsCache.get(cacheKey) ?? null;
    }
    let extent: { w: number; h: number; cx: number; cy: number } | null = null;
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
          extent = { w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
        }
      }
    } catch (error) {
      void error;
      extent = null;
    }
    this.guardFxBoundsCache.set(cacheKey, extent);
    return extent;
  }

  /** 合成解锁专属技能横幅:点明解锁了什么(2 星=专属技能),2.2s 上浮淡出。 */
  private showSkillUnlockBanner(cell: number, heroCode: string): void {
    const root = this.root;
    if (!root) {
      return;
    }
    void cell;
    const pool = this.sim?.pool.find((entry) => entry.heroCode === heroCode);
    const name = pool?.displayName ?? heroCode;
    root.getChildByName('GuardSkillUnlockBanner')?.destroy();
    // 顶部居中吐司(原贴英雄位置会溢出/压弹框);文字 SHRINK 兜底,绝不截字。
    const w = 560;
    const h = 104;
    const banner = this.host.addChildPlainNode(root, 'GuardSkillUnlockBanner', 0, this.layoutHeight * 0.26, w, h);
    const g = banner.addComponent(Graphics);
    g.fillColor = rgba(30, 22, 14, 240);
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.fill();
    g.strokeColor = rgba(255, 210, 110, 250);
    g.lineWidth = 3;
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.stroke();
    const title = this.host.addChildLabel(banner, 'Title', `⚡ ${name} 技能解锁!`, 0, h * 0.2, 24, rgba(255, 226, 130), new Size(w - 28, 30));
    title.enableOutline = true;
    title.outlineColor = rgba(60, 30, 10, 255);
    title.outlineWidth = 2;
    title.overflow = Label.Overflow.SHRINK;
    const heroRole = this.sim?.heroes.find((entry) => entry.heroCode === heroCode)?.role ?? this.sim?.pool.find((entry) => entry.heroCode === heroCode)?.role;
    const skill = heroRole ? GUARD_HERO_SKILL[heroRole] : null;
    const detail = this.host.addChildLabel(banner, 'Detail', skill ? `主动技能「${skill.name}」已解锁:${skill.desc}` : '2★ 专属技能已解锁', 0, -h * 0.22, 16, rgba(236, 224, 196), new Size(w - 32, 24));
    detail.overflow = Label.Overflow.SHRINK;
    const opacity = banner.addComponent(UIOpacity);
    tween(banner).by(2.4, { position: new Vec3(0, 40, 0) }).start();
    tween(opacity).delay(1.6).to(0.8, { opacity: 0 }).call(() => { if (banner.isValid) { banner.destroy(); } }).start();
  }

  /** 击杀掉金币:原地落地小弹跳 → 飞向右上角战斗金币 → 计数滚动+金币栏脉冲(2026-08-26 用户拍板)。 */
  private spawnGoldCoin(fieldX: number, fieldY: number): void {
    const root = this.root;
    if (!root || this.goldCoinLive >= 12) {
      return;
    }
    this.goldCoinLive += 1;
    const yOffset = -this.layoutHeight * 0.03;
    const size = 40;
    const coin = this.host.addChildPlainNode(root, 'GuardGoldCoin', fieldX, fieldY + yOffset, size, size);
    this.mountSprite(coin, 'Img', 'ui/guard/coin_gold/spriteFrame', 0, 0, size, size);
    const groundY = fieldY + yOffset - this.unitSize() * 0.35;
    const targetX = this.layoutWidth / 2 - 180;
    const targetY = this.layoutHeight / 2 - 42;
    let released = false;
    const done = (): void => {
      if (released) {
        return;
      }
      released = true;
      this.goldCoinLive = Math.max(0, this.goldCoinLive - 1);
      if (coin.isValid) {
        coin.destroy();
      }
      const goldText = root.getChildByName('GuardHud')?.getChildByName('GuardGoldText');
      if (goldText && goldText.isValid) {
        tween(goldText).to(0.08, { scale: new Vec3(1.22, 1.22, 1) }).to(0.12, { scale: Vec3.ONE }).start();
      }
    };
    tween(coin)
      .to(0.16, { position: new Vec3(fieldX, groundY, 0) }, { easing: 'quadIn' })
      .to(0.1, { position: new Vec3(fieldX, groundY + 16, 0) }, { easing: 'quadOut' })
      .to(0.08, { position: new Vec3(fieldX, groundY, 0) }, { easing: 'quadIn' })
      .delay(0.12)
      .to(0.45, { position: new Vec3(targetX, targetY, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' })
      .call(done)
      .start();
    tween(coin).delay(1.6).call(done).start();
  }

  /** 怪物动画名解析用的敌方单位壳(resolveBattleUnitSpineAnimationNames 需要 side/rarity 上下文,抄 LobbyIdleStageRenderer)。 */
  private toGuardEnemyUnit(resource: string): BattlePresentationUnitSnapshot {
    return {
      unitKey: `guard-monster:${resource}`,
      side: 'enemy',
      slot: 0,
      displayName: '怪物',
      subline: '',
      rarity: 'ENEMY',
      level: 1,
      power: 0,
      role: 'front',
      leader: false,
      hpRatio: 1,
      sourceHeroId: 0,
      heroCode: '',
      heroClass: null,
      portraitAsset: null,
      spineAsset: resource,
      spineUuid: null,
    };
  }

  /** 怪物散布抖动(monsterId 哈希,确定性,不耗 rng):同车道内 ±0.32 车道高,摆脱"一条直线"。 */
  private monsterJitterY(monster: GuardMonster): number {
    const hash = (monster.monsterId * 2654435761) >>> 0;
    return (((hash % 1000) / 1000) - 0.5) * this.layoutHeight * 0.155 * 0.64;
  }

  /** 出售落点判定:拖过 0 列左缘(格子区之外)且在水晶高度带内才算,避免合成拖拽误碰(2026-09-02)。 */
  private isSellDropPosition(x: number, y: number): boolean {
    const sellBoundaryX = this.cellCenter(0).x - this.cellPitchPx() * 0.55;
    const crystalY = -this.layoutHeight * 0.055;
    return x < sellBoundaryX && Math.abs(y - crystalY) < this.layoutHeight * 0.24;
  }

  /** 拖拽悬停出售区:水晶染红提示"松手=卖"。 */
  private setCrystalSellHover(hover: boolean): void {
    const icon = this.fieldNode?.getChildByName('GuardCrystal')?.getChildByName('GuardCrystalIcon')?.getComponent(Sprite);
    if (icon && icon.isValid) {
      icon.color = hover ? rgba(255, 140, 120, 255) : rgba(255, 255, 255, 255);
    }
  }

  private bindHeroDrag(node: Node, unitId: number): void {
    // 点选与拖拽共存:位移 <10px 视为点击(选中/再点收起,2026-08-25 用户拍板);≥10px 走拖拽合成/换位。
    let movedPx = 0;
    node.on(Node.EventType.TOUCH_START, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      const hero = this.sim?.heroes.find((entry) => entry.unitId === unitId);
      if (hero) {
        movedPx = 0;
        this.dragFromCell = hero.cell;
        node.setSiblingIndex((this.fieldNode?.children.length ?? 2) - 1);
      }
    }, this);
    node.on(Node.EventType.TOUCH_MOVE, (event: { getUIDelta?: () => { x: number; y: number }; getDeltaX?: () => number; getDeltaY?: () => number }) => {
      if (this.dragFromCell === null || !node.isValid) {
        return;
      }
      const deltaX = event.getUIDelta ? event.getUIDelta().x : event.getDeltaX ? event.getDeltaX() : 0;
      const deltaY = event.getUIDelta ? event.getUIDelta().y : event.getDeltaY ? event.getDeltaY() : 0;
      movedPx += Math.abs(deltaX) + Math.abs(deltaY);
      node.setPosition(node.position.x + deltaX, node.position.y + deltaY, 0);
      // 拖到出售区时水晶染红提示,离开恢复(2026-09-02 误卖反馈配套)
      this.setCrystalSellHover(this.isSellDropPosition(node.position.x, node.position.y));
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
      if (movedPx < 10) {
        // 点击:选中显示范围+信息卡;再点同一英雄收起。
        if (this.rangeShownUnitId === unitId) {
          this.clearRangeIndicator();
        } else {
          const hero = sim.heroes.find((entry) => entry.unitId === unitId);
          if (hero) {
            this.rangeShownUnitId = unitId;
            this.drawRangeIndicator(hero);
          }
        }
        this.syncHeroes();
        return;
      }
      this.setCrystalSellHover(false);
      // 拖到水晶本体=出售(格满且无可合成的死局解法,2026-08-26)。
      // 判定收紧(2026-09-02 用户反馈:水晶离格子近,合成拖拽误碰被卖):必须拖过 0 列左缘且落在水晶高度带内,不再是整个左半区。
      if (this.isSellDropPosition(node.position.x, node.position.y)) {
        const value = guardSellHero(sim, fromCell);
        if (value !== null) {
          this.clearRangeIndicator();
          this.host.setStatus(`已出售,回收 ${value} 金币。`);
          this.spawnFloater(this.xToPx(0.4), this.laneToPy(1) + this.unitSize() * 0.9, `出售 +${value}`, rgba(255, 214, 92), 18);
          this.syncHeroes();
          return;
        }
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
    // 冒泡拦截:英雄自己的点击不触发根节点"点空白关闭选中"
    node.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      finishDrag();
    }, this);
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
      // 受击顶退(打击感):红闪期间向后小位移,随时间衰减
      const flashLeft = view.hitFlashUntil - Date.now();
      const hitJiggle = !monster.dead && flashLeft > 0 ? (flashLeft / 90) * 7 : 0;
      view.node.setPosition(this.xToPx(monster.x) + hitJiggle, this.monsterY(monster.lane, monster.x) + jitterY * this.monsterSpread(monster.x) + flyLift, 0);
      if (monster.dead) {
        // 死亡演出:有死亡动画播动画后淡出,否则淡出下沉(打击感 2026-08-26)
        if (view.lastAnimKey !== 'dead') {
          view.lastAnimKey = 'dead';
          // 死亡瞬间清掉血条(视频验收:'血没空就死'的错觉=死时血条残留旧值)
          view.node.getChildByName('GuardMonsterHp')?.getComponent(Graphics)?.clear();
          const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
          if (view.skeleton && view.skeleton.isValid) {
            view.skeleton.color = GUARD_SPINE_WHITE;
          }
          if (view.skeleton && view.skeleton.isValid && view.deathAnim) {
            try {
              view.skeleton.setAnimation(0, view.deathAnim, false);
            } catch (error) {
              void error;
            }
            tween(opacity).delay(0.7).to(0.5, { opacity: 0 }).start();
          } else {
            tween(opacity).to(0.5, { opacity: 0 }).start();
            tween(view.node).by(0.5, { position: new Vec3(0, -14, 0) }).start();
          }
        }
        continue;
      }
      // 状态表现:受击红闪 > 减速冰蓝染色 > 正常。
      // 减速只染本体不加挂件(2026-09-02 用户反馈:雪星+蓝雾看着像技能,改成怪物身体变冰蓝一眼看出被减速)。
      const slowed = monster.slowUntilMs > sim.timeMs;
      const stunned = monster.stunnedUntilMs > sim.timeMs;
      if (view.skeleton && view.skeleton.isValid) {
        view.skeleton.color = view.hitFlashUntil > Date.now() ? GUARD_HIT_FLASH_COLOR : slowed ? GUARD_SLOW_TINT_COLOR : GUARD_SPINE_WHITE;
      }
      const slowMark = view.node.getChildByName('GuardSlowMark');
      if (slowMark) {
        slowMark.destroy();
      }
      let stunMark = view.node.getChildByName('GuardStunMark');
      if (stunned && !stunMark) {
        stunMark = this.host.addChildPlainNode(view.node, 'GuardStunMark', 0, this.unitSize() * 0.52, 40, 40);
        this.mountSprite(stunMark, 'Img', 'ui/battle/ai/buff_stun/spriteFrame', 0, 0, 40, 40);
      } else if (!stunned && stunMark) {
        stunMark.destroy();
      }
      const hpBar = view.node.getChildByName('GuardMonsterHp');
      const hpGraphics = hpBar?.getComponent(Graphics);
      const hpTransform = hpBar?.getComponent(UITransform);
      if (hpBar && hpGraphics && hpTransform) {
        const ratio = Math.max(0, monster.hp / monster.maxHp);
        hpGraphics.clear();
        // 满血不显示血条(视频验收:入场怪扎堆时几十条红条叠成噪声);BOSS 走顶部大血条
        if (ratio < 1 && monster.kind !== 'boss') {
          const barW = hpTransform.width;
          hpGraphics.fillColor = rgba(8, 8, 10, 210);
          hpGraphics.rect(-barW / 2, -3, barW, 6);
          hpGraphics.fill();
          hpGraphics.fillColor = monster.kind === 'elite' ? rgba(255, 150, 60, 240) : rgba(224, 82, 64, 230);
          hpGraphics.rect(-barW / 2, -3, Math.max(1, barW * ratio), 6);
          hpGraphics.fill();
        }
      }
    }
    this.refreshBossTopBar();
  }

  /** BOSS 顶部大血条(视频验收:×6 体型配 220px 小条看不见):取当前存活最强 BOSS,画在波次标题下方。 */
  private refreshBossTopBar(): void {
    const sim = this.sim;
    const hud = this.root?.getChildByName('GuardHud');
    const bar = hud?.getChildByName('GuardBossTopBar');
    const g = bar?.getComponent(Graphics);
    const label = bar?.getChildByName('GuardBossTopBarText')?.getComponent(Label);
    if (!sim || !bar || !g || !label) {
      return;
    }
    const boss = sim.monsters.find((entry) => entry.kind === 'boss' && !entry.dead) ?? null;
    g.clear();
    if (!boss) {
      label.string = '';
      return;
    }
    const barW = 460;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    g.fillColor = rgba(10, 8, 8, 225);
    g.roundRect(-barW / 2, -11, barW, 22, 10);
    g.fill();
    g.fillColor = ratio > 0.35 ? rgba(235, 60, 45, 250) : rgba(255, 140, 60, 250);
    g.roundRect(-barW / 2, -11, Math.max(8, barW * ratio), 22, 10);
    g.fill();
    g.strokeColor = rgba(255, 200, 120, 235);
    g.lineWidth = 2;
    g.roundRect(-barW / 2, -11, barW, 22, 10);
    g.stroke();
    label.string = `BOSS  ${Math.ceil(boss.hp)} / ${boss.maxHp}`;
  }

  private createMonsterView(monster: GuardMonster): GuardUnitView {
    const field = this.fieldNode;
    const unit = this.unitSize();
    const kindMult = GUARD_MONSTER_DISPLAY_SCALE[monster.kind] ?? 1;
    const baseSize = unit * kindMult;
    const node = this.host.addChildPlainNode(field ?? this.host.node, `GuardMonster_${monster.monsterId}`, this.xToPx(monster.x), this.monsterY(monster.lane, monster.x), baseSize, baseSize);
    // 地面阴影:近黑素材在暖色地面上的剪影分离
    const shadow = node.addComponent(Graphics);
    shadow.fillColor = rgba(8, 5, 3, 105);
    shadow.ellipse(0, -unit * 0.45, Math.min(baseSize, unit * 2.4) * 0.34, unit * 0.065);
    shadow.fill();
    const fallback = this.host.addChildPlainNode(node, 'GuardMonsterFallback', 0, 0, baseSize * 0.6, baseSize * 0.7);
    const g = fallback.addComponent(Graphics);
    g.fillColor = monster.kind === 'boss' ? rgba(190, 70, 60, 200) : monster.kind === 'elite' ? rgba(200, 130, 60, 190) : rgba(120, 96, 88, 180);
    g.roundRect(-baseSize * 0.3, -baseSize * 0.35, baseSize * 0.6, baseSize * 0.7, 8);
    g.fill();
    // 怪物朝左走:素材原始朝右为主,镜像面向水晶。目录名≠文件基名,走映射表。
    // 体型 = 标定视高(unit×体型倍率×DB逐皮肤校准,BOSS 钳 0.72 屏高)/ bounds 高——与旧战斗渲染同一公式;
    // S196 素材原点=脚底中心,直接脚踩地面线,不吃 bounds 偏移。
    const dbScale = GUARD_MONSTER_DB_SCALE[monster.spineCode] ?? 1;
    const targetVisualH = Math.min(unit * kindMult * dbScale, this.layoutHeight * 0.62);
    const view: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '', deathAnim: '', hitFlashUntil: 0 };
    this.loadSpineInto(node, fallback, guardMonsterSpineResource(monster.spineCode), baseSize, true, view, {
      calibratedScale: (rawBoundsHeight) => targetVisualH / rawBoundsHeight,
      footY: -unit * 0.45,
      enemyAnimNames: true,
    });
    const hpBar = this.host.addChildPlainNode(node, 'GuardMonsterHp', 0, Math.min(baseSize * 0.58, this.layoutHeight * 0.4), Math.min(baseSize * 0.9, monster.kind === 'boss' ? 220 : 110), 6);
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
    const panelH = height * 0.56;
    this.paintOverlayPanel(overlay, panelH * 1.65, panelH, -height * 0.02);
    const title = rush ? '试炼结束!' : victory ? '守卫成功!' : '水晶破碎…';
    const detail = sim
      ? rush
        ? `层数 ${guardTrialLayers(sim)}(BOSS×${sim.bossKills} + 波次 ${sim.wave})· 击杀 ${sim.killCount} · 用时 ${Math.round(sim.timeMs / 1000)} 秒`
        : `坚守 ${sim.wave} 波 · 击杀 ${sim.killCount} · 用时 ${Math.round(sim.timeMs / 1000)} 秒`
      : '';
    this.host.addChildLabel(overlay, 'GuardEndTitle', title, 0, -height * 0.02 + panelH / 2 - 76, 34, victory || rush ? rgba(255, 232, 150) : rgba(255, 150, 130), new Size(width * 0.8, 46));
    this.host.addChildLabel(overlay, 'GuardEndDetail', detail, 0, height * 0.12, 20, rgba(226, 210, 180), new Size(width * 0.7, 28));
    this.host.addChildLabel(overlay, 'GuardEndSettle', '正在提交结算…', 0, height * 0.04, 18, rgba(196, 182, 152), new Size(width * 0.7, 24));
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
      this.host.addChildLabel(overlay, 'GuardEndRewards', rewards, 0, -this.layoutHeight * 0.05, 19, rgba(255, 226, 150), new Size(this.layoutWidth * 0.7, 26));
    }
    const back = this.mountPrimaryButton(overlay, 'GuardEndBack', 0, -this.layoutHeight * 0.2, 236);
    this.host.addChildLabel(back, 'GuardEndBackLabel', '返回大厅', 0, 0, 22, rgba(255, 238, 190), new Size(220, 28));
    back.on(Node.EventType.TOUCH_END, () => this.host.returnToLobbyFromBattlePreview(), this);
  }
}
