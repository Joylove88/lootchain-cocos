import {
  BlockInputEvents,
  Button,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { ProtagonistCreateFormState, ProtagonistGender } from '../../types/ProtagonistTypes';
import type { UiLayout } from '../lobby/LobbyHudTypes';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassIconButton, mountGlassLine, mountGlassSlice } from '../UiGlassKit';

const B = (name: string): string => `ui/protagonist/b/${name}/spriteFrame`;
const G = (name: string): string => `ui/glass/${name}/spriteFrame`;

const ART = {
  bg: B('soul_sea_bg'),
  ghost: B('yedi_m'),
  zero: B('zero_m'),
  base: { male: B('protag_m_base'), female: B('protag_f_base') } as Record<ProtagonistGender, string>,
  bust: { male: B('protag_m_bust'), female: B('protag_f_bust') } as Record<ProtagonistGender, string>,
};

const CLASS_TEXT: Record<ProtagonistGender, string> = { male: '圣契剑士 · 重剑', female: '圣契剑士 · 细剑' };
const SKILLS = [
  { icon: G('protag_skill_slash'), name: '魂斩' },
  { icon: G('protag_skill_seal'), name: '契印爆发' },
  { icon: G('protag_skill_step'), name: '残影步' },
];

export interface ProtagonistCreateRendererHost {
  node: Node;
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
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
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean, options?: { frameless?: boolean; placeholder?: string; placeholderColor?: Color }): EditBox;
  setProtagonistNameInput(input: EditBox | null): void;
  setProtagonistNameDraft(name: string): void;
  selectProtagonistGender(gender: ProtagonistGender): void;
  rollProtagonistName(): void;
  submitProtagonistCreate(): void;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor(node: Node): void;
}

/**
 * docs/60「选择主角」(B 风格,原型 周报截图/2026-11-02_主角/proto/protagonist_create_b(_female).png,用户 11-03 确认):
 * 左 = 万界之海舞台(主角全身 + 身后约 15% 的夜帝残影 + 肩旁漂浮的零),右 = 毛玻璃面板(男 / 女卡、出身 / 职业 / 前世、
 * 3 个初始技能、起名框 + 骰子、「踏上强者之路」)。坐标全部取原型像素(1870×841)经 glassProtoMap 映射。
 * 前世夜帝固定男性(11-03 用户),选女主角时残影 / 零也用男版。只负责画,不决定主角属性;正式创建走后端。
 */
export class ProtagonistCreateRenderer {
  constructor(private readonly host: ProtagonistCreateRendererHost) {}

  render(layout: UiLayout, state: ProtagonistCreateFormState): void {
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const T = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };
    const gender = state.selectedGender;

    const root = this.host.createUiNode('ProtagonistCreateScene');
    root.setPosition(new Vec3(cx, cy, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);

    // 背景:万界之海整屏 cover(原图 1672×941,右侧本来就偏暗给面板),整体再压一层暗
    const bgW = Math.max(layout.width, layout.height * (1672 / 941));
    this.host.addSprite('ProtagonistBg', ART.bg, 0, 0, bgW, bgW * (941 / 1672), root);
    const shade = this.host.addChildPlainNode(root, 'ProtagonistShade', 0, 0, layout.width, layout.height);
    const g = shade.addComponent(Graphics);
    g.fillColor = new Color(6, 9, 14, 70);
    g.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    g.fill();

    // 舞台:夜帝残影(原型约 15%,冷灰蓝)→ 主角全身(脚踩石台,原型 y 135..780)→ 零(原型 865,230,上下漂)
    const ghost = this.host.addSprite('ProtagonistGhost', ART.ghost, FX(560), FY(350), S(560), S(840), root);
    if (ghost) {
      ghost.color = new Color(176, 192, 220, 255);
      const op = ghost.node.addComponent(UIOpacity);
      op.opacity = 44;
      tween(op).repeatForever(tween().to(3.2, { opacity: 30 }).to(3.2, { opacity: 50 })).start();
    }
    this.host.addSprite('ProtagonistBody', ART.base[gender], FX(735), FY(452), S(440), S(660), root);
    const zero = this.host.addSprite('ProtagonistZero', ART.zero, FX(875), FY(240), S(150), S(150), root);
    if (zero) {
      const base = zero.node.position.clone();
      tween(zero.node).repeatForever(
        tween().to(1.8, { position: new Vec3(base.x, base.y + S(10), 0) }, { easing: 'sineInOut' })
          .to(1.8, { position: base }, { easing: 'sineInOut' }),
      ).start();
    }

    // 标题(原型 60,42 / 60,86)
    T(root, 'ProtagonistTitle', '选择主角', FX(60), FY(42), 44, GLASS_COLOR.text, S(400), HorizontalTextAlignment.LEFT, true);
    T(root, 'ProtagonistSubtitle', '前世的残魂,正在万界之海中寻找它的转世……', FX(60), FY(86), 20, GLASS_COLOR.sub, S(620));

    // 右侧面板 1166..1836 × 22..808
    const panel = this.host.addChildPlainNode(root, 'ProtagonistPanel', FX(1501), FY(415), S(670), S(786));
    panel.addComponent(BlockInputEvents);
    mountGlassSlice(this.host, panel, 'GlassBase', GLASS_SLICES.panel, 0, 0, S(670), S(786), k);
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, S(670), S(786), k);
    const P = (px: number): number => FX(px) - FX(1501);
    const Q = (py: number): number => FY(py) - FY(415);

