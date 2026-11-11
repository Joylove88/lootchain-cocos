import { sp } from 'cc';
import { HTML5 } from 'cc/env';
import { resourcePathOf } from './SpineTextureMips';

/**
 * 英雄骨骼自带特效里「不画」的贴图(2026-11-11 战斗画面精致化 · 样片 07,用户选方案 A)。
 *
 * 异界神州这批英雄的骨骼里自带普攻 / 技能特效,守卫战、野外每次出手都会播。个别贴图是不透明的实心色块,
 * 放到战场上会把人整个盖住:甘宁「聚气」里白色、淡紫色两张实心圆盘(tx/jq_2、tx/jq_3),每次出手约 0.1 秒。
 * 19 位逐个巡检过(tools/qa/hero_attack_whiteout_steps.py),目前只有甘宁这一处。
 *
 * 做法:骨骼数据第一次建出来时(SkeletonData.getRuntimeData 首次调用)把登记的附件从皮肤里删掉;
 * 动画切到这些附件时取到空,那几帧不画,同一条插槽上的其它帧(小光点、细光圈、闪电)照常。
 * - 挂在 getRuntimeData 上而不是各个界面里:守卫战、野外、英雄详情、名册、抽卡都各自取这份数据,只有这里是必经之路,
 *   而且一定早于任何骨骼实例——删附件会释放附件对象,已有实例若正引用着它会悬空
 *   (同 BattleFxSlotFilter.prepareBattleFxData 的约束)。重复调用无害:已经删过就找不到可删的。
 * - 只在网页端做:原生端的骨骼数据是另一套绑定(没有这组接口),没验证过,不动。
 */
const HIDDEN_ATTACHMENTS: ReadonlyArray<{ path: string; attachments: readonly string[] }> = [
  { path: 'spine/hero/sz_ganning/sz_ganning', attachments: ['tx/jq_2', 'tx/jq_3'] },
];

type RuntimeSkinEntry = { slotIndex: number; name?: string; attachment?: { name?: string } | null };
type RuntimeSkin = {
  getAttachments?: () => RuntimeSkinEntry[];
  removeAttachment?: (slotIndex: number, name: string) => void;
};
type RuntimeSkeletonData = { skins?: ArrayLike<RuntimeSkin | null> | null; defaultSkin?: RuntimeSkin | null };

let installed = false;

/** 已经处理过的骨骼数据资源(每个资源对象只处理一次)。 */
const handled = new WeakSet<object>();

function trimHeroFx(data: sp.SkeletonData, runtime: RuntimeSkeletonData): void {
  const path = resourcePathOf(data.uuid);
  if (!path) {
    return;
  }
  const rule = HIDDEN_ATTACHMENTS.find((entry) => entry.path === path);
  if (!rule) {
    return;
  }
  const skins: Array<RuntimeSkin | null> = [];
  const listed = runtime.skins;
  if (listed && listed.length > 0) {
    for (let i = 0; i < listed.length; i += 1) {
      skins.push(listed[i]);
    }
  } else if (runtime.defaultSkin) {
    skins.push(runtime.defaultSkin);
  }
  for (const skin of skins) {
    if (!skin || typeof skin.getAttachments !== 'function' || typeof skin.removeAttachment !== 'function') {
      continue;
    }
    // 先把要删的 (插槽, 名字) 抄出来再删:删除会让后面的条目失效
    const doomed: Array<{ slotIndex: number; key: string }> = [];
    for (const entry of skin.getAttachments()) {
      const key = entry.name ?? '';
      const name = entry.attachment?.name ?? key;
      if (key && (rule.attachments.indexOf(name) >= 0 || rule.attachments.indexOf(key) >= 0)) {
        doomed.push({ slotIndex: entry.slotIndex, key });
      }
    }
    for (const entry of doomed) {
      skin.removeAttachment(entry.slotIndex, entry.key);
    }
  }
}

/** 启动时调用一次(在任何骨骼数据建出来之前)。 */
export function installSpineHeroFxTrim(): void {
  if (installed || !HTML5) {
    return;
  }
  const proto = sp.SkeletonData.prototype as unknown as { getRuntimeData?: (this: sp.SkeletonData, quiet?: boolean) => unknown };
  const original = proto.getRuntimeData;
  if (typeof original !== 'function') {
    console.warn('[LootChain] spine hero fx trim skipped: engine internals changed');
    return;
  }
  installed = true;
  proto.getRuntimeData = function getRuntimeData(this: sp.SkeletonData, quiet?: boolean): unknown {
    // 只在这份数据第一次建出来的那一刻处理(此时还没有任何骨骼实例用到它):
    // 调用前引擎的缓存字段已经有值 = 数据早就建好了(可能已有实例在用),不碰;每个资源对象只处理一次。
    const self = this as unknown as { _skeletonCache?: unknown };
    const builtBefore = '_skeletonCache' in self && !!self._skeletonCache;
    const runtime = original.call(this, quiet);
    if (runtime && !builtBefore && !handled.has(this)) {
      handled.add(this);
      try {
        trimHeroFx(this, runtime as RuntimeSkeletonData);
      } catch (error) {
        console.warn('[LootChain] spine hero fx trim failed', this.name, error);
      }
    }
    return runtime;
  };
}
