import { Button, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, type Color } from 'cc';
import { rgba } from './lobby/LobbyHudTypes';
import { fitButtonLabel } from './UiPrimitiveFactory';

/**
 * 2026-10-15 「参考图风格」UI 套件:终极技能弹窗 / 锻造界面按 GPT 原型逐件拆出的素材(ui/common/ref、ui/forge/ref)。
 * 尺寸与九宫格内边由 scratchpad gen/install_ref.py 量金线得出(素材原图在 素材原始备份/ult-forge-ui-20261015)。
 * 用法:mountRefSliced(host, parent, name, REF_KIT.cardFrame, x, y, w, h) → 节点按素材像素空间建 + 整体 setScale,角饰不变形。
 */
export interface RefKitItem {
  path: string;
  w: number;
  h: number;
  /** 左 / 右 / 上 / 下(素材像素)。 */
  inset: [number, number, number, number];
}

export interface RefKitHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

export const REF_KIT = {
  dialogFrame: { path: 'ui/common/ref/dialog_frame/spriteFrame', w: 1000, h: 632, inset: [120, 120, 90, 90] } as RefKitItem,
  titlePlaque: { path: 'ui/common/ref/title_plaque_wings/spriteFrame', w: 627, h: 160, inset: [0, 0, 0, 0] } as RefKitItem,
  cardFrame: { path: 'ui/common/ref/card_frame/spriteFrame', w: 900, h: 159, inset: [60, 60, 40, 40] } as RefKitItem,
  /** 内芯镂空版(只留金线与角花):标题带垫在它下面,金线 / 角花压在红底上无缝衔接(2026-10-16)。 */
  cardFrameOpen: { path: 'ui/common/ref/card_frame_open/spriteFrame', w: 900, h: 159, inset: [60, 60, 40, 40] } as RefKitItem,
  iconRing: { path: 'ui/common/ref/icon_ring/spriteFrame', w: 256, h: 256, inset: [0, 0, 0, 0] } as RefKitItem,
  statBar: { path: 'ui/common/ref/stat_bar/spriteFrame', w: 900, h: 85, inset: [60, 60, 30, 30] } as RefKitItem,
  btnPrimary: { path: 'ui/common/ref/btn_primary/spriteFrame', w: 1344, h: 326, inset: [160, 160, 60, 60] } as RefKitItem,
  btnSecondary: { path: 'ui/common/ref/btn_secondary/spriteFrame', w: 1344, h: 317, inset: [150, 150, 60, 60] } as RefKitItem,
  pipOn: { path: 'ui/common/ref/pip_on/spriteFrame', w: 96, h: 96, inset: [0, 0, 0, 0] } as RefKitItem,
  pipMid: { path: 'ui/common/ref/pip_mid/spriteFrame', w: 96, h: 96, inset: [0, 0, 0, 0] } as RefKitItem,
  pipOff: { path: 'ui/common/ref/pip_off/spriteFrame', w: 96, h: 96, inset: [0, 0, 0, 0] } as RefKitItem,
};

export const REF_CLOSE_ASSET = 'ui/formation/ref/btn_close/spriteFrame';
/**
 * 哥特大厅实景背景(2026-10-17 GPT 生成,1870×841,不透明):背包 / 任务 / 邮件 / 商店 / 弹层整窗背景共用。
 * 替换原血色大教堂图(battle_bg_cathedral 四周烘焙了一圈假透明棋盘格,铺满时边缘露出灰白方格)。只能等比 cover。
 */
// v2(同日):按原型重出的暖色版(烛台 / 红旗 / 铁链 / 湿地面金色倒影),旧冷色 hall_bg 已不用
export const REF_HALL_BG = { path: 'ui/common/ref/hall_bg_v2/spriteFrame', ratio: 1870 / 841 };
/**
 * 2026-10-17 v2 按原型逐件 GPT 出(原图备份 素材原始备份/ui-unify-v2-20261017):
 * 暗金矩形钮底(角饰 + 细金边)/ 古铜金实心钮 / 两端尖饰的说明长条;九宫格内边手工量(角饰 / 尖饰整块留在角里)。
 */
export const REF_PLATE_DARK: RefKitItem = { path: 'ui/common/ref/plate_dark/spriteFrame', w: 696, h: 150, inset: [70, 70, 40, 40] };
export const REF_PLATE_BRONZE: RefKitItem = { path: 'ui/common/ref/plate_bronze/spriteFrame', w: 568, h: 150, inset: [30, 30, 30, 30] };
export const REF_INFO_BANNER: RefKitItem = { path: 'ui/common/ref/info_banner/spriteFrame', w: 1112, h: 120, inset: [96, 96, 30, 30] };
/**
 * 2026-10-19 终极技能 / 物品详情弹窗(GPT 按原型逐件出):厚雕花金框(大角饰 + 顶冠,内芯透明,九宫格内边取到角饰外)、
 * 大招徽章环(中心透明放技能图)、物品详情大格框。尺寸在 install 后量过回填。
 */
