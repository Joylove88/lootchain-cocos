import { BlockInputEvents, Button, Color, EventTouch, Graphics, HorizontalTextAlignment, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { WorldMapCode, WorldStateVO } from '../../types/WorldTypes';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { GLASS_COLOR, GLASS_ICON, GLASS_SLICES, glassLabel, glassProtoMap, mountGlassButton, mountGlassIconButton, mountGlassLine, mountGlassPanel, mountGlassSectionHeader, mountGlassSlice } from '../UiGlassKit';
import { WORLD1_POINTS, WORLD_TABS, type WorldMapPanelState } from './LobbyWorldOverlayRenderer';
import type { TownAreaMapInfo } from './LobbyTownRenderer';
import type { PathPoint } from './LobbyTownPathfinder';
import { townCoordText } from './LobbyTownPathfinder';
import { worldAsset } from './LobbyWorldMaps';

/** 地图页图标(tools/qa/map_icons_extract.py 从原型抠出)+ 各图鸟瞰底图(tools/qa/map_overview_capture.py 实机截出)。 */
const MAP_ICON = {
  quest: worldAsset('mapui/map_quest'),
  pin: worldAsset('mapui/map_pin'),
  portal: worldAsset('mapui/map_portal'),
  paw: worldAsset('mapui/map_paw'),
  tent: worldAsset('mapui/map_tent'),
  tree: worldAsset('mapui/map_tree'),
  skull: worldAsset('mapui/map_skull'),
  chest: worldAsset('mapui/map_chest'),
};
const PLACE_ICON: Record<string, string> = {
  portal: MAP_ICON.portal, den: MAP_ICON.paw, cave: MAP_ICON.paw, camp: MAP_ICON.tent, ruins: MAP_ICON.tree, npc: MAP_ICON.pin, place: MAP_ICON.pin,
};
export const AREA_MAP_OVERVIEW: Partial<Record<WorldMapCode, string>> = {
  VILLAGE: worldAsset('overview/ov_village'),
  WOODS: worldAsset('overview/ov_woods'),
};
export const AREA_MAP_ASSET_PATHS: readonly string[] = [...Object.values(MAP_ICON), ...Object.values(AREA_MAP_OVERVIEW) as string[]];
const CHAMPAGNE = GLASS_COLOR.champagne;
/** 世界单位 → 「米」(地图页距离显示)。 */
const UNITS_PER_METER = 50;

export interface LobbyAreaMapHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): import('cc').Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  currentWorldState(): WorldStateVO | null;
  currentWorldMapCode(): WorldMapCode;
  currentWorldMapPanel(): WorldMapPanelState | null;
  currentAreaMapInfo(): TownAreaMapInfo | null;
  previewAreaPath(x: number, y: number): PathPoint[] | null;
  setWorldMapView(view: 'area' | 'world'): void;
  setAreaMapDest(dest: { x: number; y: number; label: string } | null): void;
  startAreaAutoWalk(x: number, y: number): void;
  closeWorldMapPanel(): void;
  selectWorldMapPoint(code: string | null): void;
  teleportWorldMap(code: WorldMapCode): void;
  worldTeleportNote?(): string;
}

/**
 * 地图页(2026-10-30 用户:点小地图显示鸟瞰图,可切世界地图;标 NPC / 任务坐标,点击自动寻路;原型 周报截图/2026-10-30_地图鸟瞰/proto_map_b,
 * 用户确认沿用冷色 B 风格)。坐标全按原型 1870×841 像素映射(glassProtoMap)。
 */
export class LobbyAreaMapRenderer {
  static readonly NODE = 'LobbyWorldMapOverlay';

  /** 鸟瞰框可见半宽 / 半高(cover 后地图比框大):标签贴边时翻到左侧 / 不出框。 */
  private visHalfW = 0;

