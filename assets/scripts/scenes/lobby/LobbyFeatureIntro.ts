import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, sys, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import type { UiLayout } from './LobbyHudTypes';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassSlice } from '../UiGlassKit';
import { ZERO_GUIDE_PORTRAIT } from '../GuideKit';

/**
 * docs/57 §4 功能说明卡(11-24):终端里 10 个功能第一次打开时,在页面上盖一张 B 风格玻璃卡 ——
 * 零的圆头像 + 标题 + 一句话讲清这个页面干什么 + 3 个要点 +「知道了」,每个功能只出一次。
 * 「看过」记在本机(按账号,lc_feature_intro_<uid>):后端没有引导进度表(docs/57 §9 拍板的服务端存档未实现),换设备会再出一次。
 * 卡挂在根节点下的独立层(LobbyFeatureIntroLayer),功能页整页重绘不会把它拆掉 / 盖住。
 */
export type FeatureIntroKey = 'terminal' | 'bag' | 'forge' | 'daily' | 'crystal' | 'raid' | 'codex' | 'guild' | 'explore' | 'worldmap';

export const FEATURE_INTROS: Record<FeatureIntroKey, { title: string; line: string; points: [string, string, string] }> = {
  terminal: {
    title: '终端',
    line: '所有功能都在这里;红点 = 有可领 / 可升级。',
    points: [
      '左边是你的名片:等级、战力、体力 / 金币 / 钻石,点「+」去补充',
      '右边的功能随剧情和等级逐步开放,带锁的格子写着开放条件',
      '底栏是邮件、公告、兑换码和设置',
    ],
  },
  bag: {
    title: '背包',
    line: '道具、材料、装备都在这;可使用 / 出售 / 合成。',
    points: [
      '按页签分类查看,点一件看它的用途和获取途径',
      '经验书、宝箱这类消耗品可以直接使用',
      '用不上的可以出售换金币,数量够的材料可以合成',
    ],
  },
  forge: {
    title: '锻造',
    line: '强化 / 合成 / 分解 / 宝石,让装备更强。',
    points: [
      '强化:消耗强化石和金币,提升装备等级',
      '合成把低品质装备升成高品质;分解把不要的装备拆成材料',
      '宝石镶进装备的孔位,额外加属性',
    ],
  },
  daily: {
    title: '秘境试炼',
    line: '每天不同主题;Ⅰ / Ⅱ 产材料,Ⅲ 输出试炼产矿晶。',
    points: [
      '每天开放的主题不同,产出对应的养成材料',
      'Ⅲ 档是输出试炼:按打出的伤害结算矿晶,还有周榜',
      '「特殊玩法 · 守卫战」也在这里',
    ],
  },
  crystal: {
    title: '守卫水晶',
    line: '用金币和晶核升级水晶、装备法术。',
    points: [
      '水晶等级越高,守卫战里越耐打',
      '升级会解锁更多法术栏位,法术可以自己挑着装',
      '装好的法术在守卫战和矿境掠夺里使用',
    ],
  },
  raid: {
    title: '矿境掠夺',
    line: 'NPC 矿闯关;真人矿掠夺别人的矿晶、买盾防守。',
    points: [
      'NPC 矿一关关打过去,首次通关有奖励',
      '真人矿匹配其他宿主的矿,打赢就掠夺矿晶;被抢了可以复仇',
      '买护盾可以在一段时间里免受掠夺',
    ],
  },
  codex: {
    title: '图鉴',
    line: '收集英雄领收录奖励,收集数解锁宝箱。',
    points: [
      '获得过的英雄会在图鉴里点亮',
      '每点亮一位英雄,可以领一次收录奖励',
      '收集数量到档,开启对应的收集宝箱',
    ],
  },
  guild: {
    title: '佣兵公会',
    line: '每日 3 条悬赏,完成领金币和经验。',
    points: [
      '每天刷新 3 条悬赏,接下后去野外完成',
      '悬赏分难度,越难奖励越多',
      '已接的悬赏会显示在左侧追踪条上',
    ],
  },
  explore: {
    title: '野外探索',
    line: '迷雾、隐藏点、石碑、采集点,探索度越高奖励越多。',
    points: [
      '走过的地方会驱散迷雾,点亮地图',
      '隐藏点走近自动发现;石碑可以阅读;采集点每天都能采',
      '探索度到档后,在这一页领取档位奖励',
    ],
  },
  worldmap: {
    title: '世界地图',
    line: '已激活的传送阵之间可以直接传送。',
    points: [
      '新地图要先亲自走到,激活那里的传送阵',
      '选中已激活的地点,点「传送」就能过去',
      '站在传送阵上传送不用等;在别处要读条 5 秒,战斗中不能传送',
    ],
  },
};

export interface FeatureIntroHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor?(node: Node): void;
}

/**
 * 画一张说明卡(原型尺寸 1060 × 500,按 glassProtoMap 等比):全屏压暗挡输入 + 居中玻璃卡;
 * 左上零的圆头像压在卡沿;标题 34 / 一句话 22 香槟 / 3 条要点 22 白字(手机字号下限 20)/ 底部「知道了」。
 */