// 2026-10-19 换细线版(原型框线 2~5px、角饰小;厚框 ornate_frame 怎么缩都糊):1600×916,边带 ~23px,角饰约 160,顶冠伸到 4
export const REF_ORNATE_FRAME: RefKitItem = { path: 'ui/common/ref/ornate_frame_thin/spriteFrame', w: 1600, h: 916, inset: [180, 180, 160, 110] };
/** 框内缘(素材像素,实测:顶带 73..95 / 侧带 32..77 / 底带 842..863):标题带 / 内容从这里起算。 */
export const REF_ORNATE_FRAME_EDGE = { top: 95, side: 77, bottom: 74 };
/** 框外缘(素材像素):实底只填到带子外沿,顶冠 / 角饰之外保持透明。 */
export const REF_ORNATE_FRAME_OUTER = { top: 73, side: 32, bottom: 53 };
export const REF_ULT_EMBLEM_RING_ASSET = 'ui/common/ref/ult_emblem_ring/spriteFrame';
export const REF_DETAIL_SLOT_FRAME_ASSET = 'ui/common/ref/detail_slot_frame/spriteFrame';
/** 大招火焰纹章(终极技能弹窗焦点,原型裁出;圆盘带边缘柔光,放在 ult_emblem_ring 环心)。 */
export const REF_ULT_SIGIL_ASSET = 'ui/common/ref/ult_sigil/spriteFrame';
/** 2026-10-19 1:1 还原批:大招徽章一体图(环 + 纹章,无外圈)、金环关闭钮、两个弹窗的内部实景底图(cover 裁切)。 */
export const REF_ULT_EMBLEM_FULL_ASSET = 'ui/common/ref/ult_emblem_full/spriteFrame';
export const REF_CLOSE_RING_ASSET = 'ui/common/ref/close_ring/spriteFrame';
export const REF_ULT_INNER_BG = { path: 'ui/common/ref/ult_inner_bg/spriteFrame', ratio: 2.35 };
/** 终极技能弹窗专项件(2026-10-19,原型整块裁出让 GPT 重绘;尺寸由 install 回填)。 */
const REF_ULT_COST_PANEL_GEOM = { w: 1190, h: 650, inset: [60, 60, 120, 40] as [number, number, number, number] };

// 背包物品详情(2026-10-19 按原型 1:1 第二轮):通栏标题带 / 稀有度物品卡框 / 来源圆徽 / 圆形箭头 / 按钮图标(GPT 照原型出,polish/v3/gen_bag_detail.py)
export type RefDetailSourceKind = 'summon' | 'daily' | 'main' | 'tower' | 'shop' | 'quest' | 'event' | 'forge' | 'guard' | 'other';
export const REF_DETAIL = {
  // 2218×246:暗红本体 y 91..183(不含金边;顶冠两侧补过织纹到原型比例 1302 / 54);按「本体高 = 原型 54」等比整张挂,宽正好 = 框宽
  headerBand: { path: 'ui/common/ref/detail_header_band/spriteFrame', w: 2218, h: 246, bodyY0: 91, bodyY1: 183 },
  // 512×512,内开口 x 57..454 / y 85..447(顶冠在上,开口中心比图心低 10);R 蓝原图,N / SR / SSR 程序换发光色相
  cardFrame: { w: 512, h: 512, open: { x0: 57, x1: 454, y0: 85, y1: 447 } },
  cardFramePath: (rarity: string): string => {
    const key = (rarity || '').toUpperCase();
    const tag = key === 'UR' || key === 'SSR' ? 'ssr' : key === 'SR' || key === 'EPIC' ? 'sr' : key === 'R' || key === 'RARE' ? 'r' : 'n';
    return `ui/bag/ref/card_frame_${tag}/spriteFrame`;
  },
  // 物品卡内底:暗场景 + 地面符文法阵(R 蓝原图,其余程序换色),512 方图,不透明
  cardBgPath: (rarity: string): string => {
    const key = (rarity || '').toUpperCase();
    const tag = key === 'UR' || key === 'SSR' ? 'ssr' : key === 'SR' || key === 'EPIC' ? 'sr' : key === 'R' || key === 'RARE' ? 'r' : 'n';
    return `ui/bag/ref/card_bg_${tag}/spriteFrame`;
  },
  // 名牌:暗带 + 上下细金线 + 两端金箭羽,1200×180;按钮底板(照原型,干净无翼饰):启用暗金 / 主操作红 / 不可用灰
  namePlate: { path: 'ui/bag/ref/name_plate/spriteFrame', w: 1200, h: 180 },
  btnPlate: { dark: 'ui/bag/ref/btn_plate_dark/spriteFrame', red: 'ui/bag/ref/btn_plate_red/spriteFrame', grey: 'ui/bag/ref/btn_plate_grey/spriteFrame' },
  // 分区面板:终极技能消耗面板去掉头带左侧自带小星(物品详情自己放大四芒星在右侧,避免双星)
  sectionPanel: { ...REF_ULT_COST_PANEL_GEOM, path: 'ui/bag/ref/section_panel/spriteFrame' } as RefKitItem,
  arrow: 'ui/bag/ref/detail_arrow/spriteFrame',
  sourceIcon: (kind: RefDetailSourceKind): string => `ui/bag/ref/src_${kind}/spriteFrame`,
  btnIcon: { use: 'ui/bag/ref/ic_btn_use/spriteFrame', fuse: 'ui/bag/ref/ic_btn_fuse/spriteFrame', source: 'ui/bag/ref/ic_btn_source/spriteFrame', sell: 'ui/bag/ref/ic_btn_sell/spriteFrame' },
};

