import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Node, Size, UITransform, Vec3 } from 'cc';
import type { UiKitHost } from '../UiKit';
import type { UiLayout } from './LobbyHudTypes';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassLine, mountGlassSlice } from '../UiGlassKit';

export type LoadingScreenHost = UiKitHost & { createUiNode(name: string): Node };

export interface LoadingScreenSpec {
  title: string;
  /** 进度 0~1;null = 不画进度条(只等,不知道总量)。 */
  ratio: number | null;
  /** 进度条下左侧的说明;'' = 不显示。 */
  hint: string;
  /** 右侧计数文字;不给 = 百分比。 */
  count?: string;
}

const BG = 'ui/protagonist/b/soul_sea_bg/spriteFrame';
const ZERO = 'ui/protagonist/b/zero_m/spriteFrame';

/** 小贴士(玩法提示,不露开发口径)。 */
const TIPS = [
  '翻滚的无敌帧可以躲开精英的蓄力重击',
  '精英的破防条打满后,三秒内受到的伤害提高一半',
  '普攻第三段范围更大,适合清理成群的小怪',
  '锁定目标后技能会自动朝它释放,Tab 可以切换目标',
  '每升一级都有一次进化抉择,同一路线叠到第 3 层会质变',
  '交付剧情「祭坛的回应」和「林地之王」各能订立一份英雄契约',
  '出村之前要先完成境界突破,斩断昔日的自己',
  '鸟瞰图里点亮的区域越多,探索度奖励越丰厚',
  '石碑里藏着诸神的低语,集齐一章能解锁成就',
  '体力不足时,区域首领只给少量经验',
];
let tipText = '';
let tipAt = 0;

/** 同一次加载期间(8 秒内连续刷新进度)保持同一条,不跳来跳去。 */
export function currentLoadingTip(): string {
  const now = Date.now();
  if (!tipText || now - tipAt > 8000) {
    tipText = TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  tipAt = now;
  return tipText;
}

/**
 * 过场加载页(原型 周报截图/2026-11-04_过场加载/proto/pack_loading_b.png,用户 11-04 确认):
 * 识海背景压暗 + 底部居中一张毛玻璃卡(标题 / 香槟细进度条 / 说明 + 百分比 / 分隔线 / 小贴士),零漂在卡片左沿。
 * 素材下载(PackLoading)、功能页首开素材(SceneAssetLoading)、进入世界(WorldEntryLoading)三处共用;坐标取原型 1870×841 实测像素。
 */
export function mountLoadingScreen(host: LoadingScreenHost, nodeName: string, layout: UiLayout, spec: LoadingScreenSpec): Node {
  const cx = (layout.stageLeft + layout.stageRight) / 2;
  const cy = (layout.stageTop + layout.stageBottom) / 2;
  const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
  const root = host.createUiNode(nodeName);
  root.setPosition(new Vec3(cx, cy, 0));
  root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
  root.addComponent(BlockInputEvents);
  const W = layout.width;
  const H = layout.height;
  // 纯色底先盖住底下的页面(背景图没读到时也不会透出功能页)
  const cover = root.addComponent(Graphics);
  cover.fillColor = new Color(12, 15, 22, 255);
  cover.rect(-W, -H, W * 2, H * 2);
  cover.fill();
  const scale = Math.max(W / 1672, H / 941);
  host.addSprite('Bg', BG, 0, 0, 1672 * scale, 941 * scale, root);
  const dim = host.addChildPlainNode(root, 'Dim', 0, 0, W, H).addComponent(Graphics);
  dim.fillColor = new Color(8, 11, 18, 120);
  dim.rect(-W / 2, -H / 2, W, H);
  dim.fill();

  // 卡片(原型 x 481~1389 / y 517~740)
  const card = host.addChildPlainNode(root, 'Card', FX(935), FY(628), S(908), S(223));
  mountGlassSlice(host, card, 'Glass', GLASS_SLICES.panel, 0, 0, S(908), S(223), k);
  glassLabel(host, root, 'Title', spec.title, FX(937), FY(556), S(32), GLASS_COLOR.text, S(760), HorizontalTextAlignment.CENTER, true);
  if (spec.ratio !== null) {
    const ratio = Math.max(0, Math.min(1, spec.ratio));
    const bw = S(769);
    const bh = Math.max(4, S(12));
    const bar = host.addChildPlainNode(root, 'Bar', FX(951), FY(606), bw, bh).addComponent(Graphics);
    bar.fillColor = new Color(42, 48, 60, 235);
    bar.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    bar.fill();
    bar.strokeColor = new Color(255, 255, 255, 30);
    bar.lineWidth = 1;
    bar.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    bar.stroke();
    if (ratio > 0) {
      bar.fillColor = GLASS_COLOR.champagne;
      bar.roundRect(-bw / 2, -bh / 2, Math.max(bh, bw * ratio), bh, bh / 2);
      bar.fill();
    }
    glassLabel(host, root, 'Count', spec.count ?? `${Math.round(ratio * 100)}%`, FX(1336), FY(642), S(22), GLASS_COLOR.text, S(200), HorizontalTextAlignment.RIGHT);
  }
  if (spec.hint) {
    glassLabel(host, root, 'Hint', spec.hint, FX(567), FY(spec.ratio !== null ? 642 : 606), S(19), GLASS_COLOR.sub, S(560));
  }
  mountGlassLine(host, root, 'Divider', FX(951), FY(672), S(769), Math.max(1, S(1)), new Color(255, 255, 255, 30));
  glassLabel(host, root, 'TipTag', '小贴士', FX(567), FY(703), S(21), GLASS_COLOR.champagne, S(90), HorizontalTextAlignment.LEFT, true);
  glassLabel(host, root, 'Tip', currentLoadingTip(), FX(668), FY(703), S(19), GLASS_COLOR.sub, S(660));
  // 零:漂在卡片左沿(原型 (470, 612) 约 150 高)
  host.addSprite('Zero', ZERO, FX(470), FY(612), S(150), S(150), root);
  return root;
}