  constructor(private readonly host: LobbyAreaMapHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentWorldMapPanel();
    if (!state) {
      return;
    }
    const W = layout.width;
    const H = layout.height;
    const overlay = this.host.createUiNode(LobbyAreaMapRenderer.NODE);
    overlay.setPosition(new Vec3((layout.stageLeft + layout.stageRight) / 2, (layout.stageTop + layout.stageBottom) / 2, 0));
    overlay.addComponent(UITransform).setContentSize(new Size(W, H));
    overlay.addComponent(BlockInputEvents);
    const dim = overlay.addComponent(Graphics);
    // 盖住大厅 HUD(半透明时右上按钮 / 底部血条会透出来)
    dim.fillColor = rgba(6, 8, 12, 252);
    dim.rect(-W / 2, -H / 2, W, H);
    dim.fill();
    // 内容按舞台宽高(避开刘海安全区)排版
    const stage = this.host.addChildPlainNode(overlay, 'Stage', 0, 0, layout.stageWidth, layout.stageHeight);
    const P = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const view = state.view ?? 'world';
    const info = this.host.currentAreaMapInfo();
    this.renderTopBar(stage, P, view, info);
    if (view === 'area' && info) {
      this.renderArea(stage, P, state, info);
    } else {
      this.renderWorld(stage, P, state);
    }
  }

  // ── 顶栏 ──