// 背包二级弹窗(使用 / 出售 / 合成,2026-10-20 按原型):短版标题带 + 数量选择件 + 出售结果框 + 合成箭头 + 按钮图标
export const REF_BAG_DLG = {
  // 1426×246,暗红本体 y 91..183(由 detail_header_band 去掉顶冠两侧各 396 列织纹,比例 15.5)
  headerBand: { path: 'ui/common/ref/dialog_header_band/spriteFrame', w: 1426, h: 246, bodyY0: 91, bodyY1: 183 },
  roundBtn: 'ui/bag/ref/dlg_round_btn/spriteFrame',
  chip: 'ui/bag/ref/dlg_chip/spriteFrame',
  sliderTrack: { path: 'ui/bag/ref/dlg_slider_track/spriteFrame', w: 1000, h: 33, inset: [18, 18, 0, 0] } as RefKitItem,
  sliderFill: { path: 'ui/bag/ref/dlg_slider_fill/spriteFrame', w: 1000, h: 32, inset: [18, 18, 0, 0] } as RefKitItem,
  sliderKnob: 'ui/bag/ref/dlg_slider_knob/spriteFrame',
  resultPanel: { path: 'ui/bag/ref/dlg_result_panel/spriteFrame', w: 1000, h: 146, inset: [48, 48, 0, 0] } as RefKitItem,
  arrow: 'ui/bag/ref/dlg_arrow/spriteFrame',
  icPouch: 'ui/bag/ref/ic_btn_pouch/spriteFrame',
  icPouches: 'ui/bag/ref/ic_btn_pouches/spriteFrame',
};

/** 来源文案 → 圆徽类别(按关键词;先匹配更具体的「爬塔 / 召唤」)。 */
export function refDetailSourceKind(text: string): RefDetailSourceKind {
  const t = text || '';
  if (/爬塔|深渊/.test(t)) return 'tower';
  if (/召唤|抽卡/.test(t)) return 'summon';
  if (/每日|副本|矿脉/.test(t)) return 'daily';
  if (/主线|关卡|首通/.test(t)) return 'main';
  if (/商店|购买|充值|兑换/.test(t)) return 'shop';
  if (/任务|活跃|日常|周常|签到/.test(t)) return 'quest';
  if (/活动|运营|限时|限定/.test(t)) return 'event';
  if (/分解|合成|锻造|强化/.test(t)) return 'forge';
  if (/守卫|晶核/.test(t)) return 'guard';
  return 'other';
}

export const REF_ULT = {
  dialogBg: { path: 'ui/common/ref/ult_dialog_bg/spriteFrame', w: 1284, h: 751 },
  // v3(10-19):GPT 带原比例(暗红宽 / 高 ≈ 原型 6.1)+ 两端棘刺花饰(最外 90 列淡出接框顶线)+ 底中小宝石(取自 ult_frame 底中饰件);
  //   1420×235,暗红本体(含暗角,在花饰下方行量)x 301..1118 / y 57..193;花饰杆心 y ≈ 110,挂上后压在框顶线上
  titleBand: { path: 'ui/common/ref/ult_title_band/spriteFrame', w: 1420, h: 235, inset: [301, 302, 60, 40] } as RefKitItem,
  titleBandCore: { x0: 301, x1: 1118, y0: 57, y1: 193 },
  titleStar: 'ui/common/ref/ult_title_star/spriteFrame',
  // 细双线框(按原型照抄):1600×936,金线外沿 x 12..1589 / y 21..917;整张按弹窗矩形非等比缩(各向差 <3%)
  frame: { path: 'ui/common/ref/ult_frame/spriteFrame', w: 1600, h: 936, line: { left: 12, right: 1589, top: 21, bottom: 917 } },
  statBox: { path: 'ui/common/ref/ult_stat_box/spriteFrame', w: 1360, h: 310, inset: [60, 60, 50, 50] } as RefKitItem,
  costPanel: { path: 'ui/common/ref/ult_cost_panel/spriteFrame', w: 1190, h: 650, inset: [60, 60, 120, 40] } as RefKitItem,
  costRow: { path: 'ui/common/ref/ult_cost_row/spriteFrame', w: 1080, h: 122, inset: [30, 30, 30, 30] } as RefKitItem,
  btnPrimary: { path: 'ui/common/ref/ult_btn_primary/spriteFrame', w: 1344, h: 326, inset: [340, 340, 60, 60] } as RefKitItem,
  btnSecondary: { path: 'ui/common/ref/ult_btn_secondary/spriteFrame', w: 1344, h: 317, inset: [340, 340, 60, 60] } as RefKitItem,
};
export const REF_DETAIL_INNER_BG = { path: 'ui/common/ref/detail_inner_bg/spriteFrame', ratio: 1.95 };

