import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, ScrollView, Size, UITransform, Vec2, Vec3 } from 'cc';
import type { UiKitHost } from '../UiKit';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassFrame, mountGlassIconButton, mountGlassLine, mountGlassScrollBar, mountGlassSlice } from '../UiGlassKit';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { NOTICE_BANNER_ASSETS } from './LobbyTownHudProto';
import type { LobbyNoticeVO } from '../../types/LobbyNoticeTypes';

export type LobbyNoticeTab = 'notice' | 'update';

export interface LobbyNoticeDialogState {
  tab: LobbyNoticeTab;
  /** 选中的公告单号;null = 当前页签第一条。 */
  selected: string | null;
  /** 左侧列表滚动位置(重绘后还原,点下面的条目不跳回顶部)。 */
  listOffset: number;
}

export interface LobbyNoticeDialogHost extends UiKitHost {
  createUiNode(name: string): Node;
  currentLobbyNoticeDialog(): LobbyNoticeDialogState | null;
  /** 公告弹框可见的公告(已滤掉活动类)+ 读取态。 */
  lobbyNoticeDialogData(): { loading: boolean; error: string; notices: LobbyNoticeVO[] };
  isLobbyNoticeRead(noticeNo: string): boolean;
  setLobbyNoticeTab(tab: LobbyNoticeTab): void;
  selectLobbyNotice(noticeNo: string, listOffset: number): void;
  closeLobbyNoticeDialog(): void;
}

/** 公告类型 → 页签:版本 / 维护归「更新」,其余(首页 / Boss / 稀有命中)归「公告」;活动类不进弹框(有单独入口)。 */
export function noticeTabOf(noticeType: string): LobbyNoticeTab | null {
  const type = (noticeType || '').toUpperCase();
  if (type === 'ACTIVITY') {
    return null;
  }
  return type === 'VERSION' || type === 'MAINTENANCE' ? 'update' : 'notice';
}

const TYPE_LABEL: Record<string, string> = { VERSION: '版本', MAINTENANCE: '维护' };
const TYPE_ICON: Record<string, string> = { VERSION: GLASS_ICON.noticeScroll, MAINTENANCE: GLASS_ICON.noticeWrench };
const TABS: Array<{ key: LobbyNoticeTab; text: string; icon: string; x0: number; x1: number }> = [
  { key: 'notice', text: '公告', icon: GLASS_ICON.noticeMegaphone, x0: 208, x1: 409 },
  { key: 'update', text: '更新', icon: GLASS_ICON.noticePaper, x0: 422, x1: 623 },
];
const ICON_TINT = new Color(226, 206, 166, 255);
/** 选中页签图标(原型取色)。 */
const TAB_ICON_ON = new Color(250, 216, 162, 255);
const DOT = new Color(226, 52, 48, 255);

/** 估算单行文字宽度:全角字 ≈ 字号,半角 ≈ 0.56 字号。 */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of Array.from(text)) {
    width += /[　-鿿＀-￯]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return width;
}

function formatTime(value: string | null, dateOnly: boolean): string {
  if (!value) {
    return '';
  }
  const text = value.replace('T', ' ');
  return dateOnly ? text.slice(0, 10) : text.slice(0, 16);
}

/**
 * 公告弹框(11-02 用户确认原型 周报截图/2026-11-01_B风格补全/proto/notice_b2.png,布局参考用户给的截图):
 * 终端上弹出;窗口 184..1686 × 62..786;左上「公告 / 更新」页签(未读红点),右上只有 ✕(用户:弹框不要返回钮);
 * 左列公告条目(图标格 + 标题 + 日期,选中香槟描边,未读红点),右侧横幅(按页签两张底图,标题压左下)+ 类型签 / 发布时间 + 正文(可滚动)。
 * 数据走后台 /api/player/lobby/notices(已发布且在生效期内),打开时强制重拉。
 */
export class LobbyNoticeDialogRenderer {
  static readonly NODE_NAME = 'LobbyNoticeDialog';

  constructor(private readonly host: LobbyNoticeDialogHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyNoticeDialog();
    if (!state) {
      return;
    }
    const data = this.host.lobbyNoticeDialogData();
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const T = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };

