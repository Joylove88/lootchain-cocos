import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  ScrollView,
  Size,
  Sprite,
  SpriteFrame,
  UITransform,
  VerticalTextAlignment,
  Vec3,
  resources,
} from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { mountKitLoading } from '../UiKit';
import { mountRefHeaderBand, mountRefPlate, mountRefSliced, raiseRefFrame, REF_CARD_FRAME_LINE, REF_INFO_BANNER, REF_KIT, REF_SECTION_EMBLEM, refCardFrameK, type RefKitItem } from '../UiRefKit';
import { fitButtonLabel } from '../UiPrimitiveFactory';
import { townProtoFrame } from './LobbyTownHudProto';

/** 服务端邮件列表上限(PlayerMailServiceImpl.MAX_LIST 50),收件箱头「N / 50」用。 */
const MAIL_LIST_MAX = 50;

/** 邮箱 1:1 素材:全部从原型 proto_mail_v1 裁出(tools/qa/mail_proto_extract.py),九宫格 inset 按素材像素。 */
const MAIL_DIR = 'ui/town/mail';
const MAIL_KIT = {
  panel: { path: `${MAIL_DIR}/panel/spriteFrame`, w: 993, h: 654, inset: [60, 60, 60, 60] } as RefKitItem,
  btnPrimary: { path: `${MAIL_DIR}/btn_primary/spriteFrame`, w: 296, h: 82, inset: [36, 36, 0, 0] } as RefKitItem,
  btnSecondary: { path: `${MAIL_DIR}/btn_secondary/spriteFrame`, w: 266, h: 82, inset: [36, 36, 0, 0] } as RefKitItem,
  rowSelected: { path: `${MAIL_DIR}/row_selected/spriteFrame`, w: 616, h: 121, inset: [40, 40, 30, 30] } as RefKitItem,
  rowNormal: { path: `${MAIL_DIR}/row_normal/spriteFrame`, w: 616, h: 121, inset: [40, 40, 30, 30] } as RefKitItem,
  pill: { path: `${MAIL_DIR}/pill/spriteFrame`, w: 139, h: 44, inset: [20, 20, 0, 0] } as RefKitItem,
  tag: { path: `${MAIL_DIR}/tag/spriteFrame`, w: 80, h: 41, inset: [16, 16, 0, 0] } as RefKitItem,
  slot: { path: `${MAIL_DIR}/slot/spriteFrame`, w: 154, h: 154, inset: [30, 30, 30, 30] } as RefKitItem,
  envelope: `${MAIL_DIR}/envelope/spriteFrame`,
  envelopeRead: `${MAIL_DIR}/envelope_read/spriteFrame`,
  divider: `${MAIL_DIR}/divider/spriteFrame`,
  attachLine: `${MAIL_DIR}/attach_line/spriteFrame`,
  close: `${MAIL_DIR}/close/spriteFrame`,
};
const MAIL_KIT_PATHS = [MAIL_KIT.panel.path, MAIL_KIT.btnPrimary.path, MAIL_KIT.btnSecondary.path, MAIL_KIT.rowSelected.path, MAIL_KIT.rowNormal.path, MAIL_KIT.pill.path, MAIL_KIT.tag.path, MAIL_KIT.slot.path,
  MAIL_KIT.envelope, MAIL_KIT.envelopeRead, MAIL_KIT.divider, MAIL_KIT.attachLine, MAIL_KIT.close];

