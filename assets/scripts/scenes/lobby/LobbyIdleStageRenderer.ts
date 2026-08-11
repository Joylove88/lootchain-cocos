import {
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  UIOpacity,
  Vec3,
  resources,
  sp,
  tween,
} from 'cc';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { safeText } from '../UiTextFormatter';
import { C1812_BUTTON_DANGER_ASSET, C1812_TITLE_BANNER_ASSET } from '../C1812CommonUiAssets';
import { BAG_AI_BUTTON_CRIMSON_ASSET } from './LobbyBagPanelRenderer';
import { rgba, type UiLayout } from './LobbyHudTypes';
import {
  isBattleUnitSpineDataAsset,
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineAnimationNames,
  resolveBattleUnitSpineMirrorScaleX,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
  type BattleUnitSpineAnimationNames,
} from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';

export interface LobbyIdleStageHost {
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
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  currentLobbyFormationHeroIds(): number[];
  openLobbyBattlePreviewPanel(stageCode: string): void;
  setStatus(text: string): void;
  currentIdleSummary?(): import('../../types/IdleTypes').PlayerIdleSummaryVO | null;
  isIdleClaiming?(): boolean;
  claimIdleReward?(): void;
  isAutoChallengeEnabled?(): boolean;
  toggleAutoChallenge?(): void;
}

const IDLE_MONSTER_PORTRAITS = [
  'ui/battle/ai/monster_grunt_1/spriteFrame',
  'ui/battle/ai/monster_grunt_2/spriteFrame',
  'ui/battle/ai/monster_grunt_3/spriteFrame',
];

// 大厅小怪骨骼(与战斗同源 S196 怪物包);height=目标显示高(px×uiScale)。
const IDLE_MONSTER_SPINES = [
  { resource: 'spine/monster/medium_dog/medium_base_001', height: 104 },
  { resource: 'spine/monster/small_spider/small_base_001', height: 78 },
];

/**
 * 大厅挂机演出(第一期,纯本地表现):
 * 上阵英雄站魔法阵 idle/attack 循环,小怪波次淡入受击倒下重生,金币飘字标注"预览"。
 * 不调用任何写接口;挂机收益/层数推进由服务端结算接口就绪后接入(第二期)。
 */
export class LobbyIdleStageRenderer {
  constructor(private readonly host: LobbyIdleStageHost) {}

  render(parent: Node, layout: UiLayout, towerStageCode: string, towerFloor = 0): void {
    const scale = Math.max(0.6, Math.min(1, layout.uiScale));
    const width = layout.stageWidth;
    const height = layout.stageHeight;
    const stage = this.host.addChildPlainNode(parent, 'LobbyIdleStage', 0, 0, width, height);

    const stageCode = towerStageCode || 'MAIN_1_1';
    // 优先用外部传入的真实累计层数(按 adventure 关卡序数出);缺省再按 stageCode 估算兜底。
    const floor = towerFloor > 0 ? towerFloor : this.resolveTowerFloor(stageCode);

    this.renderFloorPlate(stage, width, height, scale, floor);
    this.renderIdleParty(stage, width, height, scale);
    this.renderIdleMonsters(stage, width, height, scale);
    this.renderIdleRewardPanel(stage, width, height, scale, floor);
    // 挑战 BOSS 按钮移除:挑战入口统一走右下深渊爬塔导航;自动挑战占位随二期结算接口一起回归。
    void stageCode;
  }

  // MAIN_a_b → 爬塔层数(每章 16 层)。
  private resolveTowerFloor(stageCode: string): number {
    const match = /^MAIN_(\d+)_(\d+)$/.exec(stageCode.trim());
    if (!match) {
      return 1;
    }
    return (Number(match[1]) - 1) * 16 + Number(match[2]);
  }