    // 整屏压暗(终端留在后面),点窗口外 = 关闭
    const root = this.host.createUiNode(LobbyNoticeDialogRenderer.NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, 180);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    root.on(Node.EventType.TOUCH_END, () => this.host.closeLobbyNoticeDialog(), this);

    // 子节点按「原型坐标 → 舞台中心为原点」摆:窗口节点放在舞台中心,窗口本体偏移到原型位置
    const stage = this.host.addChildPlainNode(root, 'Stage', cx, cy, layout.stageWidth, layout.stageHeight);
    const winW = S(1686 - 184);
    const winH = S(786 - 62);
    const win = this.host.addChildPlainNode(stage, 'Window', FX((184 + 1686) / 2), FY((62 + 786) / 2), winW, winH);
    win.addComponent(BlockInputEvents);
    mountGlassSlice(this.host, win, 'GlassBase', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    mountGlassSlice(this.host, win, 'Glass', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    // 窗口内容一律挂 panel(与窗口同心、同原点 = 舞台坐标),坐标直接用 FX / FY
    const panel = this.host.addChildPlainNode(stage, 'Panel', 0, 0, layout.stageWidth, layout.stageHeight);

    const all = data.notices;
    const tabNotices = (tab: LobbyNoticeTab): LobbyNoticeVO[] => all.filter((notice) => noticeTabOf(notice.noticeType) === tab);
    const notices = tabNotices(state.tab);
    const selected = notices.find((notice) => notice.noticeNo === state.selected) ?? notices[0] ?? null;

    // 页签 y 85..143:图标 x0+65、文字左沿 x0+101;未读红点在右上角
    TABS.forEach((tab) => {
      const active = state.tab === tab.key;
      const w = S(tab.x1 - tab.x0);
      const node = this.host.addChildPlainNode(panel, `Tab_${tab.key}`, FX((tab.x0 + tab.x1) / 2), FY(114), w, S(58));
      // 选中 = 暗金渐变页签(原型),字用白色(11-02 用户);未选 = 玻璃
      mountGlassSlice(this.host, node, 'Bg', active ? GLASS_SLICES.tabGold : GLASS_SLICES.panel, 0, 0, w, S(58), k);
      const icon = this.host.addSprite('Icon', tab.icon, S(65) - w / 2, 0, S(36), S(36), node);
      if (icon) {
        icon.color = active ? TAB_ICON_ON : GLASS_COLOR.text;
      }
      T(node, 'Label', tab.text, S(101) - w / 2, 0, 25, active ? GLASS_COLOR.onGold : GLASS_COLOR.text, S(90), HorizontalTextAlignment.LEFT, active);
      if (tabNotices(tab.key).some((notice) => !this.host.isLobbyNoticeRead(notice.noticeNo))) {
        this.dot(node, w / 2 - S(14), S(58) / 2 - S(4), S(8));
      }
      if (!active) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.setLobbyNoticeTab(tab.key), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
    mountGlassIconButton(this.host, panel, 'Close', GLASS_ICON.close, FX(1622), FY(111), S(36), S(72), () => this.host.closeLobbyNoticeDialog());
    mountGlassLine(this.host, panel, 'TabLine', FX((208 + 1660) / 2), FY(158), S(1660 - 208), Math.max(1, S(1)), new Color(255, 255, 255, 22));

    if (!selected) {
      const text = data.loading ? '正在读取公告…' : data.error ? '公告暂时无法读取,请稍后重试' : '暂无公告';
      T(panel, 'Empty', text, FX(935), FY(470), 24, GLASS_COLOR.sub, S(800), HorizontalTextAlignment.CENTER);
      return;
    }
    this.renderList(panel, notices, selected, state, FX, FY, S, k, T);
    this.renderDetail(panel, selected, state.tab, FX, FY, S, T);
  }

  /** 左列 208..668 × 173..768:条目高 112、步 121;图标格 (x0+57) 83 方,标题左沿 332。 */
  private renderList(panel: Node, notices: LobbyNoticeVO[], selected: LobbyNoticeVO, state: LobbyNoticeDialogState,
    FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label): void {
    const rowW = S(668 - 208);
    const rowH = S(112);
    const step = S(121);
    const viewTop = FY(173);
    const viewBottom = FY(768);
    const viewH = viewTop - viewBottom;
    const viewW = rowW + S(8);
    const contentH = Math.max(viewH, rowH + step * (notices.length - 1));
    const viewport = this.host.addChildPlainNode(panel, 'List', FX((208 + 668) / 2), (viewTop + viewBottom) / 2, viewW, viewH);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const scroll = viewport.addComponent(ScrollView);
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    scroll.cancelInnerEvents = true;
    const baseY = (viewH - contentH) / 2;
    const content = this.host.addChildPlainNode(viewport, 'ListContent', 0, baseY, viewW, contentH);
    scroll.content = content;
    notices.forEach((notice, index) => {
      const y = contentH / 2 - rowH / 2 - index * step;
      const on = notice.noticeNo === selected.noticeNo;
      const row = this.host.addChildPlainNode(content, `Row_${index}`, 0, y, rowW, rowH);
      mountGlassSlice(this.host, row, 'Bg', on ? GLASS_SLICES.panelSel : GLASS_SLICES.panel, 0, 0, rowW, rowH, k);
      const left = -rowW / 2;
      mountGlassFrame(this.host, row, 'IconTile', left + S(57), 0, S(83), S(83), k);
      const icon = this.host.addSprite('Icon', TYPE_ICON[(notice.noticeType || '').toUpperCase()] ?? GLASS_ICON.noticeMegaphone, left + S(57), 0, S(50), S(50), row);
      if (icon) {
        icon.color = ICON_TINT;
      }
      const textW = rowW - S(124) - S(34);
      const titleText = notice.title || '公告';
      if (estimateTextWidth(titleText, S(25)) <= textW) {
        T(row, 'Title', titleText, left + S(124), S(17), 25, GLASS_COLOR.text, textW, HorizontalTextAlignment.LEFT, on);
        T(row, 'Date', formatTime(notice.publishTime ?? notice.startTime, true), left + S(124), -S(19), 20, GLASS_COLOR.sub, textW);
      } else {
        // 一行放不下(原型首条):标题折成两行、不显示日期,不再被 SHRINK 压成小字
        const title = T(row, 'Title', titleText, left + S(124), 0, 25, GLASS_COLOR.text, textW, HorizontalTextAlignment.LEFT, on);
        title.enableWrapText = true;
        title.overflow = Label.Overflow.CLAMP;
        title.lineHeight = Math.round(title.fontSize * 1.36);
        title.node.getComponent(UITransform)?.setContentSize(textW, title.lineHeight * 2 + S(4));
      }
      if (!on && !this.host.isLobbyNoticeRead(notice.noticeNo)) {
        this.dot(row, rowW / 2 - S(17), rowH / 2 - S(18), S(8));
      }
      if (!on) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.selectLobbyNotice(notice.noticeNo, scroll.getScrollOffset().y), this);
        this.host.applyImageButtonFeedback(row, 1.01, 0.99);
      }
    });
    const maxOffset = contentH - viewH;
    if (maxOffset > 1) {
      scroll.scrollToOffset(new Vec2(0, Math.min(maxOffset, Math.max(0, state.listOffset))), 0);
      const trackH = FY(178) - FY(766);
      const update = mountGlassScrollBar(this.host, panel, 'ListScrollBar', FX(693), (FY(178) + FY(766)) / 2, S(5), trackH, Math.max(S(40), trackH * (viewH / contentH)));
      const draw = (): void => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      draw();
      viewport.on(ScrollView.EventType.SCROLLING, draw, this);
    }
  }

  /** 右侧:横幅 730..1640 × 175..452(标题左沿 748、y 410);类型签 733..822 @ 489、竖线 843、时间左沿 864;正文 736 起、528..772 可滚动。 */
  private renderDetail(panel: Node, notice: LobbyNoticeVO, tab: LobbyNoticeTab,
    FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label): void {
    this.host.addSprite('Banner', tab === 'update' ? NOTICE_BANNER_ASSETS.update : NOTICE_BANNER_ASSETS.common, FX(1185), FY(313.5), S(910), S(277), panel);
    const title = T(panel, 'BannerTitle', notice.title || '公告', FX(748), FY(410), 34, GLASS_COLOR.text, S(870), HorizontalTextAlignment.LEFT, true);
    title.shadowColor = new Color(0, 0, 0, 220);
    title.shadowBlur = 6;
    title.shadowOffset.set(0, -2);

    const type = (notice.noticeType || '').toUpperCase();
    const tag = this.host.addChildPlainNode(panel, 'TypeTag', FX(777.5), FY(489), S(89), S(31));
    mountGlassSlice(this.host, tag, 'Bg', GLASS_SLICES.tagPill, 0, 0, S(89), S(31), S(1));
    T(tag, 'Text', TYPE_LABEL[type] ?? '公告', 0, 0, 20, GLASS_COLOR.sub, S(80), HorizontalTextAlignment.CENTER);
    mountGlassLine(this.host, panel, 'MetaSep', FX(843), FY(489), Math.max(1, S(2)), S(22), new Color(120, 128, 140, 200));
    const time = formatTime(notice.publishTime ?? notice.startTime, false);
    T(panel, 'Time', time ? `发布 ${time}` : '', FX(864), FY(489), 21, GLASS_COLOR.sub, S(500));

    // 正文:RESIZE_HEIGHT 排版量高,超出视口则纵向滚动 + 细滚动条
    const viewTop = FY(528);
    const viewBottom = FY(772);
    const viewH = viewTop - viewBottom;
    const viewW = S(1650 - 730);
    const textW = S(1640 - 736);
    const viewport = this.host.addChildPlainNode(panel, 'Body', FX((730 + 1650) / 2), (viewTop + viewBottom) / 2, viewW, viewH);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const scroll = viewport.addComponent(ScrollView);
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    const content = this.host.addChildPlainNode(viewport, 'BodyContent', 0, 0, viewW, viewH);
    const fontSize = Math.max(14, Math.round(S(23)));
    const body = this.host.addChildLabel(content, 'Text', notice.content || '', 0, 0, fontSize, new Color(222, 226, 234, 255), new Size(textW, fontSize + 8), HorizontalTextAlignment.LEFT);
    body.overflow = Label.Overflow.RESIZE_HEIGHT;
    body.enableWrapText = true;
    body.lineHeight = Math.round(fontSize * 1.75);
    body.enableOutline = false;
    let textH = 0;
    try {
      body.updateRenderData(true);
      textH = body.node.getComponent(UITransform)?.height ?? 0;
    } catch {
      textH = 0;
    }
    if (textH < body.lineHeight * 0.5) {
      // 个别环境取不到排版高度:按字数估算(中文约 1 字宽 = 字号)
      const perLine = Math.max(1, Math.floor(textW / fontSize));
      textH = (notice.content || '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0) * body.lineHeight;
    }
    const pad = S(6);
    const contentH = Math.max(viewH, textH + pad * 2);
    content.getComponent(UITransform)?.setContentSize(new Size(viewW, contentH));
    const baseY = (viewH - contentH) / 2;
    content.setPosition(new Vec3(0, baseY, 0));
    body.node.setPosition(new Vec3(S(736) - S(730) - viewW / 2 + textW / 2, contentH / 2 - pad - textH / 2, 0));
    scroll.content = content;
    const maxOffset = contentH - viewH;
    if (maxOffset > 1) {
      const trackH = viewH - S(8);
      const update = mountGlassScrollBar(this.host, panel, 'BodyScrollBar', FX(1662), (viewTop + viewBottom) / 2, S(5), trackH, Math.max(S(40), trackH * (viewH / contentH)));
      const draw = (): void => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      draw();
      viewport.on(ScrollView.EventType.SCROLLING, draw, this);
    }
  }

  private dot(parent: Node, x: number, y: number, r: number): void {
    const node = this.host.addChildPlainNode(parent, 'Dot', x, y, r * 2, r * 2);
    const g = node.addComponent(Graphics);
    g.fillColor = DOT;
    g.circle(0, 0, r);
    g.fill();
  }
}