    // 男 / 女卡(原型 1250..1486 / 1518..1758 × 42..248)
    this.genderCard(panel, 'male', '男', P(1368), Q(145), S(236), S(206), k, gender === 'male', T);
    this.genderCard(panel, 'female', '女', P(1638), Q(145), S(240), S(206), k, gender === 'female', T);
    mountGlassLine(this.host, panel, 'DividerTop', P(1503), Q(270), S(596), Math.max(1, S(1)), new Color(255, 255, 255, 26));

    // 出身 / 职业 / 前世(图标 1236,标签 1276,值 1375;行 y 302 / 347 / 390)
    const rows: Array<{ icon: string; label: string; value: string; y: number }> = [
      { icon: G('protag_info_home'), label: '出身', value: '晨风村的孤儿,被认为没有契约天赋', y: 302 },
      { icon: G('protag_info_class'), label: '职业', value: CLASS_TEXT[gender], y: 347 },
      { icon: G('protag_info_past'), label: '前世', value: '???', y: 390 },
    ];
    for (const row of rows) {
      const icon = this.host.addSprite(`Info_${row.label}`, row.icon, P(1236), Q(row.y), S(26), S(26), panel);
      if (icon) {
        icon.color = GLASS_COLOR.champagne;
      }
      T(panel, `InfoLabel_${row.label}`, row.label, P(1276), Q(row.y), 22, GLASS_COLOR.sub, S(90));
      T(panel, `InfoValue_${row.label}`, row.value, P(1375), Q(row.y), 22, GLASS_COLOR.text, S(430));
    }
    const lock = this.host.addSprite('InfoPastLock', GLASS_ICON.lock, P(1442), Q(390), S(20), S(22), panel);
    if (lock) {
      lock.color = GLASS_COLOR.sub;
    }

    // 3 个初始技能(圆心 1331 / 1501 / 1671 × 483,半径 46;名字 y 535)
    SKILLS.forEach((skill, i) => {
      const x = P(1331 + i * 170);
      const disc = this.host.addChildPlainNode(panel, `Skill_${i}`, x, Q(483), S(92), S(92));
      const dg = disc.addComponent(Graphics);
      dg.fillColor = new Color(12, 15, 22, 200);
      dg.circle(0, 0, S(46));
      dg.fill();
      dg.lineWidth = Math.max(1, S(1.5));
      dg.strokeColor = new Color(255, 255, 255, 46);
      dg.circle(0, 0, S(45));
      dg.stroke();
      const icon = this.host.addSprite(`SkillIcon_${i}`, skill.icon, 0, 0, S(58), S(58), disc);
      if (icon) {
        icon.color = GLASS_COLOR.champagne;
      }
      T(panel, `SkillName_${i}`, skill.name, x, Q(535), 21, GLASS_COLOR.text, S(150), HorizontalTextAlignment.CENTER);
    });
    mountGlassLine(this.host, panel, 'DividerBottom', P(1503), Q(568), S(596), Math.max(1, S(1)), new Color(255, 255, 255, 26));

