import { Button, Graphics, Node, sys, Tween, tween, UITransform, Vec3 } from 'cc';
import { GUIDE_BUBBLE_AVATAR_OVERHANG, mountGuideTriangle, mountZeroGuideBubble, type GuideKitHost } from '../GuideKit';
import { GuideFlags, type GuideFlagSync } from './GuideFlagSync';
import { rgba } from './LobbyHudTypes';

/**
 * docs/57 §5 情境提示(弱引导,条件满足时各出一次,11-25):
 * - 有未穿戴的装备 → 终端「英雄」格脉冲 + 气泡「获得了装备,去给英雄穿上」;
 * - 守卫水晶可升级 → 终端「守卫水晶」格脉冲 + 气泡;
 * - 体力不足开战 → 开战前拦下 + 气泡「体力不足,可在商店补充」(点了开商店体力页)+ 体力胶囊脉冲;
 * - 新功能解锁 → 终端格「新」角标(§11 已做)+ 脉冲一次;
 * - 野外第一次走近隐藏点 / 宝箱 / 采集点 → 头顶圆徽放大弹三下。
 * 弱引导 = 脉冲光环 + 玻璃气泡,不压暗、不拦点击。「出过」存服务端标记 tip:<键>(本机兜底),换设备不重放。
 */
export type GuideTipKey = 'equip' | 'crystal' | 'stamina' | 'near_hidden' | 'near_chest' | 'near_gather';
export const GUIDE_TIP_KEYS: readonly GuideTipKey[] = ['equip', 'crystal', 'stamina', 'near_hidden', 'near_chest', 'near_gather'];

/** 情境提示「出过」的记录(同 FeatureIntroTracker 口径:本机 lc_guide_tip_<uid> + 服务端 tip:<键>)。 */
export class GuideTipTracker {
  private uid = 0;
  private seenSet = new Set<GuideTipKey>();
  private mergedVersion = -1;

  constructor(private readonly sync?: GuideFlagSync) {}

  bind(uid: number): void {
    if (uid === this.uid) {
      return;
    }
    this.uid = uid;
    this.mergedVersion = -1;
    this.seenSet = new Set<GuideTipKey>();
    try {
      const raw = sys.localStorage.getItem(this.key());
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        list.filter((item): item is GuideTipKey => typeof item === 'string' && GUIDE_TIP_KEYS.indexOf(item as GuideTipKey) >= 0).forEach((item) => this.seenSet.add(item));
      }
    } catch {
      // 本地存储坏了:当作都没出过(最多多出一次提示)
    }
  }

  seen(key: GuideTipKey): boolean {
    this.mergeServer();
    return this.seenSet.has(key);
  }

  markSeen(key: GuideTipKey): void {
    this.mergeServer();
    if (this.seenSet.has(key)) {
      return;
    }
    this.seenSet.add(key);
    this.save();
    this.sync?.mark(GuideFlags.tip(key));
  }

  /** 本机已有的「出过」→ 标记码(登录同步时补报服务端没有的)。 */
  localFlags(): string[] {
    return Array.from(this.seenSet).map((key) => GuideFlags.tip(key));
  }

  /** 把服务端的「出过」合进本机(服务端标记有新版本才动);返回本机记录有没有变。 */
  mergeServer(): boolean {
    const sync = this.sync;
    if (!sync || !this.uid || sync.boundUid() !== this.uid || sync.version === this.mergedVersion) {
      return false;
    }
    this.mergedVersion = sync.version;
    let changed = false;
    for (const key of GUIDE_TIP_KEYS) {
      if (!this.seenSet.has(key) && sync.has(GuideFlags.tip(key))) {
        this.seenSet.add(key);
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
    return changed;
  }

  private save(): void {
    try {
      sys.localStorage.setItem(this.key(), JSON.stringify(Array.from(this.seenSet)));
    } catch {
      // 本地存储不可用:以服务端为准
    }
  }

  private key(): string {
    return `lc_guide_tip_${this.uid}`;
  }
}

/**
 * 脉冲光环(docs/57 §6「香槟色细环向外扩散淡出」):常亮圆角细框 + 一圈往外扩、越扩越淡的环;times = 扩几次(0 = 一直扩,
 * 扩完 times 次自己收掉并回调 onDone)。本工程 UIOpacity 对 Graphics 不生效 → tween 一个普通对象,onUpdate 里按进度重画带 alpha 的线。
 */
export function mountPulseRing(host: GuideKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, k: number, times = 0, onDone?: () => void): Node {
  const node = host.addChildPlainNode(parent, name, x, y, w + 60 * k, h + 60 * k);
  const g = node.addComponent(Graphics);
  const r = Math.min(h / 2, 18 * k);
  const state = { t: 0 };
  const draw = (): void => {
    if (!g.isValid) {
      Tween.stopAllByTarget(state);
      return;
    }
    g.clear();
    g.strokeColor = rgba(227, 196, 138, 210);
    g.lineWidth = Math.max(1.5, 2.2 * k);
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.stroke();
    const s = state.t;
    const pad = 24 * k * s;
    g.strokeColor = rgba(227, 196, 138, Math.round(220 * (1 - s)));
    g.lineWidth = Math.max(1.5, 3.2 * k * (1 - s * 0.5));
    g.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, r + pad);
    g.stroke();
  };
  draw();
  const cycle = (): Tween<{ t: number }> => tween(state).set({ t: 0 }).to(1.1, { t: 1 }, { easing: 'sineOut', onUpdate: draw }).delay(0.3);
  if (times > 0) {
    tween(state).repeat(times, cycle()).call(() => {
      if (node.isValid) {
        node.destroy();
      }
      onDone?.();
    }).start();
  } else {
    tween(state).repeatForever(cycle()).start();
  }
  return node;
}