export function renderFeatureIntroCard(host: FeatureIntroHost, root: Node, layout: UiLayout, key: FeatureIntroKey, onClose: () => void): void {
  const intro = FEATURE_INTROS[key];
  const { k, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
  const cx = (layout.stageLeft + layout.stageRight) / 2;
  const cy = (layout.stageTop + layout.stageBottom) / 2;
  root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
  root.setPosition(new Vec3(0, 0, 0));
  const dim = host.addChildPlainNode(root, 'Dim', 0, 0, layout.width, layout.height);
  dim.addComponent(BlockInputEvents);
  const dg = dim.addComponent(Graphics);
  dg.fillColor = new Color(4, 6, 12, 165);
  dg.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
  dg.fill();

  const w = Math.min(S(1060), layout.stageWidth * 0.9);
  const h = S(500);
  const card = host.addChildPlainNode(root, 'Card', cx, cy, w, h);
  card.addComponent(BlockInputEvents);
  mountGlassSlice(host as never, card, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);
  // 零的圆头像(压在卡左上沿,对话感;同 GuideKit 气泡口径)
  const d = S(118);
  const avatar = host.addChildPlainNode(card, 'Zero', -w / 2 + S(72), h / 2 - S(64), d, d);
  const ag = avatar.addComponent(Graphics);
  ag.fillColor = new Color(14, 19, 30, 255);
  ag.circle(0, 0, d / 2);
  ag.fill();
  host.addSprite('Face', ZERO_GUIDE_PORTRAIT, 0, 0, d * 0.94, d * 0.94, avatar);
  const ring = host.addChildPlainNode(avatar, 'Ring', 0, 0, d, d).addComponent(Graphics);
  ring.strokeColor = new Color(196, 204, 220, 170);
  ring.lineWidth = Math.max(1.5, S(2));
  ring.circle(0, 0, d / 2 - 1);
  ring.stroke();

  const left = -w / 2 + S(150);
  const textW = w - S(150) - S(56);
  glassLabel(host as never, card, 'Kicker', '功能说明', left, h / 2 - S(40), S(20), GLASS_COLOR.sub, S(200), HorizontalTextAlignment.LEFT);
  glassLabel(host as never, card, 'Title', intro.title, left, h / 2 - S(80), S(34), GLASS_COLOR.text, textW, HorizontalTextAlignment.LEFT, true);
  const line = glassLabel(host as never, card, 'Line', intro.line, left, h / 2 - S(130), S(22), GLASS_COLOR.champagne, textW, HorizontalTextAlignment.LEFT);
  line.overflow = Label.Overflow.SHRINK;
  line.node.getComponent(UITransform)?.setContentSize(textW, S(32));
  // 分隔细线
  const sep = host.addChildPlainNode(card, 'Sep', 0, h / 2 - S(166), w - S(112), S(2)).addComponent(Graphics);
  sep.fillColor = new Color(255, 255, 255, 30);
  sep.rect(-(w - S(112)) / 2, -S(0.6), w - S(112), S(1.2));
  sep.fill();
  // 3 个要点:香槟小菱形 + 白字
  const pointLeft = -w / 2 + S(84);
  const pointW = w - S(84) - S(56);
  intro.points.forEach((point, index) => {
    const y = h / 2 - S(212) - index * S(58);
    const mark = host.addChildPlainNode(card, `Mark_${index}`, pointLeft, y, S(16), S(16)).addComponent(Graphics);
    const r = S(6);
    mark.fillColor = new Color(227, 196, 138, 255);
    mark.moveTo(0, r);
    mark.lineTo(r, 0);
    mark.lineTo(0, -r);
    mark.lineTo(-r, 0);
    mark.close();
    mark.fill();
    const label = glassLabel(host as never, card, `Point_${index}`, point, pointLeft + S(24), y, S(22), GLASS_COLOR.text, pointW - S(24), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    label.node.getComponent(UITransform)?.setContentSize(pointW - S(24), S(34));
  });
  const ok = mountGlassButton(host as never, card, 'Ok', '知道了', 0, -h / 2 + S(58), S(300), S(68), k, 'primary', onClose, 26);
  host.applyPointerCursor?.(ok);
  // 轻量入场:淡入 + 卡片微微放大
  const op = root.addComponent(UIOpacity);
  op.opacity = 0;
  card.setScale(0.94, 0.94, 1);
  tween(op).to(0.18, { opacity: 255 }).start();
  tween(card).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
}

/** 「看过」记录(本机按账号存;点「知道了」才算看过)。 */
export class FeatureIntroTracker {
  private uid = 0;
  private seenSet = new Set<FeatureIntroKey>();

  bind(uid: number): void {
    if (uid === this.uid) {
      return;
    }
    this.uid = uid;
    this.seenSet = new Set<FeatureIntroKey>();
    try {
      const raw = sys.localStorage.getItem(this.key());
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        list.filter((item): item is FeatureIntroKey => typeof item === 'string' && item in FEATURE_INTROS).forEach((item) => this.seenSet.add(item));
      }
    } catch {
      // 本地存储坏了:当作都没看过(最多多出一次说明卡)
    }
  }

  seen(key: FeatureIntroKey): boolean {
    return this.seenSet.has(key);
  }

  markSeen(key: FeatureIntroKey): void {
    if (this.seenSet.has(key)) {
      return;
    }
    this.seenSet.add(key);
    try {
      sys.localStorage.setItem(this.key(), JSON.stringify(Array.from(this.seenSet)));
    } catch {
      // 本地存储不可用:下次进来再出一次
    }
  }

  private key(): string {
    return `lc_feature_intro_${this.uid}`;
  }
}