/**
 * 在厚框弹窗内部垫一张实景底图(原型的弹窗不是纯色底):按内缘矩形 cover 裁切(Mask),再压一层半透明暗罩保证可读。
 * innerRect 为弹窗局部坐标(中心 cx/cy,宽高 w/h)。
 */
export function mountRefDialogBackdrop(host: RefKitHost, dialog: Node, bg: { path: string; ratio: number }, cx: number, cy: number, w: number, h: number, veilAlpha = 96, inPlace = false): void {
  const clip = host.addChildPlainNode(dialog, 'InnerBackdrop', cx, cy, w, h);
  const coverW = Math.max(w, h * bg.ratio);
  const art = host.addSprite('Art', bg.path, 0, 0, coverW, coverW / bg.ratio, clip);
  if (!art) {
    clip.destroy();
    return;
  }
  clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
  const veilNode = host.addChildPlainNode(dialog, 'InnerVeil', cx, cy, w, h);
  refSolidFill(host, veilNode, w, h, rgba(6, 4, 6, veilAlpha));
  const veil = { node: veilNode };
  if (inPlace) {
    // 局部透景(如物品详情「用途」正文区):留在调用时的层级,盖在面板之上
    return;
  }
  // 底图 / 暗罩放到框之下(Back 之上)
  clip.setSiblingIndex(1);
  veil.node.setSiblingIndex(2);
}

/**
 * 厚雕花金框弹窗壳:实底 + 厚框(缺图退细金框),返回内缘(局部坐标)供标题带 / 内容排版。
 * 框按九宫格等比缩(k = min(w/1600, h/1000, 1)),大角饰整块留在角里。
 */
export function mountRefOrnateDialog(host: RefKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, scale: number, fill = rgba(10, 9, 12, 244)): { node: Node; innerTop: number; innerBottom: number; innerW: number } {
  const node = host.addChildPlainNode(parent, name, x, y, w, h);
  // 细线框素材 1600×916:金线矩形在 x 46..1553 / y 73..863(外侧线),顶冠伸到 0、底尖到 916。
  // 把「金线矩形」对准弹窗矩形(w×h):k = w / 1507,整张框按 k 放,中心按顶冠 / 底尖不对称量上移;
  // 这样弹窗边 = 金线,内容不会压线;顶冠自然伸出弹窗顶 73k,底尖伸出 53k。
  const LINE = { left: 46, right: 1553, top: 73, bottom: 863 };
  const lineW = LINE.right - LINE.left;
  const lineH = LINE.bottom - LINE.top;
  const k = Math.min(w / lineW, h / lineH);
  const artW = REF_ORNATE_FRAME.w * k;
  const artH = REF_ORNATE_FRAME.h * k;
  // 金线矩形中心在素材里的位置 → 弹窗中心应对准它
  const lineCx = ((LINE.left + LINE.right) / 2 - REF_ORNATE_FRAME.w / 2) * k;
  const lineCy = (REF_ORNATE_FRAME.h / 2 - (LINE.top + LINE.bottom) / 2) * k;
  refSolidFill(host, host.addChildPlainNode(node, 'Back', 0, 0, w, h), w - 4, h - 4, fill, 6 * scale);
  const frameHolder = host.addChildPlainNode(node, 'Frame', -lineCx, -lineCy, artW, artH);
  const sprite = host.addSprite('FrameArt', REF_ORNATE_FRAME.path, 0, 0, artW, artH, frameHolder);
  if (sprite && sprite.spriteFrame) {
    // 九宫格:角饰整块留在角里,直边拉伸;节点按素材像素空间建 + setScale(k)
    const sf = sprite.spriteFrame;
    sf.insetLeft = REF_ORNATE_FRAME.inset[0];
    sf.insetRight = REF_ORNATE_FRAME.inset[1];
    sf.insetTop = REF_ORNATE_FRAME.inset[2];
    sf.insetBottom = REF_ORNATE_FRAME.inset[3];
    sprite.type = Sprite.Type.SLICED;
    sprite.node.getComponent(UITransform)?.setContentSize(new Size(artW / k, artH / k));
    sprite.node.setScale(k, k, 1);
    const lineT = 22 * k; // 金线自身厚度(外线到内线)
    return { node, innerTop: h / 2 - lineT, innerBottom: -h / 2 + lineT, innerW: w - lineT * 2 };
  }
  frameHolder.destroy();
  if (!mountRefSliced(host, node, 'Frame', REF_KIT.cardFrameOpen, 0, 0, w, h)) {
    drawRefPanelFallback(node, w, h, scale, rgba(0, 0, 0, 0));
  }
  const fk = refCardFrameK(w, h);
  return { node, innerTop: h / 2 - REF_CARD_FRAME_LINE.top * fk, innerBottom: -h / 2 + REF_CARD_FRAME_LINE.top * fk, innerW: w - REF_CARD_FRAME_LINE.side * fk * 2 };
}
/** 金边暗行 / 选中亮金行(锻造列表行素材,水晶属性行、法术列表、终极技能弹窗共用)。 */
export const REF_ROW: RefKitItem = { path: 'ui/forge/ref/row_normal/spriteFrame', w: 538, h: 120, inset: [40, 40, 32, 32] };
export const REF_ROW_SELECTED: RefKitItem = { path: 'ui/forge/ref/row_selected/spriteFrame', w: 535, h: 120, inset: [40, 40, 32, 32] };
export const REF_ICON_RING_ASSET = 'ui/common/ref/icon_ring/spriteFrame';
export const REF_SECTION_EMBLEM = { path: 'ui/crystal/ai/section_emblem/spriteFrame', aspect: 121 / 107 };
/** 标题带铺到的位置(素材像素,外侧亮金线所在行):带子垫在镂空边框下面,金线压住带子边缘,不留缝。 */
export const REF_CARD_FRAME_LINE = { top: 6, side: 6 };

