import { Color, Graphics, HorizontalTextAlignment, Node } from 'cc';
import type { UiKitHost } from '../UiKit';
import { GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassFrame, mountGlassLine, mountGlassSlice } from '../UiGlassKit';
import type { RefDetailSourceKind } from '../UiRefKit';
import { estimateGlassTextWidth, GLASS_POPUP_DIVIDER_DY, mountGlassPopupShell } from './GlassPopupShell';
import { DAILY_THEME_OPEN_DAYS, dailyThemeOpenToday, resolveItemSourceRoutes, type ItemSourceRoute, type ItemSourceTarget } from './ItemSourceRoutes';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';

/**
 * 获取途径小窗(2026-10-25 策划审核 P1-7 / P1-8,docs/45 §6-7):卡点时告诉玩家去哪拿。
 * 2026-11-11 改 B 毛玻璃(原型 周报截图/2026-11-11_通用小窗/proto/item_source_b.png 1:1):面板宽 968,
 * 标题「获取途径 | 物品名」+ 物品概况行(图标 + 持有 / 需要 + 还差)+ 途径玻璃条(圆形线条图标 + 标题 / 说明 + 前往)。
 * 挂在内容根最上层;整页重建会清掉它(等同关闭),宿主按状态补挂。
 */
export interface ItemSourcePopupHost extends UiKitHost {
  navigateItemSource(target: ItemSourceTarget): void;
  /** 物品稀有度(背包已加载时可查),给概况行图标底边的稀有度细线;查不到返回 null。 */
  itemSourceRarityOf?(key: string): string | null;
}

export interface ItemSourcePopupOptions {
  /** 跳转表键:物品编码 / FRAGMENT:<heroCode> / GOLD / LEVEL_CAP。 */
  key: string;
  /** 标题里的物品名。 */
  name: string;
  /** 碎片用:英雄稀有度。 */
  rarity?: string;
  /** 顶部一行"持有 a / 需要 b"(都给才显示)。 */
  owned?: number;
  need?: number;
  /** 顶部一行自定义说明(等级上限等不是"持有 / 需要"的场景)。 */
  note?: string;
  /** 玩家主动关闭(点遮罩 / X / 前往)时回调;整页重建清掉节点不算关闭(宿主据此在重建后恢复小窗)。 */
  onClose?: () => void;
}

const POPUP_NAME = 'ItemSourcePopup';
const W = 968;
/** 途径条:左右各缩 43,高 97,行距 111;概况区高 156(分隔线 → 首条上沿),无概况时 22;底部留 40。 */
const ROW_INSET = 43;
const ROW_H = 97;
const ROW_PITCH = 111;
const INFO_BLOCK = 156;
/** 没有物品图标(等级上限等)时概况只有一行字:收成 96,字行中 dy = 分隔线 + 46。 */
const INFO_TEXT_BLOCK = 96;
const NO_INFO_BLOCK = 22;
const BOTTOM_PAD = 40;

/** 途径类型 → 白色线条图标(ui/glass 现成件,原型的拱门 / 钱袋 / 四芒星)。 */
const ROUTE_ICON: Record<RefDetailSourceKind, string> = {
  daily: 'ui/glass/battle_gate/spriteFrame',
  tower: 'ui/glass/class_line_warrior/spriteFrame',
  summon: 'ui/glass/codex_all/spriteFrame',
  shop: 'ui/glass/shop_rail_item/spriteFrame',
  forge: 'ui/glass/battle_pickaxe/spriteFrame',
  quest: 'ui/glass/notice_scroll/spriteFrame',
  event: 'ui/glass/profile_star/spriteFrame',
  main: 'ui/glass/battle_shield/spriteFrame',
  guard: 'ui/glass/battle_shield/spriteFrame',
  other: 'ui/glass/notice_paper/spriteFrame',
};

function routeIcon(route: ItemSourceRoute): string {
  if (route.target.type === 'shop' && route.target.kind === 'gold') {
    return 'ui/glass/shop_rail_gold/spriteFrame';
  }
  return ROUTE_ICON[route.kind] ?? ROUTE_ICON.other;
}

