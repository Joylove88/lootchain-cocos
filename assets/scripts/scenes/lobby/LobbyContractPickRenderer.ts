import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UITransform, Vec3 } from 'cc';
import type { StarterContractCandidate } from '../../api/StarterContractApi';
import type { UiLayout } from './LobbyHudTypes';
import { mountCoverArt, resolveHeroRosterArtPath } from './HeroHeadCrop';
import { glassLabel, glassProtoMap, glassTagPillWidthOf, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassSlice, mountGlassTagPill } from '../UiGlassKit';

export interface ContractPickHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor?(node: Node): void;
}

export interface ContractPickState {
  candidates: StarterContractCandidate[];
  selected: string;
  busy: boolean;
  error: string;
}

/** 卡上的定位 + 两个特点标签(原型 contract_pick_b;6 名 R 候选池)。 */
const HERO_BLURB: Record<string, { role: string; tags: [string, string] }> = {
  R_PATROL_01: { role: '战士 · 前排输出', tags: ['上手简单', '近战连击'] },
  R_ACOLY_02: { role: '辅助 · 治疗支援', tags: ['回复队友', '生存稳定'] },
  R_SCOUT_03: { role: '刺客 · 突进爆发', tags: ['切入后排', '高暴击'] },
  R_CULT_05: { role: '法师 · 范围伤害', tags: ['清怪最快', '远程'] },
  R_RANGER_06: { role: '射手 · 远程单点', tags: ['放风筝', '高暴击'] },
  R_GUARD_07: { role: '坦克 · 前排承伤', tags: ['皮糙肉厚', '保护队友'] },
};
const ZERO_PORTRAIT = 'ui/protagonist/b/zero_m_round/spriteFrame';
/** 右上职业标识:亮金线条职业图标(原型右上角样式,tools/qa/class_gold_icons.py 入库)。 */
const CLASS_ICONS: Record<string, string> = {
  战士: 'ui/glass/class_gold_warrior/spriteFrame',
  法师: 'ui/glass/class_gold_mage/spriteFrame',
  刺客: 'ui/glass/class_gold_assassin/spriteFrame',
  射手: 'ui/glass/class_gold_archer/spriteFrame',
  辅助: 'ui/glass/class_gold_support/spriteFrame',
  坦克: 'ui/glass/class_gold_tank/spriteFrame',
};

/**
 * docs/58「契约之选」(原型 周报截图/2026-11-02_主角/proto/contract_pick_b.png,用户 11-02 确认):
 * 觉醒演出后弹出,背景压暗;标题 + 副标题,三张竖卡(名册立绘 cover 裁切 / 左上 R 标 / 右上职业标识 / 居中名字 / 定位 / 两个特点标签),
 * 选中卡放大 2.5% + 暗金描边 + 顶边正中的勾;零的对话卡(圆头像压在框左沿)居中偏左,右侧「订立契约」。不可跳过、不可关闭(必须选一名)。
 * 11-03 用户:按原型逐项对齐(框内缩进 / 文字居中 / 右上标识 / 对话卡位置 / 头像样式),坐标全部取原型 1870×841 实测像素。
 */
export class LobbyContractPickRenderer {
  static readonly NODE_NAME = 'LobbyContractPick';

  constructor(private readonly host: ContractPickHost, private readonly onSelect: (heroCode: string) => void, private readonly onConfirm: () => void) {}

