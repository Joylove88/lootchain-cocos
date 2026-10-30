import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UITransform, Vec3 } from 'cc';
import type { WorldRewardItemVO } from '../../types/WorldTypes';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { GLASS_COLOR, glassLabel, glassProtoMap, mountGlassButton, mountGlassLine, mountGlassPanel, mountGlassSlice, GLASS_SLICES } from '../UiGlassKit';
import type { UiKitHost } from '../UiKit';
import { POI_ASSET, type WorldMapPoiKind } from './LobbyWorldMaps';

/**
 * 野外兴趣点弹层(docs/54,原型 poi_stele_b / poi_found_b,1870×841 坐标 1:1):
 * - found:隐藏点「?」发现卡(屏幕中上,背景只轻压暗);
 * - stele:遗迹石碑阅读面板(背景压暗,左插画右故事)。
 * 状态挂在 GameRoot.worldPoiDialog,整页重绘后由 syncWorldOverlays 挂回。
 */
export interface WorldPoiDialogState {
  kind: 'found' | 'stele';
  poiCode: string;
  poiKind: WorldMapPoiKind;
  /** 这次领到的奖励;重读石碑时为空。 */
  rewards: WorldRewardItemVO[];
  /** 石碑:是否首次阅读(首次显示奖励行)。 */
  first: boolean;
  /** 隐藏点 / 石碑在本区的进度文字(如「隐藏点 1 / 3 · 晨风村」)。 */
  progressText: string;
  /** 石碑底部收集说明(如「新手区石碑 1 / 2 · 集齐解锁成就「晨曦往事」」)。 */
  footerText: string;
}

export interface LobbyPoiDialogHost extends UiKitHost {
  createUiNode(name: string): Node;
  currentWorldPoiDialog(): WorldPoiDialogState | null;
  closeWorldPoiDialog(): void;
}

/** 隐藏点 / 石碑文案(docs/54 §2)。 */
export const WORLD_POI_TEXT: Record<string, { title: string; body: string }> = {
  V_HIDDEN_1: { title: '风车背后', body: '风车的木板松了一块,里面塞着一只小布袋。大概是磨坊主藏起来的私房钱吧……他应该不会介意借你一点。' },
  V_HIDDEN_2: { title: '桥下的布包', body: '桥墩的石缝里卡着一只湿漉漉的布包,看样子是哪个赶路的旅人掉下来的。里面的东西倒还完好。' },
  V_HIDDEN_3: { title: '麦田里的稻草人', body: '稻草人的怀里藏着一枚旧护符,线绳都磨断了。也许是哪个孩子把它当成了守护麦田的骑士。' },
  W_HIDDEN_1: { title: '瀑布后的岩缝', body: '水帘后面有一道干燥的岩缝,里面整整齐齐码着几块矿石——有人曾把这里当成自己的小仓库。' },
  W_HIDDEN_2: { title: '倒木下的箭袋', body: '倒木底下压着一只旧箭袋,刻着猎人营地的记号。箭已经没了,夹层里还留着几枚钱币。' },
  W_HIDDEN_3: { title: '崖边的营火', body: '崖边有一堆早已熄灭的营火,旁边的石头下压着一包补给。看来上一个来这里的冒险者走得很匆忙。' },
  V_STELE_1: {
    title: '晨曦之碑',
    body: '很久以前,这片大地只有长夜。沉默诸神在山谷里点燃了第一缕晨光,人们沿着光走来,建起了第一座村庄——晨风村。诸神离去前留下誓约:只要晨光不灭,大地就不会再沉入黑暗。',
  },
  W_STELE_1: {
    title: '古树之碑',
    body: '这棵古树比村子还要古老。传说沉默诸神离去时,把最后的低语封进了它的年轮,命它守望林地。每当长夜的气息逼近,古树的叶子就会在无风时沙沙作响。',
  },
};

