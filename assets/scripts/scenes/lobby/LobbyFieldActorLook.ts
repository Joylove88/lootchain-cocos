import { EffectAsset, game, Material, resources, sp, sys, Vec4 } from 'cc';

/**
 * 野外队伍(主角 + 随行英雄)可读性(2026-11-26 用户:「主角和随行英雄跟写实背景混在一起,看不出谁是谁,边缘发糊」)。
 * 诊断(tools/qa/field_actor_read.py,手机 2400×1080 同帧):贴图密度是屏幕的 1.6~7 倍(不是分辨率问题),
 * 人物与背景的亮度对比只有 0.08~0.14、人物比草地还灰(饱和 0.29~0.51 vs 0.47~0.54)、轮廓梯度和背景纹理差不多 → 轮廓被吃掉。
 * 做法 = effects/world-actor 多 pass 材质:整个人的外轮廓一圈细暗边 + 受光侧(左上)一道淡亮边 + 本体略提饱和 / 对比。
 * 只在人物外轮廓上出线(本体最后画、盖住剪影内部),人和人之间也被暗边分开。?actorlook=0 关掉做对比。
 */
export interface ActorLookDef {
  /** 暗边宽度(CSS 像素,按画布实际像素比换算成帧缓冲像素)。 */
  width: number;
  /** 暗边颜色 rgba(0~1)。 */
  outline: [number, number, number, number];
  /** 受光侧亮边 rgba(a = 强度,0 = 不要)。 */
  rim: [number, number, number, number];
  /** 亮边宽度 = 暗边 × rimW。 */
  rimW: number;
  /** 本体颜色:饱和度倍率 / 对比度倍率 / 提亮。 */
  pop: [number, number, number];
  /** 不再给队伍套地图的 actorTint(林地 236,242,226 会把人压灰)。 */
  clearTint: boolean;
}

const DEFAULT_LOOK: ActorLookDef = {
  width: 1.2,
  outline: [0.04, 0.035, 0.03, 0.8],
  rim: [1.0, 0.94, 0.8, 0.32],
  rimW: 1.0,
  pop: [1.12, 1.06, 0.04],
  clearTint: true,
};

/** 每张图的微调(不写 = 默认)。 */
const MAP_LOOKS: Record<string, Partial<ActorLookDef>> = {};

const EFFECT = 'effects/world-actor';
const RIM_PASS = 4;

let effect: EffectAsset | null = null;
let loading = false;
const waiting: Array<() => void> = [];

function queryOff(): boolean {
  try {
    const search = typeof window !== 'undefined' ? window.location?.search ?? '' : '';
    return /[?&]actorlook=0\b/.test(search);
  } catch {
    return false;
  }
}

/** 不开的地图:主城(月色整城有自己的人物偏色,用户这次只说野外)。 */
const SKIP_MAPS = new Set(['CITY']);

/** 原生包先不开(多 pass 骨骼材质在原生没验过)。 */
export function fieldActorLookEnabled(mapCode?: string): boolean {
  return !sys.isNative && !queryOff() && !(mapCode && SKIP_MAPS.has(mapCode));
}

export function fieldActorLook(mapCode: string | undefined): ActorLookDef {
  return { ...DEFAULT_LOOK, ...(mapCode ? MAP_LOOKS[mapCode] ?? {} : {}) };
}

function withEffect(done: () => void): void {
  if (effect) {
    done();
    return;
  }
  const cached = resources.get(EFFECT, EffectAsset);
  if (cached) {
    effect = cached;
    done();
    return;
  }
  waiting.push(done);
  if (loading) {
    return;
  }
  loading = true;
  resources.load(EFFECT, EffectAsset, (error, asset) => {
    loading = false;
    effect = error ? null : asset;
    if (error) {
      console.warn('[FieldActorLook] effect load failed', error);
    }
    const list = waiting.splice(0);
    if (effect) {
      list.forEach((fn) => fn());
    }
  });
}

/** 画布帧缓冲像素 / CSS 像素(DPR 封顶后的实际值)。 */
function framebufferPerCss(): number {
  const canvas = game.canvas as HTMLCanvasElement | null;
  const css = canvas?.clientWidth || 0;
  return canvas && css > 0 ? Math.max(1, canvas.width / css) : 1;
}

/** 给一副队伍骨骼套可读性材质(异步:材质没加载完时加载后再套;骨骼已销毁则跳过)。 */
export function applyFieldActorLook(skeleton: sp.Skeleton, mapCode: string | undefined): void {
  if (!fieldActorLookEnabled(mapCode)) {
    return;
  }
  withEffect(() => {
    if (!skeleton.isValid || !effect) {
      return;
    }
    const look = fieldActorLook(mapCode);
    const mat = new Material();
    mat.initialize({ effectAsset: effect });
    const o = look.outline;
    const r = look.rim;
    mat.setProperty('olStyle', new Vec4(look.width * framebufferPerCss(), 0.35, 0.7, 1));
    mat.setProperty('olColor', new Vec4(o[0], o[1], o[2], o[3]));
    mat.setProperty('rimColor', new Vec4(r[0], r[1], r[2], r[3]));
    mat.setProperty('olDir', new Vec4(-0.8, 0.6, 1, look.rimW), RIM_PASS);
    mat.setProperty('popParams', new Vec4(look.pop[0], look.pop[1], look.pop[2], 0));
    skeleton.customMaterial = mat;
    skeleton.markForUpdateRenderData(true);
  });
}
