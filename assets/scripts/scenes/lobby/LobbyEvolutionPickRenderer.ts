import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UITransform, Vec3 } from 'cc';
import type { EvolutionCard, EvolutionRoute, EvolutionState } from '../../api/EvolutionApi';
import type { UiLayout } from './LobbyHudTypes';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassSlice } from '../UiGlassKit';

export interface EvolutionPickHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor?(node: Node): void;
}

export interface EvolutionPickState {
  state: EvolutionState;
  /** 选中的卡键(默认选中中间那张)。 */
  selected: string;
  busy: boolean;
  error: string;
}

export const ROUTE_NAME: Record<EvolutionRoute, string> = { HUNT: '猎杀', GUARD: '守护', ARCANE: '奥术', EXPLORE: '探索', WEALTH: '财富' };
/** 路线色(原型:猎杀红 / 守护金 / 奥术紫 / 探索青 / 财富琥珀;docs/60 气焰颜色同口径)。 */
export const ROUTE_COLOR: Record<EvolutionRoute, Color> = {
  HUNT: new Color(226, 92, 80, 255),
  GUARD: new Color(228, 186, 112, 255),
  ARCANE: new Color(168, 128, 236, 255),
  EXPLORE: new Color(84, 200, 200, 255),
  WEALTH: new Color(240, 168, 64, 255),
};
const ROUTES: EvolutionRoute[] = ['HUNT', 'GUARD', 'ARCANE', 'EXPLORE', 'WEALTH'];
const CATEGORY: Record<string, { name: string; glyph: string }> = {
  ATTR: { name: '属性', glyph: 'cat_attr' },
  COMBAT: { name: '战斗', glyph: 'cat_combat' },
  EXPLORE: { name: '探索', glyph: 'cat_explore' },
};
const GLYPH = (name: string): string => `ui/evolution/glyph_${name}/spriteFrame`;
const ZERO_PORTRAIT = 'ui/protagonist/b/zero_m_round/spriteFrame';
/** 零按选中卡路线的一句点评(原型:「猎杀路线快成型了……宿主,你骨子里还是那么好斗。」)。 */
const ZERO_LINE: Record<EvolutionRoute, [string, string]> = {
  HUNT: ['猎杀……宿主,你骨子里还是那么好斗。', '猎杀路线快成型了……宿主,你骨子里还是那么好斗。'],
  GUARD: ['守护。活下来,才有资格谈变强。', '守护路线快成型了,前世的你可没这么谨慎。'],
  ARCANE: ['奥术。圣契里的力量,你开始会用了。', '奥术路线快成型了,这股力量……我很熟悉。'],
  EXPLORE: ['探索。这方世界藏着的东西,比你想的多。', '探索路线快成型了,别漏掉任何一块石碑。'],
  WEALTH: ['财富。没钱可修不了道,这我承认。', '财富路线快成型了,前世的库房可比这满多了。'],
};

/**
 * docs/58 §10「进化抉择」(原型 周报截图/2026-11-02_主角/proto/evolution_pick_b.png,用户 11-02 认可):
 * 升级后弹出,背景压暗;左上五条路线计数;顶部「等级提升 · Lv.N / 进化抉择 / 境界」;三张卡(左上稀有度、右上类别、
 * 路线色圆徽 + 图案、名字、效果、路线进度),选中卡金边 + 顶边勾 + 质变提示;下方刷新 / 保底;零的点评 + 「确认进化」。
 * 坐标取原型 1870×841 实测像素。不可跳过(必须选一张;积压的逐个选)。
 */
export class LobbyEvolutionPickRenderer {
  static readonly NODE_NAME = 'LobbyEvolutionPick';

  constructor(
    private readonly host: EvolutionPickHost,
    private readonly onSelect: (key: string) => void,
    private readonly onConfirm: () => void,
    private readonly onRefresh: () => void,
  ) {}