const MAP_NAME: Record<string, string> = { V: '晨风村', W: '村外林地' };

/** 粗估文字宽(中文按字号、其余按 0.56 字号)。 */
function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of Array.from(text)) {
    w += /[\u0000-ÿ]/.test(ch) ? fontSize * 0.56 : fontSize;
  }
  return w;
}

/** 中文按宽度手动断行(原生 Label 不做避头尾):行首的闭合标点拉回上一行。 */
function wrapCjk(text: string, fontSize: number, width: number): string {
  const noHead = '）)，,。.、；;：:！!？?」』】》…—';
  const lines: string[] = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (line && textWidth(line + ch, fontSize) > width && !noHead.includes(ch)) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines.join('\n');
}

function rewardIcon(item: WorldRewardItemVO): string {
  if (item.resourceCode === 'GOLD') {
    return 'ui/bag/ai/icon_gold/spriteFrame';
  }
  if (item.resourceCode === 'DIAMOND') {
    return 'ui/bag/ai/icon_diamond/spriteFrame';
  }
  return resolveBagStyleItemIconAsset(item.resourceCode, item.resourceType) ?? 'ui/bag/ai/icon_gold/spriteFrame';
}

export function poiMapName(code: string): string {
  return MAP_NAME[code.charAt(0)] ?? '';
}

export class LobbyPoiDialogRenderer {
  static readonly OVERLAY = 'LobbyPoiOverlay';