  private renderTopBar(parent: Node, P: ReturnType<typeof glassProtoMap>, view: 'area' | 'world', info: TownAreaMapInfo | null): void {
    const { LX, RX, FX, FY, S, k } = P;
    mountGlassIconButton(this.host, parent, 'MapBack', GLASS_ICON.back, LX(68), FY(44), S(34), S(72), () => this.host.closeWorldMapPanel());
    glassLabel(this.host, parent, 'MapTitle', '地图', LX(115), FY(44), S(34), GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT, true);
    // 分段页签:当前图 | 世界地图
    const segW = S(465);
    const segH = S(52);
    const seg = this.host.addChildPlainNode(parent, 'MapSeg', FX(935), FY(45), segW, segH);
    mountGlassSlice(this.host, seg, 'Track', GLASS_SLICES.chip, 0, 0, segW, segH, k);
    const tabs: Array<{ key: 'area' | 'world'; text: string }> = [
      { key: 'area', text: info?.name ?? '当前地图' },
      { key: 'world', text: '世界地图' },
    ];
    tabs.forEach((tab, index) => {
      const on = tab.key === view;
      const tw = S(235);
      const x = (index === 0 ? -1 : 1) * (segW / 2 - tw / 2 - S(2));
      const node = this.host.addChildPlainNode(seg, `Tab_${tab.key}`, x, 0, tw, segH - S(4));
      if (on) {
        mountGlassSlice(this.host, node, 'Pill', GLASS_SLICES.pillPrimary, 0, 0, tw, segH - S(4), k);
      }
      glassLabel(this.host, node, 'Label', tab.text, 0, 0, S(22), on ? GLASS_COLOR.onChampagne : GLASS_COLOR.text, tw - S(20), HorizontalTextAlignment.CENTER, on);
      if (!on && (tab.key === 'world' || info)) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.setWorldMapView(tab.key));
        this.host.applyImageButtonFeedback(node, 1.02, 0.98);
      }
    });
    // 坐标胶囊(只在本图页)
    if (view === 'area' && info?.leader) {
      const chipW = S(215);
      const chip = this.host.addChildPlainNode(parent, 'MapCoord', RX(1602), FY(45), chipW, S(44));
      mountGlassSlice(this.host, chip, 'Bg', GLASS_SLICES.chip, 0, 0, chipW, S(44), k);
      const pin = this.host.addSprite('Pin', MAP_ICON.pin, -chipW / 2 + S(29), 0, S(22), S(22), chip);
      if (pin) {
        pin.color = new Color(214, 218, 226, 255);
      }
      glassLabel(this.host, chip, 'Text', `坐标  ${townCoordText(info.leader.x, info.leader.y, info.width, info.height)}`, -chipW / 2 + S(55), 0, S(20), GLASS_COLOR.sub, chipW - S(64), HorizontalTextAlignment.LEFT);
    }
    const divider = this.host.addSprite('MapDivider', GLASS_ICON.divider, RX(1745), FY(44), S(36), S(2), parent);
    if (divider) {
      divider.node.angle = 90;
    }
    mountGlassIconButton(this.host, parent, 'MapClose', GLASS_ICON.close, RX(1800), FY(43), S(36), S(72), () => this.host.closeWorldMapPanel());
  }

  // ── 本图鸟瞰 ──

  private renderArea(parent: Node, P: ReturnType<typeof glassProtoMap>, state: WorldMapPanelState, info: TownAreaMapInfo): void {
    const { LX, RX, FX, FY, S, k } = P;
    const frameW = S(1333);
    const frameH = S(693);
    const frame = mountGlassPanel(this.host, parent, 'MapFrame', FX(711.5), FY(438.5), frameW, frameH, k);
    const innerW = frameW - S(8);
    const innerH = frameH - S(8);
    const clip = this.host.addChildPlainNode(frame, 'Clip', 0, 0, innerW, innerH);
    clip.addComponent(Mask);
    // cover 铺满:地图比框略宽,左右各裁一点(边缘是密林)
    const aspect = info.width / info.height;
    const dispW = Math.max(innerW, innerH * aspect);
    const dispH = dispW / aspect;
    const sc = dispW / info.width;
    this.visHalfW = innerW / 2;
    const map = this.host.addChildPlainNode(clip, 'Map', 0, 0, dispW, dispH);
    const overview = AREA_MAP_OVERVIEW[info.mapCode];
    if (!overview || !this.host.addSprite('Img', overview, 0, 0, dispW, dispH, map)) {
      const g = map.addComponent(Graphics);
      g.fillColor = rgba(34, 40, 32, 255);
      g.rect(-dispW / 2, -dispH / 2, dispW, dispH);
      g.fill();
    }
    // 边缘压暗一圈
    const vig = this.host.addChildPlainNode(clip, 'Vignette', 0, 0, innerW, innerH).addComponent(Graphics);
    for (let i = 0; i < 10; i += 1) {
      const inset = S(4) * i;
      vig.strokeColor = rgba(6, 8, 12, 26);
      vig.lineWidth = S(5);
      vig.rect(-innerW / 2 + inset, -innerH / 2 + inset, innerW - inset * 2, innerH - inset * 2);
      vig.stroke();
    }
    const at = (x: number, y: number): { x: number; y: number } => ({ x: x * sc, y: y * sc });
    const marks = this.host.addChildPlainNode(map, 'Marks', 0, 0, dispW, dispH);
    // 点地图设置目的地(触点 → 地图坐标)
    map.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      const loc = event.getUILocation();
      const local = map.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      const dest = { x: Math.round(local.x / sc), y: Math.round(local.y / sc), label: '地图标记' };
      this.host.setAreaMapDest(dest);
    });
    // 路线预览(目的地优先,没有就指向任务目标)
    const target = state.dest ?? (info.quest ? { x: info.quest.x, y: info.quest.y, label: info.quest.label } : null);
    const path = target ? this.host.previewAreaPath(target.x, target.y) : null;
    if (path && path.length > 1) {
      const dots = this.host.addChildPlainNode(marks, 'Path', 0, 0, dispW, dispH).addComponent(Graphics);
      dots.fillColor = rgba(CHAMPAGNE.r, CHAMPAGNE.g, CHAMPAGNE.b, 235);
      const gap = S(13);
      let carry = 0;
      for (let i = 0; i + 1 < path.length; i += 1) {
        const a = at(path[i].x, path[i].y);
        const b = at(path[i + 1].x, path[i + 1].y);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = carry; d < len; d += gap) {
          dots.circle(a.x + (b.x - a.x) * (d / len), a.y + (b.y - a.y) * (d / len), S(2.6));
        }
        carry = (carry + Math.ceil((len - carry) / gap) * gap) - len;
      }
      dots.fill();
    }
    // 怪群 / 精英 / 首领
    for (const camp of info.camps) {
      const p = at(camp.x, camp.y);
      if (camp.kind === 'boss') {
        this.markerChip(marks, `Boss_${camp.label}`, p.x, p.y, camp.label, MAP_ICON.skull, S, k, true);
        continue;
      }
      const g = this.host.addChildPlainNode(marks, `Camp_${camp.label}`, p.x, p.y, S(24), S(24)).addComponent(Graphics);
      const r = camp.kind === 'elite' ? S(8) : S(6);
      g.fillColor = rgba(20, 8, 6, 220);
      g.circle(0, 0, r + S(2));
      g.fill();
      g.fillColor = camp.kind === 'elite' ? rgba(236, 140, 52, 255) : rgba(222, 44, 40, 255);
      g.circle(0, 0, r);
      g.fill();
    }
    for (const chest of info.chests) {
      const p = at(chest.x, chest.y);
      const icon = this.host.addSprite(`Chest_${chest.label}_${Math.round(chest.x)}`, MAP_ICON.chest, p.x, p.y, S(30), S(28), marks);
      if (icon && chest.opened) {
        icon.grayscale = true;
        icon.node.addComponent(UIOpacity).opacity = 160;
      }
    }
    // 传送阵(地点里是 portal 的名字优先)
    const portalPlace = info.places.find((place) => place.icon === 'portal');
    const wp = at(info.waypoint.x, info.waypoint.y);
    this.markerChip(marks, 'Waypoint', wp.x, wp.y, portalPlace ? `${portalPlace.name}(传送阵)` : '传送阵', MAP_ICON.portal, S, k, false, !info.waypoint.activated);
    // 地点 / NPC / 出口
    for (const place of info.places) {
      if (place.icon === 'portal') {
        continue;
      }
      const p = at(place.x, place.y);
      this.markerChip(marks, `Place_${place.name}`, p.x, p.y, place.name, PLACE_ICON[place.icon] ?? MAP_ICON.pin, S, k, false);
    }
    for (const npc of info.npcs) {
      const p = at(npc.x, npc.y);
      this.dotChip(marks, `Npc_${npc.label}`, p.x, p.y, npc.label, S, k);
    }
    for (const exit of info.exits) {
      const p = at(exit.x, exit.y);
      this.dotChip(marks, `Exit_${exit.label}`, p.x, p.y, exit.label, S, k);
    }
    if (info.quest) {
      const p = at(info.quest.x, info.quest.y);
      this.markerChip(marks, 'Quest', p.x, p.y, `任务:${info.quest.label}`, MAP_ICON.quest, S, k, true);
    }
    if (state.dest) {
      const p = at(state.dest.x, state.dest.y);
      const pin = this.host.addSprite('Dest', MAP_ICON.pin, p.x, p.y + S(16), S(32), S(32), marks);
      if (pin) {
        pin.color = CHAMPAGNE;
      }
    }
    if (info.leader) {
      const p = at(info.leader.x, info.leader.y);
      const me = this.host.addChildPlainNode(marks, 'Me', p.x, p.y, S(60), S(60));
      const g = me.addComponent(Graphics);
      g.fillColor = rgba(CHAMPAGNE.r, CHAMPAGNE.g, CHAMPAGNE.b, 46);
      g.circle(0, 0, S(24));
      g.fill();
      g.strokeColor = rgba(CHAMPAGNE.r, CHAMPAGNE.g, CHAMPAGNE.b, 150);
      g.lineWidth = Math.max(1, S(2));
      g.circle(0, 0, S(24));
      g.stroke();
      g.fillColor = CHAMPAGNE;
      g.moveTo(0, S(20));
      g.lineTo(S(14), -S(14));
      g.lineTo(0, -S(6));
      g.lineTo(-S(14), -S(14));
      g.close();
      g.fill();
      this.textChip(marks, 'MeLabel', p.x, p.y + S(42), '你', S, k);
    }
    // 图例
    const legend = this.host.addChildPlainNode(frame, 'Legend', LX(389) - FX(711.5), FY(751) - FY(438.5), S(662), S(48));
    mountGlassSlice(this.host, legend, 'Bg', GLASS_SLICES.hudCapsule, 0, 0, S(662), S(48), S(48) / 48);
    const items: Array<{ text: string; icon?: string; dot?: Color }> = [
      { text: 'NPC', dot: new Color(240, 240, 240, 255) },
      { text: '任务', icon: MAP_ICON.quest },
      { text: '怪物', dot: new Color(222, 44, 40, 255) },
      { text: '首领', icon: MAP_ICON.skull },
      { text: '宝箱', icon: MAP_ICON.chest },
      { text: '传送阵', icon: MAP_ICON.portal },
    ];
    const lx0 = [93, 199, 302, 407, 512, 620];
    items.forEach((item, index) => {
      const x = LX(lx0[index]) - LX(389);
      if (item.icon) {
        this.host.addSprite(`LgIcon_${index}`, item.icon, x, 0, S(26), S(26), legend);
      } else if (item.dot) {
        const g = this.host.addChildPlainNode(legend, `LgDot_${index}`, x, 0, S(16), S(16)).addComponent(Graphics);
        g.fillColor = item.dot;
        g.circle(0, 0, S(7));
        g.fill();
      }
      glassLabel(this.host, legend, `Lg_${index}`, item.text, x + S(21), 0, S(18), GLASS_COLOR.text, S(70), HorizontalTextAlignment.LEFT);
    });
    this.renderAreaSide(parent, P, state, info, target);
    glassLabel(this.host, parent, 'MapHint', '点击地图任意位置设置目的地 · 移动摇杆取消寻路', FX(935), FY(813), S(19), GLASS_COLOR.sub, S(900), HorizontalTextAlignment.CENTER);
    void RX;
  }

  private renderAreaSide(parent: Node, P: ReturnType<typeof glassProtoMap>, state: WorldMapPanelState, info: TownAreaMapInfo,
    target: { x: number; y: number; label: string } | null): void {
    const { LX, RX, FX, FY, S, k } = P;
    mountGlassPanel(this.host, parent, 'MapSide', FX(1613.5), FY(438.5), S(433), S(693), k);
    const leader = info.leader;
    const meters = (x: number, y: number): string => (leader ? `约 ${Math.max(1, Math.round(Math.hypot(x - leader.x, y - leader.y) / UNITS_PER_METER))} 米` : '');
    if (state.dest) {
      mountGlassSectionHeader(this.host, parent, 'MapGoal', '目的地', LX(1418), FY(125), k);
      this.host.addSprite('GoalIcon', MAP_ICON.pin, LX(1444), FY(180), S(36), S(36), parent);
      glassLabel(this.host, parent, 'GoalName', state.dest.label, LX(1482), FY(177), S(26), GLASS_COLOR.text, S(320), HorizontalTextAlignment.LEFT, true);
      glassLabel(this.host, parent, 'GoalDesc', `坐标 ${townCoordText(state.dest.x, state.dest.y, info.width, info.height)}`, LX(1482), FY(217), S(21), GLASS_COLOR.sub, S(320), HorizontalTextAlignment.LEFT);
      glassLabel(this.host, parent, 'GoalDist', meters(state.dest.x, state.dest.y), LX(1482), FY(255), S(21), GLASS_COLOR.sub, S(320), HorizontalTextAlignment.LEFT);
    } else {
      mountGlassSectionHeader(this.host, parent, 'MapGoal', '当前目标', LX(1418), FY(125), k);
      if (info.quest) {
        this.host.addSprite('GoalIcon', MAP_ICON.quest, LX(1444), FY(180), S(40), S(40), parent);
        glassLabel(this.host, parent, 'GoalName', info.quest.name, LX(1482), FY(177), S(26), GLASS_COLOR.text, S(320), HorizontalTextAlignment.LEFT, true);
        glassLabel(this.host, parent, 'GoalDesc', info.quest.desc, LX(1482), FY(217), S(21), GLASS_COLOR.sub, S(320), HorizontalTextAlignment.LEFT);
        glassLabel(this.host, parent, 'GoalDist', meters(info.quest.x, info.quest.y), LX(1482), FY(255), S(21), GLASS_COLOR.sub, S(320), HorizontalTextAlignment.LEFT);
      } else {
        glassLabel(this.host, parent, 'GoalNone', '暂无本图任务 · 点击地图设置目的地', LX(1430), FY(190), S(21), GLASS_COLOR.sub, S(380), HorizontalTextAlignment.LEFT);
      }
    }
    mountGlassButton(this.host, parent, 'MapAutoWalk', '自动寻路', FX(1613), FY(312), S(380), S(56), k, target ? 'primary' : 'primaryOff',
      target ? () => this.host.startAreaAutoWalk(target.x, target.y) : undefined, 24);
    const portal = info.places.find((place) => place.icon === 'portal');
    const tpText = info.waypoint.activated ? `传送 · ${portal?.name ?? '传送阵'}` : '传送阵未激活';
    mountGlassButton(this.host, parent, 'MapTeleport', tpText, FX(1613), FY(381), S(380), S(56), k, info.waypoint.activated ? 'secondary' : 'disabled',
      info.waypoint.activated ? () => this.host.teleportWorldMap(info.mapCode) : undefined, 22);
    mountGlassLine(this.host, parent, 'MapSideSep', FX(1613), FY(438), S(390), Math.max(1, S(1.5)), new Color(255, 255, 255, 30));
    mountGlassSectionHeader(this.host, parent, 'MapPlaces', '地点', LX(1418), FY(474), k);
    const places = info.places
      .map((place) => ({ ...place, d: leader ? Math.hypot(place.x - leader.x, place.y - leader.y) : 0 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    const rowYs = [533, 598, 666, 733];
    places.forEach((place, index) => {
      const row = this.host.addChildPlainNode(parent, `MapPlace_${index}`, FX(1613), FY(rowYs[index]), S(390), S(58));
      mountGlassSlice(this.host, row, 'Bg', GLASS_SLICES.row, 0, 0, S(390), S(58), k);
      this.host.addSprite('Icon', PLACE_ICON[place.icon] ?? MAP_ICON.pin, LX(1453) - FX(1613), 0, S(34), S(34), row);
      glassLabel(this.host, row, 'Name', place.name, LX(1500) - FX(1613), 0, S(21), GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT);
      glassLabel(this.host, row, 'Dist', leader ? `${Math.max(1, Math.round(place.d / UNITS_PER_METER))} 米` : '', RX(1760) - FX(1613), 0, S(20), GLASS_COLOR.sub, S(120), HorizontalTextAlignment.RIGHT);
      this.host.addSprite('Chevron', GLASS_ICON.chevron, RX(1786) - FX(1613), 0, S(16), S(16), row);
      row.addComponent(Button);
      row.on(Button.EventType.CLICK, () => this.host.setAreaMapDest({ x: place.x, y: place.y, label: place.name }));
      this.host.applyImageButtonFeedback(row, 1.02, 0.98);
    });
  }

  /** 地图上的「图标 + 名字」胶囊(首领 / 任务 / 地点 / 传送阵);dim = 未激活压灰。 */
  private markerChip(parent: Node, name: string, x: number, y: number, text: string, icon: string, S: (v: number) => number, k: number, strong: boolean, dim = false): void {
    const iconSize = strong ? S(40) : S(32);
    const holder = this.host.addChildPlainNode(parent, name, x, y, iconSize, iconSize);
    const sprite = this.host.addSprite('Icon', icon, 0, 0, iconSize, iconSize, holder);
    if (sprite && dim) {
      sprite.grayscale = true;
    }
    const w = this.chipWidth(text, S);
    const right = x + iconSize / 2 + w / 2 + S(2);
    this.textChip(parent, `${name}Label`, this.visHalfW > 0 && right + w / 2 > this.visHalfW - S(6) ? x - iconSize / 2 - w / 2 - S(2) : right, y, text, S, k);
  }

  /** 白点 + 名字(NPC / 出口)。 */
  private dotChip(parent: Node, name: string, x: number, y: number, text: string, S: (v: number) => number, k: number): void {
    const g = this.host.addChildPlainNode(parent, name, x, y, S(20), S(20)).addComponent(Graphics);
    g.fillColor = rgba(10, 12, 16, 220);
    g.circle(0, 0, S(9));
    g.fill();
    g.fillColor = rgba(244, 244, 244, 255);
    g.circle(0, 0, S(6));
    g.fill();
    // NPC / 出口:名字放在点的正上方(出口常贴着传送阵,放右边会和传送阵标签叠)
    this.textChip(parent, `${name}Label`, x, y + S(26), text, S, k);
  }

  private chipWidth(text: string, S: (v: number) => number): number {
    let w = 0;
    for (const ch of Array.from(text)) {
      w += /[　-鿿＀-￯]/.test(ch) ? S(18) : S(10);
    }
    return w + S(28);
  }

  private textChip(parent: Node, name: string, x: number, y: number, text: string, S: (v: number) => number, k: number): void {
    const w = this.chipWidth(text, S);
    const h = S(34);
    // 不出鸟瞰框(地图坐标 = 框坐标,cover 居中)
    if (this.visHalfW > 0) {
      x = Math.max(-this.visHalfW + w / 2 + S(6), Math.min(this.visHalfW - w / 2 - S(6), x));
    }
    const node = this.host.addChildPlainNode(parent, name, x, y, w, h);
    mountGlassSlice(this.host, node, 'Bg', GLASS_SLICES.hudCapsule, 0, 0, w, h, h / 48);
    glassLabel(this.host, node, 'Text', text, 0, 0, S(18), GLASS_COLOR.text, w - S(16), HorizontalTextAlignment.CENTER);
    void k;
  }

  // ── 世界地图 ──

  private renderWorld(parent: Node, P: ReturnType<typeof glassProtoMap>, state: WorldMapPanelState): void {
    const { LX, FX, FY, S, k } = P;
    const world = this.host.currentWorldState();
    const current = this.host.currentWorldMapCode();
    const frameW = S(1333);
    const frameH = S(693);
    const frame = mountGlassPanel(this.host, parent, 'MapFrame', FX(711.5), FY(438.5), frameW, frameH, k);
    const innerW = frameW - S(8);
    const innerH = frameH - S(8);
    const clip = this.host.addChildPlainNode(frame, 'Clip', 0, 0, innerW, innerH);
    clip.addComponent(Mask);
    const aspect = 2400 / 1079;
    const dispW = Math.max(innerW, innerH * aspect);
    const dispH = dispW / aspect;
    const map = this.host.addChildPlainNode(clip, 'Map', 0, 0, dispW, dispH);
    this.host.addSprite('Img', WORLD_TABS[0].image, 0, 0, dispW, dispH, map);
    map.addComponent(Button);
    map.on(Button.EventType.CLICK, () => this.host.selectWorldMapPoint(null));
    const status = (code: string, future?: number): { unlocked: boolean; activated: boolean; reason: string } => {
      if (future) {
        return { unlocked: false, activated: false, reason: `Lv.${future} 开放` };
      }
      const m = world?.maps.find((item) => item.mapCode === code);
      return { unlocked: !!m?.unlocked, activated: !!m?.activated, reason: m?.lockReason || (m ? '' : '未开放') };
    };
    for (const point of WORLD1_POINTS) {
      const st = status(point.code, point.future);
      const x = -dispW / 2 + point.x * dispW;
      const y = dispH / 2 - point.y * dispH;
      const node = this.host.addChildPlainNode(map, `Point_${point.code}`, x, y, S(60), S(60));
      if (state.selected === point.code) {
        const ring = node.addComponent(Graphics);
        ring.strokeColor = CHAMPAGNE;
        ring.lineWidth = Math.max(1.5, S(3));
        ring.circle(0, 0, S(26));
        ring.stroke();
      }
      const icon = this.host.addSprite('Icon', MAP_ICON.portal, 0, 0, S(40), S(40), node);
      if (icon && !st.activated) {
        icon.grayscale = true;
        icon.node.addComponent(UIOpacity).opacity = st.unlocked ? 200 : 110;
      }
      const label = point.code === current ? `${point.name} · 你在这里` : point.name;
      this.textChip(map, `Point_${point.code}Label`, x, y - S(36), label, S, k);
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.host.selectWorldMapPoint(point.code));
      this.host.applyImageButtonFeedback(node, 1.06, 0.96);
    }
    // 右栏:选中地图详情 + 已激活传送阵列表
    mountGlassPanel(this.host, parent, 'MapSide', FX(1613.5), FY(438.5), S(433), S(693), k);
    const selected = WORLD1_POINTS.find((point) => point.code === state.selected) ?? WORLD1_POINTS.find((point) => point.code === current) ?? null;
    mountGlassSectionHeader(this.host, parent, 'WorldSel', selected ? selected.name : '世界地图', LX(1418), FY(125), k);
    if (selected) {
      const st = status(selected.code, selected.future);
      const isCurrent = selected.code === current;
      const sub = isCurrent ? '当前所在' : !st.unlocked ? st.reason || '未开放' : st.activated ? (selected.level || '安全区') : '传送阵未激活 · 需亲自前往';
      glassLabel(this.host, parent, 'WorldSelSub', sub, LX(1430), FY(177), S(21), GLASS_COLOR.sub, S(380), HorizontalTextAlignment.LEFT);
      const quest = world?.quests.find((item) => item.map === selected.code && (item.state === 'ACCEPTED' || item.state === 'AVAILABLE'));
      if (quest) {
        this.host.addSprite('WorldQuestIcon', MAP_ICON.quest, LX(1444), FY(222), S(30), S(30), parent);
        glassLabel(this.host, parent, 'WorldQuest', `任务「${quest.name}」在此`, LX(1470), FY(222), S(20), GLASS_COLOR.text, S(340), HorizontalTextAlignment.LEFT);
      }
      const canGo = st.unlocked && st.activated && !isCurrent;
      mountGlassButton(this.host, parent, 'WorldGo', isCurrent ? '当前所在' : canGo ? '传送' : '无法传送', FX(1613), FY(312), S(380), S(56), k,
        canGo ? 'primary' : 'primaryOff', canGo ? () => this.host.teleportWorldMap(selected.code as WorldMapCode) : undefined, 24);
      glassLabel(this.host, parent, 'WorldNote', canGo ? (this.host.worldTeleportNote?.() ?? '') : '', FX(1613), FY(360), S(18), GLASS_COLOR.sub, S(390), HorizontalTextAlignment.CENTER);
    }
    mountGlassLine(this.host, parent, 'MapSideSep', FX(1613), FY(438), S(390), Math.max(1, S(1.5)), new Color(255, 255, 255, 30));
    mountGlassSectionHeader(this.host, parent, 'WorldList', '已激活传送阵', LX(1418), FY(474), k);
    const activated = WORLD1_POINTS.filter((point) => status(point.code, point.future).activated).slice(0, 4);
    const rowYs = [533, 598, 666, 733];
    activated.forEach((point, index) => {
      const row = this.host.addChildPlainNode(parent, `WorldRow_${index}`, FX(1613), FY(rowYs[index]), S(390), S(58));
      mountGlassSlice(this.host, row, 'Bg', state.selected === point.code ? GLASS_SLICES.panelSel : GLASS_SLICES.row, 0, 0, S(390), S(58), k);
      this.host.addSprite('Icon', MAP_ICON.portal, LX(1453) - FX(1613), 0, S(34), S(34), row);
      glassLabel(this.host, row, 'Name', point.name, LX(1500) - FX(1613), 0, S(21), GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT);
      glassLabel(this.host, row, 'Level', point.code === current ? '当前' : point.level, LX(1760) - FX(1613), 0, S(19), GLASS_COLOR.sub, S(140), HorizontalTextAlignment.RIGHT);
      row.addComponent(Button);
      row.on(Button.EventType.CLICK, () => this.host.selectWorldMapPoint(point.code));
      this.host.applyImageButtonFeedback(row, 1.02, 0.98);
    });
    glassLabel(this.host, parent, 'MapHint', '只能传送到已激活的传送阵 · 新地图需亲自前往并靠近传送阵激活', FX(935), FY(813), S(19), GLASS_COLOR.sub, S(1000), HorizontalTextAlignment.CENTER);
  }
}
