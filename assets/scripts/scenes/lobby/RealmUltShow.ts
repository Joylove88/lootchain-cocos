import { gfx, Graphics, Node, resources, sp, Sprite, SpriteFrame, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { rgba } from './LobbyHudTypes';
import { loadSharedSpineData } from './SpineDataStore';
import { resolveBattleUnitSpineRuntimeData, resolveBattleUnitSpineSkinName } from './LobbyBattleUnitSpineRuntime';
import type { TownCombatFx, TownCombatFxHost } from './LobbyTownCombatFx';

/**
 * docs/60 P1b 炼魂大招「夜帝残影」演出(11-04 用户确认原型 realm_ult_yedi_a + 虚影选 B + 刀光候选 1)。
 * 野外(LobbyTownRenderer)与矿境掠夺(GuardRaidController,docs/61 §8)共用这一份:配置 / 虚影骨骼加载 / 压暗 / 法阵 / 虚影 + 翅膀 / 刀光;
 * 伤害、冷却、推怪这类玩法各自管(掠夺在确定性模型 GUARD_RAID_ULT 里)。
 * 虚影 = 永夜龙骑底换皮的夜帝(protag_yedi,Meowa),动作与主角同一截「横扫」;翅膀 ui/realm/yedi_wing_l|r、刀光 S681-4006 attackall(白色弯月剑气染淡紫)、
 * 脚下 A47-217 紫色法阵。虚影双层:普通层 + 加色发光层(protag_yedi_glow)。像素尺寸按野外角色(高约 230px)配,掠夺按 k = 单位尺寸 / 230 换算。
 */
export const REALM_ULT_BASE = {
  icon: 'ui/realm/icon_rw_ult/spriteFrame',
  spine: 'spine/hero/protag_yedi/protag_yedi',
  /** 发光层(同贴图、全部件加色混合;深色甲透明、金纹 / 披风 / 刃发亮),叠在普通层上面。 */
  glow: 'spine/hero/protag_yedi/protag_yedi_glow',
  cdMs: 30000,
  mult: 4.5,
  reach: 560,
  /** 主角 / 虚影同播的一截:skill1 后半「举剑定住 → 斜劈下去」(0.2~1.0 是举剑定格,1.0~1.4 才是挥砍)。 */
  clip: { anim: 'skill1', start: 0.8, end: 1.55, speed: 0.9 },
  /** 蓄势:虚影浮起、主角定住的时长。 */
  leadMs: 320,
  /** 命中点(挥砍落到底约 1.25s)占这一截的比例。 */
  hitAt: 0.6,
  ghostScale: 2.0,
  /** 普通层(轮廓 / 细节)透明度与乘色;发光层透明度与乘色(11-04 用户「要和原型一致」:普通层提高看得清长发 / 王冠 / 披风)。 */
  ghostAlpha: 165,
  tint: [236, 220, 255] as [number, number, number],
  glowAlpha: 170,
  glowTint: [190, 130, 255] as [number, number, number],
  /**
   * 翅膀(原型同款紫色蝙蝠翼 + 金色翼脉,GPT 出图左右两片 ui/realm/yedi_wing_l|r):每帧跟着虚影胸口骨骼(chest)走 ——
   * 翼根 = chest 骨本地 wingRoot(x 沿骨头往上、y 往背侧),身体转多少翅膀跟着转多少(11-04 用户「翅膀跟随人物动作贴在背部」);
   * 每片宽 wingW(×ghostScale);蓄势时从收拢(wingFold°)展开,之后慢扇;叠一层加色混合让翼膜透光。
   */
  wingL: 'ui/realm/yedi_wing_l/spriteFrame',
  wingR: 'ui/realm/yedi_wing_r/spriteFrame',
  // 11-04 用户逐帧反馈「600ms 要往右上、750 / 900ms 弯腰时要往右、1100ms 要往左转一点」:chest 骨原点本来就在背侧,
  // 翼根改往身体前方挪(y 负 = 胸前方向)并上移;转角只跟 0.6(全跟时前倾 50° 翅膀斜得太厉害)
  wingRoot: { x: 60, y: -60 },
  wingTurn: 0.6,
  wingW: 170,
  wingAlpha: 185,
  wingGlowAlpha: 70,
  wingFold: 38,
  wingFlap: 9,
  /** 放大招先把身边的怪震开(用户「放大招时把怪推开」):半径 / 击退初速(衰减 e^-14t,约 速度/14 像素)/ 定住时长。 */
  pushRadius: 380,
  pushSpeed: 3400,
  pushStunMs: 1300,
  /** 虚影相对队长:往身后 x、往下 y(脚比主角低一点,像从地里升起)。 */
  ghostAt: { x: 150, y: -20 },
  slashAt: { x: 240, y: 140 },
  slashSize: 1000,
  /** 刀光动画从第几秒播(素材前 0.1 秒空)。 */
  slashFrom: 0.08,
  /** 刀光在这一截的哪里出(挥砍起手约 1.05s)。 */
  slashLead: 0.33,
  /** 场景压暗(11-04 用户「压暗调浅」;摆件不在地面层不跟着暗,压太深反差突兀)。 */
  dimAlpha: 70,
  circleSize: 440,
  slash: { effect: 'v2_s681_4006', animation: 'attackall' },
  circle: { effect: 'v2_a47_217', animation: 'effect_debuff' },
  /** 命中:紫粉暗能量爆点(替掉主角普攻的橙色火焰命中)。 */
  hit: { effect: 'v2_a47_375', animation: 'action1', size: 1.6 },
};
export type RealmUltCfg = typeof REALM_ULT_BASE;

/** 演出参数;自验脚本可在页面里写 window.__realmUltTune 覆盖(不用重出包调手感),正式玩家没有这个开关。 */
export function realmUltCfg(): RealmUltCfg {
  const tune = (globalThis as unknown as { __realmUltTune?: Partial<RealmUltCfg> }).__realmUltTune;
  return tune ? { ...REALM_ULT_BASE, ...tune } : REALM_ULT_BASE;
}

/** 演出时长(毫秒):蓄势 + 横扫切片(clipMs = 主角实际播的切片时长,没播成按 900)。 */
export function realmUltTiming(clipMs: number, cfg: RealmUltCfg = realmUltCfg()): { lead: number; dur: number; total: number } {
  const dur = clipMs > 0 ? clipMs : 900;
  return { lead: cfg.leadMs, dur, total: cfg.leadMs + dur };
}

interface WingFollow {
  wings: Node;
  skeleton: sp.Skeleton;
  skNode: Node;
  root: { x: number; y: number };
  turn: number;
}

export class RealmUltShow {
  private ghost: sp.SkeletonData | null = null;
  private glow: sp.SkeletonData | null = null;
  private loading = false;
  /** 正在播的虚影翅膀:每帧把翼根贴到虚影 chest 骨上(step)。 */
  private wings: WingFollow[] = [];

  constructor(private readonly host: TownCombatFxHost, private readonly fx: () => TownCombatFx) {}

  /** 预热:刀光 / 法阵 / 命中特效 + 虚影两层骨骼 + 翅膀贴图(addSprite 只认缓存,未加载时整片翅膀会缺)。 */
  prewarm(): void {
    const cfg = realmUltCfg();
    [cfg.slash, cfg.circle, cfg.hit].forEach((spec) => this.fx().prewarm(spec));
    [cfg.wingL, cfg.wingR].forEach((path) => {
      if (!resources.get(path, SpriteFrame)) {
        resources.load(path, SpriteFrame, () => undefined);
      }
    });
    if ((this.ghost && this.glow) || this.loading) {
      return;
    }
    this.loading = true;
    loadSharedSpineData(cfg.spine, null, 'RealmUlt', (data) => {
      this.ghost = data;
      loadSharedSpineData(cfg.glow, null, 'RealmUltGlow', (glow) => {
        this.loading = false;
        this.glow = glow;
      });
    });
  }

  /** 场景压暗(parent 下指定层级;默认最上):进 0.25s、退 0.35s。Graphics 不吃 UIOpacity(整块不透明,11-04 实测地面全被盖住):淡入淡出靠重画填充色的 alpha。 */
  spawnDim(parent: Node | null, x: number, y: number, totalMs: number, siblingIndex = -1): void {
    if (!parent || !parent.isValid) {
      return;
    }
    const cfg = realmUltCfg();
    const node = this.host.addChildPlainNode(parent, 'RealmUltDim', x, y, 10, 10);
    node.setSiblingIndex(siblingIndex >= 0 ? siblingIndex : parent.children.length - 1);
    const g = node.addComponent(Graphics);
    const draw = (a: number): void => {
      if (!g.isValid) {
        return;
      }
      g.clear();
      g.fillColor = rgba(24, 10, 46, Math.round(a));
      g.rect(-5000, -3500, 10000, 7000);
      g.fill();
    };
    const fade = { a: 0 };
    draw(0);
    tween(fade).to(0.25, { a: cfg.dimAlpha }, { onUpdate: () => draw(fade.a) }).delay(Math.max(0, totalMs / 1000 - 0.25))
      .to(0.35, { a: 0 }, { onUpdate: () => draw(fade.a) }).call(() => node.isValid && node.destroy()).start();
  }

  /** 脚下紫色法阵(A47-217,自带竖向紫光柱),演出结束淡出。k = 像素尺寸换算(野外 1)。 */
  spawnCircle(root: Node, x: number, y: number, totalMs: number, k = 1): Node | null {
    const cfg = realmUltCfg();
    const circle = this.fx().play(root, cfg.circle, x, y + 20 * k, cfg.circleSize * k, { loop: true });
    if (circle) {
      const op = circle.addComponent(UIOpacity);
      tween(op).delay(totalMs / 1000).to(0.3, { opacity: 0 }).call(() => circle.isValid && circle.destroy()).start();
    }
    return circle;
  }

  /** 刀光:白色弯月剑气染淡紫(素材开头空帧跳过);(x, y) = 施放者脚下。 */
  spawnSlash(root: Node, x: number, y: number, facing: number, k = 1): void {
    if (!root.isValid) {
      return;
    }
    const cfg = realmUltCfg();
    const slash = this.fx().play(root, { ...cfg.slash, clip: { start: cfg.slashFrom, end: 1, speed: 1.15 } }, x + facing * cfg.slashAt.x * k, y + cfg.slashAt.y * k, cfg.slashSize * k, { flipX: facing < 0 });
    slash?.getComponentsInChildren(sp.Skeleton).forEach((sk) => { sk.color = rgba(214, 170, 255, 255); });
  }

  /**
   * 夜帝虚影:挂在施放者节点下(跟着走、跟施放者一起排序),画在主角身后;普通层出轮廓细节 + 加色发光层出「虚影的光」。
   * spine = 施放者的骨骼节点(位置 / 缩放照抄再 × ghostScale);k = 像素偏移换算(野外 1)。
   */
  spawnGhost(actor: Node, spine: Node | null, premultipliedAlpha: boolean, facing: number, leadMs: number, durMs: number, k = 1): void {
    const cfg = realmUltCfg();
    if (!this.ghost || !spine || !spine.isValid || !actor.isValid) {
      return;
    }
    const scale = cfg.ghostScale;
    const holder = this.host.addChildPlainNode(actor, 'RealmUltGhost', -facing * cfg.ghostAt.x * k, (cfg.ghostAt.y - 30) * k, 10, 10);
    holder.setSiblingIndex(0);
    // 翅膀(骨骼没有翅膀部件):左右两片贴图画在虚影身后,翼根每帧贴到虚影胸口骨上
    const wings = this.mountWings(holder, spine, scale, leadMs, cfg, k);
    const layers: Array<{ data: sp.SkeletonData; alpha: number; tint: [number, number, number] }> = [{ data: this.ghost, alpha: cfg.ghostAlpha, tint: cfg.tint }];
    if (this.glow) {
      layers.push({ data: this.glow, alpha: cfg.glowAlpha, tint: cfg.glowTint });
    }
    const c = cfg.clip;
    let follow: { skeleton: sp.Skeleton; skNode: Node } | null = null;
    layers.forEach((layer, i) => {
      const node = this.host.addChildPlainNode(holder, i === 0 ? 'Spine' : 'Glow', spine.position.x, spine.position.y, 10, 10);
      node.setScale(spine.scale.x * scale, spine.scale.y * scale, 1);
      const skeleton = node.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = premultipliedAlpha;
      try {
        skeleton.skeletonData = layer.data;
        const runtime = resolveBattleUnitSpineRuntimeData(layer.data);
        const skin = runtime ? resolveBattleUnitSpineSkinName(layer.data, runtime) : null;
        if (skin) {
          skeleton.setSkin(skin);
        }
        const entry = skeleton.setAnimation(0, c.anim, false);
        if (entry) {
          entry.animationStart = c.start;
          entry.animationEnd = c.end;
          entry.animationLast = -1;
        }
        skeleton.timeScale = 0;
        setTimeout(() => {
          if (skeleton.isValid) {
            skeleton.timeScale = c.speed;
          }
        }, leadMs);
        skeleton.color = rgba(layer.tint[0], layer.tint[1], layer.tint[2], 255);
        node.addComponent(UIOpacity).opacity = layer.alpha;
        if (!follow) {
          follow = { skeleton, skNode: node };
        }
      } catch (error) {
        void error;
        node.destroy();
      }
    });
    const followed = follow as { skeleton: sp.Skeleton; skNode: Node } | null;
    if (wings && followed) {
      this.wings.push({ wings, skeleton: followed.skeleton, skNode: followed.skNode, root: cfg.wingRoot, turn: cfg.wingTurn });
    }
    const op = holder.addComponent(UIOpacity);
    op.opacity = 0;
    tween(holder).by(leadMs / 1000, { position: new Vec3(0, 30 * k, 0) }, { easing: 'quadOut' }).start();
    tween(op).to(leadMs / 1000, { opacity: 255 }, { easing: 'quadOut' })
      .delay(durMs / 1000)
      .to(0.4, { opacity: 0 }, { easing: 'quadIn' })
      .call(() => holder.isValid && holder.destroy()).start();
  }

  /** 每帧调用:翅膀贴背(读虚影 chest 骨的世界坐标 / 角度(骨架空间),换算到虚影节点空间)。 */
  step(): void {
    if (this.wings.length === 0) {
      return;
    }
    this.wings = this.wings.filter((item) => item.wings.isValid && item.skeleton.isValid && item.skNode.isValid);
    for (const item of this.wings) {
      const bone = item.skeleton.findBone('chest');
      if (!bone) {
        continue;
      }
      const r = bone.getWorldRotationX();
      const rad = (r * Math.PI) / 180;
      const bx = bone.worldX + Math.cos(rad) * item.root.x - Math.sin(rad) * item.root.y;
      const by = bone.worldY + Math.sin(rad) * item.root.x + Math.cos(rad) * item.root.y;
      const sk = item.skNode;
      item.wings.setPosition(sk.position.x + bx * sk.scale.x, sk.position.y + by * sk.scale.y, 0);
      // 转角以「躯干竖直」(chest 指向正上 = 90°)为基准:后仰翅膀跟着后仰、前倾跟着前倾(不用第一帧当基准:那一帧动作还没套上)
      item.wings.angle = (r - 90) * item.turn * (sk.scale.x < 0 ? -1 : 1);
    }
  }

  /** 夜帝的翅膀:翼根对准虚影背部,蓄势时从收拢展开、之后慢扇;每片叠一层加色混合(翼膜透光)。 */
  private mountWings(holder: Node, spine: Node, k: number, leadMs: number, cfg: RealmUltCfg, px: number): Node {
    // 初始位置先按胸口大致高度放(第一帧 step 就贴到骨头上)
    const root = this.host.addChildPlainNode(holder, 'Wings', spine.position.x, spine.position.y + 440 * spine.scale.y * k, 10, 10);
    root.setSiblingIndex(0);
    const w = cfg.wingW * k * px;
    const h = w * (500 / 384);
    ([[cfg.wingL, 1, -1], [cfg.wingR, 0, 1]] as Array<[string, number, number]>).forEach(([path, ax, side]) => {
      // side:-1 = 画面左片(翼根在右下)、1 = 右片;朝左时整对镜像(左右互换无所谓,对称)
      const wing = this.host.addChildPlainNode(root, side < 0 ? 'WingL' : 'WingR', 0, 0, w, h);
      wing.getComponent(UITransform)?.setAnchorPoint(ax, 0.43);
      const art = this.sprite(wing, 'Art', path, w, h);
      if (!art) {
        wing.destroy();
        return;
      }
      art.node.getComponent(UITransform)?.setAnchorPoint(ax, 0.43);
      art.node.addComponent(UIOpacity).opacity = cfg.wingAlpha;
      const glow = this.sprite(wing, 'Glow', path, w, h);
      if (glow) {
        glow.node.getComponent(UITransform)?.setAnchorPoint(ax, 0.43);
        glow.color = rgba(220, 180, 255, cfg.wingGlowAlpha);
        const blend = glow as unknown as { _srcBlendFactor: number; _dstBlendFactor: number; _updateBlendFunc: () => void };
        blend._srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend._dstBlendFactor = gfx.BlendFactor.ONE;
        blend._updateBlendFunc();
      }
      // 收拢(翼尖朝上贴背)→ 展开 → 慢扇
      const open = 0;
      wing.angle = -side * cfg.wingFold;
      wing.setScale(0.7, 0.7, 1);
      tween(wing).to(leadMs / 1000, { angle: open, scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .then(tween(wing).repeatForever(tween(wing).to(0.35, { angle: side * cfg.wingFlap }, { easing: 'sineInOut' }).to(0.35, { angle: open }, { easing: 'sineInOut' })))
        .start();
    });
    return root;
  }

  /** 宿主 addSprite 只认缓存;没缓存就直接用 resources 里已加载的帧(prewarm 已发起加载),都没有返回 null。 */
  private sprite(parent: Node, name: string, path: string, w: number, h: number): Sprite | null {
    const sprite = this.host.addSprite(name, path, 0, 0, w, h, parent);
    if (sprite) {
      return sprite;
    }
    const frame = resources.get(path, SpriteFrame);
    if (!frame) {
      return null;
    }
    const node = this.host.addChildPlainNode(parent, name, 0, 0, w, h);
    const made = node.addComponent(Sprite);
    made.sizeMode = Sprite.SizeMode.CUSTOM;
    made.spriteFrame = frame;
    node.getComponent(UITransform)?.setContentSize(w, h);
    return made;
  }
}