  private renderFloorPlate(parent: Node, width: number, height: number, scale: number, floor: number): void {
    const plateWidth = Math.min(320 * scale, width * 0.3);
    const plateHeight = plateWidth * (268 / 800);
    this.host.addSprite('LobbyIdleFloorBanner', C1812_TITLE_BANNER_ASSET, 0, height / 2 - 96 * scale, plateWidth, plateHeight, parent);
    const label = this.host.addChildLabel(parent, 'LobbyIdleFloorLabel', `深渊爬塔 · 第 ${floor} 层`, 0, height / 2 - 96 * scale, 20 * scale, rgba(255, 232, 168), new Size(plateWidth - 60 * scale, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
  }

  // 上阵英雄(空阵容取战力前 5)站魔法阵弧线。
  private renderIdleParty(parent: Node, width: number, height: number, scale: number): void {
    const state = this.host.currentLobbyHeroRosterState();
    const selectedIds = this.host.currentLobbyFormationHeroIds();
    const byId = new Map(state.heroes.map((hero) => [hero.id, hero]));
    let party = selectedIds.map((id) => byId.get(id)).filter((hero): hero is LobbyHeroItemVO => !!hero);
    if (party.length === 0) {
      party = state.heroes
        .filter((hero) => hero.id > 0 && !hero.protagonist)
        .sort((a, b) => b.power - a.power)
        .slice(0, 5);
    }
    party = party.slice(0, 5);
    // 站进地面圆环中心(阵眼在画面中下部),弧线收紧靠前。
    const baseY = -height * 0.26;
    const arc = [
      { x: -width * 0.16, y: baseY - 12 * scale },
      { x: -width * 0.08, y: baseY + 4 * scale },
      { x: 0, y: baseY + 12 * scale },
      { x: width * 0.08, y: baseY + 4 * scale },
      { x: width * 0.16, y: baseY - 12 * scale },
    ];
    party.forEach((hero, index) => {
      const pos = arc[index] ?? arc[arc.length - 1];
      this.renderIdleHero(parent, hero, pos.x, pos.y, 185 * scale, 239 * scale, scale, index);
    });
  }

  private renderIdleHero(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, slotWidth: number, slotHeight: number, scale: number, index: number): void {
    const actor = this.host.addChildPlainNode(parent, `LobbyIdleHero_${index}`, x, y, slotWidth, slotHeight);
    const shadow = actor.addComponent(Graphics);
    shadow.fillColor = rgba(0, 0, 0, 110);
    shadow.ellipse(0, -slotHeight * 0.44, slotWidth * 0.32, Math.max(5 * scale, slotHeight * 0.05));
    shadow.fill();

    const unit = this.toIdleBattleUnit(hero);
    const resourcePath = resolveBattleUnitSpineResource(unit);
    if (!resourcePath) {
      this.renderIdleHeroFallback(actor, hero, slotWidth, slotHeight, scale);
      return;
    }
    const spineNode = this.host.addChildPlainNode(actor, 'LobbyIdleHeroSpine', 0, 0, slotWidth * 2.2, slotHeight * 2.2);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    skeleton.timeScale = 0.9;
    this.loadSpineData(resourcePath, (data) => {
      if (!actor.isValid || !spineNode.isValid) {
        return;
      }
      if (!data) {
        spineNode.destroy();
        this.renderIdleHeroFallback(actor, hero, slotWidth, slotHeight, scale);
        return;
      }
      const runtimeData = resolveBattleUnitSpineRuntimeData(data);
      if (!runtimeData) {
        spineNode.destroy();
        this.renderIdleHeroFallback(actor, hero, slotWidth, slotHeight, scale);
        return;
      }
      try {
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        skeleton.skeletonData = data;
        const skin = resolveBattleUnitSpineSkinName(data, runtimeData);
        if (skin) {
          skeleton.setSkin(skin);
        }
        const resolvedScale = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, slotWidth, slotHeight, scale, false, unit);
        spineNode.setScale(resolveBattleUnitSpineMirrorScaleX(resolvedScale, false), resolvedScale, 1);
        const pos = resolveBattleUnitSpineNodePosition(runtimeData, resolvedScale, slotHeight, unit, false);
        spineNode.setPosition(pos.x, pos.y, 0);
        const names = resolveBattleUnitSpineAnimationNames(data, unit);
        if (names.idle) {
          skeleton.setAnimation(0, names.idle, true);
        }
        this.startHeroAttackLoop(actor, skeleton, names.attack || names.skill1 || null, names.idle || null, index);
      } catch (error) {
        console.warn('[IdleStage] spine apply failed', hero.heroCode, error);
        if (spineNode.isValid) {
          spineNode.destroy();
        }
        this.renderIdleHeroFallback(actor, hero, slotWidth, slotHeight, scale);
      }
    });
  }

  // 心跳式攻击循环:随机间隔挥砍一次后回 idle,节点销毁自动停止。
  private startHeroAttackLoop(actor: Node, skeleton: sp.Skeleton, attackName: string | null, idleName: string | null, index: number): void {
    if (!attackName) {
      return;
    }
    const swing = (): void => {
      if (!actor.isValid || !skeleton.isValid) {
        return;
      }
      try {
        skeleton.setAnimation(0, attackName, false);
        if (idleName) {
          skeleton.addAnimation(0, idleName, true, 0);
        }
      } catch {
        return;
      }
      tween(actor)
        .delay(1.6 + ((index * 0.7) % 1.4) + Math.random() * 1.6)
        .call(swing)
        .start();
    };
    tween(actor)
      .delay(0.8 + index * 0.45)
      .call(swing)
      .start();
  }

  private renderIdleHeroFallback(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const graphics = parent.getComponent(Graphics) ?? parent.addComponent(Graphics);
    graphics.fillColor = this.resolveRarityColor(hero.rarity, 216);
    graphics.moveTo(-20 * scale, -height * 0.3);
    graphics.lineTo(-11 * scale, height * 0.08);
    graphics.lineTo(0, height * 0.2);
    graphics.lineTo(12 * scale, height * 0.08);
    graphics.lineTo(20 * scale, -height * 0.3);
    graphics.close();
    graphics.fill();
    graphics.fillColor = rgba(229, 173, 82, 230);
    graphics.circle(0, height * 0.24, 9 * scale);
    graphics.fill();
    const label = this.host.addChildLabel(parent, 'LobbyIdleHeroName', safeText(hero.heroName).slice(0, 4), 0, -height * 0.4, 12 * scale, rgba(240, 214, 152), new Size(width, 14 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }

  // 两只小怪错峰循环(P8c 骨骼化):右侧跑入 → 站定挨打 → 死亡动画 → 淡出 + 金币飘字 → 重生。
  // 骨骼与战斗同源(S196 怪物包);加载失败回退旧静态小怪图(倒下改用倾倒旧动效)。
  private renderIdleMonsters(parent: Node, width: number, height: number, scale: number): void {
    // 与英雄圆心站位同一地面带,交战线水平可读。
    const baseY = -height * 0.29;
    IDLE_MONSTER_SPINES.forEach((config, slot) => {
      const homeX = width * (0.27 + slot * 0.075);
      const slotHeight = config.height * scale;
      const slotWidth = 150 * scale;
      const groundY = baseY + (slot === 0 ? 0 : -18 * scale);
      const monster = this.host.addChildPlainNode(parent, `LobbyIdleMonster_${slot}`, homeX + width * 0.2, groundY, slotWidth, slotHeight);
      const opacity = monster.addComponent(UIOpacity);
      opacity.opacity = 0;
      const unit = this.toIdleMonsterUnit(slot, config.resource);
      const spineNode = this.host.addChildPlainNode(monster, 'LobbyIdleMonsterSpine', 0, -slotHeight / 2, slotWidth * 2, slotHeight * 2.4);
      const skeleton = spineNode.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.timeScale = 0.9;
      this.loadSpineData(config.resource, (data) => {
        if (!monster.isValid || !spineNode.isValid) {
          return;
        }
        const applyOnce = (): BattleUnitSpineAnimationNames | null => {
          try {
            const runtimeData = resolveBattleUnitSpineRuntimeData(data as sp.SkeletonData);
            if (!runtimeData || (runtimeData.animations ?? []).length === 0) {
              // 失败原因必须可见:runtimeData null=wasm 解析失败;anims=0=解析出空骨架。
              console.warn(`[IdleStage] monster spine runtime not ready: ${config.resource}, ${runtimeData ? `anims=${(runtimeData.animations ?? []).length},skins=${(runtimeData.skins ?? []).length}` : 'runtimeData=null'}`);
              return null;
            }
            patchBattleUnitSpineRuntimeEnums(data as sp.SkeletonData, runtimeData);
            skeleton.skeletonData = data as sp.SkeletonData;
            const skin = resolveBattleUnitSpineSkinName(data as sp.SkeletonData, runtimeData);
            if (skin) {
              skeleton.setSkin(skin);
              skeleton.setSlotsToSetupPose();
            }
            // 目标显示高/骨骼 AABB 高;素材原点=脚底中心,spineNode 已挂在地面线,原朝右 → 镜像面向英雄。
            const safeHeight = Math.max(1, runtimeData.height || slotHeight);
            const spineScale = Math.max(0.02, slotHeight / safeHeight);
            spineNode.setScale(resolveBattleUnitSpineMirrorScaleX(spineScale, true), spineScale, 1);
            const names = resolveBattleUnitSpineAnimationNames(data as sp.SkeletonData, unit);
            if (names.idle) {
              skeleton.setAnimation(0, names.idle, true);
            }
            return names;
          } catch (error) {
            console.warn('[IdleStage] monster spine apply failed', config.resource, error);
            return null;
          }
        };
        const fallbackToPortrait = (): void => {
          if (spineNode.isValid) {
            spineNode.destroy();
          }
          const portrait = IDLE_MONSTER_PORTRAITS[slot % IDLE_MONSTER_PORTRAITS.length];
          this.host.addSprite(`LobbyIdleMonsterArt_${slot}`, portrait, 0, 0, slotWidth * 0.8, slotHeight, monster);
          this.startIdleMonsterCycle(parent, monster, opacity, skeleton, null, homeX, groundY, slotHeight, slot, width, scale);
        };
        // wasm 运行时解析在本项目有已知偶发失败(编队/详情页同款重试);
        // 大厅同帧建 5 英雄+2 小怪更易触发,失败后延迟重试两轮再回退静态图。
        const attemptApply = (round: number): void => {
          if (!monster.isValid || !spineNode.isValid) {
            return;
          }
          const names = applyOnce();
          if (names) {
            this.startIdleMonsterCycle(parent, monster, opacity, skeleton, names, homeX, groundY, slotHeight, slot, width, scale);
            return;
          }
          if (round < 2) {
            setTimeout(() => attemptApply(round + 1), 320 * (round + 1));
            return;
          }
          fallbackToPortrait();
        };
        if (!data) {
          fallbackToPortrait();
          return;
        }
        attemptApply(0);
      });
    });
  }

  private startIdleMonsterCycle(
    stage: Node,
    monster: Node,
    opacity: UIOpacity,
    skeleton: sp.Skeleton,
    names: BattleUnitSpineAnimationNames | null,
    homeX: number,
    groundY: number,
    slotHeight: number,
    slot: number,
    width: number,
    scale: number,
  ): void {
    const playAnimation = (name: string | null | undefined, loop: boolean): void => {
      if (!names || !name || !skeleton.isValid) {
        return;
      }
      try {
        skeleton.setAnimation(0, name, loop);
      } catch {
        // 个别动画缺失时保持当前姿势即可。
      }
    };
    const fadeTo = (value: number, duration: number): void => {
      tween(opacity).to(duration, { opacity: value }).start();
    };
    const cycle = (): void => {
      if (!monster.isValid) {
        return;
      }
      monster.setPosition(homeX + width * 0.2, groundY, 0);
      monster.angle = 0;
      opacity.opacity = 0;
      tween(monster)
        .delay(slot * 1.4 + 0.4)
        .call(() => {
          playAnimation(names?.move ?? names?.idle, true);
          fadeTo(255, 0.7);
        })
        .to(0.9, { position: new Vec3(homeX, groundY, 0) })
        .call(() => playAnimation(names?.idle, true))
        .delay(3.4 + Math.random() * 2)
        .call(() => {
          if (!monster.isValid) {
            return;
          }
          this.spawnIdleLoot(stage, homeX, groundY + 40 * scale, scale);
          if (names?.death) {
            playAnimation(names.death, false);
          } else {
            // 静态图回退:沿用旧倾倒动效。
            tween(monster).to(0.4, { angle: -78 }).start();
          }
        })
        .delay(1.05)
        .call(() => fadeTo(0, 0.45))
        .delay(0.55)
        .call(() => cycle())
        .start();
    };
    cycle();
  }

  private toIdleMonsterUnit(slot: number, resource: string): BattlePresentationUnitSnapshot {
    return {
      unitKey: `idle-monster:${slot}`,
      side: 'enemy',
      slot,
      displayName: '小怪',
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

  // 掉落飘字(预览数值,不写资源)。
  private spawnIdleLoot(parent: Node, x: number, y: number, scale: number): void {
    const amount = 40 + Math.floor(Math.random() * 120);
    const label = this.host.addChildLabel(parent, 'LobbyIdleLootFloat', `+${amount} 金币(预览)`, x, y, 20 * scale, rgba(255, 224, 128), new Size(260 * scale, 28 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    const node = label.node;
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 235;
    tween(node)
      .by(1.1, { position: new Vec3(0, 58 * scale, 0) })
      .call(() => {
        if (node.isValid) {
          node.destroy();
        }
      })
      .start();
    tween(opacity)
      .delay(0.55)
      .to(0.55, { opacity: 0 })
      .start();
  }

  // 左下:挂机收益面板(服务端权威计费,支持领取与自动挑战开关;汇总未就绪时回退预览文案)。
  private renderIdleRewardPanel(parent: Node, width: number, height: number, scale: number, floor: number): void {
    const summary = this.host.currentIdleSummary?.() ?? null;
    const panelWidth = Math.min(262 * scale, width * 0.25);
    const panelHeight = (summary ? 226 : 148) * scale;
    const panel = this.host.addChildPlainNode(parent, 'LobbyIdleRewardPanel', -width / 2 + panelWidth / 2 + 18 * scale, -height / 2 + panelHeight / 2 + 96 * scale, panelWidth, panelHeight);
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(10, 8, 11, 216);
    graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 9 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(196, 150, 76, 180);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 9 * scale);
    graphics.stroke();
    const title = this.host.addChildLabel(panel, 'LobbyIdleRewardTitle', summary ? '挂机收益' : '挂机收益(预览)', 0, panelHeight / 2 - 18 * scale, 15 * scale, rgba(244, 214, 150), new Size(panelWidth - 20 * scale, 20 * scale));
    title.overflow = Label.Overflow.SHRINK;
    graphics.strokeColor = rgba(196, 150, 76, 120);
    graphics.moveTo(-panelWidth / 2 + 12 * scale, panelHeight / 2 - 32 * scale);
    graphics.lineTo(panelWidth / 2 - 12 * scale, panelHeight / 2 - 32 * scale);
    graphics.stroke();
    const rows = summary
      ? [
        `产出  金币 ${summary.goldPerHour.toLocaleString('en-US')} / 时`,
        `待领取  金币 ${summary.pendingGold.toLocaleString('en-US')}`,
        `待领取  经验书 x${summary.pendingExpBook}`,
        `累计  ${formatIdleDuration(summary.accruedSeconds)} / ${formatIdleDuration(summary.capSeconds)}`,
      ]
      : [
        `预计金币  ${(120 + floor * 30).toLocaleString('en-US')} / 时`,
        `英雄经验书掉落随层数提升`,
        `挂机数据同步中…`,
      ];
    rows.forEach((row, index) => {
      const label = this.host.addChildLabel(panel, `LobbyIdleRewardRow_${index}`, row, -panelWidth / 2 + 14 * scale, panelHeight / 2 - 48 * scale - index * 22 * scale, 14 * scale, rgba(206, 186, 140), new Size(panelWidth - 28 * scale, 18 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });
    if (summary) {
      const claiming = this.host.isIdleClaiming?.() === true;
      const claimEnabled = summary.claimable && !claiming;
      const claimButton = this.host.addChildPlainNode(panel, 'LobbyIdleClaimButton', 0, -panelHeight / 2 + 62 * scale, panelWidth - 48 * scale, 44 * scale);
      const claimArt = this.host.addSprite('LobbyIdleClaimButtonArt', BAG_AI_BUTTON_CRIMSON_ASSET, 0, 0, panelWidth - 48 * scale, 44 * scale, claimButton);
      if (!claimArt) {
        const claimGraphics = claimButton.addComponent(Graphics);
        claimGraphics.fillColor = rgba(88, 18, 16, 226);
        claimGraphics.roundRect(-(panelWidth - 48 * scale) / 2, -22 * scale, panelWidth - 48 * scale, 44 * scale, 7 * scale);
        claimGraphics.fill();
      } else if (!claimEnabled) {
        const dim = claimArt.node.addComponent(UIOpacity);
        dim.opacity = 128;
      }
      const claimLabel = this.host.addChildLabel(claimButton, 'LobbyIdleClaimButtonLabel', claiming ? '领取中…' : '领取收益', 0, 0, 19 * scale, rgba(255, 238, 196), new Size(panelWidth - 80 * scale, 24 * scale));
      claimLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(claimLabel, scale, true);
      claimButton.addComponent(Button);
      if (claimEnabled) {
        this.host.applyImageButtonFeedback(claimButton, 1.04, 0.96);
        claimButton.on(Button.EventType.CLICK, () => this.host.claimIdleReward?.(), this);
      }
      const autoOn = this.host.isAutoChallengeEnabled?.() === true;
      const toggle = this.host.addChildPlainNode(panel, 'LobbyIdleAutoToggle', 0, -panelHeight / 2 + 22 * scale, panelWidth - 48 * scale, 26 * scale);
      const toggleGraphics = toggle.addComponent(Graphics);
      toggleGraphics.fillColor = autoOn ? rgba(84, 18, 16, 216) : rgba(18, 16, 18, 190);
      toggleGraphics.roundRect(-(panelWidth - 48 * scale) / 2, -13 * scale, panelWidth - 48 * scale, 26 * scale, 13 * scale);
      toggleGraphics.fill();
      if (autoOn) {
        toggleGraphics.strokeColor = rgba(226, 92, 68, 200);
        toggleGraphics.lineWidth = Math.max(1, 1 * scale);
        toggleGraphics.roundRect(-(panelWidth - 48 * scale) / 2, -13 * scale, panelWidth - 48 * scale, 26 * scale, 13 * scale);
        toggleGraphics.stroke();
      }
      const toggleLabel = this.host.addChildLabel(toggle, 'LobbyIdleAutoToggleLabel', autoOn ? '自动挑战 · 开' : '自动挑战 · 关', 0, 0, 14 * scale, autoOn ? rgba(255, 214, 168) : rgba(166, 150, 120), new Size(panelWidth - 64 * scale, 18 * scale));
      toggleLabel.overflow = Label.Overflow.SHRINK;
      toggle.addComponent(Button);
      this.host.applyImageButtonFeedback(toggle, 1.03, 0.97);
      toggle.on(Button.EventType.CLICK, () => this.host.toggleAutoChallenge?.(), this);
    } else {
      const note = this.host.addChildLabel(panel, 'LobbyIdleRewardNote', '真实数值由服务端结算发放', 0, -panelHeight / 2 + 16 * scale, 12 * scale, rgba(150, 132, 96), new Size(panelWidth - 20 * scale, 14 * scale));
      note.overflow = Label.Overflow.SHRINK;
    }
  }

  // 右下:挑战 BOSS(接现有战斗表现流程)+ 自动挑战占位。
  private renderBossChallenge(parent: Node, width: number, height: number, scale: number, stageCode: string): void {
    // 按钮左侧装饰边框大(九宫格 left border 130),要给文字留出足够可视中区。
    const buttonWidth = 272 * scale;
    const buttonHeight = 80 * scale;
    const x = width / 2 - buttonWidth / 2 - 22 * scale;
    const y = -height / 2 + buttonHeight / 2 + 128 * scale;
    const button = this.host.addChildPlainNode(parent, 'LobbyIdleBossButton', x, y, buttonWidth, buttonHeight);
    const art = this.host.addSprite('LobbyIdleBossButtonArt', C1812_BUTTON_DANGER_ASSET, 0, 0, buttonWidth, buttonHeight, button);
    if (art) {
      art.type = Sprite.Type.SLICED;
    } else {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = rgba(86, 18, 18, 232);
      graphics.roundRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(230, 90, 60, 220);
      graphics.stroke();
    }
    const label = this.host.addChildLabel(button, 'LobbyIdleBossButtonLabel', '挑战 BOSS', 14 * scale, 0, 25 * scale, rgba(255, 240, 200), new Size(buttonWidth - 100 * scale, 34 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    button.addComponent(Button);
    this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    button.on(Button.EventType.CLICK, () => this.host.openLobbyBattlePreviewPanel(stageCode), this);

    // 自动挑战开关占位:结算闭环(第二期服务端接口)就绪前不开放。
    const toggle = this.host.addChildPlainNode(parent, 'LobbyIdleAutoToggle', x, y - buttonHeight / 2 - 22 * scale, buttonWidth, 26 * scale);
    const toggleGraphics = toggle.addComponent(Graphics);
    toggleGraphics.fillColor = rgba(18, 16, 18, 190);
    toggleGraphics.roundRect(-buttonWidth / 2, -13 * scale, buttonWidth, 26 * scale, 13 * scale);
    toggleGraphics.fill();
    const toggleLabel = this.host.addChildLabel(toggle, 'LobbyIdleAutoToggleLabel', '自动挑战 · 未开放', 0, 0, 14 * scale, rgba(146, 132, 104), new Size(buttonWidth - 16 * scale, 18 * scale));
    toggleLabel.overflow = Label.Overflow.SHRINK;
    toggle.addComponent(Button);
    toggle.on(Button.EventType.CLICK, () => {
      this.host.setStatus('自动挑战需要服务端结算接口(第二期);当前请手动挑战 BOSS 推进层数。');
    }, this);
  }

  private loadSpineData(resourcePath: string, callback: (data: sp.SkeletonData | null) => void): void {
    // 2026-08-04 复用重构:改走全局 SpineDataStore(顺带补上此前缺失的在途去重)。
    loadSharedSpineData(resourcePath, null, 'IdleStage', callback);
  }

  private toIdleBattleUnit(hero: LobbyHeroItemVO): BattlePresentationUnitSnapshot {
    return {
      unitKey: `idle:${hero.id}`,
      side: 'ally',
      slot: 0,
      displayName: safeText(hero.heroName),
      subline: `${safeText(hero.rarity)} · Lv.${hero.level}`,
      rarity: safeText(hero.rarity),
      level: hero.level,
      power: hero.power,
      role: 'front',
      leader: !!hero.protagonist,
      hpRatio: 1,
      sourceHeroId: hero.id,
      heroCode: hero.heroCode,
      heroClass: hero.heroClass,
      portraitAsset: hero.portraitAsset,
      spineAsset: hero.spineAsset,
      spineUuid: hero.spineUuid,
    };
  }

  private resolveRarityColor(rarity: string | null | undefined, alpha: number): Color {
    const key = (rarity || '').trim().toUpperCase();
    if (key === 'UR') {
      return rgba(255, 84, 48, alpha);
    }
    if (key === 'SSR') {
      return rgba(255, 168, 54, alpha);
    }
    if (key === 'SR') {
      return rgba(200, 111, 255, alpha);
    }
    if (key === 'R') {
      return rgba(93, 151, 255, alpha);
    }
    return rgba(120, 110, 96, alpha);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 225 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

function formatIdleDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分`;
}