/** 把框节点里的边框(Frame)提到最上层:先画的标题带就会被金线 / 角花压住。 */
export function raiseRefFrame(frameHost: Node): void {
  const frame = frameHost.getChildByName('Frame');
  if (frame) {
    frame.setSiblingIndex(frameHost.children.length - 1);
  }
}

/** cardFrame 在给定框尺寸下的九宫格缩放系数(与 mountRefSliced 同算法)。 */
export function refCardFrameK(width: number, height: number): number {
  return Math.min(width / REF_KIT.cardFrame.w, height / REF_KIT.cardFrame.h, 1);
}

function fillRefDiamond(host: RefKitHost, parent: Node, x: number, y: number, r: number, color: Color): void {
  const g = host.addChildPlainNode(parent, 'Diamond', x, y, r * 2, r * 2).addComponent(Graphics);
  g.fillColor = color;
  g.moveTo(0, r);
  g.lineTo(r, 0);
  g.lineTo(0, -r);
  g.lineTo(-r, 0);
  g.close();
  g.fill();
}

/** 分区标题带标准(物品详情分区头带裁出,930×103)与标题前四芒星。 */
export const REF_SECTION_BAND = 'ui/common/ref/section_band/spriteFrame';
export const REF_TITLE_STAR = 'ui/common/ref/ult_title_star/spriteFrame';

/**
 * 标题带(守卫水晶页定的样式,2026-10-16):整条暗红实底 + 左侧提亮渐变 + 底边金线 + 金线两端菱形点。
 * 放在细金框里时,顶边 / 两侧对齐 REF_CARD_FRAME_LINE(带子压在框之上,框内芯不透明)。
 */
export function mountRefHeaderBand(host: RefKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, scale: number): Node {
  const band = host.addChildPlainNode(parent, name, x, y, w, h);
  // 2026-10-20 用户「物品详情的红色标题不错,其他界面也以这个标准调整」:统一用物品详情分区头带同款贴图
  // (上双金线 + 暗红织纹 + 下金线,横向均匀可拉伸);贴图未到货时退回下面的程序带
  if (host.addSprite('Art', REF_SECTION_BAND, 0, 0, w, h, band)) {
    return band;
  }
  const g = band.addComponent(Graphics);
  g.fillColor = rgba(62, 16, 12, 232);
  g.rect(-w / 2, -h / 2, w, h);
  g.fill();
  const steps = 24;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const alpha = Math.round(110 * (1 - t) * (1 - t));
    if (alpha <= 0) {
      continue;
    }
    g.fillColor = rgba(150, 38, 26, alpha);
    g.rect(-w / 2 + (w * i) / steps, -h / 2, w / steps, h);
    g.fill();
  }
  g.strokeColor = rgba(214, 170, 92, 230);
  g.lineWidth = Math.max(1.5, 1.6 * scale);
  g.moveTo(-w / 2, -h / 2);
  g.lineTo(w / 2, -h / 2);
  g.stroke();
  g.strokeColor = rgba(214, 170, 92, 90);
  g.lineWidth = 1;
  g.moveTo(-w / 2, h / 2);
  g.lineTo(w / 2, h / 2);
  g.stroke();
  fillRefDiamond(host, band, -w / 2, -h / 2, 5 * scale, rgba(236, 196, 112));
  fillRefDiamond(host, band, w / 2, -h / 2, 5 * scale, rgba(236, 196, 112));
  return band;
}

