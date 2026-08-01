import {
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  Size,
  Sprite,
  Tween,
  UITransform,
  Vec3,
  tween,
} from 'cc';
import type { LobbyAdventureChapterVO, LobbyAdventureStageVO } from '../../types/LobbyAdventureTypes';
import { safeText } from '../UiTextFormatter';
import { rgba } from './LobbyHudTypes';

// Stage 13A 关卡地图渲染器：把冒险地图从旧正弦波节点升级为虚线路径 + 关卡节点 + Boss 节点 + 章节标题。
// 该渲染器只负责表现层，不保存主线进度，不创建战斗，不扣体力，不发放奖励。

export interface BattleStageMapHost {
  createUiNode(name: string): Node;
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
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  selectStage(stageCode: string): void;
  previewLockedStage(stageCode: string): void;
}

interface MapNodePosition {
  x: number;
  y: number;
  stage: LobbyAdventureStageVO;
  index: number;
  boss: boolean;
}

const STAGE_NODE_BOSS_ASSET = 'ui/adventure/c1812/stage_node_boss/spriteFrame';
const STAGE_NODE_CLEAR_ASSET = 'ui/adventure/c1812/stage_node_clear/spriteFrame';
const STAGE_NODE_ASSET = 'ui/adventure/c1812/stage_node/spriteFrame';
const STAGE_NODE_LOCK_ASSET = 'ui/common/c1812/icon_lock/spriteFrame';
// P2 AI 素材:地图底图(1536×1024)与四态圆徽章节点(1024×1536,圆徽居中、下方留投影)。
const ADVENTURE_AI_MAP_BG_ASSET = 'ui/adventure/ai/adventure_map_bg/spriteFrame';
const ADVENTURE_AI_NODE_NORMAL_ASSET = 'ui/adventure/ai/node_normal/spriteFrame';
const ADVENTURE_AI_NODE_CLEAR_ASSET = 'ui/adventure/ai/node_clear/spriteFrame';
const ADVENTURE_AI_NODE_LOCKED_ASSET = 'ui/adventure/ai/node_locked/spriteFrame';
const ADVENTURE_AI_NODE_BOSS_ASSET = 'ui/adventure/ai/node_boss/spriteFrame';
const ADVENTURE_AI_NODE_MARKER_ASSET = 'ui/adventure/ai/node_marker/spriteFrame';
const ADVENTURE_AI_MAP_BG_WIDTH = 1536;
const ADVENTURE_AI_MAP_BG_HEIGHT = 1024;
// 熔岩主路锚点(底图归一化坐标,v 从图顶向下),按底图像素测量:主路从左下 (0.30,0.91) 蜿蜒到右上 (0.81,0.18)。
// 关卡节点按弧长在这条折线上均匀分布(第 1 关在底部,末关/Boss 在顶部),与实景道路走向一致。
const ADVENTURE_MAP_ROAD_ANCHORS: Array<[number, number]> = [
  [0.30, 0.91],
  [0.40, 0.82],
  [0.45, 0.80],
  [0.50, 0.76],
  [0.63, 0.66],
  [0.40, 0.52],
  [0.48, 0.47],
  [0.55, 0.45],
  [0.53, 0.36],
  [0.63, 0.31],
  [0.75, 0.24],
  [0.81, 0.18],
];

/** 关卡地图渲染器：虚线路径 + 关卡节点(已通关/当前/锁定/Boss) + 顶部章节标题。 */
export class BattleStageMapRenderer {
  constructor(private readonly host: BattleStageMapHost) {}

