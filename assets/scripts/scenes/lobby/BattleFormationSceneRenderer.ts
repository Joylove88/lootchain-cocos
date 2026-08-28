import {
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { safeText } from '../UiTextFormatter';
import { rgba } from './LobbyHudTypes';

export interface BattleFormationSceneHost {
  node: Node;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  currentFormationHeroIds(): number[];
  toggleFormationHero(heroId: number): void;
  startBattle(stageCode: string): void;
  closeFormation(): void;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

const FORMATION_BUTTON_ASSET = 'ui/common/ai/button_primary/spriteFrame';
const HERO_CLASS_TABS = ['全部', '战士', '坦克', '法师', '辅助', '射手', '刺客'];

export class BattleFormationSceneRenderer {
  private selectedClass = '全部';
  constructor(private readonly host: BattleFormationSceneHost) {}

  render(width: number, height: number, scale: number, stageCode: string, recommendedPower: number): void {
    const state = this.host.currentLobbyHeroRosterState();
    const selectedIds = this.host.currentFormationHeroIds();
    const slots = this.resolveSlots(state.heroes, selectedIds);
    const filled = slots.filter((s): s is LobbyHeroItemVO => !!s);
    const totalPower = filled.reduce((sum, h) => sum + h.power, 0);
    // 战力不足也允许挑战(策划 2026-07-10):只要有上阵英雄即可挑战,战力仅作展示不拦截。
    const canChallenge = filled.length > 0;
    // 战力是否达标只影响提示颜色/文案,不拦截挑战。不足时红字提示"战力不足,仍可挑战"。
    const powerEnough = filled.length > 0 && totalPower >= recommendedPower;
    const leftWidth = width * 0.55;
    this.renderBattlefield(width / 2 - leftWidth / 2 - 10 * scale, 10 * scale, leftWidth, height - 100 * scale, scale, slots);
    const rightWidth = width * 0.4;
    this.renderHeroList(width / 2 - rightWidth / 2 - 10 * scale, 10 * scale, rightWidth, height - 100 * scale, scale, state, selectedIds);
    const footerY = -height / 2 + 36 * scale;
    const powerText = '总战力 ' + totalPower.toLocaleString('en-US') + ' / 推荐 ' + recommendedPower.toLocaleString('en-US') + ' · 上阵 ' + filled.length + '/4'
      + (canChallenge && !powerEnough ? ' · 战力不足，仍可挑战' : '');
    const powerLabel = this.host.addChildLabel(this.host.node, 'BattleFormationPower', powerText, -60 * scale, footerY, 18 * scale, !canChallenge || powerEnough ? rgba(186, 225, 173) : rgba(255, 96, 96), new Size(width * 0.6, 28 * scale));
    powerLabel.overflow = Label.Overflow.SHRINK;
    const btn = this.renderButton(this.host.node, 'BattleFormationChallengeButton', canChallenge ? '挑战' : '请上阵英雄', width / 2 - 100 * scale, footerY, 160 * scale, 42 * scale, scale, canChallenge);
    if (canChallenge) {
      btn.on(Button.EventType.CLICK, () => this.host.startBattle(stageCode), this);
    }
  }

  private renderBattlefield(x: number, y: number, width: number, height: number, scale: number, slots: Array<LobbyHeroItemVO | null>): void {
    const section = this.host.addChildPlainNode(this.host.node, 'BattleFormationBattlefield', x, y, width, height);
    const g = section.addComponent(Graphics);
    g.fillColor = rgba(6, 6, 9, 200);
    g.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
    g.fill();
    g.strokeColor = rgba(142, 106, 55, 150);
    g.stroke();
    const title = this.host.addChildLabel(section, 'BattleFormationBattlefieldTitle', '战场站位', 0, height / 2 - 22 * scale, 18 * scale, rgba(231, 205, 142), new Size(width - 20 * scale, 24 * scale));
    title.overflow = Label.Overflow.SHRINK;
    const rows = 3, cols = 3;
    const slotSize = Math.min(80 * scale, (width - 40 * scale) / cols - 10 * scale, (height - 60 * scale) / rows - 10 * scale);
    const startY = height / 2 - 56 * scale - slotSize / 2;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const idx = row * cols + col;
        const hero = slots[idx] ?? null;
        const sx = (col - 1) * (slotSize + 12 * scale);
        const sy = startY - row * (slotSize + 12 * scale);
        this.renderSlot(section, hero, idx, sx, sy, slotSize, scale);
      }
    }
  }

  private renderSlot(parent: Node, hero: LobbyHeroItemVO | null, index: number, x: number, y: number, size: number, scale: number): void {
    const slot = this.host.addChildPlainNode(parent, 'BattleFormationSlot_' + index, x, y, size, size);
    const g = slot.addComponent(Graphics);
    g.fillColor = hero ? (hero.protagonist ? rgba(45, 12, 14, 220) : rgba(10, 10, 13, 198)) : rgba(6, 6, 8, 150);
    g.roundRect(-size / 2, -size / 2, size, size, 6 * scale);
    g.fill();
    g.strokeColor = hero?.protagonist ? rgba(226, 166, 72, 220) : hero ? rgba(132, 98, 52, 160) : rgba(80, 72, 58, 100);
    g.lineWidth = Math.max(1, hero?.protagonist ? 1.6 * scale : scale);
    g.stroke();
    if (hero) {
      const name = this.host.addChildLabel(slot, 'BattleFormationSlotName', safeText(hero.heroName), 0, size * 0.22, 14 * scale, rgba(246, 218, 156), new Size(size - 6 * scale, 18 * scale));
      name.overflow = Label.Overflow.SHRINK;
      const badge = this.host.addChildLabel(slot, 'BattleFormationSlotBadge', safeText(hero.rarity) + ' Lv.' + hero.level, 0, -size * 0.18, 13 * scale, rgba(185, 160, 105), new Size(size - 6 * scale, 16 * scale));
      badge.overflow = Label.Overflow.SHRINK;
      slot.addComponent(Button);
      slot.on(Button.EventType.CLICK, () => this.host.toggleFormationHero(hero.id), this);
      this.host.applyImageButtonFeedback(slot, 1.02, 0.98);
    } else {
      const empty = this.host.addChildLabel(slot, 'BattleFormationSlotEmpty', '空位', 0, 0, 14 * scale, rgba(120, 108, 84), new Size(size - 6 * scale, 18 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
  }

  private renderHeroList(x: number, y: number, width: number, height: number, scale: number, state: LobbyHeroRosterPanelState, selectedIds: number[]): void {
    const section = this.host.addChildPlainNode(this.host.node, 'BattleFormationHeroList', x, y, width, height);
    const g = section.addComponent(Graphics);
    g.fillColor = rgba(6, 6, 9, 200);
    g.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
    g.fill();
    g.strokeColor = rgba(142, 106, 55, 150);
    g.stroke();
    const title = this.host.addChildLabel(section, 'BattleFormationHeroListTitle', '可出战英雄', 0, height / 2 - 22 * scale, 18 * scale, rgba(231, 205, 142), new Size(width - 20 * scale, 24 * scale));
    title.overflow = Label.Overflow.SHRINK;
    const tabY = height / 2 - 48 * scale;
    const tabWidth = (width - 20 * scale) / HERO_CLASS_TABS.length;
    HERO_CLASS_TABS.forEach((tab, i) => {
      const tx = -width / 2 + 10 * scale + tabWidth / 2 + i * tabWidth;
      const tabNode = this.host.addChildPlainNode(section, 'BattleFormationClassTab_' + i, tx, tabY, tabWidth - 4 * scale, 24 * scale);
      const tg = tabNode.addComponent(Graphics);
      const active = tab === this.selectedClass;
      tg.fillColor = active ? rgba(70, 20, 22, 200) : rgba(12, 12, 15, 160);
      tg.roundRect(-(tabWidth - 4 * scale) / 2, -12 * scale, tabWidth - 4 * scale, 24 * scale, 4 * scale);
      tg.fill();
      tg.strokeColor = active ? rgba(210, 152, 64, 200) : rgba(100, 80, 45, 120);
      tg.stroke();
      const tl = this.host.addChildLabel(tabNode, 'BattleFormationClassTabLabel_' + i, tab, 0, 0, 14 * scale, active ? rgba(246, 218, 156) : rgba(180, 160, 120), new Size(tabWidth - 8 * scale, 22 * scale));
      tl.overflow = Label.Overflow.SHRINK;
      tabNode.addComponent(Button);
      tabNode.on(Button.EventType.CLICK, () => { this.selectedClass = tab; }, this);
    });
    const selectedSet = new Set(selectedIds);
    const heroes = this.filterByClass(state.heroes, this.selectedClass);
    const listTop = height / 2 - 80 * scale;
    const rowHeight = Math.min(44 * scale, (height - 100 * scale) / Math.max(1, heroes.length));
    heroes.slice(0, 8).forEach((hero, i) => {
      const ry = listTop - i * rowHeight - rowHeight / 2;
      this.renderHeroRow(section, hero, i, 0, ry, width - 28 * scale, rowHeight - 6 * scale, scale, selectedSet.has(hero.id));
    });
  }

  private renderHeroRow(parent: Node, hero: LobbyHeroItemVO, index: number, x: number, y: number, width: number, height: number, scale: number, selected: boolean): void {
    const row = this.host.addChildPlainNode(parent, 'BattleFormationHeroRow_' + index, x, y, width, height);
    const g = row.addComponent(Graphics);
    g.fillColor = selected ? rgba(70, 20, 22, 200) : rgba(10, 10, 13, 160);
    g.roundRect(-width / 2, -height / 2, width, height, 4 * scale);
    g.fill();
    g.strokeColor = selected ? rgba(210, 152, 64, 200) : rgba(100, 80, 45, 120);
    g.stroke();
    row.addComponent(Button);
    row.on(Button.EventType.CLICK, () => this.host.toggleFormationHero(hero.id), this);
    this.host.applyImageButtonFeedback(row, 1.012, 0.988);
    const text = (selected ? '已上阵' : safeText(hero.rarity)) + '  ' + safeText(hero.heroName) + '  Lv.' + hero.level + '  战力 ' + hero.power.toLocaleString('en-US');
    const label = this.host.addChildLabel(row, 'BattleFormationHeroRowLabel_' + index, text, -width / 2 + 12 * scale, 0, 15 * scale, selected ? rgba(246, 218, 156) : rgba(207, 188, 145), new Size(width - 20 * scale, height), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
  }

  private resolveSlots(heroes: LobbyHeroItemVO[], selectedIds: number[]): Array<LobbyHeroItemVO | null> {
    const visible = this.visibleHeroes(heroes);
    const byId = new Map(visible.map((h) => [h.id, h]));
    const ordered = selectedIds.length > 0 ? selectedIds.map((id) => byId.get(id)).filter((h): h is LobbyHeroItemVO => !!h) : [...visible].sort((a, b) => b.power - a.power).slice(0, 4);
    const slots: Array<LobbyHeroItemVO | null> = [];
    for (const h of ordered) { if (slots.length >= 9) break; if (!slots.some((s) => s?.id === h.id)) slots.push(h); }
    while (slots.length < 9) slots.push(null);
    return slots.slice(0, 9);
  }

  private filterByClass(heroes: LobbyHeroItemVO[], className: string): LobbyHeroItemVO[] {
    const visible = this.visibleHeroes(heroes);
    if (className === '全部') return visible;
    return visible.filter((h) => safeText(h.heroClass) === className);
  }

  private visibleHeroes(heroes: LobbyHeroItemVO[]): LobbyHeroItemVO[] {
    return heroes.filter((h) => h.id > 0 && !h.protagonist && h.rarity.toUpperCase() !== 'EX' && !h.heroCode.toUpperCase().startsWith('EX_'));
  }

  private renderButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number, enabled: boolean): Node {
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const art = enabled ? this.host.addSprite(name + 'Art', FORMATION_BUTTON_ASSET, 0, 0, width, height, btn) : null;
    if (!art) {
      const g = btn.addComponent(Graphics);
      g.fillColor = enabled ? rgba(34, 24, 17, 226) : rgba(24, 21, 18, 184);
      g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
      g.fill();
      g.strokeColor = enabled ? rgba(188, 137, 58, 216) : rgba(119, 91, 48, 148);
      g.stroke();
    }
    const button = btn.addComponent(Button);
    button.interactable = enabled;
    if (enabled) this.host.applyImageButtonFeedback(btn, 1.025, 0.975);
    const label = this.host.addChildLabel(btn, name + 'Label', text, 0, 0, 20 * scale, enabled ? rgba(245, 211, 123) : rgba(151, 133, 93), new Size(width, height));
    label.overflow = Label.Overflow.SHRINK;
    return btn;
  }
}