/** 九宫格不变形缩放:缺图返回 null(调用方自行兜底)。k 不超过 1(素材不放大,只缩)。 */
export function mountRefSliced(host: RefKitHost, parent: Node, name: string, item: RefKitItem, x: number, y: number, width: number, height: number, maxK = 1): Node | null {
  const k = Math.min(width / item.w, height / item.h, maxK);
  const holder = host.addChildPlainNode(parent, name, x, y, width / k, height / k);
  holder.setScale(k, k, 1);
  const sprite = host.addSprite(`${name}Art`, item.path, 0, 0, width / k, height / k, holder);
  if (!sprite || !sprite.spriteFrame) {
    holder.destroy();
    return null;
  }
  const sf = sprite.spriteFrame;
  sf.insetLeft = item.inset[0];
  sf.insetRight = item.inset[1];
  sf.insetTop = item.inset[2];
  sf.insetBottom = item.inset[3];
  sprite.type = Sprite.Type.SLICED;
  return holder;
}

/**
 * 纯色块(白色 8×8 贴图着色):代替 Graphics 画遮罩 / 分隔线 / 底色。
 * 2026-10-19 安卓原生实测:弹窗里的 Graphics 在同级节点(背包格子的 ScrollView 遮罩等)重建后不再绘制,
 * 遮罩 / 分隔线整块消失(运行时 clear + 重画又能显示);Sprite 不受影响。缺图返回 null(调用方可退回 Graphics)。
 */
export const REF_SOLID_WHITE = 'ui/common/solid_white/spriteFrame';
export function mountRefSolid(host: RefKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, color: Color): Sprite | null {
  const sprite = host.addSprite(name, REF_SOLID_WHITE, x, y, w, h, parent);
  if (sprite) {
    sprite.color = color;
  }
  return sprite;
}

/** 大面积底色 / 暗罩:优先纯色贴图(原生端常驻 Graphics 刷新后会丢,见 mountRefSolid),缺图退回 Graphics(圆角仅兜底时有)。 */
function refSolidFill(host: RefKitHost, node: Node, w: number, h: number, color: Color, radius = 0): void {
  if (mountRefSolid(host, node, 'Fill', 0, 0, w, h, color)) {
    return;
  }
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  if (radius > 0) {
    g.roundRect(-w / 2, -h / 2, w, h, radius);
  } else {
    g.rect(-w / 2, -h / 2, w, h);
  }
  g.fill();
}

/**
 * 细双线金框(REF_ULT.frame):金线外沿矩形 = 给定弹窗矩形(w × h,中心 0,0);横竖各自缩(各向差 <3%,宝石看不出变形),
 * 比九宫格好——边中点的宝石饰件在九宫格里会被拉伸。终极技能弹窗 / 物品详情共用。
 */
export function mountRefLineFrame(host: RefKitHost, parent: Node, name: string, w: number, h: number): Node {
  const FR = REF_ULT.frame;
  const sx = w / (FR.line.right - FR.line.left);
  const sy = h / (FR.line.bottom - FR.line.top);
  const lineCx = ((FR.line.left + FR.line.right) / 2 - FR.w / 2) * sx;
  const lineCy = (FR.h / 2 - (FR.line.top + FR.line.bottom) / 2) * sy;
  const holder = host.addChildPlainNode(parent, name, -lineCx, -lineCy, FR.w, FR.h);
  holder.setScale(sx, sy, 1);
  host.addSprite('Frame', FR.path, 0, 0, FR.w, FR.h, holder);
  return holder;
}

/**
 * 框类九宫格按宽度定比例(k = 宽 / 素材宽,≤ maxK):头带、角饰、金线缩进在不同高度的框里保持同一尺寸,只拉中段。
 * mountRefSliced 取宽高较小的比例,矮框会把整张图(连同头带)一起缩小,头带里的标题就溢出(10-19 终极技能消耗面板 2 行时)。
 * 高度放不下上下切片时退回按高度缩。缺图返回 null。
 */
export function mountRefSlicedByWidth(host: RefKitHost, parent: Node, name: string, item: RefKitItem, x: number, y: number, width: number, height: number, maxK = 1): Node | null {
  let k = Math.min(width / item.w, maxK);
  if (height / k < item.inset[2] + item.inset[3] + 2) {
    k = height / (item.inset[2] + item.inset[3] + 2);
  }
  const holder = host.addChildPlainNode(parent, name, x, y, width / k, height / k);
  holder.setScale(k, k, 1);
  const sprite = host.addSprite(`${name}Art`, item.path, 0, 0, width / k, height / k, holder);
  if (!sprite || !sprite.spriteFrame) {
    holder.destroy();
    return null;
  }
  const sf = sprite.spriteFrame;
  sf.insetLeft = item.inset[0];
  sf.insetRight = item.inset[1];
  sf.insetTop = item.inset[2];
  sf.insetBottom = item.inset[3];
  sprite.type = Sprite.Type.SLICED;
  return holder;
}

/**
 * 横条类九宫格(按钮底 / 说明长条):缩放系数按高度定(k = h / 素材高,≤ maxK),两端饰件横竖同比、不被拉长;
 * 宽度不够放下两端时退回按宽度缩。缺图返回 null。
 */