    // 起名:标签 1230 / 框 1335..1782 × 593..651 / 分隔 1705 / 骰子 1741
    T(panel, 'NameLabel', '主角名', P(1230), Q(622), 22, GLASS_COLOR.sub, S(100));
    mountGlassSlice(this.host, panel, 'NameInputBg', GLASS_SLICES.input, P(1558), Q(622), S(447), S(58), k);
    mountGlassLine(this.host, panel, 'NameInputSep', P(1705), Q(622), Math.max(1, S(2)), S(30), new Color(98, 106, 120, 200));
    const dice = mountGlassIconButton(this.host, panel, 'NameDice', G('protag_dice'), P(1741), Q(622), S(34), S(64), () => this.host.rollProtagonistName());
    const diceSprite = dice.getComponentInChildren(Sprite);
    if (diceSprite) {
      diceSprite.color = GLASS_COLOR.champagne;
    }
    this.host.applyPointerCursor(dice);
    const hint = state.error || '2–12 个字,创建后可改名';
    T(panel, 'NameHint', hint, P(1358), Q(670), 18, state.error ? GLASS_COLOR.red : GLASS_COLOR.dim, S(430));

    const submit = mountGlassButton(this.host, panel, 'Submit', state.creating ? '正在订立圣契…' : '踏上强者之路', P(1502), Q(744), S(608), S(72), k,
      state.creating ? 'primaryOff' : 'primary', () => this.host.submitProtagonistCreate(), 30);
    this.host.applyPointerCursor(submit);

    // EditBox 最后建(工厂挂内容根、在面板之上;坐标用内容根绝对坐标);文字起点 = 原型「晨星」x 1368
    const input = this.host.addFramedEditBox(state.protagonistName, cx + FX(1520), cy + FY(622), S(330), layout, false, {
      frameless: true,
      placeholder: '输入主角名',
      placeholderColor: GLASS_COLOR.dim,
    });
    input.node.name = 'ProtagonistNameInput';
    const inputFont = Math.max(14, Math.round(S(26)));
    for (const label of [input.textLabel, input.node.getChildByName('EditBoxDisplayLabel')?.getComponent(Label)]) {
      if (label) {
        label.fontSize = inputFont;
        label.lineHeight = inputFont + 6;
        label.color = GLASS_COLOR.text;
      }
    }
    input.maxLength = 12;
    input.enabled = !state.creating;
    input.node.on(EditBox.EventType.TEXT_CHANGED, (box: EditBox) => this.host.setProtagonistNameDraft(box.string), this);
    input.node.on(EditBox.EventType.EDITING_RETURN, () => this.host.submitProtagonistCreate(), this);
    this.host.setProtagonistNameInput(input);
  }

  private genderCard(
    parent: Node,
    gender: ProtagonistGender,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    k: number,
    selected: boolean,
    T: (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align?: HorizontalTextAlignment, bold?: boolean) => Label,
  ): void {
    const card = this.host.addChildPlainNode(parent, `GenderCard_${gender}`, x, y, w, h);
    // 选中 = 暗金渐变底 + 金边 + 白字(11-02 全局选中口径);未选 = 装备框同款亮边玻璃 + 灰字
    mountGlassSlice(this.host, card, 'Glass', selected ? GLASS_SLICES.tabGold : GLASS_SLICES.frame, 0, 0, w, h, k);
    const bust = this.host.addSprite('Bust', ART.bust[gender], 0, 0, w - 4 * k, h - 4 * k, card);
    if (bust && !selected) {
      bust.color = new Color(170, 176, 188, 255);
    }
    T(card, 'Label', text, 0, -h / 2 + 28 * k, 28, selected ? GLASS_COLOR.onGold : GLASS_COLOR.sub, w, HorizontalTextAlignment.CENTER, selected);
    if (!selected) {
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => this.host.selectProtagonistGender(gender), this);
      this.host.applyImageButtonFeedback(card, 1.02, 0.98);
      this.host.applyPointerCursor(card);
    }
  }
}
