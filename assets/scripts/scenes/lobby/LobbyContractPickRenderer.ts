import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UITransform, Vec3 } from 'cc';
import type { StarterContractCandidate } from '../../api/StarterContractApi';
import type { UiLayout } from './LobbyHudTypes';
import { mountCoverArt, resolveHeroRosterArtPath } from './HeroHeadCrop';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassSlice, mountGlassTagPill } from '../UiGlassKit';

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

/**
 * docs/58「契约之选」(原型 周报截图/2026-11-02_主角/proto/contract_pick_b.png,用户 11-02 确认):
 * 觉醒演出后弹出,背景压暗;标题 + 副标题,三张竖卡(名册立绘 cover 裁切 / R 标 / 名字 / 定位 / 两个特点标签),
 * 选中卡放大 4% + 暗金描边 + 顶部勾;左下零的短对话卡,右下「订立契约」。不可跳过、不可关闭(必须选一名)。
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
    const dim = root.addComponent(Graphics);
    dim.fillColor = new Color(6, 9, 14, 200);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();

    glassLabel(this.host, root, 'Title', '契约之选', FX(935), FY(62), S(46), GLASS_COLOR.text, S(600), HorizontalTextAlignment.CENTER, true);
    glassLabel(this.host, root, 'Subtitle', '圣契残存的力量,只够与一位强者订立契约', FX(935), FY(112), S(22), GLASS_COLOR.sub, S(900), HorizontalTextAlignment.CENTER);

    // 三张竖卡(原型 330×520,中心 x 541 / 935 / 1329,y 395)
    const xs = [541, 935, 1329];
    state.candidates.slice(0, 3).forEach((hero, i) => this.card(root, hero, FX(xs[i]), FY(395), S, k, hero.heroCode === state.selected, state.busy));

    // 左下零的短对话卡(原型 900×130,中心 x 520,y 726)
    const dw = S(900);
    const dh = S(124);
    const dialog = this.host.addChildPlainNode(root, 'Dialogue', FX(520), FY(726), dw, dh);
    mountGlassSlice(this.host, dialog, 'Glass', GLASS_SLICES.panel, 0, 0, dw, dh, k);
    this.host.addSprite('Portrait', ZERO_PORTRAIT, -dw / 2 + S(70), 0, S(92), S(92), dialog);
    glassLabel(this.host, dialog, 'Speaker', '零', -dw / 2 + S(134), S(28), S(20), GLASS_COLOR.champagne, S(120), HorizontalTextAlignment.LEFT, true);
    const line = state.error || '挑一个顺眼的吧。其余的伙伴,以后去圣契祭坛还能召唤。';
    glassLabel(this.host, dialog, 'Line', line, -dw / 2 + S(134), -S(10), S(23), state.error ? GLASS_COLOR.red : GLASS_COLOR.text, dw - S(170));

    // 右下主按钮(原型 300×72,中心 x 1500,y 726)
    const ready = !!state.selected && !state.busy;
    const confirm = mountGlassButton(this.host, root, 'Confirm', state.busy ? '订立中…' : '订立契约', FX(1500), FY(726), S(300), S(72), k,
      ready ? 'primary' : 'primaryOff', () => this.onConfirm(), 30);
    this.host.applyPointerCursor?.(confirm);
  }

  private card(root: Node, hero: StarterContractCandidate, x: number, y: number, S: (v: number) => number, k: number, selected: boolean, busy: boolean): void {
    const w = S(330);
    const h = S(520);
    const card = this.host.addChildPlainNode(root, `Card_${hero.heroCode}`, x, y, w, h);
    if (selected) {
      card.setScale(1.04, 1.04, 1);
    }
    mountGlassSlice(this.host, card, 'Glass', selected ? GLASS_SLICES.panelSel : GLASS_SLICES.frame, 0, 0, w, h, k);
    // 立绘占上 ~65%(名册横版立绘 cover 裁切),下沿压一道渐暗过渡到卡底
    const artH = h * 0.64;
    const art = this.host.addChildPlainNode(card, 'Art', 0, h / 2 - artH / 2 - S(6), w - S(12), artH);
    const artPath = resolveHeroRosterArtPath(hero.heroCode);
    if (artPath) {
      mountCoverArt(art, artPath, w - S(12), artH);
    }
    const fade = this.host.addChildPlainNode(card, 'Fade', 0, h / 2 - artH - S(6) + S(40), w - S(12), S(80));
    const fg = fade.addComponent(Graphics);
    for (let i = 0; i < 8; i += 1) {
      fg.fillColor = new Color(14, 17, 24, 30 + i * 26);
      fg.rect(-(w - S(12)) / 2, S(40) - (i + 1) * S(10), w - S(12), S(10));
      fg.fill();
    }
    // 左上 R 标
    const tag = this.host.addChildPlainNode(card, 'Rarity', -w / 2 + S(34), h / 2 - S(28), S(40), S(26));
    mountGlassSlice(this.host, tag, 'Bg', GLASS_SLICES.tag, 0, 0, S(40), S(26), k);
    glassLabel(this.host, tag, 'R', hero.rarity || 'R', 0, 0, S(17), new Color(170, 196, 226, 255), S(40), HorizontalTextAlignment.CENTER, true);
    if (selected) {
      // 勾放在卡内顶边下(放卡外会压到副标题)
      const check = this.host.addChildPlainNode(card, 'Check', w / 2 - S(32), h / 2 - S(30), S(40), S(40));
      const cg = check.addComponent(Graphics);
      cg.fillColor = GLASS_COLOR.champagne;
      cg.circle(0, 0, S(18));
      cg.fill();
      cg.strokeColor = GLASS_COLOR.onChampagne;
      cg.lineWidth = Math.max(2, S(3));
      cg.moveTo(-S(8), 0);
      cg.lineTo(-S(2), -S(7));
      cg.lineTo(S(9), S(7));
      cg.stroke();
    }
    const blurb = HERO_BLURB[hero.heroCode] ?? { role: hero.heroClass ?? '', tags: ['', ''] as [string, string] };
    const textY = -h / 2 + S(150);
    glassLabel(this.host, card, 'Name', hero.heroName, -w / 2 + S(24), textY + S(40), S(30), selected ? GLASS_COLOR.onGold : GLASS_COLOR.text, w - S(48), HorizontalTextAlignment.LEFT, true);
    glassLabel(this.host, card, 'Role', blurb.role, -w / 2 + S(24), textY, S(19), GLASS_COLOR.sub, w - S(48));
    let tx = -w / 2 + S(24);
    for (const text of blurb.tags.filter((t) => !!t)) {
      tx += mountGlassTagPill(this.host, card, `Tag_${text}`, text, tx, textY - S(46), S(34), k, S(17), (str, size) => str.length * size * 1.02) + S(10);
    }
    if (!busy && !selected) {
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => this.onSelect(hero.heroCode), this);
      this.host.applyImageButtonFeedback(card, 1.02, 0.98);
      this.host.applyPointerCursor?.(card);
    }
  }
}