  render(layout: UiLayout, pick: EvolutionPickState): void {
    const choice = pick.state.choice;
    if (!choice) {
      return;
    }
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const root = this.host.createUiNode(LobbyEvolutionPickRenderer.NODE_NAME);
    root.setPosition(new Vec3(cx, cy, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    this.dim(root, layout.width, layout.height);

    // 左上路线计数(原型胶囊 107×36,中心 y 41,x 87 / 208 / 332 / 456 / 580)
    ROUTES.forEach((route, i) => {
      const x = FX(87 + i * 123.3);
      const chip = this.host.addChildPlainNode(root, `Route_${route}`, x, FY(41), S(108), S(36));
      mountGlassSlice(this.host, chip, 'Bg', GLASS_SLICES.tagPill, 0, 0, S(108), S(36), k);
      const dot = this.host.addChildPlainNode(chip, 'Dot', -S(36), 0, S(12), S(12)).addComponent(Graphics);
      dot.fillColor = ROUTE_COLOR[route];
      dot.circle(0, 0, S(5.5));
      dot.fill();
      glassLabel(this.host, chip, 'Text', `${ROUTE_NAME[route]} ${pick.state.routes[route] ?? 0}`, -S(24), 0, S(19), GLASS_COLOR.text, S(80));
    });

    // 标题(原型:等级提升 y 27 / 进化抉择 y 72 / 境界 y 117)
    glassLabel(this.host, root, 'LevelUp', `等级提升 · Lv.${choice.level}`, FX(935), FY(27), S(26), GLASS_COLOR.champagne, S(500), HorizontalTextAlignment.CENTER, true);
    const title = glassLabel(this.host, root, 'Title', '进 化 抉 择', FX(935), FY(72), S(54), GLASS_COLOR.text, S(600), HorizontalTextAlignment.CENTER, true);
    title.lineHeight = Math.round(S(62));
    glassLabel(this.host, root, 'Realm', `境界:${pick.state.realm || '觉醒 · 初期'}`, FX(935), FY(117), S(26), GLASS_COLOR.sub, S(500), HorizontalTextAlignment.CENTER);

    // 三张卡(原型 344×444,中心 x 542 / 935 / 1330,y 386)
    const xs = [542, 935, 1330];
    choice.candidates.slice(0, 3).forEach((card, i) => this.card(root, card, FX(xs[i]), FY(386), S, k, card.key === pick.selected, pick.busy, pick.state));

    // 刷新 + 保底(原型胶囊 306×50 中心 (812, 655);右侧「再 3 次必出稀有」)
    const refreshText = choice.refreshPrice > 0 ? `刷新 · ${choice.refreshPrice} 钻石` : '刷新 · 免费 1 次';
    const refresh = this.host.addChildPlainNode(root, 'Refresh', FX(812), FY(655), S(306), S(50));
    mountGlassSlice(this.host, refresh, 'Bg', GLASS_SLICES.panel, 0, 0, S(306), S(50), k);
    this.refreshGlyph(refresh, -S(86), 0, S);
    glassLabel(this.host, refresh, 'Text', refreshText, -S(62), 0, S(22), GLASS_COLOR.text, S(200));
    if (!pick.busy) {
      refresh.addComponent(Button);
      refresh.on(Button.EventType.CLICK, () => this.onRefresh(), this);
      this.host.applyImageButtonFeedback(refresh, 1.03, 0.97);
      this.host.applyPointerCursor?.(refresh);
    }
    const pityText = choice.pityLeft <= 1 ? '本次必出稀有' : `再 ${choice.pityLeft} 次必出稀有`;
    const backlog = pick.state.pendingCount > 1 ? `  ·  还有 ${pick.state.pendingCount - 1} 次进化待选` : '';
    glassLabel(this.host, root, 'Pity', `|  ${pityText}${backlog}`, FX(990), FY(655), S(22), GLASS_COLOR.sub, S(640));

    // 零的点评(原型框 x 232~1243 / y 695~805,圆头像中心 (290, 750) 直径 146)
    const dw = S(1011);
    const dh = S(110);
    const dialog = this.host.addChildPlainNode(root, 'Dialogue', FX(737), FY(750), dw, dh);
    mountGlassSlice(this.host, dialog, 'Glass', GLASS_SLICES.panel, 0, 0, dw, dh, k);
    glassLabel(this.host, dialog, 'Speaker', '零', S(400 - 737), S(24), S(26), GLASS_COLOR.champagne, S(120), HorizontalTextAlignment.LEFT, true);
    const sel = choice.candidates.find((c) => c.key === pick.selected) ?? choice.candidates[0];
    const line = pick.error || (sel ? ZERO_LINE[sel.route][sel.routeCount + 1 >= 2 ? 1 : 0] : '');
    glassLabel(this.host, dialog, 'Line', line, S(400 - 737), -S(14), S(26), pick.error ? GLASS_COLOR.red : GLASS_COLOR.text, S(820));
    const portrait = this.host.addChildPlainNode(root, 'ZeroPortrait', FX(290), FY(750), S(152), S(152));
    const pg = portrait.addComponent(Graphics);
    pg.fillColor = new Color(14, 19, 30, 255);
    pg.circle(0, 0, S(73));
    pg.fill();
    this.host.addSprite('Face', ZERO_PORTRAIT, 0, 0, S(140), S(140), portrait);
    const ring = this.host.addChildPlainNode(portrait, 'Ring', 0, 0, S(152), S(152)).addComponent(Graphics);
    ring.strokeColor = new Color(196, 204, 220, 150);
    ring.lineWidth = Math.max(1.5, S(2));
    ring.circle(0, 0, S(72));
    ring.stroke();

    // 确认进化(原型 x 1295~1645 / y 711~789)
    const ready = !!pick.selected && !pick.busy;
    const confirm = mountGlassButton(this.host, root, 'Confirm', pick.busy ? '进化中…' : '确认进化', FX(1470), FY(750), S(350), S(78), k,
      ready ? 'primary' : 'primaryOff', () => this.onConfirm(), 32);
    this.host.applyPointerCursor?.(confirm);
  }

  private dim(root: Node, W: number, H: number): void {
    // 同契约之选:冷蓝深底 + 四周渐暗(原型背景里的村子只剩轮廓)
    const dim = root.addComponent(Graphics);
    dim.fillColor = new Color(8, 12, 22, 230);
    dim.rect(-W / 2, -H / 2, W, H);
    dim.fill();
    const bands = 10;
    for (let i = 0; i < bands; i += 1) {
      dim.fillColor = new Color(3, 5, 10, Math.round(140 * (1 - i / bands)));
      const ox = W * 0.24 * (i / bands);
      const oy = H * 0.22 * (i / bands);
      const bx = W * 0.24 * ((i + 1) / bands) - ox;
      const by = H * 0.22 * ((i + 1) / bands) - oy;
      const x0 = -W / 2 + ox;
      const y0 = -H / 2 + oy;
      const w = W - ox * 2;
      const h = H - oy * 2;
      dim.rect(x0, y0 + h - by, w, by);
      dim.rect(x0, y0, w, by);
      dim.rect(x0, y0 + by, bx, h - by * 2);
      dim.rect(x0 + w - bx, y0 + by, bx, h - by * 2);
      dim.fill();
    }
  }

  private card(root: Node, card: EvolutionCard, x: number, y: number, S: (v: number) => number, k: number, selected: boolean, busy: boolean, state: EvolutionState): void {
    const w = S(344);
    const h = S(444);
    const node = this.host.addChildPlainNode(root, `Card_${card.code}`, x, y, w, h);
    if (selected) {
      node.setScale(1.03, 1.03, 1);
    }
    mountGlassSlice(this.host, node, 'Glass', GLASS_SLICES.frame, 0, 0, w, h, k);
    const color = ROUTE_COLOR[card.route];
    // 稀有度(原型左上胶囊 74×34,中心距左 62 / 顶 30):普通灰、稀有蓝、传说金
    const rarity = this.host.addChildPlainNode(node, 'Rarity', -w / 2 + S(62), h / 2 - S(31), S(76), S(34));
    const rg = rarity.addComponent(Graphics);
    const rareFill = card.rarity === 'L' ? new Color(120, 86, 30, 230) : card.rarity === 'R' ? new Color(34, 62, 112, 230) : new Color(40, 44, 54, 230);
    const rareLine = card.rarity === 'L' ? new Color(236, 196, 116, 230) : card.rarity === 'R' ? new Color(110, 160, 236, 230) : new Color(150, 156, 170, 170);
    rg.fillColor = rareFill;
    rg.roundRect(-S(37), -S(16), S(74), S(32), S(16));
    rg.fill();
    rg.strokeColor = rareLine;
    rg.lineWidth = Math.max(1, S(1.5));
    rg.roundRect(-S(37), -S(16), S(74), S(32), S(16));
    rg.stroke();
    glassLabel(this.host, rarity, 'Text', card.rarityName, 0, 0, S(20), card.rarity === 'C' ? GLASS_COLOR.text : new Color(236, 242, 255, 255), S(74), HorizontalTextAlignment.CENTER, true);
    // 类别(原型右上:小图标 + 文字)
    const cat = CATEGORY[card.category] ?? CATEGORY.ATTR;
    const catIcon = this.host.addSprite('CatIcon', GLYPH(cat.glyph), w / 2 - S(102), h / 2 - S(31), S(28), S(28), node);
    if (catIcon) {
      catIcon.color = new Color(210, 214, 224, 255);
    }
    glassLabel(this.host, node, 'Cat', cat.name, w / 2 - S(80), h / 2 - S(31), S(21), GLASS_COLOR.text, S(70));
    // 圆徽(原型中心 y 305 = 卡心上方 81、直径 165):暗心 + 路线色细环 + 路线色图案
    const emblemY = S(81);
    const emblem = this.host.addChildPlainNode(node, 'Emblem', 0, emblemY, S(170), S(170));
    const eg = emblem.addComponent(Graphics);
    eg.fillColor = new Color(Math.round(color.r * 0.16), Math.round(color.g * 0.16), Math.round(color.b * 0.16), 235);
    eg.circle(0, 0, S(80));
    eg.fill();
    eg.strokeColor = new Color(color.r, color.g, color.b, 220);
    eg.lineWidth = Math.max(2, S(3));
    eg.circle(0, 0, S(80));
    eg.stroke();
    eg.strokeColor = new Color(color.r, color.g, color.b, 60);
    eg.lineWidth = Math.max(2, S(6));
    eg.circle(0, 0, S(86));
    eg.stroke();
    const glyph = this.host.addSprite('Glyph', GLYPH(card.code.toLowerCase()), 0, 0, S(96), S(96), emblem);
    if (glyph) {
      glyph.color = color;
    }
    // 名字 / 效果(原型:名字距卡心 +32,效果 -81 起,两行)
    glassLabel(this.host, node, 'Name', card.name, 0, -S(32), S(38), GLASS_COLOR.text, w - S(30), HorizontalTextAlignment.CENTER, true);
    const desc = glassLabel(this.host, node, 'Desc', card.desc, 0, -S(94), S(22), GLASS_COLOR.sub, w - S(36), HorizontalTextAlignment.CENTER);
    desc.lineHeight = Math.round(S(30));
    desc.overflow = Label.Overflow.SHRINK;
    desc.node.getComponent(UITransform)?.setContentSize(w - S(36), S(64));
    // 分隔线 + 路线进度(原型 y 517 / 549,相对卡心 -131 / -163):圆点 + 路线名 + 三个进度点 + 「| n/3」
    const line = this.host.addChildPlainNode(node, 'Line', 0, -S(131), w - S(56), S(2)).addComponent(Graphics);
    line.fillColor = new Color(255, 255, 255, 34);
    line.rect(-(w - S(56)) / 2, -S(0.6), w - S(56), S(1.2));
    line.fill();
    const after = Math.min(3, card.routeCount + 1);
    const ry = -S(163);
    const rdot = this.host.addChildPlainNode(node, 'RouteDot', -S(117), ry, S(14), S(14)).addComponent(Graphics);
    rdot.fillColor = color;
    rdot.circle(0, 0, S(6.5));
    rdot.fill();
    glassLabel(this.host, node, 'RouteName', ROUTE_NAME[card.route], -S(100), ry, S(22), GLASS_COLOR.text, S(70));
    const dots = this.host.addChildPlainNode(node, 'RouteDots', S(8), ry, S(70), S(20)).addComponent(Graphics);
    for (let i = 0; i < 3; i += 1) {
      const dx = -S(20) + i * S(20);
      if (i < after) {
        dots.fillColor = new Color(236, 236, 236, 255);
        dots.circle(dx, 0, S(6));
        dots.fill();
      } else {
        dots.strokeColor = new Color(200, 204, 214, 200);
        dots.lineWidth = Math.max(1, S(1.5));
        dots.circle(dx, 0, S(6));
        dots.stroke();
      }
    }
    glassLabel(this.host, node, 'RouteCount', `|   ${after}/3`, S(48), ry, S(22), GLASS_COLOR.sub, S(80));
    if (selected) {
      // 选中:金边 + 外晕 + 顶边正中的勾 + 质变提示
      const border = this.host.addChildPlainNode(node, 'SelBorder', 0, 0, w + S(16), h + S(16)).addComponent(Graphics);
      border.strokeColor = new Color(226, 190, 120, 60);
      border.lineWidth = S(7);
      border.roundRect(-w / 2 - S(2), -h / 2 - S(2), w + S(4), h + S(4), S(20));
      border.stroke();
      border.strokeColor = new Color(232, 198, 128, 255);
      border.lineWidth = Math.max(2, S(2.5));
      border.roundRect(-w / 2 + S(1), -h / 2 + S(1), w - S(2), h - S(2), S(17));
      border.stroke();
      const check = this.host.addChildPlainNode(node, 'Check', 0, h / 2, S(50), S(50));
      const cg = check.addComponent(Graphics);
      cg.fillColor = GLASS_COLOR.champagne;
      cg.circle(0, 0, S(23));
      cg.fill();
      cg.strokeColor = GLASS_COLOR.onChampagne;
      cg.lineWidth = Math.max(2, S(3.2));
      cg.moveTo(-S(10), 0);
      cg.lineTo(-S(3), -S(7));
      cg.lineTo(S(10), S(7));
      cg.stroke();
      const quality = state.qualities.find((q) => q.route === card.route && !q.active);
      if (quality) {
        const hint = after >= quality.layer
          ? `选它 → 质变【${quality.name}】`
          : `再选 ${quality.layer - after} 张${ROUTE_NAME[card.route]} → 质变【${quality.name}】`;
        glassLabel(this.host, node, 'Hint', hint, 0, -S(194), S(20), GLASS_COLOR.champagne, w - S(24), HorizontalTextAlignment.CENTER);
      }
    }
    if (!busy && !selected) {
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.onSelect(card.key), this);
      this.host.applyImageButtonFeedback(node, 1.02, 0.98);
      this.host.applyPointerCursor?.(node);
    }
  }

  /** 刷新图标:程序画的环形箭头(原型 ⟳)。 */
  private refreshGlyph(parent: Node, x: number, y: number, S: (v: number) => number): void {
    const g = this.host.addChildPlainNode(parent, 'Glyph', x, y, S(28), S(28)).addComponent(Graphics);
    g.strokeColor = GLASS_COLOR.text;
    g.lineWidth = Math.max(1.5, S(2.4));
    g.arc(0, 0, S(10), Math.PI * 0.25, Math.PI * 1.85, true);
    g.stroke();
    const ax = Math.cos(Math.PI * 0.25) * S(10);
    const ay = Math.sin(Math.PI * 0.25) * S(10);
    g.fillColor = GLASS_COLOR.text;
    g.moveTo(ax + S(5), ay + S(2));
    g.lineTo(ax - S(2), ay + S(6));
    g.lineTo(ax - S(1), ay - S(3));
    g.close();
    g.fill();
  }
}