export function mountRefPlate(host: RefKitHost, parent: Node, name: string, item: RefKitItem, x: number, y: number, width: number, height: number, maxK = 1): Node | null {
  let k = Math.min(height / item.h, maxK);
  if (width / k < item.inset[0] + item.inset[1] + 2) {
    k = width / (item.inset[0] + item.inset[1] + 2);
  }
  const holder = host.addChildPlainNode(parent, name, x, y, width / k, height / k);
  holder.setScale(k, k, 1);
  const sprite = host.addSprite(`${name}Art`, item.path, 0, 0, width / k, height / k, holder);
  if (!sprite || !sprite.spriteFrame) {
    holder.destroy();
    return null;
  }
  const sf = sprite.spriteFrame;
  sf.insetLeft = item.inset[0];
  sf.insetRight = item.inset[1];
  sf.insetTop = item.inset[2];
  sf.insetBottom = item.inset[3];
  sprite.type = Sprite.Type.SLICED;
  return holder;
}

/** 面板 / 卡框兜底(缺图):深色底 + 细金描边。 */
export function drawRefPanelFallback(node: Node, width: number, height: number, u: number, fill = rgba(14, 11, 10, 235)): void {
  const g = node.addComponent(Graphics);
  g.fillColor = fill;
  g.roundRect(-width / 2, -height / 2, width, height, 8 * u);
  g.fill();
  g.strokeColor = rgba(196, 150, 76, 220);
  g.lineWidth = Math.max(1, 1.4 * u);
  g.roundRect(-width / 2, -height / 2, width, height, 8 * u);
  g.stroke();
}

/**
 * 标题带面板(2026-10-17 界面统一:锻造分解 / 宝石、背包、任务、邮件共用):实底 + 镂空细金框 + 暗红标题带(徽记 + 标题)。
 * 返回面板节点与标题带下沿 bodyTop(面板局部坐标);title 为空时不画带子,bodyTop 为框内顶。
 */
export function mountRefTitledPanel(
  host: RefKitHost,
  parent: Node,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
  title: string,
  options: { bandH?: number; fontSize?: number; center?: boolean; fill?: Color } = {},
): { node: Node; bodyTop: number; bandY: number } {
  const node = host.addChildPlainNode(parent, name, x, y, w, h);
  refSolidFill(host, host.addChildPlainNode(node, 'Back', 0, 0, w, h), w - 8, h - 8, options.fill ?? rgba(10, 8, 8, 226), 8 * scale);
  if (!mountRefSliced(host, node, 'Frame', REF_KIT.cardFrameOpen, 0, 0, w, h)) {
    drawRefPanelFallback(node, w, h, scale, rgba(0, 0, 0, 0));
  }
  const fk = refCardFrameK(w, h);
  const innerTop = h / 2 - REF_CARD_FRAME_LINE.top * fk;
  if (!title) {
    raiseRefFrame(node);
    return { node, bodyTop: innerTop, bandY: innerTop };
  }
  const bandH = options.bandH ?? 50 * scale;
  const bandY = innerTop - bandH / 2;
  mountRefHeaderBand(host, node, 'Band', 0, bandY, w - REF_CARD_FRAME_LINE.side * fk * 2, bandH, scale);
  raiseRefFrame(node);
  const fontSize = options.fontSize ?? 24 * scale;
  // 标题前徽记:同物品详情分区头的大四芒星(约 1 倍带高,上下略出带);缺图退回旧小徽记
  const starSize = bandH * 1.05;
  const emblemH = starSize;
  const emblemW = starSize;
  const textW = Math.max(fontSize, Math.min(w - emblemW - 60 * scale, title.length * fontSize * 1.05));
  const gap = 10 * scale;
  const emblemX = options.center === false ? -w / 2 + 22 * scale + emblemW / 2 : -(emblemW + gap + textW) / 2 + emblemW / 2;
  if (!host.addSprite(`${name}Emblem`, REF_TITLE_STAR, emblemX, bandY, emblemW, emblemH, node)) {
    host.addSprite(`${name}Emblem`, REF_SECTION_EMBLEM.path, emblemX, bandY, bandH * 0.6 / REF_SECTION_EMBLEM.aspect, bandH * 0.6, node);
  }
  const label = host.addChildLabel(node, `${name}Title`, title, emblemX + emblemW / 2 + gap + textW / 2, bandY, fontSize, rgba(255, 222, 140), new Size(textW + 8 * scale, bandH - 8 * scale));
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = true;
  label.enableOutline = true;
  label.outlineColor = rgba(0, 0, 0, 226);
  label.outlineWidth = Math.max(1, 1.4 * scale);
  return { node, bodyTop: bandY - bandH / 2, bandY };
}