function itemIconOf(key: string, rarity: string): string | null {
  if (key === 'LEVEL_CAP') {
    return null;
  }
  if (key.startsWith('FRAGMENT:')) {
    return resolveBagStyleItemIconAsset(`HERO_FRAGMENT:${key.slice(9)}`, 'HERO_FRAGMENT', rarity);
  }
  return resolveBagStyleItemIconAsset(key, '', rarity);
}

/** 背包格同款稀有度细线色。 */
function rarityLineColor(rarity: string): Color {
  const key = rarity.toUpperCase();
  return key === 'UR' || key === 'SSR' ? new Color(240, 163, 52, 255)
    : key === 'SR' || key === 'EPIC' ? new Color(186, 84, 246, 255)
      : key === 'R' || key === 'RARE' ? new Color(52, 132, 242, 255) : new Color(150, 158, 170, 255);
}

export function closeItemSourcePopup(root: Node): void {
  root.getChildByName(POPUP_NAME)?.destroy();
}

export function openItemSourcePopup(host: ItemSourcePopupHost, root: Node, options: ItemSourcePopupOptions): void {
  closeItemSourcePopup(root);
  const routes = resolveItemSourceRoutes(options.key, options.rarity ?? '').slice(0, 4);
  const hasCount = options.owned !== undefined && options.need !== undefined;
  const hasInfo = !!options.note || hasCount;
  const infoRarity = options.rarity || host.itemSourceRarityOf?.(options.key) || '';
  const infoIcon = hasInfo ? itemIconOf(options.key, infoRarity) : null;
  const rowsTop = GLASS_POPUP_DIVIDER_DY + (!hasInfo ? NO_INFO_BLOCK : infoIcon ? INFO_BLOCK : INFO_TEXT_BLOCK);
  const infoDy = infoIcon ? 157 : GLASS_POPUP_DIVIDER_DY + 46;
  const H = rowsTop + Math.max(1, routes.length) * ROW_PITCH - (ROW_PITCH - ROW_H) + BOTTOM_PAD;

  let overlay: Node | null = null;
  const userClose = (): void => {
    options.onClose?.();
    overlay?.destroy();
  };
  const shell = mountGlassPopupShell(host, root, { name: POPUP_NAME, width: W, height: H, title: '获取途径', subtitle: options.name, onClose: userClose });
  overlay = shell.overlay;
  const { panel, k, S, X, Y, T } = shell;

  if (hasInfo) {
    // 概况行:图标框 (506..616) 中心 dx 110 / dy 160;文字左沿 dx 197、行中 dy 157;「还差」右沿距右缘 52
    const rarity = infoRarity;
    const icon = infoIcon;
    let textX = 53;
    if (icon) {
      const box = S(110);
      const frame = mountGlassFrame(host, panel, 'ItemFrame', X(110), Y(160), box, box, k);
      host.addSprite('ItemIcon', icon, 0, S(3), box * 0.86, box * 0.86, frame);
      if (rarity) {
        mountGlassLine(host, frame, 'Rarity', 0, -box / 2 + S(4), box - S(7), Math.max(2, S(4)), rarityLineColor(rarity));
      }
      textX = 197;
    }
    if (options.note) {
      T(panel, 'Note', options.note, X(textX), Y(infoDy), 24, GLASS_COLOR.text, S(W - textX - 52));
    } else {
      const owned = Math.max(0, Math.round(options.owned ?? 0));
      const need = Math.max(0, Math.round(options.need ?? 0));
      const lack = owned < need;
      // 三段异色首尾相接:灰「持有 」+ 数(不够珊瑚红)+ 灰「 / 需要 b」
      const parts: Array<[string, Color]> = [['持有 ', GLASS_COLOR.sub], [formatCount(owned), lack ? new Color(240, 122, 92, 255) : GLASS_COLOR.text], [` / 需要 ${formatCount(need)}`, GLASS_COLOR.sub]];
      let x = textX;
      parts.forEach(([text, color], index) => {
        const width = estimateGlassTextWidth(text, 28);
        T(panel, `Count_${index}`, text, X(x), Y(infoDy), 28, color, S(width + 24));
        x += width;
      });
      if (lack) {
        T(panel, 'Lack', `还差 ${formatCount(need - owned)} 个`, X(W - 52), Y(infoDy), 24, GLASS_COLOR.sub, S(260), HorizontalTextAlignment.RIGHT);
      }
    }
  }

  if (routes.length === 0) {
    T(panel, 'Empty', '暂无可前往的获取途径', X(W / 2), Y(rowsTop + ROW_H / 2), 24, GLASS_COLOR.sub, S(W - 120), HorizontalTextAlignment.CENTER);
    return;
  }
  const rowW = S(W - ROW_INSET * 2);
  routes.forEach((route, index) => {
    const rowDy = rowsTop + ROW_H / 2 + index * ROW_PITCH;
    const row = host.addChildPlainNode(panel, `Row_${index}`, 0, Y(rowDy), rowW, S(ROW_H));
    mountGlassSlice(host, row, 'Bg', GLASS_SLICES.panel, 0, 0, rowW, S(ROW_H), k);
    // 行内坐标:原型 dx(面板左沿起)→ 行中心原点
    const RX = (dx: number): number => S(dx - W / 2);
    // 圆形图标位:中心 dx 113,直径 70;白色线条图标 34
    // 单独子节点画(挂在 row 上会被后建的玻璃底盖住)
    const discNode = host.addChildPlainNode(row, 'Disc', RX(113), 0, S(72), S(72));
    const disc = discNode.addComponent(Graphics);
    disc.fillColor = new Color(14, 18, 24, 150);
    disc.circle(0, 0, S(35));
    disc.fill();
    disc.strokeColor = new Color(200, 206, 216, 120);
    disc.lineWidth = Math.max(1.2, S(2));
    disc.circle(0, 0, S(35));
    disc.stroke();
    // 图标素材四周留白约 20%:按 44 挂,可见本体约 34(原型)
    const iconSprite = host.addSprite('Icon', routeIcon(route), RX(113), 0, S(44), S(44), row);
    if (iconSprite) {
      iconSprite.color = new Color(236, 238, 242, 255);
    }
    // 标题左沿 dx 180:标题行中 -20(字号 26 粗),说明行中 +16.5(字号 21 灰)
    const daily = route.target.type === 'daily' ? route.target.theme : null;
    const closedToday = daily ? !dailyThemeOpenToday(daily) : false;
    const desc = closedToday && daily ? `${route.desc} · ${DAILY_THEME_OPEN_DAYS[daily].label}` : route.desc;
    const textW = S(W - 180 - 240);
    T(row, 'Title', route.title, RX(180), S(20), 26, GLASS_COLOR.text, textW, HorizontalTextAlignment.LEFT, true);
    T(row, 'Desc', desc, RX(180), -S(16.5), 21, GLASS_COLOR.sub, textW);
    // 按钮:中心距面板右缘 143,178×52
    if (closedToday) {
      // 未开放:原型是比「前往」更暗的哑光胶囊 + 灰字(mountGlassButton 的 disabled 仍是次钮底,看着和前往一样亮)
      const off = host.addChildPlainNode(row, 'Go', RX(W - 143), 0, S(178), S(52));
      mountGlassSlice(host, off, 'Pill', GLASS_SLICES.pillDisabled, 0, 0, S(178), S(52), k);
      T(off, 'Label', '未开放', 0, 0, 26, GLASS_COLOR.dim, S(150), HorizontalTextAlignment.CENTER);
      return;
    }
    const target = route.target;
    mountGlassButton(host, row, 'Go', '前往', RX(W - 143), 0, S(178), S(52), k, 'secondary', () => {
      userClose();
      host.navigateItemSource(target);
    }, 26);
  });
}

function formatCount(value: number): string {
  const n = Math.max(0, Math.round(value));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
