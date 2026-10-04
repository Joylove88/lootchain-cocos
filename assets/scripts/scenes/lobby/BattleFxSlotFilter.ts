import { _decorator, Component, Director, director, sp } from 'cc';

const { ccclass } = _decorator;

/**
 * 整段演出类大招(2026-10-05 新批次 hu_*)的插槽过滤:
 * 这批素材是别的游戏里"角色 + 满屏演出"一体的骨骼,战场里只要特效本身——
 * - 角色本体部件(图集根目录、bz / buzhen / zhu 目录下的附件)一律不画;
 * - 压暗黑底、满屏底色、镜头遮罩(BATTLE_FX_HIDDEN_SLOTS 逐套登记的插槽)不画,否则战场上会盖一块黑矩形。
 * 动画每帧都会把附件 / 颜色重新写回去,而骨骼动画是在 SkeletonSystem.postUpdate 里推进的(晚于组件 lateUpdate),
 * 所以挂在 Director.EVENT_BEFORE_DRAW(实测 EVENT_AFTER_UPDATE 仍早于动画推进;这里是动画推进之后、渲染之前)逐帧把这些插槽的颜色与透明度清零。
 */
const BODY_FOLDER = /^(bz\d*|buzhen|zhu)$/i;

/** 压暗底 / 白底贴图(各套通用命名):不管混合模式一律不画。 */
const BACKDROP_REGION = /(^|\/)(hei|baidi)$/i;

function isBodyAttachment(name: string): boolean {
  if (BACKDROP_REGION.test(name)) {
    return true;
  }
  const cut = name.indexOf('/');
  return cut < 0 || BODY_FOLDER.test(name.slice(0, cut));
}

type RawSlot = { data?: { name?: string }; color?: { r: number; g: number; b: number; a: number }; getAttachment?: () => { name?: string } | null };

/** effect → 逐插槽分类(下标同骨骼 slots):0 未知(附件一直为空)/ 1 保留 / 2 隐藏。同一套特效的多个实例共用。 */
const slotClassCache = new Map<string, Int8Array>();

@ccclass('BattleFxSlotFilter')
export class BattleFxSlotFilter extends Component {
  private skeleton: sp.Skeleton | null = null;
  private classes: Int8Array | null = null;
  private hiddenNames: ReadonlySet<string> | null = null;
  /** 登记名以 * 结尾 = 前缀匹配(同一组序列帧插槽 xxx1 / xxx2 …)。 */
  private hiddenPrefixes: string[] = [];

  /** skeleton 已 setAnimation 之后调用;当帧立即生效一次。 */
  setup(skeleton: sp.Skeleton, effect: string, hiddenSlots: readonly string[]): void {
    this.skeleton = skeleton;
    this.hiddenNames = new Set(hiddenSlots.filter((name) => !name.endsWith('*')));
    this.hiddenPrefixes = hiddenSlots.filter((name) => name.endsWith('*')).map((name) => name.slice(0, -1));
    this.classes = slotClassCache.get(effect) ?? null;
    if (!this.classes) {
      const count = this.rawSlots()?.length ?? 0;
      this.classes = new Int8Array(count);
      slotClassCache.set(effect, this.classes);
    }
    this.apply();
  }

  protected onEnable(): void {
    director.on(Director.EVENT_BEFORE_DRAW, this.apply, this);
  }

  protected onDisable(): void {
    director.off(Director.EVENT_BEFORE_DRAW, this.apply, this);
  }

  private rawSlots(): RawSlot[] | null {
    const raw = (this.skeleton as unknown as { _skeleton?: { slots?: RawSlot[] } } | null)?._skeleton;
    return raw?.slots ?? null;
  }

  private apply(): void {
    const classes = this.classes;
    if (!classes || !this.skeleton || !this.skeleton.isValid) {
      return;
    }
    try {
      const slots = this.rawSlots();
      if (!slots) {
        return;
      }
      const count = Math.min(slots.length, classes.length);
      for (let i = 0; i < count; i += 1) {
        const slot = slots[i];
        let kind = classes[i];
        if (kind === 0) {
          const slotName = slot.data?.name ?? '';
          if (this.hiddenNames?.has(slotName) || this.hiddenPrefixes.some((prefix) => slotName.startsWith(prefix))) {
            kind = 2;
          } else {
            const attachment = slot.getAttachment?.();
            if (!attachment) {
              continue;
            }
            kind = isBodyAttachment(attachment.name ?? '') ? 2 : 1;
          }
          classes[i] = kind;
        }
        if (kind === 2 && slot.color) {
          // 颜色也清零:正片叠底 / 滤色混合的插槽只把透明度压到 0 仍会提亮或染色底图
          slot.color.r = 0;
          slot.color.g = 0;
          slot.color.b = 0;
          slot.color.a = 0;
        }
      }
    } catch (error) {
      // 骨骼已销毁 / 绑定对象失效:本帧跳过
      void error;
    }
  }
}