  render(parent: Node, chapters: LobbyAdventureChapterVO[], width: number, height: number, scale: number, selectedStageCode: string, activeChapter: LobbyAdventureChapterVO | null): void {
    const map = this.host.addChildPlainNode(parent, 'BattleStageMap', 0, 0, width, height);
    const graphics = map.addComponent(Graphics);
    // 暗色地图底板，比旧正弦波更有横版地图质感。
    graphics.fillColor = rgba(4, 5, 7, 176);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(137, 100, 50, 136);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();

    // AI 实景地图底图:等比 cover + 矩形遮罩裁掉溢出(不拉伸不P图);素材未就绪时回退暗色底板。
    const backdropMask = this.host.addChildPlainNode(map, 'BattleStageMapBackdropMask', 0, 0, width - 2 * scale, height - 2 * scale);
    backdropMask.addComponent(Mask);
    const coverScale = Math.max(width / ADVENTURE_AI_MAP_BG_WIDTH, height / ADVENTURE_AI_MAP_BG_HEIGHT);
    this.host.addSprite('BattleStageMapBackdrop', ADVENTURE_AI_MAP_BG_ASSET, 0, 0, ADVENTURE_AI_MAP_BG_WIDTH * coverScale, ADVENTURE_AI_MAP_BG_HEIGHT * coverScale, backdropMask);
    // 底图压暗罩:实景细节太抢,压一层半透明黑让关卡节点与指示标突出。
    const scrim = this.host.addChildPlainNode(map, 'BattleStageMapScrim', 0, 0, width, height);
    const scrimGraphics = scrim.addComponent(Graphics);
    scrimGraphics.fillColor = rgba(0, 0, 0, 124);
    scrimGraphics.rect(-width / 2, -height / 2, width, height);
    scrimGraphics.fill();

    // 顶部章节标题
    const chapterName = activeChapter ? safeText(activeChapter.chapterName) : '主线章节';
    const chapterSubtitle = activeChapter ? safeText(activeChapter.subtitle) : '';
    const titleNode = this.host.addChildPlainNode(map, 'BattleStageMapChapterTitle', 0, height / 2 - 30 * scale, width - 40 * scale, 40 * scale);
    const titleLabel = this.host.addChildLabel(titleNode, 'BattleStageMapChapterName', chapterName, 0, 6 * scale, 24 * scale, rgba(252, 225, 158), new Size(width - 60 * scale, 30 * scale));
    titleLabel.overflow = Label.Overflow.SHRINK;
    titleLabel.enableOutline = true;
    titleLabel.outlineColor = rgba(0, 0, 0, 226);
    titleLabel.outlineWidth = Math.max(1, 1.4 * scale);
    if (chapterSubtitle) {
      const subLabel = this.host.addChildLabel(titleNode, 'BattleStageMapChapterSubtitle', chapterSubtitle, 0, -14 * scale, 16 * scale, rgba(204, 167, 88), new Size(width - 60 * scale, 20 * scale));
      subLabel.overflow = Label.Overflow.SHRINK;
    }

    // 计算关卡节点位置：在当前章节范围内按 S 型路径分布
    const stages = activeChapter ? activeChapter.stages : chapters.flatMap((c) => c.stages);
    const positions = this.resolveNodePositions(stages, width, height, scale);
    if (positions.length === 0) {
      const empty = this.host.addChildLabel(map, 'BattleStageMapEmpty', '暂无可显示关卡', 0, 0, 20 * scale, rgba(205, 185, 146), new Size(width - 40 * scale, 40 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }

    // 先画虚线路径连接节点
    this.drawDottedPath(graphics, positions, scale);

    // 再画节点
    positions.forEach((pos) => {
      this.renderStageNode(map, pos, scale, pos.stage.stageCode === selectedStageCode);
    });
  }

  private resolveNodePositions(stages: LobbyAdventureStageVO[], width: number, height: number, scale: number): MapNodePosition[] {
    if (stages.length === 0) {
      return [];
    }
    // 底图按 cover 等比铺满地图区,把路锚点从图坐标换算到本地坐标;再按弧长均匀取 stages.length 个点。
    const cover = Math.max(width / ADVENTURE_AI_MAP_BG_WIDTH, height / ADVENTURE_AI_MAP_BG_HEIGHT);
    const road = ADVENTURE_MAP_ROAD_ANCHORS.map(([u, v]) => ({
      x: (u - 0.5) * ADVENTURE_AI_MAP_BG_WIDTH * cover,
      y: (0.5 - v) * ADVENTURE_AI_MAP_BG_HEIGHT * cover,
    }));
    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < road.length - 1; i += 1) {
      const length = Math.hypot(road[i + 1].x - road[i].x, road[i + 1].y - road[i].y);
      segmentLengths.push(length);
      totalLength += length;
    }
    const samplePoint = (t: number): { x: number; y: number } => {
      let remain = t * totalLength;
      for (let i = 0; i < segmentLengths.length; i += 1) {
        if (remain <= segmentLengths[i] || i === segmentLengths.length - 1) {
          const p = segmentLengths[i] <= 0 ? 0 : Math.min(1, remain / segmentLengths[i]);
          return {
            x: road[i].x + (road[i + 1].x - road[i].x) * p,
            y: road[i].y + (road[i + 1].y - road[i].y) * p,
          };
        }
        remain -= segmentLengths[i];
      }
      return road[road.length - 1];
    };
    // 可视区夹紧:cover 裁切或窗口过窄时,节点不许跑出地图框(顶部给章节标题留白)。
    const clampX = width / 2 - 52 * scale;
    const clampTop = height / 2 - 92 * scale;
    const clampBottom = -height / 2 + 46 * scale;
    const positions: MapNodePosition[] = [];
    stages.forEach((stage, index) => {
      const t = stages.length <= 1 ? 0.5 : index / (stages.length - 1);
      const point = samplePoint(t);
      const x = Math.max(-clampX, Math.min(clampX, point.x));
      const y = Math.max(clampBottom, Math.min(clampTop, point.y));
      const boss = /MAIN_\d+_(9|16)$/.test(stage.stageCode) || stage.stageCode.endsWith('_16');
      positions.push({ x, y, stage, index, boss });
    });
    return positions;
  }

  private drawDottedPath(graphics: Graphics, positions: MapNodePosition[], scale: number): void {
    if (positions.length < 2) {
      return;
    }
    graphics.strokeColor = rgba(174, 126, 56, 168);
    graphics.lineWidth = Math.max(1, 2 * scale);
    // 用短线段模拟虚线
    for (let i = 0; i < positions.length - 1; i += 1) {
      const a = positions[i];
      const b = positions[i + 1];
      const segments = 8;
      for (let s = 0; s < segments; s += 2) {
        const t1 = s / segments;
        const t2 = (s + 1) / segments;
        graphics.moveTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
        graphics.lineTo(a.x + (b.x - a.x) * t2, a.y + (b.y - a.y) * t2);
      }
    }
    graphics.stroke();
  }

  private renderStageNode(parent: Node, pos: MapNodePosition, scale: number, selected: boolean): void {
    const size = pos.boss ? 104 * scale : 82 * scale;
    const node = this.host.addChildPlainNode(parent, `BattleStageMapNode_${pos.index}`, pos.x, pos.y, size, size);
    const graphics = node.addComponent(Graphics);
    const active = selected || pos.stage.recommended;
    const statusText = safeText(pos.stage.statusLabel);
    const cleared = pos.stage.growthSourceStatus === 'FIRST_CLEAR_USED_UP' || statusText.includes('通关') || statusText.includes('已通');

    // P2 AI 圆徽章节点(锁链/月桂勾/BOSS/空面):源图 1024×1536 圆徽居中,按圆径 ≈size*0.85 等比整图显示。
    const medallionAsset = !pos.stage.unlocked
      ? ADVENTURE_AI_NODE_LOCKED_ASSET
      : pos.boss
        ? ADVENTURE_AI_NODE_BOSS_ASSET
        : cleared
          ? ADVENTURE_AI_NODE_CLEAR_ASSET
          : ADVENTURE_AI_NODE_NORMAL_ASSET;
    const medallionHeight = size * 1.5;
    const medallion = this.host.addSprite('BattleStageMapNodeMedallion', medallionAsset, 0, 0, medallionHeight * (1024 / 1536), medallionHeight, node);
    if (medallion) {
      // 选中/推荐高亮环画在徽章圆缘外侧。
      if (selected || active) {
        graphics.strokeColor = selected ? rgba(255, 215, 118, 250) : rgba(245, 184, 76, 214);
        graphics.lineWidth = Math.max(1, selected ? 2.6 * scale : 2 * scale);
        graphics.circle(0, 0, size * 0.46);
        graphics.stroke();
      }
    } else {
      // 素材未就绪回退:旧底圆 + C1812 节点贴图。
      graphics.fillColor = selected ? rgba(112, 28, 24, 236) : pos.stage.recommended ? rgba(102, 18, 22, 228) : pos.stage.unlocked ? rgba(26, 20, 16, 216) : rgba(12, 12, 15, 170);
      graphics.circle(0, 0, size * 0.34);
      graphics.fill();
      graphics.strokeColor = selected ? rgba(255, 215, 118, 250) : active ? rgba(245, 184, 76, 232) : pos.stage.unlocked ? rgba(168, 124, 61, 178) : rgba(88, 78, 66, 132);
      graphics.lineWidth = Math.max(1, selected ? 2.4 * scale : active ? 2 * scale : 1.2 * scale);
      graphics.circle(0, 0, size * 0.34);
      graphics.stroke();
      if (pos.stage.unlocked) {
        if (pos.boss || active) {
          const bossHeight = size * 0.92;
          this.host.addSprite('BattleStageMapNodeArtBoss', STAGE_NODE_BOSS_ASSET, 0, size * 0.1, bossHeight * (73 / 90), bossHeight, node);
        } else if (cleared) {
          this.host.addSprite('BattleStageMapNodeArtClear', STAGE_NODE_CLEAR_ASSET, 0, size * 0.04, size * 0.62, size * 0.62, node);
        } else {
          this.host.addSprite('BattleStageMapNodeArt', STAGE_NODE_ASSET, 0, size * 0.04, size * 0.62, size * 0.62, node);
        }
      }
    }

    // 点击交互：可进入关卡 -> selectStage；锁定 -> previewLockedStage
    node.addComponent(Button);
    if (pos.stage.unlocked) {
      node.on(Button.EventType.CLICK, () => this.host.selectStage(pos.stage.stageCode), this);
    } else {
      node.on(Button.EventType.CLICK, () => this.host.previewLockedStage(pos.stage.stageCode), this);
    }
    this.host.applyImageButtonFeedback(node, 1.035, 0.965);

    // 关卡序号:统一挂在节点正下方(第几关),徽章面保持画面干净。
    const label = this.host.addChildLabel(node, 'BattleStageMapNodeLabel', `${pos.stage.orderNo}`, 0, -size * 0.6, 18 * scale, active ? rgba(255, 222, 148) : pos.stage.unlocked ? rgba(222, 196, 138) : rgba(166, 146, 104), new Size(size, 22 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 232);
    label.outlineWidth = Math.max(1, 1.4 * scale);
    // 推荐关(当前进度)顶上悬浮 AI 指示标(朝下的熔岩匕首,401×1047 等比)。
    if (medallion && pos.stage.recommended) {
      // 推荐关指示标:1.5 倍节点尺寸,仅保留轻微上下浮动;节点销毁(面板重渲染/切章节)时停掉 tween。
      const markerHeight = size * 1.5;
      const marker = this.host.addSprite('BattleStageMapNodeMarker', ADVENTURE_AI_NODE_MARKER_ASSET, 0, size * 0.5 + markerHeight / 2, markerHeight * (401 / 1047), markerHeight, node);
      if (marker) {
        const baseY = marker.node.position.y;
        marker.node.on(Node.EventType.NODE_DESTROYED, () => Tween.stopAllByTarget(marker.node));
        tween(marker.node)
          .repeatForever(
            tween(marker.node)
              .to(0.7, { position: new Vec3(0, baseY + 7 * scale, 0) }, { easing: 'sineInOut' })
              .to(0.7, { position: new Vec3(0, baseY, 0) }, { easing: 'sineInOut' }),
          )
          .start();
      }
    }

    // 关卡名:只在选中/推荐节点显示(沿路 16 个节点全挂名称会串叠成一片);挂在序号下方一行。
    if (selected || pos.stage.recommended) {
      const stageName = selected ? `已选 ${safeText(pos.stage.stageName)}` : safeText(pos.stage.stageName);
      const name = this.host.addChildLabel(node, 'BattleStageMapNodeName', stageName, 0, -size * 0.92, 16 * scale, rgba(255, 222, 148), new Size(size * 2.4, 22 * scale));
      name.overflow = Label.Overflow.SHRINK;
      name.enableOutline = true;
      name.outlineColor = rgba(0, 0, 0, 226);
      name.outlineWidth = Math.max(1, 1.4 * scale);
    }
  }
}