  render(layout: UiLayout, state: ContractPickState): void {
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const root = this.host.createUiNode(LobbyContractPickRenderer.NODE_NAME);
    root.setPosition(new Vec3(cx, cy, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    // 压暗(原型:冷蓝深底 + 四周渐暗、中间略透,底下的村子只剩轮廓;11-03 用户嫌原来一层 200 透明黑太亮、草地绿透出来)
    const dim = root.addComponent(Graphics);
    const W = layout.width;
    const H = layout.height;
    dim.fillColor = new Color(8, 12, 22, 222);
    dim.rect(-W / 2, -H / 2, W, H);
    dim.fill();
    // 四周渐暗:10 圈互不重叠的边框带,越靠外越黑(Graphics 没有径向渐变)
    const bands = 10;
    const insetX = (i: number): number => W * 0.24 * (i / bands);
    const insetY = (i: number): number => H * 0.22 * (i / bands);
    for (let i = 0; i < bands; i += 1) {
      dim.fillColor = new Color(3, 5, 10, Math.round(150 * (1 - i / bands)));
      const ox = insetX(i);
      const oy = insetY(i);
      const bx = insetX(i + 1) - ox;
      const by = insetY(i + 1) - oy;
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

    glassLabel(this.host, root, 'Title', '契约之选', FX(935), FY(40), S(46), GLASS_COLOR.text, S(600), HorizontalTextAlignment.CENTER, true);
    glassLabel(this.host, root, 'Subtitle', '圣契残存的力量,只够与一位强者订立契约', FX(935), FY(90), S(24), GLASS_COLOR.sub, S(900), HorizontalTextAlignment.CENTER);

    // 三张竖卡(原型 354×515,中心 x 534 / 936 / 1338,y 392)
    const xs = [534, 936, 1338];
    state.candidates.slice(0, 3).forEach((hero, i) => this.card(root, hero, FX(xs[i]), FY(392), S, k, hero.heroCode === state.selected, state.busy));

    // 零的对话卡(原型框 x 350~1243 / y 683~803;圆头像中心 (313, 743) 直径 146,压在框左沿上)
    const dw = S(893);
    const dh = S(120);
    const dialog = this.host.addChildPlainNode(root, 'Dialogue', FX(796), FY(743), dw, dh);
    mountGlassSlice(this.host, dialog, 'Glass', GLASS_SLICES.panel, 0, 0, dw, dh, k);
    glassLabel(this.host, dialog, 'Speaker', '零', S(416 - 796), S(30), S(24), GLASS_COLOR.champagne, S(120), HorizontalTextAlignment.LEFT, true);
    const line = state.error || '挑一个顺眼的吧。其余的伙伴,以后去圣契祭坛还能召唤。';
    glassLabel(this.host, dialog, 'Line', line, S(416 - 796), -S(12), S(24), state.error ? GLASS_COLOR.red : GLASS_COLOR.text, S(800));
    const portrait = this.host.addChildPlainNode(root, 'ZeroPortrait', FX(313), FY(743), S(152), S(152));
    const pg = portrait.addComponent(Graphics);
    pg.fillColor = new Color(14, 19, 30, 255);
    pg.circle(0, 0, S(73));
    pg.fill();
    this.host.addSprite('Face', ZERO_PORTRAIT, 0, 0, S(140), S(140), portrait);
    const ring = this.host.addChildPlainNode(portrait, 'Ring', 0, 0, S(152), S(152));
    const rg = ring.addComponent(Graphics);
    rg.strokeColor = new Color(196, 204, 220, 150);
    rg.lineWidth = Math.max(1.5, S(2));
    rg.circle(0, 0, S(72));
    rg.stroke();
    rg.strokeColor = new Color(0, 0, 0, 120);
    rg.lineWidth = Math.max(1, S(1.5));
    rg.circle(0, 0, S(74.5));
    rg.stroke();

    // 主按钮(原型 x 1288~1627 / y 705~781)
    const ready = !!state.selected && !state.busy;
    const confirm = mountGlassButton(this.host, root, 'Confirm', state.busy ? '订立中…' : '订立契约', FX(1457), FY(743), S(339), S(76), k,
      ready ? 'primary' : 'primaryOff', () => this.onConfirm(), 30);
    this.host.applyPointerCursor?.(confirm);
  }

  private card(root: Node, hero: StarterContractCandidate, x: number, y: number, S: (v: number) => number, k: number, selected: boolean, busy: boolean): void {
    const w = S(354);
    const h = S(515);
    const card = this.host.addChildPlainNode(root, `Card_${hero.heroCode}`, x, y, w, h);
    if (selected) {
      card.setScale(1.025, 1.025, 1);
    }
    // 卡底一律用普通玻璃框(选中态的暖金内光会把卡下半染成金色,原型选中只是金边 + 外晕,卡心仍是暗色)
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.frame, 0, 0, w, h, k);
    // 立绘铺满卡上部(原型顶边内到 y≈505,约卡高 71%),圆角遮罩跟卡框圆角走,下段渐暗压进卡底,名字压在渐暗上
    const inset = S(3);
    const artH = S(368);
    const artW = w - inset * 2;
    const artTop = h / 2 - inset;
    const clip = this.host.addChildPlainNode(card, 'ArtClip', 0, artTop - artH / 2, artW, artH);
    const mask = clip.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_STENCIL;
    const mg = clip.getComponent(Graphics) ?? clip.addComponent(Graphics);
    mg.roundRect(-artW / 2, -artH / 2, artW, artH, S(15));
    mg.fill();
    const art = this.host.addChildPlainNode(clip, 'Art', 0, 0, artW, artH);
    const artPath = resolveHeroRosterArtPath(hero.heroCode);
    if (artPath) {
      mountCoverArt(art, artPath, artW, artH);
    }
    const fadeH = S(110);
    const fade = this.host.addChildPlainNode(card, 'Fade', 0, artTop - artH + fadeH / 2, artW, fadeH);
    const fg = fade.addComponent(Graphics);
    const steps = 11;
    for (let i = 0; i < steps; i += 1) {
      // 自上而下越来越实(底色与玻璃卡心一致)
      fg.fillColor = new Color(18, 23, 33, Math.round(250 * ((i + 1) / steps)));
      fg.rect(-artW / 2, fadeH / 2 - (i + 1) * (fadeH / steps), artW, fadeH / steps + 0.5);
      fg.fill();
    }
    if (selected) {
      // 选中:金边 + 一圈淡金外晕(原型)
      const border = this.host.addChildPlainNode(card, 'SelBorder', 0, 0, w + S(16), h + S(16));
      const bg = border.addComponent(Graphics);
      bg.strokeColor = new Color(226, 190, 120, 60);
      bg.lineWidth = S(7);
      bg.roundRect(-w / 2 - S(2), -h / 2 - S(2), w + S(4), h + S(4), S(20));
      bg.stroke();
      bg.strokeColor = new Color(232, 198, 128, 255);
      bg.lineWidth = Math.max(2, S(2.5));
      bg.roundRect(-w / 2 + S(1), -h / 2 + S(1), w - S(2), h - S(2), S(17));
      bg.stroke();
    }
    // 左上 R 标(原型 50×32,距左 21 / 顶 17):暗底细边胶囊 + 银色斜体 R
    const tag = this.host.addChildPlainNode(card, 'Rarity', -w / 2 + S(46), h / 2 - S(33), S(50), S(32));
    mountGlassSlice(this.host, tag, 'Bg', GLASS_SLICES.tagPill, 0, 0, S(50), S(32), k);
    const rarity = glassLabel(this.host, tag, 'R', hero.rarity || 'R', 0, 0, S(22), new Color(206, 214, 230, 255), S(50), HorizontalTextAlignment.CENTER, true);
    rarity.isItalic = true;
    const blurb = HERO_BLURB[hero.heroCode] ?? { role: hero.heroClass ?? '', tags: ['', ''] as [string, string] };
    // 右上职业标识(原型圆直径 58,中心距右 45 / 顶 43):暗底细环 + 亮金职业图标
    const classIcon = CLASS_ICONS[blurb.role.split(' ')[0]] ?? CLASS_ICONS[hero.heroClass ?? ''];
    if (classIcon) {
      const badge = this.host.addChildPlainNode(card, 'ClassBadge', w / 2 - S(45), h / 2 - S(43), S(60), S(60));
      const bg = badge.addComponent(Graphics);
      bg.fillColor = new Color(14, 17, 24, 190);
      bg.circle(0, 0, S(29));
      bg.fill();
      bg.strokeColor = new Color(200, 170, 112, 130);
      bg.lineWidth = Math.max(1, S(1.4));
      bg.circle(0, 0, S(29));
      bg.stroke();
      this.host.addSprite('Icon', classIcon, 0, 0, S(38), S(38), badge);
    }
    if (selected) {
      // 选中勾:骑在卡顶边正中(原型 48×32 香槟金圆角块)
      const check = this.host.addChildPlainNode(card, 'Check', 0, h / 2, S(52), S(36));
      const cg = check.addComponent(Graphics);
      cg.fillColor = GLASS_COLOR.champagne;
      cg.roundRect(-S(24), -S(16), S(48), S(32), S(10));
      cg.fill();
      cg.strokeColor = GLASS_COLOR.onChampagne;
      cg.lineWidth = Math.max(2, S(3));
      cg.moveTo(-S(8), 0);
      cg.lineTo(-S(2), -S(6));
      cg.lineTo(S(9), S(6));
      cg.stroke();
    }
    // 文字居中(原型:名字 y 514 / 定位 y 555 / 标签 y 600,相对卡心 392)
    glassLabel(this.host, card, 'Name', hero.heroName, 0, -S(122), S(34), GLASS_COLOR.text, w - S(40), HorizontalTextAlignment.CENTER, true);
    glassLabel(this.host, card, 'Role', blurb.role, 0, -S(163), S(20), GLASS_COLOR.sub, w - S(40), HorizontalTextAlignment.CENTER);
    const tags = blurb.tags.filter((t) => !!t);
    const fontSize = S(18);
    const pillH = S(36);
    const gap = S(18);
    const estimate = (str: string, size: number): number => str.length * size * 1.02;
    const total = tags.reduce((sum, t) => sum + glassTagPillWidthOf(t, fontSize, pillH, estimate), 0) + gap * Math.max(0, tags.length - 1);
    let tx = -total / 2;
    for (const text of tags) {
      tx += mountGlassTagPill(this.host, card, `Tag_${text}`, text, tx, -S(208), pillH, k, fontSize, estimate) + gap;
    }
    if (!busy && !selected) {
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => this.onSelect(hero.heroCode), this);
      this.host.applyImageButtonFeedback(card, 1.02, 0.98);
      this.host.applyPointerCursor?.(card);
    }
  }
}