export interface WeakTipStage {
  stageLeft: number;
  stageRight: number;
  stageTop: number;
  stageBottom: number;
}

/**
 * 弱引导一组:目标外一圈脉冲光环 + 「零」气泡(目标在上半屏放下面、否则放上面)+ 香槟小三角。不压暗、不拦点击(只有气泡本身可点)。
 * target = 要指的节点(null = 只出气泡,放舞台上部居中);hint = 气泡右下角灰字;onTap = 点气泡。返回整组根节点,调用方负责收。
 */
export function mountWeakTip(host: GuideKitHost, parent: Node, name: string, stage: WeakTipStage, k: number, target: Node | null, text: string, hint: string, onTap: () => void): Node {
  const root = host.addChildPlainNode(parent, name, 0, 0, 1, 1);
  const parentTf = parent.getComponent(UITransform);
  const targetTf = target?.getComponent(UITransform) ?? null;
  const bubbleW = Math.min(540 * k, (stage.stageRight - stage.stageLeft) * 0.46);
  const bubbleH = 116 * k;
  const over = bubbleH * GUIDE_BUBBLE_AVATAR_OVERHANG;
  const midY = (stage.stageTop + stage.stageBottom) / 2;
  let bx = (stage.stageLeft + stage.stageRight) / 2 + over / 2;
  let by = stage.stageTop - bubbleH / 2 - 150 * k;
  if (target && targetTf && parentTf) {
    const local = parentTf.convertToNodeSpaceAR(target.worldPosition.clone());
    const tw = targetTf.width * Math.abs(target.worldScale.x);
    const th = targetTf.height * Math.abs(target.worldScale.y);
    mountPulseRing(host, root, 'WeakTipRing', local.x, local.y, tw + 14 * k, th + 14 * k, k);
    const below = local.y > midY;
    const dir = below ? -1 : 1;
    const pointerH = 26 * k;
    const pointerY = local.y + dir * (th / 2 + 7 * k + 14 * k + pointerH / 2);
    const triangle = mountGuideTriangle(host, root, 'WeakTipPointer', local.x, pointerY, 30 * k, pointerH, below ? 180 : 0);
    tween(triangle).repeatForever(tween<Node>().by(0.5, { position: new Vec3(0, dir * -8 * k, 0) }).by(0.5, { position: new Vec3(0, dir * 8 * k, 0) })).start();
    by = pointerY + dir * (pointerH / 2 + bubbleH / 2 + 4 * k);
    bx = Math.max(stage.stageLeft + bubbleW / 2 + over + 8 * k, Math.min(stage.stageRight - bubbleW / 2 - 8 * k, local.x));
  }
  by = Math.max(stage.stageBottom + bubbleH / 2 + 8 * k, Math.min(stage.stageTop - bubbleH / 2 - 8 * k, by));
  const bubble = mountZeroGuideBubble(host, root, 'WeakTipBubble', bx, by, bubbleW, bubbleH, text, hint);
  bubble.addComponent(Button);
  bubble.on(Button.EventType.CLICK, onTap);
  return root;
}