/** 金框勾选框(暗底 + 金描边,勾选时亮金底 + 勾)。 */
export function drawRefCheckbox(host: RefKitHost, parent: Node, name: string, x: number, y: number, size: number, on: boolean, scale: number): Node {
  const node = host.addChildPlainNode(parent, name, x, y, size, size);
  const g = node.addComponent(Graphics);
  const r = 4 * scale;
  g.fillColor = on ? rgba(92, 64, 22, 245) : rgba(12, 10, 9, 235);
  g.roundRect(-size / 2, -size / 2, size, size, r);
  g.fill();
  g.strokeColor = on ? rgba(255, 214, 120, 250) : rgba(196, 156, 88, 220);
  g.lineWidth = Math.max(1.5, 1.8 * scale);
  g.roundRect(-size / 2, -size / 2, size, size, r);
  g.stroke();
  if (on) {
    g.strokeColor = rgba(255, 236, 170, 255);
    g.lineWidth = Math.max(2, 3 * scale);
    g.moveTo(-size * 0.28, 0);
    g.lineTo(-size * 0.06, -size * 0.24);
    g.lineTo(size * 0.3, size * 0.24);
    g.stroke();
  }
  return node;
}

/** 原型的矩形钮(一键放入 / 一键全选 / 清空 / 镶嵌):dark = 暗金底,bronze = 古铜金实心;不可用时半透明、不接点击。 */
export function mountRefPlateButton(
  host: RefKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  u: number,
  kind: 'dark' | 'bronze',
  enabled: boolean,
  onClick?: () => void,
  options: { fontSize?: number } = {},
): Node {
  const button = host.addChildPlainNode(parent, name, x, y, width, height);
  if (!mountRefPlate(host, button, 'Art', kind === 'bronze' ? REF_PLATE_BRONZE : REF_PLATE_DARK, 0, 0, width, height)) {
    drawRefPanelFallback(button, width, height, u, kind === 'bronze' ? rgba(112, 74, 32, 240) : rgba(18, 15, 14, 230));
  }
  if (!enabled) {
    (button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity)).opacity = 140;
  }
  const label = host.addChildLabel(button, 'Label', text, 0, 0, options.fontSize ?? 20 * u, !enabled ? rgba(218, 210, 194) : kind === 'bronze' ? rgba(255, 242, 214) : rgba(246, 230, 196), new Size(width * 0.84, height * 0.7));
  label.overflow = Label.Overflow.SHRINK;
  fitButtonLabel(label, height);
  label.isBold = kind === 'bronze';
  label.enableOutline = true;
  label.outlineColor = rgba(0, 0, 0, 226);
  label.outlineWidth = Math.max(1, 1.4 * u);
  if (enabled && onClick) {
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onClick);
    host.applyImageButtonFeedback(button, 1.03, 0.97);
  }
  return button;
}

/** primaryDisabled:红金主钮底压暗(原型里不可用的「合成 / 分解」仍是红钮,只是发暗)。 */
export type RefButtonKind = 'primary' | 'secondary' | 'disabled' | 'primaryDisabled';

/** 原型套件按钮:红金主钮 / 暗金副钮 / 灰态(副钮底 + 半透明);文字框收到中间 70%(两端尖饰);可带左侧图标。 */
export function mountRefButton(
  host: RefKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  u: number,
  kind: RefButtonKind,
  onClick?: () => void,
  options: { fontSize?: number; iconPath?: string; iconSize?: number } = {},
): Node {
  const button = host.addChildPlainNode(parent, name, x, y, width, height);
  const red = kind === 'primary' || kind === 'primaryDisabled';
  const item = red ? REF_KIT.btnPrimary : REF_KIT.btnSecondary;
  if (!mountRefSliced(host, button, 'Art', item, 0, 0, width, height)) {
    drawRefPanelFallback(button, width, height, u, red ? rgba(120, 22, 18, 238) : rgba(18, 15, 14, 230));
  }
  if (kind === 'disabled') {
    (button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity)).opacity = 150;
  } else if (kind === 'primaryDisabled') {
    button.getChildByName('Art')?.walk((child) => {
      const sprite = child.getComponent(Sprite);
      if (sprite) {
        sprite.color = rgba(150, 120, 116, 255);
      }
    });
  }
  const fontSize = options.fontSize ?? 26 * u;
  let labelX = 0;
  if (options.iconPath) {
    const iconSize = options.iconSize ?? height * 0.56;
    const icon = host.addSprite(`${name}Icon`, options.iconPath, -width * 0.22, 0, iconSize, iconSize, button);
    if (icon) {
      labelX = width * 0.07;
    }
  }
  const label = host.addChildLabel(button, 'Label', text, labelX, 0, fontSize, kind === 'disabled' || kind === 'primaryDisabled' ? rgba(223, 212, 196) : rgba(255, 238, 206), new Size(width * (labelX ? 0.5 : 0.7), height * 0.72));
  // 单行钮字:行高 = 字号(默认字号 + 8 会超出文字框,被 SHRINK 整体压小);上下留空
  fitButtonLabel(label, height);
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = kind === 'primary';
  label.enableOutline = true;
  label.outlineColor = rgba(0, 0, 0, 226);
  label.outlineWidth = Math.max(1, 1.4 * u);
  if (onClick) {
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onClick);
    host.applyImageButtonFeedback(button, 1.03, 0.97);
  }
  return button;
}