  constructor(private readonly host: LobbyPoiDialogHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentWorldPoiDialog();
    if (!state) {
      return;
    }
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const overlay = this.host.createUiNode(LobbyPoiDialogRenderer.OVERLAY);
    overlay.setPosition(new Vec3((layout.stageLeft + layout.stageRight) / 2, (layout.stageTop + layout.stageBottom) / 2, 0));
    overlay.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    overlay.addComponent(BlockInputEvents);
    // 原型:石碑面板背景压暗约 60%;发现卡只轻压约 25%(场景和 HUD 仍看得见)
    const dim = overlay.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, state.kind === 'stele' ? 150 : 64);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    if (state.kind === 'stele') {
      this.renderStele(overlay, state, W, H);
    } else {
      this.renderFound(overlay, state, W, H);
    }
  }

  private T(parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, S: (v: number) => number, bold = false): Label {
    const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, HorizontalTextAlignment.LEFT, bold);
    label.fontSize = Math.max(12, Math.round(S(size)));
    label.lineHeight = label.fontSize + 4;
    return label;
  }

  /** 正文多行:左上角对齐到 (x, top),行高按原型。 */
  private body(parent: Node, name: string, text: string, x: number, top: number, size: number, lineH: number, width: number, S: (v: number) => number): void {
    const font = Math.max(12, Math.round(S(size)));
    const wrapped = wrapCjk(text, font, S(width));
    const lines = wrapped.split('\n').length;
    const h = S(lineH) * lines;
    // LEFT 对齐时 x 就是文字左沿(UiPrimitiveFactory 已按对齐平移框)
    const label = this.host.addChildLabel(parent, name, wrapped, x, top - h / 2, font, GLASS_COLOR.text, new Size(S(width), h), HorizontalTextAlignment.LEFT);
    label.lineHeight = S(lineH);
    label.overflow = Label.Overflow.NONE;
    label.enableWrapText = false;
    label.enableOutline = false;
  }

  private rewardChip(parent: Node, name: string, item: WorldRewardItemVO, cx: number, cy: number, w: number, h: number, S: (v: number) => number, k: number): void {
    const chip = this.host.addChildPlainNode(parent, name, cx, cy, w, h);
    mountGlassSlice(this.host, chip, 'Bg', GLASS_SLICES.hudCapsule, 0, 0, w, h, (h / 48) * 0.9);
    const iconD = h * 0.62;
    const icon = this.host.addSprite('Icon', rewardIcon(item), -w / 2 + S(18) + iconD / 2, 0, iconD, iconD, chip);
    icon && (icon.sizeMode = Sprite.SizeMode.CUSTOM);
    const label = glassLabel(this.host, chip, 'Text', `${item.resourceName} ×${item.amount}`, -w / 2 + S(30) + iconD, 0, S(23), GLASS_COLOR.text, w - iconD - S(44));
    label.fontSize = Math.max(12, Math.round(S(23)));
    void k;
  }

  private closeButton(parent: Node, x: number, y: number, S: (v: number) => number): void {
    const node = this.host.addChildPlainNode(parent, 'Close', x, y, S(64), S(64));
    const g = this.host.addChildPlainNode(node, 'X', 0, 0, S(40), S(40)).addComponent(Graphics);
    g.strokeColor = GLASS_COLOR.text;
    g.lineWidth = Math.max(2, S(3.2));
    const r = S(17);
    g.moveTo(-r, r);
    g.lineTo(r, -r);
    g.moveTo(r, r);
    g.lineTo(-r, -r);
    g.stroke();
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.closeWorldPoiDialog());
    this.host.applyImageButtonFeedback(node, 1.08, 0.94);
  }

  /** 原型 poi_stele_b:面板 (382,123)-(1490,735)。 */
  private renderStele(overlay: Node, state: WorldPoiDialogState, W: number, H: number): void {
    const { FX, FY, S, k } = glassProtoMap(W, H);
    const text = WORLD_POI_TEXT[state.poiCode] ?? { title: '遗迹石碑', body: '' };
    const panel = mountGlassPanel(this.host, overlay, 'StelePanel', FX(936), FY(429), S(1108), S(612), k * 1.4);
    panel.addComponent(BlockInputEvents);
    const L = (px: number): number => FX(px) - FX(936);
    const Y = (py: number): number => FY(py) - FY(429);
    this.T(panel, 'Title', text.title, L(430), Y(172), 44, GLASS_COLOR.text, S(500), S, true);
    this.T(panel, 'Sub', `遗迹石碑 · ${poiMapName(state.poiCode)}`, L(430), Y(220), 24, GLASS_COLOR.sub, S(500), S);
    this.closeButton(panel, L(1440), Y(167), S);
    // 左:石碑插画(细框圆角矩形里放石碑素材,底衬暗绿)
    const frameW = S(355);
    const frameH = S(360);
    const art = this.host.addChildPlainNode(panel, 'Art', L(607), Y(435), frameW, frameH);
    const ag = art.addComponent(Graphics);
    ag.fillColor = rgba(34, 44, 36, 255);
    ag.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, S(10));
    ag.fill();
    // 插画底:所在地图的草地纹理压暗一点(原型是石碑立在草地上的小插画)
    const groundArt = this.host.addSprite('Ground', state.poiCode.startsWith('W') ? 'ui/world/ground_woods3/spriteFrame' : 'ui/world/ground_village3/spriteFrame', 0, 0, frameW - S(4), frameH - S(4), art);
    if (groundArt) {
      groundArt.sizeMode = Sprite.SizeMode.CUSTOM;
      groundArt.color = rgba(196, 204, 190, 255);
    }
    const stele = this.host.addSprite('Stele', POI_ASSET.stele, 0, -S(6), frameW * 0.72, frameH * 0.9, art);
    if (stele) {
      const frame = stele.spriteFrame;
      const ow = frame?.originalSize.width ?? 1;
      const oh = frame?.originalSize.height ?? 1;
      const kk = Math.min((frameW * 0.86) / ow, (frameH * 0.9) / oh);
      stele.sizeMode = Sprite.SizeMode.CUSTOM;
      stele.node.getComponent(UITransform)?.setContentSize(ow * kk, oh * kk);
    }
    ag.strokeColor = rgba(227, 196, 138, 200);
    ag.lineWidth = Math.max(1, S(2));
    ag.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, S(10));
    ag.stroke();
    // 右:故事
    this.body(panel, 'Story', text.body, L(832), Y(283), 27, 50, 610, S);
    mountGlassLine(this.host, panel, 'Div1', L(1137), Y(518), S(610), Math.max(1, S(1.2)), rgba(255, 255, 255, 34));
    if (state.first && state.rewards.length > 0) {
      this.T(panel, 'RewardHead', '首次阅读奖励', L(832), Y(571), 25, GLASS_COLOR.sub, S(260), S);
      const item = state.rewards[0];
      this.rewardChip(panel, 'Reward', item, L(1312), Y(576), S(260), S(62), S, k);
    } else {
      this.T(panel, 'RewardHead', '已读过这块石碑', L(832), Y(571), 25, GLASS_COLOR.dim, S(400), S);
    }
    mountGlassLine(this.host, panel, 'Div2', L(936), Y(638), S(1012), Math.max(1, S(1.2)), rgba(255, 255, 255, 30));
    if (state.footerText) {
      this.T(panel, 'Footer', state.footerText, L(430), Y(688), 23, GLASS_COLOR.sub, S(640), S);
    }
    mountGlassButton(this.host, panel, 'Ok', state.first ? '收下' : '关闭', L(1282), Y(686), S(332), S(63), k * 1.15, 'primary', () => this.host.closeWorldPoiDialog(), 26);
  }

  /** 原型 poi_found_b:卡片 (604,142)-(1268,567)。 */
  private renderFound(overlay: Node, state: WorldPoiDialogState, W: number, H: number): void {
    const { FX, FY, S, k } = glassProtoMap(W, H);
    const text = WORLD_POI_TEXT[state.poiCode] ?? { title: '隐藏点', body: '' };
    const card = mountGlassPanel(this.host, overlay, 'FoundCard', FX(936), FY(354.5), S(664), S(425), k * 1.4);
    card.addComponent(BlockInputEvents);
    const L = (px: number): number => FX(px) - FX(936);
    const Y = (py: number): number => FY(py) - FY(354.5);
    // 圆徽「?」
    const badge = this.host.addChildPlainNode(card, 'Badge', L(665), Y(203), S(70), S(70));
    const bg = badge.addComponent(Graphics);
    bg.fillColor = rgba(20, 24, 32, 230);
    bg.circle(0, 0, S(33));
    bg.fill();
    bg.strokeColor = rgba(255, 255, 255, 60);
    bg.lineWidth = Math.max(1, S(1.6));
    bg.circle(0, 0, S(33));
    bg.stroke();
    const q = this.host.addChildLabel(badge, 'Q', '?', 0, S(1), Math.round(S(38)), GLASS_COLOR.text, new Size(S(60), S(60)), HorizontalTextAlignment.CENTER);
    q.isBold = true;
    this.T(card, 'Title', `发现 · ${text.title}`, L(722), Y(190), 34, GLASS_COLOR.text, S(500), S, true);
    this.T(card, 'Sub', state.progressText, L(722), Y(229), 21, GLASS_COLOR.sub, S(500), S);
    mountGlassLine(this.host, card, 'Div', L(935), Y(259), S(606), Math.max(1, S(1.2)), rgba(255, 255, 255, 34));
    this.body(card, 'Story', text.body, L(645), Y(275), 25, 39, 590, S);
    const chips = state.rewards.slice(0, 3);
    let x = L(645);
    chips.forEach((item, i) => {
      const w = S(Math.max(190, textWidth(`${item.resourceName} ×${item.amount}`, 23) + 96));
      this.rewardChip(card, `Reward_${i}`, item, x + w / 2, Y(438), w, S(53), S, k);
      x += w + S(16);
    });
    mountGlassButton(this.host, card, 'Ok', '收下', L(1125), Y(520), S(238), S(61), k * 1.15, 'primary', () => this.host.closeWorldPoiDialog(), 26);
  }
}