/** 邮件时间:今天 → 「今天 20:14」,昨天 → 「昨天」,其余 → 「10-20」;full = 「2026-10-28 20:14」。 */
function formatMailTime(iso: string | null, relative: boolean): string {
  if (!iso) {
    return '';
  }
  const t = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) {
    return iso;
  }
  const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  const full = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  if (!relative) {
    return full;
  }
  const now = new Date();
  const day = (x: Date): number => Math.floor((x.getTime() - x.getTimezoneOffset() * 60000) / 86400000);
  const diff = day(now) - day(t);
  if (diff <= 0) {
    return `今天 ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  }
  if (diff === 1) {
    return '昨天';
  }
  return `${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { addPhoneDialogTitle, PHONE_DIALOG_CONTENT_PAD, drawPhoneDialogFrame, resolvePhoneDialogSize } from './LobbyPhoneDialogFrame';
import type { PlayerMailVO, PlayerQuestSummaryVO, PlayerQuestVO, QuestRewardItemVO } from '../../types/QuestTypes';

// 任务弹框素材(2026-09-10 用户切图,原名已 ascii 化):全部一体构图只能等比显示。
const QUEST_UI_ASSETS = {
  /** 恶魔犄角哥特大弹框 1536×1024(空内容、四角透明,整图等比)。 */
  panelFrame: 'ui/mission/ai/panel_frame/spriteFrame',
  /** 页签选中态 673×205(红大理石+金框)/未选态 621×162(暗石纹)。 */
  tabActive: 'ui/mission/ai/tab_active/spriteFrame',
  tabNormal: 'ui/mission/ai/tab_normal/spriteFrame',
  /** 领取钮 571×203(红底金框)/暗态钮 393×142(黑牌)。 */
  btnClaim: 'ui/mission/ai/btn_claim/spriteFrame',
  btnDisabled: 'ui/mission/ai/btn_disabled/spriteFrame',
  /** 进度条:空框 603×86 + 满格绿填充 604×89(FILLED 水平裁剪做进度)。 */
  progressFrame: 'ui/mission/ai/progress_frame/spriteFrame',
  progressFilled: 'ui/mission/ai/progress_filled/spriteFrame',
  close: 'ui/common/ai/button_close/spriteFrame',
  dividerLeft: 'ui/common/ai/footer_divider_left/spriteFrame',
  dividerRight: 'ui/common/ai/footer_divider_right/spriteFrame',
  titleDividerLeft: 'ui/common/ai/title_divider_left/spriteFrame',
  titleDividerRight: 'ui/common/ai/title_divider_right/spriteFrame',
  /** 手机全屏行底 795×127(两端尖饰、中段平直;与资料页同款用法:横向九宫格 + 整体等比缩到行高)。 */
  rowBg: 'ui/profile/ai/row_bg/spriteFrame',
  /** 图标槽:金边方框(锻造参考套件 slot_frame 192×192,2026-10-17 按原型换掉暗色 bag_slot)。 */
  iconSlot: 'ui/forge/ref/slot_frame/spriteFrame',
  /** 金环信封徽章(2026-10-17 按原型逐件出,行首图标与空白处水印共用)。 */
  mailIcon: 'ui/common/ref/mail_emblem/spriteFrame',
};
/**
 * 行底九宫格 inset(bt2_quest_refine:按裁边后的 rect 780×115 计,原图 x 7..787)。
 * 原图上沿外线在 x≈345..422 有一小段偏亮,旧 inset 150 把它一起拉长成半行宽的亮带、中途突然断掉(看着像接缝);
 * 改成只拉 x≈490..610 这段亮度均匀的直边。inset 设在克隆出来的 SpriteFrame 上,不动资料页共用的那张。
 */
const ROW_BG_INSET_LEFT = 483;
const ROW_BG_INSET_RIGHT = 177;
const PHONE_HEADER_H = 74;
/** 首开等素材的最长时间:超过就照常画(缺图走手绘兜底),不让慢网一直停在加载态。 */
const ART_GATE_WINDOW_MS = 8000;

/** 任务类型图标:按任务名/描述关键词匹配(ratio=宽/高,等比显示)。 */
const QUEST_ICON_RULES: Array<{ match: RegExp; path: string; ratio: number }> = [
  { match: /登录|签到/, path: 'ui/common/ai/ic_quest_login/spriteFrame', ratio: 192 / 225 },
  { match: /爬塔|主线/, path: 'ui/common/ai/ic_quest_tower/spriteFrame', ratio: 292 / 318 },
  { match: /副本/, path: 'ui/common/ai/ic_quest_dungeon/spriteFrame', ratio: 238 / 271 },
  { match: /召唤|抽卡/, path: 'ui/common/ai/ic_quest_summon/spriteFrame', ratio: 249 / 274 },
  { match: /锻造|强化|洗练/, path: 'ui/common/ai/ic_quest_forge/spriteFrame', ratio: 258 / 264 },
];

/** 奖励图标:按资源名匹配(金币按数额分大小堆)。 */
function resolveRewardIcon(item: QuestRewardItemVO): { path: string; ratio: number } | null {
  const name = item.name ?? '';
  if (name.includes('金币')) {
    return item.amount >= 1500
      ? { path: 'ui/common/ai/ic_gold_large/spriteFrame', ratio: 184 / 171 }
      : { path: 'ui/common/ai/ic_gold_medium/spriteFrame', ratio: 176 / 153 };
  }
  if (name.includes('经验书')) {
    return { path: 'ui/common/ai/ic_exp_book/spriteFrame', ratio: 193 / 154 };
  }
  if (name.includes('强化石')) {
    return { path: 'ui/common/ai/ic_enhance_gem/spriteFrame', ratio: 131 / 196 };
  }
  if (name.includes('钻石')) {
    return { path: 'ui/common/ai/ic_diamond_gem/spriteFrame', ratio: 97 / 95 };
  }
  return null;
}

/** 行内奖励图标全集(预热用)。 */
const REWARD_ICON_PATHS = ['ic_gold_large', 'ic_gold_medium', 'ic_exp_book', 'ic_enhance_gem', 'ic_diamond_gem'].map((name) => `ui/common/ai/${name}/spriteFrame`);

export interface LobbyQuestMailHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  closeLobbyQuestPanel(): void;
  closeLobbyMailPanel(): void;
  claimLobbyQuest(questCode: string): void;
  setLobbyQuestTab(tab: 'DAILY' | 'ACHIEVE'): void;
  claimLobbyMail(mailId: number): void;
  claimAllLobbyMails(): void;
  /** 邮箱重做(2026-10-28):选中 / 删除 */
  selectLobbyMail(mailId: number): void;
  currentLobbyMailSelectedId(): number | null;
  deleteLobbyMail(mailId: number): void;
  deleteReadLobbyMails(): void;
  currentLobbyQuestState(): { loading: boolean; error: string; summary: PlayerQuestSummaryVO | null; tab: 'DAILY' | 'ACHIEVE'; claiming: string | null };
  currentLobbyMailState(): { loading: boolean; error: string; mails: PlayerMailVO[]; claiming: number | null };
}

/**
 * 任务/成就 + 邮件面板(P1,2026-09-04,docs/14/15):遮罩弹层样式(同设置页),
 * 任务=日常/成就双页签行列表(进度条+奖励+领取钮),邮件=列表+单封领取+一键领取。
 */
export class LobbyQuestMailPanelRenderer {
  constructor(private readonly host: LobbyQuestMailHost) {
    // 任务 / 邮件素材不在任何首开预载组里:启动后空闲时先拉进 bundle 缓存(UiSpriteFrameCache.resolve 会同步取用),
    // 玩家第一次点开就是成品样子,不再先闪一下手绘兜底(bt2_quest_refine,2026-10-04 审图意见)。
    setTimeout(() => this.prewarmArt(), 2500);
  }

  private prewarmed = false;

  private prewarmArt(): void {
    if (this.prewarmed) {
      return;
    }
    this.prewarmed = true;
    const phone = isPhoneDesign();
    const paths = Object.values(QUEST_UI_ASSETS)
      // 恶魔大框只有电脑用;行底 / 图标槽 / 信封只有手机用
      .filter((path) => (phone ? path !== QUEST_UI_ASSETS.panelFrame : path !== QUEST_UI_ASSETS.rowBg && path !== QUEST_UI_ASSETS.iconSlot && path !== QUEST_UI_ASSETS.mailIcon))
      .concat(QUEST_ICON_RULES.map((rule) => rule.path), REWARD_ICON_PATHS);
    paths.forEach((path) => {
      if (!resources.get(path, SpriteFrame)) {
        resources.load(path, SpriteFrame, () => undefined);
      }
    });
  }

  private artGateStartedAt = 0;
  private artGateTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 首开素材闸门:paths 里还有没到的图 → 返回 true(调用方先画「读取中」而不是手绘兜底行)。
   * 没到的图经 host.addSprite 触发加载,到货后精灵缓存会整刷当前视图,自然重进这里;
   * 超过 ART_GATE_WINDOW_MS(慢网 / 缺图)放行,并由 onTimeout 补一次重绘。
   */
  private artPending(paths: readonly string[], onTimeout: () => void): boolean {
    const missing = paths.filter((path) => !resources.get(path, SpriteFrame));
    if (missing.length === 0) {
      this.artGateStartedAt = 0;
      return false;
    }
    const now = Date.now();
    if (this.artGateStartedAt === 0) {
      this.artGateStartedAt = now;
    }
    if (now - this.artGateStartedAt >= ART_GATE_WINDOW_MS) {
      return false;
    }
    const probe = new Node('ArtProbe');
    missing.forEach((path) => this.host.addSprite('Probe', path, 0, 0, 1, 1, probe));
    probe.destroy();
    if (this.artGateTimer === null) {
      this.artGateTimer = setTimeout(() => {
        this.artGateTimer = null;
        onTimeout();
      }, ART_GATE_WINDOW_MS - (now - this.artGateStartedAt) + 60);
    }
    return true;
  }

  private questArtPaths(quests: readonly PlayerQuestVO[]): string[] {
    const paths = [
      QUEST_UI_ASSETS.tabActive, QUEST_UI_ASSETS.tabNormal, QUEST_UI_ASSETS.btnClaim, QUEST_UI_ASSETS.btnDisabled,
      QUEST_UI_ASSETS.progressFrame, QUEST_UI_ASSETS.progressFilled, QUEST_UI_ASSETS.close,
    ];
    quests.forEach((quest) => {
      const rule = QUEST_ICON_RULES.find((item) => item.match.test(`${quest.questName}${quest.questDesc ?? ''}`));
      if (rule) {
        paths.push(rule.path);
      }
      quest.rewards.slice(0, 2).forEach((item) => {
        const icon = resolveRewardIcon(item);
        if (icon) {
          paths.push(icon.path);
        }
      });
    });
    return paths;
  }

  private lastQuestGroup: Node | null = null;
  private lastMailNodes: Node[] = [];

  // ── 任务面板(2026-09-10 参考图素材化改版:恶魔犄角哥特弹框,叠在活的大厅之上) ──
  renderQuestPanel(layout: UiLayout): void {
    if (isPhoneDesign()) {
      this.renderQuestPanelPhone(layout);
      return;
    }
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    // 弹框按素材可见框等比锚高(画布 1536×1024 带大片透明光晕:实体框只占 y 0.048~0.828、
    // 宽约 0.96,画布按比例放大并偏移使框心对齐面板原点),窄屏再按宽钳一道。
    const frameAspect = 1536 / 1024;
    const ART_TOP = 0.048;
    const ART_BOTTOM = 0.828;
    const ART_SIDE = 0.96;
    const artHeightFrac = ART_BOTTOM - ART_TOP;
    // 2026-09-10 用户反馈:弹框高度 +20%(640→768)。
    // 2026-10-02 用户「横屏模式下弹框都调整成全屏」:手机铺满舞台;恶魔框是一体构图(3:2)不能拉宽,手机改程序画框。
    const phone = isPhoneDesign();
    let panelHeight = Math.min(layout.stageHeight - 28 * scale, 768 * scale);
    let panelWidth = (panelHeight / artHeightFrac) * frameAspect * ART_SIDE;
    if (panelWidth > layout.stageWidth - 36 * scale) {
      panelWidth = layout.stageWidth - 36 * scale;
      panelHeight = (panelWidth / ART_SIDE / frameAspect) * artHeightFrac;
    }
    if (phone) {
      const size = resolvePhoneDialogSize(layout);
      panelWidth = size.width;
      panelHeight = size.height;
    }
    const state = this.host.currentLobbyQuestState();

    // 遮罩加深(2026-09-10 用户反馈:弹框后大厅要更暗,分清主次)。
    this.mountDim('LobbyQuestDim', centerX, centerY, layout, () => this.host.closeLobbyQuestPanel(), 200);
    const group = this.host.createUiNode('LobbyQuestSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelWidth, panelHeight);
    const artHeight = panelHeight / artHeightFrac;
    const artWidth = artHeight * frameAspect;
    const artYOffset = ((ART_TOP + ART_BOTTOM) / 2 - 0.5) * artHeight;
    if (phone) {
      drawPhoneDialogFrame(this.host, panel, panelWidth, panelHeight, 74);
    } else if (!this.host.addSprite('FrameArt', QUEST_UI_ASSETS.panelFrame, 0, artYOffset, artWidth, artHeight, panel)) {
      const g = panel.addComponent(Graphics);
      g.fillColor = rgba(7, 7, 10, 240);
      g.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18 * scale);
      g.fill();
      g.strokeColor = rgba(192, 145, 66, 226);
      g.lineWidth = Math.max(1, 1.6 * scale);
      g.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18 * scale);
      g.stroke();
    }

    // 标题+两侧星饰线(以下 Y 均以可见框为基准;2026-09-10 用户反馈:参考图鎏金大字+下移 30px,
    // 饰线换 title_divider 长款)。
    const titleY = phone ? panelHeight / 2 - 42 : panelHeight * 0.375 - 30 * scale;
    const title = this.host.addChildLabel(panel, 'Title', '任务', 0, titleY, phone ? 34 : 38 * scale, rgba(245, 213, 130, 255), new Size(panelWidth * 0.4, 50 * scale));
    title.isBold = true;
    title.enableOutline = true;
    title.outlineColor = rgba(58, 32, 10, 255);
    title.outlineWidth = Math.max(2, 3 * scale);
    const dividerW = 118 * scale;
    const dividerGap = 58 * scale + dividerW / 2;
    this.host.addSprite('TitleDividerL', QUEST_UI_ASSETS.titleDividerLeft, -dividerGap, titleY, dividerW, dividerW * (76 / 390), panel);
    this.host.addSprite('TitleDividerR', QUEST_UI_ASSETS.titleDividerRight, dividerGap, titleY, dividerW, dividerW * (73 / 392), panel);
    if (phone) {
      this.addAssetCloseButton(panel, panelWidth / 2 - 46, panelHeight / 2 - 42, 52 / 46, () => this.host.closeLobbyQuestPanel());
    } else {
      this.addAssetCloseButton(panel, panelWidth * 0.43, panelHeight * 0.39, scale, () => this.host.closeLobbyQuestPanel());
    }

    // 页签(素材:选中=红大理石金框,未选=暗石纹;缺图退手绘;2026-09-10 用户反馈:间隔缩小)。
    const tabW = 186 * scale;
    const tabY = phone ? panelHeight / 2 - 118 : panelHeight * 0.25;
    this.addQuestTabButton(panel, '日常任务', state.tab === 'DAILY', -tabW / 2 - 6 * scale, tabY, tabW, scale, () => this.host.setLobbyQuestTab('DAILY'));
    this.addQuestTabButton(panel, '成就', state.tab === 'ACHIEVE', tabW / 2 + 6 * scale, tabY, tabW, scale, () => this.host.setLobbyQuestTab('ACHIEVE'));

    // 底部标语+饰线(2026-09-10 用户反馈:上移 20px,饰线拉长)。
    const footerY = phone ? -panelHeight / 2 + 26 : -panelHeight * 0.415 + 20 * scale;
    const footer = this.host.addChildLabel(panel, 'FooterMotto', '于黑暗中前行 · 以意志铸就荣耀', 0, footerY, 14 * scale, rgba(215, 205, 186, 240), new Size(panelWidth * 0.5, phone ? 26 : 20 * scale));
    footer.overflow = Label.Overflow.SHRINK;
    const footDivW = 132 * scale;
    const footDivGap = 122 * scale + footDivW / 2;
    this.host.addSprite('FooterDividerL', QUEST_UI_ASSETS.dividerLeft, -footDivGap, footerY, footDivW, footDivW * (71 / 224), panel);
    this.host.addSprite('FooterDividerR', QUEST_UI_ASSETS.dividerRight, footDivGap, footerY, footDivW, footDivW * (71 / 224), panel);

    if (state.loading && !state.summary) {
      mountKitLoading(this.host, panel, 0, 0, scale, '任务读取中…');
      return;
    }
    if (state.error && !state.summary) {
      this.centerHint(panel, `读取失败:${state.error}`, rgba(255, 150, 130, 235), scale);
      return;
    }
    const quests = state.tab === 'DAILY' ? state.summary?.daily ?? [] : state.summary?.achievements ?? [];
    if (quests.length === 0) {
      this.centerHint(panel, '暂无任务', rgba(196, 182, 152, 220), scale);
      return;
    }
    this.lastQuestGroup = group;
    if (this.artPending(this.questArtPaths(quests), () => this.rerenderQuestIfOpen())) {
      mountKitLoading(this.host, panel, 0, 0, scale, '任务读取中…');
      return;
    }
    // 行列表:外包大框(2026-09-10 用户反馈:参考图层次感,行整体缩进)+Mask+ScrollView 单列滚动。
    const listTop = tabY - (phone ? 42 : 40 * scale);
    const listBottom = footerY + 26 * scale;
    const listHeight = Math.max(80 * scale, listTop - listBottom);
    const outerW = phone ? panelWidth - PHONE_DIALOG_CONTENT_PAD * 2 : panelWidth * 0.9;
    const listFrame = this.host.addChildPlainNode(panel, 'QuestListFrame', 0, listBottom + listHeight / 2, outerW, listHeight + 18 * scale);
    const lf = listFrame.addComponent(Graphics);
    lf.fillColor = rgba(9, 8, 10, 150);
    lf.roundRect(-outerW / 2, -(listHeight + 18 * scale) / 2, outerW, listHeight + 18 * scale, 8 * scale);
    lf.fill();
    lf.strokeColor = rgba(152, 118, 68, 170);
    lf.lineWidth = Math.max(1, 1.3 * scale);
    lf.roundRect(-outerW / 2, -(listHeight + 18 * scale) / 2, outerW, listHeight + 18 * scale, 8 * scale);
    lf.stroke();
    const rowW = phone ? outerW - 28 : panelWidth * 0.82;
    // 手机全屏:行加高放大字(见 addQuestRow 的 fs)
    const rowH = (phone ? 96 : 88) * scale;
    const listNode = this.host.addChildPlainNode(panel, 'QuestList', 0, listBottom + listHeight / 2, rowW + 12 * scale, listHeight);
    listNode.addComponent(Mask);
    const contentHeight = Math.max(listHeight, quests.length * rowH);
    const contentNode = this.host.addChildPlainNode(listNode, 'QuestListContent', 0, 0, rowW + 12 * scale, contentHeight);
    contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    contentNode.setPosition(0, listHeight / 2, 0);
    const scroll = listNode.addComponent(ScrollView);
    scroll.content = contentNode;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    quests.forEach((quest, index) => {
      this.addQuestRow(contentNode, quest, 0, -rowH / 2 - index * rowH, rowW, rowH - 10 * scale, scale, state.claiming, phone);
    });
  }

  // ── 手机横屏全屏任务(2026-10-04 用户「这几个界面需要美化」:bt_quest_phone_v1;同日审图后精修 bt2_quest_refine) ──
  // 结构:标题带 → 页签条(页签左贴列表框上沿 + 右侧完成度)→ 列表框(素材行底)→ 底部标语。
  private renderQuestPanelPhone(layout: UiLayout): void {
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const { width: panelWidth, height: panelHeight } = resolvePhoneDialogSize(layout);
    const state = this.host.currentLobbyQuestState();

    this.mountDim('LobbyQuestDim', centerX, centerY, layout, () => this.host.closeLobbyQuestPanel(), 200);
    const group = this.host.createUiNode('LobbyQuestSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    this.lastQuestGroup = group;
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelWidth, panelHeight);
    drawPhoneDialogFrame(this.host, panel, panelWidth, panelHeight, PHONE_HEADER_H, { bare: true, coverW: layout.width + Math.abs(centerX) * 2, coverH: layout.height + Math.abs(centerY) * 2 });
    this.addPhoneHeader(panel, '任务', panelWidth, panelHeight, () => this.host.closeLobbyQuestPanel());

    const outerW = panelWidth - PHONE_DIALOG_CONTENT_PAD * 2;
    const headerBottom = panelHeight / 2 - 6 - PHONE_HEADER_H;
    // 页签:坐在列表框上沿(选中态高 58,底边压住上沿金线),不再悬空居中
    const tabW = 190;
    const listTop = headerBottom - 70;
    const tabY = listTop + 29;
    const tabX0 = -outerW / 2 + 18 + tabW / 2;
    const quests = state.tab === 'DAILY' ? state.summary?.daily ?? [] : state.summary?.achievements ?? [];
    const footerY = -panelHeight / 2 + 30;
    const listBottom = footerY + 24;
    const listHeight = listTop - listBottom;
    const hintY = listBottom + listHeight / 2;
    this.drawPhoneListWell(panel, 'QuestListFrame', 0, listBottom + listHeight / 2, outerW, listHeight);
    // 首开素材闸门:页签 / 行底 / 按钮 / 图标没到齐时只画框 +「读取中」,到齐后整面一次出现(不先闪手绘兜底)
    const artPaths = this.questArtPaths(quests).concat([
      QUEST_UI_ASSETS.rowBg, QUEST_UI_ASSETS.iconSlot, QUEST_UI_ASSETS.titleDividerLeft, QUEST_UI_ASSETS.titleDividerRight,
      QUEST_UI_ASSETS.dividerLeft, QUEST_UI_ASSETS.dividerRight,
    ]);
    if (this.artPending(artPaths, () => this.rerenderQuestIfOpen())) {
      mountKitLoading(this.host, panel, 0, hintY, 1.2, '任务读取中…');
      return;
    }
    this.addQuestTabButton(panel, '日常任务', state.tab === 'DAILY', tabX0, tabY, tabW, 1, () => this.host.setLobbyQuestTab('DAILY'));
    this.addQuestTabButton(panel, '成就', state.tab === 'ACHIEVE', tabX0 + tabW + 8, tabY, tabW, 1, () => this.host.setLobbyQuestTab('ACHIEVE'));
    this.addPhoneFooterMotto(panel, footerY, panelWidth);

    // 右侧完成度(列表数据里数出来的,不调接口)
    if (quests.length > 0) {
      const done = quests.filter((quest) => quest.claimed || quest.claimable).length;
      const ready = quests.filter((quest) => quest.claimable && !quest.claimed).length;
      const rightX = outerW / 2 - 20;
      const doneLabel = this.host.addChildLabel(panel, 'QuestDoneCount', `${state.tab === 'DAILY' ? '今日完成' : '已达成'} ${done}/${quests.length}`, rightX, tabY - 2, 20, rgba(225, 215, 192, 240), new Size(190, 30), HorizontalTextAlignment.RIGHT);
      doneLabel.overflow = Label.Overflow.SHRINK;
      if (ready > 0) {
        // 紧跟在完成度文字左侧(按字数估宽:汉字 20、数字 / 符号约 11)
        const doneText = `${done}/${quests.length}`;
        const doneW = (state.tab === 'DAILY' ? 4 : 3) * 20 + 8 + doneText.length * 11.5;
        const readyLabel = this.host.addChildLabel(panel, 'QuestReadyCount', `可领取 ${ready}`, rightX - doneW - 30, tabY - 2, 20, rgba(255, 214, 120, 255), new Size(150, 30), HorizontalTextAlignment.RIGHT);
        readyLabel.overflow = Label.Overflow.SHRINK;
        this.outline(readyLabel, 1, true);
      }
    }

    if (state.loading && !state.summary) {
      mountKitLoading(this.host, panel, 0, hintY, 1.2, '任务读取中…');
      return;
    }
    if (state.error && !state.summary) {
      this.centerHint(panel, `读取失败:${state.error}`, rgba(255, 150, 130, 235), 1.2, hintY);
      return;
    }
    if (quests.length === 0) {
      this.centerHint(panel, '暂无任务', rgba(196, 182, 152, 220), 1.2, hintY);
      return;
    }

    // 列表:Mask + ScrollView 单列滚动。一屏放得下(5 条日常)用行距 98 正好铺满;
    // 放不下(成就 7 条)行距略收,让下一行露出小半截 + 底部渐隐 + 右侧金色滚动条,一眼看得出还能往下滑。
    const rowW = outerW - 24;
    const padTop = 5;
    const viewH = listHeight - 8;
    const basePitch = 98;
    const fit = Math.max(1, Math.floor((viewH - padTop + 6) / basePitch));
    const rowPitch = quests.length > fit ? (viewH - padTop) / (fit + 0.42) : basePitch;
    const listY = listBottom + listHeight / 2 - 1;
    const listNode = this.host.addChildPlainNode(panel, 'QuestList', 0, listY, rowW + 8, viewH);
    listNode.addComponent(Mask);
    const contentHeight = Math.max(viewH, padTop * 2 + quests.length * rowPitch - 8);
    const contentNode = this.host.addChildPlainNode(listNode, 'QuestListContent', 0, 0, rowW + 8, contentHeight);
    contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    contentNode.setPosition(0, viewH / 2, 0);
    const scroll = listNode.addComponent(ScrollView);
    scroll.content = contentNode;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    // 奖励列宽按本页最多奖励数留:成就页全是单奖励,就只留一格,名称 / 进度条更宽,行内不再空一大段
    const rewardCols = Math.max(1, Math.min(2, quests.reduce((max, quest) => Math.max(max, quest.rewards.length), 0)));
    quests.forEach((quest, index) => {
      this.addQuestRowPhone(contentNode, quest, -padTop - (rowPitch - 8) / 2 - index * rowPitch, rowW, rowPitch - 8, state.claiming, rewardCols);
    });
    this.attachScrollHints(panel, listNode, scroll, listY, rowW + 8, viewH, contentHeight, outerW / 2 - 6);
  }

  private rerenderQuestIfOpen(): void {
    if (this.lastQuestGroup?.isValid) {
      this.host.setLobbyQuestTab(this.host.currentLobbyQuestState().tab);
    }
  }

  /**
   * 列表可滚动提示(内容超出一屏才挂):底部 / 顶部渐隐带 + 右侧细金滚动条,随滚动同步。
   * 都是纯绘制节点,不带输入组件,不挡行内按钮。
   */
  private attachScrollHints(panel: Node, listNode: Node, scroll: ScrollView, centerY: number, viewW: number, viewH: number, contentH: number, thumbX: number): void {
    const maxOffset = contentH - viewH;
    if (maxOffset <= 2) {
      return;
    }
    const mountFade = (name: string, atBottom: boolean, fadeH: number, peak: number): Node => {
      const fade = this.host.addChildPlainNode(panel, name, 0, centerY + (atBottom ? -1 : 1) * (viewH / 2 - fadeH / 2), viewW, fadeH);
      const g = fade.addComponent(Graphics);
      const strips = 12;
      for (let i = 0; i < strips; i++) {
        // i=0 贴列表边缘最浓,向内淡出
        g.fillColor = rgba(5, 4, 6, Math.round(peak * (1 - i / strips) ** 1.5));
        const y = atBottom ? -fadeH / 2 + (fadeH / strips) * i : fadeH / 2 - (fadeH / strips) * (i + 1);
        g.rect(-viewW / 2, y, viewW, fadeH / strips + 0.5);
        g.fill();
      }
      return fade;
    };
    const bottomFade = mountFade('ListFadeBottom', true, 46, 240);
    const topFade = mountFade('ListFadeTop', false, 30, 220);
    const trackH = viewH - 16;
    const track = this.host.addChildPlainNode(panel, 'ListScrollTrack', thumbX, centerY, 6, trackH);
    const tg = track.addComponent(Graphics);
    tg.fillColor = rgba(126, 98, 54, 80);
    tg.roundRect(-1, -trackH / 2, 2, trackH, 1);
    tg.fill();
    const thumbH = Math.max(56, trackH * (viewH / contentH));
    const thumb = this.host.addChildPlainNode(track, 'Thumb', 0, 0, 6, thumbH);
    const hg = thumb.addComponent(Graphics);
    hg.fillColor = rgba(232, 190, 110, 235);
    hg.roundRect(-2.5, -thumbH / 2, 5, thumbH, 2.5);
    hg.fill();
    const sync = (): void => {
      if (!thumb.isValid) {
        return;
      }
      const p = Math.max(0, Math.min(1, scroll.getScrollOffset().y / maxOffset));
      thumb.setPosition(0, trackH / 2 - thumbH / 2 - p * (trackH - thumbH), 0);
      bottomFade.active = p < 0.97;
      topFade.active = p > 0.03;
    };
    listNode.on('scrolling', sync, this);
    sync();
  }

  /** 手机标题带内容:鎏金标题 + 两侧星饰线 + 素材关闭钮(任务 / 邮件共用)。 */
  private addPhoneHeader(panel: Node, text: string, panelWidth: number, panelHeight: number, onClose: () => void): void {
    const titleY = panelHeight / 2 - 6 - PHONE_HEADER_H / 2;
    // 标题统一成左上角标题牌(与英雄 / 背包页同款,2026-10-05 用户)
    addPhoneDialogTitle(this.host, panel, panelWidth, panelHeight, text, 6 + PHONE_HEADER_H / 2, 1.05, onClose);
    this.addAssetCloseButton(panel, panelWidth / 2 - 50, titleY, 52 / 46, onClose);
  }

  /**
   * 手机列表井:压暗的内凹底 + 细金框(2026-10-17 界面统一,原型套件 card_frame_open;缺图退回暗金细框 + 上沿亮金线)。
   * bandH > 0 时在框内顶部嵌暗红标题带(压在金线下),返回带心 y(井局部坐标)。
   */
  private drawPhoneListWell(panel: Node, name: string, x: number, y: number, width: number, height: number, bandH = 0): number {
    const well = this.host.addChildPlainNode(panel, name, x, y, width, height);
    const g = well.addComponent(Graphics);
    g.fillColor = rgba(4, 3, 5, 176);
    g.roundRect(-width / 2, -height / 2, width, height, 8);
    g.fill();
    if (mountRefSliced(this.host, well, 'Frame', REF_KIT.cardFrameOpen, 0, 0, width, height)) {
      const fk = refCardFrameK(width, height);
      const bandY = height / 2 - REF_CARD_FRAME_LINE.top * fk - bandH / 2;
      if (bandH > 0) {
        mountRefHeaderBand(this.host, well, 'Band', 0, bandY, width - REF_CARD_FRAME_LINE.side * fk * 2, bandH, 1);
      }
      raiseRefFrame(well);
      return bandY;
    }
    // 上沿内阴影(井口向下的暗带)
    for (let i = 0; i < 4; i++) {
      g.fillColor = rgba(0, 0, 0, 84 - i * 20);
      g.rect(-width / 2 + 2, height / 2 - 3 - (i + 1) * 4, width - 4, 4);
      g.fill();
    }
    // 上沿亮金线:两端渐隐
    const segs = 20;
    for (let i = 0; i < segs; i++) {
      const t = Math.abs((i + 0.5) / segs - 0.5) * 2;
      g.fillColor = rgba(232, 188, 106, Math.round(245 * (1 - t * t * 0.7)));
      g.rect(-width / 2 + (width / segs) * i, height / 2 - 1.2, width / segs + 0.5, 2.4);
      g.fill();
    }
    g.strokeColor = rgba(132, 100, 56, 170);
    g.lineWidth = 1.2;
    g.roundRect(-width / 2, -height / 2, width, height, 8);
    g.stroke();
    return height / 2 - 4 - bandH / 2;
  }

  private addPhoneFooterMotto(panel: Node, footerY: number, panelWidth: number): void {
    const footer = this.host.addChildLabel(panel, 'FooterMotto', '于黑暗中前行 · 以意志铸就荣耀', 0, footerY, 20, rgba(230, 218, 196, 240), new Size(Math.min(420, panelWidth * 0.4), 28));
    footer.overflow = Label.Overflow.SHRINK;
    // 大厅背景地面中线有高光倒影,描边防止字被冲淡(2026-10-17)
    this.outline(footer, 1, false);
    const footDivW = 150;
    const footDivGap = 190 + footDivW / 2;
    this.host.addSprite('FooterDividerL', QUEST_UI_ASSETS.dividerLeft, -footDivGap, footerY, footDivW, footDivW * (71 / 224), panel);
    this.host.addSprite('FooterDividerR', QUEST_UI_ASSETS.dividerRight, footDivGap, footerY, footDivW, footDivW * (71 / 224), panel);
  }

  /** 行底九宫格专用 SpriteFrame:从资料页共用的那张克隆,inset 只设在克隆上(见 ROW_BG_INSET_LEFT)。 */
  private rowBgSource: SpriteFrame | null = null;
  private rowBgSliced: SpriteFrame | null = null;

  private slicedRowBgFrame(source: SpriteFrame): SpriteFrame {
    if (this.rowBgSource !== source || !this.rowBgSliced || !this.rowBgSliced.isValid) {
      const clone = source.clone();
      clone.insetLeft = ROW_BG_INSET_LEFT;
      clone.insetRight = ROW_BG_INSET_RIGHT;
      clone.insetTop = 0;
      clone.insetBottom = 0;
      this.rowBgSource = source;
      this.rowBgSliced = clone;
    }
    return this.rowBgSliced;
  }

  /**
   * 手机行底:row_bg 素材横向九宫格(只拉中段直边)+ 整体等比缩到行高;缺图退手绘。
   * 等比口径按裁边后的 rect(780×115)算:节点高 = rect 高,再整体缩放 k,两端尖饰横竖同比。
   * tone: 'ready' 可领(原色 + 暖金内光)/ 'normal' / 'dim' 已领(压暗)。
   */
  private mountPhoneRowBg(row: Node, width: number, height: number, tone: 'ready' | 'normal' | 'dim'): void {
    const holder = this.host.addChildPlainNode(row, 'Bg', 0, 0, width, height);
    const art = this.host.addSprite('BgArt', QUEST_UI_ASSETS.rowBg, 0, 0, width, height, holder);
    if (art && art.spriteFrame) {
      const sliced = this.slicedRowBgFrame(art.spriteFrame);
      const rect = sliced.rect;
      const k = height / rect.height;
      art.spriteFrame = sliced;
      art.type = Sprite.Type.SLICED;
      art.node.getComponent(UITransform)?.setContentSize(new Size(Math.max(rect.width, width / k), rect.height));
      art.node.setScale(k, k, 1);
      art.color = tone === 'ready' ? rgba(255, 244, 214, 255) : tone === 'dim' ? rgba(150, 146, 140, 255) : rgba(214, 208, 198, 255);
      art.markForUpdateRenderData();
    } else {
      const g = holder.addComponent(Graphics);
      g.fillColor = tone === 'ready' ? rgba(56, 42, 18, 230) : rgba(15, 13, 14, 225);
      g.roundRect(-width / 2, -height / 2, width, height, 8);
      g.fill();
    }
    if (tone === 'ready') {
      // 暖金内光:落在素材直边内侧(两端尖饰留出),上亮下淡
      const glow = this.host.addChildPlainNode(row, 'ReadyGlow', 0, 0, width, height);
      const gg = glow.addComponent(Graphics);
      const inX = 34 * (height / 88);
      const inY = 7 * (height / 88);
      const gw = width - inX * 2;
      const gh = height - inY * 2;
      const strips = 6;
      for (let i = 0; i < strips; i++) {
        gg.fillColor = rgba(150, 104, 34, Math.round(74 - i * 9));
        gg.rect(-gw / 2, gh / 2 - (gh / strips) * (i + 1), gw, gh / strips + 0.5);
        gg.fill();
      }
      gg.fillColor = rgba(255, 214, 128, 150);
      gg.rect(-gw / 2 + 10, gh / 2 - 1.5, gw - 20, 1.5);
      gg.fill();
      gg.strokeColor = rgba(255, 196, 92, 70);
      gg.lineWidth = 6;
      gg.roundRect(-gw / 2 - 2, -gh / 2 - 2, gw + 4, gh + 4, 6);
      gg.stroke();
      gg.strokeColor = rgba(255, 220, 130, 235);
      gg.lineWidth = 2;
      gg.roundRect(-gw / 2, -gh / 2, gw, gh, 5);
      gg.stroke();
    }
  }

  /**
   * 进度条(素材金框 + 满格绿填充 FILLED 水平裁剪;缺图退手绘),返回条高。
   * 空框素材左端自带一粒米色「起点珠」:0 进度时看着像已经走了一点,有进度时又和绿色填充不同色。
   * 所以 0 进度用一小块与槽底同色的暗片盖住它;有进度时填充至少盖过起点珠(统一绿色)。
   * dim=已领取行:框和填充一起压暗,不抢可领行的视线。
   */
  private mountProgressBar(row: Node, x: number, y: number, barW: number, ratio: number, done: boolean, dim: boolean): number {
    const barH = barW * (86 / 603);
    const frameSprite = this.host.addSprite('BarFrame', QUEST_UI_ASSETS.progressFrame, x, y, barW, barH, row);
    if (!frameSprite) {
      const h = Math.max(8, barH * 0.26);
      const bar = this.host.addChildPlainNode(row, 'Bar', x, y, barW, h);
      const bg = bar.addComponent(Graphics);
      bg.fillColor = rgba(40, 34, 26, 220);
      bg.roundRect(-barW / 2, -h / 2, barW, h, h / 2);
      bg.fill();
      if (ratio > 0) {
        bg.fillColor = done ? rgba(150, 226, 130, 240) : rgba(224, 178, 90, 235);
        bg.roundRect(-barW / 2, -h / 2, Math.max(h, barW * ratio), h, h / 2);
        bg.fill();
      }
      return barH;
    }
    if (dim) {
      frameSprite.color = rgba(150, 146, 140, 255);
    }
    const u = barW / 603;
    if (ratio < 1) {
      // 盖住起点珠(未满时都盖:有进度时绿色填充的圆头比起点珠窄,不盖会在左侧漏一道米色边)
      const patch = this.host.addChildPlainNode(row, 'BarEmptyPatch', x - barW / 2 + 59 * u, y + 1 * u, 28 * u, 35 * u);
      const pg = patch.addComponent(Graphics);
      pg.fillColor = rgba(12, 12, 11, 255);
      pg.roundRect(-14 * u, -17.5 * u, 28 * u, 35 * u, 13 * u);
      pg.fill();
    }
    if (ratio <= 0) {
      return barH;
    }
    if (ratio >= 1) {
      const full = this.host.addSprite('BarFill', QUEST_UI_ASSETS.progressFilled, x, y, barW, barH, row);
      if (full && dim) {
        full.color = rgba(140, 150, 136, 255);
      }
      return barH;
    }
    // 未满:满格图只露出槽内的绿色部分(矩形遮罩裁到槽内 x 47..556 / y 25..60),
    // 不再用 FILLED 整张横裁——那样满格图自带的边框会叠在空框上,裁口处上沿出现一段暗缺口。
    const slotLeft = 47 * u;
    const slotW = (556 - 47) * u;
    const clipW = Math.max(30 * u, slotW * ratio); // bt2_bar_v3
    const clipX = x - barW / 2 + slotLeft + clipW / 2;
    const clipY = y + 0.5 * u;
    const clip = this.host.addChildPlainNode(row, 'BarFillClip', clipX, clipY, clipW, 35 * u);
    clip.addComponent(Mask);
    const fill = this.host.addSprite('BarFill', QUEST_UI_ASSETS.progressFilled, x - clipX, y - clipY, barW, barH, clip);
    if (fill && dim) {
      fill.color = rgba(140, 150, 136, 255);
    }
    return barH;
  }

  /** 图标槽(bag_slot 近正方形等比)+ 居中图标;缺槽图退暗底圆角。 */
  private mountIconSlot(parent: Node, name: string, x: number, y: number, size: number, iconPath: string | null, iconRatio: number, iconH: number): void {
    const slot = this.host.addChildPlainNode(parent, name, x, y, size, size);
    if (!this.host.addSprite('Slot', QUEST_UI_ASSETS.iconSlot, 0, 0, size, size, slot)) {
      const g = slot.addComponent(Graphics);
      g.fillColor = rgba(10, 9, 10, 230);
      g.roundRect(-size / 2, -size / 2, size, size, 8);
      g.fill();
      g.strokeColor = rgba(112, 88, 52, 170);
      g.lineWidth = 1;
      g.roundRect(-size / 2, -size / 2, size, size, 8);
      g.stroke();
    }
    if (iconPath) {
      const w = iconRatio >= 1 ? iconH : iconH * iconRatio;
      const h = iconRatio >= 1 ? iconH / iconRatio : iconH;
      this.host.addSprite('Icon', iconPath, 0, 0, w, h, slot);
    }
  }

  /** 奖励小牌:暗底细金框 + 图标 + 「名称×数量」;固定宽度,多奖励横向排开(单 / 双奖励行第一格对齐)。 */
  private addRewardChip(parent: Node, name: string, item: QuestRewardItemVO, left: number, y: number, width: number, height: number, dim: boolean): void {
    const chip = this.host.addChildPlainNode(parent, name, left + width / 2, y, width, height);
    const g = chip.addComponent(Graphics);
    g.fillColor = rgba(6, 5, 6, 200);
    g.roundRect(-width / 2, -height / 2, width, height, 7);
    g.fill();
    g.strokeColor = rgba(196, 156, 86, dim ? 130 : 210);
    g.lineWidth = 1.4;
    g.roundRect(-width / 2, -height / 2, width, height, 7);
    g.stroke();
    const icon = resolveRewardIcon(item);
    const iconBox = height - 12;
    const iconCx = -width / 2 + 8 + iconBox / 2;
    if (icon) {
      const w = icon.ratio >= 1 ? iconBox : iconBox * icon.ratio;
      const h = icon.ratio >= 1 ? iconBox / icon.ratio : iconBox;
      const sprite = this.host.addSprite('Icon', icon.path, iconCx, 0, w, h, chip);
      if (sprite && dim) {
        sprite.color = rgba(170, 170, 170, 255);
      }
    }
    const textLeft = icon ? iconCx + iconBox / 2 + 8 : -width / 2 + 12;
    const label = this.host.addChildLabel(chip, 'Text', `${item.name}×${item.amount}`, textLeft, 0, 20, dim ? rgba(206, 197, 179, 240) : rgba(255, 226, 150, 250), new Size(width / 2 - 8 - textLeft, 28), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
  }

  private addQuestRowPhone(parent: Node, quest: PlayerQuestVO, y: number, width: number, height: number, claiming: string | null, rewardCols: number): void {
    const row = this.host.addChildPlainNode(parent, `QuestRow_${quest.questCode}`, 0, y, width, height);
    const ready = quest.claimable && !quest.claimed;
    this.mountPhoneRowBg(row, width, height, ready ? 'ready' : quest.claimed ? 'dim' : 'normal');
    // 列宽随行宽在 [1150, 1430] 间线性收放(667 宽手机 ↔ 844 宽手机)
    const t = Math.max(0, Math.min(1, (width - 1150) / 280));
    const chipW = 158 + 26 * t;
    const chipGap = 10;
    const barW = 200 + 60 * t + (rewardCols === 1 ? 44 : 0);
    const btnW = 142;
    const btnH = Math.min(50, height - 30);
    const btnX = width / 2 - 46 - btnW / 2;
    // 奖励小牌靠右贴着领取钮(「奖励 → 领取」成一组);单奖励行的空位并到进度条与奖励之间这一处
    const rewardRight = btnX - btnW / 2 - 22;
    const rewardColsW = rewardCols * chipW + (rewardCols - 1) * chipGap;
    const barX = rewardRight - rewardColsW - 34 - barW / 2;

    // 任务类型图标槽
    const iconRule = QUEST_ICON_RULES.find((rule) => rule.match.test(`${quest.questName}${quest.questDesc ?? ''}`)) ?? null;
    const slotSize = Math.min(66, height - 20);
    const slotX = -width / 2 + 46 + slotSize / 2;
    this.mountIconSlot(row, 'TypeSlot', slotX, 0, slotSize, iconRule?.path ?? null, iconRule?.ratio ?? 1, slotSize * 0.76);

    const textLeft = slotX + slotSize / 2 + 16;
    const textW = Math.max(120, barX - barW / 2 - 18 - textLeft);
    const name = this.host.addChildLabel(row, 'Name', quest.questName, textLeft, height * 0.19, 24, quest.claimed ? rgba(215, 206, 185, 240) : rgba(255, 232, 176, 255), new Size(textW, 32), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    name.isBold = true;
    this.outline(name, 1, true);
    const desc = this.host.addChildLabel(row, 'Desc', quest.questDesc ?? '', textLeft, -height * 0.2, 20, rgba(206, 197, 181, 240), new Size(textW, 28), HorizontalTextAlignment.LEFT);
    desc.overflow = Label.Overflow.SHRINK;

    // 进度条 + 上方进度数字
    const barY = -height * 0.15;
    const ratio = quest.targetCount > 0 ? Math.min(1, quest.progress / quest.targetCount) : 0;
    const barH = this.mountProgressBar(row, barX, barY, barW, ratio, quest.claimable || quest.claimed, quest.claimed);
    const progressColor = quest.claimed ? rgba(150, 168, 136, 225) : ratio >= 1 ? rgba(190, 236, 160, 245) : rgba(214, 200, 168, 240);
    const progress = this.host.addChildLabel(row, 'Progress', `${quest.progress}/${quest.targetCount}`, barX, barY + barH / 2 + 15, 20, progressColor, new Size(barW, 28));
    progress.overflow = Label.Overflow.SHRINK;

    // 奖励小牌(最多两格,横排,右对齐)
    const rewards = quest.rewards.slice(0, 2);
    const chipH = Math.min(50, height - 30);
    rewards.forEach((item, index) => {
      const left = rewardRight - (rewards.length - index) * chipW - (rewards.length - 1 - index) * chipGap;
      this.addRewardChip(row, `Reward_${index}`, item, left, 0, chipW, chipH, quest.claimed);
    });

    // 领取按钮(可领时命名 LobbyQuestClaimReady:新手引导 CLAIM 步的光圈目标)
    const claimable = quest.claimable && claiming === null;
    const btn = this.host.addChildPlainNode(row, claimable ? 'LobbyQuestClaimReady' : 'Claim', btnX, 0, btnW, btnH);
    this.mountClaimButtonArt(btn, btnW, btnH, !quest.claimed && claimable, quest.claimed);
    const btnText = quest.claimed ? '已领取' : claiming === quest.questCode ? '领取中…' : quest.claimable ? '领取' : '未完成';
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 22, quest.claimed ? rgba(202, 195, 181) : claimable ? rgba(255, 236, 190) : rgba(232, 218, 188), new Size(btnW * 0.66, btnH - 8));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, 1, claimable);
    if (claimable) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => this.host.claimLobbyQuest(quest.questCode), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    }
  }

  /** 领取钮底图(红底金框 571×203 / 暗牌 393×142,按宽等比);缺图退手绘。 */
  private mountClaimButtonArt(btn: Node, btnW: number, btnH: number, active: boolean, claimed: boolean): void {
    if (!active && mountRefPlate(this.host, btn, 'ArtRef', REF_INFO_BANNER, 0, 0, btnW, btnH)) {
      // 2026-10-17 按原型:未完成 / 已领取 = 两端尖饰的暗底金边长条;已领取再压暗一档
      if (claimed) {
        btn.getChildByName('ArtRef')?.walk((child) => {
          const sprite = child.getComponent(Sprite);
          if (sprite) {
            sprite.color = rgba(170, 160, 146, 255);
          }
        });
      }
      return;
    }
    const artH = active ? btnW * (203 / 571) : btnW * (142 / 393);
    if (this.host.addSprite('Art', active ? QUEST_UI_ASSETS.btnClaim : QUEST_UI_ASSETS.btnDisabled, 0, 0, btnW, artH, btn)) {
      return;
    }
    const g = btn.addComponent(Graphics);
    g.fillColor = claimed ? rgba(30, 28, 26, 200) : active ? rgba(122, 32, 26, 240) : rgba(44, 38, 30, 210);
    g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7);
    g.fill();
    g.strokeColor = claimed ? rgba(96, 86, 70, 140) : active ? rgba(240, 180, 90, 235) : rgba(120, 100, 70, 150);
    g.lineWidth = 1.3;
    g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7);
    g.stroke();
  }

  private addQuestRow(parent: Node, quest: PlayerQuestVO, x: number, y: number, width: number, height: number, scale: number, claiming: string | null, phone = false): void {
    const row = this.host.addChildPlainNode(parent, `QuestRow_${quest.questCode}`, x, y, width, height);
    // 手机全屏行:字号 / 标签盒 / 图标 / 按钮放大 1.2 倍(工厂把 <20 号抬到 20,盒子不跟着放会被 SHRINK 压回小字);电脑 1
    const fs = phone ? 1.2 : 1;
    const g = row.addComponent(Graphics);
    g.fillColor = quest.claimable ? rgba(56, 42, 18, 230) : rgba(15, 13, 14, 225);
    g.roundRect(-width / 2, -height / 2, width, height, 7 * scale);
    g.fill();
    g.strokeColor = quest.claimable ? rgba(240, 194, 104, 230) : rgba(112, 90, 58, 150);
    g.lineWidth = Math.max(1, quest.claimable ? 1.7 * scale : 1.1 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 7 * scale);
    g.stroke();
    // 左侧信息区与奖励区之间的竖分割线(2026-09-10 用户反馈)。
    const sepX = width * 0.075;
    g.strokeColor = rgba(130, 104, 64, 130);
    g.lineWidth = Math.max(1, scale);
    g.moveTo(sepX, -height / 2 + 10 * scale);
    g.lineTo(sepX, height / 2 - 10 * scale);
    g.stroke();

    // 任务类型图标(按名称/描述关键词;无匹配不占位画暗框)。
    const iconRule = QUEST_ICON_RULES.find((rule) => rule.match.test(`${quest.questName}${quest.questDesc ?? ''}`)) ?? null;
    const iconBoxX = -width / 2 + 44 * scale * fs;
    if (iconRule) {
      const iconH = 58 * scale * fs;
      this.host.addSprite('TypeIcon', iconRule.path, iconBoxX, 0, iconH * iconRule.ratio, iconH, row);
    }
    const textLeft = -width / 2 + 84 * scale * fs;
    const name = this.host.addChildLabel(row, 'Name', quest.questName, textLeft, height / 2 - 22 * scale * fs, 19 * scale * fs, rgba(245, 222, 160, 250), new Size(width * 0.26, 26 * scale * fs), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.outline(name, scale, true);
    const desc = this.host.addChildLabel(row, 'Desc', quest.questDesc ?? '', textLeft, -height / 2 + 18 * scale * fs, 15 * scale * fs, rgba(212, 204, 186, 240), new Size(width * 0.28, 21 * scale * fs), HorizontalTextAlignment.LEFT);
    desc.overflow = Label.Overflow.SHRINK;

    // 进度条(素材金框+满格绿填充 FILLED 水平裁剪;缺图退手绘)。
    // 手机全屏行更宽:进度条宽封顶(否则按比例变粗,压到上方进度数字)
    const barW = phone ? Math.min(width * 0.21, 250 * scale) : width * 0.21;
    const barH = barW * (86 / 603);
    const barX = -width * 0.035;
    const barY = -8 * scale;
    const ratio = quest.targetCount > 0 ? Math.min(1, quest.progress / quest.targetCount) : 0;
    this.mountProgressBar(row, barX, barY, barW, ratio, quest.claimable || quest.claimed, false);
    const progress = this.host.addChildLabel(row, 'Progress', `${quest.progress}/${quest.targetCount}`, barX, barY + barH / 2 + 13 * scale * fs, 15 * scale * fs, rgba(225, 216, 196, 240), new Size(barW + 30 * scale, phone ? 26 : 20 * scale));
    progress.overflow = Label.Overflow.SHRINK;

    // 奖励区:最多两行 图标+文字(金币按量分大小堆;无图标纯文字)。
    const rewardIconX = width * 0.115;
    const rewardTextX = width * 0.145;
    const rewards = quest.rewards.slice(0, 2);
    rewards.forEach((item, index) => {
      const ry = rewards.length === 1 ? 0 : (index === 0 ? 19 * scale * fs : -19 * scale * fs);
      const icon = resolveRewardIcon(item);
      if (icon) {
        const iconH = 30 * scale * fs;
        this.host.addSprite(`RewardIcon_${index}`, icon.path, rewardIconX, ry, iconH * icon.ratio, iconH, row);
      }
      const label = this.host.addChildLabel(row, `Reward_${index}`, `${item.name}×${item.amount}`, rewardTextX + 12 * scale * fs, ry, 16 * scale * fs, rgba(255, 226, 150, 245), new Size(width * 0.17, 22 * scale * fs), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });

    // 领取按钮(可领时命名 LobbyQuestClaimReady:新手引导 CLAIM 步的光圈目标,findLobbyNode 命中第一个可领行)
    const btnW = 118 * scale * fs;
    const btnH = 42 * scale * fs;
    const claimable = quest.claimable && claiming === null;
    const btn = this.host.addChildPlainNode(row, claimable ? 'LobbyQuestClaimReady' : 'Claim', width / 2 - btnW / 2 - 16 * scale, 0, btnW, btnH);
    const useClaimArt = !quest.claimed && claimable;
    if (!this.host.addSprite('Art', useClaimArt ? QUEST_UI_ASSETS.btnClaim : QUEST_UI_ASSETS.btnDisabled, 0, 0, btnW, btnH, btn)) {
      const bgB = btn.addComponent(Graphics);
      bgB.fillColor = quest.claimed ? rgba(30, 28, 26, 200) : claimable ? rgba(122, 32, 26, 240) : rgba(44, 38, 30, 210);
      bgB.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
      bgB.fill();
      bgB.strokeColor = quest.claimed ? rgba(96, 86, 70, 140) : claimable ? rgba(240, 180, 90, 235) : rgba(120, 100, 70, 150);
      bgB.lineWidth = Math.max(1, 1.2 * scale);
      bgB.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
      bgB.stroke();
    }
    const btnText = quest.claimed ? '已领取' : claiming === quest.questCode ? '领取中…' : quest.claimable ? '领取' : '未完成';
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 18 * scale * fs, quest.claimed ? rgba(190, 182, 170) : claimable ? rgba(255, 236, 190) : rgba(202, 194, 178), new Size(btnW - 12 * scale, btnH));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, claimable);
    if (claimable) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => this.host.claimLobbyQuest(quest.questCode), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    }
  }

  /** 任务弹框专用页签(素材化);缺图退回通用手绘页签样式。 */
  private addQuestTabButton(parent: Node, text: string, active: boolean, x: number, y: number, width: number, scale: number, onClick: () => void): void {
    const height = active ? width * (205 / 673) : width * (162 / 621);
    const btn = this.host.addChildPlainNode(parent, `Tab_${text}`, x, y, width, Math.max(height, 44 * scale));
    if (!this.host.addSprite('Art', active ? QUEST_UI_ASSETS.tabActive : QUEST_UI_ASSETS.tabNormal, 0, 0, width, height, btn)) {
      const g = btn.addComponent(Graphics);
      g.fillColor = active ? rgba(89, 65, 30, 238) : rgba(14, 13, 15, 218);
      g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
      g.fill();
      g.strokeColor = active ? rgba(245, 203, 101, 236) : rgba(132, 96, 50, 188);
      g.lineWidth = Math.max(1, active ? 1.8 * scale : 1.2 * scale);
      g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(btn, 'Text', text, 0, 0, 20 * scale, active ? rgba(255, 231, 166) : rgba(221, 210, 185), new Size(width - 24 * scale, 28 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, active);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(btn, 1.03, 0.97);
  }

  /** 素材化关闭钮(金圈X);缺图退回文字 ✕。 */
  private addAssetCloseButton(parent: Node, x: number, y: number, scale: number, onClose: () => void): void {
    // 2026-10-17 按原型放大 1.3 倍
    const size = 46 * scale * 1.3;
    const btn = this.host.addChildPlainNode(parent, 'CloseBtn', x, y, size, size);
    if (!this.host.addSprite('Art', QUEST_UI_ASSETS.close, 0, 0, size * (155 / 161), size, btn)) {
      const label = this.host.addChildLabel(btn, 'Text', '✕', 0, 0, 22 * scale, rgba(230, 215, 190, 240), new Size(size, size));
      this.outline(label, scale, false);
    }
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClose, this);
    this.host.applyImageButtonFeedback(btn, 1.1, 0.92);
  }

  // ── 邮件面板 ──
  renderMailPanel(layout: UiLayout): void {
    // 2026-10-10 全界面美化:电脑端也用全屏实景版式(原电脑版是黑底小平框)
    if (isPhoneDesign() || layout.stageWidth >= 900) {
      this.renderMailPanelPhone(layout);
      return;
    }
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelWidth = Math.min(layout.stageWidth - 44 * scale, 680 * scale);
    const panelHeight = Math.min(layout.stageHeight - 60 * scale, 560 * scale);
    const state = this.host.currentLobbyMailState();

    this.mountDim('LobbyMailDim', centerX, centerY, layout, () => this.host.closeLobbyMailPanel());
    const group = this.host.createUiNode('LobbyMailSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(group, 'Frame', 0, 0, panelWidth, panelHeight, rgba(7, 7, 10, 240), rgba(192, 145, 66, 226), 18 * scale);

    const title = this.host.addChildLabel(panel, 'Title', '邮件', 0, panelHeight / 2 - 34 * scale, 26 * scale, rgba(244, 220, 166, 255), new Size(panelWidth - 120 * scale, 34 * scale));
    this.outline(title, scale, true);
    this.addCloseButton(panel, panelWidth / 2 - 34 * scale, panelHeight / 2 - 34 * scale, scale, () => this.host.closeLobbyMailPanel());

    if (state.loading && state.mails.length === 0) {
      this.centerHint(panel, '邮件读取中…', rgba(214, 196, 156, 235), scale);
      return;
    }
    if (state.error && state.mails.length === 0) {
      this.centerHint(panel, `读取失败:${state.error}`, rgba(255, 150, 130, 235), scale);
      return;
    }
    if (state.mails.length === 0) {
      this.centerHint(panel, '暂无邮件', rgba(196, 182, 152, 220), scale);
      return;
    }

    // 一键领取(有可领附件时)
    const anyClaimable = state.mails.some((mail) => !mail.claimed && mail.attachments.length > 0);
    if (anyClaimable) {
      const btnW = 150 * scale;
      const btnH = 38 * scale;
      const btn = this.host.addChildPlainNode(panel, 'ClaimAll', 0, -panelHeight / 2 + 34 * scale, btnW, btnH);
      const g = btn.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 240);
      g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7 * scale);
      g.fill();
      g.strokeColor = rgba(240, 180, 90, 235);
      g.lineWidth = Math.max(1, 1.3 * scale);
      g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7 * scale);
      g.stroke();
      const label = this.host.addChildLabel(btn, 'Text', state.claiming === -1 ? '领取中…' : '一键领取', 0, 0, 16 * scale, rgba(255, 236, 190), new Size(btnW - 10 * scale, btnH));
      label.overflow = Label.Overflow.SHRINK;
      if (state.claiming === null) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, () => this.host.claimAllLobbyMails(), this);
        this.host.applyImageButtonFeedback(btn, 1.04, 0.96);
      }
    }

    const rowH = 74 * scale;
    const rowW = panelWidth - 64 * scale;
    let cursor = panelHeight / 2 - 82 * scale - rowH / 2;
    const bottomLimit = -panelHeight / 2 + (anyClaimable ? 64 : 24) * scale;
    for (const mail of state.mails) {
      if (cursor - rowH / 2 < bottomLimit) {
        break;
      }
      this.addMailRow(panel, mail, 0, cursor, rowW, rowH - 8 * scale, scale, state.claiming);
      cursor -= rowH;
    }
  }

  /**
   * 邮箱重做(docs/15 2026-10-28 用户:「没有层次分明」→ 原型 proto_mail_v1,1870×841,1:1):
   * 左栏收件箱列表(每封一张卡:信封徽 + 未读红点 / 标题 / 发件人·时间 / 「附件」标签;选中的卡亮金边),底部「删除已读」「一键领取」;
   * 右栏选中邮件详情(标题 / 发件人·时间·有效期 / 金线 / 正文 / 「附件」方格 + 数量 / 「删除」「领取附件」)。
   * 坐标 = 原型像素 × u(u = 舞台高 / 841),左栏贴左、右栏贴右;选中即已读(红点消失),未读红点不再在打开时一次清光。
   */
  private renderMailPanelPhone(layout: UiLayout): void {
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const { width: panelWidth, height: panelHeight } = resolvePhoneDialogSize(layout);
    const state = this.host.currentLobbyMailState();
    const P = townProtoFrame(layout);
    // 原型坐标 → 面板局部坐标
    const X = (px: number): number => P.L(px) - centerX;
    const XR = (px: number): number => P.R(px) - centerX;
    const Y = (py: number): number => P.Y(py) - centerY;
    const S = (v: number): number => P.S(v);

    const dim = this.mountDim('LobbyMailDim', centerX, centerY, layout, () => this.host.closeLobbyMailPanel());
    const group = this.host.createUiNode('LobbyMailSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    this.lastMailNodes = [dim, group];
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelWidth, panelHeight);
    drawPhoneDialogFrame(this.host, panel, panelWidth, panelHeight, PHONE_HEADER_H, { bare: true, coverW: layout.width + Math.abs(centerX) * 2, coverH: layout.height + Math.abs(centerY) * 2 });
    addPhoneDialogTitle(this.host, panel, panelWidth, panelHeight, '邮件', 6 + PHONE_HEADER_H / 2, 1.05, () => this.host.closeLobbyMailPanel());
    const closeBtn = this.host.addChildPlainNode(panel, 'CloseBtn', XR(1741), Y(47), S(92), S(92));
    if (!this.host.addSprite('Art', MAIL_KIT.close, 0, 0, S(76), S(76), closeBtn)) {
      this.host.addSprite('Art', QUEST_UI_ASSETS.close, 0, 0, S(74) * (155 / 161), S(74), closeBtn);
    }
    closeBtn.addComponent(Button);
    closeBtn.on(Button.EventType.CLICK, () => this.host.closeLobbyMailPanel(), this);
    this.host.applyImageButtonFeedback(closeBtn, 1.1, 0.92);

    // 首开素材闸门:原型裁件 + 附件图标到齐再画
    const artPaths = [...MAIL_KIT_PATHS, QUEST_UI_ASSETS.mailIcon];
    state.mails.forEach((mail) => mail.attachments.forEach((item) => {
      const icon = resolveRewardIcon(item);
      if (icon) {
        artPaths.push(icon.path);
      }
    }));
    const hintY = Y(420);
    if (this.artPending(artPaths, () => this.rerenderMailIfOpen(layout))) {
      this.centerHint(panel, '邮件读取中…', rgba(214, 196, 156, 235), 1.2, hintY);
      return;
    }
    this.addPhoneFooterMotto(panel, Y(795), panelWidth);

    // 两个暗铁金边面板:左 100..760、右 785..1770,y 105..745
    const leftW = S(660);
    const rightW = XR(1770) - X(785);
    const panelsH = S(640);
    const panelsY = Y(425);
    const left = this.host.addChildPlainNode(panel, 'Inbox', X(100) + leftW / 2, panelsY, leftW, panelsH);
    const right = this.host.addChildPlainNode(panel, 'Detail', X(785) + rightW / 2, panelsY, rightW, panelsH);
    for (const [node, w] of [[left, leftW], [right, rightW]] as Array<[Node, number]>) {
      if (!mountRefSliced(this.host, node, 'Bg', MAIL_KIT.panel, 0, 0, w, panelsH)) {
        const g = node.addComponent(Graphics);
        g.fillColor = rgba(10, 9, 10, 236);
        g.roundRect(-w / 2, -panelsH / 2, w, panelsH, S(10));
        g.fill();
        g.strokeColor = rgba(196, 154, 86, 230);
        g.lineWidth = Math.max(1, S(2));
        g.roundRect(-w / 2, -panelsH / 2, w, panelsH, S(10));
        g.stroke();
      }
    }

    if (state.loading && state.mails.length === 0) {
      this.centerHint(panel, '邮件读取中…', rgba(214, 196, 156, 235), 1.2, hintY);
      return;
    }
    if (state.error && state.mails.length === 0) {
      this.centerHint(panel, `读取失败:${state.error}`, rgba(255, 150, 130, 235), 1.2, hintY);
      return;
    }

    // ── 左栏:收件箱 ──
    const lx = (px: number): number => X(px) - (X(100) + leftW / 2);
    const ly = (py: number): number => Y(py) - panelsY;
    const unread = state.mails.filter((mail) => !mail.read).length;
    const head = this.host.addChildLabel(left, 'Head', `收件箱    ${state.mails.length} / ${MAIL_LIST_MAX}`, lx(150), ly(150), S(26), rgba(246, 230, 196, 255), new Size(S(300), S(34)), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    this.outline(head, 1, true);
    const pillW = S(136);
    const pillH = S(42);
    const pill = this.host.addChildPlainNode(left, 'UnreadPill', lx(658), ly(150), pillW, pillH);
    if (!mountRefSliced(this.host, pill, 'Bg', MAIL_KIT.pill, 0, 0, pillW, pillH)) {
      const pg = pill.addComponent(Graphics);
      pg.fillColor = rgba(14, 11, 9, 240);
      pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, S(6));
      pg.fill();
      pg.strokeColor = rgba(214, 172, 96, 240);
      pg.lineWidth = Math.max(1, S(1.5));
      pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, S(6));
      pg.stroke();
    }
    const pillText = this.host.addChildLabel(pill, 'Text', unread > 0 ? `未读 ${unread}` : '全部已读', 0, 0, S(20), rgba(255, 226, 160, 255), new Size(pillW - S(12), pillH));
    pillText.overflow = Label.Overflow.SHRINK;

    const anyClaimable = state.mails.some((mail) => !mail.claimed && mail.attachments.length > 0);
    const anyDeletable = state.mails.some((mail) => mail.read && (mail.claimed || mail.attachments.length === 0));
    const busy = state.claiming !== null;
    this.mountMailButton(left, 'DeleteRead', state.claiming === -2 ? '处理中…' : '删除已读', lx(270), ly(688), S(266), S(82), false, anyDeletable && !busy, S(28), anyDeletable && !busy ? () => this.host.deleteReadLobbyMails() : undefined);
    this.mountMailButton(left, 'ClaimAll', state.claiming === -1 ? '领取中…' : '一键领取', lx(580), ly(688), S(296), S(82), true, anyClaimable && !busy, S(30), anyClaimable && !busy ? () => this.host.claimAllLobbyMails() : undefined);

    let selected = state.mails.find((mail) => mail.mailId === this.host.currentLobbyMailSelectedId()) ?? null;
    if (!selected && state.mails.length > 0) {
      selected = state.mails[0];
    }

    if (state.mails.length === 0) {
      const empty = this.host.addSprite('EmptyIcon', QUEST_UI_ASSETS.mailIcon, 0, ly(380), S(120), S(120) * (110 / 112), left);
      if (empty) {
        empty.color = rgba(200, 196, 188, 200);
      }
      const label = this.host.addChildLabel(left, 'EmptyText', '暂无邮件', 0, ly(470), S(24), rgba(196, 182, 152, 220), new Size(S(300), S(34)));
      label.overflow = Label.Overflow.SHRINK;
    } else {
      // 列表:行 610×115、行距 130,从 y 195 起;超过 3 封 Mask + ScrollView 上下滑
      const rowW = S(610);
      const rowH = S(115);
      const pitch = S(130);
      const listTop = ly(195);
      const listBottom = ly(630);
      const viewH = listTop - listBottom;
      const listNode = this.host.addChildPlainNode(left, 'MailList', 0, (listTop + listBottom) / 2, rowW + S(8), viewH);
      listNode.addComponent(Mask);
      const contentHeight = Math.max(viewH, state.mails.length * pitch - (pitch - rowH));
      const contentNode = this.host.addChildPlainNode(listNode, 'MailListContent', 0, 0, rowW + S(8), contentHeight);
      contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
      contentNode.setPosition(0, viewH / 2, 0);
      const scroll = listNode.addComponent(ScrollView);
      scroll.content = contentNode;
      scroll.horizontal = false;
      scroll.vertical = true;
      scroll.inertia = true;
      scroll.elastic = true;
      state.mails.forEach((mail, index) => {
        this.addMailCard(contentNode, mail, -index * pitch - rowH / 2, rowW, rowH, mail === selected, S);
      });
      if (contentHeight > viewH) {
        this.attachScrollHints(left, listNode, scroll, (listTop + listBottom) / 2, rowW + S(8), viewH, contentHeight, leftW / 2 - S(14));
      }
    }

    // ── 右栏:详情 ──
    const rx = (px: number): number => X(px) - (X(785) + rightW / 2);
    const ry = (py: number): number => Y(py) - panelsY;
    if (!selected) {
      const mark = this.host.addSprite('DetailEmpty', QUEST_UI_ASSETS.mailIcon, 0, ry(380), S(150), S(150) * (110 / 112), right);
      if (mark) {
        mark.color = rgba(200, 196, 188, 150);
      }
      const label = this.host.addChildLabel(right, 'DetailEmptyText', '没有更多邮件', 0, ry(490), S(24), rgba(196, 182, 152, 220), new Size(S(300), S(34)));
      label.overflow = Label.Overflow.SHRINK;
      return;
    }
    const innerL = rx(830);
    const innerR = rx(1735);
    const innerW = innerR - innerL;
    const title = this.host.addChildLabel(right, 'Title', selected.title, innerL, ry(165), S(36), rgba(250, 240, 220, 255), new Size(innerW, S(46)), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    this.outline(title, 1, true);
    const meta = this.host.addChildLabel(right, 'Meta', `发件人:系统      ${formatMailTime(selected.createTime, false)}      有效期:${selected.expireTime ? formatMailTime(selected.expireTime, false) : '永久'}`, innerL, ry(222), S(22), rgba(206, 197, 181, 240), new Size(innerW, S(30)), HorizontalTextAlignment.LEFT);
    meta.overflow = Label.Overflow.SHRINK;
    // 金线 + 中间小菱
    if (!this.host.addSprite('Divider', MAIL_KIT.divider, (innerL + innerR) / 2, ry(258), innerW + S(10), S(24), right)) {
      const div = this.host.addChildPlainNode(right, 'DividerFallback', (innerL + innerR) / 2, ry(258), innerW, S(14)).addComponent(Graphics);
      div.fillColor = rgba(170, 132, 74, 190);
      div.rect(-innerW / 2, -Math.max(0.5, S(0.75)), innerW, Math.max(1, S(1.5)));
      div.fill();
    }
    const body = this.host.addChildLabel(right, 'Body', selected.content, innerL, ry(300), S(26), rgba(236, 226, 206, 245), new Size(innerW, S(120)), HorizontalTextAlignment.LEFT);
    body.enableWrapText = true;
    body.lineHeight = S(44);
    body.overflow = Label.Overflow.SHRINK;
    body.node.getComponent(UITransform)?.setAnchorPoint(0, 1);
    body.node.setPosition(innerL, ry(284), 0);
    body.verticalAlign = VerticalTextAlignment.TOP;

    const hasAttachment = selected.attachments.length > 0;
    if (hasAttachment) {
      const sec = this.host.addChildLabel(right, 'AttachLabel', '附件', innerL, ry(430), S(26), rgba(250, 236, 200, 255), new Size(S(120), S(34)), HorizontalTextAlignment.LEFT);
      sec.isBold = true;
      this.outline(sec, 1, true);
      this.host.addSprite('AttachLine', MAIL_KIT.attachLine, innerL + S(114), ry(430), S(96), S(24), right);
      // 附件格 150 方、间距 25,从 x 835 起;最多一行 5 格(更多的另起一行)
      const box = S(150);
      const gap = S(25);
      selected.attachments.forEach((item, index) => {
        const col = index % 5;
        const row = Math.floor(index / 5);
        this.addMailAttachmentSlot(right, item, innerL + S(5) + box / 2 + col * (box + gap), ry(530) - row * (box + gap), box, selected!.claimed, S);
      });
    } else {
      const none = this.host.addChildLabel(right, 'NoAttach', '本邮件没有附件', innerL, ry(470), S(22), rgba(196, 182, 152, 220), new Size(innerW, S(30)), HorizontalTextAlignment.LEFT);
      none.overflow = Label.Overflow.SHRINK;
    }
    const pending = hasAttachment && !selected.claimed;
    const mailId = selected.mailId;
    this.mountMailButton(right, 'Delete', '删除', rx(932), ry(688), S(195), S(82), false, !pending && !busy, S(28), !pending && !busy ? () => this.host.deleteLobbyMail(mailId) : undefined);
    const claimText = !hasAttachment ? '无附件' : selected.claimed ? '已领取' : state.claiming === mailId ? '领取中…' : '领取附件';
    this.mountMailButton(right, 'Claim', claimText, rx(1567), ry(686), S(335), S(82), true, pending && !busy, S(32), pending && !busy ? () => this.host.claimLobbyMail(mailId) : undefined);
  }

  /** 原型裁的红主钮 / 暗次钮(文字已抹平)+ 字;不可用时压暗。 */
  private mountMailButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, primary: boolean, enabled: boolean, fontSize: number, onClick?: () => void): void {
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, height);
    if (!mountRefSliced(this.host, btn, 'Art', primary ? MAIL_KIT.btnPrimary : MAIL_KIT.btnSecondary, 0, 0, width, height)) {
      const g = btn.addComponent(Graphics);
      g.fillColor = primary ? rgba(120, 22, 18, 238) : rgba(18, 15, 14, 230);
      g.roundRect(-width / 2, -height / 2, width, height, 8);
      g.fill();
    }
    if (!enabled) {
      btn.getChildByName('Art')?.walk((child) => {
        const sprite = child.getComponent(Sprite);
        if (sprite) {
          sprite.color = primary ? rgba(150, 120, 116, 255) : rgba(150, 146, 140, 255);
        }
      });
    }
    const label = this.host.addChildLabel(btn, 'Label', text, 0, 0, fontSize, enabled ? rgba(255, 238, 206) : rgba(210, 200, 186), new Size(width * 0.78, height * 0.72));
    fitButtonLabel(label, height);
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = primary;
    this.outline(label, 1, primary);
    if (onClick) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, onClick, this);
      this.host.applyImageButtonFeedback(btn, 1.03, 0.97);
    }
  }

  /** 左栏一张邮件卡:信封徽(未读带红点;已读灰)/ 标题 / 发件人·时间 / 「附件」标签;选中亮金边。点卡 = 选中(并标已读)。 */
  private addMailCard(parent: Node, mail: PlayerMailVO, y: number, width: number, height: number, selected: boolean, S: (v: number) => number): void {
    const card = this.host.addChildPlainNode(parent, `MailCard_${mail.mailId}`, 0, y, width, height);
    if (!mountRefSliced(this.host, card, 'Bg', selected ? MAIL_KIT.rowSelected : MAIL_KIT.rowNormal, 0, 0, width, height)) {
      const g = card.addComponent(Graphics);
      g.fillColor = selected ? rgba(40, 32, 18, 235) : rgba(16, 14, 14, 225);
      g.roundRect(-width / 2, -height / 2, width, height, S(8));
      g.fill();
      g.strokeColor = selected ? rgba(240, 194, 104, 240) : rgba(120, 98, 62, 160);
      g.lineWidth = Math.max(1, S(1.5));
      g.roundRect(-width / 2, -height / 2, width, height, S(8));
      g.stroke();
    }
    const unread = !mail.read;
    const iconSize = S(88);
    const iconX = -width / 2 + S(70);
    if (!this.host.addSprite('MailIcon', unread ? MAIL_KIT.envelope : MAIL_KIT.envelopeRead, iconX, 0, iconSize, iconSize, card)) {
      this.host.addSprite('MailIcon', QUEST_UI_ASSETS.mailIcon, iconX, 0, S(76), S(76) * (110 / 112), card);
    }
    if (unread) {
      const dot = this.host.addChildPlainNode(card, 'UnreadDot', iconX + S(36), S(32), S(22), S(22)).addComponent(Graphics);
      dot.fillColor = rgba(226, 48, 40, 255);
      dot.circle(0, 0, S(10));
      dot.fill();
      dot.strokeColor = rgba(90, 10, 10, 220);
      dot.lineWidth = Math.max(1, S(1.2));
      dot.circle(0, 0, S(10));
      dot.stroke();
    }
    const textL = -width / 2 + S(145);
    const hasAttachment = mail.attachments.length > 0;
    const tagW = S(74);
    const textW = width / 2 - S(24) - (hasAttachment ? tagW + S(30) : 0) - textL;
    const title = this.host.addChildLabel(card, 'Title', mail.title, textL, S(22), S(27), unread || selected ? rgba(255, 240, 210, 255) : rgba(226, 214, 190, 240), new Size(Math.max(S(200), width / 2 - S(24) - textL), S(36)), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    this.outline(title, 1, true);
    const sub = this.host.addChildLabel(card, 'Sub', `系统 · ${formatMailTime(mail.createTime, true)}`, textL, -S(22), S(22), rgba(186, 178, 164, 235), new Size(textW, S(30)), HorizontalTextAlignment.LEFT);
    sub.overflow = Label.Overflow.SHRINK;
    if (hasAttachment) {
      const tag = this.host.addChildPlainNode(card, 'AttachTag', width / 2 - S(24) - tagW / 2, -S(20), tagW, S(41));
      if (!mountRefSliced(this.host, tag, 'Bg', MAIL_KIT.tag, 0, 0, tagW, S(41))) {
        const tg = tag.addComponent(Graphics);
        tg.fillColor = rgba(14, 11, 9, 240);
        tg.roundRect(-tagW / 2, -S(18), tagW, S(36), S(5));
        tg.fill();
      }
      if (mail.claimed) {
        tag.getChildByName('Bg')?.walk((child) => {
          const sprite = child.getComponent(Sprite);
          if (sprite) {
            sprite.color = rgba(150, 140, 126, 255);
          }
        });
      }
      const tagText = this.host.addChildLabel(tag, 'Text', mail.claimed ? '已领' : '附件', 0, 0, S(20), mail.claimed ? rgba(196, 186, 168, 240) : rgba(255, 226, 160, 255), new Size(tagW - S(8), S(30)));
      tagText.overflow = Label.Overflow.SHRINK;
    }
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => this.host.selectLobbyMail(mail.mailId), this);
    this.host.applyImageButtonFeedback(card, 1.015, 0.985);
  }

  /** 右栏附件格:暗底金边方格(现成 ult_stat_box 九宫格)+ 图标 + 右下数量;已领取整格压暗。 */
  private addMailAttachmentSlot(parent: Node, item: QuestRewardItemVO, x: number, y: number, box: number, claimed: boolean, S: (v: number) => number): void {
    const slot = this.host.addChildPlainNode(parent, `Attach_${item.code}`, x, y, box, box);
    if (!mountRefSliced(this.host, slot, 'Frame', MAIL_KIT.slot, 0, 0, box, box)) {
      const g = slot.addComponent(Graphics);
      g.fillColor = rgba(12, 10, 10, 240);
      g.roundRect(-box / 2, -box / 2, box, box, S(8));
      g.fill();
      g.strokeColor = rgba(196, 154, 86, 230);
      g.lineWidth = Math.max(1, S(1.5));
      g.roundRect(-box / 2, -box / 2, box, box, S(8));
      g.stroke();
    }
    const icon = resolveRewardIcon(item);
    const iconBox = box * 0.62;
    if (icon) {
      const w = icon.ratio >= 1 ? iconBox : iconBox * icon.ratio;
      const h = icon.ratio >= 1 ? iconBox / icon.ratio : iconBox;
      const art = this.host.addSprite('Icon', icon.path, 0, S(8), w, h, slot);
      if (art && claimed) {
        art.color = rgba(150, 146, 140, 255);
      }
    } else {
      const name = this.host.addChildLabel(slot, 'Name', item.name, 0, S(8), S(20), rgba(236, 222, 190, 245), new Size(box - S(16), S(56)));
      name.enableWrapText = true;
      name.overflow = Label.Overflow.SHRINK;
    }
    const count = this.host.addChildLabel(slot, 'Count', this.formatAmount(item.amount), box / 2 - S(12), -box / 2 + S(18), S(22), claimed ? rgba(196, 186, 168, 240) : rgba(255, 244, 222, 255), new Size(box - S(16), S(28)), HorizontalTextAlignment.RIGHT);
    count.isBold = true;
    this.outline(count, 1, true);
    if (claimed) {
      const veil = this.host.addChildPlainNode(slot, 'Veil', 0, 0, box - S(8), box - S(8)).addComponent(Graphics);
      veil.fillColor = rgba(0, 0, 0, 110);
      veil.roundRect(-(box - S(8)) / 2, -(box - S(8)) / 2, box - S(8), box - S(8), S(6));
      veil.fill();
    }
  }

  private formatAmount(amount: number): string {
    return amount >= 10000 ? `${Math.floor(amount / 1000)}k` : `${amount}`;
  }

  private rerenderMailIfOpen(layout: UiLayout): void {
    if (this.lastMailNodes.length === 0 || !this.lastMailNodes.every((node) => node.isValid)) {
      return;
    }
    this.lastMailNodes.forEach((node) => {
      node.removeFromParent();
      node.destroy();
    });
    this.lastMailNodes = [];
    this.renderMailPanelPhone(layout);
  }

  private addMailRow(parent: Node, mail: PlayerMailVO, x: number, y: number, width: number, height: number, scale: number, claiming: number | null): void {
    const row = this.host.addChildPlainNode(parent, `MailRow_${mail.mailId}`, x, y, width, height);
    const g = row.addComponent(Graphics);
    const unread = !mail.read;
    g.fillColor = unread ? rgba(46, 38, 22, 235) : rgba(20, 18, 18, 210);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.fill();
    g.strokeColor = unread ? rgba(230, 186, 100, 210) : rgba(110, 92, 62, 150);
    g.lineWidth = Math.max(1, 1.1 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.stroke();

    const title = this.host.addChildLabel(row, 'Title', `${unread ? '● ' : ''}${mail.title}`, -width / 2 + 16 * scale, height / 2 - 16 * scale, 18 * scale, rgba(245, 222, 160, 250), new Size(width * 0.6, 24 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.outline(title, scale, unread);
    const content = this.host.addChildLabel(row, 'Content', mail.content, -width / 2 + 16 * scale, -1 * scale, 15 * scale, rgba(215, 206, 189, 240), new Size(width * 0.62, 21 * scale), HorizontalTextAlignment.LEFT);
    content.overflow = Label.Overflow.SHRINK;
    const attachText = mail.attachments.length > 0
      ? `附件:${mail.attachments.map((item) => `${item.name}×${item.amount}`).join(' ')}`
      : '';
    const attach = this.host.addChildLabel(row, 'Attach', attachText, -width / 2 + 16 * scale, -height / 2 + 13 * scale, 16 * scale, rgba(255, 226, 150, 240), new Size(width * 0.62, 22 * scale), HorizontalTextAlignment.LEFT);
    attach.overflow = Label.Overflow.SHRINK;

    const btnW = 92 * scale;
    const btnH = 34 * scale;
    const hasAttachment = mail.attachments.length > 0;
    const claimable = hasAttachment && !mail.claimed && claiming === null;
    const btn = this.host.addChildPlainNode(row, 'Claim', width / 2 - btnW / 2 - 12 * scale, 0, btnW, btnH);
    const bg = btn.addComponent(Graphics);
    bg.fillColor = mail.claimed ? rgba(30, 28, 26, 200) : claimable ? rgba(122, 32, 26, 240) : rgba(40, 36, 30, 205);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
    bg.fill();
    bg.strokeColor = mail.claimed ? rgba(96, 86, 70, 140) : claimable ? rgba(240, 180, 90, 235) : rgba(116, 98, 70, 145);
    bg.lineWidth = Math.max(1, 1.1 * scale);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
    bg.stroke();
    const btnText = !hasAttachment ? '无附件' : mail.claimed ? '已领取' : claiming === mail.mailId ? '领取中…' : '领取';
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 16 * scale, mail.claimed || !hasAttachment ? rgba(184, 176, 164) : rgba(255, 236, 190), new Size(btnW - 8 * scale, btnH));
    label.overflow = Label.Overflow.SHRINK;
    if (claimable) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => this.host.claimLobbyMail(mail.mailId), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    }
  }

  // ── 共用小件 ──
  private mountDim(name: string, centerX: number, centerY: number, layout: UiLayout, onClose: () => void, alpha = 132): Node {
    const dim = this.host.createUiNode(name);
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const g = dim.addComponent(Graphics);
    g.fillColor = rgba(0, 0, 0, alpha);
    g.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    g.fill();
    dim.addComponent(BlockInputEvents);
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, onClose, this);
    return dim;
  }

  private addCloseButton(parent: Node, x: number, y: number, scale: number, onClose: () => void): void {
    const btn = this.host.addChildPlainNode(parent, 'CloseBtn', x, y, 40 * scale, 40 * scale);
    const label = this.host.addChildLabel(btn, 'Text', '✕', 0, 0, 22 * scale, rgba(230, 215, 190, 240), new Size(40 * scale, 40 * scale));
    this.outline(label, scale, false);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClose, this);
    this.host.applyImageButtonFeedback(btn, 1.1, 0.92);
  }

  private centerHint(parent: Node, text: string, color: Color, scale: number, y = 0): void {
    const hint = this.host.addChildLabel(parent, 'CenterHint', text, 0, y, 17 * scale, color, new Size(460 * scale, 44 * scale));
    hint.overflow = Label.Overflow.SHRINK;
  }

  private outline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 228 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
